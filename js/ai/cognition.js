/* ==== ARCH NODE · 架构节点标注（根 ARCHITECTURE.md） ====
 * layer     : T2/AI
 * domain    : AI 认知层（记忆 / 推理 / 视野 / 声纹 / 回放采样）
 * definedBy : 事件流 / 信任情绪 / 视野与声纹 / 尸体观察与错认
 * truth     : js/ai/cognition.js#SKCognition
 * verify    : npm test
 * flag      : F
 * note      : P5a 从 js/game.js 拆出
 * ============================================================== */
(function (global) {
  'use strict';

  function create(R) {
    const {
      getG,
      M, SKT2AI, SKSanity, SKTrait, SKLines, WIN_PTS, trustMirror, roomIdAt, causeName, losNow, sightRangeAt, openBodyCard, toast, litZoneAt, corrJoinsRoom, evNow, credOf, mindReset, evPush, axisAddT, trustCert, evalAlmost, knownOverride, susAdd, bodyPos, bodyHasLoot, lootBody, lootText, roomAt, los
    } = R;
    /* ---------------- AI 认知层（感知 / 记忆 / 推理） ----------------
       所有判断只来自 AI 自己看见、听见或搜查到的事实；不读取 alien 身份。
       证据 → 嫌疑分 → 行为（报告 / 开枪 / 投票）与会议语料。 */
    /* 方案 A 第 6 项：MEM_MAX 与认知链 23 个函数真源在 js/t2/ai.js。 */
    const EV_W={saw_knife:0.75,saw_shot:0.55,saw_pipe:0.7,saw_sabotage:0.65,
      saw_bot:0.6,saw_breaker:0.32,saw_drag:0.22,saw_drag_away:0.45,saw_detain:0.6,saw_red:0.85,
      saw_fake_task:0.30,saw_task_abandon:0.14,
      heard_knife:0.18,heard_shot:0.16,heard_scream:0.22,heard_power:0.14,
      heard_robot:0.12,heard_pipe:0.2,heard_door:0.04,heard_detain:0.6,heard_drag:0.12,
      env_lights:0.1,env_fault:0.12,env_robot:0.14};

    /* ---------------- 对局事件流 / 回放采样（只记录，不参与任何判定） ----------------
       时间轴用 playT（真实模拟秒，会议期间不增长）排序；night / t 只用于展示
       “第几夜 · 夜里还剩多少秒”。事件与帧都做上限，异常长局也不会把内存拖爆。 */
    const EV_CAP=8000, FRAME_CAP=12000, FRAME_DT=0.5;
    function logEvent(kind,data){ const G=getG();
      if(!G)return null;
      const e=Object.assign({kind:kind,night:G.night||0,
        pt:+(G.playT||0).toFixed(2),t:+Math.max(0,G.t||0).toFixed(1),
        actor:null,victim:null,room:null,x:null,y:null},data||{});
      const arr=(G.events=G.events||[]);
      if(arr.length<EV_CAP)arr.push(e);
      return e;
    }
    function recordFrame(){ const G=getG();
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
    function replayData(){ const G=getG();
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
    /* 2026-11-20「一切分数化」：可信度并入 T —— 说对话 = T 加分、说错/被识破 = T 减分。
       reliaOf 保留为读出视图（返回 T 的正端映射到 0.5 基准），供证言权重调用点不改。 */
    function reliaOf(a,i){ const G=getG();
      /* 2026-11-21 并轴：证言可信度 = 0.5 + 信任盈余（T−prior，分）的线性映射，
         盈余 ±200 打满两端；硬确证态直接端点。 */
      const T=SKT2AI.trustRaw(a,i);
      const R=SKSanity.RELIA;
      if(Math.abs(T)>=SKSanity.AXIS.certFloor)return T<0?R.min:R.max;
      const p0=(G.priorT!=null)?G.priorT:SKSanity.AXIS.priorPool*(10/13);
      const surplus=Math.max(-SKSanity.AXIS.cap,Math.min(SKSanity.AXIS.cap,T-p0));
      return Math.max(R.min,Math.min(R.max,R.base+surplus/SKSanity.AXIS.cap*0.45));
    }
    function reliaAdd(a,i,w,reason){ const G=getG();
      if(!a||i==null||i===a.i||!G||!w)return;
      /* RELIA 的 ± 权重（0~1）折成 T 的 ± 修正：×50 → 分（caughtLie 0.2→10 分档，
         与 MAPPING.cap=15 同量级，不抢主证据的戏） */
      axisAddT(a,i,w*50*(SKSanity.AXIS.scoreMul!=null?SKSanity.AXIS.scoreMul:1));
      /* 影子字段（只读兼容）：门禁夹具直接读 mind.reliability；不参与判定 */
      if(!a.mind.reliability)a.mind.reliability={};
      const R2=SKSanity.RELIA;
      const rs=a.mind.reliability[i]==null?R2.base:a.mind.reliability[i];
      a.mind.reliability[i]=Math.max(R2.min,Math.min(R2.max,rs+w));
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
    /* 2026-11-20「一切分数化」：情绪也只留一本 E。感恩 +、记仇 −，
       性格系数照旧（激进记仇更狠、社交记恩更深），但不再有 trust/grudge 双账。 */
    /* E 情绪统一写入（2026-11-21 用户裁定「情绪 = 短期信任账」，量纲 ±100）：
       决策读 T+E 合成（effT），E 每夜快衰减（×0.6）。 */
    function emoAdd(a,i,w,reason){ const G=getG();
      if(!a||i==null||i===a.i||!G||!w)return;
      if(!a.mind)mindReset(a);
      if(!a.mind.E)a.mind.E={};
      const AXE=SKSanity.AXIS;
      const mulE=SKSanity.AXIS.scoreMul!=null?SKSanity.AXIS.scoreMul:1;
      a.mind.E[i]=Math.max(-100,Math.min(100,(a.mind.E[i]||0)+w*mulE));
      if(G.simStats){G.simStats.emoWrites=(G.simStats.emoWrites||0)+1;
        if(reason)G.simStats.emoBy=Object.assign(G.simStats.emoBy||{},{}),
          G.simStats.emoBy[reason]=(G.simStats.emoBy[reason]||0)+1;}
    }
    function grudgeAdd(a,i,w){ const G=getG();
      if(!a||i==null||i===a.i||!G)return;
      if(!a.mind)mindReset(a);
      if(!a.mind.E)a.mind.E={};
      const old=a.mind.E[i]||0;
      const gain=w*SKTrait.C.grudgeGain(a)*100;   /* 0~1 权重 → ±100 情绪量纲 */
      a.mind.E[i]=Math.max(-100,Math.min(100,old-gain));
      /* 影子字段（只读兼容）：门禁夹具直接读 mind.grudge；不参与判定 */
      if(!a.mind.grudge)a.mind.grudge={};
      a.mind.grudge[i]=Math.min(2,(a.mind.grudge[i]||0)+gain);
    }
    function trustAdd(a,i,w){ const G=getG();
      if(!a||i==null||i===a.i||!G)return;
      if(!a.mind)mindReset(a);
      if(!a.mind.E)a.mind.E={};
      const old=a.mind.E[i]||0;
      const gain=w*SKTrait.C.trustGain(a)*100;
      a.mind.E[i]=Math.max(-100,Math.min(100,old+gain));
      /* 影子字段（只读兼容）：门禁夹具直接读 mind.trust；不参与判定 */
      if(!a.mind.trust)a.mind.trust={};
      a.mind.trust[i]=Math.min(2,(a.mind.trust[i]||0)+gain);
    }
    /* 个人情绪分读出（0~1 视图 = E/100）；夹具直写影子 trust/grudge 时回灌读出 */
    function emotionOf(a,i){ const G=getG();
      if(!a||i==null||!a.mind)return 0;
      const ev=a.mind.E||{};
      const cur=ev[i]||0;
      if(!cur){
        const tr=(a.mind.trust&&a.mind.trust[i])||0;
        const gr=(a.mind.grudge&&a.mind.grudge[i])||0;
        if(tr||gr)return Math.max(-1,Math.min(1,tr-gr));
      }
      return Math.max(-1,Math.min(1,cur/100));
    }
    /* 恩人不过票：净情绪分 ≥ 0.8 就很难再把票投给他 */
    function isPatron(a,i){ const G=getG();
      return emotionOf(a,i)>=0.8;
    }
    /* ---- 正向信任 cred（2026-11-01）----
       和 trust / grudge 完全分开的第三条通道：
         trust = "他帮过我"     —— 情绪，来自当众辩护
         grudge= "他咬过我"     —— 情绪，来自被指控
         cred  = "他干的是正经事" —— 观察，来自可被目击的正经行为
       这一条是异形伪装的**兑现口**：演得像，cred 就涨，之后没人愿意指控它。
       数值全部来自 SKSanity.WITNESS 表，这里只负责写。 */
    function credAdd(a,i,w,reason){ const G=getG();
      if(!a||i==null||i===a.i||!G||!w)return;
      if(!a.mind)mindReset(a);
      /* 2026-11-21 用户第三批裁定：正向行为 = T 加分（WITNESS 表，单位=分）。
         分值抑制 ×0.75（表格原值不动）；确证 ∓999 不经过这里。 */
      w=w*(SKSanity.AXIS.scoreMul!=null?SKSanity.AXIS.scoreMul:1);
      const appliedC=SKT2AI.budgetT(a,i,w,reason);
      if(!appliedC)return;               /* 本夜 3 个目击事件名额已满且分值更小 */
      axisAddT(a,i,appliedC);
      if(G.simStats){
        const tag=(G.agents[i]&&G.agents[i].alien)?'A:':'H:';
        const tb=G.simStats.tOut||(G.simStats.tOut={});
        tb[tag+'+'+(reason||'?')]=(tb[tag+'+'+(reason||'?')]||0)+appliedC;
      }
      /* 影子（只读兼容）：cred 视图 = (T − prior) / 200，clamp ±1 */
      if(!a.mind.cred)a.mind.cred={};
      const p0=(G.priorT!=null)?G.priorT:SKSanity.AXIS.priorPool*(10/13);
      a.mind.cred[i]=Math.max(-1,Math.min(1,((a.mind.T||{})[i]||0)-p0)/SKSanity.AXIS.cap);
      /* credWhy 只作证据来源记录（发言 / 门禁读种类），不是分数账本 */
      if(reason){
        const cw=a.mind.credWhy||(a.mind.credWhy={});
        const arr=cw[i]||(cw[i]=[]);
        arr.push({kind:reason,night:G.night,w:+w.toFixed(1)});
        if(arr.length>8)arr.shift();
      }
      trustMirror(a,i);
      evalAlmost(a,i);
    }
    /* 信任的**聚焦选择器**（2026-11-03，与 topSus 对称）。
       以前只有"谁最可疑"、没有"谁最可信"，于是 cred 只能少做坏事（不咬 / 弃票），
       永远不能多做动作（不跟、不护送、不背书）。实测每局已有 0.96 对过了
       almost.friend 的分数门槛，却没有任何一处代码把它读成一个决定。
       `known` 的人**永远不进这个表** —— 信誉再高也洗不掉亲眼所见。 */
    function topCred(a,min){ const G=getG();
      /* 2026-11-21 用户第三批裁定：CRED 移除，背书对象改读 **T 相对先验的盈余**。
         门槛 = 准-确证人类线（200）；mind.T 遍历，硬确证/队友/明牌排除。 */
      if(!a||!a.mind||!a.mind.T)return null;
      const th=min==null?SKSanity.trustEndorseAt():min;
      let best=null,bi=null;
      for(const k in a.mind.T){
        const i=+k,v=((a.mind.T||{})[k]||0)-((G.priorT!=null)?G.priorT:SKSanity.AXIS.priorPool*(10/13));
        if(v<th)continue;
        if(a.mind.known&&a.mind.known[k])continue;
        if(!a.alien&&a.mind.knownHuman&&a.mind.knownHuman[k])continue;
        const t2=G.agents[i];
        if(!t2||!t2.alive||t2.downed)continue;
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
    function obeyTrustMul(a,leaderSeat){ const G=getG();
      if(!a||leaderSeat==null)return 0;
      const g=SKSanity.trustObeyGate()||1;
      return Math.max(0,Math.min(1,credOf(a,leaderSeat)/g));
    }
    /* ---- 讨论 → 关系（2026-11-01）----
       warm 是"聊得来"：一起咬过同一个人、或者他替我辩护过。
       只用于空闲时的同行偏好，**不参与投票**（避免变成第二套信任分）。 */
    function warmAdd(a,i,w){ const G=getG();
      if(!a||i==null||i===a.i||!w)return;
      if(!a.mind)mindReset(a);
      if(!a.mind.warm)a.mind.warm={};
      a.mind.warm[i]=Math.min(1,(a.mind.warm[i]||0)+w);
    }
    /* 空闲时想找的人：14 格内、warm 最高的活人（没有就返回 null） */
    function warmMate(a){ const G=getG();
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
    /* 追责（2026-11-01）：投票公布后清算带节奏的人。
       逐出的是异形→投对的加信誉；逐出的是人类→投错的扣信誉，带头者还记嫌疑。
       第一个公开指控者(meet.ctx.lead)权重最高，跟票按 voterMul；诬陷成功收益大，
       但被证伪后带头者自己变下一个目标。玩家席位的公开点名同样写 ctx.lead。 */
    function settleAccountability(cand){ const G=getG();
      if(!cand||!G.meet)return;
      const A=SKSanity.ACCOUNT, R=SKSanity.RELIA, m=G.meet, votes=m.votes||{};
      const wasAlien=!!cand.alien;
      const voters=[];
      for(const k in votes)if(votes[k]===cand.i)voters.push(+k);
      /* 带头者 = 第一个**有依据地**公开指控这个人的人。
         ⚠ 2026-11-18 修：旧实现读 `m.lead`，而 lead 从来没写在 `m` 上 ——
         它写在 `m.ctx.lead`（见 buildMeetCtx：门槛是 `accuseWhy.solid`）。
         于是 `leadMul 2.2` 恒落在「第一个投票的人」身上，而第一个投票只说明他手快，
         不说明他带节奏。扩散追责的加减分必须给对人，所以先修这条。 */
      const ctxLead=(m.ctx&&m.ctx.lead&&m.ctx.lead[cand.i]!=null)?m.ctx.lead[cand.i]:null;
      const lead=(ctxLead!=null&&G.agents[ctxLead])?ctxLead:(voters.length?voters[0]:null);
      if(lead==null)return;
      /* 带头但弃权/没投的人同样要被清算 —— 带节奏的是他，不是跟票的 */
      if(voters.indexOf(lead)<0)voters.push(lead);
      /* 频繁带节奏的递进（R14.8）：**不新增计数器** —— 读观察者自己"听过的公开指控"
         那条整局滑窗（R11.7 的 mind.heard）。同一个人在我耳边带过 ≥spamAt 次节奏，
         往后每一笔负分按档放大（封顶 3 档，因为 cred 本身夹在 floor −0.5，再乘也只是饱和）。 */
      const spamMul=(w,vi)=>{
        const h=(w.mind&&w.mind.heard)||[];
        let n=0;
        for(const x of h)if(x&&x.by===vi)n++;
        const over=n-A.spamAt;
        return over>0?1+A.spamMul*Math.min(3,over):1;
      };
      /* 2026-11-21 用户第三批裁定：翻牌回填只落 **T** ——
         咬对（目标是异形）→ 公开指控过他的人 **+50**；咬错（目标是人类）→ **−30**；
         投票投错**不回填 T**（别人不知道谁投的），投票者只吃被冤者的记仇情绪（E）。
         带头者吃频率递进；全场对带头冤枉人的消极情绪走 E（煽动的另一面）。 */
      const accusers=(m.ctx&&m.ctx.lead&&m.ctx.lead[cand.i]!=null)
        ?G.agents.filter(x=>x&&x.alive&&!x.downed&&x.accuse===cand.i&&x.i!==cand.i).map(x=>x.i):[];
      if(voters.indexOf(lead)<0)voters.push(lead);
      /* 2026-11-21 用户原文「如果发现有**一个人**带节奏」：翻牌回填只结算 lead。
         旧写法把"所有公开指控过他的人都算一遍"（6 指控者 × 11 观众 = 66 次/局，
         每局 −1278 分噪声）。 */
      const accSet={}; accSet[lead]=1;
      for(const vi of Object.keys(accSet)){
        const src=G.agents[vi];
        if(!src)continue;
        const isLead=(vi===lead);
        const sp=isLead?spamMul(src,vi):1;
        for(const w of G.agents){
          if(w===src||w===cand||!w.alive||w.downed||!w.mind)continue;
          if(wasAlien){
            credAdd(w,vi,A.correct*A.leadMul,'right_lead');
            reliaAdd(w,vi,R.leadRight,'lead_right');   /* 他带对了 → 以后他说的话更值钱 */
          }else{
            credAdd(w,vi,A.wrong*(sp),'wrong_lead');
            reliaAdd(w,vi,-R.leadWrong,'lead_wrong');
            emoAdd(w,vi,A.wrongLeadEmo,'wrong_lead');  /* 全场对带头冤枉人的消极情绪 */
          }
        }
      }
      for(const vi of voters){
        const src=G.agents[vi];
        if(!src)continue;
        /* 投票者不回填 T；被冤者对投票者记仇（E），异形翻车时给保过他的人回溯（下段保留） */
        if(!wasAlien)emoAdd(cand,vi,A.voterEmo,'voted_me');
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
    function recordClaim(a,al){ const G=getG();
      if(!a||!al||!G)return;
      if(!a.mind)mindReset(a);
      const h=a.mind.claimHist||(a.mind.claimHist=[]);
      h.push({night:G.night,room:al.room,roomId:al.roomId||null});
      if(h.length>3)h.shift();
    }
    /* 辩护记账：谁替谁说过话（跨会议保留，翻身份后回溯用） */
    function defenseNote(def,tgt){ const G=getG();
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
    /* 目击强度的**情境抽样**（2026-11-05 二组）
       同一个动作，不同目击者记住的确定程度本来就不一样；但差别只能由
       **当时可观察的情境**决定，不能由性格、阵营或"谁更信谁"决定：
         · 当时有几个人在场 —— 人越多，每个人的注意力越被摊薄
         · 是否断电 —— 只剩轮廓和声音，细节记不实
         · 附近是否刚出过事 —— 注意力被现场拉走，事后回忆是残的
       返回夹在 [0.72, 1.10]：它是**证据强度**的修正，不是新的判定层，
       不会把任何人推过或拉下 `ALMOST.foeSus` 的门槛（门槛判定仍看累积与种类）。
       末尾那点抖动是「当时恰好注意到哪一部分」的抽样，不是硬加噪声：
       幅度 ±6%，量级由上面三条情境决定，不由随机数决定。 */
    function witnessCtxMul(x,y,nSeen){ const G=getG();
      let m=1;
      const n=Math.max(1,nSeen|0);
      if(n>1)m-=Math.min(0.16,(n-1)*0.04);
      if(G.lightState===2)m-=0.14;
      const now=evNow(), L=SKSanity.NIGHT.len, arr=G.events||[];
      let near=0;
      /* 事件流是**按时间追加**的：从尾部往前扫，超过 8 秒就停，
         不再每次广播都把上万个事件走一遍（1000 局会因此慢 50%）。 */
      for(let k=arr.length-1;k>=0;k--){
        const e=arr[k];
        if(!e)continue;
        if(e.night!==G.night){ if(e.night<G.night)break; else continue; }
        if(e.t==null)continue;
        const at=L-e.t;
        if(at>now)continue;
        if(now-at>8)break;
        if(e.x==null||e.y==null)continue;
        if(e.kind!=='knife'&&e.kind!=='bot_hit'&&e.kind!=='bot_down'&&
          e.kind!=='breaker'&&e.kind!=='sabotage')continue;
        if(Math.hypot(e.x-x,e.y-y)>8)continue;
        near++;
      }
      if(near)m-=Math.min(0.12,near*0.04);
      return m;
    }
    function witnessConfMul(x,y,nSeen){ const G=getG();
      const base=witnessCtxMul(x,y,nSeen);
      return Math.max(0.72,Math.min(1.10,base*(0.94+Math.random()*0.12)));
    }
    /* 把一次"正经行为"广播给所有**真的看得见**的活人（异形也会看见，但它不用）。
       radius 用行为发生点的真实目击半径，亮房远处的人也算数。 */
    function credBroadcast(actor,kind,x,y){ const G=getG();
      const w0=(SKSanity.WITNESS||{})[kind];
      if(!w0||!actor)return;
      const R=Math.max(6,Math.min(14,sightRangeAt(x,y)));
      const seen=[],foes=[];
      for(const w of G.agents){
        if(w===actor||!w.alive||w.downed||w.detained||!w.mind)continue;
        if(attention(w)!=='online')continue;
        if(Math.hypot(w.x-x,w.y-y)>R)continue;
        if(!aiCanSee(w,x,y,R))continue;
        /* 一体两面（2026-11-05 用户裁定）：同一个动作 —— 人类目击者加**信任分**，
           异形目击者加**同等数值的敌对分**。分值必须一样，否则"换个视角看同一件事"
           就是两套账。已经认出的队友除外：异形知道自己人，这不算读心。 */
        if(w.alien){ if(!isMate(w,actor.i))foes.push(w); continue; }
        seen.push(w);
      }
      const nAll=seen.length+foes.length;
      /* 2026-11-05 二组：以前这一圈人都拿**完全相同**的 w0。
         现在按当时的可见情境**各自抽样** —— 同一场演出，站在近处没被挡的人记得更实，
         断电时旁边又刚出过事的人只记得"他好像干了点什么"。
         情境因子每场算一次，抽样每人各自一次（只有抽样是随机的，量级由情境定）。 */
      const base=witnessCtxMul(x,y,nAll);
      const jit=function(){return Math.max(0.72,Math.min(1.10,base*(0.94+Math.random()*0.12)));};
      /* 一体两面的**同一笔写入**（2026-11-21 两轴合成收口）：
         人类与异形目击者记同一方向的 T 加分（"他干了件正经事"），
         敌对方向在读出端按阵营各自导出 —— 人类看 T 负端（beliefOf），
         异形看 T 正端（axisThreat：越像人类越是目标）。
         旧写法给异形观察者走 susAdd（T 负端），方向是反的：
         异形看见有人做任务，结论应是"更像船员 = 更优先处理"，
         记成"更可疑"等于把目标越推越远。 */
      for(const w of seen.concat(foes)){
        /* 2026-11-22「错误率扩散到合法行动」：所有正经行为的信任写入都可能记错人 ——
           有 10~20% 概率把这份记忆挂到同舱另一名成员头上（人类目击者记错好人、
           异形目击者记错"谁像船员"）。确证档 misIdPick 不动，这里只在 credBroadcast 生效。 */
        const misAct=actionMisIdPick(w,actor.i,x,y);
        const tgt=misAct?misAct.i:actor.i;
        if(misAct&&G.simStats)G.simStats.actionMisWrites=(G.simStats.actionMisWrites||0)+1;
        /* 目击拿子弹 → 小幅恐慌情绪（2026-11-21 用户裁定）；归属跟随混淆后的 tgt */
        if(kind==='lootBullet'&&SKSanity.EMOTE)
          emoAdd(w,tgt,SKSanity.EMOTE.lootBulletPanic||-20,'panic_loot');
        const v=w0*jit();
        /* 2026-11-21 平衡修（去透视）：假装做任务 / 假装维修对**远处目击者**就是"做任务"
           （+15 表面分）；只有 2.5 格内才看得穿（−25，why='fakeWork'）。
           旧实现让所有目击者一律记 −25 —— 等于引擎替目击者判断"这是假的"，
           异形每晚 2~3 次假动作就被全场记死（100 局异形 0%）。 */
        if((kind==='fakeWork'||kind==='fakeRepair')&&Math.hypot(w.x-x,w.y-y)>2.5){
          credAdd(w,tgt,SKSanity.WITNESS.taskDoing*jit(),'taskDoing');
          continue;
        }
        if(kind==='taskDoing'){
          /* 同夜同观察者对同一人最多 2 次（沿用"去重"口径）——
             否则一晚 4 个任务 ×15 直接顶到准-确证人类线（100 局实测） */
          const K='td:'+tgt;
          w._tdN=w._tdN||{};
          w._tdN[G.night]=w._tdN[G.night]||{};
          const n=w._tdN[G.night][K]||0;
          if(n>=2)continue;
          w._tdN[G.night][K]=n+1;
        }
        if(kind==='lootBullet'){
          /* 负分行为（拿子弹）：走 susAdd 留 why 依据，会议里可据此质疑 */
          susAdd(w,tgt,-v,'loot_bullet',{kind:'loot_bullet',x:x,y:y,
            room:roomIdAt(x,y),conf:0.6,src:'sight',subj:tgt});
        }else credAdd(w,tgt,v,kind);
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
       用户裁定：人类近身 **2.3 格**（2026-11-05 由 2.8 收窄）、异形暗区近身 **3.5 格**
       （旧版只能写成 `HUMAN_DARK_R × 10/9 ≈ 3.11`，改一次要反推乘法，现在直接给数值）。
       异形不再有 360° 远视野，AI 的视距上限也与人类统一。 */
    const SGT=SKSanity.SIGHT;
    const HUMAN_LIGHT_R=SGT.humanLightR;
    const HUMAN_DARK_R=SGT.humanDarkR;               /* 人类近身圆视野 */
    const ALIEN_DARK_R=SGT.alienDarkR;               /* 异形近身圆视野（唯一调参点） */
    /* ================= 注意力三态（2026-11-05 · A 批前置）=================
       用户裁定：小游戏替代站桩，**正在做小游戏的人视觉被 UI 遮住**，听觉保留。
       attention(actor) 是所有「t 时刻看见 X」的前置条件，只有三态：
         'suspend' 会议 / 结算 / 死亡 / 倒地 / 拘留 —— 不产生任何新感知
         'ui'      小游戏 / 监控 / 破坏选舱 / 管道选点 —— **视觉归零，听觉保留**
         'online'  正常
       口径：它只回答「此刻能不能**看见**」，不回答「听见了什么」，也不持有任何分数。
       禁止写成第二个 sus：三态是闸门，不是权重。 */
    function attention(a){ const G=getG();
      if(!a)return 'suspend';
      if(!a.alive||a.downed||a.detained)return 'suspend';
      if(!G||G.over||G.meet)return 'suspend';
      /* 玩家侧的全屏遮罩类交互 */
      if(a===G.me&&(G.camView||G.inspect||G.sabPick||G.pipePick))return 'ui';
      /* 站桩动作（B 批会换成小游戏，状态口径不变） */
      if(a.doing>0)return 'ui';
      return 'online';
    }
    /* 能不能"看见"（R20.4：濒死被拖动期间仍有视野）。
       attention 是"注意力是否在线"，濒死一律 suspend —— 那套判据服务的是
       "他此刻有没有在盯人 / 做动作"，不能直接拿来当感知开关。玩家濒死时
       迷雾照常按 visibleAt 算，看得见周围；AI 被拖走却什么都不记，
       就是 R20.2 说的性能差异。这里单开一条：被拖的濒死者仍可观察。 */
    function canObserve(a){ const G=getG();
      if(a&&a.downed&&a.draggedBy!=null)return true;
      return attention(a)==='online';
    }
    /* ---- 唯一视野判据（2026-11-06 用户裁定）----
       玩家 visibleAt 与 AI aiCanSee 必须走同一套规则，不再有"AI 暗处 8 格 /
       从舱外看进亮房 / 全亮时无视朝向"这些玩家没有的视力。
       规则顺序与玩家完全一致：
         ① 同亮舱整间 / 同亮走廊整条 → 可见（不看距离、不看朝向）
         ② 亮舱看相连走廊 → 可见，但要 LOS
         ③ 近身圆（人类 2.3 / 异形 3.5）→ 可见，要 LOS
         ④ 手电锥：7 格、60°（半角 30°）→ 可见，要 LOS
       同一个函数同时服务玩家与 AI；AI 只是把"鼠标朝向"换成自己的
       目标 / 路径 / 动作朝向（agentAimAng）。谁也不能比谁多看一眼。 */
    function observerVisionAt(ox,oy,alien,aimAng,x,y){ const G=getG();
      const r=roomAt(ox,oy);
      const oz=litZoneAt(ox,oy);
      if(oz){
        const tz=litZoneAt(x,y);
        /* 2026-11-18 用户裁定：亮区"整间可见"必须受**玩家视口**约束。
           玩家屏幕只有 21 格宽（VIEW_TILES）、纵向约 13 格；42×16 的会议室
           隔着半间的人玩家根本看不见（实机截图确认），AI 也不能看 ——
           否则又回到"AI 和玩家玩的不是同一个游戏"。
           用矩形而不是圆：矩形正好贴合屏幕，玩家的屏幕四角不会无故变黑。 */
        const inView=Math.abs(x-ox)<=SGT.litViewHalfW&&Math.abs(y-oy)<=SGT.litViewHalfH;
        if(tz===oz)return inView;
        if(oz[0]==='r'&&tz&&tz[0]==='c'&&
          corrJoinsRoom(r,M.corridors[+tz.slice(2)])&&inView&&
          losNow(ox,oy,x,y))return true;
      }
      const d=Math.hypot(x-ox,y-oy);
      if(d<=(alien?ALIEN_DARK_R:HUMAN_DARK_R)&&losNow(ox,oy,x,y))return true;
      if(d>HUMAN_LIGHT_R)return false;
      if(!losNow(ox,oy,x,y))return false;
      const ang=Math.atan2(y-oy,x-ox);
      let dd=Math.abs(ang-(aimAng||0)); if(dd>Math.PI)dd=2*Math.PI-dd;
      return dd<=Math.PI/6;
    }
    /* AI 的"手电朝向"：动作 > 当前目标 > 下一段路径 > 移动方向 > 上一次朝向。
       玩家的朝向是鼠标，AI 没有鼠标；这是唯一允许两侧不同的输入，
       判定规则本身仍然完全一致。 */
    /* 红光的独立可见判定（2026-11-21 用户裁定）：
       近身圆（人类 2.3 / 异形 3.5）+ 手电锥（HUMAN_LIGHT_R 格、±30°），
       两者都要 LOS，**不看"亮房整间"**。 */
    function redSpotVisible(w,x,y){ const G=getG();
      if(!w)return false;
      const d=Math.hypot(w.x-x,w.y-y);
      if(d<=HUMAN_DARK_R&&losNow(w.x,w.y,x,y))return true;
      if(d>HUMAN_LIGHT_R)return false;
      if(!losNow(w.x,w.y,x,y))return false;
      const ang=Math.atan2(y-w.y,x-w.x);
      let dd=Math.abs(ang-agentAimAng(w));
      if(dd>Math.PI)dd=2*Math.PI-dd;
      return dd<=Math.PI/6;
    }
    function agentAimAng(a){ const G=getG();
      if(!a)return 0;
      if(a===G.me&&!G.simMode&&!G.spectMode&&G.aimX!=null)
        return Math.atan2(G.aimY-a.y,G.aimX-a.x);
      if(a.act&&Number.isFinite(a.act.ang))return a.act.ang;
      if(a.target&&a.target.alive){
        /* 朝向只指"我知道的那格"：有快照用快照，无快照（夹具直写 target）退回实时坐标 */
        const tp=a._tgtPos||a.target;
        return Math.atan2(tp.y-a.y,tp.x-a.x);
      }
      if(a.path&&a.path.length){
        const p=a.path[0];
        return Math.atan2(p[1]-a.y,p[0]-a.x);
      }
      if(a._aimAng!=null)return a._aimAng;
      return 0;
    }
    function aiCanSee(a,x,y,_maxD){ const G=getG();
      if(!a)return false;
      /* maxD 只保留为调用方"我至少关心这么远"的历史参数，不再扩视野；
         AI 能不能看见只由 observerVisionAt 决定。 */
      return observerVisionAt(a.x,a.y,a.alien,agentAimAng(a),x,y);
    }
    function aiHear(kind,x,y,rad,extra){ const G=getG();
      if(!G||G.over||G.meet)return;
      extra=extra||{};
      /* 2026-11-21 用户裁定：异形专属行为（刀/管道/破坏/停摆机器人）声音半径 −50%；
         枪声 / 喊叫 / 门 / 电闸等双方都会发出的声音不折。 */
      const alienOnly=(kind==='knife'||kind==='pipe'||kind==='sabotage'||kind==='bot');
      if(alienOnly&&SKSanity.SOUND&&SKSanity.SOUND.alienActMul)
        rad=rad*SKSanity.SOUND.alienActMul;
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
          subj:extra.subj!=null?extra.subj:(kind==='shot'?SKT2AI.soundSubject(a,x,y):null),
          victim:vid,conf:+conf.toFixed(2),src:'sound'};
        evPush(a,ev);
        const w=EV_W['heard_'+kind];
        if(w&&ev.subj!=null)susAdd(a,ev.subj,Math.min(SKSanity.HEARD.cap,w*80*conf),'heard_'+kind,ev);
      }
    }
    function envNotice(kind,x,y,conf){ const G=getG();
      if(!G||G.over)return;
      for(const a of G.agents){
        if(!a.alive||a.downed||a.detained)continue;
        evPush(a,{kind:'env_'+kind,x,y,room:roomIdAt(x,y),
          conf:conf==null?0.5:conf,src:'env'});
      }
    }
    /* 视觉目击：保留旧的 suspect 契约，同时写入证据与嫌疑分。
       异形不作为目击者写入，避免借证人表反推队友身份。 */
    /* 2026-11-06 用户裁定：看见“任务没做完就跑开”要留下身份线索。
       2026-11-21 用户第三批裁定：中断维修与中断任务同罚（−25），fake 暴露 −25。
       伪任务（_doing='fake'）只有异形会做：人类 AI 提高怀疑，异形 AI 直接确认队友；
       真任务/维修中途离开（被威胁/主动放弃）只给人类 AI 一个 ≤25 的扣分，
       不写 known、不认队友。 */
    function noticeTaskAbandon(actor,kind){ const G=getG();
      if(!G||G.over||G.meet||!actor)return;
      const fake=kind==='fake';
      /* 2026-11-21 用户裁定：中断维修（fix）与中断任务同罚（−25）；
         假维修/假任务的暴露广播沿用行为侧标签（近距离看穿才记负分）。 */
      const isFix=kind==='fix';
      const evKind=fake?'saw_fake_task':(isFix?'saw_fix_abandon':'saw_task_abandon');
      const WIT=SKSanity.WITNESS||{};
      const wgt=fake?(WIT.fakeWork!=null?WIT.fakeWork:EV_W.saw_fake_task)
                    :(isFix?(WIT.fixAbandon!=null?WIT.fixAbandon:WIT.taskAbandon)
                    :(WIT.taskAbandon!=null?WIT.taskAbandon:EV_W.saw_task_abandon));
      for(const w of G.agents){
        if(w===actor||!w.alive||w.downed||w.detained)continue;
        if(attention(w)!=='online')continue;
        const R=Math.max(6,HUMAN_LIGHT_R,sightRangeAt(w.x,w.y));
        if(Math.hypot(w.x-actor.x,w.y-actor.y)>R)continue;
        if(!aiCanSee(w,actor.x,actor.y,R))continue;
        if(w.alien){
          if(fake)markMate(w,actor,'saw_fake_task');
          continue;
        }
        if(w.mind&&w.mind.known&&w.mind.known[actor.i])continue;
        const ev={kind:evKind,x:actor.x,y:actor.y,room:roomIdAt(actor.x,actor.y),
          subj:actor.i,conf:fake?0.8:0.45,src:'sight'};
        evPush(w,ev);
        /* 2026-11-21 修换算：wgt 已是分（WITNESS.fakeWork/taskAbandon = −25），
           旧代码再 ×80 变成 −2000/次（实测 −2400/局），全场 T 崩盘。 */
        susAdd(w,actor.i,Math.abs(wgt),evKind,ev);
        if(fake)w.suspect=actor.i;
      }
    }
    function noticeAction(actor,x,y,rad,kind,victim){ const G=getG();
      if(!G||!actor)return;
      /* 2026-11-21 用户裁定：破坏不是"身份级证据" ——
         目击者看到的是"机器突然坏了"，不知道是谁动的手（除非舱里只有他一个人）。
         所以 sabotage 从确证名单里摘出来，单独走「全舱怀疑」。 */
      const sabAct=!!actor.alien&&kind==='sabotage';
      const alienAct=!!actor.alien&&(kind==='knife'||kind==='pipe'||kind==='bot');
      /* 电闸的两种操作语义完全不同（2026-11-01 用户裁定）：
         拉闸断电 → **身份级证据**，人类看见就锁死"他是异形"；
         合闸复电 → **不确证人类**（异形也会合闸伪装），只加正向信任 cred。
         两者都靠 G.lightState 判定（pullBreaker 已先更新状态再广播）。 */
      const breakerOff=kind==='breaker'&&G.lightState===2;
      const breakerOn=kind==='breaker'&&G.lightState!==2;
      /* 2026-11-21 用户第三批裁定：目击分值走 WITNESS 表（单位=分）；
         拉闸从确证名单摘除（−80 强疑点），红光顶上确证位（−999）。 */
      const WIT=SKSanity.WITNESS||{};
      /* 拉闸（lightState===2）→ WIT.breakerPull −80；合闸在本函数不记负分
         （credBroadcast('breakerOn') 已 +80，两处各管一半） */
      const wt=(kind==='breaker'&&breakerOff)?(WIT.breakerPull!=null?WIT.breakerPull:0.2)
        :('saw_'+kind==='saw_bot')?(WIT.bot!=null?WIT.bot:0.2)
        :(('saw_'+kind==='saw_red')?(WIT.red!=null?WIT.red:0.2)
        :(('saw_'+kind==='saw_detain')?(WIT.detain!=null?WIT.detain:0.2)
        :(kind==='breaker'&&breakerOn)?0
        :(EV_W['saw_'+kind]||0.2)));
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
        /* 2026-11-06 用户裁定：人类 AI 的目击范围 = **它自己此刻的真实可见视野**，
           与玩家 visibleAt 共用 observerVisionAt（亮区整片 / 近身圆 / 7 格手电锥 / LOS）。
           这里的 wr 只是"至少关心这么远"的预筛上界；能不能看见由 aiCanSee 决定。 */
        const wr=Math.max(rad,HUMAN_LIGHT_R,sightRangeAt(w.x,w.y));
        if(dw>wr)continue;
        if(!aiCanSee(w,x,y,wr))continue;
        /* 2026-11-21 用户裁定「抓现行率大幅度上升」：视野 + 屏幕内（aiCanSee 通过）
           即写确证 —— 旧的 4.5 格贴脸线作废；隔墙/背光本来就进不了这层。
           2026-11-22 诊断旋钮 CONFIRM.useDist=true 时恢复 11-19 的 4.5 格分级。 */
        const CF=SKSanity.CONFIRM||{};
        const near=CF.useDist?(dw<=(CF.nearR||4.5)):true;
        const ev={kind:'saw_'+kind,x,y,room:roomIdAt(x,y),subj:actor.i,
          victim:victim?victim.i:null,conf:near?0.95:0.6,src:'sight'};
        if(!near)ev.far=1;
        /* 处决：只读该目击者自己的 known，不读真值 */
        const justified=kind==='shot'&&victim&&w.mind.known&&w.mind.known[victim.i];
        if(justified)ev.justified=1;
        evPush(w,ev);
        if(kind==='shot'&&victim){
          /* 2026-11-21 用户裁定：目击开枪 → 恐慌情绪 E（听到枪声不算，只走 aiHear 注意力）；
             打死异形 +60 / 打死人类 −30（目击者按自己的 known 结算，不读真实阵营） */
          emoAdd(w,actor.i,SKSanity.EMOTE.panicShot,'panic_shot');
          SKT2AI.shotCred(w,actor,victim).forEach(c=>credAdd(w,actor.i,c.w,c.reason));
        }
        if(!justified&&!breakerOn){
          /* 2026-11-21 用户裁定「混淆系统」：目击记分也可能认错人 ——
             同舱 ≥2 人时按 15%+5%/人 的概率把目标换成舱内另一名成员。
             证明链（known）与嫌疑分用同一个混淆结果，避免"分数记错人、确证记对人"。 */
          const misS=misIdPick(w,actor.i,x,y,Math.max(dw+2,6));
          const sidx=misS?misS.i:actor.i;
          susAdd(w,sidx,wt*(near?1:(SKSanity.CONFIRM.farSusMul||1)),'saw_'+kind,
            Object.assign({},ev,{subj:sidx}));
          if(misS)misIdBump(misS,actor);
          if(alienAct||breakerOff||kind==='shot'||kind==='detain')w.suspect=sidx;
        }
        /* 异形专属行为（出刀 / 钻管道 / 破坏设备 / 停摆机器人 / **拉闸断电**）
           是身份级证据：**近距离**看见就等于确证，不再只是加一点嫌疑分。
           开枪、拘留、合闸人类也会做，不算确证。 */
        /* 2026-11-21 用户裁定：拉闸降为 −80 强疑点，不再写 known；
           硬确证名单只剩异形专属动作（出刀/钻管道/破坏/红光）。 */
        if(sabAct&&near&&!w.alien){
          /* 2026-11-21 用户裁定：破坏发生在"进房间之后"，目击者只看到机器坏了，
             **不可能知道是谁动的手**（哪怕当时舱里只有一个人 —— 也可能是别人刚走）。
             所以破坏一律**不确证任何人**，只给"当时在该舱的全体"记小额嫌疑，
             真凶混在人群里；他要想不被怀疑，就得挑没人的时候（那时也没人看见）。
             这条让 saw_sabotage 从 known 里彻底消失（原本 ~1.0 次/局）。 */
          const rid2=roomIdAt(x,y);
          const allIn=G.agents.filter(h=>h&&h!==w&&h.alive&&!h.downed&&!h.detained&&
            roomIdAt(h.x,h.y)===rid2);
          for(const h of allIn){
            susAdd(w,h.i,Math.abs(SKSanity.MAPPING.roomSus),'saw_sabotage_room',ev);
          }
          if(G.simStats)G.simStats.sabNoConfirm=(G.simStats.sabNoConfirm||0)+1;
        }else if(alienAct&&near&&!w.alien){
          /* 目击认错人（用户 2026-11-07 裁定）：只偏移 known 指向的人，
             已经落下的 sus 不动 —— 「我确信是 X」与「Y 当时也让我不舒服」可以同时存在。 */
          const mis=misIdPick(w,actor.i,x,y,Math.max(dw+2,6));
          const kidx=mis?mis.i:actor.i;
          const kobj=mis||actor;
          w.mind.known[kidx]={t:ev.t,kind:'saw_'+kind,room:ev.room,conf:0.95};
          trustCert(w,kidx,true);   /* 一切分数化：确证 = T −999 */
          trustMirror(w,kidx);
          w.mind.sus[kidx]=1;
          knownBump('saw_'+kind, !!kobj.alien);
          if(mis)misIdBump(mis,actor);
          w.mind.susNight=w.mind.susNight||{};
          w.mind.susNight[kidx]=G.night;
          w.mind.why[kidx]=(w.mind.why[kidx]||[]).concat([{
            w:1,reason:'确证异形',kind:'saw_'+kind,night:G.night,t:ev.t,x,y,room:ev.room}]).slice(-8);
          /* 硬覆盖：亲眼看见的事实盖掉所有统计性印象（删 almost.friend、清 cred） */
          knownOverride(w,kidx);
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
          /* 2026-11-18：删掉 `hypot>rad` 的固定格数截断 —— 队友识别只看"他此刻看得见吗"
             （R5.3 同一条判据）。原来 6 格外即使在亮房整间可见也认不出队友，
             而 5 格外背光站着反而算"看见了"。 */
          if(!aiCanSee(w,x,y))continue;
          markMate(w,actor,kind);
        }
      }
      /* 看见有人合闸（breakerOn）：2026-11-21 两轴合成收口 ——
         这条信息由 credBroadcast('breakerOn') 统一广播，人类与异形目击者
         记同一方向的 T 加分（"他合了闸 = 更像船员"），异形的杀伤优先度
         在读出端从 T 正端导出（见挑目标评分的 hi 项）。不再单设 humanT 第三本账。 */
      /* 异形自己知道谁在视线里看见了它；这是现场感知，不是读取对方内心 */
      if(actor.alien){
        if(!actor.mind)mindReset(actor);
        for(const w of G.agents){
          if(w===actor||w.alien||!w.alive||w.downed)continue;
          if(!aiCanSee(actor,x,y)||!aiCanSee(w,x,y))continue;
          actor.mind.seenBy[w.i]={t:evNow(),conf:0.9};
        }
      }
    }
    function witnessAlienAction(actor,x,y,rad,kind,victim){ const G=getG();
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
    function witnessDetain(actor,x,y,rad){ const G=getG();
      if(!G||!actor)return 0;
      const wt=(SKSanity.WITNESS&&SKSanity.WITNESS.detain!=null)?SKSanity.WITNESS.detain:(EV_W.saw_detain||0.6);
      const R=rad==null?10:rad;
      let n=0;
      for(const w of G.agents){
        if(w===actor||!w.alive||w.downed||w.detained)continue;
        if(attention(w)!=='online')continue;
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
    function isMate(a,i){ const G=getG();
      return !!(a&&a.alien&&a.mates&&a.mates[i]);
    }
    /* 「玩家认出的异形队友」单一判据（2026-11-22）：玩家是异形 + 对方是异形 +
       玩家已把对方记进私有 mates（trio 开局互认 / 局中 markMate 认出）。
       地图头顶名牌（◆同族）与投票名单共用这一条，两处不再各写一套 —— 红线 15。
       mates 只存在于异形的私有表：人类/旁观玩家为空 ⇒ 不会给自己人误标。 */
    function isMyMate(a){ const G=getG();
      return !!(G&&G.me&&G.me.alien&&a&&a.alien&&G.me.mates&&G.me.mates[a.i]);
    }
    /* 「这人像人类」（2026-11-21 并轴）：不再单设 mind.humanT 第三本账。
       异形目击正经行为与人类走同一个 T 加分（credBroadcast 已统一），
       读出端直接取 T 正端视图（0~1）——「越像船员越优先处理」。
       不是身份结论：绝不写 mates / known，也不会让人被"排除嫌疑"。 */
    function humanishOf(a,i){ const G=getG();
      return Math.max(0,SKT2AI.trustScore(a,i));
    }
    /* 确证写入计数（只统计；按证据类型拆分，用来回答「哪条通道真的在产出确证」） */
    /* ---- 目击认错人（2026-11-07 用户裁定）----
       「确证加 20% 偏移，仅限目击范围，只在看得见的人里认错。」
       候选池严格由**目击者此刻的可见性**决定：排除自己与真正的行为人，
       距离现场 ≤ sceneR，且 aiCanSee 通过。池子空 → 返回 null（看不见的人不会被认错）。
       不读阵营表、不读别人记忆，纯可见性采样。 */
    function misIdCloudRate(tiers,lo,hi,inCount,M,mul){ const G=getG();
      const k=Math.max(0,inCount-(M.minPeople||2));
      const conc=1+k*(M.cloudConc!=null?M.cloudConc:0.6);
      const u=Math.pow(Math.random(),1/conc);
      const raw=tiers[Math.min(tiers.length-1,Math.floor(u*tiers.length))];
      const m=mul||1;
      return Math.min(1,Math.max(lo*m,Math.min(hi*m,raw*m)));
    }
    function misIdCloseMul(inRoom,w,realIdx,ex,ey,M){ const G=getG();
      const closeR=M.closeR!=null?M.closeR:1.5;
      const actor=G.agents[realIdx];
      const ax=actor?actor.x:ex, ay=actor?actor.y:ey;
      if(Math.hypot(w.x-ax,w.y-ay)<=closeR)return M.closeMul!=null?M.closeMul:2.0;
      for(const o of inRoom){
        if(o.i===realIdx)continue;
        if(Math.hypot(o.x-ax,o.y-ay)<=closeR)return M.closeMul!=null?M.closeMul:2.0;
      }
      return 1.0;
    }
    function misIdPick(w,realIdx,ex,ey,sceneR){ const G=getG();
      /* 2026-11-21 用户裁定「混淆系统」：
         同一舱室 ≥minPeople(2) 人时，base(15%) + 每人 perExtra(5%) 的认错概率；
         误认对象**仅限本舱室的所有成员之一**（排除目击者自己与真凶），
         不再按 6 格半径任意挑人。 */
      const M=SKSanity.MISID||{};
      if(!G||!w||!w.mind)return null;
      const rid=roomIdAt(ex,ey);
      const inRoom=[];
      for(const o of G.agents){
        if(!o||!o.alive||o.downed||o.detained)continue;
        if(roomIdAt(o.x,o.y)!==rid)continue;
        inRoom.push(o);
      }
      if(inRoom.length<Math.max(2,M.minPeople||2))return null;
      /* 2026-11-22「概率云」：每次目击从档位云抽样一次错误率，而非线性定值。
         base≥1 → 强制认错（A/B）；base≤0 → 关闭（A/B，含门禁的 -1）；
         否则走云：conc=1+k*cloudConc（k=超出 minPeople 的人数），
         抽样 u^(1/conc) 再映射到 tiers，人越多越集中在 cap 高档。 */
      const base=M.base!=null?M.base:0.15;
      let chance;
      if(base>=1)chance=1;
      else if(base<=0)chance=0;
      else{
        const tiers=(M.tiers&&M.tiers.length)?M.tiers:[0.05,0.10,0.15,0.20,0.25,0.30,0.35];
        const cap=M.cap!=null?M.cap:0.35;
        const mul=misIdCloseMul(inRoom,w,realIdx,ex,ey,M);
        chance=misIdCloudRate(tiers,0,cap,inRoom.length,M,mul);
      }
      if(Math.random()>=chance)return null;
      const cand=inRoom.filter(o=>o!==w&&o.i!==realIdx);
      if(!cand.length)return null;
      return cand[Math.floor(Math.random()*cand.length)];
    }
    /* 2026-11-22「错误率扩散到合法行动」：credBroadcast 覆盖的所有正经行为
       （做任务/修闸/拖人/拿补给/救人/合闸…）目击时也可能把功劳记错人。
       概率云只在 MISID.action 的 lo~hi（默认 10%~20%）之间浮动，与确证档分开。
       候选池规则与 misIdPick 一致：仅限同舱、排除目击者本人与真正行为者。
       门禁兼容：action.on=false 或 MISID.base<=0 时整体关闭。 */
    function actionMisIdPick(w,realIdx,ex,ey){ const G=getG();
      const M=SKSanity.MISID||{}, A=M.action||{};
      if(A.on===false)return null;
      if((M.base!=null?M.base:0.15)<=0)return null;
      if(!G||!w||!w.mind)return null;
      const rid=roomIdAt(ex,ey);
      const inRoom=[];
      for(const o of G.agents){
        if(!o||!o.alive||o.downed||o.detained)continue;
        if(roomIdAt(o.x,o.y)!==rid)continue;
        inRoom.push(o);
      }
      if(inRoom.length<Math.max(2,M.minPeople||2))return null;
      const tiers=(A.tiers&&A.tiers.length)?A.tiers:[0.10,0.12,0.14,0.16,0.18,0.20];
      const lo=A.lo!=null?A.lo:0.10, hi=A.hi!=null?A.hi:0.20;
      const mul=misIdCloseMul(inRoom,w,realIdx,ex,ey,M);
      const chance=misIdCloudRate(tiers,lo,hi,inRoom.length,{minPeople:M.minPeople,cloudConc:A.cloudConc},mul);
      if(Math.random()>=chance)return null;
      const cand=inRoom.filter(o=>o!==w&&o.i!==realIdx);
      if(!cand.length)return null;
      return cand[Math.floor(Math.random()*cand.length)];
    }
    function misIdBump(wrong,real){ const G=getG();
      if(!G||!G.simStats)return;
      G.simStats.misIdWrites=(G.simStats.misIdWrites||0)+1;
      if(wrong&&wrong.alien)G.simStats.misIdToAlien=(G.simStats.misIdToAlien||0)+1;
      else G.simStats.misIdToHuman=(G.simStats.misIdToHuman||0)+1;
      if(real&&!real.alien)G.simStats.misIdRealHuman=(G.simStats.misIdRealHuman||0)+1;
    }
    function knownBump(kind,targetAlien){ const G=getG();
      if(!G||!G.simStats)return;
      G.simStats.knownWrites=(G.simStats.knownWrites||0)+1;
      /* 审计口径（2026-11-06）：确证到底压在真异形身上，还是误伤了人类。
         唯一可能误写人类的入口是「人类拉闸断电被近距离看见」——它和异形拉闸
         在目击者眼里本来就不可区分；这里只统计，不改判定。 */
      if(targetAlien)G.simStats.knownWritesAlien=(G.simStats.knownWritesAlien||0)+1;
      else G.simStats.knownWritesHuman=(G.simStats.knownWritesHuman||0)+1;
      const by=G.simStats.knownBy||(G.simStats.knownBy={});
      by[kind]=(by[kind]||0)+1;
    }
    function markMate(observer,actor,kind){ const G=getG();
      if(!observer||!actor||observer===actor||!observer.alien)return;
      if(!observer.mates)observer.mates={};
      observer.mates[actor.i]={t:evNow(),kind:kind||'alien'};
    }
    function bodyWound(b){ const G=getG();
      if(!b)return '未知';
      if(b.alive&&b.downed)
        return b.woundCause==='shot'?'枪伤 · 仍在渗血':
          (b.woundCause==='knife'?'刀伤 · 仍在渗血':'重伤 · 仍在渗血');
      if(!b.alive)return causeName(b.deathCause);
      return '无伤';
    }
    /* 搜尸：查看取证不自动拿；手动取物走 takeBodyLoot；AI 仍自动取。 */
    function takeBodyLoot(b){ const G=getG();
      const me=G&&G.me;
      if(!me||!b||G.over||G.meet)return;
      if(!me.alive||me.downed||me.detained){toast('你现在不能拿取物资');return;}
      const got=lootBody(me,b),bp=bodyPos(b);
      logEvent('loot',{actor:me.i,victim:b.i,room:bp?roomIdAt(bp[0],bp[1]):null,bullet:got.bullet,medkit:got.medkit,qual:got.qual});toast(lootText(got,b));
      if(G.inspect&&G.inspect.agent===b)openBodyCard(b);
    }
    /* AI 判断值不值得为物资停下来搜一次（只在真正的尸体上摸） */
    function aiWantsLoot(a,b){ const G=getG();
      if(!a||!b)return false;
      if(a.alien&&isMate(a,b.i))return false;
      if(b.alive&&!b.downed)return false;
      if((a.bullet|0)<1&&(b.bullet|0)>0)return true;
      if((a.medkit|0)<1&&(b.medkit|0)>0)return true;
      if((a.qual|0)<2&&((b.qual|0)>0||(b.qualPending|0)>0))return true;
      return false;
    }
    function bodyInfo(b){ const G=getG();
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
    function observeBody(a,v){ const G=getG();
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
        /* 2026-11-21 修两处口径缺陷（用户质疑「靠近尸体扣分」）：
           ① 受害者本人不算嫌疑人（他 8 秒前还活着，当然在同房间）；
           ② 加距离判据：只有**尸体 5 格内**出现过的人才算"最后在现场附近"，
              旧口径只判同房间 + 8 秒，房间对角 20 格做任务的人也被记一笔。 */
        if(e.subj===v.i)continue;
        if(e.room!==bi.room)continue;
        if(Math.abs(e.t-ev.t)>SKSanity.ALIBI.core)continue;
        if(e.x!=null&&e.y!=null&&bi.pos&&
          Math.hypot(e.x-bi.pos[0],e.y-bi.pos[1])>5)continue;
        /* 同一目击者对同一目标的近尸嫌疑每夜只记一次 */
        if(!((a.mind.why&&a.mind.why[e.subj]||[]).some(x=>x.reason==='near_body'&&x.night===G.night)))
          susAdd(a,e.subj,SKSanity.MAPPING.nearBody,'near_body',e);
      }
    }


    return {
      logEvent,
      recordFrame,
      replayData,
      reliaOf,
      reliaAdd,
      emoAdd,
      grudgeAdd,
      trustAdd,
      emotionOf,
      isPatron,
      credAdd,
      topCred,
      obeyTrustMul,
      warmAdd,
      warmMate,
      settleAccountability,
      recordClaim,
      defenseNote,
      witnessCtxMul,
      credBroadcast,
      attention,
      canObserve,
      observerVisionAt,
      redSpotVisible,
      agentAimAng,
      aiCanSee,
      aiHear,
      envNotice,
      noticeTaskAbandon,
      noticeAction,
      witnessAlienAction,
      witnessDetain,
      isMate,
      isMyMate,
      humanishOf,
      misIdPick,
      actionMisIdPick,
      misIdBump,
      knownBump,
      markMate,
      bodyWound,
      takeBodyLoot,
      aiWantsLoot,
      bodyInfo,
      observeBody
    };
  }

  const EV_W = {
    saw_knife: 0.75, saw_shot: 0.55, saw_pipe: 0.7, saw_sabotage: 0.65,
    saw_bot: 0.6, saw_breaker: 0.32, saw_drag: 0.22, saw_drag_away: 0.45, saw_detain: 0.6, saw_red: 0.85,
    saw_fake_task: 0.30, saw_task_abandon: 0.14,
    heard_knife: 0.18, heard_shot: 0.16, heard_scream: 0.22, heard_power: 0.14,
    heard_robot: 0.12, heard_pipe: 0.2, heard_door: 0.04, heard_detain: 0.6, heard_drag: 0.12,
    env_lights: 0.1, env_fault: 0.12, env_robot: 0.14,
  };
  const FRAME_DT = 0.5;

  global.SKCognition = { create, EV_W, FRAME_DT };
})(typeof window !== 'undefined' ? window : globalThis);
