# 《启航路 3D 版》资产工程化 · 交接文档

> 交接日期：2026-11-05 · 交接范围：**只做工程预设与文档，不建模、不渲染、不改游戏逻辑**。
> 本轮同时把 2.5D 的「AI 推理优化」收尾并暂时结项，结论见 §7。
> 读者：下一个接手 3D 的人（可能是另一个会话 / 另一个人）。本文假设你没看过本轮对话。

---

## 1. 分支与边界（先读这一段，方向错了后面全白做）

| 项 | 口径 |
|---|---|
| 主产品 | 2.5D《新返航录》，`main` 分支，`file://` 直接可开，`index.html` 是入口 |
| 3D 产品 | **《启航路 3D 版》，独立副分支 `启航路3D版`**，本质是另一个游戏，**不替换 2.5D** |
| 本轮改动落在哪 | 工程化骨架与文档提交在 `main`（`3d/` 目录本来就在 main 上）；**正式建模工作必须切到 `启航路3D版`** |
| 共享的东西 | 只有 `js/data/map.js`（经 `3d/tools/export-map.cjs` 导出）与 `assets/scene/v4/tex` 贴图 |
| 不共享的东西 | `js/game.js`、`index.html`、DOM/Canvas 编排、2.5D 的墙线段投影 —— 3D 端要重写模拟核心 |

**墙的红线**：2.5D 的墙是「零厚度线段 + 0.36 格通行判定 + 12° 正交烘焙投影」。
3D 里墙**必须是有厚度、有高度、有门洞的实体几何**（现状口径：厚 0.34 m / 高 1.16 m，
门洞宽 1.8 格）。斜墙 20 段需要 miter 转角件。不允许把线段直接拉成面片糊过去。
详见 `docs/3D墙体审查_20261105.md`。

**美术分工**：游戏内场景/面板贴图沿用 **SDXL**；**千问（Qwen-Image 2.1 Turbo）只做游戏外美术**
（宣传图、图标、概念图），不进 3D 资产管线。注意千问是 Research License、非商用，
交付时不要把它的图打进可分发资源。

---

## 2. 本轮新落地的工程文件

| 路径 | 作用 | 已验证 |
|---|---|---|
| `3d/spec/conventions.md` | 单位 / 朝向 / 枢轴 / 命名 / 面数预算 / 与 2.5D 边界的**硬约定** | ✓ |
| `3d/spec/asset.schema.json` | 清单的 JSON Schema（draft-07，只用得到一小部分关键字） | ✓ |
| `3d/spec/assets.manifest.json` | **唯一真源**：28 项资产、状态、源/导出路径、预算、碰撞、许可 | ✓ |
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
Qwen      Qwen-Image 2.1 Turbo · Research License · 非商用 · 仅游戏外美术
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
资产 28 项 · 状态 wip 3 / todo 25 / done 0
分类 ship 5 · room 10 · prop 4 · device 6 · character 2 · fx 1
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
| 推理批次 `d3c1cf7` | G1 envEstimate 接入 `topSus` 破平局；G2 去 soc 性格推断（改 `talkN`）+ LENS.lr 运行时排序；G3 行为序列 / 证言间关系 / 可达性反事实 | **756 / 0** | 见 `tools/mc-report.md`（本批跑完后的最新值） |

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

`npm run plate:build` 从 `tools/plate/panel-fix.plate.json` + `template.html` 重新编译。

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
- 板原型扩产：从 1 张板 3 根线 → 10 张板约 40 根线；断口 16px → 24px；
  板 JSON schema 固化（现在只有实例，没有 schema）。
- 把 `启航路3D版` 分支与 `main` 合并时，确认 `3d/tools/sync-assets.cjs`（贴图）
  与 `sync-models.cjs`（模型）都保留；A/B 演示的 `demo.gd` 只在分支上。

**2.5D backlog（不删）**
- 2.5s 红体 / 加速解耦：**已由平衡批次完成**（红身 2s、加速 2s / 1.7 倍，门禁按真源读取）。
- G3 判断结构：会议时序早前已做；行为序列 / 证言间关系 / 可达性反事实**已在推理批次落地**。
  剩余的是更细的「假设层」（多假说并行维护）与「证言通胀降判断」——后者经用户裁定**不做**。
- 文档漂移治理：清单与规则已出，**正文订正未获批准，未改**。
- 历史遗留：脱湿速度文档里 4 处仍写 2.5，实际 `js/t2/space.js:97` 是 **2.7**；
  `js/game.js` 同处代码注释已顺手订正为 2.7。

---

## 10. 交接检查清单（接手第一件事照跑）

```bash
cd "C:/Users/ASUS/Desktop/新返航录"
npm test                    # 期望 737 / 0
npm run 3d:assets           # 期望 0 错误 / 3 提醒（提醒都是 wip 缺源，属预期）
npm run 3d:import:check     # 期望 0 差异
npm run 3d:sync:models      # 期望 done 资产全部 copy/same，todo 跳过
npm run plate:build         # 重新生成 tools/plate-demo.html
```

跑完再打开 `tools/plate-demo.html` 看一眼画面；如果又出现裂图，
先查 `build.cjs` 有没有把图片内联进去，而不是改相对路径。
