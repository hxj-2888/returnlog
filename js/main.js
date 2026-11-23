/* ==== ARCH NODE · 架构节点标注（根 ARCHITECTURE.md） ====
 * layer     : T2
 * domain    : 玩家决策
 * definedBy : 入口
 * truth     : js/main.js#开始页绑定
 * verify    : 门禁
 * flag      : F  (F=现行事实 / N=规范裁定)
 * 说明      : 本注释只作架构标注，不改变任何运行逻辑；多父只引用不复制。
 * ============================================================== */
/* =============================================================
 * 入口绑定（返航录V3 · 2026-10-29）
 * -------------------------------------------------------------
 * 职责：   绑定开始页角色按钮、填充版本号、托管设置面板（音乐/音效/暂停/退出）；
 *          游戏本体由 js/game.js 提供 SKV3。
 * 不变量： · 不定义游戏状态，只通过 data-* 属性、SKV3 公开 API 与 DOM 协作；
 *          · 必须在 version.js 与 game.js 之后加载；
 *          · 设置只写入 localStorage（sk.settings.v1），不进对局状态。
 * 依赖：   js/config/version.js、js/game.js
 * ============================================================= */
(function () {
  'use strict';

  var KEY = 'sk.settings.v1';
  var DEFAULTS = { music: 0.35, sfx: 0.8, musicOn: true, sfxOn: true, fps: true, spectDev: true };
  var S = load();
  var bgmStarted = false;

  function load() {
    try {
      var raw = JSON.parse(localStorage.getItem(KEY) || '{}');
      var fpsRaw = localStorage.getItem('sk_fps');
      return {
        music: typeof raw.music === 'number' ? Math.max(0, Math.min(1, raw.music)) : DEFAULTS.music,
        sfx: typeof raw.sfx === 'number' ? Math.max(0, Math.min(1, raw.sfx)) : DEFAULTS.sfx,
        musicOn: typeof raw.musicOn === 'boolean' ? raw.musicOn : DEFAULTS.musicOn,
        sfxOn: typeof raw.sfxOn === 'boolean' ? raw.sfxOn : DEFAULTS.sfxOn,
        fps: typeof raw.fps === 'boolean' ? raw.fps : (fpsRaw === '0' ? false : DEFAULTS.fps),
        spectDev: typeof raw.spectDev === 'boolean' ? raw.spectDev : DEFAULTS.spectDev
      };
    } catch (e) {
      return Object.assign({}, DEFAULTS);
    }
  }
  function save() {
    try {
      localStorage.setItem(KEY, JSON.stringify(S));
      localStorage.setItem('sk_fps', S.fps ? '1' : '0');
    } catch (e) {}
  }
  function $(id) { return document.getElementById(id); }

  function fillVersion() {
    if (!window.SKConfig) return;
    document.querySelectorAll('[data-version]').forEach(function (el) {
      el.textContent = window.SKConfig.version;
    });
  }

  /* ---------------- 音乐 / 音效 ---------------- */
  function bgmEl() { return $('bgm'); }
  /* 音量曲线：音乐滑杆 0.35 直接当线性音量用等于 −9dB，再乘旧的 0.7 就是 −12dB，
     在音效 0.8 的旁边基本听不见。这里走 pow(v, 0.7) 的感知曲线，
     0.35 → 0.47（约 −6.5dB），满档仍然是 1.0，不新增任何上限。 */
  function bgmVol() { return S.musicOn ? Math.min(1, Math.pow(Math.max(0, S.music), 0.7)) : 0; }
  function apply() {
    var bgm = bgmEl();
    if (bgm) {
      bgm.volume = bgmVol();
      if (!S.musicOn || S.music <= 0) {
        try { bgm.pause(); } catch (e) {}
      }
    }
    if (window.SKV3 && SKV3.setSfxVolume) SKV3.setSfxVolume(S.sfxOn ? S.sfx : 0);
    if (window.SKV3 && SKV3.setFpsEnabled) SKV3.setFpsEnabled(S.fps);
    if (window.SKV3 && SKV3.setSpectDev) SKV3.setSpectDev(S.spectDev);
  }
  function playBgm() {
    var bgm = bgmEl();
    if (!bgm || !S.musicOn || S.music <= 0) return;
    try {
      var p = bgm.play();
      if (p && p.then) p.then(function () { bgmStarted = true; }, function () {});
      else bgmStarted = true;
    } catch (e) {}
  }

  function syncSettings() {
    var mm = Math.round(S.music * 100), ss = Math.round(S.sfx * 100);
    var m = $('set-music'), s = $('set-sfx');
    if (m) m.value = mm;
    if (s) s.value = ss;
    if ($('set-music-v')) $('set-music-v').textContent = mm;
    if ($('set-sfx-v')) $('set-sfx-v').textContent = ss;
    if ($('set-music-on')) $('set-music-on').checked = !!S.musicOn;
    if ($('set-music-on-v')) $('set-music-on-v').textContent = S.musicOn ? '开' : '关';
    if ($('set-sfx-on')) $('set-sfx-on').checked = !!S.sfxOn;
    if ($('set-sfx-on-v')) $('set-sfx-on-v').textContent = S.sfxOn ? '开' : '关';
    if ($('set-fps')) $('set-fps').checked = !!S.fps;
    if ($('set-fps-v')) $('set-fps-v').textContent = S.fps ? '开' : '关';
    if ($('set-spect-dev')) $('set-spect-dev').checked = !!S.spectDev;
    if ($('set-spect-dev-v')) $('set-spect-dev-v').textContent = S.spectDev ? '开' : '关';
    var pb = $('set-pause');
    if (pb) {
      var live = !!(window.SKV3 && SKV3.isOpen && SKV3.isOpen());
      pb.style.display = live ? '' : 'none';   /* 只藏「暂停游戏」，别把整排按钮藏掉 */
      pb.textContent = (window.SKV3 && SKV3.isPaused && SKV3.isPaused()) ? '继续游戏' : '暂停游戏';
    }
  }

  function openSettings() {
    var el = $('settings');
    if (el) el.classList.remove('hide');
    syncSettings();
  }
  function closeSettings() {
    var el = $('settings');
    if (el) el.classList.add('hide');
  }
  function settingsOpen() {
    var el = $('settings');
    return !!(el && !el.classList.contains('hide'));
  }

  function bindSettings() {
    var btn = $('btn-settings');
    if (btn) btn.addEventListener('click', function () { playBgm(); openSettings(); });
    var close = $('set-close');
    if (close) close.addEventListener('click', closeSettings);
    var mOn = $('set-music-on');
    if (mOn) mOn.addEventListener('change', function () {
      S.musicOn = !!mOn.checked;
      if ($('set-music-on-v')) $('set-music-on-v').textContent = S.musicOn ? '开' : '关';
      apply(); save();
      if (S.musicOn && S.music > 0) playBgm();
    });
    var sOn = $('set-sfx-on');
    if (sOn) sOn.addEventListener('change', function () {
      S.sfxOn = !!sOn.checked;
      if ($('set-sfx-on-v')) $('set-sfx-on-v').textContent = S.sfxOn ? '开' : '关';
      apply(); save();
      if (S.sfxOn && window.SKV3 && SKV3.playSfx) SKV3.playSfx('click');
    });
    var fpsEl = $('set-fps');
    if (fpsEl) fpsEl.addEventListener('change', function () {
      S.fps = !!fpsEl.checked;
      if ($('set-fps-v')) $('set-fps-v').textContent = S.fps ? '开' : '关';
      apply(); save();
    });
    var sdEl = $('set-spect-dev');
    if (sdEl) sdEl.addEventListener('change', function () {
      S.spectDev = !!sdEl.checked;
      if ($('set-spect-dev-v')) $('set-spect-dev-v').textContent = S.spectDev ? '开' : '关';
      apply(); save();
    });
    var m = $('set-music');
    if (m) m.addEventListener('input', function () {
      S.music = Math.max(0, Math.min(1, (+m.value || 0) / 100));
      $('set-music-v').textContent = Math.round(S.music * 100);
      if (S.music > 0) playBgm();
      apply(); save();
    });
    var s = $('set-sfx');
    if (s) s.addEventListener('input', function () {
      S.sfx = Math.max(0, Math.min(1, (+s.value || 0) / 100));
      $('set-sfx-v').textContent = Math.round(S.sfx * 100);
      apply(); save();
      if (window.SKV3 && SKV3.playSfx) SKV3.playSfx('click');
    });
    var pause = $('set-pause');
    if (pause) pause.addEventListener('click', function () {
      if (window.SKV3 && SKV3.togglePauseGame) SKV3.togglePauseGame();
      syncSettings();
    });
    var exit = $('set-exit');
    if (exit) exit.addEventListener('click', function () {
      if (window.SKV3 && SKV3.isOpen && SKV3.isOpen()) SKV3.stop();
      closeSettings();
      syncSettings();
    });
    var ov = $('settings');
    if (ov) ov.addEventListener('click', function (e) { if (e.target === ov) closeSettings(); });
  }

  /* 身份卡改为"先选后进"：点卡片只切换选中态（主页会同时锚亮船上对应舱室），
     真正的开局走「进入舱段」或双击卡片。卡片没有 #home-go 时（旧页面）保持点一下就开局。 */
  var picked = 'human';
  /* 对局模式（2026-11-22：经典局=trio 三形互认；单人局=classic 四形互不相识） */
  var pickedMode = 'trio';
  function selectMode(el) {
    var m = el.getAttribute('data-mode');
    if (!m) return;
    pickedMode = (m === 'trio') ? 'trio' : 'classic';
    document.querySelectorAll('[data-mode]').forEach(function (x) {
      x.classList.toggle('sel', x === el);
    });
  }

  function selectRole(el) {
    var role = el.getAttribute('data-role');
    if (!role) return;
    picked = role;
    document.querySelectorAll('[data-role]').forEach(function (x) {
      x.classList.toggle('sel', x === el);
    });
    var modeBar = $('home-mode');
    if (modeBar) modeBar.classList.toggle('is-disabled', role === 'design');
  }

  /* ---------------- 素材加载门（2026-11-15 · 2026-11-22 修订） ----------------
     全部素材结算（成功或重试用尽）前禁用「进入舱段」；底图/船壳失败才硬拦，
     非关键素材失败降级放行（见 SKAssets.progress().degraded）；?test 是门禁页，直接放行。 */
  var TEST_PAGE = /[?&]test\b/.test(location.search);
  function bindLoader() {
    var go = $('home-go'), box = $('home-load'), bar = $('home-load-bar'),
      txt = $('home-load-txt'), retry = $('home-load-retry');
    if (!go || !box || !window.SKAssets) return;
    if (TEST_PAGE) {
      go.disabled = false;
      go.textContent = '进 入 舱 段';
      box.hidden = true;
      return;
    }
    function render(p) {
      var pct = Math.max(0, Math.min(100, p.pct || 0));
      /* 2026-11-22：只有底图/船壳失败才算「加载失败」并禁用进场；
         其余素材失败为降级放行（绘制/播放处有回退），保留重试入口。 */
      var bad = !!p.coreFailed && p.pending === 0;
      var ready = !!p.ready;
      var degraded = !!p.degraded;
      if (bar) bar.style.width = pct + '%';
      box.classList.toggle('ok', ready);
      box.classList.toggle('bad', bad);
      go.disabled = !ready;
      go.textContent = ready ? '进 入 舱 段' : (bad ? '素材加载失败' : '正在加载…');
      if (txt) txt.textContent = ready
        ? (degraded ? ('素材已就绪 · 可以进入（' + p.failed + ' 项非关键素材未取到，已用回退画法 · 点击重试）')
          : '素材已就绪 · 可以进入')
        : (bad ? '地图底图加载失败 · 点击重试'
          : ('正在加载素材 ' + pct + '% · 图像 ' + p.img.done + '/' + p.img.total +
             ' · 音频 ' + p.aud.done + '/' + p.aud.total));
      if (retry) retry.hidden = !(bad || degraded);
    }
    SKAssets.onChange(render);
    if (retry) retry.onclick = function () {
      retry.hidden = true;
      SKAssets.retryFailed();
      render(SKAssets.progress());
    };
    render(SKAssets.progress());
    SKAssets.preload();
    render(SKAssets.progress());
  }

  function startRole(role, mode) {
    var go = $('home-go');
    if (go && go.disabled) return;
    playBgm();
    /* 名单由开始页收集（玩家名 + 14 个 AI 名）；对局侧会再兜一次去重补位。
       ?test 门禁页会忽略这份名单，保证断言里的默认名字稳定。 */
    var roster = (window.SKHome && window.SKHome.roster) ? window.SKHome.roster() : null;
    /* 模式与身份正交（2026-11-21）：mode 决定阵容（经典 4 形互不相识 / 结伴 3 形互认），
       role 决定玩家席位。旧入口 role='trio' 仍兼容（start 内部会兜成 trio 模式）。 */
    var md = mode || pickedMode || null;
    if (window.SKV3) window.SKV3.start(role, roster, md);
    setTimeout(function () { apply(); syncSettings(); }, 0);
  }

  function bindMode() {
    document.querySelectorAll('[data-mode]').forEach(function (el) {
      el.addEventListener('click', function () { selectMode(el); });
    });
  }

  function bindRoles() {
    var hasGo = !!$('home-go');
    document.querySelectorAll('[data-role]').forEach(function (el) {
      el.addEventListener('click', function () {
        selectRole(el);
        if (!hasGo) startRole(el.getAttribute('data-role'), pickedMode);
      });
      el.addEventListener('dblclick', function () {
        startRole(el.getAttribute('data-role'), pickedMode);
      });
    });
    var go = $('home-go');
    if (go) go.addEventListener('click', function () { startRole(picked, pickedMode); });
  }

  function boot() {
    fillVersion();
    bindLoader();
    bindMode();
    bindRoles();
    bindSettings();
    apply();
    // 浏览器要求用户手势后才能播放音频。
    // 旧写法是「首次 pointerdown 试一次，不管成没成都摘掉监听」——
    // 那一次如果因为自动播放策略被拒，音乐就永远起不来了（除非再点设置/进舱段）。
    // 现在播成功才停监听，失败就继续等下一个手势。
    document.addEventListener('pointerdown', function () {
      if (!bgmStarted) playBgm();
    });
  }

  window.SKSettings = {
    open: openSettings,
    close: closeSettings,
    isOpen: settingsOpen,
    apply: apply,
    get: function () { return { music: S.music, sfx: S.sfx }; }
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
