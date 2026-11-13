# 正文可读性改造施工方案（2.5D 主仓）

> **状态**：施工方案（2026-11-13 立），非真源、非规范。服从 `AGENTS.md` §一红线与根 `ARCHITECTURE.md` 三层架构；
> 冲突时以规范为准并回写本文。本文只描述「怎么改」，不定义任何数值 / 语料 / 地图 / 判定语义。
> **适用**：`C:/Users/ASUS/Desktop/新返航录` 的 `main` 分支（2.5D 主线，`53ddac5`）。
> **配套**：3D 侧见另一仓 `docs/BODY-REFACTOR.md`。
> **施工背景**：有其他 agent 并行小修玩法代码，故阶段 A 设计为「零正文改动」，后续阶段须等工作区收敛后启用。

---

## §0 一句话结论

外围读区（README / CHANGELOG / 历史分卷 / tests 隔离 / 3D 资产出清）已经收口，**进门找路不再难**；
但正文 `js/game.js` 仍是 660 KB 的单 IIFE 巨石，没有任何函数索引与预算，**读懂并安全改动正文的难度没有下降**。
红线 11/14 要求「改 3D 先问 2.5D 里这条在哪」，而真源侧无导航、派生侧（3D）反而有全套 filemap —— 这是本次要修的结构性倒挂。

---

## §1 现状实测（2026-11-13，可直接复测）

| 项 | 实测值 | 复测命令 |
|---|---|---|
| `js/` 总行数 | 20,099 行 / 22 个 `.js` | `find js -name '*.js' -exec wc -l {} + \| sort -rn` |
| `js/game.js` | **12,065 行 / 660,410 B，占 60.0%** | `wc -lc js/game.js` |
| 其余最大文件 | `data/lines.js` 2,090、`t2/minigame.js` 1,169、`ai/sanity.js` 1,082、`t2/ai.js` 738 | 同上 |
| `game.js` 形态 | 单个 IIFE `(function (global) { ... })`；顶层 `function` **0** 个，缩进 `function` **347** 个 | `grep -c '^\s\+function ' js/game.js` |
| 注释 | 注释行 979；含 `====` / `----` 的分区型 79 处；**块级分区注释仅 3 处**（第 1、11、1781 行） | `grep -n '^\s*/\*.*====' js/game.js` |
| 薄委托别名 | 第 29–40 行，25 个 T2 模块函数的局部 `const` 别名（性能用，不是委托层） | `sed -n '29,40p' js/game.js` |
| 索引设施 | **无** filemap、无函数表、无行数预算、无棘轮 | — |
| 可照搬的成品 | 3D 仓 `3d/tools/filemap.cjs`（213 行）、`3d/spec/file-budgets.json`（42 行） | 跨仓只读参考，不复制进本仓 |

**外围已完成的读区收口**（提交 `80e7902` / `4cce43f`）：README 46 行、CHANGELOG 150 行、
`AGENTS.md §零` 默认只读/不读表、历史分卷 `docs/changelog-history-*.md`、T3 测试迁入 `tests/`、
3D 资产出清后 `3d/` 仅剩 28 个 json/cjs 导出文件、全仓 784 文件、工作树干净。

**门禁现状**：`npm test` = `node tests/test-v3.cjs`；`npm run ci:gate` = `node tests/ci-gate.cjs`
（单职责：跑 test-v3 + 抖动白名单，`MAX_ALLOWED = 6`，`ALLOW = tests/flaky-assertions.txt`，
`LOG = tests/_gate-ci.log`）。本仓**没有** `tools/check-all.cjs`，也没有 `filemap.cjs`。

---

## §2 问题定义

1. **无法按名定位**：347 个函数平铺在一个闭包命名空间里，标准 `grep '^function '` 返回 0；
   没有 `--section` 式检索，改一行要先理解整份 660 KB。
2. **分区不成目录**：79 处分区型注释大多是行内短注，只有 3 处块级标题，无法形成稳定、
   可被工具解析的目录结构。
3. **没有棘轮**：文件只会继续长，任何一次「顺手加个函数」都不会被拦下。3D 侧已用
   `file-budgets.json` 把 `main.gd` 冻在 ≤5,550 行，2.5D 侧完全无约束。
4. **真源/派生倒挂**：3D 派生侧有函数表、预算、`@src` 锚点、`port-manifest` 行号对账；
   唯一真源 `js/game.js` 什么都没有。这与红线 11、14 的执行路径相悖。

**本方案不解决**：玩法逻辑缺陷、胜率、美术资产、部署链路。凡涉及判定 / 数值 / 语料 / 地图的改动，
一律回真源模块处理，不在本文中定义。

---

## §3 目标态（三阶段，按序解锁）

| 阶段 | 目标 | 是否碰正文 | 前置条件 |
|---|---|---|---|
| **A · 可检索化** | 函数级索引 + 预算棘轮，AI 可按名定位、改动可度量 | **否，一个字节都不碰** | 无，可立即并行施工 |
| **B · 按族拆分** | 把 347 个函数按函数族拆出 `game.js`，落到 T2 模块 | 是 | 其他 agent 小修收工、`git status --porcelain` 为空 |
| **C · 常态预算** | 单文件 ≤1,200 行、单函数 ≤200 行，额度只降不升 | 是 | B 完成且门禁全绿 |

阶段 A 的验收标志：不读 `game.js` 全文，也能回答「某个函数在哪个文件的第几行、多少行、属于哪一类」。

---

## §4 阶段 A 逐文件施工单（可直接执行）

> 允许写入的路径**只有**下列 4 项（第 5 项为可选延后项）。其余一律不动。

### A-1 新增 `tools/filemap-js.cjs`

函数级结构索引，只读源码、不写任何源码。照搬 3D 仓 `3d/tools/filemap.cjs` 的行为口径：

- 扫描范围：`js/**/*.js`（22 个文件）。
- 解析形态（必须覆盖本项目实际写法）：
  - 顶层 `function name(`；
  - IIFE 内缩进 `function name(`（347 个，主要对象）；
  - `const x = function (` / `const x = (` 箭头函数；
  - 对象字面量方法 `name: function (` 与 `name(` 简写；
  - `window.SKV3 = { ... }` 内的方法（红线 5 的 `_t` 调试 API 契约所在）。
- 输出两种粒度：
  - 文件级：行数、函数数、最大函数名与行数；
  - 函数级：名称、起始行、结束行、行数、分类（engine / handler / private / public / test）。
- CLI 与 3D 侧一致：`--top N` / `--file <path>` / `--section <片段>` / `--json` / `--check`。
  - `--section` 打印函数原文并带行号（这是「不必先读 660 KB」的核心能力）；
  - `--json` 供智能体消费，输出必须是稳定、可 diff 的 JSON；
  - `--check` 读 `docs/file-budgets-js.json`，违规 `exit 1`，通过 `exit 0`。
- 行尾同时兼容 CRLF / LF；不得修改被扫描文件。

### A-2 新增 `docs/file-budgets-js.json`

预算棘轮。首版额度按实测值锁定，**注释里写明「额度只许下调，上调须在 CHANGELOG 写明理由并同时下调别处」**。

```json
{
  "note": "大文件预算棘轮（2026-11-13 立）。额度只许下调。",
  "default_max_lines": 1200,
  "max_func_lines": 200,
  "files": {
    "js/game.js": {
      "max_lines": 12100,
      "role": "T2 跨域规则闭包：主循环 / 判定 / 动作结算；当前 12,065 行，留 35 行余量"
    }
  },
  "rules": {
    "max_func_lines_allow": {}
  }
}
```

`max_func_lines_allow` **不得留空**：施工前先跑 `node tools/filemap-js.cjs --json`，
把所有超过 200 行的函数逐条登记为「历史超长待拆」，每条写 `函数名 / 起始行 / 行数 / 待拆理由`。
理由须指向具体职责，不得编造、不得写「待定」。这份表就是阶段 B 的施工清单。

### A-3 修改 `package.json`

新增两条 script，不动其他 script、不动 `version` / `gameVersion`（红线 3）：

```json
"file:map": "node tools/filemap-js.cjs",
"file:check:js": "node tools/filemap-js.cjs --check"
```

若施工时 `package.json` 已有他人未提交改动：**不要动**，在交付报告里说明，改由主 agent 合并。

### A-4 修改 `tests/ci-gate.cjs`（可延后到阶段 A 末）

把 `file:check:js` 挂进 CI 汇总。约束：

- 保留现有「解析 test-v3 汇总行 + 抖动白名单 + 退出码」语义，不得改写 `MAX_ALLOWED` / `ALLOW` / `LOG`；
- 新增检查失败一律 `exit 1`，且必须在输出里打印可辨识的 `[file:check:js]` 前缀；
- 若届时该文件有他人未提交改动，跳过本项，索引检查暂由独立 npm script 承载，下一批再挂。

### A-5 回填本文

施工完成后在 §8 回填实测读数（文件数 / 总行数 / 最大文件 / 超长函数条数 / 各门禁实跑结果）。

### 阶段 A 禁止清单（硬性）

- 改 `js/**/*.js` 任一字节，**包括加分区注释**；
- 改 `index.html`（红线 2 唯一加载清单）、`assets/`、`audio/`、`tests/` 现有断言；
- 改 `js/config/version.js` 或 `package.json` 的版本字段（红线 3）；
- 新增任何运行时模块（那是阶段 B）；
- 删除、移动、重命名任何文件（红线 5）；
- 复制数值 / 语料 / 地图定义进新文件（红线 7 / 14）。

### 阶段 A 验收

| 检查 | 命令 | 判定 |
|---|---|---|
| 全文门禁 | `npm test` | 报告本次实跑「X 通过 / Y 失败」 |
| 行为门禁 | `npm run ci:gate` | 通过 |
| T3 体检 | `npm run t3:check` | 通过 |
| 红线契约 | `npm run agent:contract` | PASS（§一 14 条未被改动） |
| 资产门禁 | `npm run guard` | PASS |
| 索引自检 | `npm run file:check:js` | 输出文件数 / 总行数 / 最大文件 / 超长函数条数，`exit 0` |
| 正文零改动 | `md5sum js/game.js`（施工前 / 后各一次） | 两次哈希一致，报告里附原值 |
| 路径洁净 | `git status --porcelain` | 只出现 A-1 ~ A-5 的路径 |

---

## §5 阶段 B 施工单（待小修收敛后启用）

**前置**：其他 agent 收工、`git status --porcelain` 为空、阶段 A 门禁全绿、§4 的超长函数登记表已产出。

1. **切分依据**：以 `file:check:js --json` 的函数表 + 现有 79 处分区注释 + `window.SKV3` 导出面分组，
   按族拆到 `js/t2/<族>.js` 或 `js/engine/<族>.js`（归层贴标依红线 14）。
2. **每拆一族必须同步四处**（漏一处即回归）：
   - `index.html` 的 `<script>` 顺序（红线 2，且 `ai/sanity.js` 必须在 `ai/traits.js` 之前）；
   - `README.md` 的「项目结构」；
   - `AGENTS.md §一.2` 的加载清单原文；
   - `js/game.js` 第 29–40 行的 25 个薄委托 `const` 别名（真源仍是 T2 模块，此处只做局部绑定）。
3. **调试 API 契约不变**（红线 5）：`window.SKV3._t` 的 `state() / inv() / newGame() / kill() / tp() /
   openMeeting() / events() / frames() / replay() / litZone()` 一个都不能删、改名或改变语义。
4. **DOM id 双处同步**（红线 9）：`js/ui/templates.js` 与 `game.js` 的引用同批改。
5. **每族一次提交**，跑 §4 全部门禁；任一失败即整体回退该次提交，不做「先绿一半」。
6. 拆出的文件不得定义第二份数值 / 语料 / 地图（红线 7 / 14：多父允许、多份定义禁止）。

---

## §6 并发纪律（施工期间必须遵守）

- 开工先跑 `git status --porcelain` 并记录快照；只写本文分配给自己的路径。
- 禁止 `git add -A` / `git add .`，只 `git add <自己改动的文件>`；
  禁止 `stash` / `reset` / `checkout` / `rebase` / `push` / `force push`。
- 禁止删除、移动、重命名任何文件（红线 5）。
- 发现自己负责的文件在开工后被他人改动：**立即停下并报告**，不要覆盖、不要自行合并。
- 不提交他人改动；交付 = 改动文件清单 + 每条门禁的本次实跑读数，由主 agent 统一提交。
- 提交信息用中文 `type(scope): 摘要`（红线 10）；本报告只做结构改动时 `scope` 用 `ai-read` 或 `tools`。

---

## §7 回滚

- **阶段 A**：只新增 2 个文件、改 2 处 script（+1 处可选挂载）。正文零改动，
  删除新增文件 + 还原 script 即完全回到施工前，无数据风险。
- **阶段 B**：每族一次提交，回退单笔提交即可；`index.html` / `AGENTS.md` / README 的同步改动
  与对应族同批提交，回滚时一并回退，避免加载清单与文件不一致。

---

## §8 附录

**命令速查**

```
node tools/filemap-js.cjs                 # 总览
node tools/filemap-js.cjs --top 12        # 最大 12 个文件
node tools/filemap-js.cjs --file js/game.js
node tools/filemap-js.cjs --section <函数名片段>
node tools/filemap-js.cjs --json          # 机器可读
node tools/filemap-js.cjs --check         # 预算检查
npm test / npm run ci:gate / npm run t3:check / npm run agent:contract / npm run guard
```

**规范入口**：`AGENTS.md §零`（读区）、`§一`（红线 1–14）、`ARCHITECTURE.md`（T1/T2/T3）、
`docs/acceptance.md`（T3 验收）、`docs/workflow.md`（命令与提交流程）。

**施工回填区**（完成后填写，禁止沿用旧读数）：

```
施工日期：2026-11-13
file:check:js 实跑：22 文件 / 20,099 行 / 最大 js/game.js 12,065 行 / 超长函数 11 条
npm test：923 通过 / 0 失败
ci:gate / t3:check / agent:contract / guard：
  ci:gate 920 通过 / 3 失败（3 条均命中已登记抖动集，PASS）
  t3:check 13 PASS / 0 WARN / 0 FAIL；agent:contract PASS；guard PASS
js/game.js md5 前：31d82e23afcaa9000a053ea784428084
             后：31d82e23afcaa9000a053ea784428084
```

**阶段 A 实测补充**：`boot()` 本身就是 11,943 行的 IIFE 主闭包（108–12050），
347 个缩进函数全在其中；这条不在原 §1 表里，阶段 B 的第一优先级应是「先把 boot 按族外提，
再谈其他 10 条」。`file:check:js` 的 11 条登记与起始行 / 行数已写入
`docs/file-budgets-js.json#rules.max_func_lines_allow`，每次只读扫描、不改正文。
