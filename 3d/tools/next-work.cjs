#!/usr/bin/env node
/* 选题器（2026-11-14）—— 按覆盖缺口排出「下一步该补哪几条」，只排序、不改任何文件。
 *
 * 为什么单独一个工具：审计器只回答「现在对不对」，不回答「接下来先做哪条」。
 * 没有它，下一批做什么只能靠人临时想；有了它，缺口清单每次都能重算一遍。
 *
 * 优先级（成本从低到高）：
 *   ① numeric 已连目标但没断言   —— 纯加法，最便宜
 *   ② scenario partial           —— 只差一段断言
 *   ③ scenario todo              —— 要先构造前提（why 里写了缺什么）
 *   ④ symbolic 未连代码目标      —— 入口名待确认，最不确定
 *   ⑤ numeric 未连目标           —— 要改导出层（T2/导出改动）
 *
 * 用法：node 3d/tools/next-work.cjs [--top 8] [--json]
 */
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const LEDGER = path.join(ROOT, '3d', 'spec', 'mapping-ledger.json');
const FIXTURES = path.join(ROOT, '3d', 'spec', 'fixtures', 'rules-scenarios.json');

const args = process.argv.slice(2);
const ti = args.indexOf('--top');
const TOP = ti >= 0 ? parseInt(args[ti + 1], 10) : 10;
const JSONOUT = args.includes('--json');

const ledger = JSON.parse(fs.readFileSync(LEDGER, 'utf8'));
const rules = ledger.rules || [];
const fix = JSON.parse(fs.readFileSync(FIXTURES, 'utf8'));
const cases = fix.cases || [];
const fixBy = new Map(cases.map((c) => [c.rule, c]));

const HINT = {
  'R6.1': '任务点 2/1 分要派生（map.points 聚合）',
  'R6.8': '电路维修 10 秒要派生（该任务点 dur）',
  'R8.4': '子弹来源入口名待确认',
  'R12.1': '嫌疑累加入口待定',
};

/** 已判定「不做自动断言」的条目：不进队列，但要单独列出来，避免看起来被遗忘。 */
const DEFERRED = {
  'R11.2': '24 项证据权重表：单值断言会假装覆盖整表，只连 constants.EV_W 整表',
};

const items = [];
for (const r of rules) {
  const linked = (r.targets || []).length || (r.data_targets || []).length;
  if (r.verifier === 'numeric' && !r.assert) {
    if (DEFERRED[r.id]) continue;
    items.push({
      rank: linked ? 1 : 5,
      id: r.id,
      kind: linked ? 'numeric 补断言' : 'numeric 先补导出键',
      why: HINT[r.id] || (linked ? '目标已连，缺断言' : '导出层没有可寻址键'),
    });
  } else if (r.verifier === 'symbolic' && !(r.targets || []).length) {
    items.push({ rank: 4, id: r.id, kind: 'symbolic 连代码目标', why: HINT[r.id] || '入口未确认' });
  } else if (r.verifier === 'scenario') {
    const c = fixBy.get(r.id);
    if (!c) items.push({ rank: 3, id: r.id, kind: 'scenario 未登记', why: '夹具账本缺条目' });
    else if (c.status === 'partial') {
      items.push({ rank: 2, id: r.id, kind: 'scenario partial', why: c.why || c.note || '' });
    } else if (c.status === 'todo') {
      items.push({ rank: 3, id: r.id, kind: 'scenario todo', why: c.why || '' });
    }
  }
}

items.sort((a, b) => (a.rank - b.rank) || a.id.localeCompare(b.id));
const top = items.slice(0, TOP);

if (JSONOUT) {
  console.log(JSON.stringify({ remaining: items.length, top }, null, 1));
  process.exit(0);
}

console.log('[next] 剩余缺口 ' + items.length + ' 条，按成本排序取前 ' + top.length + ' 条：');
for (const it of top) {
  console.log('  ' + it.id.padEnd(8) + ' [' + it.kind + '] ' + it.why);
}
console.log('[next] 只排序，不改任何文件；执行仍走「改 → 门禁 → 留痕」。');
const defIds = Object.keys(DEFERRED);
if (defIds.length) {
  console.log('[next] 已判定不做自动断言（不计入缺口）：' + defIds.join('、'));
  for (const id of defIds) console.log('       ' + id + '：' + DEFERRED[id]);
}
