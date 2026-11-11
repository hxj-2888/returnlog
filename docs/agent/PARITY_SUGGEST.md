# 2.5D → 3D 映射建议（人工核对用）

> `node 3d/tools/suggest-parity-map.cjs`。分数 = 标识符重合 / √(2.5D 标识符数)，同名 +30。
> **只做排序，不做判定**：每行必须打开两侧原文核对后才能写进 `spec/gameplay-parity.json`。

| 2.5D 函数 | 行数 | 候选 3D | 重合 | 分数 |
|---|---:|---|---:|---:|
| `js/game.js:start` | 29 | `main.gd:_collect_offers:6194` | 6 | 0.8 |
|  |  | `main.gd:_ready:234` | 5 | 0.7 |
|  |  | `main.gd:_run_probetest:1300` | 5 | 0.7 |
| `js/game.js:stop` | 9 | `main.gd:_input:7539` | 3 | 0.7 |
|  |  | `main.gd:_run_probetest:1300` | 2 | 0.4 |
|  |  | `main.gd:_run_meetuitest:1656` | 2 | 0.4 |
| `js/game.js:boot` | 11795 | `sim/ai_alien.gd:_decide:297` | 188 | 2.8 |
|  |  | `main.gd:_collect_offers:6194` | 141 | 2.1 |
|  |  | `sim/sim_state.gd:new_game:117` | 125 | 1.8 |
| `js/game.js:buildSeatNames` | 21 | `main.gd:_collect_offers:6194` | 6 | 1.4 |
|  |  | `main.gd:_run_crewanimtest:963` | 5 | 1.1 |
|  |  | `main.gd:_run_probetest:1300` | 5 | 1.1 |
| `js/game.js:randIn` | 8 | `sim/grid_nav.gd:build:33` | 2 | 0.8 |
|  |  | `sim/grid_nav.gd:room_at:156` | 2 | 0.8 |
|  |  | `sim/grid_nav.gd:in_poly:195` | 2 | 0.8 |
| `js/game.js:roomNameById` | 5 | `main.gd:_build_room_options:5395` | 4 | 1.6 |
|  |  | `home_ship_map.gd:_draw:54` | 3 | 1.2 |
|  |  | `main.gd:_run_powertest:2849` | 3 | 1.2 |
| `js/game.js:roomIdOfName` | 8 | `main.gd:_build_room_options:5395` | 4 | 1.3 |
|  |  | `home_ship_map.gd:_draw:54` | 3 | 1.0 |
|  |  | `main.gd:_run_powertest:2849` | 3 | 1.0 |
| `js/game.js:pipeRoomIds` | 5 | `sim/speech.gd:plan_alien_deception:111` | 3 | 1.2 |
|  |  | `home_ship_map.gd:_draw:54` | 2 | 0.8 |
|  |  | `main.gd:_run_pipeshot:893` | 2 | 0.8 |
| `js/game.js:causeName` | 3 | `main.gd:_run_probetest:1300` | 3 | 1.2 |
|  |  | `main.gd:_settle_ids_text:7473` | 3 | 1.2 |
|  |  | `main.gd:_ready:234` | 2 | 0.8 |
| `js/game.js:walkableNear` | 10 | `main.gd:_draw:30` | 4 | 1.6 |
|  |  | `sim/crew_view.gd:_sync_model:281` | 4 | 1.6 |
|  |  | `device.gd:_add_faceplate:106` | 2 | 0.8 |
| `js/game.js:nearPipeXY` | 4 | **无候选 → 真缺口** | 0 | 0 |
| `js/game.js:doorBlockedSegment` | 11 | `main.gd:_run_powertest:2849` | 5 | 1.3 |
|  |  | `scene_extras.gd:door_update:91` | 4 | 1.0 |
|  |  | `scene_extras.gd:_build_doors:501` | 4 | 1.0 |
| `js/game.js:losNow` | 9 | `scene_extras.gd:door_update:91` | 3 | 0.9 |
|  |  | `scene_extras.gd:_task_placement:245` | 3 | 0.9 |
|  |  | `main.gd:_run_e2e:827` | 2 | 0.6 |
| `js/game.js:coverAudit` | 46 | `main.gd:_run_reachtest:3076` | 8 | 1.3 |
|  |  | `main.gd:_collect_offers:6194` | 8 | 1.3 |
|  |  | `minimap.gd:_draw:48` | 8 | 1.3 |
| `js/game.js:runInvariants` | 37 | `main.gd:_run_actiontest:3168` | 5 | 0.6 |
|  |  | `main.gd:_refresh_dev_panel:4029` | 5 | 0.6 |
|  |  | `main.gd:_run_speechtest:4526` | 5 | 0.6 |
| `js/game.js:renderDevPanel` | 27 | `main.gd:_refresh_dev_panel:4029` | 36 | 4.7 |
|  |  | `main.gd:_collect_offers:6194` | 27 | 3.5 |
|  |  | `sim/sim_state.gd:new_game:117` | 25 | 3.3 |
| `js/game.js:syncDevUi` | 47 | `main.gd:_build_hud:3725` | 6 | 0.8 |
|  |  | `main.gd:_ready:234` | 5 | 0.6 |
|  |  | `main.gd:_build_dev_panel:3948` | 5 | 0.6 |
| `js/game.js:toggleDev` | 6 | `main.gd:_input:7539` | 5 | 1.9 |
|  |  | `main.gd:_ready:234` | 4 | 1.5 |
|  |  | `main.gd:_run_probetest:1300` | 4 | 1.5 |
| `js/game.js:togglePause` | 17 | `main.gd:_open_cams:6586` | 6 | 1.0 |
|  |  | `main.gd:_refresh_sim_hud:7367` | 6 | 1.0 |
|  |  | `sim/sim_state.gd:new_game:117` | 6 | 1.0 |
| `js/game.js:restartGame` | 5 | `sim/sim_state.gd:new_game:117` | 2 | 0.6 |
| `js/game.js:exitToMenu` | 1 | **无候选 → 真缺口** | 0 | 0 |
| `js/game.js:moveSpeed` | 5 | `sim/sim_state.gd:tick_agents:513` | 10 | 2.9 |
|  |  | `sim/ai_alien.gd:_decide:297` | 6 | 1.7 |
|  |  | `sim/sim_state.gd:_kill_rush_start:897` | 4 | 1.2 |
| `js/game.js:walkTo` | 10 | `main.gd:_run_probetest:1300` | 4 | 1.2 |
|  |  | `main.gd:_run_b6test:4250` | 3 | 0.9 |
|  |  | `main.gd:_refresh_meeting_ui:5614` | 3 | 0.9 |
| `js/game.js:stepSpect` | 14 | `main.gd:_run_e2e:827` | 6 | 1.5 |
|  |  | `main.gd:_run_crewshot:1020` | 5 | 1.3 |
|  |  | `main.gd:_collect_offers:6194` | 5 | 1.3 |
| `js/game.js:camFocus` | 1 | `main.gd:_refresh_meeting_ui:5614` | 3 | 1.2 |
|  |  | `main.gd:_on_start:5156` | 2 | 0.8 |
| `js/game.js:freeFly` | 1 | `main.gd:_refresh_dev_panel:4029` | 2 | 0.8 |
|  |  | `main.gd:_collect_offers:6194` | 2 | 0.8 |
|  |  | `main.gd:_refresh_sim_hud:7367` | 2 | 0.8 |
| `js/game.js:stepMove` | 58 | `sim/sim_state.gd:tick_agents:513` | 17 | 2.3 |
|  |  | `sim/sim_state.gd:new_game:117` | 10 | 1.3 |
|  |  | `main.gd:_run_probetest:1300` | 9 | 1.2 |
| `js/game.js:nearPipe` | 5 | `sim/ai_alien.gd:_pipe_move:146` | 2 | 0.8 |
|  |  | `sim/ai_alien.gd:_decide:297` | 2 | 0.8 |
|  |  | `sim/bots.gd:_find_downed:350` | 2 | 0.8 |
| `js/game.js:pipeOpts` | 1 | **无候选 → 真缺口** | 0 | 0 |
| `js/game.js:openPipePick` | 27 | `main.gd:_collect_offers:6194` | 13 | 1.6 |
|  |  | `sim/sim_state.gd:new_game:117` | 11 | 1.3 |
|  |  | `sim/ai_human.gd:tick:23` | 10 | 1.2 |
| `js/game.js:closePipePick` | 5 | `main.gd:_collect_offers:6194` | 2 | 0.6 |
|  |  | `main.gd:_open_cams:6586` | 2 | 0.6 |
| `js/game.js:pickPipe` | 23 | `main.gd:_collect_offers:6194` | 11 | 1.5 |
|  |  | `main.gd:_travel_pipe:6838` | 8 | 1.1 |
|  |  | `sim/sim_state.gd:tick_agents:513` | 8 | 1.1 |
| `js/game.js:camMonitor` | 1 | `main.gd:_run_actiontest:3168` | 3 | 1.2 |
|  |  | `main.gd:_collect_offers:6194` | 3 | 1.2 |
|  |  | `scene_extras.gd:_build_facilities:359` | 3 | 1.2 |
| `js/game.js:nearRoundTable` | 6 | `main.gd:_run_reachtest:3076` | 2 | 0.8 |
|  |  | `main.gd:_collect_offers:6194` | 2 | 0.8 |
|  |  | `minigame/mg_wire.gd:_ends_of:202` | 2 | 0.8 |
| `js/game.js:nearMonitor` | 4 | **无候选 → 真缺口** | 0 | 0 |
| `js/game.js:inCamRoom` | 1 | `main.gd:_run_aiporttest:1918` | 2 | 0.8 |
|  |  | `main.gd:_player_room_lit:3606` | 2 | 0.8 |
|  |  | `main.gd:_collect_offers:6194` | 2 | 0.8 |
| `js/game.js:closeCams` | 5 | `main.gd:_input:7539` | 3 | 0.8 |
| `js/game.js:nearPoint` | 8 | `main.gd:_run_reachtest:3076` | 2 | 0.8 |
|  |  | `sim/ai_alien.gd:_pipe_move:146` | 2 | 0.8 |
|  |  | `sim/ai_alien.gd:_decide:297` | 2 | 0.8 |
| `js/game.js:dmgOfRoom` | 1 | `main.gd:_tick_fault_marks:3654` | 3 | 1.2 |
|  |  | `main.gd:_collect_offers:6194` | 3 | 1.2 |
|  |  | `home_ship_map.gd:_draw:54` | 2 | 0.8 |
| `js/game.js:nearDmg` | 8 | `main.gd:_nearest_living_agent:6171` | 2 | 0.7 |
|  |  | `main.gd:_nearest_shot_target:7082` | 2 | 0.7 |
|  |  | `main.gd:_aim_target:7109` | 2 | 0.7 |
| `js/game.js:openSabPick` | 23 | `main.gd:_collect_offers:6194` | 17 | 2.1 |
|  |  | `sim/sim_state.gd:new_game:117` | 17 | 2.1 |
|  |  | `main.gd:_run_probetest:1300` | 10 | 1.3 |
| `js/game.js:closeSabPick` | 5 | **无候选 → 真缺口** | 0 | 0 |
| `js/game.js:pickSabRoom` | 10 | `main.gd:_collect_offers:6194` | 6 | 1.2 |
|  |  | `minimap.gd:_draw:48` | 3 | 0.6 |
|  |  | `sim/speech.gd:_ctx_for:912` | 3 | 0.6 |
| `js/game.js:startFix` | 12 | `sim/sim_state.gd:new_game:117` | 10 | 2.1 |
|  |  | `main.gd:_collect_offers:6194` | 9 | 1.9 |
|  |  | `main.gd:_refresh_dev_panel:4029` | 7 | 1.5 |
| `js/game.js:finishFix` | 35 | `main.gd:_collect_offers:6194` | 11 | 1.5 |
|  |  | `sim/sim_state.gd:new_game:117` | 10 | 1.3 |
|  |  | `main.gd:_run_probetest:1300` | 8 | 1.1 |
| `js/game.js:miniGameOn` | 3 | `main.gd:_refresh_meeting_ui:5614` | 2 | 0.6 |
| `js/game.js:playerMiniGame` | 28 | `sim/sim_state.gd:new_game:117` | 10 | 1.4 |
|  |  | `main.gd:_collect_offers:6194` | 9 | 1.3 |
|  |  | `scene_extras.gd:_build_devices:216` | 8 | 1.2 |
| `js/game.js:dmgTick` | 22 | `main.gd:_collect_offers:6194` | 9 | 1.5 |
|  |  | `sim/sim_state.gd:tick_agents:513` | 8 | 1.3 |
|  |  | `sim/sim_state.gd:_tick_dmg:1394` | 8 | 1.3 |
| `js/game.js:logEvent` | 9 | `sim/sim_state.gd:_log:2395` | 8 | 2.2 |
|  |  | `ui_panels.gd:_replay_text:178` | 6 | 1.7 |
|  |  | `main.gd:_run_speechtest:4526` | 5 | 1.4 |
| `js/game.js:recordFrame` | 15 | `sim/sim_state.gd:_close_meeting:2032` | 10 | 2.0 |
|  |  | `sim/sim_state.gd:new_game:117` | 9 | 1.8 |
|  |  | `sim/sim_state.gd:die:990` | 9 | 1.8 |
| `js/game.js:replayData` | 12 | `sim/sim_state.gd:new_game:117` | 16 | 2.5 |
|  |  | `main.gd:_run_aittest:7712` | 11 | 1.7 |
|  |  | `main.gd:_run_settletest:2317` | 10 | 1.6 |
| `js/game.js:obeyTrustMul` | 5 | `sim/ai_human.gd:_decide:240` | 3 | 1.1 |
|  |  | `sim/ai_alien.gd:_decide:297` | 2 | 0.7 |
|  |  | `sim/mind.gd:rule:25` | 2 | 0.7 |
| `js/game.js:defenseNote` | 14 | `sim/speech.gd:decide_human_defend:570` | 11 | 2.8 |
|  |  | `sim/ai_alien.gd:_decide:297` | 5 | 1.3 |
|  |  | `sim/mind.gd:settle_accountability:1578` | 5 | 1.3 |
| `js/game.js:attention` | 10 | `main.gd:_refresh_sim_hud:7367` | 7 | 1.7 |
|  |  | `sim/sim_state.gd:new_game:117` | 7 | 1.7 |
|  |  | `main.gd:_open_cams:6586` | 6 | 1.5 |
| `js/game.js:observerVisionAt` | 18 | `sim/sim_state.gd:ai_can_see:1079` | 13 | 2.5 |
|  |  | `sim/crew_view.gd:_sync_model:281` | 5 | 1.0 |
|  |  | `sim/sim_state.gd:tick_agents:513` | 5 | 1.0 |
| `js/game.js:envNotice` | 8 | `sim/mind.gd:note_sight:899` | 8 | 2.0 |
|  |  | `sim/mind.gd:cred_broadcast:1473` | 8 | 2.0 |
|  |  | `main.gd:_collect_offers:6194` | 7 | 1.8 |
| `js/game.js:noticeTaskAbandon` | 23 | `sim/ai_alien.gd:_decide:297` | 16 | 2.4 |
|  |  | `sim/mind.gd:note_sight:899` | 16 | 2.4 |
|  |  | `sim/mind.gd:cred_broadcast:1473` | 14 | 2.1 |
| `js/game.js:noticeAction` | 105 | `sim/ai_alien.gd:_decide:297` | 32 | 2.8 |
|  |  | `sim/mind.gd:note_sight:899` | 32 | 2.8 |
|  |  | `sim/sim_state.gd:toggle_power:2213` | 25 | 2.2 |
| `js/game.js:misIdPick` | 16 | `sim/ai_alien.gd:_decide:297` | 9 | 2.0 |
|  |  | `sim/ai_alien.gd:_exposure_at:64` | 7 | 1.6 |
|  |  | `sim/ai_human.gd:tick:23` | 7 | 1.6 |
| `js/game.js:misIdBump` | 7 | `sim/mind.gd:note_sight:899` | 7 | 1.9 |
|  |  | `sim/mind.gd:settle_accountability:1578` | 2 | 0.6 |
| `js/game.js:knownBump` | 11 | `sim/sim_state.gd:knife_bot:2300` | 2 | 0.5 |
|  |  | `sim/sim_state.gd:sabotage_bot:2324` | 2 | 0.5 |
|  |  | `sim/speech.gd:plan_alien_deception:111` | 2 | 0.5 |
| `js/game.js:markMate` | 5 | `sim/mind.gd:cred_broadcast:1473` | 5 | 1.9 |
|  |  | `sim/sim_state.gd:_witness_action:1193` | 4 | 1.5 |
|  |  | `sim/speech.gd:plan_mate_bus:381` | 4 | 1.5 |
| `js/game.js:lootText` | 9 | `main.gd:_refresh_dev_panel:4029` | 4 | 1.4 |
|  |  | `main.gd:_open_body_card:6559` | 4 | 1.4 |
|  |  | `sim/sim_state.gd:new_game:117` | 4 | 1.4 |
| `js/game.js:aiWantsLoot` | 9 | `main.gd:_refresh_dev_panel:4029` | 8 | 2.5 |
|  |  | `main.gd:_refresh_sim_hud:7367` | 8 | 2.5 |
|  |  | `sim/sim_state.gd:new_game:117` | 8 | 2.5 |
| `js/game.js:loop` | 7 | `main.gd:_run_sim1000:4386` | 3 | 0.8 |
|  |  | `main.gd:_open_cams:6586` | 3 | 0.8 |
|  |  | `sim/sim_state.gd:search_body:1299` | 3 | 0.8 |
| `js/game.js:aiIdleRoam` | 57 | `sim/ai_human.gd:_idle_roam:457` | 25 | 3.1 |
|  |  | `main.gd:_run_aiporttest:1918` | 15 | 1.8 |
|  |  | `sim/ai_alien.gd:_decide:297` | 13 | 1.6 |
| `js/game.js:aiGhost` | 46 | `sim/sim_state.gd:new_game:117` | 19 | 2.8 |
|  |  | `main.gd:_run_aiporttest:1918` | 10 | 1.5 |
|  |  | `main.gd:_refresh_sim_hud:7367` | 9 | 1.3 |
| `js/game.js:releaseAllDrags` | 5 | `main.gd:_run_aiporttest:1918` | 2 | 0.5 |
|  |  | `main.gd:_refresh_dev_panel:4029` | 2 | 0.5 |
|  |  | `main.gd:_collect_offers:6194` | 2 | 0.5 |
| `js/game.js:aiScanBodies` | 57 | `sim/ai_human.gd:tick:23` | 37 | 3.9 |
|  |  | `sim/sim_state.gd:new_game:117` | 24 | 2.5 |
|  |  | `sim/ai_alien.gd:tick:231` | 22 | 2.3 |
| `js/game.js:alienReportWorth` | 30 | `sim/ai_alien.gd:_decide:297` | 11 | 1.4 |
|  |  | `sim/ai_human.gd:tick:23` | 10 | 1.3 |
|  |  | `main.gd:_run_aiporttest:1918` | 8 | 1.1 |
| `js/game.js:lootRun` | 21 | `main.gd:_refresh_dev_panel:4029` | 11 | 1.9 |
|  |  | `sim/ai_alien.gd:_decide:297` | 11 | 1.9 |
|  |  | `sim/ai_human.gd:tick:23` | 10 | 1.7 |
| `js/game.js:dropStaleFix` | 11 | `sim/sim_state.gd:new_game:117` | 6 | 1.8 |
|  |  | `sim/ai_human.gd:tick:23` | 5 | 1.5 |
|  |  | `sim/sim_state.gd:dawn:1561` | 5 | 1.5 |
| `js/game.js:taskThreat` | 14 | `sim/ai_human.gd:tick:23` | 12 | 2.7 |
|  |  | `sim/sim_state.gd:tick_agents:513` | 9 | 2.0 |
|  |  | `sim/ai_alien.gd:_decide:297` | 8 | 1.8 |
| `js/game.js:findHideBody` | 13 | `sim/ai_alien.gd:_decide:297` | 7 | 1.9 |
|  |  | `sim/ai_human.gd:tick:23` | 7 | 1.9 |
|  |  | `main.gd:_refresh_dev_panel:4029` | 6 | 1.7 |
| `js/game.js:recentWitness` | 10 | `sim/sim_state.gd:_track_pass:1229` | 7 | 2.2 |
|  |  | `main.gd:_run_aiporttest:1918` | 5 | 1.6 |
|  |  | `main.gd:_run_socialtest:2487` | 5 | 1.6 |
| `js/game.js:exitDistAt` | 6 | `scene_extras.gd:_task_placement:245` | 2 | 0.8 |
|  |  | `sim/ai_alien.gd:setup:24` | 2 | 0.8 |
|  |  | `sim/ai_alien.gd:_exit_dist:54` | 2 | 0.8 |
| `js/game.js:crowdAt` | 8 | `main.gd:_run_probetest:1300` | 5 | 1.9 |
|  |  | `main.gd:_run_aiporttest:1918` | 5 | 1.9 |
|  |  | `main.gd:_nearest_knife_target:6145` | 5 | 1.9 |
| `js/game.js:watchersAt` | 13 | `sim/ai_alien.gd:_decide:297` | 12 | 3.0 |
|  |  | `sim/ai_alien.gd:_exposure_at:64` | 8 | 2.0 |
|  |  | `main.gd:_run_aiporttest:1918` | 6 | 1.5 |
| `js/game.js:reportAlibiSpot` | 11 | `sim/speech.gd:on_meeting_open:737` | 5 | 1.6 |
|  |  | `main.gd:_collect_offers:6194` | 4 | 1.3 |
|  |  | `main.gd:_run_ceilshot:7974` | 4 | 1.3 |
| `js/game.js:alienAudienceInfo` | 23 | `sim/ai_alien.gd:_decide:297` | 16 | 2.7 |
|  |  | `sim/ai_alien.gd:tick:231` | 8 | 1.4 |
|  |  | `sim/ai_alien.gd:_try_disguise:660` | 8 | 1.4 |
| `js/game.js:audienceHotRooms` | 10 | `sim/mind.gd:check_alibi:1055` | 8 | 2.5 |
|  |  | `sim/speech.gd:_alibi_caught:529` | 8 | 2.5 |
|  |  | `sim/ai_alien.gd:_hunt_spot:91` | 6 | 1.9 |
| `js/game.js:disguiseOptions` | 89 | `sim/ai_alien.gd:_decide:297` | 19 | 1.7 |
|  |  | `sim/ai_alien.gd:_try_disguise:660` | 19 | 1.7 |
|  |  | `main.gd:_collect_offers:6194` | 17 | 1.5 |
| `js/game.js:disguiseRiskParts` | 15 | `sim/mind.gd:disguise_risk:360` | 15 | 2.5 |
|  |  | `sim/ai_alien.gd:_decide:297` | 6 | 1.0 |
|  |  | `sim/ai_alien.gd:_try_disguise:660` | 4 | 0.7 |
| `js/game.js:alienPlan` | 131 | `sim/ai_alien.gd:_decide:297` | 35 | 2.6 |
|  |  | `main.gd:_collect_offers:6194` | 22 | 1.6 |
|  |  | `sim/ai_alien.gd:_try_disguise:660` | 22 | 1.6 |
| `js/game.js:alienSupport` | 77 | `sim/ai_alien.gd:_decide:297` | 28 | 3.0 |
|  |  | `sim/sim_state.gd:new_game:117` | 26 | 2.8 |
|  |  | `main.gd:_refresh_dev_panel:4029` | 24 | 2.5 |
| `js/game.js:alienMateRevive` | 16 | `sim/ai_human.gd:tick:23` | 15 | 2.8 |
|  |  | `sim/sim_state.gd:tick_agents:513` | 13 | 2.4 |
|  |  | `sim/ai_alien.gd:_decide:297` | 12 | 2.2 |
| `js/game.js:huntSpotFor` | 43 | `sim/ai_alien.gd:_hunt_spot:91` | 12 | 2.2 |
|  |  | `sim/ai_alien.gd:_decide:297` | 11 | 2.0 |
|  |  | `main.gd:_run_aiporttest:1918` | 10 | 1.8 |
| `js/game.js:setAct` | 5 | `main.gd:_collect_offers:6194` | 3 | 1.0 |
|  |  | `sim/sim_state.gd:tick_agents:513` | 3 | 1.0 |
|  |  | `main.gd:_breaker_offer:6611` | 2 | 0.7 |
| `js/game.js:tickActs` | 13 | `sim/sim_state.gd:tick_agents:513` | 11 | 2.8 |
|  |  | `sim/sim_state.gd:_reset_agent_night:731` | 8 | 2.1 |
|  |  | `main.gd:_collect_offers:6194` | 7 | 1.8 |
| `js/game.js:actOffset` | 13 | `main.gd:_draw:30` | 5 | 1.3 |
|  |  | `sim/crew_view.gd:_sync_model:281` | 5 | 1.3 |
|  |  | `main.gd:_run_probetest:1300` | 4 | 1.0 |
| `js/game.js:screamFor` | 8 | `main.gd:_run_audiotest:3126` | 5 | 1.5 |
|  |  | `main.gd:_run_probetest:1300` | 4 | 1.2 |
|  |  | `main.gd:_play_new_events:7147` | 4 | 1.2 |
| `js/game.js:secJail` | 4 | **无候选 → 真缺口** | 0 | 0 |
| `js/game.js:renderEndTables` | 40 | `main.gd:_run_probetest:1300` | 19 | 2.4 |
|  |  | `main.gd:_run_settletest:2317` | 18 | 2.3 |
|  |  | `sim/sim_state.gd:new_game:117` | 16 | 2.0 |
| `js/game.js:endGame` | 22 | `main.gd:_run_aittest:7712` | 10 | 1.2 |
|  |  | `sim/sim_state.gd:_end:2372` | 8 | 1.0 |
|  |  | `main.gd:_run_sim1000:4386` | 7 | 0.9 |
| `js/game.js:say` | 54 | `sim/speech.gd:_emit:963` | 18 | 2.0 |
|  |  | `sim/speech.gd:player_say:1108` | 15 | 1.7 |
|  |  | `sim/speech.gd:on_meeting_open:737` | 14 | 1.6 |
| `js/game.js:markNewLines` | 7 | `home_view.gd:_select:376` | 2 | 0.6 |
|  |  | `main.gd:_tap_mouse:1283` | 2 | 0.6 |
| `js/game.js:clearNewLines` | 4 | `home_view.gd:_select:376` | 2 | 0.6 |
|  |  | `main.gd:_tap_mouse:1283` | 2 | 0.6 |
| `js/game.js:seenNames` | 11 | `main.gd:_collect_offers:6194` | 5 | 1.6 |
|  |  | `sim/speech.gd:plan_alien_deception:111` | 5 | 1.6 |
|  |  | `main.gd:_run_crewanimtest:963` | 4 | 1.3 |
| `js/game.js:victimInfo` | 10 | `main.gd:_collect_offers:6194` | 8 | 1.6 |
|  |  | `sim/sim_state.gd:new_game:117` | 7 | 1.4 |
|  |  | `main.gd:_run_speechtest:4526` | 6 | 1.2 |
| `js/game.js:counterfactualReach` | 8 | `sim/ai_alien.gd:_decide:297` | 4 | 0.9 |
|  |  | `sim/grid_nav.gd:_d2seg:230` | 4 | 0.9 |
|  |  | `main.gd:_run_ceilshot:7974` | 3 | 0.7 |
| `js/game.js:buildMeetCtx` | 408 | `sim/speech.gd:plan_alien_deception:111` | 44 | 2.3 |
|  |  | `sim/speech.gd:on_meeting_open:737` | 36 | 1.9 |
|  |  | `sim/speech.gd:plan_mate_bus:381` | 35 | 1.9 |
| `js/game.js:fillTpl` | 22 | `sim/lines_data.gd:fill:110` | 10 | 2.6 |
|  |  | `main.gd:_collect_offers:6194` | 5 | 1.3 |
|  |  | `sim/speech.gd:on_meeting_open:737` | 5 | 1.3 |
| `js/game.js:pickLine` | 38 | `sim/speech.gd:_pick:932` | 12 | 1.8 |
|  |  | `sim/speech.gd:on_meeting_open:737` | 6 | 0.9 |
|  |  | `sim/speech.gd:_emit:963` | 6 | 0.9 |
| `js/game.js:flavor` | 1 | `sim/speech.gd:_pick:932` | 3 | 1.2 |
|  |  | `sim/speech.gd:_d:52` | 2 | 0.8 |
|  |  | `sim/speech.gd:_emit:963` | 2 | 0.8 |
| `js/game.js:evRoomName` | 5 | `home_ship_map.gd:_draw:54` | 2 | 0.8 |
|  |  | `main.gd:_run_aiporttest:1918` | 2 | 0.8 |
|  |  | `main.gd:_collect_offers:6194` | 2 | 0.8 |
| `js/game.js:evClause` | 6 | `sim/speech.gd:_ai_line:1048` | 5 | 1.2 |
|  |  | `main.gd:_run_socialtest:2487` | 3 | 0.7 |
|  |  | `main.gd:_run_speechtest:4526` | 3 | 0.7 |
| `js/game.js:defenseClause` | 22 | `main.gd:_run_speechtest:4526` | 5 | 1.0 |
|  |  | `sim/lines_data.gd:fill:110` | 5 | 1.0 |
|  |  | `sim/speech.gd:plan_alien_deception:111` | 4 | 0.8 |
| `js/game.js:openingLine` | 11 | `main.gd:_collect_offers:6194` | 6 | 1.3 |
|  |  | `sim/speech.gd:plan_alien_deception:111` | 4 | 0.9 |
|  |  | `sim/speech.gd:plan_mate_bus:381` | 4 | 0.9 |
| `js/game.js:alibiLine` | 43 | `sim/speech.gd:plan_alien_deception:111` | 11 | 1.5 |
|  |  | `sim/speech.gd:_emit:963` | 10 | 1.3 |
|  |  | `sim/speech.gd:player_say:1108` | 10 | 1.3 |
| `js/game.js:pickChallenge` | 14 | `sim/speech.gd:player_say:1108` | 6 | 1.7 |
|  |  | `sim/lines_data.gd:parse_speech:148` | 4 | 1.2 |
|  |  | `main.gd:_run_speechtest:4526` | 3 | 0.9 |
| `js/game.js:challengeText` | 10 | `main.gd:_run_speechtest:4526` | 5 | 1.3 |
|  |  | `main.gd:_meet_template_text:5465` | 5 | 1.3 |
|  |  | `sim/lines_data.gd:parse_speech:148` | 5 | 1.3 |
| `js/game.js:respondText` | 13 | `sim/speech.gd:player_say:1108` | 6 | 1.3 |
|  |  | `main.gd:_run_speechtest:4526` | 5 | 1.0 |
|  |  | `main.gd:_meet_template_text:5465` | 5 | 1.0 |
| `js/game.js:actWord` | 10 | `sim/mind.gd:env_estimate:604` | 7 | 2.3 |
|  |  | `main.gd:_run_speechtest:4526` | 6 | 2.0 |
|  |  | `sim/speech.gd:plan_alien_deception:111` | 5 | 1.7 |
| `js/game.js:evidenceCore` | 31 | `sim/speech.gd:plan_alien_deception:111` | 10 | 1.6 |
|  |  | `sim/speech.gd:plan_mate_bus:381` | 7 | 1.2 |
|  |  | `sim/mind.gd:env_estimate:604` | 6 | 1.0 |
| `js/game.js:evidenceLead` | 1 | `main.gd:_run_leadtest:2665` | 2 | 0.8 |
|  |  | `sim/speech.gd:_emit:963` | 2 | 0.8 |
| `js/game.js:accuseLine` | 41 | `sim/speech.gd:plan_alien_deception:111` | 15 | 2.1 |
|  |  | `sim/speech.gd:plan_mate_bus:381` | 14 | 2.0 |
|  |  | `sim/speech.gd:_emit:963` | 13 | 1.8 |
| `js/game.js:pickResponder` | 6 | `sim/speech.gd:on_meeting_open:737` | 4 | 1.5 |
|  |  | `sim/speech.gd:player_say:1108` | 4 | 1.5 |
|  |  | `main.gd:_event_feed:7429` | 3 | 1.1 |
| `js/game.js:decideAlienDoubt` | 12 | `sim/speech.gd:plan_alien_deception:111` | 8 | 1.9 |
|  |  | `sim/sim_state.gd:_quick_report_sus:1506` | 6 | 1.4 |
|  |  | `sim/speech.gd:plan_mate_bus:381` | 6 | 1.4 |
| `js/game.js:startChatter` | 436 | `sim/speech.gd:on_meeting_open:737` | 65 | 3.6 |
|  |  | `sim/speech.gd:plan_alien_deception:111` | 50 | 2.8 |
|  |  | `sim/speech.gd:plan_mate_bus:381` | 32 | 1.8 |
| `js/game.js:playerTalk` | 259 | `sim/speech.gd:player_say:1108` | 52 | 3.7 |
|  |  | `main.gd:_run_speechtest:4526` | 35 | 2.5 |
|  |  | `sim/speech.gd:plan_alien_deception:111` | 34 | 2.4 |
| `js/game.js:syncMeetTemplates` | 57 | `sim/speech.gd:on_meeting_open:737` | 12 | 1.5 |
|  |  | `main.gd:_run_probetest:1300` | 11 | 1.4 |
|  |  | `main.gd:_run_speechtest:4526` | 11 | 1.4 |
| `js/game.js:sendPlayerSpeech` | 9 | `sim/speech.gd:player_say:1108` | 9 | 1.9 |
|  |  | `main.gd:_run_meetuitest:1656` | 8 | 1.7 |
|  |  | `main.gd:_run_speechtest:4526` | 8 | 1.7 |
| `js/game.js:meetingTimer` | 13 | `sim/sim_state.gd:_tick_meeting:1984` | 7 | 1.4 |
|  |  | `sim/sim_state.gd:cast_vote:1628` | 5 | 1.0 |
|  |  | `sim/sim_state.gd:open_meeting_kind:1430` | 4 | 0.8 |
| `js/game.js:hypothesisCompeting` | 3 | `sim/sim_state.gd:_ai_vote_target:1683` | 4 | 1.6 |
|  |  | `sim/sim_state.gd:vote_lean:1784` | 3 | 1.2 |
|  |  | `sim/mind.gd:hypothesis_spread:1422` | 2 | 0.8 |
| `js/game.js:identityAlien` | 4 | **无候选 → 真缺口** | 0 | 0 |
| `js/game.js:trustProb` | 1 | `sim/ai_alien.gd:_decide:297` | 2 | 0.8 |
| `js/game.js:hostileTo` | 3 | `sim/ai_alien.gd:_decide:297` | 2 | 0.8 |
| `js/game.js:hostileWeight` | 5 | `sim/ai_alien.gd:_decide:297` | 5 | 1.6 |
|  |  | `sim/mind.gd:identity_cfg:40` | 2 | 0.6 |
|  |  | `sim/mind.gd:hostile_prob:138` | 2 | 0.6 |
| `js/game.js:weightedHostileTarget` | 11 | `sim/speech.gd:on_meeting_open:737` | 6 | 1.8 |
|  |  | `sim/speech.gd:plan_alien_deception:111` | 5 | 1.5 |
|  |  | `sim/speech.gd:player_say:1108` | 5 | 1.5 |
| `js/game.js:alienSocialPick` | 21 | `sim/sim_state.gd:_ai_vote_target:1683` | 7 | 1.3 |
|  |  | `sim/speech.gd:plan_alien_deception:111` | 7 | 1.3 |
|  |  | `sim/ai_alien.gd:_decide:297` | 6 | 1.2 |
| `js/game.js:alienFrameTarget` | 13 | `sim/speech.gd:plan_alien_deception:111` | 10 | 2.3 |
|  |  | `sim/sim_state.gd:_soft_hot_target:1956` | 6 | 1.4 |
|  |  | `sim/ai_alien.gd:_decide:297` | 4 | 0.9 |
| `js/game.js:alienPackLead` | 10 | `sim/sim_state.gd:_ai_vote_target:1683` | 8 | 2.5 |
|  |  | `sim/speech.gd:plan_mate_bus:381` | 8 | 2.5 |
|  |  | `main.gd:_run_aiporttest:1918` | 6 | 1.9 |
| `js/game.js:mateFollowChance` | 5 | `sim/mind.gd:init_agent:188` | 4 | 1.4 |
|  |  | `sim/sim_state.gd:_cast_ai_votes:1916` | 4 | 1.4 |
|  |  | `sim/ai_alien.gd:_decide:297` | 3 | 1.1 |
| `js/game.js:descDistort` | 28 | `sim/mind.gd:note_testimony:985` | 29 | 4.3 |
|  |  | `sim/speech.gd:plan_alien_deception:111` | 11 | 1.6 |
|  |  | `sim/mind.gd:env_estimate:604` | 10 | 1.5 |
| `js/game.js:deliverTestimony` | 39 | `sim/speech.gd:plan_alien_deception:111` | 14 | 2.0 |
|  |  | `sim/speech.gd:plan_first_accusation:672` | 14 | 2.0 |
|  |  | `sim/mind.gd:note_testimony:985` | 13 | 1.9 |
| `js/game.js:renderVoteButtons` | 35 | `main.gd:_refresh_meeting_ui:5614` | 10 | 1.4 |
|  |  | `sim/speech.gd:on_meeting_open:737` | 8 | 1.2 |
|  |  | `main.gd:_run_probetest:1300` | 6 | 0.9 |
| `js/game.js:startVote` | 202 | `sim/sim_state.gd:_ai_vote_target:1683` | 25 | 1.9 |
|  |  | `main.gd:_run_socialtest:2487` | 24 | 1.8 |
|  |  | `sim/speech.gd:on_meeting_open:737` | 21 | 1.6 |
| `js/game.js:closeVote` | 61 | `sim/sim_state.gd:_close_meeting:2032` | 21 | 2.2 |
|  |  | `main.gd:_run_probetest:1300` | 15 | 1.6 |
|  |  | `sim/mind.gd:settle_accountability:1578` | 11 | 1.1 |
| `js/game.js:renderTally` | 18 | `main.gd:_meeting_result_text:5776` | 9 | 1.5 |
|  |  | `sim/sim_state.gd:_close_meeting:2032` | 9 | 1.5 |
|  |  | `main.gd:_run_probetest:1300` | 8 | 1.3 |
| `js/game.js:resize` | 10 | `home_ship_map.gd:_draw:54` | 2 | 0.4 |
|  |  | `home_view.gd:_build:77` | 2 | 0.4 |
|  |  | `main.gd:_build_fx:3502` | 2 | 0.4 |
| `js/game.js:updateCamera` | 11 | `minimap.gd:_draw:48` | 2 | 0.5 |
| `js/game.js:clickAt` | 18 | `main.gd:_run_probetest:1300` | 4 | 1.0 |
|  |  | `main.gd:_run_knifetest:1198` | 3 | 0.8 |
|  |  | `main.gd:_run_meetuitest:1656` | 3 | 0.8 |
| `js/game.js:collectInteractions` | 76 | `main.gd:_collect_offers:6194` | 63 | 5.3 |
|  |  | `sim/sim_state.gd:new_game:117` | 29 | 2.4 |
|  |  | `main.gd:_refresh_dev_panel:4029` | 26 | 2.2 |
| `js/game.js:openWheel` | 21 | `sim/sim_state.gd:new_game:117` | 7 | 1.1 |
|  |  | `main.gd:_run_probetest:1300` | 6 | 0.9 |
|  |  | `sim/crew_view.gd:_sync_model:281` | 6 | 0.9 |
| `js/game.js:closeWheel` | 5 | **无候选 → 真缺口** | 0 | 0 |
| `js/game.js:pickWheel` | 7 | `main.gd:_run_interacttest:3228` | 2 | 0.8 |
|  |  | `main.gd:_update_interaction:5979` | 2 | 0.8 |
|  |  | `ui_wheel.gd:open:66` | 2 | 0.8 |
| `js/game.js:interact` | 27 | `main.gd:_collect_offers:6194` | 15 | 2.1 |
|  |  | `sim/sim_state.gd:new_game:117` | 13 | 1.8 |
|  |  | `main.gd:_run_bottest:4870` | 10 | 1.4 |
| `js/game.js:secbotRaidOk` | 24 | `main.gd:_run_aiporttest:1918` | 7 | 2.2 |
|  |  | `sim/mind.gd:cred_broadcast:1473` | 7 | 2.2 |
|  |  | `sim/sim_state.gd:toggle_power:2213` | 7 | 2.2 |
| `js/game.js:closeBodyCard` | 14 | `main.gd:_run_actiontest:3168` | 2 | 0.4 |
|  |  | `main.gd:_collect_offers:6194` | 2 | 0.4 |
|  |  | `main.gd:_run_meetingtest:7656` | 2 | 0.4 |
| `js/game.js:pulseHud` | 8 | `home_ship_map.gd:_draw:54` | 2 | 0.5 |
|  |  | `home_view.gd:_make_role_card:292` | 2 | 0.5 |
|  |  | `home_view.gd:_select:376` | 2 | 0.5 |
| `js/game.js:note` | 1 | `home_view.gd:_build:77` | 2 | 0.8 |
| `js/game.js:prep` | 13 | `main.gd:_run_audiotest:3126` | 3 | 0.9 |
|  |  | `sim/sim_state.gd:new_game:117` | 3 | 0.9 |
|  |  | `sim/speech.gd:plan_alien_deception:111` | 3 | 0.9 |
| `js/game.js:C` | 1 | **无候选 → 真缺口** | 0 | 0 |
| `js/game.js:beep` | 9 | `audio.gd:set_on:135` | 2 | 0.4 |
|  |  | `audio.gd:play:163` | 2 | 0.4 |
|  |  | `main.gd:_ready:234` | 2 | 0.4 |
| `js/game.js:noise` | 11 | `main.gd:_ready:234` | 4 | 0.7 |
|  |  | `audio.gd:play:163` | 2 | 0.3 |
|  |  | `main.gd:_run_audiotest:3126` | 2 | 0.3 |
| `js/game.js:noiseLp` | 14 | `audio.gd:play:163` | 2 | 0.3 |
|  |  | `main.gd:_ready:234` | 2 | 0.3 |
|  |  | `main.gd:_run_audiotest:3126` | 2 | 0.3 |
| `js/game.js:loadImg` | 1 | `main.gd:_ready:234` | 3 | 1.2 |
|  |  | `main.gd:_run_e2e:827` | 2 | 0.8 |
|  |  | `main.gd:_run_crewshot:1020` | 2 | 0.8 |
| `js/game.js:patFor` | 10 | `home_view.gd:_select:376` | 3 | 0.7 |
|  |  | `home_view.gd:_make_role_card:292` | 2 | 0.4 |
|  |  | `main.gd:_ready:234` | 2 | 0.4 |
| `js/game.js:drawLegacyMap` | 33 | `home_ship_map.gd:_draw:54` | 8 | 0.9 |
|  |  | `minimap.gd:_draw:48` | 7 | 0.8 |
|  |  | `main.gd:_run_powertest:2849` | 4 | 0.5 |
| `js/game.js:drawCorridorLights` | 24 | `minimap.gd:_draw:48` | 3 | 0.5 |
|  |  | `home_ship_map.gd:_draw:54` | 2 | 0.4 |
|  |  | `main.gd:_player_room_lit:3606` | 2 | 0.4 |
| `js/game.js:drawRobotBody` | 45 | `home_ship_map.gd:_draw:54` | 5 | 0.7 |
|  |  | `main.gd:_run_probetest:1300` | 4 | 0.6 |
|  |  | `main.gd:_collect_offers:6194` | 4 | 0.6 |
| `js/game.js:drawMedDrone` | 93 | `scene_extras.gd:_drone:593` | 5 | 0.5 |
|  |  | `sim/bots.gd:setup:59` | 5 | 0.5 |
|  |  | `main.gd:_ready:234` | 4 | 0.4 |
| `js/game.js:botLabelText` | 7 | `main.gd:_collect_offers:6194` | 6 | 1.5 |
|  |  | `sim/bots.gd:setup:59` | 6 | 1.5 |
|  |  | `main.gd:_run_actiontest:3168` | 4 | 1.0 |
| `js/game.js:drawBotLabel` | 14 | `main.gd:_build_meeting_ui:5218` | 5 | 0.8 |
|  |  | `minimap.gd:_draw:48` | 5 | 0.8 |
|  |  | `home_ship_map.gd:_draw:54` | 4 | 0.6 |
| `js/game.js:drawFacilities` | 240 | `main.gd:_collect_offers:6194` | 23 | 1.5 |
|  |  | `sim/sim_state.gd:new_game:117` | 20 | 1.3 |
|  |  | `sim/ai_alien.gd:_decide:297` | 19 | 1.3 |
| `js/game.js:drawPipes` | 16 | `home_ship_map.gd:_draw:54` | 4 | 0.7 |
|  |  | `map_builder.gd:_build_cover:748` | 4 | 0.7 |
|  |  | `sim/speech.gd:plan_alien_deception:111` | 4 | 0.7 |
| `js/game.js:drawReqTable` | 28 | `minimap.gd:_draw:48` | 8 | 1.0 |
|  |  | `main.gd:_collect_offers:6194` | 5 | 0.6 |
|  |  | `main.gd:_refresh_sim_hud:7367` | 5 | 0.6 |
| `js/game.js:drawDoors` | 81 | `main.gd:_run_powertest:2849` | 7 | 0.8 |
|  |  | `scene_extras.gd:_build_doors:501` | 6 | 0.7 |
|  |  | `main.gd:_ready:234` | 4 | 0.5 |
| `js/game.js:drawWaves` | 27 | `home_ship_map.gd:_draw:54` | 4 | 0.7 |
|  |  | `sim/speech.gd:on_meeting_open:737` | 4 | 0.7 |
|  |  | `sim/speech.gd:_emit:963` | 4 | 0.7 |
| `js/game.js:drawCams` | 98 | `minimap.gd:_draw:48` | 15 | 1.2 |
|  |  | `main.gd:_collect_offers:6194` | 14 | 1.1 |
|  |  | `main.gd:_run_probetest:1300` | 11 | 0.9 |
| `js/game.js:pill` | 8 | `home_ship_map.gd:_draw:54` | 4 | 0.7 |
|  |  | `home_view.gd:_build:77` | 4 | 0.7 |
|  |  | `main.gd:_build_meeting_ui:5218` | 3 | 0.5 |
| `js/game.js:drawWrenchShape` | 31 | `main.gd:_draw:30` | 4 | 0.7 |
|  |  | `sim/crew_view.gd:_sync_model:281` | 4 | 0.7 |
|  |  | `device.gd:_add_faceplate:106` | 2 | 0.4 |
| `js/game.js:drawIcon` | 21 | `main.gd:_draw:30` | 3 | 0.5 |
|  |  | `scene_extras.gd:_build_decor:443` | 3 | 0.5 |
|  |  | `sim/crew_view.gd:_sync_model:281` | 3 | 0.5 |
| `js/game.js:drawWork` | 76 | `main.gd:_refresh_dev_panel:4029` | 7 | 0.7 |
|  |  | `sim/crew_view.gd:_sync_model:281` | 7 | 0.7 |
|  |  | `sim/sim_state.gd:new_game:117` | 7 | 0.7 |
| `js/game.js:drawWeapon` | 49 | `main.gd:_collect_offers:6194` | 11 | 1.3 |
|  |  | `main.gd:_run_probetest:1300` | 10 | 1.1 |
|  |  | `sim/sim_state.gd:new_game:117` | 10 | 1.1 |
| `js/game.js:drawFxSprite` | 16 | `main.gd:_run_meetuitest:1656` | 2 | 0.4 |
|  |  | `map_builder.gd:_poly_center:668` | 2 | 0.4 |
|  |  | `sim/speech.gd:plan_alien_deception:111` | 2 | 0.4 |
| `js/game.js:drawFx` | 220 | `main.gd:_collect_offers:6194` | 9 | 0.8 |
|  |  | `main.gd:_run_probetest:1300` | 7 | 0.6 |
|  |  | `sim/ai_human.gd:_decide:240` | 7 | 0.6 |
| `js/game.js:drawNameTag` | 24 | `sim/lines_data.gd:parse_speech:148` | 5 | 0.7 |
|  |  | `home_ship_map.gd:_draw:54` | 4 | 0.6 |
|  |  | `main.gd:_run_arttest:3322` | 4 | 0.6 |
| `js/game.js:coverOutline` | 22 | `main.gd:_draw:30` | 5 | 0.8 |
|  |  | `sim/crew_view.gd:_sync_model:281` | 5 | 0.8 |
|  |  | `main.gd:_run_knifetest:1198` | 3 | 0.5 |
| `js/game.js:drawTaskCoverFlash` | 25 | `home_ship_map.gd:_draw:54` | 3 | 0.4 |
|  |  | `sim/ai_alien.gd:_decide:297` | 3 | 0.4 |
|  |  | `sim/speech.gd:plan_alien_deception:111` | 3 | 0.4 |
| `js/game.js:drawTaskMarkers` | 50 | `minimap.gd:_draw:48` | 10 | 1.2 |
|  |  | `home_ship_map.gd:_draw:54` | 8 | 0.9 |
|  |  | `main.gd:_collect_offers:6194` | 7 | 0.8 |
| `js/game.js:tintedSheet` | 17 | `home_view.gd:_build:77` | 2 | 0.4 |
|  |  | `main.gd:_build_fx:3502` | 2 | 0.4 |
|  |  | `scene_extras.gd:_build_doors:501` | 2 | 0.4 |
| `js/game.js:drawMini` | 126 | `minimap.gd:_draw:48` | 52 | 4.1 |
|  |  | `main.gd:_collect_offers:6194` | 24 | 1.9 |
|  |  | `sim/sim_state.gd:new_game:117` | 23 | 1.8 |
| `js/game.js:visibleAt` | 6 | `main.gd:_run_probetest:1300` | 5 | 1.4 |
|  |  | `main.gd:_run_knifetest:1198` | 4 | 1.1 |
|  |  | `main.gd:_collect_offers:6194` | 4 | 1.1 |
| `js/game.js:canSee` | 4 | `main.gd:_run_probetest:1300` | 3 | 1.2 |
|  |  | `main.gd:_collect_offers:6194` | 3 | 1.2 |
|  |  | `main.gd:_player_fire:7054` | 3 | 1.2 |
| `js/game.js:drawFog` | 82 | `minimap.gd:_draw:48` | 15 | 1.3 |
|  |  | `sim/sim_state.gd:new_game:117` | 11 | 0.9 |
|  |  | `home_ship_map.gd:_draw:54` | 10 | 0.9 |
| `js/game.js:renderTaskList` | 35 | `sim/sim_state.gd:new_game:117` | 10 | 1.6 |
|  |  | `sim/speech.gd:player_say:1108` | 9 | 1.4 |
|  |  | `main.gd:_run_simtest:7800` | 7 | 1.1 |
| `js/game.js:syncHud` | 101 | `sim/sim_state.gd:new_game:117` | 34 | 2.9 |
|  |  | `main.gd:_refresh_sim_hud:7367` | 29 | 2.5 |
|  |  | `main.gd:_collect_offers:6194` | 26 | 2.2 |
| `js/game.js:simRng` | 9 | **无候选 → 真缺口** | 0 | 0 |
| `js/game.js:simGame` | 193 | `main.gd:_run_sim1000:4386` | 26 | 1.4 |
|  |  | `sim/sim_state.gd:new_game:117` | 20 | 1.1 |
|  |  | `sim/ai_alien.gd:_decide:297` | 18 | 1.0 |
| `js/game.js:bindEntry` | 7 | `main.gd:_run_meetuitest:1656` | 2 | 0.6 |
| `js/ai/sanity.js:rollCharisma` | 6 | `sim/speech.gd:roll_leader:73` | 4 | 1.6 |
|  |  | `sim/mind.gd:init_agent:188` | 2 | 0.8 |
|  |  | `sim/sim_state.gd:new_game:117` | 2 | 0.8 |
| `js/ai/traits.js:roll` | 5 | `sim/mind.gd:init_agent:188` | 2 | 0.8 |
| `js/t2/space.js:corridorLampPos` | 16 | `home_ship_map.gd:_draw:54` | 2 | 0.8 |
|  |  | `main.gd:_ready:234` | 2 | 0.8 |
|  |  | `main.gd:_on_device_done:6914` | 2 | 0.8 |
| `js/t2/space.js:rowForAng` | 5 | `sim/crew_view.gd:_sync_model:281` | 5 | 1.7 |
|  |  | `main.gd:_sync_bots:7327` | 4 | 1.3 |
|  |  | `main.gd:_draw:30` | 3 | 1.0 |
| `js/t2/space.js:dirAng` | 7 | `main.gd:_ready:234` | 4 | 1.6 |
|  |  | `sim/crew_view.gd:_sync_model:281` | 4 | 1.6 |
|  |  | `main.gd:_run_e2e:827` | 3 | 1.2 |
| `js/t2/space.js:workStyle` | 8 | `main.gd:_refresh_dev_panel:4029` | 6 | 1.3 |
|  |  | `main.gd:_collect_offers:6194` | 5 | 1.1 |
|  |  | `sim/ai_human.gd:_decide:240` | 4 | 0.9 |
| `js/t2/space.js:k1` | 1 | **无候选 → 真缺口** | 0 | 0 |
| `js/t2/decision.js:seatNo` | 1 | **无候选 → 真缺口** | 0 | 0 |
| `js/t2/decision.js:tagByName` | 5 | `sim/speech.gd:player_say:1108` | 4 | 1.3 |
|  |  | `main.gd:_refresh_dev_panel:4029` | 3 | 0.9 |
|  |  | `minimap.gd:_draw:48` | 3 | 0.9 |
| `js/t2/decision.js:nameOf` | 4 | `minimap.gd:_draw:48` | 3 | 1.2 |
|  |  | `main.gd:_run_knifetest:1198` | 2 | 0.8 |
|  |  | `main.gd:_run_probetest:1300` | 2 | 0.8 |
| `js/t2/decision.js:seatIndex` | 6 | `main.gd:_run_crewanimtest:963` | 3 | 1.1 |
|  |  | `main.gd:_run_probetest:1300` | 3 | 1.1 |
|  |  | `main.gd:_run_socialtest:2487` | 3 | 1.1 |
| `js/t2/decision.js:nightMeetLeft` | 5 | `main.gd:_refresh_sim_hud:7367` | 6 | 1.7 |
|  |  | `sim/sim_state.gd:open_meeting_kind:1430` | 6 | 1.7 |
|  |  | `sim/sim_state.gd:new_game:117` | 4 | 1.1 |
| `js/t2/decision.js:stopChatter` | 5 | **无候选 → 真缺口** | 0 | 0 |
| `js/t2/decision.js:meetLater` | 10 | `sim/speech.gd:on_meeting_open:737` | 4 | 1.0 |
|  |  | `main.gd:_run_actiontest:3168` | 3 | 0.7 |
|  |  | `sim/sim_state.gd:open_meeting_kind:1430` | 3 | 0.7 |
| `js/t2/decision.js:sayStreakOK` | 17 | `sim/speech.gd:on_meeting_open:737` | 7 | 1.6 |
|  |  | `sim/speech.gd:_emit:963` | 5 | 1.1 |
|  |  | `sim/speech.gd:player_say:1108` | 5 | 1.1 |

## 无任何候选（必然要新写）

- `js/game.js:nearPipeXY`（4 行）
- `js/game.js:exitToMenu`（1 行）
- `js/game.js:pipeOpts`（1 行）
- `js/game.js:nearMonitor`（4 行）
- `js/game.js:closeSabPick`（5 行）
- `js/game.js:secJail`（4 行）
- `js/game.js:identityAlien`（4 行）
- `js/game.js:closeWheel`（5 行）
- `js/game.js:C`（1 行）
- `js/game.js:simRng`（9 行）
- `js/t2/space.js:k1`（1 行）
- `js/t2/decision.js:seatNo`（1 行）
- `js/t2/decision.js:stopChatter`（5 行）
