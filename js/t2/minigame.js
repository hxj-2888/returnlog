/* ==== ARCH NODE · 架构节点标注（根 ARCHITECTURE.md） ====
 * layer     : T2
 * domain    : 玩家决策
 * definedBy : 小游戏
 * truth     : js/t2/minigame.js#SKMiniGame
 * verify    : 全量门禁（?test 自动解题）/ 真实试玩
 * flag      : F
 * note      : 2026-11-05 试玩接入：站桩动作改为遮罩小游戏，中断/超时即重做
 * ============================================================== */
/* 小游戏（试玩版）
   -------------------------------------------------------------
   只做三种交互原型，按动作类型分配：
     fix / revive            → wire  接线
     task / search / qual / ammo / med → place 放置
     breaker                 → lever 拉闸杆
   设计约束（用户 2026-11-05 裁定）：
     · UI 遮罩盖住大半屏幕 → 做任务时看不见有人走近（attention='ui'）
     · 中断或超时 → 进度清零，必须重做
     · 样式令牌与 js/ui/templates.js 一致（面板 #12161E / 描边 #2A3240 /
       正文 #DDE3EC / 琥珀 #F0C674 / 按钮 #1D2530 + #313B4B）
   本文件不读对局状态、不写任何分数；完成/中断通过回调交回 game.js。 */
(function (global) {
  'use strict';

  const CSS = `
  #mg{position:fixed;inset:0;z-index:80;display:none;align-items:center;justify-content:center;
    background:rgba(3,6,11,.62);font-family:system-ui,"Microsoft YaHei",sans-serif}
  #mg.on{display:flex}
  #mg .card{width:min(84vw,760px);height:min(82vh,540px);background:#12161E;border:1px solid #2A3240;
    border-radius:14px;display:flex;flex-direction:column;overflow:hidden;color:#DDE3EC;
    box-shadow:0 18px 48px rgba(0,0,0,.55)}
  #mg .hd{display:flex;align-items:center;justify-content:space-between;padding:9px 13px;
    border-bottom:1px solid #2A3240;font-size:13px;font-weight:600;color:#F0C674}
  #mg .hd span{font-size:11px;font-weight:400;color:#8FA6C0;font-variant-numeric:tabular-nums}
  #mg .bar{height:3px;background:#222833}
  #mg .bar i{display:block;height:100%;background:#F0C674;width:100%}
  #mg .bd{flex:1;display:flex;flex-direction:column;justify-content:center;align-items:center;gap:12px;padding:16px}
  #mg .tip{font-size:11.5px;color:#8FA6C0;min-height:17px;text-align:center}
  #mg .tip.bad{color:#E08A86}#mg .tip.good{color:#F0C674}
  #mg .ft{display:flex;justify-content:space-between;align-items:center;padding:7px 13px;
    border-top:1px solid #2A3240;font-size:11px;color:#8FA6C0}
  #mg button{background:#1D2530;color:#DDE3EC;border:1px solid #313B4B;border-radius:8px;
    padding:6px 12px;font-size:12px;font-family:inherit;cursor:pointer}
  #mg button:hover{border-color:#F0C674;color:#F0C674}
  #mg .wire{position:relative;display:flex;justify-content:space-between;gap:40px;width:70%;height:190px}
  #mg .col{display:flex;flex-direction:column;justify-content:space-around}
  #mg .port{width:48px;height:30px;border-radius:6px;border:1px solid #313B4B;background:#0D1117;
    position:relative;cursor:pointer}
  #mg .port::after{content:"";position:absolute;inset:7px 11px;border-radius:2px;background:currentColor}
  #mg .port.sel{border-color:#F0C674}#mg .port.done{opacity:.4;cursor:default}
  #mg .port[data-c="t"]{color:#00E5B0}#mg .port[data-c="a"]{color:#F0C674}
  #mg .port[data-c="r"]{color:#E0574F}#mg .port[data-c="b"]{color:#73A7FF}
  #mg svg.ln{position:absolute;inset:0;pointer-events:none}
  #mg .grid{display:grid;grid-template-columns:repeat(3,58px);grid-template-rows:repeat(2,48px);gap:7px}
  #mg .slot{border:1px dashed #3A4454;border-radius:7px;display:flex;align-items:center;
    justify-content:center;color:#5C6678;font-size:16px;cursor:pointer}
  #mg .slot.filled{border-style:solid;border-color:#4A3C1E;background:rgba(240,198,116,.08);color:#F0C674}
  #mg .tray{display:flex;gap:7px}
  #mg .blk{width:58px;height:32px;border-radius:7px;border:1px solid #313B4B;background:#0D1117;
    color:#DDE3EC;font-size:15px;cursor:pointer}
  #mg .blk.sel{border-color:#F0C674}#mg .blk.used{opacity:.25;cursor:default}
  #mg .row{display:flex;align-items:center;gap:14px}
  #mg .rail{width:22px;height:150px;border-radius:11px;background:#0D1117;border:1px solid #313B4B;
    position:relative;overflow:hidden}
  #mg .rail i{position:absolute;left:0;right:0;bottom:0;background:#F0C674;height:0}
  #mg .lever svg{width:132px;height:150px;overflow:visible}
  #mg .arm{transition:transform .06s linear;transform-origin:66px 124px}
  #mg .spark{opacity:0}#mg .fire .spark{opacity:1}
  `;

  const ARCH = {
    fix: 'wire', revive: 'wire',
    task: 'place', search: 'place', qual: 'place', ammo: 'place', med: 'place',
    breaker: 'lever'
  };
  const HINT = {
    wire: '左端 → 右端，颜色要一一对上；错一次整组重来',
    place: '零件 → 槽位，形状要对上；放错整组重来',
    lever: '按住不放直到充满；松早了整组重来'
  };

  let node = null, api = null, cur = null;

  function ensure() {
    if (node) return node;
    const st = document.createElement('style');
    st.textContent = CSS;
    document.head.appendChild(st);
    node = document.createElement('div');
    node.id = 'mg';
    node.innerHTML =
      '<div class="card"><div class="hd"><strong id="mg-t">小游戏</strong><span id="mg-c">—</span></div>' +
      '<div class="bar"><i id="mg-p"></i></div><div class="bd" id="mg-b"></div>' +
      '<div class="ft"><span id="mg-f">—</span><button id="mg-a">中断（进度清零）</button></div></div>';
    document.body.appendChild(node);
    return node;
  }

  function el(tag, cls, txt) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (txt != null) e.textContent = txt;
    return e;
  }
  function rnd(n) { return Math.floor(Math.random() * n); }
  function shuffled(a) {
    a = a.slice();
    for (let i = a.length - 1; i > 0; i--) { const j = rnd(i + 1), t = a[i]; a[i] = a[j]; a[j] = t; }
    return a;
  }

  function close() {
    if (api) { api.done = true; if (api.raf) cancelAnimationFrame(api.raf); if (api.anim) cancelAnimationFrame(api.anim); }
    api = null; cur = null;
    if (node) node.classList.remove('on');
  }

  function settle(ok, msg) {
    if (!api || api.done) return;
    api.done = true;
    if (api.raf) cancelAnimationFrame(api.raf);
    if (api.anim) cancelAnimationFrame(api.anim);
    api.raf = api.anim = 0;
    const mine = api, cb = ok ? api.onDone : api.onCancel;
    const tip = node.querySelector('.tip');
    if (tip) { tip.textContent = msg; tip.className = 'tip ' + (ok ? 'good' : 'bad'); }
    const fire = function () {
      if (mine.fired) return;
      mine.fired = true;
      if (cb) cb();
    };
    if (!ok) {
      /* 失败/中断：**立刻**把任务作废（进度清零），遮罩留着让玩家看到原因 */
      fire();
      const b = el('button', null, '关闭');
      b.style.marginTop = '8px';
      b.onclick = function () { close(); };
      node.querySelector('#mg-b').appendChild(b);
      return;
    }
    /* 成功：停 0.7 秒让玩家看到结果，然后自动收起并结算 */
    setTimeout(function () { if (api === mine) close(); fire(); }, 700);
  }

  function tick() {
    if (!api || api.done) return;
    const left = api.limit - (performance.now() - api.t0) / 1000;
    if (left <= 0) { settle(false, '超时 → 进度清零，需要重做'); return; }
    node.querySelector('#mg-c').textContent = left.toFixed(1) + 's';
    node.querySelector('#mg-p').style.width = (left / api.limit * 100).toFixed(1) + '%';
    api.raf = requestAnimationFrame(tick);
  }

  /* ---------- 接线 ---------- */
  function buildWire(bd) {
    const cols = ['t', 'a', 'r', 'b'];
    const box = el('div', 'wire');
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('class', 'ln');
    const lc = el('div', 'col'), rc = el('div', 'col');
    let sel = null, pairs = [];
    cols.forEach(function (c) {
      const p = el('div', 'port'); p.dataset.c = c;
      p.onclick = function () {
        if (api.done || p.classList.contains('done')) return;
        if (sel) sel.classList.remove('sel');
        sel = p; p.classList.add('sel');
        node.querySelector('.tip').textContent = '已选左端，点右端同色';
      };
      lc.appendChild(p);
    });
    shuffled(cols).forEach(function (c) {
      const p = el('div', 'port'); p.dataset.c = c;
      p.onclick = function () {
        if (api.done || !sel || p.classList.contains('done')) return;
        if (p.dataset.c !== sel.dataset.c) {
          pairs = []; svg.innerHTML = '';
          Array.prototype.forEach.call(box.querySelectorAll('.port'), function (x) { x.classList.remove('done', 'sel'); });
          sel = null;
          node.querySelector('.tip').textContent = '颜色不对 → 整组重来';
          node.querySelector('.tip').className = 'tip bad';
          return;
        }
        const a = sel; a.classList.remove('sel'); a.classList.add('done'); p.classList.add('done');
        pairs.push([a, p]); sel = null; draw();
        if (pairs.length === 4) settle(true, '接线完成 · 任务成功');
      };
      rc.appendChild(p);
    });
    box.appendChild(lc); box.appendChild(rc); box.appendChild(svg);
    bd.appendChild(box);
    function draw() {
      const bb = box.getBoundingClientRect(); svg.innerHTML = '';
      pairs.forEach(function (pr) {
        const X = pr[0].getBoundingClientRect(), Y = pr[1].getBoundingClientRect();
        const p = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        p.setAttribute('d', 'M' + (X.right - bb.left) + ' ' + (X.top - bb.top + X.height / 2) +
          ' C' + (X.right - bb.left + 40) + ' ' + (X.top - bb.top + X.height / 2) + ',' +
          (Y.left - bb.left - 40) + ' ' + (Y.top - bb.top + Y.height / 2) + ',' +
          (Y.left - bb.left) + ' ' + (Y.top - bb.top + Y.height / 2));
        p.setAttribute('stroke', '#F0C674');
        p.setAttribute('fill', 'none');
        p.setAttribute('stroke-width', '2');
        svg.appendChild(p);
      });
    }
  }

  /* ---------- 放置 ---------- */
  function buildPlace(bd) {
    const shapes = ['▲', '●', '■', '◆'];
    const need = shuffled(shapes.slice(0, 3));
    const slots = shuffled(need.concat([shapes[3]]));
    const wrap = el('div', null);
    const grid = el('div', 'grid'), tray = el('div', 'tray');
    let sel = null, placed = 0;
    slots.forEach(function (s) {
      const d = el('div', 'slot'); d.dataset.s = s;
      d.onclick = function () {
        if (api.done || !sel || d.classList.contains('filled')) return;
        if (d.dataset.s !== sel.dataset.s) {
          Array.prototype.forEach.call(grid.children, function (x) { x.classList.remove('filled'); x.textContent = ''; });
          Array.prototype.forEach.call(tray.children, function (x) { x.classList.remove('used'); });
          placed = 0; sel = null;
          node.querySelector('.tip').textContent = '形状不符 → 整组重来';
          node.querySelector('.tip').className = 'tip bad';
          return;
        }
        d.classList.add('filled'); d.textContent = sel.dataset.s;
        sel.classList.add('used'); sel.classList.remove('sel'); sel = null; placed++;
        node.querySelector('.tip').textContent = '已放置 ' + placed + ' / 3';
        if (placed === 3) settle(true, '放置完成 · 任务成功');
      };
      grid.appendChild(d);
    });
    shuffled(need).forEach(function (s) {
      const b = el('button', 'blk', s); b.dataset.s = s;
      b.onclick = function () {
        if (api.done || b.classList.contains('used')) return;
        if (sel) sel.classList.remove('sel');
        sel = b; b.classList.add('sel');
        node.querySelector('.tip').textContent = '已选零件，点形状相符的槽位';
      };
      tray.appendChild(b);
    });
    wrap.appendChild(grid); wrap.appendChild(tray);
    bd.appendChild(wrap);
  }

  /* ---------- 拉闸 / 合闸 ---------- */
  function buildLever(bd) {
    const row = el('div', 'row lever');
    const rail = el('div', 'rail'), fill = el('i');
    rail.appendChild(fill);
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 132 150');
    svg.innerHTML = '<rect x="26" y="122" width="80" height="12" rx="6" fill="#0D1117" stroke="#313B4B"/>' +
      '<g class="arm"><rect x="61" y="36" width="10" height="92" rx="5" fill="#1B2432" stroke="rgba(240,198,116,.5)"/>' +
      '<circle cx="66" cy="38" r="13" fill="#0D1117" stroke="#F0C674" stroke-width="2"/></g>' +
      '<g class="spark"><path d="M66 30 L58 48 L69 46 L61 64" fill="none" stroke="#FFB020" stroke-width="2.4" stroke-linecap="round"/></g>';
    const hold = el('button', null, '按住不放 · 拉到底');
    row.appendChild(rail); row.appendChild(svg); row.appendChild(hold);
    bd.appendChild(row);
    let charge = 0, held = false, last = 0, fire = 0;
    const arm = svg.querySelector('.arm');
    hold.addEventListener('pointerdown', function (e) { e.preventDefault(); held = true; });
    hold.addEventListener('pointerup', function () { held = false; });
    hold.addEventListener('pointercancel', function () { held = false; });
    function loop(ts) {
      if (!api || api.done) return;
      if (!last) last = ts;
      const dt = Math.min(.05, (ts - last) / 1000); last = ts;
      if (held && charge < 1) charge = Math.min(1, charge + dt / 1.2);
      if (!held && charge > 0) charge = Math.max(0, charge - dt * 2.4);
      fill.style.height = (charge * 100).toFixed(0) + '%';
      arm.style.transform = 'rotate(' + (-70 * charge).toFixed(1) + 'deg)';
      if (fire > 0) { fire -= dt; if (fire <= 0) svg.classList.remove('fire'); }
      if (charge >= 1) {
        svg.classList.add('fire'); fire = .4;
        setTimeout(function () { settle(true, '电闸已到位'); }, 120);
        return;
      }
      api.anim = requestAnimationFrame(loop);
    }
    api.anim = requestAnimationFrame(loop);
  }

  function open(action, opts) {
    ensure();
    close();
    const kind = ARCH[action] || 'place';
    cur = kind;
    api = { done: false, raf: 0, anim: 0, limit: Math.max(2, opts && opts.limit ? opts.limit : 6),
      t0: performance.now(), onDone: opts && opts.onDone, onCancel: opts && opts.onCancel };
    node.querySelector('#mg-t').textContent = (opts && opts.title) || '任务';
    node.querySelector('#mg-f').textContent = HINT[kind];
    node.querySelector('#mg-c').textContent = api.limit.toFixed(0) + 's';
    node.querySelector('#mg-p').style.width = '100%';
    const bd = node.querySelector('#mg-b');
    bd.innerHTML = '';
    const tip = el('div', 'tip', HINT[kind]);
    node.classList.add('on');
    bd.appendChild(tip);
    if (kind === 'wire') buildWire(bd);
    else if (kind === 'lever') buildLever(bd);
    else buildPlace(bd);
    api.raf = requestAnimationFrame(tick);
    return kind;
  }

  document.addEventListener('keydown', function (e) {
    if (e.key !== 'Escape' || !api || api.done) return;
    api.done = true;
    if (api.raf) cancelAnimationFrame(api.raf);
    if (api.anim) cancelAnimationFrame(api.anim);
    const cancel = api.onCancel;
    close();
    if (cancel) cancel();
  });

  global.SKMiniGame = Object.freeze({
    open: open,
    close: close,
    kindOf: function (action) { return ARCH[action] || 'place'; },
    isOpen: function () { return !!api && !api.done; }
  });
})(typeof window !== 'undefined' ? window : globalThis);
