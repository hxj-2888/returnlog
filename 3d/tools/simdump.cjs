/* 2.5D 事件流导出（同 seed 对照夹具的 JS 侧）
 * ------------------------------------------------------------------
 * 用法：node 3d/tools/simdump.cjs --seed 20261108 [--out <file>]
 *
 * 与 tools/monte-carlo.cjs 同一套启动姿势：Edge headless 打开 index.html?test，
 * 选旁观者进局，调 SKV3._t.simGame（真实 update / AI / 会议逻辑），
 * 再把 SKV3._t.events() 的完整事件流落盘。
 *
 * 下游：`$GODOT --headless --path 3d/preview -- --simdiff <file>`
 *
 * ⚠ 规则与推理/发言已同源（见 MIGRATION.md §10）；夹具验「信封字段 / kind 词表 /
 * 夜数 / 胜负原因」这些契约，并把首个分歧点列出来。逐条差异目前来自维度、
 * 随机流与 parity-map.json#pending 模块，pending 补完后应逐步收敛。
 */
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright-core');

const ROOT = path.resolve(__dirname, '..', '..');
const URL = 'file:///' + ROOT.replace(/\\/g, '/') + '/index.html?test';
const arg = (k, d) => {
  const i = process.argv.indexOf('--' + k);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : d;
};
const SEED = (parseInt(arg('seed', '20261108'), 10) || 20261108) >>> 0;
const DT = Math.max(0.05, Math.min(0.2, parseFloat(arg('dt', '0.1')) || 0.1));
const MAX_NIGHTS = Math.max(1, parseInt(arg('max-nights', '15'), 10) || 15);
const OUT = path.resolve(arg('out', path.join(__dirname, '..', 'reports', `js-simdump-${SEED}.json`)));

(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  page.on('pageerror', e => console.error('PAGEERROR', e.message));
  await page.goto(URL);
  await page.click('[data-role="spect"]');
  await page.click('#home-go');
  await page.waitForFunction(() => window.SKV3 && SKV3._t && SKV3._t.assets().base,
    null, { timeout: 30000 });
  await page.waitForTimeout(350);
  const data = await page.evaluate(o => {
    const r = SKV3._t.simGame({ seed: o.seed, dt: o.dt, maxNights: o.maxNights });
    let ev = [];
    try { ev = SKV3._t.events(); } catch (e) { ev = []; }
    return {
      winner: r && r.winner, why: r && r.why,
      nights: r && r.nights, events: ev,
    };
  }, { seed: SEED, dt: DT, maxNights: MAX_NIGHTS });
  await browser.close();

  const out = {
    schema_version: 1,
    source: '2.5D js/game.js#logEvent via SKV3._t.simGame',
    seed: SEED, dt: DT, max_nights: MAX_NIGHTS,
    winner: data.winner || '', why: data.why || '',
    event_count: (data.events || []).length,
    events: data.events || [],
  };
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify(out, null, 2) + '\n', 'utf8');
  const kinds = [...new Set(out.events.map(e => e.kind).filter(Boolean))].sort();
  console.log('SIMDUMP ' + OUT);
  console.log(`  seed=${SEED} dt=${DT} maxNights=${MAX_NIGHTS} 事件 ${out.event_count} 条 / ${kinds.length} kind`);
  console.log('  kind: ' + kinds.join(', '));
  console.log(`  结局：${out.winner || '?'} · ${out.why || ''}`);
})().catch(e => { console.error(e); process.exit(1); });
