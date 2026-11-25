/* ==== ARCH NODE · 架构节点标注（根 ARCHITECTURE.md） ====
 * layer     : T2/Sim
 * domain    : 无头蒙特卡洛仿真驱动
 * definedBy : 确定性 PRNG / 会议即时结算 / 单局仿真调度与遥测汇总
 * truth     : js/sim/runner.js#SKSim
 * verify    : npm run t3:check
 * flag      : F
 * note      : P2 从 js/game.js 拆出；纯逻辑调度，无 DOM 依赖
 * ============================================================== */
(function (global) {
  'use strict';

  function simRng(seed) {
    let a = seed >>> 0;
    return function () {
      a |= 0; a = a + 0x6D2B79F5 | 0;
      let t = Math.imul(a ^ a >>> 15, 1 | a);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }

  function create(R) {
    const {
      getG, getSimRun, setSimRun,
      newGame, update, startVote, closeVote, finishMeeting,
      NIGHT,
    } = R;

    function simResolveMeeting() {
      const G = getG();
      const m = G && G.meet; if (!m) return;
      if (G.simDebug) console.log('SIM meet ' + m.kind + ' phase=' + m.phase + ' voteT=' + m.voteT);
      if (m.phase === 'discuss' && m.voteT > 0) {
        startVote();
        const G2 = getG();
        if (G2 && G2.meet) {
          closeVote();
          const tal = G2.meet ? G2.meet.tally : null;
          if (tal && tal.ex && G2.simStats) {
            G2.simStats.exiles++;
            if (tal.ex.alien) G2.simStats.alienExiles++; else G2.simStats.humanExiles++;
          }
        }
      }
      const G3 = getG();
      if (G3 && G3.meet) finishMeeting();
    }

    function simGame(opts) {
      opts = opts || {};
      const seed = (opts.seed == null ? ((Math.random() * 4294967296) >>> 0) : (opts.seed >>> 0));
      const oldRandom = Math.random, oldSim = getSimRun();
      setSimRun(true); Math.random = simRng(seed);
      let result;
      try {
        newGame();
        let G = getG();
        if (G.meet) finishMeeting();          /* 非 ?test 页面的开局会议 */
        if (!G.spectMode) {
          G.spectMode = true; G.fogOn = false;
          G.spect = { x: 49, y: 30, path: null, moving: false, dir: 'down' };
        }
        G.simMode = true; G.simT = NIGHT; G.t = NIGHT; G.phase = null; G.paused = true;
        G.simStats = {
          meetings: 0, knives: 0, shots: 0, sabotages: 0, exiles: 0, humanExiles: 0, alienExiles: 0,
          searches: 0, loots: 0, bulletsLooted: 0, medkitsLooted: 0, qualsLooted: 0,
          humanLoots: 0, alienLoots: 0, humanShots: 0, alienShots: 0,
          fakeRepairs: 0, fakeTasks: 0, fakeBreaker: 0, rushKills: 0, alienTasks: 0, revives: 0, alienLootTries: 0,
          terminatorGames: 0, terminatorArms: 0,
          orders: 0, orderObey: 0, orderRefuse: 0, endorses: 0, credFollow: 0,
          realFixes: 0, realRevives: 0, credShieldVotes: 0, abstains: 0,
          earlyVotes: 0, earlyKept: 0, voteChanges: 0, streakCuts: 0, lineDups: 0, mutualFrames: 0,
          alienPipes: 0, alienPipePlans: 0, medbotRevives: 0, medkitRevives: 0, ghostTasks: 0, ghostFixes: 0,
          humanDefends: 0, alienDefends: 0, reportDoubts: 0,
          sabHits: 0, sabFixed: 0, sabFixSecSum: 0, sabFixedByGhost: 0,
          contradictions: 0, falseContradictions: 0, contradictionsBy: {}, contradictionOld: 0, knownBy: {},
          knownWrites: 0, knownVotes: 0, ejectByKnown: 0, detainWitness: 0, detainEvictions: 0,
          susCarry: 0, almostCount: 0, almostFriendCount: 0, almostEject: 0, overriddenFriends: 0, reliaWrites: 0, reliaBy: {},
          hedgeAgents: 0, sureAgents: 0, silentSus: 0, presenceDeny: 0, claimRecall: 0, retractCount: 0, avoidCount: 0, reliaSpread: 0,
          farSight: 0, allyRevealed: 0, friendShield: 0, avoidSus: 0, reportsUsed: 0, reportDenied: 0, nightMeetFull: 0,
          reachImpossible: 0, statementDamp: 0, discussLines: 0, vouchHeard: 0, hypothesisAbstain: 0,
          alienPileOns: 0, alienFrameFollow: 0, almostHeard: 0,
          misIdWrites: 0, misIdToAlien: 0, misIdToHuman: 0, misIdRealHuman: 0, tasksByPoint: {},
        };
        const dt = Math.min(0.2, Math.max(0.05, opts.dt || 0.1));
        const maxNights = opts.maxNights || 15;
        const maxSteps = opts.maxSteps || Math.ceil(maxNights * NIGHT / dt) + 6000;
        G.simDebug = !!opts.debug;
        let steps = 0;
        while (!G.over && G.night <= maxNights && steps < maxSteps) {
          if (G.simDebug) console.log('SIM step ' + steps + ' t=' + (G.t || 0).toFixed(2) +
            ' night=' + G.night + ' meet=' + (G.meet ? G.meet.kind + ':' + G.meet.phase : '-'));
          if (G.meet) { simResolveMeeting(); steps++; continue; }
          update(dt); steps++;
          if (G.fx.length) G.fx.length = 0;
          if (G.waves.length) G.waves.length = 0;
          if (G.meet) simResolveMeeting();
        }
        const alive = G.agents.filter(a => a.alive);
        const humans = alive.filter(a => !a.alien).length;
        const aliens = alive.filter(a => a.alien).length;
        const downed = G.agents.filter(a => a.downed && a.alive).length;
        {
          let lo = 1, hi = 0, cnt = 0;
          for (const ag of G.agents) {
            const r = (ag.mind && ag.mind.reliability) || {};
            for (const k in r) { const v = r[k]; if (v < lo) lo = v; if (v > hi) hi = v; cnt++; }
          }
          G.simStats.reliaSpread = cnt ? +(hi - lo).toFixed(3) : 0;
        }
        result = {
          seed, winner: G.over ? (G.overWin ? 'human' : 'alien') : 'timeout',
          why: G.over ? (G.overWhy || '') : 'timeout', nights: G.night, prog: G.prog, steps,
          humans, aliens, downed, meetings: G.simStats.meetings, knives: G.simStats.knives,
          shots: G.simStats.shots, sabotages: G.simStats.sabotages,
          exiles: G.simStats.exiles, humanExiles: G.simStats.humanExiles,
          alienExiles: G.simStats.alienExiles,
          searches: G.simStats.searches, loots: G.simStats.loots,
          bulletsLooted: G.simStats.bulletsLooted, medkitsLooted: G.simStats.medkitsLooted,
          qualsLooted: G.simStats.qualsLooted,
          humanLoots: G.simStats.humanLoots, alienLoots: G.simStats.alienLoots,
          humanShots: G.simStats.humanShots, alienShots: G.simStats.alienShots,
          fakeRepairs: G.simStats.fakeRepairs, fakeTasks: G.simStats.fakeTasks,
          fakeBreaker: G.simStats.fakeBreaker,
          fakeBreakerRolls: G.simStats.fakeBreakerRolls || 0,
          fakeBreakerPlans: G.simStats.fakeBreakerPlans || 0,
          busAccusals: G.simStats.busAccusals || 0,
          coFrames: G.simStats.coFrames || 0,
          descErrors: G.simStats.descErrors || 0,
          ghostSabotages: G.simStats.ghostSabotages || 0,
          mateFollowVotes: G.simStats.mateFollowVotes || 0,
          alienPileOns: G.simStats.alienPileOns || 0,
          alienFrameFollow: G.simStats.alienFrameFollow || 0,
          rushKills: G.simStats.rushKills,
          terminatorGames: G.simStats.terminatorGames || 0, terminatorArms: G.simStats.terminatorArms || 0,
          orders: G.simStats.orders || 0, orderObey: G.simStats.orderObey || 0,
          orderRefuse: G.simStats.orderRefuse || 0, endorses: G.simStats.endorses || 0,
          credFollow: G.simStats.credFollow || 0, realFixes: G.simStats.realFixes || 0,
          realRevives: G.simStats.realRevives || 0, credShieldVotes: G.simStats.credShieldVotes || 0,
          abstains: G.simStats.abstains || 0,
          streakCuts: G.simStats.streakCuts || 0, lineDups: G.simStats.lineDups || 0,
          mutualFrames: G.simStats.mutualFrames || 0,
          alienTasks: G.simStats.alienTasks,
          revives: G.simStats.revives, alienLootTries: G.simStats.alienLootTries,
          alienPipes: G.simStats.alienPipes, alienPipePlans: G.simStats.alienPipePlans,
          medbotRevives: G.simStats.medbotRevives, medkitRevives: G.simStats.medkitRevives,
          ghostTasks: G.simStats.ghostTasks, ghostFixes: G.simStats.ghostFixes,
          humanDefends: G.simStats.humanDefends, reportDoubts: G.simStats.reportDoubts,
          sabHits: G.simStats.sabHits, sabFixed: G.simStats.sabFixed,
          sabFixSec: G.simStats.sabFixed ? +(G.simStats.sabFixSecSum / G.simStats.sabFixed).toFixed(1) : 0,
          sabFixedByGhost: G.simStats.sabFixedByGhost,
          contradictions: G.simStats.contradictions, falseContradictions: G.simStats.falseContradictions,
          contradictionOld: G.simStats.contradictionOld,
          knownBy: Object.assign({}, G.simStats.knownBy),
          knownWrites: G.simStats.knownWrites, knownWritesAlien: G.simStats.knownWritesAlien || 0,
          humanStalks: G.simStats.humanStalks || 0, voteToMate: G.simStats.voteToMate || 0,
          sabConfirm: G.simStats.sabConfirm || 0, sabNoConfirm: G.simStats.sabNoConfirm || 0,
          knownWritesHuman: G.simStats.knownWritesHuman || 0,
          knownVotes: G.simStats.knownVotes, knownVotesAlien: G.simStats.knownVotesAlien || 0,
          knownVotesHuman: G.simStats.knownVotesHuman || 0,
          ejectByKnown: G.simStats.ejectByKnown,
          ejectByKnownAlien: G.simStats.ejectByKnownAlien || 0,
          ejectByKnownHuman: G.simStats.ejectByKnownHuman || 0,
          almostAlien: G.simStats.almostAlien || 0, almostHuman: G.simStats.almostHuman || 0,
          almostEjectAlien: G.simStats.almostEjectAlien || 0,
          almostEjectHuman: G.simStats.almostEjectHuman || 0,
          almostHeard: G.simStats.almostHeard || 0,
          misIdWrites: G.simStats.misIdWrites || 0, misIdToAlien: G.simStats.misIdToAlien || 0,
          misIdToHuman: G.simStats.misIdToHuman || 0, misIdRealHuman: G.simStats.misIdRealHuman || 0,
          actionMisWrites: G.simStats.actionMisWrites || 0,
          detainWitness: G.simStats.detainWitness,
          detainEvictions: G.simStats.detainEvictions,
          susCarry: G.simStats.susCarry, almostCount: G.simStats.almostCount,
          almostFriendCount: G.simStats.almostFriendCount, almostEject: G.simStats.almostEject,
          almostVotes: G.simStats.almostVotes,
          overriddenFriends: G.simStats.overriddenFriends,
          reliaWrites: G.simStats.reliaWrites, reliaSpread: G.simStats.reliaSpread,
          hedgeAgents: G.simStats.hedgeAgents, sureAgents: G.simStats.sureAgents,
          silentSus: G.simStats.silentSus, presenceDeny: G.simStats.presenceDeny,
          claimRecall: G.simStats.claimRecall, retractCount: G.simStats.retractCount,
          avoidCount: G.simStats.avoidCount,
          farSight: G.simStats.farSight, allyRevealed: G.simStats.allyRevealed,
          friendShield: G.simStats.friendShield, avoidSus: G.simStats.avoidSus,
          reportsUsed: G.simStats.reportsUsed, nightMeetFull: G.simStats.nightMeetFull,
          earlyVotes: G.simStats.earlyVotes, voteChanges: G.simStats.voteChanges,
          earlyKept: G.simStats.earlyKept,
          reachImpossible: G.simStats.reachImpossible, statementDamp: G.simStats.statementDamp,
          discussLines: G.simStats.discussLines, vouchHeard: G.simStats.vouchHeard,
          hypothesisAbstain: G.simStats.hypothesisAbstain,
          taskAborts: G.simStats.taskAborts || 0, fakeAborts: G.simStats.fakeAborts || 0, emptySay: G.emptySayN || 0,
          stanceBlocks: G.simStats.stanceBlocks || 0, stanceViolations: G.simStats.stanceViolations || 0,
          firstAccuses: G.firstAccuseN || 0,
          openingHeard: G.openingHeardN || 0,
          accuseHuman: G.accuseHumanN || 0,
          accuseAlien: G.accuseAlienN || 0,
          kindByFaction: G.kindByFaction || {},
          alienMuted: G.alienMutedN || 0,
          speechAlien: (G.speechByFaction && G.speechByFaction.alien) || 0,
          speechHuman: (G.speechByFaction && G.speechByFaction.human) || 0,
          heardDropped: G.heardDroppedN || 0,
          heardOverflow: G.heardOverflowN || 0,
          caughtLies: G.caughtLieN || 0,
          tasksByPoint: Object.assign({}, G.simStats.tasksByPoint),
        };
      } finally {
        Math.random = oldRandom; setSimRun(oldSim);
        const Gf = getG();
        if (Gf) { Gf.simMode = false; Gf.simDebug = false; Gf.paused = true; }
      }
      return result;
    }

    return { simRng, simResolveMeeting, simGame };
  }

  global.SKSim = { create, simRng };
})(typeof window !== 'undefined' ? window : globalThis);
