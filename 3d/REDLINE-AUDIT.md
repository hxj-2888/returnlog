# 红线与 2.5D 继承审查（2026-11-11）

> 审查对象：`新返航录 3D 版/`（Godot 4.6 运行时 + 只读 `js/` 基线）。
> 方法：读代码 + 跑门禁 + 与 `js/game.js` / `js/t2/*` 逐项对照；
> **不沿用旧文档读数**。本文件是事实快照，不是下一批立项清单。
> 结论先说：**红线 1–10 通过；红线 11 未全过；红线 12 有一个流程缺口。**
> 因此不能把本工程描述为“2.5D 全量玩法已迁完”。

## 一、红线逐条

| 红线 | 判定 | 证据 / 说明 |
|---|---|---|
| 1 `file://` 可玩 / 零构建 | ✅ | 3D 是 Godot 运行时，不适用 `file://`；工程无 `fetch` / `XMLHttpRequest` / `type="module"`；`project.godot` 无插件、无外部服务 |
| 2 唯一加载清单 | ✅ | `project.godot` 的 `run/main_scene` 指向唯一 `scenes/main.tscn`；`main.tscn` 只挂 `scripts/main.gd`；`3d:import:check` 76 个 `.glb.import` 0 差异 |
| 3 版本单一真源 | ✅ | 3D 版本真源 `3d/version.json`；`Config.label()` 读 `data/version.json`；脚本里无 UI 版本硬编码（`config.gd` 的 `V1P-0.0` 只是读取失败兜底） |
| 4 门禁全绿 | ✅ | 本次实跑：`npm run check` **6 通过 / 0 失败**；`baseline:check` **454 文件 OK**；`3d:port:check` 0 错误 / 1 legacy 警告；`3d:events:check` 31/31；`3d:lines:check` OK；`3d:parity:check` 63 synced / 7 adapter / **0 pending** |
| 5 调试/自测契约 | ✅ | Godot 自测参数保留并新增 `--crewanimtest`；`--probetest` 真实 E/左键/F2；无 DOM `SKV3` 依赖 |
| 6 素材署名 / 出图模型 | ✅ | `audio/` CC0（`audio/CREDITS.md`）；`assets/scene` 相关 CC-BY 署名保留；`assets/minigame` Qwen-Image 2.1 Research License 非商用；**本批参考图用本地 Qwen**，未新增 SDXL 出图；`docs/qwen21/crew-refs/manifest.json` 记录模型/seed/prompt/许可 |
| 7 模块边界 | ✅ | 地图只走 `js/data/map.js` → `map_v2.json`；几何/寻路在 `grid_nav.gd`；设备/掩体由 `map_builder` / `scene_extras` 读数据；GDScript 不另抄一份 map 表 |
| 8 零运行时第三方依赖 | ✅ | Godot 工程无插件、无 addons；`playwright-core` 只用于本机 `simdump.cjs` / 自测，不进运行时 |
| 9 DOM id / 节点同步 | ✅ | 只有 `main.tscn` 一个场景且节点由代码创建，无 DOM id；`.tscn` 与 GDScript 无第二份节点路径 |
| 10 中文记录 | ✅ | 文档 / 提交信息 / 注释以中文为主；提交格式 `type(scope): 摘要`（本批 `feat(3d)` / `docs(repo)`） |
| 11 3D 是 2.5D 的延伸 | ❌ **未全过** | 判定/AI/语料/会议/任务/战斗/结算已有 parity 0 pending；但仍有下列真实缺口（见 §二）。V-CREW 已 full，但不能据此说“全部玩法已迁完” |
| 12 素材优先公开 + 留痕 | ⚠ **流程缺口** | 场景/音频素材的 CC-BY/CC0 来源已登记；角色参考图是本地 Qwen 依项目**自绘 2.5D crew** 生成，**没有留痕“公开设计参照检索”**；未使用第三方角色资产，模型为原创。按红线 12 的过程要求，这一项不能算完全达标 |

## 二、红线 11：真实的继承缺口

| 优先级 | 缺口 | 事实 / 证据 |
|---|---|---|
| P0 玩法 | **鬼魂模式未迁** | 2.5D `die()` 会 `ghost=true`，死亡后可穿墙、修剩余任务（1.6×/`GHOST_TASK_CAP`）、异形幽灵可破坏一次；3D `die()` 只 `alive=false`，玩家死亡直接出结算页。用户已裁定先做人物、鬼魂后置，但按“完整移植”它仍是缺口 |
| P0 行为 | **医疗无人机救起链未闭环** | 代码按 2.5D 补齐，1000 局救起 **0.156/局** vs 2.5D **3.46/局**；根因未定位，不标为已解决 |
| P1 验收 | **1000 局基线过期** | `3d-sim1000.md` 是第七批之前代码读数；第 13/16 批判定层改动后没有新的同口径基线 |
| P2 调试 | **`SKInvariants` / designMode 未迁** | 2.5D 的运行时断言、设计者冻结/穿墙模式没有 3D 对应；属于调试层，不是玩家系统 |
| P2 账本 | **port-manifest 仍有 23 个 partial** | 其中一部分 note 是历史残留（后续批次已推翻）；需要一次账本对账，不能把 23 个 partial 当作 23 个真实缺口，也不能反过来当成全绿 |
| P2 美术 | **场景/资产收口** | `ship_hull / ship_wall_segment / ship_floor_tile` 3 个 wip 源文件未落地；room/door 专用模型仍 todo；cover_refs 缺 `schema_version`（legacy）；LOD/合批未做 |

**已确认补齐的项**：E 出刀 / DEV / 真实输入探针（第 17 批）；门扇闭合与全活人触发（第 18 批）；
千问参考图 + `char_crew_lowpoly` + idle/walk/knife/down（第 19/20 批）；V-CREW **ported（full）**。

## 三、2.5D 声音系统同步

已按 `js/game.js:8541-8760` 的 `SND` 对齐到 `3d/preview/scripts/audio.gd`：

- **距离音量**：`volAt` 量程 18 格、端点 1.00 / 0.14、中间线性；
  实测 `d=0→1.00 / d=9→0.57 / d=18→0.14`，与 2.5D 一致。
- **音色档**：`knife / shoot / scream / step / flesh / door / work / metal / ui / report`
  的音量上限与随机音高区间照 2.5D `TONE`。
- **多采样**：`knife`、`step`、`scream` 使用 2 条采样随机；缺失的 `sfx-work.ogg` 已恢复。
- **事件**：刀/枪叠血肉 + 喊叫；报告/会议/投票/驱逐；机器人/电闸/管道/拘押；
  `game_end` 按 `win` 分流 `win`/`lose`；门完全开/关由 `scene_extras.door_auto` 信号触发；
  近处移动者脚步声 + 玩家站桩/小游戏 work 声；`M` 键开关音效（2.5D `SND.setOn` 同义）。
- **未声称**：2.5D 部分 UI 提示音是 WebAudio 程序化 beep，3D 用现有采样近似；
  不声称波形逐样本一致。2.5D 本身没有立体声像，3D 也保持平音量，不做额外空间声像。

## 四、V-CREW / 人物

- `char_crew_lowpoly`：1.75 m / 1812 tris / 4 材质 / 17 形变骨 /
  `idle + walk + knife + down`；`assets.manifest.json` 状态 **done**。
- `crew_view.gd`：默认 15 个模型；`moving` → walk、静止 → idle；
  `sim.events#knife` → knife 一次性；`downed` → down；walk 2.9× 匹配 4.2 m/s。
- `--crewanimtest`（无窗口）实跑：`clips=["down","idle","knife","walk"] knife=knife down=down`。
- `port-manifest.json#V-CREW`：**partial → ported（full）**。

## 五、截图 / 鼠标

- 所有截图参数（`--shot / --crewshot / --doorshot / --mgshot / --devshot /
  --covershot / --ceilshot / --pipeshot / --meetshot / --endshot / --minishot /
  --homeshot`）走 `_screenshot_mode`：`player.capture_mouse_on_ready=false`、
  `Input.mouse_mode=VISIBLE`、`_input()` 不响应、退出 `_exit_tree()` 再释放。
- 实测 `CREW_MOUSE mode=0（0=VISIBLE）`；遗留 Godot 测试进程已清理。
- 圆桌“银翼”预览 `_build_preview_actor()` 与 `_system_font()` 已删除；
  `map_builder.gd` 不再创建该 Sprite3D，`银翼` 只保留在 `names` 数据里。

## 六、本次实跑证据

```
npm run check             6 通过 / 0 失败
npm run baseline:check    BASELINE OK 454
npm run 3d:port:check     0 错误 / 1 legacy 警告；ported 13 / partial 23
npm run 3d:parity:check   63 synced / 7 adapter / 0 pending
npm run 3d:events:check   31 / 31 / 31
npm run 3d:assets         0 错误 / 3 提醒（旧 wip 源文件）
npm run 3d:import:check   76 个 .glb.import / 0 差异
--crewanimtest            OK 0 项失败（4 clips；knife/down 触发）
--audiotest               volAt 1.00/0.57/0.14；work/step/scream/door 全在
--simtest                 26/0
--powertest               门扇 closed_gap=0.000 / open_gap=1.800
```

## 七、结论与下一步

- **红线 1–10**：通过。
- **红线 11**：**未全过**。核心玩法还差鬼魂模式；医疗无人机救起行为未闭环；
  1000 局基线过期。其余是调试层、美术资产和账本问题。
- **红线 12**：素材许可本身合规，但角色参考图缺少“公开设计参照检索”的留痕；
  这是流程缺口，不是第三方侵权。
- 要达到“红线全绿”，下一步至少需要：① 迁鬼魂模式；② 定位并闭环医疗无人机救起链；
  ③ 重跑当前代码的 1000 局基线；④ 补公开设计参照留痕（或明确记录本项目自绘基准）；
  ⑤ 清 port-manifest 的 23 个 partial 旧 note 与 3 个 wip 资产源。
