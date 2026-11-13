#!/usr/bin/env node
/* 校验「图内要素板」唯一真源 js/data/plates.js
 * -------------------------------------------------------------
 * · 按 plate.schema.json 校验结构（只实现本项目用得到的 draft-07 子集，
 *   不引第三方依赖 —— 项目红线：运行时零依赖，工具也不新增 npm 包）
 * · 再校验语义：crop 在 size 内、断口在 crop 内、线 id 唯一、图片落地
 * · 最后核对 tests/plate/*.plate.json 快照与真源一致（防止两份定义漂移）
 *
 * 用法：node tests/plate/validate.cjs
 * 退出码：0 = 无错误；1 = 有错误
 */
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const util = require('util');

const here = __dirname;
const repo = path.resolve(here, '..', '..');
const source = path.join(repo, 'js', 'data', 'plates.js');
const schema = JSON.parse(fs.readFileSync(path.join(here, 'plate.schema.json'), 'utf8'));

const errors = [];
const notes = [];
function err(where, msg) { errors.push(where + '：' + msg); }

/* ---- 1. 读真源 ---- */
const sandbox = { window: {} };
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(source, 'utf8'), sandbox, { filename: source });
const data = sandbox.window.SKPlates;
if (!data || !data.plates) {
  console.error('[plate:check] 读不到 window.SKPlates.plates');
  process.exit(1);
}

/* ---- 2. draft-07 子集校验器（够用即止，不追求全量实现） ---- */
function resolveRef(ref, root) {
  if (ref.indexOf('#/') !== 0) return null;
  let cur = root;
  for (const seg of ref.slice(2).split('/')) {
    cur = cur ? cur[seg.replace(/~1/g, '/').replace(/~0/g, '~')] : undefined;
  }
  return cur;
}
function validate(v, sch, at, root) {
  if (!sch || typeof sch !== 'object') return;
  if (sch.$ref) {
    const target = resolveRef(sch.$ref, root);
    if (!target) { err(at, '找不到 $ref ' + sch.$ref); return; }
    validate(v, target, at, root);
    return;
  }
  if (sch.type) {
    const t = sch.type;
    const got = Array.isArray(v) ? 'array' : v === null ? 'null' : typeof v;
    const good = t === 'integer'
      ? (got === 'number' && Number.isInteger(v))
      : t === 'number' ? (got === 'number' && Number.isFinite(v)) : got === t;
    if (!good) { err(at, '类型应为 ' + t + '，实为 ' + got); return; }
  }
  if (sch.enum && !sch.enum.includes(v)) err(at, '取值不在 ' + JSON.stringify(sch.enum));
  if (sch.pattern && typeof v === 'string' && !(new RegExp(sch.pattern)).test(v)) {
    err(at, '不匹配 ' + sch.pattern);
  }
  if (sch.minLength != null && typeof v === 'string' && v.length < sch.minLength) {
    err(at, '字符串短于 ' + sch.minLength);
  }
  if (sch.minimum != null && typeof v === 'number' && v < sch.minimum) err(at, '小于下限 ' + sch.minimum);
  if (sch.maximum != null && typeof v === 'number' && v > sch.maximum) err(at, '大于上限 ' + sch.maximum);
  if (Array.isArray(v)) {
    if (sch.minItems != null && v.length < sch.minItems) err(at, '少于 ' + sch.minItems + ' 项');
    if (sch.maxItems != null && v.length > sch.maxItems) err(at, '多于 ' + sch.maxItems + ' 项');
    if (sch.items) v.forEach((x, i) => validate(x, sch.items, at + '[' + i + ']', root));
  }
  if (v && typeof v === 'object' && !Array.isArray(v)) {
    (sch.required || []).forEach(k => {
      if (!Object.prototype.hasOwnProperty.call(v, k)) err(at, '缺字段 ' + k);
    });
    const props = sch.properties || {};
    Object.keys(v).forEach(k => {
      if (props[k]) validate(v[k], props[k], at + '.' + k, root);
      else if (sch.additionalProperties === false) err(at, '多出未声明字段 ' + k);
    });
  }
}

/* ---- 3. 逐板校验 ---- */
const ids = Object.keys(data.plates);
let wires = 0;
ids.forEach(id => {
  const p = data.plates[id];
  const at = id;
  if (p.id !== id) err(at, 'id 与字典键不一致（' + p.id + '）');
  validate(p, schema, at, schema);

  if (Array.isArray(p.size) && Array.isArray(p.crop) && p.size.length === 2 && p.crop.length === 4) {
    const [W, H] = p.size, [cx, cy, cw, ch] = p.crop;
    if (cx + cw > W + 1e-6 || cy + ch > H + 1e-6) err(at, 'crop 越出 size');
    (p.wires || []).forEach((w, i) => {
      if (!w.cut) return;
      if (w.cut.x < cx || w.cut.x > cx + cw || w.cut.y < cy || w.cut.y > cy + ch) {
        err(at + '.wires[' + i + ']', '断口不在 crop 显示区内（放大后点不到）');
      }
    });
  }
  const seen = new Set();
  (p.wires || []).forEach((w, i) => {
    if (seen.has(w.id)) err(at + '.wires[' + i + ']', '线 id 重复 ' + w.id);
    seen.add(w.id);
  });
  wires += (p.wires || []).length;

  const img = path.resolve(repo, p.image || '');
  if (!fs.existsSync(img)) err(at, '图片未落地 ' + p.image);
  else notes.push('  ' + id + '  ' + (p.wires || []).length + ' 根线 · ' +
    p.size.join('×') + ' · crop ' + p.crop.join(',') + ' · ' +
    (fs.statSync(img).size / 1048576).toFixed(2) + ' MB');
});

/* ---- 4. 映射目标必须存在 ---- */
Object.keys(data.byLabel || {}).forEach(label => {
  const id = data.byLabel[label];
  if (!data.plates[id]) err('byLabel.' + label, '指向不存在的板 ' + id);
});
if (data.defaultPlate && data.defaultPlate() && !data.plates[data.defaultPlate().id]) {
  err('defaultPlate', '指向不存在的板');
}

/* ---- 5. JSON 快照一致性 ---- */
ids.forEach(id => {
  const snap = path.join(here, id + '.plate.json');
  if (!fs.existsSync(snap)) { err(id, '缺少 JSON 快照，请跑 npm run plate:build'); return; }
  let obj = null;
  try { obj = JSON.parse(fs.readFileSync(snap, 'utf8')); }
  catch (e) { err(id, '快照不是合法 JSON：' + e.message); return; }
  /* vm 沙箱里的对象原型属于另一个 realm，直接比会被 isDeepStrictEqual 判不等；
     先序列化回 Node realm 再比内容。 */
  const plain = JSON.parse(JSON.stringify(data.plates[id]));
  if (!util.isDeepStrictEqual(obj, plain)) err(id, '快照与 plates.js 不一致，请跑 npm run plate:build');
});

/* ---- 6. 输出 ---- */
console.log('== 图内要素板校验 ==');
console.log('  真源      js/data/plates.js（schema ' + data.schema + '）');
console.log('  板        ' + ids.length + ' 张 · 线 ' + wires + ' 根 · 任务映射 ' +
  Object.keys(data.byLabel || {}).length + ' 条');
notes.forEach(n => console.log(n));
if (errors.length) {
  errors.forEach(e => console.log('  ✗ ' + e));
  console.error('[plate:check] 失败：' + errors.length + ' 错误');
  process.exit(1);
}
console.log('[plate:check] 通过（0 错误）');
