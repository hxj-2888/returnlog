/* ==== ARCH NODE · 架构节点标注（根 ARCHITECTURE.md） ====
 * layer     : T2
 * domain    : 玩家决策
 * definedBy : 小游戏
 * truth     : js/t2/minigame.js#SKMiniGame
 * verify    : 全量门禁（?test 自动解题）/ 真实试玩
 * flag      : F
 * note      : 2026-11-05 接入：站桩动作改为遮罩小游戏；高难 8 型各一、普通按舱室归类
 * ============================================================== */
/* 小游戏
   -------------------------------------------------------------
   高难 8 个任务点各占一个独立玩法；普通 18 个按舱室与名称归类复用。
   玩法原型与 tools/minigame-preview.html 同源（那边是设计台，这里是运行时）。
   设计约束（用户 2026-11-05 裁定）：
     · UI 遮罩盖住大半屏幕 → 做任务时看不见有人走近（attention='ui'）
     · **没有限时**：计时只是「保底」——到点自动算完成，不是"完不成就清零"
     · 中断（Esc / 点中断）→ 进度清零，必须重做
     · 样式令牌与 js/ui/templates.js 一致（#12161E / #2A3240 / #DDE3EC / #F0C674）
     · 目标时长（普通玩家）：普通 4~6s、高难 8~10s、电路维修 9~12s
   本文件不读对局状态、不写任何分数；完成/中断通过回调交回 game.js。 */
(function (global) {
  'use strict';

  /* 26 个任务点 → 玩法。高难 8 个各占一型；普通按舱室与名称归类。 */
  const BY_LABEL = {
    '引擎组同步': 'sync', '氧气循环': 'pour', '电路维修': 'wire', '变压器换芯': 'swap',
    '手术台校准': 'align', '靶道校准': 'aim', '监控墙重连': 'match', '货架校准': 'level',
    '零件台': 'place', '工具架': 'place', '备用配电盘': 'wire',
    '培养罐补液': 'pour', '温控面板': 'sync',
    '餐台清洁': 'place', '后厨盘点': 'place',
    '娱乐桌': 'match', '点唱机': 'sync',
    '药柜': 'match', '消毒循环': 'pour',
    '工作台': 'place', '弹药清点': 'match',
    '操作台': 'sync', '录像归档': 'match',
    '库存盘点': 'place', '货箱封条': 'place', '出库扫描': 'wire'
  };
  /* 动作兜底：摸不到具体点位时按动作类型选 */
  const ARCH = {
    fix: 'wire', revive: 'wire',
    task: 'place', search: 'place', qual: 'place', ammo: 'place', med: 'place',
    breaker: 'lever'
  };
  const HINT = {
    wire: '左端 → 右端，颜色要一一对上；错一次整组重来',
    place: '零件 → 槽位，形状要对上；放错整组重来',
    lever: '按住不放直到充满；松早了整组重来',
    sync: '把三条通道都调进亮带并保持 0.6 秒',
    pour: '注到亮带内再松手；溢出或不足都重来',
    swap: '先取出旧芯，再插入同型号新芯',
    align: '把三个探针拖到虚线靶心',
    aim: '准星进带时点击，连中 3 次；脱靶清零',
    match: '翻两张，图标相同即配对；错配 3 次整组重来',
    level: '拖动四层货架，全部对齐到虚线'
  };

  const CSS = `
  /* z-index 必须高于 #v3-root（9999），否则遮罩被画在画布下面 ——
     DOM 里 open=true、元素也 visible，但玩家一个字都看不见（2026-11-05 实测）。
     仍低于设置面板（10010）与复盘（10005）：那两层是模态，该压住小游戏。 */
  #mg{position:fixed;inset:0;z-index:10000;display:none;align-items:center;justify-content:center;
    background:rgba(3,6,11,.62);font-family:system-ui,"Microsoft YaHei",sans-serif}
  #mg.on{display:flex}
  #mg .card{width:min(84vw,760px);height:min(82vh,540px);background:#12161E;border:1px solid #2A3240;
    border-radius:14px;display:flex;flex-direction:column;overflow:hidden;color:#DDE3EC;
    box-shadow:0 18px 48px rgba(0,0,0,.55)}
  #mg .hd{display:flex;align-items:center;justify-content:space-between;padding:9px 13px;
    border-bottom:1px solid #2A3240;font-size:13px;font-weight:600;color:#F0C674}
  #mg .hd span{font-size:11px;font-weight:400;color:#8FA6C0;font-variant-numeric:tabular-nums}
  #mg .hd strong{flex:1 1 auto}
  #mg .hd #mg-s{color:#F0C674;margin-right:10px}
  #mg .bar{height:3px;background:#222833}
  #mg .bar i{display:block;height:100%;background:#F0C674;width:100%}
  #mg .bd{flex:1;display:flex;flex-direction:column;justify-content:center;align-items:center;gap:12px;padding:14px;overflow:hidden}
  #mg .tip{font-size:11.5px;color:#8FA6C0;min-height:17px;text-align:center}
  #mg .tip.bad{color:#E08A86}#mg .tip.good{color:#F0C674}
  #mg .ft{display:flex;justify-content:space-between;align-items:center;padding:7px 13px;
    border-top:1px solid #2A3240;font-size:11px;color:#8FA6C0}
  #mg button{background:#1D2530;color:#DDE3EC;border:1px solid #313B4B;border-radius:8px;
    padding:6px 12px;font-size:12px;font-family:inherit;cursor:pointer}
  #mg button:hover{border-color:#F0C674;color:#F0C674}
  #mg .wire{position:relative;display:flex;justify-content:space-between;gap:40px;width:68%;height:180px}
  #mg .col{display:flex;flex-direction:column;justify-content:space-around}
  #mg .port{width:46px;height:28px;border-radius:6px;border:1px solid #313B4B;background:#0D1117;
    position:relative;cursor:pointer}
  #mg .port::after{content:"";position:absolute;inset:6px 10px;border-radius:2px;background:currentColor}
  #mg .port.sel{border-color:#F0C674}#mg .port.done{opacity:.4;cursor:default}
  #mg .port[data-c="t"]{color:#00E5B0}#mg .port[data-c="a"]{color:#F0C674}
  #mg .port[data-c="r"]{color:#E0574F}#mg .port[data-c="b"]{color:#73A7FF}
  #mg .port[data-c="g"]{color:#B07CFF}#mg .port[data-c="v"]{color:#5AD1C0}
  /* 当前该操作的东西给一圈呼吸光：玩家一眼看到「下一步点哪」 */
  #mg .port.hint,#mg .blk.hint,#mg .slot.hint,#mg .cd.hint{
    box-shadow:0 0 0 2px rgba(240,198,116,.55);animation:mgpulse 1.1s ease-in-out infinite}
  @keyframes mgpulse{0%,100%{box-shadow:0 0 0 2px rgba(240,198,116,.35)}
    50%{box-shadow:0 0 0 3px rgba(240,198,116,.75)}}
  #mg svg.ln{position:absolute;inset:0;pointer-events:none}
  #mg .grid{display:grid;grid-template-columns:repeat(3,56px);grid-template-rows:repeat(2,46px);gap:7px}
  #mg .slot{border:1px dashed #3A4454;border-radius:7px;display:flex;align-items:center;
    justify-content:center;color:#5C6678;font-size:16px;cursor:pointer}
  #mg .slot.filled{border-style:solid;border-color:#4A3C1E;background:rgba(240,198,116,.08);color:#F0C674}
  #mg .tray{display:flex;gap:7px}
  #mg .blk{width:56px;height:30px;border-radius:7px;border:1px solid #313B4B;background:#0D1117;
    color:#DDE3EC;font-size:15px;cursor:pointer}
  #mg .blk.sel{border-color:#F0C674}#mg .blk.used{opacity:.25;cursor:default}
  #mg .row{display:flex;align-items:center;gap:14px}
  #mg .rail{width:22px;height:140px;border-radius:11px;background:#0D1117;border:1px solid #313B4B;
    position:relative;overflow:hidden}
  #mg .rail i{position:absolute;left:0;right:0;bottom:0;background:#F0C674;height:0}
  #mg .lever svg{width:126px;height:140px;overflow:visible}
  #mg .arm{transition:transform .06s linear;transform-origin:63px 116px}
  #mg .spark{opacity:0}#mg .fire .spark{opacity:1}
  #mg .rows{display:flex;flex-direction:column;gap:12px;width:78%}
  #mg .rrow{display:flex;align-items:center;gap:10px}
  #mg .rlab{width:54px;font-size:11px;color:#8FA6C0;flex:0 0 auto}
  #mg .rtrack{position:relative;flex:1;height:24px;display:flex;align-items:center}
  #mg .rtrack .band{position:absolute;top:3px;bottom:3px;background:rgba(240,198,116,.16);
    border:1px solid #4A3C1E;border-radius:4px}
  #mg .rtrack .ln{position:absolute;left:0;right:0;height:2px;background:#222833}
  #mg .rtrack input[type=range]{position:relative;width:100%;margin:0;accent-color:#F0C674;background:transparent}
  #mg .pourbin{display:flex;align-items:flex-end;gap:14px}
  #mg .vessel{width:58px;height:150px;border:1px solid #313B4B;border-radius:6px;background:#0D1117;
    position:relative;overflow:hidden}
  #mg .vessel .fill{position:absolute;left:0;right:0;bottom:0;height:0;
    background:linear-gradient(180deg,rgba(240,198,116,.75),rgba(240,198,116,.22))}
  #mg .vessel .zone{position:absolute;left:0;right:0;border-top:1px dashed rgba(240,198,116,.7);
    border-bottom:1px dashed rgba(240,198,116,.7);background:rgba(240,198,116,.07)}
  #mg .ticks{font-size:10px;color:#8FA6C0;display:flex;flex-direction:column;justify-content:space-between;height:150px}
  #mg .swap{display:flex;align-items:center;gap:16px}
  #mg .socket{width:70px;height:90px;border:1px solid #313B4B;border-radius:8px;background:#0D1117;
    display:flex;align-items:center;justify-content:center}
  #mg .core{width:54px;height:74px;border-radius:6px;display:flex;align-items:center;justify-content:center;
    font-size:10px;color:#0A0D13;font-weight:600}
  #mg .core.old{background:#6B7280}#mg .core.c1{background:#00E5B0}
  #mg .core.c2{background:#E0574F}#mg .core.c3{background:#73A7FF}
  #mg .board{position:relative;width:76%;height:168px;border:1px solid #2A3240;border-radius:8px;touch-action:none;
    background:repeating-linear-gradient(0deg,transparent 0 21px,rgba(255,255,255,.04) 21px 22px),
      repeating-linear-gradient(90deg,transparent 0 21px,rgba(255,255,255,.04) 21px 22px)}
  #mg .probe{position:absolute;width:20px;height:20px;margin:-10px 0 0 -10px;border-radius:50%;
    border:2px solid #F0C674;background:rgba(240,198,116,.15);cursor:grab}
  #mg .tgt{position:absolute;width:24px;height:24px;margin:-12px 0 0 -12px;border-radius:50%;
    border:1px dashed rgba(0,229,176,.7)}
  #mg .range{position:relative;width:78%;height:112px;border:1px solid #2A3240;border-radius:8px;
    background:#0D1117;overflow:hidden;cursor:crosshair}
  #mg .range .zone{position:absolute;top:0;bottom:0;left:46%;width:8%;
    background:rgba(240,198,116,.16);border-left:1px solid #4A3C1E;border-right:1px solid #4A3C1E}
  #mg .range .mk{position:absolute;top:0;bottom:0;width:2px;background:#F0C674;left:0}
  #mg .cards{display:grid;grid-template-columns:repeat(4,58px);gap:7px}
  #mg .cd{height:58px;border:1px solid #313B4B;border-radius:8px;background:#0D1117;cursor:pointer;
    display:flex;align-items:center;justify-content:center;font-size:17px;color:#3B4658}
  #mg .cd.up{color:#F0C674;border-color:#4A3C1E;background:rgba(240,198,116,.07)}
  #mg .cd.done{color:#00E5B0;border-color:#1F5A49;background:rgba(0,229,176,.06);cursor:default}
  #mg .shelf{position:relative;width:76%;height:176px;border:1px solid #2A3240;border-radius:8px;
    background:#0D1117;touch-action:none}
  #mg .shelf .tline{position:absolute;left:0;right:0;border-top:1px dashed rgba(240,198,116,.55)}
  #mg .lv{position:absolute;left:0;right:0;height:12px;background:#1B2432;border-top:2px solid #8FA6C0;
    cursor:ns-resize}
  #mg .lv i{position:absolute;right:6px;top:-9px;font-size:9px;color:#8FA6C0;font-style:normal}
  `;

  let node = null, api = null;

  function ensure() {
    if (node) return node;
    const st = document.createElement('style');
    st.textContent = CSS;
    document.head.appendChild(st);
    node = document.createElement('div');
    node.id = 'mg';
    node.innerHTML =
      '<div class="card"><div class="hd"><strong id="mg-t">小游戏</strong>' +
      '<span id="mg-s">—</span><span id="mg-c">—</span></div>' +
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
  function tip(txt, bad) {
    const h = node && node.querySelector('.tip');
    if (!h) return;
    h.textContent = txt;
    h.className = 'tip' + (bad === true ? ' bad' : bad === 'good' ? ' good' : '');
  }

  function close() {
    if (api) {
      api.done = true;
      if (api.raf) cancelAnimationFrame(api.raf);
      if (api.anim) cancelAnimationFrame(api.anim);
    }
    api = null;
    if (node) node.classList.remove('on');
  }

  function settle(ok, msg) {
    if (!api || api.done) return;
    api.done = true;
    if (api.raf) cancelAnimationFrame(api.raf);
    if (api.anim) cancelAnimationFrame(api.anim);
    api.raf = api.anim = 0;
    const mine = api, cb = ok ? api.onDone : api.onCancel;
    tip(msg, ok ? 'good' : true);
    const fire = function () {
      if (mine.fired) return;
      mine.fired = true;
      if (cb) cb();
    };
    if (!ok) {
      fire();
      const b = el('button', null, '关闭');
      b.style.marginTop = '8px';
      b.onclick = function () { close(); };
      node.querySelector('#mg-b').appendChild(b);
      return;
    }
    setTimeout(function () { if (api === mine) close(); fire(); }, 700);
  }

  /* 没有限时：这里只是**保底**。到点自动算完成，绝不清零 ——
     玩家慢慢做也做得完，快的人靠解谜提前结束。 */
  function tick() {
    if (!api || api.done) return;
    const el2 = (performance.now() - api.t0) / 1000;
    const left = api.limit - el2;
    if (left <= 0) { settle(true, '保底时间到 · 任务自动完成'); return; }
    node.querySelector('#mg-c').textContent = '保底 ' + Math.ceil(left) + 's';
    node.querySelector('#mg-p').style.width = Math.min(100, el2 / api.limit * 100).toFixed(1) + '%';
    api.raf = requestAnimationFrame(tick);
  }
  /* 步骤进度：让玩家随时知道「还差几步」。total 由各玩法自己定。 */
  function setProg(done, total, msg) {
    if (!api) return;
    api.have = done; api.need = total;
    const s = node && node.querySelector('#mg-s');
    if (s) s.textContent = total ? (Math.min(done, total) + ' / ' + total) : '—';
    if (msg) tip(msg);
  }
  /* 难度档：normal / hard / circuit（电路维修单独一档） */
  function tierN(normal, hard, circuit) {
    const t = api && api.tier;
    return t === 'circuit' ? (circuit == null ? hard : circuit) : t === 'hard' ? hard : normal;
  }
  /* 给「下一步该动的东西」加高亮；传 null 清空 */
  function hintEl(e, on) {
    if (!e) return;
    if (on) e.classList.add('hint'); else e.classList.remove('hint');
  }

  /* ---------- 接线 ---------- */
  function buildWire(bd) {
    /* 条数按档位：普通 4 / 高难 5 / 电路维修 6 —— 电路维修就是"线最多"的那一档 */
    const ALL = ['t', 'a', 'r', 'b', 'g', 'v'];
    const cols = ALL.slice(0, tierN(4, 5, 6));
    const box = el('div', 'wire');
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('class', 'ln');
    const lc = el('div', 'col'), rc = el('div', 'col');
    let sel = null, pairs = [];
    setProg(0, cols.length, '共 ' + cols.length + ' 条线：先点左端，再点右边同色的那一端');
    cols.forEach(function (c) {
      const p = el('div', 'port'); p.dataset.c = c;
      p.onclick = function () {
        if (api.done || p.classList.contains('done')) return;
        if (sel) hintEl(sel, false);
        sel = p; p.classList.add('sel'); hintEl(p, true);
        tip('已选左端（' + (pairs.length + 1) + ' / ' + cols.length + '）：点右边同色的端口');
      };
      lc.appendChild(p);
    });
    shuffled(cols).forEach(function (c) {
      const p = el('div', 'port'); p.dataset.c = c;
      p.onclick = function () {
        if (api.done || !sel || p.classList.contains('done')) return;
        if (p.dataset.c !== sel.dataset.c) {
          pairs = []; svg.innerHTML = '';
          Array.prototype.forEach.call(box.querySelectorAll('.port'), function (x) {
            x.classList.remove('done', 'sel', 'hint');
          });
          sel = null; setProg(0, cols.length, '颜色不对 → 整组重来，从中断处重新接线'); return;
        }
        const a = sel; a.classList.remove('sel'); a.classList.remove('hint');
        a.classList.add('done'); p.classList.add('done');
        pairs.push([a, p]); sel = null; draw();
        setProg(pairs.length, cols.length,
          pairs.length === cols.length ? '全部接通' : '已接 ' + pairs.length + ' / ' + cols.length + ' 条，继续');
        if (pairs.length === cols.length) settle(true, '接线完成 · 任务成功');
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
    /* 零件数按档位：普通 4 / 高难 5；槽位永远多一个诱饵 */
    const shapes = ['▲', '●', '■', '◆', '✦', '✚'];
    const N = tierN(4, 5, 5);
    const need = shuffled(shapes.slice(0, N));
    const decoy = shapes.filter(function (s) { return need.indexOf(s) < 0; })[0];
    const slots = shuffled(need.concat([decoy]));
    const wrap = el('div', null);
    const grid = el('div', 'grid'), tray = el('div', 'tray');
    let sel = null, placed = 0;
    setProg(0, N, '共 ' + N + ' 个零件：先点下方零件，再点形状相符的槽位（有一个槽是诱饵）');
    slots.forEach(function (s) {
      const d = el('div', 'slot'); d.dataset.s = s;
      d.onclick = function () {
        if (api.done || !sel || d.classList.contains('filled')) return;
        if (d.dataset.s !== sel.dataset.s) {
          Array.prototype.forEach.call(grid.children, function (x) { x.classList.remove('filled'); x.textContent = ''; });
          Array.prototype.forEach.call(tray.children, function (x) { x.classList.remove('used', 'sel', 'hint'); });
          placed = 0; sel = null; setProg(0, N, '形状不符 → 整组重来，每个零件只认一个槽'); return;
        }
        d.classList.add('filled'); d.textContent = sel.dataset.s;
        sel.classList.add('used'); sel.classList.remove('sel', 'hint'); sel = null; placed++;
        setProg(placed, N, placed === N ? '全部归位' : '已放置 ' + placed + ' / ' + N + '，继续');
        if (placed === N) settle(true, '放置完成 · 任务成功');
      };
      grid.appendChild(d);
    });
    shuffled(need).forEach(function (s) {
      const b = el('button', 'blk', s); b.dataset.s = s;
      b.onclick = function () {
        if (api.done || b.classList.contains('used')) return;
        if (sel) hintEl(sel, false);
        sel = b; b.classList.add('sel'); hintEl(b, true);
        tip('已选零件「' + s + '」：点形状相符的槽位');
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
    svg.setAttribute('viewBox', '0 0 126 140');
    svg.innerHTML = '<rect x="24" y="114" width="78" height="12" rx="6" fill="#0D1117" stroke="#313B4B"/>' +
      '<g class="arm"><rect x="58" y="34" width="10" height="86" rx="5" fill="#1B2432" stroke="rgba(240,198,116,.5)"/>' +
      '<circle cx="63" cy="36" r="13" fill="#0D1117" stroke="#F0C674" stroke-width="2"/></g>' +
      '<g class="spark"><path d="M63 28 L55 46 L66 44 L58 62" fill="none" stroke="#FFB020" stroke-width="2.4" stroke-linecap="round"/></g>';
    const hold = el('button', null, '按住不放 · 拉到底');
    row.appendChild(rail); row.appendChild(svg); row.appendChild(hold);
    bd.appendChild(row);
    setProg(0, 1, '按住按钮不放，直到拉杆转到底');
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

  /* ---------- 三通道同步 ---------- */
  function buildSync(bd) {
    const targets = [[18, 32], [48, 62], [34, 50]];
    const rows = el('div', 'rows'), inputs = [];
    for (let i = 0; i < 3; i++) {
      const r = el('div', 'rrow'), lab = el('span', 'rlab', '通道 ' + (i + 1));
      const tr = el('div', 'rtrack'), band = el('i', 'band'), ln = el('i', 'ln');
      band.style.left = targets[i][0] + '%';
      band.style.width = (targets[i][1] - targets[i][0]) + '%';
      tr.appendChild(ln); tr.appendChild(band);
      const inp = document.createElement('input');
      inp.type = 'range'; inp.min = '0'; inp.max = '100';
      inp.value = String([12, 74, 26][i]);
      tr.appendChild(inp);
      inputs.push(inp);
      r.appendChild(lab); r.appendChild(tr); rows.appendChild(r);
    }
    bd.appendChild(rows);
    setProg(0, 3, '三条通道各自调进亮带，并同时保持 0.6 秒');
    let hold = 0, last = 0;
    function loop(ts) {
      if (!api || api.done) return;
      if (!last) last = ts;
      const dt = Math.min(.05, (ts - last) / 1000); last = ts;
      const all = inputs.every(function (inp, i) {
        const v = +inp.value;
        return v >= targets[i][0] && v <= targets[i][1];
      });
      hold = all ? hold + dt : 0;
      if (all) tip('保持 ' + hold.toFixed(1) + ' / 0.6 s', 'good');
      if (hold >= 0.6) { settle(true, '三条通道同步 · 任务成功'); return; }
      api.anim = requestAnimationFrame(loop);
    }
    api.anim = requestAnimationFrame(loop);
  }

  /* ---------- 注液 / 注气 ---------- */
  function buildPour(bd) {
    const bin = el('div', 'pourbin');
    const vessel = el('div', 'vessel'), fill = el('i', 'fill'), zone = el('i', 'zone');
    const lo = 52, hi = 68;
    zone.style.bottom = lo + '%';
    zone.style.height = (hi - lo) + '%';
    vessel.appendChild(fill); vessel.appendChild(zone);
    const ticks = el('div', 'ticks');
    ['100', '75', '50', '25', '0'].forEach(function (t) { ticks.appendChild(el('span', null, t)); });
    const hold = el('button', null, '按住注液 · 松开确认');
    bin.appendChild(vessel); bin.appendChild(ticks);
    bd.appendChild(bin); bd.appendChild(hold);
    setProg(0, 1, '按住注液，落在 52~68 之间再松手');
    let v = 0, held = false, last = 0;
    hold.addEventListener('pointerdown', function (e) { e.preventDefault(); held = true; });
    hold.addEventListener('pointerup', function () {
      if (!held || !api || api.done) return;
      held = false;
      if (v > hi) settle(false, '注过头了 → 整组重来');
      else if (v < lo) settle(false, '注得不够 → 整组重来');
      else settle(true, '配比到位 · 任务成功');
    });
    function loop(ts) {
      if (!api || api.done) return;
      if (!last) last = ts;
      const dt = Math.min(.05, (ts - last) / 1000); last = ts;
      if (held && v < 100) v = Math.min(100, v + dt * 38);
      fill.style.height = v.toFixed(0) + '%';
      api.anim = requestAnimationFrame(loop);
    }
    api.anim = requestAnimationFrame(loop);
  }

  /* ---------- 换芯 ---------- */
  function buildSwap(bd) {
    const box = el('div', 'swap'), sock = el('div', 'socket');
    const oldc = el('div', 'core old', '旧芯');
    sock.appendChild(oldc);
    const tray = el('div', 'tray');
    const colors = ['c1', 'c2', 'c3'];
    const target = colors[rnd(3)];
    let removed = false;
    oldc.onclick = function () {
      if (!api || api.done || removed) return;
      removed = true; oldc.remove();
      tip('旧芯已取出，选一枚同型号新芯');
    };
    shuffled(colors).forEach(function (c) {
      const b = el('button', 'core ' + c, c === 'c1' ? 'A 型' : c === 'c2' ? 'B 型' : 'C 型');
      b.style.width = '56px'; b.style.height = '32px'; b.style.border = '1px solid #313B4B'; b.style.cursor = 'pointer';
      b.onclick = function () {
        if (!api || api.done || !removed) return;
        if (c !== target) { settle(false, '型号不对 → 整组重来'); return; }
        sock.appendChild(el('div', 'core ' + c, '新芯'));
        settle(true, '换芯完成 · 任务成功');
      };
      tray.appendChild(b);
    });
    box.appendChild(sock); box.appendChild(tray);
    bd.appendChild(box);
    setProg(0, 2, '第一步：点「旧芯」把它取出来');
  }

  /* ---------- 三点对准 ---------- */
  function buildAlign(bd) {
    const board = el('div', 'board'), probes = [], tgts = [];
    for (let i = 0; i < 3; i++) {
      const tx = 16 + rnd(62), ty = 14 + rnd(56);
      const t = el('div', 'tgt');
      t.style.left = tx + '%'; t.style.top = ty + '%';
      board.appendChild(t); tgts.push({ x: tx, y: ty });
    }
    for (let j = 0; j < 3; j++) {
      const p = el('div', 'probe');
      p.style.left = (8 + j * 32) + '%';
      p.style.top = (72 - j * 16) + '%';
      board.appendChild(p); probes.push(p);
    }
    bd.appendChild(board);
    setProg(0, 3, '把三个金色探针拖进虚线圆圈，三个都进才算过');
    let drag = null;
    function pos(e) {
      const bb = board.getBoundingClientRect();
      return { x: (e.clientX - bb.left) / bb.width * 100, y: (e.clientY - bb.top) / bb.height * 100 };
    }
    board.addEventListener('pointerdown', function (e) {
      const t = e.target;
      if (!t.classList.contains('probe')) return;
      drag = t; t.setPointerCapture(e.pointerId); e.preventDefault();
    });
    board.addEventListener('pointermove', function (e) {
      if (!drag || !api || api.done) return;
      const p = pos(e);
      drag.style.left = Math.max(0, Math.min(100, p.x)) + '%';
      drag.style.top = Math.max(0, Math.min(100, p.y)) + '%';
      check();
    });
    board.addEventListener('pointerup', function () { drag = null; });
    board.addEventListener('pointercancel', function () { drag = null; });
    function check() {
      const near = probes.map(function (p, k) {
        return Math.hypot(parseFloat(p.style.left) - tgts[k].x, parseFloat(p.style.top) - tgts[k].y) < 2.6;
      });
      const got = near.filter(Boolean).length;
      setProg(got, 3, '对准 ' + got + ' / 3 —— 拖到虚线圆圈里');
      if (near.every(Boolean)) settle(true, '三点评定通过 · 任务成功');
    }
  }

  /* ---------- 准星保持 ---------- */
  function buildAim(bd) {
    const rng = el('div', 'range'), zone = el('div', 'zone'), mk = el('div', 'mk');
    rng.appendChild(zone); rng.appendChild(mk);
    bd.appendChild(rng);
    setProg(0, 3, '准星进亮带时点击，连中 3 次');
    let hits = 0, dir = 1, x = 0, last = 0;
    function loop(ts) {
      if (!api || api.done) return;
      if (!last) last = ts;
      const dt = Math.min(.05, (ts - last) / 1000); last = ts;
      x += dir * dt * 46;
      if (x > 96) { x = 96; dir = -1; }
      if (x < 0) { x = 0; dir = 1; }
      mk.style.left = x + '%';
      api.anim = requestAnimationFrame(loop);
    }
    rng.onclick = function () {
      if (!api || api.done) return;
      if (x >= 46 && x <= 54) {
        hits++; setProg(hits, 3, '命中 ' + hits + ' / 3');
        if (hits >= 3) settle(true, '靶道校准完成 · 任务成功');
      } else { hits = 0; setProg(0, 3, '脱靶 → 计数清零，等准星进带再点'); }
    };
    api.anim = requestAnimationFrame(loop);
  }

  /* ---------- 图标配对 ---------- */
  function buildMatch(bd) {
    /* 配对数按档位：普通 4 对 / 高难 5 对 */
    const icons = ['◈', '◇', '▣', '▤', '◐', '◑'];
    const N = tierN(4, 5, 5);
    const pool = icons.slice(0, N);
    const deck = shuffled(pool.concat(pool));
    const grid = el('div', 'cards');
    let open = [], lock = false, pairs = 0, miss = 0;
    setProg(0, N, '共 ' + N + ' 对：翻两张，图案相同即配对（错 3 次整组重来）');
    deck.forEach(function (ic) {
      const c = el('div', 'cd', '·');
      c.dataset.ic = ic;
      c.onclick = function () {
        if (!api || api.done || lock || c.classList.contains('done') || c.classList.contains('up')) return;
        c.classList.add('up'); c.textContent = ic; open.push(c);
        if (open.length < 2) return;
        const a = open[0], b = open[1];
        if (a.dataset.ic === b.dataset.ic) {
          a.classList.add('done'); b.classList.add('done'); open = []; pairs++;
          setProg(pairs, N, pairs === N ? '全部匹配' : '已配对 ' + pairs + ' / ' + N + '，继续');
          if (pairs === N) settle(true, '全部接通 · 任务成功');
        } else {
          lock = true; miss++;
          setTimeout(function () {
            if (!api || api.done) return;
            a.classList.remove('up'); b.classList.remove('up');
            a.textContent = '·'; b.textContent = '·';
            open = []; lock = false;
            if (miss >= 3) settle(false, '错配 3 次 → 整组重来');
            else tip('配错了（' + miss + ' / 3）—— 记一下位置重来', true);
          }, 420);
        }
      };
      grid.appendChild(c);
    });
    bd.appendChild(grid);
  }

  /* ---------- 层高对齐 ---------- */
  function buildLevel(bd) {
    const shelf = el('div', 'shelf'), line = el('div', 'tline');
    const target = 42;
    line.style.top = target + '%';
    shelf.appendChild(line);
    const bars = [], base = tierN(4, 5, 5) === 5 ? [14, 30, 48, 66, 84] : [20, 34, 58, 72];
    base.forEach(function (v, i) {
      const b = el('div', 'lv'), g = el('i', null, 'L' + (i + 1));
      b.style.top = v + '%'; b.appendChild(g); shelf.appendChild(b); bars.push(b);
    });
    bd.appendChild(shelf);
    setProg(0, bars.length, '把 ' + bars.length + ' 层货架拖到同一条虚线（±3%）');
    let drag = null;
    function pct(e) {
      const bb = shelf.getBoundingClientRect();
      return (e.clientY - bb.top) / bb.height * 100;
    }
    shelf.addEventListener('pointerdown', function (e) {
      const t = e.target.closest ? e.target.closest('.lv') : null;
      if (!t) return;
      drag = t; t.setPointerCapture(e.pointerId); e.preventDefault();
    });
    shelf.addEventListener('pointermove', function (e) {
      if (!drag || !api || api.done) return;
      drag.style.top = Math.max(0, Math.min(92, pct(e))) + '%';
      check();
    });
    shelf.addEventListener('pointerup', function () { drag = null; });
    shelf.addEventListener('pointercancel', function () { drag = null; });
    function check() {
      const ok = bars.map(function (b) { return Math.abs(parseFloat(b.style.top) - target) <= 3; });
      const got = ok.filter(Boolean).length;
      setProg(got, bars.length, '齐平 ' + got + ' / ' + bars.length + ' 层 —— 拖到同一条虚线');
      if (ok.every(Boolean)) settle(true, bars.length + ' 层齐平 · 任务成功');
    }
  }

  const BUILD = {
    wire: buildWire, place: buildPlace, lever: buildLever, sync: buildSync, pour: buildPour,
    swap: buildSwap, align: buildAlign, aim: buildAim, match: buildMatch, level: buildLevel
  };

  function kindOf(action, label) {
    if (label && BY_LABEL[label]) return BY_LABEL[label];
    return ARCH[action] || 'place';
  }

  /* 保底时长（秒）：到点自动完成，**不是**限时。
     按任务类别给：普通 10、高难 16、电路维修 20。
     目标解谜时间由玩法步数控制（普通 4~6s / 高难 8~10s / 电路 9~12s），
     保底留了约 2 倍的余量，手慢的人也做得完。 */
  const FALLBACK = { normal: 10, hard: 16, circuit: 20 };

  function open(action, opts) {
    ensure();
    close();
    opts = opts || {};
    const kind = kindOf(action, opts.label);
    const tier = opts.tier || 'normal';
    api = {
      done: false, raf: 0, anim: 0, kind: kind, tier: tier,
      limit: Math.max(3, opts.fallback || FALLBACK[tier] || FALLBACK.normal),
      t0: performance.now(), onDone: opts.onDone, onCancel: opts.onCancel
    };
    node.querySelector('#mg-t').textContent = opts.title || '任务';
    node.querySelector('#mg-f').textContent = HINT[kind];
    node.querySelector('#mg-s').textContent = '—';
    node.querySelector('#mg-c').textContent = '保底 ' + api.limit + 's';
    node.querySelector('#mg-p').style.width = '0%';
    const bd = node.querySelector('#mg-b');
    bd.innerHTML = '';
    node.classList.add('on');
    bd.appendChild(el('div', 'tip', HINT[kind]));
    (BUILD[kind] || buildPlace)(bd);
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
    kindOf: kindOf,
    isOpen: function () { return !!api && !api.done; }
  });
})(typeof window !== 'undefined' ? window : globalThis);
