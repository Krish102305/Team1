import * as THREE from 'three';
import type { Rig } from './PlayerRig';
import { SWING_LEAD } from '../../game/constants';

/**
 * Batting animation built from keyframed *effectors* (pelvis, feet, bat) + IK, following the
 * phase model used in batting biomechanics: stance → trigger/backlift → stride → downswing →
 * impact → follow-through → recovery. Feet are planted with two-bone leg IK (no foot sliding),
 * the pelvis carries the weight transfer, and the shoulders coil against the hips ("X-factor")
 * then unwind into the shot. Everything is authored for a right-hander in root space:
 *   +x = towards the bowler, +z = the way the chest faces (off side), +y = up.
 * Left-handers are mirrored by the rig's parent group.
 */

type V = [number, number, number];

export interface BatPose {
  pelvis: V;        // hips position (root space)
  pelvisYaw: number;
  spineFwd: number; // bend over the ball (towards +z)
  spineSide: number;// lean towards the bowler (negative)
  chestYaw: number; // shoulders relative to hips
  front: V;         // front ankle target (root space)
  back: V;          // back ankle target
  frontYaw: number; backYaw: number;
  frontHeel: number; backHeel: number; // heel raise (m)
  H: V; D: V; F: V; // bat: handle position, blade direction, face normal (chest space)
  headTurn: number; // extra head yaw (follow the ball after impact)
}

const P = (o: Partial<BatPose>, base: BatPose): BatPose => ({ ...base, ...o });

const STANCE: BatPose = {
  pelvis: [0.0, 0.86, 0.02], pelvisYaw: 0, spineFwd: 0.34, spineSide: -0.04, chestYaw: 0.04,
  front: [0.27, 0.085, 0.0], back: [-0.19, 0.085, -0.02], frontYaw: 0.25, backYaw: 0.0, frontHeel: 0, backHeel: 0,
  H: [0.02, -0.43, 0.25], D: [-0.25, -1, 0.06], F: [1, 0, 0.25], headTurn: 0,
};
// trigger movement: small back-and-across step, bat lifted high, shoulders coiled
const LIFTED: BatPose = P({
  pelvis: [-0.04, 0.89, 0.03], spineFwd: 0.27, chestYaw: -0.16,
  back: [-0.27, 0.085, 0.03], front: [0.22, 0.085, 0.02], frontHeel: 0.025,
  H: [-0.15, 0.05, 0.2], D: [-0.5, 0.78, -0.22], F: [0.3, 0.3, 1],
}, STANCE);

type Key = [number, Partial<BatPose>];

/** shot timelines (seconds after the key press; impact at SWING_LEAD) */
function timeline(family: string, foot: 'f' | 'b', angle: number): Key[] {
  const c = SWING_LEAD;
  const offSide = Math.max(-1, Math.min(1, Math.sin((angle * Math.PI) / 180)));
  const legSide = Math.max(0, -offSide);
  const recover: Key = [1.5, { ...STANCE }];
  switch (family) {
    case 'drive': case 'loft': {
      if (foot === 'b') {
        // back-foot punch / lofted back-foot drive: back and across, tall, punch through the line
        const loft = family === 'loft';
        return [
          [0.0, { ...LIFTED }],
          [0.12, { pelvis: [-0.14, 0.93, 0.08], back: [-0.42, 0.085, 0.12], front: [0.1, 0.11, 0.05], frontHeel: 0.05, spineFwd: 0.14, chestYaw: -0.22, H: [-0.12, 0.14, 0.22], D: [-0.4, 0.85, -0.3] }],
          [c, { pelvis: [-0.1, 0.94, 0.08], back: [-0.42, 0.085, 0.12], front: [0.08, 0.085, 0.05], spineFwd: 0.12, chestYaw: 0.15, H: [0.22, -0.12, 0.34], D: [0.3, -0.95, 0.1 + offSide * 0.3], F: [1, 0, 0.3 + offSide * 0.5] }],
          [0.48, { pelvis: [-0.06, 0.94, 0.08], chestYaw: 0.45, backHeel: 0.06, H: loft ? [0.08, 0.48, 0.05] : [0.22, 0.12, 0.28], D: loft ? [-0.6, 0.55, -0.5] : [0.25, 0.4, -0.2 + offSide * 0.5], F: [0, 1, 0.3], headTurn: offSide * 0.6 }],
          [0.95, {}], recover,
        ];
      }
      const loft = family === 'loft';
      const fz = 0.08 + offSide * 0.2 - legSide * 0.08;
      return [
        [0.0, { ...LIFTED }],
        // stride: front foot in the air moving towards the pitch of the ball, shoulders still coiled
        [0.1, { pelvis: [0.14, 0.86, 0.04], front: [0.55, 0.2, fz * 0.7], frontYaw: 0.4, spineFwd: 0.36, chestYaw: -0.26, pelvisYaw: 0.05, H: [-0.17, 0.11, 0.17], D: [-0.45, 0.82, -0.35] }],
        // plant: weight onto the front knee, head over it, downswing starts (continuous flow from backlift)
        [0.19, { pelvis: [0.42, 0.76, 0.05 + fz * 0.3], front: [0.82, 0.085, fz], frontYaw: 0.5 + offSide * 0.2, spineFwd: 0.46, spineSide: -0.36, chestYaw: 0.02, backHeel: 0.04, H: [0.1, -0.08, 0.32], D: [0.05, -0.95, 0.35], F: [1, 0, 0.5] }],
        // impact: high front elbow, bat vertical and slightly ahead, wrists uncocking
        [c, { pelvis: [0.47, 0.75, 0.06 + fz * 0.3], spineFwd: 0.5, spineSide: -0.4, chestYaw: 0.18 + offSide * 0.12, pelvisYaw: 0.14, backHeel: 0.07,
          H: [0.31, -0.3, 0.34], D: [0.36, -0.95, 0.1 + offSide * 0.25], F: [1, 0, 0.35 + offSide * 0.6] }],
        // follow-through: full for the loft, checked for the ground drive
        [0.46, { pelvis: [0.42, loft ? 0.86 : 0.8, 0.06], spineSide: -0.18, spineFwd: loft ? 0.25 : 0.4, chestYaw: loft ? 0.75 : 0.5, backHeel: 0.12,
          H: loft ? [0.08, 0.5, 0.05] : [0.24, 0.26, 0.24], D: loft ? [-0.6, 0.55, -0.55] : [-0.3, 0.78, -0.45 + offSide * 0.3], F: [0, 1, 0.2], headTurn: offSide * 0.5 }],
        [1.0, {}], recover,
      ];
    }
    case 'slog':
      return [
        [0.0, { ...LIFTED, chestYaw: -0.3 }],
        [0.12, { pelvis: [0.12, 0.86, -0.05], front: [0.5, 0.15, -0.2], frontYaw: 0.8, chestYaw: -0.35, H: [-0.2, 0.18, 0.15], D: [-0.5, 0.8, -0.3] }],
        [0.2, { pelvis: [0.25, 0.82, -0.08], front: [0.6, 0.085, -0.28], frontYaw: 0.9, pelvisYaw: 0.35, chestYaw: 0.0, H: [0.0, 0.0, 0.32], D: [0.3, -0.7, 0.6] }],
        [c, { pelvis: [0.26, 0.82, -0.08], pelvisYaw: 0.55, chestYaw: 0.35, spineFwd: 0.3, H: [0.15, -0.12, 0.32], D: [0.6, -0.65, -0.45], F: [1, 0.2, -0.4] }],
        [0.5, { pelvisYaw: 0.75, chestYaw: 0.9, spineFwd: 0.15, backHeel: 0.12, H: [0.15, 0.42, -0.12], D: [-0.5, 0.45, -0.75], F: [0, 1, 0], headTurn: -0.6 }],
        [1.0, {}], recover,
      ];
    case 'cut':
      return [
        [0.0, { ...LIFTED }],
        [0.12, { pelvis: [-0.12, 0.92, 0.14], back: [-0.38, 0.085, 0.28], backYaw: 0.4, front: [0.14, 0.12, 0.1], spineFwd: 0.2, chestYaw: -0.3, H: [-0.05, 0.25, 0.3], D: [-0.3, 0.9, 0.3], F: [0, 0, 1] }],
        [c, { pelvis: [-0.1, 0.9, 0.16], back: [-0.38, 0.085, 0.28], front: [0.12, 0.085, 0.1], spineFwd: 0.32, chestYaw: -0.4, pelvisYaw: -0.15, H: [0.06, -0.05, 0.45], D: [0.25, -0.25, 1], F: [0.3, -1, 0] }],
        [0.46, { chestYaw: -0.7, pelvisYaw: -0.25, H: [-0.12, 0.12, 0.38], D: [-0.65, 0.1, 0.75], F: [0, -1, 0], headTurn: 0.9 }],
        [0.95, {}], recover,
      ];
    case 'pull':
      return [
        [0.0, { ...LIFTED }],
        [0.12, { pelvis: [-0.12, 0.93, 0.02], back: [-0.36, 0.085, 0.1], front: [0.1, 0.12, 0.02], spineFwd: 0.12, chestYaw: -0.25, H: [-0.1, 0.22, 0.25], D: [-0.5, 0.78, 0.3], F: [0, 0, 1] }],
        [c, { pelvis: [-0.1, 0.92, 0.0], front: [0.12, 0.085, -0.06], pelvisYaw: 0.55, chestYaw: 0.45, spineFwd: 0.12, H: [0.18, 0.02, 0.3], D: [0.35, -0.1, -1], F: [1, 0, 0] }],
        [0.48, { pelvisYaw: 0.9, chestYaw: 0.85, frontHeel: 0.06, backYaw: 0.6, H: [0.0, 0.28, -0.22], D: [-0.6, 0.4, -0.7], F: [0, 1, 0], headTurn: -0.9 }],
        [0.95, {}], recover,
      ];
    case 'sweep': case 'reverse': case 'scoop': {
      const rev = family === 'reverse', scoop = family === 'scoop';
      return [
        [0.0, { ...LIFTED }],
        [0.13, { pelvis: [0.26, 0.62, 0.08], front: [0.74, 0.085, 0.22], frontYaw: 0.4, back: [-0.22, 0.085, -0.08], backHeel: 0.12, spineFwd: 0.62, spineSide: -0.15, chestYaw: rev ? 0.4 : -0.2, H: [0.1, 0.0, 0.3], D: rev ? [-0.2, 0.6, 0.8] : [-0.3, 0.7, -0.4] }],
        [c, { pelvis: [0.28, 0.48, 0.1], back: [-0.25, 0.1, -0.1], backHeel: 0.14, spineFwd: 0.72, chestYaw: rev ? -0.3 : scoop ? 0.0 : 0.45,
          H: scoop ? [0.26, -0.36, 0.3] : [0.28, -0.42, rev ? 0.18 : 0.22], D: scoop ? [0.9, -0.4, 0.1] : rev ? [0.35, -0.45, 0.85] : [0.35, -0.45, -0.85], F: scoop ? [0, 1, 0] : rev ? [1, 0, 0] : [1, -0.3, 0] }],
        [0.5, { chestYaw: rev ? -0.6 : scoop ? 0.0 : 0.85, H: scoop ? [0.2, -0.1, 0.25] : [0.05, -0.2, rev ? 0.3 : -0.22], D: scoop ? [0.55, 0.55, 0] : rev ? [-0.3, 0.1, 0.95] : [-0.4, 0.1, -0.9], F: [0, 1, 0], headTurn: rev ? 0.8 : -0.8 }],
        [1.0, {}], [1.7, { ...STANCE }],
      ];
    }
    case 'glance':
      return [
        [0.0, { ...LIFTED }],
        [0.15, { pelvis: foot === 'b' ? [-0.08, 0.92, 0.02] : [0.25, 0.84, 0.02], front: foot === 'b' ? [0.14, 0.085, 0.02] : [0.6, 0.085, -0.02], back: foot === 'b' ? [-0.34, 0.085, 0.08] : STANCE.back, spineFwd: 0.38, chestYaw: -0.05, H: [0.0, -0.05, 0.3], D: [-0.1, -0.6, 0.5] }],
        [c, { chestYaw: 0.15, pelvisYaw: 0.15, H: [0.24, -0.3, 0.24], D: [0.15, -1, -0.3], F: [0.4, 0, -1] }],
        [0.46, { chestYaw: 0.4, H: [0.12, -0.05, 0.05], D: [-0.25, -0.55, -0.8], F: [0, 0, -1], headTurn: -0.9 }],
        [0.9, {}], recover,
      ];
    case 'defend':
      return [
        [0.0, { ...LIFTED, H: [-0.08, -0.05, 0.22], D: [-0.4, 0.5, -0.1] }],
        [0.15, { pelvis: [0.38, 0.77, 0.05], front: [0.74, 0.085, 0.1], frontYaw: 0.45, spineFwd: 0.52, spineSide: -0.38, chestYaw: 0.05, backHeel: 0.04, H: [0.2, -0.22, 0.3], D: [0.1, -1, 0.05] }],
        [c, { H: [0.32, -0.33, 0.3], D: [0.2, -1, 0.02], F: [1, 0, 0.1] }],
        [0.85, { H: [0.3, -0.31, 0.3] }], recover,
      ];
    case 'defendBack':
      return [
        [0.0, { ...LIFTED, H: [-0.08, -0.02, 0.22], D: [-0.4, 0.55, -0.1] }],
        [0.15, { pelvis: [-0.1, 0.94, 0.06], back: [-0.38, 0.085, 0.1], front: [0.1, 0.085, 0.04], spineFwd: 0.14, chestYaw: 0.0, H: [0.12, -0.12, 0.32], D: [0.06, -1, 0] }],
        [c, { H: [0.13, -0.14, 0.33], D: [0.05, -1, 0], F: [1, 0, 0] }],
        [0.85, {}], recover,
      ];
    case 'leave':
    default:
      return [
        [0.0, { ...LIFTED }],
        [0.18, { pelvis: [0.12, 0.9, 0.03], front: [0.45, 0.085, 0.06], spineFwd: 0.18, chestYaw: -0.2, H: [-0.05, 0.38, 0.12], D: [-0.25, 0.95, 0.15], F: [0, 0, 1], headTurn: 0.3 }],
        [0.9, {}], recover,
      ];
  }
}

const ease = (t: number) => t * t * (3 - 2 * t);
const lerpV = (a: V, b: V, t: number, o: V) => { o[0] = a[0] + (b[0] - a[0]) * t; o[1] = a[1] + (b[1] - a[1]) * t; o[2] = a[2] + (b[2] - a[2]) * t; };
const NUM_KEYS: (keyof BatPose)[] = ['pelvisYaw', 'spineFwd', 'spineSide', 'chestYaw', 'frontYaw', 'backYaw', 'frontHeel', 'backHeel', 'headTurn'];
const VEC_KEYS: (keyof BatPose)[] = ['pelvis', 'front', 'back', 'H', 'D', 'F'];

function clonePose(p: BatPose): BatPose {
  return { ...p, pelvis: [...p.pelvis] as V, front: [...p.front] as V, back: [...p.back] as V, H: [...p.H] as V, D: [...p.D] as V, F: [...p.F] as V };
}
function blendPose(a: BatPose, b: BatPose, t: number, out: BatPose) {
  for (const k of NUM_KEYS) (out[k] as number) = (a[k] as number) + ((b[k] as number) - (a[k] as number)) * t;
  for (const k of VEC_KEYS) lerpV(a[k] as V, b[k] as V, t, out[k] as V);
}

const timelineCache = new Map<string, BatPose[] & { times?: number[] }>();
function resolvedTimeline(key: string): { times: number[]; poses: BatPose[] } {
  const hit = timelineCache.get(key) as unknown as { times: number[]; poses: BatPose[] } | undefined;
  if (hit) return hit;
  const [fam, ang, foot] = key.split('|');
  const keys = timeline(fam, (foot as 'f' | 'b') || 'f', Number(ang) || 0);
  const poses: BatPose[] = [];
  let prev = STANCE;
  for (const [, partial] of keys) { const p = clonePose({ ...prev, ...partial } as BatPose); poses.push(p); prev = p; }
  const res = { times: keys.map((k) => k[0]), poses };
  timelineCache.set(key, res as unknown as BatPose[]);
  return res;
}

const _tmp = clonePose(STANCE);
/** target pose for a batter at this moment */
function targetPose(anim: string, param: string, t: number): BatPose {
  if (anim !== 'swing') {
    if (param === 'lifted') return LIFTED;
    // idle stance with a gentle bat tap
    blendPose(STANCE, STANCE, 0, _tmp);
    const tap = Math.max(0, Math.sin(t * 5)) * 0.03 * (Math.sin(t * 0.7) > 0.3 ? 1 : 0);
    _tmp.H[1] = STANCE.H[1] + tap;
    return _tmp;
  }
  const key = param.includes('|') ? param : `${param}|0|f`;
  const { times, poses } = resolvedTimeline(key);
  if (t <= times[0]) return poses[0];
  for (let i = 1; i < times.length; i++) {
    if (t <= times[i]) {
      const f = ease((t - times[i - 1]) / (times[i] - times[i - 1]));
      blendPose(poses[i - 1], poses[i], f, _tmp);
      return _tmp;
    }
  }
  return poses[poses.length - 1];
}

// ---------------------------------------------------------------- IK helpers (local-space, no world matrices)
const DOWN = new THREE.Vector3(0, -1, 0);
const v1 = new THREE.Vector3(), v2 = new THREE.Vector3(), v3 = new THREE.Vector3(), v4 = new THREE.Vector3();
const q1 = new THREE.Quaternion(), q2 = new THREE.Quaternion(), qi = new THREE.Quaternion();

/** two-bone IK: upper/lower hang along -y; target & pole are in the parent space of `upper` */
export function solveTwoBone(upper: THREE.Object3D, lower: THREE.Object3D, target: THREE.Vector3, pole: THREE.Vector3, L1: number, L2: number) {
  const S = upper.position;
  const toT = v1.copy(target).sub(S);
  let d = toT.length();
  d = Math.min(Math.max(d, 0.05), L1 + L2 - 0.002);
  const dir = toT.normalize();
  const cosA = (L1 * L1 + d * d - L2 * L2) / (2 * L1 * d);
  const sinA = Math.sqrt(Math.max(0, 1 - cosA * cosA));
  const perp = v2.copy(pole).addScaledVector(dir, -pole.dot(dir)).normalize();
  const E = v3.copy(S).addScaledVector(dir, L1 * cosA).addScaledVector(perp, L1 * sinA);
  q1.setFromUnitVectors(DOWN, v4.copy(E).sub(S).normalize());
  upper.quaternion.copy(q1);
  const T = v4.copy(S).addScaledVector(dir, d);
  q2.setFromUnitVectors(DOWN, T.sub(E).normalize());
  qi.copy(q1).invert();
  lower.quaternion.copy(qi.multiply(q2));
}

const _m = new THREE.Matrix4(), _x = new THREE.Vector3(), _y = new THREE.Vector3(), _z = new THREE.Vector3();
function orientBat(bat: THREE.Object3D, H: THREE.Vector3, D: THREE.Vector3, F: THREE.Vector3) {
  _y.copy(D).normalize().negate();
  _z.copy(F).addScaledVector(_y, -F.dot(_y)).normalize();
  _x.crossVectors(_y, _z).normalize();
  _m.makeBasis(_x, _y, _z);
  bat.quaternion.setFromRotationMatrix(_m);
  bat.position.copy(H);
}

// ---------------------------------------------------------------- apply
interface BatState { pose: BatPose; w: number; quats: THREE.Quaternion[]; hipsPos: THREE.Vector3; fk: THREE.Quaternion[]; fkHips: THREE.Vector3 }
const hipsM = new THREE.Matrix4(), hipsInv = new THREE.Matrix4(), hipsQ = new THREE.Quaternion();
const tgt = new THREE.Vector3(), pole = new THREE.Vector3(), eul = new THREE.Euler();
const qa = new THREE.Quaternion(), qb = new THREE.Quaternion(), qc = new THREE.Quaternion(), qYaw = new THREE.Quaternion();
const Hv = new THREE.Vector3(), Dv = new THREE.Vector3(), Fv = new THREE.Vector3(), top = new THREE.Vector3(), bottom = new THREE.Vector3();
const UPY = new THREE.Vector3(0, 1, 0);
const ONE = new THREE.Vector3(1, 1, 1);

function bones(rig: Rig) {
  return [rig.hips, rig.spine, rig.chest, rig.head, rig.lHip, rig.lKnee, rig.lAnk, rig.rHip, rig.rKnee, rig.rAnk, rig.lSh, rig.lEl, rig.rSh, rig.rEl];
}

/** Batting pose solve. Call after the FK pose has been applied; blends in/out with weight. */
export function applyBatting(rig: Rig, batting: boolean, anim: string, param: string, t: number, dt: number) {
  const ud = rig.root.userData as { bat?: BatState };
  let st = ud.bat;
  if (!st) {
    if (!batting) return 0;
    st = ud.bat = { pose: clonePose(STANCE), w: 0, quats: bones(rig).map(() => new THREE.Quaternion()), hipsPos: new THREE.Vector3(), fk: bones(rig).map(() => new THREE.Quaternion()), fkHips: new THREE.Vector3() };
  }
  st.w += ((batting ? 1 : 0) - st.w) * Math.min(1, dt * (batting ? 9 : 6));
  if (!batting && st.w < 0.01) { st.w = 0; return 0; }
  const bs = bones(rig);
  bs.forEach((b, i) => st!.fk[i].copy(b.quaternion));
  st.fkHips.copy(rig.hips.position);
  if (batting) {
    // follow the authored pose (fast during the swing, gentle otherwise)
    const target = targetPose(anim, param, t);
    const k = 1 - Math.exp(-(anim === 'swing' ? 38 : 9) * dt);
    blendPose(st.pose, target, k, st.pose);
    const p = st.pose;
    // ---- body
    const hips = rig.hips, spine = rig.spine, head = rig.head;
    hips.position.set(p.pelvis[0], p.pelvis[1], p.pelvis[2]);
    hips.quaternion.setFromEuler(eul.set(0, p.pelvisYaw, 0));
    spine.quaternion.setFromEuler(eul.set(p.spineFwd, p.chestYaw, p.spineSide));
    rig.chest.quaternion.identity();
    // head keeps the eyes level and on the ball (towards the bowler: +x)
    head.quaternion.setFromEuler(eul.set(0.18 - p.spineFwd * 0.45, 1.3 - (p.pelvisYaw + p.chestYaw) * 0.85 + p.headTurn, p.spineSide * 0.6));
    // ---- legs: ankle targets from root space into hips space
    hipsQ.copy(hips.quaternion);
    hipsM.compose(hips.position, hipsQ, ONE);
    hipsInv.copy(hipsM).invert();
    const leg = (hip: THREE.Object3D, knee: THREE.Object3D, ank: THREE.Object3D, foot: V, yaw: number, heel: number, poleV: V) => {
      tgt.set(foot[0], foot[1] + heel, foot[2]).applyMatrix4(hipsInv);
      pole.set(poleV[0], poleV[1], poleV[2]).applyQuaternion(qi.copy(hipsQ).invert());
      solveTwoBone(hip, knee, tgt, pole, 0.45, 0.44);
      // foot: flat on the ground (toe down by heel raise), pointing along its yaw
      qc.copy(hipsQ).multiply(hip.quaternion).multiply(knee.quaternion); // knee orientation in root space
      qYaw.setFromEuler(eul.set(heel * 4, yaw, 0));
      ank.quaternion.copy(qc.invert().multiply(qYaw));
    };
    leg(rig.lHip, rig.lKnee, rig.lAnk, p.front, p.frontYaw, p.frontHeel, [0.5, 0, 1]);
    leg(rig.rHip, rig.rKnee, rig.rAnk, p.back, p.backYaw, p.backHeel, [-0.1, 0, 1]);
    // ---- bat + arms (chest space)
    if (rig.bat) {
      Hv.set(p.H[0], p.H[1], p.H[2]); Dv.set(p.D[0], p.D[1], p.D[2]).normalize(); Fv.set(p.F[0], p.F[1], p.F[2]);
      orientBat(rig.bat, Hv, Dv, Fv);
      top.copy(Hv).addScaledVector(Dv, 0.05);
      bottom.copy(Hv).addScaledVector(Dv, 0.17);
      solveTwoBone(rig.lSh, rig.lEl, top, pole.set(0.6, -0.4, -0.6), 0.3, 0.31);
      solveTwoBone(rig.rSh, rig.rEl, bottom, pole.set(-0.7, -0.5, -0.2), 0.3, 0.31);
    }
    bs.forEach((b, i) => st!.quats[i].copy(b.quaternion));
    st.hipsPos.copy(hips.position);
  }
  // final = FK pose blended towards the batting pose by weight (smooth in and out)
  const w = st.w;
  bs.forEach((b, i) => b.quaternion.copy(st!.fk[i]).slerp(st!.quats[i], w));
  rig.hips.position.copy(st.fkHips).lerp(st.hipsPos, w);
  return st.w;
}

export { UPY };
