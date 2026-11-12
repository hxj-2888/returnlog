/* 2.5D → 3D 映射建议器（找"这条规则在 3D 里已经活在哪"）
 * ---------------------------------------------------------------------------
 * 用法：node 3d/tools/suggest-parity-map.cjs [--limit N] [--fn 名称]
 * 输出：3d/reports/parity-suggest.md
 *
 * 判据只有一条：标识符重合度（2.5D 函数体里出现的变量/字段/被调函数，
 * 有多少出现在 3D 函数体里）。这**不是**判定，只是给人工核对排序，
 * 用来把 134 条 pending 压缩到「真缺口」和「已存在但改名」两类。
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const SRC = path.resolve(ROOT, '..', '新返航录');
const SCRIPTS = path.join(ROOT, '3d', 'preview', 'scripts');
const SPEC = path.join(ROOT, '3d', 'spec', 'gameplay-parity.json');
const OUT = path.join(ROOT, '3d', 'reports', 'parity-suggest.md');

const args = process.argv.slice(2);
const LIMIT = Number(argValue('--limit') || 3);
function argValue(f) { const i = args.indexOf(f); return i >= 0 ? args[i + 1] : ''; }

function findBraceEnd(src, braceAt) {
  let depth = 0, state = null;
  for (let i = braceAt; i < src.length; i++) {
    const c = src[i], n = src[i + 1];
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
function indexJs(file) {
  const src = fs.readFileSync(file, 'utf8');
  const out = [];
  const re = /function\s+([A-Za-z_$][\w$]*)\s*\(([^)]*)\)\s*\{/g;
  let m;
  while ((m = re.exec(src))) {
    const end = findBraceEnd(src, re.lastIndex - 1);
    if (end < 0) continue;
    out.push({ name: m[1], params: m[2].trim(), file: path.relative(SRC, file).replace(/\\/g, '/'), line: src.slice(0, m.index).split('\n').length, body: src.slice(re.lastIndex, end) });
  }
  return out;
}
function walk(dir, acc = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, acc); else if (e.name.endsWith('.gd')) acc.push(p);
  }
  return acc;
}
function indexGd(file) {
  const lines = fs.readFileSync(file, 'utf8').split(/\r?\n/);
  const out = [];
  for (let i = 0; i < lines.length; i++) {
    const m = /^(\s*)func\s+([A-Za-z_][\w]*)\s*\(/.exec(lines[i]);
    if (!m) continue;
    const indent = m[1].length;
    let end = i + 1;
    for (; end < lines.length; end++) {
      const l = lines[end];
      if (!l.trim()) continue;
      if (l.match(/^\s*/)[0].length <= indent) break;
    }
    out.push({ name: m[2], file: path.relative(SCRIPTS, file).replace(/\\/g, '/'), line: i + 1, body: lines.slice(i, end).join('\n') });
  }
  return out;
}
const toSnake = (s) => s.replace(/([a-z0-9])([A-Z])/g, '$1_$2').replace(/[-\s]/g, '_').toLowerCase();
const STOP = new Set(['if', 'return', 'true', 'false', 'null', 'undefined', 'else', 'this', 'const', 'let', 'var', 'for', 'of', 'in', 'function', 'Math', 'G', 'length', 'push', 'slice', 'map', 'filter', 'indexOf', 'forEach', 'String', 'Number', 'Object', 'Array', 'join', 'split', 'now', 'max', 'min', 'abs', 'floor', 'round', 'hypot', 'random', 'trim', 'toFixed', 'test', 'match', 'replace', 'includes', 'padStart', 'keys', 'values', 'entries', 'isArray', 'assign', 'concat', 'sort', 'pop', 'shift', 'charAt', 'substr', 'substring', 'toLowerCase']);
function tokens(s) {
  const set = new Set();
  for (const t of s.match(/[A-Za-z_$][\w$]*/g) || []) {
    if (STOP.has(t)) continue;
    if (t.length < 2) continue;
    set.add(t);
    set.add(toSnake(t));
  }
  return set;
}

const FILES = ['js/game.js', 'js/ai/sanity.js', 'js/ai/traits.js', 'js/t2/space.js', 'js/t2/decision.js'].filter((f) => fs.existsSync(path.join(SRC, f)));
const jsFns = [];
for (const f of FILES) for (const fn of indexJs(path.join(SRC, f))) jsFns.push(fn);
const gdFns = [];
for (const f of walk(SCRIPTS)) for (const fn of indexGd(f)) gdFns.push(fn);

const spec = JSON.parse(fs.readFileSync(SPEC, 'utf8'));
const pending = new Set((spec.entries || []).filter((e) => e.status === 'pending' || e.status === 'broken-target').map((e) => e.src));

const only = argValue('--fn');
const rows = [];
for (const fn of jsFns) {
  const key = fn.file + ':' + fn.name;
  if (!pending.has(key)) continue;
  if (only && fn.name !== only) continue;
  const jt = tokens(fn.body);
  const scored = [];
  for (const g of gdFns) {
    if (g.body.length < 10) continue;
    const gt = tokens(g.body);
    let hit = 0;
    for (const t of jt) if (gt.has(t)) hit++;
    // 名字相同直接加权
    const nameBonus = toSnake(fn.name) === g.name || '_' + toSnake(fn.name) === g.name ? 30 : 0;
    // 归一化：短函数重合少但可能更精准，用 sqrt 抑制长度偏好
    const score = (hit / Math.sqrt(Math.max(6, jt.size))) + nameBonus;
    if (hit >= 2 || nameBonus) scored.push({ g, hit, score });
  }
  scored.sort((a, b) => b.score - a.score);
  rows.push({
    key, fn: fn.name, line: fn.line,
    jsLines: fn.body.split('\n').length,
    jtokens: jt.size,
    top: scored.slice(0, LIMIT),
  });
}

const md = [];
md.push('# 2.5D → 3D 映射建议（人工核对用）');
md.push('');
md.push('> `node 3d/tools/suggest-parity-map.cjs`。分数 = 标识符重合 / √(2.5D 标识符数)，同名 +30。');
md.push('> **只做排序，不做判定**：每行必须打开两侧原文核对后才能写进 `spec/gameplay-parity.json`。');
md.push('');
md.push('| 2.5D 函数 | 行数 | 候选 3D | 重合 | 分数 |');
md.push('|---|---:|---|---:|---:|');
for (const r of rows) {
  if (!r.top.length) {
    md.push('| `' + r.key + '` | ' + r.jsLines + ' | **无候选 → 真缺口** | 0 | 0 |');
    continue;
  }
  r.top.forEach((t, i) => {
    md.push('| ' + (i === 0 ? '`' + r.key + '`' : '') + ' | ' + (i === 0 ? r.jsLines : '') + ' | `' + t.g.file + ':' + t.g.name + ':' + t.g.line + '` | ' + t.hit + ' | ' + t.score.toFixed(1) + ' |');
  });
}
md.push('');
md.push('## 无任何候选（必然要新写）');
md.push('');
for (const r of rows.filter((x) => !x.top.length)) md.push('- `' + r.key + '`（' + r.jsLines + ' 行）');
md.push('');
fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, md.join('\n'), 'utf8');
console.log('SUGGEST 条目=' + rows.length + ' 无候选=' + rows.filter((r) => !r.top.length).length);
console.log('报告：' + path.relative(ROOT, OUT));
