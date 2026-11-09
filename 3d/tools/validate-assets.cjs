#!/usr/bin/env node
/* 3D 资产清单校验：schema 结构 + 命名 + 预算 + 落地情况。
 *
 * 为什么自己写而不装 ajv：主项目是零依赖前端，工具链也尽量不引第三方包；
 * schema 只用到很小的一个子集，手写反而更好读、报错更具体。
 *
 * 用法：node 3d/tools/validate-assets.cjs [--json]
 * 退出码：0 通过；1 有错误（提交前必须为 0）
 */
'use strict';

const fs = require('fs');
const path = require('path');

const here = __dirname;
const root3d = path.resolve(here, '..');
const repo = path.resolve(root3d, '..');
const schemaPath = path.join(root3d, 'spec', 'asset.schema.json');
const manifestPath = path.join(root3d, 'spec', 'assets.manifest.json');

/* 每类的面数上限，与 spec/conventions.md §3 一致 */
const TRI_CAP = { ship: 120000, room: 15000, prop: 8000, device: 8000, character: 12000, fx: 200 };

const errors = [];
const warns = [];
const err = (m) => errors.push(m);
const warn = (m) => warns.push(m);

/* ---------------- 迷你 JSON Schema 校验（只支持本 schema 用到的关键字） ---------------- */
function typeOf(v) {
  if (Array.isArray(v)) return 'array';
  if (v === null) return 'null';
  if (Number.isInteger(v)) return 'integer';
  return typeof v;
}

function resolveRef(schema, ref) {
  if (!ref.startsWith('#/')) throw new Error('只支持本地 $ref: ' + ref);
  return ref.slice(2).split('/').reduce((o, k) => o[k], schema);
}

function validate(schema, value, ptr, root) {
  if (schema.$ref) return validate(resolveRef(root, schema.$ref), value, ptr, root);
  if (schema.const !== undefined && value !== schema.const)
    return err(`${ptr}: 必须为 ${JSON.stringify(schema.const)}，实际 ${JSON.stringify(value)}`);

  const t = typeOf(value);
  if (schema.type) {
    const ok = schema.type === 'number'
      ? (t === 'number' || t === 'integer')
      : (schema.type === t || (schema.type === 'integer' && t === 'integer'));
    if (!ok) return err(`${ptr}: 类型应为 ${schema.type}，实际 ${t}`);
  }
  if (schema.enum && !schema.enum.includes(value))
    return err(`${ptr}: 取值必须是 ${schema.enum.join(' / ')}，实际 ${JSON.stringify(value)}`);
  if (schema.pattern && typeof value === 'string' && !new RegExp(schema.pattern).test(value))
    return err(`${ptr}: 不匹配 /${schema.pattern}/ → ${JSON.stringify(value)}`);
  if (typeof value === 'string') {
    if (schema.minLength != null && value.length < schema.minLength)
      err(`${ptr}: 长度 < ${schema.minLength}`);
  }
  if (typeof value === 'number') {
    if (schema.minimum != null && value < schema.minimum) err(`${ptr}: 应 ≥ ${schema.minimum}`);
    if (schema.exclusiveMinimum != null && value <= schema.exclusiveMinimum)
      err(`${ptr}: 应 > ${schema.exclusiveMinimum}`);
  }
  if (Array.isArray(value)) {
    if (schema.minItems != null && value.length < schema.minItems) err(`${ptr}: 至少 ${schema.minItems} 项`);
    if (schema.maxItems != null && value.length > schema.maxItems) err(`${ptr}: 最多 ${schema.maxItems} 项`);
    if (schema.items) value.forEach((v, i) => validate(schema.items, v, `${ptr}[${i}]`, root));
  }
  if (t === 'object') {
    for (const k of schema.required || []) if (!(k in value)) err(`${ptr}: 缺少必填字段 "${k}"`);
    if (schema.additionalProperties === false) {
      for (const k of Object.keys(value)) if (!schema.properties || !(k in schema.properties))
        err(`${ptr}: 不允许的字段 "${k}"`);
    }
    for (const k of Object.keys(value)) {
      if (schema.properties && schema.properties[k]) validate(schema.properties[k], value[k], `${ptr}.${k}`, root);
    }
  }
}

/* ---------------- 开始 ---------------- */
const schema = JSON.parse(fs.readFileSync(schemaPath, 'utf8'));
const raw = fs.readFileSync(manifestPath, 'utf8');
let man;
try { man = JSON.parse(raw); } catch (e) { console.error('[3d:assets] 清单不是合法 JSON：' + e.message); process.exit(1); }

validate(schema, man, 'manifest', schema);

const assets = Array.isArray(man.assets) ? man.assets : [];
const ids = new Map();

for (const a of assets) {
  const id = a.id || '(no id)';
  if (ids.has(id)) err(`id 重复：${id}`);
  ids.set(id, a);

  /* 文件名必须与 id 一致：靠人记「这个 glb 是哪个 blend 导的」迟早出错 */
  const base = id;
  if (a.source && path.basename(a.source) !== base + '.blend')
    err(`${id}: source 文件名应为 ${base}.blend，实际 ${path.basename(a.source)}`);
  if (a.export && path.basename(a.export) !== base + '.glb')
    err(`${id}: export 文件名应为 ${base}.glb，实际 ${path.basename(a.export)}`);

  const cap = TRI_CAP[a.category];
  if (cap && a.budget && a.budget.tris > cap)
    err(`${id}: 三角面 ${a.budget.tris} 超 ${a.category} 预算 ${cap}`);

  /* 落地检查：只有 done 才强制两个文件都在 */
  const src = a.source ? path.join(root3d, 'assets', a.source) : null;
  const out = a.export ? path.join(root3d, 'assets', a.export) : null;
  if (a.status === 'done') {
    if (!src || !fs.existsSync(src)) err(`${id}: status=done 但缺少源文件 ${a.source}`);
    if (!out || !fs.existsSync(out)) err(`${id}: status=done 但缺少导出物 ${a.export}`);
  } else if (a.status === 'wip' && src && !fs.existsSync(src)) {
    warn(`${id}: status=wip 但源文件还没落地（${a.source}）`);
  }
  if (a.status === 'blocked' && !a.notes) err(`${id}: status=blocked 必须写 notes 说明卡在哪`);

  for (const tex of a.textures || []) {
    if (!fs.existsSync(path.join(root3d, 'assets', tex))) warn(`${id}: 贴图未落地 ${tex}`);
  }
}

/* ---------------- 汇总 ---------------- */
const byStatus = {};
const byCat = {};
let tris = 0;
for (const a of assets) {
  byStatus[a.status] = (byStatus[a.status] || 0) + 1;
  byCat[a.category] = (byCat[a.category] || 0) + 1;
  tris += (a.budget && a.budget.tris) || 0;
}

if (process.argv.includes('--json')) {
  console.log(JSON.stringify({ ok: errors.length === 0, errors, warns, byStatus, byCat, tris }, null, 2));
} else {
  const line = (k, v) => console.log('  ' + k.padEnd(10) + v);
  console.log('== 3D 资产清单 ==');
  line('资产', assets.length + ' 项');
  line('状态', Object.entries(byStatus).map(([k, v]) => `${k} ${v}`).join(' · '));
  line('分类', Object.entries(byCat).map(([k, v]) => `${k} ${v}`).join(' · '));
  line('预算合计', tris.toLocaleString('en-US') + ' tris');
  if (warns.length) {
    console.log('\n-- 提醒 ' + warns.length + ' 条 --');
    warns.forEach(w => console.log('  ! ' + w));
  }
  if (errors.length) {
    console.log('\n-- 错误 ' + errors.length + ' 条 --');
    errors.forEach(e => console.log('  x ' + e));
    console.log('\n[3d:assets] 未通过');
  } else {
    console.log('\n[3d:assets] 通过（0 错误 / ' + warns.length + ' 提醒）');
  }
}

process.exit(errors.length ? 1 : 0);
