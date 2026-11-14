#!/usr/bin/env node
/* 补充夹具执行入口（2026-11-14）：找 Godot → 无头跑 run_extra_fixtures.gd → 透传退出码。
 *
 * 与 run-rule-fixtures.cjs 的区别：
 *   · 跑的是第二批判据（10 条场景规则 + 4 条 AI 行为），文件独立，避免与另一个 agent 的
 *     在途改动（run_rule_fixtures.gd）撞车；
 *   · 汇总行是 `EXTRATEST x 通过 / y 失败 / z 已知偏离`，已知偏离不计失败但要打印出来。
 *
 * 同样要求「必须出现汇总行」：GDScript 的 SCRIPT ERROR 不改进程退出码，
 * 没有汇总行就说明执行器被运行期错误中断，必须按失败处理。
 *
 * 用法：npm run 3d:extra:test（GODOT_BIN 可指定引擎）
 */
'use strict';
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const R = require('./run-record.cjs');

const ROOT = path.resolve(__dirname, '..', '..');
const PROJECT = path.join(ROOT, '3d', 'preview');
const SCRIPT = 'res://scripts/tests/run_extra_fixtures.gd';

const CANDIDATES = [
  process.env.GODOT_BIN,
  'E:/ai-tools/godot/Godot_v4.6-stable_win64.exe',
  'C:/Program Files/Godot/Godot_v4.6-stable_win64.exe',
  '/usr/local/bin/godot',
  '/usr/bin/godot',
].filter(Boolean);

const godot = CANDIDATES.find((p) => {
  try { return fs.existsSync(p); } catch (e) { return false; }
});

if (!godot) {
  console.error('[extra:test] 找不到 Godot（可用 GODOT_BIN 指定）。已尝试：');
  for (const c of CANDIDATES) console.error('  - ' + c);
  process.exit(2);
}

const r = spawnSync(godot, ['--headless', '--path', PROJECT, '--script', SCRIPT], {
  encoding: 'utf8',
  maxBuffer: 32 * 1024 * 1024,
});
const out = ((r.stdout || '') + (r.stderr || ''))
  .split(/\r?\n/)
  .filter((l) => !/ObjectDB instances leaked|resources still in use|^\s+at: /.test(l));
for (const l of out) if (l.trim()) console.log(l);
let code = r.status === null ? 1 : r.status;

let pass = 0;
let fail = 0;
let known = 0;
let sawSummary = false;
for (const l of out) {
  const m = /EXTRATEST\s+(\d+)\s+通过\s*\/\s*(\d+)\s+失败\s*\/\s*(\d+)\s+已知偏离/.exec(l);
  if (m) {
    sawSummary = true;
    pass = parseInt(m[1], 10);
    fail = parseInt(m[2], 10);
    known = parseInt(m[3], 10);
  }
}
if (!sawSummary) {
  console.error('[extra:test] 没等到 EXTRATEST 汇总行 —— 执行器被运行期错误中断，按失败处理');
  code = 1;
}
try {
  const p = R.record('extra', {
    verdict: code === 0 ? (known ? 'partial' : 'verified') : 'failed',
    exit: code,
    cases: { pass, fail, known },
    engine: path.basename(godot),
  });
  console.log('[extra:test] 已留痕 ' + path.relative(ROOT, p).replace(/\\/g, '/'));
} catch (e) {
  console.error('[extra:test] 留痕失败（不影响判定）：' + e.message);
}
console.log('[extra:test] exit ' + code + '（引擎 ' + path.basename(godot) + '）');
process.exit(code);
