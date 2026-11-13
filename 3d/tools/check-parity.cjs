/* 2.5D ↔ 3D 推理 / 发言「同源」校验器。
 *
 * 用户口径（2026-11-08）：两套只允许维度、美术、玩家输入映射三处差异，
 * AI 推理、发言、判定规则必须同源。本校验器卡四件事：
 *
 *   ① 真源漂移：重新 eval 2.5D 四个模块，与 data/rules.json 逐项比对
 *      （表 / 函数清单 / 函数源码指纹 / 常量 / 发言调度系数 / 源文件 SHA）。
 *      改了 js/ 没重跑 3d:export:rules → 直接 FAIL。
 *   ② 双份规则表：lines.json#rules 是语料附带快照，必须与 rules.json 的
 *      SKSanity 表逐项一致，不许出现第二套数值。
 *   ③ 函数对账：3d/spec/mapping-ledger.json 必须覆盖 rules.json 的每个纯函数，
 *      状态只能是 ported / auto / adapter / pending（纯函数不许 not-applicable）。
 *   ④ 3D 硬编码：扫描推理/发言 GDScript 里的数字字面量，凡是不在
 *      「rules.json 数值集合 + 结构性白名单」里的，列为可疑自造阈值。
 *
 * 用法：npm run 3d:parity:check
 */
const fs = require('fs');
const path = require('path');
const assert = require('assert');
const { buildRules } = require('./export-rules.cjs');

const ROOT = path.resolve(__dirname, '..', '..');
const RULES = path.join(ROOT, '3d', 'preview', 'data', 'rules.json');
const LINES = path.join(ROOT, '3d', 'preview', 'data', 'lines.json');
const LEDGER = path.join(ROOT, '3d', 'spec', 'mapping-ledger.json');
const MODULE_FILE = {
  SKSanity: 'js/ai/sanity.js',
  SKTrait: 'js/ai/traits.js',
  SKTeam: 'js/ai/traits.js',
  SKT2AI: 'js/t2/ai.js',
  SKT2Decision: 'js/t2/decision.js',
};
const PURE_OK = ['ported', 'auto', 'adapter', 'pending'];
const GD_FILES = [
  '3d/preview/scripts/sim/mind.gd',
  '3d/preview/scripts/sim/speech.gd',
  '3d/preview/scripts/sim/ai_alien.gd',
  '3d/preview/scripts/sim/ai_human.gd',
  '3d/preview/scripts/sim/rules_data.gd',
];

const errors = [];
const warns = [];
const eq = (a, b, label) => {
  try { assert.deepStrictEqual(a, b); }
  catch (_) { errors.push(label + ' 与 2.5D 真源不一致（改了 js/ 没重跑 3d:export:rules？）'); }
};

/* ---------- ① 真源漂移 ---------- */
let live;
try {
  live = buildRules();
} catch (e) {
  console.error('PARITY FAIL 真源导出失败：' + e.message);
  process.exit(1);
}
const saved = JSON.parse(fs.readFileSync(RULES, 'utf8'));
eq(saved.sources, live.sources, 'sources（源文件 SHA）');
eq(saved.tables, live.tables, 'tables（SKSanity / SKTrait / SKT2Decision 数据表）');
eq(saved.functions, live.functions, 'functions（纯函数清单）');
eq(saved.fn_fingerprints, live.fn_fingerprints, 'fn_fingerprints（函数源码 SHA + 数值字面量）');
eq(saved.constants, live.constants, 'constants（MEM_MAX / EV_W / ID_EVIDENCE / SEEN_WORD）');
eq(saved.dispatch, live.dispatch, 'dispatch（pickLine / startChatter / sayStreakOK 系数）');

/* ---------- ② 双份规则表 ---------- */
const lines = JSON.parse(fs.readFileSync(LINES, 'utf8'));
const sk = saved.tables.SKSanity || {};
let cross = 0;
for (const [sec, tbl] of Object.entries(lines.rules || {})) {
  if (!sk[sec]) { errors.push('lines.json#rules.' + sec + ' 在 rules.json 里没有对应表'); continue; }
  eq(tbl, sk[sec], 'lines.json#rules.' + sec);
  cross++;
}

/* ---------- ③ 函数对账覆盖（唯一真源：mapping-ledger.json） ---------- */
const ledger = JSON.parse(fs.readFileSync(LEDGER, 'utf8'));
const entryBySrc = new Map();
for (const e of ledger.entries || []) if (!entryBySrc.has(e.src)) entryBySrc.set(e.src, e);

const allFns = [];
const stat = { synced: 0, adapter: 0, pending: 0 };
for (const [mod, fns] of Object.entries(saved.functions)) {
  const file = MODULE_FILE[mod];
  for (const fn of fns) {
    allFns.push(mod + '.' + fn);
    const e = file ? entryBySrc.get(file + ':' + fn) : null;
    if (!e) {
      errors.push('账本缺条目：' + mod + '.' + fn + '（先跑 npm run map:build 再补判决）');
      continue;
    }
    if (!PURE_OK.includes(e.status)) {
      errors.push('账本状态非法（纯函数必须可实现）：' + mod + '.' + fn + ' = ' + e.status);
      continue;
    }
    if (!e.target && !e.note) errors.push('账本缺 target/note：' + mod + '.' + fn);
    if (e.status === 'adapter') stat.adapter++;
    else if (e.status === 'pending') stat.pending++;
    else stat.synced++;
  }
}

/* ---------- ④ 3D 硬编码扫描 ---------- */
// 收集 rules.json 里出现过的所有数值（表 / 指纹 / 常量 / dispatch），作为允许集合。
const allowed = new Set([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10,
  0.01, 0.001, 1e9, 999, 0.5, -1]);
const collect = (v) => {
  if (typeof v === 'number') allowed.add(v);
  else if (Array.isArray(v)) v.forEach(collect);
  else if (v && typeof v === 'object') Object.values(v).forEach(collect);
};
collect(saved.tables);
collect(saved.fn_fingerprints);
collect(saved.constants);
collect(saved.dispatch);

/* 已核对的 2.5D 源码字面量：3D 只是照抄，**不导出到 rules.json**（导出会造第二份定义）。
   每项都带 js 源文件:行号，扫描时**回读该行验证数字确实存在**；上游改行后这里会直接 FAIL，
   不会静默地把一个新阈值当成“已核对”。新增 3D 数字必须先在 js/ 找到出处再登记。 */
const SOURCE_LITERALS = {
  0.01: ['js/game.js', 7158],   // identityAxis 下界
  0.99: ['js/game.js', 7158],   // identityAxis 上界
  1.10: ['js/game.js', 1707],   // 传闻抖动上限
  0.94: ['js/game.js', 1707],   // 传闻抖动基线
  0.24: ['js/game.js', 5991],   // contradiction_lie 权重
  0.26: ['js/game.js', 6000],   // heard_frame 权重
  5.4: ['js/game.js', 2582],    // 尸体发现半径
  5.8: ['js/game.js', 2558],    // 远程拉铃半径
  1.8: ['js/game.js', 1018],    // 医疗无人机/拾取近身半径
  7.5: ['js/game.js', 2853],    // 人类 AI 找濒死者（有医疗包）
  8.5: ['js/game.js', 2903],    // 人类 AI 找濒死者（拖去医疗间）
  1.9: ['js/game.js', 2905],    // 拖尸/施救近身判定
  2.8: ['js/game.js', 3039],    // AI 开始做任务的到达判据（aiHuman）
  3.2: ['js/game.js', 3132],    // findHideBody 藏尸搜索半径
  6.5: ['js/game.js', 4143],    // 藏尸前"有人在看"的观众半径
};

const suspicious = [];
for (const rel of GD_FILES) {
  const src = fs.readFileSync(path.join(ROOT, rel), 'utf8').split('\n');
  src.forEach((line, idx) => {
    const code = line.replace(/\t*#.*$/, '');   // 去掉行尾注释
    if (code.trim().startsWith('#')) return;   // 整行注释
    for (const m of code.matchAll(/(?<![A-Za-z_$\d])\d+\.\d+/g)) {
      const num = Number(m[0]);
      if (allowed.has(num)) continue;
      if (SOURCE_LITERALS[num]) {
        const [srel, ln] = SOURCE_LITERALS[num];
        const sline = fs.readFileSync(path.join(ROOT, srel), 'utf8').split('\n')[ln - 1] || '';
        if (sline.includes(String(num))) continue;
        errors.push('源字面量引用失配：' + num + ' 不在 ' + srel + ':' + ln +
          '（2.5D 源码改行后必须重新登记）');
        continue;
      }
      // fallback 参数（rule(..., 0.5)）允许：真源存在时不会用到，且值必须等于真源
      if (/fallback|,\s*\d+\.\d+\s*\)/.test(code) && /rule\(|_r\(|_d\(|n\(|disp/.test(code)) continue;
      suspicious.push(rel + ':' + (idx + 1) + ' → ' + num + '  ' + code.trim().slice(0, 76));
    }
  });
}
if (suspicious.length) {
  warns.push('3D 推理/发言脚本里还有 ' + suspicious.length + ' 个非真源小数（列出前 12 条，需确认是结构性常数还是自造阈值）：');
  suspicious.slice(0, 12).forEach((s) => warns.push('  ' + s));
}

/* ---------- 输出 ---------- */
console.log('PARITY ' + (errors.length ? 'FAIL' : 'OK'));
console.log('  真源：' + Object.keys(saved.sources).length + ' 个 js 文件 / ' +
  saved.stats.table_keys + ' 张表 / ' + saved.stats.functions + ' 个纯函数指纹');
console.log('  交叉校验：lines.json#rules ' + cross + ' 张表与 rules.json 一致');
console.log('  对账：' + allFns.length + ' 个函数 · synced ' + stat.synced +
  ' / adapter ' + stat.adapter + ' / pending ' + stat.pending);
console.log('  发言调度：combo ' + saved.dispatch.comboChance + ' / 降权K ' +
  saved.dispatch.lineDecayK + ' / 连说上限 ' + saved.dispatch.streakCap);
for (const w of warns) console.log('  WARN ' + w);
for (const e of errors) console.log('  FAIL ' + e);
if (errors.length) process.exit(1);
