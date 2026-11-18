import { planDelivery, DELIVERIES, DeliveryType } from '../src/game/BowlingEngine';
import { TEAMS } from '../src/data/teams';
import { timeAtZ, sampleAt } from '../src/game/BallPhysics';
const fast = TEAMS[0].players[9], spin = TEAMS[0].players[13];
for (const [p, types] of [[fast, ['goodLength','yorker','bouncer','inswinger','outswinger','offCutter','slower']],[spin,['offSpin','armBall','topSpinner']]] as const) {
  for (const t of types) {
    const d = DELIVERIES[t as DeliveryType];
    const pl = planDelivery({ bowler: p, type: t as DeliveryType, variation: 'normal', line: d.line, length: d.length, execution: 1, offSign: 1, scatterMul: 0, noBall: false });
    const ta = timeAtZ(pl.path, 9.0)!; const s = sampleAt(pl.path, ta);
    const ts = timeAtZ(pl.path, 10.06); const ss = ts ? sampleAt(pl.path, ts) : null;
    console.log(t.padEnd(11), pl.speedKmh.toFixed(0), 'pitch z', pl.pitchZ.toFixed(2), 'want', (10.06-d.length).toFixed(2), 'x', pl.pitchX.toFixed(2), '| at bat t', ta.toFixed(3), 'x', s.x.toFixed(2), 'y', s.y.toFixed(2), '| stumps x', ss?.x.toFixed(2), 'y', ss?.y.toFixed(2), pl.lengthName, pl.lineName);
  }
}
