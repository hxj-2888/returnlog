#!/usr/bin/env node
/* 2.5D 对局 · 人机移动异常追踪（常设体检工具；产物已 gitignore）
 * ------------------------------------------------------------
 * 用法：node tools/track-ai.cjs [--sessions 12] [--sec 120] [--conc 6]
 *        [--seed 20261115] [--out tools/track-ai.json] [--headed] [--realtime]
 *
 * 做法：真实打开 index.html?test（不是蒙特卡洛的 simGame），选旁观者进局，
 * 用 requestAnimationFrame 逐帧采样 15 个 AI 的坐标/路径/卡死计时/计划。
 * 默认用 Playwright 假时钟（page.clock.runFor）推进，跑到 ~2.4 倍速且可复现；
 * --realtime 则按真实墙钟跑（慢，但排除假时钟的影响）。
 * 采样只读，不改任何游戏状态；判定与出图在 track-ai-report.cjs。
 */
'use strict';
const path = require('path');
const fs = require('fs');

function loadPlaywright() {
  const candidates = [process.env.PLAYWRIGHT_CORE, 'playwright-core'].filter(Boolean);
  const errors = [];
  for (const c of candidates) {
    try { return require(c); } catch (e) { errors.push(c + ': ' + (e.code || e.message)); }
  }
  throw new Error('未找到 playwright-core。请先 npm i，或设置 PLAYWRIGHT_CORE。\n  ' + errors.join('\n  '));
}
const { chromium } = loadPlaywright();

const DIR = path.resolve(__dirname, '..');
const URL = 'file:///' + DIR.replace(/\\/g, '/') + '/index.html?test';
function arg(n, d) {
  const i = process.argv.indexOf('--' + n);
  return i >= 0 && process.argv[i + 1] != null ? process.argv[i + 1] : d;
}
const SESSIONS = Math.max(1, parseInt(arg('sessions', '12'), 10) || 12);
const SEC = Math.max(20, parseFloat(arg('sec', '120')) || 120);
const CONC = Math.max(1, Math.min(8, parseInt(arg('conc', '6'), 10) || 6));
const BASE_SEED = (parseInt(arg('seed', '20261115'), 10) >>> 0);
const OUT = path.resolve(DIR, arg('out', 'tools/track-ai.json'));
const HEADED = process.argv.includes('--headed');
const REALTIME = process.argv.includes('--realtime');
/* 假时钟下把 rAF 拉长到 25ms：帧数减半、速度约 4 倍，取样仍是 20Hz（0.1 格/样本） */
const RAF = Math.max(0, parseFloat(arg('raf', '25')) || 0);

/* 假时钟推进：一次走一块虚拟时间，块间可以检查 playT / 结束状态 */
async function advance(page, ms) {
  if (REALTIME) await page.waitForTimeout(ms);
  else await page.clock.runFor(ms);
}

async function runSession(browser, s) {
  const seed = (BASE_SEED + s * 7919) >>> 0;
  const page = await browser.newPage({ viewport: { width: 720, height: 460 } });
  const errors = [];
  page.on('pageerror', e => errors.push('PAGEERROR ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push('CONSOLE ' + m.text()); });
  page.on('crash', () => errors.push('PAGE CRASH'));
  if (!REALTIME) await page.clock.install();
  if (!REALTIME && RAF) {
    await page.addInitScript(ms => {
      window.requestAnimationFrame = cb => setTimeout(() => cb(performance.now()), ms);
    }, RAF);
  }
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
  /* 主页有 #home-note 提示条会拦住指针事件，这里直接派发 click()，绕开命中测试 */
  await page.evaluate(() => document.querySelector('[data-role="spect"]').click());
  await page.evaluate(() => document.getElementById('home-go').click());
  for (let i = 0; i < 40; i++) {
    const ok = await page.evaluate(() => !!(window.SKV3 && SKV3._t && SKV3._t.assets().base));
    if (ok) break;
    await advance(page, 250);
  }
  await advance(page, 500);

  /* 采样器：逐帧记录，只读 G */
  await page.evaluate(() => {
    const G0 = SKV3._t.G();
    const legend = { doing: [], plan: [], act: [] };
    const idx = (arr, v) => {
      if (v == null || v === '' || v === 0) return -1;
      const k = String(v);
      let i = arr.indexOf(k);
      if (i < 0) { arr.push(k); i = arr.length - 1; }
      return i;
    };
    const cap = { samples: [], legend, meta: null };
    window.__cap = cap;
    cap.meta = {
      seats: G0.agents.map(a => ({ i: a.i, name: a.name, alien: !!a.alien })),
      bounds: { w: SKMapData.bounds.w, h: SKMapData.bounds.h },
      rooms: SKMapData.rooms.map(r => ({ id: r.id, name: r.name, rect: r.rect, poly: r.poly })),
      nightLen: SKV3._t.nightLen()
    };
    let last = 0;
    function tick(ts) {
      const G = SKV3._t.G();
      if (G && G.agents && ts - last >= 40) {
        last = ts;
        const row = [];
        for (const a of G.agents) {
          let f = 0;
          if (a.moving) f |= 1;
          if (a.alive) f |= 2;
          if (a.detained || (a.stunT || 0) > 0) f |= 4;
          if ((a._fleeT || 0) > 0) f |= 8;
          if ((a._rest || 0) > 0) f |= 16;
          if ((a._delay || 0) > 0) f |= 32;
          if (a.drag != null) f |= 64;
          if (G.meet) f |= 128;
          if (a.downed) f |= 256;
          row.push([
            +a.x.toFixed(2), +a.y.toFixed(2), f,
            a.path ? a.path.length : 0,
            +((a._stuckT || 0).toFixed(2)),
            +((a._pathCD || 0).toFixed(2)),
            idx(cap.legend.doing, a._doing),
            idx(cap.legend.plan, a._plan && a._plan.id),
            idx(cap.legend.act, a._fixGo ? 'fix:' + (a._fixGo.room || 'x')
              : (a.target ? 'tgt:' + a.i : ''))
          ]);
        }
        cap.samples.push([+G.playT.toFixed(2), +G.t.toFixed(2), G.night, row]);
      }
      requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
  });

  const t0 = Date.now();
  let info = { playT: 0, night: 1, samples: 0, over: false };
  const maxWallMs = REALTIME ? (SEC * 4 + 120) * 1000 : (SEC / 2 + 120) * 1000;
  while (Date.now() - t0 < maxWallMs) {
    await advance(page, REALTIME ? 800 : 4000);   /* 一块虚拟时间 4 秒 */
    info = await page.evaluate(() => {
      const G = SKV3._t.G(), c = window.__cap;
      return { playT: G.playT, night: G.night, samples: c.samples.length, over: !!G.over };
    });
    if (info.over || info.playT >= SEC) break;
  }
  const dump = await page.evaluate(() => {
    const c = window.__cap;
    return { meta: c.meta, legend: c.legend, samples: c.samples };
  });
  dump.meta.runSeed = seed;
  dump.meta.endedAtPlayT = info.playT;
  dump.meta.gameOver = !!info.over;
  dump.meta.nights = info.night;
  dump.errors = errors;
  await page.close();
  console.log('  局 ' + (s + 1) + '/' + SESSIONS + ' seed ' + seed + ' · playT ' +
    info.playT.toFixed(0) + 's · 夜 ' + info.night + ' · 采样 ' + dump.samples.length +
    ' · 用时 ' + ((Date.now() - t0) / 1000).toFixed(0) + 's' +
    (errors.length ? ' · 控制台错误 ' + errors.length : ''));
  return dump;
}

(async () => {
  const t0 = Date.now();
  const browser = await chromium.launch({ channel: 'msedge', headless: !HEADED });
  global.__br = browser;
  const out = new Array(SESSIONS);
  let next = 0, done = 0;
  const workers = Array.from({ length: Math.min(CONC, SESSIONS) }, async () => {
    while (true) {
      const s = next++;
      if (s >= SESSIONS) return;
      try {
        out[s] = await runSession(browser, s);
        done++;
      } catch (e) {
        console.log('  局 ' + (s + 1) + ' 失败：' + (e && e.message || e));
        try { out[s] = await runSession(browser, s); done++; }
        catch (e2) { console.log('  局 ' + (s + 1) + ' 重试仍失败，跳过'); out[s] = null; }
      }
    }
  });
  await Promise.all(workers);
  const kept = out.filter(Boolean);
  fs.writeFileSync(OUT, JSON.stringify({
    generatedAt: new Date().toISOString(), url: URL, sec: SEC, clock: REALTIME ? 'real' : 'virtual',
    raf: REALTIME ? 0 : (RAF || 0), sessions: kept
  }));
  console.log('合计 ' + done + ' 局 · 墙钟 ' + ((Date.now() - t0) / 1000).toFixed(0) + 's → ' +
    path.relative(DIR, OUT));
  await browser.close();
})().catch(async e => {
  console.error(e);
  try { if (global.__br) await global.__br.close(); } catch (_) {}
  process.exit(2);
});
