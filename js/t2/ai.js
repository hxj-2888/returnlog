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

  global.SKT2AI = Object.freeze({ susOf: susOf, topSus: topSus, crimeWindow: crimeWindow });
})(typeof window !== 'undefined' ? window : globalThis);
