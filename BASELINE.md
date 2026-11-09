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
| `docs/` | 3D 调研 / 审查报告 + 千问出图留档（`gen-art-refs.ps1` 的留档目标） | **禁止** |
| `tools/` | 基线工具片段：`blender-ship.py`、`ship-layout-plan.json`、`gen-materials.py`、`align-tex-style.py`、`_qwen_refs/` 等 | **禁止**，仅 `tools/sync-baseline.cjs` 与 `tools/check-all.cjs` 是本工程自有文件 |
| `index.html` | **只读对账对象**：`3d/spec/port-manifest.json` 把它登记成 `X-ENTRY` source，`3d:port:check` 会校验存在性与行数；不是 3D 入口 | **禁止** |
| `package.json` 的 `version` / `gameVersion` | 上游基线标识（`3d/tools/export-version.cjs` 会校验它与 `js/config/version.js` 一致） | **禁止手改**，只由 `baseline:sync` 写 |

> `package.json` 里的 `version: "3.6.0"` / `gameVersion: "返航录V3.6"` **不是 3D 版本**，
> 3D 自己的版本真源是 `3d/version.json`（`V1P-0.1` / `0.1.0`）。两者互不占号，
> 口径见 `3d/README.md` §1.5。改动 version 字段会直接让 `3d:export:version` 的基线校验失效。

## 2. 完整性清单

`BASELINE.sha256.json`（工程根，入库）记录：

- `source`：快照来源路径；`captured`：快照日期；`baseline`：上游版本标识；
- `files`：每个基线文件的相对路径 → `{ sha256, size }`；
- 覆盖范围：`js/`、`assets/`、`audio/`、`docs/`、`tools/`（排除本工程自有的两个新脚本）。

清单由 `npm run baseline:sync` 生成；`npm run baseline:check` 在**离线**状态下逐个重算哈希，
发现本地基线被改动就报错退出 1，并列出前 20 个不一致文件。

## 3. 命令

```powershell
npm run baseline:check                                  # 离线校验：基线没被本地改过 + 版本标识一致
npm run baseline:sync                                   # 从默认上游刷新基线并重建清单
npm run baseline:sync -- --source "D:\path\to\新返航录"  # 指定上游路径
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
