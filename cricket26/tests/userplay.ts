import { GameEngine, InputAction } from '../src/game/GameEngine';
import { TEAM_MAP } from '../src/data/teams';
import { mulberry32, setRng, gauss } from '../src/utils/random';
import { idealPressTime, readBall } from '../src/game/BattingEngine';
import { SIM_STEP } from '../src/game/constants';
import type { MatchConfig, Difficulty } from '../src/game/types';

const overs = Number(process.argv[2] ?? 5);
const diff = (process.argv[3] ?? 'medium') as Difficulty;
const errSd = Number(process.argv[4] ?? 0.035);
setRng(mulberry32(99));
const cfg: MatchConfig = { userTeamId: 'IND', aiTeamId: 'AUS', overs, format: 'Custom', difficulty: diff, stadiumId: 'intl', timeOfDay: 'night', userXI: TEAM_MAP.IND.defaultXI, aiXI: TEAM_MAP.AUS.defaultXI, userBatsFirst: true, tossText: '' };
const e = new GameEngine(cfg);
const timing: Record<string, number> = {}, notes: Record<string, number> = {};
e.listener = { ...e.listener, onTiming: (l) => { timing[l] = (timing[l] ?? 0) + 1; }, onNotify: (t) => { notes[t] = (notes[t] ?? 0) + 1; }, onState() {}, onPhase() {}, onCommentary() {}, onSound() {}, onReplayAvailable() {} };
let plan: { at: number; key: InputAction; loft: boolean } | null = null;
let released = false, lastDelivery = -1, runPressed = false, upAt = -1;
const press = (a: InputAction) => e.keyDown(a);
const release = (a: InputAction) => e.keyUp(a);
let guard = 0;
while (e.phase !== 'matchOver' && guard++ < 2_000_000) {
  // ---- user batting
  if (e.userBatting) {
    if (e.phase === 'delivery' && e.d.id !== lastDelivery && e.d.plan) {
      lastDelivery = e.d.id;
      const r = readBall(e.d.plan.path, e.d.plan.bounceIndex, 9.0, e.offSign, e.d.plan.speedKmh, false);
      const len = r.pitchDist ?? -1;
      const offKey: InputAction = e.offSign > 0 ? 'batRight' : 'batLeft', legKey: InputAction = e.offSign > 0 ? 'batLeft' : 'batRight';
      const key: InputAction = r.lineOff > 0.25 ? offKey : r.lineOff < -0.1 ? legKey : len > 7 ? legKey : 'batStraight';
      const zc = len > 7 ? 9.45 : 8.8;
      const ideal = idealPressTime(e.d.plan.path, zc) ?? 0.3;
      plan = { at: e.d.releaseT + ideal + gauss() * errSd, key, loft: Math.random() < 0.3 };
      runPressed = false;
    }
    if (plan && e.phase === 'delivery' && e.t >= plan.at) {
      press(plan.key);
      if (plan.loft) press('batLoft');
      upAt = e.t + 0.12; plan = null;
    }
    if (upAt > 0 && e.t >= upAt) { release('batStraight'); release('batLeft'); release('batRight'); release('batLoft'); upAt = -1; }
    if (e.phase === 'live' && !runPressed && e.d.liveT > 0.3 && (e.runHint === 'safe')) { press('run'); release('run'); runPressed = true; }
    if (e.phase === 'live' && runPressed && e.runsDone >= 1 && e.runHint === 'safe' && !e.runQueued && e.runners.some((r) => r.running) === false && e.d.liveT < 6) { /* idle */ }
  }
  // ---- user bowling
  if (e.userBowling) {
    if (e.phase === 'selectBowler') e.selectBowler(e.match.eligibleBowlers()[0]);
    if (e.phase === 'ready' && e.phaseT > 0.5 && e.fieldSettled() && !e.held('bowlAction')) { e.targetLen = 5 + Math.random() * 2; e.targetLine = 0.15; press('bowlAction'); released = false; }
    if (e.phase === 'runUp' && !released && e.meter >= 0.76 + gauss() * 0.03) { release('bowlAction'); released = true; }
  }
  if (e.phase === 'intro' || e.phase === 'walkIn') { press('skip'); release('skip'); }
  if (e.phase === 'inningsBreak') e.continueAfterInningsBreak();
  e.advance(SIM_STEP);
}
for (const inn of e.match.innings) {
  const batSum = Object.values(inn.batters).reduce((a, b) => a + b.runs, 0);
  const ex = inn.extras.wd + inn.extras.nb + inn.extras.b + inn.extras.lb;
  const kinds: Record<string, number> = {}; inn.history.forEach((h) => { if (h.wicket) kinds[h.wicket.kind] = (kinds[h.wicket.kind] ?? 0) + 1; });
  console.log(`${inn.battingTeamId} ${inn.runs}/${inn.wickets} (${Math.floor(inn.legalBalls / 6)}.${inn.legalBalls % 6}) reconcile=${batSum + ex === inn.runs} W=${JSON.stringify(kinds)} 4s=${Object.values(inn.batters).reduce((a, b) => a + b.fours, 0)} 6s=${Object.values(inn.batters).reduce((a, b) => a + b.sixes, 0)}`);
}
console.log('result:', e.match.result?.text, '| timing', timing, '| notes', notes);

// ---- simulate option check
{
  const e2 = new GameEngine({ ...cfg, overs: 3 });
  e2.listener = { ...e2.listener, onNotify() {}, onState() {}, onPhase() {}, onCommentary() {}, onSound() {}, onReplayAvailable() {}, onTiming() {} };
  let g = 0;
  while (e2.phase !== 'ready' && g++ < 5000) { if (e2.phase === 'intro' || e2.phase === 'walkIn') { e2.keyDown('skip'); e2.keyUp('skip'); } e2.advance(SIM_STEP * 10); }
  e2.startSim('over');
  g = 0; while (e2.simUntil && g++ < 200000) e2.advance(SIM_STEP);
  console.log('sim over → balls', e2.inn.legalBalls, 'phase', e2.phase, 'autoplay', e2.autoplay);
  e2.startSim('innings');
  g = 0; while (e2.simUntil && g++ < 2000000) e2.advance(SIM_STEP);
  console.log('sim innings → phase', e2.phase, 'score', e2.match.innings[0].runs + '/' + e2.match.innings[0].wickets);
  e2.startSim('match');
  g = 0; while (e2.simUntil && g++ < 2000000) e2.advance(SIM_STEP);
  console.log('sim match → phase', e2.phase, e2.match.result?.text);
}
