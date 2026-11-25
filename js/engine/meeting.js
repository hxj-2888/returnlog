/* ==== ARCH NODE · 架构节点标注（根 ARCHITECTURE.md） ====
 * layer     : T2
 * domain    : 报告 / 会议 / 讨论 / 投票 / 终结者时刻
 * definedBy : 报案开会 / 发言叙事 / 玩家发言解析 / 投票结算 / 进化与入夜
 * truth     : js/engine/meeting.js#SKMeeting
 * verify    : npm test
 * flag      : F
 * note      : P6 从 js/game.js 拆出
 * ============================================================== */
(function (global) {
  'use strict';

  const MEET_TPL_KINDS = ['accuse','vote','support','wronglead','grateful','pipe','red','knife',
    'sabotage','bot','breaker','where','deny'];

  function create(R) {
    const {
      getG, getSND, getDead, getSimRun, getTestRun, getSimNoDiscuss, getGameMode,
      inCorr, roomAt, roomIdAt, roomNameById, roomIdOfName, pipeRoomIds, isPipeRoom, syncDevUi, refreshLight, closePipePick, closeCams, clearSabSpots, closeSabPick, logEvent, reliaOf, reliaAdd, emoAdd, grudgeAdd, trustAdd, emotionOf, isPatron, credAdd, topCred, obeyTrustMul, warmAdd, settleAccountability, recordClaim, defenseNote, witnessCtxMul, isMate, isMyMate, bodyWound, bodyInfo, releaseAllDrags, die, dawn, resetBots, checkWin, closeWheel, closeBodyCard, toast, banner, topSus, crimeWindow, bodyReported, markBodyReported, nightMeetLeft, tagName, tagByName, nameOf, whenWord, parseSpeech, stopChatter, meetLater, sayStreakOK, evNow, credOf, mindReset, evPush, trustCert, susCut, checkAlibi, claimWindow, susAddContradiction, oldQuantifierWouldFire, bestSusTarget, almostFoeOf, almostFriendOf, bestAlmostTarget, bestKnownTarget, evidenceReason, pubSolidAccusers, statementRelation, hypothesisSpread, IDENTITY, hostileProb, trustScore, hostileTo, beliefOf, susAdd, bodyPos, NIGHT, MOVE_SPEED, EV_W, envEstimate, M, SKSanity, SKTrait, SKT2AI, SKLines, SKClock, MEDBOT_CHARGES, trustMirror
    } = R;
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
    function tryReport(){ const G=getG(), SND=getSND(), DEAD=getDead(), SIM_RUN=getSimRun(), TEST_RUN=getTestRun(), SIM_NO_DISCUSS=getSimNoDiscuss(), GAME_MODE=getGameMode();
      if(!G.me.alive||G.me.downed||G.meet||G.over)return;
      if(G.terminator){toast('终结者时刻已取消会议，请直接决战');return;}
      /* 报告距离的唯一真源是 SKSanity.MEET.reportR（R10.1）。
         2026-11-18：这里原来写死 2.4，而 AI 的两条报案路径放行到 5.8 / 2.6 格 ——
         同一个"报告"动作两边判据不同，AI 能隔空拉铃。现在两侧读同一个数。 */
      const R=SKSanity.MEET.reportR;
      let best=null,bd=R;
      for(const a of G.agents){
        const bp=bodyPos(a); if(!bp)continue;
        if(bodyReported(a))continue;
        const d=Math.hypot(bp[0]-G.me.x,bp[1]-G.me.y);
        if(d<bd){bd=d;best=a;}
      }
      if(!best){toast('附近没有可报告的发现（'+R+' 格内）—— 同一具尸体跨夜可重报，同一个还躺着的人一轮只报一次');return;}
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
    function say(who,text,kind){ const G=getG(), SND=getSND(), DEAD=getDead(), SIM_RUN=getSimRun(), TEST_RUN=getTestRun(), SIM_NO_DISCUSS=getSimNoDiscuss(), GAME_MODE=getGameMode();
      /* 空句兜底（2026-11-20 用户报「看到某 AI 发言、内容却是空的」）：
         pickLine 在"整池都含 {r}、调用处又没给地点"时会返回空串，旧代码照样
         建了一个只有名字的 <b>，看起来就是"话被掐断"。空句不落 DOM、不进事件流、
         不计 talkN —— 当作这次没说，绝不冒一个只有名字的空行。 */
      const full=String(text==null?'':text).trim();
      if(!full){
        if(G)G.emptySayN=(G.emptySayN||0)+1;
        return;
      }
      /* 超长句在句末截断，避免从词中间切一半（"被掐断"观感的另一半来源） */
      let raw=full;
      if(raw.length>140){
        raw=raw.slice(0,140);
        const cut=Math.max(raw.lastIndexOf('。'),raw.lastIndexOf('！'),raw.lastIndexOf('？'));
        if(cut>=60)raw=raw.slice(0,cut+1);
      }
      /* 「真人玩家发言」专用通道（2026-11-19 用户报「有发言资格却静默屏蔽」）：
         玩家真身发言一律用 kind==='me'（渲染层早有 'me' 分支，见下方 className）。
         kind===true 只留给调试探针 sayAs（门禁靠它测状态总闸），二者不可混用。
         原则：**只要玩家有发言资格（sendPlayerSpeech 放行），他的话就一定出现在
         发言框**，绝不被下面任何一道"给 AI 调度用"的节流闸静默吞掉。
         玩家的节流只有输入框 2 秒冷却（见 sendPlayerSpeech / paintSayCD），且冷却期
         也有系统行提示，不静默。 */
      const isPlayer=(kind==='me');
      /* 说话资格总闸（2026-11-18 用户报的严重问题：濒死的人还在发言）。
         以前 only 各条调度各自过滤，漏一条通道就会让倒下的人开口。
         这里按"说话人当前状态"统一挡：死亡 / 濒死 / 被拘留都不能发言。
         系统行（kind==='sys'）是旁白与状态提示，不是"某人在说话"，放行。
         真人玩家（kind==='me'）由 sendPlayerSpeech 入口统一判资格并给明确提示，
         不在这里静默丢弃 —— 否则就是"输入框亮着、发出去却没影"。 */
      if(!isPlayer&&kind!=='sys'&&G&&G.agents){
        const sp0=G.agents.find(a=>a.name===who);
        if(sp0&&(!sp0.alive||sp0.downed||sp0.detained))return;
      }
      /* 玩家发言**不受**"连说上限"约束（2026-11-18 用户裁定）。
         sayStreakOK 是给 AI 调度用的节流；玩家被它拦掉时，`sendPlayerSpeech`
         后面的 `playerTalk(raw)` 已经执行 —— 结果是"AI 有反应、玩家自己看不到"。
         玩家改由输入框的 2 秒冷却显式节流（见 sendPlayerSpeech / paintSayCD）。 */
      if(!isPlayer&&kind!==true&&!sayStreakOK(who,kind))return;   /* 让位：这句当作没说（不进事件流、不进复盘） */
      const sp0=(G&&G.agents&&kind!=='sys')?G.agents.find(a=>a.name===who):null;
      /* 2026-11-08 用户裁定「压制异形发言频率」：每场异形台词**硬上限**。
         超了就静默丢弃 —— 不进事件流、不计 talkN、不推进台词去重。
         目的是保留"异形先指控"的时序优势，但不让它靠"话多"占满讨论
         （实测 4/15 人说了 51.4% 的话，开局会 70%）。
         2026-11-19：这道闸只压 AI 异形；真人玩家即便扮演异形也不受配额静默。 */
      if(!isPlayer&&sp0&&sp0.alien&&G.meet&&SKSanity.SPEECH&&SKSanity.SPEECH.alienLineCap>0){
        G.meet.alienSaid=G.meet.alienSaid||0;
        if(G.meet.alienSaid>=SKSanity.SPEECH.alienLineCap){
          G.alienMutedN=(G.alienMutedN||0)+1;
          return;
        }
        G.meet.alienSaid++;
      }
      /* 2026-11-05 G2：把「健谈」变成可观察量 —— 只记真正说出口的台词。
         sayStreakOK / 配额挡掉的句子不算（等于没说）。系统行不计入任何人。 */
      if(sp0){
        sp0.talkN=(sp0.talkN||0)+1;
        /* 2026-11-08：发言阵营分布（只统计，不改判据）。用来验证"异形不再话多"。 */
        G.speechByFaction=G.speechByFaction||{alien:0,human:0};
        G.speechByFaction[sp0.alien?'alien':'human']++;
      }
      /* 会议发言也进事件流（复盘要看“为什么投他”）；模拟局不记，避免 1000 局刷爆内存 */
      if(!SIM_RUN&&G){
        const seat=G.agents.findIndex(a=>a.name===who);
        logEvent('chat',{actor:seat>=0?seat:null,who:who,sys:kind==='sys',text:raw});
      }
      if(SIM_RUN){
        if(G.meet){G.meet.lines=G.meet.lines||[];G.meet.lines.push({who,text:raw,sys:kind==='sys'});}
        /* 2026-11-08：批量采样发言用（只有显式打开 window.__recLines 时才记，
           1000 局蒙特卡洛不受影响）。 */
        if(global.__recLines)global.__recLines.push({who:who,text:raw,sys:kind==='sys',
          alien:sp0?!!sp0.alien:null,seq:(G.meet&&G.meet.seq)||0});
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
      /* 2026-11-08：**不再无条件滚到底**。玩家往上翻读旧发言时，新消息只提示条数；
         否则"开场定调"永远被滚出视野（实测 6 场里内容高度都是可视高度的 1.4~2.0 倍，
         且 `scrollTop===scrollHeight`，玩家看到的第一屏永远是最后几条）。 */
      const mine=(kind===true||kind==='me');
      const atBottom=box.scrollTop+box.clientHeight>=box.scrollHeight-24;
      box.appendChild(d);
      /* 自己发的消息永远跟到底（2026-11-15 修「发到一定条数后，再发就看不见」）：
         超过一屏且玩家上翻过旧发言后 atBottom 恒为 false，旧写法只挂「↓ N 条新发言」，
         玩家**自己刚发的那句**也被留在视野外。AI 台词仍不抢滚动位置，只累计条数。 */
      if(mine||atBottom)box.scrollTop=box.scrollHeight;
      if(mine)clearNewLines();
      else if(!atBottom)markNewLines();
      if(G.meet){G.meet.lines=G.meet.lines||[];G.meet.lines.push({who,text:raw,sys:kind==='sys'});}
    }
    /* 新发言提示：只在玩家没停在底部时出现；点一下跳回最新并清零。 */
    function markNewLines(){ const G=getG(), SND=getSND(), DEAD=getDead(), SIM_RUN=getSimRun(), TEST_RUN=getTestRun(), SIM_NO_DISCUSS=getSimNoDiscuss(), GAME_MODE=getGameMode();
      const btn=document.getElementById('m-new'); if(!btn)return;
      const n=(+btn.dataset.n||0)+1;
      btn.dataset.n=String(n);
      btn.textContent='↓ '+n+' 条新发言';
      btn.classList.add('on');
    }
    function clearNewLines(){ const G=getG(), SND=getSND(), DEAD=getDead(), SIM_RUN=getSimRun(), TEST_RUN=getTestRun(), SIM_NO_DISCUSS=getSimNoDiscuss(), GAME_MODE=getGameMode();
      const btn=document.getElementById('m-new'); if(!btn)return;
      btn.dataset.n='0'; btn.classList.remove('on');
    }
    function sysSay(t){ const G=getG(), SND=getSND(), DEAD=getDead(), SIM_RUN=getSimRun(), TEST_RUN=getTestRun(), SIM_NO_DISCUSS=getSimNoDiscuss(), GAME_MODE=getGameMode(); say('系统',t,'sys'); }
    function seenNames(a,opt){ const G=getG(), SND=getSND(), DEAD=getDead(), SIM_RUN=getSimRun(), TEST_RUN=getTestRun(), SIM_NO_DISCUSS=getSimNoDiscuss(), GAME_MODE=getGameMode();
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
    /* 先验（2026-11-21 用户裁定「每次死亡发生之后重算」）：
       prior = 100 × 存活人类 / 存活总数。死亡结算统一走 recomputePrior()，
       旧值挪进 priorTPrev 供跨夜衰减剥离个人净分。 */
    function recomputePrior(){ const G=getG(), SND=getSND(), DEAD=getDead(), SIM_RUN=getSimRun(), TEST_RUN=getTestRun(), SIM_NO_DISCUSS=getSimNoDiscuss(), GAME_MODE=getGameMode();
      const alive=G.agents.filter(a=>a.alive);
      const n=alive.length||1;
      const h=alive.filter(a=>!a.alien).length;
      const old=(G.priorT!=null)?G.priorT:null;
      G.priorTPrev=old;
      const pnew=SKSanity.AXIS.priorPool*h/n;
      G.priorT=pnew;
      /* 2026-11-21 用户裁定「每次死亡之后重算」：先验是绝对值基线，
         重算必须**平移所有观察者的存量 T**（确证 ∓999 除外），
         否则死亡后先验从 73 涨到 100、旧 T 停在 73 —— 相当于人人都"比先验低"
         （实测异形被全员判成准-确证异形，100 局人类 100%）。 */
      if(old!=null&&Math.abs(pnew-old)>0.01){
        for(const a of G.agents){
          if(!a.mind||!a.mind.T)continue;
          for(const k in a.mind.T){
            const v=a.mind.T[k];
            if(Math.abs(v)>=SKSanity.AXIS.certFloor)continue;
            a.mind.T[k]=+(v+(pnew-old)).toFixed(1);
          }
        }
      }
      return G.priorT;
    }
    function alibiOf(a){ const G=getG(), SND=getSND(), DEAD=getDead(), SIM_RUN=getSimRun(), TEST_RUN=getTestRun(), SIM_NO_DISCUSS=getSimNoDiscuss(), GAME_MODE=getGameMode();
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
    /* ---- 「别人在哪个舱室」的唯一诚实来源（2026-11-18 用户报的严重 bug）----
       症状：AI 会说「他昨晚在医疗间干活」「我和他在仓库碰过面」，而那次相遇根本没发生。
       根因是**槽位接错了数据线**：
         · 夜间"我见过谁"记在 `a.nSeen[人]`，那只是个次数计数，**不带地点**；
         · 而 `alibiOf(x).room` 是**说话人自己**在的位置（异形还是它编的假口供）；
         · 台词模板里的 `{r}` 一直被填成后者，于是"他在 X"其实是"我在 X"。
       只有 `mind.mem` 里的 `saw_agent` 条目真的记着「我在什么位置见到这个人」，
       所以凡是断言他人位置的句子，一律只能从这里取数；取不到就不许说位置。 */
    function seenRoomOf(a,subj){ const G=getG(), SND=getSND(), DEAD=getDead(), SIM_RUN=getSimRun(), TEST_RUN=getTestRun(), SIM_NO_DISCUSS=getSimNoDiscuss(), GAME_MODE=getGameMode();
      const mem=(a&&a.mind&&a.mind.mem)||[];
      for(let k=mem.length-1;k>=0;k--){
        const e=mem[k];
        if(!e||e.kind!=='saw_agent'||e.subj!==subj)continue;
        if(G&&G.night!=null&&e.night!=null&&e.night!==G.night)continue;
        const rid=e.room||roomIdAt(e.x,e.y);
        if(!rid||rid==='corridor'||rid==='unknown')return null;
        return roomNameById(rid);
      }
      return null;
    }
    /* 没有地点依据时，连"带 {r} 的句式"都不许抽 —— 宁可少说半句，不许臆造位置。
       （fillTpl 的兜底只会把空槽写成某个具体舱室，那是错上加错。） */
    function roomSafePool(cat,a,hasRoom){ const G=getG(), SND=getSND(), DEAD=getDead(), SIM_RUN=getSimRun(), TEST_RUN=getTestRun(), SIM_NO_DISCUSS=getSimNoDiscuss(), GAME_MODE=getGameMode();
      const tone=SKLines.toneOf(a,0);
      const p=SKLines.pool(cat,tone)||SKLines.pool(cat,'cold')||[];
      return hasRoom?p:p.filter(s=>String(s).indexOf('{r')<0);
    }
    function victimInfo(victim){ const G=getG(), SND=getSND(), DEAD=getDead(), SIM_RUN=getSimRun(), TEST_RUN=getTestRun(), SIM_NO_DISCUSS=getSimNoDiscuss(), GAME_MODE=getGameMode();
      if(!victim)return null;
      const bp=bodyPos(victim);
      const x=bp?bp[0]:(victim.deathX!=null?victim.deathX:victim.x);
      const y=bp?bp[1]:(victim.deathY!=null?victim.deathY:victim.y);
      const rid=victim.deathRoom||roomIdAt(x,y);
      return {a:victim,name:victim.name,roomId:rid,room:roomNameById(rid),
        dead:!victim.alive,
        cause:bodyWound(victim).replace(' · 仍在渗血','')};
    }
  /* 舱室中心点的直线距离 / 基础移速 = 反事实所需时间。
     走廊与门会绕路，alibiReach 里留了 2 秒余量；房间 id 查不到时返回 null（不加强）。 */
  function counterfactualReach(fromRoom,toRoom,dtSec){
    if(!fromRoom||!toRoom||fromRoom===toRoom)return null;
    const A=M.rooms.find(r=>r.id===fromRoom),B=M.rooms.find(r=>r.id===toRoom);
    if(!A||!B||!A.rect||!B.rect)return null;
    const ax=A.rect[0]+A.rect[2]/2,ay=A.rect[1]+A.rect[3]/2;
    const bx=B.rect[0]+B.rect[2]/2,by=B.rect[1]+B.rect[3]/2;
    return SKSanity.alibiReach(Math.hypot(bx-ax,by-ay),dtSec,MOVE_SPEED);
  }
    function buildMeetCtx(kind,reporter,victim){ const G=getG(), SND=getSND(), DEAD=getDead(), SIM_RUN=getSimRun(), TEST_RUN=getTestRun(), SIM_NO_DISCUSS=getSimNoDiscuss(), GAME_MODE=getGameMode();
      const vi=victimInfo(victim);
      const ctx={kind,reporter,victim,victimInfo:vi,claims:[],playerSays:[],
        playerAccuse:null,playerVote:null,playerClaimRoom:null,quick:null,frames:[],
        playerClaims:[],playerSupport:null,
        /* testimony：开会时算好、**等话真的说出口**才生效的证言（2026-11-05）。
           以前在 buildMeetCtx 里一次性写进所有听众的 sus —— 等于一开会所有人
           就同时"听完了全部发言"，投票也就没有"听完再改"这回事。
           现在只排队；谁开口（say）就发谁的；讨论结束前没说的统一补发，
           保证最终信念与旧版逐条一致，变的只是**时间点**。 */
        testimony:[],
        /* vouches：已经说出口的公开背书（与 testimony 的指控构成「证言间关系」） */
        vouches:[],
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
            susAdd(w,reporter.i,SKSanity.MAPPING.quickReport,'quick_report',{kind:'quick_report',x:0,y:0,room:null,t:evNow()});
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
          /* 2026-11-05 二组：**去掉这里的 `a.alien` 短路**。
             以前人类的口供会被听众拿案发 ±8 秒的时间线核对，异形那句
             「我昨晚在监控室」却完全不进这条判据 —— 同类口供两套判据，
             等于给谎报位置发了一张免死牌。现在同一条 checkAlibi 量词对所有人，
             异形谎报的舱室从来没在别人的 saw_agent 里出现过，一对就穿。 */
          if(a===w||!a.alive||a.downed)continue;
          const ab=alibiOf(a);
          const r=checkAlibi(w,a.i,ab.roomId,cw?cw.t0:null,cw?cw.t1:null,cw?cw.tRef:null);
          /* 诊断口径（只统计不改行为）：旧量词这一次会不会定罪 */
          if(G.simStats&&oldQuantifierWouldFire(w,a.i,ab.roomId))
            G.simStats.contradictionOld=(G.simStats.contradictionOld||0)+1;
          if(r.checked===0||r.match)continue;
          /* 2026-11-05：只有**案发舱室**的目击才算「对不上」。
             被看见在食堂并不否定「我当时在配电室」—— 他可能只是路过；
             但被看见在死者所在的舱室、而他说自己在别处，那才是真矛盾。
             这条对人类和异形是同一把尺子（以前异形根本不进这段）。 */
          if(cw&&vi&&r.evidence.room!==vi.roomId)continue;
          /* 同一场会议里，**同一个人**只吃一次口供矛盾（2026-11-02）。
             原来 n 个目击者各记 0.28，一个人被三个人看见就叠 0.84 ——
             「拆谎太准」的一半其实是重复计账。现在按目标去重，权重不降、次数不刷。 */
          if(contraHit.has(a.i))continue;
          contraHit.add(a.i);
          /* 2026-11-05 G3 · 可达性反事实：被看见在 A 舱却说在 B 舱，
             还要问「这点时间走得到吗」。走不到才把矛盾当强证据；
             走得到就只是「可能路过」，权重维持原值。 */
          const reach=counterfactualReach(r.evidence.room,ab.roomId,r.age);
          const hardReach=reach&&!reach.possible;
          if(hardReach&&G.simStats)G.simStats.reachImpossible=(G.simStats.reachImpossible||0)+1;
          /* 2026-11-21 平衡修：每夜每观察者对同一人最多记 1 条对质（why.reason 维度去重）。
             旧制 0.28×N 要两条才到 0.5 指控线；新制 15 分 × 5 个观察者 = 75 分 =
             从先验 73 直接跌穿 0 线（准-确证异形），100 局异形 0%。 */
          if(!((w.mind.why&&w.mind.why[a.i]||[]).some(x=>x.reason==='contradiction'&&x.night===G.night)))
            susAddContradiction(w,a.i,SKSanity.MAPPING.contradiction,'contradiction',r.evidence);
          /* 2026-11-08 用户裁定「落实 AI 因为证词对不上而减分的机制」：
             矛盾不能只给被质疑者加嫌疑，还要**扣说话者的可信度** ——
             听众会记着"他刚才说的位置是假的"，之后他说的话就没那么值钱。
             这条以前是死配置：`RELIA.caughtLie` 声明了，但从未被 reliaAdd 用到。
             只影响"别人信不信他"，不影响他自己信什么（known 红线不动）。 */
          reliaAdd(w,a.i,-SKSanity.RELIA.caughtLie,'caught_lie');
          G.caughtLieN=(G.caughtLieN||0)+1;
          /* 留一对「谁戳穿了谁」给会议排期用（非模拟局会说出口，模拟局只记分）。
             只留第一对：真人会议上也不会全场轮流复读同一句质疑。 */
          if(!ctx.contra)ctx.contra={w:w,a:a,seen:roomNameById(r.evidence.room),age:r.age};
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
      /* 先发制人（2026-11-08 用户裁定）：异形可以抢在人类之前定调，
         甚至作为全场第一句话说「某人是异形」。必须先算 —— 这样
         `speakOrder` 能把它排到最前，`humanHeat` 也能把它的靶子
         当成"场上已有的声音"传给同类（定调就是为了让人跟）。 */
      ctx.opening=planFirstAccuse({kind});
      /* 表态顺序（2026-11-06 起是「人类先、异形后」；2026-11-08 用户裁定
         先发制人者例外：它排最前，其余仍按人类先、异形后）。
         这一排序只改「谁先算」，不改任何人的判据；`sort` 是稳定排序。 */
      const isOpen=x=>!!(ctx.opening&&ctx.opening.by===x);
      const speakOrder=G.agents.slice().sort((x,y)=>
        (isOpen(y)?1:0)-(isOpen(x)?1:0)||
        (x.alien?1:0)-(y.alien?1:0)||x.i-y.i);
      let humanHeat=null;   /* 人类咬人的公开热度快照，第一只异形表态时算一次 */
      for(const a of speakOrder){
        a.accuse=null;a.accuseWhy=null;a._busTarget=null;a._abstain=false;
        /* 2026-11-20：态度台账随 accuse 一起清空 —— 一场会议一份，不跨会累积 */
        a._sup=null;
        if(a.alien&&a.alive&&!a.downed&&(a!==G.me||G.spectMode)){
          /* 热度快照：只数**人类**当众咬的人。异形之间不互相传染 ——
             否则第一只踩的人等于替所有同类选靶子，四票会在同一帧里"商量好"。 */
          if(!humanHeat){
            humanHeat={};
            for(const x of G.agents){
              if(x.alien||!x.alive||x.downed||x.accuse==null)continue;
              /* 2026-11-08 优化：只数**软指控**。被人类用确证咬的人基本就是
                 真异形，跟上去等于送队友；只有"没硬证、只是怀疑"的靶子，
                 才是异形可以放大成冤案的热靶。 */
              if(x.accuseWhy&&x.accuseWhy.known)continue;
              humanHeat[x.accuse]=(humanHeat[x.accuse]||0)+1;
            }
            /* 先发制人的靶子本身就是"场上已有的声音"——定调就是为了让人跟 */
            if(ctx.opening&&ctx.opening.target!=null)
              humanHeat[ctx.opening.target]=
                (humanHeat[ctx.opening.target]||0)+SKSanity.FIRST.leadMul;
          }
          /* 先发制人者（2026-11-08）：本场第一个开口，直接把矛头指死。
             跳过 social / mislead 分支 —— 它已经有靶子了，不需要再挑。 */
          if(isOpen(a)){
            a.accuse=ctx.opening.target;
            a.accuseWhy={kind:ctx.opening.kind,room:ctx.opening.room,
              reason:'亲眼看见',solid:true,fake:true,opening:true};
            alienAccused.add(a.accuse);
            if(!ctx.lead[a.accuse])ctx.lead[a.accuse]=a.i;
            /* 用 G 上的独立计数器：真实对局没有 G.simStats，门禁要能读到 */
            G.firstAccuseN=(G.firstAccuseN||0)+1;
            continue;
          }
          // 异形 AI：整场会议只用一个假口供，避免前后矛盾；玩家异形不参与自动指控
          /* 假口供要**站得住**（2026-11-05）：优先说「我现在待的这间」——它真的在这，
             别人也见过它在这，时间线对得上；撑不住时才随口编一间没去过的。
             以前永远随机挑一间没去过的房间，等于每次会议都在赌没人看见自己，
             一旦自述进对质就必然穿帮（1000 局里异形被逐 +0.46/局）。 */
          /* 只有**本夜真的动过手**才需要编口供（2026-11-05）。
             没杀人的那夜它说真话：_lie=null，alibiOf 回落到它真实所在的舱室。
             这才是"同类口供一套判据"能成立的前提 —— 判据一样，但**行为分布**不一样：
             真人没做亏心事时不撒谎，异形也只有作案那夜才需要编。
             以前是每场会议都编一间没去过的房，等于每次都在赌没人看见自己。 */
          /* 2026-11-21 用户裁定「异形所有行为都有伪装成分、会撒谎保护自己」：
             **每晚都编一套站得住的口供**（不再只在杀人夜）——
             优先说"本夜停留最久、且不是案发舱"的那一间：
             它真的在那儿待过，目击者的记忆更容易对上，对质不成立；
             没有记录才随机挑一间没去过的。 */
          {
            const stay=a._stay||{};
            const crime={};
            for(const x of G.agents){if(x.deathRoom)crime[x.deathRoom]=1;}
            const cands=Object.entries(stay)
              .filter(([rid])=>rid!=='corridor'&&rid!=='unknown'&&!crime[rid]&&!used.has(rid))
              .sort((x,y)=>y[1]-x[1]);
            let r=cands.length?M.rooms.find(x=>x.id===cands[0][0]):null;
            if(!r){
              const rooms=M.rooms.filter(x=>!used.has(x.id)&&x.id!=='bridge');
              r=rooms.length?rooms[Math.floor(Math.random()*rooms.length)]:M.rooms[0];
            }
            used.add(r.id);
            const pts=M.points.filter(p=>roomIdAt(p.x,p.y)===r.id);
            a._lie={room:r.name,roomId:r.id,task:pts.length?pts[Math.floor(Math.random()*pts.length)].label:'配电盘'};
          }
          /* 只用自己目击推断出的队友（a.mates）做保护，不读取系统队友表；
             未识别的目标仍然可能被指控/投票，保持“同类也会被攻击”的规则。 */
          const allPool=G.agents.filter(x=>x!==a&&x.alive&&!x.downed&&!isMate(a,x.i));
          const clean=allPool.filter(x=>!x.detained);
          const pool=clean.length?clean:allPool;
          /* 顺势优先（2026-11-06）：场上已经有人咬的人，才值得跟着咬。
             没有靶子时退回原来的身份轴加权；`fresh` 只在退回分支里生效，
             避免"全场都在咬 A"的时候，异形为了不撞车去咬一个没人怀疑的人。 */
          const social=alienSocialPick(a,pool,humanHeat);
          let pick=social.i!=null?G.agents[social.i]:null;
          if(!pick){
            const fresh=pool.filter(x=>!alienAccused.has(x.i));
            pick=weightedHostileTarget(a,fresh.length?fresh:pool);
          }
          /* 2026-11-21 用户裁定「压制异形诬陷率」：不是每场都开口 ——
             普通构陷每场每人 alienAccuseRate(0.13)，被公开指控时走自保反咬(0.55)。
             这样异形的指控频率 ≈1.2 次/人/局，与人类人均 0.95 同量级（略高）。 */
          const mobOnMe=G.agents.some(x=>x&&x!==a&&x.alive&&!x.downed&&x.accuse===a.i);
          const pSpeak=mobOnMe?(SKSanity.SPEECH.alienHitBackRate||0.55)
                              :(SKSanity.SPEECH.alienAccuseRate||0.13);
          a.accuse=(pick&&Math.random()<pSpeak)?pick.i:null;
          if(a.accuse!=null){
            alienAccused.add(a.accuse);
            if(social.why==='pile'&&G.simStats)
              G.simStats.alienPileOns=(G.simStats.alienPileOns||0)+1;
          }
          /* ---- 主动诬陷（2026-11-01）----
             异形自己就是凶手，根本没看见别人出刀 —— 但它会**编一份具体证词**：
             "我看见他在<房间>出刀 / 钻管道"。以前它只是随机指一个人，听众一算就知道
             它没有依据（还会被 empty_accuse 罚）。现在给伪证，在听众眼里
             它和真目击者无法区分 —— 这是社交推理里最难拆的一手。 */
          if(a.accuse!=null&&Math.random()<SKSanity.MISLEAD.chance){
            /* 2026-11-21 用户裁定：异形**平时说软话**（时间线对不上 / 举止反常 / 听来的），
               只有被公开指控反咬、或小概率（hardLine）才说"我看见他出刀/红光"——
               硬话太招摇，而且玩家能靠"谁总说硬话"反推身份。
               机制强度不变：solid 仍为 true（不因话软而降级）。 */
            /* 被指控反咬时**更可能**说硬话（自保要强硬），但不是必定 ——
               100% 会让"只要被咬就一定说看见出刀"成为可识别特征。 */
            const hard=(mobOnMe&&Math.random()<0.75)||
              Math.random()<(SKSanity.MISLEAD.hardLine||0.15);
            if(hard){
              const rs=M.rooms.filter(x=>x.id!=='bridge');
              const rr=rs.length?rs[Math.floor(Math.random()*rs.length)]:M.rooms[0];
              /* 2026-11-21 用户裁定：异形也会说「被刀认凶」——它没挨刀也能这么讲，
                 撒谎本来就是它的能力；硬话池按人类分布配比（出刀/红光/管道/破坏/
                 开枪/被刀），玩家无法靠"它说不出被刀"反推。 */
              const hardPool=['saw_knife','saw_red','saw_pipe','saw_sabotage',
                'saw_shot','saw_knife_self','saw_knife_self'];
              const k2=hardPool[Math.floor(Math.random()*hardPool.length)];
              a.accuseWhy={kind:k2,room:rr.name,reason:'亲眼看见',solid:true,fake:true};
            }else{
              const soft=['sus_high','quick_report','heard_frame','near_body','heard_claim'];
              const k=soft[Math.floor(Math.random()*soft.length)];
              a.accuseWhy={kind:k,room:null,
                reason:(k==='heard_frame'?'听人说的':(k==='quick_report'?'报案时就觉得不对':'举止反常')),
                solid:true,fake:true,soft:true};
            }
          }
          /* 2026-11-21 用户裁定「压制异形抢领导能力」：只有小概率成为带头者 ——
             异形的指控大概率"混在对话里"（只贡献 heard_frame 声势），
             不当 lead，翻牌追责也就不会落在它头上（改由真正带头的人类承担）。
             先发制人分支不在此限（那是专门的"小概率抢第一句"通道）。 */
          if(a.accuse!=null&&a.accuseWhy&&a.accuseWhy.solid&&!ctx.lead[a.accuse]&&
            Math.random()<(SKSanity.SPEECH.alienLeadRate||0.12))
            ctx.lead[a.accuse]=a.i;
        }else{
          /* 人类：确证优先（见过出刀/钻管道/破坏/红身）→ 准-确证 → 目击凶手 → 嫌疑分 */
          const kn=bestKnownTarget(a);
          const afRaw=bestAlmostTarget(a);
          const al=(!kn&&afRaw&&hostileTo(a,afRaw))?afRaw:null;
          let si=kn?kn.i:(a.suspect!=null?a.suspect:null);
          /* 明牌人类队友不再点名（2026-11-20）：旧 suspect 必须在这里失效 */
          if(si!=null&&!a.alien&&a.mind&&a.mind.knownHuman&&a.mind.knownHuman[si])si=null;
          if(si==null&&al)si=al.i;
          if(si==null){const bs=bestSusTarget(a,SKSanity.SPEECH.humanAccuseSus);if(bs)si=bs.i;}
          /* 正向信任（2026-11-01）：手上没有确证时，一个长期在干正经事的人
             不该被一点嫌疑推上审判台。cred 越高越不会被咬 —— 这就是洗白的兑现口。
             2026-11-01 加 almost.friend：装够几夜的异形在这里能真的挡掉一次点名。
             2026-11-20 用户裁定「人类指控欲望太弱」：**自己亲眼看见的 `suspect` 不吃名声护盾** ——
             "我亲眼看见他拖尸/拉闸，他平时再像好人，我也得点名"；护盾只挡传闻与弱嫌疑。
             `known` / `almost` 的既有分支不动。 */
          /* 2026-11-21 用户第三批裁定：护盾并入 T —— 信任盈余到准-确证人类线
             （T−prior ≥ 200，即 T=200 封顶态）才免于点名；其余按 beliefOf 正常评估 */
          if(si!=null&&!kn&&si!==a.suspect&&
            (a.mind.T||{})[si]!=null&&(a.mind.T||{})[si]>=SKSanity.AXIS.cap)si=null;
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
                {kind:'saw_alien',room:null,reason:'亲眼目击',solid:true}:
                /* 2026-11-21 用户裁定「人类也会用软指控」：凭弱嫌疑点名时给一句
                   软话（举止反常 / 时间线对不上），不再留空 accuseWhy 被当成哑口。 */
                {kind:'sus_high',room:null,reason:'举止反常',solid:false,soft:true})));
            /* evidenceReason 是"真看见/真取证"，返回的对象默认也算硬证词。
               2026-11-21 修左右脑互搏：**反证不算目击**。contradiction 这类
               推断型 why 条目（kind 从记忆证据借来 saw_agent）不再自动升 solid ——
               它是"他的口供跟我看见的对不上"，不是"我看见他动手"。
               以前它会混进 pubSolidAccusers，被当成"确证证人"：
               玩家构陷一句被听众记忆拆穿的假话时，knownW 命中 → 拆谎分支被跳过，
               假话照旧记成 heard_claim，等于帮玩家作弊。 */
            if(a.accuseWhy&&a.accuseWhy.solid==null)
              a.accuseWhy.solid=!!(typeof a.accuseWhy.reason==='string'&&
                a.accuseWhy.reason.indexOf('saw_')===0);
            /* 只有"有依据"的指控才算带节奏；纯情绪指控不进 lead（否则追责会误伤） */
            if(a.accuseWhy&&a.accuseWhy.solid&&!ctx.lead[a.accuse])ctx.lead[a.accuse]=a.i;
          }
        }
      }
      /* 先发制人的附议者（2026-11-08）：与主 liar 咬同一个人，制造声势。
         这里只统一"票型"（accuse）；传闻证据在台词说出口时才写，
         与"说出口才算数"的既有口径一致。 */
      if(ctx.opening&&ctx.opening.by&&ctx.opening.allies.length){
        for(const x of ctx.opening.allies){
          if(!x.alive||x.downed)continue;
          x.accuse=ctx.opening.target;
          x.accuseWhy={kind:ctx.opening.kind,room:null,reason:'协同附议',
            fake:true,opening:true};
          /* 附议者同样不抢 lead（2026-11-21：异形只加声势，不当带头） */
          if(x.alien)continue;
          if(!ctx.lead[ctx.opening.target])ctx.lead[ctx.opening.target]=x.i;
        }
      }
      /* 指控阵营分布（2026-11-20 只统计、不改判据）：用来验证"人类是不是只剩异形在指控"。
         统计口径 = 本场会议里每一个真的带靶子的人，含先发制人与附议。 */
      for(const x of G.agents){
        if(!x.alive||x.downed||x.accuse==null)continue;
        /* 2026-11-21：异形记住「谁公开指过我」—— 这是当着所有人面发生的事，
           写进私有 _accusedBy 供下夜灭口（不读心，不写 T/E）。 */
        if(!x.alien){
          for(const y of G.agents){
            if(y&&y.alien&&y.alive&&y!==x){ y._accusedBy=y._accusedBy||{}; y._accusedBy[x.i]=G.night; }
          }
        }
        if(x.alien)G.accuseAlienN=(G.accuseAlienN||0)+1;
        else G.accuseHumanN=(G.accuseHumanN||0)+1;
        /* 语言分布审计（2026-11-21）：按阵营统计指控用的"话术 kind"，
           用来验证玩家不能靠"谁总说硬话"反推身份。 */
        {
          const K=(x.accuseWhy&&x.accuseWhy.kind)||'none';
          G.kindByFaction=G.kindByFaction||{};
          const kk=(x.alien?'A:':'H:')+K;
          G.kindByFaction[kk]=(G.kindByFaction[kk]||0)+1;
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
            ctx.testimony.push({li:w.i,by:a.i,tgt:a.i,wgt:0.05,reason:'empty_accuse',ev});
          }else if(a.accuse!==w.i&&!(w.mind.known&&w.mind.known[a.accuse])){
            /* ---- 证言通道（2026-11-01 接线）----
               有依据的公开指控会**真的改变听众的判断**，而不是只当台词播出去。
               在此之前，AI 之间的指控对别人的 sus 一点影响都没有（17 个 susAdd 调用点
               里没有一条是 heard_accuse）—— 结果是"我确定 05 是异形"只是说说，
               目击者只有自己那一票，旧版 3 票门槛全靠运气。
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
            const wgt=(solid?0.020:0.006)*SKSanity.credTestimony(trust*SKSanity.AXIS.cap)*dirty*coMul*relia;
            const ev={kind:'heard_accuse',x:0,y:0,
              room:a.accuseWhy?a.accuseWhy.room:null,conf:0.6,src:'speech',subj:a.accuse,
              by:a.i};
            ctx.testimony.push({li:w.i,by:a.i,tgt:a.accuse,wgt,reason:'heard_accuse',ev});
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
            susAdd(w,a.i,SKSanity.MAPPING.presenceDeny,'presence_deny',
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
         · 只有**平时真说过话**的人沉默才可疑（talkN 可观察，不读性格轴）；
         · 玩家席位不算（玩家不打字不等于沉默）。 */
      for(const a of G.agents){
        if(a.alien||!a.alive||a.downed||!a.mind)continue;
        if(a===G.me&&!G.spectMode)continue;
        if(a.accuse!=null||a.accuseWhy)continue;
        if(G.agents.some(x=>x.alive&&x.accuse===a.i))continue;
        const talkN=a.talkN||0;
        if(talkN<SKSanity.MIND.silentTalkMin)continue;
        const wgt=SKSanity.MIND.silentSus*
          (1+SKSanity.MIND.silentTalkMul*Math.min(1,talkN/SKSanity.MIND.silentTalkN));
        for(const w of G.agents){
          if(w===a||w.alien||!w.alive||w.downed||!w.mind)continue;
          /* 2026-11-02：从"只对白纸生效"放宽到"最多一条旧疑点"。
             不放宽的时候沉默几乎没有重量（14 次/局全打在白纸上）；
             完全放开又会让「跨夜存量 + 今天话少」凑成没有新证据的指控（实测误逐翻倍）。
             取中间：已经有两条以上疑点的人不再加沉默分 —— 沉默只负责"从 0 到 1"。 */
          if(((w.mind.why||{})[a.i]||[]).length>1)continue;
          if(!((w.mind.why&&w.mind.why[a.i]||[]).some(x=>x.reason==='silent'&&x.night===G.night)))
          susAdd(w,a.i,SKSanity.MAPPING.silent,'silent',
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
    function scheduleLeaderOrders(push){ const G=getG(), SND=getSND(), DEAD=getDead(), SIM_RUN=getSimRun(), TEST_RUN=getTestRun(), SIM_NO_DISCUSS=getSimNoDiscuss(), GAME_MODE=getGameMode();
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
    function fillTpl(a,s,ctx){ const G=getG(), SND=getSND(), DEAD=getDead(), SIM_RUN=getSimRun(), TEST_RUN=getTestRun(), SIM_NO_DISCUSS=getSimNoDiscuss(), GAME_MODE=getGameMode();
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
    function pickLine(a,arr,salt,ctx){ const G=getG(), SND=getSND(), DEAD=getDead(), SIM_RUN=getSimRun(), TEST_RUN=getTestRun(), SIM_NO_DISCUSS=getSimNoDiscuss(), GAME_MODE=getGameMode();
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
      /* 没有地点依据时，含 `{r}` 的句子**整句不选**（2026-11-18 P2-3）。
         以前靠 `fillTpl` 兜底填 '走廊'，等于让 AI 凭空说出一个具体舱室 ——
         "我没去过那儿"和"我看见他在那儿"在会议里是两种证据，不能靠缺省值伪造。
         过滤放在选句层而不是渲染层：宁可不说话，也不说假地点。 */
      if(!(ctx&&ctx.r))pool=pool.filter(s=>String(s).indexOf('{r}')<0);
      if(!pool.length)return '';
      /* 本局降权（2026-11-03 调研报告 P1-2）：同一句模板说得越多，权重越低 ——
       `1/(1+3n)`，最多重挑 3 次。真人不会在一局里把同一句话复读四遍，
       同一角色对同一目标第二次开口因此自然会换句式。
       去重记在 `G.lineUsed`（整局，不跨局），键是**模板本身**，占位符还没填，
       所以判的是"句式重复"而不是"整句字符串重复"——那才是玩家真正会察觉的东西。 */
      const used=(G.lineUsed||(G.lineUsed={}));
      /* 2026-11-08：**同人同场硬去重** —— 同一个角色在一场会议里不重复同一句式。
         实测 M3 里银翼连用两次「X 你改口了，上次你报的是 Y」，只换名字，一眼假。
         `_lineUsedMeet` 在每次 openMeeting 时清空。 */
      const mine=(a._lineUsedMeet||(a._lineUsedMeet={}));
      let raw='',pickIdx=0,fallback=null;
      for(let tries=0;tries<6;tries++){
        pickIdx=Math.floor(Math.random()*pool.length);
        const cand=pool[pickIdx], n=used[cand]||0;
        if(mine[cand]){ if(!fallback)fallback=cand; continue; }
        if(n===0||Math.random()<1/(1+3*n)){raw=cand;break;}
        if(!fallback)fallback=cand;
      }
      if(!raw)raw=fallback||pool[pickIdx]||pool[0];
      mine[raw]=1;
      const n0=used[raw]||0;
      used[raw]=n0+1;
      if(n0>0&&G.simMode&&G.simStats)G.simStats.lineDups=(G.simStats.lineDups||0)+1;
      return fillTpl(a,raw,ctx);
    }
    /* 从语料库直接取一句（不需要旧数组兜底的场景用这个） */
    function flavor(a,cat,ctx){ const G=getG(), SND=getSND(), DEAD=getDead(), SIM_RUN=getSimRun(), TEST_RUN=getTestRun(), SIM_NO_DISCUSS=getSimNoDiscuss(), GAME_MODE=getGameMode(); return pickLine(a,cat,0,ctx); }
    /* ---------------- 公开态度互斥（2026-11-20 用户裁定） ----------------
       用户现场：「修复一下 AI 说话左右脑互搏的行为，尽量不要让 AI 在一轮夜晚对话中
       表现出支持和指控两种态度。」
       成因：**支持**（背书 / 替人辩护）与**指控**（点名 / 跟票 / 收尾投票）是两条
       互不相干的通道，各自只查自己那一侧的条件。于是同一个人可以刚说完
       「先别投他，他昨晚就在仓库干活」，下一句又跟着点名他 —— 玩家看到的是
       一张嘴两副脑子。2026-11-18 只在 `pushEndorse` 补过一条「已指控的人不再背书」，
       但辩护、跟票、收尾三处都没接上，所以病还在。
       这里给每场会议立一份**态度台账**（`a._sup`，随 `a.accuse` 一起在
       buildMeetCtx 里清空）：谁对谁公开支持过就记一笔，此后同一目标的指控一律
       不开口；反过来，已经指控了谁，就不再支持他。
       只记账与拦截，**不改任何判据、权重与语料**；也没有新增概率。 */
    function stanceMark(a,tgt){ const G=getG(), SND=getSND(), DEAD=getDead(), SIM_RUN=getSimRun(), TEST_RUN=getTestRun(), SIM_NO_DISCUSS=getSimNoDiscuss(), GAME_MODE=getGameMode();
      if(!a||tgt==null)return;
      a._sup=a._sup||{};
      a._sup[tgt]=1;
    }
    function stanceSaidSupport(a,tgt){ const G=getG(), SND=getSND(), DEAD=getDead(), SIM_RUN=getSimRun(), TEST_RUN=getTestRun(), SIM_NO_DISCUSS=getSimNoDiscuss(), GAME_MODE=getGameMode();
      return !!(a&&a._sup&&tgt!=null&&a._sup[tgt]);
    }
    /* 被拦下的"反口"人次 —— 每次「某人本来要支持/指控某个自己已经持相反态度的目标」
       被挡下一次就记一笔。它统计的是**候选决策**，不是最终台词数：
       一场会议里同一个人可能被挡多次（背书 / 辩护 / 跟票 / 收尾各查一遍）。
       真实对局看 G.stanceBlockN，模拟局另记一份给蒙特卡洛。 */
    function stanceBlock(){ const G=getG(), SND=getSND(), DEAD=getDead(), SIM_RUN=getSimRun(), TEST_RUN=getTestRun(), SIM_NO_DISCUSS=getSimNoDiscuss(), GAME_MODE=getGameMode();
      G.stanceBlockN=(G.stanceBlockN||0)+1;
      if(G.simMode&&G.simStats)G.simStats.stanceBlocks=(G.simStats.stanceBlocks||0)+1;
    }
    /* 支持前的闸：已经指控他 → 不许支持；已经支持过 → 不再重复背书 */
    function canSupport(a,tgt){ const G=getG(), SND=getSND(), DEAD=getDead(), SIM_RUN=getSimRun(), TEST_RUN=getTestRun(), SIM_NO_DISCUSS=getSimNoDiscuss(), GAME_MODE=getGameMode();
      if(!a||tgt==null)return false;
      if(a.i===tgt)return false;
      if(a.accuse!=null&&a.accuse===tgt){stanceBlock();return false;}
      if(stanceSaidSupport(a,tgt))return false;
      return true;
    }
    /* 指控前的闸：已经公开支持过他 → 不许反口 */
    function canAccuseStance(a,tgt){ const G=getG(), SND=getSND(), DEAD=getDead(), SIM_RUN=getSimRun(), TEST_RUN=getTestRun(), SIM_NO_DISCUSS=getSimNoDiscuss(), GAME_MODE=getGameMode();
      if(!a||tgt==null)return false;
      if(stanceSaidSupport(a,tgt)){stanceBlock();return false;}
      return true;
    }
    /* 软约束（用户说的「尽量不要」）：优先让本场还没表态的人去当支持者 ——
       一个人不该在一轮对话里同时演两种态度。没有干净人选就退回原池，
       宁可让一个已表态的人再说一句，也不制造新的沉默。 */
    function preferNeutral(pool){ const G=getG(), SND=getSND(), DEAD=getDead(), SIM_RUN=getSimRun(), TEST_RUN=getTestRun(), SIM_NO_DISCUSS=getSimNoDiscuss(), GAME_MODE=getGameMode();
      if(!pool||!pool.length)return pool||[];
      const clean=pool.filter(x=>x&&x.accuse==null);
      return clean.length?clean:pool;
    }
    /* 会议收尾自检（防回退探针）：**同一个人不许既保某人又咬某人**。
       只读本场真正说出口的两本账 —— 背书 `ctx.vouches` 与辩护 `m.defenseLog` ——
       与该 AI 的 `accuse` 对照。命中记一次违例；正常应为 0。
       它不参与任何判定，只负责在日后有人又开一条"支持"通道时立刻报警。 */
    function auditStance(m){ const G=getG(), SND=getSND(), DEAD=getDead(), SIM_RUN=getSimRun(), TEST_RUN=getTestRun(), SIM_NO_DISCUSS=getSimNoDiscuss(), GAME_MODE=getGameMode();
      if(!m)return 0;
      let bad=0;
      const hit=(by,tgt)=>{
        const a=G.agents[by];
        if(!a||tgt==null||a.accuse==null||a.accuse!==tgt)return;
        bad++;
      };
      const vs=(m.ctx&&m.ctx.vouches)||[];
      for(const v of vs)hit(v.by,v.tgt);
      const dl=m.defenseLog||{};
      for(const k in dl){ const row=dl[k]||{}; for(const t in row)hit(+k,+t); }
      if(bad){
        G.stanceViolations=(G.stanceViolations||0)+bad;
        if(G.simMode&&G.simStats)
          G.simStats.stanceViolations=(G.simStats.stanceViolations||0)+bad;
      }
      return bad;
    }
    /* ---- 背书（2026-11-03 信任聚焦）----
       我亲眼看到某人干过足够多正经事 ⇒ 当众说一句"我信他 / 我跟他"。
       门槛复用 `CRED.accuseShieldAt`（与"不再当众指控他"是同一条线），**不新造数值**。
       一场会议最多一次 —— 不然会变成夸夸会，反而把信任又稀释成噪声。
       语料池（`SKLines` 的 `endorse`）没到位时整段跳过，绝不退化成在调用处硬写台词。 */
    function pushEndorse(push,cands){ const G=getG(), SND=getSND(), DEAD=getDead(), SIM_RUN=getSimRun(), TEST_RUN=getTestRun(), SIM_NO_DISCUSS=getSimNoDiscuss(), GAME_MODE=getGameMode();
      if(!push||!cands||!window.SKLines||typeof SKLines.pool!=='function')return;
      if(!SKLines.pool('endorse','cold'))return;
      /* 优先挑本场还没指控过别人的人来背书（软约束，见 preferNeutral） */
      for(const x of preferNeutral(cands)){
        if(!x||x.alien||!x.mind||!x.alive)continue;
        const tc=topCred(x);
        if(!tc)continue;
        if(x.mind.known&&x.mind.known[tc.i])continue;
        /* 2026-11-18 用户报的"左右脑互搏"：同一个 AI 先替某人背书、转头又指控他。
           背书与指控是互斥态度，已经指控的人一律不再背书（反过来由指控侧保证）。
           2026-11-20：闸门统一收进 canSupport —— 除了"已指控"，还挡掉"已经支持过"。 */
        if(!canSupport(x,tc.i))continue;
        const subj=G.agents[tc.i];
        if(!subj||subj===x||!subj.alive||subj.downed)continue;
        /* 态度台账：排期时就记，而不是等台词播完 —— 后文「跟票」「收尾」都在
           同一个同步段里决定，晚记一步就会被它们绕过去。 */
        stanceMark(x,subj.i);
        /* 2026-11-05 二组：背书是**公开事件**，听众当场要收到一条弱正向信任。
           以前只出声、不写分 —— 与 heard_frame 不对称，等于「通道少一条」。
           权重按 MAPPING.cap（15 分）以下的小额计分：只做软证据，压不过任何实证。
           写在 push 回调里、而不是排期时，是为了跟「发言 → 结算」的方向一致。 */
        push(()=>{
          /* 2026-11-18：背书句里有「他{when}在{r}」这种**替别人报位置**的句式，
             {r} 只能来自"我自己亲眼在那间见到他"的那条记忆，不能拿背书者自己的舱室冒充。 */
          const rm=seenRoomOf(x,subj.i);
          say(x.name,pickLine(x,roomSafePool('endorse',x,!!rm),0,
            {t:subj.name,r:rm||'',when:whenWord()}));
          for(const wv of G.agents){
            if(wv===x||!wv.alive||wv.downed||!wv.mind)continue;
            credAdd(wv,subj.i,0.05,'heard_vouch');
            evPush(wv,{kind:'heard_vouch',x:0,y:0,room:null,conf:0.45,
              src:'speech',subj:subj.i,by:x.i});
          }
          const mm=G.meet&&G.meet.ctx;
          if(mm)(mm.vouches=mm.vouches||[]).push({by:x.i,tgt:subj.i});
          if(G.simStats)G.simStats.vouchHeard=(G.simStats.vouchHeard||0)+1;
        });
        if(G.simMode&&G.simStats)G.simStats.endorses=(G.simStats.endorses||0)+1;
        return;
      }
    }
    /* 证据里的舱室名。**两种写法都要认**：真目击存的是 id，异形伪证存的是中文名
       （见 planAlienDeception 里 `room: rr.name`）。
       以前这里只走 roomNameById(id)，伪证传中文名就会渲染成「未知位置」——
       而 AGENTS 立的规矩是"伪证的措辞和真目击一字不差"，一个"未知位置"就把假话出卖了。 */
    function evRoomName(w){ const G=getG(), SND=getSND(), DEAD=getDead(), SIM_RUN=getSimRun(), TEST_RUN=getTestRun(), SIM_NO_DISCUSS=getSimNoDiscuss(), GAME_MODE=getGameMode();
      if(!w||!w.room)return '现场';
      const id=roomIdOfName(w.room);
      return id?roomNameById(id):'现场';
    }
    /* 证据短语（2026-11-03 语料工程）：以前每个 kind 只有一句话，
       五个人指控同一人就出现五条逐字复读。现在短语从 `SKLines.WHY` 抽同义变体，
       **只换措辞**：kind / solid / fake / known / sus / 投票一律不动。
       池子里的短语可以带 {r}（舱室）与 {t}（对象），按同一套槽位渲染。 */
    function evClause(w,who){ const G=getG(), SND=getSND(), DEAD=getDead(), SIM_RUN=getSimRun(), TEST_RUN=getTestRun(), SIM_NO_DISCUSS=getSimNoDiscuss(), GAME_MODE=getGameMode();
      if(!w)return SKLines.why('unknown');
      const key=w.kind==='saw_alien'?'saw_knife':(SKLines.WHY[w.kind]?w.kind:'unknown');
      return fillTpl(who||null,SKLines.why(key),
        {r:evRoomName(w),k:SKLines.CLAIM_ACT[w.claimKind]||'动手'});
    }
    function defenseClause(a,m){ const G=getG(), SND=getSND(), DEAD=getDead(), SIM_RUN=getSimRun(), TEST_RUN=getTestRun(), SIM_NO_DISCUSS=getSimNoDiscuss(), GAME_MODE=getGameMode();
      const seen=seenNames(a,{aliveOnly:true});
      /* 辩护三种口（2026-11-03 内联池迁移）：有同行人 → 请他作证；
         只听见动静 → 承认听到但否认行动；孤身一人 → 声明位置并**划清与案发舱室的关系**。
         以前每条只有 1 句、全场共用，是"这句我听过"的稳定来源。
         ⚠ `{r2}` 必须是案发的舱室（来自 victimInfo），不能退化成"现场"这种空指 ——
         原句就是「但我没去过<案发舱室>」，那才是可被别人核对的信息。 */
      const vi=(m&&m.ctx)?m.ctx.victimInfo:null;
      const myRoom=alibiOf(a).room;
      if(seen.length)return pickLine(a,'respond_witness',0,
        {u:seen[0].name,r:myRoom,when:whenWord()});
      if(a.mind&&a.mind.alert>0.5)return pickLine(a,'heard_deny',0,
        {r:myRoom,when:whenWord()});
      /* 2026-11-08 修：自述舱室 == 案发舱室时，`respond_alone` 的
         「我在{r}…但我没去过{r2}」会变成自相矛盾（实测原句：
         "我一个人在走廊，没人看见也正常；但我没去过走廊"）。
         这种情况改用不引用案发舱室的那一档语料。 */
      if(vi&&vi.room&&myRoom===vi.room)
        return pickLine(a,'respond_alone_same',0,{r:myRoom,when:whenWord()});
      return pickLine(a,'respond_alone',0,
        {r:myRoom,r2:vi?vi.room:'现场',when:whenWord()});
    }
    /* 开场句与自述句（2026-11-03 内联池迁移）
       以前这两处各只有 2~4 条**硬写在调用处**，而它们是每场会议必说的句子 ——
       语料池扩到 850 行之后，玩家最先穿帮的恰恰还是这两句，所以必须一起搬进 SKLines。
       槽位：{r} 舱室 · {t} 对象 · {k} 死因/任务 · {when} 时间词。
       「尸体被移动过 / 我已检查伤口」这两个附注仍然按实际状态拼接，不进语料。 */
    function openingLine(a,m){ const G=getG(), SND=getSND(), DEAD=getDead(), SIM_RUN=getSimRun(), TEST_RUN=getTestRun(), SIM_NO_DISCUSS=getSimNoDiscuss(), GAME_MODE=getGameMode();
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
    function alibiLine(a,m){ const G=getG(), SND=getSND(), DEAD=getDead(), SIM_RUN=getSimRun(), TEST_RUN=getTestRun(), SIM_NO_DISCUSS=getSimNoDiscuss(), GAME_MODE=getGameMode();
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
      /* R13.10：词序 = **证据强弱序**（同路人 > 已完成的活 > 位置）。
         公开口径两条：「任务才是最硬的口供」「两人不在一起就不构成 alibi」
         （§14.4 有逐字摘录）。旧实现固定用 `stem_room`（"我在哪儿"）开头，同路与任务
         只能挂在后半 —— 实测 40 局里 `我+时间+舱室` 开头占 29.5%，玩家听到的前三句
         因此清一色同款。**全部复用既有三个池，不新建类别、不加额度**；
         同路句的地点仍只能来自 `seenRoomOf`，查不到就由 `roomSafePool` 整句不选。
         池子里的词干与子句都不带句号（沿用原口径），所以这里按句拼装再统一补标点。 */
      const parts=[];
      /* 子句池历史上是**接在词干后面**的，所以句首带「，」、句尾带「。」。
         换成可以前置之后，两头都得剥干净，否则会拼出「，铁砧也在那儿。」这种开头。
         只剥两端，不动句中 —— 池子里万一有两句，中间那个句号得留着。 */
      const addFrag=s=>{s=String(s||'').replace(/^[，、；。\s]+/,'')
        .replace(/[，、；。\s]+$/,'').trim();if(s)parts.push(s);};
      const stem=()=>pickLine(a,'stem_room',0,
        {r:f.room,when:whenWord(),k:f.task||'任务'});
      if(f.witnesses.length){
        const w0=f.witnesses[0],wm=seenRoomOf(a,w0.i);
        addFrag(pickLine(a,roomSafePool('mate_clause',a,!!wm),0,
          {r:wm||'',t:w0.name,when:whenWord()}));
        addFrag(stem());
        if(f.task)addFrag(pickLine(a,'task_done_clause',0,{k:f.task}));
        else if(f.nextTask)addFrag(pickLine(a,'task_next_clause',0,{r:f.nextRoom,k:f.nextTask}));
      } else if(f.task){
        addFrag(pickLine(a,'task_done_clause',0,{k:f.task}));
        addFrag(stem());
      } else {
        addFrag(stem());
        if(f.nextTask)addFrag(pickLine(a,'task_next_clause',0,{r:f.nextRoom,k:f.nextTask}));
        else addFrag(pickLine(a,'task_none_clause',0,{}));
      }
      let line=(parts.length?parts.join('。')+'。':'');
      const why=a.accuse!=null?(a.accuseWhy||evidenceReason(a,a.accuse)):null;
      /* 2026-11-01：异形也会**公开指控**（诬陷），不再限制 !a.alien。
         伪证的措辞和真目击一字不差 —— 听众无从分辨，这正是诬陷的意义。 */
      if(why){
        /* 2026-11-08 第 6 批：自述里的指控尾句也走 evidenceCore。
           以前这里只拼 evClause（可能是"他跟现场对不上"），缺动作；
           现在固定先给"我看见他{动作}"，再用 evClause 补细节 —— 四要素齐。 */
        const tt=G.agents[a.accuse];
        const core=evidenceCore(a,why,tt,m);
        let tail=core.tail.replace(/。$/,'');
        /* 细节句照旧取出（消耗同一处随机流），但只在一部分席位/目标上拼进去；
           不用新的 Math.random —— 文本批次不改随机路径，否则同 seed 的胜率会被挪位。 */
        const detail=evClause(why);
        if(((a.i+a.accuse)%3)!==0)tail+='——'+detail;
        line+=' '+tail+'。我投'+nameOf(a.accuse)+'。';
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
    function pickChallenge(claims,cands){ const G=getG(), SND=getSND(), DEAD=getDead(), SIM_RUN=getSimRun(), TEST_RUN=getTestRun(), SIM_NO_DISCUSS=getSimNoDiscuss(), GAME_MODE=getGameMode();
      for(const s of claims){
        const c=cands.find(x=>x!==s.a&&alibiOf(x).room===s.room&&!seenNames(x).includes(s.a));
        if(c)return {c,s,kind:'doubt'};
      }
      for(const s of claims){
        /* 2026-11-18：支持与指控互斥 —— 已经要投这个人的人，不能再跳出来替他作证
           （"一会说支持、一会说他是异形"就是这么来的）。 */
        const c=cands.find(x=>x!==s.a&&x.accuse!==s.a.i&&seenNames(x).includes(s.a));
        if(c)return {c,s,kind:'support'};
      }
      const s=claims[claims.length-1];
      if(!s)return null;
      const c=cands.find(x=>x!==s.a);
      return c?{c,s,kind:'ask'}:null;
    }
    function challengeText(ch){ const G=getG(), SND=getSND(), DEAD=getDead(), SIM_RUN=getSimRun(), TEST_RUN=getTestRun(), SIM_NO_DISCUSS=getSimNoDiscuss(), GAME_MODE=getGameMode();
      /* 对质与回应（2026-11-03 内联池迁移）：这三段以前每个只有 3 条硬写在调用处，
         而它们是**玩家每次发言都会触发**的回应 —— 池子小就等于每两三局原句重演。
         {r} = 对方声称的舱室，{r2} = 案发舱室，{u} = 被提到的第二人。 */
      if(ch.kind==='doubt')return pickLine(ch.c,'doubt_room',0,
        {t:ch.s.a.name,r:ch.s.room,when:whenWord()});
      if(ch.kind==='support')return pickLine(ch.c,'support_claim',0,
        {t:ch.s.a.name,r:ch.s.room,when:whenWord()});
      return pickLine(ch.c,'ask_alone',0,{t:ch.s.a.name,when:whenWord()});
    }
    function respondText(ch,m){ const G=getG(), SND=getSND(), DEAD=getDead(), SIM_RUN=getSimRun(), TEST_RUN=getTestRun(), SIM_NO_DISCUSS=getSimNoDiscuss(), GAME_MODE=getGameMode();
      const s=ch.s;
      if(ch.kind==='support')return pickLine(s.a,'respond_support',0,
        {t:ch.c.name,r:alibiOf(s.a).room,when:whenWord()});
      const vi=m.ctx.victimInfo;
      if(s.a.alien)return pickLine(s.a,'alien_dodge',0,
        {u:vi?vi.name:'那件事',r:alibiOf(s.a).room,when:whenWord()});
      const f=alibiOf(s.a);
      if(f.witnesses.length)return pickLine(s.a,'respond_witness',0,
        {u:f.witnesses[0].name,r:f.room,when:whenWord()});
      return pickLine(s.a,'respond_alone',0,
        {r:f.room,r2:vi?vi.room:'现场',when:whenWord()});
    }
    /* 人类完整证言的前缀（2026-11-08 用户裁定「人类也加完整证言」）
       ------------------------------------------------------------
       第 4 批把异形台词压下去之后，四要素齐全率只剩 ~6%：人类的指控大多
       只有对象，位置 / 时间 / 动作三缺二。真人指控通常先说清"我在哪、
       什么时候、看见什么"，再指人 —— 这四样凑齐，听的人才可能复核。
       口径：
         · 有硬证（saw_*）→ 说我看见的动作 + 案发舱室；
         · 有 suspect（目击凶手）→ 说我看见他动手；
         · 纯怀疑 → **用反证**："我{when}在{my}，没看见他出刀或钻管道" ——
           这是真实的（他确实在那儿、确实没看见），绝不编造目击。
       只给**指控**加前缀；自述 / 辩护不动。 */
    function actWord(kind){ const G=getG(), SND=getSND(), DEAD=getDead(), SIM_RUN=getSimRun(), TEST_RUN=getTestRun(), SIM_NO_DISCUSS=getSimNoDiscuss(), GAME_MODE=getGameMode();
      const m={saw_pipe:'钻管道',saw_knife:'出刀',saw_sabotage:'破坏设备',
        saw_bot:'停摆机器人',saw_shot:'开枪',saw_breaker:'拉闸',
        terminator:'身份公开是异形',saw_drag:'拖尸体',saw_drag_away:'拖尸体'};
      return m[kind]||'带着刚出刀的红光';
    }
    /* 证言的"四要素核"：时间 / 位置 / 动作 / 对象。
       人类与异形共用这一条生成路径 —— 这就是「语言对称」：
       两边都能说出结构一致的证词，区别只在内容真假，不在句式。
       返回 {lead, tail}：
         · lead 用于独立指控句（自己带"我{when}在{room}"）；
         · tail 用于自述句的尾句（自述已经说过时间和自己的位置）。 */
    function evidenceCore(a,why,t,m){ const G=getG(), SND=getSND(), DEAD=getDead(), SIM_RUN=getSimRun(), TEST_RUN=getTestRun(), SIM_NO_DISCUSS=getSimNoDiscuss(), GAME_MODE=getGameMode();
      const my=alibiOf(a).room||'现场';
      const when=whenWord();
      const kn=bestKnownTarget(a);
      const knownHit=!!(kn&&t&&kn.i===t.i);
      /* 2026-11-21 修左右脑互搏（语言面）：反证型疑点不是目击。
         contradiction 条目的 kind 是从记忆证据借来的 saw_agent，旧写法拿它
         当"我亲眼看见他{动作}"，等于让一个只核过口供的 AI 凭空作伪证。
         异形的伪证（fake:true）不受此限 —— 它本来就是故意冒充目击。 */
      const contra=!!(why&&!why.fake&&typeof why.reason==='string'&&
        why.reason.indexOf('contradiction')===0);
      const sight=!contra&&(knownHit||!!(why&&String(why.kind||'').indexOf('saw_')===0));
      /* 终结者明牌不是"我看见他出刀"，是公开身份 —— 台词不能伪造目击动作 */
      if(knownHit&&kn.known&&kn.known.kind==='terminator'){
        return {
          lead:'终结者时刻身份已经公开，我确认他是异形。',
          tail:'他的身份是公开的异形。',
        };
      }
      if(why&&typeof why.reason==='string'&&why.reason==='followed'&&t){
        /* 被跟随的控诉（2026-11-21 新机制发言受体）：说出口 → 听众按 heard_accuse 结算 */
        const ln=pickLine(a,'followed_me',0.5,{t:t.name});
        return { lead:ln, tail:ln };
      }
      if(why&&typeof why.reason==='string'&&why.reason==='loot_bullet'&&t){
        const ln=pickLine(a,'loot_bullet_sus',0.5,{t:t.name});
        return { lead:ln, tail:ln };
      }
      if(contra&&t){
        const roomSeen=why.room?evRoomName(why):'';
        return {
          lead:'我'+when+'在'+my+'，'+t.name+'的口供跟我的目击对不上'+
            (roomSeen&&roomSeen!=='现场'?'——'+roomSeen+'那次':'')+'。',
          tail:t.name+'的口供跟我的目击对不上。',
        };
      }
      if(sight){
        const kind=knownHit?kn.known.kind:why.kind;
        const evRoom=knownHit
          ?(kn.known.room?roomNameById(kn.known.room):'')
          :(why.room?evRoomName(why):'');
        const inRoom=(evRoom&&evRoom!=='现场'&&evRoom!==my)?('在'+evRoom):'';
        const act=actWord(kind);
        return {
          lead:'我'+when+'在'+my+'，亲眼看见他'+inRoom+act+'。',
          tail:'我看见他'+inRoom+act+'。',
        };
      }
      if(a.suspect!=null&&t){
        const vi=m&&m.ctx?m.ctx.victimInfo:null;
        const vn=vi?vi.name:'人';
        return {
          lead:'我'+when+'在'+my+'，看见他对'+vn+'动了手。',
          tail:'我看见他对'+vn+'动了手。',
        };
      }
      return {
        lead:'我'+when+'在'+my+'，没看见他出刀或钻管道。',
        tail:'我没看见他出刀或钻管道。',
      };
    }
    function evidenceLead(a,why,t,m){ const G=getG(), SND=getSND(), DEAD=getDead(), SIM_RUN=getSimRun(), TEST_RUN=getTestRun(), SIM_NO_DISCUSS=getSimNoDiscuss(), GAME_MODE=getGameMode(); return evidenceCore(a,why,t,m).lead; }
    function accuseLine(a,m){ const G=getG(), SND=getSND(), DEAD=getDead(), SIM_RUN=getSimRun(), TEST_RUN=getTestRun(), SIM_NO_DISCUSS=getSimNoDiscuss(), GAME_MODE=getGameMode();
      if(a.accuse==null)return null;
      const t=G.agents[a.accuse];
      if(!t||!t.alive||t.downed)return null;
      const why0=a.accuseWhy||evidenceReason(a,a.accuse);
      const core=evidenceCore(a,why0,t,m);
      const lead=core.lead;
      const kn=bestKnownTarget(a);
      /* 确证档：人类与异形共用同一句式和同一个语料池（语言对称）。
         异形的"确证"只可能来自伪证（accuseWhy.solid），内容是假的，形式必须一样 ——
         否则玩家只要听谁说了"我确证"就能分辨阵营，等于把伪装机制白送。 */
      const fakeKnown=!kn&&a.alien&&why0&&why0.solid;
      /* 终结者明牌：不是"我看见他出刀"，而是"身份已经公开" */
      if(kn&&kn.i===a.accuse&&kn.known&&kn.known.kind==='terminator')
        return '身份已经公开：'+t.name+'是异形。我投'+t.name+'。';
      if((kn&&kn.i===a.accuse)||fakeKnown){
        const k=(kn&&kn.i===a.accuse)?kn.known.kind:why0.kind;
        const rm=(kn&&kn.i===a.accuse)
          ?(kn.known.room?roomNameById(kn.known.room):'现场')
          :(why0.room?evRoomName(why0):'现场');
        /* 「他是异形」这句**必须**留在池子里每一条中（known_accuse_hard 的语义底线：
           确证是结论不是怀疑，措辞要和普通指控拉开；门禁按 known 状态断言，不按字面）。
           这一档语料本身已经四要素齐（{when}{r}{k}{t}），所以**不再加 lead** ——
           否则会变成"我今晚在医疗间，亲眼看见他出刀。…今晚他在医疗间出刀"这种复读。 */
        return pickLine(a,'known_accuse_hard',0,
          {t:t.name,r:rm,k:actWord(k),when:whenWord()});
      }
      /* 语言对称（2026-11-08 第 6 批）：软指控也要先给"时间+位置+动作"，再给结论。
         异形与人类走同一条 evidenceCore；只是结论池一个偏含糊、一个偏情绪。 */
      if(a.alien)return lead+pickLine(a,'alien_accuse_soft',0,
        {t:t.name,when:whenWord()});
      /* 准-确证（almost.foe）：**可以说「我基本确定」，但绝不说「我亲眼看见」**——
         这是三档确信度的中间那一档，也是 `empty_accuse` 惩罚仍然有意义的前提。 */
      const af=almostFoeOf(a,a.accuse);
      if(af)return lead+pickLine(a,'almost',0,
        {t:t.name,conf:(af.conf*100|0),r:alibiOf(a).room,when:whenWord()});
      /* 2026-11-18（R12.7 / R12.8 语料落地）：**没有硬证据**时，人类 AI 改用自己
         真实的情绪与信誉来给理由 —— 记仇（他带头咬过我）/ 感恩（他救过我）/
         信誉负端（他反复带错节奏，说话不值钱）。判断层早就在用这三条轴
         （grudge / trust / cred），只是语料层一直说不出来，玩家听到的永远是
         一句"我没看见他出刀"——那不是人，是复读机。
         注意这里**不接 lead**：lead 是"我没看见"，和"我记着他上次咬我"是两句话，
         拼在一起会自相矛盾。 */
      if(why0==null&&a.suspect==null){
        const slot={t:t.name,r:alibiOf(a).room,when:whenWord()};
        /* 2026-11-20 两轴合并：理由只读 T（身份信任）与 E（情绪）。
           记仇 = E 负端；说话不值钱 = T 负端；救过我 = E 正端。 */
        const E=emotionOf(a,t.i), T=trustScore(a,t.i);
        if(E<=-0.5)return fillTpl(a,SKLines.why('wrong_lead'),slot)+'我投'+t.name+'。';
        if(T<=-0.3)return fillTpl(a,SKLines.why('low_cred'),slot)+'我投'+t.name+'。';
        if(E>=0.4)return fillTpl(a,SKLines.why('saved_me'),slot)+'我投'+t.name+'。';
      }
      if(a.suspect!=null)return lead+'我投'+t.name+'，不是猜的。';
      if(why0)return lead+'我投'+t.name+'。';
      /* 熵低（局面清楚）时语气更肯定；熵高时承认自己没看清 —— 都是人话 */
      if(a._hedge)return lead+pickLine(a,'hedge',0,
        {t:t.name,r:alibiOf(a).room,when:whenWord()});
      return lead+(pickLine(a,'accuse',0,{t:t.name,when:whenWord()})||
        ('我投'+t.name+'，他的说法和我看到的对不上。'));
    }
    /* 异形会议欺骗：被确证时先反驳，再可能反咬一个"钻管道 / 带红光"的假目击；
       没有被确证时偶尔主动搅浑水。假话只进 ctx.frames 与传闻嫌疑
       （heard_frame），永远不写 mind.known，也不改变真目击者的投票锁定。
       听众若用自己的 saw_agent 记忆抓到说谎者的假口供，会反过来怀疑说谎者。 */
    function planAlienDeception(m,cands,sureAcc){ const G=getG(), SND=getSND(), DEAD=getDead(), SIM_RUN=getSimRun(), TEST_RUN=getTestRun(), SIM_NO_DISCUSS=getSimNoDiscuss(), GAME_MODE=getGameMode();
      const out={frames:[],lines:[]};
      if(!m||m.kind==='pre')return out;
      const vi=m.ctx?m.ctx.victimInfo:null;
      const pool=G.agents.filter(x=>x.alive&&!x.downed&&(x!==G.me||G.spectMode));
      /* 2026-11-08：已经先发制人的人不再参与这一轮的构陷/反咬 ——
         它的靶子与口供已经在会议开头定好了，再被覆盖就会变成
         "嘴上说是 A、票上写 B"（门禁 B3 的 why.fake/opening 断言会抓这个）。 */
      const aliens=pool.filter(x=>x.alien&&!(x.accuseWhy&&x.accuseWhy.opening));
      if(!aliens.length)return out;
      const sureKn=sureAcc?bestKnownTarget(sureAcc):null;
      const sureTgt=sureKn?G.agents[sureKn.i]:null;
      let liar=null,counter=false;
      if(sureTgt&&sureTgt.alien&&(sureTgt!==G.me||G.spectMode)){
        liar=sureTgt;counter=true;
      }else if(Math.random()<SKSanity.FRAME.chance){
        /* 2026-11-07：接回 FRAME.chance 真源（此前硬编码 0.4，配置是死的）。 */
        liar=aliens[Math.floor(Math.random()*aliens.length)];
      }
      if(!liar)return out;
      /* 绝不构陷已经认出的队友；只把水泼到非队友身上 */
      const targets=pool.filter(x=>x!==liar&&(!vi||x!==vi.a)&&!isMate(liar,x.i));
      if(!targets.length)return out;
      let tgt=null;
      if(counter&&sureAcc&&sureAcc.alive&&!sureAcc.downed&&sureAcc!==liar&&Math.random()<0.65)tgt=sureAcc;
      /* 顺势构陷与被公开指控后的反咬（只读公开指控信息，不读内心） */
      if(!tgt){
        const back=G.agents.find(x=>x&&x!==liar&&x.alive&&!x.downed&&!isMate(liar,x.i)&&x.accuse===liar.i);
        if(back)tgt=back;
      }
      if(!tgt){
        const f=alienFrameTarget(liar,targets);
        if(f.t){tgt=f.t;if(G.simStats)G.simStats.alienFrameFollow=(G.simStats.alienFrameFollow||0)+1;}
      }
      if(!tgt)tgt=targets[Math.floor(Math.random()*targets.length)];
      if(!tgt)return out;
      /* 协同指控：人类占多数时触发率更高；平时说软话，反咬或 hardLine 命中才说硬话 */
      const humanAlive=pool.filter(x=>!x.alien).length;
      const coRate=humanAlive>aliens.length?SKSanity.COFRAME.chance:SKSanity.COFRAME.minorityChance;
      const coOn=Math.random()<coRate&&aliens.length>1;
      const sureKind=sureKn?sureKn.known.kind:null;
      const softFrame=!counter&&Math.random()>=(SKSanity.MISLEAD.hardLine||0.15);
      const softK=['sus_high','quick_report','heard_frame','near_body','heard_claim'];
      const hardK=['saw_knife','saw_red','saw_pipe','saw_sabotage','saw_shot','saw_knife_self','saw_knife_self'];
      const kind=softFrame
        ? softK[Math.floor(Math.random()*softK.length)]
        : (counter?(sureKind==='saw_pipe'?(Math.random()<0.7?'saw_pipe':'saw_red'):
          (sureKind==='saw_red'?(Math.random()<0.7?'saw_red':'saw_pipe'):
            hardK[Math.floor(Math.random()*hardK.length)]))
          :hardK[Math.floor(Math.random()*hardK.length)]);
      /* 附议者（2026-11-07）：coOn 时多个异形共享同一靶子；否则维持原来的
         "1 个已认出队友帮腔"。frame.ally 仍指向第一个，兼容既有渲染与门禁。 */
      const allies=[];
      if(coOn){
        const others=aliens.filter(x=>x!==liar&&x!==tgt);
        /* 优先让认出 liar 的队友帮腔，其余异形按池子顺序补位 */
        others.sort((p,q)=>(isMate(q,liar.i)?1:0)-(isMate(p,liar.i)?1:0));
        for(const x of others){
          if(allies.length>=Math.max(0,SKSanity.COFRAME.maxAccusers-1))break;
          allies.push(x);
        }
      }else{
        const one=pool.find(x=>x.alien&&x!==liar&&x!==tgt&&isMate(x,liar.i));
        if(one)allies.push(one);
      }
      const ally=allies[0]||null;
      /* 强制统一票型只对「协同诬陷」生效（coOn）：
         几个人嘴上一起咬 A、票却各投各的，就不是共同指控了。
         ⚠ 旧的单队友帮腔分支（coOn=false）不覆盖它的票 —— 那条线是
         2026-11-06 就有的「顺势踩公开热靶」行为，覆盖它会把异形的票
         带离场上公开靶子（test-v3.cjs 的 SOC 用例专测这条）。 */
      if(coOn)for(const x of allies){
        x.accuse=tgt.i;
        x.accuseWhy={kind:kind,room:null,reason:'协同附议',fake:true};
      }
      const own=alibiOf(liar), tf=alibiOf(tgt);
      /* 管道只存在 4 个舱室：构陷目标自述的房间如果没有管道口，
         就换一间真有管道的舱室，不能凭空在医疗间/走廊“钻管道”。 */
      let room=tf.room||null;
      if(kind==='saw_pipe'){
        const names=pipeRoomIds().map(roomNameById);
        if(names.indexOf(room)<0)room=names.length?names[Math.floor(Math.random()*names.length)]:null;
      }
      /* P2-3：兜底不许再填 '走廊' —— 走廊没有管道口，"在走廊钻管道"是一句
         当场就能被地图拆穿的假话。真拿不到管道舱时宁可降级成"红光"，
         也就是把 claim 换掉，而不是给一个假地点。 */
      if(!room&&kind!=='saw_pipe')room='走廊';
      const claim=kind==='saw_pipe'&&room
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
        ally:ally?ally.i:null,allyText:null,co:allies.map(x=>x.i)};
      if(ally&&ally.accuse!==liar.i){
        /* 同上：确证过说谎者的人不会反过来替他背书 */
        frame.allyText='我'+whenWord()+'在'+alibiOf(ally).room+'，我也看见了：'+tgt.name+
          (kind==='saw_pipe'?'钻进了管道':'身上带着刚出刀的红光')+'。'+liar.name+'没撒谎。';
        /* 为已被自己确证的异形辩护，会引来“你是不是同伙”的怀疑 */
        for(const w of G.agents){
          if(w.alien||!w.alive||w.downed||!w.mind)continue;
          if(w.mind.known&&w.mind.known[tgt.i])susAdd(w,ally.i,2,'defended_suspect');
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
      const hearers=[];
      for(const w of G.agents){
        if(w===liar||w===tgt||w===sureAcc||!w.alive||w.downed||!w.mind)continue;
        if(bestKnownTarget(w))continue;
        hearers.push(w);
      }
      /* 2026-11-05 二组：传闻证据侧以前也是所有人同一增量（0.26）。
         现在按「当时几个人在场 / 是否断电 / 附近是否刚出事」各自抽样：
         一屋子人听同一句话，记住的强度本来就不一样。 */
      const hbase=witnessCtxMul(liar.x,liar.y,hearers.length);
      const hjit=function(){return Math.max(0.72,Math.min(1.10,hbase*(0.94+Math.random()*0.12)));};
      for(const w of hearers){
        if(frame.caught&&frame.caught.i===w.i){
          susAddContradiction(w,liar.i,0.24,'contradiction_lie',frame.caught.e);
        }else{
          const ev={kind:'heard_frame',x:0,y:0,room:null,conf:0.32,src:'speech',subj:tgt.i,by:liar.i};
          evPush(w,ev);
          /* 0.26 传闻构陷 + 进入公开声势池（有 known 的听众不进此段） */
          susAdd(w,tgt.i,Math.min(SKSanity.HEARD.cap,0.26*80*hjit()),'heard_frame',ev);
          if(m&&m.ctx&&Array.isArray(m.ctx.testimony)){
            m.ctx.testimony.push({li:w.i,by:liar.i,tgt:tgt.i,wgt:0.02,reason:'heard_accuse',ev:ev,said:1,frame:1});
          }
          /* 协同诬陷：每个附议者再补一份递减的传闻嫌疑 */
          allies.forEach((x,k)=>{
            const ev2={kind:'heard_frame',x:0,y:0,room:null,conf:0.3,src:'speech',subj:tgt.i,ally:1,by:x.i,co:k+1};
            evPush(w,ev2);
            const wgt=(k===0?0.08:SKSanity.COFRAME.extraWgt*Math.pow(SKSanity.COFRAME.extraWgtDecay,k-1))*hjit();
            susAdd(w,tgt.i,Math.min(SKSanity.HEARD.cap,wgt*80),k===0?'heard_frame_ally':'heard_frame_co',ev2);
          });
        }
      }
      /* 让说谎者的投票与假口供保持一致；其他 AI 的目标不动 */
      liar.accuse=tgt.i; liar.accuseWhy={kind:kind,room:null,reason:'反咬'};
      out.frames.push(frame);
      out.lines.push(()=>say(liar.name,rebut));
      if(frame.allyText)out.lines.push(()=>say(ally.name,frame.allyText));
      allies.slice(1).forEach(x=>{
        out.lines.push(()=>say(x.name,'我'+whenWord()+'在'+alibiOf(x).room+'，我也看见了：'+tgt.name+
          (kind==='saw_pipe'?'钻进了管道':'身上带着刚出刀的红光')+'。'+liar.name+'没撒谎。'));
      });
      if(G.simStats&&allies.length>1)G.simStats.coFrames=(G.simStats.coFrames||0)+allies.length;
      if(frame.response)out.lines.push(()=>say(tgt.name,frame.response));
      if(frame.caught)out.lines.push(()=>say(G.agents[frame.caught.i].name,frame.caught.text));
      if(frame.reaffirm)out.lines.push(()=>say(sureAcc.name,frame.reaffirm));
      return out;
    }
    function pickResponder(m,cands){ const G=getG(), SND=getSND(), DEAD=getDead(), SIM_RUN=getSimRun(), TEST_RUN=getTestRun(), SIM_NO_DISCUSS=getSimNoDiscuss(), GAME_MODE=getGameMode();
      const spoken=(m.lines||[]).map(l=>l.who);
      const fresh=cands.filter(a=>spoken.indexOf(a.name)<0);
      const pool=fresh.length?fresh:cands;
      return pool[Math.floor(Math.random()*pool.length)];
    }
    /* 人类互相辩护（2026-10-31）：人类也会替人说话，不只是异形护队友。
       约束保留：手上有对该人的确证时绝不辩护（当场自相矛盾）；
       只替「人类 + 正被普通指控」的人开口，概率 55%。
       决策放在同步段调用，蒙特卡洛也能统计到次数。 */
    function decideHumanDefend(cands){ const G=getG(), SND=getSND(), DEAD=getDead(), SIM_RUN=getSimRun(), TEST_RUN=getTestRun(), SIM_NO_DISCUSS=getSimNoDiscuss(), GAME_MODE=getGameMode();
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
        /* 2026-11-20 态度互斥：辩护 = 公开支持，所以①不许挑"自己已经指控过这个目标"的人
           （旧写法只排除 a0，别的同案指控者仍会被挑成辩护人 —— 这就是"左右脑互搏"的主因）；
           ②优先挑本场还没指控过任何人的人（preferNeutral），实在没有才退回原池。 */
        const pool0=cands.filter(x=>!x.alien&&x!==a0&&x!==tgt&&x.alive&&!x.downed&&
          !(x.mind&&x.mind.known&&x.mind.known[tgt.i])&&
          !almostFoeOf(x,tgt.i)&&canSupport(x,tgt.i));
        const pool=preferNeutral(pool0);
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
    function decideAlienDoubt(m,cands){ const G=getG(), SND=getSND(), DEAD=getDead(), SIM_RUN=getSimRun(), TEST_RUN=getTestRun(), SIM_NO_DISCUSS=getSimNoDiscuss(), GAME_MODE=getGameMode();
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
    /* 2026-11-06 用户裁定：异形偶尔指控一个**已认出的队友**，用“大义灭亲”洗白。
       只使用 a.mates（亲眼确认的队友），不读系统队友表；每个会议最多一次。
       如果队友最后被逐且翻出是异形，settleAccountability 会给投票者 +cred，
       这就是洗白的兑现口；没有额外新分数。 */
    function planMateBus(m,cands,deception){ const G=getG(), SND=getSND(), DEAD=getDead(), SIM_RUN=getSimRun(), TEST_RUN=getTestRun(), SIM_NO_DISCUSS=getSimNoDiscuss(), GAME_MODE=getGameMode();
      const out={frames:[],lines:[]};
      if(!m||m.kind==='pre')return out;
      if(Math.random()>=SKSanity.MISLEAD.busChance)return out;
      /* 2026-11-07：协同诬陷的附议者也算"已用过"，避免同一异形
         在同一场会议既附议又大义灭亲 */
      const used=new Set(((deception&&deception.frames)||[])
        .reduce((a,f)=>a.concat([f.by],f.co||[]),[]));
      const alive=G.agents.filter(x=>x.alien&&x.alive&&!x.downed&&(x!==G.me||G.spectMode));
      const liar=alive.find(x=>{
        if(used.has(x.i))return false;
        return Object.keys(x.mates||{}).some(k=>{
          const t=G.agents[+k];
          return t&&t.alien&&t.alive&&!t.downed&&t!==x;
        });
      });
      if(!liar)return out;
      const mates=Object.keys(liar.mates||{}).map(Number).filter(i=>{
        const t=G.agents[i];
        return t&&t.alien&&t.alive&&!t.downed&&t!==liar;
      });
      if(!mates.length)return out;
      const mate=G.agents[mates[Math.floor(Math.random()*mates.length)]];
      const kind=Math.random()<0.5?'saw_pipe':'saw_red';
      let room=alibiOf(mate).room;
      if(kind==='saw_pipe'){
        const names=pipeRoomIds().map(roomNameById);
        if(names.indexOf(room)<0)room=names.length?names[Math.floor(Math.random()*names.length)]:null;
      }
      /* P2-3：同 planAlienDeception —— "钻管道"必须落在真有管道口的舱室，
         拿不到就降级成"红光"，不用 '走廊' 冒充。 */
      if(!room&&kind!=='saw_pipe')room='走廊';
      const text=kind==='saw_pipe'&&room
        ?'我'+whenWord()+'在'+alibiOf(liar).room+'，亲眼看见'+mate.name+'在'+room+'钻进了管道'
        :'我'+whenWord()+'在'+alibiOf(liar).room+'，亲眼看见'+mate.name+'身上带着刚出刀的红光';
      /* 传闻嫌疑：和普通构陷同一条 heard_frame 通道，绝不写 known。 */
      for(const w of G.agents){
        if(w===liar||w===mate||!w.alive||w.downed||w.alien||!w.mind)continue;
        if(bestKnownTarget(w))continue;
        const ev={kind:'heard_frame',x:0,y:0,room:null,conf:0.30,src:'speech',
          subj:mate.i,by:liar.i,bus:1};
        evPush(w,ev);
        susAdd(w,mate.i,Math.min(SKSanity.HEARD.cap,0.22*80),'heard_frame',ev);
      }
      liar.accuse=mate.i;
      liar.accuseWhy={kind:kind,room:null,reason:'队友洗白',fake:true,bus:true};
      liar._busTarget=mate.i;
      out.frames.push({by:liar.i,target:mate.i,kind:kind,room:room,
        ownRoom:alibiOf(liar).room,sureKind:null,text:text,reaffirm:null,
        response:null,caught:null,bus:true,ally:null,allyText:null});
      out.lines.push(()=>say(liar.name,text));
      if(G.simStats)G.simStats.busAccusals=(G.simStats.busAccusals||0)+1;
      return out;
    }
    function startChatter(m){ const G=getG(), SND=getSND(), DEAD=getDead(), SIM_RUN=getSimRun(), TEST_RUN=getTestRun(), SIM_NO_DISCUSS=getSimNoDiscuss(), GAME_MODE=getGameMode();
      stopChatter();
      /* 旁观模式下 0 号是独立 AI，不是"玩家席位"，必须进入发言与投票池 */
      const ai=G.agents.filter(a=>a.alive&&!a.downed&&(a!==G.me||G.spectMode));
      if(!ai.length)return;
      /* 发言权倾斜（P-a，2026-11-01）：不再纯随机打乱 —— 真人局里是「2~3 个人说掉
         大半的话，其余人一两句」。排序分 = 手上有多少东西要说（确证/准-确证/指控/
         目击记录）+ soc 性格 + 一点随机。有料的人先开口，安静的人自然落到后面，
         再配 F5 的「沉默也是线索」才闭环。soc 性格轴已于 2026-11-05 换成实际台词数。 */
      const talkScore=a=>{
        let s=Math.random();
        if(a.mind){
          if(a.mind.known&&Object.keys(a.mind.known).length)s+=2.0;
          if(a.mind.almost&&Object.keys(a.mind.almost.foe||{}).length)s+=1.2;
          if(a._retract!=null)s+=1.5;
          if(a.accuse!=null)s+=1.0;
          const why=Object.keys(a.mind.why||{}).length;s+=Math.min(1.0,why*0.12);
        }
        s+=0.6*Math.min(1,(a.talkN||0)/SKSanity.MIND.talkScoreN);
        /* 2026-11-08 用户裁定「压制异形发言频率」：异形几乎必有 accuse（+1.0），
           人类经常没有 —— 排序天然把异形推到前三位，实测异形说了 51.4% 的话。
           这里只给发言权一个阵营偏置，不改任何判据。 */
        if(a.alien)s-=SKSanity.SPEECH.alienBias;
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
      /* 2026-11-06：模拟局不再跳过发言。以前 `if(G.simMode)return` 让这里排的
         三十多个回调在蒙特卡洛里一个都不执行 —— 背书、沉默判据、talkN、
         证言间关系因此恒 0，推理机制等于没进胜率读数。
         现在模拟局把 push 改成**按同样顺序立即执行**（不排定时器），
         真实对局仍然按时间铺开。没有第二套逻辑，不会漂移。 */
      const push=G.simMode
        ?(fn)=>{agenda.push(fn);   /* 保留长度，m.plan 的排期审计才不会算出负数 */
          try{fn();if(G.simStats)
            G.simStats.discussLines=(G.simStats.discussLines||0)+1;}catch(e){}}
        :(fn)=>agenda.push(fn);
      /* 会议欺骗要先算：说谎者的投票目标要在大厅指控那一轮之前定下来 */
      const sureAcc=cands.find(a=>!a.alien&&bestKnownTarget(a));
      const deception=planAlienDeception(m,cands,sureAcc);
      const bus=planMateBus(m,cands,deception);
      if(bus.frames.length){
        deception.frames.push.apply(deception.frames,bus.frames);
        deception.lines.push.apply(deception.lines,bus.lines);
      }
      if(deception.frames.length)m.ctx.frames=deception.frames;
      /* 人类辩护 / 异形质疑报案者：都在同步段定下来（批量模拟也要统计到）。
         辩护记账也放在这里：批量模拟没有台词排期，但「谁保过谁」必须记上，
         否则翻身份后的回溯追责在 sim 里永远不触发。 */
      const humanDefend=decideHumanDefend(cands);
      if(humanDefend)defenseNote(humanDefend.by,humanDefend.target);
      const alienDoubt=decideAlienDoubt(m,cands);
      if(G.simMode&&SIM_NO_DISCUSS)return;   /* A/B：还原旧模拟口径 */
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
        /* 先发制人台词（2026-11-08 用户裁定）：异形要比人类**先指控**。
           ⚠ 同日修订：不再抢在系统播报之前。实测 M5 里三条指控在 624ms 刷出、
             系统播报死者在 2193ms —— 玩家读到的是"还没人报案他们就知道有人出刀"，
             也就是"未卜先知"，机制反噬。现在固定在报案信息之后、人类自述之前，
             仍然满足"比人类先指控"。`FIRST.firstLine` 因此停用。 */
        let openingPushed=false;
        const ob=m.ctx.opening&&m.ctx.opening.by;
        const ot=ob?G.agents[m.ctx.opening.target]:null;
        const openingFn=(ob&&ot)?(()=>{
          if(!ob.alive||ob.downed||!ot.alive)return;
          const l=pickLine(ob,'alien_open_accuse',0,
            {t:ot.name,r:alibiOf(ot).room,when:whenWord()});
          if(l)say(ob.name,l);
          /* 定调传闻：只写 sus，绝不写 known；手上有确证的人免疫构陷。 */
          const ev={kind:'heard_frame_opening',x:0,y:0,room:m.ctx.opening.room,
            conf:0.55,src:'speech',subj:ot.i,by:ob.i};
          for(const w of G.agents){
            if(w===ob||w.alien||!w.alive||w.downed||!w.mind)continue;
            if(w.mind.known&&w.mind.known[ot.i])continue;
            susAdd(w,ot.i,SKSanity.FIRST.wgt*SKSanity.reliaMul(reliaOf(w,ob.i)),
              'heard_frame_opening',ev);
          }
          deliverTestimony(m,ob.i);
          /* 附议者：同一靶子、递减权重（复用 COFRAME 的 extraWgtDecay 口径），
             台词走独立语料池，不把句子写在调用处。 */
          let k=0;
          for(const x of m.ctx.opening.allies){
            if(!x.alive||x.downed)continue;
            k++;
            const el=pickLine(x,'alien_open_echo',0,
              {t:ot.name,r:alibiOf(ot).room,when:whenWord()});
            if(el)say(x.name,el);
            const ew=SKSanity.FIRST.extraWgt*
              Math.pow(SKSanity.FIRST.extraWgtDecay,k-1);
            const ev1={kind:'heard_frame_opening',x:0,y:0,room:m.ctx.opening.room,
              conf:0.45,src:'speech',subj:ot.i,by:x.i,co:k};
            for(const w of G.agents){
              if(w===x||w.alien||!w.alive||w.downed||!w.mind)continue;
              if(w.mind.known&&w.mind.known[ot.i])continue;
              susAdd(w,ot.i,Math.min(SKSanity.HEARD.cap,ew*80*SKSanity.reliaMul(reliaOf(w,x.i))),
                'heard_frame_opening',ev1);
            }
          }
          G.openingHeardN=(G.openingHeardN||0)+1;
        }):null;
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
          push(()=>sysSay(m.kind==='pre'?'航行简报：全员核对任务分工，讨论结束后进入第 1 夜。':(m.kind==='day'?'天亮了，全员回中央会议室集合。':'没有尸体，但有人按下了会议铃。')));
        }
        /* 没抢到第一句的先发制人者：紧跟着报案信息把矛头指出来（仍是前几句）。 */
        if(openingFn&&!openingPushed){ push(openingFn); openingPushed=true; }
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
        /* 2026-11-08：前 3 个自述者**优先人类**。自述是"建立时间线"的公共信息，
           不该被异形包场 —— 实测开局会 10 条里 7 条是异形在报路线。
           2026-11-18 R13.9：但也不能 3 个人**全都只报位置**。实测 40 局里
           `我+时间+舱室` 开头占 29.5%、实质推理只占 33.6%，而 `talkScore` 本来就知道
           谁手上有确证、谁要指控 —— 旧写法把这份排序白白扔掉了。
           现在开场三位按「有确证/准-确证 ≥ 有指控 ≥ 无信息」取人，
           纯自述最多 `SPEECH.alibiOpenMax` 个，人类优先这条（R13.4）仍然生效。 */
        const infoTier=a=>{
          if(a.mind&&a.mind.known&&Object.keys(a.mind.known).length)return 2;
          if(a.mind&&a.mind.almost&&Object.keys(a.mind.almost.foe||{}).length)return 2;
          if(a.accuse!=null||a.suspect!=null||a._retract!=null)return 1;
          return 0;
        };
        const SPE=SKSanity.SPEECH;
        const openMax=Math.min(3,cands.length);
        const alibiCap=Math.max(1,SPE.alibiOpenMax|0);
        const needH=Math.min(SPE.minHumanSpeakers|0,cands.filter(x=>!x.alien).length);
        const speakers=[];
        const takeOpen=a=>{
          if(!a||speakers.length>=openMax||speakers.indexOf(a)>=0)return;
          /* 纯自述在开场就有名额上限 —— 第 3 把椅子不该继续坐"我在哪儿"的人 */
          if(infoTier(a)===0&&
            speakers.filter(x=>infoTier(x)===0).length>=alibiCap)return;
          speakers.push(a);
        };
        /* ① 手上有货的人类先开口（R13.4 的人类优先 + 本条的强度优先） */
        for(const a of cands){ if(!a.alien&&infoTier(a)>0)takeOpen(a); }
        /* ② 人类席位不足 minHumanSpeakers 时，用人类自述补齐（异形不许靠话多占满开场） */
        for(const a of cands){ if(!a.alien&&speakers.filter(x=>!x.alien).length<needH)takeOpen(a); }
        /* ③ 余下的位子给剩下最强的人：`cands` 本身就是 talkScore 序（含 alienBias），
           所以这里不需要再造一套排序，也不会绕过任何一条既有节流。 */
        for(const a of cands)takeOpen(a);
        for(const a of speakers){
          m.ctx.claims.push({a,room:alibiOf(a).room});
          push(()=>say(a.name,alibiLine(a,m)));
        }
        /* 2026-11-08：领袖指令与背书挪到**讨论前段**（刚报完位置）。
           原来排在指控之后，于是投票讨论的尾声全是"跟我到引擎""都别乱跑"
           这类行动指令 —— 玩家要投人了，AI 还在分工，纯噪声。 */
        scheduleLeaderOrders(push);
        pushEndorse(push,cands);
        /* ---- 口供对质（2026-11-05 二组）：把 buildMeetCtx 已经判出来的那一对说出口 ----
           以前只有「伪造别人」的假口供会当场被戳穿，自述位置对不上时只是静默扣分，
           玩家看不到。这里让戳穿的人与被戳穿的人各说一句；台词全走现有语料池
           （doubt_room / alien_dodge / defenseClause），不新增模板、不产生新分数。 */
        const con=m.ctx.contra;
        if(con&&con.w&&con.a&&con.w!==G.me&&con.a!==G.me&&
          con.w.alive&&con.a.alive&&!con.a.downed){
          const tw=SKSanity.alibiTimeWord(con.age);
          push(()=>say(con.w.name,'我'+tw+'在'+con.seen+'看见'+con.a.name+'了。'+
            '你说你在'+alibiOf(con.a).room+'？对不上。'));
          push(()=>say(con.a.name,con.a.alien
            ?pickLine(con.a,'alien_dodge',0,
              {u:(m.ctx.victimInfo?m.ctx.victimInfo.name:'那件事'),r:alibiOf(con.a).room,when:whenWord()})
            :defenseClause(con.a,m)));
        }
        /* ---- 跨会议口供（F6，2026-11-01）：**只记不判** ----
           真人记得「你上次说你在引擎室」。这里只允许把它说出来，
           **绝不产生任何 `sus`**：昨晚在引擎室、今晚在配电室本来就正常，
           再给权重就是又一处量词错误（同 2026-11-01 那条教训）。 */
        if(m.kind!=='pre'){
          let recalled=false;
          for(const a of speakers){
            const al=alibiOf(a);
            const h=(a.mind&&a.mind.claimHist)||[];
            const prev=h.length?h[h.length-1]:null;
            if(!recalled&&prev&&prev.room&&prev.room!==al.room){
              const other=cands.find(x=>x!==a);
              if(other){
                push(()=>say(other.name,pickLine(other,'claim_recall',0,
                  {t:a.name,r:al.room,r2:prev.room,when:whenWord()})));
                recalled=true;
              }
              (m.ctx.claimNotes=m.ctx.claimNotes||[]).push({who:a.i,prev:prev.room,now:al.room});
              if(G.simStats)G.simStats.claimRecall=(G.simStats.claimRecall||0)+1;
            }
            recordClaim(a,al);
          }
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
        /* 先发制人的主 liar 与附议者已经由 `openingFn` 说过台词，
           这里从常规指控轮里排除，避免同一句话在会议开头复读两遍。 */
        const openIds=new Set();
        if(m.ctx.opening&&m.ctx.opening.by){
          openIds.add(m.ctx.opening.by.i);
          for(const x of m.ctx.opening.allies)openIds.add(x.i);
        }
        /* R13.9：指控轮的开口人数从写死的 2 提到 `SPEECH.accuseSpeakers`（3）。
           开场自述**本来就带指控尾句**（`alibiLine` 里的 why），所以这里要跳过
           "已经说过他可疑"的人 —— 否则同一个人把同一件事讲两遍，既挤话轮又虚增推理计数；
           排序再加一条"没开过口的优先"，把第三次开口的机会往后分。 */
        const voiced=a=>a.accuse!=null&&!!(a.accuseWhy||evidenceReason(a,a.accuse));
        const accusers=cands.filter(a=>a.accuse!=null&&!openIds.has(a.i)&&!voiced(a)&&
          G.agents[a.accuse]&&G.agents[a.accuse].alive&&a.accuse!==a.i)
          .sort((x,y)=>{
            const sx=(x.alien?0:2)+(x.suspect!=null?2:0)+(x.accuseWhy?1:0)+
              (speakers.indexOf(x)<0?1:0);
            const sy=(y.alien?0:2)+(y.suspect!=null?2:0)+(y.accuseWhy?1:0)+
              (speakers.indexOf(y)<0?1:0);
            return sy-sx;
          }).slice(0,Math.max(1,SPE.accuseSpeakers|0));
        for(const a of accusers){
          /* 说出口的这一刻才把证言发给听众 —— 早投的人正是在这里改票 */
          push(()=>{const l=accuseLine(a,m);if(l){say(a.name,l);deliverTestimony(m,a.i);}});
          /* 情绪写入：被当众指控的人记指控者一笔仇 —— 下次会议他大概率反咬 */
          const tgt3=G.agents[a.accuse];
          if(tgt3&&tgt3.alive)grudgeAdd(tgt3,a.i,0.40);
        }
        /* ---- 低分提醒（2026-11-21）：新机制的发言受体 ----
           手上有 followed（被跟随）/ loot_bullet（目击拿子弹）依据、但未达点名门槛的人，
           会在会上把这件事"提一句"——不指控，只提醒。提醒对听众有影响：
           E 煽动 −8（短期阵营压力，进 T+E 合成 → 投票倾向），不动 T、不算 heard_accuse。 */
        {
          const reminders=[];
          for(const a of cands){
            if(a.accuse!=null||!a.mind||!a.mind.why)continue;
            for(const k in a.mind.why){
              const arr=a.mind.why[k]||[];
              const it=arr[arr.length-1];
              if(it&&(it.kind==='followed'||it.kind==='loot_bullet')){
                reminders.push({a:a,tgt:+k,kind:it.kind});break;
              }
            }
          }
          for(const rm of reminders.slice(0,2)){
            push(()=>{
              const tg=G.agents[rm.tgt];
              if(!tg||!tg.alive||!tg.name)return;
              const pool=rm.kind==='followed'?'followed_me':'loot_bullet_sus';
              say(rm.a.name,pickLine(rm.a,pool,0.5,{t:tg.name}));
              for(const w2 of G.agents){
                if(!w2||!w2.alive||w2.downed||w2===rm.a||w2===tg||!w2.mind)continue;
                emoAdd(w2,rm.tgt,-8,'reminder');
              }
              if(G.simStats)G.simStats.reminders=(G.simStats.reminders||0)+1;
            });
          }
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
        const accused=cands.find(a=>a.accuse!=null&&G.agents[a.accuse]&&G.agents[a.accuse].alive&&
          a.accuse!==a.i&&a!==accusers[0]);
        if(accused)push(()=>say(accused.name,defenseClause(accused,m)));
        /* 有确证的人最后点名：不是"我怀疑"，是"我确定" */
        const sure=sureAcc;
        if(sure)push(()=>{const l=accuseLine(sure,m);if(l){say(sure.name,l);deliverTestimony(m,sure.i);}});
        /* 异形的反驳 / 反咬紧跟在确证之后；真目击者会再顶回去 */
        for(const fn of deception.lines)push(fn);
        /* 异形的伪证同样要"说出口"才算数：和人类走同一条时间线（不对等的话，
           异形的污蔑会在开会瞬间生效，人类的要等台词播完） */
        if(deception.frames.length)push(()=>{
          const seen={};
          for(const f of deception.frames){if(seen[f.by])continue;seen[f.by]=1;deliverTestimony(m,f.by);}
        });
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
            /* 2026-11-20 态度互斥：大义灭亲（planMateBus 已经把 accuse 指到队友身上）的
               那只异形，绝不能转头又替这个队友辩护 —— 旧写法只查了 mind.known，
               没查 accuse，实测能演出「我刚亲眼看见他钻管道 / 他不是异形别投他」。 */
            if(!canSupport(def,mate.i))continue;
            const accuser=cands.find(x=>x!==mate&&x.accuse===mate.i);
            if(accuser&&!defended.has(mate.i)){
              defended.add(mate.i);
              stanceMark(def,mate.i);
              for(const w of G.agents){
                if(w.alien||!w.alive||w.downed||!w.mind)continue;
                if(w.mind.known&&w.mind.known[mate.i])susAdd(w,def.i,2,'defended_suspect');
              }
              defenseNote(def,mate);
              push(()=>say(def.name,'我'+whenWord()+'在'+alibiOf(def).room+'，'+mate.name+
                '不是异形，别投他。'));
              trustAdd(mate,def.i,SKSanity.GRATITUDE.defended);
              break;
            }
          }
        }
        /* 人类也会替人说话（2026-10-31）：只替人类、且自己手上没有对他确证的人辩护，
           不再让「辩护」变成异形专属行为 */
        if(humanDefend){
          /* 主动保人的话术（2026-11-03 内联池迁移）：这是 game.js 里**最后一处**数组式
             台词池。搬走之后门禁按源码扫描钉住「不许再把句子写在调用处」。 */
          /* 2026-11-20：辩护也是公开支持，记进台账，后文「跟票 / 收尾」就不会再点名他。 */
          stanceMark(humanDefend.by,humanDefend.target.i);
          push(()=>say(humanDefend.by.name,pickLine(humanDefend.by,
            /* 同上（2026-11-18）：「先别投他，他昨晚就在{r}干活」——
               辩护者没在别的舱室见过他，就不许报那个舱室。 */
            roomSafePool('human_defend',humanDefend.by,!!seenRoomOf(humanDefend.by,humanDefend.target.i)),0,
            {t:humanDefend.target.name,r:seenRoomOf(humanDefend.by,humanDefend.target.i)||'',
             when:whenWord()})));
          /* 情绪写入：被当众保下的人记辩护者一笔恩 —— 之后更愿意跟他的票 */
          trustAdd(humanDefend.target,humanDefend.by.i,SKSanity.GRATITUDE.defended);
          /* 元推理记账：被保的人日后翻出是异形 → 保他的人要被回溯算账（F2） */
          defenseNote(humanDefend.by,humanDefend.target);
        }
        let supporter=null;
        if(accusers.length){
          const a0=accusers[0],tgt=G.agents[a0.accuse];
          /* 2026-11-20 态度互斥：跟票 = 公开指控，本场已经替这个目标说过话的人不跟。 */
          const pool=cands.filter(x=>x!==a0&&x!==tgt&&x.suspect==null&&x.accuse==null&&
            x.alive&&!x.downed&&!x.alien&&(x.mind?x.mind.alert:0)>=0.25&&
            canAccuseStance(x,tgt.i));
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
          /* 2026-11-20 态度互斥：收尾点名 = 公开指控。本场已经替他说过话的人，
             这里只能落到「弃权」那一档，不许反口。 */
          const flip=!!(target&&target.alive&&!canAccuseStance(closer,target.i));
          if(target&&target.alive&&!flip){
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
      if(!G.simMode)agenda.forEach((fn,i)=>meetLater(m,t0+i*step+Math.random()*160,fn));
      const lastAt=t0+step*(agenda.length-1);
      /* 2026-11-08：后段补位加密。原来每 9 秒一次、且一半是系统行，
         实测冷场最长 18 秒（M5 18001ms）。现在按 SPEECH.nudgeGapMs（5 秒）
         铺满，并且补位优先找**本场发言最少的人类** —— 既填空档，也顺手把
         异形占比压下来。 */
      const nudges=[];
      const nGap=Math.max(3000,SKSanity.SPEECH.nudgeGapMs||5000);
      for(let tn=lastAt+3200;tn<endAt-1400;tn+=nGap){
        nudges.push(Math.round(tn));
        if(G.simMode)continue;          /* 模拟局只算审计数值，不排空档台词 */
        {
          /* 空档里让 AI 主动接话：优先引用玩家刚才自述的位置；
             发言者挑本场话最少的**人类**，避免补位又被异形吃掉。
             2026-11-08：系统"剩余 N 秒"不再占补位槽（那会让相邻 AI 发言
             被一条系统行隔成 10 秒），改成单独排在固定剩余点上。 */
          meetLater(m,tn,()=>{
            const poolH=cands.filter(x=>!x.alien);
            const src=poolH.length?poolH:cands;
            /* 避开"上一个说话的人"：sayStreakOK 会挡掉同人连说，
               如果补位又选了他，这条就静默丢失 → 出现 11 秒空洞。 */
            const lastWho=(m.lines&&m.lines.length)?m.lines[m.lines.length-1].who:null;
            let a=null;
            for(const x of src){
              if(x.name===lastWho)continue;
              if(!a||(x.talkN||0)<(a.talkN||0))a=x;
            }
            if(!a)a=src[0];
            const cr=m.ctx&&m.ctx.playerClaimRoom;
            const meSaid=((m.ctx.playerSays||[]).length>0);
            const canAsk=!!(G.me&&G.me.alive&&!G.me.downed&&!G.spectMode);
            /* 2026-11-08：点名玩家后给一次追问台阶。原来点名完就断线，
               玩家不接话整场就冷在那里。 */
            if(canAsk&&!meSaid&&!m.ctx.askedPlayer){
              m.ctx.askedPlayer=1;
              say(a.name,pickLine(a,'ask_player_pre',0,{u:G.me.name}));
            }else if(canAsk&&!meSaid&&m.ctx.askedPlayer&&!m.ctx.playerSilentSaid){
              m.ctx.playerSilentSaid=1;
              say(a.name,pickLine(a,'player_silent',0,{u:G.me.name}));
            }else if(cr)say(a.name,pickLine(a,'nudge_player_claim',0,
              {u:G.me.name,r:roomNameById(cr)}));
            else say(a.name,pickLine(a,'pre_ask_more',0,
              {r:alibiOf(a).room,when:whenWord()}));
          });
        }
      }
      /* 系统节奏提示单独排：剩余 30/20/10 秒各一次，不占 AI 补位槽。
         以前混在 nudge 序列里，一条系统行会把相邻两条 AI 发言隔成 10 秒。 */
      if(!G.simMode){
        for(const left of [30000,20000,10000]){
          const at=endAt-left;
          if(at>lastAt+1500)meetLater(m,at,()=>sysSay(
            '自由讨论 · 剩余 '+Math.max(0,Math.round(m.t))+' 秒 · 输入框发言可直接追问'));
        }
      }
      /* 排期审计：门禁用它确认「讨论内容真的覆盖到结束前」 */
      m.plan={kind:m.kind,discuss:D,t0:Math.round(t0),step:Math.round(step),
        n:agenda.length,lastAt:Math.round(lastAt),endAt:Math.round(endAt),nudges,
        lastScheduled:Math.round(Math.max(lastAt,nudges.length?nudges[nudges.length-1]:0,endAt))};
      if(!G.simMode)meetLater(m,endAt,()=>{
        /* 讨论里没被说到的证言在这里补发：不改变"最终听到什么"，
           只保证它发生在投票之前（与旧版集合一致） */
        deliverTestimony(m,null);
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
    function playerTalk(text){ const G=getG(), SND=getSND(), DEAD=getDead(), SIM_RUN=getSimRun(), TEST_RUN=getTestRun(), SIM_NO_DISCUSS=getSimNoDiscuss(), GAME_MODE=getGameMode();
      const m=G.meet;
      if(!m||m.phase!=='discuss')return;
      const cands=G.agents.filter(a=>a.alive&&!a.downed&&a!==G.me);
      if(!cands.length)return;
      const sl=parseSpeech(text);
      m.ctx.playerSays=m.ctx.playerSays||[];
      m.ctx.playerSays.push({t:evNow(),slots:sl});
      if(sl.accuse!=null){
        m.ctx.playerAccuse=sl.accuse;
        /* 玩家公开点名写进 ctx.lead（与 AI 同口径）。旧实现只写 playerAccuse 供回放，
           追责读 ctx.lead，玩家便永远按"普通跟票"处理，拿不到 leadMul/wrong_accuse/grudge。 */
        if(m.ctx.lead[sl.accuse]==null)m.ctx.lead[sl.accuse]=G.me.i;
      }
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
      /* 「不是我」的回应（2.5D 原块）：有人接受，有人追问。
         抽成局部函数是因为「不是我 + 我在X」同时命中 where 与 deny 两个槽：
         旧写法先走 where 分支并 return，否认永远得不到否认类回应。 */
      const denyReply=()=>{
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
      };

      /* 1) 时间线对质：玩家自称在哪，但某个 AI 记得在别处见过他 → 当场拆穿。
         2026-11-01 修量词：只比玩家口供所指时段（"刚才" 20 秒 / "一直" 整夜 /
         没说时段按 45 秒），且窗口内有一条对得上就不拆穿 —— 旧写法会拿
         30 秒前的旧位置去否定玩家现在的口供。 */
      let challenger=null,conflict=null,conflictAge=0;
      if(sl.where){
        /* 2026-11-18 用户报「玩家自证地点完全不成立，老是说十几秒前看到你在哪」：
           旧口径在玩家没指明时段时用 ALIBI.window（45 秒）核对 —— 而人从引擎室
           走到医疗间再开口，路上被瞥见的那一眼就足以被判"说谎"。三条收紧：
             ① 未指明时段 → 按「刚才」口径（ALIBI.recent=20 秒），不再用 45 秒兜底；
             ② 至少**两条**不匹配记录才判矛盾 —— 单次瞥见可能是路过、背光或看错；
             ③ 玩家自己说「整晚都在 X」时仍按全夜核（他把话说满了，该被抓）。 */
        const win=claimWindow(sl.when||'recent');
        /* 玩家自己说「一整晚都在 X」= 把话说满了：窗口是全夜，单条目击就足以反驳；
           「刚才」口径才要求两条（人可能是刚走过来）。 */
        const fullNight=sl.when==='night';
        for(const w of cands){
          if(w.alien||!w.mind)continue;
          const r=checkAlibi(w,0,sl.where,win.t0,win.t1,win.tRef);
          if(r.checked===0||r.match||(!fullNight&&r.mismatched<2))continue;
          susAddContradiction(w,0,SKSanity.MAPPING.contradiction,'contradiction_player',r.evidence);
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

      if(sl.heardShot){const hs=sl.heardShot,rm=hs.room&&M.rooms.find(r=>r.id===hs.room),hx=rm?rm.rect[0]+rm.rect[2]/2:0,hy=rm?rm.rect[1]+rm.rect[3]/2:0;
        for(const w of cands)SKT2AI.playerHeard(w,hs.target,hs.room,G.me.i,hx,hy,EV_W.heard_shot*0.4);}

      /* 2) 玩家提供的直接证据：先当"传闻"记下，绝不写成 known。
         有确证的人公开支持；没有确证的人只加少量 heard_claim 嫌疑；
         如果听众的时间线与玩家声称的现场冲突，反过来怀疑玩家（contradiction_claim）。 */
      if(sl.claim){
        const t=G.agents[sl.claim.target];
        if(!t||!t.alive||t.downed)return;
        /* 会议内去重（2026-11-18 用户裁定）：同一场会议里对同一个人重复同一类
           「亲眼看见」，第二次起只是**重申**，不再结算。
           这是堵「玩家一直按同一个按钮 = 操控全场选票」的那一刀：原实现每按一次就对
           全场每个听众各加 0.24~0.30 嫌疑分、各灌一条传闻，还会多拉一个人类 AI
           跟着公开指控 —— 连点十来下，任何人的票都能被攒出去，等于把社交推理压成一个按键。
           真人把同一句话讲五遍，听众的信服度不会线性涨五倍。
           台词本身照发（`say` 已经把这句播出去了），玩家仍然想说什么就说什么。 */
        if(m.ctx&&m.ctx.playerClaims&&
          m.ctx.playerClaims.some(c=>c.target===t.i&&c.kind===sl.claim.kind)){
          toast('这句话你这场已经说过了 —— 大家听见了，但不会因此再信一次');
          return;
        }
        /* “在医疗间/走廊钻管道”是物理上不可能的口供：那里没有管道口。
           不把它算成目标的证据，反过来怀疑编造者（玩家也适用）。 */
        if(sl.claim.kind==='saw_pipe'&&sl.claim.room&&!isPipeRoom(sl.claim.room)){
          const rn=roomNameById(sl.claim.room);
          const ev={kind:'impossible_claim',x:G.me.x,y:G.me.y,room:sl.claim.room,
            t:evNow(),conf:0.3,src:'speech'};
          for(const w of cands){
            if(w.alien||!w.mind)continue;
            susAdd(w,0,SKSanity.MAPPING.impossibleClaim,'impossible_claim',ev);
          }
          const speaker=cands.find(w=>!w.alien&&w.mind);
          if(speaker)meetLater(m,650+Math.random()*400,()=>say(speaker.name,
            pickLine(speaker,'impossible_pipe',0,{r:rn})));
          return;
        }
        m.ctx.playerClaims.push({t:evNow(),target:t.i,kind:sl.claim.kind,
          room:sl.claim.room||null});
        m.ctx.playerAccuse=t.i;
        if(m.ctx.lead[t.i]==null)m.ctx.lead[t.i]=G.me.i;   /* 玩家的"亲眼目击"同样算带节奏 */
        const kindName={saw_pipe:'钻管道',saw_red:'身上带着红光',saw_knife:'出刀',
          saw_shot:'开枪',saw_sabotage:'破坏设备',saw_bot:'停摆机器人',saw_breaker:'拉闸'}[sl.claim.kind]||'动手';
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
          susAddContradiction(caught.w,0,SKSanity.MAPPING.contradiction,'contradiction_claim',caught.e);
          const tw=SKSanity.alibiTimeWord(caught.age);
          meetLater(m,600+Math.random()*400,()=>say(caught.w.name,
            G.me.name+'，你说'+t.name+'在'+roomNameById(sl.claim.room)+'？我'+tw+'在'+
            roomNameById(caught.seen)+'看见他了，对不上。'));
          return;
        }
        const weight={saw_pipe:0.26,saw_red:0.24,saw_knife:0.30,
          saw_shot:0.16,saw_sabotage:0.22,saw_bot:0.20,saw_breaker:0.12}[sl.claim.kind]||0.2;
        /* 2026-11-05 二组：玩家当众说的证词也按「当时几人听见」抽样，
           不再是全场同一个增量。 */
        const hearers=cands.filter(w=>w!==t&&w.mind&&!bestKnownTarget(w));
        const cbase=witnessCtxMul(t.x,t.y,hearers.length);
        for(const w of hearers){
          const ev={kind:'heard_claim',claimKind:sl.claim.kind,x:0,y:0,
            room:sl.claim.room||null,conf:0.5,src:'speech',subj:t.i,
            by:(G.me?G.me.i:null)};
          const wg=weight*Math.max(0.72,Math.min(1.10,cbase*(0.94+Math.random()*0.12)));
          evPush(w,ev);
          susAdd(w,t.i,Math.min(SKSanity.HEARD.cap,wg*80),'heard_claim',ev);
          /* 2026-11-18：玩家的当众证词也要进听众的整局滑窗（R11.7）——
             它既是"我听过他说几次"的记账，也是扩散追责读的那条频率依据。
             以前这里直接写 mem 就完了，玩家带节奏在 AI 心里不留次数痕迹。 */
          pushHeard(w,{by:(G.me?G.me.i:null),tgt:t.i,ev},wg);
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
            (k.kind==='saw_shot'?'开枪':(k.kind==='saw_red'?'身上带着红光':'破坏了设备')));
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

      /* 3) 玩家自述位置（无冲突）：在场的人可以作证或反问。
         若同一句里还有「不是我」，先按否认回应 —— 否则「不是我，我在X」
         会被当成普通自述，AI 从头到尾没接否认。时间线拆穿仍在上面先跑。 */
      if(sl.where){
        if(sl.deny){ denyReply(); return; }
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

      /* 5) 玩家否认（没有自述位置）：有人会接受，有人会追问 */
      if(sl.deny){
        denyReply();
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
    /* 模板清单是「按钮 / 生成器 / 门禁」的唯一口径：新增一类必须三处同批，
       否则会出现按钮点了却生成空串、或门禁只测到旧模板的情况。 */
    /* 时段只作用于**口供类**（我在… / 不是我）：parseSpeech 的 when 槽只有
       recent / night 两档，证据句是点事件，不带时段。
       · recent → 刚才，claimWindow 只核对 ALIBI.recent 窗口；
       · night  → 一整晚，核对整夜；
       · 空     → 沿用原句，45 秒默认窗口（不擅自扩大玩家没声称的时段）。 */
    function meetTemplateText(kind,t,roomId,when){ const G=getG(), SND=getSND(), DEAD=getDead(), SIM_RUN=getSimRun(), TEST_RUN=getTestRun(), SIM_NO_DISCUSS=getSimNoDiscuss(), GAME_MODE=getGameMode();
      const tag=t?tagName(t):'';
      const rn=roomId?roomNameById(roomId):'';
      /* 默认时段（没选）一律说「我刚才在」：whenWord() 可能返回"十几秒前/半分钟前"，
         那既不像人在自证、也要求解析端多认一批变体。模板只说最常见的那句。 */
      const lead=when==='recent'?'我刚才在'
        :(when==='night'?'我一整晚都在':'我刚才在');
      if(kind==='where'){
        /* P2-3：玩家没选舱室时用**他此刻真正所在的舱室**，不再用 '走廊' 兜底 ——
           "我一整晚都在走廊干活"如果人其实在引擎室，就是一句自己都圆不回来的假话。 */
        const here=rn||roomNameById(roomIdAt(G.me.x,G.me.y));
        return lead+(here||'舱里')+'干活'+(when==='night'?'，手都没停过':'');
      }
      if(kind==='deny'){
        if(!rn)return '不是我';
        return '不是我，'+lead+rn+(when==='night'?'，哪儿也没去':'');
      }
      if(!t)return '';
      if(kind==='accuse')return '我怀疑'+tag+'，先说给大伙听';
      if(kind==='vote')return '这票我投'+tag;
      if(kind==='support')return '我可以为'+tag+'作证，他干的是正经事';
      /* R12.7 / R12.8 的玩家侧口径（2026-11-18）：AI 现在会用"记仇 / 感恩 / 信誉"
         给理由，玩家也必须能说同样的话。句式刻意命中 parseSpeech 的既有词槽
         （"怀疑"→accuse 记仇；"我保"→背书记恩），不新增解析字段，两边同一条链。 */
      if(kind==='wronglead')return '我怀疑'+tag+'，他反复带节奏，话不能信';
      /* 必须含**连续**的"作证"两字：parseSpeech 的 support 词槽是 /作证/，
         "作过证"中间多一个字就匹配不上，会被当成普通发言。 */
      if(kind==='grateful')return '上次我为'+tag+'作证，这次他的说法对不上';
      const at=rn?('，就在'+rn):'';
      if(kind==='pipe'){
        /* 没有管道口的舱室不能生成"在配电室钻管道"：地点直接省略。 */
        return '我亲眼看见'+tag+' 钻管道'+(rn&&isPipeRoom(roomId)?at:'');
      }
      if(kind==='red')return '我亲眼看见'+tag+' 身上有红光'+at;
      if(kind==='knife')return '我亲眼看见'+tag+' 出刀'+at;
      if(kind==='sabotage')return '我亲眼看见'+tag+' 破坏设备'+at;
      if(kind==='bot')return '我亲眼看见'+tag+' 把机器人停摆'+at;
      if(kind==='breaker')return '我亲眼看见'+tag+' 拉闸'+at;
      return '';
    }
    function syncMeetTemplates(){ const G=getG(), SND=getSND(), DEAD=getDead(), SIM_RUN=getSimRun(), TEST_RUN=getTestRun(), SIM_NO_DISCUSS=getSimNoDiscuss(), GAME_MODE=getGameMode();
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
        /* 舱室默认必须是"不指定"（2026-11-11）：旧写法默认填玩家当前舱室，
           「看见出刀」会悄悄生成"就在玩家现在这间"——玩家没声称的地点被
           写进证词，AI 拆谎时就成了自己给自己挖的坑。
           同一场会议内保留选择，换场回到占位。 */
        const oldRoom=(roomSel.__meetSeq===m.seq)?roomSel.value:'';
        roomSel.__meetSeq=m.seq;
        roomSel.value='';
        if(oldRoom&&Array.from(roomSel.options).some(o=>o.value===oldRoom))
          roomSel.value=oldRoom;
      }
      const whenSel=document.getElementById('m-tpl-when');
      if(whenSel){
        const oldWhen=(whenSel.__meetSeq===m.seq)?whenSel.value:'';
        whenSel.__meetSeq=m.seq;
        whenSel.value=(oldWhen==='recent'||oldWhen==='night')?oldWhen:'';
      }
    }
    /* ---------------- 玩家发言冷却（2026-11-18 用户裁定）----------------
       口径：**每次发送 2 秒冷却，冷却期间发言框与发送按钮置灰**。
       以前是"限制藏在代码里"——`sayStreakOK` 把玩家的句子静默丢掉，而 `playerTalk`
       照跑，玩家看到的是"没人理我 / 我那句没出现"。现在把限制搬到明面上：
       冷却中根本发不出去，输入框标题直接写还剩多少秒。 */
    const SAY_CD_MS=2000;
    let _sayCDUntil=0,_sayCDTick=null,_sayCDWarned=false;
    function paintSayCD(){ const G=getG(), SND=getSND(), DEAD=getDead(), SIM_RUN=getSimRun(), TEST_RUN=getTestRun(), SIM_NO_DISCUSS=getSimNoDiscuss(), GAME_MODE=getGameMode();
      const inp=document.getElementById('m-text'),btn=document.getElementById('m-send');
      if(!inp||!btn)return;
      const m=G.meet;
      const canAct=!!(m&&m.phase==='discuss'&&G.me.alive&&!G.me.downed&&!G.me.detained&&!G.spectMode);
      const left=Math.max(0,_sayCDUntil-performance.now());
      const lock=!canAct||left>0;
      inp.disabled=lock; btn.disabled=lock;
      inp.placeholder=!canAct?'当前不能发言'
        :(left>0?('发言冷却 '+(left/1000).toFixed(1)+'s…'):'自由发言，回车发送');
      if(left<=0&&_sayCDTick){clearInterval(_sayCDTick);_sayCDTick=null;}
    }
    function startSayCD(){ const G=getG(), SND=getSND(), DEAD=getDead(), SIM_RUN=getSimRun(), TEST_RUN=getTestRun(), SIM_NO_DISCUSS=getSimNoDiscuss(), GAME_MODE=getGameMode();
      _sayCDUntil=performance.now()+SAY_CD_MS;
      paintSayCD();
      if(_sayCDTick)clearInterval(_sayCDTick);
      _sayCDTick=setInterval(paintSayCD,100);
    }
    function sendPlayerSpeech(text){ const G=getG(), SND=getSND(), DEAD=getDead(), SIM_RUN=getSimRun(), TEST_RUN=getTestRun(), SIM_NO_DISCUSS=getSimNoDiscuss(), GAME_MODE=getGameMode();
      const m=G.meet;
      if(!m||m.phase!=='discuss'||G.spectMode)return false;
      /* 被拘留同样没有发言资格（与 say 状态总闸、AI 行为口径一致）。
         2026-11-19：过去这里漏判 detained —— 输入框亮着、话却在 say 总闸被静默吞掉。
         现在入口就挡住并给明确提示，不静默。 */
      if(!G.me.alive||G.me.downed||G.me.detained){toast('你现在不能发言');return false;}
      const raw=String(text||'').trim(); if(!raw)return false;
      /* 冷却期禁止发言（用户裁定），但**不能静默**：保留用户输入的文字，
         在发言框里留一条系统行说明"还要等几秒"。过去只 toast（画在画布底部、
         会议遮罩底下看不见），用户看到的是"我发了、字还在、却没反应"。
         过冷却后这句仍在输入框里，照常发出且一定在发言框看得到。 */
      const wait=_sayCDUntil-performance.now();
      if(wait>0){
        if(!_sayCDWarned){
          _sayCDWarned=true;
          say('系统','发言冷却中，还需 '+Math.ceil(wait/1000)+' 秒；这句话没发出，过冷却请重新点一次', 'sys');
        }
        toast('发言冷却 '+(wait/1000).toFixed(1)+'s，这次没发出');
        paintSayCD();
        return false;                 /* 禁止这次发言，但不吞输入、不静默 */
      }
      const el=document.getElementById('m-text'); if(el)el.value='';
      /* 'me' = 真人玩家发言专用通道：say 内三道 AI 节流闸一律豁免，
         只要上面资格判定放行，这句就一定进发言框（不再静默屏蔽）。 */
      say(G.me.name,raw,'me'); SND.vote(); playerTalk(raw);
      _sayCDWarned=false;
      startSayCD();
      return true;
    }
    function openMeeting(kind,reporter,victim){ const G=getG(), SND=getSND(), DEAD=getDead(), SIM_RUN=getSimRun(), TEST_RUN=getTestRun(), SIM_NO_DISCUSS=getSimNoDiscuss(), GAME_MODE=getGameMode();
      if(G.over)return;
      if(G.terminator&&kind!=='pre')return;
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
      /* 会议盖住小游戏：只收遮罩、不结算任务（会议不打断任务这条不动），
         会后玩家还在原地，tickDoing 会用剩余时长重新开一局。 */
      if(global.SKMiniGame&&SKMiniGame.isOpen())SKMiniGame.close();
      if(G.me)G.me._mg=false;
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
        kind==='pre'?('开局航行简报（'+discuss+' 秒）· 本轮不投票 · 点击「跳过讨论」立即进入第 1 夜')
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
      /* 新会议不继承上一场的冷却（2026-11-18）：否则第一句话会被上一场残留的
         2 秒挡住，玩家会以为"又发不出去"。 */
      _sayCDUntil=0; _sayCDWarned=false; paintSayCD();
      /* 讨论阶段就把投票按钮放出来（2026-11-05 用户裁定）：可以现在投，也可以边听边改 */
      renderVoteButtons();
      document.getElementById('m-tally').innerHTML='';
      document.getElementById('m-skip-vote').classList.add('hide');
      document.getElementById('m-say').innerHTML='';
      clearNewLines();
      /* 2026-11-08：同人同场台词去重的"本场已用"表，每场清空 */
      for(const a of G.agents)a._lineUsedMeet=null;
      syncMeetTemplates();
      if(!canAct) say(G.spectMode?'旁观者':G.me.name,G.spectMode?'（旁观）只读观战，不参与讨论与投票。':'（幽灵）我在看着。','sys');
      /* 手里有确证 / 准-确证的人，会议一开始就把票压上（2026-11-05）。
         这是"可改票"的另一半：先投，才有"听完改票"这回事。 */
      castEarlyVotes(G.meet);
      startChatter(G.meet);
      if(!G.simMode)meetingTimer();
    }
    function meetingTimer(){ const G=getG(), SND=getSND(), DEAD=getDead(), SIM_RUN=getSimRun(), TEST_RUN=getTestRun(), SIM_NO_DISCUSS=getSimNoDiscuss(), GAME_MODE=getGameMode();
      clearInterval(meetingTick);
      meetingTick=setInterval(()=>{
        const m=G.meet; if(!m){clearInterval(meetingTick);return;}
        /* 真暂停（幽灵/旁观者在会议里按 ESC）期间会议时钟冻结，否则"已暂停"是假的；
           只认 G.pauseMeet —— 夹具用 `g.paused=true` 当"冻结世界但要推进台词"的开关。 */
        if(G.pauseMeet)return;
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
    function leadingAccused(self){ const G=getG(), SND=getSND(), DEAD=getDead(), SIM_RUN=getSimRun(), TEST_RUN=getTestRun(), SIM_NO_DISCUSS=getSimNoDiscuss(), GAME_MODE=getGameMode();
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
    /* ---------------- 会议中改票（2026-11-05 用户裁定）----------------
       用户口径：**AI 可以在会议进行中改票，依据是别人当场说的话**。
       四条约束，少一条这条机制就退化成"随机抖动"：
         ① `known`（亲眼确证）**不松绑**：见过的人不会因为别人一句话改票，
            也不会被弃票盾挡掉 —— 用户 2026-11-05 明确保留这一条；
         ② 改票必须由**可指认的发言**触发：谁说的、把票从谁改到谁，全部记进
            `m.voteStory`，门禁可以结构化断言"没有发言就没有改票"；
         ③ 只能在自己的信念排序里改（`sus[新目标] > sus[旧目标] + 0.08`）——
            听得进话，但不是听谁的话就投谁；
         ④ 先投的是「手里有硬东西」的人；没想好的人可以一直听到投票开始。
       同批裁定：「通胀降判断」不做（`TESTIFY` 权重不动）。 */
    /* 假设层（2026-11-06）：两个假说难分高下且手里没有硬证据 → 不投。
       判断依据是 sus **分布结构**，不是随机抖动；确证/准-确证/已公开指控都优先于它。 */
    function hypothesisCompeting(a){ const G=getG(), SND=getSND(), DEAD=getDead(), SIM_RUN=getSimRun(), TEST_RUN=getTestRun(), SIM_NO_DISCUSS=getSimNoDiscuss(), GAME_MODE=getGameMode();
      return !a.alien && hypothesisSpread(a).competing;
    }
    /* 统一身份轴（h = P(目标是人类)，一张表两个导出）2026-11-18 已归位：
       数值真源 js/ai/sanity.js#IDENTITY，函数真源 js/t2/ai.js#identityAxis / hostileProb。
       搬家的原因写在 js/ai/sanity.js 的 ④′ 段：数值表留在本文件闭包里违反红线 14，
       而 js/t2/ai.js 的 topSus 现在要读它（R12.8 人类侧改读统一轴），反向依赖拿不到函数。
       本文件只保留下面这几个把 h 换算成行为系数的函数（targetDistMul / hostileWeight）。 */
    function targetDistMul(h){ const G=getG(), SND=getSND(), DEAD=getDead(), SIM_RUN=getSimRun(), TEST_RUN=getTestRun(), SIM_NO_DISCUSS=getSimNoDiscuss(), GAME_MODE=getGameMode();
      return IDENTITY.targetMulMax-(IDENTITY.targetMulMax-IDENTITY.targetMulMin)*h;
    }
    /* H 作为候选权重：不给每帧掷骰，只在候选池里按敌对概率加权。
       异形侧用 0.08 + h²（更尖，但保留探索）；人类侧维持线性，
       因为人类的 known/almost 分支已经先行，软层只做兜底。 */
    function hostileWeight(a,t){ const G=getG(), SND=getSND(), DEAD=getDead(), SIM_RUN=getSimRun(), TEST_RUN=getTestRun(), SIM_NO_DISCUSS=getSimNoDiscuss(), GAME_MODE=getGameMode();
      const p=hostileProb(a,t);
      return a.alien ? (IDENTITY.alienExplore+Math.pow(p,IDENTITY.alienPow))
        : Math.max(0.01,p);
    }
    function weightedHostileTarget(a,cands){ const G=getG(), SND=getSND(), DEAD=getDead(), SIM_RUN=getSimRun(), TEST_RUN=getTestRun(), SIM_NO_DISCUSS=getSimNoDiscuss(), GAME_MODE=getGameMode();
      let total=0,pick=null;
      for(const t of cands){
        if(!t||!t.alive||t.downed||t===a)continue;
        if(a.alien&&isMate(a,t.i))continue;
        const w=hostileWeight(a,t);
        total+=w;
        if(Math.random()*total<w)pick=t;
      }
      return pick;
    }
    /* 公开指控热度：**只数当众指认**（谁 accuse 了谁），不读任何人的私有 sus / known。
       `self` 与目标本身不计；死人与濒死者不算声音。 */
    function publicAccuseHeat(t,self){ const G=getG(), SND=getSND(), DEAD=getDead(), SIM_RUN=getSimRun(), TEST_RUN=getTestRun(), SIM_NO_DISCUSS=getSimNoDiscuss(), GAME_MODE=getGameMode();
      if(!t)return 0;
      let n=0;
      for(const x of G.agents){
        if(x===self||x===t||!x.alive||x.downed)continue;
        if(x.accuse===t.i)n++;
      }
      return n;
    }
    /* 异形的社交顺势（2026-11-06 · AI 拟人化）
       ------------------------------------------------------------
       真人冒充者的基本功不是"猜谁最像人类"，而是**看场上谁已经被咬**：
       顺着已有的公开嫌疑踩一脚，既省力又不容易被当成孤票；
       反过来，在全场都信某个人时突然咬他，等于自己举手说"我是外人"。
       两条分支：
         ① 有靶子（热度 ≥ SOCIAL.hotMin）→ 按性格概率 `SKTrait.C.pileOn` 顺势，
            只在**热度最高的一档**里挑，平手随机；
         ② 没靶子 / 没顺势 → 维持原来的身份轴加权（先验相同时近似均匀）。
       返回 `{i, why, heat}`：`why` 供门禁做结构化断言，台词与玩家侧不读它。 */
    /* 异形先发制人（2026-11-08 用户裁定）
       「异形会率先进行指控。比如它甚至有可能在人类之前就说某个人是异形。
         而不是反击指控。他指控某个人是异形的时候，甚至有可能是第一句话说出来的。」
       与 planAlienDeception 的分工：那条走「被确证后反咬 / 被动搅浑水」；
       这条只管**抢在人类之前定调**，不依赖"谁先咬过谁"。
       与 COFRAME 的分工：COFRAME 管「几个人一起咬」，这条管「谁先开口」。
       红线：靶子只从 `humanT` / 距离 / 非队友里挑（weightedHostileTarget），
             不读阵营表；假口供只写传闻（heard_frame_opening），绝不写 known。 */
    function planFirstAccuse(m){ const G=getG(), SND=getSND(), DEAD=getDead(), SIM_RUN=getSimRun(), TEST_RUN=getTestRun(), SIM_NO_DISCUSS=getSimNoDiscuss(), GAME_MODE=getGameMode();
      const out={by:null,target:null,kind:null,room:null,allies:[]};
      if(!m||m.kind==='pre')return out;          /* 开局讨论还没死人，不抢先咬 */
      if(Math.random()>=SKSanity.FIRST.chance)return out;
      const pool=G.agents.filter(x=>x.alive&&!x.downed&&(x!==G.me||G.spectMode));
      const aliens=pool.filter(x=>x.alien);
      if(!aliens.length)return out;
      /* 先开口的人随机选一只异形：不按"谁更干净"排序 —— 那需要读私有 sus，
         等于用上帝视角挑发言人。真人局里是"谁憋不住谁先说"。 */
      const liar=aliens[Math.floor(Math.random()*aliens.length)];
      const targets=pool.filter(x=>x!==liar&&!x.alien&&!isMate(liar,x.i));
      if(!targets.length)return out;
      const tgt=weightedHostileTarget(liar,targets);
      if(!tgt)return out;
      out.by=liar; out.target=tgt.i;
      /* 2026-11-21 用户裁定：先发制人也可以说软话（语气像"我就是觉得不对"），
         硬话只按 hardLine 概率 —— 否则异形的硬话比例永远高于人类，可被反推。 */
      out.kind=Math.random()<(SKSanity.MISLEAD.hardLine||0.15)
        ?(Math.random()<0.7?'saw_red':'saw_pipe')
        :['sus_high','quick_report','heard_frame','near_body'][Math.floor(Math.random()*4)];
      out.room=alibiOf(tgt).room||null;
      /* 附议者：复用 COFRAME 的声势口径（最多 maxAccusers-1 个，优先已认出的队友） */
      const others=aliens.filter(x=>x!==liar);
      others.sort((p,q)=>(isMate(q,liar.i)?1:0)-(isMate(p,liar.i)?1:0));
      for(const x of others){
        if(out.allies.length>=Math.max(0,SKSanity.FIRST.maxAccusers-1))break;
        out.allies.push(x);
      }
      return out;
    }
    function alienSocialPick(a,pool,heatMap){ const G=getG(), SND=getSND(), DEAD=getDead(), SIM_RUN=getSimRun(), TEST_RUN=getTestRun(), SIM_NO_DISCUSS=getSimNoDiscuss(), GAME_MODE=getGameMode();
      if(!pool||!pool.length)return {i:null,why:'none',heat:0};
      const heat=t=>heatMap?((heatMap[t.i]||0)):publicAccuseHeat(t,a);
      let top=-1,hot=[];
      for(const t of pool){
        const h=heat(t);
        if(h<SKSanity.SOCIAL.hotMin)continue;
        if(h>top){top=h;hot=[t];}
        else if(h===top)hot.push(t);
      }
      /* 概率为 0 时**不要**调用 Math.random()：关掉机制的那一档不该挪动随机流，
         否则 A/B 的对照组和正式口径会从第一个会议起就走上两条随机路径。 */
      const pileP=SKTrait.C.pileOn(a);
      if(pileP>0&&hot.length&&Math.random()<pileP){
        const t=hot[Math.floor(Math.random()*hot.length)];
        return {i:t.i,why:'pile',heat:top};
      }
      const pick=weightedHostileTarget(a,pool);
      return {i:pick?pick.i:null,why:'h',
        heat:pick?heat(pick):0};
    }
    /* 顺势构陷的靶子选择（只读公开指控）：场上有靶子时按 `SOCIAL.frameFollow` 往上泼，
       没有就返回 null，由调用方退回随机挑一个。单独抽出来是为了门禁能结构化断言，
       不用去猜一段台词里到底在咬谁。 */
    function alienFrameTarget(liar,targets){ const G=getG(), SND=getSND(), DEAD=getDead(), SIM_RUN=getSimRun(), TEST_RUN=getTestRun(), SIM_NO_DISCUSS=getSimNoDiscuss(), GAME_MODE=getGameMode();
      if(!liar||!targets||!targets.length)return {t:null,why:'none'};
      let top=-1,hot=[];
      for(const t of targets){
        const h=publicAccuseHeat(t,liar);
        if(h<SKSanity.SOCIAL.hotMin)continue;
        if(h>top){top=h;hot=[t];}
        else if(h===top)hot.push(t);
      }
      if(hot.length&&SKSanity.SOCIAL.frameFollow>0&&Math.random()<SKSanity.SOCIAL.frameFollow)
        return {t:hot[Math.floor(Math.random()*hot.length)],why:'follow',heat:top};
      return {t:null,why:'random'};
    }
    /* 伙同投票（2026-11-06 用户裁定）：异形队友 A 公开指控 T 后，
       认出 A 且信任 A 的异形 B 会跟票 T。只用 a.mates（亲眼目击推断），
       不读系统队友表；A 的洗白指控（_busTarget）不带队。
       跟票概率：B 被 A 当众保过（trust≥0.25）→ 必跟；只认出队友 → 由性格 followChance 决定。
       目标若是 B 自己认出的队友 / 恩人，则跳过（不能为了跟票把自家队友送走）。 */
    function alienPackLead(){ const G=getG(), SND=getSND(), DEAD=getDead(), SIM_RUN=getSimRun(), TEST_RUN=getTestRun(), SIM_NO_DISCUSS=getSimNoDiscuss(), GAME_MODE=getGameMode();
      for(const x of G.agents){
        if(!x.alien||!x.alive||x.downed||x.accuse==null)continue;
        const t=G.agents[x.accuse];
        if(!t||!t.alive||t.downed||t===x||isMate(x,t.i))continue;
        if(x._busTarget!=null)continue;
        return x;
      }
      return null;
    }
    function mateFollowChance(a,lead){ const G=getG(), SND=getSND(), DEAD=getDead(), SIM_RUN=getSimRun(), TEST_RUN=getTestRun(), SIM_NO_DISCUSS=getSimNoDiscuss(), GAME_MODE=getGameMode();
      const tr=Math.max(0,emotionOf(a,lead.i));
      if(tr>=0.25)return 1;
      return Math.min(0.9,0.45+0.35*SKTrait.C.followChance(a));
    }
    function voteLean(a){ const G=getG(), SND=getSND(), DEAD=getDead(), SIM_RUN=getSimRun(), TEST_RUN=getTestRun(), SIM_NO_DISCUSS=getSimNoDiscuss(), GAME_MODE=getGameMode();
      const kn=bestKnownTarget(a);
      /* 2026-11-21：known 也可能因"目击队友作案"落到队友身上（旧 bug），
         这里再兜一道 —— 异形绝不因 known 投队友。 */
      if(kn&&!isMate(a,kn.i))return {v:kn.i,s:3,why:'known'};
      const af=bestAlmostTarget(a);
      if(af&&!isPatron(a,af.i)&&!almostFriendOf(a,af.i)&&(!a.alien||!isMate(a,af.i)))
        return {v:af.i,s:2.5,why:'almost'};
      const sp=a.suspect;
      /* 2026-11-21 用户质询「异形不会投队友吧」：补上 isMate ——
         suspect 可能因目击认错（misId）落到队友身上，绝不能凭它送走自己人。 */
      if(sp!=null&&G.agents[sp]&&G.agents[sp].alive&&!G.agents[sp].downed&&sp!==a.i&&
        !isMate(a,sp)&&
        !(a.mind&&a.mind.knownHuman&&a.mind.knownHuman[sp]))
        return {v:sp,s:2,why:'suspect'};
      if(hypothesisCompeting(a))return {v:-1,s:0,why:'competing'};
      const bs=bestSusTarget(a,0.55);
      if(bs&&!isPatron(a,bs.i)&&!almostFriendOf(a,bs.i)&&!isMate(a,bs.i))
        return {v:bs.i,s:1,why:'sus'};
      return {v:-1,s:0,why:'none'};
    }
    function castEarlyVotes(m){ const G=getG(), SND=getSND(), DEAD=getDead(), SIM_RUN=getSimRun(), TEST_RUN=getTestRun(), SIM_NO_DISCUSS=getSimNoDiscuss(), GAME_MODE=getGameMode();
      if(!m||m.voteT<=0)return 0;
      m.voteMeta=m.voteMeta||{};
      let n=0;
      for(const a of G.agents){
        if(!a.alive||a.downed||(!G.spectMode&&a===G.me))continue;
        const lean=voteLean(a);
        if(lean.s<2)continue;              /* 只有手里有硬东西的人先投 */
        m.votes[a.i]=lean.v;
        m.voteMeta[a.i]={v:lean.v,s:lean.s,why:lean.why,chg:0,early:1,
          rev:(a.mind&&a.mind.rev)|0,t:Math.round(m.t)};
        n++;
      }
      if(G.simStats)G.simStats.earlyVotes=(G.simStats.earlyVotes||0)+n;
      m.earlyVotes=n;
      return n;
    }
    /* ---- 描述准确率（2026-11-07 用户裁定）----
       「压低人类 AI 的描述准确率（像真人那么记错看错。）」
       真人转述一句话，舱室、动作、把握程度都可能走样；这里让**说出口的证言**
       在进入听众记忆之前按 SKSanity.DESC 做一次可解释偏差：
         · 房间换成同船另一间真实舱室（不凭空造词）
         · 动作换成同类动作（出刀 / 钻管道 / 红光互串）
         · 只要记错一处，置信度与嫌疑权重一起打折
       只作用于传闻 / 言语类证据；亲眼目击（src:'sight'）不动 —— 认错人由 MISID 负责。
       偏差写进 ev 的副本，不污染原证言对象（同一条可能被多个听众引用）。 */
    function descDistort(it){ const G=getG(), SND=getSND(), DEAD=getDead(), SIM_RUN=getSimRun(), TEST_RUN=getTestRun(), SIM_NO_DISCUSS=getSimNoDiscuss(), GAME_MODE=getGameMode();
      const D=SKSanity.DESC;
      if(!D||!D.on||!it.ev||it.ev.src==='sight'||it.ev.kind==='heard_vouch')
        return {ev:it.ev,wgt:it.wgt};
      let ev=it.ev,wgt=it.wgt,touched=false;
      const clone=()=>{if(!touched){ev=Object.assign({},it.ev);touched=true;}};
      if(it.ev.room!=null&&Math.random()<D.roomErr){
        const isId=typeof it.ev.room==='string'&&M.rooms.some(r=>r.id===it.ev.room);
        const pool=M.rooms.filter(r=>isId?r.id!==it.ev.room:r.name!==it.ev.room);
        if(pool.length){
          clone();
          const r=pool[Math.floor(Math.random()*pool.length)];
          ev.room=isId?r.id:r.name;
        }
      }
      const SWAP={saw_knife:'saw_pipe',saw_pipe:'saw_red',saw_red:'saw_knife',
        saw_sabotage:'saw_knife',heard_accuse:'heard_frame',heard_frame:'heard_accuse'};
      if(it.ev.kind&&Math.random()<D.kindErr&&SWAP[it.ev.kind]){
        clone(); ev.kind=SWAP[it.ev.kind];
      }
      if(touched){
        ev.conf=+(Math.max(0.1,(it.ev.conf||0.5)*D.confLoss)).toFixed(2);
        wgt=+(it.wgt*D.confLoss).toFixed(4);
        ev.descErr=1;
        if(G.simStats)G.simStats.descErrors=(G.simStats.descErrors||0)+1;
      }
      return {ev,wgt};
    }
    /* 一条"听来的证词"进听众的**整局滑窗**（R11.7）：满 10 条顶掉最旧的。
       只数听来的（src==='speech'）：亲眼目击另有归宿（mind.mem / why），
       正向背书（heard_vouch）不占额度。
       ⚠ 2026-11-18：这段从 deliverTestimony 里提出来成唯一实现点，
       因为**玩家当众说的证词也要进这条窗口** —— 它同时是"这人最近带了几次节奏"的
       唯一可观察依据（settleAccountability 的 spamMul 读它）。
       原来玩家那条链直接写听众的 mem、绕过这个窗口，所以既没有额度、也没有频率记账。
       返回被顶掉的条数（调用方汇总成 G.heardOverflowN）。 */
    function pushHeard(w,it,wgt){ const G=getG(), SND=getSND(), DEAD=getDead(), SIM_RUN=getSimRun(), TEST_RUN=getTestRun(), SIM_NO_DISCUSS=getSimNoDiscuss(), GAME_MODE=getGameMode();
      if(!w||!w.mind||!it||!it.ev||it.ev.src!=='speech'||it.ev.kind==='heard_vouch')return 0;
      const heard=w.mind.heard||(w.mind.heard=[]);
      let drop=0;
      while(heard.length>=SKSanity.ATTN.heardMax){
        heard.shift();drop++;
        G.heardDroppedN=(G.heardDroppedN||0)+1;
      }
      heard.push({by:it.by,tgt:it.tgt,w:wgt,kind:it.ev.kind,
        night:G.night,t:evNow(),
        seq:(G.heardSeq=(G.heardSeq||0)+1)});
      return drop;
    }
    /* 把排队中的证言发给听众：byId=null 表示「剩下的全发」。
       谁开口就发谁的 —— 这样"听到"这件事才有时间点，改票才有由头。 */
    function deliverTestimony(m,byId){ const G=getG(), SND=getSND(), DEAD=getDead(), SIM_RUN=getSimRun(), TEST_RUN=getTestRun(), SIM_NO_DISCUSS=getSimNoDiscuss(), GAME_MODE=getGameMode();
      if(!m||!m.ctx)return 0;
      const q=m.ctx.testimony; if(!q||!q.length)return 0;
      let n=0,drop=0;
      for(const it of q){
        if(it.said)continue;
        if(byId!=null&&it.by!==byId)continue;
        it.said=1;
        const w=G.agents[it.li];
        if(!w||!w.alive||w.downed||!w.mind)continue;
        const d=descDistort(it);
        /* 注意力窗口（2026-11-08 用户裁定，同日修订）
           原口径：「只会收取 10 条信息，优先早期」→ 满了丢弃新证词。
           修订口径（用户 2026-11-08）：「整局十条改成新的证词替换旧的」
           ⇒ 滑动窗口：满 10 条时**顶掉最旧的一条**，新证词照常进来。
           实现提进了 pushHeard（2026-11-18），玩家当众证词也走同一条。
           ⚠ 被顶掉的旧证词**不回收 sus**：用户要的是"新证词替换旧的"，
           不是"听了又忘"。回收会让替换口径与丢弃口径几乎等价
           （实测 48.2% vs 48.9%），等于证言通道照样关闭 —— 那不是这条指令的意思。 */
        drop+=pushHeard(w,it,d.wgt);
        susAdd(w,it.tgt,d.wgt,it.reason,d.ev);
        if((it.reason==='heard_accuse'||it.reason==='empty_accuse')&&G.meet){
          /* 公开指控（2026-11-21 用户裁定）：全场每个开会者都能看到 ——
             ① 煽动：每一名公开指控者 → 全场对目标 E+incitePer，累计封顶 inciteCap；
             ② 被指控者对指控者记仇 E（accused）；
             ③ 空口指控（无 accuseWhy 依据）→ 指控者 T −20（全场可见）。 */
          const EM=SKSanity.EMOTE, AX2=SKSanity.AXIS;
          const tgt=G.agents[it.tgt], spk=G.agents[it.by];
          if(it.reason==='heard_accuse'){
            const inc=(G.meet.ctx.incite||(G.meet.ctx.incite={}));
            const had=inc[it.tgt]||0;
            const add=EM.incitePer;
            const nv=Math.max(EM.inciteCap,Math.min(0,had+add));
            if(nv!==had){
              inc[it.tgt]=nv;
              for(const w2 of G.agents){
                if(!w2||!w2.alive||w2.downed||w2===tgt||!w2.mind||w2.i===it.by)continue;
                emoAdd(w2,it.tgt,nv-had,'incite');
              }
            }
            if(tgt&&tgt.alive&&!tgt.downed&&spk)emoAdd(tgt,it.by,EM.accused,'accused_me');
          }
          if(spk&&(it.reason==='empty_accuse'||!(spk.accuseWhy&&spk.accuseWhy.solid))){
            /* 2026-11-21 修：空口指控**每人每场会议对同一指控者只记一次**。
               旧写法每条指控都给全场每个听众扣 20 —— 一场会议 11 人互相指控，
               总账 −6888 分，全场 T 崩盘（实测人类 100%）。
               「扣指控者 20 分」是全场共识的一次性判断，不是逐条复利。 */
            const ea=(G.meet.ctx.emptyAcc||(G.meet.ctx.emptyAcc={}));
            for(const w2 of G.agents){
              if(!w2||!w2.alive||w2.downed||w2===spk||!w2.mind)continue;
              const ek=it.by+'|'+w2.i;
              if(ea[ek])continue;
              ea[ek]=1;
              credAdd(w2,it.by,AX2.emptyAccuse!=null?AX2.emptyAccuse:-20,'empty_accuse');
            }
          }
        }
        n++;
      }
      if(drop)G.heardOverflowN=(G.heardOverflowN||0)+1;
      if(n)reconsiderVotes(m,byId);
      return n;
    }
    /* 公共声势：**已经说出口**的指控（含说的人可不可信），不是别人的内心。
       真人改票很少因为"我的嫌疑分动了 0.02"，而是"三个人都这么说，那我也投他"。
       所以改票判据 = 自己的 sus + 这场会议里针对他的公开指控分量（封顶 0.30）。 */
    function votePressure(a,tgt){ const G=getG(), SND=getSND(), DEAD=getDead(), SIM_RUN=getSimRun(), TEST_RUN=getTestRun(), SIM_NO_DISCUSS=getSimNoDiscuss(), GAME_MODE=getGameMode();
      const q=(G.meet&&G.meet.ctx&&G.meet.ctx.testimony)||[];
      let p=0;
      for(const it of q){
        if(!it.said||it.reason!=='heard_accuse'||it.tgt!==tgt)continue;
        p+=0.10*Math.max(0.5,Math.min(1,credOf(a,it.by)));
      }
      /* 2026-11-05 G3：同一目标既被指控又被背书 → 证言之间有冲突，
         公开声势不该照样滚雪球。只压声势，不动自己的 sus。 */
      const rel=statementRelation(q,(G.meet&&G.meet.ctx&&G.meet.ctx.vouches)||[],tgt);
      if(rel.damp<1&&G.simStats)G.simStats.statementDamp=(G.simStats.statementDamp||0)+1;
      return Math.min(0.30,p*rel.damp);
    }
    /* 改票时的目标选择：自己的 sus + 已经说出口的公开指控分量。
       与 voteLean 的分工：voteLean 决定"会前先投谁"（只有信念，没有声势），
       这里决定"听完之后谁更该投"（允许被公开声势推过去）。 */
    function bestVoteTarget(a){ const G=getG(), SND=getSND(), DEAD=getDead(), SIM_RUN=getSimRun(), TEST_RUN=getTestRun(), SIM_NO_DISCUSS=getSimNoDiscuss(), GAME_MODE=getGameMode();
      let best=null,bs=-1;
      for(const t of G.agents){
        if(!t.alive||t.downed||t===a)continue;
        /* 2026-11-21：异形的最终投票**绝不投队友** —— 队友的 trustRaw 是 +999
           （嫌疑 0），全场无信息时 s=0 反而可能被第一个选中，必须显式排除。 */
        if(isMate(a,t.i))continue;
        if(!a.alien&&a.mind&&a.mind.knownHuman&&a.mind.knownHuman[t.i])continue;
        if(isPatron(a,t.i))continue;
        /* 2026-11-21 平衡修：准-确证人类（T≥200）不再**跳过**投票，
           改为打分折半（见下方 s 计算）——「基本是好人」是辩护倾向，不是免疫。
           旧写法直接 continue，T 封顶 200 后满场互保、异形必输（100 局人类 99%）。 */
        let s=beliefOf(a,t.i)+votePressure(a,t.i);
        if(almostFriendOf(a,t.i))s*=0.5;   /* 准-确证人类：票压减半，不免疫 */
        if(s>bs){bs=s;best=t;}
      }
      return best?{v:best.i,s:bs,why:'score'}:{v:-1,s:0,why:'none'};
    }
    function reconsiderVotes(m,byId){ const G=getG(), SND=getSND(), DEAD=getDead(), SIM_RUN=getSimRun(), TEST_RUN=getTestRun(), SIM_NO_DISCUSS=getSimNoDiscuss(), GAME_MODE=getGameMode();
      if(!m||m.phase!=='discuss'||!m.voteMeta)return 0;
      const sp=byId==null?null:G.agents[byId];
      let changed=0;
      for(const a of G.agents){
        if(!a.alive||a.downed||(!G.spectMode&&a===G.me))continue;
        const mm=m.voteMeta[a.i];
        if(!mm||mm.why==='known')continue;      /* 确信不松绑 */
        const lean=bestVoteTarget(a);
        if(lean.v<0||lean.v===mm.v)continue;
        const now=lean.s;
        const old=(mm.v>=0?beliefOf(a,mm.v)+votePressure(a,mm.v):0);
        if(!(now>old+0.10))continue;            /* 公开声势盖不过原来的判断，不跟风 */
        const cred=sp?credOf(a,sp.i):0.5;
        if(Math.random()>0.35+0.34*Math.max(0,Math.min(1,cred)))continue;
        m.votes[a.i]=lean.v;
        m.voteMeta[a.i]={v:lean.v,s:lean.s,why:lean.why,chg:(mm.chg||0)+1,
          early:mm.early,rev:(a.mind&&a.mind.rev)|0,t:Math.round(m.t)};
        (m.voteStory=m.voteStory||[]).push({who:a.i,from:mm.v,to:lean.v,by:byId,t:Math.round(m.t)});
        changed++;
        if(G.simStats)G.simStats.voteChanges=(G.simStats.voteChanges||0)+1;
        logEvent('vote_change',{actor:a.i,from:mm.v,to:lean.v,by:byId});
      }
      return changed;
    }
    /* 投票区（2026-11-05 用户裁定）：**讨论阶段就可以投，投票结束前都可以改**。
       以前只有 vote 阶段才生成按钮，玩家必须等讨论走完；现在两处共用同一个渲染器，
       点谁就覆盖谁，改票次数记进 `stats.voteChanges`（只统计玩家自己的改票）。
       注意：`m.votes` 从会议开始就存在，closeVote 才结算 —— 因此早投不会提前锁定。 */
    function renderVoteButtons(){ const G=getG(), SND=getSND(), DEAD=getDead(), SIM_RUN=getSimRun(), TEST_RUN=getTestRun(), SIM_NO_DISCUSS=getSimNoDiscuss(), GAME_MODE=getGameMode();
      const box=document.getElementById('m-who'); if(!box)return;
      const m=G.meet;
      box.innerHTML='';
      const canAct=!!(m&&G.me.alive&&!G.me.downed&&!G.spectMode);
      box.classList.toggle('hide',!canAct);
      if(!canAct)return;
      const cur=m.votes?m.votes[G.me.i]:null;
      const paint=(btn,v)=>{ if(cur===v)btn.style.borderColor='#F0C674'; };
      /* 重置未选按钮的边框：同族队友保留暗红边框（与地图 ◆同族 名牌同色），
         其他人回默认灰；选中态仍由 paint / onclick 覆盖成金色。 */
      const borderOf=c=>c.classList.contains('vote-mate')?'#7A2A2A':'#313B4B';
      for(const a of G.agents){
        if(!a.alive||a===G.me)continue;
        const btn=document.createElement('button');
        /* 终结者时刻：会议面板里亮身份（R2.9 的公开事件，与漂浮名牌、AI 判定
           共用同一个 G.revealAll）。只公开"异形 / 人类"这一层，不公开凶手归属。 */
        btn.textContent=tagName(a)+(G.revealAll?(a.alien?' · 内鬼':' · 人类'):'');
        /* 2026-11-22 用户裁定：结伴局（或局中已认出队友的）异形玩家在投票名单里
           也能看到队友标注 —— 与地图头顶 ◆同族 共用 isMyMate 判据（红线 15）。
           标注做成独立 <span>，按钮 textContent 前缀仍为「编号 + 名字」，
           既有「按完整 tag 找按钮」的门禁断言不受影响。 */
        if(isMyMate(a)){
          btn.classList.add('vote-mate');
          const badge=document.createElement('span');
          badge.className='mate-badge';
          badge.textContent='◆同族';
          btn.appendChild(badge);
        }
        paint(btn,a.i);
        btn.onclick=()=>{
          const prev=m.votes[G.me.i];
          if(prev!=null&&prev!==a.i&&G.stats)G.stats.voteChanges=(G.stats.voteChanges||0)+1;
          m.votes[G.me.i]=a.i;
          [...box.children].forEach(c=>{c.style.borderColor=borderOf(c);});
          btn.style.borderColor='#F0C674';
        };
        box.appendChild(btn);
      }
      const sk=document.createElement('button');
      sk.textContent='弃权';
      paint(sk,-1);
      sk.onclick=()=>{
        const prev=m.votes[G.me.i];
        if(prev!=null&&prev!==-1&&G.stats)G.stats.voteChanges=(G.stats.voteChanges||0)+1;
        m.votes[G.me.i]=-1;
        [...box.children].forEach(c=>{c.style.borderColor=borderOf(c);});
        sk.style.borderColor='#F0C674';
      };
      box.appendChild(sk);
    }
    function startVote(){ const G=getG(), SND=getSND(), DEAD=getDead(), SIM_RUN=getSimRun(), TEST_RUN=getTestRun(), SIM_NO_DISCUSS=getSimNoDiscuss(), GAME_MODE=getGameMode();
      const m=G.meet;
      /* 讨论里没被说出口的证言在这里补发：总集合与旧版逐条一致，
         变的只是时间点（旧版一开会就全部生效）。补发之后还能改最后一次票。 */
      deliverTestimony(m,null);
      m.phase='vote'; m.t=m.voteT;
      stopChatter();
      /* 2026-11-20 态度互斥自检：讨论全部说完、投票开始之前跑一次（应为 0 违例） */
      auditStance(m);
      document.getElementById('m-skip').classList.add('hide');
      const tpl=document.getElementById('m-tpl'); if(tpl)tpl.classList.add('hide');
      /* T5（2026-11-05）：投票期发言通道已经关闭（sendPlayerSpeech 在 phase!=='discuss'
         时直接 return），但输入框仍能打字、发送按钮仍可点，玩家会以为发出去了。
         这里显式禁用并改占位，讨论期由 openMeeting 恢复。 */
      const vinp=document.getElementById('m-text'), vsb=document.getElementById('m-send');
      if(vinp){vinp.disabled=true;vinp.placeholder='投票中…';}
      if(vsb)vsb.disabled=true;
      /* 讨论期已经投过的票保留高亮，这里只重绘；投票到 closeVote 才结算 */
      renderVoteButtons();
      /* 投票等待结束后，给玩家一个“跳过投票”出口：
         只结束剩余投票时间；已经投给谁就保留那一票，没投才记弃权。
         与“跳过讨论”同语义，不改变任何 AI 票。 */
      document.getElementById('m-skip-vote').classList.toggle('hide',
        !(G.me.alive&&!G.me.downed&&!G.spectMode));
      // AI 投票：先说出口的指控 → 证据链最高嫌疑 → 人类无证据弃权；异形随机独立投票
      const packLead=alienPackLead();
      voteBallotsForAll(m,packLead);
      /* 态度互斥优先于其它兜底：先把"当众保过又投他"的票清掉，再走信誉/准-确证那些概率闸 */
      voteStanceFallback(m);
      voteTrustFallback(m);
      voteQuasiConfirm(m);
      voteFillStubs(m);
    }
    /* 投票主体：票权 / 门槛 / 改票 / 终结者 / 异形同伙回避（startVote 拆分第三批） */
    function voteBallotsForAll(m,packLead){ const G=getG(), SND=getSND(), DEAD=getDead(), SIM_RUN=getSimRun(), TEST_RUN=getTestRun(), SIM_NO_DISCUSS=getSimNoDiscuss(), GAME_MODE=getGameMode();
      for(const a of G.agents){
        if(!a.alive||(!G.spectMode&&a===G.me)||a.downed)continue;
        /* 先投的人：这段时间没听到能改我判断的话，就不重掷一次骰子。
           `rev` 只在 susAdd 时自增 —— 有发言改变了我的信念才允许重算，
           否则"改票"就成了随机数换了个理由。 */
        const mm=m.voteMeta&&m.voteMeta[a.i];
        if(mm&&mm.early&&((a.mind&&a.mind.rev)|0)===mm.rev){
          if(G.simStats)G.simStats.earlyKept=(G.simStats.earlyKept||0)+1;
          continue;
        }
        /* 确证优先：见过异形专属行为的人不需要再猜，直接投确证目标 */
        if(!a.alien){
          const kn=bestKnownTarget(a);
          if(kn&&!isMate(a,kn.i)){ m.votes[a.i]=kn.i; continue; }
        }
        /* 情绪先于从众（2026-10-31）：被某人当众咬狠了（grudge≥0.6），
           激进的人大概率把票砸回去；被某人当众保过（trust≥0.8）就不过他的票。 */
        let emo=null,es=0;
        for(const t of G.agents){
          if(!t||!t.alive||t===a||isMate(a,t.i))continue;
          const g=Math.max(0,-emotionOf(a,t.i));
          if(g>es){es=g;emo=t;}
        }
        if(emo&&es>=0.6&&Math.random()<SKTrait.C.voteGrudgePull(a)/10){
          m.votes[a.i]=emo.i;continue;
        }
        /* 伙同投票：跟信任的异形队友走。认出的队友是基础；被当众保过则必跟。
           目标是自己认出的队友 / 恩人时不跟，避免把自家队友送走。 */
        if(a.alien&&packLead&&packLead!==a&&isMate(a,packLead.i)&&
           packLead.alive&&!packLead.downed&&packLead.accuse!=null){
          const pt=G.agents[packLead.accuse];
          if(pt&&pt.alive&&!pt.downed&&pt!==a&&!isMate(a,pt.i)&&!isPatron(a,pt.i)&&
             Math.random()<mateFollowChance(a,packLead)){
            m.votes[a.i]=pt.i;
            if(G.simStats)G.simStats.mateFollowVotes=(G.simStats.mateFollowVotes||0)+1;
            m.voteMeta=m.voteMeta||{};
            m.voteMeta[a.i]={v:pt.i,s:3,why:'mate_follow',chg:1,early:0,
              lead:packLead.i,t:Math.round(m.t)};
            continue;
          }
        }
        const patron=i=>isPatron(a,i);
        /* 2026-11-21 用户裁定「异形绝不投队友」：连"大义灭亲"洗白戏的
           _busTarget 例外也一并去掉 —— 话术可以公开指控认出的队友（planMateBus
           仍然说），但票绝不跟到队友头上。旧写法 `||a._busTarget===a.accuse`
           让 liar.accuse=队友 时穿过 isMate 闸，实测 probe-votemate 里
           vote=队友 / audit=1。去掉后 acc=null，异形回落到 9174 的正常投票
           （pool 已排除 isMate），嘴上的洗白戏保留、票不投自己人。 */
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
          if(af&&!patron(af.i)&&!almostFriendOf(a,af.i)){
            m.votes[a.i]=af.i;continue;
          }
        }
        if(a.suspect!=null&&G.agents[a.suspect]&&G.agents[a.suspect].alive&&
          G.agents[a.suspect]!==a&&!patron(a.suspect)&&(!a.alien||!isMate(a,a.suspect))){
          if(!isMate(a,a.suspect)){ m.votes[a.i]=a.suspect; continue; }
        }
        /* 2026-11-06 假设层：走到这里说明没有确证 / 公开指控 / 准-确证 / 明确 suspect。
           若两个假说权重几乎一样，真人会弃权而不是闭眼挑一个。 */
        if(hypothesisCompeting(a)){
          m.votes[a.i]=-1;
          if(G.simStats){
            G.simStats.hypothesisAbstain=(G.simStats.hypothesisAbstain||0)+1;
            G.simStats.abstains=(G.simStats.abstains||0)+1;
          }
          continue;
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
          /* 统一轴软层：没有指控/嫌疑时，按“目标像人类”的敌对概率加权，
             不再均匀随机。先验相同则权重相同，证据越多越偏向人类。 */
          const pick=weightedHostileTarget(a,pool);
          m.votes[a.i]=pick?pick.i:-1;
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
        const susOK=(beliefOf(a,lead)>=needSus)&&(needSus>=0.18||hasReal);
        if(lead!=null&&lead!==a.i&&
          (susOK||Math.max(0,-emotionOf(a,lead))>=0.4)){
          m.votes[a.i]=lead;continue;
        }
        const bs2=bestSusTarget(a,SKTrait.C.shootSus(a)*0.9);
        m.votes[a.i]=(bs2&&bs2.i!==a.i)?bs2.i:-1;
      }
    }

    /* 见区间自带注释：正向信任兜底（startVote 拆分第三批） */
    function voteTrustFallback(m){ const G=getG(), SND=getSND(), DEAD=getDead(), SIM_RUN=getSimRun(), TEST_RUN=getTestRun(), SIM_NO_DISCUSS=getSimNoDiscuss(), GAME_MODE=getGameMode();
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
    }

    /* 2026-11-20 态度互斥的**投票侧**（用户报的「说一套投一套」）：
       当众替某人说过话（背书 / 替人辩护）的人，这一票不能砸回同一个人 ——
       玩家听到「先别投他，他昨晚就在仓库干活」，转头又看见他把票投给他，
       这就是最典型的"左右脑互搏"，而且比台词更难辩解。
       与 voteTrustFallback 同一位置、同一做法：**不改上面那些投票分支**，
       统一在结算前把这一票清成弃权。弃权是安全值，不会误伤任何人。 */
    function voteStanceFallback(m){ const G=getG(), SND=getSND(), DEAD=getDead(), SIM_RUN=getSimRun(), TEST_RUN=getTestRun(), SIM_NO_DISCUSS=getSimNoDiscuss(), GAME_MODE=getGameMode();
      if(!m||!m.votes)return;
      for(const a of G.agents){
        if(!a.alive||a.downed||(!G.spectMode&&a===G.me))continue;
        const v=m.votes[a.i];
        if(v==null||v<0)continue;
        if(!stanceSaidSupport(a,v))continue;
        m.votes[a.i]=-1;
        stanceBlock();
        if(G.simMode&&G.simStats)
          G.simStats.abstains=(G.simStats.abstains||0)+1;
      }
    }
    /* 计票前自检：兜底之后不该再有人投自己保过的人（玩家自己的票不在此列）。 */
    function auditVotes(m){ const G=getG(), SND=getSND(), DEAD=getDead(), SIM_RUN=getSimRun(), TEST_RUN=getTestRun(), SIM_NO_DISCUSS=getSimNoDiscuss(), GAME_MODE=getGameMode();
      if(!m||!m.votes)return 0;
      let bad=0;
      for(const k in m.votes){
        const a=G.agents[+k], v=m.votes[k];
        if(!a||v==null||v<0)continue;
        if(!G.spectMode&&a===G.me)continue;
        if(stanceSaidSupport(a,v))bad++;
      }
      if(bad){
        G.stanceViolations=(G.stanceViolations||0)+bad;
        if(G.simMode&&G.simStats)
          G.simStats.stanceViolations=(G.simStats.stanceViolations||0)+bad;
      }
      return bad;
    }

    /* 见区间自带注释：准-确证的投票侧（startVote 拆分第三批） */
    function voteQuasiConfirm(m){ const G=getG(), SND=getSND(), DEAD=getDead(), SIM_RUN=getSimRun(), TEST_RUN=getTestRun(), SIM_NO_DISCUSS=getSimNoDiscuss(), GAME_MODE=getGameMode();
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

    /* 见区间自带注释：补齐票根，让 voteStory 完整（startVote 拆分第三批） */
    function voteFillStubs(m){ const G=getG(), SND=getSND(), DEAD=getDead(), SIM_RUN=getSimRun(), TEST_RUN=getTestRun(), SIM_NO_DISCUSS=getSimNoDiscuss(), GAME_MODE=getGameMode();
      /* 补齐票根：没早投的人在这里落定，`voteStory` 才有一份完整的"谁最后投了谁" */
      m.voteMeta=m.voteMeta||{};
      for(const a of G.agents){
        if(!a.alive||a.downed||(!G.spectMode&&a===G.me))continue;
        if(m.voteMeta[a.i])continue;
        const v=m.votes[a.i]==null?-1:m.votes[a.i];
        m.voteMeta[a.i]={v:v,s:1,why:'final',chg:0,early:0,
          rev:(a.mind&&a.mind.rev)|0,t:0};
      }
    }

    /* 驱逐门槛（2026-11-06 用户裁定）：可投票人数 >7 → 至少 4 票；≤7 → 3 票。
       只数真正能投票的人（活着且未濒死），与 startVote 的选民口径一致 ——
       濒死者不能投票，若按“存活人数”算，残局会把门槛抬到几乎凑不齐。 */
    function voteThreshold(){ const G=getG(), SND=getSND(), DEAD=getDead(), SIM_RUN=getSimRun(), TEST_RUN=getTestRun(), SIM_NO_DISCUSS=getSimNoDiscuss(), GAME_MODE=getGameMode();
      const voters=G.agents.filter(a=>a.alive&&!a.downed).length;
      const v=SKSanity.VOTE;
      return {need:voters>v.lateAt?v.need:v.lateNeed,voters};
    }
    function closeVote(){ const G=getG(), SND=getSND(), DEAD=getDead(), SIM_RUN=getSimRun(), TEST_RUN=getTestRun(), SIM_NO_DISCUSS=getSimNoDiscuss(), GAME_MODE=getGameMode();
      const m=G.meet; m.phase='reveal'; m.t=SKSanity.MEET.reveal;
      /* 明牌人类队友的最终票闸（2026-11-20）：不管前面哪条兜底分支把票塞进来，
         人类对 knownHuman 的票在计票前一律清成弃权。这一条与 voteLean / bestVoteTarget
         的入口过滤同源，属于"最后一道保险"，不是第二套判据。 */
      for(const k in m.votes){
        const v=m.votes[k], vt=G.agents[+k];
        if(v>=0&&vt&&!vt.alien&&vt.mind&&vt.mind.knownHuman&&vt.mind.knownHuman[v]){
          m.votes[k]=-1;
          if(G.simStats)G.simStats.knownHumanBlockVotes=(G.simStats.knownHumanBlockVotes||0)+1;
        }
      }
      /* 2026-11-20 态度互斥自检：计票前再查一遍票型（正常应恒为 0） */
      auditVotes(m);
      document.getElementById('m-skip-vote').classList.add('hide');
      const tally={}; let abstain=0;
      /* 2026-11-21 审计：异形投给队友的票数（应为 0；>0 就是逻辑漏洞） */
      if(G.simStats){
        for(const k in (m.votes||{})){
          const vv=m.votes[k], av=G.agents[+k];
          if(av&&av.alien&&vv!=null&&vv>=0&&isMate(av,vv))
            G.simStats.voteToMate=(G.simStats.voteToMate||0)+1;
        }
      }
      for(const k in m.votes){const v=m.votes[k]; if(v<0){abstain++;continue;} tally[v]=(tally[v]||0)+1;}
      let max=0,top=-1,tie=false;
      for(const k in tally){const c=tally[k];
        if(c>max){max=c;top=+k;tie=false;} else if(c===max) tie=true;}
      const th=voteThreshold();
      const ok=(max>=th.need&&!tie);
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
      m.tally={tally,abstain,max,ok,need:th.need,voters:th.voters,ex:devSaved?null:cand,devSaved,
        exName:cand?tagName(cand):null,exRole:cand?(cand.alien?'内鬼':'人类'):null};
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
          if(cand.alien)G.simStats.knownVotesAlien=(G.simStats.knownVotesAlien||0)+kv;
          else G.simStats.knownVotesHuman=(G.simStats.knownVotesHuman||0)+kv;
          if(kv>0){
            G.simStats.ejectByKnown=(G.simStats.ejectByKnown||0)+1;
            if(cand.alien)G.simStats.ejectByKnownAlien=(G.simStats.ejectByKnownAlien||0)+1;
            else G.simStats.ejectByKnownHuman=(G.simStats.ejectByKnownHuman||0)+1;
          }
          if(G.detainLog&&G.detainLog[cand.i]!=null)
            G.simStats.detainEvictions=(G.simStats.detainEvictions||0)+1;
          /* 准-确证驱动的驱逐：至少一票来自 almost.foe（验改动 B 真的有用） */
          let av=0;
          for(const k in m.votes){
            if(m.votes[k]!==cand.i)continue;
            if(almostFoeOf(G.agents[+k],cand.i))av++;
          }
          if(av>0){
            G.simStats.almostEject=(G.simStats.almostEject||0)+1;
            if(cand.alien)G.simStats.almostEjectAlien=(G.simStats.almostEjectAlien||0)+1;
            else G.simStats.almostEjectHuman=(G.simStats.almostEjectHuman||0)+1;
          }
        }
        /* 追责：结果公布后清算带节奏的人（必须在 die 之后、身份已定） */
        settleAccountability(cand);
      }
      renderTally();
      if(cand)sysSay('驱逐 '+tagName(cand)+' · 身份公布：'+(cand.alien?'内鬼':'人类'));
    }
    function renderTally(){ const G=getG(), SND=getSND(), DEAD=getDead(), SIM_RUN=getSimRun(), TEST_RUN=getTestRun(), SIM_NO_DISCUSS=getSimNoDiscuss(), GAME_MODE=getGameMode();
      if(SIM_RUN)return;
      const m=G.meet, box=document.getElementById('m-tally');
      const {tally,abstain,max,ex,devSaved,exName,exRole,need}=m.tally;
      const rows=Object.keys(tally).map(k=>({n:tagName(G.agents[k]),c:tally[k]})).sort((a,b)=>b.c-a.c);
      let h='<div class="tl-h">投票结果（过程不可见）</div>';
      for(const r of rows) h+='<div class="tl"><span>'+r.n+'</span><b>'+r.c+' 票</b></div>';
      h+='<div class="tl"><span>弃权</span><b>'+abstain+' 票</b></div>';
      h+='<div class="tl-note">'+(devSaved
          ?('票数指向你 —— DEV 无敌：驱逐无效（'+max+' 票）')
          :(ex
            ?('驱逐 '+(exName||ex.name)+' —— '+max+' 票，唯一最高票且达到 '+need+' 票门槛'
              +'<br><span class="ex-role '+(ex.alien?'ali':'hum')+'">身份：'+(exRole||(ex.alien?'内鬼':'人类'))+'</span>')
            :(max<need?('最高票 '+max+' 票，未达 '+need+' 票门槛 ⇒ 无人出局')
                    :('最高票 '+max+' 票但有平票 ⇒ 无人出局'))))+'</div>';
      box.innerHTML=h;
      document.getElementById('m-who').innerHTML='';
    }
    function finishMeeting(){ const G=getG(), SND=getSND(), DEAD=getDead(), SIM_RUN=getSimRun(), TEST_RUN=getTestRun(), SIM_NO_DISCUSS=getSimNoDiscuss(), GAME_MODE=getGameMode();
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
    /* 终结者时刻 · 全场身份明牌（2026-11-20 用户裁定）
       = 给每个活人写一份"公开确证"：异形进 mind.known、人类进 mind.knownHuman。
       同时把明牌前的怀疑账清零（sus / why / cred / credWhy / redSeen / almost /
       suspect / accuse）。情绪账（mind.trust / mind.grudge）保留 —— 用户裁定
       "清怀疑、保留情绪"，但四类动作另有 knownHuman 硬闸门，情绪不能推动打队友。 */
    function revealAllIdentities(){ const G=getG(), SND=getSND(), DEAD=getDead(), SIM_RUN=getSimRun(), TEST_RUN=getTestRun(), SIM_NO_DISCUSS=getSimNoDiscuss(), GAME_MODE=getGameMode();
      for(const a of G.agents){
        if(!a.alive)continue;
        if(!a.mind)mindReset(a);
        a.mind.known=a.mind.known||{};
        a.mind.knownHuman=a.mind.knownHuman||{};
        a.mind.sus={};a.mind.why={};a.mind.cred={};a.mind.credWhy={};
        a.mind.T={};   /* 一切分数化：明牌 = 先清 T，再按身份写 ±999 */
        a.mind.redSeen={};a.mind.almost={foe:{},friend:{}};
        a.suspect=null;a.accuse=null;a.accuseWhy=null;a._abstain=false;a._retract=null;
        for(const t of G.agents){
          if(t===a)continue;
          const rec={kind:'terminator',room:null,t:evNow(),reason:'身份公开',public:true};
          if(a.alien){
            if(t.alien){a.mates=a.mates||{};a.mates[t.i]=a.mates[t.i]||{t:evNow()};}
            else if(t.alive){a.mind.knownHuman[t.i]=rec;trustCert(a,t.i,false);}
          }else{
            if(!t.alive)continue;
            if(t.alien){a.mind.known[t.i]=rec;trustCert(a,t.i,true);}
            else {a.mind.knownHuman[t.i]=rec;trustCert(a,t.i,false);}
          }
        }
        for(const t of G.agents)if(t!==a)trustMirror(a,t.i);
      }
    }
    function checkTerminator(){ const G=getG(), SND=getSND(), DEAD=getDead(), SIM_RUN=getSimRun(), TEST_RUN=getTestRun(), SIM_NO_DISCUSS=getSimNoDiscuss(), GAME_MODE=getGameMode();
      if(G.terminator)return false;
      const TC=SKSanity.TERMINATOR;
      if(G.night<TC.night)return false;
      G.terminator=true;
      /* 2026-11-20 用户裁定：终结者时刻全场身份明牌 = **确证效果**，
         以前一切怀疑全部清除（情绪账保留，但四类动作加硬闸门）。
         旧实现只设 revealAll（只影响漂浮名牌与 identityAxis），
         `suspect` / `bestSusTarget` / `bestAlmostTarget` 仍读明牌前的旧账，
         所以人类 AI 会拿旧目击去打已经明牌的人类队友。 */
      G.revealAll=true;
      revealAllIdentities();
      let armed=0;
      for(const a of G.agents){
        if(!a.alive)continue;
        const want=a.alien?(TC.bullets+1):TC.bullets;
        if((a.bullet|0)<want){a.bullet=want;armed++;}
      }
      logEvent('terminator',{night:G.night,armed:armed,reveal:!!G.revealAll});
      if(G.simMode&&G.simStats){
        G.simStats.terminatorGames=(G.simStats.terminatorGames||0)+1;
        G.simStats.terminatorArms=(G.simStats.terminatorArms||0)+armed;
      }
      /* 宣告（2026-11-18 补可见性）：状态切换必须有横幅 + 音效，否则玩家只看到
         名牌突然全亮、背包里多出一发子弹，不知道发生了什么。 */
      if(!G.simMode){
        banner('终结者时刻 · 全场身份公开');
        SND.alarm();
        toast('第 '+G.night+' 夜 · 终结者时刻：身份公开、取消会议、除中央会议室外舱门永久关闭、每夜人类补至 '+TC.bullets+' 发 / 内鬼补至 '+(TC.bullets+1)+' 发子弹');
      }
      return true;
    }
    /* 异形进化（2026-11-22 用户裁定）：经典局(trio)与单人局(classic)均生效
       ① 单人局 2 名异形出局 → 存活异形当晚获得额外 1 刀（一次性）；
       ② 全场只剩 1 名异形 → 该异形获得每晚 2 刀、全图透视与全员资源配置透视。 */
    function lastAlienEvo(a){ const G=getG(), SND=getSND(), DEAD=getDead(), SIM_RUN=getSimRun(), TEST_RUN=getTestRun(), SIM_NO_DISCUSS=getSimNoDiscuss(), GAME_MODE=getGameMode();
      if(!G||!a||!a.alien||!a.alive)return false;
      return G.agents.filter(x=>x.alien&&x.alive).length===1;
    }
    function checkAlienEvolution(onNightStart){ const G=getG(), SND=getSND(), DEAD=getDead(), SIM_RUN=getSimRun(), TEST_RUN=getTestRun(), SIM_NO_DISCUSS=getSimNoDiscuss(), GAME_MODE=getGameMode();
      if(!G)return;
      const aliveAliens=G.agents.filter(a=>a.alien&&a.alive);
      if(!aliveAliens.length)return;
      const deadAliens=G.agents.filter(a=>a.alien&&!a.alive).length;
      if(GAME_MODE==='classic'&&deadAliens>=2&&!G._evo2Done){
        G._evo2Done=true;
        for(const a of aliveAliens)a.knife=(a.knife||0)+1;
        logEvent('alien_evo',{stage:2,alive:aliveAliens.length,night:G.night});
        if(!G.simMode){
          banner('异形进化 · 存活异形本晚 +1 刀',3.2);
          SND.alarm();
          toast('内鬼进化：已有 2 名内鬼出局，存活内鬼本晚获得额外 1 刀');
        }
      }
      if(aliveAliens.length===1){
        const last=aliveAliens[0];
        const first=!G._evo1Done;
        G._evo1Done=true;
        if(onNightStart){
          last.knife=Math.max(last.knife||0,2);
        }else if(first){
          last.knife=2;
        }
        if(first){
          logEvent('alien_evo',{stage:1,alive:1,night:G.night});
          if(!G.simMode){
            banner('异形终极进化 · 每晚 2 刀 + 全图透视',3.6);
            SND.alarm();
            toast('内鬼终极进化：仅剩 1 名内鬼，获得每晚 2 刀与全图透视！');
          }
        }
      }
    }
    function startNight(inc){ const G=getG(), SND=getSND(), DEAD=getDead(), SIM_RUN=getSimRun(), TEST_RUN=getTestRun(), SIM_NO_DISCUSS=getSimNoDiscuss(), GAME_MODE=getGameMode();
      G._overtime=false;
      if(inc!==false) G.night++;
      logEvent('night_start',{night:G.night});
      const wasTerm=!!G.terminator;
      checkTerminator();
      /* 2026-11-22 用户裁定：进入终结者时刻后，每晚人类补至 1 发、异形补至 2 发子弹（移除护盾） */
      if(wasTerm&&G.terminator){
        const TC=SKSanity.TERMINATOR;
        for(const a of G.agents){
          if(!a.alive)continue;
          const want=a.alien?(TC.bullets+1):TC.bullets;
          if((a.bullet|0)<want)a.bullet=want;
        }
      }
      /* 预告（2026-11-18 补可达性）：终结者时刻是硬转折，不预告就是突然死亡。
         提前一夜给一次大横幅，让玩家知道"这一夜要收束了"。 */
      if(!G.simMode&&!G.terminator&&G.night===SKSanity.TERMINATOR.night-1){
        banner('下一夜 · 终结者时刻',3.6);
        SND.interact();
        toast('下一夜进入终结者时刻：身份全公开、每人补发 '+SKSanity.TERMINATOR.bullets+' 发子弹');
      }
      if(G)releaseAllDrags(true);
      /* 尸体随夜晚清除（2026-11-20 用户裁定）：会议清尸之外再兜一道 ——
         玩家在会议清场之后死亡（天亮结算/公布阶段）时，尸体原本会留到下一夜，
         被 AI 当成"新尸体"拖走。这里与 R2.7 同一口径，所有席位（含玩家）一起清。 */
      for(const a of G.agents) if(!a.alive&&!a.bodyGone) a.bodyGone=true;
      G.t=NIGHT;
      if(G.simMode){G.simT=NIGHT;G.phase=null;}
      else G.phase=SKClock.newPhase('night',performance.now(),NIGHT*1000);
      for(const a of G.agents){
        a.knife=1;a.path=null;a.doing=0;a.target=null;a._tgtPos=null;if(a.alive)a.reported=false;
        a._doing=null;a.sabUsed=false;a.detained=false;a.detainedT=0;
        a._pipeCD=0;a._rv=null;a.sabRoom=null;a._fix=null;a._fixGo=null;a._taskPt=null;a._look=null;
        a._stalkT=0;a._stalkCD=0;a._stalkTarget=null;a._stalkPos=null;   /* 人类 AI 跟踪（2026-11-18） */
      a._plan=null;a._planCD=0;   /* 行为效用表缓存一并重算 */
        /* 每夜重置认知：没有跨夜记忆，也不让上一夜的 suspect 自动带进新夜 */
        mindReset(a);a.suspect=null;a.accuseWhy=null;a._abstain=false;
        a._reportT=0;a._reportBody=null;a._reportGo=null;a._sawBody=null;a._scanT=0;a._reportMemo={};
        /* 拖拽 / 红身 / 藏尸 / 断电响应 / 管道规划：全部按夜清空 */
        a.drag=null;a.draggedBy=null;a.redT=0;a.rushT=0;a.stunT=0;a._dragSnd=0;a._dragAiT=0;
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
      recomputePrior();
      checkAlienEvolution(true);
      if(G.terminator&&G.revealAll)revealAllIdentities();
      G.drag=null;
      G.aiReportUsed=false;G.evSeq=0;G.nightMeets=0;
      G.trackT=0;G.medbotUsed=false;G.medbotT=0;G.medbotCD=0;G.medbotTarget=null;G.medbotLeft=MEDBOT_CHARGES;G.botHp={secbot:2,medbot:1};G.secbotUsed=false;G.secbotUses=0;G.secbotT=0;G.pendingCrime=null;
      G.supplyCD={ammo:0,med:0};
      /* powerFixed 不随夜重置（2026-11-20 用户裁定）：电路维修是**永久修复**，
         修好后引擎与配电室一直算亮房；只有配电室再次被破坏才复位（见 damageRoom）。 */
      G.medbotDead=false;G.secbotDead=false;G.secCatch=null;
      for(const d of (G.doors||[])){d.open=0;d.target=0;d.scanT=0;}
      /* 新的一夜：故障、单舱断电与破坏目标全部清空（上夜没修完的故障与断电不跨夜残留） */
      G.dmg=[];G.roomOut={};G.sabTarget=null;
      /* 破坏落点每夜重抽：同一台设备不能连续几夜都坏在同一个位置 */
      clearSabSpots();
      resetBots();
      /* 拉闸手已取消（2026-11-01）：每夜重新由效用表决定谁去拉闸 */
      G.breakerPulls=0;   /* 拉闸延迟每夜重新从 3 秒起算 */
      G.lightState=0;G.waves=[];G.fx=[];
      closeCams(true);closePipePick(true);closeSabPick(true);
      refreshLight();
      toast('第 '+G.night+' 夜开始');
    }
    

    function clearTimer(){ clearInterval(meetingTick); }

    return {
      clearTimer,
      tryReport,
      say,
      clearNewLines,
      recomputePrior,
      alibiOf,
      victimInfo,
      fillTpl,
      pickLine,
      pushEndorse,
      alibiLine,
      accuseLine,
      decideHumanDefend,
      startChatter,
      playerTalk,
      meetTemplateText,
      sendPlayerSpeech,
      openMeeting,
      targetDistMul,
      hostileWeight,
      alienSocialPick,
      alienFrameTarget,
      voteLean,
      deliverTestimony,
      startVote,
      voteThreshold,
      closeVote,
      finishMeeting,
      checkTerminator,
      lastAlienEvo,
      checkAlienEvolution,
      startNight,
      counterfactualReach
    };
  }

  global.SKMeeting = { MEET_TPL_KINDS, create };
})(typeof window !== 'undefined' ? window : globalThis);
