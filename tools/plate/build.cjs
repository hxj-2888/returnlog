#!/usr/bin/env node
/* 把一张「板」编译成单文件原型：tools/plate-demo.html
 *
 * 为什么内联图片：预览面板/沙箱常把 HTML 单独拿出来加载，`../assets/...`
 * 这种相对路径取不到（表现为裂图）。原型要能在任何地方双击就开，所以图片
 * 直接编成 data URI —— 代价是 HTML 大一点，换来零依赖。
 *
 * 用法：node tools/plate/build.cjs [plate.json]
 * 输出：tools/plate-demo.html（提交进仓库）
 */
'use strict';

const fs = require('fs');
const path = require('path');

const here = __dirname;
const repo = path.resolve(here, '..', '..');
const platePath = process.argv[2]
  ? path.resolve(process.argv[2])
  : path.join(here, 'panel-fix.plate.json');

const plate = JSON.parse(fs.readFileSync(platePath, 'utf8'));
const imgPath = path.resolve(path.dirname(platePath), plate.image);
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

const outPath = path.join(repo, 'tools', 'plate-demo.html');
fs.writeFileSync(outPath, out, 'utf8');
console.log('[plate]', plate.id, '->', path.relative(repo, outPath),
  '(' + (Buffer.byteLength(out) / 1048576).toFixed(2) + ' MB, 内联 ' + mime + ')');
