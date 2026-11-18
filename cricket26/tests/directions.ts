import { planDelivery } from '../src/game/BowlingEngine';
import { resolveShot, screenToBatterAngle, ShotInput, idealPressTime, contactZ, chooseShot, readBall } from '../src/game/BattingEngine';
import { TEAMS } from '../src/data/teams';
import { mulberry32, setRng } from '../src/utils/random';
setRng(mulberry32(5));
const bowler = TEAMS[1].players[9];
const rh = TEAMS[0].players[0], lh = TEAMS[0].players[1]; // Gill RH, Abhishek LH
const keys: Record<string, [number, number]> = { W: [0, 1], A: [-1, 0], D: [1, 0], 'W+A': [-1, 1], 'W+D': [1, 1], Q: [-0.5, -0.87], E: [0.5, -0.87] };
for (const batter of [rh, lh]) {
  const os = batter.battingHand === 'R' ? 1 : -1;
  for (const [lenName, length, line] of [['full', 3.0, 0.2], ['short', 9.0, 0.3]] as const) {
    const plan = planDelivery({ bowler, type: 'goodLength', variation: 'normal', line, length, execution: 1, offSign: os, scatterMul: 0, noBall: false });
    const row: string[] = [];
    for (const kind of ['ground', 'loft'] as const) for (const [k, [sx, sy]] of Object.entries(keys)) {
      const inp: ShotInput = { kind, angle: screenToBatterAngle(sx, sy, os), hasDir: true, power: false, soft: false, sweep: false, foot: 0, pressTime: 0 };
      const ctx = { path: plan.path, bounceIndex: plan.bounceIndex, offSign: os, batter, difficulty: 'medium' as const, isUser: true, speedKmh: plan.speedKmh, spin: false, deliveryQuality: 0, movement: 0, shuffle: 0, batterZ: 9.35 };
      const r0 = readBall(plan.path, plan.bounceIndex, 9.0, os, plan.speedKmh, false);
      const shot = chooseShot(inp, r0);
      inp.pressTime = idealPressTime(plan.path, contactZ(shot, inp, 9.35).z)!;
      const res = resolveShot(inp, ctx);
      const v = res.exitV;
      const worldDeg = v ? Math.round((Math.atan2(v.x, -v.z) * 180) / Math.PI) : NaN; // screen: + = right
      row.push(`${kind === 'loft' ? 'L+' : ''}${k}: ${res.shot.name}/${res.contact} → screen ${worldDeg}°`);
    }
    console.log(`\n${batter.name} (${batter.battingHand}H) vs ${lenName}:\n  ` + row.join('\n  '));
  }
}
