# 全船掩体重构方案（v2 · 2026-11-06）

> 依据：`tools/ship-layout-overview.html` 的「现状 + 3 间预案」总体思路，
> 加上本轮用户提出的 **7 条意见**（含补充的「排布别杂乱、同类聚组、有层次感」）。
> 真源：`tools/ship-layout-spec.cjs` → `tools/ship-layout-plan.json`。
> 可视化：`tools/ship-layout-overview.html`；校验：`tools/ship-layout-report.md`。
> **边界**：本方案不改 `js/data/map.js`、`3d/preview/data/map.json`、任何游戏逻辑与平衡数值。

---

## 1. 七条意见 → 八条可校验规则

| # | 用户意见 | 落地规则 |
|---|---|---|
| ① | 不要有物品挡门，也不要离门很近，进门别有阻塞感 | **R1** 每扇门 ±2.2 格 × 向内 3.2 格为硬禁放区；并校验门洞到最近掩体 ≥1.0 格 |
| ② | 医疗间之类要继续填充，房间别太空 | **R5** 面积占用 18–30%，靠沿墙成组大件 + 配件层次，不靠撒小件 |
| ③ | 采用 SDXL 本地生图 + Blender 渲染的初步工作流 | `3d/WORKFLOW_SDXL_BLENDER.md` + `3d/tools/room-wall-art.py`（plan/sdxl/grade/blender 四阶段） |
| ④ | 重构地图的掩体分布 | 全 10 间重排：**59 件 → 127 件**，新增 40 件墙饰 |
| ⑤ | 允许墙面装饰，但要符合原本风格 | **R8** 每间 4 件、贴墙厚 ≤0.24 格、避门洞/管道口；题材与配色绑定 `rooms[].theme` |
| ⑥ | 不要素材复用，每间房有特点，不跨舱室引用 | **R7** kind / asset / 提示词 / seed / 贴图目录全部房间专属，跨舱零引用 |
| ⑦ | 排布别杂乱（点名娱乐室）；同类聚在一起、有层次感；参考现实建筑设计 | **R6** 功能分区 ≤4、每区主类 ≤2、同类不跨区、anchor→mid→accent 三档齐、成组率 ≥0.65；**R2** 主通道留空 |
| — | （工程自律） | **R3** 多边形内 / 不重叠 / 不压任务点；**R4** 任务点 2.5 格内有道具、管道口 2 格净空 |

现实建筑设计的三条借用：**沿墙布置（perimeter zoning）**、**主通道贯通（circulation spine）**、
**大件锚点 → 中件成排 → 小件贴附（hierarchy）**。中心一律留活动场，不做散点填空。

---

## 2. 全船读数（现状 → 方案）

| 舱室 | 掩体 | 墙饰 | 分区 | 占用率 | 成组率 | 层次 |
|---|---|---|---|---|---|---|
| 中央会议室 | 10 → **22** | 4 | 4 | 12.9% → **18.6%** | 0.86 | 3/3 |
| 监控室 | 4 → **7** | 4 | 3 | 18.1% → **18.8%** | 1.00 | 3/3 |
| 生态舱 | 7 → **16** | 4 | 4 | 14.8% → **21.0%** | 1.00 | 3/3 |
| 配电室 | 3 → **9** | 4 | 3 | 10.3% → **25.2%** | 1.00 | 3/3 |
| 食堂 | 3 → **7** | 4 | 3 | 11.7% → **22.0%** | 0.86 | 3/3 |
| 娱乐室 | 5 → **15** | 4 | 4 | 10.9% → **18.4%** | 0.93 | 3/3 |
| 引擎 | 5 → **11** | 4 | 3 | 13.8% → **26.4%** | 1.00 | 3/3 |
| **医疗间** | 6 → **15** | 4 | 4 | 14.5% → **26.9%** | 1.00 | 3/3 |
| 军械库 | 5 → **10** | 4 | 4 | 14.2% → **22.8%** | 1.00 | 3/3 |
| 仓库 | 11 → **15** | 4 | 4 | 12.4% → **19.0%** | 0.93 | 3/3 |

合计：掩体 **127** 件（原 59）· 墙饰 **40** 件 · 房间专属 kind **61** 类 ·
平均占用 **21.9%** · 22 扇门全部留净空 · 26 个任务点全部有真实道具。

**医疗间**（用户点名）：三扇门形成 T 形主通道；上墙 3 张病床 + 呼吸机，
右墙药柜 / 消毒柜上下分段，下墙 3 台补给推车，中央手术台 + 监护仪做焦点。
占用率 14.5% → 26.9%，但四面墙各自成组、中心仍空，不是堆满。

---

## 3. 娱乐室：从「散点纷杂」到四象限

原预案把街机、赛车、VR、点唱机、沙发、终端桌散点撒满 20×14 舱，读起来没有秩序。
新方案参考现实街机厅：

```
        上墙左：模拟机×2          中央通道          上墙：霓虹招牌
左墙 ┌ 街机×3（等距、同朝向、成一列） ┐   右上：娱乐桌×2 + 高凳×4
     └ 点唱机（靠任务点）            ┘   右墙：沙发×2 + 矮几
              下门净空                      管道口净空
```

- 一条贯通主通道把舱切成四象限，**每象限只放 1–2 类道具**；
- 同类型聚在一起：街机成一列、模拟机成一组、娱乐桌并排、沙发成列；
- 层次：大件沿墙 → 中件成排 → 高凳/矮几贴附；中央留活动场；
- 五间切角舱（bridge / ecosys / power / fun / engine）的成排道具全部收进**直墙段**，不压切角。

---

## 4. 逐间设计要点

| 舱室 | 排布思路 |
|---|---|
| 中央会议室 | 四门汇入圆桌环形通道；上墙导航台 3 连、记录台 2 连，下墙全息屏 4 连 + 两端边柜收口；圆桌 6 把环椅 + 4 根结构柱做层次 |
| 监控室 | 小舱沿墙三组：屏墙上、机柜右、操作台左下；中央 L 形通道，两扇门都不挡 |
| 生态舱 | 四门净空把四面墙切碎 → 培养罐整组落到下墙左段，中央巨树 / 水池 / 灌木成种植场，上墙浇灌 / 温控分列 |
| 配电室 | 单门一条横向检修通道；上墙电控柜、右墙变压器、下墙电闸，三组成排 |
| 食堂 | 上下门同轴贯通主通道，左就餐 / 右出餐两区；右下角绕开管道口净空放餐具回收 |
| 娱乐室 | 见上节 |
| 引擎 | 左墙反应堆列、上墙缸体带、下墙检修区，中间大块留空做检修与视线纵深 |
| 医疗间 | 见 §2 |
| 军械库 | 按「进门发放 → 中央工作台 → 下墙枪架」的动线分区；右墙靶道分两段绕开任务点 |
| 仓库 | 两组各四列纵向货架（行距 3.7 格、巷道净宽约 2.3 格），中间对齐门的 3.2 格主横通道，两端留端头通道 |

---

## 5. 素材唯一性与墙面装饰

- 每件掩体 `asset = <room>__<zone>__<kind>__<i>`；kind 一律房间前缀
  （`bridge_navconsole` / `med_medcab` / `warehouse_rack_west` …），**不再有全局 `table` / `console` / `crate`**。
- 同一房间内两套货架也拆成 `rack_west` / `rack_east`，避免同 kind 跨区。
- 40 件墙饰各自 `prompt = 房间风格提示词 + 题材`、`seed = 房间基 seed + 序号`，
  输出到 `3d/assets/textures/<room>/`；**不设 shared/ 目录**。
- 风格绑定 `map.json` 的 `rooms[].theme`（ADR-0007 导出）：暖白琥珀的会议室、
  冷白青蓝的医疗间、淡紫品红的娱乐室……题材也随功能走（星图 / 生命体征屏 / 霓虹招牌）。
- 墙饰只占墙面 0.24 格、贴墙、避门洞与管道口，不影响地面通行与视线。

---

## 6. 工作流（初步）

`3d/WORKFLOW_SDXL_BLENDER.md` 是完整口径，摘要：

```
node tools/ship-layout-check.cjs                          # 1 方案定稿，82/0
python 3d/tools/room-wall-art.py --stage plan             # 2 列出 40 件墙饰 / seed / 输出
python ... --stage sdxl --room <id> --execute             # 3 SDXL 本地出图（GPU diffusers fp16，512²/12 步）
python ... --stage grade --room <id> --execute            # 4 降亮 / 冷调 / 扫描线 → 512²
blender -b -P 3d/tools/room-wall-art.py -- --stage blender --room <id> --test
                                                          # 5 Blender 5.2.2 风格检查板
```

模型是 `D:\ai-models\sdxl-base`（diffusers fp16 变体）+ `vae-fp16-fix`，
本机已实测跑通的口径；sdcpp CPU q2_K 需要 SDXL GGUF，本机暂无、脚本会报错停下。
脚本默认 dry-run；**本轮未实际出图**，但 SDXL 三阶段 dry-run 与 Blender 占位检查板
（960×901，主题色占位）已实测通过，详见 `3d/WORKFLOW_SDXL_BLENDER.md` §4。
千问本地生图于 2026-11-07 解禁，SDXL / 千问均可作为 3D 美术素材来源（须本地生成）。

---

## 7. 校验

`node tools/ship-layout-check.cjs` → **82 项断言 / 82 通过 / 0 失败**
（R1 门净空 20、R2 主通道 10、R3 边界与重叠 10、R4 可达性 10、R5 密度 10、
R6 分区与层次 10、R7 素材唯一 1、R8 墙饰 10、HTML 与真源同步 1）。
明细见 `tools/ship-layout-report.md`。

---

## 8. 复现与文件清单

| 文件 | 作用 |
|---|---|
| `tools/ship-layout-current.json` | 现状快照（旧示意图内嵌数据抽出，用于前后对比） |
| `tools/ship-layout-spec.cjs` | **人工维护的方案真源**：规则、工作流、10 间排布 spec、风格表 |
| `tools/ship-layout-build.cjs` | 生成器：自动避让门 / 通道 / 管道口 / 切角 → plan.json + HTML |
| `tools/ship-layout-plan.json` | 机器可读方案数据（坐标、分区、asset、prompt、seed、统计） |
| `tools/ship-layout-overview.html` | 单文件可视化：分区 / 主通道 / 门净空 / 墙饰 / 现状叠加 / 聚焦单舱 |
| `tools/ship-layout-check.cjs` | 独立校验器（只读），产出报告 |
| `tools/ship-layout-report.md` | 校验报告 |
| `3d/tools/room-wall-art.py` | SDXL → grade → Blender 双入口脚本 |
| `3d/WORKFLOW_SDXL_BLENDER.md` | 工作流文档 |

```bash
node tools/ship-layout-build.cjs     # 改 spec 后重建
node tools/ship-layout-check.cjs     # 每次重建后必跑，必须 82/0
```

---

## 9. 落地边界与当前状态（2026-11-06 17:45 更新）

### 已落地（场景层，17:34 用户放行后）

- `3d/tools/export-layout-v2.cjs` → `3d/preview/data/layout-v2.json`：
  10 舱 / 127 掩体 / 40 墙饰 / 110 墙段 / 22 门 / 26 任务点，
  **新增文件，不覆盖 `map.json`**。
- `3d/tools/build-scene-v2.py` → `3d/assets/models/ship_scene_v2.blend`
  + `3d/assets/renders/ship-scene-v2.png`：Blender 5.2.2 LTS 实测 **exit 0 / 2.31 s**，
  289 个对象，按舱室分 Collection、墙体为 0.34×3.0 m 实体、掩体按三档高度着色。
  这就是后续 MCP 活会话里可直接改写的场景起点。
- MCP 工具链已装 `F:\AI-MCP\`（见 `3d/DECISIONS.md` ADR-0010 与
  `docs/调研报告_Blender_Godot_AI_MCP插件_20261106.md`）。

### 已接进 Godot 主场景（17:51 全权授权后）

- `3d/tools/build-map-v2.cjs` → `3d/preview/data/map_v2.json`：**原 `map.json` 的完整副本，
  只替换 `cover`（59→127）与 `decor`（32→40）**，rooms / walls / points / pipes /
  facility / art / theme 全部保留，任务点、交互半径、门与管道口径不变。
- `3d/tools/patch-map-builder.cjs`（幂等）→ `map_builder.gd` 四处改动：
  `MAP_PATH` 指向 `map_v2.json`；`COVER_HEIGHT` 并入 61 个新 kind 的高度；
  掩体底色改取该舱 `theme.mark`（不同 tint → 独立材质，不跨舱复用）；
  新增 `_build_wall_decor_v2()` 渲染 40 件贴墙板（取 `theme.glow`）。
  **不需要 GLB 坐标转换**：GDScript 沿用既有 `(x,y)→(x,z)` 口径。
- 实测：Godot 4.6 无头导入 **0 脚本错误**；`--arttest` → `theme=10/10 件数=127
  设备顶面一致性 检查=3 不一致=0`；`--mgtest` **10/10**；`--devicetest`
  27 设备 / 14 玩法开关取消全过；`--shot` 出主场景实拍
  `3d/preview/screenshots/preview-v2.png`。2.5D 门禁 **826 通过 / 0 失败**。
- **设备贴地已修（19:00 后）**：`map_builder.gd` 新增 `_build_device_pedestals()`，
  为 23 个无掩体顶面的任务点补 **0.55 m 无碰撞台座**（纯表现层、房间主题色、
  不占通行、不进门净空判定）；`scene_extras._cover_top()` 兜底对齐 0.57。
  方案层 127 件与 82 项校验不变，`arttest / devicetest / mgtest` 复跑无回归。
- `--e2e` 在 headless 下固有超时（旧布局同样如此）；MCP 客户端「信任」待用户操作。

### 仍未改动（按架构保留）

`js/data/map.js`（2.5D 地图真源）、`3d/preview/data/map.json`、`blender-ship.py` 建模口径、
`main.gd`、`test-v3.cjs` **全部未动**。按 ADR-0002，3D《启航路》是独立子产品，
不替换 2.5D 主产品；若日后要把新布局也同步进 2.5D，需单独放行 → `js/data/map.js` 换表
→ `npm test` + 蒙特卡洛复核（掩体变化影响视线 / 遮挡 / 平衡）→ `export-map.cjs` 重导。
