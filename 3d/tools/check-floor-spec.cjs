#!/usr/bin/env node
/**
 * check-floor-spec.cjs · 地板口径对账
 * -------------------------------------------------------------
 * 目的：防止「3D 预演的地板」再次与「2.5D 整船底图」漂移。
 *
 * 检查三件事：
 *   1. res://data/floor_spec.json 与 3d/tools/export-floor-spec.cjs 的真源一致（--check 口径）
 *   2. floor_spec 里每张贴图在 3d 侧 res://assets/textures/ 存在
 *   3. **3D 侧 map_builder.gd 里没有第二份地板表**（ROOM_TEXTURES / 硬编码 repeat）
 *      —— 抄两份表是这次「地板被换掉」的根因，必须靠检查卡死。
 *
 * 用法：node 3d/tools/check-floor-spec.cjs
 */
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..', '..');
const SPEC = path.join(ROOT, '3d', 'preview', 'data', 'floor_spec.json');
const TEX_DIR = path.join(ROOT, '3d', 'preview', 'assets', 'textures');
const GD = path.join(ROOT, '3d', 'preview', 'scripts', 'map_builder.gd');
const SHIP = path.join(ROOT, 'tools', 'blender-ship.py');

let fails = 0;
function bad(msg) { console.log('  FAIL ' + msg); fails++; }
function ok(msg) { console.log('  ok   ' + msg); }

// 1) 与真源一致
try {
  const out = execFileSync(process.execPath,
    [path.join(ROOT, '3d', 'tools', 'export-floor-spec.cjs'), '--check'],
    { encoding: 'utf8' });
  ok(out.trim());
} catch (e) {
  bad('floor_spec.json 与真源不一致：' + String(e.stdout || e.message).trim());
}

// 2) 贴图存在
const spec = JSON.parse(fs.readFileSync(SPEC, 'utf8'));
const entries = Object.entries(spec.rooms).map(([k, v]) => [k, v.tex]);
entries.push(['corridor', spec.corridor.tex]);
for (const [rid, tex] of entries) {
  const p = path.join(TEX_DIR, tex);
  if (fs.existsSync(p)) ok(`${rid} → ${tex}`);
  else bad(`${rid} 贴图缺失：res://assets/textures/${tex}`);
}

// 3) 没有第二份地板表
const gd = fs.readFileSync(GD, 'utf8');
const codeLines = gd.split('\n').filter((l) => !/^\s*##/.test(l));
const code = codeLines.join('\n');
if (/const\s+ROOM_TEXTURES/.test(code)) bad('map_builder.gd 仍有第二份地板表 ROOM_TEXTURES');
else ok('map_builder.gd 无第二份地板表');

// 硬编码 repeat_m / 地板 tint 也要查
const hardRepeat = code.match(/repeat_m\s*[:=]\s*[0-9.]+/g);
if (hardRepeat) {
  const uniq = [...new Set(hardRepeat)];
  // 只允许出现在 fallback 默认值里（fs.get("repeat_m", 4.0) 这类）
  const susp = uniq.filter((x) => !/repeat_m\s*[:=]\s*(4\.0|2\.6)/.test(x));
  if (susp.length) bad('map_builder.gd 出现硬编码地板尺度：' + susp.join(', '));
  else ok('map_builder.gd 地板尺度无硬编码表');
} else ok('map_builder.gd 地板尺度无硬编码表');

// blender-ship.py 也必须读同一份
const ship = fs.readFileSync(SHIP, 'utf8');
if (/floor_spec\.json/.test(ship)) ok('blender-ship.py 读同一份 floor_spec.json');
else bad('blender-ship.py 未读 floor_spec.json（两边又会各用各的表）');

console.log(fails === 0 ? '\nFLOOR-SPEC OK（' + entries.length + ' 项）' : '\nFLOOR-SPEC FAIL ' + fails);
process.exit(fails === 0 ? 0 : 1);
