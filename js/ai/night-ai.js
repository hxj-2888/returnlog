/* ==== ARCH NODE · 架构节点标注（根 ARCHITECTURE.md） ====
 * layer     : T2/AI
 * domain    : AI 夜间决策与动作执行（人类 / 异形 / 幽灵 / 拖拽）
 * definedBy : 夜间寻路 / 搜尸 / 补给 / 藏尸 / 伪装 / 管道 / 出手决策
 * truth     : js/ai/night-ai.js#SKNightAI
 * verify    : npm test
 * flag      : F
 * note      : P5b 从 js/game.js 拆出
 * ============================================================== */
(function (global) {
  'use strict';

  function create(R) {
    const {
      getG, getSND, getShootK,
      inPoly, inCorr, roomAt, free, nearestFree, pathClear, randIn, roomIdAt, doorBlockedSegment, losNow, outBlocksDoing, breakerOnTime, breakerOffTime, moveSpeed, walkTo, stepMove, nearPipe, roundTableClaimSpot, supplyPoints, nearSupply, supplyCoolLeft, supplyTargetFor, hear, sabRoomOk, sabSpot, damageRoom, startFix, logEvent, credAdd, topCred, obeyTrustMul, warmMate, credBroadcast, attention, observerVisionAt, agentAimAng, aiCanSee, aiHear, noticeTaskAbandon, noticeAction, witnessAlienAction, isMate, humanishOf, aiWantsLoot, observeBody, setAct, knifeLockLeft, knife, finishDoing, secbotWouldSee, botPos, openMeeting, targetDistMul, lastAlienEvo, startTask, inKnifeArc, fireShot, knifeBot, secbotRaidOk, fireShotBot, toast, litZoneAt, topSus, bodyReported, markBodyReported, nightMeetLeft, ghostTaskAllowed, GHOST_TASK_CAP, botDead, evNow, mindReset, evPush, bestSusTarget, almostFoeOf, almostFriendOf, bestAlmostTarget, bestKnownTarget, affordableAlmostShot, audSusEstimate, publicHeat, publicInfluence, identityAxis, hostileProb, beliefOf, susAdd, bodyPos, bodyHasLoot, NIGHT, DOOR_SCAN_TIME, FIX_TIME, SUPPLY_AMMO_TIME, SUPPLY_MED_TIME, SUPPLY_QUAL_TIME, BREAKER_USE_R, EV_W, SGT, HUMAN_LIGHT_R, HUMAN_DARK_R, M, SKSanity, SKTrait, SKT2Space
    } = R;
    function aiIdleRoam(a,dt){ const G=getG(), SND=getSND(), SHOOT_K=getShootK();
      if(!a)return;
      /* 2026-11-19 裁定：走路不留人为停顿，游荡到点即重抽（原 A12 站 4~9 秒已删） */
      if(!a.path||!a.path.length){
        let tg=null;
        if(!a.ghost&&(a.qualPending||0)>0&&(a.qual||0)<2){
          const q=roundTableClaimSpot();
          if(q&&Math.hypot(q.x-a.x,q.y-a.y)>1.8)tg=[q.x,q.y];
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
          if(mate&&Math.hypot(mate.x-a.x,mate.y-a.y)>2.2&&Math.random()<SKSanity.WARM.followChance){
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
          /* A12：空闲目标只在本舱（七成）或邻舱里挑，锚点已内缩离墙。
             终结者时刻除中央会议室外舱门永久关闭，留在当前所在舱或中央会议室，不撞锁死门。 */
          const curR=roomAt(a.x,a.y);
          const r=G.terminator?(curR||M.rooms.find(q=>q.id==='bridge')||M.rooms[0]):SKT2Space.idleRoom(curR);
          tg=SKT2Space.idleSpot(r);
        }
        const c0=a._pathCD||0;
        walkTo(a,tg[0],tg[1]);
        /* 停顿治理（2026-11-19）：锚点走不到就同帧换一个，不站着等 1.2 秒寻路冷却 */
        if(!a.path&&(a._pathCD||0)>c0){
          const q=SKT2Space.idleSpot(SKT2Space.idleRoom(roomAt(a.x,a.y)));
          a._pathCD=0; walkTo(a,q[0],q[1]);
        }
      }
      if(a.path&&a.path.length)stepMove(a,dt,moveSpeed(a));
      else a.moving=false;
    }
    /* 人类 AI 幽灵（2026-11-01 改）：**不再修故障**，全力做剩余任务；
       任务进度严格受 ghostPts 额度限制（每只幽灵最多 GHOST_TASK_CAP 分），额度耗尽进入游荡。 */
    function aiGhost(a,dt){ const G=getG(), SND=getSND(), SHOOT_K=getShootK();
      /* 2026-11-07 用户裁定：解除「异形幽灵不做事」的硬编码。
         异形幽灵获得一次**正统破坏技能**：全局仅限发动一次，必定发动（除非游戏结束）。
         破坏走 damageRoom 的 ghost 模式 —— 故障是真实的（G.dmg / 警报 / 声音 /
         统计都照常），但幽灵不可被活人看见，所以不写目击证据。
         发动之后不再原地待机，而是和人类幽灵一样在船里游荡。 */
      if(a.alien){
        if(!G.over&&!G.meet&&!G.alienGhostSabUsed){
          const rooms=M.rooms.filter(r=>r.id!=='bridge'&&sabRoomOk(r.id));
          if(rooms.length){
            const r=rooms[Math.floor(Math.random()*rooms.length)];
            if(damageRoom(a,r.id,null,true)){
              G.alienGhostSabUsed=true;
              if(G.simStats)G.simStats.ghostSabotages=(G.simStats.ghostSabotages||0)+1;
            }
          }
        }
        /* 解除硬编码：破坏之后继续游荡，不再 a.moving=false;return */
        if(a._pathCD>0)a._pathCD-=dt;
        if(!a.path||!a.path.length){
          const r=M.rooms[Math.floor(Math.random()*M.rooms.length)];
          const p=randIn(r); a.path=[[p[0],p[1]]];
        }
        if(a.path)stepMove(a,dt,2.4);
        return;
      }
      if(a._pathCD>0)a._pathCD-=dt;
      if(a.doing>0){if(outBlocksDoing(a))return;a.doing-=dt;if(a.doing<=0)finishDoing(a);return;}
      if((a.ghostPts||0)<GHOST_TASK_CAP&&a.tIdx<a.tasks.length){
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
    function draggerOf(victim){ const G=getG(), SND=getSND(), SHOOT_K=getShootK();
      if(!victim)return null;
      for(const a of G.agents) if(a.drag!=null&&a.drag===victim.i)return a;
      return null;
    }
    function syncDragOf(a){ const G=getG(), SND=getSND(), SHOOT_K=getShootK();
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
    function startDrag(a,v,silent){ const G=getG(), SND=getSND(), SHOOT_K=getShootK();
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
      a._reportT=0; a._reportBody=null; a._reportGo=null; a._sawBody=null;
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
      }
      /* R20.4：被拖者也有视野 —— 他看得见是谁在拖自己。
         只对**还活着的濒死者**记（真尸体没有认知），玩家自己拖/被拖跳过。
         这条必须写在 noticeAction 之外：那圈循环用 `w.downed` 把被拖者
         直接排除了，正是"被拖走就失忆"的根因。 */
      if(v.alive&&v!==G.me&&!v.alien){
        if(observerVisionAt(v.x,v.y,v.alien,agentAimAng(v),a.x,a.y)){
          if(!v.mind)mindReset(v);
          const evD={kind:'saw_drag',x:+a.x.toFixed(1),y:+a.y.toFixed(1),
            room:roomIdAt(a.x,a.y),subj:a.i,victim:v.i,conf:1,src:'sight'};
          evPush(v,evD);
          credAdd(v,a.i,(SKSanity.WITNESS&&SKSanity.WITNESS.dragToMed!=null)?SKSanity.WITNESS.dragToMed:EV_W.saw_drag,'dragToMed');
        }
      }
      /* R20.5：尸体被拖走的那一刻，所有正在搜它 / 正在救它的人都要中断 ——
         不许出现"人已经把尸体拖出半张图，另一个人还在原地读条"。
         施救同一条（2026-11-20 用户裁定）：**被拖拽期间救不活**，两侧一致。 */
      for(const x of G.agents){
        const sv=x._doing==='search'&&x._sv===v.i, rv=x._doing==='revive'&&x._rv===v;
        if(sv||rv){
          x.doing=0;x._dur=0;x._doing=null;x._sv=null;x._rv=null;
          if(x===G.me)toast(sv?'尸体被拖走了，搜查中断':'伤者被拖走了，施救中断');
        }
      }
      return true;
    }
    function releaseDragBy(a,silent){ const G=getG(), SND=getSND(), SHOOT_K=getShootK();
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
    function releaseDrag(silent){ const G=getG(), SND=getSND(), SHOOT_K=getShootK(); return releaseDragBy(G.me,silent); }
    function releaseAllDrags(silent){ const G=getG(), SND=getSND(), SHOOT_K=getShootK();
      for(const a of G.agents) if(a.drag!=null)releaseDragBy(a,silent);
      G.drag=null;
      const tag=document.getElementById('dragtag'); if(tag)tag.classList.add('hide');
    }
    /* 拖拽声：玩家听感与 AI 听觉分开；每 1.6 秒给 AI 记一次声纹，避免刷屏 */
    function dragSound(a,dt){ const G=getG(), SND=getSND(), SHOOT_K=getShootK();
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
    function aiScanBodies(a,dt){ const G=getG(), SND=getSND(), SHOOT_K=getShootK();
      if(!a.alive||a.downed||a.detained||G.over)return;
      /* 正在拖尸 / 正按计划"绕一圈再回来报告"时，不让扫描抢先拉铃 */
      if(a.drag!=null||a._reportPlan)return;
      if(!a.mind)mindReset(a);
      if(a._reportT>0){
        a._reportT-=dt;
        if(a._reportT<=0){
          const v=a._reportBody;
          /* 犹豫结束 = 决定要报。**距离判定与拉铃都交给 aiReportApproach**（同一条代码），
             这里不再自己 openMeeting —— 否则"扫描放行 5.8 格、拉铃在另一处"两套口径会再度分叉。 */
          if(v&&bodyPos(v)&&!G.meet&&!G.over&&!bodyReported(v))a._reportGo=v.i;
          else{a._reportBody=null;a._reportGo=null;}
        }
        return;
      }
      a._scanT=(a._scanT||0)+dt;
      if(a._scanT<0.5)return;
      a._scanT=0;
      let best=null,bd=5.4;
      for(const v of G.agents){
        if(v===a)continue;
        /* 已知濒死队友不作为敌人尸体藏匿，交给 alienMateRevive 拉去救 */
        if(v.alive&&v.downed&&isMate(a,v.i))continue;
        const bp=bodyPos(v); if(!bp)continue;
        /* 同一夜每具尸体只能报告一次（2026-11-01 修 bug）：旧代码只拦濒死者，
           真正的死者不拦 —— AI 会反复对同一具尸体拉铃。 */
        if(bodyReported(v))continue;
        if(a._reportSkip&&a._reportSkip[v.i]>evNow())continue;
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
        a.doing=SKSanity.LOOT.aiSearchTime;a._dur=SKSanity.LOOT.aiSearchTime;a._doing='search';a._sv=best.i;
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
    function alienReportWorth(a,v){ const G=getG(), SND=getSND(), SHOOT_K=getShootK();
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
    /* 贴到报告距离内再拉铃：AI 的"走过去 + 按 R"是同一条代码（2026-11-18）。
       玩家必须走到 MEET.reportR(2.4) 格内按 R（R10.1），旧实现却允许 AI 在 5.8 格外
       隔空拉铃 —— 两边玩的不是同一个游戏。这里补上这一步，并且**不够近就走过去**，
       而不是取消报告，否则等于用"公平"的名义偷偷削弱 AI。
       ⚠ 迈步必须放在这里、不能放进 aiScanBodies：扫描跑在 aiHuman/aiAlien **之后**，
       在扫描里 stepMove 就成了一帧走两次（同 2026-11-03「冷却被减两遍」那次教训）。
       ⚠ 主循环只调一次，所以迈完这一步要**立刻再量一次距离**并当场拉铃 ——
       否则"这一帧走到、下一帧才报"会让只跑单步的夹具与慢帧对局都漏掉拉铃。 */
    function aiReportApproach(a,dt){ const G=getG(), SND=getSND(), SHOOT_K=getShootK();
      /* 返回值 = 这一帧是否已被"报告赶路"接管（迈过步或拉过铃）。
         主循环据此跳过 aiHuman/aiAlien，避免两边各自 stepMove 造成一帧走两次
         （2026-11-18 超高速移动修复）。返回 false 时常规 AI 照常跑。 */
      if(a._reportGo==null)return false;
      const v=G.agents[a._reportGo],bp=v?bodyPos(v):null;
      const clear=()=>{a._reportGo=null;a._reportStall=0;
        if(a._reportBody===v)a._reportBody=null;};
      if(!v||!bp){clear();return false;}
      if(bodyReported(v)||G.meet||G.over){clear();return false;}
      if(a.doing>0||a.drag!=null)return false;  /* 站桩 / 拖尸中不抢，交给常规 AI */
      /* 赶路期间常规 AI 被跳过，_pathCD 的递减也一并被跳过 —— 不在这里补上，
         一次 A* 失败就会把冷却永久钉在 1.2，AI 再也算不出路径（2026-11-18 修）。 */
      if(a._pathCD>0)a._pathCD-=dt;
      const near=()=>Math.hypot(bp[0]-a.x,bp[1]-a.y)<=SKSanity.MEET.reportR&&
        losNow(a.x,a.y,bp[0],bp[1]);
      if(!near()){
        const ox=a.x,oy=a.y;
        if(!a.path||!a.path.length)walkTo(a,bp[0],bp[1]);
        stepMove(a,dt,moveSpeed(a));
        if(!near()){
          /* 这一帧一步都没挪动 ⇒ 目标不可达 / 被门挡住。累计 1 秒就放弃这次报告，
             把控制权交还常规 AI；否则"赶路独占"会变成永久卡死（AI 站在原地发呆）。 */
          if(Math.hypot(a.x-ox,a.y-oy)<0.001){
            a._reportStall=(a._reportStall||0)+dt;
            if(a._reportStall>DOOR_SCAN_TIME+1.0){
              (a._reportSkip=a._reportSkip||{})[v.i]=evNow()+8;
              clear();return false;
            }
          }else a._reportStall=0;
          return true;                        /* 还在赶路：独占这一帧的移动 */
        }
      }
      clear();
      /* 额度/场次不够就放弃这次拉铃（报告机会已由 canReportBody 先筛过一遍） */
      if((a.reportLeft|0)<=0||!nightMeetLeft())return true;
      a.reportLeft--;a.reportsUsed=(a.reportsUsed||0)+1;
      markBodyReported(v);G.aiReportUsed=true;
      if(G.simMode&&G.simStats)G.simStats.reportsUsed=(G.simStats.reportsUsed||0)+1;
      openMeeting('night',a,v);
      return true;
    }
    function canReportBody(a,v){ const G=getG(), SND=getSND(), SHOOT_K=getShootK();
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
    function nearestDowned(a,maxD){ const G=getG(), SND=getSND(), SHOOT_K=getShootK();
      let best=null,bd=maxD;
      for(const v of G.agents){
        if(v===a||!v.alive||!v.downed)continue;
        const d=Math.hypot(v.x-a.x,v.y-a.y);
        if(d<bd&&aiCanSee(a,v.x,v.y,maxD)){bd=d;best=v;}
      }
      return best;
    }
    /* 谁会去翻尸体/伤者：人类需要证据/物资，异形需要子弹/医疗包/申请单；活着且没倒下的不搜。 */
    function nearestLootBody(a,maxD,any){ const G=getG(), SND=getSND(), SHOOT_K=getShootK();
      let best=null,bd=maxD;
      for(const v of G.agents){
        if(v===a)continue;
        const bp=bodyPos(v); if(!bp||(v.alive&&!v.downed))continue;
        if(a.alien&&isMate(a,v.i))continue;
        if(v.draggedBy!=null||!bodyHasLoot(v)||(!any&&!aiWantsLoot(a,v)))continue;
        const d=Math.hypot(bp[0]-a.x,bp[1]-a.y);
        if(d<bd&&aiCanSee(a,bp[0],bp[1],maxD)){bd=d;best=v;}
      }
      return best;
    }
    function startLootSearch(a,v,dt,any){ const G=getG(), SND=getSND(), SHOOT_K=getShootK();
      if(!a||!v||!bodyHasLoot(v)||(!any&&!aiWantsLoot(a,v)))return false;
      if(a.alien&&isMate(a,v.i))return false;
      if(v.draggedBy!=null)return false;
      const bp=bodyPos(v); if(!bp)return false;
      if(G.agents.some(x=>x!==a&&x._doing==='search'&&x._sv===v.i))return false;
      if(a.alien&&G.simMode&&G.simStats)G.simStats.alienLootTries++;
      if(a._lootMem)delete a._lootMem[v.i];
      const d=Math.hypot(bp[0]-a.x,bp[1]-a.y);
      if(d<2.2){
        a.path=null;a.moving=false;
        a.doing=SKSanity.LOOT.aiSearchTime;a._dur=SKSanity.LOOT.aiSearchTime;a._doing='search';a._sv=v.i;
        return true;
      }
      if(!a.path||!a.path.length)walkTo(a,bp[0],bp[1]);
      if(!a.path||!a.path.length){
        if(a._lootMem)delete a._lootMem[v.i];
        return false;
      }
      stepMove(a,dt,moveSpeed(a));return true;
    }
    function lootRun(a,dt){ const G=getG(), SND=getSND(), SHOOT_K=getShootK();
      if(!a||a.doing>0||a.drag!=null||a._fixGo||a._lightGo)return false;
      const need=(a.bullet|0)<1||(a.medkit|0)<1||(a.qual|0)<2;
      if(!need){
        if(a.alien)return false;
        if((a._lootRollCD||0)>0){a._lootRollCD-=dt;return false;}
        a._lootRollCD=SKSanity.LOOT.aiSearchCD;if(Math.random()>=SKSanity.LOOT.aiSearchChance)return false;
      }
      const v=nearestLootBody(a,12,!need);
      if(v&&startLootSearch(a,v,dt,!need))return true;
      if(!need)return false;
      /* 视野里没有时，回到 30 秒内见过、仍然带自己缺的物资的目标（看到伤者 → 之后绕回收尸）。 */
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
    function medbotUsable(){ const G=getG(), SND=getSND(), SHOOT_K=getShootK();
      return !!(G&&!G.medbotDead&&(G.medbotLeft==null?MEDBOT_CHARGES:G.medbotLeft)>0);
    }
    function inMedRoom(x,y){ const G=getG(), SND=getSND(), SHOOT_K=getShootK();const r=roomAt(x,y);return !!(r&&r.id==='med');}
    /* 拖拽目标点：无人机固定在医疗间正中央悬停，把人丢进医疗间任意位置它都会飞过来，
       所以目标点就是房间中心，不再追着巡逻中的机器人跑。 */
    function medDropSpot(){ const G=getG(), SND=getSND(), SHOOT_K=getShootK();
      const b=medbotUsable()?botPos('medbot'):null;
      if(b&&inMedRoom(b.x,b.y))return nearestFree(b.x,b.y);
      if(!MED_DROP){const mr=M.rooms.find(r=>r.id==='med');MED_DROP=nearestFree(mr.rect[0]+mr.rect[2]/2,mr.rect[1]+mr.rect[3]/2);}
      return MED_DROP;
    }
    /* 只要在医疗间里就算到位：无人机会自己飞过来，不再要求贴近机器人 */
    function nearMedBot(v,rad){ const G=getG(), SND=getSND(), SHOOT_K=getShootK();
      if(!v)return false;
      if(inMedRoom(v.x,v.y))return true;
      const b=botPos('medbot');
      return !!(b&&Math.hypot(v.x-b.x,v.y-b.y)<(rad||4.5));
    }
    /* 故障被别人修好后，正在站桩/赶路的人立即放弃，不浪费剩下的时间 */
    function dropStaleFix(a){ const G=getG(), SND=getSND(), SHOOT_K=getShootK();
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
    function taskThreat(a,remain){ const G=getG(), SND=getSND(), SHOOT_K=getShootK();
      if(!a||a.alien||!a.alive||a.downed)return null;
      const kn=bestKnownTarget(a);
      if(!kn)return null;
      const t=G.agents[kn.i];
      if(!t||!t.alive||t.downed||t===a)return null;
      const d=Math.hypot(t.x-a.x,t.y-a.y);
      /* 2026-11-18：删掉 `d>7` 这条固定格数 —— "追我的人我察觉得到吗"走 R5.3 同一条
         视野判据：亮舱整间可见时 20 格外逼近也看得见，暗处背对他时 6 格外也察觉不到。
         下面的 `d>3.5` 保留：那是"他没在动但已经贴到跟前"的近身预警，属位移取舍不是感知。 */
      if(!aiCanSee(a,t.x,t.y))return null;
      const closing=!!(t.moving||(t.path&&t.path.length));
      if(!closing&&d>3.5)return null;
      const travel=d/Math.max(1,moveSpeed(t));
      /* 弃修阈值随性格：激进的人剩下 1 秒也要修完，谨慎的人早早就跑（2026-10-31） */
      return (remain==null?2.5:remain)>(travel-0.6)*SKTrait.C.fleeThreshold(a)?t:null;
    }
    function fleeTask(a,t){ const G=getG(), SND=getSND(), SHOOT_K=getShootK();
      const wasDoing=a._doing;
      if(wasDoing==='task'||wasDoing==='fake'||wasDoing==='fix')noticeTaskAbandon(a,wasDoing);
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
      if(a===G.me&&!G.spectMode)toast('内鬼正在靠近，放弃维修');
    }
    /* 出刀前的硬线：目击者数 / 隐蔽度 / 开夜锁 / 性格冒险率。
       aiAlien 的正面追击与 turnBack 的回头刀**共用这一份**（R14：同一条只定义一次）。 */
    /* 出刀预判（2026-11-21 用户裁定）：预测每个潜在目击者沿当前朝向移动
       discoverHorizon(1.5s) 后能否看见出刀点/出刀者。
       风险 = 1−Π(1−可见权重)（任一非队友可见 → 1）；目击者全队友 → share=1。
       blocked = risk × (1 − mateShare) > 0 —— 纯函数，无 if 分支：
       「1.5 秒内不会被发现」或「目击者确定是自己队友」才出刀。 */
    function knifeDiscoveryRisk(a,tgt){ const G=getG(), SND=getSND(), SHOOT_K=getShootK();
      const K=SKSanity.KNIFE,H=K.discoverHorizon;
      let invis=1,vis=0,mateVis=0;
      const F={right:[1,0],left:[-1,0],down:[0,1],up:[0,-1]};
      for(const w of G.agents){
        /* 目标本人不算"目击者"（他当然看得见自己被刀）；发现指的是第三方 */
        if(w===a||w===tgt||!w.alive||w.downed||w.detained)continue;
        const f=F[w.dir]||[1,0],sp=moveSpeed(w);
        const px=w.x+f[0]*sp*H,py=w.y+f[1]*sp*H;
        const R=Math.max(6,sightRangeAt(px,py));
        const see=aiCanSee(w,tgt.x,tgt.y,R)||aiCanSee(w,a.x,a.y,R);
        if(!see)continue;
        const d=Math.hypot(px-tgt.x,py-tgt.y);
        const wt=Math.max(0.3,Math.min(1,1.4-d/12));   /* 距离衰减：贴脸 1 → 12 格外 0.3 */
        if(isMate(a,w.i))mateVis+=wt; else vis+=wt;
      }
      invis=Math.max(0,1-vis);              /* 全员看不见 → 1 */
      const share=(vis+mateVis)>0?mateVis/(vis+mateVis):1;
      return {risk:1-invis,share:share};
    }
    function knifeWouldHitMate(a,tgt){ const G=getG(), SND=getSND(), SHOOT_K=getShootK();
      if(!a||!a.alien||!tgt)return false;
      const ang=Math.atan2(tgt.y-a.y,tgt.x-a.x);
      for(const m of G.agents){
        if(m===a||m===tgt||!m.alive||m.downed)continue;
        if(isMate(a,m.i)&&inKnifeArc(a,m.x,m.y,SKSanity.REACH.knife,ang))return true;
      }
      return false;
    }
    function knifeBlocked(a,tgt){ const G=getG(), SND=getSND(), SHOOT_K=getShootK();
      if(knifeLockLeft()>0)return true;
      if(knifeWouldHitMate(a,tgt))return true;
      const K=SKSanity.KNIFE;
      const r=knifeDiscoveryRisk(a,tgt);
      /* 安全 = 无目击风险 或 目击者全队友；乘积式无分支：
         blocked ⇔ risk × (1 − mateShare) > 0 */
      return r.risk*(1-r.share)>1e-6;
    }

    /* 突然回头：异形回头刀/枪、人类回头枪。给进攻第二种形状，也让带枪者能突然转身。
       只读朝向/距离/手持，不读心；冷却按人记；数值在 SKSanity.TURN。 */
    function turnBack(a,dt){ const G=getG(), SND=getSND(), SHOOT_K=getShootK();
      if(G.meet||G.over||a.doing>0||a.drag!=null||!a.moving)return false;
      if((a.stunT||0)>0)return false;   /* 被医疗无人机拉起的僵直期不能回头出手 */
      if((a._tbCD||0)>0){a._tbCD-=dt;return false;}
      const T=SKSanity.TURN;
      const F={right:[1,0],left:[-1,0],down:[0,1],up:[0,-1]}[a.dir]||[1,0];
      let v=null,best=T.reach;
      for(const h of G.agents){
        if(h===a||!h.alive||h.downed||h.detained)continue;
        const dx=h.x-a.x,dy=h.y-a.y,d=Math.hypot(dx,dy);
        if(d<0.35||d>best)continue;
        if((dx*F[0]+dy*F[1])/d>T.dot)continue;      /* 只认身后 */
        if(!losNow(a.x,a.y,h.x,h.y))continue;   /* R8.1/R8.3：回头也要 LOS，不隔墙感知 */
        best=d;v=h;
      }
      if(!v)return false;
      const face=function(){
        a.dir=Math.abs(v.x-a.x)>Math.abs(v.y-a.y)?(v.x>a.x?'right':'left'):(v.y>a.y?'down':'up');
      };
      if(a.alien){
        if(isMate(a,v.i))return false;
        /* 保安扇形正对时宁可废刀也不进拘留区（与 aiAlien 同一条判据） */
        if(secbotWouldSee(a.x,a.y))return false;
        if(a.knife>0&&best<=SKTrait.C.knifeReach(a)&&Math.random()<T.rate*dt&&!knifeBlocked(a,v)){
          face();knife(a,v);a._tbCD=T.cd;
          if(G.simMode&&G.simStats)G.simStats.turnKnife=(G.simStats.turnKnife||0)+1;
          return true;
        }
      }
      if(a.bullet>0&&best<=SKSanity.SHOT.range&&Math.random()<T.rate*dt){
        /* 人类只打"已经怀疑到敢开枪"的人；异形打任何非队友 */
        const kn=bestKnownTarget(a);
        const ok=a.alien?true:(a.suspect===v.i||(kn&&kn.i===v.i)||
          (beliefOf(a,v.i)>=SKTrait.C.shootSus(a)*SHOOT_K));
        if(ok){
          face();fireShot(a,v);a._tbCD=T.cd;
          if(G.simMode&&G.simStats)G.simStats.turnShot=(G.simStats.turnShot||0)+1;
          return true;
        }
      }
      return false;
    }
    /* 2026-11-21 用户裁定：人类 AI 也会跟踪 —— 尤其是**带子弹**的人。
       对自己不信任的人（belief 高但没到确证）保持 4~8 格尾随，像异形那样穷追不舍。
       不改任何分值：跟踪只产生一个可见事实（对方会感到"被跟着"→ E 恐慌），
       双方都能做，所以"追人"不再是阵营特征。 */
    function stalkRun(a,dt){ const G=getG(), SND=getSND(), SHOOT_K=getShootK();
      if(!a||a.alien||!a.alive||a.downed||a.detained)return false;
      if(a._hStalkLeft>0){
        const t=G.agents[a._hStalk];
        if(!t||!t.alive||t.downed||t.detained){a._hStalkLeft=0;return false;}
        a._hStalkLeft-=dt;
        const d=Math.hypot(t.x-a.x,t.y-a.y);
        if(d>8){
          if(!a.path||!a.path.length)walkTo(a,t.x,t.y);
          stepMove(a,dt,moveSpeed(a));return true;
        }
        if(d<4){
          const ang=Math.atan2(a.y-t.y,a.x-t.x)||Math.random()*6.283;
          const bx=t.x+Math.cos(ang)*5,by=t.y+Math.sin(ang)*5;
          if(!a.path||!a.path.length)walkTo(a,bx,by);
          stepMove(a,dt,moveSpeed(a));return true;
        }
        /* 保持在 4~8 格内随行，不原地木桩站定 */
        if(!a.path||!a.path.length){
          const ang=Math.atan2(a.y-t.y,a.x-t.x)+(Math.random()-0.5)*1.2;
          const bx=t.x+Math.cos(ang)*5.5,by=t.y+Math.sin(ang)*5.5;
          if(free(bx,by))walkTo(a,bx,by);
        }
        if(a.path&&a.path.length)stepMove(a,dt,moveSpeed(a));
        return true;
      }
      if(a._hStalkCD>0)a._hStalkCD-=dt;
      if(a._hStalkCD>0)return false;
      /* 2026-11-21 用户裁定：人类也会穷追不舍 —— **带子弹的人更激进**
         （有底气盯人/找机会开枪），没子弹的也会低概率起意。 */
      const armed=a.bullet>0;
      if(Math.random()>dt*(armed?0.15:0.05))return false;
      const st=bestSusTarget(a,armed?0.42:0.55);
      if(!st||st.i==null)return false;
      a._hStalk=st.i;a._hStalkLeft=(armed?10:6)+Math.random()*4;a._hStalkCD=armed?40:60;
      if(G.simStats)G.simStats.humanStalks=(G.simStats.humanStalks||0)+1;
      return false;
    }
    /* AI 走位躲避枪击范围（不透视子弹资源：只读终结者明牌 / 敌对度 / 目击开枪或拿弹药记忆 + 对方朝向） */
    function gunThreatFrom(a){ const G=getG(), SND=getSND(), SHOOT_K=getShootK();
      if(!G||!a||!a.alive||a.downed||a.detained||a.drag!=null)return null;
      const maxR=(SKSanity.SHOT.range||8)+1.5;
      const mem=(a.mind&&a.mind.mem)||[];
      let best=null, bd=1e9;
      for(const o of G.agents){
        if(!o||o===a||!o.alive||o.downed||o.detained)continue;
        if(a.alien&&isMate(a,o.i))continue;
        const d=Math.hypot(o.x-a.x,o.y-a.y);
        if(d>maxR||d<1.2||!losNow(o.x,o.y,a.x,a.y))continue;
        if(!G.terminator&&!lastAlienEvo(a)&&!aiCanSee(a,o.x,o.y))continue;
        let armedCue=false;
        if(lastAlienEvo(a)){
          if((o.bullet|0)<1)continue;
          armedCue=true;
        }else if(G.terminator){
          armedCue=(a.alien!==o.alien);
        }else if(o.act&&o.act.kind==='shoot'){
          armedCue=true;
        }else{
          const hp=hostileProb(a,o);
          if(a.alien){
            if(hp>=0.58)armedCue=true;
          }else{
            /* 人类 AI 躲枪判据（不透视真值）：已确证 / 准-确证 / 当前锁定嫌疑人 / 敌对度或怀疑过线 / 被对方贴身尾随 */
            const kn=a.mind&&a.mind.known&&a.mind.known[o.i];
            const flw=a.mind&&a.mind._follow&&a.mind._follow[o.i]&&a.mind._follow[o.i].acc>=1.2;
            if(kn||almostFoeOf(a,o.i)||a.suspect===o.i||beliefOf(a,o.i)>=0.30||hp>=0.45||flw)armedCue=true;
          }
          if(!armedCue){
            for(let k=mem.length-1;k>=0;k--){
              const e=mem[k];
              if(e&&e.subj===o.i&&e.night===G.night&&(e.kind==='saw_shot'||e.kind==='saw_loot'||e.kind==='loot_bullet')){
                armedCue=true;break;
              }
            }
            const whyO=(a.mind&&a.mind.why&&a.mind.why[o.i])||[];
            if(!armedCue&&whyO.some(e=>e&&e.night===G.night&&(e.kind==='loot_bullet'||e.kind==='saw_shot')))armedCue=true;
          }
        }
        if(!armedCue)continue;
        /* 对方朝向大致指向我（±40° 内触发，闪避保持期内放宽到 ±60° 防边界逐帧横跳）才躲避 */
        const angToMe=Math.atan2(a.y-o.y,a.x-o.x);
        const oAim=(o===G.me&&!G.spectMode&&G.aimX!=null&&G.aimY!=null)
          ?Math.atan2(G.aimY-o.y,G.aimX-o.x):agentAimAng(o);
        let dd=Math.abs(angToMe-oAim); if(dd>Math.PI)dd=2*Math.PI-dd;
        if(dd>Math.PI*((a._dodgeT||0)>0?0.34:0.22))continue;
        if(d<bd){bd=d;best=o;}
      }
      return best;
    }
    function gunDodgeStep(a,dt){ const G=getG(), SND=getSND(), SHOOT_K=getShootK();
      if((a._dodgeCD||0)>0)a._dodgeCD=Math.max(0,a._dodgeCD-dt);
      const sp=moveSpeed(a), step=sp*dt;
      /* 若正处于 0.35s 侧向闪避保持期：继续沿选定向量滑步，不因刚退到掩体后失去 LOS 而下一帧立刻折返抽搐 */
      if((a._dodgeT||0)>0&&a._dodgeVec){
        a._dodgeT=Math.max(0,a._dodgeT-dt);
        if(a._dodgeT<=0)a._dodgeCD=0.65;
        const vx=a._dodgeVec[0], vy=a._dodgeVec[1];
        const nx=a.x+vx*step, ny=a.y+vy*step;
        if(free(nx,ny)&&!doorBlockedSegment(a.x,a.y,nx,ny)){
          a.x=nx; a.y=ny; a.moving=true; a.path=null;
          a.dir=Math.abs(vx)>Math.abs(vy)?(vx>0?'right':'left'):(vy>0?'down':'up');
          return true;
        }
        a._dodgeT=0; a._dodgeCD=0.65;
      }
      if((a._dodgeCD||0)>0)return false;
      const o=gunThreatFrom(a); if(!o)return false;
      const dx=a.x-o.x, dy=a.y-o.y, d=Math.hypot(dx,dy)||1;
      const px=-dy/d, py=dx/d;
      const side=a._dodgeSide||1;
      const cands=side>0
        ?[[px,py,1],[-px,-py,-1],[px*0.7+dx/d*0.7,py*0.7+dy/d*0.7,1],[-px*0.7+dx/d*0.7,-py*0.7+dy/d*0.7,-1]]
        :[[-px,-py,-1],[px,py,1],[-px*0.7+dx/d*0.7,-py*0.7+dy/d*0.7,-1],[px*0.7+dx/d*0.7,py*0.7+dy/d*0.7,1]];
      for(const [vx,vy,sd] of cands){
        const nx=a.x+vx*step, ny=a.y+vy*step;
        if(free(nx,ny)&&!doorBlockedSegment(a.x,a.y,nx,ny)){
          a.x=nx; a.y=ny; a.moving=true;
          a._dodgeSide=sd; a._dodgeVec=[vx,vy]; a._dodgeT=0.35;
          a.path=null;
          a.dir=Math.abs(vx)>Math.abs(vy)?(vx>0?'right':'left'):(vy>0?'down':'up');
          return true;
        }
      }
      return false;
    }
    function aiHuman(a,dt){ const G=getG(), SND=getSND(), SHOOT_K=getShootK();
      if(G.meet||G.over)return;
      if(a.detained)return;
      if(a._pathCD>0)a._pathCD-=dt;
      dropStaleFix(a);
      if(a.doing>0&&a._doing==='task'){
        const th=taskThreat(a,a.doing)||gunThreatFrom(a);
        if(th){fleeTask(a,th);gunDodgeStep(a,dt);return;}
        /* 听到有人靠近也中断任务（与 taskThreat 区别：那条要认出+看见，这条只读脚步声） */
        if(a.mind&&a.mind.noise&&evNow()-a.mind.noise.t<2.5){
          const nz=a.mind.noise;
          if(Math.hypot(nz.x-a.x,nz.y-a.y)<7&&
            Math.random()<SKSanity.TASK_ABORT.hearRate*dt){
            fleeTask(a,null);
            if(G.simMode&&G.simStats)G.simStats.taskAborts=(G.simStats.taskAborts||0)+1;
            return;
          }
        }
      }
      if(a._fleeT>0){
        a._fleeT-=dt;
        if(gunDodgeStep(a,dt))return;
        if(!a.path||!a.path.length){
          const q=SKT2Space.idleSpot(SKT2Space.idleRoom(roomAt(a.x,a.y)));
          walkTo(a,q[0],q[1]);
        }
        if(a.path&&a.path.length)stepMove(a,dt,moveSpeed(a));
        return;
      }
      if(a.doing>0){
        if(outBlocksDoing(a)){a.doing=0;a._doing=null;a._taskPt=null;a.path=null;}
        else{a.doing-=dt;if(a.doing<=0)finishDoing(a);return;}
      }
      if(a._rest>0){a._rest-=dt;aiIdleRoam(a,dt);return;}
      /* 开局先各自散开、错峰开工，立即移动不原地罚站 */
      if(a._delay>0){
        a._delay-=dt;
        if(!a.path||!a.path.length){
          const r=G.terminator?(roomAt(a.x,a.y)||M.rooms[0]):M.rooms[Math.floor(Math.random()*M.rooms.length)];
          const p=randIn(r); walkTo(a,p[0],p[1]);
        }
        if(a.path&&a.path.length) stepMove(a,dt,moveSpeed(a));
        return;
      }
      /* 已经在拖人：人进了医疗间就松手（无人机会自己飞过来）；拖拽中状态失效就松手 */
      if(a.drag!=null){
        const v=G.agents[a.drag];
        if(!v||!v.alive||!v.downed){releaseDragBy(a,true);}
        else if(!medbotUsable()){releaseDragBy(a,true);a._rest=0.2;aiIdleRoam(a,dt);return;}
        else if(nearMedBot(v)){releaseDragBy(a,true);a._rest=0.2;aiIdleRoam(a,dt);return;}
        else{
          const m=medDropSpot();
          if(Math.hypot(a.x-m[0],a.y-m[1])<1.4){
            releaseDragBy(a,true);a._rest=0.2;aiIdleRoam(a,dt);return;
          }
          if(!a.path||!a.path.length){const c0=a._pathCD||0;walkTo(a,m[0],m[1]);if(!a.path&&(a._pathCD||0)>c0){releaseDragBy(a,true);a._rest=0.2;aiIdleRoam(a,dt);return;}}
          stepMove(a,dt,moveSpeed(a));return;
        }
      }
      /* 突然回头：人类带枪也会猛地转身（只打自己已经敢开枪的人） */
      if(turnBack(a,dt))return;
      /* 医疗包优先救人：濒死者拖到天亮会失血而死，AI 会主动跑过去按 F */
      if(a.medkit>0&&(!a.path||!a.path.length)){
        const v=nearestDowned(a,7.5);
        const busy=v&&(v.draggedBy!=null||G.agents.some(x=>x!==a&&x._doing==='revive'&&x._rv===v));
        if(v&&!busy){
          if(Math.hypot(v.x-a.x,v.y-a.y)<1.7){
            a.doing=SKSanity.STAND.revive;a._dur=SKSanity.STAND.revive;a._doing='revive';a._rv=v;a.path=null;
            setAct(a,'heal',0.6,{ang:0});
          }else{walkTo(a,v.x,v.y);stepMove(a,dt,moveSpeed(a));}
          return;
        }
      }
      /* 有枪：**确证异形优先**（2026-11-20 终结者明牌后尤其重要）。
         旧写法只从 suspect / bestSusTarget 选靶，明牌写了 known 却没人读 ——
         人类明明知道谁是异形，仍然不对他开枪。现在 known 直接排第一。 */
      if(a.bullet>0){
        let si=a.suspect;
        /* 明牌后才把 known 直接排第一（2026-11-20）：平时人类即使"确证"过，
           也仍走原来的 suspect / 门槛链 —— 全局无条件追 known 会把人类胜率
           从 ~58% 抬到 90%+（100 局实测），那不是修 bug，是改平衡。 */
        const kn0=G.revealAll?bestKnownTarget(a):null;
        if(kn0)si=kn0.i;
        if(si!=null){
          const s=G.agents[si];
          if(!s||s===a||!s.alive||s.downed){a.suspect=null;si=null;}
          /* 明牌人类队友：不选、不开枪（情绪/旧 suspect 都不能推动打队友） */
          else if(a.mind&&a.mind.knownHuman&&a.mind.knownHuman[si]){a.suspect=null;si=null;}
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
          const shootR=SH.range, chaseR=(G.terminator&&sure)?1e9:(sure?SH.chaseKnown:SH.chaseSus);
          const d=Math.hypot(s.x-a.x,s.y-a.y);
          if(d<=shootR&&losNow(a.x,a.y,s.x,s.y)){
            a.path=null;a._aimAng=Math.atan2(s.y-a.y,s.x-a.x);
            if(fireShot(a,s))a._rest=0.2;
            return;
          }
          if(gunDodgeStep(a,dt))return;
          if(d<chaseR){
            if(a._shootFor!==si){a.path=null;a._pathCD=0;a._shootFor=si;}
            if(!a.path||!a.path.length)walkTo(a,s.x,s.y);
            stepMove(a,dt,moveSpeed(a));return;
          }
        }else a._shootFor=null;
      }else a._shootFor=null;
      if(gunDodgeStep(a,dt))return;
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
      if(!G.dmg.length)a._fixWait=null;
      if(G.dmg.length){
        if(a._fixGo&&G.dmg.indexOf(a._fixGo)<0)a._fixGo=null;
        if(!a._fixGo){
          /* 故障刚出现不立刻折返：手上有事先收尾（FIX_REACT×0.6~1.4），避免全船同秒掉头 */
          if(a._fixWait==null){
            const busy=a.doing>0||a.drag!=null||!!(a.path&&a.path.length&&a._taskPt!=null);
            a._fixWait=busy?(G.playT||0)+SKTeam.FIX_REACT*(0.6+Math.random()*0.8):0;
          }
          if((G.playT||0)<a._fixWait){ /* 反应期：继续走跟踪/任务分支 */ }
          else {
          let best=null,bd=1e9;
          for(const d of G.dmg){
            /* 同一故障超过 FIX_CREW_CAP 人在赶/在修，边际收益为负，自己去做任务（防踩踏） */
            const crew=G.agents.filter(x=>x!==a&&((x._doing==='fix'&&x._fix===d)||x._fixGo===d)).length;
            if(crew>=SKTeam.FIX_CREW_CAP)continue;
            /* 正在修的人若我判断大概率是人类就不抢（读自己的 identityAxis.h，不读真值） */
            if(crew>0){
              let trust=0;
              for(const x of G.agents){
                if(x===a||!x.alive)continue;
                if((x._doing==='fix'&&x._fix===d)||x._fixGo===d)
                  trust=Math.max(trust,identityAxis(a,x).h);
              }
              if(trust>=SKTeam.FIX_TRUST_SKIP)continue;
            }
            const dd=Math.hypot(d.x-a.x,d.y-a.y);
            if(dd<bd){bd=dd;best=d;}
          }
          if(best){a._fixWait=null;if(best!==a._fixGo){a._fixGo=best;a.path=null;}}
          }
        }
        if(a._fixGo){
          const d=a._fixGo;
          if(Math.hypot(d.x-a.x,d.y-a.y)<1.5){startFix(a,d);return;}
          if(!a.path||!a.path.length)walkTo(a,d.x,d.y);
          stepMove(a,dt,moveSpeed(a));return;
        }
      }
      /* 人类 AI 跟踪（R11.9/R20.3）：与故障解耦，无故障也能取证。小概率启用(stalkRate×dt)，
         复用同一份 HUNT；只观察不攻击。跟丢同异形索敌：看得见追实时并记格，看不见追格(memorySec)。 */
        if(a._stalkT>0){
          a._stalkT-=dt;
          const st=(a._stalkTarget!=null)?G.agents[a._stalkTarget]:null;
          if(!st||!st.alive||st.downed||st.detained||st===a){
            a._stalkT=0;a._stalkTarget=null;a._stalkPos=null;a._stalkCD=SKSanity.HUNT.stalkGap;
          }else{
            /* 同异形索敌(R11.9 共用 memorySec)：看得见追实时刷快照，看不见追快照，
               到点没看见/超时才算跟丢；只观察不攻击 */
            const seen=aiCanSee(a,st.x,st.y),H=SKSanity.HUNT;
            let sx=st.x,sy=st.y;
            if(seen)a._stalkPos={x:sx,y:sy,t:evNow()};
            else if(a._stalkPos&&evNow()-a._stalkPos.t<=H.memorySec){sx=a._stalkPos.x;sy=a._stalkPos.y;}
            else {a._stalkT=0;a._stalkTarget=null;a._stalkPos=null;a._stalkCD=H.stalkGap;}
            if(a._stalkT>0&&!seen&&Math.hypot(sx-a.x,sy-a.y)<1.2){
              a._stalkT=0;a._stalkTarget=null;a._stalkPos=null;a._stalkCD=H.stalkGap;   /* 到点没看见⇒线索用完 */
            }
            if(a._stalkT>0){
              /* 保持 4.5~6.5 格随行观察距离，不原地木桩站定 */
              const sd=Math.hypot(sx-a.x,sy-a.y);
              if(sd>5.5&&(!a.path||!a.path.length))walkTo(a,sx,sy);
              else if(!a.path||!a.path.length){
                const ang=Math.atan2(a.y-sy,a.x-sx)+(Math.random()-0.5)*1.2;
                const bx=sx+Math.cos(ang)*5.2,by=sy+Math.sin(ang)*5.2;
                if(free(bx,by))walkTo(a,bx,by);
              }
              stepMove(a,dt,moveSpeed(a));return;
            }
          }
        }
        if(a._stalkCD>0)a._stalkCD-=dt;
        if(a._stalkCD<=0&&Math.random()<SKSanity.HUNT.stalkRate*dt){
          const H=SKSanity.HUNT;
          let best=null,bs=0;
          for(const h of G.agents){
            if(h===a||!h.alive||h.downed||h.detained)continue;
            /* 权重=个人信任分负端 + 扰动（2026-11-20 两轴合并：不再把 cred 负端
               单独拆出来加一次，避免同一条 T 被重复计权） */
            const s=beliefOf(a,h.i)+Math.random()*H.jitter*0.02;
            if(s>bs){bs=s;best=h;}
          }
          if(best&&bs>=H.stalkMin){
            a._stalkTarget=best.i;a._stalkT=H.stalkSec;a._stalkCD=H.stalkGap;
            return;
          }
        }
      /* 2026-11-19：小幅提高做任务的欲望 —— 手上还有活时，三成半的概率不绕去翻尸 / 看热闹 */
      const sideSkip=a.tIdx<a.tasks.length&&Math.random()<SKSanity.TASK_FOCUS.skipSide;
      /* 尸体上有自己缺的子弹/医疗包/申请单 → 主动去翻尸（人类同样会搜尸取证） */
      if(!sideSkip&&lootRun(a,dt))return;
      /* 人类跟踪（2026-11-21）：与搜尸同级，低概率起意、只在任务间隙 */
      if(!sideSkip&&stalkRun(a,dt))return;
      /* 听到尖叫/枪声/刀声：高警觉且手头没有更急的事时，去现场看一眼 */
      if(!sideSkip&&a.mind&&a.mind.alert>=0.7&&a.mind.noise&&!a._look){
        const n=a.mind.noise;
        if(evNow()-n.t<8&&Math.hypot(n.x-a.x,n.y-a.y)>3){
          a._look={x:n.x,y:n.y,t:evNow()};
          walkTo(a,n.x,n.y);
        }else{a.mind.alert=0;a.mind.noise=null;}
      }
      if(a._look){
        /* look 点不可走（0,0 占位噪声）就地作废：拿它 walkTo 必然失败，人会杵到 10 秒超时 */
        if(Math.hypot(a._look.x-a.x,a._look.y-a.y)<3||evNow()-a._look.t>10||!free(a._look.x,a._look.y)){
          a._look=null;a.mind.alert=Math.max(0,a.mind.alert-0.5);a.mind.noise=null;
        }else{
          if(!a.path||!a.path.length)walkTo(a,a._look.x,a._look.y);
          stepMove(a,dt,moveSpeed(a));return;
        }
      }
      if(a.path&&a.path.length){ stepMove(a,dt,moveSpeed(a)); return; }
      /* 物资申请单必须回中央会议室圆桌领取（站桩 SUPPLY_QUAL_TIME 秒，满 2 张上限时先用再领） */
      if(a.qualPending>0&&(a.qual||0)<2){
        const qd=roundTableClaimSpot();
        if(qd){
          if(Math.hypot(qd.x-a.x,qd.y-a.y)<1.8){
            a.path=null;a.moving=false;
            a.doing=SUPPLY_QUAL_TIME;a._dur=SUPPLY_QUAL_TIME;a._doing='qual';return;
          }
          walkTo(a,qd.x,qd.y);stepMove(a,dt,moveSpeed(a));return;
        }
      }
      /* 已经站在专用补给点：消耗申请单换物资（尊重补给箱冷却） */
      const spNear=nearSupply(a);
      if(spNear&&a.qual>0&&supplyCoolLeft(spNear.item)<=0){
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
      let p=M.points[a.tasks[a.tIdx]];
      /* 2026-11-21/22：断电舱（或终结者时刻被永久锁门的外舱）任务点开不了工——优先切去可做的剩余任务，否则巡舱游荡 */
      const taskLocked=pt=>!pt||(G.roomOut&&G.roomOut[pt.room]>0)||(G.terminator&&roomIdAt(a.x,a.y)!==pt.room);
      if(taskLocked(p)){
        const alt=a.tasks.findIndex((t,ix)=>ix>a.tIdx&&!taskLocked(M.points[t]));
        if(alt>a.tIdx){const cur=a.tasks[a.tIdx];a.tasks[a.tIdx]=a.tasks[alt];a.tasks[alt]=cur;p=M.points[a.tasks[a.tIdx]];}
        else{aiIdleRoam(a,dt);return;}
      }
      if(Math.hypot(p.x-a.x,p.y-a.y)<2.8){
        const th=taskThreat(a,p.dur)||gunThreatFrom(a);
        if(th){fleeTask(a,th);gunDodgeStep(a,dt);return;}
        a.doing=p.dur; a._dur=a.doing; a._doing='task';
        a._taskPt=a.tasks[a.tIdx];
        /* 看见做任务（进行中）+15（2026-11-21 用户裁定）：同一任务只广播一次 */
        credBroadcast(a,'taskDoing',a.x,a.y);
      }else{
        walkTo(a,p.x,p.y);
        if(a.path&&a.path.length)stepMove(a,dt,moveSpeed(a));
        else aiIdleRoam(a,dt);
      }
    }
    /* ---- 藏尸点 / 藏尸对象 ---- */
    const HIDE_SPOTS={};
    function hideSpotFor(rid){ const G=getG(), SND=getSND(), SHOOT_K=getShootK();
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
    function hideRoomFor(rid,x,y){ const G=getG(), SND=getSND(), SHOOT_K=getShootK();
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
    function dragAwayNotice(a,v){ const G=getG(), SND=getSND(), SHOOT_K=getShootK();
      if(!a||!v||v.alive)return;
      logEvent('drag_away',{actor:a.i,victim:v.i,room:roomIdAt(a.x,a.y),
        x:+a.x.toFixed(1),y:+a.y.toFixed(1)});
      for(const w of G.agents){
        if(w===a||w.alien||!w.alive||w.downed||w.detained)continue;
        if(attention(w)!=='online')continue;
        if(Math.hypot(w.x-a.x,w.y-a.y)>6)continue;
        if(!aiCanSee(w,a.x,a.y,6))continue;
        w._dragAwaySeen=w._dragAwaySeen||{};
        const key=a.i+':'+G.night;
        if(w._dragAwaySeen[key])continue;
        w._dragAwaySeen[key]=1;
        const ev={kind:'saw_drag_away',x:a.x,y:a.y,room:roomIdAt(a.x,a.y),
          subj:a.i,victim:v.i,conf:0.85,src:'sight'};
        evPush(w,ev);
        susAdd(w,a.i,(SKSanity.WITNESS&&SKSanity.WITNESS.dragAway!=null)?SKSanity.WITNESS.dragAway:EV_W.saw_drag_away,'saw_drag_away',ev);
        if(w.suspect==null||(w.mind.sus[w.suspect]||0)<0.5)w.suspect=a.i;
      }
    }
    function findHideBody(a){ const G=getG(), SND=getSND(), SHOOT_K=getShootK();
      let best=null,bd=3.2;
      for(const v of G.agents){
        if(v===a)continue;
        /* 已知濒死队友不作为敌人尸体藏匿，交给 alienMateRevive 拉去救 */
        if(v.alive&&v.downed&&isMate(a,v.i))continue;
        const bp=bodyPos(v); if(!bp)continue;
        if(v.draggedBy!=null)continue;
        /* 尸体上还有自己缺的物资：先搜尸再藏，别把子弹/医疗包一起埋了 */
        if(aiWantsLoot(a,v))continue;
        const d=Math.hypot(bp[0]-a.x,bp[1]-a.y);
        if(d<bd&&aiCanSee(a,bp[0],bp[1],3.6)){bd=d;best=v;}
      }
      return best;
    }
    function recentWitness(a,sec){ const G=getG(), SND=getSND(), SHOOT_K=getShootK();
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
    function sightRangeAt(x,y){ const G=getG(), SND=getSND(), SHOOT_K=getShootK();
      const r=roomAt(x,y);
      if(r&&G.lit[r.id]){
        /* 与 observerVisionAt 同一条视口上限：预筛半径不大于"屏幕能看到的范围"
           （42×16 的会议室不再返回 48 格，那是 AI 多看的根源）。 */
        return Math.min(Math.max(r.rect[2],r.rect[3])*SGT.litRoomMul,
          Math.max(SGT.litViewHalfW,SGT.litViewHalfH));
      }
      if(!r&&inCorr(x,y)&&G.corrLit)return SGT.corrR;
      return HUMAN_DARK_R;
    }
    /* 逃逸距离：出刀后 killer.redT=RED_BODY.dur 红身，离门/管道口越近越容易走干净 */
    function exitDistAt(x,y){ const G=getG(), SND=getSND(), SHOOT_K=getShootK();
      let best=1e9;
      for(const d of (G.doors||[]))best=Math.min(best,Math.hypot(d.x-x,d.y-y));
      for(const q of M.pipes)best=Math.min(best,Math.hypot(q.x-x,q.y-y));
      return best;
    }
    /* 暴露度 ∈ [0,1]：0 = 完全没人看得见，1 = 一群人围着看。
       except = 这一刀的**受害者**：他当然看得见，但他躲不掉，不能算进"可避免的暴露"，
       否则任何一次出手都会自带 1.0 的暴露分，理智线永远过不去。 */
    function exposureAt(a,x,y,except){ const G=getG(), SND=getSND(), SHOOT_K=getShootK();
      const R=Math.max(HUMAN_LIGHT_R,sightRangeAt(x,y));
      const ws=[];
      for(const w of G.agents){
        if(w===a||w===except||!w.alive||w.downed||w.detained||isMate(a,w.i))continue;
        if(attention(w)!=='online')continue;
        const d=Math.hypot(w.x-x,w.y-y);
        if(d>R||!aiCanSee(w,x,y,R))continue;
        ws.push(SKSanity.witnessWeight(d,R,w.doing>0));
      }
      return SKSanity.exposure(ws,SKSanity.escapeCost(exitDistAt(x,y)));
    }
    /* 「人群密度」这个纯距离口径（crowdAt）2026-11-18 已删除：
       它的三处用途（出刀 / 破坏 / 拉闸的"在人群里就不干"）全部并入下面 watchersAt
       的"有几个人**能看见**"一条判据（R5.3）。见 docs/CORE_RULES.md R5.3「实现已对齐」。 */
    /* 数"有几个人能看见这一下"。
       ⚠ 半径不能只调用方给多少就量多少：以前刀口那条固定 6 格，
       而亮舱/亮走廊按 `sightRangeAt` 是**整间可见**（会议室对角 42 格）——
       于是异形会当着满屋子人出刀，还自以为没人看见。
       现在取两者的较大值：调用方的 `rad` 只是"我至少关心这么远"，
       真正的可见性判据仍然是那条全船统一的 `aiCanSee`（亮区整片、暗处近身圆）。 */
    function watchersAt(a,x,y,rad,except){ const G=getG(), SND=getSND(), SHOOT_K=getShootK();
      const out=[];
      const R=Math.max(rad||0,HUMAN_LIGHT_R,sightRangeAt(x,y));
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
    function reportAlibiSpot(a){ const G=getG(), SND=getSND(), SHOOT_K=getShootK();
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
    function alienAudienceInfo(a){ const G=getG(), SND=getSND(), SHOOT_K=getShootK();
      const D=SKSanity.DISGUISE;
      let n=0,weight=0,idle=0,sus=0,inf=0;
      for(const w of G.agents){
        if(w===a||!w.alive||w.downed||w.detained||isMate(a,w.i))continue;
        /* A 批（2026-11-05）：做小游戏的人看不见，不算观众、也不算"闲着看我" */
        if(attention(w)!=='online')continue;
        /* 关键是"**他看得见我**"，不是"我看得见他"：信誉兑现走的是目击者的视野
           （credBroadcast 用 aiCanSee(w,x,y)），两处口径必须一致 ——
           否则异形会为一个根本没看见它的人白站 8 秒，而它自己看得见对方。
           2026-11-18：删掉原来那句 `d>=audienceR(8 格)` 的硬截断（R5.3）——
           站在亮会议室另一头（整间可见）的人明明看得见这场演出，却被 8 格砍掉，
           于是异形以为"没观众"而不敢演，或者反过来为看不见它的人演。 */
        if(!aiCanSee(w,a.x,a.y))continue;
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
    function audienceHotRooms(a){ const G=getG(), SND=getSND(), SHOOT_K=getShootK();
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
    /* 2026-11-21 用户第三批裁定：CRED 移除后，演出收益读 **WITNESS 表表面分**
       （观众看到的动作值多少分）；被看穿（fake 广播）才是 −25 的暴露面。
       valueMul = 表面分 / 15（WITNESS.taskDoing 基准）。 */
    function disguiseOptions(a,aud){ const G=getG(), SND=getSND(), SHOOT_K=getShootK();
      const D=SKSanity.DISGUISE, out=[], now=(G.playT||0), hot=audienceHotRooms(a);
      const multi=!!aud&&aud.n>=D.multiAudience;
      const WIT=SKSanity.WITNESS, base=WIT.taskDoing;
      const push=(o)=>{
        const ck=o.kind==='realFix'?'fixDone':(o.kind==='realRevive'?'revive':
          (o.kind==='breakerOn'?'breakerOn':null));
        o.credKey=ck||null;
        o.valueMul=ck&&WIT[ck]!=null?WIT[ck]/base:1;
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
      /* ④ 假装修理：就近有故障就在旁边"帮忙"（不修好、不加进度）。
         多人在场不演：要么不演，要么走真修（见 ① realFix）。 */
      const fd=!multi&&G.dmg.find(d=>Math.hypot(d.x-a.x,d.y-a.y)<D.fakeRepairR);
      if(fd){
        const f=nearestFree(fd.x,fd.y);
        push({kind:'fake',x:f[0],y:f[1],
          dur:D.dur.fake[0]+Math.random()*D.dur.fake[1],pt:null,
          key:'fix:'+fd.room,done:false,dist:Math.hypot(f[0]-a.x,f[1]-a.y),
          room:fd.room});
      }
      /* ⑤ 假装做任务：常客舱室 > 没人做过的点 > 距离。
         多人在场不演（用户 2026-11-06）：要么不假装，要么直接把任务做完。 */
      let bestAny=null,bd=D.spotR,fresh=null,frd=D.spotR,hotFresh=null,hfd=D.spotR;
      if(!multi)for(let i=0;i<M.points.length;i++){
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
        /* 2026-11-19：不再只在「快做完」时停 —— 在 30%~100% 之间随机收手 */
        dur:(D.dur.fakeTask[0]+Math.random()*D.dur.fakeTask[1])*(0.3+Math.random()*0.7),pt:pick5.i,
        key:'pt:'+pick5.i,done:!(hotFresh||fresh),dist:pick5.dd,room:pick5.room});
      /* 常客排前：同分里今晚见过人的舱室优先；打平再按 LENS.lr 排序（只定先后，不进权重） */
      const LENS=SKSanity.LENS;
      out.sort((x,y)=>{
        const hot=(y.hot||0)-(x.hot||0); if(hot)return hot;
        const lx=LENS.lr(x.credKey), ly=LENS.lr(y.credKey);
        if(!Number.isFinite(lx)||!Number.isFinite(ly)||lx===ly)return 0;
        return ly-lx;
      });
      return out;
    }
    /* 把"这一下会不会被识破 / 会不会真亏"翻译成 SKSanity.disguiseRisk 的输入 */
    function disguiseRiskParts(a,aud,spot){ const G=getG(), SND=getSND(), SHOOT_K=getShootK();
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
    function alienPlan(a,td){ const G=getG(), SND=getSND(), SHOOT_K=getShootK();
      /* 当众合闸一旦掷中，就锁一小段时间，避免 0.5 秒后的重算把演出覆盖掉
         （实测：计划选中 7.2% 的局，真正完成只有 1.1%）。贴脸有猎物时立即解锁。 */
      if(a._breakerGoal){
        const bg=a._breakerGoal;
        const closeKill=a.knife>0&&a.target&&a.target.alive&&!a.target.downed&&td<5;
        if(G.lightState===2&&(G.playT||0)<(bg.until||0)&&!closeKill)return bg;
        a._breakerGoal=null;
      }
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
      let scDis=-1, disPlan=null, brPlan=null;
      const DG=SKSanity.DISGUISE;
      /* 贴脸能杀的时候不演（2026-11-03 修）：伪装进了同一张表之后，
         加权观众 + valueMul 会把分数抬到压过 chase(12)，异形于是放着人不杀去站桩 ——
         这不是数值问题，是**次序**问题：与 alienSupport 开头那条"贴脸有人可杀时先处理人"
         同一条规则（同一个 5 格），这里只是把它也应用到新入口上。
         a.drag==null：拖着尸体时唯一的任务是藏好它，不能被"演一下"打断
         （与 alienSupport 开头 `a.drag!=null return false` 同一条口径）。 */
      const killWindow=a.knife>0&&knifeLockLeft()<=0&&td<5;
      if(!killWindow&&!a._noFake&&(a._fakeCD||0)<=0&&!a._supportGoal&&a.drag==null){
        const aud=alienAudienceInfo(a);
        if(aud.n>0){
          /* 逐个候选算分（2026-11-03）：真修 / 真救 / 合闸 / 假装修 / 假装做任务
             全在同一张表里比，值不值由 LENS 推出来的 valueMul 与各自的代价决定。 */
          for(const spot of disguiseOptions(a,aud)){
            const risk=SKSanity.disguiseRisk(disguiseRiskParts(a,aud,spot));
            const sc=SKSanity.disguiseScore({audience:aud.weight,duration:spot.dur,
              risk:risk,valueMul:spot.valueMul});
            const s=DG.planValue*sc-walk(spot.dist);
            /* 小概率通道要能拿到"分数不够"的合闸候选，所以先存一份再走门槛。
               其余候选仍然只在 sc >= minScore 且 s > 0 时进入正常比分。 */
            if(spot.kind==='breakerOn'&&brPlan==null){
              brPlan={id:'disguise',kind:'breakerOn',x:spot.x,y:spot.y,dur:spot.dur,
                pt:spot.pt,key:spot.key,room:spot.room,real:false,score:s,forced:true,
                aud:aud.n,audW:+aud.weight.toFixed(3),idle:aud.idle,
                susAud:aud.sus,infAud:aud.inf,risk:+risk.toFixed(3),sc:+sc.toFixed(3)};
            }
            if(sc<DG.minScore)continue;
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
      /* 当众合闸的小概率通道（2026-11-06）：每只异形每夜只掷一次，
         只有断电、有观众、闸可达、且当前没有更值的主动计划时才触发。
         它是一次真合闸（灯会亮、吃 breakerLoss），不是免费 +cred。 */
      if(brPlan&&a._breakerRollN!==G.night){
        a._breakerRollN=G.night;
        a._breakerRoll=Math.random()<DG.breakerChance;
        if(G.simMode&&G.simStats)G.simStats.fakeBreakerRolls=(G.simStats.fakeBreakerRolls||0)+1;
      }
      /* 没有强计划时才允许被小概率通道覆盖：chase 在非贴脸时只有 2/0，
         如果还卡死在 best<=chase，破坏/拉闸/拆机器人任何正分都会把骰子作废，
         实测 57% 的局掷了骰、只有 0.5% 的局真的选中。这里给到 6 分以内。 */
      if(brPlan&&a._breakerRoll&&!killWindow&&best<=Math.max(chase,6)){
        a._breakerRoll=false;
        brPlan.until=(G.playT||0)+25;
        a._breakerGoal=brPlan;
        if(G.simMode&&G.simStats)G.simStats.fakeBreakerPlans=(G.simStats.fakeBreakerPlans||0)+1;
        return brPlan;
      }
      if(disPlan&&best===scDis)return disPlan;
      if(best<=chase)return{id:'chase',room:null,score:chase};
      if(best===scBot)return{id:'bot',kind:botKind,score:scBot};
      if(best===scBr)return{id:'breaker',room:null,score:scBr};
      return{id:'sabotage',room:sbRoom,score:scSb};
    }
    function alienSupport(a,dt){ const G=getG(), SND=getSND(), SHOOT_K=getShootK();
      if(!a||!a.alien||a.doing>0||a.drag!=null)return false;
      /* 贴脸有人可杀先处理人；距离读最后目击快照，不读实时坐标（R11.1） */
      const tp=a._tgtPos||a.target;
      if(a.knife>0&&a.target&&a.target.alive&&!a.target.downed&&tp&&
        Math.hypot(tp.x-a.x,tp.y-a.y)<5)return false;
      /* 自己刀倒的人如果已经失血死亡，记得回去收走物资 / 藏尸（不是杀完就永远不管） */
      if(a._killBody!=null&&evNow()-(a._killAt||0)<45){
        const kv=G.agents[a._killBody];
        const kp=kv?bodyPos(kv):null;
        if(kp&&!kv.alive&&kv.draggedBy==null&&aiWantsLoot(a,kv)){
          const d=Math.hypot(kp[0]-a.x,kp[1]-a.y);
          if(d<2.2){
            a.path=null;a.moving=false;
            a.doing=SKSanity.LOOT.aiSearchTime;a._dur=SKSanity.LOOT.aiSearchTime;a._doing='search';a._sv=kv.i;
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
      /* 有申请单先回圆桌领取（站桩 SUPPLY_QUAL_TIME 秒，满 2 张上限时先用再领） */
      if(a.qualPending>0&&(a.qual||0)<2){
        const qd=roundTableClaimSpot();
        if(qd){
          if(Math.hypot(qd.x-a.x,qd.y-a.y)<1.8){
            a.path=null;a.moving=false;
            a.doing=SUPPLY_QUAL_TIME;a._dur=SUPPLY_QUAL_TIME;a._doing='qual';return true;
          }
          if(!a.path||!a.path.length)walkTo(a,qd.x,qd.y);
          stepMove(a,dt,moveSpeed(a));return true;
        }
      }
      /* 有申请单且缺子弹 → 军械补给点（与人类同一条补给规则，尊重冷却） */
      if(a.qual>0&&a.bullet<1&&supplyCoolLeft('ammo')<=0){
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
      /* 伪装不在这里（2026-11-03 移走）：原两段硬排 if（close>8 与 8 格观众数恒互斥）
         和当众合闸每秒掷骰，现统一进 alienPlan 效用表按
         planValue×disguiseScore−路程秒 比分，风险走 SKSanity.disguiseRisk。 */
      /* 真做任务只为换申请单，是少数策略：每只异形整局最多 1 次；
         人类进度接近 WIN_PTS 时不做，避免替人类完成维修胜利。 */
      if(!a._supportGoal&&a.knife<=0&&a.bullet<1&&a.qual<1&&
        (a._alienTaskTotal||0)<5&&G.prog<38&&a._alienTaskN!==G.night&&
        Math.random()<dt*0.02){
        const p=M.points[a.tasks[a.tIdx]];
        if(p){a._supportGoal={kind:'task',x:p.x,y:p.y,dur:p.dur,pt:a.tasks[a.tIdx]};return true;}
      }
      return false;
    }
    function ambushSpotFor(rid,sp){ const G=getG(), SND=getSND(), SHOOT_K=getShootK();
      const r=M.rooms.find(q=>q.id===rid);
      if(!r||!sp)return null;
      const AB=SKSanity.AMBUSH||{minR:2.8,maxR:5.5};
      let best=null,bs=-1e9;
      for(let k=0;k<18;k++){
        const p=randIn(r);
        if(!free(p[0],p[1]))continue;
        const d=Math.hypot(p[0]-sp.x,p[1]-sp.y);
        if(d<AB.minR||d>AB.maxR)continue;
        const sc=-exposureAt(null,p[0],p[1])*2+(d-AB.minR)*0.2;
        if(sc>bs){bs=sc;best=[p[0],p[1]];}
      }
      return best;
    }
    function alienMateRevive(a,dt){ const G=getG(), SND=getSND(), SHOOT_K=getShootK();
      if(!a||!a.alien||a.doing>0)return false;
      /* 若正在拖着已知濒死队友前往医疗间：送达后放下交给医疗机器人 */
      if(a.drag!=null){
        const dv=G.agents[a.drag];
        if(dv&&dv.alive&&dv.downed&&isMate(a,dv.i)){
          if(!medbotUsable()){releaseDragBy(a,true);return false;}
          const m=medDropSpot();
          if(nearMedBot(dv)||Math.hypot(a.x-m[0],a.y-m[1])<1.4){
            releaseDragBy(a,true);return true;
          }
          if(!a.path||!a.path.length){const c0=a._pathCD||0;walkTo(a,m[0],m[1]);if(!a.path&&(a._pathCD||0)>c0){releaseDragBy(a,true);return false;}}
          stepMove(a,dt,moveSpeed(a));return true;
        }
        return false;
      }
      /* 1. 有医疗包：优先直接施救视野内的已知濒死队友 */
      if(a.medkit>=1){
        let v=null,bd=8;
        for(const w of G.agents){
          if(w===a||!w.alive||!w.downed||!isMate(a,w.i))continue;
          const d=Math.hypot(w.x-a.x,w.y-a.y);
          if(d<bd&&aiCanSee(a,w.x,w.y,8)){bd=d;v=w;}
        }
        if(v){
          if(bd<1.7){
            a.path=null;a.moving=false;
            a.doing=SKSanity.STAND.revive;a._dur=SKSanity.STAND.revive;a._doing='revive';a._rv=v;return true;
          }
          if(!a.path||!a.path.length)walkTo(a,v.x,v.y);
          stepMove(a,dt,moveSpeed(a));return true;
        }
      }
      /* 2. 没医疗包但医疗机器人可用：把已知濒死队友拖进医疗间救治 */
      if(medbotUsable()){
        let v=null,bd=10;
        for(const w of G.agents){
          if(w===a||!w.alive||!w.downed||w.draggedBy!=null||!isMate(a,w.i)||inMedRoom(w.x,w.y))continue;
          const d=Math.hypot(w.x-a.x,w.y-a.y);
          if(d<bd&&aiCanSee(a,w.x,w.y,10)){bd=d;v=w;}
        }
        if(v){
          if(bd<1.9){
            startDrag(a,v);
            const m=medDropSpot();
            if(!a.path||!a.path.length)walkTo(a,m[0],m[1]);
            stepMove(a,dt,moveSpeed(a));return true;
          }
          if(!a.path||!a.path.length)walkTo(a,v.x,v.y);
          stepMove(a,dt,moveSpeed(a));return true;
        }
      }
      return false;
    }
    /* 管道机动：目标远、自己不在管道口时，先规划到能显著缩短距离的入口；
       站在口上就直接钻到离目标最近的出口。每夜最多 2 次、10 秒冷却。
       这是异形的核心位移能力，必须排在“没刀就游荡/补给”之前。 */
    /* 看不见人 ≠ 船上没人（取消全图锁敌的补位）：无可打目标时给"往哪走看看"——
       ① 本夜最后目击点（哪怕过追猎时效）；② 见过人最多的舱室任务点；③ 随机舱室巡逻。
       只服务位移与管道机动，绝不进出刀/开枪判定，否则等于换个名字把全图锁敌放回来。 */
    function huntSpotFor(a){ const G=getG(), SND=getSND(), SHOOT_K=getShootK();
      if(G&&G.terminator){
        const tr=roomAt(a.x,a.y)||M.rooms.find(q=>q.id==='bridge')||M.rooms[0];
        const tp=SKT2Space.idleSpot(tr);
        return {x:tp[0],y:tp[1]};
      }
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
    function alienPipeMove(a,dt,tgt,td){ const G=getG(), SND=getSND(), SHOOT_K=getShootK();
      if(!tgt||td<=15||a._pipeCD>0||a.drag!=null||(G&&G.terminator)){a._pipePlan=null;return false;}
      const from=nearPipe(a);
      if(from){
        let best=null,bd=1e9;
        for(const q of M.pipes){
          if(q===from)continue;
          const d=Math.hypot(q.x-tgt.x,q.y-tgt.y);
          if(d<bd){bd=d;best=q;}
        }
        if(best&&bd<td-4){
          a.x=best.x;a.y=best.y;a.path=null;a._pipeCD=SKSanity.PIPE.cooldown;a._pipePlan=null;
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
            a.x=out.x;a.y=out.y;a.path=null;a._pipeCD=SKSanity.PIPE.cooldown;a._pipePlan=null;
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
    function aiAlien(a,dt){ const G=getG(), SND=getSND(), SHOOT_K=getShootK();
      if(G.meet||G.over)return;
      if(a.detained)return;
      /* 2026-11-21 用户裁定「异形会自保」：出刀后短暂逃离 ——
         _escapeT 内只要离案发点还近，就一路向外走，不接别的活、不逗留。 */
      if(a._escapeT>0){
        a._escapeT-=dt;
        const ep=a._escapeFrom||{x:a.x,y:a.y};
        if(Math.hypot(a.x-ep.x,a.y-ep.y)<7){
          a._escapePathT=(a._escapePathT||0)-dt;
          if(!a.path||!a.path.length||a._escapePathT<=0){
            const ang=Math.atan2(a.y-ep.y,a.x-ep.x)||Math.random()*6.283;
            const bx=Math.max(1,Math.min(M.bounds.w-1,a.x+Math.cos(ang)*8));
            const by=Math.max(1,Math.min(M.bounds.h-1,a.y+Math.sin(ang)*8));
            const q=nearestFree(bx,by);
            walkTo(a,q[0],q[1]);
            a._escapePathT=1.0;
          }
          stepMove(a,dt,moveSpeed(a));
          return;
        }
        a._escapeT=0;
      }
      /* 行走不设人为冻结：追击途中、换靶超时都不再站住（2026-11-19 用户裁定） */
      if(a._pathCD>0)a._pathCD-=dt;
      dropStaleFix(a);
      if(a.doing>0){
        /* ---- 假动作的反侦察 / 防备（2026-11-19 用户裁定）----
           ① 发现有非队友看得见我在演 → 干脆把这件事**真做完**（不再硬演给证人看）；
           ② 只听到脚步、还没被看见 → 有概率提前收手，先躲开。
           两条都只读「谁看得见我 / 我听见谁」，不读心智真值。 */
        if(a._doing==='fake'&&!a._fakeReal){
          /* 必须再按真实距离筛一次：watchersAt 的半径会被视野下限抬高到 7 格 */
          const near=watchersAt(a,a.x,a.y,1.6).filter(w=>!isMate(a,w.i)&&
            Math.hypot(w.x-a.x,w.y-a.y)<=1.6).length;
          const seen=watchersAt(a,a.x,a.y,5.5).filter(w=>!isMate(a,w.i)).length;
          if(near>0){
            if(Math.random()<SKSanity.DISGUISE.turnReal*dt){
              a._fakeReal=true;a._taskPt=a._fakePt;
              if(G.simMode&&G.simStats)G.simStats.fakeTurnReal=(G.simStats.fakeTurnReal||0)+1;
            }
          }else if(seen===0){
            /* 2026-11-21 用户裁定「大幅度削弱异形中断做任务的权重」：
               只有**别人视野范围内没有任何人看得见我**时，才可能选择中断；
               有人在看（seen>0）→ 一律把戏演完（不中断）。
               半径 5.5 格搜索 = 任何可能看见我的视野；贴着的人（near>0）已走上面的转真做。
               权重同时从 0.045 降到 0.012（-73%），听到脚步再 ×2 加成。 */
            const nz=a.mind&&a.mind.noise;
            const justHeard=!!(nz&&evNow()-nz.t<1.2&&Math.hypot(nz.x-a.x,nz.y-a.y)<7);
            const rate=SKSanity.DISGUISE.abortRate*(justHeard?2:1);
            if(Math.random()<rate*dt){
              a.doing=0;a._doing=null;a._fakeKind=null;a._fakeCD=SKSanity.DISGUISE.cooldown;
              a.path=null;   /* 提前收手后立刻改道，不再原地愣一下 */
              if(G.simMode&&G.simStats)G.simStats.fakeAborts=(G.simStats.fakeAborts||0)+1;
              return;
            }
          }
        }
        a.doing-=dt;
        if(a.doing<=0){
          if(a._doing==='fake'){
            a._doing=null;a.doing=0;
            /* 演完进入冷却：真人不会连着演，也避免一晚上刷出一堆信誉 */
            a._fakeCD=SKSanity.DISGUISE.cooldown;
            /* **洗白的兑现口**：目击者分不出真假，看到的就是"他在修设备/做任务"，
               所以照样按表面动作记分（WITNESS 表）。
               两种假动作写**两种** kind —— ALMOST.friendKinds=2 要的就是"种类"，
               合成一种的话异形永远凑不齐，伪装线在第二层就是死的。 */
            credBroadcast(a,a._fakeKind==='repair'?'fakeRepair':'fakeWork',a.x,a.y);
            if(G.simMode&&G.simStats){
              if(a._fakeKind==='task')G.simStats.fakeTasks++;
              else G.simStats.fakeRepairs++;
            }
            a._fakeKind=null;
            if(a._fakeReal&&a._fakePt!=null){a._fakeReal=false;a.doing=0;a._doing='task';finishDoing(a);return;}
            a._fakeReal=false;
          }
          else finishDoing(a);
        }
        return;
      }
      /* 开局全员同舱：异形也必须遵守错峰延迟，立即散开走动不原地罚站 */
      if(a._delay>0){
        a._delay-=dt;
        if(!a.path||!a.path.length){
          const r=G.terminator?(roomAt(a.x,a.y)||M.rooms[0]):M.rooms[Math.floor(Math.random()*M.rooms.length)];
          const p=randIn(r); walkTo(a,p[0],p[1]);
        }
        if(a.path&&a.path.length) stepMove(a,dt,moveSpeed(a));
        return;
      }
      /* 突然回头：身后贴上来一个人（异形刀 / 带枪开火） */
      if(turnBack(a,dt))return;
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
            if(bp&&Math.hypot(bp[0]-a.x,bp[1]-a.y)>SKSanity.MEET.reportR){
              if(!a.path||!a.path.length)walkTo(a,bp[0],bp[1]);
              stepMove(a,dt,moveSpeed(a));
            }else a.moving=false;
            return;
          }
          if(!a.path||!a.path.length){
            if(!p.spot||Math.hypot(p.spot[0]-a.x,p.spot[1]-a.y)<1.2)p.spot=reportAlibiSpot(a);
            if(p.spot)walkTo(a,p.spot[0],p.spot[1]);
          }
          stepMove(a,dt,moveSpeed(a));return;
        }else{
          const bp=bodyPos(v);
          const d=Math.hypot(bp[0]-a.x,bp[1]-a.y);
          /* 与玩家同一条距离（旧写 2.6，比玩家松 0.2 格）：贴着尸体才准拉铃 */
          if(d<=SKSanity.MEET.reportR&&losNow(a.x,a.y,bp[0],bp[1])){
            /* 回到自己做的尸体旁：四周没人时先把死者身上的物资摸走，再拉铃报案 */
            if(aiWantsLoot(a,v)&&!watchersAt(a,bp[0],bp[1],7,v).length){
              a.path=null;a.moving=false;
              a.doing=SKSanity.LOOT.aiSearchTime;a._dur=SKSanity.LOOT.aiSearchTime;a._doing='search';a._sv=v.i;
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
            a._reportT=0;a._reportBody=null;a._reportGo=null;
            const direct=Math.random()<(wit?0.2:0.35);
            a._reportPlan={body:v.i,wait:direct?0:5+Math.random()*7,
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
      /* 挑目标的重估时机（2026-11-18 用户裁定「压低异形一直追某个人的欲望」）：
         原来只有"目标死了/倒下了"才会重挑 ⇒ 一只异形整夜咬死同一个人，
         这副死盯的样子本身就是阵营特征，玩家看一眼就知道谁在追人。
         现在每 HUNT.repickSec 秒重估一次；重估时在位目标吃 incumbentPen 惩罚、
         每个候选加 0~jitter 格扰动（不做 argmax，否则每次重算都回到同一个人，等于没改）。
         ⚠ 减黏性 = 异形变强的方向，历史 A/B（2026-11-06 目标承诺）给过反向 5pp 的量级，
         必须同 seed 蒙特卡洛实测确认，不许凭感觉定档。 */
      const HUNT=SKSanity.HUNT;
      const repick=a.target&&a.target.alive&&!a.target.downed&&
        a._targetT!=null&&(evNow()-a._targetT)>HUNT.repickSec;
      if(!a.target||!a.target.alive||a.target.downed||repick){
        /* 挑目标（2026-11-03 取消全图锁敌）：玩家异形只有一只手电，AI 不能拿全船实时坐标。
           三档信息：① 看得见→实时位置；② 本夜亲眼见过→最后目击位置，超 memorySec 不信；
           ③ 没印象→不进候选。平衡位移（找人变难），要 1000 局量。队友不打、被围观加风险、
           队友在追的让给队友、被晾过的暂时不碰。 */
        /* 谁公开指控过我：读会议记录的 _accusedBy（公开信息）+ heard 兜底。
           注意证言通道只投递给人类听众（异形收不到"指控我"的证言），
           所以必须用会议现场记录，不能只读 mind.heard。 */
        const accBy=new Set();
        for(const k in (a._accusedBy||{})){
          if(G.night-(a._accusedBy[k]||0)<=2)accBy.add(+k);   /* 2 夜内有效 */
        }
        for(const x of ((a.mind&&a.mind.heard)||[])){
          if(x&&x.tgt===a.i&&x.by!=null&&x.by!==a.i)accBy.add(x.by);
        }
        let best=null,bs=1e9,bx=0,by=0,fallback=null,fs=1e9,fx=0,fy=0;
        const mem=(a.mind&&a.mind.mem)||[];
        const stale=SKSanity.HUNT.memorySec;
        for(const h of G.agents){
          if(h===a||!h.alive||h.downed||h.detained)continue;
          if(isMate(a,h.i))continue;
          /* 刚被晾过的人：冷却期内不再列为首选（chaseCap 的配套，按人记） */
          if(a._chaseCD&&a._chaseCD[h.i]>evNow())continue;
          /* 第 4 个参数（退役的 SIGHT.aiCapR）2026-11-18 摘掉：aiCanSee 早就不看它了，
             留着只会让人误以为 AI 还有一个视距上限（R5.3）。 */
          const seenNow=aiCanSee(a,h.x,h.y);
          let hx=h.x,hy=h.y;
          if(!seenNow&&!G.terminator&&!lastAlienEvo(a)){
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
          /* 他干过正经事（合闸 / 任务目击，T 正端）→ 在异形眼里更像对手，
             但这不是身份结论，只是"先处理更像人类的人"。见 SKSanity.HUMANISH。 */
          const hi=humanishOf(a,h.i);
          /* 性格进评分：激进的异形不怕被看见、更愿意扑正在做事的人；
             谨慎的相反，被围观就换目标。系数见 SKTrait.C（已被 TRAIT_GAIN 压缩）。
             H 乘在**整段风险分**上（距离 + 暴露 + 让队友），而不只是距离：
             h=1 的目标按 0.5× 计，h=0 按 1.25× 计。只乘距离的话，
             高 h 但被人围着的目标仍然会被暴露项压下去。 */
          const base=d+exp*SKTrait.C.knifeWatcherPenalty(a)+(mateOnIt?8:0)
            +(busy?SKTrait.C.knifeBusyBonus(a):0);
          let s=base*targetDistMul(hostileProb(a,h))
            -(hi?SKSanity.HUMANISH.pull*hi:0);
          /* 2026-11-18（HUNT）：重估时给"我正在追的这个人"一个惩罚，再给每个候选
             一点随机扰动 —— 前者让追久了会分心换人，后者保证不是每次重算都回到
             同一个 argmax（那等于把死盯换了个名字）。 */
          if(a.target&&h===a.target)s+=HUNT.incumbentPen;
          /* 灭口优先：公开指控过我的人，等效距离缩短 accuserPull 格 */
          if(accBy.has(h.i))s-=HUNT.accuserPull;
          s+=Math.random()*HUNT.jitter;
          const until=a._avoid&&(a._avoid[h.i]||0);
          if(until&&evNow()<until){
            if(d>6&&s<fs){fs=s;fallback=h;fx=hx;fy=hy;}
            continue;
          }
          if(s<bs){bs=s;best=h;bx=hx;by=hy;}
        }
        const prevT=a.target;
        a.target=best||fallback;
        /* 换靶立即弃旧路径（2026-11-19 停顿治理）：不沿上一个人的路线走完再回头 */
        if(a.target!==prevT){a.path=null;a._pathCD=0;}
        /* 目标位置记"选择时看到/记得的那格"，不是实时坐标，否则追击仍是全图锁敌 */
        if(a.target){a._targetT=evNow();a._tgtPos={x:best?bx:fx,y:best?by:fy,t:evNow()};}
        else a._tgtPos=null;
      }
      /* 现场目击者优先：异形自己看见谁在视线里，就去处理谁；队友除外 */
      if(a.knife>0&&a.mind&&a.mind.seenBy){
        let wit=null,bd=1e9;
        for(const k in a.mind.seenBy){
          const e=a.mind.seenBy[k];
          if(evNow()-e.t>SKSanity.HUNT.memorySec)continue;   /* 与挑目标同一份记忆时效 */
          const w=G.agents[+k];
          if(!w||!w.alive||w.downed||w.detained||w===a||isMate(a,w.i))continue;
          /* 只处理此刻真的看得见的目击者；看不见的人只能留在记忆里，不能读实时坐标 */
          if(!aiCanSee(a,w.x,w.y))continue;
          const d=Math.hypot(w.x-a.x,w.y-a.y);
          if(d<bd){bd=d;wit=w;}
        }
        if(wit&&a.target!==wit){
          const cur=a.target&&a._tgtPos?
            Math.hypot(a._tgtPos.x-a.x,a._tgtPos.y-a.y):1e9;
          const wd=Math.hypot(wit.x-a.x,wit.y-a.y);
          /* 目击者优先但不为远处证人放弃贴脸目标；判据是"此刻看得见"(R5.3)，非固定 wd<12。
             seenBy 最近者随移动每帧变，曾一秒切十几次原地抽搐；现要明显更近且过冷却才换。 */
          if(aiCanSee(a,wit.x,wit.y)&&wd+HUNT.witSwapMargin<cur&&
            evNow()-(a._witSwapT||0)>HUNT.witSwapCD){
            a.target=wit;a._targetT=evNow();a._witSwapT=evNow();
            a._tgtPos={x:wit.x,y:wit.y,t:evNow()};
            a.path=null;a._pathCD=0;a._repathT=0;
          }
        }
      }
      let tgt=a.target,tx=0,ty=0,seenNow=false;
      if(tgt){
        seenNow=aiCanSee(a,tgt.x,tgt.y);
        if(seenNow||G.terminator||lastAlienEvo(a)){tx=tgt.x;ty=tgt.y;a._tgtPos={x:tx,y:ty,t:evNow()};}
        else if(a._tgtPos&&evNow()-a._tgtPos.t<=HUNT.memorySec){tx=a._tgtPos.x;ty=a._tgtPos.y;}
        else if(a._tgtPos){
          a._chaseCD=a._chaseCD||{};a._chaseCD[tgt.i]=evNow()+HUNT.chaseGiveUp;
          a.target=null;tgt=null;a._tgtPos=null;a.path=null;a._pathCD=0;
        }
        else {tx=tgt.x;ty=tgt.y;}   /* 夹具直写 target 无快照：退回实时坐标 */
      }
      /* 到了最后目击点还没看见人 ⇒ 线索用完转 huntSpotFor，并给冷却避免反复锁同格 */
      if(tgt&&!seenNow&&Math.hypot(tx-a.x,ty-a.y)<1.2){
        a._chaseCD=a._chaseCD||{};a._chaseCD[tgt.i]=evNow()+HUNT.chaseGiveUp;
        a.target=null;tgt=null;a._tgtPos=null;a.path=null;a._pathCD=0;
      }
      const td=tgt?Math.hypot(tx-a.x,ty-a.y):1e9;
      /* 位移目的地（看不见人时的"去找人"）：只给管道机动用，不进任何攻击判定 */
      const hunt=tgt?null:huntSpotFor(a);
      const pipeTgt=tgt?{x:tx,y:ty}:hunt;
      const pipeD=hunt&&!tgt?Math.hypot(hunt.x-a.x,hunt.y-a.y):td;
      /* 异形有子弹也会开枪：远距离/没刀时优先用枪，仅真正开枪时才清路径与扭头，避免未命中概率时每帧抽搐 */
      if(a.bullet>0&&tgt&&!isMate(a,tgt.i)&&(td>SKSanity.REACH.knife||a.knife<=0)&&
        td<=SKSanity.SHOT.range&&losNow(a.x,a.y,tgt.x,tgt.y)){
        if((a._shotCheckCD=(a._shotCheckCD||0)-dt)<=0){
          a._shotCheckCD=0.35;
          if(Math.random()<SKSanity.SHOT.alienFireP){
            a.path=null;a._aimAng=Math.atan2(tgt.y-a.y,tgt.x-a.x);
            fireShot(a,tgt);return;
          }
        }
      }
      if(a.bullet>0&&(!tgt||td>SKSanity.SHOT.range)&&(a._botShotCD=(a._botShotCD||0)-dt)<=0){a._botShotCD=SKSanity.SHOT.botShotCheck;
        for(const k of ['medbot','secbot']){const bp=botDead(k)?null:botPos(k),pr=k==='medbot'?SKSanity.SHOT.alienMedbotP:SKSanity.SHOT.alienSecbotP;if(bp&&Math.hypot(bp.x-a.x,bp.y-a.y)<=SKSanity.SHOT.range&&losNow(a.x,a.y,bp.x,bp.y)){if(Math.random()<pr){a.path=null;a._aimAng=Math.atan2(bp.y-a.y,bp.x-a.x);fireShotBot(a,k);return;}}}}
      /* 保安扇形内动手会被拘留：先退开，过几秒再找机会 */
      if(a._secAvoidT>0){
        a._secAvoidT-=dt;
        if(!a.path||!a.path.length){
          const r=M.rooms[Math.floor(Math.random()*M.rooms.length)];
          const p=randIn(r);walkTo(a,p[0],p[1]);
        }
        stepMove(a,dt,moveSpeed(a));return;
      }
      /* 破坏诱杀埋伏（2026-11-22）：不在原地木桩死盯，而是在附近小范围自然游走巡视，
         假装路过或查看周围，视野内发现落单修理者再伏击（不让人类玩家一眼看穿）。 */
      if(a._ambush){
        const am=a._ambush;
        const faultAlive=G.dmg&&G.dmg.some(d=>d.room===am.room);
        const crowd=watchersAt(a,a.x,a.y,8,null).filter(w=>!isMate(a,w.i));
        const prey=(seenNow&&td<6.5)||(crowd.length===1&&Math.hypot(crowd[0].x-am.x,crowd[0].y-am.y)<5.5);
        if(a.knife<=0||!faultAlive||evNow()>am.until||crowd.length>=SKSanity.KNIFE.witnessCap||prey){
          if(prey&&crowd.length===1&&!tgt){a.target=crowd[0];tgt=crowd[0];}
          a._ambush=null;
        }else if(am.spot){
          if(!a.path||!a.path.length){
            const dr=M.rooms.find(q=>q.id===am.room);
            const p=dr&&Math.random()<0.65?randIn(dr):am.spot;
            if(free(p[0],p[1]))walkTo(a,p[0],p[1]);
          }
          stepMove(a,dt,moveSpeed(a));return;
        }
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
        }else if(a._plan.id==='breaker'&&!a.sabUsed&&!G.terminator){
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
              /* 2026-11-18：删掉第三条 `crowdAt(...,crowdR)>=crowdN`（10 格内 ≥3 人）。
                 "有人能看见这一下"已经由 wc（同一条视野判据）覆盖，且这条更严格（≥1 就不干）；
                 留着两份就是同一个概念两处定义（红线 14）。 */
              if(wc>=B.witnessCap||conceal<B.minConceal){
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
            a._breakerGoal=null;
            a._fakeKind=(g.kind==='fakeTask')?'task':(g.kind==='breakerOn'?'breaker':'repair');
            a._fakePt=(g.pt!=null?g.pt:null);
            a.doing=g.dur;a._dur=g.dur;
            a._doing=(g.kind==='breakerOn'?'breaker':'fake');
            return;
          }
          if(!a.path||!a.path.length)walkTo(a,g.x,g.y);
          stepMove(a,dt,moveSpeed(a));return;
        }else if(a._plan.id==='sabotage'&&!a.sabUsed&&a._plan.room&&sabRoomOk(a._plan.room)){
          /* 落点只在选定舱室时抽一次并缓存：每帧重抽会让它一直改目标 */
          if(!a._sabSpot||a._sabSpot.room!==a._plan.room)a._sabSpot=sabSpot(a._plan.room);
          const sp=a._sabSpot;
          if(sp){
            /* 理智线：动手前先确认那台设备周围没人看着，有人就换一间、8 秒内不再选 */
            const S=SKSanity.SABOTAGE;
            const wc=watchersAt(a,sp.x,sp.y,7,null).filter(w=>!isMate(a,w.i)).length;
            const conceal=1-exposureAt(a,sp.x,sp.y);
            /* 同上：破坏也不再用固定格数数"人群"，只数**能看见这一下的人** */
            if(wc>=S.witnessCap||conceal<S.minConceal){
              a._sabSkipRoom=a._plan.room;a._sabSkipUntil=evNow()+8;
              a._sabSpot=null;a._plan=null;return;
            }
            /* **进舱即下手，不需要走到那台设备前**（2026-11-01 用户裁定）。
               破坏点仍然是任务点上的那台设备（G.dmg 的坐标就是它），
               但异形本人不必"蹲在设备前拆"—— 那样既不拟真，也让破坏变得很难做成。
               玩家侧 sabTick 同口径：进入舱室即引爆。 */
            if(roomIdAt(a.x,a.y)===a._plan.room||Math.hypot(a.x-sp.x,a.y-sp.y)<SKSanity.REACH.sabotage){
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
            releaseDragBy(a,true);a._hideCD=8;a._hideSpot=null;a._hideRoom=null;
            return;
          }
          const danger=!!(tgt&&seenNow&&td<4.5);
          if(!danger){
            const vp=bodyPos(v);
            const spot=a._hideSpot||hideSpotFor(a._hideRoom||roomIdAt(vp[0],vp[1]));
            if(!spot)releaseDragBy(a,true);
            else if(Math.hypot(a.x-spot[0],a.y-spot[1])<1.2){
              releaseDragBy(a,true);
              a._hideCD=25;a._hides=(a._hides||0)+1;a._hideSpot=null;a._hideRoom=null;
              return;
            }else{
              if(!a.path||!a.path.length){const c0=a._pathCD||0;walkTo(a,spot[0],spot[1]);if(!a.path&&(a._pathCD||0)>c0){releaseDragBy(a,true);a._hideCD=12;a._hideSpot=null;a._hideRoom=null;return;}}   /* 藏尸点走不到就松手 + 12 秒冷却，别抱着尸体杵着 */
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
          if(seen.length){a._hideCD=7;}
          else{
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
      }
      if(a.knife<=0&&alienSupport(a,dt))return;
      /* 有刀但附近无可下手目标：也顺手翻尸/补给/装忙，不是只会直线追人 */
      if(a.knife>0&&td>12&&alienSupport(a,dt))return;
      /* 管道排在补给/伪装之后、没刀游荡之前，否则刀用完永远走不到管道口 */
      if(alienPipeMove(a,dt,pipeTgt,pipeD))return;
      if(a.knife<=0){ // 没刀了就游荡（先尝试补给/翻尸/假装维修/做任务换弹）
        if(!a.path||!a.path.length){const r=G.terminator?(roomAt(a.x,a.y)||M.rooms[0]):M.rooms[Math.floor(Math.random()*M.rooms.length)];const p=randIn(r);walkTo(a,p[0],p[1]);}
        stepMove(a,dt,moveSpeed(a)); return;
      }
      if(!tgt){
        /* 无目标也走：到最后目击点巡逻，到同一格还没线索就换舱，不站定 */
        let h=huntSpotFor(a);
        if(h&&Math.hypot(h.x-a.x,h.y-a.y)<1.5){
          const r=G.terminator?(roomAt(a.x,a.y)||M.rooms[0]):M.rooms[Math.floor(Math.random()*M.rooms.length)];
          const p=randIn(r);h={x:p[0],y:p[1]};
        }
        if(h){if(!a.path||!a.path.length)walkTo(a,h.x,h.y);stepMove(a,dt,moveSpeed(a));}
        return;
      }
      /* 追击硬上限：repick 只是重打分，这条是与打分无关的硬线——
         连续追同一人超 chaseCap 秒主动放弃，冷却期不再选他；放弃/换靶都不停站 */
      const HC=SKSanity.HUNT;
      if(a._chaseId!==tgt.i){a._chaseId=tgt.i;a._chaseT=0;}
      if(!a.target)a._chaseT=0;
      a._chaseT=(a._chaseT||0)+dt;
      if(a._chaseT>HC.chaseCap){
        a._chaseCD=a._chaseCD||{};
        a._chaseCD[tgt.i]=evNow()+HC.chaseGiveUp;
        a._chaseId=null;a._chaseT=0;a.target=null;a.path=null;a._pathCD=0;
        const h=huntSpotFor(a);
        if(h){walkTo(a,h.x,h.y);stepMove(a,dt,moveSpeed(a));}
        return;
      }
      if(seenNow&&td<=SKTrait.C.knifeReach(a)){
        a._aimAng=Math.atan2(tgt.y-a.y,tgt.x-a.x);
        if(secbotWouldSee(a.x,a.y)){
          a._secAvoidT=2.5;a.target=null;a.path=null;a._pathCD=0;
          const r=G.terminator?(roomAt(a.x,a.y)||M.rooms[0]):M.rooms[Math.floor(Math.random()*M.rooms.length)];
          const p=randIn(r);walkTo(a,p[0],p[1]);stepMove(a,dt,moveSpeed(a));
          return;
        }
        /* 理智兜底：两条与性格无关的硬线先过——① 目击者≥witnessCap(3)放弃；
           ② 隐蔽度 1-exposure<minConceal 换时机（抓"亮房 10 格外有人"）。
           过后性格才在 0.34~0.66 浮动；与回头刀共用 knifeBlocked（2026-11-19）。 */
        if(knifeBlocked(a,tgt)){
          if(!a._avoid)a._avoid={};
          a._avoid[tgt.i]=evNow()+12;
          a.target=null;a.path=null;
          const q=SKT2Space.idleSpot(SKT2Space.idleRoom(roomAt(a.x,a.y)));
          walkTo(a,q[0],q[1]);stepMove(a,dt,moveSpeed(a));
          return;
        }
        knife(a,tgt); return;
      }
      /* 追击途中若正对敌方枪口锥（非贴脸出刀距离），先侧向走位躲避 */
      if(td>(SKTrait.C.knifeReach(a)+0.8)&&gunDodgeStep(a,dt))return;
      /* 追击全程连续移动：没有随机停顿；A10（2026-11-20）路径绑定目标 +
         判定点(tx/ty)移动 ≥0.8 格就每 0.2 秒重排一次 —— 只认实时可见点或最后目击快照，不读全图坐标 */
      if(tgt&&a.path&&a.path.length){const e=a.path[a.path.length-1];a._repathT=(a._repathT||0)+dt;
        if(a._pathFor!==tgt.i)a.path=null;
        else if(a._repathT>=0.2){a._repathT=0;if(Math.hypot(tx-e[0],ty-e[1])>=0.8)a.path=null;}}
      if(!a.path||!a.path.length){
        walkTo(a,tx,ty);a._pathFor=tgt?tgt.i:null;
        if(a.path&&a.path.length>1&&pathClear(a.x,a.y,a.path[1][0],a.path[1][1]))a.path.shift();
      }
      stepMove(a,dt,moveSpeed(a));
    }
    
    /* ---- 动作表现（纯视觉，不改变判定）：出手/受击短动作 ---- */

    return {
      aiIdleRoam,
      aiGhost,
      draggerOf,
      syncDragOf,
      startDrag,
      releaseDragBy,
      releaseDrag,
      releaseAllDrags,
      dragSound,
      aiScanBodies,
      aiReportApproach,
      inMedRoom,
      medDropSpot,
      aiHuman,
      hideSpotFor,
      hideRoomFor,
      sightRangeAt,
      watchersAt,
      alienAudienceInfo,
      disguiseOptions,
      disguiseRiskParts,
      alienPlan,
      ambushSpotFor,
      aiAlien
    };
  }

  global.SKNightAI = { create };
})(typeof window !== 'undefined' ? window : globalThis);
