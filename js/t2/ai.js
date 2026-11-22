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

  /* 嫌疑读值（0~1）= **相对先验的信任跌落**（2026-11-21 用户第三批裁定）。
     决策读 T+E 合成（情绪 = 短期信任加减）：effT = T + E。
     T=prior → 0；T=prior−200（准-确证异形线）→ 1；T 硬确证 −999 → 1。
     先验 prior = 100 × 存活人类 / 存活总数（G.priorT，死亡即重算）。 */
  function effT(a, i) {
    return trustRaw(a, i) + ((a && a.mind && a.mind.E && a.mind.E[i]) || 0);
  }
  function currentPrior() {
    const G = global.SKV3._t.G();
    return (G && G.priorT != null) ? G.priorT : SK.AXIS.priorPool * (10 / 13);
  }
  function beliefOf(a, i, forNight) {
    let s = Math.max(0, Math.min(1, (currentPrior() - effT(a, i)) / SK.AXIS.cap));
    if (forNight && s > 0) {
      const n = (a && a.mind && a.mind.susNight && a.mind.susNight[i]) || 0;
      if (n < global.SKV3._t.G().night) s *= SK.CARRY.nightReadSec;
    }
    return s;
  }
  function susOf(a, i, forNight) {
    return beliefOf(a, i, forNight);
  }

  /* ---------------- 唯二两轴（2026-11-21 用户第三批裁定「0~200 分制」）----------------
     T 个人信任分 ∈ [−999, +200]：0 分 = 准-确证异形（可逆）、200 = 准-确证人类、
     ∓999 = 硬确证（出刀/钻管道/破坏/红光/被刀认凶）。先验 = 100×存活人类比，
     每次死亡重算；夜间分段衰减（小分先消、大分记得久）。
     E 个人情绪分 ∈ [−100, +100]：短期信任账（恐慌/煽动/恩仇），决策读 T+E 合成。
     传闻链并入 T，单条 ≤ HEARD.cap（20 分）；行为目击走 WITNESS 分值表。 */
  function credRaw(a, i) {
    /* 兼容薄壳：返回**信任盈余分**（T − 先验，clamp ±cap）。旧调用点问
       「他比先验像多少人类」—— 单位从 0~1 把握度改为分，消费端已同步换算。 */
    const s = trustRaw(a, i) - currentPrior();
    return Math.max(-SK.AXIS.cap, Math.min(SK.AXIS.cap, s));
  }
  function trustRaw(a, i) {
    const m = a && a.mind;
    if (!m || i == null || i === a.i) return 0;
    if (m.T && m.T[i] != null) return m.T[i];
    /* 旧局 / 夹具兼容：没有 T 账本时按确证锚读出 */
    if (m.known && m.known[i]) return SK.AXIS.certAlien;
    if (!a.alien && m.knownHuman && m.knownHuman[i]) return SK.AXIS.certHuman;
    if (a.alien && a.mates && a.mates[i]) return SK.AXIS.certHuman;
    return currentPrior();
  }
  function trustScore(a, i) {
    return trustRaw(a, i);   /* 读出 = 存储（单位：分）；确证 ∓999 原样透传 */
  }
  /* T 的加减写入（唯一入口，参数单位 = 分）。确证不需要写入侧保护：
     常规事件单条 ≤ 200（WITNESS 全表最大 |25|、传闻 ≤20），
     与 ±999 的数学距离由 certFloor=500 的读出判据承担。 */
  function axisAddT(a, i, w) {
    if (!a || i == null || i === a.i || !w) return 0;
    if (!a.mind) mindReset(a);
    const AX = SK.AXIS;
    if (!a.mind.T) a.mind.T = {};
    /* 2026-11-21 用户裁定「初始分按人数比动态分配」：T 是绝对分，
       未落笔的对象从**当前先验**起算（不是 0），每次死亡重算先验后新写也跟新先验。 */
    const old = a.mind.T[i] != null ? a.mind.T[i] : currentPrior();
    /* 2026-11-21 用户裁定：常规单笔变化 |ΔT| ≤ 200（异形专属行为 ∓999 走 trustCert，不经过这里） */
    const wc = Math.max(-AX.eventCap, Math.min(AX.eventCap, w));
    const nv = Math.max(AX.floor, Math.min(AX.cap, old + wc));
    a.mind.T[i] = Math.abs(nv) < 1e-3 ? 0 : +nv.toFixed(1);
    /* 2026-11-22 翻案：记下对目标的最后一次"扣分行为"夜（只记负向写入）。
       连续 N 夜没有再扣分 → mindReset 里把 ∓999 退化为 ∓100。 */
    if (w < 0) {
      const G0 = global.SKV3._t.G();
      if (G0) { a.mind.certNegNight = a.mind.certNegNight || {}; a.mind.certNegNight[i] = G0.night; }
      /* 2026-11-22 nights=0 语义：任何负向写入都是"又看到扣分行为" →
         把确证标记为"已被刷新"（dirty），当夜结算不得降级。 */
      a.mind.certDirty = a.mind.certDirty || {};
      a.mind.certDirty[i] = false;
    }
    return a.mind.T[i];
  }
  /* 确证写入：把 T 钉到 ±999（「一切分数化」——确证就是分数，不是独立账本） */
  function trustCert(a, i, alien) {
    if (!a || i == null || i === a.i) return;
    if (!a.mind) mindReset(a);
    if (!a.mind.T) a.mind.T = {};
    a.mind.T[i] = alien ? SK.AXIS.certAlien : SK.AXIS.certHuman;
    /* 确证本身也是一次强扣分行为：重置"最后扣分夜"，让翻案倒计时从此刻重新起算。 */
    const G0 = global.SKV3._t.G();
    if (G0) { a.mind.certNegNight = a.mind.certNegNight || {}; a.mind.certNegNight[i] = G0.night; }
    /* 2026-11-22 nights=0：确证刚写下 = 干净起点（当晚后续没有新扣分就降级）。
       之后的任何扣分（axisAddT w<0）会把它翻成 false。 */
    a.mind.certDirty = a.mind.certDirty || {};
    a.mind.certDirty[i] = true;
  }

  /* ---------------- 统一身份轴（2026-11-06 用户裁定 · 2026-11-18 从 js/game.js 归位） ----------------
     h = identityAxis(a,t) ∈ [0,1]：a 认为 t 是**人类**的程度。一张表两个导出：
       人类 AI 敌对 = 1−h（怀疑 / 指控 / 投票 / 开枪）；异形 AI 敌对 = h（出刀 / 选靶）。
     搬过来的原因有两条，都不是整洁癖：
       1) 数值表 `IDENTITY` 按红线 14 必须住在 js/ai/sanity.js，函数留在 game.js 就够不着；
       2) 本文件的 topSus 现在要读它（R12.8「人类侧改读统一轴」），
          而经典脚本的加载顺序是 t2/ai.js 早于 game.js —— 反向依赖会直接拿不到函数。
     函数体与搬家前逐行一致，只改了三处取值方式：G → _t.G()、IDENTITY → SKSanity.IDENTITY、
     SKSanity → SK。game.js 用同名局部别名直调，所有调用点零改动。 */
  const IDENTITY = SK.IDENTITY;
  /* 2026-11-21 用户第三批裁定：硬确证名单只留异形专属动作 ——
     拉闸 −80、停摆 −80、拘留 −30 都降为强疑点；红光顶上确证位。 */
  const ID_EVIDENCE = {saw_knife:1,saw_pipe:1,saw_sabotage:1,saw_red:1};
  function hasIdEvidence(x){
    return !!(x&&x.kinds&&x.kinds.some(k=>ID_EVIDENCE[k]));
  }
  function identityPrior(a){
    const G=global.SKV3._t.G();
    if(!a||!G)return 0.5;
    const others=G.agents.filter(x=>x.alive&&x!==a).length;
    if(others<=0)return 0.5;
    const H0=a.alien?11:10;   /* 除自己外的人类数：异形看 11，人类看 10 */
    const A0=a.alien?3:4;     /* 除自己外的异形数：异形看 3，人类看 4 */
    /* 先验条件化：已认出的队友（异形 a.mates）/ 已确证的异形（人类 mind.known）
       只从“其他异形”里扣，且只扣活着的人。不读系统阵营表。 */
    let knownA=0,knownDeadA=0;
    const kn=a.alien?(a.mates||{}):((a.mind&&a.mind.known)||{});
    for(const k in kn){
      const x=G.agents[+k];
      if(!x||x===a)continue;
      if(x.alive)knownA++;
      else if(x.deathCause!=='vote')knownDeadA++;   /* 已知的异形死了，不再按未知分摊 */
    }
    let hx=0,ax=0,unknown=0;
    for(const x of G.agents){
      if(x===a||x.alive)continue;
      if(x.deathCause==='vote'){ if(x.alien)ax++; else hx++; }
      else if(!kn[x.i])unknown++;          /* 已知异形的死不算未知 */
    }
    const H=Math.max(0,H0-hx), A=Math.max(0,A0-ax-knownA-knownDeadA);
    const denom=Math.max(1e-6,H+A);
    const hAlive=Math.max(0,H-unknown*H/denom);
    const pool=Math.max(1,others-knownA);
    return Math.max(IDENTITY.priorMin,Math.min(IDENTITY.priorMax,hAlive/pool));
  }
  function identityAxis(a,t){
    const G=global.SKV3._t.G();
    if(!a||!t||!G)return 0.5;
    if(a.mind&&a.mind.known&&a.mind.known[t.i])return 0;
    /* 终结者明牌写下的 knownHuman：同类，直接是 1（2026-11-20） */
    if(!a.alien&&a.mind&&a.mind.knownHuman&&a.mind.knownHuman[t.i])return 1;
    if(a.alien&&a.mates&&a.mates[t.i])return 0;
    const af=a.mind&&a.mind.almost;
    if(af&&af.foe&&af.foe[t.i]&&hasIdEvidence(af.foe[t.i]))return IDENTITY.almostAlien;
    if(af&&af.friend&&af.friend[t.i])return IDENTITY.almostHuman;
    /* 终结者时刻的身份公开是**公开事件**（R2.9），不是"谁偷看了阵营表"：
       规则把每个人的阵营广播给全场，两侧读同一份、判据一致（一张表两个导出）。
       ⚠ 2026-11-18 补：此前 `G.revealAll` 只点亮漂浮名牌，**没有喂进任何 AI 判定** ——
       所以"亮身份"之后残局里两个 AI 仍然互相客气、不把对方当敌人，用户据此报的 bug 成立。
       硬锚（known / 队友 / almost）排在它前面，保持不变：亲眼所见与已认出的队友
       不该被一次广播改写方向。 */
    if(G.revealAll)return t.alien?0:0.99;
    /* 2026-11-21 用户第三批裁定：h 由 **T+E 合成分**两段线性映射（无透视、无分支）：
       T_eff ∈ [0,200] → h ∈ [0.5,1]（分越高越像人类，200 → 1）；
       T_eff ∈ [−999,0] → h ∈ [0,0.5]（0 分准-确证异形 → 0.5，−999 硬确证 → 0）。
       先验（76.9 起）天然落在 h≈0.69，异形挑目标随死亡重算自动聚焦人类。
       E 进合成（恐慌 = 短期认定他是敌人，可升级到开枪出刀）。 */
    const te=effT(a,t.i);
    const w=Math.max(0,Math.min(1,te/SK.AXIS.cap));
    /* 负端：|T_eff| 越负越像异形（−999 → wN=1 → h=0），无 if */
    const neg=Math.max(0,Math.min(1,-te/SK.AXIS.cap));
    return Math.max(0.01,Math.min(0.99,0.5*(1+w-neg)));
  }
  function identityAlien(a,t){
    if(!a||!t||!global.SKV3._t.G())return null;
    return 1-identityAxis(a,t);
  }
  function hostileProb(a,t){
    if(!a||!t)return 0;
    const h=identityAxis(a,t);
    return a.alien ? h : (1-h);
  }
  function trustProb(a,t){ return 1-hostileProb(a,t); }
  function hostileTo(a,t){ return hostileProb(a,t)>0.5; }

  /* 立场轴对"敌对"的贡献（R12.8）：只读 cred 的**偏离先验**那一段，
     并且按阵营取相反的一半 —— 人类看负端（带节奏带错过人 ⇒ 像异形），
     异形看正端（咬得真准 ⇒ 像人类对手）。这是同一条轴的第二个导出，不是第二张表。
     硬锚一律不参与：known / 队友有自己的分支，混进来就是重复计数。
     量纲：sus 与这一段同为 0~1 的"怀疑强度"，先验本身不计（否则残局人人 0.48 起步，
     激进档门槛 0.36 会变成见人就开枪）。 */
  /* T 的负端 = 敌对读数（R12.8）。这不是第三条轴：只是个人信任分在 0 以下的绝对值。
     硬锚不参与（known / 队友 / 明牌人类各有分支），避免重复计数。 */
  function axisThreat(a,i){
    const m=a&&a.mind;
    if(!m||i==null)return 0;
    if(m.known&&m.known[i])return 0;
    if(!a.alien&&m.knownHuman&&m.knownHuman[i])return 0;
    if(a.alien&&a.mates&&a.mates[i])return 0;
    const d=trustRaw(a,i)-currentPrior();
    /* 一条轴两个导出（R12.8，2026-11-21 改读相对先验）：
       人类看负偏（比先验更不像人 = 敌对）；异形看正盈余（比先验更像船员 = 目标）。 */
    return a.alien ? Math.max(0,d)/SK.AXIS.cap
                   : Math.max(0,-d)/SK.AXIS.cap;
  }
  /* beliefOf 已并入核心块（相对先验 + T+E 合成），此处留注释占位 */

  function topSus(a, min, forNight) {
    if (!a || !a.mind) return null;
    let best = null, bi = null, bestEnv = -1;
    /* 2026-11-05 G1：envEstimate 正式接进主推理链。
       只在**嫌疑分几乎打平**时用它破平局（差 ≤ MIND.envTieEps）：
       环境读数（自己记着的目击 / 当众指认 / 看得见的红光或拖尸）不另立一套权重，
       因此不会变成「按环境分数定罪」，也仍然不读任何人的私有 mind。 */
    const eps = (SK.MIND && SK.MIND.envTieEps) || 0.06;
    const th = (min == null ? 0.5 : min);
    /* 2026-11-18（用户裁定「改读统一轴」）：候选池不再只有 mind.sus。
       一条实证都没有、但反复带头把无辜者投出去的人，cred 已经在负端 ——
       他必须能被人类的开枪 / 点名 / 投票兜底读到，否则"扩散追责"就只是账面数字。
       分数一律走 beliefOf（嫌疑与立场取较强的一条），**门槛仍是原来那一条**。 */
    const seen = {};
    for (const k in a.mind.sus) seen[k] = 1;
    for (const k in a.mind.sus) {
      const i = +k, s = beliefOf(a, i, forNight);
      if (s < th) continue;
      /* 终结者明牌后的人类队友：不得再因旧嫌疑被点名 / 投票 / 开枪
         （2026-11-20 用户裁定）。异形侧不跳过 —— 明牌人类正是它的目标。 */
      if (!a.alien && a.mind.knownHuman && a.mind.knownHuman[i]) continue;
      const e = envEstimate(a, i);
      const env = e.score * e.conf;
      if (best == null || s > best + eps || (Math.abs(s - best) <= eps && env > bestEnv)) {
        best = s; bi = i; bestEnv = env;
      }
    }
    for (const k in (a.mind.cred || {})) {
      if (seen[k]) continue;
      const i = +k, s = beliefOf(a, i, forNight);
      if (s < th) continue;
      if (!a.alien && a.mind.knownHuman && a.mind.knownHuman[i]) continue;
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
    /* keepEmo(o, drop)：×0.8 跨夜衰减 + 小值截断。
       drop 是**调用方量纲**的截断线：影子账（trust/grudge/warm/humanT）仍是
       0~1 视图量纲用 0.05；E 主账已是 ±10 分量纲用 0.5（=旧 0.05 视图）。 */
    const keepEmo=(o,drop,mult)=>{const d=drop==null?0.05:drop;
      const m=(mult==null)?0.8:mult;
      const out={};for(const k in (o||{})){if(o[k]>d)out[k]=o[k]*m;}return out;};
    /* ---- T 跨夜：先验剥离 + 分段衰减（2026-11-21 用户裁定）----
       · 每次 death 重算先验（G.priorT，见 game.js），夜里结算时剥离**昨夜先验**、
         个人净分按「小分先消、大分记得久」的连续函数衰减，再叠上今夜先验；
       · coef(v) = decayFloor + decaySpan × min(1, |net|/decayAnchor)；
       · 确证 ∓999 走带外混合（s=1 不衰减），依旧不需要写入侧特例；
       · E 情绪 ×emoDecay（0.6，快衰减）。 */
    const keepT=(o,prevPrior,curPrior)=>{
      const out={},AXD=SK.AXIS;
      const pp=(prevPrior==null)?curPrior:prevPrior, cp=(curPrior==null)?pp:curPrior;
      for(const k in (o||{})){
        const v=o[k];
        const net=v-pp;                       /* 剥离先验：只剩个人净分 */
        const s=Math.max(0,Math.min(1,
          (Math.abs(net)-AXD.cap)/(AXD.certFloor-AXD.cap)));
        const coef=AXD.decayFloor+AXD.decaySpan*Math.min(1,Math.abs(net)/AXD.decayAnchor);
        /* 混合：确证（|net| 越过确证段）s→1，原值保留；常规 = 先验 + 净分×coef */
        const nv=v*s+(cp+net*coef)*(1-s);
        out[k]=Math.max(AXD.floor,Math.min(AXD.cap,+nv.toFixed(1)));
      }
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
    /* 翻案倒计时跨夜保留：每个目标最后一次"扣分行为"发生在第几夜 */
    const certNegNight=Object.assign({},oldM.certNegNight||{});
    /* 2026-11-22 nights=0：确证写入后当夜是否"仍无新扣分"（true=干净可降级） */
    const certDirty=Object.assign({},oldM.certDirty||{});
    a.mind={mem:[],sus:sus,why:keepWhy(sus),susNight:keepSusNight(sus,oldM.susNight),alert:0,
      T:keepT(oldM.T,G&&G.priorTPrev,G&&G.priorT),E:keepEmo(oldM.E,2,SK.AXIS.emoDecay),
      certNegNight:certNegNight,certDirty:certDirty,
      /* heard：注意力窗口（2026-11-08 用户裁定，同日修订）。
         长度上限 `ATTN.heardMax`（10）的**滑动窗口**：整局累积、不跨夜清零，
         满了由新证词顶掉最旧的一条（不是丢弃新证词）。
         ⚠ 试过"每场重置 10 条"：1000 局里 0 次触发 —— 每场实际证词不到 10 条，
         窗口从不填满，机制空转。所以只能是整局口径。 */
      heard:(oldM.heard||[]).slice(),
      noise:null,seenBy:{},seenT:{},
      lastBody:null,tone:(a.i||0)%3,
      trust:keepEmo(oldM.trust),grudge:keepEmo(oldM.grudge),
      /* 双分 P1 镜像：belief(T) / emo(E) / lock 由 susAdd / credAdd / known 写入点同步派生。
         旧轴仍是唯一真源，这里只保证跨夜重建不把镜像丢掉（P2 切换后这些才是主账）。 */
      belief:Object.assign({},oldM.belief||{}),emo:Object.assign({},oldM.emo||{}),
      lock:Object.assign({},oldM.lock||{}),
      /* cred：**正向信任**——"他干的是正经事"，和 trust（他帮过我）分开。
         来源全是可被目击的正经行为（做任务/修故障/合闸/拖人进医疗间/施救），
         异形伪装刷的就是这一条；作用是指控门槛、投票回避、证言加权。 */
      /* cred 影子（只读兼容）跨夜不衰减 —— 语义已改为 (T−prior)/200 视图，写入端维护 */
      cred:oldM.cred||{},
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
      /* humanT 已并轴（2026-11-21）：异形的"像船员"读数 = T 正端视图，
         旧字段不再创建；存量存档里的残留值随本行一并丢弃 */
      /* ally：软联盟计数（谁替谁说过话，保过几次）—— 跨夜保留但会随回合淡出 */
      ally:Object.assign({},oldM.ally||{}),
      known:keepKnown,redSeen:{},alibi:{},detainSeen:{},avoidSeen:{},hyps:[],
      /* rev：信念版本号（2026-11-05）。每次 susAdd 自增，会议里用来判断
         「我这票投出去之后，是不是又听到了什么」—— 没听到新东西就不跟风改票。 */
      rev:0};
    /* 2026-11-22「翻案机制」：确证若没有再扣分行为刷新，就从 ±999 退化为 ±100。
       nights>0（旧口径）：按"当前夜 − 最后扣分夜"判定；
       nights=0（二次裁定）：当晚结算即判 —— 看 certDirty（确证写入后置 true、
       之后任何扣分 axisAddT(w<0) 置 false）。dirty 为真 = 当夜无新扣分 → 降级；
       为假 = 当夜又看到扣分 → 不降级，但重置为 true 供下一夜重新观察。 */
    const CR=SK.AXIS.certRevert;
    if(CR&&CR.on&&G){
      const neg=a.mind.certNegNight, dirt=a.mind.certDirty||{};
      a.mind.certDirty=dirt;
      const zeroNight=(CR.nights||0)<=0;
      for(const k in a.mind.T){
        const v=a.mind.T[k], last=neg[k];
        if(Math.abs(v)<(SK.AXIS.certFloor||500))continue;
        if(zeroNight){
          if(dirt[k]===false){ dirt[k]=true; continue; }  /* 当夜又有扣分：保留确证，下一夜重看 */
        }else{
          if(last==null||(gn-last)<CR.nights)continue;
        }
        a.mind.T[k]=(v<0)?(CR.to!=null?CR.to:-100):(CR.toHuman!=null?CR.toHuman:100);
        /* 同步摘除铁证名单：否则 known 仍挡住"再次目击→重新确证"，翻案后无法自愈。
           证据链 mem 保留（"我确实见过他出刀"的记忆在，只是不再是不动摇的结论）。 */
        if(v<0){ if(a.mind.known)delete a.mind.known[k]; }
        else { if(a.mind.knownHuman)delete a.mind.knownHuman[k]; }
        delete dirt[k];
        if(global.SKTrust&&global.SKTrust.dualWrite)global.SKTrust.dualWrite(a,+k);
      }
    }
    /* 跨夜留下的嫌疑要重新评估准-确证（可能已跌破门槛 → 降级） */
    for(const k in a.mind.sus)evalAlmost(a,+k);
    /* P1 双写：sus / cred 刚被衰减过，镜像必须跟着重建，否则 belief 会停在昨夜的旧值 */
    if(global.SKTrust&&global.SKTrust.dualWrite){
      var keys={};
      for(const k in a.mind.sus)keys[k]=1;
      for(const k in a.mind.cred)keys[k]=1;
      for(const k in a.mind.known)keys[k]=1;
      for(const k in keys)global.SKTrust.dualWrite(a,+k);
    }
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

  /* 决策面读值：个人信任分的**正端**（0~1）。这是唯一的"他可信"读数，
     不再有独立的公开信誉轴（2026-11-20 两轴合并）。 */
  function credOf(a,i){
    /* 正向前科（2026-11-20 语义还原）：只读 cred 的正端，不减嫌疑。
       credOf 的读取点（指控护盾 / 投票挡票 / 证言权重 / almost.friend / 领袖可信度）
       问的都是「他做过多少正经事」，不是「他现在净信任多少」。改成净值会让一次嫌疑
       把整条护盾吃掉 —— 实测挡票数 0.481→0.004、almost.friend 大面积失效，
       等于废掉 R12.6/R12.8 的整条洗白链。身份判断另有 trustScore（净值 T）。 */
    return Math.max(0,credRaw(a,i));
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
      /* 只有带真实坐标的事件才算「噪声方位」。证言／投票类事件（heard_accuse /
         heard_frame / heard_vouch / heard_claim / presence_deny …）统一用 x:0,y:0
         当"没有位置"的占位；以前它们也会写进 noise，aiHuman 便去「0,0 看看」，
         那边不可走 ⇒ walkTo 永远返回 null ⇒ 人站着发呆（实测最长 11.7 秒）。 */
      if(ev.x>0&&ev.y>0)a.mind.noise={x:ev.x,y:ev.y,t:ev.t,kind:ev.kind};
    }
  }

  /* 2026-11-21 用户裁定「每夜筛子」：每个 AI 每夜最多吸纳 3 个**目击事件**，
     按分数绝对值优先 —— 名额满时只有更大的事件能挤掉最小的一条（并撤销旧分）。
     作用于目击类写入（susAdd / credAdd）；证言可信度 / 情绪 / 洗清不走这里。 */
  const EV_PER_NIGHT=4;   /* 2026-11-21 用户裁定：每夜可吸纳目击事件 3 → 4 */
  function budgetT(a,i,delta,reason){
    const G=global.SKV3._t.G();
    if(!G||!delta)return delta;
    if(!a._evN||a._evN.night!==G.night)a._evN={night:G.night,list:[]};
    const list=a._evN.list;
    if(list.length<EV_PER_NIGHT){list.push({i:i,d:delta,r:reason||''});return delta;}
    let mi=0;
    for(let k=1;k<EV_PER_NIGHT;k++)if(Math.abs(list[k].d)<Math.abs(list[mi].d))mi=k;
    if(Math.abs(delta)>Math.abs(list[mi].d)){
      const old=list[mi];
      axisAddT(a,old.i,-old.d);
      list[mi]={i:i,d:delta,r:reason||''};
      return delta;
    }
    return 0;
  }
  function susAdd(a,i,w,reason,ev){
    const G=global.SKV3._t.G();
    if(!a||i==null||i===a.i||!G||!w)return;
    if(!a.mind)mindReset(a);
    /* 一切分数化：疑点就是 T 减分（单位=分）。传闻链（别人讲的话）单条
       ≤ HEARD.cap（20 分）——「不是自己推出来的东西只在微小分值相加」。 */
    let gain=w*(SK.AXIS.scoreMul!=null?SK.AXIS.scoreMul:1);   /* 2026-11-21 分值抑制 ×0.75 */
    const isRelay=typeof reason==='string'&&
      (reason.indexOf('heard_')===0||reason.indexOf('relay')===0);
    if(isRelay)gain=Math.min(gain,SK.HEARD?SK.HEARD.cap:20);
    /* 2026-11-21 修符号 bug：susAdd 语义 = 嫌疑扣分，一律按 |gain| 扣。
       量化表里有负值条目（拉闸 −80 / 拖离 −20 / lootBullet −25），
       旧写法 -gain 会把负值变成**加分**（实测把"拖人进医疗间"记成嫌疑）。 */
    const applied=budgetT(a,i,-Math.abs(gain),reason);
    if(!applied)return;
    axisAddT(a,i,applied);
    if(G&&G.simStats){
      /* 审计遥测（2026-11-21）：按**目标阵营**分账，并记实际生效值（含筛子挤占/单笔钳制），
         避免拿 |gain| 虚报。A: = 打到异形身上，H: = 打到人类身上。 */
      const tgt=G.agents&&G.agents[i];
      const tag=(tgt&&tgt.alien)?'A:':'H:';
      const tb=G.simStats.tOut||(G.simStats.tOut={});
      tb[tag+(reason||'?')]=(tb[tag+(reason||'?')]||0)+applied;
    }
    /* 影子字段（只读兼容）：门禁夹具直接读 mind.sus；它不参与任何判定。
       新量纲：sus = (prior − T) / 200，clamp 0~1。 */
    if(!a.mind.sus)a.mind.sus={};
    a.mind.sus[i]=beliefOf(a,i,false);
    /* 记下这一笔来自第几夜：跨夜衰减 / 新鲜度判定仍要看证据时间 */
    a.mind.susNight=a.mind.susNight||{};
    a.mind.susNight[i]=G.night;
    const arr=a.mind.why[i]||(a.mind.why[i]=[]);
    arr.push({w:+gain.toFixed(3),reason:reason||'',kind:ev?ev.kind:'',
      night:G.night,
      t:ev?ev.t:evNow(),x:ev&&ev.x!=null?ev.x:null,y:ev&&ev.y!=null?ev.y:null,
      room:ev?ev.room:null});
    if(arr.length>8)arr.shift();
    a.mind.rev=(a.mind.rev|0)+1;
    refreshHyps(a);
    evalAlmost(a,i);
  }

  function evalAlmost(a,i){
    const G=global.SKV3._t.G();
    if(!a||!a.mind||i==null||i===a.i||!G)return;
    if(!a.mind.T)a.mind.T={};
    /* 影子回灌（只服务夹具/旧档）：**只在 T 从未落笔时发生一次**。
       新量纲：sus 影子 0~1 = (prior−T)/200 → T = prior − sus×200；
       cred 影子 0~1 = (T−prior)/200 → T = prior + cred×200。 */
    if(a.mind.T[i]==null){
      const c=(a.mind.cred&&a.mind.cred[i])||0, s=(a.mind.sus&&a.mind.sus[i])||0;
      if(c||s){
        const p=currentPrior();
        a.mind.T[i]=c>0 ? p+c*SK.AXIS.cap : p-s*SK.AXIS.cap;
      }
    }
    const A=SKSanity.ALMOST;
    if(!a.mind.almost)a.mind.almost={foe:{},friend:{}};
    const grid=a.mind.almost;
    const known=a.mind.known&&a.mind.known[i];
    /* --- 准-确证：纯分数判定（2026-11-21 用户裁定「0 分=准-确证异形 / 200=准-确证人类」，
       可逆：T 回升过线自动解除）。读 T+E 合成（情绪短期账也算数）。 --- */
    /* 2026-11-21：准-确证判定改用**纯 T**（不用 T+E）——
       E 是短期情绪（被指控/被煽动），它该影响投票倾向与敌对，
       但不该把一个人"变成准-确证异形"。旧写法让"被 4 个人指控"自动过线，
       形成'被指控→E 掉→准确证→更多人指控'的雪崩。 */
    const T0=trustRaw(a,i);
    const AX=SK.AXIS;
    const foeOk=!known&&T0<=AX.almostFoe;
    if(foeOk){
      const had=grid.foe&&grid.foe[i];
      grid.foe[i]={t:evNow(),sus:+Math.max(0,-(trustRaw(a,i))).toFixed(1),
        kinds:['score'],since:had&&had.since!=null?had.since:G.night,conf:1};
      if(!had&&G.simStats){
        G.simStats.almostCount=(G.simStats.almostCount||0)+1;
        const tgt=G.agents&&G.agents[i];
        if(tgt&&tgt.alien){
          G.simStats.almostAlien=(G.simStats.almostAlien||0)+1;
          /* 审计（2026-11-21）：破线是「T 自己就 ≤0」还是「T>0 被 E 拖过线」 */
          const rawT=trustRaw(a,i), e=(a.mind.E&&a.mind.E[i])||0;
          if(rawT>0)G.simStats.almostByE=(G.simStats.almostByE||0)+1;
          else G.simStats.almostByT=(G.simStats.almostByT||0)+1;
          if(e<-0.0001&&G.simStats.almostEsum!=null)G.simStats.almostEsum+=e;
          else if(e<-0.0001)G.simStats.almostEsum=e;
        }
        else G.simStats.almostHuman=(G.simStats.almostHuman||0)+1;
      }
      grid.friend&&delete grid.friend[i];
    }else if(grid.foe&&grid.foe[i])delete grid.foe[i];
    const surplus=trustRaw(a,i)-currentPrior();
    const friendOk=!known&&!grid.foe[i]&&T0>=AX.almostFriend;
    if(friendOk){
      const had=grid.friend&&grid.friend[i];
      grid.friend[i]={t:evNow(),cred:+surplus.toFixed(1),
        since:had&&had.since!=null?had.since:G.night,conf:1};
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
    trustCert(w,i,true);   /* 一切分数化：确证硬覆盖 = T −999 */
    if(w.mind.sus&&w.mind.sus[i])w.mind.sus[i]=1;   /* 影子视图同步：确证＝嫌疑拉满 */
    if(!g.foe[i])g.foe[i]={t:evNow(),sus:SK.AXIS.cap,kinds:['known'],since:G.night,conf:1};
    if(G.simStats){
      if(hadFriend)G.simStats.overriddenFriends=(G.simStats.overriddenFriends||0)+1;
    }
  }

  function susCut(a,i,w,reason,ev){
    const G=global.SKV3._t.G();
    if(!a||i==null||i===a.i||!G)return;
    if(!a.mind)mindReset(a);
    if(a.mind.known&&a.mind.known[i])return;
    /* 一切分数化：不在场证明洗清 = T 加分（旧 susCut 直接改 sus 账已废弃） */
    axisAddT(a,i,w*(SK.AXIS.scoreMul!=null?SK.AXIS.scoreMul:1));
    /* 影子字段同步（只读兼容）：门禁读 mind().sus 看洗清效果 */
    if(!a.mind.sus)a.mind.sus={};
    a.mind.sus[i]=beliefOf(a,i,false);
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
    if(!why.length)return null;
    /* 先取最后一条 saw_*：heard_shot 只是弱传闻，不能把更硬的目击句挤掉 */
    for(let k=why.length-1;k>=0;k--){
      const w=why[k];
      if(w&&typeof w.kind==='string'&&w.kind.indexOf('saw_')===0)return w;
    }
    return why[why.length-1];
  }

  /* 听觉受体：听者自己的记忆里，最近谁在声源附近出现过。
     不读开枪者真值、不读死者阵营；找不到就返回 null（只留噪声/去现场看）。 */
  function soundSubject(a,x,y){
    const G=global.SKV3._t.G();
    if(!a||!G||!a.mind)return null;
    const now=evNow();
    const age=(SK.SOUND&&SK.SOUND.suspectAge)||8;
    const rad=(SK.SOUND&&SK.SOUND.suspectRadius)||4;
    let best=null,bd=Infinity;
    for(const e of (a.mind.mem||[])){
      if(!e||e.kind!=='saw_agent'||e.subj==null)continue;
      if(e.night!=null&&e.night!==G.night)continue;
      if(e.t!=null&&now-e.t>age)continue;
      const d=Math.hypot((e.x||0)-x,(e.y||0)-y);
      if(d>rad||d>=bd)continue;
      const t=G.agents[e.subj];
      if(!t||t===a||!t.alive||t.downed||t.detained)continue;
      bd=d;best=e.subj;
    }
    return best;
  }

  /* 目击开枪后的信任增量：动作本身只给弱正值；已确知命中异形再加；
     已确知命中人类才减（knownHuman 目前没有生产端，留钩子，不伪造真值）。 */
  /* 玩家“我听见枪声”：给人类听众一条弱听觉；有对象才加弱嫌疑，无对象只留方位。 */
  function playerHeard(a,tgt,room,by,x,y,w){
    if(!a||a.alien||!a.mind)return;
    const ev={kind:'heard_shot',x:x||0,y:y||0,room:room||null,conf:0.4,src:'speech',
      subj:tgt==null?null:tgt,by:by};
    evPush(a,ev);
    if(tgt!=null&&w>0)susAdd(a,tgt,w,'heard_shot',ev);
  }

  function shotCred(w,actor,victim){
    /* 2026-11-21 用户裁定：开枪本身只加恐慌情绪（E，走 EMOTE.panicShot），
       不改 T；打死谁才回填目击者的 T —— 打死异形 +60 / 打死人类 −30。
       「打死谁」的判定读目击者自己的 known / 明牌，不读真实阵营。 */
    if(!w||!actor||!victim||!w.mind)return [];
    const out=[];
    if(w.mind.known&&w.mind.known[victim.i])out.push({w:60,reason:'shotAlien'});
    else if(w.mind.knownHuman&&w.mind.knownHuman[victim.i])out.push({w:-30,reason:'shotHuman'});
    return out;
  }

  function affordableAlmostShot(a,thr){
    const af=bestAlmostTarget(a);
    if(!af)return null;
    if(!liveTarget(af.i,a))return null;
    if(almostFriendOf(a,af.i))return null;
    if(!a.alien&&a.mind&&a.mind.knownHuman&&a.mind.knownHuman[af.i])return null;
    const v=beliefOf(a,af.i,true);
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
    saw_drag: '拖尸体', saw_detain: '被保安拘留', saw_shot: '开枪',
    saw_agent: '出现在那里'
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
      } else if (kd === 'heard_shot') {
        cues.push({ kind: 'heard_shot', w: 0.16,
          why: '枪响时他在' + (e.room || '现场'),
          alt: '枪声只给方位，也可能是别人' });
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
      : (String(best.kind).indexOf('heard') === 0 ? 'heard' : (best.kind === 'public' ? 'public' : 'seen'));
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
    trustScore: trustScore, trustRaw: trustRaw, axisAddT: axisAddT, trustCert: trustCert,
    effT: effT, currentPrior: currentPrior, budgetT: budgetT,
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
    soundSubject: soundSubject,
    playerHeard: playerHeard,
    shotCred: shotCred,
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
    hypothesisSpread: hypothesisSpread, hypothesisEvidence: hypothesisEvidence,
    /* 2026-11-18：统一身份轴从 js/game.js 归位到这里（数值真源仍是 SKSanity.IDENTITY） */
    hasIdEvidence: hasIdEvidence, identityPrior: identityPrior,
    identityAxis: identityAxis, identityAlien: identityAlien,
    hostileProb: hostileProb, trustProb: trustProb, hostileTo: hostileTo,
    axisThreat: axisThreat, beliefOf: beliefOf,
    /* 2026-11-20 两轴合并：T 的唯一计算入口；credRaw 只作证据累加器读数 */
    trustScore: trustScore, credRaw: credRaw
  });
})(typeof window !== 'undefined' ? window : globalThis);
