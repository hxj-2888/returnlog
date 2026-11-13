#!/usr/bin/env node
/**
 * filemap-js —— 2.5D 真源 JS 的函数级结构索引与预算棘轮（2026-11-13）
 *
 * 为什么存在：`js/game.js` 是 12,065 行 / 660 KB 的单 IIFE 巨石，顶层 `function` 0 个、
 * 缩进 `function` 347 个，标准 grep 无法按名定位。本工具只读源码、不写任何源码，
 * 让「某个函数在哪个文件第几行、多少行、属于哪一类」不读全文就能回答。
 *
 * 用法：
 *   node tools/filemap-js.cjs                    全仓结构总览
 *   node tools/filemap-js.cjs --top 12            只看最大的 12 个文件
 *   node tools/filemap-js.cjs --file game.js      单文件函数表
 *   node tools/filemap-js.cjs --section drag      按名模糊匹配并打印函数原文（含行号）
 *   node tools/filemap-js.cjs --json              机器可读（供智能体消费）
 *   node tools/filemap-js.cjs --check             预算检查（读 docs/file-budgets-js.json）
 *
 * 解析覆盖（本项目实际写法）：
 *   · 顶层 / IIFE 内缩进 `function name(`；
 *   · `const x = function (` / `const x = (a) =>`；
 *   · 对象字面量方法 `name: function (` / `name(...) {`；
 *   · `window.SKV3 = { ... }` 内的方法（含 `name:()=>` 箭头属性）。
 * 行尾兼容 CRLF / LF；扫描只读，不修改被扫描文件。
 */

'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const SRC = path.join(ROOT, 'js');
const BUDGET_PATH = path.join(ROOT, 'docs', 'file-budgets-js.json');

const RE_FUNCTION = /^(?:async\s+)?function\s+([A-Za-z_$][\w$]*)\s*\(/;
const RE_ASSIGN_FN = /^(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:async\s+)?function\s*(?:[A-Za-z_$][\w$]*\s*)?\(/;
const RE_ASSIGN_ARROW = /^(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:async\s*)?(?:\([^)]*\)|[A-Za-z_$][\w$]*)\s*=>/;
const RE_PROP_FN = /^([A-Za-z_$][\w$]*)\s*:\s*(?:async\s+)?function\s*\(/;
const RE_PROP_ARROW = /^([A-Za-z_$][\w$]*)\s*:\s*(?:async\s*)?(?:\([^)]*\)|[A-Za-z_$][\w$]*)\s*=>/;
const RE_METHOD = /^([A-Za-z_$][\w$]*)\s*\(([^;{}]*)\)\s*\{/;

const CONTROL_WORDS = new Set([
  'if', 'for', 'while', 'switch', 'catch', 'function', 'return', 'else', 'do',
  'try', 'with', 'typeof', 'new', 'delete', 'void', 'in', 'of', 'instanceof',
  'const', 'let', 'var', 'await', 'yield', 'throw',
]);

function classify(name) {
  if (/^_run_.*test$|Test$|^test[A-Z_]/.test(name)) return 'test';
  if (/^_/.test(name)) return 'private';
  if (/^(on[A-Z]|handle|try[A-Z])/.test(name)) return 'handler';
  if (/^(update|draw|render|tick|frame|step|boot|start|stop|loop|main)$/.test(name)) return 'engine';
  return 'public';
}

function walk(dir, acc) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, acc);
    else if (e.name.endsWith('.js')) acc.push(p);
  }
  return acc;
}

/* 从 openIdx 的 '{' 找匹配的 '}'；忽略字符串 / 注释 / 模板里的花括号。
 * 返回字符下标；找不到返回 -1。 */
function matchBrace(text, openIdx) {
  let depth = 0;
  let state = 'code';
  for (let i = openIdx; i < text.length; i++) {
    const c = text[i];
    const n = text[i + 1];
    if (state === 'line') {
      if (c === '\n') state = 'code';
      continue;
    }
    if (state === 'block') {
      if (c === '*' && n === '/') { state = 'code'; i++; }
      continue;
    }
    if (state === 'single' || state === 'double' || state === 'template') {
      if (c === '\\') { i++; continue; }
      if (state === 'single' && c === "'") state = 'code';
      else if (state === 'double' && c === '"') state = 'code';
      else if (state === 'template' && c === '`') state = 'code';
      continue;
    }
    if (c === '/' && n === '/') { state = 'line'; i++; continue; }
    if (c === '/' && n === '*') { state = 'block'; i++; continue; }
    if (c === "'") { state = 'single'; continue; }
    if (c === '"') { state = 'double'; continue; }
    if (c === '`') { state = 'template'; continue; }
    if (c === '{') { depth++; continue; }
    if (c === '}') {
      depth--;
      if (depth === 0) return i;
    }
  }
  return -1;
}

function parse(fileAbs) {
  const raw = fs.readFileSync(fileAbs, 'utf8');
  const src = raw.replace(/\r\n/g, '\n');
  const lines = src.split('\n');
  if (lines.length && lines[lines.length - 1] === '') lines.pop(); // 与 wc -l 对齐：末尾换行不算一行
  const lineStarts = [0];
  for (let i = 0; i < src.length; i++) if (src[i] === '\n') lineStarts.push(i + 1);
  const lineOf = (idx) => {
    let lo = 0;
    let hi = lineStarts.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (lineStarts[mid] <= idx) lo = mid; else hi = mid - 1;
    }
    return lo + 1;
  };

  const heads = [];
  const seen = new Set();
  lines.forEach((line, i) => {
    const indent = line.length - line.trimStart().length;
    const t = line.trimStart();
    if (!t || t.startsWith('//') || t.startsWith('/*')) return;
    const tryHead = (re, kind) => {
      const m = t.match(re);
      if (!m) return false;
      const name = m[1];
      if (kind === 'method' && CONTROL_WORDS.has(name)) return false;
      const key = i + ':' + name;
      if (seen.has(key)) return true;
      seen.add(key);
      heads.push({ line: i, name, kind, colEnd: indent + m.index + m[0].length });
      return true;
    };
    if (tryHead(RE_PROP_FN, 'prop')) return;
    if (tryHead(RE_PROP_ARROW, 'arrow')) return;
    if (tryHead(RE_METHOD, 'method')) return;
    if (tryHead(RE_ASSIGN_FN, 'assign')) return;
    if (tryHead(RE_ASSIGN_ARROW, 'arrow')) return;
    tryHead(RE_FUNCTION, 'function');
  });

  const funcs = heads.map((h) => {
    const startIdx = lineStarts[h.line];
    const headEnd = startIdx + h.colEnd;
    let bodyIdx = src.indexOf('{', headEnd);
    let arrowIdx = src.indexOf('=>', headEnd);
    let endLine = h.line + 1;
    if (arrowIdx >= 0 && (bodyIdx < 0 || arrowIdx < bodyIdx)) {
      // 箭头函数：=> { ... } 或表达式体
      const braceIdx = src.indexOf('{', arrowIdx);
      const semiIdx = src.indexOf(';', arrowIdx);
      if (braceIdx >= 0 && (semiIdx < 0 || braceIdx < semiIdx)) {
        const close = matchBrace(src, braceIdx);
        endLine = close >= 0 ? lineOf(close) : lines.length;
      } else {
        endLine = semiIdx >= 0 ? lineOf(semiIdx) : lineOf(arrowIdx);
      }
    } else if (bodyIdx >= 0) {
      // function / 方法：从首个 '{' 起做括号配对
      const close = matchBrace(src, bodyIdx);
      endLine = close >= 0 ? lineOf(close) : lines.length;
    }
    let last = endLine;
    while (last > h.line + 1 && lines[last - 1].trim() === '') last--;
    return {
      name: h.name,
      start: h.line + 1,
      end: last,
      lines: last - h.line,
      kind: classify(h.name),
    };
  }).sort((a, b) => a.start - b.start);

  return {
    file: path.relative(ROOT, fileAbs).split(path.sep).join('/'),
    lines: lines.length,
    bytes: Buffer.byteLength(raw, 'utf8'),
    funcs,
    srcLines: lines,
  };
}

function allFiles() {
  return walk(SRC, []).map(parse).sort((a, b) => a.file.localeCompare(b.file));
}

function fmt(n) {
  return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

function showOverview(files, top) {
  const total = files.reduce((a, f) => a + f.lines, 0);
  const bytes = files.reduce((a, f) => a + f.bytes, 0);
  const funcs = files.reduce((a, f) => a + f.funcs.length, 0);
  console.log(`文件 ${files.length} · 总行 ${fmt(total)} · 函数 ${fmt(funcs)} · ${(bytes / 1024).toFixed(0)} KB\n`);
  const list = [...files].sort((a, b) => b.lines - a.lines);
  const shown = top ? list.slice(0, top) : list;
  console.log('  行数   函数  文件');
  for (const f of shown) console.log(`${String(fmt(f.lines)).padStart(6)}  ${String(f.funcs.length).padStart(4)}  ${f.file}`);
  if (top && list.length > top) console.log(`… 另有 ${list.length - top} 个文件未列出（--top 调整）`);
  console.log('\n定位单个函数：node tools/filemap-js.cjs --section <函数名片段>');
}

function showFile(files, needle) {
  const f = files.find((x) => x.file.includes(needle));
  if (!f) {
    console.error(`未找到文件：${needle}`);
    process.exit(2);
  }
  console.log(`${f.file} · ${fmt(f.lines)} 行 · ${(f.bytes / 1024).toFixed(1)} KB · ${f.funcs.length} 函数\n`);
  console.log('  起始   行数  分类     函数');
  for (const x of f.funcs) {
    console.log(`${String(x.start).padStart(6)} ${String(x.lines).padStart(5)}  ${x.kind.padEnd(8)} ${x.name}`);
  }
}

function showSection(files, needle) {
  const hits = [];
  for (const f of files) for (const x of f.funcs) if (x.name.includes(needle)) hits.push({ f, x });
  if (!hits.length) {
    console.error(`未找到函数：${needle}`);
    process.exit(2);
  }
  for (const { f, x } of hits) {
    console.log(`===== ${f.file}:${x.start}-${x.end} · ${x.name} · ${x.lines} 行 · ${x.kind} =====`);
    for (let i = x.start - 1; i < x.end; i++) console.log(`${String(i + 1).padStart(6)}  ${f.srcLines[i]}`);
    console.log('');
  }
}

function loadBudgets() {
  if (!fs.existsSync(BUDGET_PATH)) {
    console.error(`缺少预算基线：${path.relative(ROOT, BUDGET_PATH)}`);
    process.exit(2);
  }
  return JSON.parse(fs.readFileSync(BUDGET_PATH, 'utf8'));
}

function check(files) {
  const b = loadBudgets();
  const rules = b.rules || {};
  const defaults = b.default_max_lines || 1200;
  const maxFunc = rules.max_func_lines || 200;
  const allowBigFunc = rules.max_func_lines_allow || {};
  const violations = [];
  const warns = [];
  const seenAllow = new Set();

  for (const f of files) {
    const budget = (b.files || {})[f.file] || {};
    const cap = budget.max_lines || defaults;
    if (f.lines > cap) violations.push(`${f.file} 行数 ${f.lines} 超出预算 ${cap}（只许减不许增）`);
    for (const x of f.funcs) {
      const key = `${f.file}:${x.name}`;
      if (x.lines <= maxFunc) continue;
      if (Object.prototype.hasOwnProperty.call(allowBigFunc, key)) {
        seenAllow.add(key);
        warns.push(`${key} ${x.lines} 行（已登记待拆：${allowBigFunc[key]}）`);
      } else {
        violations.push(`${key} 单函数 ${x.lines} 行，超出 ${maxFunc} 行上限`);
      }
    }
  }
  for (const k of Object.keys(allowBigFunc)) {
    if (!seenAllow.has(k)) warns.push(`${k} 已登记但当前未超 ${maxFunc} 行或函数不存在（可移除登记）`);
  }

  for (const w of warns) console.log('FILEMAP-JS WARN ' + w);
  const total = files.reduce((a, f) => a + f.lines, 0);
  const biggest = [...files].sort((a, b) => b.lines - a.lines)[0];
  const funcs = files.reduce((a, f) => a + f.funcs.length, 0);
  if (violations.length) {
    for (const v of violations) console.log('FILEMAP-JS FAIL ' + v);
    console.log(`FILEMAP-JS FAIL 共 ${violations.length} 项`);
    process.exit(1);
  }
  console.log(
    `FILEMAP-JS OK ${files.length} 文件 / ${fmt(total)} 行 / 函数 ${fmt(funcs)} / ` +
      `最大 ${biggest.file} ${fmt(biggest.lines)} 行 / 每函数上限 ${maxFunc} 行` +
      `${warns.length ? ` / ${warns.length} 个历史超长函数待拆` : ''}`
  );
}

function main() {
  const argv = process.argv.slice(2);
  const arg = (k) => {
    const i = argv.indexOf(k);
    return i >= 0 ? argv[i + 1] : null;
  };
  const files = allFiles();

  if (argv.includes('--check')) return check(files);
  if (argv.includes('--json')) {
    const out = files.map((f) => ({
      file: f.file,
      lines: f.lines,
      bytes: f.bytes,
      funcs: f.funcs.map((x) => ({ name: x.name, start: x.start, end: x.end, lines: x.lines, kind: x.kind })),
    }));
    console.log(JSON.stringify({ files: out }, null, 1));
    return;
  }
  if (arg('--section')) return showSection(files, arg('--section'));
  if (arg('--file')) return showFile(files, arg('--file'));

  const top = arg('--top');
  return showOverview(files, top ? parseInt(top, 10) : 15);
}

main();
