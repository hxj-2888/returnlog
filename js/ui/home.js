/* ==== ARCH NODE · 架构节点标注（根 ARCHITECTURE.md） ====
 * layer     : T2
 * domain    : 玩家决策
 * definedBy : 主页
 * truth     : js/ui/home.js#SKMapData SVG
 * verify    : 冒烟
 * flag      : F  (F=现行事实 / N=规范裁定)
 * 说明      : 本注释只作架构标注，不改变任何运行逻辑；多父只引用不复制。
 * ============================================================== */
/* =============================================================
 * SKHome · 进入游戏前的主页（返航录V3 · 2026-10-30）
 * -------------------------------------------------------------
 * 职责：   把开始页做成"船体即主视觉"：用 SKMapData 生成整船 SVG，
 *          手电遮罩跟随指针，身份卡选中时锚亮对应舱室，并填真实统计。
 * 不变量： · 只读 SKMapData，不读写对局状态、不定义游戏状态；
 *          · 不含任何业务动作：选身份与开局由 js/main.js 通过
 *            [data-role] / #home-go 驱动（本文件只发 sk:role 事件）；
 *          · 不新增资源请求（无 fetch / 无外链），file:// 直接可用；
 *          · 必须在 js/data/map.js 之后加载。
 * 对外：   window.SKHome = { refresh() }
 * ============================================================= */
(function (global) {
  'use strict';

  var M = global.SKMapData;
  if (!M) return;
  /* 胜利目标分的唯一真源是 js/ai/sanity.js#SKSanity.WIN.pts（game.js 的 WIN_PTS 同源）。 */
  var WIN = (global.SKSanity && global.SKSanity.WIN) ? global.SKSanity.WIN.pts : '—';

  /* 身份 → 船上的锚点舱室与说明。人类看任务舱；异形看管道口；旁观看会议室。 */
  var ANCHOR = {
    human: {
      rooms: ['ecosys', 'engine', 'power', 'med', 'armory', 'cam', 'warehouse', 'transit', 'fun'],
      what: 'point', acc: '#8FA6C0',
      note: '<h4>人类 · 你在这艘船上要做什么</h4>每人派发 <b>1 高难 + 3 普通</b>共 4 个任务点，' +
        '站桩维修（普通 8 秒 / 高难 12 秒 / 电路维修 15 秒）。' +
        '亮舱整间可见，暗舱只有 7 格手电锥 + <b>2.3 格</b>近身视野。' +
        '发现尸体按 <code>R</code> 拉铃开会，凭证据投票把人驱逐出舱。'
    },
    alien: {
      rooms: ['engine', 'cam', 'armory', 'warehouse', 'transit', 'med'],
      what: 'pipe', acc: '#E0574F',
      note: '<h4>异形 · 你和同类互不认识</h4>每夜一次出刀、一次破坏技，可以钻这 6 个管道口' +
        '（<b>引擎 / 监控 / 军械 / 仓库 / 食堂 / 医疗间</b>）瞬移。' +
        '同类之间没有队友名单——只有亲眼看见对方出刀 / 钻管道 / 破坏，才会认出他是队友。' +
        '近身视野 <b>3.11 格</b>。'
    },
    spect: {
      rooms: ['bridge'], what: 'none', acc: '#7FD3F0',
      note: '<h4>旁观者 · 第 16 人</h4>不占 15 席，全知无迷雾，9 格/秒的相机幽灵。' +
        '能看不能动：不发言、不投票、不做任何局内动作，只能快进讨论。'
    },
    design: {
      rooms: ['bridge', 'cam', 'ecosys', 'power', 'transit', 'fun', 'engine',
        'med', 'armory', 'warehouse'],
      what: 'all', acc: '#63E0A8',
      note: '<h4>设计者 · 纯净视图</h4>给做地图和任务点的人用的静态沙盒：' +
        '<b>15 个席位不绘制</b>，画面只剩船体、掩体、门、管道口与 <b>26 个任务点</b>。' +
        '本人是幽灵，<b>直线穿墙</b>、全船无迷雾；夜钟不走、AI 不动、不开会、不结算。' +
        '交互全部开放：任意任务点可开工（不占维修进度）、任意管道口可钻、' +
        '电闸 / 监控 / 圆桌领单 / 补给点 / 破坏故障都能试。'
    }
  };

  function esc(s) {
    return String(s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }

  /* ---------------- 整船 SVG（与对局同一份地图数据） ---------------- */
  function shipSVG(id) {
    var out = ['<svg id="' + (id || 'home-ship') + '" viewBox="0 0 ' + M.bounds.w + ' ' + M.bounds.h +
      '" preserveAspectRatio="xMidYMid meet" aria-hidden="true">'];
    M.corridors.forEach(function (c) {
      out.push('<polyline class="corr" points="' + c.pts.map(function (p) {
        return p[0].toFixed(1) + ',' + p[1].toFixed(1);
      }).join(' ') + '" stroke-width="' + M.scale.corridor_w + '"/>');
    });
    M.rooms.forEach(function (r) {
      out.push('<polygon class="room ' + (r.light === 'dark' ? 'dark' : 'lit') +
        '" data-room="' + r.id + '" points="' + r.poly.map(function (p) {
          return p[0].toFixed(1) + ',' + p[1].toFixed(1);
        }).join(' ') + '"/>');
    });
    M.cover.forEach(function (c) {
      out.push('<rect class="cover" data-room="' + c.room + '" x="' + c.x + '" y="' + c.y +
        '" width="' + c.w + '" height="' + c.h + '"/>');
    });
    M.points.forEach(function (p) {
      out.push('<circle class="pt ' + (p.kind === 'hard' ? 'hard' : 'norm') +
        '" data-room="' + p.room + '" cx="' + p.x + '" cy="' + p.y + '" r="0.42"/>');
    });
    M.pipes.forEach(function (q) {
      out.push('<circle class="pipe" data-room="' + q.room + '" cx="' + q.x + '" cy="' + q.y +
        '" r="0.85"/>');
    });
    M.rooms.forEach(function (r) {
      /* 与游戏内房名一致：label 再往下 1.2 格，避免名字压在房间顶边上 */
      out.push('<text class="rlabel" x="' + r.label[0] + '" y="' + (r.label[1] + 1.2) + '">' +
        esc(r.name) + '</text>');
    });
    out.push('</svg>');
    return out.join('');
  }

  function anchors() {
    var ship = document.getElementById('home-ship');
    if (!ship) return null;
    if (ship.__idx) return ship.__idx;
    var rooms = [].slice.call(ship.querySelectorAll('.room'));
    ship.__idx = {
      ship: ship,
      rooms: rooms,
      labels: [].slice.call(ship.querySelectorAll('.rlabel')),
      covers: [].slice.call(ship.querySelectorAll('.cover')),
      pts: [].slice.call(ship.querySelectorAll('.pt')),
      pipes: [].slice.call(ship.querySelectorAll('.pipe'))
    };
    return ship.__idx;
  }

  function highlight(role) {
    var idx = anchors();
    if (!idx) return;
    var a = ANCHOR[role] || ANCHOR.human;
    var set = {};
    a.rooms.forEach(function (id) { set[id] = 1; });
    idx.ship.classList.add('hl');
    idx.ship.style.setProperty('--acc', a.acc);
    var on = {};
    idx.rooms.forEach(function (el, i) {
      var hit = !!set[el.getAttribute('data-room')];
      el.classList.toggle('on', hit);
      if (hit) on[el.getAttribute('data-room')] = 1;
      if (idx.labels[i]) idx.labels[i].classList.toggle('on', hit);
    });
    idx.covers.forEach(function (el) {
      el.classList.toggle('on', !!on[el.getAttribute('data-room')]);
    });
    idx.pts.forEach(function (el) {
      el.classList.toggle('on', (a.what === 'point' || a.what === 'all') && !!on[el.getAttribute('data-room')]);
    });
    idx.pipes.forEach(function (el) {
      el.classList.toggle('on', (a.what === 'pipe' || a.what === 'all') && !!on[el.getAttribute('data-room')]);
    });
    var note = document.getElementById('home-note');
    if (note) {
      note.innerHTML = a.note;
      note.classList.add('show');
    }
  }

  /* ---------------- 真实统计 ---------------- */
  function fillStats() {
    var wrap = document.getElementById('home-stats');
    if (!wrap) return;
    var hard = M.points.filter(function (p) { return p.kind === 'hard'; }).length;
    var items = [
      [M.rooms.length, '舱室'],
      [M.cover.length, '硬掩体'],
      [M.points.length, '任务点'],
      [hard, '高难'],
      [M.pipes.length, '管道口'],
      [WIN, '分返航']
    ];
    wrap.innerHTML = items.map(function (it) {
      return '<span class="chip"><b>' + it[0] + '</b>' + it[1] + '</span>';
    }).join('');
  }

  /* ---------------- 手电遮罩 ---------------- */
  function bindTorch() {
    var scene = document.getElementById('home-scene');
    var torch = document.getElementById('home-torch');
    if (!scene || !torch) return;
    scene.addEventListener('mousemove', function (e) {
      var r = scene.getBoundingClientRect();
      torch.style.setProperty('--mx', (e.clientX - r.left) + 'px');
      torch.style.setProperty('--my', (e.clientY - r.top) + 'px');
    });
  }

  /* ---------------- 身份卡 / 说明浮层 ---------------- */
  function bindUI() {
    document.addEventListener('click', function (e) {
      var card = e.target.closest ? e.target.closest('[data-role]') : null;
      if (card) {
        highlight(card.getAttribute('data-role'));
        return;
      }
      var link = e.target.closest ? e.target.closest('[data-home-info]') : null;
      if (!link) return;
      var note = document.getElementById('home-note');
      if (!note) return;
      var kind = link.getAttribute('data-home-info');
      if (kind === 'rules') {
        note.innerHTML = '<h4>一局怎么玩</h4>昼夜循环：白天<b>会议</b>（发言 → 投票 → 驱逐）' +
          '→ 夜晚（各自行动）→ 天亮结算维修进度。夜晚<b>点击地面</b>移动，' +
          '<code>W/E</code> 交互、<code>A</code> 出刀（异形）、<code>S</code> 搜尸、' +
          '<code>D</code> 收尸；亮舱整间可见，暗舱只有手电锥。' +
          '故障 30 秒没人修好扣 5 分；人类修满 <code>' + WIN + '</code> 分或清出全部异形即胜利。' +
          '死亡后变幽灵：穿墙全视，只能做自己剩下的任务（1.6×，最多 1 分）。' +
          '看不见的动静会以<b>声纹环</b>标出方位（越近越亮，不显示身份）。' +
          '报告有全局额度，会议不限每晚一次，但报告即开会时尸体会清场。';
      } else if (kind === 'ship') {
        note.innerHTML = '<h4>这块船体是真的</h4>舱室轮廓 / 掩体 / 任务点 / 管道口全部取自 ' +
          '<code>js/data/map.js</code> 的 <code>SKMapData</code>，与对局用的是同一份数据；' +
          '蓝图态只是主页的读法，进局后叠上 <code>base-lit.png</code> 烘焙图与迷雾。';
      }
      note.classList.add('show');
    });
    bindTorch();
  }

  /* ---------------- 本局名单（2026-11-05） ----------------
     玩家名 + 14 个 AI 名；只写 localStorage（sk.roster.v1），不进对局状态。
     对局侧通过 SKHome.roster() 取一份**已去重、已补位**的名单。
     新输入的名字会并入本机名字库，供「随机名字」继续抽到。 */
  var RKEY = 'sk.roster.v1';
  var DN = (global.SKNames && global.SKNames.DEFAULT) || ['星尘'];
  var EX = (global.SKNames && global.SKNames.EXTRA) || [];
  var R = loadRoster();

  function cleanName(s) {
    return String(s == null ? '' : s)
      .replace(/[^\u4e00-\u9fa5A-Za-z0-9·_-]/g, '')
      .slice(0, 6);
  }
  function uniq(list) {
    var out = [];
    list.forEach(function (n) { if (n && out.indexOf(n) < 0) out.push(n); });
    return out;
  }
  function loadRoster() {
    var raw = {};
    try { raw = JSON.parse(localStorage.getItem(RKEY) || '{}') || {}; } catch (e) {}
    var me = cleanName(raw.me) || DN[0];
    var ai = Array.isArray(raw.ai) ? raw.ai.slice(0, 14).map(cleanName) : DN.slice(1, 15);
    while (ai.length < 14) ai.push('');
    var pool = uniq((Array.isArray(raw.pool) ? raw.pool : []).map(cleanName)
      .concat(DN, EX, ai, [me]));
    return { me: me, ai: ai, pool: pool };
  }
  function saveRoster() {
    try { localStorage.setItem(RKEY, JSON.stringify(R)); } catch (e) {}
  }
  function addPool(n) {
    if (!n || R.pool.indexOf(n) >= 0) return;
    R.pool.push(n);
    if (R.pool.length > 60) R.pool = R.pool.slice(-60);
  }
  function nextName(used) {
    var i;
    for (i = 0; i < R.pool.length; i++) if (used.indexOf(R.pool[i]) < 0) return R.pool[i];
    for (i = 0; i < DN.length; i++) if (used.indexOf(DN[i]) < 0) return DN[i];
    for (i = 2; i < 99; i++) if (used.indexOf('席位' + i) < 0) return '席位' + i;
    return '席位';
  }
  function fillRosterInputs() {
    var me = document.getElementById('home-name-me');
    if (me) me.value = R.me;
    var grid = document.getElementById('home-name-ai');
    if (!grid) return;
    var out = [];
    R.ai.forEach(function (n, k) {
      out.push('<label><input data-ai="' + k + '" maxlength="6" autocomplete="off" ' +
        'spellcheck="false" value="' + esc(n) + '" aria-label="AI ' + (k + 1) + ' 的名字"></label>');
    });
    grid.innerHTML = out.join('');
    var cnt = document.getElementById('home-names-count');
    if (cnt) cnt.textContent = '你 + 14 AI';
  }
  function collectRoster() {
    var meEl = document.getElementById('home-name-me');
    var me = cleanName(meEl && meEl.value) || R.me || DN[0];
    var inputs = [].slice.call(document.querySelectorAll('#home-name-ai input'));
    var used = [me], ai = [];
    addPool(me);
    inputs.forEach(function (el, k) {
      var n = cleanName(el.value);
      if (n) addPool(n);
      if (!n || used.indexOf(n) >= 0) n = nextName(used);
      used.push(n);
      ai.push(n);
    });
    while (ai.length < 14) { var n2 = nextName(used); used.push(n2); ai.push(n2); }
    R.me = me; R.ai = ai;
    saveRoster();
    fillRosterInputs();
    return { me: me, ai: ai.slice(0, 14) };
  }
  function randomRoster() {
    var pool = R.pool.slice();
    for (var i = pool.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var t = pool[i]; pool[i] = pool[j]; pool[j] = t;
    }
    var used = [];
    var me = pool[0] || DN[0];
    used.push(me);
    var ai = [];
    for (var k = 0; k < 14; k++) {
      var n = pool[k + 1];
      if (!n || used.indexOf(n) >= 0) n = nextName(used);
      used.push(n); ai.push(n);
    }
    R.me = me; R.ai = ai;
    saveRoster(); fillRosterInputs();
  }
  function resetRoster() {
    R.me = DN[0];
    R.ai = DN.slice(1, 15);
    saveRoster(); fillRosterInputs();
  }
  function bindRoster() {
    var me = document.getElementById('home-name-me');
    if (me) me.addEventListener('change', function () {
      R.me = cleanName(me.value) || R.me;
      addPool(R.me); saveRoster();
    });
    var grid = document.getElementById('home-name-ai');
    if (grid) grid.addEventListener('change', function (e) {
      var el = e.target;
      if (!el || !el.getAttribute) return;
      var k = +el.getAttribute('data-ai');
      if (!(k >= 0) || k >= 14) return;
      var n = cleanName(el.value);
      if (n) addPool(n);
      R.ai[k] = n;
      saveRoster();
    });
    var rb = document.getElementById('home-names-random');
    if (rb) rb.addEventListener('click', randomRoster);
    var rs = document.getElementById('home-names-reset');
    if (rs) rs.addEventListener('click', resetRoster);
    fillRosterInputs();
  }

  function buildShip(host, id) {
    if (!host) return null;
    host.innerHTML = shipSVG(id);
    return host.querySelector('svg');
  }

  function boot() {
    var host = document.getElementById('home-ship-host');
    if (!host) return;
    buildShip(host, 'home-ship');
    fillStats();
    bindUI();
    bindRoster();
    highlight('human');
  }

  global.SKHome = {
    /* shipSVG / buildShip：给复盘页复用同一份地图绘制，避免复制房间轮廓 */
    shipSVG: shipSVG,
    buildShip: buildShip,
    /* 对局入口取名单：返回 { me, ai:[14] }，已去重、已补位；不改对局状态 */
    roster: function () { return collectRoster(); },
    refresh: function () {
      var host = document.getElementById('home-ship-host');
      if (host) host.innerHTML = '';
      boot();
    }
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})(typeof window !== 'undefined' ? window : globalThis);
