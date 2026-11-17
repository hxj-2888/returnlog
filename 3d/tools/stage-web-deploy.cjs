#!/usr/bin/env node
/* Godot Web 导出物的 Pages 拆分器（3D 部署流水线用 · 只读写本地文件，不联网）。
 *
 * 为什么需要它：Cloudflare Pages 的**单文件 25 MiB 上限**是硬限制（发布包里的文件
 * 本身要 ≤25 MiB，gzip/br 绕不过去）。2026-11-12 实跑导出：`index.pck` 132,031,372 B、
 * `index.wasm` 37,686,550 B 双双超限，其余 7 个文件全 < 320 KB。
 * 超限的两个改放 R2（无此上限、出口流量不计费），Pages 侧生成一个 `_worker.js`
 * 按**原 URL** 从 R2 流式回源，浏览器仍然请求同源的 `/index.pck`，Godot 的加载代码不用改。
 *
 * 做的事：
 *   1. 扫 --dir，把 > --limit-mib（默认 24，给 25 留余量）的文件搬进 --stage，
 *      键 = `gen/<内容 sha256 前 16 位>/<文件名>`；
 *   2. 写 --manifest，CI 照它逐条 `wrangler r2 object put`；
 *   3. 在 --dir 里生成 `_worker.js`，把 URL → R2 键的映射内联进去。
 *
 * 键里带内容哈希是为了缓存正确性：URL（`/index.pck`）永远不变，若键也不变，
 * `immutable` 缓存会把旧包一直喂给回访玩家。内容寻址后新构建自动换键，
 * 内容没变时又能复用同一个键（省一次重复上传）。
 *
 * 用法：node 3d/tools/stage-web-deploy.cjs [--dir build/web] [--limit-mib 24] [--dry-run]
 * 退出码：0 = 拆分完成；1 = 目录不存在 / 有文件超过 wrangler 单次 PUT 上限。
 */
'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = path.resolve(__dirname, '../..');

// wrangler `r2 object put --file` 的单次上传上限（Cloudflare R2 文档：315 MB）。
const WRANGLER_PUT_LIMIT = 315 * 1024 * 1024;

const CONTENT_TYPE = {
  '.pck': 'application/octet-stream',
  '.wasm': 'application/wasm',
  '.js': 'text/javascript',
  '.json': 'application/json',
};

function argv(name, dflt) {
  const i = process.argv.indexOf('--' + name);
  if (i < 0) return dflt;
  const next = process.argv[i + 1];
  return next && !next.startsWith('--') ? next : true;
}

function walk(dir) {
  const out = [];
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) out.push(...walk(p));
    else out.push(p);
  }
  return out;
}

function sha256short(file) {
  return new Promise((resolve, reject) => {
    const h = crypto.createHash('sha256');
    const s = fs.createReadStream(file);
    s.on('error', reject);
    s.on('data', (c) => h.update(c));
    s.on('end', () => resolve(h.digest('hex').slice(0, 16)));
  });
}

// 工具搬走的文件不进 Pages 包，`_worker.js` 里的映射必须与之一致，所以由同一处生成。
const WORKER = `/* 由 3d/tools/stage-web-deploy.cjs 生成，勿手改。
 * Pages 单文件上限 25 MiB，超限的构建产物改存 R2；这里把原 URL 请求流式回源到 R2。
 * 键带内容哈希，故可 long-lived immutable。*/
const FILES = __FILES__;

export default {
  async fetch(request, env) {
    const f = FILES[new URL(request.url).pathname];
    if (!f) return env.ASSETS.fetch(request);
    if (!env.ASSETS_R2) return new Response('R2 binding missing', { status: 500 });
    const obj = await env.ASSETS_R2.get(f.key);
    if (!obj) return new Response('build expired', { status: 410 });
    const headers = new Headers();
    obj.writeHttpMetadata(headers);
    headers.set('etag', obj.httpEtag);
    headers.set('content-length', String(obj.size));
    headers.set('cache-control', 'public, max-age=31536000, immutable');
    const body = request.method === 'HEAD' ? null : obj.body;
    return new Response(body, { status: 200, headers });
  },
};
`;

(async () => {
  const rel = (p) => path.relative(ROOT, p).split(path.sep).join('/');
  const dir = path.resolve(ROOT, String(argv('dir', 'build/web')));
  const stage = path.resolve(ROOT, String(argv('stage', 'build/r2-stage')));
  const manifest = path.resolve(ROOT, String(argv('manifest', 'build/r2-manifest.json')));
  const limitMib = Number(argv('limit-mib', 24));
  const dryRun = argv('dry-run', false) === true;
  const limit = Math.round(limitMib * 1024 * 1024);

  if (!fs.existsSync(dir)) {
    console.error(`STAGE FAIL 找不到导出目录 ${rel(dir)}（先在 Godot 里导出 Web，或在 CI 里跑 export）`);
    process.exit(1);
  }

  const all = walk(dir).filter((f) => path.basename(f) !== '_worker.js');
  const oversized = [];
  const kept = [];
  for (const f of all) {
    const st = fs.statSync(f);
    if (st.size > limit) oversized.push({ file: f, size: st.size });
    else kept.push({ file: f, size: st.size });
  }

  const tooBig = oversized.filter((x) => x.size > WRANGLER_PUT_LIMIT);
  if (tooBig.length) {
    for (const x of tooBig) {
      console.error(`STAGE FAIL ${rel(x.file)} = ${(x.size / 1048576).toFixed(1)} MiB，超过 wrangler 单次 PUT 上限 315 MiB，需要走分片上传或压资源`);
    }
    process.exit(1);
  }

  const entries = [];
  for (const x of oversized) {
    const digest = await sha256short(x.file);
    const name = path.basename(x.file);
    const key = `gen/${digest}/${name}`;
    const urlPath = '/' + path.relative(dir, x.file).split(path.sep).join('/');
    const dest = path.join(stage, key);
    entries.push({
      url: urlPath,
      key,
      size: x.size,
      content_type: CONTENT_TYPE[path.extname(name).toLowerCase()] || 'application/octet-stream',
      source: rel(x.file),
      staged: rel(dest),
    });
    if (!dryRun) {
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      try {
        fs.renameSync(x.file, dest);
      } catch (e) {
        if (e.code !== 'EXDEV') throw e;
        fs.copyFileSync(x.file, dest);
        fs.unlinkSync(x.file);
      }
    }
  }

  if (!dryRun) {
    const map = {};
    for (const e of entries) map[e.url] = { key: e.key, size: e.size };
    fs.writeFileSync(path.join(dir, '_worker.js'), WORKER.replace('__FILES__', JSON.stringify(map, null, 2)));
    fs.mkdirSync(path.dirname(manifest), { recursive: true });
    fs.writeFileSync(manifest, JSON.stringify({ generated_by: '3d/tools/stage-web-deploy.cjs', limit_mib: limitMib, files: entries }, null, 2) + '\n');
  }

  const MiB = (n) => (n / 1048576).toFixed(1) + ' MiB';
  for (const e of entries) console.log(`STAGE 搬出 ${e.source} ${MiB(e.size)} → R2 ${e.key}`);
  console.log(`STAGE OK ${dryRun ? '（--dry-run 未改动磁盘）' : ''}拆分 ${entries.length} 个 >${limitMib} MiB 文件进 Pages 之外的 R2，Pages 侧保留 ${kept.length} 个静态文件（最大 ${kept.length ? MiB(Math.max(...kept.map((k) => k.size))) : '0'}）`);
  if (!dryRun) console.log(`STAGE OK manifest=${rel(manifest)} worker=${rel(path.join(dir, '_worker.js'))}`);
})().catch((e) => {
  console.error('STAGE FAIL ' + (e && e.stack ? e.stack : e));
  process.exit(1);
});
