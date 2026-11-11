#!/usr/bin/env node
/* game.js core/UI 解耦审计（只读）
 *
 * 目的：回答“行为逻辑和 UI 到底缠在一起多少”：
 *   · 哪些函数不碰 DOM/定时器，可以直接进 IR/codegen；
 *   · 哪些函数是 core 但依赖 G 状态 / say / logEvent 等副作用，需要先注入接口；
 *   · 哪些函数本身就是 DOM/Canvas UI，必须留在 view 层；
 *   · 哪些函数混用两者，是上游拆分的首要目标。
 *
 * 用法：node 3d/tools/core-ui-audit.cjs
 * 输出：3d/reports/core-ui-audit.md / .json
 */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const SRC = path.join(ROOT, 'js', 'game.js');
const OUT_MD = path.join(ROOT, '3d', 'reports', 'core-ui-audit.md');
const OUT_JSON = path.join(ROOT, '3d', 'reports', 'core-ui-audit.json');

const src = fs.readFileSync(SRC, 'utf8');
const lines = src.split(/\r?\n/);

function stripComments(text) {
  return text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
}

/* 只找具名 function：它们是 game.js 的承重单元；箭头函数留在调用点统计。 */
function findFunctions(text) {
  const out = [];
  const re = /^[ 	]*function\s+([A-Za-z_$][\w$]*)\s*\(/gm;
  const starts = [];
  let m;
  while ((m = re.exec(text))) starts.push({ name: m[1], start: m.index });
  for (const f of starts) {
    const brace = text.indexOf('{', f.start);
    if (brace < 0) continue;
    let depth = 0;
    let i = brace;
    let state = 'code';
    let quote = '';
    let end = -1;
    while (i < text.length) {
      const c = text[i];
      const n = text[i + 1];
      if (state === 'line') {
        if (c === '\n') state = 'code';
        i++;
        continue;
      }
      if (state === 'block') {
        if (c === '*' && n === '/') { state = 'code'; i += 2; continue; }
        i++;
        continue;
      }
      if (state === 'str') {
        if (c === '\\') { i += 2; continue; }
        if (c === quote) state = 'code';
        i++;
        continue;
      }
      if (c === '/' && n === '/') { state = 'line'; i += 2; continue; }
      if (c === '/' && n === '*') { state = 'block'; i += 2; continue; }
      if (c === '"' || c === "'" || c === '`') { state = 'str'; quote = c; i++; continue; }
      if (c === '{') depth++;
      else if (c === '}') {
        depth--;
        if (depth === 0) { end = i + 1; break; }
      }
      i++;
    }
    if (end > 0) out.push({ name: f.name, start: f.start, end });
  }
  return out;
}
const funcs = findFunctions(src).map((f) => {
  const body = src.slice(f.start, f.end);
  const code = stripComments(body);
  const startLine = src.slice(0, f.start).split('\n').length;
  const endLine = src.slice(0, f.end).split('\n').length;
  const dom = (code.match(/\bdocument\.|getElementById|querySelector|querySelectorAll|addEventListener|classList|createElement|canvas|CanvasRenderingContext/gi) || []).length;
  const timers = (code.match(/\bsetTimeout\b|\bsetInterval\b|requestAnimationFrame/gi) || []).length;
  const state = (code.match(/\bG\.|\bm\.ctx\b|\ba\.mind\b/g) || []).length;
  const sinks = (code.match(/\b(say|sysSay|toast|logEvent|SND\.\w+)\s*\(/g) || []).length;
  const random = (code.match(/\bMath\.random\b/g) || []).length;
  let tier = 'pure';
  if (dom > 0) tier = 'ui';
  else if (timers > 0) tier = 'adapter';
  else if (state > 0 || sinks > 0) tier = 'core-state';
  return {
    name: f.name, startLine, endLine, lines: endLine - startLine + 1,
    dom, timers, state, sinks, random, tier,
    container: f.name === 'boot',
  };
});

const counted = funcs.filter(f => !f.container);
const byTier = {};
for (const f of counted) {
  byTier[f.tier] ||= { count: 0, lines: 0 };
  byTier[f.tier].count++;
  byTier[f.tier].lines += f.lines;
}

const ui = counted.filter(f => f.dom > 0).sort((a, b) => (b.dom + b.timers) - (a.dom + a.timers));
const mixed = counted.filter(f => f.dom > 0 && f.state > 0).sort((a, b) => b.state - a.state);
const core = counted.filter(f => f.tier === 'core-state').sort((a, b) => b.lines - a.lines);
const pure = counted.filter(f => f.tier === 'pure').sort((a, b) => b.lines - a.lines);

const md = [];
md.push('# game.js core / UI 解耦审计');
md.push('');
md.push(`生成时间：${new Date().toISOString()}`);
md.push('');
md.push('> 只读统计；按函数体里的 DOM / 定时器 / `G` 状态 / 副作用调用分类，');
md.push('> 用于决定哪些函数可以先生成、哪些必须上游拆接口。');
md.push('');
md.push('## 1. 总览');
md.push('');
md.push(`- 具名函数：**${counted.length}** 个；覆盖 **${counted.reduce((a, f) => a + f.lines, 0)}** 行`);
md.push('- `boot` 是包住整个游戏的容器函数，单列不计入分层统计。');
md.push('');
md.push('| 层 | 函数 | 行数 | 说明 |');
md.push('|---|---:|---:|---|');
const TIER_DESC = {
  pure: '不碰 DOM / 定时器 / G；可直接进 IR',
  'core-state': '规则/状态逻辑；依赖 G 或 say/logEvent 等副作用，需先注入接口',
  adapter: '含定时器；需要 tick/时钟适配',
  ui: '直接操作 DOM/Canvas；留在 view 层',
};
for (const [tier, t] of Object.entries(byTier).sort((a, b) => b[1].lines - a[1].lines)) {
  md.push(`| \`${tier}\` | ${t.count} | ${t.lines} | ${TIER_DESC[tier] || ''} |`);
}
md.push('');
md.push('## 2. 混用最重的函数（DOM + G 状态）');
md.push('');
md.push('| 函数 | 行段 | 行数 | DOM | G/state | sink |');
md.push('|---|---:|---:|---:|---:|---:|');
for (const f of mixed.slice(0, 25)) {
  md.push(`| \`${f.name}\` | ${f.startLine}-${f.endLine} | ${f.lines} | ${f.dom} | ${f.state} | ${f.sinks} |`);
}
md.push('');
md.push('这些是“行为 + UI”缠在一起的核心债务：只改 3D 会继续产生第二套实现，');
md.push('必须在上游把它们拆成 `decide*`（纯逻辑）与 `render*`（DOM 适配）。');
md.push('');
md.push('## 3. DOM/UI 最重的函数');
md.push('');
md.push('| 函数 | 行段 | 行数 | DOM | timer | state |');
md.push('|---|---:|---:|---:|---:|---:|');
for (const f of ui.slice(0, 25)) {
  md.push(`| \`${f.name}\` | ${f.startLine}-${f.endLine} | ${f.lines} | ${f.dom} | ${f.timers} | ${f.state} |`);
}
md.push('');
md.push('## 4. 可直接进 IR 的候选（core-state / pure）');
md.push('');
md.push('| 函数 | 层 | 行段 | 行数 | sink | random |');
md.push('|---|---|---:|---:|---:|---:|');
for (const f of [...core, ...pure].sort((a, b) => b.lines - a.lines).slice(0, 40)) {
  md.push(`| \`${f.name}\` | ${f.tier} | ${f.startLine}-${f.endLine} | ${f.lines} | ${f.sinks} | ${f.random} |`);
}
md.push('');
md.push('## 5. 建议的拆分顺序');
md.push('');
md.push('1. **先抽 sink 接口**：`say` / `logEvent` / `toast` / `SND` 作为注入依赖，');
md.push('   让 `core-state` 函数不再直接摸 DOM；');
md.push('2. **再抽定时器接口**：`meetLater` / `setTimeout` 换成可注入的调度器（2.5D 保留原实现）；');
md.push('3. **按混用最重的函数逐个拆**：每个拆成 `decideX()`（纯/半纯）+ `renderX()`（DOM）；');
md.push('4. **UI 不走 HTML 翻译**：按 `3d/spec/ui/*.spec.json` 的共享 spec 双 renderer；');
md.push('5. **生成物入门禁**：生成文件手改即 FAIL，fixtures 双端同跑。');
md.push('');
md.push('> 本报告只给边界，不改源码；拆分本身必须在上游 2.5D 完成并跑原仓门禁。');

fs.mkdirSync(path.dirname(OUT_MD), { recursive: true });
fs.writeFileSync(OUT_MD, md.join('\n') + '\n', 'utf8');
fs.writeFileSync(OUT_JSON, JSON.stringify({
  generated_at: new Date().toISOString(),
  total_functions: funcs.length,
  by_tier: byTier,
  functions: funcs,
}, null, 2) + '\n', 'utf8');

console.log(`CORE-UI AUDIT：${funcs.length} 个具名函数 / ${funcs.reduce((a, f) => a + f.lines, 0)} 行`);
for (const [tier, t] of Object.entries(byTier).sort((a, b) => b[1].lines - a[1].lines)) {
  console.log(`  ${tier.padEnd(11)} ${String(t.count).padStart(3)} 函数 ${String(t.lines).padStart(6)} 行`);
}
console.log(`  混用 DOM+G：${mixed.length} 个；报告 ${path.relative(ROOT, OUT_MD)}`);
