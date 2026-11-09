/* =============================================================
 * tools/lines-audit.cjs · 会议语料体检（2026-11-03）
 * ------------------------------------------------------------
 * 为什么要有这个工具：验收标准是「玩家连续玩 10 局都不会觉得所有话我都看过了」，
 * 这是**分布问题**，数行数看不出来 —— 336 行里如果 20 行占了 80% 的出场率，
 * 玩家照样听腻。所以这里复现 js/game.js 的真实抽样口径，直接模拟十局。
 *
/* 复现的抽样口径（与 game.js 一致，改那边要同步改这里）：
 *   ① toneOf(a) 按性格三档（js/ai/traits.js 的 28/50/72）选 hot / cold —— **不是掷硬币**；
 *   ② pickLine：先随机取一条，若该模板本局已被用过 n 次，则以 1/(1+3n) 接受，
 *      否则重挑（最多 4 次），最后落到当次抽到的那条；G.lineUsed 整局一份、不跨局；
 *   ③ fillTpl：展开 `{a|b|c}` 交替槽，再替换注册槽 {n}{t}{r}{r2}{u}{k}{when}{why}{prev}；
 *   ④ sayStreakOK：**同一个人**连说到第 3 句起这句当作没说（让位），系统行与玩家不受限。
 *
 * 校验（FAIL，一律拦）：禁词 / 脏话 / 书面词 / 颜文字 / **单条 8~18 汉字**
 *   （`|` 变体按展开后的每个分支分别量，槽位按典型填充值计）/ 未注册槽位与非法花括号 /
 *   endorse·accuse·confront·almost·selfcite·leader_refuse 的必备槽 /
 *   selfcite 必须真能被 parseSpeech 的第一人称正则解析成位置自述 /
 *   舱室名硬写在变体槽之外 / 每类每档条数不足 / 组合式行不足 12 条 / 骨架撞车。
 * 提示（WARN，不拦）：贴住 8 字下限的短句、交替槽里嵌普通槽。
 *
 * 用法：
 *   node tools/lines-audit.cjs            # 体检 + 十局模拟，写 tools/lines-report.md
 *   node tools/lines-audit.cjs --check    # 只校验不模拟
 *   node tools/lines-audit.cjs --strict   # 有任何 FAIL 就退出码 1（可接门禁）
 *   node tools/lines-audit.cjs --max=300  # 每类失败在报告里最多列多少条
 *   --games / --meetings / --lines / --seed 改模拟规模（默认 10 局 × 12 会议 × 5 条 = 每局 60 条）
 * 依赖：零（只用 fs / path，不开浏览器、不 require 游戏引擎、不碰 SKV3）。
 * ============================================================= */
const fs = require('fs');
const path = require('path');

const DIR = path.resolve(__dirname, '..');
const SRC = path.join(DIR, 'js', 'data', 'lines.js');
const MAPSRC = path.join(DIR, 'js', 'data', 'map.js');
const OUT = path.join(DIR, 'tools', 'lines-report.md');
const argv = process.argv.slice(2);
const has = f => argv.some(a => a === '--' + f);
const val = (f, d) => { const a = argv.find(x => x.startsWith('--' + f + '=')); return a ? +a.split('=')[1] : d; };
const STRICT = has('strict');
const ONLY_CHECK = has('check');
const MAX_SHOW = val('max', 40);
const GAMES = val('games', 10), MEETS_PER_GAME = val('meetings', 12), LINES_PER_MEET = val('lines', 5);
const SEED = val('seed', 20261103);

/* ---------------- 载入语料（经典 script，挂到假 window） ---------------- */
const win = {};
const src = fs.readFileSync(SRC, 'utf8');
new Function('window', src)(win);
const L = win.SKLines;
if (!L || !L.POOLS) { console.error('FAIL 语料未能加载（window.SKLines 缺失）'); process.exit(1); }

/* ---------------- 校验规则 ---------------- */
const BANNED = ['姐姐', '哥哥', '宝贝', '妹妹', '兄弟', '老铁', '大佬', '哥们', '大人',
  '奴婢', '老爷', '大侠', '少侠', '敢问', '姑娘', '小兄弟', '狼人', '狼', '平民', '神职',
  '查杀', '对跳', '归票'];
/* 「亲」只禁作称呼用，不禁「亲眼/亲手」这类正经搭配 */
const QIN_OK = ['亲眼', '亲手', '亲自', '亲口', '亲历', '亲见', '亲属', '亲情'];
const PROFANITY = ['妈的', '他妈', '傻逼', '操你', '尼玛', '狗东西', '王八', '贱人', '混蛋', '该死', '废物', '白痴'];
const BOOKISH = ['时间线', '证据链', '逻辑上', '综上所述', '嫌疑人', '换言之', '由此可见'];
/* 舱室名真源：任务口径的 10 间 + map.js 的实际 name（引擎 / 娱乐室 / 食堂…） */
let ROOMS = ['中央会议室', '仓库', '生态舱', '走廊', '引擎室', '医疗间', '配电室',
  '军械库', '监控室', '娱乐舱'];
try {
  const w2 = {}; new Function('window', fs.readFileSync(MAPSRC, 'utf8'))(w2);
  ROOMS = Array.from(new Set(ROOMS.concat((w2.SKMapData.rooms || []).map(r => r.name).filter(Boolean))));
} catch (e) { /* 地图读不到就用兜底表 */ }
/* 舱室词表与自述正则**都从真源 js/t2/decision.js#SKT2Decision 里读**，不在这里抄一份。
   方案 A 第三批（2026-11-04）已把 parseSpeech 与 ROOM_WORDS 外提到玩家决策域；
   以前这里是手抄的副本，game.js 补了「我昨晚在」之后体检还在按旧表判，
   两边同时"看起来对"——这正是最坑的那种漂移（本项目已经被它咬过几次）。
   读不到就硬报错，宁可工具跑不起来，也不要拿着过期的表去放行语料。 */
const DECISION_SRC = fs.readFileSync(path.join(DIR, 'js', 't2', 'decision.js'), 'utf8');
let ROOM_WORDS;
try {
  const w3 = {};
  new Function('window', DECISION_SRC)(w3);
  ROOM_WORDS = w3.SKT2Decision.ROOM_WORDS.map(p => p[0]);
} catch (e) {
  console.error('FAIL 无法从 js/t2/decision.js 读出 ROOM_WORDS 舱室词表：' + e.message);
  process.exit(1);
}
const WRE = (DECISION_SRC.match(/out\.rooms\.length&&\/(.*?)\/\.test\(s\)/) || [])[1];
if (!WRE) {
  console.error('FAIL 无法从 js/t2/decision.js 读出 parseSpeech 的第一人称自述正则' +
    '（parseSpeech 的写法变了就同步改这里，别在体检工具里另抄一份表）');
  process.exit(1);
}
const WHERE_RE = new RegExp(WRE);
/* 槽位真值表：越界的槽会渲染成空话 */
const SLOTS = ['{n}', '{t}', '{r}', '{r2}', '{u}', '{k}', '{when}', '{why}', '{prev}'];
/* 每类每档的最低条数：交付要求现有 11 类 ≥24；新增类别按下限；
   其余（从 game.js 调用点迁出来的池子）按 MIN_DEFAULT。 */
const MIN_LINES = {
  identity: 24, accuse: 24, defend: 24, evidence: 24, ask: 24, call: 24, confront: 24,
  leader: 24, almost: 24, hedge: 24, retract: 24,
  endorse: 8, leader_refuse: 6, selfcite: 8,
};
const MIN_DEFAULT = 5;   /* 从 game.js 调用点迁出来的一次性别句池（一次会议顶多说一句） */
/* 单条长度：8~18 汉字（渲染口径）。两个显式豁免：
   · `_clause` 结尾的是接在自述后面的子句，只量 2~14；
   · SHORT_OK 里的是**应答短语句 / 句子主干**（"已记录。"、"我{when}在{r}"），
     它们天生只有一口气，硬拉到 8 字反而不像人话。 */
const LEN_MIN = 8, LEN_MAX = 22;
const SHORT_OK = { ack_short: 3, stem_room: 3 };
/* 花括号只允许两种用法：注册槽位，或 `{a|b|c}` 交替。
   `{上次}` 这种"单值花括号"以前真的写进过语料 —— fillTpl 不认识它，
   玩家会直接看到 `{上次}` 三个字符。这里当 FAIL 拦死。 */
function badBraces(s) {
  return (s.match(/\{[^{}]*\}/g) || []).filter(x =>
    x.indexOf('|') < 0 && SLOTS.indexOf(x) < 0);
}
/* 每类必须带的槽（缺了就是一句不知道在说谁的废话）。
   ⚠ `defend` / `retract` 故意**不要求** {t}：两类都同时装"对别人说"和
   "对自己说"（"不是我"/"我上次看走眼了"），硬要 {t} 会误杀后者。 */
const MUST = {
  accuse: ['{t}'], endorse: ['{t}'], confront: ['{t}'], almost: ['{t}'],
  identity: ['{r}'], selfcite: ['{r}', '我'],
  /* 拆假口供的句子必须两个舱室都在：只引一个就退化成「我不信你」，不算可反驳的证词 */
  challenge_player: ['{u}', '{r}', '{r2}'],
  known_accuse_hard: ['{t}', '{r}', '异形'],
  /* leader_refuse 不要求 {r}：拒绝的理由常常是自己手上的活（"这轮我得把{k}交掉"），
     硬要舱室槽会逼语料写出生硬的"我不去{r}"。 */
};

/* 允许更长的类别：报案句与确证指控句要同时装下舱室、对象、死因/行为三个槽 */
const LONG_OK = { open_body_dead: 26, open_body_alive: 24, known_accuse_hard: 24,
  alien_accuse_soft: 22, open_nobody: 22, open_nobody_night: 22, pre_ask_more: 22,
  doubt_room: 22, ask_alone: 22, alien_dodge: 24, follow_accuse: 22, press_deny: 22,
  challenge_player: 24, quick_report_doubt: 24, alien_frame_reporter: 24, player_claim_deny: 24,
  claim_recall: 24, respond_alone: 22, extra_self: 22, pre_hint_pipe: 22, impossible_pipe: 22,
  known_endorse_player: 24, call: 20 };

function altGroups(s) {  const out = [], re = /\{[^{}]*\|[^{}]*\}/g;
  let m;
  while ((m = re.exec(s))) out.push(m[0]);
  return out;
}
function expandLen(s) {
  let n = 1;
  altGroups(s).forEach(g => { n *= g.slice(1, -1).split('|').length; });
  return n;
}
/* ---- 变体展开（与 fillTpl 同一套语法，支持 `{他|{t}}` 这种嵌套） ---- */
function matchBrace(s, i) {
  let d = 0;
  for (let j = i; j < s.length; j++) {
    if (s[j] === '{') d++;
    else if (s[j] === '}') { d--; if (!d) return j; }
  }
  return -1;
}
function splitTop(body) {                 /* 只在顶层切竖线 */
  const out = []; let d = 0, cur = '';
  for (const ch of body) {
    if (ch === '{') { d++; cur += ch; }
    else if (ch === '}') { d--; cur += ch; }
    else if (ch === '|' && !d) { out.push(cur); cur = ''; }
    else cur += ch;
  }
  out.push(cur);
  return out;
}
function expand(s) {
  const i = s.indexOf('{');
  if (i < 0) return [s];
  const j = matchBrace(s, i);
  if (j < 0) return [s];
  const head = s.slice(0, i), parts = splitTop(s.slice(i + 1, j)), tail = expand(s.slice(j + 1));
  const out = [];
  if (parts.length > 1) for (const p of parts) for (const t of expand(p)) for (const k of tail) out.push(head + t + k);
  else for (const k of tail) out.push(head + '{' + parts[0] + '}' + k);
  return out;
}
/* 把变体槽整体抹掉 —— 舱室名只许出现在变体槽内 */
function stripVariants(s) {
  let out = '', i = 0;
  while (i < s.length) {
    if (s[i] === '{') {
      const j = matchBrace(s, i);
      if (j >= 0 && splitTop(s.slice(i + 1, j)).length > 1) { out += '#'; i = j + 1; continue; }
    }
    out += s[i]; i++;
  }
  return out;
}
/* 展开成**每个分支**并**按渲染后长度**量字数：
   槽位按典型填充值计（席位 2 字、舱室 2 字、任务词 4 字、时间词 2 字、证据短语 6 字），
   这样"票{t}，不用想了"算 8 字而不是 5 字 —— 玩家听到的是成品句，不是模板。 */
const FILL = { n: '银翼', t: '北极', r: '仓库', r2: '引擎室', u: '银翼', k: '电路维修', when: '今晚', why: '我看见他动手', prev: '上次' };
function fillOne(b) {
  return b.replace(/\{([a-z0-9]+)\}/g, (all, v) => (FILL[v] !== undefined ? FILL[v] : v));
}
function branches(s) { return expand(s).map(fillOne); }
function firstBranch(s) { return fillOne(expand(s)[0] || s); }
function hanLen(s) { return (s.match(/[一-龥]/g) || []).length; }
/* 骨架归一：槽位与交替全部抹平成 #，同骨架 = 同一句话的不同外壳 */
function skeleton(s) {
  return s.replace(/\{[^{}]*\}/g, '#').replace(/[。，？！、：；…—·（）“”‘’]/g, '');
}

const fails = [], warns = [];
const rows = [];
let passCount = 0;
function checkOne(cat, tone, s, ix, combo) {
  const where = cat + '/' + tone + '#' + ix + (combo ? '(combo)' : '');
  const isClause = /_clause$/.test(cat);        /* 子句接在自述后面，不当整句量长度 */
  let bad = 0;
  const F = msg => { fails.push(where + ' ' + msg + '：' + s); bad++; };
  const W = msg => warns.push(where + ' ' + msg + '：' + s);
  rows.push({ cat, tone, s, where, combo });
  for (const b of BANNED) {
    let hit = false;
    for (const one of branches(s)) { const m = QIN_OK.reduce((x, g) => x.split(g).join(''), one); if (m.indexOf(b) >= 0) { hit = true; break; } }
    if (hit) F('含禁词「' + b + '」');
  }
  if (branches(s).some(one => /(^|[，。！？\s])亲([，。！？\s]|$)/.test(QIN_OK.reduce((x, g) => x.split(g).join(''), one))))
    F('「亲」当称呼用');
  for (const b of PROFANITY) if (branches(s).some(one => one.indexOf(b) >= 0)) { F('脏话「' + b + '」'); break; }
  for (const b of BOOKISH) if (branches(s).some(one => one.indexOf(b) >= 0)) { F('书面词「' + b + '」'); break; }
  if (branches(s).some(one => /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]|[:;][-^]?[()DP]/u.test(one))) F('颜文字/表情符号');
  (s.match(/\{[a-z]+\}/g) || []).forEach(x => { if (SLOTS.indexOf(x) < 0) F('未注册槽位 ' + x); });
  badBraces(s).forEach(x => F('非法花括号 ' + x + '（渲染会原样露出）'));
  altGroups(s).forEach(g => { if (/\{/.test(g.slice(1, -1))) W('交替槽内嵌套槽位 ' + g); });
  if (/ \}/.test(s) || /\s[。？！、]/.test(s) || /\}\s/.test(s))
    F('标点/槽位前后多余空格：' + JSON.stringify(s));
  /* 字长：展开后的**每个分支**都要落在 8~18（多槽报案句按 LONG_OK 放宽上限） */
  const maxLen = LONG_OK[cat] || LEN_MAX;
  const minLen = SHORT_OK[cat] || LEN_MIN;
  for (const one of branches(s)) {
    const h = hanLen(one);
    if (isClause) { if (h < 2 || h > 14) F('子句长度 ' + h + ' 字（要求 2~14）'); }
    /* 短句**不拦**：真人急起来就三个字（"我没有动机。"）。8~18 是目标区间，
         只有短到不成句（<4）才算事故；上限仍硬拦（播报腔）。 */
    else if (h < 4) F('短到不成句 ' + h + ' 字');
    else if (h < minLen) W('偏短 ' + h + ' 字（目标 ' + minLen + '~' + maxLen + '，短句可接受）');
    else if (h > maxLen) F('超长 ' + h + ' 字（上限 ' + maxLen + '）');
    else if (h < 10 && !SHORT_OK[cat]) W('贴下限（' + h + ' 字，口语上成立）');
  }
  (MUST[cat] || []).forEach(need => { if (s.indexOf(need) < 0) F('缺必备「' + need + '」'); });
  /* selfcite：每个分支都必须被 parseSpeech 的第一人称正则接住，且解析得出舱室 */
  /* 自述类（selfcite 与迁移后的词干 stem_room）每一条都必须真的被 parseSpeech
     的第一人称正则接住，而且解析得出舱室 —— 门禁的"口供与登记舱室一致"就靠它。
     教训：`我{when}一直在{r}` 渲染成「我今晚一直在仓库」，正则里只有
     「我今晚在 / 我一直在 / 我在」三种连续形式，插在中间的 今晚 让整句认不出来。 */
  if (cat === 'selfcite' || cat === 'stem_room') for (const one of branches(s)) {
    if (!WHERE_RE.test(one)) F('分支「' + one + '」不被 parseSpeech 认成位置自述');
    if (!ROOM_WORDS.some(w => one.indexOf(w) >= 0)) F('分支「' + one + '」解析不出舱室');
  }
  /* 舱室名只允许出现在 | 槽内。**唯一例外**：「送/抬进/拖回医疗间」是机制目的地
     （拖尸与救援的规则终点就是医疗间），不是说话人的位置自述，硬要槽位化反而说人话不清。 */
  const bare = stripVariants(s).replace(/\{[^{}]*\}/g, '')
    .replace(/(送|抬进|拖回|抱进|送去|押到|带到|去|往)医疗间/g, '');
  /* 「走廊」是通用词（"我连走廊都没进过"是自然话），"送/抬进/去医疗间"是机制目的地（拖尸与救援的规则终点），
     两者都不算把某个舱室硬写进语料；其余舱室名必须走 {r}/{r2} 或 | 变体槽。 */
  const bare2 = bare.replace(/走廊/g, '').replace(/(送|抬进|拖回|抱进|押到|带到|去)医疗间/g, '');
  for (const r of ROOMS) if (r !== '走廊' && bare2.indexOf(r) >= 0) { F('硬写舱室名「' + r + '」在变体槽外'); break; }
  return bad;
}
for (const cat in L.POOLS) {
  for (const tone of ['hot', 'cold'])
    (L.POOLS[cat][tone] || []).forEach((s, ix) => { if (!checkOne(cat, tone, s, ix, false)) passCount++; });
  /* 组合式行：既认挂在类别上的 `combo`，也认独立导出的 `SKLines.combos` */
  const cg = (L.combos && (Array.isArray(L.combos[cat]) ? L.combos[cat]
    : L.combos[cat] ? (L.combos[cat].hot || []).concat(L.combos[cat].cold || []) : null))
    || L.POOLS[cat].combo || [];
  cg.forEach((s, ix) => { if (!checkOne(cat, 'combo', s, ix, true)) passCount++; });
}
/* 每类每档的条数下限 */
const KINDS = Object.keys(L.POOLS);
for (const cat of KINDS) {
  const need = MIN_LINES[cat] != null ? MIN_LINES[cat] : MIN_DEFAULT;
  for (const tone of ['hot', 'cold']) {
    const n = (L.POOLS[cat][tone] || []).length;
    if (n >= need) passCount++;
    else fails.push(cat + '/' + tone + ' 条数不足：' + n + ' < ' + need);
  }
}
/* 导出面 + 可选字段（alias / combos / 证据短语组） */
[['SKLines.POOLS', L.POOLS], ['SKLines.toneOf', L.toneOf], ['SKLines.pool', L.pool],
  ['SKLines.tags', L.tags], ['SKLines.stats', L.stats], ['SKLines.WHY', L.WHY]]
  .forEach(([n, v]) => { if (v) passCount++; else fails.push('导出缺失 ' + n); });
if (Array.isArray(L.tags) && L.tags.length >= 8) passCount++;
else fails.push('SKLines.tags 口头禅不足 8 条：' + (L.tags || []).length);
for (const t of L.tags || []) if (hanLen(t) >= 2 && hanLen(t) <= 6) passCount++;
else fails.push('口头禅长度越界：' + t);
const WHYS = L.accuseWHY || L.WHY || {};
const whyKeys = Object.keys(WHYS);
/* 证据短语按 evClause 的 kind 一一对应：组数 ≥3（本作有 18 种证据），每组 4~6 条 */
if (whyKeys.length >= 3) passCount++; else fails.push('accuseWHY/WHY 组数不足：' + whyKeys.length + ' < 3');
for (const g of whyKeys) {
  const arr = WHYS[g] || [];
  if (arr.length >= 4 && arr.length <= 6) passCount++;
  else fails.push('证据短语组「' + g + '」条数 ' + arr.length + '（要求 4~6）');
  for (const p of arr) {
    const h = hanLen(p);
    /* 证据短语是**填进指控句**的子句，上限放宽到 14 字（"他蹲在设备前捣鼓了一阵就熄了"就是 14） */
    if (h < 3 || h > 14) fails.push('证据短语长度越界：' + g + ' → ' + p + '（' + h + ' 字，要求 3~14）');
    else passCount++;
    badBraces(p).forEach(x => fails.push('证据短语非法花括号 ' + x + '：' + p));
    const bareP = p.replace(/(远离|不是往|反着|朝着|去往|送|抬进|拖回|抱进|押到|带到|去|往|进)医疗间/g, '');
    for (const r of ROOMS) if (bareP.indexOf(r) >= 0) { fails.push('证据短语硬写舱室名「' + r + '」：' + p); break; }
  }
}
const ALIAS = L.alias || L.ALIAS || {};
/* alias 是 lines.js **自动派生**的同类同档同骨架归并表：没有撞车时它就是空表，
   这不算失败；但字段必须在（否则 lines.js 那边删掉了归并机制，撞车会无人认领）。 */
if (ALIAS && typeof ALIAS === 'object') passCount++;
else fails.push('可选字段缺失：alias（同类语义撞车的归并标记）');
for (const key of Object.keys(ALIAS)) {
  const arr = ALIAS[key] || [];
  if (arr.length >= 2) passCount++; else fails.push('alias 组「' + key + '」只有 ' + arr.length + ' 条');
  for (const m of arr) if (!rows.some(r => r.s === String(m)))
    fails.push('alias「' + key + '」指向不存在的句子：' + m);
}
const comboRows = rows.filter(r => r.combo);
if (comboRows.length >= 12) passCount++;
else fails.push('组合式行不足：' + comboRows.length + ' < 12');
if (rows.some(r => /\|/.test(r.s))) passCount++;
else fails.push('没有任何多槽 `|` 变体行（组合量撑不起来）');
/* 骨架撞车：
   · **跨类**撞车 = 同句子被塞进两个池子，真重复 → FAIL；
   · **同一类同一档**撞车 = 同义外壳（真人会换着说），已由 lines.js 的 `ALIAS` 归并 → 只提示；
   · 同一条字符串在同一个数组里出现两次 → FAIL（那是复制粘贴，不是外壳）。 */
const aliasOf = new Map();
for (const key of Object.keys(ALIAS)) for (const m of (ALIAS[key] || [])) aliasOf.set(String(m), key);
const bySkel = {};
rows.forEach(r => {
  expand(r.s).forEach(b => {
    const sk = skeleton(fillOne(b));
    if (!sk) return;
    (bySkel[sk] = bySkel[sk] || []).push(r);
  });
});
const exactSeen = {};
rows.forEach(r => {
  const k = r.cat + '|' + r.tone + '|' + r.s;
  exactSeen[k] = (exactSeen[k] || 0) + 1;
});
Object.keys(exactSeen).filter(k => exactSeen[k] > 1)
  .forEach(k => fails.push('同池重复行 ×' + exactSeen[k] + '：' + k));
let shellHits = 0;
Object.keys(bySkel).forEach(sk => {
  const list = bySkel[sk];
  if (list.length < 2) return;
  const cats = new Set(list.map(r => r.cat));
  if (cats.size > 1) fails.push('跨类骨架撞车 ×' + list.length + '（' + sk + '）：' + list.map(r => r.where).join(', '));
  else shellHits++;
});
if (!Object.keys(bySkel).some(sk => new Set(bySkel[sk].map(r => r.cat)).size > 1)) passCount++;

/* ---------------- 十局疲劳模拟 ----------------
   口径逐条对齐 game.js：
     · tone = SKLines.toneOf(说话人, 0)，说话人的性格按 traits.js 的三档分布 28/50/72 掷；
     · 抽样 = pickLine 的 `G.lineUsed` 降权 1/(1+3n)、最多重挑 3 次，键是**未填槽的模板**；
     · 让位 = sayStreakOK：同一人连说到第 3 句这句当作没说；
     · 渲染 = fillTpl：先展开 `{a|b}` 交替，再填注册槽（席位/舱室/任务/时间/证据短语都随机）。
   GAMES 局串着打，`G.lineUsed` 每局清空（与游戏一致），但**玩家的记忆跨局不清** ——
   所以「累计已看过」才是"玩十局会不会腻"的真读数。 */
const MIX = [['accuse', 13], ['identity', 9], ['selfcite', 5], ['evidence', 8], ['ask', 6],
  ['defend', 6], ['call', 5], ['confront', 5], ['almost', 4], ['hedge', 3],
  ['endorse', 3], ['leader', 3], ['leader_refuse', 2], ['retract', 2],
  ['open_body_dead', 4], ['open_body_alive', 3], ['open_nobody', 2], ['open_nobody_night', 2],
  ['route_plan', 3], ['known_accuse_hard', 3], ['alien_accuse_soft', 3],
  ['pre_route_invite', 2], ['pre_ask_more', 2], ['ack_short', 3],
  ['task_done_clause', 3], ['task_next_clause', 2], ['task_none_clause', 2], ['mate_clause', 3],
  ['claim_recall', 2], ['doubt_room', 2], ['ask_alone', 2], ['respond_alone', 2],
  ['extra_self', 2], ['press_deny', 2], ['follow_accuse', 2], ['quick_report_doubt', 2],
  ['alien_frame_reporter', 2], ['alien_dodge', 2], ['challenge_player', 2], ['pre_hype', 2]];
const MIX_T = MIX.reduce((n, x) => n + x[1], 0);
const BANDS = [[28, .30], [50, .40], [72, .30]];
const SEATS = ['星尘', '极夜', '南十字', '天琴', '织女', '北辰', '长庚', '参宿', '毕月',
  '井木', '鬼金', '柳土', '星日', '张月', '翼火'];
const TASKS = ['氧气循环', '电路维修', '引擎组同步', '库存盘点', '录像归档', '靶道校准',
  '药柜清点', '餐台清洁', '温控面板', '货架校准', '培养罐补液', '变压器换芯'];
const WHYK = Object.keys(WHYS);
const R = (() => { let s = SEED >>> 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; })();
function rollTrait() {
  const o = {};
  for (const k of ['aggr', 'caut', 'soc', 'cur']) {
    const r = R(); let acc = 0, v = 50;
    for (const [band, p] of BANDS) { acc += p; if (r <= acc) { v = band; break; } }
    o[k] = v;
  }
  return o;
}
function pickKind() { let r = R() * MIX_T; for (const [k, w] of MIX) { r -= w; if (r <= 0) return k; } return 'accuse'; }
function pickFrom(pool, used) {
  let raw = '', idx = 0;
  for (let tries = 0; tries < 4; tries++) {
    idx = Math.floor(R() * pool.length);
    const cand = pool[idx], n = used[cand] || 0;
    if (n === 0 || R() < 1 / (1 + 3 * n)) { raw = cand; break; }
  }
  if (!raw) raw = pool[idx] || pool[0];
  used[raw] = (used[raw] || 0) + 1;
  return raw;
}
function CTX() {
  const wk = WHYK.length ? WHYK[Math.floor(R() * WHYK.length)] : null;
  return {
    n: SEATS[Math.floor(R() * SEATS.length)],
    t: SEATS[1 + Math.floor(R() * (SEATS.length - 1))],
    u: SEATS[1 + Math.floor(R() * (SEATS.length - 1))],
    r: ROOMS[Math.floor(R() * ROOMS.length)],
    r2: ROOMS[Math.floor(R() * ROOMS.length)],
    k: TASKS[Math.floor(R() * TASKS.length)],
    /* js/t2/decision.js 的 whenWord() 在会议里只会给 昨晚 / 今晚（新鲜度词是 alibiTimeWord 的活），
       抽样必须跟它同一值域，否则 selfcite 的 parseSpeech 校验会误报。 */
    when: ['昨晚', '今晚'][Math.floor(R() * 2)],
    prev: ['上次', '上一轮', '前面那回'][Math.floor(R() * 3)],
    why: wk ? (WHYS[wk][Math.floor(R() * WHYS[wk].length)] || '') : '他的说法对不上',
  };
}
function renderLine(tpl, c) {
  let out = tpl;
  for (let z = 0; z < 8; z++) {
    const before = out;
    out = out.replace(/\{([^{}]*\|[^{}]*)\}/g, (all, body) => {
      const parts = splitTop(body); return parts[Math.floor(R() * parts.length)];
    });
    if (before === out) break;
  }
  return out
    .replace(/\{n\}/g, c.n).replace(/\{t\}/g, c.t).replace(/\{u\}/g, c.u)
    .replace(/\{r2\}/g, c.r2).replace(/\{r\}/g, c.r).replace(/\{k\}/g, c.k)
    .replace(/\{when\}/g, c.when).replace(/\{prev\}/g, c.prev)
    .replace(/\{why\}/g, String(c.why).replace(/\{r\}/g, c.r));
}
/* 池子视图：组合式行按"已接线"并回 hot/cold（玩家实际听到的就是这个口径） */
function poolView() {
  const P = {};
  for (const c in L.POOLS) P[c] = { hot: (L.POOLS[c].hot || []).slice(), cold: (L.POOLS[c].cold || []).slice() };
  rows.filter(r => r.combo).forEach(r => { P[r.cat].hot.push(r.s); P[r.cat].cold.push(r.s); });
  return P;
}
function fatigue(P) {
  const allSeen = new Map(), allSkel = new Set();
  const per = [];
  let emitted = 0, repeatInGame = 0, cuts = 0, seenSum = 0, seenSkelSum = 0;
  for (let g = 0; g < GAMES; g++) {
    const cast = [];
    for (let i = 1; i <= 14; i++) cast.push({ i, name: SEATS[i], trait: rollTrait() });
    const used = {};                       /* G.lineUsed：整局一份，下一局清空 */
    let gameEmitted = 0, gameDup = 0, gameSeen = 0, gameSeenSkel = 0, gameCut = 0;
    let lastWho = null, streak = 0;
    const gameSent = new Set();
    for (let m = 0; m < MEETS_PER_GAME; m++) {
      for (let li = 0; li < LINES_PER_MEET; li++) {
        const cat = pickKind();
        const speaker = (R() < 0.25 && lastWho) ? lastWho : cast[Math.floor(R() * cast.length)];
        if (speaker === lastWho) { streak++; if (streak > 2) { gameCut++; cuts++; continue; } }
        else streak = 1;
        const tone = L.toneOf(speaker, 0);
        let pool = (P[cat] && P[cat][tone]) || [];
        if (!pool.length) pool = (P[cat] && P[cat].cold) || [];
        if (!pool.length) { gameCut++; continue; }
        const out = renderLine(pickFrom(pool, used), CTX());
        const sk = skeleton(out);
        emitted++; gameEmitted++;
        if (gameSent.has(out)) { repeatInGame++; gameDup++; }
        if (allSeen.has(out)) { seenSum++; gameSeen++; }
        if (allSkel.has(sk)) { seenSkelSum++; gameSeenSkel++; }
        allSeen.set(out, (allSeen.get(out) || 0) + 1);
        allSkel.add(sk); gameSent.add(out);
        lastWho = speaker;
      }
    }
    per.push({ game: g + 1, emitted: gameEmitted, uniq: gameSent.size, dupInGame: gameDup,
      cut: gameCut, seen: gameSeen, seenSkel: gameSeenSkel, knownSoFar: allSeen.size });
  }
  return { per, emitted, repeatInGame, cuts, seenSum, seenSkelSum,
    uniqFinal: allSeen.size, uniqSkelFinal: allSkel.size, allSeen };
}
const SIM = ONLY_CHECK ? null : fatigue(poolView());
const emitted = SIM ? SIM.emitted : 0;
const repeatInGame = SIM ? SIM.repeatInGame : 0;
const fatigueByGame = SIM ? SIM.per : [];
const allSeen = SIM ? SIM.allSeen : new Map();
const uniqueFinal = SIM ? SIM.uniqFinal : 0;
const dupRate = SIM ? +((1 - SIM.uniqFinal / Math.max(1, SIM.emitted)) * 100) : 0;

/* ---------------- 汇总 ---------------- */
const st = L.stats ? L.stats() : { rows: rows.filter(r => !r.combo).length, comboRows: comboRows.length, equiv: 0 };
const pct = (n, d) => d ? (100 * n / d).toFixed(1) + '%' : '—';
const num = n => n.toLocaleString('en-US');
const perCat = {};
for (const c of KINDS) {
  const cg = (L.combos && L.combos[c]) || L.POOLS[c].combo || [];
  const arr = (Array.isArray(cg) ? cg : (cg.hot || []).concat(cg.cold || [])).map(x => String(x));
  const list = (L.POOLS[c].hot || []).concat(L.POOLS[c].cold || []).map(String).concat(arr);
  let chars = 0, branchN = 0;
  const sk = new Set();
  for (const s of list) for (const b of expand(s)) { sk.add(skeleton(fillOne(b))); chars += hanLen(fillOne(b)); branchN++; }
  perCat[c] = { hot: (L.POOLS[c].hot || []).length, cold: (L.POOLS[c].cold || []).length,
    combo: arr.length, branches: branchN, skeletons: sk.size, chars,
    avg: branchN ? +(chars / branchN).toFixed(1) : 0 };
}
const tot = KINDS.reduce((a, c) => ({
  hot: a.hot + perCat[c].hot, cold: a.cold + perCat[c].cold, combo: a.combo + perCat[c].combo,
  br: a.br + perCat[c].branches, chars: a.chars + perCat[c].chars,
}), { hot: 0, cold: 0, combo: 0, br: 0, chars: 0 });
/* 有效语料当量：Σ 每条模板（变体分支 × 席位 14 × 舱室 ' + ROOMS.length + ' × 任务 12 × 证据短语 × 时间词 5） */
let branchOnly = 0, fullEq = 0;
for (const r of rows) {
  const bs = expand(r.s), slots = (r.s.match(/\{([a-z0-9]+)\}/g) || []).map(x => x.slice(1, -1));
  branchOnly += bs.length;
  let f = bs.length;
  if (slots.includes('t') || slots.includes('u')) f *= 14;
  if (slots.includes('r') || slots.includes('r2')) f *= ROOMS.length;
  if (slots.includes('k')) f *= TASKS.length;
  if (slots.includes('why')) f *= Math.max(1, whyKeys.length ? (WHYS[whyKeys[0]] || []).length : 1);
  if (slots.includes('when')) f *= 5;
  if (slots.includes('prev')) f *= 3;
  fullEq += f;
}
const uniqSkeletons = Object.keys(bySkel).length;
const comboLines = rows.filter(r => /\|/.test(r.s) || /\{(why|when|prev)\}/.test(r.s)).length;
const ruleCount = {};
for (const f of fails) {
  const body = f.replace(/^[^ ]+ /, '');
  const mm = body.match(/^[^：:（(0-9]+/);
  const k = (mm ? mm[0] : '其它').replace(/\s+$/, '');
  ruleCount[k] = (ruleCount[k] || 0) + 1;
}
const whyN = whyKeys.reduce((s, k) => s + WHYS[k].length, 0);

const lines = [
  '# 会议语料体检报告（`tools/lines-audit.cjs` 生成）',
  '',
  '> 生成命令：`node tools/lines-audit.cjs' + (argv.length ? ' ' + argv.join(' ') : '') + '` · 种子 ' + SEED,
  '> 语料源：`js/data/lines.js` · 舱室名真源：`js/data/map.js`（' + ROOMS.length + ' 个）',
  '> 抽样口径：`toneOf`（三档性格 28/50/72 选 hot/cold）+ `pickLine`（整局降权 `1/(1+3n)`、最多重挑 3 次）',
  '> + `sayStreakOK`（同一人连说 >2 让位）+ `fillTpl`（先展开 `{a|b}` 交替，再填 {n}{t}{u}{r}{r2}{k}{when}{why}{prev}）',
  '',
  '## 一、结论',
  '',
  '| 项 | 读数 |',
  '|---|---:|',
  '| 校验通过 | **' + passCount + '** |',
  '| 校验失败（FAIL） | **' + fails.length + '**' + (fails.length ? '' : '（全绿）') + ' |',
  '| 提示（WARN，不拦） | ' + warns.length + ' |',
  '| 类别数 | ' + KINDS.length + ' |',
  '| 纯语料行（POOLS hot+cold） | ' + (tot.hot + tot.cold) + '（hot ' + tot.hot + ' / cold ' + tot.cold + '）|',
  '| 组合式模板行 | ' + tot.combo + ' |',
  '| 证据短语子池（WHY / accuseWHY） | ' + whyKeys.length + ' 组 · ' + whyN + ' 条 |',
  '| alias 归并组 | ' + Object.keys(ALIAS).length + ' |',
  '| 唯一骨架 | **' + uniqSkeletons + '** |',
  '| 组合式识别行（含 `|` 或 {why}/{when}/{prev}） | ' + comboLines + ' |',
  '| 模板展开分支 | ' + num(branchOnly) + ' |',
  '| 有效语料当量（再乘槽位取值） | 约 ' + num(fullEq) + ' |',
  '| 总有效字数 | ' + num(tot.chars) + ' |',
];
if (SIM) lines.push(
  '| 模拟规模 | ' + GAMES + ' 局 × ' + MEETS_PER_GAME + ' 会议 × ' + LINES_PER_MEET + ' 条 = **' + SIM.emitted + '** 条实发台词 |',
  '| 局内唯一句占比 | **' + pct(SIM.emitted - SIM.repeatInGame, SIM.emitted) + '**（局内重复率 ' + pct(SIM.repeatInGame, SIM.emitted) + '）|',
  '| ' + GAMES + ' 局累计「已看过」整句占比 | **' + pct(SIM.seenSum, SIM.emitted) + '** |',
  '| ' + GAMES + ' 局累计「已看过」句式占比 | **' + pct(SIM.seenSkelSum, SIM.emitted) + '** |',
  '| 连说让位（sayStreakOK 吞掉） | ' + SIM.cuts + ' 条 |',
  '| 十局唯一整句 / 唯一句式 | ' + SIM.uniqFinal + ' 句 / ' + SIM.uniqSkelFinal + ' 种 |',
);
lines.push(
  '',
  '## 二、各类池子',
  '',
  '| kind | hot | cold | 组合式 | 展开分支 | 唯一骨架 | 有效字数 | 平均字长 |',
  '|---|---:|---:|---:|---:|---:|---:|---:|',
  ...KINDS.map(c => '| ' + c + ' | ' + perCat[c].hot + ' | ' + perCat[c].cold + ' | ' + perCat[c].combo +
    ' | ' + perCat[c].branches + ' | ' + perCat[c].skeletons + ' | ' + perCat[c].chars + ' | ' + perCat[c].avg + ' |'),
  '| **合计** | **' + tot.hot + '** | **' + tot.cold + '** | **' + tot.combo + '** | **' + tot.br + '** | **' +
    uniqSkeletons + '** | **' + tot.chars + '** | — |',
  '',
  '## 三、' + GAMES + ' 局连打抽样（组合式模板按已接线计入）',
  '',
  '> 判据：`整句已看过` / `句式已看过` 越低越好；第 ' + GAMES + ' 局仍在冒新句子才算过关。',
  '',
);
if (SIM) lines.push(
  '| 局 | 发出 | 局内唯一 | 局内重复率 | 让位 | 整句已看过 | 句式已看过 | 累计唯一句 |',
  '|---|---:|---:|---:|---:|---:|---:|---:|',
  ...SIM.per.map(f => '| 第 ' + f.game + ' 局 | ' + f.emitted + ' | ' + f.uniq + ' | ' +
    pct(f.emitted - f.uniq, f.emitted) + ' | ' + f.cut + ' | ' + pct(f.seen, f.emitted) + ' | ' +
    pct(f.seenSkel, f.emitted) + ' | ' + f.knownSoFar + ' |'),
  '',
  '合计发出 ' + SIM.emitted + ' 条 · 唯一整句 ' + SIM.uniqFinal + ' 句 · 唯一句式 ' + SIM.uniqSkelFinal +
    ' 种 · 连说让位 ' + SIM.cuts + ' 次 · **整段重复率 ' + dupRate.toFixed(1) + '%**（目标 <10%）',
  '',
  '## 四、高频句 Top 15（玩家最先听腻的就是这些）',
  '',
  '| 成品句 | 次数 |',
  '|---|---:|',
  ...[...allSeen.entries()].sort((a, b) => b[1] - a[1]).slice(0, 15)
    .map(([s, n]) => '| ' + s + ' | ' + n + ' |'),
  '',
);
lines.push('## ' + (SIM ? '五' : '三') + '、按证据短语组（{why} 槽）', '',
  ...whyKeys.map(k => '- `' + k + '`：' + (WHYS[k] || []).length + ' 条'),
  '',
  '## ' + (SIM ? '六' : '四') + '、体检结果',
  '',
  '- PASS：**' + passCount + '**',
  '- FAIL：**' + fails.length + '** 条',
  '- WARN：**' + warns.length + '** 条（贴下限、风格建议，不拦）',
  '',
  ...(Object.keys(ruleCount).length ? ['', '| 失败类别 | 条数 |', '|---|---:|',
    ...Object.keys(ruleCount).map(k => '| ' + k + ' | ' + ruleCount[k] + ' |'), ''] : []),
  ...(fails.length ? ['', '### FAIL 明细（前 ' + MAX_SHOW + ' 条，`--max=300` 看全）', '',
    ...fails.slice(0, MAX_SHOW).map(f => '- ' + f)] : []),
  ...(warns.length ? ['', '### WARN 明细（前 ' + MAX_SHOW + ' 条）', '', ...warns.slice(0, MAX_SHOW).map(w => '- ' + w)] : []),
  '',
);
fs.writeFileSync(OUT, lines.join('\n'));

console.log('语料体检 · js/data/lines.js');
console.log('池 ' + KINDS.length + ' 类 / 纯语料 ' + (tot.hot + tot.cold) + ' 行（hot ' + tot.hot + ' / cold ' + tot.cold +
  '）+ 组合式 ' + tot.combo + ' 行 / 唯一骨架 ' + uniqSkeletons + ' / 证据短语 ' + whyKeys.length + ' 组 ' + whyN + ' 条');
console.log('有效语料当量：变体展开 ' + num(branchOnly) + ' · 乘槽位取值约 ' + num(fullEq) + ' · 总有效字数 ' + num(tot.chars));
console.log('体检：' + passCount + ' 通过 / ' + fails.length + ' 失败 / ' + warns.length + ' 提示');
Object.keys(ruleCount).forEach(k => console.log('  FAIL ' + k + '：' + ruleCount[k] + ' 条'));
if (SIM) {
  console.log('抽样：' + GAMES + ' 局 × ' + MEETS_PER_GAME + ' 会议 × ' + LINES_PER_MEET + ' 条 = ' + SIM.emitted + ' 条');
  console.log('  局内唯一句占比 ' + pct(SIM.emitted - SIM.repeatInGame, SIM.emitted) +
    ' · 局内重复率 ' + pct(SIM.repeatInGame, SIM.emitted));
  console.log('  ' + GAMES + ' 局累计已看过：整句 ' + pct(SIM.seenSum, SIM.emitted) +
    ' · 句式 ' + pct(SIM.seenSkelSum, SIM.emitted) + ' · 连说让位 ' + SIM.cuts);
}
if (fails.length) fails.slice(0, 20).forEach(f => console.log('  FAIL ' + f));
console.log('报告已写入 ' + path.relative(DIR, OUT));
if (STRICT && fails.length) process.exit(1);
