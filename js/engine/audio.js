/* ==== ARCH NODE · 架构节点标注（根 ARCHITECTURE.md） ====
 * layer     : T2
 * domain    : 音频引擎
 * definedBy : CC0 采样池 + WebAudio 合成兜底 + 线性距离衰减
 * truth     : js/engine/audio.js#SKAudio
 * verify    : npm test
 * flag      : F
 * note      : P1 从 js/game.js 拆出；不直接闭包 G / SIM_RUN，通过 opts 注入
 * ============================================================== */
(function (global) {
  'use strict';

  function create(opts) {
    const getMe = (opts && opts.getMe) || function () { return null; };
    const isSim = (opts && opts.isSim) || function () { return false; };

    let ac = null, on = true, master = 1;
    const FILE = global.SKAssets.SFX;
    const POOL = {};
    let rr = 0;

    /* ---- 声音距离量化 ----
       d=0 → 最高音，d ≥ range → 保底音，中间线性。 */
    const DIST = { range: 18, min: 0.14, max: 1.0 };
    function volAt(x, y, scale) {
      const me = getMe();
      const s = (scale == null ? 1 : scale);
      if (!me) return DIST.min * s;
      const d = Math.hypot(x - me.x, y - me.y);
      const t = Math.max(0, Math.min(1, d / DIST.range));
      const v = DIST.max + (DIST.min - DIST.max) * t;
      return Math.max(DIST.min, Math.min(DIST.max, v)) * s;
    }

    const TONE = {
      knife: { max: 0.60, rate: [0.90, 1.00] },
      gun: { max: 0.74, rate: [0.95, 1.01] },
      scream: { max: 0.52, rate: [0.94, 1.02] },
      step: { max: 0.30, rate: [1.00, 1.12] },
      flesh: { max: 0.42, rate: [0.90, 1.00] },
      door: { max: 0.34, rate: [0.88, 0.94] },
      work: { max: 0.38, rate: [0.92, 1.04] },
      metal: { max: 0.50, rate: [0.70, 0.90] },
      ui: { max: 0.62, rate: [1, 1] },
      click: { max: 0.40, rate: [1, 1] },
      report: { max: 0.55, rate: [1, 1] },
    };

    const LOG = [];
    let LOGN = 0;
    function note(n) { LOG.push(n); LOGN++; if (LOG.length > 120) LOG.shift(); }

    function prep(name) {
      if (POOL[name]) return POOL[name];
      const pool = [];
      for (const src of FILE[name]) {
        for (let i = 0; i < 2; i++) {
          const a = new Audio(src);
          a.preload = 'auto';
          a.__src = src;
          pool.push(a);
        }
      }
      return POOL[name] = pool;
    }

    function play(name, vol, rate) {
      if (!on || isSim()) return true;
      if (!FILE[name]) return false;
      const pool = prep(name);
      let a = pool.find(x => x.paused || x.ended);
      if (!a) { a = pool[rr++ % pool.length]; try { a.pause(); } catch (e) {} }
      const tn = TONE[name];
      try {
        a.currentTime = 0;
        let v = (vol == null ? 1 : vol) * master;
        if (tn) v = Math.min(v, tn.max);
        a.volume = Math.max(0, Math.min(1, v));
        const rt = rate == null && tn
          ? (tn.rate[0] + Math.random() * (tn.rate[1] - tn.rate[0]))
          : (rate || 1);
        a.playbackRate = Math.max(0.5, Math.min(1.8, rt));
        const p = a.play();
        if (p && p.catch) p.catch(() => {});
      } catch (e) {}
      return true;
    }

    function C() {
      if (!ac) {
        try { ac = new (global.AudioContext || global.webkitAudioContext)(); }
        catch (e) { ac = null; }
      }
      return ac;
    }

    function beep(f0, f1, dur, type, vol) {
      if (!on || isSim()) return;
      const c = C();
      if (!c) return;
      const o = c.createOscillator(), g = c.createGain();
      o.type = type || 'sine';
      o.frequency.setValueAtTime(f0, c.currentTime);
      if (f1) o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), c.currentTime + dur);
      g.gain.setValueAtTime((vol || 0.10) * master, c.currentTime);
      g.gain.exponentialRampToValueAtTime(0.0008, c.currentTime + dur);
      o.connect(g); g.connect(c.destination); o.start(); o.stop(c.currentTime + dur + 0.02);
    }

    function noise(dur, vol, hp) {
      if (!on || isSim()) return;
      const c = C();
      if (!c) return;
      const n = Math.floor(c.sampleRate * dur), b = c.createBuffer(1, n, c.sampleRate), d = b.getChannelData(0);
      for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n);
      const src = c.createBufferSource(); src.buffer = b;
      const g = c.createGain(); g.gain.setValueAtTime((vol || 0.2) * master, c.currentTime);
      g.gain.exponentialRampToValueAtTime(0.0008, c.currentTime + dur);
      let node = src;
      if (hp) { const f = c.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = hp; src.connect(f); node = f; }
      node.connect(g); g.connect(c.destination); src.start();
    }

    function noiseLp(dur, vol, cut) {
      if (!on || isSim()) return;
      const c = C();
      if (!c) return;
      const n = Math.floor(c.sampleRate * dur), b = c.createBuffer(1, n, c.sampleRate), d = b.getChannelData(0);
      let last = 0;
      for (let i = 0; i < n; i++) {
        last = last * 0.82 + (Math.random() * 2 - 1) * 0.18;
        d[i] = last * (1 - i / n);
      }
      const src = c.createBufferSource(); src.buffer = b;
      const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = cut || 260;
      const g = c.createGain(); g.gain.setValueAtTime((vol || 0.2) * master, c.currentTime);
      g.gain.exponentialRampToValueAtTime(0.0008, c.currentTime + dur);
      src.connect(f); f.connect(g); g.connect(c.destination); src.start();
    }

    for (const k in FILE) prep(k);

    return {
      setOn: function (v) {
        on = !!v;
        if (!on) for (const k in POOL) for (const a of POOL[k]) { try { a.pause(); } catch (e) {} }
      },
      isOn: function () { return on; },
      setMaster: function (v) { master = Math.max(0, Math.min(1, +v || 0)); },
      getMaster: function () { return master; },
      volAt: volAt,
      distRange: DIST.range,
      debug: function () {
        const out = {};
        for (const k in POOL) out[k] = POOL[k].map(a => ({ src: a.__src, ready: a.readyState, err: a.error ? a.error.code : 0 }));
        return out;
      },
      log: function () { return LOG.slice(); },
      logCount: function () { return LOGN; },
      clearLog: function () { LOG.length = 0; },
      knife: function (vol) {
        note('knife');
        const v = Math.max(0.12, Math.min(0.78, (vol == null ? 0.6 : vol) * 0.86));
        if (!play('knife', v, 0.92 + Math.random() * 0.10)) {
          noise(0.09, 0.10, 1200); beep(300, 140, 0.14, 'triangle', 0.07);
        }
      },
      flesh: function (vol) {
        if (!play('flesh', Math.max(0.10, Math.min(0.55, vol == null ? 0.32 : vol)), 0.94 + Math.random() * 0.10))
          noise(0.10, 0.06, 900);
      },
      shot: function (vol) {
        note('shot');
        if (!play('gun', vol == null ? 1 : vol, 0.97 + Math.random() * 0.06)) {
          noise(0.10, 0.34, 300); beep(900, 120, 0.16, 'square', 0.18);
        }
      },
      step: function (vol) {
        note('step');
        if (!play('step', (vol == null ? 0.4 : vol) * 0.78, 1.02 + Math.random() * 0.12)) beep(150, 120, 0.06, 'sine', 0.05);
      },
      scream: function (vol) {
        note('scream');
        if (!play('scream', Math.max(0.06, Math.min(0.65, vol == null ? 0.45 : vol)), 0.96 + Math.random() * 0.08)) {
          noise(0.12, 0.07, 600); beep(300, 160, 0.18, 'sawtooth', 0.04);
        }
      },
      ui: function () { if (!play('ui', 0.85, 1)) beep(520, 700, 0.07, 'triangle', 0.12); },
      interact: function () { if (!play('ui', 0.85, 1)) beep(520, 700, 0.07, 'triangle', 0.12); },
      click: function () { if (!play('click', 0.5, 1)) beep(760, 620, 0.05, 'square', 0.08); },
      doorAuto: function (vol) {
        if (!play('door', (vol == null ? 0.4 : vol) * 0.65, 0.92)) beep(240, 180, 0.09, 'square', 0.035);
      },
      done: function () { beep(660, 990, 0.15, 'triangle', 0.16); },
      qual: function () { beep(520, 1040, 0.32, 'sine', 0.18); beep(780, 1560, 0.22, 'sine', 0.09); },
      work: function () { if (!play('work', 0.55, 0.94 + Math.random() * 0.12)) noise(0.05, 0.06, 1600); },
      med: function () { beep(420, 760, 0.20, 'sine', 0.16); },
      ammo: function () { beep(300, 240, 0.13, 'square', 0.15); },
      revive: function () { beep(380, 900, 0.30, 'sine', 0.17); },
      report: function () { note('report'); if (!play('report', 0.75, 1)) { beep(880, 440, 0.28, 'triangle', 0.13); } },
      vote: function () { if (!play('ui', 0.55, 1.18)) beep(600, 900, 0.09, 'square', 0.10); },
      expel: function () { note('expel'); if (!play('metal', 0.9, 0.72)) beep(300, 80, 0.50, 'sawtooth', 0.16); },
      breaker: function () { note('breaker'); noise(0.18, 0.26, 200); beep(95, 55, 0.28, 'square', 0.11); play('metal', 0.85, 0.9); },
      sabotage: function () { note('sabotage'); noise(0.30, 0.20, 600); beep(180, 1500, 0.28, 'sawtooth', 0.09); play('metal', 0.6, 0.78); },
      pipe: function () { note('pipe'); beep(210, 760, 0.24, 'sine', 0.11); },
      robot: function () { note('robot'); beep(240, 180, 0.12, 'square', 0.08); play('metal', 0.55, 1.04); noise(0.10, 0.10, 1200); },
      medbot: function () {
        note('medbot');
        beep(620, 880, 0.09, 'sine', 0.09);
        setTimeout(function () { beep(880, 1180, 0.09, 'sine', 0.09); }, 110);
        setTimeout(function () { beep(1180, 1180, 0.07, 'sine', 0.07); }, 220);
      },
      alarm: function () { note('alarm'); beep(780, 780, 0.10, 'square', 0.16); },
      search: function () { noise(0.16, 0.10, 1800); beep(520, 640, 0.10, 'triangle', 0.09); },
      ghost: function () { beep(880, 220, 0.55, 'sine', 0.09); beep(440, 110, 0.70, 'sine', 0.05); },
      win: function () { note('win'); if (!play('win', 0.9)) { beep(660, 1320, 0.5, 'sine', 0.16); } },
      lose: function () { note('lose'); if (!play('lose', 0.85)) { beep(220, 60, 0.7, 'sawtooth', 0.14); } },
      drag: function (vol) {
        note('drag');
        const v = vol == null ? 0.5 : vol;
        noiseLp(0.28, v * 0.20, 300);
        beep(72, 58, 0.22, 'sine', 0.028 * v);
      },
    };
  }

  global.SKAudio = { create: create };
})(window);
