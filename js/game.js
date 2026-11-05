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
        botDead=SKT2Space.botDead, botHp=SKT2Space.botHp, ready=SKT2Space.ready,
        corridorLampPos=SKT2Space.corridorLampPos, corrJoinsRoom=SKT2Space.corrJoinsRoom,
        pipeTint=SKT2Space.pipeTint, rowForAng=SKT2Space.rowForAng,
        dirAng=SKT2Space.dirAng, workStyle=SKT2Space.workStyle, k1=SKT2Space.k1;
  const stopChatter=SKT2Decision.stopChatter, meetLater=SKT2Decision.meetLater,
        sayStreakOK=SKT2Decision.sayStreakOK;
  const evNow=SKT2AI.evNow, keepSusNight=SKT2AI.keepSusNight, keepCredWhy=SKT2AI.keepCredWhy, keepRelia=SKT2AI.keepRelia, credOf=SKT2AI.credOf, mindReset=SKT2AI.mindReset, evPush=SKT2AI.evPush, susAdd=SKT2AI.susAdd,
        evalAlmost=SKT2AI.evalAlmost, susCut=SKT2AI.susCut, checkAlibi=SKT2AI.checkAlibi, claimWindow=SKT2AI.claimWindow, susAddContradiction=SKT2AI.susAddContradiction, oldQuantifierWouldFire=SKT2AI.oldQuantifierWouldFire, knownOverride=SKT2AI.knownOverride, liveTarget=SKT2AI.liveTarget,
        bestSusTarget=SKT2AI.bestSusTarget, almostFoeOf=SKT2AI.almostFoeOf, almostFriendOf=SKT2AI.almostFriendOf, bestAlmostTarget=SKT2AI.bestAlmostTarget, bestKnownTarget=SKT2AI.bestKnownTarget, evidenceReason=SKT2AI.evidenceReason, affordableAlmostShot=SKT2AI.affordableAlmostShot,
        /* 感知入口（2026-11-05 · 一组读心清零）：只读自己的记忆 / 世界状态 / 公开事件 */
        envEstimate=SKT2AI.envEstimate, audSusEstimate=SKT2AI.audSusEstimate,
        pubAccusers=SKT2AI.pubAccusers, pubSolidAccusers=SKT2AI.pubSolidAccusers,
        publicHeat=SKT2AI.publicHeat, publicInfluence=SKT2AI.publicInfluence;

  const CSS = global.SKUITemplates.CSS;
  const HTML = global.SKUITemplates.HTML;

  const MAP = global.SKMapData;

  let booted = false;
  let shutdown = null;

  let ROLE_WANT = 'human';
  /* 开始页传来的本局名单（玩家名 + 14 个 AI 名）。null = 用默认 15 名。 */
  let ROLE_ROSTER = null;
  function start(role, roster) {
    if (booted) return;
    ROLE_WANT = (role === 'alien') ? 'alien' : (role === 'spect' ? 'spect' : 'human');
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

  function boot() {
    'use strict';
    /* 夜晚时长：120 → 100 → 90 → **75 秒**（2026-11-02 节奏批）。
       会议不再从夜晚时间里扣（会议期间夜里时钟暂停），而且每夜最多 2 场会议，
       所以这 75 秒是**纯干活时间** —— 一次任务 12 秒站桩 + 走过去，
       一个夜大概够做完 2~3 个任务。
       2026-11-03：数值搬到 SKSanity.NIGHT.len（**没改数**），蒙特卡洛报告要从纯模块读配置。 */
    const M=MAP, NIGHT=SKSanity.NIGHT.len;
    let SIM_RUN=false;   /* 批量模拟：跳过渲染/HUD/音效/自动不变量，只跑对局逻辑 */
    const TEST=/[?&]test\b/.test(location.search);
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
    /* 门禁探针：只影响**下一次** newGame（席位 / 名单），用完即清，不污染后续夹具。 */
    let SEAT_FORCE=null, ROSTER_FORCE=null;
    /* 医疗无人机每夜充电次数（每救 1 人扣 1 次）：只在这里改 */
    const MEDBOT_CHARGES=2;
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
      clearInterval(meetingTick);
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
      const aliens=new Set();
      if(ROLE_WANT==='alien'&&meIdx>=0)aliens.add(meIdx);
      if(ROLE_WANT==='spect'){
        while(aliens.size<4)aliens.add(1+Math.floor(Math.random()*14));
      }else{
        const avoid=ROLE_WANT==='human'?meIdx:-1;
        while(aliens.size<4){
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
        knife:1,think:0,target:null,
        /* 幽灵 / 尸体 / 拖拽 / 搜查 */
        ghost:false,ghostPts:0,deathCause:null,deathAt:0,deathRoom:null,deathX:null,deathY:null,
        killedBy:null,bodyX:null,bodyY:null,bodyGone:false,bodyMoved:false,
        downX:null,downY:null,downRoom:null,woundCause:null,draggedBy:null,searched:false,
        drag:null,redT:0,rushT:0,_dragSnd:0,_dragAiT:0,_hideSpot:null,_hideRoom:null,_hideCD:0,_hides:0,
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
        _taskPt:null,_reportT:0,_sawBody:null,
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
      G={agents,me,leader,leaderCharisma,night:1,t:NIGHT,prog:0,over:null,overWhy:'',meet:null,
         /* pointDone：任务点 → 最近一次被完成的模拟时刻。异形"假装做任务"要避开
            已经被人做过的点（重复劳动本身就是破绽，见 SKSanity.DISGUISE.risk.donePoint）。 */
         pointDone:{}, terminator:false, revealAll:false,
         /* 本局台词去重（pickLine 用）：键是模板，值是说过几次 */
         lineUsed:{},
         lit:{},blackout:false,vis:null,fogOn:true,camMode:'follow',fx:[],waves:[],clickFx:null,lightState:0,
         corrLit:true,paused:false,pauseAt:0,taskKey:'',camView:false,pipePick:null,powerFixed:false,
         secbotUsed:false,secbotUses:0,secbotDead:false,medbotUsed:false,medbotDead:false,medbotT:0,secbotT:0,
         medbotTarget:null,
         medbotLeft:MEDBOT_CHARGES,botHp:{secbot:2,medbot:1},secCatch:null,
         bots:null,jailPos:null,
        /* 本夜已成功拉断电闸的次数（决定下一次拉闸要站多久：3/6/9/9…），每夜重置 */
        breakerPulls:0,
         dmg:[],sabPick:null,sabTarget:null,aiReportUsed:false,evSeq:0,
        /* 本夜已开的夜晚会议场数（上限见 SKSanity.MEET.perNight） */
        nightMeets:0,
         drag:null,inspect:null,wheel:null,dev:keepDev,gfx:{coverFlashes:0,dashedBorders:0},
         spectMode:(ROLE_WANT==='spect'),spect:null,
         events:[],frames:[],playT:0,_frameAcc:0,
        /* 局内统计（2026-10-31）：医疗无人机救治 / 医疗包施救 / 幽灵任务 / 幽灵修故障。
           只累加、不参与任何判定，供结束页与复盘报告读取。 */
        stats:{medbotRevives:0,medkitRevives:0,ghostTasks:0,ghostFixes:0},
         inv:{runs:0,checks:0,fails:[],warned:{},lastTag:''},invT:0,devT:0};
      G.aimX=me.x+1; G.aimY=me.y;
      logEvent('game_start',{night:1});
      recordFrame();
      if(G.spectMode){
        /* 第 16 人旁观者：不在 15 个席位里，只是一台高速全知的幽灵相机 */
        const p=randIn(br);
        G.spect={x:p[0],y:p[1],path:null,moving:false,dir:'down'};
        G.fogOn=false;
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
      syncDevUi();
      runInvariants('newGame');
      if(TEST){
        G.t=NIGHT;
        G.phase=SKClock.newPhase('night',performance.now(),NIGHT*1000);
      }else setTimeout(()=>openMeeting('pre',null,null),60);
      /* 门禁探针是一次性的：无论正常开局还是探针，下一局都回到默认口径。 */
      SEAT_FORCE=null; ROSTER_FORCE=null;
    }
    function shuffle(a){for(let i=a.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[a[i],a[j]]=[a[j],a[i]];}return a;}
    function randIn(r){
      for(let k=0;k<200;k++){
        const p=r.poly[Math.floor(Math.random()*r.poly.length)];
        const x=r.rect[0]+Math.random()*r.rect[2],y=r.rect[1]+Math.random()*r.rect[3];
        if(free(x,y)&&inPoly(x,y,r.poly))return[x,y];
      }
      return nearestFree(r.rect[0]+r.rect[2]/2,r.rect[1]+r.rect[3]/2);
    }

    /* ---------------- 尸体 / 幽灵的公共查询 ---------------- */
    /* 濒死（还活着）用本人坐标；已死亡用固定的 bodyX/bodyY —— 幽灵可以飘走，
       尸体留在原地，所以这两套坐标必须分开。驱逐没有尸体。 */
    function bodyPos(a){
      if(!a)return null;
      if(a.alive)return a.downed?[a.x,a.y]:null;
      if(a.bodyGone||a.deathCause==='vote'||a.bodyX==null)return null;
      return[a.bodyX,a.bodyY];
    }
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
    const DOOR_OPEN_R=SKT2Space.DOOR_OPEN_R, DOOR_CLOSE_R=SKT2Space.DOOR_CLOSE_R,
          DOOR_SPEED=SKT2Space.DOOR_SPEED, DOOR_W=SKT2Space.DOOR_W, DOOR_PASS=SKT2Space.DOOR_PASS;
    function buildDoors(){
      const out=[];
      for(const c of M.corridors){
        const ends=[[0,c.a],[c.pts.length-1,c.b]];
        for(const [ei,rid] of ends){
          const r=M.rooms.find(q=>q.id===rid); if(!r)continue;
          const p=c.pts[ei];
          let best=null,bd=1e9;
          for(const d of r.doors){
            const axis=d[0],v=d[1],horiz=(axis==='t'||axis==='b');
            if(horiz){
              const wy=axis==='t'?r.rect[1]:r.rect[1]+r.rect[3];
              if(Math.abs(p[1]-wy)>0.01)continue;
              const dd=Math.abs(v-p[0]);
              if(dd<bd){bd=dd;best=d;}
            }else{
              const wx=axis==='l'?r.rect[0]:r.rect[0]+r.rect[2];
              if(Math.abs(p[0]-wx)>0.01)continue;
              const dd=Math.abs(v-p[1]);
              if(dd<bd){bd=dd;best=d;}
            }
          }
          if(!best)continue;
          const horiz=best[0]==='t'||best[0]==='b';
          const x=horiz?best[1]:(best[0]==='l'?r.rect[0]:r.rect[0]+r.rect[2]);
          const y=horiz?(best[0]==='t'?r.rect[1]:r.rect[1]+r.rect[3]):best[1];
          out.push({id:c.id+':'+rid,x,y,horiz,w:DOOR_W,open:0,target:0,scanT:0,
            x1:horiz?x-DOOR_W/2:x,y1:horiz?y:y-DOOR_W/2,
            x2:horiz?x+DOOR_W/2:x,y2:horiz?y:y+DOOR_W/2});
        }
      }
      return out;
    }
    function doorTick(dt){
      if(!G||!G.doors||G.meet||G.over)return;
      const blackout=G.lightState===2;
      for(const d of G.doors){
        /* 断电期间：全船每一扇门（含会议室三门）在有人靠近时先做 2 秒安检扫描，
           扫描完成才允许开启；人离开后重新上锁，恢复供电立即解除。 */
        const scanRule=blackout;
        let busy=false;
        /* 扫描/关门用更大的半径做滞回，避免站在门口时门反复开合 */
        const range=scanRule?DOOR_CLOSE_R:(d.open>0.02?DOOR_CLOSE_R:DOOR_OPEN_R);
        for(const a of G.agents){
          if(!a.alive||a.downed||a.detained)continue;
          if(Math.hypot(a.x-d.x,a.y-d.y)<range){busy=true;break;}
        }
        if(!scanRule){
          d.scanT=0;
          d.target=busy?1:0;
        }else if(!busy){
          d.scanT=0;
          d.target=0;
        }else{
          d.scanT=Math.min(2,(d.scanT||0)+dt);
          d.target=d.scanT>=2?1:0;
        }
        const prev=d.open;
        if(d.open<d.target)d.open=Math.min(d.target,d.open+dt*DOOR_SPEED);
        else if(d.open>d.target)d.open=Math.max(d.target,d.open-dt*DOOR_SPEED);
        if((prev<1&&d.open>=1)||(prev>0&&d.open<=0))doorAutoSound(d);
      }
    }
    function doorAutoSound(d){
      if(!G||G.camView||G.over)return;
      /* 门声对附近 AI 始终可听；玩家音量才按距离裁剪 */
      aiHear('door',d.x,d.y,7);
      SND.doorAuto(SND.volAt(d.x,d.y,0.85));
    }
    function doorBlockedSegment(x1,y1,x2,y2){
      if(!G||!G.doors)return false;
      for(const d of G.doors){
        if(!segX([x1,y1],[x2,y2],[d.x1,d.y1],[d.x2,d.y2]))continue;
        /* 断电期间所有门都要完成 2 秒扫描才放行（会议室也不再豁免） */
        if(G.lightState===2&&(d.scanT||0)<2)return true;
        if(d.open>DOOR_PASS)continue;
        return true;
      }
      return false;
    }
    function losNow(x1,y1,x2,y2){
      if(!los(x1,y1,x2,y2))return false;
      if(!G||!G.doors)return true;
      for(const d of G.doors){
        if(d.open>DOOR_PASS)continue;
        if(segX([x1,y1],[x2,y2],[d.x1,d.y1],[d.x2,d.y2]))return false;
      }
      return true;
    }
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
        if(g>0&&g<1.2)gaps.push({room:a.room,a:a.label,b:b.label,gap:+g.toFixed(2)});
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

    /* ---------------- 断言层 / DEV ---------------- */
    /* 每秒 + 关键状态切换各跑一次；失败只报，不修状态（修状态会掩盖 bug）。
       ?strict 时直接抛错 —— 给 Playwright 门禁用。 */
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
       卡片横向排开贴顶，#hud 由 syncDevUi 下移让位，绝不压住左上角。 */
    function renderDevPanel(){
      const box=document.getElementById('dev-rows');
      if(!box||!G)return;
      const out=[];
      for(const a of G.agents){
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
        /* 卡片会被压到 1/8 屏宽，资源行必须紧凑：空格与「·」在这里是纯浪费 */
        const res='弹'+a.bullet+' 包'+a.medkit+' 单'+a.qual
          +(a.qualPending>0?'+'+a.qualPending:'')
          +' 任务'+a.tIdx+'/'+a.tasks.length+(a.alien?' 刀'+a.knife:'');
        out.push('<div class="dr'+(a.alien?' al':'')+((a===G.me&&!G.spectMode)?' me':'')+(!a.alive?' dead':'')+'">'
          +'<div class="top"><b>'+a.name+(a===G.me?(G.spectMode?'（AI）':'（你）'):'')+'</b>'
          +'<span>'+(a.alien?'异形':'人类')+'</span></div>'
          +'<i>'+st+' · '+where+(a.detained?' · 被锁':(a.draggedBy!=null?' · 被拖':(a.drag!=null?' · 拖尸':'')))+'</i>'
          +'<u>'+res+'</u></div>');
      }
      box.innerHTML=out.join('');
    }
    function syncDevUi(){
      if(SIM_RUN)return;
      const on=!!(G&&(G.dev||G.spectMode));
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
      runInvariants('dev');
      toast(G.dev?'DEV：无敌 + 全知（F2 关闭）':'DEV：已关闭');
    }
    /* 三态灯：0 常态（引擎/配电暗）· 1 电路修好（全亮）· 2 拉闸（只有会议室亮） */
    function refreshLight(){
      const st=G.lightState|0;
      for(const r of M.rooms){
        if(st===2) G.lit[r.id]=(r.id==='bridge');
        else if(st===1) G.lit[r.id]=true;
        else G.lit[r.id]=(r.light==='bright');
      }
      /* 走廊灯：常态亮，拉闸后全熄（含桥接灯带） */
      G.corrLit=(st!==2);
      G.blackout=(st===2);
    }
    /* 合闸（恢复供电）：未修电路 4.5 秒；修好电路（powerFixed）3 秒。 */
    function breakerOnTime(){ return G.powerFixed?3:4.5; }
    /* 拉闸（造成断电）：本夜第 1/2/3 次 = 3/6/9 秒，第 4 次起恒 9 秒。
       计数只在**真正断电那一刻** +1（见 pullBreaker），站桩中途被打断不消耗名额；
       G.breakerPulls 每夜重置，所以第 2 夜重新从 3 秒起算。 */
    function breakerOffTime(){
      const n=Math.max(0,(G.breakerPulls||0))+1;
      return Math.min(9,3*n);
    }
    /* 所有入口（玩家轮盘、AI 合闸/拉闸、UI 提示）都只读这一个函数 */
    function breakerPullTime(){
      return G.lightState===2?breakerOnTime():breakerOffTime();
    }
    /* 电闸拉杆角度：按供电状态平滑过渡（模块级变量，只在渲染里用） */
    let BREAKER_LEVER=0;
    function breakerPuller(){
      for(const a of G.agents){
        if(a._doing==='breaker'&&a.doing>0&&a._dur>0)
          return {p:1-a.doing/a._dur, heavy:a._dur>4};
      }
      return null;
    }
    function pullBreaker(actor){
      const wasOff=G.lightState===2;
      G.lightState=(wasOff?(G.powerFixed?1:0):2);
      /* 本夜拉闸次数只在这里累加：真正把灯拉黑的那一次才消耗名额 */
      if(!wasOff&&G.lightState===2)G.breakerPulls=(G.breakerPulls||0)+1;
      refreshLight(); SND.breaker(); pulseHud('pwr');
      /* 断电期间每扇门单独扫描 2 秒（人离开重新上锁）；恢复供电立即清零 */
      for(const d of (G.doors||[]))d.scanT=0;
      const br=M.facility.find(f=>f.kind==='breaker');
      logEvent('breaker',{actor:actor?actor.i:null,on:G.lightState!==2,state:G.lightState,
        room:br?roomIdAt(br.x,br.y):'power',x:br?+br.x.toFixed(1):null,y:br?+br.y.toFixed(1):null});
      if(br){
        G.fx.push({type:'power',x:br.x,y:br.y,t:1.0,dur:1.0,on:G.lightState!==2});
        /* 断电是重动作：拉杆落下时补一圈电弧，6 秒重闸（配电已修复）电火花更密 */
        G.fx.push({type:'spark',x:br.x,y:br.y,t:1.0,dur:1.0});
        if(G.lightState===2&&G.powerFixed)
          G.fx.push({type:'alarm',x:br.x,y:br.y,t:1.4,dur:1.4});
        hear(br.x,br.y,'power',1.1);
        /* 正向信任：把闸合上 = 当着人的面做好事。
           异形的"合闸伪装"就靠这一条兑现成 cred（见 alienSupport 的 breakerOn）。 */
        if(G.lightState!==2)credBroadcast(actor,'breakerOn',br.x,br.y);
        noticeAction(actor,br.x,br.y,6,'breaker');
        aiHear('power',br.x,br.y,30,{actor:actor});
        envNotice('lights',br.x,br.y,G.lightState===2?0.85:0.45);
      }
      toast(G.lightState===2
        ?'电闸已拉下：全船变暗 · 走廊灯全熄 · 监控信号中断 · 所有门需扫描 2 秒才能通过'
          +' · 本夜第 '+G.breakerPulls+' 次，再拉要 '+breakerOffTime()+' 秒'
        :('电闸已合上：'+(G.powerFixed?'配电已修复':'')+'全船照明恢复 · 自动门安检解除'
          +' · 合闸耗时 '+breakerOnTime()+' 秒'));
    }
    /* 单机暂停：冻结 update 与 SKClock（恢复时整体平移相位时间），会议/搜尸中不可暂停 */
    function togglePause(){
      if(!G||G.over||G.meet||G.inspect||G.camView||G.pipePick||G.sabPick)return;
      const el=document.getElementById('pause');
      if(!G.paused){
        G.paused=true; G.pauseAt=performance.now(); G.pauseT=performance.now()/1000;
        const info=document.getElementById('p-info');
        if(info)info.textContent='第 '+G.night+' 夜 · 剩余 '+Math.max(0,Math.round(G.t))+' 秒 · 任务 '+G.me.tIdx+'/4';
        if(el)el.classList.remove('hide');
      }else{
        const d=performance.now()-(G.pauseAt||performance.now());
        if(G.phase){G.phase.startedAt+=d;G.phase.endsAt+=d;}
        G.paused=false;
        if(el)el.classList.add('hide');
      }
    }
    function restartGame(){
      G.paused=false;
      const el=document.getElementById('pause'); if(el)el.classList.add('hide');
      newGame();
    }
    function exitToMenu(){ stop(); }
    
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
      if(a&&a.rushT>0)return MOVE_SPEED*SKSanity.RUSH.mul;
      return MOVE_SPEED;
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
      /* 不可达目标不要每帧重跑 A*：给 AI 一个短冷却，避免 1000 局里单个坏目标拖死整局 */
      if(a!==G.me||G.spectMode){
        if((a._pathCD||0)>0)return;
      }
      const p=astar(a.x,a.y,x,y);
      if(!p&&(a!==G.me||G.spectMode))a._pathCD=1.2;
      a.path=p;
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
    function stepMove(a,dt,sp){
      if(a.detained){a.moving=false;return true;}
      if(!a.path||!a.path.length){a.moving=false;return true;}
      a.moving=true;
      const ox=a.x, oy=a.y;
      let left=sp*dt;
      while(left>0&&a.path.length){
        const p=a.path[0],dx=p[0]-a.x,dy=p[1]-a.y,d=Math.hypot(dx,dy);
        if(d<0.02){a.path.shift();continue;}
        if(Math.abs(dx)>Math.abs(dy)) a.dir=dx>0?'right':'left'; else a.dir=dy>0?'down':'up';
        if(d<=left){
          if(!(a.ghost&&!a.alive)&&doorBlockedSegment(a.x,a.y,p[0],p[1])){a.moving=false;return false;}
          a.x=p[0];a.y=p[1];left-=d;a.path.shift();
        }
        else{
          const nx=a.x+dx/d*left, ny=a.y+dy/d*left;
          if(!(a.ghost&&!a.alive)&&doorBlockedSegment(a.x,a.y,nx,ny)){a.moving=false;return false;}
          a.x=nx;a.y=ny;left=0;
        }
      }
      /* 围墙兜底：活人永远留在船体可行走面内；幽灵才允许穿墙 */
      if(!(a.ghost&&!a.alive)&&!free(a.x,a.y)){
        const f=nearestFree(a.x,a.y); a.x=f[0]; a.y=f[1];
      }
      /* 拐角卡死兜底：路径还在但连续 0.7 秒没有位移 ⇒ 从最近可走点重寻路 */
      if(!(a.ghost&&!a.alive)&&a.path&&a.path.length){
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
      if(a.doing>0&&Math.hypot(a.x-ox,a.y-oy)>0.002)a._moveHit=true;
      if(a.drag!=null)syncDragOf(a);
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
      if(!me.alien){toast('管道口：你没有能力打开它');return false;}
      if(!from)from=nearPipe(me);
      if(!from){toast('要站在管道口才能钻地道');return false;}
      /* 2026-11-03 用户裁定"AI 与玩家数值完全一致"：钻管道的冷却两边同一个数。
         以前 AI 是 20 秒冷却、玩家**零冷却**（可以连着钻），那是玩家白拿的特权。 */
      if((me._pipeCD||0)>0){
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
      if(!me.alien)return false;
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
      runInvariants('pipe');
      return true;
    }
    function camMonitor(){ return M.facility.find(f=>f.kind==='monitor'); }
    /* 物资申请单：中央会议室圆桌领取；军械库/医疗间各有专用补给点 */
    function roundTableCover(){
      return M.cover.find(c=>c.room==='bridge'&&c.label==='圆桌')||null;
    }
    function roundTableClaimSpot(){
      const t=roundTableCover(); if(!t)return null;
      return {x:t.x+t.w/2,y:t.y+t.h+1.2,label:'圆桌 · 物资申请单'};
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
    function supplyTargetFor(a){
      if(!a||!a.qual||a.qual<1)return null;
      /* 有人濒死时医疗包优先；否则只要没有子弹就用申请单备弹。
         不再要求“当前已有嫌疑人”——AI 会先武装自己，再去找人。 */
      if(a.medkit<1&&G.agents.some(v=>v!==a&&v.alive&&v.downed))return 'med';
      if(a.bullet<1)return 'ammo';
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
      toast(G.lightState===2?'监控信号中断：先合上配电室的电闸':'监控台已接入 · E / V / ESC 退出');
      runInvariants('cams');
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
      const d=Math.hypot(x-G.me.x,y-G.me.y);
      if(d>18)return;
      if(G.waves.length>52)G.waves.shift();
      G.waves.push({x,y,kind:kind||'step',t:0,dur:0.9+Math.min(0.5,d*0.02),
        str:Math.max(0.22,1-d/18)*(str==null?1:str)});
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
    const SUPPLY_AMMO_TIME=SKSanity.STAND.ammo, SUPPLY_MED_TIME=SKSanity.STAND.med;
    /* 电闸交互半径（2026-10-31）：锚点对齐到柜体中心后，柜体是 1.6×2.2 格的大件，
       1.6 格时代玩家贴着正面都按不到。三处判定（玩家轮盘 / AI 合闸 / AI 拉闸）共用。 */
    const BREAKER_USE_R=2.0;
    function dmgOfRoom(rid){ return G.dmg.find(d=>d.room===rid)||null; }
    function sabRoomOk(rid){
      return !!rid&&rid!=='bridge'&&M.rooms.some(r=>r.id===rid)&&!dmgOfRoom(rid);
    }
    /* 破坏落点：在该舱室的**任务点**里随机抽一个设备（硬点权重更高），
       不再固定取第一个硬点、更不落舱室中心（2026-11-01 用户要求）。
       这样"被损毁的东西"有名字、有具体位置，维修的人本来就会往那儿去；
       异形也必须真的走到那台设备前下手，而不是踏进舱门就引爆整间房。 */
    /* 落点缓存：同一夜同一舱室必须返回同一个设备。
       否则 pickSabRoom 抽一次、damageRoom 又抽一次，会出现"报的是手术台、
       坏的是药柜"，AI 侧的 _sabSpot 也会来回改目标。每夜在 startNight 清空。 */
    const SAB_SPOT_CACHE={};
    function sabSpot(rid){
      if(SAB_SPOT_CACHE[rid])return SAB_SPOT_CACHE[rid];
      const ps=M.points.filter(p=>p.room===rid);
      if(ps.length){
        /* **均匀随机**取该舱室的任意任务点（2026-11-01 用户裁定）。
           之前给硬点 0.6 权重，结果老是抽到那几个靠近房间中心的硬点，
           看起来就像"破坏点还在中心"。均匀抽才是"任意维修点"。 */
        const p=ps[Math.floor(Math.random()*ps.length)];
        const f=nearestFree(p.x,p.y);
        return (SAB_SPOT_CACHE[rid]={room:rid,x:f[0],y:f[1],label:p.label});
      }
      const r=M.rooms.find(q=>q.id===rid);
      if(!r)return null;
      const f=nearestFree(r.rect[0]+r.rect[2]/2,r.rect[1]+r.rect[3]/2);
      return (SAB_SPOT_CACHE[rid]={room:rid,x:f[0],y:f[1],label:r.name+'设备'});
    }
    function nearDmg(a,maxD){
      let best=null,bd=maxD==null?FIX_RANGE:maxD;
      for(const d of G.dmg){
        const dd=Math.hypot(d.x-a.x,d.y-a.y);
        if(dd<bd){bd=dd;best=d;}
      }
      return best;
    }
    function openSabPick(){
      if(!G||G.over||G.meet||G.inspect||G.camView||G.pipePick)return false;
      const me=G.me;
      if(!me.alive||me.downed||me.detained){toast('当前状态无法破坏');return false;}
      if(!me.alien){toast('你做不到');return false;}
      if(me.sabUsed){toast('今晚已经破坏过了');return false;}
      const rooms=M.rooms.filter(r=>sabRoomOk(r.id));
      if(!rooms.length){toast('已经没有可破坏的舱室');return false;}
      G.sabPick={rooms:rooms.map(r=>r.id)};
      me.path=null;me.moving=false;me.doing=0;me._doing=null;
      const box=document.getElementById('sabot-list');
      box.innerHTML=rooms.map((r,n)=>{
        const sp=sabSpot(r.id),d=sp?Math.hypot(sp.x-me.x,sp.y-me.y):0;
        return '<button data-room="'+r.id+'"><span class="pn">'+(n+1)+'</span>'
          +'<span class="pr">'+r.name+'</span><span class="pd">'+d.toFixed(0)+' 格</span></button>';
      }).join('');
      [...box.children].forEach(btn=>{btn.onclick=()=>pickSabRoom(btn.dataset.room);});
      const sub=document.getElementById('sabot-sub');
      if(sub)sub.textContent='每夜一次 · 抵达目标舱室后损毁设备 · 30 秒内未修复则维修进度 -5';
      document.getElementById('sabot').classList.remove('hide');
      SND.interact();
      return true;
    }
    function closeSabPick(silent){
      if(G)G.sabPick=null;
      const el=document.getElementById('sabot'); if(el)el.classList.add('hide');
      if(!silent)toast('已取消');
    }
    function pickSabRoom(rid){
      if(!G||!G.sabPick||!sabRoomOk(rid))return false;
      const sp=sabSpot(rid); if(!sp)return false;
      G.sabTarget=sp; G.sabPick=null;
      const el=document.getElementById('sabot'); if(el)el.classList.add('hide');
      const d=Math.hypot(sp.x-G.me.x,sp.y-G.me.y);
      toast('破坏目标：'+roomNameById(rid)+'「'+sp.label+'」· 进入舱室自动下手 · '+d.toFixed(0)+' 格');
      SND.interact();
      return true;
    }
    function damageRoom(a,rid,spot){
      if(!a||!a.alive||a.downed||!a.alien||a.sabUsed)return false;
      if(!sabRoomOk(rid))return false;
      /* 落点由调用方决定（AI 抽一次就固定，玩家用手里的 sabTarget），
         没给才现抽 —— 否则同一帧里抽两次会出现"报的房间和设备对不上" */
      const sp=spot||sabSpot(rid); if(!sp)return false;
      G.dmg.push({room:rid,x:sp.x,y:sp.y,label:sp.label,left:SAB_TIME,dur:SAB_TIME,by:a.i,
        born:evNow()});
      if(G.simMode&&G.simStats)G.simStats.sabotages++;
      logEvent('sabotage',{actor:a.i,room:rid,label:sp.label,
        x:+sp.x.toFixed(1),y:+sp.y.toFixed(1)});
      a.sabUsed=true;a.sabRoom=null;a.target=null;a.path=null;
      if(!G.spectMode&&a===G.me)G.sabTarget=null;
      G.fx.push({type:'spark',x:sp.x,y:sp.y,t:1.6,dur:1.6});
      G.fx.push({type:'alarm',x:sp.x,y:sp.y,t:1.3,dur:1.3});
      hear(sp.x,sp.y,'power',1.0);
      SND.sabotage();
      witnessAlienAction(a,a.x,a.y,6,'sabotage');
      aiHear('sabotage',sp.x,sp.y,20,{actor:a});
      envNotice('fault',sp.x,sp.y,0.55);
      toast('警报：'+roomNameById(rid)+'「'+sp.label+'」被损毁 · 30 秒内修复，否则维修进度 -5');
      runInvariants('damageRoom');
      return true;
    }
    function startFix(a,d){
      if(!a||!d||G.dmg.indexOf(d)<0)return false;
      if(!a.alive&&!a.ghost)return false;
      /* 幽灵一律不能修故障（2026-11-01 用户裁定）：幽灵的 2 分额度只能花在
         剩余任务上，额度耗尽就游荡。故障是人类活人的活儿。 */
      if(a.ghost){if(a===G.me&&!G.spectMode)toast('幽灵不能修故障：先把手头的任务做完');return false;}
      const dur=a.ghost?FIX_TIME*1.6:FIX_TIME;
      a.doing=dur;a._dur=dur;a._doing='fix';a._fix=d;
      a.path=null;a.moving=false;a._fixGo=null;
      if(!G.spectMode&&a===G.me){toast((a.ghost?'幽灵维修故障「':'维修故障「')+d.label+'」· 连续 '+dur.toFixed(dur%1?1:0)+' 秒 · 移动会中断');SND.interact();}
      return true;
    }
    function finishFix(a){
      const d=a._fix;
      a._fix=null;a._doing=null;a.doing=0;
      if(!d||G.dmg.indexOf(d)<0)return;
      G.dmg.splice(G.dmg.indexOf(d),1);
      /* 同一座故障可能有好几个人在赶/在修：修好的一瞬间全部松手，
         不用把剩下的 10 秒站完，也别再往已经修好的设备跑。 */
      for(const x of G.agents){
        if(x===a)continue;
        if(x._doing==='fix'&&x._fix===d){
          x._doing=null;x._fix=null;x.doing=0;x.path=null;x.moving=false;
          if(!G.spectMode&&x===G.me)toast('故障已被队友修好，停止维修');
        }
        if(x._fixGo===d)x._fixGo=null;
      }
      G.fx.push({type:'heal',x:d.x,y:d.y,t:1.2,dur:1.2});
      G.fx.push({type:'done',x:a.x,y:a.y,t:1.0,dur:1.0});
      /* 局内统计：幽灵修好的故障次数（与「幽灵任务」分开记） */
      if(a.ghost&&G.stats)G.stats.ghostFixes=(G.stats.ghostFixes||0)+1;
      if(G.simMode&&G.simStats&&a.ghost)G.simStats.ghostFixes++;
      /* 破坏遥测：故障被修掉（异形没拿到 -5），记录存活时长评估破坏威慑力 */
      if(G.simMode&&G.simStats){
        G.simStats.sabFixed++;
        G.simStats.sabFixSecSum+=Math.max(0,(d.dur||SAB_TIME)-(d.left||0));
        if(a.ghost)G.simStats.sabFixedByGhost++;
      }
      logEvent('fix',{actor:a.i,room:d.room,label:d.label,ghost:!!a.ghost,
        x:+d.x.toFixed(1),y:+d.y.toFixed(1)});
      /* 正向信任：看见别人把破坏修好 → +cred（异形伪装成维修也走这条路，这正是洗白）。
         坐标用**修的人**而不是故障点：故障位常贴在机器背后，目击者看得见人却"看不见那个点"，
         用 d.x/d.y 会让站在旁边的人收不到这条信任（与 taskDone / fake 同一口径）。 */
      if(!a.ghost)credBroadcast(a,'fixDone',a.x,a.y);
      if(!G.spectMode&&a===G.me)toast('故障已修复：'+roomNameById(d.room)+'「'+d.label+'」');
      SND.done();
      runInvariants('finishFix');
    }
    /* 连续维修：所有站桩动作一旦移动就打断；计时到 0 才结算 */
    const STAND_ACT={task:'维修任务',fix:'故障维修',breaker:'拉闸',sab:'破坏设备',med:'取医疗包',ammo:'取子弹',revive:'施救',search:'搜查',qual:'领取物资申请单'};
    function tickDoing(a,dt){
      if(!(a.doing>0)){a._standDoing=null;a._moveHit=false;return;}
      if(a._standDoing!==a._doing){a._standDoing=a._doing;a._moveHit=false;}
      /* 真实位移（含一帧内走完整条短路径）或仍在沿路径移动都算打断 */
      if(a._moveHit||(a.moving&&a.path&&a.path.length)){
        const label=STAND_ACT[a._doing]||'动作';
        a.doing=0;a._doing=null;a._fix=null;a._rv=null;a._sv=null;a._standDoing=null;a._moveHit=false;
        a._taskPt=null;
        if(!G.spectMode&&a===G.me)toast('移动打断了'+label);
        return;
      }
      a.doing-=dt;
      if(a.doing<=0)finishDoing(a);
    }
    function dmgTick(dt){
      if(!G.dmg.length)return;
      for(let i=G.dmg.length-1;i>=0;i--){
        const d=G.dmg[i];
        d.left-=dt;
        if(d.left>0)continue;
        /* 天亮后不再追罚：dawn 会清掉剩余故障，这一夜算白干但不扣分 */
        if(G.t>0.05){
          G.prog=Math.max(0,G.prog-SKSanity.WIN.faultPenalty);
          /* 破坏遥测：-5 真正生效的次数（异形破坏的"命中"） */
          if(G.simMode&&G.simStats)G.simStats.sabHits++;
          G.fx.push({type:'alarm',x:d.x,y:d.y,t:1.4,dur:1.4});
          G.fx.push({type:'spark',x:d.x,y:d.y,t:1.0,dur:1.0});
          hear(d.x,d.y,'power',1.0);
          toast('故障未修复：'+roomNameById(d.room)+'「'+d.label+'」· 维修进度 -5');
          runInvariants('faultPenalty');
        }
        G.dmg.splice(i,1);
        for(const a of G.agents){
          if(a._doing==='fix'&&a._fix===d){a._doing=null;a._fix=null;a.doing=0;}
        }
      }
    }
    /* 玩家异形的目标引爆：进入目标舱室即触发（2026-11-01 恢复）。
       破坏的是**任务点上的那台设备**（G.dmg 的坐标），但不需要走到它跟前 ——
       和 AI 侧同口径。 */
    function sabTick(){
      const me=G.me;
      if(G.t<=0||!me.alien||!me.alive||me.downed||me.detained||me.sabUsed)return;
      const t=G.sabTarget;
      if(!t)return;
      if(!sabRoomOk(t.room)){G.sabTarget=null;return;}
      if(roomIdAt(me.x,me.y)===t.room||Math.hypot(me.x-t.x,me.y-t.y)<SAB_RANGE)
        damageRoom(me,t.room,t);
    }
    
    /* 夜间见闻：只记录真的进过的房间和视距内看见的人。
       会议发言全部从这些事实里生成，才不会前言不搭后语。 */
    function trackNight(a){
      const rid=roomIdAt(a.x,a.y);
      if(rid!=='corridor'&&rid!=='unknown')a.nRoom=rid;
      if(!a.nSeen)a.nSeen={};
      if(!a.mind)mindReset(a);
      const scanR=a.alien?8:5.5;
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
              susAdd(a,w.i,AV.sus,'saw_avoid',evA);
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
          /* 刀者红身：只有刚出刀的人会红 3 秒；人类没有刀，所以看到红光 = 确证异形。
             异形看到红光则记成队友；同一个人的一次红身只记一条，避免刷满记忆。 */
          if(a.alien&&w!==a&&w.redT>0){
            markMate(a,w,'saw_red');
          }else if(!a.alien&&w.redT>0){
            const lastRed=a.mind.redSeen[w.i]||-99;
            if(evNow()-lastRed>5){
              a.mind.redSeen[w.i]=evNow();
              /* 同样的证据分级（2026-11-02）：红光也得**足够近**才算看清，
                 隔远了只记得"那边有个人发红"，只加嫌疑、不写确证。 */
              const near=Math.hypot(w.x-a.x,w.y-a.y)<=SKSanity.CONFIRM.nearR;
              const ev={kind:'saw_red',x:w.x,y:w.y,room:roomIdAt(w.x,w.y),subj:w.i,
                conf:near?0.9:0.55,src:'sight'};
              if(!near)ev.far=1;
              evPush(a,ev);
              susAdd(a,w.i,EV_W.saw_red,'saw_red',ev);
              if(near){
                a.mind.known[w.i]={t:ev.t,kind:'saw_red',room:ev.room,conf:0.9};
                a.mind.sus[w.i]=1;
                a.suspect=w.i;
                knownBump('saw_red');
                knownOverride(a,w.i);
              }else if(G&&G.simStats)G.simStats.farSight=(G.simStats.farSight||0)+1;
            }
          }
        }
      }
    }

    /* ---------------- AI 认知层（感知 / 记忆 / 推理） ----------------
       所有判断只来自 AI 自己看见、听见或搜查到的事实；不读取 alien 身份。
       证据 → 嫌疑分 → 行为（报告 / 开枪 / 投票）与会议语料。 */
    /* 方案 A 第 6 项：MEM_MAX 与认知链 23 个函数真源在 js/t2/ai.js。 */
    const EV_W={saw_knife:0.75,saw_shot:0.55,saw_pipe:0.7,saw_sabotage:0.65,
      saw_bot:0.6,saw_breaker:0.32,saw_drag:0.22,saw_drag_away:0.45,saw_detain:0.6,saw_red:0.85,
      heard_knife:0.18,heard_shot:0.16,heard_scream:0.22,heard_power:0.14,
      heard_robot:0.12,heard_pipe:0.2,heard_door:0.04,heard_detain:0.6,heard_drag:0.12,
      env_lights:0.1,env_fault:0.12,env_robot:0.14};

    /* ---------------- 对局事件流 / 回放采样（只记录，不参与任何判定） ----------------
       时间轴用 playT（真实模拟秒，会议期间不增长）排序；night / t 只用于展示
       “第几夜 · 夜里还剩多少秒”。事件与帧都做上限，异常长局也不会把内存拖爆。 */
    const EV_CAP=8000, FRAME_CAP=12000, FRAME_DT=0.5;
    function logEvent(kind,data){
      if(!G)return null;
      const e=Object.assign({kind:kind,night:G.night||0,
        pt:+(G.playT||0).toFixed(2),t:+Math.max(0,G.t||0).toFixed(1),
        actor:null,victim:null,room:null,x:null,y:null},data||{});
      const arr=(G.events=G.events||[]);
      if(arr.length<EV_CAP)arr.push(e);
      return e;
    }
    function recordFrame(){
      if(!G||G.simMode||G.over)return;
      const p=[];
      for(const a of G.agents){
        let x=a.x,y=a.y;
        if(!a.alive){
          if(a.bodyGone||a.deathCause==='vote'||a.bodyX==null)continue;
          x=a.bodyX;y=a.bodyY;
        }
        let f=(a.alive?1:0)|(a.downed?2:0)|(a.detained?4:0)|(a.drag!=null?8:0);
        p.push([a.i,+x.toFixed(1),+y.toFixed(1),f]);
      }
      const arr=(G.frames=G.frames||[]);
      if(arr.length<FRAME_CAP)arr.push({pt:+G.playT.toFixed(1),n:G.night,p:p});
    }
    /* 复盘/导出用的完整回放包：种子没有（对手都是 AI），所以直接存事件 + 位置帧 */
    function replayData(){
      return {
        v:1,game:(typeof SKConfig!=='undefined'&&SKConfig.version)||'返航录V3',
        savedAt:new Date().toISOString(),
        map:{w:M.bounds.w,h:M.bounds.h,rooms:M.rooms.length,pipes:M.pipes.length},
        result:{win:!!G.overWin,why:G.overWhy||'',prog:G.prog,winPts:WIN_PTS,nights:G.night},
        roster:G.agents.map(a=>({i:a.i,name:a.name,alien:!!a.alien,alive:!!a.alive,
          deathCause:a.deathCause||null,deathRoom:a.deathRoom||null})),
        events:(G.events||[]).slice(),
        frames:(G.frames||[]).slice()
      };
    }
    /* 跨夜嫌疑的「最后一夜有新增证据」时间戳：跟随保留下来的 sus */
    /* 证言可信度读值（缺省 = 没印象 = 0.5） */
    function reliaOf(a,i){
      const v=a&&a.mind&&a.mind.reliability?a.mind.reliability[i]:null;
      return v==null?SKSanity.RELIA.base:v;
    }
    function reliaAdd(a,i,w,reason){
      if(!a||i==null||i===a.i||!G||!w)return;
      if(!a.mind)mindReset(a);
      if(!a.mind.reliability)a.mind.reliability={};
      const R=SKSanity.RELIA;
      const old=(a.mind.reliability[i]==null?R.base:a.mind.reliability[i]);
      a.mind.reliability[i]=Math.max(R.min,Math.min(R.max,old+w));
      if(G.simStats){
        G.simStats.reliaWrites=(G.simStats.reliaWrites||0)+1;
        if(reason)G.simStats.reliaBy=Object.assign(G.simStats.reliaBy||{},{[reason]:
          ((G.simStats.reliaBy&&G.simStats.reliaBy[reason])||0)+1});
      }
    }
    /* 情绪记忆（2026-10-31）：AI 会记仇也会记恩。
       grudge：被谁当众咬过 → 投他更容易、会上反咬他；
       trust：被谁当众护过 → 更愿意跟他的票、替他说话。
       强度都按性格缩放（激进记仇更狠，社交记恩更深），见 SKTrait.C。 */
    function grudgeAdd(a,i,w){
      if(!a||i==null||i===a.i||!G)return;
      if(!a.mind)mindReset(a);
      if(!a.mind.grudge)a.mind.grudge={};
      a.mind.grudge[i]=Math.min(2,Math.max(0,(a.mind.grudge[i]||0)+w*SKTrait.C.grudgeGain(a)));
    }
    function trustAdd(a,i,w){
      if(!a||i==null||i===a.i||!G)return;
      if(!a.mind)mindReset(a);
      if(!a.mind.trust)a.mind.trust={};
      a.mind.trust[i]=Math.min(2,Math.max(0,(a.mind.trust[i]||0)+w*SKTrait.C.trustGain(a)));
    }
    /* 恩人不过票：被某人当众保过（trust≥0.8）就很难再把票投给他 */
    function isPatron(a,i){
      return !!(a&&a.mind&&a.mind.trust&&(a.mind.trust[i]||0)>=0.8);
    }
    /* ---- 正向信任 cred（2026-11-01）----
       和 trust / grudge 完全分开的第三条通道：
         trust = "他帮过我"     —— 情绪，来自当众辩护
         grudge= "他咬过我"     —— 情绪，来自被指控
         cred  = "他干的是正经事" —— 观察，来自可被目击的正经行为
       这一条是异形伪装的**兑现口**：演得像，cred 就涨，之后没人愿意指控它。
       数值全部来自 SKSanity.CRED.gains，这里只负责写。 */
    function credAdd(a,i,w,reason){
      if(!a||i==null||i===a.i||!G||!w)return;
      if(!a.mind)mindReset(a);
      /* 硬覆盖（改动 B）：已经被自己确证的人，洗白机制一律失效 ——
         「他干过正经事」不能盖过「我亲眼看见他出刀」。 */
      if(a.mind.known&&a.mind.known[i])return;
      if(!a.mind.cred)a.mind.cred={};
      const cap=SKSanity.CRED.cap;
      /* 追责机制会给**负**权重（投错票 → 信誉下降），所以这里要双向夹紧 */
      a.mind.cred[i]=Math.max(0,Math.min(cap,(a.mind.cred[i]||0)+w));
      /* 只有「正经行为」才计入 almost.friend 的种类（投票对错不算） */
      if(reason&&SKSanity.CRED.gains[reason]!=null){
        const cw=a.mind.credWhy||(a.mind.credWhy={});
        const arr=cw[i]||(cw[i]=[]);
        arr.push({kind:reason,night:G.night,w:+w.toFixed(3)});
        if(arr.length>8)arr.shift();
        evalAlmost(a,i);
      }
    }
    /* 信任的**聚焦选择器**（2026-11-03，与 topSus 对称）。
       以前只有"谁最可疑"、没有"谁最可信"，于是 cred 只能少做坏事（不咬 / 弃票），
       永远不能多做动作（不跟、不护送、不背书）。实测每局已有 0.96 对过了
       almost.friend 的分数门槛，却没有任何一处代码把它读成一个决定。
       `known` 的人**永远不进这个表** —— 信誉再高也洗不掉亲眼所见。 */
    function topCred(a,min){
      if(!a||!a.mind||!a.mind.cred)return null;
      const th=min==null?SKSanity.trustEndorseAt():min;
      let best=null,bi=null;
      for(const k in a.mind.cred){
        const i=+k,v=a.mind.cred[i];
        if(v<th)continue;
        if(a.mind.known&&a.mind.known[k])continue;
        if(best==null||v>best){best=v;bi=i;}
      }
      if(bi==null)return null;
      const kinds={};
      for(const e of ((a.mind.credWhy||{})[bi]||[]))if(e.kind)kinds[e.kind]=1;
      return {i:bi,score:best,kinds:Object.keys(kinds)};
    }
    /* 服从力：被点名的人有多信这位领袖（0~1）。
       分母直接用 almost.friend 的门槛 —— "我把他当基本是好人"才可能照他的安排走，
       于是**领袖感挂在信任的聚集上**，而不是挂在一个新数值上。 */
    function obeyTrustMul(a,leaderSeat){
      if(!a||leaderSeat==null)return 0;
      const g=SKSanity.trustObeyGate()||1;
      return Math.max(0,Math.min(1,credOf(a,leaderSeat)/g));
    }
    /* ---- 讨论 → 关系（2026-11-01）----
       warm 是"聊得来"：一起咬过同一个人、或者他替我辩护过。
       只用于空闲时的同行偏好，**不参与投票**（避免变成第二套信任分）。 */
    function warmAdd(a,i,w){
      if(!a||i==null||i===a.i||!w)return;
      if(!a.mind)mindReset(a);
      if(!a.mind.warm)a.mind.warm={};
      a.mind.warm[i]=Math.min(1,(a.mind.warm[i]||0)+w);
    }
    /* 空闲时想找的人：14 格内、warm 最高的活人（没有就返回 null） */
    function warmMate(a){
      if(!a||!a.mind||!a.mind.warm)return null;
      const W=SKSanity.WARM;
      let best=null,bw=W.minWarm;
      for(const k in a.mind.warm){
        const v=a.mind.warm[k];
        if(v<bw)continue;
        const t=G.agents[+k];
        if(!t||t===a||!t.alive||t.downed||t.detained)continue;
        if(Math.hypot(t.x-a.x,t.y-a.y)>W.range)continue;
        bw=v;best=t;
      }
      return best;
    }
    /* ---- 追责机制（2026-11-01）----
       投票结果公布后清算"带节奏"的人：
         · 被驱逐的**真是异形** → 投对的人信誉上升（别人更信他的判断）
         · 被驱逐的是**人类**   → 投错的人信誉下降，带头的人还被记一笔嫌疑
       第一个公开指控的人（meet.lead）权重最高，跟票的按 voterMul 计。
       这条给诬陷加了一个真实代价：诬陷成功收益极大，但一旦被证伪，
       带头的人自己就变成下一个目标 —— 诬陷是要还的。 */
    function settleAccountability(cand){
      if(!cand||!G.meet)return;
      const A=SKSanity.ACCOUNT, R=SKSanity.RELIA, m=G.meet, votes=m.votes||{};
      const wasAlien=!!cand.alien;
      const voters=[];
      for(const k in votes)if(votes[k]===cand.i)voters.push(+k);
      if(!voters.length)return;
      const lead=(m.lead&&m.lead[cand.i]!=null)?m.lead[cand.i]:voters[0];
      for(const vi of voters){
        const src=G.agents[vi];
        if(!src)continue;
        const mul=(vi===lead)?A.leadMul:A.voterMul;
        const isLead=(vi===lead);
        for(const w of G.agents){
          if(w===src||w===cand||!w.alive||w.downed||!w.mind)continue;
          if(wasAlien){
            credAdd(w,vi,A.correct.cred*mul,'right_vote');
            /* F1 证言可信度：他带对了 → 以后他说的话更值钱 */
            reliaAdd(w,vi,isLead?R.leadRight:R.voteRight,isLead?'lead_right':'vote_right');
          }else{
            credAdd(w,vi,A.wrong.cred*mul,'wrong_vote');
            reliaAdd(w,vi,-(isLead?R.leadWrong:R.voteWrong),isLead?'lead_wrong':'vote_wrong');
            /* 只有带头的人会被"记仇"式追责，跟票的只掉信誉 —— 否则一票之差错杀全队 */
            if(mul>=A.leadMul)
              susAdd(w,vi,A.wrong.sus*mul,'wrong_accuse',
                {kind:'wrong_accuse',x:0,y:0,room:null,conf:0.5,src:'vote',subj:vi});
          }
        }
      }
      /* 元推理（F2）：被驱逐的**真是异形** → 当初公开替他辩护的人要被回溯算账，
         同时给他一次「我上次看走眼了」的发言机会。这条与 known 覆盖规则配合，
         自然会演出「昨天保他、今天咬他」。 */
      if(wasAlien&&m.defenseLog){
        for(const k in m.defenseLog){
          const def=G.agents[+k];
          const v=m.defenseLog[k];
          if(!def||def===cand||!def.alive||def.downed||!def.mind)continue;
          if(v&&v[cand.i]==null)continue;
          /* 软联盟（META）：**反复**替这个人说话的，比只说过一次的更可疑 ——
             「你俩一路在互相保」是真人局最常用的读法，但它只能当弱证据。 */
          const M=SKSanity.META;
          const allyN=(def.mind.ally&&def.mind.ally[cand.i])||0;
          const strong=allyN>=M.allyCount;
          const wgt=strong?M.allySus*M.allyMul:0.18;
          const kind=strong?'ally_revealed':'defended_revealed';
          for(const w of G.agents){
            if(w===def||w===cand||!w.alive||w.downed||!w.mind)continue;
            susAdd(w,def.i,wgt,kind,
              {kind:kind,x:0,y:0,room:null,conf:0.6,src:'vote',subj:def.i});
          }
          def._retract=cand.i;
          if(G.simStats){
            G.simStats.retractCount=(G.simStats.retractCount||0)+1;
            if(strong)G.simStats.allyRevealed=(G.simStats.allyRevealed||0)+1;
          }
        }
      }
      logEvent('account',{victim:cand.i,alien:wasAlien,lead:lead,voters:voters.length});
    }
    /* 口供史（F6）：每个 AI 记自己**对外声称过**的位置，跨夜留最近 3 次。
       与 `mem`（我看见谁在哪，客观）严格分开：这里是「谁声称自己在哪」。
       只进语料，不产生任何嫌疑。 */
    function recordClaim(a,al){
      if(!a||!al||!G)return;
      if(!a.mind)mindReset(a);
      const h=a.mind.claimHist||(a.mind.claimHist=[]);
      h.push({night:G.night,room:al.room,roomId:al.roomId||null});
      if(h.length>3)h.shift();
    }
    /* 辩护记账：谁替谁说过话（跨会议保留，翻身份后回溯用） */
    function defenseNote(def,tgt){
      if(!def||!tgt||def===tgt||!G||!G.meet)return;
      const m=G.meet;
      m.defenseLog=m.defenseLog||{};
      const rec=m.defenseLog[def.i]||(m.defenseLog[def.i]={});
      rec[tgt.i]={night:G.night};
      /* 软联盟计数（2026-11-02）：**反复替同一个人说话**才算，一次不算。
         这是"读人"最保守的一档 —— 不做传递闭包，也不做"共同指控"的连坐。 */
      if(def.mind){
        if(!def.mind.ally)def.mind.ally={};
        const cap=SKSanity.META.noteCap;
        def.mind.ally[tgt.i]=Math.min(cap,(def.mind.ally[tgt.i]||0)+1);
      }
    }
    /* 把一次"正经行为"广播给所有**真的看得见**的活人（异形也会看见，但它不用）。
       radius 用行为发生点的真实目击半径，亮房远处的人也算数。 */
    function credBroadcast(actor,kind,x,y){
      const w0=SKSanity.CRED.gains[kind];
      if(!w0||!actor)return;
      const R=Math.max(6,Math.min(14,sightRangeAt(x,y)));
      for(const w of G.agents){
        if(w===actor||!w.alive||w.downed||w.detained||!w.mind)continue;
        if(Math.hypot(w.x-x,w.y-y)>R)continue;
        if(!aiCanSee(w,x,y,R))continue;
        /* 异形看人类干活不加分（它不需要），人类看谁都加 —— 包括看异形演 */
        if(w.alien)continue;
        credAdd(w,actor.i,w0,kind);
      }
    }
    /* ---- 准-确证评估（2026-11-01）----
       双向：foe「这人基本就是异形」/ friend「这人基本是好人」。
       条件：sus（或 cred）过线 + **证据种类 ≥2** + 至少一条来自最近两夜。
       任一条不成立就把条目删掉 —— 准-确证是**可推翻**的，这正是它与 known 的区别。
       注意：构陷（heard_frame）只能加 sus，达不到「种类 ≥2」；伪装（fakeWork）可以
       攒出 friend，这是设计目的（演出总有破绽，所以 fakeWork 的 cred 略低于真做）。 */
    /* 确证写入后的**硬覆盖**：亲眼看见的事实覆盖一切统计性印象。
       · 删 almost.friend、清 cred（此后洗白机制对他一律失效）
       · trust 不清 —— 那是「他帮过我」的情绪，和「他是异形」不冲突，
         清掉反而抹掉「昨天护他、今天咬他」这场戏
       · 写一条 almost.foe（若没有），让行为侧立刻进入「基本确定」档 */
    /* 反向证据：目击到某人案发时在别处，降低普通嫌疑；但不会抹掉自己的确证。 */
    /* ---- 时间线拆谎（2026-11-01）----
       数学在 SKSanity.checkAlibi（纯函数），这里只负责取窗口与对局状态。
       旧写法是「∃ 一条不匹配 → 定罪」，会拿 30 秒前的旧位置否定现在的口供；
       现在：窗口内**有一条对得上就不定罪**，窗口内一条记录都没有就闭嘴。 */
    /* 方案 A 第二批：真源已外提 js/t2/ai.js，状态沿用 _t.G()；保留函数声明作薄委托。 */
    /* 口供口径的时间窗：说「刚才」只比最近 20 秒；说「一直/整晚」比整夜；
       没说时段按默认 45 秒。口供说的是哪个时段，就只核对那一段。 */
    /* 记一笔「口供对不上」：顺带统计触发次数与分路明细，供蒙特卡洛对照。
       （误判口径不在这里统计 —— 见 checkAlibi 的 falseContradictions：
        「窗口内同时存在匹配记录」才算旧量词会冤枉人的一次。） */
    /* 只统计、不改行为：用**旧量词**（后 24 条 + 45 秒窗口 + 存在一条不匹配就定罪）
       重算一遍，看看这条修之前每局会冤枉多少人 —— 报告里要能对比出修的量。 */
    /* 方案 A 第二批：真源已外提 js/t2/ai.js（susOf / topSus），状态沿用 _t.G()；
       此处保留同名函数声明作薄委托，下游调用零改动。 */
    /* ---- 准-确证的读取口（2026-11-01）---- */
    /* 准-确证目标：没有 known 时，用它来点名（说「我基本确定」，不是「我确定」） */
    /* 确证目标：亲眼见过异形专属行为的人，不再靠嫌疑分猜。
       返回 {i,score,why,known}，known 里带确证类型（saw_pipe / saw_knife / saw_red…）。 */
    /* 准-确证也能当开枪依据：sus 没到性格门槛，但「基本确定」可以推一把 */
    /* 视野：人类 = 亮房照明 + 手电锥 + 近身圆；异形拿同一只手电（锥形与距离完全一致），
       只有近身圆更长。数值全在 `SKSanity.SIGHT`（2026-11-03 外提）。
       用户裁定：人类近身 **2.8 格**（数值不变，只是搬进表）、异形暗区近身 **3.5 格**
       （旧版只能写成 `HUMAN_DARK_R × 10/9 ≈ 3.11`，改一次要反推乘法，现在直接给数值）。
       异形不再有 360° 远视野，AI 的视距上限也与人类统一。 */
    const SGT=SKSanity.SIGHT;
    const HUMAN_LIGHT_R=SGT.humanLightR;
    const HUMAN_DARK_R=SGT.humanDarkR;               /* 人类近身圆视野 */
    const ALIEN_DARK_R=SGT.alienDarkR;               /* 异形近身圆视野（唯一调参点） */
    const AI_SEE_CAP=SGT.aiCapR;                     /* AI 视距上限：只封暗处，亮区见 aiCanSee 第一条规则 */
    /* ================= 注意力三态（2026-11-05 · A 批前置）=================
       用户裁定：小游戏替代站桩，**正在做小游戏的人视觉被 UI 遮住**，听觉保留。
       attention(actor) 是所有「t 时刻看见 X」的前置条件，只有三态：
         'suspend' 会议 / 结算 / 死亡 / 倒地 / 拘留 —— 不产生任何新感知
         'ui'      小游戏 / 监控 / 破坏选舱 / 管道选点 —— **视觉归零，听觉保留**
         'online'  正常
       口径：它只回答「此刻能不能**看见**」，不回答「听见了什么」，也不持有任何分数。
       禁止写成第二个 sus：三态是闸门，不是权重。 */
    function attention(a){
      if(!a)return 'suspend';
      if(!a.alive||a.downed||a.detained)return 'suspend';
      if(!G||G.over||G.meet)return 'suspend';
      /* 玩家侧的全屏遮罩类交互 */
      if(a===G.me&&(G.camView||G.inspect||G.sabPick||G.pipePick))return 'ui';
      /* 站桩动作（B 批会换成小游戏，状态口径不变） */
      if(a.doing>0)return 'ui';
      return 'online';
    }
    function aiCanSee(a,x,y,maxD){
      if(!a)return false;
      /* ---- 亮区整片可见：与玩家 visibleAt **同一条规则**（2026-11-03 用户裁定放开）----
         以前函数第一行就是 `d>cap return false`，于是站在 44.9 格对角线的亮会议室另一头，
         玩家异形看得见人、AI 异形看不见 —— **AI 比它自己扮演的角色还弱**，
         伪装/暴露度那套"亮房整间都算观众"的口径也因此只对了一半。
         现在只有"同亮舱整间 / 同亮走廊整条 / 亮舱看相连走廊(要 LOS)"这三条免距离上限，
         其余（暗舱、从舱外看进亮房）仍受 cap 与 LOS 约束 —— 不给 AI 超出玩家的视力。
         同亮区**不要求 LOS**：这是 visibleAt 的既有口径（掩体挡不住"灯下整间可见"），
         两边必须一致，否则会重新分叉。 */
      const az=litZoneAt(a.x,a.y);
      if(az){
        const tz=litZoneAt(x,y);
        if(tz===az)return true;
        if(az[0]==='r'&&tz&&tz[0]==='c'&&
          corrJoinsRoom(roomAt(a.x,a.y),M.corridors[+tz.slice(2)])&&
          losNow(a.x,a.y,x,y))return true;
      }
      const d=Math.hypot(a.x-x,a.y-y);
      const cap=maxD==null?AI_SEE_CAP:maxD;
      if(d>cap)return false;
      if(!losNow(a.x,a.y,x,y))return false;
      const tr=roomAt(x,y);
      if(tr&&G.lit[tr.id])return true;
      if(G.lightState===1)return true;
      const ar=roomAt(a.x,a.y);
      if(ar&&G.lit[ar.id])return true;
      if(!ar&&inCorr(a.x,a.y)&&G.corrLit)return true;
      return d<=(a.alien?ALIEN_DARK_R:HUMAN_DARK_R);
    }
    function aiHear(kind,x,y,rad,extra){
      if(!G||G.over||G.meet)return;
      extra=extra||{};
      for(const a of G.agents){
        if(!a.alive||a.downed||a.detained)continue;
        if(extra.actor===a)continue;
        const d=Math.hypot(a.x-x,a.y-y);
        if(d>rad)continue;
        const los=losNow(a.x,a.y,x,y);
        const conf=Math.max(0.12,1-d/rad)*(los?1:0.72);
        const vid=extra.victim==null?null:
          (typeof extra.victim==='object'?extra.victim.i:extra.victim);
        const ev={kind:'heard_'+kind,x,y,room:roomIdAt(x,y),
          subj:extra.subj!=null?extra.subj:null,
          victim:vid,
          conf:+conf.toFixed(2),src:'sound'};
        evPush(a,ev);
        const w=EV_W['heard_'+kind];
        if(w&&extra.subj!=null)susAdd(a,extra.subj,w*conf,'heard_'+kind,ev);
      }
    }
    function envNotice(kind,x,y,conf){
      if(!G||G.over)return;
      for(const a of G.agents){
        if(!a.alive||a.downed||a.detained)continue;
        evPush(a,{kind:'env_'+kind,x,y,room:roomIdAt(x,y),
          conf:conf==null?0.5:conf,src:'env'});
      }
    }
    /* 视觉目击：保留旧的 suspect 契约，同时写入证据与嫌疑分。
       异形不作为目击者写入，避免借证人表反推队友身份。 */
    function noticeAction(actor,x,y,rad,kind,victim){
      if(!G||!actor)return;
      const alienAct=!!actor.alien&&(kind==='knife'||kind==='pipe'||
        kind==='sabotage'||kind==='bot');
      /* 电闸的两种操作语义完全不同（2026-11-01 用户裁定）：
         拉闸断电 → **身份级证据**，人类看见就锁死"他是异形"；
         合闸复电 → **不确证人类**（异形也会合闸伪装），只加正向信任 cred。
         两者都靠 G.lightState 判定（pullBreaker 已先更新状态再广播）。 */
      const breakerOff=kind==='breaker'&&G.lightState===2;
      const breakerOn=kind==='breaker'&&G.lightState!==2;
      const wt=EV_W['saw_'+kind]||0.2;
      for(const w of G.agents){
        if(w===actor||!w.alive||w.downed||w.detained)continue;
        if(w.alien)continue;
        /* A 批（2026-11-05）：正在做小游戏的人视觉被 UI 遮住，不写任何 saw_* 目击。
           这是「异形可以从背后接近做任务的人」的唯一实现点，别在别处再放一条旁路。 */
        if(attention(w)!=='online'){
          if(G.simMode&&G.simStats)G.simStats.uiWitnessSkip=(G.simStats.uiWitnessSkip||0)+1;
          continue;
        }
        const dw=Math.hypot(w.x-x,w.y-y);
        if(dw>rad)continue;
        if(!aiCanSee(w,x,y,rad))continue;
        /* 证据分级（2026-11-02）：**多远才算"亲眼确证"**。
           贴脸（≤ CONFIRM.nearR）看见 → 写 known，会议里敢说"我确定"；
           隔远看见 → 只算"那边有人动手"，按原权重加嫌疑（喂 almost.foe），**不写 known**。
           这一条把"抓现行"的确定性拉下来，判决权交回给推演。 */
        const near=dw<=SKSanity.CONFIRM.nearR;
        const ev={kind:'saw_'+kind,x,y,room:roomIdAt(x,y),subj:actor.i,
          victim:victim?victim.i:null,conf:near?0.95:0.6,src:'sight'};
        if(!near)ev.far=1;
        /* 如果目击者自己已经确证被害者是异形，这枪是处决，不是凶手证据 */
        /* 边界（2026-11-05）：这里问的是「**这个目击者自己**会不会觉得这枪是处决」，
           属于引擎代他推演他自己的信念，不是某个 AI 去读别人的脑子 —— 仍读 w.mind.known。 */
        const justified=kind==='shot'&&victim&&w.mind.known&&w.mind.known[victim.i];
        if(justified)ev.justified=1;
        evPush(w,ev);
        if(!justified&&!breakerOn){
          susAdd(w,actor.i,wt*(near?1:(SKSanity.CONFIRM.farSusMul||1)),'saw_'+kind,ev);
          if(alienAct||breakerOff||kind==='shot'||kind==='detain')w.suspect=actor.i;
        }
        /* 异形专属行为（出刀 / 钻管道 / 破坏设备 / 停摆机器人 / **拉闸断电**）
           是身份级证据：**近距离**看见就等于确证，不再只是加一点嫌疑分。
           开枪、拘留、合闸人类也会做，不算确证。 */
        if((alienAct||breakerOff)&&near){
          w.mind.known[actor.i]={t:ev.t,kind:'saw_'+kind,room:ev.room,conf:0.95};
          w.mind.sus[actor.i]=1;
          knownBump('saw_'+kind);
          w.mind.susNight=w.mind.susNight||{};
          w.mind.susNight[actor.i]=G.night;
          w.mind.why[actor.i]=(w.mind.why[actor.i]||[]).concat([{
            w:1,reason:'确证异形',kind:'saw_'+kind,night:G.night,t:ev.t,x,y,room:ev.room}]).slice(-8);
          /* 硬覆盖：亲眼看见的事实盖掉所有统计性印象（删 almost.friend、清 cred） */
          knownOverride(w,actor.i);
        }else if((alienAct||breakerOff)&&!near){
          if(G&&G.simStats)G.simStats.farSight=(G.simStats.farSight||0)+1;
        }
      }
      /* 人类看见合闸：**不确证**他是人类（异形也会合闸伪装），只加正向信任。
         cred 的真实广播在 pullBreaker 的 credBroadcast（按目击半径给人类）——
         这里只负责"不给合闸记嫌疑"，避免和拉闸混成同一条权重。 */
      /* 异形队友识别：只根据观察到的异形专属行为推断，不读任何队友表。
         断电拉闸（状态变为全黑）也算；人类合闸、开枪、拖尸不算。 */
      if(alienAct||breakerOff){
        for(const w of G.agents){
          if(w===actor||!w.alien||!w.alive||w.downed||w.detained)continue;
          if(Math.hypot(w.x-x,w.y-y)>rad)continue;
          if(!aiCanSee(w,x,y,rad))continue;
          markMate(w,actor,kind);
        }
      }
      /* 异形看见有人**合闸**：给他记一笔"人类可疑度"（humanT），
         但**不写 mates、不写 known** —— 异形自己也会合闸伪装，
         所以这只是一条不确定的倾向，只用来调整挑目标的优先度。
         已认出是自己人的不加（合闸伪装不该反噬队友）。 */
      if(breakerOn){
        for(const w of G.agents){
          if(w===actor||!w.alien||!w.alive||w.downed||w.detained)continue;
          if(Math.hypot(w.x-x,w.y-y)>rad)continue;
          if(!aiCanSee(w,x,y,rad))continue;
          if(isMate(w,actor.i))continue;
          humanishAdd(w,actor.i,SKSanity.HUMANISH.onSight);
        }
      }
      /* 异形自己知道谁在视线里看见了它；这是现场感知，不是读取对方内心 */
      if(actor.alien){
        if(!actor.mind)mindReset(actor);
        for(const w of G.agents){
          if(w===actor||w.alien||!w.alive||w.downed)continue;
          if(Math.hypot(w.x-x,w.y-y)>rad)continue;
          if(!aiCanSee(actor,x,y,rad)||!aiCanSee(w,x,y,rad))continue;
          actor.mind.seenBy[w.i]={t:evNow(),conf:0.9};
        }
      }
    }
    function witnessAlienAction(actor,x,y,rad,kind,victim){
      if(!actor||!actor.alien||!G)return;
      noticeAction(actor,x,y,rad,kind||'alien',victim);
    }
    /* ---- 保安拘留（2026-11-01）：公开可见的抓捕，进记忆但**绝不确证** ----
       两个必须守住的边界：
       1) 不复用 witnessAlienAction —— 它第一行 `if(!actor.alien)return` 会拦掉人类，
          而 pendingCrime 的来源包含人类开枪（fireShot 无阵营过滤），被抓的
          不一定是异形；
       2) 只走嫌疑分（EV_W.saw_detain = 0.6），**不写 mind.known** ——
          README 的硬规则：开枪 / 拖尸 / 拘留这些人类也会做的事只能加嫌疑。
          顺带它也天然不泄露身份：拘留是公开行为，不是阵营查询。
       同一夜对同一个人只记一次（mind.detainSeen），处理「压制」与「押送到位」两次广播。 */
    function witnessDetain(actor,x,y,rad){
      if(!G||!actor)return 0;
      const wt=EV_W.saw_detain||0.6;
      const R=rad==null?10:rad;
      let n=0;
      for(const w of G.agents){
        if(w===actor||!w.alive||w.downed||w.detained)continue;
        if(Math.hypot(w.x-x,w.y-y)>R)continue;
        if(!aiCanSee(w,x,y,R))continue;
        if(!w.mind)mindReset(w);
        const seen=w.mind.detainSeen||(w.mind.detainSeen={});
        if(seen[actor.i]!=null)continue;
        seen[actor.i]=evNow();
        const ev={kind:'saw_detain',x:x,y:y,room:roomIdAt(x,y),
          subj:actor.i,conf:0.9,src:'sight'};
        evPush(w,ev);
        n++;
        /* 异形也看、也记（用来判断局势），但不给自己加嫌疑 */
        if(!w.alien){
          susAdd(w,actor.i,wt,'saw_detain',ev);
          w.suspect=actor.i;
        }
      }
      if(n&&G&&G.simStats)G.simStats.detainWitness=(G.simStats.detainWitness||0)+n;
      return n;
    }
    function isMate(a,i){
      return !!(a&&a.alien&&a.mates&&a.mates[i]);
    }
    /* ---- 异形视角的"这人像人类"（mind.humanT，2026-11-01）----
       与 cred（人类视角的"他干的是正经事"）刻意分开：同一次合闸，
       人类看见 → 信任；异形看见 → 记成"这更像对手"。两条通道谁也不读对方的阵营。
       **不是结论**：异形自己也会合闸伪装，所以它只调优先度，
       绝不写 mates / known，也不会让人因此被"排除嫌疑"。 */
    function humanishAdd(a,i,w){
      if(!a||!a.alien||i==null||i===a.i||!G||!w)return;
      if(!a.mind)mindReset(a);
      if(!a.mind.humanT)a.mind.humanT={};
      a.mind.humanT[i]=Math.min(1,(a.mind.humanT[i]||0)+w);
    }
    function humanishOf(a,i){
      return (a&&a.mind&&a.mind.humanT&&a.mind.humanT[i])||0;
    }
    /* 确证写入计数（只统计；按证据类型拆分，用来回答「哪条通道真的在产出确证」） */
    function knownBump(kind){
      if(!G||!G.simStats)return;
      G.simStats.knownWrites=(G.simStats.knownWrites||0)+1;
      const by=G.simStats.knownBy||(G.simStats.knownBy={});
      by[kind]=(by[kind]||0)+1;
    }
    function markMate(observer,actor,kind){
      if(!observer||!actor||observer===actor||!observer.alien)return;
      if(!observer.mates)observer.mates={};
      observer.mates[actor.i]={t:evNow(),kind:kind||'alien'};
    }
    function bodyWound(b){
      if(!b)return '未知';
      if(b.alive&&b.downed)
        return b.woundCause==='shot'?'枪伤 · 仍在渗血':
          (b.woundCause==='knife'?'刀伤 · 仍在渗血':'重伤 · 仍在渗血');
      if(!b.alive)return causeName(b.deathCause);
      return '无伤';
    }
    /* ---------------- 搜尸 = 检查伤口 + 取走尸体身上的物资 ----------------
       尸体保留生前没花掉的子弹 / 医疗包 / 申请单；搜一次把能带走的都带走，
       背包满了就留在尸体上，下一个人还能再来搜（见 bodyHasLoot）。 */
    function bodyHasLoot(b){
      if(!b)return false;
      return (b.bullet|0)>0||(b.medkit|0)>0||(b.qual|0)>0||(b.qualPending|0)>0;
    }
    function lootBody(a,b){
      if(!a||!b)return {bullet:0,medkit:0,qual:0,none:true};
      const got={bullet:0,medkit:0,qual:0};
      if((a.bullet|0)<1&&(b.bullet|0)>0){got.bullet=1;b.bullet=(b.bullet|0)-1;a.bullet=1;}
      if((a.medkit|0)<1&&(b.medkit|0)>0){got.medkit=1;b.medkit=(b.medkit|0)-1;a.medkit=1;}
      const cap=2-(a.qual|0);
      /* 死者身上已领到的申请单优先，未领取的也一并继承，避免“人死了票就作废” */
      const pool=(b.qual|0)+(b.qualPending|0);
      if(cap>0&&pool>0){
        const n=Math.min(cap,pool);
        const fromQual=Math.min(n,b.qual|0);
        b.qual=(b.qual|0)-fromQual;
        b.qualPending=Math.max(0,(b.qualPending|0)-(n-fromQual));
        got.qual=n;
        a.qual=(a.qual|0)+n;
      }
      got.none=!(got.bullet||got.medkit||got.qual);
      return got;
    }
    function bodyItemsText(b){
      if(!b)return '';
      const p=[];
      if((b.bullet|0)>0)p.push('子弹 ×'+b.bullet);
      if((b.medkit|0)>0)p.push('医疗包 ×'+b.medkit);
      const q=(b.qual|0)+(b.qualPending|0);
      if(q>0)p.push('申请单 ×'+q);
      return p.join(' · ');
    }
    function lootText(got,b){
      const nm=b?b.name:'尸体';
      if(!got||got.none)return nm+'身上没有可带走的物资（伤情记录已更新）';
      const parts=[];
      if(got.bullet)parts.push('子弹 ×'+got.bullet);
      if(got.medkit)parts.push('医疗包 ×'+got.medkit);
      if(got.qual)parts.push('申请单 ×'+got.qual);
      return '从'+nm+'身上取得：'+parts.join(' · ');
    }
    /* AI 判断值不值得为物资停下来搜一次（只在真正的尸体上摸） */
    function aiWantsLoot(a,b){
      if(!a||!b)return false;
      if(a.alien&&isMate(a,b.i))return false;
      if(b.alive&&!b.downed)return false;
      if((a.bullet|0)<1&&(b.bullet|0)>0)return true;
      if((a.medkit|0)<1&&(b.medkit|0)>0)return true;
      if((a.qual|0)<2&&((b.qual|0)>0||(b.qualPending|0)>0))return true;
      return false;
    }
    function bodyInfo(b){
      if(!b)return null;
      const bp=bodyPos(b);
      const t=b.alive?b.downAt:b.deathAt;
      return {i:b.i,name:b.name,alive:b.alive,downed:b.downed,
        wound:bodyWound(b),cause:b.alive?(b.woundCause||null):(b.deathCause||null),
        room:b.alive?(b.downRoom||roomIdAt(b.x,b.y)):
          (b.deathRoom||roomIdAt(b.x,b.y)),
        t:t==null?null:+Number(t).toFixed(1),moved:!!b.bodyMoved,
        searched:!!b.searched,draggedBy:b.draggedBy==null?null:b.draggedBy,
        pos:bp?[+bp[0].toFixed(2),+bp[1].toFixed(2)]:null};
    }
    /* 尸体观察：只有状态变化才记一条，避免每 0.5 秒刷屏 */
    function observeBody(a,v){
      if(!a||!v||!a.mind)return;
      const bi=bodyInfo(v); if(!bi)return;
      /* 记住“这里有自己缺的物资”的尸体/倒地伤员：即使离开视野，30 秒内也会回来收 */
      if(bodyHasLoot(v)&&aiWantsLoot(a,v)){
        const bp=bodyPos(v);
        a._lootMem=a._lootMem||{};
        a._lootMem[v.i]={t:evNow(),x:bp?bp[0]:v.x,y:bp?bp[1]:v.y,room:bi.room};
      }
      const sig=[bi.alive,bi.downed,bi.wound,bi.moved,bi.searched,bi.room].join('|');
      if(a.mind.lastBody&&a.mind.lastBody.i===v.i&&a.mind.lastBody.sig===sig)return;
      a.mind.lastBody={i:v.i,sig:sig};
      const ev={kind:'saw_body',x:bi.pos?bi.pos[0]:0,y:bi.pos?bi.pos[1]:0,
        room:bi.room,subj:null,victim:v.i,conf:0.9,src:'sight',body:bi};
      evPush(a,ev);
      if(bi.moved)evPush(a,Object.assign({},ev,{kind:'saw_body_moved'}));
      a.mind.alert=Math.min(1,a.mind.alert+0.45);
      /* 关联最近 8 秒在同一房间见过的人：只能说明“他在附近”，不能定罪 */
      for(const e of a.mind.mem){
        if(e===ev||e.night!==G.night||e.kind!=='saw_agent'||e.subj==null)continue;
        if(e.room!==bi.room)continue;
        if(Math.abs(e.t-ev.t)>SKSanity.ALIBI.core)continue;
        susAdd(a,e.subj,0.16,'near_body',e);
      }
    }

    /* ---------------- 主循环 ---------------- */
    let last=0, rafId=0, DEAD=false;
    function loop(ts){
      if(DEAD)return;
      const dt=Math.min(0.05,(ts-last)/1000||0); last=ts;
      if(!G.paused&&!G.over&&!G.meet&&!G.inspect) update(dt);
      draw(G.paused?0:dt);
      rafId=requestAnimationFrame(loop);
    }
    
    function update(dt){
      doorTick(dt);
      botTick(dt);
      /* 计时：正常对局交给 SKClock；批量模拟用 simT 推进，避免真实时间阻塞 */
      if(G.simMode){
        G.simT=Math.max(0,(G.simT==null?NIGHT:G.simT)-dt);
        G.t=G.simT;
      }else{
        if(!G.phase) G.phase=SKClock.newPhase('night',performance.now(),NIGHT*1000);
        G.t=SKClock.remaining(G.phase,performance.now())/1000;
      }
      G.playT=(G.playT||0)+dt;
      G._frameAcc=(G._frameAcc||0)+dt;
      if(G._frameAcc>=FRAME_DT){G._frameAcc=0;recordFrame();}
      const me=G.me;
      /* 故障：30 秒倒计时（只在夜里 update 里走），到点未修扣 5 分 */
      dmgTick(dt);
      if(!G.spectMode)sabTick();
      /* 被擒 / 倒下 / 死亡时立刻退出监控台、地道与破坏选择，避免卡在遮罩里 */
      if(!G.spectMode&&G.camView&&(!me.alive||me.downed||me.detained))closeCams(true);
      if(!G.spectMode&&G.wheel&&(!me.alive||me.downed||me.detained))closeWheel(true);
      if(!G.spectMode&&G.pipePick&&(!me.alive||me.downed||me.detained))closePipePick(true);
      if(!G.spectMode&&G.sabPick&&(!me.alive||me.downed||me.detained||!me.alien||me.sabUsed))closeSabPick(true);
      if(!G.spectMode&&G.sabTarget&&(me.sabUsed||!me.alien||!me.alive||me.downed))G.sabTarget=null;
      /* 保安机器人拘留倒计时：30 秒后自动释放 */
      for(const a of G.agents){
        if(!a.detained)continue;
        a.detainedT=(a.detainedT||0)-dt;
        a.moving=false; a.path=null;
        if(a.detainedT<=0){
          a.detained=false; a.detainedT=0;
          if(!G.spectMode&&a===me)toast('保安机器人解锁：你被释放了');
          runInvariants('release');
        }
      }
      // 玩家：活人正常走；幽灵穿墙飘；濒死/被擒不能动。旁观者只移动自己的相机幽灵。
      if(G.spectMode){
        stepSpect(dt);
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
      for(const a of G.agents){
        if(a===me&&!G.spectMode)continue;
        if(!a.alive){ aiGhost(a,dt); continue; }
        if(a.downed||a.detained)continue;
        if(G.simDebug&&G.simMode)console.log('SIM ai '+a.i+' alien='+a.alien+' doing='+a.doing+' path='+(a.path?a.path.length:0));
        if(a.alien) aiAlien(a,dt); else aiHuman(a,dt);
        aiScanBodies(a,dt);
        if(G.simDebug&&G.simMode)console.log('SIM ai done '+a.i);
      }
      tickActs(dt);
      G.trackT=(G.trackT||0)+dt;
      if(G.trackT>=0.4){G.trackT=0;
        for(const a of G.agents) if(a.alive&&!a.downed) trackNight(a);}
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
      if(G.t<=0) dawn();
      checkWin();
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
      if(!G.simMode){
        syncHud();
        G.invT+=dt;
        if(G.invT>=1){ G.invT=0; runInvariants('tick'); }
      }
    }

    /* 无事可做时不要站着（2026-10-31 用户裁定）：
       开局错峰（_delay）、硬控（濒死/被擒/被拖）与短暂恢复（_rest）之外，
       AI 不允许出现"非任务/非维修/非领取"的呆站。任务修完后按
       「去修亮着的故障 → 回圆桌领申请单 → 巡舱」继续移动；
       移动不产生任何情报，站着不动才是白白浪费人类的时间窗口。
       幽灵不参与修故障（2026-11-01 改），巡舱即可。 */
    function aiIdleRoam(a,dt){
      if(!a)return;
      if(!a.path||!a.path.length){
        let tg=null;
        if(!a.ghost&&G.dmg&&G.dmg.length){
          const d=G.dmg[Math.floor(Math.random()*G.dmg.length)];
          tg=[d.x,d.y];
        }else if(!a.ghost&&(a.qualPending||0)>0){
          const q=roundTableClaimSpot();
          if(q)tg=[q.x,q.y];
        }
        if(!tg){
          /* 正向移动（2026-11-03 信任聚焦）：**断电或场上有人倒下**时，
             人本能地往"我信的那一个"靠。以前只有"聊得来"(warm) 一条、且完全不读 cred，
             于是信任永远变不成动作 —— 概率与距离都沿用 WARM 的现成值，不新造数。 */
          const danger=G.lightState===2||G.agents.some(x=>x.alive&&x.downed);
          const tc=(!a.ghost&&danger)?topCred(a):null;
          let lead=tc?G.agents[tc.i]:null;
          if(lead&&(lead===a||!lead.alive||lead.downed||
              Math.hypot(lead.x-a.x,lead.y-a.y)>SKSanity.WARM.range))lead=null;
          const mate=lead||warmMate(a);
          if(mate&&Math.random()<SKSanity.WARM.followChance){
            tg=[mate.x,mate.y];
            if(lead&&G.simMode&&G.simStats)G.simStats.credFollow=(G.simStats.credFollow||0)+1;
          }
        }
        /* ---- 白天结论回流到夜间走位（2026-11-01）----
           会上被谁咬得最狠（他对我的 sus 最高），夜里我会**主动躲开他**：
           不是数值加成，是行为真的变了。反过来，这条也让"他一路绕着我走"成为
           可被看见的反常，白天再拿去用。 */
        if(!tg&&!a.ghost){
          let hater=null,hs=0.45;
          for(const w of G.agents){
            if(w===a||!w.alive||w.downed)continue;
            /* 读心清零（2026-11-05）：不再读 w.mind.sus[a.i]。
               只用「他当众指认过我 / 他刚看见我在现场 / 我还带着红光」来估。 */
            const s=audSusEstimate(a,w).score;
            if(s>hs){hs=s;hater=w;}
          }
          if(hater){
            const dx=a.x-hater.x,dy=a.y-hater.y,d=Math.hypot(dx,dy)||1;
            const R=8+Math.random()*4;
            const tx=a.x+dx/d*R, ty=a.y+dy/d*R;
            const free2=free(tx,ty)?[tx,ty]:nearestFree(tx,ty);
            tg=free2; a._avoidHuman=hater.i;
            if(G.simStats&&G.simMode)G.simStats.avoidCount=(G.simStats.avoidCount||0)+1;
          }
        }
        if(!tg){
          const r=M.rooms[Math.floor(Math.random()*M.rooms.length)];
          const p=randIn(r); tg=[p[0],p[1]];
        }
        walkTo(a,tg[0],tg[1]);
      }
      if(a.path&&a.path.length)stepMove(a,dt,moveSpeed(a));
      else a.moving=false;
    }
    /* 人类 AI 幽灵（2026-11-01 改）：**不再修故障**，全力做剩余任务；
       任务进度严格受 ghostPts 额度限制（每只幽灵最多 2 分），额度耗尽进入游荡。 */
    function aiGhost(a,dt){
      /* 异形幽灵对任务没有任何帮助，也不应该推进人类进度：直接待机。 */
      if(a.alien){a.moving=false;return;}
      if(a._pathCD>0)a._pathCD-=dt;
      if(a.doing>0){a.doing-=dt;if(a.doing<=0)finishDoing(a);return;}
      if((a.ghostPts||0)<2&&a.tIdx<a.tasks.length){
        const p=M.points[a.tasks[a.tIdx]];
        if(p){
          if(Math.hypot(p.x-a.x,p.y-a.y)<2.8){
            if(ghostTaskAllowed(a,p)){startTask(a,p,true);return;}
          }else{
            if(!a.path||!a.path.length)walkTo(a,p.x,p.y);
            stepMove(a,dt,6.5);return;
          }
        }
      }
      /* 修复额度耗尽（或任务做完）→ 游荡：换个舱室继续飘（幽灵是 2.4 格/秒的慢速巡游） */
      if(!a.path||!a.path.length){
        const r=M.rooms[Math.floor(Math.random()*M.rooms.length)];
        const p=randIn(r); a.path=[[p[0],p[1]]];
      }
      if(a.path) stepMove(a,dt,2.4);
    }

    /* 拖拽：玩家与 AI 共用同一套双向标记；尸体跟在拖拽者身后 0.62 格。
       被救活 / 放下 / 会议 / 死亡 / 拘留时自动松手。 */
    function draggerOf(victim){
      if(!victim)return null;
      for(const a of G.agents) if(a.drag!=null&&a.drag===victim.i)return a;
      return null;
    }
    function syncDragOf(a){
      if(!a||a.drag==null)return;
      const v=G.agents[a.drag];
      if(!v||!bodyPos(v)||!a.alive||a.downed||a.detained||G.meet||G.over){
        releaseDragBy(a,true);return;
      }
      const bp=bodyPos(v);
      const dx=bp[0]-a.x, dy=bp[1]-a.y, d=Math.hypot(dx,dy);
      const want=0.62;
      if(d>want){
        const f=nearestFree(a.x+dx/d*want,a.y+dy/d*want);
        if(v.alive){ v.x=f[0]; v.y=f[1]; }
        else { v.bodyX=f[0]; v.bodyY=f[1]; }
        if(!v.bodyMoved){
          const ox=v.alive?v.downX:v.deathX, oy=v.alive?v.downY:v.deathY;
          if(ox!=null&&Math.hypot(f[0]-ox,f[1]-oy)>1.2)v.bodyMoved=true;
        }
      }
      /* 正向信任：把**还活着的伤员**拖进医疗间，是明确的好事（和拖尸体去藏尸相反）。
         同一夜只记一次，避免来回进出刷分。 */
      if(v.alive&&!a._credMed&&inMedRoom(a.x,a.y)){
        a._credMed=true;
        credBroadcast(a,'dragToMed',a.x,a.y);
      }
      /* 尸体被拖离医疗间 2.2 格以上：附近的活人目击一次“反常拖尸”，只加嫌疑 */
      if(!v.alive&&MED_CENTER&&!a._dragAway){
        const dm=Math.hypot(a.x-MED_CENTER[0],a.y-MED_CENTER[1]);
        if(dm>(a._dragMedD0||dm)+2.2){
          a._dragAway=true;
          dragAwayNotice(a,v);
        }
      }
    }
    function startDrag(a,v,silent){
      if(!a||!v||a===v)return false;
      if(!a.alive||a.downed||a.detained)return false;
      if(!bodyPos(v)||v.draggedBy!=null)return false;
      if(a.drag!=null)releaseDragBy(a,true);
      a.drag=v.i; v.draggedBy=a.i;
      a._dragAway=false;
      a._dragMedD0=MED_CENTER?Math.hypot(a.x-MED_CENTER[0],a.y-MED_CENTER[1]):0;
      const bp0=bodyPos(v);
      logEvent('drag_start',{actor:a.i,victim:v.i,downed:!!v.downed,
        room:bp0?roomIdAt(bp0[0],bp0[1]):null,
        x:bp0?+bp0[0].toFixed(1):null,y:bp0?+bp0[1].toFixed(1):null});
      a._reportT=0; a._reportBody=null; a._sawBody=null;
      if(a===G.me&&!G.spectMode){
        G.drag=v.i;
        const tag=document.getElementById('dragtag'); if(tag)tag.classList.remove('hide');
        if(!silent){SND.drag(0.7);hear(a.x,a.y,'drag',0.8);toast('拖拽 '+v.name+' · 移动变慢，再按 D 放下');}
      }
      if(!silent){
        const bp=bodyPos(v);
        if(bp)noticeAction(a,bp[0],bp[1],6,'drag',v);
        aiHear('drag',a.x,a.y,8,{actor:a});
        if(a!==G.me)hear(a.x,a.y,'drag',0.6);
        runInvariants('drag');
      }
      return true;
    }
    function releaseDragBy(a,silent){
      if(!a||a.drag==null)return false;
      const v=G.agents[a.drag];
      if(v&&v.draggedBy===a.i)v.draggedBy=null;
      a.drag=null;
      if(v){
        const bp=bodyPos(v);
        logEvent('drag_end',{actor:a.i,victim:v.i,downed:!!v.downed,
          room:bp?roomIdAt(bp[0],bp[1]):null,
          x:bp?+bp[0].toFixed(1):null,y:bp?+bp[1].toFixed(1):null});
      }
      if(a===G.me&&!G.spectMode){
        G.drag=null;
        const tag=document.getElementById('dragtag'); if(tag)tag.classList.add('hide');
        if(!silent)toast('已放下尸体');
      }
      return true;
    }
    function releaseDrag(silent){ return releaseDragBy(G.me,silent); }
    function releaseAllDrags(silent){
      for(const a of G.agents) if(a.drag!=null)releaseDragBy(a,silent);
      G.drag=null;
      const tag=document.getElementById('dragtag'); if(tag)tag.classList.add('hide');
    }
    /* 拖拽声：玩家听感与 AI 听觉分开；每 1.6 秒给 AI 记一次声纹，避免刷屏 */
    function dragSound(a,dt){
      if(!G||!a||a.drag==null||!a.moving||!a.alive||a.downed)return;
      a._dragSnd=(a._dragSnd||0)+dt;
      if(a._dragSnd<0.72)return;
      a._dragSnd=0;
      const dme=Math.hypot(a.x-G.me.x,a.y-G.me.y);
      if(dme<14)hear(a.x,a.y,'drag',Math.max(0.2,0.7*(1-dme/14)));
      if(dme<14)SND.drag(SND.volAt(a.x,a.y,0.85));
      a._dragAiT=(a._dragAiT||0)+0.72;
      if(a._dragAiT>=1.6){a._dragAiT=0;aiHear('drag',a.x,a.y,8,{actor:a});}
    }
    
    /* AI 目击尸体：靠近 + 视线 → 写入身体证据 → 人类先搜尸 → 再决定是否拉铃。
       不再限制「每晚只开一次会」：同一具尸体在同一夜只能被报道一次（reportNight），
       同一夜多具尸体可以连续开会，跨夜后同一具尸体重新可报。 */
    function aiScanBodies(a,dt){
      if(!a.alive||a.downed||a.detained||G.over)return;
      /* 正在拖尸 / 正按计划"绕一圈再回来报告"时，不让扫描抢先拉铃 */
      if(a.drag!=null||a._reportPlan)return;
      if(!a.mind)mindReset(a);
      if(a._reportT>0){
        a._reportT-=dt;
        if(a._reportT<=0){
          const v=a._reportBody; a._reportBody=null;
          if(v&&bodyPos(v)&&!G.meet&&!G.over){
            const bp=bodyPos(v);
            if(Math.hypot(bp[0]-a.x,bp[1]-a.y)<=5.8&&losNow(a.x,a.y,bp[0],bp[1])){
              /* 额度/场次不够就放弃这次拉铃（报告机会已由 canReportBody 先筛过一遍） */
              if((a.reportLeft|0)>0&&nightMeetLeft()){
                a.reportLeft--;a.reportsUsed=(a.reportsUsed||0)+1;
                markBodyReported(v);G.aiReportUsed=true;
                if(G.simMode&&G.simStats)G.simStats.reportsUsed=(G.simStats.reportsUsed||0)+1;
                openMeeting('night',a,v);
              }
            }
          }
        }
        return;
      }
      a._scanT=(a._scanT||0)+dt;
      if(a._scanT<0.5)return;
      a._scanT=0;
      let best=null,bd=5.4;
      for(const v of G.agents){
        if(v===a)continue;
        const bp=bodyPos(v); if(!bp)continue;
        /* 同一夜每具尸体只能报告一次（2026-11-01 修 bug）：旧代码只拦濒死者，
           真正的死者不拦 —— AI 会反复对同一具尸体拉铃。 */
        if(bodyReported(v))continue;
        const d=Math.hypot(bp[0]-a.x,bp[1]-a.y);
        if(d<bd&&aiCanSee(a,bp[0],bp[1],5.4)){bd=d;best=v;}
      }
      if(!best){a._sawBody=null;return;}
      observeBody(a,best);
      /* 人类先搜查取证；任何 AI 看到伤者/尸体上有自己缺的物资都会停下来搜一次。
         濒死者（还活着）也可以被搜走物资——否则异形永远等不到天亮尸体就被清场。 */
      const rescue=a.medkit>0&&best.alive&&best.downed;
      const busySearch=G.agents.some(x=>x!==a&&x._doing==='search'&&x._sv===best.i);
      const wantEvidence=!a.alien&&!best.searched;
      const wantLoot=aiWantsLoot(a,best);
      if(!rescue&&!busySearch&&!a.drag&&best.draggedBy==null&&bd<2.2&&
        a.doing<=0&&!a._fixGo&&!a._lightGo&&(wantEvidence||wantLoot)){
        a.path=null;a.moving=false;
        a.doing=SKSanity.STAND.search;a._dur=SKSanity.STAND.search;a._doing='search';a._sv=best.i;
        return;
      }
      if(G.noReport)return;
      if(rescue||!canReportBody(a,best))return;
      a._sawBody=best;
      a._reportT=(a.alien?2.0:1.4)+Math.random()*(a.alien?2.0:1.6);
      a._reportBody=best;
    }
    /* 报告判断（2026-10-30 改版）：
       · 不再限制「每晚只开一次会」，改成「同一具尸体同一夜只报道一次」
         （reportNight 记的是哪一夜；天亮入夜后同一具尸体可以再次拉铃）；
       · 异形会主动报告来拖人类的时间，但要权衡收益与暴露风险；
       · 人类只在有实际线索时报告，已经确定凶手则一定报告。 */
    /* 异形报告的价值（2026-11-02 重做，见 SKSanity.MISLEAD）：
       夜晚会议不再吃夜晚时间 → **"拖时间"这项收益整体作废**。
       报告现在的意义是**误导**：把人类聚到现场、把票压到某个好栽赃的人身上、
       同时把自己摘出去。所以收益项 = 现成的靶子 + 可栽赃的人 − 自己的牵连风险，
       风险项 = 案发现场有人看着 / 刚被看见过，稀缺项 = 额度与场次。 */
    function alienReportWorth(a,v){
      const F=SKSanity.MISLEAD;
      /* ① 现成的靶子：已经被人类怀疑起来的人（谁的嫌疑分高，票就往谁身上压） */
      let hot=0,clean=0,selfSus=0;
      for(const w of G.agents){
        if(w===a||!w.alive||w.downed||w.alien)continue;
        /* 读心清零（2026-11-05）：原来扫所有人 mind.sus 取最大值＝读心。
           现在只看**公开指认**：有几个人当众点过他。 */
        const mx=publicHeat(w.i);
        if(mx>=F.hotSus)hot++; else if(mx<=0.12)clean++;
      }
      /* ② 自己的牵连风险：当众指认我的人越多，我出现在案发现场越危险 */
      selfSus=publicHeat(a.i);
      /* ③ 暴露风险：旁边有非队友活人看着时，报告等于把自己放到现场 */
      const wit=watchersAt(a,v.x,v.y,7,a.i).filter(w=>!isMate(a,w.i)).length;
      const risk=wit>=2?F.riskWatch2:(wit===1?F.riskWatch1:1);
      /* ④ 刚被人看见过（25 秒内）就先别抛头露面 */
      const seen=recentWitness(a,25)?F.seenPenalty:1;
      /* ⑤ 每只异形一个固定倾向，避免同一只永远同一套打法 */
      const bias=a._stallBias||1;
      /* ⑥ 稀缺折扣：额度 2 次、每夜 2 场，用一张少一张 */
      const left=Math.max(0,a.reportLeft|0);
      const scarce=left>=2?1:(left===1?0.55:0);
      const meetScarce=nightMeetLeft()<=1?0.7:1;
      const frame=F.base
        +F.hotGain*Math.min(F.hotMax,hot)
        +F.cleanGain*Math.min(F.cleanMax,clean)
        -F.selfRisk*Math.min(1,selfSus);
      return Math.max(0,frame)*risk*seen*bias*scarce*meetScarce;
    }
    function canReportBody(a,v){
      /* 报告 = 花 1/2 全局额度 + 占 1/2 本夜会议名额（2026-11-02）。
         额度见底就直接不进入"要不要报"的判断 —— 否则 AI 会走 2 秒去拉一个拉不响的铃。 */
      if((a.reportLeft|0)<=0||!nightMeetLeft())return false;
      if(v.alive&&v.downed){
        /* 濒死者不是尸体：人类只有在听到动静/掌握嫌疑时才拉铃，
           否则继续任务，避免 AI 把“发现伤者”变成 30 秒会议。 */
        if(a.alien){
          const now=evNow();
          const wits=Object.keys(a.mind.seenBy||{}).filter(k=>{
            const w=G.agents[+k];
            return w&&w.alive&&!w.downed&&now-(a.mind.seenBy[k].t||0)<20;
          });
          return !wits.length;
        }
        /* 已确定凶手必报；否则只在有实际线索/高警觉时报告，避免空耗夜晚 */
        if(bestKnownTarget(a))return true;
        if(a.mind.alert>=0.4)return true;
        /* 夜间读嫌疑：跨夜存量打 0.7 折（见 susOf） */
        return !!topSus(a,0.45,true);
      }
      /* 尸体：异形按收益/风险算一次（每具尸体只算一次，避免反复采样变成必报），人类照常报告 */
      if(a.alien){
        if(!a._reportMemo)a._reportMemo={};
        if(a._reportMemo[v.i]==null)
          a._reportMemo[v.i]=alienReportWorth(a,v)>=SKSanity.MISLEAD.threshold;
        return a._reportMemo[v.i];
      }
      return true;
    }

    /* 最近的可救目标：只认视线内的濒死者，避免 AI 隔墙“知道”谁倒了 */
    function nearestDowned(a,maxD){
      let best=null,bd=maxD;
      for(const v of G.agents){
        if(v===a||!v.alive||!v.downed)continue;
        const d=Math.hypot(v.x-a.x,v.y-a.y);
        if(d<bd&&aiCanSee(a,v.x,v.y,maxD)){bd=d;best=v;}
      }
      return best;
    }
    /* 谁会去翻尸体/伤者：人类需要证据/物资，异形需要子弹/医疗包/申请单。
       先走到目标旁，再由 search 结算；活着且没倒下的不搜。 */
    function nearestLootBody(a,maxD){
      let best=null,bd=maxD;
      for(const v of G.agents){
        if(v===a)continue;
        const bp=bodyPos(v); if(!bp||(v.alive&&!v.downed))continue;
        if(a.alien&&isMate(a,v.i))continue;
        if(v.draggedBy!=null||!bodyHasLoot(v)||!aiWantsLoot(a,v))continue;
        const d=Math.hypot(bp[0]-a.x,bp[1]-a.y);
        if(d<bd&&aiCanSee(a,bp[0],bp[1],maxD)){bd=d;best=v;}
      }
      return best;
    }
    function startLootSearch(a,v,dt){
      if(!a||!v||!bodyHasLoot(v)||!aiWantsLoot(a,v))return false;
      if(a.alien&&isMate(a,v.i))return false;
      if(v.draggedBy!=null)return false;
      const bp=bodyPos(v); if(!bp)return false;
      if(G.agents.some(x=>x!==a&&x._doing==='search'&&x._sv===v.i))return false;
      if(a.alien&&G.simMode&&G.simStats)G.simStats.alienLootTries++;
      if(a._lootMem)delete a._lootMem[v.i];
      const d=Math.hypot(bp[0]-a.x,bp[1]-a.y);
      if(d<2.2){
        a.path=null;a.moving=false;
        a.doing=SKSanity.STAND.search;a._dur=SKSanity.STAND.search;a._doing='search';a._sv=v.i;
        return true;
      }
      if(!a.path||!a.path.length)walkTo(a,bp[0],bp[1]);
      if(!a.path||!a.path.length){
        if(a._lootMem)delete a._lootMem[v.i];
        return false;
      }
      stepMove(a,dt,moveSpeed(a));return true;
    }
    function lootRun(a,dt){
      if(!a||a.doing>0||a.drag!=null||a._fixGo||a._lightGo)return false;
      if(!((a.bullet|0)<1||(a.medkit|0)<1||(a.qual|0)<2))return false;
      const v=nearestLootBody(a,12);
      if(v&&startLootSearch(a,v,dt))return true;
      /* 视野里没有时，回到 30 秒内见过、仍然带自己缺的物资的目标：
         形成“看到伤者 → 之后专门绕回去收尸”的节奏，而不是只在贴脸时顺手摸一下。 */
      const mem=a._lootMem||{};
      let best=null,bd=20;
      for(const k in mem){
        const t=mem[k], v2=G.agents[+k];
        if(!v2||!t||evNow()-t.t>30||!bodyHasLoot(v2)||v2.draggedBy!=null||
          !aiWantsLoot(a,v2)){
          delete mem[k];continue;
        }
        const bp=bodyPos(v2); if(!bp){delete mem[k];continue;}
        const d=Math.hypot(bp[0]-a.x,bp[1]-a.y);
        if(d<bd){bd=d;best=v2;}
      }
      return !!(best&&startLootSearch(a,best,dt));
    }
    /* 医疗间复活调度：AI 人类没有医疗包时，会把濒死者拖到医疗间交给医疗无人机 */
    let MED_DROP=null;
    function medbotUsable(){
      return !!(G&&!G.medbotDead&&(G.medbotLeft==null?MEDBOT_CHARGES:G.medbotLeft)>0);
    }
    function inMedRoom(x,y){const r=roomAt(x,y);return !!(r&&r.id==='med');}
    /* 拖拽目标点：无人机固定在医疗间正中央悬停，把人丢进医疗间任意位置它都会飞过来，
       所以目标点就是房间中心，不再追着巡逻中的机器人跑。 */
    function medDropSpot(){
      const b=medbotUsable()?botPos('medbot'):null;
      if(b&&inMedRoom(b.x,b.y))return nearestFree(b.x,b.y);
      if(!MED_DROP){const mr=M.rooms.find(r=>r.id==='med');MED_DROP=nearestFree(mr.rect[0]+mr.rect[2]/2,mr.rect[1]+mr.rect[3]/2);}
      return MED_DROP;
    }
    /* 只要在医疗间里就算到位：无人机会自己飞过来，不再要求贴近机器人 */
    function nearMedBot(v,rad){
      if(!v)return false;
      if(inMedRoom(v.x,v.y))return true;
      const b=botPos('medbot');
      return !!(b&&Math.hypot(v.x-b.x,v.y-b.y)<(rad||4.5));
    }
    /* 故障被别人修好后，正在站桩/赶路的人立即放弃，不浪费剩下的时间 */
    function dropStaleFix(a){
      if(!a)return;
      if(a._doing==='fix'&&(!a._fix||G.dmg.indexOf(a._fix)<0)){
        a._doing=null;a._fix=null;a.doing=0;
        if(a===G.me)toast('故障已被队友修好，停止维修');
      }
      if(a._fixGo&&G.dmg.indexOf(a._fixGo)<0){
        a._fixGo=null;
        if(a.path&&a.doing<=0){a.path=null;a.moving=false;}
      }
    }
    /* 正在修任务时，已确证的异形在视野内快速靠近，且赶不上修完 → 弃修逃跑 */
    function taskThreat(a,remain){
      if(!a||a.alien||!a.alive||a.downed)return null;
      const kn=bestKnownTarget(a);
      if(!kn)return null;
      const t=G.agents[kn.i];
      if(!t||!t.alive||t.downed||t===a)return null;
      const d=Math.hypot(t.x-a.x,t.y-a.y);
      if(d>7||!aiCanSee(a,t.x,t.y,7))return null;
      const closing=!!(t.moving||(t.path&&t.path.length));
      if(!closing&&d>3.5)return null;
      const travel=d/Math.max(1,moveSpeed(t));
      /* 弃修阈值随性格：激进的人剩下 1 秒也要修完，谨慎的人早早就跑（2026-10-31） */
      return (remain==null?2.5:remain)>(travel-0.6)*SKTrait.C.fleeThreshold(a)?t:null;
    }
    function fleeTask(a,t){
      a.doing=0;a._doing=null;a._taskPt=null;
      a._fleeT=3.5+Math.random()*1.5;a._fleeFrom=t?t.i:null;
      const ang=t?Math.atan2(a.y-t.y,a.x-t.x):Math.random()*6.283;
      const bx=Math.max(1,Math.min(M.bounds.w-1,
        a.x+Math.cos(ang)*(7+Math.random()*3)));
      const by=Math.max(1,Math.min(M.bounds.h-1,
        a.y+Math.sin(ang)*(7+Math.random()*3)));
      let q=nearestFree(bx,by);
      if(!free(q[0],q[1])){
        const r=M.rooms[Math.floor(Math.random()*M.rooms.length)];
        q=nearestFree(r.rect[0]+r.rect[2]/2,r.rect[1]+r.rect[3]/2);
      }
      a.path=null;a.moving=false;walkTo(a,q[0],q[1]);
      if(a===G.me&&!G.spectMode)toast('异形正在靠近，放弃维修');
    }
    function aiHuman(a,dt){
      if(G.meet||G.over)return;
      if(a.detained)return;
      if(a._pathCD>0)a._pathCD-=dt;
      dropStaleFix(a);
      if(a.doing>0&&a._doing==='task'){
        const th=taskThreat(a,a.doing);
        if(th){fleeTask(a,th);return;}
      }
      if(a._fleeT>0){
        a._fleeT-=dt;
        if(a.path&&a.path.length)stepMove(a,dt,moveSpeed(a));else a.moving=false;
        return;
      }
      if(a.doing>0){a.doing-=dt;if(a.doing<=0)finishDoing(a);return;}
      if(a._rest>0){a._rest-=dt;a.moving=false;return;}
      /* 开局先各自散开、错峰开工，避免所有人同一秒冲向任务点 */
      if(a._delay>0){
        a._delay-=dt;
        if(!a.path||!a.path.length){
          if(Math.random()<dt*0.45){
            const r=M.rooms[Math.floor(Math.random()*M.rooms.length)];
            const p=randIn(r); walkTo(a,p[0],p[1]);
          }else a.moving=false;
        }
        if(a.path&&a.path.length) stepMove(a,dt,moveSpeed(a));
        return;
      }
      /* 已经在拖人：人进了医疗间就松手（无人机会自己飞过来）；拖拽中状态失效就松手 */
      if(a.drag!=null){
        const v=G.agents[a.drag];
        if(!v||!v.alive||!v.downed){releaseDragBy(a,true);}
        else if(!medbotUsable()){releaseDragBy(a,true);a._rest=1.0;return;}
        else if(nearMedBot(v)){releaseDragBy(a,true);a._rest=1.0;return;}
        else{
          const m=medDropSpot();
          if(Math.hypot(a.x-m[0],a.y-m[1])<1.0){
            /* 已经贴到无人机坞位却还没进房间：原地等一下，不在医疗间门口乱转 */
            a.moving=false;return;
          }
          if(!a.path||!a.path.length)walkTo(a,m[0],m[1]);
          stepMove(a,dt,moveSpeed(a));return;
        }
      }
      /* 医疗包优先救人：濒死者拖到天亮会失血而死，AI 会主动跑过去按 F */
      if(a.medkit>0&&(!a.path||!a.path.length)){
        const v=nearestDowned(a,7.5);
        const busy=v&&(v.draggedBy!=null||G.agents.some(x=>x!==a&&x._doing==='revive'&&x._rv===v));
        if(v&&!busy){
          if(Math.hypot(v.x-a.x,v.y-a.y)<1.7){
            a.doing=SKSanity.STAND.revive;a._dur=SKSanity.STAND.revive;a._doing='revive';a._rv=v;a.path=null;
            setAct(a,'heal',0.6,{ang:0});
          }else walkTo(a,v.x,v.y);
          return;
        }
      }
      /* 有枪 + 有目击凶手 / 高置信证据：射程内直接开枪，结算与玩家共用 fireShot */
      if(a.bullet>0){
        let si=a.suspect;
        if(si!=null){
          const s=G.agents[si];
          if(!s||s===a||!s.alive||s.downed){a.suspect=null;si=null;}
        }
        if(si==null){
          /* 开枪门槛随性格：激进 0.36 就敢打，谨慎要 0.60（中性 0.50）。
             2026-11-01：再叠准-确证 —— 对「基本确定是异形」的人门槛 ×0.7，
             对「基本是好人」的人 ×1.4（更舍不得开枪）；夜间读取存量嫌疑再打 0.7 折。 */
          let thr=SKTrait.C.shootSus(a);
          const af=bestAlmostTarget(a);
          if(af)thr*=SKSanity.ALMOST.foeShootMul;
          let bs=bestSusTarget(a,thr,true);
          if(bs&&almostFriendOf(a,bs.i))bs=null;
          if(!bs)bs=affordableAlmostShot(a,thr);
          if(bs)si=bs.i;
        }
        if(si!=null){
          const s=G.agents[si];
          const kn=bestKnownTarget(a);
          const sure=!!(kn&&kn.i===si);
          /* 射程不再分"有没有确证"（那是**意愿**，不是能力）：与玩家同一个 SHOT.range。
             有确证只是更愿意追更远的路去开枪（chaseR）。 */
          const SH=SKSanity.SHOT;
          const shootR=SH.range, chaseR=sure?SH.chaseKnown:SH.chaseSus;
          const d=Math.hypot(s.x-a.x,s.y-a.y);
          if(d<shootR&&aiCanSee(a,s.x,s.y,shootR)){
            fireShot(a,s);a._rest=2.5+Math.random()*2;return;
          }
          if(d<chaseR){
            if(!a.path||!a.path.length)walkTo(a,s.x,s.y);
            stepMove(a,dt,moveSpeed(a));return;
          }
        }
      }
      /* 没有医疗包但医疗无人机可用：把视线内的濒死者拖进医疗间，交给机器人复活。
         只排除"自己刚开枪打倒的人"，避免救活自己刚制服的嫌疑人。 */
      if(a.medkit<1&&medbotUsable()){
        const v=nearestDowned(a,8.5);
        if(v&&v.draggedBy==null&&v.killedBy!==a.i&&!inMedRoom(v.x,v.y)){
          if(Math.hypot(v.x-a.x,v.y-a.y)<1.9){
            startDrag(a,v);
            const m=medDropSpot();
            if(!a.path||!a.path.length)walkTo(a,m[0],m[1]);
            stepMove(a,dt,moveSpeed(a));return;
          }
          walkTo(a,v.x,v.y);stepMove(a,dt,moveSpeed(a));return;
        }
      }
      /* 全船断电：先让 1 名人类 AI 去合闸；断电视野差，优先级高于零散任务。
         合闸人一旦被指定就不再抢故障，避免两个目标来回切换。 */
      if(G.lightState===2){
        const br=M.facility.find(f=>f.kind==='breaker');
        if(br){
          if(!a._lightGo){
            const crew=G.agents.filter(x=>x!==a&&x._lightGo&&x.alive&&!x.downed).length;
            if(crew<1)a._lightGo=true;
          }
          if(a._lightGo){
            if(Math.hypot(br.x-a.x,br.y-a.y)<BREAKER_USE_R){
              /* 2026-11-03 用户裁定"AI 与玩家数值完全一致"：合闸站桩改走**同一个**
                 breakerOnTime()（断电当夜 4.5 秒）。旧代码硬写 3 秒，AI 比玩家快 1.5 秒复电。 */
              a.path=null;a.moving=false;a.doing=breakerOnTime();
              a._dur=a.doing;a._doing='breaker';return;
            }
            if(!a.path||!a.path.length)walkTo(a,br.x,br.y);
            stepMove(a,dt,moveSpeed(a));return;
          }
        }
      }else if(a._lightGo)a._lightGo=false;
      /* 故障抢修（2026-11-01 去名额制）：不再限制"一座故障最多 2 名响应"——
         每个人都可以参与修破坏，最近的人先到先修，后来的一起修（finishFix 会
         让所有人同时松手）。锁定后不被脚步声/任务点打断，避免踱步。 */
      if(G.dmg.length){
        if(a._fixGo&&G.dmg.indexOf(a._fixGo)<0)a._fixGo=null;
        if(!a._fixGo){
          let best=null,bd=1e9;
          for(const d of G.dmg){
            /* 团队量化表（SKTeam.FIX_CREW_CAP）：同一故障超过 3 人在赶/在修，
               边际收益为负 —— 认定队友能修好，自己去做任务性价比更高（防踩踏） */
            const crew=G.agents.filter(x=>x!==a&&((x._doing==='fix'&&x._fix===d)||x._fixGo===d)).length;
            if(crew>=SKTeam.FIX_CREW_CAP)continue;
            const dd=Math.hypot(d.x-a.x,d.y-a.y);
            if(dd<bd){bd=dd;best=d;}
          }
          if(best&&best!==a._fixGo){a._fixGo=best;a.path=null;}
        }
        if(a._fixGo){
          const d=a._fixGo;
          if(Math.hypot(d.x-a.x,d.y-a.y)<1.5){startFix(a,d);return;}
          if(!a.path||!a.path.length)walkTo(a,d.x,d.y);
          stepMove(a,dt,moveSpeed(a));return;
        }
      }
      /* 尸体上有自己缺的子弹/医疗包/申请单 → 主动去翻尸（人类同样会搜尸取证） */
      if(lootRun(a,dt))return;
      /* 听到尖叫/枪声/刀声：高警觉且手头没有更急的事时，去现场看一眼 */
      if(a.mind&&a.mind.alert>=0.7&&a.mind.noise&&!a._look){
        const n=a.mind.noise;
        if(evNow()-n.t<8&&Math.hypot(n.x-a.x,n.y-a.y)>3){
          a._look={x:n.x,y:n.y,t:evNow()};
          walkTo(a,n.x,n.y);
        }else{a.mind.alert=0;a.mind.noise=null;}
      }
      if(a._look){
        if(Math.hypot(a._look.x-a.x,a._look.y-a.y)<3||
          evNow()-a._look.t>10){
          a._look=null;a.mind.alert=Math.max(0,a.mind.alert-0.5);a.mind.noise=null;
        }else{
          if(!a.path||!a.path.length)walkTo(a,a._look.x,a._look.y);
          stepMove(a,dt,moveSpeed(a));return;
        }
      }
      if(a.path&&a.path.length){ stepMove(a,dt,moveSpeed(a)); return; }
      /* 物资申请单必须回中央会议室圆桌领取 */
      if(a.qualPending>0){
        const qd=roundTableClaimSpot();
        if(qd){
          if(Math.hypot(qd.x-a.x,qd.y-a.y)<1.8){
            a.path=null;a.moving=false;
            a.doing=SKSanity.STAND.qual;a._dur=SKSanity.STAND.qual;a._doing='qual';return;
          }
          walkTo(a,qd.x,qd.y);stepMove(a,dt,moveSpeed(a));return;
        }
      }
      /* 已经站在专用补给点：消耗申请单换物资 */
      const spNear=nearSupply(a);
      if(spNear&&a.qual>0){
        if(spNear.item==='ammo'&&a.bullet<1){a.path=null;a.moving=false;a.doing=SUPPLY_AMMO_TIME;a._dur=SUPPLY_AMMO_TIME;a._doing='ammo';return;}
        if(spNear.item==='med'&&a.medkit<1){a.path=null;a.moving=false;a.doing=SUPPLY_MED_TIME;a._dur=SUPPLY_MED_TIME;a._doing='med';return;}
      }
      /* 有申请单且确实需要（目击凶手缺弹 / 有人濒死缺包）→ 主动去对应补给点 */
      const need=supplyTargetFor(a);
      if(need){
        const sp=supplyPoints().find(q=>q.item===need);
        if(sp){
          if(Math.hypot(sp.x-a.x,sp.y-a.y)<1.7){
            a.path=null;a.moving=false;
            if(need==='ammo'){a.doing=SUPPLY_AMMO_TIME;a._dur=SUPPLY_AMMO_TIME;a._doing='ammo';}
            else{a.doing=SUPPLY_MED_TIME;a._dur=SUPPLY_MED_TIME;a._doing='med';}
            return;
          }
          walkTo(a,sp.x,sp.y);stepMove(a,dt,moveSpeed(a));return;
        }
      }
      /* 任务全做完：不再原地呆站（2026-10-31），改去干别的有用的事 */
      if(a.tIdx>=a.tasks.length){ aiIdleRoam(a,dt); return; }
      /* 听从安排（2026-11-03 用户裁定）：领袖当众说过"你去某舱"，
         就把那个舱的任务换到当前位 —— 服从概率 = 本局号召力 ×「我有多信他」。
         号召力 0 的局一个都不听、1 的局全都听，**两端都不截断**。
         命令只在本夜有效（天亮重排，不留跨夜的隐性指令）。
         没照办的人记 `orderBroke`：那是能被同舱的人看见的事实（下次会议有人会提）。 */
      {
        const od=a.mind&&a.mind.order;
        if(od&&od.night===G.night){
          a.mind.order=null;
          const idx=a.tasks.findIndex((t,ix)=>ix>=a.tIdx&&M.points[t].room===od.room);
          const obeyP=(G.leaderCharisma||0)*obeyTrustMul(a,od.by);
          /* `idx===a.tIdx`（本来就要去那间）算**已经照办**，不是抗命：
             以前这条落进 else 记成 orderBroke，遥测会把"根本没动"的人算成拒绝，
             领袖服从率因此被系统性低估（行为不变，只是读数的口径纠正）。 */
          if(idx===a.tIdx||(idx>a.tIdx&&Math.random()<obeyP)){
            if(idx>a.tIdx){
              const cur=a.tasks[a.tIdx];a.tasks[a.tIdx]=a.tasks[idx];a.tasks[idx]=cur;
            }
            a.mind.orderDone=od.room;
            if(G.simMode&&G.simStats)G.simStats.orderObey=(G.simStats.orderObey||0)+1;
          }else{
            a.mind.orderBroke=od.room;
            if(G.simMode&&G.simStats)G.simStats.orderRefuse=(G.simStats.orderRefuse||0)+1;
          }
        }
      }
      const p=M.points[a.tasks[a.tIdx]];
      if(Math.hypot(p.x-a.x,p.y-a.y)<2.8){
        const th=taskThreat(a,p.dur);
        if(th){fleeTask(a,th);return;}
        a.doing=p.dur; a._dur=a.doing; a._doing='task';
        a._taskPt=a.tasks[a.tIdx];
      }else walkTo(a,p.x,p.y);
    }
    /* ---- 藏尸点 / 藏尸对象 ---- */
    const HIDE_SPOTS={};
    function hideSpotFor(rid){
      if(Object.prototype.hasOwnProperty.call(HIDE_SPOTS,rid))return HIDE_SPOTS[rid];
      const r=M.rooms.find(q=>q.id===rid);
      if(!r){HIDE_SPOTS[rid]=null;return null;}
      const [x0,y0,w,h]=r.rect, cx=x0+w/2, cy=y0+h/2;
      let best=null,bestScore=-1e9;
      for(let y=y0+0.7;y<=y0+h-0.7;y+=0.6){
        for(let x=x0+0.7;x<=x0+w-0.7;x+=0.6){
          if(!free(x,y)||!inPoly(x,y,r.poly))continue;
          if(M.cover.some(c=>x>=c.x-0.3&&x<=c.x+c.w+0.3&&y>=c.y-0.3&&y<=c.y+c.h+0.3))continue;
          let score=0,doorD=1e9,pointD=1e9;
          for(const d of (G.doors||[])){
            if(d.x<x0-1||d.x>x0+w+1||d.y<y0-1||d.y>y0+h+1)continue;
            doorD=Math.min(doorD,Math.hypot(x-d.x,y-d.y));
          }
          for(const p of M.points){
            if(p.room!==rid)continue;
            pointD=Math.min(pointD,Math.hypot(x-p.x,y-p.y));
          }
          if(doorD<1e9)score+=Math.min(6,doorD)*1.5;
          if(pointD<1e9)score+=Math.min(6,pointD)*1.2;
          score+=Math.min(7,Math.hypot(x-cx,y-cy))*0.5;
          if(score>bestScore){bestScore=score;best=[x,y];}
        }
      }
      HIDE_SPOTS[rid]=best;
      return best;
    }
    /* 藏尸目的地：永远排除医疗间和会议室，并尽量把尸体拖离医疗间——
       越远医疗间分越高，同时每多拖 1 格扣 0.55 分，避免为了藏尸横穿全图。 */
    /* 藏尸目的地：远离医疗间的方向 + 远离活人 + 随机挑选，
       不再每局都把尸体固定拖去仓库（旧实现是纯确定性最高分，仓库离医疗间最远）。 */
    function hideRoomFor(rid,x,y){
      const med=M.rooms.find(r=>r.id==='med');
      const mc=med?nearestFree(med.rect[0]+med.rect[2]/2,med.rect[1]+med.rect[3]/2):null;
      const cands=[];
      for(const r of M.rooms){
        if(r.id==='med'||r.id==='bridge'||r.id===rid)continue;
        const c=nearestFree(r.rect[0]+r.rect[2]/2,r.rect[1]+r.rect[3]/2);
        const dBody=Math.hypot(c[0]-x,c[1]-y);
        const dMed=mc?Math.hypot(c[0]-mc[0],c[1]-mc[1]):0;
        let crowd=0,near=1e9;
        for(const a of G.agents){
          if(!a.alive||a.downed||a.detained)continue;
          const dd=Math.hypot(a.x-c[0],a.y-c[1]);
          if(dd<10){crowd++;if(dd<near)near=dd;}
        }
        /* 有人看着的房间优先排除；实在没有空房时才选人少的 */
        const risk=crowd?(crowd*10/(1+near)):0;
        const score=dMed-dBody*0.55-risk*6+Math.random()*7;
        cands.push({id:r.id,score,crowd});
      }
      if(!cands.length)return rid;
      const empty=cands.filter(c=>c.crowd===0);
      const pool=(empty.length?empty:cands).sort((a,b)=>b.score-a.score).slice(0,3);
      return pool[Math.floor(Math.random()*pool.length)].id;
    }
    /* 医疗间中心：判断“拖尸是不是在往医疗间走” */
    const MED_CENTER=(function(){
      const r=M.rooms.find(q=>q.id==='med');
      return r?[r.rect[0]+r.rect[2]/2,r.rect[1]+r.rect[3]/2]:null;
    })();
    /* 目击者看到“尸体被拖离医疗间” → 只加嫌疑，不写 known（拖尸人类也会做） */
    function dragAwayNotice(a,v){
      if(!a||!v||v.alive)return;
      logEvent('drag_away',{actor:a.i,victim:v.i,room:roomIdAt(a.x,a.y),
        x:+a.x.toFixed(1),y:+a.y.toFixed(1)});
      for(const w of G.agents){
        if(w===a||w.alien||!w.alive||w.downed||w.detained)continue;
        if(Math.hypot(w.x-a.x,w.y-a.y)>6)continue;
        if(!aiCanSee(w,a.x,a.y,6))continue;
        w._dragAwaySeen=w._dragAwaySeen||{};
        const key=a.i+':'+G.night;
        if(w._dragAwaySeen[key])continue;
        w._dragAwaySeen[key]=1;
        const ev={kind:'saw_drag_away',x:a.x,y:a.y,room:roomIdAt(a.x,a.y),
          subj:a.i,victim:v.i,conf:0.85,src:'sight'};
        evPush(w,ev);
        susAdd(w,a.i,EV_W.saw_drag_away,'saw_drag_away',ev);
        if(w.suspect==null||(w.mind.sus[w.suspect]||0)<0.5)w.suspect=a.i;
      }
    }
    function findHideBody(a){
      let best=null,bd=3.2;
      for(const v of G.agents){
        if(v===a)continue;
        const bp=bodyPos(v); if(!bp)continue;
        if(v.draggedBy!=null)continue;
        /* 尸体上还有自己缺的物资：先搜尸再藏，别把子弹/医疗包一起埋了 */
        if(aiWantsLoot(a,v))continue;
        const d=Math.hypot(bp[0]-a.x,bp[1]-a.y);
        if(d<bd&&aiCanSee(a,bp[0],bp[1],3.6)){bd=d;best=v;}
      }
      return best;
    }
    function recentWitness(a,sec){
      if(!a||!a.mind||!a.mind.seenBy)return false;
      const now=evNow();
      for(const k in a.mind.seenBy){
        if(now-(a.mind.seenBy[k].t||0)>=sec)continue;
        const w=G.agents[+k];
        if(w&&w.alive&&!w.downed)return true;
      }
      return false;
    }
    /* 某个位置（通常是受害者脚下）除了受害者以外，还有哪些活人看得见。
       不按 alien 过滤：AI 不读取队友身份，异形同伴也会被当成"旁人"。
       半径与 witnessAlienAction 的 6 格取证一致，避免"规则看不见、实际被看到"。 */
    /* ---- 出手隐蔽性（2026-11-01）----
       理智层要的是"这一下有多显眼"，不是"几个人在 6 格内"。这里只负责把游戏状态
       换成暴露度需要的输入，权重与汇总的数学全在 js/ai/sanity.js（纯函数、可单测）。
       sightRangeAt 与玩家侧 visibleAt 同一口径：亮房整间、亮走廊 12 格、暗房 2.8 格 ——
       以前 AI 一律按 6 格数人头，亮房里 10 格外的证人它根本看不见，
       于是会当着人出刀而自以为没人发现（会议室对角线 44.9 格）。 */
    function sightRangeAt(x,y){
      const r=roomAt(x,y);
      if(r&&G.lit[r.id])return Math.max(r.rect[2],r.rect[3])*SGT.litRoomMul;
      if(!r&&inCorr(x,y)&&G.corrLit)return SGT.corrR;
      return HUMAN_DARK_R;
    }
    /* 逃逸距离：出刀后 killer.redT=3.0 三秒红身，离门/管道口越近越容易走干净 */
    function exitDistAt(x,y){
      let best=1e9;
      for(const d of (G.doors||[]))best=Math.min(best,Math.hypot(d.x-x,d.y-y));
      for(const q of M.pipes)best=Math.min(best,Math.hypot(q.x-x,q.y-y));
      return best;
    }
    /* 暴露度 ∈ [0,1]：0 = 完全没人看得见，1 = 一群人围着看。
       except = 这一刀的**受害者**：他当然看得见，但他躲不掉，不能算进"可避免的暴露"，
       否则任何一次出手都会自带 1.0 的暴露分，理智线永远过不去。 */
    function exposureAt(a,x,y,except){
      const R=Math.max(HUMAN_DARK_R,sightRangeAt(x,y));
      const ws=[];
      for(const w of G.agents){
        if(w===a||w===except||!w.alive||w.downed||w.detained||isMate(a,w.i))continue;
        const d=Math.hypot(w.x-x,w.y-y);
        if(d>R||!losNow(w.x,w.y,x,y))continue;
        ws.push(SKSanity.witnessWeight(d,R,w.doing>0));
      }
      return SKSanity.exposure(ws,SKSanity.escapeCost(exitDistAt(x,y)));
    }
    /* 人群密度：R 格内非队友活人数（不看视线，纯"周围有没有人"） */
    function crowdAt(a,x,y,R){
      let n=0;
      for(const w of G.agents){
        if(w===a||!w.alive||w.downed||w.detained||isMate(a,w.i))continue;
        if(Math.hypot(w.x-x,w.y-y)<=R)n++;
      }
      return n;
    }
    /* 数"有几个人能看见这一下"。
       ⚠ 半径不能只调用方给多少就量多少：以前刀口那条固定 6 格，
       而亮舱/亮走廊按 `sightRangeAt` 是**整间可见**（会议室对角 42 格）——
       于是异形会当着满屋子人出刀，还自以为没人看见。
       现在取两者的较大值：调用方的 `rad` 只是"我至少关心这么远"，
       真正的可见性判据仍然是那条全船统一的 `aiCanSee`（亮区整片、暗处近身圆）。 */
    function watchersAt(a,x,y,rad,except){
      const out=[];
      const R=Math.max(rad||0,sightRangeAt(x,y));
      for(const w of G.agents){
        if(w===a||w===except||!w.alive||w.downed||w.detained)continue;
        /* A 批（2026-11-05）：做小游戏 / 开遮罩的人看不见，不计入观众表 */
        if(attention(w)!=='online')continue;
        if(Math.hypot(w.x-x,w.y-y)>R)continue;
        if(!aiCanSee(w,x,y,R))continue;
        out.push(w);
      }
      return out;
    }
    /* 报告前的"不在场"落点：先去 6~24 格外的房间晃一圈，再回现场 */
    function reportAlibiSpot(a){
      const cands=[];
      for(const r of M.rooms){
        if(r.id==='bridge')continue;
        const c=nearestFree(r.rect[0]+r.rect[2]/2,r.rect[1]+r.rect[3]/2);
        const d=Math.hypot(c[0]-a.x,c[1]-a.y);
        if(d>6&&d<24)cands.push(r);
      }
      if(!cands.length)return null;
      return randIn(cands[Math.floor(Math.random()*cands.length)]);
    }
    /* 异形的"伪装/补给"支持：拿申请单、换子弹、翻尸、偶尔做任务换弹。
       伪装（假装维修/假装做任务/当众合闸）2026-11-03 起**全部进 alienPlan 效用表**，
       不再挂在这里的 if 硬排里 —— 见下面的 alienAudienceInfo / disguiseSpotFor。 */
    /* 观众表（2026-11-03）：附近能当"观众"的非队友活人 + 按人加权。
       旧版把每个观众都当 1 分（等于"演给谁都一样"），而且收益按人数、风险也按人数，
       两个公式量的是同一件事、互相打架。现在：
         · 权重看"这个人对我有多少怀疑"（susOf 夜间口径：跨夜存量 ×0.7）与
           "他说话有没有人听"（soc 轴 / 本局领袖）；
         · idle 单独数"闲着看我的人"，那是**被识破**的风险，不是收益。
       返回 {n 人数, weight 加权观众数, idle 闲着的人数, sus/inf 命中人数}。 */
    function alienAudienceInfo(a,rad){
      const D=SKSanity.DISGUISE;
      let n=0,weight=0,idle=0,sus=0,inf=0;
      for(const w of G.agents){
        if(w===a||!w.alive||w.downed||w.detained||isMate(a,w.i))continue;
        /* A 批（2026-11-05）：做小游戏的人看不见，不算观众、也不算"闲着看我" */
        if(attention(w)!=='online')continue;
        const d=Math.hypot(w.x-a.x,w.y-a.y);
        /* 关键是"**他看得见我**"，不是"我看得见他"：信誉兑现走的是目击者的视野
           （credBroadcast 用 aiCanSee(w,x,y)），两处口径必须一致 ——
           否则异形会为一个根本没看见它的人白站 8 秒，而它自己看得见对方。 */
        if(d>=rad||!aiCanSee(w,a.x,a.y,rad))continue;
        n++;
        let v=1;
        /* 读心清零（2026-11-05）：不再读 w 的 sus / 性格轴。
           改用「a 自己估的 w 对我的怀疑」与「公开影响力（谁的话有人跟）」。 */
        if(audSusEstimate(a,w).score>=D.susMin){v+=D.audSus;sus++;}
        if(G.leader===w.i||publicInfluence(w)>=0.34){v+=D.audInf;inf++;}
        if(!(w.doing>0))idle++;
        weight+=v;
      }
      return {n,weight,idle,sus,inf};
    }
    /* 常客偏好（2026-11-03）：洗白的兑现要求**同一个人反复看见**，所以演出地点要挑
       "我今晚见过人的舱室"，而不是"离我最近的点"。用的全是已经记着的事实
       （`mind.mem` 里的 `saw_agent` 位置时间线），不新增任何数值。 */
    function audienceHotRooms(a){
      const hot={};
      const mem=(a&&a.mind&&a.mind.mem)||[];
      for(const e of mem){
        if(!e||e.kind!=='saw_agent'||e.night!==G.night)continue;
        if(!e.room||e.room==='corridor'||e.room==='unknown')continue;
        hot[e.room]=(hot[e.room]||0)+1;
      }
      return hot;
    }
    /* 演出 / 善行候选（2026-11-03 重做）：一次返回**全部**候选，由 alienPlan 逐个算分取最优。
       按 LENS 的"像人程度"排优先级 —— 真做的事比演的事值钱，但代价也真：
         ① realFix     真把一处故障修好（lr 10）：人类少扣 5 分，异形做这事是真亏
                        ⇒ 只在**没有刀**、每夜一次、且不是自己刚炸的那一处时考虑；
         ② realRevive  真救一个倒地的**非队友**（lr 6）：要消耗一个医疗包；
         ③ breakerOn    当众合闸（lr 3，吃 risk.breakerLoss）；
         ④ fake         假装修理（lr 1.2）；
         ⑤ fakeTask     假装做任务（lr 1.2）。
       同类候选内部先挑"今晚见过人的舱室"（常客），再挑"没人做过的点"，最后才比距离。 */
    /* 档 2 真源归一（2026-11-04）：映射表已外提到 SKSanity.CRED.kindMap，
       此处只引用不复制；改映射只改 sanity.js 一处。 */
    const KIND_CRED=SKSanity.CRED.kindMap;
    function disguiseOptions(a){
      const D=SKSanity.DISGUISE, out=[], now=(G.playT||0), hot=audienceHotRooms(a);
      const G0=SKSanity.CRED.gains, base=G0.fakeWork||0.10;
      const push=(o)=>{
        const ck=KIND_CRED[o.kind];
        o.credKey=ck||null;
        o.valueMul=ck&&G0[ck]?G0[ck]/base:1;
        o.hot=hot[o.room]||0;
        out.push(o);
      };
      /* ① 真修故障：走与玩家、AI 人类同一条 startFix / finishFix 入口 */
      if(a.knife<=0&&a._realFixN!==G.night){
        const fd=G.dmg.find(d=>d.by!==a.i&&Math.hypot(d.x-a.x,d.y-a.y)<D.fakeRepairR);
        if(fd){
          const f=nearestFree(fd.x,fd.y);
          push({kind:'realFix',x:f[0],y:f[1],dur:FIX_TIME,pt:null,real:true,
            key:'realfix:'+fd.room,dist:Math.hypot(f[0]-a.x,f[1]-a.y),
            room:fd.room,fault:fd});
        }
      }
      /* ② 真救非队友：走现成 _doing='revive'（finishDoing 里扣医疗包并广播 cred） */
      if(a.medkit>0&&a._realReviveN!==G.night){
        let v=null,bd=10;
        for(const w of G.agents){
          if(w===a||!w.alive||!w.downed||isMate(a,w.i))continue;
          const d=Math.hypot(w.x-a.x,w.y-a.y);
          if(d<bd&&aiCanSee(a,w.x,w.y,10)){bd=d;v=w;}
        }
        if(v){
          const f=nearestFree(v.x,v.y);
          push({kind:'realRevive',x:f[0],y:f[1],dur:5,pt:null,real:true,
            key:'revive:'+v.i,dist:Math.hypot(f[0]-a.x,f[1]-a.y),
            room:roomIdAt(v.x,v.y),subj:v.i});
        }
      }
      /* ③ 当众合闸：闸杆太远就不为它跑一趟（和任务点同一个 spotR）。
         与假动作同闸：只有 cooldown + 分数门槛，不设"每夜一次"。 */
      if(G.lightState===2){
        const br=M.facility.find(f=>f.kind==='breaker');
        if(br){
          const f=nearestFree(br.x,br.y),dd=Math.hypot(f[0]-a.x,f[1]-a.y);
          if(dd<=D.spotR)
            push({kind:'breakerOn',x:f[0],y:f[1],dur:breakerOnTime(),pt:null,
              key:'breaker',done:false,dist:dd,room:roomIdAt(br.x,br.y)});
        }
      }
      /* ④ 假装修理：就近有故障就在旁边"帮忙"（不修好、不加进度） */
      const fd=G.dmg.find(d=>Math.hypot(d.x-a.x,d.y-a.y)<D.fakeRepairR);
      if(fd){
        const f=nearestFree(fd.x,fd.y);
        push({kind:'fake',x:f[0],y:f[1],
          dur:D.dur.fake[0]+Math.random()*D.dur.fake[1],pt:null,
          key:'fix:'+fd.room,done:false,dist:Math.hypot(f[0]-a.x,f[1]-a.y),
          room:fd.room});
      }
      /* ⑤ 假装做任务：常客舱室 > 没人做过的点 > 距离 */
      let bestAny=null,bd=D.spotR,fresh=null,frd=D.spotR,hotFresh=null,hfd=D.spotR;
      for(let i=0;i<M.points.length;i++){
        const p=M.points[i];
        const f=nearestFree(p.x,p.y);
        const dd=Math.hypot(f[0]-a.x,f[1]-a.y);
        if(dd>D.spotR)continue;
        const doneAt=G.pointDone&&G.pointDone[i];
        const done=doneAt!=null&&now-doneAt<D.doneWindow;
        if(!done){
          if(!fresh||dd<frd){fresh={i,f,dd,room:p.room};frd=dd;}
          if((hot[p.room]||0)>0&&(!hotFresh||dd<hfd)){hotFresh={i,f,dd,room:p.room};hfd=dd;}
        }
        if(!bestAny||dd<bd){bestAny={i,f,dd,room:p.room};bd=dd;}
      }
      const pick5=hotFresh||fresh||bestAny;
      if(pick5)push({kind:'fakeTask',x:pick5.f[0],y:pick5.f[1],
        dur:D.dur.fakeTask[0]+Math.random()*D.dur.fakeTask[1],pt:pick5.i,
        key:'pt:'+pick5.i,done:!(hotFresh||fresh),dist:pick5.dd,room:pick5.room});
      /* 常客排前面：同分候选里"今晚见过人的舱室"优先（真实的一手是演给会来的人看） */
      out.sort((x,y)=>(y.hot||0)-(x.hot||0));
      return out;
    }
    /* 把"这一下会不会被识破 / 会不会真亏"翻译成 SKSanity.disguiseRisk 的输入 */
    function disguiseRiskParts(a,aud,spot){
      const D=SKSanity.DISGUISE, now=(G.playT||0);
      const rep=a._lastFake&&a._lastFake.key===spot.key&&now-(a._lastFake.t||0)<D.repeatWindow;
      return {
        redHot:(a.redT||0)>0,
        donePoint:!!spot.done,
        repeatSpot:!!rep,
        breakerLoss:spot.kind==='breakerOn',
        /* 真修 / 真救的战略损失与合闸同量纲：不是"被识破"，是"真帮了对手" */
        realCost:!!spot.real,
        idle:aud.idle,
        audience:aud.n,
        dark:!litZoneAt(a.x,a.y),
      };
    }
    /* ---- 异形行为效用表（2026-11-01）----
       取消「拉闸手 / 破坏手」的专属角色：每只异形都能拉闸、都能破坏，
       具体做哪个由量化收益决定，不再由 if 顺序硬排、也不再被"5 格内有活人"卡死。
       分数口径（初步量化表，后续按数据调）：
         breaker  = 断电价值(8) × 剩余夜比例 − 拉闸站桩秒×1.5 − 路程秒
         sabotage = 牵制价值(8) × 剩余夜比例 − 路程秒 − 下手 1 秒
                    （破坏的真实价值是"把 2 名人类 + 幽灵钉在修复上"，不只是 -5 期望）
         chase    = 贴脸 12 / 近距 6 / 远距 2（出刀机会的价值）
       夜初 left≈1 时跑图类行为普遍压过追人（先牵制），夜末 left≈0.3 时只有
       顺路的才做（先杀人）——量化表自然给出"先破坏牵制、再收头"的节奏。
       打分每 0.5 秒缓存一次（_planT），避免每帧全房间扫。 */
    function alienPlan(a,td){
      const left=Math.max(0.25,Math.min(1,(G.t||0)/NIGHT));
      const walk=d=>d/Math.max(1,moveSpeed(a));
      const br=M.facility.find(f=>f.kind==='breaker');
      let scBr=-1;
      if(br&&G.lightState!==2&&!a.sabUsed&&a._breakerSkip!==G.night){
        scBr=SKTeam.BREAKER_VALUE*left-breakerOffTime()*1.5-walk(Math.hypot(br.x-a.x,br.y-a.y));
      }
      let scSb=-1,sbRoom=null;
      if(!a.sabUsed){
        for(const r of M.rooms){
          if(r.id==='bridge'||!sabRoomOk(r.id))continue;
          /* 刚因为"有人看着"放弃过的舱室，8 秒内不再选 —— 否则每 0.5 秒重算
             又选回同一间，异形会在门口反复横跳 */
          if(a._sabSkipRoom===r.id&&evNow()<a._sabSkipUntil)continue;
          const sp=sabSpot(r.id); if(!sp)continue;
          let s=SKTeam.SABOTAGE_VALUE*left-walk(Math.hypot(sp.x-a.x,sp.y-a.y))-1;
          /* 配电室里还没断电时，拆「电路维修点」意义不大 —— 先拉闸，拆设备放到断电之后 */
          if(r.id==='power'&&G.lightState!==2)s-=4;
          if(s>scSb){scSb=s;sbRoom=r.id;}
        }
      }
      /* 拆机器人也进效用表（2026-11-01）：机器人只能被刀/枪瘫痪（用户裁定），
         所以刀没了就不列入候选 —— 破坏技与机器人彻底无关。 */
      let scBot=-1,botKind=null;
      if(a.knife>0){
        const sec=q=>{if(G.secbotDead)return null;const p2=botPos('secbot');
          return p2&&secbotRaidOk(a,p2)?p2:null;};
        const med=()=>{if(G.medbotDead)return null;return botPos('medbot');};
        const q1=sec(),q2=med();
        if(q1){const s=SKTeam.BOT_SEC_VALUE*left-walk(Math.hypot(q1.x-a.x,q1.y-a.y));
          if(s>scBot){scBot=s;botKind='secbot';}}
        if(q2){const s=SKTeam.BOT_MED_VALUE*left-walk(Math.hypot(q2.x-a.x,q2.y-a.y));
          if(s>scBot){scBot=s;botKind='medbot';}}
      }
      /* 出刀机会的价值必须压过跑图类行为：贴脸 12、可追 9 ——
         否则异形会当着猎物拆设备（首版实测：在保安面前优先拆军械库而不砍装甲）。
         远距 2 = 追不上的目标，这时破坏/拉闸的跑图才有意义。 */
      /* 刀没了就不存在"出刀机会"：chase 必须归零（2026-11-01 修）。
         旧版 chase 恒为 12/9/2，而拉闸上限 9.5、破坏上限 7.0 ——
         只要 5 格内有活人，破坏永远选不上；刀用完时 chase 仍是 12，
         整夜只会游荡，效用表被一个常数架空。 */
      /* 开夜封锁期内"出刀机会"没有价值（2026-11-02），否则异形会贴到猎物身边干等 */
      const chase=(a.knife>0&&knifeLockLeft()<=0)?
        (td<SKTrait.C.knifeReach(a)?12:(td<5?9:2)):0;
      /* ---- 伪装进效用表（2026-11-03）----
         旧版伪装挂在 alienSupport 里的一个硬前置：
           if(!a._supportGoal && (a.knife<=0 || close>8) && !(a._fakeCD>0))
         而 close 与 aud 数的是同一批人，close>8 时 aud 恒为 0 —— 括号那半边是死代码，
         伪装实际只剩"刀用完 + 8 格内有人"一条缝（fakeTasks 1.06 次/只/整局）。
         现在改成和 chase / breaker / sabotage 同台比分：
           scDis = DISGUISE.planValue × disguiseScore − 走到演出点的秒数
         三种演出（假装维修 / 假装做任务 / 当众合闸）都由 disguiseSpotFor 选点、
         由同一份收益-风险分决定，散在 if 硬排里的掷骰全部取消。
         每夜 1 次的硬上限也一并去掉 —— 只留 cooldown（真人不会连着演，
         但一晚上演两次很正常：一次给怀疑我的人看，一次给新来的人看）。
         演分带着 aud/risk/sc 一起返回，门禁与复盘要用它们做方向断言。 */
      let scDis=-1, disPlan=null;
      const DG=SKSanity.DISGUISE;
      /* 贴脸能杀的时候不演（2026-11-03 修）：伪装进了同一张表之后，
         加权观众 + valueMul 会把分数抬到压过 chase(12)，异形于是放着人不杀去站桩 ——
         这不是数值问题，是**次序**问题：与 alienSupport 开头那条"贴脸有人可杀时先处理人"
         同一条规则（同一个 5 格），这里只是把它也应用到新入口上。
         a.drag==null：拖着尸体时唯一的任务是藏好它，不能被"演一下"打断
         （与 alienSupport 开头 `a.drag!=null return false` 同一条口径）。 */
      const killWindow=a.knife>0&&knifeLockLeft()<=0&&td<5;
      if(!killWindow&&!a._noFake&&(a._fakeCD||0)<=0&&!a._supportGoal&&a.drag==null){
        const aud=alienAudienceInfo(a,DG.audienceR);
        if(aud.n>0){
          /* 逐个候选算分（2026-11-03）：真修 / 真救 / 合闸 / 假装修 / 假装做任务
             全在同一张表里比，值不值由 LENS 推出来的 valueMul 与各自的代价决定。 */
          for(const spot of disguiseOptions(a)){
            const risk=SKSanity.disguiseRisk(disguiseRiskParts(a,aud,spot));
            const sc=SKSanity.disguiseScore({audience:aud.weight,duration:spot.dur,
              risk:risk,valueMul:spot.valueMul});
            if(sc<DG.minScore)continue;
            const s=DG.planValue*sc-walk(spot.dist);
            if(s<=0)continue;
            if(s>scDis){
              scDis=s;
              disPlan={id:'disguise',kind:spot.kind,x:spot.x,y:spot.y,dur:spot.dur,
                pt:spot.pt,key:spot.key,room:spot.room,fault:spot.fault,subj:spot.subj,
                real:!!spot.real,score:s,
                aud:aud.n,audW:+aud.weight.toFixed(3),idle:aud.idle,
                susAud:aud.sus,infAud:aud.inf,risk:+risk.toFixed(3),sc:+sc.toFixed(3)};
            }
          }
        }
      }
      const best=Math.max(scBr,scSb,scBot,chase,scDis);
      if(disPlan&&best===scDis)return disPlan;
      if(best<=chase)return{id:'chase',room:null,score:chase};
      if(best===scBot)return{id:'bot',kind:botKind,score:scBot};
      if(best===scBr)return{id:'breaker',room:null,score:scBr};
      return{id:'sabotage',room:sbRoom,score:scSb};
    }
    function alienSupport(a,dt){
      if(!a||!a.alien||a.doing>0||a.drag!=null)return false;
      /* 贴脸有人可杀时先处理人；没刀时才搞伪装/补给 */
      if(a.knife>0&&a.target&&a.target.alive&&!a.target.downed&&
        Math.hypot(a.target.x-a.x,a.target.y-a.y)<5)return false;
      /* 自己刀倒的人如果已经失血死亡，记得回去收走物资 / 藏尸（不是杀完就永远不管） */
      if(a._killBody!=null&&evNow()-(a._killAt||0)<45){
        const kv=G.agents[a._killBody];
        const kp=kv?bodyPos(kv):null;
        if(kp&&!kv.alive&&kv.draggedBy==null&&aiWantsLoot(a,kv)){
          const d=Math.hypot(kp[0]-a.x,kp[1]-a.y);
          if(d<2.2){
            a.path=null;a.moving=false;
            a.doing=SKSanity.STAND.search;a._dur=SKSanity.STAND.search;a._doing='search';a._sv=kv.i;
            return true;
          }
          if(!a.path||!a.path.length)walkTo(a,kp[0],kp[1]);
          stepMove(a,dt,moveSpeed(a));return true;
        }
      }
      /* 已锁定的真做任务目标：持续走过去，到了就站桩。
         （伪装不再走这条路 —— 2026-11-03 起假装维修/假装做任务/当众合闸
           统一在 alienPlan 效用表里比分，见 disguiseSpotFor。） */
      if(a._supportGoal){
        const g=a._supportGoal;
        if(g.kind!=='task'||a._alienTaskN===G.night)a._supportGoal=null;
        else{
          if(Math.hypot(g.x-a.x,g.y-a.y)<2.0){
            a._supportGoal=null;a.path=null;a.moving=false;
            a._alienTaskN=G.night;a._alienTaskTotal=(a._alienTaskTotal||0)+1;
            a.doing=g.dur;a._dur=g.dur;
            a._doing='task';a._taskPt=g.pt;
            return true;
          }
          if(!a.path||!a.path.length)walkTo(a,g.x,g.y);
          stepMove(a,dt,moveSpeed(a));return true;
        }
      }
      /* 有申请单先回圆桌领取 */
      if(a.qualPending>0){
        const qd=roundTableClaimSpot();
        if(qd){
          if(Math.hypot(qd.x-a.x,qd.y-a.y)<1.8){
            a.path=null;a.moving=false;a.doing=SKSanity.STAND.qual;a._dur=SKSanity.STAND.qual;a._doing='qual';return true;
          }
          if(!a.path||!a.path.length)walkTo(a,qd.x,qd.y);
          stepMove(a,dt,moveSpeed(a));return true;
        }
      }
      /* 有申请单且缺子弹 → 军械补给点（与人类同一条补给规则） */
      if(a.qual>0&&a.bullet<1){
        const sp=supplyPoints().find(q=>q.item==='ammo');
        if(sp){
          if(Math.hypot(sp.x-a.x,sp.y-a.y)<1.7){
            a.path=null;a.moving=false;a.doing=SUPPLY_AMMO_TIME;a._dur=SUPPLY_AMMO_TIME;a._doing='ammo';return true;
          }
          if(!a.path||!a.path.length)walkTo(a,sp.x,sp.y);
          stepMove(a,dt,moveSpeed(a));return true;
        }
      }
      /* 翻尸体拿子弹/医疗包/申请单 */
      if(lootRun(a,dt))return true;
      /* ---- 伪装不在这里（2026-11-03 移走）----
         这里原本挂着两段 if 硬排的伪装：假装维修/假装做任务（带一个 close>8 的死条件，
         与 alienAudienceCount 的 8 格观众数恒互斥，实际只有"刀用完"那条缝走得通）
         和当众合闸（每秒掷骰）。三者现在统一在 alienPlan 效用表里按
         planValue × disguiseScore − 路程秒 比分，风险走 SKSanity.disguiseRisk。 */
      /* 真做任务只为换申请单，是少数策略：每只异形整局最多 1 次；
         人类进度接近 45 时不做，避免替人类完成维修胜利。 */
      if(!a._supportGoal&&a.knife<=0&&a.bullet<1&&a.qual<1&&
        (a._alienTaskTotal||0)<1&&G.prog<38&&a._alienTaskN!==G.night&&
        Math.random()<dt*0.02){
        const p=M.points[a.tasks[a.tIdx]];
        if(p){a._supportGoal={kind:'task',x:p.x,y:p.y,dur:p.dur,pt:a.tasks[a.tIdx]};return true;}
      }
      return false;
    }
    function alienMateRevive(a,dt){
      if(!a||!a.alien||a.medkit<1||a.doing>0)return false;
      let v=null,bd=8;
      for(const w of G.agents){
        if(w===a||!w.alive||!w.downed||!isMate(a,w.i))continue;
        const d=Math.hypot(w.x-a.x,w.y-a.y);
        if(d<bd&&aiCanSee(a,w.x,w.y,8)){bd=d;v=w;}
      }
      if(!v)return false;
      if(bd<1.7){
        a.path=null;a.moving=false;
        a.doing=SKSanity.STAND.revive;a._dur=SKSanity.STAND.revive;a._doing='revive';a._rv=v;return true;
      }
      if(!a.path||!a.path.length)walkTo(a,v.x,v.y);
      stepMove(a,dt,moveSpeed(a));return true;
    }
    /* 管道机动：目标远、自己不在管道口时，先规划到能显著缩短距离的入口；
       站在口上就直接钻到离目标最近的出口。每夜最多 2 次、20 秒冷却。
       这是异形的核心位移能力，必须排在“没刀就游荡/补给”之前。 */
    /* 看不见人 ≠ 知道船上没人（2026-11-03 取消全图锁敌后的必要补位）。
       没有可打目标时，异形仍要知道"往哪边走去看看"：
         ① 本夜最近一次亲眼见过的最后位置（哪怕已过追猎时效）；
         ② 本夜见过人最多的舱室里的一个任务点；
         ③ 都没有 ⇒ 随机挑一间舱室，巡逻式碰运气。
       ⚠ 它**只服务位移与管道机动**，绝不进出刀 / 开枪判定 ——
       否则等于换个名字把全图锁敌放回来。 */
    function huntSpotFor(a){
      const mem=(a&&a.mind&&a.mind.mem)||[];
      let last=null;
      for(let k=mem.length-1;k>=0;k--){
        const e=mem[k];
        if(!e||e.kind!=='saw_agent'||e.night!==G.night)continue;
        last=e;break;
      }
      if(last)return {x:last.x,y:last.y};
      const cnt={};
      for(const e of mem){
        if(!e||e.kind!=='saw_agent'||e.night!==G.night||!e.room||e.room==='corridor')continue;
        cnt[e.room]=(cnt[e.room]||0)+1;
      }
      const here=roomIdAt(a.x,a.y);
      let room=null,bc=0;
      for(const k in cnt)if(cnt[k]>bc){bc=cnt[k];room=k;}
      if(!room){
        /* ③ 一点记忆都没有 ⇒ 去**任务点最多的舱室**蹲着看（真人异形没线索时也这么干）。
           刻意不随机：随机会让"会不会跨船找人"这类断言变成抛硬币。 */
        let bestN=0;
        const tally={};
        for(const p of M.points){
          if(p.room===here)continue;
          tally[p.room]=(tally[p.room]||0)+1;
        }
        for(const k in tally)if(tally[k]>bestN){bestN=tally[k];room=k;}
      }
      const pts=room?M.points.filter(p=>p.room===room):[];
      if(pts.length){
        /* 用舱室中心而不是随机某个点位：门禁要断言"选了哪个出口"，
           随机点位会让它变成抛硬币。"去那间屋看看"本来就是看房间，不是看某台设备。 */
        const rr=M.rooms.find(q=>q.id===room);
        if(rr){
          const cx=rr.rect[0]+rr.rect[2]/2, cy=rr.rect[1]+rr.rect[3]/2;
          const f=nearestFree(cx,cy);
          return {x:f[0],y:f[1]};
        }
      }
      const r=M.rooms.find(q=>q.id!==here)||M.rooms[0];
      if(r){const p=randIn(r);return {x:p[0],y:p[1]};}
      return null;
    }
    function alienPipeMove(a,dt,tgt,td){
      if(!tgt||td<=15||a._pipeCD>0||a.drag!=null){a._pipePlan=null;return false;}
      const from=nearPipe(a);
      if(from){
        let best=null,bd=1e9;
        for(const q of M.pipes){
          if(q===from)continue;
          const d=Math.hypot(q.x-tgt.x,q.y-tgt.y);
          if(d<bd){bd=d;best=q;}
        }
        if(best&&bd<td-4){
          a.x=best.x;a.y=best.y;a.path=null;a._pipeCD=20;a._pipePlan=null;
          a._pipeSeeks=(a._pipeSeeks||0)+1;
          if(G.simMode&&G.simStats)G.simStats.alienPipes++;
          G.fx.push({type:'pipefx',x:best.x,y:best.y,t:0.8,dur:0.8});
          hear(best.x,best.y,'pipe',0.9);
          logEvent('pipe',{actor:a.i,from:from.room,to:best.room,
            x:+best.x.toFixed(1),y:+best.y.toFixed(1)});
          witnessAlienAction(a,from.x,from.y,6,'pipe');
          witnessAlienAction(a,best.x,best.y,6,'pipe');
          aiHear('pipe',best.x,best.y,12,{actor:a});
          return true;
        }
      }
      if((a._pipeSeeks||0)<2){
        if(!a._pipePlan){
          let plan=null,gain=5;
          for(const pin of M.pipes){
            let out=null,bd=1e9;
            for(const q of M.pipes){
              if(q===pin)continue;
              const d=Math.hypot(q.x-tgt.x,q.y-tgt.y);
              if(d<bd){bd=d;out=q;}
            }
            if(!out)continue;
            const g=td-(Math.hypot(pin.x-a.x,pin.y-a.y)+bd);
            if(g>gain){gain=g;plan={in:pin,out};}
          }
          if(plan&&G.simMode&&G.simStats)G.simStats.alienPipePlans++;
          a._pipePlan=plan;
        }
        if(a._pipePlan){
          const pin=a._pipePlan.in;
          if(Math.hypot(a.x-pin.x,a.y-pin.y)<1.2){
            const out=a._pipePlan.out;
            a.x=out.x;a.y=out.y;a.path=null;a._pipeCD=20;a._pipePlan=null;
            a._pipeSeeks=(a._pipeSeeks||0)+1;
            if(G.simMode&&G.simStats)G.simStats.alienPipes++;
            G.fx.push({type:'pipefx',x:out.x,y:out.y,t:0.8,dur:0.8});
            hear(out.x,out.y,'pipe',0.9);
            logEvent('pipe',{actor:a.i,from:pin.room,to:out.room,
              x:+out.x.toFixed(1),y:+out.y.toFixed(1)});
            witnessAlienAction(a,pin.x,pin.y,6,'pipe');
            witnessAlienAction(a,out.x,out.y,6,'pipe');
            aiHear('pipe',out.x,out.y,12,{actor:a});
            return true;
          }
          if(!a.path||!a.path.length)walkTo(a,pin.x,pin.y);
          stepMove(a,dt,moveSpeed(a));return true;
        }
      }
      return false;
    }
    function aiAlien(a,dt){
      if(G.meet||G.over)return;
      if(a.detained)return;
      if(a._pathCD>0)a._pathCD-=dt;
      dropStaleFix(a);
      if(a.doing>0){
        a.doing-=dt;
        if(a.doing<=0){
          if(a._doing==='fake'){
            a._doing=null;a.doing=0;
            /* 演完进入冷却：真人不会连着演，也避免一晚上刷出一堆信誉 */
            a._fakeCD=SKSanity.DISGUISE.cooldown;
            /* **洗白的兑现口**：目击者分不出真假，看到的就是"他在修设备/做任务"，
               所以照样加 cred（权重略低于真做，见 SKSanity.CRED.gains.fakeWork）。
               两种假动作写**两种** kind —— ALMOST.friendKinds=2 要的就是"种类"，
               合成一种的话异形永远凑不齐，伪装线在第二层就是死的。 */
            credBroadcast(a,a._fakeKind==='repair'?'fakeRepair':'fakeWork',a.x,a.y);
            if(G.simMode&&G.simStats){
              if(a._fakeKind==='task')G.simStats.fakeTasks++;
              else G.simStats.fakeRepairs++;
            }
            a._fakeKind=null;
          }
          else finishDoing(a);
        }
        return;
      }
      /* 开局全员同舱：异形也必须遵守错峰延迟，否则一进夜就贴脸出刀 */
      if(a._delay>0){
        a._delay-=dt;
        if(!a.path||!a.path.length){
          if(Math.random()<dt*0.35){
            const r=M.rooms[Math.floor(Math.random()*M.rooms.length)];
            const p=randIn(r); walkTo(a,p[0],p[1]);
          }else a.moving=false;
        }
        if(a.path&&a.path.length) stepMove(a,dt,moveSpeed(a));
        return;
      }
      /* 杀完人后的"重返现场报告"计划：先离开、过几秒再回尸体旁拉铃。
         这是主动策略：用会议拖人类的时间，同时把自己包装成"发现尸体的人"；
         代价是尸体还热就有人来报，会被在场者记成可疑（见 buildMeetCtx 的 quick_report）。 */
      if(a._reportPlan){
        const p=a._reportPlan, v=G.agents[p.body];
        if(!v||!bodyPos(v)||bodyReported(v)||v.draggedBy!=null&&v.draggedBy!==a.i){
          a._reportPlan=null;
        }else if(p.wait>0){
          p.wait-=dt;
          if(p.direct){
            /* 直接报案：不绕去别处做不在场，原地稍等就拉铃 */
            const bp=bodyPos(v);
            if(bp&&Math.hypot(bp[0]-a.x,bp[1]-a.y)>2.2){
              if(!a.path||!a.path.length)walkTo(a,bp[0],bp[1]);
              stepMove(a,dt,moveSpeed(a));
            }else a.moving=false;
            return;
          }
          if(!a.path||!a.path.length){
            if(!p.spot)p.spot=reportAlibiSpot(a);
            if(p.spot)walkTo(a,p.spot[0],p.spot[1]);
          }
          stepMove(a,dt,moveSpeed(a));return;
        }else{
          const bp=bodyPos(v);
          const d=Math.hypot(bp[0]-a.x,bp[1]-a.y);
          if(d<2.6&&losNow(a.x,a.y,bp[0],bp[1])){
            /* 回到自己做的尸体旁：四周没人时先把死者身上的物资摸走，再拉铃报案 */
            if(aiWantsLoot(a,v)&&!watchersAt(a,bp[0],bp[1],7,v).length){
              a.path=null;a.moving=false;
              a.doing=SKSanity.STAND.search;a._dur=SKSanity.STAND.search;a._doing='search';a._sv=v.i;
              return;
            }
            if((a.reportLeft|0)<=0||!nightMeetLeft()){a._reportPlan=null;return;}
            a.reportLeft--;a.reportsUsed=(a.reportsUsed||0)+1;
            if(G.simMode&&G.simStats)G.simStats.reportsUsed=(G.simStats.reportsUsed||0)+1;
            markBodyReported(v);G.aiReportUsed=true;a._reportPlan=null;
            openMeeting('night',a,v);
            return;
          }
          if(!a.path||!a.path.length)walkTo(a,bp[0],bp[1]);
          stepMove(a,dt,moveSpeed(a));return;
        }
      }
      if(a._killBody!=null&&!a._killDecided){
        /* 每次行凶只掷一次骰子：有活人目击时更谨慎（15%），没人看见则更敢演（40%）。
           决定报案后还有一小段概率"直接原地拉铃"：不绕去别处做不在场，
           开会更快但更像凶手——大多数时候仍然先离开再回来。 */
        a._killDecided=true;
        const v=G.agents[a._killBody];
        /* 报告额度 / 本夜会议场次不够时，连"要不要演报案"都不再考虑
           （2026-11-02：报告成了稀缺资源，不能再按无限额度做计划） */
        if((a.reportLeft|0)<=0||!nightMeetLeft())return;
        if(v&&bodyPos(v)&&!bodyReported(v)){
          const wit=recentWitness(a,20);
          /* 2026-11-02：报告不再有"拖时间"收益（会议不占夜晚时间），
             收益改成**误导价值**（现成的靶子 / 可栽赃的人）。
             但"杀了人自己报案"这个经典打法**保留**：没人看见时它是最强的误导动作
             （把自己摆在发现者位置上，还能把票引向别人），所以给一个下限 0.55；
             被人看见过就压到一半以下。 */
          const worth=Math.max(alienReportWorth(a,v),wit?0:0.55);
          const p=wit?worth*0.5:worth;
          if(Math.random()<p){
            a._reportT=0;a._reportBody=null;
            const direct=Math.random()<(wit?0.2:0.35);
            a._reportPlan={body:v.i,wait:direct?0.8+Math.random()*1.2:5+Math.random()*7,
              spot:null,direct:direct};
            return;
          }
        }
      }
      /* 已认出队友倒下且手里有医疗包：优先救队友，别把他当尸体拖走 */
      if(alienMateRevive(a,dt))return;
      /* 钻管道冷却的递减统一放在 tickActs（每帧一次、玩家与 AI 同一个计时入口）。
         以前这里也减一次，配上 tickActs 就会**一帧减两次**；而写在 AI 循环里的
         "顺手也减一下玩家"更糟 —— 场上 4 只异形就等于玩家冷却 4 倍速。 */
      if(a._botCD>0)a._botCD-=dt;
      if(a._fakeCD>0)a._fakeCD-=dt;
      if(!a.target||!a.target.alive||a.target.downed){
        /* 挑目标（2026-11-03 用户裁定：**取消异形全图锁敌**）
           旧实现把所有活人的**实时坐标**直接拿来打分 ⇒ AI 异形知道全船谁在哪儿，
           而玩家异形只有一只手电（7 格 / 60° 锥 + 近身 3.5 格）—— 两个阵营在玩两个游戏。
           现在两边同一套信息，只有三档：
             ① 现在看得见 → 用实时位置（"他正在站桩干活"这种信息也只有看得见才知道）；
             ② 看不见但本夜亲眼见过 → 用**最后目击位置**，超过 HUNT.memorySec 秒就不信；
             ③ 完全没印象 → 不进候选（不知道该往哪走，只能巡逻 / 钻管道 / 破坏）。
           这是明确的平衡位移（异形找人变难），必须用 1000 局量，不要靠感觉说"更拟人"。
           队友永不打；被围观的目标加风险；队友已在追的目标让给队友；被晾过的目标暂时不碰。 */
        let best=null,bs=1e9,fallback=null,fs=1e9;
        const mem=(a.mind&&a.mind.mem)||[];
        const stale=SKSanity.HUNT.memorySec;
        for(const h of G.agents){
          if(h===a||!h.alive||h.downed||h.detained)continue;
          if(isMate(a,h.i))continue;
          const seenNow=aiCanSee(a,h.x,h.y,SKSanity.SIGHT.aiCapR);
          let hx=h.x,hy=h.y;
          if(!seenNow){
            let last=null;
            for(let k=mem.length-1;k>=0;k--){
              const e=mem[k];
              if(!e||e.kind!=='saw_agent'||e.subj!==h.i||e.night!==G.night)continue;
              if(evNow()-e.t>stale)continue;
              last=e;break;
            }
            if(!last)continue;                    /* ③ 没印象 ⇒ 不是候选 */
            hx=last.x;hy=last.y;
          }
          const d=Math.hypot(hx-a.x,hy-a.y);
          /* 暴露度代替布尔"有没有人看着"：连续量，亮房远处的人也算得进来。
             权重见 SKSanity.witnessWeight（贴脸 1.0 → 视野边缘 0.3）。 */
          const exp=exposureAt(a,hx,hy,seenNow?h:null);
          const mateOnIt=G.agents.some(m=>m!==a&&m.alien&&isMate(a,m.i)&&m.alive&&
            m.target&&m.target.i===h.i);
          /* 正在站桩做任务/维修/领取的人更值得下手：优先度按距离减 12 格 ——
             但**看不见就不知道他在站桩**（以前这里偷看了全图状态）。 */
          const busy=seenNow&&h.doing>0;
          /* 他合过闸 → 在异形眼里更像对手（humanT 拉近 6 格当量），
             但这不是身份结论，只是"先处理更像人类的人"。见 SKSanity.HUMANISH。 */
          const hi=humanishOf(a,h.i);
          /* 性格进评分：激进的异形不怕被看见、更愿意扑正在做事的人；
             谨慎的相反，被围观就换目标。系数见 SKTrait.C（已被 TRAIT_GAIN 压缩）。 */
          const s=d+exp*SKTrait.C.knifeWatcherPenalty(a)+(mateOnIt?8:0)
            +(busy?SKTrait.C.knifeBusyBonus(a):0)
            -(hi?SKSanity.HUMANISH.pull*hi:0);
          const until=a._avoid&&(a._avoid[h.i]||0);
          if(until&&evNow()<until){
            if(s<fs){fs=s;fallback=h;}
            continue;
          }
          if(s<bs){bs=s;best=h;}
        }
        a.target=best||fallback;
      }
      /* 现场目击者优先：异形自己看见谁在视线里，就去处理谁；队友除外 */
      if(a.knife>0&&a.mind&&a.mind.seenBy){
        let wit=null,bd=1e9;
        for(const k in a.mind.seenBy){
          const e=a.mind.seenBy[k];
          if(evNow()-e.t>SKSanity.HUNT.memorySec)continue;   /* 与挑目标同一份记忆时效 */
          const w=G.agents[+k];
          if(!w||!w.alive||w.downed||w.detained||w===a||isMate(a,w.i))continue;
          const d=Math.hypot(w.x-a.x,w.y-a.y);
          if(d<bd){bd=d;wit=w;}
        }
        if(wit){
          const cur=a.target?Math.hypot(a.target.x-a.x,a.target.y-a.y):1e9;
          const wd=Math.hypot(wit.x-a.x,wit.y-a.y);
          /* 目击者优先，但不能为了远处证人放弃贴脸目标 */
          if(wd<12&&wd<cur+2)a.target=wit;
        }
      }
      const tgt=a.target;
      const td=tgt?Math.hypot(tgt.x-a.x,tgt.y-a.y):1e9;
      /* 位移目的地（看不见人时的"去找人"）：只给管道机动用，不进任何攻击判定 */
      const hunt=tgt?null:huntSpotFor(a);
      const pipeTgt=tgt||hunt;
      const pipeD=hunt&&!tgt?Math.hypot(hunt.x-a.x,hunt.y-a.y):td;
      /* 异形有子弹也会开枪：远距离/没刀时优先用枪，而不是永远只贴脸出刀 */
      if(a.bullet>0&&tgt&&!isMate(a,tgt.i)&&(td>SKSanity.REACH.knife||a.knife<=0)&&
        td<SKSanity.SHOT.range&&aiCanSee(a,tgt.x,tgt.y,SKSanity.SHOT.range)&&
        Math.random()<SKSanity.SHOT.alienFireP){
        fireShot(a,tgt);a._rest=1.5;return;
      }
      /* 保安扇形内动手会被拘留：先退开，过几秒再找机会 */
      if(a._secAvoidT>0){
        a._secAvoidT-=dt;
        if(!a.path||!a.path.length){
          const r=M.rooms[Math.floor(Math.random()*M.rooms.length)];
          const p=randIn(r);walkTo(a,p[0],p[1]);
        }
        stepMove(a,dt,moveSpeed(a));return;
      }
      /* 拉闸 / 破坏进入效用表（2026-11-01）：不再有拉闸手与破坏手，
         也不再被「5 格内有活人」卡死 —— 是否跑图由 alienPlan 的量化收益决定。
         拉闸保留风险骰（站桩秒数越长越谨慎）；破坏与保安拘捕完全解耦
         （在军械库拆也照拆，被保安看见就是普通危险行为，走 pendingCrime 拘留链）。 */
      /* 效用表每 0.5 秒重算一次：用秒级 CD 而不是 evNow()——
         批量模拟/暂停时模拟时钟不走，evNow 差值恒 0 会让计划永不重算（实测踩过）。 */
      a._planCD=(a._planCD||0)-dt;
      if(a._planCD<=0||!a._plan){
        a._planCD=0.5;a._plan=alienPlan(a,td);
      }
      if(a._plan&&a._plan.id!=='chase'){
        /* 拆机器人：刀攻击走 knifeBot（与玩家 Q 同一条），不消耗破坏技名额 */
        if(a._plan.id==='bot'&&a._plan.kind){
          const q=botPos(a._plan.kind);
          if(q){
            const d=Math.hypot(q.x-a.x,q.y-a.y);
            if(d<1.8){
              if(a.knife>0&&knifeBot(a,a._plan.kind))a._botCD=10;
              a._plan=null;return;
            }
            if(!a.path||!a.path.length)walkTo(a,q.x,q.y);
            stepMove(a,dt,moveSpeed(a));return;
          }
          a._plan=null;
        }else if(a._plan.id==='breaker'&&!a.sabUsed){
          const br=M.facility.find(f=>f.kind==='breaker');
          if(br&&G.lightState!==2){
            const d=Math.hypot(br.x-a.x,br.y-a.y);
            if(d<BREAKER_USE_R){
              /* 理智线（2026-11-01）：拉闸是"当着人不敢做"的典型动作。
                 有人看着 / 太显眼 / 在人群里 —— 三条任一命中就今晚不再考虑，
                 不再用「站桩秒数越长越谨慎」这种把风险折算成概率的旧写法。 */
              const B=SKSanity.BREAKER;
              const wc=watchersAt(a,br.x,br.y,8,null).filter(w=>!isMate(a,w.i)).length;
              const conceal=1-exposureAt(a,br.x,br.y);
              if(wc>=B.witnessCap||conceal<B.minConceal||
                 crowdAt(a,br.x,br.y,B.crowdR)>=B.crowdN){
                a._breakerSkip=G.night;a._plan=null;return;
              }
              a.sabUsed=true;a.doing=breakerOffTime();a._dur=a.doing;a._doing='breaker';
              return;
            }
            if(!a.path||!a.path.length)walkTo(a,br.x,br.y);
            stepMove(a,dt,moveSpeed(a));return;
          }
        }else if(a._plan.id==='disguise'&&a._plan.key){
          /* 伪装 / 贵信号：进点即开始，不需要额外交互。
             假动作走 _doing='fake'（不产生任何进度）；
             当众合闸走 _doing='breaker'（灯真的会亮 —— 这就是代价）；
             **真修 / 真救走与玩家、AI 人类完全同一条入口**（startFix / _doing='revive'），
             不新造结算，杜绝"AI 有特权、玩家没有"的失衡。
             真做的事各夜一次（成本太高），假动作不设每夜上限、只靠 cooldown。 */
          const g=a._plan;
          if(Math.hypot(g.x-a.x,g.y-a.y)<SKSanity.DISGUISE.arriveR){
            a._plan=null;a.path=null;a.moving=false;
            a._lastFake={key:g.key,t:(G.playT||0)};
            if(g.kind==='realFix'){
              a._realFixN=G.night;
              if(G.simMode&&G.simStats)G.simStats.realFixes=(G.simStats.realFixes||0)+1;
              if(g.fault&&G.dmg.indexOf(g.fault)>=0){startFix(a,g.fault);return;}
              a._doing=null;a.doing=0;return;
            }
            if(g.kind==='realRevive'){
              const v=G.agents[g.subj];
              a._realReviveN=G.night;
              if(G.simMode&&G.simStats)G.simStats.realRevives=(G.simStats.realRevives||0)+1;
              if(v&&v.alive&&v.downed&&a.medkit>0){
                a.doing=SKSanity.STAND.revive;a._dur=SKSanity.STAND.revive;a._doing='revive';a._rv=v;
              }
              return;
            }
            a._fakeKind=(g.kind==='fakeTask')?'task':(g.kind==='breakerOn'?'breaker':'repair');
            a.doing=g.dur;a._dur=g.dur;
            a._doing=(g.kind==='breakerOn'?'breaker':'fake');
            return;
          }
          if(!a.path||!a.path.length)walkTo(a,g.x,g.y);
          stepMove(a,dt,moveSpeed(a));return;
        }else if(a._plan.id==='sabotage'&&a._plan.room&&sabRoomOk(a._plan.room)){
          /* 落点只在选定舱室时抽一次并缓存：每帧重抽会让它一直改目标 */
          if(!a._sabSpot||a._sabSpot.room!==a._plan.room)a._sabSpot=sabSpot(a._plan.room);
          const sp=a._sabSpot;
          if(sp){
            /* 理智线：动手前先确认那台设备周围没人看着，有人就换一间、8 秒内不再选 */
            const S=SKSanity.SABOTAGE;
            const wc=watchersAt(a,sp.x,sp.y,7,null).filter(w=>!isMate(a,w.i)).length;
            const conceal=1-exposureAt(a,sp.x,sp.y);
            if(wc>=S.witnessCap||conceal<S.minConceal||
               crowdAt(a,sp.x,sp.y,S.crowdR)>=S.crowdN){
              a._sabSkipRoom=a._plan.room;a._sabSkipUntil=evNow()+8;
              a._sabSpot=null;a._plan=null;return;
            }
            /* **进舱即下手，不需要走到那台设备前**（2026-11-01 用户裁定）。
               破坏点仍然是任务点上的那台设备（G.dmg 的坐标就是它），
               但异形本人不必"蹲在设备前拆"—— 那样既不拟真，也让破坏变得很难做成。
               玩家侧 sabTick 同口径：进入舱室即引爆。 */
            if(roomIdAt(a.x,a.y)===a._plan.room){
              const rid=a._plan.room;
              a._plan=null;a._sabSpot=null;
              damageRoom(a,rid,sp);
              return;
            }
            if(!a.path||!a.path.length)walkTo(a,sp.x,sp.y);
            stepMove(a,dt,moveSpeed(a));return;
          }
        }
        a._plan=null;   /* 计划失效（房间被拆掉/已断电等）：下一帧重算 */
      }
      /* 机器人：有刀就先出刀砍装甲（消耗刀数，按保安 2 / 医疗 1 的 HP 结算，
         与玩家 Q 完全同一条 knifeBot 入口）；刀用完了才动用每夜一次的破坏技直接停摆。
         2026-10-31 收紧：保安默认不碰，必须先满足 secbotRaidOk（房间里认出 2 名以上队友
         + 有一个共同捕杀目标）才列为候选；无人机仍然是高价值目标（它挡救援）。 */
      {
        let bk=null,bp=null,bd=8;
        for(const k of ['secbot','medbot']){
          if(k==='secbot'){
            if(G.secbotDead)continue;
            const q=botPos('secbot');
            if(!q||!secbotRaidOk(a,q))continue;
            const d=Math.hypot(q.x-a.x,q.y-a.y);
            if(d<bd){bd=d;bk=k;bp=q;}
            continue;
          }
          if(G.medbotDead)continue;
          const q=botPos('medbot'); if(!q)continue;
          const d=Math.hypot(q.x-a.x,q.y-a.y);
          if(d<bd){bd=d;bk=k;bp=q;}
        }
        if(bk&&bp&&td>5&&a._botCD<=0){
          if(bd<1.8){
            /* 有刀先用刀：消耗刀数、按装甲 HP 结算（与玩家 Q 共用 knifeBot 入口）。
               2026-11-01 用户裁定：机器人/无人机**只能被刀或枪瘫痪**，
               破坏技不再能停摆机器人 —— 破坏技只对舱室设备生效。 */
            if(a.knife>0&&knifeBot(a,bk)){a._botCD=10;return;}
          }else if(a.knife>0){
            /* 手里有刀才值得为机器人跑一趟（刀没了就轮不到它了） */
            if(!a.path||!a.path.length)walkTo(a,bp.x,bp.y);
            stepMove(a,dt,moveSpeed(a));return;
          }
        }
      }
      /* 旧的「随机选房 + td>5」破坏调度已删除（2026-11-01）：
         拉闸/破坏统一走上面的行为效用表（alienPlan），不再有专属角色与互斥门槛。 */
      /* 正在拖尸：先拖到藏尸点；若活人贴脸且看得见，松手应战。
         计划性的破坏技优先于机会性的藏尸，所以这一段排在破坏之后。 */
      if(a.drag!=null){
        const v=G.agents[a.drag];
        if(!v||!bodyPos(v))releaseDragBy(a,true);
        else{
          /* 拖尸尽量避开活人：有非队友在 6.5 格内且看得见，先松手走开，
             过几秒再回来；比拖着尸体从人堆里穿过更安全。 */
          const seen=watchersAt(a,a.x,a.y,6.5).filter(w=>!isMate(a,w.i));
          if(seen.length){
            releaseDragBy(a,true);a._hideCD=8;a._hideSpot=null;a._hideRoom=null;a._rest=0.8;
            return;
          }
          const danger=!!(tgt&&td<4.5&&aiCanSee(a,tgt.x,tgt.y,4.5));
          if(!danger){
            const vp=bodyPos(v);
            const spot=a._hideSpot||hideSpotFor(a._hideRoom||roomIdAt(vp[0],vp[1]));
            if(!spot)releaseDragBy(a,true);
            else if(Math.hypot(a.x-spot[0],a.y-spot[1])<1.2){
              releaseDragBy(a,true);
              a._hideCD=25;a._hides=(a._hides||0)+1;a._hideSpot=null;a._hideRoom=null;a._rest=0.6;
              return;
            }else{
              if(!a.path||!a.path.length)walkTo(a,spot[0],spot[1]);
              stepMove(a,dt,moveSpeed(a));return;
            }
          }else releaseDragBy(a,true);
        }
      }
      /* 藏尸：附近没有活人、没有目击者时，把尸体拖到房间角落/远离门与任务点处。
         濒死者还可能有救，只有确实没人可追（>12 格）才拖；每夜最多 2 次并有冷却；
         藏尸目的地永远排除医疗间/会议室，并尽量拖到离医疗间更远的舱室，
         降低尸体被医疗无人机/队友发现并复活的机会。 */
      if(!a.drag&&(a._hideCD||0)<=0&&(a._hides||0)<2&&!recentWitness(a,25)){
        const v=findHideBody(a);
        const bp=v?bodyPos(v):null;
        const busy=!!(v&&v.alive&&v.downed);
        if(bp&&td>(busy?12:6)){
          /* 有人在看就不动手：藏尸本身不能制造目击者 */
          const seen=watchersAt(a,bp[0],bp[1],6.5).filter(w=>!isMate(a,w.i));
          if(seen.length){a._hideCD=7;return;}
          const dest=hideRoomFor(roomIdAt(bp[0],bp[1]),bp[0],bp[1]);
          const spot=hideSpotFor(dest);
          if(spot&&Math.hypot(bp[0]-spot[0],bp[1]-spot[1])>2.0){
            if(Math.hypot(bp[0]-a.x,bp[1]-a.y)<2.0){
              a._hideSpot=spot;a._hideRoom=dest;a.path=null;
              if(startDrag(a,v))return;
              a._hideSpot=null;a._hideRoom=null;
            }
            if(!a.path||!a.path.length)walkTo(a,bp[0],bp[1]);
            stepMove(a,dt,moveSpeed(a));return;
          }
        }
      }
      if(a.knife<=0&&alienSupport(a,dt))return;
      /* 有刀但附近没有可下手的目标：也会顺手翻尸/补给/装忙，
         不是“有刀就只会直线追人”的单一行为。 */
      if(a.knife>0&&td>12&&alienSupport(a,dt))return;
      /* 管道是核心位移能力：排在补给/伪装之后、没刀游荡之前，
         否则刀用完后永远走不到管道口。 */
      if(alienPipeMove(a,dt,pipeTgt,pipeD))return;
      if(a.knife<=0){ // 没刀了就游荡（先尝试补给/翻尸/假装维修/做任务换弹）
        if(!a.path||!a.path.length){const r=M.rooms[Math.floor(Math.random()*M.rooms.length)];const p=randIn(r);walkTo(a,p[0],p[1]);}
        stepMove(a,dt,moveSpeed(a)); return;
      }
      if(!tgt)return;
      if(td<SKTrait.C.knifeReach(a)){
        if(secbotWouldSee(a.x,a.y)){
          a._secAvoidT=2.5;a.target=null;a.path=null;return;
        }
        /* ---- 理智兜底（2026-11-01）----
           先过三条**与性格无关**的硬线，过了才轮到性格微调。
           用户原话："即使激进派也不会冒着三个人能够看到的风险出刀"。
             ① 目击者数 ≥ KNIFE.witnessCap（3）→ 一律放弃
             ② 隐蔽度 1-exposure < KNIFE.minConceal → 换时机（这条能抓住
                "亮房里 10 格外有人"这种旧代码数不到的暴露）
             ③ 周围 crowdR 格内 ≥ crowdN 个非队友 = 在人群里 → 不干
           通过之后，性格只在 0.34~0.66 的冒险率区间里浮动（见 SKTrait.C.knifeBold）。 */
        const watchers=watchersAt(a,tgt.x,tgt.y,6,tgt).filter(w=>!isMate(a,w.i));
        const K=SKSanity.KNIFE;
        const conceal=1-exposureAt(a,tgt.x,tgt.y,tgt);
        const blocked=watchers.length>=K.witnessCap||
          conceal<K.minConceal||
          crowdAt(a,tgt.x,tgt.y,K.crowdR)>=K.crowdN;
        /* 开夜封锁（2026-11-02）：前 5 秒谁也不能出刀 —— AI 在这一层被拦，
           和玩家按 A 拿到的是同一条规则。 */
        if(blocked||knifeLockLeft()>0||
          (watchers.length>=1&&Math.random()>=SKTrait.C.knifeBold(a))){
          if(!a._avoid)a._avoid={};
          a._avoid[tgt.i]=evNow()+12;
          a.target=null;a.path=null;
          return;
        }
        knife(a,tgt); return;
      }
      if(!a.path||!a.path.length) walkTo(a,tgt.x,tgt.y);
      stepMove(a,dt,moveSpeed(a));
    }
    
    /* ---- 动作表现（纯视觉，不改变判定）：出手/受击短动作 ---- */
    function setAct(a,kind,dur,extra){
      if(!a)return;
      a.act=Object.assign({kind,dur,t:0},extra||{});
    }
    function tickActs(dt){
      for(const a of G.agents){
        /* 红身与击杀加速各自独立递减 —— 时长相等只是巧合，不许互相推导 */
        if(a.redT>0)a.redT=Math.max(0,a.redT-dt);
        if(a.rushT>0)a.rushT=Math.max(0,a.rushT-dt);
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

    /* 开夜封锁剩余秒数（2026-11-02）：>0 时任何阵营都不能出刀 */
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
      if(!killer||killer.knife<1)return;
      if(!victim||!victim.alive||victim.downed)return;
      const ang=Math.atan2(victim.y-killer.y,victim.x-killer.x);
      /* 危险行为先记账：即使 DEV 免伤/未造成濒死，保安也能据此反制 */
      G.pendingCrime=killer.i;
      /* 先扣刀再进 DEV 免伤分支：否则 AI 对 DEV 玩家能无限连刀，刀数永远用不掉
         （与「DEV 免伤也必须先扣子弹」同一口径） */
      killer.knife--;
      if(G.simMode&&G.simStats)G.simStats.knives++;
      /* 3 秒红身：让目击者一眼认出刚出刀的人（纯表现，不改变判定） */
      killer.redT=3.0;
      if(!G.spectMode&&victim===G.me&&G.dev){
        setAct(killer,'stab',0.4,{ang,lunge:0.4});
        G.fx.push({type:'shield',x:victim.x,y:victim.y,t:0.6,dur:0.6});
        if(killer&&killer!==G.me){killer.target=null;killer.path=null;}
        toast('DEV 无敌：这一刀没有生效');
        return;
      }
      /* 只响一次：单层刀风，不再叠 70ms 后的血肉声 */
      SND.knife(SND.volAt(victim.x,victim.y,0.95));
      SND.flesh(0.34);
      hear(victim.x,victim.y,'knife',1.0);
      setAct(killer,'stab',0.5,{ang,lunge:0.55});
      setAct(victim,'hurt',0.6,{ang});
      G.fx.push({type:'slash',x:victim.x,y:victim.y,t:0.5,dur:0.5,ang,by:killer.i});
      G.fx.push({type:'blood',x:victim.x,y:victim.y,t:0.9,dur:0.9,ang});
      victim.downed=true; victim.downAt=G.t;
      victim.downSeq=(victim.downSeq||0)+1;   /* 倒下事件编号：报告一次性按它绑定 */
      victim.downX=victim.x; victim.downY=victim.y; victim.killedBy=killer.i;
      /* 异形记下自己刚放倒谁：稍后可能绕一圈再回来"发现"尸体，用会议拖时间 */
      if(killer.alien){killer._killBody=victim.i;killer._killAt=evNow();killer._killDecided=false;}
      /* 放倒即触发逃逸加速（只给异形；拖尸中不生效，见 moveSpeed 的次序） */
      killRushStart(killer);
      victim.woundCause='knife'; victim.downRoom=roomIdAt(victim.x,victim.y);
      victim.searched=false;
      logEvent('knife',{actor:killer.i,victim:victim.i,room:victim.downRoom,
        x:+victim.x.toFixed(1),y:+victim.y.toFixed(1)});
      victim.path=null; victim.doing=0; victim._doing=null; victim._sv=null;
      witnessAlienAction(killer,victim.x,victim.y,6,'knife',victim);
      aiHear('knife',victim.x,victim.y,14,{actor:killer,victim:victim});
      screamFor(victim);
      if(!G.spectMode&&victim===G.me){closeCams(true);closePipePick(true);closeSabPick(true);G.sabTarget=null;toast('你被出刀击倒，濒死');}
    }

    /* 被击倒者喊叫：公开 CC0 人声采样，距离越远越轻 */
    function screamFor(victim){
      if(!victim)return;
      /* AI 听觉与玩家音量分开：玩家离得远不播采样，但附近的 AI 仍要听见 */
      aiHear('scream',victim.x,victim.y,16,{victim:victim});
      const d=Math.hypot(victim.x-G.me.x,victim.y-G.me.y);
      if(victim!==G.me&&d>16)return;
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
      a.path=null; a.doing=0; a._doing=null;
      a.redT=0;
      if(a.drag!=null)releaseDragBy(a,true);
      const dg=draggerOf(a);
      if(dg)releaseDragBy(dg,true);
      if(!G.spectMode&&a===G.me){
        G.drag=null;
        document.getElementById('dragtag').classList.add('hide');
        closeBodyCard();
        closeCams(true);closePipePick(true);closeSabPick(true);
        closeWheel(true);
        G.sabTarget=null;
        G.fogOn=false;
        toast('你已阵亡 · 幽灵态：穿墙、全视，仍可做自己剩下的任务（1.6×，最多 2 分）');
        SND.ghost();
        syncHud();
      }
      runInvariants('die');
      return true;
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
          const got=lootBody(a,b);
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
          if(actor){openBodyCard(b);toast(lootText(got,b));}
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
        if((a.qual||0)<1){if(actor)toast('没有物资申请单：先回中央会议室圆桌领取');return;}
        a.medkit=1;a.qual--;
        G.fx.push({type:'pickup',x:a.x,y:a.y,t:1.2,dur:1.2,item:'med'});
        setAct(a,'pickup',0.55,{});
        logEvent('supply',{actor:a.i,item:'medkit',room:roomIdAt(a.x,a.y),
          x:+a.x.toFixed(1),y:+a.y.toFixed(1),qual:a.qual});
        if(actor){toast('拿到医疗包 · 物资申请单 -1');pulseHud('md');pulseHud('ql');SND.med();}
        return;
      }
      if(a._doing==='ammo'){
        a._doing=null;
        if((a.qual||0)<1){if(actor)toast('没有物资申请单：先回中央会议室圆桌领取');return;}
        a.bullet=1;a.qual--;
        G.fx.push({type:'pickup',x:a.x,y:a.y,t:1.2,dur:1.2,item:'ammo'});
        setAct(a,'pickup',0.55,{});
        logEvent('supply',{actor:a.i,item:'bullet',room:roomIdAt(a.x,a.y),
          x:+a.x.toFixed(1),y:+a.y.toFixed(1),qual:a.qual});
        if(actor){toast('拿到子弹 · 物资申请单 -1');pulseHud('bl');pulseHud('ql');SND.ammo();}
        return;
      }
      if(a._doing==='qual'){
        a._doing=null;
        if(a.qualPending>0){
          a.qualPending--; a.qual=Math.min(2,(a.qual||0)+1);
          G.fx.push({type:'qual',x:a.x,y:a.y,t:1.5,dur:1.5,n:a.qual});
          logEvent('qual',{actor:a.i,room:roomIdAt(a.x,a.y),
            x:+a.x.toFixed(1),y:+a.y.toFixed(1),n:a.qual});
          if(actor){toast('领取物资申请单 ×1 · 可去军械库/医疗间补给点兑换');pulseHud('ql');SND.qual();}
        }else if(actor)toast('没有待领取的物资申请单');
        return;
      }
      if(a._doing==='breaker'){
        a._doing=null;a._lightGo=false;
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
        if(v&&v.downed&&v.alive){
          const dg=draggerOf(v);
          if(dg)releaseDragBy(dg,true);
          v.draggedBy=null;
          v.downed=false;v.downAt=0;v.killedBy=null;a.medkit=0;
          v.woundCause=null;v.downRoom=null;v.downX=null;v.downY=null;v.searched=false;
          G.fx.push({type:'heal',x:v.x,y:v.y,t:1.2,dur:1.2});
          setAct(v,'heal',0.7,{ang:0});
          credBroadcast(a,'revive',v.x,v.y);
          logEvent('revive',{actor:a.i,victim:v.i,method:'medkit',room:roomIdAt(v.x,v.y),
            x:+v.x.toFixed(1),y:+v.y.toFixed(1)});
          if(actor){toast('救起 '+v.name);SND.revive();}
          if(G.stats)G.stats.medkitRevives=(G.stats.medkitRevives||0)+1;
          if(G.simMode&&G.simStats){G.simStats.revives++;G.simStats.medkitRevives++;}
        }
        a._rv=null;a._doing=null;return;
      }
      /* 任务结算：按实际修的点记账；乱序完成时把该点交换到 tIdx 槽位，
         保持 [0,tIdx) 全是已完成任务，tIdx 仍是“已完成数量” */
      a._doing=null;a.doing=0;
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
      const v=p.kind==='hard'?2:1;
      if(a.ghost&&(a.ghostPts||0)+v>2){
        a._doing=null;a.doing=0;
        if(actor)toast('幽灵最多维修 2 分的剩余任务');
        return;
      }
      /* ghostPts 是硬上限：AI 幽灵也走同一结算，玩家与 AI 都最多 2 分。 */
      G.prog=Math.min(45,G.prog+v);
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
      openMeeting('day',null,null);
    }
    
    /* ---- 两台机器人 ---- */
    /* 巡逻机器人：M.facility 的 x/y 只是初始位，运行时坐标放在 G.bots。
       botTick / interact / sabotage / 绘制都读运行时坐标，否则巡逻只是画面上动、玩法不变。 */
    const BOT_SPEED=1.6;
    /* 保安机器人：14 格 + 180° 前方扇形；隔墙不算，仍需 losWalls 视线。 */
    /* 保安机器人：2026-10-30 削弱——视野半径 14 → 10.5 格（削 1/4，前方 180° 半圆不变）、
       每夜擒拿上限 3 → 2 次。SEC_USES_MAX 是唯一真源，判定与文案都读它。 */
    const SEC_RANGE=10.5, SEC_ARC=Math.PI/2, DETAIN_TIME=30, SEC_USES_MAX=2;
    function secArcOk(sec,x,y){
      if(!sec)return false;
      const b=G.bots&&G.bots.secbot;
      const ang=b&&Number.isFinite(b.ang)?b.ang:0;
      let d=Math.atan2(y-sec.y,x-sec.x)-ang;
      d=Math.atan2(Math.sin(d),Math.cos(d));
      return Math.abs(d)<=SEC_ARC;
    }
    /* AI 预判：这个位置动手会不会被保安看到（与 botTick 的判定同源） */
    function secbotWouldSee(x,y){
      if(!G||G.secbotDead||(G.secbotUses||0)>=SEC_USES_MAX)return false;
      const sec=botPos('secbot');
      if(!sec)return false;
      if(Math.hypot(x-sec.x,y-sec.y)>=SEC_RANGE)return false;
      if(!losWalls(sec.x,sec.y,x,y))return false;
      return secArcOk(sec,x,y);
    }
    function resetBots(){
      if(!G)return;
      G.bots=G.bots||{};
      for(const kind of ['medbot','secbot']){
        const f=M.facility.find(q=>q.kind===kind);
        if(!f)continue;
        const p=nearestFree(f.x,f.y);
        /* 医疗无人机不巡逻：坞位就是医疗间正中央，航点只有它自己（它靠 medbotTick
           主动飞向伤员，巡逻线已删除）；保安机器人仍按 facility.patrol 走 4 点巡逻。 */
        const pts=kind==='medbot'?[[p[0],p[1]]]:(f.patrol&&f.patrol.length?f.patrol:[[f.x,f.y]]);
        const wps=pts.map(q=>nearestFree(q[0],q[1]));
        G.bots[kind]={x:p[0],y:p[1],wp:0,ang:0,face:1,wps:wps,moving:false};
        if(kind==='medbot')G.bots[kind].home=[p[0],p[1]];
      }
      /* 拘留位固定在军械库角落：被擒者是硬控状态，不能拖着锁链跟着机器人满地图跑 */
      const sec=M.facility.find(q=>q.kind==='secbot');
      G.jailPos=sec?nearestFree(sec.x+1.7,sec.y+1.3):null;
    }
    function botPos(kind){
      const b=G&&G.bots&&G.bots[kind];
      if(b)return b;
      const f=M.facility.find(q=>q.kind===kind);
      return f?{x:f.x,y:f.y}:null;
    }
    /* 巡逻推进：1.6 格/秒（玩家 5 格/秒），到点 0.3 格换下一个航点。
       不做避障——巡逻线是照家具空位手动排的，硬套 A* 会被掩体绕路带偏。 */
    function moveBot(b,dt,dead){
      if(!b)return;
      b.moving=false;
      if(dead||!b.wps||!b.wps.length)return;
      const w=b.wps[b.wp]||b.wps[0];
      const dx=w[0]-b.x, dy=w[1]-b.y, d=Math.hypot(dx,dy);
      if(d<0.3){ b.wp=(b.wp+1)%b.wps.length; return; }
      const step=Math.min(d,BOT_SPEED*dt);
      b.x+=dx/d*step; b.y+=dy/d*step;
      b.ang=Math.atan2(dy,dx);
      if(Math.abs(dx)>0.05)b.face=dx<0?-1:1;
      b.moving=true;
    }
    /* 拘留位：军械库角落（保安机器人把凶手押过去，30 秒后自动解锁） */
    function secJail(){
      /* 缓存一次即可：拘留位必须固定；原来每帧 nearestFree 会白跑 128 次循环 */
      return G&&G.jailPos?G.jailPos:null;
    }
    /* 保安捕捉：先近身追逐 → 压制 0.9 秒 → 押送到军械库角落。
       不再是“看到犯罪就瞬移锁角落”，但视频/音频仍会暴露这次抓捕。 */
    const SEC_CATCH_SPEED=7.5;
    function secCatchStart(killer,sec){
      const jail=secJail()||[sec.x,sec.y+1.6];
      G.secCatch={i:killer.i,phase:'chase',t:0,jail:[jail[0],jail[1]]};
      G.secbotUsed=true;G.secbotUses=(G.secbotUses||0)+1;G.secbotT=2.5;
      if(killer.drag!=null)releaseDragBy(killer,true);
      killer.path=null;killer.moving=false;killer.doing=0;killer._doing=null;
      G.fx.push({type:'alarm',x:sec.x,y:sec.y,t:1.4,dur:1.4});
      hear(sec.x,sec.y,'robot',1.25);
      aiHear('alarm',sec.x,sec.y,22,{});
      SND.alarm(); SND.robot();
    }
    function secCatchTick(dt,sec){
      const c=G.secCatch; if(!c)return false;
      const killer=G.agents[c.i];
      if(!killer||!killer.alive||killer.downed||G.over){G.secCatch=null;return false;}
      c.t+=dt;
      if(c.phase==='chase'){
        const d=Math.hypot(killer.x-sec.x,killer.y-sec.y);
        if(d>1.2&&c.t<7){
          const step=Math.min(d,SEC_CATCH_SPEED*dt);
          sec.x+=(killer.x-sec.x)/d*step; sec.y+=(killer.y-sec.y)/d*step;
          sec.ang=Math.atan2(killer.y-sec.y,killer.x-sec.x);
          sec.face=killer.x<sec.x?-1:1; sec.moving=true;
          /* 一帧就追到（大 dt 或目标很近）时直接进入压制，不等下一帧 */
          if(Math.hypot(killer.x-sec.x,killer.y-sec.y)>1.2)return true;
        }
        if(Math.hypot(killer.x-sec.x,killer.y-sec.y)>1.2){G.secCatch=null;return false;}
        c.phase='press';c.t=0;
        killer.detained=true;killer.detainedT=DETAIN_TIME+1.2;
        killer.path=null;killer.moving=false;killer.doing=0;killer._doing=null;killer.act=null;
        c.from=[killer.x,killer.y];
        G.fx.push({type:'detain',x1:sec.x,y1:sec.y,x2:killer.x,y2:killer.y,t:1.0,dur:1.0});
        /* 被按住这一下是**公开可见**的：附近 10 格内看得见的人都记一条 saw_detain。
           远处的人只听见警报（aiHear 不传 subj → 有记录但认不出是谁，也不加嫌疑）——
           旧写法传了 subj，等于让 26 格内的人闻声就锁定被拘留者，比亲眼看见还准。 */
        (G.detainLog=G.detainLog||{})[killer.i]=G.night;
        witnessDetain(killer,killer.x,killer.y,10);
        aiHear('detain',killer.x,killer.y,26,{});
        SND.robot();
        return true;
      }
      if(c.phase==='press'){
        if(c.t<0.9)return true;
        c.phase='escort';c.t=0;c.from=[killer.x,killer.y];
        return true;
      }
      const p=Math.min(1,c.t/1.2);
      killer.x=c.from[0]+(c.jail[0]-c.from[0])*p;
      killer.y=c.from[1]+(c.jail[1]-c.from[1])*p;
      sec.x=c.jail[0]+(c.jail[0]-c.from[0])*0.06;
      sec.y=c.jail[1]+(c.jail[1]-c.from[1])*0.06;
      sec.face=killer.x<sec.x?-1:1;
      if(p>=1){
        killer.x=c.jail[0];killer.y=c.jail[1];killer.detainedT=DETAIN_TIME;
        /* 押送到位这一下同样可见（军械库角落）：只加嫌疑分、不写确证。
           和「被按住」共用 witnessDetain，同一夜同一个人只记一次，不会重复加分。 */
        witnessDetain(killer,killer.x,killer.y,8);
        aiHear('detain',killer.x,killer.y,18,{});
        logEvent('detain',{actor:null,victim:killer.i,room:roomIdAt(killer.x,killer.y),
          x:+killer.x.toFixed(1),y:+killer.y.toFixed(1)});
        G.secCatch=null;
      }
      return true;
    }
    /* 医疗无人机（2026-10-31 从「巡逻机器人 + 隔空 5 秒施救」整体重做）：
       · 不再巡逻，悬停在医疗间正中央（坞位即医疗间中心，单航点）；
       · 医疗间里出现濒死者就自己飞过去，悬停到伤员身边（MEDBOT_TOUCH_R）才开始治疗；
       · 近身治疗满 MEDBOT_HEAL_TIME 秒才真正拉起，不再是隔空读条；
       · 救完自动飞回房间正中央等下一个，不再靠巡逻线覆盖判定。 */
    const MEDBOT_HEAL_TIME=3;      /* 近身治疗时长（秒）：判定、进度环、交互文案共用 */
    const MEDBOT_TOUCH_R=1.15;     /* 悬停到多近算「贴住伤员」 */
    const MEDBOT_FLY_SPEED=4.6;    /* 飞行速度（格/秒）：无人机不是地勤，比巡逻快 */
    /* 覆盖半径只服务对外文案与调试读数：医疗间半对角 ≈10.8 格，取 12 表示整间覆盖。
       真正的救援判定是 inMedRoom()（房间内即响应），不再用半径卡人。 */
    const MEDBOT_R=12;
    function medbotHome(){
      const b=G&&G.bots&&G.bots.medbot;
      if(b&&b.home)return b.home;
      const f=M.facility.find(q=>q.kind==='medbot');
      return f?[f.x,f.y]:[55,85.6];
    }
    function medbotFlyTo(b,tx,ty,dt,speed){
      const dx=tx-b.x, dy=ty-b.y, d=Math.hypot(dx,dy);
      if(d<1e-4){b.moving=false;return d;}
      b.ang=Math.atan2(dy,dx);
      if(Math.abs(dx)>0.05)b.face=dx<0?-1:1;
      const step=Math.min(d,speed*dt);
      b.x+=dx/d*step; b.y+=dy/d*step;
      b.moving=step>1e-4;
      return d;
    }
    /* 返回 true = 本帧由医疗逻辑接管（回坞 / 飞向伤员 / 治疗中），不跑巡逻 */
    function medbotTick(dt,med){
      if(!med)return false;
      if(G.medbotDead||(G.medbotLeft==null?MEDBOT_CHARGES:G.medbotLeft)<=0){
        G.medbotTarget=null;G.medbotT=0;med.healing=false;
        return false;
      }
      const home=medbotHome();
      /* 目标：医疗间内的濒死者。沿用上一帧的目标，避免两名伤员之间来回换人 */
      let v=null;
      if(G.medbotTarget!=null){
        const cur=G.agents[G.medbotTarget];
        if(cur&&cur.downed&&cur.alive&&inMedRoom(cur.x,cur.y))v=cur;
        else G.medbotTarget=null;
      }
      if(!v){
        let bd=1e9;
        for(const a of G.agents){
          if(!a.downed||!a.alive||!inMedRoom(a.x,a.y))continue;
          const d=Math.hypot(a.x-med.x,a.y-med.y);
          if(d<bd){bd=d;v=a;}
        }
        if(v)G.medbotTarget=v.i;
      }
      med.healing=false;
      if(!v){
        /* 没人可救：飞回医疗间正中央悬停 */
        G.medbotT=0;
        if(Math.hypot(home[0]-med.x,home[1]-med.y)>0.1)
          medbotFlyTo(med,home[0],home[1],dt,MEDBOT_FLY_SPEED*0.75);
        else med.moving=false;
        return true;
      }
      const d=Math.hypot(v.x-med.x,v.y-med.y);
      if(d>MEDBOT_TOUCH_R){
        /* 飞向伤员：途中不计时，贴着伤员才开始治疗 */
        medbotFlyTo(med,v.x,v.y,dt,MEDBOT_FLY_SPEED);
        G.medbotT=0;
        return true;
      }
      /* 近身悬停：治疗动画走满 MEDBOT_HEAL_TIME 秒才真正拉起 */
      med.moving=false;
      med.healing=true;
      med.ang=Math.atan2(v.y-med.y,v.x-med.x);
      G.medbotT=(G.medbotT||0)+dt;
      if(G.medbotT<MEDBOT_HEAL_TIME)return true;
      v.downed=false; v.downAt=0; v.killedBy=null;
      const dg=draggerOf(v);
      if(dg)releaseDragBy(dg,true);
      v.draggedBy=null;
      v.woundCause=null;v.downRoom=null;v.downX=null;v.downY=null;v.searched=false;
      G.medbotUsed=true;G.medbotLeft=Math.max(0,(G.medbotLeft==null?MEDBOT_CHARGES:G.medbotLeft)-1);
      /* 计时与目标必须一起清零：否则救完第一个后 ticks 直接 ≥MEDBOT_HEAL_TIME，
         同一波濒死会被瞬间连带救起（门禁断言 b1.medLeft===1 && b2===0） */
      G.medbotT=0; G.medbotTarget=null;
      G.fx.push({type:'healBeam',x1:med.x,y1:med.y,x2:v.x,y2:v.y,t:1.1,dur:1.1});
      G.fx.push({type:'heal',x:v.x,y:v.y,t:1.2,dur:1.2});
      setAct(v,'heal',0.7,{ang:0});
      /* 救治不对外报告（2026-10-31 用户裁定）：不给 toast、不写 envNotice ——
         以前 envNotice('revive') 会让全场活人 AI 拿到一条「医疗间有人被救活」的环境证据，
         等于把医疗无人机当成免费情报源。现在只留机器人运作声（环境音，不含受害者），
         事件流照旧记一条（复盘是只读旁路，不是对局情报）。 */
      hear(med.x,med.y,'robot',1.1);
      aiHear('robot',med.x,med.y,18);
      SND.robot();
      logEvent('revive',{actor:null,victim:v.i,method:'medbot',room:'med',
        x:+v.x.toFixed(1),y:+v.y.toFixed(1)});
      if(G.stats)G.stats.medbotRevives=(G.stats.medbotRevives||0)+1;
      if(G.simMode&&G.simStats)G.simStats.medbotRevives++;
      runInvariants('medbot');
      return true;
    }
    function botTick(dt){
      if(G.meet||G.over)return;
      if(!G.bots)resetBots();
      const med=botPos('medbot');
      const sec=botPos('secbot');
      if(!medbotTick(dt,med))moveBot(G.bots.medbot,dt,G.medbotDead);
      if(!G.secCatch)moveBot(G.bots.secbot,dt,G.secbotDead);
      if(G.secbotT>0)G.secbotT=Math.max(0,G.secbotT-dt);
      // 保安机器人：180° 前方扇形内行凶 ⇒ 近身压制后押送到军械库角落（30 秒）
      if(G.secCatch){
        secCatchTick(dt,sec);
      }else if(sec&&!G.secbotDead&&(G.secbotUses||0)<SEC_USES_MAX&&G.secbotT<=0&&G.pendingCrime!=null){
        const c=G.pendingCrime; G.pendingCrime=null;
        const killer=G.agents[c];
        if(killer&&Math.hypot(killer.x-sec.x,killer.y-sec.y)<SEC_RANGE&&losWalls(sec.x,sec.y,killer.x,killer.y)&&secArcOk(sec,killer.x,killer.y)){
          if(killer===G.me&&G.dev){ toast('DEV：保安机器人没有看见你'); }
          else secCatchStart(killer,sec);
        }
      }
    }

    function checkWin(){
      if(G.over)return true;
      const humans=G.agents.filter(a=>!a.alien&&a.alive).length;
      const aliens=G.agents.filter(a=>a.alien&&a.alive).length;
      if(G.prog>=WIN_PTS){ endGame(true,'维修 '+WIN_PTS+' 分达成'); return true; }
      if(aliens===0){ endGame(true,'异形全部出局'); return true; }
      if(humans===0){ endGame(false,'人类全灭'); return true; }
      return false;
    }
    /* 结算页的两块表（2026-11-03，调研报告 P1-4）：这局本来就把 500+ 条事件都记下来了，
       以前结束时只给一行字，玩家"谁是谁、谁投了谁、谁被谁放倒"全看不见，
       只能点进复盘——多数人不会点。这里只读 `G.agents` 与 `G.events` 渲染，不参与判定。 */
    function renderEndTables(){
      const ids=document.getElementById('e-ids'), vs=document.getElementById('e-votes');
      const fateOf=a=>a.alive?(a.downed?'濒死存活':'存活')
        :(a.deathCause==='vote'?'被驱逐':(a.deathCause==='knife'?'被出刀':
          (a.deathCause==='shot'?'被枪杀':(a.deathCause==='bleed'?'天亮失血':'死亡'))));
      const add=(host,cls,text)=>{
        const s=document.createElement('span');s.className='chip '+cls;s.textContent=text;
        host.appendChild(s);return s;};
      if(ids){
        ids.innerHTML='';
        for(const a of G.agents){
          const row=document.createElement('div');row.className='row';
          add(row,a.alien?'ali':'hum',tagName(a)+(a.alien?' · 异形':' · 人类'));
          add(row,'dead',fateOf(a)+(a.deathRoom?(' · '+(roomNameById(a.deathRoom)||a.deathRoom)):''));
          if(a.killedBy!=null&&a.killedBy!==a.i)
            add(row,'ex','刀在 '+tagName(G.agents[a.killedBy]));
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
      closeBodyCard();
      closeCams(true);closePipePick(true);
      closeWheel(true);
      if(G.meet){ clearInterval(meetingTick); G.meet=null; document.getElementById('meet').classList.add('hide'); }
      document.getElementById('end').classList.remove('hide');
      /* 结算卡同样要给 DEV / 旁观横栏让位，否则标题被压住（T3） */
      if(!G.simMode)syncDevUi();
      document.getElementById('e-t').textContent=win?'人类胜利':'异形胜利';
      /* 结算摘要带上本局新增的三项统计（2026-10-31）：医疗无人机救治 / 幽灵任务 / 幽灵修故障 */
      const st=G.stats||{};
      document.getElementById('e-s').textContent=why+' · 维修 '+G.prog+'/'+WIN_PTS+' · 第 '+G.night+' 夜'
        +' · 无人机救治 '+(st.medbotRevives||0)+' 次 · 幽灵任务 '+(st.ghostTasks||0)+' 个'
        +' · 幽灵修故障 '+(st.ghostFixes||0)+' 次';
      if(win)SND.win(); else SND.lose();
      if(!G.simMode)renderEndTables();          /* 批量模拟不碰 DOM */
      runInvariants('end');
    }
    
    /* ---------------- 报告 / 会议 / 投票 ---------------- */
    let meetingTick=null;
    /* 同一具尸体在同一夜只能拉一次铃：第一次报告之后，那具尸体对本夜所有人失效；
       天亮进入下一夜（G.night++）后重新开放。reported 保留为布尔位供 UI 沿用，
       真正的判据是 reportNight —— 之前跨夜也锁死，等于一局只能报一次。 */
    /* 报告一次性（2026-11-03 修正）。
       旧判据只有"按夜"一层：`reported && reportNight===G.night`，
       而 startNight 会把所有 **alive** 的席位 `reported=false` —— 濒死者是活人，
       于是同一个躺着的人**每一夜都重新变成可报告**，15 个人 × 每人 2 次额度
       全可以花在同一个濒死者身上（用户报的现象）。
       现在把"报告一个还活着的人"绑定到**那一次倒下**：`downSeq` 每次倒下 +1，
       报告时记下 `reportSeq`；同一轮倒下报过就到底，被救起后再次倒下才算新发现。
       尸体的语义保持不变（按夜重报），因为会议一开始就把尸体清场了。 */
    /* 还能不能再开一场夜晚会议（2026-11-02）：本夜没开满、且当前不在会议里。
       **在消耗报告额度之前**必须先问这一句，否则额度会被一次开不起来的报告吃掉。 */
    function tryReport(){
      if(!G.me.alive||G.me.downed||G.meet||G.over)return;
      let best=null,bd=2.4;
      for(const a of G.agents){
        const bp=bodyPos(a); if(!bp)continue;
        if(bodyReported(a))continue;
        const d=Math.hypot(bp[0]-G.me.x,bp[1]-G.me.y);
        if(d<bd){bd=d;best=a;}
      }
      if(!best){toast('附近没有可报告的发现（2.4 格内）—— 同一具尸体跨夜可重报，同一个还躺着的人一轮只报一次');return;}
      /* 报告是有限资源（2026-11-02）：全局 2 次 + 每夜最多 2 场会。
         先检查再消耗，避免"按了 R 但会开不起来"白掉一次额度。 */
      if((G.me.reportLeft|0)<=0){toast('报告额度已用完（全局 2 次）——只能靠别人拉铃');return;}
      if(!nightMeetLeft()){toast('本夜会议已开满 '+SKSanity.MEET.perNight+' 场，报告不了');return;}
      markBodyReported(best);
      G.me.reportLeft--; G.me.reportsUsed=(G.me.reportsUsed||0)+1;
      SND.report();
      openMeeting('night',G.me,best);
    }
    /* ---------------- 会议发言：本地上下文叙事引擎 ----------------
       没有接外部 LLM（当前工具里没有可用的模型接口）。这里不随机抽台词，
       而是把每个 AI 真实去过的房间 / 修过的任务 / 看见过的人 / 目击的凶手
       拿来组句；质疑与回应引用上一条发言，投票沿用发言里的指控。 */
    /* 消歧（2026-11-04）：本对象是会议台词排期的运行时状态，
       与 SKSanity.MEET（会议配置表）不是一回事，故改名 MEET_SCHED。 */
    /* 方案 A 第五批：会议排期 MEET_SCHED 与 stopChatter/meetLater/sayStreakOK 真源在 js/t2/decision.js。 */
    /* 会议发言的两道"人味"闸门（2026-11-03，调研报告 P1-1 / P1-2）
       ① 连说让位：同一个人连着说到第 3 句起**不再播** —— 真人局里有人连说五句时，
          其他人根本没在听，这是"会议没有主持"最刺眼的症状。系统行与玩家自己的发言不受限。
       ② 台词去重：见 pickLine —— 本局说过的句式降权，同一角色对同一目标第二次开口
          自然会换说法（而不是把同一句复读四遍）。 */
    function say(who,text,kind){
      const raw=String(text).slice(0,140);
      if(!sayStreakOK(who,kind))return;   /* 让位：这句当作没说（不进事件流、不进复盘） */
      /* 会议发言也进事件流（复盘要看“为什么投他”）；模拟局不记，避免 1000 局刷爆内存 */
      if(!SIM_RUN&&G){
        const seat=G.agents.findIndex(a=>a.name===who);
        logEvent('chat',{actor:seat>=0?seat:null,who:who,sys:kind==='sys',text:raw});
      }
      if(SIM_RUN){
        if(G.meet){G.meet.lines=G.meet.lines||[];G.meet.lines.push({who,text:raw,sys:kind==='sys'});}
        return;
      }
      const box=document.getElementById('m-say'); if(!box)return;
      const d=document.createElement('div');
      /* T8（2026-11-05）：夜会一秒一条、每条 20+ 字，玩家最容易漏掉"谁在点我"。
         纯表现层：只在整行文本里出现玩家名字时加左侧金条，不改台词、不改解析、不写 sus。 */
      const hit=kind!=='sys'&&G&&G.me&&G.me.name&&raw.indexOf(G.me.name)>=0;
      d.className='ln'+(kind===true||kind==='me'?' me':'')+(kind==='sys'?' sys':'')+(hit?' hit':'');
      const b=document.createElement('b'); b.textContent=tagByName(who);
      d.appendChild(b); d.appendChild(document.createTextNode(raw));
      box.appendChild(d); box.scrollTop=box.scrollHeight;
      if(G.meet){G.meet.lines=G.meet.lines||[];G.meet.lines.push({who,text:raw,sys:kind==='sys'});}
    }
    function sysSay(t){ say('系统',t,'sys'); }
    function seenNames(a,opt){
      const out=[];
      for(const k in (a.nSeen||{})){
        const w=G.agents[+k];
        if(!w||w===a)continue;
        if((a.nSeen[k]||0)<3)continue;
        if(opt&&opt.aliveOnly&&(!w.alive||w.downed))continue;
        out.push(w);
      }
      return out;
    }
    /* 时间词（2026-11-02 措辞修正）：夜晚会议说"今晚"，**白天会议必须说"昨晚"** ——
       以前白天开会也一律说"今晚"，读起来像穿帮。 */
    function alibiOf(a){
      /* roomId 是拆谎核对用的**机器口径**（room 是台词用的中文名）：
         saw_agent 记录里存的是舱室 id，对质时必须按 id 比，不能再拿名字去撞。 */
      if(a.alien&&a._lie)return {room:a._lie.room,roomId:a._lie.roomId||null,
        task:a._lie.task,witnesses:[],lie:true,nextTask:null};
      const seen=seenNames(a,{aliveOnly:true});
      const rid=a.nRoom||roomIdAt(a.x,a.y);
      const p=M.points[a.tasks[a.tIdx]];
      return {room:roomNameById(rid),roomId:rid,task:a.nTask||null,witnesses:seen,
        nextTask:p?p.label:null,nextRoom:p?roomNameById(roomIdAt(p.x,p.y)):null};
    }
    function victimInfo(victim){
      if(!victim)return null;
      const bp=bodyPos(victim);
      const x=bp?bp[0]:(victim.deathX!=null?victim.deathX:victim.x);
      const y=bp?bp[1]:(victim.deathY!=null?victim.deathY:victim.y);
      const rid=victim.deathRoom||roomIdAt(x,y);
      return {a:victim,name:victim.name,roomId:rid,room:roomNameById(rid),
        dead:!victim.alive,
        cause:bodyWound(victim).replace(' · 仍在渗血','')};
    }
    function buildMeetCtx(kind,reporter,victim){
      const vi=victimInfo(victim);
      const ctx={kind,reporter,victim,victimInfo:vi,claims:[],playerSays:[],
        playerAccuse:null,playerVote:null,playerClaimRoom:null,quick:null,frames:[],
        playerClaims:[],playerSupport:null,
        /* lead[目标席位] = 第一个公开指控他的席位（追责机制要用"谁带的节奏"） */
        lead:{}};
      /* 尸体还热就有人来报：见过这具尸体的 AI 会想"你怎么这么快就到现场"。
         对异形是主动报告的代价，对人类是"发现得太巧"的合理怀疑。 */
      if(kind==='night'&&victim){
        const tDeath=victim.alive?(victim.downAt||0):(victim.deathAt||0);
        const age=Math.max(0,tDeath-G.t);
        ctx.quick={age:+age.toFixed(1),reporter:reporter?reporter.i:null};
        if(reporter&&reporter.alive&&age<=10){
          for(const w of G.agents){
            if(w===reporter||w.alien||!w.alive||w.downed||!w.mind)continue;
            if(!w.mind.mem.some(e=>e.kind==='saw_body'&&e.victim===victim.i))continue;
            susAdd(w,reporter.i,0.24,'quick_report',{kind:'quick_report',x:0,y:0,room:null,t:evNow()});
          }
        }
      }
      const used=new Set(vi?[vi.roomId]:[]);
      const alienAccused=new Set();
      /* 先做一轮时间线对质（2026-11-01 修量词）：
         旧写法「∃ 一条不匹配 → 定罪」会拿 30 秒前的旧位置否定现在的口供，
         等于 AI 在用过期证据指控一个说真话的人。
         现在只比**案发时刻 ±8 秒**，且窗口内只要有一条对得上就不定罪；
         窗口内一条记录都没有（checked=0）则闭嘴。 */
      const cw=(kind==='night'&&victim&&vi)?crimeWindow(victim):null;
      const contraHit=new Set();
      for(const w of G.agents){
        if(w.alien||!w.alive||w.downed||!w.mind)continue;
        for(const a of G.agents){
          if(a===w||a.alien||!a.alive||a.downed)continue;
          const ab=alibiOf(a);
          const r=checkAlibi(w,a.i,ab.roomId,cw?cw.t0:null,cw?cw.t1:null,cw?cw.tRef:null);
          /* 诊断口径（只统计不改行为）：旧量词这一次会不会定罪 */
          if(G.simStats&&oldQuantifierWouldFire(w,a.i,ab.roomId))
            G.simStats.contradictionOld=(G.simStats.contradictionOld||0)+1;
          if(r.checked===0||r.match)continue;
          /* 同一场会议里，**同一个人**只吃一次口供矛盾（2026-11-02）。
             原来 n 个目击者各记 0.28，一个人被三个人看见就叠 0.84 ——
             「拆谎太准」的一半其实是重复计账。现在按目标去重，权重不降、次数不刷。 */
          if(contraHit.has(a.i))continue;
          contraHit.add(a.i);
          susAddContradiction(w,a.i,0.28,'contradiction',r.evidence);
        }
      }
      /* 反向洗清：如果目击者在案发时间附近在另一个舱室看见某人，
         这个人的普通嫌疑降低；自己的确证不受影响。 */
      if(kind==='night'&&victim&&vi){
        const deathEv=NIGHT-Math.max(0,victim.alive?(victim.downAt||0):(victim.deathAt||0));
        const bodyRoom=vi.roomId;
        for(const w of G.agents){
          if(w.alien||!w.alive||w.downed||!w.mind)continue;
          for(const a of G.agents){
            if(a===w||!a.alive||a.downed)continue;
            for(const e of w.mind.mem.slice(-24)){
              if(e.kind!=='saw_agent'||e.subj!==a.i||!e.room||e.night!==G.night)continue;
              if(Math.abs(e.t-deathEv)>SKSanity.ALIBI.core||e.room===bodyRoom)continue;
              susCut(w,a.i,0.25,'alibi_clear',e);
              break;
            }
          }
        }
      }
      /* ---- 信念熵（F4）：决定"这一轮我该不该点名" ----
         sus 分布的香农熵越高 = 谁都像 = 越该犹豫。只影响发言语气与
         「要不要此刻点名」，**不碰 voteAbstain**（弃权率是平衡阀）。 */
      for(const a of G.agents){
        if(!a.alive||a.downed||!a.mind)continue;
        const h=SKSanity.beliefEntropy(a.mind.sus,a.i);
        a._entropy=+h.toFixed(2);
        a._hedge=h>=SKSanity.MIND.hedgeHi;
        a._sure=h<=SKSanity.MIND.sureLo;
        if(G.simStats){
          if(a._hedge)G.simStats.hedgeAgents=(G.simStats.hedgeAgents||0)+1;
          else if(a._sure)G.simStats.sureAgents=(G.simStats.sureAgents||0)+1;
        }
      }
      for(const a of G.agents){
        a.accuse=null;a.accuseWhy=null;a._abstain=false;
        if(a.alien&&a.alive&&!a.downed&&(a!==G.me||G.spectMode)){
          // 异形 AI：整场会议只用一个假口供，避免前后矛盾；玩家异形不参与自动指控
          const rooms=M.rooms.filter(r=>!used.has(r.id)&&r.id!=='bridge');
          const r=rooms.length?rooms[Math.floor(Math.random()*rooms.length)]:M.rooms[0];
          used.add(r.id);
          const pts=M.points.filter(p=>roomIdAt(p.x,p.y)===r.id);
          a._lie={room:r.name,roomId:r.id,task:pts.length?pts[Math.floor(Math.random()*pts.length)].label:'配电盘'};
          /* 只用自己目击推断出的队友（a.mates）做保护，不读取系统队友表；
             未识别的目标仍然可能被指控/投票，保持“同类也会被攻击”的规则。 */
          const allPool=G.agents.filter(x=>x!==a&&x.alive&&!x.downed&&!isMate(a,x.i));
          const clean=allPool.filter(x=>!x.detained);
          const pool=clean.length?clean:allPool;
          const fresh=pool.filter(x=>!alienAccused.has(x.i));
          const src=fresh.length?fresh:pool;
          const pick=src.length?src[Math.floor(Math.random()*src.length)]:null;
          a.accuse=pick?pick.i:null;
          if(a.accuse!=null)alienAccused.add(a.accuse);
          /* ---- 主动诬陷（2026-11-01）----
             异形自己就是凶手，根本没看见别人出刀 —— 但它会**编一份具体证词**：
             "我看见他在<房间>出刀 / 钻管道"。以前它只是随机指一个人，听众一算就知道
             它没有依据（还会被 empty_accuse 罚）。现在给伪证，在听众眼里
             它和真目击者无法区分 —— 这是社交推理里最难拆的一手。 */
          if(a.accuse!=null&&Math.random()<SKSanity.MISLEAD.chance){
            const rs=M.rooms.filter(x=>x.id!=='bridge');
            const rr=rs.length?rs[Math.floor(Math.random()*rs.length)]:M.rooms[0];
            const knife=Math.random()<SKSanity.MISLEAD.knifeRatio;
            a.accuseWhy={kind:knife?'saw_knife':'saw_pipe',room:rr.name,
              reason:'亲眼看见',solid:true,fake:true};
          }
          if(a.accuse!=null&&a.accuseWhy&&a.accuseWhy.solid&&!ctx.lead[a.accuse])
            ctx.lead[a.accuse]=a.i;
        }else{
          /* 人类：确证优先（见过出刀/钻管道/破坏/红身）→ 准-确证 → 目击凶手 → 嫌疑分 */
          const kn=bestKnownTarget(a);
          const al=kn?null:bestAlmostTarget(a);
          let si=kn?kn.i:(a.suspect!=null?a.suspect:null);
          if(si==null&&al)si=al.i;
          if(si==null){const bs=bestSusTarget(a,0.5);if(bs)si=bs.i;}
          /* 正向信任（2026-11-01）：手上没有确证时，一个长期在干正经事的人
             不该被一点嫌疑推上审判台。cred 越高越不会被咬 —— 这就是洗白的兑现口。
             2026-11-01 加 almost.friend：装够几夜的异形在这里能真的挡掉一次点名。 */
          if(si!=null&&!kn&&credOf(a,si)>=SKSanity.CRED.accuseShieldAt)si=null;
          if(si!=null&&!kn&&almostFriendOf(a,si)&&Math.random()<SKSanity.ALMOST.friendShieldAdd)si=null;
          /* 熵（F4）：局面糊成一团时先别点名，只表个态 —— 真人这时会说"我还没看清"。
             **不动弃权率**：弃权率是平衡阀，这里只影响「要不要此刻点名」。 */
          if(si!=null&&!kn&&a._hedge&&si!==(al?al.i:null))si=null;
          const s=si!=null?G.agents[si]:null;
          if(s&&s!==a&&s.alive&&!s.downed){
            a.accuse=si;
            a.accuseWhy=kn?{kind:kn.known.kind,room:kn.known.room||null,
              reason:'确证异形',known:true,solid:true}:
              (al&&si===al.i?{kind:'almost',room:null,reason:'基本确定',almost:true,solid:true}:
              (evidenceReason(a,si)||(a.suspect!=null?
                {kind:'saw_alien',room:null,reason:'亲眼目击',solid:true}:null)));
            /* evidenceReason 是"真看见/真取证"，返回的对象默认也算硬证词 */
            if(a.accuseWhy&&a.accuseWhy.solid==null)a.accuseWhy.solid=true;
            /* 只有"有依据"的指控才算带节奏；纯情绪指控不进 lead（否则追责会误伤） */
            if(a.accuseWhy&&a.accuseWhy.solid&&!ctx.lead[a.accuse])ctx.lead[a.accuse]=a.i;
          }
        }
      }
      /* 互斥证词（2026-11-03，调研报告 P1-5）：A 咬 B「亲眼看见」、B 同时咬 A「亲眼看见」
         —— 两条硬证词**逻辑上不可能同时为真**（真目击只有可能是其中一条，另一条是伪证）。
         旧实现把两边都当成"独立指控者"去乘共证加成（corrobMul），等于让一场对咬
         自动攒出两票"证据汇合"。现在：
           ① 互咬双方都**不吃共证加成**（coMul 归 1）—— 他的证词是被对抗的，不是被 corroborated 的；
           ② 系统当众点破一次（每场会议最多一句），让玩家看得见这个僵局；
           ③ **不新增任何 sus 数值** —— 谁对谁错仍然由各自的 known / 时间线去判。 */
      const vsPair={};
      for(const x of G.agents){
        if(!x.alive||x.downed||x.accuse==null)continue;
        const y=G.agents[x.accuse];
        if(!y||y===x||!y.alive||y.accuse!==x.i)continue;
        const k=Math.min(x.i,y.i)+'-'+Math.max(x.i,y.i);
        vsPair[k]=(vsPair[k]||0)+1;
      }
      const vsList=Object.keys(vsPair).map(k=>k.split('-').map(Number));
      if(vsList.length){
        const p=vsList[0];
        sysSay(nameOf(p[0])+' 和 '+nameOf(p[1])+' 互相指认亲眼看见对方动手'+
          (vsList.length>1?('，这样的对咬本场有 '+vsList.length+' 对'):'')+
          '—— 两条硬证词最多只有一条是真的。');
        if(G.simMode&&G.simStats)G.simStats.mutualFrames=(G.simStats.mutualFrames||0)+vsList.length;
      }
      /* 零证据指控会损耗发言者可信度：人类听众给空口指控者记一笔小嫌疑 */
      for(const w of G.agents){
        if(w.alien||!w.alive||w.downed||!w.mind)continue;
        for(const a of G.agents){
          if(a===w||!a.alive||a.downed||a.accuse==null)continue;
          const noEvidence=!a.accuseWhy&&a.suspect==null&&!bestKnownTarget(a)&&!topSus(a,0.5);
          if(noEvidence){
            const ev={kind:'empty_accuse',x:0,y:0,room:null,conf:0.25,src:'speech',subj:a.accuse};
            susAdd(w,a.i,0.05,'empty_accuse',ev);
          }else if(a.accuse!==w.i&&!(w.mind.known&&w.mind.known[a.accuse])){
            /* ---- 证言通道（2026-11-01 接线）----
               有依据的公开指控会**真的改变听众的判断**，而不是只当台词播出去。
               在此之前，AI 之间的指控对别人的 sus 一点影响都没有（17 个 susAdd 调用点
               里没有一条是 heard_accuse）—— 结果是"我确定 05 是异形"只是说说，
               目击者只有自己那一票，3 票门槛全靠运气。
               权重 = 基础 0.14 × 听众对**说话者**的能力信誉倍率（1.0~1.6）。
               注意：这里加权的是「说话者有多可信」，不是「被指控者信誉多高」；
               被指控者的 cred 已经在上面拦过一道（accuseShieldAt）。
               **只写 sus，绝不写 known** —— 证言不是亲眼所见，这条红线不能破。 */
            /* 分级权重（2026-11-01 实测标定）：
               一开始统一给 0.14，人类胜率从 50.3% 直接飙到 76.3% —— 因为
               绝大多数指控都是"我觉得他可疑"，不是"我亲眼看见"，一律给满权重
               等于把嫌疑分变成了传染。现在只有**确证级**证言给 0.12，
               其余按传闻给 0.045（约 1/3），传得动但传不疯。 */
            const solid=!!(a.accuseWhy&&a.accuseWhy.solid);
            const trust=credOf(w,a.i);
            /* ---- 说服力侧的三条（2026-11-01，幅度刻意压小）----
               ① 被公开指控过的人，证言分量打折 —— **只影响别人信不信他，
                  绝不影响他自己信什么**（`known` 那条红线不动）。
               ② 共证加成：同一目标有两个以上独立指控者时，第二个起加权
                  （MIDA 的"证据汇合"：多个独立来源指向同一人才更可信）。
               ③ 只写 sus，绝不写 known。 */
            const mud=SKSanity.TESTIFY;
            const dirty=(w.mind&&w.mind.sus&&(w.mind.sus[a.i]||0)>=mud.dirtySus)
              ? mud.dirtyMul : 1;
            const co=(ctx.__co||(ctx.__co={}));
            co[a.accuse]=(co[a.accuse]||0)+1;
            /* 互咬的双方不吃共证加成（见上面 vsPair 的注释）：对抗中的证词不是"汇合" */
            const vsKey=a.i<a.accuse?(a.i+'-'+a.accuse):(a.accuse+'-'+a.i);
            const coMul=(!vsPair[vsKey]&&co[a.accuse]>=2)?mud.corrobMul:1;
            /* F1：再乘说话者的**证言可信度**（0.5~1.5 倍）。
               「上次是他带头投错了人」会真的让他这次说话没那么值钱。 */
            const relia=SKSanity.reliaMul(reliaOf(w,a.i));
            const wgt=(solid?0.020:0.006)*SKSanity.credTestimony(trust)*dirty*coMul*relia;
            const ev={kind:'heard_accuse',x:0,y:0,
              room:a.accuseWhy?a.accuseWhy.room:null,conf:0.6,src:'speech',subj:a.accuse,
              by:a.i};
            susAdd(w,a.accuse,wgt,'heard_accuse',ev);
          }
        }
      }
      /* ---- 在场反驳 presence_deny（F3，2026-11-01）----
         比「你在别处」更硬也更像人的反驳：「我当时就在配电室，我没看见他」。
         三条严格条件，避免「没看见」变成万能反驳：
           ① 证人的指控**指向某个具体舱室**（accuseWhy.room 且算硬证词）；
           ② 我在**同一时间窗**内确实在那个舱室（我用 ox/oy 记下自己当时的位置）；
           ③ 那个舱室是**亮房**（亮房整间可见，看不见 = 确实不在）；暗房/走廊不适用。
         权重 0.16 < 正面矛盾 0.28 —— "没看见"是弱证据。 */
      if(kind!=='pre'){
        const win=claimWindow(null);
        for(const w of G.agents){
          if(w.alien||!w.alive||w.downed||!w.mind)continue;
          for(const a of G.agents){
            if(a===w||!a.alive||a.downed||a.accuse==null)continue;
            const why=a.accuseWhy;
            if(!why||!why.room||!why.solid)continue;
            const rid=roomIdOfName(why.room);
            if(!rid||rid==='corridor'||rid==='unknown')continue;
            if(!G.lit[rid])continue;
            const tgt=a.accuse;
            if(w.mind.known&&w.mind.known[tgt])continue;
            let inRoom=false,sawTgt=false;
            for(const e of w.mind.mem){
              if(e.kind!=='saw_agent'||e.night!==G.night)continue;
              if(e.t<win.t0||e.t>win.t1)continue;
              if(e.subj===tgt)sawTgt=true;
              if(e.lit&&e.ox!=null&&roomIdAt(e.ox,e.oy)===rid)inRoom=true;
            }
            if(!inRoom||sawTgt)continue;
            susAdd(w,a.i,0.16,'presence_deny',
              {kind:'presence_deny',x:0,y:0,room:rid,conf:0.5,src:'speech',subj:a.i});
            w._presenceDeny={by:a.i,room:rid};
            if(G.simStats)G.simStats.presenceDeny=(G.simStats.presenceDeny||0)+1;
            break;
          }
        }
      }
      /* ---- 沉默也是线索（F5，2026-11-01）----
         真人局里"他整场一句话没说"本身就是线索。边界：
         · 上限 0.10，且**永远不够格升级成准-确证**（silent 在 evalAlmost 里被排除）；
         · 只有健谈的人（soc 高）沉默才可疑，本来就内向的不该被罚；
         · 玩家席位不算（玩家不打字不等于沉默）。 */
      for(const a of G.agents){
        if(a.alien||!a.alive||a.downed||!a.mind)continue;
        if(a===G.me&&!G.spectMode)continue;
        if(a.accuse!=null||a.accuseWhy)continue;
        if(G.agents.some(x=>x.alive&&x.accuse===a.i))continue;
        const soc=(a.trait&&a.trait.soc)||50;
        if(soc<SKSanity.MIND.silentSocMin)continue;
        const wgt=SKSanity.MIND.silentSus*
          (1+SKSanity.MIND.silentSocMul*SKTrait.b(a,'soc'));
        for(const w of G.agents){
          if(w===a||w.alien||!w.alive||w.downed||!w.mind)continue;
          /* 2026-11-02：从"只对白纸生效"放宽到"最多一条旧疑点"。
             不放宽的时候沉默几乎没有重量（14 次/局全打在白纸上）；
             完全放开又会让「跨夜存量 + 今天话少」凑成没有新证据的指控（实测误逐翻倍）。
             取中间：已经有两条以上疑点的人不再加沉默分 —— 沉默只负责"从 0 到 1"。 */
          if(((w.mind.why||{})[a.i]||[]).length>1)continue;
          susAdd(w,a.i,wgt,'silent',
            {kind:'silent',x:0,y:0,room:null,conf:0.4,src:'speech',subj:a.i});
        }
        if(G.simStats)G.simStats.silentSus=(G.simStats.silentSus||0)+1;
      }
      /* 共同指控同一人 → 彼此更信任（2026-11-01）。
         这是"讨论影响关系"的最小闭环：一起咬过谁，之后就更愿意待在一起。 */
      {
        const accBy={};
        for(const a of G.agents){
          if(!a.alive||a.downed||a.accuse==null)continue;
          (accBy[a.accuse]=accBy[a.accuse]||[]).push(a.i);
        }
        for(const t in accBy){
          const list=accBy[t];
          if(list.length<2)continue;
          for(const i of list)for(const j of list)
            if(i!==j)warmAdd(G.agents[i],j,SKSanity.WARM.coAccuse);
        }
      }
      return ctx;
    }
    /* ---- 领袖指令（2026-11-01）----
       本局如果有领袖，让他当众下 1~2 条安排：给全队派活、或者点名让谁去哪。
       **不区分阵营** —— 可能是人类在组织，也可能是异形在把大家往错的方向带。
       效果刻意做轻：听众对领袖 +0.06 warm（之后空闲会愿意跟着他走），
       被点名的人只 +0.02 嫌疑（远低于一次真实指控）。 */
    function scheduleLeaderOrders(push){
      if(!push||G.leader==null)return;
      const L=G.agents[G.leader];
      if(!L||!L.alive||L.downed)return;
      const S=SKSanity.LEADER;
      const nOrders=(S.maxOrders>1&&Math.random()<0.4)?2:1;
      for(let k=0;k<nOrders;k++){
        const rm=M.rooms[Math.floor(Math.random()*M.rooms.length)];
        const pool=G.agents.filter(x=>x!==L&&x.alive&&!x.downed);
        const tgt=pool.length?pool[Math.floor(Math.random()*pool.length)]:null;
        push(()=>say(L.name,flavor(L,'leader',{r:rm.name,t:tgt?tgt.name:'大家'})));
        if(G.simMode&&G.simStats)G.simStats.orders=(G.simStats.orders||0)+1;
        /* 当众指派 ⇒ 写进被点名者的"待办"（aiHuman 挑下一个任务时决定是否照办）。
           只在**本夜**有效：天亮重排，不留跨夜的隐性命令。 */
        if(tgt&&tgt.mind)tgt.mind.order={room:rm.id,night:G.night,by:L.i};
        /* 接牌当众也可以推（2026-11-03）：用**与夜里同一套判据**预估他会不会去，
           预估不去就当场说一句"我去不了"。这样"号召力弱"是能被听见的事实，
           而不是只有散会后的行为差异。纯台词，不改任何判定。 */
        if(tgt&&!tgt.alien&&tgt.mind){
          const od=tgt.mind.order;
          const idx=tgt.tasks.findIndex((t,ix)=>ix>=tgt.tIdx&&M.points[t].room===od.room);
          const obeyP=(G.leaderCharisma||0)*obeyTrustMul(tgt,L.i);
          const willObey=idx===tgt.tIdx||(idx>tgt.tIdx&&Math.random()<obeyP);
          if(!willObey&&Math.random()<SKSanity.LEADER.refuseSpeakP)
            push(()=>say(tgt.name,flavor(tgt,'leader_refuse',
              {r:rm.name,k:(M.points[tgt.tasks[tgt.tIdx]]||{}).label||'任务'})));
        }
        for(const w of G.agents){
          if(w===L||!w.alive||w.downed||!w.mind)continue;
          warmAdd(w,L.i,S.warmGain);
          /* 2026-11-03：不再给"被点名的人"记嫌疑 —— 被分配任务是干活，不是作案。
             要付出代价的应该是**口头应下却没去**的人（见 aiHuman 的服从分支）。 */
        }
      }
    }
    /* 语料选择：按席位 / 夜数 / 会议轮次轮换，避免所有 AI 说同一句 */
    /* ---- 台词选择（2026-11-01 重写）----
       旧版是**确定性索引**：同一席位 + 同一夜 + 同一 salt → 每一局都念同一句，
       15 个人一个声音。这是"AI 不像人"最直接的来源。
       现在：
         · arr 传**字符串** → 去 SKLines 语料库里按「性格 × 情绪档」取（见 js/data/lines.js）；
         · arr 传**数组**   → 老调用点照旧可用，但改成等概率随机；
         · 占位符 {n}{t}{r}{k} 在这里统一替换。
       注意：随机用的是 Math.random，而蒙特卡洛会把它换成 simRng(seed)，
       所以 1000 局同 seed 依然逐局可复现 —— 这条不能破。 */
    /* 模板渲染：先展开 `{a|b|c}` 交替槽，再替换具名槽。
       顺序不能反 —— 交替槽里也可能带具名槽（`{刚才|{when}}`）。
       `{when}` 走 whenWord()（刚才 / 十几秒前 / 半分钟前，新鲜度口径与拆谎一致），
       `{prev}` 指"上一场会议"，`{why}` 用调用方塞进 ctx 的证据短语。 */
    function fillTpl(a,s,ctx){
      const c=ctx||{};
      let out=String(s);
      for(let i=0;i<8;i++){
        const before=out;
        out=out.replace(/\{([^{}]*\|[^{}]*)\}/g,(all,body)=>{
          const parts=body.split('|');
          return parts[Math.floor(Math.random()*parts.length)];
        });
        if(before===out)break;
      }
      return out
        .replace(/\{n\}/g,a&&a.name?a.name:'')
        .replace(/\{t\}/g,c.t||'他')
        .replace(/\{r\}/g,c.r||'走廊')
        .replace(/\{r2\}/g,c.r2||'现场')
        .replace(/\{u\}/g,c.u||(G&&G.me?G.me.name:'他'))
        .replace(/\{k\}/g,c.k||'任务')
        .replace(/\{when\}/g,c.when||whenWord())
        .replace(/\{prev\}/g,c.prev||'上一轮')
        .replace(/\{why\}/g,c.why||'他的说法对不上');
    }
    function pickLine(a,arr,salt,ctx){
      let pool=arr;
      if(typeof arr==='string'){
        const cat=arr;
        const tone=SKLines.toneOf(a,(ctx&&ctx.bias)||0);
        pool=SKLines.pool(cat,tone)||SKLines.pool(cat,'cold')||[];
        /* 组合式模板（2026-11-03 语料工程）：这一类若有 `{a|b}` 多槽行，三成时候从
           组合池取。行数不变但**成品句空间是乘出来的**，这是"十局不腻"的主杠杆。
           去重仍然按模板计（`G.lineUsed`），所以同一条组合模板不会被连抽四遍。 */
        const combo=SKLines.pool(cat,'combo');
        if(combo&&combo.length&&Math.random()<0.3)pool=combo;
      }
      if(!pool||!pool.length)return '';
      /* 本局降权（2026-11-03 调研报告 P1-2）：同一句模板说得越多，权重越低 ——
       `1/(1+3n)`，最多重挑 3 次。真人不会在一局里把同一句话复读四遍，
       同一角色对同一目标第二次开口因此自然会换句式。
       去重记在 `G.lineUsed`（整局，不跨局），键是**模板本身**，占位符还没填，
       所以判的是"句式重复"而不是"整句字符串重复"——那才是玩家真正会察觉的东西。 */
      const used=(G.lineUsed||(G.lineUsed={}));
      let raw='',pickIdx=0;
      for(let tries=0;tries<4;tries++){
        pickIdx=Math.floor(Math.random()*pool.length);
        const cand=pool[pickIdx], n=used[cand]||0;
        if(n===0||Math.random()<1/(1+3*n)){raw=cand;break;}
      }
      if(!raw)raw=pool[pickIdx]||pool[0];
      const n0=used[raw]||0;
      used[raw]=n0+1;
      if(n0>0&&G.simMode&&G.simStats)G.simStats.lineDups=(G.simStats.lineDups||0)+1;
      return fillTpl(a,raw,ctx);
    }
    /* 从语料库直接取一句（不需要旧数组兜底的场景用这个） */
    function flavor(a,cat,ctx){ return pickLine(a,cat,0,ctx); }
    /* ---- 背书（2026-11-03 信任聚焦）----
       我亲眼看到某人干过足够多正经事 ⇒ 当众说一句"我信他 / 我跟他"。
       门槛复用 `CRED.accuseShieldAt`（与"不再当众指控他"是同一条线），**不新造数值**。
       一场会议最多一次 —— 不然会变成夸夸会，反而把信任又稀释成噪声。
       语料池（`SKLines` 的 `endorse`）没到位时整段跳过，绝不退化成在调用处硬写台词。 */
    function pushEndorse(push,cands){
      if(!push||!cands||!window.SKLines||typeof SKLines.pool!=='function')return;
      if(!SKLines.pool('endorse','cold'))return;
      for(const x of cands){
        if(!x||x.alien||!x.mind||!x.alive)continue;
        const tc=topCred(x);
        if(!tc)continue;
        if(x.mind.known&&x.mind.known[tc.i])continue;
        const subj=G.agents[tc.i];
        if(!subj||subj===x||!subj.alive||subj.downed)continue;
        push(()=>say(x.name,flavor(x,'endorse',{t:subj.name,r:alibiOf(x).room})));
        if(G.simMode&&G.simStats)G.simStats.endorses=(G.simStats.endorses||0)+1;
        return;
      }
    }
    /* 证据里的舱室名。**两种写法都要认**：真目击存的是 id，异形伪证存的是中文名
       （见 planAlienDeception 里 `room: rr.name`）。
       以前这里只走 roomNameById(id)，伪证传中文名就会渲染成「未知位置」——
       而 AGENTS 立的规矩是"伪证的措辞和真目击一字不差"，一个"未知位置"就把假话出卖了。 */
    function evRoomName(w){
      if(!w||!w.room)return '现场';
      const id=roomIdOfName(w.room);
      return id?roomNameById(id):'现场';
    }
    /* 证据短语（2026-11-03 语料工程）：以前每个 kind 只有一句话，
       五个人指控同一人就出现五条逐字复读。现在短语从 `SKLines.WHY` 抽同义变体，
       **只换措辞**：kind / solid / fake / known / sus / 投票一律不动。
       池子里的短语可以带 {r}（舱室）与 {t}（对象），按同一套槽位渲染。 */
    function evClause(w,who){
      if(!w)return SKLines.why('unknown');
      const key=w.kind==='saw_alien'?'saw_knife':(SKLines.WHY[w.kind]?w.kind:'unknown');
      return fillTpl(who||null,SKLines.why(key),
        {r:evRoomName(w),k:SKLines.CLAIM_ACT[w.claimKind]||'动手'});
    }
    function defenseClause(a,m){
      const seen=seenNames(a,{aliveOnly:true});
      /* 辩护三种口（2026-11-03 内联池迁移）：有同行人 → 请他作证；
         只听见动静 → 承认听到但否认行动；孤身一人 → 声明位置并**划清与案发舱室的关系**。
         以前每条只有 1 句、全场共用，是"这句我听过"的稳定来源。
         ⚠ `{r2}` 必须是案发的舱室（来自 victimInfo），不能退化成"现场"这种空指 ——
         原句就是「但我没去过<案发舱室>」，那才是可被别人核对的信息。 */
      const vi=(m&&m.ctx)?m.ctx.victimInfo:null;
      if(seen.length)return pickLine(a,'respond_witness',0,
        {u:seen[0].name,r:alibiOf(a).room,when:whenWord()});
      if(a.mind&&a.mind.alert>0.5)return pickLine(a,'heard_deny',0,
        {r:alibiOf(a).room,when:whenWord()});
      return pickLine(a,'respond_alone',0,
        {r:alibiOf(a).room,r2:vi?vi.room:'现场',when:whenWord()});
    }
    /* 开场句与自述句（2026-11-03 内联池迁移）
       以前这两处各只有 2~4 条**硬写在调用处**，而它们是每场会议必说的句子 ——
       语料池扩到 850 行之后，玩家最先穿帮的恰恰还是这两句，所以必须一起搬进 SKLines。
       槽位：{r} 舱室 · {t} 对象 · {k} 死因/任务 · {when} 时间词。
       「尸体被移动过 / 我已检查伤口」这两个附注仍然按实际状态拼接，不进语料。 */
    function openingLine(a,m){
      const vi=m.ctx.victimInfo;
      if(!vi)return pickLine(a,m.kind==='day'?'open_nobody':'open_nobody_night',0,{});
      const bi=vi.a?bodyInfo(vi.a):null;
      const moved=bi&&bi.moved?' 尸体被移动过。':'';
      const searched=bi&&bi.searched?' 我已经检查过伤口。':'';
      const ctx={r:vi.room,t:vi.name,k:vi.cause};
      /* 报案句末尾再补一句"谁在场"的追问（同类池子，同一去重口径） */
      return (vi.dead?pickLine(a,'open_body_dead',0,ctx):pickLine(a,'open_body_alive',0,ctx))
        +moved+searched;
    }
    function alibiLine(a,m){
      const f=alibiOf(a),vi=m.ctx.victimInfo;
      if(m.kind==='pre'){
        return pickLine(a,'route_plan',0,{r:f.room,k:f.task||'任务'});
      }
      /* 自述 = 词干（我+时间+舱室）+ 任务子句 + 同路人子句。
         词干与子句都必须**不带句号**，句号在末尾统一补。
         没任务也没同伴时（"白纸"局面），直接说整句 selfcite —— 硬拼词干+子句
         会变成"我今晚在仓库，手上暂时没任务"这种填表腔。 */
      if(!f.task&&!f.nextTask&&!f.witnesses.length&&Math.random()<0.5)
        return pickLine(a,'selfcite',0,{r:f.room,k:f.task||'任务',when:whenWord()});
      let line=pickLine(a,'stem_room',0,{r:f.room,when:whenWord(),k:f.task||'任务'});
      if(f.task)line+=pickLine(a,'task_done_clause',0,{k:f.task});
      else if(f.nextTask)line+=pickLine(a,'task_next_clause',0,{r:f.nextRoom,k:f.nextTask});
      else line+=pickLine(a,'task_none_clause',0,{});
      if(f.witnesses.length)line+=pickLine(a,'mate_clause',0,{r:f.room,t:f.witnesses[0].name});
      line+='。';
      const why=a.accuse!=null?(a.accuseWhy||evidenceReason(a,a.accuse)):null;
      /* 2026-11-01：异形也会**公开指控**（诬陷），不再限制 !a.alien。
         伪证的措辞和真目击一字不差 —— 听众无从分辨，这正是诬陷的意义。 */
      if(why){
        line+=' 我怀疑'+nameOf(a.accuse)+'：'+evClause(why)+'。';
        /* 真人说完证据会顺手甩一句号召/态度（"直接票了""铁狼无疑"）。
           35% 概率补一句，避免每条都拖长。 */
        if(Math.random()<0.35)line+=' '+flavor(a,'call',{t:nameOf(a.accuse)});
      }
      const sawVictim=vi?seenNames(a).find(w=>w===vi.a):null;
      if(sawVictim)line+=' '+vi.name+'从我那边经过，当时还没事。';
      else if(!a.alien&&a.accuse!=null&&a.suspect!=null&&vi){
        line+=' 我看见'+nameOf(a.accuse)+'对'+vi.name+'动了手。';
      }
      return line;
    }
    function pickChallenge(claims,cands){
      for(const s of claims){
        const c=cands.find(x=>x!==s.a&&alibiOf(x).room===s.room&&!seenNames(x).includes(s.a));
        if(c)return {c,s,kind:'doubt'};
      }
      for(const s of claims){
        const c=cands.find(x=>x!==s.a&&seenNames(x).includes(s.a));
        if(c)return {c,s,kind:'support'};
      }
      const s=claims[claims.length-1];
      if(!s)return null;
      const c=cands.find(x=>x!==s.a);
      return c?{c,s,kind:'ask'}:null;
    }
    function challengeText(ch){
      /* 对质与回应（2026-11-03 内联池迁移）：这三段以前每个只有 3 条硬写在调用处，
         而它们是**玩家每次发言都会触发**的回应 —— 池子小就等于每两三局原句重演。
         {r} = 对方声称的舱室，{r2} = 案发舱室，{u} = 被提到的第二人。 */
      if(ch.kind==='doubt')return pickLine(ch.c,'doubt_room',0,
        {t:ch.s.a.name,r:ch.s.room,when:whenWord()});
      if(ch.kind==='support')return pickLine(ch.c,'support_claim',0,
        {t:ch.s.a.name,r:ch.s.room,when:whenWord()});
      return pickLine(ch.c,'ask_alone',0,{t:ch.s.a.name,when:whenWord()});
    }
    function respondText(ch,m){
      const s=ch.s;
      if(ch.kind==='support')return pickLine(s.a,'respond_support',0,
        {t:ch.c.name,r:alibiOf(s.a).room,when:whenWord()});
      const vi=m.ctx.victimInfo;
      if(s.a.alien)return pickLine(s.a,'alien_dodge',0,
        {u:vi?vi.name:'那件事',when:whenWord()});
      const f=alibiOf(s.a);
      if(f.witnesses.length)return pickLine(s.a,'respond_witness',0,
        {u:f.witnesses[0].name,r:f.room,when:whenWord()});
      return pickLine(s.a,'respond_alone',0,
        {r:f.room,r2:vi?vi.room:'现场',when:whenWord()});
    }
    function accuseLine(a,m){
      if(a.accuse==null)return null;
      const t=G.agents[a.accuse];
      if(!t||!t.alive||t.downed)return null;
      if(a.alien)return pickLine(a,'alien_accuse_soft',0,{t:t.name,when:whenWord()});
      /* 确证：不是"我怀疑"，是"我知道"——直接点破动作 */
      const kn=bestKnownTarget(a);
      if(kn&&kn.i===a.accuse){
        const k=kn.known.kind, rm=kn.known.room?roomNameById(kn.known.room):'现场';
        const act=k==='saw_pipe'?'钻管道':(k==='saw_knife'?'出刀':
          (k==='saw_sabotage'?'破坏设备':(k==='saw_bot'?'停摆机器人':'带着刚出刀的红光')));
        /* 「他是异形」这句**必须**留在池子里每一条中（known_accuse_hard 的语义底线：
           确证是结论不是怀疑，措辞要和普通指控拉开；门禁按 known 状态断言，不按字面） */
        return pickLine(a,'known_accuse_hard',0,{t:t.name,r:rm,k:act});
      }
      /* 准-确证（almost.foe）：**可以说「我基本确定」，但绝不说「我亲眼看见」**——
         这是三档确信度的中间那一档，也是 `empty_accuse` 惩罚仍然有意义的前提。 */
      const af=almostFoeOf(a,a.accuse);
      if(af)return pickLine(a,'almost',0,{t:t.name,conf:(af.conf*100|0)});
      const why=a.accuseWhy||evidenceReason(a,a.accuse);
      if(a.suspect!=null){
        if(why&&why.kind==='saw_knife'&&m&&m.ctx.victimInfo)
          return '我投'+t.name+'。我亲眼看见他对'+m.ctx.victimInfo.name+'出刀，不是猜的。';
        return '我投'+t.name+'。我亲眼看见他动手，不是猜的。';
      }
      if(why)return '我投'+t.name+'。'+evClause(why)+'。';
      /* 熵低（局面清楚）时语气更肯定；熵高时承认自己没看清 —— 都是人话 */
      if(a._hedge)return pickLine(a,'hedge',0,{t:t.name});
      return pickLine(a,'accuse',0,{t:t.name})||
        ('我跟一票'+t.name+'，他的说法和我看到的对不上。');
    }
    /* 异形会议欺骗：被确证时先反驳，再可能反咬一个"钻管道 / 带红光"的假目击；
       没有被确证时偶尔主动搅浑水。假话只进 ctx.frames 与传闻嫌疑
       （heard_frame），永远不写 mind.known，也不改变真目击者的投票锁定。
       听众若用自己的 saw_agent 记忆抓到说谎者的假口供，会反过来怀疑说谎者。 */
    function planAlienDeception(m,cands,sureAcc){
      const out={frames:[],lines:[]};
      if(!m||m.kind==='pre')return out;
      const vi=m.ctx?m.ctx.victimInfo:null;
      const pool=G.agents.filter(x=>x.alive&&!x.downed&&(x!==G.me||G.spectMode));
      const aliens=pool.filter(x=>x.alien);
      if(!aliens.length)return out;
      const sureKn=sureAcc?bestKnownTarget(sureAcc):null;
      const sureTgt=sureKn?G.agents[sureKn.i]:null;
      let liar=null,counter=false;
      if(sureTgt&&sureTgt.alien&&(sureTgt!==G.me||G.spectMode)){
        liar=sureTgt;counter=true;
      }else if(Math.random()<0.4){
        liar=aliens[Math.floor(Math.random()*aliens.length)];
      }
      if(!liar)return out;
      /* 绝不构陷已经认出的队友；只把水泼到非队友身上 */
      const targets=pool.filter(x=>x!==liar&&(!vi||x!==vi.a)&&!isMate(liar,x.i));
      if(!targets.length)return out;
      let tgt=null;
      if(counter&&sureAcc&&sureAcc.alive&&!sureAcc.downed&&sureAcc!==liar&&Math.random()<0.65)
        tgt=sureAcc;
      if(!tgt)tgt=targets[Math.floor(Math.random()*targets.length)];
      if(!tgt)return out;
      const sureKind=sureKn?sureKn.known.kind:null;
      /* 主动先发制人时优先说"红光"，更像现场目击 */
      const kind=counter?(sureKind==='saw_pipe'?(Math.random()<0.7?'saw_pipe':'saw_red'):
        (sureKind==='saw_red'?(Math.random()<0.7?'saw_red':'saw_pipe'):
          (Math.random()<0.5?'saw_pipe':'saw_red'))):'saw_red';
      /* 已经认出队友时，队友帮腔共同诬陷 */
      const ally=pool.find(x=>x.alien&&x!==liar&&x!==tgt&&isMate(x,liar.i));
      if(ally&&((ally.accuse==null)||isMate(ally,ally.accuse)))ally.accuse=tgt.i;
      const own=alibiOf(liar), tf=alibiOf(tgt);
      /* 管道只存在 4 个舱室：构陷目标自述的房间如果没有管道口，
         就换一间真有管道的舱室，不能凭空在医疗间/走廊“钻管道”。 */
      let room=tf.room||null;
      if(kind==='saw_pipe'){
        const names=pipeRoomIds().map(roomNameById);
        if(names.indexOf(room)<0)room=names.length?names[Math.floor(Math.random()*names.length)]:null;
      }
      if(!room)room='走廊';
      const claim=kind==='saw_pipe'
        ?'我亲眼看见'+tgt.name+'在'+room+'钻进了管道'
        :'我亲眼看见'+tgt.name+'身上带着刚出刀的红光';
      const denial=sureKind==='saw_pipe'?'我没钻过管道':
        (sureKind==='saw_red'?'我没出过刀':
        (sureKind==='saw_knife'?'我没杀过人':
        (sureKind==='saw_sabotage'?'我没破坏过设备':
        (sureKind==='saw_bot'?'我没碰过机器人':'我没动过手'))));
      const rebut=(counter?denial+'。':'')+'我'+whenWord()+'在'+own.room+'，'+claim+'。';
      const frame={by:liar.i,target:tgt.i,kind:kind,room:room,ownRoom:own.room,
        sureKind:sureKind,text:rebut,reaffirm:null,response:null,caught:null,
        ally:ally?ally.i:null,allyText:null};
      if(ally&&ally.accuse!==liar.i){
        /* 同上：确证过说谎者的人不会反过来替他背书 */
        frame.allyText='我'+whenWord()+'在'+alibiOf(ally).room+'，我也看见了：'+tgt.name+
          (kind==='saw_pipe'?'钻进了管道':'身上带着刚出刀的红光')+'。'+liar.name+'没撒谎。';
        /* 为已被自己确证的异形辩护，会引来“你是不是同伙”的怀疑 */
        for(const w of G.agents){
          if(w.alien||!w.alive||w.downed||!w.mind)continue;
          if(w.mind.known&&w.mind.known[tgt.i])susAdd(w,ally.i,0.1,'defended_suspect');
        }
      }
      /* 反咬目标如果不是证人，让它自己回应（不读阵营，谁被点名谁说话） */
      if(tgt!==sureAcc&&(tgt!==G.me||G.spectMode)){
        const tRoom=alibiOf(tgt).room;
        frame.response=kind==='saw_pipe'
          ?'我没钻过管道。那会儿我在'+tRoom+'，谁能给我作证？'
          :'我身上没有红光。那会儿我在'+tRoom+'，别只凭一句话。';
      }
      /* 真目击者不吃这一套：重申自己看见的是谁 */
      if(counter&&sureAcc&&(sureAcc!==G.me||G.spectMode)&&sureAcc.alive&&!sureAcc.downed){
        const knownRoom=sureKn&&sureKn.known&&sureKn.known.room;
        const wRoom=kind==='saw_pipe'&&knownRoom?roomNameById(knownRoom):alibiOf(sureAcc).room;
        const act=kind==='saw_pipe'?'钻管道':'带着红光';
        frame.reaffirm='我没看错，'+liar.name+'。我'+whenWord()+'在'+wRoom+'，亲眼看见'+act+'的就是你'+
          (tgt===sureAcc?'。':'，不是'+tgt.name+'。');
      }
      /* 听众用自己的时间线记忆拆谎：说谎者假口供里的舱室与目击记录对不上。
         2026-11-01 修量词：只比最近 45 秒，且窗口内**有一条对得上就不算说谎**；
         没有任何记录（checked=0）的听众闭嘴 —— 不再拿过期位置定罪。 */
      for(const w of G.agents){
        if(w===liar||w===tgt||w===sureAcc||!w.alive||w.downed||w.alien||!w.mind)continue;
        const r=checkAlibi(w,liar.i,own.roomId,null,null,null);
        if(r.checked===0||r.match)continue;
        const seen=roomNameById(r.evidence.room);
        const tw=SKSanity.alibiTimeWord(r.age);
        frame.caught={i:w.i,e:r.evidence,age:r.age,
          text:'我'+tw+'在'+seen+'看见'+liar.name+'了。你说你在'+own.room+'？对不上。'};
        break;
      }
      /* 传闻嫌疑：没有确证的听众只加很少的 heard_frame；
         抓到假口供的听众反过来怀疑说谎者。真目击者（有 known）不受影响。 */
      for(const w of G.agents){
        if(w===liar||w===tgt||w===sureAcc||!w.alive||w.downed||!w.mind)continue;
        if(bestKnownTarget(w))continue;
        if(frame.caught&&frame.caught.i===w.i){
          susAddContradiction(w,liar.i,0.24,'contradiction_lie',frame.caught.e);
        }else{
          const ev={kind:'heard_frame',x:0,y:0,room:null,conf:0.32,src:'speech',subj:tgt.i,by:liar.i};
          evPush(w,ev);
          /* 0.14 → 0.18 → 0.26（2026-11-02）：构陷要能真的带出票。
             实测 0.18 还不足以把被构陷者推过指控门槛（0.50），异形的"自信表演"基本空转；
             0.26 时"三个人被同一套话术打动"就能凑出一次冤案 —— 这正是真人局最常见的误判。
             仍然远低于任何硬证据（saw_knife 0.75），而且有 `known` 的听众根本不进入这一段；
             它**也不会**凑成 almost.foe（传闻被排除在"证据种类"之外）。 */
          susAdd(w,tgt.i,0.26,'heard_frame',ev);
          if(ally){
            const ev2={kind:'heard_frame',x:0,y:0,room:null,conf:0.3,src:'speech',subj:tgt.i,ally:1};
            evPush(w,ev2);
            susAdd(w,tgt.i,0.08,'heard_frame_ally',ev2);
          }
        }
      }
      /* 让说谎者的投票与假口供保持一致；其他 AI 的目标不动 */
      liar.accuse=tgt.i;
      liar.accuseWhy={kind:kind,room:null,reason:'反咬'};
      out.frames.push(frame);
      out.lines.push(()=>say(liar.name,rebut));
      if(frame.allyText)out.lines.push(()=>say(ally.name,frame.allyText));
      if(frame.response)out.lines.push(()=>say(tgt.name,frame.response));
      if(frame.caught)out.lines.push(()=>say(G.agents[frame.caught.i].name,frame.caught.text));
      if(frame.reaffirm)out.lines.push(()=>say(sureAcc.name,frame.reaffirm));
      return out;
    }
    function pickResponder(m,cands){
      const spoken=(m.lines||[]).map(l=>l.who);
      const fresh=cands.filter(a=>spoken.indexOf(a.name)<0);
      const pool=fresh.length?fresh:cands;
      return pool[Math.floor(Math.random()*pool.length)];
    }
    /* 人类互相辩护（2026-10-31）：人类也会替人说话，不只是异形护队友。
       约束保留：手上有对该人的确证时绝不辩护（当场自相矛盾）；
       只替「人类 + 正被普通指控」的人开口，概率 55%。
       决策放在同步段调用，蒙特卡洛也能统计到次数。 */
    function decideHumanDefend(cands){
      const accusers=cands.filter(a=>a.accuse!=null&&G.agents[a.accuse]&&
        G.agents[a.accuse].alive&&a.accuse!==a.i);
      for(const a0 of accusers){
        const tgt=G.agents[a0.accuse];
        /* 2026-11-01：删掉 `tgt.alien` —— 原来人类**永远不会替异形说话**，
           等于让 AI 读了身份答案（违反「不得读取 alien 身份」）。
           结果就是「装了好几天的人永远换不来一句辩护」，伪装收益是假的，
           也让 F2 的「昨天保他、今天咬他」在真实对局里根本演不出来。
           现在只按规则判断：没亲眼确证过他，就可能替他说话。 */
        if(!tgt||!tgt.alive||tgt.downed)continue;
        const pool=cands.filter(x=>!x.alien&&x!==a0&&x!==tgt&&x.alive&&!x.downed&&
          !(x.mind&&x.mind.known&&x.mind.known[tgt.i])&&
          !almostFoeOf(x,tgt.i));
        if(!pool.length)continue;
        /* 替人辩护的意愿由性格决定（社交的人更爱开口，激进的人更敢顶嘴） */
        const defender=pool[(Math.random()*pool.length)|0];
        if(Math.random()>SKTrait.C.defendChance(defender))continue;
        const by=defender;
        if(G.stats)G.stats.humanDefends=(G.stats.humanDefends||0)+1;
        if(G.simMode&&G.simStats)G.simStats.humanDefends++;
        return {by:by,target:tgt,accuser:a0};
      }
      return null;
    }
    /* 异形也会质疑「尸体还热就喊人」的报案者（2026-10-31）。
       只搅浑水，不写 known、不加确证；40% 概率出手，优先自己没被确证的异形。 */
    function decideAlienDoubt(m,cands){
      const q=m&&m.ctx&&m.ctx.quick;
      if(!q||q.age>10||q.reporter==null)return null;
      const rp=G.agents[q.reporter];
      if(!rp||!rp.alive||rp.downed)return null;
      const pool=cands.filter(x=>x.alien&&x!==rp);
      if(!pool.length)return null;
      if(Math.random()>0.4)return null;
      const by=pool[Math.floor(Math.random()*pool.length)];
      if(G.simMode&&G.simStats)G.simStats.reportDoubts++;
      return {by:by,reporter:rp};
    }
    function startChatter(m){
      stopChatter();
      /* 旁观模式下 0 号是独立 AI，不是"玩家席位"，必须进入发言与投票池 */
      const ai=G.agents.filter(a=>a.alive&&!a.downed&&(a!==G.me||G.spectMode));
      if(!ai.length)return;
      /* 发言权倾斜（P-a，2026-11-01）：不再纯随机打乱 —— 真人局里是「2~3 个人说掉
         大半的话，其余人一两句」。排序分 = 手上有多少东西要说（确证/准-确证/指控/
         目击记录）+ soc 性格 + 一点随机。有料的人先开口，安静的人自然落到后面，
         再配 F5 的「沉默也是线索」才闭环。 */
      const talkScore=a=>{
        let s=Math.random();
        if(a.mind){
          if(a.mind.known&&Object.keys(a.mind.known).length)s+=2.0;
          if(a.mind.almost&&Object.keys(a.mind.almost.foe||{}).length)s+=1.2;
          if(a._retract!=null)s+=1.5;
          if(a.accuse!=null)s+=1.0;
          const why=Object.keys(a.mind.why||{}).length;s+=Math.min(1.0,why*0.12);
        }
        s+=0.6*SKTrait.b(a,'soc');
        return s;
      };
      const cands=ai.slice().sort((x,y)=>talkScore(y)-talkScore(x));
      m.ctx.aiCands=cands.map(a=>a.i);
      const D=Math.max(12,m.discuss||25);
      /* 排期收尾：最后一条贴着"结束前 endPad 秒"，最短不低于 minPlan 秒
         （2026-11-03 外提，数值来自 SKSanity.MEET，与讨论时长联动而不是写死 60 秒） */
      const endAt=Math.max(SKSanity.MEET.minPlan*1000,
                           D*1000-SKSanity.MEET.endPad*1000);
      const agenda=[];
      const push=fn=>agenda.push(fn);
      /* 会议欺骗要先算：说谎者的投票目标要在大厅指控那一轮之前定下来 */
      const sureAcc=cands.find(a=>!a.alien&&bestKnownTarget(a));
      const deception=planAlienDeception(m,cands,sureAcc);
      if(deception.frames.length)m.ctx.frames=deception.frames;
      /* 人类辩护 / 异形质疑报案者：都在同步段定下来（批量模拟也要统计到）。
         辩护记账也放在这里：批量模拟没有台词排期，但「谁保过谁」必须记上，
         否则翻身份后的回溯追责在 sim 里永远不触发。 */
      const humanDefend=decideHumanDefend(cands);
      if(humanDefend)defenseNote(humanDefend.by,humanDefend.target);
      const alienDoubt=decideAlienDoubt(m,cands);
      /* 批量模拟：不排真实台词定时器；会议决策/传闻嫌疑已在上面同步完成 */
      if(G.simMode)return;

      if(m.kind==='pre'){
        push(()=>sysSay('第 1 天 · 公开讨论 '+D+' 秒：先认识彼此、报第一站，讨论完直接进入第 1 夜。'));
        for(const a of cands.slice(0,3)) push(()=>say(a.name,alibiLine(a,m)));
        for(const a of cands.slice(3,5)){
          push(()=>{
            const f=alibiOf(a);
            say(a.name,pickLine(a,'pre_route_invite',0,{r:f.room,k:f.task||'任务'}));
          });
        }
        const p1=cands[5]||cands[0], p2=cands[6]||cands[1];
        if(p1&&p2&&p1!==p2){
          push(()=>{
            const f=alibiOf(p2);
            say(p1.name,pickLine(p1,'pre_pair_up',0,{u:p2.name,r:f.room}));
          });
        }
        if(G.me.alive&&!G.me.downed&&!G.spectMode){
          const asker=cands[3]||cands[0];
          push(()=>say(asker.name,pickLine(asker,'ask_player_pre',0,{u:G.me.name})));
        }
        const tail=cands[cands.length-1];
        push(()=>sysSay('提示：异形会拉闸 / 钻管道 / 破坏设备 / 停摆机器人；亲眼看见可以直接在会议里点破。'));
        scheduleLeaderOrders(push);
        pushEndorse(push,cands);
        push(()=>say(tail.name,pickLine(tail,'pre_hype',0,{})));
        if(G.me.alive&&!G.me.downed&&!G.spectMode){
          const q=cands[1]||cands[0];
          push(()=>say(q.name,'对了，'+G.me.name+'，你要是看到管道有人钻，记得先记下是谁。'));
        }
      }else{
        const vi=m.ctx.victimInfo;
        if(m.reporter&&(m.reporter!==G.me||G.spectMode)&&m.reporter.alive&&!m.reporter.downed){
          push(()=>say(m.reporter.name,openingLine(m.reporter,m)));
        }else if(vi){
          /* 报告者是玩家本人时不替玩家编台词：那会在聊天栏里冒出一个"AI 玩家名"，
             说的还是玩家没打过的字。改成系统播报，事实同样来自 victimInfo。
             顺带修掉另一件事——原来这里写死一句"人已经没了/还有呼吸"，
             导致 openingLine 里"先别急着乱投，先救人"那一档永远没有机会说出口。 */
          if(G.spectMode)push(()=>sysSay('在'+vi.room+'发现'+vi.name+'，'+vi.cause+'。'));
          else push(()=>sysSay(G.me.name+' 在'+vi.room+'发现了'+vi.name+'，'+vi.cause+
            (vi.dead?'，人已经没了。':'，还有呼吸——先救人，但动手的人就在我们中间。')));
        }else{
          /* 2026-11-02 用户裁定：**白天回会议室、夜晚远程**。
             白天是真的把所有人传送到中央会议室（dawn() 负责刷位置）并打断任务；
             夜晚则是频道连线，人不离岗。 */
          push(()=>sysSay(m.kind==='day'?'天亮了，全员回中央会议室集合。':'没有尸体，但有人按下了会议铃。'));
        }
        if(m.ctx.quick&&m.ctx.quick.age<=10&&m.ctx.quick.reporter!=null){
          const rp=G.agents[m.ctx.quick.reporter];
          const q=cands.find(x=>!x.alien&&((x.mind&&x.mind.sus[m.ctx.quick.reporter])||0)>=0.2);
          /* 措辞（2026-11-02）：被报的人只是**倒地**时不能说"尸体"——那是玩家一眼就能
             看穿的出戏点。`vi.dead` 决定用"尸体"还是"人"。 */
          const deadWord=!(m.ctx.victimInfo&&!m.ctx.victimInfo.dead);
          const bodyW=deadWord?'尸体':'人';
          if(rp&&q)push(()=>say(q.name,pickLine(q,'quick_report_doubt',0,
            {t:rp.name,k:bodyW,r:vi?vi.room:'现场',when:whenWord()})));
        }
        /* 异形也会跟着起哄：同样咬「来太快」的报案者，把水搅浑（只进传闻嫌疑，不写确证） */
        if(alienDoubt)push(()=>say(alienDoubt.by.name,pickLine(alienDoubt.by,
          'alien_frame_reporter',0,{t:alienDoubt.reporter.name,
            k:(m.ctx.victimInfo&&!m.ctx.victimInfo.dead?'人还没凉':'尸体刚热')})));
        const speakers=cands.slice(0,3);
        for(const a of speakers){
          m.ctx.claims.push({a,room:alibiOf(a).room});
          push(()=>say(a.name,alibiLine(a,m)));
        }
        /* ---- 跨会议口供（F6，2026-11-01）：**只记不判** ----
           真人记得「你上次说你在引擎室」。这里只允许把它说出来，
           **绝不产生任何 `sus`**：昨晚在引擎室、今晚在配电室本来就正常，
           再给权重就是又一处量词错误（同 2026-11-01 那条教训）。 */
        for(const a of speakers){
          const al=alibiOf(a);
          const h=(a.mind&&a.mind.claimHist)||[];
          const prev=h.length?h[h.length-1]:null;
          if(prev&&prev.room&&prev.room!==al.room){
            const other=cands.find(x=>x!==a);
            if(other)push(()=>say(other.name,pickLine(other,'claim_recall',0,
              {t:a.name,r:al.room,r2:prev.room,when:whenWord()})));
            (m.ctx.claimNotes=m.ctx.claimNotes||[]).push({who:a.i,prev:prev.room,now:al.room});
            if(G.simStats)G.simStats.claimRecall=(G.simStats.claimRecall||0)+1;
          }
          recordClaim(a,al);
        }
        const asker=cands[3]||cands[0];
        if(G.me.alive&&!G.me.downed&&!G.spectMode){
          push(()=>say(asker.name,pickLine(asker,'ask_player_pre',0,
            {u:G.me.name,r:alibiOf(asker).room,when:whenWord()})));
        }
        const ch=pickChallenge(m.ctx.claims,cands);
        if(ch){
          /* 把"谁质疑了谁"记进会议上下文（只读旁路）：
             门禁由此可以**结构化**地断言对质链路，而不是拿台词字面去猜 ——
             语料扩到上千行之后，钉死某个措辞的断言必然会随机失效。 */
          m.ctx.challenge={by:ch.c.i,target:ch.s.a.i,kind:ch.kind,room:ch.s.room};
          push(()=>say(ch.c.name,challengeText(ch)));
          push(()=>say(ch.s.a.name,respondText(ch,m)));
        }
        /* 认错（2026-11-01）：上一场替一个**已被翻出是异形**的人说过话的人，
           这一场必须自己收回。这条不是写死的台词，是 known 硬覆盖 +
           追责机制自然产生的转折 —— 台词只负责把它说出来。 */
        for(const a of cands){
          const rt=a._retract;
          if(rt==null)continue;
          const t2=G.agents[rt];
          a._retract=null;
          if(!t2||t2.alive)continue;
          push(()=>say(a.name,pickLine(a,'retract',0,{t:t2.name})));
        }
        const accusers=cands.filter(a=>a.accuse!=null&&G.agents[a.accuse]&&G.agents[a.accuse].alive&&a.accuse!==a.i)
          .sort((x,y)=>{
            const sx=(x.alien?0:2)+(x.suspect!=null?2:0)+(x.accuseWhy?1:0);
            const sy=(y.alien?0:2)+(y.suspect!=null?2:0)+(y.accuseWhy?1:0);
            return sy-sx;
          }).slice(0,2);
        for(const a of accusers){
          push(()=>{const l=accuseLine(a,m);if(l)say(a.name,l);});
          /* 情绪写入：被当众指控的人记指控者一笔仇 —— 下次会议他大概率反咬 */
          const tgt3=G.agents[a.accuse];
          if(tgt3&&tgt3.alive)grudgeAdd(tgt3,a.i,0.40);
        }
        /* ---- 对质环节（2026-11-01）----
           以前只有开头那一轮 challenge，指控之后就没人再交锋了。
           这里补一次真正的对质：指控者拿被指控者**自己先前的口供**顶他，
           对方必须当场回应 —— 这是真人局里最有戏的一段。 */
        {
          const cfa=accusers.find(a=>G.agents[a.accuse]&&G.agents[a.accuse].alive);
          if(cfa){
            const tg=G.agents[cfa.accuse], rm=alibiOf(tg).room;
            push(()=>say(cfa.name,flavor(cfa,'confront',{t:tg.name,r:rm})));
            push(()=>say(tg.name,flavor(tg,'defend',{t:cfa.name,r:rm,k:alibiOf(tg).task||'任务'})));
          }
        }
        scheduleLeaderOrders(push);
        pushEndorse(push,cands);
        const accused=cands.find(a=>a.accuse!=null&&G.agents[a.accuse]&&G.agents[a.accuse].alive&&
          a.accuse!==a.i&&a!==accusers[0]);
        if(accused)push(()=>say(accused.name,defenseClause(accused,m)));
        /* 有确证的人最后点名：不是"我怀疑"，是"我确定" */
        const sure=sureAcc;
        if(sure)push(()=>{const l=accuseLine(sure,m);if(l)say(sure.name,l);});
        /* 异形的反驳 / 反咬紧跟在确证之后；真目击者会再顶回去 */
        for(const fn of deception.lines)push(fn);
        /* 已认出队友被普通指控时，队友公开辩护（确证反咬链已处理的不重复）。
           但"锁定过他就不会再保他"：谁手里有对他的确证（mind.known），
           就绝不能再开口说他不是异形——那是当场自相矛盾。 */
        const defended=new Set();
        for(const def of cands.filter(x=>x.alien)){
          for(const k in (def.mates||{})){
            const mate=G.agents[+k];
            if(!mate||!mate.alive||mate.downed)continue;
            if(deception.frames.some(f=>f.by===mate.i))continue;
            if(def.mind&&def.mind.known&&def.mind.known[mate.i])continue;
            const accuser=cands.find(x=>x!==mate&&x.accuse===mate.i);
            if(accuser&&!defended.has(mate.i)){
              defended.add(mate.i);
              for(const w of G.agents){
                if(w.alien||!w.alive||w.downed||!w.mind)continue;
                if(w.mind.known&&w.mind.known[mate.i])susAdd(w,def.i,0.1,'defended_suspect');
              }
              defenseNote(def,mate);
              push(()=>say(def.name,'我'+whenWord()+'在'+alibiOf(def).room+'，'+mate.name+
                '不是异形，别投他。'));
              trustAdd(mate,def.i,0.45);
              break;
            }
          }
        }
        /* 人类也会替人说话（2026-10-31）：只替人类、且自己手上没有对他确证的人辩护，
           不再让「辩护」变成异形专属行为 */
        if(humanDefend){
          /* 主动保人的话术（2026-11-03 内联池迁移）：这是 game.js 里**最后一处**数组式
             台词池。搬走之后门禁按源码扫描钉住「不许再把句子写在调用处」。 */
          push(()=>say(humanDefend.by.name,pickLine(humanDefend.by,'human_defend',0,
            {t:humanDefend.target.name,r:alibiOf(humanDefend.by).room,when:whenWord()})));
          /* 情绪写入：被当众保下的人记辩护者一笔恩 —— 之后更愿意跟他的票 */
          trustAdd(humanDefend.target,humanDefend.by.i,0.45);
          /* 元推理记账：被保的人日后翻出是异形 → 保他的人要被回溯算账（F2） */
          defenseNote(humanDefend.by,humanDefend.target);
        }
        let supporter=null;
        if(accusers.length){
          const a0=accusers[0],tgt=G.agents[a0.accuse];
          const pool=cands.filter(x=>x!==a0&&x!==tgt&&x.suspect==null&&x.accuse==null&&
            x.alive&&!x.downed&&!x.alien&&(x.mind?x.mind.alert:0)>=0.25);
          /* 跟票概率随性格：社交的人容易被带着走，谨慎的人更爱弃权（2026-10-31） */
          const follower=pool[Math.floor(Math.random()*pool.length)];
          if(pool.length&&Math.random()<SKTrait.C.followChance(follower)){
            supporter=follower;
            supporter.accuse=tgt.i;
            push(()=>say(supporter.name,pickLine(supporter,'follow_accuse',0,
              {t:tgt.name,u:a0.name,when:whenWord()})));
          }
        }
        /* 第二轮：再追一个没被问到的人，避免 60 秒里只有前三位开口 */
        const extra=cands.find(x=>!speakers.includes(x)&&x!==asker);
        if(extra){
          push(()=>{
            const f=alibiOf(extra);
            say(extra.name,pickLine(extra,'extra_self',0,
              {r:f.room,k:f.task?('修'+f.task):'',u:vi?vi.name:'出事的人',when:whenWord()}));
          });
        }
        const closer=cands[cands.length-1];
        push(()=>{
          const target=closer.accuse!=null?G.agents[closer.accuse]:null;
          if(target&&target.alive){
            say(closer.name,pickLine(closer,'closer_accuse',0,{t:target.name}));
          }else if(vi){
            closer._abstain=true;
            /* 弃权的人仍可能点名问玩家 —— 只有非旁观、玩家还活着才带上那句 */
            say(closer.name,pickLine(closer,'abstain_evidence',0,{r:vi?vi.room:'现场'})+
              /* 弃权的人仍可能点名问玩家；旁观模式下不替玩家搭话 */
              (G.me.alive&&!G.me.downed&&!G.spectMode&&Math.random()<0.5?
                ' '+pickLine(closer,'ask_player_pre',0,{u:G.me.name}):''));
          }else{
            closer._abstain=true;
            say(closer.name,pickLine(closer,'abstain_nobody',0,{r:alibiOf(closer).room}));
          }
        });
      }

      /* 均匀铺满讨论窗口：行与行间隔最多 2.6 秒，最少 1.2 秒；
         内容提前讲完后用系统提示补空档，避免"开头 7 秒热闹、剩下 50 秒死寂"。 */
      const t0=520;
      const step=Math.min(1600,Math.max(1000,(endAt-t0)/Math.max(1,agenda.length-1)));
      agenda.forEach((fn,i)=>meetLater(m,t0+i*step+Math.random()*160,fn));
      const lastAt=t0+step*(agenda.length-1);
      const nudges=[];
      for(let tn=lastAt+4200;tn<endAt-1600;tn+=9000){
        nudges.push(Math.round(tn));
        const seq=nudges.length;
        if(seq%2===1){
          meetLater(m,tn,()=>sysSay('自由讨论 · 剩余 '+Math.max(0,Math.round(m.t))+' 秒 · 输入框发言可直接追问'));
        }else{
          /* 空档里让 AI 主动接话：优先引用玩家刚才自述的位置，
             把「槽位」真正用进 AI 之间的对话，而不是只用于回复玩家。 */
          meetLater(m,tn,()=>{
            const a=cands[(seq*3)%cands.length]||cands[0];
            const cr=m.ctx&&m.ctx.playerClaimRoom;
            if(cr)say(a.name,pickLine(a,'nudge_player_claim',0,
              {u:G.me.name,r:roomNameById(cr)}));
            else say(a.name,pickLine(a,'pre_ask_more',0,
              {r:alibiOf(a).room,when:whenWord()}));
          });
        }
      }
      /* 排期审计：门禁用它确认「讨论内容真的覆盖到结束前」 */
      m.plan={kind:m.kind,discuss:D,t0:Math.round(t0),step:Math.round(step),
        n:agenda.length,lastAt:Math.round(lastAt),endAt:Math.round(endAt),nudges,
        lastScheduled:Math.round(Math.max(lastAt,nudges.length?nudges[nudges.length-1]:0,endAt))};
      meetLater(m,endAt,()=>{
        if(m.kind==='pre')sysSay('讨论结束，进入第 1 夜。');
        else sysSay('讨论时间到，进入投票。');
      });
    }
    /* ---------------- 玩家发言 → 槽位解析 ----------------
       把自由文本拆成「提到的人 / 舱室 / 指控 / 投票 / 是否否认 / 自述位置」，
       再用这些槽位生成 AI 回应：时间线对质、当场辩护、附和确证、追问证据。
       纯本地规则，不接模型；关键词只做槽位抽取，不做语义理解。 */
    /* 方案 A 第三批：ROOM_WORDS / CN_SEAT 真源在 js/t2/decision.js#SKT2Decision，本文件不再定义。 */
    /* 找一个能替某人作证的证人（只用于台词，不改变判定）—— 该包装从未被调用，
       台词现取一律走 seenNames()，已删。 */
    function playerTalk(text){
      const m=G.meet;
      if(!m||m.phase!=='discuss')return;
      const cands=G.agents.filter(a=>a.alive&&!a.downed&&a!==G.me);
      if(!cands.length)return;
      const sl=parseSpeech(text);
      m.ctx.playerSays=m.ctx.playerSays||[];
      m.ctx.playerSays.push({t:evNow(),slots:sl});
      if(sl.accuse!=null)m.ctx.playerAccuse=sl.accuse;
      if(sl.vote!=null)m.ctx.playerVote=sl.vote;
      if(sl.where)m.ctx.playerClaimRoom=sl.where;
      /* 情绪层（2026-10-31）：玩家说的每句话都在 AI 心里留痕 ——
         被你指控/投票的记你一笔仇（下次会议大概率反咬你），
         被你点名「不是异形 / 别投他」的记你一笔恩（更愿意跟着你投）。
         这是「发言影响 AI」的核心通道：嘴上赢不了的人，票上会输。 */
      if(sl.accuse!=null){
        const t=G.agents[sl.accuse];
        if(t&&t.alive)grudgeAdd(t,0,0.45);
      }
      if(sl.vote!=null){
        const t=G.agents[sl.vote];
        if(t&&t.alive)grudgeAdd(t,0,0.30);
      }
      if(/不是异形|别投|我保|他没错|不可能是他/.test(text)){
        for(const a of cands){
          if(!a.alien&&a.alive&&a.name&&text.indexOf(a.name)>=0)trustAdd(a,0,0.40);
        }
      }
      const vi=m.ctx.victimInfo;

      /* 1) 时间线对质：玩家自称在哪，但某个 AI 记得在别处见过他 → 当场拆穿。
         2026-11-01 修量词：只比玩家口供所指时段（"刚才" 20 秒 / "一直" 整夜 /
         没说时段按 45 秒），且窗口内有一条对得上就不拆穿 —— 旧写法会拿
         30 秒前的旧位置去否定玩家现在的口供。 */
      let challenger=null,conflict=null,conflictAge=0;
      if(sl.where){
        const win=claimWindow(sl.when);
        for(const w of cands){
          if(w.alien||!w.mind)continue;
          const r=checkAlibi(w,0,sl.where,win.t0,win.t1,win.tRef);
          if(r.checked===0||r.match)continue;
          susAddContradiction(w,0,0.3,'contradiction_player',r.evidence);
          challenger=w;conflict=r.evidence;conflictAge=r.age;break;
        }
      }
      if(challenger&&conflict){
        const roomClaim=roomNameById(sl.where),roomSeen=roomNameById(conflict.room);
        const tw=SKSanity.alibiTimeWord(conflictAge);
        meetLater(m,650+Math.random()*400,()=>say(challenger.name,pickLine(challenger,
          'challenge_player',0,{u:G.me.name,r:roomClaim,r2:roomSeen,when:tw})));
        return;
      }

      /* 2) 玩家提供的直接证据：先当"传闻"记下，绝不写成 known。
         有确证的人公开支持；没有确证的人只加少量 heard_claim 嫌疑；
         如果听众的时间线与玩家声称的现场冲突，反过来怀疑玩家（contradiction_claim）。 */
      if(sl.claim){
        const t=G.agents[sl.claim.target];
        if(!t||!t.alive||t.downed)return;
        /* “在医疗间/走廊钻管道”是物理上不可能的口供：那里没有管道口。
           不把它算成目标的证据，反过来怀疑编造者（玩家也适用）。 */
        if(sl.claim.kind==='saw_pipe'&&sl.claim.room&&!isPipeRoom(sl.claim.room)){
          const rn=roomNameById(sl.claim.room);
          const ev={kind:'impossible_claim',x:G.me.x,y:G.me.y,room:sl.claim.room,
            t:evNow(),conf:0.3,src:'speech'};
          for(const w of cands){
            if(w.alien||!w.mind)continue;
            susAdd(w,0,0.22,'impossible_claim',ev);
          }
          const speaker=cands.find(w=>!w.alien&&w.mind);
          if(speaker)meetLater(m,650+Math.random()*400,()=>say(speaker.name,
            pickLine(speaker,'impossible_pipe',0,{r:rn})));
          return;
        }
        m.ctx.playerClaims.push({t:evNow(),target:t.i,kind:sl.claim.kind,
          room:sl.claim.room||null});
        m.ctx.playerAccuse=t.i;
        const kindName={saw_pipe:'钻管道',saw_red:'身上带着红光',saw_knife:'出刀',
          saw_sabotage:'破坏设备',saw_bot:'停摆机器人',saw_breaker:'拉闸'}[sl.claim.kind]||'动手';
        /* 读心清零（2026-11-05）：挑「当众硬指认过 t 的人」，不再翻 w.mind.known。 */
        const solidAcc=pubSolidAccusers(t.i);
        const knownW=cands.find(w=>w!==t&&!w.alien&&solidAcc.indexOf(w.i)>=0);
        /* 同一个量词错误（2026-11-01 一并修）：旧写法取第一条不匹配的记录，
           就可能用 30 秒前的旧位置否定玩家现在提供的证据。 */
        let caught=null;
        if(!knownW&&sl.claim.room){
          const win=claimWindow(sl.when);
          for(const w of cands){
            if(w.alien||!w.mind||bestKnownTarget(w))continue;
            const r=checkAlibi(w,t.i,sl.claim.room,win.t0,win.t1,win.tRef);
            if(r.checked===0||r.match)continue;
            caught={w:w,e:r.evidence,seen:r.evidence.room,age:r.age}; break;
          }
        }
        if(caught){
          susAddContradiction(caught.w,0,0.22,'contradiction_claim',caught.e);
          const tw=SKSanity.alibiTimeWord(caught.age);
          meetLater(m,600+Math.random()*400,()=>say(caught.w.name,
            G.me.name+'，你说'+t.name+'在'+roomNameById(sl.claim.room)+'？我'+tw+'在'+
            roomNameById(caught.seen)+'看见他了，对不上。'));
          return;
        }
        const weight={saw_pipe:0.26,saw_red:0.24,saw_knife:0.30,
          saw_sabotage:0.22,saw_bot:0.20,saw_breaker:0.12}[sl.claim.kind]||0.2;
        for(const w of cands){
          if(w===t||!w.mind||bestKnownTarget(w))continue;
          const ev={kind:'heard_claim',claimKind:sl.claim.kind,x:0,y:0,
            room:sl.claim.room||null,conf:0.5,src:'speech',subj:t.i,
            by:(G.me?G.me.i:null)};
          evPush(w,ev);
          susAdd(w,t.i,weight,'heard_claim',ev);
        }
        const follower=cands.find(w=>w!==t&&!w.alien&&w.mind&&w.accuse==null&&
          w.mind.alert>=0.25);
        if(follower){
          follower.accuse=t.i;
          meetLater(m,900+Math.random()*400,()=>say(follower.name,
            pickLine(follower,'follow_accuse',0,{t:t.name,u:G.me.name,when:whenWord()})));
        }
        if(knownW){
          const k=knownW.accuseWhy, rm=evRoomName(k);
          const act=k.kind==='saw_pipe'?'钻管道':(k.kind==='saw_knife'?'出刀':
            (k.kind==='saw_red'?'身上带着红光':'破坏了设备'));
          meetLater(m,600+Math.random()*400,()=>say(knownW.name,
            pickLine(knownW,'known_endorse_player',0,{u:G.me.name,t:t.name,r:rm,k:act})));
        }
        meetLater(m,650+Math.random()*500,()=>say(t.name,pickLine(t,'player_claim_deny',0,
          {u:G.me.name,k:kindName,r:alibiOf(t).room,when:whenWord()})));
        return;
      }

      /* 3) 玩家公开为某人作证：被保的人回应，怀疑他的人追问证据（不加减嫌疑分） */
      if(sl.support!=null){
        const t=G.agents[sl.support];
        if(!t||!t.alive||t.downed)return;
        m.ctx.playerSupport=t.i;
        /* 读心清零（2026-11-05）：谁最可能追问，由**他自己**从可见线索估出来的分数决定，
           不再读他的私有 sus。 */
        const skeptic=cands.find(w=>w!==t&&!w.alien&&w.alive&&envEstimate(w,t.i).score>=0.3);
        if(skeptic){
          meetLater(m,600+Math.random()*400,()=>say(skeptic.name,
            pickLine(skeptic,'skeptic_ask',0,{u:G.me.name,t:t.name,
              r:alibiOf(skeptic).room,when:whenWord()})));
        }else{
          meetLater(m,600+Math.random()*400,()=>say(t.name,pickLine(t,
            'player_support_thanks',0,{u:G.me.name,r:alibiOf(t).room,when:whenWord()})));
        }
        return;
      }

      /* 4) 玩家点名指控：被点的人辩护；有同款确证的人直接站队 */
      if(sl.accuse!=null){
        const t=G.agents[sl.accuse];
        if(!t||!t.alive||t.downed)return;
        const solidSame=pubSolidAccusers(t.i);
        const sameKnown=cands.find(w=>w!==t&&!w.alien&&solidSame.indexOf(w.i)>=0);
        if(sameKnown){
          const k=sameKnown.accuseWhy;
          const rm=evRoomName(k);
          const act=k.kind==='saw_pipe'?'钻了管道':(k.kind==='saw_knife'?'出刀':
            (k.kind==='saw_red'?'身上带着刚出刀的红光':'破坏了设备'));
          meetLater(m,600+Math.random()*500,()=>say(sameKnown.name,
            '我同意'+G.me.name+'。'+t.name+'在'+rm+act+'，我亲眼看见的——他就是异形。'));
          return;
        }
        /* 辩护走语料池（2026-11-01）：按性格选 hot/cold，房间名由 alibiOf 注入 */
        meetLater(m,650+Math.random()*450,()=>say(t.name,
          flavor(t,'defend',{t:G.me.name,r:alibiOf(t).room,k:alibiOf(t).task||'任务'})));
        const bw=cands.find(w=>w!==t&&!w.alien&&w.alive&&envEstimate(w,t.i).score>=0.4);
        if(bw)meetLater(m,1500,()=>say(bw.name,flavor(bw,'call',{t:t.name})));
        return;
      }

      /* 3) 玩家自述位置（无冲突）：在场的人可以作证或反问 */
      if(sl.where){
        const there=cands.find(w=>!w.alien&&w.nRoom===sl.where&&
          !(w.mind&&w.mind.seenT&&w.mind.seenT[0]&&evNow()-w.mind.seenT[0]<8));
        if(there){
          const rn=roomNameById(sl.where);
          meetLater(m,600+Math.random()*500,()=>say(there.name,
            flavor(there,'ask',{t:G.me.name,r:rn})));
        }else{
          const rn=roomNameById(sl.where);
          const resp=pickResponder(m,cands);
          meetLater(m,600+Math.random()*500,()=>say(resp.name,
            flavor(resp,'identity',{r:alibiOf(resp).room,k:alibiOf(resp).task||'任务'})));
        }
        return;
      }

      /* 4) 玩家投票：有警觉的人可以跟票，零证据的人不跟（规则不允许无证据投票） */
      if(sl.vote!=null){
        const t=G.agents[sl.vote];
        if(!t||!t.alive||t.downed)return;
        const follower=cands.find(w=>w!==t&&!w.alien&&w.mind&&w.mind.alert>=0.25&&w.accuse==null);
        if(follower){
          follower.accuse=t.i;
          meetLater(m,600+Math.random()*500,()=>say(follower.name,
            '我跟'+G.me.name+'一票，'+t.name+'得给个说法。'));
        }else{
          const resp=pickResponder(m,cands);
          meetLater(m,600+Math.random()*500,()=>say(resp.name,
            G.me.name+'，你要投'+t.name+'？先说说你看到了什么，我不跟没证据的票。'));
        }
        return;
      }

      /* 5) 玩家否认：有人会接受，有人会追问 */
      if(sl.deny){
        const press=cands.find(w=>w.alien||(G.me&&envEstimate(w,G.me.i).score>=0.3));
        if(press){
          const where=vi?vi.room:'案发那会儿';
          meetLater(m,600+Math.random()*500,()=>say(press.name,pickLine(press,
            'press_deny',0,{r:where,when:whenWord()})));
        }else{
          const resp=pickResponder(m,cands);
          meetLater(m,600+Math.random()*500,()=>say(resp.name,
            pickLine(resp,'ack_short',0,{})));
        }
        return;
      }

      /* 6) 兜底：任务 / 进度 / 看见谁 */
      const a=pickResponder(m,cands);
      meetLater(m,600+Math.random()*600,()=>{
        const f=alibiOf(a);
        let line;
        if(/在哪|哪里|位置|哪边/.test(text)){
          line='我在'+f.room+(f.task?('，把'+f.task+'搞定了'):'')+'。'+
            (f.witnesses[0]?('路上碰到'+f.witnesses[0].name+'。'):'');
        }else if(/谁|怀疑|投|凶手/.test(text)){
          if(a.accuse!=null)line='我怀疑'+nameOf(a.accuse)+'。'+
            (a.suspect!=null?'我亲眼看见的。':'他的说法对不上。');
          else line='我还没定。'+(vi?('我更在意'+vi.name+'倒下的那会儿，谁在'+vi.room+'。'):'你先说说你看到了什么。');
        }else if(/任务|修|进度/.test(text)){
          line='我修了'+a.tIdx+'个，还剩'+Math.max(0,4-a.tIdx)+'个。'+
            (a.doing>0?'正在赶下一个。':'刚跑完一段路。');
        }else if(/看见|看到|发现/.test(text)){
          const seen=seenNames(a,{aliveOnly:true});
          line=seen.length?('我看见'+seen[0].name+'在'+f.room+'附近。'):'我这一路没碰上人。';
        }else{
          line='「'+String(text).slice(0,20)+'」我记下了。'+
            (vi?('现在最要紧的是'+vi.name+'那条线，谁最后见过他？'):'你继续说，我听着。');
        }
        say(a.name,line);
      });
    }
    /* 会议模板：生成一句一定会被 parseSpeech 识别的标准句 */
    /* 玩家点模板发出去的句式（2026-11-03 修文案 bug）：
       旧版每条都带一个多余空格、且"我在X"缺动词，读起来像没说完
       （调研报告 P2：`我今晚在 中央会议室`）。parseSpeech 靠关键词正则识别，
       不依赖空格，所以这里可以放心写成完整口语。 */
    function meetTemplateText(kind,t,roomId){
      const tag=t?tagName(t):'';
      const rn=roomId?roomNameById(roomId):'';
      if(kind==='where')return '我'+whenWord()+'在'+(rn||'走廊')+'干活，手都没停过';
      if(kind==='deny')return '不是我'+(rn?('，我'+whenWord()+'在'+rn+'，哪儿也没去'):'');
      if(!t)return '';
      if(kind==='accuse')return '我怀疑'+tag+'，先说给大伙听';
      if(kind==='vote')return '这票我投'+tag;
      if(kind==='support')return '我可以为'+tag+'作证，他干的是正经事';
      if(kind==='pipe'){
        const at=rn&&isPipeRoom(roomId)?('，就在'+rn):'';
        return '我亲眼看见'+tag+' 钻管道'+at;
      }
      const at=rn?('，就在'+rn):'';
      if(kind==='red')return '我亲眼看见'+tag+' 身上有红光'+at;
      if(kind==='knife')return '我亲眼看见'+tag+' 出刀'+at;
      return '';
    }
    function syncMeetTemplates(){
      if(SIM_RUN)return;
      const box=document.getElementById('m-tpl'); if(!box)return;
      const m=G.meet;
      const can=!!(m&&m.phase==='discuss'&&G.me.alive&&!G.me.downed&&!G.spectMode);
      box.classList.toggle('hide',!can);
      if(!can)return;
      const sel=document.getElementById('m-tpl-target');
      if(sel){
        /* 同一场会议内保留上次选择；换了一场会议必须回到占位，不能把上一场
           选中的对象带过来（否则"先选对象"永远不会触发，手快点错还会误指控）。 */
        const old=(sel.__meetSeq===m.seq)?sel.value:'';
        sel.__meetSeq=m.seq;
        sel.innerHTML='';
        /* T6（2026-11-05）：默认必须是"未选择"，不能默认选中第一个活人 ——
           手快点「怀疑」会凭空指控 02，且玩家往往没注意到选的是谁。 */
        const none=document.createElement('option');
        none.value='';none.textContent='— 选择对象 —';
        sel.appendChild(none);
        for(const a of G.agents){
          if(!a.alive||a===G.me)continue;
          const op=document.createElement('option');
          op.value=String(a.i);op.textContent=tagName(a);
          sel.appendChild(op);
        }
        if(old&&G.agents[+old]&&G.agents[+old].alive&&(+old)!==G.me.i)sel.value=old;
        else sel.value='';
      }
      const roomSel=document.getElementById('m-tpl-room');
      if(roomSel){
        if(!roomSel.options.length){
          const none=document.createElement('option');
          none.value='';none.textContent='不指定舱室';roomSel.appendChild(none);
          for(const r of M.rooms){
            const op=document.createElement('option');
            op.value=r.id;op.textContent=r.name;roomSel.appendChild(op);
          }
          const cor=document.createElement('option');
          cor.value='corridor';cor.textContent='走廊';roomSel.appendChild(cor);
        }
        const cur=G.me.nRoom||roomIdAt(G.me.x,G.me.y);
        if(cur&&Array.from(roomSel.options).some(o=>o.value===cur))roomSel.value=cur;
      }
    }
    function sendPlayerSpeech(text){
      const m=G.meet;
      if(!m||m.phase!=='discuss'||G.spectMode)return false;
      if(!G.me.alive||G.me.downed){toast('你现在不能发言');return false;}
      const raw=String(text||'').trim(); if(!raw)return false;
      const el=document.getElementById('m-text'); if(el)el.value='';
      say(G.me.name,raw,true); SND.vote(); playerTalk(raw);
      return true;
    }
    function openMeeting(kind,reporter,victim){
      if(G.over)return;
      /* 每夜会议上限（2026-11-02）：夜晚会议最多 MEET.perNight 场。
         白天/开局会议固定各 1 场，不受此限。 */
      const cap=SKSanity.MEET.perNight;
      if(kind==='night'&&(G.nightMeets||0)>=cap){
        if(G.simStats)G.simStats.nightMeetFull=(G.simStats.nightMeetFull||0)+1;
        if(reporter===G.me)toast('本夜会议已开满 '+cap+' 场，这次报告作废（报告额度不退）');
        return;
      }
      if(kind==='night')G.nightMeets=(G.nightMeets||0)+1;
      /* 会议**不打断任务流程**（2026-11-02）：清掉所有人的移动路径，但**保留 doing /
         _doing / _dur**。原因：tickDoing 的打断判据是「还在沿路径移动」，
         会后如果路径还在，玩家会被判成"移动打断了维修"，任务白做。 */
      for(const a of G.agents){
        a.path=null;a.moving=false;a._moveHit=false;
      }
      releaseAllDrags(true);
      closeBodyCard();
      closeCams(true);closePipePick(true);closeSabPick(true);
      closeWheel(true);
      const vp=victim?bodyPos(victim):null;
      const vx=vp?vp[0]:(victim?victim.x:0), vy=vp?vp[1]:(victim?victim.y:0);
      const r=victim?roomAt(vx,vy):null;
      const roomName=victim?(r?r.name:(inCorr(vx,vy)?'走廊':(vp||victim?'未知位置':'—'))):'—';
      /* 先按现场事实建上下文（尸体清场前算，保留死亡坐标），再清场 */
      const ctx=buildMeetCtx(kind,reporter,victim);
      logEvent('meeting',{kind:kind,reporter:reporter?reporter.i:null,
        victim:victim?victim.i:null,room:r?r.id:null,
        x:victim?+vx.toFixed(1):null,y:victim?+vy.toFixed(1):null});
      if(kind==='night'&&victim)
        logEvent('report',{actor:reporter?reporter.i:null,victim:victim.i,room:r?r.id:null,
          x:+vx.toFixed(1),y:+vy.toFixed(1)});
      // 尸体在会议开始时就清场（与经典规则一致）；濒死者还活着，继续躺着
      for(const a of G.agents) if(!a.alive&&!a.bodyGone) a.bodyGone=true;
      const discuss=kind==='day'?SKSanity.MEET.discussDay:
        kind==='pre'?SKSanity.MEET.discussPre:SKSanity.MEET.discussNight;
      const voteT=kind==='pre'?0:
        (kind==='day'?SKSanity.MEET.voteDay:SKSanity.MEET.voteNight);
      const remainMs=kind==='night'?(G.simMode?Math.max(0,G.simT||0)*1000:
        (G.phase?SKClock.remaining(G.phase,performance.now()):NIGHT*1000)):NIGHT*1000;
      if(G.simMode&&G.simStats)G.simStats.meetings++;
      G.meet={kind,reporter,victim,room:roomName,phase:'discuss',t:discuss,
              seq:(G.meetSeq=(G.meetSeq||0)+1),
              discuss,voteT,votes:{},tally:null,remainMs:remainMs,startAt:performance.now(),
              ctx,lines:[]};
      document.getElementById('meet').classList.remove('hide');
      /* DEV / 旁观横栏此刻可能刚显示：量一次高度，把会议卡整体让下去（T3） */
      if(!G.simMode)syncDevUi();
      document.getElementById('m-title').textContent=
        kind==='pre'?'第 1 天 · 开局公开讨论':(kind==='day'?('第 '+G.night+' 天 · 全员会议'):'紧急会议');
      document.getElementById('m-sub').textContent=
        kind==='pre'?('公开讨论 '+discuss+' 秒 · 本轮不投票 · 讨论完直接进入第 1 夜')
        :(kind==='day'&&G._overtime
          ?('讨论 '+discuss+' 秒 + 投票 '+voteT+' 秒 · 上一场会议拖到了天亮')
          :('讨论 '+discuss+' 秒 + 投票 '+voteT+' 秒'+
            (kind==='day'?'':' · 会议期间夜晚暂停 · 任务进度保留')));
      document.getElementById('m-rows').style.display=victim?'':'none';
      document.getElementById('m-room').textContent=roomName;
      document.getElementById('m-by').textContent=reporter?tagName(reporter):'—';
      document.getElementById('m-vic').textContent=victim?tagName(victim):'—';
      const vl=document.getElementById('m-vic-l');
      if(vl)vl.textContent=victim?(victim.alive?'濒死者':'死者'):'伤者';
      document.getElementById('m-ph').textContent='讨论';
      const canAct=G.me.alive&&!G.me.downed&&!G.spectMode;
      const canSkip=canAct||G.spectMode;   /* 旁观者可以快进讨论，但不能发言/投票 */
      const skipBtn=document.getElementById('m-skip');
      skipBtn.classList.toggle('hide',!canSkip);
      skipBtn.textContent=G.spectMode?'跳过讨论（旁观）':'跳过讨论';
      const inp=document.getElementById('m-text');
      inp.disabled=!canAct;
      inp.placeholder=canAct?'自由发言，回车发送':(G.spectMode?'旁观者只读':'幽灵只能旁观');
      /* 与输入框同源：不能发言时发送按钮也一并禁用（含投票期结束回到讨论的重置） */
      const sndBtn=document.getElementById('m-send');
      if(sndBtn)sndBtn.disabled=!canAct;
      document.getElementById('m-who').innerHTML='';
      document.getElementById('m-tally').innerHTML='';
      document.getElementById('m-skip-vote').classList.add('hide');
      document.getElementById('m-say').innerHTML='';
      syncMeetTemplates();
      if(!canAct) say(G.spectMode?'旁观者':G.me.name,G.spectMode?'（旁观）只读观战，不参与讨论与投票。':'（幽灵）我在看着。','sys');
      startChatter(G.meet);
      if(!G.simMode)meetingTimer();
    }
    function meetingTimer(){
      clearInterval(meetingTick);
      meetingTick=setInterval(()=>{
        const m=G.meet; if(!m){clearInterval(meetingTick);return;}
        m.t-=0.1;
        if(m.phase==='discuss'&&m.t<=0){ if(m.voteT>0) startVote(); else finishMeeting(); }
        else if(m.phase==='vote'&&m.t<=0) closeVote();
        else if(m.phase==='reveal'&&m.t<=0) finishMeeting();
        const ph=document.getElementById('m-ph');
        if(ph&&G.meet) ph.textContent=
          (m.phase==='discuss'?'讨论 ':m.phase==='vote'?'投票 ':'公布 ')+Math.max(0,m.t).toFixed(0)+'s';
      },100);
    }
    /* 场上「最多人指控 / 最大嫌疑」的目标（不含 a 自己）：投票里的从众锚点。
       情绪层用它实现「激进的人被带着走」，谨慎的人仍可弃权。 */
    function leadingAccused(self){
      const tally={};
      for(const w of G.agents){
        if(!w.alive||w===self)continue;
        for(const k of [w.accuse,w.suspect]){
          if(k==null||k===self.i)continue;
          const t=G.agents[k];
          if(!t||!t.alive)continue;
          tally[k]=(tally[k]||0)+1;
        }
      }
      let best=null,bn=0;
      for(const k in tally){if(tally[k]>bn){bn=tally[k];best=+k;}}
      return bn>=2?best:null;
    }
    function startVote(){
      const m=G.meet; m.phase='vote'; m.t=m.voteT;
      stopChatter();
      document.getElementById('m-skip').classList.add('hide');
      const tpl=document.getElementById('m-tpl'); if(tpl)tpl.classList.add('hide');
      /* T5（2026-11-05）：投票期发言通道已经关闭（sendPlayerSpeech 在 phase!=='discuss'
         时直接 return），但输入框仍能打字、发送按钮仍可点，玩家会以为发出去了。
         这里显式禁用并改占位，讨论期由 openMeeting 恢复。 */
      const vinp=document.getElementById('m-text'), vsb=document.getElementById('m-send');
      if(vinp){vinp.disabled=true;vinp.placeholder='投票中…';}
      if(vsb)vsb.disabled=true;
      const box=document.getElementById('m-who'); box.innerHTML='';
      if(!G.me.downed&&G.me.alive&&!G.spectMode){
        for(const a of G.agents){
          if(!a.alive||a===G.me)continue;
          const btn=document.createElement('button');
          btn.textContent=tagName(a);
          btn.onclick=()=>{ m.votes[G.me.i]=a.i;
            [...box.children].forEach(c=>c.style.borderColor='#313B4B');
            btn.style.borderColor='#F0C674'; };
          box.appendChild(btn);
        }
        const sk=document.createElement('button');
        sk.textContent='弃权';
        sk.onclick=()=>{ m.votes[G.me.i]=-1;
          [...box.children].forEach(c=>c.style.borderColor='#313B4B');
          sk.style.borderColor='#F0C674'; };
        box.appendChild(sk);
      }
      /* 投票等待 15 秒后，给玩家一个“跳过投票”出口：
         只结束剩余投票时间；已经投给谁就保留那一票，没投才记弃权。
         与“跳过讨论”同语义，不改变任何 AI 票。 */
      document.getElementById('m-skip-vote').classList.toggle('hide',
        !(G.me.alive&&!G.me.downed&&!G.spectMode));
      // AI 投票：先说出口的指控 → 证据链最高嫌疑 → 人类无证据弃权；异形随机独立投票
      for(const a of G.agents){
        if(!a.alive||(!G.spectMode&&a===G.me)||a.downed)continue;
        /* 确证优先：见过异形专属行为的人不需要再猜，直接投确证目标 */
        if(!a.alien){
          const kn=bestKnownTarget(a);
          if(kn){ m.votes[a.i]=kn.i; continue; }
        }
        /* 情绪先于从众（2026-10-31）：被某人当众咬狠了（grudge≥0.6），
           激进的人大概率把票砸回去；被某人当众保过（trust≥0.8）就不过他的票。 */
        let emo=null,es=0;
        for(const k in (a.mind&&a.mind.grudge)||{}){
          const g=a.mind.grudge[k];
          if(g<=es)continue;
          const t=G.agents[+k];
          if(!t||!t.alive||t===a||isMate(a,t.i))continue;
          es=g;emo=t;
        }
        if(emo&&es>=0.6&&Math.random()<SKTrait.C.voteGrudgePull(a)/10){
          m.votes[a.i]=emo.i;continue;
        }
        const patron=i=>isPatron(a,i);
        const acc=(a.accuse!=null&&G.agents[a.accuse]&&G.agents[a.accuse].alive&&a.accuse!==a.i&&
          !patron(a.accuse)&&(!a.alien||!isMate(a,a.accuse)))?a.accuse:null;
        if(acc!=null){ m.votes[a.i]=acc; continue; }
        /* ---- 准-确证升级为**票权**（2026-11-02）----
           手上有一条活着的 almost.foe 就优先投他，与「已经公开指控过」同级。
           上一版只乘 ×1.6 权重，实测 almost.foe 每局 1.6 次却只贡献 1.84 张票
           （全场 1.4%），等于台词装饰。仍然**不是锁死**：证据一淡就降级、被 alibi
           清掉就消失，而且恩人（trust≥0.8）与 almost.friend 对象不过票。 */
        if(!a.alien&&SKSanity.ALMOST.foeVoteTier){
          const af=bestAlmostTarget(a);
          if(af&&!patron(af.i)&&!almostFriendOf(a,af.i)){m.votes[a.i]=af.i;continue;}
        }
        if(a.suspect!=null&&G.agents[a.suspect]&&G.agents[a.suspect].alive&&
          G.agents[a.suspect]!==a&&!patron(a.suspect)&&(!a.alien||!isMate(a,a.suspect))){
          m.votes[a.i]=a.suspect; continue;
        }
        const bs=bestSusTarget(a,0.5);
        if(bs&&(!a.alien||!isMate(a,bs.i))&&!patron(bs.i)){m.votes[a.i]=bs.i;continue;}
        if(a.alien){
          /* 诬陷要"带节奏"：已经公开指控过谁，就把票投给他 ——
             说了却不投，等于自己打自己的脸（真人玩家一眼就能看出破绽）。
             没有指控目标才退回随机，避免异形的票成为唯一异类。 */
          if(a.accuse!=null&&G.agents[a.accuse]&&G.agents[a.accuse].alive&&
             !G.agents[a.accuse].downed&&!isMate(a,a.accuse)){
            m.votes[a.i]=a.accuse;continue;
          }
          const all=G.agents.filter(x=>x.alive&&x!==a&&!isMate(a,x.i));
          const clean=all.filter(x=>!x.detained);
          const pool=clean.length?clean:all;
          m.votes[a.i]=pool.length?pool[Math.floor(Math.random()*pool.length)].i:-1;
          continue;
        }
        /* 人类没有证据：弃权还是硬投，由性格决定（2026-10-31）。
           激进的人不肯空手弃权——跟着场上最多的指控投，或者投嫌疑最高的那个；
           谨慎的人几乎必弃权。 */
        if(Math.random()<SKTrait.C.voteAbstain(a)){
          m.votes[a.i]=-1;
          if(G.simMode&&G.simStats)G.simStats.abstains=(G.simStats.abstains||0)+1;
          continue;}
        /* 跟票必须**自己也有依据**（2026-10-31 修正）：
           上一版「有多数指控就跟」让激进 AI 变成从众处决机器——
           一人指控、三人跟票，异形被冤到 23.8% 胜率（exiles 4.28/局）。
           现在跟票需要自己对该目标 sus≥0.18 或有私仇；都没有就走嫌疑门槛
           （=开枪门槛，激进 0.36 敢投，谨慎 0.60），仍没有才弃权。 */
        const lead=leadingAccused(a);
        /* 2026-11-02「被带节奏」：已经有两三个人公开咬同一个人时，观望的人跟票门槛降低
           （0.18 → 0.10）。这是真人局最常见的一类误判 —— 不是证据变强了，是气势起来了。
           异形的伪证正是在这里兑现：它不需要说服所有人，只要凑够"第三个声音"。 */
        const pack=(lead==null)?0:G.agents.filter(x=>x.accuse===lead).length;
        const needSus=pack>=2?0.10:0.18;
        /* 跟票必须**自己手里有动静**（2026-11-02）：沉默线索（silent 0.112）与
           空口指控都不算"证据" —— 否则带节奏会把"一句话没说"的人也算成跟票者，
           变成凭空替人定罪。 */
        const leadWhy=(a.mind&&a.mind.why&&a.mind.why[lead])||[];
        /* 「手里有动静」的口径：必须是**自己看到的/搜到的**那类证据。
           沉默（silent）、空口指控（empty_accuse）、听别人说的（heard_accuse /
           heard_frame）、领袖点名、抢先报案 —— 这些都只是"听说"，不能当自己的依据。 */
        const WEAK_FOLLOW={silent:1,empty_accuse:1,heard_accuse:1,heard_frame:1,
          leader_order:1,quick_report:1};
        const hasReal=leadWhy.some(r=>!WEAK_FOLLOW[r.kind]);
        /* 带节奏降门槛（0.10）时额外要求"自己手里有真动静"（沉默/空口不算）；
           正常门槛 0.18 维持旧口径（跟票本来就可以只凭听来的动静）。 */
        const susOK=(((a.mind&&a.mind.sus[lead])||0)>=needSus)&&(needSus>=0.18||hasReal);
        if(lead!=null&&lead!==a.i&&
          (susOK||((a.mind&&a.mind.grudge[lead])||0)>=0.4)){
          m.votes[a.i]=lead;continue;
        }
        const bs2=bestSusTarget(a,SKTrait.C.shootSus(a)*0.9);
        m.votes[a.i]=(bs2&&bs2.i!==a.i)?bs2.i:-1;
      }
      /* ---- 正向信任兜底（2026-11-01）----
         投完统一拦一道，而不是改动上面 8 条投票分支：
         手里**没有确证**的人，如果被投的对象 cred 很高，这一票按概率弃掉。
         亲眼确证过的（mind.known）不受影响 —— 看见了就是看见了，信誉不能洗掉证据。 */
      for(const a of G.agents){
        if(!a.alive||a.downed||a.alien||(!G.spectMode&&a===G.me))continue;
        const v=m.votes[a.i];
        if(v==null||v<0)continue;
        if(a.mind&&a.mind.known&&a.mind.known[v])continue;
        const cr=credOf(a,v);
        if(cr>0&&Math.random()<SKSanity.credVoteShield(cr)){
          m.votes[a.i]=-1;
          /* 信任的外化之一（旧版唯一的外化就是"不投"）：现在要能被数出来 */
          if(G.simMode&&G.simStats){
            G.simStats.credShieldVotes=(G.simStats.credShieldVotes||0)+1;
            G.simStats.abstains=(G.simStats.abstains||0)+1;
          }
        }
      }
      /* ---- 准-确证的投票侧（2026-11-01）----
         双向但**都不是锁死**：
           almost.foe    → 这一票更难被洗白机制挡住（权重 ×1.6，这里体现为弃票概率归零）
           almost.friend → 在 cred 弃票之上再叠一道「舍不得投他」 */
      for(const a of G.agents){
        if(!a.alive||a.downed||a.alien||(!G.spectMode&&a===G.me))continue;
        const v=m.votes[a.i];
        if(v==null||v<0)continue;
        if(a.mind&&a.mind.known&&a.mind.known[v])continue;
        if(almostFoeOf(a,v)){
          if(G.simStats)G.simStats.almostVotes=(G.simStats.almostVotes||0)+1;
          continue;
        }
        /* 「基本是好人」→ 直接弃票（2026-11-02 从 friendShieldAdd 升为独立概率）。
           这条是异形伪装的兑现口：装够几天，票真的会被它挡下来。 */
        if(almostFriendOf(a,v)&&Math.random()<SKSanity.ALMOST.friendVoteShield){
          m.votes[a.i]=-1;
          if(G.simStats)G.simStats.friendShield=(G.simStats.friendShield||0)+1;
        }
      }
    }
    function closeVote(){
      const m=G.meet; m.phase='reveal'; m.t=SKSanity.MEET.reveal;
      document.getElementById('m-skip-vote').classList.add('hide');
      const tally={}; let abstain=0;
      for(const k in m.votes){const v=m.votes[k]; if(v<0){abstain++;continue;} tally[v]=(tally[v]||0)+1;}
      let max=0,top=-1,tie=false;
      for(const k in tally){const c=tally[k];
        if(c>max){max=c;top=+k;tie=false;} else if(c===max) tie=true;}
      const ok=(max>=3&&!tie);
      const cand=ok?G.agents[top]:null;
      for(const k in m.votes){
        const v=m.votes[k];
        logEvent('vote',{actor:+k,target:v,victim:v>=0?v:null,seq:(G.meet&&G.meet.seq)||0});
      }
      let devSaved=false;
      if(cand){
        if(!G.spectMode&&cand===G.me&&G.dev) devSaved=true;
        else{ die(cand,'vote',null); SND.expel(); }
      }
      m.tally={tally,abstain,max,ok,ex:devSaved?null:cand,devSaved,
        exName:cand?tagName(cand):null,exRole:cand?(cand.alien?'异形':'人类'):null};
      if(cand&&!devSaved){
        logEvent('eject',{victim:cand.i,votes:max,alien:!!cand.alien});
        /* 确证驱动的驱逐率（2026-11-01 补遥测）：这一轮有多少票是「我亲眼看见」
           投出来的，以及被驱逐的人是不是刚被保安拘留过 —— 用来验证拘留证据真的有用。 */
        if(G.simStats){
          let kv=0;
          for(const k in m.votes){
            if(m.votes[k]!==cand.i)continue;
            const v=G.agents[+k];
            if(v&&v.mind&&v.mind.known&&v.mind.known[cand.i])kv++;
          }
          G.simStats.knownVotes=(G.simStats.knownVotes||0)+kv;
          if(kv>0)G.simStats.ejectByKnown=(G.simStats.ejectByKnown||0)+1;
          if(G.detainLog&&G.detainLog[cand.i]!=null)
            G.simStats.detainEvictions=(G.simStats.detainEvictions||0)+1;
          /* 准-确证驱动的驱逐：至少一票来自 almost.foe（验改动 B 真的有用） */
          let av=0;
          for(const k in m.votes){
            if(m.votes[k]!==cand.i)continue;
            if(almostFoeOf(G.agents[+k],cand.i))av++;
          }
          if(av>0)G.simStats.almostEject=(G.simStats.almostEject||0)+1;
        }
        /* 追责：结果公布后清算带节奏的人（必须在 die 之后、身份已定） */
        settleAccountability(cand);
      }
      renderTally();
      if(cand)sysSay('驱逐 '+tagName(cand)+' · 身份公布：'+(cand.alien?'异形':'人类'));
      runInvariants('vote');
    }
    function renderTally(){
      if(SIM_RUN)return;
      const m=G.meet, box=document.getElementById('m-tally');
      const {tally,abstain,max,ex,devSaved,exName,exRole}=m.tally;
      const rows=Object.keys(tally).map(k=>({n:tagName(G.agents[k]),c:tally[k]})).sort((a,b)=>b.c-a.c);
      let h='<div class="tl-h">投票结果（过程不可见）</div>';
      for(const r of rows) h+='<div class="tl"><span>'+r.n+'</span><b>'+r.c+' 票</b></div>';
      h+='<div class="tl"><span>弃权</span><b>'+abstain+' 票</b></div>';
      h+='<div class="tl-note">'+(devSaved
          ?('票数指向你 —— DEV 无敌：驱逐无效（'+max+' 票）')
          :(ex
            ?('驱逐 '+(exName||ex.name)+' —— '+max+' 票，唯一最高票且达到 3 票门槛'
              +'<br><span class="ex-role '+(ex.alien?'ali':'hum')+'">身份：'+(exRole||(ex.alien?'异形':'人类'))+'</span>')
            :(max<3?('最高票 '+max+' 票，未达 3 票门槛 ⇒ 无人出局')
                    :('最高票 '+max+' 票但有平票 ⇒ 无人出局'))))+'</div>';
      box.innerHTML=h;
      document.getElementById('m-who').innerHTML='';
    }
    function finishMeeting(){
      const m=G.meet; clearInterval(meetingTick);
      stopChatter();
      const kind=m&&m.kind;
      let nightLeft=null;
      if(m&&kind==='night'&&m.remainMs!=null){
        /* 会议**不再吃夜晚时间**（2026-11-02 用户裁定"会议不打断任务流程"）。
           会议期间夜晚时钟暂停：`remainMs` 是开会那一刻的剩余时间，直接原样还回去。
           这样 100 秒的夜里有 100 秒可以真的干活，会议只消耗现实时间。
           （旧实现会扣掉讨论+投票的时长；在 100 秒夜里 2 场会就会吃掉 60 秒，
           等于把节奏改得更碎，与新方向相反。） */
        nightLeft=SKSanity.MEET.pauseClock?m.remainMs:
          (m.remainMs-(G.simMode?(m.discuss+m.voteT)*1000:
            (performance.now()-(m.startAt||performance.now()))));
      }
      G.meet=null;
      document.getElementById('meet').classList.add('hide');
      checkWin(); if(G.over)return;
      if(kind==='day') startNight(true);
      else if(kind==='pre') startNight(false);
      else if(nightLeft!=null){
        if(nightLeft<=0){
          /* 会议把这一夜耗光了 → 直接天亮。
             dawn() 会 G.t=0、清故障、checkWin()，然后开"第二天"的全员会议；
             _overtime 只是给那场会议加一句说明，不影响判定。 */
          logEvent('meeting_overtime',{night:G.night,over:Math.round(-nightLeft)});
          G._overtime=true;
          dawn();
          G._overtime=false;
        }else if(G.simMode){G.simT=nightLeft/1000;G.t=G.simT;G.phase=null;}
        else G.phase=SKClock.newPhase('night',performance.now(),nightLeft);
      }
      runInvariants('meetingEnd');
    }
    /* ---------------- 终结者时刻（2026-11-03 用户裁定）----------------
       第 `SKSanity.TERMINATOR.night` 夜起：**全场身份公开 + 每人补一发子弹**。
       目的：给长局一个**必然的收束点** —— 残局（1 异形 vs 2 人类）会一路拖到第 8~10 夜
       甚至更久（实测旁观局 16.7 分钟没打完），双方都缺"最后一击"。
       三条口径：
         · 子弹只**补到** `bullets`，不叠加（开局攒了子弹的人不会变成军火库）；
         · 身份只公开"异形 / 人类"这一层，**尸体的凶手归属仍然只在 DEV / 旁观**；
         · 只补给活着的席位（含濒死者，被救起来就能用），幽灵不补枪。
       注意这条**覆盖**了"正常对局外观一致"那条老红线 —— 第 N 夜之后亮身份是设计本身，
       不是调试泄漏；改这条要同批改 AGENTS 与门禁的双向断言（未到夜不亮 / 到了夜必亮）。 */
    function checkTerminator(){
      if(G.terminator)return false;
      const TC=SKSanity.TERMINATOR;
      if(G.night<TC.night)return false;
      G.terminator=true;G.revealAll=!!TC.reveal;
      let armed=0;
      for(const a of G.agents){
        if(!a.alive)continue;
        if((a.bullet|0)<TC.bullets){a.bullet=TC.bullets;armed++;}
      }
      logEvent('terminator',{night:G.night,armed:armed,reveal:!!G.revealAll});
      if(G.simMode&&G.simStats){
        G.simStats.terminatorGames=(G.simStats.terminatorGames||0)+1;
        G.simStats.terminatorArms=(G.simStats.terminatorArms||0)+armed;
      }
      if(!G.simMode)toast('第 '+G.night+' 夜 · 终结者时刻：全场身份公开，每人补发 '+TC.bullets+' 发子弹');
      return true;
    }
    function startNight(inc){
      G._overtime=false;
      if(inc!==false) G.night++;
      logEvent('night_start',{night:G.night});
      checkTerminator();
      if(G)releaseAllDrags(true);
      G.t=NIGHT;
      if(G.simMode){G.simT=NIGHT;G.phase=null;}
      else G.phase=SKClock.newPhase('night',performance.now(),NIGHT*1000);
      for(const a of G.agents){
        a.knife=1;a.path=null;a.doing=0;a.target=null;if(a.alive)a.reported=false;
        a._doing=null;a.sabUsed=false;a.detained=false;a.detainedT=0;
        a._pipeCD=0;a._rv=null;a.sabRoom=null;a._fix=null;a._fixGo=null;a._taskPt=null;a._look=null;
      a._plan=null;a._planCD=0;   /* 行为效用表缓存一并重算 */
        /* 每夜重置认知：没有跨夜记忆，也不让上一夜的 suspect 自动带进新夜 */
        mindReset(a);a.suspect=null;a.accuseWhy=null;a._abstain=false;
        a._reportT=0;a._reportBody=null;a._sawBody=null;a._scanT=0;a._reportMemo={};
        /* 拖拽 / 红身 / 藏尸 / 断电响应 / 管道规划：全部按夜清空 */
        a.drag=null;a.draggedBy=null;a.redT=0;a.rushT=0;a._dragSnd=0;a._dragAiT=0;
        a._dragAway=false;a._dragMedD0=0;a._dragAwaySeen={};
        a._hideSpot=null;a._hideRoom=null;a._hideCD=0;a._hides=0;
        a._lightGo=false;a._pipePlan=null;a._pipeSeeks=0;a._secAvoidT=0;a._botCD=0;
        /* 破坏落点缓存 / 伪装冷却（隔天重新开演，符合"每夜各演一次"的直觉） */
        a._sabSpot=null;a._sabRoom=null;a._credMed=false;
        a._fakeCD=0;a._sabSkipRoom=null;a._sabSkipUntil=0;
        a._killBody=null;a._killAt=0;a._killDecided=true;a._reportPlan=null;
        a._avoid={};a._fleeT=0;a._fleeFrom=null;a._pathCD=0;a._alienTaskN=0;a._stallBias=0.8+Math.random()*0.4;
        a._fakeKind=null;a._supportGoal=null;a._lootMem={};
        /* 贵信号每夜一次的名额，天亮重新开放（假动作不吃这个名额） */
        a._realFixN=0;a._realReviveN=0;
        /* 节奏控制：错峰开工 + 修完歇一会儿；异形更早开始活动，但不会开局贴脸 */
        /* 开局错峰：激进的人一进夜就冲（缩放 0.55~1.3），谨慎的人磨蹭 */
      a.act=null;a._rest=0;a._delay=(2+Math.random()*6)*SKTrait.C.delayScale(a);a._fxT=0;
        a.nRoom=roomIdAt(a.x,a.y);a.nSeen={};a.nTask=null;a.nTaskRoom=null;
        a.accuse=null;a._lie=null;
      }
      G.drag=null;
      G.aiReportUsed=false;G.evSeq=0;G.nightMeets=0;
      G.trackT=0;G.medbotUsed=false;G.medbotT=0;G.medbotTarget=null;G.medbotLeft=MEDBOT_CHARGES;G.botHp={secbot:2,medbot:1};G.secbotUsed=false;G.secbotUses=0;G.secbotT=0;G.pendingCrime=null;
      G.medbotDead=false;G.secbotDead=false;G.powerFixed=false;G.secCatch=null;
      for(const d of (G.doors||[])){d.open=0;d.target=0;d.scanT=0;}
      /* 新的一夜：故障与破坏目标全部清空（上夜没修完的故障不跨夜追罚） */
      G.dmg=[];G.sabTarget=null;
      /* 破坏落点每夜重抽：同一台设备不能连续几夜都坏在同一个位置 */
      for(const k in SAB_SPOT_CACHE)delete SAB_SPOT_CACHE[k];
      resetBots();
      /* 拉闸手已取消（2026-11-01）：每夜重新由效用表决定谁去拉闸 */
      G.breakerPulls=0;   /* 拉闸延迟每夜重新从 3 秒起算 */
      G.lightState=0;G.waves=[];G.fx=[];
      closeCams(true);closePipePick(true);closeSabPick(true);
      refreshLight();
      toast('第 '+G.night+' 夜开始');
      runInvariants('night');
    }
    
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
      VIEW={s:s,ox:0,oy:0};
      PAT={};
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
    addEventListener('resize',()=>{if(DEAD||!G)return;resize();PAT={};});
    const SX=x=>x*VIEW.s+VIEW.ox, SY=y=>y*VIEW.s+VIEW.oy;
    const WX=x=>(x-VIEW.ox)/VIEW.s, WY=y=>(y-VIEW.oy)/VIEW.s;
    
    /* 点地面移动（2026-11-02 抽出成函数，供 DOM 事件与门禁钩子共用）：
       走不通时给出**禁止符号 + 文字提示** —— 以前是"点了完全没反应"，新手会以为卡了。 */
    function clickAt(tx,ty){
      const me=G.me;
      if(G.spectMode&&G.spect){        // 旁观者：直线穿墙飞过去
        G.spect.path=[[tx,ty]];
      }else if(!me.alive){ // 幽灵：直线穿墙
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
      if(k==='f2'){e.preventDefault();toggleDev();return;}
      if(k==='escape'){
        if(G.wheel){closeWheel();return;}
        if(G.inspect){closeBodyCard();return;}
        if(G.sabPick){closeSabPick();return;}
        if(G.pipePick){closePipePick();return;}
        if(G.camView){closeCams();return;}
        if(G.meet||G.over)return;
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
      /* 监控台：只允许 E / V / ESC / 静音，其它输入全部吞掉 */
      if(G.camView){
        if(k==='m'){SND.setOn(!SND.isOn());toast(SND.isOn()?'音效：开':'音效：关');return;}
        if(k==='e'||k==='v'){closeCams();return;}
        return;
      }
      if(G.meet||G.over)return;
      if(G.spectMode){
        /* 旁观者不参与对局：只允许暂停、视野、相机、静音 */
        if(k==='p'||k==='escape'){togglePause();return;}
        if(k==='t'){G.fogOn=!G.fogOn;toast(G.fogOn?'视野：手电筒':'视野：全亮');return;}
        if(k==='c'){G.camMode=(G.camMode==='map'?'follow':'map');resize();
          toast(G.camMode==='map'?'相机：全图':'相机：跟随（近景）');return;}
        if(k==='m'){SND.setOn(!SND.isOn());toast(SND.isOn()?'音效：开':'音效：关');return;}
        return;
      }
      if(k==='p'){if(!G.meet&&!G.over&&!G.inspect)togglePause();return;}
      if(G.paused)return;
      if(k==='r'){tryReport();return;}
      if(k==='m'){SND.setOn(!SND.isOn());toast(SND.isOn()?'音效：开':'音效：关');return;}
      /* WASD 是主操作键（移动仍然是点击地面）：W 交互 / A 出刀 / S 搜尸 / D 收尸 */
      if(k==='w'){if(G.inspect)closeBodyCard();else interact();return;}
      if(k==='a'){attack();return;}
      if(k==='s'){e.preventDefault();if(G.inspect)closeBodyCard();else searchBody();return;}
      if(k==='d'){e.preventDefault();toggleDrag();return;}
      if(k==='e'){if(G.inspect)closeBodyCard();else interact();return;}
      if(k==='f'){rescue();return;}
      if(k==='h'){sabotage();return;}
      if(k==='v'){(G.camView?closeCams():openCams());return;}
      if(k==='q'){attack();return;}
      if(k==='b'){shoot();return;}
      if(k==='x'){e.preventDefault();if(G.inspect)closeBodyCard();else searchBody();return;}
      if(k==='g'){e.preventDefault();toggleDrag();return;}
      if(k==='t'){G.fogOn=!G.fogOn;toast(G.fogOn?'视野：手电筒':'视野：全亮（审计用）');return;}
      if(k==='c'){G.camMode=(G.camMode==='map'?'follow':'map');resize();
        toast(G.camMode==='map'?'相机：全图':'相机：跟随（近景）');return;}
    });
    
    /* ---------------- 交互轮盘 ----------------
       E 收集附近所有可交互项：只有 1 项直接执行，多项打开轮盘，避免按键语义重叠。 */
    function startClaim(me){
      me.path=null;me.moving=false;
      me.doing=SKSanity.STAND.qual;me._dur=SKSanity.STAND.qual;me._doing='qual';
      SND.interact();toast('领取物资申请单 3s · 移动会打断');
    }
    function startSupply(me,sp){
      if(!sp)return false;
      if(me.qual<=0){toast('需要物资申请单：先回中央会议室圆桌领取');return false;}
      if(sp.item==='ammo'&&me.bullet>=1){toast('子弹已满');return false;}
      if(sp.item==='med'&&me.medkit>=1){toast('医疗包已满');return false;}
      me.path=null;me.moving=false;
      const dur=sp.item==='ammo'?SUPPLY_AMMO_TIME:SUPPLY_MED_TIME;
      me.doing=dur;me._dur=dur;me._doing=sp.item==='ammo'?'ammo':'med';
      toast('消耗 1 张物资申请单领取'+(sp.item==='ammo'?'子弹 '+dur+'s':'医疗包 '+dur+'s')+' · 站桩，移动会打断');
      SND.interact();
      return true;
    }
    function startTask(me,p,ghost){
      me.path=null;me.moving=false;
      if(me.ghost&&me.alien){if(me===G.me&&!G.spectMode)toast('异形幽灵不能执行维修');return false;}
      if(me.ghost&&!ghostTaskAllowed(me,p)){
        if(me===G.me&&!G.spectMode)toast('幽灵最多维修 2 分的剩余任务');return false;
      }
      /* 记住实际修的任务点：玩家可以乱序修自己的任意剩余任务，
         结算时不能按 tasks[tIdx] 记账（否则会出现“修 C 记 A 完成”） */
      me._taskPt=M.points.indexOf(p);
      me.doing=ghost?p.dur*1.6:p.dur; me._dur=me.doing; me._doing='task';
      if(ghost){if(me===G.me&&!G.spectMode)toast('幽灵维修「'+p.label+'」 '+me.doing.toFixed(1)+'s');}
      else toast('开始维修「'+p.label+'」 '+me.doing+'s · 站桩，移动会打断');
    }
    function collectInteractions(me){
      const out=[],ghost=!me.alive,ml=me.tasks.slice(me.tIdx);
      const fd=nearDmg(me);
      if(fd&&(!ghost||!me.alien))out.push({id:'fix',x:fd.x,y:fd.y,short:'维修故障',
        pill:'[E] 维修故障 '+fd.label+' 10s · 剩余 '+Math.max(0,Math.ceil(fd.left))+'s',
        accent:'rgba(255,107,97,.8)',fg:'#FFB3AC',run:()=>startFix(me,fd)});
      if(!ghost){
        const pipe=nearPipe(me);
        if(pipe&&me.alien)out.push({id:'pipe',x:pipe.x,y:pipe.y,short:'钻管道',
          pill:'[E] 地道 · 选择出口',accent:'rgba(168,150,255,.75)',fg:'#D6CCFF',
          run:()=>openPipePick(pipe)});
        if(nearRoundTable(me)&&me.qualPending>0){
          const q=roundTableClaimSpot();
          out.push({id:'req',x:q.x,y:q.y,short:'领物资申请单',
            pill:'[E] 领取物资申请单 · 待领 '+me.qualPending,
            accent:'rgba(240,198,116,.8)',fg:'#FFE8B0',run:()=>startClaim(me)});
        }
        const sp=nearSupply(me);
        if(sp)out.push({id:'supply-'+sp.item,x:sp.x,y:sp.y,
          short:sp.item==='ammo'?'领子弹':'领医疗包',
          pill:'[E] '+sp.label+(me.qual>0?' · 消耗 1 张申请单':' · 需要物资申请单'),
          accent:sp.item==='ammo'?'rgba(224,169,75,.8)':'rgba(63,191,140,.75)',
          fg:sp.item==='ammo'?'#FFE0A3':'#B9F5DA',run:()=>startSupply(me,sp)});
        const br=M.facility.find(f=>f.kind==='breaker'&&Math.hypot(f.x-me.x,f.y-me.y)<BREAKER_USE_R);
        if(br){
          const bd=breakerPullTime();
          out.push({id:'breaker',x:br.x,y:br.y,
            short:G.lightState===2?'合闸':'拉闸',
            pill:'[E] '+(G.lightState===2?'合闸':'拉闸')+' '+bd+'s · '+(G.lightState===2?'当前断电':'当前照明'),
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
          const canLoot=!nb.alive&&bodyHasLoot(nb);
          if(!nb.alive&&(!nb.searched||canLoot))out.push({id:'search',x:bp[0],y:bp[1],
            short:'搜尸（取物资）',pill:'[S] 搜尸 · 取走子弹/医疗包/申请单',
            accent:'rgba(127,211,240,.8)',fg:'#BFE9F7',run:()=>searchBody()});
          if(nb.alive&&!nb.searched)out.push({id:'search',x:bp[0],y:bp[1],
            short:'查看伤情',pill:'[S] 检查伤情 · 取得伤口与时间线',
            accent:'rgba(127,211,240,.8)',fg:'#BFE9F7',run:()=>searchBody()});
          if(nb.searched)out.push({id:'inspect',x:bp[0],y:bp[1],short:'查看记录',
            pill:'[X] 查看'+(nb.alive?'伤情':'尸检')+'记录',
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
      if(mine&&(!ghost||ghostTaskAllowed(me,p)))out.push({id:'task',x:p.x,y:p.y,short:p.label,
        pill:'[E] 维修 '+p.label+'  '+p.dur+'s',
        accent:'rgba(255,205,60,.7)',fg:'#F0C674',run:()=>startTask(me,p,ghost)});
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
          else toast(G.medbotDead?'医疗无人机：今晚已停摆':(G.medbotLeft<=0?'医疗无人机：电量耗尽':(G.medbotUsed?'医疗无人机：电量 '+G.medbotLeft+'/'+MEDBOT_CHARGES:'医疗无人机：待命 · 电量 '+MEDBOT_CHARGES+'/'+MEDBOT_CHARGES+' · 悬停在医疗间正中央，有人濒死会飞过去近身治疗 '+MEDBOT_HEAL_TIME+' 秒')));
          return;
        }
        toast(!me.alive?
          (me.tIdx<me.tasks.length&&!ghostTaskAllowed(me,M.points[me.tasks[me.tIdx]])?
            '幽灵维修额度已用尽（每只幽灵最多 2 分）':'幽灵只能维修任务点或故障'):
          '这里没有你能做的事');
        return;
      }
      if(items.length===1){items[0].run();return;}
      openWheel(items);
    }
    function sabotageBot(target,tp){
      const me=G.me;
      me.sabUsed=true;G.sabTarget=null;
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
      runInvariants('sabotageBot');
    }
    function sabotage(){
      const me=G.me;
      /* 幽灵不能施展破坏 —— 异形死后仍能维修，但破坏技只属于活着的异形 */
      if(!me.alive){ toast('幽灵无法破坏'); return; }
      if(me.downed||me.detained){ toast('当前状态无法破坏'); return; }
      if(!me.alien){ toast('你做不到'); return; }
      if(me.sabUsed){ toast('今晚已经破坏过了'); return; }
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
      const me=G.me; if(!me.alive||me.downed)return;
      if(me.medkit<1){toast('没有医疗包');return;}
      let best=null,bd=1.8;
      for(const a of G.agents) if(a.downed&&a.alive){
        const d=Math.hypot(a.x-me.x,a.y-me.y); if(d<bd){bd=d;best=a;}}
      if(!best){toast('附近没有濒死者');return;}
      const dg=draggerOf(best);
      if(dg)releaseDragBy(dg,true);
      best.draggedBy=null;
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
      /* 开夜封锁（2026-11-02 用户裁定）：夜晚开始 5 秒内不许出刀，
         避免"一进夜就少一个人"的突然感。判定见 SKSanity.KNIFE.lockAtStart。
         锁在**输入层**（玩家按键 / AI 决策），不在结算层 —— 这样门禁与调试钩子
         仍能直接驱动一次出刀，而真实对局里没人能在前 5 秒动刀。 */
      const lockLeft=knifeLockLeft();
      if(lockLeft>0){toast('开局封锁：还要 '+lockLeft.toFixed(1)+' 秒才能出刀');return;}
      stab();
    }
    function stab(){
      const me=G.me;
      if(me.knife<1){toast('今晚的刀已经用掉了');return;}
      let best=null,bd=SKSanity.REACH.knife,botKind=null;
      for(const a of G.agents){
        if(a===me||!a.alive||a.downed)continue;
        const d=Math.hypot(a.x-me.x,a.y-me.y);
        if(d<bd&&losNow(me.x,me.y,a.x,a.y)){bd=d;best=a;botKind=null;}
      }
      for(const kind of ['secbot','medbot']){
        if(botDead(kind))continue;
        const p=botPos(kind); if(!p)continue;
        const d=Math.hypot(p.x-me.x,p.y-me.y);
        if(d<bd&&losNow(me.x,me.y,p.x,p.y)){bd=d;best=null;botKind=kind;}
      }
      if(!best&&!botKind){toast('近身没有目标（'+SKSanity.REACH.knife+' 格内、无遮挡）');return;}
      if(botKind){
        if(!knifeBot(me,botKind)){toast('这一刀没有砍到机器人');return;}
        toast('出刀：'+(botKind==='secbot'?'保安机器人':'医疗无人机')+'装甲受击 · 刀数 -1');
        return;
      }
      knife(me,best);
      toast('出刀：'+best.name+' 濒死');
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
      setAct(target,'hurt',0.55,{ang});
      G.fx.push({type:'tracer',x1:shooter.x,y1:shooter.y,x2:target.x,y2:target.y,t:0.45,dur:0.45,ang});
      G.fx.push({type:'muzzle',x:shooter.x+Math.cos(ang)*0.55,y:shooter.y+Math.sin(ang)*0.55,t:0.2,dur:0.2,ang});
      G.fx.push({type:'impact',x:target.x,y:target.y,t:0.55,dur:0.55});
      G.fx.push({type:'blood',x:target.x,y:target.y,t:0.9,dur:0.9,ang});
      SND.shot(SND.volAt(shooter.x,shooter.y,0.95));
      SND.flesh(SND.volAt(target.x,target.y,0.5));
      hear(shooter.x,shooter.y,'shot',1.15);
      target.downed=true; target.downAt=G.t; target.path=null; target.doing=0;
      target.downSeq=(target.downSeq||0)+1;   /* 同上：每次倒下都是新一次"发现" */
      target._doing=null; target._sv=null;
      target.downX=target.x; target.downY=target.y; target.killedBy=shooter.i;
      /* 开枪把人放倒同样给异形加速（与出刀同一个授予入口、同一条 alienOnly 规则） */
      killRushStart(shooter);
      target.woundCause='shot'; target.downRoom=roomIdAt(target.x,target.y);
      target.searched=false;
      logEvent('shoot',{actor:shooter.i,victim:target.i,room:target.downRoom,
        x:+target.x.toFixed(1),y:+target.y.toFixed(1)});
      noticeAction(shooter,shooter.x,shooter.y,7,'shot',target);
      aiHear('shot',shooter.x,shooter.y,20,{actor:shooter,victim:target});
      screamFor(target);
      if(!G.spectMode&&target===G.me){closeSabPick(true);G.sabTarget=null;toast('你被击中，濒死');}
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
        attacker.redT=3.0;
        setAct(attacker,'stab',0.5,{ang,lunge:0.55});
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
      runInvariants('botDamage');
      return true;
    }
    function fireShotBot(shooter,kind){
      if(!shooter||shooter.bullet<1||botDead(kind))return false;
      const p=botPos(kind); if(!p)return false;
      if(Math.hypot(p.x-shooter.x,p.y-shooter.y)>=9)return false;
      if(!losNow(shooter.x,shooter.y,p.x,p.y))return false;
      if(shooter===G.me&&!visibleAt(p.x,p.y))return false;
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
        /* 射程=视野：暗处看不见的人不能隔空打中（visibleAt 已含手电锥/亮房/遮挡） */
        if(d<9&&losNow(me.x,me.y,a.x,a.y)&&visibleAt(a.x,a.y)&&d<bd){bd=d;best=a;botKind=null;}
      }
      /* 机器人也是实体目标：鼠标靠近机器人时才把枪口切过去，避免误伤巡逻单位 */
      for(const kind of ['secbot','medbot']){
        if(botDead(kind))continue;
        const p=botPos(kind); if(!p)continue;
        const d=Math.hypot(p.x-me.x,p.y-me.y);
        const aimD=Math.hypot((G.aimX||me.x)-p.x,(G.aimY||me.y)-p.y);
        if(d<9&&aimD<1.2&&losNow(me.x,me.y,p.x,p.y)&&visibleAt(p.x,p.y)){
          bd=d;best=null;botKind=kind;
        }
      }
      if(!best&&!botKind){toast('视野内没有目标');return;}
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
      if(!b.searched||(b.alive?false:bodyHasLoot(b))){
        me.path=null;me.moving=false;
        me.doing=SKSanity.STAND.search; me._dur=SKSanity.STAND.search; me._doing='search'; me._sv=b.i;
        SND.search();
        toast(b.alive?'检查伤情中…':'搜尸中… 会把身上的物资一起取走');
        return;
      }
      toast('已经检查过，身上也没有可带走的物资');
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
        row('检查',b.searched?'已检查 · 伤口与拖拽痕迹完整':'未检查 · 按 X 搜查可获取细节',!b.searched);
        row('凶手',G.dev&&b.killedBy!=null?G.agents[b.killedBy].name:'无法判断');
      }else{
        row('状态','已死亡');
        row('死因',bodyWound(b));
        row('死亡地点',roomNameById(b.deathRoom));
        row('死亡时间','第 '+G.night+' 夜 · 倒计时约 '+Math.max(0,Math.round(b.deathAt||0))+'s');
        row('尸体',b.bodyMoved?'被移动过 · 现场被布置':'未被移动',b.bodyMoved);
        row('检查',b.searched?'已检查 · 伤口与拖拽痕迹完整':'未检查 · 按 S 搜尸可取证并取物资',!b.searched);
        row('凶手',G.dev&&b.killedBy!=null?G.agents[b.killedBy].name:'无法判断');
      }
      const it=bodyItemsText(b);
      row('携带物资',it||'无');
      document.getElementById('b-rows').innerHTML=h;
      document.getElementById('body').classList.remove('hide');
      runInvariants('inspect');
    }
    function closeBodyCard(){
      const el=document.getElementById('body');
      if(el)el.classList.add('hide');
      if(!G)return;
      /* T1（2026-11-05）：卡片冻结了多少墙钟，就把夜晚相位往后推多少，
         否则读卡片的时间会被夜钟白吃掉。与 togglePause 的补偿口径一致：
         只平移 phase，不新造计时器。 */
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
        toast('拖拽 '+b.name+' · 移动变慢，再按 G 放下');
        runInvariants('drag');
      }
    }
    
    function toast(s){ G.msg=s; G.msgT=2.6; }
    function pulseHud(id){
      const el=document.getElementById(id);
      if(!el)return;
      el.classList.remove('pop');
      void el.offsetWidth;
      el.classList.add('pop');
      setTimeout(()=>el.classList.remove('pop'),800);
    }
    
    /* ---------------- 音效（CC0 采样优先，WebAudio 合成兜底） ---------------- */
    const SND=(function(){
      let ac=null, on=true, master=1;
      /* file:// 下不能 fetch 音频，用 <audio> 元素池播放；每种音效 2~3 条并发。 */
      const FILE={
        knife:['audio/sfx-knife-01.ogg','audio/sfx-knife-02.ogg'],
        gun:['audio/sfx-gun.ogg'],
        step:['audio/sfx-step-01.ogg','audio/sfx-step-02.ogg'],
        scream:['audio/sfx-scream-01.ogg','audio/sfx-scream-02.ogg'],
        metal:['audio/sfx-metal.ogg'],
        door:['audio/sfx-door.ogg'],
        ui:['audio/sfx-ui.ogg'],
        work:['audio/sfx-work.ogg'],
        flesh:['audio/sfx-flesh.ogg'],
        win:['audio/sfx-win.ogg'],
        lose:['audio/sfx-lose.ogg'],
        report:['audio/sfx-notify.ogg']
      };
      const POOL={}; let rr=0;
      /* ---- 声音距离量化（2026-11-01）----
         只设两个端点：d=0 → 最高音，d ≥ range → 保底音，中间**线性**。
         旧写法各处各算（1-d/16 / 1-d/12 / 1-d/6 / 1-d/18），同一个"16 格外的尖叫"
         和"16 格外的枪声"衰减曲线完全不同，远处还会直接归零 —— 听不出方位。
         现在统一走 volAt：远处留一层底音（听得到方位、听不清细节），近处有上限（不炸耳）。 */
      const DIST={range:18,min:0.14,max:1.0};
      function volAt(x,y,scale){
        const me=(typeof G!=='undefined'&&G)?G.me:null;
        const s=(scale==null?1:scale);
        if(!me)return DIST.min*s;
        const d=Math.hypot(x-me.x,y-me.y);
        const t=Math.max(0,Math.min(1,d/DIST.range));
        const v=DIST.max+(DIST.min-DIST.max)*t;
        return Math.max(DIST.min,Math.min(DIST.max,v))*s;
      }
      /* ---- 音色档：区分度靠**频段与音高**，不靠音量 ----
         max  = 单条采样音量上限（防刺耳；同一声源不再靠"调大"来抢注意力）
         rate = 播放速率区间（越低越闷）。金属/电/人声/脚步各占一段，
                这样即使同时响，也能分出"这是刀 / 这是门 / 这是脚步"。 */
      const TONE={
        knife:{max:0.60,rate:[0.90,1.00]},
        gun:{max:0.74,rate:[0.95,1.01]},
        scream:{max:0.52,rate:[0.94,1.02]},
        step:{max:0.30,rate:[1.00,1.12]},
        flesh:{max:0.42,rate:[0.90,1.00]},
        door:{max:0.34,rate:[0.88,0.94]},
        work:{max:0.38,rate:[0.92,1.04]},
        metal:{max:0.50,rate:[0.70,0.90]},
        ui:{max:0.62,rate:[1,1]},
        report:{max:0.55,rate:[1,1]},
      };
      /* 播放日志：Playwright 用它验证「一次出刀只响一次」 */
      const LOG=[]; let LOGN=0;
      function note(n){LOG.push(n);LOGN++;if(LOG.length>120)LOG.shift();}
      function prep(name){
        if(POOL[name])return POOL[name];
        const pool=[];
        for(const src of FILE[name]){
          for(let i=0;i<2;i++){
            const a=new Audio(src);
            a.preload='auto';
            a.__src=src;
            pool.push(a);
          }
        }
        return POOL[name]=pool;
      }
      function play(name,vol,rate){
        if(!on||SIM_RUN)return true;
        if(!FILE[name])return false;
        const pool=prep(name);
        let a=pool.find(x=>x.paused||x.ended);
        if(!a){a=pool[rr++%pool.length];try{a.pause();}catch(e){}}
        const tn=TONE[name];
        try{
          a.currentTime=0;
          /* 音量先过音色档上限：单条音效不能盖过全场（刺耳的主因是"大"不是"亮"） */
          let v=(vol==null?1:vol)*master;
          if(tn)v=Math.min(v,tn.max);
          a.volume=Math.max(0,Math.min(1,v));
          const rt=rate==null&&tn
            ?(tn.rate[0]+Math.random()*(tn.rate[1]-tn.rate[0]))
            :(rate||1);
          a.playbackRate=Math.max(0.5,Math.min(1.8,rt));
          const p=a.play();
          if(p&&p.catch)p.catch(()=>{});
        }catch(e){}
        return true;
      }
      function C(){ if(!ac){ try{ ac=new (window.AudioContext||window.webkitAudioContext)(); }catch(e){ ac=null; } } return ac; }
      function beep(f0,f1,dur,type,vol){
        if(!on||SIM_RUN)return; const c=C(); if(!c)return;
        const o=c.createOscillator(), g=c.createGain();
        o.type=type||'sine'; o.frequency.setValueAtTime(f0,c.currentTime);
        if(f1) o.frequency.exponentialRampToValueAtTime(Math.max(20,f1),c.currentTime+dur);
        g.gain.setValueAtTime((vol||0.10)*master,c.currentTime);
        g.gain.exponentialRampToValueAtTime(0.0008,c.currentTime+dur);
        o.connect(g); g.connect(c.destination); o.start(); o.stop(c.currentTime+dur+0.02);
      }
      function noise(dur,vol,hp){
        if(!on||SIM_RUN)return; const c=C(); if(!c)return;
        const n=Math.floor(c.sampleRate*dur), b=c.createBuffer(1,n,c.sampleRate), d=b.getChannelData(0);
        for(let i=0;i<n;i++) d[i]=(Math.random()*2-1)*(1-i/n);
        const src=c.createBufferSource(); src.buffer=b;
        const g=c.createGain(); g.gain.setValueAtTime((vol||0.2)*master,c.currentTime);
        g.gain.exponentialRampToValueAtTime(0.0008,c.currentTime+dur);
        let node=src;
        if(hp){ const f=c.createBiquadFilter(); f.type='highpass'; f.frequency.value=hp; src.connect(f); node=f; }
        node.connect(g); g.connect(c.destination); src.start();
      }
      /* 低通噪声：拖拽/机械摩擦专用，和脚步的高频沙沙明确分开 */
      function noiseLp(dur,vol,cut){
        if(!on||SIM_RUN)return; const c=C(); if(!c)return;
        const n=Math.floor(c.sampleRate*dur), b=c.createBuffer(1,n,c.sampleRate), d=b.getChannelData(0);
        let last=0;
        for(let i=0;i<n;i++){
          last=last*0.82+(Math.random()*2-1)*0.18;
          d[i]=last*(1-i/n);
        }
        const src=c.createBufferSource(); src.buffer=b;
        const f=c.createBiquadFilter(); f.type='lowpass'; f.frequency.value=cut||260;
        const g=c.createGain(); g.gain.setValueAtTime((vol||0.2)*master,c.currentTime);
        g.gain.exponentialRampToValueAtTime(0.0008,c.currentTime+dur);
        src.connect(f); f.connect(g); g.connect(c.destination); src.start();
      }
      /* 开局即预载采样，避免第一次出刀/开枪时还在读盘 */
      for(const k in FILE) prep(k);
      return {
        setOn:function(v){
          on=!!v;
          if(!on)for(const k in POOL)for(const a of POOL[k]){try{a.pause();}catch(e){}}
        },
        isOn:function(){return on;},
        setMaster:function(v){master=Math.max(0,Math.min(1,+v||0));},
        getMaster:function(){return master;},
        /* 距离 → 音量（线性，保底 0.14 / 最高 1.0，量程 18 格）。所有带位置的音效都走它。 */
        volAt:volAt,
        distRange:DIST.range,
        debug:function(){
          const out={};
          for(const k in POOL) out[k]=POOL[k].map(a=>({src:a.__src,ready:a.readyState,err:a.error?a.error.code:0}));
          return out;
        },
        log:function(){return LOG.slice();},
        logCount:function(){return LOGN;},
        clearLog:function(){LOG.length=0;},
        knife:function(vol){
          note('knife');
          /* 只响一次、音量压低 22%：不再叠 70ms 后的血肉层，避免「一刀两声」 */
          const v=Math.max(0.12,Math.min(0.78,(vol==null?0.6:vol)*0.86));
          if(!play('knife',v,0.92+Math.random()*0.10)){
            noise(0.09,0.10,1200); beep(300,140,0.14,'triangle',0.07);
          }
        },
        flesh:function(vol){
          /* 命中反馈：枪/刀之后叠一层血肉闷响，与“枪声/刀风”本身区分开 */
          if(!play('flesh',Math.max(0.10,Math.min(0.55,vol==null?0.32:vol)),0.94+Math.random()*0.10))
            noise(0.10,0.06,900);
        },
        shot:function(vol){
          note('shot');
          if(!play('gun',vol==null?1:vol,0.97+Math.random()*0.06)){ noise(0.10,0.34,300); beep(900,120,0.16,'square',0.18); }
        },
        step:function(vol){
          note('step');
          /* 换成更轻的 CC0 木地板脚步，并整体压低；AI 只在近处播放 */
          if(!play('step',(vol==null?0.4:vol)*0.78,1.02+Math.random()*0.12)) beep(150,120,0.06,'sine',0.05);
        },
        scream:function(vol){
          /* 被击倒时的喊叫：公开 CC0 死亡/受创人声采样；不写播放日志 */
          if(!play('scream',Math.max(0.06,Math.min(0.65,vol==null?0.45:vol)),0.96+Math.random()*0.08)){
            noise(0.12,0.07,600); beep(300,160,0.18,'sawtooth',0.04);
          }
        },
        ui:function(){ if(!play('ui',0.85,1)) beep(520,700,0.07,'triangle',0.12); },
        interact:function(){ if(!play('ui',0.85,1)) beep(520,700,0.07,'triangle',0.12); },
        doorAuto:function(vol){
          /* 自动门不写播放日志，避免干扰「一次出刀只响一次」的断言 */
          if(!play('door',(vol==null?0.4:vol)*0.65,0.92)) beep(240,180,0.09,'square',0.035);
        },
        done:function(){ beep(660,990,0.15,'triangle',0.16); },
        qual:function(){ beep(520,1040,0.32,'sine',0.18); beep(780,1560,0.22,'sine',0.09); },
        work:function(){ if(!play('work',0.55,0.94+Math.random()*0.12)) noise(0.05,0.06,1600); },
        med:function(){ beep(420,760,0.20,'sine',0.16); },
        ammo:function(){ beep(300,240,0.13,'square',0.15); },
        revive:function(){ beep(380,900,0.30,'sine',0.17); },
        report:function(){ note('report'); if(!play('report',0.75,1)){ beep(880,440,0.28,'triangle',0.13); } },
        vote:function(){ if(!play('ui',0.55,1.18)) beep(600,900,0.09,'square',0.10); },
        expel:function(){ note('expel'); if(!play('metal',0.9,0.72)) beep(300,80,0.50,'sawtooth',0.16); },
        breaker:function(){ note('breaker'); noise(0.18,0.26,200); beep(95,55,0.28,'square',0.11); play('metal',0.85,0.9); },
        sabotage:function(){ note('sabotage'); noise(0.30,0.20,600); beep(180,1500,0.28,'sawtooth',0.09); play('metal',0.6,0.78); },
        pipe:function(){ note('pipe'); beep(210,760,0.24,'sine',0.11); },
        robot:function(){ note('robot'); beep(240,180,0.12,'square',0.08); play('metal',0.55,1.04); noise(0.10,0.10,1200); },
        alarm:function(){ note('alarm'); beep(780,780,0.10,'square',0.16); },
        search:function(){ noise(0.16,0.10,1800); beep(520,640,0.10,'triangle',0.09); },
        ghost:function(){ beep(880,220,0.55,'sine',0.09); beep(440,110,0.70,'sine',0.05); },
        win:function(){ note('win'); if(!play('win',0.9)){ beep(660,1320,0.5,'sine',0.16); } },
        lose:function(){ note('lose'); if(!play('lose',0.85)){ beep(220,60,0.7,'sawtooth',0.14); } },
        drag:function(vol){
          note('drag');
          /* 低频摩擦 + 极轻的机械吱声：和脚步（高频沙沙）、出刀（刀风）三套材质 */
          const v=vol==null?0.5:vol;
          noiseLp(0.28,v*0.20,300);
          beep(72,58,0.22,'sine',0.028*v);
        }
      };
    })();

    /* ---------------- 素材 ---------------- */
    const A='assets/scene/';
    const IMG={};
    function loadImg(k,src){const i=new Image();i.src=A+src;IMG[k]=i;return i;}
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
    for(const k in FLOOR) loadImg('fl_'+k,FLOOR[k]);
    const FSET=new Set(Object.values(FURN));
    for(const f of FSET) loadImg('fu_'+f,'cozy/furniture/'+f+'.png');
    for(let i=1;i<=15;i++) loadImg('cr_'+i,'crew/crew-'+String(i).padStart(2,'0')+'.png');
    loadImg('base','v4/base-lit.png');
    loadImg('hull','v4/hull-deck.png');
    loadImg('door','v4/tex/door-panel.png');
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
    loadImg('fx_supply_ammo','v4/facility/supply-ammo.png');
    loadImg('fx_supply_med','v4/facility/supply-med.png');
    /* 监控台 / 电闸的贴图不再进运行时：它们的本体由 Blender 底图烘出来，
       面板与屏幕材质走 assets/scene/v4/tex/facility-*.png（见 tools/blender-ship.py）。
       assets/scene/v4/facility/monitor.png / breaker.png 保留为素材库。 */
    const ROW=SKT2Space.ROW;  /* 真源 js/t2/space.js；另有两处直接使用 ROW */
    
    let PAT={};
    function patFor(r){
      const key=r.id+'|'+VIEW.s.toFixed(2);
      if(PAT[key])return PAT[key];
      const im=IMG['fl_'+r.id]||IMG['fl_transit'];
      if(!ready(im))return null;
      const p=ctx.createPattern(im,'repeat');
      const k=VIEW.s/32;
      if(p&&p.setTransform) p.setTransform(new DOMMatrix([k,0,0,k,0,0]));
      PAT[key]=p; return p;
    }
    
    /* ---------------- 渲染 ---------------- */
    /* 2.5D 底图：Blender 正交俯视（12° 倾角）渲出的整船，含地面/墙面/家具。
       贴图没加载完时退回老 cozy 平铺，保证首帧不空。 */
    function drawLegacyMap(){
      for(const c of M.corridors){
        ctx.strokeStyle='#1A2029';ctx.lineWidth=CW*VIEW.s;ctx.lineCap='butt';ctx.lineJoin='round';
        ctx.beginPath();c.pts.forEach((p,i)=>i?ctx.lineTo(SX(p[0]),SY(p[1])):ctx.moveTo(SX(p[0]),SY(p[1])));ctx.stroke();
        ctx.strokeStyle='#2A323E';ctx.lineWidth=1;
        ctx.beginPath();c.pts.forEach((p,i)=>i?ctx.lineTo(SX(p[0]),SY(p[1])):ctx.moveTo(SX(p[0]),SY(p[1])));ctx.stroke();
      }
      for(const r of M.rooms){
        const lit=G.lit[r.id];
        ctx.beginPath();r.poly.forEach((p,i)=>i?ctx.lineTo(SX(p[0]),SY(p[1])):ctx.moveTo(SX(p[0]),SY(p[1])));ctx.closePath();
        ctx.save();ctx.clip();
        const pat=patFor(r);
        if(pat){ctx.fillStyle=pat;}
        else{ctx.fillStyle=lit?'#1E2632':'#12171E';}
        ctx.fillRect(SX(r.rect[0])-2,SY(r.rect[1])-2,(r.rect[2]+4)*VIEW.s,(r.rect[3]+4)*VIEW.s);
        if(!lit){ctx.fillStyle='rgba(3,5,9,.62)';ctx.fillRect(SX(r.rect[0])-2,SY(r.rect[1])-2,(r.rect[2]+4)*VIEW.s,(r.rect[3]+4)*VIEW.s);}
        ctx.restore();
        ctx.strokeStyle=lit?'#39434F':'#22272F';ctx.lineWidth=1.5;ctx.stroke();
      }
      for(const c of M.cover){
        const im=IMG['fu_'+(FURN[c.kind]||'crate')];
        if(ready(im)){
          const ar=im.naturalWidth/im.naturalHeight;
          let w=c.w*VIEW.s, h=w/ar;
          const maxH=(c.h+0.9)*VIEW.s;
          if(h>maxH){h=maxH;w=h*ar;}
          ctx.drawImage(im,SX(c.x+c.w/2)-w/2,SY(c.y+c.h)-h,w,h);
        }else{
          ctx.fillStyle='#2E3742';ctx.beginPath();
          ctx.rect(SX(c.x),SY(c.y),c.w*VIEW.s,c.h*VIEW.s);ctx.fill();
        }
      }
    }
    /* 每条走廊两盏顶灯，配电室拉闸后整条走廊全熄 */
    function drawCorridorLights(T){
      if(!G)return;
      for(const c of M.corridors){
        for(const p of corridorLampPos(c)){
          const x=SX(p[0]),y=SY(p[1]);
          if(G.corrLit){
            const rad=ctx.createRadialGradient(x,y,0,x,y,2.35*VIEW.s);
            rad.addColorStop(0,'rgba(140,235,250,.20)');
            rad.addColorStop(0.45,'rgba(110,205,240,.09)');
            rad.addColorStop(1,'rgba(90,180,230,0)');
            ctx.fillStyle=rad;
            ctx.beginPath();ctx.ellipse(x,y,2.35*VIEW.s,1.25*VIEW.s,0,0,7);ctx.fill();
          }
          ctx.save();ctx.translate(x,y);ctx.rotate(p[2]);
          ctx.fillStyle=G.corrLit?'rgba(196,246,255,.92)':'rgba(54,61,70,.95)';
          ctx.fillRect(-0.34*VIEW.s,-0.085*VIEW.s,0.68*VIEW.s,0.17*VIEW.s);
          if(G.corrLit){
            ctx.fillStyle='rgba(255,255,255,'+(0.55+0.25*Math.sin(T*3+p[0])).toFixed(2)+')';
            ctx.fillRect(-0.26*VIEW.s,-0.045*VIEW.s,0.52*VIEW.s,0.09*VIEW.s);
          }
          ctx.restore();
        }
      }
    }
    /* 人形机器人：脚在 (x,y)，总高约 1.15 格（与船员视觉同高）。
       自绘而不用船员素材：设施要能随时改配色/停摆态，且机器人没有 4 向行走图。 */
    function drawRobotBody(T,x,y,s,o){
      const dead=!!o.dead, face=o.face<0?-1:1, moving=!dead&&!!o.moving;
      const swing=moving?Math.sin(T*8):0;
      /* 身体颠簸 0.03 格；停摆时头部下沉 0.1 格，腿不摆 */
      const bob=moving?Math.abs(Math.sin(T*8))*0.03*s:0;
      const sink=dead?0.1*s:0;
      const base=dead?'#5B6572':o.base;
      const dark=dead?'#39404A':'rgba(12,16,21,.97)';
      ctx.save();ctx.translate(x,y);ctx.scale(face,1);
      ctx.fillStyle='rgba(0,0,0,.32)';
      ctx.beginPath();ctx.ellipse(0,0,.34*s,.12*s,0,0,7);ctx.fill();
      ctx.lineCap='round';
      /* 两条腿：前后摆动 */
      ctx.strokeStyle=base;ctx.lineWidth=.11*s;
      ctx.beginPath();ctx.moveTo(-.09*s,-.42*s+bob*.5);
      ctx.lineTo(-.09*s+swing*.16*s,0);ctx.stroke();
      ctx.beginPath();ctx.moveTo(.09*s,-.42*s+bob*.5);
      ctx.lineTo(.09*s-swing*.16*s,0);ctx.stroke();
      /* 手臂与腿反相摆动 */
      ctx.strokeStyle=dead?'#4E5663':base;ctx.lineWidth=.09*s;
      ctx.beginPath();ctx.moveTo(-.19*s,-.74*s+bob);
      ctx.lineTo(-.24*s-swing*.10*s,-.48*s+bob);ctx.stroke();
      ctx.beginPath();ctx.moveTo(.19*s,-.74*s+bob);
      ctx.lineTo(.24*s+swing*.10*s,-.48*s+bob);ctx.stroke();
      /* 躯干 + 头 */
      ctx.fillStyle=dark;ctx.strokeStyle=base;ctx.lineWidth=1.5;
      ctx.beginPath();ctx.roundRect(-.21*s,-.84*s+bob,.42*s,.44*s,4);ctx.fill();ctx.stroke();
      ctx.beginPath();ctx.arc(0,-1.0*s+bob+sink,.155*s,0,7);ctx.fill();ctx.stroke();
      /* 目镜 */
      ctx.fillStyle=dead?'rgba(90,100,115,.5)':o.accent;
      ctx.fillRect(-.08*s,-1.01*s+bob+sink,.16*s,.045*s);
      if(o.kind==='medbot'){
        /* 胸口十字 */
        ctx.fillStyle=dead?'#5B6572':o.accent;
        ctx.fillRect(-.05*s,-.69*s+bob,.1*s,.22*s);
        ctx.fillRect(-.11*s,-.63*s+bob,.22*s,.1*s);
      }else{
        /* 肩部警示条 + 胸前指示灯 */
        ctx.fillStyle=dead?'#5B6572':'#F0C674';
        ctx.fillRect(-.21*s,-.82*s+bob,.16*s,.055*s);
        ctx.fillStyle=dead?'#5B6572':o.accent;
        ctx.beginPath();ctx.arc(.08*s,-.64*s+bob,.035*s,0,7);ctx.fill();
      }
      ctx.restore();
    }
    /* 医疗无人机（2026-10-31 取代原来的巡逻医疗机器人）：悬浮机身 + 四旋翼 + 医疗十字 + 推进器底光。
       和 drawRobotBody 分开画——那台是长腿的地勤机器人，无人机不接地，
       悬停高度、旋翼旋转、治疗光束都是独立表现；停摆时整台砸在地上、旋翼停转。 */
    function drawMedDrone(T,x,y,s,o){
      const dead=!!o.dead, exhausted=!!o.exhausted;
      const hover=dead?0.24*s:(0.52*s+Math.sin(T*2.4)*0.04*s);
      const cy=y-hover;
      const base=dead?'#5B6572':(exhausted?'#8A6A45':'#3FBF8C');
      const accent=dead?'#4E5663':(exhausted?'#D4B070':'#7FE3B4');
      ctx.save();
      /* 地面投影：悬停呼吸，飞得高时更小更淡 */
      const sh=0.30+0.04*Math.sin(T*2.4);
      ctx.fillStyle='rgba(0,0,0,'+(dead?0.32:0.18)+')';
      ctx.beginPath();ctx.ellipse(x,y-0.02*s,sh*s*0.86,sh*s*0.34,0,0,7);ctx.fill();
      /* 推进器底光 */
      if(!dead){
        const g=ctx.createRadialGradient(x,cy+0.20*s,0,x,cy+0.20*s,0.95*s);
        g.addColorStop(0,exhausted?'rgba(212,176,112,.15)':'rgba(63,191,140,.20)');
        g.addColorStop(1,'rgba(63,191,140,0)');
        ctx.fillStyle=g;ctx.beginPath();ctx.arc(x,cy+0.20*s,0.95*s,0,7);ctx.fill();
      }
      /* 机体：优先用 SDXL 出的 2.5D 俯视贴图（assets/scene/v4/facility/medbot.png）。
         贴图自带四旋翼 + 青绿医疗十字；代码只叠加「悬停浮动 + 旋翼残影 + 状态灯」，
         贴图没加载完（file:// 冷启动）时回退到原来的矢量造型。 */
      const img=IMG['fx_medbot'];
      if(ready(img)){
        const w=1.72*s, h=1.72*s;
        if(!dead){
          const spin=T*16;
          for(const ax of [-1,1])for(const ay of [-1,1]){
            ctx.strokeStyle='rgba(159,240,203,'+(0.14+0.09*Math.sin(spin+ax+ay)).toFixed(2)+')';
            ctx.lineWidth=0.028*s;
            ctx.beginPath();
            ctx.ellipse(x+ax*0.40*s,cy+ay*0.22*s,0.20*s,0.085*s,spin*0.4,0,7);
            ctx.stroke();
          }
        }
        ctx.globalAlpha=dead?0.5:0.98;
        ctx.drawImage(img,x-w/2,cy-h*0.50,w,h);
        ctx.globalAlpha=1;
      }else{
        /* 四旋翼：支臂 + 高速旋转双弧（停摆后只剩静止的桨盘） */
        const spin=T*(dead?0:16);
        for(const ax of [-1,1])for(const ay of [-1,1]){
          const rx=x+ax*0.36*s, ry=cy+ay*0.19*s;
          ctx.strokeStyle=dead?'rgba(92,102,118,.6)':base;ctx.lineWidth=0.05*s;
          ctx.beginPath();ctx.moveTo(x,cy);ctx.lineTo(rx,ry);ctx.stroke();
          if(dead){
            ctx.fillStyle='rgba(92,102,118,.28)';
            ctx.beginPath();ctx.ellipse(rx,ry,0.15*s,0.06*s,0,0,7);ctx.fill();
          }else{
            for(let k=0;k<2;k++){
              ctx.strokeStyle='rgba(159,240,203,'+(0.26+0.20*Math.sin(spin+k*2.1+ax+ay)).toFixed(2)+')';
              ctx.lineWidth=0.045*s;
              ctx.beginPath();ctx.ellipse(rx,ry,0.17*s,0.075*s,spin*0.35+k*Math.PI*0.5,0,7);ctx.stroke();
            }
          }
        }
        /* 机身 */
        ctx.fillStyle=dead?'rgba(52,58,68,.95)':'rgba(12,20,26,.96)';
        ctx.strokeStyle=base;ctx.lineWidth=Math.max(1.4,0.045*s);
        ctx.beginPath();ctx.roundRect(x-0.23*s,cy-0.17*s,0.46*s,0.31*s,0.11*s);ctx.fill();ctx.stroke();
        /* 顶盖高光 */
        ctx.fillStyle=dead?'rgba(70,78,90,.45)':'rgba(127,227,180,.13)';
        ctx.beginPath();ctx.roundRect(x-0.17*s,cy-0.14*s,0.34*s,0.09*s,0.045*s);ctx.fill();
        /* 医疗十字 */
        ctx.fillStyle=accent;
        ctx.fillRect(x-0.035*s,cy-0.075*s,0.07*s,0.17*s);
        ctx.fillRect(x-0.085*s,cy-0.025*s,0.17*s,0.07*s);
      }
      /* 侧灯：在线=呼吸绿灯，电量耗尽=琥珀慢闪 */
      const blink=exhausted?(0.35+0.35*Math.sin(T*4)):(0.55+0.35*Math.sin(T*3));
      ctx.fillStyle='rgba('+(exhausted?'212,176,112':'127,227,180')+','+blink.toFixed(2)+')';
      ctx.beginPath();ctx.arc(x+0.28*s,cy-0.10*s,0.045*s,0,7);ctx.fill();
      /* 治疗光束：悬停在伤员身边时持续拉住（不是读条瞬间才闪一下） */
      if(o.healing&&o.target){
        const tx=SX(o.target.x), ty=SY(o.target.y)-0.30*s;
        const sx0=x, sy0=cy+0.16*s;
        const flick=0.55+0.28*Math.sin(T*13);
        const bg=ctx.createLinearGradient(sx0,sy0,tx,ty);
        bg.addColorStop(0,'rgba(200,255,228,.78)');
        bg.addColorStop(1,'rgba(127,227,180,'+(0.20*flick).toFixed(2)+')');
        ctx.strokeStyle=bg;ctx.lineWidth=Math.max(2,0.085*s);ctx.lineCap='round';
        ctx.beginPath();ctx.moveTo(sx0,sy0);ctx.lineTo(tx,ty);ctx.stroke();
        for(let k=0;k<3;k++){
          const p=((T*1.7+k*0.33)%1);
          ctx.fillStyle='rgba(210,255,236,'+(0.5*(1-p)).toFixed(2)+')';
          ctx.beginPath();
          ctx.arc(sx0+(tx-sx0)*p,sy0+(ty-sy0)*p,0.055*s,0,7);ctx.fill();
        }
        ctx.strokeStyle='rgba(127,227,180,'+(0.34+0.34*Math.sin(T*9)).toFixed(2)+')';
        ctx.lineWidth=2;
        ctx.beginPath();ctx.ellipse(tx,ty+0.30*s,0.56*s,0.30*s,0,0,7);ctx.stroke();
      }
      ctx.restore();
    }
    /* 机器人标签的唯一文案源：保安拘留次数必须读 SEC_USES_MAX，不能再写死 3 */
    function botLabelText(f,dead){
      const left=G.medbotLeft==null?MEDBOT_CHARGES:G.medbotLeft;
      const exhausted=f.kind==='medbot'&&!dead&&left<=0;
      return f.label+(dead?' · 停摆':(exhausted?' · 电量耗尽':
        (f.kind==='medbot'?' · 电量 '+left+'/'+MEDBOT_CHARGES:
          (f.kind==='secbot'?' · 拘留 '+((G.secbotUses||0))+'/'+SEC_USES_MAX:' · 在线'))));
    }
    function drawBotLabel(f,x,y,s,dead){
      const text=botLabelText(f,dead);
      const left=G.medbotLeft==null?MEDBOT_CHARGES:G.medbotLeft;
      const exhausted=f.kind==='medbot'&&!dead&&left<=0;
      ctx.font='500 9.5px system-ui';ctx.textAlign='center';ctx.textBaseline='middle';
      const w=ctx.measureText(text).width+10,h=13,ly=y+0.62*s;
      /* 医疗间地面偏亮，纯文字标签会糊进底图，加一层暗底保证可读 */
      ctx.fillStyle=(dead||exhausted)?'rgba(8,11,16,.55)':'rgba(8,11,16,.72)';
      ctx.beginPath();ctx.roundRect(x-w/2,ly-h/2,w,h,4);ctx.fill();
      ctx.strokeStyle=(dead||exhausted)?'rgba(190,160,100,.35)':'rgba(126,142,164,.35)';
      ctx.lineWidth=1;ctx.stroke();
      ctx.fillStyle=dead?'rgba(170,180,195,.75)':(exhausted?'rgba(230,190,120,.9)':'rgba(225,238,248,.92)');
      ctx.fillText(text,x,ly+0.5);
    }
    /* 设施：电闸 / 监控台 / 医疗无人机 / 保安机器人 / 拘留区 */
    function drawFacilities(T){
      const s=VIEW.s;
      for(const f of M.facility){
        /* 机器人按巡逻运行时坐标画，设施表里的 x/y 只是初始位 */
        const rp=(f.kind==='medbot'||f.kind==='secbot')?botPos(f.kind):null;
        const x=SX(rp?rp.x:f.x),y=SY(rp?rp.y:f.y);
        if(f.kind==='breaker'){
          const off=G.lightState===2;
          /* 电闸优化：柜体 + 危险色边框 + 大拉杆（角度随供电状态平滑过渡）+
             状态灯 + 拉闸进度环。6 秒重拉闸时进度环变成橙红并带电流抖动。 */
          const pull=breakerPuller();
          const lever=off?1:0;
          BREAKER_LEVER+= (lever-BREAKER_LEVER)*Math.min(1,0.16);
          const ang=-0.62+BREAKER_LEVER*1.22;
          ctx.save();ctx.translate(x,y);
          /* 柜体本体交给底图（2026-10-31 改）：
             tools/blender-ship.py 的 breaker 分支早就烘了柜体 + 门板 + 拉杆 + LED 灯带 +
             线管 + 地面框，面板材质换成 SDXL 的 facility-panel.png。Canvas 只画玩法状态层
             —— 断电冷光、供电状态灯、拉闸进度环、重闸电弧。以前这里再画一台柜子（或叠一张
             SDXL 精灵），会跟底图那台叠成两台设备，玩家看到的就是「突兀」。 */
          if(off){
            const g0=ctx.createRadialGradient(0,0,0,0,0,1.05*s);
            g0.addColorStop(0,'rgba(70,150,190,.28)');
            g0.addColorStop(1,'rgba(70,150,190,0)');
            ctx.fillStyle=g0;ctx.beginPath();ctx.arc(0,0,1.05*s,0,7);ctx.fill();
          }
          const blink=off?(0.50+0.35*Math.sin(T*6)):(0.60+0.30*Math.sin(T*2.2));
          ctx.fillStyle=(off?'rgba(127,211,240,':'rgba(127,227,180,')+blink.toFixed(2)+')';
          ctx.beginPath();ctx.arc(-0.46*s,-0.62*s,0.085*s,0,7);ctx.fill();
          ctx.fillStyle='rgba(205,216,230,.90)';
          ctx.font='600 '+Math.max(8,0.17*s).toFixed(1)+'px system-ui';
          ctx.textAlign='left';ctx.textBaseline='middle';
          ctx.fillText(off?'断电':'供电',-0.32*s,-0.62*s);
          /* 拉闸进度环 */
          if(pull&&pull.p>0){
            const hot=pull.heavy;
            ctx.strokeStyle=hot?'rgba(255,150,60,.92)':'rgba(127,211,240,.92)';
            ctx.lineWidth=3;ctx.lineCap='round';
            ctx.beginPath();ctx.arc(0,0,0.86*s,-Math.PI/2,-Math.PI/2+Math.PI*2*Math.min(1,pull.p));
            ctx.stroke();
            if(hot){
              for(let k=0;k<3;k++){
                const aa=T*9+k*2.1, rr=0.62*s+Math.sin(T*13+k)*0.06*s;
                ctx.strokeStyle='rgba(255,214,140,'+(0.35+0.35*Math.sin(T*17+k)).toFixed(2)+')';
                ctx.lineWidth=1.4;
                ctx.beginPath();
                ctx.moveTo(Math.cos(aa)*rr,Math.sin(aa)*rr);
                ctx.lineTo(Math.cos(aa+0.5)*rr*1.12,Math.sin(aa+0.5)*rr*1.12);
                ctx.stroke();
              }
            }
          }
          drawIcon('bolt',off?'#7FD3F0':'#F0C674',0.40*s,-0.50*s,0.30*s,0);
          ctx.restore();
        }else if(f.kind==='monitor'){
          const cut=G.lightState===2;
          ctx.save();ctx.translate(x,y);
          /* 监控台本体同样交给底图（2026-10-31 改）：监控室的 screenwall（多屏拼接墙）、
             console（主控台）、servercab（备份机柜）都是 Blender 模型，屏幕内容用 SDXL 的
             facility-screen.png。Canvas 只画「这台还能不能调画面」的读数：在线呼吸灯 /
             断线红点 + 一层屏光。以前这里再叠一张屏幕精灵，等于墙上多出一台设备。 */
          if(!cut){
            const gg=ctx.createRadialGradient(0,-0.62*s,0,0,-0.62*s,1.15*s);
            gg.addColorStop(0,'rgba(95,224,168,.18)');
            gg.addColorStop(1,'rgba(95,224,168,0)');
            ctx.fillStyle=gg;ctx.beginPath();ctx.arc(0,-0.62*s,1.15*s,0,7);ctx.fill();
          }else{
            const gr=ctx.createRadialGradient(0,-0.62*s,0,0,-0.62*s,0.95*s);
            gr.addColorStop(0,'rgba(190,60,50,.22)');
            gr.addColorStop(1,'rgba(190,60,50,0)');
            ctx.fillStyle=gr;ctx.beginPath();ctx.arc(0,-0.62*s,0.95*s,0,7);ctx.fill();
          }
          const mblink=cut?(0.55+0.35*Math.sin(T*8)):(0.45+0.30*Math.sin(T*2.6));
          ctx.fillStyle=cut?('rgba(255,107,97,'+mblink.toFixed(2)+')')
            :('rgba(95,224,168,'+mblink.toFixed(2)+')');
          ctx.beginPath();ctx.arc(0,-0.92*s,0.075*s,0,7);ctx.fill();
          ctx.restore();
        }else if(f.kind==='supply'){
          /* ---- 补给站（2026-11-01 改 Blender 渲染）----
             旧实现是 Canvas 手画的圆角矩形 + 居中图标 + 上方 9px 文字：
             在 12° 俯角的烘焙底图上，它就是一张贴在地上的 UI 按钮 ——
             没有顶面、没有厚度、不受光，和旁边的货箱病床完全不是一套画法。
             现在本体来自 tools/blender-fx.py：SDXL 材质 + 与底图**同一台相机、
             同一套三点光、同一套 AgX 色彩管理**，所以它和底图是一张照片里的东西。
             这里只留状态层（可兑换虚线环 + 深色药丸标签），不再画本体。 */
          const ammo=f.item==='ammo';
          const im=IMG[ammo?'fx_supply_ammo':'fx_supply_med'];
          const gw=1.62*s;
          const me0=G.me||null;
          const ready0=!G.spectMode&&!!me0&&(me0.qual|0)>0&&
            (ammo?(me0.bullet|0)<1:(me0.medkit|0)<1);
          if(ready(im)){
            /* 贴图里已经烘了接地阴影，锚点往上抬一点让影子落在交互点上 */
            ctx.drawImage(im,x-gw/2,y-gw/2-0.06*s,gw,gw);
          }else{
            /* 冷启动兜底：贴图还没加载完时给一个最小可读的占位，不要留空 */
            ctx.fillStyle='rgba(10,14,20,.9)';
            ctx.strokeStyle=ammo?'#6B4E19':'#1F5A46';ctx.lineWidth=1.5;
            ctx.beginPath();ctx.roundRect(x-0.54*s,y-0.48*s,1.08*s,0.82*s,4);ctx.fill();ctx.stroke();
          }
          if(ready0){
            ctx.save();
            ctx.strokeStyle=(ammo?'rgba(250,184,51,':'rgba(127,227,180,')+
              (0.34+0.20*Math.sin(T*3.2)).toFixed(2)+')';
            ctx.lineWidth=Math.max(1.2,0.030*s);
            ctx.setLineDash([0.15*s,0.12*s]);ctx.lineDashOffset=-T*0.9*s;
            ctx.beginPath();ctx.ellipse(x,y,0.78*s,0.56*s,0,0,7);ctx.stroke();
            ctx.restore();
          }
          ctx.font='500 9.5px system-ui';ctx.textAlign='center';ctx.textBaseline='middle';
          const tw0=ctx.measureText(f.label).width+10, th0=13;
          ctx.fillStyle='rgba(8,11,16,.72)';
          ctx.beginPath();ctx.roundRect(x-tw0/2,y+0.62*s-th0/2,tw0,th0,4);ctx.fill();
          ctx.fillStyle=ammo?'rgba(255,224,163,.94)':'rgba(198,245,228,.94)';
          ctx.fillText(f.label,x,y+0.62*s+0.5);
        }else if(f.kind==='medbot'){
          const dead=!!G.medbotDead;
          const left=G.medbotLeft==null?MEDBOT_CHARGES:G.medbotLeft;
          const exhausted=!dead&&left<=0;
          const b=G.bots&&G.bots.medbot;
          ctx.save();
          if(!dead&&!exhausted){
            /* 覆盖范围显化：整间医疗间（呼吸虚线沿房间轮廓）。
               改成无人机后不再有「以机器人为圆心的 6 格圆」——它会自己飞过去，
               玩家只要记住一条规则：人落在医疗间里就有人来救。 */
            const mr=M.rooms.find(r=>r.id==='med');
            if(mr){
              ctx.beginPath();
              mr.poly.forEach((p,i)=>i?ctx.lineTo(SX(p[0]),SY(p[1])):ctx.moveTo(SX(p[0]),SY(p[1])));
              ctx.closePath();
              ctx.fillStyle='rgba(63,191,140,.045)';ctx.fill();
              ctx.setLineDash([0.22*s,0.26*s]);ctx.lineDashOffset=-T*10;
              ctx.strokeStyle='rgba(127,227,180,'+(0.34+0.16*Math.sin(T*2.2)).toFixed(2)+')';
              ctx.lineWidth=1.6;ctx.stroke();
              ctx.setLineDash([]);
            }
          }
          drawMedDrone(T,x,y,s,{dead:dead,exhausted:exhausted,
            face:b?b.face:1,moving:!!(b&&b.moving),healing:!!(b&&b.healing),
            target:G.medbotTarget!=null?G.agents[G.medbotTarget]:null});
          if(G.medbotT>0&&!dead&&!exhausted){
            /* 治疗进度环：钉在无人机悬停位，按 MEDBOT_HEAL_TIME 走满才拉起 */
            const p=Math.min(1,G.medbotT/MEDBOT_HEAL_TIME);
            ctx.strokeStyle='rgba(200,255,228,.26)';ctx.lineWidth=1.6;
            ctx.beginPath();ctx.arc(x,y-0.52*s,0.66*s,0,7);ctx.stroke();
            ctx.strokeStyle='rgba(127,227,180,'+(0.42+0.34*Math.sin(T*10)).toFixed(2)+')';
            ctx.lineWidth=2.8;ctx.lineCap='round';
            ctx.beginPath();ctx.arc(x,y-0.52*s,0.66*s,-Math.PI/2,-Math.PI/2+Math.PI*2*p);ctx.stroke();
          }
          drawBotLabel(f,x,y,s,dead);
          ctx.restore();
        }else if(f.kind==='secbot'){
          const dead=!!G.secbotDead;
          const used=!!G.secbotUsed;
          const b=G.bots&&G.bots.secbot;
          ctx.save();
          if(!dead){
            const scan=T*0.9;
            const fa=b&&Number.isFinite(b.ang)?b.ang:0;
            /* 180° 前方扇形：实际判定范围在 botTick，这里是朝向提示 */
            /* 观察范围显化：真实 14 格 / 180° 扇形，不再只画 2.5 格的小弧。
               扇形按保安所在舱室裁剪——墙会挡视线，画到舱外只会误导玩家。 */
            const sroom=roomAt(b?b.x:f.x,b?b.y:f.y);
            ctx.save();
            if(sroom){
              ctx.beginPath();
              sroom.poly.forEach((p,i)=>i?ctx.lineTo(SX(p[0]),SY(p[1])):ctx.moveTo(SX(p[0]),SY(p[1])));
              ctx.closePath();ctx.clip();
            }
            ctx.fillStyle='rgba(255,107,97,.05)';ctx.strokeStyle='rgba(255,107,97,.30)';ctx.lineWidth=1.4;
            ctx.beginPath();ctx.moveTo(x,y-0.55*s);
            ctx.arc(x,y-0.55*s,SEC_RANGE*s,fa-SEC_ARC,fa+SEC_ARC);ctx.closePath();
            ctx.fill();ctx.stroke();
            ctx.strokeStyle='rgba(255,107,97,.38)';ctx.lineWidth=1.8;
            ctx.beginPath();ctx.arc(x,y-0.55*s,SEC_RANGE*s*0.72,scan-0.34,scan+0.34);ctx.stroke();
            ctx.beginPath();ctx.arc(x,y-0.55*s,SEC_RANGE*s*0.72,scan+Math.PI-0.34,scan+Math.PI+0.34);ctx.stroke();
            ctx.restore();
            ctx.fillStyle='rgba(255,180,170,.75)';ctx.font='500 8px system-ui';ctx.textAlign='center';
            ctx.fillText(SEC_RANGE+' 格 · 180°',x,y-0.55*s-3.2*s);
            if(G.secbotT>0){
              ctx.strokeStyle='rgba(255,107,97,'+(0.5+0.4*Math.sin(T*16)).toFixed(2)+')';ctx.lineWidth=2.6;
              ctx.beginPath();ctx.arc(x,y-0.55*s,(1.1+0.8*(1.6-G.secbotT))*s,0,7);ctx.stroke();
            }
          }
          /* 已擒拿过的当晚转琥珀色，保留原有"本夜用过"的信息。
             机体优先用 SDXL 出的 2.5D 贴图（站立 3/4 视角，与 crew 立绘同一套语言） */
          const simg=IMG['fx_secbot'];
          if(ready(simg)){
            const w=1.05*s, h=1.50*s;
            ctx.globalAlpha=dead?0.42:0.98;
            ctx.drawImage(simg,x-w/2,y-h*0.93,w,h);
            ctx.globalAlpha=1;
            if(dead){
              /* 停摆：机身压暗 + 一道斜向裂纹提示，避免和在线状态混淆 */
              ctx.strokeStyle='rgba(150,160,175,.55)';ctx.lineWidth=1.4;
              ctx.beginPath();ctx.moveTo(x-0.26*s,y-0.35*s);ctx.lineTo(x+0.24*s,y-1.02*s);ctx.stroke();
            }
            if(used&&!dead){
              ctx.fillStyle='rgba(201,164,107,.85)';
              ctx.beginPath();ctx.arc(x+0.30*s,y-1.18*s,0.07*s,0,7);ctx.fill();
            }
          }else{
            drawRobotBody(T,x,y,s,{kind:'secbot',dead:dead,face:b?b.face:1,
              moving:!!(b&&b.moving),base:used?'#8A6A45':'#FF6B61',
              accent:used?'#C9A46B':'#FFB4A8'});
          }
          if(G.secCatch&&!dead){
            const cd=G.secCatch, tgt=G.agents[cd.i];
            if(tgt){
              const tx=SX(tgt.x),ty=SY(tgt.y);
              ctx.strokeStyle='rgba(255,107,97,'+(0.55+0.3*Math.sin(T*14)).toFixed(2)+')';
              ctx.lineWidth=2;ctx.setLineDash([5,3]);
              ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(tx,ty);ctx.stroke();ctx.setLineDash([]);
              ctx.strokeStyle='rgba(255,180,170,.85)';ctx.lineWidth=1.5;
              ctx.beginPath();ctx.arc(tx,ty,1.15*s,0,7);ctx.stroke();
              ctx.fillStyle='rgba(255,190,180,.9)';ctx.font='600 9px system-ui';ctx.textAlign='center';
              ctx.fillText(cd.phase==='chase'?'追捕':'压制',tx,ty-1.5*s);
            }
          }
          drawBotLabel(f,x,y,s,dead);
          ctx.restore();
        }
      }
      /* 拘留区：保安机器人旁边的红色虚线角笼 */
      const jail=secJail();
      if(jail){
        const jx=SX(jail[0]),jy=SY(jail[1]);
        const busy=G.agents.some(a=>a.detained&&a.alive);
        ctx.save();
        ctx.setLineDash([4,3]);
        ctx.strokeStyle=busy?'rgba(255,107,97,.6)':'rgba(120,136,154,.22)';
        ctx.lineWidth=1.2;
        ctx.beginPath();ctx.ellipse(jx,jy,0.52*s,0.34*s,0,0,7);ctx.stroke();
        ctx.setLineDash([]);
        ctx.fillStyle=busy?'rgba(255,150,140,.75)':'rgba(120,136,154,.35)';
        ctx.font='500 9px system-ui';ctx.textAlign='center';ctx.textBaseline='middle';
        ctx.fillText('拘留区',jx,jy-0.5*s);
        ctx.restore();
      }
    }
    /* 地道口：菱形格栅 + 呼吸光环。
       形状语言全船统一（菱形 + 三道格栅 + 呼吸环），配色跟随所在舱室的主题色，
       这样食堂口是暖金、医疗口是冷青、引擎口是橙红，看起来长在房间里而不是贴上去的。
       颜色值与 tools/blender-ship.py 的 ROOM_THEME[].mark 对齐。 */
    /* 方案 A 第四批：ROW / PIPE_TINT 真源在 js/t2/space.js#SKT2Space；PIPE_TINT 本文件不再定义。 */
    function drawPipes(T){      const s=VIEW.s;
      for(const q of M.pipes){
        const x=SX(q.x),y=SY(q.y);
        const tint=pipeTint(q.room);
        const rad=ctx.createRadialGradient(x,y,0,x,y,0.95*s);
        rad.addColorStop(0,tint.a('.20'));
        rad.addColorStop(1,tint.a('0'));
        ctx.fillStyle=rad;ctx.beginPath();ctx.arc(x,y,0.95*s,0,7);ctx.fill();
        ctx.save();ctx.translate(x,y);ctx.rotate(Math.PI/4);
        ctx.fillStyle='rgba(12,12,20,.96)';
        ctx.strokeStyle=tint.a('.8');ctx.lineWidth=1.3;
        ctx.fillRect(-0.33*s,-0.33*s,0.66*s,0.66*s);
        ctx.strokeRect(-0.33*s,-0.33*s,0.66*s,0.66*s);
        ctx.strokeStyle=tint.dim('.55');ctx.lineWidth=1;
        for(let i=-1;i<=1;i++){
          ctx.beginPath();ctx.moveTo(-0.24*s,i*0.13*s);ctx.lineTo(0.24*s,i*0.13*s);ctx.stroke();
        }
        ctx.restore();
        const k=(T*0.55+q.x*0.07)%1;
        ctx.strokeStyle=tint.a((0.5*(1-k)).toFixed(2));ctx.lineWidth=1.4;
        ctx.beginPath();ctx.ellipse(x,y,(0.4+0.7*k)*s,(0.26+0.45*k)*s,0,0,7);ctx.stroke();
      }
    }
    /* 圆桌上的物资申请单：有待领时显示金色单据与脉冲环 */
    function drawReqTable(T){
      const t=roundTableCover(); if(!t)return;
      const x=SX(t.x+t.w/2), y=SY(t.y+t.h/2);
      const pend=G.me.qualPending||0, s=VIEW.s;
      const a=pend?0.55+0.25*Math.sin(T*4.5):0.24;
      ctx.save();ctx.translate(x,y-0.08*s);
      ctx.globalAlpha=pend?1:0.55;
      ctx.fillStyle='rgba(240,198,116,.92)';
      ctx.fillRect(-0.12*s,-0.17*s,0.24*s,0.32*s);
      ctx.strokeStyle='rgba(255,244,210,.95)';ctx.lineWidth=1;
      ctx.strokeRect(-0.12*s,-0.17*s,0.24*s,0.32*s);
      ctx.strokeStyle='rgba(90,66,20,.8)';ctx.lineWidth=.8;
      for(let i=0;i<3;i++){
        ctx.beginPath();ctx.moveTo(-0.07*s,(-0.09+i*0.075)*s);ctx.lineTo(0.07*s,(-0.09+i*0.075)*s);ctx.stroke();
      }
      if(pend){
        ctx.strokeStyle='rgba(240,198,116,'+a.toFixed(2)+')';ctx.lineWidth=2;
        ctx.beginPath();ctx.arc(0,0,0.48*s,0,7);ctx.stroke();
        ctx.font='600 11px system-ui';ctx.textAlign='center';ctx.textBaseline='middle';
        const label='物资申请单 · 待领 '+pend;
        const w=ctx.measureText(label).width+14,ly=-0.76*s;
        ctx.fillStyle='rgba(30,22,6,.88)';
        ctx.beginPath();ctx.roundRect(-w/2,ly-9,w,18,5);ctx.fill();
        ctx.strokeStyle='rgba(240,198,116,.7)';ctx.lineWidth=1;ctx.stroke();
        ctx.fillStyle='#FFE8B0';ctx.fillText(label,0,ly+0.5);
      }
      ctx.restore();
    }
    /* 自动门：横向门用立式双开门板，纵向门用贴地滑轨；无人闭合、有人靠近滑开。 */
    /* 自动门：2.5D 只画「门的顶面」。
       相机固定从北侧俯视，立式门板会露出一整块正立面、从上下两侧看还不一样；
       这里统一成一块被抬到墙顶高度的薄板（两块门板左右滑开），
       横门 / 竖门只是旋转 90°，看上去始终是"门的最上面那一层"。 */
    function drawDoors(T){
      if(!G||!G.doors)return;
      const s=VIEW.s, im=IMG['door'], readyIm=ready(im);
      const LIFT=0.24*s;              /* 与墙顶在 12° 俯视下的屏幕位移对齐 */
      for(const d of G.doors){
        const cx=SX(d.x), cy=SY(d.y), open=d.open;
        const len=d.w*s, dep=0.40*s;
        /* 断电安检：所有门在有人等待时显示 2 秒红色扫描（会议室也不再豁免） */
        const scanT=(G.lightState===2)?
          Math.max(0,Math.min(2,d.scanT||0)):0;
        const scanning=scanT>0&&scanT<2;
        const locked=G.lightState===2&&scanT<2;
        /* 地面滑轨 / 门槛：贴地，给"这里能过去"的方向感 */
        ctx.save();
        ctx.translate(cx,cy);
        if(!d.horiz)ctx.rotate(Math.PI/2);
        ctx.fillStyle='rgba(6,9,13,.55)';
        ctx.beginPath();ctx.roundRect(-len/2-0.06*s,-dep/2,len+0.12*s,dep,2);ctx.fill();
        ctx.fillStyle='rgba(255,176,32,.10)';
        ctx.fillRect(-len/2,-dep/2+0.5,len,Math.max(1,0.02*s));
        ctx.restore();
        /* 门顶面 */
        ctx.save();
        ctx.translate(cx,cy-LIFT);
        if(!d.horiz)ctx.rotate(Math.PI/2);
        /* 侧面厚度：只留 2px 暗边，不画正立面 */
        ctx.fillStyle='rgba(0,0,0,.55)';
        ctx.beginPath();ctx.roundRect(-len/2,-dep/2+2,len,dep,2);ctx.fill();
        ctx.fillStyle='rgba(24,31,40,.98)';
        ctx.beginPath();ctx.roundRect(-len/2,-dep/2,len,dep,2);ctx.fill();
        ctx.strokeStyle='rgba(120,140,160,.38)';ctx.lineWidth=1;
        ctx.beginPath();ctx.roundRect(-len/2,-dep/2,len,dep,2);ctx.stroke();
        ctx.save();
        ctx.beginPath();ctx.rect(-len/2+1,-dep/2+1,len-2,dep-2);ctx.clip();
        const slide=open*(len/2+0.04*s), alpha=1-open*0.55;
        if(readyIm){
          const sw=im.naturalWidth/2, sh=im.naturalHeight;
          ctx.globalAlpha=alpha;
          ctx.drawImage(im,0,0,sw,sh,-len/2-slide,-dep/2,len/2,dep);
          ctx.drawImage(im,sw,0,sw,sh,slide,-dep/2,len/2,dep);
          ctx.globalAlpha=1;
        }else{
          ctx.fillStyle='#4A5563';
          ctx.fillRect(-len/2-slide,-dep/2,len/2,dep);
          ctx.fillRect(slide,-dep/2,len/2,dep);
        }
        if(open<0.5){
          ctx.strokeStyle='rgba(255,170,90,'+(0.45+0.25*Math.sin(T*5+d.x)).toFixed(2)+')';
          ctx.lineWidth=1;
          ctx.beginPath();ctx.moveTo(0,-dep/2+1);ctx.lineTo(0,dep/2-1);ctx.stroke();
        }
        ctx.restore();
        if(scanning){
          /* 2 秒红色安检扫描：一条亮线沿门板从左扫到右 + 红色脉冲底 */
          const sx=-len/2+len*(scanT/2);
          ctx.save();
          ctx.beginPath();ctx.rect(-len/2,-dep/2,len,dep);ctx.clip();
          ctx.fillStyle='rgba(255,44,34,'+(0.13+0.09*(0.5+0.5*Math.sin(T*18))).toFixed(2)+')';
          ctx.fillRect(-len/2,-dep/2,len,dep);
          const sg=ctx.createLinearGradient(sx-0.12*s,0,sx+0.12*s,0);
          sg.addColorStop(0,'rgba(255,40,30,0)');
          sg.addColorStop(0.5,'rgba(255,96,72,.95)');
          sg.addColorStop(1,'rgba(255,40,30,0)');
          ctx.fillStyle=sg;ctx.fillRect(sx-0.12*s,-dep/2,0.24*s,dep);
          ctx.strokeStyle='rgba(255,150,130,.95)';ctx.lineWidth=1.2;
          ctx.beginPath();ctx.moveTo(sx,-dep/2);ctx.lineTo(sx,dep/2);ctx.stroke();
          ctx.restore();
        }
        /* 顶面高光 + 状态灯：从哪一侧看都一样 */
        ctx.strokeStyle='rgba(200,225,245,.34)';ctx.lineWidth=1;
        ctx.beginPath();ctx.moveTo(-len/2,-dep/2+0.5);ctx.lineTo(len/2,-dep/2+0.5);ctx.stroke();
        ctx.fillStyle=locked?'rgba(255,80,64,.98)':
          (open>0.55?'rgba(127,211,240,.95)':'rgba(255,107,97,.95)');
        ctx.beginPath();ctx.arc(len/2-0.08*s,0,Math.max(1.6,0.045*s),0,7);ctx.fill();
        if(locked){
          ctx.strokeStyle='rgba(255,90,70,.85)';ctx.lineWidth=1.2;
          ctx.beginPath();ctx.arc(len/2-0.08*s,0,Math.max(2.4,0.085*s),0,7);ctx.stroke();
        }
        ctx.restore();
      }
    }
    /* 声纹：多个声音同时出现时画多圈涟漪，穿墙可见（雾之上） */
    const WAVE_COL={step:'203,218,234',knife:'255,107,97',shot:'255,192,97',
      drag:'224,169,75',power:'127,211,240',pipe:'168,150,255',robot:'255,138,101',alarm:'255,107,97'};
    function drawWaves(d){
      if(!G||!G.waves.length)return;
      const s=VIEW.s;
      for(const w of G.waves){
        w.t=(w.t||0)+d;
        if(w.t>=w.dur)continue;
        const p=Math.max(0,Math.min(1,w.t/w.dur));
        const a=(1-p)*(w.str==null?0.8:w.str);
        const col=WAVE_COL[w.kind]||WAVE_COL.step;
        const r=(0.28+1.75*p)*s;
        ctx.strokeStyle='rgba('+col+','+(0.62*a).toFixed(2)+')';
        ctx.lineWidth=1.3+1.4*(1-p);
        ctx.beginPath();ctx.ellipse(SX(w.x),SY(w.y),r,r*0.6,0,0,7);ctx.stroke();
        if(p>0.22){
          const r2=(0.12+1.3*(p-0.22))*s;
          ctx.strokeStyle='rgba('+col+','+(0.35*a).toFixed(2)+')';
          ctx.lineWidth=1;
          ctx.beginPath();ctx.ellipse(SX(w.x),SY(w.y),r2,r2*0.6,0,0,7);ctx.stroke();
        }
        const dot=Math.max(0,4.2*(1-p));
        if(dot>0.4){
          ctx.fillStyle='rgba('+col+','+(0.85*a).toFixed(2)+')';
          ctx.beginPath();ctx.arc(SX(w.x),SY(w.y),dot,0,7);ctx.fill();
        }
      }
      G.waves=G.waves.filter(w=>w.t<w.dur);
    }
    /* 全船监控：4×3 实时画面（10 个舱室；底图裁切 + 在场人员点位），断电时整屏雪花 */
    function drawCams(T){
      const c=document.getElementById('camcv');
      if(!c)return;
      const g=c.getContext('2d');
      const W=c.width,H=c.height,pad=8,head=17;
      g.clearRect(0,0,W,H);
      g.fillStyle='#04070B';g.fillRect(0,0,W,H);
      const cols=4, rows=Math.ceil(M.rooms.length/cols);
      const tw=(W-pad*(cols+1))/cols, th=(H-pad*(rows+1))/rows;
      const base=IMG['base'], bReady=ready(base);
      const isc=base&&base.naturalWidth?base.naturalWidth/M.bounds.w:48;
      const cut=G.lightState===2;
      const rooms=M.rooms;
      rooms.forEach((r,n)=>{
        const cx=pad+(n%cols)*(tw+pad), cy=pad+Math.floor(n/cols)*(th+pad);
        const bodyY=cy+head, bodyH=th-head;
        g.save();
        g.beginPath();g.roundRect(cx,cy,tw,th,5);g.clip();
        g.fillStyle='#05090E';g.fillRect(cx,cy,tw,th);
        const inRoom=G.agents.filter(a=>a.alive&&!a.downed&&roomIdAt(a.x,a.y)===r.id).length;
        g.fillStyle='rgba(10,18,26,.96)';g.fillRect(cx,cy,tw,head);
        g.textBaseline='middle';
        g.font='600 10px system-ui';g.textAlign='left';
        g.fillStyle=cut?'#8C97A6':'#BFE9F7';g.fillText(r.name,cx+6,cy+head/2+0.5);
        g.font='500 9px system-ui';g.textAlign='right';
        g.fillStyle=cut?'#FF6B61':'#5FE0A8';
        g.fillText(cut?'NO SIGNAL':(inRoom?'● '+inRoom+' 人':'● 无人'),cx+tw-6,cy+head/2+0.5);
        if(cut){
          for(let i=0;i<90;i++){
            const qx=cx+((i*97+Math.floor(T*37)*13)%Math.max(1,tw));
            const qy=bodyY+((i*53+Math.floor(T*29)*7)%Math.max(1,bodyH));
            g.fillStyle='rgba(190,210,225,'+(0.05+((i*7)%10)/28).toFixed(2)+')';
            g.fillRect(qx,qy,2,1);
          }
          g.fillStyle='rgba(255,107,97,.92)';g.font='600 13px system-ui';g.textAlign='center';
          g.fillText('信号中断 · 电闸断开',cx+tw/2,bodyY+bodyH/2);
        }else if(bReady){
          const pr=1.4;
          const srx=Math.max(0,(r.rect[0]-pr)*isc), sry=Math.max(0,(r.rect[1]-pr)*isc);
          const srw=(r.rect[2]+pr*2)*isc, srh=(r.rect[3]+pr*2)*isc;
          const k=Math.min(tw/srw,bodyH/srh);
          const dw=srw*k,dh=srh*k,dx=cx+(tw-dw)/2,dy=bodyY+(bodyH-dh)/2;
          g.drawImage(base,srx,sry,srw,srh,dx,dy,dw,dh);
          g.fillStyle=G.lit[r.id]?'rgba(8,20,26,.08)':'rgba(2,8,12,.50)';
          g.fillRect(dx,dy,dw,dh);
          g.fillStyle='rgba(74,226,168,.045)';g.fillRect(dx,dy,dw,dh);
          const wpx=isc*k;
          g.save();
          g.beginPath();g.rect(cx+2,bodyY+2,tw-4,bodyH-4);g.clip();
          for(const a of G.agents){
            if(roomIdAt(a.x,a.y)!==r.id)continue;
            if(!a.alive&&a.bodyGone)continue;
            const ax=dx+(a.x-(r.rect[0]-pr))*wpx, ay=dy+(a.y-(r.rect[1]-pr))*wpx;
            if(ax<cx-2||ax>cx+tw+2||ay<bodyY-2||ay>cy+th+2)continue;
            const im=IMG['cr_'+((a.i%15)+1)];
            const w=Math.max(5,wpx*1.25),h=w*160/96;
            if(!a.alive||a.downed){
              if(ready(im)){
                g.save();g.translate(ax,ay);g.rotate(-Math.PI/2);
                g.globalAlpha=a.alive?0.9:0.62;
                g.drawImage(im,0,2*160,96,160,-w/2,-h/2,w,h);
                g.restore();g.globalAlpha=1;
              }else{
                g.strokeStyle=a.alive?'#FF8A80':'rgba(205,150,150,.72)';g.lineWidth=1.6;
                g.beginPath();g.moveTo(ax-3,ay-3);g.lineTo(ax+3,ay+3);
                g.moveTo(ax+3,ay-3);g.lineTo(ax-3,ay+3);g.stroke();
              }
              continue;
            }
            if(ready(im)){
              const row=ROW[a.dir]||2,fr=a.moving?(Math.floor(T*7)%4):0;
              g.drawImage(im,fr*96,row*160,96,160,ax-w/2,ay-h*0.86,w,h);
            }else{
              g.fillStyle=a===G.me?'#F0C674':'#DDE6F0';
              g.beginPath();g.arc(ax,ay,2.6,0,7);g.fill();
              g.strokeStyle='rgba(0,0,0,.6)';g.lineWidth=0.8;g.stroke();
            }
            if(a.detained){g.strokeStyle='#7FD3F0';g.lineWidth=1;g.beginPath();g.arc(ax,ay,4.6,0,7);g.stroke();}
          }
          g.restore();
          const sy=bodyY+((T*36)%Math.max(1,bodyH));
          g.fillStyle='rgba(120,230,190,.10)';g.fillRect(cx,sy,tw,1.2);
        }else{
          g.fillStyle='#8C97A6';g.font='600 12px system-ui';g.textAlign='center';
          g.fillText('画面载入中…',cx+tw/2,bodyY+bodyH/2);
        }
        g.strokeStyle=cut?'rgba(255,107,97,.35)':'rgba(90,170,220,.35)';
        g.lineWidth=1;g.strokeRect(cx+0.5,cy+0.5,tw-1,th-1);
        g.restore();
        if(!cut){
          g.fillStyle='rgba(255,90,80,'+(0.35+0.5*(0.5+0.5*Math.sin(T*4))).toFixed(2)+')';
          g.beginPath();g.arc(cx+tw-8,cy+th-8,2.4,0,7);g.fill();
        }
      });
      g.fillStyle='rgba(140,160,180,.6)';g.font='500 9px system-ui';
      g.textAlign='right';g.textBaseline='middle';
      g.fillText('CCTV · 只显示在场人员，不显示身份 · '+(cut?'OFFLINE':'LIVE'),W-pad,H-4);
    }

    function pill(text,x,y,accent,fg){
      ctx.font='500 12px system-ui';ctx.textAlign='center';ctx.textBaseline='middle';
      const w=ctx.measureText(text).width+16;
      ctx.fillStyle='rgba(8,11,16,.84)';
      ctx.beginPath();ctx.roundRect(x-w/2,y-10,w,20,6);ctx.fill();
      ctx.strokeStyle=accent;ctx.lineWidth=1;ctx.stroke();
      ctx.fillStyle=fg||'#C9D1DB';ctx.fillText(text,x,y+0.5);
    }

    /* ---- 动作贴片：工具 / 武器 / 命中特效（纯视觉，不改判定） ---- */
    /* 开口扳手（维修专用）：手柄 + C 形开口头，开口朝 +X；原点在手柄末端，
       外层直接 rotate 就是「以握持点为轴拧动」。深色描边保证在暗房地板也读得清。 */
    function drawWrenchShape(len,fill,edge){
      const w=len*0.13;
      const grip=len*0.54, headR=len*0.26;
      ctx.lineCap='round';ctx.lineJoin='round';
      /* 手柄（先描深色粗线，再叠亮色细线 = 免费描边） */
      ctx.strokeStyle=edge;ctx.lineWidth=w*2.0;
      ctx.beginPath();ctx.moveTo(0,0);ctx.lineTo(grip,0);ctx.stroke();
      ctx.strokeStyle=fill;ctx.lineWidth=w;
      ctx.beginPath();ctx.moveTo(0,0);ctx.lineTo(grip,0);ctx.stroke();
      /* 开口头：缺口朝外，两段弧 + 两条直边 */
      const hx=grip+headR*0.55;
      ctx.strokeStyle=edge;ctx.lineWidth=w*2.0;
      ctx.beginPath();ctx.arc(hx,0,headR,0.32*Math.PI,1.68*Math.PI);ctx.stroke();
      ctx.strokeStyle=fill;ctx.lineWidth=w;
      ctx.beginPath();ctx.arc(hx,0,headR,0.32*Math.PI,1.68*Math.PI);ctx.stroke();
      /* 开口两侧的钳口短边 */
      ctx.strokeStyle=edge;ctx.lineWidth=w*1.7;
      for(const sgn of [-1,1]){
        ctx.beginPath();
        ctx.moveTo(hx+Math.cos(sgn*0.32*Math.PI)*headR,Math.sin(sgn*0.32*Math.PI)*headR);
        ctx.lineTo(hx+headR*1.28,Math.sin(sgn*0.30*Math.PI)*headR*0.86);
        ctx.stroke();
      }
      ctx.strokeStyle=fill;ctx.lineWidth=w*0.9;
      for(const sgn of [-1,1]){
        ctx.beginPath();
        ctx.moveTo(hx+Math.cos(sgn*0.32*Math.PI)*headR,Math.sin(sgn*0.32*Math.PI)*headR);
        ctx.lineTo(hx+headR*1.28,Math.sin(sgn*0.30*Math.PI)*headR*0.86);
        ctx.stroke();
      }
    }
    function drawIcon(icon,c,x,y,s,ang,lw){
      ctx.save();ctx.translate(x,y);ctx.rotate(ang||0);
      ctx.strokeStyle=c;ctx.fillStyle=c;ctx.lineWidth=lw||2;ctx.lineCap='round';ctx.lineJoin='round';
      if(icon==='wrench'){
        ctx.beginPath();ctx.moveTo(-s*0.48,s*0.48);ctx.lineTo(s*0.20,-s*0.16);ctx.stroke();
        ctx.beginPath();ctx.arc(s*0.34,-s*0.30,s*0.24,-0.9,2.0);ctx.stroke();
      }else if(icon==='cross'){
        ctx.fillRect(-s*0.11,-s*0.46,s*0.22,s*0.92);
        ctx.fillRect(-s*0.46,-s*0.11,s*0.92,s*0.22);
      }else if(icon==='bullet'){
        ctx.beginPath();ctx.roundRect(-s*0.16,-s*0.36,s*0.32,s*0.72,s*0.12);ctx.fill();
        ctx.beginPath();ctx.arc(0,-s*0.36,s*0.16,Math.PI,0);ctx.fill();
      }else if(icon==='lens'){
        ctx.beginPath();ctx.arc(0,0,s*0.28,0,7);ctx.stroke();
        ctx.beginPath();ctx.moveTo(s*0.2,s*0.2);ctx.lineTo(s*0.46,s*0.46);ctx.stroke();
      }else if(icon==='bolt'){
        ctx.beginPath();ctx.moveTo(-s*0.14,-s*0.48);ctx.lineTo(s*0.16,-s*0.06);ctx.lineTo(0,-s*0.06);
        ctx.lineTo(s*0.14,s*0.48);ctx.lineTo(-s*0.16,0);ctx.lineTo(0,0);ctx.closePath();ctx.fill();
      }
      ctx.restore();
    }
    function drawWork(a,T,ghost){
      const x=SX(a.x),y=SY(a.y),st=workStyle(a);
      const total=(a._dur||1), k=1-Math.max(0,a.doing)/total;
      ctx.save();
      if(ghost)ctx.globalAlpha=0.55;
      ctx.fillStyle=st.glow;
      ctx.beginPath();ctx.ellipse(x,y,1.5*VIEW.s,0.8*VIEW.s,0,0,7);ctx.fill();
      ctx.strokeStyle='rgba(255,255,255,.16)';ctx.lineWidth=4;
      ctx.beginPath();ctx.arc(x,y,1.05*VIEW.s,0,7);ctx.stroke();
      ctx.strokeStyle=st.c;ctx.lineWidth=4.5;ctx.lineCap='round';
      ctx.beginPath();ctx.arc(x,y,1.05*VIEW.s,-Math.PI/2,-Math.PI/2+k*Math.PI*2);ctx.stroke();
      const aEnd=-Math.PI/2+k*Math.PI*2;
      ctx.fillStyle=st.c;
      ctx.beginPath();ctx.arc(x+Math.cos(aEnd)*1.05*VIEW.s,y+Math.sin(aEnd)*1.05*VIEW.s,4,0,7);ctx.fill();
      const bob=Math.sin(T*9)*0.09*VIEW.s;
      const tx=x+0.80*VIEW.s,ty=y-0.62*VIEW.s+bob;
      const ga=ctx.globalAlpha;
      ctx.globalAlpha=ga*0.16;ctx.fillStyle=st.c;
      ctx.beginPath();ctx.arc(tx,ty,0.46*VIEW.s,0,7);ctx.fill();
      ctx.globalAlpha=ga;
      /* 维修动作＝真的握一把扳手在拧（2026-10-31 改）：
         以前只在右上角挂一个「扳手小图标」，看不出在拧什么。现在换成
         大号开口扳手，以手柄末端为轴做往复拧动，再沿拧动弧线补一圈虚线，
         配合下面的火花就能读出「在拧螺丝」而不是「站在那儿不动」。 */
      if(st.icon==='wrench'){
        const hx=x+0.44*VIEW.s, hy=y-0.50*VIEW.s;
        const swing=-0.58+Math.sin(T*7.2)*0.52;
        ctx.save();ctx.shadowColor='rgba(8,12,16,.85)';ctx.shadowBlur=6;
        ctx.translate(hx,hy);ctx.rotate(swing);
        /* 2026-11-01：手画的扳手换成 Blender 渲染的贴图（材质来自 SDXL 的 panel-metal）。
           贴图里手柄末端在左缘，所以把图片左边中点对准握持点，
           这样 rotate 就是以"手握的位置"为轴拧，和旧版手画的枢轴一致。 */
        const wim=IMG['tool_wrench'];
        if(ready(wim)){
          /* 尺寸放大到 1.3 格：512 贴图里扳手只占中间一条横带，
             按 1.0 格画出来会比角色还细。再叠一层暖色滤镜，
             否则浅色金属在医疗间这种亮地板上直接糊掉（旧版是暖黄 + 深描边，读得清）。 */
          const wl=1.30*VIEW.s, wh=wl;
          ctx.save();
          ctx.filter='brightness(1.18) saturate(0.9) sepia(0.42)';
          ctx.drawImage(wim,-wl*0.055,-wh*0.5,wl,wh);
          ctx.restore();
        }else{
          drawWrenchShape(0.86*VIEW.s,'#FFE8B0','#6E5522');
        }
        ctx.restore();
        /* 拧动弧线：从握持点扫出去，暗示“螺纹在转” */
        ctx.save();
        ctx.strokeStyle='rgba(255,232,176,'+(0.22+0.16*Math.sin(T*9)).toFixed(2)+')';
        ctx.lineWidth=2;ctx.setLineDash([0.09*VIEW.s,0.12*VIEW.s]);
        ctx.beginPath();ctx.arc(hx,hy,0.72*VIEW.s,swing-0.46,swing+0.46);ctx.stroke();
        ctx.setLineDash([]);
        ctx.restore();
      }else{
        ctx.save();ctx.shadowColor='rgba(8,12,16,.85)';ctx.shadowBlur=5;
        drawIcon(st.icon,st.c,tx,ty,0.66*VIEW.s,-0.5+Math.sin(T*4.5)*0.28,3.2);
        ctx.restore();
      }
      /* 工具接触点的连续火花，比一次性粒子更能读出「正在修」 */
      if(a._doing==='task'||a._doing==='breaker'||a._doing==='fake'){
        const hx=x+0.72*VIEW.s,hy=y-0.48*VIEW.s;
        ctx.lineCap='round';
        for(let i=0;i<7;i++){
          const ph=(T*2.8+i*0.17)%1, ang=-1.35+i*0.45;
          ctx.strokeStyle='rgba(210,244,255,'+(0.85*(1-ph)).toFixed(2)+')';ctx.lineWidth=2.2;
          const r0=(0.40+0.34*ph)*VIEW.s, r1=r0+0.18*VIEW.s;
          ctx.beginPath();
          ctx.moveTo(hx+Math.cos(ang)*r0,hy+Math.sin(ang)*r0*0.7);
          ctx.lineTo(hx+Math.cos(ang)*r1,hy+Math.sin(ang)*r1*0.7);
          ctx.stroke();
        }
        ctx.fillStyle='rgba(255,255,255,'+(0.55+0.35*Math.sin(T*14)).toFixed(2)+')';
        ctx.beginPath();ctx.arc(hx,hy,2.6,0,7);ctx.fill();
      }
      ctx.restore();
    }
    function drawWeapon(a,T){
      if(!a.alive||a.downed)return;
      const isMe=a===G.me, acting=a.act&&(a.act.kind==='stab'||a.act.kind==='shoot');
      if(!isMe&&!acting&&!G.dev)return;
      const x=SX(a.x),y=SY(a.y);
      const stabAct=!!(a.act&&a.act.kind==='stab');
      const shootAct=!!(a.act&&a.act.kind==='shoot');
      const showGun=a.bullet>0||shootAct;
      /* 外观与人类完全一致：异形空闲时不亮刀，只有真实出刀动作才画刀；
         有子弹的人/异形都画同一把枪；空手时都空手。 */
      if(a.alien&&stabAct){
        let ang=dirAng(a);
        if(a.act)ang=a.act.ang+(a.act.t/a.act.dur-0.5)*1.8;
        const hx=x+Math.cos(ang)*0.32*VIEW.s,hy=y+Math.sin(ang)*0.32*VIEW.s-0.20*VIEW.s;
        ctx.save();ctx.lineCap='round';
        ctx.strokeStyle='#E9EDF4';ctx.lineWidth=2.4;
        ctx.beginPath();ctx.moveTo(hx,hy);ctx.lineTo(hx+Math.cos(ang)*0.36*VIEW.s,hy+Math.sin(ang)*0.36*VIEW.s);ctx.stroke();
        ctx.strokeStyle='#8A94A3';ctx.lineWidth=1;
        ctx.beginPath();ctx.moveTo(hx,hy);ctx.lineTo(hx+Math.cos(ang)*0.36*VIEW.s,hy+Math.sin(ang)*0.36*VIEW.s);ctx.stroke();
        ctx.restore();
      }else if(showGun||shootAct){
        let ang=dirAng(a);
        if(a.act&&a.act.kind==='shoot')ang=a.act.ang;
        const hx=x+Math.cos(ang)*0.28*VIEW.s,hy=y+Math.sin(ang)*0.28*VIEW.s-0.16*VIEW.s;
        ctx.save();ctx.lineCap='round';
        ctx.strokeStyle='#3A4556';ctx.lineWidth=4;
        ctx.beginPath();ctx.moveTo(hx,hy);ctx.lineTo(hx+Math.cos(ang)*0.28*VIEW.s,hy+Math.sin(ang)*0.28*VIEW.s);ctx.stroke();
        ctx.strokeStyle='#C9D1DB';ctx.lineWidth=1.3;
        ctx.beginPath();ctx.moveTo(hx,hy);ctx.lineTo(hx+Math.cos(ang)*0.24*VIEW.s,hy+Math.sin(ang)*0.24*VIEW.s);ctx.stroke();
        ctx.restore();
      }
    }

    /* ---- 加色混合特效层（2026-11-01）----
       贴图由 tools/gen-facility-sprites.py --fx 用本地 SDXL 出图，**纯黑底**。
       画的时候 globalCompositeOperation='lighter'：黑色不贡献任何亮度，天然等于透明，
       光晕的衰减能完整保留 —— 白底抠图会把外圈削成一圈硬边，这是特效不能走抠图的原因。
       贴图没就绪（file:// 冷启动）时返回 false，调用方回退到原来的矢量画法。 */
    function drawFxSprite(key,x,y,w,h,alpha,rot,frame,grid){
      const im=IMG[key];
      if(!ready(im))return false;
      const n=grid||1, tot=n*n;
      const f=n>1?(((frame|0)%tot)+tot)%tot:0;
      const sw=im.naturalWidth/n, sh=im.naturalHeight/n;
      const sx=(f%n)*sw, sy=((f/n)|0)*sh;
      ctx.save();
      ctx.globalCompositeOperation='lighter';
      ctx.globalAlpha=Math.max(0,Math.min(1,alpha));
      ctx.translate(x,y);
      if(rot)ctx.rotate(rot);
      ctx.drawImage(im,sx,sy,sw,sh,-w/2,-h/2,w,h);
      ctx.restore();
      return true;
    }
    /* ---- 特效层：在角色之后、战争迷雾之前绘制 ---- */
    function drawFx(d,T){
      for(const f of G.fx){
        f.t-=d;
        if(f.t<=0)continue;
        if(f.x!=null&&!visibleAt(f.x,f.y))continue;
        if(f.type==='tracer'&&!(visibleAt(f.x1,f.y1)||visibleAt(f.x2,f.y2)))continue;
        const D=f.dur||0.6,p=1-Math.max(0,f.t)/D,a=1-p;
        if(f.type==='slash'){
          const a0=f.ang-1.6+2.6*p;
          const rO=(0.62+0.95*p)*VIEW.s, rI=(0.38+0.75*p)*VIEW.s;
          ctx.save();ctx.translate(SX(f.x),SY(f.y));ctx.lineCap='round';
          ctx.beginPath();
          ctx.arc(0,0,rO,a0-0.55,a0+0.55);
          ctx.arc(0,0,rI,a0+0.55,a0-0.55,true);
          ctx.closePath();
          ctx.fillStyle='rgba(200,225,255,'+(0.30*a).toFixed(2)+')';ctx.fill();
          ctx.strokeStyle='rgba(255,245,235,'+(0.95*a).toFixed(2)+')';ctx.lineWidth=1.5+6*a;
          ctx.beginPath();ctx.arc(0,0,rO,a0-0.5,a0+0.5);ctx.stroke();
          ctx.strokeStyle='rgba(224,87,79,'+(0.85*a).toFixed(2)+')';ctx.lineWidth=2;
          ctx.beginPath();ctx.arc(0,0,rI,a0-0.62,a0+0.62);ctx.stroke();
          ctx.fillStyle='rgba(255,255,255,'+a.toFixed(2)+')';
          ctx.beginPath();ctx.arc(Math.cos(a0)*rO,Math.sin(a0)*rO,3.2,0,7);ctx.fill();
          ctx.restore();
        }else if(f.type==='blood'){
          for(let i=0;i<12;i++){
            const sp=0.4+(((i*37)%10)/10)*1.2;
            const ang=f.ang+(((i*53)%100)/100-0.5)*1.4;
            const dist=sp*(0.25+k1(p))*VIEW.s;
            const px=SX(f.x)+Math.cos(ang)*dist, py=SY(f.y)+Math.sin(ang)*dist+p*p*0.28*VIEW.s;
            ctx.fillStyle='rgba(150,20,20,'+(0.85*a).toFixed(2)+')';
            ctx.beginPath();ctx.ellipse(px,py,3.1*(1-p*0.45),1.9*(1-p*0.45),ang,0,7);ctx.fill();
          }
        }else if(f.type==='tracer'){
          const x1=SX(f.x1),y1=SY(f.y1),x2=SX(f.x2),y2=SY(f.y2);
          ctx.save();ctx.lineCap='round';
          ctx.strokeStyle='rgba(255,225,140,'+(0.26*a).toFixed(2)+')';ctx.lineWidth=11;
          ctx.beginPath();ctx.moveTo(x1,y1);ctx.lineTo(x2,y2);ctx.stroke();
          const g=ctx.createLinearGradient(x1,y1,x2,y2);
          g.addColorStop(0,'rgba(255,250,220,'+a.toFixed(2)+')');
          g.addColorStop(0.75,'rgba(255,220,120,'+(0.85*a).toFixed(2)+')');
          g.addColorStop(1,'rgba(255,255,255,0)');
          ctx.strokeStyle=g;ctx.lineWidth=2+3.6*a;
          ctx.beginPath();ctx.moveTo(x1,y1);ctx.lineTo(x2,y2);ctx.stroke();
          ctx.restore();
        }else if(f.type==='muzzle'){
          const x=SX(f.x),y=SY(f.y),g=ctx.createRadialGradient(x,y,0,x,y,0.9*VIEW.s);
          g.addColorStop(0,'rgba(255,250,210,'+a.toFixed(2)+')');
          g.addColorStop(0.35,'rgba(255,200,90,'+(0.55*a).toFixed(2)+')');
          g.addColorStop(1,'rgba(255,180,60,0)');
          ctx.fillStyle=g;ctx.beginPath();ctx.arc(x,y,0.9*VIEW.s,0,7);ctx.fill();
          ctx.strokeStyle='rgba(255,240,180,'+a.toFixed(2)+')';ctx.lineWidth=2;
          for(let i=0;i<4;i++){
            const ang=(f.ang||0)+i*Math.PI/2+0.3, r0=0.12*VIEW.s, r1=(0.5+0.4*a)*VIEW.s;
            ctx.beginPath();ctx.moveTo(x+Math.cos(ang)*r0,y+Math.sin(ang)*r0);
            ctx.lineTo(x+Math.cos(ang)*r1,y+Math.sin(ang)*r1);ctx.stroke();
          }
        }else if(f.type==='impact'){
          const x=SX(f.x),y=SY(f.y);
          ctx.strokeStyle='rgba(255,210,160,'+(0.9*a).toFixed(2)+')';ctx.lineWidth=2;
          ctx.beginPath();ctx.arc(x,y,(0.12+0.7*p)*VIEW.s,0,7);ctx.stroke();
          ctx.strokeStyle='rgba(255,235,190,'+(0.7*a).toFixed(2)+')';ctx.lineWidth=1.5;
          for(let i=0;i<6;i++){
            const ang=i*1.047+0.4, r0=(0.18+0.5*p)*VIEW.s, r1=(0.3+0.65*p)*VIEW.s;
            ctx.beginPath();ctx.moveTo(x+Math.cos(ang)*r0,y+Math.sin(ang)*r0);
            ctx.lineTo(x+Math.cos(ang)*r1,y+Math.sin(ang)*r1);ctx.stroke();
          }
          ctx.fillStyle='rgba(190,30,30,'+a.toFixed(2)+')';
          ctx.beginPath();ctx.arc(x,y,2.4,0,7);ctx.fill();
        }else if(f.type==='done'){
          const x=SX(f.x),y=SY(f.y);
          /* 维修/任务完成：**只留细小电流**（2026-11-01 用户：原来那圈全息光环光污染）。
             换成同一条电弧贴图的小尺寸版本，透明度压到 0.42、尺寸只有 0.35 格，
             并且随进度快速衰减 —— 读起来是"设备收尾时啪一下的小电弧"，
             不是"原地放了个大招"。 */
          const sz=(0.34+0.26*p)*VIEW.s;
          drawFxSprite('fx_arc',x,y,sz,sz,a*0.42*0.55,0,Math.floor(f.t*30),2);
          /* ✓ 是"完成"的语义标记，不是特效本体，保留但收小、收暗 */
          ctx.font='600 12px system-ui';ctx.textAlign='center';ctx.textBaseline='middle';
          ctx.fillStyle='rgba(214,236,226,'+(a*0.85).toFixed(2)+')';
          ctx.fillText('✓',x-0.72*VIEW.s,y-(1.32+0.28*p)*VIEW.s);
        }else if(f.type==='qual'){
          const qr=0.40*VIEW.s;
          const x=SX(f.x)+1.45*VIEW.s,y=SY(f.y)-(2.05+0.6*p)*VIEW.s;
          ctx.strokeStyle='rgba(240,198,116,'+a.toFixed(2)+')';ctx.lineWidth=2.2;
          ctx.beginPath();ctx.arc(x,y,qr,0,7);ctx.stroke();
          ctx.fillStyle='rgba(240,198,116,'+(0.20*a).toFixed(2)+')';
          ctx.beginPath();ctx.arc(x,y,qr,0,7);ctx.fill();
          ctx.font='600 13px system-ui';ctx.textAlign='center';ctx.textBaseline='middle';
          ctx.fillStyle='rgba(255,244,214,'+a.toFixed(2)+')';
          ctx.strokeStyle='rgba(8,10,14,'+(0.6*a).toFixed(2)+')';ctx.lineWidth=3;
          ctx.strokeText('申请单 +1',x,y+1);
          ctx.fillText('申请单 +1',x,y+1);
          ctx.strokeStyle='rgba(240,198,116,'+(0.55*a).toFixed(2)+')';ctx.lineWidth=1.8;
          ctx.beginPath();ctx.ellipse(SX(f.x),SY(f.y),(0.5+1.0*p)*VIEW.s,(0.3+0.55*p)*VIEW.s,0,0,7);ctx.stroke();
        }else if(f.type==='pickup'){
          const isMed=f.item==='med';
          const c=isMed?'#3FBF8C':'#E0A94B';
          const rgba=isMed?'63,191,140':'224,169,75';
          const x=SX(f.x),y=SY(f.y);
          ctx.strokeStyle='rgba('+rgba+','+(0.55*a).toFixed(2)+')';ctx.lineWidth=2;
          ctx.beginPath();ctx.ellipse(x,y,(0.45+0.6*p)*VIEW.s,(0.28+0.35*p)*VIEW.s,0,0,7);ctx.stroke();
          const pg=ctx.createLinearGradient(x,y-1.8*VIEW.s,x,y);
          pg.addColorStop(0,'rgba('+rgba+',0)');
          pg.addColorStop(0.6,'rgba('+rgba+','+(0.30*a).toFixed(2)+')');
          pg.addColorStop(1,'rgba('+rgba+','+(0.08*a).toFixed(2)+')');
          ctx.fillStyle=pg;
          ctx.beginPath();
          ctx.moveTo(x-0.18*VIEW.s,y);ctx.lineTo(x-0.32*VIEW.s,y-1.8*VIEW.s);
          ctx.lineTo(x+0.32*VIEW.s,y-1.8*VIEW.s);ctx.lineTo(x+0.18*VIEW.s,y);ctx.closePath();ctx.fill();
          ctx.fillStyle='rgba('+rgba+','+(0.22*a).toFixed(2)+')';
          ctx.beginPath();ctx.arc(x,y-1.0*VIEW.s,0.62*VIEW.s,0,7);ctx.fill();
          drawIcon(isMed?'cross':'bullet',c,x,y-(0.8+0.5*p)*VIEW.s,0.76*VIEW.s,0);
          ctx.font='600 12px system-ui';ctx.textAlign='center';ctx.textBaseline='middle';
          ctx.lineWidth=3;ctx.strokeStyle='rgba(8,12,10,.75)';
          const label=isMed?'拿到医疗包':'拿到子弹';
          ctx.strokeText(label,x,y-(1.9+0.25*p)*VIEW.s);
          ctx.fillStyle='rgba(235,245,240,'+a.toFixed(2)+')';
          ctx.fillText(label,x,y-(1.9+0.25*p)*VIEW.s);
        }else if(f.type==='power'){
          const x=SX(f.x),y=SY(f.y);
          /* 主视觉：Blender 渲染的电弧图集（4 帧）。没就绪才回退矢量。 */
          const sz=(1.1+1.5*p)*VIEW.s;
          const fr=Math.floor(f.t*26);
          if(!drawFxSprite('fx_arc',x,y,sz,sz,a*0.95,f.t*1.7,fr,2)){
            ctx.strokeStyle='rgba(127,211,240,'+a.toFixed(2)+')';ctx.lineWidth=2.4;
            ctx.beginPath();ctx.arc(x,y,(0.5+1.4*p)*VIEW.s,0,7);ctx.stroke();
          }
          /* 冲击环保留：电弧负责"电"，环负责"波及范围"，两者不重复 */
          ctx.strokeStyle='rgba(127,211,240,'+(a*0.5).toFixed(2)+')';ctx.lineWidth=1.6;
          ctx.beginPath();ctx.arc(x,y,(0.5+1.4*p)*VIEW.s,0,7);ctx.stroke();
        }else if(f.type==='heal'){
          const x=SX(f.x),y=SY(f.y);
          ctx.strokeStyle='rgba(63,191,140,'+a.toFixed(2)+')';ctx.lineWidth=2.4;
          ctx.beginPath();ctx.arc(x,y,(0.35+1.0*p)*VIEW.s,0,7);ctx.stroke();
          drawIcon('cross','#7FE3B4',x,y-(0.3+0.8*p)*VIEW.s,0.5*VIEW.s,0);
        }else if(f.type==='search'){
          const x=SX(f.x),y=SY(f.y);
          ctx.strokeStyle='rgba(127,211,240,'+(0.8*a).toFixed(2)+')';ctx.lineWidth=2;
          ctx.beginPath();ctx.arc(x,y,(0.3+0.9*p)*VIEW.s,0,7);ctx.stroke();
          drawIcon('lens','#BFE9F7',x,y-(0.4+0.5*p)*VIEW.s,0.45*VIEW.s,0);
        }else if(f.type==='workSpark'){
          const x=SX(f.x),y=SY(f.y)-0.2*VIEW.s;
          /* 主视觉：SDXL 焊花（加色混合）；没就绪回退到矢量短线 */
          const sz=(0.58+0.26*p)*VIEW.s;
          /* 4 帧循环：按剩余时间推进，同一个火花播完正好走完一轮 */
          const fr=Math.floor((1-p)*4*2.2);
          if(!drawFxSprite('fx_weld',x,y,sz,sz,a*0.52,f.ang||0,fr,2)){
            ctx.strokeStyle='rgba(180,230,255,'+(0.9*a).toFixed(2)+')';ctx.lineWidth=1.5;ctx.lineCap='round';
            for(let i=0;i<3;i++){
              const ang=f.ang+i*2.1, r0=(0.1+0.5*p)*VIEW.s;
              ctx.beginPath();
              ctx.moveTo(x+Math.cos(ang)*r0,y+Math.sin(ang)*r0*0.6);
              ctx.lineTo(x+Math.cos(ang)*(r0+0.14*VIEW.s),y+Math.sin(ang)*(r0+0.14*VIEW.s)*0.6-0.06*VIEW.s);
              ctx.stroke();
            }
          }
        }else if(f.type==='spark'){
          const ang0=Math.abs(Math.sin(f.t*18));
          const sz=(0.9+0.5*ang0)*VIEW.s;
          if(!drawFxSprite('fx_arc',SX(f.x),SY(f.y),sz,sz,(0.55+0.45*ang0)*a,
              f.t*9,Math.floor(f.t*22),2)){
            ctx.strokeStyle='rgba(150,220,255,'+(ang0*0.95).toFixed(2)+')';ctx.lineWidth=2;
            for(let i=0;i<5;i++){
              const ang=f.t*7+i*1.7, r0=0.25*VIEW.s, r1=(0.7+ang0*0.5)*VIEW.s;
              ctx.beginPath();
              ctx.moveTo(SX(f.x)+Math.cos(ang)*r0,SY(f.y)+Math.sin(ang)*r0);
              ctx.lineTo(SX(f.x)+Math.cos(ang)*r1,SY(f.y)+Math.sin(ang)*r1);
              ctx.stroke();
            }
          }
        }else if(f.type==='shield'){
          ctx.strokeStyle='rgba(127,211,240,'+(0.9*a).toFixed(2)+')';ctx.lineWidth=3;
          ctx.beginPath();ctx.arc(SX(f.x),SY(f.y),(0.4+1.6*p)*VIEW.s,0,7);ctx.stroke();
          ctx.strokeStyle='rgba(127,211,240,'+(0.5*a).toFixed(2)+')';
          ctx.beginPath();ctx.arc(SX(f.x),SY(f.y),1.1*VIEW.s,0,7);ctx.stroke();
        }else if(f.type==='healBeam'){
          const x1=SX(f.x1),y1=SY(f.y1),x2=SX(f.x2),y2=SY(f.y2);
          ctx.save();ctx.setLineDash([5,4]);ctx.lineDashOffset=-T*30;
          ctx.strokeStyle='rgba(127,227,180,'+(0.65*a).toFixed(2)+')';ctx.lineWidth=2.2;
          ctx.beginPath();ctx.moveTo(x1,y1);ctx.lineTo(x2,y2);ctx.stroke();
          ctx.setLineDash([]);
          ctx.strokeStyle='rgba(127,227,180,'+(0.45*a).toFixed(2)+')';ctx.lineWidth=1.4;
          ctx.beginPath();ctx.arc(x2,y2,(0.35+0.8*p)*VIEW.s,0,7);ctx.stroke();
          ctx.restore();
        }else if(f.type==='detain'){
          const x1=SX(f.x1),y1=SY(f.y1),x2=SX(f.x2),y2=SY(f.y2);
          ctx.strokeStyle='rgba(255,138,101,'+(0.75*a).toFixed(2)+')';ctx.lineWidth=2.4;
          ctx.beginPath();ctx.moveTo(x1,y1);ctx.lineTo(x2,y2);ctx.stroke();
          ctx.strokeStyle='rgba(255,107,97,'+(0.85*a).toFixed(2)+')';ctx.lineWidth=2;
          ctx.beginPath();ctx.arc(x2,y2,(0.4+0.9*p)*VIEW.s,0,7);ctx.stroke();
          ctx.setLineDash([3,3]);
          ctx.strokeStyle='rgba(255,180,160,'+(0.5*a).toFixed(2)+')';ctx.lineWidth=1.2;
          ctx.beginPath();ctx.arc(x2,y2,0.52*VIEW.s,0,7);ctx.stroke();
          ctx.setLineDash([]);
        }else if(f.type==='alarm'){
          const x=SX(f.x),y=SY(f.y);
          for(let i=0;i<3;i++){
            const k=Math.max(0,Math.min(1,p-i*0.18));
            if(k<=0)continue;
            ctx.strokeStyle='rgba(255,107,97,'+(0.55*(1-k)*a).toFixed(2)+')';ctx.lineWidth=2;
            ctx.beginPath();ctx.arc(x,y,(0.4+1.5*k)*VIEW.s,0,7);ctx.stroke();
          }
        }else if(f.type==='pipefx'){
          const x=SX(f.x),y=SY(f.y);
          for(let i=0;i<3;i++){
            const k=Math.max(0,Math.min(1,p-i*0.15));
            if(k<=0)continue;
            ctx.strokeStyle='rgba(168,150,255,'+(0.7*(1-k)*a).toFixed(2)+')';ctx.lineWidth=2;
            ctx.beginPath();ctx.ellipse(x,y,(0.3+1.1*k)*VIEW.s,(0.2+0.7*k)*VIEW.s,0,0,7);ctx.stroke();
          }
        }else if(f.type==='knife'){
          ctx.strokeStyle='rgba(224,87,79,'+a.toFixed(2)+')';ctx.lineWidth=3;
          ctx.beginPath();ctx.arc(SX(f.x),SY(f.y),(0.3+1.3*p)*VIEW.s,0,7);ctx.stroke();
        }else if(f.type==='shot'){
          ctx.strokeStyle='rgba(255,235,150,'+a.toFixed(2)+')';ctx.lineWidth=2;
          ctx.beginPath();ctx.moveTo(SX(f.x1),SY(f.y1));ctx.lineTo(SX(f.x2),SY(f.y2));ctx.stroke();
        }
      }
      G.fx=G.fx.filter(f=>f.t>0);
    }
    /* 头顶常显「席位号 + 名字」；编号永远在前，会议里也用同一套标签 */
    let TAG_RECTS=[];
    function drawNameTag(a,x,y,isMe){
      const no=seatNo(a), nm=a.name;
      ctx.save();
      ctx.font='600 10.5px system-ui';
      const wNo=ctx.measureText(no).width, wNm=ctx.measureText(nm).width;
      const w=wNo+wNm+17, h=15;
      /* 同屏标签互相压住时向上错开，保证编号和名字始终可读 */
      for(let k=0;k<12;k++){
        let hit=false;
        for(const r of TAG_RECTS){
          if(Math.abs(r.x-x)<(r.w+w)/2+3 && Math.abs(r.y-y)<(r.h+h)/2+1){hit=true;break;}
        }
        if(!hit)break;
        y-=h+2;
      }
      TAG_RECTS.push({x,y,w,h});
      ctx.fillStyle=isMe?'rgba(40,31,12,.92)':'rgba(8,11,16,.84)';
      ctx.beginPath();ctx.roundRect(x-w/2,y-h/2,w,h,4);ctx.fill();
      ctx.strokeStyle=isMe?'rgba(240,198,116,.8)':'rgba(126,142,164,.4)';ctx.lineWidth=1;ctx.stroke();
      ctx.textAlign='left';ctx.textBaseline='middle';
      ctx.fillStyle='#F0C674';ctx.fillText(no,x-w/2+7,y+0.5);
      ctx.fillStyle='#E8EEF6';ctx.fillText(nm,x-w/2+7+wNo+5,y+0.5);
      ctx.restore();
    }

    /* 任务目标高亮（2026-11-02 重做）：**红色包边沿物体轮廓 + 呼吸闪烁**。
       做法：把该掩体的家具贴图按屏上尺寸画进离屏画布 → alpha 膨胀 → 减去原图，
       得到一条严格沿轮廓的"环"，染红后叠绘在物体上。
       这就是 Blender Freestyle 描边在运行时的等价实现：
       本机没有 Blender（`where blender` 为空、仓库里也没有 .blend），
       而把 59 件家具重新烘焙一条描边通道会把地图迭代锁死 —— 运行时轮廓对地图改动免疫。
       缓存按「贴图 + 屏幕尺寸 + 线宽」为键，只在缩放/尺寸变化时重建。 */
    const OUTLINE={};
    function coverOutline(im,w,h,px){
      const key=(im.src||'')+'|'+Math.round(w)+'x'+Math.round(h)+'|'+px;
      if(Object.prototype.hasOwnProperty.call(OUTLINE,key))return OUTLINE[key];
      const pad=px*2+2;
      const W=Math.max(8,Math.round(w)+pad*2), H=Math.max(8,Math.round(h)+pad*2);
      const base=document.createElement('canvas');base.width=W;base.height=H;
      base.getContext('2d').drawImage(im,pad,pad,w,h);
      const dil=document.createElement('canvas');dil.width=W;dil.height=H;
      const dg=dil.getContext('2d');
      for(let a=0;a<8;a++){
        const ang=a*Math.PI/4;
        dg.drawImage(base,Math.cos(ang)*px,Math.sin(ang)*px);
      }
      dg.globalCompositeOperation='destination-out';
      dg.drawImage(base,0,0);                       /* 挖掉本体 → 只剩外环 */
      dg.globalCompositeOperation='source-in';
      dg.fillStyle='#FF4B3E';                       /* 环染色：任务红 */
      dg.fillRect(0,0,W,H);
      const rec={c:dil,pad:pad};
      OUTLINE[key]=rec;
      return rec;
    }
    function drawTaskCoverFlash(cov,alpha){
      const s=VIEW.s;
      const x0=SX(cov.x+cov.w/2), y1=SY(cov.y+cov.h);
      const im=IMG['fu_'+(FURN[cov.kind]||'crate')];
      if(ready(im)){
        const ar=im.naturalWidth/im.naturalHeight;
        let w=cov.w*s, h=w/ar;
        const maxH=(cov.h+0.9)*s;
        if(h>maxH){h=maxH;w=h*ar;}
        const lay=coverOutline(im,w,h,Math.max(2,Math.round(s*0.11)));
        ctx.save();
        ctx.globalAlpha=Math.max(0,Math.min(1,alpha));
        ctx.globalCompositeOperation='lighter';
        ctx.drawImage(lay.c,x0-w/2-lay.pad,y1-h-lay.pad);
        ctx.restore();
        G.gfx.coverFlashes++;
        return;
      }
      const x=SX(cov.x+cov.w/2),y=SY(cov.y+cov.h/2);
      const rr=(Math.max(cov.w,cov.h)/2+0.5)*s;
      const rad=ctx.createRadialGradient(x,y,0,x,y,rr);
      rad.addColorStop(0,'rgba(255,75,62,'+alpha.toFixed(2)+')');
      rad.addColorStop(1,'rgba(255,75,62,0)');
      ctx.fillStyle=rad;ctx.beginPath();ctx.arc(x,y,rr,0,7);ctx.fill();
    }

    /* 本人任务标记：画在迷雾之上，当前任务带名称，其余剩余任务只留金色脉冲 */
    function drawTaskMarkers(T,myLeft){
      if(!myLeft||!myLeft.length)return;
      const s=VIEW.s;
      for(let k=0;k<myLeft.length;k++){
        const p=M.points[myLeft[k]]; if(!p)continue;
        const x=SX(p.x),y=SY(p.y),cur=k===0;
        const pulse=0.5+0.35*(0.5+0.5*Math.sin(T*(cur?5.5:3.5)+p.x));
        const rad=ctx.createRadialGradient(x,y,0,x,y,(cur?1.15:0.85)*s);
        rad.addColorStop(0,'rgba(255,75,62,'+(cur?0.16:0.08)+')');
        rad.addColorStop(1,'rgba(255,75,62,0)');
        ctx.fillStyle=rad;ctx.beginPath();ctx.arc(x,y,(cur?1.15:0.85)*s,0,7);ctx.fill();
        const cov=M.cover.find(c=>p.x>=c.x-.25&&p.x<=c.x+c.w+.25&&p.y>=c.y-.25&&p.y<=c.y+c.h+.25);
        ctx.save();
        if(cov){
          /* 红色包边：当前任务强呼吸（0.55~0.95），其余任务弱呼吸，避免全场都在闪 */
          drawTaskCoverFlash(cov,cur?0.55+0.40*pulse:0.16+0.14*pulse);
        }else{
          G.gfx.dashedBorders++;
          ctx.strokeStyle='rgba(255,75,62,'+(cur?0.92*pulse+0.08:0.42).toFixed(2)+')';
          ctx.lineWidth=cur?2.4:1.6;ctx.setLineDash([5,4]);ctx.lineDashOffset=-T*14;
          ctx.beginPath();ctx.arc(x,y,(cur?0.95:0.62)*s,0,7);ctx.stroke();
          ctx.setLineDash([]);
        }
        ctx.fillStyle='rgba(255,205,60,.95)';
        ctx.beginPath();ctx.arc(x,y,cur?3.2:2.2,0,7);ctx.fill();
        ctx.restore();
        if(cur){
          const label='任务 · '+p.label;
          ctx.font='600 11px system-ui';ctx.textAlign='center';ctx.textBaseline='middle';
          const w=ctx.measureText(label).width+16,ly=y-1.35*s;
          ctx.fillStyle='rgba(30,22,6,.88)';
          ctx.beginPath();ctx.roundRect(x-w/2,ly-9,w,18,5);ctx.fill();
          ctx.strokeStyle='rgba(255,205,60,.7)';ctx.lineWidth=1;ctx.stroke();
          ctx.fillStyle='#FFE8B0';ctx.fillText(label,x,ly+0.5);
        }
      }
    }

    /* 刀者红身：把行走图整张染红后按帧复用，避免每帧重绘 */
    const TINT_SHEETS={};
    function tintedSheet(im){
      if(!im||!im.src)return null;
      const hit=TINT_SHEETS[im.src];
      if(hit)return hit;
      try{
        const c=document.createElement('canvas');
        c.width=im.naturalWidth||im.width;
        c.height=im.naturalHeight||im.height;
        const g=c.getContext('2d');
        g.drawImage(im,0,0);
        g.globalCompositeOperation='source-atop';
        g.fillStyle='rgba(255,38,28,0.62)';
        g.fillRect(0,0,c.width,c.height);
        TINT_SHEETS[im.src]=c;
        return c;
      }catch(e){return null;}
    }

    function draw(dt){
      const T=(G.paused&&G.pauseT)?G.pauseT:performance.now()/1000;
      const d=dt||1/60;
      if(G.camView){drawCams(T);return;}
      updateCamera();
      ctx.fillStyle='#07090D';ctx.fillRect(0,0,innerWidth,innerHeight);
      const me=G.me;
      const base=IMG['base'];
      const hull=IMG['hull'];
      if(ready(hull)){
        ctx.drawImage(hull,SX(0),SY(0),M.bounds.w*VIEW.s,M.bounds.h*VIEW.s);
        if(G.lightState===2){ctx.fillStyle='rgba(4,7,11,.45)';ctx.fillRect(SX(0),SY(0),M.bounds.w*VIEW.s,M.bounds.h*VIEW.s);}
      }
      if(ready(base)){
        ctx.drawImage(base,SX(0),SY(0),M.bounds.w*VIEW.s,M.bounds.h*VIEW.s);
        for(const r of M.rooms){
          if(G.lit[r.id])continue;
          ctx.beginPath();
          r.poly.forEach((p,i)=>i?ctx.lineTo(SX(p[0]),SY(p[1])):ctx.moveTo(SX(p[0]),SY(p[1])));
          ctx.closePath();
          ctx.fillStyle='rgba(3,6,11,.55)';ctx.fill();
        }
      }else drawLegacyMap();
      drawCorridorLights(T);
      drawFacilities(T);
      drawPipes(T);
      drawReqTable(T);
      drawDoors(T);
      // 房名
      for(const r of M.rooms){
        const cx=r.label?r.label[0]:r.rect[0]+r.rect[2]/2;
        const cy=r.label?r.label[1]+1.2:r.rect[1]+r.rect[3]/2;
        ctx.font='500 11px system-ui';ctx.textAlign='center';ctx.textBaseline='middle';
        ctx.lineWidth=3;ctx.strokeStyle=G.lit[r.id]?'rgba(255,255,255,.8)':'rgba(10,14,20,.75)';
        ctx.strokeText(r.name,SX(cx),SY(cy));
        ctx.fillStyle=G.lit[r.id]?'rgba(18,26,36,.85)':'rgba(150,158,170,.75)';
        ctx.fillText(r.name,SX(cx),SY(cy));
      }
      // 任务点：他人的任务只留地面暗点；自己的任务标记画在迷雾之上（drawTaskMarkers）
      const myLeft=me.tasks.slice(me.tIdx);
      for(const p of M.points){
        const idx=M.points.indexOf(p);
        if(myLeft.indexOf(idx)>=0)continue;
        ctx.beginPath();ctx.arc(SX(p.x),SY(p.y),2.2,0,7);
        ctx.fillStyle='rgba(120,130,145,.3)';ctx.fill();
      }
      /* 被破坏的设备：红色脉冲 + 倒计时，所有人都看得到（这是全船警报） */
      for(const dm of G.dmg){
        const a=0.42+0.4*(0.5+0.5*Math.sin(T*6.5));
        ctx.save();
        ctx.strokeStyle='rgba(255,90,78,'+a.toFixed(2)+')';ctx.lineWidth=2.4;
        ctx.setLineDash([5,4]);ctx.lineDashOffset=-T*20;
        ctx.beginPath();ctx.arc(SX(dm.x),SY(dm.y),1.7*VIEW.s,0,7);ctx.stroke();
        ctx.setLineDash([]);
        ctx.beginPath();ctx.arc(SX(dm.x),SY(dm.y),0.55*VIEW.s,0,7);
        ctx.fillStyle='rgba(255,70,58,'+a.toFixed(2)+')';ctx.fill();
        ctx.restore();
        ctx.font='600 12px system-ui';ctx.textAlign='center';ctx.textBaseline='middle';
        ctx.lineWidth=3;ctx.strokeStyle='rgba(22,4,4,.9)';
        const s='故障 '+Math.max(0,Math.ceil(dm.left))+'s';
        ctx.strokeText(s,SX(dm.x),SY(dm.y)-2.2*VIEW.s);
        ctx.fillStyle='#FF9A90';ctx.fillText(s,SX(dm.x),SY(dm.y)-2.2*VIEW.s);
      }
      /* 玩家异形的破坏目标：紫色虚线指引到舱室 */
      if(me.alien&&me.alive&&!me.sabUsed&&G.sabTarget){
        const t=G.sabTarget;
        ctx.save();
        ctx.strokeStyle='rgba(168,150,255,'+(0.4+0.3*Math.sin(T*4)).toFixed(2)+')';
        ctx.lineWidth=2;ctx.setLineDash([7,6]);ctx.lineDashOffset=-T*16;
        ctx.beginPath();ctx.arc(SX(t.x),SY(t.y),1.9*VIEW.s,0,7);ctx.stroke();
        ctx.restore();
        ctx.font='600 12px system-ui';ctx.textAlign='center';ctx.textBaseline='middle';
        ctx.lineWidth=3;ctx.strokeStyle='rgba(10,6,20,.85)';
        ctx.strokeText('目标 · '+roomNameById(t.room),SX(t.x),SY(t.y)-2.3*VIEW.s);
        ctx.fillStyle='#C9BCFF';ctx.fillText('目标 · '+roomNameById(t.room),SX(t.x),SY(t.y)-2.3*VIEW.s);
      }
      // 靠近可交互物：E 收集所有选项，多项时提示打开交互轮盘
      if(!G.spectMode&&me.alive&&!me.downed&&!me.detained&&me.doing<=0&&!G.meet&&!G.over){
        const items=collectInteractions(me);
        const np=nearPoint(me);
        const npMine=!!(np&&myLeft.indexOf(M.points.indexOf(np))>=0);
        if(items.length){
          const nearItem=items.slice().sort((a,b)=>
            Math.hypot(a.x-me.x,a.y-me.y)-Math.hypot(b.x-me.x,b.y-me.y))[0];
          const label=items.length>1?('[E] 选择交互 · '+items.length+' 项'):items[0].pill;
          pill(label,SX(nearItem.x),SY(nearItem.y)-2.4*VIEW.s,nearItem.accent,nearItem.fg);
        }else{
          let bot=null,bp=null,botD=1.7;
          for(const f of M.facility){
            if(f.kind!=='medbot'&&f.kind!=='secbot')continue;
            const q=botPos(f.kind); if(!q)continue;
            const d=Math.hypot(q.x-me.x,q.y-me.y);
            if(d<botD){botD=d;bot=f;bp=q;}
          }
          if(bot){
            const dead=bot.kind==='secbot'?G.secbotDead:G.medbotDead;
            pill((bot.kind==='secbot'?'保安机器人':'医疗无人机')+(dead?' · 停摆':' · 在线'),
              SX(bp.x),SY(bp.y)-2.4*VIEW.s,
              dead?'rgba(120,130,145,.5)':'rgba(63,191,140,.7)',dead?'#8A94A3':'#9FE8C6');
          }else if(np&&!npMine){
            pill('设备没有响应',SX(np.x),SY(np.y)-2.4*VIEW.s,'rgba(120,130,145,.5)','#8A94A3');
          }
        }
      }
      // 尸体提示：报告 / 搜尸 / 拖拽 / 施救
      if(!G.spectMode&&me.alive&&!me.downed&&!G.meet&&!G.over&&me.doing<=0){
        const nb=bodyNear(2.2);
        if(nb){
          const bp=bodyPos(nb);
          if(bp&&visibleAt(bp[0],bp[1])){
            const lbl=nb.alive?'[R] 报告 · [S] 查看伤情 · [D] 收尸 · [F] 施救':'[R] 报告 · [S] 搜尸取物资 · [D] 收尸';
            pill(lbl,SX(bp[0]),SY(bp[1])-1.15*VIEW.s,'rgba(255,176,32,.85)','#FFE0A3');
          }
        }
      }
      // 点击地面提示：一个扩散的圈
      if(G.clickFx){
        G.clickFx.t-=d;
        if(G.clickFx.t<=0)G.clickFx=null;
        else if(G.clickFx.bad){
          /* 禁止符号（2026-11-02）：红色圆圈 + 斜杠，在点击处淡出 —— 
             给"点错了"一个明确的、不需要读字的反馈。 */
          const k=1-G.clickFx.t/0.62, a2=Math.max(0,1-k);
          const x=SX(G.clickFx.x),y=SY(G.clickFx.y),rr=(0.42+0.30*k)*VIEW.s;
          ctx.save();
          ctx.globalAlpha=a2;
          ctx.strokeStyle='#FF6B61';ctx.lineWidth=Math.max(2,0.09*VIEW.s);
          ctx.beginPath();ctx.arc(x,y,rr,0,7);ctx.stroke();
          const dd=rr*0.72;
          ctx.beginPath();ctx.moveTo(x-dd,y-dd);ctx.lineTo(x+dd,y+dd);ctx.stroke();
          ctx.restore();
        }else{
          const k=1-G.clickFx.t/0.55, r=(0.35+0.75*k)*VIEW.s;
          ctx.strokeStyle='rgba(240,198,116,'+(0.7*(1-k)).toFixed(2)+')';ctx.lineWidth=2;
          ctx.beginPath();ctx.ellipse(SX(G.clickFx.x),SY(G.clickFx.y),r,r*0.55,0,0,7);ctx.stroke();
        }
      }
      // 尸体 / 濒死者：躺倒的行走图 + 血泊（先画，活人叠在上面）
      TAG_RECTS=[];
      for(const a of G.agents){
        const bp=bodyPos(a); if(!bp)continue;
        if(!visibleAt(bp[0],bp[1]))continue;
        const x=SX(bp[0]),y=SY(bp[1]);
        ctx.fillStyle=a.alive?'rgba(150,26,26,.30)':'rgba(110,12,12,.42)';
        ctx.beginPath();ctx.ellipse(x,y,0.62*VIEW.s,0.34*VIEW.s,0,0,7);ctx.fill();
        const im=IMG['cr_'+((a.i%15)+1)];
        if(ready(im)){
          const w=1.05*VIEW.s,h=w*160/96;
          ctx.save();ctx.translate(x,y);ctx.rotate(-Math.PI/2);
          ctx.globalAlpha=a.alive?0.92:0.62;
          ctx.drawImage(im,0,2*160,96,160,-w/2,-h/2,w,h);
          ctx.restore();ctx.globalAlpha=1;
        }
        if(a.alive){
          const k=0.5+0.5*Math.sin(T*6);
          ctx.strokeStyle='rgba(224,87,79,'+(0.45+0.4*k).toFixed(2)+')';ctx.lineWidth=2;
          ctx.beginPath();ctx.arc(x,y,0.68*VIEW.s,0,7);ctx.stroke();
        }else{
          ctx.strokeStyle='rgba(200,210,225,.28)';ctx.lineWidth=1.2;
          ctx.beginPath();ctx.arc(x,y,0.7*VIEW.s,0,7);ctx.stroke();
        }
        if(!G.dev)drawNameTag(a,x,y-0.62*VIEW.s,!G.spectMode&&a.i===G.me.i);
        if(a.act&&a.act.kind==='hurt'){
          const hk=1-Math.max(0,a.act.t)/a.act.dur;
          ctx.strokeStyle='rgba(255,90,80,'+(0.8*hk).toFixed(2)+')';ctx.lineWidth=2;
          ctx.beginPath();ctx.arc(x,y,(0.55+0.8*(1-hk))*VIEW.s,0,7);ctx.stroke();
        }
      }
      // 活人：真实行走图
      for(const a of G.agents){
        if(!a.alive||a.downed)continue;
        if(a!==me&&!canSee(a))continue;
        const im=IMG['cr_'+((a.i%15)+1)];
        const off=actOffset(a);
        const acting=a.act&&(a.act.kind==='stab'||a.act.kind==='shoot');
        /* 脚下软阴影：把 3D 渲染的角色压进地毯/钢板上，不然像贴纸 */
        ctx.save();
        ctx.fillStyle='rgba(0,0,0,.34)';
        ctx.beginPath();ctx.ellipse(SX(a.x),SY(a.y),0.42*VIEW.s,0.15*VIEW.s,0,0,7);ctx.fill();
        ctx.restore();
        if(ready(im)){
          const w=1.25*VIEW.s,h=w*160/96;
          const row=acting?rowForAng(a.act.ang):(a.moving?(ROW[a.dir]||0):2);
          const fr=a.moving?(Math.floor(T*7)%4):0;
          const bob=a.doing>0?Math.sin(T*11)*0.02*VIEW.s:0;
          const dx=SX(a.x)-w/2+(off?off.x:0);
          const dy=SY(a.y)-h*0.86+(off?off.y:0)+bob;
          ctx.drawImage(im,fr*96,row*160,96,160,dx,dy,w,h);
          if(a.redT>0){
            const tim=tintedSheet(im);
            const k=Math.min(1,a.redT/1.8);
            const pulse=0.5+0.35*(0.5+0.5*Math.sin(T*15+a.i));
            if(tim){
              ctx.save();
              ctx.globalAlpha=Math.min(0.86,(0.38+0.34*pulse)*(0.35+0.65*k));
              ctx.drawImage(tim,fr*96,row*160,96,160,dx,dy,w,h);
              ctx.restore();
            }
            const rg=ctx.createRadialGradient(SX(a.x),SY(a.y)-0.5*VIEW.s,0,SX(a.x),SY(a.y)-0.5*VIEW.s,1.15*VIEW.s);
            rg.addColorStop(0,'rgba(255,52,38,'+(0.18*k).toFixed(2)+')');
            rg.addColorStop(1,'rgba(255,52,38,0)');
            ctx.fillStyle=rg;
            ctx.beginPath();ctx.arc(SX(a.x),SY(a.y)-0.5*VIEW.s,1.15*VIEW.s,0,7);ctx.fill();
            ctx.strokeStyle='rgba(255,92,72,'+(0.45*k+0.2).toFixed(2)+')';ctx.lineWidth=1.6;
            ctx.beginPath();ctx.arc(SX(a.x),SY(a.y),0.62*VIEW.s,0,7);ctx.stroke();
          }
        }else{
          ctx.beginPath();ctx.arc(SX(a.x),SY(a.y),5,0,7);
          ctx.fillStyle=a===me?'#F0C674':'#8FA6C0';ctx.fill();
        }
        if(a.doing>0)drawWork(a,T);
        drawWeapon(a,T);
        if(!G.dev){
          const topY=SY(a.y)-(ready(im)?(1.25*VIEW.s*160/96)*0.86:0)-9;
          drawNameTag(a,SX(a.x),topY,!G.spectMode&&a===me);
        }
        if(a===me&&!G.spectMode){ctx.strokeStyle='rgba(240,198,116,.7)';ctx.lineWidth=1.4;
          ctx.beginPath();ctx.arc(SX(a.x),SY(a.y),11,0,7);ctx.stroke();}
      }
      // 幽灵：半透明 + 青色光晕（活人看不见，幽灵与 DEV 看得见）
      for(const a of G.agents){
        if(a.alive||!a.ghost)continue;
        if(a!==me&&me.alive&&!G.dev)continue;
        const x=SX(a.x),y=SY(a.y);
        const rad=ctx.createRadialGradient(x,y-0.4*VIEW.s,0,x,y-0.4*VIEW.s,1.5*VIEW.s);
        rad.addColorStop(0,'rgba(127,211,240,.20)');rad.addColorStop(1,'rgba(127,211,240,0)');
        ctx.fillStyle=rad;ctx.beginPath();ctx.arc(x,y-0.4*VIEW.s,1.5*VIEW.s,0,7);ctx.fill();
        const im=IMG['cr_'+((a.i%15)+1)];
        if(ready(im)){
          const w=1.15*VIEW.s,h=w*160/96;
          ctx.save();
          ctx.globalAlpha=0.28+0.06*Math.sin(T*2.2+a.i);
          const fr=Math.floor(T*3+a.i)%4;
          ctx.drawImage(im,fr*96,2*160,96,160,x-w/2,y-h*0.86,w,h);
          ctx.restore();
        }
        if(a.doing>0)drawWork(a,T,true);
        if(!G.dev)drawNameTag(a,x,y-(ready(im)?(1.15*VIEW.s*160/96)*0.86:0)-9,!G.spectMode&&a===me);
        ctx.strokeStyle='rgba(127,211,240,.5)';ctx.lineWidth=1.2;
        ctx.beginPath();ctx.arc(x,y,0.62*VIEW.s,0,7);ctx.stroke();
        if(a===me){
          ctx.strokeStyle='rgba(127,211,240,.8)';ctx.lineWidth=1.6;
          ctx.beginPath();ctx.arc(x,y,1.1*VIEW.s,0,7);ctx.stroke();
        }
      }
      /* 旁观者：第 16 人，只是一台相机幽灵（不参与对局、不进 15 席位） */
      if(G.spectMode&&G.spect){
        const sp=G.spect, x=SX(sp.x), y=SY(sp.y);
        const rad=ctx.createRadialGradient(x,y-0.4*VIEW.s,0,x,y-0.4*VIEW.s,1.6*VIEW.s);
        rad.addColorStop(0,'rgba(127,211,240,.22)');rad.addColorStop(1,'rgba(127,211,240,0)');
        ctx.fillStyle=rad;ctx.beginPath();ctx.arc(x,y-0.4*VIEW.s,1.6*VIEW.s,0,7);ctx.fill();
        ctx.save();
        ctx.strokeStyle='rgba(127,211,240,.85)';ctx.lineWidth=1.6;
        ctx.beginPath();ctx.arc(x,y,0.5*VIEW.s,0,7);ctx.stroke();
        ctx.beginPath();ctx.arc(x,y-0.62*VIEW.s,0.26*VIEW.s,0,7);ctx.stroke();
        ctx.restore();
        const txt='旁观者';
        ctx.font='600 11px system-ui';ctx.textAlign='center';ctx.textBaseline='middle';
        const w=ctx.measureText(txt).width+14;
        ctx.fillStyle='rgba(8,14,20,.85)';
        ctx.beginPath();ctx.roundRect(x-w/2,y-1.55*VIEW.s-9,w,18,5);ctx.fill();
        ctx.strokeStyle='rgba(127,211,240,.6)';ctx.lineWidth=1;ctx.stroke();
        ctx.fillStyle='#BFE9F7';ctx.fillText(txt,x,y-1.55*VIEW.s);
      }
      // 动作特效层（角色之上、雾之下）
      drawFx(d,T);
      // 拖拽绳：玩家与 AI 都能被看到；颜色不区分阵营，避免泄露异形身份
      for(const a of G.agents){
        if(a.drag==null)continue;
        if(a!==me&&!canSee(a))continue;
        const b=G.agents[a.drag],bp=b?bodyPos(b):null; if(!bp)continue;
        ctx.save();ctx.setLineDash([4,4]);
        ctx.strokeStyle=a===me?'rgba(240,198,116,.55)':'rgba(224,140,100,.42)';
        ctx.lineWidth=1.4;
        ctx.beginPath();ctx.moveTo(SX(a.x),SY(a.y));ctx.lineTo(SX(bp[0]),SY(bp[1]));ctx.stroke();ctx.restore();
      }
      drawFog();
      /* 本人任务点画在雾之上：夜里/隔墙也能看到目标舱室与设备位置 */
      drawTaskMarkers(T,G.spectMode?[]:myLeft);
      /* 声纹画在雾之上：墙后的脚步/刀声也能看见方向 */
      drawWaves(d);
      // 受击红晕（命中反馈）
      if(me.act&&me.act.kind==='hurt'){
        const hk=1-Math.max(0,me.act.t)/me.act.dur;
        const rg=ctx.createRadialGradient(innerWidth/2,innerHeight/2,Math.min(innerWidth,innerHeight)*0.22,
          innerWidth/2,innerHeight/2,Math.max(innerWidth,innerHeight)*0.72);
        rg.addColorStop(0,'rgba(180,20,20,0)');
        rg.addColorStop(1,'rgba(180,20,20,'+(0.5*hk).toFixed(2)+')');
        ctx.fillStyle=rg;ctx.fillRect(0,0,innerWidth,innerHeight);
      }
      /* 身份标签：DEV / 旁观是全知；**终结者时刻只公开"异形 / 人类"这一层**。
         尸体上的"凶手 X"属于额外的全知信息，仍然只在 DEV / 旁观出现（2026-11-03）。 */
      if(G.dev||G.spectMode||G.revealAll){
        const omniscient=!!(G.dev||G.spectMode);
        ctx.font='500 11px system-ui';ctx.textAlign='center';ctx.textBaseline='middle';
        for(const a of G.agents){
          const y=SY(a.y)-(a.alive&&!a.downed?1.55:0.9)*VIEW.s;
          let txt=tagName(a)+(a.alien?' · 异形':' · 人类');
          if(!a.alive)txt+=' · 幽灵';
          else if(a.downed)txt+=' · 濒死';
          else if(a.detained)txt+=' · 被擒';
          const w=ctx.measureText(txt).width+8;
          ctx.fillStyle='rgba(8,11,16,.82)';
          ctx.beginPath();ctx.roundRect(SX(a.x)-w/2,y-8,w,16,4);ctx.fill();
          ctx.fillStyle=a.alien?'#FF7B72':((!G.spectMode&&a===G.me)?'#F0C674':'#7FD3F0');
          ctx.fillText(txt,SX(a.x),y);
          const bp=bodyPos(a);
          if(omniscient&&bp&&!a.alive){
            const by=SY(bp[1])+0.95*VIEW.s;
            const kt='尸体 · 凶手 '+(a.killedBy!=null?G.agents[a.killedBy].name:'?');
            const kw=ctx.measureText(kt).width+8;
            ctx.fillStyle='rgba(40,8,8,.85)';
            ctx.beginPath();ctx.roundRect(SX(bp[0])-kw/2,by-8,kw,16,4);ctx.fill();
            ctx.fillStyle='#FF9A90';ctx.fillText(kt,SX(bp[0]),by);
          }
        }
      }
      /* 全图模式本身已展示完整船体，再叠小地图会盖住右上角的监控室 */
      if(G.camMode!=='map') drawMini();
      if(G.msgT>0){G.msgT-=d;
        ctx.fillStyle='rgba(240,198,116,.95)';ctx.font='500 14px system-ui';ctx.textAlign='center';
        ctx.fillText(G.msg,innerWidth/2,innerHeight-56);}
      // DEV 面板刷新（0.5s）
      if(G.dev){ G.devT=(G.devT+1)%30; if(G.devT===1)renderDevPanel(); }
    }
    /* 小地图：照蓝图风格重画 —— 房间轮廓 + 连接通道 + 舱室名 + 任务点图例 */
    function drawMini(){
      const w=Math.min(300,Math.max(220,Math.round(innerWidth*0.19)));
      const k=w/M.bounds.w, mh=M.bounds.h*k;
      const padT=18, legH=22;
      const x=innerWidth-w-16, y=16, my=y+padT;
      const h=mh+padT+legH;
      const T=performance.now()/1000;
      ctx.save();
      /* 面板 */
      ctx.fillStyle='rgba(7,12,18,.92)';ctx.strokeStyle='#33465C';ctx.lineWidth=1;
      ctx.beginPath();ctx.roundRect(x-6,y-6,w+12,h+12,8);ctx.fill();ctx.stroke();
      ctx.fillStyle='rgba(196,214,232,.7)';ctx.font='600 9.5px system-ui';
      ctx.textAlign='left';ctx.textBaseline='middle';
      ctx.fillText('船体蓝图',x,y+3);
      ctx.textAlign='right';ctx.fillStyle='rgba(120,138,158,.7)';
      ctx.fillText(M.bounds.w+' × '+M.bounds.h,x+w,y+3);
      /* 蓝图网格 */
      ctx.strokeStyle='rgba(110,140,170,.07)';ctx.lineWidth=.5;
      for(let gx=10;gx<M.bounds.w;gx+=10){
        ctx.beginPath();ctx.moveTo(x+gx*k,my);ctx.lineTo(x+gx*k,my+mh);ctx.stroke();
      }
      for(let gy=10;gy<M.bounds.h;gy+=10){
        ctx.beginPath();ctx.moveTo(x,my+gy*k);ctx.lineTo(x+w,my+gy*k);ctx.stroke();
      }
      /* 通道：先粗后细，像参考图里的浅灰走廊 */
      for(const c of M.corridors){
        ctx.strokeStyle=G.corrLit?'rgba(176,192,208,.42)':'rgba(92,104,118,.30)';
        ctx.lineWidth=Math.max(3,CW*k*.92);ctx.lineCap='butt';ctx.lineJoin='round';
        ctx.beginPath();c.pts.forEach((p,i)=>i?ctx.lineTo(x+p[0]*k,my+p[1]*k):ctx.moveTo(x+p[0]*k,my+p[1]*k));ctx.stroke();
        ctx.strokeStyle=G.corrLit?'rgba(220,234,246,.55)':'rgba(130,142,156,.22)';
        ctx.lineWidth=1;
        ctx.beginPath();c.pts.forEach((p,i)=>i?ctx.lineTo(x+p[0]*k,my+p[1]*k):ctx.moveTo(x+p[0]*k,my+p[1]*k));ctx.stroke();
      }
      /* 房间轮廓：小地图空间有限，用短名 + 描边保证越界也读得清 */
      const SHORT={bridge:'会议室',warehouse:'仓库',ecosys:'生态舱',engine:'引擎',power:'配电',transit:'食堂',cam:'监控',med:'医疗',armory:'军械',fun:'娱乐'};
      for(const r of M.rooms){
        ctx.beginPath();
        r.poly.forEach((p,i)=>{const px=x+p[0]*k,py=my+p[1]*k; i?ctx.lineTo(px,py):ctx.moveTo(px,py);});
        ctx.closePath();
        const lit=G.lit[r.id];
        ctx.fillStyle=lit?'rgba(198,209,222,.86)':'rgba(48,57,69,.90)';ctx.fill();
        ctx.strokeStyle=lit?'rgba(240,247,255,.75)':'rgba(120,136,154,.55)';
        ctx.lineWidth=lit?1.1:.8;ctx.stroke();
        const lx=x+(r.label?r.label[0]:r.rect[0]+r.rect[2]/2)*k;
        const ly=my+(r.label?r.label[1]:r.rect[1]+r.rect[3]/2)*k;
        const nm=SHORT[r.id]||r.name;
        ctx.font='600 '+Math.max(7,Math.round(k*2.5))+'px system-ui';
        ctx.textAlign='center';ctx.textBaseline='middle';ctx.lineJoin='round';
        ctx.strokeStyle=lit?'rgba(236,243,250,.92)':'rgba(7,12,18,.88)';
        ctx.lineWidth=1.6;ctx.strokeText(nm,lx,ly);
        ctx.fillStyle=lit?'#1D2632':'rgba(190,204,220,.92)';
        ctx.fillText(nm,lx,ly);
      }
      /* 管道 / 设施 / 任务点 */
      for(const q of M.pipes){
        ctx.save();ctx.translate(x+q.x*k,my+q.y*k);ctx.rotate(Math.PI/4);
        ctx.fillStyle='rgba(168,150,255,.9)';ctx.fillRect(-1.8,-1.8,3.6,3.6);ctx.restore();
      }
      for(const f of M.facility){
        /* 小地图也读运行时坐标，否则机器人巡逻时图上仍停在坞位 */
        const bp=(f.kind==='medbot'||f.kind==='secbot')?botPos(f.kind):null;
        ctx.fillStyle=f.kind==='breaker'?'#E0A94B':'#3FBF8C';
        ctx.beginPath();ctx.arc(x+(bp?bp.x:f.x)*k,my+(bp?bp.y:f.y)*k,1.8,0,7);ctx.fill();
      }
      const mine=G.spectMode?[]:G.me.tasks.slice(G.me.tIdx);
      for(const p of M.points){
        const idx=M.points.indexOf(p), isMine=mine.indexOf(idx)>=0;
        const hard=p.kind==='hard';
        if(!isMine){
          ctx.fillStyle=hard?'rgba(224,87,79,.22)':'rgba(77,143,209,.22)';
          ctx.beginPath();ctx.arc(x+p.x*k,my+p.y*k,1.1,0,7);ctx.fill();
          continue;
        }
        ctx.fillStyle=hard?'#E0574F':'#5AA7EE';
        ctx.beginPath();ctx.arc(x+p.x*k,my+p.y*k,2.0,0,7);ctx.fill();
        ctx.strokeStyle='rgba(255,255,255,.85)';ctx.lineWidth=.8;
        ctx.beginPath();ctx.arc(x+p.x*k,my+p.y*k,2.9,0,7);ctx.stroke();
      }
      /* 待领申请单：小地图上给圆桌一个金色脉冲，跑图时不用找 */
      if(!G.spectMode&&G.me.qualPending>0){
        const q=roundTableClaimSpot();
        if(q){
          const pu=0.45+0.35*(0.5+0.5*Math.sin(T*5));
          ctx.strokeStyle='rgba(240,198,116,'+pu.toFixed(2)+')';ctx.lineWidth=1.2;
          ctx.beginPath();ctx.arc(x+q.x*k,my+q.y*k,3.4+1.2*Math.sin(T*5),0,7);ctx.stroke();
          ctx.fillStyle='#F0C674';
          ctx.beginPath();ctx.arc(x+q.x*k,my+q.y*k,1.7,0,7);ctx.fill();
        }
      }
      /* 故障：小地图上也给红点，跑图时不用记房间 */
      for(const dm of G.dmg){
        const pu=0.55+0.35*(0.5+0.5*Math.sin(T*6));
        ctx.fillStyle='rgba(255,90,78,'+pu.toFixed(2)+')';
        ctx.beginPath();ctx.arc(x+dm.x*k,my+dm.y*k,2.4,0,7);ctx.fill();
        ctx.strokeStyle='rgba(255,190,180,.9)';ctx.lineWidth=.8;
        ctx.beginPath();ctx.arc(x+dm.x*k,my+dm.y*k,3.6,0,7);ctx.stroke();
      }
      /* DEV 可见的其他席位 */
      if(G.dev){
        for(const a of G.agents){
          if(a===G.me)continue;
          const bp=bodyPos(a);
          ctx.fillStyle=!a.alive?'rgba(127,211,240,.65)':(a.alien?'#E0574F':'#DDE3EC');
          ctx.beginPath();ctx.arc(x+(bp?bp[0]:a.x)*k,my+(bp?bp[1]:a.y)*k,1.7,0,7);ctx.fill();
        }
      }
      /* 自己 / 旁观相机：金色脉冲 */
      const focus=camFocus();
      const myx=x+focus.x*k, myy=my+focus.y*k;
      const pulse=0.45+0.3*(0.5+0.5*Math.sin(T*4.2));
      ctx.strokeStyle='rgba(240,198,116,'+pulse.toFixed(2)+')';ctx.lineWidth=1;
      ctx.beginPath();ctx.arc(myx,myy,5.5,0,7);ctx.stroke();
      ctx.fillStyle=G.spectMode?'#7FD3F0':(G.me.alive?'#F0C674':'#7FD3F0');
      ctx.beginPath();ctx.arc(myx,myy,2.6,0,7);ctx.fill();
      /* 图例 */
      const ly=y+h-7;
      ctx.font='500 8.5px system-ui';ctx.textAlign='left';ctx.textBaseline='middle';
      let lx=x;
      const dot=(c)=>{ctx.fillStyle=c;ctx.beginPath();ctx.arc(lx,ly,2,0,7);ctx.fill();lx+=6;};
      const label=(t)=>{ctx.fillStyle='rgba(170,184,200,.9)';ctx.fillText(t,lx,ly);lx+=ctx.measureText(t).width+10;};
      dot('#E0574F');label('高难 2分');
      dot('#5AA7EE');label('普通 1分');
      ctx.save();ctx.translate(lx,ly);ctx.rotate(Math.PI/4);ctx.fillStyle='#A896FF';ctx.fillRect(-1.6,-1.6,3.2,3.2);ctx.restore();
      lx+=6;ctx.fillStyle='rgba(170,184,200,.9)';ctx.fillText('管道',lx,ly);
      ctx.restore();
    }

    /* 视野：幽灵/DEV 全知；活人 = 所在亮房 + 7 格手电锥 + 近身感知圈 */
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
      if(G.dev||!G.fogOn||!G.me.alive)return true;
      const me=G.me;
      const r=roomAt(me.x,me.y);
      /* 亮区整片可见：亮舱整间；亮走廊整条（走廊灯默认开着，不看手电朝向）。
         从亮舱看相连走廊仍按视线结算，避免隔着舱壁看见走廊弯后的人。 */
      const mz=litZoneAt(me.x,me.y);
      if(mz){
        const tz=litZoneAt(x,y);
        if(tz===mz)return true;
        if(mz[0]==='r'&&tz&&tz[0]==='c'&&
          corrJoinsRoom(r,M.corridors[+tz.slice(2)])&&losNow(me.x,me.y,x,y))return true;
      }
      const d=Math.hypot(x-me.x,y-me.y);
      /* 自带近身视野：人类暗处 2.8 格，异形暗处 3.5 格（`SKSanity.SIGHT` 直接给数值），不看朝向 */
      if(d<=(me.alien?ALIEN_DARK_R:HUMAN_DARK_R)&&losNow(me.x,me.y,x,y))return true;
      if(d>HUMAN_LIGHT_R)return false;
      if(!losNow(me.x,me.y,x,y))return false;
      const ang=Math.atan2(y-me.y,x-me.x),aim=Math.atan2(G.aimY-me.y,G.aimX-me.x);
      let dd=Math.abs(ang-aim); if(dd>Math.PI)dd=2*Math.PI-dd;
      return dd<=Math.PI/6;
    }
    function canSee(a){
      if(!G.me.alive||G.dev)return true;
      return visibleAt(a.x,a.y);
    }
    let FOG=null;
    function drawFog(){
      if(!G.fogOn||!G.me.alive||G.dev||G.camMode==='map')return;
      const me=G.me;
      if(!FOG||FOG.width!==cv.width||FOG.height!==cv.height){
        FOG=document.createElement('canvas');FOG.width=cv.width;FOG.height=cv.height;
      }
      const o=FOG.getContext('2d');
      o.setTransform(1,0,0,1,0,0);o.clearRect(0,0,FOG.width,FOG.height);
      o.setTransform(dpr,0,0,dpr,0,0);
      /* 迷雾分两段（2026-11-03 用户裁定："除舱室以外的地方要能看见"）：
         ① 整屏按 roomMask 铺满遮蔽（舱室维持原暗度 —— 没进去的舱室仍然是暗的）；
         ② 只在**未拉闸**时，把非舱室区域（走廊 + 船体背景）的遮蔽整体压到 corridorMask，
            再把每个舱室 poly 补暗回 roomMask。
         这样"勉强看得清路上有什么"落地成表现层，而 `visibleAt` 一个字节都没改：
         单位与尸体在进入迷雾之前就被 `canSee()` 裁掉了（见 drawAgents 与尸体分支），
         所以压淡遮蔽**不会**让人透雾可见，也不会给任何一方增加视野。
         断电（lightState===2）时第②步整体跳过 —— 这就是"前提是没拉闸"。 */
      const SM=(SKSanity.SIGHT.fog||{});
      const roomMask=SM.roomMask, corrMask=SM.corridorMask;
      o.fillStyle='rgba(4,6,10,'+roomMask+')';o.fillRect(0,0,innerWidth,innerHeight);
      if(G.lightState!==2&&corrMask<roomMask){
        /* destination-out 的 globalAlpha 由两个目标遮蔽反推，不写死魔法数 */
        o.globalCompositeOperation='destination-out';
        o.globalAlpha=1-corrMask/roomMask;
        o.fillStyle='#000';o.fillRect(0,0,innerWidth,innerHeight);
        o.globalAlpha=1;o.globalCompositeOperation='source-over';
        const keep=1-(1-roomMask)/(1-corrMask);
        o.fillStyle='rgba(4,6,10,'+keep.toFixed(3)+')';
        for(const r of M.rooms){
          o.beginPath();r.poly.forEach((p,i)=>i?o.lineTo(SX(p[0]),SY(p[1])):o.moveTo(SX(p[0]),SY(p[1])));
          o.closePath();o.fill();
        }
      }
      o.globalCompositeOperation='destination-out';
      const r=roomAt(me.x,me.y);
      if(r&&G.lit[r.id]){
        o.beginPath();r.poly.forEach((p,i)=>i?o.lineTo(SX(p[0]),SY(p[1])):o.moveTo(SX(p[0]),SY(p[1])));o.closePath();o.fill();
        for(const c of M.corridors){
          if((c.a===r.id||c.b===r.id)&&G.corrLit){
            o.strokeStyle='#000';o.lineWidth=CW*VIEW.s;o.lineCap='butt';
            o.beginPath();c.pts.forEach((p,i)=>i?o.lineTo(SX(p[0]),SY(p[1])):o.moveTo(SX(p[0]),SY(p[1])));o.stroke();
          }
        }
      }
      /* 未断电时走廊默认有灯：站在亮走廊里整条揭开（与 visibleAt 的亮区规则一致），
         不再只给自己脚下点一盏 4.6 格的小灯。 */
      const meCorr=!r&&G.corrLit?inCorr(me.x,me.y):null;
      if(meCorr){
        o.strokeStyle='#000';o.lineWidth=CW*VIEW.s;o.lineCap='butt';
        o.beginPath();meCorr.pts.forEach((p,i)=>i?o.lineTo(SX(p[0]),SY(p[1])):o.moveTo(SX(p[0]),SY(p[1])));o.stroke();
      }
      /* 视野孔：手电锥（人与异形同款 7 格 / 60°）+ 近身感知圈
         （人类暗处 2.8 格，异形暗处 3.5 格）。异形不再有全向远视野。
         站在亮舱/亮走廊里时整片已经揭开，不再叠自己的手电锥——那只会在门口拖出一块
         跟着鼠标转的亮楔形，是噪声不是信息。 */
      const ax=me.x,ay=me.y;
      if(!(r&&G.lit[r.id])&&!meCorr){
        const a0=Math.atan2(G.aimY-ay,G.aimX-ax);
        const punch=(rad,span)=>{
          const N=span>=Math.PI*2?56:40;
          o.beginPath();o.moveTo(SX(ax),SY(ay));
          for(let i=0;i<=N;i++){
            const ang=a0-span/2+span*i/N;
            let t=rad;
            for(let st=0.4;st<rad;st+=0.3){
              const px=ax+Math.cos(ang)*st,py=ay+Math.sin(ang)*st;
              if(!free(px,py)){t=st;break;}
              let hit=false;
              for(const c of M.cover) if(px>c.x&&px<c.x+c.w&&py>c.y&&py<c.y+c.h){hit=true;break;}
              if(hit){t=st;break;}
            }
            o.lineTo(SX(ax+Math.cos(ang)*t),SY(ay+Math.sin(ang)*t));
          }
          o.closePath();o.fill();
        };
        punch(HUMAN_LIGHT_R,Math.PI/3);
        punch(me.alien?ALIEN_DARK_R:HUMAN_DARK_R,Math.PI*2);
        o.beginPath();o.arc(SX(ax),SY(ay),1.5*VIEW.s,0,7);o.fill();
      }
      o.globalCompositeOperation='source-over';
      ctx.save();ctx.setTransform(1,0,0,1,0,0);ctx.drawImage(FOG,0,0);ctx.restore();
    }
    cv.addEventListener('mousemove',e=>{if(DEAD||!G)return;G.aimX=WX(e.clientX);G.aimY=WY(e.clientY);});
    
    /* ---------------- HUD ---------------- */
    function renderTaskList(){
      const box=document.getElementById('tasks'); if(!box||!G)return;
      const me=G.me, key=me.tIdx+'|'+me.tasks.join(',');
      if(G.taskKey===key)return;
      G.taskKey=key;
      let h='<div class="th">本局任务 · 目标舱室</div>';
      me.tasks.forEach((ti,n)=>{
        const p=M.points[ti]; if(!p)return;
        const done=n<me.tIdx, now=n===me.tIdx;
        h+='<div class="tr '+(p.kind==='hard'?'hard':'normal')+(done?' done':'')+(now?' now':'')+'">'
          +'<span class="no">'+String(n+1).padStart(2,'0')+'</span>'
          +'<span class="tag">'+(p.kind==='hard'?'高难':'普通')+'</span>'
          +'<span class="loc">'+roomNameById(p.room)+'</span>'
          +'<span class="nm">'+p.label+'</span></div>';
      });
      box.innerHTML=h;
    }
    function syncHud(){
      if(SIM_RUN)return;
      const spectator=!!G.spectMode;
      const pers=document.getElementById('personal');
      if(pers)pers.classList.toggle('hide',spectator);
      document.getElementById('pg').textContent=G.prog;
      const pgmax=document.getElementById('pgmax');
      if(pgmax&&pgmax.textContent!==String(WIN_PTS))pgmax.textContent=WIN_PTS;
      document.getElementById('pgi').style.width=Math.min(100,G.prog/WIN_PTS*100)+'%';
      document.getElementById('tm').textContent=Math.max(0,G.t).toFixed(0);
      document.getElementById('nt').textContent=G.night;
      const alive=G.agents.filter(a=>a.alive).length;
      const hum=G.agents.filter(a=>a.alive&&!a.alien).length;
      const ali=G.agents.filter(a=>a.alive&&a.alien).length;
      document.getElementById('alive').textContent=alive;
      document.getElementById('hum').textContent=hum;
      document.getElementById('ali').textContent=ali;
      /* 濒死人数只在 DEV / 旁观全知时才有值（正常对局看不到谁倒了几个） */
      const dnEl=document.getElementById('dn');
      if(dnEl)dnEl.textContent=(G.dev||G.spectMode)?G.agents.filter(a=>a.downed&&a.alive).length:0;
      document.getElementById('tk').textContent=G.me.tIdx;
      document.getElementById('ql').textContent=G.me.qual;
      const qpEl=document.getElementById('qp');
      if(qpEl)qpEl.textContent=G.me.qualPending||0;
      const qh=document.getElementById('qual-hint');
      if(qh)qh.classList.toggle('hide',!(G.me.qualPending>0));
      document.getElementById('bl').textContent=G.me.bullet;
      document.getElementById('md').textContent=G.me.medkit;
      /* 稀缺资源（2026-11-02）：报告额度全局 2 次、每夜会议 2 场 —— 必须显示出来，
         否则玩家不会知道"这次拉铃值不值"。 */
      const rpEl=document.getElementById('rp');
      if(rpEl)rpEl.textContent=Math.max(0,G.me.reportLeft|0);
      const mtEl=document.getElementById('mt');
      if(mtEl){
        mtEl.textContent=Math.max(0,(G.nightMeets||0));
        const cap=SKSanity.MEET.perNight;
        const full=(G.nightMeets||0)>=cap;
        mtEl.style.color=full?'#FF8A80':'';
      }
      const pwr=document.getElementById('pwr');
      if(pwr){
        const off=G.lightState===2;
        pwr.textContent=off?'全船断电':(G.powerFixed?'照明已修复':'照明正常');
        pwr.classList.toggle('off',off);
        pwr.classList.toggle('full',!off&&G.powerFixed);
      }
      if(spectator){const tl=document.getElementById('tasks');if(tl)tl.innerHTML='';}
      else renderTaskList();
      const dl=document.getElementById('dmgline');
      if(dl){
        if(!G.dmg.length){if(!dl.classList.contains('hide'))dl.classList.add('hide');}
        else{
          dl.classList.remove('hide');
          const dtxt='<b>故障</b> '+G.dmg.map(d=>
            roomNameById(d.room)+'「'+d.label+'」 '+Math.max(0,Math.ceil(d.left))+'s').join(' · ');
          if(dl.__txt!==dtxt){dl.__txt=dtxt;dl.innerHTML=dtxt;}
        }
      }
      const roleEl=document.getElementById('role');
      if(roleEl){
        /* 席位随机后必须让玩家一眼看到"我是几号"：会议标签、投票名单都用席位号。 */
        const txt=spectator?'旁观者 · 不参与对局':
          (seatNo(G.me)+' '+G.me.name+' · '+(G.me.alien?'异形':'人类')+
            (!G.me.alive?' · 幽灵':(G.me.downed?' · 濒死':
            (G.me.detained?' · 被擒 '+Math.max(0,Math.ceil(G.me.detainedT||0))+'s':''))));
        if(roleEl.textContent!==txt)roleEl.textContent=txt;
      }
      const tip=document.getElementById('tip');
      if(tip){
        const t=spectator
          ?'旁观者：点击地面飞行（9 格/秒 · 穿墙 · 全知） · C 相机 · T 视野 · ESC 暂停/设置'
          :(G.sabPick
          ?'破坏选择：点击舱室按钮或按 1–8 直达 · ESC 取消 · 每夜一次'
          :(G.pipePick
            ?'地道选择：点击出口按钮或按 1–3 直达 · ESC 取消 · 异形专用'
            :(G.camView
              ?'监控台：E / V / ESC 退出 · 配电室拉闸会切断全部 '+M.rooms.length+' 路信号'
              :(G.sabTarget&&G.me.alien&&!G.me.sabUsed
                ?'破坏目标：'+roomNameById(G.sabTarget.room)+'「'+G.sabTarget.label+'」· 进入舱室自动下手 · 30 秒内可被修复'
                :(!G.me.alive
                  ?'幽灵态：点击穿墙移动 · E 维修任务（1.6×，额度 '+(2-(G.me.ghostPts||0))+' 分）· 不能修故障/报告/投票/搜尸 · 不能破坏 · F2 DEV'
                  :(G.me.downed
                    ?'你已濒死：等队友 F 施救，或被拖进医疗间 · F2 DEV'
                    :(G.me.detained
                      ?'被保安机器人锁住：'+Math.max(0,Math.ceil(G.me.detainedT||0))+' 秒后自动释放 · 不能移动'
                      :'点击地面移动（W/A/S/D 不是移动） · W/E 交互 · A/Q 出刀 · S/X 搜尸 · D/G 收尸 · F 施救 · R 报告 · B 开枪 · H 破坏 · V 监控 · T 视野 · C 相机 · M 音效 · P/ESC 暂停')))))));
        if(tip.textContent!==t)tip.textContent=t;
      }
    }
    document.getElementById('m-send').onclick=()=>sendPlayerSpeech(
      document.getElementById('m-text').value);
    document.getElementById('m-tpl-btns').addEventListener('click',e=>{
      const b=e.target.closest?e.target.closest('button[data-tpl]'):null;
      if(!b)return;
      const m=G.meet; if(!m||m.phase!=='discuss'||G.spectMode)return;
      /* 空值不能走 + 运算（会变成 0 = 自己）；「我在…」「不是我」本来就不需要对象。 */
      const rawT=document.getElementById('m-tpl-target').value;
      const needT=b.dataset.tpl!=='where'&&b.dataset.tpl!=='deny';
      if(!rawT&&needT){toast('先选对象');return;}
      const ti=rawT?+rawT:-1;
      const rid=document.getElementById('m-tpl-room').value||
        G.me.nRoom||roomIdAt(G.me.x,G.me.y)||'corridor';
      const text=meetTemplateText(b.dataset.tpl,G.agents[ti],rid);
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
    function simRng(seed){
      let a=seed>>>0;
      return function(){
        a|=0; a=a+0x6D2B79F5|0;
        let t=Math.imul(a^a>>>15,1|a);
        t=t+Math.imul(t^t>>>7,61|t)^t;
        return ((t^t>>>14)>>>0)/4294967296;
      };
    }
    function simResolveMeeting(){
      const m=G.meet; if(!m)return;
      if(G.simDebug)console.log('SIM meet '+m.kind+' phase='+m.phase+' voteT='+m.voteT);
      if(m.phase==='discuss'&&m.voteT>0){
        startVote();
        if(G.meet){
          closeVote();
          const tal=G.meet?G.meet.tally:null;
          if(tal&&tal.ex&&G.simStats){
            G.simStats.exiles++;
            if(tal.ex.alien)G.simStats.alienExiles++; else G.simStats.humanExiles++;
          }
        }
      }
      if(G.meet)finishMeeting();
    }
    function simGame(opts){
      opts=opts||{};
      const seed=(opts.seed==null?((Math.random()*4294967296)>>>0):(opts.seed>>>0));
      const oldRandom=Math.random, oldSim=SIM_RUN;
      SIM_RUN=true; Math.random=simRng(seed);
      let result;
      try{
        newGame();
        if(G.meet)finishMeeting();          /* 非 ?test 页面的开局会议 */
        if(!G.spectMode){
          G.spectMode=true;G.fogOn=false;
          G.spect={x:49,y:30,path:null,moving:false,dir:'down'};
        }
        G.simMode=true;G.simT=NIGHT;G.t=NIGHT;G.phase=null;G.paused=true;
        G.simStats={meetings:0,knives:0,shots:0,sabotages:0,
          exiles:0,humanExiles:0,alienExiles:0,
          searches:0,loots:0,bulletsLooted:0,medkitsLooted:0,qualsLooted:0,
          humanLoots:0,alienLoots:0,humanShots:0,alienShots:0,
          fakeRepairs:0,fakeTasks:0,fakeBreaker:0,rushKills:0,alienTasks:0,revives:0,alienLootTries:0,
          terminatorGames:0,terminatorArms:0,
          /* 2026-11-03 信任聚焦 / 领袖 / 贵信号（只读旁路，不参与任何判定） */
          orders:0,orderObey:0,orderRefuse:0,endorses:0,credFollow:0,
          realFixes:0,realRevives:0,credShieldVotes:0,abstains:0,
          /* 语料工程（连说让位 / 句式重复）——主要在真人局里体现，sim 里也留计数 */
          streakCuts:0,lineDups:0,mutualFrames:0,
          alienPipes:0,alienPipePlans:0,
          /* 2026-10-31 新增：医疗无人机救治 / 幽灵任务 / 幽灵修故障 / 人类辩护 / 异形质疑报案 */
          medbotRevives:0,medkitRevives:0,ghostTasks:0,ghostFixes:0,
          humanDefends:0,alienDefends:0,reportDoubts:0,
          /* 破坏技能遥测（2026-11-01 探查用）：sabotages=下手次数（已有）、
             sabHits=30 秒内没修掉真正 -5 的次数、sabFixed=被修掉的次数、
             sabFixSecSum=被修故障的总存活秒数（求平均用）、sabFixedByGhost=幽灵抢修的次数 */
          sabHits:0,sabFixed:0,sabFixSecSum:0,sabFixedByGhost:0,
          /* 时间线拆谎遥测（2026-11-01）：
             contradictions=口供对不上触发总次数（修完量词应显著下降）、
             falseContradictions=窗口内其实有匹配记录的次数（旧量词会冤枉人的次数）、
             contradictionsBy=按调用点拆分、knownWrites=确证写入次数、
             knownVotes/ejectByKnown=确证驱动的票与驱逐、detainWitness=拘留目击次数、
             detainEvictions=被拘留过的人最终被驱逐的次数。 */
          contradictions:0,falseContradictions:0,contradictionsBy:{},
          contradictionOld:0,knownBy:{},
          knownWrites:0,knownVotes:0,ejectByKnown:0,
          detainWitness:0,detainEvictions:0,
          /* 2026-11-01 推理引擎规范化：跨夜嫌疑 / 准-确证 / 证言可信度 /
             熵与沉默 / 在场反驳 / 跨夜口供 / 夜行回避 */
          susCarry:0,almostCount:0,almostFriendCount:0,almostEject:0,
          overriddenFriends:0,reliaWrites:0,reliaBy:{},
          hedgeAgents:0,sureAgents:0,silentSus:0,presenceDeny:0,
          claimRecall:0,retractCount:0,avoidCount:0,reliaSpread:0,
          /* 2026-11-02：证据分级 / 联盟连坐 / 伪装挡票 / 回避可观察 */
          farSight:0,allyRevealed:0,friendShield:0,avoidSus:0,
          /* 2026-11-02 节奏：报告额度用量 / 每夜会议场次分布 / 因额度或场次被拒的报告 */
          reportsUsed:0,reportDenied:0,nightMeetFull:0,
          /* 每个任务点被完成的次数（label → n）：用来观察「电路维修完成率异常低」
             这类分布问题。2026-10-31 起只统计、不改任何 AI 行为。 */
          tasksByPoint:{}};
        const dt=Math.min(0.2,Math.max(0.05,opts.dt||0.1));
        const maxNights=opts.maxNights||15;
        const maxSteps=opts.maxSteps||Math.ceil(maxNights*NIGHT/dt)+6000;
        G.simDebug=!!opts.debug;
        let steps=0;
        while(!G.over&&G.night<=maxNights&&steps<maxSteps){
          if(G.simDebug)console.log('SIM step '+steps+' t='+(G.t||0).toFixed(2)+
            ' night='+G.night+' meet='+(G.meet?G.meet.kind+':'+G.meet.phase:'-'));
          if(G.meet){simResolveMeeting();steps++;continue;}
          update(dt);steps++;
          if(G.fx.length)G.fx.length=0;
          if(G.waves.length)G.waves.length=0;
          if(G.meet)simResolveMeeting();
        }
        const alive=G.agents.filter(a=>a.alive);
        const humans=alive.filter(a=>!a.alien).length;
        const aliens=alive.filter(a=>a.alien).length;
        const downed=G.agents.filter(a=>a.downed&&a.alive).length;
        /* 证言可信度的分化程度：局末所有 (观察者,对象) 上的极差。
           0 = 谁说话都一样值钱（改造前的状态）；越大说明「惯犯/金字招牌」真的分化出来了。 */
        {
          let lo=1,hi=0,cnt=0;
          for(const ag of G.agents){
            const r=(ag.mind&&ag.mind.reliability)||{};
            for(const k in r){const v=r[k];if(v<lo)lo=v;if(v>hi)hi=v;cnt++;}
          }
          G.simStats.reliaSpread=cnt?+(hi-lo).toFixed(3):0;
        }
        result={seed,winner:G.over?(G.overWin?'human':'alien'):'timeout',
          why:G.over?(G.overWhy||''):'timeout',nights:G.night,prog:G.prog,steps,
          humans,aliens,downed,meetings:G.simStats.meetings,knives:G.simStats.knives,
          shots:G.simStats.shots,sabotages:G.simStats.sabotages,
          exiles:G.simStats.exiles,humanExiles:G.simStats.humanExiles,
          alienExiles:G.simStats.alienExiles,
          searches:G.simStats.searches,loots:G.simStats.loots,
          bulletsLooted:G.simStats.bulletsLooted,medkitsLooted:G.simStats.medkitsLooted,
          qualsLooted:G.simStats.qualsLooted,
          humanLoots:G.simStats.humanLoots,alienLoots:G.simStats.alienLoots,
          humanShots:G.simStats.humanShots,alienShots:G.simStats.alienShots,
          fakeRepairs:G.simStats.fakeRepairs,fakeTasks:G.simStats.fakeTasks,
          fakeBreaker:G.simStats.fakeBreaker,rushKills:G.simStats.rushKills,
          terminatorGames:G.simStats.terminatorGames||0,terminatorArms:G.simStats.terminatorArms||0,
          orders:G.simStats.orders||0,orderObey:G.simStats.orderObey||0,
          orderRefuse:G.simStats.orderRefuse||0,endorses:G.simStats.endorses||0,
          credFollow:G.simStats.credFollow||0,realFixes:G.simStats.realFixes||0,
          realRevives:G.simStats.realRevives||0,credShieldVotes:G.simStats.credShieldVotes||0,
          abstains:G.simStats.abstains||0,
          streakCuts:G.simStats.streakCuts||0,lineDups:G.simStats.lineDups||0,
          mutualFrames:G.simStats.mutualFrames||0,
          alienTasks:G.simStats.alienTasks,
          revives:G.simStats.revives,alienLootTries:G.simStats.alienLootTries,
          alienPipes:G.simStats.alienPipes,alienPipePlans:G.simStats.alienPipePlans,
          /* 2026-10-31 新增统计：医疗无人机救治 / 医疗包施救 / 幽灵任务 / 幽灵修故障 /
             人类辩护 / 异形质疑快速报案者 */
          medbotRevives:G.simStats.medbotRevives,medkitRevives:G.simStats.medkitRevives,
          ghostTasks:G.simStats.ghostTasks,ghostFixes:G.simStats.ghostFixes,
          humanDefends:G.simStats.humanDefends,reportDoubts:G.simStats.reportDoubts,
          sabHits:G.simStats.sabHits,sabFixed:G.simStats.sabFixed,
          sabFixSec:G.simStats.sabFixed?+(G.simStats.sabFixSecSum/G.simStats.sabFixed).toFixed(1):0,
          sabFixedByGhost:G.simStats.sabFixedByGhost,
          /* 2026-11-01 推理质量遥测：拆谎误判 / 确证触发 / 拘留证据 */
          contradictions:G.simStats.contradictions,falseContradictions:G.simStats.falseContradictions,
          contradictionOld:G.simStats.contradictionOld,
          knownBy:Object.assign({},G.simStats.knownBy),
          knownWrites:G.simStats.knownWrites,knownVotes:G.simStats.knownVotes,
          ejectByKnown:G.simStats.ejectByKnown,detainWitness:G.simStats.detainWitness,
          detainEvictions:G.simStats.detainEvictions,
          /* 2026-11-01 推理引擎规范化（跨夜痕迹 / 准-确证 / 可信度 / 熵沉默 / 在场反驳） */
          susCarry:G.simStats.susCarry,almostCount:G.simStats.almostCount,
          almostFriendCount:G.simStats.almostFriendCount,almostEject:G.simStats.almostEject,
          almostVotes:G.simStats.almostVotes,
          overriddenFriends:G.simStats.overriddenFriends,
          reliaWrites:G.simStats.reliaWrites,reliaSpread:G.simStats.reliaSpread,
          hedgeAgents:G.simStats.hedgeAgents,sureAgents:G.simStats.sureAgents,
          silentSus:G.simStats.silentSus,presenceDeny:G.simStats.presenceDeny,
          claimRecall:G.simStats.claimRecall,retractCount:G.simStats.retractCount,
          avoidCount:G.simStats.avoidCount,
          farSight:G.simStats.farSight,allyRevealed:G.simStats.allyRevealed,
          friendShield:G.simStats.friendShield,avoidSus:G.simStats.avoidSus,
          reportsUsed:G.simStats.reportsUsed,nightMeetFull:G.simStats.nightMeetFull,
          tasksByPoint:Object.assign({},G.simStats.tasksByPoint)};
      } finally {
        Math.random=oldRandom; SIM_RUN=oldSim;
        if(G){G.simMode=false;G.simDebug=false;G.paused=true;}
      }
      return result;
    }
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
        a._reportT=0;a._reportBody=null;
        return {body:v,wait:a._reportPlan.wait,direct:!!direct};},
      reportPlan:i=>{const a=G.agents[i];
        return a&&a._reportPlan?{body:a._reportPlan.body,wait:+a._reportPlan.wait.toFixed(1),
          direct:!!a._reportPlan.direct,
          spot:a._reportPlan.spot?[+a._reportPlan.spot[0].toFixed(1),+a._reportPlan.spot[1].toFixed(1)]:null}:null;},
      bodyItems:i=>{const a=G.agents[i];if(!a)return null;
        return {bullet:a.bullet|0,medkit:a.medkit|0,qual:a.qual|0,searched:!!a.searched};},
      /* 门禁隔离用：把某个 AI 的子状态（拖尸/藏尸/管道规划/断电响应）清干净 */
      resetAiState:i=>{const a=G.agents[i];if(!a)return null;
        a.drag=null;a.draggedBy=null;a.redT=0;a.rushT=0;a._dragSnd=0;a._dragAiT=0;
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
        a._look=null;a._fixGo=null;a.path=null;a.doing=0;a._doing=null;a.target=null;a._plan=null;a._planCD=0;
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
      disguise:(i,rad)=>{const a=G.agents[i];if(!a)return null;
        const D=SKSanity.DISGUISE;
        const aud=alienAudienceInfo(a,rad||D.audienceR);
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
          opts:optList,minScore:D.minScore,
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
          caught:f.caught?{i:f.caught.i,text:f.caught.text,age:f.caught.age}:null})),
        aiCands:(G.meet.ctx.aiCands||[]).slice(),
        playerSays:(G.meet.ctx.playerSays||[]).map(s=>s.slots),
        playerAccuse:G.meet.ctx.playerAccuse,playerVote:G.meet.ctx.playerVote}:null,
      simGame:opts=>simGame(opts),
      parseSpeech:t=>parseSpeech(t),
      tplText:(kind,target,room)=>meetTemplateText(kind,target==null?null:G.agents[target],room),
      chatterPlan:()=>G.meet&&G.meet.plan?Object.assign({},G.meet.plan):null,
      accuseLineOf:i=>G.agents[i]?(accuseLine(G.agents[i],G.meet)||''):'',
      notice:(i,x,y,rad,kind,victim)=>noticeAction(G.agents[i],x,y,rad,kind,
        victim==null?null:G.agents[victim]),
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
      almostOf:i=>{const a=G.agents[i];return a&&a.mind?
        JSON.parse(JSON.stringify(a.mind.almost||{foe:{},friend:{}})):null;},
      evalAlmost:(w,i)=>{evalAlmost(G.agents[w],i==null?w:i);return true;},
      entropyOf:i=>{const a=G.agents[i];return a&&a.mind?
        SKSanity.beliefEntropy(a.mind.sus,a.i):0;},
      healSus:(w,i,v)=>{const a=G.agents[w];if(!a||!a.mind)return null;
        a.mind.sus[i]=v;a.mind.susNight=a.mind.susNight||{};a.mind.susNight[i]=G.night;return a.mind.sus[i];},
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
      assets:()=>({base:ready(IMG['base']),hull:ready(IMG['hull']),
        w:IMG['base']?IMG['base'].naturalWidth:0,h:IMG['base']?IMG['base'].naturalHeight:0,
        hw:IMG['hull']?IMG['hull'].naturalWidth:0,hh:IMG['hull']?IMG['hull'].naturalHeight:0}),
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
      dmg:()=>G.dmg.map(d=>({room:d.room,x:d.x,y:d.y,label:d.label,left:d.left,dur:d.dur,by:d.by})),
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
      pickWheel:i=>{const ok=pickWheel(i);return {ok,doing:G.me.doing,do:G.me._doing,wheel:!!G.wheel};},
      closeWheel:()=>{closeWheel(true);return !G.wheel;},
      supplies:()=>supplyPoints().map(q=>({kind:q.kind,item:q.item,x:q.x,y:q.y,label:q.label})),
      coverAudit:()=>coverAudit(),
      botLabel:kind=>{const f=M.facility.find(q=>q.kind===kind);
        return f?botLabelText(f,kind==='secbot'?!!G.secbotDead:!!G.medbotDead):null;},
      robots:()=>({
        sec:{used:!!G.secbotUsed,uses:G.secbotUses||0,left:SEC_USES_MAX-(G.secbotUses||0),dead:!!G.secbotDead,t:G.secbotT||0,hp:botHp('secbot'),range:SEC_RANGE,arc:SEC_ARC},
        med:{used:!!G.medbotUsed,dead:!!G.medbotDead,t:G.medbotT||0,
          left:G.medbotLeft==null?MEDBOT_CHARGES:G.medbotLeft,hp:botHp('medbot'),
          heal:MEDBOT_HEAL_TIME,touch:MEDBOT_TOUCH_R,target:G.medbotTarget==null?null:G.medbotTarget,
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
      taskDurs:()=>M.points.map(p=>({kind:p.kind,dur:p.dur})),
      lamps:()=>M.corridors.map(c=>corridorLampPos(c).length),
      tags:()=>G.agents.map(a=>tagName(a)),
      taskPlan:()=>G.agents.map(a=>a.tasks.map(ti=>({kind:M.points[ti].kind,room:M.points[ti].room,label:M.points[ti].label}))),
      finishDoing:i=>{finishDoing(G.agents[i]);return {msg:G.msg,prog:G.prog,tIdx:G.agents[i].tIdx};},
      aiScan:(i,dt)=>{const a=G.agents[i];aiScanBodies(a,dt);
        return {t:a._reportT,body:a._reportBody?a._reportBody.i:null,meet:!!G.meet};},
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
        scanT:+Math.max(0,Math.min(2,d.scanT||0)).toFixed(2),
        scanning:G.lightState===2&&!/:bridge$/.test(d.id)&&(d.scanT||0)>0&&(d.scanT||0)<2,
        locked:G.lightState===2&&!/:bridge$/.test(d.id)&&(d.scanT||0)<2})),
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
      bodyInfo:i=>bodyInfo(G.agents[i]),
      mind:i=>{const a=G.agents[i];if(!a||!a.mind)return null;
        return {mem:a.mind.mem.slice(-24),sus:Object.assign({},a.mind.sus),
          why:JSON.parse(JSON.stringify(a.mind.why)),alert:a.mind.alert,noise:a.mind.noise,
          seenBy:Object.assign({},a.mind.seenBy),
          known:JSON.parse(JSON.stringify(a.mind.known||{})),
          alibi:JSON.parse(JSON.stringify(a.mind.alibi||{})),
          humanT:Object.assign({},a.mind.humanT||{}),
          cred:Object.assign({},a.mind.cred||{}),
          credWhy:JSON.parse(JSON.stringify(a.mind.credWhy||{})),
          reliability:Object.assign({},a.mind.reliability||{}),
          almost:JSON.parse(JSON.stringify(a.mind.almost||{foe:{},friend:{}})),
          claimHist:(a.mind.claimHist||[]).map(c=>({night:c.night,room:c.room})),
          susNight:Object.assign({},a.mind.susNight||{}),
          ally:Object.assign({},a.mind.ally||{}),
          entropy:a._entropy,
          mates:Object.assign({},a.mates||{}),
          redSeen:Object.assign({},a.mind.redSeen||{})};},
      /* 门禁用：立刻跑一轮感知（正常由 update 每 0.4 秒调用） */
      track:()=>{for(const a of G.agents)if(a.alive&&!a.downed)trackNight(a);return true;},
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
      togglePauseGame:()=>{ if(G&&!G.over&&!G.meet&&!G.inspect) togglePause(); },
      isPaused:()=>!!(G&&G.paused),
      playSfx:n=>{ const f=SND[n]; if(typeof f==='function'){try{f(0.8);}catch(e){}} }
    });
    resize();newGame();G.aimX=G.me.x+1;G.aimY=G.me.y;
    rafId=requestAnimationFrame(loop);
    return function(){
      DEAD=true;
      cancelAnimationFrame(rafId);
      clearInterval(meetingTick);
      stopChatter();
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
