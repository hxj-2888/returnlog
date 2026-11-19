#!/usr/bin/env node
/* 板热点叠加核准（只读工具，不是游戏运行时）
 * -------------------------------------------------------------
 * 把 js/data/plates.js 里的每一块板渲染成「原图 + 热点框 + 拖动目标 + 亮带」，
 * 拼成一张对照图，用来肉眼确认坐标真的压在图上（不是目测猜的）。
 *
 * 用法：node tools/plate-overlay.cjs [输出路径]
 * 产出：tools/screenshots/plate-overlay.png（默认）
 * 依赖：playwright-core（已是本仓门禁依赖）
 */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { chromium } = require('playwright-core');

const repo = path.resolve(__dirname, '..');
const sandbox = { window: {} };
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(path.join(repo, 'js/data/plates.js'), 'utf8'), sandbox);
const P = sandbox.window.SKPlates;

const BOX = 330;
const cells = Object.keys(P.plates).map(id => {
  const p = P.plates[id];
  const [W, H] = p.size;
  const [cx, cy, cw, ch] = p.crop;
  const s = Math.min(BOX / cw, BOX / ch);
  const fw = Math.round(cw * s), fh = Math.round(ch * s);
  const src = 'file:///' + path.join(repo, p.image).replace(/\\/g, '/');
  const spots = (p.spots || []).map(sp => {
    let x = sp.x, y = sp.y, w = sp.w, h = sp.h;
    if (sp.shape === 'circle') { const r = sp.r || 18; x = sp.x - r; y = sp.y - r; w = r * 2; h = r * 2; }
    if (sp.shape === 'point') { w = sp.w || 44; h = sp.h || 44; x = sp.x - w / 2; y = sp.y - h / 2; }
    const bx = (x - cx) * s, by = (y - cy) * s, bw = w * s, bh = h * s;
    let band = '';
    if (sp.band) {
      const bh2 = bh * (sp.band[1] - sp.band[0]) / 100;
      const by2 = by + bh - bh * sp.band[1] / 100;
      band = '<u style="left:' + bx + 'px;top:' + by2 + 'px;width:' + bw + 'px;height:' + bh2 + 'px"></u>';
    }
    return '<b style="left:' + bx + 'px;top:' + by + 'px;width:' + bw + 'px;height:' + bh + 'px">' +
      (sp.order || '') + band + '</b>';
  }).join('');
  const targets = (p.spots || []).filter(sp => sp.to).map(sp => {
    const r = (sp.toR || 34) * s;
    return '<i style="left:' + ((sp.to[0] - cx) * s - r) + 'px;top:' + ((sp.to[1] - cy) * s - r) +
      'px;width:' + r * 2 + 'px;height:' + r * 2 + 'px"></i>';
  }).join('');
  const lanes = (p.lanes || []).map(l =>
    '<s style="left:' + ((l.x - cx) * s) + 'px;top:' + ((l.y - cy) * s) + 'px;width:' + (l.w * s) +
    'px;height:' + (l.h * s) + 'px;--lo:' + (l.band[0] * 100) + '%;--hi:' + (l.band[1] * 100) + '%"></s>'
  ).join('');
  return '<div class="cell"><div class="nm">' + id + ' · crop ' + p.crop.join(',') + '</div>' +
    '<div class="fr" style="width:' + fw + 'px;height:' + fh + 'px">' +
    '<img src="' + src + '" style="left:' + (-cx * s) + 'px;top:' + (-cy * s) +
    'px;width:' + (W * s) + 'px;height:' + (H * s) + 'px">' + spots + targets + lanes +
    '</div></div>';
}).join('');

const html = '<!doctype html><meta charset="utf-8"><style>' +
  'body{margin:0;background:#0b0f15;color:#dde3ec;font:12px system-ui,"Microsoft YaHei";' +
  'display:grid;grid-template-columns:repeat(3,auto);gap:14px;padding:14px;justify-content:start}' +
  '.nm{color:#f0c674;margin-bottom:4px;font-size:11px}' +
  '.fr{position:relative;overflow:hidden;border:1px solid #2a3240;background:#05080d}' +
  '.fr img{position:absolute;max-width:none}' +
  'b{position:absolute;border:1.5px dashed #f0c674;box-sizing:border-box;color:#f0c674;' +
  'font:10px/14px system-ui;text-align:left;padding-left:2px}' +
  'b u{position:absolute;left:0;right:0;background:rgba(240,198,116,.28)}' +
  'i{position:absolute;border:1.5px dotted #5ad1c0;border-radius:50%;box-sizing:border-box}' +
  's{position:absolute;border:1px solid rgba(224,87,79,.7);background:' +
  'linear-gradient(90deg,transparent var(--lo),rgba(224,87,79,.25) var(--lo),rgba(224,87,79,.25) var(--hi),transparent var(--hi))}' +
  '</style>' + cells;

const tmp = path.join(repo, '_plate-overlay.html');
fs.writeFileSync(tmp, html);
const out = process.argv[2] || path.join(repo, 'tools', 'screenshots', 'plate-overlay.png');

(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  const page = await browser.newPage({ viewport: { width: 1100, height: 800 }, deviceScaleFactor: 1 });
  await page.goto('file:///' + tmp.replace(/\\/g, '/'));
  await page.waitForTimeout(600);
  fs.mkdirSync(path.dirname(out), { recursive: true });
  await page.screenshot({ path: out, fullPage: true });
  await browser.close();
  fs.unlinkSync(tmp);
  console.log('plate-overlay →', out);
})().catch(e => { console.error(e); try { fs.unlinkSync(tmp); } catch (_) {} process.exit(1); });
