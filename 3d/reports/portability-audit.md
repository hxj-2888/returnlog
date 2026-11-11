# 2.5D → 3D 可移植性审计

生成时间：2026-11-11T04:38:03.911Z

> 本报告由 `node 3d/tools/portability-audit.cjs` 生成，只读源码统计；不代表语义等价。

## 1. 总览

- JS 文件：**22** 个 / **19931** 行
- DOM/Canvas 引用：**646** 处；定时器：**27** 处；
  `Math.random`：**152** 处；函数/箭头：**607** 个

| 层 | 文件 | 行数 | DOM 引用 | 定时器 | Math.random | 函数 |
|---|---:|---:|---:|---:|---:|---:|
| D · 运行时 DOM/Canvas 编排（必须上游解耦） | 1 | 11917 | 434 | 7 | 147 | 365 |
| D · DOM/Canvas UI（必须改用共享 UI spec） | 7 | 2716 | 185 | 18 | 2 | 96 |
| B · 纯逻辑（可做 IR + 代码生成） | 7 | 2631 | 0 | 0 | 2 | 108 |
| A · 数据表（已可自动导出） | 4 | 2230 | 0 | 0 | 1 | 6 |
| B- · 逻辑 + 定时器/DOM 适配（先拆适配层） | 1 | 206 | 0 | 1 | 0 | 15 |
| E · 入口/胶水（3D 自有入口） | 1 | 196 | 27 | 1 | 0 | 17 |
| A · 配置（已可自动导出） | 1 | 35 | 0 | 0 | 0 | 0 |

## 2. 逐文件

| 文件 | 层 | 行数 | 函数 | DOM | 定时器 | random | 自动导出候选 |
|---|---|---:|---:|---:|---:|---:|---|
| `js/game.js` | D · 运行时 DOM/Canvas 编排（必须上游解耦） | 11917 | 365 | 434 | 7 | 147 | — |
| `js/data/lines.js` | A · 数据表（已可自动导出） | 2090 | 6 | 0 | 0 | 1 | A |
| `js/t2/minigame.js` | D · DOM/Canvas UI（必须改用共享 UI spec） | 1169 | 45 | 86 | 14 | 1 | — |
| `js/ai/sanity.js` | B · 纯逻辑（可做 IR + 代码生成） | 1082 | 16 | 0 | 0 | 1 | — |
| `js/t2/ai.js` | B · 纯逻辑（可做 IR + 代码生成） | 738 | 43 | 0 | 0 | 0 | — |
| `js/ui/replay.js` | D · DOM/Canvas UI（必须改用共享 UI spec） | 480 | 26 | 33 | 4 | 0 | — |
| `js/ui/home.js` | D · DOM/Canvas UI（必须改用共享 UI spec） | 371 | 20 | 58 | 0 | 1 | — |
| `js/ui/templates.js` | D · DOM/Canvas UI（必须改用共享 UI spec） | 364 | 0 | 4 | 0 | 0 | — |
| `js/t2/decision.js` | B- · 逻辑 + 定时器/DOM 适配（先拆适配层） | 206 | 15 | 0 | 1 | 0 | — |
| `js/main.js` | E · 入口/胶水（3D 自有入口） | 196 | 17 | 27 | 1 | 0 | — |
| `js/engine/clock.js` | B · 纯逻辑（可做 IR + 代码生成） | 193 | 15 | 0 | 0 | 0 | — |
| `js/engine/invariants.js` | B · 纯逻辑（可做 IR + 代码生成） | 179 | 2 | 0 | 0 | 0 | — |
| `js/scene/shell.js` | D · DOM/Canvas UI（必须改用共享 UI spec） | 178 | 2 | 0 | 0 | 0 | — |
| `js/engine/geo.js` | B · 纯逻辑（可做 IR + 代码生成） | 169 | 15 | 0 | 0 | 0 | — |
| `js/ai/traits.js` | B · 纯逻辑（可做 IR + 代码生成） | 145 | 3 | 0 | 0 | 1 | — |
| `js/t2/space.js` | B · 纯逻辑（可做 IR + 代码生成） | 125 | 14 | 0 | 0 | 0 | — |
| `js/scene/const.js` | D · DOM/Canvas UI（必须改用共享 UI spec） | 81 | 0 | 0 | 0 | 0 | — |
| `js/data/plates.js` | A · 数据表（已可自动导出） | 78 | 0 | 0 | 0 | 0 | A |
| `js/scene/crew.js` | D · DOM/Canvas UI（必须改用共享 UI spec） | 73 | 3 | 4 | 0 | 0 | — |
| `js/data/names.js` | A · 数据表（已可自动导出） | 36 | 0 | 0 | 0 | 0 | A |
| `js/config/version.js` | A · 配置（已可自动导出） | 35 | 0 | 0 | 0 | 0 | A |
| `js/data/map.js` | A · 数据表（已可自动导出） | 26 | 0 | 0 | 0 | 0 | A |

## 3. 结论与边界

### A. 已经可以自动同步（不需要手抄）

- `js/data/*`、`js/config/*` 的表格与常量：由 `3d/tools/export-*.cjs` 自动导出；
- `js/t2/decision.js` 的舱室词 / 席位表 / `parseSpeech` 正则：由 `export-lines.cjs` 自动抠出；
- `js/ai/sanity.js` / `traits.js` 的规则表、函数指纹、调度系数：由 `export-rules.cjs` 自动导出。

### B. 可以自动生成，但需要 IR（当前 POC 目标）

- `js/t2/decision.js`、`js/t2/ai.js`、`js/ai/sanity.js`、`js/ai/traits.js` 中不读 DOM、不碰定时器的纯函数；
- 先抽成语言无关 IR（输入/输出/规则表/显式随机源），再由同一个 IR 生成 JS 与 GDScript；
- 验收方式：同一 fixtures 下 JS 与 GDScript 输出逐字段一致，而不是“看起来像”。

### C. 必须先在上游解耦

- `js/game.js` 是 12k 行、DOM/Canvas/定时器编排与模拟状态混在一起；
- 不能把 `game.js` 直接翻译成 GDScript（红线 8 禁止运行时 JS，DOM/CSS 与 Godot 也不是 1:1）；
- 必须先把模拟状态机、会议/报告/投票流程从 DOM 中拆出，留下纯 `core` 与 UI 适配层。

### D. UI

- `js/ui/*` / `js/scene/*` 是 DOM/Canvas 渲染；
- 自动移植的正确形态不是 HTML/CSS → `.tscn` 翻译，而是 **UI spec（字段/按钮/状态机/事件）+ 两个 renderer**；
- 先做会议面板（本批模板刚改过，状态机最清楚），再扩 HUD/开始页/复盘。

### E. 当前不能宣称“已自动对齐”

- `port-manifest` 只保证 `js/` 行段 100% 认领；`parity-map` 只覆盖纯函数清单；
- `simdiff` 是诊断工具，历史报告首条事件就分歧；
- 因此“行为/UI 自动移植”仍是目标，不是现状。

## 4. 建议的下一步（按依赖顺序）

1. 对 `t2/decision.js#parseSpeech` 建 JS/GDScript 差分 fixtures（本轮 POC）；
2. 把差分扩到 `claimWindow` / `seatIndex` / `treat*` 等纯函数；
3. 上游拆 `game.js` 的会议/报告/投票状态机 → `core`；
4. 定义 UI spec，先迁移会议面板；
5. 生成物纳入门禁：手改生成文件即 FAIL。
