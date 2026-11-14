#!/usr/bin/env node
/* 场景夹具账本校验（只读）。
 *
 * 为什么存在（2026-11-14）：
 *   PORTING_PROTOCOL §3.1 早就要求 adapter 有行为夹具，但「哪条规则有夹具」一直只散在
 *   测试文件注释里，谁也说不清 35 条 scenario 规则到底覆盖了几条。本工具把这件事变成可数：
 *   每条 scenario 规则必须在 fixtures/rules-scenarios.json 有一条登记，
 *   covered / partial 必须指向**真实存在的测试函数**（文件里真能找到 func），
 *   todo 必须写清为什么现在建不了。covered 数量进预算，只许升不许降。
 *
 * 用法：node 3d/tools/check-fixtures.cjs
 *   有结构问题或 covered 低于预算时 exit 1
 */
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const LEDGER = path.join(ROOT, '3d', 'spec', 'mapping-ledger.json');
const FIX = path.join(ROOT, '3d', 'spec', 'fixtures', 'rules-scenarios.json');
const VISUAL = path.join(ROOT, '3d', 'spec', 'visual-cases.json');
const SCRIPTS = path.join(ROOT, '3d', 'preview', 'scripts');
/* 视觉证据用例的 tag 集合：账本里写 `visual: [{tag:...}]` 时，tag 必须真实存在，
 * 否则「贴了个不存在的证据名」也能过闸，等于假证。 */
const visualTags = new Set(
  ((fs.existsSync(VISUAL) ? JSON.parse(fs.readFileSync(VISUAL, 'utf8')).cases : []) || []).map((c) => c.tag)
);
const VISUAL_VERDICTS = new Set(['pass', 'partial', 'fail', 'pending']);

const ledger = JSON.parse(fs.readFileSync(LEDGER, 'utf8'));
const fix = JSON.parse(fs.readFileSync(FIX, 'utf8'));
const scenario = (ledger.rules || []).filter((r) => r.verifier === 'scenario').map((r) => r.id);
const scenarioSet = new Set(scenario);

const problems = [];
const seen = new Map();
const cases = fix.cases || [];
for (const c of cases) {
  if (!c.rule) { problems.push('存在没有 rule 的条目'); continue; }
  if (seen.has(c.rule)) problems.push(c.rule + ' 重复登记');
  seen.set(c.rule, c);
  if (!scenarioSet.has(c.rule)) problems.push(c.rule + ' 不是 scenario 规则（分级见 mapping-ledger#rules）');
  if (!['covered', 'partial', 'todo'].includes(c.status)) problems.push(c.rule + ' 的 status 非法：' + c.status);
  if (c.status === 'covered' || c.status === 'partial') {
    const ev = c.evidence || [];
    if (!ev.length) problems.push(c.rule + ' 标了 ' + c.status + ' 却没有 evidence');
    for (const e of ev) {
      const m = /^([\w./-]+\.gd):(_?[A-Za-z]\w*)$/.exec(e);
      if (!m) { problems.push(c.rule + ' 的 evidence 格式应为 <file>.gd:<func>：' + e); continue; }
      const p = path.join(SCRIPTS, m[1]);
      if (!fs.existsSync(p)) { problems.push(c.rule + ' 的 evidence 文件不存在：' + e); continue; }
      const body = fs.readFileSync(p, 'utf8');
      if (!new RegExp('func\\s+' + m[2] + '\\s*\\(').test(body)) {
        problems.push(c.rule + ' 的 evidence 函数在文件里找不到：' + e);
      }
    }
  } else if (!c.why || !String(c.why).trim()) {
    problems.push(c.rule + ' 标 todo 但没写 why（为什么现在建不了）');
  }
  for (const v of c.visual || []) {
    if (!v || !v.tag) { problems.push(c.rule + ' 的 visual 条目缺 tag'); continue; }
    if (!visualTags.has(v.tag)) problems.push(c.rule + ' 的视觉证据 tag 不存在于 visual-cases.json：' + v.tag);
    if (!VISUAL_VERDICTS.has(v.verdict)) problems.push(c.rule + ' 的视觉结论非法：' + v.verdict);
  }
}
for (const id of scenario) if (!seen.has(id)) problems.push(id + ' 未登记（35 条 scenario 必须逐条有账）');

const by = { covered: 0, partial: 0, todo: 0 };
for (const c of cases) by[c.status] = (by[c.status] || 0) + 1;
const budget = (fix.budget || {}).covered;
if (budget != null && by.covered < budget) {
  problems.push('covered ' + by.covered + ' 低于预算 ' + budget + '（夹具覆盖只许升不许降）');
}

console.log('[fixtures] 场景规则 ' + scenario.length + ' 条 · covered ' + by.covered +
  ' / partial ' + by.partial + ' / todo ' + by.todo +
  '（covered 预算 ' + (budget != null ? budget : '-') + '）');
if (problems.length) {
  console.error('[fixtures] FAIL ' + problems.length + ' 处问题：');
  for (const p of problems.slice(0, 12)) console.error('  - ' + p);
  if (problems.length > 12) console.error('  …共 ' + problems.length + ' 处');
  process.exit(1);
}
console.log('[fixtures] OK 结构与证据引用全部有效');
process.exit(0);
