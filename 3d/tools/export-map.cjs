#!/usr/bin/env node
/* 把 2.5D 的地图数据导出成引擎无关 JSON。
 * 3D 子项目不直接读 js/data/map.js；这是唯一的跨项目数据入口。
 * 用法：node 3d/tools/export-map.cjs
 */
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const repo = path.resolve(__dirname, '..', '..');
const source = path.join(repo, 'js', 'data', 'map.js');
const outDir = path.join(repo, '3d', 'preview', 'data');
const outFile = path.join(outDir, 'map.json');

const sandbox = { window: {} };
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(source, 'utf8'), sandbox, { filename: source });

const map = sandbox.window.SKMapData;
if (!map || !Array.isArray(map.rooms) || !Array.isArray(map.walls)) {
  throw new Error('SKMapData 结构不符合预期：缺少 rooms/walls');
}

/* schema_version 是 3D 侧契约版本（3d/ARCHITECTURE.md §3 硬规则 6）：
   地图数据变化但结构不变时不升版本；字段增删/语义变化必须升。
   v2（2026-11-06）：新增 rooms[].theme 与 cover[].v / decor[].v（美术变体，见下）。 */

/* ---------------- 烘焙端美术真源 ----------------
 * 房间主题色与实例变体的唯一实现在 tools/blender-ship.py（它就是底图 base-lit.png 的生产者）。
 * 3D 要"看起来不像复制粘贴"，就必须和底图用**同一套**配色与变体，所以这里把那两张表
 * 解析出来、把 variant() 的位运算在这里复算一遍，GDScript 端只读结果、不抄配方。
 * 解析不到就报错停下 —— 宁可不出包，也不让 3D 拿默认色跑（COVER_HEIGHT 事故的教训）。 */
const bakerPath = path.join(repo, 'tools', 'blender-ship.py');
const bakerSrc = fs.readFileSync(bakerPath, 'utf8');

function nums(s) {
  return s.split(',').map(x => parseFloat(x.trim())).filter(x => Number.isFinite(x));
}
function parseTable(src, label, re, build) {
  const m = src.match(re);
  if (!m) throw new Error('真源漂移：blender-ship.py 里找不到 ' + label);
  return build(m[1]);
}
const ROOM_THEME = parseTable(bakerSrc, 'ROOM_THEME', /ROOM_THEME = \{([\s\S]*?)\n\}/, body => {
  const out = {};
  const re = /'([a-z_]+)':\s*dict\(wall=\(([^)]*)\),\s*top=\(([^)]*)\),\s*glow=\(([^)]*)\),\s*gs=([\d.]+),\s*mark=\(([^)]*)\)\)/g;
  let m;
  while ((m = re.exec(body))) {
    out[m[1]] = { wall: nums(m[2]), top: nums(m[3]), glow: nums(m[4]), gs: parseFloat(m[5]), mark: nums(m[6]) };
  }
  return out;
});
const TINT_SHIFTS = parseTable(bakerSrc, 'TINT_SHIFTS', /TINT_SHIFTS = \[([\s\S]*?)\]/, body => {
  const out = [];
  const re = /\(([^)]*)\)/g;
  let m;
  while ((m = re.exec(body))) out.push(nums(m[1]));
  return out;
});
const LED_KEYS = parseTable(bakerSrc, 'LED_KEYS', /LED_KEYS = \(([^)]*)\)/,
  body => body.split(',').map(s => s.trim().replace(/^['"]|['"]$/g, '')).filter(Boolean));

if (Object.keys(ROOM_THEME).length < map.rooms.length) {
  throw new Error('ROOM_THEME 只解析到 ' + Object.keys(ROOM_THEME).length + ' 间，地图有 '
    + map.rooms.length + ' 间 —— 有舱室没登记主题色');
}
if (!TINT_SHIFTS.length || !LED_KEYS.length) throw new Error('TINT_SHIFTS / LED_KEYS 解析为空');

/* fnv1a32：与 blender-ship.py 的 fnv() 逐位一致。
   两处必须小心：① 乘法用 Math.imul（否则溢出到浮点会算错）；
   ② 一律用**无符号**右移 >>>（JS 的 >> 把操作数当有符号 int32，哈希 ≥2^31 时会翻负，
      实测让 27/59 件家具的 hz 落到 0.70~0.88 的假区间）。 */
function fnv1a32(s) {
  let h = 2166136261 >>> 0;
  for (const b of Buffer.from(s, 'utf8')) h = Math.imul(h ^ b, 16777619) >>> 0;
  return h;
}
function variant(c) {
  const h = fnv1a32(`${c.room || ''}|${c.label || ''}|${c.kind || ''}`);
  return {
    hash: h,
    tint: h % TINT_SHIFTS.length,
    led: LED_KEYS[(h >>> 5) % LED_KEYS.length],
    segs: 3 + ((h >>> 8) % 3),
    bits: [0, 1, 2, 3, 4].map(i => (h >>> (11 + i * 2)) & 3),
    hz: +(0.90 + (((h >>> 21) % 21) / 100.0)).toFixed(3),
    rot: +((((h >>> 25) % 15) - 7) * Math.PI / 180.0).toFixed(4),
  };
}


const out = Object.assign({ schema_version: 2 }, map);
out.rooms = map.rooms.map(r => Object.assign({}, r, {
  theme: ROOM_THEME[r.id] || null,
  theme_id: r.id,
}));
out.cover = map.cover.map(c => Object.assign({}, c, { v: variant(c), tint_shift: TINT_SHIFTS[variant(c).tint] }));
out.decor = (map.decor || []).map(d => Object.assign({}, d, { v: variant(d) }));
out.art = { source: 'tools/blender-ship.py', tint_shifts: TINT_SHIFTS, led_keys: LED_KEYS };

fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(outFile, JSON.stringify(out, null, 2) + '\n', 'utf8');

const counts = {
  rooms: out.rooms.length,
  corridors: map.corridors.length,
  walls: map.walls.length,
  cover: out.cover.length,
  points: map.points.length,
  pipes: map.pipes.length,
  facility: map.facility.length,
  decor: out.decor.length,
};
const themed = out.rooms.filter(r => r.theme).length;
const hz = out.cover.map(c => c.v.hz);
console.log('[3d] map.json ->', path.relative(repo, outFile), '(schema_version 2)');
console.log('[3d]', JSON.stringify(counts));
console.log('[3d] 主题色覆盖 ' + themed + '/' + out.rooms.length + ' 间；'
  + '实例高度变体 hz ∈ [' + Math.min(...hz).toFixed(2) + ', ' + Math.max(...hz).toFixed(2) + ']'
  + '（烘焙端同一公式）；色调档 ' + TINT_SHIFTS.length + ' 档 / LED ' + LED_KEYS.join(',') + '；'
  + '变体覆盖率 ' + out.cover.filter(c => c.v.hz !== 1.0).length + '/' + out.cover.length);

