/* 行为夹具导出（PORTING_PROTOCOL §3.1）
 * ------------------------------------------------------------------
 * 由 2.5D 规则唯一真源 `SKV3._t` 探针**运行时导出**，产物落到
 * `3d/spec/fixtures/parity-mechanisms.json`，供 3D `--parityfixture` 无头回放。
 *
 * 覆盖四个非排除项机制（audit:parity 的 4 个 pending）：
 *   · recordFrame  → 首帧结构 / 字段 / 采样口径（_t.frames + G.frames）
 *   · replayData   → 8 字段包结构（_t.replay）
 *   · sabTick      → 目标引爆后的 dmg / sabTarget / sabUsed（_t.sabTick + _t.dmg）
 *   · envNotice    → 全船广播的过滤条件、证据字段、alert 增量（damageRoom 连带触发）
 *
 * 用法：node 3d/tools/export-parity-fixtures.cjs
 * 环境：复用主仓 node_modules/playwright-core + 本机 Edge（与 simdump.cjs 同一姿势）。
 * 注意：只改浏览器内存里的 G，不写 2.5D 仓库任何文件。
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = path.resolve(__dirname, '..', '..');          // 新返航录 3D 版
const MAIN = path.resolve(ROOT, '..', '新返航录');          // 2.5D 真源
const OUT = path.join(ROOT, '3d', 'spec', 'fixtures', 'parity-mechanisms.json');
const URL = 'file:///' + MAIN.replace(/\\/g, '/') + '/index.html?test';

let chromium;
try {
  ({ chromium } = require(path.join(MAIN, 'node_modules', 'playwright-core')));
} catch (e) {
  console.error('playwright-core 不可用（主仓需已 npm install）：' + e.message);
  process.exit(1);
}

(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  page.on('pageerror', (e) => console.error('PAGEERROR', e.message));
  await page.goto(URL);
  await page.click('[data-role="spect"]');
  await page.click('#home-go');
  await page.waitForFunction(
    () => window.SKV3 && SKV3._t && SKV3._t.assets().base,
    null, { timeout: 40000 });
  await page.waitForTimeout(300);

  const data = await page.evaluate(() => {
    const t = SKV3._t;
    const G = t.G();
    const out = {};

    /* ---- A. recordFrame / replayData：开局首帧已经在 ---- */
    const f0 = (G.frames || [])[0] || null;
    out.record_frame = {
      frame_count: t.frames(),
      frame_keys: f0 ? Object.keys(f0) : [],
      p_entry_len: f0 && f0.p && f0.p[0] ? f0.p[0].length : 0,
      p_entry_count: f0 && f0.p ? f0.p.length : 0,
      n: f0 ? f0.n : null,
      pt: f0 ? f0.pt : null,
      first_p_entry: f0 && f0.p ? f0.p[0] : null,
    };
    const rp = t.replay();
    out.replay_data = {
      keys: Object.keys(rp),
      v: rp.v,
      game: rp.game,
      map_keys: Object.keys(rp.map || {}),
      map: rp.map,
      result_keys: Object.keys(rp.result || {}),
      result: rp.result,
      roster_len: (rp.roster || []).length,
      roster_keys: rp.roster && rp.roster[0] ? Object.keys(rp.roster[0]) : [],
      events_is_array: Array.isArray(rp.events),
      frames_is_array: Array.isArray(rp.frames),
    };

    /* ---- B. sabTick + envNotice('fault')：同一次 damageRoom 连带触发 ---- */
    const me = G.me;
    const before = {
      dmg: t.dmg().length,
      alert: G.agents.map((a) => (a.mind && a.mind.alert) || 0),
      mem: G.agents.map((a) => (a.mind && a.mind.mem ? a.mind.mem.length : 0)),
    };
    // 造一个「玩家异形、活着、本夜未用过、夜钟未到」的受控输入；
    // 目标设备坐标就放在玩家脚下，命中 sabTick 的 `hypot(me-t)<SAB_RANGE` 分支。
    G.over = false;
    G.designMode = false;
    G.t = 100;
    me.alien = true;
    me.alive = true;
    me.downed = false;
    me.detained = false;
    me.sabUsed = false;

    const candidates = ['power', 'engine', 'med', 'ecosys', 'transit', 'fun',
      'armory', 'warehouse', 'cam', 'reactor', 'lab', 'comm'];
    let used_room = null;
    for (const rid of candidates) {
      G.sabTarget = { room: rid, x: me.x, y: me.y, label: 'fixture' };
      t.sabTick();
      if (t.dmg().length > before.dmg) { used_room = rid; break; }
    }
    out.sab_tick = {
      room: used_room,
      dmg_before: before.dmg,
      dmg_after: t.dmg().length,
      sabTarget_after: G.sabTarget,
      sabUsed_after: me.sabUsed,
      dmg0: t.dmg()[0] || null,
    };

    // envNotice('fault', sp.x, sp.y, 0.55) 由 damageRoom 内部触发：
    // 只给 alive && !downed && !detained 的 agent 写 mem，并按 conf*0.35 提 alert。
    out.env_notice_fault = {
      kind: 'env_fault',
      conf: 0.55,
      alert_gain: 0.55 * 0.35,
      agents: G.agents.map((a, i) => {
        const mem = (a.mind && a.mind.mem) || [];
        const evs = mem.filter((e) => e && e.kind === 'env_fault');
        return {
          i: a.i,
          alive: !!a.alive,
          downed: !!a.downed,
          detained: !!a.detained,
          env_count: evs.length,
          ev: evs.length ? evs[evs.length - 1] : null,
          mem_before: before.mem[i],
          mem_after: mem.length,
          alert_before: before.alert[i],
          alert_after: (a.mind && a.mind.alert) || 0,
          noise: (a.mind && a.mind.noise) || null,
        };
      }),
    };
    return out;
  });

  await browser.close();

  const fixture = {
    schema_version: 1,
    generated_at: new Date().toISOString(),
    source: '2.5D js/game.js via SKV3._t (Edge headless, index.html?test)',
    src_refs: {
      sabTick: 'js/game.js:1297',
      recordFrame: 'js/game.js:1410',
      replayData: 'js/game.js:1426',
      envNotice: 'js/game.js:1848',
      evPush: 'js/t2/ai.js:325-338',
      constants: 'js/game.js:1400 / js/t2/ai.js:192',
    },
    cases: data,
  };
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify(fixture, null, 2) + '\n', 'utf8');
  const sha = crypto.createHash('sha256').update(fs.readFileSync(OUT)).digest('hex');
  console.log('FIXTURE_OK ' + OUT);
  console.log('  sha256=' + sha.slice(0, 16));
  console.log('  sabTick.room=' + data.sab_tick.room +
    ' dmg=' + data.sab_tick.dmg_before + '->' + data.sab_tick.dmg_after +
    ' sabUsed=' + data.sab_tick.sabUsed_after);
  console.log('  env_fault agents=' + data.env_notice_fault.agents.length +
    ' written=' + data.env_notice_fault.agents.filter((a) => a.env_count > 0).length);
  console.log('  frames=' + data.record_frame.frame_count +
    ' replayKeys=' + data.replay_data.keys.length);
})().catch((e) => {
  console.error('FIXTURE_FAIL ' + e.message);
  process.exit(1);
});
