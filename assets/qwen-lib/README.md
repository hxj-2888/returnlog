# 素材库（PNG）· 千问本地生成

> **本目录为《新返航录》的千问素材库，全部 PNG 由千问本地模型生成。**
> 模型：Qwen-Image 2.1 Turbo（Q4_K_M）+ Qwen3-VL-8B-Instruct 文本编码器；
> runner：`E:\ai-tools\sdcpp\vulkan\sd-cli.exe`（Vulkan，8 步 / CFG 1.0 / euler）。
> **本地生成，不调用线上生图。** 许可：Qwen Research License · **非商用**
> （项目为非商用试玩版；未来发行/商用须换 Apache-2.0 的 Qwen 1.0 产物或取得授权）。

## 口径（2026-11-09 用户裁定 · 激进策略）

- **SDXL 已退役**：除**房间布局**、**走廊材质**（`floor-grate.png`）、**门**（`door-panel.png`）外，
  底图其余表面（舱室墙/地、家具/设备表面）一律用千问烘焙。
- **分辨率 ≥ 700×700**：原图 768²，无缝烘焙 1536²（四向镜像拼贴）。
- 过期 SDXL 素材已备份至 `_backup/`（不入库）后从项目删除，只留走廊与门。
- 清单见 `素材库清单.json`；每条 `label = "素材库 PNG"`。

## 目录内容

- `<rid>-wall_768.png` / `<rid>-floor_768.png`：10 舱墙/地原图（768²）。
- `baked/<rid>/floor.png`、`baked/<rid>/skin1.png`：1536² 无缝运行时贴图。
- `surf-<name>_768.png` + `baked/surf-<name>.png`：共享表面材质 swatch 与无缝版。

生成入口：`3d/tools/gen-qwen-room-skins.ps1`（舱室墙地 / `-SurfacesOnly` 表面材质）；
无缝烘焙：`3d/tools/bake-qwen-room-skins.py`。
