#!/usr/bin/env node
/* 规则判定器 —— 按「规则正文」核对 3D 侧已导出的数值。
 *
 * 为什么这样做（2026-11-14）：
 *   规则该是什么以 3d/CORE_RULES.md 为准（N），导出数据只是实现快照（F）。
 *   判定器**不持有期望值**：账本里只存「读取模式」（正则），每次运行时从规则正文
 *   现取数值，再与 data_targets 指向的导出键比对。正文改词改数 → 正则失配 → 报 ERR，
 *   逼人复核，而不是悄悄用旧值判定。
 *
 * 只读：不写任何文件、不改账本、不重导数据。
 *
 * 用法：
 *   node 3d/tools/audit-rules.cjs            # 出报告，退出码恒 0
 *   node 3d/tools/audit-rules.cjs --check    # 有 FAIL 即 exit 1；ERR 只告警
 *   node 3d/tools/audit-rules.cjs --strict   # ERR 也算失败（收口时用）
 *   node 3d/tools/audit-rules.cjs --json     # 机读输出
 *   node 3d/tools/audit-rules.cjs --ledger <path>  # 用指定账本（灵敏度自检用，不改真账本）
 */
'use strict';
const fs = require('fs');
const path = require('path');
const B = require('./build-mapping-ledger.cjs');

const ROOT = path.resolve(__dirname, '..', '..');
const args = process.argv.slice(2);
const CHECK = args.includes('--check');
const STRICT = args.includes('--strict');
const JSONOUT = args.includes('--json');
const li = args.indexOf('--ledger');
const LEDGER = li >= 0 && args[li + 1] ? path.resolve(args[li + 1]) : path.join(ROOT, '3d', 'spec', 'mapping-ledger.json');

const ledger = JSON.parse(fs.readFileSync(LEDGER, 'utf8'));
const body = B.rulesBody();
if (body == null) {
  console.error('[rules] FAIL 缺少 3d/CORE_RULES.md（先跑 npm run docs:sync）');
  process.exit(1);
}
const doc = new Map(B.parseRules(body).map((p) => [p.id, p.parts.join(' ').replace(/\s+/g, ' ').trim()]));

const rows = [];
let assertCount = 0;
for (const r of ledger.rules || []) {
  if (!r.assert) continue;
  assertCount++;
  const text = doc.get(r.id);
  const row = { id: r.id, ref: r.assert.ref || '', rx: r.assert.rx || '', verdict: 'PASS' };
  if (text == null) {
    Object.assign(row, { verdict: 'ERR', why: '规则正文里找不到该条目（编号可能已删改）' });
    rows.push(row);
    continue;
  }
  let m;
  try {
    m = new RegExp(r.assert.rx).exec(text);
  } catch (e) {
    Object.assign(row, { verdict: 'ERR', why: '正则非法：' + e.message });
    rows.push(row);
    continue;
  }
  if (!m) {
    Object.assign(row, { verdict: 'ERR', why: '正则未命中（正文措辞可能已变，需复核断言）' });
    rows.push(row);
    continue;
  }
  const docVal = parseFloat(m[1]) * (r.assert.scale != null ? r.assert.scale : 1);
  const res = B.resolveDataRef(row.ref);
  if (!res.ok) {
    Object.assign(row, { verdict: 'ERR', why: '数据目标无效：' + res.why });
    rows.push(row);
    continue;
  }
  const dataVal = res.value;
  row.doc = docVal;
  row.data = dataVal;
  if (typeof dataVal !== 'number') {
    Object.assign(row, { verdict: 'ERR', why: '目标不是数值（' + typeof dataVal + '）' });
  } else {
    const tol = r.assert.tol != null ? r.assert.tol : 0;
    row.verdict = Math.abs(docVal - dataVal) <= tol ? 'PASS' : 'FAIL';
  }
  rows.push(row);
}

const by = (ledger.rules || []).reduce((a, r) => { a[r.verifier] = (a[r.verifier] || 0) + 1; return a; }, {});
const linked = (ledger.rules || []).filter((r) => (r.targets || []).length || (r.data_targets || []).length).length;
const pass = rows.filter((r) => r.verdict === 'PASS').length;
const fail = rows.filter((r) => r.verdict === 'FAIL').length;
const err = rows.filter((r) => r.verdict === 'ERR').length;

if (JSONOUT) {
  console.log(JSON.stringify({
    rules_total: (ledger.rules || []).length,
    by_verifier: by,
    linked,
    asserts: assertCount,
    pass, fail, err,
    rows,
  }, null, 1));
  process.exit(CHECK && (fail || (STRICT && err)) ? 1 : 0);
}

for (const r of rows) {
  if (r.verdict === 'PASS') {
    console.log('  PASS ' + r.id.padEnd(8) + '正文 ' + r.doc + ' == 导出 ' + r.data + '  (' + r.ref + ')');
  } else if (r.verdict === 'FAIL') {
    console.log('  FAIL ' + r.id.padEnd(8) + '正文 ' + r.doc + ' != 导出 ' + r.data + '  (' + r.ref + ')');
  } else {
    console.log('  ERR  ' + r.id.padEnd(8) + r.why + '  (' + r.ref + ')');
  }
}

console.log('');
console.log('[rules] 规则 ' + (ledger.rules || []).length + ' 条 · ' +
  Object.entries(by).map(([k, v]) => k + ' ' + v).join(' / '));
console.log('[rules] 已连目标 ' + linked + ' 条 · 已写断言 ' + assertCount + ' 条 · ' +
  'PASS ' + pass + ' / FAIL ' + fail + ' / ERR ' + err);
if (err) console.log('[rules] ERR 多为正文措辞漂移或导出键失效，按「规则优先」复核断言，不要改正文迁就实现。');
process.exit(CHECK && (fail || (STRICT && err)) ? 1 : 0);
