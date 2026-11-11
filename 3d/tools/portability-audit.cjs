#!/usr/bin/env node
/* 2.5D → 3D 可移植性审计（只读）
 *
 * 目的：把「哪些模块可以自动生成 / 哪些必须先做运行时适配 / 哪些是 DOM-UI」
 * 从口头判断变成可复跑的读数。本脚本不改 js/、不改运行时，只读源码并写报告。
 *
 * 用法：
 *   node 3d/tools/portability-audit.cjs
 *   node 3d/tools/portability-audit.cjs --json
 *
 * 输出：
 *   3d/reports/portability-audit.md
 *   3d/reports/portability-audit.json
 */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const JS_DIR = path.join(ROOT, 'js');
const REPORT_DIR = path.join(ROOT, '3d', 'reports');
const OUT_MD = path.join(REPORT_DIR, 'portability-audit.md');
const OUT_JSON = path.join(REPORT_DIR, 'portability-audit.json');
const WANT_JSON = process.argv.includes('--json');

function walk(dir, out = []) {
  for (const name of fs.readdirSync(dir)) {
    const p = path.join(dir, name);
    const st = fs.statSync(p);
    if (st.isDirectory()) walk(p, out);
    else if (name.endsWith('.js')) out.push(p);
  }
  return out;
}

function countMatches(text, re) {
  return (text.match(re) || []).length;
}

function stripComments(text) {
  return text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
}

function functionNames(text) {
  const names = new Set();
  for (const m of text.matchAll(/\bfunction\s+([A-Za-z_$][\w$]*)\s*\(/g)) names.add(m[1]);
  for (const m of text.matchAll(/\bconst\s+([A-Za-z_$][\w$]*)\s*=\s*(?:async\s*)?(?:\([^)]*\)|[A-Za-z_$][\w$]*)\s*=>/g)) {
    names.add(m[1]);
  }
  return [...names];
}

function tierOf(rel, coupling) {
  const p = rel.replace(/\\/g, '/');
  if (p === 'js/game.js') return 'runtime-dom';
  if (p === 'js/t2/minigame.js') return 'ui-dom';
  if (p.startsWith('js/ui/') || p.startsWith('js/scene/')) return 'ui-dom';
  if (p.startsWith('js/data/')) return 'data-table';
  if (p === 'js/main.js') return 'entry';
  if (p.startsWith('js/t2/') || p.startsWith('js/ai/') || p.startsWith('js/engine/')) {
    return (coupling.dom > 0 || coupling.timers > 0) ? 'core-adapter' : 'core-logic';
  }
  if (p.startsWith('js/config/')) return 'config';
  return 'other';
}

const files = walk(JS_DIR).map((abs) => {
  const rel = path.relative(ROOT, abs).replace(/\\/g, '/');
  const src = fs.readFileSync(abs, 'utf8');
  const code = stripComments(src);
  const lines = src.split(/\r?\n/);
  const lineCount = lines.length - (src.endsWith('\n') ? 1 : 0);
  const dom = countMatches(code, /\bdocument\.|\bwindow\.document\b|getElementById|querySelector|querySelectorAll|addEventListener|classList|createElement|canvas|CanvasRenderingContext/gi);
  const timers = countMatches(code, /\bsetTimeout\b|\bsetInterval\b|requestAnimationFrame/gi);
  const storage = countMatches(code, /\blocalStorage\b|\bsessionStorage\b/gi);
  const random = countMatches(code, /\bMath\.random\b/g);
  const globalRefs = countMatches(code, /\bglobal\.|\bwindow\.SK/g);
  const fetchRefs = countMatches(code, /\bfetch\s*\(/g);
  const funcs = functionNames(code);
  const tier = tierOf(rel, { dom, timers });
  const automatically = tier === 'data-table' || tier === 'config';
  const notes = [];
  if (fetchRefs) notes.push('fetch（红线 1 禁止）');
  if (dom && tier === 'core-logic') notes.push('核心层意外引用 DOM');
  if (timers && tier === 'core-logic') notes.push('核心层含定时器');
  if (random && tier === 'core-logic') notes.push('核心层含 Math.random');
  return {
    file: rel, lines: lineCount, tier,
    functions: funcs.length, function_names: funcs,
    dom, timers, storage, random, global_refs: globalRefs, fetch: fetchRefs,
    automatically_portable: automatically,
    notes,
  };
});

const byTier = {};
for (const f of files) {
  byTier[f.tier] ||= { files: 0, lines: 0, dom: 0, timers: 0, random: 0, functions: 0 };
  const t = byTier[f.tier];
  t.files++;
  t.lines += f.lines;
  t.dom += f.dom;
  t.timers += f.timers;
  t.random += f.random;
  t.functions += f.functions;
}

const total = files.reduce((a, f) => ({
  files: a.files + 1,
  lines: a.lines + f.lines,
  dom: a.dom + f.dom,
  timers: a.timers + f.timers,
  random: a.random + f.random,
  functions: a.functions + f.functions,
}), { files: 0, lines: 0, dom: 0, timers: 0, random: 0, functions: 0 });

const TIER_LABEL = {
  'data-table': 'A · 数据表（已可自动导出）',
  'config': 'A · 配置（已可自动导出）',
  'core-logic': 'B · 纯逻辑（可做 IR + 代码生成）',
  'core-adapter': 'B- · 逻辑 + 定时器/DOM 适配（先拆适配层）',
  'runtime-dom': 'D · 运行时 DOM/Canvas 编排（必须上游解耦）',
  'ui-dom': 'D · DOM/Canvas UI（必须改用共享 UI spec）',
  'entry': 'E · 入口/胶水（3D 自有入口）',
  other: '? · 未分类',
};

const md = [];
md.push('# 2.5D → 3D 可移植性审计');
md.push('');
md.push(`生成时间：${new Date().toISOString()}`);
md.push('');
md.push('> 本报告由 `node 3d/tools/portability-audit.cjs` 生成，只读源码统计；不代表语义等价。');
md.push('');
md.push('## 1. 总览');
md.push('');
md.push(`- JS 文件：**${total.files}** 个 / **${total.lines}** 行`);
md.push(`- DOM/Canvas 引用：**${total.dom}** 处；定时器：**${total.timers}** 处；`);
md.push(`  \`Math.random\`：**${total.random}** 处；函数/箭头：**${total.functions}** 个`);
md.push('');
md.push('| 层 | 文件 | 行数 | DOM 引用 | 定时器 | Math.random | 函数 |');
md.push('|---|---:|---:|---:|---:|---:|---:|');
for (const [tier, t] of Object.entries(byTier).sort((a, b) => b[1].lines - a[1].lines)) {
  md.push(`| ${TIER_LABEL[tier] || tier} | ${t.files} | ${t.lines} | ${t.dom} | ${t.timers} | ${t.random} | ${t.functions} |`);
}
md.push('');
md.push('## 2. 逐文件');
md.push('');
md.push('| 文件 | 层 | 行数 | 函数 | DOM | 定时器 | random | 自动导出候选 |');
md.push('|---|---|---:|---:|---:|---:|---:|---|');
for (const f of files.sort((a, b) => b.lines - a.lines)) {
  md.push(`| \`${f.file}\` | ${TIER_LABEL[f.tier] || f.tier} | ${f.lines} | ${f.functions} | ${f.dom} | ${f.timers} | ${f.random} | ${f.automatically_portable ? 'A' : '—'} |`);
}
md.push('');
md.push('## 3. 结论与边界');
md.push('');
md.push('### A. 已经可以自动同步（不需要手抄）');
md.push('');
md.push('- `js/data/*`、`js/config/*` 的表格与常量：由 `3d/tools/export-*.cjs` 自动导出；');
md.push('- `js/t2/decision.js` 的舱室词 / 席位表 / `parseSpeech` 正则：由 `export-lines.cjs` 自动抠出；');
md.push('- `js/ai/sanity.js` / `traits.js` 的规则表、函数指纹、调度系数：由 `export-rules.cjs` 自动导出。');
md.push('');
md.push('### B. 可以自动生成，但需要 IR（当前 POC 目标）');
md.push('');
md.push('- `js/t2/decision.js`、`js/t2/ai.js`、`js/ai/sanity.js`、`js/ai/traits.js` 中不读 DOM、不碰定时器的纯函数；');
md.push('- 先抽成语言无关 IR（输入/输出/规则表/显式随机源），再由同一个 IR 生成 JS 与 GDScript；');
md.push('- 验收方式：同一 fixtures 下 JS 与 GDScript 输出逐字段一致，而不是“看起来像”。');
md.push('');
md.push('### C. 必须先在上游解耦');
md.push('');
md.push('- `js/game.js` 是 12k 行、DOM/Canvas/定时器编排与模拟状态混在一起；');
md.push('- 不能把 `game.js` 直接翻译成 GDScript（红线 8 禁止运行时 JS，DOM/CSS 与 Godot 也不是 1:1）；');
md.push('- 必须先把模拟状态机、会议/报告/投票流程从 DOM 中拆出，留下纯 `core` 与 UI 适配层。');
md.push('');
md.push('### D. UI');
md.push('');
md.push('- `js/ui/*` / `js/scene/*` 是 DOM/Canvas 渲染；');
md.push('- 自动移植的正确形态不是 HTML/CSS → `.tscn` 翻译，而是 **UI spec（字段/按钮/状态机/事件）+ 两个 renderer**；');
md.push('- 先做会议面板（本批模板刚改过，状态机最清楚），再扩 HUD/开始页/复盘。');
md.push('');
md.push('### E. 当前不能宣称“已自动对齐”');
md.push('');
md.push('- `port-manifest` 只保证 `js/` 行段 100% 认领；`parity-map` 只覆盖纯函数清单；');
md.push('- `simdiff` 是诊断工具，历史报告首条事件就分歧；');
md.push('- 因此“行为/UI 自动移植”仍是目标，不是现状。');
md.push('');
md.push('## 4. 建议的下一步（按依赖顺序）');
md.push('');
md.push('1. 对 `t2/decision.js#parseSpeech` 建 JS/GDScript 差分 fixtures（本轮 POC）；');
md.push('2. 把差分扩到 `claimWindow` / `seatIndex` / `treat*` 等纯函数；');
md.push('3. 上游拆 `game.js` 的会议/报告/投票状态机 → `core`；');
md.push('4. 定义 UI spec，先迁移会议面板；');
md.push('5. 生成物纳入门禁：手改生成文件即 FAIL。');

fs.mkdirSync(REPORT_DIR, { recursive: true });
fs.writeFileSync(OUT_MD, md.join('\n') + '\n', 'utf8');
fs.writeFileSync(OUT_JSON, JSON.stringify({ generated_at: new Date().toISOString(), total, by_tier: byTier, files }, null, 2) + '\n', 'utf8');

if (WANT_JSON) console.log(JSON.stringify({ total, by_tier: byTier }, null, 2));
else {
  console.log(`PORTABILITY AUDIT：${total.files} 文件 / ${total.lines} 行`);
  for (const [tier, t] of Object.entries(byTier).sort((a, b) => b[1].lines - a[1].lines)) {
    console.log(`  ${String(tier).padEnd(12)} ${String(t.files).padStart(2)} 文件 ${String(t.lines).padStart(6)} 行  DOM=${t.dom}  timer=${t.timers}  random=${t.random}`);
  }
  console.log(`  报告：${path.relative(ROOT, OUT_MD)} / ${path.relative(ROOT, OUT_JSON)}`);
}
