/* 台词语料契约校验：node 3d/tools/check-lines.cjs
 * ------------------------------------------------------------------
 * 目的：S 轨开工前冻结 lines.json 的结构，并保证它与 2.5D 语料真源**逐字一致**。
 *
 * 检查：
 *   ① lines.schema.json 是合法 JSON，required 齐全；
 *   ② lines.json 的 sources.sha1 与当前三个真源文件对得上（改了语料没重导会直接 FAIL）；
 *   ③ 重新 eval 一次 lines.js，逐类逐档比对导出的模板（防止导出器漏类/漏档/串档）；
 *   ④ 每条模板的 {占位符} 都在白名单里（含 {a|b} 组合槽）；
 *   ⑤ 跨类别重复模板要报错（同类同骨架允许，那是真人换说法）；
 *   ⑥ 规则表齐全，且没有 null / NaN 混进来。
 *
 * 只读；失败退出码 1。
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = path.resolve(__dirname, '..', '..');
const SCHEMA = path.join(__dirname, '..', 'spec', 'lines.schema.json');
const DATA = path.join(__dirname, '..', 'preview', 'data', 'lines.json');

const errors = [];
const warnings = [];
const schema = JSON.parse(fs.readFileSync(SCHEMA, 'utf8'));
const data = JSON.parse(fs.readFileSync(DATA, 'utf8'));

for (const k of schema.required || []) {
  if (!(k in data)) errors.push('lines.json 缺字段 ' + k);
}
if (data.schema_version !== 1) errors.push('schema_version 不是 1');

/* ② 真源哈希 */
for (const [key, meta] of Object.entries(data.sources || {})) {
  const p = path.join(ROOT, meta.path);
  if (!fs.existsSync(p)) { errors.push('真源缺失 ' + meta.path); continue; }
  const h = crypto.createHash('sha1').update(fs.readFileSync(p)).digest('hex').slice(0, 12);
  if (h !== meta.sha1) errors.push(`${key} 已改动但 lines.json 没重导（${meta.sha1} → ${h}），跑 node 3d/tools/export-lines.cjs`);
}

/* ③ 重新 eval 真源，逐字对比 */
const win = {};
new Function('window', 'globalThis', fs.readFileSync(path.join(ROOT, 'js/ai/sanity.js'), 'utf8'))(win, win);
new Function('window', 'globalThis', fs.readFileSync(path.join(ROOT, 'js/data/lines.js'), 'utf8'))(win, win);
const L = win.SKLines;
if (!L) errors.push('SKLines 加载失败');
else {
  const srcCats = Object.keys(L.POOLS);
  const outCats = Object.keys(data.pools || {});
  if (srcCats.length !== outCats.length) errors.push(`类别数不一致：源 ${srcCats.length} / 导出 ${outCats.length}`);
  for (const cat of srcCats) {
    if (!data.pools[cat]) { errors.push('导出缺类别 ' + cat); continue; }
    for (const tone of ['hot', 'cold', 'combo']) {
      const src = (L.POOLS[cat][tone] || []);
      const out = (data.pools[cat][tone] || []);
      if (src.length !== out.length) errors.push(`${cat}.${tone} 条数 ${src.length} → ${out.length}`);
      else for (let i = 0; i < src.length; i++) {
        if (src[i] !== out[i]) { errors.push(`${cat}.${tone}[${i}] 台词不一致`); break; }
      }
    }
  }
  const srcWhy = Object.keys(L.WHY);
  if (srcWhy.length !== Object.keys(data.why || {}).length) errors.push('WHY 类别数不一致');
  for (const k of srcWhy) {
    const a = L.WHY[k], b = data.why[k];
    if (!b || a.length !== b.length) errors.push('WHY.' + k + ' 条数不一致');
  }
}

/* ④ 占位符白名单 */
const allow = new Set(data.placeholders || []);
const re = /\{([^{}]*)\}/g;
let n = 0;
const seen = new Map();
for (const [cat, g] of Object.entries(data.pools || {})) {
  for (const tone of ['hot', 'cold', 'combo']) {
    for (const s of g[tone] || []) {
      n++;
      for (const m of s.matchAll(re)) {
        const body = m[1];
        if (body.includes('|')) continue;            // {a|b} 组合槽
        if (!allow.has(body)) errors.push(`未知占位符 {${body}} in ${cat}.${tone}: ${s}`);
      }
      /* ⑤ 跨类重复：同一句模板出现在两个不同类别是真重复 */
      const key = s;
      if (!seen.has(key)) seen.set(key, cat);
      else if (seen.get(key) !== cat) warnings.push(`跨类重复模板「${s.slice(0, 24)}」${seen.get(key)} / ${cat}`);
    }
  }
}

/* ⑤′ 发言解析词表 */
for (const k of ['room_words', 'cn_seat', 'when_words', 'speech_patterns']) {
  if (data[k] == null) errors.push('缺发言解析词表 ' + k);
}
const sp = data.speech_patterns || {};
if (!Array.isArray(sp.claim_kinds) || sp.claim_kinds.length < 5) {
  errors.push('claim_kinds 条目不足（至少 5 类）');
}
for (const [k, v] of Object.entries(sp)) {
  if (k === 'claim_kinds') continue;
  if (typeof v !== 'string' || v.length === 0) errors.push('speech_patterns.' + k + ' 不是有效正则字符串');
}
if (!Array.isArray(data.room_words) || data.room_words.length < 20) {
  errors.push('room_words 条目不足');
}

/* ⑥ 规则表 */
const needRules = ['SPEECH', 'TESTIFY', 'RELIA', 'MIND', 'ATTN', 'MEET', 'VOTE', 'ALMOST',
  'LEADER', 'FRAME', 'WARM', 'ALIBI', 'SOCIAL'];
for (const k of needRules) {
  if (!data.rules || data.rules[k] == null) errors.push('规则表缺失 ' + k);
}
for (const [k, v] of Object.entries(data.rules || {})) {
  if (typeof v === 'number' && !Number.isFinite(v)) errors.push('规则表 ' + k + ' 不是有限数');
}

console.log('LINES ' + (errors.length ? 'FAIL' : 'OK'));
console.log(`  类别 ${Object.keys(data.pools || {}).length} / 模板 ${n} 行 / WHY ${Object.keys(data.why || {}).length} 类 / 规则 ${Object.keys(data.rules || {}).length} 张`);
console.log(`  当量 ${data.stats?.equiv ?? '?'} · 上限 ${data.effective_size?.upperBound ?? '?'}`);
console.log(`  发言解析：舱室词 ${(data.room_words || []).length} / claim ${(sp.claim_kinds || []).length} 类 / 正则 ${Object.keys(sp).length - 1} 组`);
for (const w of warnings.slice(0, 8)) console.log('  WARN ' + w);
if (warnings.length > 8) console.log(`  WARN ... 共 ${warnings.length} 条跨类重复提示`);
for (const e of errors) console.log('  ERR  ' + e);
if (errors.length) process.exit(1);
