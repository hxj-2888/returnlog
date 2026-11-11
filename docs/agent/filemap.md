> 本文件为 `AGENTS.md` 原章节的**逐字搬迁**（2026-11-11 工程规范化），章节正文未改写。
> 现行口径以根 `AGENTS.md` 与 `docs/ASSET_GOVERNANCE.md` 为准；本文件仅供按需查阅，其中的门禁读数 / 踩坑记录 / 清理记录属于历史，不是现行基线。

## 三、文件地图

> **层列口径（档 1 重构 · 2026-11-04）**：下表「层」列原为技术职责（配置 / 数据 / 引擎 / 视图 / 编排），现按根 `ARCHITECTURE.md` 统一解释为 **T1 / T2 / T3 + domain**；原词保留作技术副类，只标注不删除。
> 映射：配置 / 数据 / 引擎 → **T2**（按 domain 分属空间与资源、AI 拟人化）；视图 → **T2 玩家决策**；编排 `js/game.js` → **T2 跨域**；门禁 / 模拟 / 报告 → **T3 验收**；文档 → **文档栏**。
> 逐文件的 `definedBy / truth / verify / flag` 见各 `js/` 文件头部 `ARCH NODE` 注释，以及 `docs/_planned/01-工程化重构施工单.md` §二全量节点标注表。

| 路径 | 层 | 说明 |
|---|---|---|
| `index.html` | 入口 | 开始页 + 唯一的脚本加载清单；主页 / 设置 / **复盘页 `#replay`** 都是页面壳（游戏内 `#v3-root` 覆盖层仍只在 `templates.js`） |
| `js/config/version.js` | 配置 | **版本单一真源**（返航录V3）与仓库地址 |
| `js/data/map.js` | 数据 | 地图静态数据（房间/走廊/家具/任务点/管道/设施/墙体）；**2026-11-06 掩体重构 v2：127 件掩体（带 zone/tier）、设施 4 处随新布局微调** |
| `tools/sync-map-v2-cover.cjs` | 工具 | 2.5D 换表：`3d/preview/data/map_v2.json` 的 cover → `js/data/map.js`；设施避让写在 `FIXES`/`SECBOT`；`--check` 只校验不写盘 |
| `js/data/names.js` | 数据 | 15 个默认席位名 + 备选名字池（`SKNames`），主页改名与对局建号的唯一真源 |
| `js/ui/templates.js` | 视图数据 | `#v3-root` 的 CSS 与 HTML 模板 |
| `js/ui/home.js` | 视图 | 主页：用 `SKMapData` 生成整船 SVG、手电遮罩、身份锚亮（只读地图，不含业务动作） |
| `js/ui/replay.js` | 视图 | 对局复盘：事件时间轴 + 0.5 秒位置帧播放 + 回放 JSON 导出/载入（只读回放数据） |
| `js/engine/clock.js` | 引擎 | 相位时钟 / 个人技能槽 / 动作请求队列（纯逻辑） |
| `js/engine/invariants.js` | 引擎 | 对局不变量断言（只读，`SKInvariants.check`） |
| `js/engine/geo.js` | 引擎 | 几何、可行走网格（硬掩体）、A*、视线 |
| `js/t2/space.js` | T2 · 空间与资源 | **方案 A 第一 / 四块**：8 个运行常量 + 12 个几何 / 数值纯函数 + `ROW` / `PIPE_TINT` 两张表真源（`SKT2Space`）；数值一个未改 |
| `js/t2/ai.js` | T2 · AI 拟人化 | **方案 A 第二块 + 第 6 项**：认知链整组 26 个函数（读值与时间窗 + `evPush` / `susAdd` / `evalAlmost` / `checkAlibi` / `mindReset` / `bestKnownTarget` 等 23 个）与 `MEM_MAX` 常量真源（`SKT2AI`）；状态沿用 `_t.G()` |
| `js/t2/decision.js` | T2 · 玩家决策 | **方案 A 第三 / 五块**：报告额度、会议席位标签与发言解析、`ROOM_WORDS` / `CN_SEAT` 词表，以及会议排期 `MEET_SCHED` + `stopChatter` / `meetLater` / `sayStreakOK` 真源（`SKT2Decision`）；状态沿用 `_t.G()` |
| `js/game.js` 顶部别名块 | 编排 | **薄委托已收敛**：25 + 3 + 23 个 T2 函数以 `const x=SKT2X.x` 局部别名直接绑定（同一函数对象、无转发层）；最初试过 `SKT2X.x(...)` 命名空间直调，实测使渲染帧率下降、旁观者断言从 4.4 格掉到 2.4 格，故改为局部别名。详见 CHANGELOG |
| `js/game.js` | 编排 | 状态、AI、动作结算、会议/投票、渲染、输入（`window.SKV3`） |
| `js/main.js` | 入口 | 开始页按钮绑定 + `[data-version]` 填充 |
| `tools/serve.cjs` | 工具 | 零依赖静态服务器 |
| `tools/test-v3.cjs` | 门禁 | Playwright 浏览器断言（838 条；2026-11-06 复跑 838 通过 / 0 失败） |
| `tools/monte-carlo.cjs` | 工具 | 无渲染 AI 对 AI 批量模拟（`_t.simGame`，1000 局基线，seed 可复现；报告含**配置快照 / 机制触达率 / 分桶胜率 / 结束原因×胜者交叉表**） |
| `js/data/lines.js` | 数据 | 会议台词语料库（58 类 × hot/cold + 组合式模板 + 证据短语子池 WHY），唯一台词真源 |
| `tools/lines-audit.cjs` | 门禁 | 语料体检：禁词 / 长度 / 槽位 / 骨架撞车 + 复现 `pickLine` 抽样口径模拟十局疲劳（`--strict` 有 FAIL 退出码 1） |
| `tools/lines-report.md` | 数据 | `lines-audit` 生成的语料体检报告（工具产出，勿手改） |
| `tools/ship.cjs` | 发布 | **一键发布**：门禁（含出仓素材校验，仅警告）→ APK → CF Pages → 本仓提交推送 → 作品集。推送里 GitHub 是致命目标、Gitee 是尽力镜像（失败仅警告），两条通道互为兜底（先用 `push --dry-run` 探测，不通就跳，不硬撞 20s）。`npm run ship`；`--fast` 跳门禁、`--only=web,portfolio` 跳 APK |
| `tools/mc-report.md` | 数据 | **当前权威基线**：2026-11-07 目击认错批 · 人类 74.8% / 异形 25.2%（讨论 60/35、投票 5、公布 3；H 先验条件化 + 仅 cred + h²；承诺机制经 A/B 移除，见 §六） |
| `tools/mc-results-E.json.gz` · `tools/mc-report-E.md` | 数据 | **对照基线**（E 轮 · AI/玩家数值一致化）：`--out tools/mc-results-E.json --report tools/mc-report-E.md` 产出，压缩档由发布前自动生成；跨批对比先读它 |
| `tools/blender-ship.py` | 美术工具 | 2.5D 底图烘焙（需 Blender，读 `js/data/map.js`；内置 5.2 版本守卫） |
| `tools/check-blender.ps1` | 门禁 | 校验权威 Blender（路径 / 版本 / build hash / Python 载荷），不通过退出码 1 |
| `tools/logs/` | 日志 | 渲染日志统一落点，命名 `<脚本>-<YYYYMMDD-HHmmss>.log`；`logs/legacy-4.5.9/` 为已归档的 4.5.9 旧日志 |
| `tools/gen-materials.py` | 美术工具（**SDXL 已退役，仅历史回退**） | 家具/掩体表面材质生成（本地 SDXL 流式上卡；`--mode reuse` 为无显卡兜底）。2026-11-09 起新素材改走千问（`3d/tools/gen-qwen-room-skins.ps1` + `bake-qwen-room-skins.py`）；本脚本只用于复现历史贴图 |
| `tools/check-tex-style.py` | 门禁 | 高清重出后的风格一致性量测：老图备份 vs 新图，统一缩到 256² 后比亮度 / 对比 / 饱和度 / 冷调 / 直方图距离，超出容差退出码 2 |
| `tools/sfx-audit.py` | 音频工具 | 音效量化体检：峰值 / 短窗 RMS / 动态 / 起始静音；`--check` 只查游戏内引用到的音效，静音或削顶则退出码 1 |
| `tools/master-sfx.py` | 音频工具 | 用 `tools/_sfx/` 里的公共 CC0 素材分层混音 + 软限幅归一，产出 `audio/sfx-*.ogg`（出刀 / 报告音） |
| `tools/sfx-report.md` | 数据 | `python tools/sfx-audit.py` 生成的全量音效电平表 |
| `tools/gen-hull.py` | 美术工具 | 船体底板 `hull-deck.png` 程序化生成（分块装甲 + 接缝 + 格栅 + 管线 + 暗角） |
| `tools/map-check.cjs` | 工具 | 离线地图体检：可行走网格 / 掩体审计 / 巡逻线 / 任务点可达性（不开浏览器） |
| `tools/ux-audit.cjs` | 工具 | **游玩体验量测**（只量测不断言）：真实 DOM 输入下点击起移延迟、A* 规划耗时、HUD/会议 rect 与命中区、迷雾四态画面亮度、会议三段墙钟、代打墙钟占比、手机档几何、FPS；需先起 `tools/serve.cjs`（`file://` 下画布跨域 taint，读不了像素） |
| `tools/ux-report.md` · `tools/ux-results.json` | 数据 | `ux-audit` 生成的读数表与原始数据（工具产出，勿手改） |
| `assets/` · `audio/` | 素材 | 许可与署名见各子目录 `LICENSE*` 与 `audio/CREDITS.md` |
| `3d/tools/covers_lib.py` | 工具 | **掩体本体建模共享库**：材质 / 图元 / 归一化 / 逐类导出 / 检查板排版；每个舱只写 `BUILDERS`；**面数预算 2800、倒角 2 段 16mm**；另有 `shell_pass()` 外壳化、`depth_ext()` 进深补齐、`sight_extend()` 视线遮挡补高（`SIGHT_MIN_H=1.70`，眼高 1.62 以上）三道通用工序；`mat()` 默认接 PBR 贴图（`COVERS_PBR=0` 回退），预算 6000 tris / 倒角 3 段 20mm；
地板口径统一到 `3d/preview/data/floor_spec.json`（单一真源，禁抄第二份）（2026-11-07） |
| `3d/tools/build-covers-<room>.py` | 工具 | 逐舱掩体建模脚本（`ecosys` 8 / `warehouse` 6 / `med` 7 / `armory` 6；余下 6 舱 34 类在 `build-covers-rest.py`，按舱跑）；**按真实尺寸建模**，改完要重跑 `measure-cover-refs.py` |
| `3d/tools/build-covers-rest.py` | 工具 | 余下 6 舱（驾驶舱/监控/引擎/娱乐/配电/餐厅）共 34 类，按舱跑 `-- <room>` |
| `3d/tools/cover-shot.py` | 工具 | 单件掩体特写（18° 前视 + 78° 近俯视），排查「检查板上看不清」的那一件 |
| `3d/tools/gen-pbr-textures.py` | 工具 | 程序化生成 10 套 tileable PBR 贴图（albedo+normal，256² JPEG）；**SDXL 概念图不能当 albedo 直接贴** |
| `3d/tools/build-medbot.py` | 工具 | 医疗无人机高细节 GLB（67 件 / 5610 tris），不走 `L.run()` 以免补落地背板 |
| `3d/tools/export-floor-spec.cjs` | 工具 | 导出**地板口径单一真源** `3d/preview/data/floor_spec.json`（贴图/重复尺度/染色）；`blender-ship.py` 与 `map_builder.gd` 都读它，`--check` 只校验 |
| `3d/tools/check-floor-spec.cjs` | 工具 | 地板口径对账：与真源一致 / 贴图存在 / **无第二份地板表** |
| `3d/tools/sync-cover-height.cjs` | 工具 | 按 GLB 实测高度同步 `map_builder.gd` 的 COVER_HEIGHT v2 段；**必须先跑 `measure-cover-refs.py` 再跑它**，`--check` 只校验 |
| `3d/tools/check-cover-scale.cjs` | 工具 | **掩体缩放审查**：建模尺寸 vs 地图占地 vs Godot 高度表，标出 >1.35× 的拉伸与纵向失配；改完模型必跑 |
| `3d/tools/gen-cover-refs.py` | 工具（**SDXL 已退役，仅历史对照**） | 本地 SDXL 按舱出参考图（10 舱 JOBS，固定 seed）；产物 `3d/assets/refs/<room>.{png,json}` 留作风格核对，新参考图改走千问 `gen-art-refs.ps1` |
| `3d/tools/gen-art-refs.ps1` | 美术工具 | 千问本地模型（Qwen-Image 2.1 Turbo）出 10 舱 / 26 任务参考图（768² / 8 步）；`npm run 3d:refs:cabin` / `3d:refs:tasks`，**必须 pwsh 7**；2026-11-07 解禁 |
| `3d/tools/gen-qwen-room-skins.ps1` | 美术工具 | 2026-11-07 晚间：千问本地出 6 个**非铁板舱**的墙面 / 地板原图（6×2=12 张 768²）；脚本内硬守卫拒绝 `power/engine/armory/warehouse`；**必须 pwsh 7**、本地生成、Qwen Research License 非商用 |
| `3d/tools/bake-qwen-room-skins.py` | 美术工具 | 把上述千问图裁中心 88% + 项目 grade + 四向镜像拼贴成 1536² 无缝贴图，并以老图为参考做色调对齐；按舱切换 `cabin/` / `floor_spec.json` / `panels.json` / `WALL_SKIN` 四处引用，铁板 4 舱不动；幂等，重跑生成器后再跑一次即可恢复 |
| `3d/tools/measure-cover-refs.py` | 工具 | 导入每个 GLB 实测包围盒 → `3d/preview/data/cover_refs.json`；Godot 靠它把「地图尺寸 / 建模尺寸」换算成缩放 |
| `3d/tools/patch-tex-vram.py` | 工具 | 3D 贴图导入改 **VRAM 压缩 BPTC/BC7 + 生成 mipmap**（`compress/mode=2` + `compress/high_quality=true` + `mipmaps/generate=true` + `detect_3d/compress_to=0`）；实测 1536² 单张 9.4 MB → 3.0 MB，`RENDER_TEXTURE_MEM_USED` 885 → 486 MB；**`compress/mode=3` 在 4.6 不是 VRAM 压缩**（实测仍输出 1536²×4 未压缩并置 `vram_texture:false`，勿用）；幂等 |
| `3d/preview/data/cover_refs.json` | 数据 | 61 个掩体 kind 的建模尺寸 `[宽,进深,高]`（Blender 口径，Godot 读时换轴） |
| `3d/` | 子项目 | **Godot 4.6 3D 预演 = 2.5D 的延伸**（只有按键/维度/部分美术可不同，见 §一.11；工程上独立，不参与 `index.html` 加载；地图由 `3d/tools/export-map.cjs` 从 `js/data/map.js` 导出）。入口见 `3d/README.md`，架构见 `3d/ARCHITECTURE.md`，决策见 `3d/DECISIONS.md` |

> 3D 子项目边界：**不继承**主项目的 `file://` / 经典 `<script>` 红线；
> 但素材许可、中文记录、数据单一真源、门禁/自测留痕仍然适用。
> **定位（2026-11-09 用户裁定，红线级，见 §一.11）**：3D 是 2.5D 的**延伸**，
> 只有「按键操作 / 维度 / 部分美术素材」可以不同，其余全部是移植；
> **如无必要不要往 3D 加 2.5D 没有的东西**。要加只属于 3D 的系统，先证明 2.5D 也该有
> （那就先在 2.5D 做），否则记进 `3d/spec/parity-map.json#allowed_differences` 并写明理由。
> 数据侧的落地方式：规则/语料/地图一律导出（`npm run 3d:export:*`），不手抄。
> Godot 便携版在 `E:\ai-tools\godot`（4.6 stable，`89cea1439`），不在 PATH 上。
> **完整版（含 .NET / `GodotSharp`）已装**：`E:\ai-tools\godot\Godot_v4.6-stable_mono_win64\`，
> 版本串 `4.6.stable.mono.official.89cea1439`，本机 .NET SDK 10.0.300 可直接编 C# 工程；
> 标准版 `Godot_v4.6-stable_win64_console.exe` 保留作对照。两份都能开 `3d/preview`，
> 三条自测读数一致（见 `docs/3D_预演_20261103.md` §9A）。导出模板（1117 MB）**未下载**，需要出包时再说。
