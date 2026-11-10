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
    let best = null, bi = null, bestEnv = -1;
    /* 2026-11-05 G1：envEstimate 正式接进主推理链。
       只在**嫌疑分几乎打平**时用它破平局（差 ≤ MIND.envTieEps）：
       环境读数（自己记着的目击 / 当众指认 / 看得见的红光或拖尸）不另立一套权重，
       因此不会变成「按环境分数定罪」，也仍然不读任何人的私有 mind。 */
    const eps = (SK.MIND && SK.MIND.envTieEps) || 0.06;
    for (const k in a.mind.sus) {
      const i = +k, s = susOf(a, i, forNight);
      if (s < (min == null ? 0.5 : min)) continue;
      const e = envEstimate(a, i);
      const env = e.score * e.conf;
      if (best == null || s > best + eps || (Math.abs(s - best) <= eps && env > bestEnv)) {
        best = s; bi = i; bestEnv = env;
      }
    }
    return bi == null ? null : { i: bi, score: best, env: +bestEnv.toFixed(3),
      why: (a.mind.why[bi] || []).slice(-4) };
  }

  /* 2026-11-06 G3 · **假设层**：AI 不只盯一个 suspect，而是同时维护
     最多 3 个并列假说（按嫌疑归一化成权重）。它**不新增任何分数**，
     只是把已有的 sus 分布显式化，供判断结构使用：
     两个假说难分高下时，真人的反应是弃权而不是闭眼挑一个。 */
  function hypotheses(a, maxN) {
    if (!a || !a.mind) return [];
    const G = global.SKV3._t.G();
    const xs = [];
    let sum = 0;
    for (const k in a.mind.sus) {
      const i = +k, v = susOf(a, i, false);
      if (v <= 0) continue;
      const t = G && G.agents[i];
      if (!t || !t.alive || t.downed || t === a) continue;
      xs.push({ i: i, v: v }); sum += v;
    }
    if (!xs.length) return [];
    xs.sort((x, y) => y.v - x.v || x.i - y.i);
    return xs.slice(0, maxN || 3).map(x => ({ i: x.i,
      w: sum ? +(x.v / sum).toFixed(3) : 0, raw: +x.v.toFixed(3) }));
  }
  function refreshHyps(a) {
    if (a && a.mind) a.mind.hyps = hypotheses(a, 3);
    return a && a.mind ? a.mind.hyps : [];
  }
  /* 2026-11-06 · 一条假说背后有没有**实证**。
     mind.why[i] 记着每笔嫌疑的来源：heard_* 是听来的，empty_accuse / silent /
     doubt 是会议语料，都不算「我手里有东西」；saw_* / seen_* / env_* /
     search_* / impossible_* / contradiction 这类带现场坐标的才算。
     纯数值相等的平局若两边都没有实证，就是机械平局，不该弃权。 */
  function hypothesisEvidence(a, i) {
    const why = (a && a.mind && a.mind.why && a.mind.why[i]) || [];
    const kinds = {}, nights = {};
    let n = 0, direct = 0;
    for (const r of why) {
      if (!r) continue;
      const k = String(r.kind || '');
      if (!k || k.indexOf('heard_') === 0 ||
          k === 'empty_accuse' || k === 'silent' || k === 'doubt') continue;
      n++;
      kinds[k] = 1;
      if (r.night != null) nights[r.night] = 1;
      /* 会议事件常写 x=0,y=0 占位，不算现场坐标 */
      if (r.x != null && r.y != null && Math.hypot(r.x, r.y) > 0.01) direct++;
    }
    return { n: n, kinds: Object.keys(kinds), nights: Object.keys(nights),
      direct: direct };
  }
  function hypothesisSpread(a) {
    /* 每次重算，不用缓存：sus 也会被 susCut / mindReset 直接改，
       缓存一旧就会拿上一夜的假说决定这一夜的票。 */
    const h = hypotheses(a, 3);
    const gap = h.length >= 2 ? h[0].w - h[1].w : 1;
    /* 修 2026-11-06 发现的 fallback bug：原来 `(SK.MIND.hypGap)||0.12`
       会把 0 当成 falsy 退回 0.12，所以 A/B 的 `--hypgap 0` 根本没生效。 */
    const M = SK.MIND || {};
    const pick = (k, d) => (M[k] == null ? d : M[k]);
    const thr = pick('hypGap', 0.08);
    const minTop = pick('hypMinTop', 0.34);
    const minEv = pick('hypMinEvidence', 2);
    const needDirect = !!pick('hypRequireDirect', 1);
    const needIndep = !!pick('hypRequireIndependent', 1);
    const e0 = h.length >= 2 ? hypothesisEvidence(a, h[0].i) : null;
    const e1 = h.length >= 2 ? hypothesisEvidence(a, h[1].i) : null;
    /* 两条假说的证据种类不能完全一样：至少一方有对方没有的种类。
       同一次公开指认给所有人加同样的分，不该被当成「两条独立假说」。 */
    let independent = true;
    if (needIndep && e0 && e1) {
      const only = e0.kinds.filter(k => e1.kinds.indexOf(k) < 0)
        .concat(e1.kinds.filter(k => e0.kinds.indexOf(k) < 0));
      independent = only.length > 0;
    }
    const evidenceOk = !!(e0 && e1 &&
      e0.n >= minEv && e1.n >= minEv &&
      (!needDirect || (e0.direct >= 1 && e1.direct >= 1)) && independent);
    const topOk = h.length >= 2 && h[0].w >= minTop;
    return { hyps: h, gap: +gap.toFixed(3),
      evidence: e0 && e1 ? { a: e0, b: e1, independent: independent,
        ok: evidenceOk } : null,
      thr: thr, minTop: minTop, minEvidence: minEv,
      competing: topOk && gap <= thr && evidenceOk };
  }

  /* 2026-11-05 G3 · **行为序列**：单个可疑动作可能看错，
     同一人先后出现两种不同可疑动作才是「一串行为」。只认自己记下的观测，
     且要求两次间隔 ≤ MIND.seqWindowSec；返回一条带反解释的弱线索。 */
  function sequenceCue(a, i) {
    const mem = (a && a.mind && a.mind.mem) || [];
    const HOSTILE = { saw_red: 1, saw_drag_away: 1, saw_body_moved: 1, saw_avoid: 1 };
    const win = (SK.MIND && SK.MIND.seqWindowSec) || 25;
    let first = null;
    const kinds = {};
    for (let k = 0; k < mem.length; k++) {
      const e = mem[k];
      if (!e || e.subj !== i || !HOSTILE[String(e.kind)]) continue;
      if (first && (e.t || 0) - (first.t || 0) > win) { first = e; kinds[e.kind] = 1; continue; }
      if (!first) first = e;
      kinds[e.kind] = 1;
      if (Object.keys(kinds).length >= 2) {
        return { kind: 'sequence', w: 0.30,
          why: '先后看见他做过两种不一样的可疑动作',
          alt: '两件事也可能只是恰好发生在同一个人附近' };
      }
    }
    return null;
  }

  /* 2026-11-05 G3 · **证言间关系**：同一目标既被指控又被背书时，
     公开声势不该照样滚雪球。只统计「已经说出口」的陈述，按发言人去重；
     同一人既指控又背书视为自相矛盾，两边都不计。返回压声系数 damp ∈ [0.4, 1]。 */
  function statementRelation(testimony, vouches, tgt) {
    const A = new Set(), V = new Set();
    for (const it of testimony || []) {
      if (!it || !it.said || it.tgt !== tgt) continue;
      if (it.reason === 'heard_accuse' || it.reason === 'empty_accuse') A.add(it.by);
    }
    for (const v of vouches || []) if (v && v.tgt === tgt) V.add(v.by);
    let both = 0;
    for (const by of Array.from(A)) if (V.has(by)) { A.delete(by); V.delete(by); both++; }
    const nA = A.size, nV = V.size;
    return { accusers: nA, vouchers: nV, selfConflict: both,
      damp: (nA && nV) ? Math.max(0.4, nA / (nA + nV)) : 1 };
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
      /* heard：注意力窗口（2026-11-08 用户裁定，同日修订）。
         长度上限 `ATTN.heardMax`（10）的**滑动窗口**：整局累积、不跨夜清零，
         满了由新证词顶掉最旧的一条（不是丢弃新证词）。
         ⚠ 试过"每场重置 10 条"：1000 局里 0 次触发 —— 每场实际证词不到 10 条，
         窗口从不填满，机制空转。所以只能是整局口径。 */
      heard:(oldM.heard||[]).slice(),
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
      known:keepKnown,redSeen:{},alibi:{},detainSeen:{},avoidSeen:{},hyps:[],
      /* rev：信念版本号（2026-11-05）。每次 susAdd 自增，会议里用来判断
         「我这票投出去之后，是不是又听到了什么」—— 没听到新东西就不跟风改票。 */
      rev:0};
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
    /* 信念动过了：会议里「听到发言 → 改票」靠这个计数器判断，
       而不是拿两个随机分支的结果硬比（那会把抖动当成改票理由）。 */
    a.mind.rev=(a.mind.rev|0)+1;
    refreshHyps(a);
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
    /* 证据种类（2026-11-06 用户裁定）：传闻可以**补一个种类**，但不能单独定罪。
       弱线索（沉默 / 空口指控 / 领袖点名 / 快速报案 / 错告 / 背书）仍然一律不算。
       约束：`real`（自己看见 / 查到的）至少 1 条；`heard` 最多补 A.heardKinds 个。 */
    const WEAK={silent:1,empty_accuse:1,leader_order:1,impossible_claim:1,
      quick_report:1,wrong_accuse:1};
    const kinds=Object.keys(fk);
    const real=kinds.filter(k=>k.indexOf('heard_')!==0&&!WEAK[k]);
    /* heard_vouch 是**正向**背书，方向不对，不进敌性证据的种类 */
    const heard=kinds.filter(k=>k.indexOf('heard_')===0&&k!=='heard_vouch');
    const heardUse=Math.min(heard.length,Math.max(0,A.heardKinds|0));
    const counted=real.length+heardUse;
    const foeOk=!known&&sus>=A.foeSus&&real.length>=1&&
      counted>=A.foeKinds&&Object.keys(ff).length>=1;
    if(foeOk){
      const had=grid.foe&&grid.foe[i];
      grid.foe[i]={t:evNow(),sus:+sus.toFixed(3),kinds:kinds,
        heardUsed:heardUse,
        since:had&&had.since!=null?had.since:G.night,conf:A.foeConf};
      if(!had&&G.simStats){
        G.simStats.almostCount=(G.simStats.almostCount||0)+1;
        const tgt=G.agents&&G.agents[i];
        if(tgt&&tgt.alien)G.simStats.almostAlien=(G.simStats.almostAlien||0)+1;
        else G.simStats.almostHuman=(G.simStats.almostHuman||0)+1;
        /* 只统计"没有这条传闻就凑不够"的次数：这才是本批真正改掉的那部分 */
        if(real.length<A.foeKinds)G.simStats.almostHeard=(G.simStats.almostHeard||0)+1;
      }
      grid.friend&&delete grid.friend[i];
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

  /* ================= 感知入口（2026-11-05 · 一组读心清零）=================
     用户裁定：AI 只能**通过环境**判断，不能读别人的实际数据。
     允许的四类输入：
       ① 自己的记忆 a.mind.mem / a.mind.known / a.mind.seenBy
       ② 自己的性格 a.trait（只影响怎么解读，不做性格推断）
       ③ 世界状态（位置、灯、断电、倒地、拖尸、红身、公开领袖）
       ④ 公开事件（**已经说出口**的指控 accuse / accuseWhy、投票、报告）
     禁止：w.mind.sus / w.mind.known / w.mind.cred / w.mind.almost / w.trait.*

     返回 { score, conf, whyKind, cues }：
       score  0~1「他像异形」的估计值，**允许错**
       conf   0~1 置信度，线索越间接越低
       whyKind 'seen' | 'heard' | 'public' | 'inferred' | 'none'
       cues   [{kind, w, why, alt}] —— why 是那条可见线索，alt 是同一线索的另一种解释
     ⚠ 验收反例：把 sus 改个名 estimatedSus 仍然返回确定值 ⇒ 换皮读心，不合格。 */
  const SEEN_WORD = {
    saw_knife: '出刀', saw_pipe: '钻管道', saw_sabotage: '破坏设备',
    saw_breaker: '拉闸断电', saw_bot: '停摆机器人', saw_red: '身上带着红光',
    saw_drag: '拖尸体', saw_detain: '被保安拘留', saw_agent: '出现在那里'
  };

  /* 公开指认：只看"有没有当众说过"，不看是谁、也不看听众心里怎么想 */
  function pubAccusers(i) {
    const G = global.SKV3._t.G(), out = [];
    if (!G || i == null) return out;
    for (const w of (G.agents || [])) {
      if (!w || w.i === i) continue;
      if (w.alive && !w.downed && w.accuse === i) out.push(w.i);
    }
    return out;
  }
  function pubSolidAccusers(i) {
    const G = global.SKV3._t.G();
    return pubAccusers(i).filter(k => {
      const w = G && G.agents[k];
      return !!(w && w.accuseWhy && w.accuseWhy.solid);
    });
  }
  /* 公开热度：几个活人当众指认过他。刻度是读数刻度，不是平衡数值。 */
  function publicHeat(i) {
    const n = pubAccusers(i).length;
    return n ? Math.min(1, 0.30 + 0.16 * (n - 1)) : 0;
  }
  /* 公开影响力：不看性格轴，只看"他说的话有没有人跟"（公开事件）。 */
  function publicInfluence(w) {
    const G = global.SKV3._t.G();
    if (!w || !G) return 0;
    if (G.leader === w.i) return 1;
    let follow = 0;
    for (const o of (G.agents || [])) {
      if (!o || o === w || !o.alive || o.downed) continue;
      if (o.accuse != null && o.accuse === w.accuse) follow++;
    }
    return Math.min(1, follow * 0.34);
  }

  /* a 估「i 有多像异形」。只读 a 自己的记忆 + 公开事件 + 世界状态。 */
  function envEstimate(a, i, ctx) {
    const G = global.SKV3._t.G(), empty = { score: 0, conf: 0, whyKind: 'none', cues: [] };
    if (!a || !G || i == null || i === a.i) return empty;
    const t = G.agents[i];
    if (!t) return empty;
    const cues = [];
    /* ① 自己的确证：最硬，但仍写清"可能看错人" */
    const own = a.mind && a.mind.known && a.mind.known[i];
    if (own) {
      return { score: 1, conf: 1, whyKind: 'seen', cues: [{ kind: own.kind || 'known', w: 1,
        why: '我亲眼看见他' + (SEEN_WORD[own.kind] || '动手'),
        alt: '也可能是我把同舱室的另一个人看成了他' }] };
    }
    /* ② 自己记着的目击 / 听来的指认 */
    const mem = (a.mind && a.mind.mem) || [];
    for (let k = mem.length - 1; k >= 0 && cues.length < 6; k--) {
      const e = mem[k];
      if (!e || e.subj !== i) continue;
      const kd = String(e.kind || '');
      if (kd.indexOf('saw_') === 0 && !e.far) {
        cues.push({ kind: kd, w: 0.72,
          why: '我在' + (e.room || '现场') + '看见他' + (SEEN_WORD[kd] || '动手'),
          alt: '近距离看见的也可能是同舱室的另一个人' });
      } else if (kd === 'heard_accuse' || kd === 'heard_claim') {
        cues.push({ kind: 'heard', w: 0.28, why: '我听见有人当众指认他',
          alt: '指认他的人也可能在构陷' });
      }
    }
    /* ③ 公开事件 */
    const acc = pubAccusers(i);
    if (acc.length) {
      cues.push({ kind: 'public', w: Math.min(0.60, 0.22 + 0.12 * acc.length),
        why: '有 ' + acc.length + ' 个人当众指认他', alt: '公开指认也可能是跟风或构陷' });
    }
    /* ③b 行为序列：同一种线索反复出现只是重复；两种不同可疑动作连着出现才是序列 */
    const seq = sequenceCue(a, i);
    if (seq) cues.push(seq);
    /* ④ 世界状态：红光 / 拖尸是看得见的，但都不指向具体是谁 */
    if (t.redT > 0) {
      cues.push({ kind: 'red', w: 0.55, why: '他身上还带着刚出刀的红光',
        alt: '红光只说明他刚动过刀，不说明刀的是谁' });
    }
    if (t.drag != null) {
      cues.push({ kind: 'drag', w: 0.32, why: '他正在拖尸体',
        alt: '拖尸体也可能是想把伤者送进医疗间' });
    }
    /* 合并：取最强的一条，再做"多类线索"的小幅上浮；不写连续权重公式 */
    const kindSet = {};
    let score = 0, best = null;
    for (const c of cues) {
      kindSet[c.kind] = 1;
      if (c.w > score) { score = c.w; best = c; }
    }
    const nk = Object.keys(kindSet).length;
    if (nk >= 2) score = Math.min(1, score + 0.12);
    const conf = !cues.length ? 0 : Math.min(1, 0.35 + 0.18 * nk);
    const whyKind = !best ? 'none'
      : (best.kind === 'heard' ? 'heard' : (best.kind === 'public' ? 'public' : 'seen'));
    return { score: score, conf: conf, whyKind: whyKind, cues: cues };
  }

  /* a 估「w 现在有多怀疑我」——只用 a 自己知道的：我干过什么、当时谁在场、
     w 有没有当众指认我。绝不读 w.mind.sus。 */
  function audSusEstimate(a, w) {
    const G = global.SKV3._t.G();
    if (!a || !w || !G) return { score: 0, conf: 0, why: '' };
    let score = 0, why = '';
    if (w.accuse === a.i) { score = 0.85; why = '他当众指认过我'; }
    /* 会开完 `accuse` 会被清空，夜里就只剩「我自己记着的那一句」：
       `heard_accuse` / `heard_frame` / `heard_claim` 的 `by` 就是说这句话的人。
       这是**公开事件 + 自己的记忆**，不是读别人的脑子。 */
    if (score < 0.7) {
      const mem = (a.mind && a.mind.mem) || [];
      for (let k = mem.length - 1; k >= 0; k--) {
        const e = mem[k];
        if (!e || e.by !== w.i || e.subj !== a.i) continue;
        if (e.kind !== 'heard_accuse' && e.kind !== 'heard_frame' && e.kind !== 'heard_claim') continue;
        score = 0.7; why = '我听见他当众点过我'; break;
      }
    }
    const seen = a.mind && a.mind.seenBy && a.mind.seenBy[w.i];
    if (seen) {
      const age = evNow() - (seen.t || 0);
      if (age < 20 && score < 0.55) { score = 0.55; why = why || '他刚才看见我在现场附近'; }
    }
    if (a.redT > 0 && score < 0.45) { score = 0.45; why = why || '我身上还带着红光'; }
    return { score: score, conf: score > 0 ? 0.7 : 0.15, why: why };
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
    affordableAlmostShot: affordableAlmostShot,
    envEstimate: envEstimate,
    audSusEstimate: audSusEstimate,
    pubAccusers: pubAccusers,
    pubSolidAccusers: pubSolidAccusers,
    publicHeat: publicHeat,
    publicInfluence: publicInfluence,
    sequenceCue: sequenceCue,
    statementRelation: statementRelation,
    hypotheses: hypotheses, refreshHyps: refreshHyps,
    hypothesisSpread: hypothesisSpread, hypothesisEvidence: hypothesisEvidence
  });
})(typeof window !== 'undefined' ? window : globalThis);
