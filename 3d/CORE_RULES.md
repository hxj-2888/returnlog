<!-- GENERATED from 新返航录/docs/CORE_RULES.md @ sha256:aaf7b20871e30ea03dc403775a31d9d35cf9390ce45c4542170ea3822eeb2332; do not edit; run npm run docs:sync -->

# 新返航录 · 核心玩法规则（自然语言权威版 · 2.5D 现行设计口径）

> **文档定位（先读这一节）**
>
> 1. 本文是《新返航录》规则设计的**自然语言权威文本**（设计者口径）。规则**该是什么**，以本文的表达为准。
> 2. `js/` 是这套规则的**现行实现参照**：实现与本文不一致时，按本文语义修正实现，
>    而不是用实现反向解释设计。
> 3. **本文只在设计者明确指示下修改。** 未经指示，任何人（包括 AI）不得改动词句与数值；
>    评审意见只做批注，改动等设计者发话。
> 4. 每条规则末尾标注**实现依据**（`文件:行号`），用于核对「实现是否已经跟上设计」；
>    行号会随实现改动漂移，以函数名为锚。
> 5. **3D 版从本文件翻译**：先按自然语言确认目标行为，再去 `js/` 找对应实现与行号，
>    然后在 3D 逐函数移植；映射有歧义时以本文为准纠正。
> 6. **美术 / 建模 / 音频只保留提示词**（自然语言）：提示词是资产的设计口径，素材本身不入本文；
>    具体规范见 R19。
> 7. 版本口径：返航录V3.7（`js/config/version.js`）；本文对应 2026-11-14 的 `main`。

---

## R0. 一句话规则

11 名人类与 4 名异形在同一艘船上实时行动：人类靠**做维修任务**把全船进度推到 45 分，异形靠**放倒/驱逐人类**取胜；
夜里有刀、枪、破坏、断电与尸体，天亮后全员开会、发言、投票驱逐。所有 AI 只依据"自己看见/听见/查到"的信息推理，
不读取身份答案。

---

## R1. 对局骨架

- **R1.1** 每局 15 个席位：11 人类 + 4 异形；玩家可占其中一席（人类或异形），也可旁观。（`js/game.js:184-195`）
- **R1.2** 座位随机；`?test` 门禁探针固定 0 号席位，保证夹具稳定。（`js/game.js:181-182`）
- **R1.3** 15 人开局全部出生在中央会议室（bridge）的随机可走点。（`js/game.js:241-245`）
- **R1.4** 地图固定：98×94 格，10 个舱室、11 条走廊、26 个任务点（8 个高难点）、8 个管道口；
  设施 6 处：电闸、医疗无人机、保安机器人、军械补给点、医疗补给点、监控台。（`js/data/map.js:27`）
- **R1.5** 每个席位开局获得 4 个自己的任务：1 个高难点 + 3 个普通点（从全部点里随机，可能与他人重复）。
  （`js/game.js:208-209`）
- **R1.6** 性格四轴（激进 `aggr` / 谨慎 `caut` / 社交 `soc` / 好奇 `cur`）每局随机；
  三档分布 28/50/72，概率 30%/40%/30%。（`js/ai/traits.js:33-46`）
- **R1.7** 异形的 `aggr` 保底 60（性格轴上的"胆量补偿"，避免人类敢投票把异形压到 26% 胜率）。（`js/game.js:205`）
- **R1.8** 性格的全部行为差异再乘一个全局压缩系数 `TRAIT_GAIN = 0.45`；想恢复原始强度只改这一处。
  （`js/ai/sanity.js:37`）

---

## R2. 时间轴与阶段

- **R2.1** 一夜 75 秒（纯干活时间；会议不占夜晚时间）。（`js/ai/sanity.js:651-653`、`js/game.js:110-115`）
- **R2.2** 对局从"开局公开讨论（pre）"开始，讨论 50 秒、**本轮不投票**，结束后进入第 1 夜。（`js/ai/sanity.js:549`、`js/game.js:335`）
- **R2.3** 夜晚阶段：AI 自由行动；玩家可移动、交互、攻击、搜尸、拖拽、报告、看监控、钻管道（异形）。
- **R2.4** 夜末（倒计时归零）进入 `dawn()`：所有濒死者因失血死亡 → 清空未修完的故障（不扣分） → 判定胜负 →
  把**所有活人**传送到中央会议室、打断一切任务/移动/拖拽 → 开白天全员会议。（`js/game.js:4526-4550`）
- **R2.5** 白天会议：讨论 60 秒 + 投票 5 秒 + 结果公布 3 秒；结束后进入下一夜。（`js/ai/sanity.js:548-553`、`js/game.js:7818`）
- **R2.6** 夜晚会议（报告尸体触发）：讨论 35 秒 + 投票 5 秒 + 公布 3 秒；**会议期间夜晚时钟暂停**，
  会后把剩余夜晚时间原样还回去（会议不吃夜晚时间）。（`js/ai/sanity.js:545-553`、`js/game.js:7805-7813`）
- **R2.7** 会议开始时**清掉所有死者尸体**（`bodyGone=true`）；濒死者还活着，继续躺在地上可交互。
  （`js/game.js:6983-6984`）
- **R2.8** 夜晚会议不打断站桩任务（清路径、保留 `doing`）；白天会议**打断一切**（上面 R2.4）。（`js/game.js:6957-6962`）
- **R2.9** 第 10 夜起进入"终结者时刻"：全场身份公开 + 每个活人子弹补到 1 发（不叠加）。（`js/ai/sanity.js:637-641`、`js/game.js:7843-7860`）
- **R2.10** 每夜开始重置当夜状态：每人回 1 把刀、清故障与破坏目标、重置机器人、清拉闸计数、清跨夜行为标记；
  认知层的跨夜嫌疑/信誉按 R8 的规则保留。（`js/game.js:7861-7913`）

---

## R3. 胜负

- **R3.1** 人类胜利：全船维修进度 `prog ≥ 45`。（`js/ai/sanity.js:654-657`、`js/game.js:4815`）
- **R3.2** 人类胜利：4 名异形全部出局（死亡或驱逐）。（`js/game.js:4816`）
- **R3.3** 异形胜利：11 名人类全部死亡/出局。（`js/game.js:4817`）
- **R3.4** 濒死不等于死亡；人类全灭按"活着"计数，濒死者仍算活着（但天亮会失血死）。（`js/game.js:4813-4814`）

---

## R4. 玩家操作（现行键位）

- **R4.1** `W` 交互：收集身边可交互项；只有 1 项直接执行，多项打开轮盘（数字键选择）。（`js/game.js:8048`、`js/game.js:8204-8229`）
- **R4.2** `A` 出刀（仅异形；人类提示"按 B 开枪"）、`B` 开枪、`H` 破坏（仅异形）、`S` 搜尸/查看伤情、
  `D` 拖拽/放下、`F` 施救、`R` 报告、`V` 监控、`T` 视野切换、`C` 相机、`M` 静音、`ESC` 暂停。（`js/game.js:8043-8058`）
- **R4.3** 交互轮盘包含：维修故障，钻管道（异形），领申请单，补给点兑换，合闸/拉闸，全船监控，
  搜尸/查看记录、拖尸/放下、报告、施救、维修任务点。（`js/game.js:8072-8178`）
- **R4.4** 站桩动作在移动时被打断并清零；玩家操作会弹小游戏（`?test`/旁观/模拟不弹），
  领申请单、补给、搜尸不弹小游戏。（`js/game.js:1239-1294`）

---

## R5. 移动与视野

- **R5.1** 全体活人移动速度 4.0 格/秒；拖尸 2.5 格/秒；玩家幽灵 6.5 格/秒，AI 幽灵巡游 2.4 格/秒
  （走向自己的任务点时 6.5）；幽灵均可穿墙。（`js/t2/space.js:124-127`、`js/game.js:804-808`、`js/game.js:2394-2441`）
- **R5.2** 异形放倒人后获得 2 秒、×1.5 的逃逸加速（仅异形；拖尸时不生效；与红身 1.5 秒是两套计时器）。
  （`js/ai/sanity.js:139-143`、`js/game.js:804-818`）
- **R5.3** 视野玩家与 AI 完全一致：同亮舱整间可见；同亮走廊整条可见；亮舱看相连走廊需 LOS；
  近身圆人类 2.3 格 / 异形 3.5 格；手电锥 7 格、60°；全部需要 LOS。（`js/ai/sanity.js:97-111`、`js/game.js:1809-1848`）
- **R5.4** 断电时舱室全暗（会议室除外）、走廊灯全熄。（`js/game.js:700-710`）
- **R5.5** 自动门：默认关闭；活人进入 3 格内滑开，离开 3.6 格后关闭；关门同时阻挡移动与视线；
  断电期间每扇门需 2 秒扫描才放行。（`js/t2/space.js:128-132`、`js/game.js:448-503`）
- **R5.6** 拖尸时移动变慢，且每 1.6 秒发出一次可被 AI 听到的拖拽声（8 格）。（`js/game.js:2532-2546`）

---

## R6. 任务、维修进度与申请单

- **R6.1** 每人只能修"自己的 4 个任务点"；高难点 2 分、普通点 1 分；站桩时长取任务点 `dur`（4~10 秒）。
  （`js/game.js:4453-4500`、`js/data/map.js:27`）
- **R6.2** 任务可以乱序完成：结算时把实际修的点交换到当前 `tIdx` 槽位，保证 `[0,tIdx)` 都是已完成的。
  （`js/game.js:4453-4476`）
- **R6.3** 全船进度 `prog` 上限 45；幽灵完成任务**同样**推进全船进度，但受幽灵个人额度限制（见 R6.7）。（`js/game.js:4486-4488`）
- **R6.4** 个人进度达到 3 分、5 分时，各获得 1 份"待领取物资申请单"；每人全局最多 2 份。（`js/game.js:4503-4504`）
- **R6.5** 申请单在中央会议室圆桌处**交互即领**，无站桩、无小游戏；每人可持有的申请单上限 2。（`js/game.js:4347-4356`、`js/ai/sanity.js:663`）
- **R6.6** 补给点兑换：军械补给点花 1 张申请单、站桩 5 秒 → 子弹补到 1；医疗补给点花 1 张、站桩 3 秒 →
  医疗包补到 1；都是"补到 1"，不叠加。（`js/ai/sanity.js:664-665`、`js/game.js:4394-4414`）
- **R6.7** 幽灵任务额度：每只幽灵最多 **1 分**（`GHOST_TASK_CAP=1`）；高难点 2 分因此做不了；
  幽灵做任务站桩时长 ×1.6；异形幽灵**不能**修任务。（`js/t2/space.js:36-41`、`js/game.js:8083-8091`）
- **R6.8** 配电室的"电路维修"（高难，10 秒）完成后全船照明恢复（`powerFixed=true`）；
  此后拉闸仍然有效，但合闸时间从 4.5 秒缩短到 3 秒。（`js/game.js:4508-4516`、`js/game.js:712`）

---

## R7. 设施与资源

### R7.1 电闸

- **R7.1.1** 电闸在配电室；拉闸/合闸都要站桩。拉闸时长：本夜第 1/2/3 次 = 3/6/9 秒，第 4 次起恒 9 秒。
  （`js/game.js:713-723`）
- **R7.1.2** 合闸时长：电路未修 4.5 秒；电路已修 3 秒。（`js/game.js:711-712`）
- **R7.1.3** 断电效果：全船变暗（仅会议室亮）、走廊灯全熄、监控信号中断、所有门需 2 秒扫描。
  （`js/game.js:700-710`、`js/game.js:758-762`）
- **R7.1.4** 人类看见"拉闸断电"= 身份级确证（近距离）；人类看见"合闸"只加正向信任、不确证。
  （`js/game.js:1909-1916`、`js/game.js:1952-1955`）

### R7.2 管道

- **R7.2.1** 只有异形能钻管道；必须站在管道口 1.6 格内；选择任意另一个出口瞬移过去。（`js/game.js:910-970`）
- **R7.2.2** 冷却 20 秒，玩家与 AI 共用同一个冷却。（`js/ai/sanity.js:693-695`）

### R7.3 监控

- **R7.3.1** 必须在监控室或监控台 1.8 格内才能打开；断电时信号中断（先合闸）。（`js/game.js:1016-1035`）

### R7.4 保安机器人

- **R7.4.1** 保安机器人按 4 点巡逻，速度 1.6 格/秒；视野 6 格、前方 180°、需 LOS。（`js/game.js:4555-4560`、`js/game.js:4604-4616`）
- **R7.4.2** 有人在它面前做出"危险行为"（出刀、开枪；破坏不触发）会被追逐 → 压制 0.9 秒 →
  押送到军械库角落拘留 30 秒。（`js/game.js:4622-4688`、`js/game.js:4254`、`js/game.js:8337`）
- **R7.4.3** 每夜最多擒拿 2 次；被押送/拘留期间不能行动；30 秒后自动释放。（`js/game.js:4560`、`js/game.js:2255-2264`）
- **R7.4.4** 保安机器人可被刀砍（2 点装甲）或枪击/破坏技停摆。（`js/game.js:8375-8384`、`js/game.js:8231-8245`）

### R7.5 医疗无人机

- **R7.5.1** 悬停在医疗间正中央；只有**医疗间内**的濒死者会被救；飞近到 1.15 格内开始治疗，满 7 秒拉起。
  （`js/game.js:4689-4700`、`js/game.js:4718-4788`）
- **R7.5.2** 每夜 2 次充电；被救起后 3 秒内不能移动（可发言/交互）。（`js/game.js:145`、`js/game.js:4763-4765`）
- **R7.5.3** 医疗无人机可被刀砍（1 点装甲）或破坏技停摆；救治不产生情报广播。（`js/game.js:4777-4782`）

---

## R8. 战斗、倒地、死亡与尸体

- **R8.1** 每人每夜 1 把刀；出刀必须"目标活着且未倒地"，刀程 1.35 格 + LOS；**没有阵营限制**（异形可互刀）。
  （`js/game.js:4249-4257`、`js/ai/sanity.js:677`）
- **R8.2** 出刀只把人打成**濒死**（`downed=true`），不是死亡；刀者获得 1.5 秒红身（目击者据此确证）。
  （`js/game.js:4276`、`js/ai/sanity.js:81`）
- **R8.3** 开枪：需要 1 发子弹、目标活着且未倒地、射程 9 格 + LOS；同样只打成濒死。
  （`js/game.js:8329-8360`、`js/ai/sanity.js:686-690`）
- **R8.4** 子弹来源：补给点兑换（补到 1）、搜尸、第 10 夜终结者时刻（补到 1）；开局 0 发。
  （`js/game.js:4405-4414`、`js/game.js:7851`）
- **R8.5** 濒死状态没有倒计时：一直持续到被救或天亮；天亮时所有濒死者因失血死亡。（`js/game.js:2309-2310`、`js/game.js:4528`）
- **R8.6** 死亡后：尸体留在原地（`bodyPos` 固定），幽灵可穿墙移动；被驱逐者没有尸体。（`js/game.js:4308-4320`）
- **R8.7** 拖拽：可拖尸体或濒死者；拖拽速度 2.5 格/秒；拖拽者与尸体绑定移动。（`js/game.js:2481-2524`）
- **R8.8** 搜尸/查看伤情：站桩 1.2 秒；第一次搜得到伤口与时间线记录；尸体上未花掉的子弹/医疗包/申请单可被取走
  （子弹/医疗包补到 1，申请单补到 2，死者未领的申请单一并继承）。（`js/game.js:4358-4393`、`js/game.js:2129-2147`）
- **R8.9** 施救：需要医疗包，站桩 5 秒，救起濒死者并消耗 1 个医疗包。（`js/game.js:4434-4452`、`js/ai/sanity.js:661`）

---

## R9. 破坏与故障

- **R9.1** 异形每夜最多破坏 1 次（`sabUsed`）；目标舱室不能是会议室、且不能已有故障；
  停摆机器人也消耗这一次额度。（`js/game.js:1087-1089`、`js/game.js:1160-1178`、`js/game.js:8231-8233`）
- **R9.2** 破坏落点：该舱室的任务点里**均匀随机**抽一个设备；同一夜同舱室缓存同一个落点。
  （`js/game.js:1094-1113`）
- **R9.3** 触发条件：异形 AI 进入目标舱室即引爆；玩家在目标舱内、或距落点 1.7 格内都能引爆。
  （`js/game.js:1320-1328`、`js/game.js:4079-4082`、`js/ai/sanity.js:678`）
- **R9.4** 破坏后故障存活 30 秒；30 秒内没人修完 → 全船维修进度 -5；天亮后未修完的故障消失且**不扣分**。
  （`js/ai/sanity.js:668`、`js/game.js:1295-1316`、`js/game.js:4530-4531`）
- **R9.5** 修复故障：站桩 10 秒；修好瞬间同一故障的所有人立即松手；幽灵不能修故障。
  （`js/ai/sanity.js:660`、`js/game.js:1190-1236`）
- **R9.6** 破坏会广播：附近听见、环境证据、破坏目击；幽灵破坏不写目击证据，但故障/警报/声音照常。
  （`js/game.js:1181-1186`）

---

## R10. 报告与会议

- **R10.1** 报告距离 2.4 格；必须靠近"未报告的身体"（尸体或濒死者）。（`js/game.js:4901-4910`）
- **R10.2** 每人全局 2 次夜晚报告额度；每夜最多 2 场夜晚会议；先检查额度再消耗。（`js/ai/sanity.js:541-544`、`js/game.js:4911-4914`）
- **R10.3** 同一具尸体同一夜只能报一次；同一个**还活着的濒死者**按"本次倒下"只报一次（救起后再倒才算新）。
  （`js/t2/decision.js:143-152`）
- **R10.4** 会议开始清场：清所有路径与屏幕遮罩、松手所有拖拽、关监控/管道/破坏选择；
  夜晚会议保留站桩进度，白天会议打断一切。（`js/game.js:6957-6970`、`js/game.js:4526-4548`）
- **R10.5** 白天会议全员被刷新到会议室；夜里会议是"远程"，人不移动。（`js/game.js:4534-4548`）
- **R10.6** 会议三段：讨论 → 投票（5 秒等待）→ 公布（3 秒）；开局讨论不投票。（`js/ai/sanity.js:545-553`）

---

## R11. 认知与证据

- **R11.1** AI 只记录自己看见/听见/搜查到的事实；`mates`（认出队友）只由目击"异形专属行为"推断，不读系统阵营表。
  （`js/game.js:1409-1411`、`js/game.js:1978-1987`）
- **R11.2** 证据权重（进入嫌疑分）：出刀 0.75、枪击 0.55、钻管道 0.70、破坏 0.65、停摆机器人 0.60、
  拉闸 0.32、拖尸 0.22、把尸体拖离医疗间 0.45、拘留 0.60、**出刀红身 0.85**、假装做任务 0.30、
  放弃任务 0.14；听见：刀 0.18、枪 0.16、尖叫 0.22、断电 0.14、机器人 0.12、管道 0.20、门 0.04、
  拘留 0.60、拖拽 0.12；环境：灯 0.10、故障 0.12、机器人 0.14。（`js/game.js:1413-1418`）
- **R11.3** 亲眼确证（写 `known`）：目击"异形专属行为"（出刀/钻管道/破坏/停摆机器人/拉闸断电）且距离 ≤ **4.5 格**；
  隔远看见只按权重加嫌疑，不写确证。（`js/ai/sanity.js:770-773`、`js/game.js:1934-1973`）
- **R11.4** 开出刀/开枪时若目击者已确证死者是异形，这一枪/一刀记为"处决"，不当作凶手证据。（`js/game.js:1942-1948`）
- **R11.5** 目击认错人：**20%** 概率把确证指向目击范围内另一个可见的人（不会指到看不见的人）；
  只改 `known` 指向，不改已落下的嫌疑分。（`js/ai/sanity.js:788-790`、`js/game.js:1955-1970`）
- **R11.6** 传闻失真：说出口的证言可能记错舱室（22%）、记混动作（18%），记错后该条证言的嫌疑权重 ×0.78；
  只作用于转述/传闻，亲眼目击不变。（`js/ai/sanity.js:801-806`、`js/game.js:7349-7378`）
- **R11.7** 注意力窗口：每个听众最多保留最近 **10 条**"听来的证词"，新证词顶掉最旧的；
  亲眼目击不进这个池子；背书不占额度。（`js/ai/sanity.js:867-869`）
- **R11.8** 时间线拆谎：口供只在"对应时间窗"内比对；窗口内只要有一条位置记录与口供一致，口供就成立；
  全部对不上才算矛盾，且证据取最接近参照时刻的那条；走廊/未知区域不算"在舱室"。（`js/ai/sanity.js:713-759`）

---

## R12. 嫌疑、信任与情绪

- **R12.1** 嫌疑 `sus` 按证据累加，单条权重见 R11.2；每条证据同时记账理由（会议引用）。
- **R12.2** 跨夜衰减：目击类 ×0.72/夜，传闻类 ×0.45/夜；本夜完全无新证据再 ×0.55；低于 0.05 遗忘；
  跨夜存量上限 0.55；夜间行动（开枪/报警）读取存量时再 ×0.70。（`js/ai/sanity.js:895-907`）
- **R12.3** 准-确证"基本是异形"（`almost.foe`）：嫌疑 ≥ 0.50、证据种类 ≥ 2、至少 1 条实证、证据来自本夜或上一夜。
  （`js/ai/sanity.js:917-954`）
- **R12.4** 准-确证"基本是好人"（`almost.friend`）：信誉 ≥ 0.50、正经行为种类 ≥ 2、新鲜度同上。
  （`js/ai/sanity.js:917-954`）
- **R12.5** 传闻最多补 1 个"证据种类"，但**不能**单独构成准-确证：必须至少有一条自己看见/查到的实证。
  （`js/ai/sanity.js:944-953`）
- **R12.6** 正向信任 `cred`：来自被目击的正经行为——修好故障 0.20、救人 0.16、拖到医疗间 0.16、
  合闸 0.12、做完任务 0.12；假装修理 = 修好故障、假装做事 = 做完任务（**真假同价**），因为目击者看到的行为一样。
  每夜 ×0.92，上限 1.2。（`js/ai/sanity.js:311-327`）
- **R12.7** 情绪：被当众指控记 `grudge`（按性格缩放），被当众辩护记 `trust`；`trust ≥ 0.8` 的人"不过票"。
  （`js/game.js:1484-1499`）
- **R12.8** 正向信任的作用：提高指控门槛（`accuseShieldAt=0.35`）、投票回避
  （概率 = min(0.85, cred × 0.55)）、证言权重加成（最高 ×1.6）。（`js/ai/sanity.js:334-336`、`js/ai/sanity.js:1049-1055`）

---

## R13. 会议发言

- **R13.1** 发言内容由**真实经历**组句：去过哪、修过什么、看见谁、目击了谁，不随机抽台词。
  （`js/game.js:4920-4931`）
- **R13.2** 连说让位：同一人连到第 3 句起不再播（真人局里连说五句等于没人听）；台词本局去重降权。
  （`js/game.js:4927-4934`、`js/t2/decision.js`）
- **R13.3** 异形发言硬上限：每场会议最多 6 条（含先发制人、附议）；超出静默丢弃，不进事件流。
  （`js/ai/sanity.js:844-849`）
- **R13.4** 人类优先开口：发言排序分里异形 −1.15；前 3 个自述者至少 2 个人类。
  （`js/ai/sanity.js:844-849`）
- **R13.5** 异形诬陷：有目标时每场会议 **85%** 概率编造具体伪证（出刀 55% / 钻管道 45%）；有确证的听众免疫。
  （`js/ai/sanity.js:366-373`、`js/game.js:5843-6031`）
- **R13.6** 协同诬陷：人类存活 > 异形存活时 55% 触发"多异形共同指控"（最多 3 人，附议权重递减）；
  异形不占少数时 18%。（`js/ai/sanity.js:384-390`）
- **R13.7** 先发制人：每场会议 45% 概率有异形抢先点名；命中时 60% 作为全场第一句话；只进传闻嫌疑（0.22），
  不写 `known`。（`js/ai/sanity.js:821-829`）
- **R13.8** 领袖：每局 22% 概率出现一个"爱指挥"的人（soc ≥ 45，可能是异形）；号召力按
  0（15%）/0.25（50%）/0.65（30%）/1（5%）抽样；每场最多 2 条指令；听众按"号召力 × 对领袖的信任"决定是否照办。
  （`js/ai/sanity.js:423-445`）

---

## R14. 投票与驱逐

- **R14.1** 选民：活着且未濒死的人；玩家自己投票，AI 各自独立投票。（`js/game.js:7535-7536`、`js/game.js:7717`）
- **R14.2** 驱逐门槛：可投票人数 > 7 → 至少 4 票；≤ 7 → 至少 3 票。
  **必须是唯一最高票**；平票或未达门槛 → 无人出局。（`js/ai/sanity.js:563`、`js/game.js:7716-7731`）
- **R14.3** 投票顺序（人类 AI）：① 亲眼确证 → 直接投；② 被当众咬狠（grudge ≥ 0.6）→ 按性格概率反咬；
  ③ 自己公开指控过的人；④ 准-确证"基本是异形"（除恩人/基本好人）；⑤ 明确 suspect；
  ⑥ 两个假说胶着 → 弃权；⑦ 自己嫌疑 ≥ 0.5 的目标；⑧ 按性格弃权；⑨ 跟票（必须自己也有依据，见 R14.4）；
  ⑩ 按开枪门槛 ×0.9 找嫌疑人，仍没有就弃权。（`js/game.js:7545-7662`）
- **R14.4** 跟票必须自己手里有依据：对领先被指控者的嫌疑 ≥ 0.18；或已有 ≥2 人公开咬他时门槛降到 0.10，
  但此时自己必须有"真实证"（沉默/空口/听说/领袖点名/抢先报案都不算）。（`js/game.js:7642-7659`）
- **R14.5** 正向信任护盾：没确证过目标的人，按其 cred 概率弃票（min(0.85, cred×0.55)）。
  （`js/game.js:7664-7682`）
- **R14.6** 准-确证投票侧：`almost.foe` 的票不被信任护盾挡；`almost.friend` 再叠 45% 弃票概率。
  （`js/game.js:7683-7702`、`js/ai/sanity.js:941-943`）
- **R14.7** 异形投票：优先跟公开指控一致；否则按"软指控热靶"顺势（40%）；再否则按"像人类"加权独立挑；
  不会把已认出的队友选成靶子；另有 20% 概率公开指控已认出的队友来换信任（"大义灭亲"）。
  （`js/game.js:7609-7629`、`js/ai/sanity.js:573-592`、`js/ai/sanity.js:622-627`）
- **R14.8** 追责：被驱逐者真是异形 → 投对的人 +0.10 cred；是人类 → 投错的人 -0.14 cred 且 +0.09 嫌疑；
  带头者效果 ×2.2、跟票者 ×0.55。（`js/ai/sanity.js:353-358`、`js/game.js:1585-1646`）

---

## R15. 性格系数（全部行为差异的来源）

> 表中数值是"中性档（50）"的基线；`b(axis)` 把档位映射到 [-1,1] 并乘 `TRAIT_GAIN=0.45`。
> 依据：`js/ai/traits.js:61-115`。

| 行为 | 系数公式（中性档基线） | 含义 |
|---|---|---|
| 异形挑目标的目击者惩罚 | 12 × (1 − 0.55·aggr + 0.45·caut) | 激进不怕被看，谨慎躲远 |
| 异形挑"正在做事的人" | −12 × (1 + 0.35·aggr) | 激进更爱扑做事的人 |
| 异形出刀距离 | 1.3 × (1 + 0.22·aggr) | 激进敢更远出手 |
| 异形目击者旁出手胆量 | 0.50 ± 0.16（夹在 0.30~0.72） | 只在理性线内浮动 |
| 人类开枪门槛 | 0.50 − 0.14·aggr + 0.10·caut | 激进 0.36、谨慎 0.60 |
| 投票弃权率 | 0.52 − 0.34·aggr + 0.18·caut | 激进 0.18、谨慎 0.70 |
| 开局错峰延迟 | (2~8 秒) × (1 − 0.45·aggr + 0.30·caut) | 激进一进夜就冲 |
| 弃修逃跑阈值 | 1 + 0.60·aggr | 激进多站一会儿 |
| 搜尸意愿 | 1 + 0.70·cur | 好奇更爱翻 |
| 替人辩护 | min(0.92, 0.55 + 0.30·soc + 0.10·aggr) | 社交更爱护人 |
| 跟票 | min(0.95, 0.60 + 0.28·soc + 0.15·aggr) | 社交更容易跟 |
| 异形顺势踩 | pileOn × (1 + 0.35·soc + 0.20·aggr − 0.15·caut) | 看场上的程度 |
| 记仇强度 | 1 + 0.45·aggr + 0.20·caut | |
| 记恩强度 | 1 + 0.40·soc | |
| 情绪投票拉力 | 6 × (1 + 0.5·aggr) / 5 × (1 + 0.5·soc) | 记仇/记恩 |

---

## R16. 关键数值总表（便于逐行核对）

| 项 | 值 | 依据 |
|---|---|---|
| 夜长 | 75 秒 | `sanity.js:652` |
| 胜利分 | 45 | `sanity.js:655` |
| 故障惩罚 | −5 | `sanity.js:656` |
| 站桩：修故障 / 施救 / 搜尸 / 领单 / 换弹 / 取包 | 10 / 5 / 1.2 / 0 / 5 / 3 秒 | `sanity.js:659-665` |
| 故障窗口 | 30 秒 | `sanity.js:668` |
| 近身：刀 / 破坏 / 维修 | 1.35 / 1.7 / 2.0 格 | `sanity.js:672-680` |
| 枪：射程 / 追猎（确证/嫌疑） | 9 / 14 / 10 格 | `sanity.js:686-690` |
| 异形开枪概率 | 0.7 | `sanity.js:689` |
| 管道冷却 | 20 秒 | `sanity.js:693-695` |
| 报告：距离 / 每人次数 / 每夜场次 | 2.4 格 / 2 次 / 2 场 | `game.js:4903`、`sanity.js:541-544` |
| 会议：开局 / 白天 / 夜会 | 50 / 60+5+3 / 35+5+3 秒 | `sanity.js:548-553` |
| 驱逐：>7 人需 4 票；≤7 人需 3 票 | — | `sanity.js:563` |
| 红身 | 1.5 秒 | `sanity.js:81` |
| 击杀加速 | 2 秒 ×1.5（仅异形） | `sanity.js:139-143` |
| 视野：人类近身 / 异形近身 / 手电 / 走廊整条 | 2.3 / 3.5 / 7（60°）/ 12 格 | `sanity.js:97-111` |
| 移动 / 拖尸 / 幽灵 | 4.0 / 2.5 / 6.5 格/秒 | `space.js:124-127`、`game.js:2276-2277` |
| 门：开 / 关 / 速度 / 宽 / 通过阈值 | 3.0 / 3.6 / 4.0 / 1.8 / 0.6 | `space.js:128-132` |
| 保安：视野 / 半角 / 拘留 / 每夜次数 | 6 格 / 90° / 30 秒 / 2 次 | `game.js:4560` |
| 医疗无人机：治疗 / 贴身 / 飞行 / 每夜次数 / 救起眩晕 | 7 / 1.15 / 4.6 / 2 / 3 秒 | `game.js:4694-4700`、`game.js:145` |
| 幽灵任务额度 | 1 分 | `space.js:36` |
| 终结者时刻 | 第 10 夜，子弹补到 1 | `sanity.js:637-641` |
| 准-确证门槛 | 0.5 / 2 种 / 近 2 夜 | `sanity.js:925-932` |
| 开枪门槛（性格） | 0.36~0.60 | `traits.js:82` |
| 弃权率（性格） | 0.18~0.70 | `traits.js:88` |
| 注意力窗口 | 10 条传闻 | `sanity.js:868` |
| 认错人 | 20% | `sanity.js:789` |
| 描述失真 | 舱室 22% / 动作 18% / 权重 0.78 | `sanity.js:802-805` |
| 异形发言上限 | 6 条/场 | `sanity.js:847` |
| 诬陷概率 | 85%（有目标） | `sanity.js:371` |
| 协同诬陷 | 55%（人类多数时）/ 18% | `sanity.js:385-386` |
| 先发制人 | 45% / 60% 首句 / 权重 0.22 | `sanity.js:822-824` |
| 领袖出现率 | 22% | `sanity.js:424` |
| 性格压缩 | 0.45 | `sanity.js:37` |

---

## R17. 评审与修改流程

1. **规则本身是否符合设计意图**（尤其 R2.7 会议清尸、R8.7 拖拽、R10.3 报告一次性、R14.2 驱逐门槛）。
2. **评审只做批注，不直接改文字**：本文是设计者的口径，**只有设计者明确说要改**，才动对应条目。
3. **实现落后于本文**（`js/` 或 3D 与本文不一致）：以实现侧为缺陷方修正，修正后在对应条目补一行
   「实现已对齐（日期 / 位置）」，而不是把本文改成实现的样子。
4. 若设计者裁定规则本身要变：先改本文 → 再改 `js/` → 再重导 3D 数据链 → 最后跑门禁。

---

## R18. 与 3D 版的关系（再次强调）

- 3D 版是 2.5D 的**延伸**；**规则语义以本文为设计口径**，`js/` 与 3D 都是它的实现。
- 3D 的翻译路径：读本文对应条目 → 在 `js/` 找现行实现与行号 → 在 3D 逐函数移植 →
  用 `3d/spec/mapping-ledger.json` 记录目标；实现与本文冲突时，按本文修正并留痕。
- 3D 门禁仍然核对 `js/` 源码与账本（保证「实现没有偷偷漂移」），但**判对错的标准是本文**。

---

## R19. 美术 / 建模 / 音频：提示词正文（设计口径）

- **R19.1** 本节是美术资产**提示词的权威正文**：模型、贴图、音频按这些提示词产出；
  生成结果与提示词不符时，改生成物或重跑，**不能反向改提示词**迁就现有素材。
- **R19.2** **修改只在设计者明确指示下进行**。`3d/assets/**/manifest*.json` 里的 `prompt` 是
  生成时的**执行快照**（脚本会读它重跑）；若与本节不一致，以本节为准，并在下次重生成时回填。
- **R19.3** 生成环境（只登记，不改口径）：Qwen-Image 2.1 Turbo Q4_K_M GGUF + Qwen3-VL-8B-Instruct
  + qwen_image_2.1_vae；运行器 stable-diffusion.cpp（Vulkan，本机 RTX 5060 Laptop）；
  许可 Qwen Research License（**非商用**）。**SDXL 已退役**，历史产物只作风格对照。
- **R19.4** 通用负向提示词（平铺材质 / 天花板 / 装甲共用）：
  `perspective, 3d object, product photo, shadow, gradient, vignette, white background, border, frame, text, watermark, logo, signature, person, hand, face, cartoon, sketch, oversaturated, blurry, lowres`；
  材质版额外加 `blade shape, handle`。角色面部负向词见 R19.7。
- **R19.5** 平铺材质通用尾缀（所有材质 / 天花板 / 装甲 prompt 必带，正文里已内联，新增也必须带）：
  `seamless flat texture map, orthographic top-down view, evenly lit with no shadow, fills the entire frame edge to edge, no object outline, no background, no perspective, tileable, high detail`。

### R19.6 角色参考（crew_refs，3 条）

- **crew-turnaround_768.png**（seed 20261206）：`adult spaceship crew member, slim athletic build, 1.75 m tall, short dark hair, no helmet, pale grey utility jumpsuit with coral-red chest harness, shoulder panels and knee pads, dark utility boots, small black backpack, matte fabric with clean seams, soft utilitarian sci-fi uniform, neutral friendly face, full body, character turnaround reference sheet, front view, three-quarter view and back view of the same character, standing neutral A-pose, orthographic full-body views, evenly spaced, plain light neutral grey background, front and back clearly readable, concept art for 3D low-poly modeling, matte flat lighting, no text`
- **crew-variants_768.png**（seed 20261207）：`three spaceship crew members standing side by side, same slim 1.75 m body type and utility jumpsuit design, three colorways: pale grey with coral red, olive with amber, steel blue with teal, short hair, no helmets, no armor, full body neutral pose, plain light grey background, character lineup concept art for 3D low-poly modeling, evenly lit, no text`
- **crew-detail_768.png**（seed 20261208）：`character design detail sheet of the same sci-fi utility jumpsuit, chest harness, belt pouches, knee pads, dark boots, rolled sleeves, fabric seams, matte materials, pale grey with coral red accents, neutral grey background, three-quarter view, close-up, concept art for 3D modeling, no text`

### R19.7 角色面部（6 条）

负向词：`side view, profile, three quarter view, open mouth, teeth, smile, beard, glasses, hat, helmet, mask, hair covering face, strong shadow, dramatic lighting, cartoon, anime, text, watermark, multiple faces, blurry, lowres`。

- **crew-face_512_s20261141.png**（v1，seed 20261141）：`stylized realistic human face, front view, neutral expression, eyes open, mouth closed, no hair, forehead and cheeks visible, symmetrical, soft even lighting, centered, plain light skin background, video game character face, detailed skin`
- **crew-face_512_s20261142.png**（v1，seed 20261142）：`front view portrait of a calm human face, neutral expression, eyes open, no hair, symmetrical features, smooth skin, even studio light, centered, plain skin background, low-poly game character face texture`
- **crew-face_512_s20261143.png**（v1，seed 20261143）：`human face texture for a game character, front view, neutral, eyes nose mouth, no hair, no beard, no glasses, even lighting, centered, plain skin background, stylized realism`
- **crew-face-v2_512_s20261160.png**（v2，seed 20261160）：`stylized realism video game character face albedo, hand-painted 3D game art, semi-realistic, smooth stylized skin, soft neutral studio light, front view, symmetrical, clean high forehead, no hair, eyes open, mouth closed, neutral expression, plain light warm grey background, centered, male face, strong jaw, calm eyes`
- **crew-face-v2_512_s20261161.png**（v2，seed 20261161）：`stylized realism video game character face albedo, hand-painted 3D game art, semi-realistic, smooth stylized skin, soft neutral studio light, front view, symmetrical, clean high forehead, no hair, eyes open, mouth closed, neutral expression, plain light warm grey background, centered, male face, angular cheekbones, calm eyes`
- **crew-face-v2_512_s20261162.png**（v2，seed 20261162）：`stylized realism video game character face albedo, hand-painted 3D game art, semi-realistic, smooth stylized skin, soft neutral studio light, front view, symmetrical, clean high forehead, no hair, eyes open, mouth closed, neutral expression, plain light warm grey background, centered, male face, soft jaw, calm eyes`

### R19.8 舱室家具参考（10 间，各 1 条）

- **bridge · 中央会议室**（seed 300102）：`game asset reference sheet, isometric three-quarter view, dark industrial sci-fi spaceship interior furniture, seven separate bridge pieces: a large circular command table with a central holographic column, an octagonal structural column, a low sideboard cabinet, a command chair, a navigation console with three angled screens, a long record desk with two monitors, a curved holo screen bank; amber and warm brass accents, brushed dark metal and matte panels, subtle panel seams, rounded edges, neon accent strips, neutral dark grey studio background, soft studio lighting, clean readable silhouettes, high detail, no text`
- **cam · 监控室**（seed 300106）：`game asset reference sheet, isometric three-quarter view, dark industrial sci-fi spaceship interior furniture, five separate security-room pieces: a six-unit codec rack with status LEDs, stacked archive boxes, a 3x3 video wall with an operator desk beneath it, a server cabinet with louvered door, an operations desk with two monitors; cold blue and cyan accents, brushed dark metal and matte panels, subtle panel seams, rounded edges, neon accent strips, neutral dark grey studio background, soft studio lighting, clean readable silhouettes, high detail, no text`
- **ecosys · 生态舱**（seed 300110）：`game asset reference sheet, isometric three-quarter view, dark industrial sci-fi spaceship interior furniture, eight separate hydroponics-bay pieces: a large tree in an octagonal planter, twin glass cultivation tanks on a shared plinth, a long rectangular water pond with raised rim, low shrub planters with glowing flowers, an oxygen generator with two gas cylinders, a three-tier seedling rack, an irrigation console with water tank, a climate control desk with angled screen; botanical green and cyan accents, brushed dark metal and matte panels, subtle panel seams, rounded edges, neon accent strips, neutral dark grey studio background, soft studio lighting, clean readable silhouettes, high detail, no text`
- **power · 配电室**（seed 300108）：`game asset reference sheet, isometric three-quarter view, dark industrial sci-fi spaceship interior furniture, four separate power-distribution pieces: a floor-standing instrument rack with two gauge dials, a switchgear cabinet with three doors and busbar, a transformer with cooling fins and insulators, a breaker bank with twelve lever handles; amber and hazard-yellow accents, brushed dark metal and matte panels, subtle panel seams, rounded edges, neon accent strips, neutral dark grey studio background, soft studio lighting, clean readable silhouettes, high detail, no text`
- **transit · 食堂**（seed 300109）：`game asset reference sheet, isometric three-quarter view, dark industrial sci-fi spaceship interior furniture, five separate mess-hall pieces: a beverage counter with two drink machines and cup tower, a tray-return cart with three slanted rails, a round dining table with two attached stools, a service counter with a glass sneeze guard, a two-tier plate cart with stacked trays; warm amber and cream accents, brushed dark metal and matte panels, subtle panel seams, rounded edges, neon accent strips, neutral dark grey studio background, soft studio lighting, clean readable silhouettes, high detail, no text`
- **fun · 娱乐室**（seed 300101）：`game asset reference sheet, isometric three-quarter view, dark industrial sci-fi spaceship interior furniture, seven separate recreation-room pieces: a curved jukebox with chrome arch and round speaker grille, an arcade cabinet with protruding sloped control deck and lit marquee, a racing simulator seat, a low two-seat sofa, a game table with rails and felt top, a round bar stool, a low coffee table; magenta and cyan accents, brushed dark metal and matte panels, subtle panel seams, rounded edges, neon accent strips, neutral dark grey studio background, soft studio lighting, clean readable silhouettes, high detail, no text`
- **engine · 引擎**（seed 300107）：`game asset reference sheet, isometric three-quarter view, dark industrial sci-fi spaceship interior furniture, six separate engine-room pieces: a cylindrical reactor core with two glowing ring bands and coolant pipes, a bank of four vertical cylinders, an air compressor with horizontal tank and pressure gauge, a fuse panel cabinet with two rows of breakers, a three-tier parts cart, a low tool bench with vise mount; orange and teal accents, brushed dark metal and matte panels, subtle panel seams, rounded edges, neon accent strips, neutral dark grey studio background, soft studio lighting, clean readable silhouettes, high detail, no text`
- **med · 医疗间**（seed 300104）：`game asset reference sheet, isometric three-quarter view, dark industrial sci-fi spaceship interior furniture, six separate medical bay pieces: an operating table with overhead monitor arm, a bedside vital-signs monitor on a stand, a ventilator cart with gas cylinders, a hospital bed with side rails and IV pole, a glass-door medicine cabinet, a autoclave sterilizer with round door; clean white and cyan accents, brushed dark metal and matte panels, subtle panel seams, rounded edges, neon accent strips, neutral dark grey studio background, soft studio lighting, clean readable silhouettes, high detail, no text`
- **armory · 军械库**（seed 300105）：`game asset reference sheet, isometric three-quarter view, dark industrial sci-fi spaceship interior furniture, six separate armory pieces: a long rifle rack with three tiers of rifles, a gunsmith workbench with vise, a shooting lane barrier with paper target, stacked ammunition crates, an issue counter with steel grille, a bench vise station; amber warning accents, brushed dark metal and matte panels, subtle panel seams, rounded edges, neon accent strips, neutral dark grey studio background, soft studio lighting, clean readable silhouettes, high detail, no text`
- **warehouse · 仓库**（seed 300103）：`game asset reference sheet, isometric three-quarter view, dark industrial sci-fi spaceship interior furniture, six separate warehouse pieces: tall industrial pallet racking with crates and barrels, a logistics terminal desk with two screens, a pallet stack, a packing bench with pegboard, a roller conveyor receiving station with scan arch; amber and hazard-yellow accents, brushed dark metal and matte panels, subtle panel seams, rounded edges, neon accent strips, neutral dark grey studio background, soft studio lighting, clean readable silhouettes, high detail, no text`

### R19.9 天花板（10 条）

- **bridge_768.png**（seed 20261171）：`spaceship command bridge ceiling deck panels, cool light grey pressed steel with recessed rectangular panels, slim cable conduits along seams, clean minimal wear, cool blue-grey tint, seamless flat texture map, orthographic top-down view, evenly lit with no shadow, fills the entire frame edge to edge, no object outline, no background, no perspective, tileable, high detail`
- **cam_768.png**（seed 20261172）：`surveillance room ceiling deck, blue-grey pressed steel panels with perforated vent sections and slim cable ducts, cool cyan sheen on seams, clean industrial, seamless flat texture map, orthographic top-down view, evenly lit with no shadow, fills the entire frame edge to edge, no object outline, no background, no perspective, tileable, high detail`
- **ecosys_768.png**（seed 20261173）：`hydroponics bay ceiling deck, green-grey painted steel panels with ventilation grille sections, faint moisture wear near seams, matte painted finish, seamless flat texture map, orthographic top-down view, evenly lit with no shadow, fills the entire frame edge to edge, no object outline, no background, no perspective, tileable, high detail`
- **power_768.png**（seed 20261174）：`electrical power room ceiling, dark steel deck panels with heavy bolted cable trays and conduit runs, small junction boxes, faded caution yellow accents, sooty industrial wear, seamless flat texture map, orthographic top-down view, evenly lit with no shadow, fills the entire frame edge to edge, no object outline, no background, no perspective, tileable, high detail`
- **transit_768.png**（seed 20261175）：`transit hub corridor ceiling deck, warm grey pressed steel panels with fine seam lines, subtle edge wear, neutral industrial finish, seamless flat texture map, orthographic top-down view, evenly lit with no shadow, fills the entire frame edge to edge, no object outline, no background, no perspective, tileable, high detail`
- **fun_768.png**（seed 20261176）：`crew recreation room ceiling deck, purple-grey painted steel panels with flush recessed light coves, smooth clean semi-matte finish, subtle scuffs, seamless flat texture map, orthographic top-down view, evenly lit with no shadow, fills the entire frame edge to edge, no object outline, no background, no perspective, tileable, high detail`
- **med_768.png**（seed 20261177）：`medical bay ceiling, clean matte white perforated steel panels, seamless hygienic joints, faint cool blue seam glow, sterile medical grade, almost no wear, seamless flat texture map, orthographic top-down view, evenly lit with no shadow, fills the entire frame edge to edge, no object outline, no background, no perspective, tileable, high detail`
- **engine_768.png**（seed 20261178）：`engine room ceiling, dark sooty heavy steel deck panels, heat stain discoloration, oil grime around bolts, heavy industrial machinery hall, faded orange markings, seamless flat texture map, orthographic top-down view, evenly lit with no shadow, fills the entire frame edge to edge, no object outline, no background, no perspective, tileable, high detail`
- **armory_768.png**（seed 20261179）：`armory ceiling deck, olive grey armored steel panels, recessed bolt lines and tie-down rails, weapon bay industrial, hard edge wear, seamless flat texture map, orthographic top-down view, evenly lit with no shadow, fills the entire frame edge to edge, no object outline, no background, no perspective, tileable, high detail`
- **warehouse_768.png**（seed 20261180）：`cargo warehouse ceiling deck, blue-grey steel panels with mesh reinforcement strips, scuffed paint, forklift-grade cargo wear, seamless flat texture map, orthographic top-down view, evenly lit with no shadow, fills the entire frame edge to edge, no object outline, no background, no perspective, tileable, high detail`

### R19.10 材质与装甲（7 条）

- **knife-blade**（seed 20261112）：`brushed stainless steel surface with fine linear grind marks and sparse shallow scratches, cool grey metal, matte industrial finish, seamless flat texture map, orthographic top-down view, evenly lit with no shadow, fills the entire frame edge to edge, no object outline, no background, no perspective, tileable, high detail`
- **knife-grip**（seed 20261113）：`black rubber grip surface with fine cross-hatch knurling, matte finish, faint dust inside the grooves, dark charcoal tone, seamless flat texture map, orthographic top-down view, evenly lit with no shadow, fills the entire frame edge to edge, no object outline, no background, no perspective, tileable, high detail`
- **crew-fabric**（seed 20261114）：`light grey twill service-uniform fabric, tight diagonal weave, matte cotton blend, faint pilling and soft fold shading, seamless flat texture map, orthographic top-down view, evenly lit with no shadow, fills the entire frame edge to edge, no object outline, no background, no perspective, tileable, high detail`
- **crew-webbing**（seed 20261115）：`coral red nylon webbing strap, dense woven ribs, matte synthetic fibre, slight fraying along one edge, seamless flat texture map, orthographic top-down view, evenly lit with no shadow, fills the entire frame edge to edge, no object outline, no background, no perspective, tileable, high detail`
- **crew-leather**（seed 20261116）：`black leather with fine pebbled grain, scuffed matte finish, subtle creases, boot-grade hide, seamless flat texture map, orthographic top-down view, evenly lit with no shadow, fills the entire frame edge to edge, no object outline, no background, no perspective, tileable, high detail`
- **crew-skin**（seed 20261117）：`human skin surface close-up, natural pores and fine lines, warm neutral tone, soft even illumination with no highlights, seamless flat texture map, orthographic top-down view, evenly lit with no shadow, fills the entire frame edge to edge, no object outline, no background, no perspective, tileable, high detail`
- **secbot-paint**（seed 20261135）：`painted steel armor plate surface, matte dark charcoal, chipped edges, fine wear and faint scratches, flat panel, seamless flat texture map, orthographic top-down view, evenly lit with no shadow, fills the entire frame edge to edge, no object outline, no background, no perspective, tileable, high detail`

### R19.11 界面 / 道具

- **console（控制台屏幕）**：`sci-fi spacecraft maintenance console screen, very dark glass, faint teal grid, glowing amber traces, no text, no logo, flat front view`
  （登记在 `3d/ASSETS.md`；许可见对应 `CREDITS`）

### R19.12 房间墙面（10 条房间风格 + 40 条墙面）

规则：墙面 prompt = **房间风格 prompt + ", " + 墙面名称**（`tools/ship-layout-check.cjs` 的 R7 校验前缀）。

**房间风格 prompt**

- **bridge · 中央会议室**（seed 101）：`sci-fi ship briefing room wall panel, warm ivory enamel, thin amber line chart of a return trajectory, brushed bronze frame, no text, flat front view`
- **cam · 监控室**（seed 201）：`spacecraft surveillance room wall plate, cold white-blue enamel, faint cyan grid of camera sectors, thin blue status bars, no text, flat front view`
- **ecosys · 生态舱**（seed 301）：`spacecraft hydroponics bay wall plate, pale green enamel, faint botanical line drawings of leaves and water cycle arrows, soft green glow, no text, flat front view`
- **power · 配电室**（seed 401）：`spacecraft power distribution room wall plate, warm amber enamel, high voltage hazard chevrons and a thin single-line circuit diagram, dark metal frame, no text, flat front view`
- **transit · 食堂**（seed 501）：`spacecraft canteen wall board, warm cream enamel, faint orange menu row lines and simple tray pictograms, thin metal frame, no readable text, flat front view`
- **fun · 娱乐室**（seed 601）：`spacecraft recreation room neon wall sign, pale violet enamel, soft magenta and cyan neon tubing in geometric arcs, dark purple frame, no text, flat front view`
- **engine · 引擎**（seed 701）：`spacecraft engine room wall plate, warm orange enamel, heat hazard stripes and a thin schematic of piston cylinders and pipes, soot stained dark frame, no text, flat front view`
- **med · 医疗间**（seed 801）：`spacecraft medical bay wall panel, clean cool white enamel, faint cyan vital-sign waveform and a thin clinical grid, pale blue frame, no text, flat front view`
- **armory · 军械库**（seed 901）：`spacecraft armory wall plate, warm grey-yellow enamel, thin amber regulation lines and a faint weapon rack silhouette diagram, dark olive frame, no text, flat front view`
- **warehouse · 仓库**（seed 1001）：`spacecraft cargo bay wall plate, neutral grey-white enamel, thin amber slot-number grid and a subtle load-limit scale, steel frame, no readable text, flat front view`

**墙面 prompt（40 条）**

- **bridge__wall__bridge_starchart**（中央会议室 · 返航航线星图，seed 102）：`sci-fi ship briefing room wall panel, warm ivory enamel, thin amber line chart of a return trajectory, brushed bronze frame, no text, flat front view, 返航航线星图`
- **bridge__wall__bridge_crest**（中央会议室 · 舰徽铭牌，seed 103）：`sci-fi ship briefing room wall panel, warm ivory enamel, thin amber line chart of a return trajectory, brushed bronze frame, no text, flat front view, 舰徽铭牌`
- **bridge__wall__bridge_roster**（中央会议室 · 席次铭牌，seed 104）：`sci-fi ship briefing room wall panel, warm ivory enamel, thin amber line chart of a return trajectory, brushed bronze frame, no text, flat front view, 席次铭牌`
- **bridge__wall__bridge_protocol**（中央会议室 · 会议规程屏，seed 105）：`sci-fi ship briefing room wall panel, warm ivory enamel, thin amber line chart of a return trajectory, brushed bronze frame, no text, flat front view, 会议规程屏`
- **cam__wall__cam_sectormap**（监控室 · 舱位编号图，seed 202）：`spacecraft surveillance room wall plate, cold white-blue enamel, faint cyan grid of camera sectors, thin blue status bars, no text, flat front view, 舱位编号图`
- **cam__wall__cam_shiftboard**（监控室 · 值班班次表，seed 203）：`spacecraft surveillance room wall plate, cold white-blue enamel, faint cyan grid of camera sectors, thin blue status bars, no text, flat front view, 值班班次表`
- **cam__wall__cam_wiring**（监控室 · 布线示意，seed 204）：`spacecraft surveillance room wall plate, cold white-blue enamel, faint cyan grid of camera sectors, thin blue status bars, no text, flat front view, 布线示意`
- **cam__wall__cam_statusstrip**（监控室 · 状态灯带，seed 205）：`spacecraft surveillance room wall plate, cold white-blue enamel, faint cyan grid of camera sectors, thin blue status bars, no text, flat front view, 状态灯带`
- **ecosys__wall__ecosys_plantplate**（生态舱 · 植物铭牌，seed 302）：`spacecraft hydroponics bay wall plate, pale green enamel, faint botanical line drawings of leaves and water cycle arrows, soft green glow, no text, flat front view, 植物铭牌`
- **ecosys__wall__ecosys_flowchart**（生态舱 · 水循环示意，seed 303）：`spacecraft hydroponics bay wall plate, pale green enamel, faint botanical line drawings of leaves and water cycle arrows, soft green glow, no text, flat front view, 水循环示意`
- **ecosys__wall__ecosys_scale**（生态舱 · 浇灌刻度，seed 304）：`spacecraft hydroponics bay wall plate, pale green enamel, faint botanical line drawings of leaves and water cycle arrows, soft green glow, no text, flat front view, 浇灌刻度`
- **ecosys__wall__ecosys_humid**（生态舱 · 湿度计面板，seed 305）：`spacecraft hydroponics bay wall plate, pale green enamel, faint botanical line drawings of leaves and water cycle arrows, soft green glow, no text, flat front view, 湿度计面板`
- **power__wall__power_hvstripe**（配电室 · 高压警示条，seed 402）：`spacecraft power distribution room wall plate, warm amber enamel, high voltage hazard chevrons and a thin single-line circuit diagram, dark metal frame, no text, flat front view, 高压警示条`
- **power__wall__power_singleline**（配电室 · 单线接线图，seed 403）：`spacecraft power distribution room wall plate, warm amber enamel, high voltage hazard chevrons and a thin single-line circuit diagram, dark metal frame, no text, flat front view, 单线接线图`
- **power__wall__power_loadplate**（配电室 · 载荷铭牌，seed 404）：`spacecraft power distribution room wall plate, warm amber enamel, high voltage hazard chevrons and a thin single-line circuit diagram, dark metal frame, no text, flat front view, 载荷铭牌`
- **power__wall__power_breakerlabel**（配电室 · 回路编号，seed 405）：`spacecraft power distribution room wall plate, warm amber enamel, high voltage hazard chevrons and a thin single-line circuit diagram, dark metal frame, no text, flat front view, 回路编号`
- **transit__wall__transit_menuboard**（食堂 · 菜单板，seed 502）：`spacecraft canteen wall board, warm cream enamel, faint orange menu row lines and simple tray pictograms, thin metal frame, no readable text, flat front view, 菜单板`
- **transit__wall__transit_servingrule**（食堂 · 配餐规程，seed 503）：`spacecraft canteen wall board, warm cream enamel, faint orange menu row lines and simple tray pictograms, thin metal frame, no readable text, flat front view, 配餐规程`
- **transit__wall__transit_queuemark**（食堂 · 排队标识，seed 504）：`spacecraft canteen wall board, warm cream enamel, faint orange menu row lines and simple tray pictograms, thin metal frame, no readable text, flat front view, 排队标识`
- **transit__wall__transit_ration**（食堂 · 配给告示，seed 505）：`spacecraft canteen wall board, warm cream enamel, faint orange menu row lines and simple tray pictograms, thin metal frame, no readable text, flat front view, 配给告示`
- **fun__wall__fun_neonsign**（娱乐室 · 霓虹招牌，seed 602）：`spacecraft recreation room neon wall sign, pale violet enamel, soft magenta and cyan neon tubing in geometric arcs, dark purple frame, no text, flat front view, 霓虹招牌`
- **fun__wall__fun_machineid**（娱乐室 · 机台编号，seed 603）：`spacecraft recreation room neon wall sign, pale violet enamel, soft magenta and cyan neon tubing in geometric arcs, dark purple frame, no text, flat front view, 机台编号`
- **fun__wall__fun_poster**（娱乐室 · 游戏海报，seed 604）：`spacecraft recreation room neon wall sign, pale violet enamel, soft magenta and cyan neon tubing in geometric arcs, dark purple frame, no text, flat front view, 游戏海报`
- **fun__wall__fun_safetyline**（娱乐室 · 安全提示，seed 605）：`spacecraft recreation room neon wall sign, pale violet enamel, soft magenta and cyan neon tubing in geometric arcs, dark purple frame, no text, flat front view, 安全提示`
- **engine__wall__engine_heatwarn**（引擎 · 高温警示，seed 702）：`spacecraft engine room wall plate, warm orange enamel, heat hazard stripes and a thin schematic of piston cylinders and pipes, soot stained dark frame, no text, flat front view, 高温警示`
- **engine__wall__engine_serviceplate**（引擎 · 检修铭牌，seed 703）：`spacecraft engine room wall plate, warm orange enamel, heat hazard stripes and a thin schematic of piston cylinders and pipes, soot stained dark frame, no text, flat front view, 检修铭牌`
- **engine__wall__engine_pipediagram**（引擎 · 缸体管线图，seed 704）：`spacecraft engine room wall plate, warm orange enamel, heat hazard stripes and a thin schematic of piston cylinders and pipes, soot stained dark frame, no text, flat front view, 缸体管线图`
- **engine__wall__engine_gauge**（引擎 · 压力表盘，seed 705）：`spacecraft engine room wall plate, warm orange enamel, heat hazard stripes and a thin schematic of piston cylinders and pipes, soot stained dark frame, no text, flat front view, 压力表盘`
- **med__wall__med_vitalscreen**（医疗间 · 生命体征屏，seed 802）：`spacecraft medical bay wall panel, clean cool white enamel, faint cyan vital-sign waveform and a thin clinical grid, pale blue frame, no text, flat front view, 生命体征屏`
- **med__wall__med_triagechart**（医疗间 · 急救流程图，seed 803）：`spacecraft medical bay wall panel, clean cool white enamel, faint cyan vital-sign waveform and a thin clinical grid, pale blue frame, no text, flat front view, 急救流程图`
- **med__wall__med_sterilerule**（医疗间 · 消毒规程，seed 804）：`spacecraft medical bay wall panel, clean cool white enamel, faint cyan vital-sign waveform and a thin clinical grid, pale blue frame, no text, flat front view, 消毒规程`
- **med__wall__med_drugindex**（医疗间 · 药品编号，seed 805）：`spacecraft medical bay wall panel, clean cool white enamel, faint cyan vital-sign waveform and a thin clinical grid, pale blue frame, no text, flat front view, 药品编号`
- **armory__wall__armory_regulation**（军械库 · 武器条例铭牌，seed 902）：`spacecraft armory wall plate, warm grey-yellow enamel, thin amber regulation lines and a faint weapon rack silhouette diagram, dark olive frame, no text, flat front view, 武器条例铭牌`
- **armory__wall__armory_ammomark**（军械库 · 弹药标识，seed 903）：`spacecraft armory wall plate, warm grey-yellow enamel, thin amber regulation lines and a faint weapon rack silhouette diagram, dark olive frame, no text, flat front view, 弹药标识`
- **armory__wall__armory_safetyrule**（军械库 · 安全规程，seed 904）：`spacecraft armory wall plate, warm grey-yellow enamel, thin amber regulation lines and a faint weapon rack silhouette diagram, dark olive frame, no text, flat front view, 安全规程`
- **armory__wall__armory_rangegrade**（军械库 · 靶道刻度，seed 905）：`spacecraft armory wall plate, warm grey-yellow enamel, thin amber regulation lines and a faint weapon rack silhouette diagram, dark olive frame, no text, flat front view, 靶道刻度`
- **warehouse__wall__warehouse_slotindex**（仓库 · 货位编号牌，seed 1002）：`spacecraft cargo bay wall plate, neutral grey-white enamel, thin amber slot-number grid and a subtle load-limit scale, steel frame, no readable text, flat front view, 货位编号牌`
- **warehouse__wall__warehouse_outflow**（仓库 · 出库流程图，seed 1003）：`spacecraft cargo bay wall plate, neutral grey-white enamel, thin amber slot-number grid and a subtle load-limit scale, steel frame, no readable text, flat front view, 出库流程图`
- **warehouse__wall__warehouse_zoneplate**（仓库 · 区域标识，seed 1004）：`spacecraft cargo bay wall plate, neutral grey-white enamel, thin amber slot-number grid and a subtle load-limit scale, steel frame, no readable text, flat front view, 区域标识`
- **warehouse__wall__warehouse_loadplate**（仓库 · 安全载荷牌，seed 1005）：`spacecraft cargo bay wall plate, neutral grey-white enamel, thin amber slot-number grid and a subtle load-limit scale, steel frame, no readable text, flat front view, 安全载荷牌`

### R19.13 音频

当前音频为 CC0 采样（`audio/`，见 `audio/LICENSE.txt` / `CREDITS`），**没有生成提示词**。
若改为本地生成，先在 R19 补写提示词与负向词，再产出素材。

---

# 附录 A · AI 引擎释义（下属文本，非权威）

> **地位**：本附录是 R0–R19 的**下属说明**，**不是权威文本**，不参与规则裁定。
> 它回答「2.5D 现行实现在这里是怎么决定的」，并**作为 3D 移植的验收判据**：
> 3D 的 AI 行为是否符合 2.5D 现行设计，按本附录的 H / A 编号与公式判定。
> **判据效力只作用于实现侧**：可用来判「3D 有没有照做」，**不可用来改正文** ——
> 不得据本附录增删、修订 R0–R19 的任何条文、数值或口径，也不得用它反向论证设计该是什么。
> 与正文冲突一律以正文为准；正文不因本附录而改变。
> 2.5D 实现本身是否可疑，由设计者裁定；实现改了，本附录跟随更新，
> 且此前基于它的移植验收结论同时作废、须重跑。
>
> **为什么需要**：正文覆盖的是玩家可感知的结果（视野 / 伤害 / 投票顺序 / 性格系数），
> 没有覆盖「AI 怎么选目标、怎么算分」。所以 `ai_alien.gd:_decide` 这类决策链在 R 条目里
> 无锚可依，行为不对时只能靠玩出来。本附录补这一层，但**不升格为规则**。
>
> 来源：`js/game.js`、`js/ai/traits.js`、`js/ai/sanity.js`（2026-11-14 读数；
> 行号随真源变动，改动后请对照最新源码复核）。

## A.1 两张量化表，别混

| 表 | 回答的问题 | 位置 |
|---|---|---|
| 个人量化表 `SKTrait.C` | 「**我**做这件事值不值」 | `js/ai/traits.js:61` |
| 团队量化表 `SKTeam` | 「这件事**还需要我**做吗」 | `js/ai/traits.js:126` |

两张表都只在一处声明；新增系数加进表里，不回退成 `if` 硬编码。

## A.2 通用决策骨架

每帧对每个 AI 调一次 `aiHuman`（`js/game.js:2807`）或 `aiAlien`（`js/game.js:3745`）。两者开头相同：

1. 会议中 / 对局结束 → 返回（`G.meet || G.over`）。
2. 被保安拘留（`detained`）→ 返回。
3. `dropStaleFix`：手头抢修目标失效则丢弃。
4. **站桩中（`doing>0`）优先递减**，归零后 `finishDoing` 结算；人类做任务时若受威胁，先 `fleeTask`。
5. 开局错峰 `_delay`：小概率走向随机房间；异形概率更低（0.35/s vs 人类 0.45/s）。

这条顺序本身就是行为：**站桩 > 逃跑 > 救援 > 开枪 > 修故障 > 做任务**。

## A.3 人类 AI 优先级链（`aiHuman`，`js/game.js:2807`）

| # | 条件 | 行为 | 行号 |
|---|---|---|---|
| H1 | 正在拖人 | 目标失效 / 医疗无人机不可用 / 已贴近坞位 → 松手；否则拖到 `medDropSpot` | 2836 |
| H2 | 有医疗包，7.5 格内有濒死者且无人正在救 | 走到 1.7 格内站桩 `STAND.revive` | 2852 |
| H3 | 有子弹且有嫌疑目标 | 见 A.3.1 | 2864 |
| H4 | 无医疗包但医疗无人机可用 | 拖视线内（8.5 格）濒死者进医疗间；**排除自己刚打倒的人** | 2902 |
| H5 | 全船断电 | 指定 **1 名**人类合闸（`_lightGo`），站桩 `breakerOnTime()`（断电当夜 4.5 秒，与玩家同一函数） | 2916 |
| H6 | 存在故障 | 选最近故障；**同一故障已有 3 人在赶/在修则跳过**（`SKTeam.FIX_CREW_CAP`） | 2938 |
| H7 | 尸身上有自己缺的物资 | 去翻尸（`lootRun`） | 2960 |
| H8 | 警觉 ≥ 0.7 且刚听到尖叫/枪声/刀声 | 去现场看一眼；到 3 格内或超 10 秒放弃 | 2962 |
| H9 | 有未完成路径 | 继续沿路径走 | 2978 |
| H10 | 有未领的申请单 | 回中央会议室**圆桌**领取（1.8 格） | 2980 |
| H11 | 站在专用补给点且有申请单 | 兑换：缺弹换弹、缺包换包 | 2991 |
| H12 | 确实需要物资（目击凶手缺弹 / 有人濒死缺包） | 主动去对应补给点 | 2997 |
| H13 | 任务全做完 | `aiIdleRoam` 游荡，不原地呆站 | 3011 |
| H14 | 领袖当众下过命令（仅本夜） | 服从概率 = `号召力 × obeyTrustMul(信任)`；没照办记 `orderBroke` | 3018 |
| H15 | 以上都不成立 | 走向下一任务点；< 2.8 格开始站桩 `p.dur` | 3038 |

### A.3.1 人类开枪

```
阈值 thr = SKTrait.C.shootSus(a)        // 0.50 − 0.14·b(aggr) + 0.10·b(caut) → 0.36~0.60
目标"基本确定是异形"  thr ×= ALMOST.foeShootMul
目标"基本是好人"      thr ×= 1.4
夜间用存量嫌疑再打 0.7 折
```

射程与玩家共用 `SKSanity.SHOT.range`（射程是能力，不是意愿）；追击距离：已确证 `chaseKnown`、仅嫌疑 `chaseSus`；开枪后休息 2.5~4.5 秒。

## A.4 异形 AI

### A.4.1 主循环（`aiAlien`，`js/game.js:3745`）

| # | 条件 | 行为 |
|---|---|---|
| A1 | 站桩中 | 递减；假动作（`_doing==='fake'`）结束 → 进冷却 `DISGUISE.cooldown` 并广播信誉（`fakeRepair` / `fakeWork` 分两种 kind） |
| A2 | 开局错峰 | 同人类，概率 0.35/s |
| A3 | 有「重返现场报案」计划 | 先离开做不在场，几秒后回尸体旁；**四周无人时先摸走物资**再拉铃；额度/场次不够则放弃 |
| A4 | 刚杀完人未决定是否演报案 | 每具尸体只掷一次：**有活人目击 15% / 无人看见 40%** 决定演"发现者" |
| A5 | 有队友濒死 | `alienMateRevive` 优先救 |
| A6 | 选猎物 | 排除队友；优先"正在站桩做事的人"；目击惩罚见 A.6 |
| A7 | 有子弹且目标不在刀程 | 开枪（不打队友） |
| A8 | 保安视线规避计时 | 先躲开 |
| A9 | 每 0.5 秒重算计划 | `alienPlan`，取最高分执行 |

> 计划重算用 0.5 秒 CD，**不用事件时钟**：批量模拟/暂停时模拟时钟不走，用 `evNow()` 差值恒为 0，计划会永不重算（实测踩过）。

### A.4.2 效用表（`alienPlan`，`js/game.js:3405-3535`）

```
left   = clamp(G.t / NIGHT, 0.25, 1)   // 夜越往后，主动行为价值越低
walk(d)= d / moveSpeed(a)              // 距离折算成秒
```

| 计划 | 分数 | 前置 |
|---|---|---|
| 拉闸 | `14 · left − breakerOffTime()·1.5 − walk(距离)` | 有闸、未断电、`sabUsed` 未用、本夜没被跳过 |
| 破坏 | `8 · left − walk(距离) − 1`；配电室未断电再 `−4` | `sabUsed` 未用；刚被看见的舱室 8 秒内跳过 |
| 拆机器人 | `8 · left − walk(距离)` | 刀 > 0；保安机器人还需 `secbotRaidOk` |
| 出刀 | `td < knifeReach` → **12**；`td < 5` → **9**；否则 **2** | 刀 > 0 **且**开夜封锁结束；否则恒为 0 |
| 伪装 | `DISGUISE.planValue · disguiseScore − walk(距离)` | 非贴脸可杀、`_fakeCD<=0`、无支援目标、未拖尸、有观众 |

取 `max`；平局顺序：伪装 → 出刀 → 拆机器人 → 拉闸 → 破坏。

**四条被历史裁定钉死的边界**（改动前需设计者确认）：

1. **出刀分必须压过跑图类行为**（贴脸 12、可追 9），否则异形会当着猎物拆设备。
2. **刀用完 `chase` 必须归零**：旧版恒为 12，而拉闸上限 9.5、破坏上限 7.0，
   结果"刀没了"的异形整夜只游荡——效用表被一个常数架空。
3. **贴脸能杀时不演**：伪装进同一张表后，加权观众会把分数抬过 12，异形会放着人不杀去站桩。
4. **当众合闸是小概率通道**：每只异形每夜掷一次（`DISGUISE.breakerChance`），
   仅当断电、有观众、闸可达且当前无更值计划（`best ≤ max(chase, 6)`）时触发；
   它是真合闸（灯会亮、吃 `breakerLoss`），不是免费的 +cred。

### A.4.3 出手前的理智线

拉闸/破坏执行前还要过三道，任一命中即**本夜放弃**（硬条件，不是概率折算）：

```
目击者数 ≥ BREAKER.witnessCap
隐蔽度   < BREAKER.minConceal
周围人数 ≥ BREAKER.crowdN
```

## A.5 团队量化表 `SKTeam`（`js/ai/traits.js:126`）

| 键 | 值 | 作用 |
|---|---|---|
| `FIX_CREW_CAP` | **3** | 同一故障已有 3 人在赶/在修 → 边际收益为负，转去做任务（防踩踏） |
| `BOT_SEC_VALUE` | **8** | 拆保安机器人；低于贴脸出刀 12 与可追 9，身边有猎物时不去拆 |
| `BOT_MED_VALUE` | **8** | 拆医疗无人机（挡救援，价值独立） |
| `BREAKER_VALUE` | **14** | 拉闸价值高于一次破坏（8），否则"1 秒下手"的破坏永远挤掉要站 4.5 秒的拉闸 |
| `SABOTAGE_VALUE` | **8** | 破坏 = 牵制（把人类钉在修复上 10~20 秒），被修掉牵制也已发生 |

## A.6 性格系数 `SKTrait`（`js/ai/traits.js:33`、`:61`）

四轴：`aggr` 激进 / `caut` 谨慎 / `soc` 社交 / `cur` 好奇；中性档 50，
档位分布 `[[28, 0.30], [50, 0.40], [72, 0.30]]`，全部差异再乘 `TRAIT_GAIN = 0.45`（见 R1.8）。

| 系数 | 公式 | 含义 |
|---|---|---|
| `knifeWatcherPenalty` | `12 · (1 − 0.55·b(aggr) + 0.45·b(caut))` | 有目击者时的出刀惩罚 |
| `knifeBusyBonus` | `−12 · (1 + 0.35·b(aggr))` | 优先砍正在站桩做事的人 |
| `knifeReach` | `1.3 · (1 + 0.22·b(aggr))` | 贴脸出刀距离门槛 |
| `knifeBold` | `0.50 ± 0.16`，夹在 `[0.30, 0.72]` | 有目击仍出手的胆量 |
| `knifeWatcherCap` | 取 `KNIFE.witnessCap`，性格不改 | 3 人看见就一定放弃（理智线） |
| `shootSus` | `0.50 − 0.14·b(aggr) + 0.10·b(caut)` | 开枪所需嫌疑分 |
| `voteAbstain` | `0.52 − 0.34·b(aggr) + 0.18·b(caut)` | 弃权率 |
| `delayScale` | `1 − 0.45·b(aggr) + 0.30·b(caut)` | 开局错峰缩放 |
| `fleeThreshold` | `1 + 0.60·b(aggr)` | 危险里多站一会儿的阈值 |
| `lootScale` | `1 + 0.70·b(cur)` | 搜尸/看一眼的意愿 |

## A.7 认知 / 嫌疑 / 投票的实现索引（`js/ai/sanity.js`）

不重复 R11 / R12 / R14 的条文，只列实现函数：

| 函数 | 行号 | 作用 |
|---|---|---|
| `witnessWeight(d,R,busy)` | 45 | 距离越远、目击权重越低 |
| `escapeCost(dist)` | 50 | 逃生代价（异形挑目标时用） |
| `exposure(weights, esc)` | 54 | 曝光度 → 决定敢不敢当众出手 |
| `disguiseRisk(p)` / `disguiseScore(o)` | 263 / 278 | 伪装的收益-风险分 |
| `checkAlibi(mem,o)` | 731 | 口供与时间线比对（对应 R11.8） |
| `beliefEntropy(sus,skip)` | 1033 | 信念熵：置信度是否够"确定" |
| `credVoteShield(cred)` / `credTestimony(cred)` | 1049 / 1053 | 信誉对投票与证词的作用 |

## A.8 3D 对照点

| 2.5D | 3D |
|---|---|
| `aiHuman`（game.js:2807） | `3d/preview/scripts/sim/ai_human.gd` |
| `aiAlien` + `alienPlan` | `3d/preview/scripts/sim/ai_alien.gd`（`_decide` 效用表） |
| `SKTrait` / `SKTeam` | `3d/preview/data/rules.json#tables`（由 `export-rules.cjs` 导出） |
| `SKSanity.*` | `3d/preview/scripts/sim/mind.gd` |
| 保安 / 医疗无人机 | `3d/preview/scripts/sim/bots.gd` |
| 发言组句 | `3d/preview/scripts/sim/speech.gd` |

移植时按本附录逐条对照，不凭"看起来像"；3D 侧改动应附
`@src js/game.js:<行号> <函数>` 注释，`npm run src:check` 会回读校验。

## A.9 维护

1. 本附录**只在设计者指示下修改**，与正文同口径；任何人（含 AI）不得顺手修订。
2. 本附录跟随 **2.5D 实现**更新：实现改了它跟着改；**不得反向要求实现**。
3. 新增常数一律进 `SKTrait.C` 或 `SKTeam`，不写进 `if`。
4. 本附录是 **3D 移植的验收判据（仅实现侧）**，不是规则裁定依据。据此得出的验收结论必须
   绑定本附录所在文件的哈希（3D 侧记作 `rules_sha`）；哈希一变，旧结论作废、须重跑。
