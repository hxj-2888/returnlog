#!/usr/bin/env node
/**
 * filemap —— 大文件结构索引与预算棘轮（2026-11-12）
 *
 * 为什么存在：3D 仓的 main.gd 一度 9,580 行 / 377 KB，调试夹具与游戏逻辑平铺在一个
 * 命名空间里。任何智能体要改一行，都得先读完整文件，成本远高于改动本身。
 * 本工具给出一条不读全文也能改对的路：**把文件变成可检索的结构**。
 *
 * 用法：
 *   node 3d/tools/filemap.cjs                    全仓结构总览
 *   node 3d/tools/filemap.cjs --top 12            只看最大的 12 个文件
 *   node 3d/tools/filemap.cjs --file main.gd      单文件函数表
 *   node 3d/tools/filemap.cjs --section dragtest  按名模糊匹配并打印函数原文（含行号）
 *   node 3d/tools/filemap.cjs --json              机器可读（供智能体消费）
 *   node 3d/tools/filemap.cjs --check             预算检查（门禁用，违规退出码 1）
 *
 * 预算口径见 3d/spec/file-budgets.json：
 *   单文件 / 单函数行数上限，以及「tests/ 目录外不得出现 _run_*test」。
 * 这是棘轮：额度只许下调，不许上调（上调须在 CHANGELOG 写明理由）。
 */

'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const SCRIPTS = path.join(ROOT, '3d', 'preview', 'scripts');
const BUDGET_PATH = path.join(ROOT, '3d', 'spec', 'file-budgets.json');

const FUNC_RE = /^(static\s+)?func\s+([A-Za-z_][A-Za-z0-9_]*)\s*\(/;
const TEST_RE = /^_run_(?:.*test|parity_fixture)$/;

function classify(name) {
  if (TEST_RE.test(name) || name === '_dragtest_report' || name === '_knifebottest_report') return 'test';
  if (/^_on_/.test(name)) return 'handler';
  if (/^_(ready|process|physics_process|input|unhandled_input|draw|notification)$/.test(name)) return 'engine';
  if (/^_/.test(name)) return 'private';
  return 'public';
}

function walk(dir, acc) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, acc);
    else if (e.name.endsWith('.gd')) acc.push(p);
  }
  return acc;
}

function parse(fileAbs) {
  const src = fs.readFileSync(fileAbs, 'utf8');
  const lines = src.replace(/\r\n/g, '\n').split('\n');
  const heads = [];
  lines.forEach((l, i) => {
    const m = l.match(FUNC_RE);
    if (m) heads.push({ line: i, name: m[2], isStatic: !!m[1] });
  });
  const funcs = heads.map((h, k) => {
    const end = k + 1 < heads.length ? heads[k + 1].line : lines.length;
    let last = end - 1;
    while (last > h.line && lines[last].trim() === '') last--;
    return {
      name: h.name,
      start: h.line + 1,
      end: last + 1,
      lines: last + 1 - h.line,
      kind: classify(h.name),
    };
  });
  return {
    file: path.relative(SCRIPTS, fileAbs).split(path.sep).join('/'),
    abs: fileAbs,
    lines: lines.length,
    bytes: Buffer.byteLength(src, 'utf8'),
    funcs,
    srcLines: lines,
  };
}

function allFiles() {
  return walk(SCRIPTS, []).map(parse).sort((a, b) => b.lines - a.lines);
}

function fmt(n) {
  return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

function showOverview(files, top) {
  const total = files.reduce((a, f) => a + f.lines, 0);
  const bytes = files.reduce((a, f) => a + f.bytes, 0);
  console.log(`文件 ${files.length} · 总行 ${fmt(total)} · ${(bytes / 1024).toFixed(0)} KB\n`);
  const list = top ? files.slice(0, top) : files;
  console.log('  行数   函数  文件');
  for (const f of list) {
    const tests = f.funcs.filter((x) => x.kind === 'test').length;
    const flag = tests ? `  (${tests} 个调试夹具，占 ${f.funcs.filter((x) => x.kind === 'test').reduce((a, x) => a + x.lines, 0)} 行)` : '';
    console.log(`${String(fmt(f.lines)).padStart(6)}  ${String(f.funcs.length).padStart(4)}  ${f.file}${flag}`);
  }
  if (top && files.length > top) console.log(`… 另有 ${files.length - top} 个文件未列出（--top 调整）`);
  console.log('\n定位单个函数：node 3d/tools/filemap.cjs --section <函数名片段>');
}

function showFile(files, needle) {
  const f = files.find((x) => x.file.includes(needle));
  if (!f) {
    console.error(`未找到文件：${needle}`);
    process.exit(2);
  }
  console.log(`${f.file} · ${fmt(f.lines)} 行 · ${(f.bytes / 1024).toFixed(1)} KB\n`);
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

  for (const f of files) {
    const budget = (b.files || {})[f.file] || {};
    const cap = budget.max_lines || defaults;
    if (f.lines > cap) {
      violations.push(`${f.file} 行数 ${f.lines} 超出预算 ${cap}（只许减不许增）`);
    }
    const testFuncs = f.funcs.filter((x) => x.kind === 'test');
    if (rules.tests_only_in_tests_dir !== false && testFuncs.length && !f.file.startsWith('tests/')) {
      violations.push(
        `${f.file} 含 ${testFuncs.length} 个调试夹具（${testFuncs.slice(0, 3).map((x) => x.name).join(', ')}…），` +
          `必须放在 scripts/tests/ 下`
      );
    }
    for (const x of f.funcs) {
      const key = `${f.file}:${x.name}`;
      if (x.lines <= maxFunc) continue;
      if (Object.prototype.hasOwnProperty.call(allowBigFunc, key)) {
        warns.push(`${key} ${x.lines} 行（已登记待拆：${allowBigFunc[key]}）`);
      } else {
        violations.push(`${key} 单函数 ${x.lines} 行，超出 ${maxFunc} 行上限`);
      }
    }
  }

  for (const w of warns) console.log('FILEMAP WARN ' + w);

  const total = files.reduce((a, f) => a + f.lines, 0);
  const biggest = files[0];
  if (violations.length) {
    for (const v of violations) console.log('FILEMAP FAIL ' + v);
    console.log(`FILEMAP FAIL 共 ${violations.length} 项`);
    process.exit(1);
  }
  console.log(
    `FILEMAP OK ${files.length} 文件 / ${fmt(total)} 行 / 最大 ${biggest.file} ${fmt(biggest.lines)} 行 / ` +
      `每函数上限 ${maxFunc} 行${warns.length ? ` / ${warns.length} 个历史超长函数待拆` : ''}`
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
      funcs: f.funcs,
    }));
    console.log(JSON.stringify({ generated_at: new Date().toISOString(), files: out }, null, 1));
    return;
  }
  if (arg('--section')) return showSection(files, arg('--section'));
  if (arg('--file')) return showFile(files, arg('--file'));

  const top = arg('--top');
  return showOverview(files, top ? parseInt(top, 10) : 15);
}

main();
