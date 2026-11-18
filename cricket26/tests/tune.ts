import { makeBall, stepBall } from '../src/game/BallPhysics';
for (const [v, deg] of [[48, 32], [44, 32], [40, 32], [36, 34], [32, 40], [28, 45], [30, 4], [22, 3], [15, 2], [8, -4]]) {
  const b = makeBall(); b.p = { x: 0, y: 0.8, z: 9 };
  const a = deg * Math.PI / 180;
  b.v = { x: 0, y: v * Math.sin(a), z: -v * Math.cos(a) };
  let t = 0, carry = -1;
  while (t < 15) { stepBall(b, 1 / 480); t += 1 / 480; if (carry < 0 && b.bounces > 0) carry = 9 - b.p.z; if (b.rolling && Math.hypot(b.v.x,b.v.z) < 0.06) break; }
  console.log(`v=${v} a=${deg} carry=${carry.toFixed(1)} total=${(9 - b.p.z).toFixed(1)} t=${t.toFixed(1)}`);
}
