#!/usr/bin/env node
/**
 * export-floor-spec.cjs · 导出「地板口径」单一真源
 * -------------------------------------------------------------
 * 用途：
 *   2.5D 整船底图（tools/blender-ship.py，正交 12° 俯视）与 3D 预演（Godot）必须用
 *   **同一张贴图、同一重复尺度、同一染色**，否则同一个舱室在两边看着像两种地板。
 *
 * 2026-11-07 事故复盘：
 *   底图 med 舱是 floor-lab.png 按 3.0 m 一循环铺的大瓷砖（浅灰、格缝粗）；
 *   3D 预演却用全局 UV_WORLD_SCALE=4.0 + 统一 tint(0.88,0.9,0.94)，
 *   铺出来是深灰密格 + 青色灯条 —— 观感上是「地板被换掉了」。
 *   根因是同一张表被抄了两份（blender-ship.py 一份、map_builder.gd 一份）。
 *
 * 本文件是**唯一真源**：
 *   - blender-ship.py 读它做底图材质
 *   - map_builder.gd 读它做 3D 地面材质
 *   任何一边改地板口径，必须先改这里再重跑本脚本。
 *
 * 字段：
 *   tex        贴图名。裸名走 `assets/scene/v4/tex/<tex>`（3D 侧同步到
 *              `res://assets/textures/<同名>.png`）；带 `qwen/` 前缀的**只存在于 3D 侧**
 *              `res://assets/textures/qwen/<rid>/floor.png`，2.5D 由
 *              `tools/blender-ship.py::tex_path()` 回落到同一张图。
 *   repeat_m   贴图在地面上重复一次的边长（米）= 底图 Mapping Scale 的倒数
 *   tint       底图用的 MULTIPLY 染色（RGB 0~1）；null 表示不染色
 *   metallic / roughness  底图同口径的 PBR 参数
 *
 * 用法：node 3d/tools/export-floor-spec.cjs [--check]
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const OUT = path.join(ROOT, '3d', 'preview', 'data', 'floor_spec.json');

// ---- 真源值：从 tools/blender-ship.py 的原表逐条搬过来（2026-11-07 之前） ----
// repeat_m = 1 / 原 FLOOR_SCALE[rid]（原表未列的舱用默认 1/2.8）
// 2026-11-07 晚：bridge / cam / ecosys / transit / fun / med 六舱地板换千问
// （由 3d/tools/bake-qwen-room-skins.py 烘焙），tex 改为 qwen/<rid>/floor.png；
// 铁板四舱 power / engine / armory / warehouse 保持原 SDXL 贴图不动。
// bake 脚本会直接改 floor_spec.json，这里必须同步，否则 --check 会报不一致。
const DEFAULT_REPEAT_M = 2.8;

const ROOMS = {
  bridge: { tex: 'qwen/bridge/floor.png', repeat_m: 7.5, tint: [0.46, 0.48, 0.54] },
  cam: { tex: 'qwen/cam/floor.png', repeat_m: 3.0, tint: [0.86, 0.92, 1.04] },
  ecosys: { tex: 'qwen/ecosys/floor.png', repeat_m: DEFAULT_REPEAT_M, tint: null },
  power: { tex: 'floor-power.png', repeat_m: DEFAULT_REPEAT_M, tint: null },
  transit: { tex: 'qwen/transit/floor.png', repeat_m: DEFAULT_REPEAT_M, tint: null },
  fun: { tex: 'qwen/fun/floor.png', repeat_m: DEFAULT_REPEAT_M, tint: [0.92, 0.88, 0.98] },
  engine: { tex: 'floor-engine.png', repeat_m: 3.0, tint: null },
  med: { tex: 'qwen/med/floor.png', repeat_m: 3.0, tint: null },
  armory: { tex: 'floor-hazard.png', repeat_m: 3.2, tint: [0.72, 0.72, 0.72] },
  warehouse: { tex: 'warehouse-floor.png', repeat_m: 3.2, tint: null },
};

const CORRIDOR = {
  tex: 'floor-grate.png',
  repeat_m: 2.6,
  tint: [0.72, 0.78, 0.9],
};

const METALLIC = 0.22;
const ROUGHNESS = 0.62;
const CORR_METALLIC = 0.42;
const CORR_ROUGHNESS = 0.5;
const CORR_EMIT = 0.14;

function build() {
  const rooms = {};
  for (const [rid, s] of Object.entries(ROOMS)) {
    rooms[rid] = {
      tex: s.tex,
      repeat_m: s.repeat_m,
      tint: s.tint,
      metallic: METALLIC,
      roughness: ROUGHNESS,
    };
  }
  return {
    schema_version: 1,
    generated_by: '3d/tools/export-floor-spec.cjs',
    source: 'tools/blender-ship.py（底图材质口径）',
    note: '地板口径单一真源。repeat_m = 贴图重复边长(米) = 底图 Mapping Scale 的倒数；' +
      'tint 为底图的 MULTIPLY 染色。改这里再重跑本脚本，两边同时生效。',
    rooms,
    corridor: {
      tex: CORRIDOR.tex,
      repeat_m: CORRIDOR.repeat_m,
      tint: CORRIDOR.tint,
      metallic: CORR_METALLIC,
      roughness: CORR_ROUGHNESS,
      emit: CORR_EMIT,
    },
  };
}

function main() {
  const spec = build();
  const text = JSON.stringify(spec, null, 2) + '\n';
  const check = process.argv.includes('--check');
  if (check) {
    if (!fs.existsSync(OUT)) { console.error('FATAL 缺 ' + OUT); process.exit(1); }
    const cur = fs.readFileSync(OUT, 'utf8');
    if (cur !== text) {
      console.error('FAIL floor_spec.json 与真源不一致，请跑 node 3d/tools/export-floor-spec.cjs');
      process.exit(1);
    }
    console.log('OK floor_spec.json 与真源一致（' + Object.keys(spec.rooms).length + ' 舱）');
    return;
  }
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, text);
  console.log('导出 ' + path.relative(ROOT, OUT) + '（' + Object.keys(spec.rooms).length + ' 舱 + 走廊）');
}

main();
