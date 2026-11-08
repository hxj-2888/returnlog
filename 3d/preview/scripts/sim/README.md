# `scripts/sim/` 模块布局（B1–B5 + S 轨已落地）

> 状态：`sim_state.gd` / `grid_nav.gd` / `ai_human.gd` / `ai_alien.gd` / `crew_view.gd` /
> `bots.gd` / `lines_data.gd` / `mind.gd` / `speech.gd` 全部落地；
> 只剩 `ai_social.gd`（构陷编排 / 完整假设层）仍是计划文件。
> 开始页在 `scripts/home_view.gd` + `home_ship_map.gd`（属 view 层，不在 sim/）。
> 目的：让下一批知道“新代码放哪、叫什么、依赖谁”，避免所有逻辑又堆回 `main.gd`。
> 边界与批次见 `../../MIGRATION.md`；系统清单见 `../../spec/port-manifest.json`。

## 硬规则

1. **不读节点、不读输入、不读鼠标**。`sim/` 里出现 `get_node` / `Input` / `Camera3D` 就是走错了层。
2. **不写数值**。所有常数从 `res://data/{sim,space,map_v2,minigames}.json` 进；
   新增数值先加导出器，再写代码。
3. **事件只追加**。信封与 kind 词表见 `../../spec/events.schema.json`；
   新 kind 先改 schema，再改两端。
4. **确定性**：随机只走 `SimState._rng`，调用方给 seed；不要在 sim 里用 `randf()`。
5. **view 只读**：HUD / 3D 节点只读 sim 的状态与事件，不反向改规则。

## 当前（B1–B5）

| 文件 | 职责 |
|---|---|
| `sim_state.gd` | 开局、15 席、4 异形、任务/申请单、夜计时、刀/濒死/死亡、破坏维修、报告/投票、胜负、事件流 |
| `grid_nav.gd` | 0.6m 可行走网格（walkable=5894）、AStarGrid2D、视线 |
| `ai_human.gd` | 人类 AI：选任务、走路、站桩、领申请单、换补给、修故障、报告尸体 |
| `ai_alien.gd` | 异形 AI：追踪、出刀、每夜一次破坏（无枪/管道/伪装） |
| `bots.gd` | 保安四点巡逻 / 6m 视野抓捕 / 押送拘留 30 秒；医疗无人机救濒死者；HP 与反制 |
| `lines_data.gd` | lines.json 读取 / fillTpl 组合槽 / toneOf / parse_speech 槽位（类级缓存） |
| `mind.gd` | sus / cred / warm / reliability / heard 滑动窗口 / known / almost / 拆谎 |
| `speech.gd` | talkScore 排期 / 去重 / 发言流 / 广播证词 / 玩家自由发言 / AI 回应 |
| `crew_view.gd` | 15 个 billboard + 名牌，按 sim.pos 插值（美术下一批） |

## 计划（按依赖顺序）

| 文件 | 批次 | 职责 | 依赖 |
|---|---|---|---|
| `mind.gd` | B4/B5 | 完整感知、记忆、嫌疑、关系；只存“看见/听见/搜到”的事实 | `sim_state`、`grid_nav` |
| `ai_social.gd` | B4 | 藏尸、目击、伪装审计、暴露度 | `mind` |
| `ai_social.gd` | S 轨续 | 构陷编排 / 领袖剧本 / 完整假设层 / 时间线拆谎 | `mind`、`lines.json` |

> 刀/濒死/死亡、开枪、救起、破坏维修、报告、投票三段、搜尸都还在 `sim_state.gd` 内；
> 超过 ~250 行再拆 `combat.gd` / `body.gd` / `vote.gd`，不要为拆而拆。
> `bots.gd` 是第一个按职责拆出来的模块：它只写位置 / 拘留 / 救人，不改 sus / 胜负。

## 接口约定

```gdscript
# 状态/命令（sim 的公开入口）
sim.new_game(seed, me_idx, map_data, space, player_alien)  # 第 5 参决定玩家是不是异形
sim.tick(dt)
sim.complete_task(agent_i, point_i) -> {ok, pts, prog, qual, power_fix, win, why}
sim.claim_qual(agent_i) / sim.exchange_supply(item, agent_i)
sim.knife(killer_i, victim_i) / sim.shoot(shooter_i, target_i) / sim.revive(agent_i)
sim.sabotage_room(room_id, by) / sim.fix_damage(room_id)
sim.body_near(pos, radius) / sim.search_body(body_i, by)
sim.open_meeting(reporter_i, victim_i) / sim.skip_discussion() / sim.cast_vote(voter_i, target_i)
sim.bots.on_crime(actor_i, at)   # knife / shoot 内部调用，外部不要重复报
sim.speech.player_say(text) -> {ok, slots, responses}
sim.mind.vote_score(voter, target) -> float
sim.start_drag / release_drag / hit_bot / toggle_power / log_account

# view → sim 的输入只走命令；sim → view 只读 state + events
sim.events   # 只追加；不要回写
```

## 每批的验收习惯

- 新模块配一个 `--*test` 无头入口：`--navtest` / `--aittest` / `--meetingtest` /
  `--bottest` / `--b4test` / `--hometest` / `--roletest` / `--speechtest` / `--b6test` 已有；
  断言写在 `main.gd` 的测试分支，不写在 sim 里。
- 每批结束跑 `npm run 3d:port:check` 与 `npm run 3d:events:check`；
  新增源文件必须在 `port-manifest.json` 里被认领，否则校验直接失败。


## 平衡遥测（`--sim1000`）

`main.gd#_run_sim1000` 输出：败因分布（维修 / 异形出局 / 人类全灭 / 超时）、
驱逐次数与命中率、末进度、存活人类/异形、死亡/救起数、超时局人类数，
以及 `ai_alien.gd#stats` 的 `block_cap / block_conceal / block_bold / no_target /
knife_try / knife_ok`。**改判定会挪动随机流，20~50 局只用于定位方向，
正式基线只认同一份代码跑满 200/1000 局的报告。**

2026-11-08 平衡对齐的细节与 9 处真源漂移见 `3d/MIGRATION.md` §9。


## 同源读取（2026-11-08）

`rules_data.gd` 是**推理 / 发言规则的唯一入口**：所有 `mind.gd` / `speech.gd` /
`sim_state.gd` 的阈值都通过 `sim.rules.n/i/b/t/disp/fn/constant` 读 `data/rules.json`，
GDScript 里不写死。`mind.gd` 的函数与 `js/t2/ai.js#SKT2AI` 逐项对应，
对账表在 `3d/spec/parity-map.json`（38 synced / 7 adapter / 25 pending）。
改 `js/` 后必须 `npm run 3d:export:rules && npm run 3d:parity:check`。
