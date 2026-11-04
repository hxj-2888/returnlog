/* ==== ARCH NODE · 架构节点标注（根 ARCHITECTURE.md） ====
 * layer     : T2
 * domain    : AI 拟人化
 * definedBy : 性格轴
 * truth     : js/ai/traits.js#SKTrait.C
 * verify    : 门禁系数断言
 * flag      : F  (F=现行事实 / N=规范裁定)
 * note      : 性格只影响本人行为
 * 说明      : 本注释只作架构标注，不改变任何运行逻辑；多父只引用不复制。
 * ============================================================== */
/* =============================================================
 * 新返航录 · 性格轴声明层（Traits）
 *
 * 职责：**只声明「倾向 → 系数」的映射**，不写任何判定流程。
 *   game.js 里所有「激进一点的 AI 会怎样」都只能调 SKTrait.C.*，
 *   不允许在业务代码里再散写 12 / 0.55 / 0.7 这类魔法数。
 *
 * 设计来源：本项目的太空杀旧分支（form-ui-original / 过渡版）里
 *   有一套 SKTrait + 效用函数的做法（档位声明 + 性格化门槛），
 *   这里**只继承结构、不继承数值**——旧分支是给表单式对局调的手感，
 *   搬进实时对抗会毁节奏，所以阈值按实时对局重写（见各 COEF 注释）。
 *
 * 四条轴（0~100，中性 50）：
 *   aggr 激进：更敢出刀 / 开枪 / 投票 / 更快开工 / 更不服软
 *   caut 谨慎：更容易弃权、更容易被目击吓退
 *   soc  社交：更爱发言、替人辩护、跟票
 *   cur  好奇：更爱搜尸、绕路查看
 *
 * 抽档用三档分布（28 / 50 / 72，概率 30 / 40 / 30），
 * 保证每局都有敢冲的、怂的、和事佬，而不是全员 50 的均匀噪声。
 * ============================================================= */
(function (global) {
  const AXES = ['aggr', 'caut', 'soc', 'cur'];
  const NEUTRAL = 50;
  const BANDS = [[28, 0.30], [50, 0.40], [72, 0.30]];
  /* 性格压缩：由理智层统一给（SKSanity.TRAIT_GAIN）。默认 0.45 —— 性格仍然分档，
     但激进与保守的行为差异被压到原来的 45%，避免"激进=当众杀人"那种断崖。
     本文件不自己写这个数：方差是全局策略，归 SKSanity 管。 */
  const GAIN = (global.SKSanity && global.SKSanity.TRAIT_GAIN) || 1;

  function pick(rnd) {
    const r = (rnd || Math.random)();
    let acc = 0;
    for (const [v, p] of BANDS) { acc += p; if (r <= acc) return v; }
    return NEUTRAL;
  }
  function roll(rnd) {
    const o = {};
    for (const k of AXES) o[k] = pick(rnd);
    return o;
  }
  /* 档位 → [-1, 1]：0 = 中性，+1 = 该轴拉满（已乘性格压缩系数 GAIN） */
  function b(a, axis) {
    const t = a && a.trait;
    const v = t && t[axis] != null ? t[axis] : NEUTRAL;
    return ((v - NEUTRAL) / 50) * GAIN;
  }

  /* 具名系数：**唯一真源**。注释里的数值是「中性档（50）」的基线，
     改动时只需要保证中性档回到原行为，A/B 才可比。 */
  const C = {
    /* 异形挑目标：有人在 6 格内看着时的惩罚（基线 12 格）。
       激进的人不太在乎被看见（×0.45），谨慎的人会躲得更远（×1.45）。 */
    knifeWatcherPenalty: a => 12 * (1 - 0.55 * b(a, 'aggr') + 0.45 * b(a, 'caut')),
    /* 异形挑目标：对「正在站桩做事的人」的优先度（基线 -12 格） */
    knifeBusyBonus: a => -12 * (1 + 0.35 * b(a, 'aggr')),
    /* 异形：贴脸出刀的距离门槛（基线 1.3 格，见 aiTickAlien 的 td<1.3 判定） */
    knifeReach: a => 1.3 * (1 + 0.22 * b(a, 'aggr')),
    /* 异形：旁边有目击者时仍然出手的胆量。**只在理智层给的窄区间里浮动**：
       基线 0.50 ± 0.16（0.34~0.66）。旧版 0.12~0.95 的跨度把"谨慎"变成
       "永远不出刀"、把"激进"变成"当众杀人"，已被理智线否掉（见 SKSanity.KNIFE）。 */
    knifeBold: a => {
      const K = (global.SKSanity && global.SKSanity.KNIFE) || { boldBase: 0.5, boldSpan: 0.16 };
      return Math.max(0.30, Math.min(0.72,
        K.boldBase + K.boldSpan * b(a, 'aggr') - K.boldSpan * b(a, 'caut')));
    },
    /* 目击者人数的硬上限：**统一取理智层的值**，性格不再改它。
       三个人能看到就一定放弃——这是理智线，不是性格差异。 */
    knifeWatcherCap: () => ((global.SKSanity && global.SKSanity.KNIFE)
      ? global.SKSanity.KNIFE.witnessCap : 3),
    /* 人类开枪：需要的嫌疑分（基线 0.50）。激进 0.36 就敢打，谨慎要 0.60 */
    shootSus: a => 0.50 - 0.14 * b(a, 'aggr') + 0.10 * b(a, 'caut'),
    /* 投票弃权率。基线 0.52（比旧版 0.42 略高：性格化之后人类整体更敢投人，
       若基线不变，异形会被冤枉到 73:26 的雪崩局——2026-10-31 实测后回调）。
       2026-11-02 试过回落到 0.44，结果**反而**让人类更准（票多 → 证据被更多票兑现，
       alienEx 1.88→1.96、humanEx 不动）：弃权率高不是"冤枉"的来源，别拿它当误判阀。
       激进仍 0.18 就敢投，谨慎 0.70。 */
    voteAbstain: a => Math.max(0, 0.52 - 0.34 * b(a, 'aggr') + 0.18 * b(a, 'caut')),
    /* 开局错峰延迟缩放（基线 1.0 = 2~8 秒）。激进的人一进夜就冲 */
    delayScale: a => Math.max(0.25, 1 - 0.45 * b(a, 'aggr') + 0.30 * b(a, 'caut')),
    /* 弃修阈值缩放（基线 1.0）：激进的人在危险里多站一会儿也不跑 */
    fleeThreshold: a => 1 + 0.60 * b(a, 'aggr'),
    /* 搜尸/看一眼的意愿 */
    lootScale: a => 1 + 0.70 * b(a, 'cur'),
    /* 替人辩护概率（基线 0.55，见 decideHumanDefend） */
    defendChance: a => Math.min(0.92, 0.55 + 0.30 * b(a, 'soc') + 0.10 * b(a, 'aggr')),
    /* 跟票概率（有人带头指控时，基线 0.60，见 startChatter 的 supporter 段） */
    followChance: a => Math.min(0.95, 0.60 + 0.28 * b(a, 'soc') + 0.15 * b(a, 'aggr')),
    /* 情绪：被指控后记仇的强度（见 grudgeAdd） */
    grudgeGain: a => 1 + 0.45 * b(a, 'aggr') + 0.20 * b(a, 'caut'),
    /* 情绪：被辩护后记恩的强度（见 trustAdd） */
    trustGain: a => 1 + 0.40 * b(a, 'soc'),
    /* 情绪影响投票：对「欠人情 / 有仇」的目标的附加分（格） */
    voteGrudgePull: a => 6 * (1 + 0.5 * b(a, 'aggr')),
    voteTrustPush: a => 5 * (1 + 0.5 * b(a, 'soc')),
  };

  /* 性格档位 → 中文标签的包装曾在这里（label），但全仓没有调用点：
     DEV 面板与台词都直接读四轴数值。要用时再按实际展示需求加回来。 */

  global.SKTrait = { AXES, NEUTRAL, BANDS, roll, pick, b, C };

  /* ---- 团队量化表（2026-11-01，初步预览版）----
     与 SKTrait.C（个人量化表）分层：个人表回答「我做这件事值不值」，
     团队表回答「这件事还需要我做吗」。两个表都必须只在这里声明，
     后续迭代在这两张表上加系数，禁止回退成 if 硬编码。 */
  global.SKTeam = {
    /* 同一故障的响应人数上限：超过即边际收益为负——
       看到很多人往同一个故障点去，AI 会认定别人能修好，转去做任务（防踩踏）。
       这是团队量化的第一课：公共目标的价值随响应人数递减。 */
    FIX_CREW_CAP: 3,
    /* 拆机器人（只能刀/枪，用户裁定）。
       2026-11-02 用户裁定：**大幅降低异形对保安机器人的攻击欲望** ——
       13 → 8：低于贴脸出刀（12）与可追目标（9），所以**身边有猎物时不去拆机器人**；
       只有"围攻成立（secbotRaidOk）且附近没有更好猎物"时才会真的去拆。
       医疗无人机挡救援、价值独立，保持 8 不变。 */
    BOT_SEC_VALUE: 8,
    BOT_MED_VALUE: 8,
    /* 断电与破坏的**团队价值**（不是期望扣分）：
       断电 = 全船视野压制 + 监控中断 + 门禁安检，价值**高于**一次破坏的牵制 ——
       否则"1 秒下手、无需站桩"的破坏会永远挤掉要站 3~9 秒的拉闸（首版实测拉闸被挤死）。
       破坏 = 牵制（把 2 名人类 + 幽灵钉在修复上 10~20 秒），就算被修掉牵制也已发生。 */
    BREAKER_VALUE: 14,
    SABOTAGE_VALUE: 8,
  };
})(window);
