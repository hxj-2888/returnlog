> 本文件为 `AGENTS.md` 原章节的**逐字搬迁**（2026-11-11 工程规范化），章节正文未改写。
> 现行口径以根 `AGENTS.md` 与 `docs/ASSET_GOVERNANCE.md` 为准；本文件仅供按需查阅，其中的门禁读数 / 踩坑记录 / 清理记录属于历史，不是现行基线。

## 三、红线在本工程的适用性映射（解释层，不改 §一）

| 条 | 在本工程如何落地 | 校验 |
|---|---|---|
| 1 | `file://` 要求不适用于 Godot 运行时；但其精神保留：**3D 运行时零插件、零外部服务、无构建步骤**，`--headless` 可直跑自测，不依赖本地服务器 | Godot 无头冒烟 |
| 2 | 「`index.html` 唯一加载清单」映射为 **`3d/preview/project.godot` + `scenes/main.tscn` 是唯一入口**；不动态注入脚本、不加载 `res://` 之外的文件；GDScript 依赖顺序按 `3d/ARCHITECTURE.md` §3 | `npm run 3d:import:check` |
| 3 | 3D 版本真源是 `3d/version.json`；改版本同批改 `package.json` 的**基线标识**（仅由 `baseline:sync` 写）与 `3d/CHANGELOG.md`；界面只读 `Config.label()`，禁止硬编码版本串 | `npm run 3d:export:version` |
| 4 | 门禁集合见 §四。报告**必须写本次实跑 X 通过 / Y 失败**，不得沿用旧读数；§六 的两项既有失败不得伪装成完成 | `npm run check` |
| 5 | 无 DOM，`window.SKV3._t` 不适用；映射为 **Godot 无头自测参数**（`--walktest` / `--mgtest` / `--e2e` / `--speechtest` 等，见 `3d/ARCHITECTURE.md` §7）：可新增，不得删除/改名/改变现有语义 | 对应自测参数 |
| 6 | **完全适用**：`assets/scene/cozy`、`assets/scene/rooms` 为 CC-BY 4.0，`audio/` CC0；署名文件随仓保留，二次分发同样适用；千问本地为唯一出图模型，SDXL 退役；Qwen-Image 2.1 Research License **非商用** | 人工 + `3d/ASSETS.md` |
| 7 | **完全适用并扩展**：规则 / 数值 / 语料只读 `3d/preview/data/*.json`（由 `js/` 导出），GDScript 不抄表；sim / view / ui 分层见 `3d/ARCHITECTURE.md` §3；地图数据只在 `js/data/map.js` → `map.json` 一条链 | `npm run 3d:parity:check` |
| 8 | **完全适用**：Godot 工程 0 插件、0 运行时第三方依赖；`playwright-core` 只服务本机自测脚本 `3d/tools/simdump.cjs`，不进运行时 | 人工 |
| 9 | 「DOM id 双处同步」映射为 **`.tscn` 节点路径 与 GDScript 引用双处同步**；改名同批改两处并跑自测 | 自测 |
| 10 | **完全适用**：提交信息 / 文档 / 注释一律中文，格式 `type(scope): 摘要`（feat / fix / docs / chore）；命令行统一 **PowerShell 7**（`pwsh`） | 人工 |
| 11 | **完全适用，且是本工程存在的前提**：只读基线就是为这条服务的。动 3D 前先在 `js/` 找源头；找得到 → 照抄语义、数值读 `3d/preview/data/rules.json`；找不到但确实需要 → 判断是不是真·维度产物（A* 网格 / 相机 / 碰撞 / LOD 等），是 → 写进 `3d/spec/parity-map.json#allowed_differences` 并写明「为什么 2.5D 不需要」，不是 → **先去上游 2.5D 改真源**，再 `baseline:sync` → 重导 → 移植，不许只加在 3D | `npm run 3d:parity:check` + `npm run 3d:port:check` |
| 12 | **完全适用**：素材优先公开素材站 / 开源社区，来源留痕进 CREDITS；本地生成走千问本地模型且先取公开设计参照 | 人工 |

> 注：第 13、14 条为 2026-11-10 主仓新增，尚无逐条适用性映射；按 §一 原文执行，不得自行放宽。
