# 发布说明

> 面向读者的版本级说明。工程细节、逐条改动理由与实跑读数以
> `3d/CHANGELOG-2026-11.md` 为准，本文只做汇总，不另立一份台账。

## V1P-0.3 · 规则驱动验收 — 2026-11-14

**一句话**：把《核心玩法规则释义》的 112 条规则变成可被机器核对的断言，
3D 实现在数值与场景两层偏离时会直接红，不再靠人玩出来再提需求。

### 这一版解决的问题

在此之前，3D 的门禁全绿但玩着仍然不对。原因不是改的人不认真，是检查口径错位：

- 映射账本按 **999 个函数**记判决（`ported 116 / auto 112 / adapter 372 / n/a 367 / pending 32`），
  覆盖的是「每个函数有没有一条说法」；
- 而玩家能感知的是 **112 条 R 规则**（`R0`–`R19`，含 `R7.x.y` 三级条目）。

两套口径之间原本没有任何交叉引用：`3d/tools/` 里没有一条审阅逻辑认 R 编号。
于是「每个函数都有判决」被误读成「每条规则都实现了」。

### 新增能力

| 能力 | 载体 | 状态 |
|---|---|---|
| 规则索引 | `3d/spec/mapping-ledger.json#rules` | 112 条，含分类、目标、断言、双哈希 |
| 数值判定器 | `npm run audit:rules` | 56 条断言，实跑 PASS 56 / FAIL 0 / ERR 0 |
| 场景夹具账本 | `3d/spec/fixtures/rules-scenarios.json` | 35 条 scenario 逐条有账：covered 17 / partial 3 / todo 15 |
| 场景执行器 | `npm run 3d:rules:test` | 7 个 case，实跑 7 通过 / 0 失败 |
| 运行留痕 | `3d/reports/runs/*.json` + `history.jsonl` | 每次判定落 manifest，三态 verdict |
| 选题器 | `npm run audit:next` | 剩余 22 条缺口按成本排序，只排序不改文件 |

门禁由 9 项增至 **11 项**（新增 `audit:rules`、`fixtures:check`）。

### 三条设计决定

1. **账本不存数值**。断言的 `assert` 只存「读取正则 + 目标键 + 换算比例」，
   期望值每次从 `3d/CORE_RULES.md` 正文现取。规则改一个字或一个数，断言立刻失配报 `ERR`，
   而不是拿两个月前的旧值继续判一条已经变了的规则。这是「规则优先于实现」在代码里的落点。
2. **告警分级**。`FAIL`（正文值与导出值不等）直接红；`ERR`（正文措辞漂移、正则未命中）
   只告警，`--strict` 才算失败。理由：正文由设计者维护，改一个字不该把所有人的门禁卡红，
   但「值真的不相等」必须立刻红。
3. **目标分两栏**。`targets` 只放 GDScript 符号，`data_targets` 只放 `file.json#dot.path`。
   混栏会让「代码没实现」和「数据没导出」两种完全不同的缺陷长得一样。

### 判定器不是空转（灵敏度自检）

把 `R2.1` 的目标键故意指到 `move.speed`（=4），判定器立刻报
`FAIL R2.1 正文 75 != 导出 4` 并 `exit 1`；换回真账本 `exit 0`。
同理把某条夹具证据指向不存在的测试函数，`fixtures:check` 报
`evidence 函数在文件里找不到` 并 `exit 1`。

### 常用命令

```bash
npm run check              # 11 项只读门禁（CI 每次 push 都跑）
npm run audit:rules        # 规则数值判定（报告模式，恒 exit 0）
npm run audit:rules -- --check --strict   # 收口：ERR 也算失败
npm run 3d:rules:test      # 场景夹具（需 Godot 无头；GODOT_BIN 可配）
npm run audit:next         # 缺口队列
npm run map:build          # 重建账本（保留人工分类/目标/断言）
```

### 已知缺口（不掩饰）

- **scenario 35 条只覆盖 17 条**。剩余的不是「缺断言」，而是规则不在 `sim` 层：
  `R10.3`（同一尸体同夜只报一次）的判定在 `main.gd` 调用处，`R4.1`（1 项直执 / 多项轮盘）
  在 `main._collect_offers`，`R7.1.3`（断电后门需扫描）由场景节点驱动。
  `sim` 预算 3,655 / 3,680 行、`main.gd` 5,549 / 5,550 行，两条路都先要工程动作，不硬凑假夹具。
- **numeric 剩 3 条**：`R6.1` / `R6.8` 需派生值，`R11.2` 是 24 项权重表（只连整表，不设单值断言）。
- **`manual` 7 条**（输入映射、语料质感、美术提示词）不参与自动判定，已在账本标注。
- **Godot 执行器未进 `npm run check`**：`check` 是纯 Node 只读门禁，不依赖引擎二进制；
  要进 CI 需单独 workflow 并在 runner 装 Godot，属部署决策，未擅自添加。

### 兼容性

- **不改玩法**：本版未修改 `js/**`、未改判定逻辑、未改数值、未改美术与音频资产。
  `js/game.js`、`js/data/map.js` 与 2.5D `main` 保持一致。
- **不改规则**：`docs/CORE_RULES.md` 与其镜像 `3d/CORE_RULES.md` 一字未动，镜像 `source_sha256` 校验通过。
- **数据新增**：`space.json` / `rules.json` 增 10 个导出键（`reach.pipe` / `reach.monitor` /
  `reach.report` / `drag.*` / `tasks.*` / `AGGR_FLOOR` / `QUAL_AT` / `QUAL_CAP` / `FOLLOW_SUS`），
  属只增不改，旧读取方不受影响。

### 本版提交

| 仓 | 提交 | 内容 |
|---|---|---|
| 2.5D | `7774339` | `§14.4` 登记 9 条自动化审阅公开来源（方法论吸收，未采用其代码） |
| 3D | `39423be` | 规则索引 112 条 + 数值判定器 + 第 10 项门禁 |
| 3D | `e878b69` | 场景夹具账本 + 第 11 项门禁 |
| 3D | `f5052f5` | 场景执行器跑通（`SceneTree`，绕开 `main.gd` 预算） |
| 3D | `7c68aaf` | 运行留痕与三态 verdict |
| 3D | `793cddc` | 选题器 `audit:next` |
| 3D | `bca75d3` | 夹具 14 → 17（移动打断站桩 / 夜会保留 doing / 白天刷新） |
