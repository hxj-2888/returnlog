/* 3D 移植清单校验：node 3d/tools/check-port-manifest.cjs
 * ------------------------------------------------------------------
 * 目的：把“移植准备”变成可校验的事实，而不是一张会过期的 PPT。
 *
 * 它检查四件事：
 *   ① js/ 下每个文件都被清单认领，且行覆盖 100%（game.js 按切片，minigame.js 按数据/玩法拆开）；
 *   ② status=ported/partial 的系统，至少有一个真实存在的 target（planned:/excluded:/reference: 不算）；
 *   ③ depends_on 的 id 都存在，且没有循环依赖；
 *   ④ data/*.json 契约文件存在、schema_version 与清单一致；generator 文件存在。
 *
 * 只读，不修任何文件；失败退出码 1。用法：
 *   node 3d/tools/check-port-manifest.cjs
 *   node 3d/tools/check-port-manifest.cjs --quiet   # 只打汇总
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const MANIFEST = path.join(__dirname, '..', 'spec', 'port-manifest.json');
const QUIET = process.argv.includes('--quiet');

const STATUS = new Set(['ported', 'partial', 'prepared', 'reference', 'excluded', 'deferred']);
const TRACK = new Set(['core', 'speech']);
const GROUP = new Set(['data', 'spatial', 'sim', 'ai', 'social', 'view', 'ui', 'entry', 'audio', 'test', 'asset']);
const errors = [];
const warnings = [];

function err(msg) { errors.push(msg); }
function warn(msg) { warnings.push(msg); }
function rel(p) { return p.split(path.sep).join('/'); }
function abs(p) { return path.join(ROOT, p); }
function exists(p) { return fs.existsSync(abs(p)); }
function isDir(p) { try { return fs.statSync(abs(p)).isDirectory(); } catch { return false; } }
function lineCount(p) {
  const text = fs.readFileSync(abs(p), 'utf8');
  return text.split(/\r?\n/).length - (text.endsWith('\n') ? 1 : 0);
}
function walk(dir, out = []) {
  for (const name of fs.readdirSync(dir)) {
    const p = path.join(dir, name);
    const st = fs.statSync(p);
    if (st.isDirectory()) walk(p, out);
    else out.push(rel(path.relative(ROOT, p)));
  }
  return out;
}
function targetBase(t) {
  return String(t).split('#')[0];
}
function isIgnoredTarget(t) {
  return /^(planned|excluded|reference):/.test(String(t));
}

const manifest = JSON.parse(fs.readFileSync(MANIFEST, 'utf8'));
if (manifest.schema_version !== 1) err('清单 schema_version 不是 1：' + manifest.schema_version);
if (!Array.isArray(manifest.systems) || manifest.systems.length === 0) err('清单缺 systems');
if (!manifest.scope || !manifest.scope.art || !manifest.scope.speech) err('清单缺 scope.art / scope.speech 口径');

/* ---------- ① 系统字段与依赖 ---------- */
const byId = new Map();
const owner = new Map(); // 文件行 → 系统 id，用来抓重复认领
const fileCover = new Map(); // 文件 → Uint8Array

function ensureCover(file, total) {
  if (!fileCover.has(file)) fileCover.set(file, new Uint8Array(total + 1));
  return fileCover.get(file);
}

for (const sys of manifest.systems) {
  if (!sys.id || byId.has(sys.id)) err('系统 id 缺失或重复：' + sys.id);
  byId.set(sys.id, sys);
  if (!STATUS.has(sys.status)) err(`${sys.id}: 非法 status ${sys.status}`);
  if (!TRACK.has(sys.track)) err(`${sys.id}: 非法 track ${sys.track}`);
  if (!GROUP.has(sys.group)) err(`${sys.id}: 非法 group ${sys.group}`);
  if (!Array.isArray(sys.target) || sys.target.length === 0) err(`${sys.id}: 缺 target`);
  if (!Array.isArray(sys.source)) err(`${sys.id}: 缺 source 数组`);

  for (const src of sys.source || []) {
    if (!src.file) { err(`${sys.id}: source 缺 file`); continue; }
    if (!exists(src.file)) { err(`${sys.id}: source 不存在 ${src.file}`); continue; }
    if (!src.lines) {
      if (isDir(src.file)) continue; // 目录（美术/音频）不做行覆盖
      if (!src.file.endsWith('.js')) continue;
      const n = lineCount(src.file);
      const cov = ensureCover(src.file, n);
      for (let i = 1; i <= n; i++) {
        if (cov[i]) err(`${sys.id}: 与 ${owner.get(src.file + ':' + i)} 重复认领 ${src.file}:${i}`);
        cov[i] = 1;
        owner.set(src.file + ':' + i, sys.id);
      }
      continue;
    }
    const [a, b] = src.lines;
    const n = lineCount(src.file);
    if (!(a >= 1 && b >= a && b <= n)) {
      err(`${sys.id}: 行段越界 ${src.file}:${a}-${b}（文件 ${n} 行）`);
      continue;
    }
    const cov = ensureCover(src.file, n);
    for (let i = a; i <= b; i++) {
      if (cov[i]) err(`${sys.id}: 与 ${owner.get(src.file + ':' + i)} 重复认领 ${src.file}:${i}`);
      cov[i] = 1;
      owner.set(src.file + ':' + i, sys.id);
    }
  }

  /* ported/partial 必须至少有一个已经存在的 target；planned 不算 */
  if (sys.status === 'ported' || sys.status === 'partial') {
    const real = (sys.target || []).filter(t => !isIgnoredTarget(t));
    if (real.length === 0) {
      err(`${sys.id}: status=${sys.status} 但 target 全是 planned/excluded/reference`);
    } else {
      const ok = real.some(t => exists(targetBase(t)));
      if (!ok) err(`${sys.id}: status=${sys.status} 但 target 都不存在：${real.join(', ')}`);
    }
  }
}

/* ---------- ② js 文件覆盖率 ---------- */
const jsFiles = walk(path.join(ROOT, 'js')).filter(f => f.endsWith('.js'));
let jsTotal = 0;
for (const f of jsFiles) {
  const n = lineCount(f);
  jsTotal += n;
  const cov = fileCover.get(f);
  if (!cov) { err(`js 文件未被清单认领：${f}`); continue; }
  let miss = 0;
  let first = -1;
  for (let i = 1; i <= n; i++) {
    if (!cov[i]) { miss++; if (first < 0) first = i; }
  }
  if (miss > 0) err(`${f}: 有 ${miss} 行未被认领（首行 ${first}）`);
}

/* ---------- ③ 依赖 ---------- */
for (const sys of manifest.systems) {
  for (const dep of sys.depends_on || []) {
    if (!byId.has(dep)) err(`${sys.id}: depends_on 指向不存在的系统 ${dep}`);
  }
}
const visiting = new Set();
const visited = new Set();
function dfs(id, stack) {
  if (visited.has(id)) return;
  if (visiting.has(id)) {
    err('依赖成环：' + stack.concat(id).join(' → '));
    return;
  }
  visiting.add(id);
  const sys = byId.get(id);
  for (const dep of (sys && sys.depends_on) || []) {
    if (byId.has(dep)) dfs(dep, stack.concat(id));
  }
  visiting.delete(id);
  visited.add(id);
}
for (const sys of manifest.systems) dfs(sys.id, []);

/* ---------- ④ 数据契约 ---------- */
let stableContracts = 0;
let legacyContracts = 0;
for (const c of manifest.contracts || []) {
  if (!exists(c.file)) { err(`契约文件不存在：${c.file}`); continue; }
  if (!exists(c.generator)) warn(`契约 ${c.file} 的 generator 不存在：${c.generator}`);
  let parsed;
  try { parsed = JSON.parse(fs.readFileSync(abs(c.file), 'utf8')); }
  catch (e) { err(`契约 ${c.file} 不是合法 JSON：${e.message}`); continue; }
  const actual = parsed.schema_version == null ? null : parsed.schema_version;
  if (c.status === 'stable') {
    stableContracts++;
    if (actual == null) err(`契约 ${c.file} 缺 schema_version（status=stable）`);
    else if (actual !== c.schema_version) err(`契约 ${c.file} schema_version ${actual} ≠ 清单 ${c.schema_version}`);
  } else if (c.status === 'legacy-no-schema') {
    legacyContracts++;
    warn(`契约 ${c.file} 无 schema_version（legacy，待补）`);
  } else {
    err(`契约 ${c.file} 非法 status：${c.status}`);
  }
}

/* ---------- 汇总 ---------- */
const stats = {};
for (const sys of manifest.systems) stats[sys.status] = (stats[sys.status] || 0) + 1;
const groups = {};
for (const sys of manifest.systems) groups[sys.group] = (groups[sys.group] || 0) + 1;

const prepared = manifest.systems
  .filter(s => s.status === 'prepared')
  .map(s => {
    let lines = 0;
    for (const src of s.source || []) {
      if (src.lines) lines += src.lines[1] - src.lines[0] + 1;
      else if (src.file.endsWith('.js')) lines += lineCount(src.file);
    }
    return { id: s.id, name: s.name, lines, track: s.track };
  })
  .sort((a, b) => b.lines - a.lines);

console.log('PORT-MANIFEST ' + (errors.length ? 'FAIL' : 'OK'));
console.log(`  系统 ${manifest.systems.length} / 分组 ${Object.keys(groups).length} / js ${jsFiles.length} 文件 ${jsTotal} 行`);
console.log('  状态 ' + Object.entries(stats).map(([k, v]) => `${k} ${v}`).join(' / '));
console.log(`  契约 ${stableContracts + legacyContracts}（stable ${stableContracts} / legacy ${legacyContracts}）`);

if (!QUIET) {
  console.log('  待移植（prepared，按源行数排序）：');
  prepared.slice(0, 8).forEach((s, i) => {
    console.log(`    ${i + 1}. ${s.id} ${s.lines} 行 · ${s.name}${s.track === 'speech' ? '（S 轨）' : ''}`);
  });
  if (prepared.length > 8) console.log(`    … 其余 ${prepared.length - 8} 项`);
}

for (const w of warnings) console.log('  WARN ' + w);
for (const e of errors) console.log('  ERR  ' + e);

if (errors.length) {
  console.log(`\n结果：${errors.length} 错误 / ${warnings.length} 警告`);
  process.exit(1);
}
console.log(`\n结果：0 错误 / ${warnings.length} 警告`);
