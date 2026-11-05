# 3D 子项目变更记录

## 2026-11-05 · 资产工程化预设 + 交接

> 本轮**只预设工程文件与文档，不建模、不渲染、不改游戏逻辑**；
> 同一轮把 2.5D 的 AI 推理优化收尾并暂时结项。

### 新增

- `HANDOFF.md`：交接文档（分支边界、工具链、清单现状、标准流程、未做项、检查清单）。
- `spec/conventions.md` / `asset.schema.json` / `assets.manifest.json`：
  硬约定、schema、**28 项资产清单**（wip 3 / todo 25 / done 0，预算合计 319,064 tris）。
- `spec/godot-import.cfg` + `tools/check-godot-import.cjs`：
  Godot 4.6 glTF 导入参数唯一口径（27 个 key），键名由引擎真实生成的 `.glb.import` 取得。
- `tools/blender-export.py` + `smoke-test.py`：导出预设与无资产自检。
- `tools/sync-models.cjs`、npm 脚本 `3d:assets` / `3d:sync:models` / `3d:import:check` / `plate:build`。
- `preview/assets/import-probe/` + `scripts/probe_gi.gd`：探针模型与 GI 读数验证。

### 实测

- `npm run 3d:assets`：28 项 / **0 错误** / 3 提醒（wip 缺源，属预期）。
- `npm run 3d:import:check`：**0 差异**。
- Blender 5.2.2 LTS 导出自检：44 tris / 4.2 KB GLB，单位与变换检查通过。
- Godot 4.6 stable 无头导入：GI 枚举 `DISABLED=0 / STATIC=1 / DYNAMIC=2`；
  引擎默认 `light_baking=1`（Static），按预设改 0 后 `MeshInstance3D.gi_mode=0`。
- 2.5D 门禁 `npm test`：**737 通过 / 0 失败**；300 局模拟人类 **71.67%**（基线 69.3%，+2.37pp，在 ±3pp 内）。
- 改票量化：早投 14.413 票/局（100% 局发生）、依发言改票 0.417 次/局（28% 局发生，最多 4 次）、早投保留 1.320 票/局。
- 1000 局复核：人类 714 / **71.40%**、异形 285、超时 1，Wilson 95% 68.52%~74.11%；
  相对 69.33% 基线 +2.07pp，与 300 局 71.67% 仅差 0.27pp，结论稳定。

### 决策记录

- 确信 `known` **不松绑**；AI 会议中可依他人发言改票；**「通胀降判断」不做**。
- 千问只做游戏外美术；游戏内贴图仍走 SDXL。墙在 3D 里必须是实体几何。

## 2026-11-03 · 垂直切片

### 新增

- `3d/preview`：Godot 4.6 工程，GL Compatibility。
- `3d/tools/export-map.cjs`：`js/data/map.js` → `3d/preview/data/map.json`。
- 房间 / 走廊 / 墙体 / 掩体的 3D 升维，盒体碰撞。
- `CharacterBody3D` 玩家：WASD、鼠标视角、Shift 加速、手电。
- 2D 角色 `Sprite3D` billboard（`crew-01.png` 第一帧）。
- HUD、自动截图、无头移动/碰撞自测。

### 实测

- 首次导入：17 个资源，零脚本错误。
- WASD：1 秒位移 **4.198524 米**（speed 4.2，最终机位）；首轮机位为 4.199974 米。
- 走廊撞墙：**1.139070 米**后停住。
- 截图：`preview.png`（中央会议室）、`preview-corridor.png`（走廊）；两机位约 **165 FPS**（1280×720）。
- 会议室圆桌改为 `CylinderMesh`，天花板加轻微自发光，避免“黑色大盒子”挡住视线。

### 已知限制

- 门是墙体缺口，没有动画门。
- 家具是盒体代理。
- 角色是单帧 billboard，没有行走动画。
- 没有 AI / 导航网格 / 任务 / 会议 / 战斗。
