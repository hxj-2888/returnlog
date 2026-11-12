# 3D 美术 / 建模交接文档

> 交接时间：2026-11-11 · 交接对象：美术 / 建模代理
> 本文件是**开工前必读**。读完按 §3 的顺序再打开 5 份文件，不要直接改代码。
> 当前仓库：`C:\Users\ASUS\Desktop\新返航录 3D 版`（下文简称 `3D/`）。
> 2.5D 真源：`C:\Users\ASUS\Desktop\新返航录`（下文简称 `2.5D/`，只读）。

---

## 0. 一句话目标

**把 2.5D 的视觉语言 1:1 搬到 3D，不是另起一套美术。** 玩家在 3D 里看到的门、舱壁、天花板、
保安机器人、人物，必须能认出「这是同一艘返航录的船」。任何「我觉得 3D 这样更好看」的改动，
先问用户，不要自行决定。

---

## 1. 你的权限边界（先看这一节）

| 路径 | 归属 | 你能做什么 |
|---|---|---|
| `3D/3d/assets/**`（`.blend` / 原图 / 渲染） | 美术 | **可写**，新增/迭代 |
| `3D/3d/preview/assets/**`（运行时 glb / 贴图） | 美术 | **可写**，导出目标 |
| `3D/3d/tools/build-*.py`、`gen-qwen-*.ps1`、`bake-*.py`、`crop-*.gd` | 美术 | **可写**，参数化脚本 |
| `3D/3d/ASSETS.md`、`3D/3d/ART_*.md`、`3D/3d/preview/screenshots/**` | 美术 | **可写**，登记与验收图 |
| `3D/js/`、`3D/assets/`、`3D/audio/`、`3D/tools/`、`3D/index.html` | 2.5D 只读基线 | **禁止修改**（`baseline:check` 会报） |
| `3D/3d/preview/scripts/sim/**`、`main.gd`、`player.gd` | 规则同步代理 | **不要改**（正在做 2.5D 机制对齐） |
| `3D/3d/preview/scripts/scene_extras.gd`、`map_builder.gd` | 共用接线 | **先出 `WIRING.md` 提案，由规则代理合入** |
| `3D/3d/spec/gameplay-parity.json` | 规则同步代理 | **不要改** |

> 两个代理并行时，最容易撞的是 `scene_extras.gd` / `map_builder.gd`。
> 约定：**美术代理只交付资产 + 接线提案（函数名、行号、节点契约、替换前后截图），不改这两个文件。**
> 规则代理合入接线并跑门禁。这样两边不会互相覆盖。

---

## 2. 硬规则（违反即回退）

1. **生产工作流（强制）**：所有美术资产必须走
   **千问本地生图参考 → Blender 建模/渲染 → 导出 glb/贴图**。
   禁止用 `BoxMesh` 手搓几何当成品（门、天花板、机器人、设备一律不例外）；
   禁止 SDXL / 在线生图 / 素材站直接拖模型。
   依据：`docs/ASSET_GOVERNANCE.md` §11A。
2. **不删资产**：未经用户逐项确认，不得删除、移动、重命名任何资产文件。
3. **不碰只读基线**：`js/`、`assets/`、`audio/`、`tools/`、`index.html` 是 2.5D 镜像；
   3D 自己的资产在 `3d/preview/assets/` 与 `3d/assets/`。
4. **新 PNG 必须导入**：导出的贴图/glb 必须跑
   `godot --headless --path 3d/preview --import` 生成 `.import`，
   否则 `ResourceLoader.exists()` 返回 false，**贴图会静默不生效**（已踩过）。
5. **登记**：每件新资产追加到 `3d/ASSETS.md`；进入 `spec/assets.manifest.json` 的按 schema 填。
6. **体积**：发布包当前 **45.59 MB / 284 文件**（上限 50 MB）。
   新增运行时资产要算进预算；单张运行时位图 > 1 MB 会被 `guard` 点名。
7. **许可**：千问本地模型是 Qwen Research License（非商用）。转商用要换图或取得授权，
   并在 `CREDITS.md` 记录来源、prompt、seed。

---

## 3. 开工前按顺序读这 6 份

> **第 0 步（2026-11-12 用户裁定，强制）**：先按 `3D/docs/ASSET_GOVERNANCE.md` §14
> 检索并登记 ≥2 个公开来源（官方文档 / 开源实现 / 公开素材站），填完公开来源登记表才进入下面 6 份。
> 未登记不得建模、不得调灯光 / 曝光参数、不得改分辨率或渲染缩放、不得提交。
> **公开素材文件的直接使用须用户逐项批准；方法论与技术指导可直接吸收**（2026-11-12 用户裁定）。
> 用户原话：「必须先从公开素材那边找方法，而不是自己独自造轮子」。

1. `3D/AGENTS.md` §一 红线、§二 硬约束（含第 7 条「规则同源」）
2. **`3D/3d/ART_DIRECTION.md` 四条美术裁定的唯一真源**（门 / 天花板 / 保安机器人 / 人物）
3. `3D/docs/ASSET_GOVERNANCE.md` §11A 美术资产生产工作流
4. `3D/3d/ASSETS.md` 现有资产清单与历史迭代（很长，先看目录）
5. `3D/3d/CHARACTER_ART_PIPELINE.md` 人物写实方案（P1 用）
6. `3D/3d/ARCHITECTURE.md` §4 单位/坐标、§7 资产管线

---

## 4. 工具链（绝对路径，已核实）

| 工具 | 路径 / 版本 | 用途 |
|---|---|---|
| Blender | `E:\SteamLibrary\steamapps\common\Blender\blender.exe` · **5.2.2 LTS** | 建模 / 材质 / 烘焙 / 正交渲染 |
| 千问出图 | `E:\ai-tools\sdcpp\vulkan\sd-cli.exe` + `E:\ai-models\qwen-image-2.1\` | 参考图 / 平铺材质（512² ≈ 47 s） |
| Godot | `E:\ai-tools\godot\Godot_v4.6-stable_win64_console.exe` | 导入 / 编译校验 / 截图 |
| PowerShell | `C:\Program Files\PowerShell\7\pwsh.exe` | 跑 `gen-qwen-*.ps1` |

千问权重：
- `diffusion_models/qwen-image-2.1-turbo-Q4_K_M.gguf`
- `text_encoders/Qwen3-VL-8B-Instruct-UD-Q4_K_XL.gguf`
- `vae/qwen_image_2.1_vae_bf16.safetensors`

常用命令：

```bash
# 千问材质（只跑指定项）
pwsh -File 3d/tools/gen-qwen-materials.ps1 -Only knife-blade,knife-grip

# 裁成运行时贴图（去白边、缩到 384）
"E:/ai-tools/godot/Godot_v4.6-stable_win64_console.exe" --headless \
  --path 3d/preview --script "res://../tools/crop-materials.gd"

# Blender 无头跑建模脚本（示例）
"E:/SteamLibrary/steamapps/common/Blender/blender.exe" -b -P 3d/tools/build-medbot.py

# Godot 导入 + 编译校验
"E:/ai-tools/godot/Godot_v4.6-stable_win64_console.exe" --headless --path 3d/preview --import
"E:/ai-tools/godot/Godot_v4.6-stable_win64_console.exe" --headless --path 3d/preview --quit-after 3

# 门禁
npm run guard
npm run baseline:check
npm run 3d:import:check
```

---

## 5. 目录、命名与坐标契约

```
3d/assets/
  models/       # .blend 源文件（75 个 glb 对应的源）
  crew_refs/    # 人物参考
  refs/         # 舱室参考图
  renders/      # 渲染/对照图（.gitignore 已忽略 qwen-materials 等）
  textures/     # 源贴图
3d/preview/assets/
  models/       # 运行时 glb + 每模型贴图 + .import（1676 文件 / 142 MB）
  textures/     # 场景贴图（264 MB，含 cabin/ cover/ panel/ qwen/）
  weapons/      # 第一人称刀贴图
```

命名：

- 模型：`<room>_<object>.glb`，小写 + 下划线，例：`armory_ammocrate.glb`、`medbot.glb`。
- 贴图：`<model>_<material>_albedo.jpg` / `_normal.jpg` / `_rough.png`。
- 材质槽名要保留语义：人物必须包含 `suit` / `gear` / `accent` / `skin`
  （`crew_view.gd:185 _tint_model()` 按名字挂图和染色）；刀必须包含 `blade` / `grip`。

坐标 / 尺寸：

- **1 Godot 单位 = 1 米**（`3d/ARCHITECTURE.md` §4）。
- Blender 导出 glb 后：**模型正面朝 -Z**，Y 向上，pivot 在**脚下地面**（`z=0`）。
  `char_crew_lowpoly.glb` 已验证正面 -Z（胸带在 -Z 侧、背包在 +Z）。
- 门的通行参数来自 `space.json#door`：宽 1.8 m、高 2.5 m、开合半径 3/3.6 m、扫描 2 s。
  不要自己改这些数。
- 天花板高度 3.2 m（`map_builder.ceiling_height()`），房间顶灯在 2.6 m。

面数预算（按现有品类，超出要说明）：

| 品类 | 预算 |
|---|---|
| 小道具（杯子/工具/面板） | ≤ 2k tris |
| 家具 / 掩体 | 2k–6k tris |
| 门（双扇 + 框） | ≤ 1.5k tris |
| 保安机器人 | ≤ 4k tris |
| 医疗机器人 | 现有 `medbot.glb` 为准 |
| 人物 | 8,544 tris（2026-11-11 第三版重做；旧 1,812 体块仅作 blockout 对照） |
| 天花板模块 / 舱 | ≤ 1.8k tris |

贴图预算：

- 角色：身体 768² 图集 + 脸 768² + 头发 768²（albedo+normal；用户 2026-11-11 统一 768²，2048 目标取消）。
- 场景道具（门/保安机器人/天花板）：本轮统一 768² albedo+normal（rough/emissive 同 768²）；后续新资产沿用 768² 基准。
- 平铺材质必须**正交、铺满、无投影、无背景、可平铺**（见 §6 prompt 规范）。

---

## 6. 千问出参考图的规范

脚本：`3d/tools/gen-qwen-materials.ps1`（材质）、`3d/tools/gen-qwen-room-skins.ps1`（舱室）。

prompt 尾缀必须带：

```
seamless flat texture map, orthographic top-down view, evenly lit with no shadow,
fills the entire frame edge to edge, no object outline, no background, no perspective,
tileable, high detail
```

negative：

```
perspective, 3d object, product photo, shadow, gradient, vignette, white background,
border, frame, text, watermark, logo, person, hand, face, cartoon, sketch, blurry
```

参数：`--steps 8 --cfg-scale 1.0 --sampling-method euler --sigmas qwen-image-2.1-turbo -W 512 -H 512`。
产物先落 `3d/assets/renders/qwen-materials/`（已忽略），裁切后进运行时目录。
**每条 prompt 与 seed 必须记进 `3d/ASSETS.md` 或 `CREDITS.md`。**

---

## 7. 现状盘点（2026-11-11 实测）

**已有的**：

- 75 个运行时 glb（`3d/preview/assets/models`，1676 文件 / 142 MB）：10 舱设备、61 类掩体、
  医疗机器人 `medbot.glb`、角色 `char_crew_lowpoly.glb`、刀贴图等。
- 场景贴图 264 MB（`3d/preview/assets/textures`，含 `cabin/`、`cover/`、`panel/`、`qwen/`）。
- 第一人称刀已用千问材质（`assets/weapons/knife-blade.png` + `knife-grip.png`）。
- 人物已挂 4 张千问材质（`assets/models/crew_tex/crew-fabric/webbing/leather/skin`），
  但**没有 UV 展开、没有法线**，是平铺图直接按盒子面贴 → 近看拉伸。

**明显欠账（按用户点名）**：

| 资产 | 现状 | 证据 |
|---|---|---|
| **门** | 全部 `BoxMesh` 手搓（门柱/门楣/灯条/双扇），没有用 `door-panel.png` | `3d/preview/scripts/scene_extras.gd:501 _build_doors()` |
| **保安机器人** | `_robot()` 代码手搓：两个盒子 + 球眼 + 灯条 | `scene_extras.gd:618`；仓库里只有 `medbot.glb`，没有 `secbot.glb` |
| **天花板** | 单层平面 + 一圈发光灯带，没有结构层次 | `map_builder.gd:337` 天花板面、`:350 _add_ceiling_strip()` |
| **舱壁铁板** | 多舱共用同一套 `panel-metal.png`，没有按舱主题区分 | `3d/preview/assets/textures/panel-metal.png` + `rooms[].theme` 未被材质使用 |
| **人物近景** | 1,812 tri / 4 纯色 / 17 骨 / 259 KB；贴图有，UV 与法线没有（第三版已重做为 8,544 tris + 768² 图集） | `3d/CHARACTER_ART_PIPELINE.md` §七点六 |

> **2026-11-11 晚更新**：门、保安机器人、工业天花板三件 P0 已落地并接线，
> 人物第三版（截面放样 + 768² 图集）也已重做；清单见 `ART_DIRECTION.md` §10 与
> `ASSETS.md`「2026-11-11 · 美术方向四件套」。舱壁分舱材质仍是欠账。

---

## 8. 2.5D 参照物（必须照着做，不许自己设计）

| 参照 | 路径 | 用途 |
|---|---|---|
| 门板 | `2.5D/assets/scene/v4/tex/door-panel.png`（1536²） | 2.5D `drawDoors()` 在 `js/game.js:9393` 直接采样这张图；3D 门必须能看出同一块门板的分缝、螺栓、磨损 |
| 舱壁 | `2.5D/assets/scene/v4/tex/wall-panel.png`（1536²） | 舱壁基色/分缝 |
| 每舱墙/地板 | 素材层 `returnlog_assets/unreferenced/qwen21/2.5d/room-skins/<room>-wall_768.png`、`<room>-floor_768.png`（10 舱） | 逐舱材质差异 |
| 保安机器人 | `2.5D/assets/scene/v4/facility/secbot.png`（512² RGBA）+ `2.5D/tools/gen-facility-sprites.py:50` | **双足造型真源**；`drawRobotBody()` 的矢量圆头版只是冷启动兜底，不要照它建 |
| 全船底图 | `2.5D/assets/scene/v4/base-lit.png`、`hull-deck.png` | 舱室布局与配色总览 |
| 房间主题 | `3D/3d/preview/data/map_v2.json` → `rooms[].theme {wall, top, glow, gs, mark}` | 天花板/墙面色带的参数真源 |
| 当前 3D 截图 | `3D/3d/preview/screenshots/`（`bridge.png`、`bridge-blackout.png` 等） | 改前/改后对照 |

做法：Blender 里先按 2.5D 图**取色 + 量比例**（门板分割线位置、螺栓间距、色带宽度），
再建 3D。渲染时用与 2.5D 同角度的相机（俯视 12°）各出一张，并排放进验收图。

---

## 9. 三个 P0 资产的详细规格

### P0-A 门（替换 `_build_doors`）

- **已拍板：3D 滑门结构 + 2.5D 门板**（2026-11-11 用户裁定；详细映射、分缝落位、贴图派生见 `ART_DIRECTION.md` §3）。
- 结构：门框（左右立柱 + 门楣）+ 双扇滑门 + 顶部灯带 + 门侧状态灯。
- 尺寸：洞宽 **1.8 m**、高 **2.5 m**、门扇厚 0.10 m；门柱 0.16 × 2.5 × 0.30；门楣 2.2 × 0.26 × 0.30。
- 材质槽：`frame`（喷粉金属）、`leaf`（门板，采样 `door-panel.png` 的分缝/螺栓）、
  `strip`（自发光，颜色随房间 `theme.glow`）、`warn`（黄黑警示条，可选）。
- 必须保留的契约：
  - 节点树：每扇门一个 `Node3D` 容器，两扇 leaf 是它的子节点；
  - 动画：断电合拢 / 通电滑开，行程与 `space.json#door` 一致；
  - 碰撞：门洞通行宽 1.8 m，门扇合拢时阻挡；
  - 不要改 `scene_extras.door_update()` 的调用契约。
- 验收：近看能看出门板分缝、螺栓、磨损；开合不穿帮；贴图 ≤ 1024²；≤ 1.5k tris。

### P0-B 保安机器人（新增 `secbot.glb`）

- **已拍板：双足**（2026-11-11 用户裁定；造型真源是 `2.5D/assets/scene/v4/facility/secbot.png`，
  细节与尺寸见 `ART_DIRECTION.md` §4）。
- 旧手搓盒子只是尺寸包络，不是造型：0.62 × 0.90 × 0.50 躯干、头 0.34 × 0.24 × 0.30、
  眼/灯条在 **-Z** 侧、总高约 1.25 m。按 2.5D 贴图做成人形后，总高 1.25 m、
  最大宽 ≤ 0.60 m、最大深 ≤ 0.45 m。
- 结构：重装甲双足人形——红色目镜带、肩部红色警示条、背包天线、机械爪手、
  髋部电击棍（仅造型）、大腿/小腿红色识别条；**不要**照 `drawRobotBody()` 的圆头兜底做，
  也不要照旧规格加“胸前编号牌”。
- 材质槽：`paint`（装甲漆）、`accent`（红色识别/目镜）、`metal`（关节/爪/脚掌/电击棍）、
  `glass`（目镜罩，可选）；见 `ART_DIRECTION.md` §4.5。
- 贴图：albedo 1024² + normal 1024² + rough 512²（与 `medbot` 同规格）。
- 朝向 -Z，pivot 在脚下；≤ 4k tris；导出到 `3d/preview/assets/models/secbot.glb`。
- 接线提案：`scene_extras._robot()` 改为优先加载 `secbot.glb`，缺失时回退现有盒子版；
  标签 `Label3D` 保留。**不要直接改，写进 `WIRING.md`。**

### P0-C 天花板（替换单层平面 + 灯带）

- **已拍板：工业材质**（2026-11-11 用户裁定；材质表、结构与“是否外露梁管”的解释见
  `ART_DIRECTION.md` §2）。
- 目标：抬头能看到主梁、次级梁、管线/线槽、灯槽，而不是一块平板。
- 模块化：3 × 3 m 标准模块 + 边角/走廊模块；每舱按 `theme.top` 调基色、`theme.glow` 调灯带。
- 高度：板底 3.2 m；灯槽内凹 0.12 m；梁高 0.18–0.25 m。
- 预算：≤ 1.8k tris/舱；材质 2–3 槽（结构漆 / 灯带自发光 / 管线金属）。
- 必须保留：`map_builder.set_ceiling_visible(v)` 与 `ceiling_height()` 的 API；
  断电时灯带随 `set_power` 变暗（登记发射材质）。
- 验收：仰视截图与 2.5D 对应舱的顶面配色一致；暗房时只有应急灯。

---

## 10. P1：人物写实（严格按 `CHARACTER_ART_PIPELINE.md`）

- 拓扑：8,544 tris / 6 材质 / 17 骨 / `idle` `walk` `knife` `down` 四段动画；躯干/四肢放样，
  头为放样头型 + 独立发盖/刘海。
- UV：身体一张 768² 图集（suit / accent / gear / skin 分区）+ 脸 768² + 头发 768²；
  分区真源 `3d/tools/crew_atlas.py`，2048 目标已按用户要求取消。
- 法线：布纹、缝线、磨损由图集亮度派生；roughness ≥ 0.55 避免塑料感。
- 15 个席位共用一套图集，靠 `crew_view._tint_model()` 只给 `crew_suit` 乘色（材质名不能改）。
- 验收：1 m 内近看无拉伸、布纹可见；`--crewshot` + `render-crew-check.py` 三张近景。

---

## 11. 交付格式（给规则代理合入用）

每个资产一个目录/一批提交，包含：

1. 源文件：`3d/assets/models/<name>.blend`
2. 运行时：`3d/preview/assets/models/<name>.glb` + 贴图 + `.import`
3. 对照图：`3d/preview/screenshots/art-<name>-before.png` / `-after.png`（同机位）
4. 登记：`3d/ASSETS.md` 追加一节（尺寸、面数、材质槽、贴图尺寸、prompt/seed、许可）
5. **`WIRING.md`**：接线提案，格式：
   ```
   资产：secbot.glb
   替换：scene_extras.gd:618 _robot()
   契约：返回 Node3D，pivot 脚下，正面 -Z，高度 1.25 m
   回退：glb 缺失时保留盒子版
   验收：bottest / 巡逻截图
   ```
6. 提交信息：`art(<topic>): <资产> — <一句话>`；只提交你拥有的路径。

**不要**在同一个提交里改玩法脚本、`spec/gameplay-parity.json`、`AGENTS.md`。

---

## 12. 常见坑（都已踩过）

1. **贴图静默不生效**：新 PNG 没 `.import`。必须先 `--import`，再跑游戏。
2. **glb 缩放错**：Blender 导出要 `Apply Transform`；Godot 里 1 unit = 1 m，人物 1.75 m 高。
3. **朝向反**：模型正面必须 -Z；`look_at` 与胸带/背包方向已验证，别翻。
4. **材质名改了**：`crew_view._tint_model()` 按 `suit/gear/accent/skin` 匹配；
   改名会导致 tint 失效（回到纯色）。
5. **法线贴图色彩空间**：normal 必须设 `Normal Map`（Linear），albedo 设 sRGB；
   否则会出现塑料感/发灰。
6. **透明材质**：玻璃用 `alpha scissor` 或 `transparency`，不要用 alpha blend 叠半透明，
   排序会闪。
7. **体积**：单张运行时图 > 1 MB 会被 `guard` 点名；发布包上限 50 MB（现 45.59 MB）。
8. **不要动 `js/` 基线**：改 `assets/`、`js/` 会让 `baseline:check` 报 443 文件哈希漂移。
9. **不要用 `BoxMesh` 交付**：门/天花板/机器人/设备必须是 Blender 资产；盒子只能当占位。

---

## 13. 已拍板的 4 件事（2026-11-11）

| 议题 | 用户裁定 | 详情 |
|---|---|---|
| 门 | **复刻 3D 滑门结构 + 2.5D 门板材质** | `ART_DIRECTION.md` §3 |
| 天花板 | **采用工业材质** | `ART_DIRECTION.md` §2 |
| 保安机器人 | **双足**（按 2.5D `secbot.png` 的人形，不是新设计） | `ART_DIRECTION.md` §4 |
| 人物写实度 | **风格化写实**（低模 + UV + PBR 贴图/法线，不换高模） | `ART_DIRECTION.md` §5、`CHARACTER_ART_PIPELINE.md` |

> 四条裁定的唯一真源是 `ART_DIRECTION.md`；本表只做索引，不复制细节。
> 天花板“工业材质”按“工业表面 + 外露梁/管线/线槽”落地；若只要表面材质、不要外露结构，
> 按 `ART_DIRECTION.md` §2.1 的说明删结构项即可。

---

## 14. 本轮交接没有改动任何美术资产

本文只记录现状、规范、任务与接线契约；`3d/preview/assets`、`3d/assets` 均未改动。
规则同步代理正在做 2.5D 机制对齐（`sim_state.gd` / `main.gd` / `player.gd`），
与美术代理的文件边界见 §1。
