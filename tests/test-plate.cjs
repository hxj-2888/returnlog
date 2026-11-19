/* 图内任务全量自测（独立于 test-v3.cjs，不参与全量门禁）
 * ------------------------------------------------------------
 * 覆盖：26 个任务全部走 js/t2/plate-task.js 的六种动词
 *   · 数据层：24 个 plate + 2 个 wire，无 match/sequence/code/sort，26 条板映射齐备
 *   · 每个任务实解一遍：tap / tapSeq / hold / holdBand / drag / aim
 *   · DOM 契约：.pspot[data-i][data-order]、.pdrag / .ptarget、.paim[data-inband]
 *   · 编号徽章、亮带、拖动配对、命中窗口
 *   · 全程零 pageerror；三个代表动词各留一张截图
 * 用法：node tests/test-plate.cjs
 * 依赖：playwright-core（与 test-v3.cjs 相同）
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
  throw new Error('未找到 playwright-core。请 npm i -D playwright-core，或设置 PLAYWRIGHT_CORE。\n  ' + errors.join('\n  '));
}

const { chromium } = loadPlaywright();
const DIR = path.resolve(__dirname, '..');
const URL = 'file:///' + DIR.replace(/\\/g, '/') + '/index.html?test';
const SHOTS = path.join(DIR, 'tools', 'screenshots');

let pass = 0, fail = 0;
function ok(cond, msg) {
  if (cond) { pass++; console.log('  ✓ ' + msg); }
  else { fail++; console.log('  ✗ ' + msg); }
}

const LABELS = [
  '引擎组同步', '温控面板', '消毒循环', '电路维修', '备用配电盘', '零件台',
  '变压器换芯', '工具架', '工作台', '氧气循环', '培养罐补液', '药柜', '手术台校准',
  '餐台清洁', '后厨盘点', '娱乐桌', '点唱机', '监控墙重连', '操作台', '录像归档',
  '弹药清点', '靶道校准', '库存盘点', '货架校准', '货箱封条', '出库扫描'
];

(async () => {
  fs.mkdirSync(SHOTS, { recursive: true });
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 820 } });
  const errors = [];
  page.on('pageerror', e => errors.push(String(e && e.message || e)));

  console.log('== 图内任务 · 26 个任务全量 ==');
  await page.goto(URL);
  await page.waitForFunction(() => !!window.SKMiniGame && !!window.SKPlateTask, null, { timeout: 20000 });
  await page.click('#home-go');
  await page.waitForFunction(() => window.SKV3 && SKV3._t && SKV3._t.assets().base, null, { timeout: 30000 });
  /* 局内会议 openMeeting() 会强制 SKMiniGame.close()，会把自测的小游戏半路关掉；
     本测试只验小游戏，先把对局暂停，避免会议/报警插进来。 */
  await page.evaluate(() => { const g = SKV3._t.G(); g.paused = true; });
  await page.waitForTimeout(200);

  /* ---------- 1. 数据层 ---------- */
  const data = await page.evaluate(() => {
    const t = SKMiniGame.data.tasks;
    const labels = Object.keys(t);
    const kinds = {}, verbs = {};
    labels.forEach(l => {
      kinds[t[l].k] = (kinds[t[l].k] || 0) + 1;
      if (t[l].verb) verbs[t[l].verb] = (verbs[t[l].verb] || 0) + 1;
    });
    return {
      n: labels.length, labels, kinds, verbs,
      boards: Object.keys(SKPlates.plates).length,
      mapped: labels.filter(l => SKPlates.forLabel(l)).length,
      memory: labels.filter(l => t[l].memory || ['match', 'sequence', 'code', 'sort'].indexOf(t[l].k) >= 0)
    };
  });
  ok(data.n === 26 && LABELS.every(l => data.labels.indexOf(l) >= 0),
    '26 个任务齐备（实测 ' + data.n + '）');
  ok(data.kinds.plate === 24 && data.kinds.wire === 2,
    '玩法分布：plate ' + data.kinds.plate + ' / wire ' + data.kinds.wire);
  ok(data.memory.length === 0, '没有记忆型任务' + (data.memory.length ? '：' + data.memory.join(' / ') : ''));
  ok(data.mapped === 26 && data.boards === 16,
    data.boards + ' 块板覆盖 ' + data.mapped + ' / 26 个任务');
  ok(data.verbs.tap >= 4 && data.verbs.tapSeq >= 4 && data.verbs.hold >= 4 &&
    data.verbs.holdBand >= 3 && data.verbs.drag >= 3 && data.verbs.aim >= 1,
    '六动词在用：' + Object.keys(data.verbs).map(k => k + ' ' + data.verbs[k]).join(' · '));

  /* ---------- 2. 逐任务实解 ---------- */
  const solveOne = async label => {
    const r = await page.evaluate(async label => {
      const sleep = ms => new Promise(r => setTimeout(r, ms));
      const q = s => document.querySelector(s);
      const qa = s => Array.from(document.querySelectorAll(s));
      const cl = e => { if (e) e.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true })); };
      const t = SKMiniGame.data.tasks[label] || {};
      const verb = t.verb || 'tap';
      const list = () => qa('#mg .pspot[data-i]').slice()
        .sort((a, b) => (+a.dataset.order || 0) - (+b.dataset.order || 0));
      window.__mgDone = 0; window.__mgCancel = 0;
      SKMiniGame.open('task', {
        label, title: label, tier: 'hard', fallback: 999,
        onDone: () => { window.__mgDone++; }, onCancel: () => { window.__mgCancel++; }
      });
      await sleep(120);
      if (t.k === 'wire') {
        /* 两个接线任务仍走 js/t2/minigame.js#buildPlate（本来就在图上点断口） */
        const n = qa('#mg .cut-rect').length;
        const rounds = Math.max(1, t.rounds || 1);
        for (let r = 0; r < rounds; r++) {
          for (let i = 0; i < n; i++) {
            cl(q('#mg .ember-hit[data-i="' + i + '"][data-k="0"]'));
            cl(q('#mg .ember-hit[data-i="' + i + '"][data-k="1"]'));
          }
        }
      } else if (verb === 'tap' || verb === 'tapSeq') {
        for (const s of list()) cl(s);
      } else if (verb === 'hold') {
        for (const s of list()) {
          if (s.classList.contains('done')) continue;
          s.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerId: 21 }));
          await sleep((+s.dataset.hold || 900) + 300);
          s.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, pointerId: 21 }));
        }
      } else if (verb === 'holdBand') {
        for (const s of list()) {
          if (s.classList.contains('done')) continue;
          const lo = +s.dataset.lo || 50, hi = +s.dataset.hi || 70;
          const dur = +s.dataset.dur || 2.2;
          s.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerId: 22 }));
          await sleep(dur * (lo + hi) / 2 * 10);
          s.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, pointerId: 22 }));
        }
      } else if (verb === 'drag') {
        for (const s of list()) {
          if (s.classList.contains('done')) continue;
          const tg = q('#mg .ptarget[data-i="' + s.dataset.i + '"]');
          if (!tg) return { err: 'no target ' + s.dataset.i, verb };
          const a = s.getBoundingClientRect(), b = tg.getBoundingClientRect();
          const px = a.left + a.width / 2, py = a.top + a.height / 2;
          const tx = b.left + b.width / 2, ty = b.top + b.height / 2;
          s.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, clientX: px, clientY: py, pointerId: 23 }));
          window.dispatchEvent(new PointerEvent('pointermove', { bubbles: true, clientX: tx, clientY: ty, pointerId: 23 }));
          window.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, clientX: tx, clientY: ty, pointerId: 23 }));
          await sleep(80);
        }
      } else if (verb === 'aim') {
        const lane = q('#mg .pspot.paim');
        if (!lane) return { err: 'no lane', verb };
        for (let i = 0; i < 160 && SKMiniGame.isOpen(); i++) {
          if (lane.dataset.inband === '1') cl(lane);
          await sleep(16);
        }
      }
      await sleep(900);
      const out = {
        verb, done: window.__mgDone, cancel: window.__mgCancel, st: (window.__SKPlateState?window.__SKPlateState():null),
        prog: (document.getElementById('mg-s') || {}).textContent,
        open: SKMiniGame.isOpen(),
        pre: (window.__SK_PREMATURE || []).slice(-1)[0],
        cls: (window.__SK_CLOSE || []).slice(-1)[0]
      };
      SKMiniGame.close();
      return out;
    }, label);
    return r;
  };

  for (const label of LABELS) {
    const r = await solveOne(label);
    ok(r.done === 1 && r.cancel === 0 && !r.open,
      label + '（' + r.verb + '，进度 ' + r.prog + '，onDone ' + r.done + '）' +
      (r.st && r.done !== 1 ? ' STATE ' + JSON.stringify(r.st) : '') +
      (r.done !== 1 && r.cls ? ' CLOSE ' + String(r.cls).split('\n').slice(0,5).join(' | ') : '') +
      (r.err ? ' ERR ' + r.err : ''));
    await page.waitForTimeout(60);
  }

  /* ---------- 3. 结构契约 ---------- */
  const struct = await page.evaluate(async () => {
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    const q = s => document.querySelector(s);
    const qa = s => Array.from(document.querySelectorAll(s));
    const out = {};
    SKMiniGame.open('task', { label: '监控墙重连', title: '监控墙重连', tier: 'hard', fallback: 999 });
    await sleep(120);
    out.seq = { badges: qa('#mg .pord').map(b => +b.textContent), spots: qa('#mg .pspot').length };
    SKMiniGame.close();
    SKMiniGame.open('task', { label: '零件台', title: '零件台', tier: 'hard', fallback: 999 });
    await sleep(120);
    out.drag = { drags: qa('#mg .pdrag').length, targets: qa('#mg .ptarget').length };
    SKMiniGame.close();
    SKMiniGame.open('task', { label: '引擎组同步', title: '引擎组同步', tier: 'hard', fallback: 999 });
    await sleep(120);
    const hb = q('#mg .pspot');
    out.band = { lo: +hb.dataset.lo, hi: +hb.dataset.hi, dur: +hb.dataset.dur };
    SKMiniGame.close();
    SKMiniGame.open('task', { label: '靶道校准', title: '靶道校准', tier: 'hard', fallback: 999 });
    await sleep(120);
    const lane = q('#mg .pspot.paim');
    out.aim = { lo: +lane.dataset.lo, hi: +lane.dataset.hi, hasBand: !!q('#mg .paim-band') };
    SKMiniGame.close();
    return out;
  });
  ok(struct.seq.badges.join(',') === '1,2,3,4' && struct.seq.spots === 4,
    '顺序点按：编号画在图上且 DOM 可读（' + struct.seq.badges.join('/') + '）');
  ok(struct.drag.drags === 3 && struct.drag.targets === 3,
    '拖动：' + struct.drag.drags + ' 拖 / ' + struct.drag.targets + ' 个虚线缺口一一配对');
  ok(struct.band.hi > struct.band.lo && struct.band.dur >= 2,
    '长按到位：亮带 ' + struct.band.lo + '~' + struct.band.hi + '%，推进 ' + struct.band.dur + 's');
  ok(struct.aim.hasBand && struct.aim.hi > struct.aim.lo,
    '节奏点按：轨道与亮带都在 DOM 上（' + struct.aim.lo + '~' + struct.aim.hi + '）');

  /* ---------- 4. 三个代表动词截图 ---------- */
  const shots = [
    ['货箱封条', 'hold'],
    ['零件台', 'drag'],
    ['氧气循环', 'tapSeq']
  ];
  for (const [label, verb] of shots) {
    await page.evaluate(label => {
      SKMiniGame.open('task', { label, title: label, tier: 'hard', fallback: 999 });
    }, label);
    await page.waitForTimeout(300);
    const f = path.join(SHOTS, '20261119_图内_' + label + '.png');
    await page.screenshot({ path: f });
    console.log('  截图 ' + f + '（' + verb + '）');
    await page.evaluate(() => SKMiniGame.close());
  }

  ok(errors.length === 0, '零 pageerror' + (errors.length ? '：' + errors.join(' | ') : ''));

  await browser.close();
  console.log('[test-plate] ' + pass + ' 通过 / ' + fail + ' 失败');
  process.exit(fail ? 1 : 0);
})().catch(e => {
  console.error('[test-plate] 异常：' + (e && e.stack || e));
  process.exit(1);
});
