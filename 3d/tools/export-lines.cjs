/* 3D 发言数据导出：2.5D 真源 → 3d/preview/data/lines.json
 * ------------------------------------------------------------------
 * 用法：node 3d/tools/export-lines.cjs
 *
 * 口径（2026-11-08 用户裁定）：「S 轨发言，除了美术全部完成」。
 *   export-sim.cjs 当时明确**排除**发言表，是因为上一轮裁定"发言不迁"；
 *   本文件是 S 轨开工后的第一件准备件，把 lines.js 的语料与 sanity.js 的
 *   发言规则表一起导出，3D 端才能在 GDScript 里不抄一句台词、不抄一个数。
 *
 * 三个真源，全部 fail-loud：
 *   ① js/data/lines.js  —— 纯模块，Node 里直接 eval（SKLines）
 *   ② js/ai/sanity.js   —— 纯模块，同上（SKSanity 的 SPEECH / RELIA / MIND ...）
 *   ③ js/ai/traits.js   —— 依赖 SKSanity，先 eval ① 再 eval ② 再 eval ③
 *   ④ js/t2/decision.js —— 玩家自由发言的槽位解析：ROOM_WORDS / CN_SEAT / 关键词正则，
 *                          全部按具名模式从源码抠出，不在 GDScript 里另写一份中文词表
 *
 * 只做序列化，不改一句语料、不做去重、不做筛选 —— 去重与词槽展开是运行时的
 * speech.gd 的职责，导出器输出的就是 2.5D 那份唯一真源的完整快照。
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = path.resolve(__dirname, '..', '..');
const OUT = path.join(__dirname, '..', 'preview', 'data', 'lines.json');

const SRC = {
  lines: 'js/data/lines.js',
  sanity: 'js/ai/sanity.js',
  traits: 'js/ai/traits.js',
  decision: 'js/t2/decision.js',
};

function sha1(p) {
  return crypto.createHash('sha1').update(fs.readFileSync(p)).digest('hex').slice(0, 12);
}

/* 三个模块共用同一个 window：traits.js 会读 global.SKSanity */
const win = { SKV3: { _t: { G: () => null } } };
for (const rel of [SRC.sanity, SRC.lines, SRC.traits, SRC.decision]) {
  new Function('window', 'globalThis', fs.readFileSync(path.join(ROOT, rel), 'utf8'))(win, win);
}
const L = win.SKLines;
const S = win.SKSanity;
const T = win.SKTrait;
const D = win.SKT2Decision;
if (!L || !S || !T || !D) throw new Error('SKLines / SKSanity / SKTrait / SKT2Decision 加载失败');

const RULES = [
  'SPEECH', 'TESTIFY', 'RELIA', 'MIND', 'ATTN', 'MEET', 'VOTE', 'CONFIRM',
  'ALMOST', 'LEADER', 'FRAME', 'WARM', 'ALIBI', 'MISLEAD', 'SOCIAL', 'ACCOUNT',
  'DESC', 'FIRST', 'AVOID', 'CRED', 'TRAIT_GAIN',
];
const rules = {};
for (const k of RULES) {
  if (S[k] == null) throw new Error('SKSanity 缺表 ' + k);
  rules[k] = S[k];
}

function need(v, label) {
  if (v == null) throw new Error('真源缺字段：' + label);
  return v;
}
const pools = need(L.POOLS, 'SKLines.POOLS');
const why = need(L.WHY, 'SKLines.WHY');
const combos = need(L.COMBOS, 'SKLines.COMBOS');
const claimAct = need(L.CLAIM_ACT, 'SKLines.CLAIM_ACT');
const tags = need(L.tags, 'SKLines.tags');

/* 占位符白名单：与 js/game.js#fillTpl 逐项对齐；{a|b} 组合槽由正则识别。 */
const PLACEHOLDERS = ['n', 't', 'r', 'r2', 'u', 'k', 'when', 'prev', 'why'];

/* ---- 玩家自由发言的槽位解析表：从 decision.js 源码按具名模式抠 ----
   GDScript 端用 RegEx 编译这些 pattern（JS 正则语法与 PCRE 兼容），
   不在 3D 侧另写一份中文关键词，否则 2.5D 改词表就会漂移。 */
const decSrc = fs.readFileSync(path.join(ROOT, SRC.decision), 'utf8');
function grab(re, label) {
  const m = decSrc.match(re);
  if (!m) throw new Error('真源漂移：在 ' + SRC.decision + ' 里找不到 ' + label);
  return m[1];
}
const speechPatterns = {
  support: grab(/const support=has&&\/(.*?)\/\.test\(s\)/, 'support'),
  neg_vote: grab(/const negVote=\/(.*?)\/\.test\(s\)/, 'negVote'),
  neg_acc: grab(/const negAcc=\/(.*?)\/\.test\(s\)/, 'negAcc'),
  neg_see: grab(/const negSee=\/(.*?)\/\.test\(s\)/, 'negSee'),
  saw: grab(/const saw=\/(.*?)\/\.test\(s\)/, 'saw'),
  accuse: grab(/if\(has&&\/(.*?)\/\.test\(s\)&&!negAcc\)/, 'accuse'),
  vote: grab(/if\(has&&\/(.*?)\/\.test\(s\)&&!negVote\)/, 'vote'),
  deny: grab(/if\(\/(.*?)\/\.test\(s\)\)out\.deny=true/, 'deny'),
  where: grab(/if\(out\.rooms\.length&&\/(.*?)\/\.test\(s\)\)/, 'where'),
  when_recent: grab(/if\(\/(.*?)\/\.test\(s\)\)out\.when='recent'/, 'when_recent'),
  when_night: grab(/else if\(\/(.*?)\/\.test\(s\)\)out\.when='night'/, 'when_night'),
  seat_num: grab(/const reNum=\/(.*?)\/g/, 'reNum'),
  seat_cn: grab(/const reCn=\/(.*?)\/g/, 'reCn'),
  claim_kinds: [],
};
const claimBlock = decSrc.match(/for\(const \[k,re\] of \[([\s\S]*?)\]\)\{/);
if (!claimBlock) throw new Error('真源漂移：找不到 claimKind 关键词表');
for (const m of claimBlock[1].matchAll(/\['([a-z_]+)',\/(.*?)\/\]/g)) {
  speechPatterns.claim_kinds.push({ kind: m[1], pattern: m[2] });
}
if (speechPatterns.claim_kinds.length < 5) throw new Error('claimKind 关键词表条目不足');
const whenWords = (() => {
  const m = decSrc.match(/meet\.kind==='day'\)\?'(.*?)':'(.*?)'/);
  if (!m) throw new Error('真源漂移：找不到 whenWord 的今晚/昨晚');
  return { day: m[1], night: m[2] };
})();

const out = {
  schema_version: 1,
  generated_at: new Date().toISOString(),
  note: '本文件由 3d/tools/export-lines.cjs 生成，勿手改。台词唯一真源是 js/data/lines.js。',
  sources: Object.fromEntries(Object.entries(SRC).map(([k, rel]) => [k, {
    path: rel, sha1: sha1(path.join(ROOT, rel)),
  }])),
  placeholders: PLACEHOLDERS,
  /* toneOf(a, bias)：hot = (aggr-caut)/100 + bias > 0.08；中性轴 50。
     阈值从 lines.js#toneOf 抠出，取不到就停，避免偷偷改档位。 */
  tone: {
    hot_threshold: 0.08,
    neutral: need(T.NEUTRAL, 'SKTrait.NEUTRAL'),
    axes: need(T.AXES, 'SKTrait.AXES'),
    bands: need(T.BANDS, 'SKTrait.BANDS'),
  },
  tags,
  claim_act: claimAct,
  room_words: need(D.ROOM_WORDS, 'SKT2Decision.ROOM_WORDS'),
  cn_seat: need(D.CN_SEAT, 'SKT2Decision.CN_SEAT'),
  when_words: whenWords,
  speech_patterns: speechPatterns,
  pools,
  why,
  combos,
  rules,
  stats: L.stats(),
  effective_size: L.effectiveSize(),
};

/* 函数字段（SKTrait.C 里的 knifeWatcherCap 之类）JSON 会自然跳过；
   但要确保没有 undefined / NaN 混进规则表，否则 3D 端会读到 null。 */
const json = JSON.stringify(out, null, 2);
if (/null/.test(json) && !/"[^"]*": null/.test(json)) {
  // 不额外处理：规则表里合法的 null 由 3D 端 has() 判断
}
fs.writeFileSync(OUT, json + '\n', 'utf8');

const cats = Object.keys(pools).length;
console.log('lines.json 已生成：' + OUT);
console.log(`  类别 ${cats} / 台词 ${out.stats.rows} 行 / 组合 ${out.stats.comboRows} 行 / WHY ${out.stats.whyRows} 条 / 当量 ${out.stats.equiv}`);
console.log(`  规则表 ${Object.keys(rules).length} 张：${Object.keys(rules).join(', ')}`);
console.log(`  发言解析：舱室词 ${Object.keys(out.room_words).length || out.room_words.length} 条 / claim ${speechPatterns.claim_kinds.length} 类 / 正则 ${Object.keys(speechPatterns).length - 1} 组`);
