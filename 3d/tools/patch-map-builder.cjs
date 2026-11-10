// =============================================================
// patch-map-builder.cjs · 把 3D 主场景切到 v2 布局（幂等，可重复跑）
// -------------------------------------------------------------
// 用法：node 3d/tools/patch-map-builder.cjs
// 依赖：先跑 build-map-v2.cjs（生成 map_v2.json 与高度表片段）
//
// 四处改动，全部集中在一个文件，默认行为直接采用新布局：
//   1. MAP_PATH → res://data/map_v2.json
//   2. COVER_HEIGHT 末尾并入 61 个房间专属 kind 的名义高度
//   3. _build_cover() 的掩体底色改由 rooms[].theme.mark 决定（每舱专属材质）
//   4. build() 增加 40 件贴墙装饰（颜色取 theme.glow）
// 不改 2.5D 真源、不覆盖 map.json、不动 main.gd / scene_extras.gd 的调用逻辑。
// =============================================================
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.dirname(path.dirname(path.dirname(__filename)));
const GD = path.join(ROOT, '3d', 'preview', 'scripts', 'map_builder.gd');
const HEIGHTS = path.join(ROOT, '3d', 'preview', 'scripts', 'cover_height_v2.gd.txt');

let src = fs.readFileSync(GD, 'utf8');
const heights = fs.readFileSync(HEIGHTS, 'utf8').trimEnd();
let changed = [];

// 1) 数据入口
if (src.includes('const MAP_PATH := "res://data/map.json"')) {
  src = src.replace('const MAP_PATH := "res://data/map.json"',
    'const MAP_PATH := "res://data/map_v2.json"');
  changed.push('MAP_PATH → map_v2.json');
}

// 2) 高度表（幂等标记）
const BEGIN = '\t# === v2 房间专属 kind（由 3d/tools/build-map-v2.cjs 生成）BEGIN ===';
const END = '\t# === v2 房间专属 kind END ===';
if (!src.includes(BEGIN)) {
  const anchor = '\t"pond": 0.10,           # 水面 0.05 / 围边 0.10 —— 不能当墙用\n}';
  if (!src.includes(anchor)) throw new Error('找不到 COVER_HEIGHT 表尾锚点，停止补丁');
  src = src.replace(anchor, '\t"pond": 0.10,           # 水面 0.05 / 围边 0.10 —— 不能当墙用\n' +
    BEGIN + '\n' + heights + '\n' + END + '\n}');
  changed.push('COVER_HEIGHT 并入 61 个新 kind');
}

// 3) 掩体底色：按房间 theme.mark（保留原贴图，tint 不同即材质不同 → 不跨舱复用）
const COLOR_ANCHOR = '\t\tvar mat := _material(tex, base, true)';
if (!src.includes('v2 掩体专属色')) {
  if (!src.includes(COLOR_ANCHOR)) throw new Error('找不到 _build_cover 材质行，停止补丁');
  const inject = [
    '\t\t## v2 掩体专属色：颜色只取该舱 rooms[].theme.mark，',
    '\t\t## 不同舱的 tint 必然不同 → _material 缓存出各自独立的材质，不跨舱复用。',
    '\t\tvar rid := String(item.get("room", ""))',
    '\t\tif rid != "":',
    '\t\t\tfor rr: Dictionary in data.get("rooms", []):',
    '\t\t\t\tif String(rr.get("id", "")) != rid:',
    '\t\t\t\t\tcontinue',
    '\t\t\t\tvar th: Dictionary = rr.get("theme", {})',
    '\t\t\t\tvar mk: Array = th.get("mark", [])',
    '\t\t\t\tif mk.size() >= 3:',
    '\t\t\t\t\tbase = Color(clampf(float(mk[0]), 0.0, 1.0), clampf(float(mk[1]), 0.0, 1.0), clampf(float(mk[2]), 0.0, 1.0))',
    '\t\t\t\tbreak',
    COLOR_ANCHOR
  ].join('\n');
  src = src.replace(COLOR_ANCHOR, inject);
  changed.push('掩体底色改为 rooms[].theme.mark');
}

// 4) build() 里加墙饰调用 + 新函数
if (!src.includes('_build_wall_decor_v2()')) {
  const callAnchor = '\t_build_cover()\n\t_build_lights()';
  if (!src.includes(callAnchor)) throw new Error('找不到 build() 调用锚点，停止补丁');
  src = src.replace(callAnchor, '\t_build_cover()\n\t_build_wall_decor_v2()\n\t_build_lights()');

  const fn = [

    '## v2：40 件墙面装饰贴墙竖直板，颜色取该舱 theme.glow（房间专属、不跨舱复用）。',
    '## 数据是 map_v2.json 的 decor[]；旧 scene_extras._build_decor 对新 kind 无匹配分支，',
    '## 不会重复建模，也不会破坏原有 floor_mark / camera 的行为。',
    'func _build_wall_decor_v2() -> void:',
    '\tvar glows := {}',
    '\tfor r: Dictionary in data.get("rooms", []):',
    '\t\tvar th: Dictionary = r.get("theme", {})',
    '\t\tvar g: Array = th.get("glow", [])',
    '\t\tif g.size() >= 3:',
    '\t\t\tglows[String(r.get("id", ""))] = Color(',
    '\t\t\t\tclampf(float(g[0]), 0.0, 1.0), clampf(float(g[1]), 0.0, 1.0), clampf(float(g[2]), 0.0, 1.0))',
    '\tfor d: Dictionary in data.get("decor", []):',
    '\t\tvar rid := String(d.get("room", ""))',
    '\t\tif rid == "" or not d.has("side"):',
    '\t\t\tcontinue',
    '\t\tvar w := float(d.get("w", 0.3))',
    '\t\tvar h := float(d.get("h", 0.3))',
    '\t\tvar span := maxf(w, h)',
    '\t\tvar size: Vector3 = Vector3(span, 1.25, 0.08) if w >= h else Vector3(0.08, 1.25, span)',
    '\t\tvar col: Color = Color(0.70, 0.80, 0.90)',
    '\t\tif glows.has(rid):',
    '\t\t\tcol = glows[rid] as Color',
    '\t\tvar mat := _material("", col, false)',
    '\t\tmat.emission = col',
    '\t\tmat.emission_energy_multiplier = 0.35',
    '\t\t_add_box(',
    '\t\t\tVector3(float(d.get("x", 0.0)) + w * 0.5, 1.95, float(d.get("y", 0.0)) + h * 0.5),',
    '\t\t\tsize, 0.0, mat, false)',
    ''
  ].join('\n');
  // 插在 _system_font 之前，保证是顶层函数
  src = src.replace('func _system_font() -> SystemFont:', fn + '\nfunc _system_font() -> SystemFont:');
  changed.push('新增 _build_wall_decor_v2()');
}

// 5) 无碰撞设备台座：v2 布局任务点不再都压在掩体里，给贴地设备补一个 0.55m 台座
if (!src.includes('func _build_device_pedestals()')) {
  const call = '\t_build_wall_decor_v2()\n\t_build_lights()';
  if (!src.includes(call)) throw new Error('找不到 build() 墙饰调用锚点，停止补丁');
  src = src.replace(call, '\t_build_wall_decor_v2()\n\t_build_device_pedestals()\n\t_build_lights()');

  const ped = [
    '## v2：任务点不再都压在掩体顶面 —— 给「无掩体可用」的设备补一个纯表现台座。',
    '## 台座高 0.55m、无碰撞（不占通行、不进门净空判定），设备高度由',
    '## scene_extras._cover_top 兜底 0.57（= 0.55 + 0.02 间隙）对齐。',
    '## 不写进 map_v2.json 的 cover，方案层 127 件与 82 项校验不受影响。',
    'func _build_device_pedestals() -> void:',
    '\tvar marks := {}',
    '\tfor r: Dictionary in data.get("rooms", []):',
    '\t\tvar th: Dictionary = r.get("theme", {})',
    '\t\tvar mk: Array = th.get("mark", [])',
    '\t\tif mk.size() >= 3:',
    '\t\t\tmarks[String(r.get("id", ""))] = Color(',
    '\t\t\t\tclampf(float(mk[0]), 0.0, 1.0), clampf(float(mk[1]), 0.0, 1.0), clampf(float(mk[2]), 0.0, 1.0))',
    '\tvar targets: Array = []',
    '\tfor p: Dictionary in data.get("points", []):',
    '\t\ttargets.append(p)',
    '\tfor f: Dictionary in data.get("facility", []):',
    '\t\tif String(f.get("kind", "")) == "breaker":',
    '\t\t\ttargets.append(f)',
    '\tfor t: Dictionary in targets:',
    '\t\tvar px := float(t.get("x", 0.0))',
    '\t\tvar py := float(t.get("y", 0.0))',
    '\t\tvar covered := false',
    '\t\tfor c: Dictionary in data.get("cover", []):',
    '\t\t\tvar cx := float(c.get("x", 0.0))',
    '\t\t\tvar cy := float(c.get("y", 0.0))',
    '\t\t\tif px >= cx - 0.2 and px <= cx + float(c.get("w", 0.0)) + 0.2 \\',
    '\t\t\t\t\tand py >= cy - 0.2 and py <= cy + float(c.get("h", 0.0)) + 0.2:',
    '\t\t\t\tcovered = true',
    '\t\t\t\tbreak',
    '\t\tif covered:',
    '\t\t\tcontinue',
    '\t\tvar rid := String(t.get("room", ""))',
    '\t\tvar col: Color = Color(0.70, 0.78, 0.86)',
    '\t\tif marks.has(rid):',
    '\t\t\tcol = marks[rid] as Color',
    '\t\tvar mat := _material("", col, false)',
    '\t\t_add_box(Vector3(px, 0.275, py), Vector3(0.90, 0.55, 0.90), 0.0, mat, false)',
    ''
  ].join('\n');
  src = src.replace('func _system_font() -> SystemFont:', ped + '\nfunc _system_font() -> SystemFont:');
  changed.push('新增 _build_device_pedestals()');
}

fs.writeFileSync(GD, src, 'utf8');
console.log('补丁完成：' + (changed.length ? changed.join(' / ') : '已是最新，无改动'));
