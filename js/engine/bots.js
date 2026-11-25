/* ==== ARCH NODE · 架构节点标注（根 ARCHITECTURE.md） ====
 * layer     : T2
 * domain    : 巡逻机器人（保安机器人 + 医疗无人机）
 * definedBy : 机器人常量 / 地面寻路 / 追捕押送 / 医疗救援
 * truth     : js/engine/bots.js#SKBots
 * verify    : npm test
 * flag      : F
 * note      : P2 从 js/game.js 拆出；CONST 为机器人数值唯一真源
 * ============================================================== */
(function (global) {
  'use strict';

  const CONST = {
    BOT_SPEED: 2,
    SEC_RANGE: 6,
    SEC_ARC: Math.PI / 2,
    DETAIN_TIME: 30,
    SEC_USES_MAX: 2,
    SEC_CATCH_SPEED: 7.5,
    MEDBOT_CHARGES: 2,
    MEDBOT_HEAL_TIME: 7,
    MEDBOT_COOLDOWN: 20,
    MEDBOT_REVIVE_STUN: 3,
    MEDBOT_TOUCH_R: 1.15,
    MEDBOT_FLY_SPEED: 4.6,
    MEDBOT_R: 12,
  };

  function create(R) {
    const {
      M, free, nearestFree, astar, losWalls, inMedRoom, roomIdAt,
      draggerOf, releaseDragBy, setAct, hear, aiHear, witnessDetain,
      logEvent, toast, SKSanity, emoAdd, credAdd,
    } = R;

    const {
      BOT_SPEED, SEC_RANGE, SEC_ARC, DETAIN_TIME, SEC_USES_MAX, SEC_CATCH_SPEED,
      MEDBOT_CHARGES, MEDBOT_HEAL_TIME, MEDBOT_COOLDOWN, MEDBOT_REVIVE_STUN,
      MEDBOT_TOUCH_R, MEDBOT_FLY_SPEED,
    } = CONST;

    function secArcOk(sec, x, y) {
      const G = R.getG();
      if (!sec) return false;
      const b = G && G.bots && G.bots.secbot;
      const ang = b && Number.isFinite(b.ang) ? b.ang : 0;
      let d = Math.atan2(y - sec.y, x - sec.x) - ang;
      d = Math.atan2(Math.sin(d), Math.cos(d));
      return Math.abs(d) <= SEC_ARC;
    }

    function secbotWouldSee(x, y) {
      const G = R.getG();
      if (!G || G.secbotDead || (G.secbotUses || 0) >= SEC_USES_MAX) return false;
      const sec = botPos('secbot');
      if (!sec) return false;
      if (Math.hypot(x - sec.x, y - sec.y) >= SEC_RANGE) return false;
      if (!losWalls(sec.x, sec.y, x, y)) return false;
      return secArcOk(sec, x, y);
    }

    function resetBots() {
      const G = R.getG();
      if (!G) return;
      G.bots = G.bots || {};
      for (const kind of ['medbot', 'secbot']) {
        const f = M.facility.find(q => q.kind === kind);
        if (!f) continue;
        const p = nearestFree(f.x, f.y);
        /* 医疗无人机不巡逻：坞位就是医疗间正中央，航点只有它自己；保安机器人仍按 facility.patrol 走 4 点巡逻。 */
        const pts = kind === 'medbot' ? [[p[0], p[1]]] : (f.patrol && f.patrol.length ? f.patrol : [[f.x, f.y]]);
        const wps = pts.map(q => nearestFree(q[0], q[1]));
        G.bots[kind] = { x: p[0], y: p[1], wp: 0, ang: 0, face: 1, wps: wps, moving: false };
        if (kind === 'medbot') G.bots[kind].home = [p[0], p[1]];
      }
      /* 拘留位固定在军械库角落：被擒者是硬控状态，不能拖着锁链跟着机器人满地图跑 */
      const sec = M.facility.find(q => q.kind === 'secbot');
      G.jailPos = sec ? nearestFree(sec.x + 1.7, sec.y + 1.3) : null;
    }

    function botPos(kind) {
      const G = R.getG();
      const b = G && G.bots && G.bots[kind];
      if (b) return b;
      const f = M.facility.find(q => q.kind === kind);
      return f ? { x: f.x, y: f.y } : null;
    }

    /* 机器人地面行走：走 A* 寻路绕开墙与家具，更新 b.x/b.y/b.ang/b.face/b.moving。 */
    function botWalkTo(b, tx, ty, dt, speed) {
      if (!b) return 0;
      const dDirect = Math.hypot(tx - b.x, ty - b.y);
      if (dDirect < 1e-4) { b.moving = false; b.path = null; return dDirect; }
      b._repathT = (b._repathT || 0) - dt;
      const goal = free(tx, ty) ? [tx, ty] : nearestFree(tx, ty);
      if (!b.path || !b.path.length || b._repathT <= 0) {
        const end = b.path && b.path.length ? b.path[b.path.length - 1] : null;
        if (!end || Math.hypot(goal[0] - end[0], goal[1] - end[1]) > 0.6) {
          b.path = astar(b.x, b.y, goal[0], goal[1]) || [[goal[0], goal[1]]];
          b._repathT = 0.4;
        }
      }
      let rem = speed * dt, moved = false;
      while (rem > 1e-4 && b.path && b.path.length) {
        const pt = b.path[0], dx = pt[0] - b.x, dy = pt[1] - b.y, d = Math.hypot(dx, dy);
        if (d < 0.08) { b.path.shift(); continue; }
        const step = Math.min(d, rem);
        b.x += dx / d * step; b.y += dy / d * step;
        b.ang = Math.atan2(dy, dx);
        if (Math.abs(dx) > 0.03) b.face = dx < 0 ? -1 : 1;
        rem -= step; moved = true;
        if (step >= d - 1e-4) b.path.shift();
      }
      b.moving = moved;
      return Math.hypot(tx - b.x, ty - b.y);
    }

    /* 巡逻推进：2 格/秒，到点 0.35 格换下一个航点，沿地面可行走路径行进。 */
    function moveBot(b, dt, dead) {
      if (!b) return;
      b.moving = false;
      if (dead || !b.wps || !b.wps.length) return;
      const w = b.wps[b.wp] || b.wps[0];
      const d = Math.hypot(w[0] - b.x, w[1] - b.y);
      if (d < 0.35) { b.wp = (b.wp + 1) % b.wps.length; b.path = null; return; }
      botWalkTo(b, w[0], w[1], dt, BOT_SPEED);
    }

    function secJail() {
      const G = R.getG();
      return G && G.jailPos ? G.jailPos : null;
    }

    function secCatchStart(killer, sec) {
      const G = R.getG();
      const SND = R.getSND();
      const jail = secJail() || [sec.x, sec.y + 1.6];
      G.secCatch = { i: killer.i, phase: 'chase', t: 0, jail: [jail[0], jail[1]] };
      G.secbotUsed = true; G.secbotUses = (G.secbotUses || 0) + 1; G.secbotT = 2.5;
      if (killer.drag != null) releaseDragBy(killer, true);
      killer.path = null; killer.moving = false; killer.doing = 0; killer._doing = null; killer._fix = null; killer._rv = null; killer._sv = null; killer._taskPt = null;
      if (!G.spectMode && killer === G.me) {
        if (global.SKMiniGame && SKMiniGame.isOpen()) SKMiniGame.close();
        killer._mg = false;
      }
      G.fx.push({ type: 'alarm', x: sec.x, y: sec.y, t: 1.4, dur: 1.4 });
      hear(sec.x, sec.y, 'robot', 1.25);
      aiHear('alarm', sec.x, sec.y, 22, {});
      if (SND) { SND.alarm(); SND.robot(); }
    }

    function secCatchTick(dt, sec) {
      const G = R.getG();
      const SND = R.getSND();
      const c = G.secCatch; if (!c) return false;
      const killer = G.agents[c.i];
      if (!killer || !killer.alive || killer.downed || G.over) { G.secCatch = null; return false; }
      c.t += dt;
      if (c.phase === 'chase') {
        const d = Math.hypot(killer.x - sec.x, killer.y - sec.y);
        if (d > 1.2 && c.t < 7) {
          botWalkTo(sec, killer.x, killer.y, dt, SEC_CATCH_SPEED);
          if (Math.hypot(killer.x - sec.x, killer.y - sec.y) > 1.2) return true;
        }
        if (Math.hypot(killer.x - sec.x, killer.y - sec.y) > 1.2) { G.secCatch = null; return false; }
        c.phase = 'press'; c.t = 0;
        killer.detained = true; killer.detainedT = DETAIN_TIME + 1.2;
        killer.path = null; killer.moving = false; killer.doing = 0; killer._doing = null; killer.act = null;
        c.from = [killer.x, killer.y];
        G.fx.push({ type: 'detain', x1: sec.x, y1: sec.y, x2: killer.x, y2: killer.y, t: 1.0, dur: 1.0 });
        (G.detainLog = G.detainLog || {})[killer.i] = G.night;
        witnessDetain(killer, killer.x, killer.y, 10);
        aiHear('detain', killer.x, killer.y, 26, {});
        if (SND) SND.robot();
        return true;
      }
      if (c.phase === 'press') {
        if (c.t < 0.9) return true;
        c.phase = 'escort'; c.t = 0; c.from = [killer.x, killer.y];
        return true;
      }
      const p = Math.min(1, c.t / 1.2);
      killer.x = c.from[0] + (c.jail[0] - c.from[0]) * p;
      killer.y = c.from[1] + (c.jail[1] - c.from[1]) * p;
      sec.x = c.jail[0] + (c.jail[0] - c.from[0]) * 0.06;
      sec.y = c.jail[1] + (c.jail[1] - c.from[1]) * 0.06;
      sec.face = killer.x < sec.x ? -1 : 1;
      if (p >= 1) {
        killer.x = c.jail[0]; killer.y = c.jail[1]; killer.detainedT = DETAIN_TIME;
        witnessDetain(killer, killer.x, killer.y, 8);
        aiHear('detain', killer.x, killer.y, 18, {});
        logEvent('detain', {
          actor: null, victim: killer.i, room: roomIdAt(killer.x, killer.y),
          x: +killer.x.toFixed(1), y: +killer.y.toFixed(1),
        });
        G.secCatch = null;
      }
      return true;
    }

    function medbotHome() {
      const G = R.getG();
      const b = G && G.bots && G.bots.medbot;
      if (b && b.home) return b.home;
      const f = M.facility.find(q => q.kind === 'medbot');
      return f ? [f.x, f.y] : [55, 85.6];
    }

    function medbotFlyTo(b, tx, ty, dt, speed) {
      return botWalkTo(b, tx, ty, dt, speed);
    }

    /* 返回 true = 本帧由医疗逻辑接管（回坞 / 飞向伤员 / 治疗中），不跑巡逻 */
    function medbotTick(dt, med) {
      const G = R.getG();
      const SND = R.getSND();
      if (!med) return false;
      if (G.medbotDead || (G.medbotLeft == null ? MEDBOT_CHARGES : G.medbotLeft) <= 0) {
        G.medbotTarget = null; G.medbotT = 0; G.medbotCD = 0; med.healing = false;
        return false;
      }
      const home = medbotHome();
      if (G.medbotCD > 0) {
        G.medbotCD = Math.max(0, G.medbotCD - dt);
        G.medbotTarget = null; G.medbotT = 0; med.healing = false;
        if (Math.hypot(home[0] - med.x, home[1] - med.y) > 0.1)
          medbotFlyTo(med, home[0], home[1], dt, MEDBOT_FLY_SPEED * 0.75);
        else med.moving = false;
        return true;
      }
      let v = null;
      if (G.medbotTarget != null) {
        const cur = G.agents[G.medbotTarget];
        if (cur && cur.downed && cur.alive && inMedRoom(cur.x, cur.y)) v = cur;
        else G.medbotTarget = null;
      }
      if (!v) {
        let bd = 1e9;
        for (const a of G.agents) {
          if (!a.downed || !a.alive || !inMedRoom(a.x, a.y)) continue;
          const d = Math.hypot(a.x - med.x, a.y - med.y);
          if (d < bd) { bd = d; v = a; }
        }
        if (v) G.medbotTarget = v.i;
      }
      med.healing = false;
      if (!v) {
        G.medbotT = 0;
        if (Math.hypot(home[0] - med.x, home[1] - med.y) > 0.1)
          medbotFlyTo(med, home[0], home[1], dt, MEDBOT_FLY_SPEED * 0.75);
        else med.moving = false;
        return true;
      }
      const d = Math.hypot(v.x - med.x, v.y - med.y);
      if (d > MEDBOT_TOUCH_R) {
        medbotFlyTo(med, v.x, v.y, dt, MEDBOT_FLY_SPEED);
        G.medbotT = 0;
        return true;
      }
      med.moving = false;
      med.healing = true;
      med.ang = Math.atan2(v.y - med.y, v.x - med.x);
      G.medbotT = (G.medbotT || 0) + dt;
      if (G.medbotT < MEDBOT_HEAL_TIME) return true;
      v.downed = false; v.downAt = 0; v.killedBy = null;
      v.stunT = MEDBOT_REVIVE_STUN; v.path = null; v.moving = false;
      const dg = draggerOf(v);
      if (dg) releaseDragBy(dg, true);
      v.draggedBy = null;
      v.woundCause = null; v.downRoom = null; v.downX = null; v.downY = null; v.searched = false;
      G.medbotUsed = true; G.medbotLeft = Math.max(0, (G.medbotLeft == null ? MEDBOT_CHARGES : G.medbotLeft) - 1);
      G.medbotT = 0; G.medbotTarget = null; G.medbotCD = MEDBOT_COOLDOWN;
      G.fx.push({ type: 'healBeam', x1: med.x, y1: med.y, x2: v.x, y2: v.y, t: 1.1, dur: 1.1 });
      G.fx.push({ type: 'heal', x: v.x, y: v.y, t: 1.2, dur: 1.2 });
      setAct(v, 'heal', 0.7, { ang: 0 });
      hear(med.x, med.y, 'medbot', 1.1);
      aiHear('medbot', med.x, med.y, 18);
      if (SND) SND.medbot();
      logEvent('revive', {
        actor: null, victim: v.i, method: 'medbot', room: 'med',
        stun: MEDBOT_REVIVE_STUN, x: +v.x.toFixed(1), y: +v.y.toFixed(1),
      });
      if (G.stats) G.stats.medbotRevives = (G.stats.medbotRevives || 0) + 1;
      if (G.simMode && G.simStats) G.simStats.medbotRevives++;
      {
        const dg2 = draggerOf(v);
        if (dg2 && dg2 !== v) {
          const g2 = SKSanity.GRATITUDE.dragToMed;
          emoAdd(v, dg2.i, g2.e, 'gratitude'); credAdd(v, dg2.i, g2.t, 'dragToMedSelf');
        }
      }
      return true;
    }

    function botTick(dt) {
      const G = R.getG();
      if (G.meet || G.over) return;
      if (!G.bots) resetBots();
      const med = botPos('medbot');
      const sec = botPos('secbot');
      if (!medbotTick(dt, med)) moveBot(G.bots.medbot, dt, G.medbotDead);
      if (!G.secCatch) moveBot(G.bots.secbot, dt, G.secbotDead);
      if (G.secbotT > 0) G.secbotT = Math.max(0, G.secbotT - dt);
      if (G.secCatch) {
        secCatchTick(dt, sec);
      } else if (sec && !G.secbotDead && (G.secbotUses || 0) < SEC_USES_MAX && G.secbotT <= 0 && G.pendingCrime != null) {
        const c = G.pendingCrime; G.pendingCrime = null;
        const killer = G.agents[c];
        if (killer && Math.hypot(killer.x - sec.x, killer.y - sec.y) < SEC_RANGE && losWalls(sec.x, sec.y, killer.x, killer.y) && secArcOk(sec, killer.x, killer.y)) {
          if (killer === G.me && G.dev) { toast('DEV：保安机器人没有看见你'); }
          else secCatchStart(killer, sec);
        }
      }
    }

    return {
      secArcOk,
      secbotWouldSee,
      resetBots,
      botPos,
      secJail,
      medbotHome,
      botTick,
    };
  }

  global.SKBots = { CONST, create };
})(typeof window !== 'undefined' ? window : globalThis);
