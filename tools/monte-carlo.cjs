/* 新返航录 · 蒙特卡洛对局模拟（AI 对 AI，无玩家）
 * ------------------------------------------------------------
 * 用法：node tools/monte-carlo.cjs [--games 1000] [--seed 20261030]
 *        [--dt 0.1] [--max-nights 15] [--out tools/mc-results.json]
 * 依赖：playwright-core（同 test-v3.cjs；可用 PLAYWRIGHT_CORE 指定）
 *
 * 方法：
 * - 浏览器里启动旁观者局，再调用 _t.simGame：真实 update/AI/会议逻辑，
 *   用 simT 模拟时钟、即时会议；跳过渲染/HUD/音效/自动不变量。
 * - 每局用 seed 接管 Math.random，可复现。
 * - 夜会议按 30 秒（25 讨论 + 5 投票）扣夜；白天会议不占夜。
 * - 不模拟玩家自由发言；这是 AI 对 AI 的基准胜率。
 */
const path = require('path');
const fs = require('fs');

function loadPlaywright() {
  const candidates = [process.env.PLAYWRIGHT_CORE, 'playwright-core'].filter(Boolean);
  const errors = [];
  for (const c of candidates) {
    try { return require(c); } catch (e) { errors.push(c + ': ' + (e.code || e.message)); }
  }
  throw new Error('未找到 playwright-core。请 npm i -D playwright-core，或设置 PLAYWRIGHT_CORE。\n  ' + errors.join('\n  '));
}

function arg(name, def) {
  const i = process.argv.indexOf('--' + name);
  return i >= 0 && process.argv[i + 1] != null ? process.argv[i + 1] : def;
}

const { chromium } = loadPlaywright();
const DIR = path.resolve(__dirname, '..');
const URL = 'file:///' + DIR.replace(/\\/g, '/') + '/index.html?test';
const GAMES = Math.max(1, parseInt(arg('games', '1000'), 10) || 1000);
const BASE_SEED = (parseInt(arg('seed', '20261030'), 10) >>> 0);
const DT = Math.max(0.05, Math.min(0.2, parseFloat(arg('dt', '0.1')) || 0.1));
const MAX_NIGHTS = Math.max(1, parseInt(arg('max-nights', '15'), 10) || 15);
const OUT = path.resolve(DIR, arg('out', 'tools/mc-results.json'));
const REPORT = path.resolve(DIR, arg('report', 'tools/mc-report.md'));
const GAME_TIMEOUT = Math.max(1000, parseInt(arg('game-timeout', '20000'), 10) || 20000);
const VERBOSE = process.env.MC_VERBOSE === '1' || arg('verbose', '0') === '1';
const MAX_STEPS = Math.max(0, parseInt(arg('max-steps', '0'), 10) || 0);
/* A/B 归因开关（2026-11-06）：--no-discuss 还原旧模拟口径（讨论发言不执行）；
   --hypgap 调整并列弃权的权重差阈值（-1 彻底关闭）；
   --hypmode loose 还原 2026-11-06 之前的宽松判据。
   全部只作用于本次运行（模块级变量 / SKSanity 表），不改磁盘真源。 */
const NO_DISCUSS = arg('no-discuss', '0') === '1';
const HYP_GAP = arg('hypgap', null);
const HYP_MODE = arg('hypmode', null);
/* 2026-11-06：--social 0 关掉异形「社交顺势」（A/B 归因用），只作用于本次运行。 */
const SOCIAL_ON = arg('social', '1') !== '0';
/* 2026-11-06：--heard 0 关掉「传闻补证据种类」（A/B 用），只作用于本次运行。 */
const HEARD_KINDS = arg('heard', null);
/* 2026-11-07：--misid 0 关掉「目击认错人」（A/B 用），只作用于本次运行。 */
const MISID_CHANCE = arg('misid', null);

function mean(a, key) {
  const xs = a.map(r => +r[key]).filter(Number.isFinite);
  return xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : 0;
}
function median(a, key) {
  const xs = a.map(r => +r[key]).filter(Number.isFinite).sort((x, y) => x - y);
  if (!xs.length) return 0;
  const m = Math.floor(xs.length / 2);
  return xs.length % 2 ? xs[m] : (xs[m - 1] + xs[m]) / 2;
}
function pct(n, d) { return d ? +(n / d * 100).toFixed(2) : 0; }

/* ================= 中文别名表（2026-11-06 用户批准） =================
   报表里的指标名沿用代码计数器（英文驼峰），读起来像天书。
   这里给出中文对照：动态表的「指标」列直接显示「中文（代码键）」，
   文末再附一份按含义分组的完整速查表。新增指标忘了补中文时，
   writeOut 会在控制台点名，不会静默漏掉。 */
const LABELS = {
  nights:'夜数', prog:'维修进度分', steps:'模拟步数', meetings:'会议次数',
  knives:'出刀次数', shots:'开枪次数', sabotages:'破坏次数', exiles:'驱逐总人数',
  humanExiles:'被逐人类数', alienExiles:'被逐异形数', searches:'搜尸次数', loots:'拾取次数',
  bulletsLooted:'捡到子弹数', medkitsLooted:'捡到医疗包数', qualsLooted:'捡到申请单数',
  humanLoots:'人类拾取次数', alienLoots:'异形拾取次数',
  humanShots:'人类开枪次数', alienShots:'异形开枪次数',
  fakeRepairs:'假装修理次数', fakeTasks:'假装做任务次数', fakeBreaker:'假装合闸次数',
  rushKills:'放倒后加速次数', alienTasks:'异形真做任务次数', revives:'救起次数',
  alienPipes:'钻管道次数', alienPipePlans:'钻管道计划次数',
  humans:'局末存活人类数', aliens:'局末存活异形数', downed:'濒死人数',
  terminatorGames:'打到终结者夜的局数', terminatorArms:'终结者补枪次数',
  orders:'领袖指令次数', orderObey:'照办指令次数', orderRefuse:'拒绝指令次数',
  endorses:'当众背书次数', credFollow:'跟着背书次数',
  realFixes:'异形真修故障次数', realRevives:'异形真救人次数',
  credShieldVotes:'信任挡票数', abstains:'弃权票数',
  streakCuts:'连说让位次数', lineDups:'台词重复次数', mutualFrames:'互相构陷次数',
  medbotRevives:'无人机救起次数', medkitRevives:'医疗包救起次数',
  ghostTasks:'幽灵做任务个数', ghostFixes:'幽灵修故障次数',
  humanDefends:'人类替人辩护次数', reportDoubts:'质疑报案太快次数',
  sabHits:'破坏命中次数', sabFixed:'破坏被修次数',
  sabFixSec:'破坏修复耗时（秒）', sabFixedByGhost:'幽灵抢修次数',
  contradictions:'口供矛盾次数', falseContradictions:'旧量词会冤枉人的次数',
  contradictionOld:'旧量词诊断次数',
  knownWrites:'确证写入次数', knownVotes:'确证票数', ejectByKnown:'确证驱逐次数',
  knownWritesAlien:'确证写入·目标是异形', knownWritesHuman:'确证写入·目标是人类',
  knownVotesAlien:'确证票·投给异形', knownVotesHuman:'确证票·投给人类',
  ejectByKnownAlien:'确证驱逐·逐出异形', ejectByKnownHuman:'确证驱逐·逐出人类',
  almostAlien:'准-确证·目标是异形', almostHuman:'准-确证·目标是人类',
  almostEjectAlien:'准-确证驱逐·逐出异形', almostEjectHuman:'准-确证驱逐·逐出人类',
  fakeBreakerRolls:'当众合闸·掷骰次数', fakeBreakerPlans:'当众合闸·计划选中次数',
  busAccusals:'异形指控队友次数',
  mateFollowVotes:'异形伙同跟票数',
  detainWitness:'拘留被目击次数', detainEvictions:'被拘留者最终被逐次数',
  susCarry:'跨夜嫌疑存量',
  almostCount:'准-确证·敌次数', almostFriendCount:'准-确证·友次数',
  almostEject:'准-确证驱逐次数', almostVotes:'准-确证票数',
  overriddenFriends:'确证覆盖好友次数',
  reliaWrites:'证言可信度写入次数', reliaSpread:'局末可信度极差',
  hedgeAgents:'犹豫不点名席次数', sureAgents:'敢点名席次数',
  silentSus:'沉默线索次数', presenceDeny:'在场反驳次数',
  claimRecall:'跨夜口供被指出次数', retractCount:'认错次数',
  avoidCount:'夜里躲开咬人者次数', farSight:'远距离目击次数',
  allyRevealed:'软联盟连坐次数', friendShield:'好友挡票数',
  avoidSus:'绕开行为记为弱证据次数',
  reportsUsed:'报告额度用量', nightMeetFull:'会议满被拒次数',
  earlyVotes:'早投票数', voteChanges:'听到发言后改票次数', earlyKept:'早投保留到终局票数',
  reachImpossible:'不在场口供「走不到」次数', statementDamp:'指控与背书冲突压声次数',
  discussLines:'模拟讨论发言条数', vouchHeard:'听众收到背书次数',
  hypothesisAbstain:'并列假说难分而弃权票数',
  alienPileOns:'异形顺势踩人次数', alienFrameFollow:'构陷顺着场上靶子次数',
  almostHeard:'靠传闻补种类才成立的准-确证次数',
  misIdWrites:'目击认错人次数（known 指向了另一个人）',
  misIdToAlien:'认错后指到的其实是异形',
  misIdToHuman:'认错后指到的是无辜人类',
  misIdRealHuman:'认错时真凶本身也是人类（拉闸被看见）'
};
const LABEL_GROUPS = [
  ['一局有多长 / 胜负', 'nights prog steps meetings terminatorGames terminatorArms humans aliens downed'],
  ['打斗与物资', 'knives shots sabotages exiles humanExiles alienExiles searches loots bulletsLooted medkitsLooted qualsLooted humanLoots alienLoots humanShots alienShots sabHits sabFixed sabFixSec sabFixedByGhost'],
  ['异形行动 / 伪装', 'fakeRepairs fakeTasks fakeBreaker fakeBreakerRolls fakeBreakerPlans busAccusals mateFollowVotes alienPileOns alienFrameFollow realFixes realRevives alienTasks alienPipes alienPipePlans rushKills revives medbotRevives medkitRevives ghostTasks ghostFixes'],
  ['会议与发言', 'orders orderObey orderRefuse endorses credFollow credShieldVotes abstains streakCuts lineDups mutualFrames humanDefends reportDoubts discussLines vouchHeard'],
  ['推理 · 确证与准-确证', 'knownWrites knownVotes ejectByKnown detainWitness detainEvictions almostCount almostFriendCount almostHeard misIdWrites misIdToAlien misIdToHuman misIdRealHuman almostEject almostVotes overriddenFriends susCarry'],
  ['证据命中目标（审计）', 'knownWritesAlien knownWritesHuman knownVotesAlien knownVotesHuman ejectByKnownAlien ejectByKnownHuman almostAlien almostHuman almostEjectAlien almostEjectHuman'],
  ['推理 · 口供与可信度', 'contradictions falseContradictions contradictionOld reliaWrites reliaSpread hedgeAgents sureAgents silentSus presenceDeny claimRecall retractCount'],
  ['推理 · 行为线索', 'avoidCount farSight allyRevealed friendShield avoidSus reportsUsed nightMeetFull'],
  ['推理 · 投票与判断结构', 'earlyVotes voteChanges earlyKept reachImpossible statementDamp hypothesisAbstain']
];
function L(k) { return LABELS[k] ? LABELS[k] + '（' + k + '）' : k; }
/* 手写专题表的一行：中文指标 + 值 + 说明 */
function row(k, v, note) { return '| ' + L(k) + ' | ' + v + ' | ' + note + ' |'; }
/* 读 SKSanity 的当前配置（js/ai/sanity.js 是纯模块，Node 里可以直接 eval）。
   报告里必须写清"这批局用的是哪套数"，否则隔一周没人知道 56.5% 对应什么参数。 */
function readCfg() {
  try {
    const win = {};
    new Function('window', require('fs').readFileSync(
      path.resolve(__dirname, '..', 'js/ai/sanity.js'), 'utf8'))(win);
    const S = win.SKSanity || {};
    const M = S.MEET || {}, N = S.NIGHT || {}, W = S.WIN || {}, D = S.DISGUISE || {};
    return {
      nightLen: N.len, meetPerNight: M.perNight, reportsPerAgent: M.reportsPerAgent,
      discussDay: M.discussDay, discussNight: M.discussNight,
      voteDay: M.voteDay, voteNight: M.voteNight, reveal: M.reveal,
      winPts: W.pts, faultPenalty: W.faultPenalty,
      alienDarkR: SIGHT_R(S, 'alienDarkR'), humanDarkR: SIGHT_R(S, 'humanDarkR'),
      aiCapR: (S.SIGHT || {}).aiCapR, confirmNearR: (S.CONFIRM || {}).nearR,
      almostFoeSus: (S.ALMOST || {}).foeSus, almostFriendCred: (S.ALMOST || {}).friendCred,
      redBodyDur: (S.RED_BODY || {}).dur,
      voteNeed: (S.VOTE || {}).need, voteLateNeed: (S.VOTE || {}).lateNeed,
      voteLateAt: (S.VOTE || {}).lateAt,
      huntMemorySec: (S.HUNT || {}).memorySec, rushMul: (S.RUSH || {}).mul,
      terminatorNight: (S.TERMINATOR || {}).night, disguiseCooldown: D.cooldown,
      breakerChance: D.breakerChance, busChance: (S.MISLEAD || {}).busChance,
      almostHeardKinds: (S.ALMOST || {}).heardKinds,
      misIdChance: (S.MISID || {}).chance,
      socialPileOn: (S.SOCIAL || {}).pileOn, socialFrameFollow: (S.SOCIAL || {}).frameFollow,
    };
  } catch (e) { return { cfgError: e.message }; }
}
function SIGHT_R(S, k) { return (S.SIGHT || {})[k]; }
function quantile(xs, q) {
  const v = xs.filter(Number.isFinite).slice().sort((a, b) => a - b);
  if (!v.length) return 0;
  const i = Math.min(v.length - 1, Math.max(0, Math.round((v.length - 1) * q)));
  return +v[i].toFixed(3);
}
/* Wilson 区间（小样本/极端比例下比正态区间稳） */
function wilson(k, n) {
  if (!n) return [0, 0];
  const p = k / n, z = 1.96, d = 1 + z * z / n;
  const c = (p + z * z / (2 * n)) / d;
  const h = z * Math.sqrt(p * (1 - p) / n + z * z / (4 * n * n)) / d;
  return [+(Math.max(0, c - h) * 100).toFixed(2), +(Math.min(1, c + h) * 100).toFixed(2)];
}
/* 分桶：edges 为 [下,上] 闭区间数组，返回每桶的局数与人类胜率 + Wilson 区间 */
function bucket(results, key, edges) {
  return edges.map(([lo, hi]) => {
    const g = results.filter(r => {
      const v = +r[key];
      return Number.isFinite(v) && v >= lo && v <= hi;
    });
    const hw = g.filter(r => r.winner === 'human').length;
    return { label: (lo === 0 ? '≤' + hi : (hi >= 1e9 ? '≥' + lo : lo + '~' + hi)),
      games: g.length, share: pct(g.length, results.length),
      humanWin: pct(hw, g.length), ci: wilson(hw, g.length),
      avgNights: +mean(g, 'nights').toFixed(2), avgProg: +mean(g, 'prog').toFixed(2),
      avgKnives: +mean(g, 'knives').toFixed(2), avgMeetings: +mean(g, 'meetings').toFixed(2) };
  }).filter(b => b.games > 0);
}

function summarize(results) {
  const n = results.length;
  const by = k => results.filter(r => r.winner === k).length;
  const why = {};
  for (const r of results) why[r.why] = (why[r.why] || 0) + 1;
  const human = by('human'), alien = by('alien'), timeout = by('timeout');
  const p = human / (n || 1);
  /* Wilson 区间：0/1000 时普通二项正态区间会退化成 100~100 */
  const z = 1.96, nz = n || 1;
  const denom = 1 + z * z / nz;
  const center = (p + z * z / (2 * nz)) / denom;
  const half = z * Math.sqrt(p * (1 - p) / nz + z * z / (4 * nz * nz)) / denom;
  const ciLo = Math.max(0, center - half), ciHi = Math.min(1, center + half);
  const keys = ['nights', 'prog', 'steps', 'meetings', 'knives', 'shots', 'sabotages',
    'exiles', 'humanExiles', 'alienExiles', 'searches', 'loots', 'bulletsLooted',
    'medkitsLooted', 'qualsLooted', 'humanLoots', 'alienLoots', 'humanShots',
    'alienShots', 'fakeRepairs', 'fakeTasks', 'fakeBreaker', 'fakeBreakerRolls',
    'fakeBreakerPlans', 'busAccusals', 'mateFollowVotes', 'rushKills', 'alienTasks', 'revives', 'alienPipes',
    'alienPipePlans', 'humans', 'aliens', 'downed',
    /* 2026-11-03 新增：终结者时刻到达率与补枪数（均值即"多少比例的局打得进第 10 夜"） */
    'terminatorGames', 'terminatorArms',
    /* 2026-11-03 新增：信任聚焦 / 领袖服从 / 贵信号（这些是"机制有没有落地"的判据） */
    'orders', 'orderObey', 'orderRefuse', 'endorses', 'credFollow',
    'realFixes', 'realRevives', 'credShieldVotes', 'abstains',
    'streakCuts', 'lineDups', 'mutualFrames',
    /* 2026-10-31 新增：医疗无人机救治 / 医疗包施救 / 幽灵任务 / 幽灵修故障 /
       人类辩护 / 异形质疑快速报案者 */
    'medbotRevives', 'medkitRevives', 'ghostTasks', 'ghostFixes',
    'humanDefends', 'reportDoubts',
    /* 2026-11-01 破坏技能探查 */
    'sabotages', 'sabHits', 'sabFixed', 'sabFixSec', 'sabFixedByGhost',
    /* 2026-11-01 推理质量：拆谎误判 / 确证触发 / 拘留证据 */
    'contradictions', 'falseContradictions', 'contradictionOld', 'knownWrites', 'knownVotes',
    'ejectByKnown', 'detainWitness', 'detainEvictions',
    /* 2026-11-06 证据目标审计：确证/准-确证到底落在真异形还是人类身上 */
    'knownWritesAlien', 'knownWritesHuman', 'knownVotesAlien', 'knownVotesHuman',
    'ejectByKnownAlien', 'ejectByKnownHuman', 'almostAlien', 'almostHuman',
    'almostEjectAlien', 'almostEjectHuman',
    /* 2026-11-01 推理引擎规范化：跨夜痕迹 / 准-确证 / 可信度 / 熵沉默 / 在场反驳 */
    'susCarry', 'almostCount', 'almostFriendCount', 'almostEject', 'almostVotes',
    'overriddenFriends', 'reliaWrites', 'reliaSpread', 'hedgeAgents', 'sureAgents',
    'silentSus', 'presenceDeny', 'claimRecall', 'retractCount', 'avoidCount',
    /* 2026-11-02：证据分级 / 联盟连坐 / 伪装挡票 / 回避可观察 */
    'farSight', 'allyRevealed', 'friendShield', 'avoidSus',
    /* 2026-11-02 节奏：报告额度用量 / 因额度或场次被拒的会议 */
    'reportsUsed', 'nightMeetFull',
    /* 2026-11-05 会议中改票：早投 / 依发言改票 / 早投票最终保留 */
    'earlyVotes', 'voteChanges', 'earlyKept',
    'reachImpossible', 'statementDamp', 'discussLines', 'vouchHeard',
    /* 2026-11-06 异形社交顺势（AI 拟人化）：顺势踩人 / 构陷顺着场上靶子 */
    'alienPileOns', 'alienFrameFollow', 'almostHeard',
    'misIdWrites', 'misIdToAlien', 'misIdToHuman', 'misIdRealHuman',
    'hypothesisAbstain'];
  const avg = {}, med = {};
  for (const k of keys) { avg[k] = +mean(results, k).toFixed(3); med[k] = +median(results, k).toFixed(3); }
  /* 分任务点完成次数：把所有局里每个 label 的计数加起来再除以局数 = 每局平均完成次数。
     用来回答「电路维修是不是几乎没人做」——先测不改行为。 */
  const byPoint = {};
  for (const r of results) {
    const t = r.tasksByPoint || {};
    for (const k of Object.keys(t)) byPoint[k] = (byPoint[k] || 0) + (+t[k] || 0);
  }
  const tasksPerGame = {};
  for (const k of Object.keys(byPoint)) tasksPerGame[k] = +(byPoint[k] / (n || 1)).toFixed(3);
  /* 破坏技能探查（2026-11-01）：下手 → 命中(-5 生效) → 被修 的漏斗，
     顺便看异形每夜的使用率（机会数 = 4 异形 × 夜数 × 1 次/夜）。 */
  const sabOpp = results.reduce((s, r) => s + (r.nights || 0) * 4, 0) / (n || 1);
  const sab = {
    triesPerGame: +(mean(results, 'sabotages')).toFixed(3),
    oppPerGame: +sabOpp.toFixed(1),
    useRate: +(mean(results, 'sabotages') / (sabOpp || 1) * 100).toFixed(1),
    hitsPerGame: +(mean(results, 'sabHits')).toFixed(3),
    fixedPerGame: +(mean(results, 'sabFixed')).toFixed(3),
    hitRate: 0,
    avgFixSec: +(mean(results, 'sabFixSec')).toFixed(1),
    ghostFixedPerGame: +(mean(results, 'sabFixedByGhost')).toFixed(3),
  };
  const tries = sab.triesPerGame;
  sab.hitRate = tries ? +((sab.hitsPerGame / tries) * 100).toFixed(1) : 0;
  /* ---------------- 2026-11-03 报告要素扩充（用户：尽可能扩充，便于看怎么调平衡） ----------------
     只加读数，**不动任何数值与判定**。三件事是调平衡时真正要盯的：
       ① 机制触达率：新加的机制（背书/领袖/贵信号/伪装/终结者）到底在多少比例的对局里发生过？
          均值 0.05 这种数看不出是「每局都有一点点」还是「20 局里 1 局爆了」——所以按局数分布报。
       ② 分桶胜率：把单一变量（刀数 / 夜数 / 会议数 / 驱逐数 / 进度）切片，看胜率断崖在哪儿。
       ③ 交叉表：结束原因 × 胜者，回答「人类赢是靠修完还是靠清剿」。 */
  const REACH_KEYS = ['terminatorGames', 'orders', 'orderObey', 'orderRefuse', 'endorses',
    'credFollow', 'realFixes', 'realRevives', 'credShieldVotes', 'fakeRepairs', 'fakeTasks',
    'fakeBreaker', 'fakeBreakerRolls', 'fakeBreakerPlans', 'busAccusals', 'mateFollowVotes', 'rushKills', 'alienTasks', 'alienPipes', 'almostFriendCount', 'friendShield',
    'almostCount', 'almostEject', 'presenceDeny', 'avoidSus', 'retractCount', 'allyRevealed',
    'humanDefends', 'reportDoubts', 'medbotRevives', 'medkitRevives', 'ghostTasks', 'ghostFixes',
    'detainWitness', 'sabHits', 'loots', 'humanShots', 'alienShots', 'revives',
    'earlyVotes', 'voteChanges', 'earlyKept',
    'reachImpossible', 'statementDamp', 'discussLines', 'vouchHeard',
    'alienPileOns', 'alienFrameFollow', 'almostHeard',
    'misIdWrites', 'misIdToAlien', 'misIdToHuman', 'misIdRealHuman',
    'hypothesisAbstain'];
  const reach = {};
  for (const k of REACH_KEYS) {
    const xs = results.map(r => +r[k]).filter(Number.isFinite);
    const hit = xs.filter(x => x > 0).length;
    reach[k] = {
      anyRate: pct(hit, results.length),          /* 至少发生过一次的局数占比 */
      twoRate: pct(xs.filter(x => x >= 2).length, results.length),
      mean: +mean(results, k).toFixed(3),
      meanWhenHit: hit ? +(xs.filter(x => x > 0).reduce((s, x) => s + x, 0) / hit).toFixed(2) : 0,
      max: xs.length ? Math.max.apply(null, xs) : 0,
    };
  }
  /* 分桶：先看刀数断崖（历史上胜率几乎完全由它决定），再看夜数/会议/驱逐/进度 */
  const buckets = {
    knives: bucket(results, 'knives', [[0, 8], [9, 10], [11, 12], [13, 14], [15, 1e9]]),
    nights: bucket(results, 'nights', [[1, 3], [4, 5], [6, 7], [8, 10], [11, 1e9]]),
    meetings: bucket(results, 'meetings', [[0, 6], [7, 10], [11, 14], [15, 1e9]]),
    exiles: bucket(results, 'exiles', [[0, 1], [2, 3], [4, 6], [7, 1e9]]),
    prog: bucket(results, 'prog', [[0, 14], [15, 29], [30, 44], [45, 1e9]]),
    humansAlive: bucket(results, 'humans', [[0, 2], [3, 5], [6, 8], [9, 1e9]]),
    aliensAlive: bucket(results, 'aliens', [[0, 0], [1, 1], [2, 2], [3, 1e9]]),
  };
  /* 关键变量的分布（P10/P50/P90）：均值会把"少数极端局"抹平，这三档才是调参依据 */
  const dist = {};
  for (const k of ['nights', 'prog', 'knives', 'meetings', 'exiles', 'humans', 'aliens',
    'sabotages', 'shots', 'searches', 'fakeRepairs', 'fakeTasks', 'knownWrites', 'contradictions']) {
    const xs = results.map(r => +r[k]).filter(Number.isFinite);
    dist[k] = { p10: quantile(xs, 0.1), p50: quantile(xs, 0.5), p90: quantile(xs, 0.9),
      mean: +mean(results, k).toFixed(3) };
  }
  /* 结束原因 × 胜者交叉表 */
  const cross = {};
  for (const r of results) {
    const w = r.winner || 'timeout', y = r.why || '(空)';
    cross[w] = cross[w] || {};
    cross[w][y] = (cross[w][y] || 0) + 1;
  }
  /* 速率：把"每夜"这一维单独算出来 —— 夜长 NIGHT 与胜利分 WIN_PTS 的作用点就在这两条上 */
  const rate = {
    progPerNight: +(avg.prog / Math.max(0.5, avg.nights)).toFixed(3),
    knivesPerNight: +(avg.knives / Math.max(0.5, avg.nights)).toFixed(3),
    meetingsPerNight: +(avg.meetings / Math.max(0.5, avg.nights)).toFixed(3),
    exilesPerMeeting: +(avg.exiles / Math.max(0.5, avg.meetings)).toFixed(3),
    downPerNight: +(avg.downed / Math.max(0.5, avg.nights)).toFixed(3),
    humanExileShare: pct(avg.humanExiles, Math.max(0.001, avg.exiles)),
    /* 清场线：异形要赢需要把 11 人类打到 0，实测"每局刀数 / 11"就是清场压力 */
    knifePressure: +(avg.knives / 11).toFixed(3),
    /* 人类进度达成率：局末进度 / 45（未赢的局也计入，看差多少） */
    progRate: +(avg.prog / 45).toFixed(3),
  };
  return {
    games: n,
    wins: { human, alien, timeout },
    tasksPerGame,
    sab,
    reach, buckets, dist, cross, rate,
    winRate: { human: pct(human, n), alien: pct(alien, n), timeout: pct(timeout, n) },
    humanWin95CI: [+(ciLo * 100).toFixed(2), +(ciHi * 100).toFixed(2)],
    reasons: why,
    avg, median: med,
    perNight: {
      knives: +(avg.knives / Math.max(1, avg.nights)).toFixed(3),
      meetings: +(avg.meetings / Math.max(1, avg.nights)).toFixed(3),
      exiles: +(avg.exiles / Math.max(1, avg.nights)).toFixed(3)
    }
  };
}

function writeOut(results, finished) {
  const missZh = Object.keys(summarize(results).avg).filter(k => !LABELS[k]);
  if (missZh.length) console.log('[中文别名] 缺少中文名的指标：' + missZh.join(', '));
  const cfg = readCfg();
  const payload = {
    meta: {
      generatedAt: new Date().toISOString(),
      games: GAMES, finished, seed: BASE_SEED, dt: DT, maxNights: MAX_NIGHTS,
      mode: 'AI vs AI（旁观者局，无玩家操作）',
      config: cfg,
      notes: [
        '会议期间夜晚时钟暂停（SKSanity.MEET.pauseClock），白天会议不占夜；旧口径「夜会议按 30 秒扣夜」已作废。',
        '讨论台词不逐条播放，会议决策与传闻嫌疑在开会时同步结算。',
        '跳过渲染/HUD/音效/自动不变量；对局逻辑与正式版一致。',
        '⚠ **2026-11-06 起 `aiCapR` 已退役**：玩家 `visibleAt` 与 AI `aiCanSee` 共用' +
        '`observerVisionAt`（同亮舱整间 / 同亮走廊整条 / 亮舱看相连走廊要 LOS / 近身圆 / 7 格 60° 手电锥），' +
        'AI 不再有暗处 8 格全向、从舱外看进亮房、全亮时无视朝向这些玩家没有的视力。' +
        '跨批比较视野相关读数（knownWrites / 目击 / 伪装）前先看这条。',
        '⚠ **2026-11-06 起模拟讨论发言会真正执行**：`startChatter` 在 simMode 下把 push 改为' +
        '按同一顺序立即执行（不排定时器），所以 `orders` / `endorses` / `vouchHeard` / ' +
        '`discussLines` / `silentSus` / `statementDamp` 不再是结构性 0。' +
        '代价是模拟局比旧版慢，且胜率口径与 2026-11-05 及更早的报告**不可直接横向对比**。',
        '⚠ **真实行为读数（0 就是 0）**：`realFixes`（异形真修故障）与 `fakeBreaker`（异形当众合闸）' +
        '不依赖排期，恒为 0 是**效用表自己选的** —— 假装修不吃 realCost、也不站满 10 秒，' +
        '所以自发情况下没人选贵信号。这条与门禁里那条"量化事实"断言一致，等用户决定是否抬高收益。',
        '⚠ **同 seed 不等于同随机路径**：批次模拟用 simRng(seed) 播种 Math.random，' +
        '所以**任何新增一次随机调用都会把后面整条随机流挪位**' +
        '（语料交替槽展开、去重重挑都算随机调用）。后果：胜率与粗粒度总量' +
        '（夜数、进度、刀数、会议数）可以跨批对比；**单个机制的次数**' +
        '（fakeRepairs / fakeTasks / alienPipes 这类）在同一 seed 下也可能因路径漂移大幅摆动，' +
        '**这不是回归**。要在两批之间做归因，必须换 seed 各跑一批看摆动幅度，' +
        '不要拿单批的格子差值下结论。',
        '统计口径：searches/loots 为搜尸次数与真正取到物资的次数；humanLoots/alienLoots 按阵营拆分；' +
          'alienPipes 为实际钻管道次数；fakeRepairs / fakeTasks / fakeBreaker 分别为异形' +
          '假装修理、假装做任务、当众合闸的演出次数（三者同进 alienPlan 效用表比分）；' +
          'alienTasks 为真做任务次数。'
      ]
    },
    summary: summarize(results),
    results
  };
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify(payload, null, 2));
  const s = payload.summary;
  const md = [
    '# 新返航录 · 蒙特卡洛对抗报告',
    '',
    '> 生成：' + payload.meta.generatedAt + ' · 局数：' + finished + ' / ' + GAMES +
      ' · seed：' + BASE_SEED + ' · dt：' + DT + ' · 上限：' + MAX_NIGHTS + ' 夜',
    '',
    '## 胜率',
    '',
    '| 阵营 | 胜局 | 胜率 |',
    '|---|---:|---:|',
    '| 人类 | ' + s.wins.human + ' | ' + s.winRate.human + '% |',
    '| 异形 | ' + s.wins.alien + ' | ' + s.winRate.alien + '% |',
    '| 超时未决 | ' + s.wins.timeout + ' | ' + s.winRate.timeout + '% |',
    '',
    '人类胜率 95% Wilson 区间：' + s.humanWin95CI[0] + '% ~ ' + s.humanWin95CI[1] + '%',
    '',
    '## 本次实测用的配置（单一真源快照 · 便于对照调参）',
    '',
    '> 这张表由 `tools/monte-carlo.cjs` 直接 eval `js/ai/sanity.js` 读出，**不是手写的**。',
    '> 隔一周回头看胜率，先对这一栏：数没变才能比，数变了就是另一批。',
    '',
    '| 参数 | 值 | 位置 |',
    '|---|---:|---|',
    '| 夜长（秒） | ' + cfg.nightLen + ' | SKSanity.NIGHT.len |',
    '| 人类胜利维修分 | ' + cfg.winPts + ' | SKSanity.WIN.pts |',
    '| 故障超时扣分 | ' + cfg.faultPenalty + ' | SKSanity.WIN.faultPenalty |',
    '| 每夜会议上限 | ' + cfg.meetPerNight + ' | SKSanity.MEET.perNight |',
    '| 每人报告额度 | ' + cfg.reportsPerAgent + ' | SKSanity.MEET.reportsPerAgent |',
    '| 白天讨论 / 夜会讨论 | ' + cfg.discussDay + ' / ' + cfg.discussNight + ' | SKSanity.MEET |',
    '| 投票等待（白天/夜会） | ' + cfg.voteDay + ' / ' + cfg.voteNight + ' | SKSanity.MEET |',
    '| 结果公布 | ' + cfg.reveal + ' | SKSanity.MEET.reveal |',
    '| 异形暗处视野 | ' + cfg.alienDarkR + ' | SKSanity.SIGHT.alienDarkR |',
    '| 人类暗处视野 | ' + cfg.humanDarkR + ' | SKSanity.SIGHT.humanDarkR |',
    '| AI 视距上限（已退役，不参与判定） | ' + cfg.aiCapR + ' | SKSanity.SIGHT.aiCapR |',
    '| 确证距离门槛 | ' + cfg.confirmNearR + ' | SKSanity.CONFIRM.nearR |',
    '| 准-确证·异形阈值 | ' + cfg.almostFoeSus + ' | SKSanity.ALMOST.foeSus |',
    '| 准-确证·人类阈值 | ' + cfg.almostFriendCred + ' | SKSanity.ALMOST.friendCred |',
    '| 刀者红身（秒） | ' + cfg.redBodyDur + ' | SKSanity.RED_BODY.dur |',
    '| 驱逐门槛（票） | ' + cfg.voteNeed + ' / ' + cfg.voteLateNeed +
      '（可投票 ≤' + cfg.voteLateAt + '） | SKSanity.VOTE |',
    '| 追猎记忆时效（秒） | ' + cfg.huntMemorySec + ' | SKSanity.HUNT.memorySec |',
    '| 击杀加速倍率 | ' + cfg.rushMul + ' | SKSanity.RUSH.mul |',
    '| 终结者夜数 | ' + cfg.terminatorNight + ' | SKSanity.TERMINATOR.night |',
    '| 伪装冷却（秒） | ' + cfg.disguiseCooldown + ' | SKSanity.DISGUISE.cooldown |',
    '| 当众合闸概率/异形/夜 | ' + (cfg.breakerChance == null ? '—' : cfg.breakerChance) + ' | SKSanity.DISGUISE.breakerChance |',
    '| 异形指控队友概率/会议 | ' + (cfg.busChance == null ? '—' : cfg.busChance) + ' | SKSanity.MISLEAD.busChance |',
    '| 异形顺势踩人概率/会议 | ' + (cfg.socialPileOn == null ? '—' : cfg.socialPileOn) + ' | SKSanity.SOCIAL.pileOn |',
    '| 构陷顺着场上靶子 | ' + (cfg.socialFrameFollow == null ? '—' : cfg.socialFrameFollow) + ' | SKSanity.SOCIAL.frameFollow |',
    '| 传闻可补证据种类 | ' + (cfg.almostHeardKinds == null ? '—' : cfg.almostHeardKinds) + ' | SKSanity.ALMOST.heardKinds |',
    '| 目击认错概率 | ' + (cfg.misIdChance == null ? '—' : cfg.misIdChance) + ' | SKSanity.MISID.chance |',
    '',
    '## 结束原因',
    '',
    ...Object.keys(s.reasons).sort().map(k => '- ' + k + '：' + s.reasons[k]),
    '',
    '## 每局均值 / 中位数',
    '',
    '| 指标（中文 / 代码键） | 均值 | 中位数 |',
    '|---|---:|---:|',
    ...Object.keys(s.avg).map(k => '| ' + L(k) + ' | ' + s.avg[k] + ' | ' + s.median[k] + ' |'),
    '',
    '## 本轮新增统计（2026-10-31）',
    '',
    '| 指标（中文 / 代码键） | 每局均值 | 说明 |',
    '|---|---:|---|',
    row('medbotRevives', s.avg.medbotRevives, '医疗无人机飞过去近身救治的次数（7 秒/次，每夜 2 次电量）'),
    row('medkitRevives', s.avg.medkitRevives, '医疗包施救次数（与 revives 同源）'),
    row('ghostTasks', s.avg.ghostTasks, '幽灵完成的维修任务个数（每人额度 2 分）'),
    row('ghostFixes', s.avg.ghostFixes, '幽灵修好的故障次数'),
    row('humanDefends', s.avg.humanDefends, '人类 AI 公开替人辩护的次数（新行为）'),
    row('reportDoubts', s.avg.reportDoubts, '异形质疑「尸体还热就报案」的次数（新行为）'),
    '',
    '## 推理质量（2026-11-01：时间线拆谎量词 / 拘留证据 / 确证链路）',
    '',
    '| 指标（中文 / 代码键） | 每局均值 | 说明 |',
    '|---|---:|---|',
    row('contradictions', s.avg.contradictions, '口供对不上触发次数（修量词后应显著下降）'),
    row('contradictionOld', s.avg.contradictionOld, '同一份记忆下**旧量词**会成立多少次（诊断口径，只统计不改行为）'),
    row('falseContradictions', s.avg.falseContradictions, '窗口内其实有匹配记录、旧量词会冤枉人的次数'),
    row('knownWrites', s.avg.knownWrites, '确证写入次数（出刀/管道/破坏/停摆/红身/拉闸）'),
    row('knownVotes', s.avg.knownVotes, '由确证驱动的票数'),
    row('ejectByKnown', s.avg.ejectByKnown, '至少一票来自确证的驱逐次数'),
    row('detainWitness', s.avg.detainWitness, '保安拘留被看见的次数'),
    row('detainEvictions', s.avg.detainEvictions, '被拘留过的人最终被驱逐的次数'),
    '',
    '## 证据命中目标（2026-11-06 审计 · 只统计不改判定）',
    '',
    '| 指标（中文 / 代码键） | 每局均值 | 说明 |',
    '|---|---:|---|',
    row('knownWritesAlien', s.avg.knownWritesAlien, '近距离目击异形专属行为，确证目标确实是异形'),
    row('knownWritesHuman', s.avg.knownWritesHuman, '近距离目击「拉闸断电」但目标是人类：唯一的误确证入口'),
    row('almostAlien', s.avg.almostAlien, '准-确证指向真异形'),
    row('almostHuman', s.avg.almostHuman, '准-确证指向人类（统计噪声）'),
    row('knownVotesAlien', s.avg.knownVotesAlien, '确证票投给真异形'),
    row('knownVotesHuman', s.avg.knownVotesHuman, '确证票投给人类（误投）'),
    row('ejectByKnownAlien', s.avg.ejectByKnownAlien, '确证驱动驱逐且逐出异形'),
    row('ejectByKnownHuman', s.avg.ejectByKnownHuman, '确证驱动驱逐但逐出人类（误判）'),
    row('almostEjectAlien', s.avg.almostEjectAlien, '准-确证驱动驱逐且逐出异形'),
    row('almostEjectHuman', s.avg.almostEjectHuman, '准-确证驱动驱逐但逐出人类（误判）'),
    '',
    '## 推理引擎规范化（2026-11-01：跨夜痕迹 / 准-确证 / 可信度 / 熵沉默）',
    '',
    '| 指标（中文 / 代码键） | 每局均值 | 说明 |',
    '|---|---:|---|',
    row('susCarry', s.avg.susCarry, '跨夜保留下来的嫌疑总量（验改动 A）'),
    row('almostCount', s.avg.almostCount, 'almost.foe 产生次数（准-确证 · 敌）'),
    row('almostHeard', s.avg.almostHeard, '**靠传闻补种类**才凑够的几乎次数（`ALMOST.heardKinds`，0=旧行为）'),
    row('misIdWrites', s.avg.misIdWrites, '**目击认错人**次数（`MISID.chance`，0=旧行为「目击 100% 准」）'),
    row('misIdToHuman', s.avg.misIdToHuman, '认错后指到无辜人类的次数（这一项才是代价）'),
    row('misIdToAlien', s.avg.misIdToAlien, '认错后碰巧指到异形的次数'),
    row('almostFriendCount', s.avg.almostFriendCount, 'almost.friend 产生次数（准-确证 · 友，异形伪装的兑现口）'),
    row('almostEject', s.avg.almostEject, '至少一票由准-确证驱动（≠确证）的驱逐次数'),
    row('almostVotes', s.avg.almostVotes, '投给 almost.foe 的票数'),
    row('overriddenFriends', s.avg.overriddenFriends, 'known 硬覆盖掉 almost.friend 的次数（friend 本身只有 0.26 次/局，所以这条接近 0；门禁里有专门用例）'),
    row('reliaWrites', s.avg.reliaWrites, '证言可信度写入次数（追责回写）'),
    row('reliaSpread', s.avg.reliaSpread, '局末可信度极差（0=谁说话都一样值钱）'),
    row('hedgeAgents', s.avg.hedgeAgents, '高熵（谁都像）→ 犹豫不点名的席次数'),
    row('sureAgents', s.avg.sureAgents, '低熵（一人独高）→ 敢点名的席次数'),
    row('silentSus', s.avg.silentSus, '沉默线索触发次数（上限 0.10，不升级）'),
    row('presenceDeny', s.avg.presenceDeny, '在场反驳「我当时就在那儿」次数'),
    row('claimRecall', s.avg.claimRecall, '跨夜口供被指出不一致的次数（**纯台词侧**：sim 不排台词，所以恒为 0；真实对局才有）'),
    row('retractCount', s.avg.retractCount, '「我上次看走眼了」次数'),
    row('avoidCount', s.avg.avoidCount, '夜里主动躲开「咬我最狠的人」次数（行为回流）'),
    row('farSight', s.avg.farSight, '远距离目击（>4.5 格）次数——这些**只加嫌疑、不写确证**（证据分级）'),
    row('allyRevealed', s.avg.allyRevealed, '反复替翻车者辩护被连坐的次数（软联盟）'),
    row('friendShield', s.avg.friendShield, '「基本是好人」挡下来的票数（伪装兑现口）'),
    row('avoidSus', s.avg.avoidSus, '「他刚才绕开了我」被记成弱证据的次数'),
    row('reportsUsed', s.avg.reportsUsed, '夜晚报告实际用掉几次（额度 2 次/人）'),
    row('nightMeetFull', s.avg.nightMeetFull, '因「本夜会议已开满」被拒的报告次数'),
    row('earlyVotes', s.avg.earlyVotes, '讨论一开始就压上桌的票数（手里有确证/准-确证/明确怀疑）'),
    row('voteChanges', s.avg.voteChanges, '讨论中因「听到某句话」而改票的次数（known 不参与）'),
    row('earlyKept', s.avg.earlyKept, '早投票到终局没被改掉的次数'),
    row('reachImpossible', s.avg.reachImpossible, '不在场口供被「这点时间走不到」判为不可能的次数（可达性反事实）'),
    row('statementDamp', s.avg.statementDamp, '同一目标同时被指控与被背书、公开声势被压低的次数（证言间关系）'),
    row('discussLines', s.avg.discussLines, '模拟局同步执行的讨论发言条数（2026-11-06 起不再是 0）'),
    row('vouchHeard', s.avg.vouchHeard, '听众收到 heard_vouch 的次数'),
    row('hypothesisAbstain', s.avg.hypothesisAbstain, '两个假说难分高下而弃权的票数（假设层）'),
    '',
    '## 异形社交顺势（2026-11-06 · AI 拟人化）',
    '',
    '> ⚠ **默认关闭**（`SKSanity.SOCIAL.pileOn/frameFollow = 0`）：300 局同 seed A/B 显示「跟票」',
    '> 反而帮人类（关 75.00% → 开 81.33%），因为人类公开怀疑约 78% 准，跟着咬=咬自己人。',
    '> 这一栏保留是为了复评：`--social 0` 关、默认配置即关；要看机制触达就把 `_t.setSocial(1,1)` 打开再跑。',
    '',
    '| 指标 | 数值 | 说明 |',
    '|---|---:|---|',
    row('alienPileOns', s.avg.alienPileOns, '异形顺势踩人的次数（每只每会议掷一次，性格修正概率）'),
    row('alienFrameFollow', s.avg.alienFrameFollow, '编假口供时把矛头对向场上靶子的次数（否则随机挑）'),
    row('humanExiles', s.avg.humanExiles, '误逐数（顺势要是没把票压到人类身上，这条不会动）'),
    row('alienExiles', s.avg.alienExiles, '被逐异形数（顺势若变成"抱团送自己人"，这条会涨）'),
    '',
    '## 破坏技能探查（2026-11-01）',
    '',
    '| 指标 | 数值 | 说明 |',
    '|---|---:|---|',
    '| 每局机会 | ' + s.sab.oppPerGame + ' | 4 异形 × 夜数 × 每夜 1 次 |',
    '| 每局下手 | ' + s.sab.triesPerGame + ' | 使用率 ' + s.sab.useRate + '% |',
    '| 每局命中（-5 生效） | ' + s.sab.hitsPerGame + ' | 命中率 ' + s.sab.hitRate + '% |',
    '| 每局被修掉 | ' + s.sab.fixedPerGame + ' | 平均存活 ' + s.sab.avgFixSec + ' 秒（上限 30） |',
    '| 其中幽灵抢修 | ' + s.sab.ghostFixedPerGame + ' | 幽灵修复额度被故障吃掉多少 |',
    '',
    '## 机制触达率（2026-11-03 扩充 · 调平衡先看清"这条线到底有没有跑"）',
    '',
    '> `任何一局发生过的比例` 才是"机制是否落地"的判据；均值 0.05 可能是"每局一点点"，',
    '> 也可能是"20 局里 1 局爆发"，两者要的处理完全不同。`命中局均值` 只在发生过时统计。',
    '',
    '| 指标（中文 / 代码键） | 触达率(≥1 次的局) | ≥2 次的局 | 全局均值 | 命中局均值 | 单局最大 |',
    '|---|---:|---:|---:|---:|---:|',
    ...Object.keys(s.reach || {}).map(k => '| ' + L(k) + ' | ' + s.reach[k].anyRate + '% | ' +
      s.reach[k].twoRate + '% | ' + s.reach[k].mean + ' | ' + s.reach[k].meanWhenHit + ' | ' +
      s.reach[k].max + ' |'),
    '',
    '## 刀数分桶胜率（清场线断崖在哪）',
    '',
    '> 异形清场需要 11 刀；这条桶表用来确认胜率拐点是否仍压在刀数上。',
    '',
    '| 区间 | 局数 | 占比 | 人类胜率 | 95% 区间 | 平均夜数 | 平均进度 | 平均会议 |',
    '|---|---:|---:|---:|---|---:|---:|---:|',
    ...(s.buckets.knives || []).map(b => '| 刀 ' + b.label + ' | ' + b.games + ' | ' + b.share + '% | ' +
      b.humanWin + '% | ' + b.ci[0] + '~' + b.ci[1] + ' | ' + b.avgNights + ' | ' + b.avgProg + ' | ' + b.avgMeetings + ' |'),
    '',
    '## 夜数分桶胜率（夜长 NIGHT 的作用点）',
    '',
    '| 区间 | 局数 | 占比 | 人类胜率 | 95% 区间 | 平均刀数 | 平均进度 |',
    '|---|---:|---:|---:|---|---:|---:|',
    ...(s.buckets.nights || []).map(b => '| 夜 ' + b.label + ' | ' + b.games + ' | ' + b.share + '% | ' +
      b.humanWin + '% | ' + b.ci[0] + '~' + b.ci[1] + ' | ' + b.avgKnives + ' | ' + b.avgProg + ' |'),
    '',
    '## 会议数分桶胜率（会议是"伴随现象"还是"因"）',
    '',
    '| 区间 | 局数 | 占比 | 人类胜率 | 95% 区间 | 平均夜数 | 平均刀数 |',
    '|---|---:|---:|---:|---|---:|---:|',
    ...(s.buckets.meetings || []).map(b => '| 会 ' + b.label + ' | ' + b.games + ' | ' + b.share + '% | ' +
      b.humanWin + '% | ' + b.ci[0] + '~' + b.ci[1] + ' | ' + b.avgNights + ' | ' + b.avgKnives + ' |'),
    '',
    '## 驱逐数分桶胜率',
    '',
    '| 区间 | 局数 | 占比 | 人类胜率 | 95% 区间 | 平均夜数 | 平均进度 |',
    '|---|---:|---:|---:|---|---:|---:|',
    ...(s.buckets.exiles || []).map(b => '| 逐 ' + b.label + ' | ' + b.games + ' | ' + b.share + '% | ' +
      b.humanWin + '% | ' + b.ci[0] + '~' + b.ci[1] + ' | ' + b.avgNights + ' | ' + b.avgProg + ' |'),
    '',
    '## 局末进度分桶（差多少分才赢）',
    '',
    '| 区间 | 局数 | 占比 | 人类胜率 | 95% 区间 | 平均夜数 | 平均刀数 |',
    '|---|---:|---:|---:|---|---:|---:|',
    ...(s.buckets.prog || []).map(b => '| 分 ' + b.label + ' | ' + b.games + ' | ' + b.share + '% | ' +
      b.humanWin + '% | ' + b.ci[0] + '~' + b.ci[1] + ' | ' + b.avgNights + ' | ' + b.avgKnives + ' |'),
    '',
    '## 结束时存活分桶',
    '',
    '| 维度 | 区间 | 局数 | 占比 | 人类胜率 | 95% 区间 |',
    '|---|---|---:|---:|---:|---|',
    ...(s.buckets.humansAlive || []).map(b => '| 人类存活 | ' + b.label + ' | ' + b.games + ' | ' + b.share + '% | ' + b.humanWin + '% | ' + b.ci[0] + '~' + b.ci[1] + ' |'),
    ...(s.buckets.aliensAlive || []).map(b => '| 异形存活 | ' + b.label + ' | ' + b.games + ' | ' + b.share + '% | ' + b.humanWin + '% | ' + b.ci[0] + '~' + b.ci[1] + ' |'),
    '',
    '## 关键变量分布（P10 / P50 / P90 · 均值会抹平长尾）',
    '',
    '| 指标（中文 / 代码键） | P10 | P50 | P90 | 均值 |',
    '|---|---:|---:|---:|---:|',
    ...Object.keys(s.dist || {}).map(k => '| ' + L(k) + ' | ' + s.dist[k].p10 + ' | ' + s.dist[k].p50 +
      ' | ' + s.dist[k].p90 + ' | ' + s.dist[k].mean + ' |'),
    '',
    '## 每夜速率（调 NIGHT / WIN_PTS 之前先看这两条）',
    '',
    '| 指标 | 数值 | 说明 |',
    '|---|---:|---|',
    '| 进度/夜 | ' + s.rate.progPerNight + ' | 人类每个夜晚平均推进多少维修分（45 分胜利） |',
    '| 刀/夜 | ' + s.rate.knivesPerNight + ' | 异形每个夜晚平均出刀次数 |',
    '| 会议/夜 | ' + s.rate.meetingsPerNight + ' | 每夜会议密度（每夜上限 ' + cfg.meetPerNight + ' 场） |',
    '| 驱逐/会议 | ' + s.rate.exilesPerMeeting + ' | 一场会议平均产出几次驱逐 |',
    '| 濒死/夜 | ' + s.rate.downPerNight + ' | 每夜平均倒下人数（含未致死） |',
    '| 误逐占比 | ' + s.rate.humanExileShare + '% | 被驱逐的人里是人类的比例 |',
    '| 清场压力 | ' + s.rate.knifePressure + ' | 平均刀数 ÷ 11（≥1 表示异形平均能摸到清场线） |',
    '| 进度达成 | ' + s.rate.progRate + ' | 局末进度 ÷ 45（未赢的局也计入） |',
    '',
    '## 结束原因 × 胜者交叉表',
    '',
    '| 胜者 | 结束原因 | 局数 | 占该阵营胜局 |',
    '|---|---|---:|---:|',
    ...Object.keys(s.cross || {}).sort().flatMap(w => {
      const tot = Object.values(s.cross[w]).reduce((a, b) => a + b, 0);
      return Object.keys(s.cross[w]).sort().map(y => '| ' + w + ' | ' + y + ' | ' + s.cross[w][y] +
        ' | ' + pct(s.cross[w][y], tot) + '% |');
    }),
    '',
    '## 分任务点完成次数（每局平均 · 由少到多）',
    '',
    '> 只统计、不干预。用来回答「电路维修是不是几乎没人做」这类分布问题：',
    '> 若某个点的完成次数明显低于同难度其它点，说明问题在可达性/AI 意愿，而不是任务本身。',
    '',
    '| 任务点 | 每局完成次数 |',
    '|---|---:|',
    ...Object.entries(s.tasksPerGame || {}).sort((a, b) => a[1] - b[1])
      .map(([k, v]) => '| ' + k + ' | ' + v + ' |'),
    '',
    '## 附录 · 中文别名表（按含义分组）',
    '',
    '> 上面各表的「指标」列已直接显示中文；这里留一份完整速查，方便对照代码里的计数器名。',
    '',
    ...LABEL_GROUPS.flatMap(g => [
      '### ' + g[0], '', '| 中文 | 代码键 |', '|---|---|',
      ...g[1].split(' ').filter(Boolean).map(k => '| ' + (LABELS[k] || k) + ' | `' + k + '` |'), ''
    ]),
    '## 方法说明',
    '',
    ...payload.meta.notes.map(x => '- ' + x),
    ''
  ];
  fs.writeFileSync(REPORT, md.join('\n'));
}

/* 只重建报告，不重跑对局：`node tools/monte-carlo.cjs --rereport`
   改了报告模板 / 加了新统计格的时候用，直接读 tools/mc-results.json 里那 1000 局，
   **数字与跑批时完全一致**（同一批局），省掉 7 分钟的重复模拟。 */
if (arg('rereport', '0') === '1' || process.argv.indexOf('--rereport') >= 0) {
  const raw = JSON.parse(fs.readFileSync(OUT, 'utf8'));
  const rs = raw.results || [];
  if (!rs.length) { console.error('mc-results.json 里没有局数据'); process.exit(2); }
  writeOut(rs, rs.length);
  const s2 = summarize(rs);
  console.log('报告已由 ' + rs.length + ' 局既有结果重建 → ' + path.relative(DIR, REPORT));
  console.log('人 ' + s2.winRate.human + '% / 异 ' + s2.winRate.alien + '% / 超时 ' + s2.winRate.timeout + '%');
  process.exit(0);
}

(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = [];
  page.on('pageerror', e => errors.push('PAGEERROR ' + e.message));
  page.on('console', m => {
    if (m.type() === 'error') errors.push('CONSOLE ' + m.text());
    if (m.type() === 'log' && m.text().startsWith('SIM ')) console.log(m.text());
  });
  await page.goto(URL);
  /* 主页改成"先选身份再进入"：选中旁观者，再点「进入舱段」 */
  await page.click('[data-role="spect"]');
  await page.click('#home-go');
  await page.waitForFunction(() => window.SKV3 && SKV3._t && SKV3._t.assets().base,
    null, { timeout: 30000 });
  await page.waitForTimeout(400);
  await page.evaluate(() => {
    try { SKV3.setSfxVolume(0); } catch (e) {}
    const g = SKV3._t.G(); if (g) g.paused = true;
  });
  if (NO_DISCUSS || HYP_GAP !== null || HYP_MODE || !SOCIAL_ON || HEARD_KINDS !== null || MISID_CHANCE !== null) {
    const ab = await page.evaluate(o => ({
      noDiscuss: o.noDiscuss ? SKV3._t.setSimNoDiscuss(true) : false,
      hypMode: o.hypMode ? SKV3._t.setHypMode(o.hypMode) : null,
      hypGap: o.hypGap === null ? null : SKV3._t.setHypGap(o.hypGap),
      social: o.social ? null : SKV3._t.setSocial(0),
      heard: o.heard === null ? null : SKV3._t.setHeardKinds(o.heard),
      misid: o.misid === null ? null : SKV3._t.setMisId(o.misid)
    }), { noDiscuss: NO_DISCUSS, hypMode: HYP_MODE,
      hypGap: HYP_GAP === null ? null : parseFloat(HYP_GAP), social: SOCIAL_ON,
      heard: HEARD_KINDS === null ? null : parseFloat(HEARD_KINDS),
      misid: MISID_CHANCE === null ? null : parseFloat(MISID_CHANCE) });
    console.log('[A/B] ' + JSON.stringify(ab));
  }

  const results = [];
  const t0 = Date.now();
  for (let i = 0; i < GAMES; i++) {
    const seed = (BASE_SEED + i) >>> 0;
    const tg = Date.now();
    if (VERBOSE) console.log('START game ' + (i + 1) + ' seed ' + seed);
    const r = await Promise.race([
      page.evaluate(o => SKV3._t.simGame(o), { seed, dt: DT, maxNights: MAX_NIGHTS, maxSteps: MAX_STEPS || undefined, debug: VERBOSE }),
      new Promise((_, rej) => setTimeout(() =>
        rej(new Error('单局超过 ' + GAME_TIMEOUT + 'ms（seed ' + seed + '，game ' + (i + 1) + '）')),
      GAME_TIMEOUT))
    ]);
    if (VERBOSE) console.log('DONE game ' + (i + 1) + ' seed ' + seed + ' ' +
      (Date.now() - tg) + 'ms ' + r.winner + ' ' + r.why);
    results.push(r);
    if ((i + 1) % 25 === 0 || i === GAMES - 1) {
      writeOut(results, i + 1);
      const s = summarize(results);
      const elapsed = (Date.now() - t0) / 1000;
      console.log('[' + (i + 1) + '/' + GAMES + '] ' + elapsed.toFixed(1) + 's · ' +
        '人 ' + s.winRate.human + '% / 异 ' + s.winRate.alien + '% / 超时 ' + s.winRate.timeout +
        '% · ' + (elapsed / (i + 1) * 1000).toFixed(0) + 'ms/局');
    }
  }
  writeOut(results, GAMES);
  const s = summarize(results);
  console.log('\n=== 汇总 ===');
  console.log(JSON.stringify(s, null, 2));
  if (errors.length) console.log('\n控制台错误：\n' + errors.slice(0, 10).join('\n'));
  await browser.close();
  process.exit(errors.length ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
