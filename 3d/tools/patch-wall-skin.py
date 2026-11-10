# -*- coding: utf-8 -*-
"""幂等补丁：把 40 件墙饰从「主题色纯色占位」换成「本机 SDXL 成品贴图外饰」。

只改 map_builder.gd 的 _build_wall_decor_v2() 材质层：
  · 贴墙竖直板的几何、尺寸、位置、碰撞（无）全部不动；
  · _material() 的第一个参数由 "" 改为贴图名，albedo_texture 立即生效；
  · 贴图来源 3d/preview/assets/textures/*.png（本机 SDXL 成品，已 grade / seamless），
    med / fun 各含一张 room-wall-art.py 出的真图；
  · theme.glow 仍做微发光（0.35 → 0.12），避免主题色把贴图刷成一片色块。

用法： C:\\Python314\\python.exe 3d/tools/patch-wall-skin.py
再次运行会输出「已是最新，无改动」。
"""
import os

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
TARGET = os.path.join(ROOT, '3d', 'preview', 'scripts', 'map_builder.gd')

BLOCK = '''## v2：40 件墙面装饰 —— 外饰换成本机 SDXL 成品贴图，几何一件不动。
## 数据是 map_v2.json 的 decor[]；旧 scene_extras._build_decor 对新 kind 无匹配分支，
## 不会重复建模，也不会破坏原有 floor_mark / camera 的行为。
## 每舱一组贴图（med / fun 的首张即 room-wall-art.py 出的已 grade 真图），
## 配合 theme.glow 微发光区分房间；不跨舱复制同一组顺序。
const WALL_SKIN := {
\t"bridge": ["qwen/bridge/skin1", "qwen/bridge/skin2", "qwen/bridge/floor", "qwen/bridge/skin4"],
\t"cam": ["qwen/cam/skin1", "qwen/cam/skin2", "qwen/cam/floor", "qwen/cam/skin4"],
\t"ecosys": ["qwen/ecosys/skin1", "qwen/ecosys/skin2", "qwen/ecosys/floor", "qwen/ecosys/skin4"],
\t"power": ["qwen/power/skin1", "qwen/power/skin2", "qwen/power/floor", "qwen/power/skin4"],
\t"transit": ["qwen/transit/skin1", "qwen/transit/skin2", "qwen/transit/floor", "qwen/transit/skin4"],
\t"fun": ["qwen/fun/skin1", "qwen/fun/skin2", "qwen/fun/floor", "qwen/fun/skin4"],
\t"engine": ["qwen/engine/skin1", "qwen/engine/skin2", "qwen/engine/floor", "qwen/engine/skin4"],
\t"med": ["qwen/med/skin1", "qwen/med/skin2", "qwen/med/floor", "qwen/med/skin4"],
\t"armory": ["qwen/armory/skin1", "qwen/armory/skin2", "qwen/armory/floor", "qwen/armory/skin4"],
\t"warehouse": ["qwen/warehouse/skin1", "qwen/warehouse/skin2", "qwen/warehouse/floor", "qwen/warehouse/skin4"],
}
func _build_wall_decor_v2() -> void:
\tvar glows := {}
\tvar per_room := {}
\tfor r: Dictionary in data.get("rooms", []):
\t\tvar th: Dictionary = r.get("theme", {})
\t\tvar g: Array = th.get("glow", [])
\t\tif g.size() >= 3:
\t\t\tglows[String(r.get("id", ""))] = Color(
\t\t\t\tclampf(float(g[0]), 0.0, 1.0), clampf(float(g[1]), 0.0, 1.0), clampf(float(g[2]), 0.0, 1.0))
\tfor d: Dictionary in data.get("decor", []):
\t\tvar rid := String(d.get("room", ""))
\t\tif rid == "" or not d.has("side"):
\t\t\tcontinue
\t\tvar w := float(d.get("w", 0.3))
\t\tvar h := float(d.get("h", 0.3))
\t\tvar span := maxf(w, h)
\t\tvar size: Vector3 = Vector3(span, 1.25, 0.08) if w >= h else Vector3(0.08, 1.25, span)
\t\tvar col: Color = Color(0.70, 0.80, 0.90)
\t\tif glows.has(rid):
\t\t\tcol = glows[rid] as Color
\t\tvar skin := ""
\t\tif WALL_SKIN.has(rid):
\t\t\tvar arr: Array = WALL_SKIN[rid]
\t\t\tvar n: int = int(per_room.get(rid, 0))
\t\t\tskin = String(arr[n % arr.size()])
\t\t\tper_room[rid] = n + 1
\t\t# 近白 tint 保留 SDXL 材质本色；主题色只留一层微发光，不再刷满整块板
\t\tvar mat := _material(skin, Color(0.92, 0.95, 1.0), false)
\t\tmat.emission = col
\t\tmat.emission_energy_multiplier = 0.12
\t\t_add_box(
\t\t\tVector3(float(d.get("x", 0.0)) + w * 0.5, 1.95, float(d.get("y", 0.0)) + h * 0.5),
\t\t\tsize, 0.0, mat, false)

'''


def main():
    with open(TARGET, encoding='utf-8') as f:
        s = f.read()
    if 'const WALL_SKIN' in s:
        print('已是最新，无改动')
        return
    start = s.index('## v2：40 件墙面装饰贴墙竖直板')
    end = s.index('## v2：任务点不再都压在掩体顶面', start)
    out = s[:start] + BLOCK + s[end:]
    with open(TARGET, 'w', encoding='utf-8', newline='') as f:
        f.write(out)
    print('已替换 _build_wall_decor_v2：%d 字符 → %d 字符' % (end - start, len(BLOCK)))


if __name__ == '__main__':
    main()
