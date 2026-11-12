/* 全量「推理 / 发言」规则真源导出。
 *
 * 口径（2026-11-08 用户裁定）：2.5D 与 3D 只有**维度、美术、玩家输入映射**三处差异，
 * AI 推理、发言、判定规则必须同源。本文件把与地形无关的四个纯逻辑模块
 * 全部抽成一份可由 GDScript 读取的契约，并对每个函数留源码指纹。
 *
 *   js/ai/sanity.js     规则表（SKSanity，37 张表 + 纯函数）
 *   js/ai/traits.js     性格轴（SKTrait：AXES/BANDS/C）
 *   js/t2/ai.js         认知链（SKT2AI，38 个纯函数）
 *   js/t2/decision.js   发言/会议排期（SKT2Decision，15 个导出）
 *   js/game.js          推理用常量（EV_W / ID_EVIDENCE 等，具名抠取）
 *
 * 三层导出：
 *   ① tables           —— 所有纯数据对象，GDScript 直接读值
 *   ② fn_fingerprints  —— 每个纯函数的源码 SHA + 数值字面量清单
 *                          （2.5D 改任何一个阈值，SHA 就变，check-parity 立刻 FAIL）
 *   ③ functions        —— 函数清单，供 3d/spec/parity-map.json 逐项对账
 *
 * 用法：node 3d/tools/export-rules.cjs
 * 也可被 check-parity.cjs require：const { buildRules } = require('./export-rules.cjs')
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = path.resolve(__dirname, '..', '..');
const OUT = path.join(__dirname, '..', 'preview', 'data', 'rules.json');
const SRC = {
  sanity: 'js/ai/sanity.js',
  traits: 'js/ai/traits.js',
  ai: 'js/t2/ai.js',
  decision: 'js/t2/decision.js',
  game: 'js/game.js',
  lines: 'js/data/lines.js',
};
/* 源文件指纹：先按 UTF-8 读文本、把 CRLF 归一成 LF 再算 —— 换行不是内容。
   否则同一个文件在「Windows 工作区（CRLF）」与「git 检出的 LF」会算出两个 SHA，
   门禁就会因为换行符在克隆后必挂（2026-11-09 实踩：HEAD 的 js/game.js 是 LF 存储、
   工作区是 CRLF，rules.json 里的指纹永远对不上）。 */
const sha = (p) => crypto.createHash('sha1')
  .update(fs.readFileSync(p, 'utf8').replace(/\r\n/g, '\n')).digest('hex').slice(0, 12);
const shaText = (s) => crypto.createHash('sha1').update(s).digest('hex').slice(0, 12);

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), 'utf8');
}

/* 从源码里按具名模式抠一个 JS 对象/值字面量，绝不手抄第二份。 */
function grabObject(src, name, label) {
  const at = src.indexOf('const ' + name + '=');
  const start = at >= 0 ? at : src.indexOf('const ' + name + ' =');
  if (start < 0) throw new Error('真源漂移：找不到 ' + label + ' (' + name + ')');
  const brace = src.indexOf('{', start);
  if (brace < 0) throw new Error('真源漂移：' + label + ' 不是对象字面量');
  let depth = 0, end = -1;
  for (let i = brace; i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}') { depth--; if (depth === 0) { end = i + 1; break; } }
  }
  if (end < 0) throw new Error('真源漂移：' + label + ' 花括号不配对');
  try {
    return new Function('return ' + src.slice(brace, end) + ';')();
  } catch (e) {
    throw new Error('真源漂移：' + label + ' 无法求值 —— ' + e.message);
  }
}

function grabNumber(src, re, label) {
  const m = src.match(re);
  if (!m) throw new Error('真源漂移：找不到 ' + label);
  return parseFloat(m[1]);
}

/* 纯函数 → { sha, nums }。toString() 拿到的是模块闭包里的真实源码。 */
function fingerprint(fn) {
  const body = Function.prototype.toString.call(fn);
  const nums = [];
  for (const m of body.matchAll(/(?<![A-Za-z_$])\d+(?:\.\d+)?/g)) nums.push(Number(m[0]));
  return { sha: shaText(body), nums };
}

/* 递归把"值里的函数"替换成指纹，避免 JSON.stringify 静默丢掉推理系数。 */
function sanitize(v, prefix) {
  if (typeof v === 'function') return { __fn: true, ...fingerprint(v) };
  if (Array.isArray(v)) return v.map((x, i) => sanitize(x, prefix + '[' + i + ']'));
  if (v && typeof v === 'object') {
    const out = {};
    for (const k of Object.keys(v)) out[k] = sanitize(v[k], prefix + '.' + k);
    return out;
  }
  return v;
}

function buildRules() {
  const texts = {};
  for (const [k, rel] of Object.entries(SRC)) texts[k] = read(rel);

  /* eval 顺序：sanity → traits → lines → ai → decision（后者依赖前者） */
  const win = { SKV3: { _t: { G: () => null } } };
  for (const rel of [SRC.sanity, SRC.traits, SRC.lines, SRC.ai, SRC.decision]) {
    new Function('window', 'globalThis', read(rel))(win, win);
  }
  const need = (v, label) => {
    if (!v) throw new Error('真源漂移：模块未导出 ' + label);
    return v;
  };
  const S = need(win.SKSanity, 'SKSanity');
  const T = need(win.SKTrait, 'SKTrait');
  const AI = need(win.SKT2AI, 'SKT2AI');
  const D = need(win.SKT2Decision, 'SKT2Decision');

  /* SKTeam：团队量化表（js/ai/traits.js:126）。alienPlan 的效用表要读
     BREAKER_VALUE / SABOTAGE_VALUE / BOT_SEC_VALUE / BOT_MED_VALUE，
     2026-11-12 之前漏导出，导致 3D 只能靠 if 顺序硬排。纯数值表，无函数。 */
  const TM = need(win.SKTeam, 'SKTeam');
  const modules = { SKSanity: S, SKTrait: T, SKT2AI: AI, SKT2Decision: D, SKTeam: TM };
  const tables = {};
  const functions = {};
  const fn_fingerprints = {};
  const fn_count = {};

  for (const [name, obj] of Object.entries(modules)) {
    tables[name] = {};
    functions[name] = [];
    fn_count[name] = 0;
    for (const key of Object.keys(obj)) {
      const v = obj[key];
      if (typeof v === 'function') {
        functions[name].push(key);
        fn_count[name]++;
        fn_fingerprints[name + '.' + key] = fingerprint(v);
      } else {
        tables[name][key] = sanitize(v, name + '.' + key);
      }
    }
  }

  /* 未导出但参与推理/发言的模块内常量，按具名模式从源码抠 */
  const constants = {
    MEM_MAX: grabNumber(texts.ai, /const MEM_MAX\s*=\s*([\d.]+)/, 'SKT2AI.MEM_MAX'),
    SEEN_WORD: grabObject(texts.ai, 'SEEN_WORD', 'SKT2AI.SEEN_WORD'),
    EV_W: grabObject(texts.game, 'EV_W', 'game.js EV_W'),
    ID_EVIDENCE: grabObject(texts.game, 'ID_EVIDENCE', 'game.js ID_EVIDENCE'),
    IDENTITY: grabObject(texts.game, 'IDENTITY', 'game.js IDENTITY'),
    MEET_SCHED_note: 'MEET_SCHED 是运行时定时器状态（decision.js:163），不是规则，不导出值',
  };

  /* 发言调度 / 台词去重系数：3D speech.gd 原本是 pickLine / startChatter 的逐行移植，
     但把数值写死在 GDScript 里。这里按具名模式从 2.5D 源码抠出来，让两边同源。 */
  const g = texts.game, d = texts.decision;
  const dispatch = {
    comboChance: grabNumber(g, /Math\.random\(\)<([\d.]+)\)pool=combo/, 'pickLine comboChance'),
    lineDecayK: grabNumber(g, /1\/\(1\+([\d.]+)\*n\)/, 'pickLine 整局降权 K'),
    linePickTries: grabNumber(g, /tries<([\d.]+);tries\+\+\)/, 'pickLine 重挑次数'),
    talkScore: {
      known: grabNumber(g, /Object\.keys\(a\.mind\.known\)\.length\)s\+=([\d.]+)/, 'talkScore known'),
      almost: grabNumber(g, /almost\.foe\|\|\{\}\)\.length\)s\+=([\d.]+)/, 'talkScore almost'),
      retract: grabNumber(g, /_retract!=null\)s\+=([\d.]+)/, 'talkScore retract'),
      accuse: grabNumber(g, /accuse!=null\)s\+=([\d.]+)/, 'talkScore accuse'),
      why: grabNumber(g, /why\*([\d.]+)\)/, 'talkScore why'),
      talkN: grabNumber(g, /s\+=([\d.]+)\*Math\.min\(1,\(a\.talkN/, 'talkScore talkN'),
      talkScoreN: S.MIND.talkScoreN,
      alienBias: S.SPEECH.alienBias,
    },
    streakCap: grabNumber(d, /m\.streak>([\d.]+)\)\{/, 'sayStreakOK 连说上限'),
    avoidSec: grabNumber(g, /_avoid\[tgt\.i\]=evNow\(\)\+([\d.]+)/, '出刀被拦后避开目标秒数'),
    discussMin: grabNumber(g, /const D=Math\.max\(([\d.]+),m\.discuss/, 'startChatter 讨论下限'),
    discussDefault: grabNumber(g, /m\.discuss\|\|([\d.]+)\)/, 'startChatter 讨论缺省'),
    endPad: S.MEET.endPad,
    minPlan: S.MEET.minPlan,
    agendaStart: 0.4,  /* 3D 侧排期起点；2.5D 用 endAt 均分，语义等价 */
    minHumanSpeakers: S.SPEECH.minHumanSpeakers,
    alienLineCap: S.SPEECH.alienLineCap,
  };

  const sources = {};
  for (const [k, rel] of Object.entries(SRC)) sources[rel] = sha(path.join(ROOT, rel));

  return {
    schema_version: 1,
    note: '2.5D / 3D 推理与发言的唯一规则真源快照。勿手改；改 js/ 后重跑 npm run 3d:export:rules，check-parity 会拦截漂移。玩家输入映射、地形/A*/碰撞/LOS、美术允许各自实现。',
    sources,
    tables,
    functions,
    fn_fingerprints,
    constants,
    dispatch,
    stats: {
      modules: Object.keys(modules).length,
      table_keys: Object.values(tables).reduce((n, t) => n + Object.keys(t).length, 0),
      functions: Object.values(fn_count).reduce((a, b) => a + b, 0),
      fn_count,
    },
  };
}

if (require.main === module) {
  const out = buildRules();
  fs.writeFileSync(OUT, JSON.stringify(out, null, 2) + '\n', 'utf8');
  const kb = (fs.statSync(OUT).size / 1024).toFixed(1);
  console.log(`rules.json 已生成：${kb} KB · 模块 ${out.stats.modules} / 表 ${out.stats.table_keys} 键 / 函数 ${out.stats.functions} 个`);
  console.log('  函数分布：' + Object.entries(out.stats.fn_count).map(([k, v]) => `${k} ${v}`).join(' / '));
  console.log('  常量：MEM_MAX=' + out.constants.MEM_MAX + ' · EV_W ' + Object.keys(out.constants.EV_W).length +
    ' 项 · ID_EVIDENCE ' + Object.keys(out.constants.ID_EVIDENCE).length + ' 项');
  console.log('  发言调度：combo=' + out.dispatch.comboChance + ' · 降权K=' + out.dispatch.lineDecayK +
    ' · 重挑=' + out.dispatch.linePickTries + ' · talkScore ' + Object.keys(out.dispatch.talkScore).length + ' 项');
}

module.exports = { buildRules, SRC, ROOT };
