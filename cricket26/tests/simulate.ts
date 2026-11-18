import { GameEngine } from '../src/game/GameEngine';
import { TEAM_MAP } from '../src/data/teams';
import { mulberry32, setRng } from '../src/utils/random';
import type { MatchConfig, Difficulty } from '../src/game/types';

const overs = Number(process.argv[2] ?? 20);
const n = Number(process.argv[3] ?? 2);
const diff = (process.argv[4] ?? 'medium') as Difficulty;
const tally: Record<string, number> = {};
const shotT: Record<string, number> = {}, timT: Record<string, number> = {}, conT: Record<string, number> = {}, runT: Record<string, number> = {};
const wkS: Record<string, number> = {};
const inc = (o: Record<string, number>, k: string) => { o[k] = (o[k] ?? 0) + 1; };
let fails = 0;
for (let m = 0; m < n; m++) {
  setRng(mulberry32(1234 + m));
  const cfg: MatchConfig = {
    userTeamId: 'IND', aiTeamId: 'AUS', overs, format: 'T20', difficulty: diff, stadiumId: ['intl', 'night', 'coastal', 'classic'][m % 4], timeOfDay: 'day',
    userXI: TEAM_MAP.IND.defaultXI, aiXI: TEAM_MAP.AUS.defaultXI, userBatsFirst: m % 2 === 0, tossText: '',
  };
  const e = new GameEngine(cfg);
  e.autoplay = true; e.headless = true;
  let dbg = 0; if (process.env.DBG) e.debugLog = (s) => { if (dbg++ < 14) console.log('  DBG', s); };
  const notes: string[] = [];
  e.listener = { ...e.listener, onNotify: (t) => { tally[t] = (tally[t] ?? 0) + 1; }, onCommentary: () => {}, onState() {}, onPhase() {}, onTiming() {}, onSound() {}, onReplayAvailable() {} };
  let guard = 0;
  while (e.phase !== 'matchOver' && guard < 400000) { e.advance(0.5); guard++; }
  for (const inn of e.match.innings) {
    const batSum = Object.values(inn.batters).reduce((a, b) => a + b.runs, 0);
    const ex = inn.extras.wd + inn.extras.nb + inn.extras.b + inn.extras.lb;
    const bowlRuns = Object.values(inn.bowlers).reduce((a, b) => a + b.runs, 0);
    const bowlBalls = Object.values(inn.bowlers).reduce((a, b) => a + b.balls, 0);
    const wk = inn.history.filter((h) => h.wicket).length;
    const ok = batSum + ex === inn.runs && bowlRuns + inn.extras.b + inn.extras.lb === inn.runs && bowlBalls === inn.legalBalls && wk === inn.wickets && inn.legalBalls <= overs * 6;
    if (!ok) { fails++; console.log('INVARIANT FAIL', { batSum, ex, runs: inn.runs, bowlRuns, bowlBalls, legal: inn.legalBalls, wk, w: inn.wickets }); }
    inn.history.forEach((h) => { inc(shotT, h.meta.shotName ?? (h.meta.leave ? 'leave' : 'none')); inc(timT, h.meta.timing ?? '-'); inc(conT, h.meta.contact ?? (h.meta.beaten ? 'beaten' : '-')); inc(runT, h.wicket ? 'W' : String(h.boundary || h.runsRun)); if (h.wicket) inc(wkS, h.wicket.kind + ':' + (h.meta.shotName ?? '-') + ':' + (h.meta.contact ?? '') + ':' + (h.meta.timing ?? '')); });
    const kinds: Record<string, number> = {};
    inn.history.forEach((h) => { if (h.wicket) kinds[h.wicket.kind] = (kinds[h.wicket.kind] ?? 0) + 1; });
    const fours = Object.values(inn.batters).reduce((a, b) => a + b.fours, 0), sixes = Object.values(inn.batters).reduce((a, b) => a + b.sixes, 0);
    const dots = inn.history.filter((h) => h.extraType === 'none' && h.batRuns + h.byes + h.legByes === 0 && !h.wicket).length;
    console.log(`M${m} inn${inn.index + 1} ${inn.battingTeamId} ${inn.runs}/${inn.wickets} (${Math.floor(inn.legalBalls / 6)}.${inn.legalBalls % 6}) 4s:${fours} 6s:${sixes} dots:${dots} ext:${JSON.stringify(inn.extras)} W:${JSON.stringify(kinds)} maxOvBowler:${Math.max(...Object.values(inn.bowlers).map(b=>b.balls))/6}`);
  }
  console.log(`   result: ${e.match.result?.text}  POM ${e.match.result?.playerOfMatch}  simTime ${(e.t / 60).toFixed(1)}min guard ${guard}`);
}
console.log('notifications', tally, 'fails', fails);
console.log('wicketShots', wkS); console.log('shots', shotT); console.log('timing', timT); console.log('contact', conT); console.log('runs/ball', runT);
