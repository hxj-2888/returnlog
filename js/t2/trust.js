/* ==== ARCH NODE · 架构节点标注（根 ARCHITECTURE.md） ====
 * layer     : T2
 * domain    : AI 拟人化
 * definedBy : 双分模型（信任分 T + 情绪分 E）P0 影子
 * truth     : js/t2/trust.js#SKTrust
 * verify    : _t.trustShadow 探针 / 门禁认知段
 * flag      : N
 * note      : 只读派生，不写任何分数；P1 起才切主链
 * ============================================================== */
/* 信任分 / 情绪分 · P0 影子
   -------------------------------------------------------------
   目的：在不动旧轴的前提下，把「如果按 T/E 双分模型读，会得到什么」
   算出来，供新旧模型在投票/开枪目标上的分歧率对比。
   约束：
     · 本文件**只读** mind 的 sus/cred/known/trust/grudge，不写任何字段；
     · 不改变任何 AI 决策；P1 才把主链读值切过来；
     · 数值真源仍是 js/ai/sanity.js，本文件不新增任何平衡参数；
     · 经典 <script> 加载，必须在 t2/ai.js 之后。 */
(function (global) {
  'use strict';

  var T2 = null;
  function core() {
    if (!T2 && global.SKT2AI) T2 = global.SKT2AI;
    return T2;
  }
  function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }

  /* 旧身份轴 h（0~1，优先验 + cred） */
  function hOld(a, i) {
    var t = core();
    if (!a || i == null || !t) return 0.5;
    var G = global.SKV3 && global.SKV3._t && global.SKV3._t.G ? global.SKV3._t.G() : null;
    var tgt = G && G.agents ? G.agents[i] : null;
    if (!tgt) return 0.5;
    return clamp(t.identityAxis(a, tgt), 0, 1);
  }

  /* 影子 h：旧 h 减去 sus 的负轴位移。
     sus=1 时最多把 h 拉到 0.05；没有 sus 时保持旧 h。
     这不是最终模型，只是 P0 的对照读数。 */
  function hShadow(a, i) {
    var t = core();
    if (!a || !a.mind || i == null || !t) return 0.5;
    if (a.mind.known && a.mind.known[i]) return 0;
    var sus = t.susOf(a, i, false) || 0;
    return clamp(hOld(a, i) - sus * 0.6, 0.05, 0.99);
  }

  /* 信任分 T ∈ [−1, +1]：**唯一**的身份判断轴（2026-11-20 两轴合并）。
     T 由 t2/ai.js#trustScore 统一算：cred 正端与 sus 负端合成一条轴，
     known 硬锁 −1、knownHuman 硬锁 +1。trust.js 只做镜像与读数，不另立公式。 */
  function T(a, i) {
    var t = core();
    return t && t.trustScore ? +t.trustScore(a, i).toFixed(3) : 0;
  }
  function h(a, i) { return +((T(a, i) + 1) / 2).toFixed(3); }

  /* 情绪分 E 读出 ∈ [−1, +1] 视图：mind.E 存储为 ±10 分（与 T 同量纲），
     ÷scale 折回视图；仅旧档/夹具没有 E 时才从 trust−grudge 影子回灌（影子是视图量纲） */
  function E(a, i) {
    if (!a || !a.mind || i == null) return 0;
    var ev = a.mind.E || {};
    var sc = (global.SKSanity && global.SKSanity.AXIS && global.SKSanity.AXIS.scale) || 10;
    if (ev[i] != null) return +clamp(ev[i] / sc, -1, 1).toFixed(3);
    var tr = (a.mind.trust && a.mind.trust[i]) || 0;
    var gr = (a.mind.grudge && a.mind.grudge[i]) || 0;
    return +clamp(tr - gr, -1, 1).toFixed(3);
  }

  function locked(a, i) {
    return !!(a && a.mind &&
      ((a.mind.known && a.mind.known[i]) ||
       (!a.alien && a.mind.knownHuman && a.mind.knownHuman[i])));
  }

  function impression(a, i) {
    var t = core();
    return {
      T: T(a, i),
      h: h(a, i),
      hOld: +hOld(a, i).toFixed(3),
      E: E(a, i),
      locked: locked(a, i),
      sus: t ? +((t.susOf(a, i, false) || 0)).toFixed(3) : 0,
      cred: t ? +((t.credOf(a, i) || 0)).toFixed(3) : 0
    };
  }

  /* ---- P1 双写（2026-11-19）----
     由 game.js 的 susAdd / credAdd / known 写入点调用。只读旧轴派生，
     把结果镜像到 mind.belief(T) / mind.emo(E) / mind.lock：
       · 旧轴仍是唯一真源，所有判定继续读旧轴（双写期不改任何行为）；
       · P2 把决策读到 belief/emo 时，这里写的就是切换用的同一本账；
       · lock 只从 known 派生，不新建判定，误认照旧算数。 */
  function dualWrite(a, i) {
    if (!a || !a.mind || i == null || i === a.i) return;
    a.mind.belief = a.mind.belief || {};
    a.mind.emo = a.mind.emo || {};
    a.mind.lock = a.mind.lock || {};
    a.mind.belief[i] = T(a, i);
    a.mind.emo[i] = E(a, i);
    if (a.mind.known && a.mind.known[i]) {
      var k = a.mind.known[i];
      a.mind.lock[i] = { t: k.t, kind: k.kind, room: k.room, side: 'alien' };
    } else if (!a.alien && a.mind.knownHuman && a.mind.knownHuman[i]) {
      a.mind.lock[i] = { kind: 'knownHuman', side: 'human' };
    } else delete a.mind.lock[i];
  }

  global.SKTrust = Object.freeze({
    version: 2,
    dualWrite: dualWrite,
    h: h,
    hOld: hOld,
    T: T,
    E: E,
    locked: locked,
    impression: impression
  });
})(typeof window !== 'undefined' ? window : globalThis);
