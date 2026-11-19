/* 双分模型 P0 影子体检（2026-11-19）
 * 只读：跑 N 局 simGame，比较「旧 sus 的 #1 怀疑对象」与「影子 T 的 #1 怀疑对象」是否一致。
 * 这不是投票分歧率，只是最小可用的基线；真正的投票/开枪分歧率在 P0b 用会议快照统计。
 * 用法：node tools/trust-shadow.cjs [局数=20]
 * 产物只打印到 stdout，不落仓。
 */
const path = require('path');
const { chromium } = require('playwright-core');
const DIR = path.resolve(__dirname, '..');
const URL = 'file:///' + DIR.replace(/\\/g, '/') + '/index.html?test';
const N = Math.max(1, +(process.argv[2] || 20));

(async () => {
  const b = await chromium.launch({ channel: 'msedge', headless: true });
  const p = await b.newPage({ viewport: { width: 1280, height: 800 } });
  const errs = [];
  p.on('pageerror', e => errs.push(String(e)));
  await p.goto(URL);
  await p.waitForTimeout(700);
  let ready = await p.evaluate(() => !!(window.SKV3 && window.SKV3._t));
  if (!ready) {
    await p.evaluate(() => { const x = document.getElementById('home-go'); if (x) x.click(); });
    for (let i = 0; i < 24 && !ready; i++) {
      await p.waitForTimeout(250);
      ready = await p.evaluate(() => !!(window.SKV3 && window.SKV3._t));
    }
  }
  if (!ready) throw new Error('SKV3._t not ready');

  let pairs = 0, diff = 0, skipped = 0;
  const per = [];
  for (let g = 0; g < N; g++) {
    const seed = (20261119 + g) >>> 0;
    await p.evaluate(o => SKV3._t.simGame(o),
      { seed, dt: 0.1, maxNights: 15 });
    const rows = await p.evaluate(() => {
      const t = SKV3._t, G = t.G(), out = [];
      for (const a of G.agents) {
        if (a.alien || !a.alive) continue;
        const m = t.mind(a.i);
        if (!m) continue;
        const targets = G.agents.filter(x => x.alive && !x.downed && x !== a);
        let old = null, os = -1;
        for (const x of targets) {
          const s = (m.sus && m.sus[x.i]) || 0;
          if (s > os) { os = s; old = x.i; }
        }
        let neu = null, nh = 2;
        for (const x of targets) {
          const sh = t.trustShadow(a.i, x.i);
          if (sh && sh.h < nh) { nh = sh.h; neu = x.i; }
        }
        out.push({ a: a.i, old, neu, os: +os.toFixed(2), nh: +nh.toFixed(2) });
      }
      return out;
    });
    let gd = 0, gp = 0;
    for (const r of rows) {
      if (r.old == null || r.neu == null || r.os <= 0) { skipped++; continue; }
      gp++; pairs++;
      if (r.old !== r.neu) { gd++; diff++; }
    }
    per.push({ seed, pairs: gp, diff: gd });
  }

  const rate = pairs ? (diff / pairs * 100) : 0;
  console.log(JSON.stringify({
    games: N, pairs, diff, skipped,
    diffRate: +rate.toFixed(1) + '%',
    perGame: per,
    pageErrors: errs
  }, null, 2));
  await b.close();
})().catch(e => { console.error(e); process.exit(1); });
