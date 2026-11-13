#!/usr/bin/env node
/* 把「图内要素板」编译成单文件原型 + JSON 快照
 * -------------------------------------------------------------
 * 真源是 js/data/plates.js（运行时也读它），本脚本用 vm 读同一份数据：
 *   · tests/plate-demo.html      单文件可双击预览（图片内联）
 *   · tests/plate/<id>.plate.json  给 3D / 外部工具消费的 JSON 快照
 *
 * 为什么内联图片：预览面板/沙箱常把 HTML 单独拿出来加载，相对路径取不到
 * （表现为裂图）。原型要能在任何地方双击就开，所以图片编成 data URI；
 * 游戏运行时不走这条路径 —— index.html 与图片同在仓库根，直接用相对 src。
 *
 * 用法：node tests/plate/build.cjs [板id]   默认 panel-fix
 */
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const here = __dirname;
const repo = path.resolve(here, '..', '..');
const id = process.argv[2] || 'panel-fix';

/* vm 读真源：与浏览器完全同一份 IIFE，不复制板定义 */
const sandbox = { window: {} };
vm.createContext(sandbox);
const source = path.join(repo, 'js', 'data', 'plates.js');
vm.runInContext(fs.readFileSync(source, 'utf8'), sandbox, { filename: source });
const plate = sandbox.window.SKPlates && sandbox.window.SKPlates.get(id);
if (!plate) throw new Error('找不到板：' + id + '（真源 js/data/plates.js）');

/* image 是相对仓库根的路径 */
const imgPath = path.resolve(repo, plate.image);
if (!fs.existsSync(imgPath)) throw new Error('找不到板图：' + imgPath);

const [W, H] = plate.size;
const crop = plate.crop || [0, 0, W, H];
const mime = /\.jpe?g$/i.test(imgPath) ? 'image/jpeg' : 'image/png';
const b64 = fs.readFileSync(imgPath).toString('base64');
const wires = plate.wires.map(w => ({
  id: w.id, color: w.color, width: w.width, path: w.path, cut: w.cut,
}));

const tpl = fs.readFileSync(path.join(here, 'template.html'), 'utf8');
const vars = {
  '{{LABEL}}': plate.label,
  '{{ID}}': plate.id,
  '{{CROP}}': crop.join(','),
  '{{W}}': String(W),
  '{{H}}': String(H),
  '{{VIEWBOX}}': crop.join(' '),
  '{{IMAGE_DATA}}': 'data:' + mime + ';base64,' + b64,
  '{{WIRES}}': JSON.stringify(wires, null, 2),
  '{{CUT_W}}': String((plate.cut && plate.cut.w) || 20),
  '{{CUT_H}}': String((plate.cut && plate.cut.h) || 40),
  '{{EMBER_R}}': String((plate.ember && plate.ember.r) || 7),
  '{{EMBER_HIT}}': String((plate.ember && plate.ember.hit) || 18),
  '{{COUNT}}': String(wires.length),
};

let out = tpl;
for (const k of Object.keys(vars)) out = out.split(k).join(vars[k]);

const left = out.match(/\{\{[A-Z_]+\}\}/g);
if (left) throw new Error('模板还有未替换的占位符：' + [...new Set(left)].join(', '));

const outPath = path.join(repo, 'tests', 'plate-demo.html');
fs.writeFileSync(outPath, out, 'utf8');
console.log('[plate]', plate.id, '->', path.relative(repo, outPath),
  '(' + (Buffer.byteLength(out) / 1048576).toFixed(2) + ' MB, 内联 ' + mime + ')');

/* 快照与真源逐字段一致（validate.cjs 会核对，防止两份定义漂移） */
const snapPath = path.join(here, plate.id + '.plate.json');
const snap = JSON.stringify(JSON.parse(JSON.stringify(plate)), null, 2) + '\n';
const changed = !fs.existsSync(snapPath) || fs.readFileSync(snapPath, 'utf8') !== snap;
fs.writeFileSync(snapPath, snap, 'utf8');
console.log('[plate]', plate.id, '->', path.relative(repo, snapPath), changed ? '(已更新)' : '(无变化)');
