/* ==== ARCH NODE · 架构节点标注（根 ARCHITECTURE.md） ====
 * layer     : T2
 * domain    : 船体系统（自动门 / 供电三态灯 / 断电遮罩 / 电闸 / 暂停）
 * definedBy : 门禁构建与扫描 / 视线遮挡 / 照明三态 / 拉闸 / 单机暂停
 * truth     : js/engine/ship-sys.js#SKShipSys
 * verify    : npm test
 * flag      : F
 * note      : P4 从 js/game.js 拆出
 * ============================================================== */
(function (global) {
  'use strict';

  const DOOR_SCAN_TIME = 2.5;

  function create(R) {
    const {
      getG, getSND, M, segX, los,
      DOOR_OPEN_R, DOOR_CLOSE_R, DOOR_SPEED, DOOR_W, DOOR_PASS,
      roomIdAt, hear, aiHear, envNotice, credBroadcast, noticeAction,
      logEvent, pulseHud, toast, newGame, stop,
    } = R;

    function buildDoors() {
      const out = [];
      for (const c of M.corridors) {
        const ends = [[0, c.a], [c.pts.length - 1, c.b]];
        for (const [ei, rid] of ends) {
          const r = M.rooms.find(q => q.id === rid); if (!r) continue;
          const p = c.pts[ei];
          let best = null, bd = 1e9;
          for (const d of r.doors) {
            const axis = d[0], v = d[1], horiz = (axis === 't' || axis === 'b');
            if (horiz) {
              const wy = axis === 't' ? r.rect[1] : r.rect[1] + r.rect[3];
              if (Math.abs(p[1] - wy) > 0.01) continue;
              const dd = Math.abs(v - p[0]);
              if (dd < bd) { bd = dd; best = d; }
            } else {
              const wx = axis === 'l' ? r.rect[0] : r.rect[0] + r.rect[2];
              if (Math.abs(p[0] - wx) > 0.01) continue;
              const dd = Math.abs(v - p[1]);
              if (dd < bd) { bd = dd; best = d; }
            }
          }
          if (!best) continue;
          const horiz = best[0] === 't' || best[0] === 'b';
          const x = horiz ? best[1] : (best[0] === 'l' ? r.rect[0] : r.rect[0] + r.rect[2]);
          const y = horiz ? (best[0] === 't' ? r.rect[1] : r.rect[1] + r.rect[3]) : best[1];
          out.push({
            id: c.id + ':' + rid, x, y, horiz, w: DOOR_W, open: 0, target: 0, scanT: 0,
            x1: horiz ? x - DOOR_W / 2 : x, y1: horiz ? y : y - DOOR_W / 2,
            x2: horiz ? x + DOOR_W / 2 : x, y2: horiz ? y : y + DOOR_W / 2,
          });
        }
      }
      return out;
    }

    function doorScanRule(d) {
      const G = getG();
      if (!G) return false;
      if (G.lightState === 2) return true;
      const dRoom = String(d.id || '').split(':').pop();
      return !!(G.roomOut && G.roomOut[dRoom] > 0);
    }

    function doorAutoSound(d) {
      const G = getG();
      const SND = getSND();
      if (!G || G.camView || G.over) return;
      aiHear('door', d.x, d.y, 7);
      if (SND) SND.doorAuto(SND.volAt(d.x, d.y, 0.85));
    }

    function doorTick(dt) {
      const G = getG();
      if (!G || !G.doors || G.meet || G.over) return;
      for (const d of G.doors) {
        const dRoom = String(d.id || '').split(':').pop();
        if (G.terminator && dRoom !== 'bridge') {
          d.scanT = 0; d.target = 0;
        } else {
          const scanRule = doorScanRule(d);
          let busy = false;
          const range = scanRule ? DOOR_CLOSE_R : (d.open > 0.02 ? DOOR_CLOSE_R : DOOR_OPEN_R);
          for (const a of G.agents) {
            if (!a.alive || a.downed || a.detained) continue;
            if (Math.hypot(a.x - d.x, a.y - d.y) < range) { busy = true; break; }
          }
          if (!scanRule) {
            d.scanT = 0;
            d.target = busy ? 1 : 0;
          } else if (!busy) {
            d.scanT = 0;
            d.target = 0;
          } else {
            d.scanT = Math.min(DOOR_SCAN_TIME, (d.scanT || 0) + dt);
            d.target = d.scanT >= DOOR_SCAN_TIME ? 1 : 0;
          }
        }
        const prev = d.open;
        if (d.open < d.target) d.open = Math.min(d.target, d.open + dt * DOOR_SPEED);
        else if (d.open > d.target) d.open = Math.max(d.target, d.open - dt * DOOR_SPEED);
        if ((prev < 1 && d.open >= 1) || (prev > 0 && d.open <= 0)) doorAutoSound(d);
      }
    }

    function doorBlockedSegment(x1, y1, x2, y2) {
      const G = getG();
      if (!G || !G.doors) return false;
      for (const d of G.doors) {
        if (!segX([x1, y1], [x2, y2], [d.x1, d.y1], [d.x2, d.y2])) continue;
        if (G.terminator && String(d.id || '').split(':').pop() !== 'bridge') return true;
        if (doorScanRule(d) && (d.scanT || 0) < DOOR_SCAN_TIME) return true;
        if (d.open > DOOR_PASS) continue;
        return true;
      }
      return false;
    }

    function losNow(x1, y1, x2, y2) {
      const G = getG();
      if (!los(x1, y1, x2, y2)) return false;
      if (!G || !G.doors) return true;
      for (const d of G.doors) {
        const locked = G.terminator && String(d.id || '').split(':').pop() !== 'bridge';
        if (!locked && d.open > DOOR_PASS) continue;
        if (segX([x1, y1], [x2, y2], [d.x1, d.y1], [d.x2, d.y2])) return false;
      }
      return true;
    }

    function applyRoomOut() {
      const G = getG();
      if (!G.lit) G.lit = {};
      for (const r of M.rooms) {
        const out = !!(G.roomOut && G.roomOut[r.id] > 0);
        G.lit[r.id] = !!(G.litBase && G.litBase[r.id]) && !out;
      }
    }

    function refreshLight() {
      const G = getG();
      const st = G.lightState | 0;
      if (!G.litBase) G.litBase = {};
      for (const r of M.rooms) {
        if (st === 2) G.litBase[r.id] = (r.id === 'bridge');
        else if (st === 1) G.litBase[r.id] = true;
        else G.litBase[r.id] = (r.light === 'bright') ||
          (!!G.powerFixed && (r.id === 'engine' || r.id === 'power'));
      }
      applyRoomOut();
      G.corrLit = (st !== 2);
      G.blackout = (st === 2);
    }

    function outBlocksDoing(a) {
      const G = getG();
      if (!a || !G || !G.roomOut) return false;
      if (a._doing !== 'task') return false;
      const rid = (a._taskPt != null && M.points[a._taskPt]) ? M.points[a._taskPt].room : null;
      return !!(rid && G.roomOut[rid] > 0);
    }

    function roomOutTick(dt) {
      const G = getG();
      if (!G.roomOut) return;
      let ch = false;
      for (const k in G.roomOut) {
        G.roomOut[k] -= dt;
        if (G.roomOut[k] <= 0) { delete G.roomOut[k]; ch = true; }
      }
      if (ch) applyRoomOut();
    }

    function breakerOnTime() {
      const G = getG();
      return G.powerFixed ? 3 : 4.5;
    }

    function breakerOffTime() {
      const G = getG();
      const n = Math.max(0, (G.breakerPulls || 0)) + 1;
      return Math.min(9, 3 * n);
    }

    function breakerPullTime() {
      const G = getG();
      return G.lightState === 2 ? breakerOnTime() : breakerOffTime();
    }

    function breakerPuller() {
      const G = getG();
      for (const a of G.agents) {
        if (a._doing === 'breaker' && a.doing > 0 && a._dur > 0)
          return { p: 1 - a.doing / a._dur, heavy: a._dur > 4 };
      }
      return null;
    }

    function pullBreaker(actor) {
      const G = getG();
      const SND = getSND();
      const wasOff = G.lightState === 2;
      G.lightState = (wasOff ? (G.powerFixed ? 1 : 0) : 2);
      if (!wasOff && G.lightState === 2) G.breakerPulls = (G.breakerPulls || 0) + 1;
      refreshLight();
      if (SND) SND.breaker();
      pulseHud('pwr');
      for (const d of (G.doors || [])) d.scanT = 0;
      const br = M.facility.find(f => f.kind === 'breaker');
      logEvent('breaker', {
        actor: actor ? actor.i : null, on: G.lightState !== 2, state: G.lightState,
        room: br ? roomIdAt(br.x, br.y) : 'power', x: br ? +br.x.toFixed(1) : null, y: br ? +br.y.toFixed(1) : null,
      });
      if (br) {
        G.fx.push({ type: 'power', x: br.x, y: br.y, t: 1.0, dur: 1.0, on: G.lightState !== 2 });
        G.fx.push({ type: 'spark', x: br.x, y: br.y, t: 1.0, dur: 1.0 });
        if (G.lightState === 2 && G.powerFixed)
          G.fx.push({ type: 'alarm', x: br.x, y: br.y, t: 1.4, dur: 1.4 });
        hear(br.x, br.y, 'power', 1.1);
        if (G.lightState !== 2) credBroadcast(actor, 'breakerOn', br.x, br.y);
        noticeAction(actor, br.x, br.y, 6, 'breaker');
        aiHear('power', br.x, br.y, 30, { actor: actor });
        envNotice('lights', br.x, br.y, G.lightState === 2 ? 0.85 : 0.45);
      }
      toast(G.lightState === 2
        ? '电闸已拉下：全船变暗 · 走廊灯全熄 · 监控信号中断 · 所有门需扫描 2 秒才能通过'
          + ' · 本夜第 ' + G.breakerPulls + ' 次，再拉要 ' + breakerOffTime() + ' 秒'
        : ('电闸已合上：' + (G.powerFixed ? '配电已修复' : '') + '全船照明恢复 · 自动门安检解除'
          + ' · 合闸耗时 ' + breakerOnTime() + ' 秒'));
    }

    function togglePause() {
      const G = getG();
      if (!G || G.over || G.inspect || G.camView || G.pipePick || G.sabPick) return;
      if (G.meet && G.me && G.me.alive && !G.me.downed && !G.spectMode) return;
      const el = document.getElementById('pause');
      if (!G.paused) {
        G.paused = true; G.pauseAt = performance.now(); G.pauseT = performance.now() / 1000;
        G.pauseMeet = !!G.meet;
        const info = document.getElementById('p-info');
        if (info) info.textContent = G.designMode
          ? '设计者纯净模式 · 世界已冻结 · 26 个任务点全开放'
          : ('第 ' + G.night + ' 夜 · 剩余 ' + Math.max(0, Math.round(G.t)) + ' 秒 · 任务 ' + G.me.tIdx + '/4');
        if (el) el.classList.remove('hide');
      } else {
        const d = performance.now() - (G.pauseAt || performance.now());
        if (G.phase) { G.phase.startedAt += d; G.phase.endsAt += d; }
        G.paused = false; G.pauseMeet = false;
        if (el) el.classList.add('hide');
      }
    }

    function restartGame() {
      const G = getG();
      G.paused = false; G.pauseMeet = false;
      const el = document.getElementById('pause'); if (el) el.classList.add('hide');
      newGame();
    }

    function exitToMenu() { stop(); }

    return {
      buildDoors, doorScanRule, doorAutoSound, doorTick, doorBlockedSegment, losNow,
      applyRoomOut, refreshLight, outBlocksDoing, roomOutTick,
      breakerOnTime, breakerOffTime, breakerPullTime, breakerPuller, pullBreaker,
      togglePause, restartGame, exitToMenu,
    };
  }

  global.SKShipSys = { DOOR_SCAN_TIME, create };
})(typeof window !== 'undefined' ? window : globalThis);
