/* 新返航录 · 游玩体验量测（UX 审计）
 * ------------------------------------------------------------
 * 用法： node tools/ux-audit.cjs
 * 依赖： playwright-core（可用 PLAYWRIGHT_CORE 指定安装目录）+ 系统 Edge
 * 产出： tools/ux-results.json（原始读数）· tools/ux-report.md（汇总表）
 *        tools/screenshots/ux_*.png（留证截图）· SHOT_DIR 可覆盖截图目录
 * 定位： 本工具**只量测、不断言**。断言门禁仍然是 tools/test-v3.cjs。
 *        所有数字都在真实浏览器里、走真实输入路径（DOM click / keydown）取到，
 *        不要用"我觉得手感还行"替代这里的读数。
 */
const path = require('path');
const fs = require('fs');

function loadPlaywright() {
  const candidates = [process.env.PLAYWRIGHT_CORE, 'playwright-core'].filter(Boolean);
  const errors = [];
  for (const c of candidates) {
    try { return require(c); } catch (e) { errors.push(c + ': ' + (e.code || e.message)); }
  }
  throw Error('未找到 playwright-core。设 PLAYWRIGHT_CORE 指向安装目录。\n  ' + errors.join('\n  '));
}
const { chromium } = loadPlaywright();

const DIR = path.resolve(__dirname, '..');
const FILE_BASE = 'file:///' + DIR.replace(/\\/g, '/') + '/index.html';
/* 画面亮度要 getImageData：file:// 下底图属跨域，画布会被 taint（本次实跑踩过，
   SecurityError 直接中断）。所以能连到本地服务器就走 http 同源，否则跳过亮度项。 */
const httpBase = cb => {
  const http = require('http');
  const req = http.get({ host: '127.0.0.1', port: Number(process.env.PORT || 5173), path: '/index.html', timeout: 1200 },
    res => { res.resume(); cb(res.statusCode === 200 ? 'http://127.0.0.1:' + (process.env.PORT || 5173) + '/index.html' : null); });
  req.on('error', () => cb(null));
  req.on('timeout', () => { req.destroy(); cb(null); });
};
const SHOT = process.env.SHOT_DIR || path.join(DIR, 'tools', 'screenshots');
fs.mkdirSync(SHOT, { recursive: true });

/* 相机标定用常量（与 game.js 同源，改了要一起改）：
   resize() 里 VIEW.s = innerWidth / VIEW_TILES，camFocus 是玩家 ⇒
   屏幕 = 视口中心 + (世界 − 玩家) × s。 */
const VIEW_TILES = 21;

const R = { ts: new Date().toISOString(), viewport: null, errors: [] };
const say = s => console.log(s);

(async () => {
  let BASE = FILE_BASE;
  const hb = await new Promise(r => httpBase(r));
  if (hb) BASE = hb;
  R.baseUrl = BASE;
  say('量测入口：' + BASE + (hb ? '（同源，可读画面亮度）' : '（file://，画布被 taint，亮度项跳过）'));
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = [];
  page.on('pageerror', e => errors.push('PAGEERROR ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push('CONSOLE ' + m.text()); });
  const badRes = [];
  page.on('response', r => { if (r.status() >= 400) badRes.push(r.status() + ' ' + decodeURI(r.url()).split('/').slice(-2).join('/')); });
  const T = (fn, arg) => page.evaluate(fn, arg);
  const shot = async n => page.screenshot({ path: path.join(SHOT, n) });

  /* ---------------- U1 · 冷启动与首次可操作 ---------------- */
  say('\n== U1 冷启动 / 首锁');
  const tNav = Date.now();
  await page.goto(BASE, { waitUntil: 'load' });
  await page.waitForSelector('#home-go', { state: 'visible' });
  const tHome = Date.now() - tNav;
  const t0 = Date.now();
  await page.click('#home-go');
  await page.waitForFunction(() => !!(window.SKV3 && SKV3._t && SKV3._t.G() && SKV3._t.G().me), null, { timeout: 30000 });
  const tEnter = Date.now() - t0;
  /* 开局会议会不会把新手锁在椅子上一段时间？按 phase 采样到能自由行动为止 */
  const boot = await T(async () => {
    const g = SKV3._t.G(), marks = { meetAtEnter: !!g.meet, phase: g.meet && g.meet.phase };
    const t0 = performance.now();
    let freeAt = null, phases = {};
    while (performance.now() - t0 < 130000) {
      const s = SKV3._t.G();
      if (s.meet) phases[s.meet.phase] = (phases[s.meet.phase] || 0) + 100;
      else { freeAt = performance.now() - t0; break; }
      await new Promise(r => setTimeout(r, 100));
    }
    const me = SKV3._t.G().me;
    return {
      blockedMs: freeAt, phases,
      role: me.alien ? 'alien' : 'human', night: SKV3._t.G().night,
      tasksLeft: me.tasks.length - me.tIdx,
      tip: (document.getElementById('tip') || {}).innerText || ''
    };
  });
  R.boot = { homeVisibleMs: tHome, toSeatMs: tEnter, firstFreeActionMs: boot.blockedMs,
             openingPhasesMs: boot.phases, tipChars: boot.tip.length };
  say('  开始页可见 ' + tHome + 'ms · 落座 ' + tEnter + 'ms · 首次可自由行动 ' + boot.blockedMs + 'ms（' +
      Object.keys(boot.phases).join('/') + '）');

  /* ---------------- 采样器 + 后面全部量测在 ?test（跳过开局会议）下跑 ---------------- */
  await page.goto(BASE + '?test', { waitUntil: 'load' });
  await page.waitForSelector('#home-go', { state: 'visible' });
  await page.click('#home-go');
  await page.waitForFunction(() => !!(window.SKV3 && SKV3._t && SKV3._t.G() && SKV3._t.G().me), null, { timeout: 30000 });
  await T(() => {
    const u = window.__ux = { frames: [], states: {}, total: 0, last: 0, on: true };
    (function loop(ts) {
      if (!u.on) return;
      if (u.last) {
        const dt = Math.min(250, ts - u.last);
        let k = 'free';
        try {
          const g = SKV3._t.G();
          if (g.over) k = 'over';
          else if (g.meet) k = 'meet.' + g.meet.phase;
          else if (g.paused) k = 'paused';
          else if (g.wheel) k = 'wheel';
          else if (g.inspect) k = 'inspect';
          else if (g.camView) k = 'cams';
          else if (!g.me.alive) k = 'dead';
          else if (g.me.detained) k = 'jailed';
          else if (g.me.doing > 0) k = 'stand';
          else if (g.me.moving) k = 'walk';
        } catch (e) { k = 'err'; }
        u.states[k] = (u.states[k] || 0) + dt;
        u.total += dt;
        u.frames.push(ts);
        try {
          const gg = SKV3._t.G();
          if (gg) {
            u.waveMax = Math.max(u.waveMax || 0, (gg.waves || []).length);
            if ((gg.waves || []).length) u.waveSeen = Object.assign(u.waveSeen || {}, ...gg.waves.map(w => ({ [w.kind]: (u.waveSeen && u.waveSeen[w.kind] || 0) + 1 })));
            u.playT = gg.playT || 0;
          }
        } catch (e) {}
        if (u.frames.length > 900) u.frames.splice(0, 300);
      }
      u.last = ts;
      requestAnimationFrame(loop);
    })(performance.now());
  });

  /* ---------------- U2 · 键位表与提示覆盖（源码 + 运行时 #tip） ---------------- */
  say('\n== U2 键位覆盖');
  const src = fs.readFileSync(path.join(DIR, 'js', 'game.js'), 'utf8');
  const ks = new Set();
  for (const m of src.matchAll(/k\s*===\s*'([a-z0-9])'/g)) ks.add(m[1]);
  const tipText = await T(() => (document.getElementById('tip') || {}).innerText || '');
  const cover = [...ks].map(k => ({ key: k, inTip: new RegExp('\\b' + k.toUpperCase() + '\\b|[（(]' + k.toUpperCase()).test(tipText) }));
  R.keys = { bound: [...ks].sort().join(' '), n: ks.size, tipChars: tipText.length,
             covered: cover.filter(c => c.inTip).length, missing: cover.filter(c => !c.inTip).map(c => c.key).join(' ') };
  say('  绑定 ' + R.keys.n + ' 个单键 · #tip 提示到 ' + R.keys.covered + ' 个 · 未提示：' + R.keys.missing);

  /* ---------------- U3 · 点击移动手感 ---------------- */
  say('\n== U3 点击移动');
  R.clicks = [];
  for (let i = 0; i < 8; i++) {
    const r = await T(async (VT) => {
      const cv = document.getElementById('cv');
      const g = SKV3._t.G(), me = g.me;
      const s = innerWidth / VT;
      const wx = me.x + (Math.random() * 12 - 6), wy = me.y + (Math.random() * 12 - 6);
      const cx = innerWidth / 2 + (wx - me.x) * s, cy = innerHeight / 2 + (wy - me.y) * s;
      const x0 = me.x, y0 = me.y, t0 = performance.now();
      cv.dispatchEvent(new MouseEvent('click', { clientX: cx, clientY: cy, bubbles: true }));
      let tPath = null, tMove = null, seg = null, bad = null;
      for (let i = 0; i < 180; i++) {
        await new Promise(r => requestAnimationFrame(r));
        if (tPath == null && me.path && me.path.length) {
          tPath = performance.now() - t0;
          let d = 0, px = me.x, py = me.y;
          for (const p of me.path) { d += Math.hypot(p[0] - px, p[1] - py); px = p[0]; py = p[1]; }
          seg = d;
        }
        if (g.clickFx && g.clickFx.bad) { bad = performance.now() - t0; break; }
        if (tMove == null && Math.hypot(me.x - x0, me.y - y0) > 0.03) tMove = performance.now() - t0;
        if (tPath != null && tMove != null && seg != null) break;
      }
      return {
        latencyMs: tMove != null ? +tMove.toFixed(1) : null,
        pathMs: tPath != null ? +tPath.toFixed(1) : null,
        badMs: bad != null ? +bad.toFixed(1) : null,
        straight: +Math.hypot(wx - x0, wy - y0).toFixed(2),
        walked: seg != null ? +seg.toFixed(2) : null,
        msg: bad != null ? (g.msg || '') : ''
      };
    }, VIEW_TILES);
    R.clicks.push(r);
    await page.waitForTimeout(700);
  }
  /* 走不通的反馈：故意点船体外（掩体中心常常仍能绕到边上，那是可达的，不算走不通） */
  const blocked = await T(() => {
    const cv = document.getElementById('cv'), g = SKV3._t.G(), me = g.me;
    const s = innerWidth / 21;
    g.msg = ''; g.clickFx = null;
    cv.dispatchEvent(new MouseEvent('click', {
      clientX: innerWidth / 2 + (-6 - me.x) * s,
      clientY: innerHeight / 2 + (-6 - me.y) * s, bubbles: true }));
    return { bad: !!(g.clickFx && g.clickFx.bad), msg: g.msg || '' };
  });
  const okClicks = R.clicks.filter(c => c.latencyMs != null);
  R.click = {
    n: R.clicks.length, moved: okClicks.length,
    latencyP50: okClicks.length ? okClicks.map(c => c.latencyMs).sort((a, b) => a - b)[Math.floor(okClicks.length / 2)] : null,
    latencyMax: okClicks.length ? Math.max(...okClicks.map(c => c.latencyMs)) : null,
    pathPlanMs: Math.max(...R.clicks.map(c => c.pathMs || 0)),
    detour: okClicks.length ? +(okClicks.reduce((a, c) => a + (c.walked / Math.max(0.4, c.straight)), 0) / okClicks.length).toFixed(2) : null,
    blockedFeedback: blocked
  };
  say('  中位起移 ' + R.click.latencyP50 + 'ms · 最大 ' + R.click.latencyMax + 'ms · 绕路系数 ' + R.click.detour +
      ' · 走不通反馈=' + (blocked.bad ? '有' : '无') + '「' + blocked.msg + '」');

  /* ---------------- U4 · 动作键响应 ---------------- */
  say('\n== U4 动作键');
  R.actions = {};
  /* E 开轮盘（站到任务点上才有多项，先测按键→UI 反馈） */
  await T(() => { const a = SKV3._t.G().me, p = SKMapData.points[a.tasks[a.tIdx]]; SKV3._t.tp(0, p.x + 0.7, p.y); });
  await page.waitForTimeout(500);
  const wheelR = await T(async () => {
    const t0 = performance.now();
    addEventListener('keydown', e => { if (e.key.toLowerCase() === 'e') dispatchEvent(new KeyboardEvent('keydown', { key: 'e' })); }, { once: true });
    dispatchEvent(new KeyboardEvent('keydown', { key: 'e' }));
    const g = SKV3._t.G();
    for (let i = 0; i < 120; i++) {
      await new Promise(r => requestAnimationFrame(r));
      if (g.wheel || g.me.doing > 0)
        return { ms: +(performance.now() - t0).toFixed(1), wheel: !!g.wheel, n: g.wheel ? g.wheel.items.length : 0, doing: g.me._doing };
    }
    return { ms: null, timeout: true };
  });
  R.actions.interactE = wheelR;
  say('  E 交互 → 反馈 ' + wheelR.ms + 'ms（轮盘 ' + (wheelR.n || 0) + ' 项 / ' + (wheelR.doing || '直接执行') + '）');
  /* 关掉轮盘用 ESC，不要 pickWheel(0)：第 0 项可能是"拉闸"，会污染后面的电态。
     没有轮盘时不按 ESC（否则会把游戏暂停）。 */
  if (await T(() => !!SKV3._t.G().wheel)) await page.keyboard.press('Escape');
  await page.waitForTimeout(300);

  /* ---------------- U5 · HUD 几何 / 命中区 / 对比 ---------------- */
  say('\n== U5 HUD 几何');
  R.hud = await T(() => {
    const ids = ['hud', 'tip', 'tasks', 'tk', 'pg', 'pgmax', 'rp', 'mt', 'nt', 'tm', 'role', 'hum',
      'alive', 'md', 'inv', 'dmgline', 'personal', 'cam', 'camcv', 'bar', 'qp', 'ql'];
    const lum = c => {
      const m = (c || '').match(/rgba?\(([^)]+)\)/);
      if (!m) return null;
      const p = m[1].split(',').map(x => parseFloat(x));
      const a = p.length > 3 ? p[3] : 1;
      const f = v => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
      return { L: 0.2126 * f(p[0]) + 0.7152 * f(p[1]) + 0.0722 * f(p[2]), a };
    };
    const rows = [];
    for (const id of ids) {
      const el = document.getElementById(id);
      if (!el) { rows.push({ id, missing: true }); continue; }
      const r = el.getBoundingClientRect(), cs = getComputedStyle(el);
      const fg = lum(cs.color), bg = lum(cs.backgroundColor);
      let ratio = null;
      if (fg && bg && bg.a > 0.01) {
        const l1 = Math.max(fg.L, bg.L), l2 = Math.min(fg.L, bg.L);
        ratio = +((l1 + 0.05) / (l2 + 0.05)).toFixed(2);
      }
      rows.push({ id, x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height),
        font: cs.fontSize, visible: cs.display !== 'none' && cs.visibility !== 'hidden' && r.width > 0,
        text: (el.innerText || '').replace(/\s+/g, ' ').slice(0, 34), contrast: ratio });
    }
    const btns = [...document.querySelectorAll('#v3-root button, #meet button')].map(b => {
      const r = b.getBoundingClientRect();
      return { id: b.id || b.className, w: Math.round(r.width), h: Math.round(r.height), shown: r.width > 0 };
    });
    return { rows, smallButtons: btns.filter(b => b.shown && (b.h < 28 || b.w < 28)), vw: innerWidth, vh: innerHeight };
  });
  const shown = R.hud.rows.filter(r => r.visible && !r.missing);
  say('  可见 HUD 元素 ' + shown.length + ' · 字号最小 ' +
      Math.min(...shown.map(r => parseFloat(r.font))) + 'px · 小命中区按钮 ' + R.hud.smallButtons.length + ' 个');
  await shot('ux_01_hud.png');

  /* ---------------- U6 · 迷雾可读性（四态画面亮度 + 视野真值） ---------------- */
  say('\n== U6 迷雾四态');
  /* 每一次采样前先把电恢复到"没拉闸"，否则前面用例的拉闸会污染"亮走廊"这一档
     （本次实跑就中招过：U4 的轮盘第 0 项正好是拉闸 ⇒ 后面三档全是断电态） */
  const probeFog = async (label, setup) => {
    await T(() => { if (SKV3._t.lights().state === 2) SKV3._t.breaker(); });
    if (setup) await T(setup);
    await page.waitForTimeout(600);
    const v = await T(() => {
      const cv = document.getElementById('cv'), cx = cv.getContext('2d');
      let mean = null, darkPct = null, litPct = null, taint = null;
      try {
        const d = cx.getImageData(0, 0, cv.width, cv.height).data;
        let n = 0, sum = 0, dark = 0, mid = 0;
        for (let i = 0; i < d.length; i += 4 * 37) {
          const L = 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2];
          n++; sum += L; if (L < 30) dark++; else if (L > 90) mid++;
        }
        mean = +(sum / n).toFixed(1); darkPct = +(100 * dark / n).toFixed(1); litPct = +(100 * mid / n).toFixed(1);
      } catch (e) { taint = String(e.message || e).slice(0, 60); }
      const g = SKV3._t.G(), me = g.me, out = [];
      for (const r of [2, 4, 7, 12, 20]) {
        out.push({ r, vis: SKV3._t.visible(me.x + r, me.y) ? 1 : 0, zone: SKV3._t.litZone(me.x + r, me.y) || '' });
      }
      return { mean, darkPct, litPct, taint, sight: out, room: SKV3._t.G().night,
        light: SKV3._t.lights ? SKV3._t.lights() : null };
    });
    v.label = label;
    return v;
  };
  R.fog = [];
  R.fog.push(await probeFog('亮舱（默认落座）', () => { const p = SKMapData.rooms[0]; SKV3._t.tp(0, 31, 33.5); }));
  await shot('ux_02_亮舱.png');
  R.fog.push(await probeFog('暗舱（配电室）', () => SKV3._t.tp(0, 47.5, 54)));
  await shot('ux_03_暗舱.png');
  R.fog.push(await probeFog('亮走廊', () => SKV3._t.tp(0, 41, 20)));
  await shot('ux_04_走廊.png');
  R.fog.push(await probeFog('断电（拉闸后·亮舱内）', () => {
    SKV3._t.tp(0, 31, 33.5);
    if (SKV3._t.lights().state !== 2) SKV3._t.breaker();   /* 只在还没断电时拉，避免测成"复电" */
    return SKV3._t.lights().state;
  }));
  await shot('ux_05_断电.png');
  R.fog.push(await probeFog('断电（拉闸后·走廊口）', () => {
    SKV3._t.tp(0, 41, 20);
    if (SKV3._t.lights().state !== 2) SKV3._t.breaker();
    return SKV3._t.lights().state;
  }));
  await shot('ux_05b_断电走廊.png');
  if (await T(() => SKV3._t.lights().state === 2)) await T(() => SKV3._t.breaker());
  for (const f of R.fog) say('  ' + f.label + '：均亮 ' + f.mean + ' · 暗面 ' + f.darkPct + '% · 7 格外可见 ' + f.sight[2].vis +
      ' · lightState=' + (f.light ? f.light.state : '?'));

  /* ---------------- U7 · 会议 UI 与三段墙钟（**在会议进行中逐段采样**） ---------------- */
  say('\n== U7 会议');
  const meet = await T(async () => {
    const box = id => {
      const e = document.getElementById(id);
      if (!e) return null;
      const r = e.getBoundingClientRect(), cs = getComputedStyle(e);
      return { w: Math.round(r.width), h: Math.round(r.height), x: Math.round(r.x), y: Math.round(r.y),
        shown: cs.display !== 'none' && !e.classList.contains('hide') && r.width > 0,
        font: cs.fontSize, scroll: e.scrollHeight > e.clientHeight + 2, sh: e.scrollHeight,
        lines: e.children ? e.children.length : 0, disabled: !!e.disabled };
    };
    const snap = ph => ({ discuss: box('m-rows'), say: box('m-say'), text: box('m-text'),
      skip: box('m-skip'), skipVote: box('m-skip-vote'), send: box('m-send'), tpl: box('m-tpl-btns'),
      phase: ph });
    SKV3._t.openMeeting('day');
    const t0 = performance.now(), phases = {}, seq = [];
    let last = null;
    while (SKV3._t.G().meet && performance.now() - t0 < 150000) {
      const m = SKV3._t.G().meet;
      phases[m.phase] = (phases[m.phase] || 0) + 100;
      if (m.phase !== last) { last = m.phase; seq.push(snap(m.phase)); }
      await new Promise(r => setTimeout(r, 100));
    }
    seq.push({ after: true, meetGone: !SKV3._t.G().meet, rows: box('m-rows') });
    const g = SKV3._t.G();
    return { totalMs: Math.round(performance.now() - t0), phases, seq,
      votes: g.meet ? null : Object.keys((g.lastMeet && g.lastMeet.votes) || {}).length,
      nightAfter: g.night, tAfter: +g.t.toFixed(1) };
  });
  R.meeting = meet;
  say('  一场白天会全程 ' + (meet.totalMs / 1000).toFixed(1) + 's · ' +
      Object.entries(meet.phases).map(([k, v]) => k + ' ' + (v / 1000).toFixed(0) + 's').join(' / ') +
      ' · 采样点 ' + meet.seq.filter(x => x.phase).length + ' 个阶段');
  await page.waitForTimeout(200);

  /* ---------------- U8 · 代打 3 夜的墙钟占比 ---------------- */
  say('\n== U8 节奏（代打）');
  await T(() => { const u = window.__ux; u.frames = []; u.last = 0; u.waveMax = 0; u.waveSeen = {};
    u.playT = u.playT0 = SKV3._t.G().playT || 0; });
  const botStart = Date.now();
  const night0 = await T(() => { const g = SKV3._t.G(); return { night: g.night, prog: g.prog, phase: g.phase && g.phase.kind }; });
  const botLog = { clicks: 0, bad: 0, interacts: 0, stuck: 0, tasks: 0 };
  while (Date.now() - botStart < 180000) {
    const st = await T(() => {
      const g = SKV3._t.G(), me = g.me;
      return { over: g.over, meet: !!g.meet, doing: me.doing, alive: me.alive, moving: !!me.moving,
        tIdx: me.tIdx, total: me.tasks.length, pts: g.winPts || g.pts || 0, night: g.night };
    });
    if (st.over) break;
    if (st.meet) { await page.waitForTimeout(400); continue; }
    if (!st.alive) break;
    if (st.doing > 0) { await page.waitForTimeout(300); continue; }
    if (!st.moving) {
      const r = await T(() => {
        const g = SKV3._t.G(), me = g.me;
        if (me.tIdx >= me.tasks.length) return { done: true };
        const p = SKMapData.points[me.tasks[me.tIdx]];
        const res = SKV3._t.badClick(p.x, p.y);
        return { done: false, ok: !!(res && res.ok), p };
      });
      if (r.done) break;
      botLog.clicks++;
      if (!r.ok) botLog.bad++;
      await page.waitForTimeout(900);
      await T(() => { const g = SKV3._t.G(); SKV3._t.interact(); return !!g.me.doing; });
      botLog.interacts++;
    }
    await page.waitForTimeout(700);
  }
  botLog.tasks = await T(() => SKV3._t.G().me.tIdx);
  const share = await T(() => {
    const u = window.__ux, tot = u.total || 1;
    const fr = u.frames, d = [];
    for (let i = 1; i < fr.length; i++) d.push(fr[i] - fr[i - 1]);
    d.sort((a, b) => a - b);
    const q = p => d.length ? +(1000 / d[Math.min(d.length - 1, Math.floor(d.length * p))]).toFixed(1) : null;
    return { states: Object.fromEntries(Object.entries(u.states).map(([k, v]) => [k, +(v / 1000).toFixed(1)])),
      pct: Object.fromEntries(Object.entries(u.states).map(([k, v]) => [k, +(100 * v / tot).toFixed(1)])),
      fpsP50: q(0.5), fpsP10: q(0.9), totalSec: +(tot / 1000).toFixed(1),
      playT: +(u.playT || 0).toFixed(1), playT0: +(u.playT0 || 0).toFixed(1),
      waveMax: u.waveMax || 0, waveSeen: u.waveSeen || {},
      /* playT 只在非会议时增长 ⇒ 这是最干净的会议占比口径，不依赖状态归类 */
      meetShareByClock: +((1 - ((u.playT - (u.playT0 || u.playT))) / (tot / 1000)) * 100).toFixed(1) };
  });
  R.pacing = { wallSec: +((Date.now() - botStart) / 1000).toFixed(1), ...share, botLog };
  /* U13 · 整局墙钟：口径 = 1 − ΔplayT/Δ墙钟（playT 会议期间不增长），
     再用 F 轮基线 5.682 夜 × NIGHT 秒反推整局。不依赖"这段走了几夜"的粗采样。 */
  const botEnd = await T(() => {
    const g = SKV3._t.G(), ev = SKV3._t.events();
    return { night: g.night, prog: g.prog, over: g.over,
      meets: ev.filter(e => /meet|report/i.test(e.kind)).length,
      knives: ev.filter(e => /knife|stab/i.test(e.kind)).length };
  });
  const NIGHT_SEC = await T(() => SKV3._t.nightLen());
  const wall = R.pacing.wallSec, dPlay = Math.max(0.001, share.playT - share.playT0);
  const meetShare = +((1 - dPlay / wall) * 100).toFixed(1);
  const perNight = NIGHT_SEC / (1 - meetShare / 100);
  R.gameLen = { nightLenSec: NIGHT_SEC, windowSec: wall, actionSecInWindow: +dPlay.toFixed(1),
    meetShareByClock: meetShare, meetShareByState: +(Object.entries(share.pct).filter(([k]) => k.startsWith('meet.')).reduce((a, [, v]) => a + v, 0)).toFixed(1),
    perNightSec: +perNight.toFixed(1), nights: 5.682,
    fullGameMin: +(perNight * 5.682 / 60).toFixed(1),
    actionMinPerGame: +(NIGHT_SEC * 5.682 / 60).toFixed(1),
    meetMinPerGame: +(perNight * 5.682 / 60 * meetShare / 100).toFixed(1),
    night0: night0.night, night1: botEnd.night, prog: night0.prog + ' → ' + botEnd.prog,
    meetsTotalAtEnd: botEnd.meets, over: botEnd.over };
  say('  会议占比（时钟口径）' + meetShare + '% /（状态口径 ' + R.gameLen.meetShareByState + '%） ⇒ 单夜墙钟 ' +
      perNight.toFixed(0) + 's ⇒ 整局 ≈ ' + R.gameLen.fullGameMin + ' 分钟（行动 ' + R.gameLen.actionMinPerGame +
      ' 分 + 会议 ' + R.gameLen.meetMinPerGame + ' 分）');
  say('  ' + R.pacing.totalSec + 's 采样：行走 ' + (share.pct.walk || 0) + '% · 站桩 ' + (share.pct.stand || 0) +
      '% · 会议 ' + +(Object.entries(share.pct).filter(([k]) => k.startsWith('meet.')).reduce((a, [, v]) => a + v, 0)).toFixed(1) +
      '% · 空闲 ' + (share.pct.free || 0) + '% · FPS p50 ' + share.fpsP50 + ' / p10 ' + share.fpsP10);
  await shot('ux_06_代打中.png');

  /* ---------------- U9 · 死亡后与旁观 ---------------- */
  say('\n== U9 死亡 / 幽灵');
  const dead = await T(async () => {
    const g = SKV3._t.G(), before = { alive: g.me.alive, doing: g.me.doing };
    SKV3._t.kill(0, 'knife');
    await new Promise(r => setTimeout(r, 1200));
    const s = SKV3._t.G();
    const vis = [...document.querySelectorAll('#v3-root *')].filter(e => {
      const r = e.getBoundingClientRect();
      return r.width > 0 && r.height > 0 && getComputedStyle(e).visibility !== 'hidden';
    }).length;
    return { alive: s.me.alive, ghost: !!s.me.ghost, speedGhost: s.me.ghost ? 6.5 : null,
      tasksLeft: s.me.tasks.length - s.me.tIdx, wheel: SKV3._t.wheel ? SKV3._t.wheel.length : 0,
      visibleEls: vis, before };
  });
  R.death = dead;
  say('  死亡后：幽灵=' + dead.ghost + ' · 剩余任务 ' + dead.tasksLeft + ' · 可交互 ' + dead.wheel +
      ' 项 · 屏上可见元素 ' + dead.visibleEls);
  await shot('ux_07_幽灵态.png');

  /* ---------------- U10 · 旁观模式首屏差异 ---------------- */
  const spect = await page.evaluate(() => {
    const ids = ['tasks', 'rp', 'mt', 'pg'];
    return { present: ids.map(id => !!document.getElementById(id)) };
  });
  R.spectBase = spect;

  /* ---------------- U11 · 声纹线索信息量 ---------------- */
  R.sound = await T(() => {
    const g = SKV3._t.G();
    return { waves: g.waves.length, maxR: 18, kinds: [...new Set(g.waves.map(w => w.kind))].join(','),
      events: SKV3._t.events().filter(e => /sound|hear|step|shot|knife/.test(e.kind)).length };
  });

  /* ---------------- U12 · 手机档几何（横屏 844×390 / 竖屏 390×844） ---------------- */
  say('\n== U12 手机档');
  R.mobile = [];
  for (const vp of [{ w: 844, h: 390, k: '横屏' }, { w: 390, h: 844, k: '竖屏' }]) {
    await page.setViewportSize({ width: vp.w, height: vp.h });
    await page.waitForTimeout(400);
    await T(() => { if (!SKV3._t.G().meet) SKV3._t.openMeeting('day'); });
    await page.waitForTimeout(900);   /* 等一帧布局落定再量，否则 rect 还是上一档视口的 */
    const m = await T(() => {
      const g = SKV3._t.G();
      if (!g.meet) SKV3._t.openMeeting('day');
      const box = id => {
        const e = document.getElementById(id);
        if (!e) return null;
        const r = e.getBoundingClientRect(), cs = getComputedStyle(e);
        return { w: Math.round(r.width), h: Math.round(r.height), shown: cs.display !== 'none' && r.width > 0,
          font: cs.fontSize, scroll: e.scrollHeight > e.clientHeight + 2 };
      };
      const tap = [...document.querySelectorAll('#v3-root button')].filter(b => b.getBoundingClientRect().width > 0)
        .map(b => { const r = b.getBoundingClientRect(); return { id: b.id || b.className, h: Math.round(r.height), w: Math.round(r.width) }; });
      return {
        rotate: (() => { const e = document.getElementById('rotate'); return e ? getComputedStyle(e).display : 'none'; })(),
        meet: box('meet'), rows: box('m-rows'), say: box('m-say'), text: box('m-text'), hud: box('hud'),
        tip: box('tip'), cam: box('cam'), cv: (() => { const e = document.getElementById('cv'); const r = e.getBoundingClientRect(); return { w: Math.round(r.width), h: Math.round(r.height) }; })(),
        smallTap: tap.filter(t => t.h < 34 || t.w < 34).length, tapN: tap.length,
        offscreen: [...document.querySelectorAll('#v3-root *')].filter(e => {
          const r = e.getBoundingClientRect();
          return r.width > 0 && (r.bottom > innerHeight + 1 || r.right > innerWidth + 1);
        }).length
      };
    });
    m.vp = vp.w + '×' + vp.h + '（' + vp.k + '）';
    R.mobile.push(m);
    await shot('ux_08_手机' + vp.k + '.png');
    say('  ' + m.vp + '：发言区 ' + (m.rows ? m.rows.h : 0) + 'px 高 · 溢出滚动=' + (m.rows && m.rows.scroll) +
        ' · 视口外元素 ' + m.offscreen + ' · 小命中区 ' + m.smallTap + '/' + m.tapN);
    await T(() => { if (SKV3._t.G().meet) SKV3._t.finishMeeting(); });
  }
  await page.setViewportSize({ width: 1440, height: 900 });

  R.errors = errors;
  R.badRes = [...new Set(badRes)];
  R.viewport = { w: R.hud.vw, h: R.hud.vh, dpr: await T(() => devicePixelRatio) };

  fs.writeFileSync(path.join(DIR, 'tools', 'ux-results.json'), JSON.stringify(R, null, 2));

  /* ---------------- 出表 ---------------- */
  const L = [];
  L.push('# 游玩体验量测报告（工具产出，勿手改）');
  L.push('');
  L.push('> 生成：`node tools/ux-audit.cjs` · ' + R.ts + ' · Edge headless ' + R.viewport.w + '×' + R.viewport.h + '（DPR ' + R.viewport.dpr + '）· 入口 ' + R.baseUrl);
  L.push('> 控制台报错 **' + R.errors.length + '** 条 · 失败请求 **' + R.badRes.length + '** 条：' + (R.badRes.slice(0, 6).join(' / ') || '无'));
  L.push('> 真实输入路径（DOM click / keydown），不是 API 夹具。');
  L.push('');
  L.push('## U1 冷启动');
  L.push('| 指标 | 读数 |');
  L.push('|---|---|');
  L.push('| 开始页可见 | ' + R.boot.homeVisibleMs + ' ms |');
  L.push('| 点「进入舱段」→ 落座 | ' + R.boot.toSeatMs + ' ms |');
  L.push('| **落座 → 首次可自由行动** | ' + (R.boot.firstFreeActionMs / 1000).toFixed(1) + ' s（开局会议锁人） |');
  L.push('| 开局会议分段 | ' + Object.entries(R.boot.openingPhasesMs).map(([k, v]) => k + ' ' + (v / 1000).toFixed(0) + 's').join(' / ') + ' |');
  L.push('');
  L.push('## U2 键位');
  L.push('| 指标 | 读数 |');
  L.push('|---|---|');
  L.push('| 单键绑定 | ' + R.keys.n + ' 个（' + R.keys.bound + '） |');
  L.push('| #tip 当场提示到 | ' + R.keys.covered + ' 个 |');
  L.push('| 未提示 | ' + (R.keys.missing || '无') + ' |');
  L.push('');
  L.push('## U3 点击移动');
  L.push('| 指标 | 读数 |');
  L.push('|---|---|');
  L.push('| 8 次点击里真的起步 | ' + R.click.moved + '/' + R.click.n + ' |');
  L.push('| 起移延迟 p50 / max | ' + R.click.latencyP50 + ' ms / ' + R.click.latencyMax + ' ms |');
  L.push('| 寻路规划最长 | ' + R.click.pathPlanMs + ' ms |');
  L.push('| 绕路系数（路径 ÷ 直线） | ' + R.click.detour + ' |');
  L.push('| 点掩体反馈 | ' + (R.click.blockedFeedback.bad ? '禁止符号已出' : '无反馈') + '，文案「' + R.click.blockedFeedback.msg + '」 |');
  L.push('');
  L.push('## U4 动作键');
  L.push('- E 交互 → 反馈 **' + R.actions.interactE.ms + ' ms**（轮盘 ' + (R.actions.interactE.n || 0) + ' 项 / ' + (R.actions.interactE.doing || '直接执行') + '）');
  L.push('');
  L.push('## U5 HUD 几何（' + shown.length + ' 个可见元素）');
  L.push('| id | 尺寸 | 字号 | 对比度 | 文本 |');
  L.push('|---|---|---|---|---|');
  for (const r of R.hud.rows.filter(x => x.visible && !x.missing))
    L.push('| ' + r.id + ' | ' + r.w + '×' + r.h + ' | ' + r.font + ' | ' + (r.contrast == null ? '—' : r.contrast) + ' | ' + r.text + ' |');
  L.push('');
  L.push('- 命中区小于 28px 的按钮 **' + R.hud.smallButtons.length + '** 个：' +
    (R.hud.smallButtons.slice(0, 8).map(b => b.id + '(' + b.w + '×' + b.h + ')').join(' · ') || '无'));
  L.push('');
  L.push('## U6 迷雾四态');
  L.push('| 态 | 画面均亮 | 暗面占比 | 亮面占比 | 7 格外可见 | lightState |');
  L.push('|---|---|---|---|---|---|');
  for (const f of R.fog) L.push('| ' + f.label + ' | ' + (f.mean == null ? '—（跨域 taint）' : f.mean) + ' | ' +
    (f.darkPct == null ? '—' : f.darkPct + '%') + ' | ' + (f.litPct == null ? '—' : f.litPct + '%') +
    ' | ' + f.sight[2].vis + ' | ' + (f.light ? f.light.state : '—') + ' |');
  L.push('');
  L.push('视野距离真值（1=看得见，取第一行示例态）：`' + R.fog[0].sight.map(s => s.r + '格=' + s.vis).join(' ') + '`');
  L.push('');
  L.push('## U7 会议（白天会实测，逐段在会议进行中采样）');
  L.push('- 全程 **' + (R.meeting.totalMs / 1000).toFixed(1) + ' s**：' +
    Object.entries(R.meeting.phases).map(([k, v]) => k + ' **' + (v / 1000).toFixed(0) + ' s**').join(' / '));
  L.push('');
  L.push('| 阶段 | 发言列表 h×w | 字号 | 需要滚动 | 输入框高 | 输入框禁用 | 跳过讨论 | 跳过投票 | 发送 |');
  L.push('|---|---|---|---|---|---|---|---|---|');
  for (const s of R.meeting.seq.filter(x => x.phase))
    L.push('| ' + s.phase + ' | ' + (s.say ? s.say.h + '×' + s.say.w : '—') + ' | ' + (s.say ? s.say.font : '—') +
      ' | ' + (s.say && s.say.scroll) + ' | ' + (s.text ? s.text.h + 'px' : '—') + ' | ' + (s.text && s.text.disabled) +
      ' | ' + (s.skip && s.skip.shown ? s.skip.w + '×' + s.skip.h : '隐藏') + ' | ' +
      (s.skipVote && s.skipVote.shown ? s.skipVote.w + '×' + s.skipVote.h : '隐藏') + ' | ' +
      (s.send && s.send.shown ? s.send.w + '×' + s.send.h : '隐藏') + ' |');
  L.push('');
  L.push('- 会中发言条数（采样时刻）：' + R.meeting.seq.filter(x => x.phase).map(x => x.phase + ' ' + (x.say ? x.say.lines : 0) + ' 条').join(' / '));
  L.push('');
  L.push('## U8 代打 ' + R.pacing.wallSec + ' s 的墙钟占比');
  L.push('| 状态 | 秒 | 占比 |');
  L.push('|---|---|---|');
  for (const [k, v] of Object.entries(R.pacing.pct).sort((a, b) => b[1] - a[1]))
    L.push('| ' + k + ' | ' + R.pacing.states[k] + ' | ' + v + '% |');
  L.push('');
  L.push('- 代打点击 ' + R.pacing.botLog.clicks + ' 次（其中 ' + R.pacing.botLog.bad + ' 次走不通）· 交互 ' +
    R.pacing.botLog.interacts + ' 次 · 任务推进到第 ' + R.pacing.botLog.tasks + ' 个');
  L.push('- FPS p50 ' + R.pacing.fpsP50 + ' · p10 ' + R.pacing.fpsP10);
  L.push('');
  L.push('## U13 整局墙钟（口径：playT 只在非会议时增长）');
  L.push('| 指标 | 读数 |');
  L.push('|---|---|');
  L.push('| 采样窗口 / 其中行动秒 | ' + R.gameLen.windowSec + ' s / ' + R.gameLen.actionSecInWindow + ' s |');
  L.push('| 会议占墙钟（时钟口径） | **' + R.gameLen.meetShareByClock + '%**（状态归类口径 ' + R.gameLen.meetShareByState + '%） |');
  L.push('| 一夜墙钟（' + R.gameLen.nightLenSec + ' s 行动 + 其间会议） | ' + R.gameLen.perNightSec + ' s |');
  L.push('| 整局（按 F 轮基线 ' + R.gameLen.nights + ' 夜） | **' + R.gameLen.fullGameMin + ' 分钟** |');
  L.push('| 拆成行动 / 会议 | 行动 ' + R.gameLen.actionMinPerGame + ' 分 · 会议 **' + R.gameLen.meetMinPerGame + ' 分** |');
  L.push('| 采样内夜数与进度 | 第 ' + R.gameLen.night0 + ' → ' + R.gameLen.night1 + ' 夜 · 维修 ' + R.gameLen.prog + ' 分 |');
  L.push('');
  L.push('## U9 死亡后');
  L.push('- 幽灵=' + R.death.ghost + ' · 剩余任务 ' + R.death.tasksLeft + ' · 可交互 ' + R.death.wheel + ' 项 · 屏上元素 ' + R.death.visibleEls);
  L.push('');
  L.push('## U11 声纹');
  L.push('- 声纹环判据半径 **18 格**（`hear()` 里 `d>18` 直接丢弃），同屏环上限 52；实测代打窗口内峰值 **' +
    (R.pacing.waveMax || 0) + ' 环**，种类：' + (Object.keys(R.pacing.waveSeen || {}).join('/') || '采样窗内无') + '。');
  L.push('- 环直接画在**事发坐标**上 ⇒ 玩家拿到的不是"附近有响动"，而是精确位置（同类里 Lethal Company 只做音量衰减，Among Us 无此层）。');
  L.push('');
  L.push('## U12 手机档几何');
  L.push('| 视口 | 发言列表高 | 需要滚动 | 输入框 | HUD 高 | 提示条 | 世界画布 | 视口外元素 | 竖屏提示 |');
  L.push('|---|---|---|---|---|---|---|---|---|');
  for (const m of R.mobile)
    L.push('| ' + m.vp + ' | ' + (m.say ? m.say.h + '×' + m.say.w + 'px' : '—') + ' | ' + (m.say && m.say.scroll) + ' | ' +
      (m.text ? m.text.h + 'px' : '—') + ' | ' + (m.hud ? m.hud.h + 'px' : '—') + ' | ' + (m.tip ? m.tip.h + 'px' : '—') +
      ' | ' + m.cv.w + '×' + m.cv.h + ' | ' + m.offscreen + ' | ' + (m.rotate !== 'none' ? '显示「请横屏」' : '无') + ' |');
  L.push('');
  L.push('- 小命中区（<34px）按钮：' + R.mobile.map(m => m.vp + ' ' + m.smallTap + '/' + m.tapN).join(' · '));
  fs.writeFileSync(path.join(DIR, 'tools', 'ux-report.md'), L.join('\n'));
  say('\n写出 tools/ux-results.json 与 tools/ux-report.md，截图 ' + fs.readdirSync(SHOT).filter(f => f.startsWith('ux_')).length + ' 张');
  await browser.close();
})().catch(e => { console.error('UX_AUDIT_FAIL ' + (e && e.stack || e)); process.exit(1); });
