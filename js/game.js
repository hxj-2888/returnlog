/* ==== ARCH NODE · 架构节点标注（根 ARCHITECTURE.md） ====
 * layer     : T2
 * domain    : 跨域
 * definedBy : 机制与执行
 * truth     : js/game.js#window.SKV3
 * verify    : 全量门禁 / 蒙特卡洛
 * flag      : F  (F=现行事实 / N=规范裁定)
 * note      : 跨层闭包，档 3 拆分对象（取舍单待裁决）
 * 说明      : 本注释只作架构标注，不改变任何运行逻辑；多父只引用不复制。
 * ============================================================== */
/* =============================================================
 * 新返航录 · V3 规则模式（批 V3-合流 · 2026-10-28）
 * -------------------------------------------------------------
 * 职责：   把「11 人类 vs 4 异形」的实时规则作为**原游戏内的一个模式**挂载，
 *          不新开页面、不复制游戏本体；由开始页的按钮调用 SKV3.start() 进入。
 * 不变量： · 只定义 window.SKV3，不改动老引擎的任何状态与 DOM；
 *          · 进入时创建一个全屏 #v3-root 覆盖层，退出即整块移除（老游戏原样还在）；
 *          · 素材全部复用 assets/scene/**（cozy 瓦片 + 家具 + 15 套行走图）；
 *          · 地图来自 js/data/map.js（SKMapData），几何/寻路来自 js/engine/geo.js，零 fetch，file:// 也能跑。
 * 依赖：   assets/scene/cozy/tiles|furniture、assets/scene/crew/crew-01..15.png
 * 状态：   模块内闭包持有 G（单局状态），无全局污染（除 SKV3）。
 * 对外：   window.SKV3 = { start, stop, isOpen }
 * 门禁：   test:site（js 已在白名单）、test:fix（老断言不受影响）
 * ============================================================= */
(function (global) {
  'use strict';
  /* 方案 A · 薄委托收敛（2026-11-04）：以下 25 个是 T2 模块函数的**局部别名**，
     即同一个函数对象的直接引用，不是委托、没有额外调用层。
     原因：跨 script 的全局对象属性查找在渲染循环里会拖低帧率，
     主循环 dt 被钳制后模拟时间落后墙钟（旁观者直线飞行断言会掉到 2.4 格）。
     真源仍是 js/t2/*.js；此处只做局部绑定。 */
  const susOf=SKT2AI.susOf, topSus=SKT2AI.topSus, crimeWindow=SKT2AI.crimeWindow;
  const bodyReported=SKT2Decision.bodyReported, markBodyReported=SKT2Decision.markBodyReported,
        nightMeetLeft=SKT2Decision.nightMeetLeft, seatNo=SKT2Decision.seatNo,
        tagName=SKT2Decision.tagName, tagByName=SKT2Decision.tagByName,
        nameOf=SKT2Decision.nameOf, whenWord=SKT2Decision.whenWord,
        seatIndex=SKT2Decision.seatIndex, parseSpeech=SKT2Decision.parseSpeech;
  const ghostTaskPts=SKT2Space.ghostTaskPts, ghostTaskAllowed=SKT2Space.ghostTaskAllowed,
        GHOST_TASK_CAP=SKT2Space.GHOST_TASK_CAP,
        botDead=SKT2Space.botDead, botHp=SKT2Space.botHp, ready=SKT2Space.ready,
        corridorLampPos=SKT2Space.corridorLampPos, corrJoinsRoom=SKT2Space.corrJoinsRoom,
        pipeTint=SKT2Space.pipeTint, rowForAng=SKT2Space.rowForAng,
        dirAng=SKT2Space.dirAng, workStyle=SKT2Space.workStyle, k1=SKT2Space.k1;
  const stopChatter=SKT2Decision.stopChatter, meetLater=SKT2Decision.meetLater,
        sayStreakOK=SKT2Decision.sayStreakOK;
  const evNow=SKT2AI.evNow, keepSusNight=SKT2AI.keepSusNight, keepCredWhy=SKT2AI.keepCredWhy, keepRelia=SKT2AI.keepRelia, credOf=SKT2AI.credOf, mindReset=SKT2AI.mindReset, evPush=SKT2AI.evPush, susAddBase=SKT2AI.susAdd,
        axisAddT=SKT2AI.axisAddT, trustCert=SKT2AI.trustCert,
        evalAlmost=SKT2AI.evalAlmost, susCut=SKT2AI.susCut, checkAlibi=SKT2AI.checkAlibi, claimWindow=SKT2AI.claimWindow, susAddContradiction=SKT2AI.susAddContradiction, oldQuantifierWouldFire=SKT2AI.oldQuantifierWouldFire, knownOverride=SKT2AI.knownOverride, liveTarget=SKT2AI.liveTarget,
        bestSusTarget=SKT2AI.bestSusTarget, almostFoeOf=SKT2AI.almostFoeOf, almostFriendOf=SKT2AI.almostFriendOf, bestAlmostTarget=SKT2AI.bestAlmostTarget, bestKnownTarget=SKT2AI.bestKnownTarget, evidenceReason=SKT2AI.evidenceReason, affordableAlmostShot=SKT2AI.affordableAlmostShot,
        /* 感知入口（2026-11-05 · 一组读心清零）：只读自己的记忆 / 世界状态 / 公开事件 */
        envEstimate=SKT2AI.envEstimate, audSusEstimate=SKT2AI.audSusEstimate,
        pubAccusers=SKT2AI.pubAccusers, pubSolidAccusers=SKT2AI.pubSolidAccusers,
        publicHeat=SKT2AI.publicHeat, publicInfluence=SKT2AI.publicInfluence,
        /* 2026-11-05 G3：行为序列 / 证言间关系 */
        sequenceCue=SKT2AI.sequenceCue, statementRelation=SKT2AI.statementRelation,
        hypothesisSpread=SKT2AI.hypothesisSpread, hypotheses=SKT2AI.hypotheses;
  /* 2026-11-18：统一身份轴归位（数值在 SKSanity.IDENTITY，函数在 SKT2AI），
     这里只做局部别名绑定 —— 同一个函数对象，无转发层（方案 A 既有手法）。
     2026-11-20 两轴合并：beliefOf 现在是**个人信任分 T 的负端**，
     人类开枪 / 点名 / 投票兜底共用它；T 本身由 trustScore 算（cred 正端 + sus 负端）。 */
  const IDENTITY=SKSanity.IDENTITY,
        hasIdEvidence=SKT2AI.hasIdEvidence, identityPrior=SKT2AI.identityPrior,
        identityAxis=SKT2AI.identityAxis, identityAlien=SKT2AI.identityAlien,
        hostileProb=SKT2AI.hostileProb, trustProb=SKT2AI.trustProb,
        trustScore=SKT2AI.trustScore, credRaw=SKT2AI.credRaw,
        hostileTo=SKT2AI.hostileTo, axisThreat=SKT2AI.axisThreat, beliefOf=SKT2AI.beliefOf;

  /* 2026-11-20 平衡校准旋钮（只作用于本次运行，A/B 用；默认 = 旧口径）：
     人类「自动开枪」门槛 = SKTrait.C.shootSus(a) × SHOOT_K。
     0.8 是 2026-11-20 之前就有的折扣（HEAD 同值），本批没改它；
     暴露成变量只为让 `--shoot` 能在不动源码的前提下做同 seed 对照。
     ⚠ 改这个数会直接改平衡，落地必须带读数与用户裁定，不得当作"顺手校准"。 */
  let SHOOT_K=0.8;
  function shootK(){return SHOOT_K;}

  /* ---- 双分 P1 双写（2026-11-19）----
     旧轴照跑、所有判定仍读旧轴；这里只把每次 sus / cred 的写入**同步镜像**
     到 mind.belief(T) / mind.emo(E) / mind.lock，供 P2 切换前对照。
     真源在 js/t2/trust.js（只读旧轴派生，不新增数值）。 */
  function trustMirror(a,i){
    if(global.SKTrust&&global.SKTrust.dualWrite)global.SKTrust.dualWrite(a,i);
  }
  const susAdd=function(){
    /* 原函数是 (a,i,w,reason,ev) 五参，必须原样转发 —— 少传 ev 会把「目击类」证据
       写成传闻类，跨夜衰减口径就变了（实测门禁 16 条连锁失败）。 */
    const r=susAddBase.apply(null,arguments);
    trustMirror(arguments[0],arguments[1]);
    return r;
  };

  /* 2026-11-15 第一批外提：js/engine/body.js 的 5 个纯函数（方案 A 薄委托，同一函数对象、无转发层）。 */
  const bodyPos=SKBody.bodyPos, bodyHasLoot=SKBody.bodyHasLoot, lootBody=SKBody.lootBody,
        bodyItemsText=SKBody.bodyItemsText, lootText=SKBody.lootText;

  const CSS = global.SKUITemplates.CSS;
  const HTML = global.SKUITemplates.HTML;

  const MAP = global.SKMapData;

  let booted = false;
  let shutdown = null;

  let ROLE_WANT = 'human';
  /* 对局模式（2026-11-21）：classic = 15 人 4 形不互认；trio = 15 人 3 形互认 */
  let GAME_MODE = 'classic';
  /* 开始页传来的本局名单（玩家名 + 14 个 AI 名）。null = 用默认 15 名。 */
  let ROLE_ROSTER = null;
  function start(role, roster, mode) {
    if (booted) return;
    /* 'trio' 作为一键入口：玩家固定异形 + trio 模式（互认只有异形侧能感知） */
    GAME_MODE = (mode === 'trio' || role === 'trio') ? 'trio' : 'classic';
    ROLE_WANT = (role === 'alien' || role === 'trio') ? 'alien'
      : (role === 'spect' ? 'spect' : (role === 'design' ? 'design' : 'human'));
    ROLE_ROSTER = (roster && typeof roster === 'object') ? {
      me: String(roster.me || '').slice(0, 12),
      ai: Array.isArray(roster.ai)
        ? roster.ai.slice(0, 14).map(function (n) { return String(n || '').slice(0, 12); })
        : null
    } : null;
    var pk=document.getElementById('pick'); if(pk) pk.style.display='none';
    booted = true;
    if (!document.getElementById('v3-style')) {
      const st = document.createElement('style');
      st.id = 'v3-style';
      st.textContent = CSS + '\n#v3-root{position:fixed;inset:0;z-index:9999;background:#080A0F}';
      document.head.appendChild(st);
    }
    const root = document.createElement('div');
    root.id = 'v3-root';
    root.innerHTML = HTML;
    if (global.SKConfig) {
      root.querySelectorAll('[data-version]').forEach(function (el) {
        el.textContent = global.SKConfig.version;
      });
    }
    document.body.appendChild(root);
    shutdown = boot();
  }

  function stop() {
    if (shutdown) { try { shutdown(); } catch (e) {} shutdown = null; }
    if (global.SKReplay && global.SKReplay.isOpen && global.SKReplay.isOpen()) global.SKReplay.close();
    const r = document.getElementById('v3-root');
    if (r) r.remove();
    booted = false;
    const pk = document.getElementById('pick');
    if (pk) pk.style.display = '';
  }

  /* ---------------- 素材清单（页面加载即预取，进场前由加载门等待全部就绪） ---------------- */
  /* 加载 / 断网重试 / 大图预缩放（4096→2048→1024→原图）的真源在
     js/engine/assets.js；这里只取同一份引用与清单，不复制实现。 */
  const IMG=SKAssets.IMG;
  const rtImg=SKAssets.rtImg;
  const mapReady=SKAssets.mapReady;
  const loadImg=SKAssets.loadImg;
  const FLOOR={bridge:'cozy/tiles/floor-carpet-blue.png',ecosys:'cozy/tiles/floor-grate.png',
    engine:'cozy/tiles/floor-grate.png',power:'cozy/tiles/floor-steel-vent.png',
    transit:'cozy/tiles/floor-carpet-beige.png',fun:'cozy/tiles/floor-carpet-beige.png',warehouse:'cozy/tiles/floor-steel.png',
    cam:'cozy/tiles/floor-steel-bolts.png',med:'cozy/tiles/floor-lab.png',
    armory:'cozy/tiles/floor-hazard.png'};
  const FURN={table:'table',console:'console',pillar:'locker',tank:'cooler',tree:'plant',
    pond:'rug',machine:'rack',crate:'crate',breaker:'console',sofa:'sofa',chair:'chair',
    bed:'bed',fridge:'fridge',rack:'rack',warehouse_rack:'rack',counter:'table',plate_stack:'table',pot:'console',
    /* 专用 kind（tools/blender-ship.py 家具层）在底图未就绪的兜底路径上的近似替身 */
    reactor:'cryopod',engineblock:'rack',screenwall:'screen',servercab:'locker',
    switchgear:'terminal',transformer:'cooler',shelftall:'rack',pallet:'crate',
    medbed:'bed',ventilator:'terminal',ivstand:'lamp',servicecounter:'desk',
    forklift:'crate',jukebox:'vending',billiard:'table',holoscreen:'screen',gunrack:'rack'};
  /* 2026-11-06 掩体重构 v2：61 个「房间专属 kind」→ 就近的俯视 sprite。
     R7 的「不跨舱复用」是 **3D 贴图**口径；2.5D 只有一套俯视家具图，按**形状**映射，
     不按舱室。值必须落在 FURN 已加载的 sprite 集合里，否则会白加载一张不存在的图。
     新增 kind 时在这里补一行，别回退成 `||'crate'` 那种静默兜底。 */
  const FURN_V2={
    bridge_table:'table',bridge_column:'locker',bridge_sideboard:'table',bridge_chair:'chair',
    bridge_navconsole:'console',bridge_recorddesk:'table',bridge_holoscreen:'screen',
    cam_codecrack:'rack',cam_archivebox:'crate',cam_screenwall:'screen',
    cam_servercab:'locker',cam_opsdesk:'console',
    ecosys_tree:'plant',ecosys_oxygen:'cooler',ecosys_shrub:'plant',ecosys_pond:'rug',
    ecosys_tank:'cooler',ecosys_growrack:'rack',ecosys_irrigation:'console',ecosys_climate:'console',
    power_gauge:'console',power_switchgear:'terminal',power_transformer:'cooler',power_breakerbank:'console',
    transit_drinkbar:'vending',transit_trayreturn:'table',transit_diningtable:'table',
    transit_servicecounter:'desk',transit_platecart:'table',
    fun_jukebox:'vending',fun_gametable:'table',fun_stool:'chair',fun_coffeetable:'table',
    fun_arcade:'rack',fun_racer:'rack',fun_sofa:'sofa',
    engine_toolbench:'table',engine_fusepanel:'console',engine_reactor:'cryopod',
    engine_cylinder:'rack',engine_partscart:'crate',engine_compressor:'rack',
    med_surgery:'table',med_monitor:'terminal',med_ventilator:'terminal',med_bed:'bed',
    med_medcab:'fridge',med_sterilizer:'fridge',med_supplycart:'table',
    armory_workbench:'table',armory_vise:'rack',armory_targetlane:'rack',armory_gunrack:'rack',
    armory_ammocrate:'crate',armory_issuedesk:'desk',
    warehouse_rack_west:'rack',warehouse_rack_east:'rack',warehouse_terminal:'console',
    warehouse_pallet:'crate',warehouse_packbench:'table',warehouse_receiving:'table'};
  const furnSprite=k=>FURN_V2[k]||FURN[k]||'crate';
  function preloadSceneAssets(){
    /* 大图先发：base/hull 是加载页的主要耗时，先占队列再补小图 */
    loadImg('base','v4/base-lit.png');
    loadImg('hull','v4/hull-deck.png');
    loadImg('door','v4/tex/door-panel.png');
    for(const k in FLOOR) loadImg('fl_'+k,FLOOR[k]);
    const FSET=new Set(Object.values(FURN));
    for(const f of FSET) loadImg('fu_'+f,'cozy/furniture/'+f+'.png');
    for(let i=1;i<=15;i++) loadImg('cr_'+i,'crew/crew-'+String(i).padStart(2,'0')+'.png');
    /* 设施 2.5D 贴图（tools/gen-facility-sprites.py · SDXL 出图 + 统一调色抠图）：
       与 Blender 底图共用同一套冷暗配色；未就绪时 drawFacilities 自动回退到
       原来的 Canvas 造型，file:// 冷启动也不会出现空白设施。 */
    loadImg('fx_medbot','v4/facility/medbot.png');
    loadImg('fx_secbot','v4/facility/secbot.png');
    /* 特效贴图（tools/gen-facility-sprites.py --fx · 纯黑底 + 加色混合）：
       完成任务 = 全息完成光环 / 维修 = 焊花。没就绪时 drawFx 自动回退矢量画法。 */
    loadImg('fx_task','v4/facility/fx-task.png');
    loadImg('fx_weld','v4/facility/fx-weld.png');
    loadImg('fx_arc','v4/facility/fx-arc.png');
    /* 补给站：tools/blender-fx.py 用 Blender 渲染（SDXL 材质 + 与底图同一台相机/同一套灯）。
       fx-weld / fx-arc 是 2×2 图集（4 帧），fx-task 是单帧。 */
    loadImg('tool_wrench','v4/facility/tool-wrench.png');
    /* 电闸拉杆（2026-11-20 用户裁定「拉电闸做一个专门的动画，就和电路维修一样」）：
       千问本地模型出图 → 白底抠图 → breaker-lever.png。拉闸/合闸时随进度扳动，
       与 tool_wrench 同一套「放大工具贴图 + 火花 + 进度弧」表现，未就绪时回退矢量画法。
       2026-11-22：该图尚未出图入仓，登记为可选贴图 —— 缺图只走矢量回退，不再卡住加载门。
       出图落盘到 assets/scene/v4/facility/breaker-lever.png 后自动生效，无需改代码。 */
    SKAssets.loadOptional('tool_breaker_lever','v4/facility/breaker-lever.png');
    loadImg('fx_supply_ammo','v4/facility/supply-ammo.png');
    loadImg('fx_supply_med','v4/facility/supply-med.png');
    /* 通风管道口（2026-11-10 写实版）：千问出百叶风口贴图 + Blender 渲染 8 舱精灵，
       边圈按 PIPE_TINT 舱室配色；不再矢量直接画。冷启动未加载完时回退暗色矩形不留白。 */
    for(const q of MAP.pipes) loadImg('pipe_'+q.room,'v4/facility/pipe-port-'+q.room+'.png');
    /* 监控台 / 电闸的贴图不再进运行时：它们的本体由 Blender 底图烘出来，
       面板与屏幕材质走 assets/scene/v4/tex/facility-*.png（见 tools/blender-ship.py）。
       assets/scene/v4/facility/monitor.png / breaker.png 保留为素材库。 */
  }
  if (!/[?&]test\b/.test(location.search)) preloadSceneAssets();  /* 真实入口页加载即预取；?test 保持开局取图，避免门禁抖动 */
  function boot() {
    'use strict';
    /* 夜晚时长：120 → 100 → 90 → **75 秒**（2026-11-02 节奏批）。
       会议不再从夜晚时间里扣（会议期间夜里时钟暂停），而且每夜最多 2 场会议，
       所以这 75 秒是**纯干活时间** —— 一次任务 12 秒站桩 + 走过去，
       一个夜大概够做完 2~3 个任务。
       2026-11-03：数值搬到 SKSanity.NIGHT.len（**没改数**），蒙特卡洛报告要从纯模块读配置。 */
    const M=MAP, NIGHT=SKSanity.NIGHT.len;
    /* ?test / ?test&randomseat：门禁探针模式 —— 小游戏自动解题，不弹遮罩。
       ?test&mini：跳过开局会议但**保留**小游戏遮罩，用来试玩/验证接入路径。 */
    const TEST_RUN=/[?&]test\b/.test(location.search)&&!/[?&]mini\b/.test(location.search);
    let SIM_RUN=false;   /* 批量模拟：跳过渲染/HUD/音效/自动不变量，只跑对局逻辑 */
    const TEST=/[?&]test\b/.test(location.search);
    if (TEST) preloadSceneAssets();
    /* ?test&randomseat：门禁探针专用 —— 仍跳过开局会议，但**不固定席位**，
       用来验证"每局随机"这条真实路径。普通 ?test 仍固定 0 号，保证夹具稳定。 */
    const TEST_SEAT_RANDOM=TEST&&/[?&]randomseat\b/.test(location.search);
    const DEV0=/[?&#]dev\b/.test(location.search+location.hash);
    const STRICT=/[?&]strict\b/.test(location.search);
    
    /* ---------------- 几何 / 寻路（js/engine/geo.js） ---------------- */
    const {
      CW, GS, GW, GH,
      inPoly, d2seg, inCorr, roomAt, free, nearestFree,
      pathClear, smoothPath, astar, idx, segX, los, losWalls,
    } = global.SKGeo;
    
    /* ---------------- 状态 ---------------- */
    /* 15 个默认席位名的唯一真源：js/data/names.js#SKNames.DEFAULT。
       开始页可改玩家名与 14 个 AI 名，但**默认名单只在这里读一次**，不复制副本。 */
    const NAMES=global.SKNames.DEFAULT;
    let G;
    /* A/B 对照开关：还原 2026-11-05 及更早的模拟口径（讨论发言不执行）。
       模块级变量，不随 newGame 重建 G 而丢失。默认关。 */
    let SIM_NO_DISCUSS=false;
    /* 门禁探针：只影响**下一次** newGame（席位 / 名单），用完即清，不污染后续夹具。 */
    let SEAT_FORCE=null, ROSTER_FORCE=null;
    /* 机器人规则数值唯一真源：js/engine/bots.js#SKBots.CONST */
    const {
      SEC_RANGE, SEC_ARC, DETAIN_TIME, SEC_USES_MAX,
      MEDBOT_CHARGES, MEDBOT_HEAL_TIME, MEDBOT_COOLDOWN, MEDBOT_TOUCH_R, MEDBOT_R,
    } = global.SKBots.CONST;
    /* 15 个席位的名字：玩家名放在 meIdx，其余 14 席填 AI 名；默认名兜底，保证唯一。
       meIdx < 0 = 旁观局（没有玩家席位），15 席全是 AI。 */
    function buildSeatNames(roster, meIdx){
      const meName=String((roster&&roster.me)||NAMES[0]).trim().slice(0,12)||NAMES[0];
      const ai=[];
      const add=n=>{
        n=String(n==null?'':n).trim().slice(0,12);
        if(n&&n!==meName&&ai.indexOf(n)<0)ai.push(n);
      };
      ((roster&&Array.isArray(roster.ai))?roster.ai:NAMES.slice(1)).forEach(add);
      /* 自定义名不够 14 个时用默认名补齐（add 内部已去重、已排除玩家名）。
         旁观局需要 15 个 AI 名，默认名正好少一个（玩家名被排除），用备选池补第 15 席。 */
      NAMES.forEach(n=>{if(n!==meName)add(n);});
      ((global.SKNames&&global.SKNames.EXTRA)||[]).forEach(add);
      const out=new Array(NAMES.length);
      if(meIdx>=0)out[meIdx]=meName;
      let k=0;
      for(let i=0;i<out.length;i++){
        if(i===meIdx)continue;
        out[i]=ai[k++]||('席位'+(i+1));
      }
      return out;
    }
    function newGame(){
      const keepDev=G?!!G.dev:DEV0;
      clearMeetingTimer();
      stopChatter();
      document.getElementById('meet').classList.add('hide');
      /* 模板选择记忆挂在 DOM 上，会跨局存活；新局必须清掉，否则上一局选中的
         对象会被当成"本场已选"，占位与「先选对象」保护都失效。 */
      const tplSel=document.getElementById('m-tpl-target');
      if(tplSel)tplSel.__meetSeq=-1;
      /* 席位随机（2026-11-05）：玩家不再固定 01。?test 固定 0，保证门禁夹具稳定；
         旁观局没有玩家席位，沿用旧口径（0 号不排异形）以保持 1000 局基线可比。 */
      const roster=ROSTER_FORCE||(TEST?null:ROLE_ROSTER);
      const meIdx=ROLE_WANT==='spect'?-1:(SEAT_FORCE!=null?SEAT_FORCE:
        ((TEST&&!TEST_SEAT_RANDOM)?0:Math.floor(Math.random()*NAMES.length)));
      const seatNames=buildSeatNames(roster,meIdx);
      const MODE=(SKSanity.MODE&&SKSanity.MODE[GAME_MODE])||{aliens:4,matesKnown:false};
      const N_ALIEN=MODE.aliens||4;
      const aliens=new Set();
      if(ROLE_WANT==='alien'&&meIdx>=0)aliens.add(meIdx);
      if(ROLE_WANT==='spect'){
        while(aliens.size<N_ALIEN)aliens.add(1+Math.floor(Math.random()*14));
      }else{
        const avoid=(ROLE_WANT==='human'||ROLE_WANT==='design')?meIdx:-1;
        while(aliens.size<N_ALIEN){
          const i=Math.floor(Math.random()*NAMES.length);
          if(i===avoid)continue;
          aliens.add(i);
        }
      }
      const pts=M.points.map((p,i)=>i);
      const hardPts=pts.filter(i=>M.points[i].kind==='hard');
      const normalPts=pts.filter(i=>M.points[i].kind==='normal');
      const agents=seatNames.map((n,i)=>({
        i,name:n,alien:aliens.has(i),x:0,y:0,path:null,sp:0,
        /* 性格轴（局内固定）：激进更敢出刀/开枪/投票，谨慎更爱弃权，社交更爱辩护跟票，
           好奇更爱搜尸。系数一律走 SKTrait.C，业务代码不写魔法数。
           异形天生偏激进（aggr 保底 60）：它们没有投票压力，胆量就是生存方式；
           不补偿的话性格化之后异形会被人类的「敢投票」打到 26% 胜率（实测）。 */
        trait:(()=>{const t=SKTrait.roll();if(aliens.has(i))t.aggr=Math.max(t.aggr,60);return t;})(),
        alive:true,downed:false,downAt:0,downSeq:0,reported:false,reportNight:0,reportSeq:-1,
        detained:false,detainedT:0,
        tasks:[hardPts[Math.floor(Math.random()*hardPts.length)]]
          .concat(shuffle(normalPts.slice()).slice(0,3)),
        tIdx:0,doing:0,progress:0,qual:0,qualPending:0,_q3:false,_q5:false,bullet:0,medkit:0,
        knife:1,think:0,target:null,_tgtPos:null,_stalkPos:null,
        /* 幽灵 / 尸体 / 拖拽 / 搜查 */
        /* talkN：实际说出口的台词数（可观察的行为史，不是性格轴） */
        talkN:0,
        ghost:false,ghostPts:0,deathCause:null,deathAt:0,deathRoom:null,deathX:null,deathY:null,
        killedBy:null,bodyX:null,bodyY:null,bodyGone:false,bodyMoved:false,
        downX:null,downY:null,downRoom:null,woundCause:null,draggedBy:null,searched:false,
        drag:null,redT:0,rushT:0,stunT:0,_dragSnd:0,_dragAiT:0,_hideSpot:null,_hideRoom:null,_hideCD:0,_hides:0,
        _lightGo:false,_pipePlan:null,_pipeSeeks:0,_secAvoidT:0,_botCD:0,
        _killBody:null,_killAt:0,_killDecided:true,_reportPlan:null,
        _avoid:{},_fleeT:0,_fleeFrom:null,_pathCD:0,_alienTaskN:0,
        /* 伪装只有冷却与抑制位两条闸（2026-11-03）：_fakeCD 演完 18 秒不再演、
           _lastFake 记"上一个演出点"用于重复演风险、_noFake 是调试/门禁的显式开关。
           历史上这里是 _fakeN/_fakeTaskN/_fakeBreakerN 三个"每夜 1 次"计数器。 */
        _fakeKind:null,_fakeCD:0,_lastFake:null,_noFake:false,
        /* 贵信号（真修 / 真救）代价太大，各夜最多一次；假动作不设每夜上限，只靠 cooldown */
        _realFixN:0,_realReviveN:0,
        _alienTaskTotal:0,_supportGoal:null,_lootMem:{},
        /* 表现层：动作 / 工作计时 / 夜间见闻（会议发言要用真实事实） */
        act:null,_rest:0,_delay:2+Math.random()*6,_fxT:0,
        nRoom:null,nSeen:{},nTask:null,nTaskRoom:null,accuse:null,_lie:null,
        _taskPt:null,_reportT:0,_reportGo:null,_sawBody:null,
        /* 报告是有限资源（2026-11-02）：全局 2 次，玩家与 AI 同一额度。
           用光之后要么等别人报，要么放弃这一具尸体。 */
        reportLeft:(global.SKSanity&&SKSanity.MEET?SKSanity.MEET.reportsPerAgent:2),
        /* 认知层：只记录自己看见/听见/搜查到的事实，不保存身份答案。
           mates 只由目击异形专属行为推断，不是系统下发的队友表。 */
        mind:null,mates:{}
      }));
      for(const a of agents)mindReset(a);
      // 出生：15 人全部在中央会议室，异形混在人群里
      const br=M.rooms.find(r=>r.id==='bridge');
      for(const a of agents){
        const p=randIn(br); a.x=p[0]; a.y=p[1];
      }
      /* 旁观局没有玩家席位，G.me 只是历史占位（0 号），不参与发言/投票。 */
      const me=agents[meIdx<0?0:meIdx];
      /* ---- 领袖型玩家（2026-11-01）----
         约 1/4~1/5 的对局里会出现一个"爱指挥"的人：给全队下指令、做总体安排。
         **不预先判定阵营** —— 他可能是人类，也可能是异形在带节奏，这才是好玩的地方。
         只有 soc 轴够高的人才可能被选中，避免"最孤僻的人突然指挥全场"。 */
      let leader=null;
      if(Math.random()<SKSanity.LEADER.chance){
        /* 玩家要异形时，不能自己当领袖（其余阵营都可能当，包括人类异形混在人群里） */
        const pool=agents.filter(a=>a!==me||ROLE_WANT!=='alien')
          .filter(a=>(a.trait.soc||50)>=SKSanity.LEADER.minSoc);
        if(pool.length)leader=pool[Math.floor(Math.random()*pool.length)].i;
      }
      /* 号召力（2026-11-03 用户裁定）：每局抽一次，重尾、两端不截断 ——
         可能一个人都不听，也可能全船都听。没有领袖时为 0（不影响任何人）。 */
      const leaderCharisma=leader==null?0:SKSanity.rollCharisma(Math.random);
      G={agents,me,mode:GAME_MODE,leader,leaderCharisma,night:1,t:NIGHT,prog:0,over:null,overWhy:'',meet:null,
         priorT:null,priorTPrev:null,
         /* pointDone：任务点 → 最近一次被完成的模拟时刻。异形"假装做任务"要避开
            已经被人做过的点（重复劳动本身就是破绽，见 SKSanity.DISGUISE.risk.donePoint）。 */
         pointDone:{}, terminator:false, revealAll:false,
         /* 本局台词去重（pickLine 用）：键是模板，值是说过几次 */
         lineUsed:{},
         lit:{},litBase:{},roomOut:{},blackout:false,vis:null,fogOn:true,camMode:'follow',fx:[],waves:[],clickFx:null,lightState:0,
         corrLit:true,paused:false,pauseAt:0,pauseMeet:false,taskKey:'',camView:false,pipePick:null,powerFixed:false,
         secbotUsed:false,secbotUses:0,secbotDead:false,medbotUsed:false,medbotDead:false,medbotT:0,medbotCD:0,secbotT:0,
         medbotTarget:null,supplyCD:{ammo:0,med:0},
         medbotLeft:MEDBOT_CHARGES,botHp:{secbot:2,medbot:1},secCatch:null,
         _evo2Done:false,_evo1Done:false,
         bots:null,jailPos:null,
        /* 本夜已成功拉断电闸的次数（决定下一次拉闸要站多久：3/6/9/9…），每夜重置 */
        breakerPulls:0,
         dmg:[],sabPick:null,sabTarget:null,aiReportUsed:false,evSeq:0,
         /* 2026-11-07 用户裁定：异形幽灵的「正统破坏」全局仅限发动一次，必定发动。 */
         alienGhostSabUsed:false,
        /* 本夜已开的夜晚会议场数（上限见 SKSanity.MEET.perNight） */
        nightMeets:0,
         drag:null,inspect:null,wheel:null,dev:keepDev,gfx:{coverFlashes:0,dashedBorders:0,knifeRings:0,crewDrawn:0},
         spectMode:(ROLE_WANT==='spect'),spect:null,
        /* 设计者纯净模式（2026-11-09）：只验地图与任务点的静态沙盒。
           世界不推进（夜钟/AI/会议/结算全停），15 席位不绘制，
           本人按幽灵口径穿墙飞行，26 个任务点与 8 个管道口全部开放交互。 */
         designMode:(ROLE_WANT==='design'),
         events:[],frames:[],playT:0,_frameAcc:0,
        /* 局内统计（2026-10-31）：医疗无人机救治 / 医疗包施救 / 幽灵任务 / 幽灵修故障。
           只累加、不参与任何判定，供结束页与复盘报告读取。 */
        stats:{medbotRevives:0,medkitRevives:0,ghostTasks:0,ghostFixes:0},
         inv:{runs:0,checks:0,fails:[],warned:{},lastTag:''},devAt:0};
      G.aimX=me.x+1; G.aimY=me.y;
      logEvent('game_start',{night:1});
      recordFrame();
      if(G.spectMode){
        /* 第 16 人旁观者：不在 15 个席位里，只是一台高速全知的幽灵相机 */
        const p=randIn(br);
        G.spect={x:p[0],y:p[1],path:null,moving:false,dir:'down'};
        G.fogOn=false;
      }
      if(G.designMode){
        /* 设计者局：无迷雾全览，人停在中央会议室（离 26 个任务点与 8 个管道口都最近）。
           席位与阵营照常建（15 席 / 4 异形 / 11 人类），只是不画也不动 ——
           这样 _t.inv() 与既有夹具的口径不会被这个模式带偏。 */
        G.fogOn=false;
        const p=randIn(br);
        me.x=p[0]; me.y=p[1]; me.path=null; me.moving=false;
        /* 默认铺满全船（与旁观/DEV 的「全知总览」同一镜头）：设计者是来验整张地图的，
           21 格跟随近景一屏只装得下 1/5 船宽。C 仍可切回跟随近景。
           newGame 尾部本来不 resize，这里设完 camMode 必须补一次，否则 VIEW 不更新。 */
        G.camMode='map';
        resize();
      }
      resetBots();
      G.doors=buildDoors();
      /* 2026-11-01：不再指定拉闸手 —— 拉闸/破坏由异形行为效用表（alienPlan）决定，
         谁顺路谁价值高谁做。专属角色全部取消。 */
      refreshLight();
      document.getElementById('end').classList.add('hide');
      document.getElementById('body').classList.add('hide');
      document.getElementById('cam').classList.add('hide');
      document.getElementById('pipe').classList.add('hide');
      document.getElementById('sabot').classList.add('hide');
      document.getElementById('wheel').classList.add('hide');
      document.getElementById('dragtag').classList.add('hide');
      const pe=document.getElementById('pause'); if(pe)pe.classList.add('hide');
      try{const s=JSON.parse(localStorage.getItem('sk.settings.v1')||'{}'); if(typeof s.spectDev==='boolean')G.spectDev=s.spectDev;}catch(_){}
      syncDevUi();
      /* 设计者局连相位时钟都不建：夜钟不走是模式定义的一部分，
         不留一个"建了但不用"的 phase 给暂停补偿/门禁去猜。 */
      if(G.designMode){
        G.t=NIGHT;
      }else if(TEST){
        G.t=NIGHT;
        G.phase=SKClock.newPhase('night',performance.now(),NIGHT*1000);
      }else setTimeout(()=>openMeeting('pre',null,null),60);
      /* 门禁探针一次性：下一局回默认口径。 */
      SEAT_FORCE=null; ROSTER_FORCE=null;
      recomputePrior();
      /* 2026-11-21 用户裁定：trio 模式开局三人互认（只写私有 mates，不进 T/E、不写 known） */
      if(MODE.matesKnown){
        const alienList=agents.filter(a=>a.alien&&a.alive);
        for(const a of alienList){
          a.mates=a.mates||{};
          for(const b of alienList){
            if(b===a)continue;
            a.mates[b.i]={t:0,kind:'pact'};
          }
        }
      }
    }
    function shuffle(a){for(let i=a.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[a[i],a[j]]=[a[j],a[i]];}return a;}
    function randIn(r){
      /* 2026-11-19 A12：取点内缩 ≥2.2 格，不再把「贴墙 / 房间四角」当合法目标。
         这是全仓所有空闲取点的公共入口，改这一处即可同时修掉出生点、
         幽灵游荡、避人反打点贴墙的老毛病。 */
      const x0=r.rect[0],y0=r.rect[1],w=r.rect[2],h=r.rect[3];
      const inset=Math.min(2.2,w/4,h/4);
      for(let k=0;k<200;k++){
        const x=x0+inset+Math.random()*Math.max(.2,w-inset*2);
        const y=y0+inset+Math.random()*Math.max(.2,h-inset*2);
        if(free(x,y)&&inPoly(x,y,r.poly))return[x,y];
      }
      return nearestFree(x0+w/2,y0+h/2);
    }

    /* ---------------- 尸体 / 幽灵的公共查询 ---------------- */
    /* 濒死（还活着）用本人坐标；已死亡用固定的 bodyX/bodyY —— 幽灵可以飘走，
       尸体留在原地，所以这两套坐标必须分开。驱逐没有尸体。 */
    /* 尸体位置一律直接用 bodyPos()：历史上的两个包装（bodyPresent / nearestBody）
       只服务玩家且没有任何调用点，已删。 */
    function roomIdAt(x,y){
      const r=roomAt(x,y); if(r)return r.id;
      return inCorr(x,y)?'corridor':'unknown';
    }
    function roomNameById(id){
      if(id==='corridor')return '走廊';
      if(id==='unknown')return '船体未知区域';
      const r=M.rooms.find(q=>q.id===id); return r?r.name:'未知位置';
    }
    /* 名字 → id（台词/口供里说的是中文名，判定必须回到 id；见 alibiOf 的注释）。
       `accuseWhy.room` 历史上有两种写法：真目击存的是 **id**，异形伪证存的是**中文名**，
       所以这里两个都认，避免又一处"用名字去撞 id"的错。 */
    function roomIdOfName(name){
      if(name==null)return null;
      if(name==='走廊'||name==='corridor')return 'corridor';
      const byId=M.rooms.find(q=>q.id===name);
      if(byId)return byId.id;
      const byName=M.rooms.find(q=>q.name===name);
      return byName?byName.id:null;
    }
    function roomNameAt(x,y){ return roomNameById(roomIdAt(x,y)); }
    /* 全船只在这 4 个舱室有管道口：任何“在 X 钻管道”的说法都必须落在这些房间，
       否则就是物理上不可能的口供（生成端不编、解析端要能拆穿）。 */
    function pipeRoomIds(){
      const out=[];
      for(const q of M.pipes)if(out.indexOf(q.room)<0)out.push(q.room);
      return out;
    }
    function isPipeRoom(id){ return !!id&&M.pipes.some(q=>q.room===id); }
    function causeName(c){
      return {knife:'刀伤',shot:'枪伤',bled:'失血过多',vote:'被驱逐出舱'}[c]||'未知';
    }
    /* 断言用：站位判定给 0.75 格容差（路径终点、贴墙走位都不算违规） */
    function walkableNear(x,y){
      if(free(x,y))return true;
      for(const r of [0.3,0.55,0.8]){
        for(let i=0;i<8;i++){
          const t=i/8*Math.PI*2;
          if(free(x+Math.cos(t)*r,y+Math.sin(t)*r))return true;
        }
      }
      return false;
    }
    function nearPipeXY(x,y){
      for(const q of M.pipes) if(Math.hypot(q.x-x,q.y-y)<1.8)return true;
      return false;
    }

    /* ---------------- 自动门 ----------------
       每个房间门口一扇：房间 door 数据 + 走廊端点配对。没人时闭合，
       有活人进入 3 格内自动滑开；关门后同时阻挡移动与视线。 */
    /* 方案 A 第一批：空间与资源域常量已外提到 js/t2/space.js（数值一个未改），
       此处保留同名局部别名，下游代码无需改动。 */
    /* 自动门与供电/电闸/暂停（已拆至 js/engine/ship-sys.js#SKShipSys） */
    const DOOR_OPEN_R=SKT2Space.DOOR_OPEN_R, DOOR_CLOSE_R=SKT2Space.DOOR_CLOSE_R,
          DOOR_SPEED=SKT2Space.DOOR_SPEED, DOOR_W=SKT2Space.DOOR_W, DOOR_PASS=SKT2Space.DOOR_PASS,
          DOOR_SCAN_TIME=SKShipSys.DOOR_SCAN_TIME;
    let _ship = null;
    function _ensureShip(){
      if(_ship)return _ship;
      _ship=SKShipSys.create({
        getG:()=>G,getSND:()=>SND,M,segX,los,
        DOOR_OPEN_R,DOOR_CLOSE_R,DOOR_SPEED,DOOR_W,DOOR_PASS,
        roomIdAt,hear,aiHear,envNotice,credBroadcast,noticeAction,
        logEvent,pulseHud,toast,newGame,stop
      });
      return _ship;
    }
    function buildDoors(){ return _ensureShip().buildDoors(); }
    function doorScanRule(d){ return _ensureShip().doorScanRule(d); }
    function doorTick(dt){ return _ensureShip().doorTick(dt); }
    function doorAutoSound(d){ return _ensureShip().doorAutoSound(d); }
    function doorBlockedSegment(x1,y1,x2,y2){ return _ensureShip().doorBlockedSegment(x1,y1,x2,y2); }
    function losNow(x1,y1,x2,y2){ return _ensureShip().losNow(x1,y1,x2,y2); }
    /* 门禁/调试用：检查硬掩体是否留下窄夹缝或掩体制造的尽端死路 */
    function coverAudit(){
      const gaps=[],dead=[];
      const rectGap=(a,b)=>{
        const dx=Math.max(a.x-(b.x+b.w),b.x-(a.x+a.w),0);
        const dy=Math.max(a.y-(b.y+b.h),b.y-(a.y+a.h),0);
        return Math.hypot(dx,dy);
      };
      for(let i=0;i<M.cover.length;i++)for(let j=i+1;j<M.cover.length;j++){
        const a=M.cover[i],b=M.cover[j]; if(a.room!==b.room)continue;
        const g=rectGap(a,b);
        /* 2026-11-06：阈值从「>0」改为「≥0.55」。0.55 格以下在网格里根本站不下人
           （free() 是 GS 采样 + 掩体 0.12 内缩），属于**有意成组**（椅子贴桌、推车贴墙），
           不是“看着能过其实过不去”的陷阱；旧阈值是为散点布局写的。 */
        /* 同一功能分区（zone）里的两件道具是**成组摆放**（圆桌+议席、两连记录台），
           它们之间的缝是设计出来的，不是“看着能过其实过不去”的陷阱。
           只有跨分区 / 无分区信息的缝才继续算问题。 */
        const sameZone=!!(a.zone&&b.zone&&a.zone===b.zone);
        if(g>=0.55&&g<1.2&&!sameZone)gaps.push({room:a.room,a:a.label,b:b.label,gap:+g.toFixed(2)});
      }
      const wallGap=(c,w)=>{
        const pts=[[c.x,c.y],[c.x+c.w,c.y],[c.x+c.w,c.y+c.h],[c.x,c.y+c.h]];
        let best=1e9;
        for(const p of pts)best=Math.min(best,d2seg(p[0],p[1],w[0][0],w[0][1],w[1][0],w[1][1]));
        for(const p of w){
          const dx=Math.max(c.x-p[0],p[0]-(c.x+c.w),0);
          const dy=Math.max(c.y-p[1],p[1]-(c.y+c.h),0);
          best=Math.min(best,Math.hypot(dx,dy));
        }
        return best;
      };
      for(const c of M.cover)for(const w of M.walls){
        const g=wallGap(c,w);
        if(g>0.2&&g<1.2)gaps.push({room:c.room,cover:c.label,wall:true,gap:+g.toFixed(2)});
      }
      const nearCover=(x,y)=>M.cover.some(c=>x>=c.x-.75&&x<=c.x+c.w+.75&&y>=c.y-.75&&y<=c.y+c.h+.75);
      for(let gy=1;gy<GH-1;gy++)for(let gx=1;gx<GW-1;gx++){
        const x=(gx+.5)*GS,y=(gy+.5)*GS;
        if(!free(x,y))continue;
        const room=roomAt(x,y); if(!room)continue;
        let nb=0;
        if(free(x+GS,y))nb++; if(free(x-GS,y))nb++;
        if(free(x,y+GS))nb++; if(free(x,y-GS))nb++;
        if(nb<=1&&nearCover(x,y))dead.push({room:room.id,x:+x.toFixed(1),y:+y.toFixed(1),nb});
      }
      return {gaps,dead};
    }

    /* ---------------- 断言层 / DEV ----------------
       2026-11-06 用户裁定：**游戏运行时不再自动跑断言**。
       这里只保留门禁/DEV 的显式探针 `_t.inv()`；失败只报，不修状态（修状态会掩盖 bug）。
       ?strict 下探针仍会抛错。 */
    function runInvariants(tag){
      if(SIM_RUN)return null;
      const inv=global.SKInvariants;
      if(!inv||!G)return null;
      let r;
      try{
        r=inv.check(G,{M:M,NIGHT:NIGHT,winPts:WIN_PTS,roomAt:roomAt,inCorr:inCorr,free:free,
          walkableNear:walkableNear,nearPipe:nearPipeXY,bodyPos:bodyPos});
      }catch(err){
        r={checks:0,fails:[{code:'EX',msg:String((err&&err.message)||err)}]};
      }
      G.inv.runs++; G.inv.checks+=r.checks; G.inv.lastTag=tag;
      const now=performance.now();
      for(const f of r.fails){
        const key=f.code+'|'+f.msg;
        if(now-(G.inv.warned[key]||0)>4000){
          G.inv.warned[key]=now;
          console.warn('[invariant]',tag,f.code,f.msg);
        }
      }
      G.inv.fails=r.fails.slice();
      const el=document.getElementById('inv');
      if(el)el.textContent=G.inv.fails.length;
      const box=document.getElementById('invfail');
      if(box){
        if(G.inv.fails.length){
          const f=G.inv.fails[0];
          box.textContent='断言失败 '+G.inv.fails.length+' · '+tag+' · '+f.code+' · '+f.msg;
          box.classList.remove('hide');
        }else box.classList.add('hide');
      }
      if(STRICT&&G.inv.fails.length){
        const f=G.inv.fails[0];
        throw new Error('SKInvariants['+tag+'] '+f.code+' '+f.msg);
      }
      return r;
    }

    /* DEV 横栏：一人一张小卡（名字 / 身份 / 状态 / 舱室 + 身上的资源）。
       资源是玩家在正常对局里看不到的信息，所以只在这里展示，不进 HUD。
       卡片横向排开贴顶，#hud 由 syncDevUi 下移让位，绝不压住左上角。

       性能（2026-11-13）：以前每 30 帧重建一次 innerHTML。高刷屏 30 帧只有 ~0.18s，
       15 张卡反复重建会周期性顶掉一帧；现在卡片只建一次，之后原地改文本，
       并按墙钟 500ms 刷新（与原注释的 0.5s 口径一致），内容没变就不写 DOM。 */
    let devCards=[];
    function renderDevPanel(){
      const box=document.getElementById('dev-rows');
      if(!box||!G)return;
      if(devCards.length!==G.agents.length||devCards.some((r,i)=>r.a!==G.agents[i])){
        box.textContent='';devCards=[];
        for(const a of G.agents){
          const root=document.createElement('div');
          const top=document.createElement('div');top.className='top';
          const b=document.createElement('b'),sp=document.createElement('span');
          top.append(b,sp);
          const i=document.createElement('i'),u=document.createElement('u');
          root.append(top,i,u);
          box.append(root);
          devCards.push({a,root,b,sp,i,u,line:'',res:'',cls:''});
        }
      }
      for(const a of G.agents){
        const r=devCards[a.i];
        if(!r)continue;
        let st='待机';
        if(!a.alive) st=a.ghost?'幽灵':'出局';
        else if(a.downed) st='濒死';
        else if(a.detained) st='被擒';
        else if(a.doing>0) st=(a._doing==='task'?'做任务':(a._doing==='fix'?'修故障':
          (a._doing==='revive'?'施救':(a._doing==='qual'?'领申请单':(a._doing==='ammo'?'取子弹':
          (a._doing==='med'?'取医疗包':(a._doing==='breaker'?'拉闸':(a._doing==='fake'?'假装做任务':'行动'))))))));
        else if(a.moving) st='移动';
        const bp=bodyPos(a);
        const where=bp?roomNameAt(bp[0],bp[1]):roomNameAt(a.x,a.y);
        const name=a.name+(a===G.me?(G.spectMode?'（AI）':'（你）'):'');
        /* 卡片会被压到 1/8 屏宽，资源行必须紧凑：空格与「·」在这里是纯浪费 */
        const res='弹'+a.bullet+' 包'+a.medkit+' 单'+a.qual
          +(a.qualPending>0?'+'+a.qualPending:'')
          +' 任务'+a.tIdx+'/'+a.tasks.length+(a.alien?' 刀'+a.knife:'');
        const line=st+' · '+where+(a.detained?' · 被锁':(a.draggedBy!=null?' · 被拖':(a.drag!=null?' · 拖尸':'')));
        const cls='dr'+(a.alien?' al':'')+((a===G.me&&!G.spectMode)?' me':'')+(!a.alive?' dead':'');
        if(r.b.textContent!==name)r.b.textContent=name;
        const role=a.alien?'内鬼':'人类';
        if(r.sp.textContent!==role)r.sp.textContent=role;
        if(r.line!==line){r.line=line;r.i.textContent=line;}
        if(r.res!==res){r.res=res;r.u.textContent=res;}
        if(r.cls!==cls){r.cls=cls;r.root.className=cls;}
      }
    }
    function syncDevUi(){
      if(SIM_RUN)return;
      const on=!!(G&&(G.dev||(G.spectMode&&G.spectDev!==false)));
      const dev=document.getElementById('dev');
      if(dev)dev.classList.toggle('hide',!on);
      const dl=document.getElementById('devline');
      if(dl){
        dl.classList.toggle('hide',!on);
        dl.innerHTML=G&&G.spectMode?'旁观者 · <b>全知总览</b> · 断言 <b id="inv">0</b> 失败'
          :'DEV <b>无敌 · 全知</b> · 断言 <b id="inv">0</b> 失败';
      }
      const dt=dev&&dev.querySelector('.dt span');
      if(dt)dt.textContent=G&&G.spectMode?'旁观者 · 全知总览（不参与对局）':'DEV · 全知总览';
      if(on)renderDevPanel();
      /* 横栏贴顶：先渲染再量高度，把 #hud 整体让下去，
         左上角的维修进度 / 存活人数 / 个人任务永远不被遮住 */
      const hud=document.getElementById('hud');
      /* 横栏高度要等布局落定才量得准（首次显示时 offsetHeight 还是 0）：
         同步一次 + 下一帧再校正一次，保证左上角的维修进度永远在横栏下方。 */
      const place=()=>{
        /* 横栏高度按运行时实测，窄屏会从 8 列变 5/3 列，别写死 134。 */
        const off=on&&dev?dev.offsetHeight:0;
        if(hud)hud.style.top=on?Math.max(96,off+18)+'px':'';
        /* T3（2026-11-05）：DEV / 旁观顶栏贴顶时，会议卡与结算卡改为"从栏底开始"。
           不用 margin-top —— 覆盖层是 flex 居中，margin 会被折半，窄屏仍可能被盖。
           改成 padding-top + align-items:flex-start，位移等于实测栏高。 */
        const meet=document.getElementById('meet');
        if(meet){
          meet.style.paddingTop=off?off+'px':'';
          meet.style.alignItems=off?'flex-start':'';
        }
        const mtg=document.querySelector('#meet .mtg');
        if(mtg)mtg.style.maxHeight=off?('calc(100vh - '+(off+16)+'px)'):'';
        const end=document.getElementById('end');
        if(end){
          end.style.paddingTop=off?off+'px':'';
          end.style.alignItems=off?'flex-start':'';
        }
        const endCard=document.querySelector('#end .card');
        if(endCard)endCard.style.maxHeight=off?('calc(100vh - '+(off+16)+'px)'):'';
      };
      place();
      if(on&&typeof requestAnimationFrame==='function')requestAnimationFrame(place);
      /* 濒死人数是对局隐藏信息：只有 DEV / 旁观全知才显示 */
      const dnw=document.getElementById('dnwrap');
      if(dnw)dnw.classList.toggle('hide',!on);
    }
    function toggleDev(){
      if(!G)return;
      G.dev=!G.dev;
      syncDevUi();
      toast(G.dev?'DEV：无敌 + 全知（F2 关闭）':'DEV：已关闭');
    }
    function refreshLight(){ return _ensureShip().refreshLight(); }
    function applyRoomOut(){ return _ensureShip().applyRoomOut(); }
    function outBlocksDoing(a){ return _ensureShip().outBlocksDoing(a); }
    function roomOutTick(dt){ return _ensureShip().roomOutTick(dt); }
    function breakerOnTime(){ return _ensureShip().breakerOnTime(); }
    function breakerOffTime(){ return _ensureShip().breakerOffTime(); }
    function breakerPullTime(){ return _ensureShip().breakerPullTime(); }
    function breakerPuller(){ return _ensureShip().breakerPuller(); }
    function pullBreaker(actor){ return _ensureShip().pullBreaker(actor); }
    function togglePause(){ return _ensureShip().togglePause(); }
    function restartGame(){ return _ensureShip().restartGame(); }
    function exitToMenu(){ return _ensureShip().exitToMenu(); }

    /* ---------------- 胜负 ---------------- */
    /* 人类维修胜利目标分的唯一真源：checkWin、结算文案、HUD 上限与进度条
       全部读这里。之前 HUD 单独写死「/ 40」，与 45 分的实际口径不符。
       2026-11-03：数值搬到 SKSanity.WIN（**没改数**），报告侧要能读配置快照。 */
    const WIN_PTS=SKSanity.WIN.pts;

    /* ---------------- 移动 ---------------- */
    /* 场上所有活人（玩家 / AI 人类 / AI 异形）共用同一移动速度；
       拖拽尸体与幽灵态是明确的例外，速度单独写在调用处。
       异形刚放倒人后的**逃逸加速**读 `a.rushT`（SKSanity.RUSH，独立计时器，与红身无关）。
       次序固定为 **拖尸 > 加速 > 基础**：拖着尸体还提速 50% 会直接毁掉藏尸的紧张感，
       也违背"AI 不许拖着尸体满速跑"那条教训。 */
    const MOVE_SPEED=SKT2Space.MOVE_SPEED;
    /* 拖拽统一降速到 2.5 格/秒；AI 与玩家共用同一入口，避免出现"AI 拖着尸体跑得比人快" */
    const DRAG_SPEED=SKT2Space.DRAG_SPEED;
    function moveSpeed(a){
      if(a&&a.drag!=null)return DRAG_SPEED;
      let sp=MOVE_SPEED;
      if(a&&a.rushT>0){
        const R=SKSanity.RUSH, frac=R.decay?Math.max(0,Math.min(1,a.rushT/Math.max(0.01,R.dur||1))):1;
        sp*=(1+(R.mul-1)*frac);
      }
      if(G&&G.terminator&&a&&a.alien)sp*=1.5;
      return sp;
    }
    /* 击杀加速的唯一授予入口：只由"把人放倒"的结算调用（knife / fireShot）。
       绑放倒而不绑致死 —— 这游戏里刀枪都只把人打成濒死，真死常在天亮失血/驱逐，
       绑致死等于没有这个机制。绝不从 redT 推导：红身是目击证据与表现，
       rushT 是体力状态，两者时长相等只是巧合。 */
    function killRushStart(a){
      const R=SKSanity.RUSH;
      if(!a||!a.alive)return;
      if(R.alienOnly&&!a.alien)return;
      a.rushT=R.dur;
      if(G.simMode&&G.simStats)G.simStats.rushKills=(G.simStats.rushKills||0)+1;
    }
    function walkTo(a,x,y){
      a._stuckT=0;
      if(G&&G.terminator&&!freeFly(a)){
        const tr=roomAt(x,y), cr=roomAt(a.x,a.y);
        if(tr&&tr.id!=='bridge'&&cr!==tr){
          const fb=cr||M.rooms.find(q=>q.id==='bridge')||M.rooms[0];
          const sp=SKT2Space.idleSpot(fb); x=sp[0]; y=sp[1];
        }
      }
      /* 不可达目标不要每帧重跑 A*：仅对同一失败终点冷却；AI 改变索敌/换目标时立即清冷却重算 */
      if(a!==G.me||G.spectMode){
        if((a._pathCD||0)>0){
          if(a._failX!=null&&Math.hypot(x-a._failX,y-a._failY)<0.8)return;
          a._pathCD=0;
        }
      }
      const p=astar(a.x,a.y,x,y);
      if(!p&&(a!==G.me||G.spectMode)){a._pathCD=1.2;a._failX=x;a._failY=y;}
      if(p){
        a._failX=null;a._failY=null;
        if(a.moving&&p.length>1&&pathClear(a.x,a.y,p[1][0],p[1][1]))p.shift();
        a.path=p;
      }
    }
    /* 旁观者相机：不在对局里，直线穿墙、9 格/秒，不参与任何碰撞与判定 */
    const SPECT_SPEED=SKT2Space.SPECT_SPEED;
    function stepSpect(dt){
      const sp=G&&G.spect; if(!sp)return;
      if(!sp.path||!sp.path.length){sp.moving=false;return;}
      sp.moving=true;
      let left=SPECT_SPEED*dt;
      while(left>0&&sp.path.length){
        const p=sp.path[0],dx=p[0]-sp.x,dy=p[1]-sp.y,d=Math.hypot(dx,dy);
        if(d<0.05){sp.path.shift();continue;}
        if(Math.abs(dx)>Math.abs(dy))sp.dir=dx>0?'right':'left';else sp.dir=dy>0?'down':'up';
        if(d<=left){sp.x=p[0];sp.y=p[1];left-=d;sp.path.shift();}
        else{sp.x+=dx/d*left;sp.y+=dy/d*left;left=0;}
      }
      sp.moving=!!(sp.path&&sp.path.length);
    }
    function camFocus(){ return (G&&G.spectMode&&G.spect)?G.spect:G.me; }
    /* 穿墙口径的唯一收口：真正的幽灵（死者）与设计者模式。
       门阻挡、围墙兜底、拐角重寻路三处都读它，不要在各分支里各写一遍条件。 */
    function freeFly(a){ return !!(G&&G.designMode)||(a.ghost&&!a.alive); }
    function stepMove(a,dt,sp){
      /* stunT：无人机救起后的 3 秒僵直，与保安拘留同样只挡移动 */
      if(a.detained||(a.stunT||0)>0){a.moving=false;return true;}
      if(!a.path||!a.path.length){a.moving=false;a._vx=0;a._vy=0;return true;}
      a.moving=true;
      const ox=a.x, oy=a.y;
      a._vx=0; a._vy=0;
      let left=sp*dt;
      while(left>0&&a.path.length){
        const p=a.path[0],dx=p[0]-a.x,dy=p[1]-a.y,d=Math.hypot(dx,dy);
        if(d<0.02){a.path.shift();continue;}
        if(Math.abs(dx)>Math.abs(dy)) a.dir=dx>0?'right':'left'; else a.dir=dy>0?'down':'up';
        if(d<=left){
          if(!freeFly(a)&&doorBlockedSegment(a.x,a.y,p[0],p[1])){
            a.moving=false;a._doorWaitT=(a._doorWaitT||0)+dt;
            if(a._doorWaitT>DOOR_SCAN_TIME+0.8){a._doorWaitT=0;a.path=null;a._pathCD=0.5;}
            return false;
          }
          a._doorWaitT=0;a.x=p[0];a.y=p[1];left-=d;a.path.shift();
        }
        else{
          const nx=a.x+dx/d*left, ny=a.y+dy/d*left;
          if(!freeFly(a)&&doorBlockedSegment(a.x,a.y,nx,ny)){
            a.moving=false;a._doorWaitT=(a._doorWaitT||0)+dt;
            if(a._doorWaitT>DOOR_SCAN_TIME+0.8){a._doorWaitT=0;a.path=null;a._pathCD=0.5;}
            return false;
          }
          a._doorWaitT=0;a.x=nx;a.y=ny;left=0;
        }
      }
      /* 围墙兜底：活人永远留在船体可行走面内；幽灵与设计者才允许穿墙 */
      if(!freeFly(a)&&!free(a.x,a.y)){
        const f=nearestFree(a.x,a.y); a.x=f[0]; a.y=f[1];
      }
      /* 拐角卡死兜底：路径还在但连续 0.7 秒没有位移 ⇒ 从最近可走点重寻路 */
      if(!freeFly(a)&&a.path&&a.path.length){
        if(Math.hypot(a.x-ox,a.y-oy)<0.004)a._stuckT=(a._stuckT||0)+dt;
        else a._stuckT=0;
        if(a._stuckT>0.7){
          const dest=a.path[a.path.length-1];
          const f=nearestFree(a.x,a.y);
          a.x=f[0];a.y=f[1];
          a._stuckT=0;
          a.path=astar(a.x,a.y,dest[0],dest[1]);
        }
      }else a._stuckT=0;
      /* 脚步：按实际走过的距离触发，近处才响。
         幽灵（a.alive=false）不发出任何脚步痕迹：它们飘在墙里，既不该响，
         也不该在声纹上留下一个"有人在走"的圈——那会让活人误读现场。 */
      const moved=sp*dt;
      a._stepAcc=(a._stepAcc||0)+moved;
      if(a._stepAcc>=0.78){
        a._stepAcc=0;
        if(a.alive){
          const dme=Math.hypot(a.x-G.me.x,a.y-G.me.y);
          if(dme<8&&(a===G.me||visibleAt(a.x,a.y))) SND.step(a===G.me?0.42:SND.volAt(a.x,a.y,0.6));
          /* 声纹：别人的脚步即使被墙挡住也能听见方向（近处才画） */
          if(a!==G.me&&dme<14) hear(a.x,a.y,'step',Math.max(0.18,0.7*(1-dme/14)));
        }
      }
      a.moving=!!(a.path&&a.path.length);
      /* 记住最后一次真实位移方向，供 agentAimAng 在她停下后继续当"手电朝向" */
      if(Math.hypot(a.x-ox,a.y-oy)>0.002)a._aimAng=Math.atan2(a.y-oy,a.x-ox);
      if(a.doing>0&&Math.hypot(a.x-ox,a.y-oy)>0.002)a._moveHit=true;
      if(a.drag!=null)syncDragOf(a);
      a._vx=a.x-ox;a._vy=a.y-oy;
      return !a.moving;
    }
    
    /* ---------------- 交互 ---------------- */
    function nearPipe(a){
      let best=null,bd=1.6;
      for(const q of M.pipes){ const d=Math.hypot(q.x-a.x,q.y-a.y); if(d<bd){bd=d;best=q;} }
      return best;
    }
    function pipeOpts(from){ return M.pipes.map((q,i)=>({q,i})).filter(o=>o.q!==from); }
    function openPipePick(from){
      if(!G||G.meet||G.over||G.inspect||G.camView||G.sabPick)return false;
      const me=G.me;
      if(!me.alive||me.downed||me.detained)return false;
      if(!me.alien&&!G.designMode){toast('管道口：你没有能力打开它');return false;}
      if(!from)from=nearPipe(me);
      if(!from){toast('要站在管道口才能钻地道');return false;}
      /* 2026-11-03 用户裁定"AI 与玩家数值完全一致"：钻管道的冷却两边同一个数。
         以前 AI 是 20 秒冷却、玩家**零冷却**（可以连着钻），那是玩家白拿的特权。
         设计者模式是验地图的工具，冷却只会挡住"连着钻八个口"，跳过。 */
      if(!G.designMode&&(me._pipeCD||0)>0){
        toast('管道还没冷却完（还要 '+Math.ceil(me._pipeCD)+' 秒）');return false;}
      G.pipePick={from:M.pipes.indexOf(from)};
      me.path=null;me.doing=0;me._doing=null;
      const opts=pipeOpts(from), box=document.getElementById('pipe-list');
      box.innerHTML=opts.map((o,n)=>{
        const nm=roomNameById(o.q.room),d=Math.hypot(o.q.x-me.x,o.q.y-me.y);
        return '<button data-pipe="'+o.i+'"><span class="pn">'+(n+1)+'</span>'
          +'<span class="pr">'+nm+'</span><span class="pd">'+d.toFixed(0)+' 格</span></button>';
      }).join('');
      [...box.children].forEach(btn=>{btn.onclick=()=>pickPipe(+btn.dataset.pipe);});
      document.getElementById('pipe-sub').textContent=
        '当前：'+roomNameById(from.room)+' 管道口 · 数字键 1–'+opts.length+' 直接选择';
      document.getElementById('pipe').classList.remove('hide');
      SND.interact(); hear(from.x,from.y,'pipe',0.8);
      return true;
    }
    function closePipePick(silent){
      if(G)G.pipePick=null;
      const el=document.getElementById('pipe'); if(el)el.classList.add('hide');
      if(!silent)toast('已取消');
    }
    function pickPipe(i){
      const pp=G&&G.pipePick; if(!pp)return false;
      if(i===pp.from)return false;
      const to=M.pipes[i]; if(!to)return false;
      const from=M.pipes[pp.from];
      const me=G.me;
      if(!me.alien&&!G.designMode)return false;
      if(me.drag!=null)releaseDragBy(me,true);
      me.x=to.x;me.y=to.y;me.path=null;me.moving=false;me._stepAcc=0;
      /* 冷却在**真的钻过去之后**才计（打开选择框又取消不该罚）；与 AI 同一个 PIPE.cooldown */
      me._pipeCD=SKSanity.PIPE.cooldown;
      G.pipePick=null;
      document.getElementById('pipe').classList.add('hide');
      G.fx.push({type:'pipefx',x:to.x,y:to.y,t:0.8,dur:0.8});
      SND.pipe(); hear(to.x,to.y,'pipe',1.1);
      logEvent('pipe',{actor:me.i,from:from?from.room:null,to:to.room,
        x:+to.x.toFixed(1),y:+to.y.toFixed(1)});
      if(from)witnessAlienAction(me,from.x,from.y,6,'pipe');
      witnessAlienAction(me,to.x,to.y,6,'pipe');
      aiHear('pipe',to.x,to.y,12,{actor:me});
      toast('穿管道 → '+roomNameById(to.room));
      return true;
    }
    function camMonitor(){ return M.facility.find(f=>f.kind==='monitor'); }
    /* 物资申请单：中央会议室圆桌领取；军械库/医疗间各有专用补给点 */
    function roundTableCover(){
      return M.cover.find(c=>c.room==='bridge'&&c.label==='圆桌')||null;
    }
    function roundTableClaimSpot(){
      const t=roundTableCover(); if(!t)return null;
      const cx=t.x+t.w/2, cy=t.y+t.h+1.2;
      /* 2026-11-06 掩体重构：圆桌下方 1.2 格现在被一圈议席占住，
         领申请单的点必须落在**真的能站人**的位置，否则 AI 永远领不到。
         先试原口径，再沿圆桌外圈找最近的空格。 */
      if(free(cx,cy))return {x:cx,y:cy,label:'圆桌 · 物资申请单'};
      for(let r=1.2;r<=3.0;r+=0.2){
        for(let i=0;i<24;i++){
          const a=i/24*Math.PI*2;
          const x=t.x+t.w/2+Math.cos(a)*r, y=t.y+t.h/2+Math.sin(a)*r;
          if(free(x,y))return {x:+x.toFixed(2),y:+y.toFixed(2),label:'圆桌 · 物资申请单'};
        }
      }
      return {x:cx,y:cy,label:'圆桌 · 物资申请单'};
    }
    function nearRoundTable(a){
      const t=roundTableCover(); if(!t)return null;
      const dx=Math.max(t.x-a.x,0,a.x-(t.x+t.w));
      const dy=Math.max(t.y-a.y,0,a.y-(t.y+t.h));
      return Math.hypot(dx,dy)<2.3?t:null;
    }
    function supplyPoints(){ return M.facility.filter(f=>f.kind==='supply'); }
    function nearSupply(a){
      let best=null,bd=1.7;
      for(const q of supplyPoints()){
        const d=Math.hypot(q.x-a.x,q.y-a.y);
        if(d<bd){bd=d;best=q;}
      }
      return best;
    }
    function supplyCoolLeft(item){
      return Math.max(0,(G&&G.supplyCD&&G.supplyCD[item])||0);
    }
    function supplyCDTick(dt){
      if(!G||!G.supplyCD)return;
      if(G.supplyCD.ammo>0)G.supplyCD.ammo=Math.max(0,G.supplyCD.ammo-dt);
      if(G.supplyCD.med>0)G.supplyCD.med=Math.max(0,G.supplyCD.med-dt);
    }
    function supplyTargetFor(a){
      if(!a||!a.qual||a.qual<1)return null;
      /* 有人濒死时医疗包优先；否则只要没有子弹就用申请单备弹。
         不再要求“当前已有嫌疑人”——AI 会先武装自己，再去找人。
         2026-11-22：补给箱有 20 秒冷却，冷却中跳过对应补给点。 */
      if(a.medkit<1&&supplyCoolLeft('med')<=0&&G.agents.some(v=>v!==a&&v.alive&&v.downed))return 'med';
      if(a.bullet<1&&supplyCoolLeft('ammo')<=0)return 'ammo';
      return null;
    }
    function qualDesk(){ return roundTableClaimSpot(); }
    function nearMonitor(a){
      const m=camMonitor();
      return (m&&Math.hypot(m.x-a.x,m.y-a.y)<1.8)?m:null;
    }
    function inCamRoom(a){const r=roomAt(a.x,a.y);return !!(r&&r.id==='cam');}
    function openCams(){
      if(!G||G.over||G.meet||G.inspect||G.pipePick||G.sabPick)return false;
      const me=G.me;
      if(!me.alive||me.downed||me.detained)return false;
      if(!inCamRoom(me)&&!nearMonitor(me)){toast('要走到监控室才能调取画面');return false;}
      me.path=null;me.doing=0;me._doing=null;
      G.camView=true;
      document.getElementById('cam').classList.remove('hide');
      const st=document.getElementById('cam-state');
      if(st){st.textContent=G.lightState===2?'● 信号中断 · 电闸断开':'● '+M.rooms.length+' 路在线';st.classList.toggle('cut',G.lightState===2);}
      const meta=document.getElementById('cam-meta');
      if(meta)meta.textContent='第 '+G.night+' 夜 · 剩余 '+Math.max(0,G.t).toFixed(0)+'s';
      SND.interact();
      toast(G.lightState===2?'监控信号中断：先合上配电室的电闸':'监控台已接入 · V / ESC 退出');
      return true;
    }
    function closeCams(silent){
      if(G)G.camView=false;
      const el=document.getElementById('cam');if(el)el.classList.add('hide');
      if(!silent)toast('已离开监控台');
    }
    function hear(x,y,kind,str){
      /* A 批（2026-11-05）：**听觉不受 UI 遮罩影响** —— 只有 suspend 才断。
         以前这里写死 `G.camView` 直接 return，等于"看监控就聋了"，与三态口径冲突。 */
      if(!G||attention(G.me)==='suspend')return;
      if(!G.me||!G.me.alive)return;
      const alienOnly=(kind==='knife'||kind==='pipe'||kind==='sabotage'||kind==='bot');
      const mul=(alienOnly&&SKSanity.SOUND&&SKSanity.SOUND.alienActMul)?SKSanity.SOUND.alienActMul:1;
      const maxR=18*mul;
      const d=Math.hypot(x-G.me.x,y-G.me.y);
      if(d>maxR)return;
      if(G.waves.length>52)G.waves.shift();
      G.waves.push({x,y,kind:kind||'step',t:0,dur:0.9+Math.min(0.5,d*0.02),
        str:Math.max(0.22,1-d/maxR)*(str==null?1:str)});
      /* N5（2026-11-05）：声纹环第一次出现时教一次，之后不再打扰。 */
      if(!G.waveHint){
        G.waveHint=true;
        toast('声纹环：声音的方位 · 越近越亮 · 不显示身份');
      }
    }
    function nearPoint(a){
      let best=null,bd=2.6;
      for(const p of M.points){
        const d=Math.hypot(p.x-a.x,p.y-a.y);
        if(d<bd){bd=d;best=p;}
      }
      return best;
    }
    /* 玩家音频的可听门限：与 AI 听觉读同一个半径（SKSanity.SOUND），
       超过半径直接不播 —— SND.volAt 只做距离衰减，保底 0.14 会让全图都听得见，
       那是"远处有底音"，不是"远处也能听见惨叫"（2026-11-20 用户裁定）。 */
    function playerAudibleAt(x,y,r,alienOnly){
      if(!G||!G.me)return false;
      const mul=(alienOnly&&SKSanity.SOUND&&SKSanity.SOUND.alienActMul)?SKSanity.SOUND.alienActMul:1;
      return Math.hypot(x-G.me.x,y-G.me.y)<=r*mul;
    }
    /* 剩余任务列表的读取分散在 taskPlan / HUD / 幽灵分支里，直接用 a.tasks 与 a.tIdx；
       早前的 myTasksLeft() 包装没有任何调用点，已删。 */

    /* ---------------- 异形破坏 / 故障维修 ----------------
       每个异形每晚一次破坏技：选一个非会议室舱室，抵达后损毁该舱室的设备。
       故障 30 秒内没人连续修满 10 秒就扣 5 点维修进度；天亮前没修完不追罚。
       幽灵不能破坏（但可以参与维修），破坏必须在活着的异形手里。 */
    /* 破坏技能（2026-11-01 探查结论）：使用率 30% / 命中率 9.6% 只是表象，
       根因是 AI 调度耦合（td>5 门槛 / 与拉闸共名额 / 随机选房跨图）与
       envNotice 全船广播（破坏 = 免费全船警铃）。数值暂不动，等讨论定方案。 */
    /* 破坏/维修的窗口、站桩秒数与近身判定距离（2026-11-03 外提到 SKSanity，**数值照旧**）：
       报告侧要读配置快照，散在 game.js 里的数读不到。 */
    const SAB_TIME=SKSanity.STAND.fault, FIX_TIME=SKSanity.STAND.fix,
          SAB_RANGE=SKSanity.REACH.sabotage, FIX_RANGE=SKSanity.REACH.fix;
    /* 专用补给点兑换物资的站桩时长（2026-10-31：子弹 10 → 7 秒、医疗包 6 → 5 秒）。
       玩家与 AI 共用这两个常量，改这里即可，别在调用处再写死数字。 */
    const SUPPLY_AMMO_TIME=SKSanity.STAND.ammo, SUPPLY_MED_TIME=SKSanity.STAND.med,
      SUPPLY_QUAL_TIME=SKSanity.STAND.qual;
    /* 电闸交互半径（2026-10-31）：锚点对齐到柜体中心后，柜体是 1.6×2.2 格的大件，
       1.6 格时代玩家贴着正面都按不到。三处判定（玩家轮盘 / AI 合闸 / AI 拉闸）共用。 */
    const BREAKER_USE_R=2.0;
    /* ---------------- 异形破坏 / 故障维修（已拆至 js/engine/sabotage.js#SKSabotage） ---------------- */
    const { STAND_ACT, NO_MG_ACT } = global.SKSabotage;
    let _sab = null;
    function _ensureSab(){
      if(_sab)return _sab;
      _sab=SKSabotage.create({
        getG:()=>G,getSimRun:()=>SIM_RUN,getTestRun:()=>TEST_RUN,getSND:()=>SND,
        M,SKSanity,SKMiniGameGetter:()=>global.SKMiniGame,
        SAB_TIME,FIX_TIME,SAB_RANGE,FIX_RANGE,
        nearestFree,roomIdAt,roomNameById,evNow,
        applyRoomOut,refreshLight,hear,aiHear,envNotice,
        witnessAlienAction,ambushSpotFor,credBroadcast,
        noticeTaskAbandon,outBlocksDoing,finishDoing,logEvent,toast
      });
      return _sab;
    }
    function clearSabSpots(){ return _ensureSab().clearSabSpots(); }
    function dmgOfRoom(rid){ return _ensureSab().dmgOfRoom(rid); }
    function sabRoomOk(rid){ return _ensureSab().sabRoomOk(rid); }
    function sabSpot(rid){ return _ensureSab().sabSpot(rid); }
    function nearDmg(a,maxD){ return _ensureSab().nearDmg(a,maxD); }
    function openSabPick(){ return _ensureSab().openSabPick(); }
    function closeSabPick(silent){ return _ensureSab().closeSabPick(silent); }
    function pickSabRoom(rid){ return _ensureSab().pickSabRoom(rid); }
    function damageRoom(a,rid,spot,ghost){ return _ensureSab().damageRoom(a,rid,spot,ghost); }
    function startFix(a,d){ return _ensureSab().startFix(a,d); }
    function finishFix(a){ return _ensureSab().finishFix(a); }
    function tickDoing(a,dt){ return _ensureSab().tickDoing(a,dt); }
    function miniGameOn(){ return _ensureSab().miniGameOn(); }
    function playerMiniGame(a){ return _ensureSab().playerMiniGame(a); }
    function dmgTick(dt){ return _ensureSab().dmgTick(dt); }
    function sabTick(){ return _ensureSab().sabTick(); }

    /* 夜间见闻：只记录真的进过的房间和视距内看见的人。
       会议发言全部从这些事实里生成，才不会前言不搭后语。 */
    function trackNight(a){
      /* 与玩家一致：做小游戏 / 看全屏遮罩时视觉被 UI 遮住，既不记人也不记时间线。
         例外见 canObserve：濒死被拖动时玩家仍有视野，AI 也必须有（R20.4）。 */
      if(!canObserve(a))return;
      const rid=roomIdAt(a.x,a.y);
      if(rid!=='corridor'&&rid!=='unknown'){
        a.nRoom=rid;
        /* 2026-11-21：本夜各舱停留时长（异形编口供用：说"待得最久的地方"最容易对上目击记忆） */
        a._stay=a._stay||{};
        a._stay[rid]=(a._stay[rid]||0)+1;
      }
      if(!a.nSeen)a.nSeen={};
      if(!a.mind)mindReset(a);
      /* 记忆范围也走实际视野：同亮舱整间 / 亮走廊整条 / 7 格手电锥 / 近身圆。
         旧的 a.alien?8:5.5 是 AI 专属扫描半径，玩家能看见的人它却记不住，
         又是一处"AI 和玩家玩的不是同一个游戏"。 */
      const scanR=Math.max(HUMAN_LIGHT_R,sightRangeAt(a.x,a.y));
      for(const w of G.agents){
        if(w===a||!w.alive||w.downed)continue;
        if(Math.hypot(w.x-a.x,w.y-a.y)>scanR)continue;
        if(aiCanSee(a,w.x,w.y,scanR)){
          a.nSeen[w.i]=(a.nSeen[w.i]||0)+1;
          /* ---- 回避可观察（2026-11-02）----
             「白天说怀疑我 → 夜里绕开我」原本只有行为、没有观察端。
             现在**被回避的人自己**会注意到：他刚才明明能走过来，却拐了个弯。
             弱证据（0.10）、每夜每人一次、只在看得见时记 —— 不能变成"谁躲谁可疑"。 */
          const AV=SKSanity.AVOID;
          if(w._avoidHuman===a.i&&Math.hypot(a.x-w.x,a.y-w.y)<=AV.nearR){
            a.mind.avoidSeen=a.mind.avoidSeen||{};
            if(a.mind.avoidSeen[w.i]!==G.night){
              a.mind.avoidSeen[w.i]=G.night;
              const evA={kind:'saw_avoid',x:+w.x.toFixed(1),y:+w.y.toFixed(1),
                room:roomIdAt(w.x,w.y),subj:w.i,conf:0.45,src:'sight'};
              evPush(a,evA);
              susAdd(a,w.i,SKSanity.MAPPING.sawAvoid,'saw_avoid',evA);
              if(G.simStats)G.simStats.avoidSus=(G.simStats.avoidSus||0)+1;
            }
          }
          /* 目击时间线：同一个人每 3.5 秒最多记一条，供尸体关联与会议对质 */
          const last=a.mind.seenT[w.i]||-99;
          if(evNow()-last>=3.5){
            a.mind.seenT[w.i]=evNow();
            /* ox/oy = **目击者自己**当时的位置；lit = 目击者所在舱室当时是否亮着。
               两条都是给「在场反驳 presence_deny」用的：
               只有我当时真在那间亮着灯的舱室，才谈得上"我没看见他"。 */
            evPush(a,{kind:'saw_agent',x:w.x,y:w.y,room:roomIdAt(w.x,w.y),subj:w.i,conf:0.8,
              src:'sight',ox:+a.x.toFixed(1),oy:+a.y.toFixed(1),
              lit:!!G.lit[roomIdAt(a.x,a.y)]});
          }
          /* 刀者红身：只有刚出刀的人会红 RED_BODY.dur 秒；人类没有刀，所以看到红光 = 确证异形。
             异形看到红光或破坏/假任务动作则记成队友（视野内真实可见，绝不透视）。 */
          if(a.alien&&w!==a&&(w.redT>0||w._doing==='sab'||w._doing==='fake')){
            markMate(a,w,w.redT>0?'saw_red':'saw_'+w._doing);
          }else if(!a.alien&&w.redT>0){
            /* 2026-11-21 用户裁定：0.5 秒的红光是**一瞬间的身体闪光**，
               只有「近身视野圆」或「手电锥正对着」才看得见 ——
               不享受"亮房整间可见"（一屋子人不会同时注意到半秒的红）。
               这条独立于普通视野判定（aiCanSee），否则亮房里等于全员确证。 */
            if(!redSpotVisible(a,w.x,w.y))continue;
            const lastRed=a.mind.redSeen[w.i]||-99;
            if(evNow()-lastRed>5){
              a.mind.redSeen[w.i]=evNow();
              /* 同样的证据分级（2026-11-02）：红光也得**足够近**才算看清，
                 隔远了只记得"那边有个人发红"，只加嫌疑、不写确证。 */
              /* 2026-11-21 用户裁定「视野+屏幕内即确证」：红光不再按 4.5 格分级；
                 2026-11-22 诊断旋钮 useDist=true 时恢复距离分级（与异形行为目击同一口径）。 */
              const RCF=SKSanity.CONFIRM||{};
              const near=RCF.useDist?(Math.hypot(a.x-w.x,a.y-w.y)<=(RCF.nearR||4.5)):true;
              const ev={kind:'saw_red',x:w.x,y:w.y,room:roomIdAt(w.x,w.y),subj:w.i,
                conf:near?0.9:0.55,src:'sight'};
              if(!near)ev.far=1;
              evPush(a,ev);
              /* 只留证据链（why.saw_red），分数由下方 trustCert(−999) 一次性给出 ——
                 旧写法把 −999 当嫌疑分扣一遍、再写确证，同一件事记两遍。 */
              susAdd(a,w.i,0.01,'saw_red',ev);
              if(near){
                /* 目击认错人：20% 概率认成现场另一个**看得见**的人（用户 2026-11-07 裁定） */
                const mis=misIdPick(a,w.i,w.x,w.y,SKSanity.CONFIRM.nearR+2);
                const kidx=mis?mis.i:w.i;
                const kobj=mis||w;
                a.mind.known[kidx]={t:ev.t,kind:'saw_red',room:ev.room,conf:0.9};
                trustCert(a,kidx,true);   /* 一切分数化：确证 = T −999 */
          trustMirror(a,kidx);
                a.mind.sus[kidx]=1;
                a.suspect=kidx;
                knownBump('saw_red', !!kobj.alien);
                if(mis)misIdBump(mis,w);
                knownOverride(a,kidx);
              }else if(G&&G.simStats)G.simStats.farSight=(G.simStats.farSight||0)+1;
            }
          }
        }
      }
    }

    /* ---------------- AI 认知层（已拆至 js/ai/cognition.js#SKCognition） ---------------- */
    const FRAME_DT = SKCognition.FRAME_DT, EV_W = SKCognition.EV_W;
    const SGT = SKSanity.SIGHT, HUMAN_LIGHT_R = SGT.humanLightR, HUMAN_DARK_R = SGT.humanDarkR, ALIEN_DARK_R = SGT.alienDarkR;
    let _cog = null;
    function _ensureCog(){
      if(_cog)return _cog;
      _cog=SKCognition.create({
        getG:()=>G,
        M, SKT2AI, SKSanity, SKTrait, SKLines, WIN_PTS, trustMirror, roomIdAt, causeName, losNow, sightRangeAt, openBodyCard, toast, litZoneAt, corrJoinsRoom, evNow, credOf, mindReset, evPush, axisAddT, trustCert, evalAlmost, knownOverride, susAdd, bodyPos, bodyHasLoot, lootBody, lootText, roomAt, los
      });
      return _cog;
    }
    function logEvent(kind,data){ return _ensureCog().logEvent(kind,data); }
    function recordFrame(){ return _ensureCog().recordFrame(); }
    function replayData(){ return _ensureCog().replayData(); }
    function reliaOf(a,i){ return _ensureCog().reliaOf(a,i); }
    function reliaAdd(a,i,w,reason){ return _ensureCog().reliaAdd(a,i,w,reason); }
    function emoAdd(a,i,w,reason){ return _ensureCog().emoAdd(a,i,w,reason); }
    function grudgeAdd(a,i,w){ return _ensureCog().grudgeAdd(a,i,w); }
    function trustAdd(a,i,w){ return _ensureCog().trustAdd(a,i,w); }
    function emotionOf(a,i){ return _ensureCog().emotionOf(a,i); }
    function isPatron(a,i){ return _ensureCog().isPatron(a,i); }
    function credAdd(a,i,w,reason){ return _ensureCog().credAdd(a,i,w,reason); }
    function topCred(a,min){ return _ensureCog().topCred(a,min); }
    function obeyTrustMul(a,leaderSeat){ return _ensureCog().obeyTrustMul(a,leaderSeat); }
    function warmAdd(a,i,w){ return _ensureCog().warmAdd(a,i,w); }
    function warmMate(a){ return _ensureCog().warmMate(a); }
    function settleAccountability(cand){ return _ensureCog().settleAccountability(cand); }
    function recordClaim(a,al){ return _ensureCog().recordClaim(a,al); }
    function defenseNote(def,tgt){ return _ensureCog().defenseNote(def,tgt); }
    function witnessCtxMul(x,y,nSeen){ return _ensureCog().witnessCtxMul(x,y,nSeen); }
    function credBroadcast(actor,kind,x,y){ return _ensureCog().credBroadcast(actor,kind,x,y); }
    function attention(a){ return _ensureCog().attention(a); }
    function canObserve(a){ return _ensureCog().canObserve(a); }
    function observerVisionAt(ox,oy,alien,aimAng,x,y){ return _ensureCog().observerVisionAt(ox,oy,alien,aimAng,x,y); }
    function redSpotVisible(w,x,y){ return _ensureCog().redSpotVisible(w,x,y); }
    function agentAimAng(a){ return _ensureCog().agentAimAng(a); }
    function aiCanSee(a,x,y,_maxD){ return _ensureCog().aiCanSee(a,x,y,_maxD); }
    function aiHear(kind,x,y,rad,extra){ return _ensureCog().aiHear(kind,x,y,rad,extra); }
    function envNotice(kind,x,y,conf){ return _ensureCog().envNotice(kind,x,y,conf); }
    function noticeTaskAbandon(actor,kind){ return _ensureCog().noticeTaskAbandon(actor,kind); }
    function noticeAction(actor,x,y,rad,kind,victim){ return _ensureCog().noticeAction(actor,x,y,rad,kind,victim); }
    function witnessAlienAction(actor,x,y,rad,kind,victim){ return _ensureCog().witnessAlienAction(actor,x,y,rad,kind,victim); }
    function witnessDetain(actor,x,y,rad){ return _ensureCog().witnessDetain(actor,x,y,rad); }
    function isMate(a,i){ return _ensureCog().isMate(a,i); }
    function isMyMate(a){ return _ensureCog().isMyMate(a); }
    function humanishOf(a,i){ return _ensureCog().humanishOf(a,i); }
    function misIdPick(w,realIdx,ex,ey,sceneR){ return _ensureCog().misIdPick(w,realIdx,ex,ey,sceneR); }
    function actionMisIdPick(w,realIdx,ex,ey){ return _ensureCog().actionMisIdPick(w,realIdx,ex,ey); }
    function misIdBump(wrong,real){ return _ensureCog().misIdBump(wrong,real); }
    function knownBump(kind,targetAlien){ return _ensureCog().knownBump(kind,targetAlien); }
    function markMate(observer,actor,kind){ return _ensureCog().markMate(observer,actor,kind); }
    function bodyWound(b){ return _ensureCog().bodyWound(b); }
    function takeBodyLoot(b){ return _ensureCog().takeBodyLoot(b); }
    function aiWantsLoot(a,b){ return _ensureCog().aiWantsLoot(a,b); }
    function bodyInfo(b){ return _ensureCog().bodyInfo(b); }
    function observeBody(a,v){ return _ensureCog().observeBody(a,v); }
    /* ---------------- 主循环 ---------------- */
    let last=0, rafId=0, DEAD=false;
    /* 帧率上限 60fps（2026-11-15 用户裁定，依据 docs/ASSET_GOVERNANCE.md §14.4）：
       高刷屏原按刷新率满速重绘（本机 165Hz → 每帧预算仅 6.06ms），DEV 开关即超预算掉帧。
       累积器式限流（acc += FRAME_MS）保证长期平均 60fps，不因刷新率抖动；落后过多则重置防连发。 */
    const FRAME_MS=1000/60; let acc=0;
    /* ---------------- 帧率仪表（2026-11-15，用户要求实时帧率） ----------------
       只统计**真正画出来**的帧：loop 里被 60fps 限流跳过的帧不计入 fps，
       所以读到的数字就是肉眼看到的帧率。
       绘 = draw() 自身耗时（JS 侧）；间隔 = 相邻两帧的实际间隔。
       间隔明显大于「绘」→ 瓶颈在合成/GPU/浏览器，不在 JS；两者接近 → 主线程真忙。
       主线程 % = 绘 / 间隔，约等于这个页面吃掉单核的比例（与任务管理器同口径）。 */
    const FPS={on:!TEST,el:null,w0:0,n:0,paint:0,worst:0,lost:0,lastTs:0,hzN:0,hz0:0,hz:0};
    try{ if(!TEST&&localStorage.getItem('sk_fps')==='0')FPS.on=false; }catch(_){}
    function fpsHud(){
      if(FPS.el && FPS.el.isConnected)return FPS.el;
      const existing=document.getElementById('fps-hud');
      if(existing)return (FPS.el=existing);
      /* 放右下角：左上角是 HUD、右上角是小地图、左下角是 #tip 操作条，这里不挡任何读数。
         z-index 必须高于 #v3-root(9999)，但要低于回放(10005)与设置(10010)，
         否则会被游戏根容器盖住、或者反过来盖住设置面板。 */
      const d=document.createElement('div'); d.id='fps-hud';
      d.style.cssText='position:fixed;right:14px;bottom:12px;z-index:10004;pointer-events:none;'+
        'font:600 12px/1.5 ui-monospace,Consolas,monospace;letter-spacing:.2px;color:#BFE9FF;'+
        'background:rgba(6,10,16,.76);border:1px solid #2A3B4E;border-radius:6px;padding:4px 10px;'+
        'white-space:nowrap;text-shadow:0 1px 2px #000';
      (document.body||document.documentElement).appendChild(d);
      return (FPS.el=d);
    }
    function fpsToggle(){
      FPS.on=!FPS.on;
      try{ localStorage.setItem('sk_fps',FPS.on?'1':'0'); }catch(_){}
      const e=fpsHud(); e.style.display=FPS.on?'block':'none';
      FPS.w0=0;FPS.n=0;FPS.paint=0;FPS.worst=0;FPS.lost=0;FPS.lastTs=0;
      toast(FPS.on?'帧率仪表：开 · 按 F8 关闭':'帧率仪表：关 · 按 F8 开启');
    }
    /* rAF 频率 = 屏幕当前刷新率（限流只少画，不影响 rAF 频率），用来判「每帧预算」 */
    function fpsRaf(ts){
      FPS.hzN++;
      if(!FPS.hz0)FPS.hz0=ts;
      else if(ts-FPS.hz0>=1000){ FPS.hz=Math.round(FPS.hzN*1000/(ts-FPS.hz0)); FPS.hzN=0; FPS.hz0=ts; }
    }
    function fpsTick(ts,paintMs){
      const e=fpsHud();
      if(!FPS.on){ e.style.display='none'; return; }
      e.style.display='block';
      const gap=FPS.lastTs?ts-FPS.lastTs:0; FPS.lastTs=ts;
      FPS.n++; FPS.paint+=paintMs;
      if(gap>FPS.worst)FPS.worst=gap;
      if(gap>FRAME_MS*1.5)FPS.lost++;
      if(!FPS.w0)FPS.w0=ts;
      const win=ts-FPS.w0;
      if(win<500)return;
      const fps=FPS.n*1000/win, paint=FPS.paint/Math.max(1,FPS.n), gapAvg=win/Math.max(1,FPS.n);
      const load=Math.round(paint/Math.max(0.01,gapAvg)*100);
      const col=fps>=55?'#7FE3A1':(fps>=35?'#F0C674':'#FF6B5E');
      const sep='<span style="color:#6E8299"> · </span>';
      e.innerHTML='<span style="font-size:16px;color:'+col+'">'+fps.toFixed(0)+'</span> FPS'+sep
        +'绘 '+paint.toFixed(1)+'ms'+sep
        +'间隔 '+gapAvg.toFixed(1)+'ms'+sep
        +'最差 '+Math.round(FPS.worst)+'ms'+sep
        +'掉 '+FPS.lost+sep
        +'屏 '+FPS.hz+'Hz'+sep
        +'主线程 '+load+'%';
      FPS.w0=ts;FPS.n=0;FPS.paint=0;FPS.worst=0;FPS.lost=0;
    }
    function loop(ts){
      if(DEAD)return;
      rafId=requestAnimationFrame(loop);
      if(FPS.on)fpsRaf(ts);
      if(!acc)acc=ts;
      if(ts<acc)return;
      acc+=FRAME_MS; if(ts-acc>FRAME_MS)acc=ts-FRAME_MS;
      const dt=Math.min(0.05,(ts-last)/1000||0); last=ts;
      if(!G.paused&&!G.over&&!G.meet&&!G.inspect) update(dt);
      const t0=performance.now();
      draw(G.paused?0:dt);
      if(FPS.on)fpsTick(ts,performance.now()-t0);
    }
    
    /* 被跟随恐慌感知：跟随判定 = 对方在本体 followRadius(5) 格内、且其移动朝向本体。
       连续积分（每秒 followE / followT，封顶 followCap），换目标即清零重来。 */
    function followSenseTick(dt){
      if(G.meet||G.over)return;
      const AX=SKSanity.AXIS, W=SKSanity.WITNESS;
      if(!W||!W.followE)return;
      for(const h of G.agents){
        if(!h||!h.alive||h.downed||!h.mind)continue;
        const F=h.mind._follow=(h.mind._follow||{});
        for(const o of G.agents){
          if(!o||o===h||!o.alive||o.downed||o.detained)continue;
          if(o.alien&&isMate(o,h.i))continue;
          const d=Math.hypot(o.x-h.x,o.y-h.y);
          const closing=(h.x-o.x)*(o._vx||0)+(h.y-o.y)*(o._vy||0)>0;
          const near=d<=W.followRadius&&closing;
          const rec=F[o.i];
          if(!near){ if(rec)F[o.i]=null; continue; }
          const acc=((rec&&rec.acc)||0)+dt;
          const crossed=(!rec||rec.slot==null)?0:(Math.floor(acc/2)>rec.slot?1:0);
          F[o.i]={acc:acc,t:evNow(),slot:Math.floor(acc/2)};
          if(acc<3)continue;                       /* 贴 3 秒以上才算"一直跟着"（100 局实测 1 秒口径过强） */
          const gE=Math.min(W.followCap,W.followE*dt);
          /* 2026-11-21 平衡修：「短期之内扣大量分数」落在**情绪 E**（恐慌），不扣 T。
             T 是证据账 —— 若"被靠近"也扣 T，先验只有 73 分时异形一晚上靠近人几次
             就会集体跌到 0 以下（准-确证异形线），100 局实测异形 0% 被逐光。
             E 参与 T+E 合成（敌对/投票/开枪都读），恐慌照样兑现。 */
          emoAdd(h,o.i,gE,'followed');
          /* why 依据每 2 秒记一条（只作发言依据，不扣分） */
          if(crossed){
            if(!h.mind.why)h.mind.why={};
            const arr=h.mind.why[o.i]||(h.mind.why[o.i]=[]);
            arr.push({kind:'followed',w:0,night:G.night,t:evNow(),
              x:o.x,y:o.y,room:roomIdAt(o.x,o.y),conf:0.5,src:'sight',subj:o.i});
            if(arr.length>8)arr.shift();
          }
        }
      }
    }
    function update(dt){
      /* 设计者纯净模式（2026-11-09）：世界不自己演化 —— 夜钟不走、AI 不动、不开会、
         不结算、不录回放帧；但设计者亲手按出来的东西照常结算
         （站桩 doing / tickActs、故障 dmgTick 倒计时、断电与门、小游戏）。 */
      const DZ=!!G.designMode;
      if(!DZ)roomOutTick(dt);
      if(!DZ)supplyCDTick(dt);
      doorTick(dt);
      if(!DZ)botTick(dt);
      /* 计时：正常对局交给 SKClock；批量模拟用 simT 推进，避免真实时间阻塞 */
      if(G.simMode){
        G.simT=Math.max(0,(G.simT==null?NIGHT:G.simT)-dt);
        G.t=G.simT;
      }else if(!DZ){
        if(!G.phase) G.phase=SKClock.newPhase('night',performance.now(),NIGHT*1000);
        G.t=SKClock.remaining(G.phase,performance.now())/1000;
      }
      if(!DZ){
        G.playT=(G.playT||0)+dt;
        G._frameAcc=(G._frameAcc||0)+dt;
        if(G._frameAcc>=FRAME_DT){G._frameAcc=0;recordFrame();}
      }
      const me=G.me;
      /* 故障：30 秒倒计时（只在夜里 update 里走），到点未修扣 5 分 */
      dmgTick(dt);
      if(!G.spectMode)sabTick();
      /* 被擒 / 倒下 / 死亡时立刻退出监控台、地道与破坏选择，避免卡在遮罩里 */
      if(!G.spectMode&&G.camView&&(!me.alive||me.downed||me.detained))closeCams(true);
      if(!G.spectMode&&G.wheel&&(!me.alive||me.downed||me.detained))closeWheel(true);
      if(!G.spectMode&&G.pipePick&&(!me.alive||me.downed||me.detained))closePipePick(true);
      if(!G.spectMode&&!DZ&&G.sabPick&&(!me.alive||me.downed||me.detained||!me.alien||me.sabUsed))closeSabPick(true);
      if(!G.spectMode&&!DZ&&G.sabTarget&&(me.sabUsed||!me.alien||!me.alive||me.downed))G.sabTarget=null;
      /* 被跟随恐慌（2026-11-21 用户裁定）：同一人持续贴近跟随 →
         被跟者对跟随者的恐慌情绪随时间上升（E+followE/s）、信任短期大扣（T−followT/s），
         封顶 followCap —— 函数积分，无档位 if。0.5s 节流。 */
      followSenseTick(dt);
      /* 保安机器人拘留倒计时：30 秒后自动释放 */
      for(const a of G.agents){
        if(!a.detained)continue;
        a.detainedT=(a.detainedT||0)-dt;
        a.moving=false; a.path=null;
        if(a.detainedT<=0){
          a.detained=false; a.detainedT=0;
          if(!G.spectMode&&a===me)toast('保安机器人解锁：你被释放了');
        }
      }
      // 玩家：活人正常走；幽灵穿墙飘；濒死/被擒不能动。旁观者只移动自己的相机幽灵。
      if(G.spectMode){
        stepSpect(dt);
      }else if(DZ){
        /* 设计者走幽灵的飞行口径（6.5 格/秒 + 直线穿墙，见 clickAt / freeFly），
           不然 A* 会把他卡在掩体外面，验不到贴着家具的任务点。 */
        if(me.path) stepMove(me,dt,6.5);
        tickDoing(me,dt);
      }else if(me.alive&&!me.downed&&!me.detained){
        if(me.path) stepMove(me,dt,moveSpeed(me));
        tickDoing(me,dt);
      }else if(!me.alive&&me.ghost){
        if(me.path) stepMove(me,dt,6.5);
        tickDoing(me,dt);
      }
      /* 拖拽声：玩家与 AI 同时结算，低频摩擦和脚步/出刀明确分开（旁观者不发声） */
      if(!G.spectMode)for(const a of G.agents) dragSound(a,dt);
      for(const a of G.agents) if(a.drag!=null)syncDragOf(a);
      // AI：死者变幽灵（只给幽灵/DEV 看，活人看不到就不必模拟）
      if(!DZ)for(const a of G.agents){
        if(a===me&&!G.spectMode)continue;
        if(!a.alive){ aiGhost(a,dt); continue; }
        if(a.downed||a.detained)continue;
        if(G.simDebug&&G.simMode)console.log('SIM ai '+a.i+' alien='+a.alien+' doing='+a.doing+' path='+(a.path?a.path.length:0));
        /* 报告赶路独占这一帧的移动（2026-11-18 超高速移动修复）。
           旧写法把 aiReportApproach 放在 aiHuman/aiAlien **之后**，两边各自
           stepMove ⇒ 赶路期间同一帧走两次：AI 2 倍速，且两套 path 互相覆盖
           造成抽搐。现在改成"赶路成功就跳过常规 AI"，任何一帧只走一次。
           _reportGo==null 时调用顺序与旧版完全一致（aiHuman → aiScanBodies），
           不改变常规帧的随机流；aiScanBodies 只置 _reportGo 不迈步，
           赶路从下一帧开始（延迟一帧，16ms 量级，肉眼不可见）。 */
        if(a._reportGo!=null&&aiReportApproach(a,dt)){
          if(G.simDebug&&G.simMode)console.log('SIM ai done '+a.i);
          continue;
        }
        const ox0=a.x,oy0=a.y;
        if(a.alien) aiAlien(a,dt); else aiHuman(a,dt);
        aiScanBodies(a,dt);
        if(!G.meet&&!G.over&&a.alive&&!a.downed&&!a.detained&&(a.stunT||0)<=0&&!(a.doing>0)&&!(a._doorWaitT>0)&&
           Math.hypot(a.x-ox0,a.y-oy0)<1e-4&&!(a._reportPlan&&a._reportPlan.direct&&a._reportPlan.wait>0)){
          a._pathCD=0;if(a.path&&a.path.length)stepMove(a,dt,moveSpeed(a));
          if(Math.hypot(a.x-ox0,a.y-oy0)<1e-4){a.path=null;aiIdleRoam(a,dt);}
        }
        if(Math.hypot(a.x-ox0,a.y-oy0)<1e-4)a.moving=false;
        if(G.simDebug&&G.simMode)console.log('SIM ai done '+a.i);
      }
      tickActs(dt);
      if(!DZ){
        G.trackT=(G.trackT||0)+dt;
        if(G.trackT>=0.4){G.trackT=0;
          for(const a of G.agents) if(a.alive&&(!a.downed||a.draggedBy!=null)) trackNight(a);}
      }
      // 维修火花：所有正在修的人都冒，玩家/可见 AI 都有手感
      for(const a of G.agents){
        if(a.doing>0&&a._doing==='task'){
          a._fxT=(a._fxT||0)+dt;
          if(a._fxT>=0.34){a._fxT=0;
            G.fx.push({type:'workSpark',x:a.x,y:a.y,t:0.55,dur:0.55,ang:Math.random()*6.283});
            if(a===me&&Math.random()<0.5)SND.work();
          }
        }else a._fxT=0;
      }
      // 濒死计时：到天亮才死
      if(!DZ&&G.t<=0) dawn();
      if(!DZ)checkWin();
      /* 监控台状态条：断电/恢复要在画面上立刻可见 */
      if(G.camView){
        G.camMetaT=(G.camMetaT||0)+dt;
        if(G.camMetaT>=0.25){
          G.camMetaT=0;
          const st=document.getElementById('cam-state');
          if(st){
            st.textContent=G.lightState===2?'● 信号中断 · 电闸断开':'● '+M.rooms.length+' 路在线';
            st.classList.toggle('cut',G.lightState===2);
          }
          const meta=document.getElementById('cam-meta');
          if(meta)meta.textContent='第 '+G.night+' 夜 · 剩余 '+Math.max(0,G.t).toFixed(0)+'s';
        }
      }
      if(!G.simMode)syncHud();
    }

    /* 无事可做不要站着（2026-10-31 裁定）：除开局错峰/硬控/短暂恢复外，
       不允许"非任务非维修非领取"的呆站；修完按「修故障→领申请单→巡舱」继续走。
       移动不产生情报，站着才是浪费人类时间。幽灵不修故障，巡舱即可。 */
    /* ---------------- AI 夜间决策与行动（已拆至 js/ai/night-ai.js#SKNightAI） ---------------- */
    let _nightAI = null;
    function _ensureNightAI(){
      if(_nightAI)return _nightAI;
      _nightAI=SKNightAI.create({
        getG:()=>G,getSND:()=>SND,getShootK:()=>SHOOT_K,
        inPoly, inCorr, roomAt, free, nearestFree, pathClear, randIn, roomIdAt, doorBlockedSegment, losNow, outBlocksDoing, breakerOnTime, breakerOffTime, moveSpeed, walkTo, stepMove, nearPipe, roundTableClaimSpot, supplyPoints, nearSupply, supplyCoolLeft, supplyTargetFor, hear, sabRoomOk, sabSpot, damageRoom, startFix, logEvent, credAdd, topCred, obeyTrustMul, warmMate, credBroadcast, attention, observerVisionAt, agentAimAng, aiCanSee, aiHear, noticeTaskAbandon, noticeAction, witnessAlienAction, isMate, humanishOf, aiWantsLoot, observeBody, setAct, knifeLockLeft, knife, finishDoing, secbotWouldSee, botPos, openMeeting, targetDistMul, lastAlienEvo, startTask, inKnifeArc, fireShot, knifeBot, secbotRaidOk, fireShotBot, toast, litZoneAt, topSus, bodyReported, markBodyReported, nightMeetLeft, ghostTaskAllowed, GHOST_TASK_CAP, botDead, evNow, mindReset, evPush, bestSusTarget, almostFoeOf, almostFriendOf, bestAlmostTarget, bestKnownTarget, affordableAlmostShot, audSusEstimate, publicHeat, publicInfluence, identityAxis, hostileProb, beliefOf, susAdd, bodyPos, bodyHasLoot, NIGHT, DOOR_SCAN_TIME, FIX_TIME, SUPPLY_AMMO_TIME, SUPPLY_MED_TIME, SUPPLY_QUAL_TIME, BREAKER_USE_R, EV_W, SGT, HUMAN_LIGHT_R, HUMAN_DARK_R, M, SKSanity, SKTrait, SKT2Space
      });
      return _nightAI;
    }
    function aiIdleRoam(a,dt){ return _ensureNightAI().aiIdleRoam(a,dt); }
    function aiGhost(a,dt){ return _ensureNightAI().aiGhost(a,dt); }
    function draggerOf(victim){ return _ensureNightAI().draggerOf(victim); }
    function syncDragOf(a){ return _ensureNightAI().syncDragOf(a); }
    function startDrag(a,v,silent){ return _ensureNightAI().startDrag(a,v,silent); }
    function releaseDragBy(a,silent){ return _ensureNightAI().releaseDragBy(a,silent); }
    function releaseDrag(silent){ return _ensureNightAI().releaseDrag(silent); }
    function releaseAllDrags(silent){ return _ensureNightAI().releaseAllDrags(silent); }
    function dragSound(a,dt){ return _ensureNightAI().dragSound(a,dt); }
    function aiScanBodies(a,dt){ return _ensureNightAI().aiScanBodies(a,dt); }
    function aiReportApproach(a,dt){ return _ensureNightAI().aiReportApproach(a,dt); }
    function inMedRoom(x,y){ return _ensureNightAI().inMedRoom(x,y); }
    function medDropSpot(){ return _ensureNightAI().medDropSpot(); }
    function aiHuman(a,dt){ return _ensureNightAI().aiHuman(a,dt); }
    function hideSpotFor(rid){ return _ensureNightAI().hideSpotFor(rid); }
    function hideRoomFor(rid,x,y){ return _ensureNightAI().hideRoomFor(rid,x,y); }
    function sightRangeAt(x,y){ return _ensureNightAI().sightRangeAt(x,y); }
    function watchersAt(a,x,y,rad,except){ return _ensureNightAI().watchersAt(a,x,y,rad,except); }
    function alienAudienceInfo(a){ return _ensureNightAI().alienAudienceInfo(a); }
    function disguiseOptions(a,aud){ return _ensureNightAI().disguiseOptions(a,aud); }
    function disguiseRiskParts(a,aud,spot){ return _ensureNightAI().disguiseRiskParts(a,aud,spot); }
    function alienPlan(a,td){ return _ensureNightAI().alienPlan(a,td); }
    function ambushSpotFor(rid,sp){ return _ensureNightAI().ambushSpotFor(rid,sp); }
    function aiAlien(a,dt){ return _ensureNightAI().aiAlien(a,dt); }
    function setAct(a,kind,dur,extra){
      if(!a)return;
      a.act=Object.assign({kind,dur,t:0},extra||{});
      if(Number.isFinite(a.act.ang))a._aimAng=a.act.ang;
    }
    function tickActs(dt){
      for(const a of G.agents){
        /* 红身与击杀加速各自独立递减 —— 时长相等只是巧合，不许互相推导 */
        if(a.redT>0)a.redT=Math.max(0,a.redT-dt);
        if(a.rushT>0)a.rushT=Math.max(0,a.rushT-dt);
        if(a.stunT>0)a.stunT=Math.max(0,a.stunT-dt);
        /* 钻管道冷却：玩家与 AI 同一个计时（以前只有 AI 那条路递减，玩家根本不进这里） */
        if(a._pipeCD>0)a._pipeCD=Math.max(0,a._pipeCD-dt);
        if(!a.act)continue;
        a.act.t+=dt;
        if(a.act.t>=a.act.dur)a.act=null;
      }
    }
    function actOffset(a){
      if(!a.act)return null;
      const p=Math.min(1,a.act.t/a.act.dur), k=Math.sin(Math.min(1,p/0.6)*Math.PI);
      if(a.act.kind==='stab')
        return {x:Math.cos(a.act.ang)*a.act.lunge*k*VIEW.s,y:Math.sin(a.act.ang)*a.act.lunge*k*VIEW.s};
      if(a.act.kind==='shoot')
        return {x:-Math.cos(a.act.ang)*0.16*k*VIEW.s,y:-Math.sin(a.act.ang)*0.16*k*VIEW.s};
      if(a.act.kind==='hurt')
        return {x:Math.cos(a.act.ang)*0.20*k*VIEW.s,y:Math.sin(a.act.ang)*0.20*k*VIEW.s};
      if(a.act.kind==='pickup') return {x:0,y:0.10*k*VIEW.s};
      if(a.act.kind==='heal') return {x:0,y:0.06*k*VIEW.s};
      return null;
    }

    /* 开夜封锁剩余秒数：>0 时任何阵营都不能出刀（当前 0，规则已移除） */
    function knifeLockLeft(){
      if(!G)return 0;
      /* 暂停（含门禁/DEV 的冻结态）时不计：冻结的是世界，不是规则。
         真实对局里玩家不可能在暂停中出刀，所以这条豁免不会漏掉任何操作。 */
      if(G.paused)return 0;
      /* 调试/门禁显式解除封锁（`G._noKnifeLock`）：门禁里"刀击链路"那组用例
         与"开夜禁刀"那组用例要能同时存在 —— 后者专门验封锁，前者验刀击本身。 */
      if(G._noKnifeLock)return 0;
      const lock=(SKSanity.KNIFE&&SKSanity.KNIFE.lockAtStart)||0;
      if(!lock)return 0;
      return Math.max(0,lock-evNow());
    }
    function knife(killer,victim){
      if(!killer||killer.knife<1)return [];
      if(!victim||!victim.alive||victim.downed)return [];
      const ang=Math.atan2(victim.y-killer.y,victim.x-killer.x);
      killer._aimAng=ang;
      /* 范围伤害（含友伤）：前方 REACH.knife 半圆（±90° + LOS）内所有存活未倒地目标一并击倒 */
      const victims=[victim];
      for(const a of G.agents){
        if(a===killer||a===victim||!a.alive||a.downed)continue;
        if(inKnifeArc(killer,a.x,a.y,SKSanity.REACH.knife))victims.push(a);
      }
      /* 危险行为先记账：即使 DEV 免伤/未造成濒死，保安也能据此反制 */
      G.pendingCrime=killer.i;
      /* 先扣刀再进 DEV 免伤分支：否则 AI 对 DEV 玩家能无限连刀，刀数永远用不掉
         （与「DEV 免伤也必须先扣子弹」同一口径） */
      killer.knife--;
      if(G.simMode&&G.simStats)G.simStats.knives++;
      /* 1.5 秒红身：让目击者一眼认出刚出刀的人（纯表现，不改变判定） */
      killer.redT=SKSanity.RED_BODY.dur;
      /* 2026-11-21 用户裁定「异形会自保」：出刀后 2.2 秒内优先脱离案发点，
         不在尸体旁边逗留（红身只有 0.5s，但站着不动照样被看清） */
      if(killer&&killer.alien){killer._escapeT=2.2;killer._escapeFrom={x:victim.x,y:victim.y};}
      setAct(killer,'stab',0.34,{ang,lunge:0.46});
      /* 只响一次：单层刀风，不再叠 70ms 后的血肉声。
         玩家音频与 AI 听觉共用 SOUND.knifeR：超出半径不播，避免全图都听到"死亡"。 */
      if(playerAudibleAt(victim.x,victim.y,SKSanity.SOUND.knifeR,true)){
        SND.knife(SND.volAt(victim.x,victim.y,0.95));
        SND.flesh(0.34);
      }
      hear(victim.x,victim.y,'knife',1.0);
      let anyHit=false;
      for(const v of victims){
        const vang=Math.atan2(v.y-killer.y,v.x-killer.x);
        if(!G.spectMode&&v===G.me&&G.dev){
          G.fx.push({type:'shield',x:v.x,y:v.y,t:0.6,dur:0.6});
          if(killer&&killer!==G.me){killer.target=null;killer.path=null;}
          toast('DEV 无敌：这一刀没有生效');
          continue;
        }
        anyHit=true;
        /* 被击倒者的第一视角（2026-11-18 用户裁定 #9：**只在视野内**认得出攻击者，
           沿用 20% 认错率）。三个顺序约束，缺一个这条机制就是死的：
           ① 必须在 `setAct(v,'hurt',...)` **之前**；
           ② 必须在 `v.downed=true` **之前**；
           ③ 只写 mind（sus / grudge），不写 known。
           玩家受害者跳过：玩家的判断由玩家自己看屏幕决定，不由引擎代写认知。 */
        if(!v.alien&&v!==G.me){
          const vx=v.x,vy=v.y;
          if(observerVisionAt(vx,vy,v.alien,agentAimAng(v),killer.x,killer.y)){
            const mis=misIdPick(v,killer.i,vx,vy,6);
            const kidx=mis?mis.i:killer.i;
            const evSelf={kind:'saw_knife_self',x:+killer.x.toFixed(1),y:+killer.y.toFixed(1),
              room:roomIdAt(killer.x,killer.y),subj:kidx,conf:1,src:'sight'};
            susAdd(v,kidx,0.01,'saw_knife_self',evSelf);
            trustCert(v,kidx,true);
            emoAdd(v,kidx,SKSanity.EMOTE.knifeVictim,'knife_victim');
            evPush(v,evSelf);
          }
        }else if(v.alien&&killer.alien&&v!==G.me){
          /* 异形被砍时若在视野内看清凶手，也立即认出对方同族身份（单人局防误杀） */
          if(observerVisionAt(v.x,v.y,v.alien,agentAimAng(v),killer.x,killer.y)){
            markMate(v,killer,'saw_knife_self');
          }
        }
        setAct(v,'hurt',0.6,{ang:vang});
        G.fx.push({type:'slash',x:v.x,y:v.y,t:0.5,dur:0.5,ang:vang,by:killer.i});
        G.fx.push({type:'blood',x:v.x,y:v.y,t:0.9,dur:0.9,ang:vang});
        v.downed=true; v.downAt=G.t;
        v.downSeq=(v.downSeq||0)+1;   /* 倒下事件编号：报告一次性按它绑定 */
        v.downX=v.x; v.downY=v.y; v.killedBy=killer.i;
        /* 异形记下自己刚放倒谁：稍后可能绕一圈再回来"发现"尸体，用会议拖时间 */
        if(killer.alien){killer._killBody=v.i;killer._killAt=evNow();killer._killDecided=false;}
        v.woundCause='knife'; v.downRoom=roomIdAt(v.x,v.y);
        v.searched=false;
        logEvent('knife',{actor:killer.i,victim:v.i,room:v.downRoom,
          x:+v.x.toFixed(1),y:+v.y.toFixed(1)});
        v.path=null; v.doing=0; v._doing=null; v._fix=null; v._rv=null; v._sv=null; v._taskPt=null;
        witnessAlienAction(killer,v.x,v.y,6,'knife',v);
        aiHear('knife',v.x,v.y,SKSanity.SOUND.knifeR,{actor:killer,victim:v});
        screamFor(v);
        if(!G.spectMode&&v===G.me){
          if(global.SKMiniGame&&SKMiniGame.isOpen())SKMiniGame.close();
          v._mg=false;
          closeWheel(true);closeCams(true);closePipePick(true);closeSabPick(true);G.sabTarget=null;toast('你被出刀击倒，濒死');
        }
      }
      /* 放倒即触发逃逸加速（只给异形；拖尸中不生效，见 moveSpeed 的次序） */
      if(anyHit)killRushStart(killer);
      return victims;
    }

    /* 被击倒者喊叫：公开 CC0 人声采样。
       可听半径 = SKSanity.SOUND.screamR（15 格，玩家与 AI 同一判据）。
       以前玩家侧只挡到 16 格、且 volAt 有 0.14 底音，等于"隔半张图也听得见"；
       现在超出 15 格直接不播，AI 听觉也读同一个数。 */
    function screamFor(victim){
      if(!victim)return;
      const R=SKSanity.SOUND.screamR;
      aiHear('scream',victim.x,victim.y,R,{victim:victim});
      if(victim!==G.me&&!playerAudibleAt(victim.x,victim.y,R))return;
      SND.scream(victim===G.me?0.60:SND.volAt(victim.x,victim.y,0.85));
    }

    /* 行为推断入口见上方 noticeAction：视觉写入证据 + 嫌疑分，此处不再重复实现 */

    /* 真正的死亡：尸体坐标与幽灵坐标分离 —— 幽灵可以飘走，尸体留在现场。
       驱逐没有尸体（bodyGone），刀伤/枪伤/失血都留尸。 */
    function die(a,cause,by){
      if(!a||!a.alive)return false;
      if(!G.spectMode&&a===G.me&&G.dev){toast('DEV 无敌：死亡被拦截');return false;}
      a.alive=false; a.ghost=true;
      a.deathCause=cause||'knife';
      a.deathAt=G.t;
      a.deathRoom=roomIdAt(a.x,a.y);
      a.deathX=a.x; a.deathY=a.y;
      a.killedBy=(by==null?null:by);
      a.bodyGone=(cause==='vote');
      a.bodyX=a.bodyGone?null:a.x;
      a.bodyY=a.bodyGone?null:a.y;
      a.bodyMoved=false;
      a.searched=false;
      a.downed=false; a.detained=false;
      logEvent('kill',{actor:by==null?null:by,victim:a.i,
        method:cause==='bled'?(a.woundCause||'bled'):cause,
        room:a.deathRoom,x:a.deathX,y:a.deathY,gone:!!a.bodyGone});
      /* 每次死亡重算先验（2026-11-21 用户裁定「每次死亡发生之后重算」） */
      recomputePrior();
      if(a.alien&&!G.meet&&G.t>0)checkAlienEvolution(false);
      a.path=null; a.doing=0; a._doing=null; a._fix=null; a._rv=null; a._sv=null; a._taskPt=null;
      a.redT=0; a.stunT=0;
      if(a.drag!=null)releaseDragBy(a,true);
      const dg=draggerOf(a);
      if(dg)releaseDragBy(dg,true);
      if(!G.spectMode&&a===G.me){
        G.drag=null;
        document.getElementById('dragtag').classList.add('hide');
        if(global.SKMiniGame&&SKMiniGame.isOpen())SKMiniGame.close();
        a._mg=false;
        closeBodyCard();
        closeCams(true);closePipePick(true);closeSabPick(true);
        closeWheel(true);
        G.sabTarget=null;
        G.fogOn=false;
        toast('你已阵亡 · 幽灵态：穿墙、全视，仍可做自己剩下的任务（1.6×，最多 2 分）');
        SND.ghost();
        syncHud();
      }
      return true;
    }
    
    /* 领申请单（2026-11-10 交互即领）：玩家与 AI 共用同一入口，无站桩、无小游戏。 */
    function grantQual(a){
      const actor=!G.spectMode&&a===G.me;
      if(!G.designMode&&(a.qual||0)>=2){if(actor)toast('身上最多携带 2 张物资申请单，请先使用后再领取');return;}
      if(a.qualPending>0||G.designMode){
        if(!G.designMode)a.qualPending--;
        a.qual=Math.min(2,(a.qual||0)+1);
        G.fx.push({type:'qual',x:a.x,y:a.y,t:1.5,dur:1.5,n:a.qual});
        logEvent('qual',{actor:a.i,room:roomIdAt(a.x,a.y),
          x:+a.x.toFixed(1),y:+a.y.toFixed(1),n:a.qual});
        if(actor){toast('领取物资申请单 ×1 · 可去军械库/医疗间补给点兑换');pulseHud('ql');SND.qual();}
      }else if(actor)toast('没有待领取的物资申请单');
    }
    function finishDoing(a){
      const actor=!G.spectMode&&a===G.me;
      if(a._doing==='search'){
        const b=a._sv!=null?G.agents[a._sv]:null;
        a._doing=null; a._sv=null;
        G.fx.push({type:'search',x:a.x,y:a.y,t:0.5,dur:0.5});
        if(b){
          const first=!b.searched;
          b.searched=true;
          /* 玩家查看只取证；AI 仍按原逻辑自动取走自己缺的物资 */
          const got=actor?{bullet:0,medkit:0,qual:0,none:true}:lootBody(a,b);
          const bp=bodyPos(b);
          logEvent('search',{actor:a.i,victim:b.i,first:first,none:!!got.none,
            room:bp?roomIdAt(bp[0],bp[1]):null,
            x:bp?+bp[0].toFixed(1):null,y:bp?+bp[1].toFixed(1):null,
            bullet:got.bullet,medkit:got.medkit,qual:got.qual});
          if(first){
            const bi=bodyInfo(b);
            evPush(a,{kind:'search_result',x:bi.pos?bi.pos[0]:b.x,y:bi.pos?bi.pos[1]:b.y,
              room:bi.room,victim:b.i,conf:1,src:'search',body:bi});
            if(bi.moved)evPush(a,{kind:'search_body_moved',x:bi.pos?bi.pos[0]:b.x,
              y:bi.pos?bi.pos[1]:b.y,room:bi.room,victim:b.i,conf:1,src:'search',body:bi});
          }
          if(actor){openBodyCard(b);toast('已记录'+(b.alive?'伤情':'尸检')+'；需要物资请点「拿取物资」');}
          if(G.simMode&&G.simStats){
            G.simStats.searches++;
            if(a.alien)G.simStats.alienLoots++; else G.simStats.humanLoots++;
            if(!got.none){
              G.simStats.loots++;
              G.simStats.bulletsLooted+=got.bullet;
              G.simStats.medkitsLooted+=got.medkit;
              G.simStats.qualsLooted+=got.qual;
            }
          }
        }
        return;
      }
      if(a._doing==='med'){
        a._doing=null;
        if(!G.designMode&&supplyCoolLeft('med')>0){if(actor)toast('医疗包补给箱冷却中，还需 '+Math.ceil(supplyCoolLeft('med'))+' 秒');return;}
        if((a.qual||0)<1&&!G.designMode){if(actor)toast('没有物资申请单：先回中央会议室圆桌领取');return;}
        a.medkit=1;if(!G.designMode){a.qual--;if(G.supplyCD)G.supplyCD.med=SKSanity.SUPPLY.cooldown;}
        G.fx.push({type:'pickup',x:a.x,y:a.y,t:1.2,dur:1.2,item:'med'});
        setAct(a,'pickup',0.55,{});
        logEvent('supply',{actor:a.i,item:'medkit',room:roomIdAt(a.x,a.y),
          x:+a.x.toFixed(1),y:+a.y.toFixed(1),qual:a.qual});
        credBroadcast(a,'lootMedkit',a.x,a.y);   /* 目击拿医疗包：只能救人 → +10 信任 */
        if(actor){toast('拿到医疗包 · 物资申请单 -1');pulseHud('md');pulseHud('ql');SND.med();}
        return;
      }
      if(a._doing==='ammo'){
        a._doing=null;
        if(!G.designMode&&supplyCoolLeft('ammo')>0){if(actor)toast('子弹箱冷却中，还需 '+Math.ceil(supplyCoolLeft('ammo'))+' 秒');return;}
        if((a.qual||0)<1&&!G.designMode){if(actor)toast('没有物资申请单：先回中央会议室圆桌领取');return;}
        a.bullet=1;if(!G.designMode){a.qual--;if(G.supplyCD)G.supplyCD.ammo=SKSanity.SUPPLY.cooldown;}
        G.fx.push({type:'pickup',x:a.x,y:a.y,t:1.2,dur:1.2,item:'ammo'});
        setAct(a,'pickup',0.55,{});
        logEvent('supply',{actor:a.i,item:'bullet',room:roomIdAt(a.x,a.y),
          x:+a.x.toFixed(1),y:+a.y.toFixed(1),qual:a.qual});
        /* 目击拿子弹：小幅恐慌 E + 信任 −25（子弹能杀人，2026-11-21 用户裁定） */
        credBroadcast(a,'lootBullet',a.x,a.y);
        if(actor){toast('拿到子弹 · 物资申请单 -1');pulseHud('bl');pulseHud('ql');SND.ammo();}
        return;
      }
      if(a._doing==='qual'){
        a._doing=null;
        grantQual(a);
        return;
      }
      if(a._doing==='breaker'){
        a._doing=null;a._lightGo=false;a._breakerGoal=null;
        /* 当众合闸是异形的一次**演出**（risk 已吃 breakerLoss 战略损失）：
           演完进冷却、进统计。拉闸断电不走这里 —— 它不是伪装，_fakeKind 为空。 */
        if(a.alien&&a._fakeKind==='breaker'){
          a._fakeKind=null;a._fakeCD=SKSanity.DISGUISE.cooldown;
          if(G.simMode&&G.simStats)G.simStats.fakeBreaker++;
        }
        /* AI 拉闸以前只播特效不改状态（if(actor) 挡住了），这里统一走真断电 */
        pullBreaker(a);
        return;
      }
      if(a._doing==='fix'){finishFix(a);return;}
      if(a._doing==='revive'){
        const v=a._rv;
        /* 被拖拽期间救不活（2026-11-20 用户裁定）：这里不再撒手拖拽再强行救起，
           拖拽中直接作废本次读条 —— 与 startDrag 的中断循环同一条，两侧一致。 */
        if(v&&v.downed&&v.alive&&v.draggedBy==null){
          v.downed=false;v.downAt=0;v.killedBy=null;a.medkit=0;
          v.woundCause=null;v.downRoom=null;v.downX=null;v.downY=null;v.searched=false;
          G.fx.push({type:'heal',x:v.x,y:v.y,t:1.2,dur:1.2});
          setAct(v,'heal',0.7,{ang:0});
          credBroadcast(a,'revive',v.x,v.y);
          /* 2026-11-18 感恩（个人专属）：救过命这件事记在**被救者自己**心里，
             走 mind.trust，不动 cred 那条全场统一轴（用户裁定要分开）。
             玩家救人也走这一条 —— 两侧同一处代码，没有 AI 特权。 */
          {
            const g2=SKSanity.GRATITUDE.revive;
            emoAdd(v,a.i,g2.e,'gratitude');          /* 被救者的高额信任情绪 */
            credAdd(v,a.i,g2.t,'reviveSelf');        /* 额外 +30 信任分（T） */
          }
          logEvent('revive',{actor:a.i,victim:v.i,method:'medkit',room:roomIdAt(v.x,v.y),
            x:+v.x.toFixed(1),y:+v.y.toFixed(1)});
          if(actor){toast('救起 '+v.name);SND.revive();}
          if(G.stats)G.stats.medkitRevives=(G.stats.medkitRevives||0)+1;
          if(G.simMode&&G.simStats){G.simStats.revives++;G.simStats.medkitRevives++;}
        }
        a._rv=null;a._doing=null;return;
      }
      /* 任务结算：按实际修的点记账；乱序完成时把该点交换到 tIdx 槽位，
         保持 [0,tIdx) 全是已完成任务，tIdx 仍是“已完成数量”。
         守卫：只有 _doing === 'task' 才允许走任务结算，防止故障被队友修好/超时或其它状态残留时误记正式任务。 */
      if(a._doing!=='task'){a._doing=null;a.doing=0;a._taskPt=null;return;}
      a._doing=null;a.doing=0;
      /* 设计者模式：任务点只验交互与小游戏，不动 a.tasks / tIdx / G.prog。
         设计者派发的 4 个任务里通常没有他刚修的那个点，走下面的交换记账
         会把另一个任务记成完成，还会把维修进度推到 WIN_PTS 触发结算。 */
      if(G.designMode){
        const dp=a._taskPt!=null?M.points[a._taskPt]:null;
        a._taskPt=null;
        if(actor)toast('设计者模式 · 「'+(dp?dp.label:'任务点')+'」验收完成 · 不计维修进度');
        return;
      }
      const picked=a._taskPt;
      a._taskPt=null;
      let k=a.tIdx;
      if(picked!=null){
        const pi=a.tasks.indexOf(picked);
        if(pi>=a.tIdx)k=pi;
      }
      if(k!==a.tIdx){
        const cur=a.tasks[a.tIdx];
        a.tasks[a.tIdx]=a.tasks[k];
        a.tasks[k]=cur;
      }
      const p=M.points[a.tasks[a.tIdx]];
      if(!p)return;
      const v=ghostTaskPts(p);
      if(a.ghost&&(a.ghostPts||0)+v>GHOST_TASK_CAP){
        a._doing=null;a.doing=0;
        if(actor)toast('幽灵最多维修 '+GHOST_TASK_CAP+' 分的剩余任务');
        return;
      }
      /* ghostPts 是硬上限：AI 幽灵也走同一结算，玩家与 AI 都最多 GHOST_TASK_CAP 分。 */
      G.prog=Math.min(WIN_PTS,G.prog+v);
      if(a.ghost)a.ghostPts=(a.ghostPts||0)+v;
      a.tIdx++; a.progress+=v;
      if(G.pointDone)G.pointDone[a.tasks[a.tIdx-1]]=(G.playT||0);
      if(G.simMode&&G.simStats&&a.alien)G.simStats.alienTasks++;
      /* 分任务点计数：只看不干预，用来定位「某些任务点几乎没人完成」 */
      if(G.simMode&&G.simStats&&G.simStats.tasksByPoint)
        G.simStats.tasksByPoint[p.label]=(G.simStats.tasksByPoint[p.label]||0)+1;
      /* 局内统计：幽灵完成的维修任务（报告里要单列「幽灵修了几个任务」） */
      if(a.ghost&&G.stats)G.stats.ghostTasks=(G.stats.ghostTasks||0)+1;
      if(G.simMode&&G.simStats&&a.ghost)G.simStats.ghostTasks++;
      a.nTask=p.label; a.nTaskRoom=roomIdAt(a.x,a.y);
      logEvent('task',{actor:a.i,label:p.label,room:p.room,pts:v,ghost:!!a.ghost,
        x:+a.x.toFixed(1),y:+a.y.toFixed(1),prog:G.prog});
      /* 正向信任：看见别人把任务做完 → +cred（幽灵做的不算，看不见实体） */
      if(!a.ghost)credBroadcast(a,'taskDone',a.x,a.y);
      let gotQual=false;
      if(a.progress>=3&&!a._q3){a._q3=true;a.qualPending=(a.qualPending||0)+1;gotQual=true;}
      if(a.progress>=5&&!a._q5){a._q5=true;a.qualPending=(a.qualPending||0)+1;gotQual=true;}
      G.fx.push({type:'done',x:a.x,y:a.y,t:1.0,dur:1.0});
      G.fx.push({type:'spark',x:p.x,y:p.y,t:0.8,dur:0.8});
      if(gotQual&&actor){pulseHud('qp');SND.qual();}
      /* 修好配电室的「电路维修」⇒ 全船照明恢复（拉闸仍可再次断电，但再拉要 6 秒） */
      let powerFix=false;
      if(p.room==='power'&&p.label==='电路维修'&&!G.powerFixed){
        G.powerFixed=true; powerFix=true;
        if(G.lightState!==2){G.lightState=1;refreshLight();}
        const br=M.facility.find(f=>f.kind==='breaker');
        if(br)G.fx.push({type:'power',x:br.x,y:br.y,t:1.2,dur:1.2,on:true});
        hear(p.x,p.y,'power',0.9);
      }
      if(actor){
        SND.done();
        toast('完成「'+p.label+'」 +'+v+' 分'+(powerFix?' · 全船照明恢复':'')
          +(gotQual?' · 获得 1 份待领取物资申请单（回中央会议室圆桌领取）':''));
        if(powerFix)pulseHud('pwr');
      }
      /* AI 完成任务后不再原地休息，直接接下一个任务/维修。 */
    }
    
    function dawn(){
      logEvent('dawn',{prog:G.prog});
      for(const a of G.agents) if(a.downed&&a.alive) die(a,'bled',a.killedBy);
      G.t=0;
      /* 天亮：没修完的故障随夜结束一起消失，不扣分（规则只罚“夜里超时”） */
      G.dmg=[];
      G.sabTarget=null;
      if(checkWin())return;
      /* 白天会议**要回会议室**（2026-11-02 用户裁定）：
         与夜里的远程会议相反 —— 全员被刷新到中央会议室，并且**打断此前的一切任务流程**
         （清路径 / 站桩进度 / 动作 / 拖拽）。这是刻意的节奏差：夜里开会不打断，
         白天开会意味着"这一夜到此为止"。 */
      const br=M.rooms.find(r=>r.id==='bridge');
      if(br){
        for(const a of G.agents){
          if(!a.alive)continue;
          const p=randIn(br);
          a.x=p[0];a.y=p[1];
          a.path=null;a.moving=false;a.doing=0;a._doing=null;a.act=null;
          a.drag=null;a.draggedBy=null;a.target=null;
        }
        G.drag=null;
      }
      if(G.terminator){
        startNight(true);
        return;
      }
      openMeeting('day',null,null);
    }
    
    /* ---- 两台机器人（已拆至 js/engine/bots.js#SKBots） ---- */
    let _bots = null;
    function _ensureBots(){
      if(_bots)return _bots;
      _bots=SKBots.create({
        getG:()=>G,getSND:()=>SND,M,free,nearestFree,astar,losWalls,
        inMedRoom,roomIdAt,draggerOf,releaseDragBy,setAct,hear,aiHear,
        witnessDetain,logEvent,toast,SKSanity,emoAdd,credAdd
      });
      return _bots;
    }
    function secArcOk(sec,x,y){ return _ensureBots().secArcOk(sec,x,y); }
    function secbotWouldSee(x,y){ return _ensureBots().secbotWouldSee(x,y); }
    function resetBots(){ return _ensureBots().resetBots(); }
    function botPos(kind){ return _ensureBots().botPos(kind); }
    function secJail(){ return _ensureBots().secJail(); }
    function medbotHome(){ return _ensureBots().medbotHome(); }
    function botTick(dt){ return _ensureBots().botTick(dt); }

    function checkWin(){
      if(G.over)return true;
      const humans=G.agents.filter(a=>!a.alien&&a.alive).length;
      const aliens=G.agents.filter(a=>a.alien&&a.alive).length;
      if(G.prog>=WIN_PTS){ endGame(true,'维修 '+WIN_PTS+' 分达成'); return true; }
      if(aliens===0){ endGame(true,'内鬼全部出局'); return true; }
      if(humans===0){ endGame(false,'人类全灭'); return true; }
      return false;
    }
    /* 结算页的两块表（2026-11-03，调研报告 P1-4）：这局本来就把 500+ 条事件都记下来了，
       以前结束时只给一行字，玩家"谁是谁、谁投了谁、谁被谁放倒"全看不见，
       只能点进复盘——多数人不会点。这里只读 `G.agents` 与 `G.events` 渲染，不参与判定。 */
    function renderEndTables(){
      const ids=document.getElementById('e-ids'), vs=document.getElementById('e-votes');
      /* 击杀方式必须分枪/刀（2026-11-20 用户裁定）：枪致死写「枪击」，
         刀致死才写「刀击」。`bled` 是濒死拖到天亮失血，伤口来源仍记在 woundCause 上，
         所以它也要按那一刀/那一枪来写，不能笼统说成「死亡」。 */
      const killWord=a=>{
        const m=a.deathCause==='shot'?'shot':a.deathCause==='knife'?'knife':
          (a.deathCause==='bled'?(a.woundCause==='shot'?'shot':'knife'):null);
        return m==='shot'?'枪击':(m==='knife'?'刀击':null);
      };
      const fateOf=a=>a.alive?(a.downed?'濒死存活':'存活')
        :(a.deathCause==='vote'?'被驱逐':(a.deathCause==='knife'?'被刀击':
          (a.deathCause==='shot'?'被枪击':(a.deathCause==='bled'?'天亮失血':'死亡'))));
      const add=(host,cls,text)=>{
        const s=document.createElement('span');s.className='chip '+cls;s.textContent=text;
        host.appendChild(s);return s;};
      if(ids){
        ids.innerHTML='';
        for(const a of G.agents){
          const row=document.createElement('div');row.className='row';
          add(row,a.alien?'ali':'hum',tagName(a)+(a.alien?' · 内鬼':' · 人类'));
          add(row,'dead',fateOf(a)+(a.deathRoom?(' · '+(roomNameById(a.deathRoom)||a.deathRoom)):''));
          if(a.killedBy!=null&&a.killedBy!==a.i){
            const kw=killWord(a);
            add(row,'ex',(kw||'击杀')+' · '+tagName(G.agents[a.killedBy]));
          }
          ids.appendChild(row);
        }
      }
      if(vs){
        vs.innerHTML='';
        const bySeq={};
        for(const e of G.events){
          if(e.kind!=='vote')continue;
          const s=(e.seq||('夜'+e.night));
          (bySeq[s]||(bySeq[s]=[])).push(e);
        }
        const keys=Object.keys(bySeq);
        if(!keys.length)add(vs,'dead','本局没有进行到投票');
        for(const kk of keys){
          const row=document.createElement('div');row.className='row mtg';
          add(row,'','第 '+(bySeq[kk][0].night)+' 夜 · 第 '+kk+' 场投票');
          for(const e of bySeq[kk]){
            const who=G.agents[e.actor], tgt=e.target>=0?G.agents[e.target]:null;
            add(row,'',(who?who.name:'?')+(tgt?(' → '+tgt.name):' → 弃权'));
          }
          vs.appendChild(row);
        }
      }
    }
    function endGame(win,why){
      if(G.over)return;
      G.over=true; G.overWhy=why; G.overWin=!!win;
      logEvent('game_end',{win:!!win,why:why,prog:G.prog,nights:G.night});
      stopChatter();
      releaseAllDrags(true);
      if(global.SKMiniGame&&SKMiniGame.isOpen())SKMiniGame.close();
      if(G.me)G.me._mg=false;
      closeBodyCard();
      closeCams(true);closePipePick(true);
      closeWheel(true);
      if(G.meet){ clearMeetingTimer(); G.meet=null; document.getElementById('meet').classList.add('hide'); }
      document.getElementById('end').classList.remove('hide');
      /* 结算卡同样要给 DEV / 旁观横栏让位，否则标题被压住（T3） */
      if(!G.simMode)syncDevUi();
      document.getElementById('e-t').textContent=win?'人类胜利':'内鬼胜利';
      /* 结算摘要带上本局新增的三项统计（2026-10-31）：医疗无人机救治 / 幽灵任务 / 幽灵修故障 */
      const st=G.stats||{};
      document.getElementById('e-s').textContent=why+' · 维修 '+G.prog+'/'+WIN_PTS+' · 第 '+G.night+' 夜'
        +' · 无人机救治 '+(st.medbotRevives||0)+' 次 · 幽灵任务 '+(st.ghostTasks||0)+' 个'
        +' · 幽灵修故障 '+(st.ghostFixes||0)+' 次';
      if(win)SND.win(); else SND.lose();
      if(!G.simMode)renderEndTables();          /* 批量模拟不碰 DOM */
    }
    
    /* ---------------- 报告 / 会议 / 投票（已拆至 js/engine/meeting.js#SKMeeting） ---------------- */
    const MEET_TPL_KINDS = global.SKMeeting.MEET_TPL_KINDS;
    let _meeting = null;
    function _ensureMeeting(){
      if(_meeting)return _meeting;
      _meeting=SKMeeting.create({
        getG:()=>G,getSND:()=>SND,getDead:()=>DEAD,getSimRun:()=>SIM_RUN,
        getTestRun:()=>TEST_RUN,getSimNoDiscuss:()=>SIM_NO_DISCUSS,getGameMode:()=>GAME_MODE,
        inCorr, roomAt, roomIdAt, roomNameById, roomIdOfName, pipeRoomIds, isPipeRoom, syncDevUi, refreshLight, closePipePick, closeCams, clearSabSpots, closeSabPick, logEvent, reliaOf, reliaAdd, emoAdd, grudgeAdd, trustAdd, emotionOf, isPatron, credAdd, topCred, obeyTrustMul, warmAdd, settleAccountability, recordClaim, defenseNote, witnessCtxMul, isMate, isMyMate, bodyWound, bodyInfo, releaseAllDrags, die, dawn, resetBots, checkWin, closeWheel, closeBodyCard, toast, banner, topSus, crimeWindow, bodyReported, markBodyReported, nightMeetLeft, tagName, tagByName, nameOf, whenWord, parseSpeech, stopChatter, meetLater, sayStreakOK, evNow, credOf, mindReset, evPush, trustCert, susCut, checkAlibi, claimWindow, susAddContradiction, oldQuantifierWouldFire, bestSusTarget, almostFoeOf, almostFriendOf, bestAlmostTarget, bestKnownTarget, evidenceReason, pubSolidAccusers, statementRelation, hypothesisSpread, IDENTITY, hostileProb, trustScore, hostileTo, beliefOf, susAdd, bodyPos, NIGHT, MOVE_SPEED, EV_W, envEstimate, M, SKSanity, SKTrait, SKT2AI, SKLines, SKClock, MEDBOT_CHARGES, trustMirror
      });
      return _meeting;
    }
    function clearMeetingTimer(){ if(_meeting)_meeting.clearTimer(); }
    function tryReport(){ return _ensureMeeting().tryReport(); }
    function say(who,text,kind){ return _ensureMeeting().say(who,text,kind); }
    function clearNewLines(){ return _ensureMeeting().clearNewLines(); }
    function recomputePrior(){ return _ensureMeeting().recomputePrior(); }
    function alibiOf(a){ return _ensureMeeting().alibiOf(a); }
    function victimInfo(victim){ return _ensureMeeting().victimInfo(victim); }
    function fillTpl(a,s,ctx){ return _ensureMeeting().fillTpl(a,s,ctx); }
    function pickLine(a,arr,salt,ctx){ return _ensureMeeting().pickLine(a,arr,salt,ctx); }
    function pushEndorse(push,cands){ return _ensureMeeting().pushEndorse(push,cands); }
    function alibiLine(a,m){ return _ensureMeeting().alibiLine(a,m); }
    function accuseLine(a,m){ return _ensureMeeting().accuseLine(a,m); }
    function decideHumanDefend(cands){ return _ensureMeeting().decideHumanDefend(cands); }
    function startChatter(m){ return _ensureMeeting().startChatter(m); }
    function playerTalk(text){ return _ensureMeeting().playerTalk(text); }
    function meetTemplateText(kind,t,roomId,when){ return _ensureMeeting().meetTemplateText(kind,t,roomId,when); }
    function sendPlayerSpeech(text){ return _ensureMeeting().sendPlayerSpeech(text); }
    function openMeeting(kind,reporter,victim){ return _ensureMeeting().openMeeting(kind,reporter,victim); }
    function targetDistMul(h){ return _ensureMeeting().targetDistMul(h); }
    function hostileWeight(a,t){ return _ensureMeeting().hostileWeight(a,t); }
    function alienSocialPick(a,pool,heatMap){ return _ensureMeeting().alienSocialPick(a,pool,heatMap); }
    function alienFrameTarget(liar,targets){ return _ensureMeeting().alienFrameTarget(liar,targets); }
    function voteLean(a){ return _ensureMeeting().voteLean(a); }
    function deliverTestimony(m,byId){ return _ensureMeeting().deliverTestimony(m,byId); }
    function startVote(){ return _ensureMeeting().startVote(); }
    function voteThreshold(){ return _ensureMeeting().voteThreshold(); }
    function closeVote(){ return _ensureMeeting().closeVote(); }
    function finishMeeting(){ return _ensureMeeting().finishMeeting(); }
    function checkTerminator(){ return _ensureMeeting().checkTerminator(); }
    function lastAlienEvo(a){ return _ensureMeeting().lastAlienEvo(a); }
    function checkAlienEvolution(onNightStart){ return _ensureMeeting().checkAlienEvolution(onNightStart); }
    function startNight(inc){ return _ensureMeeting().startNight(inc); }
    /* ---------------- 玩家输入 ---------------- */
    const cv=document.getElementById('cv'),ctx=cv.getContext('2d');
    let VIEW={s:10,ox:0,oy:0},dpr=window.devicePixelRatio||1;
    /* 视窗：跟随模式只给 23 格宽，全图模式才铺满。
       这是「保留相机跟随」这条要求的落点 —— 平时看不到全船，只锁自己周围一小块。

       **这里的数字就是"相机高度"**：引擎是纯 2D 正交投影（SX=x*s+ox，没有真正的
       高度轴），所以"镜头高低"等价于"一屏看多少格"——数字越小 = 镜头越近 =
       人和家具越大。2026-11-01 从 30 降到 23：用户反馈默认视角太高、地图和人
       都显小。想再调就只改这一个数，别去动 SX/SY。 */
    /* 屏幕可视宽度（格）：19 → **21**（2026-11-02 用户体验调研：视野偏窄，
       98×94 的船上只能看到 1/5 宽，找路全靠小地图）。只放宽镜头，不改视野规则。 */
    const VIEW_TILES=21;
    function resize(){
      cv.width=innerWidth*dpr;cv.height=innerHeight*dpr;
      ctx.setTransform(dpr,0,0,dpr,0,0);
      let s;
      if(G&&G.camMode==='map') s=Math.min(innerWidth/M.bounds.w,innerHeight/M.bounds.h)*0.94;
      else s=innerWidth/VIEW_TILES;
      VIEW.s=s;VIEW.ox=0;VIEW.oy=0;
      if(_render)_render.resetPat();
      updateCamera();
    }
    function updateCamera(){
      const s=VIEW.s, mw=M.bounds.w*s, mh=M.bounds.h*s;
      if(G&&G.camMode==='map'){
        VIEW.ox=(innerWidth-mw)/2; VIEW.oy=(innerHeight-mh)/2; return;
      }
      const f=G?camFocus():{x:0,y:0};
      let ox=innerWidth/2-f.x*s, oy=innerHeight/2-f.y*s;
      ox = mw>innerWidth ? Math.min(0,Math.max(innerWidth-mw,ox)) : (innerWidth-mw)/2;
      oy = mh>innerHeight ? Math.min(0,Math.max(innerHeight-mh,oy)) : (innerHeight-mh)/2;
      VIEW.ox=ox; VIEW.oy=oy;
    }
    addEventListener('resize',()=>{if(DEAD||!G)return;resize();if(_render)_render.resetPat();});
    const SX=x=>x*VIEW.s+VIEW.ox, SY=y=>y*VIEW.s+VIEW.oy;
    const WX=x=>(x-VIEW.ox)/VIEW.s, WY=y=>(y-VIEW.oy)/VIEW.s;
    
    /* 点地面移动（2026-11-02 抽出成函数，供 DOM 事件与门禁钩子共用）：
       走不通时给出**禁止符号 + 文字提示** —— 以前是"点了完全没反应"，新手会以为卡了。 */
    function clickAt(tx,ty){
      const me=G.me;
      if(G.spectMode&&G.spect){        // 旁观者：直线穿墙飞过去
        G.spect.path=[[tx,ty]];
      }else if(!me.alive||G.designMode){ // 幽灵与设计者：直线穿墙
        me.path=[[tx,ty]];
      }else{
        const p=astar(me.x,me.y,tx,ty);
        if(p){me.path=p;}
        else{
          G.clickFx={x:tx,y:ty,t:0.62,bad:true};
          toast('走不过去：这里是墙 / 家具 / 船外，换个落脚点');
          return {ok:false};
        }
      }
      G.clickFx={x:tx,y:ty,t:0.55};
      return {ok:true};
    }
    cv.addEventListener('click',e=>{
      if(DEAD||!G||G.paused||G.over||G.meet||G.inspect||G.camView||G.pipePick||G.sabPick||G.wheel)return;
      const me=G.me;
      if(!G.spectMode){
        if(!me.alive&&!me.ghost)return;
        if(me.downed)return;
        if(me.detained)return;
      }
      clickAt(WX(e.clientX),WY(e.clientY));
    });
    addEventListener('keydown',e=>{
      if(DEAD||!G)return;
      const k=e.key.toLowerCase();
      /* 设置面板在最上层：只允许 ESC 关闭，其余按键不落到对局 */
      if(global.SKSettings&&global.SKSettings.isOpen()){
        if(k==='escape'){e.preventDefault();global.SKSettings.close();}
        return;
      }
      /* 小游戏遮罩打开时：ESC 由 minigame.js 处理取消，避免同时触发暂停或其它动作覆盖 _doing */
      if(global.SKMiniGame&&SKMiniGame.isOpen()){
        if(k==='m'){SND.setOn(!SND.isOn());toast(SND.isOn()?'音效：开':'音效：关');}
        return;
      }
      if(k==='f2'){e.preventDefault();toggleDev();return;}
      if(k==='f8'){e.preventDefault();fpsToggle();return;}
      if(k==='escape'){
        if(G.wheel){closeWheel();return;}
        if(G.inspect){closeBodyCard();return;}
        if(G.sabPick){closeSabPick();return;}
        if(G.pipePick){closePipePick();return;}
        if(G.camView){closeCams();return;}
        /* 会议不再一刀切返回：活人由 togglePause 挡下（会议里不暂停），幽灵/旁观者放行。 */
        if(G.over)return;
        togglePause();return;
      }
      /* 交互轮盘：数字键 / 点击选择，屏蔽其它输入 */
      if(G.wheel){
        if(k==='m'){SND.setOn(!SND.isOn());toast(SND.isOn()?'音效：开':'音效：关');return;}
        if(/^[1-9]$/.test(k))pickWheel(+k-1);
        return;
      }
      /* 破坏选择：数字键直达，其余按键屏蔽 */
      if(G.sabPick){
        if(k==='m'){SND.setOn(!SND.isOn());toast(SND.isOn()?'音效：开':'音效：关');return;}
        if(/^[1-9]$/.test(k)){
          const rid=G.sabPick.rooms[+k-1];
          if(rid)pickSabRoom(rid);
        }
        return;
      }
      /* 地道选择：数字键直达，其余按键屏蔽（避免误触移动/攻击） */
      if(G.pipePick){
        if(k==='m'){SND.setOn(!SND.isOn());toast(SND.isOn()?'音效：开':'音效：关');return;}
        if(/^[1-9]$/.test(k)){
          const opts=pipeOpts(M.pipes[G.pipePick.from]);
          const o=opts[+k-1];
          if(o)pickPipe(o.i);
        }
        return;
      }
      /* 监控台：只允许 ESC / 静音，其它输入全部吞掉 */
      if(G.camView){
        if(k==='m'){SND.setOn(!SND.isOn());toast(SND.isOn()?'音效：开':'音效：关');return;}
        return;
      }
      if(G.meet||G.over)return;
      if(G.spectMode){
        /* 旁观者不参与对局：只允许暂停、静音（T/C 调试入口已移除） */
        if(k==='escape'){togglePause();return;}
        if(k==='m'){SND.setOn(!SND.isOn());toast(SND.isOn()?'音效：开':'音效：关');return;}
        return;
      }
      if(G.paused)return;
      if(k==='r'){tryReport();return;}
      if(k==='m'){SND.setOn(!SND.isOn());toast(SND.isOn()?'音效：开':'音效：关');return;}
      /* 一个动作只留一个键（2026-11-06 简化）：
         W 交互 / A 出刀 / S 搜尸查看 / D 收尸 / F 施救 / R 报告 / B 开枪 / H 破坏。
         旧别名 E / Q / X 与 P 已移除；暂停只走 ESC。
         2026-11-20 用户裁定：G 作为「放下」的专用别名保留（HUD 一直写着"按 G 放下"），
         只在拖拽中生效，不承担第二个动作。 */
      if(k==='w'){if(G.inspect)closeBodyCard();else interact();return;}
      if(k==='a'){attack();return;}
      if(k==='s'){e.preventDefault();if(G.inspect)closeBodyCard();else searchBody();return;}
      if(k==='d'||k==='g'){e.preventDefault();toggleDrag();return;}
      if(k==='f'){rescue();return;}
      if(k==='h'){sabotage();return;}
      if(k==='b'){shoot();return;}
    });
    
    /* ---------------- 交互轮盘 ----------------
       W 收集附近所有可交互项：只有 1 项直接执行，多项打开轮盘，避免按键语义重叠。 */
    function startClaim(me){
      me.path=null;me.moving=false;
      if(me.qualPending<=0&&!G.designMode){toast('没有待领取的物资申请单');return false;}
      if(!G.designMode&&(me.qual||0)>=2){toast('身上最多携带 2 张物资申请单，请先使用后再领取');return false;}
      me.doing=SUPPLY_QUAL_TIME;me._dur=SUPPLY_QUAL_TIME;me._doing='qual';
      toast('领取物资申请单 '+SUPPLY_QUAL_TIME+'s · 站桩，移动会打断');
      SND.interact();
      return true;
    }
    function startSupply(me,sp){
      if(!sp)return false;
      if(!G.designMode&&supplyCoolLeft(sp.item)>0){
        toast((sp.item==='ammo'?'子弹箱':'医疗包补给箱')+'冷却中，还需 '+Math.ceil(supplyCoolLeft(sp.item))+' 秒');
        return false;
      }
      if(me.qual<=0&&!G.designMode){toast('需要物资申请单：先回中央会议室圆桌领取');return false;}
      if(!G.designMode&&sp.item==='ammo'&&me.bullet>=1){toast('子弹已满');return false;}
      if(!G.designMode&&sp.item==='med'&&me.medkit>=1){toast('医疗包已满');return false;}
      me.path=null;me.moving=false;
      const dur=sp.item==='ammo'?SUPPLY_AMMO_TIME:SUPPLY_MED_TIME;
      me.doing=dur;me._dur=dur;me._doing=sp.item==='ammo'?'ammo':'med';
      toast('消耗 1 张物资申请单领取'+(sp.item==='ammo'?'子弹 '+dur+'s':'医疗包 '+dur+'s')+
        ' · 站桩，移动会打断');
      SND.interact();
      return true;
    }
    function startTask(me,p,ghost){
      /* 断电舱：小游戏无法完成（2026-11-21 用户裁定） */
      if(p&&G.roomOut&&G.roomOut[p.room]>0){
        if(me===G.me&&!G.spectMode)toast('该舱室断电：小游戏无法启动');
        return false;
      }
      me.path=null;me.moving=false;
      if(me.ghost&&me.alien){if(me===G.me&&!G.spectMode)toast('内鬼幽灵不能执行维修');return false;}
      if(me.ghost&&!ghostTaskAllowed(me,p)){
        if(me===G.me&&!G.spectMode)toast('幽灵最多维修 '+GHOST_TASK_CAP+' 分的剩余任务');return false;
      }
      /* 记住实际修的任务点：玩家可以乱序修自己的任意剩余任务，
         结算时不能按 tasks[tIdx] 记账（否则会出现“修 C 记 A 完成”） */
      me._taskPt=M.points.indexOf(p);
      me.doing=ghost?p.dur*1.6:p.dur; me._dur=me.doing; me._doing='task';
      if(ghost){if(me===G.me&&!G.spectMode)toast('幽灵维修「'+p.label+'」 '+me.doing.toFixed(1)+'s');}
      else toast('开始维修「'+p.label+'」 '+me.doing+'s'+
        (miniGameOn()?' · 玩通即完成，中途退出要重做':' · 站桩，移动会打断'));
    }
    function collectInteractions(me){
      /* 设计者模式（2026-11-09）：ghost 那一整块屏蔽不生效（管道 / 圆桌领单 / 补给 /
         电闸 / 监控都要能试），任务点也不再按「本局 4 个」筛 —— 26 个点逐个验收。
         ml 存的是 M.points 的下标，所以这里给的是全下标表，不是点位对象。 */
      const DZ=!!G.designMode;
      const out=[],ghost=!me.alive&&!DZ,ml=DZ?M.points.map((p,i)=>i):me.tasks.slice(me.tIdx);
      const fd=nearDmg(me);
      if(fd&&(!ghost||!me.alien))out.push({id:'fix',x:fd.x,y:fd.y,short:'维修故障',
        pill:'[W] 维修故障 '+fd.label+' 10s · 剩余 '+Math.max(0,Math.ceil(fd.left))+'s',
        accent:'rgba(255,107,97,.8)',fg:'#FFB3AC',run:()=>startFix(me,fd)});
      if(!ghost){
        const pipe=nearPipe(me);
        if(pipe&&(me.alien||DZ))out.push({id:'pipe',x:pipe.x,y:pipe.y,short:'钻管道',
          pill:'[W] 地道 · 选择出口',accent:'rgba(168,150,255,.75)',fg:'#D6CCFF',
          run:()=>openPipePick(pipe)});
        if(nearRoundTable(me)&&(DZ||me.qualPending>0)){
          const q=roundTableClaimSpot();
          out.push({id:'req',x:q.x,y:q.y,short:'领物资申请单',
            pill:'[W] 领取物资申请单 · 待领 '+me.qualPending,
            accent:'rgba(240,198,116,.8)',fg:'#FFE8B0',run:()=>startClaim(me)});
        }
        const sp=nearSupply(me);
        if(sp){
          const cd=supplyCoolLeft(sp.item);
          out.push({id:'supply-'+sp.item,x:sp.x,y:sp.y,
            short:sp.item==='ammo'?'领子弹':'领医疗包',
            pill:'[W] '+sp.label+(cd>0?' · 冷却中 '+Math.ceil(cd)+'s':(me.qual>0?' · 消耗 1 张申请单':' · 需要物资申请单')),
            accent:sp.item==='ammo'?'rgba(224,169,75,.8)':'rgba(63,191,140,.75)',
            fg:sp.item==='ammo'?'#FFE0A3':'#B9F5DA',run:()=>startSupply(me,sp)});
        }
        const br=M.facility.find(f=>f.kind==='breaker'&&Math.hypot(f.x-me.x,f.y-me.y)<BREAKER_USE_R);
        if(br){
          const bd=breakerPullTime();
          out.push({id:'breaker',x:br.x,y:br.y,
            short:G.lightState===2?'合闸':'拉闸',
            pill:'[W] '+(G.lightState===2?'合闸':'拉闸')+' '+bd+'s · '+(G.lightState===2?'当前断电':'当前照明'),
            accent:'rgba(127,211,240,.75)',fg:'#BFE9F7',
            run:()=>{me.path=null;me.moving=false;me.doing=bd;me._dur=bd;me._doing='breaker';SND.interact();toast((G.lightState===2?'合闸 ':'拉闸 ')+bd+'s');}});
        }
        const mon=nearMonitor(me);
        if(mon)out.push({id:'cams',x:mon.x,y:mon.y,short:'全船监控',
          pill:'[V] 全船监控'+(G.lightState===2?'（信号中断）':''),
          accent:'rgba(95,224,168,.75)',fg:'#B9F5DA',run:()=>openCams()});
      }
      /* 尸体操作收口：查验 / 搜尸取物资 / 收尸 / 报告 / 施救都能从 E 轮盘做 */
      const nb=ghost?null:bodyNear(2.2);
      if(nb){
        const bp=bodyPos(nb);
        if(bp&&visibleAt(bp[0],bp[1])){
          /* R20.5：被拖动的尸体不显示搜查入口（与 searchBody 的拦截同一条判据）。 */
          if(nb.draggedBy==null&&!nb.alive&&!nb.searched)out.push({id:'search',x:bp[0],y:bp[1],
            short:'搜尸（取证）',pill:'[S] 搜尸 · 取得伤口与时间线',
            accent:'rgba(127,211,240,.8)',fg:'#BFE9F7',run:()=>searchBody()});
          if(nb.draggedBy==null&&nb.alive&&!nb.searched)out.push({id:'search',x:bp[0],y:bp[1],
            short:'查看伤情',pill:'[S] 检查伤情 · 取得伤口与时间线',
            accent:'rgba(127,211,240,.8)',fg:'#BFE9F7',run:()=>searchBody()});
          if(nb.searched)out.push({id:'inspect',x:bp[0],y:bp[1],short:'查看记录',
            pill:'[S] 查看'+(nb.alive?'伤情':'尸检')+'记录',
            accent:'rgba(143,166,192,.7)',fg:'#C9D1DB',run:()=>openBodyCard(nb)});
          if(G.drag===nb.i)out.push({id:'drop',x:bp[0],y:bp[1],short:'放下尸体',
            pill:'[D] 放下尸体',accent:'rgba(240,198,116,.8)',fg:'#FFE8B0',run:()=>releaseDrag()});
          else if(nb.draggedBy==null)out.push({id:'drag',x:bp[0],y:bp[1],short:'收尸（拖走）',
            pill:'[D] 收尸 · 扛起后移动变慢',accent:'rgba(240,198,116,.8)',fg:'#FFE8B0',
            run:()=>toggleDrag()});
          if(!bodyReported(nb))out.push({id:'report',x:bp[0],y:bp[1],short:'报告尸体',
            pill:'[R] 报告尸体 · 立即开会',accent:'rgba(255,107,97,.75)',fg:'#FFB3AC',
            run:()=>tryReport()});
          if(nb.alive&&nb.downed&&me.medkit>0)out.push({id:'revive',x:bp[0],y:bp[1],short:'施救',
            pill:'[F] 施救 5s · 消耗医疗包',accent:'rgba(63,191,140,.8)',fg:'#B9F5DA',
            run:()=>rescue()});
        }
      }
      const p=nearPoint(me);
      const mine=p&&ml.indexOf(M.points.indexOf(p))>=0;
      if(mine&&(!ghost||ghostTaskAllowed(me,p))){
        /* 注意：不能叫 out —— 与外层交互数组 out 同名会遮蔽 */
        const isOut=!!(G.roomOut&&G.roomOut[p.room]>0);
        out.push({id:'task',x:p.x,y:p.y,short:p.label,
          pill:isOut?('[W] '+p.label+' · 断电中，无法维修')
                  :('[W] 维修 '+p.label+'  '+p.dur+'s'),
          accent:isOut?'rgba(120,120,120,.7)':'rgba(255,205,60,.7)',
          fg:isOut?'#8A8A8A':'#F0C674',
          run:()=>{ if(isOut){ if(me===G.me&&!G.spectMode)toast('该舱室断电：小游戏无法启动'); return; }
            startTask(me,p,ghost); }});
      }
      return out;
    }
    function openWheel(items){
      const me=G.me;
      if(!items||!items.length)return false;
      if(items.length===1){items[0].run();return true;}
      me.path=null;me.moving=false;
      G.wheel={items:items.slice()};
      const box=document.getElementById('wheel-opts');
      if(!box)return false;
      const n=items.length;
      box.innerHTML=items.map((it,i)=>{
        const ang=(n===2?Math.PI:-Math.PI/2)+i*Math.PI*2/n;
        const rad=n===2?30:34;
        const lx=50+Math.cos(ang)*rad,ly=50+Math.sin(ang)*rad;
        return '<button data-wheel="'+i+'" style="left:'+lx.toFixed(1)+'%;top:'+ly.toFixed(1)+'%">'
          +'<span class="pn">'+(i+1)+'</span><span class="pl">'+it.short+'</span></button>';
      }).join('');
      [...box.children].forEach(b=>{b.onclick=()=>pickWheel(+b.dataset.wheel);});
      const w=document.getElementById('wheel'); if(w)w.classList.remove('hide');
      SND.interact();
      return true;
    }
    function closeWheel(silent){
      if(G)G.wheel=null;
      const w=document.getElementById('wheel'); if(w)w.classList.add('hide');
      if(!silent)toast('已取消交互');
    }
    function pickWheel(i){
      const w=G&&G.wheel; if(!w)return false;
      const it=w.items[i]; if(!it)return false;
      closeWheel(true);
      it.run();
      return true;
    }
    function interact(){
      const me=G.me; if(!me.alive&&!me.ghost)return;
      if(G.wheel||me.doing>0)return;
      if(me.downed||me.detained)return;
      const items=collectInteractions(me);
      if(!items.length){
        let bot=null,bd=1.7;
        for(const f of M.facility){
          if(f.kind!=='medbot'&&f.kind!=='secbot')continue;
          const bp=botPos(f.kind); if(!bp)continue;
          const d=Math.hypot(bp.x-me.x,bp.y-me.y);
          if(d<bd){bd=d;bot=f;}
        }
        if(bot){
          if(bot.kind==='secbot')toast(G.secbotDead?'保安机器人：今晚已停摆':(G.secbotUses>=SEC_USES_MAX?'保安机器人：本夜 '+SEC_USES_MAX+' 次擒拿已用完':('保安机器人：在线 · 本夜 '+((G.secbotUses||0))+'/'+SEC_USES_MAX+' · '+SEC_RANGE+' 格半圆内危险行为会被押送拘留 30s')));
          else toast(G.medbotDead?'医疗无人机：今晚已停摆':(G.medbotLeft<=0?'医疗无人机：电量耗尽':(G.medbotCD>0?'医疗无人机：救援冷却中（'+Math.ceil(G.medbotCD)+'s） · 电量 '+G.medbotLeft+'/'+MEDBOT_CHARGES:(G.medbotUsed?'医疗无人机：电量 '+G.medbotLeft+'/'+MEDBOT_CHARGES:'医疗无人机：待命 · 电量 '+MEDBOT_CHARGES+'/'+MEDBOT_CHARGES+' · 待命于医疗间正中央，有人濒死会走过去近身治疗 '+MEDBOT_HEAL_TIME+' 秒'))));
          return;
        }
        toast(!me.alive?
          (me.tIdx<me.tasks.length&&!ghostTaskAllowed(me,M.points[me.tasks[me.tIdx]])?
            '幽灵维修额度已用尽（每只幽灵最多 '+GHOST_TASK_CAP+' 分）':'幽灵只能维修任务点或故障'):
          '这里没有你能做的事');
        return;
      }
      if(items.length===1){items[0].run();return;}
      openWheel(items);
    }
    function sabotageBot(target,tp){
      const me=G.me;
      if(!G.designMode)me.sabUsed=true;
      G.sabTarget=null;
      if(target.kind==='secbot'){G.secbotDead=true;G.botHp.secbot=0;}
      else{G.medbotDead=true;G.medbotLeft=0;G.botHp.medbot=0;}
      logEvent('bot_down',{actor:me.i,bot:target.kind,method:'sabotage',
        room:roomIdAt(tp.x,tp.y),x:+tp.x.toFixed(1),y:+tp.y.toFixed(1)});
      G.fx.push({type:'spark',x:tp.x,y:tp.y,t:1.4,dur:1.4});
      hear(tp.x,tp.y,'power',0.9);
      SND.sabotage();
      witnessAlienAction(me,me.x,me.y,6,'bot');
      aiHear('robot_down',me.x,me.y,18,{actor:me});
      envNotice('robot',tp.x,tp.y,0.5);
    }
    function sabotage(){
      const me=G.me;
      /* 幽灵不能施展破坏 —— 异形死后仍能维修，但破坏技只属于活着的异形 */
      if(!me.alive){ toast('幽灵无法破坏'); return; }
      if(me.downed||me.detained){ toast('当前状态无法破坏'); return; }
      if(!me.alien&&!G.designMode){ toast('你做不到'); return; }
      if(me.sabUsed&&!G.designMode){ toast('今晚已经破坏过了'); return; }
      if(G.sabPick)return;
      /* 异形按 H：贴着机器人时轮盘选择「停摆机器人 / 破坏舱室」；只贴身时给机器人选项 */
      let target=null,tp=null,td=1.8;
      for(const f of M.facility){
        if(f.kind!=='medbot'&&f.kind!=='secbot')continue;
        if(f.kind==='secbot'&&G.secbotDead)continue;
        if(f.kind==='medbot'&&G.medbotDead)continue;
        const p=botPos(f.kind); if(!p)continue;
        const d=Math.hypot(p.x-me.x,p.y-me.y);
        if(d<td){td=d;target=f;tp=p;}
      }
      if(target){
        const botOpt={id:'sab-bot',
          short:'停摆'+(target.kind==='secbot'?'保安机器人':'医疗无人机'),
          run:()=>sabotageBot(target,tp)};
        const roomOpt={id:'sab-room',short:'破坏舱室',run:()=>openSabPick()};
        openWheel([botOpt,roomOpt]);
        return;
      }
      openSabPick();
    }

    function rescue(){
      const me=G.me;
      if(G.over||G.meet||G.inspect)return;
      if(!me.alive||me.downed||me.detained||me.doing>0)return;
      if(me.medkit<1){toast('没有医疗包');return;}
      let best=null,bd=1.8;
      for(const a of G.agents) if(a.downed&&a.alive){
        const d=Math.hypot(a.x-me.x,a.y-me.y); if(d<bd){bd=d;best=a;}}
      if(!best){toast('附近没有濒死者');return;}
      /* 被拖拽期间救不活（2026-11-20 用户裁定）：以前这里会 releaseDragBy 把拖拽
         挣脱再强行施救，等于玩家有特权、AI 没有（AI 侧一直拒绝起手）。改成同一条：拒绝。 */
      if(best.draggedBy!=null){toast('伤者正在被拖走 · 施救无效');return;}
      me.path=null;me.moving=false;
      me.doing=SKSanity.STAND.revive; me._dur=SKSanity.STAND.revive; me._doing='revive'; me._rv=best;
      toast('施救中 '+SKSanity.STAND.revive+'s');
    }
    function attack(){
      const me=G.me;
      if(G.over||G.meet||G.inspect)return;
      if(!me.alive){toast('幽灵无法攻击');return;}
      if(me.downed||me.detained)return;
      if(!me.alien){toast('人类没有刀：按 B 开枪');return;}
      /* 开夜封锁已移除（2026-11-05 用户裁定）：原来 5 秒内不许出刀，
         现在 KNIFE.lockAtStart = 0，夜晚第一秒即可动手。
         判定仍留在**输入层**（玩家按键 / AI 决策），将来若要恢复宽限期
         只改 SKSanity.KNIFE.lockAtStart 一处即可。 */
      const lockLeft=knifeLockLeft();
      if(lockLeft>0){toast('开局封锁：还要 '+lockLeft.toFixed(1)+' 秒才能出刀');return;}
      stab();
    }
    /* 异形出刀判定：前方 1.5 格半径半圆（±90° + LOS），可选传入假想朝向 aimAng */
    function inKnifeArc(attacker,tx,ty,rad,aimAng){
      if(!attacker)return false;
      const r=rad||SKSanity.REACH.knife||1.5;
      const d=Math.hypot(tx-attacker.x,ty-attacker.y);
      if(d>r)return false;
      if(!losNow(attacker.x,attacker.y,tx,ty))return false;
      const ang=Math.atan2(ty-attacker.y,tx-attacker.x);
      const base=(aimAng!=null)?aimAng:shotAimAng(attacker);
      let dd=Math.abs(ang-base);
      if(dd>Math.PI)dd=2*Math.PI-dd;
      return dd<=Math.PI/2;
    }
    function stab(){
      const me=G.me;
      if(me.knife<1){toast('今晚的刀已经用掉了');return;}
      let best=null,bd=1e9,botKind=null;
      for(const a of G.agents){
        if(a===me||!a.alive||a.downed)continue;
        const d=Math.hypot(a.x-me.x,a.y-me.y);
        if(inKnifeArc(me,a.x,a.y,SKSanity.REACH.knife)){
          if(d<bd){bd=d;best=a;botKind=null;}
        }
      }
      if(!best){
        for(const kind of ['secbot','medbot']){
          if(botDead(kind))continue;
          const p=botPos(kind); if(!p)continue;
          const d=Math.hypot(p.x-me.x,p.y-me.y);
          if(inKnifeArc(me,p.x,p.y,SKSanity.REACH.knife)&&d<bd){bd=d;best=null;botKind=kind;}
        }
      }
      if(!best&&!botKind){toast('前方半圆内没有目标（'+SKSanity.REACH.knife+' 格、无遮挡）');return;}
      if(botKind){
        if(!knifeBot(me,botKind)){toast('这一刀没有砍到机器人');return;}
        toast('出刀：'+(botKind==='secbot'?'保安机器人':'医疗无人机')+'装甲受击 · 刀数 -1');
        return;
      }
      const hits=knife(me,best);
      if(hits.length)toast('出刀：'+hits.map(x=>x.name).join('、')+' 濒死');
    }
    /* 开枪的公共结算：玩家与 AI 共用一套射程 / 遮挡 / 声纹 / 目击逻辑，
       AI 开枪同样要留下 pendingCrime，保安机器人才能按规则抓人 */
    function fireShot(shooter,target){
      if(!shooter||!target||!target.alive||target.downed)return false;
      if(shooter.bullet<1)return false;
      shooter.bullet--;
      if(G.simMode&&G.simStats){
        G.simStats.shots++;
        if(shooter.alien)G.simStats.alienShots++; else G.simStats.humanShots++;
      }
      G.pendingCrime=shooter.i;
      if(!G.spectMode&&target===G.me&&G.dev){
        const ang=Math.atan2(target.y-shooter.y,target.x-shooter.x);
        setAct(shooter,'shoot',0.5,{ang});
        G.fx.push({type:'shield',x:target.x,y:target.y,t:0.6,dur:0.6});
        if(shooter!==G.me){shooter.target=null;shooter.path=null;}
        toast('DEV 无敌：这一枪没有生效');
        return false;
      }
      const ang=Math.atan2(target.y-shooter.y,target.x-shooter.x);
      setAct(shooter,'shoot',0.55,{ang});
      G.fx.push({type:'tracer',x1:shooter.x,y1:shooter.y,x2:target.x,y2:target.y,t:0.45,dur:0.45,ang});
      G.fx.push({type:'muzzle',x:shooter.x+Math.cos(ang)*0.55,y:shooter.y+Math.sin(ang)*0.55,t:0.2,dur:0.2,ang});
      if(playerAudibleAt(shooter.x,shooter.y,SKSanity.SOUND.shotR)){
        SND.shot(SND.volAt(shooter.x,shooter.y,0.95));
      }
      hear(shooter.x,shooter.y,'shot',1.15);
      noticeAction(shooter,shooter.x,shooter.y,7,'shot',target);
      aiHear('shot',shooter.x,shooter.y,SKSanity.SOUND.shotR,{actor:shooter,victim:target});
      setAct(target,'hurt',0.55,{ang});
      G.fx.push({type:'impact',x:target.x,y:target.y,t:0.55,dur:0.55});
      G.fx.push({type:'blood',x:target.x,y:target.y,t:0.9,dur:0.9,ang});
      /* 玩家音频与 AI 听觉共用 SOUND.shotR（20 格）；超出半径不播，
         与刀声/惨叫同一条门限，避免"远处只听到枪声没有下文"。 */
      if(playerAudibleAt(shooter.x,shooter.y,SKSanity.SOUND.shotR)){
        SND.flesh(SND.volAt(target.x,target.y,0.5));
      }
      target.downed=true; target.downAt=G.t; target.path=null; target.doing=0;
      target.downSeq=(target.downSeq||0)+1;   /* 同上：每次倒下都是新一次"发现" */
      target._doing=null; target._fix=null; target._rv=null; target._sv=null; target._taskPt=null;
      target.downX=target.x; target.downY=target.y; target.killedBy=shooter.i;
      /* 开枪把人放倒同样给异形加速（与出刀同一个授予入口、同一条 alienOnly 规则） */
      killRushStart(shooter);
      target.woundCause='shot'; target.downRoom=roomIdAt(target.x,target.y);
      target.searched=false;
      logEvent('shoot',{actor:shooter.i,victim:target.i,room:target.downRoom,
        x:+target.x.toFixed(1),y:+target.y.toFixed(1)});
      screamFor(target);
      if(!G.spectMode&&target===G.me){
        if(global.SKMiniGame&&SKMiniGame.isOpen())SKMiniGame.close();
        target._mg=false;
        closeWheel(true);closeCams(true);closePipePick(true);closeSabPick(true);G.sabTarget=null;toast('你被击中，濒死');
      }
      else if(!G.spectMode&&shooter===G.me) toast('开枪击中 '+target.name);
      return true;
    }
    /* 出刀打机器人的公共入口：玩家 Q 与 AI 异形共用，
       必须消耗刀数并按装甲 HP（保安 2 / 医疗 1）结算，不允许"一刀拆死" */
    function knifeBot(a,kind){
      if(!a||a.knife<1)return false;
      if(botDead(kind))return false;
      const p=botPos(kind); if(!p)return false;
      if(Math.hypot(p.x-a.x,p.y-a.y)>=1.8)return false;
      if(!losNow(a.x,a.y,p.x,p.y))return false;
      a.knife--;
      if(!damageBot(kind,a,'knife')){ a.knife++; return false; }
      return true;
    }
    /* 拆保安的前置条件（2026-10-31）：异形之间不能通信，只有「房间里已经认出多名队友 +
       能推断出一个共同捕杀目标」时才值得冒暴露风险——落单拆保安等于白送一条
       saw_bot 确证（会被直接锁定投票）。默认不攻击保安。 */
    function secbotRaidOk(a,secPos){
      if(!a||!secPos||!a.alive||a.downed)return false;
      let mates=0;
      for(const k in (a.mates||{})){
        const m2=G.agents[+k];
        if(!m2||!m2.alive||m2.downed||m2.detained)continue;
        if(Math.hypot(m2.x-secPos.x,m2.y-secPos.y)<=8)mates++;
      }
      if(mates<2)return false;
      /* 共同目标：保安 8 格内有活人（非队友），且至少一名队友也在朝他靠 */
      for(const v of G.agents){
        if(v===a||!v.alive||v.downed||v.detained||v.alien)continue;
        if(Math.hypot(v.x-secPos.x,v.y-secPos.y)>8)continue;
        for(const k in (a.mates||{})){
          const m2=G.agents[+k];
          if(!m2||!m2.alive||m2.downed||m2.detained)continue;
          if(Math.hypot(m2.x-secPos.x,m2.y-secPos.y)>8)continue;
          /* 0.7 → 0.45（2026-11-02）：即使围攻成立也有一半以上概率放弃，
             让"拆保安"变成偶发事件而不是标准流程。 */
          if(Math.hypot(m2.x-v.x,m2.y-v.y)<=7)return Math.random()<0.45;
        }
      }
      return false;
    }
    /* 机器人受击：刀/枪都可摧毁；保安存活时会面向袭击者并尝试反制拘留 */
    function damageBot(kind,attacker,cause){
      if(!G||G.over||!attacker||!attacker.alive||attacker.downed||attacker.detained)return false;
      if(kind!=='secbot'&&kind!=='medbot')return false;
      if(botDead(kind))return false;
      const p=botPos(kind); if(!p)return false;
      const hp=botHp(kind)-1;
      G.botHp[kind]=Math.max(0,hp);
      G.pendingCrime=attacker.i;
      /* 出刀打机器人也留下「刀者红身」与挥砍动作，和打人一刀的表现对齐 */
      if(cause==='knife'){
        const ang=Math.atan2(p.y-attacker.y,p.x-attacker.x);
        attacker.redT=SKSanity.RED_BODY.dur;
        setAct(attacker,'stab',0.34,{ang,lunge:0.46});
        SND.knife(SND.volAt(p.x,p.y,0.90));
      }
      if(kind==='secbot'&&G.bots&&G.bots.secbot){
        G.bots.secbot.ang=Math.atan2(attacker.y-p.y,attacker.x-p.x);
        G.bots.secbot.face=attacker.x<p.x?-1:1;
      }
      G.fx.push({type:'spark',x:p.x,y:p.y,t:1.0,dur:1.0});
      G.fx.push({type:'alarm',x:p.x,y:p.y,t:0.9,dur:0.9});
      hear(p.x,p.y,'power',1.0);
      aiHear(cause==='shot'?'shot':'knife',p.x,p.y,16,{actor:attacker});
      noticeAction(attacker,attacker.x,attacker.y,6,cause==='shot'?'shot':'knife',null);
      SND.sabotage();
      const nm=kind==='secbot'?'保安机器人':'医疗无人机';
      logEvent('bot_hit',{actor:attacker.i,bot:kind,method:cause||'knife',
        hp:Math.max(0,G.botHp[kind]),room:roomIdAt(p.x,p.y),
        x:+p.x.toFixed(1),y:+p.y.toFixed(1)});
      if(G.botHp[kind]<=0){
        if(kind==='secbot')G.secbotDead=true; else{G.medbotDead=true;G.medbotLeft=0;}
        G.fx.push({type:'alarm',x:p.x,y:p.y,t:1.4,dur:1.4});
        logEvent('bot_down',{actor:attacker.i,bot:kind,method:cause||'knife',
          room:roomIdAt(p.x,p.y),x:+p.x.toFixed(1),y:+p.y.toFixed(1)});
      }else{
        toast(nm+'装甲受损 · 剩余 '+G.botHp[kind]);
      }
      return true;
    }
    function shotAimAng(shooter){
      if(!shooter)return 0;
      if(shooter===G.me&&!G.spectMode&&G.aimX!=null&&G.aimY!=null)
        return Math.atan2(G.aimY-shooter.y,G.aimX-shooter.x);
      return agentAimAng(shooter);
    }
    function inShotCone(shooter,tx,ty){
      if(!shooter)return false;
      const SH=SKSanity.SHOT;
      const d=Math.hypot(tx-shooter.x,ty-shooter.y);
      if(d>(SH.range||8))return false;
      if(!losNow(shooter.x,shooter.y,tx,ty))return false;
      if(shooter!==G.me||G.spectMode)return true;
      const half=(SH.cone||Math.PI/3)*0.5;
      const ang=Math.atan2(ty-shooter.y,tx-shooter.x);
      let dd=Math.abs(ang-shotAimAng(shooter));
      if(dd>Math.PI)dd=2*Math.PI-dd;
      return dd<=half;
    }
    function fireShotBot(shooter,kind){
      if(!shooter||shooter.bullet<1||botDead(kind))return false;
      const p=botPos(kind); if(!p)return false;
      if(!inShotCone(shooter,p.x,p.y))return false;
      shooter.bullet--;
      if(G.simMode&&G.simStats){
        G.simStats.shots++;
        if(shooter.alien)G.simStats.alienShots++; else G.simStats.humanShots++;
      }
      G.pendingCrime=shooter.i;
      const ang=Math.atan2(p.y-shooter.y,p.x-shooter.x);
      setAct(shooter,'shoot',0.55,{ang});
      G.fx.push({type:'tracer',x1:shooter.x,y1:shooter.y,x2:p.x,y2:p.y,t:0.45,dur:0.45,ang});
      G.fx.push({type:'muzzle',x:shooter.x+Math.cos(ang)*0.55,y:shooter.y+Math.sin(ang)*0.55,t:0.2,dur:0.2,ang});
      G.fx.push({type:'impact',x:p.x,y:p.y,t:0.55,dur:0.55});
      SND.shot(SND.volAt(shooter.x,shooter.y,0.95));hear(shooter.x,shooter.y,'shot',1.15);
      damageBot(kind,shooter,'shot');
      if(shooter===G.me)toast('开枪击中 '+(kind==='secbot'?'保安机器人':'医疗无人机'));
      return true;
    }
    function shoot(){
      const me=G.me;
      if(G.over||G.meet||G.inspect)return;
      if(!me.alive||me.downed||me.detained)return;
      if(me.bullet<1){toast('没有子弹');return;}
      let best=null,bd=1e9,botKind=null;
      for(const a of G.agents){
        if(a===me||!a.alive||a.downed)continue;
        const d=Math.hypot(a.x-me.x,a.y-me.y);
        /* 2026-11-22：子弹与视野解耦，改为 8 格 60° 长锥 + 墙/门遮挡（不依赖手电/亮房） */
        if(inShotCone(me,a.x,a.y)&&d<bd){bd=d;best=a;botKind=null;}
      }
      /* 机器人也是实体目标：鼠标靠近机器人时才把枪口切过去，避免误伤巡逻单位 */
      for(const kind of ['secbot','medbot']){
        if(botDead(kind))continue;
        const p=botPos(kind); if(!p)continue;
        const d=Math.hypot(p.x-me.x,p.y-me.y);
        const aimD=Math.hypot((G.aimX||me.x)-p.x,(G.aimY||me.y)-p.y);
        if(aimD<1.2&&inShotCone(me,p.x,p.y)){
          bd=d;best=null;botKind=kind;
        }
      }
      if(!best&&!botKind){const deg=Math.round((SKSanity.SHOT.cone||Math.PI/3)*180/Math.PI);toast('射程锥内没有目标（'+(SKSanity.SHOT.range||8)+' 格 · '+deg+'°）');return;}
      if(botKind){fireShotBot(me,botKind);return;}
      fireShot(me,best);
    }

    /* ---------------- 搜尸 / 拖拽 ---------------- */
    function bodyNear(maxD){
      const me=G.me;
      let best=null,bd=maxD;
      for(const a of G.agents){
        if(a===me)continue;
        const bp=bodyPos(a); if(!bp)continue;
        const d=Math.hypot(bp[0]-me.x,bp[1]-me.y);
        if(d<bd){bd=d;best=a;}
      }
      return best;
    }
    function searchBody(){
      const me=G.me;
      if(G.over||G.meet||G.inspect)return;
      if(!me.alive){toast('幽灵无法触碰尸体');return;}
      if(me.downed||me.detained){toast('你现在动不了');return;}
      if(me.doing>0)return;
      const b=bodyNear(2.2);
      if(!b){toast('附近没有尸体或伤者');return;}
      if(!b.searched){
        /* R20.5：尸体被拖动时不能搜查 —— 与 AI 的扫描共用 draggedBy==null 这一条判据，
           不许出现"人正被拖着走，另一边还能对着他读条取证"。已检查过的只读记录，不受限。 */
        if(b.draggedBy!=null){toast('尸体正被拖动，无法搜查');return;}
        me.path=null;me.moving=false;
        me.doing=SKSanity.STAND.search; me._dur=SKSanity.STAND.search; me._doing='search'; me._sv=b.i;
        SND.search();
        toast(b.alive?'检查伤情中…':'搜尸取证中…');
        return;
      }
      if(G.inspect)closeBodyCard();else openBodyCard(b);
    }
    function openBodyCard(b){
      const bp=bodyPos(b);
      /* 尸检/伤情卡打开期间世界冻结，但夜钟是真实时间：记下打开时刻，
         关闭时把相位整体平移（与 togglePause 同一套补偿，见 closeBodyCard）。 */
      G.inspect={agent:b,openedAt:performance.now()};
      document.getElementById('b-t').textContent=(b.alive?'伤情记录 · ':'尸检记录 · ')+b.name;
      document.getElementById('b-s').textContent=bp?roomNameAt(bp[0],bp[1]):'船体未知区域';
      let h='';
      const row=(k,v,bad)=>h+='<div class="row"><span>'+k+'</span><b'+(bad?' class="bd-bad"':'')+'>'+v+'</b></div>';
      if(b.alive){
        row('状态','濒死 · 还有呼吸，拖进医疗间可由机器人救活');
        row('发现地点',bp?roomNameAt(bp[0],bp[1]):'—');
        row('伤口',bodyWound(b),true);
        row('时间',b.downAt!=null?('夜间剩余约 '+Math.max(0,Math.round(b.downAt))+'s 时倒下'):'—');
        row('检查',b.searched?'已检查 · 伤口与拖拽痕迹完整':'未检查 · 按 S 检查伤情',!b.searched);
        row('凶手',G.dev&&b.killedBy!=null?G.agents[b.killedBy].name:'无法判断');
      }else{
        row('状态','已死亡');
        row('死因',bodyWound(b));
        row('死亡地点',roomNameById(b.deathRoom));
        row('死亡时间','第 '+G.night+' 夜 · 倒计时约 '+Math.max(0,Math.round(b.deathAt||0))+'s');
        row('尸体',b.bodyMoved?'被移动过 · 现场被布置':'未被移动',b.bodyMoved);
        row('检查',b.searched?'已检查 · 伤口与拖拽痕迹完整':'未检查 · 按 S 搜尸取证，物资需手动拿取',!b.searched);
        row('凶手',G.dev&&b.killedBy!=null?G.agents[b.killedBy].name:'无法判断');
      }
      const it=bodyItemsText(b);
      if(it)h+='<div class="row bd-loot" id="b-loot" role="button" tabindex="0"><span>携带物资</span><b>'+it+' · 点击领取</b></div>';else row('携带物资','无');
      document.getElementById('b-rows').innerHTML=h;
      const lr=document.getElementById('b-loot');if(lr)lr.onclick=()=>takeBodyLoot(b);const note=document.getElementById('b-note');if(note)note.textContent=it?'查看只取证；点物资栏领取。':'身上没有可带走的物资。';
      document.getElementById('body').classList.remove('hide');
    }
    function closeBodyCard(){
      const el=document.getElementById('body');
      if(el)el.classList.add('hide');
      if(!G)return;
      /* T1：卡片冻结多少墙钟就把夜晚相位后移多少；与 togglePause 同口径，只平移 phase。 */
      const ins=G.inspect;
      if(ins&&ins.openedAt!=null){
        const d=performance.now()-ins.openedAt;
        if(d>0&&G.phase&&G.t>0){G.phase.startedAt+=d;G.phase.endsAt+=d;}
      }
      G.inspect=null;
    }
    function toggleDrag(){
      const me=G.me;
      if(G.over||G.meet||G.inspect)return;
      if(!me.alive){toast('幽灵无法拖拽');return;}
      if(me.downed||me.detained){toast('你现在动不了');return;}
      if(G.drag!=null){ releaseDrag(); return; }
      const b=bodyNear(2.2);
      if(!b){toast('附近没有尸体或伤者');return;}
      if(b.draggedBy!=null){toast('已经有人在拖这具身体');return;}
      if(startDrag(me,b,true)){
        const bp0=bodyPos(b);
        if(bp0)noticeAction(me,bp0[0],bp0[1],6,'drag',b);
        aiHear('drag',me.x,me.y,8,{actor:me});
        SND.drag(0.7); hear(me.x,me.y,'drag',0.8);
        toast('拖拽 '+b.name+' · 移动变慢，再按 D 放下');
      }
    }
    function toast(s){ G.msg=s; G.msgT=2.6; }
    /* 大横幅（2026-11-18）：给"终结者时刻"这类**全局状态切换**一个看得见的宣告。
       toast 只有 14px、2.6 秒、贴屏幕底部，玩家在跑图时根本不会注意；
       这里用屏幕中上方的大字 + 淡入淡出，不占 DOM、不影响布局。 */
    function banner(text,dur){ G.banner={text:text,t:dur||3.2,dur:dur||3.2}; }
    function pulseHud(id){
      const el=document.getElementById(id);
      if(!el)return;
      el.classList.remove('pop');
      void el.offsetWidth;
      el.classList.add('pop');
      setTimeout(()=>el.classList.remove('pop'),800);
    }
    /* ---------------- 音效（已拆至 js/engine/audio.js#SKAudio） ---------------- */
    const SND=SKAudio.create({getMe:()=>(typeof G!=="undefined"&&G)?G.me:null,isSim:()=>SIM_RUN});

    const ROW=SKT2Space.ROW;  /* 真源 js/t2/space.js；另有两处直接使用 ROW */
    
    /* ---------------- 渲染（已拆至 js/view/render.js#SKRender） ---------------- */
    let _render = null;
    function _ensureRender(){
      if(_render)return _render;
      _render=SKRender.create({
        cv,ctx,M,IMG,VIEW,ROW,SX,SY,WX,WY,CW,
        getG:()=>G,getDpr:()=>dpr,ready,mapReady,rtImg,furnSprite,roomIdAt,roomNameById,
        camFocus,updateCamera,bodyNear,bodyPos,botPos,breakerPuller,
        collectInteractions,doorScanRule,inKnifeArc,isMyMate,lastAlienEvo,
        losNow,nearPoint,observerVisionAt,renderDevPanel,roundTableClaimSpot,
        roundTableCover,secJail,shotAimAng,supplyCoolLeft,actOffset,canSee,
        visibleAt,seatNo,tagName,corridorLampPos,pipeTint,rowForAng,dirAng,workStyle,k1,
        inCorr,roomAt,losWalls,DOOR_SCAN_TIME,
        ALIEN_DARK_R,HUMAN_DARK_R,HUMAN_LIGHT_R,
        MEDBOT_CHARGES,MEDBOT_COOLDOWN,MEDBOT_HEAL_TIME,SEC_ARC,SEC_RANGE,SEC_USES_MAX
      });
      return _render;
    }
    function draw(dt){ return _ensureRender().draw(dt); }
    function drawFog(){ return _ensureRender().drawFog(); }
    function drawMini(){ return _ensureRender().drawMini(); }
    /* 亮区：亮舱整间可见；未断电时走廊默认有灯，也整条按亮区处理。
       返回 'r:房id' / 'c:走廊下标'，不属于亮区返回 null。 */
    function litZoneAt(x,y){
      const r=roomAt(x,y);
      if(r)return G.lit[r.id]?'r:'+r.id:null;
      const c=inCorr(x,y);
      if(c&&G.corrLit)return 'c:'+M.corridors.indexOf(c);
      return null;
    }
    function visibleAt(x,y){
      if(G.dev||!G.fogOn||!G.me.alive||(!G.spectMode&&lastAlienEvo(G.me)))return true;
      const me=G.me;
      return observerVisionAt(me.x,me.y,me.alien,
        Math.atan2(G.aimY-me.y,G.aimX-me.x),x,y);
    }
    function canSee(a){
      if(!G.me.alive||G.dev||(!G.spectMode&&lastAlienEvo(G.me)))return true;
      return visibleAt(a.x,a.y);
    }
    cv.addEventListener('mousemove',e=>{if(DEAD||!G)return;G.aimX=WX(e.clientX);G.aimY=WY(e.clientY);});
    
    /* ---------------- HUD（已拆至 js/view/hud.js#SKHud） ---------------- */
    const _hudCtx={getG:()=>G,M,isSim:()=>SIM_RUN,winPts:WIN_PTS,ghostTaskCap:GHOST_TASK_CAP,roomNameById,seatNo};
    function renderTaskList(){ return SKHud.renderTaskList(_hudCtx); }
    function syncHud(){ return SKHud.sync(_hudCtx); }
    document.getElementById('m-send').onclick=()=>sendPlayerSpeech(
      document.getElementById('m-text').value);
    document.getElementById('m-tpl-btns').addEventListener('click',e=>{
      const b=e.target.closest?e.target.closest('button[data-tpl]'):null;
      if(!b)return;
      const m=G.meet; if(!m||m.phase!=='discuss'||G.spectMode)return;
      const kind=b.dataset.tpl;
      /* 空值不能走 + 运算（会变成 0 = 自己）；「我在…」「不是我」本来就不需要对象。 */
      const rawT=document.getElementById('m-tpl-target').value;
      const needT=kind!=='where'&&kind!=='deny';
      if(!rawT&&needT){toast('先选对象');return;}
      const ti=rawT?+rawT:-1;
      /* 只有口供类才回落到"我现在这间"；证据类留空 = 不声称地点，
         不能替玩家把当前舱室塞进证词。 */
      const fallbackRoom=kind==='where'||kind==='deny'
        ?(G.me.nRoom||roomIdAt(G.me.x,G.me.y)||'corridor'):'';
      const rid=document.getElementById('m-tpl-room').value||fallbackRoom;
      const whenSel=document.getElementById('m-tpl-when');
      const when=whenSel?whenSel.value:'';
      const text=meetTemplateText(kind,G.agents[ti],rid,when);
      if(text)sendPlayerSpeech(text);
    });
    document.getElementById('m-text').addEventListener('keydown',e=>{
      if(e.key==='Enter'){ e.preventDefault(); document.getElementById('m-send').click(); }
      e.stopPropagation();
    });
    document.getElementById('m-skip').onclick=()=>{const m=G.meet;if(!m||m.phase!=='discuss')return;
      if(m.voteT>0) startVote(); else finishMeeting();};
    document.getElementById('m-skip-vote').onclick=()=>{
      const m=G.meet;
      if(!m||m.phase!=='vote'||G.spectMode||!G.me.alive||G.me.downed)return;
      if(m.votes[G.me.i]==null) m.votes[G.me.i]=-1;
      closeVote();
    };
    /* 2026-11-08：新发言提示 —— 点一下跳回最新；玩家自己滚到底时自动消失。 */
    {
      const nb=document.getElementById('m-new');
      if(nb)nb.onclick=()=>{
        const box=document.getElementById('m-say');
        if(box)box.scrollTop=box.scrollHeight;
        clearNewLines();
      };
      const sb=document.getElementById('m-say');
      if(sb)sb.addEventListener('scroll',()=>{
        if(sb.scrollTop+sb.clientHeight>=sb.scrollHeight-24)clearNewLines();
      });
    }
    /* 拖拽提示本身就是「放下」按钮（2026-11-20 用户报"点 G 没反应"）。
       键盘 G / D 与这里的点击走同一个 releaseDrag，不新增第二套放下逻辑。 */
    document.getElementById('dragtag').onclick=()=>{
      if(G&&G.drag!=null)releaseDrag();
    };
    document.getElementById('e-r').onclick=()=>{newGame();};
    document.getElementById('e-rep').onclick=()=>{
      if(global.SKReplay)global.SKReplay.open(replayData());
    };
    document.getElementById('e-save').onclick=()=>{
      if(global.SKReplay)global.SKReplay.save(replayData());
    };
    document.getElementById('p-resume').onclick=()=>{if(G.paused)togglePause();};
    const pset=document.getElementById('p-set');
    if(pset)pset.onclick=()=>{ if(global.SKSettings)global.SKSettings.open(); };
    document.getElementById('p-restart').onclick=()=>restartGame();
    document.getElementById('p-exit').onclick=()=>exitToMenu();
    document.getElementById('b-close').onclick=()=>closeBodyCard();
    const camClose=document.getElementById('cam-close');
    if(camClose)camClose.onclick=()=>closeCams();
    const pipeCancel=document.getElementById('pipe-cancel');
    if(pipeCancel)pipeCancel.onclick=()=>closePipePick();
    const sabCancel=document.getElementById('sabot-cancel');
    if(sabCancel)sabCancel.onclick=()=>closeSabPick();
    document.getElementById('cam').addEventListener('click',e=>{
      if(e.target&&e.target.id==='cam')closeCams();
    });
    document.getElementById('pipe').addEventListener('click',e=>{
      if(e.target&&e.target.id==='pipe')closePipePick();
    });
    document.getElementById('sabot').addEventListener('click',e=>{
      if(e.target&&e.target.id==='sabot')closeSabPick();
    });
    document.getElementById('wheel').addEventListener('click',e=>{
      if(e.target&&e.target.id==='wheel')closeWheel();
    });
    document.getElementById('body').addEventListener('click',e=>{
      if(e.target&&e.target.id==='body')closeBodyCard();
    });

    /* 测试钩子：只读写这一局的状态，不碰 DOM 布局（Playwright 用） */
    /* ---------------- 批量模拟（蒙特卡洛） ----------------
       simGame 走真实 update / AI / 会议逻辑，但用 simT 模拟时钟并即时结算会议。
       - 夜会议按 30 秒（25 讨论 + 5 投票）从夜里扣除；白天会议不占夜；
       - 跳过渲染 / HUD / 音效 / 自动不变量，只保留对局逻辑；
       - 每局用 seed 接管 Math.random，便于复现。 */
    /* ---------------- 无头批量模拟（已拆至 js/sim/runner.js#SKSim） ---------------- */
    let _sim = null;
    function _ensureSim(){
      if(_sim)return _sim;
      _sim=SKSim.create({
        getG:()=>G,getSimRun:()=>SIM_RUN,setSimRun:v=>{SIM_RUN=v;},
        newGame,update,startVote,closeVote,finishMeeting,NIGHT
      });
      return _sim;
    }
    function simGame(opts){ return _ensureSim().simGame(opts); }

    global.SKV3._t={
      G:()=>G,
      newGame:()=>newGame(),
      /* 门禁探针：强制下一局的玩家席位与名单，返回席位/名字/异形分布。
         只在 ?test 下有意义；普通对局不要调用。 */
      nextGame:(o)=>{
        o=o||{};
        SEAT_FORCE=(o.seat==null?null:Math.max(0,Math.min(NAMES.length-1,o.seat|0)));
        ROSTER_FORCE=o.roster||null;
        newGame();
        return {me:G.me.i,names:G.agents.map(a=>a.name),
          aliens:G.agents.filter(a=>a.alien).map(a=>a.i)};
      },
      inv:()=>{const r=runInvariants('api');return r?{checks:r.checks,fails:r.fails,all:G.inv.fails}:null;},
      checkWin:()=>checkWin(),
      winPts:()=>WIN_PTS,
      /* 语料渲染体检（2026-11-03）：把 SKLines 每一条**真的走一遍 fillTpl**，
         抓三类只有接线后才会暴露的事故：花括号没展开（槽名写错）、槽位空成"This"式废句、
         以及舱室退化成「未知位置」。门禁据此断言，而不是只数行数。 */
      lineSmoke:()=>{
        const out={rows:0,leak:[],empty:[],unknown:[],sample:[]};
        const ctx={t:'07 极夜',r:'仓库',r2:'引擎室',u:'03 北极',k:'电路维修',
          when:'刚才',prev:'上一轮',why:'我看见他钻进管道'};
        const who=G.me||G.agents[1];
        for(const cat in SKLines.POOLS){
          for(const tone in SKLines.POOLS[cat]){
            for(const tpl of SKLines.POOLS[cat][tone]){
              out.rows++;
              const s=fillTpl(who,tpl,ctx);
              if(/[{}]/.test(s))out.leak.push(cat+'/'+tone+': '+s);
              if(/未知位置/.test(s))out.unknown.push(cat+'/'+tone+': '+s);
              if(!s||s.replace(/[^一-龥a-zA-Z0-9]/g,'').length<3)
                out.empty.push(cat+'/'+tone+': 「'+tpl+'」→「'+s+'」');
              if(out.sample.length<3&&tone==='hot')out.sample.push(cat+' → '+s);
            }
          }
        }
        for(const kind in SKLines.WHY){
          for(const tpl of SKLines.WHY[kind]){
            out.rows++;
            const s=fillTpl(who,tpl,ctx);
            if(/[{}]/.test(s))out.leak.push('WHY/'+kind+': '+s);
          }
        }
        return out;
      },
      report:()=>{tryReport();return !!G.meet;},
      medbotR:()=>MEDBOT_R,
      medbotHealTime:()=>MEDBOT_HEAL_TIME,
      medbotTouchR:()=>MEDBOT_TOUCH_R,
      medbotHome:()=>medbotHome(),
      stats:()=>Object.assign({},(G&&G.stats)||{}),
      bodyReported:i=>!!G.agents[i]&&bodyReported(G.agents[i]),
      kill:(i,c)=>{const a=G.agents[i];if(!a)return false;return die(a,c||'knife',null);},
      knife:(k,v)=>knife(G.agents[k],G.agents[v]),
      attack:()=>{attack();return {knife:G.me.knife,msg:G.msg};},
      /* 调试钩子：直接执行一次出刀，**不受开夜封锁限制**（门禁用它验证刀击链路） */
      stabRaw:()=>{stab();return {knife:G.me.knife,msg:G.msg};},
      /* 门禁用：一夜的长度（秒）。夜长改过好几次，夹具不要写死数字。 */
      nightLen:()=>NIGHT,
      /* 门禁用：模拟"点地面"（世界坐标），返回走不走得通 */
      badClick:(x,y)=>clickAt(x,y),
      /* 门禁用：直接走"天亮"流程（会开白天会议并把人刷新到会议室） */
      dawn:()=>{dawn();return {meet:!!G.meet,kind:G.meet&&G.meet.kind};},
      /* 门禁用：临时解除「开夜 5 秒禁刀」（只影响这一局） */
      noKnifeLock:(v)=>{G._noKnifeLock=v!==false;return !!G._noKnifeLock;},
      shoot:()=>shoot(),
      fireBot:kind=>fireShotBot(G.me,kind),
      tp:(i,x,y)=>{const a=G.agents[i];if(!a)return null;a.path=null;a.moving=false;a.x=x;a.y=y;
        if(!a.alive){a.bodyX=x;a.bodyY=y;a.bodyGone=false;a.deathX=x;a.deathY=y;}
        return[a.x,a.y];},
      setDev:v=>{G.dev=!!v;syncDevUi();},
      dev:()=>!!G.dev,
      bodyOf:i=>bodyPos(G.agents[i]),
      dragOf:i=>i==null?G.drag:(G.agents[i]?G.agents[i].drag:null),
      dragStart:(i,v)=>startDrag(G.agents[i],G.agents[v],true),
      /* 门禁用（2026-11-18）：玩家搜尸的**唯一入口**，返回是否真的开始读条。
         R20.5 要求"尸体被拖动时不可搜查"，这条必须能被断言到，不能只靠肉眼。 */
      searchBodyTry:()=>{searchBody();return {doing:+(G.me.doing||0).toFixed(2),
        do:G.me._doing,msg:G.msg};},
      dragRelease:i=>releaseDragBy(G.agents[i],true),
      hideSpot:rid=>hideSpotFor(rid),
      hideRoom:rid=>hideRoomFor(rid),
      medDrop:()=>medDropSpot(),
      secWouldSee:(x,y)=>secbotWouldSee(x,y),
      witnessesAt:(i,x,y,rad,except)=>{const a=G.agents[i];
        if(!a)return [];
        return watchersAt(a,x,y,rad==null?6:rad,except==null?null:G.agents[except]).map(w=>w.i);},
      gfx:()=>Object.assign({},G.gfx),
      newNight:()=>{startNight(true);return {night:G.night,t:G.t};},
      planReport:(i,body,delay,direct)=>{const a=G.agents[i];if(!a)return null;
        const v=body==null?a._killBody:body;
        if(v==null||!G.agents[v])return null;
        a._reportPlan={body:v,wait:(delay==null?0:delay),spot:null,direct:!!direct};
        a._reportT=0;a._reportBody=null;a._reportGo=null;
        return {body:v,wait:a._reportPlan.wait,direct:!!direct};},
      reportPlan:i=>{const a=G.agents[i];
        return a&&a._reportPlan?{body:a._reportPlan.body,wait:+a._reportPlan.wait.toFixed(1),
          direct:!!a._reportPlan.direct,
          spot:a._reportPlan.spot?[+a._reportPlan.spot[0].toFixed(1),+a._reportPlan.spot[1].toFixed(1)]:null}:null;},
      bodyItems:i=>{const a=G.agents[i];if(!a)return null;
        return {bullet:a.bullet|0,medkit:a.medkit|0,qual:a.qual|0,searched:!!a.searched};},
      /* 门禁隔离用：把某个 AI 的子状态（拖尸/藏尸/管道规划/断电响应）清干净 */
      resetAiState:i=>{const a=G.agents[i];if(!a)return null;
        a.drag=null;a.draggedBy=null;a.redT=0;a.rushT=0;a.stunT=0;a._dragSnd=0;a._dragAiT=0;
        a._dragAway=false;a._dragMedD0=0;a._dragAwaySeen={};
        a._hideSpot=null;a._hideRoom=null;a._hideCD=0;a._hides=0;
        a._pipePlan=null;a._pipeSeeks=0;a._secAvoidT=0;a._lightGo=false;a._botCD=0;
        a._killBody=null;a._killAt=0;a._killDecided=true;a._reportPlan=null;
        a._avoid={};a._fleeT=0;a._fleeFrom=null;a._pathCD=0;a._alienTaskN=0;a._stallBias=0.8+Math.random()*0.4;
        a._fakeKind=null;a._alienTaskTotal=0;a._supportGoal=null;a._lootMem={};
        /* 伪装：门禁要用"干净的一只异形"单独验证演出链路，冷却与抑制位一并归零 */
        a._fakeCD=0;a._lastFake=null;a._noFake=false;
        a._realFixN=0;a._realReviveN=0;
        a.mates={};
        a._look=null;a._fixGo=null;a.path=null;a.doing=0;a._doing=null;a.target=null;a._tgtPos=null;a._stalkPos=null;a._plan=null;a._planCD=0;
        return a.i;},
      /* 伪装抑制位（2026-11-03）：旧版门禁靠"把 _fakeN 设成本夜"来排除伪装分支，
         每夜硬上限取消后那个写法失效，改用显式开关。 */
      noFake:(i,on)=>{const a=G.agents[i];if(!a)return null;a._noFake=!!on;return a._noFake;},
      /* 认知层是懒初始化的，门禁要单测"服从/背书"这类依赖 mind 的分支时先确保它存在 */
      ensureMind:i=>{const a=G.agents[i];if(!a)return false;if(!a.mind)mindReset(a);return !!a.mind;},
      /* 伪装链路探针：只读地把**全部候选**重算一遍（观众 / 风险 / 收益 / LENS 的 lr），
         供门禁做方向断言（怀疑我的观众 > 路人的观众、红身时风险更高、有刀也照样能演）。
         返回的 kind/sc/risk 是分最高的那个候选。
         门禁里把 Math.random 钉成 0，站桩时长就固定在区间下限，分数可复现。 */
      /* ⚠ 2026-11-18：第二参数已无意义（观众不再按格数截断，只看视野 R5.3）。
         保留形参只为 `_t.disguise(i)` 这个门禁探针的签名不动（红线 5）。 */
      roomOut:()=>Object.assign({},G.roomOut||{}),
      gameMode:()=>GAME_MODE,
      setMode:m=>{GAME_MODE=(m==='trio')?'trio':'classic';return GAME_MODE;},
      fixNow:i=>{const a=G.agents[i];if(a){const d=(G.dmg||[]).find(x=>x.room&&G.roomOut&&G.roomOut[x.room]>0);if(d){a._fix=d;finishFix(a);}}},
      tickOut:dt=>roomOutTick(dt==null?0.1:dt),
      followSense:dt=>followSenseTick(dt==null?0.1:dt),
      tickDoors:dt=>doorTick(dt==null?0.1:dt),
      litOf:rid=>!!(G.lit&&G.lit[rid]),
      disguise:(i,rad)=>{const a=G.agents[i];if(!a)return null;
        const aud=alienAudienceInfo(a);
        let best=null;const optList=[];
        for(const spot of disguiseOptions(a)){
          const risk=SKSanity.disguiseRisk(disguiseRiskParts(a,aud,spot));
          const sc=SKSanity.disguiseScore({audience:aud.weight,duration:spot.dur,
            risk:risk,valueMul:spot.valueMul});
          optList.push({kind:spot.kind,room:spot.room,risk:+risk.toFixed(3),sc:+sc.toFixed(3),
            lr:+((SKSanity.LENS.lr(spot.credKey)||1)).toFixed(2),dist:+spot.dist.toFixed(2)});
          if(!best||sc>best.sc)best={kind:spot.kind,room:spot.room,risk:risk,sc:sc,
            dist:spot.dist,lr:(SKSanity.LENS.lr(spot.credKey)||1)};
        }
        return {aud:aud.n,weight:+aud.weight.toFixed(3),idle:aud.idle,susAud:aud.sus,
          infAud:aud.inf,kind:best?best.kind:null,room:best?best.room:null,
          dist:best?+best.dist.toFixed(2):null,lr:best?+best.lr.toFixed(2):null,
          risk:best?+best.risk.toFixed(3):0,sc:best?+best.sc.toFixed(3):0,
          opts:optList,minScore:SKSanity.DISGUISE.minScore,
          cd:+(a._fakeCD||0).toFixed(2),noFake:!!a._noFake,
          plan:a._plan?a._plan.id:null,doing:a._doing};},
      clearDrags:()=>{releaseAllDrags(true);return G.drag;},
      inspect:()=>G.inspect?G.inspect.agent.name:null,
      openBody:i=>openBodyCard(G.agents[i]),
      /* T1 探针：必须走真实关闭路径（closeBodyCard）才会触发相位补偿 */
      closeBody:()=>closeBodyCard(),
      /* T8 探针：直接播一句会议发言，用于验证"点名玩家"的行高亮 */
      sayLine:(who,text,kind)=>say(who,text,kind),
      openMeeting:(kind,r,v)=>openMeeting(kind||'night',
        r==null?G.me:G.agents[r],
        v==null?(G.agents.find(a=>bodyPos(a))||null):G.agents[v]),
      closeVote:()=>closeVote(),
      finishMeeting:()=>finishMeeting(),
      aiTick:(i,steps,dt)=>{const a=G.agents[i];if(!a)return null;
        for(let n=0;n<(steps||1);n++){doorTick(dt||0.05);aiHuman(a,dt||0.05);}
        return {tIdx:a.tIdx,doing:a.doing,do:a._doing,rest:a._rest,delay:a._delay,
          bullet:a.bullet,qual:a.qual,qualPending:a.qualPending||0,medkit:a.medkit,
          drag:a.drag,lightGo:!!a._lightGo};},
      aiTickAlien:(i,steps,dt)=>{const a=G.agents[i];if(!a)return null;
        for(let n=0;n<(steps||1);n++){doorTick(dt||0.05);aiAlien(a,dt||0.05);}
        return {doing:a.doing,do:a._doing,sab:a.sabUsed,x:a.x,y:a.y,
          bullet:a.bullet,knife:a.knife,drag:a.drag,hides:a._hides||0,
          secAvoid:a._secAvoidT||0,pipeSeeks:a._pipeSeeks||0};},
      aiGhostTick:(i,steps,dt)=>{const a=G.agents[i];if(!a)return null;
        for(let n=0;n<(steps||1);n++){doorTick(dt||0.05);aiGhost(a,dt||0.05);}
        return {doing:a.doing,do:a._doing,ghostPts:a.ghostPts||0,tIdx:a.tIdx};},
      aiInfo:i=>{const a=G.agents[i];if(!a)return null;
        return {tIdx:a.tIdx,doing:a.doing,do:a._doing,rest:a._rest,delay:a._delay,
          room:a.nRoom,task:a.nTask,seen:a.nSeen,accuse:a.accuse,lie:a._lie};},
      taskSpot:i=>{const a=G.agents[i];if(!a)return null;
        const p=M.points[a.tasks[a.tIdx]];if(!p)return null;
        const f=nearestFree(p.x,p.y);
        return {x:f[0],y:f[1],label:p.label,dur:p.dur};},
      startVote:()=>startVote(),
      chat:t=>{playerTalk(t);return (G.meet&&G.meet.lines||[]).length;},
      /* 门禁用（2026-11-18）：以某个席位的名义说一句话，返回是否真的进了事件流。
         用来断言「濒死 / 被拘留 / 已死的人不能发言」这道总闸（say 内部统一挡）。 */
      sayAs:(i,text)=>{const a=G.agents[i];if(!a)return false;
        const n0=(G.events||[]).length;
        say(a.name,text,true);
        return (G.events||[]).length>n0;},
      /* 门禁用（2026-11-18）：直接跑一次背书通道，返回真正排期出去的条数。
         用来断言"已指控某人后不再替他背书"（赞成/反对互斥）。 */
      endorseProbe:cands=>{let n=0;pushEndorse(fn=>{fn();n++;},cands||[]);return n;},
      meetLines:()=>G.meet?(G.meet.lines||[]):[],
      roomNames:()=>M.rooms.map(r=>r.name),
      rooms:()=>M.rooms.map(r=>{
        const c=nearestFree(r.rect[0]+r.rect[2]/2,r.rect[1]+r.rect[3]/2);
        return {id:r.id,name:r.name,x:c[0],y:c[1],area:r.area,cls:r.cls,doors:r.doors.map(d=>d.slice())};
      }),
      hideRoomFor:(rid,x,y)=>hideRoomFor(rid,x,y),
      points:()=>M.points.map(p=>{
        const f=nearestFree(p.x,p.y);
        return {x:p.x,y:p.y,room:p.room,label:p.label,kind:p.kind,
          dur:p.dur,
          d:Math.hypot(f[0]-p.x,f[1]-p.y),free:free(p.x,p.y)};
      }),
      meetCtx:()=>G.meet?{victim:G.meet.ctx.victimInfo,quick:G.meet.ctx.quick||null,
        claims:(G.meet.ctx.claims||[]).map(c=>({who:c.a.name,room:c.room})),
        /* 对质链路（2026-11-03）：谁质疑了谁、什么类型、针对哪个舱室。
           门禁靠它做**结构化**断言，不再拿台词字面去猜"有没有人对质"。 */
        challenge:G.meet.ctx.challenge?{...G.meet.ctx.challenge}:null,
        playerClaims:(G.meet.ctx.playerClaims||[]).map(c=>({target:c.target,kind:c.kind,room:c.room})),
        playerSupport:G.meet.ctx.playerSupport,
        frames:(G.meet.ctx.frames||[]).map(f=>({by:f.by,target:f.target,kind:f.kind,
          room:f.room,ownRoom:f.ownRoom,text:f.text,reaffirm:f.reaffirm||null,
          response:f.response||null,ally:f.ally==null?null:f.ally,allyText:f.allyText||null,
          co:(f.co||[]).slice(),
          caught:f.caught?{i:f.caught.i,text:f.caught.text,age:f.caught.age}:null})),
        aiCands:(G.meet.ctx.aiCands||[]).slice(),
        playerSays:(G.meet.ctx.playerSays||[]).map(s=>s.slots),
        playerAccuse:G.meet.ctx.playerAccuse,playerVote:G.meet.ctx.playerVote}:null,
      simGame:opts=>simGame(opts),
      parseSpeech:t=>parseSpeech(t),
      tplText:(kind,target,room,when)=>meetTemplateText(kind,target==null?null:G.agents[target],room,when),
      tplKinds:()=>MEET_TPL_KINDS.slice(),
      chatterPlan:()=>G.meet&&G.meet.plan?Object.assign({},G.meet.plan):null,
      /* 会议中改票（2026-11-05）：门禁只做结构化断言，不猜台词 */
      earlyVotes:()=>G.meet?(G.meet.earlyVotes||0):0,
      voteOf:i=>G.meet&&G.meet.votes?G.meet.votes[i]:null,
      voteMeta:()=>G.meet&&G.meet.voteMeta?JSON.parse(JSON.stringify(G.meet.voteMeta)):null,
      voteStory:()=>G.meet&&G.meet.voteStory?G.meet.voteStory.slice():[],
      testimonyLeft:()=>G.meet&&G.meet.ctx&&G.meet.ctx.testimony?
        G.meet.ctx.testimony.filter(x=>!x.said).length:0,
      deliverTestimony:id=>deliverTestimony(G.meet,id==null?null:id),
      leanOf:id=>{const a=G.agents[id];return a?voteLean(a):null;},
      /* accuseLineOf 在下面「发言系统」段有唯一一份定义；
         这里原来重复写了一遍同名键（对象字面量后写覆盖先写 = 死代码），已删。 */
      notice:(i,x,y,rad,kind,victim)=>noticeAction(G.agents[i],x,y,rad,kind,
        victim==null?null:G.agents[victim]),
      /* 正经行为广播的探针（2026-11-21）：门禁/调试直接驱动"做任务被看见"，
         不需要真跑一段任务计时。 */
      credBroadcast:(i,kind,x,y)=>credBroadcast(G.agents[i],kind,x,y),
      aiHear:(kind,x,y,rad,actor,victim)=>aiHear(kind,x,y,rad,{actor:actor==null?null:G.agents[actor],victim:victim==null?null:G.agents[victim]}),
      botShot:(i,kind)=>fireShotBot(G.agents[i],kind),
      /* 时间线拆谎（2026-11-01）：门禁直接调这两个核对量词，
         不需要绕会议；detain 是保安拘留的唯一目击入口。 */
      checkAlibi:(w,subj,claim,t0,t1,tRef)=>checkAlibi(w==null?null:G.agents[w],subj,claim,t0,t1,tRef),
      /* 推理引擎规范化（2026-11-01）：跨夜嫌疑 / 证言可信度 / 准-确证 / 熵 */
      susOf:(w,i,forNight)=>susOf(G.agents[w],i,forNight),
      /* 感知入口探针（2026-11-05 · 一组读心清零）：只读自己的记忆 / 世界状态 / 公开事件。
         返回 {score, conf, whyKind, cues}；cues 里每条都带 alt（同一线索的另一种解释）。 */
      envEstimate:(w,i)=>envEstimate(G.agents[w],i),
      audSusEstimate:(w,other)=>audSusEstimate(G.agents[w],G.agents[other]),
      /* 注意力三态：A 批（2026-11-05）所有「看见 X」的前置条件 */
      attention:w=>attention(G.agents[w]),
      pubAccusers:i=>pubAccusers(i).slice(),
      publicHeat:i=>publicHeat(i),
      reliaOf:(w,i)=>reliaOf(G.agents[w],i),
      identityPrior:i=>identityPrior(G.agents[i]),
      identityAxis:(i,t)=>identityAxis(G.agents[i],G.agents[t]),
      hostileProb:(i,t)=>hostileProb(G.agents[i],G.agents[t]),
      trustProb:(i,t)=>trustProb(G.agents[i],G.agents[t]),
      /* 2026-11-18 新增（只增不改，红线 5）：统一轴负端的可读出口。
         beliefOf = 嫌疑与"立场轴"取较强的一条，人类开枪/点名/投票兜底读的就是它；
         axisThreat = 其中只由 cred 负端贡献的那一半，门禁用它断言"带节奏确实进了敌对读数"。
         ⚠ 第二参数是**下标**不是 agent（与 susOf / credOf 同口径，别学 identityAxis 那对对象签名）。 */
      beliefOf:(i,t,night)=>beliefOf(G.agents[i],t,!!night),
      axisThreat:(i,t)=>axisThreat(G.agents[i],t),
      hostileWeight:(i,t)=>hostileWeight(G.agents[i],G.agents[t]),
      targetMul:(i,t)=>targetDistMul(hostileProb(G.agents[i],G.agents[t])),
      almostOf:i=>{const a=G.agents[i];return a&&a.mind?
        JSON.parse(JSON.stringify(a.mind.almost||{foe:{},friend:{}})):null;},
      evalAlmost:(w,i)=>{evalAlmost(G.agents[w],i==null?w:i);return true;},
      entropyOf:i=>{const a=G.agents[i];return a&&a.mind?
        SKSanity.beliefEntropy(a.mind.sus,a.i):0;},
      healSus:(w,i,v)=>{const a=G.agents[w];if(!a||!a.mind)return null;
        a.mind.sus[i]=v;a.mind.susNight=a.mind.susNight||{};a.mind.susNight[i]=G.night;
        /* 一切分数化：夹具清嫌疑 → T 归零到 −v（其余旧账归零）。
           v 是 0~1 视图量纲，T 存储是 ±10 分 ⇒ ×scale 换算。 */
        if(!a.mind.T)a.mind.T={};
        a.mind.T[i]=(G.priorT!=null?G.priorT:SKSanity.AXIS.priorPool*(10/13))-v*SKSanity.AXIS.cap;
        return v;},
      /* 会议中改票的用例需要"会前就有的信念"：这是门禁的写入口，不参与正常流程 */
      seedBelief:(i,o)=>{
        const a=G.agents[i]; if(!a)return false;
        o=o||{};
        if(!a.mind)mindReset(a);
        /* 一切分数化：夹具注入嫌疑/确证都落到 T（sus 旧账仍写一份供证据链读取） */
        if(o.sus){a.mind.sus=a.mind.sus||{};
          const p0=G.priorT!=null?G.priorT:SKSanity.AXIS.priorPool*(10/13);
          for(const k in o.sus){a.mind.sus[k]=o.sus[k];
            if(Math.abs(a.mind.T?.[k]||0)<SKSanity.AXIS.certFloor)
              a.mind.T[k]=p0-o.sus[k]*SKSanity.AXIS.cap;}}
        if(o.suspect!==undefined)a.suspect=o.suspect;
        if(o.known){a.mind.known=a.mind.known||{};
          for(const k in o.known){a.mind.known[k]=o.known[k];trustCert(a,+k,true);}}
        return true;
      },
      claimHistOf:i=>{const a=G.agents[i];return a&&a.mind?(a.mind.claimHist||[]).slice():[];},
      /* 门禁用：让 accI 指控 tgtI，跑一次「人类辩护」决策，看会不会有人开口。
         用来钉住「人类辩护不看阵营」——异形被指控时人类也可能替它说话。 */
      defendTry:(accI,tgtI)=>{
        const acc=G.agents[accI], tgt=G.agents[tgtI];
        if(!acc||!tgt)return null;
        acc.accuse=tgt.i;
        /* 候选池与真实流程一致：**排除玩家席位**（旁观模式除外） */
        const r=decideHumanDefend(G.agents.filter(a=>a.alive&&!a.downed&&
          (a!==G.me||G.spectMode)));
        if(!r)return null;
        defenseNote(r.by,r.target);     /* 与真实流程一致：辩护要进 defenseLog + 软联盟计数 */
        return {by:r.by.i,target:r.target.i,tgtAlien:!!tgt.alien};
      },
      defenseLog:()=>{const m=G.meet;return m&&m.defenseLog?
        JSON.parse(JSON.stringify(m.defenseLog)):{};},
      alibiOf:i=>alibiOf(G.agents[i]),
      crimeWindow:(v)=>crimeWindow(v==null?null:G.agents[v]),
      claimWindow:(when)=>claimWindow(when),
      alibiTimeWord:(age)=>SKSanity.alibiTimeWord(age),
      witnessDetain:(i,x,y,rad)=>witnessDetain(G.agents[i],x,y,rad),
      tele:()=>Object.assign({},(G&&G.simStats)||{}),
      fx:()=>G.fx.map(f=>f.type),
      acts:()=>G.agents.map(a=>a.act&&a.act.kind).filter(Boolean),
      roomName:id=>roomNameById(id),
      roomIdAt:(x,y)=>roomIdAt(x,y),
      assets:()=>{const b=IMG['base'],r=rtImg('base'),st=SKAssets.stats();
        const sd=st.sourceDim.base||{w:b?b.naturalWidth:0,h:b?b.naturalHeight:0};
        return {base:ready(b),hull:ready(IMG['hull']),
          w:sd.w,h:sd.h,
          hw:IMG['hull']?IMG['hull'].naturalWidth:0,hh:IMG['hull']?IMG['hull'].naturalHeight:0,
          rtW:r?(r.naturalWidth||r.width||0):0,rtH:r?(r.naturalHeight||r.height||0):0,
          texLimit:st.texLimit,retries:st.retries,failed:st.failed,fallback:st.fallback};},
      sfx:()=>SND.debug(),
      playSfx:name=>{const f=SND[name];if(typeof f!=='function')return false;f(1);return true;},
      pause:()=>{togglePause();return {paused:!!G.paused,ui:!document.getElementById('pause').classList.contains('hide')};},
      paused:()=>!!G.paused,
      breaker:()=>{pullBreaker();return {state:G.lightState,corr:G.corrLit};},
      /* 门禁用：指定「谁」去操作电闸（拉闸断电 / 合闸复电共用 pullBreaker） */
      breakerBy:i=>{pullBreaker(i==null?null:G.agents[i]);
        return {state:G.lightState,corr:G.corrLit,pulls:G.breakerPulls||0};},
      breakerPos:()=>{const f=M.facility.find(q=>q.kind==='breaker');
        return f?[f.x,f.y]:null;},
      lights:()=>({state:G.lightState,corr:G.corrLit,lit:Object.assign({},G.lit)}),
      visible:(x,y)=>visibleAt(x,y),
      litZone:(x,y)=>litZoneAt(x,y),
      events:()=>(G.events||[]).map(e=>Object.assign({},e)),
      frames:()=>(G.frames||[]).length,
      replay:()=>replayData(),
      aiSee:(i,x,y,maxD)=>{const a=G.agents[i];return a?aiCanSee(a,x,y,maxD):false;},
      spectTo:(x,y)=>{if(!G.spect)return null;G.spect.x=x;G.spect.y=y;G.spect.path=null;
        G.spect.moving=false;return [x,y];},
      spect:()=>({mode:!!G.spectMode,x:G.spect?G.spect.x:null,y:G.spect?G.spect.y:null,
        moving:!!(G.spect&&G.spect.moving),fog:!!G.fogOn,agents:G.agents.length,
        ctrlAlien:!!(G.me&&G.me.alien)}),
      /* 设计者纯净模式只读探针（2026-11-09）：门禁靠它断言"世界冻结 + 人物不绘制 +
         26 任务点 / 8 管道口全开放"。crewDrawn 是**本帧**画了几个角色，设计者局恒 0。 */
      design:()=>({mode:!!G.designMode,fog:!!G.fogOn,cam:G.camMode,night:G.night,t:G.t,phase:!!G.phase,
        agents:G.agents.length,crewDrawn:G.gfx.crewDrawn,points:M.points.length,
        pipes:M.pipes.length,openPoints:G.designMode?M.points.length:G.me.tasks.slice(G.me.tIdx).length,
        prog:G.prog,meet:!!G.meet,over:!!G.over,
        interactions:collectInteractions(G.me).map(o=>o.id)}),
      cams:()=>({open:!!G.camView,cut:G.lightState===2,room:inCamRoom(G.me),
        near:!!nearMonitor(G.me),feeds:M.rooms.length}),
      openCams:()=>openCams(),
      closeCams:()=>{closeCams(true);return !G.camView;},
      pipe:()=>({open:!!G.pipePick,from:G.pipePick?G.pipePick.from:null,
        fromRoom:G.pipePick?roomNameById(M.pipes[G.pipePick.from].room):null,
        opts:G.pipePick?pipeOpts(M.pipes[G.pipePick.from]).map(o=>({i:o.i,room:o.q.room,name:roomNameById(o.q.room)})):[]}),
      openPipe:()=>openPipePick(),
      pickPipe:i=>pickPipe(i),
      closePipe:()=>{closePipePick(true);return !G.pipePick;},
      pipes:()=>M.pipes.map((q,i)=>({i,x:q.x,y:q.y,room:q.room,name:roomNameById(q.room)})),
      sabSpot:rid=>sabSpot(rid),
      dmg:()=>G.dmg.map(d=>({room:d.room,x:d.x,y:d.y,label:d.label,left:d.left,dur:d.dur,by:d.by,pt:d.pt})),
      dmgTick:(dt)=>{dmgTick(dt==null?0.2:dt);return G.dmg.length;},
      damageRoom:(i,rid)=>damageRoom(G.agents[i],rid),
      sabTick:()=>{sabTick();return G.dmg.length;},
      nearDmg:(i,maxD)=>nearDmg(G.agents[i],maxD),
      startFix:(i,room)=>{
        const a=G.agents[i];
        const d=room?G.dmg.find(q=>q.room===room):nearDmg(a,9);
        return startFix(a,d||G.dmg[0]);
      },
      fixing:()=>G.agents.filter(a=>a._doing==='fix').map(a=>({i:a.i,t:a.doing,room:a._fix?a._fix.room:null})),
      openSab:()=>openSabPick(),
      sabPick:()=>G.sabPick?{open:true,rooms:G.sabPick.rooms.slice()}:{open:false,rooms:[]},
      pickSab:rid=>pickSabRoom(rid),
      closeSab:()=>{closeSabPick(true);return !G.sabPick;},
      sabTarget:()=>G.sabTarget?{room:G.sabTarget.room,x:G.sabTarget.x,y:G.sabTarget.y,
        label:G.sabTarget.label}:null,
      setTarget:rid=>{G.sabTarget=sabSpot(rid);return G.sabTarget?G.sabTarget.room:null;},
      sabotage:()=>{sabotage();return {open:!!G.sabPick,target:G.sabTarget?G.sabTarget.room:null,
        wheel:!!G.wheel,n:G.wheel?G.wheel.items.length:0,msg:G.msg};},
      interact:()=>{
        interact();
        let auto=null,n=0;
        if(G.wheel){n=G.wheel.items.length;auto=G.wheel.items[0].id;pickWheel(0);}
        return {doing:G.me.doing,do:G.me._doing,wheel:auto!=null,pick:auto,n};
      },
      wheel:()=>G.wheel?{n:G.wheel.items.length,items:G.wheel.items.map(it=>({id:it.id,label:it.short,pill:it.pill}))}:null,
      openWheel:()=>openWheel(collectInteractions(G.me)),
      mgAllowed:action=>!!(global.SKMiniGame&&STAND_ACT[action]&&!NO_MG_ACT[action]),
      pickWheel:i=>{const ok=pickWheel(i);return {ok,doing:G.me.doing,do:G.me._doing,wheel:!!G.wheel};},
      closeWheel:()=>{closeWheel(true);return !G.wheel;},
      supplies:()=>supplyPoints().map(q=>({kind:q.kind,item:q.item,x:q.x,y:q.y,label:q.label})),
      coverAudit:()=>coverAudit(),
      botLabel:kind=>{const f=M.facility.find(q=>q.kind===kind);
        return f?_ensureRender().botLabelText(f,kind==='secbot'?!!G.secbotDead:!!G.medbotDead):null;},
      robots:()=>({
        sec:{used:!!G.secbotUsed,uses:G.secbotUses||0,left:SEC_USES_MAX-(G.secbotUses||0),dead:!!G.secbotDead,t:G.secbotT||0,hp:botHp('secbot'),range:SEC_RANGE,arc:SEC_ARC},
        med:{used:!!G.medbotUsed,dead:!!G.medbotDead,t:G.medbotT||0,cd:G.medbotCD||0,
          left:G.medbotLeft==null?MEDBOT_CHARGES:G.medbotLeft,hp:botHp('medbot'),
          heal:MEDBOT_HEAL_TIME,cooldown:MEDBOT_COOLDOWN,touch:MEDBOT_TOUCH_R,target:G.medbotTarget==null?null:G.medbotTarget,
          home:medbotHome()}}),
      bots:()=>{
        const out={};
        for(const k of ['medbot','secbot']){
          const b=G.bots&&G.bots[k];
          const f=M.facility.find(q=>q.kind===k);
          out[k]=b?{x:b.x,y:b.y,wp:b.wp,face:b.face,ang:b.ang,moving:!!b.moving,
            healing:!!b.healing,home:b.home?[b.home[0],b.home[1]]:null,
            patrol:f&&f.patrol?f.patrol:[]}:null;
        }
        return out;
      },
      setBot:(kind,x,y,ang)=>{
        const b=G.bots&&G.bots[kind]; if(!b)return null;
        const p=nearestFree(x,y);
        b.x=p[0];b.y=p[1];b.moving=false;
        if(Number.isFinite(ang)){b.ang=ang;b.face=Math.cos(ang)<0?-1:1;}
        return[p[0],p[1]];
      },
      jail:()=>secJail(),
      botTick:(dt)=>{botTick(dt==null?0.2:dt);return {sec:G.secbotUsed,secUses:G.secbotUses||0,med:G.medbotUsed,
        medLeft:G.medbotLeft==null?MEDBOT_CHARGES:G.medbotLeft,
        detained:G.agents.filter(a=>a.detained&&a.alive).map(a=>({i:a.i,t:a.detainedT}))};},
      detained:()=>G.agents.filter(a=>a.detained&&a.alive).map(a=>({i:a.i,name:a.name,t:a.detainedT})),
      waves:()=>G.waves.map(w=>({kind:w.kind,x:w.x,y:w.y,life:w.t,dur:w.dur,str:w.str})),
      hear:(x,y,kind,str)=>{hear(x,y,kind,str);return G.waves.length;},
      sfxLog:()=>SND.log(),
      sfxClear:()=>SND.clearLog(),
      soundR:()=>Object.assign({},SKSanity.SOUND),
      taskDurs:()=>M.points.map(p=>({kind:p.kind,dur:p.dur})),
      lamps:()=>M.corridors.map(c=>corridorLampPos(c).length),
      tags:()=>G.agents.map(a=>tagName(a)),
      taskPlan:()=>G.agents.map(a=>a.tasks.map(ti=>({kind:M.points[ti].kind,room:M.points[ti].room,label:M.points[ti].label}))),
      finishDoing:i=>{finishDoing(G.agents[i]);return {msg:G.msg,prog:G.prog,tIdx:G.agents[i].tIdx};},
      aiScan:(i,dt)=>{const a=G.agents[i];aiScanBodies(a,dt);
        /* 主循环里"扫描 + 贴到报告距离"是连着跑的（aiScanBodies 只登记意图，
           迈步在 aiReportApproach）。探针只调前者的话，AI 永远走不到 2.4 格内，
           报告类夹具就会全部超时 —— 所以这里补上同一帧的迈步。 */
        aiReportApproach(a,dt);
        return {t:a._reportT,body:a._reportBody?a._reportBody.i:null,
          go:a._reportGo==null?null:a._reportGo,meet:!!G.meet};},
      astar:(sx,sy,tx,ty)=>astar(sx,sy,tx,ty),
      free:(x,y)=>free(x,y),
      stepTo:(x,y)=>{G.me.path=[[x,y]];stepMove(G.me,5,20);return [G.me.x,G.me.y];},
      fog:()=>!!G.fogOn,
      pos:()=>[G.me.x,G.me.y],
      speed:()=>MOVE_SPEED,
      dragSpeed:()=>DRAG_SPEED,
      /* 击杀加速（2026-11-03）：speedOf 读某个席位的**实际**速度（拖尸 > 加速 > 基础）。
         rush/setRush 用来做解耦断言 —— 红身与加速各自归零，谁也不许从对方推导。 */
      speedOf:i=>{const a=G.agents[i];return a?+moveSpeed(a).toFixed(3):null;},
      rushCfg:()=>Object.assign({},SKSanity.RUSH),
      redBodyCfg:()=>Object.assign({},SKSanity.RED_BODY),
      voteThreshold:()=>voteThreshold(),
      lensCalls:()=>SKSanity.LENS._calls||0,
      lensRank:keys=>SKSanity.LENS.rankedLr(keys),
      lensOrder:keys=>SKSanity.LENS.order(keys),
      alibiReach:(d,dt,v)=>SKSanity.alibiReach(d,dt,v),
      counterfactualReach:(a,b,dt)=>_ensureMeeting().counterfactualReach(a,b,dt),
      roomCenter:id=>{const r=M.rooms.find(q=>q.id===id);return r&&r.rect?
        [r.rect[0]+r.rect[2]/2,r.rect[1]+r.rect[3]/2]:null;},
      topSusOf:(i,min)=>{const a=G.agents[i];return a?topSus(a,min):null;},
      hypsOf:i=>{const a=G.agents[i];return a?hypotheses(a,3):null;},
      hypSpreadOf:i=>{const a=G.agents[i];return a?hypothesisSpread(a):null;},
      refreshHyps:i=>{const a=G.agents[i];return a?SKT2AI.refreshHyps(a):null;},
      voteLeanOf:i=>{const a=G.agents[i];return a?voteLean(a):null;},
      simDiscuss:()=>{const m=G.meet;if(!m)return null;
        return {lines:(m.lines||[]).length,vouches:(m.ctx&&m.ctx.vouches||[]).length,
          talkN:G.agents.map(a=>a.talkN||0)};},
      attentionOf:i=>attention(G.agents[i]),
      setSimNoDiscuss:v=>{SIM_NO_DISCUSS=!!v;return SIM_NO_DISCUSS;},
      /* 社交顺势的 A/B 开关（2026-11-06）：只改本次运行的 SKSanity.SOCIAL，
         不写回磁盘真源。pile=0 即完全回到"各投各的"旧行为，用于归因。 */
      /* 传闻补种类的 A/B 开关（2026-11-06）：0 = 回到"传闻一律不算证据"。 */
      /* 目击认错的 A/B 开关（2026-11-07）：0 = 回到「目击 100% 准」。 */
      setMisId:p=>{const v=Math.max(0,Math.min(1,+p));SKSanity.MISID.base=v;SKSanity.MISID.perExtra=0;return v;},
      misIdCfg:()=>Object.assign({},SKSanity.MISID),
      /* 2026-11-20：人类自动开枪门槛系数（A/B 用）。默认 0.8 = 既有口径；
         只允许 0.1~2，避免 A/B 时误传 0 把人类变成不开枪。 */
      setShootK:p=>{SHOOT_K=Math.max(0.1,Math.min(2,+p||0.8));return SHOOT_K;},
      shootKCfg:()=>SHOOT_K,
      /* 2026-11-07 新增：描述准确率 / 协同诬陷 / 诬陷真源 / 异形幽灵破坏的运行时读数与 A/B 开关 */
      setDesc:o=>{const D=SKSanity.DESC;if(o&&typeof o==='object'){
        if(o.on!=null)D.on=!!o.on;if(o.roomErr!=null)D.roomErr=+o.roomErr;
        if(o.kindErr!=null)D.kindErr=+o.kindErr;if(o.confLoss!=null)D.confLoss=+o.confLoss;
      }return Object.assign({},D);},
      descCfg:()=>Object.assign({},SKSanity.DESC),
      coFrameCfg:()=>Object.assign({},SKSanity.COFRAME),
      /* 2026-11-08 第 3 批：先发制人 / 注意力上限 的读数与开关 */
      firstCfg:()=>Object.assign({},SKSanity.FIRST),
      attnCfg:()=>Object.assign({},SKSanity.ATTN),
      setFirst:o=>{const F=SKSanity.FIRST;if(o&&typeof o==='object'){
        if(o.chance!=null)F.chance=+o.chance;
        if(o.firstLine!=null)F.firstLine=+o.firstLine;
        if(o.wgt!=null)F.wgt=+o.wgt;
        if(o.leadMul!=null)F.leadMul=+o.leadMul;
      }return Object.assign({},F);},
      setAttn:o=>{const A=SKSanity.ATTN;if(o&&typeof o==='object'){
        if(o.heardMax!=null)A.heardMax=Math.max(0,+o.heardMax|0);
      }return Object.assign({},A);},
      openingState:()=>({op:G.meet&&G.meet.ctx&&G.meet.ctx.opening?
        {by:G.meet.ctx.opening.by?G.meet.ctx.opening.by.i:null,
         target:G.meet.ctx.opening.target,
         allies:(G.meet.ctx.opening.allies||[]).map(x=>x.i)}:null,
        firstAccuses:G.firstAccuseN||0,
        openingHeard:G.openingHeardN||0}),
      heardOf:i=>{const a=G.agents[i];return a&&a.mind?(a.mind.heard||[]).slice():[];},
      attnState:()=>({max:SKSanity.ATTN.heardMax,
        dropped:G.heardDroppedN||0,
        overflow:G.heardOverflowN||0}),
      caughtLies:()=>G.caughtLieN||0,
      kindByFaction:()=>Object.assign({},G.kindByFaction||{}),
      /* 2026-11-08 发言系统：配额读数与配置 */
      speechCfg:()=>Object.assign({},SKSanity.SPEECH),
      /* 2026-11-08：人类完整证言 —— 门禁直接读一条指控句，断四要素 */
      accuseLineOf:i=>{const a=G.agents[i];return a?accuseLine(a,G.meet):null;},
      /* R13.10 自述词序探针：不依赖会议上下文也能取一句自述（门禁按**第一句**断词序）。 */
      alibiLineOf:(i,kind)=>{const a=G.agents[i];
        return a?alibiLine(a,{kind:kind||'day',ctx:{victimInfo:null,claims:[]}}):'';},
      /* 批量跑 n 局模拟并收集全部台词（含阵营），用于统计"证言四要素齐全率"。
         只有这个入口会打开 __recLines，正常对局与 1000 局蒙特卡洛不记录。 */
      simSpeechBatch:n=>{
        const out=[];
        const N=Math.max(1,Math.min(200,n|0));
        for(let k=0;k<N;k++){
          global.__recLines=[];
          const r=simGame({seed:20261108+k,dt:0.1,maxNights:15});
          for(const l of global.__recLines){
            out.push(l);
          }
          out.push({sep:1,firstAccuses:r.firstAccuses||0,alienMuted:r.alienMuted||0,
            speechAlien:r.speechAlien||0,speechHuman:r.speechHuman||0});
        }
        global.__recLines=null;
        return out;
      },
      speechState:()=>({
        alienSaid:(G.meet&&G.meet.alienSaid)||0,
        cap:SKSanity.SPEECH.alienLineCap,
        muted:G.alienMutedN||0,
        lines:(G.meet&&G.meet.lines)?G.meet.lines.length:0,
        newBadge:(()=>{const b=document.getElementById('m-new');
          return b?(b.classList.contains('on')?(+b.dataset.n||0):-1):null;})(),
      }),
      frameCfg:()=>Object.assign({},SKSanity.FRAME),
      misleadCfg:()=>Object.assign({},SKSanity.MISLEAD),
      ghostSabState:()=>({used:!!G.alienGhostSabUsed,dmg:G.dmg.length,
        count:(G.simStats&&G.simStats.ghostSabotages)||0,over:!!G.over}),
      /* 认错目标采样（门禁用）：直接给候选池规则一个确定的入口 */
      misIdPick:(w,i,x,y,r)=>{const a=G.agents[w];const o=(a&&misIdPick(a,i,x,y,r))||null;
        return o?o.i:null;},
      actionMisIdPick:(w,i,x,y)=>{const a=G.agents[w];const o=(a&&actionMisIdPick(a,i,x,y))||null;
        return o?o.i:null;},
      actionMisCfg:()=>Object.assign({},SKSanity.MISID.action),
      setHeardKinds:n=>{SKSanity.ALMOST.heardKinds=Math.max(0,Math.min(3,+n));return SKSanity.ALMOST.heardKinds;},
      almostCfg:()=>Object.assign({},SKSanity.ALMOST),
      setSocial:(pile,frame)=>{
        const S=SKSanity.SOCIAL;
        S.pileOn=Math.max(0,Math.min(0.98,+pile));
        S.frameFollow=Math.max(0,Math.min(1,frame==null?+pile:+frame));
        return {pileOn:S.pileOn,frameFollow:S.frameFollow};
      },
      socialCfg:()=>Object.assign({},SKSanity.SOCIAL),
      /* 只读探针：按当前局面重算一遍异形会踩谁（不写状态、不掷票）。 */
      alienSocialTarget:i=>{
        const a=G.agents[i];
        if(!a)return null;
        const pool=G.agents.filter(x=>x!==a&&x.alive&&!x.downed&&!isMate(a,x.i));
        return alienSocialPick(a,pool);
      },
      /* 只读探针：顺势构陷会挑谁（同上，不写状态）。 */
      alienFrameTarget:i=>{
        const a=G.agents[i];
        if(!a)return null;
        const pool=G.agents.filter(x=>x!==a&&x.alive&&!x.downed&&!isMate(a,x.i));
        const f=alienFrameTarget(a,pool);
        return {i:f.t?f.t.i:null,why:f.why,heat:f.heat||0};
      },
      setHypGap:v=>{SKSanity.MIND.hypGap=+v;return SKSanity.MIND.hypGap;},
      hypEvidenceOf:(w,i)=>SKT2AI.hypothesisEvidence(G.agents[w],i),
      /* A/B 归因：loose 还原 2026-11-06 之前的宽松判据，off 彻底关闭弃权。
         只作用于本次运行（改 SKSanity 表），不写回磁盘真源。 */
      setHypMode:m=>{
        const M=SKSanity.MIND;
        if(m==='loose'){
          M.hypGap=0.12;M.hypMinTop=0.25;M.hypMinEvidence=0;
          M.hypRequireDirect=0;M.hypRequireIndependent=0;
        }else if(m==='tight'){
          M.hypGap=0.08;M.hypMinTop=0.34;M.hypMinEvidence=2;
          M.hypRequireDirect=1;M.hypRequireIndependent=1;
        }else if(m==='off'){M.hypGap=-1;}
        return {mode:m,gap:M.hypGap,minTop:M.hypMinTop,
          minEvidence:M.hypMinEvidence,direct:M.hypRequireDirect,
          independent:M.hypRequireIndependent};},
      witnessCtxMul:(x,y,n)=>witnessCtxMul(x,y,n),
      setLightState:v=>{G.lightState=v;return G.lightState;},
      memKindsOf:i=>{const a=G.agents[i];return a&&a.mind?
        (a.mind.mem||[]).map(e=>e.kind):[];},
      /* 门禁专用：在当前会议上，用模拟口径（push 立即执行）跑一遍 startChatter，
         验证 2026-11-06 的模拟保真度修复。只读计数，跑完恢复 simMode/simStats。 */
      simChatterProbe:()=>{
        const m=G.meet;if(!m)return null;
        const oldMode=G.simMode,oldStats=G.simStats;
        G.simMode=true;G.simStats={};
        const lines0=(m.lines||[]).length;
        const talk0=G.agents.reduce((s,a)=>s+(a.talkN||0),0);
        stopChatter();
        try{startChatter(m);}catch(e){G.simMode=oldMode;G.simStats=oldStats;return {err:String(e)};}
        const out={lines:(m.lines||[]).length-lines0,
          talkDelta:G.agents.reduce((s,a)=>s+(a.talkN||0),0)-talk0,
          discussLines:G.simStats.discussLines||0,
          planN:m.plan?m.plan.n:null,
          vouches:(m.ctx&&m.ctx.vouches||[]).length,
          vouchHeard:G.simStats.vouchHeard||0};
        G.simMode=oldMode;G.simStats=oldStats;
        return out;},
      /* 门禁专用：强制一名 AI 当众背书，验证 heard_vouch 通道与 vouches 登记。 */
      forceEndorse:(by,tgt)=>{
        const x=G.agents[by],subj=G.agents[tgt];if(!x||!subj)return null;
        x.mind.cred=x.mind.cred||{};x.mind.cred[tgt]=0.95;
        const mm=G.meet&&G.meet.ctx;
        const v0=mm?(mm.vouches||[]).length:0;
        const h0=G.agents.filter(w=>w!==x&&(w.mind&&w.mind.mem||[])
          .some(e=>e.kind==='heard_vouch')).length;
        pushEndorse(fn=>fn(),[x]);
        return {vouches:(mm?(mm.vouches||[]).length:0)-v0,
          heardDelta:G.agents.filter(w=>w!==x&&(w.mind&&w.mind.mem||[])
            .some(e=>e.kind==='heard_vouch')).length-h0,
          top:topCred(x)?topCred(x).i:null};},
      talkNOf:i=>{const a=G.agents[i];return a?(a.talkN||0):null;},
      setTalkN:(i,v)=>{const a=G.agents[i];if(!a)return null;a.talkN=v;return a.talkN;},
      sequenceCueOf:(w,i)=>sequenceCue(G.agents[w],i),
      statementRelationOf:tgt=>statementRelation(
        (G.meet&&G.meet.ctx&&G.meet.ctx.testimony)||[],
        (G.meet&&G.meet.ctx&&G.meet.ctx.vouches)||[],tgt),
      vouches:()=>G.meet&&G.meet.ctx?(G.meet.ctx.vouches||[]).slice():[],
      disguiseOrder:i=>{const a=G.agents[i];if(!a)return null;
        const L=SKSanity.LENS;
        return disguiseOptions(a).map(o=>({credKey:o.credKey,hot:o.hot||0,lr:L.lr(o.credKey)}));},
      ghostCap:()=>GHOST_TASK_CAP,
      medbotStun:()=>global.SKBots.CONST.MEDBOT_REVIVE_STUN,
      stunOf:i=>{const a=G.agents[i];return a?+((a.stunT||0)).toFixed(2):null;},
      setStun:(i,v)=>{const a=G.agents[i];if(!a)return null;a.stunT=v;return +a.stunT.toFixed(2);},
      sightCfg:()=>Object.assign({},SKSanity.SIGHT),
      /* 终结者时刻：状态只读 + 手动触发一次检查（门禁把 G.night 推到阈值再调它，
         不用真跑十夜）。 */
      terminator:()=>({on:!!G.terminator,revealAll:!!G.revealAll,night:G.night,
        cfg:Object.assign({},SKSanity.TERMINATOR),
        bullets:G.agents.map(a=>a.bullet|0)}),
      checkTerminator:()=>checkTerminator(),
      meetCfg:()=>Object.assign({},SKSanity.MEET),
      rushT:i=>{const a=G.agents[i];return a?+a.rushT.toFixed(2):null;},
      setRush:(i,v)=>{const a=G.agents[i];if(!a)return null;a.rushT=v;return +a.rushT.toFixed(2);},
      secRange:()=>SEC_RANGE,
      qualDesk:()=>{const q=roundTableClaimSpot();return q?{x:q.x,y:q.y,label:q.label}:null;},
      doors:()=>G.doors.map(d=>({id:d.id,x:d.x,y:d.y,horiz:d.horiz,
        open:Math.round(d.open*100)/100,target:d.target,
        scanT:+Math.max(0,Math.min(DOOR_SCAN_TIME,d.scanT||0)).toFixed(2),
        scanning:doorScanRule(d)&&!(G.terminator&&!/:bridge$/.test(d.id))&&(d.scanT||0)>0&&(d.scanT||0)<DOOR_SCAN_TIME,
        locked:doorScanRule(d)&&!(G.terminator&&!/:bridge$/.test(d.id))&&(d.scanT||0)<DOOR_SCAN_TIME})),
      doorBlock:(x1,y1,x2,y2)=>doorBlockedSegment(x1,y1,x2,y2),
      doorTick:dt=>{doorTick(dt==null?0.2:dt);return G.doors.map(d=>({
        id:d.id,open:Math.round(d.open*100)/100,target:d.target}));},
      setDoor:(id,open)=>{const d=G.doors.find(q=>q.id===id);if(!d)return null;
        d.open=d.target=Math.max(0,Math.min(1,+open||0));
        return {id:d.id,open:d.open,target:d.target};},
      los:(x1,y1,x2,y2)=>losNow(x1,y1,x2,y2),
      stepOnce:(dt,sp)=>{stepMove(G.me,dt==null?0.2:dt,sp||moveSpeed(G.me));return [G.me.x,G.me.y];},
      walkAgent:(i,steps,dt)=>{
        const a=G.agents[i];if(!a)return null;
        for(let n=0;n<(steps||1);n++){
          doorTick(dt||0.05);
          if(!a.path||!a.path.length)break;
          stepMove(a,dt||0.05,moveSpeed(a));
        }
        return {x:a.x,y:a.y,left:a.path?a.path.length:0,stuck:a._stuckT||0};
      },
      state:()=>G.agents.map(a=>({i:a.i,name:a.name,alien:a.alien,alive:a.alive,ghost:a.ghost,
        qual:a.qual,qualPending:a.qualPending||0,
        downed:a.downed,detained:!!a.detained,detainedT:a.detainedT||0,body:bodyPos(a),cause:a.deathCause,ghostPts:a.ghostPts||0,
        bullet:a.bullet|0,medkit:a.medkit|0,
        wound:a.alive?(a.woundCause||null):(a.deathCause||null),searched:!!a.searched,
        downRoom:a.downRoom||null,
        room:roomIdAt(a.x,a.y),draggedBy:a.draggedBy,bodyMoved:a.bodyMoved,drag:a.drag,
        redT:+(a.redT||0).toFixed(2),hides:a._hides||0,
        deathRoom:a.deathRoom,killedBy:a.killedBy})),
      /* P0 影子探针（2026-11-19）：只读派生 T/E，不改任何决策。
         用法：_t.trustShadow(观察者席, 目标席) → {T,h,hOld,E,locked,sus,cred} */
      trustShadow:(o,i)=>{const a=G.agents[o];return (global.SKTrust&&a)?SKTrust.impression(a,i):null;},
      bodyInfo:i=>bodyInfo(G.agents[i]),
      mind:i=>{const a=G.agents[i];if(!a||!a.mind)return null;
        /* 2026-11-20「一切分数化」：旧字段是 T/E 的兼容读出视图，不再是独立账本。
           门禁断言照旧读 sus/cred/trust/grudge/reliability，但底层只有 T/E 两本账。 */
        const TV=a.mind.T||{}, EV=a.mind.E||{};
        const credView={},susView={},trustView={},grudgeView={},reliaView={};
        const ids=new Set([...Object.keys(TV),...Object.keys(a.mind.sus||{}),
          ...Object.keys(a.mind.cred||{}),...Object.keys(EV),...Object.keys(a.mind.reliability||{})]);
        const prior=(G.priorT!=null)?G.priorT:SKSanity.AXIS.priorPool*(10/13);
        for(const k of ids){
          const raw=TV[k]||0, E=EV[k]||0;
          /* 2026-11-21 用户第三批裁定（0~200 分制）：
             sus 视图 = (prior − T)/200（相对先验的信任跌落，硬确证 −999 → 1）；
             cred 视图 = (T − prior)/200（信任盈余，200 封顶 → 1）；确证态单侧拉满。 */
          const isCert=Math.abs(raw)>=SKSanity.AXIS.certFloor;
          if(isCert){ if(raw<0){susView[k]=1;credView[k]=0;}
                      else {credView[k]=1;susView[k]=0;} }
          else{
            const dv=(prior-raw)/SKSanity.AXIS.cap;
            if(dv>0)susView[k]=+dv.toFixed(3);
            else credView[k]=+(-dv).toFixed(3);
          }
          if(E>0)trustView[k]=E/100;else if(E<0)grudgeView[k]=-E/100;
          reliaView[k]=Math.max(SKSanity.RELIA.min,Math.min(SKSanity.RELIA.max,
            SKSanity.RELIA.base+(raw-prior)/SKSanity.AXIS.cap*0.5));
        }
        return {mem:a.mind.mem.slice(-24),sus:susView,
          why:JSON.parse(JSON.stringify(a.mind.why)),alert:a.mind.alert,noise:a.mind.noise,
          seenBy:Object.assign({},a.mind.seenBy),
          known:JSON.parse(JSON.stringify(a.mind.known||{})),
          alibi:JSON.parse(JSON.stringify(a.mind.alibi||{})),
          humanT:Object.assign({},a.mind.humanT||{}),
          cred:credView,
          credWhy:JSON.parse(JSON.stringify(a.mind.credWhy||{})),
          reliability:reliaView,
          almost:JSON.parse(JSON.stringify(a.mind.almost||{foe:{},friend:{}})),
          claimHist:(a.mind.claimHist||[]).map(c=>({night:c.night,room:c.room})),
          susNight:Object.assign({},a.mind.susNight||{}),
          ally:Object.assign({},a.mind.ally||{}),
          entropy:a._entropy,
          mates:Object.assign({},a.mates||{}),
          redSeen:Object.assign({},a.mind.redSeen||{}),
          grudge:grudgeView,
          trust:trustView,
          T:Object.assign({},TV),E:Object.assign({},EV)};},
      /* 门禁用：立刻跑一轮感知（正常由 update 每 0.4 秒调用） */
      track:()=>{for(const a of G.agents)if(a.alive&&(!a.downed||a.draggedBy!=null))trackNight(a);return true;},
      /* 异形现在锁的是谁（取消全图锁敌后，门禁要能看见"候选池空了"这个状态） */
      targetOf:i=>{const a=G.agents[i];return a&&a.target?a.target.i:null;},
      knownOf:i=>{const a=G.agents[i];if(!a||!a.mind)return null;
        return JSON.parse(JSON.stringify(a.mind.known||{}));},
      aiReportUsed:()=>!!G.aiReportUsed,
      invHist:()=>G.inv
    };
    
    Object.assign(global.SKV3,{
      setSfxVolume:v=>SND.setMaster(v),
      getSfxVolume:()=>SND.getMaster(),
      setFpsEnabled:v=>{ FPS.on=!!v; try{localStorage.setItem('sk_fps',FPS.on?'1':'0');}catch(_){} const e=fpsHud(); if(e)e.style.display=FPS.on?'block':'none'; },
      getFpsEnabled:()=>!!FPS.on,
      setSpectDev:v=>{ if(G){ G.spectDev=!!v; syncDevUi(); } },
      getSpectDev:()=>G?G.spectDev!==false:true,
      togglePauseGame:()=>{ if(G&&!G.over&&!G.meet&&!G.inspect) togglePause(); },
      isPaused:()=>!!(G&&G.paused),
      playSfx:n=>{ const f=SND[n]; if(typeof f==='function'){try{f(0.8);}catch(e){}} }
    });
    resize();newGame();syncHud();G.aimX=G.me.x+1;G.aimY=G.me.y;
    rafId=requestAnimationFrame(loop);
    return function(){
      DEAD=true;
      cancelAnimationFrame(rafId);
      clearMeetingTimer();
      stopChatter();
      if(FPS.el&&FPS.el.parentNode)FPS.el.parentNode.removeChild(FPS.el);
      FPS.el=null;
    };
  }


  /* 开始页入口：把 #btn-v3 绑到 start()（不新开页面） */
  function bindEntry(){
    var b=document.getElementById('btn-v3');
    if(b && !b.__v3bound){
      b.__v3bound=1;
      b.addEventListener('click', function(e){ e.preventDefault(); start(); });
    }
  }
  bindEntry();
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded', bindEntry);

  global.SKV3 = { start: start, stop: stop, isOpen: function () { return booted; } };
})(window);
