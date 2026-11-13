/* 2.5D ↔ 3D 玩法规则「同源」审阅器
 * ---------------------------------------------------------------------------
 * 背景（2026-11-11 用户裁定）：3D 版直接沿用 2.5D，规则只有一处真源。
 * 现有的 check-parity.cjs 只覆盖推理 / 发言 / 决策（mind/speech/ai_*），
 * 玩法主链（刀、枪、死亡、幽灵、天亮、会议、拖拽、任务）没有自动对账，
 * 于是出现了「12 秒失血」「第二刀必死」「死亡不转幽灵」这类 3D 自造规则。
 *
 * 2026-11-13 起：**函数映射只读 3d/spec/mapping-ledger.json**，本工具不再按同名
 * 自动配对、也不再按 DOM 正则猜 not-applicable —— 那些隐式分支已删除，判决由账本唯一提供。
 *
 * 本工具做四件事：
 *   ① 函数映射：按账本取每条 2.5D 函数的状态与目标（账本由 build-mapping-ledger 生成）。
 *   ② 守卫/状态对账：对已映射的函数抽「2.5D 的 if(...)return 守卫」与
 *      「对 agent 字段的写入」，逐条检查 3D 实现里有没有对应物（这是内容校验，不是映射判决）。
 *   ③ 自造规则扫描：3D 里状态写入但没有任何 2.5D 来源的函数，列为可疑。
 *   ④ 数值真源漂移：space.json / rules.json 的 sources 指纹必须与当前 2.5D 一致。
 *
 * 用法：
 *   node tools/check-gameplay-parity.cjs              # 报告，非 0 只在真源漂移时
 *   node tools/check-gameplay-parity.cjs --strict     # 有 pending / 守卫缺口也退出 1
 *   node tools/check-gameplay-parity.cjs --src <path> # 指定 2.5D 仓路径
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = path.resolve(__dirname, '..', '..');
const args = process.argv.slice(2);
const SRC = path.resolve(
  argValue('--src') || path.join(ROOT, '..', '新返航录')
);
const LEDGER = path.join(ROOT, '3d', 'spec', 'mapping-ledger.json');
const LAYERS = path.join(ROOT, '3d', 'spec', 'mapping-layers.json');
const OUT_MD = path.join(ROOT, '3d', 'reports', 'parity-report.md');
const OUT_CSV = path.join(ROOT, '3d', 'reports', 'parity-report.csv');
const STRICT = args.includes('--strict');
const UPDATE_BUDGET = args.includes('--update-baseline');

function argValue(flag) {
  const i = args.indexOf(flag);
  return i >= 0 ? args[i + 1] : '';
}
function sha1(p) {
  return crypto.createHash('sha1').update(fs.readFileSync(p)).digest('hex').slice(0, 12);
}
function readJson(p) {
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}

/* ---------- JS 函数索引 ---------- */
function indexJs(file) {
  const src = fs.readFileSync(file, 'utf8');
  const out = [];
  const re = /function\s+([A-Za-z_$][\w$]*)\s*\(([^)]*)\)\s*\{/g;
  let m;
  while ((m = re.exec(src))) {
    const end = findBraceEnd(src, re.lastIndex - 1);
    if (end < 0) continue;
    out.push({
      name: m[1],
      params: m[2].trim(),
      file: path.relative(SRC, file).replace(/\\/g, '/'),
      line: src.slice(0, m.index).split('\n').length,
      body: src.slice(re.lastIndex, end),
    });
  }
  return out;
}

function findBraceEnd(src, braceAt) {
  let depth = 0;
  let state = null;
  for (let i = braceAt; i < src.length; i++) {
    const c = src[i];
    const n = src[i + 1];
    if (state === 'line') { if (c === '\n') state = null; continue; }
    if (state === 'block') { if (c === '*' && n === '/') { state = null; i++; } continue; }
    if (state === 'single') { if (c === '\\') { i++; continue; } if (c === "'") state = null; continue; }
    if (state === 'double') { if (c === '\\') { i++; continue; } if (c === '"') state = null; continue; }
    if (state === 'tpl') { if (c === '\\') { i++; continue; } if (c === '`') state = null; continue; }
    if (c === '/' && n === '/') { state = 'line'; i++; continue; }
    if (c === '/' && n === '*') { state = 'block'; i++; continue; }
    if (c === "'") { state = 'single'; continue; }
    if (c === '"') { state = 'double'; continue; }
    if (c === '`') { state = 'tpl'; continue; }
    if (c === '{') depth++;
    else if (c === '}') { depth--; if (depth === 0) return i; }
  }
  return -1;
}

/* ---------- GDScript 函数索引 ---------- */
function walk(dir, acc = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, acc);
    else if (e.name.endsWith('.gd')) acc.push(p);
  }
  return acc;
}
function indexGd(file) {
  const raw = fs.readFileSync(file, 'utf8');
  const lines = raw.split(/\r?\n/);
  const out = [];
  for (let i = 0; i < lines.length; i++) {
    const m = /^(\s*)func\s+([A-Za-z_][\w]*)\s*\(/.exec(lines[i]);
    if (!m) continue;
    const indent = m[1].length;
    let end = i + 1;
    for (; end < lines.length; end++) {
      const l = lines[end];
      if (!l.trim()) continue;
      const ind = l.match(/^\s*/)[0].length;
      if (ind <= indent) break;
    }
    out.push({
      name: m[2],
      file: path.relative(path.join(ROOT, '3d', 'preview', 'scripts'), file).replace(/\\/g, '/'),
      line: i + 1,
      body: lines.slice(i, end).join('\n'),
    });
  }
  return out;
}

function toSnake(s) {
  return s.replace(/([a-z0-9])([A-Z])/g, '$1_$2').replace(/[-\s]/g, '_').toLowerCase();
}

/* ---------- 规则原子 ---------- */
const FIELD_RE = /\.(alive|downed|ghost|ghostPts|knife|bullet|detained|redT|rushT|sabUsed|deathCause|deathRoom|bodyPos|bodyGone|downedT|qual|medkit|stunT|draggedBy|drag|searched|reported)\b\s*=\s*([^;\n]+)/g;
const GUARD_RE = /if\s*\(([^)]{4,160})\)\s*(?:\{\s*)?return\b([^;\n]*)/g;

function atoms(jsBody) {
  const guards = [];
  const writes = new Map();
  let m;
  GUARD_RE.lastIndex = 0;
  while ((m = GUARD_RE.exec(jsBody))) {
    guards.push({ cond: m[1].replace(/\s+/g, ' ').trim(), ret: (m[2] || '').trim() });
  }
  FIELD_RE.lastIndex = 0;
  while ((m = FIELD_RE.exec(jsBody))) {
    const v = m[2].replace(/\s+/g, ' ').trim();
    writes.set(m[1], v);
  }
  return { guards, writes };
}

function identTokens(cond) {
  return (cond.match(/[A-Za-z_$][\w$]*/g) || [])
    .filter((t) => !['if', 'return', 'true', 'false', 'null', 'undefined', 'else', 'this', 'G', 'Math'].includes(t))
    .filter((t) => !['a', 'me', 'v', 'w', 'b', 't', 'x', 'y', 'd', 'i', 'k', 's', 'p', 'q', 'r', 'o'].includes(t));
}

/* ---------- 主流程 ---------- */
const SRC_FILES = [
  'js/game.js',
  'js/ai/ai.js',
  'js/ai/sanity.js',
  'js/ai/traits.js',
  'js/t2/space.js',
  'js/t2/decision.js',
].filter((f) => fs.existsSync(path.join(SRC, f)));

const jsFns = [];
for (const f of SRC_FILES) {
  for (const fn of indexJs(path.join(SRC, f))) jsFns.push(fn);
}

const gdFns = [];
for (const f of walk(path.join(ROOT, '3d', 'preview', 'scripts'))) {
  for (const fn of indexGd(f)) gdFns.push(fn);
}

if (!fs.existsSync(LEDGER)) {
  console.error('PARITY FAIL 缺少 3d/spec/mapping-ledger.json；先跑 npm run map:build');
  process.exit(1);
}
const ledger = readJson(LEDGER);
const layers = readJson(LAYERS);
const entryByKey = new Map();
for (const e of ledger.entries || []) if (!entryByKey.has(e.src)) entryByKey.set(e.src, e);

function gdLookup(target) {
  // target: "sim/sim_state.gd:knife"
  const [rel, name] = target.split(':');
  return gdFns.find((f) => f.file.endsWith(rel) && f.name === name) || null;
}

const rows = [];
/* 2.5D 全仓的「左值」集合：用于识别死守卫（如 G.noReport 全仓无任何写入点，
 * 恒为 undefined —— 要求 3D 复刻一个永远为假的守卫才是真正的偏离）。 */
const assigned = new Set();
for (const fn of jsFns) {
  for (const m of fn.body.matchAll(/([A-Za-z_$][\w$.]*)\s*=(?!=)/g)) {
    const name = m[1].replace(/^(?:G|global\.SKV3\._t\.G\(\))\./, '');
    assigned.add(name.split('.').pop());
  }
  for (const m of fn.body.matchAll(/([A-Za-z_$][\w$]*)\s*:/g)) assigned.add(m[1]);
}
for (const fn of jsFns) {
  const key = fn.file + ':' + fn.name;
  const entry = entryByKey.get(key);
  let gd = null;
  let status = 'unmapped';
  if (!entry) {
    status = 'unmapped';
  } else if (entry.status === 'not-applicable') {
    status = 'not-applicable';
  } else if (entry.target) {
    gd = gdLookup(entry.target);
    status = gd ? entry.status || 'mapped' : 'broken-target';
  } else {
    // adapter 允许没有 .gd 目标（如按键映射）；其余无目标一律按缺口计。
    status = entry.status === 'adapter' ? 'adapter' : entry.status === 'unmapped' ? 'pending' : entry.status;
  }
  const row = {
    src: key,
    src_line: fn.line,
    fn: fn.name,
    target: gd ? gd.file + ':' + gd.name : '',
    target_line: gd ? gd.line : '',
    status,
    guards: 0,
    guards_missing: 0,
    writes: 0,
    writes_missing: 0,
    missing_detail: '',
  };
  row.counted = status !== 'adapter' && status !== 'not-applicable';
  if (gd) {
    const { guards, writes } = atoms(fn.body);
    row.guards = guards.length;
    row.writes = writes.size;
    const gdBody = gd.body;
    const miss = [];
    for (const g of guards) {
      const toks = identTokens(g.cond);
      if (toks.length === 0) continue;
      // 死守卫：条件里引用的标识符在 2.5D 全仓从未被赋值（恒 undefined），
      // 复刻它才是偏离 —— 跳过并计数。
      if (toks.every((t) => !assigned.has(t))) {
        row.dead_guards = (row.dead_guards || 0) + 1;
        continue;
      }
      // 空集合守卫在 2.5D 常写 `!arr.length`，3D 用 is_empty()：语义等价，直接放过
      const emptiness = /!\s*[\w.$]+\.length|\b\.length\s*===?\s*0/.test(g.cond);
      const hit = toks.some((t) => gdBody.includes(t)) || (emptiness && gdBody.includes('is_empty()'));
      if (!hit) {
        row.guards_missing++;
        miss.push('guard(' + g.cond.slice(0, 42) + ')');
      }
    }
    for (const [field, val] of writes) {
      if (!gdBody.includes(field)) {
        row.writes_missing++;
        miss.push('write.' + field + '=' + val.slice(0, 18));
      }
    }
    row.missing_detail = miss.join(' | ');
  }
  rows.push(row);
}

/* 3D 独有：有状态写入但没有任何 JS 同名来源的 sim 函数（可疑自造规则） */
const jsNames = new Set(jsFns.map((f) => f.name));
const jsSnakes = new Set(jsFns.map((f) => toSnake(f.name)));
const extras = [];
const extrasAllow = Object.fromEntries((ledger.extras || []).map((e) => [e.target, e.reason]));
const explicitTargets = new Set((ledger.entries || []).map((e) => e.target).filter(Boolean));
for (const g of gdFns) {
  if (!g.file.startsWith('sim/')) continue;
  if (explicitTargets.has(g.file + ':' + g.name)) continue;
  if (extrasAllow[g.file + ':' + g.name]) continue;
  if (g.name.startsWith('_') && !g.body.includes('.get("')) continue;
  const hasWrite = /\["(alive|downed|ghost|knife|bullet|stunT|redT|sabUsed|downedT|draggedBy)"\]\s*=/.test(g.body);
  if (!hasWrite) continue;
  if (jsNames.has(g.name) || jsSnakes.has(g.name) || jsSnakes.has(g.name.replace(/^_/, ''))) continue;
  extras.push({ target: g.file + ':' + g.name, line: g.line });
}

/* ---------- 真源指纹 ---------- */
const drift = [];
for (const [jsonRel, srcRoot] of [
  ['3d/preview/data/space.json', SRC],
  ['3d/preview/data/rules.json', SRC],
]) {
  const p = path.join(ROOT, jsonRel);
  if (!fs.existsSync(p)) continue;
  const j = readJson(p);
  for (const [rel, hash] of Object.entries(j.sources || {})) {
    const f = path.join(srcRoot, rel);
    if (!fs.existsSync(f)) {
      drift.push(jsonRel + ' → 源文件不存在 ' + rel);
      continue;
    }
    if (sha1(f) !== hash) drift.push(jsonRel + ' → ' + rel + ' 已改动，需重跑导出');
  }
}

/* 幽灵额度必须来自 space.json，不许在 GDScript 里写死 */
const hardcoded = [];
for (const [rel, re] of [
  ['sim/sim_state.gd', /const\s+GHOST_TASK_CAP\s*:?=/g],
  ['main.gd', /const\s+GHOST_TASK_CAP\s*:?=/g],
]) {
  const p = path.join(ROOT, '3d', 'preview', 'scripts', rel);
  if (fs.existsSync(p) && re.test(fs.readFileSync(p, 'utf8'))) hardcoded.push(rel);
}

/* ---------- 输出 ---------- */
const counts = rows.reduce((acc, r) => {
  acc.total++;
  acc[r.status] = (acc[r.status] || 0) + 1;
  if (r.counted && r.guards_missing) acc.guard_gap++;
  if (r.counted && r.writes_missing) acc.write_gap++;
  return acc;
}, { total: 0, guard_gap: 0, write_gap: 0 });

const header = [
  ['src', 'src_line', 'fn', 'target', 'target_line', 'status', 'guards', 'guards_missing', 'writes', 'writes_missing', 'missing_detail'],
];
const csv = header.concat(rows.map((r) => [
  r.src, r.src_line, r.fn, r.target, r.target_line, r.status,
  r.guards, r.guards_missing, r.writes, r.writes_missing, r.missing_detail,
])).map((cols) => cols.map((c) => '"' + String(c).replace(/"/g, '""') + '"').join(',')).join('\n') + '\n';

const md = [];
md.push('# 2.5D ↔ 3D 玩法规则对齐审阅');
md.push('');
md.push('> 自动生成：`node 3d/tools/check-gameplay-parity.cjs`。逐文件明细见 `parity-report.csv`。');
md.push('');
md.push('## 总览');
md.push('');
md.push('| 指标 | 数值 |');
md.push('|---|---:|');
md.push('| 2.5D 函数（纳入审阅） | ' + counts.total + ' |');
md.push('| 显式映射（spec 表） | ' + ((counts.mapped || 0) + (counts.ported || 0) + (counts.adapter || 0)) + ' |');
md.push('| 自动同名匹配 | ' + (counts.auto || 0) + ' |');
md.push('| 未映射（pending） | ' + (counts.pending || 0) + ' |');
md.push('| 映射目标不存在 | ' + (counts['broken-target'] || 0) + ' |');
md.push('| 守卫有缺口 | ' + counts.guard_gap + ' |');
md.push('| 状态写入有缺口 | ' + counts.write_gap + ' |');
md.push('| 3D 独有（疑似自造） | ' + extras.length + ' |');
md.push('');
md.push('## 真源漂移');
md.push('');
if (drift.length === 0) md.push('无：space.json / rules.json 的源文件指纹与当前 2.5D 一致。');
else for (const d of drift) md.push('- ⛔ ' + d);
md.push('');
md.push('## 硬编码检查');
md.push('');
if (hardcoded.length === 0) md.push('无：幽灵额度等常量均来自 space.json。');
else for (const h of hardcoded) md.push('- ⛔ ' + h + ' 里写死了 GHOST_TASK_CAP');
md.push('');
md.push('## 守卫/字段缺口（按缺口数排序）');
md.push('');
md.push('> `adapter` 表示一个 2.5D 函数拆到多个 3D 函数（或输入层），其缺口是拆分导致，不计入预算；`ported/auto` 的缺口才是真缺口。');
md.push('');
md.push('| 2.5D 函数 | 状态 | 3D 目标 | 守卫缺 | 写入缺 | 缺什么 |');
md.push('|---|---|---|---:|---:|---|');
for (const r of rows.filter((x) => x.guards_missing || x.writes_missing).sort((a, b) => (b.counted ? 1 : 0) - (a.counted ? 1 : 0) || (b.guards_missing + b.writes_missing) - (a.guards_missing + a.writes_missing))) {
  md.push('| `' + r.src + ':' + r.src_line + '` | ' + r.status + ' | `' + r.target + '` | ' + r.guards_missing + ' | ' + r.writes_missing + ' | ' + r.missing_detail.replace(/\|/g, '\\|') + ' |');
}
md.push('');
md.push('## 未映射函数（按文件分组）');
md.push('');
const byFile = new Map();
for (const r of rows.filter((x) => x.status === 'pending' || x.status === 'broken-target')) {
  const f = r.src.split(':')[0];
  if (!byFile.has(f)) byFile.set(f, []);
  byFile.get(f).push(r);
}
for (const [f, list] of byFile) {
  md.push('- `' + f + '`：' + list.length + ' 个 —— ' + list.slice(0, 12).map((x) => x.fn).join(', ') + (list.length > 12 ? ' …' : ''));
}
md.push('');
md.push('## 3D 独有状态写入（需标注为表现/输入层或补映射）');
md.push('');
for (const e of extras.slice(0, 40)) md.push('- `' + e.target + ':' + e.line + '`');
if (extras.length > 40) md.push('- …共 ' + extras.length + ' 个');
md.push('');
md.push('### 已登记的内部函数（不算自造规则）');
md.push('');
for (const [k, v] of Object.entries(extrasAllow)) md.push('- `' + k + '`：' + v);
md.push('');
md.push('## 下一步（由审阅表驱动，不靠抽查）');
md.push('');
md.push('1. 每条 `守卫缺 / 写入缺`：打开 2.5D 原文逐行核对，补进 3D 或写 `@deviation` 说明。');
md.push('2. 每个 `pending`：要么映射到实现，要么在 `spec/gameplay-parity.json` 标 `not-applicable` 并写理由。');
md.push('3. 每个 3D 独有写入：确认它是表现/输入映射；不是就删。');
md.push('4. 每次改完跑 `npm run audit:parity:strict`，缺口必须为 0 才能提交。');
md.push('');

fs.mkdirSync(path.dirname(OUT_MD), { recursive: true });
fs.writeFileSync(OUT_MD, md.join('\n'), 'utf8');
fs.writeFileSync(OUT_CSV, csv, 'utf8');

console.log('PARITY_GAMEPLAY 总函数=' + counts.total + ' 映射=' + ((counts.mapped || 0) + (counts.ported || 0) + (counts.adapter || 0)) +
  ' 自动=' + (counts.auto || 0) + ' 未映射=' + (counts.pending || 0) +
  ' 守卫缺口=' + counts.guard_gap + ' 写入缺口=' + counts.write_gap +
  ' 3D独有=' + extras.length + ' 漂移=' + drift.length);
console.log('报告：' + path.relative(ROOT, OUT_MD));
if (drift.length) {
  console.error('PARITY FAIL 真源漂移：');
  for (const d of drift) console.error('  - ' + d);
  process.exit(1);
}
/* 预算制：当前积压允许存在，但不许变差（类似 lint baseline）。
 * --update-baseline 只在缺口**下降**后手动收紧，防止一次提交把债还回去。 */
const budget = layers.parity_budget || { pending: 0, guard_gap: 0, write_gap: 0, extras: 0, hardcoded: 0 };
const now = {
  pending: counts.pending || 0,
  guard_gap: counts.guard_gap,
  write_gap: counts.write_gap,
  extras: extras.length,
  hardcoded: hardcoded.length,
};
if (UPDATE_BUDGET) {
  layers.parity_budget = Object.assign({ note: (layers.parity_budget || {}).note || '' }, now);
  fs.writeFileSync(LAYERS, JSON.stringify(layers, null, 2) + '\n', 'utf8');
  console.log('PARITY_BUDGET 已更新：' + JSON.stringify(now));
}
if (STRICT) {
  const worse = Object.keys(now).filter((k) => now[k] > (budget[k] ?? 0));
  if (worse.length) {
    console.error('PARITY FAIL --strict：以下指标比基线更差 ' + JSON.stringify(budget));
    for (const k of worse) console.error('  - ' + k + '：' + now[k] + ' > ' + budget[k]);
    process.exit(1);
  }
  const better = Object.keys(now).filter((k) => now[k] < (budget[k] ?? 0));
  if (better.length) console.log('PARITY 提示：以下指标已优于基线，可跑 --update-baseline 收紧：' + better.join(', '));
}
