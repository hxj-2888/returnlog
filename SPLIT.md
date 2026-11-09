# SPLIT.md — 3D 版分离记录

> 执行日期：**2026-11-09**（GMT+8）
> 源：`C:\Users\ASUS\Desktop\新返航录\`
> 目标：`C:\Users\ASUS\Desktop\新返航录 3D 版\`（用户当日指定命名）
> 方式：**复制分离**。原仓**零删除、零改写**；新工程独立初始化 git 仓库。
> 读者：下一个接手的人。本文假设你没看过分离当天的对话。

---

## 1. 为什么要拆

用户口径（2026-11-09）：3D 除了美术素材与操作按键之外沿用 2.5D 版本，但目前**继承效果很差**，
作为玩家**仍然不能进行除了移动之外的任何操作**；先做分离处理，分离出来的文件夹同样做好工程化，
`AGENTS.md` 里仍然沿袭原有红线。

原仓的实际状态：2.5D 与 3D 共仓，`package.json` 的 `3d:*` 脚本、根 `AGENTS.md`、
`assets/MANIFEST.json`、`audio/CREDITS.md` 等互相引用；3D 的导出器又硬依赖 `js/` 真源。
结果是 3D 无法独立打开、独立跑门禁、独立提交，修一个交互问题要先在混合仓里辨认哪些是 2.5D 的。

**本轮范围**：只做分离与工程化 —— **不改一行游戏逻辑、不重导任何数据、不修 P0 操作失效**。
分离是否成功，用「门禁读数与原仓逐项一致」来验证（§5）。

## 2. 结构决策：为什么保留 `3d/` 这一层

新工程根下仍有 `3d/`，看起来像"没拆干净"，其实是为了让**原工具链与全部契约/历史文档原样可用**。
原 3D 子项目把「仓库根 → `3d/`」两级结构写死在大量位置：

| 位置 | 硬编码形态 | 扁平化后的代价 |
|---|---|---|
| `3d/tools/*.cjs`（20+ 个） | `ROOT = path.resolve(__dirname,'..','..')` → `path.join(ROOT,'js',...)` / `path.join(ROOT,'3d','preview',...)` | 每个脚本都要区分「上游根」与「3D 根」，并改掉全部 `'3d'` 前缀 |
| `3d/tools/*.py`（10+ 个） | `ROOT = os.path.dirname(os.path.dirname(os.path.dirname(__file__)))` → `os.path.join(ROOT,'3d','assets',...)` | 同上，且 Blender 脚本无法逐项实跑验证 |
| `3d/spec/port-manifest.json` | `target` 全是 `3d/preview/...`，`check-port-manifest.cjs` 用 `path.join(ROOT,p)` 做存在性校验 | 要改上百条 target 字符串并同步语义 |
| `3d/spec/parity-map.json`、`assets.manifest.json` | 文件路径以 `3d/` 开头 | 同上 |
| `3d/preview/scripts/*.gd` 注释、`3d/*.md` 全部历史文档 | `3d/tools/...`、`3d/preview/data/...` | 改了会破坏历史记录的可追溯性 |

**结论**：把原 `3d/` 整体提升为「新工程里的 `3d/`」，并在**新工程根**放一份 2.5D 只读基线
（`js/` / `assets/` / `audio/` / `tools/` / `docs/`），则脚本里的 `ROOT` 恰好等于新工程根，
`ROOT/js/...` 与 `ROOT/3d/...` 全部原样成立。
代价是根目录多几个非 3D 目录，收益是**零路径改写、零工具链回归、历史记录不失真**。
`AGENTS.md` §二与 `BASELINE.md` 已把这几个目录标为只读，防止被误当成 3D 代码修改。

## 3. 随迁 / 未随迁清单

| 源 → 目标 | 体积 | 说明 |
|---|---|---|
| `3d/` → `3d/` | **963 MB** | **完整复制**：8 份文档、`spec/`、`tools/`、`assets/`、`preview/`（Godot 工程，含 `.godot/` 缓存与截图）、`reports/`、`version.json` |
| `docs/` → `docs/` | 101 MB | 3D 调研 / 审查报告、千问出图留档 `qwen21/`（`gen-art-refs.ps1` 的留档目标就是 `docs/qwen21/...`） |
| `js/` → `js/` | 1.1 MB | **2.5D 只读基线**：规则 / 数值 / 语料 / AI / 地图真源，导出器与对账脚本的输入 |
| `assets/` → `assets/` | 138 MB | 2.5D 只读基线素材（含 `MANIFEST.json` / CREDITS / 署名） |
| `audio/` → `audio/` | 3.8 MB | 2.5D 只读基线音频与署名 |
| `tools/` → `tools/` | 72 MB | 基线工具片段：`blender-ship.py`、`ship-layout-plan.json`、`gen-materials.py`、`align-tex-style.py`、`_qwen_refs/` 等；已排除日志 / 备份 / 一次性诊断 / 截图 |
| `LICENSE` / `.gitattributes` / `.editorconfig` | 4 KB | 工程配置与许可 |
| `index.html` → `index.html` | 20 KB | **只读对账对象**：`3d/spec/port-manifest.json` 把 2.5D 入口登记为 `X-ENTRY` source，缺了会让 `3d:port:check` 多报一条 `ERR`；**不是 3D 入口**，3D 运行时只走 `3d/preview/project.godot` |
| **新建** | — | `AGENTS.md`、`README.md`、`SPLIT.md`、`BASELINE.md`、`CHANGELOG.md`、`package.json`、`.gitignore`、`BASELINE.sha256.json`、`tools/sync-baseline.cjs`、`tools/check-all.cjs` |

**未随迁**（有意留给用户裁定或留作对照）：

| 项 | 体积 | 原因 |
|---|---|---|
| 原仓 `3d/` 目录本身 | 963 MB | **保留作对照与回退兜底，未删除**；是否移除见 §5 P2 |
| `.git/` | 635 MB | 历史属于原仓；新工程独立 `git init`，不继承 2.5D 提交历史 |
| `_backup/` | 261 MB | 铁板掩体暂关前的本机留档，原仓 `.gitignore` 已标「只在本机留档，不入库」 |
| `node_modules/` | — | `npm i` 可复现（仅 `playwright-core`） |
| `tools/` 内日志 / `_bak` / `screenshots` / `_crew_raw` / `_sfx` / `_gate-*` / `_mc-*` / 诊断脚本 | ~330 MB | 一次性产物，不进新工程 |
| `android/`、`.github/`、`.wrangler/`、`.env` | — | 2.5D 打包 / CI / 部署，与 3D 无关；`.env` 含敏感信息，不复制（`index.html` 已作为只读对账对象随迁，见上表） |
| 原仓根 `README.md` / `AGENTS.md` / `ARCHITECTURE.md` / `CHANGELOG.md` | ~520 KB | 2.5D 文档；新工程另写同名工程级文件。**3D 自身的历史记录完整保留在 `3d/CHANGELOG.md`（89 KB）**，未丢 |

> 注意：基线 `tools/` 里仍含 2.5D 的工具源码（如 `test-v3.cjs`、`serve.cjs`），
> 它们是**只读参考**，本工程的门禁集合不含 2.5D 门禁（新工程没有 `index.html`），见 `AGENTS.md` §三.4。

## 4. 基线快照

- **捕获时刻**：2026-11-09 工作区状态，**包含原仓当时的 55 项未提交 / 未跟踪改动**
  （例如 `3d/preview/data/floor_spec.json`、`3d/preview/scripts/map_builder.gd`、
  `3d/tools/bake-qwen-room-skins.py`、`assets/MANIFEST.json` 等）。
  也就是说，新工程是从**磁盘现状**复制，不是从 git HEAD 检出 —— 这是刻意的，否则会丢掉当天的工作。
- **版本标识**：上游 `返航录V3.6` / `3.6.0`（`package.json` 的 `gameVersion` / `version`），
  3D 自己 `V1P-0.1` / `0.1.0`（`3d/version.json`）。两者互不占号，口径见 `3d/README.md` §1.5。
- **完整性清单**：`BASELINE.sha256.json` 由 `npm run baseline:sync` 生成，
  记录每个基线文件的 SHA256 与字节数；`npm run baseline:check` 可离线校验基线未被本地篡改。
- **禁止修改**：`js/`、`assets/`、`audio/`、`docs/`、`tools/`（除两个新增脚本）、
  `package.json` 的 `version` / `gameVersion`。需要上游变更时的流程见 `AGENTS.md` §五.2。

## 5. 门禁对照与后续待办

### 5.1 分离前后读数（2026-11-09 实跑，逐项对照）

| 门禁 | 原仓 | 新工程 | 读数 |
|---|---|---|---|
| `3d:assets` | ✅ | ✅ | 0 错误 / 3 提醒（3 项 wip 资产源文件未落地） |
| `3d:import:check` | ✅ | ✅ | 0 差异（74 个 `.glb.import` × 27 key） |
| `3d:events:check` | ✅ | ✅ | EVENTS OK（31 / 31 / 31） |
| `3d:lines:check` | ✅ | ✅ | LINES OK（62 类 / 1221 行 / 21 规则表） |
| `3d:port:check` | ❌ | ❌ | 1 错误 / 1 警告：`js/game.js` 111 行未认领（首行 11767）；`cover_refs.json` 缺 `schema_version` |
| `3d:parity:check` | ❌ | ❌ | FAIL：`rules.json` 的 `sources` SHA 与 `js/` 真源不一致 |

**分离没有引入新回归**：6 项读数与原仓逐项一致，包括 2 项既有失败。
验收时曾出现过一条 `X-ENTRY: source 不存在 index.html`（移植清单登记的 2.5D 入口未随迁），
补入该只读对账文件后，读数回到原仓的「1 错误 / 1 警告」；这是分离过程中唯一一次路径缺口，已闭环。
剩下两项失败来自上游当天未提交的工作区改动，不是路径断裂
（路径断裂会表现为 `ENOENT` 而不是 SHA 不一致 / 未认领行数）。

### 5.1.1 导出器干跑验证（已还原，不落盘）

为确认 7 个导出器在新工程里路径链完整，实跑了 `npm run export:all`（**exit 0**），
随后把输出逐文件还原。结果：**7 份 `3d/preview/data/*.json` 全部被重写且内容发生变化**
（`lines` / `map` / `minigames` / `rules` / `sim` / `space` / `version`），
与 `3d:parity:check` 的 SHA 漂移互相印证 —— 当前 3D 的 `data/*.json` **落后于 `js/` 真源**。
验证后全量复核：`3d/` 与源仓 **3746 个文件、零差异**，分离状态未被干跑改变。

> ⚠ 因此 §5.2 的「重导规则」**不是无害操作**：一次 `export:all` 会同时改变 7 份数据契约，
> 可能连带改变 3D 行为。必须先在 2.5D 上游确认变更范围，再按批次导出 → 跑门禁 → 做 Godot 无头自测，
> 不要为了「让 parity 转绿」直接一把梭。

### 5.2 待办（按优先级）

| 级别 | 事项 | 建议动作 |
|---|---|---|
| **P0** | 玩家除移动外无法进行任何操作 | 按 `AGENTS.md` §6.1 的入口排查。先确认 `main.gd` 的 `started` / 相位闸门与 `_input()` 分发，再查 E / 鼠标按键 / R；`project.godot` 当前**无 `[input]` 段**，按键全是硬编码。**不要**用加新按键 / 新状态绕过，按 §一.11 先回 2.5D 找语义 |
| P1 | `3d:parity:check` FAIL | 确认上游 `js/` 改动结账后，跑 `npm run 3d:export:rules` 重导，再对账；不要在 3D 里手改 `rules.json` |
| P1 | `3d:port:check` 未认领 111 行 | 在 `3d/spec/port-manifest.json` 补认领，并给 `cover_refs.json` 补 `schema_version` |
| P2 | 原仓 `3d/` 是否移除 | **由用户裁定**。本轮刻意保留作对照；确认新工程稳定后再决定，删除属破坏性操作，需单独确认 |
| P2 | 基线刷新 | 上游 2.5D 演进后 `npm run baseline:sync` → `npm run export:all` → `npm run check` |

## 6. 验证与回退

```powershell
# 结构与基线
npm run baseline:check          # 只读基线未被本地篡改
npm run check                   # 6 项只读门禁 + 汇总「X 通过 / Y 失败」
npm run export:all              # 7 个导出器全部可跑（会重写 3d/preview/data/*.json）

# Godot 运行时
& "E:/ai-tools/godot/Godot_v4.6-stable_win64_console.exe" --headless --path 3d/preview --quit-after 3
```

**回退**：原仓没有任何改动，直接停止使用新工程即可；如需删除新文件夹，请用户单独确认
（本轮不执行任何删除）。`3d/` 的完整原始副本仍在原仓，可随时重新复制。
