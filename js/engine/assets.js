/* ==== ARCH NODE · 架构节点标注（根 ARCHITECTURE.md） ====
 * layer     : T2
 * domain    : 空间与资源
 * definedBy : 素材加载
 * truth     : js/engine/assets.js#loadImg / rtImg
 * verify    : 门禁（底图就绪 / 断网重试 / 预缩放降档）
 * flag      : N  (N=规范裁定 / F=现行事实)
 * 说明      : 只做加载与运行时缩放；不读对局状态、不改判定。
 * ============================================================== */
/* =============================================================
 * 运行时素材加载器（2026-11-15）
 * -------------------------------------------------------------
 * 背景：线上偶现「画面不完整」——
 *   ① 底图 13.5 MB，网络抖动一次失败后没有重试，整局退回平铺占位；
 *   ② 低内存设备上 4096 预缩放画布 getContext 返回 null，
 *      rtImg 在 draw() 里每帧抛错，主画布只剩背景色。
 * 口径：失败指数退避重试；预缩放逐级降档 4096→2048→1024→原图；
 *       仍失败时给可点击的重试条；online 事件重试全部失败项。
 * 不变量：· 只读 DOM / Image，不碰 G 与任何对局状态；
 *        · file:// 可用：经典 script、无 fetch、无 ES Module；
 *        · 预缩放只改运行时副本，源尺寸保留在 stats().sourceDim。
 * 对外：window.SKAssets = { IMG, loadImg, rtImg, mapReady, stats, retryFailed }
 * ============================================================= */
(function (global) {
  'use strict';
  var A = 'assets/scene/';
  var MAX_TEX = 4096;
  var CAPS = [4096, 2048, 1024];
  var TRY = { core: 5, other: 3, audio: 3 };
  var WAIT0 = 600;
  var IMG = {}, SRC = {}, ST = {}, RTIMG = {}, SRCDIM = {}, RTFAIL = {}, SEQ = {};
  var RETRIES = 0;
  /* 音效与 BGM 的唯一清单：SND 通过 SKAssets.SFX 取用，不在 game.js 再抄一份。
     预加载与播放共用同一批 URL；浏览器缓存负责第二次取用。 */
  var SFX = {
    knife: ['audio/sfx-knife-01.ogg', 'audio/sfx-knife-02.ogg'],
    gun: ['audio/sfx-gun.ogg'],
    step: ['audio/sfx-step-01.ogg', 'audio/sfx-step-02.ogg'],
    scream: ['audio/sfx-scream-01.ogg', 'audio/sfx-scream-02.ogg'],
    metal: ['audio/sfx-metal.ogg'],
    door: ['audio/sfx-door.ogg'],
    ui: ['audio/sfx-ui.ogg'],
    click: ['audio/sfx-click.ogg'],
    work: ['audio/sfx-work.ogg'],
    flesh: ['audio/sfx-flesh.ogg'],
    win: ['audio/sfx-win.ogg'],
    lose: ['audio/sfx-lose.ogg'],
    report: ['audio/sfx-notify.ogg']
  };
  var BGM = 'audio/music-bgm.m4a';
  var AUD = {}, AST = {}, ASEQ = {}, ARETRIES = 0, AUDIO_START = false;
  var LISTEN = [];
  function audioList() {
    var out = [], seen = {};
    for (var k in SFX) for (var i = 0; i < SFX[k].length; i++) {
      var u = SFX[k][i];
      if (!seen[u]) { seen[u] = 1; out.push(u); }
    }
    if (!seen[BGM]) out.push(BGM);
    return out;
  }
  var ALIST = audioList();

  function ok(im) { return !!im && (im.naturalWidth ? im.naturalWidth > 0 : im.width > 0); }
  function srcUrl(src) { return /^(assets\/|audio\/|https?:|file:)/.test(src) ? src : A + src; }

  function notify() {
    for (var i = 0; i < LISTEN.length; i++) {
      try { LISTEN[i](progress()); } catch (e) { /* UI 回调失败不能拖垮加载器 */ }
    }
  }

  function imgCount() {
    var total = 0, done = 0, failed = 0;
    for (var k in ST) {
      total++;
      if (ok(IMG[k])) done++;
      else if (ST[k].failed) failed++;
    }
    return { total: total, done: done, failed: failed };
  }
  function audCount() {
    var total = ALIST.length, done = 0, failed = 0;
    for (var i = 0; i < ALIST.length; i++) {
      var st = AST[ALIST[i]];
      if (st && st.ready) done++;
      else if (st && st.failed) failed++;
    }
    return { total: total, done: done, failed: failed };
  }
  function progress() {
    var i = imgCount(), a = audCount();
    var total = i.total + a.total, done = i.done + a.done, failed = i.failed + a.failed;
    return { pct: total ? Math.floor(done * 100 / total) : 0,
      ready: i.total > 0 && done === total, failed: failed,
      pending: Math.max(0, total - done - failed), img: i, aud: a };
  }

  function stats() {
    var failed = [];
    for (var k in ST) if (ST[k].failed) failed.push(k);
    var a = audCount();
    return { retries: RETRIES, audioRetries: ARETRIES, failed: failed,
      sourceDim: SRCDIM, texLimit: MAX_TEX, fallback: Object.keys(RTFAIL),
      audio: { total: a.total, done: a.done, failed: a.failed } };
  }

  function coreFailed() {
    return !!((ST.base && ST.base.failed) || (ST.hull && ST.hull.failed));
  }

  function banner() {
    var el = document.getElementById('asset-retry');
    if (!coreFailed()) { if (el) el.remove(); return; }
    /* 未开局时由主页加载条负责失败提示，别再叠一个顶部条 */
    if (!document.getElementById('v3-root')) { if (el) el.remove(); return; }
    if (el || !document.body) return;
    el = document.createElement('div');
    el.id = 'asset-retry';
    el.textContent = '地图贴图加载失败 · 点击重试';
    el.style.cssText = 'position:fixed;left:50%;top:10px;transform:translateX(-50%);z-index:10006;' +
      'padding:6px 14px;border-radius:6px;background:rgba(80,20,16,.92);border:1px solid #B4433A;' +
      'color:#FFD9D2;font:600 12px system-ui,sans-serif;cursor:pointer;user-select:none';
    el.onclick = function () {
      el.remove();
      if (ST.base && ST.base.failed) loadImg('base', SRC.base, 0);
      if (ST.hull && ST.hull.failed) loadImg('hull', SRC.hull, 0);
    };
    document.body.appendChild(el);
  }

  function retryFailed() {
    for (var k in ST) if (ST[k].failed) loadImg(k, SRC[k], 0);
    for (var i = 0; i < ALIST.length; i++) {
      var s = ALIST[i];
      if (AST[s] && AST[s].failed) loadAudio(s, 0);
    }
    notify();
  }

  function onChange(fn) { if (typeof fn === 'function') LISTEN.push(fn); }

  function preload() {
    if (!AUDIO_START) {
      AUDIO_START = true;
      for (var i = 0; i < ALIST.length; i++) loadAudio(ALIST[i], 0);
    }
    notify();
    return progress();
  }

  function audioEl(src) {
    if (src === BGM) {
      var bgm = document.getElementById('bgm');
      if (bgm) return bgm;
    }
    return new Audio();
  }

  function loadAudio(src, n) {
    n = n | 0;
    if (n) ARETRIES++;
    var my = ASEQ[src] = (ASEQ[src] || 0) + 1;
    var el = AUD[src] || audioEl(src);
    AUD[src] = el;
    AST[src] = { n: n, ready: false, failed: false };
    var settled = false, timer = 0;
    function settle(okv) {
      if (settled || ASEQ[src] !== my) return;
      settled = true;
      clearTimeout(timer);
      if (okv) AST[src].ready = true;
      else AST[src].failed = true;
      notify();
    }
    function check() {
      if (ASEQ[src] === my && el.readyState >= 4) settle(true);
    }
    el.preload = 'auto';
    el.addEventListener('canplaythrough', function () {
      if (ASEQ[src] === my) settle(true);
    });
    el.addEventListener('loadeddata', check);
    el.addEventListener('progress', check);
    el.addEventListener('error', function () {
      if (ASEQ[src] !== my || AST[src].ready || AST[src].failed) return;
      if (n >= TRY.audio) { settle(false); return; }
      var wait = Math.min(4000, WAIT0 * Math.pow(2, n));
      setTimeout(function () { if (ASEQ[src] === my) loadAudio(src, n + 1); }, wait);
    });
    /* canplaythrough 在少数移动浏览器上可能不触发：有可播数据（>=3）就放行；
       连当前数据都没有才判失败，避免加载页永久卡死。 */
    timer = setTimeout(function () {
      if (ASEQ[src] !== my || settled) return;
      if (el.readyState >= 3) settle(true);
      else settle(false);
    }, 20000);
    if (src === BGM && n === 0 && el.getAttribute('src')) {
      if (el.readyState >= 4) { settle(true); return; }
      if (el.networkState !== 2) { try { el.load(); } catch (e) {} }
    } else {
      el.src = src + (n ? '?r=' + n : '');
      try { el.load(); } catch (e) {}
    }
    if (el.readyState >= 4) settle(true);
  }

  function loadImg(k, src, n) {
    n = n | 0;
    if (n) RETRIES++;
    var max = (k === 'base' || k === 'hull') ? TRY.core : TRY.other;
    var my = SEQ[k] = (SEQ[k] || 0) + 1;
    delete RTIMG[k];
    delete RTFAIL[k];
    delete SRCDIM[k];
    var im = new Image();
    IMG[k] = im;
    SRC[k] = src;
    ST[k] = { n: n, max: max, failed: false };
    if (LISTEN.length) notify();
    im.addEventListener('load', function () {
      if (SEQ[k] !== my) return;
      if (k === 'base' || k === 'hull') { rtImg(k); banner(); }
      notify();
    });
    im.addEventListener('error', function () {
      if (SEQ[k] !== my) return;
      if (n >= max) { ST[k].failed = true; banner(); notify(); return; }
      var wait = Math.min(4000, WAIT0 * Math.pow(2, n));
      setTimeout(function () {
        if (SEQ[k] === my) loadImg(k, src, n + 1);
      }, wait);
    });
    im.src = srcUrl(src) + (n ? '?r=' + n : '');
    return im;
  }

  function rtImg(k) {
    var src = IMG[k];
    var sw = src ? (src.naturalWidth || src.width || 0) : 0;
    var sh = src ? (src.naturalHeight || src.height || 0) : 0;
    if (!sw || !sh) return src;
    if (RTIMG[k]) return RTIMG[k];
    if (RTFAIL[k]) return src;
    if (!SRCDIM[k]) SRCDIM[k] = { w: sw, h: sh };
    var m = Math.max(sw, sh);
    for (var i = 0; i < CAPS.length; i++) {
      var cap = CAPS[i];
      if (m <= cap) return (RTIMG[k] = src);
      var q = cap / m;
      var c = null;
      try {
        c = document.createElement('canvas');
        c.width = Math.max(1, Math.round(sw * q));
        c.height = Math.max(1, Math.round(sh * q));
        var o = c.getContext('2d');
        if (!o) { c.width = 0; c.height = 0; continue; }
        o.imageSmoothingEnabled = true;
        o.imageSmoothingQuality = 'high';
        o.drawImage(src, 0, 0, c.width, c.height);
        c.complete = true;
        c.naturalWidth = c.width;
        c.naturalHeight = c.height;
        IMG[k] = c;
        return (RTIMG[k] = c);
      } catch (e) {
        /* 内存不足或源图解码失败：先释放本档画布，再降一档试 */
        if (c) { c.width = 0; c.height = 0; }
      }
    }
    RTFAIL[k] = 1;
    return src;
  }

  if (global.addEventListener) global.addEventListener('online', retryFailed);
  if (global.location && !/[?&]test\b/.test(global.location.search)) {
    setTimeout(function () { preload(); }, 0);
  }

  global.SKAssets = { IMG: IMG, SFX: SFX, BGM: BGM, loadImg: loadImg, rtImg: rtImg,
    mapReady: function (im) { return ok(im); }, stats: stats, retryFailed: retryFailed,
    preload: preload, progress: progress, onChange: onChange };
})(typeof window !== 'undefined' ? window : globalThis);
