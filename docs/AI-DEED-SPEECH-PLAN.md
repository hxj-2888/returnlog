# 方案 · 行为—感知—言语闭环（Deed Bus / Speech Receptor）

> **状态**：提案，**未改任何游戏代码**（2026-11-19）
> **范围**：AI 发言系统、AI 认知与信任判断、玩家发言模板、异形锁敌换靶
> **真源纪律**：数值仍进 `js/ai/sanity.js`；语料仍进 `js/data/lines.js`；本文只做设计与批次说明，
> 不复制数值、不另立第二套分。
> **⚠ 分数模型已被取代（2026-11-19）**：本文第 3.4 节按「sus / cred / trust / grudge / reliability
> 多轴并存」写的判断模型，已由 `docs/AI-TRUST-EMOTION-MODEL.md` 的**双分模型（信任分 T + 情绪分 E）**
> 取代。行为总线（3.1~3.3）、言语行为（3.5）、受体与证言（3.6）仍然有效；
> 实施时"判断"一栏一律读 T/E，不再新增 sus/cred 两本账。
> **前置阅读**：`docs/CORE_RULES.md` R11 / R12 / R13 / R20、`AGENTS.md` 红线 4 / 7 / 11 / 14。

---

## 0. 一句话

把「行为」做成唯一的事实源：**每一次行为都自动产生受体（行为人 / 受事者 / 见证者 / 旁听者），
每个受体各自形成判断；每一句发言都指向一条行为事实与一个受话人，并让说话本身承担后果。**

现在系统里「行为 → 证据 → 嫌疑/信任」是通的，「行为 → 台词」只通了不到一半，
「发言 → 受体 → 判断」基本没通。这份方案补的就是这两段。

---

## 1. 现状审查

### 1.1 已有四条链路（保留，不推倒）

| 链路 | 入口 | 产物 | 评价 |
|---|---|---|---|
| 目击 | `noticeAction` / `noteTaskAbandon` / `witnessDetain` / `credBroadcast` / `aiHear` | `mind.mem` + `sus` / `known` / `cred` | 敌对行为覆盖好，亲社会行为只覆盖 5 项 |
| 认知 | `SKT2AI`（`susAdd` / `evalAlmost` / `knownOverride` / `credOf` / `reliaOf`） | `sus` `known` `almost` `cred` `trust` `grudge` `warm` `reliability` `humanT` `mates` | 轴齐全，但缺「行为情节记忆」 |
| 证言 | `ctx.testimony` → `deliverTestimony` → `pushHeard` | 听众 `sus` / `cred` | 有 per-listener 权重，但没有受话人、没有行为细节 |
| 发言 | `startChatter` → `pickLine` / `accuseLine` → `say` | 台词 + 少数 `heard_*` | 排期是固定节拍，台词只覆盖指控/辩护/背书 |

### 1.2 实测读数（本批 1000 局 + 40 局发言体检）

| 指标 | 读数 | 含义 |
|---|---:|---|
| 出刀 / 局 | 9.88 | 最高频敌对行为 |
| 开枪 / 局 | 1.44 | 人类 0.41、异形 1.03 |
| 破坏 / 局 | 10.20 | 高频 |
| 假装做任务 / 局 | 3.43 | 比开枪多一倍，却**一句都说不出** |
| 假装修复 / 局 | 1.14 | 同上 |
| 医疗无人机救起 / 局 | **4.40** | 全游戏最高频的「救人」，**零目击、零台词** |
| 医疗包救起 / 局 | 0.53 | 有 cred、有感恩，**没有一句话** |
| 搜尸 / 局 | 5.25 | 有证据，无台词 |
| 会议 / 局 | 10.90 | 发言机会充足 |
| 台词 / 40 局 | 6,819 条 | 实质推理只占 **33.6%**，自述开头 29.5%（`tools/survey-speech.cjs` 基线） |

**结论**：不是「AI 不说话」，是「AI 只会拿敌对行为说话」。亲社会行为即使被看见，
也只折算成一个 `cred` 数字，既不进台词，也不进别人对他的「这个人靠不靠得住」的判断。

### 1.3 行为覆盖率总表（现状）

图例：✓ = 有；— = 无；△ = 有但不完整。

| # | 行为 | 目击证据 | 信任写入 | 受事者记忆 | 专属台词 | 判定 |
|---:|---|---|---|---|---|---|
| 1 | 出刀 | ✓ `saw_knife` → known | — | ✓ `saw_knife_self` + sus0.90 + grudge | ✓ `WHY.saw_knife` | △ 受害者说不出（见 G3） |
| 2 | 开枪 | ✓ `saw_shot` → sus | ✓ `shotAct` ± | — | ✓ `WHY.saw_shot` | △ 受害者无记忆（见 G4） |
| 3 | 砍机器人 | — | — | — | — | — 完全无受体（见 G1） |
| 4 | 钻管道 | ✓ → known | — | — | ✓ | ✓ |
| 5 | 破坏设备 | ✓ → known | — | — | ✓ | ✓ |
| 6 | 停摆机器人 | ✓ → known | — | — | ✓ | ✓ |
| 7 | 拉闸断电 | ✓ → known | — | — | ✓ | ✓ |
| 8 | 合闸复电 | ✓ 只给 cred | ✓ `breakerOn` 0.12 | — | — | △ 只能借背书笼统说 |
| 9 | 拖尸 | ✓ → sus | — | — | ✓ | ✓ |
| 10 | 拖离医疗间 | ✓ → sus | — | — | ✓ | ✓ |
| 11 | 藏尸 | △ `saw_body_moved` | — | — | — | △ 有记忆无台词 |
| 12 | 假装做任务（中途离开） | ✓ `saw_fake_task` → sus0.30 | ✓ `fakeWork` 0.12 | — | — | — 不可说（见 G2） |
| 13 | 假装修复 | ✓ 同上 | ✓ `fakeRepair` 0.20 | — | — | — 不可说 |
| 14 | 弃修逃跑 | ✓ `saw_task_abandon` → sus0.14 | — | — | — | — 不可说 |
| 15 | 跟踪 / 尾随 | — | — | — | — | — 无事件（见 G7） |
| 16 | 被保安拘留 | ✓ `saw_detain` → sus0.60 | — | 本人知道 | ✓ 他人视角 | △ 本人不能自述 |
| 17 | 医疗包施救 | ✓ `credBroadcast('revive')` | ✓ 0.16 | ✓ trust 0.55 | — | — 不能说「他救了我」 |
| 18 | 拖入医疗间 | ✓ `credBroadcast('dragToMed')` | ✓ 0.16 | ✓ trust 0.35 | — | — 同上 |
| 19 | 无人机救治 | —（设计如此） | — | 知道「被机器人救」 | — | — 无人类受体（见 G5） |
| 20 | 做任务完成 | ✓ `credBroadcast('taskDone')` | ✓ 0.12 | — | △ 只能自述 | — 目击者不能说（见 G1） |
| 21 | 修好故障 | ✓ `credBroadcast('fixDone')` | ✓ 0.20 | — | △ 只能自述/背书 | — 目击者不能说 |
| 22 | 报告尸体 | —（只有 `quick_report` 负项） | — | — | △ 只有「报太快」 | — 无正向「他去报案」 |
| 23 | 搜尸取证 | △ `saw_body` | — | — | — | — 无台词 |
| 24 | 领申请单 / 换弹 | — | — | — | — | — 无受体 |
| 25 | 下指令 | — | ✓ warm 0.06 | — | ✓ `leader` | ✓ |
| 26 | 公开背书 | ✓ `heard_vouch` | ✓ 0.05 | 被保者 trust 0.45 | ✓ `endorse` | ✓ |
| 27 | 投票 | ✓ 公开 | ✓ `correct` / `wrong` | grudge | ✓ | ✓ |
| 28 | 中枪幸存 | — | — | — | — | — 无（见 G4） |
| 29 | 逃跑 / 脱身 | — | — | — | — | — 无（见 G6） |
| 30 | 目击「他在做任务」 | — | — | — | — | — 无硬 alibi（见 G10） |

**统计**：30 项里，有专属目击台词的 **9 项**，**全部是敌对行为**；
亲社会行为 **0 项**有专属目击台词；受事者**只有 3 项**有情绪记忆（刀 / 救 / 拖），
拘留只留下一个状态、没有可复述的记忆；这 3 项里**能把自己的遭遇说出口的是 0 项**。

### 1.4 发言受体现状

- `say(who,text,kind)` 只做广播渲染，**没有 `to`（受话人）与 `about`（被谈论者）**。
- `ctx.testimony` 的 `li` 是「哪个听众」，不是「这句话说给谁听」；
  受话人与旁听者拿到的效果完全相同。
- 发言的后果只有两条：被指控者 `grudge`、投票结果 `ACCOUNT`。
  **背书说错了没有代价，目击证言被证伪没有代价，当众冤枉人只有投票那一步才算账。**
- 玩家发言 `playerTalk` 直接写 `grudge` / `trust`，没有走「受话人 → 判断」的统一路由。

### 1.5 玩家模板现状

`js/ui/templates.js` 共 14 个按钮：

```
怀疑 / 投他 / 作证 / 他反复带节奏 / 我为他背过书
看见钻管道 / 看见红光 / 看见出刀 / 看见破坏设备 / 看见机器人停摆 / 看见拉闸
我在… / 不是我
```

`parseSpeech` 只认 7 种 claim：`saw_pipe / saw_red / saw_knife / saw_shot / saw_sabotage / saw_bot / saw_breaker`，
外加 `support / accuse / vote / deny / where / when / heardShot`。

**玩家能说的话，比玩家能看到的事少得多**：看见有人修好故障、救起人、拖人进医疗间、
把尸体拖走、做任务做了一半跑掉、一路跟着自己——这些都没有按钮，也没有解析槽。
玩家只能打自由文本，而自由文本里的这些内容 AI 完全读不懂。

### 1.6 缺口清单

| 编号 | 缺口 | 直接后果 |
|---|---|---|
| G1 | 亲社会行为没有目击台词（做任务 / 修故障 / 施救 / 拖人 / 合闸 / 搜尸 / 报案） | 好人做十件好事，会议上说不出一件 |
| G2 | 假动作不可说（假任务 / 假修 / 弃修） | 全场只有数字在动，玩家永远听不到「他刚才在配电室站了半天没进度」 |
| G3 | 刀伤受害者说不出（`saw_knife_self` 没有 WHY 词条） | 受害者 sus=1、grudge 满格，嘴上却说「我看不清是谁」——语言与判断互相打脸 |
| G4 | 枪伤受害者没有记忆、没有 grudge、没有台词 | 被开枪打濒死的人，醒来对凶手毫无反应 |
| G5 | 无人机救援没有人类受体 | 全游戏最高频的「救人」在社交层不存在 |
| G6 | 脱身 / 逃跑没有事件 | 从异形手底下跑掉这件事，既不算能力也不算经历 |
| G7 | 跟踪没有事件 | 人类 AI 已经会跟踪（R11.9），但被跟踪者不知道、说不出 |
| G8 | 发言没有受话人 | 「我保你」和「我怀疑你」对全场同权，没有「这句话是冲谁说的」 |
| G9 | 发言没有责任（pledge） | 当众编造目击、事后被证伪，除了投票那一步没有成本 |
| G10 | 证言不含行为细节 | 只能「我怀疑他」，不能「我几点在哪看见他做了什么」，拆谎只能拆位置 |
| G11 | 玩家模板 / 解析器覆盖不足 | 玩家看到的事，一半说不出口；说出口了 AI 也读不懂 |
| G12 | 异形换锁敌不立即改路径 | 目标换了，人还沿着旧路径走一段，看起来像「原地发呆」 |

---

## 2. 设计原则（硬约束）

1. **不新增第二套分。** 判断的五个维度里，身份 / 可信度 / 善意三维直接用现有轴
   （`sus` `known` `cred` `reliability` `trust` `grudge`）；能力与威胁由「行为情节记忆」**派生读取**，
   不落第二个计数器。
2. **不读阵营。** 所有判断只来自该角色自己看见 / 听见 / 被施加 / 被告知的事实（R11.1）。
3. **R20 配置平等。** 玩家与 AI 走同一个 `deedEmit`、同一个 `routeSpeech`，不给 AI 特权，
   也不给玩家「免于被判断」的特权。
4. **语言对称。** 异形伪证与真目击共用同一套句式与同一个池子（R13.5 的现有纪律），
   否则玩家听一句「我确证」就能分辨阵营。
5. **真实性与意图分离。** 目击者只能陈述**可观察事实**（他在哪、做了什么、结果如何），
   不能陈述**意图**（他是假装的）。真假只有行为人自己知道；异形队友通过 `mates` 知道。
6. **一条事实一个真源。** `EV_W` 现在散在 `game.js`，本方案把它迁进 `SKSanity.DEED.evidence`，
   `game.js` 只引用，不复制第二张表。
7. **文件预算。** `js/game.js` 现 12,598 行，已超额度 12,582 行 16 行。
   本方案新增 `js/t2/deeds.js`、`js/t2/speech.js` 两个 T2 模块，**净减 game.js**，
   并按红线 2 更新 `index.html` 加载顺序与 README 结构。

---

## 3. 核心模型

### 3.1 Deed（行为事实）

一次行为在**发生的那一刻**登记一条事实。事实是唯一真源，证据与台词都从它派生。

```js
Deed = {
  id, night, t, pt,
  verb,        // KNIFE / SHOT / PIPE / SABOTAGE / BOT_STOP / BREAKER_OFF /
               // BREAKER_ON / DRAG / DRAG_AWAY / HIDE_BODY / FAKE_WORK /
               // ABANDON / STALK / DETAIN / TASK_DONE / FIX_DONE / REVIVE /
               // DRAG_TO_MED / MEDBOT_HEAL / REPORT / SEARCH / SUPPLY /
               // ORDER / VOUCH / VOTE / ESCAPE / BOT_HIT / RESCUED / SHOT_HIT
  actor,       // 席位
  patient,     // 受事者（可空）
  object,      // 设备 / 尸体 / 机器人 / 任务点
  room, x, y,
  result,      // success / fail / miss / partial / abandoned
  genuineness, // real / fake / unknown —— **只有 actor 自己与异形队友可读**
  visibility,  // public / covert / private
}
```

**关键约束**：`genuineness` 不得进入任何目击者可见的结构。
目击者拿到的是 `Percept`，里面只有 `verb` 与 `result`，没有「真假」这一栏。

### 3.2 Percept（感知）

```js
Percept = {
  observer, deedId,
  channel,   // 'self' | 'sight' | 'sound' | 'result' | 'hearsay'
  conf,      // 0~1，沿用现有证据分级（近距 / 远距 / 听觉 / 环境）
  dist, room, lit,
}
```

分发的三条通道，与现有实现一一对应，不新造判据：

| 通道 | 判据 | 产物 |
|---|---|---|
| `self` | 行为人或受事者本人 | `mind.deeds` + 私密结论（我知道是谁捅的我） |
| `sight` | `aiCanSee` + `attention()==='online'` + 现有半径 | `mind.deeds` + `sus` / `known` / `cred` |
| `sound` | `aiHear` 现有声纹距离 | `mind.heard` / `noise`，弱证据 |
| `result` | 只对「结果可观察」的行为（灯灭了、故障出现了、尸体被拖走了） | 环境证据，不指向人 |

### 3.3 受体四角色

每一次行为都有四个可能的受体。**「扩散到所有行为」就是把这张表填满。**

| 角色 | 定义 | 拿到什么 | 典型反应 |
|---|---|---|---|
| 行为人 actor | 做这件事的人 | 完整事实（含真假） | 自述 / 隐瞒 / 伪装 |
| 受事者 patient | 被救、被拖、被打、被指控、被跟踪的人 | `self` 级感知，置信 1.0 | 感恩 / 记仇 / 恐惧 / 公开作证 |
| 见证者 witness | 看见或听见的人 | `sight` / `sound` 级感知 | 嫌疑 / 信任 / 会上说出来 |
| 旁听者 audience | 会议上听到证言的人 | `hearsay` 级感知 | 信 / 不信 / 追问 / 拆谎 |

**现在的缺口正是「受事者」这一列大面积空白**：刀伤有（但说不出），枪伤没有，拖拽没有，
无人机救援没有，跟踪没有，脱身没有。

### 3.4 Judgment（判断）

> **已被取代（2026-11-19）**：本节原来的五维（identity / credibility / benevolence /
> competence / threat）保留为**读取视图**，但底层分数不再是 sus + cred + trust + grudge +
> reliability 五本账，而是 `docs/AI-TRUST-EMOTION-MODEL.md` 的 T（信任分）与 E（情绪分）两张表。
> 能力 / 威胁仍由 `mind.deeds` 派生，不落分。

不新增分数，定义一个**只读派生视图** `impressionOf(observer, target)`：

```js
{
  identity:   { sus, known, cred, almost },      // 现有：他像不像异形
  credibility:{ reliability, pledgeBroken },     // 现有 + 新增「发言责任」计数
  benevolence:{ trust, grudge },                 // 现有：他对我好/坏
  competence: { taskN, fixN, reviveN, reportN }, // 由 deedMem 派生，不落分
  threat:     { hostileN, proximity, recent },   // 由 deedMem 派生，不落分
}
```

- 前三维直接读现有轴，**一个数都不新增**。
- 后两维是 `mind.deeds` 的聚合读法，供 AI 决策权重使用；**不存第二份分**，
  所以不会出现「两个真源打架」。
- UI / 调试探针可以显示这张卡，玩家看到的是「他对你的看法」，不是内部数字。

### 3.5 SpeechAct（言语行为）

发言从「一段文本」升级为「一个带受体与证据的言语行为」。

```js
SpeechAct = {
  act,        // ACCUSE / VOUCH / WITNESS / ALIBI / ASK / ANSWER / CONFRONT /
              // DEFEND / CONCEDE / ORDER / REFUSE / THANK / WARN / REQUEST
  by,         // 说话人
  to,         // 受话人（可空 = 对全场说）
  about,      // 被谈论者（可空）
  deedId,     // 指向哪条行为事实（WITNESS / VOUCH / THANK 用）
  claim,      // { verb, object, room, window }
  evidence,   // { grade: 'seen'|'heard'|'inferred'|'self'|'none', conf }
  audience,   // 实际听众（会议 = 全场；场外 = 听觉半径）
}
```

路由规则（**这是「语言受体」的核心**）：

| 对象 | 效果 | 现有实现 |
|---|---|---|
| 受话人 `to` | ACCUSE → `grudge`；VOUCH → `trust`；ASK → 记一条「欠一个回答」；THANK → `trust` | 部分有（玩家发言直接写） |
| 被谈论者 `about` | ACCUSE → `sus`；VOUCH → `cred` + 弱 `sus` 抵扣 | 有（testimony） |
| 旁听者 `audience` | 按「对说话人的 `reliability`」加权；按「与被谈论者的关系」打折 | 有（`deliaMul` / `statementRelation`） |
| 说话人 `by` | **记一条 pledge**：`{act, about, deedId, t}`；日后被证伪 → `cred−` + 旁听者 `grudge` | **无**（G9） |

### 3.6 Testimony 带 deedId

现有 `ctx.testimony` 只有 `{li, by, tgt, wgt, reason, ev}`，`ev` 里可能有 `kind/room`，
但听众无法回答「他声称看见的那件事，和我自己记得的对不对得上」。

新增 `deedId` 后，听众可做三件事（全部复用现有判据，不新造概率）：

1. **在场反驳**：他声称在 R 看见 X，而我当时也在 R 且没看见 → `presence_deny`（已有）。
2. **时间线拆谎**：他声称的时间窗内，他自己的位置在别处 → 现有 `checkAlibi`。
3. **行为记忆核对**：我也看见了同一条 deed → 佐证（`corroborate`，加权）；我看见的是另一个结果 → 质疑。

第 3 条是「推理系统完善」的实质收益：**证言第一次可以被「另一双眼睛」验证，而不只是被位置验证。**

---

## 4. 行为总表（目标态）

列说明：**证据**＝目击写入；**受事者**＝本人拿到什么；**信任**＝对行为人的判断；
**台词**＝新增/复用的语料类；**显著度**＝会上被提起的优先级（高/中/低）。

### 4.1 敌对与可疑行为

| 行为 | 证据（sight/sound） | 受事者 | 信任 / 判断 | 台词 | 显著度 |
|---|---|---|---|---|---|
| 出刀 | known（≤4.5 格）/ sus0.75；heard0.18 | `saw_knife_self`：sus0.90 + grudge；**补 WHY 词条** | threat++，identity→异形 | `saw_knife` + 新增 `knife_victim` | 高 |
| 开枪 | sus0.55；heard0.16；**处决**判定 | **新增 `saw_shot_self`**：sus0.55 + grudge，知道是谁开的 | threat++；`shotAct` ± | `saw_shot` + 新增 `shot_victim` / `shot_justified` | 高 |
| 砍机器人 | **新增** `saw_bot_hit` sus0.25 | 机器人无 | threat+ | 新增 `bot_hit` | 低 |
| 钻管道 | known | — | identity→异形 | `saw_pipe` | 高 |
| 破坏设备 | known | 全船吃 `env_fault` | identity→异形 | `saw_sabotage` | 高 |
| 停摆机器人 | known | — | identity→异形 | `saw_bot` | 高 |
| 拉闸断电 | known | 全船吃 `env_lights` | identity→异形 | `saw_breaker` | 高 |
| 拖尸 | sus0.22 | — | threat+ | `saw_drag` | 中 |
| 拖离医疗间 | sus0.45 | — | threat++ | `saw_drag_away` | 高 |
| 藏尸 | 新增 `saw_hide` sus0.30 | — | threat+ | 新增 `hide_body` | 中 |
| 假装做任务（中途离开） | `saw_fake_task` sus0.30 | — | identity 弱+ | 新增 `left_task_early`（只陈述「没进度就走了」） | 中 |
| 弃修逃跑 | `saw_task_abandon` sus0.14 | — | 弱 | 新增 `abandon_task` | 低 |
| 跟踪 | **新增** `saw_stalk` sus0.18；被跟踪者 `self` | `followed`：grudge 0.15 + 恐惧 | threat+ | 新增 `followed_me` / `saw_follow` | 中 |
| 拘留 | `saw_detain` sus0.60 | 本人知道被押 | threat+ | `saw_detain` + 新增 `detained_self` | 中 |
| 脱身 | **新增** `saw_escape` | 本人 `escaped` | competence+（弱） | 新增 `escaped` | 低 |

### 4.2 亲社会与可信行为

| 行为 | 证据 | 受事者 | 信任 / 判断 | 台词 | 显著度 |
|---|---|---|---|---|---|
| 做任务完成 | `taskDone` cred0.12 | — | competence+；identity→人 | 新增 `saw_task_done` | 高 |
| 修好故障 | `fixDone` cred0.20 | — | competence++；identity→人 | 新增 `saw_fix_done` | 高 |
| 合闸复电 | `breakerOn` cred0.12 | 全船 | identity→人（异形侧 humanT） | 新增 `saw_breaker_on` | 中 |
| 医疗包施救 | `revive` cred0.16 | trust0.55；**新增可说** | benevolence++ | 新增 `saw_revive` / `rescued_by` | 高 |
| 拖入医疗间 | `dragToMed` cred0.16 | trust0.35；**新增可说** | benevolence++ | 新增 `saw_drag_to_med` / `dragged_by` | 高 |
| 无人机救治 | 无（设计如此） | 知道「被机器人救」 | 无人类行为人 | 新增 `medbot_saved_me`（只作经历） | 低 |
| 报告尸体 | **新增** `saw_report`（公开行为） | — | 无 cred；可作在场证明 | 新增 `reported_body` | 中 |
| 搜尸取证 | `saw_body` | — | 无 | 新增 `search_body` | 低 |
| 领申请单 / 换弹 | 无 | — | 无 | 不提（低价值噪音） | 低 |
| 下指令 | 公开 | — | warm0.06 | `leader` | 中 |
| 公开背书 | `heard_vouch` | trust0.45 | cred0.05 | `endorse` | 中 |
| 投票 | 公开 | grudge | `ACCOUNT` | `vote` | 高 |

### 4.3 关系与经历（新增）

| 行为 | 受体 | 效果 | 台词 |
|---|---|---|---|
| 我被他救了 | 受事者 | trust；会上可作证「他救了我」 | `rescued_by` |
| 我被他拖进医疗间 | 受事者 | trust；会上可作证 | `dragged_by` |
| 我被他开枪打了 | 受事者 | sus + grudge；会上可指控 | `shot_victim` |
| 我被他跟踪了 | 受事者 | grudge + 恐惧；会上可警告 | `followed_me` |
| 我看见他做任务 | 见证者 | cred；可作「软 alibi」 | `saw_task_done` |
| 我看见他修好故障 | 见证者 | cred；可作「软 alibi」 | `saw_fix_done` |
| 我看见他救人 | 见证者 | cred；可背书 | `saw_revive` |
| 我脱身了 | 本人 | competence 弱+；可自述 | `escaped` |
| 我被拘留了 | 本人 | 可自述「我被押了 30 秒」 | `detained_self` |

> **重要边界**：以上「软 alibi」都不是「他不是异形」的证明。异形会假装做任务、假装修故障
> （R12.6 真假同价）。台词只能说「我看见他在做」，不能追加「所以他不是」。
> 这正是异形伪装线的生存空间。

---

## 5. 言语行为总表

| 言语行为 | 例子 | 受话人效果 | 旁听效果 | 说话人后果 |
|---|---|---|---|---|
| ACCUSE | 「我怀疑 03，他刚才在配电室站着没进度」 | grudge | sus（按 reliability 加权） | pledge；若 03 被证清白 → cred− |
| WITNESS | 「我亲眼看见 05 从管道口出来」 | 若 `to`=05：grudge | sus / known（硬证据） | pledge；若被证伪 → cred− + 全场 grudge |
| VOUCH | 「04 刚才跟我一起在引擎室，他不可能是」 | trust | cred（弱） | pledge；若 04 翻身份 → cred− |
| ALIBI | 「我整晚都在医疗间」 | — | 进 `claimHist`，供拆谎 | 若被位置反驳 → sus |
| ASK | 「06，你刚才在哪？」 | 记「欠一个回答」；不答 → 弱 sus | 信息 | 无 |
| ANSWER | 「我在引擎室」 | 提问者更新印象 | 进 `claimHist` | 若矛盾 → sus |
| CONFRONT | 「你刚才说在配电室，可我在食堂看见你了」 | 被质问者 grudge | 双方 sus 都可能上升 | 若拆错 → cred− |
| DEFEND | 「不是我，我在医疗间」 | — | 弱 | 若矛盾 → sus |
| CONCEDE | 「行，我记错了，是引擎室」 | — | 可信度 +（承认错误） | 轻微 cred+ |
| ORDER | 「02 你去配电室守着」 | 服从 / 拒绝（按号召力×信任） | warm | 若指令害死人 → cred− |
| REFUSE | 「我去不了，我这边走不开」 | 领袖印象− | 无 | 无 |
| THANK | 「刚才多谢你拉我一把」 | 受话人 trust | 旁观者 cred（弱） | 无 |
| WARN | 「有人一路跟着我」 | — | 对 warning 对象 sus | 无 |
| REQUEST | 「谁来帮我抬一下」 | 受话人可选择去 | 无 | 无 |

**新增的两条关键后果**：

1. **pledge（发言责任）**：每次 WITNESS / ACCUSE / VOUCH 都记一条承诺。
   当事实被证伪（被救者没被救、被指控者翻出人类身份、被保者翻出异形），
   说话人 `cred` 下降、旁听者 `grudge` 上升。
   这把现有 `ACCOUNT` 从「投票结果」扩展到「说出口的每一句硬话」。
2. **ASK 的回答义务**：被点名提问的人如果不答，旁听者记一条弱 sus；
   答了但与位置矛盾，走现有 `checkAlibi`。这给了「沉默也是线索」一条更具体的入口。

---

## 6. 语料扩充规格

### 6.1 新增证据短语（`SKLines.WHY`）

必须新增 12 个 key，每个 4~6 条：

```
saw_knife_self   受害者第一人称（他捅的我）
saw_shot_self    受害者第一人称（他开的枪）
saw_task_done    「我看见他把 X 做完了」——必须能被 parseSpeech 识别
saw_fix_done     「我看见他修好了故障」
saw_revive       「我看见他用医疗包把 06 救起来」
saw_drag_to_med  「我看见他把 06 拖进了医疗间」
saw_breaker_on   「我看见他合上了闸」
saw_report       「是他去拉的铃」
saw_fake_task    「他在任务点站了半天，进度一点没动」——只陈述事实
saw_task_abandon 「他修到一半就走了」
saw_stalk        「他一路跟着 06」
saw_escape       「他从那条走廊跑掉了」
```

### 6.2 新增语料池（`SKLines.POOLS`）

每池 10~12 条 × hot / cold 两档，沿用 `js/data/lines.js` 的写作纪律
（8~18 字、口语、不写书面词、允许半句）：

| 池 | 用途 | 受体 |
|---|---|---|
| `witness_deed` | 会上陈述看见的行为（组合槽：{when}{r}{t}{k}） | 旁听者 |
| `rescued_by` | 「他救了我」 | 受事者 |
| `dragged_by` | 「他把我拖进医疗间」 | 受事者 |
| `shot_victim` | 「他朝我开的枪」 | 受事者 |
| `followed_me` | 「他一路跟着我」 | 受事者 |
| `detained_self` | 「我被保安押了 30 秒」 | 本人 |
| `escaped` | 「我从那边跑掉了」 | 本人 |
| `thank_deed` | 「刚才多谢」 | 受话人 |
| `warn_follow` | 「有人跟着我」 | 旁听者 |
| `ask_deed` | 「你刚才在配电室做什么？」 | 受话人 |
| `pledge_broken` | 「你上次说的可不是这个」 | 说话人 |
| `medbot_saved` | 「是那台机器把我拉起来的」 | 本人 |

预计新增 **约 320 行**语料。`js/data/lines.js` 不受行数上限约束（2026-11-15 裁定），
但仍受「单函数 200 行」约束——新池按批次拆进 `MORE9/MORE10`。

### 6.3 写作纪律（新增三条）

1. **只陈述可观察事实，不陈述意图**：写「他站了半天没进度」，不写「他假装做任务」。
2. **伪证同句**：异形编造的 `saw_revive` 必须和真目击一字不差，不得留「我没看清」这种破绽。
3. **不替玩家总结**：不写「所以他是异形」，结论由听众自己下。

---

## 7. 会议排期改造

### 7.1 现状

`startChatter` 是一条固定节拍：报案 → 先发制人 → 自述（≤2）→ 指控（≤3）→ 辩护 → 追问 → 补位。
台词从 `accuseLine` / `alibiLine` / `pickLine` 出，**没有「我今天看见了什么」这一轮**。

### 7.2 目标：每人一张 brief

会议开始时，每个参与者生成自己的 `brief`：

```js
brief = {
  deeds:  topK(mind.deeds, 3, bySalience),   // 我看见的行为
  self:   topK(mind.deeds, 2, actor===me),   // 我做的事（可自述）
  suffer: topK(mind.deeds, 2, patient===me), // 我遭遇的事（可控诉/致谢）
  accuse: existing accuse / accuseWhy,
  alibi:  existing alibiOf,
}
```

### 7.3 新话轮：`deed_witness`

插在「自述」与「指控」之间，**不改现有名额**：

| 轮次 | 谁开口 | 说什么 | 上限 |
|---|---|---|---|
| 行为证言 | 手上 `deeds` 显著度最高的人 | 「我{when}在{r}看见{t}{verb}」 | 全场 ≤ 3 条 |
| 受害陈述 | `suffer` 非空且显著度高 | 「他救了我 / 他朝我开的枪」 | 全场 ≤ 2 条 |
| 致谢 | 被救者且施救者在场 | 「刚才多谢」 | 全场 ≤ 1 条 |

三条硬约束：

1. 每条 `deed_witness` 必须带 `deedId`，没有 `deedId` 的句子不许进这个轮次。
2. 同一条 deed 全场最多被提 2 次（第 3 个人只能附议，不重复陈述）。
3. `alienLineCap`、`sayStreakOK`、`accuseSpeakers`、`alibiOpenMax` 四条节流**全部照旧生效**。

### 7.4 顺序（目标态）

```
系统播报（死者 / 案发舱室）
→ 异形先发制人（25%，保持）
→ 自述 ≤2（R13.9 保持）
→ 行为证言 ≤3（新增）
→ 受害陈述 ≤2（新增）
→ 指控 ≤3（R13.9 保持）
→ 辩护 / 追问 / 背书 / 补位
→ 投票
```

---

## 8. 玩家模板与解析器

### 8.1 UI：四组按钮

`js/ui/templates.js` 现在是 14 个平铺按钮。改为**四组下拉 + 按钮**，避免一行塞 26 个：

| 组 | 按钮 | 需要目标 | 需要舱室 |
|---|---|---|---|
| 可疑 | 看见出刀 / 看见开枪 / 看见钻管道 / 看见破坏 / 看见停摆机器人 / 看见拉闸 / 看见拖尸 / 看见拖离医疗间 / 看见藏尸 / 看见他跟踪人 / 他做任务做一半跑了 | 是 | 可选 |
| 可信 | 看见他做任务 / 看见他修好故障 / 看见他救人 / 看见他拖人进医疗间 / 看见他合闸 / 看见他去报案 | 是 | 可选 |
| 我的遭遇 | 他救了我 / 他把我拖进医疗间 / 他朝我开的枪 / 他一直跟着我 / 我被保安押了 / 我脱身了 / 是无人机救的我 | 视按钮 | 否 |
| 关系 | 怀疑 / 投他 / 作证 / 他反复带节奏 / 我为他背过书 / 我在… / 不是我 | 视按钮 | 视按钮 |

### 8.2 解析器扩展（`js/t2/decision.js#parseSpeech`）

新增槽位，**旧槽位一个不动**（向后兼容，门禁不炸）：

```js
out.deed = {
  verb,        // task / fix / revive / drag_to_med / breaker_on / report /
               // fake_task / abandon / drag / drag_away / hide / stalk /
               // shot / knife / pipe / sabotage / bot / breaker_off
  target,      // 行为人
  object,      // 受事者 / 设备
  room,        // 可空
  window,      // recent / night
}
out.benefit = { by, kind }   // 他救了我 / 他拖我 / 他给我（未来）
out.harm    = { by, kind }   // 他打我 / 他跟踪我 / 他关我
out.accompany = { with, room, window }  // 「我一直跟 04 在一起」
```

判定顺序（避免互相抢槽）：

```
deny > support > benefit/harm > deed(可信) > deed(可疑) > accuse > vote > where
```

### 8.3 模板必须能被自己解析

沿用现有纪律「模板生成的句子一定能被 parseSpeech 识别」，
新增一条门禁：**每个按钮 × 每个目标 × 每个舱室跑一遍「生成 → 解析 → 槽位比对」**，
26 × 14 × 11 ≈ 4,000 组，用表驱动一次性跑完。

### 8.4 防误伤

- 需要目标的按钮，未选目标时 `toast('先选对象')`（现有行为）。
- 「他救了我」不需要目标：行为人从 `mind.deeds` 里 `patient===me` 的记录自动带出；
  没有记录时按钮置灰，**不允许玩家凭空生成一段没发生过的遭遇**。
- 玩家声称的 deed 会走 `G.me.claimDeed`，与 AI 证言同一条投递链（R11.7 的一次性规则照旧）。

---

## 9. 异形锁敌即时切换（独立小改，可先上）

### 9.1 现状与根因

`js/game.js` 的追击段：

```js
if(!a.path||!a.path.length) walkTo(a,tgt.x,tgt.y);
stepMove(a,dt,moveSpeed(a));
```

- 换目标时 `a.target` 变了，但 `a.path` 还是**旧目标**的路径；
  只有走完整条旧路径才会重新寻路 → 看起来像「换了目标还先往旧地方走一段」。
- `walkTo` 失败会设 `_pathCD=1.2s`，换目标时如果正处在冷却里，**连新路径都排不上**。
- 放弃目标的两处（`_avoid` / 保安扇形）直接 `a.target=null; a.path=null`，
  当场站住不动，等下一帧重挑。

### 9.2 修法（三步）

1. **路径绑定目标**：追击寻路时记 `a._chasePath={i:tgt.i,x:tgt.x,y:tgt.y}`。
   每帧检查：`tgt.i !== _chasePath.i` → 立即 `a.path=null` 并重排。
2. **移动目标重排**：目标位移 > 0.8 格且距上次重排 > 0.2 秒 → 重排。
   0.2 秒是 A* 节流，不是难度参数；写进 `SKSanity.HUNT.repathSec`。
3. **放弃目标不站住**：`_avoid` / 保安扇形触发时，给一个「离开当前点」的
   临时目的地（背向目标 4~6 格），而不是 `path=null` 原地发呆。

### 9.3 验收

- 门禁：换目标后 **≤2 帧**内 `a.path` 的终点指向新目标（用 `_t` 探针读）。
- 门禁：一次换靶的 `astar` 调用 ≤ 2 次（防止每帧重排）。
- 蒙特卡洛：1000 局同种子对比「异形平均追击距离 / 出刀数」，漂移 ≤ ±3%。

---

## 10. 分批实施

> 每批独立可回滚；每批结束必须写 `CHANGELOG.md` 批次段并跑对应门禁。

| 批次 | 内容 | 触及文件 | 验收 | 风险 |
|---|---|---|---|---|
| **P0 体检** | 只加计数器：`deedSeen/deedSpoken/deedWitnessN/speechOrphanN`；扩 `survey-speech.cjs` 出「行为覆盖率」表 | `game.js`（少量）、`tools/survey-speech.cjs` | 现有 1044 条门禁全绿；覆盖率基线落盘 | 极低 |
| **P1 事实总线** | 新增 `js/t2/deeds.js`：`DEEDS` 表 + `deedEmit` + `deedFanout`；把 `noticeAction` / `credBroadcast` / `noteTaskAbandon` 的内部改为调用它，**数值逐项不变** | 新模块 + `game.js` 薄改 + `index.html` | 200 局 A/B：sus/cred 写入计数逐项相等；胜率漂移 ≤1pp | 中（回归面大） |
| **P2 受体补齐** | 新增 `saw_shot_self` / `followed` / `escaped` / `rescued` / `dragged`；枪伤 grudge；拖拽者记忆 | `game.js`、`t2/ai.js`、`sanity.js` | 每个受体一条门禁断言 | 低 |
| **P3 发言覆盖** | 12 个 WHY + 12 个池 + `deed_witness` 轮次；`deedBrief` | `lines.js`、`game.js`、`sanity.js` | 覆盖率 ≥60%（高显著行为）；无 `deedId` 的句子不得进轮次 | 中（语料质量） |
| **P4 言语受体** | `say(...,meta)` + `routeSpeech`；pledge 责任；ASK 回答义务 | 新模块 `js/t2/speech.js` + `game.js` 薄改 | 受话人/旁听者效果不对称的断言；伪证被证伪后 cred− | 中（平衡） |
| **P5 玩家模板** | 四组 26 按钮；`parseSpeech` 新槽；生成→解析回环测试 | `ui/templates.js`、`t2/decision.js`、`game.js` | 4,000 组回环全过；旧 14 按钮行为不变 | 中（DOM 双处同步） |
| **P6 换靶** | 第 9 节三步 | `game.js`、`sanity.js` | ≤2 帧换靶；A* ≤2 次；漂移 ≤3% | 低 |
| **P7 平衡与文档** | 1000 局 × 3 种子 A/B；CORE_RULES R11/R12/R13 补条；3D `lines.json` 重导 | 文档 + 导出链 | 读数写进 CHANGELOG；3D parity | 低 |

**建议顺序**：P6（快、独立）→ P0 → P1 → P2 → P3 → P4 → P5 → P7。
P4 与 P5 可以并行，但 P4 必须先于 P5 落地，否则玩家模板生成的新句子没有受体路由。

---

## 11. 验收指标

| 指标 | 现状 | 目标 | 测法 |
|---|---:|---:|---|
| 高显著行为「被目击后有人能说出来」的覆盖率 | 约 30%（9/30） | ≥ 60% | `survey-speech.cjs` 新分桶 |
| 台词有据率（每句都能追到 deed / 位置 / 关系） | 未测 | **100%** | 门禁：无 `evidenceRef` 的句子直接失败 |
| 实质推理句占比 | 33.6% | ≥ 45% | `survey-speech.cjs` |
| 每场会议台词条数 | 现有上限 | 不增（沿用 `alienLineCap` / `sayStreakOK`） | 门禁 |
| 人类胜率漂移 | 52.3% | ±3pp | 1000 局 × 3 种子 |
| 1000 局时长 | 约 460 秒 | ≤ +10% | `monte-carlo.cjs` |
| 新增门禁断言 | 1,044 通过 | ≥ +40 条 | `test-v3.cjs` |

---

## 12. 风险与对策

| 风险 | 后果 | 对策 |
|---|---|---|
| 信息泄漏（AI 说出没看见的事） | 推理系统直接失去意义 | 每条句子必须带 `deedId` 或 `evidenceRef`；门禁硬拦 |
| `genuineness` 泄漏 | 玩家一听「假装」就知道阵营 | `genuineness` 只存在 actor / mates 的 mind；目击结构里没有这个字段 |
| 发言膨胀 | 会议变吵、玩家读不完 | 三条新轮次各有全场上限；四条旧节流照旧 |
| 亲社会行为变成「洗白刷分」 | 异形靠演好人无脑赢 | 真假同价照旧；`cred` 有上限与衰减；不新增「做好事抵嫌疑」 |
| 证言责任过重 | 没人敢说话 | pledge 只在**硬话**（WITNESS / ACCUSE / VOUCH）上记；软话不记 |
| 文件预算 | `game.js` 继续超 | 新模块承载净增；P1/P4 同时外提 `startChatter` 的出句段 |
| 3D 不同步 | 两版语言不一致 | `lines.json` 重导；`3d:parity:check` 进 P7 |
| 门禁脆弱 | 大量旧断言按旧台词写死 | P1 先做「行为 parity」再动台词；台词类断言改为「有 deedId」而非逐字匹配 |

---

## 13. 需要你拍板的七个点

1. **判断是否允许「派生而不落分」**：能力 / 威胁两维只从 `mind.deeds` 聚合读，不新增计数器。
   这样不会出现第二套分，但也不能直接拿一个数去调平衡。
2. **亲社会行为是否抵扣嫌疑**：建议**不抵扣**。做好事只加 `cred`，不减已有 `sus`；
   否则异形演两场好人就能洗掉一次被目击的出刀。
3. **受事者记忆强度**：枪伤 grudge 建议 0.40（低于刀伤的 0.90 sus），
   拖拽 grudge 建议 0.20。这三个数需要你定档，我不擅自写进真源。
4. **发言责任（pledge）是否上线**：建议上线，但只在「硬话」上记；
   被证伪扣 `cred−0.10`、旁听者 `grudge+0.15`，复用 `ACCOUNT.wrong` 的量级。
5. **玩家模板形态**：建议四组下拉 + 26 按钮（本文 8.1）；不建议纯自由输入，
   因为自由文本里的「他救了我」现有解析器读不懂，玩家会觉得「我说了没用」。
6. **「脱身」的定义**：本文按三种情形合并——逃出追击视野、弃修逃跑成功、从拖拽中挣脱。
   如果你指的是其中一种，实施时只做那一条。
7. **「看见他做任务」是否算硬 alibi**：建议**软证据**（cred + 可被「他也可能在做假动作」抵消），
   不算 `known`、不算「不是异形」。这是异形伪装线能不能活的关键。

---

## 14. 附：本方案不做什么

- 不重写现有四条链路，只补「受事者」与「发言受体」两段。
- 不新增阵营读取、不新增「AI 全知」通道。
- 不改现有 1,044 条门禁的语义；台词类断言改为「带 deedId」的结构断言。
- 不动小游戏、地图、任务难度、美术资产。
- 不在本批调用生图模型、不新增素材。
