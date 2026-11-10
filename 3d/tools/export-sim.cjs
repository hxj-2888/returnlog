/* 3D 模拟数据导出（无发言版）：2.5D 真源 → 3d/preview/data/sim.json
 * ------------------------------------------------------------------
 * 用法：node 3d/tools/export-sim.cjs
 *
 * 口径（2026-11-08 用户两次裁定）：
 *   上午：「迁移除发言系统与美术之外的全部系统」→ 本文件只导出非发言规则读数。
 *   下午：「S 轨发言，除了美术全部完成」→ 发言表改由 **3d/tools/export-lines.cjs**
 *   单独导出到 data/lines.json（62 类台词 + 21 张 SPEECH/TESTIFY/RELIA/MIND/ATTN 等规则表）。
 *   本文件继续只管"一局怎么开始、多少分算赢、天亮怎么推进"，不重复导发言表，
 *   3D 端也不得在 GDScript 里另抄一份台词或规则数值。
 *
 * 为什么要这个文件：
 *   3D 端已经用 space.json 管门/视野/站桩/电闸/管道，但「一局怎么开始、
 *   每人几个任务、任务值几分、多少分算赢、天亮怎么推进」还散在
 *   js/game.js 的 newGame / checkWin / dawn 里。这些数一旦在 GDScript
 *   里手写，就会重演 COVER_HEIGHT 事故（表与真源对不上）。
 *
 * fail-loud：任何一张表取不到、名单不是 15、任务点不是 26、任务点标签
 * 在 minigames.json 里对不上，都直接退出码 1，不做静默兜底。
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = path.resolve(__dirname, '..', '..');
const OUT = path.join(__dirname, '..', 'preview', 'data', 'sim.json');
const MAP = path.join(__dirname, '..', 'preview', 'data', 'map_v2.json');
const MG = path.join(__dirname, '..', 'preview', 'data', 'minigames.json');

function sha1(p) {
  return crypto.createHash('sha1').update(fs.readFileSync(p)).digest('hex').slice(0, 12);
}
function evalModule(rel) {
  const win = {};
  new Function('window', fs.readFileSync(path.join(ROOT, rel), 'utf8'))(win);
  return win;
}
function loadJson(p) {
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}
function need(obj, key, label) {
  if (obj == null || obj[key] == null) throw new Error('真源缺字段：' + label + '.' + key);
  return obj[key];
}
/** 只挑存在的表，缺表直接报错；避免“悄悄少导一张表”导致 3D 端拿默认值跑。 */
function pickTables(src, keys, label) {
  const out = {};
  for (const k of keys) out[k] = need(src, k, label);
  return out;
}

const sanityPath = 'js/ai/sanity.js';
const spacePath = 'js/t2/space.js';
const namesPath = 'js/data/names.js';

const SKSanity = evalModule(sanityPath).SKSanity;
const SKT2Space = evalModule(spacePath).SKT2Space;
const SKNames = evalModule(namesPath).SKNames;
if (!SKSanity) throw new Error('SKSanity 加载失败：' + sanityPath);
if (!SKT2Space) throw new Error('SKT2Space 加载失败：' + spacePath);
if (!SKNames) throw new Error('SKNames 加载失败：' + namesPath);

const map = loadJson(MAP);
const mg = loadJson(MG);
if (!Array.isArray(map.points)) throw new Error('map_v2.json 缺 points');
if (!Array.isArray(map.rooms)) throw new Error('map_v2.json 缺 rooms');
if (!mg.tasks || typeof mg.tasks !== 'object') throw new Error('minigames.json 缺 tasks');

const names = Array.isArray(SKNames.DEFAULT) ? SKNames.DEFAULT.slice() : [];
if (names.length !== 15) throw new Error('SKNames.DEFAULT 不是 15 项：' + names.length);
if (new Set(names).size !== names.length) throw new Error('SKNames.DEFAULT 有重名');

const points = map.points;
if (points.length !== 26) throw new Error('任务点不是 26 个：' + points.length);
for (const p of points) {
  if (!p.label || !p.room) throw new Error('任务点缺 label/room：' + JSON.stringify(p));
  if (!(p.dur > 0)) throw new Error('任务点 dur 非法：' + p.label + ' dur=' + p.dur);
  if (p.kind !== 'hard' && p.kind !== 'normal') {
    throw new Error('任务点 kind 非法：' + p.label + ' kind=' + p.kind);
  }
  if (!mg.tasks[p.label]) throw new Error('minigames.json 找不到任务：' + p.label);
}
const labels = points.map(p => p.label);
if (new Set(labels).size !== labels.length) throw new Error('任务点 label 有重复，无法按标签回查');

/* 非发言规则表。表名必须与 sanity.js 完全一致，改真源后这里同步增删。 */
const TABLES = [
  'WIN', 'NIGHT', 'MEET', 'STAND', 'REACH', 'PIPE', 'SIGHT', 'BREAKER',
  'SABOTAGE', 'KNIFE', 'RED_BODY', 'RUSH', 'HUNT', 'SHOT', 'VOTE',
  'ALMOST', 'CONFIRM', 'CARRY', 'HUMANISH', 'AVOID', 'TERMINATOR',
];
const rules = pickTables(SKSanity, TABLES, 'SKSanity');

/* 任务分值不在这里硬写 2/1：调 2.5D 的 ghostTaskPts 读真值。 */
const ptsByKind = {
  hard: SKT2Space.ghostTaskPts({ kind: 'hard' }),
  normal: SKT2Space.ghostTaskPts({ kind: 'normal' }),
};
if (ptsByKind.hard !== 2 || ptsByKind.normal !== 1) {
  throw new Error('任务分值与 3D 端口径不符（hard/normal）：' + JSON.stringify(ptsByKind));
}

const out = {
  schema_version: 1,
  generated_at: new Date().toISOString(),
  note: '本文件由 3d/tools/export-sim.cjs 生成，勿手改。只含"一局怎么开始、多少分算赢、天亮怎么推进"的非发言规则；台词另见 data/lines.json（S 轨，2026-11-08 已接）。',
  sources: {
    [sanityPath]: sha1(path.join(ROOT, sanityPath)),
    [spacePath]: sha1(path.join(ROOT, spacePath)),
    [namesPath]: sha1(path.join(ROOT, namesPath)),
    '3d/preview/data/map_v2.json': sha1(MAP),
    '3d/preview/data/minigames.json': sha1(MG),
  },
  roles: {
    agents: names.length,          // 15
    aliens: 4,
    tasks_per_agent: 4,
    hard_per_agent: 1,
    normal_per_agent: 3,
  },
  win: {
    pts: SKSanity.WIN.pts,
    fault_penalty: SKSanity.WIN.faultPenalty,
    task_pts: ptsByKind,
    ghost_task_cap: SKT2Space.ghostTaskCap(),
  },
  night: { len: SKSanity.NIGHT.len },
  rules,
  names,
  points: {
    count: points.length,
    rooms: points.map(p => p.room),
    /** 任务点 → 玩法/元素数仍走 minigames.json，这里只留一个完整性读数。 */
    labels,
  },
  /* 发言系统明确不导出：列出名单，便于审计“3D 里有没有偷偷抄回来”。 */
  excluded: {
    reason: '2026-11-08 用户裁定：发言系统与美术不迁',
    speech_tables: ['SPEECH', 'TESTIFY', 'RELIA', 'MIND', 'DESC', 'FRAME', 'WARM', 'LEADER', 'ALIBI', 'MISLEAD', 'SOCIAL', 'COFRAME', 'ACCOUNT'],
    speech_files: ['js/data/lines.js', 'js/ui/templates.js#会议模板'],
  },
};

fs.writeFileSync(OUT, JSON.stringify(out, null, 2) + '\n', 'utf8');

console.log('SIM OK -> ' + path.relative(ROOT, OUT));
console.log('  角色 %d（异形 %d）/ 任务点 %d / 夜 %ds / 胜利 %d 分',
  out.roles.agents, out.roles.aliens, out.points.count, out.night.len, out.win.pts);
console.log('  非发言规则表 %d 张：%s', TABLES.length, TABLES.join(','));
console.log('  已排除发言表 %d 张：%s', out.excluded.speech_tables.length,
  out.excluded.speech_tables.join(','));
