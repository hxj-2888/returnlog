# 3D 子项目变更记录

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
