# game.js core / UI 解耦审计

生成时间：2026-11-11T04:57:25.383Z

> 只读统计；按函数体里的 DOM / 定时器 / `G` 状态 / 副作用调用分类，
> 用于决定哪些函数可以先生成、哪些必须上游拆接口。

## 1. 总览

- 具名函数：**340** 个；覆盖 **9975** 行
- `boot` 是包住整个游戏的容器函数，单列不计入分层统计。

| 层 | 函数 | 行数 | 说明 |
|---|---:|---:|---|
| `core-state` | 196 | 7206 | 规则/状态逻辑；依赖 G 或 say/logEvent 等副作用，需先注入接口 |
| `ui` | 47 | 1734 | 直接操作 DOM/Canvas；留在 view 层 |
| `pure` | 96 | 1028 | 不碰 DOM / 定时器 / G；可直接进 IR |
| `adapter` | 1 | 7 | 含定时器；需要 tick/时钟适配 |

## 2. 混用最重的函数（DOM + G 状态）

| 函数 | 行段 | 行数 | DOM | G/state | sink |
|---|---:|---:|---:|---:|---:|
| `startVote` | 7488-7689 | 202 | 13 | 75 | 0 |
| `update` | 2202-2304 | 103 | 5 | 60 | 2 |
| `syncHud` | 10815-10915 | 101 | 53 | 53 | 0 |
| `openMeeting` | 6923-7017 | 95 | 33 | 38 | 4 |
| `closeVote` | 7698-7758 | 61 | 3 | 32 | 4 |
| `say` | 4909-4962 | 54 | 7 | 24 | 2 |
| `togglePause` | 743-759 | 17 | 6 | 19 | 0 |
| `renderVoteButtons` | 7453-7487 | 35 | 7 | 17 | 0 |
| `newGame` | 169-338 | 170 | 29 | 14 | 1 |
| `endGame` | 4840-4861 | 22 | 10 | 13 | 3 |
| `finishMeeting` | 7777-7809 | 33 | 3 | 13 | 1 |
| `runInvariants` | 556-592 | 37 | 6 | 12 | 0 |
| `openCams` | 999-1014 | 16 | 8 | 12 | 3 |
| `drawFog` | 10695-10776 | 82 | 3 | 12 | 0 |
| `openPipePick` | 894-920 | 27 | 7 | 9 | 4 |
| `openSabPick` | 1100-1122 | 23 | 7 | 9 | 5 |
| `die` | 4285-4321 | 37 | 3 | 9 | 4 |
| `syncMeetTemplates` | 6857-6913 | 57 | 19 | 9 | 0 |
| `drawCams` | 9505-9602 | 98 | 2 | 7 | 0 |
| `openBodyCard` | 8508-8537 | 30 | 9 | 6 | 0 |
| `closeBodyCard` | 8538-8551 | 14 | 3 | 6 | 0 |
| `renderTaskList` | 10780-10814 | 35 | 4 | 6 | 0 |
| `renderDevPanel` | 597-623 | 27 | 2 | 5 | 0 |
| `pickPipe` | 926-948 | 23 | 3 | 5 | 3 |
| `pickSabRoom` | 1128-1137 | 10 | 3 | 5 | 2 |

这些是“行为 + UI”缠在一起的核心债务：只改 3D 会继续产生第二套实现，
必须在上游把它们拆成 `decide*`（纯逻辑）与 `render*`（DOM 适配）。

## 3. DOM/UI 最重的函数

| 函数 | 行段 | 行数 | DOM | timer | state |
|---|---:|---:|---:|---:|---:|
| `syncHud` | 10815-10915 | 101 | 53 | 0 | 53 |
| `openMeeting` | 6923-7017 | 95 | 33 | 0 | 38 |
| `newGame` | 169-338 | 170 | 29 | 1 | 14 |
| `syncDevUi` | 624-670 | 47 | 20 | 2 | 4 |
| `syncMeetTemplates` | 6857-6913 | 57 | 19 | 0 | 9 |
| `startVote` | 7488-7689 | 202 | 13 | 0 | 75 |
| `start` | 68-96 | 29 | 11 | 0 | 0 |
| `renderEndTables` | 4800-4839 | 40 | 10 | 0 | 5 |
| `endGame` | 4840-4861 | 22 | 10 | 0 | 13 |
| `openBodyCard` | 8508-8537 | 30 | 9 | 0 | 6 |
| `openCams` | 999-1014 | 16 | 8 | 0 | 12 |
| `openPipePick` | 894-920 | 27 | 7 | 0 | 9 |
| `openSabPick` | 1100-1122 | 23 | 7 | 0 | 9 |
| `say` | 4909-4962 | 54 | 7 | 0 | 24 |
| `renderVoteButtons` | 7453-7487 | 35 | 7 | 0 | 17 |
| `runInvariants` | 556-592 | 37 | 6 | 0 | 12 |
| `togglePause` | 743-759 | 17 | 6 | 0 | 19 |
| `pulseHud` | 8571-8578 | 8 | 5 | 1 | 0 |
| `coverOutline` | 10071-10092 | 22 | 6 | 0 | 0 |
| `update` | 2202-2304 | 103 | 5 | 0 | 60 |
| `openWheel` | 8148-8168 | 21 | 5 | 0 | 2 |
| `stop` | 98-106 | 9 | 4 | 0 | 0 |
| `renderTally` | 7759-7776 | 18 | 4 | 0 | 2 |
| `renderTaskList` | 10780-10814 | 35 | 4 | 0 | 6 |
| `restartGame` | 760-764 | 5 | 3 | 0 | 1 |

## 4. 可直接进 IR 的候选（core-state / pure）

| 函数 | 层 | 行段 | 行数 | sink | random |
|---|---|---:|---:|---:|---:|
| `aiAlien` | core-state | 3722-4178 | 457 | 0 | 10 |
| `startChatter` | core-state | 6114-6549 | 436 | 43 | 5 |
| `buildMeetCtx` | core-state | 5020-5427 | 408 | 1 | 7 |
| `draw` | core-state | 10191-10545 | 355 | 0 | 0 |
| `playerTalk` | core-state | 6557-6815 | 259 | 18 | 18 |
| `drawFacilities` | core-state | 9098-9337 | 240 | 0 | 0 |
| `aiHuman` | core-state | 2784-3022 | 239 | 0 | 4 |
| `drawFx` | core-state | 9816-10035 | 220 | 0 | 0 |
| `simGame` | core-state | 11029-11221 | 193 | 0 | 4 |
| `planAlienDeception` | core-state | 5820-6008 | 189 | 6 | 10 |
| `finishDoing` | core-state | 4335-4501 | 167 | 19 | 0 |
| `alienPlan` | core-state | 3382-3512 | 131 | 0 | 1 |
| `drawMini` | core-state | 10547-10672 | 126 | 0 | 0 |
| `noticeAction` | core-state | 1884-1988 | 105 | 0 | 0 |
| `drawMedDrone` | pure | 8982-9074 | 93 | 0 | 0 |
| `disguiseOptions` | core-state | 3266-3354 | 89 | 0 | 2 |
| `drawDoors` | core-state | 9393-9473 | 81 | 0 | 0 |
| `alienSupport` | core-state | 3513-3589 | 77 | 0 | 1 |
| `trackNight` | core-state | 1309-1384 | 76 | 0 | 0 |
| `collectInteractions` | core-state | 8072-8147 | 76 | 2 | 0 |
| `drawWork` | pure | 9668-9743 | 76 | 0 | 0 |
| `medbotTick` | core-state | 4695-4766 | 72 | 2 | 0 |
| `alienPipeMove` | core-state | 3659-3721 | 63 | 2 | 0 |
| `settleAccountability` | core-state | 1562-1620 | 59 | 1 | 0 |
| `stepMove` | core-state | 828-885 | 58 | 2 | 0 |
| `aiIdleRoam` | core-state | 2312-2368 | 57 | 0 | 4 |
| `aiScanBodies` | core-state | 2524-2580 | 57 | 0 | 1 |
| `secCatchTick` | core-state | 4613-4665 | 53 | 2 | 0 |
| `startNight` | core-state | 7838-7890 | 53 | 2 | 2 |
| `planMateBus` | core-state | 6062-6113 | 52 | 1 | 4 |
| `drawTaskMarkers` | core-state | 10120-10169 | 50 | 0 | 0 |
| `drawWeapon` | core-state | 9744-9792 | 49 | 0 | 0 |
| `aiGhost` | core-state | 2371-2416 | 46 | 0 | 3 |
| `coverAudit` | pure | 505-550 | 46 | 0 | 0 |
| `drawRobotBody` | pure | 8934-8978 | 45 | 0 | 0 |
| `knife` | core-state | 4226-4269 | 44 | 6 | 0 |
| `fireShot` | core-state | 8306-8349 | 44 | 8 | 0 |
| `huntSpotFor` | core-state | 3616-3658 | 43 | 0 | 0 |
| `alibiLine` | core-state | 5636-5678 | 43 | 0 | 2 |
| `accuseLine` | core-state | 5775-5815 | 41 | 0 | 0 |

## 5. 建议的拆分顺序

1. **先抽 sink 接口**：`say` / `logEvent` / `toast` / `SND` 作为注入依赖，
   让 `core-state` 函数不再直接摸 DOM；
2. **再抽定时器接口**：`meetLater` / `setTimeout` 换成可注入的调度器（2.5D 保留原实现）；
3. **按混用最重的函数逐个拆**：每个拆成 `decideX()`（纯/半纯）+ `renderX()`（DOM）；
4. **UI 不走 HTML 翻译**：按 `3d/spec/ui/*.spec.json` 的共享 spec 双 renderer；
5. **生成物入门禁**：生成文件手改即 FAIL，fixtures 双端同跑。

> 本报告只给边界，不改源码；拆分本身必须在上游 2.5D 完成并跑原仓门禁。
