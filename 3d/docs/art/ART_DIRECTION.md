# 3D 美术方向裁定（2026-11-11）

> 性质：用户拍板的**唯一真源**（专属文档）。本文只定义美术方向；判定、数值、语料、AI 行为仍以 2.5D `js/` 为准（红线 11）。
> 上游流程、权限边界、交付格式见 `ART_HANDOFF.md`，**不变**。本文回答其原 §13 的四个待拍板项，并锁定 §9 的 P0-A / P0-B / P0-C。
> 首批已于 2026-11-11 落地（门 / 保安机器人 / 工业天花板），落地清单与验收见 §10；
> 只读基线 `js/`、`assets/`、`audio/`、`tools/`、`index.html` 未改动。

---

## 0. 四条裁定

| # | 议题 | 用户裁定 | 落地对象 |
|---|---|---|---|
| 1 | 门 | **复刻 3D 滑门结构 + 2.5D 门板材质** | P0-A |
| 2 | 天花板 | **工业材质** | P0-C |
| 3 | 保安机器人 | **双足** | P0-B |
| 4 | 人物写实度 | **风格化写实** | P1 |

> 用户原话（2026-11-11）：「独家文档，并且采用风格化写实。天花板采用工业材质。门的话复刻3D滑门结构加2.5D门板，材质保安机器人采用双足。」
> 断句按语义拆分：门 = 3D 滑门结构 + 2.5D 门板**材质**；保安机器人 = **双足**。

两条口径先说死：

- **“2.5D 门板”** = `2.5D/assets/scene/v4/tex/door-panel.png`（1536²），即 2.5D `drawDoors()`（`2.5D/js/game.js:9393`）采样的同一张图。不是另画一张，也不是重新生成。
- **“双足”** = 2.5D 保安机器人本来的站立人形，不是新设计。该图的生成描述就是 `compact bipedal security guard robot, heavy gunmetal armor, red hazard stripe on shoulder, glowing red eye lens, stun baton on hip`（`2.5D/tools/gen-facility-sprites.py:50`）。3D 目前那台“两个盒子 + 球眼 + 灯条”是无腿占位（`3d/preview/scripts/scene_extras.gd:618`），本轮按 2.5D 补成人形。

---

## 1. 总风格：风格化写实

### 1.1 定义

**“风格化写实”不是照片级，也不是卡通。** 形体保留低模的清晰轮廓和大块面，写实感由**贴图、法线、粗糙度、光照一致性**承担；面数不为此增加。

四条可执行口径：

1. **形体**：大块面、硬边、倒角干净；不做微雕，不靠加面堆细节。
2. **材质**：PBR 参数分开——涂漆钢、裸金属、橡胶、布料、自发光各自一套；非金属 `roughness ≥ 0.55`，金属度只给真正的金属件。
3. **光照**：按低照度场景调（手电 7 m、暗舱为主）。albedo 不拉满，留高光余量；同一舱的磨损、油污、锈迹方向一致。
4. **颜色**：以枪灰/冷调暗金属为底，低饱和；红色、琥珀、青色只做识别色（警示条、灯槽、状态灯），不铺满大面。

### 1.2 适用对象

- 门、天花板、保安机器人、人物全部适用；人物另见 `CHARACTER_ART_PIPELINE.md`。
- 2.5D 已有的配色身份（`rooms[].theme` 的 wall / top / glow / mark）不改，只作为 3D 材质的乘色输入。
- 不改变现有世界尺度：1 Godot 单位 = 1 米；人物 1.75 m；门洞 1.8 × 2.5 m；天花板 3.2 m。

### 1.3 禁止

- 卡通描边、纯色塑料、镜面金属、过强法线（布纹法线 0.8–1.2，超过 1.5 会像塑料褶皱）。
- 照片级高模、在线生图、SDXL 新出图；本地出图统一走千问（红线 6）。
- 用“风格化”当借口改 2.5D 的造型、配色或规则；找不到 2.5D 依据的，先问，不要自己设计。

---

## 2. 天花板：工业材质

### 2.1 裁定与解释

用户原话是“天花板采用工业材质”。本文按 **“工业材质 + 外露结构”** 落地：工业材质需要梁、管线、线槽作为载体，否则只剩一块深色顶板，与现在的单层平面没有区别。

> 若你的本意只是换表面贴图、不要外露梁管，把 §2.2 的梁 / 管线 / 线槽删掉即可，材质与配色规则不变。这是本文唯一需要你复核的解释。

### 2.2 构成（沿用 P0-C，不改 API）

抬头应看到：

- **主梁**：沿房间长边，工字钢或方钢，梁高 0.18–0.25 m。
- **次级梁**：3 m 间距，与主梁垂直；节点用连接板/螺栓。
- **顶板**：压型钢板或冲孔吸音板，深灰，板缝对齐 3 m 节奏。
- **管线 / 线槽**：电缆桥架（开槽）+ 2–3 根金属管，沿主梁走，卡箍固定；不横穿房间乱拉。
- **灯槽**：内凹 0.12 m，灯带颜色取 `rooms[].theme.glow`；板底 3.2 m。
- **吊杆 / 牛腿**：细吊杆（约 0.02 m）每 3 m 一组，只做结构暗示，不加碰撞。

不做：矿棉板吊顶、全白光滑科幻板、下垂电缆、喷淋头/烟感/通风口等 2.5D 里没有的物件。

### 2.3 材质与预算

| 部位 | 材质语言 | metallic | roughness | 说明 |
|---|---|---|---|---|
| 顶板 | 涂漆压型钢 / 冲孔板 | 0.30–0.45 | 0.60–0.75 | 深灰，冲孔靠法线/粗糙度，不靠 alpha |
| 主梁 / 次级梁 | 镀锌钢 | 0.60–0.75 | 0.45–0.55 | 梁端与螺栓处磨损、轻微锈迹 |
| 管线 | 金属管 | 0.55–0.70 | 0.45–0.55 | 油污集中在卡箍附近 |
| 线槽 | 镀锌冲孔钢 | 0.65–0.75 | 0.50–0.60 | 与管线同色系，略暗 |
| 灯带 | 自发光 | — | 0.40 | `theme.glow`，登记进 `_emit_mats` |

- **几何节奏**：3 m 是贴图/结构节奏，不是每格独立网格；同类梁、吊杆用合并网格或实例化，预算按**每舱渲染三角面 ≤ 1.8k** 统计。
- **材质槽**：每舱 2–3 槽（结构漆 / 自发光 / 管线金属），不按舱生成 10 套贴图。
- **基色**：以金属灰为底，`theme.top` 只做轻微乘色，保持舱室可辨即可；不要把整块顶板染成高饱和蓝/橙。
- **贴图**：平铺、正交、无投影、无背景；**2026-11-11 用户要求统一 768²**（顶板/梁/管线/法线均 768²）。

### 2.4 契约与验收

必须保留：

- `map_builder.set_ceiling_visible(v)` 与 `ceiling_height()`（`3d/preview/scripts/map_builder.gd:268`、`:274`）。
- 断电时灯带随 `set_power` 变暗；暗房只保留应急灯。
- 天花板是**非交互面**：不加碰撞、不挡相机、不参与玩法。

验收：

- `--ceilshot <room>` 同机位 before/after（参考 `3d/preview/screenshots/ceil-bridge.png`、`ceil-engine.png`）。
- 仰视无放射状拉伸（当前 `ceil-bridge.png` 可见该问题，新模块必须消掉）。
- 与 2.5D 对应舱的顶面配色一致；暗房时只有应急灯。

---

## 3. 门：3D 滑门结构 + 2.5D 门板

### 3.1 结构 = 保留现有 3D 滑门

- 门框（左右立柱 + 门楣）+ 双扇中分滑门 + 门楣灯带 + 断电扫描线。
- 尺寸与行程全部读 `3d/preview/data/space.json#door`：洞宽 **1.8 m**、高 **2.5 m**、`open_r 3` / `close_r 3.6` / `speed 4` / `pass 0.6` / `scan_sec 2`；**不许手写**。
- 每扇 leaf：0.9 × 2.5 × 0.10 m；门柱截面 0.16 × 0.30 m；门楣 2.2 × 0.26 × 0.30 m（P0-A）。
- 保留节点/动画契约：`door_update()`（`3d/preview/scripts/scene_extras.gd:91`）与 `_apply_door_state()` 不改调用方式；两扇 leaf 是 `MeshInstance3D`，两个 blocker 是 `StaticBody3D`；`open > pass` 时撤碰撞；完全打开/关闭各响一次。
- 保留断电语义：`power_on=false` 且有活人靠近时，扫描 2 s 才滑开；扫描线红色，从下往上刷。

### 3.2 门板 = 2.5D 真源

**来源**：`2.5D/assets/scene/v4/tex/door-panel.png`（1536²，深色枪灰拉丝金属、三横压条、中缝、两侧竖向灯槽、螺栓与磨损）。2.5D 在 `drawDoors()` 里把图按左右两半画成两扇门板，3D 沿用同一分法。

**映射**：

- 沿宽度 50% 处切开：左半 → 左扇，右半 → 右扇；**不镜像**，中缝两侧的亮边与螺栓对得上。
- 每扇把半幅贴到 0.9 × 2.5 m 的正面；背面用同一半幅（U 向镜像），保证从舱内看也是同一块门板。
- 外侧各裁掉约 **2.5%**（贴图最外圈竖框与 3D 门柱重叠），中缝不裁；贴图顶部约 2% 的亮边可保留或裁掉，以门楣压住为准。
- 允许轻微纵向拉伸（半幅 1:2 → 门扇 0.9:2.5）；以分缝/螺栓的相对位置为准，不追求 1:1 像素比例。分缝落位按百分比：**13.5% / 47.6% / 81.4%** 门高 → 约 **0.34 / 1.19 / 2.04 m**。

**实测特征（供建模对位，取自 1536² 原图）**：

| 特征 | 位置（占门高/门宽） | 说明 |
|---|---|---|
| 横向压条 ×3 | 13.5% / 47.6% / 81.4% 高 | 近似等距；压条边缘磨亮，槽内压暗 |
| 中缝 | 46.5%–52.9% 宽 | 两扇各留一条亮边，关闭时形成暗缝 |
| 外侧竖框 | 2.5% / 97.4% 宽 | 带切角角板；上 UV 前裁掉，避免与门柱双层 |
| 琥珀灯槽（上） | 15.0%–33.5% 高 | 固定琥珀色，自发光 |
| 青色灯槽（下） | 64.6%–74.7% 高 | 固定青色，自发光 |
| 螺栓 | 压条与中缝/竖框交点 | 中缝交点两侧各 2 颗，共 4 颗一组 |

**PBR 派生**（不重新生成门板）：

- albedo 1024²：原图降采样；保留分缝、螺栓、磨损与拉丝方向。
- normal 1024²：从亮度/高度派生，强度 0.6–0.9；压条与螺栓凸起，凹槽下沉。
- rough 768²：亮度高处更光滑（磨亮边），暗处更粗糙；clamp 0.35–0.75。
- emissive 768²：只画两侧灯槽；琥珀/青色按原图固定，**不跟随 `theme.glow`**（它是 2.5D 门板的一部分）。
- 门楣灯带仍按 P0-A 读 `theme.glow`；扫描线保持红色。两者与门板灯槽分开，不混用。

### 3.3 材质槽与几何

| 槽 | 用途 | 说明 |
|---|---|---|
| `frame` | 门柱、门楣、门扇侧边 | 喷粉金属，与天花板结构漆同族，比顶板略亮一档 |
| `leaf` | 门扇正面/背面 | 2.5D 门板 albedo + normal + rough + emissive |
| `strip` | 门楣灯带 | 自发光，`theme.glow` |
| `warn` | 扫描线/警示（可选） | 红色；若不做独立件，用现有扫描线 |

- 门扇用 Blender 建的薄板 + 倒角，别再用 `BoxMesh` 交付；分缝与螺栓走贴图/法线，不做几何凸起。
- 门扇侧面用 `frame` 材质，不额外增加材质槽。
- 面数 ≤ 1.5k tris（双扇 + 框）；贴图 ≤ 1024²。

### 3.4 验收

- `--doorshot` 出关门/开门两张，同机位 before/after；近看能看出三道压条、中缝、螺栓、两侧灯槽与磨损。
- 开合行程与 `space.json#door` 一致；不穿帮、不穿墙、不挡人。
- 断电扫描 2 s 的节奏与 2.5D 一致；完全打开/关闭的提示音各一次。
- `npm run guard` 与 `npm run 3d:import:check` 不变红。

### 3.5 不做

- 不改 `door_update()` / `_apply_door_state()` 的语义，不改 `space.json`，不改 2.5D `drawDoors()`。
- 不把 2.5D 的“顶面 1.8 × 0.4 m 挤压比”带进 3D；只沿用门板图案与分缝关系。
- 不新增门禁状态、开门计时器、扫描阈值；一切读 `space.json`。

---

## 4. 保安机器人：双足

### 4.1 裁定与造型真源

用户裁定 **双足**。2.5D 本来就是双足人形，造型真源是 `2.5D/assets/scene/v4/facility/secbot.png`（512² RGBA，站立 3/4 视角），生成描述为：

```
compact bipedal security guard robot, heavy gunmetal armor,
red hazard stripe on shoulder, glowing red eye lens, stun baton on hip
```

**注意**：`2.5D/js/game.js:8934 drawRobotBody()` 里的矢量圆头机器人是 `file://` 冷启动兜底，不是造型真源；正常游玩看到的是 `secbot.png`（`2.5D/js/game.js:9284` 优先用贴图）。建模按贴图，不按兜底矢量。

### 4.2 尺寸与比例

| 项 | 数值 | 依据 |
|---|---|---|
| 总高 | **1.25 m** | 2.5D 贴图可见内容约 443 px / 512 × 1.50 格 ≈ 1.30 m；旧 3D 盒子 1.25 m 接近，保留 |
| 最大宽（含肩甲/手臂） | **≤ 0.60 m** | 贴图内容 213 × 443 px，固有宽高比 0.48；1.30 × 0.48 ≈ 0.62，取 0.60（略收，给肩甲留余量） |
| 最大深 | **≤ 0.45 m** | 2.5D 是正/3-4 立绘，深度无真源；按侧影收敛，不超过旧盒子 0.50 |
| 脚底 pivot | `z = 0` | `ART_HANDOFF.md` §5 |
| 正面 | **-Z** | 同上 |

> 不要把 2.5D 画布上的非等比拉伸带进 3D：2.5D 把 512² 图拉到 1.05 × 1.50 格，屏幕上是偏瘦的；3D 按贴图内容的固有比例（0.48）取宽，落在旧盒子的 0.62 m 包络内。

### 4.3 结构

按 `secbot.png` 做，**不自行改设计**：

- **头/传感**：与胸甲一体化的小型头部；上胸一条横向**红色发光目镜带**是视觉焦点；不另加圆球单眼。
- **肩部**：外扩肩甲；单侧肩部有**红色警示条**（2.5D 生成描述点名的特征）。
- **背部**：背包单元 + 单侧天线/桅杆（贴图顶部那根）。
- **手臂**：两条，垂到中腿；末端为机械爪/三指，不新增功能。
- **髋部**：**电击棍**（stun baton）挂在髋侧，只做造型，不参与规则、不做攻击动作。
- **腿**：双足；粗大腿、膝盖护甲、小腿装甲、大脚掌；大腿/小腿保留贴图上的红色识别条。
- **标识**：白色编号/标识按贴图落在小腿/脚部侧面；**不要**在胸口另造一块 P0-B 旧规格里的“编号牌”（2.5D 贴图没有）。
- **停摆**：按现有 3D 逻辑处理，不在模型里做裂纹/爆破解体；需要的话另提接线。

### 4.4 双足与步态

- 2.5D 的腿摆是 `sin(T*8)`、手臂反相、躯干颠簸 0.03 格；3D 以此为节奏起点。
- 巡逻速度 **1.6 m/s**（`3d/preview/scripts/sim/bots.gd:4`）。步幅/步频按这个速度调，验收看近景：脚掌接地期间不明显打滑；步幅不够时宁可提高步频（机械感），不要靠滑行掩盖。
- 至少交付 `idle` + `walk` 两段循环；`idle` 只做极轻的伺服微摆，不新增巡逻外状态。
- 朝向 -Z；巡逻转向由 `main` 改容器 `rotation.y`，模型不要自带转向逻辑。

### 4.5 材质与预算

| 槽 | 内容 | 参数建议 |
|---|---|---|
| `paint` | 枪灰重装甲漆 | metallic 0.35–0.50，roughness 0.55–0.70；边缘磨损露出浅金属 |
| `accent` | 红色警示条/目镜带 | 深红 albedo + 低强度 emission（0.3–0.6），暗舱可读即可，不投光 |
| `metal` | 关节/爪/脚掌/电击棍 | metallic 0.65–0.80，roughness 0.40–0.55 |
| `glass` | 目镜罩（若做透明） | 低粗糙、深色；不要用 alpha blend 叠半透明，按 `ART_HANDOFF.md` §12.6 |

- 贴图：albedo / normal / rough **统一 768²**；若单张 > 1 MB 被 `guard` 点名，优先改 BC7/KTX，不再降到 512²。
- 面数 ≤ 4k tris；导出 `3d/preview/assets/models/secbot.glb`；材质槽名保留 `paint / accent / metal / glass` 语义。
- 千问出图：重装甲漆、红色烤漆/警示条、磨损金属三张平铺材质；**不直接把 512² 的 2.5D 贴图贴到 3D 模型上**（分辨率/视角不够），它只做造型参考。

### 4.6 接线与验收

- 接线提案写进 `WIRING.md`：`scene_extras._robot()` 优先加载 `secbot.glb`，缺失时回退现有盒子版；`Label3D` 保留；不改 `main.gd` 的巡逻逻辑。
- 不改 `scene_extras.gd` / `map_builder.gd` 本体；由规则代理合入。
- 验收：`--bottest` 仍通过（巡逻位移、视野、拘留）；巡逻近景截图；glb 缺失时回退可见。

### 4.7 不做

- 不加履带、悬浮、轮式；不新增第二条腿以外的移动方式。
- 不给电击棍加攻击/缴械/眩晕规则；不新增机器人状态或阈值。
- 不改 `secbot` 的视野 6 格 / 180° / 拘留 30 s / 每夜 2 次；这些是规则真源，不是美术。

---

## 5. 人物：风格化写实

严格沿用 `CHARACTER_ART_PIPELINE.md`，本文只锁定风格，不改方案：

- **拓扑**：8,544 tris / 6 材质 / 17 骨 / `idle` `walk` `knife` `down` 四段动画；躯干/四肢截面放样，
  头为放样头型 + 独立发盖/刘海。旧 1,812-tris 方块体块仅保留在 `char_crew_blockout` 作对照。
- **UV + PBR**：身体一张 **768²** UV 图集（`crew-body_albedo/normal`）+ 脸 **768²** + 头发 **768²**；
  分区唯一真源 `3d/tools/crew_atlas.py`。用户 2026-11-11 要求统一 768²，**2048² 目标取消**。
  材质名不能改（`crew_view._tint_model()` 按名字染色）。
- **写实来源**：布纹/缝线/口袋/拉链画进图集，法线由亮度派生；roughness ≥ 0.55，避免塑料感；
  金属度只给扣具/拉链。
- **风格化边界**：保留低模的清晰剪影和 4 色 tint 识别；脸用千问风格化中性脸，不做照片级皮肤。
- **验收**：`--crewshot` 1 m 近景无拉伸、布纹可见；15 席共用图集 + tint。
- **2026-11-11 晚第三版**：用户否决第二版照片脸后重做；脸由参考图 img2img（seed 20261160），
  发盖/刘海独立几何；`crew_view` 只给 `crew_suit` 乘色，不再替换贴图。

---

## 6. 生产与出图规范（三件 P0 共用）

### 6.1 工作流

1. 千问本地出参考图 / 平铺材质（512²，8 步，CFG 1.0，euler，`qwen-image-2.1-turbo`）。
2. Blender 建模 / UV / 法线 / 材质 / 正交渲染。
3. 导出 glb + 贴图 → `godot --headless --path 3d/preview --import`。
4. `ASSETS.md` 登记（尺寸、面数、材质槽、贴图、prompt、seed、许可）；`WIRING.md` 写接线提案。
5. 跑 `npm run guard`、`npm run 3d:import:check`；截图 before/after 同机位。

**例外**：门板直接采样 2.5D `door-panel.png`，不重新生成；保安机器人的造型直接参照 2.5D `secbot.png`，材质仍走千问。除此之外不许用 SDXL / 在线生图 / 素材站现成模型。

### 6.2 千问 prompt 尾缀与 negative

尾缀固定：

```
seamless flat texture map, orthographic top-down view, evenly lit with no shadow,
fills the entire frame edge to edge, no object outline, no background, no perspective,
tileable, high detail
```

negative 固定：

```
perspective, 3d object, product photo, shadow, gradient, vignette, white background,
border, frame, text, watermark, logo, person, hand, face, cartoon, sketch, blurry
```

材质主题建议：

| 用途 | 主题词 |
|---|---|
| 天花板顶板 | `industrial pressed steel ceiling deck, dark gunmetal, stamped panels, subtle grime` |
| 天花板梁/管线 | `galvanized steel beam surface, worn edges, industrial` / `painted steel pipe, clamp marks, oil grime` |
| 保安装甲漆 | `heavy gunmetal armor paint, matte, chipped edges, fine wear` |
| 保安红色识别 | `deep red industrial warning paint, slightly worn, matte` |
| 保安关节金属 | `dark machined steel joint, oiled, worn` |

每条 prompt 与 seed 必须记进 `3d/ASSETS.md` 或 `CREDITS.md`；许可按 Qwen Research License（非商用）执行。

### 6.3 体积

- 发布包当前 **45.59 MB / 284 文件**（上限 50 MB，`ART_HANDOFF.md` §2.6）；单张运行时位图 > 1 MB 会被 `guard` 点名。
- 本轮运行时贴图统一 **768²**；三件 P0（门/机器人/天花板）的贴图合计约 2 MB，人物三张 768² 约 3 MB。
- 若与发布包叠加超限，优先用 BC7/KTX 压缩、把源图移出发布包，**不许静默超 50 MB**。

---

## 7. 首轮交付与评审

按 P0-A → P0-B → P0-C 各出一件样板，评审通过后再批量：

| 批次 | 交付 | 验收图 |
|---|---|---|
| P0-A 门 | 一扇门的 Blender 源 + glb + 贴图 + 接线提案 | `door-closed` / `door-open` before/after |
| P0-B 保安机器人 | `secbot.glb` + 贴图 + 回退 + 接线提案 | 巡逻近景 / `--bottest` |
| P0-C 天花板 | 一个舱（建议 bridge）的模块 + 贴图 + 接线提案 | `ceil-bridge` before/after |
| P1 人物 | 1 个样板角色的 UV + 图集（按 pipeline） | `--crewshot` 近景对照 |

每件交付都写清：源文件、运行时文件、`.import`、体积、面数、材质槽、prompt/seed、许可、before/after 截图。

---

## 8. 边界与不做

- 首批已落地：新增三件 P0 资产、脚本与接线；**未删除、未移动任何旧资产**。
- 不改 `js/`、`assets/`、`audio/`、`tools/`、`index.html`（2.5D 只读基线）。
- 不改 `scene_extras.gd` / `map_builder.gd` 本体；接线只走 `WIRING.md`。
- 不新增 3D 独有的门/机器人/天花板状态、计数器、阈值；不做规则分支。
- 舱壁分舱材质（`ART_HANDOFF.md` §7 的欠账）不在本轮四条裁定内，仍按原欠账处理。
- 若实现中发现 2.5D 没有依据、又确实需要的东西：先判断是不是真·维度产物；不是就先改 2.5D 真源，再导出/移植（红线 11、AGENTS §二.7）。

---

## 9. 待复核（仅一处）

**天花板的“工业材质”解释**：本文按“工业材质 + 外露梁/管线/线槽”落地（§2.1），首批已按该解释实现。若你只要表面材质、不要外露结构，删 §2.2 的梁/管线/线槽即可；Godot 侧 `_ceil_kit` 为空时只保留工业顶板，不需要改玩法。其余三条（门、机器人、人物）无待复核项。

---

*本文与 `ART_HANDOFF.md` 的关系：`ART_HANDOFF.md` 是流程/权限/交付契约，本文是四条裁定的唯一真源。两者冲突时，美术方向以本文为准；流程与权限以 `ART_HANDOFF.md` 为准。*

## 10. 首批落地（2026-11-11）

| 资产 | 结果 | 对照预算 |
|---|---|---|
| 门 | v2 `door_frame` 688 tris / 72 KB；`door_leaf_l/r` 各 448 tris / 约 476 KB；门板 768² albedo+normal+rough+emissive | 门双扇+框 ≤1.5k tris，达成 |
| 保安机器人 | `secbot` 3,776 tris / 685 KB / 0.592 × 0.45 × 1.25 m / 5 材质 / `idle`+`walk`；贴图 768² | ≤4k tris，达成 |
| 工业天花板 | `ceiling_beam` 36 tris、`ceiling_pipe` 52 tris、`ceiling_tray` 36 tris；bridge 42×16 约 **572 tris/舱**（5 主梁 + 7 次梁 + 2 管线 + 1 桥架） | ≤1.8k tris/舱，达成 |
| 天花板顶板 | `ceiling-deck.png` + normal + rough（**768²**）运行时材质；`CEIL_TILE_M` 2.4 → 3.0 | 2–3 槽，达成 |

实现取舍：

- 管线/桥架改为**连续长件**（沿房间长轴缩放），不挂卡箍/横档——3m 段缩放后卡箍/横档会被拉长；这样每舱面数从约 9.7k 降到约 572。若以后要卡箍/横档细节，再加分段变体并重新报预算。
- 门扇 UV 沿宽度 50% 切左右半幅；外侧裁 2.5%；emissive 只保留每半幅外侧 10% 的灯槽，中缝暖高光不发光。
- 保安机器人首版千问 `secbot-paint` prompt 含 “robot”，出成了机器人贴图；已去掉该词并重跑，当前为平铺钢板。其余两张（红色/关节金属）正常。
- 接线：`scene_extras.gd::_build_doors()` / `_robot()`、`map_builder.gd::_ceiling_material()` / `_add_ceiling_kit()`、新增 `secbot_view.gd`。门开合/碰撞/扫描/音效契约不变；`set_ceiling_visible()` / `set_power` 不变；缺 glb 回退旧盒子。

验证：

- `npm run 3d:assets`：**0 错误 / 3 提醒**（提醒是既有的 3 个 ship 占位源）。
- `npm run 3d:import:check`：**0 差异**。
- `npm run baseline:check`：`BASELINE OK`（文件数见本次输出）。
- `scene_extras.gd` / `map_builder.gd` / `secbot_view.gd`：Godot `--check-only` 通过。
- 截图：`artcheck-door.png`、`artcheck-secbot.png`、`artcheck-ceiling.png`；真实 bridge/armory：
  `artcheck-room-door.png`、`artcheck-room-ceiling.png`、`artcheck-room-secbot.png`。
- 全项目编译已恢复（并行代理的 `sim_state.gd` / `main.gd` 收尾后通过）；本批另出了
  68 秒实机演示片 `返航录3D_演示_68s.mp4`。

登记：`3d/ASSETS.md` 的「2026-11-11 · 美术方向四件套」；清单条目在
`3d/spec/assets.manifest.json`（7 项，status=done）。
