#!/usr/bin/env node
/* 场景夹具执行入口（跨机器）：找 Godot → 无头跑 run_rule_fixtures.gd → 透传退出码。
 *
 * 为什么不塞进 npm run check：check 是纯 Node 只读门禁，不需要引擎；
 * 场景夹具必须真跑 Godot（--headless --script）。两者分开，CI 挂不挂由流水线决定。
 *
 * Godot 解析顺序：环境变量 GODOT_BIN → 本机常见路径 → PATH 里的 godot。
 * 找不到就报错退出（不静默跳过，否则「夹具没跑」会被当成「夹具通过」）。
 *
 * 用法：npm run 3d:rules:test
 */
'use strict';
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..', '..');
const PROJECT = path.join(ROOT, '3d', 'preview');
const SCRIPT = 'res://scripts/tests/run_rule_fixtures.gd';

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
  console.error('[rules:test] 找不到 Godot（可用 GODOT_BIN 指定）。已尝试：');
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
const code = r.status === null ? 1 : r.status;
console.log('[rules:test] exit ' + code + '（引擎 ' + path.basename(godot) + '）');
process.exit(code);
