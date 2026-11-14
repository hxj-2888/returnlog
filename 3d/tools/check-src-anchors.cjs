/* @src 锚点回读校验：3D 注释里的 `@src js/game.js:NNNN 符号` 是否还指得准。
 * 用法：node 3d/tools/check-src-anchors.cjs [--check] [--fix] [--json] [--tolerance=8]
 *
 * 为什么要这道门禁（红线 11「改 3D 先回 2.5D 查」的可执行化）：
 *   @src 注释是自由文本，2.5D 任何一次插行/删行都会让它整体下移。
 *   这类漂移不会让任何现有门禁变红——`check-parity` 只回读 15 条具名字面量，
 *   `3d:port:check` 只管 port-manifest。于是「按注释去真源查」会查到相邻的别的函数，
 *   追溯性静默退化。2026-11-14 实测：54 条主锚点中 17 条偏 9~52 行，
 *   且多数集中偏 +23 行，正是 11-13 DEV 渲染批插入 23 行所致。
 *
 * 两类引用都要查：
 *   主引用    `@src js/game.js:3382 alienPlan`
 *   行内次级  `@src js/game.js:1131 pickSabRoom + :1297 sabTick` / `attack / 8280 stab`
 *   只修主引用会让同一行自相矛盾，所以次级引用按同一 js 文件同样校验与对齐。
 *
 * 判定口径（每条引用三问）：
 *   ① 指向的 js 文件是否存在，行号是否在文件范围内；
 *   ② 若带符号名，该符号在真源里是否还存在；
 *   ③ 引用行是否仍然「指得住」——满足任一条即算有效：
 *      a. 引用行本身就含该符号（锚点指某条调用/赋值语句，如 `supplyPoints().find(...)`）；
 *      b. 引用行落在**同名函数体内**（向上扫描最近的 `function X`，X 即符号名）。
 *   为什么不直接比「符号最近出现行」：那会把「指函数体某条语句」的锚点误判为漂移
 *   （实测 `newGame` 的锚点指 294 行的 `recordFrame();`，按最近符号会算成偏 16 行，
 *   但那条锚点其实仍然准确）。也不按定义行硬对齐：`supplyPoints` 按定义行会偏 −2001 行。
 *
 * `--fix` 的安全边界：只改「目标确定」的引用。
 *   若真源里存在同名具名定义（`function X` / `const X =`），目标行就是确定的，
 *   自动把数字改到该定义行；若只能找到零散出现（拿不到定义），目标不确定，
 *   一律不动并列入「待人工」。宁可留几条待办，也不把锚点改到错的行上。
 *
 * 依赖：同级目录存在 2.5D 真源（CI 里由 check.yml 检出并软链为 `../新返航录`）。
 * 真源缺席时打印 SKIP 并 exit 0 —— 单仓检出不应因此变红，但也不假装校验过。
 */
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const SCRIPTS = path.join(ROOT, '3d', 'preview', 'scripts');
const SRC = path.resolve(ROOT, '..', '新返航录');

const args = process.argv.slice(2);
const CHECK = args.includes('--check');
const FIX = args.includes('--fix');
const JSONOUT = args.includes('--json');
const TOL = (() => {
  const a = args.find((x) => x.startsWith('--tolerance='));
  const n = a ? Number(a.split('=')[1]) : 8;
  return Number.isFinite(n) && n >= 0 ? n : 8;
})();

/* `@src js/game.js:3382 alienPlan：…` / `@src js/game.js:3773-3782：…` */
const ANCHOR = /@src\s+(js\/[A-Za-z0-9_/.-]+\.js):(\d+)(?:-(\d+))?(?:\s+([A-Za-z_$][\w$]*))?/;
/* 行内次级引用：`:1297 sabTick` / `8280 stab`（`js/…:N` 形式由 ANCHOR 处理） */
const SECONDARY = /(\d{1,5})\s+([A-Za-z_$][\w$]*)/g;

function walk(dir, out) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (e.name.endsWith('.gd')) out.push(p);
  }
  return out;
}

const srcCache = new Map();
function loadSrc(rel) {
  if (!srcCache.has(rel)) {
    const p = path.join(SRC, rel);
    srcCache.set(rel, fs.existsSync(p) ? fs.readFileSync(p, 'utf8').split(/\r?\n/) : null);
  }
  return srcCache.get(rel);
}

/* 符号的具名定义行（function / const|let|var），用于给出「应该改到哪一行」 */
function defLine(lines, sym) {
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    if (
      new RegExp('^\\s*(?:export\\s+)?(?:async\\s+)?function\\s+' + sym + '\\b').test(l) ||
      new RegExp('^\\s*(?:export\\s+)?(?:const|let|var)\\s+' + sym + '\\s*=').test(l)
    ) {
      return i + 1;
    }
  }
  return -1;
}

/* 引用行落在哪个函数体内：向上扫描最近的 `function X` */
function enclosing(lines, from) {
  for (let i = Math.min(from, lines.length) - 1; i >= 0; i--) {
    const m = /^\s*(?:export\s+)?(?:async\s+)?function\s+([A-Za-z_$][\w$]*)/.exec(lines[i]);
    if (m) return { name: m[1], line: i + 1 };
  }
  return null;
}

function nearest(lines, sym, from) {
  let best = -1;
  let bestD = Infinity;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].includes(sym)) {
      const d = Math.abs(i + 1 - from);
      if (d < bestD) {
        bestD = d;
        best = i + 1;
      }
    }
  }
  return { line: best, dist: bestD };
}

if (!fs.existsSync(SRC)) {
  console.log('[src] SKIP 找不到同级 2.5D 真源：' + SRC);
  console.log('[src] CI 由 check.yml 检出并软链为 ../新返航录；本地需把两仓放在同一目录下。');
  process.exit(0);
}

/* 单条引用的判定：null = 有效；{problem} = 结构问题；否则是漂移 */
function judge(jsRel, n1, span, sym) {
  const src = loadSrc(jsRel);
  if (!src) return { problem: '真源文件不存在：' + jsRel };
  if (n1 < 1 || n1 + span > src.length) {
    return { problem: `行号越界：${jsRel}:${n1}（共 ${src.length} 行）` };
  }
  if (!sym) return null;
  const citedText = src[n1 - 1] || '';
  const body = enclosing(src, n1);
  if (citedText.includes(sym) || (body && body.name === sym)) return null;
  const def = defLine(src, sym);
  const near = nearest(src, sym, n1);
  if (def < 0 && near.line < 0) return { problem: `符号在真源里找不到：${sym}` };
  const target = def > 0 ? def : near.line;
  if (Math.abs(target - n1) <= TOL) return null;
  return { cited: n1, span, sym, actual: target, delta: target - n1, via: def > 0 ? 'def' : 'nearest' };
}

const files = walk(SCRIPTS, []);
const drifts = [];
const problems = [];
let total = 0;
let checked = 0;

for (const file of files) {
  const rel = path.relative(ROOT, file).replace(/\\/g, '/');
  const lines = fs.readFileSync(file, 'utf8').split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const m = ANCHOR.exec(lines[i]);
    if (!m) continue;
    const [, jsRel, l1, l2, sym] = m;
    const n1 = Number(l1);
    const span = l2 ? Number(l2) - n1 : 0;
    total++;
    const r = judge(jsRel, n1, span, sym);
    if (r && r.problem) problems.push({ file: rel, at: i + 1, why: r.problem });
    else if (r) drifts.push({ file: rel, at: i + 1, jsRel, ...r, sub: false });
    else checked++;

    /* 行内次级引用：只看 @src 之后的部分，避免把行首常量值当成行号 */
    const tail = lines[i].slice(m.index + m[0].length);
    for (const sm of tail.matchAll(SECONDARY)) {
      const n = Number(sm[1]);
      const s2 = sm[2];
      total++;
      const r2 = judge(jsRel, n, 0, s2);
      if (r2 && r2.problem) problems.push({ file: rel, at: i + 1, why: r2.problem });
      else if (r2) drifts.push({ file: rel, at: i + 1, jsRel, ...r2, sub: true });
      else checked++;
    }
  }
}

/* 同名定义存在 → 目标行确定，可自动对齐；拿不到定义 → 留人工 */
const fixable = new Set(drifts.filter((d) => d.via === 'def'));

if (FIX) {
  for (const file of files) {
    const rel = path.relative(ROOT, file).replace(/\\/g, '/');
    const lines = fs.readFileSync(file, 'utf8').split(/\r?\n/);
    let touched = false;
    for (let i = 0; i < lines.length; i++) {
      const m = ANCHOR.exec(lines[i]);
      if (!m) continue;
      let line = lines[i];
      const main = drifts.find((d) => d.file === rel && d.at === i + 1 && !d.sub);
      if (main && fixable.has(main)) {
        const ref = main.span > 0 ? `${main.actual}-${main.actual + main.span}` : String(main.actual);
        line =
          line.slice(0, m.index) +
          `@src ${main.jsRel}:${ref} ${main.sym}` +
          line.slice(m.index + m[0].length);
      }
      /* 次级引用：按同一 js 文件重算，逐个替换数字 */
      const cut = line.indexOf('@src');
      const head = line.slice(0, cut);
      const tail = line.slice(cut).replace(SECONDARY, (all, num, sym2) => {
        const hit = drifts.find(
          (d) => d.file === rel && d.at === i + 1 && d.sub && d.cited === Number(num) && d.sym === sym2
        );
        if (!hit || !fixable.has(hit)) return all;
        return `${hit.actual} ${sym2}`;
      });
      if (head + tail !== lines[i]) {
        lines[i] = head + tail;
        touched = true;
      }
    }
    if (touched) fs.writeFileSync(file, lines.join('\n'), 'utf8');
  }
  if (!JSONOUT) {
    console.log(
      `[src] 已对齐 ${drifts.filter((d) => fixable.has(d)).length} 条引用（只改注释里的数字），` +
        `剩 ${drifts.filter((d) => !fixable.has(d)).length} 条待人工复核`
    );
  }
}

const manual = drifts.filter((d) => !fixable.has(d));
if (JSONOUT) {
  console.log(JSON.stringify({ total, checked, tolerance: TOL, drift: drifts, manual, problems }, null, 2));
} else if (!FIX) {
  for (const p of problems) console.log(`  FAIL ${p.file}:${p.at}  ${p.why}`);
  for (const d of [...drifts].sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta))) {
    const tag = fixable.has(d) ? 'DRIFT' : 'MANUAL';
    const sign = d.delta > 0 ? '+' : '';
    console.log(
      `  ${tag} ${d.file}:${d.at}  ${d.jsRel}:${d.cited} → ${d.actual}（${sign}${d.delta}）  ${d.sym}` +
        (d.sub ? '  [行内次级]' : '') +
        (fixable.has(d) ? '' : '  ← 无同名定义，需人工确认')
    );
  }
  console.log(
    `[src] 引用 ${total} 条 · 回读 ${checked} 条 · 可对齐 ${drifts.length - manual.length} 条 · 待人工 ${manual.length} 条 · 结构问题 ${problems.length} 条 · 容差 ${TOL} 行`
  );
}

/* 门禁口径：只要还有漂移就红，不管它能不能自动对齐。
 * 2026-11-14 修过一版：原先只把「拿不到定义」的算失败，结果可自动对齐的漂移
 * 会让 CI 带病变绿——门禁就成了摆设。--fix 是治法，不是判定。 */
if (CHECK && !FIX && (problems.length || drifts.length)) {
  console.log('[src] 整批位移可用 --fix 对齐（只改注释里的数字）；无同名定义的需人工确认。');
  process.exit(1);
}
process.exit(0);
