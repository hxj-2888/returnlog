/* ==== ARCH NODE · 架构节点标注（根 ARCHITECTURE.md） ====
 * layer     : T2
 * domain    : 异形破坏 / 故障维修 / 站桩与小游戏调度
 * definedBy : 破坏选舱 / 故障落点 / 维修读秒 / 小游戏遮罩
 * truth     : js/engine/sabotage.js#SKSabotage
 * verify    : npm test
 * flag      : F
 * note      : P3 从 js/game.js 拆出
 * ============================================================== */
(function (global) {
  'use strict';

  const STAND_ACT = {
    task: '维修任务', fix: '故障维修', breaker: '拉闸', sab: '破坏设备',
    med: '取医疗包', ammo: '取子弹', revive: '施救', search: '搜查', qual: '领取物资申请单',
  };
  const NO_MG_ACT = { sab: 1, qual: 1, med: 1, ammo: 1, search: 1, revive: 1 };

  function create(R) {
    const {
      getG, getSimRun, getTestRun, getSND,
      M, SKSanity, SKMiniGameGetter,
      SAB_TIME, FIX_TIME, SAB_RANGE, FIX_RANGE,
      nearestFree, roomIdAt, roomNameById, evNow,
      applyRoomOut, refreshLight, hear, aiHear, envNotice,
      witnessAlienAction, ambushSpotFor, credBroadcast,
      noticeTaskAbandon, outBlocksDoing, finishDoing, logEvent, toast,
    } = R;

    const SAB_SPOT_CACHE = {};

    function clearSabSpots() {
      for (const k in SAB_SPOT_CACHE) delete SAB_SPOT_CACHE[k];
    }

    function dmgOfRoom(rid) {
      const G = getG();
      return G.dmg.find(d => d.room === rid) || null;
    }

    function sabRoomOk(rid) {
      const G = getG();
      if (G && G.terminator) return false;
      return !!rid && rid !== 'bridge' && M.rooms.some(r => r.id === rid) && !dmgOfRoom(rid);
    }

    function sabSpot(rid) {
      if (SAB_SPOT_CACHE[rid]) return SAB_SPOT_CACHE[rid];
      const ps = M.points.filter(p => p.room === rid);
      if (ps.length) {
        const p = ps[Math.floor(Math.random() * ps.length)];
        const f = nearestFree(p.x, p.y);
        return (SAB_SPOT_CACHE[rid] = { room: rid, x: f[0], y: f[1], label: p.label });
      }
      const r = M.rooms.find(q => q.id === rid);
      if (!r) return null;
      const f = nearestFree(r.rect[0] + r.rect[2] / 2, r.rect[1] + r.rect[3] / 2);
      return (SAB_SPOT_CACHE[rid] = { room: rid, x: f[0], y: f[1], label: r.name + '设备' });
    }

    function nearDmg(a, maxD) {
      const G = getG();
      let best = null, bd = maxD == null ? FIX_RANGE : maxD;
      for (const d of G.dmg) {
        const dd = Math.hypot(d.x - a.x, d.y - a.y);
        if (dd < bd) { bd = dd; best = d; }
      }
      return best;
    }

    function openSabPick() {
      const G = getG();
      const SND = getSND();
      if (!G || G.over || G.meet || G.inspect || G.camView || G.pipePick) return false;
      const me = G.me;
      if (!me.alive || me.downed || me.detained) { toast('当前状态无法破坏'); return false; }
      if (!me.alien && !G.designMode) { toast('你做不到'); return false; }
      if (me.sabUsed && !G.designMode) { toast('今晚已经破坏过了'); return false; }
      const rooms = M.rooms.filter(r => sabRoomOk(r.id));
      if (!rooms.length) { toast('已经没有可破坏的舱室'); return false; }
      G.sabPick = { rooms: rooms.map(r => r.id) };
      me.path = null; me.moving = false; me.doing = 0; me._doing = null;
      const box = document.getElementById('sabot-list');
      box.innerHTML = rooms.map((r, n) => {
        const sp = sabSpot(r.id), d = sp ? Math.hypot(sp.x - me.x, sp.y - me.y) : 0;
        return '<button data-room="' + r.id + '"><span class="pn">' + (n + 1) + '</span>'
          + '<span class="pr">' + r.name + '</span><span class="pd">' + d.toFixed(0) + ' 格</span></button>';
      }).join('');
      [...box.children].forEach(btn => { btn.onclick = () => pickSabRoom(btn.dataset.room); });
      const sub = document.getElementById('sabot-sub');
      if (sub) sub.textContent = '每夜一次 · 抵达目标舱室后损毁设备 · 30 秒内未修复则维修进度 -5';
      document.getElementById('sabot').classList.remove('hide');
      if (SND) SND.interact();
      return true;
    }

    function closeSabPick(silent) {
      const G = getG();
      if (G) G.sabPick = null;
      const el = document.getElementById('sabot'); if (el) el.classList.add('hide');
      if (!silent) toast('已取消');
    }

    function pickSabRoom(rid) {
      const G = getG();
      const SND = getSND();
      if (!G || !G.sabPick || !sabRoomOk(rid)) return false;
      const sp = sabSpot(rid); if (!sp) return false;
      G.sabTarget = sp; G.sabPick = null;
      const el = document.getElementById('sabot'); if (el) el.classList.add('hide');
      const d = Math.hypot(sp.x - G.me.x, sp.y - G.me.y);
      toast('破坏目标：' + roomNameById(rid) + '「' + sp.label + '」· 进入舱室自动下手 · ' + d.toFixed(0) + ' 格');
      if (SND) SND.interact();
      return true;
    }

    function damageRoom(a, rid, spot, ghost) {
      const G = getG();
      const SND = getSND();
      if (!a || (!ghost && (!a.alive || a.downed || (a.sabUsed && !G.designMode))) || (!a.alien && !G.designMode)) return false;
      if (!sabRoomOk(rid)) return false;
      const sp = spot || sabSpot(rid); if (!sp) return false;
      const roomPts = M.points.filter(p => roomIdAt(p.x, p.y) === rid);
      const pt = roomPts.length ? M.points.indexOf(roomPts[Math.floor(Math.random() * roomPts.length)]) : null;
      G.dmg.push({
        room: rid, x: sp.x, y: sp.y, label: sp.label, left: SAB_TIME, dur: SAB_TIME, by: a.i,
        pt: pt, born: evNow(),
      });
      if (SKSanity.SABOTAGE && SKSanity.SABOTAGE.outSec) {
        if (!G.roomOut) G.roomOut = {};
        G.roomOut[rid] = SKSanity.SABOTAGE.outSec;
        applyRoomOut();
        hear(sp.x, sp.y, 'power', 0.8);
      }
      if (rid === 'power' && G.powerFixed) {
        G.powerFixed = false;
        if (G.lightState === 1) G.lightState = 0;
        refreshLight();
      }
      if (G.simMode && G.simStats) G.simStats.sabotages++;
      logEvent('sabotage', {
        actor: a.i, room: rid, label: sp.label,
        x: +sp.x.toFixed(1), y: +sp.y.toFixed(1),
      });
      if (!ghost && !G.designMode) a.sabUsed = true;
      a.sabRoom = null; a.target = null; a.path = null;
      if (!G.spectMode && a === G.me) G.sabTarget = null;
      G.fx.push({ type: 'spark', x: sp.x, y: sp.y, t: 1.6, dur: 1.6 });
      G.fx.push({ type: 'alarm', x: sp.x, y: sp.y, t: 1.3, dur: 1.3 });
      hear(sp.x, sp.y, 'power', 1.0);
      if (SND) SND.sabotage();
      if (!ghost) witnessAlienAction(a, a.x, a.y, 6, 'sabotage');
      if (!ghost && a.alien && a !== G.me && a.knife > 0 && SKSanity.AMBUSH) {
        const amSpot = ambushSpotFor(rid, sp);
        if (amSpot) {
          a._ambush = { room: rid, x: sp.x, y: sp.y, spot: amSpot, until: evNow() + SKSanity.AMBUSH.dur };
        }
      }
      aiHear('sabotage', sp.x, sp.y, 20, { actor: a });
      envNotice('fault', sp.x, sp.y, 0.55);
      toast('警报：' + roomNameById(rid) + '「' + sp.label + '」被损毁 · 30 秒内修复，否则维修进度 -5');
      return true;
    }

    function startFix(a, d) {
      const G = getG();
      const SND = getSND();
      if (!a || !d || G.dmg.indexOf(d) < 0) return false;
      if (!a.alive && !a.ghost) return false;
      if (a.ghost) { if (a === G.me && !G.spectMode) toast('幽灵不能修故障：先把手头的任务做完'); return false; }
      const dur = a.ghost ? FIX_TIME * 1.6 : FIX_TIME;
      a.doing = dur; a._dur = dur; a._doing = 'fix'; a._fix = d;
      a.path = null; a.moving = false; a._fixGo = null;
      if (!G.spectMode && a === G.me) { toast((a.ghost ? '幽灵维修故障「' : '维修故障「') + d.label + '」· 连续 ' + dur.toFixed(dur % 1 ? 1 : 0) + ' 秒 · 移动会中断'); if (SND) SND.interact(); }
      return true;
    }

    function closePlayerMiniGame(a) {
      const G = getG();
      const SKMiniGame = SKMiniGameGetter();
      if (!a || !G || a !== G.me || G.spectMode) return;
      a._mg = false;
      if (SKMiniGame && SKMiniGame.isOpen()) SKMiniGame.close();
    }

    function finishFix(a) {
      const G = getG();
      const SND = getSND();
      const d = a._fix;
      a._fix = null; a._doing = null; a.doing = 0;
      if (!d || G.dmg.indexOf(d) < 0) return;
      G.dmg.splice(G.dmg.indexOf(d), 1);
      for (const x of G.agents) {
        if (x === a) continue;
        if (x._doing === 'fix' && x._fix === d) {
          x._doing = null; x._fix = null; x.doing = 0; x.path = null; x.moving = false;
          closePlayerMiniGame(x);
          if (!G.spectMode && x === G.me) toast('故障已被队友修好，停止维修');
        }
        if (x._fixGo === d) x._fixGo = null;
      }
      if (d.room && G.roomOut && G.roomOut[d.room] > 0) {
        delete G.roomOut[d.room];
        applyRoomOut();
      }
      G.fx.push({ type: 'heal', x: d.x, y: d.y, t: 1.2, dur: 1.2 });
      G.fx.push({ type: 'done', x: a.x, y: a.y, t: 1.0, dur: 1.0 });
      if (a.ghost && G.stats) G.stats.ghostFixes = (G.stats.ghostFixes || 0) + 1;
      if (G.simMode && G.simStats && a.ghost) G.simStats.ghostFixes++;
      if (G.simMode && G.simStats) {
        G.simStats.sabFixed++;
        G.simStats.sabFixSecSum += Math.max(0, (d.dur || SAB_TIME) - (d.left || 0));
        if (a.ghost) G.simStats.sabFixedByGhost++;
      }
      logEvent('fix', {
        actor: a.i, room: d.room, label: d.label, ghost: !!a.ghost,
        x: +d.x.toFixed(1), y: +d.y.toFixed(1),
      });
      if (!a.ghost) credBroadcast(a, 'fixDone', a.x, a.y);
      if (!G.spectMode && a === G.me) toast('故障已修复：' + roomNameById(d.room) + '「' + d.label + '」');
      if (SND) SND.done();
    }

    function miniGameOn() {
      const G = getG();
      const SKMiniGame = SKMiniGameGetter();
      return !!(SKMiniGame && !G.simMode && !getSimRun() && !getTestRun() && !G.spectMode);
    }

    function playerMiniGame(a) {
      const G = getG();
      const SKMiniGame = SKMiniGameGetter();
      if (a !== G.me || G.spectMode || G.simMode || getSimRun() || getTestRun()) return false;
      if (!SKMiniGame || !STAND_ACT[a._doing] || NO_MG_ACT[a._doing]) return false;
      if (a.doing <= 0.05) return false;
      if (a._mg) return true;
      a._mg = true;
      const fixPt = (a._doing === 'fix' && a._fix && a._fix.pt != null) ? M.points[a._fix.pt] : null;
      const pt = (a._doing === 'task' && a._taskPt != null) ? M.points[a._taskPt] : fixPt;
      const tier = pt ? (pt.label === '电路维修' ? 'circuit' : (pt.kind === 'hard' ? 'hard' : 'normal')) : 'normal';
      SKMiniGame.open(a._doing, {
        title: pt ? ((a._doing === 'fix' ? '维修故障 · ' : '') + pt.label) : (STAND_ACT[a._doing] || '任务'),
        label: pt ? pt.label : null,
        tier: tier,
        onDone: function () {
          a._mg = false;
          if (!a._doing) { a.doing = 0; return; }
          a.doing = 0.001;
        },
        onCancel: function () {
          a._mg = false; a.doing = 0; a._standDoing = null;
          a._doing = null; a._fix = null; a._rv = null; a._sv = null; a._taskPt = null;
          if (!G.spectMode && a === G.me) toast('任务中断：进度清零，需要重做');
        },
      });
      return true;
    }

    function tickDoing(a, dt) {
      const G = getG();
      if (!(a.doing > 0)) { a._standDoing = null; a._moveHit = false; return; }
      if (a._standDoing !== a._doing) { a._standDoing = a._doing; a._moveHit = false; }
      if (a._moveHit || (a.moving && a.path && a.path.length)) {
        const label = STAND_ACT[a._doing] || '动作';
        const wasDoing = a._doing;
        if (wasDoing === 'task' || wasDoing === 'fake' || wasDoing === 'fix') noticeTaskAbandon(a, wasDoing);
        a.doing = 0; a._doing = null; a._fix = null; a._rv = null; a._sv = null; a._standDoing = null; a._moveHit = false;
        a._taskPt = null;
        closePlayerMiniGame(a);
        if (!G.spectMode && a === G.me) toast('移动打断了' + label);
        return;
      }
      if (playerMiniGame(a)) return;
      if (a.doing > 0 && outBlocksDoing(a)) {
        a._outT = (a._outT || 0) - dt;
        if (a._outT <= 0 && !G.spectMode && a === G.me) { toast('该舱室断电：维修暂停，来电后继续'); a._outT = 1.5; }
        return;
      }
      a.doing -= dt;
      if (a.doing <= 0) finishDoing(a);
    }

    function dmgTick(dt) {
      const G = getG();
      if (!G.dmg.length) return;
      for (let i = G.dmg.length - 1; i >= 0; i--) {
        const d = G.dmg[i];
        d.left -= dt;
        if (d.left > 0) continue;
        if (G.t > 0.05) {
          G.prog = Math.max(0, G.prog - SKSanity.WIN.faultPenalty);
          if (G.simMode && G.simStats) G.simStats.sabHits++;
          G.fx.push({ type: 'alarm', x: d.x, y: d.y, t: 1.4, dur: 1.4 });
          G.fx.push({ type: 'spark', x: d.x, y: d.y, t: 1.0, dur: 1.0 });
          hear(d.x, d.y, 'power', 1.0);
          toast('故障未修复：' + roomNameById(d.room) + '「' + d.label + '」· 维修进度 -5');
        }
        G.dmg.splice(i, 1);
        for (const a of G.agents) {
          if (a._doing === 'fix' && a._fix === d) {
            a._doing = null; a._fix = null; a.doing = 0;
            closePlayerMiniGame(a);
          }
        }
      }
    }

    function sabTick() {
      const G = getG();
      const me = G.me;
      if (G.t <= 0 || (!me.alien && !G.designMode) || !me.alive || me.downed || me.detained || (me.sabUsed && !G.designMode)) return;
      const t = G.sabTarget;
      if (!t) return;
      if (!sabRoomOk(t.room)) { G.sabTarget = null; toast('目标舱室已无法破坏，已取消'); return; }
      if (roomIdAt(me.x, me.y) === t.room || Math.hypot(me.x - t.x, me.y - t.y) < SAB_RANGE)
        damageRoom(me, t.room, t);
    }

    return {
      clearSabSpots, dmgOfRoom, sabRoomOk, sabSpot, nearDmg,
      openSabPick, closeSabPick, pickSabRoom, damageRoom,
      startFix, finishFix, tickDoing, miniGameOn, playerMiniGame,
      dmgTick, sabTick,
    };
  }

  global.SKSabotage = { STAND_ACT, NO_MG_ACT, create };
})(typeof window !== 'undefined' ? window : globalThis);
