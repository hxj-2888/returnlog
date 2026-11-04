# 新返航录 3D 预演（独立子项目）

> 状态：**垂直切片 / 可行性验证**，不是正式 3D 客户端。
> 创建：2026-11-03 晚。引擎：**Godot 4.6 stable**（`89cea1439`，GL Compatibility）。
> 2026-11-04 早补：完整版（含 .NET / `GodotSharp`）已装，GDScript 工程两份编辑器读数一致，见 §3。
> 主项目 2.5D 的 `file://` 红线**不适用**于本目录；这里不通过 `index.html` 加载。

## 1. 这个预演回答什么问题

1. 现有 2.5D 的**地图数据**能不能直接升维成 3D 可走场景？
2. 现有**表面贴图**（地板 / 墙面 / 家具）在 3D 里还能不能用？
3. 现有**角色行走图**能不能先以 billboard 形式复用，还是要立刻做 3D 模型？
4. 真正的 **WASD + 鼠标视角** 在这个尺度下是否顺手？
5. 2.5D 的 `game.js` 代码能不能直接搬？答案：**不能直接搬，只能搬数据与规则口径**。

## 2. 已实现

- `js/data/map.js` → `3d/preview/data/map.json`（10 舱室 / 11 走廊 / 110 墙体线段 / 59 掩体 / 26 任务点）。
- 房间多边形铺地板 + 天花板；走廊按中心线铺 3.2 格宽地面；墙体按线段生成盒体碰撞。
- 掩体按 `cover` 矩形生成盒体碰撞，高度按 `kind` 映射。
- `CharacterBody3D` 玩家：**WASD 移动、鼠标视角、Shift 加速、Esc 释放鼠标**；不再点击地面。
- 手电 `SpotLight3D`、房间 `OmniLight3D`、环境雾、2D 角色 `Sprite3D` billboard。
- HUD：控制提示、当前舱室、FPS；自动截图模式；无头移动/碰撞自测。

## 3. 快速运行

```bash
# 便携版 Godot（不在 PATH 上）—— 标准版
GODOT="E:/ai-tools/godot/Godot_v4.6-stable_win64_console.exe"
# 完整版（含 .NET，2026-11-04 装）——要上 C# 时用这一份
GODOT="E:/ai-tools/godot/Godot_v4.6-stable_mono_win64/Godot_v4.6-stable_mono_win64_console.exe"

# 首次导入资源
"$GODOT" --headless --path 3d/preview --editor --quit

# 正常游玩
"$GODOT" --path 3d/preview --resolution 1280x720
```

操作：`WASD` 移动 · `Shift` 加速 · 鼠标视角 · `Esc` 释放鼠标 · 点击窗口重新捕获。

### 截图与自测

```bash
# 中央会议室机位
"$GODOT" --path 3d/preview --resolution 1280x720 -- --shot

# 走廊机位
"$GODOT" --path 3d/preview --resolution 1280x720 -- --shot --corridor

# WASD 位移（期望 1 秒约 4.2 米）
"$GODOT" --headless --path 3d/preview -- --walktest

# 走廊撞墙（期望约 1.1 米后停住，而不是 4.2 米）
"$GODOT" --headless --path 3d/preview -- --walktest --corridor --wall
```

2026-11-03 实测：

- `WALK_TEST distance=4.198524`（speed 4.2，1 秒；最终会议室机位）；
- 走廊撞墙 `distance=1.139070`（在墙前停住）；
- 截图输出在 `user://preview.png` / `user://preview-corridor.png`，实际路径会打印 `SHOT_PATH=`；
  仓库内留档：`3d/preview/screenshots/bridge.png` / `corridor.png`。

## 4. 资产复用结论

| 资产 | 结论 | 说明 |
|---|---|---|
| `js/data/map.js` | **可直接复用** | 通过 `3d/tools/export-map.cjs` 导出 JSON；房间 / 走廊 / 墙 / 掩体 / 任务点都能升维 |
| `assets/scene/v4/tex/*.png` | **可直接复用** | 地板 / 墙面 / 金属 / 桌面材质；3D 里按世界坐标平铺或 triplanar |
| `assets/scene/crew/crew-*.png` | **先做 billboard** | 4×5 帧、96×160/帧；当前用第一帧做 `Sprite3D`，只验证比例与可读性 |
| `assets/scene/cozy` 32×32 家具 | **只适合 billboard / 贴花** | 不是 3D 模型；要做真 3D 家具需 Blender 重做 |
| `assets/scene/v4/base-lit.png` | **不可直接复用** | 俯视烘焙底图；3D 需要重新打光/材质 |
| `js/game.js` | **不可直接搬** | DOM/Canvas 2D 编排；只能复用规则、数值表、事件 schema，代码要重写 |
| `js/ai/sanity.js` / `js/data/lines.js` | **可数据化复用** | 建议导出 JSON，作为 3D 模拟核心的配置；台词仍走同一套语料 |

## 5. 目录

```
3d/
  README.md                 本文件
  ARCHITECTURE.md           引擎/分层/数据/资产管线
  DECISIONS.md              ADR（为什么这样选）
  ASSETS.md                 素材来源、许可、哈希
  tools/export-map.cjs      map.js → map.json（唯一跨项目数据入口）
  preview/
    project.godot           Godot 4.6 工程
    scenes/main.tscn        唯一入口场景
    scripts/main.gd         场景装配 / HUD / 截图 / 自测
    scripts/player.gd       WASD + 鼠标视角 + 手电
    scripts/map_builder.gd  地图升维 / 碰撞 / 灯光
    data/map.json           由 export-map.cjs 生成
    assets/                 复制的贴图、角色图、许可证
```

## 6. 已知限制

- 门目前是墙体线段之间的缺口，没有动画门 / 自动门 / 扫描锁。
- 家具是盒体代理，不是精细模型；`cover` 的旋转信息未使用。
- 角色是单帧 billboard；没有行走动画、朝向、遮挡裁剪。
- 没有任务、会议、AI、管道、机器人、战斗、迷雾；这些仍在 2.5D 主项目。
- 没有导航网格；下一步用 `NavigationRegion3D` + `NavigationAgent3D`。
- 灯光是预演级；正式 3D 需要重新做曝光、阴影和材质。

## 7. 下一里程碑

1. **全船 blockout + 导航网格**：WASD 能走完 10 舱室 / 11 走廊，AI 能寻路。
2. **交互切片**：射线交互、任务点、尸体、会议圆桌，验证 3D 下的“可读性”。
3. **角色方案定稿**：billboard 还是低模；如果低模，走 Blender 5.2.2 管线。
4. **模拟核心分层**：把 `sanity.js` / `lines.js` / 事件 schema 导出为 JSON，3D 端重写确定性模拟。
5. **会议 UI**：Godot Control 还是内嵌网页；先做只读，不做网络。
