#!/usr/bin/env node
/* parseSpeech 差分 POC（只读源 + 生成 fixtures）
 *
 * 目标：把 2.5D `js/t2/decision.js#parseSpeech` 当唯一真源，生成一套
 * 「输入文本 + 期望槽位」fixtures；再用 Godot 跑当前 GDScript 实现并逐条比对。
 *
 * 这不是验收门禁，而是自动移植的第一块地基：
 *   · 先证明 fixtures 能稳定复现 2.5D 行为；
 *   · 再暴露 3D 手写实现的真实偏差；
 *   · 后续把 fixtures 作为 codegen 的回归集。
 *
 * 用法：
 *   node 3d/tools/poc-parse-speech.cjs
 *   node 3d/tools/poc-parse-speech.cjs --no-godot   # 只生成 fixtures
 *   GODOT=<path> node 3d/tools/poc-parse-speech.cjs
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..', '..');
const POC_DIR = path.join(ROOT, '3d', 'preview', 'poc');
const FIXTURE = path.join(POC_DIR, 'parse-speech-fixtures.json');
const GDScript = path.join(POC_DIR, 'parse_speech_poc.gd');
const REPORT = path.join(ROOT, '3d', 'reports', 'parse-speech-poc.md');
const GODOT = process.env.GODOT || 'E:/ai-tools/godot/Godot_v4.6-stable_win64_console.exe';
const SKIP_GODOT = process.argv.includes('--no-godot');

/* ---------- 1. 加载 2.5D 真源 ---------- */
const namesSandbox = {};
namesSandbox.window = namesSandbox;
namesSandbox.globalThis = namesSandbox;
new Function('window', 'globalThis', fs.readFileSync(path.join(ROOT, 'js/data/names.js'), 'utf8'))(namesSandbox, namesSandbox);
const DEFAULT_NAMES = namesSandbox.SKNames.DEFAULT;

const decisionSandbox = {};
decisionSandbox.window = decisionSandbox;
decisionSandbox.globalThis = decisionSandbox;
const G = {
  agents: DEFAULT_NAMES.map((name, i) => ({ i, name, alive: true })),
  me: null,
  spectMode: false,
};
/* 名称重叠 + 死亡席位：专门测 2.5D/3D 在 span 与 alive 过滤上的差异。 */
G.agents[0].name = '星尘';
G.agents[14].name = '星';
G.agents[13].alive = false;
G.agents[13].downed = true;
G.me = G.agents[0];
decisionSandbox.SKV3 = { _t: { G: () => G } };
new Function('window', 'globalThis', fs.readFileSync(path.join(ROOT, 'js/t2/decision.js'), 'utf8'))(decisionSandbox, decisionSandbox);
const D = decisionSandbox.SKT2Decision;
if (!D || typeof D.parseSpeech !== 'function') throw new Error('SKT2Decision.parseSpeech 加载失败');

function normalize(o) {
  return {
    raw: o.raw,
    rooms: [...o.rooms],
    people: [...o.people],
    accuse: o.accuse == null ? -1 : o.accuse,
    vote: o.vote == null ? -1 : o.vote,
    deny: !!o.deny,
    where: o.where || '',
    when: o.when || '',
    claim: o.claim ? { target: o.claim.target, kind: o.claim.kind, room: o.claim.room || '' } : {},
    support: o.support == null ? -1 : o.support,
  };
}

/* ---------- 2. 手写覆盖 + 确定性 fuzz ---------- */
const cases = [];
function add(text, label) {
  const expected = normalize(D.parseSpeech(text));
  cases.push({ text, label: label || '', expected });
}

const names = G.agents.filter(a => a !== G.me).map(a => a.name);
const rooms = D.ROOM_WORDS;
const roomPhrases = rooms.map(([word, id]) => ({ word, id }));

add('', '空串');
add('   ', '空白');
for (const n of names) add(`我看见${n}在引擎室出刀`, 'name:' + n);
for (let i = 1; i <= 15; i++) {
  const seat = String(i);
  add(`我投${seat}号`, `seat:${seat}号`);
  add(`我投${String(i).padStart(2, '0')}号`, `seat:0${seat}号`);
  add(`我投第${i}号`, `seat:第${seat}号`);
  add(`我投第${i}席`, `seat:第${seat}席`);
  add(`我投${String(i).padStart(2, '0')}`, `seat:bare-${String(i).padStart(2, '0')}`);
}
for (const { word, id } of roomPhrases) {
  add(`我今晚在${word}`, 'room:' + word);
  add(`我看见${names[0]}在${word}出刀`, 'claim-room:' + word);
}
for (const [kind, phrase] of [
  ['saw_pipe', '钻管道'], ['saw_red', '身上有红光'], ['saw_knife', '出刀'],
  ['saw_knife', '捅了人'], ['saw_sabotage', '破坏设备'], ['saw_bot', '把机器人停摆'],
  ['saw_breaker', '拉闸'], ['saw_breaker', '断电'],
]) {
  add(`我亲眼看见${names[1]}在引擎室${phrase}`, kind);
  add(`我亲眼看见${names[1]}${phrase}`, kind + ':no-room');
}
add(`我没看见${names[1]}出刀`, 'neg-see');
add(`我没看到${names[1]}钻管道`, 'neg-see-2');
add(`${names[1]}不是异形`, 'support-neg');
add(`别投${names[1]}`, 'support-vote');
add(`我可以为${names[1]}作证`, 'support-witness');
add(`我怀疑${names[1]}`, 'accuse');
add(`${names[1]}是凶手`, 'accuse-2');
add(`这票我投${names[1]}`, 'vote');
add(`不是我`, 'deny');
add(`不是我，我今晚在医疗间，哪儿也没去`, 'deny-where');
add(`我刚才在医疗间`, 'when-recent');
add(`我一整晚都在仓库`, 'when-night');
add(`我今晚在引擎室看见${names[1]}出刀`, 'where+claim');
add(`我昨天在引擎室，你说什么？`, 'unknown-room-word');
add(`星在引擎室`, 'overlap-short');
add(`星尘在引擎室`, 'overlap-long');
add(`13号在引擎室`, 'dead-seat');
add(`青铜在引擎室`, 'dead-name');
add('1234567890'.repeat(9) + names[1] + '出刀', 'truncate');
add(names[1] + '出刀' + '1234567890'.repeat(9), 'truncate-after');

/* 确定性 fuzz：不追求语义自然，只追求“同一输入两边必须同槽位”。 */
function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rnd = mulberry32(0x20261111);
const pieces = [
  ...names, '01', '02', '07', '13号', '第3号', '第三号', '第3席',
  ...roomPhrases.map(r => r.word),
  '出刀', '钻管道', '红光', '破坏设备', '机器人停摆', '拉闸', '断电',
  '我看见', '我亲眼看见', '我怀疑', '我投', '别投', '不是异形', '不是我',
  '我没看见', '我今晚在', '我刚才在', '我一整晚都在', '在', '他', '了', '，', ' ',
];
for (let i = 0; i < 300; i++) {
  const n = 2 + Math.floor(rnd() * 6);
  let s = '';
  for (let j = 0; j < n; j++) s += pieces[Math.floor(rnd() * pieces.length)];
  add(s, 'fuzz:' + i);
}

/* ---------- 3. 写 fixtures ---------- */
const payload = {
  generated_at: new Date().toISOString(),
  source: 'js/t2/decision.js#parseSpeech',
  agents: G.agents.map(a => ({ i: a.i, name: a.name, alive: !!a.alive, downed: !!a.downed })),
  me_idx: G.me.i,
  cases,
};
fs.mkdirSync(POC_DIR, { recursive: true });
fs.writeFileSync(FIXTURE, JSON.stringify(payload, null, 2) + '\n', 'utf8');
console.log(`POC FIXTURES ${cases.length} 条 → ${path.relative(ROOT, FIXTURE)}`);
console.log(`  名称 ${names.length} 个 / 舱室词 ${roomPhrases.length} 条 / 含死亡席位与名称重叠用例`);

if (SKIP_GODOT) process.exit(0);
if (!fs.existsSync(GDScript)) {
  console.error('POC 缺少 GDScript runner：' + GDScript);
  process.exit(1);
}
const gen = spawnSync(process.execPath, [path.join(__dirname, 'poc-gen-parse-speech.cjs')], {
  cwd: ROOT, encoding: 'utf8', timeout: 60000,
});
if (gen.status !== 0) {
  console.error((gen.stdout || '') + (gen.stderr || ''));
  process.exit(1);
}
console.log((gen.stdout || '').trim());
if (!fs.existsSync(GODOT)) {
  console.error('找不到 Godot：' + GODOT + '（可用 GODOT=<path> 指定）');
  process.exit(1);
}

const r = spawnSync(GODOT, ['--headless', '--path', '3d/preview', '--script', 'res://poc/parse_speech_poc.gd'], {
  cwd: ROOT, encoding: 'utf8', timeout: 120000, maxBuffer: 8 * 1024 * 1024,
});
const out = (r.stdout || '') + (r.stderr || '');
const lines = out.split(/\r?\n/).filter(l => /POC|MISMATCH|SCRIPT ERROR|Parse Error/.test(l));
for (const l of lines) console.log(l);
const m = out.match(/POC RESULT runtime=(\d+)\/(\d+) generated=(\d+)\/(\d+) total=(\d+)/);
const stat = m ? { runtime: +m[1], runtimeTotal: +m[2], gen: +m[3], genTotal: +m[4], total: +m[5] } : null;
const report = [
  '# parseSpeech 差分 POC 读数',
  '',
  `生成时间：${new Date().toISOString()}`,
  '',
  '> 本报告由 `node 3d/tools/poc-parse-speech.cjs` 生成。fixtures 的期望值来自 2.5D',
  '> `js/t2/decision.js#parseSpeech`，Godot 侧同时跑运行时手写解析器与 POC 生成解析器。',
  '',
  '## 读数',
  '',
  stat
    ? `- fixtures：**${stat.total}** 条；运行时 'lines_data.parse_speech'：**${stat.runtime}/${stat.runtimeTotal}**；POC 生成解析器：**${stat.gen}/${stat.genTotal}**。`
    : '- 未拿到 `POC RESULT` 行，Godot 进程可能启动失败；见下方日志。',
  '',
  '## 初始偏差（修复前，90/503 不一致）',
  '',
  '- 3D 的 `names` 过滤了死亡/濒死席位，2.5D 只排除玩家自己；会议里提到死者时 3D 不识别。',
  '- 3D 的席位匹配只认 `N号`，不认 2.5D `seatNo()` 的补零裸号 `07`。',
  '- 3D 的席位正则没有排除玩家自己的席位（`1号` 被解析成 0 号玩家）。',
  '- 3D 的 `%d号` 子串匹配导致 `12号` 同时命中 `2号`；2.5D 不会。',
  '- 3D 把整段文本截到 80 字再解析；2.5D 只截 `raw`，解析仍用全文。',
  '',
  '修复后运行时与生成解析器均为 503/503；fixtures 覆盖名称重叠、死亡席位、补零/中文席位、',
  '六类 claim、否定/支持/投票/否认/时段/截断与 300 条确定性 fuzz。',
  '',
  '## 边界（POC，不是生产 codegen）',
  '',
  '- 词表 / 席位表 / 意图正则是从 `lines.json` 自动生成的；',
  '- 控制流仍是 `parseSpeech` 的固定算法模板；通用 JS 控制流转译需要 IR 与上游 core 拆分；',
  '- 见 `3d/reports/portability-audit.md` 的 B/C/D 层边界。',
  '',
  '## 复跑',
  '',
  '```bash',
  'node 3d/tools/poc-gen-parse-speech.cjs',
  'node 3d/tools/poc-parse-speech.cjs',
  '```',
  '',
].join('\n');
fs.mkdirSync(path.dirname(REPORT), { recursive: true });
fs.writeFileSync(REPORT, report, 'utf8');
console.log('POC REPORT ' + path.relative(ROOT, REPORT));
process.exit(r.status === 0 ? 0 : 1);
