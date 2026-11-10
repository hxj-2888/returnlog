// =============================================================
// build-map-v2.cjs · 合成 3D 主场景可直接消费的 map_v2.json
// -------------------------------------------------------------
// 用法：node 3d/tools/build-map-v2.cjs
// 输入：3d/preview/data/map.json（原导出物，保留所有键）
//       tools/ship-layout-plan.json（方案真源）
// 输出：3d/preview/data/map_v2.json
//       3d/preview/scripts/cover_height_v2.gd.txt（要并入 COVER_HEIGHT 的片段，供核对）
//
// 设计：map_v2.json = 原 map.json 的完整副本，只替换 cover / decor 两张表。
// rooms / corridors / walls / points / pipes / facility / art / scale / bounds
// 全部原样保留 —— 任务点、设备、交互半径、门与管道口径不变。
// 这样 map_builder.gd 只需把 MAP_PATH 指向新文件，主场景即采用新布局。
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
const HEIGHT_TXT = path.join(ROOT, '3d', 'preview', 'scripts', 'cover_height_v2.gd.txt');

const map = JSON.parse(fs.readFileSync(MAP, 'utf8'));
const plan = JSON.parse(fs.readFileSync(PLAN, 'utf8'));

// 2026-11-07 用户裁定：能遮挡手电/近身视线的掩体，高度必须到人眼视角往上。
// 3D 相机眼高 1.62m、玩家胶囊 1.70m；2.5D 的 los() 让每件 cover 无条件挡光。
// 因此 v2 kind 的名义高度统一取 SIGHT_MIN_H，GLB 由 covers_lib.sight_extend() 补到该高度，
// 再由 sync-cover-height.cjs 把实测值写回 map_builder.gd 的 COVER_HEIGHT。
// TIER_HEIGHT 仍保留：它只描述建模时的「档位语义」，不再是运行时高度真源。
// ⚠ 2026-11-09 铁板暂关：covers_lib 的 SIGHT_MIN_H 默认已改 0（不再补背板），
//   本段的 1.70 只作为「历史名义高度」留在已生成的 map_v2.json 里，**不是现行口径**。
//   重跑本脚本会重写全部布局坐标，且把 kind 高度再写成 1.70 ——
//   要动高度口径先定 LOS 方案（见 3d/CHANGELOG.md 同日条目），不要顺手重跑。
const TIER_HEIGHT = { anchor: 1.30, mid: 0.95, accent: 0.55 };
const SIGHT_MIN_H = 1.70;
const LED = ['cyan', 'amber', 'green', 'violet', 'red'];
const roomIndex = {};
plan.rooms.forEach((r, i) => { roomIndex[r.id] = i; });

// 房间专属 kind → 名义高度（与 build-scene-v2.py 的三档一致）
const heights = {};
for (const r of plan.rooms) {
  for (const it of r.items) heights[it.kind] = SIGHT_MIN_H;  // 视线遮挡下限，见上
}

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

const cover = [];
for (const r of plan.rooms) {
  r.items.forEach((it, n) => {
    cover.push({
      room: r.id, x: it.x, y: it.y, w: it.w, h: it.h,
      kind: it.kind, label: it.label,
      v: variant(r.id, it.kind, it.label, it.tier, n),
      tier: it.tier, zone: it.zone, asset: it.asset, texture: it.texture
    });
  });
}

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
  // 只换这两张表；其余键（含 rooms[].theme / art / points / facility / walls）原样保留
  cover,
  decor,
  layout_v2: {
    source: 'tools/ship-layout-plan.json',
    generated_by: '3d/tools/build-map-v2.cjs',
    date: '2026-11-06',
    note: 'cover / decor 来自方案层 v2；其余字段与 map.json 一致。',
    cover: cover.length, decor: decor.length,
    rooms: plan.rooms.length, occAvg: plan.stats.occAvg
  }
});

fs.writeFileSync(OUT, JSON.stringify(out, null, 1), 'utf8');

// 供人工核对 / 并入 map_builder.gd 的 COVER_HEIGHT 常量
const lines = Object.keys(heights).sort().map(k => '\t"' + k + '": ' + heights[k].toFixed(2) + ',');
fs.writeFileSync(HEIGHT_TXT, lines.join('\n') + '\n', 'utf8');

console.log('已写出 3d/preview/data/map_v2.json');
console.log('  cover ' + cover.length + ' 件（原 ' + map.cover.length + '）· decor ' + decor.length +
            ' 件（原 ' + map.decor.length + '）');
console.log('  保留 rooms ' + out.rooms.length + ' / walls ' + out.walls.length + ' / points ' +
            out.points.length + ' / pipes ' + out.pipes.length + ' / facility ' + out.facility.length);
console.log('  新 kind ' + Object.keys(heights).length + ' 种 → 高度表片段 ' + path.relative(ROOT, HEIGHT_TXT));
