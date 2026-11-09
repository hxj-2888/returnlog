#!/usr/bin/env node
/* 2.5D 只读基线：刷新 / 完整性校验（本工程自有工具，不是 2.5D 基线的一部分）
 *
 * 用法：
 *   node tools/sync-baseline.cjs                       # 从默认上游刷新基线 + 重建哈希清单
 *   node tools/sync-baseline.cjs --check              # 离线校验基线未被本地篡改（不写盘）
 *   node tools/sync-baseline.cjs --rebuild            # 只按当前磁盘重建清单（不连上游，仅允许缩范围）
 *   node tools/sync-baseline.cjs --source <上游路径>   # 指定上游
 *   RETURNLOG_25D_ROOT=<上游路径> node tools/sync-baseline.cjs --check
 *
 * 设计约束（见 BASELINE.md / AGENTS.md §五.2）：
 *   ① 基线只读，本脚本是唯一刷新入口；
 *   ② 只覆盖内容不同的文件，不删除本工程里多出来的文件；
 *   ③ package.json 只同步 version / gameVersion 两个上游标识，其余字段（脚本清单等）不动；
 *   ④ --check 完全离线，不写任何文件。
 */
'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = path.resolve(__dirname, '..');
const DEFAULT_SOURCE = 'C:\\Users\\ASUS\\Desktop\\新返航录';
const MANIFEST = path.join(ROOT, 'BASELINE.sha256.json');
const PKG = path.join(ROOT, 'package.json');

const argv = process.argv.slice(2);
const CHECK = argv.includes('--check');
const REBUILD = argv.includes('--rebuild');
const si = argv.indexOf('--source');
if (si >= 0 && !argv[si + 1]) {
  console.error('--source 缺少路径参数');
  process.exit(1);
}
const SOURCE = path.resolve(si >= 0 ? argv[si + 1] : (process.env.RETURNLOG_25D_ROOT || DEFAULT_SOURCE));

/* 基线目录：与 SPLIT.md §3 一致。
 * 2026-11-09 用户裁定：`docs/` 移出基线。2.5D 时代的调研 / 交接 / 审查文档已清理，
 * 只保留 `docs/qwen21/` 千问出图留档（gen-art-refs.ps1 的留档目标），
 * 那是本工程的资料而不是可对账基线，不再参与哈希校验。 */
const DIRS = ['js', 'assets', 'audio', 'tools'];
/* 根级对账文件：3d/spec/port-manifest.json 把 index.html 登记为 source（X-ENTRY），
 * 缺了它会让 3d:port:check 多报一条 ERR。只作只读对账对象，不是 3D 入口。 */
const FILES = ['index.html'];
/* 一次性产物 / 本机缓存，不进基线 */
const SKIP_DIR = new Set([
  '_bak', 'screenshots', '_crew_raw', '_sfx', '_hires-preview', 'logs',
  '__pycache__', 'node_modules', '.git', '.wrangler'
]);
/* 本工程自有文件，不算基线 */
const OWN_FILES = new Set(['tools/sync-baseline.cjs', 'tools/check-all.cjs']);

function skipFile(name) {
  return /\.log$|\.err$|\.pyc$/i.test(name)
    || /^_(shot|zoom|gate-|mc-|diag|interact|overlay|hires-|sdxl-|qwen-rooms-)/i.test(name)
    || /^_.*\.cjs$/i.test(name)
    || /^_.*\.md$/i.test(name);
}

function rel(p) { return p.split(path.sep).join('/'); }

function walk(absDir, baseRel, out) {
  if (!fs.existsSync(absDir)) return out;
  for (const name of fs.readdirSync(absDir)) {
    const p = path.join(absDir, name);
    let st;
    try { st = fs.statSync(p); } catch { continue; }
    if (st.isDirectory()) {
      if (SKIP_DIR.has(name)) continue;
      walk(p, baseRel, out);
    } else if (st.isFile()) {
      if (skipFile(name)) continue;
      const r = rel(path.relative(baseRel, p));
      if (OWN_FILES.has(r)) continue;
      out.push(r);
    }
  }
  return out;
}

function listUnder(root) {
  const out = [];
  for (const d of DIRS) walk(path.join(root, d), root, out);
  for (const f of FILES) {
    if (fs.existsSync(path.join(root, f)) && !OWN_FILES.has(f)) out.push(f);
  }
  return out.sort();
}

function sha256(p) {
  return crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
}

function today() {
  const d = new Date();
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0')
    + '-' + String(d.getDate()).padStart(2, '0');
}

function readBaselineVersion(pkgPath) {
  const p = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
  return { version: p.version, gameVersion: p.gameVersion };
}

function buildManifest(base) {
  const files = {};
  for (const r of listUnder(ROOT)) {
    const p = path.join(ROOT, r);
    files[r] = { sha256: sha256(p), size: fs.statSync(p).size };
  }
  return {
    schema_version: 1,
    generated: today(),
    source: SOURCE,
    baseline: base,
    file_count: Object.keys(files).length,
    files
  };
}

/* ---------------- 只缩范围重建 ----------------
 * 用途：基线范围调整（如 2026-11-09 把 docs/ 移出基线）后重建清单。
 * 与 sync 的区别：不连上游、不复制任何文件，只允许「少文件」，不允许「改内容」。
 * 守卫：在新旧清单里都存在的文件，哈希必须一致；任一漂移即失败退出，
 *       避免用「重建」把本地手改悄悄洗白。
 */
if (REBUILD) {
  if (!fs.existsSync(MANIFEST)) {
    console.error('BASELINE FAIL 找不到 BASELINE.sha256.json —— 无法做增量重建');
    process.exit(1);
  }
  const old = JSON.parse(fs.readFileSync(MANIFEST, 'utf8'));
  const files = {};
  const changed = [];
  for (const r of listUnder(ROOT)) {
    const p = path.join(ROOT, r);
    const sha = sha256(p);
    if (old.files[r] && old.files[r].sha256 !== sha) changed.push(r);
    files[r] = { sha256: sha, size: fs.statSync(p).size };
  }
  if (changed.length) {
    console.error(`BASELINE FAIL 保留范围内有 ${changed.length} 个文件被改动，拒绝重建：`);
    changed.slice(0, 20).forEach(x => console.error('  被改动 ' + x));
    console.error('  先还原这些文件；确属上游变更请走 baseline:sync。');
    process.exit(1);
  }
  const kept = Object.keys(files).filter(r => old.files[r]).length;
  const dropped = Object.keys(old.files).filter(r => !(r in files));
  const manifest = {
    schema_version: old.schema_version || 1,
    generated: today(),
    source: old.source,
    baseline: old.baseline,
    file_count: Object.keys(files).length,
    files
  };
  fs.writeFileSync(MANIFEST, JSON.stringify(manifest, null, 2) + '\n', 'utf8');
  console.log('BASELINE REBUILD 仅按当前磁盘重建清单（未连上游、未复制文件）');
  console.log(`  保留 ${kept} 个 / 移出 ${dropped.length} 个；清单 ${manifest.file_count} 个文件`);
  const byTop = {};
  dropped.forEach(r => { const t = r.split('/')[0]; byTop[t] = (byTop[t] || 0) + 1; });
  Object.entries(byTop).forEach(([t, n]) => console.log(`  移出 ${t}/ ${n} 个`));
  process.exit(0);
}

/* ---------------- 离线校验 ---------------- */
if (CHECK) {
  if (!fs.existsSync(MANIFEST)) {
    console.error('BASELINE FAIL 找不到 BASELINE.sha256.json —— 先跑 npm run baseline:sync');
    process.exit(1);
  }
  const m = JSON.parse(fs.readFileSync(MANIFEST, 'utf8'));
  const bad = [];
  for (const [r, meta] of Object.entries(m.files)) {
    const p = path.join(ROOT, r);
    if (!fs.existsSync(p)) { bad.push(`缺失 ${r}`); continue; }
    if (sha256(p) !== meta.sha256) bad.push(`被改动 ${r}`);
  }
  const pkg = JSON.parse(fs.readFileSync(PKG, 'utf8'));
  if (pkg.version !== m.baseline.version || pkg.gameVersion !== m.baseline.gameVersion) {
    bad.push(`package.json 上游标识漂移：${pkg.gameVersion}/${pkg.version} ≠ ${m.baseline.gameVersion}/${m.baseline.version}`);
  }
  if (fs.existsSync(path.join(SOURCE, 'package.json'))) {
    const upstream = readBaselineVersion(path.join(SOURCE, 'package.json'));
    if (upstream.version !== m.baseline.version || upstream.gameVersion !== m.baseline.gameVersion) {
      console.log(`  提示：上游版本已变为 ${upstream.gameVersion}/${upstream.version}，需要 npm run baseline:sync`);
    }
  }
  if (bad.length) {
    console.error(`BASELINE FAIL ${bad.length} 项不一致：`);
    bad.slice(0, 20).forEach(x => console.error('  ' + x));
    if (bad.length > 20) console.error(`  …… 另有 ${bad.length - 20} 项`);
    process.exit(1);
  }
  console.log(`BASELINE OK ${m.file_count} 个文件 · 快照 ${m.generated} · 基线 ${m.baseline.gameVersion}/${m.baseline.version}`);
  process.exit(0);
}

/* ---------------- 刷新 ---------------- */
if (!fs.existsSync(SOURCE)) {
  console.error(`BASELINE FAIL 上游路径不存在：${SOURCE}（用 --source 指定，或设 RETURNLOG_25D_ROOT）`);
  process.exit(1);
}
const upstreamPkg = path.join(SOURCE, 'package.json');
if (!fs.existsSync(upstreamPkg)) {
  console.error(`BASELINE FAIL 上游缺少 package.json：${upstreamPkg}`);
  process.exit(1);
}
const base = readBaselineVersion(upstreamPkg);

let copied = 0, same = 0;
for (const r of listUnder(SOURCE)) {
  const src = path.join(SOURCE, r);
  const dst = path.join(ROOT, r);
  let need = !fs.existsSync(dst);
  if (!need && sha256(src) !== sha256(dst)) need = true;
  if (!need) { same++; continue; }
  fs.mkdirSync(path.dirname(dst), { recursive: true });
  fs.copyFileSync(src, dst);
  copied++;
}

/* 只同步两个上游标识字段，其余字段与顺序保持原样 */
const pkgText = fs.readFileSync(PKG, 'utf8');
const pkg = JSON.parse(pkgText);
let pkgChanged = false;
if (pkg.version !== base.version || pkg.gameVersion !== base.gameVersion) {
  pkg.version = base.version;
  pkg.gameVersion = base.gameVersion;
  pkgChanged = true;
}
if (pkg['x-baseline']) {
  if (pkg['x-baseline'].source !== SOURCE) { pkg['x-baseline'].source = SOURCE; pkgChanged = true; }
  if (pkg['x-baseline'].captured !== today()) { pkg['x-baseline'].captured = today(); pkgChanged = true; }
}
if (pkgChanged) fs.writeFileSync(PKG, JSON.stringify(pkg, null, 2) + '\n', 'utf8');

const manifest = buildManifest(base);
fs.writeFileSync(MANIFEST, JSON.stringify(manifest, null, 2) + '\n', 'utf8');

console.log(`BASELINE SYNC 上游 ${SOURCE}`);
console.log(`  文件 ${copied} 个已更新 / ${same} 个内容相同跳过；清单 ${manifest.file_count} 个文件`);
console.log(`  上游标识 ${base.gameVersion} / ${base.version}（package.json ${pkgChanged ? '已更新' : '无变化'}）`);
console.log(`  清单 BASELINE.sha256.json 已重建（${manifest.generated}）`);
