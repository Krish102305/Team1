import { G, BALL_R, STUMPS_Z, PITCH_HALF_W } from './constants';

export interface Vec3 { x: number; y: number; z: number }

export interface BallState {
  p: Vec3;
  v: Vec3;
  /** lateral swing acceleration (m/s^2, world x) applied until first bounce */
  swingAcc: number;
  /** extra x velocity added at the first bounce on the pitch (spin turn / seam) */
  turnOnBounce: number;
  /** vertical restitution on the pitch */
  pitchE: number;
  /** fraction of horizontal speed kept on a pitch bounce */
  pitchKeep: number;
  bounces: number;
  rolling: boolean;
  dragMul: number;
  spin: number; // visual spin rate rad/s
}

export const DRAG_K = 0.0115; // 0.5 * rho * Cd * A / m

export function makeBall(): BallState {
  return {
    p: { x: 0, y: -10, z: 0 }, v: { x: 0, y: 0, z: 0 }, swingAcc: 0, turnOnBounce: 0,
    pitchE: 0.55, pitchKeep: 0.88, bounces: 0, rolling: false, dragMul: 1, spin: 0,
  };
}

export function cloneBall(b: BallState): BallState {
  return { ...b, p: { ...b.p }, v: { ...b.v } };
}

export const onPitch = (x: number, z: number) => Math.abs(x) < PITCH_HALF_W + 0.2 && Math.abs(z) < STUMPS_Z + 1.3;

export interface StepEvents { bounced: boolean; bounceOnPitch: boolean; bounceX: number; bounceZ: number }

/** Advance the ball by dt seconds. Returns bounce info. Deterministic. */
export function stepBall(b: BallState, dt: number, ev?: StepEvents): void {
  if (ev) ev.bounced = false;
  const v = b.v, p = b.p;
  if (b.rolling) {
    const s = Math.hypot(v.x, v.z);
    if (s < 0.05) { v.x = 0; v.z = 0; v.y = 0; p.y = BALL_R; return; }
    const decel = 0.3 * s + 0.05 * G;
    const ns = Math.max(0, s - decel * dt);
    const k = ns / s;
    v.x *= k; v.z *= k; v.y = 0;
    p.x += v.x * dt; p.z += v.z * dt; p.y = BALL_R;
    b.spin = ns / BALL_R;
    return;
  }
  let ax = 0, ay = -G, az = 0;
  if (b.dragMul > 0) {
    const k = DRAG_K * b.dragMul * Math.hypot(v.x, v.y, v.z);
    ax -= k * v.x; ay -= k * v.y; az -= k * v.z;
  }
  if (b.bounces === 0) ax += b.swingAcc;
  v.x += ax * dt; v.y += ay * dt; v.z += az * dt;
  p.x += v.x * dt; p.y += v.y * dt; p.z += v.z * dt;
  if (p.y < BALL_R && v.y < 0) {
    // ground contact: compute exact crossing to avoid tunnelling
    p.y = BALL_R;
    const pitch = onPitch(p.x, p.z);
    const e = pitch ? b.pitchE : 0.42;
    const keep = pitch ? b.pitchKeep : Math.max(0.6, 0.9 - Math.abs(v.y) * 0.012);
    v.y = -v.y * e;
    v.x *= keep; v.z *= keep;
    if (pitch && b.bounces === 0) v.x += b.turnOnBounce;
    if (ev) { ev.bounced = true; ev.bounceOnPitch = pitch; ev.bounceX = p.x; ev.bounceZ = p.z; }
    b.bounces++;
    if (v.y < 0.9) { v.y = 0; b.rolling = true; }
  }
  b.spin = Math.hypot(v.x, v.z) / BALL_R * 0.3;
}

export interface PathSample { t: number; x: number; y: number; z: number; bounces: number }

/** Predict the trajectory with no interactions. */
export function predictPath(b0: BallState, maxT: number, dt: number, stopZ?: number): PathSample[] {
  const b = cloneBall(b0);
  const out: PathSample[] = [{ t: 0, x: b.p.x, y: b.p.y, z: b.p.z, bounces: b.bounces }];
  let t = 0;
  while (t < maxT) {
    stepBall(b, dt);
    t += dt;
    out.push({ t, x: b.p.x, y: b.p.y, z: b.p.z, bounces: b.bounces });
    if (stopZ !== undefined && b.p.z > stopZ) break;
    if (b.rolling && Math.hypot(b.v.x, b.v.z) < 0.05) break;
  }
  return out;
}

/** time when path first crosses z (moving +z). Linear interpolation. */
export function timeAtZ(path: PathSample[], z: number): number | null {
  for (let i = 1; i < path.length; i++) {
    const a = path[i - 1], c = path[i];
    if (a.z < z && c.z >= z) {
      const f = (z - a.z) / (c.z - a.z);
      return a.t + (c.t - a.t) * f;
    }
  }
  return null;
}

export function sampleAt(path: PathSample[], t: number): PathSample {
  if (t <= path[0].t) return path[0];
  for (let i = 1; i < path.length; i++) {
    if (path[i].t >= t) {
      const a = path[i - 1], c = path[i];
      const f = (t - a.t) / (c.t - a.t || 1);
      return { t, x: a.x + (c.x - a.x) * f, y: a.y + (c.y - a.y) * f, z: a.z + (c.z - a.z) * f, bounces: c.bounces };
    }
  }
  return path[path.length - 1];
}

/** Segment vs axis aligned box test (for stump collisions without tunnelling). */
export function segmentHitsBox(ax: number, ay: number, az: number, bx: number, by: number, bz: number,
  minX: number, maxX: number, minY: number, maxY: number, minZ: number, maxZ: number): boolean {
  let t0 = 0, t1 = 1;
  const d = [bx - ax, by - ay, bz - az];
  const o = [ax, ay, az];
  const mn = [minX, minY, minZ], mx = [maxX, maxY, maxZ];
  for (let i = 0; i < 3; i++) {
    if (Math.abs(d[i]) < 1e-9) {
      if (o[i] < mn[i] || o[i] > mx[i]) return false;
    } else {
      let ta = (mn[i] - o[i]) / d[i], tb = (mx[i] - o[i]) / d[i];
      if (ta > tb) { const tmp = ta; ta = tb; tb = tmp; }
      t0 = Math.max(t0, ta); t1 = Math.min(t1, tb);
      if (t0 > t1) return false;
    }
  }
  return true;
}
