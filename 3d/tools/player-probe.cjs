#!/usr/bin/env node
/* 玩家探针运行器：node 3d/tools/player-probe.cjs
 * ------------------------------------------------------------------
 * 用真实 InputEvent 跑 --probetest：异形按 E / 左键 / 轮盘 / F2 DEV。
 * Godot 不在 PATH 上：优先读环境变量 GODOT，再试本机已知的两个绝对路径。
 *
 * 只读运行，不改工程文件；探针失败退出码 1。
 */
const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const CANDIDATES = [
  process.env.GODOT,
  'E:/ai-tools/godot/Godot_v4.6-stable_win64_console.exe',
  'E:/ai-tools/godot/Godot_v4.6-stable_mono_win64/Godot_v4.6-stable_mono_win64_console.exe',
].filter(Boolean);

const godot = CANDIDATES.find((p) => {
  try { return fs.statSync(p).isFile(); } catch { return false; }
});
if (!godot) {
  console.error('PROBE FAIL 找不到 Godot；请设置环境变量 GODOT 指向 console 版可执行文件。');
  console.error('  试过：' + CANDIDATES.join(' | '));
  process.exit(1);
}

// 必须用真实窗口：headless 下 DisplayServer 不认 MOUSE_MODE_CAPTURED，
// 左键会被「先夺回鼠标」分支吃掉（--mousetest / --knifetest 同样只在窗口下有效）。
console.log('PLAYER-PROBE ' + godot);
const r = spawnSync(godot, [
  '--path', path.join(ROOT, '3d', 'preview'), '--resolution', '1280x720', '--', '--probetest',
], { stdio: 'inherit' });
if (r.error) {
  console.error('PROBE FAIL 启动失败：' + r.error.message);
  process.exit(1);
}
process.exit(r.status == null ? 1 : r.status);
