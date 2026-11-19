/* ==== ARCH NODE · 架构节点标注（根 ARCHITECTURE.md） ====
 * layer     : T2
 * domain    : 玩家决策
 * definedBy : 任务系统改造（Plate Task）
 * truth     : js/t2/plate-task.js#SKPlateTask
 * verify    : npm run plate:check / tests/test-plate.cjs / 全量门禁（?test 自动解题）
 * flag      : N
 * note      : 图内任务通用引擎；板数据仍只放 js/data/plates.js
 * ============================================================== */
/* 图内任务引擎 · 六动词（tap / tapSeq / hold / holdBand / drag / aim）——一张贴图 + 若干热点：
   未完成的热点处，面层贴图被遮罩挖掉，露出底下「模糊压暗」的同一张图；做完一处把洞缩到 0，
   原图像素自己长回来；声明了 fx 的热点改成把这块贴图搬走/旋开/压下，完成态留在图上。
   动词：tap 点一下 · tapSeq 按编号点 · hold 按住充满 · holdBand 按住推进松手落在亮带 ·
   drag 拖到目标位 · aim 准星进亮带时点（编号常驻可见，不靠记忆）。
   约束：不定义坐标/数值（读 plates.js 与 minigame.js#TASKS）；不读对局状态、不写分数；经典 <script> 加载，排在 minigame.js 之前；贴图缺失/动词不支持 → build() 返回 false。 */
(function (global) {
  'use strict';

  var NS = 'http://www.w3.org/2000/svg';
  var clipSeq = 0;   /* 每块板的 clipPath id 序号 */
  /* 皮肤：只决定「未处理处」长什么样（底层副本的滤镜），不是板几何。 */
  var SKIN = {
    cut: { under: 'blur(7px) brightness(.34) saturate(.7)' },
    dirty: { under: 'grayscale(.7) brightness(.62)' },
    off: { under: 'grayscale(1) brightness(.4)' }
  };

  function svgEl(tag, attrs) {
    var e = document.createElementNS(NS, tag);
    if (attrs) for (var k in attrs) e.setAttribute(k, attrs[k]);
    return e;
  }

  /* 热点几何：坐标一律图片原始像素，支持矩形 / 圆 / 点；点按命中区按 28px 下限展开。 */
  function boxOf(p) {
    if (p.shape === 'circle') {
      var r = Math.max(14, p.r || 20);
      return { x: p.x - r, y: p.y - r, w: r * 2, h: r * 2 };
    }
    var w = Math.max(28, p.w != null ? p.w : 36);
    var h = Math.max(28, p.h != null ? p.h : 36);
    if (p.shape === 'point') return { x: p.x - w / 2, y: p.y - h / 2, w: w, h: h };
    return { x: p.x, y: p.y, w: w, h: h };
  }

  function pct(v, origin, len) {
    return ((v - origin) / len * 100).toFixed(3) + '%';
  }

  /* 完成态的图内位移：dx/dy 是热点框宽高的比例，s 缩放、deg 旋转、dim 压暗、lit 提亮 */
  function applyFx(S, st, accent) {
    var f = st.p.fx, b = st.box, m = st.movedImg;
    if (m) {
      m.style.transform = 'translate(' + ((f.dx || 0) * b.w).toFixed(2) + 'px,' +
        ((f.dy || 0) * b.h).toFixed(2) + 'px) rotate(' + (f.deg || 0) + 'deg) scale(' + (f.s == null ? 1 : f.s) + ')';
      m.style.filter = f.dim != null ? 'brightness(' + f.dim + ')' :
        f.lit != null ? 'brightness(' + f.lit + ') saturate(1.18)' : '';
    }
    if (st.moved) st.moved.setAttribute('opacity', '1');
    if (f.glow) S.fx.appendChild(svgEl('ellipse', { cx: b.x + b.w / 2, cy: b.y + b.h / 2,
      rx: b.w * 0.66, ry: b.h * 0.66, fill: accent, opacity: 0.38, 'class': 'pglow' }));
  }
  /* 舞台：两层贴图 + 遮罩 + 三组反馈层 + 热点层 + 「按住看原图」。
     与判分无关，单独成函数是为了守住「单函数 ≤200 行」的棘轮。 */
  function stage(bd, plate, spec, el, crop) {
    var uid = ++clipSeq, maskId = 'ptSpotMask_' + uid, gradId = 'ptSpotGrad_' + uid, srcId = 'ptSpotSrc_' + uid;
    var W = plate.size[0], H = plate.size[1];
    var cx0 = crop[0], cy0 = crop[1], cw = crop[2], ch = crop[3];
    var image = plate.image;
    var skin = SKIN[spec.skin] || SKIN[plate.skin] || SKIN.cut;
    var wrap = el('div', 'plate-wrap');
    /* 满屏 contain（2026-11-19 用户纠正）：整块板图完整装进屏幕，不放大裁切；上下各让出 HUD 浮层的高度 */
    var availW = (bd.clientWidth || 720) - 16, availH = (bd.clientHeight || 440) - 128, scale = Math.min(availW / cw, availH / ch);
    var dispW = cw * scale, dispH = ch * scale;
    wrap.style.width = dispW.toFixed(1) + 'px';
    wrap.style.height = dispH.toFixed(1) + 'px';
    wrap.style.aspectRatio = cw + ' / ' + ch;

    var svg = svgEl('svg', {
      'class': 'plate-svg',
      viewBox: cx0 + ' ' + cy0 + ' ' + cw + ' ' + ch,
      preserveAspectRatio: 'xMidYMid meet'
    });

    var defs = svgEl('defs', {});
    var mask = svgEl('mask', {
      id: maskId, maskUnits: 'userSpaceOnUse',
      x: 0, y: 0, width: W, height: H
    });
    mask.appendChild(svgEl('rect', { x: 0, y: 0, width: W, height: H, fill: '#fff' }));
    var holes = svgEl('g', { 'class': 'plate-holes' });
    mask.appendChild(holes);
    defs.appendChild(mask);

    var grad = svgEl('radialGradient', { id: gradId });
    grad.appendChild(svgEl('stop', { offset: '0%', 'stop-color': '#000' }));
    grad.appendChild(svgEl('stop', { offset: '58%', 'stop-color': '#000' }));
    grad.appendChild(svgEl('stop', { offset: '100%', 'stop-color': '#fff' }));
    defs.appendChild(grad);

    var src = svgEl('image', {
      id: srcId, href: image, x: 0, y: 0, width: W, height: H
    });
    defs.appendChild(src);
    svg.appendChild(defs);

    var under = svgEl('use', { href: '#' + srcId, 'class': 'plate-under' });
    under.style.filter = skin.under;
    svg.appendChild(under);
    svg.appendChild(svgEl('use', {
      href: '#' + srcId, 'class': 'plate-face', mask: 'url(#' + maskId + ')'
    }));
    /* 进度填充 / 亮带画在面层之上：它们是「这处正在被处理」的反馈，
       不是遮罩的一部分，也不能塞进 <defs>（那里不参与渲染）。 */
    var fills = svgEl('g', { 'class': 'plate-fills' });
    var rings = svgEl('g', { 'class': 'plate-rings' });
    var fx = svgEl('g', { 'class': 'plate-fx' });
    var moved = svgEl('g', { 'class': 'plate-moved' });   /* 完成态位移层：底层暗图就是空位 */
    svg.appendChild(fills);
    svg.appendChild(rings);
    svg.appendChild(fx);
    svg.appendChild(moved);
    wrap.appendChild(svg);
    var face = svg.querySelector('.plate-face');

    var layer = el('div', 'plate-spots');
    wrap.appendChild(layer);

    var peek = el('button', 'plate-peek', '按住看原图');
    function setPeek(on) {
      face.setAttribute('mask', on ? 'none' : 'url(#' + maskId + ')');
      peek.textContent = on ? '原图' : '按住看原图';
    }
    peek.addEventListener('pointerdown', function (e) { e.preventDefault(); setPeek(true); });
    ['pointerup', 'pointerleave', 'pointercancel'].forEach(function (t) {
      peek.addEventListener(t, function () { setPeek(false); });
    });

    bd.appendChild(wrap);
    bd.appendChild(peek);
    return { wrap: wrap, svg: svg, src: src, holes: holes, fills: fills, rings: rings, fx: fx,
      moved: moved, defs: defs, image: image, layer: layer, gradId: gradId };
  }

  /* 公共骨架：两层贴图 + 遮罩 + 热点层 + 进度/结算回调。 */
  function scaffold(bd, plate, spec, host) {
    var image = plate.image || '';
    if (!image || !plate.size) return null;
    /* file:// 下缺图只会静默裂图：已经确认加载失败的（缓存里 complete 且宽度 0）
       当场回退；异步失败交给调用方监听 error。 */
    if (global.Image) {
      var probe = new global.Image();
      probe.src = image;
      if (probe.complete && probe.naturalWidth === 0) return null;
    }

    var el = host.el || function (tag, cls, txt) {
      var e = document.createElement(tag);
      if (cls) e.className = cls;
      if (txt != null) e.textContent = txt;
      return e;
    };

    var W = plate.size[0], H = plate.size[1];
    var crop = (plate.crop && plate.crop.length === 4) ? plate.crop : [0, 0, W, H];
    var cx0 = crop[0], cy0 = crop[1], cw = crop[2], ch = crop[3];
    var skin = SKIN[spec.skin] || SKIN[plate.skin] || SKIN.cut;
    var accent = spec.color || '#F0C674';

    var spots = (plate.spots || []).slice().sort(function (a, b) {
      return (a.order || 0) - (b.order || 0);
    });
    if (!spots.length && spec.verb !== 'aim') return null;

    var st = stage(bd, plate, spec, el, crop);

    var S = {
      el: el, wrap: st.wrap, layer: st.layer, svg: st.svg, holes: st.holes,
      rings: st.rings, fx: st.fx, fills: st.fills, moved: st.moved, defs: st.defs, image: st.image, gradId: st.gradId,
      W: W, img: { x: 0, y: 0, w: W, h: H }, crop: crop,
      cx0: cx0, cy0: cy0, cw: cw, ch: ch,
      accent: accent, spots: spots, states: [],
      need: 0, done: 0, finished: false, dead: false, raf: 0,
      /* 任务只挑自己那几个热点：同一张板可以被多个任务复用，
         靠 role 区分「这根是加热管 / 那是键盘」。挑完按 1..k 重新编号。 */
      pick: function (sp) {
        var use = sp.use, list = S.spots;
        if (use) {
          var arr = [].concat(use);
          list = S.spots.filter(function (p) { return arr.indexOf(p.role) >= 0; });
        }
        return list.map(function (p, i) {
          var q = {};
          for (var k in p) q[k] = p[k];
          q.order = i + 1;
          return q;
        });
      },
      live: function () {
        if (S.finished || S.dead) return false;
        return !(host.api && host.api.done);
      },
      tip: function (m, bad) { if (host.tip) host.tip(m, bad); },
      prog: function (msg) {
        if (host.setProg) host.setProg(S.done, S.need, msg);
      },
      finish: function (msg) {
        if (S.finished) return;
        S.finished = true;
        if (S.raf && global.cancelAnimationFrame) global.cancelAnimationFrame(S.raf);
        S.raf = 0;
        if (host.settle) host.settle(true, msg || spec.win || '任务完成');
      },
      /* 无 fx：洞缩 0、原图长回；有 fx：把这块贴图搬走/旋开/压下，完成态留在图上 */
      close: function (st) {
        if (!st || st.closed) return;
        st.closed = true;
        if (st.p && st.p.fx) S.fxDone(st);
        else if (st.hole) st.hole.style.transform = 'scale(0)';
        if (st.ring && st.ring.parentNode) st.ring.parentNode.removeChild(st.ring);
        if (st.halo && st.halo.parentNode) st.halo.parentNode.removeChild(st.halo);
        if (st.node) st.node.classList.add('done');
        S.pop(st.holeBox || st.box);
      },
      fxDone: function (st) { applyFx(S, st, accent); },
      pop: function (box) {
        var c = svgEl('circle', {
          cx: box.x + box.w / 2, cy: box.y + box.h / 2,
          r: Math.max(6, Math.min(box.w, box.h) * 0.5),
          fill: 'none', stroke: accent, 'stroke-width': 2, 'class': 'spot-pop'
        });
        S.fx.appendChild(c);
        setTimeout(function () { if (c.parentNode) c.parentNode.removeChild(c); }, 560);
      },
      /* 建一个可点热点；返回 state */
      spot: function (i, p, cls) {
        var b = boxOf(p);
        var node = el('div', 'pspot' + (cls ? ' ' + cls : ''));
        node.dataset.i = String(i);
        node.dataset.order = String(p.order || i + 1);
        if (p.role) node.dataset.role = p.role;
        node.style.left = pct(b.x, cx0, cw);
        node.style.top = pct(b.y, cy0, ch);
        node.style.width = (b.w / cw * 100).toFixed(3) + '%';
        node.style.height = (b.h / ch * 100).toFixed(3) + '%';
        S.layer.appendChild(node);
        var holeBox = p.hole ? boxOf(p.hole) : b;
        var hole = svgEl('rect', {
          x: holeBox.x, y: holeBox.y, width: holeBox.w, height: holeBox.h,
          rx: Math.min(holeBox.w, holeBox.h) * 0.24,
          fill: 'url(#' + S.gradId + ')', 'class': 'spot-hole'
        });
        S.holes.appendChild(hole);
        var st = {
          i: i, p: p, box: b, holeBox: holeBox, node: node, hole: hole,
          ring: null, halo: null, done: false, closed: false, moved: null, movedImg: null
        };
        if (p.fx) {
          var cid = 'ptClip' + (clipSeq++), cp = svgEl('clipPath', { id: cid, clipPathUnits: 'userSpaceOnUse' });
          cp.appendChild(p.fx.clip === 'circle'
            ? svgEl('circle', { cx: b.x + b.w / 2, cy: b.y + b.h / 2, r: Math.min(b.w, b.h) * 0.46 })
            : svgEl('rect', { x: b.x, y: b.y, width: b.w, height: b.h }));
          S.defs.appendChild(cp);
          st.moved = svgEl('g', { 'class': 'pmoved', opacity: '0', 'clip-path': 'url(#' + cid + ')' });
          st.movedImg = svgEl('image', { href: S.image, x: 0, y: 0, width: W, height: H });
          st.moved.appendChild(st.movedImg);
          S.moved.appendChild(st.moved);
        }
        if (p.role !== 'lane') {
          var ring = svgEl('rect', {
            x: b.x, y: b.y, width: b.w, height: b.h,
            rx: Math.min(b.w, b.h) * 0.2,
            fill: 'none', stroke: accent, 'stroke-width': 1.6,
            'stroke-dasharray': '5 5', opacity: 0.55, 'class': 'spot-ring'
          });
          S.rings.appendChild(ring);
          st.ring = ring;
          var halo = svgEl('circle', {
            cx: b.x + b.w / 2, cy: b.y + b.h / 2,
            r: Math.max(3, Math.min(b.w, b.h) * 0.16),
            fill: accent, opacity: 0.5, 'class': 'plate-halo'
          });
          S.rings.appendChild(halo);
          st.halo = halo;
        }
        S.states[i] = st;
        return st;
      },
      /* 把 state 标记完成（不重复计数） */
      mark: function (st, msg) {
        if (!st || st.done) return;
        st.done = true;
        S.done++;
        S.close(st);
        S.prog(msg);
        if (S.done >= S.need) S.finish(spec.win);
      },
      /* 客户端坐标 → 图片像素 */
      toImg: function (clientX, clientY) {
        var r = st.wrap.getBoundingClientRect();
        if (!r.width || !r.height) return { x: 0, y: 0 };
        return {
          x: cx0 + (clientX - r.left) / r.width * cw,
          y: cy0 + (clientY - r.top) / r.height * ch
        };
      }
    };

    st.src.addEventListener('error', function () {
      if (S.dead) return;
      S.dead = true;
      S.finished = true;
      if (S.raf && global.cancelAnimationFrame) global.cancelAnimationFrame(S.raf);
      if (host.fallback) host.fallback();
    });

    return S;
  }

  /* ---------------- 动词 1：点按 ---------------- */
  function vTap(S, spec) {
    var list = S.pick(spec);
    S.need = Math.max(1, Math.min(spec.n || list.length, list.length));
    list.forEach(function (p, i) {
      var st = S.spot(i, p);
      st.node.addEventListener('click', function (ev) {
        if (ev && ev.stopPropagation) ev.stopPropagation();
        if (!S.live()) return;
        if (st.done) { S.tip(spec.againTip || '这处已经处理过了'); return; }
        S.mark(st, '已处理 ' + (S.done + 1) + ' / ' + S.need);
      });
    });
    S.prog(spec.hint || '点按图上标出的位置，逐个处理；点错不重置');
    return true;
  }

  /* ---------------- 动词 2：顺序点按（编号画在图上） ---------------- */
  function vTapSeq(S, spec) {
    var list = S.pick(spec);
    S.need = Math.max(1, Math.min(spec.n || list.length, list.length));
    var next = 0;
    list.forEach(function (p, i) {
      var st = S.spot(i, p);
      /* 超出 n 的是余量（例如 6 颗子弹只要 5 颗）：不参与顺序，也不抢点击 */
      if (i >= S.need) { st.node.classList.add('idle'); return; }
      var badge = S.el('i', 'pord', String(i + 1));
      st.node.appendChild(badge);
      st.node.addEventListener('click', function (ev) {
        if (ev && ev.stopPropagation) ev.stopPropagation();
        if (!S.live()) return;
        if (st.done) return;
        if (i !== next) {
          S.tip('顺序不对：先把 ' + (next + 1) + ' 号处理掉（编号就画在图上）', true);
          st.node.classList.remove('shake');
          void st.node.offsetWidth;
          st.node.classList.add('shake');
          return;
        }
        next++;
        S.mark(st, '已处理 ' + S.done + ' / ' + S.need);
      });
    });
    S.prog(spec.hint || '按图上的 1→2→3 顺序点；点错不重置');
    return true;
  }

  /* ---------------- 动词 3：长按到满 ---------------- */
  /* 长按类动词统一用**墙钟**累计，不按帧累加：
     帧率低的机器上「按满 0.9 秒」不会变成按 1.4 秒，判定与手感脱钩。 */
  function vHold(S, spec) {
    var list = S.pick(spec);
    S.need = Math.max(1, Math.min(spec.n || list.length, list.length));
    var dur = (spec.hold || 0.9);
    var active = [];
    list.forEach(function (p, i) {
      var st = S.spot(i, p);
      var fill = svgEl('rect', {
        x: st.box.x, y: st.box.y + st.box.h, width: st.box.w, height: 0,
        fill: S.accent, opacity: 0.26, 'class': 'pfill'
      });
      S.fills.appendChild(fill);
      st.fill = fill;
      st.v = 0; st.v0 = 0; st.h0 = 0; st.dur = p.hold || dur;
      st.node.dataset.hold = String(Math.round(st.dur * 1000));
      st.node.addEventListener('pointerdown', function (ev) {
        if (ev && ev.preventDefault) ev.preventDefault();
        if (!S.live() || st.done) return;
        st.v0 = st.v; st.h0 = (global.performance || Date).now();
        st.node.classList.add('holding');
      });
      var up = function () {
        if (!st.h0) return;
        var now = (global.performance || Date).now();
        st.v = Math.min(1, st.v0 + (now - st.h0) / (st.dur * 1000));
        st.h0 = 0; st.v0 = st.v;
        st.node.classList.remove('holding');
        if (S.live() && st.v >= 1) S.mark(st, '已处理 ' + S.done + ' / ' + S.need);
      };
      st.node.addEventListener('pointerup', up);
      st.node.addEventListener('pointerleave', up);
      st.node.addEventListener('pointercancel', up);
      active.push(st);
    });
    var last = 0;
    function loop(ts) {
      if (!S.live()) return;
      var now = ts || (global.performance || Date).now();
      var dt = last ? Math.min(0.1, (now - last) / 1000) : 0.016;
      last = now;
      active.forEach(function (st) {
        if (st.done) return;
        if (st.h0) st.v = Math.min(1, st.v0 + (now - st.h0) / (st.dur * 1000));
        else if (st.v > 0) { st.v = Math.max(0, st.v - dt * 0.9); st.v0 = st.v; }
        st.fill.setAttribute('y', st.box.y + st.box.h * (1 - st.v));
        st.fill.setAttribute('height', st.box.h * st.v);
        if (st.v >= 1) S.mark(st, '已处理 ' + S.done + ' / ' + S.need);
      });
      S.raf = global.requestAnimationFrame(loop);
    }
    S.prog(spec.hint || '按住不放，圆环充满即完成；松手会慢慢退回');
    S.raf = global.requestAnimationFrame(loop);
    return true;
  }

  /* ---------------- 动词 4：长按到位（松手落在亮带） ---------------- */
  function vHoldBand(S, spec) {
    var list = S.pick(spec);
    S.need = Math.max(1, Math.min(spec.n || list.length, list.length));
    var dur = (spec.dur || 2.2);
    var active = [];
    list.forEach(function (p, i) {
      var st = S.spot(i, p);
      var band = p.band || spec.band || [55, 75];
      var lo = Math.max(2, Math.min(band[0], band[1]));
      var hi = Math.min(98, Math.max(band[0], band[1]));
      var stripe = svgEl('rect', {
        x: st.box.x, y: st.box.y + st.box.h * (1 - hi / 100),
        width: st.box.w, height: st.box.h * (hi - lo) / 100,
        fill: S.accent, opacity: 0.2, 'class': 'pband'
      });
      S.fills.appendChild(stripe);
      var fill = svgEl('rect', {
        x: st.box.x, y: st.box.y + st.box.h, width: st.box.w, height: 0,
        fill: S.accent, opacity: 0.3, 'class': 'pfill'
      });
      S.fills.appendChild(fill);
      st.fill = fill; st.stripe = stripe;
      st.v = 0; st.v0 = 0; st.h0 = 0;
      st.dur = p.dur || dur; st.lo = lo; st.hi = hi;
      st.node.dataset.lo = String(lo);
      st.node.dataset.hi = String(hi);
      st.node.dataset.dur = String(st.dur);
      st.node.addEventListener('pointerdown', function (ev) {
        if (ev && ev.preventDefault) ev.preventDefault();
        if (!S.live() || st.done) return;
        st.v0 = st.v; st.h0 = (global.performance || Date).now();
        st.node.classList.add('holding');
      });
      var release = function () {
        if (!st.h0) return;
        var now = (global.performance || Date).now();
        st.v = Math.min(1, st.v0 + (now - st.h0) / (st.dur * 1000));
        st.h0 = 0; st.v0 = st.v;
        st.node.classList.remove('holding');
        if (!S.live() || st.done) return;
        var val = st.v * 100;
        if (val >= st.lo && val <= st.hi) {
          S.mark(st, '到位 ' + S.done + ' / ' + S.need);
        } else if (val > 0) {
          S.tip(val < st.lo ? '还没到亮带，再按住一会儿' : '过头了，等它退回来再松手', true);
        }
      };
      st.node.addEventListener('pointerup', release);
      st.node.addEventListener('pointercancel', release);
      active.push(st);
    });
    var last = 0;
    function loop(ts) {
      if (!S.live()) return;
      var now = ts || (global.performance || Date).now();
      var dt = last ? Math.min(0.1, (now - last) / 1000) : 0.016;
      last = now;
      active.forEach(function (st) {
        if (st.done) return;
        if (st.h0) st.v = Math.min(1, st.v0 + (now - st.h0) / (st.dur * 1000));
        else if (st.v > 0) { st.v = Math.max(0, st.v - dt * 0.45); st.v0 = st.v; }
        st.fill.setAttribute('y', st.box.y + st.box.h * (1 - st.v));
        st.fill.setAttribute('height', st.box.h * st.v);
      });
      S.raf = global.requestAnimationFrame(loop);
    }
    S.prog(spec.hint || '按住推进，松手落在亮带上即完成；过头会自己退回来');
    S.raf = global.requestAnimationFrame(loop);
    return true;
  }

  /* ---------------- 动词 5：拖动到位 ---------------- */
  function vDrag(S, spec) {
    var list = S.pick(spec);
    S.need = Math.max(1, Math.min(spec.n || list.length, list.length));
    list.forEach(function (p, i) {
      var st = S.spot(i, p, 'pdrag');
      var to = p.to || [st.box.x + st.box.w / 2 + 90, st.box.y + st.box.h / 2];
      var tr = Math.max(20, p.toR || 34);
      st.to = { x: to[0], y: to[1], r: tr };
      /* 目标位：画出图上那个「缺口」的位置与范围，玩家一眼能看到该拖到哪 */
      var tg = S.el('div', 'ptarget');
      tg.dataset.i = String(i);
      tg.style.left = pct(to[0] - tr, S.cx0, S.cw);
      tg.style.top = pct(to[1] - tr, S.cy0, S.ch);
      tg.style.width = (tr * 2 / S.cw * 100).toFixed(3) + '%';
      tg.style.height = (tr * 2 / S.ch * 100).toFixed(3) + '%';
      S.layer.appendChild(tg);
      var tRing = svgEl('circle', {
        cx: to[0], cy: to[1], r: tr,
        fill: 'none', stroke: S.accent, 'stroke-width': 2,
        'stroke-dasharray': '4 6', opacity: 0.75, 'class': 'ptarget-ring'
      });
      S.rings.appendChild(tRing);
      var grab = null, pid = null;
      function onMove(ev) {
        if (!grab || (pid != null && ev.pointerId !== pid)) return;
        st.node.style.transform = 'translate(' + (ev.clientX - grab.x) + 'px,' +
          (ev.clientY - grab.y) + 'px)';
      }
      function onUp(ev) {
        if (!grab || (pid != null && ev.pointerId !== pid)) return;
        var dx = ev.clientX - grab.x, dy = ev.clientY - grab.y;
        grab = null;
        st.node.classList.remove('dragging');
        st.node.style.transform = '';
        global.removeEventListener('pointermove', onMove);
        global.removeEventListener('pointerup', onUp);
        global.removeEventListener('pointercancel', onUp);
        var ip = S.toImg(ev.clientX, ev.clientY);
        var d = Math.sqrt(Math.pow(ip.x - st.to.x, 2) + Math.pow(ip.y - st.to.y, 2));
        if (d <= st.to.r) {
          if (tRing.parentNode) tRing.parentNode.removeChild(tRing);
          S.mark(st, '已归位 ' + S.done + ' / ' + S.need);
        } else if (Math.abs(dx) + Math.abs(dy) > 6) {
          S.tip('没对准缺口，再拖一次', true);
        }
      }
      st.node.addEventListener('pointerdown', function (ev) {
        if (!S.live() || st.done) return;
        ev.preventDefault();
        grab = { x: ev.clientX, y: ev.clientY };
        pid = ev.pointerId;
        st.node.classList.add('dragging');
        global.addEventListener('pointermove', onMove);
        global.addEventListener('pointerup', onUp);
        global.addEventListener('pointercancel', onUp);
      });
    });
    S.prog(spec.hint || '按住零件拖到虚线缺口，对准就归位；拖歪不重置');
    return true;
  }

  /* ---------------- 动词 6：节奏点按（准星进亮带时点） ---------------- */
  function vAim(S, spec, plate) {
    var lane = (plate.lanes && plate.lanes[0]) || spec.lane;
    if (!lane) return false;
    S.need = Math.max(1, spec.n || 4);
    var b = boxOf({ x: lane.x, y: lane.y, w: lane.w, h: lane.h });
    var st = S.spot(0, { x: b.x, y: b.y, w: b.w, h: b.h, order: 1, role: 'lane' }, 'paim');
    st.node.dataset.verb = 'aim';
    var band = lane.band || [0.44, 0.56];
    var lo = Math.max(0, Math.min(band[0], band[1]));
    var hi = Math.min(1, Math.max(band[0], band[1]));
    st.node.dataset.lo = String(lo);
    st.node.dataset.hi = String(hi);
    /* 亮带：图上被标出来的那一段，命中区就是它 */
    var zone = S.el('div', 'paim-band');
    zone.style.left = (lo * 100).toFixed(2) + '%';
    zone.style.width = ((hi - lo) * 100).toFixed(2) + '%';
    st.node.appendChild(zone);
    var mk = S.el('div', 'paim-mk');
    st.node.appendChild(mk);

    var period = Math.max(0.6, lane.period || 1.8);
    var pos = 0, dir = 1, hits = 0, last = 0;
    function inBand() { return pos >= lo && pos <= hi; }
    function loop(ts) {
      if (!S.live()) return;
      var dt = last ? Math.min(0.05, (ts - last) / 1000) : 0.016;
      last = ts;
      pos += dir * dt / period;
      if (pos >= 1) { pos = 1; dir = -1; }
      if (pos <= 0) { pos = 0; dir = 1; }
      mk.style.left = (pos * 100).toFixed(2) + '%';
      st.node.dataset.inband = inBand() ? '1' : '0';
      S.raf = global.requestAnimationFrame(loop);
    }
    st.node.addEventListener('click', function (ev) {
      if (ev && ev.stopPropagation) ev.stopPropagation();
      if (!S.live()) return;
      if (!inBand()) { S.tip('脱靶了，等准星进亮带再点；不扣进度', true); return; }
      hits++;
      S.done = hits;
      S.pop(b);
      st.node.classList.remove('hit');
      void st.node.offsetWidth;
      st.node.classList.add('hit');
      S.prog('命中 ' + hits + ' / ' + S.need);
      if (hits >= S.need) {
        S.close(st);
        S.finish(spec.win || '校准完成 · 任务成功');
      }
    });
    S.prog(spec.hint || '准星扫进亮带时点击；脱靶不扣进度');
    S.raf = global.requestAnimationFrame(loop);
    return true;
  }

  var VERBS = { tap: vTap, tapSeq: vTapSeq, hold: vHold, holdBand: vHoldBand, drag: vDrag, aim: vAim };

  /* host = { el, cfg, setProg, settle, tip, api, fallback }
     返回 false 表示「这块板 / 这个动词本引擎接不了」，由调用方回退旧玩法。 */
  function build(bd, plate, spec, host) {
    host = host || {};
    spec = spec || {};
    if (!bd || !plate || !plate.size) return false;
    var verb = spec.verb || 'tap';
    var fn = VERBS[verb];
    if (!fn) return false;                 /* 未实现动词：明确回退，不写半成品 */
    if (!plate.spots && verb !== 'aim') return false;

    var S = scaffold(bd, plate, spec, host);
    if (!S) return false;
    global.__SKPlateState = function () {
      return { verb: verb, dead: S.dead, finished: S.finished, need: S.need, done: S.done,
        apiDone: !!(host.api && host.api.done), spots: (S.spots || []).length };
    };
    var ok = fn(S, spec, plate);
    if (ok === false) {
      S.dead = true;
      if (S.wrap.parentNode) S.wrap.parentNode.removeChild(S.wrap);
      return false;
    }
    return true;
  }

  var api = {
    version: 2,
    verbs: Object.freeze(Object.keys(VERBS)),
    build: build
  };

  global.SKPlateTask = api;
})(typeof window !== 'undefined' ? window : globalThis);
