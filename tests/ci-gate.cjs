#!/usr/bin/env node
/* CI 行为门禁：跑 test-v3，按已登记抖动集判定。
 *
 * 背景：test-v3 在 headless Edge 下存在时序抖动（docs/ASSET_CLEANUP_LOG.md:40），
 * 且失败时退出码仍可能为 0；因此必须解析输出，不能只看 exit code。
 * 只允许 tests/flaky-assertions.txt 命中的失败项；其余一律按回归处理。
 */
'use strict';

const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const LOG = path.join(ROOT, 'tests', '_gate-ci.log');
const ALLOW = path.join(ROOT, 'tests', 'flaky-assertions.txt');
const MAX_ALLOWED = 6;

/* 结构预算（2026-11-13 阶段 A 挂载）：纯 Node、不依赖浏览器。
 * 失败必须在汇总里可见并 exit 1，不改变下方 test-v3 的汇总/抖动语义。 */
const fm = spawnSync(process.execPath, [path.join(ROOT, 'tools', 'filemap-js.cjs'), '--check'], {
  cwd: ROOT,
  encoding: 'utf8',
  maxBuffer: 16 * 1024 * 1024,
});
if (fm.error) {
  console.error('[file:check:js] FAIL：filemap-js 启动失败：' + fm.error.message);
  process.exit(1);
}
for (const line of ((fm.stdout || '') + (fm.stderr || '')).split(/\r?\n/)) {
  if (line.trim()) console.log('[file:check:js] ' + line.trim());
}
if (fm.status !== 0) {
  console.error('[file:check:js] FAIL：结构预算检查未通过（见上）');
  process.exit(1);
}

const r = spawnSync(process.execPath, [path.join(ROOT, 'tests', 'test-v3.cjs')], {
  cwd: ROOT,
  encoding: 'utf8',
  maxBuffer: 64 * 1024 * 1024,
});
if (r.error) {
  console.error('[ci-gate] FAIL：test-v3 启动失败：' + r.error.message);
  process.exit(1);
}

const out = (r.stdout || '') + '\n' + (r.stderr || '');
fs.writeFileSync(LOG, out, 'utf8');

const lines = out.split(/\r?\n/);
const fails = lines.filter((l) => /^\s*FAIL\b/.test(l));
const summaryLine = lines.find((l) => /结果：\d+ 通过 \/ \d+ 失败/.test(l));
console.log('[ci-gate] ' + (summaryLine ? summaryLine.trim() : '(未找到汇总行)'));
console.log('[ci-gate] 日志：' + path.relative(ROOT, LOG));

if (!summaryLine) {
  console.error('[ci-gate] FAIL：test-v3 未产出汇总行（崩溃 / 浏览器未启动）');
  process.exit(1);
}

const patterns = fs.existsSync(ALLOW)
  ? fs.readFileSync(ALLOW, 'utf8')
      .split(/\r?\n/)
      .map((s) => s.trim())
      .filter((s) => s && !s.startsWith('#'))
      .map((s) => new RegExp(s))
  : [];

const matched = [];
const unmatched = [];
for (const line of fails) {
  const hit = patterns.find((re) => re.test(line));
  if (hit) matched.push(line.trim());
  else unmatched.push(line.trim());
}

if (!fails.length) {
  console.log('[ci-gate] PASS：0 失败');
  process.exit(0);
}

console.log('[ci-gate] 失败明细：');
for (const line of fails) console.log('  ' + line.trim());

if (unmatched.length) {
  console.error('[ci-gate] FAIL：' + unmatched.length + ' 条失败不在已登记抖动集内');
  process.exit(1);
}
if (matched.length > MAX_ALLOWED) {
  console.error('[ci-gate] FAIL：' + matched.length + ' 条失败命中抖动集，超过上限 ' + MAX_ALLOWED + '，按回归处理');
  process.exit(1);
}

console.log('[ci-gate] PASS：' + matched.length + ' 条失败均命中已登记抖动集（' + path.relative(ROOT, ALLOW) + '）');
process.exit(0);
