// =============================================================
// build-map-v2.cjs · 合成 3D 主场景可直接消费的 map_v2.json
// -------------------------------------------------------------
// 用法：node 3d/tools/build-map-v2.cjs
// 输入：3d/preview/data/map.json（由 export-map.cjs 从 js/data/map.js 导出）
//       tools/ship-layout-plan.json（**只取墙面装饰**，属 3D 美术）
// 输出：3d/preview/data/map_v2.json
//
// 设计（2026-11-10 回归单一真源）：
//   cover / facility / rooms / corridors / walls / points / pipes 全部来自 map.json
//   ⇒ 唯一真源是 js/data/map.js，与 2.5D 逐值一致（红线：地图只走一条链）。
//   decor 仍取方案层的墙面装饰 —— 2.5D 的 decor 是地面喷涂，3D 是挂墙图版，
//   两者都是纯表现层（geo.js 不读 decor），属允许的美术差异。
//
// 历史：本脚本曾以 ship-layout-plan.json 作为 cover 真源，等于第二条地图真源。
//   上游 2026-11-10 五舱布局重构（掩体 127→120、军械补给点移位）没有同步方案层，
//   3D 因此一直跑在 11-06 的旧布局上。现已把 cover 的取数口径拨回 map.json。
//
// 高度：不再生成 cover_height_v2.gd.txt。运行时高度真源是
//   cover_refs.json（GLB 实测）→ sync-cover-height.cjs → map_builder.gd 的 COVER_HEIGHT。
//   本脚本写名义 1.70 会覆盖实测值，故整段移除。
//
// 边界：不改 js/data/map.js（2.5D 真源）、不覆盖 map.json、不动 2.5D 门禁与平衡。
// =============================================================
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.dirname(path.dirname(path.dirname(__filename)));
const MAP = path.join(ROOT, '3d', 'preview', 'data', 'map.json');
const PLAN = path.join(ROOT, 'tools', 'ship-layout-plan.json');
const OUT = path.join(ROOT, '3d', 'preview', 'data', 'map_v2.json');

const map = JSON.parse(fs.readFileSync(MAP, 'utf8'));
const plan = JSON.parse(fs.readFileSync(PLAN, 'utf8'));

const LED = ['cyan', 'amber', 'green', 'violet', 'red'];
const roomIndex = {};
plan.rooms.forEach((r, i) => { roomIndex[r.id] = i; });

function variant(roomId, kind, label, tier, n) {
  const i = roomIndex[roomId] ?? 0;
  return {
    hash: (i * 7919 + n * 104729) >>> 0,
    tint: i % 5,
    led: LED[i % LED.length],
    segs: 4,
    bits: [0, 1, 0, 1, 0],
    hz: 1.0,          // 新布局不玩 ±10% 克隆变体：高度统一由 COVER_HEIGHT_V2 表定
    rot: 0
  };
}

// 掩体：原样取 map.json（⇒ js/data/map.js）。变体 v / tint_shift 由 export-map.cjs 算好，
// zone / tier 也是 map.js 自带的，这里不再二次派生，避免又造一份配方。
const cover = map.cover;

const decor = [];
for (const r of plan.rooms) {
  r.walls.forEach((w, n) => {
    decor.push({
      room: r.id, x: w.x, y: w.y, w: w.w, h: w.h,
      kind: w.kind, label: w.label,
      v: variant(r.id, w.kind, w.label, 'wall', n + 40),
      side: w.side, asset: w.asset, seed: w.seed,
      prompt: w.prompt, texture: w.texture
    });
  });
}

const out = Object.assign({}, map, {
  schema_version: map.schema_version,
  // 只换 decor 一张表；cover 与其余键（rooms[].theme / art / points / facility / walls）原样保留
  cover,
  decor,
  layout_v2: {
    source: 'js/data/map.js（经 3d/tools/export-map.cjs）',
    decor_source: 'tools/ship-layout-plan.json（3D 墙面美术）',
    generated_by: '3d/tools/build-map-v2.cjs',
    note: 'cover / facility / points / walls 与 map.json 逐值一致；只有 decor 取 3D 墙面装饰。',
    cover: cover.length, decor: decor.length,
    rooms: map.rooms.length
  }
});

fs.writeFileSync(OUT, JSON.stringify(out, null, 1), 'utf8');

console.log('已写出 3d/preview/data/map_v2.json');
console.log('  cover ' + cover.length + ' 件（真源 js/data/map.js）· decor ' + decor.length +
            ' 件（3D 墙面美术，map.js 侧为 ' + map.decor.length + ' 件地面喷涂）');
console.log('  保留 rooms ' + out.rooms.length + ' / walls ' + out.walls.length + ' / points ' +
            out.points.length + ' / pipes ' + out.pipes.length + ' / facility ' + out.facility.length);
console.log('  高度表不在本脚本产出：跑 measure-cover-refs.py → sync-cover-height.cjs');
