/* 事件词表校验：node 3d/tools/check-events.cjs
 * ------------------------------------------------------------------
 * 目的：在 B2 动工前冻结事件信封与 kind 词表，避免“JS 有一个事件、GDScript 没有”
 * 这种只能在同 seed diff 时才发现的问题。
 *
 * 检查：
 *   ① schema 是合法 JSON，kind.enum 存在且无重复；
 *   ② js/game.js 里所有 logEvent('...') 的 kind 都在 enum 里；
 *   ③ 3D 侧所有产生事件的脚本里 _log("...") 的 kind 都在 enum 里
 *      （B4 起事件不再只由 sim_state.gd 产生：bots.gd 出 detain、main.gd 出 pipe、
      S 轨 speech.gd 出 chat）；
 *   ④ sim_state.gd 的信封里有 pt / t 两个字段（2.5D 的 t 是剩余秒，不是已过秒）。
 *
 * 只读；失败退出码 1。
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const SCHEMA = path.join(__dirname, '..', 'spec', 'events.schema.json');
const JS = path.join(ROOT, 'js', 'game.js');
const GD = path.join(__dirname, '..', 'preview', 'scripts', 'sim', 'sim_state.gd');
const GD_FILES = [
  GD,
  path.join(__dirname, '..', 'preview', 'scripts', 'sim', 'bots.gd'),
  path.join(__dirname, '..', 'preview', 'scripts', 'sim', 'speech.gd'),
  path.join(__dirname, '..', 'preview', 'scripts', 'main.gd'),
];

const errors = [];
const warnings = [];

const schema = JSON.parse(fs.readFileSync(SCHEMA, 'utf8'));
const enumKinds = schema?.properties?.kind?.enum;
if (!Array.isArray(enumKinds) || enumKinds.length === 0) {
  console.error('EVENTS FAIL schema 缺 properties.kind.enum');
  process.exit(1);
}
const kindSet = new Set(enumKinds);
if (kindSet.size !== enumKinds.length) errors.push('schema kind.enum 有重复项');

const jsSrc = fs.readFileSync(JS, 'utf8');
const jsKinds = new Set();
for (const m of jsSrc.matchAll(/logEvent\(\s*'([a-zA-Z_]+)'/g)) jsKinds.add(m[1]);

const gdSrc = fs.readFileSync(GD, 'utf8');
const gdKinds = new Set();
for (const f of GD_FILES) {
  const src = fs.readFileSync(f, 'utf8');
  for (const m of src.matchAll(/_log\(\s*"([a-zA-Z_]+)"/g)) gdKinds.add(m[1]);
}

for (const k of jsKinds) if (!kindSet.has(k)) errors.push(`js/game.js 的 logEvent('${k}') 不在 schema enum 里`);
for (const k of gdKinds) if (!kindSet.has(k)) errors.push(`3D 的 _log("${k}") 不在 schema enum 里（见 bots.gd / main.gd / sim_state.gd）`);

/* 信封：3D 必须同时有 pt（已过秒）与 t（剩余秒），否则同 seed diff 无法对齐。 */
if (!/"pt"/.test(gdSrc)) errors.push('sim_state.gd 的事件信封缺 "pt"（已过秒）');
if (!/"t"/.test(gdSrc)) errors.push('sim_state.gd 的事件信封缺 "t"（本夜剩余秒）');

/* 只在 2.5D 出现、3D 还没用到的 kind 是正常的，列出来供批次安排。 */
const gdMissing = [...jsKinds].filter(k => !gdKinds.has(k)).sort();
const schemaUnused = enumKinds.filter(k => !jsKinds.has(k) && !gdKinds.has(k)).sort();
if (schemaUnused.length) warnings.push(`schema 里未被任何一端使用的 kind：${schemaUnused.join(', ')}`);

console.log('EVENTS ' + (errors.length ? 'FAIL' : 'OK'));
console.log(`  schema kind ${enumKinds.length} / 2.5D ${jsKinds.size} / 3D ${gdKinds.size}`);
if (gdMissing.length) console.log(`  3D 尚未产生（按批次安排）：${gdMissing.join(', ')}`);
for (const w of warnings) console.log('  WARN ' + w);
for (const e of errors) console.log('  ERR  ' + e);

if (errors.length) process.exit(1);
console.log('  信封：kind / night / pt / t / actor / victim / room / x / y（+ 业务字段）');
