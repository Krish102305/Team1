import type { Difficulty, Player } from './types';
import { BallState, cloneBall, stepBall, StepEvents } from './BallPhysics';
import { BATTER_Z } from './constants';

export interface FieldPos { id: string; name: string; angle: number; dist: number | 'deep' }

// angle: degrees in batter frame, 0 = straight down the ground, + = off side, 180 = behind (keeper)
export const POSITIONS: Record<string, FieldPos> = {
  slip1: { id: 'slip1', name: 'First Slip', angle: 165, dist: 19 },
  slip2: { id: 'slip2', name: 'Second Slip', angle: 158, dist: 19.5 },
  gully: { id: 'gully', name: 'Gully', angle: 132, dist: 19 },
  point: { id: 'point', name: 'Point', angle: 95, dist: 24 },
  cover: { id: 'cover', name: 'Cover', angle: 66, dist: 26 },
  extraCover: { id: 'extraCover', name: 'Extra Cover', angle: 48, dist: 28 },
  midOff: { id: 'midOff', name: 'Mid-off', angle: 18, dist: 27 },
  midOn: { id: 'midOn', name: 'Mid-on', angle: -18, dist: 27 },
  midwicket: { id: 'midwicket', name: 'Midwicket', angle: -62, dist: 26 },
  squareLeg: { id: 'squareLeg', name: 'Square Leg', angle: -95, dist: 24 },
  shortFineLeg: { id: 'shortFineLeg', name: 'Short Fine Leg', angle: -152, dist: 20 },
  fineLeg: { id: 'fineLeg', name: 'Fine Leg', angle: -158, dist: 'deep' },
  thirdMan: { id: 'thirdMan', name: 'Third Man', angle: 152, dist: 'deep' },
  longOn: { id: 'longOn', name: 'Long-on', angle: -14, dist: 'deep' },
  longOff: { id: 'longOff', name: 'Long-off', angle: 14, dist: 'deep' },
  deepCover: { id: 'deepCover', name: 'Deep Cover', angle: 62, dist: 'deep' },
  deepPoint: { id: 'deepPoint', name: 'Deep Point', angle: 100, dist: 'deep' },
  deepMidwicket: { id: 'deepMidwicket', name: 'Deep Midwicket', angle: -60, dist: 'deep' },
  deepSquareLeg: { id: 'deepSquareLeg', name: 'Deep Square Leg', angle: -98, dist: 'deep' },
  cowCorner: { id: 'cowCorner', name: 'Cow Corner', angle: -38, dist: 'deep' },
  shortLeg: { id: 'shortLeg', name: 'Short Leg', angle: -100, dist: 6 },
  sillyPoint: { id: 'sillyPoint', name: 'Silly Point', angle: 95, dist: 6 },
};

export const FIELD_SETS: Record<string, string[]> = {
  paceAttack: ['slip1', 'slip2', 'gully', 'point', 'cover', 'midOff', 'midOn', 'squareLeg', 'fineLeg'],
  paceBalanced: ['slip1', 'point', 'cover', 'midOff', 'midOn', 'midwicket', 'squareLeg', 'thirdMan', 'fineLeg'],
  paceDeath: ['point', 'deepCover', 'longOff', 'longOn', 'deepMidwicket', 'deepSquareLeg', 'fineLeg', 'thirdMan', 'extraCover'],
  paceDefensive: ['point', 'cover', 'deepCover', 'longOff', 'longOn', 'deepMidwicket', 'squareLeg', 'fineLeg', 'thirdMan'],
  spinAttack: ['slip1', 'shortLeg', 'point', 'cover', 'midOff', 'midOn', 'midwicket', 'deepSquareLeg', 'longOn'],
  spinBalanced: ['point', 'cover', 'midOff', 'midOn', 'midwicket', 'longOn', 'deepMidwicket', 'deepCover', 'shortFineLeg'],
  spinDefensive: ['point', 'deepCover', 'longOff', 'longOn', 'deepMidwicket', 'deepSquareLeg', 'cover', 'midwicket', 'shortFineLeg'],
};

export function chooseFieldSet(opts: {
  spin: boolean; phase: number; difficulty: Difficulty; wicketsDown: number; rrr: number | null; batterAggressive: boolean;
}): string {
  const { spin, phase, difficulty } = opts;
  if (difficulty === 'easy') return spin ? 'spinBalanced' : 'paceBalanced';
  const smart = difficulty === 'hard' || difficulty === 'pro';
  if (spin) {
    if (phase > 0.8 || (smart && opts.rrr !== null && opts.rrr > 10)) return 'spinDefensive';
    if (smart && opts.wicketsDown >= 6) return 'spinAttack';
    return phase < 0.2 && smart ? 'spinAttack' : 'spinBalanced';
  }
  if (phase < 0.2) return smart ? 'paceAttack' : 'paceBalanced';
  if (phase > 0.78) return 'paceDeath';
  if (smart && opts.batterAggressive) return 'paceDefensive';
  if (smart && opts.wicketsDown >= 7) return 'paceAttack';
  return 'paceBalanced';
}

/** Convert field position to world coords. */
export function fieldPosToWorld(pos: FieldPos, offSign: number, boundaryAt: (angle: number) => number): { x: number; z: number } {
  const a = (pos.angle * Math.PI) / 180;
  const dx = Math.sin(a) * offSign, dz = -Math.cos(a);
  let d: number;
  if (pos.dist === 'deep') {
    // find boundary along that ray from the batter
    let lo = 20, hi = 140;
    for (let i = 0; i < 20; i++) {
      const m = (lo + hi) / 2;
      const x = dx * m, z = BATTER_Z + dz * m;
      if (Math.hypot(x, z) < boundaryAt(Math.atan2(x, z))) lo = m; else hi = m;
    }
    d = lo - 5;
  } else d = pos.dist;
  return { x: dx * d, z: BATTER_Z + dz * d };
}

export interface FielderStats { reaction: number; speed: number; catchSkill: number; throwSpeed: number; groundSkill: number }

const DIFF_FIELD: Record<Difficulty, { reaction: number; speed: number; skill: number }> = {
  easy: { reaction: 1.45, speed: 0.88, skill: 0.85 },
  medium: { reaction: 1.15, speed: 0.95, skill: 0.95 },
  hard: { reaction: 0.95, speed: 1.0, skill: 1.0 },
  pro: { reaction: 0.8, speed: 1.05, skill: 1.05 },
};

export function fielderStats(p: Player, diff: Difficulty, aiTeam: boolean): FielderStats {
  const d = aiTeam ? DIFF_FIELD[diff] : DIFF_FIELD.medium;
  const f = p.field / 100;
  return {
    reaction: (0.5 - f * 0.25) * d.reaction,
    speed: (5.6 + (p.speed / 100) * 2.3) * d.speed,
    catchSkill: Math.min(0.97, (0.56 + f * 0.36) * d.skill),
    groundSkill: Math.min(0.995, (0.9 + f * 0.09) * (0.97 + (d.skill - 0.95) * 0.5)),
    throwSpeed: 22 + f * 10,
  };
}

export interface Intercept {
  fielder: number;
  t: number;
  x: number; y: number; z: number;
  inAir: boolean;
  dive: boolean;
  beyondBoundary: boolean;
}

export interface FielderLike { x: number; z: number; stats: FielderStats; available: boolean; isKeeper: boolean }

export interface BallPrediction { t: number; x: number; y: number; z: number; bounces: number; boundary: boolean }

export function predictLive(ball: BallState, boundaryAt: (angle: number) => number, maxT = 12): BallPrediction[] {
  const b = cloneBall(ball);
  const out: BallPrediction[] = [];
  const dt = 1 / 240;
  let t = 0, k = 0;
  const ev: StepEvents = { bounced: false, bounceOnPitch: false, bounceX: 0, bounceZ: 0 };
  while (t < maxT) {
    stepBall(b, dt, ev);
    t += dt;
    k++;
    const r = Math.hypot(b.p.x, b.p.z);
    const boundary = r >= boundaryAt(Math.atan2(b.p.x, b.p.z));
    if (k % 8 === 0 || boundary) out.push({ t, x: b.p.x, y: b.p.y, z: b.p.z, bounces: b.bounces, boundary });
    if (boundary) break;
    if (b.rolling && Math.hypot(b.v.x, b.v.z) < 0.05) { out.push({ t, x: b.p.x, y: b.p.y, z: b.p.z, bounces: b.bounces, boundary: false }); break; }
  }
  return out;
}

export const FIELDER_ACCEL = 7;
/** distance a fielder covers from standing in time tau (accelerating then at top speed) */
export function coverDistance(tau: number, v: number) {
  const tAcc = v / FIELDER_ACCEL;
  return tau < tAcc ? 0.5 * FIELDER_ACCEL * tau * tau : v * tau - (v * v) / (2 * FIELDER_ACCEL);
}

/** For each fielder find the earliest point they can reach the ball. */
export function planIntercepts(pred: BallPrediction[], fielders: FielderLike[], bouncedAlready: boolean): Intercept[] {
  const res: Intercept[] = [];
  fielders.forEach((f, i) => {
    if (!f.available) return;
    for (const s of pred) {
      if (s.boundary) break;
      const inAir = s.bounces === 0 && !bouncedAlready;
      if (s.y > (inAir ? 2.5 : 0.95)) continue;
      const d = Math.hypot(s.x - f.x, s.z - f.z);
      const avail = coverDistance(Math.max(0, s.t - f.stats.reaction), f.stats.speed);
      const reach = 0.9;
      if (d - reach <= avail) { res.push({ fielder: i, t: s.t, x: s.x, y: s.y, z: s.z, inAir, dive: false, beyondBoundary: false }); return; }
      if (d - 2.4 <= avail && s.y < 1.6) { res.push({ fielder: i, t: s.t, x: s.x, y: s.y, z: s.z, inAir, dive: true, beyondBoundary: false }); return; }
    }
    // cannot intercept before it stops/crosses: chase toward final point
    const last = pred[pred.length - 1];
    if (last) {
      const d = Math.max(0, Math.hypot(last.x - f.x, last.z - f.z) - 0.9);
      // invert coverDistance to get time to cover d
      const v = f.stats.speed, dAcc = (v * v) / (2 * FIELDER_ACCEL);
      const tc = d < dAcc ? Math.sqrt((2 * d) / FIELDER_ACCEL) : v / FIELDER_ACCEL + (d - dAcc) / v;
      const t = Math.max(f.stats.reaction + tc, last.t);
      res.push({ fielder: i, t: last.boundary ? t + 50 : t, x: last.x, y: last.y, z: last.z, inAir: false, dive: false, beyondBoundary: last.boundary });
    }
  });
  res.sort((a, b) => a.t - b.t);
  return res;
}
