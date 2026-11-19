/* 会议发言体检（2026-11-18 · R13.9 / R13.10 反同质化判据工具）
 * 为什么要有这个脚本：门禁能断言"排期规则成立"，断言不了"玩家听到的话是不是变实了"。
 * 这里跑 n 局**同 seed 完整模拟对局**（`_t.simSpeechBatch`，走真实夜晚与真实证据链），
 * 统计含人名 / 含舱室 / 实质推理 / 自述开头占比 / 话轮集中度 / 分桶，改前改后各跑一次即可对比。
 * 与 `tools/track-ai*.cjs` 同一类：只读体检工具，产物不落仓。
 * 用法： node tools/survey-speech.cjs [局数=40]
 * 已知基线（2026-11-18，40 局 / 6,819 条）：含人名 89.0% · 含舱室 71.7% ·
 *   实质推理 33.6% · 自述开头 29.5% · 前 5 人话轮 38.8% · 异形份额 27.3%。
 * 读数口径：发言"变多"不等于"变实"，看分桶里的推理密度，不要只看总条数；
 *   而推理密度又被"零证据就弃权"这条裁定封顶 —— 要抬它只能扩证据面，不能放开弃权。 */
const path = require('path');
const { chromium } = require(process.env.PLAYWRIGHT_CORE || 'playwright-core');
const DIR = path.resolve(__dirname, '..');
const URL = 'file:///' + DIR.replace(/\\/g, '/') + '/index.html?test';
const N = +(process.argv[2] || 40);

(async () => {
  const b = await chromium.launch({ channel: 'msedge', headless: true });
  const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
  p.on('pageerror', e => console.log('PAGEERROR', e.message));
  await p.goto(URL);
  await p.waitForTimeout(700);
  await p.click('#home-go');
  await p.waitForFunction(() => window.SKV3 && SKV3._t && SKV3._t.assets().base, { timeout: 60000 });
  const r = await p.evaluate(n => {
    const t = SKV3._t;
    const G = t.G();
    const names = G.agents.map(a => a.name);
    const rooms = (window.SKMapData.rooms || []).map(x => x.name);
    const rows = t.simSpeechBatch(n).filter(l => !l.sep && !l.sys && l.text);
    const REASON = /(看见|目击|确证|基本确定|我投|怀疑|对不上|没看见|证据|记仇|救过|带节奏|跟我)/;
    /* 分桶：先看"话变多"到底是哪一类在涨，再决定改哪里 */
    const B = { accuse: 0, sight: 0, alibi: 0, confront: 0, leader: 0, follow: 0,
      vouch: 0, other: 0 };
    const stat = {
      games: n, lines: rows.length, named: 0, roomed: 0, reason: 0,
      alien: 0, human: 0, byWho: {}, uniq: new Set(), pairKinds: new Set(),
      stemAlibi: 0, samples: []
    };
    for (const l of rows) {
      const txt = String(l.text);
      if (/我投|建议(投|出|缓)|先出|那就先问/.test(txt)) B.accuse++;
      else if (/看见|目击|撞见|碰见|同一条线|能印证|为我作|我认得/.test(txt)) B.sight++;
      else if (/^我(昨晚|今晚|刚才|昨天|现在|整晚|这轮|这边)|我在|还是我/.test(txt)) B.alibi++;
      else if (/改口|对不上|你说你|为什么正好|上次你报/.test(txt)) B.confront++;
      else if (/跟我|到.去|别乱跑|先.后|按我说的|附议|方向是/.test(txt)) B.leader++;
      else if (/赞成|同意|不反对|我也/.test(txt)) B.follow++;
      else if (/替他说话|保他|不是异形|别投|先别|吻合/.test(txt)) B.vouch++;
      else {
        B.other++;
        /* 「其他」榜：按骨架频次排队，看清稀释源到底是哪些句式 */
        B._other = B._other || {};
        const key = txt.replace(/[一-龥]{2,3}/g, '#').slice(0, 30);
        const e = B._other[key] || (B._other[key] = {n: 0, eg: txt.slice(0, 42)});
        e.n++;
      }
      if (l.alien) stat.alien++; else if (l.alien === false) stat.human++;
      if (names.some(x => x !== l.who && txt.indexOf(x) >= 0)) stat.named++;
      if (rooms.some(x => txt.indexOf(x) >= 0)) stat.roomed++;
      if (REASON.test(txt)) stat.reason++;
      if (/^我(昨晚|今晚|刚才|昨天|现在|整晚)/.test(txt)) stat.stemAlibi++;
      stat.byWho[l.who] = (stat.byWho[l.who] || 0) + 1;
      stat.uniq.add(txt);
      /* 句式指纹：抹掉人名/舱室/任务名之后的骨架，用来量"结构同质"而不是字面重复 */
      stat.pairKinds.add(txt.replace(/[一-龥]{2,4}(?=，|。|、|说|，你)/g, '#'));
      if (stat.samples.length < 14 && Math.random() < 0.06) stat.samples.push(l.who + '：' + txt);
    }
    const order = Object.keys(stat.byWho).sort((a, b2) => stat.byWho[b2] - stat.byWho[a]);
    const top5 = order.slice(0, 5).reduce((s, k) => s + stat.byWho[k], 0);
    return {
      games: stat.games, lines: stat.lines, named: stat.named, roomed: stat.roomed,
      reason: stat.reason, alien: stat.alien, human: stat.human,
      uniq: stat.uniq.size, skeleton: stat.pairKinds.size,
      buckets: B,
      alibiShare: +(stat.stemAlibi / (stat.lines || 1)).toFixed(3),
      top5share: +(top5 / (stat.lines || 1)).toFixed(3),
      speakers: order.length, samples: stat.samples
    };
  }, N);
  const L = r.lines || 1;
  console.log('===== 发言同质化读数（' + r.games + ' 局模拟 · ' + r.lines + ' 条台词 · ' +
    r.speakers + ' 个说话人）=====');
  console.log('含人名       ' + (r.named / L * 100).toFixed(1) + '%');
  console.log('含舱室       ' + (r.roomed / L * 100).toFixed(1) + '%');
  console.log('实质推理     ' + (r.reason / L * 100).toFixed(1) + '%   ← 目标：显著抬升');
  console.log('自述开头占比 ' + (r.alibiShare * 100).toFixed(1) + '%   ← 目标：压下来');
  console.log('整句去重     ' + (r.uniq / L * 100).toFixed(1) + '%（字面是否重复）');
  console.log('骨架去重     ' + (r.skeleton / L * 100).toFixed(1) + '%（结构是否重复，越低越同质）');
  console.log('前 5 人话轮占比 ' + (r.top5share * 100).toFixed(1) + '%');
  console.log('异形发言份额 ' + (r.alien / ((r.alien + r.human) || 1) * 100).toFixed(1) + '%');
  const bk = r.buckets || {}, per = k => (bk[k] / r.games).toFixed(1);
  console.log('\n--- 分桶（每局平均条数）---');
  ['accuse', 'sight', 'confront', 'vouch', 'alibi', 'leader', 'follow', 'other'].forEach(k =>
    console.log('  ' + k.padEnd(9) + ' ' + String(per(k)).padStart(5) +
      '   占总量 ' + ((bk[k] / L) * 100).toFixed(1) + '%'));
  console.log('  ⇒ 推理密度（accuse+sight+confront+vouch / 每局）= ' +
    ((bk.accuse + bk.sight + bk.confront + bk.vouch) / r.games).toFixed(1) +
      ' 条，占 ' + (((bk.accuse + bk.sight + bk.confront + bk.vouch) / L) * 100).toFixed(1) + '%');
  const ot = Object.entries(bk._other || {}).sort((a, b) => b[1].n - a[1].n).slice(0, 22);
  console.log('\n--- 「其他」骨架榜（前 22，条数 / 每局 / 例句）---');
  ot.forEach(([k, v]) => console.log('  ' + String((v.n / r.games).toFixed(1)).padStart(5) +
    '  ' + (v.n + '').padStart(5) + '  ' + v.eg));
  console.log('\n--- 抽样 ---');
  r.samples.forEach(s => console.log('  ' + s));
  await b.close();
})().catch(e => { console.log('ERR', e.message); process.exit(1); });
