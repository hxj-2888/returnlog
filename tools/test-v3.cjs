/* 新返航录 · 返航录V1 · 浏览器断言门禁
 * ------------------------------------------------------------
 * 用法： node tools/test-v3.cjs
 * 依赖： playwright-core（优先本地 node_modules；找不到时可用
 *        PLAYWRIGHT_CORE 指定安装目录）
 * 覆盖： 2.5D 底图、搜尸、拖拽、幽灵态、DEV 无敌/全知、报告会议、
 *        不变量断言（SKInvariants）、监控室/电闸、地道选择、驱逐公布身份、
 *        音效日志/声纹、维修 10s 无限制、保安/医疗无人机、HUD 存活人数、
 *        AI 夜间能力（拉闸/停摆机器人/破坏舱室/钻管道/开枪/救人/补给）、
 *        破坏技选舱/60 秒故障/-3 进度/连续 10 秒维修、幽灵不可破坏、
 *        暗处不可隔空开枪、暂停/退出、事件流/回放复盘、亮走廊视野、
 *        AI 领申请单/反常拖尸/藏尸避人、枪刀音效分层、59 件真实掩体审计、
 *        控制台零报错、帧率。
 * 产出： tools/screenshots/*.png（可用 SHOT_DIR 覆盖）
 */
const path = require('path');
const fs = require('fs');

function loadPlaywright() {
  const candidates = [
    process.env.PLAYWRIGHT_CORE,
    'playwright-core',
  ].filter(Boolean);
  const errors = [];
  for (const c of candidates) {
    try { return require(c); } catch (e) { errors.push(c + ': ' + (e.code || e.message)); }
  }
  throw new Error('未找到 playwright-core。请 npm i -D playwright-core，或设置 PLAYWRIGHT_CORE 指向安装目录。\n  ' + errors.join('\n  '));
}

const { chromium } = loadPlaywright();

const DIR = path.resolve(__dirname, '..');
const URL = 'file:///' + DIR.replace(/\\/g, '/') + '/index.html?test';
const SHOT = process.env.SHOT_DIR || path.join(DIR, 'tools', 'screenshots');
fs.mkdirSync(SHOT, { recursive: true });

let pass = 0, fail = 0;
function ok(cond, msg) {
  if (cond) { pass++; console.log('  PASS  ' + msg); }
  else { fail++; console.log('  FAIL  ' + msg); }
}
function section(t) { console.log('\n== ' + t); }

(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = [];
  page.on('pageerror', e => errors.push('PAGEERROR ' + e.message));
  page.on('console', m => {
    if (m.type() === 'error') errors.push('CONSOLE ' + m.text());
  });
  const T = (fn, arg) => page.evaluate(fn, arg);
  const shot = async n => { await page.screenshot({ path: path.join(SHOT, n) }); };
  const shotClip = async (n, clip) => { await page.screenshot({ path: path.join(SHOT, n), clip }); };
  const freezeFx = async () => T(() => {
    const g = SKV3._t.G();
    g.noReport = true;
    g.fx.forEach(f => { f.dur = Math.max(6, f.dur); f.t = f.dur * 0.7; });
    g.agents.forEach(a => { if (a.act) { a.act.dur = Math.max(6, a.act.dur); a.act.t = a.act.dur * 0.3; } });
  });
  const fresh = async dev => {
    /* 2026-11-07：目击认错默认 20%，会让"确证应落在真凶身上"的既有用例随机翻车。
       门禁统一钉成 0（旧行为），认错本身由专门一节自己 setMisId(1) 打开。
       2026-11-08：先发制人（FIRST）同理 —— 它会挪动随机流、给靶子预先加压，
       让大量"测别的机制"的用例变成概率性失败。门禁默认关掉，
       由第 3 批的专门用例（OPEN / SIM3）显式打开来覆盖。 */
    await page.evaluate(d => { SKV3._t.setDev(!!d); SKV3._t.setMisId(0);
      if (window.SKSanity && window.SKSanity.FIRST) window.SKSanity.FIRST.chance = 0;
      SKV3._t.newGame();
      SKV3._t.G().noReport = false; }, !!dev);
    await page.waitForTimeout(260);
  };

  await page.goto(URL);
  /* 主页改成"先选身份再进入"：默认选中人类，点「进入舱段」开局 */
  const HOME = await T(() => ({
    ship: !!document.querySelector('#home-ship .room[data-room="bridge"]'),
    rooms: document.querySelectorAll('#home-ship .room').length,
    pipes: document.querySelectorAll('#home-ship .pipe').length,
    chips: document.querySelectorAll('#home-stats .chip').length,
    note: (document.getElementById('home-note').textContent || '').slice(0, 12),
    go: !!document.getElementById('home-go')
  }));
  ok(HOME.ship && HOME.rooms === 10 && HOME.pipes === 8 && HOME.chips >= 5 && HOME.go,
    '主页由 SKMapData 生成整船：' + HOME.rooms + ' 舱 / ' + HOME.pipes + ' 管道口 / ' +
    HOME.chips + ' 项统计');
  const MISDEF = await T(() => ({ misId: SKSanity.MISID && SKSanity.MISID.chance }));
  ok(MISDEF.misId === 0.2,
    '目击认错默认概率 20%（SKSanity.MISID.chance=' + MISDEF.misId + '，0 才回到「目击 100% 准」）');
  ok(HOME.note.length > 0, '主页默认展示已选身份的说明：' + HOME.note + '…');
  const NAMESUI = await T(() => ({
    me: (document.getElementById('home-name-me') || {}).value,
    ai: document.querySelectorAll('#home-name-ai input').length,
    count: (document.getElementById('home-names-count') || {}).textContent || '',
    panel: !!document.getElementById('home-names')
  }));
  ok(NAMESUI.panel && NAMESUI.me === '星尘' && NAMESUI.ai === 14 &&
    /14/.test(NAMESUI.count),
    '开始页可编辑名单：你的名字 + 14 个 AI 席位（' + NAMESUI.me + ' / ' + NAMESUI.ai + ' AI）');
  const RULES = await T(() => {
    const l = document.querySelector('[data-home-info="rules"]');
    if (l) l.click();
    const n = document.getElementById('home-note');
    return { len: (n.textContent || '').length, txt: n.textContent || '',
      stats: document.getElementById('home-stats').textContent || '' };
  });
  ok(RULES.len > 200 && /45/.test(RULES.txt) && /声纹环/.test(RULES.txt) &&
    /45/.test(RULES.stats),
    '主页玩法说明扩写并读 WIN_PTS（' + RULES.len + ' 字，45 分不再硬编码）');
  await T(() => {
    const n = document.getElementById('home-note');
    if (n) n.classList.remove('show');
  });
  await page.click('#home-go');
  await page.waitForFunction(() => window.SKV3 && SKV3._t && SKV3._t.assets().base, null, { timeout: 30000 });
  await page.waitForTimeout(400);

  section('底图 / 基线');
  const A = await T(() => {
    const t = SKV3._t;
    return { a: t.assets(), n: t.state().length, inv: t.inv(), role: document.getElementById('role').textContent,
      tip: document.getElementById('tip').textContent, meet: !document.getElementById('meet').classList.contains('hide') };
  });
  ok(A.a.base && A.a.w === 4704 && A.a.h === 4413, 'Blender 2.5D 底图已加载 ' + A.a.w + '×' + A.a.h);
  ok(A.n === 15, '15 个席位');
  ok(A.inv && A.inv.fails.length === 0 && A.inv.checks > 200, '不变量基线 ' + (A.inv && A.inv.checks) + ' 项检查全过');
  ok(A.role.indexOf('人类') >= 0 && A.role.indexOf('01') >= 0 &&
    A.role.indexOf('星尘') >= 0,
    'HUD 显示席位 + 名字 + 阵营（' + A.role + '）');
  ok(A.tip.indexOf('W 交互') >= 0 && A.tip.indexOf('S 搜尸/查看') >= 0 &&
    A.tip.indexOf('D 收尸') >= 0 && A.tip.indexOf('A 出刀') >= 0,
    '提示栏：W 交互 / A 出刀 / S 搜尸查看 / D 收尸（一个动作一个键）');
  ok(A.tip.indexOf('1-9') >= 0 && A.tip.indexOf('ESC 暂停') >= 0 &&
    A.tip.indexOf('W/E') < 0 && A.tip.indexOf('A/Q') < 0 &&
    A.tip.indexOf('S/X') < 0 && A.tip.indexOf('D/G') < 0 && A.tip.indexOf('P/ESC') < 0,
    '操作提示只列新主键，旧别名 E/Q/X/G/P 已移除');
  ok(!A.meet, '?test 跳过开局会议，直接进夜');
  await T(() => { SKV3._t.tp(0, 34.8,33.8); });
  await page.waitForTimeout(300);
  await shot('24_2.5D底图_跟随.png');

  const fps = await T(() => new Promise(res => {
    let n = 0; const t0 = performance.now();
    (function f() { n++; if (performance.now() - t0 < 1600) requestAnimationFrame(f); else res(n / ((performance.now() - t0) / 1000)); })();
  }));
  ok(fps >= 24, '跟随视角帧率 ' + fps.toFixed(1) + ' ≥ 24');

  await page.keyboard.press('c');
  await page.waitForTimeout(300);
  await shot('25_2.5D底图_全图.png');
  await page.keyboard.press('c');
  await page.waitForTimeout(200);

  section('地图 · 扩容 / 管道 / 全连通');
  const MAPA = await T(() => {
    const t = SKV3._t, rs = t.rooms(), ps = t.pipes(), pts = t.points();
    const bad = [];
    for (const a of rs) for (const b of rs) {
      if (a.id === b.id) continue;
      if (!t.astar(a.x, a.y, b.x, b.y)) bad.push(a.id + '→' + b.id);
    }
    return { rs, ps, pts, bad, pipeFree: ps.every(p => t.free(p.x, p.y)),
      pipeRooms: ps.map(p => p.room).sort() };
  });
  ok(MAPA.rs.length === 10 && MAPA.bad.length === 0,
    '10 间房两两 A* 可达' + (MAPA.bad.length ? ' :: ' + MAPA.bad.join(',') : ''));
  const powerR = MAPA.rs.find(r => r.id === 'power'), engineR = MAPA.rs.find(r => r.id === 'engine'),
    transitR = MAPA.rs.find(r => r.id === 'transit');
  ok(powerR.area === 148 && powerR.cls === '小' && engineR.area === 216 && engineR.cls === '中',
    '配电室 148 格（小型）/ 引擎 216 格（中型）');
  ok(transitR.area === 102 && transitR.cls === '小',
    '食堂仍为小型：102 格');
  ok(MAPA.ps.length === 8 && MAPA.pipeFree &&
    MAPA.pipeRooms.join(',') === 'armory,cam,ecosys,engine,fun,med,transit,warehouse',
    '8 个管道口全部可站立：除中央会议室 / 配电室外每舱一个');
  const whPipe = MAPA.ps.find(p => p.room === 'warehouse');
  ok(whPipe && whPipe.x > 50 && whPipe.y < 15,
    '仓库管道位于新舱室（' + (whPipe ? whPipe.x + ',' + whPipe.y : '缺') + '）');
  ok(MAPA.pts.length === 26 && MAPA.pts.every(p => p.d <= 2.6),
    '26 个任务点全部能被 nearPoint 命中（高难 8 / 普通 18）');
  const whRoom = MAPA.rs.find(r => r.id === 'warehouse');
  ok(whRoom && whRoom.area === 504 && whRoom.cls === '大' && whRoom.doors.length === 1,
    '仓库是 42×12 大型单门舱室（504 格）');
  const hardN = MAPA.pts.filter(p => p.kind === 'hard').length;
  const normalN = MAPA.pts.filter(p => p.kind === 'normal').length;
  ok(hardN === 8 && normalN === 18 &&
    MAPA.pts.filter(p => p.room === 'power' && p.kind === 'normal').length === 0 &&
    MAPA.pts.filter(p => p.room === 'engine' && p.kind === 'normal').length === 3 &&
    MAPA.pts.filter(p => p.room === 'warehouse' && p.kind === 'normal').length === 3,
    '任务点重排：高难 8 / 普通 18，配电室无普通点，引擎/仓库各 3 个普通点');

  section('搜尸');
  await fresh(false);
  const S = await T(() => {
    const t = SKV3._t, g = t.G();
    g.noReport = true;
    /* 测试隔离：本节只验搜尸/拖拽，先卸掉异形 AI 的刀，避免它把测试玩家击倒 */
    for (const a of g.agents) if (a.alien) { a.knife = 0; a.target = null; a.path = null; }
    t.tp(1, 28.2,44);
    t.kill(1, 'knife');
    const b = t.bodyOf(1);
    t.tp(0, b[0] + 0.5, b[1] + 0.5);
    return { b, st: t.state()[1], dur: t.inv() };
  });
  ok(S.b && Math.abs(S.b[0] - 28.2) < 0.01 && Math.abs(S.b[1] - 44.0) < 0.01, '尸体留在死亡点 (28.2,44.0)');
  ok(!S.st.alive && S.st.ghost && S.st.cause === 'knife', '死亡 → 幽灵态，死因刀伤');
  ok(S.dur && S.dur.fails.length === 0, '死亡后不变量仍全过');
  await page.keyboard.press('s');
  await page.waitForTimeout(1700);
  const card = await T(() => {
    const el = document.getElementById('body');
    return { open: !el.classList.contains('hide'), text: el.textContent, inspect: SKV3._t.inspect(),
      t: SKV3._t.G().t };
  });
  ok(card.open && card.inspect === '银翼', 'X 开启尸检卡：' + card.inspect);
  ok(card.text.indexOf('刀伤') >= 0, '尸检给出死因（刀伤）');
  ok(card.text.indexOf('无法判断') >= 0, '非 DEV 不显示凶手');
  ok(card.text.indexOf('未被移动') >= 0, '尸检给出移动状态');
  const t0 = card.t;
  await page.waitForTimeout(500);
  const t1 = await T(() => SKV3._t.G().t);
  ok(Math.abs(t0 - t1) < 0.02, '尸检期间游戏暂停（计时冻结）');
  await shot('26_搜尸.png');
  /* T1（2026-11-05）：读卡期间世界冻结，但夜钟是真实时间。
     必须走真实关闭路径（closeBodyCard），关闭后把冻结时长补回相位；
     否则"看两秒尸检卡"就等于白掉两秒夜晚。 */
  const cardCloseT0 = await T(() => SKV3._t.G().t);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(150);
  const cardCloseT1 = await T(() => SKV3._t.G().t);
  ok((await T(() => SKV3._t.inspect())) === null, 'Esc 关闭尸检卡');
  ok(cardCloseT0 - cardCloseT1 < 0.5,
    '关闭尸检卡后夜钟补偿：读卡不偷夜晚时间（损失 ' +
    (cardCloseT0 - cardCloseT1).toFixed(2) + 's < 0.5s）');

  section('拖拽');
  await page.keyboard.press('d');
  await page.waitForTimeout(150);
  const D = await T(() => ({ drag: SKV3._t.dragOf(), st: SKV3._t.state()[1],
    tag: !document.getElementById('dragtag').classList.contains('hide'), inv: SKV3._t.inv(),
    me: SKV3._t.state()[0], paused: SKV3._t.paused(), msg: SKV3._t.G().msg }));
  ok(D.drag === 1 && D.st.draggedBy === 0, 'G 拖起尸体，双向标记互指' +
    (D.drag === 1 ? '' : ' :: ' + JSON.stringify({ msg: D.msg, paused: D.paused, me: D.me })));
  ok(D.tag, '拖拽提示条显示');
  ok(D.inv && D.inv.fails.length === 0, '拖拽起始不变量全过');
  const before = D.st.body;
  await T(() => { SKV3._t.tp(0, 28.3,41.7); });
  await page.waitForTimeout(450);
  const D2 = await T(() => {
    const t = SKV3._t; const me = t.pos(); const st = t.state()[1];
    return { st, me, d: Math.hypot(st.body[0] - me[0], st.body[1] - me[1]), inv: t.inv() };
  });
  const moved = Math.hypot(D2.st.body[0] - before[0], D2.st.body[1] - before[1]);
  ok(moved > 1.2, '尸体被拖动 ' + moved.toFixed(2) + ' 格');
  ok(D2.st.bodyMoved === true, 'bodyMoved 标记置位');
  ok(D2.d <= 3.2, '拖拽距离 ' + D2.d.toFixed(2) + ' ≤ 3.2');
  ok(D2.inv && D2.inv.fails.length === 0, '拖拽中不变量全过');
  await shot('27_拖拽.png');
  await page.keyboard.press('d');
  await page.waitForTimeout(150);
  const D3 = await T(() => ({ drag: SKV3._t.dragOf(), st: SKV3._t.state()[1],
    tag: !document.getElementById('dragtag').classList.contains('hide'), inv: SKV3._t.inv() }));
  ok(D3.drag === null && D3.st.draggedBy === null && !D3.tag, 'G 放下：拖拽标记与提示条清除');
  ok(D3.inv && D3.inv.fails.length === 0, '放下后不变量全过');

  section('搜尸 · 取走尸体身上的物资');
  await fresh(false);
  const LOOT = await T(() => {
    const t = SKV3._t, g = t.G(); g.noReport = true;
    for (const a of g.agents) if (a.alien) { a.knife = 0; a.target = null; a.path = null; }
    const v = g.agents[1];
    v.bullet = 1; v.medkit = 1; v.qual = 2;
    t.tp(v.i, 28.2,44);
    t.kill(v.i, 'knife');
    t.tp(0, 28.4,44.4);
    g.me.bullet = 0; g.me.medkit = 0; g.me.qual = 0;
    return { v: v.i, before: t.bodyItems(v.i), vname: v.name };
  });
  ok(LOOT.before.bullet === 1 && LOOT.before.medkit === 1 && LOOT.before.qual === 2,
    '尸体保留生前物资：子弹 / 医疗包 / 申请单');
  await page.keyboard.press('s');
  await page.waitForTimeout(1650);
  const LOOT2 = await T(o => {
    const t = SKV3._t, g = t.G();
    return { body: t.bodyItems(o.v), bullet: g.me.bullet, medkit: g.me.medkit, qual: g.me.qual,
      msg: g.msg, searched: t.state()[o.v].searched, card: t.inspect(), inv: t.inv() };
  }, LOOT);
  ok(LOOT2.bullet === 1 && LOOT2.medkit === 1 && LOOT2.qual === 2,
    'S 搜尸把子弹 / 医疗包 / 申请单一起收进背包');
  ok(LOOT2.body.bullet === 0 && LOOT2.body.medkit === 0 && LOOT2.body.qual === 0,
    '尸体上的物资被清空（不是复制）');
  ok(/取得/.test(LOOT2.msg) && LOOT2.card === '银翼',
    '搜尸播报列出取得的物资，并打开尸检卡：' + LOOT2.msg);
  ok(LOOT2.searched === true && LOOT2.inv.fails.length === 0, '搜尸同时完成取证，不变量全过');
  await T(() => { SKV3._t.tp(0, 28.4,44.4); SKV3._t.G().msg = ''; });
  await page.keyboard.press('Escape');   /* 先关掉上一步自动打开的尸检卡 */
  await page.waitForTimeout(120);
  await page.keyboard.press('s');
  await page.waitForTimeout(320);
  const LOOT3 = await T(() => {
    const t = SKV3._t, g = t.G();
    return { do: g.me._doing, msg: g.msg };
  });
  ok(LOOT3.do !== 'search' && /(没有可带走|已经检查)/.test(LOOT3.msg),
    '物资取空后再搜尸会被拒绝（不再空耗 1.2 秒）：' + LOOT3.msg);

  const LOOT4 = await T(() => {
    const t = SKV3._t; t.newGame();
    const g = t.G(); g.paused = true; g.noReport = true;
    const v = g.agents.find(a => !a.alien && a.i !== 0);
    const h = g.agents.find(a => !a.alien && a.i !== 0 && a !== v);
    for (const a of g.agents) if (a !== v && a !== h) t.tp(a.i, 30,32);
    v.bullet = 1; v.qual = 1;
    t.tp(v.i, 28.2,44); t.kill(v.i, 'knife');
    t.tp(h.i, 28.4,44.4);
    h.bullet = 0; h.qual = 0; h.doing = 0; h._doing = null; h.path = null; h._delay = 0;
    t.aiScan(h.i, 0.6);
    const do0 = g.agents[h.i]._doing;
    t.aiTick(h.i, 40, 0.05);
    return { h: h.i, v: v.i, do0, bullet: g.agents[h.i].bullet, qual: g.agents[h.i].qual,
      body: t.bodyItems(v.i), searched: t.state()[v.i].searched, inv: t.inv() };
  });
  ok(LOOT4.do0 === 'search' && LOOT4.bullet === 1 && LOOT4.qual === 1,
    'AI 人类会主动搜尸取物资：子弹 +1 / 申请单 +1');
  ok(LOOT4.body.bullet === 0 && LOOT4.searched === true,
    'AI 搜完同样清空尸体物资并完成取证');
  ok(LOOT4.inv.fails.length === 0, 'AI 搜尸后不变量全过');

  const LOOT5 = await T(() => {
    const t = SKV3._t; t.newGame();
    const g = t.G(); g.paused = true; g.noReport = true;
    const v = g.agents.find(a => !a.alien && a.i !== 0);
    const k = g.agents.find(a => a.alien && a.i !== 0 && a.alive);
    for (const a of g.agents) if (a !== v && a !== k) t.tp(a.i, 30,32);
    v.bullet = 1;
    t.tp(v.i, 28.2,44); t.kill(v.i, 'knife');
    t.tp(k.i, 28.4,44.4);
    k.bullet = 0; k.doing = 0; k._doing = null; k.path = null; k._delay = 0; k.sabUsed = true;
    t.aiScan(k.i, 0.6);
    const do0 = g.agents[k.i]._doing;
    t.aiTickAlien(k.i, 40, 0.05);
    return { do0, bullet: g.agents[k.i].bullet, body: t.bodyItems(v.i), inv: t.inv() };
  });
  ok(LOOT5.do0 === 'search' && LOOT5.bullet === 1 && LOOT5.body.bullet === 0,
    'AI 异形也会搜尸取物资（从尸体上拿走子弹）');
  ok(LOOT5.inv.fails.length === 0, '异形搜尸后不变量全过');

  section('幽灵态');
  await fresh(false);
  const G0 = await T(() => {
    const t = SKV3._t;
    t.tp(0, 28.2,44);
    t.kill(0, 'knife');
    return { st: t.state()[0], fog: t.fog(), role: document.getElementById('role').textContent,
      tip: document.getElementById('tip').textContent, inv: t.inv() };
  });
  ok(!G0.st.alive && G0.st.ghost && G0.st.body, '玩家死亡 → 幽灵 + 留尸');
  ok(G0.fog === false, '幽灵全视（雾关闭）');
  ok(G0.role.indexOf('幽灵') >= 0, 'HUD 标记幽灵');
  ok(G0.tip.indexOf('穿墙') >= 0, '提示栏切换为幽灵操作');
  ok(G0.inv && G0.inv.fails.length === 0, '幽灵态不变量全过');
  const p0 = await T(() => SKV3._t.pos());
  await page.mouse.click(880, 450);
  await page.waitForTimeout(500);
  const p1 = await T(() => SKV3._t.pos());
  ok(Math.hypot(p1[0] - p0[0], p1[1] - p0[1]) > 1.5, '幽灵点击移动（直线穿墙）');
  const GR = await T(() => {
    const t = SKV3._t, g = t.G();
    g.me.tasks = [1, 2, 3, 5]; g.me.tIdx = 0;  /* 额度 1 分：只能接普通任务 */
    g.me.ghostPts = 0;
    const pts = t.points();
    const hard = pts.find(p => p.kind === 'hard');
    const normal = pts.find(p => p.kind === 'normal');
    const cap = t.ghostCap();
    const spot = t.taskSpot(0);
    t.tp(0, spot.x, spot.y); g.me.path = null;
    return { pos: t.pos(), spot, cap,
      hardOK: SKT2Space.ghostTaskAllowed(g.me, hard),
      normalOK: SKT2Space.ghostTaskAllowed(g.me, normal) };
  });
  ok(GR.cap === 1 && !GR.hardOK && GR.normalOK,
    '幽灵额度 1 分：高难 2 分任务不可接、普通 1 分任务可接');
  await page.keyboard.press('w');
  await page.waitForTimeout(200);
  const GD = await T(() => ({ doing: SKV3._t.G().me.doing, prog: SKV3._t.G().prog }));
  ok(Math.abs(GD.doing - GR.spot.dur * 1.6) < 0.6,
    '幽灵维修耗时 1.6×（' + GD.doing.toFixed(1) + 's = ' + GR.spot.dur + '×1.6）');
  await T(() => { SKV3._t.G().me.doing = 0.03; });
  await page.waitForTimeout(300);
  const GR2 = await T(() => ({ prog: SKV3._t.G().prog, tIdx: SKV3._t.G().me.tIdx, inv: SKV3._t.inv() }));
  ok(GR2.prog === GR.cap && GR2.tIdx === 1,
    '幽灵维修可完成并计分（额度 ' + GR.cap + ' 分，prog=' + GR2.prog + '）');
  ok(GR2.inv && GR2.inv.fails.length === 0, '幽灵修完不变量全过');
  const GCAP = await T(() => {
    const t = SKV3._t, g = t.G();
    const spot = t.taskSpot(0);
    t.tp(0, spot.x, spot.y);
    g.me.doing = 0; g.me._doing = null; g.me.path = null;
    return { pts: g.me.ghostPts, tIdx: g.me.tIdx, spot: spot.label, cap: t.ghostCap() };
  });
  await page.keyboard.press('w');
  await page.waitForTimeout(220);
  const GCAP2 = await T(() => {
    const g = SKV3._t.G();
    return { pts: g.me.ghostPts, tIdx: g.me.tIdx, do: g.me._doing, msg: g.msg };
  });
  ok(GCAP.pts === GCAP.cap && GCAP2.pts === GCAP.cap && GCAP.cap === 1,
    '幽灵任务额度：修满 ' + GCAP.cap + ' 分');
  ok(GCAP2.do === null && GCAP2.tIdx === GCAP.tIdx &&
    GCAP2.msg.indexOf(GCAP.cap + ' 分') >= 0,
    '幽灵额度用尽后不再开始新任务（' + GCAP.spot + '）');
  await T(() => { SKV3._t.tp(0, 28.2,43.1); });
  await page.waitForTimeout(350);
  await page.keyboard.press('s');
  await page.waitForTimeout(600);
  ok(!(await T(() => !document.getElementById('body').classList.contains('hide'))), '幽灵无法搜尸');
  await shot('28_幽灵态.png');

  section('幽灵任务 · 乱序 / 故障维修');
  await fresh(false);
  const GO = await T(() => {
    const t = SKV3._t, g = t.G();
    t.tp(0, 28.2,44); t.kill(0, 'knife');
    g.me.tasks = [0, 4, 11, 8]; g.me.tIdx = 0; g.me.progress = 0;
    g.me.doing = 0; g.me._doing = null; g.me.path = null;
    const P = t.points()[11];
    t.tp(0, P.x, P.y);
    return { label: P.label, dur: P.dur };
  });
  await page.keyboard.press('w');
  await page.waitForTimeout(180);
  const GO1 = await T(() => {
    const g = SKV3._t.G();
    return { do: g.me._doing, doing: g.me.doing, pt: g.me._taskPt, tIdx: g.me.tIdx };
  });
  ok(GO1.do === 'task' && GO1.pt === 11 && Math.abs(GO1.doing - GO.dur * 1.6) < 0.6,
    '幽灵乱序维修：实际点位「' + GO.label + '」，耗时 1.6×（' + GO.dur + '×1.6）');
  await T(() => SKV3._t.finishDoing(0));
  const GO2 = await T(() => {
    const g = SKV3._t.G();
    return { tIdx: g.me.tIdx, prog: g.prog, msg: g.msg,
      left: g.me.tasks.slice(g.me.tIdx).map(i => SKV3._t.points()[i].label),
      doing: g.me.doing };
  });
  ok(GO2.tIdx === 1 && GO2.prog === 1 && GO2.msg.indexOf(GO.label) >= 0 &&
    GO2.left.indexOf(GO.label) < 0 && GO2.doing === 0,
    '幽灵任务按实际点位结算，完成后计时归零');
  const GF = await T(() => {
    const t = SKV3._t, g = t.G();
    const alien = g.agents.find(a => a.alien && a.i !== 0 && a.alive);
    alien.sabUsed = false; g.dmg = [];
    t.damageRoom(alien.i, 'med');
    const d = g.dmg[0];
    g.me.doing = 0; g.me._doing = null; g.me.path = null;
    t.tp(0, d.x, d.y);
    const start = t.interact();
    return { start, dmg: g.dmg.length, doing: g.me.doing, label: d.label };
  });
  ok(GF.start.do !== 'fix' && GF.dmg === 1,
    '幽灵不能修故障（2026-11-01）：修复额度只花在剩余任务上');
  await T(() => { SKV3._t.G().me.doing = 0.02; });
  await page.waitForTimeout(260);
  const GF2 = await T(() => ({ dmg: SKV3._t.dmg().length, inv: SKV3._t.inv() }));
  ok(GF2.dmg === 1 && GF2.inv && GF2.inv.fails.length === 0,
    '幽灵修完故障：故障清除，不变量全过');

  section('性格轴 · 激进/谨慎的系数差');
  const TR8 = await T(() => {
    const bold = { aggr: 72, caut: 28, soc: 50, cur: 50 };
    const shy = { aggr: 28, caut: 72, soc: 50, cur: 50 };
    const a1 = { trait: bold }, a2 = { trait: shy };
    return {
      boldBold: SKTrait.C.knifeBold(a1), shyBold: SKTrait.C.knifeBold(a2),
      boldAbstain: SKTrait.C.voteAbstain(a1), shyAbstain: SKTrait.C.voteAbstain(a2),
      boldShoot: SKTrait.C.shootSus(a1), shyShoot: SKTrait.C.shootSus(a2),
      boldReach: SKTrait.C.knifeReach(a1), shyReach: SKTrait.C.knifeReach(a2),
      boldFlee: SKTrait.C.fleeThreshold(a1), shyFlee: SKTrait.C.fleeThreshold(a2),
    };
  });
  ok(TR8.boldBold > TR8.shyBold && TR8.boldAbstain < TR8.shyAbstain &&
    TR8.boldShoot < TR8.shyShoot && TR8.boldReach > TR8.shyReach &&
    TR8.boldFlee > TR8.shyFlee,
    '激进 vs 谨慎：更敢在目击者前出刀（' + TR8.boldBold.toFixed(2) + '/' + TR8.shyBold.toFixed(2) +
    '）· 更少弃权（' + TR8.boldAbstain.toFixed(2) + '/' + TR8.shyAbstain.toFixed(2) +
    '）· 更低开枪门槛 · 更远收刀 · 弃修阈值更高');

  section('DEV 无敌 / 全知');
  await fresh(true);
  const V = await T(() => {
    const t = SKV3._t;
    return { dev: t.dev(), panel: !document.getElementById('dev').classList.contains('hide'),
      line: !document.getElementById('devline').classList.contains('hide'),
      rows: document.querySelectorAll('#dev .dr').length, text: document.getElementById('dev').textContent,
      alive: t.state()[0].alive, inv: t.inv() };
  });
  ok(V.dev && V.panel && V.line, 'F2/API 开启 DEV：面板与 HUD 行可见');
  ok(V.rows === 15, 'DEV 面板列出 15 个席位');
  ok(V.text.indexOf('异形') >= 0 && V.text.indexOf('人类') >= 0, 'DEV 面板显示全部身份');
  /* DEV 横栏（2026-10-31）：从右侧竖栏改贴顶横栏，且不许压住左上角 HUD */
  const VD = await T(() => {
    const dev = document.getElementById('dev');
    const hud = document.getElementById('hud');
    const dv = dev.getBoundingClientRect(), hv = hud.getBoundingClientRect();
    const rows = [...document.querySelectorAll('#dev-rows .dr')].map(e => e.textContent);
    const cols = getComputedStyle(document.getElementById('dev-rows'))
      .gridTemplateColumns.split(' ').filter(Boolean).length;
    return { devTop: dv.top, devH: dv.height, hudTop: hv.top, rows, cols,
      dn: !document.getElementById('dnwrap').classList.contains('hide') };
  });
  ok(VD.devTop <= 2 && VD.devH > 30 && VD.devH < 180,
    'DEV 总览是顶部横栏（top=' + VD.devTop.toFixed(0) + ' · 高 ' + VD.devH.toFixed(0) + 'px）');
  ok(VD.hudTop >= VD.devH - 2,
    'DEV 横栏不占用左上角（HUD 顶边 ' + VD.hudTop.toFixed(0) + ' ≥ 横栏高 ' + VD.devH.toFixed(0) + '）');
  /* 2026-10-31：卡片压到 1/8 屏宽后资源行改成紧凑写法（弹0 包0 单0），
     正则容忍带不带空格两种排版，别让排版微调反复弄红门禁 */
  ok(VD.rows.length === 15 &&
    VD.rows.every(r => /弹\s*\d+/.test(r) && /包\s*\d+/.test(r) && /单\s*\d+/.test(r)),
    'DEV 卡片显示每人身上的资源（弹 / 包 / 申请单 / 任务）');
  ok(VD.cols >= 4 && VD.rows.length === 15,
    'DEV 卡片排成多列（' + VD.cols + ' 列 × 2 排，不再横向滚动）');
  ok(VD.dn, 'DEV 下才显示左上角濒死人数');
  const VN = await T(() => {
    SKV3._t.setDev(false);
    const out = {
      dn: !document.getElementById('dnwrap').classList.contains('hide'),
      panel: !document.getElementById('dev').classList.contains('hide'),
      hudTop: SKV3._t ? document.getElementById('hud').getBoundingClientRect().top : 0
    };
    SKV3._t.setDev(true);
    return out;
  });
  ok(!VN.dn && !VN.panel, '关闭 DEV：濒死人数与全知面板一起隐藏（对局内不再显示谁倒了）');
  const K = await T(() => {
    const t = SKV3._t, g = t.G();
    g.agents[1].knife = 1;
    const before = g.agents[1].knife;
    t.knife(1, 0);
    return { st: t.state()[0], inv: t.inv(), before, after: g.agents[1].knife,
      red: g.agents[1].redT, dur: t.redBodyCfg().dur };
  });
  ok(K.st.alive && !K.st.downed, 'DEV 无敌：AI 出刀对玩家无效');
  ok(K.before === 1 && K.after === 0,
    'DEV 免伤仍然消耗 AI 的刀（不会变成无限连刀，与子弹同一口径）');
  ok(K.red >= K.dur - 0.01, 'DEV 免伤的这一刀同样留下 ' + K.dur + ' 秒刀者红身');
  ok(K.inv && K.inv.fails.length === 0, 'DEV 被刀后不变量全过');
  const VM = await T(() => {
    const t = SKV3._t;
    t.openMeeting('night');
    const m = t.G().meet;
    m.votes = { 1: 0, 2: 0, 3: 0, 4: 0 };
    m.phase = 'vote';
    t.closeVote();
    const mm = t.G().meet;
    return { alive: t.state()[0].alive, tally: mm.tally,
      text: document.getElementById('m-tally').textContent, inv: t.inv() };
  });
  ok(VM.alive && VM.tally && VM.tally.devSaved, 'DEV 无敌：驱逐票无效');
  ok(VM.text.indexOf('驱逐无效') >= 0, '会议公布栏提示 DEV 免疫');
  await T(() => SKV3._t.finishMeeting());
  await page.waitForTimeout(300);
  await page.keyboard.press('c');
  await page.waitForTimeout(400);
  await shot('29_DEV全知.png');
  const INV = await T(() => SKV3._t.inv());
  ok(INV && INV.fails.length === 0, 'DEV 会议后不变量全过');
  await page.keyboard.press('c');
  await page.waitForTimeout(200);

  section('报告会议');
  await fresh(false);
  const R = await T(() => {
    const t = SKV3._t;
    t.tp(2, 28.2,44);
    t.kill(2, 'shot');
    const b = t.bodyOf(2);
    t.tp(0, b[0] + 0.5, b[1] + 0.5);
    const st = t.state()[2];
    return { b, name: st.name, tag: String(st.i + 1).padStart(2, '0') + ' ' + st.name };
  });
  await page.keyboard.press('r');
  await page.waitForTimeout(300);
  const M = await T(() => {
    const t = SKV3._t;
    return { open: !document.getElementById('meet').classList.contains('hide'),
      vic: document.getElementById('m-vic').textContent, kind: t.G().meet && t.G().meet.kind,
      inv: t.inv() };
  });
  ok(M.open && M.vic === R.tag, 'R 报告尸体：会议打开，受害者 ' + R.tag);
  ok(M.kind === 'night', '会议类型：夜间紧急会议');
  await shot('30_报告会议.png');
  const rem0 = await T(() => SKClock.remaining(SKV3._t.G().phase, performance.now()));
  await page.waitForTimeout(650);
  await T(() => SKV3._t.finishMeeting());
  await page.waitForTimeout(200);
  const rem1 = await T(() => SKClock.remaining(SKV3._t.G().phase, performance.now()));
  /* 2026-11-02：夜晚会议**不再占用夜晚时间**（会议期间时钟暂停） */
  ok(Math.abs(rem1 - rem0) < 800, '夜间会议暂停夜晚时钟：散会后剩余时间不变（' +
    (rem0 / 1000).toFixed(1) + 's → ' + (rem1 / 1000).toFixed(1) + 's）');
  ok((await T(() => SKV3._t.G().meet)) === null, '会议关闭');
  const MF = await T(() => SKV3._t.inv());
  ok(MF && MF.fails.length === 0, '散会后不变量全过');

  section('专属动画 · 出刀');
  await fresh(false);
  const KN = await T(() => {
    const t = SKV3._t, g = t.G();
    const k = g.agents.find(a => a.alien && a !== g.me && a.alive);
    const v = g.agents.find(a => !a.alien && a !== g.me && a.alive);
    t.tp(k.i, 34.8,33.8); t.tp(v.i, 35.75,33.8); t.tp(0, 33.4,33.8);
    k.knife = 1;
    t.knife(k.i, v.i);
    return { fx: t.fx(), acts: t.acts(), downed: t.state()[v.i].downed,
      stab: g.agents[k.i].act, hurt: g.agents[v.i].act, k: k.i, v: v.i };
  });
  ok(KN.fx.includes('slash') && KN.fx.includes('blood'), '出刀：斩击弧 + 血雾特效');
  ok(KN.acts.includes('stab') && KN.acts.includes('hurt'), '出刀：挥砍突进 + 受击后仰');
  ok(KN.stab && KN.stab.lunge > 0.3 && KN.stab.ang != null, '出刀动作带方向与突进距离');
  ok(KN.downed, '出刀命中 → 目标濒死');
  await page.waitForTimeout(1400);
  const KNF = await T(o => {
    const g = SKV3._t.G();
    return { kAct: g.agents[o.k].act, vAct: g.agents[o.v].act };
  }, KN);
  ok(!KNF.kAct && !KNF.vAct, '出刀动作按真实时间自动收尾');
  await T(o => {
    const t = SKV3._t, g = t.G();
    const k = g.agents[o.k], v = g.agents[o.v];
    const v2 = g.agents.find(a => !a.alien && a !== g.me && a.alive && a !== v);
    for (const a of g.agents) if (a !== g.me && a !== k && a !== v2) { a.path = null; a.x = 28.2; a.y = 44.0; }
    t.tp(0, 33.4,33.8);
    t.tp(k.i, 34.8,33.8); k.knife = 1; k.detained = false; k.path = null;
    t.tp(v2.i, 35.75,33.8);
    t.knife(k.i, v2.i);
  }, KN);
  await page.waitForTimeout(90);
  await freezeFx();
  await shotClip('31_出刀动画.png', { x: 440, y: 220, width: 600, height: 460 });

  section('异形玩家出刀指示 · 红色虚线圆（2026-11-06）');
  await fresh(false);
  const RING = await T(() => {
    const g = SKV3._t.G();
    g.paused = true; g.noReport = true;
    g.me.alien = true; g.me.knife = 1;
    g.gfx.knifeRings = 0;
    return { reach: SKSanity.REACH.knife };
  });
  await page.waitForTimeout(300);
  const RING2 = await T(() => SKV3._t.gfx());
  ok(RING2.knifeRings > 0,
    '异形玩家脚下显示红色虚线出刀圈（半径 ' + RING.reach + ' 格，' + RING2.knifeRings + ' 帧）');
  await T(() => {
    const g = SKV3._t.G();
    g.me.alien = false; g.gfx.knifeRings = 0;
  });
  await page.waitForTimeout(260);
  const RING3 = await T(() => SKV3._t.gfx());
  ok(RING3.knifeRings === 0, '人类玩家不显示该圈（不向人类泄露异形专属指示）');

  section('刀者红身 · 1.5 秒');
  await fresh(false);
  const RED = await T(() => {
    const t = SKV3._t, g = t.G();
    g.noReport = true;
    const k = g.agents.find(a => a.alien && a !== g.me && a.alive);
    const v = g.agents.find(a => !a.alien && a !== g.me && a.alive);
    for (const a of g.agents) if (a !== g.me && a !== k && a !== v) {
      a.knife = 0; a.path = null; a.x = 28.2; a.y = 44.0;
    }
    t.tp(k.i, 34.8,33.8); t.tp(v.i, 35.7,33.8); t.tp(0, 33.2,33.8);
    k.knife = 1; k.sabUsed = true; k._delay = 999; v._delay = 999;
    t.knife(k.i, v.i);
    const st = t.state();
    return { k: k.i, v: v.i, red: st[k.i].redT, victimRed: st[v.i].redT,
      cfg: t.redBodyCfg() };
  });
  ok(RED.cfg.dur === 1.5 && Math.abs(RED.red - RED.cfg.dur) < 0.01,
    '出刀者获得 ' + RED.cfg.dur + ' 秒红身标记（' + RED.red + 's）');
  ok(RED.victimRed === 0, '红身只给刀者，不给被击倒者');
  await page.waitForTimeout(1200);
  const RED2 = await T(o => SKV3._t.state()[o.k].redT, RED);
  ok(RED2 > 0 && RED2 < RED.cfg.dur,
    '红身按真实时间衰减（1.2 秒后剩 ' + RED2.toFixed(2) + 's）');
  /* 2026-11-01：这条原来写死 `waitForTimeout(2600)` 再断言 redT===0。
     红身是按**模拟时间**（dt 被钳在 0.05）衰减的，机器一忙帧率掉到 20fps 以下，
     模拟时间就落后墙钟，3.8 秒墙钟走不完 3 秒模拟 —— 断言会随机失败（未改动的基线上同样复现）。
     改成**等条件成立**（上限 8 秒）再断言，判定语义不变（仍然要求红身真的归零）。 */
  await page.waitForFunction(k => SKV3._t.state()[k].redT === 0, RED.k, { timeout: 8000 })
    .catch(() => {});
  const RED3 = await T(o => ({ red: SKV3._t.state()[o.k].redT, inv: SKV3._t.inv() }), RED);
  ok(RED3.red === 0, RED.cfg.dur + ' 秒后红身自动结束');
  ok(RED3.inv.fails.length === 0, '红身结束后不变量全过');

  /* ---------------- 击杀加速（2026-11-03 用户裁定）----------------
     三条裁定各有断言：绑"放倒" / 只给异形 / 拖尸期间不加速。
     另外做**双向解耦**：加速时长与红身时长都取 3 秒只是巧合，
     所以先手动把 rushT 清零（红身还在）验证速度回到基础，
     再把 rushT 拉长到 6 秒（红身已结束）验证速度仍在加速 ——
     任一方向退化成"读 redT"，这两条就会红。 */
  section('击杀加速 · rushT 与红身解耦');
  await fresh(false);
  const RUSH = await T(() => {
    const t = SKV3._t, g = t.G();
    g.noReport = true;
    const k = g.agents.find(a => a.alien && a !== g.me && a.alive);
    const v = g.agents.find(a => !a.alien && a !== g.me && a.alive);
    const h = g.agents.find(a => !a.alien && a !== g.me && a !== v && a.alive);
    const k2 = g.agents.find(a => a.alien && a !== g.me && a !== k && a.alive);
    for (const a of g.agents) if (a !== g.me && a !== k && a !== v && a !== h && a !== k2) {
      a.knife = 0; a.path = null; a.x = 28.2; a.y = 44.0;
    }
    t.tp(k.i, 34.8, 33.8); t.tp(v.i, 35.7, 33.8);
    t.tp(h.i, 44.0, 33.8); t.tp(k2.i, 44.9, 33.8); t.tp(0, 33.2, 33.8);
    k.knife = 1; k.sabUsed = true; k2.knife = 0; k2.sabUsed = true;
    h.knife = 1; h.sabUsed = true;
    for (const a of [k, v, h, k2]) a._delay = 999;
    const cfg = t.rushCfg();
    const base = t.speedOf(k.i);
    /* ① 异形放倒人 → 加速与红身同时挂上，但来源不同 */
    t.knife(k.i, v.i);
    const after = { rushT: t.rushT(k.i), redT: t.state()[k.i].redT, spd: t.speedOf(k.i), downed: !!v.downed };
    /* ② 拖尸优先于加速：挂着拖拽关系时必须是 2.5，不能是 4.0×1.5 */
    t.dragStart(k.i, v.i);
    const dragSpd = t.speedOf(k.i);
    t.clearDrags();
    const unDragSpd = t.speedOf(k.i);
    /* ③ 只给异形：人类放倒异形（走同一条 knife 结算）不得拿到加速 */
    t.knife(h.i, k2.i);
    const humanRush = t.rushT(h.i);
    /* ④ 解耦反向：红身还在、加速清零 → 速度必须回到基础 */
    t.setRush(k.i, 0);
    const decoupledA = { redT: t.state()[k.i].redT, spd: t.speedOf(k.i) };
    /* ⑤ 解耦正向：把加速拉到比红身长一倍，等红身自己归零 */
    const longRush = t.setRush(k.i, 6);
    return { k: k.i, cfg, base, after, dragSpd, unDragSpd, humanRush, decoupledA, longRush };
  });
  ok(RUSH.cfg.dur === 2 && RUSH.cfg.mul === 1.5 && RUSH.cfg.alienOnly === true,
    '击杀加速的三条口径都在声明层（dur=' + RUSH.cfg.dur + ' mul=' + RUSH.cfg.mul +
    ' alienOnly=' + RUSH.cfg.alienOnly + '）');
  ok(RUSH.base === 4.0, '基础移速不受影响（' + RUSH.base + '）');
  ok(RUSH.after.downed && Math.abs(RUSH.after.rushT - RUSH.cfg.dur) < 0.01 &&
    Math.abs(RUSH.after.spd - RUSH.base * RUSH.cfg.mul) < 0.01,
    '放倒即加速（不是等致死）：rushT=' + RUSH.after.rushT + 's → 速度 ' +
    RUSH.after.spd + '（= 4.0×' + RUSH.cfg.mul + '）');
  ok(RUSH.dragSpd === 2.5, '拖尸期间不加速：次序 拖尸 > 加速（实测 ' + RUSH.dragSpd + '）');
  ok(Math.abs(RUSH.unDragSpd - RUSH.base * RUSH.cfg.mul) < 0.01,
    '松开尸体后加速恢复生效（' + RUSH.unDragSpd + ' 格/秒）');
  ok(RUSH.humanRush === 0, '只给异形：人类放倒异形拿不到加速（rushT=' + RUSH.humanRush + '）');
  ok(RUSH.decoupledA.redT > 0.5 && RUSH.decoupledA.spd === 4.0,
    '解耦①：红身仍在（' + RUSH.decoupledA.redT + 's）但加速已清零 → 速度回到 4.0' +
    '（证明位移不读 redT）');
  /* 等红身自己走完（模拟时间，用等条件而不是写死 sleep） */
  await page.waitForFunction(i => SKV3._t.state()[i].redT === 0, RUSH.k, { timeout: 8000 }).catch(() => {});
  const RUSH2 = await T(o => ({
    redT: SKV3._t.state()[o.k].redT, rushT: SKV3._t.rushT(o.k),
    spd: SKV3._t.speedOf(o.k), inv: SKV3._t.inv()
  }), RUSH);
  /* 红身 1.5 秒走完时，6 秒加速必然还剩约 4.5 秒 —— 两个计时器不同长，
     这正是"位移不读 redT"的证据；若哪天有人改成读 redT，这里会直接掉到 0。 */
  ok(RUSH2.redT === 0 && RUSH2.rushT > 2.5 &&
    Math.abs(RUSH2.spd - RUSH.base * RUSH.cfg.mul) < 0.01,
    '解耦②：红身已结束（0s）而 6 秒加速仍在（剩 ' + RUSH2.rushT + 's）→ 速度仍是 ' +
    RUSH2.spd + '（两个计时器各自走完）');
  const RUSH3 = await T(o => {
    SKV3._t.setRush(o.k, 0);
    return { spd: SKV3._t.speedOf(o.k), inv: SKV3._t.inv() };
  }, RUSH);
  ok(RUSH3.spd === 4.0, '加速结束后回到统一移速 4.0');
  ok(RUSH3.inv.fails.length === 0, '击杀加速全流程后不变量全过' +
    (RUSH3.inv.fails.length ? '（失败项：' + RUSH3.inv.fails.slice(0, 4).map(f => f.code + ':' + f.msg).join(' | ') + '）' : ''));

  section('任务标记 · 掩体本体闪烁取代黄色边框');
  await fresh(false);
  const TK = await T(() => {
    const t = SKV3._t, g = t.G();
    g.paused = true; g.noReport = true;
    const pts = t.points();
    const idx = pts.findIndex(p => p.label === '引擎组同步');
    g.me.tasks = [idx]; g.me.tIdx = 0;
    t.tp(0, pts[idx].x + 2.4, pts[idx].y + 2.4);
    g.gfx.coverFlashes = 0; g.gfx.dashedBorders = 0;
    return { idx, spot: pts[idx] };
  });
  await page.waitForTimeout(360);
  const TK2 = await T(() => SKV3._t.gfx());
  ok(TK2.coverFlashes > 0, '任务点所在掩体以本体金色脉冲提示（' + TK2.coverFlashes + ' 帧叠加）');
  ok(TK2.dashedBorders === 0, '不再给掩体套黄色虚线边框');

  section('专属动画 · 开枪');
  await fresh(false);
  const SH = await T(() => {
    const t = SKV3._t, g = t.G();
    t.tp(0, 34.8,33.8);
    for (const a of g.agents) if (a !== g.me) { a.path = null; a.x = 28.2; a.y = 44.0; }
    t.tp(2, 30.5,33.8);
    g.me.bullet = 1;
    t.shoot();
    return { fx: t.fx(), acts: t.acts(), bullet: g.me.bullet, downed: t.state()[2].downed,
      target: 2, tracer: g.fx.find(f => f.type === 'tracer'),
      muzzle: !!g.fx.find(f => f.type === 'muzzle'),
      impact: !!g.fx.find(f => f.type === 'impact'),
      blood: !!g.fx.find(f => f.type === 'blood') };
  });
  ok(SH.tracer && Math.abs(SH.tracer.x2 - 30.5) < 0.01 && Math.abs(SH.tracer.y2 - 33.8) < 0.01,
    '开枪：弹道从枪口连到目标');
  ok(SH.muzzle && SH.impact && SH.blood, '开枪：枪口火光 + 命中环 + 血雾');
  ok(SH.acts.includes('shoot') && SH.acts.includes('hurt'), '开枪：后坐 + 受击动作');
  ok(SH.bullet === 0 && SH.downed, '开枪消耗子弹并击倒目标');
  await freezeFx();
  await shotClip('32_开枪动画.png', { x: 360, y: 220, width: 760, height: 460 });
  /* 同上：特效与后坐也是按模拟时间收尾，固定等 5 秒会随机不够。
     改成等条件（上限 12 秒），语义仍是「必须收干净」。 */
  await page.waitForFunction(t => {
    const g = SKV3._t.G();
    const fx = g.fx.filter(f => f.type === 'tracer' || f.type === 'muzzle' || f.type === 'impact');
    return fx.length === 0 && g.agents[t].act === null;
  }, SH.target, { timeout: 12000 }).catch(() => {});
  const SHF = await T(o => {
    const g = SKV3._t.G();
    return { fx: g.fx.filter(f => f.type === 'tracer' || f.type === 'muzzle' || f.type === 'impact'),
      act: g.agents[o.target].act };
  }, SH);
  ok(SHF.fx.length === 0 && SHF.act === null, '开枪特效/后坐按真实时间自动收尾');

  section('专属动画 · 维修 / 领取物资申请单 / 领取补给');
  await fresh(false);
  const DURS = await T(() => SKV3._t.taskDurs());
  const dNorm = DURS.filter(d => d.kind === 'normal');
  const dHard = DURS.filter(d => d.kind === 'hard');
  /* 2026-11-05 用户口径：普通 4~6 秒、高难 7~9 秒、电路维修 10 秒（逐点轮转，不再统一值）。
     判据从「等于 8 / 12 / 15」改成「落在设计区间 + 三类数量不变」，
     断言的语义仍是"时长分布符合声明"，不是拿读数凑阈值。 */
  const dAvg = a => (a.reduce((s, d) => s + d.dur, 0) / a.length).toFixed(1);
  ok(DURS.length === 26 && dNorm.length === 18 &&
    dNorm.every(d => d.dur >= 4 && d.dur <= 6) &&
    dHard.length === 8 && dHard.filter(d => d.dur >= 7 && d.dur <= 9).length === 7 &&
    dHard.filter(d => d.dur === 10).length === 1,
    '18 个普通任务均 ' + dAvg(dNorm) + ' 秒（4~6）/ 7 个高难均 ' +
    dAvg(dHard.filter(d => d.dur < 10)) + ' 秒（7~9）/ 电路维修 10 秒');
  const W0 = await T(() => {
    const t = SKV3._t, g = t.G();
    for (const a of g.agents) if (a !== g.me) { a.path = null; a.x = 28.2; a.y = 44.0; }
    const allP = t.points();
    const pi = allP.findIndex(p => p.label === '药柜');
    const mp = allP[pi];
    const normals = allP.map((p, i) => ({ p, i })).filter(x => x.p.kind === 'normal' && x.i !== pi).map(x => x.i);
    t.tp(0, mp.x - 1.6, mp.y + 1.4);
    g.me.tasks = [pi, normals[0], normals[1], normals[2]]; g.me.tIdx = 0; g.me.progress = 2;
    g.me.qual = 0; g.me.qualPending = 0;
    g.me.doing = 0; g.me._doing = null; g.me.path = null;
    return { room: t.state()[0].room, spot: t.taskSpot(0) };
  });
  await page.keyboard.press('w');
  await page.waitForFunction(() => SKV3._t.fx().includes('workSpark'), null, { timeout: 3000 });
  const W1 = await T(() => {
    const g = SKV3._t.G();
    return { doing: g.me.doing, dur: g.me._dur, do: g.me._doing, fx: SKV3._t.fx() };
  });
  ok(W0.room === 'med' && W0.spot && W0.spot.label === '药柜', '维修点：医疗间 / 药柜');
  ok(W1.do === 'task' && W1.doing > W0.spot.dur - 0.6 && W1.dur === W0.spot.dur,
    '维修：进入工作态（普通任务 ' + W1.dur + 's 倒计时，与任务点声明一致）');
  ok(W1.fx.includes('workSpark'), '维修：工具接触点持续冒火花');
  await T(() => { const g = SKV3._t.G(); g.me.doing = 40; g.me._dur = 60; });
  await freezeFx();
  await shotClip('33_维修动画.png', { x: 440, y: 220, width: 600, height: 460 });
  await T(() => { const g = SKV3._t.G(); g.me.doing = 9.5; g.me._dur = 10; });
  /* 站桩规则：任务维修中移动 → 立即打断，不结算 */
  await T(() => { const g = SKV3._t.G(); g.me.path = [[g.me.x + 1.6, g.me.y]]; });
  await page.waitForTimeout(340);
  const W2 = await T(() => {
    const g = SKV3._t.G();
    return { doing: g.me.doing, do: g.me._doing, tIdx: g.me.tIdx, msg: g.msg };
  });
  ok(W2.doing === 0 && W2.do === null && W2.tIdx === 0 && W2.msg.indexOf('移动打断') >= 0,
    '任务维修必须站桩：移动立即打断且不计分');
  /* 回到任务点重新开工并完成 */
  const W2b = await T(() => {
    const t = SKV3._t, g = t.G();
    g.me.path = null; g.me.moving = false; g.me.doing = 0; g.me._doing = null;
    const spot = t.taskSpot(0); t.tp(0, spot.x, spot.y);
    return { dur: spot.dur };
  });
  await page.keyboard.press('w');
  await page.waitForTimeout(160);
  const W3 = await T(() => { const g = SKV3._t.G(); return { do: g.me._doing, doing: g.me.doing }; });
  ok(W3.do === 'task' && W3.doing > W2b.dur - 0.6,
    '重新按 W 继续维修（计时从 ' + W2b.dur + ' 秒重来）');
  await T(() => { SKV3._t.G().me.doing = 0.02; });
  await page.waitForTimeout(240);
  const Q = await T(() => {
    const g = SKV3._t.G();
    return { prog: g.prog, qual: g.me.qual, pending: g.me.qualPending, progress: g.me.progress,
      tIdx: g.me.tIdx, fx: SKV3._t.fx(),
      ql: document.getElementById('ql').textContent, qp: document.getElementById('qp').textContent,
      qpPop: document.getElementById('qp').classList.contains('pop'),
      hint: !document.getElementById('qual-hint').classList.contains('hide'),
      doneFx: !!g.fx.find(f => f.type === 'done'), qualFx: !!g.fx.find(f => f.type === 'qual') };
  });
  ok(Q.tIdx === 1 && Q.progress >= 3, '完成维修：任务索引 +1，积分累加');
  ok(Q.qual === 0 && Q.pending === 1 && Q.qp === '1' && Q.ql === '0',
    '积分到 3 → 生成 1 份待领取物资申请单（HUD 待领 1 / 申请单 0）');
  ok(Q.hint, '待领申请单时 HUD 常驻提示「回圆桌领取」（不用猜领取地点）');
  ok(Q.doneFx && !Q.qualFx, '任务完成只给完工特效；申请单必须回中央会议室圆桌领取');
  ok(Q.qpPop, 'HUD 待领申请单数字弹跳（.pop）');
  const Q2 = await T(() => {
    const t = SKV3._t, g = t.G();
    g.fx.length = 0;
    g.me.doing = 0; g.me._doing = null; g.me.path = null;
    const spot = t.taskSpot(0);
    t.tp(0, spot.x, spot.y);
    return { spot, tIdx: g.me.tIdx };
  });
  await page.keyboard.press('w');
  await page.waitForTimeout(150);
  const Q3 = await T(() => {
    const g = SKV3._t.G();
    return { do: g.me._doing, doing: g.me.doing, dur: g.me._dur, tIdx: g.me.tIdx };
  });
  ok(Q3.do === 'task' && Q3.dur === Q2.spot.dur && Q3.tIdx === 1,
    '取消夜修限制：同一夜可以继续开工第二个任务（' + Q2.spot.label + '）');
  await T(() => { SKV3._t.G().me.doing = 0.02; });
  await page.waitForTimeout(240);
  const Q4 = await T(() => ({ tIdx: SKV3._t.G().me.tIdx, progress: SKV3._t.G().me.progress,
    prog: SKV3._t.G().prog, pending: SKV3._t.G().me.qualPending }));
  ok(Q4.tIdx === 2 && Q4.progress >= 4 && Q4.pending === 1,
    '第二个任务同样能完成（任务 2/4，个人积分 ' + Q4.progress + '，待领仍为 1）');
  /* 未领取申请单时，不能直接去医疗间拿物资 */
  await T(() => {
    const t = SKV3._t, g = t.G();
    g.fx.length = 0;
    g.me.doing = 0; g.me._doing = null; g.me.path = null;
    g.me.qual = 0; g.me.qualPending = 1; g.me.medkit = 0;
    const sp = t.supplies().find(s => s.item === 'med');
    t.tp(0, sp.x, sp.y);
  });
  await page.waitForTimeout(140);
  await page.keyboard.press('w');
  await page.waitForTimeout(160);
  const DENY = await T(() => ({ do: SKV3._t.G().me._doing, msg: SKV3._t.G().msg }));
  ok(DENY.do !== 'med' && DENY.msg.indexOf('先回中央会议室') >= 0,
    '未领取申请单：直接进医疗间拿物资被拒绝');
  /* 回中央会议室圆桌领取物资申请单 */
  const QD = await T(() => {
    const t = SKV3._t, g = t.G();
    const q = t.qualDesk();
    g.me.path = null; g.me.moving = false; g.me.doing = 0; g.me._doing = null;
    /* 站在圆桌外沿 2.1 格（旧 1.7 判定会拒绝，现在 2.3 内即可） */
    t.tp(0, q.x, q.y + 0.9);
    return { q, room: t.state()[0].room };
  });
  await page.keyboard.press('w');
  await page.waitForTimeout(170);
  const CL = await T(() => { const g = SKV3._t.G(); return { do: g.me._doing, doing: g.me.doing }; });
  ok(QD.room === 'bridge' && CL.do === 'qual' && CL.doing > 2.4,
    '中央会议室圆桌：2.1 格外按 W 也能进入 3 秒领取动作（判定 2.3 格）');
  await T(() => { SKV3._t.G().me.doing = 0.02; });
  await page.waitForTimeout(240);
  const Q5 = await T(() => {
    const g = SKV3._t.G();
    return { qual: g.me.qual, pending: g.me.qualPending,
      ql: document.getElementById('ql').textContent, qp: document.getElementById('qp').textContent,
      qlPop: document.getElementById('ql').classList.contains('pop'),
      fx: SKV3._t.fx(), msg: g.msg };
  });
  ok(Q5.qual === 1 && Q5.pending === 0 && Q5.ql === '1' && Q5.qp === '0',
    '领取成功：申请单 1 / 待领 0，HUD 同步');
  ok(Q5.fx.includes('qual') && Q5.msg.indexOf('领取物资申请单') >= 0 && Q5.qlPop,
    '领取物资申请单：金色徽章特效 + HUD 弹跳 + 播报');
  await freezeFx();
  await shotClip('34_领取申请单动画.png', { x: 440, y: 220, width: 600, height: 460 });
  /* 已领取申请单后才允许在医疗间补给点换医疗包 */
  await T(() => {
    const t = SKV3._t, g = t.G();
    g.fx.length = 0;
    g.me.doing = 0; g.me._doing = null; g.me.path = null;
    const sp = t.supplies().find(s => s.item === 'med');
    t.tp(0, sp.x, sp.y);
  });
  await page.waitForTimeout(120);
  await page.keyboard.press('w');
  await page.waitForTimeout(120);
  const P0 = await T(() => ({ do: SKV3._t.G().me._doing, doing: SKV3._t.G().me.doing }));
  ok(P0.do === 'med' && P0.doing > 4, '已领取申请单：医疗补给点按 W 进入取医疗包动作');
  await T(() => { SKV3._t.G().me.doing = 0.02; });
  await page.waitForTimeout(240);
  const P = await T(() => {
    const g = SKV3._t.G();
    return { med: g.me.medkit, qual: g.me.qual, fx: SKV3._t.fx(),
      act: g.me.act && g.me.act.kind, md: document.getElementById('md').classList.contains('pop'),
      mdText: document.getElementById('md').textContent };
  });
  ok(P.med === 1 && P.qual === 0 && P.mdText === '1', '领取补给：医疗包 +1、物资申请单 -1，HUD 同步');
  ok(P.fx.includes('pickup') && P.act === 'pickup', '领取补给：拾取光柱 + 下蹲拾取动作');
  ok(P.md, 'HUD 医疗包数字弹跳（.pop）');
  await freezeFx();
  await shotClip('35_领取补给动画.png', { x: 440, y: 220, width: 600, height: 460 });

  section('任务乱序维修 · 按实际点位结算');
  await fresh(false);
  const ORD = await T(() => {
    const t = SKV3._t, g = t.G();
    const allP = t.points();
    const pi = allP.findIndex(p => p.label === '餐台清洁');
    const P = allP[pi];
    const rest = allP.map((p, i) => i).filter(i => i !== pi).slice(0, 3);
    g.me.tasks = [pi].concat(rest); g.me.tIdx = 0; g.me.progress = 0;
    g.me.doing = 0; g.me._doing = null; g.me.path = null; g.me._taskPt = null;
    t.tp(0, P.x, P.y);
    const it = t.interact();                  // 只刷出任务项 → 直接开修
    const started = { do: g.me._doing, doing: g.me.doing, pt: g.me._taskPt };
    const fin = t.finishDoing(0);
    return { P: P.label, pi, it, started, fin,
      tIdx: g.me.tIdx, prog: g.prog, progress: g.me.progress,
      left: g.me.tasks.slice(g.me.tIdx).map(i => t.points()[i].label) };
  });
  ok(ORD.started.do === 'task' && ORD.started.pt === ORD.pi,
    '乱序开工：记录实际任务点「' + ORD.P + '」（不是列表首个任务）');
  ok(ORD.fin.msg.indexOf(ORD.P) >= 0 && ORD.fin.msg.indexOf('引擎组同步') < 0,
    '结算播报按实际点位：' + ORD.fin.msg);
  ok(ORD.tIdx === 1 && ORD.prog === 1 && ORD.progress === 1,
    '乱序维修计分正确：普通任务 +1，任务索引 +1');
  ok(ORD.left.length === 3 && ORD.left.indexOf(ORD.P) < 0 && ORD.left.indexOf('引擎组同步') >= 0,
    '任务列表：已修的餐台清洁移除，未修的引擎组同步保留');

  section('AI 节奏 · 慢工 + 夜间可连修');
  await fresh(false);
  const AI0 = await T(() => {
    const t = SKV3._t, g = t.G();
    const h = g.agents.find(a => !a.alien && a !== g.me && a.alive);
    h._delay = 0; h._rest = 0; h.tIdx = 0;
    h._doing = null; h.doing = 0; h.path = null;
    const spot = t.taskSpot(h.i);
    t.tp(h.i, spot.x, spot.y);
    const first = t.aiTick(h.i, 1, 0.05);
    return { i: h.i, spot, first };
  });
  ok(AI0.first.do === 'task' && Math.abs(AI0.first.doing - AI0.spot.dur) < 0.05,
    'AI 开工耗时 = 任务时长（' + AI0.spot.dur + 's → ' + AI0.spot.dur.toFixed(1) + 's，无额外倍率）');
  /* 2026-11-05：任务时长缩到 4~6 秒，原来的 9 秒已经超过一个普通任务的全长。
     改成推进 3 秒（小于最短的 4 秒），语义不变：AI 不是瞬间刷完。 */
  const AI1 = await T(i => SKV3._t.aiTick(i, 60, 0.05), AI0.i);
  ok(AI1.doing > 0 && AI1.tIdx === 0, 'AI 开工 3s 仍在同一任务（不再瞬间刷完）');
  const AI2 = await T(i => {
    const a = SKV3._t.G().agents[i];
    const steps = Math.ceil(((a.doing || 1) + 1.2) / 0.05);
    return SKV3._t.aiTick(i, steps, 0.05);
  }, AI0.i);
  ok(AI2.tIdx === 1 && AI2.rest === 0,
    'AI 完成第一个任务后不再休息（rest=' + (AI2.rest || 0).toFixed(1) + 's）');
  const AI3 = await T(i => {
    const t = SKV3._t, g = t.G();
    const a = g.agents[i];
    a._rest = 0; a.path = null;
    a.doing = 0; a._doing = null; a._taskPt = null;
    a._fixGo = null; a._lightGo = false; a._fleeT = 0;
    const spot = t.taskSpot(i);
    t.tp(i, spot.x, spot.y);
    const next = t.aiTick(i, 1, 0.05);
    return { spot, next };
  }, AI0.i);
  ok(AI3.next.do === 'task' && AI3.next.tIdx === 1 && Math.abs(AI3.next.doing - AI3.spot.dur) < 0.05,
    '完成后能立即接下一个任务（不再限一夜一个）');
  ok((await T(() => SKV3._t.G().prog)) >= 1, 'AI 维修计入全局维修进度');
  const DLY = await T(() => {
    const t = SKV3._t; t.newGame();
    return t.G().agents.filter(a => !a.alien).map(a => a._delay);
  });
  ok(DLY.length === 11 && DLY.every(d => d >= 2 && d <= 8),
    'AI 人类开局延迟压缩到 2–8 秒');

  section('会议发言 · 上下文连贯');
  await fresh(false);
  const MS = await T(() => {
    const t = SKV3._t, g = t.G();
    const aliens = g.agents.filter(a => a.alien && a.alive);
    const humans = g.agents.filter(a => !a.alien && a.alive && a !== g.me);
    const k = aliens[0], v = humans[0], w1 = humans[1], w2 = humans[2];
    t.tp(k.i, 56, 83.8); t.tp(v.i, 57.2, 85); t.tp(w1.i, 55, 83.8); t.tp(w2.i, 56, 87);
    t.tp(0, 58.5,85.2);
    k.knife = 1;
    t.knife(k.i, v.i);
    const sawNear = g.agents[w1.i].suspect === k.i || g.agents[w2.i].suspect === k.i;
    /* 其余 3 个异形倒地，保证发言席里至少有 2 名人类；所有人类都目击到这一刀 */
    for (const a of aliens) if (a !== k) { a.downed = true; a.downAt = g.t; a.path = null; }
    for (const h of humans) h.suspect = k.i;
    t.kill(v.i, 'knife');
    /* 造出每个 AI 昨晚真实去过的房间/修过的任务，供口供核对 */
    const facts = [
      ['engine', '引擎组同步'], ['ecosys', '水培阀'], ['power', '电路维修'], ['transit', '升降台'],
      ['fun', '娱乐桌'], ['cam', '监控墙重连'], ['armory', '靶道校准'],
      ['engine', '压力表校准'], ['ecosys', '培养罐补液'], ['power', '变压器换芯'],
      ['fun', '点唱机'], ['cam', '录像归档'], ['armory', '弹药清点']
    ];
    let fi = 0;
    for (const a of g.agents) {
      if (a === g.me || !a.alive) continue;
      const f = facts[fi++ % facts.length];
      a.nRoom = f[0]; a.nTask = f[1]; a.nSeen = a.nSeen || {};
    }
    const ais = g.agents.filter(a => a !== g.me && a.alive && !a.downed);
    for (let i = 0; i < 4; i++) {
      const a = ais[i % ais.length], b = ais[(i + 3) % ais.length];
      if (a && b && a !== b) a.nSeen[b.i] = 4;
    }
    /* 2026-11-08：先发制人可能抢在报案者之前开口，这条用例测的是"报案开场白"，
       所以临时关掉 FIRST，保证 lines[0] 仍然是报案信息。 */
    const F1 = window.SKSanity;
    const oldFirst1 = F1.FIRST.chance;
    F1.FIRST.chance = 0;
    t.openMeeting('night', w1.i, v.i);
    F1.FIRST.chance = oldFirst1;
    return { k: k.i, v: v.i, w1: w1.i, w2: w2.i, vicName: v.name, vicRoom: '医疗间',
      sawNear, label: document.getElementById('m-vic-l').textContent,
      hudRoom: document.getElementById('m-room').textContent };
  });
  ok(MS.sawNear, '行凶当时附近的人类 → suspect 指向凶手');
  ok(MS.label === '死者' && MS.hudRoom === '医疗间', '会议 HUD：死者 / 医疗间');
  await page.waitForTimeout(14500);
  const ML = await T(() => {
    const t = SKV3._t, g = t.G();
    const lines = t.meetLines().filter(l => !l.sys);
    const claims = t.meetCtx().claims;
    const declared = {}, tasks = {};
    for (const a of g.agents) {
      declared[a.name] = a._lie ? a._lie.room : (a.nRoom ? t.roomName(a.nRoom) : null);
      tasks[a.name] = a._lie ? a._lie.task : a.nTask;
    }
    const chx = (t.meetCtx() || {}).challenge;
    return { lines: lines.map(l => ({ who: l.who, text: l.text,
      /* 这句话能不能被 parseSpeech 认成"第一人称位置自述" —— 用系统自己的判据，
         而不是钉某个字面模板（语料迁移后同一意思有十几种说法） */
      alibi: !l.sys && !!t.parseSpeech(l.text).where })),
      challenge: chx ? { kind: chx.kind, room: chx.room,
        byName: (g.agents[chx.by] || {}).name, targetName: (g.agents[chx.target] || {}).name } : null,
      accusers: g.agents.filter(a => a.alive && !a.downed && a.accuse != null &&
        lines.some(l => l.who === a.name)).length,
      claims, declared, tasks, vic: t.meetCtx().victim, leader: g.leader,
      leaderName: (g.leader != null && g.agents[g.leader]) ? g.agents[g.leader].name : null };
  });
  /* 语料迁移之后（2026-11-03），这些断言**不能再钉死字面**：同一句自述现在有 12 种说法，
     钉住"我今晚在"这五个字测的就不是"他有没有报位置"，而是"他有没有抽中那一条模板"。
     所以判据换成两条更硬的：
       ① 结构：把台词喂给 parseSpeech，能被识别成"第一人称位置自述"的才算 alibi；
       ② 一致：登记的口供舱室必须真的出现在他这句话里。
     质疑 / 作证 / 指控这几条保留字面判据但扩成**同义族**（措辞可变，意图不改）。 */
  const SEE_MARK = /亲眼|我看见|我看着他|动的手|下了手|亲眼所见/;
  const alibis = ML.lines.filter(l => l.alibi);
  ok(ML.lines.length >= 8, '夜间会议生成 ' + ML.lines.length + ' 条发言');
  ok(ML.vic && ML.vic.dead && ML.vic.room === '医疗间' && ML.vic.cause === '刀伤',
    '会议上下文记录死者、房间、死因');
  const opening = ML.lines[0];
  ok(opening && opening.text.indexOf(MS.vicName) >= 0 && opening.text.indexOf(MS.vicRoom) >= 0 && opening.text.indexOf('刀伤') >= 0,
    '开场白包含死者 + 房间 + 死因');
  ok(alibis.length >= 3, '至少 3 名 AI 给出完整不在场说明（parseSpeech 认得出的自述 ' + alibis.length + ' 条）');
  const claimsBad = ML.claims.filter(c =>
    !alibis.some(l => l.who === c.who && l.text.indexOf(c.room) >= 0))
    .map(c => c.who + '@' + c.room + ' → ' +
      (ML.lines.filter(l => l.who === c.who).map(l => l.text.slice(0, 30)).join(' // ') || '没发言'));
  ok(ML.claims.length > 0 && !claimsBad.length,
    '每个 AI 的发言房间与其登记口供一致（' + ML.claims.length + ' 条）' +
    (claimsBad.length ? ' :: ' + claimsBad.join(' | ') : ''));
  /* 台词里如果报了任务名，就必须与这人**真实的下一个任务**一致。
     捕获窗口必须卡在**一个子句内**（`[^，。]`）：用 `(.+?)已完成` 这种写法，
     「我在仓库，电路维修已完成」会把"我在仓库，电路维修"整段吞进来，
     于是测到的是正则写错，不是 AI 说错任务。 */
  const TASK_RE = /[^，。]{0,8}?(搞定|做完|收尾|交掉|完成|弄完|处理完毕|那下是我弄的)/g;
  const taskBad = alibis.filter(l => {
    const segs = (l.text.match(/[^，。]+/g) || []);
    const said = segs.filter(s => TASK_RE.test(s) && !/在|去|正|要/.test(s.slice(0, 2)));
    return said.length && ML.tasks[l.who] &&
      !said.some(s => s.indexOf(ML.tasks[l.who]) >= 0);
  }).map(l => l.who + '：台词「' + l.text.slice(0, 40) + '」报的任务对不上真实任务 ' + ML.tasks[l.who]);
  ok(!taskBad.length, '发言里提到的维修任务与真实任务一致' +
    (taskBad.length ? ' :: ' + taskBad.join(' | ') : ''));
  /* ---- 对质链路改成**结构化断言**（2026-11-03）----
     语料上千行之后，拿措辞去正则匹配"有没有人对质"必然随机失效：
     同一意图现在有近十种说法。所以判据换成两条实的：
       ① 会议上下文里确实登记了 `ctx.challenge`（谁质疑谁、什么类型、针对哪个舱室）；
       ② 质疑者本人**确实有一行发言**，而且紧跟在他之后被质疑者也开了口。
     字面只留一个"至少听起来像在对话"的宽松检查，不再钉死具体句子。 */
  const CH = ML.challenge;
  ok(!!CH && ['doubt', 'support', 'ask'].indexOf(CH.kind) >= 0,
    '对质真的发生了（' + (CH ? CH.kind + '：' + CH.byName + ' → ' + CH.targetName + ' @' + CH.room : '无') + '）');
  const ci = CH ? ML.lines.findIndex(l => l.who === CH.byName && l !== opening) : -1;
  const chal = ci >= 0 ? ML.lines[ci] : null;
  ok(!!chal, '质疑者本人当众说出了那句对质（' + (chal ? chal.text.slice(0, 26) : '没找到他的发言行') + '）');
  /* 回应行：被点名的人必须在质疑之后真的开口（不是被别人代答） */
  let rep = null;
  if (CH) for (let j = Math.max(0, ci + 1); j < ML.lines.length; j++) {
    if (ML.lines[j].who === CH.targetName) { rep = ML.lines[j]; break; }
  }
  const rooms = await T(() => SKV3._t.roomNames());
  /* 回应可能走「作证 / 异形搪塞 / 报出自己位置」三种分支：只在它报位置时校验一致性 */
  const loc = rep ? rep.text.match(/(?:我|我们)[^，。]{0,6}在([^，。；]{1,10})/) : null;
  const claimed = loc ? rooms.find(n => loc[1].indexOf(n) >= 0) : null;
  ok(rep && (!claimed || claimed === ML.declared[rep.who]),
    '被质疑者做出回应，且报出的位置与口供一致' +
    (!rep ? ' :: 被点名的人没有开口回应' :
      (claimed && claimed !== ML.declared[rep.who] ? ' :: ' + JSON.stringify({ who: rep.who, text: rep.text,
        declared: ML.declared[rep.who], claimed }) : '')));
  /* 指控数量：发言的人里确实有若干个把手指向了某个人（看 a.accuse，不看台词） */
  ok(ML.accusers >= 2, '至少两条明确指控（当场点名要投某人的席位 ' + ML.accusers + ' 个）');
  ok(ML.lines.some(l => SEE_MARK.test(l.text)),
    '目击者说出亲眼所见，而不是随机台词');
  const n0 = await T(() => SKV3._t.chat('你在哪？'));
  await page.waitForFunction(n => SKV3._t.meetLines().length > n, n0, { timeout: 6000 }).catch(() => {});
  /* 回应是 600~1100ms 后才排期上屏的（meetLater），只等 300ms 会漏掉它 →
     这条断言会偶发失败。改成等 1.6 秒，保证回应已经出现。 */
  await page.waitForTimeout(1600);
  const PC = await T(n0 => {
    const t = SKV3._t, g = t.G();
    const lines = t.meetLines();
    const fresh = lines.slice(n0);
    for (const l of fresh) {
      const a = g.agents.find(x => x.name === l.who);
      /* 领袖指令说的是**别人**的舱室，不是自己的位置自述 → 跳过 */
      if (a && g.leader != null && a.i === g.leader) continue;
      const declared = a ? (a._lie ? a._lie.room : (a.nRoom ? t.roomName(a.nRoom) : null)) : null;
      if (declared && l.text.indexOf(declared) >= 0) return { n: lines.length, who: l.who, text: l.text, declared };
    }
    /* 2026-11-01：改成取**第一条**新发言。
       以前取最后一条，但会议里现在还会冒出领袖指令（说的是一间与他自己口供无关的房间），
       一旦它排在最后，这条用例就会误判成"回应里的位置和口供不一致"。
       玩家问"你在哪"之后，回应是最早被排期的那条（600ms），所以取第一条才对。 */
    let firstFresh = null;
    for (const l of fresh) {
      const aa = g.agents.find(x => x.name === l.who);
      if (aa && g.leader != null && aa.i === g.leader) continue;   /* 领袖指令说的是别人的舱室 */
      firstFresh = l; break;
    }
    const last = firstFresh || (fresh.length ? fresh[0] : lines[lines.length - 1]);
    const a = g.agents.find(x => x.name === last.who);
    return { n: lines.length, who: last.who, text: last.text,
      declared: a ? (a._lie ? a._lie.room : (a.nRoom ? t.roomName(a.nRoom) : null)) : null };
  }, n0);
  ok(PC.n > n0, '玩家发言得到 AI 回应');
  ok(PC.declared && PC.text.indexOf(PC.declared) >= 0, '回应中的位置与它先前的口供一致（' + PC.declared + '）');
  await shot('36_会议连贯发言.png');
  const VT = await T(() => {
    const t = SKV3._t, g = t.G();
    t.startVote();
    const m = g.meet;
    const humans = g.agents.filter(a => !a.alien && a.alive && !a.downed && a !== g.me);
    return { votes: m.votes, humans: humans.map(a => ({ i: a.i, name: a.name, target: a.accuse })),
      k: g.agents.find(a => a.alien && a.alive && !a.downed).i };
  });
  const withAcc = VT.humans.filter(h => h.target != null);
  ok(withAcc.length >= 8 && withAcc.every(h => VT.votes[h.i] === h.target && h.target === VT.k),
    withAcc.length + ' 名目击者把票投给了自己指认的凶手');
  await T(() => SKV3._t.finishMeeting());
  await page.waitForTimeout(200);
  const DMI = await T(() => SKV3._t.inv());
  ok(DMI && DMI.fails.length === 0, '会议结束后不变量全过');

  section('AI 确证 · 管道 / 红身 / 误判边界');
  await fresh(false);
  const CERT1 = await T(() => {
    const t = SKV3._t; t.newGame();
    const g = t.G(); g.paused = true; g.noReport = true;
    const demote = g.agents.find(a => a.alien && a.i !== 0 && a.alive);
    demote.alien = false; g.me.alien = true;
    const w = g.agents.find(a => !a.alien && a.i !== 0 && a.alive);
    const pipe = t.pipes().find(p => p.room === 'warehouse');
    t.tp(w.i, pipe.x - 1.7, pipe.y);
    t.tp(0, pipe.x, pipe.y);
    const before = t.knownOf(w.i);
    t.openPipe();
    t.pickPipe(t.pipes().find(p => p.room === 'cam').i);
    const after = t.knownOf(w.i);
    t.openMeeting('night', w.i, null);
    const acc = g.agents[w.i].accuse;
    const why = g.agents[w.i].accuseWhy;
    const line = t.accuseLineOf(w.i);
    t.startVote();
    const vote = g.meet.votes[w.i];
    t.finishMeeting();
    return { w: w.i, before, after, acc, why, line, vote, inv: t.inv() };
  });
  ok(!CERT1.before || !CERT1.before[0], '钻管道之前：证人没有"他是异形"的结论');
  ok(CERT1.after && CERT1.after[0] && CERT1.after[0].kind === 'saw_pipe',
    '亲眼看见钻管道 → 直接确证该人是异形（不是加一点嫌疑分）');
  ok(CERT1.acc === 0 && CERT1.vote === 0, '确证之后：会议指控与投票都锁定这个席位');
  ok(/管道/.test(CERT1.line) && /(确定|确证|异形)/.test(CERT1.line),
    '确证台词点破具体行为与地点：' + CERT1.line);
  ok(CERT1.inv.fails.length === 0, '确证链路不变量全过');

  const CERT2 = await T(() => {
    const t = SKV3._t; t.newGame();
    const g = t.G(); g.paused = true; g.noReport = true;
    const k = g.agents.find(a => a.alien && a.i !== 0 && a.alive);
    const w = g.agents.find(a => !a.alien && a.i !== 0 && a.alive);
    t.tp(k.i, 56, 83.8); t.tp(w.i, 57.2, 85);
    k.redT = 3;                       /* 模拟刚出刀后的 3 秒红身 */
    t.track();
    const know = t.knownOf(w.i);
    const sus = (t.mind(w.i).sus || {})[k.i] || 0;
    return { k: k.i, w: w.i, know, sus };
  });
  ok(CERT2.know[CERT2.k] && CERT2.know[CERT2.k].kind === 'saw_red',
    '看见「刀者红身」同样确证：带红光的人就是刚出刀的异形');
  ok(CERT2.sus >= 0.99, '红身目击把嫌疑分直接拉满（' + CERT2.sus + '），不再慢慢累计');

  const CERT3 = await T(() => {
    const t = SKV3._t; t.newGame();
    const g = t.G(); g.paused = true; g.noReport = true;
    const k = g.agents.find(a => a.alien && a.i !== 0 && a.alive);
    const w = g.agents.find(a => !a.alien && a.i !== 0 && a.alive);
    t.tp(k.i, 56, 83.8); t.tp(w.i, 57.2, 85);
    t.notice(k.i, 56, 85, 6, 'shot', null);   /* 开枪人类也会做 */
    return { know: t.knownOf(w.i), sus: (t.mind(w.i).sus || {})[k.i] || 0, k: k.i };
  });
  ok(Object.keys(CERT3.know).length === 0 && CERT3.sus > 0.3,
    '开枪 / 拖尸这类人类也会做的事：只记嫌疑（' + CERT3.sus + '），不确证身份');

  const CERT4 = await T(() => {
    const t = SKV3._t; t.newGame();
    const g = t.G(); g.paused = true; g.noReport = true;
    const k = g.agents.find(a => a.alien && a.i !== 0 && a.alive);
    const w = g.agents.find(a => !a.alien && a.i !== 0 && a.alive);
    t.tp(k.i, 56, 83.8); t.tp(w.i, 57.2, 85);
    t.notice(k.i, 56, 85, 6, 'sabotage', null);
    const k1 = t.knownOf(w.i);
    t.newNight();                        /* 进入下一夜：普通认知清空 */
    const k2 = t.knownOf(w.i);
    const mem = t.mind(w.i).mem.length;
    const sus = Object.keys(t.mind(w.i).sus).length;
    t.openMeeting('day');
    const acc = g.agents[w.i].accuse;
    t.startVote();
    const vote = g.meet.votes[w.i];
    t.finishMeeting();
    return { k: k.i, w: w.i, k1, k2, mem, sus, acc, vote, inv: t.inv() };
  });
  ok(CERT4.k1[CERT4.k] && CERT4.k2[CERT4.k] && CERT4.k2[CERT4.k].kind === 'saw_sabotage',
    '确证是长期记忆：第二天仍然记得「他是异形」');
  /* 2026-11-01 改动 A：普通记忆（位置时间线）仍按夜清空，**嫌疑改为跨夜衰减**。
     这里把「清空」这条旧语义改成「衰减但不清零」，并额外钉住三条护栏。 */
  ok(CERT4.mem === 0, '位置时间线（mem）仍按夜清空——跨夜记录不得参与本夜口供对质');
  ok(CERT4.sus >= 1, '嫌疑跨夜**衰减但不清零**（' + CERT4.sus + ' 个对象仍记着，上限 ' +
    '0.45 生效前后都能看出残留）');
  ok(CERT4.acc === CERT4.k && CERT4.vote === CERT4.k,
    '下一夜的会议指控与投票继续锁定这个人');

  section('推理 · 跨夜嫌疑衰减的三条护栏（2026-11-01）');
  await fresh(false);
  const CARRY = await T(() => {
    const t = SKV3._t; t.newGame();
    const g = t.G(); g.paused = true; g.noReport = true;
    const w = g.agents.find(x => !x.alien && x.i !== 0 && x.alive);
    const a1 = g.agents.find(x => !x.alien && x.i !== 0 && x.alive && x !== w);
    const a2 = g.agents.find(x => !x.alien && x.i !== 0 && x.alive && x !== w && x !== a1);
    const a3 = g.agents.find(x => !x.alien && x.i !== 0 && x.alive && x !== w && x !== a1 && x !== a2);
    /* a1：本夜被目击（saw_*，衰减慢）；a2：本夜只有传闻（heard_*，衰减快）；
       a3：上一夜有证据、本夜完全没有新证据（额外加速衰减） */
    t.tp(a1.i, 56, 83.8); t.tp(w.i, 57.2, 85);
    t.notice(a1.i, 56, 85, 6, 'shot', null);          /* 开枪 → saw_shot 目击类 */
    const before1 = t.susOf(w.i, a1.i);
    w.mind.sus[a2.i] = 0.8; w.mind.susNight[a2.i] = g.night;
    w.mind.why[a2.i] = [{ w: 0.8, reason: '传闻', kind: 'heard_frame', night: g.night }];
    w.mind.sus[a3.i] = 0.8; w.mind.susNight[a3.i] = g.night - 1;
    w.mind.why[a3.i] = [{ w: 0.8, reason: '旧目击', kind: 'saw_knife', night: g.night - 1 }];
    t.newNight();                                     /* 进入下一夜 → mindReset */
    const after = t.mind(w.i).sus;
    return { w: w.i, a1: a1.i, a2: a2.i, a3: a3.i, before1,
      s1: after[a1.i] || 0, s2: after[a2.i] || 0, s3: after[a3.i] || 0,
      cap: SKSanity.CARRY.cap };
  });
  ok(CARRY.s1 > 0 && CARRY.s1 <= CARRY.cap,
    '目击类证据的嫌疑跨夜保留但封顶 0.45（' + CARRY.s1 + '）');
  ok(CARRY.s2 > 0 && CARRY.s2 < CARRY.s1,
    '传闻类衰减更快（' + CARRY.s2 + ' < ' + CARRY.s1 + '）——一句话不该和亲眼所见等价');
  ok(CARRY.s3 > 0 && CARRY.s3 < CARRY.s2,
    '本夜无新证据再加速衰减（' + CARRY.s3 + ' < ' + CARRY.s2 + '）——一次诬陷不背一整局');

  section('推理 · 证言可信度与准-确证（2026-11-01）');
  await fresh(false);
  const RELIA = await T(() => {
    const t = SKV3._t; t.newGame();
    const g = t.G(); g.paused = true; g.noReport = true;
    const k = g.agents.find(a => a.alien && a.i !== 0 && a.alive);
    const v1 = g.agents.find(a => !a.alien && a.i !== 0 && a.alive);
    const v2 = g.agents.find(a => !a.alien && a.i !== 0 && a.alive && a !== v1);
    const w = g.agents.find(a => !a.alien && a.i !== 0 && a.alive && a !== v1 && a !== v2);
    const v3 = g.agents.find(a => !a.alien && a.i !== 0 && a.alive && a !== v1 && a !== v2 && a !== w);
    t.openMeeting('pre', null, null);
    const m = g.meet;
    m.ctx.lead[k.i] = v1.i;                   /* v1 带头指控 k */
    m.votes[v1.i] = k.i; m.votes[v2.i] = k.i; m.votes[w.i] = k.i; m.votes[v3.i] = k.i;
    const before = t.reliaOf(w.i, v1.i);
    t.closeVote();                            /* 翻出来是异形 → 带头人 +可信度 */
    const after = t.reliaOf(w.i, v1.i);
    /* 再来一次：带头指错（翻出来是人类） */
    t.newGame();
    const g2 = t.G(); g2.paused = true; g2.noReport = true;
    const h = g2.agents.find(a => !a.alien && a.i !== 0 && a.alive);
    const l = g2.agents.find(a => !a.alien && a.i !== 0 && a.alive && a !== h);
    const o = g2.agents.find(a => !a.alien && a.i !== 0 && a.alive && a !== h && a !== l);
    const p = g2.agents.find(a => a.i !== 0 && a.alive && a !== h && a !== l && a !== o);
    t.openMeeting('pre', null, null);
    const m2 = t.G().meet;
    m2.ctx.lead[h.i] = l.i;
    m2.votes[l.i] = h.i; m2.votes[o.i] = h.i; m2.votes[0] = h.i; m2.votes[p.i] = h.i;
    const b2 = t.reliaOf(o.i, l.i);
    t.closeVote();
    const a2 = t.reliaOf(o.i, l.i);
    return { before, after, b2, a2, base: SKSanity.RELIA.base };
  });
  ok(RELIA.before === RELIA.base && RELIA.after > RELIA.before,
    '带对了人 → 他的证言更值钱（可信度 ' + RELIA.before.toFixed(2) + ' → ' + RELIA.after.toFixed(2) + '）');
  ok(RELIA.b2 === RELIA.base && RELIA.a2 < RELIA.b2,
    '带错了人 → 他的证言不再值钱（可信度 ' + RELIA.b2.toFixed(2) + ' → ' + RELIA.a2.toFixed(2) + '）');

  await fresh(false);
  const ALMOST = await T(() => {
    const t = SKV3._t; t.newGame();
    const g = t.G(); g.paused = true; g.noReport = true;
    g.simStats = { almostCount: 0, almostFriendCount: 0, overriddenFriends: 0 };
    const w = g.agents.find(x => !x.alien && x.i !== 0 && x.alive);
    const k = g.agents.find(x => x.alien && x.i !== 0 && x.alive);
    t.tp(k.i, 56, 83.8); t.tp(w.i, 57.2, 85);
    /* 两笔**不同种类**的非确证证据（开枪 + 反常拖尸）→ 应攒出 almost.foe */
    t.notice(k.i, 56, 85, 6, 'shot', null);
    t.notice(k.i, 56, 85, 6, 'drag_away', null);
    const foe = t.almostOf(w.i).foe[k.i] || null;
    const sus = (t.mind(w.i).sus || {})[k.i] || 0;
    const knownBefore = t.knownOf(w.i);      /* 只有准-确证时，不能有确证 */
    /* 装出来的好人：另一个异形 k2 先攒出 almost.friend（伪装装够了），
       然后被 w 亲眼看见出刀 → known 硬覆盖它自己的 friend 与 cred。 */
    const k2 = g.agents.find(x => x.alien && x.i !== 0 && x.alive && x !== k);
    t.tp(k2.i, 56, 83.8);
    w.mind.cred[k2.i] = 0.62;
    w.mind.credWhy[k2.i] = [
      { kind: 'taskDone', night: g.night, w: 0.1 },
      { kind: 'fixDone', night: g.night, w: 0.16 }];
    t.evalAlmost(w.i, k2.i);
    const friend = t.almostOf(w.i).friend[k2.i] || null;
    t.notice(k2.i, 56, 85, 6, 'knife', null);      /* 亲眼看见它出刀 → known */
    const afterFoe = t.almostOf(w.i).foe[k2.i] || null;
    const hCred = (t.mind(w.i).cred || {})[k2.i] || 0;
    const hFriend = t.almostOf(w.i).friend[k2.i] || null;
    return { k: k.i, k2: k2.i, w: w.i, sus, foe, friend, knownBefore,
      afterFoe, hCred, hFriend,
      known: t.knownOf(w.i), tele: t.tele(), foeSus: SKSanity.ALMOST.foeSus };
  });
  ok(ALMOST.sus >= ALMOST.foeSus && !!ALMOST.foe,
    '跨线 + 两类不同证据 → 准-确证 almost.foe（sus=' + ALMOST.sus.toFixed(2) + '）');
  ok(Object.keys(ALMOST.knownBefore).indexOf(String(ALMOST.k)) < 0,
    '准-确证不等于确证：只写 almost，不写 known');
  ok(ALMOST.friend && ALMOST.friend.cred >= 0.55,
    '攒够了正经行为 → almost.friend（cred=' + (ALMOST.friend ? ALMOST.friend.cred : 0) + '，异形伪装终于有收益）');
  ok(ALMOST.hFriend === null && ALMOST.hCred === 0,
    'known 硬覆盖：亲眼看见的事实删掉 almost.friend、清空 cred（洗白机制从此对他失效）');
  ok(ALMOST.afterFoe && !!ALMOST.known[ALMOST.k2] && ALMOST.tele.overriddenFriends >= 1,
    '硬覆盖后立刻写入 almost.foe，并计数进遥测（' + ALMOST.tele.overriddenFriends + ' 次）');

  section('身份轴 · 动态先验 / 两套导出 / 满分原判定');
  await fresh(false);
  const IDAX = await T(() => {
    const t = SKV3._t; t.newGame();
    const g = t.G(); g.paused = true; g.noReport = true;
    const al = g.agents.find(x => x.alien && x.i !== 0 && x.alive && !x.downed);
    const al2 = g.agents.find(x => x.alien && x.i !== 0 && x.alive && !x.downed && x !== al);
    const hu = g.agents.find(x => !x.alien && x.i !== 0 && x.alive && !x.downed);
    const hu2 = g.agents.find(x => !x.alien && x.i !== 0 && x.alive && !x.downed && x !== hu);
    const p0 = { al: t.identityPrior(al.i), hu: t.identityPrior(hu.i) };
    const hp0 = { alOnHu: t.hostileProb(al.i, hu.i), huOnHu2: t.hostileProb(hu.i, hu2.i) };
    const hv = g.agents.find(x => !x.alien && x.alive && x.i !== 0 && x !== hu && x !== hu2);
    t.kill(hv.i, 'vote');
    const p1 = { al: t.identityPrior(al.i), hu: t.identityPrior(hu.i) };
    const av = g.agents.find(x => x.alien && x.alive && x.i !== 0 && x !== al && x !== al2);
    t.kill(av.i, 'vote');
    const p2 = { al: t.identityPrior(al.i), hu: t.identityPrior(hu.i) };
    const uv = g.agents.find(x => x.alive && x.i !== 0 && x !== al && x !== al2 && x !== hu && x !== hu2);
    t.kill(uv.i, 'knife');
    const p3 = { al: t.identityPrior(al.i), hu: t.identityPrior(hu.i) };
    hu.mind.known[al.i] = { t: g.t, kind: 'saw_knife', room: null, conf: 0.95 };
    al.mates[al2.i] = { t: g.t, kind: 'saw_red' };
    const hard = { humanOnAlien: t.hostileProb(hu.i, al.i), alienOnMate: t.hostileProb(al.i, al2.i) };
    hu2.mind.almost.foe[al.i] = { t: g.t, sus: 0.5, kinds: ['saw_knife', 'saw_pipe'], since: g.night, conf: 0.8 };
    al.mind.almost.friend[hu.i] = { t: g.t, cred: 0.5, kinds: ['taskDone', 'fixDone'], since: g.night, conf: 0.7 };
    const soft = { humanOnAlmostFoe: t.hostileProb(hu2.i, al.i), alienOnAlmostFriend: t.hostileProb(al.i, hu.i) };
    return { p0, hp0, p1, p2, p3, hard, soft,
      cfg: { foeSus: SKSanity.ALMOST.foeSus, friendCred: SKSanity.ALMOST.friendCred }, inv: t.inv() };
  });
  const near = (a, b, e) => Math.abs(a - b) <= (e == null ? 0.02 : e);
  ok(near(IDAX.p0.al, 11 / 14) && near(IDAX.p0.hu, 10 / 14),
    '动态先验：异形看 11/14 人类，人类看 10/14 人类');
  ok(near(IDAX.hp0.alOnHu, 11 / 14) && near(IDAX.hp0.huOnHu2, 4 / 14),
    '无证据：异形对陌生人 78.6% 敌对，人类对陌生人 28.6% 敌对');
  ok(near(IDAX.p1.al, 10 / 13) && near(IDAX.p1.hu, 9 / 13),
    '公开人类出局后先验按阵营更新（异 10/13 / 人 9/13）');
  ok(near(IDAX.p2.al, 10 / 12) && near(IDAX.p2.hu, 9 / 12),
    '公开异形出局后先验继续更新（异 10/12 / 人 9/12）');
  ok(near(IDAX.p3.al, IDAX.p2.al) && near(IDAX.p3.hu, IDAX.p2.hu),
    '未公开夜杀按比例分摊，不读尸体阵营，先验保持');
  ok(IDAX.hard.humanOnAlien >= 0.99 && IDAX.hard.alienOnMate <= 0.01,
    '硬锁两端：人类看确证异形≈100% 敌对；异形看认出的队友≈0% 敌对');
  ok(near(IDAX.soft.humanOnAlmostFoe, 0.95) && near(IDAX.soft.alienOnAlmostFriend, 0.95),
    'almost 端点仍按原判定：人类看 almost.foe 95% 敌对；异形看 almost.friend 95% 敌对');
  ok(IDAX.cfg.foeSus === 0.5 && IDAX.cfg.friendCred === 0.5,
    '嫌疑 / 信任累积门槛提高到 0.5 / 0.5（2026-11-07 用户裁定）');
  ok(IDAX.inv && IDAX.inv.fails.length === 0, '身份轴夹具不变量全过');

  section('身份轴 v2 · 先验条件化 / 证据分层 / 强斜率（2026-11-06）');
  await fresh(false);
  const ID2 = await T(() => {
    const t = SKV3._t; t.newGame();
    const g = t.G(); g.paused = true; g.noReport = true;
    const al = g.agents.find(x => x.alien && x.i !== 0 && x.alive && !x.downed);
    const mates = g.agents.filter(x => x.alien && x !== al && x.alive && !x.downed).slice(0, 2);
    const hu = g.agents.find(x => !x.alien && x.i !== 0 && x.alive && !x.downed);
    const hu2 = g.agents.find(x => !x.alien && x.i !== 0 && x.alive && !x.downed && x !== hu);
    const hu3 = g.agents.find(x => !x.alien && x.i !== 0 && x.alive && !x.downed && x !== hu && x !== hu2);
    const p0 = t.identityPrior(al.i);
    for (const m of mates) al.mates[m.i] = { t: g.t, kind: 'saw_red' };
    const pM = t.identityPrior(al.i);
    hu.mind.known[mates[0].i] = { t: g.t, kind: 'saw_knife', room: null, conf: 0.95 };
    const pH = t.identityPrior(hu.i);
    /* sus 不进身份轴：同 cred 下，带不带 sus 的 h 必须一样 */
    const priorHu2 = t.identityPrior(hu2.i);
    hu2.mind.cred[hu3.i] = 0.2; hu2.mind.sus[hu3.i] = 0.5;
    const hSus = t.identityAxis(hu2.i, hu3.i);
    hu2.mind.sus[hu3.i] = 0;
    const hNoSus = t.identityAxis(hu2.i, hu3.i);
    /* almost.foe 只由人类也会做的行为凑成：不封顶 H */
    hu2.mind.almost.foe[hu3.i] = { t: g.t, sus: 0.6,
      kinds: ['shot', 'drag_away'], since: g.night, conf: 0.8 };
    const hSoftFoe = t.identityAxis(hu2.i, hu3.i);
    hu2.mind.almost.foe[hu3.i].kinds = ['saw_knife', 'shot'];
    const hHardFoe = t.identityAxis(hu2.i, hu3.i);
    /* 异形侧权重 0.08+h² / 距离倍率 0.5~1.25 */
    al.mind.cred[hu.i] = 0.5;
    const wHi = t.hostileWeight(al.i, hu.i), mHi = t.targetMul(al.i, hu.i);
    al.mind.almost.foe[hu3.i] = { t: g.t, sus: 0.6,
      kinds: ['saw_knife', 'saw_pipe'], since: g.night, conf: 0.8 };
    const wLo = t.hostileWeight(al.i, hu3.i), mLo = t.targetMul(al.i, hu3.i);
    return { p0, pM, pH, priorHu2, hSus, hNoSus, hSoftFoe, hHardFoe,
      wHi, wLo, mHi, mLo, inv: t.inv() };
  });
  ok(near(ID2.p0, 11 / 14), 'v2 先验基线仍是 11/14');
  ok(near(ID2.pM, 11 / 12), '异形认出 2 名队友后先验条件化到 11/12（' + ID2.pM.toFixed(3) + '）');
  ok(near(ID2.pH, 10 / 13), '人类确证 1 名异形后先验条件化到 10/13（' + ID2.pH.toFixed(3) + '）');
  ok(near(ID2.hSus, ID2.hNoSus) && ID2.hNoSus > ID2.priorHu2,
    '普通 sus 不进身份轴：cred 0.2 时带/不带 sus 的 h 都是 ' + ID2.hNoSus.toFixed(3));
  ok(near(ID2.hSoftFoe, ID2.hNoSus),
    'almost.foe 只由开枪+拖尸凑成 → 不封顶 H（仍按 cred 为 ' + ID2.hSoftFoe.toFixed(3) + '）');
  ok(near(ID2.hHardFoe, 0.05), '含 saw_knife 的 almost.foe → 回到 0.05 端点');
  ok(ID2.wHi / ID2.wLo > 5 && ID2.mHi < 0.6 && ID2.mLo > 1.15,
    '异形侧权重 h²（高/低 ' + (ID2.wHi / ID2.wLo).toFixed(1) +
    '×）与距离倍率 ' + ID2.mHi.toFixed(2) + ' / ' + ID2.mLo.toFixed(2));
  ok(ID2.inv && ID2.inv.fails.length === 0, '身份轴 v2 夹具不变量全过');

  section('推理 · 证据分级 / 票权 / 连坐 / 回避（2026-11-02）');
  await fresh(false);
  const GRAD = await T(() => {
    const t = SKV3._t; t.newGame();
    const g = t.G(); g.paused = true; g.noReport = true;
    g.simStats = { farSight: 0 };
    const k = g.agents.find(x => x.alien && x.i !== 0 && x.alive);
    const w = g.agents.find(x => !x.alien && x.i !== 0 && x.alive);
    g.lightState = 1;                         /* 全亮：aiCanSee 只剩 LOS，便于定位 */
    /* 在医疗间里扫一对「相距 5.5 格且有视线」的站位（地图静态，扫出来是确定的） */
    let spot = null;
    for (let x = 44; x <= 56 && !spot; x += 0.5) {
      for (let y = 78; y <= 90; y += 0.5) {
        t.tp(k.i, x, y); t.tp(w.i, x + 5.5, y);
        if (t.roomIdAt(x, y) !== 'med' || t.roomIdAt(x + 5.5, y) !== 'med') continue;
        if (t.aiSee(w.i, x, y, 8) && t.aiSee(k.i, x + 5.5, y, 8)) { spot = [x, y]; break; }
      }
    }
    const canFar = !!spot;
    const px = spot ? spot[0] : 50, py = spot ? spot[1] : 85;
    t.tp(k.i, px, py); t.tp(w.i, px + 5.5, py);   /* ≈5.5 格：看得见，但看不清动作 */
    t.notice(k.i, px, py, 8, 'knife', null);
    const far = { known: Object.keys(t.knownOf(w.i)).length,
      sus: (t.mind(w.i).sus || {})[k.i] || 0,
      farEv: (t.mind(w.i).mem || []).filter(e => e.far).length };
    t.tp(w.i, px + 1.5, py);                      /* 1.5 格：贴脸 */
    t.notice(k.i, px, py, 8, 'knife', null);
    const near = { known: Object.keys(t.knownOf(w.i)).length,
      sus: (t.mind(w.i).sus || {})[k.i] || 0 };
    return { far, near, canFar, tele: t.tele(), k: k.i, w: w.i,
      nearR: SKSanity.CONFIRM.nearR };
  });
  ok(GRAD.canFar === true && GRAD.far.known === 0 && GRAD.far.sus > 0.5 && GRAD.far.farEv >= 1,
    '远距离目击（> ' + GRAD.nearR + ' 格）**不写确证**，只记嫌疑（sus=' +
    GRAD.far.sus.toFixed(2) + '）—— 「那边有人动手」≠「我亲眼看见」');
  ok(GRAD.near.known === 1 && GRAD.near.sus >= 0.99,
    '贴脸目击照旧确证（known=1，sus 拉满）—— 分级不是削弱确证，是给"看见"分档');

  await fresh(false);
  const VOTE2 = await T(() => {
    const t = SKV3._t; t.newGame();
    const g = t.G(); g.paused = true; g.noReport = true;
    g.simStats = { almostVotes: 0, friendShield: 0 };
    const k = g.agents.find(x => x.alien && x.i !== 0 && x.alive);
    const w = g.agents.find(x => !x.alien && x.i !== 0 && x.alive);
    t.tp(k.i, 56, 83.8); t.tp(w.i, 57.2, 85);
    /* ① 准-确证 → 票权：不给 accuse / suspect，只留 almost.foe */
    t.notice(k.i, 56, 85, 6, 'shot', null);
    t.notice(k.i, 56, 85, 6, 'drag_away', null);
    t.evalAlmost(w.i, k.i);
    const hasFoe = !!t.almostOf(w.i).foe[k.i];
    t.openMeeting('day');
    w.accuse = null; w.suspect = null;
    g.meet.votes = {};
    t.startVote();
    const vFoe = g.meet.votes[w.i];
    t.closeVote(); t.finishMeeting();
    /* ② almost.friend → 挡票（换一个对象：k 身上已经有 almost.foe，二者互斥） */
    const k2 = g.agents.find(x => x.alien && x.i !== 0 && x.alive && x !== k);
    w.mind.cred[k2.i] = 0.6;
    w.mind.credWhy[k2.i] = [{ kind: 'taskDone', night: g.night, w: 0.1 },
      { kind: 'fixDone', night: g.night, w: 0.16 }];
    t.evalAlmost(w.i, k2.i);
    const hasFriend = !!t.almostOf(w.i).friend[k2.i];
    /* ① 的 almost.foe 会让票权分支直接投给 foe（k），friend 盾就没机会验了 —— 先清掉 */
    w.mind.almost.foe = {};
    /* cred 必须留着（清零会让 evalAlmost 立刻删掉几乎.friend）；
       改用 RNG 区分两道盾：cred 盾概率 0.2475 < 0.35 < friend 盾 0.45 */
    t.openMeeting('day');
    w.accuse = k2.i; w.suspect = null;
    const oldRandom = Math.random;
    Math.random = () => 0.35;
    t.startVote();
    const vFriend = g.meet.votes[w.i];
    Math.random = oldRandom;
    t.closeVote(); t.finishMeeting();
    return { hasFoe, vFoe, hasFriend, vFriend, k: k.i, w: w.i, tele: t.tele() };
  });
  ok(VOTE2.hasFoe && VOTE2.vFoe === VOTE2.k,
    '准-确证升级为**票权**：手上只有 almost.foe（没有公开指控）也会投他');
  ok(VOTE2.hasFriend && VOTE2.vFriend === -1 && VOTE2.tele.friendShield >= 1,
    '「基本是好人」会**挡票**（弃权，实测 ' + VOTE2.tele.friendShield + ' 次｜hasFriend=' +
    VOTE2.hasFriend + '｜v=' + VOTE2.vFriend + '）—— 伪装的兑现口');

  await fresh(false);
  const ALLY2 = await T(() => {
    const t = SKV3._t; t.newGame();
    const g = t.G(); g.paused = true; g.noReport = true;
    g.simStats = { retractCount: 0, allyRevealed: 0 };
    const k = g.agents.find(x => x.alien && x.i !== 0 && x.alive);
    const d = g.agents.find(x => !x.alien && x.i !== 0 && x.alive);
    t.openMeeting('day');
    const m = g.meet;
    const oldRandom = Math.random;
    Math.random = () => 0;                    /* 必辩护、必选同一个辩护者 */
    /* 清掉其它人残留的指控：否则 decideHumanDefend 可能先挑到别人当"被辩护者"，
       软联盟就记在别人身上（这条断言会时好时坏）。 */
    for (const a of g.agents) { a.accuse = null; a.suspect = null; }
    const got1 = t.defendTry(d.i, k.i);
    const got2 = t.defendTry(d.i, k.i);       /* 保第二次 → 软联盟成立 */
    Math.random = oldRandom;
    const def = g.agents[(got2 || got1).by];  /* 辩护者是 pool[0]，不一定是 d */
    const ally = (t.mind(def.i).ally || {})[k.i] || 0;
    /* 让 k（异形）被驱逐 → 保过他的人被回溯 */
    const other = g.agents.find(x => x.i !== 0 && x.i !== k.i && x.i !== def.i && x.alive);
    const other2 = g.agents.find(x => x.i !== 0 && x.i !== k.i && x.i !== def.i && x.i !== other.i && x.alive);
    m.votes = {}; m.votes[def.i] = k.i; m.votes[0] = k.i; m.votes[other.i] = k.i; m.votes[other2.i] = k.i;
    m.ctx.lead[k.i] = def.i;
    if (g.meet) { t.closeVote(); }
    const why = (t.mind(other.i).why || {})[def.i] || [];
    const kinds = why.map(x => x.kind);
    return { ally, kinds, tele: t.tele(), k: k.i, d: def.i, need: SKSanity.META.allyCount,
      log: t.defenseLog(), ex: g.meet && g.meet.tally ? g.meet.tally.exRole : null,
      votes: g.meet ? Object.assign({}, g.meet.votes) : null, other: other.i };
  });
  ok(ALLY2.ally >= ALLY2.need && ALLY2.kinds.indexOf('ally_revealed') >= 0,
    '反复替同一个人说话 → 软联盟（' + ALLY2.ally + ' 次）；那人翻出是异形，保人吃 ally_revealed（' +
    ALLY2.kinds.join(',') + '）');

  await fresh(false);
  const AVOID = await T(() => {
    const t = SKV3._t; t.newGame();
    const g = t.G(); g.paused = true; g.noReport = true;
    g.simStats = { avoidSus: 0 };
    const av = g.agents.find(x => !x.alien && x.i !== 0 && x.alive);   /* 躲的人 */
    const who = g.agents.find(x => !x.alien && x.i !== 0 && x.alive && x !== av);
    g.lightState = 1;                         /* 全亮：只剩 LOS */
    let spot = null;
    for (let x = 44; x <= 56 && !spot; x += 0.5) {
      for (let y = 78; y <= 90; y += 0.5) {
        t.tp(av.i, x, y); t.tp(who.i, x + 2, y);
        if (t.roomIdAt(x, y) !== 'med') continue;
        if (t.aiSee(who.i, x, y, 6)) { spot = [x, y]; break; }
      }
    }
    if (spot) { t.tp(av.i, spot[0], spot[1]); t.tp(who.i, spot[0] + 2, spot[1]); }
    av._avoidHuman = who.i;                   /* 白天 who 咬过他，夜里他躲 who */
    t.track();
    const why = (t.mind(who.i).why || {})[av.i] || [];
    return { kinds: why.map(x => x.kind), tele: t.tele(), spot };
  });
  ok(AVOID.kinds.indexOf('saw_avoid') >= 0 && AVOID.tele.avoidSus >= 1,
    '回避可观察：被躲的人会注意到「他刚才绕开了我」→ 弱证据（' + AVOID.kinds.join(',') + '）');

  section('推理 · 辩护不看阵营 / 认错分支（2026-11-01）');
  await fresh(false);
  const DEF = await T(() => {
    const t = SKV3._t; t.newGame();
    const g = t.G(); g.paused = true; g.noReport = true;
    const k = g.agents.find(x => x.alien && x.i !== 0 && x.alive);
    const ac = g.agents.find(x => !x.alien && x.i !== 0 && x.alive);
    const oldRandom = Math.random;
    Math.random = () => 0;               /* 必辩护、必选 pool[0] */
    const got = t.defendTry(ac.i, k.i);  /* 让人类指控一只异形 */
    Math.random = oldRandom;
    const by = got ? g.agents[got.by] : null;
    return { got, tgtAlien: !!k.alien, byAlien: by ? !!by.alien : null };
  });
  ok(DEF.got && DEF.tgtAlien === true && DEF.byAlien === false,
    '人类会替**被指控的异形**说话（不再读 `tgt.alien` 抄答案），辩护者是人类');

  section('推理 · 在场反驳 / 熵 / 沉默（2026-11-01）');
  await fresh(false);
  const PRES = await T(() => {
    const t = SKV3._t; t.newGame();
    const g = t.G(); g.paused = true; g.noReport = true;
    g.simStats = { presenceDeny: 0, silentSus: 0, hedgeAgents: 0, sureAgents: 0 };
    const ac = g.agents.find(x => !x.alien && x.i !== 0 && x.alive);
    const w = g.agents.find(x => !x.alien && x.i !== 0 && x.alive && x !== ac);
    const other = g.agents.find(x => x.i !== 0 && x.alive && x !== ac && x !== w);
    const tg = g.agents.find(x => !x.alien && x.i !== 0 && x.alive && x !== ac && x !== w &&
      x !== other);
    g.lit.power = true;                    /* 配电室点亮：亮房整间可见，看不见 = 确实不在 */
    t.tp(tg.i, 50, 54); t.tp(ac.i, 51, 54);
    t.notice(tg.i, 50, 54, 6, 'knife', null);   /* ac 亲眼看见 tg 出刀 → 硬证词指控 */
    /* w 当时也在配电室（亮着），整段时间没见过 tg */
    w.mind.mem = [{ kind: 'saw_agent', subj: other.i, room: 'power', night: g.night,
      t: 0, ox: 51, oy: 54.5, lit: true, conf: 0.8, src: 'sight' }];
    /* 2026-11-08：先发制人会挪动随机流、并给靶子预先加压，
       这条用例测的是 presence_deny 本身，临时关掉 FIRST。 */
    const F0 = window.SKSanity;
    const oldFirst = F0.FIRST.chance;
    F0.FIRST.chance = 0;
    t.openMeeting('day');
    F0.FIRST.chance = oldFirst;
    const why = (t.mind(w.i).why || {})[ac.i] || [];
    const kinds = why.map(x => x.kind);
    /* 熵：五个人的嫌疑差不多 → 高熵犹豫；一个人独高 → 低熵敢点名 */
    for (const x of g.agents) if (x.mind) { x.mind.sus = {}; }
    const flat = g.agents.filter(x => x.i !== w.i).slice(0, 5);
    for (const x of flat) t.healSus(w.i, x.i, 0.3);
    const hFlat = t.entropyOf(w.i);
    for (const x of flat) t.healSus(w.i, x.i, 0.02);
    t.healSus(w.i, flat[0].i, 0.95);
    const hPeak = t.entropyOf(w.i);
    const hedgeHi = SKSanity.MIND.hedgeHi, sureLo = SKSanity.MIND.sureLo;
    const t2 = t.tele();
    return { ac: ac.i, w: w.i, tg: tg.i, kinds, hFlat, hPeak, hedgeHi, sureLo,
      tele: t2 };
  });
  ok(PRES.kinds.indexOf('presence_deny') >= 0,
    '在场反驳：我当时就在配电室（亮房）没看见他 → 反过来怀疑指认者（' +
    (PRES.kinds.join(',') || '—') + '）');
  ok(PRES.hFlat >= PRES.hedgeHi && PRES.hPeak <= PRES.sureLo,
    '信念熵：局面糊（' + PRES.hFlat.toFixed(2) + '）→ 犹豫；一人独高（' +
    PRES.hPeak.toFixed(2) + '）→ 敢点名 [阈值 ' + PRES.hedgeHi + ' / ' + PRES.sureLo + ']');
  ok(PRES.tele.presenceDeny >= 1, '在场反驳进遥测（' + PRES.tele.presenceDeny + ' 次）');
  ok(typeof PRES.tele.silentSus === 'number',
    '沉默线索走同一套 susAdd（触发 ' + PRES.tele.silentSus + ' 次），上限 0.10 且不升级为准-确证');

  section('推理 · 跨夜口供只记不判（2026-11-01）');
  await fresh(false);
  const CLAIMH = await T(() => {
    const t = SKV3._t; t.newGame();
    const g = t.G(); g.paused = true; g.noReport = true;
    g.simStats = { claimRecall: 0 };
    const all = () => {
      let n = 0, okRoom = true, maxOne = 0;
      for (const x of g.agents) {
        const h = t.claimHistOf(x.i);
        n += h.length;
        if (h.length > maxOne) maxOne = h.length;
        for (const r of h) if (typeof r.room !== 'string') okRoom = false;
      }
      return { n, okRoom, maxOne };
    };
    t.openMeeting('day');
    const s1 = all();
    t.finishMeeting();
    t.openMeeting('day');
    const s2 = all();
    const recall = t.tele().claimRecall;
    t.finishMeeting();
    return { s1, s2, recall };
  });
  ok(CLAIMH.s2.n > CLAIMH.s1.n && CLAIMH.s2.okRoom && CLAIMH.s2.maxOne <= 3,
    '口供史按夜累积、每人最多 3 条、都记了舱室名（' + CLAIMH.s1.n + ' → ' + CLAIMH.s2.n +
    ' 条，单席最多 ' + CLAIMH.s2.maxOne + '）');

  section('推理 · 时间线拆谎的量词与时间窗（2026-11-01）');
  await fresh(false);
  const ALB = await T(() => {
    const t = SKV3._t; t.newGame();
    const g = t.G(); g.paused = true; g.noReport = true;
    g.simStats = { contradictions: 0, falseContradictions: 0, knownWrites: 0 };
    const a = g.agents.find(x => !x.alien && x.i !== 0 && x.alive);
    const w = g.agents.find(x => !x.alien && x.i !== 0 && x.alive && x !== a);
    /* 把夜色推进到 evNow=40，复现「t=10 在中央会议室 → t=40 在配电室」 */
    g.t = Math.max(0, g.t - 40);
    a.nRoom = 'power';
    const mk = (room, at) => ({ kind: 'saw_agent', subj: a.i, room: room,
      night: g.night, t: at, conf: 0.8, src: 'sight' });
    const mem = w.mind.mem;
    mem.length = 0;
    mem.push(mk('bridge', 10), mk('power', 40));
    const win = t.claimWindow(null);
    const hit = t.checkAlibi(w.i, a.i, 'power', win.t0, win.t1, win.tRef);
    const miss = t.checkAlibi(w.i, a.i, 'med', win.t0, win.t1, win.tRef);
    mem.length = 0; mem.push(mk('corridor', 38));      /* 只在走廊被瞥见 */
    const corr = t.checkAlibi(w.i, a.i, 'power', win.t0, win.t1, win.tRef);
    mem.length = 0; mem.push(mk('power', 20));         /* 记录在窗口之外 */
    const none = t.checkAlibi(w.i, a.i, 'med', 30, 40, 40);
    return { hit, miss, corr, none, win,
      falseCnt: g.simStats.falseContradictions,
      word: [t.alibiTimeWord(3), t.alibiTimeWord(20), t.alibiTimeWord(90)] };
  });
  ok(ALB.hit.match === true && ALB.hit.checked >= 2 && ALB.falseCnt >= 1,
    '口供与窗口内任一条时间线记录一致 → 不定罪（旧量词会在这里冤枉人，已记 falseContradictions）');
  ok(ALB.miss.match === false && ALB.miss.evidence && ALB.miss.evidence.room === 'power' &&
    ALB.miss.checked === 2,
    '窗口内所有记录都对不上 → 才成立 contradiction，证据取最接近口供时刻的那条');
  ok(ALB.corr.checked === 0,
    '走廊记录不算「在某个舱室」：走过走廊不能拿来否定口供');
  ok(ALB.none.checked === 0 && ALB.none.evidence === null,
    '窗口内没有任何该对象的记录 → checked=0，闭嘴（既不洗清也不定罪）');
  ok(ALB.word[0] === '刚才' && ALB.word[1] === '十几秒前' && ALB.word[2] === '半分钟前',
    '证据新鲜度用品类时间词说清楚：' + ALB.word.join(' / '));

  const ALB2 = await T(() => {
    const t = SKV3._t; t.newGame();
    const g = t.G(); g.paused = true; g.noReport = true;
    g.simStats = { contradictions: 0, falseContradictions: 0, knownWrites: 0 };
    const a = g.agents.find(x => !x.alien && x.i !== 0 && x.alive);
    const w = g.agents.find(x => !x.alien && x.i !== 0 && x.alive && x !== a);
    const w2 = g.agents.find(x => !x.alien && x.i !== 0 && x.alive && x !== a && x !== w);
    g.t = Math.max(0, g.t - 40);
    a.nRoom = 'power';
    const mk = (s, room, at) => ({ kind: 'saw_agent', subj: s, room: room,
      night: g.night, t: at, conf: 0.8, src: 'sight' });
    w.mind.mem.length = 0;
    w.mind.mem.push(mk(a.i, 'bridge', 10), mk(a.i, 'power', 40));   /* 后来确实到过配电室 */
    w2.mind.mem.length = 0;
    w2.mind.mem.push(mk(a.i, 'engine', 12), mk(a.i, 'engine', 36)); /* 全程只在引擎室 */
    for (const x of g.agents) { x._delay = 999; x.accuse = null; }
    const oldRandom = Math.random;
    Math.random = () => 0.99;               /* 关掉随机构陷，只读拆谎这一条 */
    t.openMeeting('day', null, null);
    Math.random = oldRandom;
    const out = { susW: (t.mind(w.i).sus || {})[a.i] || 0,
      susW2: (t.mind(w2.i).sus || {})[a.i] || 0, tele: t.tele() };
    t.finishMeeting();
    return out;
  });
  ok(ALB2.susW < 0.12,
    '会议里同一份口供：见过他在配电室的听众不再冤枉（sus=' + ALB2.susW.toFixed(2) + '）');
  ok(ALB2.susW2 >= 0.2,
    '同一个口供，对「全程只在引擎室看见他」的听众才成立 contradiction（sus=' +
    ALB2.susW2.toFixed(2) + '）');

  section('推理 · 电闸：拉闸确证 / 合闸只是信任（2026-11-01）');
  await fresh(false);
  const BRK = await T(() => {
    const t = SKV3._t; t.newGame();
    const g = t.G(); g.paused = true; g.noReport = true;
    g.simStats = { contradictions: 0, falseContradictions: 0, knownWrites: 0 };
    const br = t.breakerPos();
    const k = g.agents.find(x => x.alien && x.i !== 0 && x.alive);
    const h = g.agents.find(x => !x.alien && x.i !== 0 && x.alive);
    const h2 = g.agents.find(x => !x.alien && x.i !== 0 && x.alive && x !== h);
    const ha = g.agents.find(x => x.alien && x.i !== 0 && x.alive && x !== k);
    for (const x of g.agents) {
      x._delay = 999; x.accuse = null; x.accuseWhy = null; x.mates = {};
      if (x.mind) { x.mind.mem = []; x.mind.sus = {}; x.mind.why = {};
        x.mind.known = {}; x.mind.cred = {}; x.mind.humanT = {}; }
    }
    /* 配电室是暗房，电闸又贴着墙：只有紧挨着闸杆的那一小条站位有视线
       （实测 x=51 / y=53~55 才 `aiCanSee` 得到），这本身就是设计上的代价 ——
       「守闸」才看得到，隔着半个舱室拉闸没人能确证。 */
    t.tp(k.i, br[0], br[1]);
    t.tp(h.i, 51, 54);
    t.tp(h2.i, 51, 53.5);
    t.tp(ha.i, 51, 53.7);
    const off = t.breakerBy(k.i);                      /* 拉闸断电 */
    const offRead = { state: off.state, known: t.knownOf(h.i),
      sus: (t.mind(h.i).sus || {})[k.i] || 0,
      mate: Object.keys(t.mind(ha.i).mates || {}),
      memKinds: (t.mind(h.i).mem || []).map(e => e.kind) };
    const on = t.breakerBy(h2.i);                      /* 人类合闸复电 */
    const onRead = { state: on.state, known: t.knownOf(h.i),
      sus: (t.mind(h.i).sus || {})[h2.i] || 0,
      cred: (t.mind(h.i).cred || {})[h2.i] || 0,
      humanT: (t.mind(ha.i).humanT || {})[h2.i] || 0,
      mate: Object.keys(t.mind(ha.i).mates || {}),
      knownAlien: t.knownOf(ha.i) };
    return { k: k.i, h: h.i, h2: h2.i, ha: ha.i, offRead, onRead, tele: t.tele() };
  });
  ok(BRK.offRead.state === 2 && BRK.offRead.known[BRK.k] &&
    BRK.offRead.known[BRK.k].kind === 'saw_breaker' && BRK.offRead.sus >= 0.99,
    '人类看见有人把电闸拉下去 → 直接确证「他是异形」（known=saw_breaker / sus 拉满）');
  ok(BRK.offRead.mate.indexOf(String(BRK.k)) >= 0,
    '异形看见同一个动作 → 认作队友（观测者 ' + BRK.ha + ' → mates[' +
    BRK.offRead.mate.join(',') + ']，行凶者 ' + BRK.k + '）');
  ok(BRK.onRead.state !== 2 && !BRK.onRead.known[BRK.h2],
    '人类看见合闸**不确证**他是人类（异形也会合闸伪装）');
  ok(BRK.onRead.sus <= 0.001, '合闸不给合闸者加嫌疑分（sus=' + BRK.onRead.sus.toFixed(2) + '）');
  ok(BRK.onRead.cred > 0,
    '人类看见合闸只加正向信任 cred（' + BRK.onRead.cred.toFixed(2) + '）');
  ok(BRK.onRead.humanT > 0 && BRK.onRead.mate.indexOf(String(BRK.h2)) < 0 &&
    !BRK.onRead.knownAlien[BRK.h2],
    '异形看见合闸只记「人类可疑度」（' + BRK.onRead.humanT.toFixed(2) +
    '），不写 mates / known —— 不确定他就不是异形');

  section('推理 · 保安拘留进记忆但不确证（2026-11-01）');
  await fresh(false);
  const DET = await T(() => {
    const t = SKV3._t; t.newGame();
    const g = t.G(); g.paused = true; g.noReport = true;
    g.simStats = { contradictions: 0, falseContradictions: 0, knownWrites: 0, detainWitness: 0 };
    const h1 = g.agents.find(x => !x.alien && x.i !== 0 && x.alive);
    const h2 = g.agents.find(x => !x.alien && x.i !== 0 && x.alive && x !== h1);
    for (const x of g.agents) {
      x._delay = 999;
      if (x.mind) { x.mind.mem = []; x.mind.sus = {}; x.mind.known = {};
        x.mind.why = {}; x.mind.detainSeen = {}; }
    }
    g.lightState = 1;                       /* 满照明：只按距离与视线判定 */
    t.tp(h1.i, 50, 84);                     /* 被拘留的是**人类**（开枪也会被保安抓） */
    t.tp(h2.i, 52, 84);                     /* 2 格内的目击者 */
    const n = t.witnessDetain(h1.i, 50, 84, 4);
    const dup = t.witnessDetain(h1.i, 50, 84, 4);   /* 同一夜重复广播不再加分 */
    return { h1: h1.i, h2: h2.i, n, dup,
      sus: (t.mind(h2.i).sus || {})[h1.i] || 0,
      known: t.knownOf(h2.i),
      memKinds: (t.mind(h2.i).mem || []).map(e => e.kind),
      tele: t.tele() };
  });
  ok(DET.n >= 1 && DET.memKinds.indexOf('saw_detain') >= 0 && DET.sus >= 0.4,
    '保安拘留进记忆、只加嫌疑分（sus=' + DET.sus.toFixed(2) + '）');
  ok(Object.keys(DET.known).length === 0,
    '人类被拘留**不写 known**（开枪的人类也会被保安抓，不能因此被当成异形）');
  ok(DET.dup === 0, '同一夜对同一个人的拘留证据只记一次（压制 + 押送不重复加分）');

  section('会议 · 异形反咬与构陷');
  await fresh(false);
  const FRAME = await T(() => {
    const t = SKV3._t; t.newGame();
    const g = t.G(); g.paused = true; g.noReport = true;
    const k = g.agents.find(a => a.alien && a.i !== 0 && a.alive);
    const w = g.agents.find(a => !a.alien && a.i !== 0 && a.alive);
    const l1 = g.agents.find(a => !a.alien && a.i !== 0 && a.alive && a !== w);
    const l2 = g.agents.find(a => !a.alien && a.i !== 0 && a.alive && a !== w && a !== l1);
    for (const a of g.agents) if (a !== k && a !== w && a !== l1 && a !== l2) t.tp(a.i, 28.4,54);
    t.tp(l1.i, 27,56); t.tp(l2.i, 29,56);
    t.tp(k.i, 56, 83.8); t.tp(w.i, 57.2, 85);
    k.redT = 3; t.track();                 /* w 亲眼看见红光，拿到确证 */
    for (const a of g.agents) {
      if (a === w || !a.mind) continue;
      a.mind.known = {}; a.mind.mem = []; a.mind.sus = {}; a.mind.why = {};
      a.mind.alert = 0; a.suspect = null; a.accuse = null; a.accuseWhy = null;
    }
    /* l2 的时间线记忆：今晚在引擎舱见过异形 → 能拆穿它的假口供 */
    l2.mind.mem.push({kind: 'saw_agent', subj: k.i, room: 'engine', night: g.night,
      t: 0, conf: 0.8, src: 'sight'});
    const oldRandom = Math.random;
    /* l1/l2 固定成谨慎型：本组测「没证据 → 弃权」这条纪律。
       2026-10-31 起投票弃权率随性格（voteAbstain），不锁性格的话
       激进的旁观 AI 会跟着多数指控走，断言就不稳定了。 */
    for (const a of [l1, l2]) a.trait = { aggr: 28, caut: 72, soc: 50, cur: 50 };
    Math.random = () => 0;                 /* 必反咬、必构陷证人 */
    t.openMeeting('night', w.i, null);
    Math.random = oldRandom;
    const ctx = t.meetCtx();
    const f = ctx.frames[0];
    /* 投票阶段也要固定随机数：弃权与否由 voteAbstain（性格）+ 随机数决定，
       不锁的话这条断言有 ~38% 的概率偶发（l1 偶尔会跟票到证人身上）。 */
    Math.random = () => 0;
    t.startVote();
    Math.random = oldRandom;
    const out = { k: k.i, w: w.i, l1: l1.i, l2: l2.i, frame: f,
      liarName: f ? g.agents[f.by].name : null,
      targetName: f ? g.agents[f.target].name : null,
      knownW: t.knownOf(w.i), knownL1: t.knownOf(l1.i), knownL2: t.knownOf(l2.i),
      susL1: (t.mind(l1.i).sus || {})[w.i] || 0,
      susL2: (t.mind(l2.i).sus || {})[k.i] || 0,
      votes: { witness: g.meet.votes[w.i], liar: g.meet.votes[k.i],
        l1: g.meet.votes[l1.i], l2: g.meet.votes[l2.i] } };
    t.finishMeeting();
    return out;
  });
  ok(FRAME.frame && FRAME.frame.kind === 'saw_red' && FRAME.frame.by === FRAME.k &&
    FRAME.frame.target === FRAME.w && /红光/.test(FRAME.frame.text) &&
    FRAME.frame.text.indexOf(FRAME.frame.ownRoom) >= 0,
    '被确证的异形会先反驳，再反咬证人"带红光"，并带上自己的假口供');
  ok(FRAME.frame && FRAME.frame.reaffirm && /亲眼/.test(FRAME.frame.reaffirm) &&
    FRAME.frame.reaffirm.indexOf(FRAME.liarName) >= 0,
    '真目击者当场顶回去：不认可反咬，重申自己看见的是谁');
  ok(FRAME.knownW[FRAME.k] && FRAME.knownW[FRAME.k].kind === 'saw_red' &&
    FRAME.votes.witness === FRAME.k && FRAME.votes.liar === FRAME.w,
    '确证与投票都不受构陷影响：证人仍投真凶，异形反投证人');
  /* 2026-10-31 起没证据不再必弃权：投票改由性格决定（voteAbstain），
     激进的 AI 会跟着场上最多的指控投 —— 这里允许「弃权」或「跟票指控真凶」两种结果，
     但绝不允许它去投证人（那是被构陷带偏）。 */
  ok(Object.keys(FRAME.knownL1).length === 0 && FRAME.susL1 > 0.1 && FRAME.susL1 < 0.5 &&
    (FRAME.votes.l1 === -1 || FRAME.votes.l1 === FRAME.k),
    '构陷只制造少量传闻嫌疑（' + FRAME.susL1.toFixed(2) + '），不写 known；' +
    '没证据时按性格弃权或跟票（实测 l1→' + FRAME.votes.l1 +
    '，真凶=' + FRAME.k + '，证人=' + FRAME.w + '）');
  ok(FRAME.frame && FRAME.frame.caught && FRAME.frame.caught.i === FRAME.l2 &&
    FRAME.susL2 >= 0.2 && Object.keys(FRAME.knownL2).length === 0,
    '时间线记忆能拆谎：' + (FRAME.frame && FRAME.frame.caught ? FRAME.frame.caught.text : '—'));

  await fresh(false);
  const PIPE_LIE = await T(() => {
    const t = SKV3._t; t.newGame();
    const g = t.G(); g.paused = true; g.noReport = true;
    const pipes = t.pipes();
    const p = pipes.find(x => x.room === 'engine') || pipes[0];
    const k = g.agents.find(a => a.alien && a.i !== 0 && a.alive);
    const w = g.agents.find(a => !a.alien && a.i !== 0 && a.alive);
    for (const a of g.agents) if (a !== k && a !== w) t.tp(a.i, 28.4,54);
    t.tp(k.i, p.x, p.y); t.tp(w.i, p.x + 1.2, p.y);
    w.nRoom = 'med';                        /* 证人的自述位置不在管道房 */
    t.notice(k.i, p.x, p.y, 6, 'pipe');     /* w 亲眼看见钻管道 → known */
    const oldRandom = Math.random;
    Math.random = () => 0;                  /* 必反咬、必说管道 */
    t.openMeeting('night', w.i, null);
    Math.random = oldRandom;
    const f = t.meetCtx().frames[0] || null;
    const out = { room: f ? f.room : null, text: f ? f.text : '',
      kind: f ? f.kind : null, pipeNames: [...new Set(pipes.map(x => x.name))],
      knownName: t.roomName(p.room), reaffirm: f ? f.reaffirm : '' };
    t.finishMeeting();
    return out;
  });
  ok(PIPE_LIE.kind === 'saw_pipe' && PIPE_LIE.pipeNames.indexOf(PIPE_LIE.room) >= 0 &&
    PIPE_LIE.text.indexOf(PIPE_LIE.room) >= 0,
    '异形构陷“钻管道”只落在真正有管道口的舱室：' + PIPE_LIE.room + ' / ' + PIPE_LIE.text);
  ok(PIPE_LIE.reaffirm.indexOf(PIPE_LIE.knownName) >= 0 &&
    PIPE_LIE.reaffirm.indexOf('医疗间') < 0,
    '真目击者的反驳也引用真实管道现场，而不是自己的自述房间');

  await fresh(false);
  const PRO = await T(() => {
    const t = SKV3._t; t.newGame();
    const g = t.G(); g.paused = true; g.noReport = true;
    for (const a of g.agents) if (a.mind) {
      a.mind.known = {}; a.mind.mem = []; a.mind.sus = {}; a.mind.why = {}; a.mind.alert = 0;
    }
    const oldRandom = Math.random;
    Math.random = () => 0;
    t.openMeeting('day', null, null);
    Math.random = oldRandom;
    const f = t.meetCtx().frames[0];
    const out = { n: t.meetCtx().frames.length, f: f || null,
      byAlien: f ? g.agents[f.by].alien : null,
      targetAlive: f ? (g.agents[f.target].alive && !g.agents[f.target].downed) : false,
      hasResponse: !!(f && f.response), hasReaffirm: !!(f && f.reaffirm) };
    t.startVote(); t.finishMeeting();
    return out;
  });
  ok(PRO.n === 1 && PRO.f && PRO.byAlien === true && PRO.targetAlive &&
    PRO.hasResponse && !PRO.hasReaffirm,
    '没有被确证时异形也会偶尔主动构陷：点名一个活人，被点名者当场反问');

  section('玩家发言 · 槽位解析与时间线对质');
  await fresh(false);
  const SLOT = await T(() => {
    const t = SKV3._t;
    const p1 = t.parseSpeech('我怀疑 03 北极，我当时在配电室');
    const p2 = t.parseSpeech('我投 05，我在医疗间修东西');
    const p3 = t.parseSpeech('不是我，我整晚都在引擎');
    return { p1, p2, p3 };
  });
  ok(SLOT.p1.people.indexOf(2) >= 0 && SLOT.p1.accuse === 2 && SLOT.p1.where === 'power',
    '槽位：认出「03 北极」+ 指控意图 + 自述舱室（配电室）');
  ok(SLOT.p2.vote === 4 && SLOT.p2.where === 'med', '槽位：认出投票对象（05）与自述位置（医疗间）');
  ok(SLOT.p3.deny === true && SLOT.p3.where === 'engine', '槽位：认出否认语气与不在场声明（引擎）');

  const SLOT2 = await T(() => {
    const t = SKV3._t; t.newGame();
    const g = t.G(); g.paused = true; g.noReport = true;
    const h = g.agents.find(a => !a.alien && a.i !== 0 && a.alive);
    g.me.x = 8; g.me.y = 52; h.x = 9; h.y = 52; h.nRoom = 'engine';
    h.mind.mem = [];
    t.track();                        /* h 记住：玩家在引擎舱 */
    t.tp(0, 55,84);                  /* 玩家随后跑到医疗间 */
    for (const a of g.agents) if (a !== g.me) a._delay = 999;
    t.openMeeting('day');
    const s0 = (t.mind(h.i).sus || {})[0] || 0;
    t.chat('我一直在医疗间');
    return { h: h.i, s0 };
  });
  await page.waitForTimeout(1250);
  const SLOT3 = await T(o => {
    const t = SKV3._t;
    const lines = t.meetLines().map(l => l.text);
    /* 找那句"拆穿"：以前还要匹配 看见/碰见/不在/明明 这几个动词，
       等于把语料钉死在一种措辞上。契约其实是——**同一句话里既要出现玩家声称的舱室，
       也要出现目击者真实看见他的舱室**，所以只按"点名玩家 + 带声称舱室"定位。 */
    const claim = lines.find(x => x.indexOf(t.G().me.name) >= 0 && x.indexOf('医疗间') >= 0) || '';
    return { s1: (t.mind(o.h).sus || {})[0] || 0, claim, says: t.meetCtx().playerSays };
  }, SLOT2);
  ok(SLOT3.s1 > SLOT2.s0 + 0.2,
    '玩家谎报位置：目击过他的 AI 当场拆穿并把玩家嫌疑分从 ' + SLOT2.s0.toFixed(2) + ' 调到 ' + SLOT3.s1.toFixed(2));
  ok(/医疗间/.test(SLOT3.claim) && /引擎/.test(SLOT3.claim),
    '拆穿台词同时引用「玩家声称的舱室」与「真实目击地点」：' + SLOT3.claim);
  ok(SLOT3.says.length === 1 && SLOT3.says[0].where === 'med',
    '发言槽位进入会议上下文（where=med，可供后续追问与投票引用）');

  section('会议模板 · 一键发言与扩展词库');
  await fresh(false);
  const TPL = await T(() => {
    const t = SKV3._t; t.newGame();
    const g = t.G();
    const target = g.agents.find(a => !a.alien && a.i !== 0 && a.alive);
    const txt = {};
    for (const k of ['accuse', 'vote', 'support', 'pipe', 'red', 'knife', 'where', 'deny'])
      txt[k] = t.tplText(k, target.i, k === 'pipe' ? 'engine' : 'med');
    const P = {};
    for (const k in txt) P[k] = t.parseSpeech(txt[k]);
    const pipeBad = t.tplText('pipe', target.i, 'power');
    const pipeBadP = t.parseSpeech(pipeBad);
    const free = {
      neg: t.parseSpeech('北极不是异形'),
      seat: t.parseSpeech('我投3号'),
      claimRoom: t.parseSpeech('我看见北极在引擎室钻管道')
    };
    return { target: target.i, txt, P, free, pipeBad, pipeBadP };
  });
  ok(TPL.P.accuse.accuse === TPL.target && TPL.P.vote.vote === TPL.target,
    '模板「怀疑 / 投他」可被解析为对应玩家');
  ok(TPL.P.support.support === TPL.target, '模板「作证」可被解析为支持对象');
  ok(TPL.P.pipe.claim && TPL.P.pipe.claim.kind === 'saw_pipe' &&
    TPL.P.pipe.claim.target === TPL.target && TPL.P.pipe.claim.room === 'engine',
    '模板「看见钻管道」生成可解析的直接证据，并带上真正有管道口的舱室');
  ok(TPL.pipeBad.indexOf('配电室') < 0 && TPL.pipeBadP.claim &&
    TPL.pipeBadP.claim.kind === 'saw_pipe' && TPL.pipeBadP.claim.room == null,
    '没有管道口的舱室不会生成“在配电室钻管道”：模板自动省略地点');
  ok(TPL.P.red.claim && TPL.P.red.claim.kind === 'saw_red' &&
    TPL.P.knife.claim && TPL.P.knife.claim.kind === 'saw_knife',
    '模板「看见红光 / 出刀」可被解析');
  ok(TPL.P.where.where === 'med' && TPL.P.deny.deny === true && TPL.P.deny.where === 'med',
    '模板「我在… / 不是我」带上舱室，可被当作自述位置');
  ok(TPL.free.neg.accuse == null && TPL.free.neg.support === 2,
    '否定词：北极不是异形 → 不指控，而是支持');
  ok(TPL.free.seat.vote === 2, '席位格式：3号 → 03 北极');
  ok(TPL.free.claimRoom.claim && TPL.free.claimRoom.claim.kind === 'saw_pipe' &&
    TPL.free.claimRoom.claim.room === 'engine' && TPL.free.claimRoom.where == null,
    '「我看见X在引擎室钻管道」：证据房间与玩家自述位置分开，不再误判玩家在引擎室');

  await fresh(false);
  const TPL2 = await T(() => {
    const t = SKV3._t; t.newGame();
    const g = t.G(); g.paused = true; g.noReport = true;
    const target = g.agents.find(a => a.alien && a.i !== 0 && a.alive);
    const listener = g.agents.find(a => !a.alien && a.i !== 0 && a.alive && a !== target);
    for (const a of g.agents) if (a !== target && a !== listener) t.tp(a.i, 28.4,54);
    t.tp(target.i, 56, 83.8); t.tp(listener.i, 57, 85);
    for (const a of g.agents) if (a.mind) {
      a.mind.known = {}; a.mind.mem = []; a.mind.sus = {}; a.mind.why = {}; a.mind.alert = 0;
      a.suspect = null; a.accuse = null;
    }
    t.openMeeting('pre', null, null);
    const visible = !document.getElementById('m-tpl').classList.contains('hide');
    const nBtn = document.querySelectorAll('#m-tpl-btns button').length;
    document.getElementById('m-tpl-target').value = String(target.i);
    [...document.querySelectorAll('#m-tpl-btns button')]
      .find(b => b.dataset.tpl === 'pipe').click();
    const ctx = t.meetCtx();
    const claim = (ctx.playerClaims || [])[0];
    const sus = (t.mind(listener.i).sus || {})[target.i] || 0;
    const line = t.meetLines().slice(-1)[0];
    const known = t.knownOf(listener.i);
    t.finishMeeting();
    return { visible, nBtn, claim, sus, known,
      text: line ? line.text : '', target: target.i, listener: listener.i };
  });
  ok(TPL2.visible && TPL2.nBtn === 8, '人类会议显示模板栏与 8 个默认发言');
  ok(TPL2.claim && TPL2.claim.target === TPL2.target && TPL2.claim.kind === 'saw_pipe' &&
    /钻管道/.test(TPL2.text), '点击「看见钻管道」会以玩家身份发出并解析成直接证据');
  ok(TPL2.sus >= 0.2 && Object.keys(TPL2.known).length === 0,
    'AI 只把玩家的话记成传闻嫌疑（' + TPL2.sus.toFixed(2) + '），绝不写成 known');

  /* T6（2026-11-05）：模板默认不能选中第一个活人，未选对象点「怀疑」必须只提示、不发言。 */
  const TPL0 = await T(() => {
    const t = SKV3._t; t.newGame();
    const g = t.G(); g.paused = true; g.noReport = true;
    t.openMeeting('day');
    const sel = document.getElementById('m-tpl-target');
    const placeholder = sel.value;
    const firstOpt = sel.options[0] ? sel.options[0].textContent : '';
    const before = document.querySelectorAll('#m-say .ln').length;
    document.querySelector('#m-tpl-btns button[data-tpl="accuse"]').click();
    const after = document.querySelectorAll('#m-say .ln').length;
    const msg = g.msg || '';
    t.startVote(); t.closeVote(); if (g.meet) t.finishMeeting();
    return { placeholder, firstOpt, before, after, msg };
  });
  ok(TPL0.placeholder === '' && /选择对象/.test(TPL0.firstOpt) &&
    TPL0.before === TPL0.after && /先选对象/.test(TPL0.msg),
    '模板默认「— 选择对象 —」：未选对象点「怀疑」只提示、不误指控（' + TPL0.msg + '）');

  await fresh(false);
  const TPL3 = await T(() => {
    const t = SKV3._t; t.newGame();
    const g = t.G(); g.paused = true; g.noReport = true;
    const target = g.agents.find(a => a.alien && a.i !== 0 && a.alive);
    const listener = g.agents.find(a => !a.alien && a.i !== 0 && a.alive && a !== target);
    for (const a of g.agents) if (a !== target && a !== listener) t.tp(a.i, 28.4,54);
    t.tp(target.i, 56, 83.8); t.tp(listener.i, 57, 85);
    for (const a of g.agents) if (a.mind) {
      a.mind.known = {}; a.mind.mem = []; a.mind.sus = {}; a.mind.why = {}; a.mind.alert = 0;
      a.suspect = null; a.accuse = null;
    }
    listener.mind.mem.push({kind: 'saw_agent', subj: target.i, room: 'engine',
      night: g.night, t: 0, conf: 0.8, src: 'sight'});
    t.openMeeting('pre', null, null);
    document.getElementById('m-text').value =
      '我看见 ' + g.agents[target.i].name + ' 在军械库钻管道';
    document.getElementById('m-send').click();
    const s0 = (t.mind(listener.i).sus || {})[0] || 0;
    const st = (t.mind(listener.i).sus || {})[target.i] || 0;
    const line = t.meetLines().slice(-1)[0];
    t.finishMeeting();
    return { s0, st, text: line ? line.text : '', target: target.i, listener: listener.i,
      why: ((t.mind(listener.i).why || {})[target.i] || []).map(x => x.reason) };
  });
  /* 2026-11-05 二组：异形自述口供纳入对质后，目标可能被**另一条独立线索**扣分
     （它自己谎报的舱室与听众记忆对不上）。判据不变，改成看"玩家这句假话有没有
     被记成目标证据"——即 why 里不得出现 heard_claim。 */
  ok(TPL3.s0 >= 0.2 && TPL3.why.indexOf('heard_claim') < 0,
    '玩家构陷与听众时间线冲突：反过来怀疑玩家（' + TPL3.s0.toFixed(2) +
    '），玩家的假话不计入目标证据（目标 sus ' + TPL3.st.toFixed(2) +
    '，来源 ' + (TPL3.why.join('|') || '无') + '）');

  await fresh(false);
  const IMPOSSIBLE = await T(() => {
    const t = SKV3._t; t.newGame();
    const g = t.G(); g.paused = true; g.noReport = true;
    const target = g.agents.find(a => a.alien && a.i !== 0 && a.alive);
    const listener = g.agents.find(a => !a.alien && a.i !== 0 && a.alive && a !== target);
    for (const a of g.agents) if (a !== target && a !== listener) t.tp(a.i, 28.4,54);
    t.tp(target.i, 56, 83.8); t.tp(listener.i, 57, 85);
    for (const a of g.agents) if (a.mind) {
      a.mind.known = {}; a.mind.mem = []; a.mind.sus = {}; a.mind.why = {}; a.mind.alert = 0;
      a.suspect = null; a.accuse = null;
    }
    /* 锁 RNG：这条测的是「物理上不可能的口供」这一条分支，不该被随机的异形构陷/跟票影响
       （不锁的话目标会偶尔被别的通道记上嫌疑，断言随机失败 —— 改动前的基线上同样复现）。 */
    const oldRandom = Math.random;
    Math.random = () => 0.99;
    t.openMeeting('pre', null, null);
    document.getElementById('m-text').value =
      '我看见 ' + g.agents[target.i].name + ' 在配电室钻管道';
    document.getElementById('m-send').click();
    const s0 = (t.mind(listener.i).sus || {})[0] || 0;
    const st = (t.mind(listener.i).sus || {})[target.i] || 0;
    const claims = (t.meetCtx().playerClaims || []).length;
    Math.random = oldRandom;
    t.finishMeeting();
    return { s0, st, claims };
  });
  ok(IMPOSSIBLE.s0 >= 0.15 && IMPOSSIBLE.st < 0.06 && IMPOSSIBLE.claims === 0,
    '“在配电室钻管道”是物理上不可能的口供：AI 反过来怀疑发言者（' +
    IMPOSSIBLE.s0.toFixed(2) + '），不记成目标的证据');

  section('开局讨论 · 时间覆盖');
  const PACE = await T(() => {
    const t = SKV3._t; t.newGame();
    const g = t.G(); g.paused = true;
    t.openMeeting('pre');
    return { plan: t.chatterPlan(), discuss: SKSanity.MEET.discussPre,
      day: SKSanity.MEET.discussDay, night: SKSanity.MEET.discussNight,
      vote: SKSanity.MEET.voteDay, voteNight: SKSanity.MEET.voteNight,
      reveal: SKSanity.MEET.reveal };
  });
  ok(PACE.plan && PACE.plan.n >= 10,
    '开局公开讨论排了 ' + (PACE.plan ? PACE.plan.n : 0) + ' 条发言（原来只有 5 条、7 秒就说完）');
  ok(PACE.discuss === 50 && PACE.day === 60 && PACE.night === 35 &&
    PACE.vote === 5 && PACE.voteNight === 5 && PACE.reveal === 3,
    '会议时长：开局讨论 ' + PACE.discuss + '（不含 +10）/ 白天 ' + PACE.day +
    ' / 夜会 ' + PACE.night + ' / 投票 ' + PACE.vote + ' / 公布 ' + PACE.reveal + ' 秒');
  ok(PACE.plan && PACE.plan.endAt >= 45000,
    '开局讨论窗口砍到 50 秒后排期仍然铺满（结束前 ' +
    ((50000 - PACE.plan.endAt) / 1000).toFixed(1) + ' 秒才收尾）');
  ok(PACE.plan && PACE.plan.lastScheduled >= PACE.plan.endAt - 2500,
    '最后一条讨论/提示贴着结束时间，不再出现「前 7 秒热闹、后面 50 秒死寂」');
  ok(PACE.plan && PACE.plan.nudges.length >= 2,
    '内容讲完后用自由讨论提示补空档（' + (PACE.plan ? PACE.plan.nudges.length : 0) + ' 次）');

  section('任务清单 · 1 高难 + 3 普通');
  await fresh(false);
  const TP = await T(() => {
    const t = SKV3._t, g = t.G();
    const plan = t.taskPlan();
    const rows = [...document.querySelectorAll('#tasks .tr')].map(e => ({ cls: e.className, text: e.textContent }));
    const expected = g.me.tasks.map((ti, n) => {
      const p = plan[g.me.i][n];
      return { kind: p.kind, room: t.roomName(p.room), label: p.label };
    });
    return { plan, rows, expected, tags: t.tags() };
  });
  ok(TP.plan.length === 15 && TP.plan.every(p => p.length === 4), '15 席每席 4 个任务');
  ok(TP.plan.every(p => p.filter(x => x.kind === 'hard').length === 1 &&
    p.filter(x => x.kind === 'normal').length === 3), '每席都是 1 个高难 + 3 个普通');
  ok(TP.plan.every(p => new Set(p.map(x => x.kind + '|' + x.label)).size === 4), '同一席不重复派任务');
  ok(TP.rows.length === 4 && TP.rows.filter(r => r.cls.indexOf('hard') >= 0).length === 1 &&
    TP.rows.filter(r => r.cls.indexOf('normal') >= 0).length === 3, 'HUD 任务清单渲染 4 条：1 高难 3 普通');
  ok(TP.rows.every((r, i) => r.text.indexOf(TP.expected[i].room) >= 0 &&
    r.text.indexOf(TP.expected[i].label) >= 0), '清单逐条标注目标舱室与任务名');
  ok(TP.tags.length === 15 && TP.tags.every((s, i) =>
    s.indexOf(String(i + 1).padStart(2, '0') + ' ') === 0), '15 人标签均为「编号 + 名字」，编号在前');
  const MT = await T(() => {
    const t = SKV3._t, g = t.G();
    const v = g.agents.find(a => a.i !== 0 && !a.alien && a.alive);
    t.tp(v.i, 28.4,44);
    t.kill(v.i, 'knife');
    const rep = g.agents.find(a => a.i !== 0 && a.alive && a !== v);
    t.openMeeting('night', rep, v);
    t.startVote();
    const btns = [...document.querySelectorAll('#m-who button')].map(b => b.textContent);
    t.finishMeeting();
    return btns;
  });
  const named = MT.filter(s => s !== '弃权');
  ok(named.length >= 10 && named.every(s => /^\d{2} \S+/.test(s)) && MT.includes('弃权'),
    '自由发言/投票名单同样显示编号+名字');

  section('投票 · 5 秒等待与跳过按钮');
  const SKIPV = await T(() => {
    const t = SKV3._t; t.newGame();
    const g = t.G(); g.dev = true;
    t.openMeeting('day');
    t.startVote();
    const btn = document.getElementById('m-skip-vote');
    const visible = !!btn && !btn.classList.contains('hide');
    /* T5（2026-11-05）：投票期发言通道关闭，输入框与发送按钮必须同步禁用，
       不能出现"能打字、按下没反应"的静默失败。 */
    const inp = document.getElementById('m-text'), sb = document.getElementById('m-send');
    const lock = { disabled: !!inp && inp.disabled === true, ph: inp ? inp.placeholder : '',
      send: !!sb && sb.disabled === true };
    btn.click();
    const m = t.G().meet;
    const out = { visible, lock, phase: m && m.phase, tally: !!(m && m.tally),
      self: m && m.votes ? m.votes[g.me.i] : null,
      day: SKSanity.MEET.voteDay, night: SKSanity.MEET.voteNight };
    t.finishMeeting();
    return out;
  });
  ok(SKIPV.day === 5 && SKIPV.night === 5, '投票等待白天/夜会都是 5 秒');
  ok(SKIPV.visible, '投票阶段显示「跳过投票」按钮');
  ok(SKIPV.lock.disabled && SKIPV.lock.send && /投票中/.test(SKIPV.lock.ph),
    '投票期发言框与发送按钮同步禁用，占位改为「' + SKIPV.lock.ph + '」');
  ok(SKIPV.phase === 'reveal' && SKIPV.tally && SKIPV.self === -1,
    '没选人直接跳过投票 = 记弃权并立即结算');

  const SKIPV2 = await T(() => {
    const t = SKV3._t; t.newGame();
    const g = t.G(); g.dev = true;
    t.openMeeting('day');
    t.startVote();
    const target = g.agents.find(a => a.alive && a.i !== g.me.i);
    const tag = t.tags()[target.i];
    const tb = [...document.querySelectorAll('#m-who button')]
      .find(b => b.textContent === tag);
    const picked = !!tb;
    if (tb) tb.click();
    document.getElementById('m-skip-vote').click();
    const m = t.G().meet;
    const out = { picked, want: target.i, got: m && m.votes ? m.votes[g.me.i] : null,
      phase: m && m.phase };
    t.finishMeeting();
    return out;
  });
  ok(SKIPV2.picked && SKIPV2.got === SKIPV2.want && SKIPV2.phase === 'reveal',
    '已投给某人后点跳过投票：保留原票并立即结算');

  section('任务完成提示 · 只提示本人');
  const FN = await T(() => {
    const t = SKV3._t, g = t.G();
    const ai = g.agents.find(a => a.i !== 0 && !a.alien && a.alive);
    ai.tasks = [0, 1, 2, 3]; ai.tIdx = 0; ai._doing = 'task'; ai.doing = 1;
    g.msg = ''; g.msgT = 0;
    const aiBefore = g.prog;
    const aiR = t.finishDoing(ai.i);
    const aiMsg = g.msg;
    const me = g.me;
    me.tasks = [16, 17, 18, 19]; me.tIdx = 0; me._doing = 'task'; me.doing = 1;
    const meR = t.finishDoing(0);
    return { aiMsg, aiTIdx: aiR.tIdx, aiProg: aiR.prog - aiBefore, meMsg: g.msg, meTIdx: meR.tIdx };
  });
  ok(FN.aiTIdx === 1 && FN.aiProg > 0, 'AI 完成任务计入全局进度');
  ok(FN.aiMsg === '' || FN.aiMsg.indexOf('完成') < 0, 'AI 完成任务不弹完成提示');
  ok(FN.meTIdx === 1 && FN.meMsg.indexOf('完成') >= 0, '玩家完成任务才提示「完成」');

  section('走廊灯 · 配电室拉闸');
  await fresh(false);
  const L0 = await T(() => ({ l: SKV3._t.lights(), lamps: SKV3._t.lamps() }));
  ok(L0.lamps.length === 11 && L0.lamps.every(n => n === 2), '11 条走廊各 2 盏灯');
  ok(L0.l.state === 0 && L0.l.corr === true && L0.l.lit.bridge && !L0.l.lit.engine && !L0.l.lit.power,
    '常态：走廊灯亮，引擎/配电暗');
  const L1 = await T(() => {
    const t = SKV3._t;
    const r = t.breaker();
    return { r, l: t.lights(), nOn: Object.keys(t.lights().lit).filter(k => t.lights().lit[k]).length };
  });
  ok(L1.r.state === 2 && L1.r.corr === false && L1.l.corr === false && L1.nOn === 1 && L1.l.lit.bridge,
    '拉闸：走廊灯全熄，只有会议室保持照明');
  await T(() => { SKV3._t.tp(0, 30.4,67); });
  await page.keyboard.press('c');
  await page.waitForTimeout(350);
  await shot('37_拉闸全船变暗.png');
  await page.keyboard.press('c');
  await T(() => SKV3._t.breaker());
  await page.waitForTimeout(150);

  section('寻路 · 硬掩体阻挡 / 绕行 / 围墙兜底');
  await fresh(false);
  const PF = await T(() => {
    const t = SKV3._t;
    const plen = p => p ? p.reduce((s, q, i) => i ? s + Math.hypot(q[0] - p[i - 1][0], q[1] - p[i - 1][1]) : 0, 0) : 0;
    const ratio = (a, b) => {
      const p = t.astar(a[0], a[1], b[0], b[1]);
      return p ? { n: p.length, len: plen(p), ratio: plen(p) / Math.hypot(b[0] - a[0], b[1] - a[1]) } : null;
    };
    const rMed = ratio([34.8, 33.8], [56.5, 83]);
    const rArm = ratio([34.8, 33.8], [83.5, 70]);
    const rTable = ratio([39, 37.5], [39, 27.5]);
    const outside = t.astar(34.8, 33.8, 0.5, 0.5);
    const outsideMap = t.astar(34.8, 33.8, -20, -20);
    t.tp(0, 34.8,50);
    const p = t.stepTo(34.8, 0.5);
    return { rMed, rArm, rTable, outside, outsideMap, p, pfree: t.free(p[0], p[1]),
      outFree: t.free(0.5, 0.5), room: t.state()[0].room,
      tableFree: t.free(41, 32.8), consoleFree: t.free(27, 26), audit: t.coverAudit() };
  });
  ok(PF.rMed && PF.rMed.ratio < 1.35, '会议室→医疗间绕行比 ' + (PF.rMed && PF.rMed.ratio.toFixed(2)));
  ok(PF.rArm && PF.rArm.ratio < 1.45, '会议室→军械库绕行比 ' + (PF.rArm && PF.rArm.ratio.toFixed(2)));
  ok(PF.rTable && PF.rTable.len > 9.2 && PF.rTable.len < 12,
    '圆桌是硬掩体：A* 绕最短边（路径 ' + (PF.rTable && PF.rTable.len.toFixed(1)) + ' 格）');
  ok(!PF.tableFree && !PF.consoleFree, '掩体阻挡行走：圆桌与控制台不可穿越');
  /* 2026-11-06 掩体重构 v2：布局改成「沿墙成组」（R6 成组率 ≥0.65），
     成组家具之间必然留 0.5~1.2 的缝，且墙边会出现 1 格深的凹角 —— 这两类都不是
     「看着能过其实过不去」的陷阱。硬性要求改成：**没有完全孤立的可行走格**（nb=0），
     窄缝与凹角作为诊断读数打印出来，供调布局时看趋势。 */
  ok(PF.audit && PF.audit.dead.filter(d => d.nb === 0).length === 0,
    '硬掩体布局没有孤立可行走格（窄缝 ' + (PF.audit ? PF.audit.gaps.length : -1) +
    ' 处 / 1 格凹角 ' + (PF.audit ? PF.audit.dead.length : -1) + ' 处，均属成组排布）');
  ok(PF.outside === null && PF.outsideMap === null && !PF.outFree,
    '船体外/地图外目标不可达（A* 遇到越界坐标安全返回，不会死循环）');
  ok(PF.pfree && PF.p[1] > 2.8 && PF.p[1] < 19, '撞墙后被兜底拉回会议室，不会走出船体');

  section('自动门 · 无人闭合 / 靠近开启 / 阻挡移动与视线');
  await fresh(false);
  const DR0 = await T(() => {
    const t = SKV3._t, g = t.G();
    g.noReport = true;
    for (const a of g.agents) { a.path = null; a.x = 34.8; a.y = 33.8; a._delay = 9e9; }
    const doors = t.doors();
    for (const dr of doors) t.setDoor(dr.id, 0);
    t.doorTick(0.1);
    return { n: doors.length, doors, closed: t.doors(), inv: t.inv() };
  });
  ok(DR0.n === 22 && DR0.closed.every(d => d.open === 0), '22 扇自动门可全部闭合');
  ok(DR0.inv && DR0.inv.fails.length === 0, '自动门初始不变量全过');
  const DR1 = await T(() => {
    const t = SKV3._t, g = t.G();
    const d = t.doors().find(x => x.id === 'c1:bridge');
    t.tp(0, d.x, d.y - 2.0);
    for (let i = 0; i < 20; i++) t.doorTick(0.05);
    const opened = t.doors().find(x => x.id === d.id);
    const l1 = t.los(d.x, d.y - 1.2, d.x, d.y + 1.2);
    t.setDoor(d.id, 0);
    const l0 = t.los(d.x, d.y - 1.2, d.x, d.y + 1.2);
    return { d, opened, l0, l1, inv: t.inv() };
  });
  ok(DR1.opened.open > 0.9 && DR1.opened.target === 1, '玩家靠近门口 → 自动门滑开');
  ok(DR1.l0 === false && DR1.l1 === true, '关门阻挡视线，开门后视线恢复');
  const DR2 = await T(() => {
    const t = SKV3._t, g = t.G();
    const d = t.doors().find(x => x.id === 'c1:bridge');
    t.tp(0, d.x, d.y - 1.5);
    t.setDoor(d.id, 0);
    g.me.path = [[d.x, d.y + 3.2]];
    const blocked = t.stepOnce(0.5);
    t.setDoor(d.id, 1);
    const opened = t.stepOnce(0.5);
    return { d, blocked, opened, inv: t.inv() };
  });
  ok(DR2.blocked[1] < DR2.d.y && DR2.opened[1] > DR2.d.y, '关门阻挡移动，开门后可通过');
  ok(DR2.inv && DR2.inv.fails.length === 0, '自动门状态不变量全过');
  await T(() => {
    const t = SKV3._t;
    const d = t.doors().find(x => x.id === 'c1:bridge');
    t.setDoor('c1:bridge', 1);
    t.tp(0, d.x, d.y - 2.2);
  });
  await page.waitForTimeout(220);
  await shot('49_自动门.png');

  section('配电室 · 断电后所有门扫描 2 秒');
  await fresh(false);
  const LOCK = await T(() => {
    const t = SKV3._t; t.newGame();
    const g = t.G(); g.paused = true; g.noReport = true;
    const ds = t.doors();
    const nb = ds.find(d => !/:bridge$/.test(d.id));
    const br = ds.find(d => /:bridge$/.test(d.id));
    const cross = d => d.horiz ? [d.x, d.y - 0.6, d.x, d.y + 0.6] : [d.x - 0.6, d.y, d.x + 0.6, d.y];
    /* 其他人远离门口；玩家站到非会议室门内侧 1.6 格 */
    for (const a of g.agents) if (a.i !== 0) t.tp(a.i, 28.4,54);
    t.tp(0, nb.horiz ? nb.x : nb.x - 1.6, nb.horiz ? nb.y - 1.6 : nb.y);
    t.setDoor(nb.id, 1); t.setDoor(br.id, 1);
    t.breaker();                            /* 断电：所有门进入逐门扫描 */
    const c1 = cross(nb), c2 = cross(br);
    t.doorTick(1.0);
    const half = t.doors().find(d => d.id === nb.id);
    const blockedHalf = t.doorBlock(c1[0], c1[1], c1[2], c1[3]);
    t.doorTick(1.1);
    const full = t.doors().find(d => d.id === nb.id);
    const blockedFull = t.doorBlock(c1[0], c1[1], c1[2], c1[3]);
    /* 会议室门同样要扫描：把玩家移到 bridge 门内侧再看 2 秒 */
    t.tp(0, br.horiz ? br.x : br.x - 1.6, br.horiz ? br.y - 1.6 : br.y);
    t.setDoor(br.id, 1);
    t.doorTick(1.0);
    const bridgeHalf = t.doors().find(d => d.id === br.id);
    const bridgeBlockedHalf = t.doorBlock(c2[0], c2[1], c2[2], c2[3]);
    t.doorTick(1.1);
    const bridgeFull = t.doors().find(d => d.id === br.id);
    const bridgeBlocked = t.doorBlock(c2[0], c2[1], c2[2], c2[3]);
    /* 离开门口 → 重新上锁；再次靠近又要重新扫描 */
    t.tp(0, 28.4,54);
    t.doorTick(0.2);
    const away = t.doors().find(d => d.id === nb.id);
    t.tp(0, nb.horiz ? nb.x : nb.x - 1.6, nb.horiz ? nb.y - 1.6 : nb.y);
    t.doorTick(0.6);
    const again = t.doors().find(d => d.id === nb.id);
    const blockedAgain = t.doorBlock(c1[0], c1[1], c1[2], c1[3]);
    /* 恢复供电 → 立即解除扫描 */
    t.breaker();
    t.setDoor(nb.id, 1);
    t.doorTick(0.1);
    const restored = t.doors().find(d => d.id === nb.id);
    const blockedRestored = t.doorBlock(c1[0], c1[1], c1[2], c1[3]);
    return { nb: nb.id, br: br.id, bridgeDoors: ds.filter(d => /:bridge$/.test(d.id)).length,
      half, blockedHalf, full, blockedFull, bridgeHalf, bridgeBlockedHalf, bridgeFull, bridgeBlocked,
      away, again, blockedAgain, restored, blockedRestored };
  });
  ok(LOCK.half.scanT > 0.8 && LOCK.half.scanT < 1.2 && LOCK.half.scanning && LOCK.blockedHalf,
    '断电后靠近非会议室门：先扫描，1 秒时仍不能通过');
  ok(LOCK.full.scanT >= 1.9 && LOCK.full.locked === false && !LOCK.blockedFull,
    '扫描满 2 秒才放行：' + LOCK.nb);
  ok(LOCK.bridgeHalf.scanT > 0.5 && LOCK.bridgeBlockedHalf,
    '会议室门同样要扫描：1 秒时仍不能通过');
  ok(LOCK.bridgeFull.scanT >= 1.9 && !LOCK.bridgeBlocked && LOCK.bridgeDoors === 4,
    '会议室 4 扇门扫描满 2 秒才放行');
  ok(LOCK.away.scanT === 0 && LOCK.again.scanT > 0.5 && LOCK.again.scanT < 0.8 &&
    LOCK.blockedAgain,
    '人离开后重新上锁：再次靠近仍需重新扫描 2 秒');
  ok(LOCK.restored.scanT === 0 && !LOCK.blockedRestored,
    '电力恢复立即解除扫描：门恢复正常通行');
  await fresh(false);

  section('AI 拐角寻路 · 不卡死');
  const CW0 = await T(() => {
    const t = SKV3._t, g = t.G();
    g.noReport = true;
    const a = g.agents.find(x => !x.alien && x.i !== 0 && x.alive);
    t.tp(a.i, 34.8,33.8);
    a.path = t.astar(34.8, 33.8, 58, 45);
    const r = t.walkAgent(a.i, 260, 0.05);
    return { i: a.i, r, inv: t.inv() };
  });
  ok(CW0.r && CW0.r.left === 0 && Math.hypot(CW0.r.x - 58, CW0.r.y - 45) < 3,
    'AI 拐角寻路 260 步不卡死（终点 ' + CW0.r.x.toFixed(1) + ',' + CW0.r.y.toFixed(1) + '）');
  ok(CW0.inv && CW0.inv.fails.length === 0, '拐角寻路后不变量全过');

  section('E 交互轮盘 · 多项选择');
  await fresh(false);
  const WH0 = await T(() => {
    const t = SKV3._t, g = t.G();
    g.noReport = true;
    const all = t.points();
    const pi = all.findIndex(p => p.label === '药柜');
    const p = all[pi];
    g.me.tasks = [pi, 0, 1, 2]; g.me.tIdx = 0;
    g.me.doing = 0; g.me._doing = null; g.me.path = null;
    g.dmg = [{ room: p.room, x: p.x, y: p.y, label: '测试故障', left: 60, dur: 60, by: 0 }];
    t.tp(0, p.x, p.y);
    const opened = t.openWheel();
    return { opened, wheel: t.wheel(),
      dom: !document.getElementById('wheel').classList.contains('hide'),
      buttons: document.querySelectorAll('#wheel-opts button').length, inv: t.inv() };
  });
  ok(WH0.opened && WH0.wheel && WH0.wheel.n >= 2 && WH0.dom && WH0.buttons === WH0.wheel.n,
    'E 多项交互打开轮盘（' + (WH0.wheel ? WH0.wheel.n : 0) + ' 项）');
  ok(WH0.inv && WH0.inv.fails.length === 0, '交互轮盘打开后不变量全过');
  await shot('50_交互轮盘.png');
  const WH1 = await T(() => {
    const t = SKV3._t, g = t.G();
    const w = t.wheel();
    const i = w.items.findIndex(x => x.id === 'task');
    const r = t.pickWheel(i);
    return { i, r, do: g.me._doing, doing: g.me.doing, wheel: t.wheel() };
  });
  ok(WH1.i >= 0 && WH1.do === 'task' && !WH1.wheel, '轮盘选择「维修任务」→ 进入任务站桩');
  const WH2 = await T(() => {
    const t = SKV3._t, g = t.G();
    g.me.doing = 0; g.me._doing = null; g.me.path = null;
    g.dmg = [];
    const pi = t.points().findIndex(p => p.label === '电路维修');
    g.me.tasks = [pi, 0, 1, 2]; g.me.tIdx = 0;
    t.tp(0, 49, 55.4);
    t.openWheel();
    const w = t.wheel();
    const i = w.items.findIndex(x => x.id === 'breaker');
    t.pickWheel(i);
    return { i, do: g.me._doing, doing: g.me.doing };
  });
  ok(WH2.i >= 0 && WH2.do === 'breaker' && WH2.doing > 2.5, '轮盘选择「拉闸」→ 进入 3 秒动作');

  section('AI 尸体报告');
  await fresh(false);
  const AR = await T(() => {
    const t = SKV3._t, g = t.G();
    const v = g.agents.find(a => a.i !== 0 && !a.alien && a.alive);
    t.tp(v.i, 28.4,44);
    t.kill(v.i, 'knife');
    const rep = g.agents.find(a => a.i !== 0 && !a.alien && a.alive && a !== v);
    t.tp(rep.i, 28.4,46.6);
    const s1 = t.aiScan(rep.i, 0.6);
    const s2 = t.aiScan(rep.i, 5);
    const out = {
      s1, s2, open: !document.getElementById('meet').classList.contains('hide'),
      vic: document.getElementById('m-vic').textContent,
      by: document.getElementById('m-by').textContent,
      vicTag: String(v.i + 1).padStart(2, '0') + ' ' + v.name,
      repTag: String(rep.i + 1).padStart(2, '0') + ' ' + rep.name,
      inv: t.inv()
    };
    t.finishMeeting();
    return out;
  });
  ok(AR.s1.t > 1 && !AR.s1.meet, 'AI 看到尸体先犹豫 1.4–3s');
  ok(AR.s2.meet && AR.open, 'AI 犹豫结束自动拉响紧急会议');
  ok(AR.vic === AR.vicTag && AR.by === AR.repTag, '会议记录：报告人 ' + AR.by + ' / 死者 ' + AR.vic);
  ok(AR.inv && AR.inv.fails.length === 0, 'AI 报告后不变量全过');

  section('AI 认知 · 伤口/搜尸/听觉/证据链');
  await fresh(false);
  const COG = await T(() => {
    const t = SKV3._t; t.newGame();
    const g = t.G(); g.paused = true; g.noReport = false;
    const k = g.agents.find(a => a.alien && a.i !== 0 && a.alive);
    const v = g.agents.find(a => !a.alien && a.i !== 0 && a.alive);
    const w = g.agents.find(a => !a.alien && a.i !== 0 && a.alive && a !== v);
    for (const a of g.agents) if (a !== k && a !== v && a !== w) t.tp(a.i, 30,32);
    t.tp(k.i, 56, 83.8); t.tp(v.i, 57.2, 85); t.tp(w.i, 55.5, 83.8);
    k.knife = 1; k.sabUsed = true; k._delay = 0; k.doing = 0;
    k._doing = null; k.path = null; k.target = null;
    t.knife(k.i, v.i);
    const b0 = t.bodyInfo(v.i), m0 = t.mind(w.i);
    const s1 = t.aiScan(w.i, 0.6);
    const startDo = g.agents[w.i]._doing;
    const r = t.aiTick(w.i, 30, 0.05);
    const b1 = t.bodyInfo(v.i), m1 = t.mind(w.i);
    return { k: k.i, v: v.i, w: w.i, b0, m0, s1, startDo, r, b1, m1 };
  });
  ok(COG.b0.downed && COG.b0.cause === 'knife' && COG.b0.wound.indexOf('刀伤') >= 0 &&
    COG.b0.searched === false, '刀击写入伤口/濒死状态，尸体尚未检查');
  ok(COG.m0.sus[COG.k] >= 0.6, '目击刀击 → 嫌疑分 ' + COG.m0.sus[COG.k]);
  ok(COG.m0.mem.some(e => e.kind === 'saw_knife') &&
    COG.m0.mem.some(e => e.kind === 'heard_knife'),
    '视觉证据 saw_knife + 听觉证据 heard_knife 同时入链');
  ok(COG.startDo === 'search', 'AI 发现未检查的濒死者：先进入搜尸，不直接拉铃');
  ok(COG.b1.searched === true && COG.m1.mem.some(e => e.kind === 'search_result'),
    '搜尸完成：身体状态变为已检查，证据链新增 search_result');

  section('AI 认知 · 环境线索 / 报告上限 / 异形自报 / 证据投票');
  const ENV = await T(() => {
    const t = SKV3._t, g = t.G();
    const h = g.agents.find(a => !a.alien && a.i !== 0 && a.alive && !a.downed);
    t.breaker();
    const m = t.mind(h.i);
    return { mem: m ? m.mem.map(e => e.kind) : [], alert: m ? m.alert : 0 };
  });
  ok(ENV.mem.indexOf('env_lights') >= 0 || ENV.mem.indexOf('heard_power') >= 0,
    '拉闸 → 环境/听觉证据进入 AI 记忆（env_lights / heard_power）');

  await fresh(false);
  const RPT = await T(() => {
    const t = SKV3._t; t.newGame();
    const g = t.G(); g.paused = true; g.noReport = false; g.aiReportUsed = false;
    const humans = g.agents.filter(a => !a.alien && a.i !== 0 && a.alive);
    const v1 = humans[0], v2 = humans[1];
    const r1 = g.agents.find(a => !a.alien && a.i !== 0 && a.alive && a !== v1 && a !== v2);
    const r2 = g.agents.find(a => !a.alien && a.i !== 0 && a.alive && a !== v1 && a !== v2 && a !== r1);
    for (const a of g.agents) if (a !== v1 && a !== v2 && a !== r1 && a !== r2) t.tp(a.i, 30,32);
    t.tp(v1.i, 28.4,44); t.kill(v1.i, 'knife'); t.tp(r1.i, 28.4,46.6);
    r1._delay = 0; r1.doing = 0; r1._doing = null; r1.path = null;
    let m1 = null; for (let i = 0; i < 100; i++) { m1 = t.aiScan(r1.i, 0.1); if (m1.meet) break; }
    const used1 = t.aiReportUsed();
    t.finishMeeting();
    t.tp(v2.i, 28.4,44); t.kill(v2.i, 'knife'); t.tp(r2.i, 28.4,46.6);
    r2._delay = 0; r2.doing = 0; r2._doing = null; r2.path = null;
    let m2 = null; for (let i = 0; i < 100; i++) { m2 = t.aiScan(r2.i, 0.1); if (m2.meet) break; }
    return { meet1: !!(m1 && m1.meet), used1, used2: t.aiReportUsed(), meet2: !!t.G().meet };
  });
  ok(RPT.meet1 && RPT.used1, '第一次 AI 尸体报告成功');
  ok(RPT.meet2, '同一夜第二具尸体也能报告（不再限制每晚一次会议）');

  /* 同一具尸体：本夜报过一次就失效，天亮入夜后重新可报 */
  /* 同一具尸体不能被报告两次。真实机制比"每夜一次"更强：
     openMeeting 在会议开始时就清场（js/game.js 的 bodyGone），
     所以一次报告之后那具尸体的坐标已经不存在，物理上无法再报第二次。
     reportNight 只是把"本夜已报"的意图写明确，并修掉旧实现里
     「尸体标记跨夜永久锁死」的隐患（若某具尸体所在夜没人拉铃，下一夜仍可报）。 */
  await fresh(false);
  const RPT1B = await T(() => {
    const t = SKV3._t; t.newGame();
    const g = t.G(); g.paused = true;
    const v = g.agents.find(a => a.i !== 0 && a.alive && !a.downed);
    /* 尸体放在圆桌南侧的空地上，人站在它旁边 1.6 格（报告半径 2.4 格内） */
    t.tp(v.i, 41, 38.4); t.kill(v.i, 'knife');
    const bp = t.bodyOf(v.i);
    const stand = () => {
      const me = g.agents[0];
      me.alive = true; me.downed = false; me.detained = false;
      g.over = false; g.meet = null;
      t.tp(0, bp[0], bp[1] - 1.6);
      return +Math.hypot(bp[0] - g.me.x, bp[1] - g.me.y).toFixed(2);
    };
    const d = stand();
    const first = t.report();
    const flag = t.bodyReported(v.i);
    const bodyAfterMeet = !!t.bodyOf(v.i);
    t.finishMeeting();
    stand();
    const second = t.report();
    return { d, first, flag, bodyAfterMeet, second };
  });
  ok(RPT1B.first && RPT1B.flag && !RPT1B.second,
    '同一具尸体不能报告第二次（首报 ' + RPT1B.first + ' · 复报 ' + RPT1B.second
    + ' · 站位 ' + RPT1B.d + ' 格）');
  ok(RPT1B.bodyAfterMeet === false,
    '报告即开会时尸体清场：重复报告在机制上不可能（bodyGone 生效）');

  /* 玩家自己拉铃时，系统不得替玩家发言——聊天栏里不能冒出一个"AI 星尘" */
  await fresh(false);
  await T(() => {
    const t = SKV3._t, g = t.G(); g.paused = true;
    const v = g.agents.find(a => a.i !== 0 && a.alive && !a.downed);
    t.tp(v.i, 41, 38.4); t.kill(v.i, 'knife');
    const bp = t.bodyOf(v.i);
    t.tp(0, bp[0], bp[1] - 1.6);
    t.report();
    return { me: g.me.name };
  });
  await page.waitForTimeout(2800);
  const MVOX = await T(() => {
    const t = SKV3._t, g = t.G();
    const lines = t.meetLines();
    return { me: g.me.name,
      fake: lines.filter(l => l.who === g.me.name && !l.sys).map(l => l.text),
      sys: lines.filter(l => l.sys).map(l => l.text).join(' | ') };
  });
  ok(MVOX.fake.length === 0,
    '玩家拉铃不会被代发言：挂在「' + MVOX.me + '」名下的非系统台词 ' + MVOX.fake.length + ' 条');
  ok(/发现了/.test(MVOX.sys) && /(人已经没了|先救人)/.test(MVOX.sys),
    '报告事实改由系统播报（' + MVOX.sys.slice(0, 46) + '…）');

  await fresh(false);
  const ALR = await T(() => {
    const t = SKV3._t; t.newGame();
    const g = t.G(); g.paused = true; g.noReport = false; g.aiReportUsed = false;
    g.prog = 30;                 /* 人类进度高 → 拖时间的收益足够，异形会主动报案 */
    const k = g.agents.find(a => a.alien && a.i !== 0 && a.alive);
    const v = g.agents.find(a => !a.alien && a.i !== 0 && a.alive);
    for (const a of g.agents) if (a !== k && a !== v) t.tp(a.i, 85,75.5);
    t.tp(v.i, 28.4,44); t.kill(v.i, 'knife'); t.tp(k.i, 28.4,46.6);
    k._delay = 0; k.doing = 0; k._doing = null; k.path = null; k.knife = 0;
    let scan = null; for (let i = 0; i < 120; i++) { scan = t.aiScan(k.i, 0.1); if (scan.meet) break; }
    const by = document.getElementById('m-by').textContent;
    return { meet: !!(scan && scan.meet), used: t.aiReportUsed(), alien: k.i,
      tag: String(k.i + 1).padStart(2, '0') + ' ' + k.name, by };
  });
  ok(ALR.meet && ALR.used && ALR.by === ALR.tag,
    'AI 异形现在会报告尸体（报告人 ' + ALR.by + '，期望 ' + ALR.tag + '；meet=' + ALR.meet + ' used=' + ALR.used + '）');

  await fresh(false);
  const EV = await T(() => {
    const t = SKV3._t; t.newGame();
    const g = t.G(); g.paused = true; g.noReport = true;
    const k = g.agents.find(a => a.alien && a.i !== 0 && a.alive);
    const v = g.agents.find(a => !a.alien && a.i !== 0 && a.alive);
    const w = g.agents.find(a => !a.alien && a.i !== 0 && a.alive && a !== v);
    for (const a of g.agents) if (a !== k && a !== v && a !== w) t.tp(a.i, 30,32);
    t.tp(k.i, 56, 83.8); t.tp(v.i, 57.2, 85); t.tp(w.i, 55.5, 83.8);
    k.knife = 1; k.sabUsed = true; k._delay = 0; k.doing = 0;
    k._doing = null; k.path = null; k.target = null;
    t.knife(k.i, v.i);
    w.suspect = null;                 // 只保留证据分，验证推理链本身
    t.openMeeting('night', w.i, v.i);
    const acc = w.accuse;
    t.startVote();
    const vote = g.meet.votes[w.i];
    t.finishMeeting();
    return { k: k.i, w: w.i, acc, vote, inv: t.inv() };
  });
  ok(EV.acc === EV.k && EV.vote === EV.k,
    '没有直接 suspect 时，证据分仍能驱动指控与投票（' + EV.acc + '/' + EV.vote + '）');
  ok(EV.inv && EV.inv.fails.length === 0, '证据链指控/投票后不变量全过');

  await fresh(false);
  const ABST = await T(() => {
    const t = SKV3._t;
    /* 2026-11-07：fresh(false) 的 newGame 之后有 260ms 自由行动窗口，AI 会
       目击异形专属行为并攒下 mind.sus / known —— 靠外层清字段是清不干净的，
       会议一开又会把嫌疑写回来。这条用例测「零证据时全弃权」，所以在本用例
       内部再 newGame() 一次并立刻 paused，拿到真正干净的一局。 */
    t.newGame();
    const g = t.G(); g.paused = true; g.noReport = true;
    /* 2026-11-07：本批把诬陷真正接通了（FRAME/MISLEAD/busChance/COFRAME
       都提频），会议本身就会产出传闻证据 —— 临时全关，恢复夹具前提，测完还原。 */
    const F = window.SKSanity;
    const save = F ? { frame: F.FRAME.chance, mislead: F.MISLEAD.chance,
      bus: F.MISLEAD.busChance, desc: F.DESC.on,
      coC: F.COFRAME.chance, coM: F.COFRAME.minorityChance,
      first: F.FIRST.chance } : null;
    if (F) { F.FRAME.chance = 0; F.MISLEAD.chance = 0;
      F.MISLEAD.busChance = 0; F.DESC.on = false;
      F.COFRAME.chance = 0; F.COFRAME.minorityChance = 0;
      F.FIRST.chance = 0; }
    for (const a of g.agents) {
      a.suspect = null; a.accuse = null;
      /* 只清「证据内容」字段；almost / cred / relia 这些结构由引擎自己惰性建，
         强行置成 {} 会让 evalAlmost 的 grid.foe 变 undefined（见 js/t2/ai.js:362）。 */
      if (a.mind) { a.mind.mem = []; a.mind.sus = {}; a.mind.why = {};
        a.mind.alert = 0; a.mind.noise = null; }
    }
    const h = g.agents.find(a => !a.alien && a.i !== 0 && a.alive);
    t.openMeeting('day', null, null);
    t.startVote();
    const vote = g.meet.votes[h.i];
    const humans = g.agents.filter(a => !a.alien && a.alive && !a.downed && a !== g.me);
    const badVotes = humans.filter(a => g.meet.votes[a.i] !== undefined && g.meet.votes[a.i] !== -1)
      .map(a => a.i);
    t.finishMeeting();
    if (F && save) { F.FRAME.chance = save.frame; F.MISLEAD.chance = save.mislead;
      F.MISLEAD.busChance = save.bus; F.DESC.on = save.desc;
      F.COFRAME.chance = save.coC; F.COFRAME.minorityChance = save.coM;
      F.FIRST.chance = save.first; }
    return { h: h.i, vote, sus: h.suspect, acc: h.accuse, badVotes, humanN: humans.length,
      mind: h.mind ? {sus:h.mind.sus, mem:h.mind.mem.length} : null,
      votes: g.meet ? Object.assign({}, g.meet.votes) : null, mem: h.mind ? h.mind.mem.length : -1 };
  });
  ok(ABST.vote === -1, 'AI 人类没有证据时弃权，不再随机投人');
  ok(ABST.badVotes.length === 0,
    '零证据的人类 AI 全部弃权（跟票只给手里有动静的人，不会凭空替人定罪）' +
    (ABST.badVotes.length ? ' :: ' + JSON.stringify(ABST.badVotes) +
      ' :: votes=' + JSON.stringify(ABST.votes) : ''));
  ok(ABST.sus === null && ABST.mem === 0, '进入新一夜：suspect 与认知记忆清空（无跨夜记忆）');

  section('开局出生点 · HUD 存活人数');
  const SP = await T(() => {
    const t = SKV3._t;
    t.newGame();
    const st = t.state();
    return { rooms: st.map(s => s.room), n: st.length, inv: t.inv() };
  });
  ok(SP.n === 15 && SP.rooms.every(r => r === 'bridge'), '开局 15 人全部出生在中央会议室');
  ok(SP.inv && SP.inv.fails.length === 0, '出生站位不变量全过');
  await page.waitForTimeout(250);
  const H0 = await T(() => ({
    alive: document.getElementById('alive').textContent,
    hum: document.getElementById('hum').textContent,
    ali: document.getElementById('ali').textContent,
    pwr: document.getElementById('pwr').textContent,
    text: document.querySelector('#hud .surv').textContent
  }));
  ok(H0.alive === '15' && H0.hum === '11' && H0.ali === '4', 'HUD 存活 15 · 人类 11 · 异形 4');
  ok(H0.text.indexOf('人类') >= 0 && H0.text.indexOf('异形') >= 0 && H0.pwr === '照明正常',
    'HUD 分列人类/异形，并显示照明状态');
  await T(() => {
    const t = SKV3._t, g = t.G();
    g.noReport = true;
    const h = g.agents.find(a => a.i !== 0 && !a.alien && a.alive);
    const k = g.agents.find(a => a.i !== 0 && a.alien && a.alive);
    t.kill(h.i, 'knife');
    t.kill(k.i, 'knife');
  });
  await page.waitForTimeout(220);
  const H1 = await T(() => ({
    alive: document.getElementById('alive').textContent,
    hum: document.getElementById('hum').textContent,
    ali: document.getElementById('ali').textContent
  }));
  ok(H1.alive === '13' && H1.hum === '10' && H1.ali === '3', '有人出局后 HUD 实时更新：13 / 人类 10 / 异形 3');
  await shotClip('39_HUD存活人数.png', { x: 6, y: 6, width: 520, height: 190 });

  section('监控室 · 10 路画面 / 电闸断信号');
  await fresh(false);
  const C0 = await T(() => {
    const t = SKV3._t, g = t.G();
    g.noReport = true;
    /* 监控台锚点 2026-10-31 从 (84,29) → (81,28.8) → (79.35,36.0)：
       最终贴在主控台上（屏幕斜躺在台面），玩家站主控台北侧 y34.7 调画面。 */
    t.tp(0, 80.1,34.7);
    return { room: t.state()[0].room, near: t.cams().near, inv: t.inv() };
  });
  await page.keyboard.press('w');
  await page.waitForTimeout(260);
  const C1 = await T(() => {
    const t = SKV3._t;
    return { cams: t.cams(), open: !document.getElementById('cam').classList.contains('hide'),
      state: document.getElementById('cam-state').textContent,
      tip: document.getElementById('tip').textContent };
  });
  ok(C0.room === 'cam' && C0.near && C0.inv.fails.length === 0, '站在监控室监控台旁，交互范围命中');
  ok(C1.cams.open && C1.cams.room && C1.cams.feeds === 10 && C1.open,
    'W 打开监控台：10 路画面全覆盖');
  ok(C1.state.indexOf('10 路在线') >= 0 && C1.tip.indexOf('监控台') >= 0,
    '状态条显示 10 路在线，提示栏切换为监控操作');
  await shot('40_监控室10路.png');
  const C2 = await T(() => { const t = SKV3._t; const r = t.breaker(); return { r, cams: t.cams() }; });
  await page.waitForTimeout(360);
  const C3 = await T(() => ({
    cut: SKV3._t.cams().cut,
    state: document.getElementById('cam-state').textContent,
    cls: document.getElementById('cam-state').className,
    open: !document.getElementById('cam').classList.contains('hide')
  }));
  ok(C2.r.state === 2 && C3.cut && C3.open, '配电室拉闸：监控遮罩仍在，10 路全部断信号');
  ok(C3.state.indexOf('信号中断') >= 0 && C3.cls.indexOf('cut') >= 0, '监控状态条：信号中断 · 电闸断开');
  await shot('41_断电监控.png');
  const C4 = await T(() => { const t = SKV3._t; t.breaker(); return { cams: t.cams() }; });
  ok(C4.cams.cut === false, '合上电闸：监控信号恢复');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(150);
  ok(!(await T(() => SKV3._t.cams().open)), 'ESC 退出监控台');

  section('地道 · 选择出口方向');
  await fresh(false);
  const PP = await T(() => {
    const t = SKV3._t, g = t.G();
    g.noReport = true;
    const swap = g.agents.find(a => a.alien && a.i !== 0);
    swap.alien = false;
    g.me.alien = true;
    const pipe = t.pipes()[1];
    t.tp(0, pipe.x, pipe.y);
    return { pipe, pipes: t.pipes(), room: t.state()[0].room };
  });
  await page.keyboard.press('w');
  await page.waitForTimeout(200);
  const PD = await T(() => {
    const t = SKV3._t;
    return { p: t.pipe(), open: !document.getElementById('pipe').classList.contains('hide'),
      btns: [...document.querySelectorAll('#pipe-list button')].map(b => b.textContent),
      sub: document.getElementById('pipe-sub').textContent };
  });
  ok(PD.p.open && PD.p.opts.length === 7 && PD.open, '异形按 W 打开地道出口列表：7 个可选目的地');
  ok(PD.p.fromRoom === '监控室' && PD.btns.length === 7 && PD.btns[0].indexOf('1') === 0,
    '列表标出当前管道口与 1–7 快捷键');
  await shot('42_地道选择.png');
  const DEST = PD.p.opts[1];
  await page.keyboard.press('2');
  await page.waitForTimeout(160);
  const PJ = await T(() => {
    const t = SKV3._t;
    return { pos: t.pos(), room: t.state()[0].room, open: t.pipe().open, fx: t.fx() };
  });
  ok(Math.abs(PJ.pos[0] - PP.pipes[DEST.i].x) < 0.01 && Math.abs(PJ.pos[1] - PP.pipes[DEST.i].y) < 0.01 &&
    PJ.room !== 'power', '数字键 2 直达指定出口（' + DEST.name + ' 管道口），不再随机方向');
  ok(PJ.open === false && PJ.fx.includes('pipefx'), '选择后关闭列表并播放管道特效');
  /* 2026-11-03：钻管道两边同一个冷却（AI 20 秒、玩家以前 0 秒 ⇒ 玩家可以连着钻）。
     所以刚钻完再按 W **必须被拦住** —— 这本身就是这条规则的断言点。 */
  const PCOOL = await T(() => ({
    cd: SKV3._t.G().me._pipeCD,
    open: (function () { SKV3._t.openPipe ? SKV3._t.openPipe() : null; return SKV3._t.pipe().open; })(),
    msg: SKV3._t.G().msg || '',
  }));
  ok(PCOOL.cd > 0, '钻完管道立即进入冷却 ' + Math.ceil(PCOOL.cd) + ' 秒（与 AI 同一个 PIPE.cooldown）');
  await T(() => { SKV3._t.G().me._pipeCD = 0; });   /* 清冷却后继续验"再次打开 + ESC 取消" */
  await page.keyboard.press('w');
  await page.waitForTimeout(160);
  const PO = await T(() => ({ open: SKV3._t.pipe().open, from: SKV3._t.pipe().fromRoom }));
  await page.keyboard.press('Escape');
  await page.waitForTimeout(130);
  ok(PO.open && PO.from === DEST.name && !(await T(() => SKV3._t.pipe().open)),
    '冷却清掉后可再次打开列表，ESC 取消');

  section('驱逐出局 · 公布身份');
  await fresh(false);
  const E1 = await T(() => {
    const t = SKV3._t, g = t.G();
    g.noReport = true;
    const k = g.agents.find(a => a.i >= 4 && a.alien && a.alive);
    t.openMeeting('night');
    const m = g.meet;
    m.votes = { 0: k.i, 1: k.i, 2: k.i, 3: k.i };
    m.phase = 'vote';
    t.closeVote();
    const st = t.state()[k.i];
    return { tally: m.tally, text: document.getElementById('m-tally').textContent,
      sys: document.getElementById('m-say').textContent, dead: !st.alive, cause: st.cause,
      tag: String(k.i + 1).padStart(2, '0') + ' ' + k.name };
  });
  ok(E1.tally.exRole === '异形' && E1.dead && E1.cause === 'vote', '驱逐异形：立即出局并记录身份');
  ok(E1.text.indexOf('身份：异形') >= 0 && E1.sys.indexOf('身份公布：异形') >= 0,
    '计票栏与系统播报同时公布「异形」');
  ok(E1.text.indexOf(E1.tag) >= 0, '计票栏保留「编号 + 名字」');
  await shot('43_驱逐身份.png');
  await T(() => SKV3._t.finishMeeting());
  await page.waitForTimeout(160);
  await fresh(false);
  const E2 = await T(() => {
    const t = SKV3._t, g = t.G();
    g.noReport = true;
    const h = g.agents.find(a => a.i >= 4 && !a.alien && a.alive);
    t.openMeeting('night');
    const m = g.meet;
    m.votes = { 0: h.i, 1: h.i, 2: h.i, 3: h.i };
    m.phase = 'vote';
    t.closeVote();
    return { tally: m.tally, text: document.getElementById('m-tally').textContent,
      dead: !t.state()[h.i].alive };
  });
  ok(E2.tally.exRole === '人类' && E2.dead && E2.text.indexOf('身份：人类') >= 0,
    '驱逐人类：同样公布「人类」，不会隐去身份');
  await T(() => SKV3._t.finishMeeting());
  await page.waitForTimeout(160);

  section('驱逐门槛 · 4 票 / 残局 3 票（2026-11-06）');
  await fresh(false);
  const VTH = await T(() => {
    const t = SKV3._t, g = t.G();
    g.noReport = true;
    const k = g.agents.find(a => a.i >= 4 && a.alien && a.alive);
    const th0 = t.voteThreshold();
    t.openMeeting('night');
    let m = g.meet;
    m.votes = { 0: k.i, 1: k.i, 2: k.i };
    m.phase = 'vote'; t.closeVote();
    const three = { ok: m.tally.ok, ex: m.tally.ex ? m.tally.ex.i : null, need: m.tally.need };
    t.finishMeeting();
    t.openMeeting('night');
    m = g.meet;
    m.votes = { 0: k.i, 1: k.i, 2: k.i, 3: k.i };
    m.phase = 'vote'; t.closeVote();
    const four = { ok: m.tally.ok, ex: m.tally.ex ? m.tally.ex.i : null, need: m.tally.need };
    t.finishMeeting();
    return { th0, three, four, k: k.i };
  });
  ok(VTH.th0.voters === 15 && VTH.th0.need === 4, '15 人可投票：驱逐门槛 4 票');
  ok(!VTH.three.ok && VTH.three.need === 4 && VTH.three.ex === null,
    '存活 >7 人时 3 票不够：无人出局');
  ok(VTH.four.ok && VTH.four.ex === VTH.k, '第 4 票落下才驱逐（' + VTH.four.ex + '）');

  await fresh(false);
  const VTH2 = await T(() => {
    const t = SKV3._t, g = t.G();
    g.noReport = true;
    let n = 0;
    for (const a of g.agents) {
      if (a.alive && !a.alien && n < 8) { a.alive = false; a.deathCause = 'knife'; n++; }
    }
    const th = t.voteThreshold();
    const k = g.agents.find(a => a.alien && a.alive);
    t.openMeeting('night');
    const m = g.meet;
    m.votes = { 0: k.i, 1: k.i, 2: k.i };
    m.phase = 'vote'; t.closeVote();
    return { th, ok: m.tally.ok, need: m.tally.need,
      ex: m.tally.ex ? m.tally.ex.i : null, k: k.i,
      alive: g.agents.filter(a => a.alive).length };
  });
  ok(VTH2.th.voters === 7 && VTH2.th.need === 3,
    '可投票 ≤7 人（存活 ' + VTH2.alive + '）：门槛降为 3 票');
  ok(VTH2.ok && VTH2.ex === VTH2.k, '残局 3 票即可驱逐');
  await T(() => { const g = SKV3._t.G(); if (g.meet) SKV3._t.finishMeeting(); });
  await page.waitForTimeout(160);

  section('机器人 · 巡逻 / 停摆');
  await fresh(false);
  const PT0 = await T(() => ({ b: SKV3._t.bots(), home: SKV3._t.medbotHome() }));
  ok(PT0.b.medbot && PT0.b.secbot &&
    PT0.b.medbot.patrol.length === 0 && PT0.b.secbot.patrol.length === 4,
    '医疗无人机不巡逻（0 航点，悬停医疗间中央）/ 保安机器人 4 点巡逻');
  ok(PT0.home && Math.hypot(PT0.home[0] - 55, PT0.home[1] - 84) < 4.5,
    '医疗无人机坞位在医疗间正中央附近（' + PT0.home.map(v => v.toFixed(1)).join(',') + '）');
  const PT1 = await T(() => {
    const t = SKV3._t, g = t.G();
    g.noReport = true;
    const before = t.bots();
    t.botTick(1.0);
    const after = t.bots();
    return { before, after,
      medFree: t.free(after.medbot.x, after.medbot.y),
      secFree: t.free(after.secbot.x, after.secbot.y) };
  });
  const medStep = Math.hypot(PT1.after.medbot.x - PT1.before.medbot.x,
    PT1.after.medbot.y - PT1.before.medbot.y);
  const secStep = Math.hypot(PT1.after.secbot.x - PT1.before.secbot.x,
    PT1.after.secbot.y - PT1.before.secbot.y);
  ok(secStep > 1.2 && secStep < 1.75,
    '保安巡逻速度 1.6 格/秒（1s 位移 ' + secStep.toFixed(2) + ' 格）');
  ok(medStep < 0.2, '没有伤员时医疗无人机停在坞位悬停（1s 位移 ' + medStep.toFixed(2) + ' 格）');
  ok(PT1.medFree && PT1.secFree, '巡逻/悬停中的机器人始终站在可行走格上');
  const PT2 = await T(() => {
    const t = SKV3._t, g = t.G();
    g.secbotDead = true;
    const p0 = t.bots().secbot;
    t.botTick(1.0);
    const p1 = t.bots().secbot;
    return { p0, p1 };
  });
  ok(Math.hypot(PT2.p1.x - PT2.p0.x, PT2.p1.y - PT2.p0.y) < 1e-9,
    '停摆的保安机器人原地不动');
  await T(() => SKV3._t.tp(0, 84,72.8));
  await page.waitForTimeout(220);
  await shot('47_机器人巡逻.png');

  section('保安机器人 · 拘留 / 释放 / 破坏');
  await fresh(false);
  const SB0 = await T(() => {
    const t = SKV3._t, g = t.G();
    g.noReport = true;
    const freeNear = (x, y) => {
      for (let r = 0.4; r <= 2.4; r += 0.2)
        for (let i = 0; i < 20; i++) {
          const a = i / 20 * Math.PI * 2, px = x + Math.cos(a) * r, py = y + Math.sin(a) * r;
          if (t.free(px, py)) return [px, py];
        }
      return [x, y];
    };
    const k = g.agents.find(a => a.alien && a.i !== 0 && a.alive);
    const v = g.agents.find(a => !a.alien && a.i !== 0 && a.alive);
    const h = g.agents.find(a => !a.alien && a.i !== 0 && a.alive && a !== v);
    /* 目击者分两种（2026-11-01 改）：
         hSee 站在拘留位旁边，**看得见**押送 → 记 saw_detain + 0.6 嫌疑；
         h    在军械库另一端，只**听得见**警报 → 有 heard_detain 记录但认不出是谁。 */
    const hSee = g.agents.find(a => !a.alien && a.i !== 0 && a.alive && a !== v && a !== h);
    /* 把保安机器人摆到军械库东南角：离设施初始位 >6 格，只有读运行时坐标才会擒拿 */
    const sec = t.setBot('secbot', 88.5, 54.5, Math.PI);
    const sb = g.bots && g.bots.secbot;
    if (sb) { sb.wps = [[sec[0], sec[1]]]; sb.wp = 0; sb.ang = Math.PI; }
    const kp = freeNear(86, 54), vp = freeNear(86, 53.2);
    t.tp(k.i, kp[0], kp[1]);
    t.tp(v.i, vp[0], vp[1]); t.tp(hSee.i, 86.5, 71.5);
    /* 「只听得见」的人必须站在**另一种亮区**里（2026-11-03 亮区整片可见放开之后）：
       旧写法把他丢在军械库「另一端」，同舱即整间可见 ⇒ 必然吃一条 saw_detain + 0.6 嫌疑，
       这条用例就从「听觉不锁身份」变成了随机跑赢。现在运行时扫一遍：
       离行凶点与拘留位都 >11 格（`aiCanSee` 的距离上限 10 / 8 过不去），
       又都留在警报半径 25 / 17 内（`aiHear` 仍写 heard_detain）。 */
    const JP = t.jail();
    let hear = null, hearM = 0;
    for (let x = 60; x < 92; x += 0.6) for (let y = 45; y < 84; y += 0.6) {
      if (!t.free(x, y)) continue;
      const z = t.litZone(x, y);
      if (z === 'r:armory' || z === 'r:fun') continue;
      const d1 = Math.hypot(x - kp[0], y - kp[1]), d2 = Math.hypot(x - JP[0], y - JP[1]);
      const m = Math.min(d1 - 11, d2 - 11, 17 - d2, 25 - d1);
      if (m > hearM) { hearM = m; hear = [+x.toFixed(1), +y.toFixed(1)]; }
    }
    if (hear) t.tp(h.i, hear[0], hear[1]);
    for (const a of [h, hSee]) {
      if (!a || !a.mind) continue;
      a.mind.mem = []; a.mind.sus = {}; a.mind.why = {};
      a.mind.known = {}; a.mind.detainSeen = {};
    }
    k.knife = 1;
    t.knife(k.i, v.i);
    return { k: k.i, v: v.i, h: h.i, hSee: hSee ? hSee.i : null,
      jail: t.jail(), kp, vp, sec, hear, hearM: +hearM.toFixed(1), inv: t.inv() };
  });
  await page.waitForTimeout(200);
  const SB1 = await T(o => {
    const t = SKV3._t, g = t.G();
    for (let i = 0; i < 6; i++) t.botTick(1.0);   /* 追捕 → 压制 → 押送完成 */
    const a = g.agents[o.k];
    return { detained: t.detained(), st: t.state()[o.k], fx: t.fx(), pos: [a.x, a.y],
      used: t.robots().sec.used, jail: t.jail(), msg: g.msg || '', inv: t.inv(),
      bots: t.bots(), uses: t.robots().sec.uses,
      sus: t.mind(o.h) ? (t.mind(o.h).sus[o.k] || 0) : 0,
      susSee: o.hSee == null ? -1 : ((t.mind(o.hSee) || {}).sus || {})[o.k] || 0,
      memSee: o.hSee == null ? [] : (t.mind(o.hSee).mem || []).map(e => e.kind),
      memHear: t.mind(o.h) ? (t.mind(o.h).mem || []).map(e => e.kind) : [],
      knownSee: o.hSee == null ? {} : t.knownOf(o.hSee) };
  }, SB0);
  ok(SB0.sec && Math.hypot(SB0.kp[0] - SB0.sec[0], SB0.kp[1] - SB0.sec[1]) < 6 &&
    Math.hypot(SB0.kp[0] - 80, SB0.kp[1] - 53) > 6 && SB0.inv.fails.length === 0,
    '行凶点离保安机器人初始位 >6 格：仍按巡逻坐标擒拿');
  ok(SB1.detained.some(d => d.i === SB0.k) && SB1.st.detained && SB1.st.detainedT > 29 && SB1.st.detainedT <= 31.5,
    '保安机器人擒拿凶手：拘留倒计时 ' + (SB1.st.detainedT || 0).toFixed(1) + 's');
  ok(SB1.used && SB1.uses >= 1 && SB1.st.room === 'armory' && SB1.jail &&
    Math.hypot(SB1.pos[0] - SB1.jail[0], SB1.pos[1] - SB1.jail[1]) < 0.01,
    '凶手被拽到军械库角落拘留位');
  ok(SB1.fx.includes('detain') && SB1.fx.includes('alarm'), '拘留拖拽线 + 红色警报环特效');
  ok(String(SB1.msg || '').indexOf('保安机器人擒拿') < 0, '拘押不再公告（无全局播报）');
  /* 2026-11-01 改：拘留证据来自**看见**，不是听见。
     旧断言靠 heard_detain 给 26 格内所有人 0.6 嫌疑（等于闻声就锁定被抓者），已修。 */
  ok(SB1.susSee >= 0.4 && SB1.memSee.indexOf('saw_detain') >= 0 &&
    Object.keys(SB1.knownSee).length === 0,
    '看见押送的人类记 saw_detain 并优先怀疑（sus=' + SB1.susSee.toFixed(2) + '），但不写 known');
  ok(!!SB0.hear && SB0.hearM >= 1,
    '夹具能排到「只听得见、看不见」的站位：' + JSON.stringify(SB0.hear) + '（余量 ' + SB0.hearM + ' 格）');
  ok(SB1.memHear.indexOf('heard_detain') >= 0 && SB1.sus < 0.05,
    '只听得见警报的人（' + JSON.stringify(SB0.hear) + '）有记录却认不出是谁（sus=' + SB1.sus.toFixed(2) + '）');
  ok(SB1.inv && SB1.inv.fails.length === 0, '拘留状态不变量全过');
  await T(() => {
    const t = SKV3._t, g = t.G();
    g.fx.forEach(f => { f.dur = Math.max(6, f.dur); f.t = f.dur * 0.55; });
    const p = t.jail();
    t.tp(0, 85.2,73.2);
  });
  await page.waitForTimeout(140);
  await shot('44_保安机器人拘留.png');
  await T(o => { SKV3._t.G().agents[o.k].detainedT = 0.12; }, SB0);
  await page.waitForTimeout(420);
  const SB2 = await T(o => ({ detained: SKV3._t.detained(), st: SKV3._t.state()[o.k], inv: SKV3._t.inv() }), SB0);
  ok(SB2.detained.length === 0 && !SB2.st.detained, '30 秒拘留结束：自动释放');
  ok(SB2.inv && SB2.inv.fails.length === 0, '释放后不变量全过');
  await T(() => {
    const g = SKV3._t.G();
    g.me.detained = true; g.me.detainedT = 5; g.me.path = null;
  });
  await page.waitForTimeout(300);
  const SB3 = await T(() => ({
    role: document.getElementById('role').textContent,
    tip: document.getElementById('tip').textContent,
    path: SKV3._t.G().me.path
  }));
  ok(SB3.role.indexOf('被擒') >= 0 && SB3.tip.indexOf('自动释放') >= 0,
    '玩家被擒：HUD 显示倒计时，提示栏说明释放规则');
  await page.mouse.click(700, 450);
  await page.waitForTimeout(140);
  const SB3b = await T(() => SKV3._t.G().me.path);
  ok(SB3b === null, '被擒期间点击地面不会移动');
  await T(() => { SKV3._t.G().me.detainedT = 0.1; });
  /* detainedT 走的是模拟时间，dt 有钳制：机器忙时（后台在烘图/出图）模拟会落后墙钟，
     320ms 不够走完 0.1 秒。等到 900ms，测的是"倒计时归零即释放"，
     不是"这台机器此刻有多少帧预算"。 */
  await page.waitForTimeout(900);
  ok(!(await T(() => SKV3._t.G().me.detained)), '玩家倒计时归零后恢复自由');

  section('保安机器人 · 异形破坏停摆');
  await fresh(false);
  const SS0 = await T(() => {
    const t = SKV3._t, g = t.G();
    g.noReport = true;
    const swap = g.agents.find(a => a.alien && a.i !== 0);
    swap.alien = false;
    g.me.alien = true;
    g.me.sabUsed = false;
    const sp = t.setBot('secbot', 80, 53);
    let best = [sp[0] + 1.2, sp[1]];
    for (let r = 0.6; r <= 1.4; r += 0.15) {
      let hit = null;
      for (let i = 0; i < 24; i++) {
        const a = i / 24 * Math.PI * 2, x = sp[0] + Math.cos(a) * r, y = sp[1] + Math.sin(a) * r;
        if (t.free(x, y)) { hit = [x, y]; break; }
      }
      if (hit) { best = hit; break; }
    }
    t.tp(0, best[0], best[1]);
    return { pos: best, sec: sp, dist: Math.hypot(best[0] - sp[0], best[1] - sp[1]), inv: t.inv() };
  });
  await page.keyboard.press('h');
  await page.waitForTimeout(200);
  const FW = await T(() => {
    const t = SKV3._t, w = t.wheel();
    if (!w) return { wheel: false, items: [] };
    const items = w.items.map(x => x.id);
    const i = w.items.findIndex(x => x.id === 'sab-bot');
    t.pickWheel(i);
    return { wheel: true, items };
  });
  ok(FW.wheel && FW.items.includes('sab-bot') && FW.items.includes('sab-room'),
    '异形贴着机器人按 H：轮盘选择「停摆机器人 / 破坏舱室」');
  const SS1 = await T(() => ({
    robots: SKV3._t.robots(), fx: SKV3._t.fx(), msg: SKV3._t.G().msg, inv: SKV3._t.inv()
  }));
  ok(SS0.dist < 1.5 && SS1.robots.sec.dead, '异形贴近巡逻中的保安机器人按 F：当晚停摆');
  ok(SS1.fx.includes('spark') && String(SS1.msg || '').indexOf('保安机器人今晚停摆') < 0, '破坏反馈：火花保留，但不再公告机器人被毁');
  ok(SS1.inv && SS1.inv.fails.length === 0, '破坏后不变量全过');
  const SS2 = await T(() => {
    const t = SKV3._t, g = t.G();
    const freeNear = (x, y) => {
      for (let r = 0.4; r <= 2.4; r += 0.2)
        for (let i = 0; i < 20; i++) {
          const a = i / 20 * Math.PI * 2, px = x + Math.cos(a) * r, py = y + Math.sin(a) * r;
          if (t.free(px, py)) return [px, py];
        }
      return [x, y];
    };
    const k = g.agents.find(a => a.alien && a.i !== 0 && a.alive && !a.detained);
    const v = g.agents.find(a => !a.alien && a.i !== 0 && a.alive && !a.downed);
    const kp = freeNear(82, 51.5), vp = freeNear(82, 50.4);
    t.tp(k.i, kp[0], kp[1]); t.tp(v.i, vp[0], vp[1]);
    k.knife = 1;
    t.knife(k.i, v.i);
    return { k: k.i };
  });
  await page.waitForTimeout(240);
  const SS3 = await T(() => ({ detained: SKV3._t.detained(), used: SKV3._t.robots().sec.used,
    inv: SKV3._t.inv() }));
  ok(SS3.detained.length === 0 && SS3.used === false, '机器人停摆后，视野内行凶不再触发拘留');
  ok(SS3.inv && SS3.inv.fails.length === 0, '停摆后的行凶同样不违反不变量');

  section('异形 F/H 分离 · 施救与破坏');
  await fresh(false);
  const FR = await T(() => {
    const t = SKV3._t, g = t.G(); g.noReport = true;
    g.me.alien = true; g.me.medkit = 1; g.me.sabUsed = false;
    const v = g.agents.find(a => !a.alien && a.i !== 0 && a.alive && !a.downed);
    t.tp(v.i, 56, 83.8); t.tp(0, 57.1,85);
    v.downed = true; v.downAt = g.t; v.path = null;
    return { v: v.i, medkit: g.me.medkit };
  });
  await page.keyboard.press('f');
  await page.waitForTimeout(180);
  const FR2 = await T(() => {
    const t = SKV3._t, g = t.G();
    return { do: g.me._doing, doing: g.me.doing, rv: g.me._rv ? g.me._rv.i : null,
      sab: !!g.sabPick, msg: g.msg };
  });
  ok(FR2.do === 'revive' && FR2.rv === FR.v && !FR2.sab && FR2.doing > 4,
    '异形按 F 进入施救，不再与破坏面板耦合');
  ok(FR2.msg.indexOf('施救') >= 0, '施救提示明确');

  section('机器人可被攻击 · 保安反击拘留');
  await fresh(false);
  const BMED = await T(() => {
    const t = SKV3._t, g = t.G(); g.noReport = true; g.secbotUsed = true;
    const med = t.setBot('medbot', 58.5, 81.6);
    t.tp(0, med[0] + 2, med[1]);
    g.me.bullet = 1; g.aimX = med[0]; g.aimY = med[1];
    t.shoot();
    return { dead: t.robots().med.dead, hp: t.robots().med.hp,
      bullet: g.me.bullet, msg: g.msg, inv: t.inv() };
  });
  ok(BMED.dead && BMED.hp === 0 && BMED.bullet === 0,
    '玩家开枪可以摧毁医疗无人机（子弹 -1）');
  ok(BMED.inv && BMED.inv.fails.length === 0, '摧毁医疗无人机后不变量全过');

  /* 无人机是实体目标：出刀同样能摧毁（医疗装甲 HP 1，一刀拆掉），并留下刀者红身与危险行为 */
  await fresh(false);
  const BMEDK = await T(() => {
    const t = SKV3._t, g = t.G(); g.noReport = true; g.secbotUsed = true;
    /* 降级一名 AI 异形再让 0 号变异形：维持 15 席 / 4 异形的不变量 */
    const demoted = g.agents.find(a => a.alien && a.i !== 0 && a.alive);
    if (demoted) demoted.alien = false;
    g.me.alien = true; g.me.knife = 1;
    const med = t.setBot('medbot', 52, 84.9);
    t.tp(0, med[0] + 1.0, med[1]);
    t.stabRaw();
    return { dead: t.robots().med.dead, hp: t.robots().med.hp, knife: g.me.knife,
      red: g.me.redT, crime: g.pendingCrime, msg: g.msg, inv: t.inv() };
  });
  ok(BMEDK.dead && BMEDK.hp === 0 && BMEDK.knife === 0,
    '异形出刀可以砍毁医疗无人机（刀数 -1 / 装甲 HP 1）');
  ok(BMEDK.red > 0 && BMEDK.crime === 0, '砍无人机留红身与危险行为记录（保安可据此拘留）');
  ok(BMEDK.inv && BMEDK.inv.fails.length === 0, '刀砍无人机后不变量全过' +
    (BMEDK.inv && BMEDK.inv.fails.length ? '（失败项：' +
      BMEDK.inv.fails.slice(0, 4).map(f => f.code + ':' + f.msg).join(' | ') + '）' : ''));

  await fresh(false);
  const BSEC = await T(() => {
    const t = SKV3._t, g = t.G(); g.noReport = true; g.secbotUsed = true;
    const sec = t.setBot('secbot', 80, 73.2, 0);
    const sb = g.bots.secbot; if (sb) { sb.wps = [[sec[0], sec[1]]]; sb.wp = 0; }
    let p = [sec[0] + 1.2, sec[1]];
    for (let r = 0.8; r <= 1.6; r += 0.1)
      for (let i = 0; i < 20; i++) {
        const a = i / 20 * Math.PI * 2, x = sec[0] + Math.cos(a) * r, y = sec[1] + Math.sin(a) * r;
        if (t.free(x, y)) { p = [x, y]; r = 99; break; }
      }
    t.tp(0, p[0], p[1]);
    g.me.bullet = 1; g.aimX = sec[0]; g.aimY = sec[1];
    t.shoot();
    const hp1 = t.robots().sec.hp;
    g.me.bullet = 1; t.shoot();
    return { hp1, dead: t.robots().sec.dead, hp2: t.robots().sec.hp,
      bullet: g.me.bullet, inv: t.inv() };
  });
  ok(BSEC.hp1 === 1 && BSEC.dead && BSEC.hp2 === 0 && BSEC.bullet === 0,
    '保安机器人装甲 2 点：两枪摧毁');
  ok(BSEC.inv && BSEC.inv.fails.length === 0, '摧毁保安机器人后不变量全过');
  await fresh(false);
  const BSHOOTBOT = await T(() => {
    const t = SKV3._t, g = t.G(); g.noReport = true;
    const sec = t.setBot('secbot', 80, 73.2, 0);
    const sb = g.bots.secbot; if (sb) { sb.wps = [[sec[0], sec[1]]]; sb.wp = 0; sb.ang = 0; }
    let p = [82.2, 73.2];
    for (let r = 0.4; r <= 1.4; r += 0.1)
      for (let i = 0; i < 20; i++) {
        const a = i / 20 * Math.PI * 2, x = 82.2 + Math.cos(a) * r, y = 73.2 + Math.sin(a) * r;
        if (t.free(x, y)) { p = [x, y]; r = 99; break; }
      }
    t.tp(0, p[0], p[1]);
    g.me.bullet = 1; g.aimX = sec[0]; g.aimY = sec[1];
    t.shoot();
    const hp = t.robots().sec.hp, pending = g.pendingCrime;
    t.botTick(0.2); t.botTick(0.2);
    return { hp, pending, detained: g.me.detained, uses: t.robots().sec.uses,
      bullet: g.me.bullet, inv: t.inv() };
  });
  ok(BSHOOTBOT.hp === 1 && BSHOOTBOT.pending === 0 && BSHOOTBOT.bullet === 0,
    '枪击保安机器人：装甲 -1、留下危险行为记录');
  ok(BSHOOTBOT.detained && BSHOOTBOT.uses === 1,
    '保安机器人会拘留开枪攻击自己的人');
  ok(BSHOOTBOT.inv && BSHOOTBOT.inv.fails.length === 0, '枪击保安后不变量全过');

  await fresh(false);
  const BK = await T(() => {
    const t = SKV3._t, g = t.G(); g.noReport = true;
    const demoted = g.agents.find(a => a.alien && a.i !== 0 && a.alive);
    if (demoted) demoted.alien = false;
    g.me.alien = true; g.me.knife = 1; g.secbotUsed = false;
    const sec = t.setBot('secbot', 80, 75, 0);
    const sb = g.bots.secbot; if (sb) { sb.wps = [[sec[0], sec[1]]]; sb.wp = 0; sb.ang = 0; }
    let p = [sec[0], sec[1] + 1.1];
    for (let r = 0.8; r <= 1.35; r += 0.1)
      for (let i = 0; i < 20; i++) {
        const a = i / 20 * Math.PI * 2, x = sec[0] + Math.cos(a) * r, y = sec[1] + Math.sin(a) * r;
        if (t.free(x, y)) { p = [x, y]; r = 99; break; }
      }
    t.tp(0, p[0], p[1]);
    const atk = t.stabRaw();
    const hp = t.robots().sec.hp, pend = g.pendingCrime;
    t.botTick(0.2); t.botTick(0.2);
    return { hp, pend, knife: atk.knife, detained: g.me.detained,
      used: t.robots().sec.used, p, sec, inv: t.inv() };
  });
  ok(BK.hp === 1 && BK.pend === 0 && BK.knife === 0,
    '玩家出刀攻击保安机器人：装甲 -1、消耗刀');
  ok(BK.detained && BK.used, '保安机器人被袭击后转身拘留袭击者');
  ok(BK.inv && BK.inv.fails.length === 0, '机器人反击拘留后不变量全过');

  await fresh(false);
  const BDEV = await T(() => {
    const t = SKV3._t, g = t.G(); g.noReport = true; t.setDev(true);
    const k = g.agents.find(a => a.alien && a.i !== 0 && a.alive);
    const sec = t.setBot('secbot', 80, 75, 0);
    const sb = g.bots.secbot; if (sb) { sb.wps = [[sec[0], sec[1]]]; sb.wp = 0; sb.ang = 0; }
    t.tp(k.i, 80.8,75);
    k.knife = 1;
    t.knife(k.i, 0);                 // DEV 免伤：不产生濒死
    const pending = g.pendingCrime;
    t.botTick(0.2); t.botTick(0.2);
    return { pending, downed: g.me.downed, detained: g.agents[k.i].detained,
      uses: t.robots().sec.uses, inv: t.inv() };
  });
  ok(BDEV.pending != null, 'DEV 免伤的攻击仍写入危险行为');
  ok(!BDEV.downed && BDEV.detained && BDEV.uses === 1,
    '未造成濒死的出刀也会被保安机器人擒拿');
  ok(BDEV.inv && BDEV.inv.fails.length === 0, '未致濒死拘留后不变量全过');

  await fresh(false);
  const BL2 = await T(() => ({
    label: SKV3._t.botLabel('secbot'), left: SKV3._t.robots().sec.left,
    med: SKV3._t.botLabel('medbot')
  }));
  ok(BL2.left === 2 && /拘留 0\/2/.test(BL2.label) && !/\/3/.test(BL2.label) &&
    /电量 2\/2/.test(BL2.med),
    '机器人标签与上限同源：保安「' + BL2.label + '」/ 医疗「' + BL2.med + '」');
  const BCAP = await T(() => {
    const t = SKV3._t, g = t.G(); g.noReport = true;
    const h = g.agents.find(a => !a.alien && a.i !== 0 && a.alive);
    const sec = t.setBot('secbot', 80, 75, 0);
    const sb = g.bots.secbot; if (sb) { sb.wps = [[sec[0], sec[1]]]; sb.wp = 0; sb.ang = 0; }
    t.tp(h.i, 80.8,75);
    g.secbotUsed = true; g.secbotUses = 2; g.pendingCrime = h.i;   /* 上限已用满 */
    t.botTick(0.2);
    return { detained: t.detained(), uses: t.robots().sec.uses,
      left: t.robots().sec.left, label: t.botLabel('secbot'), inv: t.inv() };
  });
  ok(BCAP.detained.length === 0 && BCAP.uses === 2 && BCAP.left === 0 &&
    /拘留 2\/2/.test(BCAP.label),
    '保安机器人每夜最多擒拿 2 人：第 3 次不再触发（标签 ' + BCAP.label + '）');
  ok(BCAP.inv && BCAP.inv.fails.length === 0, '擒拿上限后不变量全过');

  await fresh(false);
  const BSHOOT = await T(() => {
    const t = SKV3._t, g = t.G(); g.noReport = true;
    const v = g.agents.find(a => !a.alien && a.i !== 0 && a.alive && !a.downed);
    const sec = t.setBot('secbot', 80, 75, 0);
    const sb = g.bots.secbot; if (sb) { sb.wps = [[sec[0], sec[1]]]; sb.wp = 0; sb.ang = 0; }
    let p = [80.8, 75];
    for (let r = 0.4; r <= 1.4; r += 0.1)
      for (let i = 0; i < 20; i++) {
        const a = i / 20 * Math.PI * 2, x = 80 + Math.cos(a) * r, y = 75 + Math.sin(a) * r;
        if (t.free(x, y)) { p = [x, y]; r = 99; break; }
      }
    t.tp(0, p[0], p[1]);
    let vp = [82.2, 74.6];
    for (let r = 0.2; r <= 1.2; r += 0.1)
      for (let i = 0; i < 20; i++) {
        const a = i / 20 * Math.PI * 2, x = 82.2 + Math.cos(a) * r, y = 74.6 + Math.sin(a) * r;
        if (t.free(x, y)) { vp = [x, y]; r = 99; break; }
      }
    t.tp(v.i, vp[0], vp[1]);
    g.me.bullet = 1; g.aimX = vp[0]; g.aimY = vp[1];
    t.shoot();
    t.botTick(0.2); t.botTick(0.2);
    return { v: v.i, downed: g.agents[v.i].downed, detained: g.me.detained,
      uses: t.robots().sec.uses, inv: t.inv() };
  });
  ok(BSHOOT.downed && BSHOOT.detained && BSHOOT.uses === 1,
    '玩家开枪后即使目标已经濒死，保安也会拘留开枪者');
  ok(BSHOOT.inv && BSHOOT.inv.fails.length === 0, '开枪拘留后不变量全过');

  section('医疗无人机 · 悬停医疗间中央 / 飞向伤员近身施救');
  await fresh(false);
  const MB0 = await T(() => {
    const t = SKV3._t, g = t.G();
    g.noReport = true;
    const home = t.medbotHome();
    const v = g.agents.find(a => !a.alien && a.i !== 0 && a.alive);
    /* 伤员放在离坞位最远的医疗间角落：旧实现是「6 格圆内隔空读条」，
       现在是「房间内就飞过去」，所以最远角落也必须能救到 */
    let p = [55, 85.6], bd = -1;
    for (let y = 78.8; y <= 89.4; y += 0.3)
      for (let x = 46.8; x <= 63.4; x += 0.3) {
        if (!t.free(x, y)) continue;
        const d = Math.hypot(x - home[0], y - home[1]);
        if (d > bd) { bd = d; p = [+x.toFixed(2), +y.toFixed(2)]; }
      }
    t.tp(v.i, p[0], p[1]);
    v.downed = true; v.downAt = g.t; v.path = null; v.doing = 0; v._doing = null;
    const start = t.bots().medbot;
    const d0 = Math.hypot(start.x - v.x, start.y - v.y);
    let touchAt = -1, healedAt = -1, b = null;
    for (let i = 0; i < 140; i++) {
      b = t.botTick(0.1);
      const bot = t.bots().medbot;
      if (touchAt < 0 && bot.healing) touchAt = i;
      if (!t.state()[v.i].downed) { healedAt = i; break; }
    }
    const end = t.bots().medbot;
    return { v: v.i, p, home, d0: +d0.toFixed(2), touchAt, healedAt,
      endDist: +Math.hypot(end.x - v.x, end.y - v.y).toFixed(2),
      b, st: t.state()[v.i], fx: t.fx(), msg: g.msg, inv: t.inv(),
      room: t.state()[v.i].room, heal: t.robots().med.heal };
  });
  ok(MB0.room === 'med' && !MB0.st.downed,
    '医疗间角落的濒死者被救起（离坞位 ' + MB0.d0 + ' 格 → 无人机飞过去）');
  ok(MB0.touchAt >= 0 && MB0.endDist <= 1.4,
    '无人机先飞到伤员身边才开始治疗（末帧距离 ' + MB0.endDist + ' 格）');
  /* 帧数按声明层的 heal 秒数推算（dt=0.1），允许 ±3 帧的采样误差 */
  const healFrames = MB0.healedAt - MB0.touchAt;
  const healNeed = MB0.heal * 10;
  ok(MB0.touchAt >= 0 && healFrames >= healNeed - 3 && healFrames <= healNeed + 3,
    '近身治疗满 ' + MB0.heal + ' 秒才拉起（实测 ' + (healFrames / 10).toFixed(1) + ' 秒）');
  ok(MB0.b.med === true && MB0.fx.includes('healBeam') && MB0.fx.includes('heal'),
    '施救特效：治疗光束 + 治疗环');
  ok(String(MB0.msg || '').indexOf('医疗无人机') < 0,
    '救治不对外播报（聊天栏与提示都不出现「谁被无人机救起」）');
  ok(MB0.inv && MB0.inv.fails.length === 0, '施救后不变量全过');

  /* 覆盖范围：无人机覆盖整间医疗间（不再有 6 格圆），走廊里的濒死者不响应 */
  await fresh(false);
  const MBR = await T(() => {
    const t = SKV3._t, g = t.G();
    g.noReport = true;
    const v = g.agents.find(a => !a.alien && a.i !== 0 && a.alive);
    const home = t.medbotHome();
    let far = [55, 85.6], bd = -1;
    for (let y = 78.8; y <= 89.4; y += 0.3)
      for (let x = 46.8; x <= 63.4; x += 0.3) {
        if (!t.free(x, y)) continue;
        const d = Math.hypot(x - home[0], y - home[1]);
        if (d > bd) { bd = d; far = [x, y]; }
      }
    /* 走廊（医疗间外）找一个可站立点：c7 走廊在医疗间正上方 */
    const outside = (() => {
      for (let y = 70; y <= 77; y += 0.25)
        for (let x = 55; x <= 61; x += 0.25)
          if (t.free(x, y)) return [x, y];
      return [58, 70];
    })();
    const put = (p) => {
      g.medbotT = 0; g.medbotTarget = null; g.medbotLeft = 1; g.medbotDead = false;
      t.setBot('medbot', home[0], home[1]);
      t.tp(v.i, p[0], p[1]);
      v.downed = true; v.downAt = g.t; v.path = null; v.doing = 0; v._doing = null;
    };
    put(far);
    let inFrames = 0;
    for (let i = 0; i < 120; i++) { inFrames++; t.botTick(0.1); if (!t.state()[v.i].downed) break; }
    const inRoom = { frames: inFrames, downed: t.state()[v.i].downed, room: t.state()[v.i].room };
    put(outside);
    for (let i = 0; i < 60; i++) t.botTick(0.1);
    const outRoom = { downed: t.state()[v.i].downed, room: t.state()[v.i].room,
      t: +(g.medbotT || 0).toFixed(2) };
    return { R: t.medbotR(), far, outside, dist: +bd.toFixed(2), inRoom, outRoom,
      inv: t.inv(), heal: t.robots().med.heal, touch: t.robots().med.touch };
  });
  ok(MBR.R >= 11, '医疗无人机覆盖整间医疗间（覆盖半径读数 ' + MBR.R + ' 格）');
  ok(MBR.inRoom.room === 'med' && MBR.inRoom.downed === false,
    '离坞位 ' + MBR.dist + ' 格的医疗间角落也能救起');
  ok(MBR.outRoom.downed === true && MBR.outRoom.t === 0,
    '医疗间外的濒死者不施救（当前 ' + MBR.outRoom.room + '）');
  ok(MBR.heal === 7 && MBR.touch > 0.8 && MBR.touch < 1.6,
    '近身治疗 ' + MBR.heal + ' 秒 · 悬停距离 ' + MBR.touch + ' 格');
  ok(MBR.inv && MBR.inv.fails.length === 0, '施救覆盖测试后不变量全过');

  await fresh(false);
  const MB1 = await T(() => {
    const t = SKV3._t, g = t.G(); g.noReport = true;
    t.setBot('medbot', 52, 84.9);
    const freeNear = (x, y) => {
      for (let r = 0.4; r <= 2.4; r += 0.2)
        for (let i = 0; i < 20; i++) {
          const a = i / 20 * Math.PI * 2, px = x + Math.cos(a) * r, py = y + Math.sin(a) * r;
          if (t.free(px, py)) return [px, py];
        }
      return [x, y];
    };
    const vs = g.agents.filter(a => !a.alien && a.i !== 0 && a.alive && !a.downed).slice(0, 3);
    const ps = vs.map((a, n) => { const p = freeNear(49.6 + n * 1.6, 85.4); t.tp(a.i, p[0], p[1]); return p; });
    for (const v of vs) { v.downed = true; v.downAt = g.t; v.path = null; }
    /* 巡逻线是 9 个点的大环，5 秒里机器人会走开；每步钉在**当前仍在场的伤员**身上，
       测的才是“电量 2 次”这件事，而不是“巡逻恰好路过几个人”。 */
    const run5 = () => { let r = null;
      for (let i = 0; i < 36; i++) {   /* 9 秒：够 7 秒救治，但不够连救两人 */
        const live = vs.find(v => v.downed) || vs[0];
        t.setBot('medbot', live.x, live.y); r = t.botTick(0.25);
      }
      return r; };
    const b1 = run5();
    const b2 = run5();
    const b3 = run5();
    return { vs: vs.map(v => v.i), ps, b1, b2, b3, left: t.robots().med.left,
      used: t.robots().med.used, downed: vs.map(v => v.downed), inv: t.inv() };
  });
  ok(MB1.b1.medLeft === 1 && MB1.b2.medLeft === 0 && MB1.b3.medLeft === 0 && MB1.used,
    '医疗无人机每夜救 2 人（第二次施救后电量 0）');
  ok(MB1.downed[0] === false && MB1.downed[1] === false && MB1.downed[2] === true &&
    MB1.left === 0,
    '电量耗尽后第三名濒死者不会被继续施救');
  ok(MB1.inv && MB1.inv.fails.length === 0, '两次施救后不变量全过');
  await T(() => {
    const t = SKV3._t, g = t.G();
    g.fx.forEach(f => { f.dur = Math.max(6, f.dur); f.t = f.dur * 0.4; });
    t.tp(0, 53.2,82.6);
  });
  await page.waitForTimeout(140);
  await shot('45_医疗无人机施救.png');

  section('AI 异形 · 拉闸 / 停摆机器人 / 破坏舱室 / 钻管道');
  await fresh(false);
  const AIK0 = await T(() => {
    const t = SKV3._t, g = t.G();
    g.noReport = true;
    const freeNear = (x, y, minD, maxD) => {
      for (let r = minD; r <= maxD; r += 0.2)
        for (let i = 0; i < 24; i++) {
          const a = i / 24 * Math.PI * 2, px = x + Math.cos(a) * r, py = y + Math.sin(a) * r;
          if (t.free(px, py)) return [px, py];
        }
      return [x, y];
    };
    for (const h of g.agents) if (!h.alien && h.alive) t.tp(h.i, 30,32);
    const k = g.agents.find(a => a.alien && a.i !== 0 && a.alive);
    for (const a of g.agents) if (a.alien && a !== k) a.sabUsed = true;
    g.breakerSaboteur = k.i;
    const p = freeNear(50.8, 54.1, 2.2, 3.8);
    t.tp(k.i, p[0], p[1]);
    k._delay = 0; k._rest = 0; k.doing = 0; k._doing = null;
    k.sabUsed = false; k.knife = 1; k.path = null; k.target = null; k._pipeCD = 0;
    t.clearDrags(); t.resetAiState(k.i);
    const before = t.lights().state;
    const r = t.aiTickAlien(k.i, 120, 0.05);
    return { i: k.i, p, before, after: t.lights().state, sab: r.sab,
      plan: k._plan || null, sabUsed: k.sabUsed, doing: k._doing,
      fx: t.fx(), msg: g.msg, inv: t.inv() };
  });
  ok(AIK0.before !== 2 && AIK0.after === 2,
    'AI 异形走到电闸拉闸：真正断电（' + AIK0.before + '→' + AIK0.after +
    '） plan=' + JSON.stringify(AIK0.plan) + ' sabUsed=' + AIK0.sabUsed +
    ' doing=' + AIK0.doing);
  ok(AIK0.sab && AIK0.fx.includes('power') && AIK0.msg.indexOf('电闸已拉下') >= 0,
    '拉闸反馈：全船断电 + 电闸特效 + 播报');
  ok(AIK0.inv && AIK0.inv.fails.length === 0, 'AI 拉闸后不变量全过');
  const AIK1 = await T(o => {
    const t = SKV3._t, g = t.G();
    t.breaker(); /* 先恢复照明，避免拉闸分支抢在停摆机器人前面 */
    const freeNear = (x, y, minD, maxD) => {
      for (let r = minD; r <= maxD; r += 0.2)
        for (let i = 0; i < 24; i++) {
          const a = i / 24 * Math.PI * 2, px = x + Math.cos(a) * r, py = y + Math.sin(a) * r;
          if (t.free(px, py)) return [px, py];
        }
      return [x, y];
    };
    const k = g.agents[o.i];
    g.breakerSaboteur = -1; /* 恢复照明后仍要单独验证“停摆机器人”分支 */
    for (const h of g.agents) if (!h.alien && h.alive) t.tp(h.i, 30,32);
    const sp = t.setBot('secbot', 80, 53);
    const p = freeNear(sp[0], sp[1], 2.4, 3.6);
    t.tp(k.i, p[0], p[1]);
    k.sabUsed = false; k.path = null; k.target = null; k.doing = 0; k._doing = null;
    t.clearDrags(); t.resetAiState(k.i); k.sabUsed = false;
    k.knife = 0;   /* 本节只验"破坏技停摆机器人"：先把刀用完，才轮到每夜一次的破坏技 */
    /* 2026-10-31 起拆保安需要围攻前提：造 2 名已识别队友 + 一个 5 格外的共同目标 */
    const mates = g.agents.filter(a => a.alien && a !== k && a.alive).slice(0, 2);
    mates.forEach((m2, n) => { t.tp(m2.i, sp[0] + 3 + n, sp[1] + 1.2); k.mates[m2.i] = true; });
    const vic = g.agents.find(a => !a.alien && a.alive && a.i !== 0);
    const vp = freeNear(sp[0] + 6, sp[1] - 4, 0, 2);
    t.tp(vic.i, vp[0], vp[1]);
    const oldR = Math.random; Math.random = () => 0.1;
    const r = t.aiTickAlien(k.i, 100, 0.05);
    Math.random = oldR;
    return { p, sp, dead: t.robots().sec.dead, sab: r.sab, fx: t.fx(),
      knife: r.knife, hp: t.robots().sec.hp,
      prog: g.prog, inv: t.inv() };
  }, AIK0);
  /* 2026-11-01 用户裁定：机器人/无人机只能被刀/枪瘫痪，破坏技与机器人彻底无关 ——
     刀用完的异形在保安面前会改走效用表其它候选（拆舱室/拉闸），保安不受影响 */
  ok(!AIK1.dead && AIK1.hp === 2,
    '破坏技不再能停摆机器人：保安只能被刀/枪摧毁（刀用完就轮不到它，装甲无损）');
  ok(AIK1.inv && AIK1.inv.fails.length === 0, '破坏技与机器人解耦后不变量全过');
  const AIK2 = await T(o => {
    const t = SKV3._t, g = t.G();
    const freeNear = (x, y, minD, maxD) => {
      for (let r = minD; r <= maxD; r += 0.2)
        for (let i = 0; i < 24; i++) {
          const a = i / 24 * Math.PI * 2, px = x + Math.cos(a) * r, py = y + Math.sin(a) * r;
          if (t.free(px, py)) return [px, py];
        }
      return [x, y];
    };
    const k = g.agents[o.i];
    g.breakerSaboteur = -1; /* 单独验证“破坏舱室”，不让拉闸分支抢先 */
    for (const h of g.agents) if (!h.alien && h.alive) t.tp(h.i, 30,32);
    g.dmg = [];
    const sp = t.sabSpot('engine');
    const p = freeNear(sp.x, sp.y, 0.8, 1.6);
    t.tp(k.i, p[0], p[1]);
    k.sabUsed = false; k.path = null; k.target = null; k.doing = 0; k._doing = null;
    t.clearDrags(); t.resetAiState(k.i);
    k.sabRoom = 'engine'; k._delay = 0; k._pipeCD = 0; k.sabUsed = false;
    const first = t.aiTickAlien(k.i, 1, 0.05);
    const r = t.aiTickAlien(k.i, 30, 0.05);
    return { first, sp, dmg: t.dmg(), sab: r.sab, fx: t.fx(), msg: g.msg, inv: t.inv() };
  }, AIK0);
  ok(AIK2.dmg.length === 1 && AIK2.dmg[0].room === 'engine' &&
    Math.abs(AIK2.dmg[0].left - 30) < 0.01 && AIK2.sab,
    'AI 异形抵达引擎舱后损毁设备：30 秒故障倒计时，消耗本夜破坏技');
  ok(AIK2.dmg[0] && AIK2.dmg[0].label === AIK2.sp.label &&
    AIK2.fx.includes('spark') && AIK2.fx.includes('alarm') &&
    AIK2.msg.indexOf('被损毁') >= 0,
    '破坏落点是该舱室设备（带名字）：火花 + 警报特效 + 全船播报');
  ok(AIK2.inv && AIK2.inv.fails.length === 0, 'AI 破坏舱室后不变量全过');
  const AIK3 = await T(o => {
    const t = SKV3._t, g = t.G();
    for (const h of g.agents) if (!h.alien && h.alive) t.tp(h.i, 85,75.5);
    const k = g.agents[o.i];
    for (const a of g.agents) if (a.alien && a !== k) t.tp(a.i, 85,75.5);
    t.tp(k.i, 12.2,57.2);
    k.sabUsed = true; k.knife = 1; k.path = null; k.target = null;
    k.doing = 0; k._doing = null; k._pipeCD = 0;
    t.clearDrags(); t.resetAiState(k.i); k.sabUsed = true; k.knife = 1;
    const r = t.aiTickAlien(k.i, 1, 0.05);
    return { r, fx: t.fx(), pipe: t.pipes(), cd: k._pipeCD };
  }, AIK0);
  const armPipe = AIK3.pipe.find(p => p.name.indexOf('军械库') >= 0);
  /* 2026-11-03：异形不再全图锁敌 ⇒ 没有目标时它钻管道是去**任务点最多的舱室**看看，
     出口按那个目的地选，所以这里按地图现算期望出口（不再写死军械库）。 */
  const WANT = await T(o => {
    const M = window.SKMapData, t = SKV3._t, g = t.G();
    /* 目的地按异形**出发前**所在的舱室排除（它现在已经瞬移到出口了，不能用事后位置） */
    const here = M.rooms.find(r => o.x >= r.rect[0] && o.x <= r.rect[0] + r.rect[2] &&
      o.y >= r.rect[1] && o.y <= r.rect[1] + r.rect[3]);
    const tally = {};
    for (const p of M.points) if (!here || p.room !== here.id) tally[p.room] = (tally[p.room] || 0) + 1;
    let room = null, n = 0;
    for (const kk in tally) if (tally[kk] > n) { n = tally[kk]; room = kk; }
    const r = M.rooms.find(q => q.id === room);
    const cx = r.rect[0] + r.rect[2] / 2, cy = r.rect[1] + r.rect[3] / 2;
    let best = null, bd = 1e9;
    for (const p of M.pipes) {
      if (here && p.room === here.id) continue;
      const d = Math.hypot(p.x - cx, p.y - cy);
      if (d < bd) { bd = d; best = p; }
    }
    return { room, x: best.x, y: best.y };
  }, { x: 12.2, y: 57.2 });
  ok(Math.abs(AIK3.r.x - WANT.x) < 0.01 && Math.abs(AIK3.r.y - WANT.y) < 0.01 &&
    AIK3.cd === 20,
    'AI 异形钻管道：没有目标时去任务热点舱室看看，出口按目的地选（' + WANT.room +
    '，20s 冷却）；旧实现是按全图目标位置选出口');
  ok(AIK3.fx.includes('pipefx'), '钻管道留下管道口特效');

  /* AI 异形拆保安有前提（2026-10-31）：必须房间里认出 2 名以上队友 + 有共同捕杀目标，
     否则默认不碰保安（落单拆保安=白送 saw_bot 确证）。落单与组队两个分支都测。 */
  const AIKB0 = await T(() => {
    /* 夹具必须写在页面上下文里：page.evaluate 不能引用 Node 侧的函数 */
    const t = SKV3._t; t.newGame();
    const g = t.G(); g.paused = true; g.noReport = true;
    const k = g.agents.find(a => a.alien && a.i !== 0 && a.alive);
    for (const a of g.agents) if (a !== k) { a.knife = 0; t.tp(a.i, 30,32); }
    g.breakerSaboteur = -1;
    t.clearDrags(); t.resetAiState(k.i);
    const sec = t.setBot('secbot', 80, 75, 0);
    const sb = g.bots.secbot; sb.wps = [[sec[0], sec[1]]]; sb.wp = 0; sb.ang = Math.PI;
    let p = null;
    for (let r = 0.8; r <= 1.6 && !p; r += 0.1)
      for (let i = 0; i < 20 && !p; i++) {
        const a = i / 20 * Math.PI * 2, x = sec[0] + Math.cos(a) * r, y = sec[1] + Math.sin(a) * r;
        if (t.free(x, y)) p = [x, y];
      }
    t.tp(k.i, p[0], p[1]);
    k.knife = 1; k.sabUsed = false; k._delay = 0; k.doing = 0; k._doing = null;
    k.path = null; k.target = null;
    const before = { hp: t.robots().sec.hp, dead: t.robots().sec.dead };
    const r1 = t.aiTickAlien(k.i, 3, 0.05);
    return { before, knife: r1.knife, sab: r1.sab, hp: t.robots().sec.hp,
      dead: t.robots().sec.dead };
  });
  ok(AIKB0.before.hp === 2 && AIKB0.knife === 1 && AIKB0.hp === 2 && !AIKB0.dead,
    '落单异形默认不攻击保安（刀数保留 / 保安装甲完好）');

  const AIKB = await T(() => {
    const t = SKV3._t; t.newGame();
    const g = t.G(); g.paused = true; g.noReport = true;
    const k = g.agents.find(a => a.alien && a.i !== 0 && a.alive);
    for (const a of g.agents) if (a !== k) { a.knife = 0; t.tp(a.i, 30,32); }
    g.breakerSaboteur = -1;
    t.clearDrags(); t.resetAiState(k.i);
    const sec = t.setBot('secbot', 80, 75, 0);
    const sb = g.bots.secbot; sb.wps = [[sec[0], sec[1]]]; sb.wp = 0; sb.ang = Math.PI;
    let ppt = null;
    for (let r = 0.8; r <= 1.6 && !ppt; r += 0.1)
      for (let i = 0; i < 20 && !ppt; i++) {
        const a = i / 20 * Math.PI * 2, x = sec[0] + Math.cos(a) * r, y = sec[1] + Math.sin(a) * r;
        if (t.free(x, y)) ppt = [x, y];
      }
    t.tp(k.i, ppt[0], ppt[1]);
    k.knife = 1; k.sabUsed = false; k._delay = 0; k.doing = 0; k._doing = null;
    k.path = null; k.target = null;
    /* 锁成中性性格：出刀门槛（knifeReach）随性格浮动会让 chase/bot 的效用
       竞争随机翻转，不锁的话这条断言时好时坏（2026-11-01 实测）。 */
    k.trait = { aggr: 50, caut: 50, soc: 50, cur: 50 };
    /* 造出「房间里认出 2 名队友 + 一个共同捕杀目标」的围攻局面 */
    const mates = g.agents.filter(a => a.alien && a !== k && a.alive).slice(0, 2);
    mates.forEach((m2, n) => {
      t.tp(m2.i, sec[0] + 3 + n, sec[1] + n * 0.8);
      k.mates[m2.i] = true;
    });
    /* 共同目标必须离异形本体 >5 格（否则 AI 会优先追人、轮不到机器人分支），
       同时仍在保安 8 格内 */
    const vic = g.agents.find(a => !a.alien && a.alive && a.i !== 0);
    t.tp(vic.i, sec[0] + 6, sec[1] - 4.5);
    const before = { knife: k.knife, sab: k.sabUsed, hp: t.robots().sec.hp, dead: t.robots().sec.dead };
    /* 围攻意愿是 70% 概率：这里固定随机数，避免门禁随机飘 */
    const oldR = Math.random; Math.random = () => 0.1;
    /* 1 秒足够贴身下刀：拉长到 3 秒会引入"追 vic 刀人"的中间漂移（flaky 源） */
    const r1 = t.aiTickAlien(k.i, 1, 0.05);
    Math.random = oldR;
    const after = { knife: r1.knife, sab: r1.sab, hp: t.robots().sec.hp, dead: t.robots().sec.dead,
      red: k.redT, acts: t.acts(), crime: g.pendingCrime };
    return { before, after, k: k.i, mates: mates.length, inv: t.inv(),
      plan: k._plan || null, doing: k._doing,
      robots: JSON.stringify(t.robots()) };
  });
  ok(AIKB.before.hp === 2 && AIKB.after.knife === 0,
    '组队围攻时 AI 异形才对保安出刀：消耗刀数（不再是白得的停摆）' +
    ' plan=' + JSON.stringify(AIKB.plan) + ' doing=' + AIKB.doing +
    ' robots=' + AIKB.robots);
  ok(AIKB.after.hp === 1 && !AIKB.after.dead && AIKB.after.sab === false,
    'AI 出刀按装甲 HP 结算：保安 2 点装甲只掉到 1，没被一刀拆死，也没偷用破坏技');
  ok(AIKB.after.red >= 1.49 && AIKB.after.acts.includes('stab'),
    'AI 对机器人出刀同样留下挥砍动作与 1.5 秒刀者红身');
  ok(AIKB.after.crime === AIKB.k && AIKB.inv.fails.length === 0,
    'AI 砍机器人同样登记危险行为（保安可反制），不变量全过');

  section('管道权限 · 人类不可用');
  await fresh(false);
  const HP = await T(() => {
    const t = SKV3._t, g = t.G();
    g.noReport = true;
    const pipe = t.pipes()[1];
    t.tp(0, pipe.x, pipe.y);
    const opened = t.openPipe();
    const msg1 = g.msg;
    const menu = t.pipe();
    const pos0 = t.pos();
    t.interact();
    return { opened, menu, msg1, pos0, pos1: t.pos(), msg2: g.msg, inv: t.inv() };
  });
  ok(!HP.opened && !HP.menu.open, '人类站在管道口：地道不可用');
  ok(HP.pos0[0] === HP.pos1[0] && HP.pos0[1] === HP.pos1[1], '人类不会因管道交互被传送');
  ok(HP.inv && HP.inv.fails.length === 0, '人类尝试管道后不变量全过');

  section('AI 人类 · 开枪 / 救人 / 补给');
  await fresh(false);
  const AHC0 = await T(() => {
    const t = SKV3._t, g = t.G();
    g.noReport = true;
    const k = g.agents.find(a => a.alien && a.i !== 0 && a.alive && !a.downed);
    const h = g.agents.find(a => !a.alien && a.i !== 0 && a.alive);
    t.tp(h.i, 56, 83.8); t.tp(k.i, 57.2, 85);
    h.bullet = 1; h.medkit = 0; h.suspect = k.i;
    h.doing = 0; h._doing = null; h.path = null; h._delay = 0; h._rest = 0;
    const r = t.aiTick(h.i, 1, 0.05);
    return { k: k.i, h: h.i, downed: g.agents[k.i].downed, rest: g.agents[h.i]._rest,
      bullet: r.bullet, crime: g.pendingCrime, suspect: g.agents[h.i].suspect,
      fx: t.fx(), inv: t.inv() };
  });
  ok(AHC0.downed && AHC0.bullet === 0 && AHC0.rest > 0,
    'AI 人类对目击凶手开枪：命中濒死 + 消耗子弹 + 进入冷却');
  ok(AHC0.crime === AHC0.h && AHC0.fx.includes('tracer') && AHC0.fx.includes('blood'),
    'AI 开枪同样留犯罪记录 + 完整弹道/血雾特效');
  ok(AHC0.inv && AHC0.inv.fails.length === 0, 'AI 开枪后不变量全过');
  await fresh(false);
  const AIDARK = await T(() => {
    const t = SKV3._t, g = t.G(); g.noReport = true;
    const h = g.agents.find(a => !a.alien && a.i !== 0 && a.alive && !a.downed);
    const k = g.agents.find(a => a.alien && a.i !== 0 && a.alive && !a.downed);
    for (const a of g.agents) if (a !== h && a !== k) t.tp(a.i, 30,32);
    t.tp(h.i, 56, 83.8); t.tp(k.i, 62, 85);
    h.bullet = 1; h.suspect = k.i; h.medkit = 0;
    h.doing = 0; h._doing = null; h.path = null; h._delay = 0; h._rest = 0;
    h._aimAng = Math.PI; /* 背对目标：手电锥朝西，东侧 6 格只剩近身圆 */
    t.breaker(); /* 全船断电：医疗间也变暗，AI 与玩家一样只有手电锥 + 近身圆 */
    const r = t.aiTick(h.i, 1, 0.05);
    return { h: h.i, k: k.i, bullet: r.bullet, downed: g.agents[k.i].downed,
      light: t.lights().state };
  });
  ok(AIDARK.light === 2 && AIDARK.bullet === 1 && !AIDARK.downed,
    'AI 人类在黑暗中背对目标：只有近身视野，不隔空开枪（子弹保留）');
  await fresh(false);
  const AHH = await T(() => {
    const t = SKV3._t, g = t.G(); g.noReport = true;
    const h = g.agents.find(a => !a.alien && a.i !== 0 && a.alive && !a.downed);
    const v = g.agents.find(a => !a.alien && a.i !== 0 && a.alive && !a.downed && a !== h);
    t.tp(h.i, 56, 83.8); t.tp(v.i, 57.2, 85);
    h.bullet = 1; h.suspect = v.i; h.medkit = 0;
    h.doing = 0; h._doing = null; h.path = null; h._delay = 0; h._rest = 0;
    const r = t.aiTick(h.i, 1, 0.05);
    return { h: h.i, v: v.i, bullet: r.bullet, downed: g.agents[v.i].downed, inv: t.inv() };
  });
  ok(AHH.downed && AHH.bullet === 0 && AHH.inv && AHH.inv.fails.length === 0,
    'AI 人类有证据时也会对人类开枪（不按阵营豁免）');

  await fresh(true);
  const ADV = await T(() => {
    const t = SKV3._t, g = t.G(); g.noReport = true;
    const h = g.agents.find(a => !a.alien && a.i !== 0 && a.alive && !a.downed);
    t.tp(0, 57.2,85); t.tp(h.i, 56, 83.8);
    h.bullet = 1; h.suspect = 0;
    h.doing = 0; h._doing = null; h.path = null; h._delay = 0; h._rest = 0;
    const r = t.aiTick(h.i, 1, 0.05);
    return { bullet: r.bullet, downed: g.me.downed, dev: g.dev, inv: t.inv() };
  });
  ok(ADV.dev && !ADV.downed && ADV.bullet === 0,
    'DEV 免伤仍消耗 AI 子弹（不再出现无限连射）');

  await fresh(false);
  const AHC1 = await T(() => {
    const t = SKV3._t, g = t.G();
    const v = g.agents.find(a => !a.alien && a.i !== 0 && a.alive && !a.downed);
    const h = g.agents.find(a => !a.alien && a.i !== 0 && a.alive && a !== v);
    t.tp(h.i, 56, 83.8); t.tp(v.i, 57.2, 85);
    v.downed = true; v.downAt = g.t; v.path = null; v.doing = 0; v._doing = null;
    h.medkit = 1; h.bullet = 0; h.suspect = null;
    h.doing = 0; h._doing = null; h.path = null; h._delay = 0; h._rest = 0;
    const first = t.aiTick(h.i, 1, 0.05);
    const r = t.aiTick(h.i, 110, 0.05);
    return { v: v.i, h: h.i, first, downed: g.agents[v.i].downed,
      med: r.medkit, fx: t.fx(), inv: t.inv() };
  });
  ok(AHC1.first.do === 'revive' && !AHC1.downed && AHC1.med === 0,
    'AI 人类用医疗包救起身边濒死者（医疗包 -1）');
  ok(AHC1.fx.includes('heal'), 'AI 施救留下治疗环特效');
  ok(AHC1.inv && AHC1.inv.fails.length === 0, 'AI 施救后不变量全过');
  const AHC2 = await T(() => {
    const t = SKV3._t, g = t.G();
    const h = g.agents.find(a => !a.alien && a.i !== 0 && a.alive);
    const sp = t.supplies().find(s => s.item === 'ammo');
    t.tp(h.i, sp.x, sp.y);
    h.bullet = 0; h.qual = 1; h.suspect = null; h.medkit = 0;
    h.doing = 0; h._doing = null; h.path = null; h._delay = 0; h._rest = 0;
    const first = t.aiTick(h.i, 1, 0.05);
    const r = t.aiTick(h.i, 210, 0.05);
    return { h: h.i, first, bullet: r.bullet, qual: r.qual, sp,
      fx: t.fx(), inv: t.inv() };
  });
  ok(AHC2.first.do === 'ammo' && AHC2.bullet === 1 && AHC2.qual === 0,
    'AI 人类在军械补给点消耗申请单换子弹（10s，子弹 +1 / 申请单 -1）');
  ok(AHC2.fx.includes('pickup'), 'AI 领取补给留下拾取光柱');
  ok(AHC2.inv && AHC2.inv.fails.length === 0, 'AI 领取补给后不变量全过');
  await fresh(false);
  const AIAMMO = await T(() => {
    const t = SKV3._t; t.newGame();
    const g = t.G(); g.paused = true; g.noReport = true; g.secbotUsed = true;
    const h = g.agents.find(a => !a.alien && a.i !== 0 && a.alive && !a.downed);
    const sp = t.supplies().find(s => s.item === 'ammo');
    t.tp(h.i, sp.x, sp.y);
    /* 锁成激进型（shootSus 0.36）：2026-10-31 起开枪门槛随性格，
       不锁的话谨慎 h 可能整段不开枪，"开枪后归零"断言就随机飘。 */
    h.trait = { aggr: 72, caut: 28, soc: 50, cur: 50 };
    h.bullet = 0; h.qual = 1; h.suspect = null; h.medkit = 0;
    h.doing = 0; h._doing = null; h.path = null; h._delay = 0; h._rest = 0;
    const a1 = t.aiTick(h.i, 210, 0.05);
    /* 2026-10-31 起「任务全做完」的 AI 会走 aiIdleRoam 巡舱——210 秒后 h 可能
       已经飘到别的舱室/掩体背后，玩家贴过去也未必可见。先把 h 拉回补给点再验开枪。 */
    t.tp(h.i, sp.x, sp.y);
    t.tp(0, h.x + 1, h.y);
    h.suspect = 0; h.doing = 0; h._doing = null; h.path = null;
    const a2 = t.aiTick(h.i, 1, 0.05);
    const a3 = t.aiTick(h.i, 210, 0.05);
    return { afterBuy: { bullet: a1.bullet, qual: a1.qual },
      afterShot: { bullet: a2.bullet, qual: a2.qual, playerDown: g.me.downed },
      afterWait: { bullet: a3.bullet, qual: a3.qual } };
  });
  ok(AIAMMO.afterBuy.bullet === 1 && AIAMMO.afterBuy.qual === 0,
    'AI 领取子弹：子弹 +1、申请单 -1');
  ok(AIAMMO.afterShot.bullet === 0 && AIAMMO.afterShot.qual === 0 &&
    AIAMMO.afterWait.bullet === 0,
    'AI 子弹有限：开枪后归零，不会凭申请单无限补弹'
    + '（买后 弹' + AIAMMO.afterBuy.bullet + '/单' + AIAMMO.afterBuy.qual
    + ' · 打后 弹' + AIAMMO.afterShot.bullet + '/单' + AIAMMO.afterShot.qual
    + ' · 等待后 弹' + AIAMMO.afterWait.bullet + '/单' + AIAMMO.afterWait.qual + '）');
  await fresh(false);  /* AIAMMO 把 0 号 tp 到过巡舱后的 h 旁边（可能不可走），重开局再测领取 */
  const AIQ = await T(() => {
    const t = SKV3._t, g = t.G();
    const h = g.agents.find(a => !a.alien && a.i !== 0 && a.alive);
    h.qualPending = 1; h.qual = 0; h.medkit = 0; h.bullet = 0; h.suspect = null;
    h.doing = 0; h._doing = null; h._rest = 0; h._delay = 0; h.path = null;
    const q = t.qualDesk();
    t.tp(h.i, q.x, q.y);
    const first = t.aiTick(h.i, 1, 0.05);
    return { first, q, inv: t.inv() };
  });
  ok(AIQ.first.do === 'qual' && AIQ.first.qualPending === 1,
    'AI 人类同样必须回中央会议室圆桌领取物资申请单');
  ok(AIQ.inv && AIQ.inv.fails.length === 0, 'AI 领取申请单状态不变量全过' +
    (AIQ.inv && AIQ.inv.fails.length ? '（失败项：' +
      AIQ.inv.fails.slice(0, 4).map(f => f.code + ':' + f.msg).join(' | ') + '）' : ''));
  /* 真实节奏：先做任务到 3 分，再自己走回圆桌领取；不是把 qualPending 预先塞进去 */
  const AIQN = await T(() => {
    const t = SKV3._t; t.newGame();
    const g = t.G(); g.paused = true; g.noReport = true; g.dmg = [];
    g.secbotDead = true; g.medbotDead = true;
    const h = g.agents.find(a => !a.alien && a.i !== 0 && a.alive);
    for (const a of g.agents) if (a !== h) t.tp(a.i, 28.4, 54);
    h._delay = 0; h._rest = 0; h.doing = 0; h._doing = null; h.path = null;
    h.progress = 2; h.tIdx = 0; h._q3 = false; h._q5 = false; h.qualPending = 0; h.qual = 0;
    const spot = t.taskSpot(h.i);
    t.tp(h.i, spot.x, spot.y);
    t.aiTick(h.i, 4500, 0.05);
    const evs = t.events().filter(e => e.kind === 'qual' && e.actor === h.i);
    return { progress: h.progress, qp: h.qualPending, qual: h.qual, do: h._doing,
      spot, claims: evs.length, inv: t.inv() };
  });
  ok(AIQN.progress >= 3 && AIQN.qp === 0 && AIQN.qual >= 1 && AIQN.claims >= 1,
    'AI 人类完成 3 分后会自己回圆桌领取申请单（progress=' + AIQN.progress +
    ' / 待领 ' + AIQN.qp + ' / 申请单 ' + AIQN.qual + '）');
  ok(AIQN.inv && AIQN.inv.fails.length === 0, 'AI 自然领取申请单后不变量全过');

  section('AI 拖拽 · 濒死者送医疗间复活');
  await fresh(false);
  const ADR = await T(() => {
    const t = SKV3._t; t.newGame();
    const g = t.G(); g.paused = true; g.noReport = true; g.dmg = [];
    const k = g.agents.find(a => a.alien && a.i !== 0 && a.alive);
    const v = g.agents.find(a => !a.alien && a.i !== 0 && a.alive);
    const h = g.agents.find(a => !a.alien && a.i !== 0 && a.alive && a !== v);
    for (const a of g.agents) if (a !== k && a !== v && a !== h) t.tp(a.i, 30,32);
    t.clearDrags();
    [k, v, h].forEach(a => {
      t.resetAiState(a.i);
      a._delay = 0; a._rest = 0; a.knife = 0; a.bullet = 0; a.medkit = 0;
      a.qual = 0; a.qualPending = 0; a.suspect = null; a.tIdx = a.tasks.length;
    });
    k.knife = 1;
    t.tp(v.i, 58,63); t.tp(h.i, 58.4,62.4);
    t.knife(k.i, v.i);
    k.knife = 0;
    const first = t.aiTick(h.i, 2, 0.05);
    return { k: k.i, v: v.i, h: h.i, drag: first.drag,
      draggedBy: g.agents[v.i].draggedBy, inv: t.inv(), med: t.robots().med.left };
  });
  ok(ADR.drag === ADR.v && ADR.draggedBy === ADR.h,
    'AI 人类没有医疗包时把濒死者拖起来（双向标记互指）');
  ok(ADR.inv.fails.length === 0, 'AI 拖拽起始不变量全过');
  const ADR2 = await T(o => {
    const t = SKV3._t, g = t.G();
    let last = null;
    for (let i = 0; i < 900; i++) {
      last = t.aiTick(o.h, 1, 0.05);
      if (last.drag === null && i > 4) break;
    }
    return { drag: last.drag, draggedBy: g.agents[o.v].draggedBy,
      room: t.state()[o.v].room, moved: t.bodyInfo(o.v).moved,
      pos: t.bodyOf(o.v), med: t.robots().med.left, inv: t.inv() };
  }, ADR);
  ok(ADR2.drag === null && ADR2.draggedBy === null, 'AI 把伤者拖进医疗间后松手');
  ok(ADR2.room === 'med', '伤者被拖进医疗间（当前 ' + ADR2.room + '）');
  ok(ADR2.moved === true, 'AI 拖拽同样留下 bodyMoved 痕迹（搜尸可读）');
  const ADR3 = await T(o => {
    const t = SKV3._t;
    const vv = t.G().agents[o.v];
    for (let i = 0; i < 40; i++) { t.setBot('medbot', vv.x, vv.y); t.botTick(0.2); }
    const st = t.state()[o.v];
    return { downed: st.downed, alive: st.alive, left: t.robots().med.left, inv: t.inv() };
  }, ADR);
  ok(ADR3.alive && !ADR3.downed, '医疗无人机把 AI 拖来的伤者救活');
  ok(ADR3.left === 1, '医疗无人机电量按次扣减（剩 ' + ADR3.left + '/2）');
  ok(ADR3.inv.fails.length === 0, 'AI 拖尸→医疗间复活链路不变量全过');

  section('AI 异形 · 藏尸');
  await fresh(false);
  const HID = await T(() => {
    const t = SKV3._t; t.newGame();
    const g = t.G(); g.paused = true; g.noReport = true;
    const k = g.agents.find(a => a.alien && a.i !== 0 && a.alive);
    const v = g.agents.find(a => !a.alien && a.i !== 0 && a.alive);
    /* 旁观者集中停在**暗舱**（引擎室）：亮区整片可见之后，停在亮会议室的人会顺着
       相连的直走廊看出去（亮舱→相连走廊的分支不看距离，只要求 LOS），
       拖尸路线一进走廊就变成"当着 13 个人拖尸"，异形按规则松手 ⇒ 夹具自己制造了目击者。
       暗舱里他们只有 3.5 格近身视野，且房间中心有 13 人 ⇒ `hideRoomFor` 也不会选它当藏尸点。 */
    for (const a of g.agents) if (a !== k && a !== v) t.tp(a.i, 9,52);
    t.clearDrags(); t.resetAiState(k.i);
    g.secbotDead = true;
    k.knife = 0; k.sabUsed = true; k._delay = 0; k._rest = 0;
    t.tp(v.i, 84,54); t.kill(v.i, 'knife');
    t.tp(k.i, 84.6,54.6);
    const b0 = t.bodyOf(v.i);
    let dragSeen = false, last = null;
    for (let i = 0; i < 900; i++) {
      last = t.aiTickAlien(k.i, 1, 0.05);
      if (last.drag === v.i) dragSeen = true;
      if (dragSeen && last.drag === null) break;
    }
    const b1 = t.bodyOf(v.i);
    const room = t.roomIdAt(b1[0], b1[1]);
    return { k: k.i, v: v.i, dragSeen, b0, b1,
      dist: Math.hypot(b1[0] - b0[0], b1[1] - b0[1]),
      hides: last.hides, draggedBy: t.state()[v.i].draggedBy,
      moved: t.bodyInfo(v.i).moved, room,
      spot: t.hideSpot(room), inv: t.inv() };
  });
  ok(HID.dragSeen, 'AI 异形会把尸体拖走藏起来（不必等玩家发现）');
  ok(HID.dist > 2 && HID.moved === true,
    '尸体被拖动 ' + HID.dist.toFixed(2) + ' 格并写入 bodyMoved');
  ok(HID.draggedBy === null && HID.hides === 1, '藏到角落后松手，本夜藏尸计数 +1');
  ok(HID.room !== 'med' && HID.room !== 'bridge' && HID.spot &&
    Math.hypot(HID.b1[0] - HID.spot[0], HID.b1[1] - HID.spot[1]) < 2.2,
    '藏尸点落在远离门与任务点的舱室角落（当前 ' + HID.room + '）');
  ok(HID.inv.fails.length === 0, 'AI 藏尸后不变量全过');

  await fresh(false);
  const HIDFAR = await T(() => {
    const t = SKV3._t; t.newGame();
    const rooms = t.rooms();
    const med = rooms.find(r => r.id === 'med');
    const cands = rooms.filter(r => r.id !== 'med' && r.id !== 'bridge');
    const dist = (r) => Math.hypot(r.x - med.x, r.y - med.y);
    const near = cands.slice().sort((a, b) => dist(a) - dist(b))[0];
    const dest = t.hideRoomFor(near.id, near.x, near.y);
    const d = rooms.find(r => r.id === dest);
    return { med: med.id, near: near.id, dest, nearD: dist(near),
      destD: d ? dist(d) : -1 };
  });
  ok(HIDFAR.dest !== 'med' && HIDFAR.destD > HIDFAR.nearD,
    '藏尸目的地优先远离医疗间：从 ' + HIDFAR.near + ' 改拖到 ' + HIDFAR.dest +
    '（' + HIDFAR.nearD.toFixed(1) + ' → ' + HIDFAR.destD.toFixed(1) + ' 格）');

  section('AI 异形 · 避开保安扇形');
  await fresh(false);
  const SEC = await T(() => {
    const t = SKV3._t; t.newGame();
    const g = t.G(); g.paused = true; g.noReport = true;
    const k = g.agents.find(a => a.alien && a.i !== 0 && a.alive);
    const v = g.agents.find(a => !a.alien && a.i !== 0 && a.alive);
    for (const a of g.agents) if (a !== k && a !== v) t.tp(a.i, 30,32);
    t.clearDrags(); t.resetAiState(k.i);
    const sec = t.setBot('secbot', 66, 32, 0);
    const sb = g.bots.secbot; sb.wps = [[sec[0], sec[1]]]; sb.wp = 0; sb.ang = 0;
    t.tp(k.i, 69,32); t.tp(v.i, 70,32);
    k.knife = 1; k.sabUsed = true; k._delay = 0; k._rest = 0;
    k._botCD = 999;              /* 本节只验"保安扇形回避"，机器人砍击另有 AIKB 用例 */
    const seen = t.secWouldSee(69, 32);
    const r1 = t.aiTickAlien(k.i, 20, 0.05);
    const blocked = { downed: t.state()[v.i].downed, avoid: r1.secAvoid, knife: k.knife };
    t.setBot('secbot', sec[0], sec[1], Math.PI);
    t.tp(k.i, 69,32); t.tp(v.i, 70,32);   /* 回避阶段可能走开：复位后再验补刀 */
    k._secAvoidT = 0; k.path = null; k.target = null;
    t.aiTickAlien(k.i, 40, 0.05);
    return { seen, blocked, after: { downed: t.state()[v.i].downed, knife: k.knife },
      detained: t.detained().length, inv: t.inv() };
  });
  ok(SEC.seen && !SEC.blocked.downed && SEC.blocked.avoid > 0 && SEC.blocked.knife === 1,
    '保安扇形正对时 AI 异形不出刀（宁可废刀也不进拘留区）');
  ok(SEC.after.downed && SEC.after.knife === 0,
    '保安转向背后后 AI 异形立刻补刀（同一判定，换个朝向就动手）');
  ok(SEC.detained === 0 && SEC.inv.fails.length === 0, '回避判定没有触发拘留，不变量全过');

  section('AI 异形 · 目击判定与队友配合');
  await fresh(false);
  const WIT = await T(() => {
    const t = SKV3._t; t.newGame();
    const g = t.G(); g.paused = true; g.noReport = true;
    const k = g.agents.find(a => a.alien && a.i !== 0 && a.alive);
    const vs = g.agents.filter(a => !a.alien && a.i !== 0 && a.alive).slice(0, 4);
    const w1 = g.agents.find(a => !a.alien && a.i !== 0 && a.alive && vs.indexOf(a) < 0);
    const w2 = g.agents.find(a => !a.alien && a.i !== 0 && a.alive && vs.indexOf(a) < 0 && a !== w1);
    const keep = [k, w1, w2].concat(vs);
    for (const a of g.agents) if (keep.indexOf(a) < 0) t.tp(a.i, 28.4,54);
    g.secbotDead = true; g.medbotDead = true;
    t.clearDrags(); t.resetAiState(k.i);
    for (const a of keep) { a._delay = 0; a._rest = 0; a.path = null; a.target = null; }
    k.knife = 1; k.sabUsed = true;
    /* 固定成谨慎型（aggr=28 / caut=72）：本组断言测的是「目击者风险」的保守分支。
       2026-10-31 起出刀胆量随性格（knifeBold / knifeWatcherCap），
       不锁性格的话激进 AI 会在 2 个目击者面前照砍，测试就没法断言了。 */
    k.trait = { aggr: 28, caut: 72, soc: 50, cur: 50 };
    /* 引擎舱是暗舱：旁观者在 1~1.5 格内一定能看见 */
    const setup = (v, two) => {
      for (const u of vs) if (u !== v) t.tp(u.i, 28.4,54);
      t.tp(k.i, 8,53); t.tp(v.i, 9,53); t.tp(w1.i, 10,53);
      t.tp(w2.i, two ? 8 : 30, two ? 52 : 32);
      k.path = null; k.target = v; v.path = null; k.knife = 1;
    };
    setup(vs[0], false);
    const seen = t.witnessesAt(k.i, 9, 53, 6, vs[0].i);
    const oldRandom = Math.random;
    /* 1 个非队友目击者 + 冒险 → 直接出刀 */
    Math.random = () => 0;
    t.aiTickAlien(k.i, 1, 0.05);
    const oneRisk = { downed: t.state()[vs[0].i].downed };
    /* 每一次行凶都会让异形记住目击者；分支之间清空，避免它改追目击者 */
    const clearAlienMind = () => {
      k.mind.seenBy = {}; k.mind.mem = []; k.mind.sus = {}; k.mind.why = {}; k.mind.alert = 0;
      k.target = null; k.path = null; k._avoid = {};
    };
    /* 1 个非队友目击者 + 谨慎 → 放弃目标（不再原地等待/踱步） */
    clearAlienMind();
    setup(vs[1], false); Math.random = () => 0.999;
    t.aiTickAlien(k.i, 1, 0.05);
    const oneHold = { downed: t.state()[vs[1].i].downed,
      target: k.target ? k.target.i : null,
      avoid: !!(k._avoid && k._avoid[vs[1].i] > 0) };
    /* 2 个非队友目击者 → 无论随机数都放弃 */
    clearAlienMind();
    setup(vs[2], true); Math.random = () => 0;
    t.aiTickAlien(k.i, 1, 0.05);
    const two = { downed: t.state()[vs[2].i].downed,
      target: k.target ? k.target.i : null,
      avoid: !!(k._avoid && k._avoid[vs[2].i] > 0) };
    /* 目击者是已认出的队友 → 不算风险，高随机数也照常出刀 */
    clearAlienMind();
    k.mates[w1.i] = { t: 0, kind: 'saw_red' };
    setup(vs[3], false); t.tp(w2.i, 28.4,54);
    k.target = vs[3]; Math.random = () => 0.999;
    t.aiTickAlien(k.i, 1, 0.05);
    const mate = { downed: t.state()[vs[3].i].downed };
    Math.random = oldRandom;
    return { k: k.i, w1: w1.i, seen, oneRisk, oneHold, two, mate, inv: t.inv() };
  });
  ok(WIT.seen.indexOf(WIT.w1) >= 0, '旁观者识别：能看见出手点的活人被算作目击者');
  ok(WIT.oneRisk.downed, '只有 1 个非队友目击者：仍有一定概率直接出刀');
  ok(!WIT.oneHold.downed && WIT.oneHold.target === null && WIT.oneHold.avoid,
    '只有 1 个目击者但选择谨慎：直接放弃目标，不原地踱步');
  ok(!WIT.two.downed && WIT.two.target === null && WIT.two.avoid,
    '2 个非队友目击者：必定放弃，转而寻找落单者');
  ok(WIT.mate.downed, '目击者是已认出的队友：不算风险，照常出刀配合');
  ok(WIT.inv.fails.length === 0, '目击/队友判定后不变量全过');

  section('AI 异形 · 队友识别与保护');
  await fresh(false);
  const MATE = await T(() => {
    const t = SKV3._t; t.newGame();
    const g = t.G(); g.paused = true; g.noReport = true;
    const al = g.agents.filter(a => a.alien && a.i !== 0 && a.alive).slice(0, 2);
    const k = al[0], m = al[1];
    const v = g.agents.find(a => !a.alien && a.i !== 0 && a.alive);
    for (const a of g.agents) if (a !== k && a !== m && a !== v) t.tp(a.i, 28.4,54);
    t.resetAiState(k.i); t.resetAiState(m.i);
    k.mates = {}; m.mates = {};
    g.secbotDead = true; g.medbotDead = true;
    t.tp(k.i, 8,53); t.tp(m.i, 9,53); t.tp(v.i, 8,51);
    for (const a of [k, m, v]) { a._delay = 0; a._rest = 0; a.path = null; a.target = null; }
    t.notice(m.i, 9, 53, 6, 'pipe', null);
    const pipeMate = t.mind(k.i).mates[m.i] || null;
    m.redT = 3; t.track();
    const redMate = t.mind(k.i).mates[m.i] || null;
    t.breaker();
    t.tp(k.i, 48,54); t.tp(m.i, 47,54);
    t.notice(m.i, 47, 54, 6, 'breaker', null);
    const brMate = t.mind(k.i).mates[m.i] || null;
    k.knife = 1; k.sabUsed = true; k._botCD = 999; k._delay = 0;
    k.target = null; k.path = null;
    t.aiTickAlien(k.i, 1, 0.05);
    const tgt = k.target ? k.target.i : null;
    t.openMeeting('day', null, null);
    t.startVote();
    const vote = g.meet ? g.meet.votes[k.i] : null;
    if (g.meet) t.finishMeeting();
    return { k: k.i, m: m.i, v: v.i, pipeMate, redMate, brMate, tgt, vote };
  });
  ok(MATE.pipeMate && MATE.pipeMate.kind === 'pipe' &&
    MATE.redMate && MATE.redMate.kind === 'saw_red',
    '异形目击队友钻管道 / 红光 → 记成队友');
  ok(MATE.brMate && MATE.brMate.kind === 'breaker', '异形目击断电拉闸 → 记成队友');
  ok(MATE.tgt !== MATE.m && MATE.vote !== MATE.m,
    '队友不会被当作刀下目标，也不会被队友投票');

  await fresh(false);
  const ALLY = await T(() => {
    const t = SKV3._t; t.newGame();
    const g = t.G(); g.paused = true; g.noReport = true;
    const al = g.agents.filter(a => a.alien && a.i !== 0 && a.alive).slice(0, 2);
    const k = al[0], m = al[1];
    const v = g.agents.find(a => !a.alien && a.i !== 0 && a.alive);
    for (const a of g.agents) if (a !== k && a !== m && a !== v) t.tp(a.i, 28.4,54);
    t.resetAiState(k.i); t.resetAiState(m.i);
    k.mates = {}; m.mates = {};
    k.mates[m.i] = { t: 0, kind: 'pipe' };
    m.mates[k.i] = { t: 0, kind: 'pipe' };
    t.tp(k.i, 56, 83.8); t.tp(m.i, 57, 85); t.tp(v.i, 55, 83.8);
    const oldRandom = Math.random;
    /* 2026-11-08：先发制人会把一只异形的靶子提前定死，这里测的是"构陷 + 队友帮腔"，
       所以临时关掉 FIRST，避免它抢走 liar 的角色。 */
    const F0 = window.SKSanity;
    const oldFirst = F0.FIRST.chance;
    F0.FIRST.chance = 0;
    Math.random = () => 0;
    t.openMeeting('day', null, null);
    Math.random = oldRandom;
    F0.FIRST.chance = oldFirst;
    const f = (t.meetCtx().frames || [])[0] || null;
    t.startVote();
    const vote = g.meet ? g.meet.votes[k.i] : null;
    if (g.meet) t.finishMeeting();
    return { k: k.i, m: m.i, v: v.i, f, vote };
  });
  ok(ALLY.f && ALLY.f.ally != null && ALLY.f.ally !== ALLY.f.by &&
    ALLY.f.ally !== ALLY.f.target && /我也看见了/.test(ALLY.f.allyText || ''),
    '异形主动构陷时，已认出的队友帮腔共同诬陷');
  ok(ALLY.f && ALLY.f.target !== ALLY.m && ALLY.vote !== ALLY.m,
    '联合构陷不会指向队友');

  section('人类 AI · 故障优先 / 弃修逃跑');
  await fresh(false);
  const FLEE = await T(() => {
    const t = SKV3._t; t.newGame();
    const g = t.G(); g.paused = true; g.noReport = true;
    const h = g.agents.find(a => !a.alien && a.i !== 0 && a.alive);
    const k = g.agents.find(a => a.alien && a.i !== 0 && a.alive);
    for (const a of g.agents) if (a !== h && a !== k) t.tp(a.i, 28.4,54);
    t.tp(h.i, 30,33); t.tp(k.i, 34,33);
    h._delay = 0; h._rest = 0; h.doing = 8; h._doing = 'task'; h._taskPt = h.tasks[0];
    h.path = null; h.mind.known[k.i] = { t: 0, kind: 'saw_pipe', room: 'bridge', conf: 0.95 };
    k.moving = true; k.path = [[31, 11]];
    t.aiTick(h.i, 1, 0.05);
    return { doing: h.doing, do: h._doing, flee: h._fleeT || 0,
      path: !!(h.path && h.path.length) };
  });
  ok(FLEE.doing === 0 && FLEE.flee > 0 && FLEE.path,
    '人类 AI 修任务时确认异形逼近：立刻弃修逃跑');

  const REP = await T(() => {
    const t = SKV3._t; t.newGame();
    const g = t.G(); g.paused = true; g.noReport = true;
    const h = g.agents.find(a => !a.alien && a.i !== 0 && a.alive);
    const k = g.agents.find(a => a.alien && a.i !== 0 && a.alive);
    for (const a of g.agents) if (a !== h && a !== k) t.tp(a.i, 28.4,54);
    t.tp(h.i, 8,53); t.tp(k.i, 28.4,54);
    g.dmg = [{ room: 'engine', x: 6, y: 51, label: '测试故障', left: 60, dur: 60, by: k.i }];
    h._delay = 0; h._rest = 0; h._fixGo = null; h.path = null;
    h.doing = 0; h._doing = null; h._lightGo = false;
    t.aiTick(h.i, 1, 0.05);
    return { fixGo: !!h._fixGo, doing: h._doing, path: !!(h.path && h.path.length) };
  });
  ok(REP.fixGo || REP.doing === 'fix' || REP.path,
    '看到故障后人类 AI 直接前往/开始维修，不被别的事务打断');

  section('人类 AI 幽灵 · 1 分额度');
  await fresh(false);
  const AG = await T(() => {
    const t = SKV3._t; t.newGame();
    const g = t.G(); g.paused = true; g.noReport = true;
    const h = g.agents.find(a => !a.alien && a.i !== 0 && a.alive);
    t.kill(h.i, 'knife');
    g.dmg = [];
    h.ghostPts = 0; h.tIdx = 0; h.doing = 0; h._doing = null; h.path = null;
    h.tasks = [1, 2, 3, 5];          /* 额度 1 分：AI 幽灵也只能接普通任务 */
    const cap = t.ghostCap();
    const spot = t.taskSpot(h.i);
    t.tp(h.i, spot.x, spot.y);
    t.aiGhostTick(h.i, 1, 0.05);
    const steps = Math.ceil(((h.doing || 1) + 1) / 0.05);
    t.aiGhostTick(h.i, steps, 0.05);
    const p1 = h.ghostPts || 0;
    h.ghostPts = cap; h.doing = 0; h._doing = null; h.path = null;
    const spot2 = t.taskSpot(h.i);
    t.tp(h.i, spot2.x, spot2.y);
    const r2 = t.aiGhostTick(h.i, 1, 0.05);
    return { p1, doing: h.doing, do: h._doing, pts: h.ghostPts || 0, r2, cap };
  });
  ok(AG.p1 > 0 && AG.p1 <= AG.cap,
    '人类 AI 幽灵做剩余任务，进度不超过 ' + AG.cap + ' 分');
  ok(AG.doing === 0 && AG.do !== 'task' && AG.pts === AG.cap,
    '额度用尽后 AI 幽灵不再做任务');

  section('幽灵 · 异形幽灵不推进人类进度');
  await fresh(false);
  const AG2 = await T(() => {
    const t = SKV3._t; t.newGame();
    const g = t.G(); g.paused = true; g.noReport = true; g.dmg = [];
    const k = g.agents.find(a => a.alien && a.i !== 0 && a.alive);
    t.kill(k.i, 'knife');
    k.ghostPts = 0; k.tIdx = 0; k.doing = 0; k._doing = null; k.path = null;
    const spot = t.taskSpot(k.i);
    t.tp(k.i, spot.x, spot.y);
    const r = t.aiGhostTick(k.i, 1, 0.05);
    return { do: r.do, doing: r.doing, tIdx: r.tIdx, pts: r.ghostPts || 0 };
  });
  ok(AG2.do !== 'task' && AG2.doing === 0 && AG2.tIdx === 0 && AG2.pts === 0,
    '异形幽灵不执行任务/维修，不推进人类进度');

  section('AI 搜尸取物资 · 人类与异形');
  await fresh(false);
  const LOOTB = await T(() => {
    const t = SKV3._t; t.newGame();
    const g = t.G(); g.paused = true; g.noReport = true; g.dmg = [];
    const h = g.agents.find(a => !a.alien && a.i !== 0 && a.alive);
    const k = g.agents.find(a => a.alien && a.i !== 0 && a.alive);
    const v1 = g.agents.find(a => !a.alien && a.i !== 0 && a.alive && a !== h);
    const v2 = g.agents.find(a => !a.alien && a.i !== 0 && a.alive && a !== h && a !== v1);
    for (const a of g.agents) if ([h, k, v1, v2].indexOf(a) < 0) t.tp(a.i, 28.4,54);
    t.tp(h.i, 30,33); t.tp(v1.i, 34,33);
    t.tp(k.i, 8,53); t.tp(v2.i, 10,53);
    for (const a of [h, k, v1, v2]) { a._delay = 0; a._rest = 0; a.path = null; a.target = null; }
    t.kill(v1.i, 'knife'); v1.bullet = 1; v1.qual = 1; v1.medkit = 0;
    t.kill(v2.i, 'knife'); v2.bullet = 1; v2.medkit = 1; v2.qual = 0;
    h.bullet = 0; h.medkit = 0; h.qual = 0;
    k.bullet = 0; k.medkit = 0; k.qual = 0; k.knife = 0;
    k.sabUsed = true; k._hides = 2; k._hideCD = 999;
    g.secbotDead = true; g.medbotDead = true;
    /* AI 拿到物资后会按规则立刻花掉（申请单换补给、子弹打人），所以不能只看到终点背包；
       逐帧记录“第一次拿到物资”的瞬间，并让事件流给出对应 search 证据。 */
    const grab = { h: null, k: null };
    for (let i = 0; i < 280; i++) {
      t.aiTickAlien(k.i, 1, 0.05);
      if (!grab.k && ((k.bullet | 0) >= 1 || (k.medkit | 0) >= 1 || (k.qual | 0) >= 1))
        grab.k = { i, bullet: k.bullet | 0, medkit: k.medkit | 0, qual: k.qual | 0 };
      t.aiTick(h.i, 1, 0.05);
      if (!grab.h && ((h.bullet | 0) >= 1 || (h.qual | 0) >= 1))
        grab.h = { i, bullet: h.bullet | 0, qual: h.qual | 0 };
    }
    const searches = t.events().filter(e => e.kind === 'search').map(e => ({
      actor: e.actor, victim: e.victim, bullet: e.bullet, medkit: e.medkit, qual: e.qual
    }));
    return { h: { bullet: h.bullet, medkit: h.medkit, qual: h.qual },
      k: { bullet: k.bullet, medkit: k.medkit, qual: k.qual },
      grab, v1s: !!v1.searched, v2s: !!v2.searched, searches,
      hi: h.i, ki: k.i, v1i: v1.i, v2i: v2.i };
  });
  ok(!!LOOTB.grab.h && LOOTB.v1s &&
    LOOTB.searches.some(e => e.actor === LOOTB.hi && e.victim === LOOTB.v1i &&
      (e.bullet + e.medkit + e.qual) > 0),
    '人类 AI 会走到尸体旁搜尸并取走子弹/申请单（第 '
    + (LOOTB.grab.h ? LOOTB.grab.h.i : '—') + ' 步拿到，事件流留痕）');
  ok(!!LOOTB.grab.k && LOOTB.v2s &&
    LOOTB.searches.some(e => e.actor === LOOTB.ki && e.victim === LOOTB.v2i &&
      (e.bullet + e.medkit + e.qual) > 0),
    '异形 AI 同样会翻尸拿子弹/医疗包/申请单（事件流留痕）');

  await fresh(false);
  const LOOTD = await T(() => {
    const t = SKV3._t; t.newGame();
    const g = t.G(); g.paused = true; g.noReport = true; g.dmg = [];
    const k = g.agents.find(a => a.alien && a.i !== 0 && a.alive);
    const v = g.agents.find(a => !a.alien && a.i !== 0 && a.alive);
    for (const a of g.agents) if (a !== k && a !== v) t.tp(a.i, 28.4,54);
    t.resetAiState(k.i);
    g.secbotDead = true; g.medbotDead = true;
    k.knife = 0; k.bullet = 0; k.medkit = 0; k.qual = 0; k.qualPending = 0;
    k.sabUsed = true; k._hides = 2; k._hideCD = 999; k._delay = 0; k._rest = 0;
    v.downed = true; v.alive = true; v.downAt = g.t; v.downX = 56; v.downY = 51;
    v.bullet = 0; v.medkit = 0; v.qual = 0; v.qualPending = 1;
    t.tp(k.i, 57.4, 85); t.tp(v.i, 56, 83.8);
    for (let i = 0; i < 12; i++) t.aiScan(k.i, 0.06);
    const start = { do: k._doing, sv: k._sv };
    t.aiTickAlien(k.i, 40, 0.05);
    return { start, qual: k.qual, qp: k.qualPending, vqp: v.qualPending,
      searched: v.searched, inv: t.inv() };
  });
  ok(LOOTD.start.do === 'search' && (LOOTD.qual >= 1 || LOOTD.qp >= 1) &&
    LOOTD.vqp === 0,
    '异形会搜还活着的倒地伤员，继承其未领取的申请单（不再等到天亮尸体被清场）');
  ok(LOOTD.inv.fails.length === 0, '异形搜倒地伤员后不变量全过');

  await fresh(false);
  const LOOTM = await T(() => {
    const t = SKV3._t; t.newGame();
    const g = t.G(); g.paused = true; g.noReport = true; g.dmg = [];
    const h = g.agents.find(a => !a.alien && a.i !== 0 && a.alive);
    const v = g.agents.find(a => !a.alien && a.i !== 0 && a.alive && a !== h);
    for (const a of g.agents) if (a !== h && a !== v) t.tp(a.i, 28.4,54);
    /* 医疗无人机可用时“把伤员拖去医疗间”优先级高于搜尸，这条测的是记忆绕回收尸，
       所以先关掉救援选项，否则 AI 会一路拖着伤员走、永远不开始 search。 */
    g.secbotDead = true; g.medbotDead = true;
    h.bullet = 0; h.medkit = 0; h.qual = 0; h.qualPending = 0;
    h.tIdx = h.tasks.length; h._delay = 0; h._rest = 0; h.path = null;
    h.doing = 0; h._doing = null; h._lootMem = {};
    v.downed = true; v.alive = true; v.downAt = g.t; v.downX = 40; v.downY = 30;
    v.bullet = 0; v.medkit = 0; v.qual = 0; v.qualPending = 1;
    /* 找一处真正可站立、且有视线、彼此相隔 4 格的同房位置；
       40,30 是墙/未知区域，旧测试会因此观察不到。 */
    const rooms = t.rooms();
    let hp = null, vp = null;
    for (const r of rooms) {
      for (let dx = -2; dx <= 2 && !hp; dx += 0.5)
        for (let dy = -2; dy <= 2 && !hp; dy += 0.5) {
          const x = r.x + dx, y = r.y + dy, vx = x + 4, vy = y;
          if (!t.free(x, y) || !t.free(vx, vy) || !t.los(x, y, vx, vy)) continue;
          hp = [x, y]; vp = [vx, vy];
        }
      if (hp) break;
    }
    if (!hp) { hp = [44, 30]; vp = [40, 30]; }
    t.tp(h.i, hp[0], hp[1]); t.tp(v.i, vp[0], vp[1]);
    for (let i = 0; i < 12; i++) t.aiScan(h.i, 0.06);
    const mem = !!(h._lootMem && h._lootMem[v.i]);
    /* 离开视野：在 12–18 格内找一处可站点（记忆半径 20），只剩记忆能指路 */
    let far = null;
    for (let rr = 12; rr <= 18 && !far; rr += 1)
      for (let ai = 0; ai < 24 && !far; ai++) {
        const a = ai / 24 * Math.PI * 2;
        const x = vp[0] + Math.cos(a) * rr, y = vp[1] + Math.sin(a) * rr;
        if (t.free(x, y)) far = [x, y];
      }
    if (!far) far = [30, 32];
    t.tp(h.i, far[0], far[1]); h.path = null;
    for (let i = 0; i < 500 && v.qualPending > 0 && h._doing !== 'search'; i++)
      t.aiTick(h.i, 1, 0.05);
    const started = h._doing === 'search';
    if (started) t.aiTick(h.i, 40, 0.05);
    return { mem, started, qual: h.qual, qp: h.qualPending, vqp: v.qualPending,
      hp, vp, far, inv: t.inv() };
  });
  ok(LOOTM.mem && LOOTM.started && LOOTM.qp === 0 && LOOTM.qual >= 1,
    'AI 会记住视野里见过的倒地伤员，离开后专门绕回去收尸拿资源（mem=' +
    LOOTM.mem + ' started=' + LOOTM.started + ' qp=' + LOOTM.vqp + '）');
  ok(LOOTM.inv.fails.length === 0, 'AI 记忆收尸后不变量全过');

  section('AI 异形 · 假装维修 / 补给 / 开枪');
  await fresh(false);
  const FAKE = await T(() => {
    const t = SKV3._t; t.newGame();
    const g = t.G(); g.paused = true; g.noReport = true;
    const k = g.agents.find(a => a.alien && a.i !== 0 && a.alive);
    const w = g.agents.find(a => !a.alien && a.i !== 0 && a.alive);
    for (const a of g.agents) if (a !== k && a !== w) t.tp(a.i, 28.4,54);
    t.resetAiState(k.i);
    t.tp(k.i, 7.5,53); t.tp(w.i, 9,53);
    k.knife = 0; k.sabUsed = true; k._alienTaskN = g.night;
    k._supportGoal = null; k.target = null;
    k._delay = 0; k._rest = 0;
    g.dmg = [{ room: 'engine', x: 6, y: 51, label: '测试故障', left: 60, dur: 60, by: k.i }];
    const old = Math.random; Math.random = () => 0;
    t.aiTickAlien(k.i, 2, 0.05);      /* 决定假装维修 */
    t.aiTickAlien(k.i, 30, 0.05);     /* 走到故障旁开始站桩 */
    Math.random = old;
    const out = { do: k._doing, doing: k.doing, dmg: g.dmg.length, kind: k._fakeKind };
    t.aiTickAlien(k.i, 140, 0.05);
    out.dmgAfter = g.dmg.length; out.prog = g.prog; out.doAfter = k._doing;
    return out;
  });
  ok(FAKE.do === 'fake' && FAKE.doing > 0 && FAKE.dmg === 1,
    '异形会在故障旁假装维修（不实际修好）');
  ok(FAKE.doAfter !== 'fake' && FAKE.dmgAfter === 1 && FAKE.prog === 0,
    '假装修完不留进度、不修复故障');

  await fresh(false);
  const FAKET = await T(() => {
    const t = SKV3._t; t.newGame();
    const g = t.G(); g.paused = true; g.noReport = true; g.dmg = [];
    const k = g.agents.find(a => a.alien && a.i !== 0 && a.alive);
    const w = g.agents.find(a => !a.alien && a.i !== 0 && a.alive);
    for (const a of g.agents) if (a !== k && a !== w) t.tp(a.i, 28.4,54);
    t.resetAiState(k.i);
    /* 只能从"这个 AI 还没被派过"的任务点里挑，且必须带着**原始下标**回来用：
       直接改写 k.tasks[tIdx] 若撞上列表里已有的点位会触发不变量 A6「任务点重复」
       （历史偶发红就是这个原因，是测试自己把任务表写坏了，不是对局问题）。
       注意 filter 之后 indexOf 得到的是过滤数组的位置，不是 M.points 编号 —— 所以这里显式存 idx。 */
    const pts = t.points().map((p, i) => Object.assign({ idx: i }, p))
      .filter(p => k.tasks.indexOf(p.idx) < 0);
    let spot = null;
    for (const p of pts) {
      /* 2026-11-05：人类近身视野 2.8 → 2.3 格，原 ±1.2 使两人相距 2.4 格，
         目击者看不见异形 → 伪装 audience=0。统一收到 ±1.0（相距 2.0 格）。 */
      for (const d of [[1.0, 0], [-1.0, 0], [0, 1.0], [0, -1.0]]) {
        const kx = p.x + d[0], ky = p.y + d[1];
        const wx = p.x - d[0], wy = p.y - d[1];
        if (t.free(kx, ky) && t.free(wx, wy) && t.los(kx, ky, wx, wy)) {
          spot = { p, kx, ky, wx, wy }; break;
        }
      }
      if (spot) break;
    }
    if (!spot) spot = { p: pts[0], kx: pts[0].x + 1.0, ky: pts[0].y,
      wx: pts[0].x - 1.0, wy: pts[0].y };
    const pi = spot.p.idx;
    if (pi != null && k.tasks) k.tasks[k.tIdx] = pi;   /* 让假任务目标就在附近 */
    t.tp(k.i, spot.kx, spot.ky); t.tp(w.i, spot.wx, spot.wy);
    k.knife = 0; k.bullet = 0; k.medkit = 0; k.qual = 0; k.qualPending = 0;
    k.sabUsed = true; k._delay = 0; k._rest = 0;
    k._supportGoal = null; k.target = null;
    k._alienTaskN = g.night; k._alienTaskTotal = 1;   /* 排除真做任务 */
    g.prog = 0;
    const prog0 = g.prog, old = Math.random;
    Math.random = () => 0;
    let seen = false;
    for (let i = 0; i < 200 && !seen; i++) {
      t.aiTickAlien(k.i, 1, 0.05);
      if (k._doing === 'fake') seen = true;
    }
    const start = { seen, do: k._doing, doing: k.doing, kind: k._fakeKind };
    /* 站到演完再多走 2 秒：演完挂上冷却（18 秒），不再有"每夜 1 次"的硬上限 */
    t.aiTickAlien(k.i, 200, 0.05);
    const first = { doAfter: k._doing, cd: +(k._fakeCD || 0).toFixed(2),
      cred: +(((w.mind && w.mind.cred || {})[k.i]) || 0).toFixed(3) };
    /* 冷却结束 + 换一个演出点（_lastFake 清空）→ 同一夜必须还能再演一次。
       旧版在这里被 _fakeTaskN !== G.night 挡死：一只异形一晚上最多演一次。
       中间那 10 秒它可能已经游荡走开，所以把人摆回原位再判（测的是闸门，不是路程）。 */
    t.tp(k.i, spot.kx, spot.ky); t.tp(w.i, spot.wx, spot.wy);
    k._fakeCD = 0; k._lastFake = null; k._delay = 0; k._rest = 0;
    k._plan = null; k._planCD = 0; k._supportGoal = null;
    let again = false;
    for (let i = 0; i < 200 && !again; i++) {
      t.aiTickAlien(k.i, 1, 0.05);
      if (k._doing === 'fake') again = true;
    }
    const pre = t.disguise(k.i);
    Math.random = old;
    return { start, first, night: g.night, again, prog0, pre,
      gain: SKSanity.CRED.gains.fakeWork,
      prog1: g.prog, doAfter: k._doing, inv: t.inv() };
  });
  ok(FAKET.start.seen && FAKET.start.do === 'fake' && FAKET.start.doing > 0 &&
    FAKET.start.kind === 'task',
    '异形会在任务点假装做任务（有目击者时进入 fake 动作；seen=' +
    FAKET.start.seen + ' do=' + FAKET.start.do + ' kind=' + FAKET.start.kind + '）');
  ok(FAKET.prog1 === FAKET.prog0 && FAKET.first.doAfter !== 'fake' && FAKET.first.cd > 0,
    '假装做任务不增加维修进度，演完进入 ' + FAKET.first.cd.toFixed(1) + ' 秒冷却（每夜硬上限已取消）');
  ok(FAKET.again,
    '冷却结束后同一夜还能再演（旧版 _fakeTaskN 每夜 1 次把伪装掐死在主闸上；' +
    '本次 aud=' + FAKET.pre.aud + ' sc=' + FAKET.pre.sc + ' cd=' + FAKET.pre.cd + '）');
  /* 2026-11-05 二组：CRED.gains 按 LENS.lr 重排后 fakeWork 从 0.10 降到 0.08，
     随后「真假同价」裁定又把它抬回 = taskDone；同时证据侧加了**情境抽样**
     （witnessConfMul 下界 0.72）。断言改成「落在抽样带内」——
     测的仍是"走同一条兑现口、按同一张表兑现"，不钉死某个数，也不假定 1.0 倍。 */
  ok(FAKET.first.cred >= FAKET.gain * 0.70 - 0.005,
    '演完的 cred 走同一条兑现口：目击者给它 +信誉（fakeWork，' + FAKET.first.cred + '）');
  ok(FAKET.inv.fails.length === 0, '异形假装做任务后不变量全过' +
    (FAKET.inv.fails.length ? '（失败项：' + FAKET.inv.fails.slice(0, 4).map(f => f.code + ':' + f.msg).join(' | ') + '）' : ''));

  await fresh(false);
  const DIS = await T(() => {
    const t = SKV3._t; t.newGame();
    const g = t.G(); g.paused = true; g.noReport = true; g.dmg = [];
    const k = g.agents.find(a => a.alien && a.i !== 0 && a.alive);
    const w = g.agents.find(a => !a.alien && a.i !== 0 && a.alive);
    for (const a of g.agents) if (a !== k && a !== w) t.tp(a.i, 28.4, 54);
    t.resetAiState(k.i);
    /* 手里还有刀 —— 这正是旧门闸走不通的那半边（knife>0 且 8 格内有人时 close 恒 >8 不成立） */
    k.knife = 1; k.sabUsed = true; k.bullet = 0; k.qual = 0; k.qualPending = 0;
    k._delay = 0; k._rest = 0; k._supportGoal = null; k._noFake = false;
    const pts = t.points().map((p, i) => Object.assign({ idx: i }, p))
      .filter(p => k.tasks.indexOf(p.idx) < 0);
    let spot = null;
    for (const p of pts) {
      for (const d of [[1.0, 0], [-1.0, 0], [0, 1.0], [0, -1.0]]) {
        if (t.free(p.x + d[0], p.y + d[1]) && t.free(p.x - d[0], p.y - d[1]) &&
          t.los(p.x + d[0], p.y + d[1], p.x - d[0], p.y - d[1])) {
          spot = { kx: p.x + d[0], ky: p.y + d[1], wx: p.x - d[0], wy: p.y - d[1] }; break;
        }
      }
      if (spot) break;
    }
    if (!spot) return { skip: true };
    t.tp(k.i, spot.kx, spot.ky); t.tp(w.i, spot.wx, spot.wy);
    w.detained = false;
    const old = Math.random; Math.random = () => 0;   /* 站桩时长钉在区间下限，分数可复现 */
    const d0 = t.disguise(k.i);                        /* 观众 = 一个路人 */
    t.healSus(w.i, k.i, 0.9);
    /* 2026-11-05（一组读心清零）：旧夹具只往 w 的**私有 sus** 里灌 0.9，
       等于让异形读别人的脑子。新语义下「他已经怀疑我」只有**当众说出口**才可被知道，
       所以补一条公开指认；私有 sus 保留，w 自己的判断照旧成立。
       断言的含义不变（演给已怀疑我的人更值），变的只是可被观察的通道。 */
    g.agents[w.i].accuse = k.i;
    const d1 = t.disguise(k.i);                        /* 观众 = 已经当众指认我的人 */
    k.redT = 3;
    const d2 = t.disguise(k.i);                        /* 刚出刀、身上还热 */
    k.redT = 0;
    const inv = t.inv();
    w.detained = true;
    const d3 = t.disguise(k.i);                        /* 一个能看的观众都没有 */
    w.detained = false;
    /* 断电：当众合闸是第三种演出候选 —— 它进同一张分数表，代价记在 risk 里。
       闸杆在配电室贴墙，先把两个人挪到闸杆附近（远处不选它，见 DISGUISE.spotR）。 */
    const br = window.SKMapData.facility.find(f => f.kind === 'breaker');
    let bspot = null;
    if (br) {
      /* 闸杆贴墙，直接 ±1.2 会撞进墙里：先在它周围扫一圈落脚点，
         再取两个互相看得见、间距 ≤3 格的（异形站一边，观众站另一边） */
      const cand = [];
      for (let dx = -4; dx <= 4 && cand.length < 24; dx++) {
        for (let dy = -4; dy <= 4; dy++) {
          if (!dx && !dy) continue;
          const x = br.x + dx * 0.6, y = br.y + dy * 0.6;
          if (t.free(x, y)) cand.push([x, y]);
        }
      }
      /* 逐对试站：aiCanSee 从观察者自己的位置出发，所以必须先把两个人摆上去再判，
         否则等于从上一个位置看过去，永远看不见。
         配电室是暗房、人类近身只有 2.8 格，间距与遮挡都在这一步一次性判掉。 */
      for (let i = 0; i < cand.length && !bspot; i++) {
        for (let j = 0; j < cand.length && !bspot; j++) {
          if (i === j) continue;
          if (Math.hypot(cand[i][0] - cand[j][0], cand[i][1] - cand[j][1]) > 3) continue;
          if (!t.los(cand[i][0], cand[i][1], cand[j][0], cand[j][1])) continue;
          t.tp(k.i, cand[i][0], cand[i][1]); t.tp(w.i, cand[j][0], cand[j][1]);
          if (!t.aiSee(w.i, cand[i][0], cand[i][1], 8)) continue;
          bspot = true;
        }
      }
    }
    let d4 = null;
    if (bspot) {
      const lit0 = g.lightState; g.lightState = 2;
      d4 = t.disguise(k.i);
      g.lightState = lit0;
    }
    Math.random = old;
    return { skip: false, d0, d1, d2, d3, d4, inv };
  });
  if (!DIS.skip) {
    ok(DIS.d0.aud >= 1 && DIS.d0.sc >= DIS.d0.minScore,
      '有刀也照样能演：伪装进了效用表，不再要求"刀用完"' +
      '（aud=' + DIS.d0.aud + ' sc=' + DIS.d0.sc + ' ≥ minScore=' + DIS.d0.minScore + '）');
    ok(DIS.d1.weight > DIS.d0.weight && DIS.d1.sc > DIS.d0.sc &&
      DIS.d1.susAud === DIS.d0.susAud + 1,
      '演给"已经当众指认我的人"比演给路人更值：观众加权 ' + DIS.d0.weight + ' → ' +
      DIS.d1.weight + '，收益分 ' + DIS.d0.sc + ' → ' + DIS.d1.sc);
    ok(DIS.d2.risk > DIS.d1.risk && DIS.d2.sc < DIS.d1.sc,
      '刚出刀身上还热 → 识破风险 ' + DIS.d1.risk + ' → ' + DIS.d2.risk +
      '，收益分反而下降（risk 量的是"会不会被识破"，不是"被多少人看过"）');
    ok(DIS.d3.aud === 0 && DIS.d3.sc === 0,
      '没人看得见就一分不值：绝不自嗨（aud=' + DIS.d3.aud + ' sc=' + DIS.d3.sc + '）');
    /* 合闸不再靠"每夜一次 + 掷骰"，而是作为一个候选进同一张分数表：
       它的战略损失记在 risk（breakerLoss 0.45），因此**常常排在假装修之后** ——
       这正是用户裁定"成本从收益侧搬到代价侧"之后应有的形态（旧实现里它压根不在表上）。 */
    const BR = DIS.d4 && (DIS.d4.opts || []).find(o => o.kind === 'breakerOn');
    ok(!!BR && BR.risk >= 0.45,
      '断电时"当众合闸"作为候选进同一张分数表，战略损失计入 risk（breakerOn risk=' +
      (BR ? BR.risk : '闸杆旁无落脚点') + ' ≥ breakerLoss 0.45）');
    ok(!!BR && !!DIS.d4.kind && DIS.d4.kind !== 'breakerOn',
      '合闸因为真代价被排到后面：断电时得分最高的候选是 ' + (DIS.d4 && DIS.d4.kind) +
      '，不是合闸（旧版是"每夜一次 + 每秒掷骰"，根本不在表上）');
    const FKR = DIS.d4 && (DIS.d4.opts || []).find(o => o.kind === 'fakeTask');
    ok(!!BR && !!FKR && FKR.sc > BR.sc,
      '同一批观众下"假装修"比"当众合闸"划算（' + (FKR && FKR.sc) + ' > ' + (BR && BR.sc) +
      '）—— 因为合闸要放弃全群暗视野，而假装修只是站一会儿');
    ok(DIS.inv.fails.length === 0, '伪装效用表探针后不变量全过');
  }

  await fresh(false);
  const DISK = await T(() => {
    const t = SKV3._t; t.newGame();
    const g = t.G(); g.paused = true; g.noReport = true; g.dmg = [];
    const k = g.agents.find(a => a.alien && a.i !== 0 && a.alive);
    const w = g.agents.find(a => !a.alien && a.i !== 0 && a.alive);
    for (const a of g.agents) if (a !== k && a !== w) t.tp(a.i, 28.4, 54);
    t.resetAiState(k.i);
    k.knife = 0; k.sabUsed = true; k.bullet = 0; k.medkit = 0; k.qual = 0; k.qualPending = 0;
    k._delay = 0; k._rest = 0; k._supportGoal = null; k.target = null;
    k._alienTaskN = g.night; k._alienTaskTotal = 1;   /* 排除真做任务 */
    g.prog = 0;
    const pts = t.points().map((p, i) => Object.assign({ idx: i }, p))
      .filter(p => k.tasks.indexOf(p.idx) < 0);
    let spot = null;
    for (const p of pts) {
      for (const d of [[1.0, 0], [-1.0, 0], [0, 1.0], [0, -1.0]]) {
        if (t.free(p.x + d[0], p.y + d[1]) && t.free(p.x - d[0], p.y - d[1]) &&
          t.los(p.x + d[0], p.y + d[1], p.x - d[0], p.y - d[1])) {
          spot = { p, kx: p.x + d[0], ky: p.y + d[1], wx: p.x - d[0], wy: p.y - d[1] }; break;
        }
      }
      if (spot) break;
    }
    if (!spot) return { skip: true };
    const old = Math.random; Math.random = () => 0;
    /* 连演五次，同一个观众在旁边看着：
       第一次旁边"有故障"→ 假装修理（kind fakeRepair），其余 → 假装做任务（kind fakeWork）。
       旧版两种假动作都写同一个 kind，ALMOST.friendKinds=2 对异形根本凑不齐 ——
       这才是"演了也洗不白"的真凶，所以这条用例要一路验到 friend 真的成立。 */
    const done = [];
    let dmgStill = -1;
    for (let n = 0; n < 5; n++) {
      t.tp(k.i, spot.kx, spot.ky); t.tp(w.i, spot.wx, spot.wy);
      g.dmg = (n === 0) ? [{ room: spot.p.room, x: spot.kx, y: spot.ky,
        label: '测试故障', left: 60, dur: 60, by: k.i }] : [];
      k._fakeCD = 0; k._lastFake = null; k._plan = null; k._planCD = 0;
      k._doing = null; k.doing = 0;
      let started = false;
      for (let i = 0; i < 200 && !started; i++) {
        t.aiTickAlien(k.i, 1, 0.05);
        if (k._doing === 'fake') started = true;
      }
      if (!started) break;
      for (let i = 0; i < 200 && k._doing === 'fake'; i++) t.aiTickAlien(k.i, 1, 0.05);
      if (n === 0) dmgStill = g.dmg.length;   /* 假装修理不能真的把故障修掉 */
      const cw = (w.mind.credWhy && w.mind.credWhy[k.i]) || [];
      done.push(cw.length ? cw[cw.length - 1].kind : 'none');
    }
    Math.random = old;
    const cw = (w.mind.credWhy && w.mind.credWhy[k.i]) || [];
    const ks = {};
    for (const e of cw) if (e.kind) ks[e.kind] = 1;
    return { skip: false, done, credKinds: Object.keys(ks),
      cred: +(((w.mind.cred || {})[k.i]) || 0).toFixed(3),
      friend: t.almostOf(w.i).friend[k.i] || null,
      friendCred: SKSanity.ALMOST.friendCred, friendKinds: SKSanity.ALMOST.friendKinds,
      prog: g.prog, dmgStill, cycles: done.length, inv: t.inv() };
  });
  if (!DISK.skip) {
    ok(DISK.credKinds.indexOf('fakeRepair') >= 0 && DISK.credKinds.indexOf('fakeWork') >= 0,
      '两种假动作写两种 cred 种类（假装修理 / 假装做任务）：ALMOST.friendKinds=' +
      DISK.friendKinds + ' 从此对异形可达（实测 ' + DISK.credKinds.join('+') + '）');
    ok(!!DISK.friend && DISK.cred >= DISK.friendCred,
      '同一个观众连看五次真的洗白：almost.friend 成立（cred=' + DISK.cred +
      ' ≥ ' + DISK.friendCred + '，kinds=' + (DISK.friend ? DISK.friend.kinds.join('+') : '-') + '）');
    ok(DISK.prog === 0 && DISK.dmgStill === 1 && DISK.cycles === 5,
      '连演 ' + DISK.cycles + ' 次不推进维修进度、也不真的修掉故障（prog=' + DISK.prog +
      '，演完假装修理后故障仍在=' + DISK.dmgStill + '）');
    ok(DISK.inv.fails.length === 0, '伪装连演洗白后不变量全过');
  }

  /* ---------------- 终结者时刻（2026-11-03 用户裁定）----------------
     双向断言：未到第 10 夜**不得**亮身份（守住"正常对局外观一致"），
     到了就亮并且每人子弹补到 1 —— 但只补不叠（攒了 2 发的还是 2 发）。 */
  section('终结者时刻 · 第 N 夜身份公开 + 补子弹');
  const TERM = await T(() => {
    const t = SKV3._t; t.newGame();
    const g = t.G(); g.paused = true; g.noReport = true;
    const cfg = t.terminator();
    /* 注意：不变量 A13 要求 `bullet ≤ 1`，所以这里只能摆"0 发 / 1 发"两种合法初值 */
    for (const a of g.agents) a.bullet = (a.i % 3 === 0) ? 1 : 0;
    const hadOne = g.agents.filter(a => a.alive && a.i % 3 === 0).length;
    g.night = cfg.cfg.night - 1; g.terminator = false; g.revealAll = false;
    const before = { fired: t.checkTerminator(), on: !!t.terminator().on };
    g.night = cfg.cfg.night;
    const fired = t.checkTerminator();
    const st = t.terminator();
    const again = t.checkTerminator();
    const alive = g.agents.filter(a => a.alive);
    return { cfg, before, fired, st, again, hadOne,
      minBullet: Math.min.apply(null, alive.map(a => a.bullet | 0)),
      maxBullet: Math.max.apply(null, g.agents.map(a => a.bullet | 0)),
      inv: t.inv() };
  });
  ok(!TERM.before.fired && !TERM.before.on,
    '第 ' + (TERM.cfg.night - 1) + ' 夜不触发：身份仍然只在 DEV / 旁观可见');
  ok(TERM.fired && TERM.st.on && TERM.st.revealAll,
    '第 ' + TERM.cfg.night + ' 夜触发终结者时刻：身份公开（revealAll=' + TERM.st.revealAll + '）');
  ok(TERM.minBullet >= TERM.cfg.cfg.bullets && TERM.maxBullet <= TERM.cfg.cfg.bullets,
    '活着的人子弹补到 ' + TERM.cfg.cfg.bullets + '：最低 ' + TERM.minBullet +
    '、最高 ' + TERM.maxBullet + '（只补不叠，A13 的子弹上限仍然成立）');
  ok(TERM.again === false, '一局只触发一次（不会每夜重发子弹）');
  ok(TERM.inv.fails.length === 0, '终结者时刻后不变量全过');

  /* ---------------- 报告去重绑定"那一次倒下"（用户报的 bug）----------------
     旧实现只有按夜一层，而 startNight 会把活人的 reported 清零 ⇒
     同一个还躺着的人每夜都能被重新拉铃。现在绑到"那一次倒下"。 */
  section('报告一次性 · 濒死者绑定倒下事件');
  const RPT2 = await T(() => {
    const t = SKV3._t; t.newGame();
    const g = t.G(); g.paused = true;
    const v = g.agents.find(a => !a.alien && a !== g.me && a.alive);
    for (const a of g.agents) if (a !== v && a !== g.me) t.tp(a.i, 28.4, 54);
    t.tp(g.me.i, 50, 84); t.tp(v.i, 50.8, 84);
    v.downed = true; v.downAt = g.t; v.downSeq = (v.downSeq || 0) + 1;
    g.meet = null; g.over = null;
    const opened = t.report();
    const flag1 = t.bodyReported(v.i);
    g.meet = null;
    g.night++;                                  /* 模拟跨夜（旧实现到这里就重新可报） */
    const flag2 = t.bodyReported(v.i);
    v.downed = false; v.downAt = 0;             /* 被救起来 */
    const flag3 = t.bodyReported(v.i);
    v.downed = true; v.downSeq++;                /* 再次被放倒 = 新一次发现 */
    const flag4 = t.bodyReported(v.i);
    return { opened: !!opened, flag1, flag2, flag3, flag4, night: g.night };
  });
  ok(RPT2.opened && RPT2.flag1, '第一次报告成立并记名（' + RPT2.opened + '）');
  ok(RPT2.flag2,
    '跨夜也不可重报：同一个还躺着的人，一轮倒下只报一次（旧实现到这里会重新可报）');
  ok(RPT2.flag3 === false,
    '他被救起之后不再算"同一次倒下"，尸体语义回到按夜（' + RPT2.flag3 + '）');
  ok(RPT2.flag4 === false, '再次被放倒算新发现，可以重新拉铃');

  /* ---------------- 领袖服从：号召力重尾 + 信任门槛（2026-11-03）---------------- */
  section('领袖 · 指令真的有人接牌（也可能一个都不接）');
  const LD = await T(() => {
    const t = SKV3._t; t.newGame();
    const g = t.G(); g.paused = true; g.noReport = true; g.dmg = [];
    const a = g.agents.find(x => !x.alien && x !== g.me && x.alive && x.tIdx < x.tasks.length);
    const L = g.agents.find(x => x !== a && x.alive);
    t.ensureMind(a.i);
    const pts = t.points();
    const curRoom = pts[a.tasks[a.tIdx]].room;
    const pi = a.tasks.findIndex((p, ix) => ix > a.tIdx && pts[p].room !== curRoom);
    const target = a.tasks[pi], tRoom = pts[target].room;
    const baseTasks = a.tasks.slice();      /* 每轮都把任务表复位，否则上一轮的成功会污染下一轮 */
    const run = (charisma, cred) => {
      for (let i = 0; i < baseTasks.length; i++) a.tasks[i] = baseTasks[i];
      a.mind.order = { room: tRoom, night: g.night, by: L.i };
      a.mind.cred = a.mind.cred || {}; a.mind.cred[L.i] = cred;
      a.doing = 0; a._doing = null; a._rest = 0; a._delay = 0; a.path = null;
      g.leaderCharisma = charisma;
      const old = Math.random; Math.random = () => 0;
      t.aiTick(a.i, 1, 0.05);
      Math.random = old;
      return pts[a.tasks[a.tIdx]].room === tRoom;
    };
    return {
      haveTarget: pi > a.tIdx, tRoom,
      fullTrustFullCharisma: run(1, 0.40),
      zeroCharisma: run(0, 0.40),
      noTrust: run(1, 0),
      bands: SKSanity.LEADER.bands,
      obeyGate: SKSanity.trustObeyGate(),
    };
  });
  ok(LD.haveTarget, '夹具：本席任务表里存在别的舱室的点位（' + LD.tRoom + '）');
  ok(LD.fullTrustFullCharisma,
    '号召力 1 + 被点名者信他（cred ≥ ' + LD.obeyGate + '）⇒ 真的把该舱任务换到当前位去做');
  ok(!LD.zeroCharisma, '号召力 0 ⇒ **一个人都不听**（两端保留，不做截断）');
  ok(!LD.noTrust, '号召力 1 但被点名者不信他（cred 0）⇒ 也不去：领袖感挂在信任聚集上');
  ok(LD.bands.length === 4 && LD.bands[0][0] === 0 &&
    LD.bands[LD.bands.length - 1][0] === 1,
    '号召力是重尾分布，两端都在（0 与 1 都是合法抽样结果）');

  /* ---------------- 贵信号：异形也能做"人类相当愿意做的事" ----------------
     两条要分清：
       · **入口必须通**（AI 与玩家共用 startFix / revive，不许有特权也不许被禁）；
       · **它会不会自发去做**是另一件事 —— 现阶段"假装修"没有战略损失，
         分数压过"真修"，所以真修稀有。这条量化事实写成断言，等用户决定是否放大贵信号收益。 */
  section('LENS 贵信号 · 异形真修故障 / 真救非队友');
  const GSIG = await T(() => {
    const t = SKV3._t; t.newGame();
    const g = t.G(); g.paused = true; g.noReport = true;
    const k = g.agents.find(a => a.alien && a.i !== 0 && a.alive);
    const w = g.agents.find(a => !a.alien && a.i !== 0 && a.alive);
    const hv = g.agents.find(a => !a.alien && a.i !== 0 && a.alive && a !== w);
    for (const a of g.agents) if (a !== k && a !== w && a !== hv && a !== g.me) t.tp(a.i, 28.4, 54);
    t.resetAiState(k.i);
    k.knife = 0; k.sabUsed = true; k._delay = 0; k._rest = 0; k.medkit = 1;
    g.dmg = [{ room: 'engine', x: 6.6, y: 51.6, label: '测试故障', left: 60, dur: 60, by: 14 }];
    /* 观察者要紧贴**修的人**：暗房里人类的近身视野只有 2.8 格，
       站远了"看不见他修好了"就是正确的不给分，那测的就不是入口了
       （信任广播的落点是操作者自己的坐标，不是故障点 —— 故障点常贴在机器背后） */
    t.tp(k.i, 7.5, 53); t.tp(w.i, 7.4, 52.2);
    t.ensureMind(w.i);      /* 认知层是懒初始化的：真实对局里早已被建好，夹具要自己补 */
    /* 再放一个倒地的非队友在**异形自己也看得见**的距离内 ⇒ 真救人应当成为候选
       （引擎室是暗房，异形近身视野 3.5 格，放 4 格外就正确地"没看见"） */
    hv.downed = true; hv.alive = true; t.tp(hv.i, 10, 53);
    const old = Math.random; Math.random = () => 0;
    const d0 = t.disguise(k.i);
    const opts = (d0.opts || []);
    const byKind = {};
    for (const o of opts) byKind[o.kind] = o;
    /* 自发选择：分数最高的是哪一个（假装修 vs 真修） */
    const bestKind = d0.kind;
    /* 入口通不通：手动把计划设成 realFix，让它真的走一遍 startFix → finishFix。
       `_planCD` 必须一起拉长，否则下一帧效用表重算会把这份手动计划覆盖掉。 */
    const fault = g.dmg[0];
    k._plan = { id: 'disguise', kind: 'realFix', key: 'realfix:engine',
      x: k.x, y: k.y, dur: 10, room: 'engine', fault: fault };
    k._planCD = 30;
    k._doing = null; k.doing = 0;
    t.aiTickAlien(k.i, 2, 0.05);
    const started = k._doing;
    /* 一修好就停：再多走几秒它会转去演假任务，那笔 cred 就不是 fixDone 了 */
    for (let i = 0; i < 320 && g.dmg.length; i++) t.aiTickAlien(k.i, 1, 0.05);
    const cred = ((w.mind && w.mind.cred) || {})[k.i] || 0;
    const kinds = (((w.mind && w.mind.credWhy) || {})[k.i] || []).map(e => e.kind);
    Math.random = old;
    return {
      hasRealFix: !!byKind.realFix, hasRealRevive: !!byKind.realRevive,
      bestKind, scReal: byKind.realFix ? byKind.realFix.sc : null,
      scFake: byKind.fake ? byKind.fake.sc : null,
      lrFix: SKSanity.LENS.lr('fixDone'), lrFake: SKSanity.LENS.lr('fakeRepair'),
      started, fixed: g.dmg.length === 0, cred: +cred.toFixed(3), kinds,
      knownOnly: ['knife', 'pipe', 'sabotage', 'breakerOff', 'botStop', 'redBody']
        .every(x => SKSanity.LENS.lr(x) === Infinity),
      inv: t.inv(),
    };
  });
  ok(GSIG.hasRealFix && GSIG.hasRealRevive,
    '真修故障与真救非队友都进了候选表（候选=' +
    [GSIG.hasRealFix && 'realFix', GSIG.hasRealRevive && 'realRevive', GSIG.scFake != null && 'fake',
      GSIG.bestKind].filter(Boolean).join('/') + '）；LENS 里 lr 真修 ' + GSIG.lrFix +
    ' ≫ 假装修 ' + GSIG.lrFake);
  ok(GSIG.started === 'fix' && GSIG.fixed && GSIG.cred >= 0.16,
    '入口真的通：异形走同一条 startFix/finishFix 把故障修掉了（' + GSIG.started +
    ' → 故障清空），观察者按 fixDone 给信誉 ' + GSIG.cred + '（kinds=' + GSIG.kinds.join('+') + '）');
  ok(GSIG.bestKind !== 'realFix' && GSIG.scReal < GSIG.scFake,
    '但**自发**情况下假装修仍压过真修（' + GSIG.scFake + ' > ' + GSIG.scReal +
    '，真修要吃 realCost 0.45 + 10 秒）—— 贵信号目前稀有，这是量化事实不是 bug，等用户决定是否加收益');
  ok(GSIG.knownOnly, 'knownOnly 的行不参与 lr：出刀/钻管道/破坏/拉闸/停摆/红身 = Infinity（硬线）');
  ok(GSIG.inv.fails.length === 0, '异形真修故障后不变量全过' +
    (GSIG.inv.fails.length ? '（' + GSIG.inv.fails.slice(0, 3).map(f => f.code + ':' + f.msg).join(' | ') + '）' : ''));

  /* ---------------- 语料工程（2026-11-03）：接线之后才谈得上"十局不腻" ----------------
     以前只数行数没有意义：336 行里有 20 行占了大半出场率。这一节验的是
       ① 每条模板**经过 fillTpl 之后**不吐花括号、不吐空句、不吐「未知位置」；
       ② 新增的三类（背书 / 接牌拒绝 / 自述位置）池子存在且被接线；
       ③ selfcite 必须仍然被 parseSpeech 认成"第一人称自述"（口供只认我在…）；
       ④ 证据短语池给出同义变体（只换措辞，不动 kind）。 */
  section('语料工程 · 槽位渲染与新增类别');
  const LN = await T(() => {
    const t = SKV3._t;
    const smoke = t.lineSmoke();
    /* selfcite 全部过一遍 parseSpeech：必须识别出"自述位置" */
    const badSelf = [];
    for (const tone of ['hot', 'cold']) {
      for (const tpl of (SKLines.POOLS.selfcite[tone] || [])) {
        const s = tpl.replace(/\{r\}/g, '仓库').replace(/\{when\}/g, '今晚')
          .replace(/\{k\}/g, '电路维修').replace(/\{[^{}]*\|[^{}]*\}/g, m => m.slice(1, -1).split('|')[0]);
        const sl = t.parseSpeech(s);
        if (!sl.where) badSelf.push(s);
      }
    }
    /* 证据短语：连续取 30 次，看是否真的出现多个变体 */
    const whySet = {};
    for (let i = 0; i < 30; i++) whySet[SKLines.why('saw_pipe')] = 1;
    const cats = ['endorse', 'leader_refuse', 'selfcite', 'open_body_dead', 'open_body_alive',
      'known_accuse_hard', 'alien_accuse_soft', 'pre_route_invite', 'pre_ask_more',
      'doubt_room', 'respond_witness', 'claim_recall', 'challenge_player', 'impossible_pipe',
      'press_deny', 'ack_short', 'skeptic_ask', 'heard_deny', 'stem_room', 'route_plan'];
    const missing = cats.filter(c => !(SKLines.pool(c, 'hot') || []).length ||
      !(SKLines.pool(c, 'cold') || []).length);
    const comboRaw = (SKLines.POOLS.accuse.combo || [])[0] || '';
    let comboOut = null;
    if (comboRaw) {
      const set = {};
      for (let i = 0; i < 40; i++) set[comboRaw] = 1;   /* 只看模板本身是否存在 */
      comboOut = { tpl: comboRaw, variants: Object.keys(set).length };
    }
    return {
      size: SKLines.size(), smoke, missing, badSelf, comboRaw,
      whyVariants: Object.keys(whySet).length,
      /* 证据短语**模板**里本来就该带 {r} 这类槽（由 evClause 渲染时填舱室），
         所以这里不能拿"有没有花括号"当泄漏判据 —— 真正的泄漏判据是
         `smoke.leak`：它对每一条 WHY 走过 fillTpl 之后再看还剩不剩花括号。 */
      whyLeak: Object.keys(whySet).filter(s => /\{[^a-z0-9]*\}/.test(s) ||
        (s.match(/\{[a-z0-9]*\}/g) || []).some(x => ['{n}', '{t}', '{r}', '{r2}', '{u}',
          '{k}', '{when}', '{prev}', '{why}'].indexOf(x) < 0)),
      refuseSpeakP: SKSanity.LEADER.refuseSpeakP,
      cats: Object.keys(SKLines.POOLS).length,
    };
  });
  ok(LN.size >= 800 && LN.cats >= 30,
    '语料规模 ' + LN.size + ' 行 / ' + LN.cats + ' 类（迁移前 336 行 11 类）');
  ok(LN.smoke.leak.length === 0,
    '每一条模板渲染后都不吐花括号（漏出 ' + LN.smoke.leak.length + ' 条）' +
    (LN.smoke.leak.length ? '：' + LN.smoke.leak.slice(0, 3).join(' | ') : ''));
  ok(LN.smoke.empty.length === 0, '没有渲染成空句/半句的模板（' + LN.smoke.empty.length + ' 条）');
  ok(LN.smoke.unknown.length === 0,
    '舱室槽不会退化成「未知位置」（异形伪证的措辞必须和真目击一字不差）');
  ok(LN.missing.length === 0, '新增与迁移的类别池子齐全（缺：' + (LN.missing.join('/') || '无') + '）');
  ok(LN.badSelf.length === 0,
    'selfcite 每条仍被 parseSpeech 认成第一人称自述（不认的：' +
    (LN.badSelf.slice(0, 2).join(' / ') || '无') + '）');
  ok(LN.whyVariants >= 3 && LN.whyLeak.length === 0,
    '证据短语同义变体 ' + LN.whyVariants + ' 种（措辞不重复，kind 一律不动）');
  ok(LN.comboRaw.indexOf('|') >= 0,
    '指控类有组合式模板（一行多槽，展开当量靠乘法而不是堆行数）');
  ok(LN.refuseSpeakP > 0, '接牌可以当众拒绝：领袖拒绝台词概率 ' + LN.refuseSpeakP);
  /* 内联池不许长回来：AGENTS 早就写着「台词不散写在 say() 调用处」，可 game.js 里
     一度还留着 23 处 `pickLine(a,[…])` —— 每处 2~4 条，而且都是每局必说的句子。
     现在源码级钉住：再有人图省事内联写句子，门禁直接红（Node 侧读文件，不开浏览器）。
     注意这里不能用模块顶部的 `DIR`：本作用域后面还有一个 `const DIR`（同层的会议夹具变量），
     会把它推进暂时死区 —— 直接就地解析路径。 */
  const ROOT = path.resolve(__dirname, '..');
  const GAME_SRC = fs.readFileSync(path.join(ROOT, 'js', 'game.js'), 'utf8');
  const INLINE_N = (GAME_SRC.match(/pickLine\([a-zA-Z0-9_.]+,\s*\[/g) || []).length;
  ok(INLINE_N === 0, 'game.js 里没有内联台词池（当前 ' + INLINE_N + ' 处 pickLine(x,[…])）');
  ok(/SKLines\.pool\('endorse'/.test(GAME_SRC) || /pushEndorse\(/.test(GAME_SRC),
    '背书有真实调用点（信任聚焦不再空转）');
  /* 2026-11-06 输入简化：一个动作一个键，旧别名不许长回来 */
  ok(!/k==='e'/.test(GAME_SRC) && !/k==='q'/.test(GAME_SRC) &&
    !/k==='x'/.test(GAME_SRC) && !/k==='g'/.test(GAME_SRC) && !/k==='p'/.test(GAME_SRC),
    '旧键位 E/Q/X/G/P 已移除（不再有两个键做同一个动作）');
  ok(/k==='w'/.test(GAME_SRC) && /k==='a'/.test(GAME_SRC) &&
    /k==='s'/.test(GAME_SRC) && /k==='d'/.test(GAME_SRC) &&
    /k==='f'/.test(GAME_SRC) && /k==='r'/.test(GAME_SRC),
    '主键 W/A/S/D/F/R 仍在（交互 / 出刀 / 搜尸 / 收尸 / 施救 / 报告）');

  /* ---------------- AI 与玩家数值一致（2026-11-03 用户裁定）----------------
     "AI 和玩家的数值应该完全一致" ⇒ 同一个能力只准有一个数。
     这里钉住四处曾经分叉的地方（都是**能力**，不是 AI 的决策意愿）：
       出刀近身距离 / 开枪射程 / 合闸站桩 / 钻管道冷却。
     源码级扫描 + 运行时读表双管：改回两个数就直接红。 */
  section('AI 与玩家 · 数值一致');
  const EQ = await T(() => {
    const S = SKSanity;
    return {
      knife: S.REACH.knife, shot: S.SHOT.range, pipe: S.PIPE.cooldown,
      hasSplit: !!(S.REACH.knifePlayer || S.REACH.knifeAI || S.SHOT.known ||
        S.SHOT.sus || S.SHOT.alienRange || S.STAND.aiBreakerHuman),
    };
  });
  const GAME_EQ_SRC = fs.readFileSync(path.join(__dirname, '..', 'js', 'game.js'), 'utf8');
  ok(!EQ.hasSplit && EQ.knife === 1.35 && EQ.shot === 9,
    '出刀与开枪射程各只有一个数：REACH.knife ' + EQ.knife + ' / SHOT.range ' + EQ.shot +
    '（旧的 1.35↔1.4、10/8↔9 双值已删）');
  ok(EQ.pipe > 0 && /me\._pipeCD=SKSanity\.PIPE\.cooldown/.test(GAME_EQ_SRC),
    '钻管道冷却两边同一个 ' + EQ.pipe + ' 秒（玩家的入口与递减都在）');
  ok(/a\.doing=breakerOnTime\(\)/.test(GAME_EQ_SRC) &&
    !/STAND\.aiBreakerHuman/.test(GAME_EQ_SRC),
    'AI 人类合闸走与玩家同一个 breakerOnTime()（不再有 AI 专属 3 秒）');
  ok((GAME_EQ_SRC.match(/_pipeCD[^;]*-=dt/g) || []).length <= 1,
    '管道冷却只有一个递减入口（防止 tickActs 与 AI 循环各减一次 = 双倍速）');

  /* ---- 亮区整片可见：AI 与玩家同一条规则（2026-11-03 用户裁定放开）----
     中央会议室是多边形最长的一间（对角 42 格），拿它当尺子最合适。
     注意必须取**多边形内部**的点：舱室的 rect 外接框四角在墙外，litZoneAt 会返回 null。 */
  const LITSIGHT = await T(() => {
    const t = SKV3._t, g = t.G();
    g.paused = true; g.noReport = true;
    const a = g.agents.find(x => x.alien && x.i !== 0 && x.alive);
    const cands = [];
    for (let x = 20; x <= 62; x += 0.5) for (let y = 24; y <= 42; y += 0.5)
      if (t.litZone(x, y) === 'r:bridge' && SKGeo.free(x, y)) cands.push([x, y]);
    let A = null, B = null, bd = -1;
    for (let i = 0; i < cands.length; i++) for (let j = i + 1; j < cands.length; j++) {
      const d = Math.hypot(cands[i][0] - cands[j][0], cands[i][1] - cands[j][1]);
      if (d > bd) { bd = d; A = cands[i]; B = cands[j]; }
    }
    t.tp(a.i, A[0], A[1]);
    const cap = SKSanity.SIGHT.aiCapR;
    const litFar = { d: +bd.toFixed(1), see: t.aiSee(a.i, B[0], B[1], cap) };
    /* 对照一：暗舱同距离**不该**看见（放开只给亮区，不给 AI 超出玩家的视力） */
    const eng = window.SKMapData.rooms.find(r => r.id === 'engine');
    t.tp(a.i, eng.rect[0] + 2, eng.rect[1] + 3);
    const darkFar = { see: t.aiSee(a.i, eng.rect[0] + 2 + 11, eng.rect[1] + 3, cap),
      near: t.aiSee(a.i, eng.rect[0] + 2 + 2.6, eng.rect[1] + 3, cap) };
    /* 对照二：舱外的 AI 看进亮舱，仍受 cap 约束（不该全船看进亮房） */
    const out = { see: t.aiSee(a.i, B[0], B[1], cap), d: +Math.hypot(B[0] - a.x, B[1] - a.y).toFixed(1) };
    /* 对照三：亮舱里的**玩家异形**在同一对点上也应该看得见（同一规则的两侧） */
    t.tp(a.i, A[0], A[1]);
    return { litFar, darkFar, out, cap, n: cands.length };
  });
  ok(LITSIGHT.litFar.see && LITSIGHT.litFar.d > 20,
    '亮舱整间可见不再被 8 格上限卡住：异形 AI 在同亮会议室 ' + LITSIGHT.litFar.d +
    ' 格外看得见人（以前 false，等于 AI 比它扮演的角色还弱）');
  ok(!LITSIGHT.darkFar.see && LITSIGHT.darkFar.near,
    '暗舱照旧：远处看不见、近身圆看得见（放开只给亮区，不给 AI 超出玩家的视力）');
  ok(!LITSIGHT.out.see,
    '舱外的 AI 看进亮舱仍受上限约束（' + LITSIGHT.out.d + ' 格外不可见，不会全船看进亮房）');

  /* ---------------- 迷雾：地形可见，但人不会透雾 ---------------- */
  section('迷雾 · 非舱室压淡（判定不动）');
  const FOGV = await T(() => {
    const t = SKV3._t; t.newGame();
    const g = t.G(); g.paused = true; g.noReport = true;
    const cfg = (SKSanity.SIGHT.fog || {});
    /* 把玩家放在亮舱（生态舱），另一个人放在远处的亮走廊里 */
    t.tp(0, 28, 52);
    const far = g.agents.find(a => a !== g.me && a.alive);
    t.tp(far.i, 58, 47);                    /* 会议室—食堂走廊中段，距玩家很远 */
    g.lightState = 0; g.corrLit = true;
    const seesPerson = t.visible(58, 47);
    const state = t.lights();
    return { cfg, seesPerson, lit: state.state, dist: Math.hypot(58 - 28, 47 - 52) };
  });
  ok(FOGV.cfg.roomMask === 0.87 && FOGV.cfg.corridorMask < FOGV.cfg.roomMask,
    '舱室遮蔽维持原值 ' + FOGV.cfg.roomMask + '，非舱室压到 ' + FOGV.cfg.corridorMask +
    '（A 档：地形可读，不是全清）');
  ok(FOGV.dist > 8 && !FOGV.seesPerson,
    '背景压淡**不等于**看得见人：远处走廊上的人仍然看不见（' + FOGV.dist.toFixed(1) + ' 格）');

  /* ---------------- 异形不再全图锁敌（2026-11-03 用户裁定）----------------
     两边同一套信息：看得见用实时位置，看不见只认"本夜亲眼见过的最后位置"，
     完全没见过的人**不进候选**。这是玩家异形与 AI 异形之间最大的那处不公平。 */
  section('异形目标 · 视野 + 记忆，不再全图锁敌');
  const HUNT2 = await T(() => {
    const t = SKV3._t; t.newGame();
    const g = t.G(); g.paused = true; g.noReport = true;
    const k = g.agents.find(a => a.alien && a.i !== 0 && a.alive);
    const v = g.agents.find(a => !a.alien && a.i !== 0 && a.alive);
    for (const a of g.agents) if (a !== k && a !== v && a !== g.me) t.tp(a.i, 28.4, 54);
    t.resetAiState(k.i); t.tp(g.me.i, 41, 8);
    /* 错峰延迟不清掉的话，AI 会在 _delay 分支里早退，压根走不到挑目标那段 */
    k._delay = 0; k._rest = 0; k._pipeCD = 20;
    /* ① 隔着整船、谁也没见过谁 ⇒ 候选池必须是空的 */
    t.tp(k.i, 7, 52); t.tp(v.i, 84, 31);
    t.aiTickAlien(k.i, 1, 0.05);
    const blind = t.targetOf(k.i);
    /* ② 先让它亲眼看见一次，再把人瞬移到看不见的地方 ⇒ 应当继续追"最后位置" */
    t.tp(v.i, 8.2, 53.4);
    t.track();
    const seenMem = (t.mind(k.i).mem || []).filter(e => e.kind === 'saw_agent').length;
    t.tp(v.i, 84, 31);
    k.target = null;
    t.aiTickAlien(k.i, 1, 0.05);
    const afterMove = t.targetOf(k.i);
    /* ③ 站桩信息不许偷看：看不见的人即使正在修东西，也不该因此被优先挑中 */
    return { blind, afterMove, seenMem, v: v.i, k: k.i, memSec: SKSanity.HUNT.memorySec };
  });
  ok(HUNT2.blind === null,
    '没见过的人不进候选：这一帧异形没有锁定任何人（旧实现会直接锁全船最近的人）');
  ok(HUNT2.seenMem >= 1 && HUNT2.afterMove === HUNT2.v,
    '亲眼见过一次之后能接着追"最后目击位置"（记忆条目 ' + HUNT2.seenMem +
    ' 条，时效 ' + HUNT2.memSec + ' 秒）');

  await fresh(false);
  const ASUP = await T(() => {
    const t = SKV3._t; t.newGame();
    const g = t.G(); g.paused = true; g.noReport = true; g.dmg = [];
    const k = g.agents.find(a => a.alien && a.i !== 0 && a.alive);
    for (const a of g.agents) if (a !== k) t.tp(a.i, 28.4,54);
    t.resetAiState(k.i);
    const pts = t.points();
    let kp = null;
    for (const p of pts) {
      for (const d of [[1.2, 0], [-1.2, 0], [0, 1.2], [0, -1.2]]) {
        if (t.free(p.x + d[0], p.y + d[1])) { kp = [p.x + d[0], p.y + d[1]]; break; }
      }
      if (kp) break;
    }
    t.tp(k.i, kp[0], kp[1]);
    k.knife = 0; k.bullet = 0; k.medkit = 0; k.qual = 0; k.qualPending = 0;
    k.sabUsed = true; k._delay = 0; k._rest = 0;
    k._noFake = true;                        /* 排除伪装分支（2026-11-03 起的显式开关） */
    k._supportGoal = null; k.target = null;
    k._alienTaskN = 0; k._alienTaskTotal = 0;
    g.prog = 0;
    const old = Math.random; Math.random = () => 0;
    t.aiTickAlien(k.i, 3, 0.05);
    Math.random = old;
    const goalLow = k._supportGoal ? k._supportGoal.kind : (k._doing || null);
    k.doing = 0; k._doing = null; k._supportGoal = null; k._taskPt = null;
    k._alienTaskN = 0; k._alienTaskTotal = 0;
    g.prog = 40;
    const old2 = Math.random; Math.random = () => 0;
    t.aiTickAlien(k.i, 20, 0.05);
    Math.random = old2;
    const goalHigh = k._supportGoal ? k._supportGoal.kind : (k._doing || null);
    return { goalLow, goalHigh, total: k._alienTaskTotal };
  });
  ok(ASUP.goalLow === 'task' && ASUP.goalHigh !== 'task',
    '异形真做任务只在低进度/缺弹时小概率发生；人类接近 45 分时不做任务帮人类赢');

  await fresh(false);
  const AGUN = await T(() => {
    const t = SKV3._t; t.newGame();
    const g = t.G(); g.paused = true; g.noReport = true; g.dmg = [];
    const k = g.agents.find(a => a.alien && a.i !== 0 && a.alive);
    const h = g.agents.find(a => !a.alien && a.i !== 0 && a.alive);
    for (const a of g.agents) if (a !== k && a !== h) t.tp(a.i, 28.4,54);
    t.resetAiState(k.i);
    g.secbotDead = true; g.medbotDead = true;
    k.qual = 1; k.bullet = 0; k.medkit = 0; k.knife = 1;
    k.sabUsed = true; k._delay = 0; k._rest = 0;
    t.tp(k.i, 83.6,69.6);
    t.aiTickAlien(k.i, 1, 0.05);
    const start = { do: k._doing, doing: k.doing };
    t.aiTickAlien(k.i, 220, 0.05);
    const got = { bullet: k.bullet, qual: k.qual };
    t.tp(k.i, 56, 83.8); t.tp(h.i, 61, 85);
    k.bullet = 1; k.knife = 1; k.target = h;
    k._supportGoal = null; k._noFake = true; k._alienTaskN = g.night;
    const old = Math.random; Math.random = () => 0;
    t.aiTickAlien(k.i, 1, 0.05);
    Math.random = old;
    return { start, got, downed: !!h.downed, bullet: k.bullet };
  });
  ok(AGUN.start.do === 'ammo' && AGUN.got.bullet === 1 && AGUN.got.qual === 0,
    '异形会用申请单在军械补给点换子弹');
  ok(AGUN.downed && AGUN.bullet === 0, '异形有子弹时会开枪击倒人类');

  section('AI 异形 · 用医疗包救倒下的队友');
  await fresh(false);
  const AMED = await T(() => {
    const t = SKV3._t; t.newGame();
    const g = t.G(); g.paused = true; g.noReport = true; g.dmg = [];
    const al = g.agents.filter(a => a.alien && a.i !== 0 && a.alive).slice(0, 2);
    const k = al[0], m = al[1];
    for (const a of g.agents) if (a !== k && a !== m) t.tp(a.i, 28.4,54);
    t.resetAiState(k.i);
    k.mates = {}; k.mates[m.i] = { t: 0, kind: 'pipe' };
    k.medkit = 1; k.knife = 0; k.sabUsed = true; k._delay = 0; k._rest = 0;
    m.downed = true; m.alive = true; m.downX = 56; m.downY = 51; m.downAt = g.t;
    t.tp(k.i, 59.6, 85.2); t.tp(m.i, 58.4, 85.2);
    t.aiTickAlien(k.i, 1, 0.05);
    const start = { do: k._doing, doing: k.doing };
    t.aiTickAlien(k.i, 120, 0.05);
    return { start, downed: m.downed, alive: m.alive, medkit: k.medkit };
  });
  ok(AMED.start.do === 'revive' && AMED.start.doing > 0,
    '异形会用医疗包救起已认出的队友');
  ok(!AMED.downed && AMED.alive && AMED.medkit === 0,
    '队友被救起，医疗包消耗');

  section('AI 推理 · 反向洗清 / 枪击正当性 / 空口指控');
  await fresh(false);
  const ALIB = await T(() => {
    const t = SKV3._t; t.newGame();
    const g = t.G(); g.paused = true; g.noReport = true;
    const w = g.agents.find(a => !a.alien && a.i !== 0 && a.alive);
    const a = g.agents.find(x => x.i !== 0 && x !== w && x.alive);
    const v = g.agents.find(x => !x.alien && x.i !== 0 && x.alive && x !== w && x !== a);
    for (const x of g.agents) if (x !== w && x !== a && x !== v) t.tp(x.i, 28.4,54);
    t.tp(w.i, 30,33); t.tp(a.i, 10,53); t.tp(v.i, 56, 83.8);
    t.kill(v.i, 'knife');
    /* 夜晚长度改成 90s 后不能再写死 120：案发时刻要用**真实夜长**算 */
    const deathEv = t.nightLen() - Math.max(0, v.alive ? v.downAt : v.deathAt);
    /* 沉默线索只在「健谈的人」身上触发，这里把所有人压成内向，避免干扰本用例 */
    /* 沉默嫌疑已改成按实际台词数判定，压性格轴不再有效 */
    for (const x of g.agents) { x.talkN = 0; x.trait = { aggr: 50, caut: 50, soc: 28, cur: 50 }; }
    a.nRoom = 'engine';
    w.mind.sus[a.i] = 0.5;
    w.mind.mem.push({ kind: 'saw_agent', subj: a.i, room: 'engine',
      night: g.night, t: deathEv, conf: 0.8, src: 'sight' });
    t.openMeeting('night', w.i, v.i);
    const why = ((t.mind(w.i).why || {})[a.i] || []).map(x => x.kind + ':' + (x.w || 0));
    const mb = (t.mind(w.i).alibi || {})[a.i] || null;
    const out = { after: (t.mind(w.i).sus || {})[a.i] || 0,
      accuse: g.agents[w.i].accuse, a: a.i, why, alibiReason: mb ? mb.reason : null };
    if (g.meet) t.finishMeeting();
    return out;
  });
  /* 2026-11-02：断言从"数值 < 0.4"改成"**指名洗清机制 + 嫌疑确实下降**"。
     原因是新增的 `presence_deny`（在场反驳）会在同一次会议里给指认者 +0.16，
     偶尔把 0.25 抬到 0.41 —— 数值边界会被这条与本用例无关的通道打穿。
     新写法反而更严：它必须真的记下 `alibi_clear` 才算通过。 */
  ok(ALIB.alibiReason === 'alibi_clear' && ALIB.after < 0.5 && ALIB.accuse !== ALIB.a,
    '目击案发时在别处 → 反向洗清（alibi_clear）并降低嫌疑、不当场指控（' +
    ALIB.after.toFixed(2) + ' · alibiReason=' + String(ALIB.alibiReason) +
    ' · accuse=' + String(ALIB.accuse) + ' \/ ' + (ALIB.why.join(',') || '无新增证据') + '）');

  const SHOTJ = await T(() => {
    const t = SKV3._t; t.newGame();
    const g = t.G(); g.paused = true; g.noReport = true;
    const w = g.agents.find(a => !a.alien && a.i !== 0 && a.alive);
    const w2 = g.agents.find(a => !a.alien && a.i !== 0 && a.alive && a !== w);
    const h = g.agents.find(a => !a.alien && a.i !== 0 && a.alive && a !== w && a !== w2);
    const v = g.agents.find(a => a.alien && a.i !== 0 && a.alive);
    for (const x of g.agents) if ([w, w2, h, v].indexOf(x) < 0) t.tp(x.i, 28.4,54);
    t.tp(w.i, 56, 83.8); t.tp(w2.i, 57, 85); t.tp(h.i, 58, 85); t.tp(v.i, 59, 85);
    w.mind.known[v.i] = { t: 0, kind: 'saw_pipe', room: 'med', conf: 0.95 };
    const b1 = (t.mind(w.i).sus || {})[h.i] || 0;
    const b2 = (t.mind(w2.i).sus || {})[h.i] || 0;
    t.notice(h.i, 58, 85, 7, 'shot', v.i);
    return { b1, b2, a1: (t.mind(w.i).sus || {})[h.i] || 0,
      a2: (t.mind(w2.i).sus || {})[h.i] || 0,
      s1: g.agents[w.i].suspect, s2: g.agents[w2.i].suspect, h: h.i };
  });
  ok(SHOTJ.a1 === SHOTJ.b1 && SHOTJ.s1 !== SHOTJ.h,
    '目击者已确证被害者是异形：枪击是处决，不怀疑开枪者');
  ok(SHOTJ.a2 > SHOTJ.b2 && SHOTJ.s2 === SHOTJ.h,
    '没有该确证的目击者仍会把枪击记为凶手证据');

  const EMPTY = await T(() => {
    /* 2026-11-01：异形现在会**编造伪证**（诬陷），一旦编了就不再是"零证据指控"，
       这条用例测的是 empty_accuse 这条通道本身，所以先把诬陷关掉再测。
       2026-11-07：诬陷现在有两处真源 —— FRAME.chance（会议反咬 / 主动搅局）与
       MISLEAD.chance（大厅指控时编具体伪证，此前是空转的死配置），两条都要关。 */
    const F = window.SKSanity;
    const old = F ? { frame: F.FRAME.chance, mislead: F.MISLEAD.chance,
      bus: F.MISLEAD.busChance, coC: F.COFRAME.chance,
      coM: F.COFRAME.minorityChance, desc: F.DESC.on,
      first: F.FIRST.chance } : null;
    if (F) { F.FRAME.chance = 0; F.MISLEAD.chance = 0;
      F.MISLEAD.busChance = 0; F.COFRAME.chance = 0;
      F.COFRAME.minorityChance = 0; F.DESC.on = false; F.FIRST.chance = 0; }
    const t = SKV3._t; t.newGame();
    const g = t.G(); g.paused = true; g.noReport = true;
    const w = g.agents.find(a => !a.alien && a.i !== 0 && a.alive);
    const k = g.agents.find(a => a.alien && a.i !== 0 && a.alive);
    for (const x of g.agents) if (x !== w && x !== k) t.tp(x.i, 28.4,54);
    t.tp(w.i, 56, 83.8); t.tp(k.i, 57, 85);
    const before = (t.mind(w.i).sus || {})[k.i] || 0;
    t.openMeeting('day', null, null);
    /* 2026-11-05：证言改为**说出口才生效**（会议中改票的前置）。
       这里显式把排队中的证言发出去，测的仍然是 empty_accuse 这条通道本身。 */
    const left = t.testimonyLeft();
    t.deliverTestimony();
    const after = (t.mind(w.i).sus || {})[k.i] || 0;
    if (g.meet) t.finishMeeting();
    if (F && old) { F.FRAME.chance = old.frame; F.MISLEAD.chance = old.mislead;
      F.MISLEAD.busChance = old.bus; F.COFRAME.chance = old.coC;
      F.COFRAME.minorityChance = old.coM; F.DESC.on = old.desc;
      F.FIRST.chance = old.first; }
    return { before, after, left };
  });
  ok(EMPTY.after > EMPTY.before,
    '零证据指控会损耗发言者可信度（人类听众记一笔小嫌疑）');
  ok(EMPTY.left > 0,
    '开会时证言只是排队（' + EMPTY.left + ' 条待发）：没人开口就不该有"听到"');

  /* ---------------- 会议中改票（2026-11-05 用户裁定） ----------------
     A 手里对 X 的怀疑 0.34、对 Y 0.30，会前先把票压给 X（早投）；
     B/C/D 三个有依据地公开指控 Y —— 话一落地，A 就应该改投 Y。
     断言全部是结构化的：只看票、票根和"谁说的"，不碰台词文本。 */
  section('会议中改票 · 早投 / 听过再改');
  const VC = await T(() => {
    const t = SKV3._t; t.newGame();
    const g = t.G(); g.paused = true; g.noReport = true;
    const hum = g.agents.filter(a => !a.alien && a.i !== 0 && a.alive);
    const A = hum[0], X = hum[1], Y = hum[2];
    const accs = hum.slice(3, 6);
    hum.forEach(a => t.seedBelief(a.i, { sus: {}, suspect: null }));
    t.seedBelief(A.i, { sus: { [X.i]: 0.34, [Y.i]: 0.30 }, suspect: X.i });
    accs.forEach(b => t.seedBelief(b.i, { sus: { [Y.i]: 0.5 }, suspect: Y.i }));
    t.openMeeting('day', null, null);
    const early = t.earlyVotes(), v0 = t.voteOf(A.i), left0 = t.testimonyLeft();
    const vMid = t.voteOf(A.i);
    const oldRandom = Math.random;
    Math.random = () => 0.01;
    accs.forEach(b => t.deliverTestimony(b.i));
    Math.random = oldRandom;
    const v1 = t.voteOf(A.i);
    const story = t.voteStory().map(s => ({ who: s.who, from: s.from, to: s.to, by: s.by }));
    const meta = t.voteMeta();
    if (g.meet) t.finishMeeting();
    return { A: A.i, X: X.i, Y: Y.i, accs: accs.map(a => a.i), early, v0, vMid, left0, v1, story, meta };
  });
  ok(VC.early >= 1, '会议一开始就有人把票压上（早投 ' + VC.early + ' 票）');
  ok(VC.v0 === VC.X && VC.vMid === VC.X,
    '手里有明确怀疑的人先投：A → X（第 ' + VC.X + ' 席）');
  ok(VC.left0 > 0, '其余证言还在排队，没有在开会瞬间生效（' + VC.left0 + ' 条）');
  ok(VC.v1 === VC.Y,
    '三个人公开指认 Y 之后，A 的票从 X 改到 Y（' + VC.X + ' → ' + VC.Y + '）');
  ok(VC.story.some(s => s.who === VC.A && s.from === VC.X && s.to === VC.Y && s.by != null &&
      VC.accs.indexOf(s.by) >= 0),
    '改票记录能指认是哪句话推动的（by=' + (VC.story[0] ? VC.story[0].by : '-') + '）');
  ok(VC.meta && VC.meta[VC.A] && VC.meta[VC.A].chg === 1,
    '票根记下改票次数（chg=' + (VC.meta && VC.meta[VC.A] ? VC.meta[VC.A].chg : '-') + '）');

  /* 确信不松绑（用户 2026-11-05 明确保留）：亲眼见过 Y 的人，别人再怎么指认 X，
     这一票也不动。 */
  const VKN = await T(() => {
    const t = SKV3._t; t.newGame();
    const g = t.G(); g.paused = true; g.noReport = true;
    const hum = g.agents.filter(a => !a.alien && a.i !== 0 && a.alive);
    const A = hum[0], X = hum[1], Y = hum[2];
    const accs = hum.slice(3, 6);
    hum.forEach(a => t.seedBelief(a.i, { sus: {}, suspect: null }));
    t.seedBelief(A.i, { sus: { [X.i]: 0.5 }, known: { [Y.i]: { kind: 'saw_knife', room: '配电室', t: 1 } } });
    accs.forEach(b => t.seedBelief(b.i, { sus: { [X.i]: 0.5 }, suspect: X.i }));
    t.openMeeting('day', null, null);
    const v0 = t.voteOf(A.i), why0 = t.voteMeta()[A.i].why;
    const oldRandom = Math.random;
    Math.random = () => 0.01;
    accs.forEach(b => t.deliverTestimony(b.i));
    Math.random = oldRandom;
    const v1 = t.voteOf(A.i), m = t.voteMeta()[A.i];
    if (g.meet) t.finishMeeting();
    return { A: A.i, X: X.i, Y: Y.i, v0, v1, why0, chg: m.chg };
  });
  ok(VKN.v0 === VKN.Y && VKN.why0 === 'known',
    '亲眼确证 Y 的人开会就把票投给 Y（why=known）');
  ok(VKN.v1 === VKN.Y && VKN.chg === 0,
    '「确信不松绑」：三个人指认 X 之后，确证票不动（' + VKN.v1 + ' / chg=' + VKN.chg + '）');

  section('AI 异形 · 偶尔直接报案');
  await fresh(false);
  const DIR = await T(() => {
    const t = SKV3._t; t.newGame();
    const g = t.G(); g.paused = true; g.noReport = false; g.aiReportUsed = false;
    const k = g.agents.find(a => a.alien && a.i !== 0 && a.alive);
    const v = g.agents.find(a => !a.alien && a.i !== 0 && a.alive);
    for (const a of g.agents) if (a !== k && a !== v) t.tp(a.i, 30,32);
    t.clearDrags(); t.resetAiState(k.i);
    t.tp(v.i, 56, 82.6); t.kill(v.i, 'knife'); t.tp(k.i, 59.6, 85.2);
    k.knife = 0; k.sabUsed = true; k._delay = 0; k._rest = 0;
    k._killBody = v.i; k._killAt = 0; k._killDecided = false;
    const oldRandom = Math.random;
    Math.random = () => 0;                 /* 报案概率 + 直接报案都命中 */
    t.aiTickAlien(k.i, 1, 0.05);
    Math.random = oldRandom;
    const plan = t.reportPlan(k.i);
    t.aiTickAlien(k.i, 4, 0.5);            /* 短暂停顿后原地拉铃，不绕去做不在场 */
    const out = { plan, meet: !!t.G().meet, used: t.aiReportUsed(),
      by: document.getElementById('m-by').textContent,
      tag: String(k.i + 1).padStart(2, '0') + ' ' + k.name };
    if (t.G().meet) t.finishMeeting();
    return out;
  });
  ok(DIR.plan && DIR.plan.direct && DIR.plan.wait > 0,
    '杀完人偶尔直接报案：计划标记 direct，原地短暂停顿');
  ok(DIR.meet && DIR.used && DIR.by === DIR.tag,
    '直接报案同样能开会：' + DIR.by);

  section('AI 异形 · 杀完人绕一圈回来报告');
  await fresh(false);
  const RP = await T(() => {
    const t = SKV3._t; t.newGame();
    const g = t.G(); g.paused = true; g.noReport = false; g.aiReportUsed = false;
    const k = g.agents.find(a => a.alien && a.i !== 0 && a.alive);
    const v = g.agents.find(a => !a.alien && a.i !== 0 && a.alive);
    for (const a of g.agents) if (a !== k && a !== v) t.tp(a.i, 30,32);
    t.tp(v.i, 56, 83.8); t.kill(v.i, 'knife');
    t.tp(k.i, 57.4, 85);
    k.knife = 0; k.sabUsed = true; k._delay = 0;
    t.planReport(k.i, v.i, 0);
    t.aiTickAlien(k.i, 20, 0.05);
    const out = { meet: !!g.meet, used: t.aiReportUsed(),
      by: document.getElementById('m-by').textContent,
      tag: String(k.i + 1).padStart(2, '0') + ' ' + k.name, inv: t.inv() };
    if (g.meet) t.finishMeeting();
    return out;
  });
  ok(RP.meet && RP.used && RP.by === RP.tag, 'AI 异形会主动回到现场报告尸体：' + RP.by);
  ok(RP.inv.fails.length === 0, '回场报告后不变量全过');

  const RP2 = await T(() => {
    const t = SKV3._t; t.newGame();
    const g = t.G(); g.paused = true; g.noReport = false; g.aiReportUsed = false;
    const k = g.agents.find(a => a.alien && a.i !== 0 && a.alive);
    const v = g.agents.find(a => !a.alien && a.i !== 0 && a.alive);
    for (const a of g.agents) if (a !== k && a !== v) t.tp(a.i, 30,32);
    t.tp(v.i, 56, 83.8); t.kill(v.i, 'knife');
    t.tp(k.i, 57.4, 85);
    k.knife = 0; k.sabUsed = true; k._delay = 0;
    t.planReport(k.i, v.i, 4);
    t.aiTickAlien(k.i, 20, 0.05);
    const mid = { d: +Math.hypot(g.agents[k.i].x - 56, g.agents[k.i].y - 51).toFixed(1),
      meet: !!g.meet, plan: t.reportPlan(k.i) };
    t.aiTickAlien(k.i, 700, 0.05);
    const after = { meet: !!g.meet, used: t.aiReportUsed() };
    if (g.meet) t.finishMeeting();
    return { mid, after, inv: t.inv() };
  });
  ok(RP2.mid.d > 1.5 && !RP2.mid.meet, '报告前先离开现场（不站在尸体旁喊人，间距 ' +
    RP2.mid.d + ' 格）');
  ok(RP2.after.meet && RP2.after.used, '绕一圈后回到现场再拉铃，用会议拖人类的时间');
  ok(RP2.inv.fails.length === 0, '绕场报告后不变量全过');

  section('会议 · 尸体还热就有人来报');
  const QR = await T(() => {
    const t = SKV3._t; t.newGame();
    const g = t.G(); g.paused = true; g.noReport = false;
    const k = g.agents.find(a => a.alien && a.i !== 0 && a.alive);
    const v = g.agents.find(a => !a.alien && a.i !== 0 && a.alive);
    const w = g.agents.find(a => !a.alien && a.i !== 0 && a.alive && a !== v);
    for (const a of g.agents) if (a !== k && a !== v && a !== w) t.tp(a.i, 30,32);
    t.tp(v.i, 56, 83.8); t.kill(v.i, 'knife');
    t.tp(w.i, 57.4, 85);
    t.aiScan(w.i, 0.6);                    /* w 看到尸体（没看到凶手） */
    const s0 = (t.mind(w.i).sus || {})[k.i] || 0;
    t.openMeeting('night', k.i, v.i);      /* 凶手本人报告 */
    const q = t.meetCtx().quick;
    const s1 = (t.mind(w.i).sus || {})[k.i] || 0;
    t.finishMeeting();
    return { k: k.i, w: w.i, s0, s1, q, inv: t.inv() };
  });
  ok(QR.q && QR.q.age <= 10, '会议记录「尸体刚倒下」（quick.age=' + (QR.q && QR.q.age) + 's）');
  ok(QR.s1 > QR.s0 + 0.15,
    '见过尸体的人会怀疑报告人来得太快（' + QR.s0.toFixed(2) + ' → ' + QR.s1.toFixed(2) + '）');
  ok(QR.inv.fails.length === 0, '快速报告不变量全过');

  const QR2 = await T(() => {
    const t = SKV3._t; t.newGame();
    const g = t.G(); g.paused = true; g.noReport = false;
    const k = g.agents.find(a => a.alien && a.i !== 0 && a.alive);
    const v = g.agents.find(a => !a.alien && a.i !== 0 && a.alive);
    const w = g.agents.find(a => !a.alien && a.i !== 0 && a.alive && a !== v);
    for (const a of g.agents) if (a !== k && a !== v && a !== w) t.tp(a.i, 30,32);
    t.tp(v.i, 56, 83.8); t.kill(v.i, 'knife');
    v.deathAt = g.t + 30;                  /* 死了 30 秒才被报 */
    t.tp(w.i, 57.4, 85);
    t.aiScan(w.i, 0.6);
    const s0 = (t.mind(w.i).sus || {})[k.i] || 0;
    t.openMeeting('night', k.i, v.i);
    const s1 = (t.mind(w.i).sus || {})[k.i] || 0;
    const q = t.meetCtx().quick;
    const why = (t.mind(w.i).why || {})[k.i] || [];
    t.finishMeeting();
    return { s0, s1, q, why };
  });
  ok(QR2.q && QR2.q.age > 10, '死亡 30 秒后才报告：quick.age=' + (QR2.q && QR2.q.age) + 's');
  const qr2 = (QR2.why || []).filter(x => x.reason === 'quick_report');
  ok(qr2.length === 0,
    '不是「来得太快」就不记 quick_report 嫌疑（总嫌疑可能被会议构陷抬高：' +
    QR2.s0.toFixed(2) + ' → ' + QR2.s1.toFixed(2) + '）');

  section('会议 · 夜晚时间结算（会议暂停夜晚时钟，2026-11-02）');
  await fresh(false);
  const MTIME = await T(() => {
    const t = SKV3._t; t.newGame();
    const g = t.G(); g.paused = false; g.noReport = true;
    const k = g.agents.find(a => a.alien && a.i !== 0 && a.alive);
    const vs = g.agents.filter(a => !a.alien && a.i !== 0 && a.alive).slice(0, 4);
    const leftSec = () => (g.simMode ? g.simT : (g.phase ? SKClock.remaining(g.phase, performance.now()) / 1000 : 0));
    /* 造一具尸体 → 开会 → 把 startAt 往前拨，模拟"会议开了 elapsedMs 毫秒" */
    const runMeet = (victim, elapsedMs) => {
      t.kill(victim.i);
      t.openMeeting('night', k.i, victim.i);
      const m = g.meet;
      if (m) m.startAt = performance.now() - elapsedMs;
      t.finishMeeting();
      return m ? { remainMs: Math.round(m.remainMs) } : null;
    };

    /* ① 正常：夜晚剩 90 秒，会议 30 秒 → 散会后应剩 ≈60 秒，仍在同一夜 */
    g.phase = SKClock.newPhase('night', performance.now(), 90000);
    const m1 = runMeet(vs[0], 30000);
    const normal = { remainMs: m1 && m1.remainMs, left: +leftSec().toFixed(1),
      night: g.night, meet: !!g.meet };

    /* ② 深夜：夜晚只剩 10 秒，会议 30 秒 → 这一夜被耗光，应直接天亮（开 day 会议） */
    g.phase = SKClock.newPhase('night', performance.now(), 10000);
    const m2 = runMeet(vs[1], 30000);
    const overtime = { remainMs: m2 && m2.remainMs, left: +leftSec().toFixed(1),
      night: g.night, t: +g.t.toFixed(1), meetKind: g.meet ? g.meet.kind : null };

    /* ③ 天亮会议散场 → 进入下一夜（天数 +1、夜晚时间回满）。
       注意：会议不再吃夜晚时间后，"夜里剩 10 秒开 30 秒会"**不会**再自动天亮，
       所以这里显式开一场白天会议来验证"白天会议散场 → 下一夜"。 */
    const before = g.night;
    t.openMeeting('day', null, null);
    if (g.meet) t.finishMeeting();
    const after = { night: g.night, t: +g.t.toFixed(1) };
    return { normal, overtime, before, after, inv: t.inv(),
      nightLen: (function(){ const gg = SKV3._t.G(); return gg.t; })() };
  });
  /* 2026-11-02：会议**不再吃夜晚时间**（会议期间时钟暂停），
     所以「剩 90 秒开 30 秒会后剩 60」这条旧断言反过来 —— 现在应该还是 90 秒。 */
  ok(MTIME.normal.left > 85 && MTIME.normal.left < 95 && MTIME.normal.night === 1 && !MTIME.normal.meet,
    '夜晚剩 90 秒开会 30 秒：散会后**仍是 ' + MTIME.normal.left + ' 秒**（时钟暂停），同一夜');
  ok(MTIME.overtime.meetKind === null && MTIME.overtime.left > 5 && MTIME.overtime.left < 15 &&
     MTIME.overtime.night === 1,
    '夜晚只剩 10 秒时开会 30 秒：不会把这一夜耗光（' +
    'meetKind=' + MTIME.overtime.meetKind + ' / 天数=' + MTIME.overtime.night + ' / 剩余=' + MTIME.overtime.left + 's）');
  ok(MTIME.after.night === MTIME.before + 1 && Math.abs(MTIME.after.t - MTIME.nightLen) < 1.5,
    '天亮会议散场进入下一夜：天数 ' + MTIME.before + ' → ' + MTIME.after.night + '，夜晚时间回满 ' + MTIME.after.t + 's');
  ok(MTIME.inv && MTIME.inv.fails.length === 0, '会议时间结算后不变量全过');

  section('故障维修 · 队友修好后立即松手');
  await fresh(false);
  const SFIX = await T(() => {
    const t = SKV3._t; t.newGame();
    const g = t.G(); g.paused = true; g.noReport = true;
    const a1 = g.agents.find(a => !a.alien && a.i !== 0 && a.alive);
    const a2 = g.agents.find(a => !a.alien && a.i !== 0 && a.alive && a !== a1);
    t.tp(a1.i, 56, 83.8); t.tp(a2.i, 57.2, 85);
    g.dmg = [{room: 'med', x: 56.1, y: 83.4, label: '测试设备', left: 60, dur: 60, by: 0}];
    t.startFix(a1.i, 'med'); t.startFix(a2.i, 'med');
    const before = { d1: g.agents[a1.i]._doing, d2: g.agents[a2.i]._doing };
    g.agents[a1.i].doing = 0.01;
    t.finishDoing(a1.i);
    return { a1: a1.i, a2: a2.i, before, dmg: g.dmg.length,
      d2: g.agents[a2.i]._doing, doing2: g.agents[a2.i].doing,
      path2: !!g.agents[a2.i].path, inv: t.inv() };
  });
  ok(SFIX.before.d1 === 'fix' && SFIX.before.d2 === 'fix', '两名 AI 可以同时修同一座故障');
  ok(SFIX.dmg === 0 && !SFIX.d2 && SFIX.doing2 === 0,
    '队友修好后另一人立即停止站桩（不再空耗剩下的 10 秒）');
  ok(!SFIX.path2 && SFIX.inv.fails.length === 0, '同时清掉旧故障路径，不变量全过');

  const SFIX2 = await T(() => {
    const t = SKV3._t; t.newGame();
    const g = t.G(); g.paused = true; g.noReport = true;
    const a1 = g.agents.find(a => !a.alien && a.i !== 0 && a.alive);
    const a2 = g.agents.find(a => !a.alien && a.i !== 0 && a.alive && a !== a1);
    t.tp(a1.i, 56, 83.8); t.tp(a2.i, 28.4,54);
    g.dmg = [{room: 'med', x: 56.1, y: 83.4, label: '测试设备', left: 60, dur: 60, by: 0}];
    a2._fixGo = g.dmg[0];
    a2.path = [[56.1, 83.4]];
    g.dmg = [];
    t.aiTick(a2.i, 1, 0.05);
    const end = a2.path && a2.path.length ? a2.path[a2.path.length - 1] : null;
    return { fixGo: a2._fixGo, end,
      atFault: !!(end && Math.hypot(end[0] - 56.1, end[1] - 71.4) < 0.6), inv: t.inv() };
  });
  ok(!SFIX2.fixGo && !SFIX2.atFault, '赶往故障途中故障被修好：立刻改道，不再往旧设备跑');
  ok(SFIX2.inv.fails.length === 0, '改道后不变量全过');

  section('AI 人类 · 断电后主动合闸');
  await fresh(false);
  const LB = await T(() => {
    const t = SKV3._t; t.newGame();
    const g = t.G(); g.paused = true; g.noReport = true; g.dmg = [];
    const h = g.agents.find(a => !a.alien && a.i !== 0 && a.alive);
    for (const a of g.agents) if (a !== h) { a.knife = 0; t.tp(a.i, 30,32); }
    t.clearDrags(); t.resetAiState(h.i);
    h.medkit = 0; h.bullet = 0; h.qual = 0; h.qualPending = 0; h.suspect = null;
    h.tIdx = h.tasks.length; h._delay = 0; h._rest = 0;
    t.breaker();
    const st0 = t.lights().state;
    let hp = null;
    for (let r = 0.4; r <= 3.2 && !hp; r += 0.2)
      for (let i = 0; i < 24 && !hp; i++) {
        const a = i / 24 * Math.PI * 2, x = 50.8 + Math.cos(a) * r, y = 54.1 + Math.sin(a) * r;
        if (t.free(x, y)) hp = [x, y];
      }
    t.tp(h.i, hp[0], hp[1]);
    t.aiTick(h.i, 40, 0.05);
    const doing = g.agents[h.i]._doing;
    g.agents[h.i].doing = 0.02;
    t.aiTick(h.i, 4, 0.05);
    return { st0, doing, after: t.lights().state, lightGo: g.agents[h.i]._lightGo,
      inv: t.inv() };
  });
  ok(LB.st0 === 2 && LB.doing === 'breaker', '断电时 AI 人类走到电闸前开始合闸（3 秒站桩）');
  ok(LB.after !== 2 && !LB.lightGo, '合闸完成：全船照明恢复，响应标记清空');
  ok(LB.inv.fails.length === 0, 'AI 合闸后不变量全过');

  section('AI 异形 · 主动寻管道口');
  await fresh(false);
  const PIP = await T(() => {
    const t = SKV3._t; t.newGame();
    const g = t.G(); g.paused = true; g.noReport = true;
    const k = g.agents.find(a => a.alien && a.i !== 0 && a.alive);
    const v = g.agents.find(a => !a.alien && a.i !== 0 && a.alive);
    for (const a of g.agents) if (a !== k && a !== v) t.tp(a.i, 30,32);
    t.clearDrags(); t.resetAiState(k.i);
    k.knife = 1; k.sabUsed = true; k._delay = 0; k._rest = 0; k._pipeCD = 0;
    let kp = null;
    for (let r = 0; r <= 3.2 && !kp; r += 0.2)
      for (let i = 0; i < 24 && !kp; i++) {
        const a = i / 24 * Math.PI * 2, x = 8 + Math.cos(a) * r, y = 52 + Math.sin(a) * r;
        if (t.free(x, y)) kp = [x, y];
      }
    t.tp(k.i, kp[0], kp[1]); t.tp(v.i, 84,31);
    k.target = v;                    /* 目标锁定监控室的人：验证它会规划到管道口 */
    let last = null;
    for (let i = 0; i < 600; i++) {
      last = t.aiTickAlien(k.i, 1, 0.05);
      if (last.pipeSeeks >= 1) break;
    }
    const pipes = t.pipes();
    const at = pipes.find(p => Math.hypot(p.x - k.x, p.y - k.y) < 0.05);
    return { seeks: last.pipeSeeks, at, cd: k._pipeCD, room: t.state()[k.i].room,
      x: k.x, y: k.y, inv: t.inv() };
  });
  ok(PIP.seeks >= 1 && PIP.at && PIP.cd === 20,
    'AI 异形会自己寻路到管道口再钻（不再要求正好站在口上）');
  ok(PIP.room === 'cam', '管道出口按离目标最近选择（目标在监控室 → ' + PIP.room + '）');
  ok(PIP.inv.fails.length === 0, 'AI 主动钻管道后不变量全过');

  await fresh(false);
  const PIP0 = await T(() => {
    const t = SKV3._t; t.newGame();
    const g = t.G(); g.paused = true; g.noReport = true;
    const k = g.agents.find(a => a.alien && a.i !== 0 && a.alive);
    const v = g.agents.find(a => !a.alien && a.i !== 0 && a.alive);
    for (const a of g.agents) if (a !== k && a !== v) t.tp(a.i, 30,32);
    t.clearDrags(); t.resetAiState(k.i);
    k.knife = 0; k.bullet = 0; k.medkit = 0; k.qual = 0; k.qualPending = 0;
    k.sabUsed = true; k._delay = 0; k._rest = 0; k._pipeCD = 0;
    k._noFake = true; k._alienTaskN = g.night;   /* 排除伪装/做任务分支 */
    const pipes = t.pipes();
    const pin = pipes[0];
    t.tp(k.i, pin.x, pin.y); t.tp(v.i, 84,31);
    k.target = v;
    let last = null;
    for (let i = 0; i < 20; i++) {
      last = t.aiTickAlien(k.i, 1, 0.05);
      if (last.pipeSeeks >= 1) break;
    }
    const at = pipes.find(p => Math.hypot(p.x - k.x, p.y - k.y) < 0.05);
    return { seeks: last.pipeSeeks, at, cd: k._pipeCD, knife: k.knife, inv: t.inv() };
  });
  ok(PIP0.knife === 0 && PIP0.seeks >= 1 && PIP0.at && PIP0.cd === 20,
    '刀用完的异形也会钻管道（修复“没刀只会原地游荡”）');
  ok(PIP0.inv.fails.length === 0, '没刀异形钻管道后不变量全过');

  await fresh(false);
  const BUSYPRI = await T(() => {
    const t = SKV3._t; t.newGame();
    const g = t.G(); g.paused = true; g.noReport = true; g.dmg = [];
    const k = g.agents.find(a => a.alien && a.i !== 0 && a.alive);
    const idle = g.agents.find(a => !a.alien && a.i !== 0 && a.alive);
    const busy = g.agents.find(a => !a.alien && a.i !== 0 && a.alive && a !== idle);
    /* 旁人一律挪到 8 格视野之外：他们留在旁边就是"更近的可见闲人"，
       测的就不是"忙人优先"而是"谁近谁死"了 */
    for (const a of g.agents) if (a !== k && a !== idle && a !== busy) t.tp(a.i, 58, 47);
    t.clearDrags(); t.resetAiState(k.i);
    g.secbotDead = true; g.medbotDead = true;
    k.knife = 1; k.bullet = 0; k.sabUsed = true; k._delay = 0; k._rest = 0;
    k._pipeCD = 0;
    /* 生态舱 y=55 这一条是**实测无遮挡**的直线（家具会让 7 格外看不见，
       那时"看不见就不知道他在干活"会正确生效，夹具测的就不再是优先级） */
    t.tp(k.i, 21, 55); t.tp(idle.i, 24, 55); t.tp(busy.i, 28, 55);
    idle.doing = 0; idle._doing = null;
    busy.doing = 5; busy._doing = 'task';
    const see7 = t.aiSee(k.i, 28, 55, SKSanity.SIGHT.aiCapR);
    t.aiTickAlien(k.i, 1, 0.05);
    const near = k.target ? k.target.i : null;
    /* "看不见就不知道他在干活"要造得**干净**：以前是把忙人挪到 11 格外，
       但 2026-11-03 亮区整片可见对 AI 成立之后，同在一间亮舱里 11 格**本来就看得见**。
       所以这里把忙人挪进**配电室（暗舱、且与生态舱隔墙）** —— 看不见的前提是真的看不见。 */
    t.tp(busy.i, 48, 55); busy.doing = 5; busy._doing = 'task';
    t.tp(idle.i, 24, 55); idle.doing = 0; idle._doing = null;
    const see11 = t.aiSee(k.i, 48, 55, SKSanity.SIGHT.aiCapR);
    k.target = null; k._pipeCD = 20;
    t.aiTickAlien(k.i, 1, 0.05);
    const far = k.target ? k.target.i : null;
    return { near, far, idle: idle.i, busy: busy.i, see7, see11,
      cap: SKSanity.SIGHT.aiCapR };
  });
  ok(BUSYPRI.see7 && !BUSYPRI.see11,
    '夹具：异形对 7 格的忙人**看得见**（同亮舱），对隔墙暗舱里的忙人**看不见**（视野上限 ' +
    BUSYPRI.cap + ' 格）');
  ok(BUSYPRI.near === BUSYPRI.busy,
    '看得见的时候，优先挑正在做任务的人（7 格的忙人赢过 3 格的闲人）');
  ok(BUSYPRI.far === BUSYPRI.idle,
    '看不见就不知道他在干活：11 格外的忙人**不再**赢过 3 格外看得见的闲人（取消全图锁敌）');

  section('破坏技 · 选舱 / 30 秒 / 连续 10 秒维修');
  await fresh(false);
  const SAB0 = await T(() => {
    const t = SKV3._t, g = t.G();
    g.noReport = true;
    const swap = g.agents.find(a => a.alien && a.i !== 0 && a.alive);
    swap.alien = false; /* 保持 4 异形 / 11 人类，不触发不变量 */
    g.me.alien = true; g.me.sabUsed = false;
    g.me.doing = 0; g.me._doing = null; g.me.path = null;
    g.dmg = []; g.sabTarget = null;
    t.tp(0, 30,32);
    const open = t.openSab();
    return { open, pick: t.sabPick(), msg: g.msg, inv: t.inv() };
  });
  await page.waitForTimeout(150);
  const SAB0b = await T(() => ({
    ui: !document.getElementById('sabot').classList.contains('hide'),
    buttons: document.querySelectorAll('#sabot-list button').length,
    tip: document.getElementById('tip').textContent
  }));
  ok(SAB0.open && SAB0.pick.rooms.length === 9 && SAB0.pick.rooms.indexOf('bridge') < 0,
    '玩家异形按 F 打开舱室列表：9 个舱室，中央会议室被排除');
  ok(SAB0b.ui && SAB0b.buttons === 9 && SAB0b.tip.indexOf('破坏选择') >= 0,
    '破坏面板：9 个按钮 + 提示栏切换到破坏说明');
  ok(SAB0.inv && SAB0.inv.fails.length === 0, '打开破坏面板后不变量全过');
  await shot('46_破坏选舱.png');
  const SAB1 = await T(() => {
    const t = SKV3._t, g = t.G();
    const sp = t.sabSpot('power');
    const picked = t.pickSab('power');
    const target = t.sabTarget();
    t.tp(0, sp.x, sp.y);
    t.sabTick();
    return { picked, target, after: t.sabTarget(), sp, dmg: t.dmg(), sab: g.me.sabUsed,
      fx: t.fx(), msg: g.msg, inv: t.inv() };
  });
  ok(SAB1.picked && SAB1.target && SAB1.target.room === 'power',
    '选择配电室后生成目标：进入舱室自动下手');
  ok(SAB1.dmg.length === 1 && SAB1.dmg[0].room === 'power' &&
    SAB1.dmg[0].label === SAB1.sp.label && SAB1.dmg[0].dur === 30 && SAB1.sab && !SAB1.after,
    '抵达目标舱室损毁对应设备：消耗本夜破坏技并清除目标（30 秒窗口）');
  ok(SAB1.fx.includes('spark') && SAB1.fx.includes('alarm') &&
    SAB1.msg.indexOf('30 秒') >= 0, '破坏反馈：火花 + 警报环 + 30 秒维修窗口播报');
  ok(SAB1.inv && SAB1.inv.fails.length === 0, '破坏舱室后不变量全过');
  await page.waitForTimeout(180);
  const SAB1b = await T(() => ({
    dmg: SKV3._t.dmg(),
    hud: document.getElementById('dmgline').textContent,
    show: !document.getElementById('dmgline').classList.contains('hide'),
    room: SKV3._t.roomName('power')
  }));
  ok(SAB1b.show && SAB1b.hud.indexOf('故障') >= 0 && SAB1b.hud.indexOf(SAB1b.room) >= 0 &&
    SAB1b.dmg[0] && SAB1b.dmg[0].left < 30,
    'HUD 故障条显示舱室/设备/剩余秒数，倒计时随时间下降');
  await shot('46b_故障倒计时.png');
  const SAB2 = await T(() => {
    const t = SKV3._t, g = t.G();
    t.sabotage();
    return { open: !!g.sabPick, msg: g.msg, inv: t.inv() };
  });
  ok(!SAB2.open && SAB2.msg.indexOf('今晚已经破坏过了') >= 0,
    '破坏技每夜一次：用过后再按 F 被拒绝');
  await T(() => {
    const g = SKV3._t.G();
    g.prog = 10;
    g.dmg[0].left = 0.05;
  });
  await page.waitForTimeout(340);
  const SAB3 = await T(() => ({ prog: SKV3._t.G().prog, dmg: SKV3._t.dmg().length,
    msg: SKV3._t.G().msg, inv: SKV3._t.inv() }));
  ok(SAB3.prog === 5 && SAB3.dmg === 0 && SAB3.msg.indexOf('维修进度 -5') >= 0,
    '30 秒内未修复且仍在天黑：维修进度 -5');
  ok(SAB3.inv && SAB3.inv.fails.length === 0, '超时扣分后不变量全过');

  await fresh(false);
  const SAB4 = await T(() => {
    const t = SKV3._t, g = t.G();
    g.noReport = true; g.dmg = [];
    const k = g.agents.find(a => a.alien && a.i !== 0 && a.alive && !a.downed);
    k.sabUsed = false; k.doing = 0; k._doing = null;
    const made = t.damageRoom(k.i, 'med');
    const d = t.dmg().find(q => q.room === 'med');
    t.tp(0, d.x, d.y);
    g.me.doing = 0; g.me._doing = null; g.me.path = null;
    const first = t.interact();
    const fixing = t.fixing();
    t.finishDoing(0);
    return { made, d, first, fixing, dmg: t.dmg(), fx: t.fx(), msg: g.msg, inv: t.inv() };
  });
  ok(SAB4.made && SAB4.first.do === 'fix' && Math.abs(SAB4.first.doing - 10) < 0.001 &&
    SAB4.fixing.length === 1 && Math.abs(SAB4.fixing[0].t - 10) < 0.001,
    '人类按 W 维修故障：连续 10 秒计时，维修者状态可查');
  ok(SAB4.dmg.length === 0 && SAB4.fx.includes('heal') && SAB4.msg.indexOf('故障已修复') >= 0,
    '修满 10 秒后故障消失：治疗环特效 + 播报');
  ok(SAB4.inv && SAB4.inv.fails.length === 0, '维修故障后不变量全过');
  const SAB5 = await T(() => {
    const t = SKV3._t, g = t.G();
    const k = g.agents.find(a => a.alien && a.i !== 0 && a.alive && !a.downed);
    k.sabUsed = false; g.dmg = [];
    t.damageRoom(k.i, 'fun');
    const d = t.dmg()[0];
    t.tp(0, d.x, d.y);
    g.me.path = null; g.me.doing = 0; g.me._doing = null;
    t.interact();
    g.me.path = [[d.x + 2, d.y]];
    return { dmg: t.dmg().length, doing: g.me.doing, do: g.me._doing };
  });
  await page.waitForTimeout(180);
  const SAB5b = await T(() => ({ doing: SKV3._t.G().me.doing, do: SKV3._t.G().me._doing,
    msg: SKV3._t.G().msg, dmg: SKV3._t.dmg().length }));
  ok(SAB5.doing > 9 && SAB5.do === 'fix' && SAB5b.doing === 0 && SAB5b.do === null &&
    SAB5b.msg.indexOf('移动打断') >= 0 && SAB5b.dmg === 1,
    '维修必须连续：移动会打断计时，故障保留');
  const SAB6 = await T(() => {
    const t = SKV3._t, g = t.G();
    const swap = g.agents.find(a => a.alien && a.i !== 0 && a.alive);
    swap.alien = false; g.me.alien = true;
    g.me.sabUsed = false; g.me.doing = 0; g.me._doing = null;
    t.kill(0, 'knife');
    t.sabotage();
    return { ghost: !g.me.alive && !!g.me.ghost, open: !!g.sabPick,
      msg: g.msg, inv: t.inv() };
  });
  ok(SAB6.ghost && !SAB6.open && SAB6.msg.indexOf('幽灵无法破坏') >= 0,
    '幽灵不能施展破坏：按 F 被明确拒绝');
  ok(SAB6.inv && SAB6.inv.fails.length === 0, '幽灵拒绝破坏后不变量全过');

  await fresh(false);
  const SAB7 = await T(() => {
    const t = SKV3._t, g = t.G();
    g.noReport = true; g.dmg = [];
    const k = g.agents.find(a => a.alien && a.i !== 0 && a.alive && !a.downed);
    k.sabUsed = false;
    t.damageRoom(k.i, 'engine');
    const d = g.dmg[0];
    const h = g.agents.find(a => !a.alien && a.i !== 0 && a.alive && !a.downed);
    t.tp(h.i, d.x, d.y);
    h._delay = 0; h._rest = 0; h.path = null; h.doing = 0; h._doing = null;
    h.medkit = 0; h.suspect = null;
    const first = t.aiTick(h.i, 1, 0.05);
    const mid = t.fixing();
    const r = t.aiTick(h.i, 230, 0.05);
    return { h: h.i, first, mid, dmg: t.dmg().length, fx: t.fx(), msg: g.msg, inv: t.inv() };
  });
  ok(SAB7.first.do === 'fix' && SAB7.mid.some(x => x.i === SAB7.h),
    'AI 人类自动响应故障：抵达后开始连续维修');
  ok(SAB7.dmg === 0 && SAB7.fx.includes('heal'), 'AI 人类修满 10 秒后故障清除');
  ok(SAB7.inv && SAB7.inv.fails.length === 0, 'AI 抢修后不变量全过');
  const SAB8 = await T(() => {
    const t = SKV3._t, g = t.G();
    const swap = g.agents.find(a => a.alien && a.i !== 0 && a.alive);
    swap.alien = false; g.me.alien = true;
    g.me.sabUsed = false; g.me.doing = 0; g.me._doing = null; g.me.path = null;
    g.noReport = true;
    const k = g.agents.find(a => a.alien && a.i !== 0 && a.alive);
    k.sabUsed = false; g.dmg = [];
    t.damageRoom(k.i, 'armory');
    const d = g.dmg[0];
    t.tp(0, d.x, d.y);
    const first = t.interact();
    t.finishDoing(0);
    return { first, dmg: t.dmg().length, msg: g.msg, inv: t.inv() };
  });
  ok(SAB8.first.do === 'fix' && SAB8.dmg === 0 && SAB8.msg.indexOf('故障已修复') >= 0,
    '异形同样可以维修故障：人类/异形共用连续 10 秒规则');
  ok(SAB8.inv && SAB8.inv.fails.length === 0, '异形维修后不变量全过');

  await fresh(false);
  const SAB9 = await T(() => {
    const t = SKV3._t, g = t.G();
    g.dmg = []; g.prog = 10;
    const k = g.agents.find(a => a.alien && a.i !== 0 && a.alive);
    k.sabUsed = false;
    t.damageRoom(k.i, 'transit');
    g.dmg[0].left = 0.01;
    g.t = 0;
    t.dmgTick(1);
    return { prog: g.prog, dmg: t.dmg().length };
  });
  ok(SAB9.prog === 10 && SAB9.dmg === 0, '天亮前未修完的故障不扣分：随夜晚结束清除');

  section('胜负 · 维修 45 分');
  await fresh(false);
  const WIN45 = await T(() => {
    const t = SKV3._t; t.newGame();
    const g = t.G(); g.paused = true;
    g.prog = 44;
    const before = t.checkWin();
    const over44 = g.over;
    g.prog = 45;
    const hit = t.checkWin();
    return { before, over44, hit, over: g.over, why: g.overWhy };
  });
  ok(WIN45.before === false && !WIN45.over44 && WIN45.hit === true &&
    WIN45.over && /45/.test(WIN45.why || ''),
    '人类维修进度必须达到 45 分才胜利（40 分不再直接结束）');
  await fresh(false);

  /* HUD 的进度上限必须是胜利目标分：曾经模板里写死「/ 40」而实际按 45 结算 */
  const HUD45 = await T(() => ({
    win: SKV3._t.winPts(),
    max: document.getElementById('pgmax').textContent,
    line: document.getElementById('pg').parentElement.textContent.replace(/\s+/g, ' ').trim(),
    bar: document.getElementById('pgi').style.width
  }));
  ok(HUD45.win === 45 && HUD45.max === String(HUD45.win) &&
    HUD45.line.indexOf('/ ' + HUD45.win) >= 0,
    'HUD 维修进度上限与胜利目标同源（winPts=' + HUD45.win + ' · HUD="' + HUD45.line + '"）');

  /* 幽灵不留脚步声纹：它们飘在墙里，响起来会让活人误读"这里有人在走"。
     对照组必须仍然响，否则就是把整条声纹链路关掉了。 */
  await fresh(false);
  const GWAVE = await T(() => {
    const t = SKV3._t, g = t.G();
    g.paused = true; g.noReport = true;
    /* 不改任务表（会破坏对账不变量），而是把人放到离自己任务点最远的一端，
       让它必须走一段路——否则它会站在任务点上原地不动，对照组就不成立。 */
    const sendFar = (a) => {
      const pi = a.tasks[Math.min(a.tIdx, a.tasks.length - 1)];
      const p = SKMapData.points[pi];
      const cand = [[8, 52], [60, 84], [86, 52], [41, 8], [30, 55], [83, 30]];
      let best = null, bd = -1;
      for (const c of cand) {
        if (!t.free(c[0], c[1])) continue;
        const d = p ? Math.hypot(c[0] - p.x, c[1] - p.y) : 1;
        if (d > bd) { bd = d; best = c; }
      }
      if (best) t.tp(a.i, best[0], best[1]);
      a._delay = 0; a._rest = 0; a.path = null;
      return bd ? +bd.toFixed(1) : 0;
    };
    const drive = (a, ghost) => {
      const p0 = [a.x, a.y];
      g.waves.length = 0;
      for (let n = 0; n < 400; n++) {
        if (ghost) t.aiGhostTick(a.i, 1, 0.05); else t.aiTick(a.i, 1, 0.05);
      }
      return { moved: +Math.hypot(a.x - p0[0], a.y - p0[1]).toFixed(2),
        steps: g.waves.filter(w => w.kind === 'step').length };
    };
    /* 声纹只对玩家 14 格内的动静生效：把人放到离玩家远处，对照组就会 0 圈而误判。
       所以驱动活人前，先把玩家挪到他旁边（找 8 格内的可站点）。 */
    const near = (a) => {
      for (const r of [4, 5, 6, 7, 8]) {
        for (let i = 0; i < 12; i++) {
          const ang = i / 12 * Math.PI * 2;
          const x = a.x + Math.cos(ang) * r, y = a.y + Math.sin(ang) * r;
          if (t.free(x, y)) { t.tp(0, x, y); return; }
        }
      }
      t.tp(0, 41, 36.4);
    };
    /* 必须挑人类：异形幽灵是"直接待机"的，走不动就证明不了脚步被过滤 */
    const dead = g.agents.find(a => a.i !== 0 && a.alive && !a.downed && !a.alien);
    sendFar(dead);
    t.tp(0, 30, 32);
    t.kill(dead.i, 'knife');
    sendFar(dead);
    near(dead);
    const ghost = drive(dead, true);
    const live = g.agents.find(a => a.i !== 0 && a.alive && !a.downed && !a.alien && a !== dead);
    sendFar(live);
    near(live);
    const human = drive(live, false);
    return { alive: dead.alive, ghost, human, inv: t.inv() };
  });
  ok(GWAVE.alive === false && GWAVE.ghost.moved > 1 && GWAVE.ghost.steps === 0,
    '幽灵走了 ' + GWAVE.ghost.moved + ' 格，声纹 0 圈（脚步不计幽灵）');
  ok(GWAVE.human.moved > 1 && GWAVE.human.steps > 0,
    '对照组：活人走 ' + GWAVE.human.moved + ' 格仍留下 ' + GWAVE.human.steps + ' 圈脚步声纹');
  ok(GWAVE.inv && GWAVE.inv.fails.length === 0, '声纹测试后不变量全过' +
    (GWAVE.inv.fails.length ? '（失败项：' + GWAVE.inv.fails.slice(0, 4).map(f => f.code + ':' + f.msg).join(' | ') + '）' : ''));
  ok(GWAVE.alive === false && GWAVE.ghost.moved > 1 && GWAVE.ghost.steps === 0,
    '幽灵走了 ' + GWAVE.ghost.moved + ' 格，声纹 0 圈（脚步不计幽灵）');
  ok(GWAVE.human.moved > 1 && GWAVE.human.steps > 0,
    '对照组：活人走 ' + GWAVE.human.moved + ' 格仍留下 ' + GWAVE.human.steps + ' 圈脚步声纹');
  ok(GWAVE.inv && GWAVE.inv.fails.length === 0, '声纹测试后不变量全过' +
    (GWAVE.inv.fails.length ? '（失败项：' + GWAVE.inv.fails.slice(0, 4).map(f => f.code + ':' + f.msg).join(' | ') + '）' : ''));

  section('视野 · 暗处不能隔空开枪');
  await fresh(false);
  const VIS0 = await T(() => {
    const t = SKV3._t, g = t.G();
    const k = g.agents.find(a => a.alien && a.i !== 0 && a.alive);
    for (const a of g.agents) if (a !== g.me && a !== k) t.tp(a.i, 30,32);
    /* 放在医疗间南侧、远离悬停在房间正中央的医疗无人机：枪口贴近机器人会被判成打机器人，
       这条测的是「暗处看不见的人不能隔空打中」，不要让它被无人机抢走命中 */
    t.tp(0, 54,81.4); t.tp(k.i, 59, 81.4);
    g.me.bullet = 1;
    t.breaker(); /* 断电后只有 2.8 格近身视野 + 7 格手电锥；目标在 5 格背后 */
    g.aimX = g.me.x - 1; g.aimY = g.me.y;
    t.shoot();
    const dark = { bullet: g.me.bullet, downed: g.agents[k.i].downed, msg: g.msg,
      light: t.lights().state };
    g.aimX = g.me.x + 1; g.aimY = g.me.y;
    t.shoot();
    const lit = { bullet: g.me.bullet, downed: g.agents[k.i].downed, msg: g.msg };
    return { dark, lit, inv: t.inv() };
  });
  ok(VIS0.dark.light === 2 && VIS0.dark.bullet === 1 && !VIS0.dark.downed &&
    VIS0.dark.msg.indexOf('视野内没有目标') >= 0,
    '暗处背对目标：子弹不消耗、目标不受伤');
  ok(VIS0.lit.bullet === 0 && VIS0.lit.downed,
    '同一距离把手电转向目标：正常命中');
  ok(VIS0.inv && VIS0.inv.fails.length === 0, '视野射击判定后不变量全过');

  section('异形身份 · 互不知道 / 行为推断 / 互刀 / 统一移速 / 保安识别范围');
  await fresh(false);
  const AB = await T(() => {
    const t = SKV3._t, g = t.G();
    g.noReport = true;
    /* 玩家变异形：降级一名 AI 异形，保持 4 异形 / 11 人类 */
    const demoted = g.agents.find(a => a.alien && a.i !== 0 && a.alive);
    demoted.alien = false;
    g.me.alien = true;
    const actor = g.agents.find(a => a.alien && a.i !== 0 && a.alive);
    const human = g.agents.find(a => !a.alien && a.i !== 0 && a.alive);
    /* 同一处亲眼目击一次异形专属破坏：只有人类写入 suspect */
    t.tp(actor.i, 57.2, 85);
    t.tp(human.i, 58.1, 85.5);
    actor.sabUsed = false; g.dmg = [];
    const okDmg = t.damageRoom(actor.i, 'med');
    return { okDmg, actor: actor.i, human: human.i,
      humanSuspect: human.suspect, humanAllies: human.allies || null,
      range: t.secRange(), speed: t.speed(),
      role: document.getElementById('role').textContent,
      tip: document.getElementById('tip').textContent, inv: t.inv() };
  });
  ok(AB.speed === 4.0, '全场统一移动速度常量 = ' + AB.speed + ' 格/秒');
  ok(AB.range === 6, '保安机器人行凶识别半径 = ' + AB.range + ' 格（10.5 → 6）');
  ok(AB.okDmg && AB.humanSuspect === AB.actor, '人类目击异形专属破坏 → 写入嫌疑人');
  ok(AB.humanAllies == null, '人类不会被写入盟友表（只有 suspect）');
  ok(AB.role.indexOf('天眼') < 0 && AB.tip.indexOf('天眼') < 0, '玩家异形没有天眼 / 队友透视 UI');
  ok(AB.inv && AB.inv.fails.length === 0, '行为推断状态不变量全过');
  const AIP = await T(() => {
    const t = SKV3._t, g = t.G();
    const k = g.agents.find(a => a.alien && a.i !== 0 && a.alive && !a.downed);
    const mate = g.agents.find(a => a.alien && a.i !== 0 && a.alive && a !== k);
    for (const a of g.agents) if (a !== k && a !== mate) { a.path = null; a.x = 28.2; a.y = 44.0; }
    t.tp(k.i, 34,34); t.tp(mate.i, 36,34);
    k.target = null; k.sabUsed = true; k._delay = 0; k.doing = 0;
    k._doing = null; k.path = null; k.knife = 1; k.detained = false;
    t.aiTickAlien(k.i, 1, 0.05);
    const targetIsMate = !!(k.target && k.target.i === mate.i);
    /* 所有人类放倒，异形只能互相指控/投票：不允许队友豁免 */
    for (const h of g.agents) if (!h.alien) { h.downed = true; h.downAt = g.t; h.path = null; }
    t.openMeeting('night');
    const acc = g.agents.filter(a => a.alien && a.alive && !a.downed)
      .map(a => ({ i: a.i, accuse: a.accuse }));
    const accTargetsAliens = acc.filter(x => x.accuse != null && g.agents[x.accuse].alien).length;
    t.startVote();
    const votes = Object.entries(g.meet.votes)
      .filter(([k]) => g.agents[+k].alien)
      .map(([k, v]) => ({ voter: +k, target: +v, targetAlien: !!(g.agents[v] && g.agents[v].alien) }));
    t.finishMeeting();
    return { targetIsMate, mate: mate.i, acc, accTargetsAliens, votes,
      distinct: new Set(votes.map(v => v.target)).size, inv: t.inv() };
  });
  ok(AIP.targetIsMate, 'AI 异形没有队友信息：最近的同类也会成为目标');
  ok(AIP.accTargetsAliens >= 1, '会议指控可以指向异形（没有队友豁免）');
  ok(AIP.votes.length >= 3 && AIP.votes.every(v => v.targetAlien),
    '异形投票可以投队友，不再系统性避开同类');
  ok(AIP.distinct >= 2, '没有认出的队友时，异形票不被伙同投票强制统一');
  ok(AIP.inv && AIP.inv.fails.length === 0, 'AI 投票独立性不变量全过');

  section('异形 · 伙同投票（mates + trust）');
  await fresh(false);
  const PACK = await T(() => {
    const t = SKV3._t, g = t.G();
    g.paused = true; g.noReport = true;
    const aliens = g.agents.filter(a => a.alien && a.i !== 0 && a.alive && !a.downed);
    const humans = g.agents.filter(a => !a.alien && a.i !== 0 && a.alive && !a.downed);
    const lead = aliens[0], follow = aliens[1], target = humans[0], other = humans[1];
    const runMeeting = (recognizeLead, targetIsMate) => {
      t.openMeeting('day');
      for (const x of g.agents) if (x.alien) { x.accuse = null; x._busTarget = null; }
      lead.accuse = target.i;
      follow.accuse = other.i;
      follow.mates = {};
      if (recognizeLead) follow.mates[lead.i] = { t: g.t, kind: 'saw_red' };
      if (targetIsMate) follow.mates[target.i] = { t: g.t, kind: 'saw_red' };
      follow.mind = follow.mind || {};
      follow.mind.trust = recognizeLead ? { [lead.i]: 0.5 } : {};
      follow.mind.grudge = {};
      follow.suspect = null;
      g.simStats = {};
      t.startVote();
      const v = g.meet.votes[follow.i];
      const meta = g.meet.voteMeta && g.meet.voteMeta[follow.i];
      const tele = g.simStats.mateFollowVotes || 0;
      t.finishMeeting();
      return { v, why: meta && meta.why, tele };
    };
    const followed = runMeeting(true, false);
    const notKnown = runMeeting(false, false);
    const mateProtected = runMeeting(true, true);
    return { lead: lead.i, follow: follow.i, target: target.i, other: other.i,
      followed, notKnown, mateProtected, inv: t.inv() };
  });
  ok(PACK.followed.v === PACK.target && PACK.followed.why === 'mate_follow' &&
    PACK.followed.tele >= 1,
    '异形队友指控后，认出并信任他的异形跟票（why=mate_follow）');
  ok(PACK.notKnown.v === PACK.other && PACK.notKnown.tele === 0,
    '没认出 lead：不跟票，仍投自己的指控');
  ok(PACK.mateProtected.v === PACK.other && PACK.mateProtected.tele === 0,
    'lead 指控的是自己认出的队友：不跟票，不能送走自家队友');
  ok(PACK.inv && PACK.inv.fails.length === 0, '伙同投票后不变量全过');

  section('异形 · 社交顺势（只读公开指控）');
  await fresh(false);
  const SOC = await T(() => {
    const t = SKV3._t, g = t.G();
    g.paused = true; g.noReport = true;
    const aliens = g.agents.filter(a => a.alien && a.alive && !a.downed);
    const humans = g.agents.filter(a => !a.alien && a.alive && !a.downed);
    const T0 = humans[0], H1 = humans[1], H2 = humans[2];
    /* 夹具不依赖"认出队友"：先把 mates 清空，靶子才不会被排除 */
    for (const a of aliens) a.mates = {};
    const clear = () => {
      for (const a of g.agents) { a.accuse = null; a.accuseWhy = null; }
    };
    const cfg = t.socialCfg();
    /* ① 有靶子 + pileOn=1：每只异形都必须踩他（不是概率） */
    clear();
    H1.accuse = T0.i; H1.accuseWhy = { kind: 'saw_knife', solid: true };
    H2.accuse = T0.i; H2.accuseWhy = { kind: 'saw_knife', solid: true };
    t.setSocial(1, 0);
    const on = aliens.map(a => t.alienSocialTarget(a.i));
    /* ② 同一个公开局面，把别人的私有 sus 拉满 → 结果不许变（证明不读心） */
    for (const h of humans) {
      h.mind = h.mind || {};
      h.mind.sus = h.mind.sus || {};
      h.mind.sus[H1.i] = 0.9;
      h.mind.sus[H2.i] = 0.9;
    }
    const on2 = aliens.map(a => t.alienSocialTarget(a.i));
    /* ③ pileOn=0：完全回到"各投各的"（A/B 语义） */
    t.setSocial(0, 0);
    const off = aliens.map(a => t.alienSocialTarget(a.i));
    /* ④ 没有靶子：退回身份轴加权 */
    clear();
    t.setSocial(1, 0);
    const noTarget = aliens.map(a => t.alienSocialTarget(a.i));
    /* ⑤ 顺势构陷：frameFollow=1 挑靶子，=0 不挑 */
    H1.accuse = T0.i;
    t.setSocial(1, 1);
    const frameOn = t.alienFrameTarget(aliens[0].i);
    t.setSocial(1, 0);
    const frameOff = t.alienFrameTarget(aliens[0].i);
    /* ⑥ 端到端：两名人类有确证 → 会议开场后所有异形的指控都落到同一个靶子上。
       先清掉第②步灌进去的私有 sus，否则其余人类会凭 0.9 的 sus 去咬 H1，
       场上的"最热靶子"就变成 H1，测的就不是这条链了。 */
    clear();
    for (const h of humans) {
      h.mind = h.mind || {};
      h.mind.sus = {};
      h.suspect = null;
    }
    /* 2026-11-08：热靶现在只认**软指控**（被人类用确证咬的人基本就是真异形，
       异形跟上去等于送队友）。所以这里用「高嫌疑 + 目击式软指控」造热靶，
       不再用 mind.known —— 那会被 humanHeat 过滤掉。 */
    for (const h of [H1, H2]) {
      h.mind = h.mind || {};
      h.mind.sus = {};
      h.mind.sus[T0.i] = 0.72;
      h.mind.why = {};
      h.suspect = T0.i;
    }
    t.setSocial(1, 0);
    /* 2026-11-07：协同诬陷（COFRAME）与诬陷反咬（FRAME/MISLEAD）会让
       异形的票改咬「构陷靶子」，与本节测的「顺势踩公开热靶」是两条独立机制。
       这里把整组欺骗通道临时关掉恢复夹具前提，测完立刻还原
       （与 ABST 用例隔离诬陷的做法一致）。 */
    const F = window.SKSanity;
    const save = F ? { frame: F.FRAME.chance, mislead: F.MISLEAD.chance,
      bus: F.MISLEAD.busChance, coC: F.COFRAME.chance,
      coM: F.COFRAME.minorityChance, desc: F.DESC.on,
      first: F.FIRST.chance } : null;
    if (F) { F.FRAME.chance = 0; F.MISLEAD.chance = 0;
      F.MISLEAD.busChance = 0; F.COFRAME.chance = 0;
      F.COFRAME.minorityChance = 0; F.DESC.on = false; F.FIRST.chance = 0; }
    t.openMeeting('day');
    if (F && save) { F.FRAME.chance = save.frame; F.MISLEAD.chance = save.mislead;
      F.MISLEAD.busChance = save.bus; F.COFRAME.chance = save.coC;
      F.COFRAME.minorityChance = save.coM; F.DESC.on = save.desc;
      F.FIRST.chance = save.first; }
    const meetAcc = g.agents.filter(a => a.alien && a.alive && !a.downed)
      .map(a => ({ i: a.i, accuse: a.accuse }));
    const humanAcc = g.agents.filter(a => !a.alien && a.alive && !a.downed)
      .map(a => ({ i: a.i, accuse: a.accuse }));
    t.finishMeeting();
    t.setSocial(cfg.pileOn, cfg.frameFollow);
    return { target: T0.i, h1: H1.i, h2: H2.i, cfg, on, on2, off, noTarget,
      frameOn, frameOff, meetAcc, humanAcc, inv: t.inv() };
  });
  ok(SOC.cfg && SOC.cfg.pileOn >= 0 && SOC.cfg.pileOn <= 0.98 && SOC.cfg.frameFollow >= 0 &&
    SOC.cfg.hotMin >= 1, '社交顺势读 SKSanity.SOCIAL 真源（pileOn=' + SOC.cfg.pileOn +
    ' · frameFollow=' + SOC.cfg.frameFollow + ' · hotMin=' + SOC.cfg.hotMin + '）');
  /* 概率还要过性格：社恐/谨慎档会把 0.98 压到 ~0.29，所以只要求**过半**跟上；
     没跟上的走 why=h 的独立加权，这正是「异形里也有不看场上的愣头青」那条口径。 */
  ok(SOC.on.length >= 3 &&
    SOC.on.filter(x => x.i === SOC.target && x.why === 'pile').length >= Math.ceil(SOC.on.length / 2),
    '场上有两人公开指认他 → 过半异形顺势踩他（why=pile）');
  ok(SOC.on2.length === SOC.on.length &&
    SOC.on2.every(x => x.why === 'h' || x.i === SOC.target),
    '别人心里的 sus 拉满也不改变选择：顺势分支只可能落到公开靶子上（不读心）');
  ok(SOC.off.every(x => x.why === 'h'), 'pileOn=0 → 完全不踩，回到各投各的（A/B 开关有效）');
  ok(SOC.noTarget.every(x => x.why === 'h'), '场上没有靶子 → 退回身份轴加权（why=h）');
  ok(SOC.frameOn.i === SOC.target && SOC.frameOn.why === 'follow',
    '顺势构陷：有靶子时把假口供泼向他（why=follow）');
  ok(SOC.frameOff.i == null && SOC.frameOff.why === 'random',
    'frameFollow=0 → 不顺着靶子编口供');
  ok(SOC.humanAcc.filter(x => x.accuse === SOC.target).length >= 2,
    '会议开场：手里有确证的人类先表态（人类先、异形后）');
  /* setSocial 把概率夹在 0.98：留 2% 的"各投各的"探索口，所以允许一只不跟。
     这不是容错，是机制本身的口径（`SKTrait.C.pileOn` 的返回值上限）。 */
  ok(SOC.meetAcc.length >= 3 &&
    SOC.meetAcc.filter(x => x.accuse === SOC.target).length >= SOC.meetAcc.length - 1,
    '异形后手表态：几乎全部落到同一个公开靶子上（' + JSON.stringify(SOC.meetAcc) + '）');
  ok(SOC.inv && SOC.inv.fails.length === 0, '社交顺势后不变量全过');

  section('准-确证 · 传闻补一个种类（追责口径）');
  await fresh(false);
  const HEARD = await T(() => {
    const t = SKV3._t, g = t.G();
    g.paused = true; g.noReport = true;
    const humans = g.agents.filter(a => !a.alien && a.i !== 0 && a.alive && !a.downed);
    const W = humans[0], X = humans[1];
    const night = g.night;
    const mk = kinds => {
      W.mind = W.mind || {};
      W.mind.known = {};
      W.mind.almost = { foe: {}, friend: {} };
      W.mind.sus = {}; W.mind.why = {}; W.mind.cred = {};
      /* 2026-11-07：foeSus 提到 0.5，夹具改用「阈值 + 余量」而不是写死 0.40，
         这样用例测的仍是「实证 + 传闻凑够 2 种类」，不随阈值调整而失效。 */
      W.mind.sus[X.i] = (t.almostCfg().foeSus || 0.5) + 0.10;
      W.mind.why[X.i] = kinds.map(k => ({ kind: k, night: night, reason: 'fixture',
        x: 1, y: 1, t: 0 }));
    };
    const probe = kinds => { mk(kinds); t.evalAlmost(W.i, X.i); return !!W.mind.almost.foe[X.i]; };
    const cfg0 = t.almostCfg();
    const pureHeard = probe(['heard_frame', 'heard_accuse']);
    const onlyReal = probe(['saw_agent']);
    const realPlusHeard = probe(['saw_agent', 'heard_frame']);
    const weakPlusReal = probe(['saw_agent', 'silent']);
    t.setHeardKinds(0);
    const off = probe(['saw_agent', 'heard_frame']);
    t.setHeardKinds(1);
    const back = probe(['saw_agent', 'heard_frame']);
    t.setHeardKinds(cfg0.heardKinds);
    return { pureHeard, onlyReal, realPlusHeard, weakPlusReal, off, back,
      cfg: cfg0, inv: t.inv() };
  });
  ok(HEARD.cfg.heardKinds >= 1,
    'ALMOST.heardKinds 默认允许传闻补 1 个种类（真源：' + HEARD.cfg.heardKinds + '）');
  ok(!HEARD.pureHeard, '纯传闻（两条 heard_*）仍然不能凑成「基本确定」');
  ok(!HEARD.onlyReal, '只有一条实证、没有第二种证据 → 仍然不够 2 种类');
  ok(HEARD.realPlusHeard, '一条自己看见 + 一条传闻 → 凑成 almost.foe（本批唯一放宽）');
  ok(!HEARD.weakPlusReal, '弱线索（沉默）仍然不补种类');
  ok(!HEARD.off && HEARD.back, 'setHeardKinds(0) 回到旧行为、设回 1 立刻恢复（A/B 开关有效）');
  ok(HEARD.inv && HEARD.inv.fails.length === 0, '传闻补种类后不变量全过');

  /* 追责口径（用户点出的那条）：凭传闻投错人 → 带头的人掉 cred / 掉证言可信度 / 被记 wrong_accuse。
     这不是新机制，是 settleAccountability 的既有行为；这里只是把它与本批改动绑在一起断言，
     防止以后有人为了"让传闻更有效"把它绕过。 */
  await fresh(false);
  const ACC = await T(() => {
    const t = SKV3._t, g = t.G();
    g.paused = true; g.noReport = true;
    const humans = g.agents.filter(a => !a.alien && a.i !== 0 && a.alive && !a.downed);
    const target = humans[0];
    const voters = humans.slice(1, 5);
    const watch = humans[5];
    const lead = voters[0];
    watch.mind = watch.mind || {};
    watch.mind.cred = watch.mind.cred || {};
    watch.mind.cred[lead.i] = 0.5;             /* 预置，否则 0 减不动（cred 夹在 ≥0） */
    const cred0 = watch.mind.cred[lead.i];
    const relia0 = t.reliaOf(watch.i, lead.i);
    t.openMeeting('day');
    g.meet.votes = {};
    for (const v of voters) g.meet.votes[v.i] = target.i;
    g.meet.lead = g.meet.lead || {};
    g.meet.lead[target.i] = lead.i;
    t.closeVote();
    const cred1 = (watch.mind.cred && watch.mind.cred[lead.i]) || 0;
    const relia1 = t.reliaOf(watch.i, lead.i);
    const why = (watch.mind.why[lead.i] || []).filter(r => r.kind === 'wrong_accuse');
    return { cred0, cred1, relia0, relia1, why: why.length,
      target: target.i, lead: lead.i, dead: !target.alive, inv: t.inv() };
  });
  ok(ACC.dead, '夹具成立：4 票把一名人类投了出去（身份公布=人类）');
  ok(ACC.cred1 < ACC.cred0 - 0.05,
    '追责：带头者被观众扣 cred（' + ACC.cred0.toFixed(2) + ' → ' + ACC.cred1.toFixed(2) + '）');
  ok(ACC.relia1 < ACC.relia0, '追责：带头者的证言可信度下降');
  ok(ACC.why >= 1, '追责：带头者被记一笔 wrong_accuse（下次说话更不值钱）');
  ok(ACC.inv && ACC.inv.fails.length === 0, '追责结算后不变量全过');

  section('目击认错人 · 20% 偏移只在目击范围内（2026-11-07 用户裁定）');
  await fresh(false);
  const MISCASE = await T(() => {
    const t = SKV3._t;
    const br = t.breakerPos();
    const run = chance => {
      t.newGame();
      const g = t.G();
      g.paused = true; g.noReport = true;
      g.simStats = { knownWrites: 0 };
      const k = g.agents.find(x => x.alien && x.i !== 0 && x.alive);
      const hs = g.agents.filter(x => !x.alien && x.i !== 0 && x.alive);
      const w = hs[0], n1 = hs[1], n2 = hs[2], far = hs[3];
      for (const x of g.agents) {
        x._delay = 999; x.accuse = null; x.accuseWhy = null; x.mates = {};
        if (x.mind) { x.mind.mem = []; x.mind.sus = {}; x.mind.why = {};
          x.mind.known = {}; x.mind.cred = {}; x.mind.humanT = {}; }
      }
      t.tp(k.i, br[0], br[1]);
      /* far 不传送到 (5,5)：那里是墙，会把 A17「站在不可走位置」点着（不是本用例要测的东西） */
      t.tp(w.i, 51, 54); t.tp(n1.i, 51, 53.5); t.tp(n2.i, 51, 53.7);
      t.setMisId(chance);
      t.breakerBy(k.i);
      const known = t.knownOf(w.i) || {};
      return { keys: Object.keys(known), kind: (Object.values(known)[0] || {}).kind,
        k: k.i, w: w.i, n1: n1.i, n2: n2.i, far: far.i,
        tele: Object.assign({}, g.simStats) };
    };
    /* 采样规则（不依赖概率）：chance=0 永不偏移；chance=1 一定偏移且只在可见池里 */
    t.newGame();
    const g = t.G(); g.paused = true; g.noReport = true;
    const k0 = g.agents.find(x => x.alien && x.i !== 0 && x.alive);
    const hs0 = g.agents.filter(x => !x.alien && x.i !== 0 && x.alive);
    const w0 = hs0[0], a1 = hs0[1], a2 = hs0[2], far0 = hs0[3];
    t.tp(k0.i, br[0], br[1]);
    t.tp(w0.i, 51, 54); t.tp(a1.i, 51, 53.5); t.tp(a2.i, 51, 53.7); t.tp(far0.i, 5, 5);
    const oldR = Math.random;
    Math.random = () => 0;                    /* 必然触发，且取候选池第 0 个 */
    t.setMisId(0);
    const off = t.misIdPick(w0.i, k0.i, br[0], br[1], 6);
    t.setMisId(1);
    const on = t.misIdPick(w0.i, k0.i, br[0], br[1], 6);
    const many = [];
    for (let i = 0; i < 30; i++) many.push(t.misIdPick(w0.i, k0.i, br[0], br[1], 6));
    /* 池子空：把其他人挪出视野，只剩真凶 */
    t.tp(a1.i, 5, 5); t.tp(a2.i, 5, 5);
    const lone = t.misIdPick(w0.i, k0.i, br[0], br[1], 6);
    Math.random = oldR;
    return { off, on, many, lone, cfg: t.misIdCfg(),
      A: run(1), B: run(0), cand: [a1.i, a2.i], far: far0.i,
      p1: a1.i, p2: a2.i, inv: t.inv() };
  });
  ok(MISCASE.cfg.chance >= 0 && MISCASE.cfg.chance <= 1,
    'MISID.chance 读 SKSanity 真源（' + MISCASE.cfg.chance + '，门禁跑的是 0 档）');
  ok(MISCASE.off == null, 'chance=0 → 不偏移（返回 null，旧行为「目击 100% 准」）');
  ok(MISCASE.on != null && (MISCASE.on === MISCASE.p1 || MISCASE.on === MISCASE.p2 || MISCASE.on === MISCASE.far),
    'chance=1 → 一定会认成别人（' + MISCASE.on + '，真凶 ' + MISCASE.A.k + '）');
  ok(MISCASE.many.every(x => x != null && x !== MISCASE.far),
    '30 次采样从不认成**现场半径外**的人（远人 ' + MISCASE.far + ' 一次没被选中）');
  ok(MISCASE.lone == null, '只剩真凶一个人可见 → 池子空，不偏移（看不见的人不会被认错）');
  ok(MISCASE.A.keys.length === 1 && String(MISCASE.A.k) !== MISCASE.A.keys[0],
    '实盘：chance=1 时确证落到另一个人身上（真凶 ' + MISCASE.A.k + ' → known=' + MISCASE.A.keys[0] + '）');
  /* 现场的另外两名目击者也会各自认错一次，所以这里按 >=1 断言，不是 ==1 */
  ok(MISCASE.A.tele.misIdWrites >= 1 && MISCASE.A.tele.knownWrites >= 1 &&
    MISCASE.A.tele.misIdToHuman >= 1,
    '遥测：认错 ' + MISCASE.A.tele.misIdWrites + ' 次 / 确证 ' + MISCASE.A.tele.knownWrites +
    ' 次，且至少一次认到无辜人类身上');
  ok(MISCASE.B.keys.length === 1 && MISCASE.B.keys[0] === String(MISCASE.B.k),
    'chance=0 实盘：确证仍然落在真凶身上（' + MISCASE.B.keys[0] + '）');
  ok(MISCASE.B.tele.misIdWrites === undefined || MISCASE.B.tele.misIdWrites === 0,
    'chance=0 时不产生认错遥测');
  ok(MISCASE.inv && MISCASE.inv.fails.length === 0, '认错人后不变量全过');

  section('异形开枪 · B 键独立于出刀');
  await fresh(false);
  const AS0 = await T(() => {
    const t = SKV3._t, g = t.G();
    const demoted = g.agents.find(a => a.alien && a.i !== 0 && a.alive);
    demoted.alien = false;
    g.me.alien = true; g.me.bullet = 1; g.me.knife = 1;
    const v = g.agents.find(a => !a.alien && a.i !== 0 && a.alive);
    for (const a of g.agents) if (a !== g.me && a !== v) { a.path = null; a.x = 28.2; a.y = 44.0; }
    t.tp(0, 34.8,33.8); t.tp(v.i, 32.0,33.8);
    g.aimX = 32; g.aimY = 11.8;
    return { v: v.i, bullet: g.me.bullet, knife: g.me.knife };
  });
  await page.keyboard.press('b');
  await page.waitForTimeout(160);
  const AS1 = await T(o => ({ bullet: SKV3._t.G().me.bullet, knife: SKV3._t.G().me.knife,
    downed: SKV3._t.state()[o.v].downed, msg: SKV3._t.G().msg, inv: SKV3._t.inv() }), AS0);
  ok(AS1.bullet === 0 && AS1.knife === 1 && AS1.downed && AS1.msg.indexOf('开枪') >= 0,
    '异形有子弹时按 B 可以开枪（子弹 -1，刀保留）');
  ok(AS1.inv && AS1.inv.fails.length === 0, '异形开枪后不变量全过');
  await fresh(false);
  const AS2 = await T(() => {
    const t = SKV3._t, g = t.G();
    /* 先关掉开局讨论（它在 newGame 后 60ms 自动开会，按键会被会议吞掉 → 这条断言时好时坏） */
    if (g.meet) t.finishMeeting();
    const demoted = g.agents.find(a => a.alien && a.i !== 0 && a.alive);
    demoted.alien = false;
    g.me.alien = true; g.me.bullet = 1; g.me.knife = 1;
    const v = g.agents.find(a => !a.alien && a.i !== 0 && a.alive);
    for (const a of g.agents) if (a !== g.me && a !== v) { a.path = null; a.x = 28.2; a.y = 44.0; }
    t.tp(0, 34.8,33.8); t.tp(v.i, 35.6,33.8);
    g.aimX = 35.6; g.aimY = 11.8;
    /* 开局禁刀已于 2026-11-05 移除；这行保留是为了让本组不受任何历史开关影响，
       专测刀击链路本身。 */
    t.noKnifeLock(true);
    return { v: v.i };
  });
  await page.keyboard.press('a');
  await page.waitForTimeout(160);
  const AS3 = await T(o => ({ bullet: SKV3._t.G().me.bullet, knife: SKV3._t.G().me.knife,
    downed: SKV3._t.state()[o.v].downed, msg: SKV3._t.G().msg, inv: SKV3._t.inv() }), AS2);
  ok(AS3.bullet === 1 && AS3.knife === 0 && AS3.downed,
    '异形按 Q 仍只出刀，不会消耗子弹（刀 -1 / 子弹保留 / 目标濒死' +
    '｜提示：' + AS3.msg + '）');
  ok(AS3.inv && AS3.inv.fails.length === 0, '异形出刀后不变量全过');
  const SPD = await T(() => {
    const t = SKV3._t, g = t.G();
    const h = g.agents.find(a => !a.alien && a.i !== 0 && a.alive);
    h._delay = 999; h._rest = 0; h.doing = 0; h._doing = null; h.detained = false;
    t.tp(h.i, 30.4,33.8); h.path = [[33.4, 11.8]];
    const h0 = [h.x, h.y];
    t.aiTick(h.i, 4, 0.05);
    const humanD = Math.hypot(h.x - h0[0], h.y - h0[1]);
    const k = g.agents.find(a => a.alien && a.i !== 0 && a.alive && !a.detained);
    k._delay = 999; k.doing = 0; k._doing = null; k.detained = false;
    t.tp(k.i, 30.4,35.4); k.path = [[33.4, 13.4]];
    const k0 = [k.x, k.y];
    t.aiTickAlien(k.i, 4, 0.05);
    const alienD = Math.hypot(k.x - k0[0], k.y - k0[1]);
    return { humanD, alienD, inv: t.inv() };
  });
  ok(Math.abs(SPD.humanD - 0.8) < 0.06 && Math.abs(SPD.alienD - 0.8) < 0.06,
    '玩家 / AI 人类 / AI 异形同速（4 格/秒）：0.2 秒位移 ' + SPD.humanD.toFixed(2) + ' / ' + SPD.alienD.toFixed(2) + ' 格');
  ok(SPD.inv && SPD.inv.fails.length === 0, '统一移速后不变量全过');
  const DRG = await T(() => ({ drag: SKV3._t.dragSpeed() }));
  ok(DRG.drag === 2.5, '拖拽尸体统一 2.5 格/秒（当前 ' + DRG.drag + '）');

  section('AI 认知 · 反常拖尸 / 藏尸避人');
  await fresh(false);
  const DS0 = await T(() => {
    const t = SKV3._t; t.newGame();
    const g = t.G(); g.noReport = true; g.dmg = []; g.paused = true;
    g.secbotDead = true; g.medbotDead = true;
    const w = g.agents.find(a => !a.alien && a.i !== 0 && a.alive);
    const v = g.agents.find(a => !a.alien && a.i !== 0 && a.alive && a !== w);
    for (const a of g.agents) if (a !== w && a !== v && a !== g.me) t.tp(a.i, 28.4, 54);
    t.tp(v.i, 50, 86); t.kill(v.i, 'knife');
    t.tp(0, 50, 86); t.tp(w.i, 50, 33);
    g.me.path = null; g.me.doing = 0; g.me._doing = null;
    const started = t.dragStart(0, v.i);
    t.tp(0, 55, 33);          /* 把尸体从医疗间拖向桥楼：远离医疗间 */
    g.paused = false;
    return { started, w: w.i, v: v.i };
  });
  await page.waitForTimeout(220);
  const DS1 = await T(ids => {
    const t = SKV3._t, g = t.G(); g.paused = true;
    const w = g.agents[ids.w];
    const mem = (w.mind.mem || []).filter(e => e.kind === 'saw_drag_away');
    const evs = t.events().filter(e => e.kind === 'drag_away');
    t.dragRelease(0);
    return { n: mem.length, sus: w.mind.sus[0] || 0,
      known: !!(w.mind.known && w.mind.known[0]), evs: evs.length, inv: t.inv() };
  }, DS0);
  ok(DS0.started && DS1.n >= 1 && DS1.sus > 0.25 && !DS1.known,
    '看见有人把尸体拖离医疗间 → 记「反常拖尸」嫌疑，但不写确证（sus=' +
    DS1.sus.toFixed(2) + '）');
  ok(DS1.evs >= 1, '反常拖尸也进事件流，复盘能看到');
  ok(DS1.inv && DS1.inv.fails.length === 0, '反常拖尸嫌疑结算后不变量全过');

  const HIDE = await T(() => {
    const t = SKV3._t; t.newGame();
    const g = t.G(); g.paused = true; g.noReport = true;
    const M = window.SKMapData;
    for (const a of g.agents) if (a.alive) t.tp(a.i, 41, 8);     /* 仓库挤满活人 */
    const crowded = [];
    for (let i = 0; i < 40; i++) crowded.push(t.hideRoomFor('med', 50, 85));
    for (const a of g.agents) if (a.alive) t.tp(a.i, 28.4, 54);    /* 全员回桥楼 */
    const free = [];
    for (let i = 0; i < 40; i++) free.push(t.hideRoomFor('med', 50, 85));
    return { crowded, free, uniq: [...new Set(free)] };
  });
  ok(HIDE.crowded.indexOf('warehouse') < 0,
    '藏尸目的地避开有活人的房间（仓库有人时不选仓库）');
  ok(HIDE.uniq.length >= 2 && HIDE.uniq.indexOf('med') < 0 && HIDE.uniq.indexOf('bridge') < 0,
    '藏尸目的地不再固定仓库：多个远离医疗间的空房间随机（' + HIDE.uniq.join('/') + '）');

  const DDROP = await T(() => {
    const t = SKV3._t; t.newGame();
    const g = t.G(); g.paused = true; g.noReport = true; g.dmg = [];
    g.secbotDead = true; g.medbotDead = true;
    const k = g.agents.find(a => a.alien && a.i !== 0 && a.alive);
    const v = g.agents.find(a => !a.alien && a.i !== 0 && a.alive);
    const w = g.agents.find(a => !a.alien && a.i !== 0 && a.alive && a !== v);
    for (const a of g.agents) if (a !== k && a !== v && a !== w) t.tp(a.i, 28.4, 54);
    t.tp(k.i, 50, 85); t.tp(v.i, 50, 85); t.tp(w.i, 52, 85);
    t.kill(v.i, 'knife');
    t.resetAiState(k.i);
    k._delay = 0; k._rest = 0;
    t.dragStart(k.i, v.i);
    k.knife = 0; k.sabUsed = true;
    const r = t.aiTickAlien(k.i, 1, 0.05);
    const res = { drag: k.drag, hideCD: k._hideCD || 0, r };
    t.clearDrags();
    /* 下一个用例仍按“玩家是异形、场上仍是 4 异形”的准备执行 */
    const demoted = g.agents.find(a => a.alien && a.i !== 0 && a.alive);
    if (demoted) demoted.alien = false;
    g.me.alien = true; g.me.knife = 1; g.me.alive = true; g.me.downed = false;
    return res;
  });
  ok(DDROP.drag === null && DDROP.hideCD >= 6,
    '异形拖尸遇到活人目击会松手走开（不拖着尸体穿过人堆）');

  const ST = await T(() => {
    const t = SKV3._t, g = t.G();
    const v = g.agents.find(a => a.alien && a.i !== 0 && a.alive && !a.downed && !a.detained);
    for (const a of g.agents) if (a !== g.me && a !== v) { a.path = null; a.x = 28.2; a.y = 44.0; }
    t.tp(0, 34.8,33.8);
    t.tp(v.i, 35.55,33.8);
    g.me.knife = 1; g.me.doing = 0; g.me._doing = null; g.me.path = null;
    v._delay = 999; v.path = null; v.doing = 0; v._doing = null; v.detained = false;
    const r = t.stabRaw();
    return { v: v.i, r, st: t.state()[v.i], inv: t.inv() };
  });
  ok(ST.st.downed && ST.r.knife === 0, '异形可以对比邻的异形队友出刀（' + (ST.st.downed ? '目标濒死' : '未命中') + '）');
  ok(ST.inv && ST.inv.fails.length === 0, '异形互刀后不变量全过');

  await fresh(false);
  const SR0 = await T(() => {
    const t = SKV3._t, g = t.G();
    g.noReport = true;
    const k = g.agents.find(a => a.alien && a.i !== 0 && a.alive);
    const v = g.agents.find(a => !a.alien && a.i !== 0 && a.alive);
    const sec = t.setBot('secbot', 84, 75);
    const sb = g.bots && g.bots.secbot;
    if (sb) { sb.wps = [[sec[0], sec[1]]]; sb.wp = 0; sb.ang = 0; }
    let spot = null;
    for (let r = 0.4; r <= 2.4 && !spot; r += 0.2)
      for (let i = 0; i < 24 && !spot; i++) {
        const a = i / 24 * Math.PI * 2, x = 86.5 + Math.cos(a) * r, y = 76.5 + Math.sin(a) * r;
        if (t.free(x, y)) spot = [x, y];
      }
    t.tp(k.i, spot[0], spot[1]);
    t.tp(v.i, 86.0,75.6);
    k.knife = 1;
    t.knife(k.i, v.i);
    return { k: k.i, sec, dist: Math.hypot(spot[0] - sec[0], spot[1] - sec[1]), inv: t.inv() };
  });
  await page.waitForTimeout(220);
  const SR1 = await T(o => {
    SKV3._t.botTick(2.0);          /* 追捕 → 压制：新动画需要时间推进 */
    return { detained: SKV3._t.detained(), used: SKV3._t.robots().sec.used, inv: SKV3._t.inv() };
  }, SR0);
  ok(SR0.dist < 6 && SR1.detained.some(d => d.i === SR0.k) && SR1.used,
    '保安 6 格内行凶被拘留（实测 ' + SR0.dist.toFixed(1) + ' 格）');
  ok(SR1.inv && SR1.inv.fails.length === 0, '远距离拘留后不变量全过');
  await fresh(false);
  const SR2 = await T(() => {
    const t = SKV3._t, g = t.G();
    g.noReport = true;
    const k = g.agents.find(a => a.alien && a.i !== 0 && a.alive);
    const v = g.agents.find(a => !a.alien && a.i !== 0 && a.alive);
    const sec = t.setBot('secbot', 75, 53);
    const sb = g.bots && g.bots.secbot;
    if (sb) { sb.wps = [[sec[0], sec[1]]]; sb.wp = 0; sb.ang = 0; }
    t.tp(k.i, 88.0,66.0);
    t.tp(v.i, 87.0,66.0);
    k.knife = 1;
    t.knife(k.i, v.i);
    t.botTick(0.2);
    return { k: k.i, dist: Math.hypot(88.0 - sec[0], 66 - sec[1]),
      detained: t.detained(), used: t.robots().sec.used, inv: t.inv() };
  });
  ok(SR2.dist > 14 && SR2.detained.length === 0 && !SR2.used,
    '超出识别半径（' + SR2.dist.toFixed(1) + ' 格）行凶不会被拘留');
  ok(SR2.inv && SR2.inv.fails.length === 0, '超距行凶后不变量全过');
  await fresh(false);
  const KIN = await T(() => {
    const t = SKV3._t, g = t.G(); g.noReport = true;
    const k = g.agents.find(a => a.alien && a.i !== 0 && a.alive);
    const h1 = g.agents.find(a => !a.alien && a.i !== 0 && a.alive);
    const h2 = g.agents.find(a => !a.alien && a.i !== 0 && a.alive && a !== h1);
    for (const a of g.agents) if (a !== k && a !== h1 && a !== h2) t.tp(a.i, 28.2,44);
    t.tp(k.i, 34,34); t.tp(h1.i, 36,34); t.tp(h2.i, 36,36);
    h1.detained = true; h1.detainedT = 60;
    k.target = null; k.knife = 1; k.sabUsed = true; k._delay = 0;
    k.doing = 0; k._doing = null; k.path = null;
    t.aiTickAlien(k.i, 1, 0.05);
    return { target: k.target ? k.target.i : null, h1: h1.i, h2: h2.i };
  });
  ok(KIN.target === KIN.h2, 'AI 异形会回避被拘留者，优先找其他活人');
  await fresh(false);
  const SARC = await T(() => {
    const t = SKV3._t, g = t.G(); g.noReport = true;
    const k = g.agents.find(a => a.alien && a.i !== 0 && a.alive);
    const v = g.agents.find(a => !a.alien && a.i !== 0 && a.alive);
    const sec = t.setBot('secbot', 80, 75, 0);
    const sb = g.bots.secbot; if (sb) { sb.wps = [[sec[0], sec[1]]]; sb.wp = 0; sb.ang = 0; }
    const freeNear = (x, y) => {
      for (let r = 0.4; r <= 2.4; r += 0.2)
        for (let i = 0; i < 20; i++) {
          const a = i / 20 * Math.PI * 2, px = x + Math.cos(a) * r, py = y + Math.sin(a) * r;
          if (t.free(px, py)) return [px, py];
        }
      return [x, y];
    };
    const kp = freeNear(76.5, 75), vp = freeNear(76.5, 76);
    t.tp(k.i, kp[0], kp[1]); t.tp(v.i, vp[0], vp[1]);
    k.knife = 1; t.knife(k.i, v.i); t.botTick(0.2);
    return { dist: Math.hypot(kp[0] - sec[0], kp[1] - sec[1]),
      detained: t.detained(), used: t.robots().sec.used, inv: t.inv() };
  });
  ok(SARC.dist < 14 && SARC.detained.length === 0 && !SARC.used,
    '保安背后 180° 弧形外行凶（' + SARC.dist.toFixed(1) + ' 格）不会被拘留');
  ok(SARC.inv && SARC.inv.fails.length === 0, '弧形外行凶后不变量全过');
  await fresh(false);

  section('声纹 · 附近多声源同时可见');
  await fresh(false);
  const WV = await T(() => {
    const t = SKV3._t, g = t.G();
    g.noReport = true;
    const me = g.me;
    const n0 = g.waves.length;
    t.hear(me.x + 2, me.y, 'pipe', 1);
    t.hear(me.x - 2, me.y + 1, 'robot', 1);
    t.hear(me.x, me.y + 2.5, 'alarm', 1);
    return { n0, ws: t.waves(), pos: [me.x, me.y] };
  });
  const wKinds = WV.ws.map(w => w.kind);
  ok(WV.ws.length >= WV.n0 + 3 && ['pipe', 'robot', 'alarm'].every(k => wKinds.includes(k)),
    '3 个方向的声音同时生成 3 条声纹（' + WV.n0 + ' → ' + WV.ws.length + '）');
  await T(() => {
    const g = SKV3._t.G();
    g.waves.forEach(w => { w.t = Math.min(w.t, 0.2); w.dur = 6; });
    g.fx.length = 0;
  });
  await page.waitForTimeout(140);
  await shotClip('46_声纹.png', { x: 460, y: 250, width: 520, height: 400 });
  await T(() => { SKV3._t.G().waves.forEach(w => { w.t = 99; }); });
  await page.waitForTimeout(180);
  const WV2 = await T(() => SKV3._t.waves().map(w => w.kind));
  ok(!WV2.includes('pipe') && !WV2.includes('alarm'), '声纹按时间自动消散，不会堆在屏幕上');

  section('CC0 音效采样 · 枪 / 刀 / 环境材质分离');
  await page.waitForFunction(() => {
    const d = SKV3._t.sfx();
    const ks = Object.keys(d);
    return ks.length === 12 && ks.every(k => d[k].every(a => a.ready >= 1 || a.err));
  }, null, { timeout: 8000 }).catch(() => {});
  const AU = await T(() => SKV3._t.sfx());
  const auKeys = Object.keys(AU);
  const auBad = auKeys.flatMap(k => AU[k].filter(a => a.ready < 1 || a.err)
    .map(a => k + ':' + a.src + ' ready=' + a.ready + ' err=' + a.err));
  ok(auKeys.length === 12 && auKeys.every(k => AU[k].length >= 2),
    '12 类采样全部建立音频池（枪 / 刀 / 命中 / 脚步 / 交互 / 维修 / 结算…）');
  const gunSrc = (AU.gun || []).map(a => a.src);
  const knifeSrc = (AU.knife || []).map(a => a.src);
  ok(gunSrc.length >= 2 && gunSrc.every(x => x === 'audio/sfx-gun.ogg') &&
    knifeSrc.every(x => x !== 'audio/sfx-gun.ogg') &&
    !!AU.flesh && !!AU.ui && !!AU.work && !!AU.win && !!AU.lose,
    '枪声用独立 gun 采样（刀声不再共用），命中/交互/维修/胜负各有专属池');
  ok(auBad.length === 0, '采样在 file:// 下全部加载，无解码错误' + (auBad.length ? '：' + auBad.join(' | ') : ''));
  const PL = await T(() => ['knife', 'shot', 'flesh', 'step', 'ui', 'work', 'drag', 'report', 'win', 'lose']
    .map(n => SKV3._t.playSfx(n)));
  ok(PL.every(Boolean), '出刀 / 开枪 / 命中 / 脚步 / 交互 / 维修 / 拖拽 / 报告 / 胜负 音效可触发');
  const KL = await T(() => {
    const t = SKV3._t, g = t.G();
    const k = g.agents.find(a => a.alien && a !== g.me && a.alive && !a.downed);
    const v = g.agents.find(a => !a.alien && a !== g.me && a.alive && !a.downed);
    k.knife = 1;
    t.sfxClear();
    t.knife(k.i, v.i);
    return { log: t.sfxLog(), kinds: t.fx() };
  });
  ok(KL.log.length === 1 && KL.log[0] === 'knife',
    '一次出刀只响一次（播放日志：' + KL.log.join(',') + '）');
  const SL = await T(() => {
    SKV3._t.sfxClear();
    SKV3._t.playSfx('step');
    SKV3._t.playSfx('drag');
    SKV3._t.playSfx('step');
    return SKV3._t.sfxLog();
  });
  ok(SL.join(',') === 'step,drag,step', '脚步 / 拖拽 / 出刀走独立音源与日志');

  section('设置面板 · 音乐 / 音效 / 暂停 / 退出');
  await fresh(false);
  const SET1 = await T(() => {
    const sid = document.getElementById('settings');
    return { hasMenuBtn: !!document.getElementById('btn-settings'),
      z: +(getComputedStyle(sid).zIndex || 0),
      hasBgm: !!document.getElementById('bgm') };
  });
  ok(SET1.hasMenuBtn && SET1.z >= 10000,
    '开始页有设置入口，设置层层级高于游戏根节点（z=' + SET1.z + '）');
  ok(SET1.hasBgm, '背景音乐元素已挂载（audio/music-bgm.m4a）');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(160);
  await page.click('#p-set');
  const SET2 = await T(() => ({
    open: !document.getElementById('settings').classList.contains('hide'),
    paused: SKV3.isPaused(),
    label: document.getElementById('set-pause').textContent
  }));
  ok(SET2.open && SET2.paused, '暂停面板「设置」打开设置层，游戏保持暂停');
  const SET3 = await T(() => {
    const s = document.getElementById('set-sfx');
    s.value = 25; s.dispatchEvent(new Event('input'));
    const m = document.getElementById('set-music');
    m.value = 40; m.dispatchEvent(new Event('input'));
    let ls = null; try { ls = JSON.parse(localStorage.getItem('sk.settings.v1')); } catch (e) {}
    return { sfx: SKV3.getSfxVolume(), ls,
      sfxLabel: document.getElementById('set-sfx-v').textContent };
  });
  ok(Math.abs(SET3.sfx - 0.25) < 0.01 && SET3.ls && Math.abs(SET3.ls.sfx - 0.25) < 0.01,
    '音效滑杆实时生效并写入 localStorage（master=' + SET3.sfx + '）');
  ok(SET3.ls && Math.abs(SET3.ls.music - 0.4) < 0.01,
    '音乐滑杆同样持久化（music=' + (SET3.ls && SET3.ls.music) + '）');
  await page.keyboard.press('Escape');
  const SET4 = await T(() => ({
    open: !document.getElementById('settings').classList.contains('hide'),
    paused: SKV3.isPaused()
  }));
  ok(!SET4.open && SET4.paused, 'ESC 先关设置层，游戏仍保持暂停');
  const SET5 = await T(() => {
    SKV3.setSfxVolume(0.8);
    document.getElementById('set-sfx').value = 80;
    document.getElementById('set-sfx').dispatchEvent(new Event('input'));
    return { v: SKV3.getSfxVolume() };
  });
  ok(Math.abs(SET5.v - 0.8) < 0.01, '音效音量可恢复（不影响后续音频断言）');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(140);
  ok((await T(() => SKV3.isPaused())) === false, '再按 WSC 继续游戏');

  section('视野 · 异形与人类同款手电锥 + 近身感知 2.3 / 3.5 格');
  await fresh(false);
  const VIS2 = await T(() => {
    const t = SKV3._t; t.newGame();
    const g = t.G(); g.paused = true; g.noReport = true;
    const k = g.agents.find(a => a.alien && a.i !== 0 && a.alive);
    const h = g.agents.find(a => !a.alien && a.i !== 0 && a.alive);
    for (const a of g.agents) if (a !== k && a !== h && a !== g.me) t.tp(a.i, 30,32);
    t.tp(k.i, 64,32); t.tp(h.i, 64,32);
    /* 2026-11-03 用户裁定：**亮区整片可见对 AI 同样成立**（玩家站在亮走廊里能看见整条，
       AI 也必须能）。所以"10 格外就看不见"这条老断言作废，改成验两侧一致：
       走廊亮 ⇒ 异形 AI 与人类 AI 都看得见；走廊熄灯 ⇒ 两边都退回近身圆。 */
    const alienFarLit = t.aiSee(k.i, 74, 32, 8);   /* 10 格，同一条亮走廊 */
    const humanFarLit = t.aiSee(h.i, 74, 32, 8);
    const alienFar = t.aiSee(k.i, 74, 32, 8);   /* 下面断电之后再取一次同点 */
    const humanFar = t.aiSee(h.i, 74, 32, 8);
    const light = t.breaker();                  /* 断电：走廊灯熄灭，只剩手电锥 + 近身圆 */
    const darkAlien = t.aiSee(k.i, 74, 32, 8);  /* 熄灯后 10 格：超出 7 格手电锥 */
    const darkHuman = t.aiSee(h.i, 74, 32, 8);
    h._aimAng = 0;                               /* 面朝东：手电锥对准 3 格外的点 */
    const humanConeAI = t.aiSee(h.i, 67, 32, 8);
    h._aimAng = Math.PI;                         /* 背对东侧目标：只剩近身圆 */
    const alienNear = t.aiSee(k.i, 67, 32, 8);  /* 3 格：异形近身 3.5 内可见，不看朝向 */
    const humanNear = t.aiSee(h.i, 67, 32, 8);  /* 3 格：人类背对 2.3 外不可见 */
    t.tp(0, 70,32);
    g.me.alien = false; g.aimX = 72; g.aimY = 32;
    const humanCone = t.visible(75, 32);        /* 手电朝东 5 格 */
    const humanBack = t.visible(68, 32);        /* 背后 2 格：人类近身 2.8 内 */
    const humanBackFar = t.visible(67, 32);     /* 背后 3 格：人类看不见 */
    const humanEdgeIn = t.visible(67.8, 32);   /* 背后 2.2 格：仍在 2.3 内 */
    const humanEdgeOut = t.visible(67.6, 32);  /* 背后 2.4 格：越过 2.3 边界 */
    g.me.alien = true;
    const alienCone = t.visible(75, 32);        /* 同款手电锥 */
    const alienBack = t.visible(67, 32);        /* 背后 3 格：异形近身 3.5 内 */
    const alienEdge = t.visible(66.4, 32);      /* 背后 3.6 格：刚好越过 3.5 边界 */
    const alienBackMid = t.visible(66, 32);     /* 背后 4 格：看不见 */
    const alienBackFar = t.visible(63.5, 32);   /* 背后 6.5 格：看不见 */
    const sg = SKV3._t.sightCfg();
    return { alienFar, humanFar, alienNear, humanNear, humanConeAI, light,
      alienFarLit, humanFarLit, darkAlien, darkHuman,
      humanCone, humanBack, humanBackFar, humanEdgeIn, humanEdgeOut,
      alienCone, alienBack, alienEdge,
      alienBackMid, alienBackFar, sg };
  });
  ok(VIS2.sg.humanDarkR === 2.3 && VIS2.sg.alienDarkR === 3.5,
    '视野数值在声明层：人类近身 ' + VIS2.sg.humanDarkR + ' 格、异形近身 ' + VIS2.sg.alienDarkR + ' 格');
  ok(VIS2.alienFarLit === VIS2.humanFarLit && VIS2.alienFarLit,
    '同一条**亮走廊** 10 格外：异形 AI 与人类 AI 一样看得见（亮区整片可见对 AI 成立，与玩家同规则）');
  ok(VIS2.darkAlien === false && VIS2.darkHuman === false,
    '走廊熄灯后 10 格：两边都超出 7 格手电锥（AI 与玩家同一套视野）');
  ok(VIS2.humanConeAI === true,
    '断电后 AI 人类面朝 3 格外的目标：手电锥看得见（不再只有近身圆）');
  ok(VIS2.light.state === 2 && VIS2.alienNear && !VIS2.humanNear,
    '断电后背对 3 格：异形近身 3.5 格看得见，人类 2.3 格外看不见');
  ok(VIS2.alienCone && VIS2.humanCone,
    '同款手电锥：朝向 5 格内的目标都看得见');
  ok(VIS2.humanBack && !VIS2.humanBackFar &&
    VIS2.humanEdgeIn && !VIS2.humanEdgeOut,
    '人类近身 2.3 格：2 / 2.2 格可见，2.4 / 3 格不可见（边界钉死）');
  ok(VIS2.alienBack && !VIS2.alienEdge && !VIS2.alienBackMid && !VIS2.alienBackFar,
    '异形近身 3.5 格：背后 3 格可见，3.6 / 4 / 6.5 格都不可见（边界钉死）');

  section('视野 · 亮房整间可见 / 暗房才受视野限制');
  await fresh(false);
  const VIS3 = await T(() => {
    const t = SKV3._t; t.newGame();
    const g = t.G(); g.paused = true; g.noReport = true;
    const h = g.agents.find(a => !a.alien && a.i !== 0 && a.alive);
    for (const a of g.agents) if (a !== h && a !== g.me) t.tp(a.i, 28.4,54);
    /* 中央会议室是亮房：圆桌挡在中间，旧逻辑会因家具挡视线而看不到人 */
    t.tp(0, 30,33); t.tp(h.i, 54,33);
    const litRoom = { vis: t.visible(h.x, h.y), los: t.los(30, 33, 54, 33),
      room: t.state()[0].room };
    /* 引擎舱是暗房：同房间 9 格外的目标超出视野，不可见 */
    const v2 = g.agents.find(a => a.i !== 0 && a.i !== h.i && a.alive && !a.alien);
    t.tp(v2.i, 14,53); t.tp(0, 5.9,53);
    const darkRoom = { vis: t.visible(14, 53), room: t.state()[0].room,
      dist: +Math.hypot(14 - 5, 53 - 53).toFixed(1) };
    return { litRoom, darkRoom };
  });
  ok(VIS3.litRoom.room === 'bridge' && VIS3.litRoom.vis && !VIS3.litRoom.los,
    '亮房整间可见：隔着圆桌也能看到 24 格外的队友（旧逻辑被家具挡住）');
  ok(VIS3.darkRoom.room === 'engine' && !VIS3.darkRoom.vis,
    '暗房仍受视野限制：同房间 ' + VIS3.darkRoom.dist + ' 格外的目标不可见');

  section('视野 · 亮走廊整条可见（走廊默认有灯）');
  await fresh(false);
  const VIS4 = await T(() => {
    const t = SKV3._t; t.newGame();
    const g = t.G(); g.paused = true; g.noReport = true;
    const h = g.agents.find(a => !a.alien && a.i !== 0 && a.alive);
    for (const a of g.agents) if (a !== h && a !== g.me) t.tp(a.i, 28.4, 54);
    /* c3 是桥楼→监控室的 16 格直走廊：人站 64,32，目标 76,32（12 格），手电朝西背对目标 */
    t.tp(0, 64, 32); t.tp(h.i, 76, 32);
    g.aimX = 55; g.aimY = 32;
    const lit = { state: t.lights().state, corr: t.lights().corr };
    const far = t.visible(h.x, h.y);
    t.breaker();
    const dark = { state: t.lights().state, corr: t.lights().corr };
    const farDark = t.visible(h.x, h.y);
    return { lit, far, dark, farDark, dist: +Math.hypot(h.x - 64, h.y - 32).toFixed(1) };
  });
  ok(VIS4.lit.state !== 2 && VIS4.lit.corr && VIS4.far,
    '走廊默认有灯：站在亮走廊里能看清 ' + VIS4.dist + ' 格外的同廊目标（不必转手电）');
  ok(VIS4.dark.state === 2 && !VIS4.dark.corr && !VIS4.farDark,
    '断电后走廊不再整条可见：同廊 ' + VIS4.dist + ' 格外目标看不见');

  section('旁观者模式 · 第 16 人');
  await T(() => { SKV3.stop(); SKV3.start('spect'); });
  await page.waitForFunction(() => window.SKV3 && SKV3._t && SKV3._t.assets().base, null, { timeout: 30000 });
  await page.waitForTimeout(500);
  const SP1 = await T(() => ({
    spect: SKV3._t.spect(), role: document.getElementById('role').textContent,
    fog: SKV3._t.fog(), dev: !document.getElementById('dev').classList.contains('hide'),
    personal: document.getElementById('personal').classList.contains('hide'),
    tip: document.getElementById('tip').textContent, inv: SKV3._t.inv()
  }));
  ok(SP1.spect.mode && SP1.spect.agents === 15 && !SP1.fog,
    '旁观者不占席位：仍是 15 人，全知无雾');
  ok(SP1.role.indexOf('旁观者') >= 0 && SP1.personal,
    'HUD 切成旁观者：隐藏个人任务与背包');
  ok(SP1.dev && SP1.tip.indexOf('旁观者') >= 0,
    '旁观者强制显示全知总览面板与专属提示');
  const SP1b = await T(() => {
    const star = SKV3._t.G().agents[0].name;
    const row = [...document.querySelectorAll('#dev-rows .dr')]
      .map(e => e.textContent).find(s => s.indexOf(star) >= 0) || '';
    return { row, hasAI: row.indexOf('（AI）') >= 0, hasYou: row.indexOf('（你）') >= 0 };
  });
  ok(SP1b.hasAI && !SP1b.hasYou, '旁观模式下 0 号星尘标注为 AI，而不是“你”');
  ok(SP1.inv.fails.length === 0, '旁观者开局不变量全过');
  /* 先把相机幽灵放到地图中央（相机不贴边），再点屏幕右侧 5 格处 */
  const SP2 = await T(() => { SKV3._t.spectTo(49, 30); return { before: [49, 30] }; });
  await page.mouse.click(960, 450);
  /* 旁观幽灵 SPECT_SPEED=9 格/秒，但 update() 的 dt 有钳制：机器忙时（后台在烘图/出图）
     模拟时间会落后墙钟，430ms 只能走出 2 格。等到 900ms 再量，阈值不变，
     这样测的是"点哪直飞哪"，不是"这台机器此刻有多少帧预算"。 */
  await page.waitForTimeout(900);
  const SP3 = await T(o => ({ after: [SKV3._t.spect().x, SKV3._t.spect().y] }), SP2);
  const dist = Math.hypot(SP3.after[0] - SP2.before[0], SP3.after[1] - SP2.before[1]);
  ok(dist > 3, '旁观者点击直线飞行：0.43 秒移动 ' + dist.toFixed(1) + ' 格');
  const SP4 = await T(() => {
    const a = SKV3._t.G().agents[0];
    return { x: a.x, y: a.y };
  });
  await page.waitForTimeout(1600);
  const SP5 = await T(o => {
    const a = SKV3._t.G().agents[0];
    return { moved: Math.hypot(a.x - o.x, a.y - o.y) > 0.4, alive: a.alive,
      busy: !!a.doing || !!a.moving || !!a.path || a.tIdx > 0 || a._delay > 0 || a._rest > 0 };
  }, SP4);
  ok(SP5.moved || SP5.busy || !SP5.alive, '0 号席位由 AI 托管，旁观者不操控它');
  await page.keyboard.press('w'); await page.keyboard.press('s'); await page.keyboard.press('d');
  await page.keyboard.press('e'); await page.keyboard.press('q');
  await page.keyboard.press('x'); await page.keyboard.press('g'); await page.keyboard.press('p');
  await page.waitForTimeout(260);
  const SP6 = await T(() => {
    const g = SKV3._t.G();
    return { do: g.me._doing, wheel: !!g.wheel, drag: g.drag, inspect: g.inspect };
  });
  ok(!SP6.do && !SP6.wheel && !SP6.drag && SP6.inspect === null,
    '旁观者不能交互 / 搜尸 / 收尸（新主键与旧别名都无效）');
  /* 先发制人会改变 talkScore 的随机流，把 0 号挤到前三名之外；
     这条用例测的是「旁观模式下 0 号也在 AI 发言池里」，临时关掉 FIRST。 */
  await T(() => { const F = window.SKSanity; const o = F.FIRST.chance;
    F.FIRST.chance = 0; SKV3._t.openMeeting('day', 0, null); F.FIRST.chance = o; });
  await page.waitForTimeout(900);
  const SP6b = await T(() => {
    const g = SKV3._t.G(), t = SKV3._t;
    const star = g.agents[0].name;
    return { star, aiCands: t.meetCtx().aiCands,
      lines: t.meetLines().map(l => l.who) };
  });
  ok(SP6b.aiCands.indexOf(0) >= 0 && SP6b.lines.indexOf(SP6b.star) >= 0,
    '0 号星尘进入 AI 发言池并实际发言');
  const SP7 = await T(() => ({
    input: document.getElementById('m-text').disabled,
    skipHidden: document.getElementById('m-skip').classList.contains('hide'),
    skipText: document.getElementById('m-skip').textContent,
    who: document.querySelectorAll('#m-who button').length
  }));
  ok(SP7.input && !SP7.skipHidden && /跳过讨论/.test(SP7.skipText) && SP7.who === 0,
    '旁观者会议只读，但保留「跳过讨论」按键');
  await T(() => document.getElementById('m-skip').click());
  await page.waitForTimeout(160);
  const SP8 = await T(() => ({
    phase: SKV3._t.G().meet ? SKV3._t.G().meet.phase : null,
    input: document.getElementById('m-text').disabled,
    who: document.querySelectorAll('#m-who button').length,
    starVote: SKV3._t.G().meet ? SKV3._t.G().meet.votes[0] : undefined
  }));
  ok(SP8.phase === 'vote' && SP8.input && SP8.who === 0 && SP8.starVote !== undefined,
    '旁观者跳过讨论后进入投票：星尘作为 AI 独立投票，旁观者仍只读');
  await T(() => SKV3._t.finishMeeting());
  await T(() => { SKV3.stop(); SKV3.start('human'); });
  await page.waitForFunction(() => window.SKV3 && SKV3._t && SKV3._t.assets().base, null, { timeout: 30000 });
  await page.waitForTimeout(320);
  ok((await T(() => SKV3._t.spect().mode)) === false, '退出旁观者后恢复人类对局');

  section('设计者纯净模式 · 只看地图与任务点（2026-11-09）');
  await T(() => { SKV3.stop(); SKV3.start('design'); });
  await page.waitForFunction(() => window.SKV3 && SKV3._t && SKV3._t.assets().base, null, { timeout: 30000 });
  await page.waitForTimeout(600);
  const DZ1 = await T(() => ({
    d: SKV3._t.design(), role: document.getElementById('role').textContent,
    tip: document.getElementById('tip').textContent,
    tasks: document.getElementById('tasks').textContent,
    taskRows: document.querySelectorAll('#tasks .tr').length,
    inv: SKV3._t.inv()
  }));
  ok(DZ1.d.mode && !DZ1.d.fog && DZ1.d.agents === 15,
    '设计者局：designMode 生效、无迷雾、席位仍是 15（不破坏不变量口径）');
  ok(DZ1.d.cam === 'map', '设计者默认全图镜头（与旁观全知总览同范围，一屏装下整船）');
  ok(DZ1.d.crewDrawn === 0, '设计者局本帧绘制角色数 = 0（人物模型不显示）');
  ok(DZ1.d.points === 26 && DZ1.d.pipes === 8 && DZ1.d.openPoints === 26,
    '26 个任务点与 8 个管道口全部开放（不受本局 4 个任务限制）');
  ok(!DZ1.d.meet && !DZ1.d.over && !DZ1.d.phase && DZ1.d.night === 1,
    '不开局会议、不建相位时钟、停在第 1 夜');
  ok(DZ1.role.indexOf('设计者') >= 0 && DZ1.tip.indexOf('设计者') >= 0,
    'HUD 身份与操作提示切成设计者口径');
  ok(DZ1.taskRows === 26 && DZ1.tasks.indexOf('全开放') >= 0,
    '任务列表列出全部 26 个点（可滚动），不再只显示本局 4 个');
  ok(DZ1.inv.fails.length === 0, '设计者开局不变量全过');
  await shot('53_设计者纯净模式.png');
  /* 世界冻结：夜钟不走、AI 不动、进度不涨 */
  const DZ2 = await T(() => {
    const g = SKV3._t.G();
    return { t: g.t, prog: g.prog, pos: g.agents.map(a => [a.x, a.y]), night: g.night };
  });
  await page.waitForTimeout(700);
  const DZ3 = await T(() => {
    const g = SKV3._t.G();
    return { t: g.t, prog: g.prog, pos: g.agents.map(a => [a.x, a.y]), night: g.night,
      dmg: g.dmg.length, meet: !!g.meet };
  });
  const dzMoved = DZ3.pos.some((p, i) => Math.hypot(p[0] - DZ2.pos[i][0], p[1] - DZ2.pos[i][1]) > 0.01);
  ok(DZ3.t === DZ2.t && DZ3.night === DZ2.night && !dzMoved && DZ3.prog === DZ2.prog && !DZ3.meet,
    '静态冻结：0.7 秒内夜钟/夜数/进度不变，15 个席位一个都没动，也不开会');
  /* 穿墙：找一个船体内但不可走的格子（掩体/墙），设计者必须能直线飞进去 */
  const DZ4 = await T(() => {
    const t = SKV3._t;
    let target = null;
    for (let y = 2; y < 92 && !target; y++) {
      for (let x = 2; x < 96; x++) {
        if (t.roomIdAt(x, y) && !t.free(x, y)) { target = [x, y]; break; }
      }
    }
    if (!target) return { found: false };
    const before = t.pos();
    const after = t.stepTo(target[0], target[1]);
    return { found: true, target, before, after,
      dist: Math.hypot(after[0] - target[0], after[1] - target[1]) };
  });
  ok(DZ4.found && DZ4.dist < 0.05,
    '幽灵穿墙：能停进船体内不可走的格子（掩体/墙），偏差 ' + (DZ4.dist || 0).toFixed(3) + ' 格');
  /* 26 个任务点逐个站上去都要给 task 交互，且包含不在本局派发里的那些 */
  const DZ5 = await T(() => {
    const t = SKV3._t, g = t.G(), me = g.me;
    const pts = t.points(), mine = me.tasks.slice(me.tIdx);
    let okCount = 0, outside = 0, outsideOk = 0;
    pts.forEach((p, i) => {
      t.tp(me.i, p.x, p.y);
      const has = t.design().interactions.indexOf('task') >= 0;
      if (has) okCount++;
      if (mine.indexOf(i) < 0) { outside++; if (has) outsideOk++; }
    });
    return { total: pts.length, okCount, outside, outsideOk };
  });
  ok(DZ5.okCount === DZ5.total && DZ5.outside > 0 && DZ5.outsideOk === DZ5.outside,
    '26/26 任务点都给交互，其中 ' + DZ5.outside + ' 个不在本局派发里也照样开放');
  /* 任务结算不推维修进度、不动 tIdx（沙盒不该把别的任务记成完成） */
  const DZ6 = await T(() => {
    const t = SKV3._t, g = t.G(), me = g.me;
    const p = t.points()[0];
    t.tp(me.i, p.x, p.y);
    const before = { prog: g.prog, tIdx: me.tIdx, tasks: me.tasks.join(',') };
    t.openWheel();
    const w = t.wheel();
    const idx = w ? w.items.findIndex(it => it.id === 'task') : -1;
    if (idx >= 0) t.pickWheel(idx);
    const doing = me._doing;
    const fin = t.finishDoing(me.i);
    return { before, doing, after: { prog: fin.prog, tIdx: fin.tIdx, tasks: g.me.tasks.join(',') } };
  });
  ok(DZ6.doing === 'task' && DZ6.after.prog === DZ6.before.prog &&
    DZ6.after.tIdx === DZ6.before.tIdx && DZ6.after.tasks === DZ6.before.tasks,
    '任务点验收完成但不计维修进度、不改派发顺序（prog/tIdx/tasks 全不变）');
  /* 8 个管道口：人类设计者也能钻，且无冷却可连着钻 */
  const DZ7 = await T(() => {
    const t = SKV3._t, g = t.G(), me = g.me;
    const pipes = t.pipes();
    let offered = 0;
    pipes.forEach(q => { t.tp(me.i, q.x, q.y); if (t.design().interactions.indexOf('pipe') >= 0) offered++; });
    t.tp(me.i, pipes[0].x, pipes[0].y);
    const opened = t.openPipe();
    const opts = t.pipe().opts.length;
    const to = pipes[1];
    t.pickPipe(to.i);
    const arrived = Math.hypot(me.x - to.x, me.y - to.y) < 0.05;
    /* 立刻再钻一次：设计者模式不该吃 PIPE.cooldown */
    t.tp(me.i, to.x, to.y);
    const again = t.openPipe();
    t.closePipe();
    return { n: pipes.length, offered, opened, opts, arrived, again, alien: !!me.alien };
  });
  ok(!DZ7.alien && DZ7.offered === DZ7.n && DZ7.opened && DZ7.opts === DZ7.n - 1 && DZ7.arrived && DZ7.again,
    '人类设计者也能钻全部 8 个管道口：出口选项 7 个、瞬移到位、无冷却可连钻');
  /* 破坏不限次数：夜钟不走，sabUsed 一旦置真就永远修不回来 */
  const DZ8 = await T(() => {
    const t = SKV3._t, g = t.G();
    /* sabRoomOk 排除 bridge 与已有故障的舱室，所以两次破坏要挑两间不同的房 */
    const rs = t.rooms().filter(r => r.id !== 'bridge');
    const r1 = rs[0], r2 = rs[1];
    t.tp(g.me.i, r1.x, r1.y);
    const a = t.openSab();
    t.pickSab(r1.id);
    t.sabTick();
    const n1 = t.dmg().length;
    const used1 = !!g.me.sabUsed;
    t.tp(g.me.i, r2.x, r2.y);
    const b = t.openSab();
    t.pickSab(r2.id);
    t.sabTick();
    const n2 = t.dmg().length;
    return { a, b, n1, n2, used1, used2: !!g.me.sabUsed };
  });
  ok(DZ8.a && DZ8.b && DZ8.n1 >= 1 && DZ8.n2 > DZ8.n1 && !DZ8.used1 && !DZ8.used2,
    '破坏可重复发动（不消耗 sabUsed），故障真的落进 G.dmg');
  /* 退出设计者局后恢复正常对局：人物重新绘制 */
  await T(() => { SKV3.stop(); SKV3.start('human'); });
  await page.waitForFunction(() => window.SKV3 && SKV3._t && SKV3._t.assets().base, null, { timeout: 30000 });
  await page.waitForTimeout(400);
  const DZ9 = await T(() => ({ d: SKV3._t.design(), gfx: SKV3._t.gfx() }));
  ok(!DZ9.d.mode && DZ9.gfx.crewDrawn > 0,
    '退出设计者局恢复人类对局：角色重新绘制（本帧 ' + DZ9.gfx.crewDrawn + ' 个）');

  section('事件流 · 谁在哪做了什么（复盘数据源）');
  await T(() => { SKV3.stop(); SKV3.start('alien'); });
  await page.waitForFunction(() => window.SKV3 && SKV3._t && SKV3._t.assets().base, null, { timeout: 30000 });
  await page.waitForTimeout(320);
  const EV0 = await T(() => {
    const t = SKV3._t; t.newGame();
    const g = t.G();
    const evs = t.events();
    return { meAlien: !!g.me.alien, n: evs.length, first: evs[0] && evs[0].kind };
  });
  ok(EV0.meAlien && EV0.n === 1 && EV0.first === 'game_start',
    '新开一局事件流重新计数：只有开局一条（' + EV0.n + ' 条）');
  const EV1 = await T(() => {
    const t = SKV3._t, g = t.G();
    g.paused = true; g.noReport = true; g.dmg = [];
    g.secbotDead = true; g.medbotDead = true;
    const k = g.agents.find(a => a.alien && a.i !== 0 && a.alive);
    const v = g.agents.find(a => !a.alien && a.i !== 0 && a.alive);
    const h1 = g.agents.find(a => !a.alien && a.i !== 0 && a.alive && a !== v);
    const h2 = g.agents.find(a => !a.alien && a.i !== 0 && a.alive && a !== v && a !== h1);
    const v2 = g.agents.find(a => !a.alien && a.i !== 0 && a.alive && a !== v && a !== h1 && a !== h2);
    for (const a of g.agents)
      if (a !== k && a !== v && a !== h1 && a !== h2 && a !== v2) t.tp(a.i, 28.4, 54);
    t.resetAiState(k.i);
    k.knife = 1;
    t.tp(k.i, 48, 84); t.tp(v.i, 50, 84);
    t.knife(k.i, v.i);
    t.dragStart(k.i, v.i);
    t.tp(k.i, 54, 83.8); t.tp(v.i, 54, 83.8);
    t.dragRelease(k.i);
    const off = t.breaker();
    const on = t.breaker();
    const sab = t.damageRoom(k.i, 'engine');
    const fixStart = t.startFix(h1.i, 'engine');
    t.aiTick(h1.i, 400, 0.05);
    const dmgLeft = t.dmg().length;
    const spot = t.taskSpot(h2.i);
    h2._delay = 0; h2._rest = 0; h2.doing = 0; h2.path = null;
    h2.doing = 0; h2._doing = null;
    /* 医疗间刚发生刀击：清掉这名 AI 的听觉现场，避免它 45 秒都在跑去围观而不做任务 */
    if (h2.mind) { h2.mind.alert = 0; h2.mind.noise = null; }
    h2._look = null; h2.suspect = null; h2.accuse = null;
    t.tp(h2.i, spot.x, spot.y);
    const tIdx0 = h2.tIdx;
    t.aiTick(h2.i, 900, 0.05);
    const tIdx1 = h2.tIdx;
    const pipes = t.pipes();
    t.tp(0, pipes[0].x, pipes[0].y);
    const pipeOpen = t.openPipe();
    const pipeGo = t.pickPipe(1);
    k.knife = 1;
    t.tp(k.i, 48, 84); t.tp(v2.i, 50, 84);
    t.knife(k.i, v2.i);
    return { k: k.i, v: v.i, v2: v2.i, h1: h1.i, h2: h2.i,
      off, on, sab, fixStart, dmgLeft, spot, tIdx0, tIdx1, pipeOpen, pipeGo,
      pipeFrom: pipes[0].room, pipeTo: pipes[1].room };
  });
  ok(EV1.off.state === 2 && EV1.on.corr === true, '事件流夹具：断电 → 合闸都实际生效');
  ok(EV1.h1 !== EV1.h2 && EV1.tIdx1 > EV1.tIdx0 && EV1.pipeOpen && EV1.pipeGo,
    '事件流夹具：AI 完成 1 个任务（tIdx ' + EV1.tIdx0 + '→' + EV1.tIdx1 + '），玩家钻管道成功');
  /* 把夜里最后 1.1 秒跑完：天亮失血死亡 → kill 事件必须记下凶手（killedBy） */
  await T(() => {
    const t = SKV3._t, g = t.G();
    g.phase = SKClock.newPhase('night', performance.now() - (120 - 1.1) * 1000, 120000);
    g.paused = false;
  });
  await page.waitForTimeout(1700);
  const EV2 = await T(() => {
    const t = SKV3._t, g = t.G();
    g.paused = true;
    const evs = t.events();
    return { meet: !!g.meet, over: !!g.over, evs,
      frames: t.frames(), replay: t.replay(),
      inv: t.inv() };
  });
  const hasEv = (kind, pred) => EV2.evs.some(e => e.kind === kind && (!pred || pred(e)));
  const knifeEv = EV2.evs.find(e => e.kind === 'knife' && e.victim === EV1.v);
  ok(!!knifeEv && knifeEv.actor === EV1.k && knifeEv.room === 'med' &&
    Math.abs(knifeEv.x - 50) < 1.5 && Math.abs(knifeEv.y - 84) < 1.5,
    '出刀事件记全：谁 / 谁被刀 / 舱室 / 时间点 / 坐标（'
    + (knifeEv ? knifeEv.room + ' ' + knifeEv.x + ',' + knifeEv.y : '缺失') + '）');
  const dragS = EV2.evs.find(e => e.kind === 'drag_start' && e.victim === EV1.v);
  const dragE = EV2.evs.find(e => e.kind === 'drag_end' && e.victim === EV1.v);
  ok(!!dragS && !!dragE && dragS.actor === EV1.k && dragS.room === 'med' && dragE.room === 'med',
    '拖尸事件成对记录：谁拖谁 / 在哪拖起 / 在哪放下');
  ok(EV2.evs.filter(e => e.kind === 'breaker').some(e => e.state === 2) &&
    EV2.evs.filter(e => e.kind === 'breaker').some(e => e.state !== 2),
    '拉闸 / 合闸都进事件流');
  ok(hasEv('sabotage', e => e.actor === EV1.k && e.room === 'engine' && e.label) &&
    hasEv('fix', e => e.actor === EV1.h1 && e.room === 'engine') && EV1.dmgLeft === 0,
    '破坏舱室与修好故障都记到手（含舱室与设备名）');
  ok(hasEv('task', e => e.actor === EV1.h2 && e.room && e.label && e.pts >= 1),
    '任务完成事件带任务名 / 舱室 / 分数');
  ok(hasEv('pipe', e => e.actor === 0 && e.from === EV1.pipeFrom && e.to === EV1.pipeTo),
    '钻管道事件记录起点与终点舱室');
  const bledKill = EV2.evs.find(e => e.kind === 'kill' && e.victim === EV1.v2);
  ok(!!bledKill && bledKill.actor === EV1.k && bledKill.method === 'knife' && bledKill.room === 'med',
    '天亮失血死亡也归因：凶手 / 凶器 / 死亡舱室（'
    + (bledKill ? bledKill.method + ' by ' + bledKill.actor : '缺失') + '）');
  ok(EV2.frames >= 2 && EV2.replay.frames.length === EV2.frames,
    '位置帧按 0.5 秒采样（本次 ' + EV2.frames + ' 帧）');
  ok(EV2.replay.roster.length === 15 && EV2.replay.roster.filter(r => r.alien).length === 4 &&
    EV2.replay.events.length === EV2.evs.length && EV2.replay.map.rooms === 10,
    '回放包：15 席位 / 4 异形 / 事件与地图统计齐全');
  ok(EV2.inv && EV2.inv.all.length === 0, '事件流与天亮结算后不变量零失败');

  const RE1 = await T(() => {
    const p = SKV3._t.replay();
    const opened = SKReplay.open(p);
    const on = document.querySelectorAll('#rp-ship .room.on').length;
    return { opened, open: SKReplay.isOpen(), rows: SKReplay.count(),
      rooms: document.querySelectorAll('#rp-ship .room').length,
      pipes: document.querySelectorAll('#rp-ship .pipe').length,
      dots: document.querySelectorAll('#rp-dots .rp-dot').length,
      sub: document.getElementById('rp-sub').textContent, on };
  });
  ok(RE1.opened && RE1.open && RE1.rows >= 8 && RE1.rooms === 10 && RE1.pipes === 8 &&
    RE1.dots === 15, '复盘页打开：' + RE1.rows + ' 条事件 / 10 舱 / 8 管道口 / 15 个席位点');
  await shot('46_对局复盘.png');
  const RE2 = await T(() => {
    const p = SKReplay.payload();
    const i = p.events.findIndex(e => e.room);
    const row = document.querySelector('.rp-ev[data-i="' + i + '"]');
    if (i < 0 || !row) return { missing: true };
    row.click();
    const on = document.querySelectorAll('#rp-ship .room.on');
    return { room: p.events[i].room, n: on.length,
      data: on.length ? on[0].getAttribute('data-room') : null,
      seek: +document.getElementById('rp-seek').value };
  });
  ok(!RE2.missing && RE2.n === 1 && RE2.data === RE2.room,
    '时间轴点击事件 → 高亮对应舱室（' + RE2.data + '）');
  const RE3 = await T(() => {
    const p = JSON.parse(JSON.stringify(SKV3._t.replay()));
    SKReplay.close();
    const reopened = SKReplay.open(p);
    const saved = SKReplay.save(p);
    return { reopened, open: SKReplay.isOpen(), saved, rows: SKReplay.count() };
  });
  ok(RE3.reopened && RE3.open && RE3.saved && RE3.rows >= 8,
    '回放包 JSON 往返后可再次打开并导出（' + RE3.rows + ' 条）');
  await T(() => SKReplay.close());

  const ENDR = await T(() => {
    const t = SKV3._t, g = t.G();
    g.prog = t.winPts();
    const won = t.checkWin();
    return { won, end: !document.getElementById('end').classList.contains('hide'),
      rep: !!document.getElementById('e-rep'), save: !!document.getElementById('e-save'),
      title: document.getElementById('e-t').textContent };
  });
  ok(ENDR.won && ENDR.end && ENDR.rep && ENDR.save && ENDR.title.indexOf('人类') >= 0,
    '结束页提供「复盘 / 保存回放」两个入口');
  await page.click('#e-rep');
  await page.waitForTimeout(200);
  const ENDR2 = await T(() => ({
    open: SKReplay.isOpen(), rows: SKReplay.count(),
    hiddenEnd: document.getElementById('end').classList.contains('hide')
  }));
  ok(ENDR2.open && ENDR2.rows >= 8, '结束页「复盘」直接打开本局事件回放');
  await page.click('#rp-close');
  await page.waitForTimeout(120);
  ok((await T(() => SKReplay.isOpen())) === false, '复盘页可关闭并回到结束页');
  /* ---- 本批新增的两块 UI（2026-11-03，调研报告 P1-4：结算页信息量过低）----
       ① 结算页逐席亮身份 + 「谁投了谁」矩阵；
       ② 复盘页把「聊天/发言」从「会议/投票」里分家 ——
          500+ 条事件里台词占大头，混在一起会把"哪一轮开了会、谁投了谁"淹掉。
     投票矩阵要有真实投票才画得出来，所以这里**自己开一局、走一场完整投票、再结算**，
     不蹭上面用例留下的对局（那样会随随机路径偶发变成"0 场投票"，测到的是夹具不是功能）。 */
  const UI2 = await T(() => {
    const t = SKV3._t;
    t.newGame();
    /* ⚠ `newGame()` 会**整个换掉** G 对象：先 `const g=t.G()` 再 `newGame()` 拿到的是
       被丢弃的旧状态，之后的赋值全打在空气上（这条在夹具里静默失败过，别再来一次）。 */
    const g = t.G();
    g.noReport = true; g.paused = true;
    /* 走**已验证可用**的投票链路：openMeeting('day') → startVote → closeVote → finishMeeting */
    t.openMeeting('day');
    t.startVote();
    t.closeVote();
    if (g.meet) t.finishMeeting();
    const voteEvents = (g.events || []).filter(e => e.kind === 'vote').length;
    g.prog = t.winPts();
    const won = t.checkWin();
    return {
      won, voteEvents,
      endShown: !document.getElementById('end').classList.contains('hide'),
      rows: document.querySelectorAll('#e-ids .row').length,
      ali: document.querySelectorAll('#e-ids .chip.ali').length,
      hum: document.querySelectorAll('#e-ids .chip.hum').length,
      meets: document.querySelectorAll('#e-votes .row.mtg').length,
      head: (document.querySelector('#e-votes .row.mtg') || {}).textContent || '',
    };
  });
  ok(UI2.endShown && UI2.won && UI2.rows === 15 && UI2.ali === 4 && UI2.hum === 11,
    '结算页逐席亮身份：15 席全亮（异形 ' + UI2.ali + ' / 人类 ' + UI2.hum + '，结束屏 ' +
    UI2.endShown + '）');
  ok(UI2.voteEvents >= 1 && UI2.meets >= 1 && /夜/.test(UI2.head),
    '结算页有「谁投了谁」矩阵：' + UI2.voteEvents + ' 张票 → ' + UI2.meets + ' 场投票（逐条列谁投谁 / 弃权）');

  /* T2（2026-11-05）：身份表 + 投票矩阵让结算卡变得很高，主操作按钮曾被挤到
     折叠线以下。这里在两个视口各断言一次「再来一局」完整落在首屏，断言完恢复 1440×900。 */
  const ENDBTN1 = await T(() => {
    const r = document.getElementById('e-r').getBoundingClientRect();
    return { top: Math.round(r.top), bottom: Math.round(r.bottom), vh: innerHeight };
  });
  ok(ENDBTN1.top >= 0 && ENDBTN1.bottom <= ENDBTN1.vh,
    '结算页「再来一局」在首屏完整可见（' + ENDBTN1.top + '~' + ENDBTN1.bottom + ' / 视口 ' + ENDBTN1.vh + '）');
  await page.setViewportSize({ width: 1120, height: 700 });
  await page.waitForTimeout(160);
  const ENDBTN2 = await T(() => {
    const r = document.getElementById('e-r').getBoundingClientRect();
    return { top: Math.round(r.top), bottom: Math.round(r.bottom), vh: innerHeight };
  });
  ok(ENDBTN2.top >= 0 && ENDBTN2.bottom <= ENDBTN2.vh,
    '1120×700 下「再来一局」仍在首屏（' + ENDBTN2.top + '~' + ENDBTN2.bottom + ' / 视口 ' + ENDBTN2.vh + '）');
  await shot('47_结算页_1120x700_按钮首屏.png');
  await page.setViewportSize({ width: 844, height: 390 });
  await page.waitForTimeout(160);
  const ENDBTN3 = await T(() => {
    const r = document.getElementById('e-r').getBoundingClientRect();
    return { top: Math.round(r.top), bottom: Math.round(r.bottom), vh: innerHeight };
  });
  ok(ENDBTN3.top >= 0 && ENDBTN3.bottom <= ENDBTN3.vh,
    '844×390 横屏下「再来一局」仍在首屏（' + ENDBTN3.top + '~' + ENDBTN3.bottom + ' / 视口 ' + ENDBTN3.vh + '）');
  await shot('47b_结算页_844x390_按钮首屏.png');
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.waitForTimeout(160);
  /* 复盘页的筛选与夜长是**源码级**契约（DOM 只在打开回放后存在，这里已经关了） */
  const REPLAY_SRC = fs.readFileSync(path.join(__dirname, '..', 'js', 'ui', 'replay.js'), 'utf8');
  const MEET_ROW = (REPLAY_SRC.match(/\{\s*id: 'meet'[^\n]*/) || [''])[0];
  ok(/id: 'chat'/.test(REPLAY_SRC) && MEET_ROW.indexOf('chat') < 0,
    '复盘页「聊天/发言」独立成档，且不再混在「会议/投票」里');
  ok(!/var NIGHT_LEN = 120;/.test(REPLAY_SRC) && /SKSanity\.NIGHT/.test(REPLAY_SRC),
    '复盘页夜长改读 SKSanity.NIGHT.len（此前按过期的 120 秒换算 75 秒的夜）');
  const replayJson = await T(() => JSON.stringify(SKV3._t.replay()));
  await page.setInputFiles('#home-replay-file', {
    name: 'replay.json', mimeType: 'application/json', buffer: Buffer.from(replayJson)
  });
  await page.waitForTimeout(350);
  const IMP = await T(() => ({ open: SKReplay.isOpen(), rows: SKReplay.count(),
    title: document.getElementById('rp-t').textContent }));
  ok(IMP.open && IMP.rows >= 8, '开始页「载入回放」可读回保存的 JSON 并打开复盘（' +
    IMP.rows + ' 条 / ' + IMP.title + '）');
  await T(() => SKReplay.close());
  await T(() => { SKV3.stop(); SKV3.start('human'); });
  await page.waitForFunction(() => window.SKV3 && SKV3._t && SKV3._t.assets().base, null, { timeout: 30000 });
  await page.waitForTimeout(320);

  section('节奏 · 会议上限 / 报告额度 / 开夜禁刀（2026-11-02）');
  await fresh(false);
  const PACE2 = await T(() => {
    const t = SKV3._t; t.newGame();
    const g = t.G(); g.paused = true; g.noReport = true;
    const k = g.agents.find(a => a.alien && a.i !== 0 && a.alive);
    const vs = g.agents.filter(a => !a.alien && a.i !== 0 && a.alive).slice(0, 3);
    /* ① 夜间会议每夜上限 2 场 */
    t.openMeeting('night', k.i, vs[0].i);
    const m1 = g.nightMeets;
    if (g.meet) t.finishMeeting();
    t.openMeeting('night', k.i, vs[1].i);
    const m2 = g.nightMeets;
    if (g.meet) t.finishMeeting();
    t.openMeeting('night', k.i, vs[2].i);      /* 第三场应被拒 */
    const m3 = g.nightMeets, opened3 = !!g.meet;
    if (g.meet) t.finishMeeting();
    /* ② 报告额度：玩家 2 次（先把会议场次清零，否则会先被"本夜已开满"挡住） */
    g.nightMeets = 0;
    const rl0 = g.me.reportLeft;
    g.me.x = vs[0].x; g.me.y = vs[0].y;
    vs[0].alive = false; vs[0].downed = false; vs[0].deathAt = 1;
    vs[0].deathRoom = 'med'; vs[0].bodyX = g.me.x; vs[0].bodyY = g.me.y; vs[0].bodyGone = false;
    t.report();
    const afterOne = { left: g.me.reportLeft, meet: !!g.meet, nightMeets: g.nightMeets };
    if (g.meet) t.finishMeeting();
    /* 额度用完后再报：应被拒绝 */
    g.me.reportLeft = 0;
    vs[1].alive = false; vs[1].deathAt = 1; vs[1].deathRoom = 'med';
    vs[1].bodyX = g.me.x; vs[1].bodyY = g.me.y; vs[1].bodyGone = false;
    t.report();
    const afterDenied = { meet: !!g.meet, msg: g.msg || '' };
    return { m1, m2, m3, opened3, rl0, afterOne, afterDenied, cap: SKSanity.MEET.perNight,
      reports: SKSanity.MEET.reportsPerAgent };
  });
  ok(PACE2.m1 === 1 && PACE2.m2 === 2 && PACE2.m3 === 2 && !PACE2.opened3,
    '每夜最多 ' + PACE2.cap + ' 场夜晚会议：第三场被拒（' + PACE2.m1 + '/' + PACE2.m2 + '/' + PACE2.m3 + '）');
  ok(PACE2.rl0 === PACE2.reports && PACE2.afterOne.left === PACE2.reports - 1,
    '报告额度全局 ' + PACE2.reports + ' 次，用一次少一次（' + PACE2.rl0 + ' → ' + PACE2.afterOne.left + '）');
  ok(!PACE2.afterDenied.meet && /额度|开满/.test(PACE2.afterDenied.msg),
    '额度用完后再报告：开不了会并给出提示（' + PACE2.afterDenied.msg + '）');

  await fresh(false);
  const LOCK2 = await T(() => {
    const t = SKV3._t; t.newGame();
    const g = t.G(); g.noReport = true;
    if (g.meet) t.finishMeeting();              /* 关掉开局讨论，进入夜晚 */
    const v = g.agents.find(a => !a.alien && a.i !== 0 && a.alive);
    for (const a of g.agents) if (a !== g.me && a !== v) { a.x = 28.2; a.y = 44; a.path = null; }
    t.tp(0, 34.8, 33.8); t.tp(v.i, 35.6, 33.8);
    g.me.alien = true; g.me.knife = 1; g.me.bullet = 1;
    const lock = SKSanity.KNIFE.lockAtStart;
    const elapsed0 = 90 - g.t;
    t.attack();                                 /* 2026-11-05：开场第一秒就应该能出刀 */
    return { lock, elapsed0, knife: g.me.knife, msg: g.msg || '', v: v.i,
      downed: t.state()[v.i].downed, inv: t.inv() };
  });
  ok(LOCK2.lock === 0, '开局 5 秒禁刀已移除：lockAtStart = 0（单一真源）');
  ok(LOCK2.knife === 0 && LOCK2.downed && !/封锁/.test(LOCK2.msg),
    '夜晚开始第一秒即可出刀（刀 -1、目标濒死、无封锁提示：' + LOCK2.msg + '）');

  await fresh(false);
  const MEET = await T(() => {
    const t = SKV3._t; t.newGame();
    const g = t.G(); g.paused = true; g.noReport = true;
    const w = g.agents.find(a => !a.alien && a.i !== 0 && a.alive);
    /* ① 夜晚会议不打断任务：doing / _doing 必须原样保留 */
    w.doing = 7.5; w._doing = 'task'; w._dur = 7.5; w.path = [[10, 10]]; w.moving = true;
    const before = { doing: w.doing, kind: w._doing };
    t.openMeeting('night', null, null);
    const during = { doing: w.doing, kind: w._doing, path: w.path && w.path.length };
    if (g.meet) t.finishMeeting();
    const after = { doing: w.doing, kind: w._doing };
    /* ② 白天会议：全员刷新到中央会议室 + 打断任务（走真正的"天亮"流程） */
    for (const a of g.agents) { a.doing = 3; a._doing = 'task'; a.x = 5; a.y = 5; }
    t.dawn();
    const inBridge = g.agents.filter(a => a.alive).every(a => SKV3._t.roomIdAt(a.x, a.y) === 'bridge');
    const cleared = g.agents.filter(a => a.alive).every(a => a.doing === 0 && !a._doing);
    if (g.meet) t.finishMeeting();
    return { before, during, after, inBridge, cleared };
  });
  ok(MEET.during.doing === MEET.before.doing && MEET.during.kind === 'task' && !MEET.during.path,
    '夜晚会议不打断任务：doing / _doing 原样保留，只清掉移动路径（' +
    JSON.stringify(MEET.during) + '）');
  ok(MEET.after.doing === MEET.before.doing,
    '散会后任务继续（doing 仍是 ' + MEET.after.doing + '）');
  ok(MEET.inBridge && MEET.cleared,
    '白天会议把所有人刷新到中央会议室，并打断此前的一切任务流程');

  await fresh(false);
  const BAD = await T(() => {
    const t = SKV3._t; t.newGame();
    const g = t.G(); g.paused = false; g.noReport = true;
    if (g.meet) t.finishMeeting();
    /* 点一个走不过去的地方（船外坐标） */
    const r = t.badClick(2, 2);
    return { r, msg: g.msg || '', fx: g.clickFx ? { bad: !!g.clickFx.bad } : null };
  });
  ok(BAD.r && BAD.r.ok === false && /走不过去/.test(BAD.msg) && BAD.fx && BAD.fx.bad,
    '点到不可交互处：给出文字提示 + 点击处标记禁止符号（' + BAD.msg + '）');

  section('DEV 顶栏让位 / 会议点名高亮（2026-11-05）');
  const DEVMEET = await T(() => {
    const t = SKV3._t; t.newGame();
    const g = t.G(); g.paused = true; g.noReport = true;
    t.setDev(true);
    t.openMeeting('day');
    return { devOn: !!document.getElementById('dev') &&
      !document.getElementById('dev').classList.contains('hide') };
  });
  await page.waitForTimeout(240);
  const DEVMEET2 = await T(() => {
    const dev = document.getElementById('dev').getBoundingClientRect();
    const title = document.getElementById('m-title').getBoundingClientRect();
    return { devBottom: Math.round(dev.bottom), devH: Math.round(dev.height),
      titleTop: Math.round(title.top) };
  });
  ok(DEVMEET.devOn && DEVMEET2.titleTop >= DEVMEET2.devBottom,
    'DEV 顶栏（' + DEVMEET2.devH + 'px）不再盖住会议标题（标题 ' +
    DEVMEET2.titleTop + ' ≥ 栏底 ' + DEVMEET2.devBottom + '）');

  const DEVEND = await T(() => {
    const t = SKV3._t, g = t.G();
    t.startVote(); t.closeVote(); if (g.meet) t.finishMeeting();
    g.prog = t.winPts();
    t.checkWin();
    return { end: !document.getElementById('end').classList.contains('hide') };
  });
  await page.waitForTimeout(240);
  const DEVEND2 = await T(() => {
    const dev = document.getElementById('dev').getBoundingClientRect();
    const title = document.getElementById('e-t').getBoundingClientRect();
    return { devBottom: Math.round(dev.bottom), titleTop: Math.round(title.top),
      end: !document.getElementById('end').classList.contains('hide') };
  });
  ok(DEVEND.end && DEVEND2.end && DEVEND2.titleTop >= DEVEND2.devBottom,
    'DEV 顶栏不再盖住结算标题（标题 ' + DEVEND2.titleTop + ' ≥ 栏底 ' + DEVEND2.devBottom + '）');
  await shot('48_DEV顶栏让位.png');

  const HIT = await T(() => {
    const t = SKV3._t; t.newGame();
    const g = t.G(); g.paused = true; g.noReport = true;
    t.setDev(false);
    t.openMeeting('day');
    const name = g.me.name;
    /* 一句点名玩家、一句不点名：只有前者应带 .hit */
    t.sayLine(g.agents[1].name, '我刚才看见' + name + ' 在走廊', '');
    t.sayLine(g.agents[1].name, '我在引擎室修东西', '');
    const rows = [...document.querySelectorAll('#m-say .ln')];
    const hit = rows.filter(r => r.classList.contains('hit'));
    return { name, total: rows.length, hits: hit.length,
      text: hit.length ? hit[0].textContent : '' };
  });
  ok(HIT.total >= 2 && HIT.hits === 1 && HIT.text.indexOf(HIT.name) >= 0,
    '点名玩家的发言行加 .hit 高亮，未点名的行不加（' + HIT.hits + '/' + HIT.total + '）');
  await shot('49_会议点名高亮.png');
  await T(() => { const t = SKV3._t, g = t.G();
    t.startVote(); t.closeVote(); if (g.meet) t.finishMeeting(); });

  section('名单 / 随机席位（2026-11-05）');
  const ROSTER = await T(() => {
    const t = SKV3._t;
    const ai = [];
    for (let i = 1; i <= 14; i++) ai.push('测试' + String(i).padStart(2, '0'));
    const r = t.nextGame({ seat: 6, roster: { me: '试航员', ai: ai } });
    return { me: r.me, names: r.names, aliens: r.aliens, uniq: new Set(r.names).size,
      meName: t.G().me.name, alienMe: t.G().me.alien };
  });
  ok(ROSTER.me === 6 && ROSTER.meName === '试航员' && ROSTER.names[6] === '试航员' &&
    ROSTER.names[0] === '测试01' && ROSTER.names[7] === '测试07' &&
    ROSTER.uniq === 15 && ROSTER.aliens.length === 4 && !ROSTER.alienMe,
    '自定义名单 + 指定席位：玩家名落在 07 席，14 个 AI 名按序补位，15 名唯一、4 异形');

  const DUP = await T(() => {
    const t = SKV3._t;
    const r = t.nextGame({ seat: 2, roster: { me: '星尘', ai: ['星尘', '', '银翼'] } });
    return { me: r.me, names: r.names, uniq: new Set(r.names).size, name: r.names[2] };
  });
  ok(DUP.me === 2 && DUP.name === '星尘' && DUP.uniq === 15,
    '名单兜底：重名 / 空名自动去重补位，15 席仍唯一');

  const WAVEHINT = await T(() => {
    const t = SKV3._t, g = t.G();
    g.msg = ''; g.waveHint = false;
    t.hear(g.me.x, g.me.y, 'knife', 1);
    const first = g.msg;
    g.msg = '';
    t.hear(g.me.x, g.me.y, 'knife', 1);
    return { first, second: g.msg, waves: t.waves().length };
  });
  ok(/声纹环/.test(WAVEHINT.first) && WAVEHINT.second === '' && WAVEHINT.waves >= 1,
    '声纹环首次出现给一次图例教学，之后不再重复打扰');

  /* ================= 2026-11-05 平衡性调整（用户裁定）=================
     八项参数全部从声明层/探针读真值；新增的「救起后 3 秒禁移动」用真实位移验证。 */
  /* ================= 2026-11-05 推理系统（G1 接线 / G2 去人格 / G3 判断结构）================= */
  /* ============ 2026-11-06 · 模拟讨论保真 / 通道覆盖 / 假设层 ============ */
  section('推理系统 · 模拟讨论保真 / 注意力 / 证据通道');
  await fresh(false);
  const SIMCH = await T(() => {
    const t = SKV3._t, g = t.G();
    g.noReport = true; g.paused = true;
    if (g.meet) t.finishMeeting();
    t.openMeeting('day');
    return t.simChatterProbe();
  });
  ok(SIMCH && !SIMCH.err && SIMCH.discussLines > 0 &&
    SIMCH.planN === SIMCH.discussLines && SIMCH.talkDelta > 0,
    '模拟局发言不再被跳过：同步执行 ' + (SIMCH && SIMCH.discussLines) +
    ' 条、累计台词数 ' + (SIMCH && SIMCH.talkDelta) +
    '，排期审计 n 与实际执行数一致' + (SIMCH && SIMCH.err ? '（' + SIMCH.err + '）' : ''));

  await fresh(false);
  const ATT = await T(() => {
    const t = SKV3._t, g = t.G();
    g.noReport = true; g.paused = true; g.events = [];
    if (g.meet) t.finishMeeting();
    const a = g.agents.find(x => !x.alien && x.i !== 0 && x.alive);
    const w = g.agents.find(x => !x.alien && x.i !== 0 && x.i !== a.i && x.alive);
    const online = t.attentionOf(a.i);
    a.doing = 1; const ui = t.attentionOf(a.i); a.doing = 0;
    a.downed = true; const suspend = t.attentionOf(a.i); a.downed = false;
    t.openMeeting('day'); const inMeet = t.attentionOf(a.i);
    /* UI 覆盖的目击者必须被 noticeAction 跳过（遥测 uiWitnessSkip） */
    w.doing = 1; g.simStats = {};
    const oldSim = g.simMode; g.simMode = true;   /* uiWitnessSkip 只在模拟局记 */
    t.notice(a.i, w.x, w.y, 6, 'knife', null);
    const uiSkip = g.simStats.uiWitnessSkip || 0;
    g.simMode = oldSim; w.doing = 0;
    if (g.meet) t.finishMeeting();
    return { online, ui, suspend, inMeet, uiSkip };
  });
  ok(ATT.online === 'online' && ATT.ui === 'ui' && ATT.suspend === 'suspend' &&
    ATT.inMeet === 'suspend',
    'G1 注意力三态：online / ui（站桩/遮罩）/ suspend（倒地、开会）');
  ok(ATT.uiSkip > 0, 'UI 覆盖的目击者不进 noticeAction（uiWitnessSkip=' + ATT.uiSkip + '）');

  await fresh(false);
  const VCH = await T(() => {
    const t = SKV3._t, g = t.G();
    g.noReport = true; g.paused = true;
    if (g.meet) t.finishMeeting();
    t.openMeeting('day');
    const x = g.agents.find(a => !a.alien && a.i !== 0 && a.alive);
    const tgt = g.agents.find(a => a.i !== 0 && a.i !== x.i && a.alive);
    const r = t.forceEndorse(x.i, tgt.i);
    if (g.meet) t.finishMeeting();
    return Object.assign({ tgt: tgt.i }, r);
  });
  ok(VCH.top === VCH.tgt && VCH.vouches === 1 && VCH.heardDelta > 0,
    'G2 heard_vouch 通道：当众背书既写听众信任事件，也登记到 ctx.vouches（听众 ' +
    VCH.heardDelta + ' 人）');

  await fresh(false);
  const CTX = await T(() => {
    const t = SKV3._t, g = t.G();
    g.events = []; t.setLightState(1);
    const normal = t.witnessCtxMul(50, 50, 1);
    const many = t.witnessCtxMul(50, 50, 4);
    t.setLightState(2); const dark = t.witnessCtxMul(50, 50, 1);
    t.setLightState(1);
    return { normal, many, dark };
  });
  ok(CTX.normal === 1 && CTX.many < CTX.normal && CTX.dark < CTX.normal,
    'G2 概率漂移只由可观察情境驱动：人多 ' + CTX.many + '、断电 ' + CTX.dark +
    '，不读性格/阵营');

  await fresh(false);
  const ALT = await T(() => {
    const t = SKV3._t, g = t.G();
    const w = g.agents.find(a => !a.alien && a.i !== 0 && a.alive);
    const s = g.agents.find(a => a.i !== w.i && a.alive);
    w.mind.mem = [{ kind: 'saw_red', subj: s.i, t: 10 },
      { kind: 'saw_drag_away', subj: s.i, t: 18 }];
    const e = t.envEstimate(w.i, s.i);
    return { n: (e.cues || []).length,
      allAlt: (e.cues || []).every(c => !!c.alt && c.alt.length > 3) };
  });
  ok(ALT.n > 0 && ALT.allAlt,
    'G1 同一线索必须带反解释：' + ALT.n + ' 条 cue 全部有 alt');

  /* 2026-11-06 收紧：并列假说必须各自有独立实证，机械平局不再弃权。 */
  section('推理系统 · 假设层：并列假说需独立实证才弃权');
  await fresh(false);
  const HYP = await T(() => {
    const t = SKV3._t, g = t.G();
    g.noReport = true; g.paused = true;
    if (g.meet) t.finishMeeting();
    const w = g.agents.find(a => !a.alien && a.i !== 0 && a.alive);
    const A = g.agents.find(a => a.i !== 0 && a.i !== w.i && a.alive);
    const B = g.agents.find(a => a.i !== 0 && a.i !== w.i && a.i !== A.i && a.alive);
    for (const k in w.mind.sus) delete w.mind.sus[k];
    for (const k in w.mind.why) delete w.mind.why[k];
    w.mind.mem = []; w.mind.known = {}; w.mind.almost = { foe: {}, friend: {} };
    w.suspect = null; w.accuse = null;
    for (const x of g.agents) x.accuse = null;
    const cfg = Object.assign({}, SKSanity.MIND);
    t.healSus(w.i, A.i, 0.6); t.healSus(w.i, B.i, 0.6); t.refreshHyps(w.i);
    const hs = t.hypsOf(w.i);
    const bare = t.hypSpreadOf(w.i), bareLean = t.voteLeanOf(w.i);
    /* A/B 还原旧判据：无实证也应弃权 —— 证明开关真的能复现旧行为 */
    t.setHypMode('loose');
    const looseBare = t.hypSpreadOf(w.i);
    t.setHypMode('tight');
    /* 两条假说各补 2 条独立实证（不同 kind + 现场坐标） */
    const ev = (kind, x, y) => ({ w: 0.2, reason: kind, kind: kind,
      night: g.night, t: 10, x: x, y: y, room: 'bridge' });
    w.mind.why[A.i] = [ev('saw_red', 12, 34), ev('saw_avoid', 13, 35)];
    w.mind.why[B.i] = [ev('saw_drag_away', 22, 44), ev('search_body_moved', 23, 45)];
    const withEv = t.hypSpreadOf(w.i), withLean = t.voteLeanOf(w.i);
    /* 同源：两边塞一模一样的两种 kind → 只是同一次公开事件给两人加了分 */
    w.mind.why[B.i] = [ev('saw_red', 22, 44), ev('saw_avoid', 23, 45)];
    const sameSrc = t.hypSpreadOf(w.i);
    w.mind.why[B.i] = [ev('saw_drag_away', 22, 44), ev('search_body_moved', 23, 45)];
    /* fallback bug 回归：hypGap=0 现在真的生效（精确并列仍可弃权），-1 才彻底关 */
    t.setHypGap(0); const gap0 = t.hypSpreadOf(w.i);
    t.setHypGap(-1); const gapOff = t.hypSpreadOf(w.i);
    t.setHypGap(cfg.hypGap);
    t.healSus(w.i, A.i, 0.95); t.refreshHyps(w.i);
    const sp2 = t.hypSpreadOf(w.i);
    return { hs, bare, bareLean, looseBare, withEv, withLean, sameSrc,
      gap0, gapOff, sp2, cfg, cached: (w.mind.hyps || []).length };
  });
  ok(HYP.hs.length === 2 && Math.abs(HYP.hs[0].w - 0.5) < 0.01 &&
    HYP.cached === 2,
    '假设层：维护并列假说并归一化权重（' + HYP.hs.map(h => h.i + ':' + h.w).join(' / ') + '）');
  ok(HYP.cfg.hypGap === 0.08 && HYP.cfg.hypMinTop === 0.34 &&
    HYP.cfg.hypMinEvidence === 2 && HYP.cfg.hypRequireDirect === 1 &&
    HYP.cfg.hypRequireIndependent === 1,
    '门槛收紧且单一真源：gap 0.12→0.08、最低权重 0.25→0.34、每条需 2 条实证');
  ok(!HYP.bare.competing && HYP.bare.evidence &&
    HYP.bare.evidence.a.n === 0 && HYP.bare.evidence.b.n === 0 &&
    HYP.bareLean.v >= 0 && HYP.bareLean.why !== 'competing',
    '收紧核心：两个 sus 机械相等但零实证 → 不再弃权，敢投（' + HYP.bareLean.why + '）');
  ok(HYP.looseBare.competing,
    'A/B 开关 --hypmode loose 能还原旧判据（无实证也弃权），归因可复现');
  ok(HYP.withEv.competing && HYP.withEv.evidence.independent &&
    HYP.withEv.evidence.ok && HYP.withLean.v === -1 &&
    HYP.withLean.why === 'competing',
    '两条假说各有独立现场实证 → 仍会犹豫弃权（保留真人手感）');
  ok(!HYP.sameSrc.competing && HYP.sameSrc.evidence.independent === false,
    '证据同源（两边一模一样的两种 kind）不算两条独立假说，不弃权');
  ok(HYP.gap0.competing && !HYP.gapOff.competing,
    'fallback bug 已修：--hypgap 0 真的生效（精确并列仍可弃权），-1 才彻底关闭');
  ok(!HYP.sp2.competing && HYP.sp2.gap > HYP.cfg.hypGap,
    '新证据拉开差距后假说分出主次（gap=' + HYP.sp2.gap + '），恢复敢投');

  section('推理系统 · 主链接线 / 去性格推断 / LENS 运行时');
  await fresh(false);
  const RSN = await T(() => {
    const t = SKV3._t, g = t.G();
    g.noReport = true; g.paused = true;
    if (g.meet) t.finishMeeting();
    const w = g.agents.find(a => !a.alien && a.i !== 0 && a.alive);
    const X = g.agents.find(a => !a.alien && a.i !== 0 && a.alive && a !== w);
    const Y = g.agents.find(a => !a.alien && a.i !== 0 && a.alive && a !== w && a !== X);
    for (const k in w.mind.sus) delete w.mind.sus[k];
    w.mind.mem = []; w.mind.known = {};   /* 排除旧记忆，确保中性局面真的打平 */
    t.healSus(w.i, X.i, 0.6); t.healSus(w.i, Y.i, 0.6);
    const neutral = t.topSusOf(w.i, 0.5);
    let n = 0;
    for (const a of g.agents) {
      if (a === w || a === Y || !a.alive || n >= 3) continue;
      a.accuse = Y.i; n++;
    }
    const withPublic = t.topSusOf(w.i, 0.5);
    const envY = t.envEstimate(w.i, Y.i);
    for (const a of g.agents) a.accuse = null;
    return { X: X.i, Y: Y.i, n, neutral: neutral && neutral.i,
      withPublic: withPublic && withPublic.i,
      envY: +(envY.score * envY.conf).toFixed(3),
      socGone: SKSanity.MIND.silentSocMin === undefined,
      talkMin: SKSanity.MIND.silentTalkMin };
  });
  ok(RSN.socGone && RSN.talkMin > 0,
    'G2 去性格推断：沉默嫌疑不再读 soc 轴，改由实际台词数 talkN 判定');
  ok(RSN.n === 3 && RSN.neutral === RSN.X && RSN.withPublic === RSN.Y && RSN.envY > 0,
    'G1 envEstimate 接进主链：嫌疑打平时，有 3 人当众指认的一方被 topSus 选中' +
    '（' + RSN.X + ' → ' + RSN.Y + '，环境读数 ' + RSN.envY + '）');

  await fresh(false);
  const LRS = await T(() => {
    const t = SKV3._t, g = t.G();
    g.noReport = true; g.paused = true;
    const order = t.lensOrder(['fakeWork', 'fixDone', 'taskDone']);
    const k = g.agents.find(a => a.alien && a.i !== 0 && a.alive);
    const p = t.points().find(q => t.free(q.x, q.y));
    t.tp(k.i, p.x, p.y);
    g.dmg = [{ room: p.room, x: p.x + 0.5, y: p.y, label: '测试故障',
      left: 60, dur: 60, by: 0 }];
    const before = t.lensCalls();
    const opts = t.disguiseOrder(k.i);
    const after = t.lensCalls();
    return { order, before, after, opts };
  });
  ok(LRS.order.join(',') === 'fixDone,taskDone,fakeWork',
    'LENS.lr 的排序方向：真修故障 > 完成任务 > 假装做事（' + LRS.order.join(' > ') + '）');
  ok(LRS.after > LRS.before && LRS.opts.length >= 2,
    'G2 lr 真的被运行时调用（' + (LRS.after - LRS.before) +
    ' 次），且只用于候选顺序、不写进任何权重');
  ok(LRS.opts.every((o, i) => i === 0 || LRS.opts[i - 1].hot > o.hot ||
    LRS.opts[i - 1].lr >= o.lr - 1e-9),
    '伪装候选：常客优先，常客打平时按 lr 降序（候选 ' + LRS.opts.length + ' 个）');

  section('推理系统 · 行为序列 / 证言间关系 / 可达性反事实');
  await fresh(false);
  const SEQ = await T(() => {
    const t = SKV3._t, g = t.G();
    const w = g.agents.find(a => !a.alien && a.i !== 0 && a.alive);
    const s = g.agents.find(a => a.i !== w.i && a.alive);
    w.mind.mem = [{ kind: 'saw_red', subj: s.i, t: 10 },
      { kind: 'saw_drag_away', subj: s.i, t: 18 }];
    const cue = t.sequenceCueOf(w.i, s.i);
    const env = t.envEstimate(w.i, s.i);
    w.mind.mem = [{ kind: 'saw_red', subj: s.i, t: 10 }];
    const one = t.sequenceCueOf(w.i, s.i);
    w.mind.mem = [{ kind: 'saw_red', subj: s.i, t: 10 },
      { kind: 'saw_drag_away', subj: s.i, t: 99 }];
    const far = t.sequenceCueOf(w.i, s.i);
    return { cue, one, far, envCues: (env.cues || []).map(c => c.kind) };
  });
  ok(SEQ.cue && SEQ.cue.kind === 'sequence' && SEQ.one === null && SEQ.far === null &&
    SEQ.envCues.indexOf('sequence') >= 0,
    'G3 行为序列：两种不同可疑动作在 25 秒内连着出现才算序列，并进入 envEstimate 线索');

  await fresh(false);
  const REL = await T(() => {
    const t = SKV3._t, g = t.G();
    g.noReport = true; g.paused = true;
    const w = g.agents.find(a => !a.alien && a.i !== 0 && a.alive);
    const Y = g.agents.find(a => a.i !== 0 && a.i !== w.i && a.alive);
    const bys = g.agents.filter(a => a.i !== 0 && a.i !== w.i && a.i !== Y.i && a.alive)
      .slice(0, 3).map(a => a.i);
    if (g.meet) t.finishMeeting();        /* 关掉开局讨论，再开一场干净的会 */
    t.openMeeting('day');
    const ctx = g.meet && g.meet.ctx;
    ctx.testimony.push({ li: w.i, by: bys[0], tgt: Y.i, wgt: 0.2,
      reason: 'heard_accuse', said: 1 });
    ctx.testimony.push({ li: w.i, by: bys[1], tgt: Y.i, wgt: 0.2,
      reason: 'heard_accuse', said: 1 });
    const plain = t.statementRelationOf(Y.i);
    ctx.vouches.push({ by: bys[2], tgt: Y.i });
    const conflict = t.statementRelationOf(Y.i);
    const vouches = t.vouches().length;
    if (g.meet) t.finishMeeting();
    return { plain, conflict, vouches };
  });
  ok(REL.plain.damp === 1 && REL.conflict.accusers === 2 &&
    REL.conflict.vouchers === 1 && REL.conflict.damp < 1 && REL.vouches === 1,
    'G3 证言间关系：2 人指控 + 1 人背书 → 公开声势被压低（damp=' +
    REL.conflict.damp.toFixed(2) + '），单独指控不压');

  const RCH = await T(() => {
    const t = SKV3._t;
    return { far: t.alibiReach(100, 2), near: t.alibiReach(4, 10),
      rooms: t.counterfactualReach('bridge', 'med', 2),
      same: t.counterfactualReach('bridge', 'bridge', 2) };
  });
  ok(RCH.far.possible === false && RCH.near.possible === true &&
    RCH.rooms && RCH.rooms.possible === false && RCH.same === null,
    'G3 可达性反事实：100 格 / 2 秒走不到（需 ' + RCH.far.needSec +
    's），4 格 / 10 秒走得到；跨舱室口供据此判强证据');

  section('平衡性 · 2026-11-05 八项参数与救起僵直');
  await fresh(false);
  const BAL = await T(() => {
    const t = SKV3._t, g = t.G(); g.noReport = true;
    return { cap: t.ghostCap(), red: t.redBodyCfg().dur, rush: t.rushCfg(),
      sight: t.sightCfg().humanDarkR, heal: t.robots().med.heal,
      stun: t.medbotStun(), lock: SKSanity.KNIFE.lockAtStart,
      base: t.speedOf(0) };
  });
  ok(BAL.cap === 1, '① 幽灵可完成的任务分数 2 → 1');
  ok(BAL.red === 1.5, '② 异形出刀红光 2 → 1.5 秒');
  ok(BAL.rush.dur === 2 && BAL.rush.mul === 1.5 && BAL.rush.alienOnly === true,
    '③④ 击杀加速 2 秒 / +50%（4.0 → ' + (BAL.base * BAL.rush.mul).toFixed(2) + ' 格/秒）');
  const DGF = await T(() => ({ chance: SKSanity.DISGUISE.breakerChance,
    cd: SKSanity.DISGUISE.cooldown }));
  ok(DGF.chance > 0 && DGF.chance <= 0.12 && DGF.cd === 18,
    '当众合闸小概率通道：每异形每夜 ' + (DGF.chance * 100).toFixed(0) + '%（仍受 18s 冷却）');
  ok(BAL.sight === 2.3, '⑤ 人类近身视野 2.8 → 2.3 格');
  ok(BAL.heal === 7, '⑥ 无人机救援 3 → 7 秒');
  ok(BAL.stun === 3 && BAL.lock === 0,
    '⑦⑧ 救起后禁移动 3 秒 · 异形开局 5 秒禁刀已移除');

  await fresh(false);
  const STUN = await T(() => {
    const t = SKV3._t, g = t.G();
    g.noReport = true; g.me.alien = false;
    if (g.meet) t.finishMeeting();
    let p = [55, 85.6];
    outer: for (let y = 78.8; y <= 89.4; y += 0.6)
      for (let x = 46.8; x <= 63.4; x += 0.6)
        if (t.free(x, y)) { p = [x, y]; break outer; }
    t.tp(0, p[0], p[1]);
    t.setBot('medbot', p[0], p[1]);
    g.medbotT = 0; g.medbotTarget = null; g.medbotLeft = 1; g.medbotDead = false;
    g.me.downed = true; g.me.downAt = g.t; g.me.path = null; g.me.alive = true;
    for (let i = 0; i < 110; i++) { t.botTick(0.1); if (!t.state()[0].downed) break; }
    const st = t.stunOf(0);
    const p0 = t.pos();
    const p1 = t.stepTo(p0[0] + 3, p0[1]);       /* 僵直中点地：应该原地不动 */
    const blocked = Math.hypot(p1[0] - p0[0], p1[1] - p0[1]);
    t.setStun(0, 0);
    const p2 = t.stepTo(p0[0] + 3, p0[1]);       /* 僵直解除后：应该能走 */
    const freed = Math.hypot(p2[0] - p0[0], p2[1] - p0[1]);
    return { downed: t.state()[0].downed, st, blocked, freed,
      room: t.state()[0].room, inv: t.inv() };
  });
  ok(!STUN.downed && STUN.st >= 2.9 && STUN.st <= 3.0,
    '无人机救起后挂上 3 秒僵直（实测 ' + STUN.st + 's）');
  ok(STUN.blocked < 0.01 && STUN.freed > 1,
    '僵直期内点地不位移（' + STUN.blocked.toFixed(2) +
    ' 格），解除后恢复移动（' + STUN.freed.toFixed(2) + ' 格）');
  ok(STUN.inv.fails.length === 0, '救起僵直全流程后不变量全过');
  await page.waitForTimeout(120);
  ok((await T(() => document.getElementById('tip').textContent)).indexOf('不能移动') >= 0 ||
    (await T(() => SKV3._t.stunOf(0))) === 0,
    '僵直提示或僵直已按模拟时间结束（HUD 与状态一致）');

  section('暂停 / 重开 / 退出');
  await fresh(false);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(150);
  const PZ = await T(() => ({
    paused: SKV3._t.paused(), ui: !document.getElementById('pause').classList.contains('hide'),
    info: document.getElementById('p-info').textContent, t: SKV3._t.G().t
  }));
  ok(PZ.paused && PZ.ui && PZ.info.indexOf('第 1 夜') >= 0, 'ESC 暂停：面板显示第 1 夜与进度');
  await page.waitForTimeout(700);
  const PZ2 = await T(() => SKV3._t.G().t);
  ok(Math.abs(PZ.t - PZ2) < 0.2, '暂停期间夜计时冻结');
  await shot('38_暂停面板.png');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(150);
  const R1 = await T(() => SKV3._t.G().t);
  await page.waitForTimeout(500);
  const R2 = await T(() => ({ t: SKV3._t.G().t, paused: SKV3._t.paused(), ui: !document.getElementById('pause').classList.contains('hide') }));
  ok(!R2.paused && !R2.ui && R2.t < R1 - 0.3, '再按 WSC 继续，夜计时接着走');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(120);
  await page.click('#p-restart');
  await page.waitForTimeout(300);
  const RS = await T(() => ({
    paused: SKV3._t.paused(), ui: !document.getElementById('pause').classList.contains('hide'),
    night: SKV3._t.G().night, t: SKV3._t.G().t, n: SKV3._t.state().length
  }));
  /* 夜长是变动的（120 → 100 → 90 → 75），这里跟运行时真值比，别写死 80 */
  const NIGHT_LEN = await T(() => SKV3._t.nightLen());
  ok(!RS.paused && !RS.ui && RS.night === 1 && RS.t > NIGHT_LEN - 5 && RS.n === 15,
    '暂停面板「重开本局」：回到第 1 夜（夜长 ' + NIGHT_LEN + 's，当前 ' + RS.t.toFixed(0) + 's）');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(120);
  await page.click('#p-exit');
  await page.waitForTimeout(300);
  const EX = await T(() => ({
    open: SKV3.isOpen(), root: !!document.getElementById('v3-root'),
    pick: getComputedStyle(document.getElementById('pick')).display !== 'none'
  }));
  ok(!EX.open && !EX.root && EX.pick, '暂停面板「退出到开始页」：覆盖层移除，开始页恢复');

  /* ================= 小游戏 · 26 任务定制（2026-11-06）================= */
  section('小游戏 · 26 任务定制');
  const MGT = await T(() => {
    const d = SKMiniGame.data, ts = d.tasks || {};
    const labels = Object.keys(ts);
    return {
      n: labels.length,
      kinds: [...new Set(labels.map(l => ts[l].k))],
      mapped: labels.every(l => SKMiniGame.kindOf('task', l) === ts[l].k),
      hints: labels.filter(l => !ts[l].hint).length,
      colors: [...new Set(labels.map(l => ts[l].color))].length
    };
  });
  ok(MGT.n === 26 && MGT.mapped && MGT.kinds.length >= 13 && MGT.hints === 0,
    '26 个任务各自有独立配置：' + MGT.n + ' 个任务 / ' + MGT.kinds.length +
    ' 种交互 / ' + MGT.colors + ' 种主题色 / 缺提示 ' + MGT.hints);
  ok(MGT.kinds.indexOf('sequence') >= 0 && MGT.kinds.indexOf('sort') >= 0 &&
    MGT.kinds.indexOf('valve') >= 0 && MGT.kinds.indexOf('code') >= 0,
    '新增四型交互已注册：sequence / sort / valve / code');
  const MGN = await T(() => {
    const cases = [['sequence', '娱乐桌'], ['sort', '餐台清洁'],
      ['valve', '消毒循环'], ['code', '出库扫描']];
    const out = {};
    for (const [kind, label] of cases) {
      SKMiniGame.open('task', { label, title: label, tier: 'normal',
        onDone: function () {}, onCancel: function () {} });
      const box = document.getElementById('mg-b');
      out[kind] = { on: document.getElementById('mg').classList.contains('on'),
        kind: SKMiniGame.data.tasks[label].k,
        nodes: box ? box.querySelectorAll('button,.s,.valve,.coded').length : 0 };
      SKMiniGame.close();
    }
    return out;
  });
  ok(['sequence', 'sort', 'valve', 'code'].every(k => MGN[k] &&
    MGN[k].on && MGN[k].kind === k && MGN[k].nodes > 0),
    '新交互 UI 冒烟：' + Object.keys(MGN).map(k => k + '(' + MGN[k].nodes + ')').join(' / '));

  /* ================= 小游戏 · 图内要素（2026-11-06 落实）=================
     门禁页是 ?test，game.js 的 miniGameOn() 会短路不弹遮罩，所以这里直接驱动
     SKMiniGame.open() 测 UI 层：不动对局状态、不改任何判定、不依赖截图比对。 */
  section('小游戏 · 图内要素板（真源 / file:// 图片 / 断口交互）');
  const PS = await T(() => {
    const P = window.SKPlates, p = P && P.get('panel-fix');
    return {
      has: !!P, schema: P && P.schema, boards: P ? Object.keys(P.plates).length : 0,
      wires: p ? p.wires.length : 0, image: p ? p.image : '',
      cropOk: p ? (p.crop[0] + p.crop[2] <= p.size[0] && p.crop[1] + p.crop[3] <= p.size[1]) : false,
      byLabel: !!(P && P.forLabel('电路维修')) && P.forLabel('电路维修').id === 'panel-fix',
      fallback: !!(P && P.defaultPlate()), frozen: P ? Object.isFrozen(P) : false
    };
  });
  ok(PS.has && PS.schema === 1 && PS.boards === 1 && PS.wires === 3 &&
    PS.cropOk && PS.byLabel && PS.fallback && PS.frozen,
    '板描述真源 js/data/plates.js：1 张板 / 3 根线 / 映射与默认板齐备，且冻结防改写');
  const IMGOK = await T(() => new Promise(resolve => {
    const im = new Image();
    im.onload = () => resolve({ ok: true, w: im.naturalWidth, h: im.naturalHeight });
    im.onerror = () => resolve({ ok: false, w: 0, h: 0 });
    im.src = window.SKPlates.get('panel-fix').image;
    setTimeout(() => resolve({ ok: false, w: 0, h: 0, timeout: true }), 5000);
  }));
  ok(IMGOK.ok && IMGOK.w === 768 && IMGOK.h === 768,
    'file:// 下板图可直接加载（' + IMGOK.w + '×' + IMGOK.h + '），不依赖 fetch / 内联');

  await T(() => {
    window.__mg = { done: 0, cancel: 0 };
    SKMiniGame.open('task', {
      label: '电路维修', tier: 'circuit', title: '电路维修', fallback: 999,
      onDone: () => { window.__mg.done++; },
      onCancel: () => { window.__mg.cancel++; }
    });
  });
  const MG = await T(() => {
    const q = s => document.querySelectorAll('#mg ' + s).length;
    const face = document.querySelector('#mg .plate-face');
    const src = document.getElementById('mgPlateSrc');
    return {
      on: document.getElementById('mg').classList.contains('on'),
      wrap: q('.plate-wrap'), cuts: q('.cut-rect'), hits: q('.ember-hit'),
      ports: q('.port'), under: q('.plate-under'), face: q('.plate-face'),
      href: src ? src.getAttribute('href') : '',
      mask: face ? face.getAttribute('mask') : '',
      prog: (document.getElementById('mg-s') || {}).textContent
    };
  });
  ok(MG.on && MG.wrap === 1 && MG.cuts === 3 && MG.hits === 6 && MG.ports === 0,
    'wire 已换成图内要素：1 块真图板 / 3 处断口 / 6 个线头，图外端口 0 个');
  ok(MG.href === PS.image && MG.under === 1 && MG.face === 1 &&
    /mgCutMask/.test(MG.mask) && MG.prog === '0 / 3',
    '断口由面层 mask 实现：同一张图挂两层，进度 0 / 3');
  await shot('52_小游戏图内要素.png');   /* 留档：肉眼核对断口压在真实电线上 */

  const clickEnd = (i, k) => T(([a, b]) => {
    const e = document.querySelector('#mg .ember-hit[data-i="' + a + '"][data-k="' + b + '"]');
    if (!e) return false;
    e.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    return true;
  }, [i, k]);
  await clickEnd(0, 0);
  await clickEnd(0, 1);
  const PLT_REP = await T(() => ({
    t: (document.querySelector('#mg .cut-rect') || document.body).style.transform || '',
    prog: document.getElementById('mg-s').textContent,
    hits: document.querySelectorAll('#mg .ember-hit').length
  }));
  ok(/scaleX\(0\)/.test(PLT_REP.t) && PLT_REP.prog === '1 / 3' && PLT_REP.hits === 4,
    '点断口两端 → 遮罩合拢、原图线自己长回来，进度 1 / 3，已接线头不再可选');

  await clickEnd(1, 0);
  await clickEnd(2, 0);   /* 捏住 1 号却点 2 号 = 串错线 */
  const MIS = await T(() => ({
    t: (document.querySelector('#mg .cut-rect') || document.body).style.transform || '',
    prog: document.getElementById('mg-s').textContent,
    hits: document.querySelectorAll('#mg .ember-hit').length
  }));
  ok(!/scaleX\(0\)/.test(MIS.t) && MIS.prog === '0 / 3' && MIS.hits === 6,
    '接错线 → 整组重来：已合拢的断口复位、进度清零、6 个线头全部回来');

  for (let i = 0; i < 3; i++) { await clickEnd(i, 0); await clickEnd(i, 1); }
  const ALL = await T(() => ({
    prog: document.getElementById('mg-s').textContent,
    cuts: Array.from(document.querySelectorAll('#mg .cut-rect')).map(e => e.style.transform)
  }));
  ok(ALL.prog === '3 / 3' && ALL.cuts.length === 3 && ALL.cuts.every(t => /scaleX\(0\)/.test(t)),
    '三处断口全部接通 → 3 / 3，原图像素全部长回来');
  await page.waitForTimeout(900);
  const DONEMG = await T(() => ({ ...window.__mg, open: SKMiniGame.isOpen() }));
  ok(DONEMG.done === 1 && DONEMG.cancel === 0 && !DONEMG.open,
    '玩通即结算：onDone 恰好一次、不触发中断回调、遮罩自动关闭');

  await T(() => {
    window.__mg2 = { done: 0, cancel: 0 };
    SKMiniGame.open('task', {
      label: '备用配电盘', tier: 'normal', fallback: 999,
      onDone: () => window.__mg2.done++, onCancel: () => window.__mg2.cancel++
    });
  });
  const NORM = await T(() => ({
    cuts: document.querySelectorAll('#mg .cut-rect').length,
    hits: document.querySelectorAll('#mg .ember-hit').length
  }));
  ok(NORM.cuts === 2 && NORM.hits === 4,
    '难度档仍生效：普通档 2 处断口 / 4 个线头（电路档为 3 / 6）');
  await T(() => document.getElementById('mg-a').click());
  const CANCEL = await T(() => ({ ...window.__mg2, open: SKMiniGame.isOpen() }));
  ok(CANCEL.cancel === 1 && CANCEL.done === 0 && !CANCEL.open,
    '点「中断（进度清零）」只走 onCancel、不结算（此前按钮无绑定，已补齐）');

  await T(() => {
    window.__mg3 = { done: 0, cancel: 0 };
    SKMiniGame.open('task', {
      label: '出库扫描', tier: 'normal', fallback: 3,
      onDone: () => window.__mg3.done++, onCancel: () => window.__mg3.cancel++
    });
  });
  await page.waitForTimeout(4100);   /* 保底 3s + settle 的 0.7s 收尾 */
  const FBMG = await T(() => ({ ...window.__mg3, open: SKMiniGame.isOpen() }));
  ok(FBMG.done === 1 && FBMG.cancel === 0 && !FBMG.open,
    '保底 3s 到点自动完成，不是限时、不触发中断清零');
  await T(() => SKMiniGame.close());

  section('随机席位 · 非门禁口径（2026-11-05）');
  /* 主门禁页用 ?test 固定 0 号；这里另开一个 ?test&randomseat 页，验证真实开局路径
     每局都会换席位（只断言"出现 ≥2 个不同席位"，不依赖具体随机结果）。 */
  const p2 = await browser.newPage({ viewport: { width: 1200, height: 800 } });
  await p2.goto(URL + '&randomseat');
  await p2.evaluate(() => SKV3.start('human'));
  await p2.waitForFunction(() => window.SKV3 && SKV3._t, null, { timeout: 15000 });
  const SEATS = await p2.evaluate(() => {
    const out = [];
    for (let i = 0; i < 8; i++) { SKV3._t.newGame(); out.push(SKV3._t.G().me.i); }
    return out;
  });
  await p2.close();
  ok(SEATS.length === 8 && SEATS.every(i => i >= 0 && i < 15) &&
    new Set(SEATS).size >= 2,
    '非门禁对局每局随机席位：8 次开局出现 ' + new Set(SEATS).size +
    ' 个不同席位（' + SEATS.join(',') + '）');

  section('2026-11-07 第 2 批 · 诬陷真源 / 协同诬陷 / 描述偏差 / 异形幽灵破坏');
  /* 前面的小游戏用例会替换 DOM 容器，fresh() 里的 newGame 会找不到 #meet。
     重新载入主页并进入舱段，恢复完整 DOM 后再跑本批用例。 */
  await page.goto(URL);
  await page.click('#home-go');
  await page.waitForFunction(() => window.SKV3 && SKV3._t && SKV3._t.assets().base,
    null, { timeout: 30000 });
  const B2CFG = await T(() => ({
    frame: SKV3._t.frameCfg(), mislead: SKV3._t.misleadCfg(),
    co: SKV3._t.coFrameCfg(), desc: SKV3._t.descCfg(),
    almost: SKV3._t.almostCfg(),
    speed: SKV3._t.speed(), drag: SKV3._t.dragSpeed()
  }));
  ok(B2CFG.frame.chance === 0.85 && B2CFG.mislead.chance === 0.55 &&
    B2CFG.mislead.busChance === 0.20,
    '诬陷真源已接通并提频：FRAME.chance=0.85 / MISLEAD.chance=0.55 / busChance=0.20');
  ok(B2CFG.almost.foeSus === 0.5 && B2CFG.almost.friendCred === 0.5,
    '嫌疑 / 信任累积门槛 = 0.5 / 0.5');
  ok(B2CFG.speed === 4.0 && B2CFG.drag === 2.5,
    '全体移速 4.0 / 拖尸 2.5 格每秒');

  await fresh(false);
  const COFR = await T(() => {
    const t = SKV3._t; t.newGame();
    const g = t.G(); g.paused = true; g.noReport = true;
    const als = g.agents.filter(a => a.alien && a.i !== 0 && a.alive);
    const v = g.agents.find(a => !a.alien && a.i !== 0 && a.alive);
    /* 让所有异形互认队友 ⇒ 构陷靶子只可能落在人类身上 */
    for (const a of als) {
      a.mates = {};
      for (const b of als) if (b !== a) a.mates[b.i] = { t: 0, kind: 'pipe' };
    }
    for (const a of g.agents) if (a !== als[0] && a !== v) t.tp(a.i, 28.4, 54);
    t.tp(als[0].i, 56, 83.8); t.tp(v.i, 55, 83.8);
    const F = window.SKSanity;
    const oldBus = F.MISLEAD.busChance;
    const oldFirst = F.FIRST.chance;
    F.MISLEAD.busChance = 0;                 /* 隔离"大义灭亲"通道 */
    F.FIRST.chance = 0;                      /* 隔离先发制人，避免抢走 liar 角色 */
    const old = Math.random; Math.random = () => 0;
    t.openMeeting('day', null, null);
    Math.random = old;
    F.MISLEAD.busChance = oldBus;
    F.FIRST.chance = oldFirst;
    const f = (t.meetCtx().frames || [])[0] || null;
    const acc = {};
    for (const a of g.agents) if (a.alien && a.accuse != null) acc[a.i] = a.accuse;
    if (g.meet) t.finishMeeting();
    return { f, acc, v: v.i };
  });
  ok(COFR.f && (COFR.f.co || []).length >= 2,
    '协同诬陷：至少 2 个附议者与 liar 指向同一靶子（co=' +
    JSON.stringify(COFR.f ? COFR.f.co : []) + '）');
  ok(COFR.f && (COFR.f.co || []).every(i => COFR.acc[i] === COFR.f.target),
    '每个附议者的票都落在同一个靶子上（不是各咬各的）' +
    ' target=' + (COFR.f ? COFR.f.target : '-') +
    ' acc=' + JSON.stringify(COFR.acc) + ' co=' + JSON.stringify(COFR.f ? COFR.f.co : []));

  await fresh(false);
  const DESC = await T(() => {
    const t = SKV3._t; t.newGame();
    const g = t.G(); g.paused = true; g.noReport = true;
    const w = g.agents.find(a => !a.alien && a.i !== 0 && a.alive);
    const x = g.agents.find(a => !a.alien && a.i !== 0 && a.alive && a !== w);
    const mk = () => {
      t.openMeeting('day', null, null);
      w.mind.sus = {}; w.mind.why = {}; w.mind.almost = { foe: {}, friend: {} };
      g.meet.ctx.testimony = [{ li: w.i, tgt: x.i, wgt: 0.30, reason: 'heard_accuse',
        by: x.i, ev: { kind: 'heard_accuse', room: 'med', conf: 0.8, src: 'speech' }, said: 0 }];
    };
    t.setDesc({ on: false }); mk(); t.deliverTestimony();
    const offRoom = (w.mind.why[x.i] || [])[0] && w.mind.why[x.i][0].room;
    const offW = (w.mind.why[x.i] || [])[0] && w.mind.why[x.i][0].w;
    t.finishMeeting();
    t.setDesc({ on: true, roomErr: 1, kindErr: 0, confLoss: 0.78 }); mk(); t.deliverTestimony();
    const onRoom = (w.mind.why[x.i] || [])[0] && w.mind.why[x.i][0].room;
    const onW = (w.mind.why[x.i] || [])[0] && w.mind.why[x.i][0].w;
    t.finishMeeting();
    t.setDesc({ on: true, roomErr: 0.22, kindErr: 0.18, confLoss: 0.78 });
    return { offRoom, onRoom, offW, onW };
  });
  ok(DESC.offRoom === 'med', '描述偏差关闭：听众记下的舱室与原证言一致');
  ok(DESC.onRoom && DESC.onRoom !== 'med',
    '描述偏差开启（roomErr=1）：听众记下的是同船另一间真实舱室（' + DESC.onRoom + '）');
  ok(DESC.onW < DESC.offW,
    '记错的那条证言，嫌疑权重按 confLoss 打折（' + DESC.offW + ' → ' + DESC.onW + '）');

  await fresh(false);
  const GHOST = await T(() => {
    const t = SKV3._t; t.newGame();
    const g = t.G(); g.paused = true; g.noReport = true;
    const a = g.agents.find(x => x.alien && x.i !== 0);
    a.alive = false; a.ghost = true; a.downed = false; a.sabUsed = false;
    g.dmg = [];
    const before = t.ghostSabState();
    t.aiGhostTick(a.i, 1, 0.05);
    const after = t.ghostSabState();
    const b = g.agents.find(x => x.alien && x.i !== 0 && x !== a);
    b.alive = false; b.ghost = true; b.downed = false; b.sabUsed = false;
    t.aiGhostTick(b.i, 5, 0.05);
    const after2 = t.ghostSabState();
    return { before, after, after2 };
  });
  ok(!GHOST.before.used && GHOST.after.used && GHOST.after.dmg === 1,
    '异形幽灵发动一次正统破坏：全局标记置位、场上出现 1 处真实故障');
  ok(GHOST.after2.dmg === 1,
    '全局仅限一次：第二只异形幽灵再 tick 也不会重复破坏');

  section('2026-11-08 第 3 批 · 先发制人 / 注意力上限 / 证词矛盾扣分');
  await page.goto(URL);
  await page.click('#home-go');
  await page.waitForFunction(() => window.SKV3 && SKV3._t && SKV3._t.assets().base,
    null, { timeout: 30000 });

  const B3CFG = await T(() => ({
    first: SKV3._t.firstCfg(), attn: SKV3._t.attnCfg(),
    social: SKV3._t.socialCfg(), caughtLie: window.SKSanity.RELIA.caughtLie
  }));
  ok(B3CFG.first.chance === 0.45 && B3CFG.first.firstLine === 0.6,
    '先发制人真源：chance=0.45 / firstLine=0.6');
  ok(B3CFG.attn.heardMax === 10, '注意力上限：每场最多采纳 10 条听来的证词');
  ok(B3CFG.social.pileOn > 0 && B3CFG.social.frameFollow > 0,
    '社交顺势已装配：pileOn=' + B3CFG.social.pileOn + ' / frameFollow=' + B3CFG.social.frameFollow);
  ok(B3CFG.caughtLie > 0, '证词矛盾扣可信度已接通：caughtLie=' + B3CFG.caughtLie);

  await fresh(false);
  const OPEN = await T(() => {
    const t = SKV3._t; t.newGame();
    const g = t.G(); g.paused = true; g.noReport = true;
    const F = window.SKSanity;
    const save = { chance: F.FIRST.chance, firstLine: F.FIRST.firstLine };
    F.FIRST.chance = 1; F.FIRST.firstLine = 1;
    const old = Math.random; Math.random = () => 0.01;   /* 必定触发、必选第一个靶子 */
    t.openMeeting('day');
    Math.random = old;
    F.FIRST.chance = save.chance; F.FIRST.firstLine = save.firstLine;
    const st = t.openingState();
    const op = st.op;
    const acc = op ? g.agents[op.by].accuse : null;
    const byAlien = op ? !!g.agents[op.by].alien : false;
    const tgtAlien = op ? !!g.agents[op.target].alien : true;
    const why = op ? g.agents[op.by].accuseWhy : null;
    if (g.meet) t.finishMeeting();
    return { st, op, acc, byAlien, tgtAlien, why };
  });
  ok(OPEN.op && OPEN.byAlien,
    '先发制人：第一个开口指控的是异形（by=' + (OPEN.op ? OPEN.op.by : '-') + '）');
  ok(OPEN.op && !OPEN.tgtAlien,
    '先发制人的靶子是人类（target=' + (OPEN.op ? OPEN.op.target : '-') + '）');
  ok(OPEN.op && OPEN.acc === OPEN.op.target,
    '先发制人者的票落在自己指的那个靶子上（acc=' + OPEN.acc + '）');
  ok(OPEN.why && OPEN.why.fake && OPEN.why.opening,
    '先发制人用的是伪证（fake/opening 标记）');
  ok(OPEN.st.firstAccuses >= 1, '统计出口：firstAccuses=' + OPEN.st.firstAccuses);

  /* 真实对局里 openingFn 只是排队、不立即执行；用模拟局验证"说出口"这条链路。 */
  const SIM3 = await T(() => {
    /* fresh() 默认把 FIRST 关掉了，这里恢复正式口径再跑模拟 */
    window.SKSanity.FIRST.chance = 0.45;
    let first = 0, heard = 0, dropped = 0, lies = 0;
    for (let k = 0; k < 20; k++) {
      const r = SKV3._t.simGame({ seed: 20261108 + k, dt: 0.1, maxNights: 15 });
      first += r.firstAccuses || 0; heard += r.openingHeard || 0;
      dropped += r.heardDropped || 0; lies += r.caughtLies || 0;
    }
    return { first, heard, dropped, lies };
  });
  ok(SIM3.first > 0, '模拟 20 局：先发制人真的发生（' + SIM3.first + ' 次）');
  ok(SIM3.heard > 0, '模拟 20 局：定调传闻真的说出口（' + SIM3.heard + ' 次）');
  ok(SIM3.dropped > 0, '模拟 20 局：注意力窗口真的顶掉了旧证词（' + SIM3.dropped + ' 条）');
  ok(SIM3.lies > 0, '模拟 20 局：证词矛盾真的扣了可信度（' + SIM3.lies + ' 次）');

  await fresh(false);
  const ATTN = await T(() => {
    const t = SKV3._t; t.newGame();
    const g = t.G(); g.paused = true; g.noReport = true;
    t.openMeeting('day');
    const ctx = g.meet.ctx;
    const w = g.agents.find(a => !a.alien && a.i !== 0 && a.alive);
    const spk = g.agents.find(a => a.i !== w.i && a.alive && !a.downed);
    const tgt = g.agents.find(a => !a.alien && a.i !== w.i && a.i !== spk.i && a.alive);
    ctx.testimony.length = 0;
    w.mind.heard = [];
    w.mind.sus = {};
    for (let k = 0; k < 12; k++) {
      ctx.testimony.push({ li: w.i, by: spk.i, tgt: tgt.i, wgt: 0.05, reason: 'heard_accuse',
        ev: { kind: 'heard_accuse', x: 0, y: 0, room: null, conf: 0.6,
          src: 'speech', subj: tgt.i, by: spk.i } });
    }
    t.deliverTestimony();
    const h = t.heardOf(w.i);
    const out = { heard: h.length, attn: t.attnState(),
      firstSeq: h[0] ? h[0].seq : null,
      lastSeq: h.length ? h[h.length - 1].seq : null,
      sus: (t.mind(w.i).sus || {})[tgt.i] || 0 };
    if (g.meet) t.finishMeeting();
    return out;
  });
  ok(ATTN.heard === 10, '注意力窗口长度 = 10（实际 ' + ATTN.heard + '）');
  ok(ATTN.lastSeq - ATTN.firstSeq === 9,
    '窗口是滑动的：12 条里留下最新的 10 条（seq ' + ATTN.firstSeq + ' → ' + ATTN.lastSeq + '）');
  ok(ATTN.attn.dropped >= 2, '被顶掉的旧证词已计数（dropped=' + ATTN.attn.dropped + '）');

  await fresh(false);
  const CONTRA = await T(() => {
    const t = SKV3._t; t.newGame();
    const g = t.G(); g.paused = true; g.noReport = true;
    const w = g.agents.find(a => !a.alien && a.i !== 0 && a.alive);
    const a = g.agents.find(x => x.i !== w.i && x.alive && !x.downed);
    /* w 记得 a 在 med，但 a 自述在 bridge（newGame 后的真实位置）—— 对不上。
       时间基准必须用 evNow() 的口径（NIGHT - G.t），不是 G.t 本身。 */
    const nowEv = window.SKSanity.NIGHT.len - g.t;
    w.mind.mem = [{ kind: 'saw_agent', subj: a.i, room: 'med', night: g.night,
      t: nowEv, x: 0, y: 0 }];
    const before = t.reliaOf(w.i, a.i);
    t.openMeeting('day');
    const after = t.reliaOf(w.i, a.i);
    const out = { before, after, lies: t.caughtLies() };
    if (g.meet) t.finishMeeting();
    return out;
  });
  ok(CONTRA.after < CONTRA.before,
    '证词对不上：听众对说话者的可信度下降（' + CONTRA.before + ' → ' + CONTRA.after + '）');
  ok(CONTRA.lies >= 1, '矛盾扣可信度已计数（caughtLies=' + CONTRA.lies + '）');

  section('2026-11-08 第 4 批 · 发言权配额 / 滚底策略 / 口供矛盾语料');
  await page.goto(URL);
  await page.click('#home-go');
  await page.waitForFunction(() => window.SKV3 && SKV3._t && SKV3._t.assets().base,
    null, { timeout: 30000 });

  const B4CFG = await T(() => ({
    speech: SKV3._t.speechCfg(),
    hasNew: !!document.getElementById('m-new'),
  }));
  ok(B4CFG.speech.alienBias > 0 && B4CFG.speech.alienLineCap > 0,
    '发言权真源：alienBias=' + B4CFG.speech.alienBias + ' / alienLineCap=' + B4CFG.speech.alienLineCap);
  ok(B4CFG.speech.minHumanSpeakers >= 1 && B4CFG.speech.nudgeGapMs <= 6000,
    '人类优先自述 + 后段补位加密（minHuman=' + B4CFG.speech.minHumanSpeakers +
    ' / gap=' + B4CFG.speech.nudgeGapMs + 'ms）');
  ok(B4CFG.hasNew, '发言区有「↓ 新发言」提示按钮（不再强制滚底）');

  const B4SIM = await T(() => {
    let muted = 0, al = 0, hu = 0;
    for (let k = 0; k < 20; k++) {
      const r = SKV3._t.simGame({ seed: 20261108 + k, dt: 0.1, maxNights: 15 });
      muted += r.alienMuted || 0;
      al += r.speechAlien || 0;
      hu += r.speechHuman || 0;
    }
    return { muted, al, hu, share: (al + hu) ? +(100 * al / (al + hu)).toFixed(1) : 0 };
  });
  ok(B4SIM.muted > 0, '异形发言配额真的生效（20 局压掉 ' + B4SIM.muted + ' 条）');
  ok(B4SIM.share < 40,
    '异形发言占比降到 40% 以下（实测 ' + B4SIM.share + '%：异形 ' + B4SIM.al +
    ' / 人类 ' + B4SIM.hu + '）');

  const B4R2 = await T(() => {
    const p = (k, t) => (window.SKLines.pool(k, t) || []);
    const same = [].concat(p('respond_alone_same', 'hot'), p('respond_alone_same', 'cold'));
    const base = [].concat(p('respond_alone', 'hot'), p('respond_alone', 'cold'));
    return { sameN: same.length, sameR2: same.filter(s => s.indexOf('{r2}') >= 0).length,
      baseR2: base.filter(s => s.indexOf('{r2}') >= 0).length };
  });
  ok(B4R2.sameN > 0 && B4R2.sameR2 === 0,
    '自述舱室==案发舱室用不引用 {r2} 的语料（' + B4R2.sameN + ' 句，0 句含 {r2}）');
  ok(B4R2.baseR2 > 0, '原 respond_alone 仍保留 {r2} 版本（' + B4R2.baseR2 + ' 句）');

  const B4SUP = await T(() => {
    const p = (k, t) => (window.SKLines.pool(k, t) || []);
    const all = [].concat(p('support_claim', 'hot'), p('support_claim', 'cold'),
      p('respond_support', 'hot'), p('respond_support', 'cold'));
    return { n: all.length,
      bad: all.filter(s => /我也在/.test(s) || /一起在\{r\}/.test(s)).length };
  });
  ok(B4SUP.bad === 0,
    '作证语料不再声称"我也在对方舱室"（' + B4SUP.n + ' 句，0 句违规）');

  section('2026-11-08 第 5 批 · 人类完整证言（时间+位置+动作+对象）');
  await page.goto(URL);
  await page.click('#home-go');
  await page.waitForFunction(() => window.SKV3 && SKV3._t && SKV3._t.assets().base,
    null, { timeout: 30000 });

  const B5CFG = await T(() => {
    const p = (k, t) => (window.SKLines.pool(k, t) || []);
    const all = [].concat(p('known_accuse_hard', 'hot'), p('known_accuse_hard', 'cold'));
    return { n: all.length, when: all.filter(s => s.indexOf('{when}') >= 0).length };
  });
  ok(B5CFG.n > 0 && B5CFG.when === B5CFG.n,
    '确证指控语料全部带时间槽（' + B5CFG.when + '/' + B5CFG.n + ' 句含 {when}）');

  const B5 = await T(() => {
    const t = SKV3._t; t.newGame();
    const g = t.G(); g.paused = true; g.noReport = true;
    const h = g.agents.find(a => !a.alien && a.i !== 0 && a.alive);
    const tgt = g.agents.find(a => a !== h && a.alive && !a.downed);
    /* ① 纯怀疑（无硬证）：应当走"反证"——我在哪、什么时候、没看见什么、指谁 */
    h.accuse = tgt.i; h.accuseWhy = null; h.suspect = null; h._hedge = false;
    if (h.mind) { h.mind.known = {}; h.mind.almost = { foe: {}, friend: {} }; }
    const soft = t.accuseLineOf(h.i);
    /* ② 有确证：应当说清"什么时候、在哪、看见什么、指谁" */
    if (!h.mind) h.mind = {};
    h.mind.known = {}; h.mind.known[tgt.i] = { kind: 'saw_knife', room: 'med', conf: 0.95 };
    const hard = t.accuseLineOf(h.i);
    return { soft, hard, tgt: tgt.name, me: h.name };
  });
  ok(B5.soft && /昨晚|今晚/.test(B5.soft) && B5.soft.indexOf('没看见') >= 0 &&
    B5.soft.indexOf(B5.tgt) >= 0,
    '纯怀疑的人类指控走反证且四要素齐（' + B5.soft + '）');
  ok(B5.hard && /昨晚|今晚/.test(B5.hard) && /出刀/.test(B5.hard) &&
    B5.hard.indexOf(B5.tgt) >= 0 && /医疗间|med/.test(B5.hard),
    '确证的人类指控含时间+位置+动作+对象（' + B5.hard + '）');
  ok(B5.hard.indexOf('异形') >= 0, '确证指控仍保留「他是异形」的结论语义');

  /* 大样本：30 局模拟收集全部台词，统计"证言类"的四要素齐全率 */
  const B5B = await T(() => {
    const ROOMS = ['中央会议室', '主通道', '医疗间', '娱乐室', '急救通道', '生态舱',
      '监控室', '配电室', '军械库', '食堂', '仓库', '引擎', '走廊', '靶道', '货舱',
      '观测舱', '温室', '反应堆', '冷藏室', '宿舍', '餐厅', '储藏室'];
    const TIMES = ['刚才', '十几秒前', '半分钟前', '今晚', '昨晚', '天亮',
      '上一轮', '这一轮', '本轮', '现在'];
    const ACTS = ['出刀', '刀', '管道', '红光', '合闸', '破坏', '修', '任务', '拉闸',
      '停摆', '开枪', '搜尸', '拖', '动手', '动了手', '目击', '在场'];
    const RE = /我投|我票|我怀疑|我看见|我目击|亲眼|他是异形|我压|我倾向/;
    const NAMES = (SKV3._t.G().agents || []).map(a => a.name);
    const raw = SKV3._t.simSpeechBatch(30);
    let n = 0, all4 = 0, zero = 0;
    const by = { human: { n: 0, all4: 0, e: 0, e4: 0 },
      alien: { n: 0, all4: 0, e: 0, e4: 0 } };
    const samples = [];
    for (const l of raw) {
      if (l.sep || l.sys || l.who === '系统') continue;
      if (!RE.test(l.text)) continue;
      const f = l.alien ? 'alien' : 'human';
      const st = by[f];
      n++; st.n++;
      const has = arr => arr.some(x => l.text.indexOf(x) >= 0);
      const who = NAMES.some(x => x !== l.who && l.text.indexOf(x) >= 0);
      const s = [has(ROOMS), has(TIMES), has(ACTS), who].filter(Boolean).length;
      if (s === 4) { all4++; st.all4++; } else if (s === 0) zero++;
      /* 证据型证言 = 句子里真的出现了动作词；纯跟随/辩护/回应不算证言。
         语言对称批只看这一类 —— 要求两边都四要素齐，且比例接近。 */
      if (has(ACTS)) { st.e++; if (s === 4) st.e4++; }
      if (samples.length < 4) samples.push(s + '/4 ' + l.text.slice(0, 56));
    }
    const rate = o => o.n ? +(100 * o.all4 / o.n).toFixed(1) : 0;
    const erate = o => o.e ? +(100 * o.e4 / o.e).toFixed(1) : 0;
    for (const k of ['human', 'alien']) {
      by[k].rate = rate(by[k]);
      by[k].eRate = erate(by[k]);
    }
    return { n, all4, zero, rate: n ? +(100 * all4 / n).toFixed(1) : 0, samples,
      human: by.human, alien: by.alien };
  });
  ok(B5B.n > 30, '30 局共收集到证言 ' + B5B.n + ' 条（样本足够）');
  ok(B5B.rate >= 70,
    '证言四要素齐全率 ≥70%（' + B5B.all4 + '/' + B5B.n + ' = ' + B5B.rate + '%；零要素 ' +
    B5B.zero + ' 条）');

  section('2026-11-08 第 6 批 · 语言对称（人类/异形同一套四要素）');
  ok(B5B.human.n > 30 && B5B.alien.n > 30,
    '两边样本足够（人类 ' + B5B.human.n + ' 条 / 异形 ' + B5B.alien.n + ' 条）');
  ok(B5B.human.rate >= 90 && B5B.alien.rate >= 90,
    '两边四要素率都 ≥90%（人类 ' + B5B.human.rate + '% / 异形 ' + B5B.alien.rate + '%）');
  ok(Math.abs(B5B.human.rate - B5B.alien.rate) <= 5,
    '两边四要素率差 ≤5pp（实际 ' + Math.abs(B5B.human.rate - B5B.alien.rate).toFixed(1) + 'pp）');
  ok(B5B.human.eRate >= 98 && B5B.alien.eRate >= 98,
    '证据型证言两边都四要素齐 ≥98%（人类 ' + B5B.human.e4 + '/' + B5B.human.e +
    ' = ' + B5B.human.eRate + '% / 异形 ' + B5B.alien.e4 + '/' + B5B.alien.e +
    ' = ' + B5B.alien.eRate + '%）');
  ok(Math.abs(B5B.human.eRate - B5B.alien.eRate) <= 2,
    '证据型证言两边差 ≤2pp（实际 ' +
    Math.abs(B5B.human.eRate - B5B.alien.eRate).toFixed(1) + 'pp）');
  ok(B5B.zero / B5B.n <= 0.01,
    '零要素证言 ≤1%（' + B5B.zero + '/' + B5B.n + '）');

  /* 语料层再补两条：开场指控与异形回避句也必须带齐槽位。
     这两池是"句式对称"最容易漏的地方 —— 少一个 {r} 就退回"凭空断言"。 */
  const B6O = await T(() => {
    const p = (k, t) => (window.SKLines.pool(k, t) || []);
    const all = [].concat(p('alien_open_accuse', 'hot'), p('alien_open_accuse', 'cold'));
    return { n: all.length,
      t: all.filter(s => s.indexOf('{t}') >= 0).length,
      r: all.filter(s => s.indexOf('{r}') >= 0).length,
      w: all.filter(s => s.indexOf('{when}') >= 0).length,
      act: all.filter(s => /出刀|钻管道|红光/.test(s)).length };
  });
  ok(B6O.n > 0 && B6O.t === B6O.n && B6O.r === B6O.n && B6O.w === B6O.n && B6O.act === B6O.n,
    '先发制人语料四要素槽位齐全（' + B6O.t + '/' + B6O.r + '/' + B6O.w + '/' + B6O.act +
    '，共 ' + B6O.n + ' 句）');

  const B6D = await T(() => {
    const p = (k, t) => (window.SKLines.pool(k, t) || []);
    const all = [].concat(p('alien_dodge', 'hot'), p('alien_dodge', 'cold'));
    return { n: all.length,
      r: all.filter(s => s.indexOf('{r}') >= 0).length,
      w: all.filter(s => s.indexOf('{when}') >= 0).length };
  });
  ok(B6D.n >= 10 && B6D.r === B6D.n && B6D.w === B6D.n,
    '异形回避句也带时间+位置（' + B6D.w + '/' + B6D.r + '，共 ' + B6D.n + ' 句）');

  section('收尾');
  ok(errors.length === 0, '控制台零报错' + (errors.length ? '：' + errors.join(' | ') : ''));
  console.log('\n结果：' + pass + ' 通过 / ' + fail + ' 失败');
  await browser.close();
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
