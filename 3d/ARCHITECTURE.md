# 3D 子项目架构（预演版）

> **架构边界声明（2026-11-04 · 档 1）**：本文件属于 **Godot 3D 独立子项目**，**不继承**主项目根 `ARCHITECTURE.md` 的三层架构（T1 工程大层 / T2 机制与执行层 / T3 验收层），也不占用其层号、不产生 `definedBy` / `serves[]` 边。主项目 `file://` / 经典 `<script>` 红线对本子项目不适用；素材许可、中文记录、数据单一真源、门禁留痕仍然适用。
> **注意（2026-11-09 用户裁定，ADR-0011）**：这里是**工程**边界，不是产品边界 ——
> 3D 是 2.5D 的**延伸**，模拟规则/数值/语料/AI 行为一律移植，不是另起一套。

> 目标：把 2.5D 的**数据与美术**当作资产，把 3D 当作一个新的运行时；
> 不把 DOM/Canvas 2D 的技术债带进来，也不假装 `game.js` 可以原地复用。

## 1. 引擎选型

| 引擎 | 结论 | 理由 |
|---|---|---|
| **Godot 4.6 stable** | **选它** | 免费、轻量、原生 3D、`CharacterBody3D` / `NavigationAgent3D` / Control UI 完整；GDScript 迭代快；Windows 导出简单；便携版不污染系统 |
| Blender 5.2.2 | **只做资产管线** | 建模、材质、烘焙、渲染都强；但它不是正式运行时（BGE 已删除）。不要把游戏循环写进 Blender |
| Three.js | 备选，不选 | 能复用 JS，但会继续绑在浏览器/DOM；3D 资产、关卡、导航、UI 都要自己搭，长期不如 Godot |
| Unreal / Unity | 不选 | 对 15 人单机 AI 局过重；安装体积、编译链、素材迁移成本都不划算 |

渲染后端先用 **GL Compatibility**：RTX 5060 Laptop 在 OpenGL 3.3 下稳定，预览够用；
将来要体积光、SSAO、复杂阴影再切 Forward+，不要一开始就上重管线。

## 2. 复用边界

### 可以直接复用

- **地图数据**：`rooms[].poly/rect/doors/label`、`corridors[].pts`、`walls[]`、`cover[]`、
  `points[]`、`pipes[]`、`facility[]`。通过 `3d/tools/export-map.cjs` 导出，3D 端只读 JSON。
- **表面贴图**：`assets/scene/v4/tex/*.png` 的地板、墙面、金属、桌面、警示条。
- **规则表 / 语料**：`js/ai/sanity.js` 的数值、`js/data/lines.js` 的台词，导出 JSON 后作为配置。
- **事件 schema**：`{kind,night,pt,t,actor,victim,room,x,y,...}` 继续沿用，复盘/遥测口径不变。

### 只能改造后复用

- **角色行走图**：`crew-*.png` 是 4×5 帧、96×160/帧的 2D sheet。预演用 `Sprite3D` billboard；
  正式版要么继续 billboard（Doom 式），要么 Blender 做低模 + 骨骼。
- **家具**：`cover` 现在是盒体代理；精细家具要 Blender 重做，不能把 32×32 俯视图当 3D 模型。
- **UI**：2.5D 的 HTML/CSS 会议界面可以借鉴信息结构，但 Godot 端要用 Control 重写。

### 不能直接复用

- `js/game.js` 的 DOM/Canvas 编排、点击寻路、2D 迷雾、`visibleAt` / `drawFog` 绘制。
- `assets/scene/v4/base-lit.png` 俯视烘焙底图：3D 要重新打光，不能贴到地面上充当地板。
- `index.html` 的脚本加载链：3D 工程不经过它。

## 3. 分层

```
3d/
  tools/          数据导出 / 资产同步 / 校验（Node，不参与运行时）
  preview/
    data/         引擎无关 JSON（map.json / minigames.json，将来 sanity.json / lines.json）
    scripts/
      sim/        纯模拟：状态、规则、事件（不读节点、不读输入）
      view/       3D 节点、材质、灯光、动画
      ui/         Control / HUD / 会议界面
      minigame/   玩家决策小游戏：遮罩层 + 10 型玩法（mg_*.gd）
      device.gd   任务点设备：GLB 实例 / 朝向 / 镜头落点
      scene_extras.gd  设施 / 管道 / 装饰 / 门框
      main.gd     装配与生命周期
```

硬规则：

1. **sim 不读 DOM、不读节点、不读鼠标**；输入只进 `intent`，由 view 层翻译。
2. **view 不改规则状态**；所有状态变化走 sim 的命令入口。
3. **数据只从 `data/*.json` 进**；不在 GDScript 里复制房间坐标、任务点、台词。
4. **事件流只写不改**：`logEvent` 等价物只追加，不参与判定。
5. **确定性**：模拟用显式 seed；`Math.random` 等价物只在 sim 的一处封装。
6. **每个跨层契约有版本**：`map.json` / `minigames.json` 都带 `schema_version`，变更写 ADR。
7. **小游戏数据只从 `minigames.json` 进**：任务名→玩法、提示、保底时长、板断口坐标
   全部由 `3d/tools/export-minigames.cjs` 从 2.5D 真源导出；GDScript 不另抄一份映射表。

## 4. 坐标与尺度

预演采用 **1 格 = 1 米**：

- 地图 98×94 格 → 98×94 米；走廊宽 3.2 米；墙高 3.0 米；天花板 3.2 米。
- 玩家速度 4.2 米/秒（与 2.5D 的 `MOVE_SPEED=4.2` 同数），Shift ×1.55。
- 角色 billboard 约 1.9 米高，和 96×160 帧的比例一致。

如果正式版觉得房间过大，应该改**全局尺度常量**（1 格 = 0.75 米等），
不要逐个房间手改坐标；尺度是架构常量，不是关卡数据。

## 5. 输入与移动

- 纯 **WASD**，不再有点击地面；鼠标只控制视角。
- `CharacterBody3D` + `move_and_slide()`；胶囊半径 0.35、高 1.7。
- 目前没有跳跃/蹲伏；正式版如果加，必须同时定义“能否越过掩体”的规则，
  不能让 3D 移动破坏 2.5D 的硬掩体语义。
- AI 将来用 `NavigationRegion3D` + `NavigationAgent3D`，不复制 2D A*；
  但**寻路结果要能映射回房间/走廊语义**，会议与证据仍然按舱室说话。

## 6. 资产管线

```
Blender 5.2.2 ── 模型/材质/烘焙 ──┐
SDXL / Qwen-Image ── 贴图/概念图 ──┼─→ assets/ ──→ Godot 导入
2.5D 现有贴图 ────────────────────┘
```

- Blender 只用权威版本 `E:\SteamLibrary\steamapps\common\Blender\blender.exe`（5.2.2），
  渲染规范沿用主项目 AGENTS.md。
- 每张新贴图/模型登记到 `3d/ASSETS.md`：来源、许可、SHA256、用途。
- CC-BY 4.0 素材（`assets/scene/cozy`、`assets/scene/rooms`、`v4/CREDITS.md`）
  必须保留署名；3D 工程内已复制 `assets/licenses/`。
- 生成式素材（SDXL / Qwen-Image）不自动等于“可商用”；登记模型、提示词、seed、后处理。

## 7. 测试与留痕

- **无头冒烟**：`--headless --path 3d/preview --quit-after 3`，零脚本错误。
- **移动**：`--walktest` 断言 1 秒位移 ≈ 4.2 米。
- **碰撞**：`--walktest --corridor --wall` 断言在墙前停住（≈1.1 米）。
- **视觉**：`--shot` / `--shot --corridor` 出图，人工检查比例、贴图、遮挡。
- **小游戏**：`--mgtest`（14 型全过）、`--devicetest`（26 设备 / 14 玩法）、`--e2e`（真实 E 输入）。
- **玩家探针**：`--probetest` / `npm run 3d:probe`（2026-11-10）——真实 `InputEvent`
  按 E / 数字键 / 左键 / F2，验「异形按 E 放倒人」与 DEV 无敌/面板。
  **必须真实窗口**：headless 下 `MOUSE_MODE_CAPTURED` 不成立，左键会被「先夺回鼠标」分支吃掉。
- **截图/机位**（强制）：所有 `--shot/--crewshot/--doorshot/...` 一律
  `MOUSE_MODE_VISIBLE`，禁止捕获鼠标、转视角、误触攻击；`player.capture_mouse_on_ready=false`，
  `_exit_tree()` 释放。`--probetest` 是输入链测试，不是截图，必须分开跑。
  规范见 `AGENTS.md` §五.8。
- **视觉批量**：`--mgshot all`、`--devshot 0,4,7,8,13,26`，出图在 `preview/screenshots/`。
- 将来加 **golden screenshot**：固定机位、固定曝光、固定 seed，像素差异超过阈值就失败。
- 所有决策写 `3d/DECISIONS.md`；所有可见变更写 `3d/CHANGELOG.md`。
- 每次数据导出记录 `map.json` 的源文件哈希；每次下载模型记录仓库、文件、SHA256。

## 8. 已知风险

1. **2D 素材的“能用”与“好看”是两件事**：贴图升维能跑，但墙面 UV、法线、粗糙度都不足；
   正式版必须重做材质。
2. **billboard 角色在 3D 里会暴露“纸片感”**：转身、遮挡、阴影都要专门处理；
   如果玩家靠近，必须换低模或做多角度 billboard。
3. **会议室 / 长走廊的尺度**：42 米会议室在 3D 里会非常空；需要家具、灯带、隔断来填，
   不能只靠地板贴图。
4. **模拟核心重写成本**：`game.js` 的规则量很大，3D 版不能边写渲染边补规则；
   先把数据契约和事件 schema 定死，再写 sim。
5. **8GB 显存**：Qwen-Image 20B 量化版能下，但不等于能当日常贴图工具；
   先用小分辨率/少步数测速，再决定是否进入资产管线。
