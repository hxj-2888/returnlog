// =============================================================
// export-layout-v2.cjs · 方案层布局 → 3D 端可读数据
// -------------------------------------------------------------
// 用法：node 3d/tools/export-layout-v2.cjs
// 输入：tools/ship-layout-plan.json（方案真源，由 ship-layout-build.cjs 生成）
// 输出：3d/preview/data/layout-v2.json（新增文件，**不覆盖** map.json）
//
// 边界：这是「场景重构」的数据层。现有 Godot map_builder.gd 仍读 map.json，
// 本文件不改动它、不改动 js/data/map.js，也不改任何游戏逻辑与平衡。
// 要在 Godot 里启用新布局，需另行放行改 map_builder.gd（见 CHANGELOG / 文档）。
// =============================================================
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.dirname(path.dirname(path.dirname(__filename)));
const SRC = path.join(ROOT, 'tools', 'ship-layout-plan.json');
const OUT = path.join(ROOT, '3d', 'preview', 'data', 'layout-v2.json');

const P = JSON.parse(fs.readFileSync(SRC, 'utf8'));
const cover = [];
const wallDecor = [];

for (const r of P.rooms) {
  for (const it of r.items) {
    cover.push({
      room: r.id, x: it.x, y: it.y, w: it.w, h: it.h,
      kind: it.kind, label: it.label, asset: it.asset,
      zone: it.zone, tier: it.tier, texture: it.texture
    });
  }
  for (const w of r.walls) {
    wallDecor.push({
      room: r.id, x: w.x, y: w.y, w: w.w, h: w.h,
      kind: w.kind, label: w.label, asset: w.asset, side: w.side,
      seed: w.seed, prompt: w.prompt, texture: w.texture
    });
  }
}

const out = {
  schema_version: 2,
  generated_by: '3d/tools/export-layout-v2.cjs',
  source: 'tools/ship-layout-plan.json',
  date: '2026-11-06',
  note: '方案层布局（v2）。不覆盖 map.json；Godot 现有 map_builder.gd 仍读 map.json。启用需单独放行。',
  decisions: P.rules.decisions,
  bounds: P.bounds,
  scale: P.scale,
  corridors: P.corridors,
  walls: P.walls,
  rooms: P.rooms.map(r => ({
    id: r.id, name: r.name, rect: r.rect, poly: r.poly,
    doors: r.doors, tasks: r.tasks, pipes: r.pipes,
    theme: r.theme, style: r.style, zones: r.zones, spines: r.spines,
    stats: r.stats
  })),
  themes: P.themes,
  cover,
  wall_decor: wallDecor,
  stats: {
    rooms: P.rooms.length,
    cover: cover.length,
    wall_decor: wallDecor.length,
    walls: P.walls.length,
    doors: P.stats.doors,
    tasks: P.stats.tasks,
    kinds: P.stats.kinds,
    occAvg: P.stats.occAvg
  }
};

fs.writeFileSync(OUT, JSON.stringify(out, null, 1), 'utf8');
console.log('已写出 3d/preview/data/layout-v2.json');
console.log('  房间 ' + out.stats.rooms + ' · 掩体 ' + out.stats.cover + ' · 墙饰 ' + out.stats.wall_decor +
            ' · 墙段 ' + out.stats.walls + ' · 门 ' + out.stats.doors + ' · 任务点 ' + out.stats.tasks);
console.log('  房间专属 kind ' + out.stats.kinds + ' 类 · 平均占用 ' + out.stats.occAvg + '%');
