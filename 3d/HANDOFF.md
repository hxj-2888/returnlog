# 《启航路 3D 版》资产工程化 · 交接文档

> 交接日期：2026-11-05 · 交接范围：**只做工程预设与文档，不建模、不渲染、不改游戏逻辑**。
> 本轮同时把 2.5D 的「AI 推理优化」收尾并暂时结项，结论见 §7。
> 读者：下一个接手 3D 的人（可能是另一个会话 / 另一个人）。本文假设你没看过本轮对话。
>
> **最新交接：§12（2026-11-06 19:30 · 全船掩体重构 + Godot 主场景接线 + MCP 工具链）
> —— 接手先读 §1 与 §12，其余章节按需回查。**

---

## 1. 分支与边界（先读这一段，方向错了后面全白做）

| 项 | 口径 |
|---|---|
| 主产品 | 2.5D《新返航录》，`main` 分支，`file://` 直接可开，`index.html` 是入口 |
| 3D 产品 | **2.5D 的延伸**（Godot 4.6），副分支 `v1-preview`；**只有按键操作 / 维度 / 部分美术素材**可以不同，其余全部移植，见 `AGENTS.md` §一.11 与 ADR-0011 |
| 本轮改动落在哪 | 工程化骨架与文档提交在 `main`（`3d/` 目录本来就在 main 上）；**正式建模工作必须切到 `v1-preview`** |
| 共享的东西 | 地图 / 规则 / 语料 / 空间 / 任务 / 机器人数值**全部**从 `js/` 导出（`3d/tools/export-*.cjs`），推理与发言按 `spec/parity-map.json` 逐函数对账 |
| 不共享的东西 | 只有运行时宿主与呈现：DOM/Canvas vs Godot 场景、输入映射、渲染与 LOD —— 都属"维度"这一条允许差异 |

> ⚠ **不要再把 3D 当"另一个游戏"来写**（2026-11-09 用户裁定）。
> 旧口径「3D 端要重写模拟核心」作废：模拟规则以 `js/` 为唯一真源，3D 侧是**移植**。
> 想加 2.5D 没有的东西，先证明它属于维度产物，否则先在 2.5D 做（`MIGRATION.md` §10.1）。

**墙的红线**：2.5D 的墙是「零厚度线段 + 0.36 格通行判定 + 12° 正交烘焙投影」。
3D 里墙**必须是有厚度、有高度、有门洞的实体几何**（现状口径：厚 0.34 m / 高 1.16 m，
门洞宽 1.8 格）。斜墙 20 段需要 miter 转角件。不允许把线段直接拉成面片糊过去。
详见原仓 `docs/3D化审查_20261105.md`（本工程 `docs/` 已于 2026-11-09 清理）。

**美术分工（2026-11-07 用户裁定更新）**：**SDXL 与千问均可用于 3D 美术素材生成**
（解除 2026-11-06「一律 SDXL / 千问暂停」的限制；出图仍须本地生成）。
`assets/minigame/panel-*.png` 与千问新出图（Qwen-Image 2.1，Research License 非商用）
可用于本非商用项目的运行时（断口标注真源 `js/data/plates.js`，来源见
`assets/minigame/CREDITS.md`）；若未来转商用需换图或另行授权。

---

## 2. 本轮新落地的工程文件

| 路径 | 作用 | 已验证 |
|---|---|---|
| `3d/spec/conventions.md` | 单位 / 朝向 / 枢轴 / 命名 / 面数预算 / 与 2.5D 边界的**硬约定** | ✓ |
| `3d/spec/asset.schema.json` | 清单的 JSON Schema（draft-07，只用得到一小部分关键字） | ✓ |
| `3d/spec/assets.manifest.json` | **唯一真源**：29 项资产、状态、源/导出路径、预算、碰撞、许可 | ✓ |
| `3d/spec/godot-import.cfg` | Godot 4.6 glTF 导入参数唯一口径（27 个 key） | ✓ 实测 |
| `3d/tools/validate-assets.cjs` | 清单校验：schema / 命名 / 预算 / 文件落地 / 状态自洽 | ✓ 0 错误 |
| `3d/tools/check-godot-import.cjs` | 拿 `.glb.import` 与预设逐项比对（**只读**） | ✓ 0 差异 |
| `3d/tools/blender-export.py` | Blender 导出预设：单位检查 / 应用修改器与变换 / GLB 内嵌贴图 | ✓ Blender 5.2.2 实测 |
| `3d/tools/smoke-test.py` | 无真资产也能验证导出的自检（造一个带缩放 + 倒角的立方体） | ✓ 44 tris / 4.2 KB |
| `3d/tools/sync-models.cjs` | `3d/assets/export/*.glb` → `3d/preview/assets/models/`（sha1 去重） | ✓ |
| `3d/preview/assets/import-probe/` | 探针 GLB + 由 Godot 真实生成的 `.glb.import`，用作预设参照物 | ✓ |
| `3d/preview/scripts/probe_gi.gd` | 打印 GI 枚举常量并读回导入场景里 `MeshInstance3D.gi_mode` | ✓ gi_mode=0 |
| `package.json` | 新增 `plate:build` / `3d:assets` / `3d:sync:models` / `3d:import:check` | ✓ |
| `tools/plate/` | 「直接操控生成图里的电线」原型：板标注 JSON + 模板 + 编译 + 对齐探针 | ✓ 3/3 接线 |
| `tools/plate-demo.html` | 编译产物，**单文件、图片内联**，双击即开 | ✓ 见 §8 |

**刻意没做**：没有往 `3d/assets/export/` 塞任何占位 GLB；清单 `status=done` 强制要求
源 + 导出物都存在，塞空文件只会让校验失真。

### 命名冲突已规避

`启航路3D版` 分支上已有 `3d/tools/sync-assets.cjs`（同步**贴图/角色图**）。
本轮的同步脚本改名为 `sync-models.cjs`（同步 **.glb 模型**），两者合并时不打架。

---

## 3. 工具链与本机路径（2026-11-05 实测）

```
Blender   E:\SteamLibrary\steamapps\common\Blender\blender.exe   5.2.2 LTS
Godot     E:\ai-tools\godot\Godot_v4.6-stable_win64_console.exe  4.6 stable (GL Compatibility)
          E:\ai-tools\godot\Godot_v4.6-stable_mono_win64\...      （要 C# 时才用）
SDXL      E:\ai-tools\sdcpp  (Vulkan) + D:\ai-models\sdxl-base
Qwen      Qwen-Image 2.1 Turbo · Research License · 非商用 · 2026-11-07 解禁，可用于游戏内（转商用需换图/授权）
Node      playwright-core 已装（自动化截图/交互用）
```

```bash
# 首次导入 / 重新导入资源
"E:/ai-tools/godot/Godot_v4.6-stable_win64_console.exe" --headless --path 3d/preview --editor --quit

# 导出管线自检（不需要任何真资产）
"E:/SteamLibrary/steamapps/common/Blender/blender.exe" -b -P 3d/tools/smoke-test.py

# 单资产导出
blender -b 3d/assets/models/device_panel_fix.blend \
  -P 3d/tools/blender-export.py -- --out 3d/assets/export/device_panel_fix.glb

# 批量（只导 wip / done 且有源文件的）
blender -b -P 3d/tools/blender-export.py -- --manifest 3d/spec/assets.manifest.json --all
```

---

## 4. 清单现状

`npm run 3d:assets` 读数（2026-11-05）：

```
资产 29 项 · 状态 wip 3 / todo 15 / done 11
分类 ship 5 · room 10 · prop 5 · device 6 · character 2 · fx 1
预算合计 319,064 tris
提醒 3 条：ship_hull / ship_wall_segment / ship_floor_tile 标了 wip 但源文件未落地
```

- `wip` 允许只占位；`done` 会强制检查 `.blend` 与 `.glb` 都在，且面数不超预算。
- 每类面数上限见 `conventions.md` §3：`ship 120k / room 15k / prop 3k /
  device 8k / character 12k / fx 200`。
- 26 个任务点里已核实 **21 个**在 2.5 格内有真实 Blender 道具，
  因此最多 **10 张「设备特写板」**即可覆盖全部任务小游戏（见 `ASSETS.md`、
  `tools/blender-ship.py` 已有全船程序化建模，1391 行）。

---

## 5. 新做一个资产的标准流程

1. 在 `assets.manifest.json` 建条目（`status=todo`，填 `id / category / budget / pivot / collision / license`）。
2. `npm run 3d:assets` → 必须 0 错误。
3. 按 `conventions.md` 建模：米制 / +Y 前 / +Z 上 / 枢轴按字段 / 文件名 = `<id>.blend`。
   导出 `+Y Up`，灯和相机不进资产。
4. 改 `status=wip`，跑 `blender-export.py` 出 `<id>.glb`；面数超预算就在 Blender 里减面，
   **不要直接改清单上限**。
5. `npm run 3d:sync:models` 把 GLB 送进 `3d/preview/assets/models/`。
6. Godot 里按 `3d/spec/godot-import.cfg` 设置导入参数并重新导入；
   碰撞按清单 `collision` 字段在「高级导入设置 → 生成 > 物理」按节点勾。
7. `npm run 3d:import:check` → 必须 0 差异。
8. 全部齐了再改 `status=done`，再跑一次 `npm run 3d:assets`。

---

## 6. 导入预设里的三个坑（都是实测踩出来的）

1. **`meshes/light_baking` 默认是 `1`（Static Lightmaps）**，不是「关」。
   Godot 4.6 枚举实测 `DISABLED=0 / STATIC=1 / DYNAMIC=2`；我们设 0。
   探针验证：改前 `gi_mode=1`，改后 `gi_mode=0`。
2. **Godot 4.6 没有全局 `meshes/create_shapes`**，也没有 `materials/use_external`。
   碰撞是「高级导入设置」里按节点的选项；贴图处理是
   `gltf/embedded_image_handling=1`（Extract Textures）。预设里所有键名都来自
   引擎真实生成的 `.glb.import`，不是照旧文档抄的。
3. **图片相对路径在不同预览环境里会裂**。`tools/plate-demo.html` 现在把 PNG
   编成 data URI 内联（1.62 MB），任何地方双击都能开 —— 见 §8。

---

## 7. 本轮同时收尾：2.5D「AI 推理优化」暂时结项

用户本轮裁定三条：

| 裁定 | 落地 |
|---|---|
| **确信不松绑** | `known` 票在讨论期不被任何发言改动，也不被弃票盾挡；门禁有专门用例 |
| **AI 可以会议中改票** | 依据**别人当场说的话**改：早投 → 证言落地时重估 → 记录 `by / from / to / chg` 到 `m.voteStory`；只在自己的 `sus` 排序内改（`Δ > 0.10`，叠加公开声势上限 0.30），不跟风 |
| **「通胀降判断」不做** | `TESTIFY` 权重不动，`1/(1+3n)` 保持原样 |

门禁：`npm test` → **737 通过 / 0 失败**（新增 9 条改票结构化断言，含
「没有发言就没有改票」「三个人指认后 A 从 X 改到 Y」「确证票不动」）。
模拟：`node tools/monte-carlo.cjs --games 300 --seed 20261030` →
**人类 215 / 异形 85 / 超时 0 = 71.67%**，相对本轮前基线 69.3% 为 **+2.37pp**，
在 ±3pp 护栏内。报表新增三个读数并修了 `simGame` 结果快照漏字段（否则恒 0）：

| 读数 | 每局均值 | 发生过的局 | 最多一局 |
|---|---|---|---|
| `earlyVotes` 早投 | 14.413 票 | 100% | 42 |
| `voteChanges` 依发言改票 | 0.417 次 | 28% | 4 |
| `earlyKept` 早投保留到终局 | 1.320 票 | 56% | 13 |

改票不是每局都发生（28%），这符合「真人只在被说服时才改票」的口径；
确证票始终不动。

**1000 局复核**（`node tools/monte-carlo.cjs --games 1000 --seed 20261030`）：
人类 **714 / 71.40%**、异形 **285 / 28.50%**、超时 **1 / 0.10%**；
95% Wilson 区间 **68.52% ~ 74.11%**。相对 69.33% 基线 **+2.07pp**，仍在 ±3pp 内；
与 300 局的 71.67% 只差 0.27pp，说明样本量加大后结论稳定。
早投 14.121 票/局（100% 局）、改票 0.422 次/局（28.3% 局，最多 6 次）、
早投保留 1.267 票/局。结束原因：维修达成 420 / 异形全出局 294 / 人类全灭 285 / 超时 1。

**2.5D 暂时结项（当时口径）**：不再追加 AI 推理改动。剩余条目移入 backlog（§9）。

### 7.1 当晚追加（22:00 后）：平衡 + 推理继续推进

「暂时结项」随后被用户解除，本轮又做了两批，读数全部重跑：

| 批次 | 内容 | 门禁 | 1000 局人类胜率 |
|---|---|---|---|
| 平衡批次 `1c651c3` / `b1f2ae0` | 幽灵额度 2→1、红身 3→2s、加速 2s / +70%、人类近身视野 2.8→2.3、无人机救治 3→7s + 救起 3s 禁移动、移除异形开局 5s 禁刀 | **748 / 0** | **49.60%**（人类 496 / 异形 504，Wilson 46.51%~52.69%） |
| 推理批次 `d3c1cf7` | G1 envEstimate 接入 `topSus` 破平局；G2 去 soc 性格推断（改 `talkN`）+ LENS.lr 运行时排序；G3 行为序列 / 证言间关系 / 可达性反事实 | **756 / 0** | **48.40%**（人类 484 / 异形 515 / 超时 1，Wilson 45.31%~51.50%） |
| 保真 + 假设层（2026-11-06） | 模拟局同步执行讨论发言；G1/G2/G3 补专段门禁；新增多假说弃权 | **765 / 0** | **56.20%**（人类 562 / 异形 438 / 超时 0，Wilson 53.11%~59.25%） |


**推理批次的量化**：相对平衡批次的 49.60% 为 −1.20pp，在 ±3pp 内。
`reachImpossible` 平均 2.794 次/局（87.8% 的局发生）→ 可达性反事实确实在跑。

### 7.2 2026-11-06：模拟讨论保真 + 假设层

上一版 `startChatter` 里有一句 `if(G.simMode)return`，把三十多个发言回调在
蒙特卡洛里全部跳过 —— 背书、沉默判据、`talkN`、证言间关系因此恒 0。
现在模拟局把 `push` 改成**按同一顺序立即执行**（不排定时器、不复制第二套逻辑），
真实对局仍按时间铺开。于是这些机制第一次真正进入胜率读数。

同批实现**假设层**：`SKT2AI.hypotheses()` 把已有 `sus` 分布显式化成最多 3 个
并列假说（`mind.hyps` 随 `susAdd` 重算，`hypothesisSpread()` 每次实时重算避免用隔夜缓存）；
当前两名权重差 ≤ `MIND.hypGap=0.12` 且第一名 ≥0.25 时，没有确证/指控/准-确证的
人类 AI **弃权**而不是闭眼挑一个。它不新增任何嫌疑分，只改判断结构。

**本批 1000 局机制触达率**（之前恒 0 的那几项全部活了）：
`discussLines` 224.8 条/局（100% 局）、`silentSus` 25.8、`vouchHeard` 2.89、
`statementDamp` 0.437（15% 局）、`hypothesisAbstain` 20.86、`voteChanges` 0.928。
`reachImpossible` 2.527 次/局、`earlyVotes` 13.06 票/局。

**300 局同 seed A/B 归因**（门禁 765/0，A/B 开关对正式口径零影响）：

| 配置 | 人类胜率 | 假设层弃权/局 | 讨论发言/局 |
|---|---:|---:|---:|
| 全开（本批） | **58.67%** | 20.9 | ~225 |
| `--no-discuss 1`（还原旧模拟口径） | 49.67% | 28.3 | 0 |
| `--hypgap -1`（关掉假设层） | 50.67% | 0 | 207.5 |
| `--hypgap 0`（只剩权重完全相等才弃权） | 58.00% | 21.1 | 223.5 |

结论：**+8~9pp 主要来自假设层弃权，不是保真修复本身**。
保真修复单独只值约 +1pp（49.67% → 50.67%，在噪声内），它的作用是把
「背书 / 沉默 / 认错 / 领袖指令」产生的证据摆到台面上，让并列假说有机会形成；
真正改变胜率的是「两个假说难分高下就不投」这条判断结构。
弃权集中在**权重完全相等**的情形（hypgap=0 仍有 21.1 次/局），
因此若嫌 56% 太偏人类，收紧方向不是调小 `hypGap`，而是提高
「第一名最低权重」或要求两条假说都有实证支撑。

**归因用 A/B 开关**（`tools/monte-carlo.cjs`）：
`--no-discuss 1` 还原旧模拟口径，`--hypgap 0` 关掉并列假说弃权。
两个开关只作用于本次运行（模块级变量 / SKSanity 表），不改磁盘真源；
跑 300 局同 seed 对照即可把「保真修复」与「假设层」的贡献拆开。

⚠ **口径断点**：模拟讨论开始真正执行后，本批的胜率与 2026-11-05 及更早的
报告**不可直接横向比较**（讨论里的背书、辩护、认错、领袖指令现在都生效了）。

**注意**：平衡批次把人类胜率从 71.40% 拉到 49.60%（−21.8pp），
这是**有意的大幅位移**，接近 50:50，不是回归。若后续要回调，优先动
无人机 7 秒与幽灵 1 分额度这两个对人类侧最狠的闸门。

新增单一真源：`SKT2Space.GHOST_TASK_CAP`、`SKSanity.RED_BODY.dur`、
`SKSanity.MIND.silentTalk*`、`SKSanity.alibiReach()`、
`SKT2AI.sequenceCue()` / `statementRelation()`；新字段 `agent.talkN` / `agent.stunT`。
遥测新增 `reachImpossible` / `statementDamp`。门禁新增两段 8 条结构化断言读真源。

---

## 8. 「图内要素」原型（本轮唯一做出来的可交互画面）

用户诉求：**不要在图外面再画四根新线，要直接操控千问生成的那张配电板图里的电线。**

- 成品：`tools/plate-demo.html`（单文件，图片内联）。
- 原理：同一张 `panel-fix.png` 画两层，面层用 SVG mask 在**真实电线**上挖三处断口
  （16×30 px），底层是压暗虚化的同一张图当「面板内腔」。点断口两端 →
  mask 收拢 → 原始像素重新露出来，**没有新增任何一根线**。
- 三根线的坐标不是目测的：`tools/plate/snap.cjs` 用 HSV 颜色掩膜 → 局部质心 →
  PCA 主轴求切线角；`probe.cjs` / `zoom.cjs` / `_overlay.cjs` 用来核对对齐。
  最终蓝 `(431,499,125°)`、红 `(466,502,148°)`、黄 `(368,588,-2°)`。
- 交互实测：点两端 → 蓝线接上、缺口合拢、计数 1/3、零控制台报错。
- 之前「莫名其妙的图 / 像 JPG 破图图标」的原因：HTML 里用 `../../assets/minigame/panel-fix.png`
  相对路径，预览面板把 HTML 单独加载时取不到图。已改为编译期内联 + 裁切到接线区
  （`crop [268,378,284,284]`），现在画面以电线为主角。

`npm run plate:build` 从真源 `js/data/plates.js`（板描述唯一真源）重新编译
`tools/plate-demo.html` 并导出 `tools/plate/panel-fix.plate.json` 快照；
`npm run plate:check` 校验真源结构、语义与快照一致性。

**2026-11-06 更新**：这套板描述已落实进 2.5D 运行时（wire 玩法直接操控图内电线，
见根 `CHANGELOG.md` 同日条目）；3D 端做 B 方案（镜头推近 + Control 层）时应复用
`js/data/plates.js` 与 JSON 快照，不要另抄一份断口坐标。

---

## 9. 未做 / 待办（交接时请照这个清单往下走）

**本轮明确不做（用户裁定）**
- 确信 `known` 松绑、通胀降判断、假设层 —— 都不做。
- 3D 建模、渲染、场景装配 —— 本轮只预设工程文件。
- 2.5D 平衡调整 —— 不做。

**3D 方向 backlog**
- A/B 交互演示：A 方案已出片（`3d/preview/screenshots/启航路3D-任务交互对比.mp4`，
  1600×900 / 30fps / 38.2s），**B 方案（镜头推进 + Control 层）未开始**。
- `decor / facility / pipes` 三类场景件还没建。
- 墙体 miter 转角件、门框动画、导航网格（`NavigationRegion3D`）。
- 板原型扩产：从 1 张板 3 根线 → 10 张板约 40 根线；断口 16px → 24px。
  **已完成部分（2026-11-06）**：板 JSON schema 已固化（`tools/plate/plate.schema.json`
  + `validate.cjs`，`npm run plate:check`）；板真源 `js/data/plates.js` 已接进
  **2.5D 运行时**（wire 玩法直接操控图内电线，门禁 781/0）；
  `build.cjs` 从真源编译 demo 并导出 JSON 快照。剩余：为更多任务出独立板
  （**用 SDXL 出图**，见 §1 裁定）、断口 16→24px、`panel-breaker` 的 `lever` 图内化。
- 把 `启航路3D版` 分支与 `main` 合并时，确认 `3d/tools/sync-assets.cjs`（贴图）
  与 `sync-models.cjs`（模型）都保留；A/B 演示的 `demo.gd` 只在分支上。

**2.5D backlog（不删）**
- 2.5s 红体 / 加速解耦：**已由平衡批次完成**（红身 2s、加速 2s / **1.5 倍**，2026-11-06 用户裁定 70%→50%，门禁按真源读取）。
- G3 判断结构：会议时序早前已做；行为序列 / 证言间关系 / 可达性反事实**已在推理批次落地**。
  剩余的是更细的「假设层」（多假说并行维护）与「证言通胀降判断」——后者经用户裁定**不做**。
- 文档漂移治理：清单与规则已出，**正文订正未获批准，未改**。
- 历史遗留：脱湿速度文档里 4 处仍写 2.5，实际 `js/t2/space.js:97` 是 **2.7**；
  `js/game.js` 同处代码注释已顺手订正为 2.7。

---

## 10. 交接检查清单（接手第一件事照跑）

```bash
cd "C:/Users/ASUS/Desktop/新返航录"
npm test                    # 期望 781 / 0（2026-11-06 实跑口径）
npm run 3d:assets           # 期望 0 错误 / 3 提醒（提醒都是 wip 缺源，属预期）
npm run plate:check         # 期望 0 错误（板真源 schema + 语义 + 快照一致性）
npm run 3d:import:check     # 期望 0 差异
npm run 3d:sync:models      # 期望 done 资产全部 copy/same，todo 跳过
npm run 3d:export:map       # map.json（schema_version=1）
npm run 3d:export:minigames # minigames.json（10 型 / 26 任务）
npm run plate:build         # 重新生成 tools/plate-demo.html

# 3D 小游戏 / 设备（Godot 不在 PATH）
GODOT="E:/ai-tools/godot/Godot_v4.6-stable_win64_console.exe"
"$GODOT" --headless --path 3d/preview -- --mgtest       # 期望 10/10 pass
"$GODOT" --headless --path 3d/preview -- --devicetest  # 期望 27 devices / 10 kinds
"$GODOT" --path 3d/preview --resolution 1280x720 -- --e2e  # 期望 open/closed/unlocked 全 true
```

跑完再打开 `tools/plate-demo.html` 看一眼画面；如果又出现裂图，
先查 `build.cjs` 有没有把图片内联进去，而不是改相对路径。

---

## 11. 2026-11-06 追加：10 型小游戏全量落地 + 3D 场景装配

**状态**：已完成，未提交。工作落在 **`main` 的 `3d/` 目录**（当前工作区还有 2.5D 未提交改动），
没有切到 `启航路3D版`。合并时注意：分支上有 `demo.gd` / `sync-assets.cjs` / A-B 录屏，
本批新增的是 `scripts/minigame/`、`device.gd`、`scene_extras.gd`、
`tools/export-minigames.cjs`、`tools/build-3d-assets.py`、`tools/gen-panel-texture.py`，互不覆盖。

### 已经到了什么程度

- 26 个任务点 + 电闸 = **27 个交互设备**，10 种玩法（wire/place/lever/sync/pour/swap/align/aim/match/level）
  全部可玩；`minigames.json` 是唯一数据入口，2.5D 加任务标签后重跑导出即可。
- `E` 交互走真实输入路径：正对优先、距离次之；相机推近 → 卡片遮罩 → 成功自动收起 / 中断清零。
- 设施、**8 个管道口**（新增生态舱 / 娱乐室；除中央会议室 / 配电室外每舱一个）、
  32 个装饰、22 扇门框已经进 3D；设备按掩体顶面抬升并缩放。
  管道用 `prop_pipe_port.glb`（Blender + SDXL `pipe_hatch`，2336 tris），2.5D 同款精灵由
  `render-pipe-port.py` 渲染到 `assets/scene/v4/facility/pipe-port-<room>.png`。
- Blender 5.2.2 生成 11 件 GLB（设备 6 + 道具 5，含 `prop_pipe_port` 2336 tris），
  其余设备/道具 510–1838 tris，贴图内嵌；
  `3d:assets` 0 错误、`3d:import:check` 0 差异。
- 实测：`--mgtest` 10/10（含失败路径 held_open/closed/canceled 全 true）；
  `--devicetest` 27 devices / 14 kinds；`--e2e` open/closed/unlocked 全 true；
  `--pipeshot` 管道舱盖出图；`npm test` 785/0（2.5D 平衡/管道/26 任务定制批）。
- **2.5D 平衡回调（2026-11-06）**：RUSH 1.5 / 保安 6 格 / 当众合闸 10% / 8 管道；
  1000 局人类 59.5% / 异形 40.5%。随后按用户裁定接入 almost 真实阵营分流 +
  人类 AI 实际视野 + 异形指控队友，1000 局变为 **85% / 15%** —— 这是明确的失衡位移，
  下一步应回调 almost 分流或给异形补偿，不要回退实际视野规则。
- 截图：`3d/preview/screenshots/mg-*.png`（10 型）、`device-*.png`（8 件）、
  `scene-device.png`、`e2e-device-minigame.png`（真实 E 输入）。

### 本批未做 / 交接注意

1. **小游戏没有写回任务进度**：目前是交互切片，完成只收起卡片；下一步在 `main.gd` 的
   `on_done` 里接本地记分（不要直接改 2.5D `game.js`）。
2. **26 任务定制已同步**：2.5D 的 `TASKS`（26 任务 / 14 玩法）进入 `minigames.json#tasks`；
   3D 读取任务标题/提示/配色，新交互 sequence / sort / valve / code 暂时映射到现有 4 型。
   桌面已放 `启航路 3D 版.lnk`（指向 Godot 4.6 标准版 + `3d/preview`）。
3. **SDXL 新屏幕贴图已出低分辨率版**：本机 GPU 路径（diffusers / sdcpp Vulkan）都因
   16GB 内存 + 页面文件不足失败；最终用 `sd-cli --type q2_K --backend cpu -W 256 -H 256
   --steps 4` 出了 `device_screen_task.png`，再经 `grade-screen.py` 调暗加扫描线，已接在
   通用设备屏幕上。要特写级 768² 面板时，换内存余量足够的机器跑
   `3d/tools/gen-panel-texture.py`。
4. **门只有门框**：门扇/自动门/断电扫描锁、导航网格、AI、会议仍未做。
5. **资产体积**：`3d/assets/export` 42MB、`3d/preview/assets/models` 约 84MB（含 Godot 解包贴图），
   提交前先决定是否走 LFS 或只提交源 `.blend` + 校验脚本。
6. 继续用 `--mgtest` / `--devicetest` / `--e2e` 做回归；`--mgshot all` / `--devshot` 出图核对像素，
   不要只看「节点存在」。

---

## 12. 2026-11-06 晚间交接：全船掩体重构 → Godot 主场景接线 → MCP 工具链

> 交接时间：2026-11-06 19:30 · 范围：掩体重构方案、Godot 主场景接 v2、MCP 工具链、SDXL 真图。
> 前置：先读 §1（边界）与 §11（小游戏 / 场景装配现状）。**本节改动全部落在 `main` 的 `3d/`，
> 尚未提交**；工作区同时有另一个会话的 2.5D 平衡改动（根 `CHANGELOG.md` 17:16 批次），
> 提交时请分开，不要混成一个 commit。

### 12.1 一句话现状

10 间舱室的掩体从 **59 件重排到 127 件**（另加 40 件墙饰），方案链 **82/0** 全绿；
Godot 主场景已通过 `map_v2.json` 跑新布局（自测全过，实拍 `preview-v2-pedestal.png`）；
SDXL → grade → Blender 三阶段**真跑通 2 张样张**（其余 38 张待批量）；
MCP 工具链已装 `F:\AI-MCP\`，**唯一剩余阻塞是客户端点「信任」**。

### 12.2 这轮做了什么（按可验证顺序）

| # | 事项 | 产物 | 读数 / 验证 |
|---|---|---|---|
| 1 | 七条设计意见量化为 R1–R8（门厅净空、主通道、占用率、任务可达、分区层次、素材唯一、墙饰合风格） | `tools/ship-layout-spec.cjs` | 规则集中在 `RULES` 一处，改数值只改这里 |
| 2 | 全船 10 间重排，自动避让门 / 通道 / 切角 | `ship-layout-build.cjs` → `ship-layout-plan.json` + `ship-layout-overview.html` | 127 掩体 / 40 墙饰 / 61 房间专属 kind / 平均占用 21.9%（18.4–26.9）/ 22 门 / 26 任务点 |
| 3 | 独立校验器 | `ship-layout-check.cjs` → `ship-layout-report.md` | **82 项断言 / 82 通过 / 0 失败**（R1 20、R2 10、R3 10、R4 10、R5 10、R6 10、R7 1、R8 10、同步 1） |
| 4 | Blender 场景层 | `build-scene-v2.py` → `ship_scene_v2.blend` + `ship-scene-v2.png` | Blender 5.2.2 / **289 对象** / 2.31 s / 按舱室分 Collection |
| 5 | Godot 主场景接 v2 | `build-map-v2.cjs` → `map_v2.json`；`patch-map-builder.cjs` → `map_builder.gd` | cover 127 / decor 40 / points 26 / walls 110；导入 0 脚本错误 |
| 6 | 设备台座收尾 | `patch-map-builder.cjs` 第 5 段 → `_build_device_pedestals()` | 23 个无掩体顶面的任务点补 0.55 m **无碰撞**台座；`arttest 127/0`、`devicetest 27`、`mgtest 10/10` |
| 7 | SDXL 真图全链路 | `room-wall-art.py` 加 `--only`；2 张原图 + 2 张 grade 成品 | 512²/12 步/CFG 6.0，**43.1 s / 36.1 s**，seed 802/602；SHA256 登记 `3d/ASSETS.md` |
| 8 | Blender 风格检查板 | `room-wall-all.png` + `room_wall_all.blend` | 10 行 × 4 列，2 块贴真图、38 块主题色占位；EEVEE 64 samples 960×901 |
| 9 | MCP 工具链 | `F:\AI-MCP\`（181 MB）+ `~/.workbuddy-ai/mcp.json` | uv 0.13.7 / mcp-for-blender 2.2.7 / godot-mcp 0.1.1；`list_installed_plugins` 仍「无连接器」 |
| 10 | 文档与裁定 | ADR-0009 / ADR-0010、`3d/CHANGELOG.md`、`3d/ASSETS.md`、`3d/WORKFLOW_SDXL_BLENDER.md`、`tools/ship-layout-plan.md` §9 | 全部中文、带读数 |

### 12.3 文件地图（新增 / 修改）

**方案链（`tools/`，人工真源 + 生成物分离）**

| 路径 | 性质 | 说明 |
|---|---|---|
| `tools/ship-layout-spec.cjs` | **人工维护** | 规则 / 工作流 / 10 间排布 spec / 风格表。改布局只改这里 |
| `tools/ship-layout-build.cjs` | 生成器 | 自动避让门净空、主通道、管道口、切角；产出下面两个 |
| `tools/ship-layout-plan.json` | 生成物 | 机器可读方案（坐标 / 分区 / asset / prompt / seed / 统计） |
| `tools/ship-layout-overview.html` | 生成物 | 单文件可视化，支持叠加现状 / 聚焦单舱 / 图层开关 |
| `tools/ship-layout-check.cjs` | 校验器（只读） | 82 项断言，非 0 退出即失败 |
| `tools/ship-layout-current.json` | 现状快照 | 从旧示意图抽出，用于前后对比 |
| `tools/ship-layout-plan.md` | 说明 | 七条意见 → 八条规则、逐间设计、落地边界 |

**3D 场景（`3d/`）**

| 路径 | 性质 | 说明 |
|---|---|---|
| `3d/tools/export-layout-v2.cjs` | 生成器 | 方案 → `layout-v2.json`（Blender 端消费） |
| `3d/preview/data/layout-v2.json` | 生成物 | 10 舱 / 127 掩体 / 40 墙饰 / 110 墙段 |
| `3d/tools/build-scene-v2.py` | 生成器 | Blender 5.2.2 建全船场景，带版本守卫 |
| `3d/assets/models/ship_scene_v2.blend` | 生成物 | MCP 活会话可改写的场景起点 |
| `3d/tools/build-map-v2.cjs` | 生成器 | `map.json` + `plan.json` → `map_v2.json`（只换 cover / decor） |
| `3d/preview/data/map_v2.json` | 生成物 | **Godot 主场景实际读的数据**；不是第二真源 |
| `3d/tools/patch-map-builder.cjs` | 幂等补丁 | 5 处改动集中打到 `map_builder.gd`，可重复跑 |
| `3d/preview/scripts/map_builder.gd` | 已修改 | `MAP_PATH`→v2、61 个新 kind 高度、掩体取 theme.mark、40 件墙饰、23 个设备台座 |
| `3d/preview/scripts/scene_extras.gd` | 已修改 | `_cover_top()` 兜底 0.02 → 0.57（对齐台座） |
| `3d/tools/room-wall-art.py` | 工具 | SDXL → grade → Blender 四阶段，默认 dry-run，`--only` 出样张 |
| `3d/assets/textures/<room>/` | 生成物 | 每舱独立目录，禁止跨舱复用 |
| `3d/assets/renders/room-wall-all.png` | 生成物 | 风格检查板 |
| `3d/WORKFLOW_SDXL_BLENDER.md` | 文档 | 工作流口径 + 实测记录 |
| `3d/preview/screenshots/preview-v2*.png` | 生成物 | 主场景实拍（台座前后各一张，供视觉回归） |

**MCP 与文档**

| 路径 | 性质 | 说明 |
|---|---|---|
| `F:\AI-MCP\` | 工具链 | uv 0.13.7 / mcp-for-blender 2.2.7 / godot-mcp 0.1.1，缓存与 Python 全在 F 盘；`README.md` 有安装自检与连接器状态 |
| `C:\Users\ASUS\.workbuddy-ai\mcp.json` | 客户端配置 | `blender` + `godot` 两个 server，唯一 C 盘例外 |
| 原仓 `docs/调研报告_Blender_Godot_AI_MCP插件_20261106.md` | 调研 | 仓库元数据实拉、许可矛盾、选型理由与排除项 |
| `3d/DECISIONS.md` ADR-0009 / ADR-0010 | 裁定 | 方案层先行 / MCP 装 F 盘与写入授权、场景重构边界 |

### 12.4 怎么跑（照抄，别自己发明）

```bash
# 方案层：改 spec 后重建 + 必跑校验（必须 82/0）
node tools/ship-layout-build.cjs
node tools/ship-layout-check.cjs

# Godot 主场景：数据合成 → 打补丁（幂等）→ 导入自测
node 3d/tools/build-map-v2.cjs
node 3d/tools/patch-map-builder.cjs
"E:/ai-tools/godot/Godot_v4.6-stable_win64_console.exe" --headless --path 3d/preview --editor --quit
"E:/ai-tools/godot/Godot_v4.6-stable_win64_console.exe" --headless --path 3d/preview -- --arttest
"E:/ai-tools/godot/Godot_v4.6-stable_win64_console.exe" --headless --path 3d/preview -- --devicetest
"E:/ai-tools/godot/Godot_v4.6-stable_win64_console.exe" --headless --path 3d/preview -- --mgtest
# 出主场景实拍（非 headless）
"E:/ai-tools/godot/Godot_v4.6-stable_win64_console.exe" --path 3d/preview -- --shot

# Blender 场景层
"E:/SteamLibrary/steamapps/common/Blender/blender.exe" -b -P 3d/tools/build-scene-v2.py

# SDXL 样张（C:\Python314 才有 torch/diffusers；默认 dry-run，--execute 才真跑）
"C:/Python314/python.exe" 3d/tools/room-wall-art.py --stage plan
"C:/Python314/python.exe" 3d/tools/room-wall-art.py --stage sdxl --only med_vitalscreen --execute
"C:/Python314/python.exe" 3d/tools/room-wall-art.py --stage grade --room med --execute
"E:/SteamLibrary/steamapps/common/Blender/blender.exe" -b -P 3d/tools/room-wall-art.py -- --stage blender --test

# MCP（工具本体在 F 盘，配置在 C 盘客户端约定位置）
pwsh -NoProfile -File F:\AI-MCP\scripts\Start-BlenderMCP.ps1   # 必须在 UI 点过「信任」之后
```

### 12.5 未完成 / 阻塞（按优先级）

1. **MCP「信任」是唯一人工阻塞**：`~/.workbuddy-ai/mcp.json` 已写好，但
   `list_installed_plugins` 仍返回「无连接器」。必须在连接器管理页右上角
   「自定义连接器」对 `blender` / `godot` 点信任并重开会话，之后才能用 MCP 改写
   `ship_scene_v2.blend`。**Agent 无法代做。**
2. **38 张墙饰底图待批量**：`--stage sdxl --execute`（不带 `--only`），约 30 分钟；
   建议逐舱放行，逐张盯伪文字 / 跑题 / 跨舱雷同。
3. ~~**掩体本体仍是盒体 + 贴图 tint**~~ **已全覆盖：61/61 个 kind（2026-11-06 深夜）**，
   **2026-11-07 又做完第二轮细节迭代**。
   四批脚本：`build-covers-ecosys.py`（8，**2026-11-07 已改为真实尺寸并迁入 `covers_lib.py`**）、
   `build-covers-{warehouse,med,armory}.py`（19）、`build-covers-rest.py`（34，按舱跑）。
   `map_builder._add_cover_model()` 按 kind 实例化，尺寸走 `3d/preview/data/cover_refs.json`（实测包围盒，无缺项）。
   第二轮：本地 SDXL 出齐 **10 舱参考图**；`covers_lib.py` 加 `shell_pass()`（浅壳/压边/发光缝）
   与 `depth_ext()`（补进深）两道通用工序；指挥桌改八边形切角；设备点 `_build_device()` 统一外壳语言；
   **生态舱 8 件的 2.25~4.32× 拉伸已修**，全 61 件横向 >1.35× 从 16 降到 4、纵向失配 0。
   读数：单件 ≤2800 tris、合计 **6.25 MB**、0 件超预算；`--arttest` 127 件 / 0 不一致；
   `3d:assets` 0 错误；导入 0 报错。10 舱检查板 + 实机截图全在 `3d/assets/renders/` 与 `3d/preview/screenshots/`。
   改完模型必跑 `measure-cover-refs.py` → `sync-cover-height.cjs` →
   `node 3d/tools/check-cover-scale.cjs`（缩放 + 眼高审查），顺序不能反。
   **2026-11-07 09:55 追加**：所有掩体高度已统一补到 **1.70 m**（`SIGHT_MIN_H`，
   人眼 1.62 m 往上），因为 2.5D 的 `los()` 让每件 cover 无条件挡光、却没有高度概念。
   补的是后缘背板/立柱，**不拉伸家具本体**；验收用 `main.gd --eyeshot <room>`。
   **2026-11-07 12:32 追加**：3D 里 3 个任务设备曾被顶到 1.72 m（玩家够不着），
   已由 `scene_extras._task_placement()` 重定位到掩体外侧台座，新增 `--tasktest`（26/0）。
   全部掩体已接 PBR 贴图（`gen-pbr-textures.py` / `covers_lib.mat()`，256² JPEG），
   医疗无人机换成 67 件 GLB（`build-medbot.py`）。**注意实时帧率**：512² 三图版只有 10 FPS，
   256² 两图版 91~165 FPS；要再上分辨率须先做 Godot 侧共享材质。
   **2026-11-07 13:56 追加**：地板口径已归位到 **单一真源 `3d/preview/data/floor_spec.json`**
   （`blender-ship.py` 与 `map_builder.gd` 同读一份，禁抄第二份）。
   背景：3D 从未换过地板贴图（11 张 sha256 相同），换的是**重复尺度**
   （全局 4.0 vs 底图 per-room 2.8~7.5，med 单格 0.44 m vs 0.33 m）。
   验证用 `main.gd --floortest`（检查真实场景网格）+ `check-floor-spec.cjs`。
   **注意**：`tools/blender-ship.py` 的 `--dry` 是本轮新加的（原本没有，误用会覆盖入库底图）。
   天花板/台座已贴图化，新增 `--ceilshot` 仰视验收。
   **剩下的是别的层面**：墙体/设备贴图、生态舱多边形发光围板、
   LOD 与合批（现在 127 件各是一个节点）。细节与坑见 `3d/ASSETS.md` 2026-11-07 第二轮。
   **2026-11-09 追加（铁板暂关）**：上面那条 1.70 m 统一补高把 61 件家具全焊成等高铁板，
   用户裁定「暂时清掉地图里面的这种铁板方块，不要直接删」。做法是
   `covers_lib.SIGHT_MIN_H` 默认 **0**（`COVERS_SIGHT_MIN_H` 可覆盖）+
   `map_builder.gd` 的 `COVER_SIGHT_SHELL = false` 在实例化时隐藏 `sight_shell` / `sightglow`；
   **GLB、`cover_refs.json`、`COVER_HEIGHT`、碰撞盒、2.5D 判定全部没动**，
   改动前的实际素材备份在 `_backup/20261109_铁板配置/`（不入库）。
   验收：`--arttest` 的 `ART 铁板 hidden=254 可见铁板节点=0`。
   ⚠ 代价：「判定挡、画面不挡」重新出现 —— 下一步按实际顶面高度做 LOS，别再焊背板。
4. **检查板不是可导入资产**：`room_wall_all.blend` 是风格核对板，
   要进 Godot 还得做「贴到真实墙段」的 `<room>_wall.glb`。
5. ~~**2.5D 运行时地图未落地**~~ **已于 19:39 用户放行、当晚落地**：
   `js/data/map.js` 掩体 59 → 127（`tools/sync-map-v2-cover.cjs`），设施 4 处微调，
   门禁 **838/0**、1000 局 **78.8% 持平**（详见根 `CHANGELOG.md` 同日条目）。
   `3d/preview/data/map.json` 仍未改（Godot 读的是 `map_v2.json`）。
   注意：落地时发现新布局与 2.5D 的三处硬约束冲突（任务点不再压掩体 / 圆桌申请单落点被议席占住 /
   成组家具必然留窄缝），已在 `game.js` 里加了兜底与自检口径，改布局前先读那三条注释。
6. **门仍只有门框**：门扇 / 自动门 / 断电扫描锁 / 导航网格仍未做（§11 遗留）。

### 12.6 这轮踩到的坑（照这个避）

| 坑 | 症状 | 正确做法 |
|---|---|---|
| GDScript「警告当错误」 | `The variable type is being inferred from a Variant value` 直接编译失败 | 从 `Dictionary.get()` 取颜色/结构体时写显式类型 + `has()` + `as Color`，别用 `:=` 推断 |
| `blender -b` 起不了 MCP socket | `cannot start server in background mode` | MCP 活会话必须 GUI（`Start-BlenderMCP.ps1`）；批量渲染继续 `-b -P`，两条路分工 |
| `--e2e` 在 headless 下超时 | `E2E open=false` 然后卡住 | **旧布局同样如此**，不是回归；要验交互用 `--devicetest` / `--mgtest` |
| 2.5D 门禁偶发 1–2 项失败 | AI 投票断言随机抖动 | 连跑三次取稳定值（本轮第 3 次 826/0）；别为抖动改逻辑 |
| 切角舱放不下成排道具 | 生成器报「越界/切角」 | 先看 `poly` 不是 `rect`：bridge/ecosys/power/fun/engine 都是切角舱，成排区间要落在直墙段 |
| 墙饰与靠墙家具打架 | 俯视投影重叠 | 墙饰吃进墙面 0.24 格，家具内缩 0.3 格，两者不重叠 |
| `map_v2.json` 被误当第二真源 | 有人手改它 | 它由 `build-map-v2.cjs` 生成；改布局请改 `ship-layout-spec.cjs` 再重建 |
| 台座挡路 | 23 个缺口里 6 个在门净空/主通道 | 台座设 `collide=false`（`_add_box(..., false)`），只做视觉，不占通行 |
| Blender `use_nodes` 弃用警告 | 6.0 会移除 | 5.2.2 上不影响；新脚本照抄现有写法即可，别为警告改 API |

### 12.7 接手第一小时

1. 读 §1 + §12.1 + `MIGRATION.md` §10.1，确认「**3D 是 2.5D 的延伸**：只有按键/维度/部分美术可不同，
   其余移植；不要往 3D 加 2.5D 没有的东西」。
2. 跑一遍 12.4 的「方案层 + Godot 自测」六条命令，确认 82/0 与 `arttest/devicetest/mgtest` 全过。
3. 打开 `tools/ship-layout-overview.html` 与 `3d/preview/screenshots/preview-v2-pedestal.png`，
   对着看 10 间舱的分区、门净空、墙饰是否合眼。
4. 若 MCP 已信任：`Start-BlenderMCP.ps1` → 在对话里让 AI 读 `ship_scene_v2.blend` 的
   `get_scene_info`，先只读核对，再改一处墙饰做增量验证。
5. 选一件最不满意的房间（多半是仓库或生态舱），从「掩体本体建模」开始补，别再只调 tint。

### 12.8 交接检查清单（贴进下一位的开工单）

- [ ] `node tools/ship-layout-check.cjs` → **82/0**
- [ ] `node 3d/tools/patch-map-builder.cjs` → 「已是最新，无改动」（幂等）
- [ ] `grep "const MAP_PATH" 3d/preview/scripts/map_builder.gd` → `map_v2.json`
- [ ] Godot 无头导入 → 0 脚本错误
- [ ] `--arttest` → `件数=127` / `不一致=0`
- [ ] `--devicetest` → 27 设备 / 14 玩法
- [ ] `--mgtest` → 10/10
- [ ] `npm test`（2.5D）→ 826/0（偶发抖动连跑三次）
- [ ] `F:\AI-MCP\README.md` 的连接器状态是否已从「无连接器」变为已信任
- [ ] 提交时把 3D 改动与 2.5D 平衡改动**分成两个 commit**
