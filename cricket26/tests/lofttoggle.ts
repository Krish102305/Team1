import { GameEngine } from '../src/game/GameEngine';
import { TEAM_MAP } from '../src/data/teams';
import { SIM_STEP } from '../src/game/constants';
import { idealPressTime } from '../src/game/BattingEngine';
const e = new GameEngine({ userTeamId: 'IND', aiTeamId: 'AUS', overs: 2, format: 'Custom', difficulty: 'easy', stadiumId: 'intl', timeOfDay: 'day', userXI: TEAM_MAP.IND.defaultXI, aiXI: TEAM_MAP.AUS.defaultXI, userBatsFirst: true, tossText: '' });
e.listener = { ...e.listener, onState() {}, onNotify() {}, onCommentary() {}, onPhase() {}, onTiming() {}, onSound() {}, onReplayAvailable() {} };
const kinds: string[] = [];
let toggled = 0, last = -1, g = 0;
while (kinds.length < 6 && g++ < 400000) {
  if (e.phase === 'intro' || e.phase === 'walkIn') { e.keyDown('skip'); e.keyUp('skip'); }
  // toggle loft on before ball 3 (during the run-up), off again before ball 5
  if (e.phase === 'runUp' && e.d.id !== last) { last = e.d.id; if (kinds.length === 2 || kinds.length === 4) { e.keyDown('batLoft'); e.keyUp('batLoft'); toggled++; } }
  if (e.phase === 'delivery' && !e.d.shot && !e.d.pending && e.d.plan) {
    const t = idealPressTime(e.d.plan.path, 8.75)!;
    if (e.t - e.d.releaseT >= t) { e.keyDown('batStraight'); }
  }
  if (e.d.shot && e.held('batStraight')) { e.keyUp('batStraight'); kinds.push(e.d.shot.input.kind + (e.loftOn ? '(on)' : '(off)')); }
  e.advance(SIM_STEP);
}
console.log('shot kinds per ball:', kinds.join(', '), '| toggles', toggled);
