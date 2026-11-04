/* ==== ARCH NODE · 架构节点标注（根 ARCHITECTURE.md） ====
 * layer     : T2
 * domain    : AI 拟人化
 * definedBy : 目击 / 事件与证据 / 推测（嫌疑读值与时间窗）
 * truth     : js/t2/ai.js#SKT2AI
 * verify    : 全量门禁 / 蒙特卡洛
 * flag      : F  (F=现行事实 / N=规范裁定)
 * note      : 方案 A 第二批：认知链纯函数真源；状态沿用 _t.G()
 * ============================================================== */
/* 方案 A 第二批（2026-11-04）：AI 拟人化域 · 认知链读值与时间窗
   -------------------------------------------------------------
   真源：本文件。函数体与拆分前 js/game.js 逐行一致，仅两处取状态方式改变：
     · G.night  → global.SKV3._t.G().night（用户裁定沿用 _t.G()）
     · NIGHT    → SK.NIGHT.len（NIGHT 原本就等于 SKSanity.NIGHT.len）
   game.js 保留同名函数声明作薄委托，下游调用零改动。
   依赖：js/ai/sanity.js 必须先加载；不引依赖、不读 DOM、不复制状态。 */
(function (global) {
  'use strict';
  const SK = global.SKSanity;

  /* 嫌疑读值：跨夜留下的存量对**夜间行动**要打 0.7 折 ——
     否则天亮第一分钟就有人凭昨晚的旧印象去开枪（存量上限 0.45 仍然高于
     激进档的开枪门槛 0.36）。会议里的指控/投票读全额。 */
  function susOf(a, i, forNight) {
    const v = (a && a.mind && a.mind.sus && a.mind.sus[i]) || 0;
    if (!v) return 0;
    if (!forNight) return v;
    const n = (a.mind.susNight && a.mind.susNight[i]) || 0;
    if (n >= global.SKV3._t.G().night) return v;
    return v * SK.CARRY.nightReadSec;
  }

  function topSus(a, min, forNight) {
    if (!a || !a.mind) return null;
    let best = null, bi = null;
    for (const k in a.mind.sus) {
      const i = +k, s = susOf(a, i, forNight);
      if (s < (min == null ? 0.5 : min)) continue;
      if (best == null || s > best) { best = s; bi = i; }
    }
    return bi == null ? null : { i: bi, score: best, why: (a.mind.why[bi] || []).slice(-4) };
  }

  /* 案发口径的时间窗：死亡（或倒地）时刻 ±8 秒；没有尸体时退回默认回看窗口 */
  function crimeWindow(victim) {
    const t = victim ? (victim.alive ? (victim.downAt || 0) : (victim.deathAt || 0)) : null;
    if (t == null) return null;
    const ref = SK.NIGHT.len - Math.max(0, t);
    return { t0: Math.max(0, ref - SK.ALIBI.core), t1: ref + SK.ALIBI.core, tRef: ref };
  }

  /* ---- 方案 A 第 6 项（2026-11-04）：AI 拟人化域 · 认知链整组 ----
     23 个函数从 js/game.js 整组外提，组外函数依赖为 0，函数体逐行一致。
     仅三处取状态/常量方式改变：G → _t.G()、SKSanity/NIGHT → 量化表、MEM_MAX → 本地常量。
     game.js 保留同名局部别名直调，所有调用点零改动。 */
  const SKSanity = SK;
  const NIGHT = SK.NIGHT.len;
  const MEM_MAX = 64;

  function evNow(){
    const G=global.SKV3._t.G();
    return Math.max(0,NIGHT-(G?G.t:0));
  }

  function mindReset(a){
    const G=global.SKV3._t.G();
    if(!a)return;
    /* known 是**长期记忆**：亲眼确认的身份结论不随夜晚清空，
       后续每一场会议都会继续指控并投这个人（见 bestKnownTarget / startVote）。 */
    const keepKnown=(a.mind&&a.mind.known)||{};
    /* 情绪记忆跨会议保留、每场会议衰减 20%：AI 不是只按嫌疑分投票的机器，
       被谁咬过、被谁护过，会一直记得（衰减到 0.05 以下才忘）。 */
    const oldM=a.mind||{};
    const keepEmo=(o)=>{const out={};for(const k in (o||{})){if(o[k]>0.05)out[k]=o[k]*0.8;}return out;};
    /* cred（正向信任）跨夜保留，按 SKSanity.CRED.decay 慢衰减 ——
       洗白是长期投资，一夜做好事第二天就清零的话，伪装就没有意义了。 */
    const keepCred=(o)=>{
      const out={},d=SKSanity.CRED.decay,cap=SKSanity.CRED.cap;
      for(const k in (o||{})){const v=o[k]*d;if(v>0.04)out[k]=Math.min(cap,v);}
      return out;
    };
    /* ---- 嫌疑跨夜衰减（2026-11-01）----
       以前 `sus` 一夜清零：被看见三次可疑举动，天亮就全忘，AI 没有
       「这人一直很可疑」这个中间概念。现在分类型慢衰减，但有三条护栏：
       ① 目击类留得久（0.72），传闻类掉得快（0.45）——一句话不该和亲眼所见等价；
       ② 本夜完全没有新增证据 → 再 ×0.55（一次诬陷不该让人背一整局）；
       ③ 存量封顶 0.45（低于指控门槛 0.50），夜间行动读取时再 ×0.7。 */
    const S=SKSanity.CARRY;
    const SIGHT_RE=/^saw_/;
    const gn=G?G.night:1;
    const keepSus=()=>{
      const out={},oldSus=oldM.sus||{},oldWhy=oldM.why||{},oldNight=oldM.susNight||{};
      for(const k in oldSus){
        const v=oldSus[k]; if(!(v>0))continue;
        const why=oldWhy[k]||[];
        let sight=false;
        for(const w of why)if(w.kind&&SIGHT_RE.test(w.kind)){sight=true;break;}
        const fresh=(oldNight[k]!=null&&oldNight[k]>=gn-1);
        let nv=v*(sight?S.decaySight:S.decayHear);
        if(!fresh)nv*=S.staleMul;
        nv=Math.min(S.cap,nv);
        if(nv>=S.floor)out[k]=+nv.toFixed(3);
      }
      return out;
    };
    /* 只保留还有嫌疑的对象的理由，每个对象最多 whyKeep 条（且带 night，供新鲜度判定） */
    const keepWhy=(sus)=>{
      const out={},oldWhy=oldM.why||{};
      for(const k in sus){
        const arr=(oldWhy[k]||[]).slice(-S.whyKeep);
        if(arr.length)out[k]=arr;
      }
      return out;
    };
    const sus=keepSus();
    a.mind={mem:[],sus:sus,why:keepWhy(sus),susNight:keepSusNight(sus,oldM.susNight),alert:0,
      noise:null,seenBy:{},seenT:{},
      lastBody:null,tone:(a.i||0)%3,
      trust:keepEmo(oldM.trust),grudge:keepEmo(oldM.grudge),
      /* cred：**正向信任**——"他干的是正经事"，和 trust（他帮过我）分开。
         来源全是可被目击的正经行为（做任务/修故障/合闸/拖人进医疗间/施救），
         异形伪装刷的就是这一条；作用是指控门槛、投票回避、证言加权。 */
      cred:keepCred(oldM.cred),
      /* credWhy：cred 的来源种类与夜数（准-确证 almost.friend 要用「种类 ≥2 + 新鲜度」） */
      credWhy:keepCredWhy(oldM.credWhy,oldM.cred),
      /* warm：讨论里攒下的"聊得来"。和 trust（他帮过我）/ cred（他能干）都不同，
         这一条只影响**空闲时想跟谁待在一起**，不影响投票。 */
      warm:keepEmo(oldM.warm),
      /* 证言可信度：跨夜保留但向 0.5 回归（RL.carry），太极端会被时间抹平 */
      reliability:keepRelia(oldM.reliability),
      /* 准-确证：跨夜保留，条件不成立时由 evalAlmost 就地删除（可推翻） */
      almost:{foe:Object.assign({},(oldM.almost&&oldM.almost.foe)||{}),
        friend:Object.assign({},(oldM.almost&&oldM.almost.friend)||{})},
      /* 跨夜口供史：只留最近 3 夜，**只进语料、不产生嫌疑**（真人也会记「你上次说的不是这个」） */
      claimHist:(oldM.claimHist||[]).slice(-3),
      /* known：亲眼确认「这个人就是异形」（钻管道 / 出刀 / 破坏 / 停摆机器人 /
         身上带着刚出刀的红光）。不是嫌疑分，是不再动摇的身份结论。 */
      /* detainSeen：本夜亲眼见过谁被保安拘留（去重用，按夜清空）
         humanT：异形眼里的"这人像人类"（目击合闸），跨夜慢衰减，只调优先度 */
      humanT:keepEmo(oldM.humanT),
      /* ally：软联盟计数（谁替谁说过话，保过几次）—— 跨夜保留但会随回合淡出 */
      ally:Object.assign({},oldM.ally||{}),
      known:keepKnown,redSeen:{},alibi:{},detainSeen:{},avoidSeen:{}};
    /* 跨夜留下的嫌疑要重新评估准-确证（可能已跌破门槛 → 降级） */
    for(const k in a.mind.sus)evalAlmost(a,+k);
    /* 遥测：跨夜保留下来的嫌疑总量（验改动 A 的实际力度） */
    if(G&&G.simStats){
      let t=0;for(const k in a.mind.sus)t+=a.mind.sus[k];
      G.simStats.susCarry=+((G.simStats.susCarry||0)+t).toFixed(2);
    }
  }

  function keepSusNight(sus,old){
    const out={};
    for(const k in sus)if(old&&old[k]!=null)out[k]=old[k];
    return out;
  }

  function keepCredWhy(oldWhy,cred){
    const out={};
    for(const k in (oldWhy||{})){
      if(!(cred&&cred[k]>0))continue;
      out[k]=(oldWhy[k]||[]).slice(-SKSanity.CARRY.whyKeep);
    }
    return out;
  }

  function keepRelia(o){
    const out={},b=SKSanity.RELIA.base,c=SKSanity.RELIA.carry;
    for(const k in (o||{})){
      const v=b+(o[k]-b)*c;
      if(Math.abs(v-b)>0.02)out[k]=+v.toFixed(3);
    }
    return out;
  }

  function credOf(a,i){
    return (a&&a.mind&&a.mind.cred&&a.mind.cred[i])||0;
  }

  function evPush(a,ev){
    const G=global.SKV3._t.G();
    if(!a||!G)return;
    if(!a.mind)mindReset(a);
    ev.t=ev.t==null?evNow():ev.t;
    ev.night=G.night;
    ev.id=(G.evSeq=(G.evSeq||0)+1);
    a.mind.mem.push(ev);
    if(a.mind.mem.length>MEM_MAX)a.mind.mem.shift();
    if(ev.conf>0.25&&(String(ev.kind).indexOf('heard_')===0||
      ev.kind==='env_lights'||ev.kind==='env_fault'||ev.kind==='env_robot')){
      a.mind.alert=Math.min(1,a.mind.alert+ev.conf*0.35);
      a.mind.noise={x:ev.x,y:ev.y,t:ev.t,kind:ev.kind};
    }
  }

  function susAdd(a,i,w,reason,ev){
    const G=global.SKV3._t.G();
    if(!a||i==null||i===a.i||!G)return;
    if(!a.mind)mindReset(a);
    const old=a.mind.sus[i]||0;
    const gain=w*(1-old*0.55);
    a.mind.sus[i]=Math.min(1,old+gain);
    /* 记下这一笔来自第几夜：跨夜衰减要靠它判断「本夜有没有新证据」 */
    a.mind.susNight=a.mind.susNight||{};
    a.mind.susNight[i]=G.night;
    const arr=a.mind.why[i]||(a.mind.why[i]=[]);
    arr.push({w:+gain.toFixed(3),reason:reason||'',kind:ev?ev.kind:'',
      night:G.night,
      t:ev?ev.t:evNow(),x:ev&&ev.x!=null?ev.x:null,y:ev&&ev.y!=null?ev.y:null,
      room:ev?ev.room:null});
    if(arr.length>8)arr.shift();
    /* 嫌疑变了就重算准-确证（可能刚好跨线，也可能因为被洗清而降级） */
    evalAlmost(a,i);
  }

  function evalAlmost(a,i){
    const G=global.SKV3._t.G();
    if(!a||!a.mind||i==null||i===a.i||!G)return;
    const A=SKSanity.ALMOST;
    if(!a.mind.almost)a.mind.almost={foe:{},friend:{}};
    const grid=a.mind.almost;
    const known=a.mind.known&&a.mind.known[i];
    const freshNight=G.night-A.freshNights;
    /* --- foe --- */
    const sus=(a.mind.sus&&a.mind.sus[i])||0;
    const why=(a.mind.why&&a.mind.why[i])||[];
    const fk={},ff={};
    for(const w of why){
      if(!w.kind)continue;
      fk[w.kind]=1;
      if(w.night!=null&&w.night>=freshNight)ff[w.kind]=1;
    }
    const foeOk=!known&&sus>=A.foeSus&&
      Object.keys(fk).length>=A.foeKinds&&Object.keys(ff).length>=1;
    if(foeOk){
      /* 构陷与弱线索刷不出 foe：传闻（heard_*）、沉默（silent）、空口指控
         （empty_accuse）都不算"不同种类的证据" —— 否则「被三个人说可疑」＋「他话少」
         就能凑成准-确证，那和 `empty_accuse` 的惩罚直接打架。 */
      const WEAK={silent:1,empty_accuse:1,leader_order:1,heard_frame:1,heard_claim:1,
        impossible_claim:1,quick_report:1,wrong_accuse:1};
      const real=Object.keys(fk).filter(k=>k.indexOf('heard_')!==0&&!WEAK[k]);
      if(real.length<A.foeKinds){grid.foe&&delete grid.foe[i];}
      else{
        const had=grid.foe&&grid.foe[i];
        grid.foe[i]={t:evNow(),sus:+sus.toFixed(3),kinds:Object.keys(fk),
          since:had&&had.since!=null?had.since:G.night,conf:A.foeConf};
        if(!had&&G.simStats)G.simStats.almostCount=(G.simStats.almostCount||0)+1;
        grid.friend&&delete grid.friend[i];
      }
    }else if(grid.foe&&grid.foe[i])delete grid.foe[i];
    /* --- friend --- */
    const cred=credOf(a,i);
    const cw=(a.mind.credWhy&&a.mind.credWhy[i])||[];
    const ck={},cf={};
    for(const w of cw){
      if(!w.kind)continue;
      ck[w.kind]=1;
      if(w.night!=null&&w.night>=freshNight)cf[w.kind]=1;
    }
    const friendOk=!known&&!grid.foe[i]&&cred>=A.friendCred&&
      Object.keys(ck).length>=A.friendKinds&&Object.keys(cf).length>=1;
    if(friendOk){
      const had=grid.friend&&grid.friend[i];
      grid.friend[i]={t:evNow(),cred:+cred.toFixed(3),kinds:Object.keys(ck),
        since:had&&had.since!=null?had.since:G.night,conf:A.friendConf};
      if(!had&&G.simStats)G.simStats.almostFriendCount=(G.simStats.almostFriendCount||0)+1;
    }else if(grid.friend&&grid.friend[i])delete grid.friend[i];
  }

  function knownOverride(w,i){
    const G=global.SKV3._t.G();
    if(!w||!w.mind||i==null)return;
    const A=SKSanity.ALMOST;
    if(!w.mind.almost)w.mind.almost={foe:{},friend:{}};
    const g=w.mind.almost;
    const hadFriend=!!(g.friend&&g.friend[i]);
    if(hadFriend)delete g.friend[i];
    if(w.mind.cred&&w.mind.cred[i])w.mind.cred[i]=0;
    if(w.mind.credWhy)delete w.mind.credWhy[i];
    if(!g.foe[i])g.foe[i]={t:evNow(),sus:1,kinds:['known'],since:G.night,conf:1};
    if(G.simStats){
      if(hadFriend)G.simStats.overriddenFriends=(G.simStats.overriddenFriends||0)+1;
    }
  }

  function susCut(a,i,w,reason,ev){
    const G=global.SKV3._t.G();
    if(!a||i==null||i===a.i||!G)return;
    if(!a.mind)mindReset(a);
    if(a.mind.known&&a.mind.known[i])return;
    const old=a.mind.sus[i]||0;
    if(old<=0)return;
    const cut=Math.min(old,w);
    a.mind.sus[i]=Math.max(0,old-cut);
    a.mind.alibi[i]={t:ev?ev.t:evNow(),room:ev?ev.room:null,reason:reason||''};
  }

  function checkAlibi(w,subj,claimRoom,t0,t1,tRef){
    const G=global.SKV3._t.G();
    const now=evNow();
    if(t1==null)t1=now;
    if(t0==null)t0=Math.max(0,t1-SKSanity.ALIBI.window);
    const r=SKSanity.checkAlibi(w&&w.mind?w.mind.mem:null,
      {subj:subj,claimRoom:claimRoom==null?null:claimRoom,night:G?G.night:0,
        t0:t0,t1:t1,tRef:tRef==null?t1:tRef});
    /* 遥测：窗口内既有匹配记录、又有不匹配记录 —— 旧量词会在这里冤枉人 */
    if(r.match&&r.mismatched>0&&G&&G.simStats)G.simStats.falseContradictions++;
    return r;
  }

  function claimWindow(when){
    const now=evNow();
    if(when==='night')return {t0:0,t1:now,tRef:now};
    if(when==='recent')return {t0:Math.max(0,now-SKSanity.ALIBI.recent),t1:now,tRef:now};
    return {t0:Math.max(0,now-SKSanity.ALIBI.window),t1:now,tRef:now};
  }

  function susAddContradiction(w,target,weight,reason,ev){
    const G=global.SKV3._t.G();
    susAdd(w,target,weight,reason,ev);
    if(!G||!G.simStats)return;
    G.simStats.contradictions=(G.simStats.contradictions||0)+1;
    const by=G.simStats.contradictionsBy||(G.simStats.contradictionsBy={});
    by[reason]=(by[reason]||0)+1;
  }

  function oldQuantifierWouldFire(w,subj,claimRoom){
    const G=global.SKV3._t.G();
    if(!w||!w.mind||subj==null||claimRoom==null)return false;
    const now=evNow(), mem=w.mind.mem||[];
    const tail=mem.slice(-24);
    for(const e of tail){
      if(e.kind!=='saw_agent'||e.subj!==subj||e.night!==G.night||!e.room)continue;
      if(now-e.t>45)continue;
      if(e.room===claimRoom)continue;
      return true;
    }
    return false;
  }

  function liveTarget(i,self){
    const G=global.SKV3._t.G();
    const t=G.agents[i];return t&&t!==self&&t.alive&&!t.downed?t:null;
  }

  function bestSusTarget(a,min,forNight){
    const s=topSus(a,min,forNight); if(!s)return null;
    return liveTarget(s.i,a)?s:null;
  }

  function almostFoeOf(a,i){
    return (a&&a.mind&&a.mind.almost&&a.mind.almost.foe&&a.mind.almost.foe[i])||null;
  }

  function almostFriendOf(a,i){
    return (a&&a.mind&&a.mind.almost&&a.mind.almost.friend&&a.mind.almost.friend[i])||null;
  }

  function bestAlmostTarget(a){
    if(!a||!a.mind||!a.mind.almost)return null;
    let best=null,bs=-1;
    for(const k in (a.mind.almost.foe||{})){
      const i=+k,v=a.mind.almost.foe[k];
      if(!liveTarget(i,a))continue;
      if(a.mind.known&&a.mind.known[i])continue;
      const s=(v&&v.sus)||0;
      if(s>bs){bs=s;best={i,score:s,almost:v};}
    }
    return best;
  }

  function bestKnownTarget(a){
    if(!a||!a.mind||!a.mind.known)return null;
    let best=null,bt=-1;
    for(const k in a.mind.known){
      const i=+k, t=a.mind.known[k];
      if(!liveTarget(i,a))continue;
      if((t.t||0)>bt){bt=t.t||0;best={i,score:1,known:t,
        why:(a.mind.why[i]||[]).slice(-4)};}
    }
    return best;
  }

  function evidenceReason(a,i){
    const why=(a.mind&&a.mind.why[i])||[];
    return why.length?why[why.length-1]:null;
  }

  function affordableAlmostShot(a,thr){
    const af=bestAlmostTarget(a);
    if(!af)return null;
    if(!liveTarget(af.i,a))return null;
    if(almostFriendOf(a,af.i))return null;
    const v=susOf(a,af.i,true);
    return v>=thr*0.85?{i:af.i,score:v,why:(a.mind.why[af.i]||[]).slice(-4)}:null;
  }

  global.SKT2AI = Object.freeze({
    susOf: susOf, topSus: topSus, crimeWindow: crimeWindow,
    evNow: evNow,
    keepSusNight: keepSusNight,
    keepCredWhy: keepCredWhy,
    keepRelia: keepRelia,
    credOf: credOf,
    mindReset: mindReset,
    evPush: evPush,
    susAdd: susAdd,
    evalAlmost: evalAlmost,
    susCut: susCut,
    checkAlibi: checkAlibi,
    claimWindow: claimWindow,
    susAddContradiction: susAddContradiction,
    oldQuantifierWouldFire: oldQuantifierWouldFire,
    knownOverride: knownOverride,
    liveTarget: liveTarget,
    bestSusTarget: bestSusTarget,
    almostFoeOf: almostFoeOf,
    almostFriendOf: almostFriendOf,
    bestAlmostTarget: bestAlmostTarget,
    bestKnownTarget: bestKnownTarget,
    evidenceReason: evidenceReason,
    affordableAlmostShot: affordableAlmostShot
  });
})(typeof window !== 'undefined' ? window : globalThis);
