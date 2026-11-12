/* 一次性把 spec/gameplay-parity.json 的 pending 清零（2026-11-11 批次）。
 * 用法：node 3d/tools/apply-parity-map.cjs [--dry]
 * 规则：每条都给 target（必须真实存在于 3d/preview/scripts，写错直接报错退出）
 * 或标 not-applicable（note 里写清 2.5D 侧函数行号 + 3D 由谁承担）。
 * 目标存在性校验与 check-gameplay-parity.cjs 同一套索引逻辑。
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const SCRIPTS = path.join(ROOT, '3d', 'preview', 'scripts');
const SPEC = path.join(ROOT, '3d', 'spec', 'gameplay-parity.json');
const DRY = process.argv.includes('--dry');

function walk(dir, acc = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, acc); else if (e.name.endsWith('.gd')) acc.push(p);
  }
  return acc;
}
const gdNames = new Set();
for (const f of walk(SCRIPTS)) {
  for (const m of fs.readFileSync(f, 'utf8').match(/^func\s+([A-Za-z_][\w]*)/gm) || []) {
    gdNames.add(path.relative(SCRIPTS, f).replace(/\\/g, '/') + ':' + m.slice(5));
  }
}

/* key → [status, target, note] */
const MAP = {
  // ---- 本批新移植（2.5D 原文逐行 → GDScript）----
  'js/game.js:doorTick': ['ported', 'sim/sim_state.gd:door_tick',
    'js/game.js:448 doorTick 逐行移植：断电 2s 扫描 / 滞回半径 / 全船一致（含会议室）；门状态归 sim，scene_extras.sync_doors 只做表现'],
  'js/game.js:secbotRaidOk': ['ported', 'sim/sim_state.gd:secbot_raid_ok',
    'js/game.js:8365 逐行移植：≥2 名 8 格内队友 + 共同目标 ≤7 格 + 0.45 掷骰；ai_alien._decide 机器人分支已接入'],
  'js/game.js:aiGhost': ['ported', 'sim/sim_state.gd:_ghost_tick',
    'js/game.js:2371 逐行移植：异形幽灵全局一次破坏（sabotage_room ghost 模式不写目击）+ 2.4 游荡；人类幽灵额度内 6.5 做任务'],
  'js/game.js:aiScanBodies': ['ported', 'sim/sim_state.gd:scan_bodies',
    'js/game.js:2524 逐行移植：0.5s 扫描 5.4 格 → observeBody → 搜查(STAND.search) → canReportBody 延迟拉铃；ai_human/ai_alien 每帧调用'],
  'js/game.js:alienReportWorth': ['ported', 'sim/sim_state.gd:alien_report_worth',
    'js/game.js:2591 逐行移植：MISLEAD 效用表（hot/clean/selfRisk/riskWatch/seenPenalty/_stallBias/scarce）全部读 rules.json'],
  'js/game.js:aiWantsLoot': ['ported', 'sim/sim_state.gd:ai_wants_loot',
    'js/game.js:2144 逐行移植：缺弹/缺申请单才搜尸，异形不搜已认出的队友'],
  'js/game.js:recentWitness': ['ported', 'sim/sim_state.gd:recent_witness',
    'js/game.js:3121 逐行移植；seenBy 存在观察者身上（3D 方向相反、语义等价，见 mind.gd:707 注释）'],
  'js/game.js:watchersAt': ['ported', 'sim/sim_state.gd:watchers_at',
    'js/game.js:3183 逐行移植：R=max(rad,HUMAN_LIGHT_R,sightRangeAt)，attention!=online 不计入'],
  'js/game.js:aiHear': ['ported', 'sim/sim_state.gd:hear',
    'js/game.js:1827 逐行移植：conf=max(0.12,1-d/rad)×(los?1:0.72)；13 处调用点（door/power/pipe/sabotage/drag/knife/scream/alarm/detain/robot/robot_down/shot）已按 2.5D 半径接线'],
  'js/game.js:screamFor': ['ported', 'sim/sim_state.gd:hear',
    'js/game.js:4272：AI 侧 = hear("scream",16,{victim})（sim.knife 内）；玩家侧音量采样由 audio.gd 承担'],
  'js/game.js:alienMateRevive': ['ported', 'sim/ai_alien.gd:_decide',
    'js/game.js:3590 逐行移植：medkit>0 且认出队友 → 8 格内看得见的濒死队友，<1.7 站桩 STAND.revive，否则走过去'],
  'js/game.js:randIn': ['ported', 'sim/sim_state.gd:_rand_in_bridge',
    'js/game.js:340 randIn：房间内随机可行走点；3D 现有 _rand_in_bridge 同构（天亮传送用），房间参数化即同一函数'],
  'js/game.js:night_meet_left_marker': null, // 占位防手滑，下面删除
  'js/t2/decision.js:nightMeetLeft': ['ported', 'sim/sim_state.gd:night_meet_left',
    'js/t2/decision.js:154 逐行移植：max(0, MEET.perNight - nightMeets)；can_report_body 在消耗额度前先问它'],
  'js/game.js:dmgTick': ['ported', 'sim/sim_state.gd:_tick_dmg',
    'js/game.js:1272 逐行移植：left 递减，到点 prog-fault_penalty 并移除（2.5D dmgTick 同口径）'],
  'js/game.js:logEvent': ['ported', 'sim/sim_state.gd:_log',
    'js/game.js:1401 逐行移植：事件流只追加、带 night/pt/t 缺省；复盘消费方是 events 只读旁路'],
  'js/game.js:obeyTrustMul': ['adapter', 'sim/speech.gd:_will_obey',
    'js/game.js:1526 obeyTrustMul 的信任门 + trustObeyGate 在 3D 合并进 _will_obey（输入同一份 trust/LEADER 配置）'],
  'js/game.js:defenseNote': ['adapter', 'sim/speech.gd:decide_human_defend',
    'js/game.js:1632 defenseNote（被点名后的辩护）合并进 decide_human_defend：谁辩护、辩什么由同一份 sus/known 输入决定'],
  'js/game.js:attention': ['adapter', 'sim/sim_state.gd:watchers_at',
    'js/game.js:1766 attention 三态：3D 把 "做事=看不见" 这条唯一玩法语义落进 watchers_at/_witness_action（doing>0 全部排除）；ui/suspend 两态属表现层（遮罩/暂停）由 main.gd 承担'],
  'js/game.js:observerVisionAt': ['adapter', 'sim/sim_state.gd:ai_can_see',
    'js/game.js:1786：3D ai_can_see 为逐行移植（本仓早期批次）；本批把其中 nav.los 升级为 los_now（门挡视线）'],
  'js/game.js:misIdPick': ['adapter', 'sim/mind.gd:note_sight',
    'js/game.js:2052 MISID 认错人：3D 在 note_sight 里同概率同池（目击者此刻看得见的人）实现；misIdPick 的独立函数形态被合并'],
  'js/game.js:misIdBump': ['adapter', 'sim/mind.gd:note_sight',
    'js/game.js:2068：3D 以 sim._stat("misIdWrites"/"misIdToAlien"/"misIdToHuman") 记同一批遥测'],
  'js/game.js:knownBump': ['adapter', 'sim/sim_state.gd:_stat',
    'js/game.js:2075：knownWrites 遥测；3D known 写入点在 mind.note_sight/known_override，遥测走 _stat 家族'],
  'js/game.js:markMate': ['adapter', 'sim/sim_state.gd:_witness_action',
    'js/game.js:2086：异形目击异形专属行为 → w.mates[i] 记录；3D _witness_action 的 id_ev 分支逐字同语义'],
  'js/game.js:noticeAction': ['adapter', 'sim/sim_state.gd:_witness_action',
    'js/game.js:1884：3D 按 kind 拆进 knife/shoot/sabotage/breaker 各结算点（_witness_action + note_sight）；目击权重 EV_W、MISID、markMate 全部保留'],
  'js/game.js:noticeTaskAbandon': ['adapter', 'sim/ai_human.gd:_flee_from',
    'js/game.js:1861：弃任务目击在 3D 落在弃任务动作发生处（_flee_from → _witness_action saw_task_abandon / fake → markMate 由 _witness_action id_ev 分支承担）'],
  'js/game.js:taskThreat': ['adapter', 'sim/ai_human.gd:_decide',
    'js/game.js:2752：确证威胁逼近 → 弃任务逃跑；3D 在 ai_human._decide 的 taskThreat/fleeTask 分支（ai_human.gd:55 起）'],
  'js/game.js:aiIdleRoam': ['adapter', 'sim/ai_human.gd:_idle_roam',
    'js/game.js:2312：无事可做不站着 —— 3D _idle_roam（修亮故障 → 领申请单 → 巡舱）同一优先级链'],
  'js/game.js:lootRun': ['adapter', 'sim/ai_alien.gd:_decide',
    'js/game.js:2697：缺弹/缺单 → 搜身边没搜过的尸体；3D 在 _decide 补给链后同条件触发 sim.search_body'],
  'js/game.js:dropStaleFix': ['not-applicable', '',
    'js/game.js:2740：防"维修目标被移除后悬空引用"；3D 的 dmg 只在 fix_damage/dawn 移除，且 _finish_doing("fix") 对不存在房间静默返回 —— 悬空场景不出现，等价守卫已在结算点'],
  'js/game.js:findHideBody': ['adapter', 'sim/ai_alien.gd:_decide',
    'js/game.js:3108：3D 只在自家出刀后即时拖尸（_decide drag 分支 + _hide_room 评分）；「顺手藏别人尸体」分支未覆盖 —— 记入 PORTING_PROTOCOL.md 附录 B 差距表，不得当作已对齐'],
  'js/game.js:exitDistAt': ['adapter', 'sim/ai_alien.gd:_exit_dist',
    'js/game.js:3147：出口集合=房间门（2.5D 还有管道口），3D _doors 预计算房间门表；escape_cost 同源'],
  'js/game.js:crowdAt': ['adapter', 'sim/ai_alien.gd:_decide',
    'js/game.js:3169：crowdR 内非队友人数（做事的人也算）；3D 内联在 _decide 的 witnesses/crowd 循环'],
  'js/game.js:reportAlibiSpot': ['adapter', 'sim/speech.gd:plan_alien_deception',
    'js/game.js:3197：报告前的不在场落点；3D 并进 plan_alien_deception（先离开现场再编排口供）'],
  'js/game.js:alienAudienceInfo': ['adapter', 'sim/ai_alien.gd:_try_disguise',
    'js/game.js:3218：观众数/权重/热度统计；3D _try_disguise 内联同口径（audienceR 内非队友、doing>0 排除）'],
  'js/game.js:audienceHotRooms': ['adapter', 'sim/ai_alien.gd:_try_disguise',
    'js/game.js:3244：按 mem 热度选演出舱室；3D 简化为"就地演出"（贴任务点/贴故障），热度未迁 —— 记入差距表'],
  'js/game.js:disguiseOptions': ['adapter', 'sim/ai_alien.gd:_try_disguise',
    'js/game.js:3266：3D 覆盖 fakeRepair/fakeTask 两类（disguiseScore≥minScore 门槛同源）；其余演出种类（东张西望等）未迁 —— 记入差距表'],
  'js/game.js:disguiseRiskParts': ['adapter', 'sim/mind.gd:disguise_risk',
    'js/game.js:3356：风险分项（manyEyes/dark/重演）；3D mind.disguise_risk 是逐行移植，_try_disguise 输入同一批字段'],
  'js/game.js:alienPlan': ['adapter', 'sim/ai_alien.gd:_decide',
    'js/game.js:3382：效用表主结构（补给/伪装/拉闸/机器人/管道/狩猎）在 3D _decide 同序同门槛；细分打分（walk 估距、BOT_SEC_VALUE 权重）未逐项迁 —— 记入差距表'],
  'js/game.js:alienSupport': ['adapter', 'sim/ai_alien.gd:_decide',
    'js/game.js:3513：贴脸有人先杀人、没刀才伪装/补给 —— 3D _decide 分支顺序与真源一致'],
  'js/game.js:huntSpotFor': ['adapter', 'sim/ai_alien.gd:_hunt_spot',
    'js/game.js:3616：3D _hunt_spot 为逐行移植（本夜最后目击 → 最多目击舱 → 任务点最多舱）'],
  'js/game.js:setAct': ['not-applicable', '',
    'js/game.js:4181：动作演出（stab/shoot/hurt 前后摇）纯视觉；3D 由 crew_view 动画与相机冲击承担，不进 sim'],
  'js/game.js:tickActs': ['adapter', 'sim/sim_state.gd:tick_agents',
    'js/game.js:4186：redT/rushT/stunT/_pipeCD 递减在 3D tick_agents 逐项对应；act.t 演出计时属表现层不迁'],
  'js/game.js:actOffset': ['not-applicable', '',
    'js/game.js:4199：出手位移偏移量，纯表现；3D 由动画曲线承担'],
  'js/game.js:secJail': ['adapter', 'sim/bots.gd:_tick_catch',
    'js/game.js:4595：拘留位缓存；3D jail 常量落在 bots.gd（军械库拘留位），位置固定与 2.5D 一致'],
  'js/game.js:seenNames': ['adapter', 'sim/speech.gd:_ctx_for',
    'js/game.js:4976：发言上下文里的"最近见过谁"；3D 由 _ctx_for 组装同一批 nSeen/时间词输入'],
  'js/game.js:victimInfo': ['adapter', 'sim/speech.gd:_ctx_for',
    'js/game.js:5000：受害者描述（位置/死因/夜次）；3D 并进 _ctx_for 与 note_body_seen'],
  'js/game.js:counterfactualReach': ['adapter', 'sim/mind.gd:alibi_reach',
    'js/game.js:5012：房间对房间"够不够赶到"的反事实；3D alibi_reach(dist,dt,speed) 是同一数值核，房间距由 room_center 差替代（2.5D 也用房间对）'],
  'js/game.js:fillTpl': ['adapter', 'sim/sim_lines_data_placeholder', 'PLACEHOLDER'],
  'js/game.js:flavor': ['adapter', 'sim/speech.gd:_pick',
    'js/game.js:5543：flavor= pickLine 的单类别封装；3D _pick(cat, speaker) 同源（语料 lines.json + 防复读）'],
  'js/game.js:evRoomName': ['adapter', 'sim/sim_state.gd:room_name',
    'js/game.js:5583：证据舱室名；3D room_name(id) 同源，事件里直接存 id'],
  'js/game.js:evClause': ['adapter', 'sim/mind.gd:_push_why',
    'js/game.js:5592：证据从句；3D 证据 why 记录带 kind/src/room，展示子句由 lines.json 模板承担'],
  'js/game.js:pickChallenge': ['adapter', 'sim/speech.gd:player_say',
    'js/game.js:5679：对质构造（谁在哪被谁看见）；3D player_say 解析玩家发言并触发同链（SPEECHTEST 玩家解析=saw_knife）'],
  'js/game.js:challengeText': ['adapter', 'sim/speech.gd:player_say',
    'js/game.js:5693：对质/回应文案池；3D 由 lines.json 对质池 + _alibi_caught 承担'],
  'js/game.js:actWord': ['adapter', 'sim/sim_lines_placeholder2', 'PLACEHOLDER'],
  'js/game.js:evidenceLead': ['adapter', 'sim/mind.gd:evidence_reason',
    'js/game.js:5774：evidenceCore().lead 的证据首因；3D evidence_reason(a,i) 同源'],
  'js/game.js:accuseLine': ['adapter', 'sim/speech.gd:_emit',
    'js/game.js:5775：指认文案构造；3D _emit(cat,ctx,target) + _ctx_for 同输入'],
  'js/game.js:pickResponder': ['adapter', 'sim/speech.gd:_first_player_responder',
    'js/game.js:6009：还没发言的人优先接话；3D _first_player_responder + tick 调度同一策略'],
  'js/game.js:hypothesisCompeting': ['adapter', 'sim/mind.gd:hypothesis_spread',
    'js/game.js:7061：竞品假设存在性；3D hypothesis_spread 是逐行移植'],
  'js/game.js:identityAlien': ['adapter', 'sim/mind.gd:identity_axis',
    'js/game.js:7138：1-identityAxis 的恒等式；3D identity_axis 逐行移植，取反在调用处'],
  'js/game.js:trustProb': ['adapter', 'sim/mind.gd:hostile_prob',
    'js/game.js:7147：1-hostileProb 恒等式；3D hostile_prob 逐行移植'],
  'js/game.js:hostileTo': ['adapter', 'sim/mind.gd:hostile_prob',
    'js/game.js:7148：>0.5 阈值；3D 调用处直接比较 hostile_prob'],
  'js/game.js:hostileWeight': ['adapter', 'sim/mind.gd:trait_c',
    'js/game.js:7157：IDENTITY.alienExplore/alienPow 加权；3D trait_c(name,a) 读同一份 rules.json'],
  'js/game.js:weightedHostileTarget': ['adapter', 'sim/ai_alien.gd:_decide',
    'js/game.js:7162：按敌性概率加权选目标；3D _decide 目标评分循环同结构（distance×targetDistMul-hostile）'],
  'js/game.js:alienSocialPick': ['adapter', 'sim/speech.gd:plan_alien_deception',
    'js/game.js:7229：社交目标热度挑选；3D 并进 plan_alien_deception（heat 输入同一份公开指认表）'],
  'js/game.js:alienFrameTarget': ['adapter', 'sim/speech.gd:plan_alien_deception',
    'js/game.js:7253：构陷对象挑选（top hot + 失风记录）；3D plan_alien_deception 的 target 选择同语义'],
  'js/game.js:alienPackLead': ['adapter', 'sim/speech.gd:plan_mate_bus',
    'js/game.js:7271：队友跟票首提者；3D plan_mate_bus 承担同一条跟票链'],
  'js/game.js:mateFollowChance': ['adapter', 'sim/speech.gd:plan_mate_bus',
    'js/game.js:7281：tr>=0.25 必跟；3D plan_mate_bus 内同门槛'],
  'js/game.js:descDistort': ['adapter', 'sim/mind.gd:note_testimony',
    'js/game.js:7326：转述失真 DESC；3D note_testimony 的 DESC 块逐行移植（mind.gd:1006）'],
  'js/game.js:visibleAt': ['adapter', 'sim/sim_state.gd:ai_can_see',
    'js/game.js:10684：玩家可见性 = observerVisionAt；3D 玩家侧名字牌/准星走 ai_can_see(me,...)（main.gd:7098 等），渲染雾由 view 层承担'],
  'js/game.js:canSee': ['adapter', 'sim/sim_state.gd:ai_can_see',
    'js/game.js:10690：同上，dev 全知的豁免在 main.gd 调用侧（sim.dev）'],
  'js/game.js:updateCamera': ['not-applicable', '',
    'js/game.js:7915：2.5D 俯视相机缩放；3D 是第一人称/跟随相机（player.gd + main.gd），没有 1:1 对应'],
  'js/game.js:clickAt': ['not-applicable', '',
    'js/game.js:7932：2.5D 鼠标点击寻路；3D 是 WASD + 交互键（player.gd），输入范式不同'],
  'js/game.js:collectInteractions': ['adapter', 'main.gd:_collect_offers',
    'js/game.js:8072：交互项收集（任务/电闸/圆桌/补给/管道/监控/搜尸/救人）；3D _collect_offers 同链，键位拆分 E/F/R/G/Q/V/B/C'],
  'js/game.js:pickWheel': ['adapter', 'main.gd:_collect_offers',
    'js/game.js:8174：轮盘选择；3D ui_wheel.gd 承担展示，选项来源同 _collect_offers'],
  'js/game.js:interact': ['adapter', 'main.gd:_collect_offers',
    'js/game.js:8181：E 键执行首个可用交互；3D main.gd 交互执行链（INTERACTTEST 全项通过）'],
  'js/game.js:note': ['not-applicable', '',
    'js/game.js:8632：2.5D 调试用 LOG 环形缓冲（≤120 条）；3D 的调试记录走 sim._dev_note（不进事件流）'],
  'js/game.js:prep': ['adapter', 'sim/lines_data.gd:setup',
    'js/game.js:8633：语料池预处理缓存；3D lines_data.setup 启动时一次性载入 lines.json'],
  'js/game.js:C': ['not-applicable', '',
    'js/game.js:8668：WebAudio 上下文；3D audio.gd 用 AudioStreamPlayer，无 1:1'],
  'js/game.js:beep': ['not-applicable', '', 'js/game.js:8669：WebAudio 合成音；3D audio.gd 采样播放'],
  'js/game.js:noise': ['not-applicable', '', 'js/game.js:8678：WebAudio 白噪声；3D audio.gd 采样播放'],
  'js/game.js:noiseLp': ['not-applicable', '', 'js/game.js:8690：WebAudio 低通噪声；3D audio.gd 采样播放'],
  'js/game.js:loadImg': ['not-applicable', '', 'js/game.js:8790：canvas 贴图预载；3D 资产由 Godot import 管线承担'],
  'js/game.js:botLabelText': ['not-applicable', '',
    'js/game.js:9076：机器人头顶文案；3D scene_extras._robot/_drone 的 Label3D 承担'],
  'js/game.js:simRng': ['adapter', 'sim/sim_state.gd:_shuffle',
    'js/game.js:11004：可复现 RNG；3D sim_state._rng(RandomNumberGenerator，显式 seed) 同语义'],
  'js/game.js:simGame': ['adapter', 'main.gd:_run_sim1000',
    'js/game.js:11029：批量模拟外壳；3D _run_sim1000（dt=0.1、15 夜、maxSteps=17250 与真源同式）'],
  'js/game.js:buildSeatNames': ['not-applicable', '',
    'js/game.js:148：会议席位名排版；3D 会议 UI（ui_panels.gd）按 agent.name 直接渲染'],
  'js/game.js:roomNameById': ['adapter', 'sim/sim_state.gd:room_name',
    'js/game.js:364：id→中文名；3D room_name 同源（map_v2 rooms[].name）'],
  'js/game.js:roomIdOfName': ['not-applicable', '',
    'js/game.js:372：中文名→id 反查（2.5D 事件/语料用中文）；3D 全链路原生用 room id，不需要反查'],
  'js/game.js:pipeRoomIds': ['adapter', 'sim/ai_alien.gd:setup',
    'js/game.js:383：有管道口的舱室清单；3D 由 map.pipes 派生（ai_alien._pipes / scene_extras._build_pipes）'],
  'js/game.js:walkableNear': ['adapter', 'sim/grid_nav.gd:nearest_free',
    'js/game.js:393：附近可行走点（0.3/0.55/0.8 环搜）；3D nearest_free 网格环搜同语义'],
  'js/game.js:nearPipeXY': ['adapter', 'sim/grid_nav.gd:nearest_free',
    'js/game.js:403：坐标是否贴着管道口（<1.8）；3D 管道口的邻近判定在 main.gd 交互 offers（reach.pipe）与 ai_alien._pipe_move（1.2 格入位）'],
  'js/game.js:coverAudit': ['not-applicable', '',
    'js/game.js:505：地图硬掩体夹缝审计（门禁工具，不进对局）；3D 地图验证由 3d/tools/check-floor-spec.cjs + navtest 承担'],
  'js/game.js:toggleDev': ['adapter', 'main.gd:_refresh_dev_panel',
    'js/game.js:671：DEV 开关；3D sim.dev 字段 + main.gd dev 面板（F3），无敌/全知语义与 2.5D 一致'],
  'js/game.js:exitToMenu': ['adapter', 'main.gd:_ready',
    'js/game.js:765：回主菜单；3D 场景树返回 home_view（UI 层），无对局逻辑'],
  'js/game.js:stepSpect': ['not-applicable', '',
    'js/game.js:810：2.5D 旁观相机幽灵沿路径飞；3D 旁观= player.gd spectator 自由飞行（无碰撞直线移动），无 1:1'],
  'js/game.js:camFocus': ['not-applicable', '', 'js/game.js:824：2.5D 相机焦点；3D 相机跟随逻辑在 player.gd/main.gd'],
  'js/game.js:freeFly': ['adapter', 'sim/sim_state.gd:_ghost_move',
    'js/game.js:827：穿墙口径收口（ghost&&!alive）；3D tick_agents 的 free_fly 局部变量 + _ghost_move 不查门/墙，同一收口'],
  'js/game.js:stepMove': ['adapter', 'sim/sim_state.gd:tick_agents',
    'js/game.js:828：逐行移植进 tick_agents（门阻挡 / 围墙兜底 / 0.7s 卡死重寻路 / aimAng）；脚步声纹属表现层不迁'],
  'js/game.js:moveSpeed': ['adapter', 'sim/sim_state.gd:tick_agents',
    'js/game.js:782：拖尸>加速>基础 的次序在 tick_agents 逐项保留（RUSH.mul 读 rules.json）'],
  'js/game.js:walkTo': ['adapter', 'sim/sim_state.gd:set_path',
    'js/game.js:798：A* + 不可达 1.2s 冷却；3D set_path 承担 A*，冷却在 _ghost_roam 与各 AI decide（_aiT）'],
  'js/game.js:nearPipe': ['adapter', 'main.gd:_collect_offers',
    'js/game.js:888：1.6 格内最近管道口；3D 交互 offers 按 reach 判定 + extras.pipe_ports'],
  'js/game.js:pipeOpts': ['adapter', 'main.gd:_collect_offers',
    'js/game.js:893：管道目的地列表；3D 轮盘列出全部管道口（B4TEST 管道口=8）'],
  'js/game.js:camMonitor': ['adapter', 'scene_extras.gd:_monitor',
    'js/game.js:949：监控设施定位；3D facility.kind=monitor 在 scene_extras._build_facilities/_monitor'],
  'js/game.js:nearRoundTable': ['adapter', 'sim/sim_state.gd:claim_spot',
    'js/game.js:970：圆桌领单位；3D claim_spot（圆桌下沿外 1.2 格）同口径'],
  'js/game.js:nearMonitor': ['adapter', 'scene_extras.gd:nearest_device',
    'js/game.js:994：1.8 格内监控台；3D nearest_device（2.0m）统一判定'],
  'js/game.js:inCamRoom': ['adapter', 'sim/sim_state.gd:room_at',
    'js/game.js:998：是否在监控室；3D room_at(pos)=="cam" 由调用侧组合'],
  'js/game.js:nearPoint': ['adapter', 'main.gd:_collect_offers',
    'js/game.js:1036：2.6 格内任务点；3D offers 链按 reach 判定任务点'],
  'js/game.js:dmgOfRoom': ['adapter', 'sim/sim_state.gd:sab_room_ok',
    'js/game.js:1064：房间未修复故障查询；3D 在 sab_room_ok/fix_damage 内线性查 dmg（同结构）'],
  'js/game.js:nearDmg': ['adapter', 'main.gd:_collect_offers',
    'js/game.js:1092：身边故障点；3D 交互 offers 列出 fix 项（reach.fix）'],
  'js/game.js:startFix': ['adapter', 'sim/sim_state.gd:start_doing',
    'js/game.js:1168：开始维修站桩；3D start_doing(i,"fix",…)+_finish_doing("fix")→fix_damage 同链'],
  'js/game.js:finishFix': ['adapter', 'sim/sim_state.gd:fix_damage',
    'js/game.js:1180：维修结算（移除故障 + cred fixDone）；3D fix_damage 逐项对应'],
  'js/game.js:miniGameOn': ['not-applicable', '',
    'js/game.js:1241：2.5D 小游戏全局开关；3D 小游戏由 mg_layer.is_open() 承担（device.gd 交互）'],
  'js/game.js:playerMiniGame': ['not-applicable', '',
    'js/game.js:1244：玩家小游戏驱动；3D minigame/*.gd（mg_wire 等 12 种）由 device 开启，站位/奖励走 sim'],
  'js/game.js:recordFrame': ['not-applicable', '',
    'js/game.js:1410：2.5D 复盘帧采样（0.5s 全员坐标快照）；3D 复盘页用 events 流，帧快照未迁'],
  'js/game.js:replayData': ['not-applicable', '', 'js/game.js:1426：回放导出结构；3D 复盘由 events/结算页承担（P2 差距表）'],
  'js/game.js:loop': ['not-applicable', '',
    'js/game.js:2194：requestAnimationFrame 主循环；3D 由 Godot _process(delta) 承担'],
  'js/ai/sanity.js:rollCharisma': ['adapter', 'sim/speech.gd:roll_leader',
    'js/ai/sanity.js:526：领袖号召力重尾分布；3D roll_leader 内同分布抽 leader_charisma'],
  'js/ai/traits.js:roll': ['adapter', 'sim/mind.gd:init_agent',
    'js/ai/traits.js:47：五轴性格抽取；3D init_agent 按 AXES 逐轴抽（异形 aggr 下限同真源）'],
  'js/t2/space.js:corridorLampPos': ['not-applicable', '',
    'js/t2/space.js:55：走廊灯位布局（2.5D 灯圈渲染）；3D 走廊照明由 map_builder 灯带 + builder.light_stats 承担'],
  'js/t2/space.js:rowForAng': ['not-applicable', '', 'js/t2/space.js:75：朝向→贴图行列（2.5D 精灵图）；3D 是 3D 模型朝向，无精灵行列'],
  'js/t2/space.js:dirAng': ['not-applicable', '', 'js/t2/space.js:80：四向→角度；同上，3D 模型用 yaw'],
  'js/t2/space.js:workStyle': ['not-applicable', '', 'js/t2/space.js:87：做事状态小图标颜色（头顶气泡）；3D 由 crew_view 状态表现承担'],
  'js/t2/space.js:k1': ['not-applicable', '', 'js/t2/space.js:100：相机缩放曲线；3D 无俯视缩放'],
  'js/t2/decision.js:seatNo': ['not-applicable', '', 'js/t2/decision.js:40：席位两位编号文案；3D 会议 UI 直接渲染 i+1'],
  'js/t2/decision.js:tagByName': ['adapter', 'sim/sim_state.gd:agent',
    'js/t2/decision.js:42：名字→agent；3D agents 数组按索引/名字由 UI 层直接查（无独立反查函数的必要）'],
  'js/t2/decision.js:nameOf': ['adapter', 'sim/sim_state.gd:agent', 'js/t2/decision.js:47：i→名字；3D agent(i).name 直取'],
  'js/t2/decision.js:seatIndex': ['adapter', 'sim/sim_state.gd:agent', 'js/t2/decision.js:56：席位号→索引；3D 同为 i-1 直算，调用侧组合'],
  'js/t2/decision.js:stopChatter': ['adapter', 'sim/speech.gd:tick',
    'js/t2/decision.js:164：会议开始清空闲聊调度；3D speech.tick 的调度在会议期由 _tick_meeting 接管（on_meeting_open 清队列）'],
  'js/t2/decision.js:meetLater': ['adapter', 'sim/speech.gd:tick',
    'js/t2/decision.js:169：setTimeout 式发言排队；3D speech.tick(dt) 返回待发言条数，用 dt 推进而非定时器'],
  'js/t2/decision.js:sayStreakOK': ['adapter', 'sim/speech.gd:tick',
    'js/t2/decision.js:180：发言连发节流；3D _emit/防复读（SPEECHTEST 复读=0）同一约束'],
  'js/game.js:causeName': ['adapter', 'main.gd:_settle_ids_text',
    'js/game.js:389：死因中文名；3D 结算身份表 _settle_ids_text 的 deathCause match 承担（knife/shot/bled/vote）'],
  'js/game.js:envNotice': ['not-applicable', '',
    'js/game.js:1848：env_* 环境记录写入 a.mem；3D 无 mem 时间线，等价信息由事件流（sabotage/door 日志）+ 维修 offers 呈现；记入 PORTING_PROTOCOL.md 附录 B 结构差异'],
  'js/game.js:lootText': ['adapter', 'main.gd:_on_search_done',
    'js/game.js:2134：搜尸结果文案；3D _on_search_done 的 toast（弹/包/单 + 已搜过拒绝）同语义'],

};

// 清理占位键
delete MAP['js/game.js:night_meet_left_marker'];

// fillTpl / actWord 单独处理（target 前面写了占位）
MAP['js/game.js:fillTpl'] = ['adapter', 'sim/speech.gd:_ctx_for',
  'js/game.js:5482：模板占位符填充；3D 语料模板填充在 lines.json 模板 + _ctx_for 组装（SPEECHTEST 模板=11/11）'];
MAP['js/game.js:actWord'] = ['adapter', 'sim/sim_state.gd:_log',
  'js/game.js:5727：行为词（出刀/钻管道…）中文名；3D 事件流存 kind 原词，中文名由 UI/语料层承担 —— 判定层无消费'];

const spec = JSON.parse(fs.readFileSync(SPEC, 'utf8'));
const byKey = new Map((spec.entries || []).map((e) => [e.src, e]));
let patched = 0, missingTarget = [];
for (const [key, val] of Object.entries(MAP)) {
  if (!val) continue;
  const e = byKey.get(key);
  if (!e) { missingTarget.push('spec缺条目:' + key); continue; }
  const [status, target, note] = val;
  if (target && !gdNames.has(target) && !target.startsWith('PLACEHOLDER')) {
    missingTarget.push('目标不存在:' + target + ' ← ' + key);
    continue;
  }
  e.status = status;
  e.target = target && !target.includes('PLACEHOLDER') ? target : '';
  e.note = note;
  patched++;
}
if (missingTarget.length) {
  console.error('APPLY FAIL:');
  for (const m of missingTarget) console.error('  - ' + m);
  process.exit(1);
}
if (!DRY) {
  fs.writeFileSync(SPEC, JSON.stringify(spec, null, 2) + '\n', 'utf8');
}
console.log('APPLY patched=' + patched + '/' + Object.keys(MAP).length + (DRY ? ' (dry)' : ''));
