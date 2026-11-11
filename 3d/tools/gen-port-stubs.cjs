/* 2.5D 原文 → GDScript 桩文件生成器（“先复制，再改”）
 * ---------------------------------------------------------------------------
 * 用法：
 *   node 3d/tools/gen-port-stubs.cjs --only knife,fireShot,die,dawn,startNight
 *   node 3d/tools/gen-port-stubs.cjs --all --out 3d/port
 *   node 3d/tools/gen-port-stubs.cjs --only die --force
 *
 * 生成物长什么样（以 die 为例）：
 *   # @src js/game.js:4285 die(a, cause, by)
 *   # 移植规则：先逐行抄下面原文，再一条条落到 GDScript。
 *   # 任何 3D 新增的规则都必须写 @deviation 并说明理由，否则 audit:parity 会报。
 *   # --- 2.5D 原文（逐字，含缩进）---
 *   # function die(a,cause,by){
 *   #   ...
 *   # }
 *   func die(a: Dictionary) -> bool:
 *   	# TODO 逐行移植（对照上面的原文，一条一条勾）
 *   	return false
 *
 * 为什么不是整文件复制：2.5D 是 JS + DOM + Canvas，3D 是 GDScript + Godot 场景，
 * 文件级无法直接跑。可控的“复制单位”是**函数**：原文当注释逐字保留，桩先占位，
 * 移植时只做语法转换，不做规则再创作。
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const SRC = path.resolve(argValue('--src') || path.join(ROOT, '..', '新返航录'));
const OUT = path.resolve(argValue('--out') || path.join(ROOT, '3d', 'port'));
const FORCE = process.argv.includes('--force');
const ALL = process.argv.includes('--all');
const only = (argValue('--only') || '').split(',').map((s) => s.trim()).filter(Boolean);

const FILES = ['js/game.js', 'js/ai/sanity.js', 'js/ai/traits.js', 'js/t2/space.js'];

function argValue(flag) {
  const i = process.argv.indexOf(flag);
  return i >= 0 ? process.argv[i + 1] : '';
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
      body: src.slice(m.index, end + 1),
    });
  }
  return out;
}

function gdName(fn) {
  return fn.replace(/([a-z0-9])([A-Z])/g, '$1_$2').toLowerCase();
}

const all = [];
for (const f of FILES) {
  const p = path.join(SRC, f);
  if (fs.existsSync(p)) all.push(...indexJs(p));
}
const picked = ALL ? all : all.filter((f) => only.includes(f.name));
if (picked.length === 0) {
  console.error('没有命中函数。用 --only a,b 或 --all。');
  process.exit(1);
}

fs.mkdirSync(OUT, { recursive: true });
let n = 0;
for (const fn of picked) {
  const outPath = path.join(OUT, gdName(fn.name) + '.gd');
  if (fs.existsSync(outPath) && !FORCE) {
    console.log('SKIP 已存在 ' + path.relative(ROOT, outPath));
    continue;
  }
  const lines = fn.body.split('\n').map((l) => '#   ' + l.replace(/\t/g, '    '));
  const txt = [
    '# @src ' + fn.file + ':' + fn.line + ' ' + fn.name + '(' + fn.params + ')',
    '# 移植规则：先逐行抄下面原文，再一条条落到 GDScript。',
    '# 任何 3D 新增的规则都必须写 @deviation 并说明理由，否则 audit:parity 会报。',
    '# --- 2.5D 原文（逐字，含缩进）---',
    ...lines,
    '',
    'func ' + gdName(fn.name) + '():',
    '\t# TODO 逐行移植（对照上面的原文，一条一条勾）',
    '\treturn null',
    '',
  ].join('\n');
  fs.writeFileSync(outPath, txt, 'utf8');
  n++;
  console.log('GEN  ' + path.relative(ROOT, outPath));
}
console.log('生成 ' + n + ' 个桩，输出目录 ' + path.relative(ROOT, OUT));
