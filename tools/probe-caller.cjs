#!/usr/bin/env node
/* 诊断探针：抓 walkTo 寻路失败那一刻的**调用方**与目标坐标
 * 用法：node tools/probe-caller.cjs [--sec 90] [--sessions 2] [--seed 20261115]
 *
 * 做法：CDP 在 js/game.js 的 `a._pathCD=1.2` 那行下条件断点（!p），
 * 每次命中先取调用栈 + 局部变量，再自动 resume。只读，不改游戏。
 */
'use strict';
const path = require('path');
const fs = require('fs');
const { chromium } = require('playwright-core');
const DIR = path.resolve(__dirname, '..');
const URL = 'file:///' + DIR.replace(/\\/g, '/') + '/index.html?test';
function arg(n, d) { const i = process.argv.indexOf('--' + n); return i >= 0 ? process.argv[i + 1] : d; }
const SEC = parseFloat(arg('sec', '90'));
const SESSIONS = parseInt(arg('sessions', '2'), 10);
const SEED = (parseInt(arg('seed', '20261115'), 10) >>> 0);
const OUT = path.resolve(DIR, arg('out', 'tools/probe-caller.json'));
/* js/game.js:827 —— if(!p&&...)a._pathCD=1.2;  （0 基行号 826） */
const LINE = 826;

(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  const all = [];
  for (let s = 0; s < SESSIONS; s++) {
    const seed = (SEED + s * 7919) >>> 0;
    const page = await browser.newPage({ viewport: { width: 720, height: 460 } });
    await page.clock.install();
    await page.addInitScript(() => {
      window.requestAnimationFrame = cb => setTimeout(() => cb(performance.now()), 25);
    });
    await page.goto(URL);
    await page.evaluate(seed => {
      let a = seed >>> 0;
      Math.random = function () {
        a |= 0; a = a + 0x6D2B79F5 | 0;
        let t = Math.imul(a ^ a >>> 15, 1 | a);
        t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
        return ((t ^ t >>> 14) >>> 0) / 4294967296;
      };
    }, seed);
    await page.evaluate(() => document.querySelector('[data-role="spect"]').click());
    await page.evaluate(() => document.getElementById('home-go').click());
    for (let i = 0; i < 40; i++) {
      if (await page.evaluate(() => !!(window.SKV3 && SKV3._t && SKV3._t.assets().base))) break;
      await page.clock.runFor(250);
    }

    const cdp = await page.context().newCDPSession(page);
    const scripts = [];
    cdp.on('Debugger.scriptParsed', e => { if (/\/js\/game\.js$/.test(decodeURIComponent(e.url))) scripts.push(e.scriptId); });
    await cdp.send('Debugger.enable');
    await page.waitForTimeout(400);
    if (!scripts.length) { console.log('找不到 game.js 脚本，跳过本局'); await page.close(); continue; }
    const bp = await cdp.send('Debugger.setBreakpoint', {
      location: { scriptId: scripts[scripts.length - 1], lineNumber: LINE, columnNumber: 0 },
      condition: '!p'
    });
    console.log('断点已挂 ' + bp.breakpointId + ' · 绑定位置 ' + (bp.locations || []).length);
    let busy = false;
    const hits = [];
    cdp.on('Debugger.paused', async ev => {
      if (busy) return;
      busy = true;
      try {
        const top = ev.callFrames[0];
        const expr = 'JSON.stringify({who:a.name,x:+x.toFixed(1),y:+y.toFixed(1),ax:+a.x.toFixed(1),ay:+a.y.toFixed(1),'
          + 't:+G.playT.toFixed(1),doing:a._doing||"",plan:a._plan?a._plan.id:"",delay:+(a._delay||0).toFixed(1),'
          + 'fix:a._fixGo?1:0,drag:a.drag==null?null:a.drag,flee:+(a._fleeT||0).toFixed(1),down:a.downed?1:0})';
        const r = await cdp.send('Debugger.evaluateOnCallFrame', {
          callFrameId: top.callFrameId, expression: expr, returnByValue: true
        });
        const info = r.result && r.result.value ? JSON.parse(r.result.value) : {};
        info.si = s + 1;
        info.stack = ev.callFrames.slice(1, 4).map(f => (f.functionName || '(anon)') + '@' + (f.location.lineNumber + 1));
        hits.push(info);
      } catch (e) { /* 命中期间页面可能在收尾，忽略 */ }
      busy = false;
      try { await cdp.send('Debugger.resume'); } catch (e) {}
    });

    const t0 = Date.now();
    while (Date.now() - t0 < (SEC / 2 + 120) * 1000) {
      await page.clock.runFor(4000);
      const p = await page.evaluate(() => SKV3._t.G().playT);
      if (p >= SEC) break;
    }
    console.log('局 ' + (s + 1) + ' seed ' + seed + ' · 失败命中 ' + hits.length + ' 次');
    all.push(...hits);
    await page.close();
  }
  fs.writeFileSync(OUT, JSON.stringify({ generatedAt: new Date().toISOString(), hits: all }, null, 1));
  const by = {};
  for (const h of all) {
    const k = (h.stack[0] || '?') + ' ← ' + (h.stack[1] || '');
    by[k] = by[k] || { n: 0, sample: [] };
    by[k].n++;
    if (by[k].sample.length < 4) by[k].sample.push(h);
  }
  console.log('=== 失败调用点（次数 / 首帧调用方） ===');
  Object.entries(by).sort((a, b) => b[1].n - a[1].n).slice(0, 12).forEach(([k, v]) => {
    console.log('  ' + v.n + '×  ' + k);
    v.sample.forEach(h => console.log('       ' + h.who + ' t=' + h.t + ' @(' + h.ax + ',' + h.ay + ') → 目标(' + h.x + ',' + h.y + ')'
      + (h.doing ? ' doing=' + h.doing : '') + (h.plan ? ' plan=' + h.plan : '') + (h.delay ? ' delay=' + h.delay : '')
      + (h.fix ? ' fixGo' : '') + (h.drag != null ? ' drag=' + h.drag : '') + (h.flee ? ' flee=' + h.flee : '')));
  });
  console.log('原始 → ' + path.relative(DIR, OUT));
  await browser.close();
})().catch(e => { console.error(e); process.exit(2); });
