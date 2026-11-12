#!/usr/bin/env node
/* 发布资产解耦：打包 / 注入 / 校验（2026-11-12）
 *
 * 背景：GitHub 仓库只放核心代码，运行时贴图与音频不再入库；部署时由资产包注入工作区。
 * 白名单真源 tools/deploy-config.cjs，与 deploy-pages.cjs / asset-guard.cjs 共用，
 * 避免「仓库已排除、部署白名单却没排除」的规则漂移（docs/ASSET_GOVERNANCE.md §3 / §7）。
 *
 * 用法：
 *   node tools/publish-assets.cjs bundle --out <path.tar.gz>
 *   node tools/publish-assets.cjs fetch  --from <url|本地路径> [--token <token>]
 *   node tools/publish-assets.cjs verify [--github-output] [--strict]
 *
 * bundle：把 ENTRIES 里的 assets/ 与 audio/ 运行时文件打成 tar.gz，
 *         同时把期望清单写入 tools/publish-assets.json（入库，作为校验真源）。
 * fetch ：从 URL 或本地文件取资产包，校验归档内路径后解压到工作区根，
 *         再按归档内清单逐文件核对 SHA256 与体积。
 * verify：检查发布资产是否齐全；--github-output 时写 ready=true|false 到 GITHUB_OUTPUT。
 *
 * 设计约束：
 *   ① 只处理 assets/ 与 audio/，代码 / 文档 / index.html 永远由 git 仓库提供；
 *   ② 归档内路径必须是 assets/ 或 audio/ 下的相对路径，防止路径穿越；
 *   ③ 校验失败不静默跳过，由 CI 决定「跳过部署」而不是上传一个缺图的游戏。
 */
'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const { spawnSync } = require('child_process');
const { ENTRIES, SKIP } = require('./deploy-config.cjs');

/* RETURNLOG_ROOT 只用于本地演练注入到临时目录，CI 与正常使用不设置 */
const ROOT = process.env.RETURNLOG_ROOT ? path.resolve(process.env.RETURNLOG_ROOT) : path.resolve(__dirname, '..');
const REPO_MANIFEST = path.join(__dirname, 'publish-assets.json');
const ARCHIVE_MANIFEST = '.publish-assets.sha256.json';
const ASSET_DIRS = /^(assets|audio)\//;
/* 缺图时最容易静默上线的几张，清单缺失时用作兜底判据 */
const KEY_FILES = [
  'assets/scene/v4/base-lit.png',
  'assets/scene/v4/hull-deck.png',
  'assets/scene/v4/tex/door-panel.png',
  'js/config/version.js',
  'index.html',
];

function rel(p) { return p.split(path.sep).join('/'); }
function sha256(p) { return crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex'); }
function arg(name) {
  const i = process.argv.indexOf(name);
  return i >= 0 && i + 1 < process.argv.length ? process.argv[i + 1] : '';
}
function has(name) { return process.argv.includes(name); }

function collect() {
  const out = [];
  const walk = (r) => {
    const p = path.join(ROOT, r);
    if (!fs.existsSync(p)) return;
    const st = fs.statSync(p);
    if (st.isDirectory()) {
      for (const n of fs.readdirSync(p)) walk(r + '/' + n);
      return;
    }
    const norm = rel(r);
    if (SKIP.some((re) => re.test(norm))) return;
    if (!ASSET_DIRS.test(norm)) return;
    if (/\.md$/i.test(norm)) return;
    out.push(norm);
  };
  for (const e of ENTRIES) walk(e);
  return out.sort();
}

function buildManifest(files) {
  const entries = {};
  let total = 0;
  for (const r of files) {
    const p = path.join(ROOT, r);
    const size = fs.statSync(p).size;
    entries[r] = { sha256: sha256(p), size };
    total += size;
  }
  return {
    schema_version: 1,
    generated: new Date().toISOString().slice(0, 10),
    source: 'tools/publish-assets.cjs bundle',
    file_count: files.length,
    total_bytes: total,
    files: entries,
  };
}

function tar(args, opts) {
  const r = spawnSync('tar', args, Object.assign({ stdio: 'inherit' }, opts || {}));
  if (r.error || r.status !== 0) {
    throw new Error('tar 执行失败：' + (r.error ? r.error.message : '退出码 ' + r.status));
  }
  return r;
}

/* ---------------- bundle ---------------- */
function bundle() {
  const out = arg('--out');
  if (!out) { console.error('bundle 需要 --out <path.tar.gz>'); process.exit(2); }
  const files = collect();
  if (!files.length) { console.error('bundle 失败：工作区没有任何运行时资产可打包'); process.exit(1); }
  const manifest = buildManifest(files);
  const stage = fs.mkdtempSync(path.join(os.tmpdir(), 'returnlog-assets-'));
  const list = [];
  for (const r of files) {
    const dst = path.join(stage, r);
    fs.mkdirSync(path.dirname(dst), { recursive: true });
    fs.copyFileSync(path.join(ROOT, r), dst);
    list.push(r);
  }
  fs.writeFileSync(path.join(stage, ARCHIVE_MANIFEST), JSON.stringify(manifest, null, 2) + '\n', 'utf8');
  list.push(ARCHIVE_MANIFEST);
  const listFile = path.join(stage, '.filelist');
  fs.writeFileSync(listFile, list.join('\n') + '\n', 'utf8');
  const outAbs = path.resolve(out);
  const outDir = path.dirname(outAbs);
  fs.mkdirSync(outDir, { recursive: true });
  /* -f 只给文件名 + cwd：GNU tar 会把 C:/... 解析成远程主机 */
  tar(['-czf', path.basename(outAbs), '-C', stage.replace(/\\/g, '/'),
    '-T', listFile.replace(/\\/g, '/')], { cwd: outDir });
  fs.writeFileSync(REPO_MANIFEST, JSON.stringify(manifest, null, 2) + '\n', 'utf8');
  console.log('[assets] 打包 ' + files.length + ' 个文件 · '
    + (manifest.total_bytes / 1048576).toFixed(2) + ' MB → ' + path.resolve(out));
  console.log('[assets] 期望清单已写入 ' + rel(path.relative(ROOT, REPO_MANIFEST)) + '（需入库）');
}

/* ---------------- fetch ---------------- */
async function download(from, token) {
  if (!/^https?:\/\//i.test(from)) {
    if (!fs.existsSync(from)) throw new Error('资产包不存在：' + from);
    const tmp = path.join(os.tmpdir(), 'returnlog-assets-' + process.pid + '.tar.gz');
    fs.copyFileSync(from, tmp);
    return tmp;
  }
  const headers = {};
  if (token) headers.Authorization = 'Bearer ' + token;
  const res = await fetch(from, { headers });
  if (!res.ok) throw new Error('下载资产包失败：HTTP ' + res.status + ' ' + res.statusText);
  const buf = Buffer.from(await res.arrayBuffer());
  const tmp = path.join(os.tmpdir(), 'returnlog-assets-' + process.pid + '.tar.gz');
  fs.writeFileSync(tmp, buf);
  return tmp;
}

async function fetchAssets() {
  const from = arg('--from');
  if (!from) { console.error('fetch 需要 --from <url|本地路径>'); process.exit(2); }
  const token = arg('--token') || process.env.PUBLISH_ASSETS_TOKEN || '';
  const archive = await download(from, token);

  const archiveDir = path.dirname(archive);
  const archiveName = path.basename(archive);
  const at = (extra) => Object.assign({ cwd: archiveDir }, extra);
  const listed = spawnSync('tar', ['-tzf', archiveName], at({ encoding: 'utf8' }));
  if (listed.status !== 0) throw new Error('资产包不是有效 tar.gz');
  const entries = listed.stdout.split('\n').map((s) => s.trim()).filter(Boolean);
  const illegal = entries.filter((e) => e !== ARCHIVE_MANIFEST && !ASSET_DIRS.test(e));
  if (illegal.length) throw new Error('资产包含非白名单路径，拒绝解压：' + illegal.slice(0, 5).join(', '));

  const got = spawnSync('tar', ['-xzOf', archiveName, ARCHIVE_MANIFEST], at({ encoding: 'utf8' }));
  if (got.status !== 0) throw new Error('资产包缺少清单 ' + ARCHIVE_MANIFEST);
  const manifest = JSON.parse(got.stdout);

  tar(['-xzf', archiveName, '-C', ROOT.replace(/\\/g, '/'), '--exclude', ARCHIVE_MANIFEST], at({}));

  const bad = [];
  for (const [r, meta] of Object.entries(manifest.files)) {
    const p = path.join(ROOT, r);
    if (!fs.existsSync(p)) { bad.push('缺失 ' + r); continue; }
    if (fs.statSync(p).size !== meta.size || sha256(p) !== meta.sha256) bad.push('哈希不符 ' + r);
  }
  try { fs.unlinkSync(archive); } catch (_) { /* 临时文件，忽略 */ }
  if (bad.length) {
    console.error('[assets] 注入校验失败 ' + bad.length + ' 项：');
    bad.slice(0, 20).forEach((x) => console.error('  ' + x));
    process.exit(1);
  }
  console.log('[assets] 注入完成 ' + manifest.file_count + ' 个文件 · '
    + (manifest.total_bytes / 1048576).toFixed(2) + ' MB · SHA256 全量一致');
}

/* ---------------- verify ---------------- */
function verify() {
  const problems = [];
  let mode = '关键文件 + 数量兜底';
  if (fs.existsSync(REPO_MANIFEST)) {
    mode = 'tools/publish-assets.json 全量清单';
    const m = JSON.parse(fs.readFileSync(REPO_MANIFEST, 'utf8'));
    let missing = 0, changed = 0, bytes = 0;
    for (const [r, meta] of Object.entries(m.files)) {
      const p = path.join(ROOT, r);
      if (!fs.existsSync(p)) { missing++; if (problems.length < 20) problems.push('缺失 ' + r); continue; }
      bytes += fs.statSync(p).size;
      if (sha256(p) !== meta.sha256) { changed++; if (problems.length < 20) problems.push('内容变化 ' + r); }
    }
    console.log('[assets] 清单校验：' + m.file_count + ' 项 / 缺 ' + missing + ' / 变化 ' + changed
      + ' / ' + (bytes / 1048576).toFixed(2) + ' MB');
    if (missing || changed) problems.push('资产清单不完整或已被改动，请重新 bundle 或注入资产包');
  } else {
    for (const k of KEY_FILES) if (!fs.existsSync(path.join(ROOT, k))) problems.push('关键文件缺失 ' + k);
    const imgs = fs.existsSync(path.join(ROOT, 'assets'))
      ? collect().filter((r) => /\.(png|jpe?g|webp)$/i.test(r)).length : 0;
    console.log('[assets] 兜底校验：关键文件 ' + KEY_FILES.length + ' 项 / 位图 ' + imgs + ' 张');
    if (imgs < 200) problems.push('位图仅 ' + imgs + ' 张（期望 ≥200），疑似贴图未注入');
  }
  const ready = problems.length === 0;
  console.log('[assets] 判据：' + mode);
  problems.forEach((x) => console.log('  ! ' + x));
  console.log('[assets] ready=' + ready);
  const ghOut = process.env.GITHUB_OUTPUT;
  if (has('--github-output') && ghOut) fs.appendFileSync(ghOut, 'ready=' + ready + '\n', 'utf8');
  if (!ready && has('--strict')) process.exit(1);
}

const cmd = process.argv[2];
if (cmd === 'bundle') bundle();
else if (cmd === 'fetch') fetchAssets().catch((e) => { console.error('[assets] ' + e.message); process.exit(1); });
else if (cmd === 'verify') verify();
else {
  console.error('用法：node tools/publish-assets.cjs <bundle|fetch|verify> [参数]');
  process.exit(2);
}
