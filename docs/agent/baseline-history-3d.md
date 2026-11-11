> 本文件为 `AGENTS.md` 原章节的**逐字搬迁**（2026-11-11 工程规范化），章节正文未改写。
> 现行口径以根 `AGENTS.md` 与 `docs/ASSET_GOVERNANCE.md` 为准；本文件仅供按需查阅，其中的门禁读数 / 踩坑记录 / 清理记录属于历史，不是现行基线。

## 六、已知问题与门禁读数（2026-11-10 · 第 16 批后实跑）

> 本节是**事实快照**，不是数值真源；后续每批改动后按 §五.3 重新实跑并更新。

### 6.1 P0 · 玩家除移动外无法操作 —— 已修（第四批）

用户 2026-11-09 现场反馈：进入舱段后 WASD / 鼠标视角可用，**其余交互全部无响应**。
同日第四批（详见 `3d/CHANGELOG.md` 第四批）已修复输入链与动作入口：

- **根因**：交互轮盘打开时 `Input.mouse_mode` 仍是 `CAPTURED`，光标锁在屏幕中心，按钮点不动；
  `--e2e` 又用 `skip_discussion()` 绕过开局会议，造成「门禁绿、真人卡住」。
- **修法**：`main.gd::_want_mouse_visible()` + `_refresh_mouse_mode()` 统一鼠标口径（会议 /
  轮盘 / 小游戏 / 管道 / 设置 / 信息面板任一打开即 `VISIBLE`）；`_input()` 补 2.5D
  `SKSettings.isOpen()` / `G.inspect` / `G.camView` 同款守卫；按 `js/game.js#collectInteractions`
  补齐 3D 缺的 5 类动作（施救 / 查看记录 / 全船监控 / 异形破坏 / 机器人状态）。
- **验证**：`npm run check` 6 通过 / 0 失败；`--actiontest` ACTION OK（鼠标相位 5/5 +
  动作入口 5/5，**不靠 `skip_discussion()` 作弊**）；`SIMTEST 26/0`；7 项 Godot 自测 exit 0。
- 排查入口备查：`main.gd` 的 `_input()` / `_update_interaction()` / `_handle_attack()`、
  `player.gd` 的 `_unhandled_input()`、`project.godot`（**无 `[input]` 段**，按键全硬编码
  `physical_keycode` —— 属允许的输入映射差异，不是缺陷）。

**2026-11-10 第 17 批追加（同一入口的语义补齐）**：用户现场「异形按 E 打不倒人、
不知道交互了个啥；DEV 很有必要；你自己写玩家探针」。

- E 轮盘现在在「刀程内最近 + 视线不被挡」的活人身上给出「出刀」，单项 E 直接执行，
  多项 `1-9` 选择；左键仍走准星，两者共用 `sim.knife`。E 的选人口径照 2.5D `stab()`
  （`js/game.js:8243-8248`），并补 `losNow` 同源遮挡判定。
- `F2` DEV 从 port-manifest 的 `excluded` 改为 `partial`：全知卡片栏、无敌
  （刀/枪/死亡/驱逐/保安抓捕）与探针留痕；2.5D 的 `SKInvariants` 运行时断言未迁。
- 新增 `--probetest` / `npm run 3d:probe`：真实 `InputEvent` 按 E / 数字键 / 左键 / F2，
  不直接调 sim 冒充输入；**必须真实窗口**（headless 下 `MOUSE_MODE_CAPTURED` 不成立）。
- 实跑：33 项 Godot 自测 exit 0；`PROBETEST OK 0 项失败`。

### 6.2 门禁读数（2026-11-10 第 17 批后实跑）

| 门禁 | 结果 | 读数 |
|---|---|---|
| `3d:assets` | ✅ | 0 错误 / 3 提醒（3 项 wip 资产源文件未落地） |
| `3d:import:check` | ✅ | 0 差异 |
| `3d:port:check` | ✅ | 0 错误 / 1 警告（`cover_refs.json` 缺 `schema_version`，legacy） |
| `3d:events:check` | ✅ | EVENTS OK |
| `3d:lines:check` | ✅ | LINES OK |
| `3d:parity:check` | ✅ | 全域 63 synced / 7 adapter / 0 pending（`SKT2AI` 38 synced、`SKT2Decision` 11 synced / 2 adapter）；**0 个**非真源小数 WARN（20 个源字面量登记在 `SOURCE_LITERALS`，带 `js/game.js:行号` 回读校验） |
| **汇总** | ✅ | **6 通过 / 0 失败** |

Godot 自测：**34 项全部 exit 0 / 0 条 `SCRIPT ERROR`**（清单与一键脚本见 `3d/HANDOFF.md` §0.8）。

**2026-11-11 第 18 批追加**：人物默认切 `char_crew_blockout`（1.75 m / 864 tris /
3 材质 / 无骨骼），`--crew-billboard` 保留旧 billboard 回退；门扇按 2.5D `doorTick`
修正为「关闭时中线合拢、完全打开让出 1.8 m 门洞」，触发检查所有活人。
`--powertest` 新增门扇读数 `closed_gap=0.000 / open_gap=1.800`；`--crewshot` /
`--doorshot` 已出对照图。

分离时的 2 项既有失败已清：`rules.json` 重导消除 `sources` SHA 漂移；
`port-manifest.json` 的 `X-BIND` 补认领上游新增的 111 行 `_t` 调试查询接口。
Godot 的 `--simtest` / `--meetingtest` / `--speechtest` 原是 `MEET_PRE` 接入后没更新的坏账
（**原仓同批逐字同样失败**，非本工程回归），本批用 `_finish_meeting()` 夹具修好。

### 6.2.1 截图鼠标（2026-11-11）

- 用户现场：截图/自测窗口把鼠标框住。已修：所有截图参数 `_screenshot_mode` 强制
  `VISIBLE`、`player.capture_mouse_on_ready=false`、`_input()` 不响应、`_exit_tree()` 释放；
  `--crewshot` 实跑 `CREW_MOUSE mode=0（0=VISIBLE）`；遗留 Godot 测试进程已清理。
- 规范见 §五.8；`3d/README.md` / `3d/HANDOFF.md` / `3d/ARCHITECTURE.md` /
  `3d/spec/conventions.md` / `3d/DECISIONS.md` ADR-0013 同步。

### 6.2.2 玩家发言模板（2026-11-11 · 第 21 批）

- 2.5D 真源：`meetTemplateText` 8 → 11 类，补齐 `saw_sabotage` / `saw_bot` /
  `saw_breaker`；新增「刚才 / 整晚」口供时段；证据模板空舱室不再注入当前房间；
  「不是我，我在 X」改走否认回应。`tools/test-v3.cjs` 增加模板 → `parseSpeech` 契约。
- 3D：`main.gd` 镜像 11 模板 + 时段；`speech.gd#player_say` 按 2.5D `playerTalk`
  分支重排回应池（作证不写成证词、被指者 `player_claim_deny` 的 `{k}`=动作、
  否认用 `press_deny`），删除 3D 自造的否认降可信度与普通指控 `empty_accuse` 证词。
- 实跑：`npm run check` 6/0；`--speechtest` 17/0（模板 11/11）；`--simtest` 26/0；
  `--meetuitest` 真实窗口 23/0；`--actiontest` 5/5。2.5D 全量 918/1（已登记偶发
  「领取物资申请单」），未改动 HEAD 对照 911/3（拖拽/藏尸），同机同样失败。
- 陷阱：Godot 自测参数必须放在 `--` 之后，否则测试不跑、进程不退；`--meetuitest`
  必须真实窗口，headless 下 GUI 不接收鼠标。见 `3d/HANDOFF.md` ⑭。

### 6.2.3 自动移植审计与 parseSpeech POC（2026-11-11 · 第 22 批）

- **现状澄清**：不是纯手动，也不是自动移植。当前是「只读基线自动同步 + 数据自动导出 +
  行为人工移植 + 门禁对账」；行为/UI 的自动生成尚未实现。
- **审计**：`npm run 3d:audit:port` → `3d/reports/portability-audit.md`。
  22 个 JS 文件分层：数据表/配置 2265 行已自动导出；纯逻辑 2631 行可做 IR + codegen；
  `t2/decision.js` 206 行含定时器适配；DOM/Canvas UI 2716 行需共享 UI spec；
  `game.js` 11917 行 / 438 处 DOM 引用必须上游拆 core。
- **POC**：`npm run 3d:poc:speech` → `3d/reports/parse-speech-poc.md`。
  2.5D 生成 503 条 fixtures；Godot 运行时解析器与 POC 生成解析器均 **503/503**。
  修复前 90/503 不一致，暴露并修正 5 个真实偏差：死亡席位被过滤、裸补零席位不识别、
  玩家自己席位未排除、`12号` 误命中 `2号`、全文被截 80 字后解析。
- **边界**：POC 只自动生成词表/正则，控制流是固定模板；不是通用 JS→GDScript 转译器。
  真正的行为自动移植需先在上游拆 DOM-free core，再做 IR codegen；UI 需 UI spec。
- 实跑：`npm run check` 6/0；`--speechtest` 17/0；`--simtest` 26/0；
  `--meetuitest` 23/0；`--actiontest` 5/5；POC runtime/generated 均 503/503。

### 6.2.4 game.js core/UI 审计 + 会议面板 UI spec（2026-11-11 · 第 23 批）

- **core/UI 审计**：`npm run 3d:audit:coreui` → `3d/reports/core-ui-audit.md`。
  341 个具名函数：`core-state` 196 / 7206 行、`ui` 47 / 1734 行、`pure` 96 / 1028 行、
  `adapter` 1 / 7 行；**混用 DOM+G 39 个**。`startVote` / `syncHud` / `openMeeting` /
  `say` 是首要拆分对象；顺序为 sink→时钟→decide/render。
- **UI spec**：`3d/spec/ui/meeting-panel.spec.json`：17 元素 / 11 模板 / 3 状态 / 6 事件。
  `npm run 3d:ui:check` 已并入 `npm run check`：2.5D DOM 17/17、3D Control 17/17、
  模板 11/11、handler 全存在。3D 发送按钮文案对齐为“发送”。
- **UI POC**：`npm run 3d:poc:ui` 从 spec 生成 Godot Control 面板并验证结构/状态：
  **17 节点 / 11 模板 / 3 状态，7/0**。POC 不生成 handler、不替换运行时。
- 实跑：`npm run check` **7/0**；`--speechtest` 17/0；`--simtest` 26/0；
  `--meetuitest` 23/0；`--actiontest` 5/5；parseSpeech POC 503/503。
- 边界：2.5D DOM 仍是 spec 的来源；下一步才是让 2.5D 消费 spec，再逐步替换 3D 手写 UI。

### 6.3 仍未同源（事实登记，不是立项）

> 本节只登记当前已知事实，**不是下一批清单**；方向由用户裁定（见 §五.7）。
>
> **2026-11-10 判定层收尾（第 13/16 批）**：`humanT`+`HUMANISH`、`claimHist`、
> `seenT/lastBody/redSeen/avoidSeen`、身份轴 / `exposureAt` / trait 系数 / `huntSpotFor`、
> `evalAlmost` 全量、`trust`/`grudge`/`patron`、`DESC`、构陷/大义灭亲编排已全部同源；
> `buildMeetCtx` 为等价实现（逐字段映射见 `3d/PORT-DIFF-AUDIT.md` §J）；
> parity **0 WARN**（20 个源字面量已登记并回读校验）。
> 第 1–8 批的历史记录见下；第 9–16 批逐条见 `3d/CHANGELOG.md` 与 §J。

1. **行为层读数已失效**：`3d-sim1000.md` 的 1000 局基线（人类 27.1% / 异形 68.9% / 超时 40、
   平均夜 5.71、救起 156）是**第七批之前**代码在 26 夜窗口下的读数；第七批恢复每夜刀额度、
   接通人类开枪并把窗口拨回 15 夜，**该读数不再代表当前代码**。按验收层边界，本批未采新读数，
   也未据旧读数论证任何改动。2.5D 参考 49.9% / 4.72 / 超时 0。
2. **医疗无人机救起链**：代码按 2.5D 补齐但行为未闭环（1000 局救起 0.156/局，2.5D 3.46/局），
   根因未定位，**不标为已解决**。
3. **第七批核实后仍缺的机制**（逐条见 `3d/PORT-DIFF-AUDIT.md` §C）：讨论期陆续投 + 跟票 +
   `rev` 驱动改票的时序、`chaseKnown/chaseSus` 追猎、`lightState` 三态、`startNight` 逐人重置
   20+ 字段、`mindReset` 跨夜字段（credWhy/claimHist/trust/grudge/humanT/ally 等）、
   `CN_SEAT` 中文席位解析、`buildMeetCtx`/`remainMs`、小游戏 14→10 型。
4. **事件层**：`simdiff-20261108.md` —— 两套独立实现，信封 34 vs 40、kind 18 vs 26，第 1 条事件就分歧。
5. **自造数值**：parity 自报 18 个非真源小数 WARN（列前 12）。
6. **验收层自身缺口**：`--mgtest 0/10`、`--taskflowtest`、`--floortest 失败 4`、`--e2e` 超时
   为原仓基线同样失败的既有坏账；`--actiontest` 是状态断言（0 次 `InputEvent` 派发），
   **真实输入链至今没有端到端自动化验收**。

> **2026-11-11 补充**：**鬼魂模式未迁** —— 2.5D `die()` 会 `ghost=true`，死亡后可穿墙、
> 修剩余任务（1.6× 时长 / `GHOST_TASK_CAP` 额度）、异形幽灵可破坏一次；3D `die()` 只置
> `alive=false`，玩家死亡直接出结算页。用户裁定先做人物 blockout，鬼魂后置；在完成前不得
> 把本工程描述为“2.5D 全量玩法已迁完”。
> 2026-11-11 全量审查见 `3d/REDLINE-AUDIT.md`：红线 1–10 通过，**红线 11/12 未全过**。

按 §一.4，这些未清项在任何报告里都要如实列出，不得沿用旧读数或伪装完成。
