# BASELINE.md — 2.5D 只读基线

> 首次建立：2026-11-09 · 来源：`C:\Users\ASUS\Desktop\新返航录\`
> 本文件说明**为什么一个 3D 独立工程里会有 2.5D 的 `js/`**，以及怎么安全地刷新它。
> 与 `AGENTS.md` §二 / §三.11 / §五.2、`SPLIT.md` §2 / §4 配套阅读。

## 1. 定义

**只读基线** = 2.5D 主仓在分离时刻的磁盘快照，供 3D 的数据导出器与对账脚本读取。
它不是 3D 的运行时代码，不是数值真源的「第二份」，更不是可以在本工程里修改的副本：
**唯一真源仍是 2.5D 主仓**。本工程里的这份只是"带在身边的只读镜像"，
目的是让红线 11（3D 是 2.5D 的延伸）在本工程内可核查、可复现。

| 目录 | 用途 | 可否修改 |
|---|---|---|
| `js/` | 规则 / 数值 / 语料 / AI / 地图真源；`3d/tools/export-*.cjs` 的输入，`check-*.cjs` 的对账对象 | **禁止** |
| `assets/` | 2.5D 素材与 `MANIFEST.json`、CREDITS / LICENSE 署名 | **禁止** |
| `audio/` | 2.5D 音频与署名 | **禁止** |
| `docs/` | **2026-11-09 起移出基线**：2.5D 时代的调研 / 交接 / 审查文档已清理（原仓仍在），只保留 `qwen21/` 千问出图留档 | 可改（不再属基线） |
| `tools/` | 基线工具片段：`blender-ship.py`、`ship-layout-plan.json`、`gen-materials.py`、`align-tex-style.py`、`_qwen_refs/` 等 | **禁止**，仅 `tools/sync-baseline.cjs` 与 `tools/check-all.cjs` 是本工程自有文件 |
| `index.html` | **只读对账对象**：`3d/spec/port-manifest.json` 把它登记成 `X-ENTRY` source，`3d:port:check` 会校验存在性与行数；不是 3D 入口 | **禁止** |
| `package.json` 的 `version` / `gameVersion` | 上游基线标识（`3d/tools/export-version.cjs` 会校验它与 `js/config/version.js` 一致） | **禁止手改**，只由 `baseline:sync` 写 |

> `package.json` 里的 `version: "3.7.0"` / `gameVersion: "返航录V3.7"` **不是 3D 版本**，
> 3D 自己的版本真源是 `3d/version.json`（`V1P-0.2` / `0.2.0`）。两者互不占号，
> 口径见 `3d/README.md` §1.5。改动 version 字段会直接让 `3d:export:version` 的基线校验失效。

## 2. 完整性清单

`BASELINE.sha256.json`（工程根，入库）记录：

- `source`：快照来源路径；`captured`：快照日期；`baseline`：上游版本标识；
- `files`：每个基线文件的相对路径 → `{ sha256, size }`；
- 覆盖范围：`js/`、`assets/`、`audio/`、`tools/`（排除本工程自有的两个新脚本）；
  `docs/` 自 2026-11-09 起**不在覆盖范围**（见 §6）。

清单由 `npm run baseline:sync` 生成；`npm run baseline:check` 在**离线**状态下逐个重算哈希，
发现本地基线被改动就报错退出 1，并列出前 20 个不一致文件。

范围收缩（只允许少文件、不允许改内容）走 `node tools/sync-baseline.cjs --rebuild`：
它不连上游、不复制任何文件，且对「新旧清单都存在」的文件逐个校验哈希，任一漂移即失败退出，
避免用「重建」把本地手改悄悄洗白。

## 3. 命令

```powershell
npm run baseline:check                                  # 离线校验：基线没被本地改过 + 版本标识一致
npm run baseline:sync                                   # 从默认上游刷新基线并重建清单
npm run baseline:sync -- --source "D:\path\to\新返航录"  # 指定上游路径
node tools/sync-baseline.cjs --rebuild                  # 只按当前磁盘重建清单（范围收缩，不连上游）
```

也可用环境变量 `RETURNLOG_25D_ROOT` 覆盖默认上游路径。
`sync` 只做「复制 / 覆盖内容不同的文件」，**不删除**本工程里多出来的文件；
同时把上游 `package.json` 的 `version` / `gameVersion` 写进本工程 `package.json`，其余字段（脚本清单等）保持不变。

## 4. 上游变更流程（红线 11 的落地）

1. 需要改规则 / 数值 / 语料 / 地图 → **去 2.5D 主仓改 `js/` 真源**，跑主仓门禁；
2. 主仓结账后，在本工程 `npm run baseline:sync`；
3. `npm run export:all` 重导 `3d/preview/data/*.json`（导出器会写入新的 `sources` SHA）；
4. `npm run check` 跑全量只读门禁，确认 `3d:parity:check` / `3d:port:check` 转绿；
5. 再动 GDScript 做移植。

**绝对不要**为了"让门禁变绿"直接改本工程的 `js/` 或手改 `3d/preview/data/rules.json` ——
前者制造第二套真源，后者让 `sources` 哈希继续漂移，都是红线级回退项。

## 5. 分离时刻的已知漂移

分离当天上游有 55 项未提交 / 未跟踪改动，快照是从**磁盘现状**复制的（不是 git HEAD），
因此本工程基线里也带着这些改动。由此产生两项既有门禁失败：

- `3d:parity:check`：`rules.json` 的 `sources` SHA 与 `js/` 真源不一致（改了 `js/` 未重导）；
- `3d:port:check`：`js/game.js` 111 行未被 `3d/spec/port-manifest.json` 认领。

它们是**上游遗留**，不是基线复制错误。修复顺序见 `SPLIT.md` §5.2；
在转绿前，任何门禁报告都必须如实写出这 2 项失败（`AGENTS.md` §一.4）。

## 6. 变更记录

### 2026-11-09 · `docs/` 移出基线（清单 555 → 451）

- **裁定**：用户「本次同步先到此为止，把过期文档和 SDXL 舱室图清掉」。
- **删除**：`docs/` 下 25 个 2.5D 时代文档（调研 / 交接 / 审查 / 审计 / 施工单，323 KB）；
  原仓 `C:\Users\ASUS\Desktop\新返航录\docs\` 完整保留，需要时从原仓取。
- **保留**：`docs/qwen21/` 79 个千问出图留档（101 MB），仍由 `gen-art-refs.ps1` 写入；
  它是本工程资料，不是可对账基线，因此不再纳入哈希清单。
- **方式**：`node tools/sync-baseline.cjs --rebuild`。保留的 451 个文件哈希与旧清单逐一比对一致，
  未复制任何上游文件（当时上游已有 21 项内容漂移 + 3 项新增，按用户「同步先到此为止」不予拉取）。
- **影响**：`BASELINE OK` 的文件数由 555 变为 451；`npm run check` 的 6 项不依赖 `docs/`，不受影响。
- **历史文档里的 `docs/*.md` 引用**（`3d/CHANGELOG.md`、`3d/HANDOFF.md`、`3d/MIGRATION.md`、
  `3d/DECISIONS.md` 等）均指原仓同名文件，本工程内不再有实体。
