# AGENTS.md — 新返航录（试玩版 · 返航录V3）

> **架构节点**（2026-11-04 · 按根 `ARCHITECTURE.md` 贴标）：本文件属 **文档栏**（跨会话团队契约），不隶属 T1/T2/T3；`flag: N`（红线与流程）/ `F`（读数）。
> **本文件服从 `ARCHITECTURE.md`，不自称真源**。下文「权威口径（2026-11-04 校对）」按 **F 档现行事实快照** 解读：`tools/mc-report.md` 是**第 3 层验收台账**，不是数值真源；数值真源在 `js/ai/sanity.js` 与 `js/data/map.js`。
> 现行架构为**三层**：T1 工程大层（AI 拟人化 ‖ 空间与资源 ‖ 玩家决策）→ T2 机制与执行层（原 L2+L3 合并同类）→ T3 验收层；层外参考层 R（`docs/_reference/`，不入库）与预增层 P（`docs/_planned/`）；体验层移出架构图，见 `docs/00-先导-游戏体验.md`。
> §三文件地图的「层」列将在档 1 重构时换为 `T1/T2/T3 + domain`；**§一红线、§二命令、§五改动流程原文保留**，历史踩坑记录保留为附录。

> **当前版本**：返航录V3.6（2026-11-03）· `package.json` 3.6.0
> **一句话**：11 人类 vs 4 异形的实时太空船对抗网页游戏；零依赖前端、无构建、`file://` 可直接运行。
> **接手顺序**：README.md → 本文件 → CHANGELOG.md → 再动代码。
> **权威口径（2026-11-04 校对）**：数值基线唯一真源是 `tools/mc-report.md`（生成 2026-11-03T11:50:27Z ·
> seed 20261030 · 1000 局 · 人类 **57.6% / 异形 42.4% / 超时 0**，Wilson 54.51~60.63）。§六 是它的摘录；
> §六 以后的逐批数字是**历史读数**，不是现行基线。门禁现值 **712 通过 / 0 失败**（2026-11-04 复跑）。
> 出仓素材以 `assets/MANIFEST.json` 为准，校验：`node tools/assets-check.cjs`。

## 一、红线（违反即回退）

1. **`file://` 必须可玩。** 禁止 `fetch()`、ES Module（`<script type="module">`）、构建/打包步骤，
   以及任何需要本地服务器才能加载的资源。所有脚本按顺序用经典 `<script>` 加载。
2. **`index.html` 是唯一加载清单。** 新增模块必须按依赖顺序插入，并同步更新 README 的「项目结构」；
   禁止在别处动态注入 `<script>`。当前顺序（与 `index.html` 一致）：
   `config/version → data/map → data/lines → ui/templates → engine/clock → engine/invariants → engine/geo → ai/sanity → ai/traits → game → main → ui/home → ui/replay`。
   **`ai/sanity.js` 必须排在 `ai/traits.js` 之前**：traits 的 `b()` 要读 `SKSanity.TRAIT_GAIN` 做方差压缩，
   `knifeBold / knifeWatcherCap` 也要读理智层的表。
3. **版本单一真源是 `js/config/version.js`（`SKConfig.version = '返航录V3.6'`）。**
   改版本必须同批改 `package.json`（`version` / `gameVersion`）并在 `CHANGELOG.md` 记录；
   界面版本号一律用 `[data-version]` 占位，由脚本填充，禁止散落硬编码。
4. **门禁必须全绿。** 改任何逻辑/数据后跑 `node tools/test-v3.cjs`，失败一律按回归处理；
   报告里必须写本次实跑的「X 通过 / Y 失败」，不得沿用旧读数。
5. **`window.SKV3._t` 调试 API 是门禁契约。** 可以新增方法，但不得删除/改名/改变现有方法语义
   （`state()`、`inv()`、`newGame()`、`kill()`、`tp()`、`openMeeting()`、`events()`、`frames()`、
   `replay()`、`litZone()` 等被 test-v3.cjs 直接依赖）。
   **写夹具时的三条硬规矩**（2026-11-03 各踩过一次，症状都是"断言静默失败、看不出原因"）：
   - `newGame()` 会**整个换掉 G 对象** ⇒ 必须 `t.newGame()` **之后**再 `const g = t.G()`。
     反过来的话后续赋值全打在已被丢弃的旧状态上，会议开不出来、`checkWin` 也不响。
   - `openMeeting()` 不带参数会去找**尸体**；要一场干净的会就写 `t.openMeeting('day')`，
     并且 `startVote() → closeVote() → finishMeeting()` 三步走全，
     少一步就会停在 `discuss` 阶段，`vote` 事件一个都不落（结算页/投票矩阵类断言会因此读 0）。
   - **"把闲人停到某处"必须停在暗舱**（如引擎室 9,52），不要停亮会议室：
     亮区放开后，亮舱里的人能顺着**相连直走廊**看到任意远（亮舱→走廊分支不看距离，只要求 LOS），
     拖尸/出刀/伪装类夹具会因此凭空多出一圈目击者。藏尸夹具就是这样以 2/12 的概率随机失败
     （旧写法停车 30,32），改停暗舱后 0/20。
6. **素材署名不可删。** `assets/scene/cozy`、`assets/scene/rooms` 为 CC-BY 4.0，
   `audio/` 为 CC0；对应的 `LICENSE.txt` / `CREDITS.md` 必须保留，二次分发同样适用。
7. **模块边界不许穿透。** 地图数据只放 `js/data/map.js`；几何/寻路只放 `js/engine/geo.js`；
   界面模板只放 `js/ui/templates.js`。不要在 `game.js` 里复制粘贴这些内容，也不要反向依赖对局状态。
8. **不引运行时第三方依赖。** 游戏必须是 0 依赖静态页面；Node 只用于本地服务器与测试工具。
9. **DOM id 双处同步。** 模板里的 id 在 `js/ui/templates.js` 与 `js/game.js` 都有引用；
   改名必须同批改两处并跑门禁。
10. **中文记录。** 提交信息、文档、注释一律中文；提交格式：`type(scope): 摘要`（feat / fix / docs / chore）。

## 二、命令

| 目的 | 命令 |
|---|---|
| 直接试玩 | 双击 `index.html` |
| 本地服务 | `npm start`（`node tools/serve.cjs`，默认 5173） |
| 全量门禁 | `npm test`（即 `node tools/test-v3.cjs`） |
| 门禁依赖 | 本仓 devDependency `playwright-core@^1.64.1`；`npm i` 后 `npm test` 直接可跑（2026-11-04 实测） |
| 指定 Playwright（后备） | 仅当 `node_modules` 缺失时：`PLAYWRIGHT_CORE=/path/to/playwright-core npm test` |
| 蒙特卡洛 | `npm run sim`（1000 局 AI 对 AI，seed 可复现；汇总 `tools/mc-report.md` **入库**；原始局 `tools/mc-results.json` 是本地工作文件，入库形态为 `tools/mc-results.json.gz`） |
| 调试模式 | `index.html?test`（跳过开局会议）/ `?dev`（DEV 面板）/ `&strict` |

### 本机环境（后续 Agent 直接照这个用，**不要再说"Blender 没装"**）

| 工具 | 绝对路径 / 说明 |
|---|---|
| Blender | **`E:\SteamLibrary\steamapps\common\Blender\blender.exe`**（Blender 5.2.2 LTS，Steam 版，**唯一权威渲染版本**，见下节） |
| 无头渲染 | `"E:/SteamLibrary/steamapps/common/Blender/blender.exe" -b -P tools/blender-ship.py -- --test` |
| 本地 SDXL | `D:\ai-models\sdxl-base`（fp16）+ `D:\ai-models\vae-fp16-fix`；`SDXL_MODEL` / `SDXL_VAE` 可覆盖 |
| Python | `C:\Python314\python.exe`（3.14.5，装了 torch 2.11+cu128 / diffusers 0.42 / transformers） |
| Playwright | 本仓 `node_modules/playwright-core`（devDependency `^1.64.1`；`node_modules/` 不入库，`npm i` 复现，驱动系统 Edge）。2026-11-04 前曾寄生在 `~\.workbuddy-ai\binaries\node\workspace\`，已收回本仓 |
| GPU | RTX 5060 Laptop **8GB**。SDXL 768² 一张 8~9 分钟、640² 约 4 分钟；出图前会 `VRAM free 0.00`，属正常 |

> Blender **不在 PATH 上**，也不在 `C:\Program Files` 下 —— 它在 E 盘 Steam 库里。
> 搜索时务必带上 `E:\SteamLibrary\steamapps\common\`，否则会误判"未安装"。
> 桌面上的 `Blender.lnk` 指向的就是这个路径。

### Blender 权威渲染版本（2026-11-01 定稿，**只准用这一个**）

**权威二进制**

| 项 | 值 |
|---|---|
| 路径 | `E:\SteamLibrary\steamapps\common\Blender\blender.exe` |
| 版本 | **Blender 5.2.2 LTS**，build hash `d13f752e3b9c`，build date 2026-09-15 |
| 内置 Python | 3.13.13（`5.2\python\bin\python.exe` 完整，含 4334 个文件） |
| 权威来源 | 桌面 `C:\Users\ASUS\Desktop\Blender.lnk` 指向此路径；**判断标准以这个 lnk 为准** |
| Steam 依赖 | **免登录**：目录内无 `steam_api64.dll`、无 `steam_appid.txt`，Steam 未运行也可直接跑 |

渲染前先过版本校验，任何一步不符就停手：

```powershell
$BLENDER = "E:\SteamLibrary\steamapps\common\Blender\blender.exe"
& $BLENDER --version | Select-Object -First 1   # 期望：Blender 5.2.2 LTS
```

**禁止事项（违反即视为基线污染，须回退并记录）**

1. 禁止使用 Blender 4.x（4.0–4.5，含临时目录里的便携包）——`%TEMP%\blender\blender-4.5.9-windows-x64` 已于 2026-11-01 删除，历史日志归档在 `tools/logs/legacy-4.5.9/`
2. 禁止用 `blender-launcher.exe` 启动（它是 Steam 启动器，会去拉 Steam）；一律直接调用 `blender.exe`
3. 禁止用 `uvx` / `pip install bpy` / 第三方打包版另拉一份 Blender 当渲染器
4. 禁止修改 Steam 目录内的 `blender.exe` 与 DLL；升级只走 Steam 正常更新，改完需重新登记 build hash
5. 禁止把渲染结果先写到临时目录再手工搬运；输出路径必须由脚本决定

**标准调用模板**

```powershell
$BLENDER = "E:\SteamLibrary\steamapps\common\Blender\blender.exe"
& $BLENDER -b -P tools/blender-ship.py -- --test    # 预览：960×901，约 5s
& $BLENDER -b -P tools/blender-ship.py              # 正式底图：4704×4413，约 11s
& $BLENDER -b --factory-startup -P tools/blender-ship.py   # 需要完全可复现时（不吃用户偏好/插件）
```

**渲染规范**

| 项 | 约定 |
|---|---|
| 引擎 | `BLENDER_EEVEE_NEXT`（5.x 名称）。脚本保留 `for eng in ('BLENDER_EEVEE_NEXT','BLENDER_EEVEE')` 兜底，但**实际只允许在 5.2 上出图** |
| 采样 | 64（预览与正式一致，便于逐像素比对） |
| 分辨率 | 预览 `960×901` / 正式 `4704×4413`；两者比例必须同步，改一个必须改另一个 |
| 版本断言 | 脚本开头必须有硬守卫（已实现于 `tools/blender-ship.py`：`bpy.app.version < (5,2)` 直接 `SystemExit` 并打印权威路径）；新增渲染脚本照抄这一段 |
| 阴影 | 默认**不需要调**（5.2 上同场景已无告警）；仅在 5.2 复现 `Shadow buffer full` 时才调 `scene.eevee.shadow_pool_size` |
| 日志 | 每次渲染写 `tools/logs/<脚本名>-<YYYYMMDD-HHmmss>.log` + 同名 `.err`；**不再新增** `tools/_blendN.log` 这类累加命名 |
| 场景存档 | 正式渲染成功后存一份 `assets/scene/<版本>/<名称>.blend`（`bpy.ops.wm.save_as_mainfile`），保证可重开复核 |
| 复现性 | 交付里写明：Blender 版本 + build hash + 引擎 + 采样 + 分辨率 + 脚本名 |

**已知坑（2026-11-01 复核）**

- **`Shadow buffer full` 是 4.5.9 的问题，不在 5.2.2 复现**：2026-10-31 用 4.5.9 的 8 次出图每次刷 52 条（4961/2048）；2026-11-01 用 5.2.2 同场景同参数（`--test`，960×901，EEVEE，64 samples）跑通，**日志里一条都没有**。若以后在 5.2 上再出现，才需要调 `scene.eevee.shadow_pool_size`
- 4.5.9 便携包 `4.5\python` 只有 `DLLs`+`lib`、缺 `bin\python.exe`，且没有 `scripts\addons`，会报 `Unable to find the Python binary, the multiprocessing module may not be functional!` —— 包已删除，勿再下载
- `tools/blender-fx.py`、`tools/gen-facility-sprites.py` 目前不落日志，按上表补齐
- 5.2.2 的 EEVEE 比 4.5.9 略慢（同场景预览 7.9 s vs 5.2 s），属正常，不要为此换成旧版

**清理记录（2026-11-01）**

- 删除 `%TEMP%\blender\`（4.5.9 便携包 + 399 MB 安装包，共 **784.5 MB**）
- 8 组 4.5.9 渲染日志（`tools/_blend*.log|.err`，16 个文件）归档到 `tools/logs/legacy-4.5.9/`，附 `README.md` 说明来源与已知问题
- 新增 `tools/check-blender.ps1` 与 `tools/blender-ship.py` 的 5.2 版本守卫，防止再次误用旧版出图

## 三、文件地图

> **层列口径（档 1 重构 · 2026-11-04）**：下表「层」列原为技术职责（配置 / 数据 / 引擎 / 视图 / 编排），现按根 `ARCHITECTURE.md` 统一解释为 **T1 / T2 / T3 + domain**；原词保留作技术副类，只标注不删除。
> 映射：配置 / 数据 / 引擎 → **T2**（按 domain 分属空间与资源、AI 拟人化）；视图 → **T2 玩家决策**；编排 `js/game.js` → **T2 跨域**；门禁 / 模拟 / 报告 → **T3 验收**；文档 → **文档栏**。
> 逐文件的 `definedBy / truth / verify / flag` 见各 `js/` 文件头部 `ARCH NODE` 注释，以及 `docs/_planned/01-工程化重构施工单.md` §二全量节点标注表。

| 路径 | 层 | 说明 |
|---|---|---|
| `index.html` | 入口 | 开始页 + 唯一的脚本加载清单；主页 / 设置 / **复盘页 `#replay`** 都是页面壳（游戏内 `#v3-root` 覆盖层仍只在 `templates.js`） |
| `js/config/version.js` | 配置 | **版本单一真源**（返航录V3）与仓库地址 |
| `js/data/map.js` | 数据 | 地图静态数据（房间/走廊/家具/任务点/管道/设施/墙体） |
| `js/ui/templates.js` | 视图数据 | `#v3-root` 的 CSS 与 HTML 模板 |
| `js/ui/home.js` | 视图 | 主页：用 `SKMapData` 生成整船 SVG、手电遮罩、身份锚亮（只读地图，不含业务动作） |
| `js/ui/replay.js` | 视图 | 对局复盘：事件时间轴 + 0.5 秒位置帧播放 + 回放 JSON 导出/载入（只读回放数据） |
| `js/engine/clock.js` | 引擎 | 相位时钟 / 个人技能槽 / 动作请求队列（纯逻辑） |
| `js/engine/invariants.js` | 引擎 | 对局不变量断言（只读，`SKInvariants.check`） |
| `js/engine/geo.js` | 引擎 | 几何、可行走网格（硬掩体）、A*、视线 |
| `js/game.js` | 编排 | 状态、AI、动作结算、会议/投票、渲染、输入（`window.SKV3`） |
| `js/main.js` | 入口 | 开始页按钮绑定 + `[data-version]` 填充 |
| `tools/serve.cjs` | 工具 | 零依赖静态服务器 |
| `tools/test-v3.cjs` | 门禁 | Playwright 浏览器断言（712 条；2026-11-04 复跑 712 通过 / 0 失败） |
| `tools/monte-carlo.cjs` | 工具 | 无渲染 AI 对 AI 批量模拟（`_t.simGame`，1000 局基线，seed 可复现；报告含**配置快照 / 机制触达率 / 分桶胜率 / 结束原因×胜者交叉表**） |
| `js/data/lines.js` | 数据 | 会议台词语料库（58 类 × hot/cold + 组合式模板 + 证据短语子池 WHY），唯一台词真源 |
| `tools/lines-audit.cjs` | 门禁 | 语料体检：禁词 / 长度 / 槽位 / 骨架撞车 + 复现 `pickLine` 抽样口径模拟十局疲劳（`--strict` 有 FAIL 退出码 1） |
| `tools/lines-report.md` | 数据 | `lines-audit` 生成的语料体检报告（工具产出，勿手改） |
| `tools/ship.cjs` | 发布 | **一键发布**：门禁（含出仓素材校验，仅警告）→ APK → CF Pages → 本仓提交推送 → 作品集。推送里 GitHub 是致命目标、Gitee 是尽力镜像（失败仅警告），两条通道互为兜底（先用 `push --dry-run` 探测，不通就跳，不硬撞 20s）。`npm run ship`；`--fast` 跳门禁、`--only=web,portfolio` 跳 APK |
| `tools/mc-report.md` | 数据 | **当前权威基线**：F 轮 · 生成 2026-11-03T11:50Z · 人类 57.6% / 异形 42.4%（原始局入库形态 `tools/mc-results.json.gz`，工具生成勿手改） |
| `tools/mc-results-E.json.gz` · `tools/mc-report-E.md` | 数据 | **对照基线**（E 轮 · AI/玩家数值一致化）：`--out tools/mc-results-E.json --report tools/mc-report-E.md` 产出，压缩档由发布前自动生成；跨批对比先读它 |
| `tools/blender-ship.py` | 美术工具 | 2.5D 底图烘焙（需 Blender，读 `js/data/map.js`；内置 5.2 版本守卫） |
| `tools/check-blender.ps1` | 门禁 | 校验权威 Blender（路径 / 版本 / build hash / Python 载荷），不通过退出码 1 |
| `tools/logs/` | 日志 | 渲染日志统一落点，命名 `<脚本>-<YYYYMMDD-HHmmss>.log`；`logs/legacy-4.5.9/` 为已归档的 4.5.9 旧日志 |
| `tools/gen-materials.py` | 美术工具 | 家具/掩体表面材质生成（本地 SDXL 流式上卡；`--mode reuse` 为无显卡兜底） |
| `tools/sfx-audit.py` | 音频工具 | 音效量化体检：峰值 / 短窗 RMS / 动态 / 起始静音；`--check` 只查游戏内引用到的音效，静音或削顶则退出码 1 |
| `tools/master-sfx.py` | 音频工具 | 用 `tools/_sfx/` 里的公共 CC0 素材分层混音 + 软限幅归一，产出 `audio/sfx-*.ogg`（出刀 / 报告音） |
| `tools/sfx-report.md` | 数据 | `python tools/sfx-audit.py` 生成的全量音效电平表 |
| `tools/gen-hull.py` | 美术工具 | 船体底板 `hull-deck.png` 程序化生成（分块装甲 + 接缝 + 格栅 + 管线 + 暗角） |
| `tools/map-check.cjs` | 工具 | 离线地图体检：可行走网格 / 掩体审计 / 巡逻线 / 任务点可达性（不开浏览器） |
| `tools/ux-audit.cjs` | 工具 | **游玩体验量测**（只量测不断言）：真实 DOM 输入下点击起移延迟、A* 规划耗时、HUD/会议 rect 与命中区、迷雾四态画面亮度、会议三段墙钟、代打墙钟占比、手机档几何、FPS；需先起 `tools/serve.cjs`（`file://` 下画布跨域 taint，读不了像素） |
| `tools/ux-report.md` · `tools/ux-results.json` | 数据 | `ux-audit` 生成的读数表与原始数据（工具产出，勿手改） |
| `assets/` · `audio/` | 素材 | 许可与署名见各子目录 `LICENSE*` 与 `audio/CREDITS.md` |
| `3d/` | 子项目 | **Godot 4.6 3D 预演**（独立工程，不参与 `index.html` 加载；地图由 `3d/tools/export-map.cjs` 从 `js/data/map.js` 导出）。入口见 `3d/README.md`，架构见 `3d/ARCHITECTURE.md`，决策见 `3d/DECISIONS.md` |

> 3D 子项目边界：**不继承**主项目的 `file://` / 经典 `<script>` 红线；
> 但素材许可、中文记录、数据单一真源、门禁/自测留痕仍然适用。
> Godot 便携版在 `E:\ai-tools\godot`（4.6 stable，`89cea1439`），不在 PATH 上。
> **完整版（含 .NET / `GodotSharp`）已装**：`E:\ai-tools\godot\Godot_v4.6-stable_mono_win64\`，
> 版本串 `4.6.stable.mono.official.89cea1439`，本机 .NET SDK 10.0.300 可直接编 C# 工程；
> 标准版 `Godot_v4.6-stable_win64_console.exe` 保留作对照。两份都能开 `3d/preview`，
> 三条自测读数一致（见 `docs/3D_预演_20261103.md` §9A）。导出模板（1117 MB）**未下载**，需要出包时再说。

## 四、架构约定

- **性格与情绪（2026-10-31，`js/ai/traits.js`）**：每个局内 AI 固定一套四轴档位
  （`aggr / caut / soc / cur`，0~100，三档分布 28/50/72），存在 `agent.trait`。
  所有「性格 → 行为」的映射**只写在 `SKTrait.C`**（声明层唯一真源）——
  `knifeBold / knifeWatcherCap / knifeReach / shootSus / voteAbstain / delayScale /
  fleeThreshold / defendChance / followChance / grudgeGain / trustGain / voteGrudgePull / voteTrustPush`。
  业务代码（aiTickAlien / aiHuman / taskThreat / startVote / startChatter）只调用系数，**禁止再散写魔法数**；
  新增性格化判定时先在 `SKTrait.C` 加系数、再接线，并在门禁加「激进 vs 谨慎系数差」方向断言。
- **理智兜底（2026-11-01，`js/ai/sanity.js`）**：性格是软的，理智是硬的。**先过理智线，再谈性格**：
  - `SKSanity.TRAIT_GAIN = 0.45` —— 性格方差压缩。`traits.js` 的 `b()` 统一乘它，
    所有系数一次性收窄。要恢复性格差异就调这个值，**不要动 `SKTrait.C` 的系数表**。
  - `SKSanity.KNIFE / SABOTAGE / BREAKER` —— 三条与性格无关的硬线：
    `witnessCap`（目击者人数上限，刀 3 / 破坏 1 / 拉闸 1）、`minConceal`（隐蔽度下限）、
    `crowdR+N`（人群密度）。**性格不能突破这三条**；过了之后 `knifeBold` 才在 0.34~0.66 的窄区间里浮动。
  - 暴露度 `exposureAt()`（game.js）把游戏状态换成权重，数学在 `SKSanity.witnessWeight/exposure`：
    目击半径按 `sightRangeAt()` 取（亮房整间 / 亮走廊 12 / 暗房 2.8），**不再是"6 格内几个人"**。
    出刀时要把受害者传进 `except`，否则每一刀都自带 1.0 暴露分。
  - 新增"危险动作"时，必须先在 `SKSanity` 加一条理智线，再接线；不要在业务代码里写 `if(有人看着)`。
  - **破坏的落点与"施展"是两件事**（2026-11-01 用户裁定）：落点 = 该舱室里**均匀随机**的一个
    任务点（`sabSpot`，按夜缓存），异形**不需要走到那台设备前** —— 进舱即触发，
    设备自己坏掉。玩家侧 `sabTick` 同口径。
- **伪装收益（`SKSanity.DISGUISE`，2026-11-03 重做）**：异形的三种演出（假装修理 / 假装做任务 /
  **当众合闸**）全部进 `alienPlan` 效用表比分，不再有 `if` 硬排、不再有每秒掷骰：
  `scDis = planValue × disguiseScore({audience: 观众权重, duration, risk}) − 走到演出点的秒数`，
  与 chase（贴脸 12 / 可追 9 / 远距 2）、breaker、sabotage 同台。
  **历史上这里有一个自相矛盾的硬前置** `(knife<=0 || close>8)`：`close` 与观众数的是同一批人，
  `close>8` 时观众恒为 0 ⇒ 那半边是死代码，伪装只剩"刀用完 + 8 格内有人"一条缝
  （实测 1.06 次/只/整局、触发率 18%）。**新增演出候选不许再回到 if 硬排。**
  · **观众 = 看得见"我"的人**（`aiCanSee(w, a.x, a.y, rad)`），不是"我看得见的人"——
    信誉兑现走 `credBroadcast`，用的就是目击者视野，两边口径必须一致，否则异形会为看不见它的人白站。
  · 观众**按人加权**（`audSus` 怀疑我的人 / `audInf` 高 soc 或本局领袖）：谁盯我我就在谁面前干活。
    读嫌疑走 `susOf(w,i,true)`（夜间口径，跨夜存量 ×0.7），不许直读 `mind.sus` 全额。
  · **risk 回答"这一下会不会被识破"**：`redHot` 刚出刀身上还热 / `donePoint` 这个点最近被人做过 /
    `repeatSpot` 90 秒内在同一地点演过 / `idleEyes` 闲着看我的人 / `manyEyes` 人多眼杂 /
    `dark` 暗处看不清动作（负项）/ `breakerLoss` 当众合闸 = 主动放弃暗视野。
    旧口径"这夜被多少人看见过"与收益项量的是同一件事、两个公式互相打架，**已废，别改回去**。
  · **只靠 `cooldown`（18 秒）+ `minScore` 两道闸**：没有"每夜 1 次"硬上限（一晚上演两次很正常）。
    要临时关掉伪装（门禁 / 调试）用显式抑制位 `a._noFake` ⇔ `SKV3._t.noFake(i,on)`。
  · **拖着尸体不许演**：候选要求 `a.drag==null`，与 `alienSupport` 开头同一条口径
    （藏尸是唯一任务，不能被"演一下"打断）。
  · 站桩时长 / 搜索半径 / 到位半径 / 记忆窗口都在表里（`dur` `spotR` `arriveR` `doneWindow`
    `repeatWindow`），业务代码不写数字。`doneWindow` 的单位是**模拟秒**（playT 一局 ≈ 450 秒），
    写成 600 就等于"这局做过一次就永久是破绽"，会把刚修好的触发率再掐回去。
  · 量纲：收益分是"一次被目击的正经动作 ≈ 1 分"；只读探针 `SKV3._t.disguise(i)` 重算一遍
    观众/风险/收益供门禁做方向断言。
- **正向信任（`mind.cred`）**：第三条通道，和 `trust`（他帮过我）/ `grudge`（他咬过我）分开 ——
  `cred` 是"他干的是正经事"，来源全部是可被目击的正经行为（`CRED.gains`：做任务 / 修故障 /
  合闸 / 拖伤员进医疗间 / 施救 / 伪装干活）。写入只走 `credBroadcast(actor,kind,x,y)`，
  它按**真实目击半径**广播给看得见的人。读取三处：指控（`credOf≥0.35` 且无确证就不咬）、
  投票（`credVoteShield` 概率弃票）、证言权重。跨夜 ×0.92 慢衰减。
  **cred 绝不能写 `known`** —— 信誉再高也洗不掉亲眼所见。
  · **信任必须有焦点（2026-11-03）**：实测"每人都有点 cred 但没人被信"是假象 ——
     阈值过了却没兑现口。现在读取端统一走 `topCred(a,min)`（我信得最多的那个人），
     三个出口：① 当众**背书**（`pushEndorse` → `SKLines.endorse` 池，一场会议最多一次，
     门槛复用 `CRED.accuseShieldAt`，**不新造数值**）；② 空闲时**往他那边靠**（`credFollow`）；
     ③ 领袖指令的**接牌率**（`obeyTrustMul` = 号召力 × 「我有多信他」）。
     遥测：`endorses` / `credFollow` / `credShieldVotes` / `abstains` 全部进蒙特卡洛。
- **贵信号（`SKSanity.LENS`，2026-11-03）**：LENS 是**似然比表**（人类意愿 vs 异形意愿 0~3 档），
  本体只回答"这件事有多像人"，**不持有分数** —— 信任增量仍只在 `CRED.gains`、嫌疑增量仍只在
  `EV_W`，别在这张表里加第二个真源。`lr(kind)=Infinity` 的行是 knownOnly（出刀/钻管道/破坏/拉闸/
  停摆/红身），硬线不参与比值。
  · **异形的贵信号候选**：`realFix`（真修故障）与 `realRevive`（真救非队友）**必须走与玩家、
    AI 人类完全同一条入口**（`startFix/finishFix` / `_doing='revive'`），这样修好会真的扣进度、
    救活会真的扣医疗包，目击者拿到的是同一笔 `cred` —— 没有特权也没有折扣。
  · **但"入口通"不等于"会自发去做"**：假装修不吃 `DISGUISE.risk.realCost`、只站 `dur` 秒，
    实测分数仍然压过真修（量化事实，门禁把这条**写成断言**以免被当成 bug 修掉）。
    要让贵信号真的贵，动的是 `risk.realCost` 或 `CRED.gains.fixDone`，**不是**再加一条通道。
- **取消异形全图锁敌（2026-11-03 用户裁定）**：挑目标只有三档信息，和玩家同口径 ——
  ① `aiCanSee` 现在看得见 → 用实时位置（"他在站桩干活"这类信息也只有看得见才知道）；
  ② 看不见但本夜亲眼见过 → 用 `saw_agent` 的**最后目击位置**，超过 `SKSanity.HUNT.memorySec`（25 秒）
  就当跟丢；③ 完全没印象 → **不进候选**，只能巡逻 / 钻管道 / 破坏，或按 `huntSpotFor(a)`
  （最后目击点 → 最常撞见的舱室 → 任务最热的舱室中心）去碰运气。
  这是明确的**平衡位移**（异形找人变难），必须用 1000 局量，不要靠"更拟人"这种话交差。
  以前那段直接遍历 `G.agents` 取实时坐标的代码等于给异形开全图挂，别再写回来。
- **报告绑定"那一次倒下"（2026-11-03）**：`bodyReported(v)` 对**还活着的濒死者**比的是
  `v.reportSeq === v.downSeq`（每次倒下 `downSeq++`，报告时写 `reportSeq=downSeq`），
  而不是旧的"按夜"口径 —— 同一夜他被打倒两次是**两次发现**，可以报第二次；
  同一次倒下躺着被人反复报才是漏洞。尸体语义（真死）仍按夜 + `openMeeting` 开场即 `bodyGone` 兜底。
- **互斥证词（2026-11-03）**：A 咬 B「亲眼看见」、B 同时咬 A「亲眼看见」——两条硬证词
  **不可能同时为真**。现在：① 互咬双方都不吃共证加成（`TESTIFY.corrobMul` 归 1，
  对抗中的证词不是"汇合"）；② 系统 `sysSay` 当众点破一次（每场最多一句）；
  ③ **不新增任何 `sus` 数值**，谁对谁错仍由 `known` / 时间线判。遥测 `mutualFrames`。
- **终结者时刻（`SKSanity.TERMINATOR`，2026-11-03 用户裁定）**：第 `night`（10）夜开始时
  `checkTerminator()` 一次性触发：**全场身份公开**（`G.revealAll`，标签走 `omniscient` 之外的
  公开分支，不借用 DEV/旁观的全知画法）+ **每人补子弹到 `bullets`（1）**（只补到 1，不叠加）。
  残局（1 异形 vs 2 人类）此前 energy-neutral 会拖到十几夜，这条给一个必然的收束点。
- **会议三段时长（`SKSanity.MEET`）**：白天与**开局**讨论 `discussDay/discussPre = 50`
  （用户裁定 60→50，且明确"涵盖开局讨论"）、夜会 `discussNight = 25`（原值）；
  投票等待 `voteDay/voteNight = 15`（2026-11-03 晚 5→15）；结果公布 `reveal = 5`（原 6）。
  **只在表里改，不要在 `openMeeting` 里写数字**；门禁按运行时值断言（`_t.meetCfg()`），不写死秒数。
  投票阶段的「跳过投票」按钮 = **结束剩余投票时间**：已经投给谁就保留那一票，没投才记弃权；
  走 `closeVote()`，不强制改票，也不是第二种票。它只对活着的玩家显示，幽灵/旁观者不可用。
- **对局骨架数值外提（2026-11-03，**数值一个没改**）**：`SKSanity.NIGHT.len` / `WIN.pts` /
  `WIN.faultPenalty` / `STAND.*`（站桩秒数与故障窗口）/ `REACH.*`（近身判定距离）/ `SHOT.*`（开枪与追击距离）
  是 `game.js` 顶部那些 `const NIGHT=75`、`WIN_PTS=45`、`a.doing=5` 的**唯一真源**。
  搬家的理由不是整洁：蒙特卡洛报告要能把「这批局用的是哪套数」打进配置快照
  （`tools/monte-carlo.cjs` 直接 eval `js/ai/sanity.js`）。
  ⚠ **搬家时发现两处既有不一致，只记录不改**（等用户决策）：
  ① AI 人类合闸站桩是 3 秒（`STAND.aiBreakerHuman`），玩家与异形演出走 `breakerOnTime()`
  （断电当夜 4.5 秒）⇒ 断电时 AI 比玩家快 1.5 秒复电；
  ② `REACH.knifePlayer = 1.35` 与 `REACH.knifeAI = 1.4` 是两个数（瞄准方式不同，不算特权，
  但提示文案必须跟着读常量，别写死"1.3 格内"）。
- **诬陷（`SKSanity.FRAME`，2026-11-01）**：异形没有目击也会编一份**具体伪证**
  （`accuseWhy={kind:'saw_knife'|'saw_pipe', room, solid:true, fake:true}`），
  措辞和真目击一字不差 —— 听众无从分辨，这是社交推理里最难拆的一手。
  `solid` 是"听众眼里算不算硬证词"，真确证 / 真取证 / 伪证都置 true，纯情绪指控才是 false。
  异形指控了谁就把票投给谁（说了不投等于自己打脸）。
- **追责（`SKSanity.ACCOUNT`，2026-11-01）**：投票结果公布后清算带节奏的人 ——
  被驱逐的真是异形 → 投对的人 +cred；是人类的 → 投错的人 −cred，**带头的人**还被记一笔嫌疑。
  `meet.lead[目标]` 记第一个公开指控他的席位。这是诬陷的代价：诬陷成功收益极大，
  一旦被证伪，带头的人自己就变成下一个目标。**改这条必须跑 1000 局**。
- **台词语料（`js/data/lines.js`，2026-11-03 扩充 + 全量迁移）**：会议台词**一律不得写在 `say()` 调用处**。
  这一条以前只是"约定"，`game.js` 里还散着 23 处 `pickLine(a,[...])` 内联池（每池 2~4 条，
  且都是每局必说的开场 / 自述 / 跟票 / 确证指控 / 玩家发言回应句）—— 现在**全部搬进 SKLines**，
  `grep -c "pickLine([a-z0-9_.]*,\[" js/game.js` 必须是 **0**，门禁直接断言渲染结果。
  分组：六类说服策略（身份声明/指控/辩护/证据/询问/行动号召）+ 对质 / 领袖指令 / 准-确证 /
  犹豫 / 收回 + **新增三类（背书 `endorse`、接牌拒绝 `leader_refuse`、自述位置 `selfcite`）**
  + 迁移类（报案 `open_body_dead`/`open_body_alive`、无尸开场 `open_nobody`/`open_nobody_night`、
  路线 `route_plan`、自述词干 `stem_room` + 子句 `task_*_clause`/`mate_clause`、
  异形含糊指控 `alien_accuse_soft`、确证硬指控 `known_accuse_hard`、对质回应族……）。
  每类分 `hot/cold` 两档，由 `SKLines.toneOf(a)` 按性格选档；当前规模 **1152 行 / 58 类**
  （迁移前 336 行 / 11 类）。
  **槽位真值表（越界就渲染出空话，`tools/lines-audit.cjs` 会拦）**：
  `{n}` 说话人 · `{t}` 对象 · `{r}` 舱室 · `{r2}` 第二舱室（案发舱 / 上次口供舱）·
  `{u}` 第二人（发起人 / 玩家名）· `{k}` 任务或行为词 · `{when}` 时间词（走 `whenWord()`）·
  `{prev}` 上一场会议 · `{why}` 证据短语。`{a|b|c}` 是**交替槽**，由 `fillTpl` 随机展开
  （先展开交替、再填具名槽，顺序不能反）。
  **组合式模板**：`POOLS[cat].combo`（`SKLines.pool(cat,'combo')`），`pickLine` 三成概率改用它 ——
  行数不变但成品句空间是乘出来的，这才是"十局不腻"的主杠杆。
  **证据短语**从 `evClause` 的 switch 抽成 `SKLines.WHY`（每 kind 3~5 个同义说法）：
  **只换措辞，kind / solid / fake / known / sus / 投票一律不动**。
  **去重与连说**：`pickLine` 按**模板**记 `G.lineUsed`，用过就按 `1/(1+3n)` 降权重挑；
  `sayStreakOK` 限制同一类别连说 ≤2。遥测 `lineDups` / `streakCuts` 进蒙特卡洛。
  **写台词纪律**：8~18 字（报案/确证类带三个槽，上限放到 30，见 audit 的 `LONG_OK`）、口语、
  可省略主语、不用书面词（时间线/证据链）、不写脏话、**不许出现「狼/狼人/查杀/归票」这类
  狼人杀词汇**（本游戏阵营是人类 / 异形）、舱室名只能出现在槽或 `|` 交替里
  （唯一例外：「送/抬进/去医疗间」是机制目的地，不是位置自述）。
  **改语料后必须跑 `node tools/lines-audit.cjs`**（零依赖，禁词/长度/槽位/骨架撞车 +
  复现 `pickLine` 抽样口径模拟十局，报重复率；`--strict` 有 FAIL 就退出码 1）。
  验收目标：**玩家连续玩 10 局都不会觉得"这些话我全看过"**。
- **讨论 → 投票（说服力侧，`SKSanity.TESTIFY`）**：反咬削弱的是**别人信不信他**（×0.85），
  共证加成（第二个独立指控者 ×1.25）。**绝不动 `known`** —— 目击者的判断是硬约束，这条红线不能破。
- **讨论 → 行为（`SKSanity.WARM`）**：共同指控同一人 → 彼此 `warm +0.10`；
  任务全做完后 45% 概率往 `warm` 高的人那边走。只在空闲阶段生效。
  `warm` 与 `trust`（他帮过我）/ `cred`（他能干）是三套独立的东西，别混。
- **领袖型玩家（`SKSanity.LEADER`，2026-11-03 重做）**：22% 的对局有一个"爱指挥"的人，
  **不预设阵营**（人类异形都可能），只在 `soc≥45` 里选；会议排期里下 1~2 条指令
  （`scheduleLeaderOrders`，开局与白天/夜会两条分支都调 —— 注意：**AI 对 AI 模拟里这段不跑**，
  因为台词排期在 simMode 直接 return，所以 `orders/endorses` 在蒙特卡洛里恒为 0，
  那是工具口径盲区不是机制没接，行为由门禁覆盖）。
  用户裁定：**偶现、不传承、是小变量不是主设计** —— "号召力有偶然性，
  可能一个人都不听，也可能极端到所有人都听"。所以：
  · 号召力 `LEADER.bands` 是**重尾分布** [0/.15, .25/.50, .65/.30, 1/.05]，两端都不截断；
  · 接牌概率 = 号召力 ×「我有多信这个领袖」（`obeyTrustMul`，挂在 `cred` 上，不新造数值）；
  · 被点名者**可以当众拒绝**（`SKLines.leader_refuse` 池，`LEADER.refuseSpeakP` 只影响台词）；
  · 命令只在本夜有效（天亮重排，不留跨夜隐性指令）。
  效果仍然刻意做轻：听众 +0.06 warm。**已删除**「被点名者 +0.02 嫌疑」——
  被分配任务是干活，不是作案；要付代价的是**口头应下却没去**（`orderBroke`，同舱的人能看见）。
  另外修了一处**读数口径**：本来就要去那间舱（`idx===tIdx`）以前被记成抗命，服从率被系统性低估。
- **情绪记忆（`mind.trust` / `mind.grudge`）**：跨会议保留、每场会议 ×0.8 衰减（`mindReset` 里做）。
  写入只有三个入口：AI 当众指控（`grudgeAdd`）、AI 当众辩护（`trustAdd`）、
  玩家发言（`playerTalk` 里指控/投票记仇、点名"不是异形/别投他"记恩）。
  读取：`startVote` 里 `grudge≥0.6` 优先砸票（激进更狠）、`isPatron()` 恩人不过票。
  **不要**把情绪写进 `sus`（嫌疑分）——情绪是另一条通道，混进去会让证据链失去可审计性。
- **输入映射**：移动只有「点击地面」；`W/A/S/D` 是主操作键（交互 / 出刀 / 搜尸 / 收尸），
  `E/Q/X/G` 保留为别名。新增按键必须同时更新 `#tip` 与 README 的操作表，
  否则玩家只能靠试键位——这一轮已经把「尸体操作」全部收进 `W/E` 的交互轮盘。
- **搜尸 = 取证 + 取物资**：尸体保留生前的 `bullet / medkit / qual`，`lootBody()` 按背包容量转移，
  取不完的留在尸体上（`bodyHasLoot()` 允许二次搜尸）；`searched` 只标记「已取证」。
  **AI 也必须会搜尸**：人类取证件、任何 AI 看到自己缺的物资都会停下来搜（`aiWantsLoot()`），
  新增尸体交互时不要只做玩家侧。
- **确证是长期记忆**：`mind.known` 由 `mindReset()` **跨夜保留**（普通 `mem / sus` 仍按夜清空）；
  `bestKnownTarget()` 驱动会议指控、投票与开枪距离。新增「身份级」证据必须写进 `known`，
  但只有人类做不到的行为（出刀 / 钻管道 / 破坏 / 停摆机器人 / 刀者红身）才允许写入。
- **AI 与玩家数值必须完全一致（2026-11-03 用户裁定）**：同一个**能力**只准有一个数，
  表里不许出现 `xxxPlayer` / `xxxAI` 这种成对的键。历史上分叉过四处，现已全部归一：
  出刀近身 `REACH.knife`（曾 1.35/1.4）、开枪射程 `SHOT.range`（曾玩家 9 / AI 10 与 8）、
  合闸站桩走同一个 `breakerOnTime()`（曾 AI 3 秒 / 玩家 4.5 秒）、钻管道冷却 `PIPE.cooldown`
  （曾 AI 20 秒 / 玩家**零冷却**）。第五处是**视野模型**（玩家亮区整间可见、AI 被 8 格卡住）——
  2026-11-03 已按用户裁定给 AI 同样的亮区视野（见下条），这是**唯一一处靠改判定而不是改数值**归一的能力。
  取值方向固定为**不给 AI 新增权力、也不留玩家白拿的特权**。
  ⚠ 两件事不算不对称、不要顺手一起"统一"：① `SHOT.chaseKnown/chaseSus` 是 AI"愿意走多远去开枪"的
  **决策**参数（玩家没有这个概念）；② 冷却/计时的**递减入口只能有一处** —— 冷却以前在 AI 循环里减一次、
  `tickActs` 又减一次 = 一帧双倍速；写在 AI 循环里"顺手也减一下玩家"更糟（4 只异形 ⇒ 玩家 4 倍速）。
- **视野半径（2026-11-03 起唯一真源是 `SKSanity.SIGHT`）**：`humanLightR = 7`（手电锥 60°）、
  `humanDarkR = 2.8`（人类近身圆）、`alienDarkR = 3.5`（异形近身圆，**用户裁定的直接数值**）、
  `aiCapR = 8`（**暗处**的 AI 视距上限）、`corrR = 12` / `litRoomMul = 1.15`。
  旧版把异形写成 `ALIEN_INNATE_MUL = 10/9`（⇒ ≈3.11），改一次要反推乘法 —— 现在直接给数值。
  ⚠ `aiCapR` **只管暗处**：亮区（同亮舱整间 / 同亮走廊整条）不受它约束，见下条。
  改这几个数会同时影响 `aiCanSee`、`visibleAt`、`drawFog`、`sightRangeAt`（AI 的暴露度口径）
  与门禁里的视野断言（断言用 2/3/4 格实测点）。
- **亮区整片可见对 AI 同样成立（2026-11-03 用户裁定，推翻旧的"AI 8 格上限"）**：
  `aiCanSee` 先看 `litZoneAt` —— **观察者与目标在同一亮舱 ⇒ 整间可见**（中央会议室对角 42 格），
  同一亮走廊 ⇒ 整条可见，从亮舱看进相连走廊 ⇒ 可见但要 `losNow`；这三条**都不看距离**。
  理由很直白：玩家异形在亮房里本来就能看见里面所有人，AI 却被 8 格卡住 ⇒
  **AI 比它自己扮演的角色还弱**，而且伪装/暴露度那套"亮房整间都算观众"的口径只对了一半。
  配套的第三处一致化：`watchersAt` 的半径改成 `max(调用方 rad, sightRangeAt(x,y))` ——
  以前刀口那条固定 6 格，等于让异形当着满屋子人出刀还自以为没人看见（AGENTS 早就骂过"按 6 格数人头"，
  但 `exposureAt` 改了、`watchersAt` 没改）。**别把这两处再改回固定半径。**
  仍然受 `aiCapR` 约束的是：暗舱、以及**站在舱外看进亮舱**（不会全船看进亮房）。
  实测代价（F 轮 vs E 轮，同 seed 1000 局，详见 CHANGELOG §十七）：**人类 60.2% → 57.6%**（约 1.2σ，噪声边缘），
  `knownWrites` 7.52 → 7.01、`exiles` 3.28 → 3.12（**远处的观众只加嫌疑、不写确证**，这是 `CONFIRM.nearR` 的设计），
  伪装演出 `fakeTasks` 8.19 → 9.28、回避 `avoidCount` 42 → 47（观众变多，演出的账面收益变高，异形更早绕开人）。
  驱逐准确率几乎没动（51.94% → 52.07%）。**这是一次真实的平衡位移，不是纯拟人化**——要收回只能动
  `NIGHT` / `WIN_PTS` / `aiCapR`，不要偷偷把亮区规则改回去。
- **迷雾只是表现层（2026-11-03 用户裁定）**：`SIGHT.fog = {roomMask .87, corridorMask .50}` ——
  用户原话是「除了船的房间的其他地方要能看见（前提是没有拉闸）」，所以**压淡的是走廊与船体背景**，
  未进舱室的暗度维持原值。**判定一点没动**：单位/尸体在画进迷雾之前就被 `canSee()`/`visibleAt` 裁掉，
  所以背景看得清 ≠ 能看见人；断电（`G.lightState===2`）时整步跳过，退回全暗。
  改这里必须同时看门禁的「背景压淡不等于看得见人」那条。
- **亮房不画自身视野**：人站在**亮舱**里时 `drawFog` 只整间开孔，**不再叠手电锥与近身圈**——
  整间本来就揭开，那只锥会在门口拖出一块跟着鼠标转的亮楔形，是噪声不是信息。
  注意 `visibleAt` 的判定**没有**跟着改：亮房里朝门口外仍按逻辑可见，这是有意的（表现层收敛，玩法不收敛）。
- **声纹与脚步只算活人**：`stepMove()` 里的 `SND.step` 与 `hear(...,'step')` 必须包在 `if(a.alive)` 内。
  `aiGhost()` 走的正是 `stepMove(a,dt,6.5/2.4)`，漏掉过滤会让幽灵飘过时留下一圈"有人在走"的假声纹。
  例外：配电室「电路维修」修好时的 `hear(...,'power')` 照旧响——那是全船事件，谁修的都该响。
- **亮房整间可见**：玩家所在**亮舱**内的所有点直接 `visibleAt=true`，不再用 `losNow` 被家具/掩体挡住
  （迷雾本来就整屋揭开）；暗房或熄灯房间才退回 7 格手电锥 + 近身视野。不要在 `visibleAt` 的亮房分支
  加回 `losNow`，否则会退回“只看见灯、看不见人”的反直觉表现。
- **走廊默认有灯**：未断电（`G.corrLit`）时走廊和亮房一样按整片亮区处理——玩家站在亮走廊里，
  `visibleAt` 对同一条走廊的任意点直接返回 true（`litZoneAt` 用 `'c:索引'` 标识），不必瞄准手电；
  从亮舱看进相连走廊时也可见，但要求 `losNow`，避免隔着舱壁看见走廊弯后的人。
  `drawFog` 站在亮走廊里整条揭开，并**不再叠手电锥**；断电后 `corrLit=false`，退回原来的近身圈 + 手电。
  新增走廊/断电视野改动时，`litZoneAt`、`visibleAt`、`drawFog`、`aiCanSee` **四处必须同批改**
  （2026-11-03：AI 已经与玩家同一条亮区规则，漏改任何一处就又会分叉成"玩家看得见、AI 看不见"）。
- **AI 回场报告**：异形杀完人后可能 `_reportPlan`——先离开 5–12 秒做不在场、再回尸体旁拉铃；
  报告太快的代价是 `quick_report` 嫌疑（死亡 10 秒内报告，见过尸体的人会怀疑报案人）。
  不要让 `aiScanBodies` 抢在计划前面拉铃（它已 `if(a._reportPlan)return`）。
- **故障协作**：`finishFix()` 修好一座故障时会清空**所有**正在修 / 正赶往同一故障的人的
  `_doing='fix'` / `_fixGo` / `path`；`dropStaleFix()` 每帧兜底。改维修流程必须保留这条，
  否则 AI 会把剩下的 10 秒站完。
- **门只画顶面**：`drawDoors()` 统一画一块抬到墙顶高度的薄板（横门 / 竖门只旋转 90°），
  Blender 端不再烘门楣与高处灯带；不要再画立式门板正立面。
- **旁观者**：`G.spect` 是第 16 人的相机幽灵，**不进入 `G.agents`**（保持 15 席 / 4 异形 / 11 人类）；
  0 号席位在旁观模式由 AI 托管，所有玩家专属 UI（任务条、交互提示、投票按钮、拖拽条）都要用
  `G.spectMode` 关掉。新增玩家能力时必须同时判断 `G.spectMode`。
  唯一例外是会议里的**「跳过讨论（旁观）」**按钮：只快进讨论（有投票则进投票，否则直接入夜），
  仍不允许发言、投票或做任何局内动作。
  **`G.spectMode` 下 0 号星尘是完整 AI**：发言池、投票、行动、被构陷/被攻击都必须按普通 AI 处理；
  所有 `a===G.me` 的玩家专属过滤（发言、投票、DEV 标注、击杀/拖拽提示）必须写成
  `a!==G.me||G.spectMode` 或加 `!G.spectMode`，DEV 名单把 0 号标成「AI」而不是「你」。
- **正常对局外观一致**：异形与人类共用同一角色贴图、名字标签和状态；`drawWeapon()` 只在真实
  `stab` / `shoot` 动作（或持枪）时画刀/枪，**空闲时不能给异形亮刀**。DEV / 旁观的红色身份标签
  是全知模式专用，不得在正常对局出现。
- **设置**：`#settings` 在 `index.html`（z-index 10010，高于 `#v3-root`），由 `js/main.js` 的
  `window.SKSettings` 托管，只写 `localStorage('sk.settings.v1')`；游戏侧只暴露
  `SKV3.setSfxVolume / getSfxVolume / togglePauseGame / isPaused / playSfx`。

- **模块形态**：经典 script + IIFE，只向 `window.SK*` 暴露一个冻结对象；
  纯引擎模块不得读取 DOM、不得读写对局状态、不得掷随机（随机只在 `game.js` 的对局状态里）。
- **坐标系**：1 格 ≈ 56px 底图；`geo.js` 以 0.6 格烘焙可行走网格；家具 / 掩体是**硬阻挡**，不能穿越。
- **渲染与模拟**：`game.js` 内 `update(dt)` 驱动模拟，`draw(dt)` 负责渲染；
  会议、搜尸、暂停时模拟冻结，但特效/动画按真实时间收尾（门禁有对应断言）。
- **不变量**：15 席 / 4 异形 / 11 人类恒定；尸体必留坐标（驱逐除外）；拖拽双向互指且 ≤ 3.2 格；
  投票对账一致。改动模拟逻辑后必须让 `SKInvariants` 零失败。
- **医疗无人机（2026-10-31 取代巡逻医疗机器人）**：**不再巡逻**，坞位就是医疗间正中央
  （`M.facility.medbot` 的 x/y，`resetBots()` 里 `home` 单航点）；`medbotTick()` 每帧：
  房间内有人濒死 → 飞到 `MEDBOT_TOUCH_R`（1.15 格）内悬停 → `G.medbotT` 累计满
  **`MEDBOT_HEAL_TIME = 3` 秒** → 拉起；没人可救就飞回坞位。
  **救治不对外报告**：不给 `toast`、不写 `envNotice('revive')`（旧实现等于把无人机当免费情报源），
  只留机器人运作声与事件流（复盘是只读旁路）。`G.medbotT` 与 `G.medbotTarget` 必须同时清零，
  否则同一波濒死会被连带救起（门禁 `b1.medLeft===1 && b2===0`）。
  `MEDBOT_R = 12` 只是「整间覆盖」的读数（医疗间半对角 ≈10.8），判定用 `inMedRoom()`，不再用半径卡人。
- **机器人与坐标**：`M.facility` 里的 `x/y` 只是初始坞位；运行时的实时坐标在 `G.bots`。
  拘留、施救、交互、绘制、小地图一律用 `botPos(kind)` 读取，新增逻辑不得再直接读设施坐标。
  `G.bots.medbot.home` 是无人机返航点，保安仍按 `facility.patrol` 走 4 点。
- **开枪结算**：玩家与 AI 共用 `fireShot(shooter,target)`；对机器人使用 `fireShotBot()`；
  新增开枪入口必须走同一函数，保证子弹消耗、犯罪记录、声纹与目击者逻辑一致。`Q` 只出刀（异形），`B` 才是开枪；
  异形有子弹时同样可以开枪。DEV 免伤也必须先扣子弹，杜绝无限连射。
- **统一移速**：所有活人（玩家 / AI 人类 / AI 异形）统一使用 `MOVE_SPEED = 4.2`（2026-10-31 从 4 上调）；
  拖拽尸体 `DRAG_SPEED = 2.7` 格/秒（玩家与 AI 共用 `moveSpeed(a)`）、玩家幽灵 6.5 格/秒是显式例外。
  新增移动入口必须走 `moveSpeed(a)`，不要手写常量，否则 AI 会出现“拖着尸体满速跑”。
  `moveSpeed(a)` 的**优先级次序固定：拖尸 > 击杀加速 > 基础**（2026-11-03），改这条等于改逃逸动力学。
- **击杀加速 ≠ 红身（2026-11-03 用户裁定）**：异形把人**放倒**（不是致死 —— 本作的死常在天亮失血/驱逐，
  绑致死等于没有这个机制）后获得 3 秒 ×1.5 移速。状态是独立字段 `a.rushT`，
  数值只在 `SKSanity.RUSH = { dur:3, mul:1.5, alienOnly:true }`，
  授予只有 `killRushStart(a)` 一个入口，由 `knife()` 与 `fireShot()` 的致 down 分支调用。
  **绝不允许从 `redT` 推导位移**：两个计时器都取 3 秒纯属巧合，红身管"别人看不看得见我"、
  rush 管"我跑得快不快"，一旦耦合，以后想把红身拉长 1 秒给目击者反应时间就会顺手 buff 凶手逃逸。
  只给异形（人类有无人机与同伴救援，不需要逃逸加速，给了还会把误伤同伴变成 buff）；
  拖尸期间不加速；幽灵 6.5 / 追捕 7.5 是显式例外，不走这条路。门禁有**双向解耦断言**守住它。
- **拖拽是通用状态**：拖拽关系存在拖拽者身上（`a.drag` = 被拖席位），被拖者 `draggedBy` 指回；
  玩家额外用 `G.drag` 做 UI 别名（不变量 D7 会校验两者同步）。
  玩家与 AI 都必须走 `startDrag / releaseDragBy / syncDragOf / releaseAllDrags`，
  禁止再直接改 `G.drag` 或 `draggedBy`；尸体跟随在 `stepMove()` 内触发，保证门禁的
  `aiTick / aiTickAlien` 单步模拟也能拖动尸体。
- **反常拖尸只加嫌疑**：`syncDragOf()` 检测“尸体被拖离医疗间中心 >2.2 格”时，给周围 6 格内、有视线的
  人类目击者写 `saw_drag_away`（`EV_W` 0.45，按夜去重），会议 `evClause` 有对应台词；
  **绝不写 `known`**（拖尸人类也会做，只是方向反常）。新增拖尸证据必须沿用这条“只加 sus”的口径。
- **AI 异形藏尸避人**：`hideRoomFor()` 排除医疗间/会议室/当前房间，按「远离医疗间 − 拖尸距离 − 人群风险」
  评分，只在**没有活人**的候选舱室里随机取前 3（不再固定仓库）；拖尸途中任何非队友活人 6.5 格内可视
  就松手（`_hideCD=8`），开始藏尸前也要求尸体旁没有非队友目击者。改藏尸逻辑时不要退回“始终仓库”。
- **刀者红身**：`knife()` 命中后给出手者 `redT = 3.0`，在 `tickActs()` 里按 dt 递减，
  绘制端用 `tintedSheet()` 缓存的红色染色图叠加。
  **2026-11-03 改述（旧表述与代码不符，已经误导过后续修改）**：红身**不是纯表现层**，
  它也不是体力状态 —— 它是**目击证据**：`trackNight` 看见 `redT>0` 会写 `known`/`mates`（身份级），
  `disguiseRiskParts` 用它算"这一下会不会被识破"（`SKSanity.DISGUISE.risk.redHot`）。
  位移**一律不许读 `redT`**，逃逸加速走独立的 `a.rushT`（见上一条"击杀加速 ≠ 红身"）；
  新增攻击入口若要给红身，必须在真实扣刀 / 扣子弹分支里赋值。
- **任务提示不用边框**：自己的任务点所在掩体由 `drawTaskCoverFlash()` 从底图裁出物体像素做金色
  `screen` 脉冲（`G.gfx.coverFlashes` 计数），不得再画黄色虚线矩形；`G.gfx.dashedBorders`
  只允许在无掩体的空地分支上增长，门禁据此回归。改底图烘焙尺寸/对齐会同时影响这个取样框。
- **AI 规则利用**：AI 与玩家共用结算入口——救人走 `fireShot/finishDoing('revive')`、
  拖尸走 `startDrag`、合闸走 `pullBreaker`、钻管道走 `witnessAlienAction + aiHear('pipe')`；
  出刀 / 破坏前用 `secbotWouldSee(x,y)`（与 `botTick` 同源：**10.5 格** + 180° 扇形 + `losWalls`）预判。
  新增 AI 能力必须复用这些入口，否则会出现“AI 有特权、玩家没有”的失衡。
- **AI 异形避目击（2026-10-30 改版）**：出手前用 `watchersAt(a,x,y,6,except)` 统计**非队友**活人：
  1 个非队友时 55% 直接冒险出刀；2 个以上非队友时**直接放弃目标**，写入 `_avoid[目标]=now+12`，
  下次挑目标时跳过被晾目标、优先找落单者——**不再使用 `_ambushT` 原地等/踱步**。
  队友围观不算风险；队友正在追的目标加 8 格协调距离，避免两人追同一人。
  挑目标时“有人看着”的对象加 12 格风险距离；目击者识别不得读取系统队友表，只能用 `a.mates` 推断。
  **优先做任务的人**：目标评分里正在站桩 `h.doing>0` 的人减 12 格（被围观 +12 仍可抵消），
  让异形优先挑做任务/维修的人，而不是永远追最近的闲人。
- **异形队友识别（目击推断）**：`a.mates[席位]` 只由**亲眼看见**的异形专属行为写入——
  `noticeAction()` 里的出刀/钻管道/破坏/停摆，断电拉闸（`kind==='breaker'&&G.lightState===2`），
  以及 `trackNight()` 的红光。`mates` 跨夜保留；不得用 `alien` 字段或系统队友表生成。
  已识别的队友：不出刀、不投票、会议里公开辩护；主动构陷时队友会帮腔（`frames[].ally`）；
  队友倒下且自己手里有医疗包时，`alienMateRevive()` 会优先救队友。
  未识别的同类仍可被攻击/指控/投票（保持“同类也可能被攻击”）。
- **规则不是阵营禁区，但异形不做人类式任务流**：AI 异形也会 `lootRun()` 翻尸/搜倒地伤员拿子弹、
  医疗包、申请单，回圆桌领申请单、去军械补给点换子弹、有子弹时用 `fireShot()` 远距离开枪。
  **假装做任务**：有人看着时去任务点 `_doing='fake'` 站 4–8 秒（不加任何进度），
  用来制造目击者在场的不在场证明；**真做任务只是少数策略**——每只异形整局最多 1 次，
  只在没刀没弹、缺申请单且人类进度 <38 时小概率发生，避免异形替人类推 45 分胜利。
  假装维修仍只在故障旁有人看时发生，不修好、不加进度。
- **管道口供只能落在有管道口的舱室**：`pipeRoomIds()`（来自 `M.pipes`：引擎室 / 监控室 /
  军械库 / 仓库 / 食堂 / 医疗间，共 **6** 个）是唯一真源。AI 的 `planAlienDeception()` 反咬“钻管道”时
  必须把目标自述舱室换成真实管道房；`meetTemplateText('pipe',…)` 在选中无管道舱室时省略地点；
  玩家硬说“在配电室钻管道”会走 `impossible_claim`，AI 反过来怀疑发言者而不是记目标的证据。
  改地图管道时同步这 6 个房间与门禁，不能再生成“在别的房间钻管道”的台词。
  **管道绘制配色跟随舱室**：`PIPE_TINT[room]`（与 Blender 的 `ROOM_THEME[].mark` 同色），
  形状语言（菱形格栅 + 呼吸环）全船统一，不要给单个舱室改形状。
- **AI 异形管道机动**：`alienPipeMove(a,dt,tgt,td)` 必须在“没刀游荡”之前调用，否则刀用完的异形
  永远走不到管道口（2026-10-30 修复）。目标 >15 格、`_pipeCD<=0` 时先规划到能显著缩短距离的入口，
  站在口上直接钻到离目标最近的出口；每夜最多 2 次、20 秒冷却。补给/伪装优先于管道，但管道优先于
  无目标的随机游荡；改顺序时保留“回圆桌换弹/救队友”的优先级。
- **AI 异形藏尸远离医疗间**：`hideRoomFor()` 永远排除医疗间/会议室，按
  `距医疗间 - 0.55×拖尸距离` 选目的地，优先把尸体拖到离医疗间更远的舱室；
  `hideSpotFor()` 仍在该舱室里选远离门与任务点的角落。不要把“最近的房间”改回来。
- **AI 人类节奏（2026-10-30）**：完成任务后**不再休息**（`_rest=0`），直接接下一个任务；
  看到故障/拉闸优先直接修：断电先派 1 名 `_lightGo` 合闸，故障由最近 2 名 `_fixGo` 抢修，
  锁定目标后不被 `_look`/任务点打断；`fleeTask()` 在已知异形快速逼近且修不完时弃修逃跑。
  AI 人类也会主动翻尸取物资（`lootRun()`），有申请单时优先备弹（`supplyTargetFor()`），
  有子弹且出现已知/高嫌疑目标时会用枪。`observeBody()` 会把见过的倒地伤员写进 `_lootMem`，
  `lootRun()` 在离开视野后 30 秒内仍会专门绕回去收尸；改这些规则时必须保留“同一故障修好后所有人松手”的协作逻辑。
- **AI 异形直接报案**：`_killDecided` 在决定报告后有 35%（未被目击）/ 20%（被目击）概率写
  `_reportPlan.direct=true`，原地 0.8–2 秒后拉铃；其余情况仍先离开 5–12 秒再回场。
  `direct` 分支不能删，否则会退回单一“绕场报告”策略。
- **异形会议欺骗**：`planAlienDeception()` 让被确证的 AI 异形先反驳、再按概率反咬某人
  “钻管道 / 带红光”；没有被确证时也有小概率主动搅浑水。假话只进 `m.ctx.frames` 与
  `heard_frame` 传闻嫌疑（0.14），**绝不写 `mind.known`**，真目击者仍由 `bestKnownTarget()`
  锁定指控与投票。听众若用 `saw_agent` 记忆抓到说谎者假口供与自己的时间线冲突，
  会写 `contradiction_lie` 反向怀疑说谎者。不要为了“让谎话生效”去改 known 或伪造证据事件。
- **会议模板与玩家直接证据**：`#m-tpl-btns` 的 8 个模板由 `meetTemplateText()` 生成标准句，
  必须与 `parseSpeech()` 保持同步；玩家直接证据走 `m.ctx.playerClaims` + `heard_claim`
  （按类型 0.12–0.30 嫌疑，**绝不写 `known`**），有确证的听众公开站队；
  若玩家声称的案发舱室与听众 `saw_agent` 记忆冲突，写 `contradiction_claim` 到玩家。
  新增模板或词槽必须同批补 `parseSpeech` 与门禁。
- **AI 认知与证据链**：每个 AI 的 `mind` 只记录自己看见/听见/搜查到的事实
  （`saw_* / heard_* / env_* / saw_body / search_result`），并换算成 `sus` 嫌疑分；
  **禁止读取 `alien` 身份**。新增动作或环境提示必须调用 `noticeAction()` / `aiHear()` / `envNotice()`，
  同步 `EV_W` 权重与门禁，否则 AI 会“看得见但不会想”。
- **确证（known）与嫌疑（sus）必须分开**：`mind.known[席位]` 只由**异形专属行为**写入
  （钻管道 / 出刀 / 破坏设备 / 停摆机器人 / **拉闸断电**，或看见 `redT>0` 的刀者红身，见 `trackNight`），
  写入后 `sus=1`、会议必指控、投票必投、开枪/追击距离放宽（10 / 14 格）。
  **开枪、拖尸、拘留、合闸**这些人类也会做的事只能加 `sus`（或什么也不加），不得写成 `known`；
  新增「异形专属」判定必须同时确认人类无法执行，否则会把人类误判成异形。
  `known` **跨夜保留**（`mindReset()` 里 `mem` 仍每夜清空，`sus` 按 `SKSanity.CARRY` **衰减保留**），
  因此后续每一场会议都能继续锁定同一个确证目标。
- **电闸的两种操作语义相反（2026-11-01 用户裁定）**：`noticeAction(…,'breaker')` 用 `G.lightState` 区分
  （`pullBreaker` 先更新状态再广播）：**拉闸断电**（`lightState===2`）是身份级证据，人类目击写 `known`、
  异形目击 `markMate`；**合闸复电**（`!==2`）**不确证人类**——人类目击只涨 `cred`（`credBroadcast`），
  异形目击只涨 `mind.humanT`（`SKSanity.HUMANISH`，挑目标时按 `pull×humanT` 拉近，最多 6 格当量），
  且 `humanT` **不写 mates / known**、不给任何人洗清。合闸时也**不再加 `saw_breaker` 嫌疑**
  （旧实现会给合闸者记 0.32 嫌疑，和「合闸是做好事」自相矛盾）。
  配电室是暗房、闸杆贴墙，只有紧挨闸杆的一小条站位 `aiCanSee` 得到——这是刻意的：**守闸才有确证**。
- **系统不得替玩家发言**：聊天栏里挂在 `G.me.name`（默认「01 星尘」）名下的行，只能来自玩家自己
  输入（`say(G.me.name, raw, true)`）。以前玩家拉铃时 `startChatter` 会硬写一句"我在X发现Y…"给他，
  看起来就像有个 **AI 星尘在串台**；现在改成 `sysSay('星尘 在X发现了Y，刀伤，人已经没了。')`。
  顺带修掉一个死分支：那句硬编码绕过了 `openingLine()`，导致"先别急着乱投，先救人"那一档永远说不出口。
- **确证过就不许再辩护**：谁手里有对某人的确证（`mind.known[i]`），就不得再生成"他不是异形/别投他"
  这类替他开脱的台词——当场自相矛盾。守卫加在两个生成点：队友辩护（`startChatter` 的 `def/mate` 循环）
  和说谎者帮腔（`planAlienDeception` 的 `frame.allyText`）。注意 `noticeAction` 里 `if(w.alien)continue`，
  所以 `known` 目前只有人类会写；这条守卫是为"规则先立住、以后不踩坑"服务的。
- **AI 报告与会议（2026-10-30 改版）**：**不再有「每晚只开一次会」的限制**，改成
  **同一具尸体同一夜只报道一次**（`bodyReported(v)` = `v.reported && v.reportNight===G.night`，
  写入统一走 `markBodyReported(v)`）。旧实现让 `reported` 跨夜永久锁死，等于一局只能报一次；
  现在按夜解锁。实际上更强的一层是 `openMeeting` 在**会议开始的瞬间**就把所有尸体 `bodyGone`，
  所以一具尸体物理上不可能被报第二次——门禁两条都测。
  `canReportBody()` 对尸体分阵营处理：人类照常报告；异形先算 `alienReportWorth()`
  （人类进度收益 × 旁人目击风险 × 是否已被确证 × 每夜固定的 `_stallBias`），
  **每具尸体只算一次**（`_reportMemo`，避免每帧重采样变成必报），过 0.45 阈值才去拉铃——
  这是「异形故意报告拖时间」的唯一入口，不要改回无条件 `return true`。
  `G.aiReportUsed` 现在只是「本夜有没有人报过」的统计位，**不再是门禁**；新增报告入口不得再用它拦截。
  AI 异形也允许报告；「跟票」只给自身有动静（`mind.alert ≥ 0.25`）的人类 AI，零证据的人类 AI 必须弃权，
  不允许会议叙事替没有证据的人凭空定罪；
  玩家自由发言由 `parseSpeech()` 拆成槽位（人 / 舱室 / 指控 / 投票 / 支持 / 否认 / 自述位置 / 直接证据）后进入
  `m.ctx.playerSays`：谎报位置会被目击者用 `saw_agent` 记忆对质并 `susAdd(w,0,…)`；
  **自述位置只认第一人称**（我今晚在 / 我当时在 / 我整晚都在 / 我在…），不要把「我看见 X 在配电室」
  误判成玩家在配电室；新增发言意图必须走槽位，不要在台词里另写一套正则；
  人类发现濒死先搜尸，未检查的 `searched=false` 尸体不能被当作已取证；
  没有证据的 AI 人类会议投票必须弃权（-1），异形保持独立随机投票，不得按阵营过滤。
- **身体状态**：刀/枪必须写入 `woundCause` 与 `downRoom`；搜尸必须置 `searched=true`；
  拖拽必须置 `bodyMoved` 且双向互指；尸体卡、`_t.bodyInfo()`、会议报告都要读同一套字段。
- **AI 认知**：`mind` 的 `mem` 每夜清空、`sus` **跨夜衰减**（`CARRY`），`suspect` 每夜重置；
  `known` / `mates` / `cred` / `trust` / `grudge` / `warm` / `humanT` / `reliability` / `almost` / `claimHist` 跨夜保留。
  新增行为必须同时更新 `_t.mind()` / `_t.bodyInfo()` / 门禁断言，并避免让 AI 通过 `killedBy`、`alien`
  或系统队友表获得隐藏身份；`mates` 只接受 `markMate()` 的目击写入。
- **推理链扩展（2026-10-30）**：`susCut()` 用案发时间附近在别舱的 `saw_agent` 做反向洗清（不动 `known`）；
  `noticeAction('shot')` 若目击者自己确证过被害者是异形，则不把开枪者记成凶手（`justified`）；
  零证据指控会给发言者记 `empty_accuse` 小嫌疑；替已被确证异形辩护会给辩护者记 `defended_suspect`。
  新增证据/洗清规则必须同时更新 `_t.mind()` 与门禁，不能把“没证据”写成 `known`。
- **嫌疑四层链 + 三条硬护栏（2026-11-01，推理引擎规范化）**：`cred` → `sus` → `almost` → `known`，
  数值全部在 `js/ai/sanity.js` 的 `CARRY / ALMOST / RELIA / MIND` 四张表里，业务代码只查表。
  **不许回退成「sus 每夜清零」**（那会让 AI 没有「这人一直很可疑」这个中间概念），但必须守住三件事：
  ① `CARRY` 的**分类型衰减**（`saw_*` 慢 / 传闻快）+ **无新证据额外 ×0.55** + **存量封顶 0.45**；
  ② **夜间行动读嫌疑必须走 `susOf(a,i,true)`**（跨夜存量 ×0.7），否则天亮第一分钟就有人凭旧印象开枪；
     会议里的指控/投票读全额；
  ③ `almost` **可推翻**：`evalAlmost()` 在每次 `susAdd` / `credAdd` / `mindReset` 后重算，
     条件不成立就删条目。`known` 写入时必须调 `knownOverride()`（删 `almost.friend`、清 `cred`，
     **不动 `trust`**），并且 `credAdd` 对已 `known` 的对象直接 return —— 洗白不能覆盖亲眼所见。
  `almost.foe` 的「不同种类」用白名单式排除：`heard_*` / `silent` / `empty_accuse` / `leader_order` /
  `quick_report` / `wrong_accuse` **都不算证据种类**，否则「被三人说可疑 + 话少」就能凑出准-确证，
  和 `empty_accuse` 的惩罚直接打架。
- **证言可信度 `reliability` 只在 `settleAccountability` 回写**（带对 +0.35 / 带错 −0.30，跟票减半），
  读取只在 `heard_accuse` 权重上乘 `SKSanity.reliaMul()`。它和 `cred` 是两条不同的东西，别合并。
- **熵只改语气，不改弃权率**：`SKSanity.MIND` 的熵阈值决定「要不要此刻点名」与台词语气；
  `voteAbstain` 是调平衡调出来的阀，**熵不许接进去**（会变成隐式平衡改动）。
  **沉默线索只对「白纸」生效**（该对象在本观察者那里没有任何 `why` 条目），
  上限 0.10，且不得参与 `almost.foe` 的凑数 —— 否则「昨天 0.45 存量 + 今天话少」会被拼成一次没有新证据的指控（实测这一条会把误逐人类从 1.16 推回 1.78）。
- **人类辩护不得读 `tgt.alien`**（2026-11-01 修）：原来是 `if(!tgt.alien)continue`，
  等于让 AI 抄身份答案 —— 「装了好几天的异形永远换不来一句辩护」，伪装收益是假的，
  「昨天保他、今天咬他」在真实对局里也演不出来。现在只看规则：没亲眼确证过他（`known`）
  且不是 `almost.foe`，就可能替他说话；被保的人日后翻出是异形时，
  `settleAccountability` 会给保人记 `defended_revealed` 嫌疑并让他说一句「我上次看走眼了」。
- **在场反驳只认亮房**（`presence_deny`）：要求指认者的证词**带具体舱室且算硬证词**、
  我在同一时间窗内**确实在那个舱室**（`saw_agent` 的 `ox/oy` + `lit`）、且那间是**亮房**。
  暗房/走廊一律不适用 —— 「没看见」绝不能变成万能反驳。权重 0.16（低于正面矛盾 0.28）。
- **口供史只记不判**（`claimHist`，最近 3 夜）：只允许说出「你上次说的不是这个」，
  **不产生任何 `sus`** —— 昨晚在引擎室、今晚在配电室本来就正常，给权重就是又一处量词错误。
  它与 `mem`（我看见谁在哪，客观）是两件事，不要合并字段。
- **证据分级：多远才算「亲眼确证」（2026-11-02）**：`noticeAction` / `trackNight` 的目击
  **必须比 `SKSanity.CONFIRM.nearR`（4.5 格）**——贴脸才写 `known`，远了只加嫌疑（`ev.far=1`）。
  这一条是「AI 判定太神」的正面解法：**削弱的是"看见"的门槛，不是确证本身**。
  实测确证写入 8.55 → 6.2 次/局。**不要为了"多抓几个"把 nearR 调回去**。
  同场会议里口供矛盾按目标去重（`contraHit`）：一个人被三个目击者看见也只记一次 0.28 ——
  以前是重复计账，等于把"证据太准"算成了三次。
- **票权 > 权重（2026-11-02）**：`almost.foe` 是**票权**（在 `startVote` 里先于 sus 分支），
  `almost.friend` 是**挡票**（`ALMOST.friendVoteShield`）。之前只乘 ×1.6 权重，
  实测只影响 1.4% 的票，等于摆设。两者仍然都不是锁死（可被洗清 / 降级 / 恩人豁免）。
- **软联盟只做一档**：`defenseNote` 记 `mind.ally[tgt]++`（上限 `META.noteCap`）；
  被保者翻出是异形时，`ally >= META.allyCount`（2）的保人吃 `ally_revealed`（0.16×1.7）
  并说一句「我上次看走眼了」。**不做传递闭包，也不做"共同指控"连坐** —— 会变成连坐机器。
- **回避可观察**：`aiIdleRoam` 里被谁咬得最狠就往反方向走（`_avoidHuman`）；
  被回避者在 6 格内看得见时记一条 `saw_avoid`（`AVOID.sus` 0.10，每夜一次）。
  这是"白天结论 → 夜里行为 → 又变成证据"的闭环；**权重必须小**，别变成"谁躲谁可疑"。
- **误判要来自"被说服"，不是随机噪声（2026-11-02 用户裁定）**：
  提高误逐率只认三条 —— 构陷权重（`heard_frame` 0.26）、带节奏跟票（≥2 人咬同一人时
  门槛 0.18 → 0.10）、连坐。**别用 `voteAbstain` 当误判阀**：实测把它降到 0.44
  反而让人类更准（票多 → 证据被更多票兑现），说明弃权率不是"冤枉"的来源。
- **节奏三层（2026-11-02 用户裁定，必须一起看）**：
  ① **夜晚会议不占用夜晚时间**（`SKSanity.MEET.pauseClock`）——会议期间夜里时钟**暂停**，
     `finishMeeting` 里 `nightLeft = m.remainMs`（**不再减去会议时长**）；
  ② **白天会议回会议室**：全员被刷新到中央会议室并**打断此前的一切任务流程**
     （`dawn()` 里统一 `tp` + 清 `path/doing/_doing/act/drag`），文案保留"全员回中央会议室集合"；
  ③ **夜晚会议是远程的**（人不离岗）：只清移动路径、**保留 `doing/_doing`**，任务进度不丢。
     两条**不要写反**：夜里开会不打断、白天开会打断，是这一版的核心节奏差。
  数字只在 `SKSanity.MEET`（`perNight` / `reportsPerAgent`）与 `NIGHT` 里改。
- **报告是稀缺资源（2026-11-02）**：**全局每人 2 次**（`reportLeft`）、**每夜最多 2 场夜会**
  （`G.nightMeets`）。**顺序不能反**：必须先 `nightMeetLeft()` 再消耗额度，
  否则"开不起来的报告"会白吃一次额度（`canReportBody` / `tryReport` / `aiScanBodies` 三处都要先判）。
  玩家与 AI 同一额度，HUD 必须显示（`#rp` 报告余量 / `#mt` 本夜会议数）。
- **异形报告的动机换成"误导"（2026-11-02）**：夜晚会议不再吃时间 → **"拖时间"这项收益整体作废**。
  现在的价值表是 `SKSanity.MISLEAD`：收益 = 现成的靶子（`sus≥0.35` 的人数）+ 适合被栽赃的人
  − 自己的牵连风险；风险 = 现场有人看着（×0.60/×0.30）+ 刚被看见过（×0.45）+ 额度稀缺（×0.55/0）。
  **不许再把 `alienReportWorth` 写成"按人类进度算收益"**（那是旧口径）。
- **开夜禁刀（2026-11-02）**：夜晚开始 **5 秒**内任何阵营都不能出刀（`SKSanity.KNIFE.lockAtStart`）。
  锁在**输入层**（玩家按键 `attack()`、AI 决策分支、行为效用表的 `chase`），**不在结算层 `knife()`** ——
  否则门禁的刀击链路用例会被这条规则误伤（结算层只做兜底，不做拦截）。
- **证据分级的距离门槛（2026-11-02）**：`SKSanity.CONFIRM.nearR = 4.5` —— 贴脸目击才写 `known`，
  远距只加嫌疑（`ev.far=1`）。这是"AI 判定太神"的正面解法；**不要为了让异形更好抓而调回去**。
- **异形拆保安的欲望（2026-11-02）**：`SKTeam.BOT_SEC_VALUE` 13 → **8**，低于追人（9/12），
  所以**身边有猎物就不拆机器人**；而且候选只在 `secbotRaidOk`（≥2 队友 + 共同目标 + 45% 概率）成立时存在。
- **点错要有反馈（2026-11-02）**：`clickAt(tx,ty)` 是唯一的落地入口（DOM 事件与门禁钩子共用）：
  走不通时给 **禁止符号 + 文字提示**，不能"点了没反应"。
- **跟票必须"手里有动静"（2026-11-02）**：带节奏把跟票门槛降到 0.10 时，
  跟票者对该目标必须有**非传闻类**理由（`silent` / `empty_accuse` / `heard_accuse` / `heard_frame` /
  `leader_order` / `quick_report` 都不算）——否则"沉默线索"会变成凭空定罪的票。
- **时间线拆谎必须走 `checkAlibi()`（2026-11-01 修量词）**：`saw_agent` 是位置时间线（一人一夜十几条），
  所以四类 `contradiction*` **禁止**再写成「存在一条不匹配就定罪」。铁律三条：
  ① **窗口内有一条与口供一致 → 不定罪**（`r.match`）；② 窗口内没有记录 → 闭嘴（`r.checked===0`）；
  ③ 只有全部不匹配才成立，且证据取**最接近案发/口供时刻**的那条（不是第一条也不是最后一条）。
  数学在 `SKSanity.checkAlibi`（纯函数），取窗口与状态在 `game.js` 的 `checkAlibi / crimeWindow / claimWindow`；
  时间窗按调用点区分：案发会议 `crimeWindow(victim)` = 死亡时刻 ±8 秒；假口供/玩家口供用 `claimWindow()`
  （「刚才」20 秒 / 「一直·整晚」整夜 / 没说时段 45 秒）。**走廊与未知区域记录不算「在某个舱室」**。
  **不要恢复 `mem.slice(-24)` 的按条数截取**（那是时序错乱的次因）。
  发言必须带证据新鲜度（`SKSanity.alibiTimeWord`：刚才 / 十几秒前 / 半分钟前）。
  新增拆谎点必须复用这套工具，并在门禁里同时覆盖「有匹配记录 → 不定罪」「全部不匹配 → 成立」两个方向。
- **异形身份信息**：异形之间**不共享身份、没有系统队友表**；AI 不得读取任何队友信息，
  目标、会议指控和投票都不能按 `alien` 阵营过滤。允许的唯一“队友”来源是 `a.mates`（亲眼目击异形专属行为推断）；
  未识别的同类仍可能被攻击/投票。人类只有目击异形专属行为（出刀 / 钻管道 / 破坏设备 / 停摆机器人 / 开枪）才写入 `suspect`；
  `witnessAlienAction()` 仍只服务人类目击，禁止恢复盟友表或队友透视。
- **物资申请单**：任务积分到 3 / 5 → `qualPending` 待领取 → 中央会议室**圆桌** `_doing='qual'` 站桩 3 秒领取
  1 张申请单 → 军械 / 医疗**专用补给点**消耗 `qual` 换子弹 / 医疗包。未领取时补给点必须拒绝。
  圆桌判定半径 **2.3 格**；`qualPending>0` 时 HUD 常驻「回圆桌领取」提示，小地图圆桌有金色脉冲；
  AI 人类完成 3/5 分后同样会自己走回圆桌领取（门禁有真实节奏断言）。
- **硬掩体布局**：`M.cover` 是硬阻挡。任何掩体改动必须满足：房间连通、任务点可命中、
  同房间掩体间距 ≥1.2 格或贴墙、掩体不制造尽端死路；跑 `_t.coverAudit()` 必须 `gaps=[]`、`dead=[]`。
  改完必须用 Blender 重渲底图。
- **自动门**：`G.doors` 由房间门 + 走廊端点生成（当前 22 扇：10 间舱室的房门 + 走廊端点）；`doorTick()` 负责开合，
  `doorBlockedSegment()` / `losNow()` 负责移动与视线。门板纹理由扩散模型生成，门框由 Blender 烘焙；
  改门口几何后必须重跑 `tools/blender-ship.py`。
- **断电门禁**：断电（`G.lightState===2`）期间，每扇**非** `*:bridge` 门在有人靠近时
  `d.scanT += dt`，满 2 秒才放行；人离开后 `scanT` 归零重新上锁，恢复供电立即清零。
  `doorBlockedSegment()` 在 `scanT<2` 时直接拦人，`drawDoors()` 用 `scanT` 画红色扫描线；
  会议室三扇门（id 以 `:bridge` 结尾）永远豁免。不要改回一次性全局锁，也不要用 `open` 状态绕过扫描。
- **交互轮盘**：`E` 收集附近交互，`F` 统一施救（任何角色，需医疗包），`H` 才是异形破坏技（靠近机器人时给出「停摆机器人 / 破坏舱室」两项）；多项必须打开 `#wheel`，不得用固定优先级吞掉选择。
- **幽灵任务**：玩家与 AI **人类**幽灵都可执行自己的剩余任务和故障维修，任务/故障均 1.6×；
  每只幽灵最多获得 **2 分**任务进度（`ghostPts` 跨夜保留，`ghostTaskAllowed()` + `finishDoing()` 双重上限），
  额度用尽后 AI 幽灵只飘、不再接任务。`aiGhost()` 优先修故障，其次做剩余任务（6.5 格/秒）；
  **异形幽灵不执行任何维修/任务**（`aiGhost` 直接待机、`startTask/startFix` 拒绝），
  因为推进人类进度对异形没有收益。不能报告、搜尸、拖尸、施救、破坏或使用补给。
- **站桩动作**：`tickDoing()` 对所有 `_doing` 一移动就打断；开始任务 / 维修 / 领取时必须清空 `path` 与 `moving`。
- **保安识别与押送（2026-10-30 改版）**：`SEC_RANGE = 10.5`、`SEC_ARC = π/2`（180° 前方半圆），行凶/攻击点必须在半径内、
  `losWalls` 无遮挡且在朝向扇形内；**拘留 `30` 秒**、每夜最多 `SEC_USES_MAX = 2` 次。
  看到危险行为后**不再瞬移锁角落**：`secCatchStart()` 起一段 `G.secCatch` 状态机
  （`chase` 以 `SEC_CATCH_SPEED=7.5` 近身追捕 → `press` 压制 0.9 秒 → `escort` 1.2 秒押送到 `secJail()`），
  `botTick()` 在 `G.secCatch` 存在时**跳过巡逻**，押送到位才 `detainedT=DETAIN_TIME` 并写 `noticeAction('detain')`。
  追捕 7 秒还没贴到人就放弃（`G.secCatch=null`）。改这段必须同步 `drawFacilities()` 的追捕连线/压制提示与门禁。
  **拘押与机器人被摧毁都不再 `toast()` 公告**（只留火花 / 警报特效与在场目击者的 `saw_detain` 嫌疑）。
  **拘留证据的唯一入口是 `witnessDetain(actor,x,y,rad)`（2026-11-01）**：压制瞬间 10 格内、
  押送到位时 8 格内、**看得见**的人各记一条 `saw_detain`（`EV_W` 0.6，人类还 `w.suspect=actor.i`），
  **绝不写 `known`**——被抓的可能是开枪的人类；同一夜同一人只记一次（`mind.detainSeen`）。
  不要复用 `witnessAlienAction`（它第一行会 `if(!actor.alien)return`，人类被抓就整条丢失）。
  远处的人只走 `aiHear('detain',…,{})`：**不能传 `subj`**，否则 26 格内的人闻声就锁定被拘留者
  （比亲眼看见还准，且泄露身份）。
  拘留次数只读 **`SEC_USES_MAX`**（当前 2）：判定、互动提示、地图机器人标签 `botLabelText()` 与
  `_t.robots().sec.left` 必须同源；不要在标签里写死 `/3`（2026-10-31 修过一次）。
- **机器人受击**：保安 / 医疗机器人是实体目标（HP 保安 2 / 医疗 1）；新增攻击入口必须走
  `knifeBot()` → `damageBot()` 或 `fireShotBot()`，同步 `secbotDead` / `medbotDead`、`pendingCrime` 与目击证据。
  出刀砍机器人**必须消耗刀数**并按装甲 HP 结算，AI 不允许"贴身一下就直接停摆"：
  AI 异形只有 `a.knife<1` 时才允许动用每夜一次的破坏技停摆，砍完一刀有 `_botCD` 10 秒冷却，
  避免同一台机器人同时吃掉刀和破坏技。
  保安被攻击时会转向袭击者并尝试反制拘留；即使未造成濒死，危险行为也要写入 `pendingCrime`。
- **地图与底图**：改 `js/data/map.js` 的房间 / 墙体 / 门 / 走廊后，逻辑碰撞立即生效，
  但 `assets/scene/v4/base-lit.png` 必须用 `tools/blender-ship.py` 重新烘焙；无 Blender 时须在交付说明中标注底图未更新。
  改家具**材质**（`assets/scene/v4/tex/panel-metal|crate-steel|fabric-weave|table-composite|panel-white|hazard-stripe|ao-soft.png`）
  同样要重烘一次；材质由 `tools/gen-materials.py --mode sdxl` 用本地 SDXL 生成
  （768px 出图 → 降饱和冷调 → 四向镜像拼贴 → 回缩 1024）。
  **（2026-11-04）** 上述 `assets/scene/v4/tex/*.png` 与 `3d/preview/assets/textures/*` 已**出仓**：文件仍在
  本机磁盘（重烘要用），但不再进 git；入库的只有运行时真读的 `door-panel.png`。完整性由
  `assets/MANIFEST.json` + `node tools/assets-check.cjs` 兜住，恢复路径见该工具的 `--from-git`。
  该工具刻意**不走 diffusers 默认的 safetensors mmap 加载**（5.13GB fp16 UNet 在 16GB 内存机器上
  会 access violation 段错误），而是逐张量流式上卡 + 先编码提示词再释放文本编码器；
  没有显卡时用 `--mode reuse` 从场景已有素材派生兜底。
- **底图烘焙的四条约定**（`tools/blender-ship.py`，2026-10-30 改版）：
  · **灯光**：每间房 = 一盏高空泛光盘 + 一个 **9 格网格布灯**（只在房间 poly 内放灯），
    总能量再乘 `--lum 1.6`（扫值标定：中心 79.6 / 边缘 61.3 / P05 23.9 / 暗面 10.9%，
    全面优于旧的"一盏近灯" 74.6 / 53.3 / 10.9 / 17.6%）。
    **不要改回单间单灯**——`max(6, min(rw,rh)*1.3)` 的灯幅盖不住 42 格宽的仓库/会议室，就是"边缘发黑"的根因。
  · **舱室主题**：`ROOM_THEME[rid]` 一处定义墙面色调 / 墙顶自发光 / 挂灯色 / 地面喷涂色。
    12° 俯角下墙面只剩"顶面一条框"，所以房间身份主要靠**墙顶边框色 + 地面标识 + 家具顶面剪影**传达。
  · **实例变体**：家具按 `room|label|kind` 的 FNV-1a 哈希派生色调档 / 指示灯配色 / 高度 ±10% /
    子部件开关 / decor 微旋转。**只改 z 与颜色，不改 w/h**，所以碰撞与 `coverAudit` 完全不受影响；
    `cover` 一律 `rot=0`，只有 `decor` 允许旋转（`geo.js` 不读 decor，旋转不会与阻挡矩形错位）。
  · **decor 是纯表现层**：`js/engine/geo.js` 的可行走网格与 `los()` 只看 `M.cover`，**不读 `M.decor`**。
    所以往 decor 加东西零碰撞风险、不用重跑 coverAudit；但大件必须留在 `cover` 里，
    decor 只能用扁平/贴墙/桌面级小物，否则玩家会看见自己踩过一台不阻挡的机器。
    2026-10-31 已把大件家具（柜子/机器/货盘/桌椅）全部迁进 `cover`（51 → **59** 件），
    `decor` 只保留地面喷涂、桌面餐具、床头小设备等 **22** 件；删掉 16 把只是装饰、不阻挡的椅子。
    改完必须 `node tools/map-check.cjs` 得到 `gaps=[] dead=[]`，否则不要烘底图。
- **音效分层**：枪声与刀声必须是两种材质——`sfx-gun` 从枪声瞬态起（无前导静音）+ 降速低通的炮口闷响，
  出刀保持 2k+ 破风 + 入肉；`sfx-ui` / `sfx-work` / `sfx-flesh` / `sfx-win` / `sfx-lose` 各有采样池。
  新增/替换音效后跑 `python tools/sfx-audit.py --check`，静音、削顶或 >80ms 前导静音一律拦下。
- **事件流与回放是只读旁路**：`logEvent(kind,data)` 把 `{kind,night,pt,t,actor,victim,room,x,y,...}` 追加进 `G.events`，
  `recordFrame()` 每 0.5 秒把 15 个席位的 `[i,x,y,flags]` 采样进 `G.frames`（`simMode` 不采样）。
  所有结算入口（`knife` / `fireShot` / `die` / `finishDoing` / `finishFix` / `damageRoom` / `pickPipe` /
  `alienPipeMove` / `pullBreaker` / `startDrag` / `releaseDragBy`（含 `drag_away`）/ `openMeeting` / `closeVote` /
  `say`（会议发言 → `chat`）/ `secCatchTick` / 医疗机器人施救）都必须落事件；
  `SIM_RUN` 批量模拟不记 `chat`；`logEvent` **不得读写对局判定**，事件缺失只影响复盘。
  `js/ui/replay.js` 只读 `replayData()`（roster + events + frames + result），不得依赖 `G` 或 `SKV3._t`。
  新增可复盘的事件类型时，同批补 `js/ui/replay.js` 的文案/筛选与门禁断言。
- **医疗机器人施救计时**：`G.medbotT` 在每次成功施救后**必须清零**——否则救完第一个后 ticks 仍 ≥5，
  同一波濒死会被瞬间连带救起（门禁断言 `b1.medLeft===1 && b2===0`）。
- **胜负数值单一真源**：人类维修胜利目标分只有 `js/game.js` 的 **`WIN_PTS = 45`** 一处，
  `checkWin`、结算文案、HUD 上限（`#pgmax`）与进度条都读它；模板里不许再写死 `/ 40` 这类数字
  （历史上就写过，导致 HUD 显示 40 而实际按 45 结算）。门禁有同源断言。
- **破坏与故障**：每个异形每夜一次破坏技；故障统一存 `G.dmg`，**30 秒**倒计时只在 `update` 里走；
  超时未修 **维修进度 -5**（2026-10-30 从 -3 提高）。人类胜利维修目标 **45 分**（同日从 40 提高）；
  新增维修/破坏入口必须走 `damageRoom()` / `startFix()`，胜利判定只读 `checkWin()`。
  新增破坏入口必须走 `damageRoom()`，新增维修入口必须走 `startFix()`（`doing='fix'`，连续 10 秒，
  移动打断）。幽灵不可破坏；天亮清空故障且不扣分。

## 五、改动流程

1. 先读 `README.md`、本文件、`CHANGELOG.md` 最近条目。
2. 小步修改；涉及地图/寻路/会议/输入的改动，先 `npm start` 或直接 `file://` 冒烟。
3. 跑 `npm test`，确认「X 通过 / 0 失败」，并抽查 `tools/screenshots/` 的截图（元素存在 ≠ 像素可见）。
4. 更新 `CHANGELOG.md`（版本号 + 日期 + 实测读数）。
5. 提交并推送：`origin`(GitHub) 是发布目标，`gitee` 是镜像（失败只警告、不拦停）；GitHub 走代理、Gitee 直连，两条互为兜底。仓库简介保持「新返航录 · 返航录V3」口径。

## 六、当前基线（返航录V3）

- 门禁：`node tools/test-v3.cjs` —— **712 条断言，712 通过 / 0 失败**（2026-11-04 复跑，Edge headless，依赖已收回本仓）。
  语料体检：`node tools/lines-audit.cjs --strict` —— **1400 通过 / 0 失败**（退出码 0）。
  **当前数值基线 = F 轮（亮区整片可见放开之后）**：人类 **57.6% / 异形 42.4% / 超时 0**
  （95% Wilson 54.51~60.63），夜 5.682、进度 34.245、刀 10.04、会议 11.35、破坏 10.101；
  **驱逐准确率 52.07%**（人类赢的局 64.3% 准 / 异形赢的局 34.8% 准）。
  上一轮 E 轮（AI/玩家数值一致化）是 60.2/39.8、51.94% ⇒ **放开的代价 ≈ −2.6pp 朝异形，约 1.2σ**，
  不能当作已定位移；真正变化的是 **`knownWrites` 7.52 → 7.01、`exiles` 3.28 → 3.12**（远处观众只加嫌疑），
  以及伪装演出与回避变多（`fakeTasks` 8.19 → 9.28、`avoidCount` 42 → 47）。
  两个原始包并排保留（入库为压缩档）：`tools/mc-results.json.gz`（F）与 `tools/mc-results-E.json.gz`（E，放眼前的对照基线）。
  D 轮（一致化之前）是 58.5/41.5、52.25%。
  夜长是**变动值**（120 → 100 → 90 → 75）：门禁里**不要写死 80 / 120** 之类的秒数，
  用 `_t.nightLen()` 取运行时真值（`暂停面板「重开本局」` 那条已经改掉）。
  本轮（拟人批次一）新增：击杀加速与红身解耦、终结者时刻、报告绑定"那一次倒下"、
  领袖号召力重尾 + 有人接牌 + 当众拒绝、LENS 贵信号（异形真修 / 真救走同一条入口）、
  非舱室迷雾压淡但不透雾看见人、取消全图锁敌（视野 + 25 秒记忆 + `huntSpotFor`）、
  会议 50/5/5 节奏、互斥证词不吃共证加成、语料 1152 行渲染体检（零花括号 / 零空句 /
  `selfcite` 真被 parseSpeech 认成自述）、内联台词池源码级归零、结算页身份表 + 投票矩阵、
  复盘页「聊天/发言」独立筛选。
  上一轮（节奏批）新增：每夜会议上限 2 场、报告额度 2 次/人（用完被拒）、开夜 5 秒禁刀、
  夜晚会议不打断任务（doing 保留 / 只清路径）、白天会议刷新到会议室并打断任务、点错给禁止符号。
  本轮（证据分级 + 读人批）新增：远距目击不写确证 / 贴脸照旧确证、`almost.foe` 票权、
  `almost.friend` 挡票、软联盟连坐、回避可观察。
  上一轮（推理引擎规范化）：跨夜嫌疑三条护栏（分类型衰减 / 无证据加速 / 封顶）、
  证言可信度双向回写、`almost.foe`（两类证据）与 `almost.friend`（两类正经行为）、
  `known` 硬覆盖（删 friend + 清 cred + 写 foe + 遥测）、在场反驳、信念熵高低档、
  沉默只对白纸、口供史按夜累积、人类辩护不看阵营。
  `3 秒后红身自动结束` / `开枪特效…自动收尾` 两条已从**固定 sleep** 改成 `waitForFunction` 等条件
  （红身与特效按模拟时间衰减，`dt` 钳在 0.05，机器一忙就会落后墙钟 → 未改动的基线上也会随机失败）。
  **新增实时动画断言一律用「等条件 + 超时」，不要写死 `waitForTimeout` 再断言归零。**
  2026-11-01 本轮新增：时间线拆谎量词（有匹配记录→不定罪 / 全部不匹配→成立 / 走廊不算舱室 /
  窗口外不算 / `checked=0` 闭嘴 / 时间词分档）、电闸两种操作（拉闸→人类 known + 异形 mates；
  合闸→人类 cred、异形 humanT，且都不写 known/mates）、保安拘留进记忆但不确证（含同夜去重）。
- 底图光照基线（**2026-10-31 · 98×94 终烘 4704×4413**）：
  按「不透明像素 luma<30」口径，全船暗面 **11.0%**、均值 66.0、P05 15.7。
  **不要直接拿它与 98×82 时期的 5.6% 对比**：新增的 12 格医疗间、四条加长走廊、以及更深的会议室地毯
  都在画面里增加了非房间暗面；分舱视觉抽查以 `tools/screenshots/24_2.5D底图_跟随.png` / `25_2.5D底图_全图.png`
  为准（仓库/会议室边缘无死黑）。再改灯光/地毯时用同一口径复测，并同时看分舱截图；
  真正的回归判据是“房间边缘是否有死黑”，不是单一全局百分比。
  98×82 时期的历史对照（中心 83.2 / 边缘 65.8 / P05 33.6 / 暗面 5.6%，改造前 16.0% / 73.5 / 55.4 / 22.6）保留备查。
- 音效电平基线：`python tools/sfx-audit.py --check` —— 游戏内引用到的 **15 条全部 PASS**（2026-10-31）：
  **sfx-gun 峰值 -2.8 / 短窗 -11.1 / 起始 19ms**（旧文件起始 140ms，已修）；出刀两条 -13.1 / -13.3；
  door / metal / flesh / scream 已全部重新母带到 -3 dBFS 以下；step 统一到 -20 RMS；
  新增 ui / work / win / lose 采样池。**没有静音、削顶或 >80ms 前导静音。**
- **蒙特卡洛 · 拟人批次一（2026-11-03，D 轮 · 1000 局 seed 20261030 · 报告已扩充）**：
  **人类 58.5% / 异形 41.5% / 超时 0%**（95% Wilson 55.42~61.52），与上一批（C 轮 58.0/41.9）**持平**
  —— 这一批只动台词、UI、遥测、数值搬家与两处逻辑 bug，没碰任何平衡数。
  均值：夜 **5.687**、进度 **34.434**、会议 11.454、刀 **10.272**、破坏 10.793、驱逐 3.317
  （人类被逐 1.584 / 异形 1.733 ⇒ **误逐占比 47.75%**）。
  人类胜里 维修 45 分 **320** / 异形全灭 **265**；异形胜 415 局全是"人类全灭"。
  **刀数断崖（调平衡最该盯）**：≤8 刀 343 局人类 **97.67%**、9~10 刀 74.63%、11~12 刀 38.83%、
  13~14 刀 13.33%、≥15 刀 6.77%；夜数分桶 1~3 夜 97.59% → ≥11 夜 5%；
  **人类存活 ≥3 的局 100% 人类赢**，存活 ≤2 只剩 5.47%。
  速率：进度/夜 **6.055**、刀/夜 **1.806**、会议/夜 2.014、驱逐/会议 0.29、
  清场压力（刀数÷11）**0.934**、进度达成（÷45）**0.765**。
  **要调平衡**：往人类偏加 `NIGHT`（75，每 +15 秒约 +4~5pp）或降 `WIN_PTS`（45）；
  往异形偏反之。**报告规则与 `pauseClock` 是承重墙，不要动。**
  **本批新报告口径**（`tools/mc-report.md`）：① 配置快照（eval `sanity.js` 读数，隔周对比先对这栏）；
  ② **机制触达率**（多少比例的对局真的发生过，均值抹不平长尾）；
  ③ 刀数/夜数/会议/驱逐/进度/存活六套分桶胜率 + P10/P50/P90 分布；
  ④ 结束原因 × 胜者交叉表。**三条待决策读数**：终结者第 10 夜只 **5.3%** 的局进得来；
  `almost.friend` 0.328 次/局、`friendShield` 0.007 次/局 ⇒ 伪装能演但不能洗白；
  `realFixes`/`fakeBreaker` 恒 0 是效用表自己选的（贵信号不划算）。
  ⚠ **同 seed 不等于同随机路径**：任何新增一次 `Math.random()` 都会把后面整条随机流挪位
  （语料交替槽展开、去重重挑都算），所以**单机制次数**在跨批对比里可以大幅摆动而不代表回归；
  要归因必须换 seed 各跑一批看摆动幅度。
  ⚠ **工具口径盲区**：`orders/orderObey/orderRefuse/endorses` 在 AI 对 AI 里恒为 0
  （`startChatter` 在 simMode 直接跳过台词排期段，计数长在段里），机制本身由门禁覆盖、真人局照常发生。
- **蒙特卡洛 · 节奏批（2026-11-02，1000 局 seed 20261030，夜长最终 75 秒）**：
  **人类 56.5% / 异形 43.0% / 超时 0.5%**（95% Wilson 53.41~59.54），
  上一批（证据分级 + 读人）是 54.0% / 45.3% —— **基本持平**。
  调参过程：夜长 120 → 100 → 90 时人类 **70.3%**（会议时钟暂停让人类多出 30~60 秒干活时间），
  **压到 75 秒后回到 56.5%**。平均夜数 **5.81**、维修进度 **31.9**、会议 **12.09** 场/局、出刀 **11.08** 次。
  **驱逐准确率 57.9% → 55.5%**（人类被逐 1.157 → 1.552、异形 1.785 → 1.938）。
  报告实际用掉 **7.12 次/局**（额度 2 次/人），因"本夜会议开满"被拒 **0 次**。
  **要调平衡**：动 `NIGHT`（75，每 +15 秒人类约 +4~5pp）、`WIN_PTS`（45，+1 分约 −4pp）、
  `MEET.perNight`（2）——**不要回退推理链**。
- **蒙特卡洛 · 证据分级 + 读人批（2026-11-02，1000 局 seed 20261030）**：
  **人类 54.0% / 异形 45.3% / 超时 0.7%**（95% Wilson 50.9~57.1）——
  上一批 62.8%，**掉回五五开**。**驱逐准确率 57.9% → 48.9%**：
  人类被逐 1.157 → **1.763**，异形 1.875 → 1.688（**第一次冤枉得比抓得准还多**，这是用户要的）。
  确定性侧同步下降：`knownWrites` 8.55 → **6.31**、`contradictions` 69 → **36**。
  主要误判来源 = 异形伪证（`heard_frame` 0.14 → 0.26，68% 概率/场）+ 带节奏跟票，
  **不是随机噪声**。要收回来动 `heard_frame` 或 `ALMOST.foeSus`，别动证据分级。
- **蒙特卡洛 · 推理引擎规范化批（2026-11-01，1000 局 seed 20261030）**：
  **人类 62.8% / 异形 36.6% / 超时 0.6%**（95% Wilson 59.76~65.74）——
  与上一批（纯修拆谎）的 62.6% 基本持平：这一批加的全部是**双向**机制
  （跨夜痕迹、准-确证 foe/friend、可信度、沉默、在场反驳、夜行回避），
  人类与异形同时受益，所以整体没再往上推。
  代价是**驱逐准确率 66.2% → 57.9%**（人类被逐 0.874 → 1.299 次/局，异形被逐 1.71 → 1.785）：
  多了**跨夜累积的"这人一直很可疑"**，也就多了"旧印象定罪"。这是设计取舍，不是回归 ——
  若要收紧，动 `CARRY.cap`（0.45 → 0.35）或 `MIND.silentSus`，**不要回退整条跨夜链**。
  关键读数：`susCarry` 31.35 / `almostCount` 1.61 / `almostFriendCount` 0.26 /
  `almostEject` 0.72 / `almostVotes` 1.84 / `reliaWrites` 94.6 / `reliaSpread` 0.415 /
  `hedgeAgents` 71.1 vs `sureAgents` 17.0 / `silentSus` 14.3 / `presenceDeny` 8.68 /
  `retractCount` 1.18 / `avoidCount` 31.3 / `humanDefends` 9.85。
  `overriddenFriends` 与 `claimRecall` 在 sim 里是 0：前者因为 `almost.friend` 只有 0.26 次/局，
  后者是**纯台词侧**（sim 不排台词）。两者都有门禁用例，不要因为读数为 0 就删机制。
- 蒙特卡洛 · 推理质量批（2026-11-01，1000 局 seed 20261030，改动前后同 seed 对照）：
  **人类 62.6% / 异形 37.2% / 超时 0.2%**（95% Wilson 59.56~65.55），
  改动前同 seed 是 **52.1% / 47.0% / 0.9%** —— **+10.5pp，明显偏人类**。
  驱逐质量反而大幅变好：**驱逐准确率 45.2% → 66.2%**（`alienExiles/exiles`：1.43/3.17 → 1.71/2.58），
  **误逐人类 1.736 → 0.874 次/局**（几乎腰斩）。
  机制：`contradiction` 旧量词每局会在 **129.4** 次里成立，修完只成立 **71.8** 次（含四种拆谎），
  且裁决口径是「窗口内**所有**记录都对不上」——省下的全是**对真话者的误判**，
  而 site-1 的打击对象本来就全是人类 ⇒ 人类之间少了一大截内耗。
  **这就是胜率上移的全部来源**：本次没有动任何平衡数值（`WIN_PTS` / `NIGHT` / `EV_W` 全未改）。
  要拉回五五开，按上一节的口径动 `NIGHT`（120→130）或 `WIN_PTS`（45→44），**不要回退拆谎逻辑**。（2026-11-04 标注：本句是 2026-10-31 批次当时的口径，那时 `NIGHT=120`、人类 43.1% 偏异形；现值 `NIGHT=75`，**调参方向以 §六 重判，不要照本句执行**）
  遥测新增：`contradictions` 71.76 / `contradictionOld` 129.39 / `falseContradictions` 11.56 /
  `knownWrites` 8.88 / `knownVotes` 3.30 / `ejectByKnown` 1.68 / `detainWitness` 0.055 /
  `detainEvictions` 0.012（每局均值）。`knownBy` 实测只有 saw_red / saw_sabotage / saw_knife / saw_pipe，
  **`saw_breaker` 在 AI 对 AI 里 0 次**——异形有目击者就不会拉闸（`SKSanity.BREAKER.witnessCap=1`），
  所以「守闸确证」是**玩家侧**才吃得到的知识，模拟里几乎不产生收益。
- 蒙特卡洛（2026-10-31 复跑 · 返航录V3 · **保安/医疗削弱 + 98×94 扩图 + 真实掩体重排 + 拖尸 AI 之后**）：
  **1000 局 AI 对 AI，人类 431 胜（300 维修 45 分 / 131 清剿），异形 568 胜，1 超时** ——
  **43.1% / 56.8%**（95% Wilson 区间 40.1~46.2），**当前明显偏异形**（50% 落在区间外）。
  上一轮同口径是 54.9% / 44.9%（保安 14 格 / 3 次、医疗机器人 7 格、扩图前）；
  中间家具尚未重排时复跑得到 42.2%，重排后 43.1%，两次差异在 1000 局噪声内——
  胜率翻转的主因是**机器人削弱 + 走廊加长**，不是“大件改成掩体”。
  平均 **6.23 夜 / 14.76 次会议 / 11.19 次出刀** / 7.82 破坏 / 2.19 开枪 / 2.01 驱逐；
  结束时人类存活 2.34/11、异形 1.23/4，平均进度 38.9/45（中位数 41）。
  异形真做任务 0.41 次/局、假装做任务 1.01、假装维修 0.14、钻管道 **5.62 次**（规划 10.18）；
  搜尸 6.31 次/局、双方取到物资 4.05 次、复活 0.59 次。
  原始局当时在 `tools/mc-results.json`（现入库形态为 `.json.gz`），汇总在 `tools/mc-report.md`。**「当前基线」只对该 2026-10-31 批次成立**；现行基线见 §六（F 轮 57.6% / 42.4%）。
  **要调回五五开**（该批次当时的方向）：往人类偏把 `NIGHT` 从 120 加到 ~130，或把 `WIN_PTS` 从 45 降 1~2 分；
  往异形偏则把 `MEDBOT_CHARGES` 调回 1 或降 `NIGHT`。**报告规则是承重墙，不要动。**（这条与批次无关，仍然有效）
  **会议数 14.8 次**是“每具尸体都能报告一次 + 跑图变长”的直接结果；调平衡优先动 NIGHT/WIN_PTS，
  不要拿报告规则开刀。
- **刀数断崖（拆解，别乱调）**：胜负几乎完全由**刀数**决定，不是由会议数决定——
  按总刀数分桶，≤9 刀人类胜率 90%+、10~11 刀约 35%、≥12 刀约 14%，断崖正好压在「清场需要 11 刀」上；
  两条进度条实测同时到 90%（旧基线 进度 39.8/45、刀 10.2/11；当前基线刀数升到 11.19/局，人类更难活过清场线）。
  支撑它的是两条反向回路：①**负反馈**——人类进度越高，`alienReportWorth()` 的收益项越高
  （0.26 / 0.44 / 0.64 / 0.86），异形越愿意拉铃，夜晚被切碎，人类减速；
  ②**正反馈**——每少一个人就少 4 个任务点，任务速率从 8.9 掉到 5.8 分/夜，越死越难修。
  注意**会议总量与胜率强相关只是「局越长、刀越多」的伴随现象**：控制刀数后，8~9 刀时会议多的一半
  胜率 93.2%→73.9%（真伤害），但 10~11 刀时反而 30.6%→40.7%（局更长、人类总时间更多）。
  想动平衡：往人类偏就加 `NIGHT` 或降 45 分；往异形偏就加会议扣夜时长。**报告规则是承重墙，不要动。**
- 门禁覆盖：地图全连通 / 6 管道口 / **26 任务点（8 高难 + 18 普通；仓库 504 格 / 配电室 148 格 / 引擎 216 格）**、
  22 扇自动门开合与视线/移动阻挡、机器人 4 点巡逻与运行时判定、
  AI 夜间能力（拉闸 / 停摆机器人 / 破坏舱室 / 钻管道 / 开枪 / 救人 / 补给）、
  破坏技选舱 / 30 秒故障 / -5 进度 / 连续 10 秒维修 / 幽灵不可破坏、暗处不可隔空开枪、
  异形互不知道身份 / AI 不读取队友信息 / 互刀 / 投票可投队友、统一移速、
  保安 10.5 格 180° 弧形 / 追捕押送 / 30 秒 / 每夜 2 次、机器人受击与摧毁、医疗机器人 2 次电量 / 每次 5 秒施救、站桩维修移动打断、
  物资申请单待领 → 圆桌领取 → 军械/医疗专用补给点、硬掩体阻挡/绕行 + coverAudit 零夹缝零死路、
  AI 拖尸送医疗间复活（扣电量/留 bodyMoved/不变量）、AI 异形藏尸与藏尸点选择、
  AI 避开保安 180° 扇形（正对不出刀、转开即补刀）、AI 断电合闸、AI 主动寻管道口（含刀用完后）、
  管道口供只落在 6 个有管道口的舱室、
  AI 出刀砍机器人扣刀且按装甲 HP 结算（不偷用破坏技、留红身与危险行为记录）、
  DEV 免伤仍扣刀、刀者 3 秒红身与衰减、任务点改为掩体本体闪烁且无黄色虚线框、
  零证据人类 AI 全部弃权（跟票需自身有动静）、
  确证链路（钻管道/红身/拉闸断电 → known、指控与投票锁定、开枪与拘留与合闸不确证）、
  **时间线拆谎量词与时间窗（有匹配就不定罪 / 走廊不算舱室 / 窗口外不算）**、
  电闸两种操作（拉闸→人类 known + 异形 mates；合闸→人类 cred / 异形 humanT 且都不确证）、
  保安拘留进记忆但不写 known、发言槽位与时间线对质、
  开局讨论排期覆盖（内容 + 空档追问到结束前 2 秒）、
  搜尸取物资（玩家 / AI 人类 / AI 异形 / 倒地伤员、记忆 30 秒后绕回收尸、二次搜尸拒绝、背包容量）、确证跨夜长期记忆与锁定投票、
  AI 回场报告（离开→返回→拉铃）与快速报告嫌疑、AI 异形避开旁人目击（1 人冒险/2+ 放弃、队友豁免）与直接报案、
  异形会议反咬/构陷（真目击者投票不被带偏、传闻嫌疑不写 known、时间线拆谎）、异形队友识别/保护/联合构陷、
  会议模板一键发言（8 个模板均被 parseSpeech 识别）、玩家直接证据 heard_claim 与 contradiction_claim、
  AI 无休息连续维修、故障/合闸优先与弃修逃跑、AI 幽灵 2 分额度与做任务、异形幽灵不推进进度、
  AI 双方搜尸取物资与用枪、异形假装维修/换弹/救队友、AI 推理反向洗清/枪击正当性/空口指控、正常外观一致、
  异形优先攻击做任务的人、假装做任务不推进进度、真做任务整局限 1 次且 38 分后停止、藏尸远离医疗间、
  30 秒故障 / 45 分人类胜利、
  亮房整间可见 / 暗房视野受限、**亮走廊整条可见（12 格同廊、断电后失效）**、断电后全门扫描 2 秒（含会议室三门、离开重新上锁、恢复供电解除）、
  旁观者跳过讨论与 0 号星尘独立 AI（发言/投票/DEV 标注）、**AI 完成 3 分后自然回圆桌领取申请单、反常拖尸嫌疑、藏尸避人/随机目的地、59 件真实掩体零夹缝**、**事件流与回放（出刀/击杀归因/拖尸/任务/维修/管道/拉闸/搜尸/会议投票/回放页与回放包）**、故障修好立即松手、地图外 A* 安全返回、蒙特卡洛 1000 局基线、
  WASD 主操作 / 尸体交互轮盘 / 设置面板音量与暂停 / 门顶面视角 / 异形同款手电锥 + 近身视野 ×4/3 / 旁观者模式、
  E/H 交互轮盘多项选择、人类管道禁用、AI 拐角寻路不卡死、异形投票目标不统一、
  任务乱序维修按实际点位结算、幽灵乱序任务/故障维修/2 分额度、AI 认知/证据链/搜尸/伤口状态/报告上限/异形自报/证据投票/
  Q 出刀 / B 开枪分离、**12 类 CC0 音效采样（枪/刀/命中/交互/维修/胜负分离）**。
- 浏览器冒烟：开始页版本号「返航录V3」→ 人类开局 15 席 / 300+ 项不变量全过 / 22 扇自动门 / 控制台零报错（2026-10-30）。
