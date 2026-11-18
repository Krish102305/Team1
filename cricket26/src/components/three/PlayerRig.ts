import * as THREE from 'three';
import type { Actor } from '../../game/GameEngine';
import type { AnimFamily } from '../../data/shots';
import { SWING_LEAD } from '../../game/constants';

// ---------------------------------------------------------------- shared resources
const geoCache = new Map<string, THREE.BufferGeometry>();
const matCache = new Map<string, THREE.Material>();

function geo(key: string, make: () => THREE.BufferGeometry) {
  let g = geoCache.get(key);
  if (!g) { g = make(); geoCache.set(key, g); }
  return g;
}
export function mat(color: string, opts: { rough?: number; metal?: number; emissive?: string } = {}) {
  const key = `${color}|${opts.rough ?? 0.75}|${opts.metal ?? 0}|${opts.emissive ?? ''}`;
  let m = matCache.get(key);
  if (!m) {
    m = new THREE.MeshStandardMaterial({ color, roughness: opts.rough ?? 0.75, metalness: opts.metal ?? 0, emissive: opts.emissive ?? '#000000' });
    matCache.set(key, m);
  }
  return m;
}

const capsule = (r: number, l: number) => geo(`cap${r}-${l}`, () => new THREE.CapsuleGeometry(r, l, 4, 10));
const sphere = (r: number) => geo(`sph${r}`, () => new THREE.SphereGeometry(r, 16, 12));
const box = (x: number, y: number, z: number) => geo(`box${x}-${y}-${z}`, () => new THREE.BoxGeometry(x, y, z));
const cyl = (r1: number, r2: number, h: number, s = 12) => geo(`cyl${r1}-${r2}-${h}-${s}`, () => new THREE.CylinderGeometry(r1, r2, h, s));

function mesh(g: THREE.BufferGeometry, m: THREE.Material, x = 0, y = 0, z = 0, cast = true) {
  const o = new THREE.Mesh(g, m);
  o.position.set(x, y, z);
  o.castShadow = cast;
  return o;
}

export function makeBat(): THREE.Group {
  const g = new THREE.Group();
  const handle = mesh(cyl(0.017, 0.017, 0.3), mat('#202020', { rough: 0.9 }), 0, -0.15, 0);
  const grip = mesh(cyl(0.019, 0.019, 0.2), mat('#c81e2a', { rough: 0.9 }), 0, -0.12, 0);
  const blade = mesh(box(0.108, 0.56, 0.04), mat('#e8cf98', { rough: 0.6 }), 0, -0.58, -0.005);
  const spine = mesh(box(0.05, 0.5, 0.03), mat('#dcc184', { rough: 0.6 }), 0, -0.6, -0.025);
  const sticker = mesh(box(0.09, 0.12, 0.002), mat('#1d4fa3'), 0, -0.42, 0.016, false);
  g.add(handle, grip, blade, spine, sticker);
  return g;
}

// ---------------------------------------------------------------- rig
export interface Rig {
  root: THREE.Group;     // positioned in world (inside mirror group)
  mirror: THREE.Group;
  hips: THREE.Group;
  spine: THREE.Group;
  chest: THREE.Group;
  head: THREE.Group;
  lSh: THREE.Group; lEl: THREE.Group; rSh: THREE.Group; rEl: THREE.Group;
  lHand: THREE.Group; rHand: THREE.Group;
  lHip: THREE.Group; lKnee: THREE.Group; rHip: THREE.Group; rKnee: THREE.Group;
  lAnk: THREE.Group; rAnk: THREE.Group;
  bat: THREE.Group | null;
  batMode: 'hands' | 'carry' | 'none';
  ball: THREE.Mesh | null;
  pose: Float32Array;
  kind: 'fielder' | 'batter' | 'umpire' | 'keeper';
}

// pose channel indices
const P = {
  hipsY: 0, hipsX: 1, hipsY_rot: 2, hipsZ: 3, spineX: 4, spineY: 5, spineZ: 6, headX: 7, headY: 8,
  lShX: 9, lShY: 10, lShZ: 11, lEl: 12, rShX: 13, rShY: 14, rShZ: 15, rEl: 16,
  lHipX: 17, lHipZ: 18, lKnee: 19, rHipX: 20, rHipZ: 21, rKnee: 22, lAnk: 23, rAnk: 24, rootY: 25, rootZ: 26,
} as const;
const NP = 27;

export interface RigLook { jersey: string; pants: string; accent: string; skin: string; hair: string; kind: Rig['kind']; helmet: boolean }

export function buildRig(look: RigLook): Rig {
  const mirror = new THREE.Group();
  const root = new THREE.Group();
  mirror.add(root);
  const jersey = mat(look.jersey, { rough: 0.8 });
  const pants = mat(look.pants, { rough: 0.85 });
  const skin = mat(look.skin, { rough: 0.7 });
  const shoe = mat('#f4f4f4', { rough: 0.6 });
  const accent = mat(look.accent, { rough: 0.6 });
  const umpire = look.kind === 'umpire';
  const shirt = umpire ? mat('#cfe3ff', { rough: 0.85 }) : jersey;
  const trousers = umpire ? mat('#1f2533', { rough: 0.85 }) : pants;

  const hips = new THREE.Group(); hips.position.y = 0.98; root.add(hips);
  hips.add(mesh(box(0.32, 0.18, 0.2), trousers, 0, 0, 0));
  const spine = new THREE.Group(); spine.position.y = 0.08; hips.add(spine);
  spine.add(mesh(capsule(0.155, 0.28), shirt, 0, 0.22, 0));
  if (!umpire) spine.add(mesh(box(0.27, 0.06, 0.012), accent, 0, 0.32, 0.153, false)); // chest band
  else spine.add(mesh(box(0.34, 0.5, 0.23), mat('#f2f2f2', { rough: 0.9 }), 0, 0.2, 0)); // umpire coat
  const chest = new THREE.Group(); chest.position.y = 0.42; spine.add(chest);
  const head = new THREE.Group(); head.position.y = 0.08; chest.add(head);
  head.add(mesh(cyl(0.05, 0.055, 0.1), skin, 0, 0.03, 0));
  head.add(mesh(sphere(0.105), skin, 0, 0.17, 0.01));
  head.add(mesh(box(0.05, 0.025, 0.02), skin, 0, 0.16, 0.115, false)); // nose
  if (look.helmet) {
    const helm = new THREE.Mesh(geo('helmet', () => new THREE.SphereGeometry(0.128, 16, 10, 0, Math.PI * 2, 0, Math.PI * 0.58)), mat(look.accent, { rough: 0.35, metal: 0.1 }));
    helm.position.set(0, 0.19, 0); helm.castShadow = true; head.add(helm);
    head.add(mesh(box(0.2, 0.012, 0.09), mat(look.accent, { rough: 0.35 }), 0, 0.2, 0.1)); // peak
    const grille = new THREE.Mesh(geo('grille', () => new THREE.TorusGeometry(0.12, 0.006, 4, 16, Math.PI)), mat('#9aa0a6', { metal: 0.8, rough: 0.3 }));
    grille.position.set(0, 0.15, 0.02); grille.rotation.set(Math.PI / 2 + 0.25, 0, 0); head.add(grille);
    const g2 = grille.clone(); g2.position.y = 0.11; g2.scale.setScalar(0.92); head.add(g2);
  } else if (umpire) {
    head.add(mesh(cyl(0.2, 0.2, 0.012, 20), mat('#f5f5f0'), 0, 0.235, 0));
    head.add(mesh(cyl(0.1, 0.11, 0.09, 16), mat('#f5f5f0'), 0, 0.28, 0));
  } else {
    // hair / cap
    const cap = Math.random() < 0.5;
    head.add(mesh(geo('hair', () => new THREE.SphereGeometry(0.11, 14, 8, 0, Math.PI * 2, 0, Math.PI * 0.5)), cap ? accent : mat(look.hair, { rough: 0.95 }), 0, 0.185, 0));
    if (cap) head.add(mesh(box(0.16, 0.012, 0.1), accent, 0, 0.21, 0.1));
  }

  const arm = (side: 1 | -1) => {
    const sh = new THREE.Group(); sh.position.set(0.2 * side, -0.02, 0); chest.add(sh);
    sh.add(mesh(sphere(0.06), shirt, 0, 0, 0));
    sh.add(mesh(capsule(0.05, 0.2), umpire ? mat('#f2f2f2') : shirt, 0, -0.15, 0));
    const el = new THREE.Group(); el.position.y = -0.3; sh.add(el);
    el.add(mesh(capsule(0.043, 0.2), skin, 0, -0.13, 0));
    const hand = new THREE.Group(); hand.position.y = -0.28; el.add(hand);
    const glove = look.kind === 'keeper' ? mat('#f0f0f0', { rough: 0.7 }) : look.helmet ? mat('#ffffff', { rough: 0.8 }) : skin;
    hand.add(mesh(look.kind === 'keeper' ? box(0.1, 0.13, 0.08) : look.helmet ? box(0.075, 0.1, 0.07) : sphere(0.045), glove, 0, -0.03, 0));
    if (look.helmet) hand.add(mesh(box(0.077, 0.03, 0.072), accent, 0, 0.02, 0, false));
    return { sh, el, hand };
  };
  const L = arm(1), R = arm(-1);

  const leg = (side: 1 | -1) => {
    const hip = new THREE.Group(); hip.position.set(0.1 * side, -0.04, 0); hips.add(hip);
    hip.add(mesh(capsule(0.075, 0.28), trousers, 0, -0.22, 0));
    const knee = new THREE.Group(); knee.position.y = -0.45; hip.add(knee);
    knee.add(mesh(capsule(0.058, 0.3), trousers, 0, -0.21, 0));
    if (look.helmet || look.kind === 'keeper') {
      const padM = mat('#fbfbfb', { rough: 0.8 });
      knee.add(mesh(box(0.15, 0.5, 0.1), padM, 0, -0.2, 0.05));
      knee.add(mesh(box(0.16, 0.03, 0.11), accent, 0, -0.02, 0.06, false));
    }
    const ank = new THREE.Group(); ank.position.y = -0.44; knee.add(ank);
    ank.add(mesh(box(0.1, 0.07, 0.26), shoe, 0, -0.035, 0.05));
    return { hip, knee, ank };
  };
  const Lg = leg(1), Rg = leg(-1);

  const rig: Rig = {
    root, mirror, hips, spine, chest, head, lSh: L.sh, lEl: L.el, rSh: R.sh, rEl: R.el, lHand: L.hand, rHand: R.hand,
    lHip: Lg.hip, lKnee: Lg.knee, rHip: Rg.hip, rKnee: Rg.knee, lAnk: Lg.ank, rAnk: Rg.ank,
    bat: null, batMode: 'none', ball: null, pose: new Float32Array(NP), kind: look.kind,
  };
  if (look.helmet) { rig.bat = makeBat(); setBatMode(rig, 'carry'); }
  const ball = mesh(sphere(0.04), mat('#d8d8d8'), 0, -0.07, 0.03, false);
  ball.visible = false;
  R.hand.add(ball);
  rig.ball = ball;
  return rig;
}

function setBatMode(rig: Rig, mode: Rig['batMode']) {
  if (!rig.bat || rig.batMode === mode) return;
  rig.batMode = mode;
  rig.bat.removeFromParent();
  if (mode === 'carry') {
    rig.rHand.add(rig.bat);
    rig.bat.position.set(0, -0.02, 0.02);
    rig.bat.rotation.set(-0.55, 0, 0.1);
  } else if (mode === 'hands') {
    rig.chest.add(rig.bat);
  }
}

// ---------------------------------------------------------------- IK helpers
const _v1 = new THREE.Vector3(), _v2 = new THREE.Vector3(), _v3 = new THREE.Vector3(), _v4 = new THREE.Vector3();
const _q1 = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _qi = new THREE.Quaternion();
const DOWN = new THREE.Vector3(0, -1, 0);
const UPPER = 0.3, LOWER = 0.31;

function solveArm(sh: THREE.Group, el: THREE.Group, target: THREE.Vector3, pole: THREE.Vector3) {
  const S = sh.position;
  const toT = _v1.copy(target).sub(S);
  let d = toT.length();
  d = Math.min(Math.max(d, 0.08), UPPER + LOWER - 0.002);
  const dir = toT.normalize();
  const cosA = (UPPER * UPPER + d * d - LOWER * LOWER) / (2 * UPPER * d);
  const sinA = Math.sqrt(Math.max(0, 1 - cosA * cosA));
  const perp = _v2.copy(pole).addScaledVector(dir, -pole.dot(dir)).normalize();
  const E = _v3.copy(S).addScaledVector(dir, UPPER * cosA).addScaledVector(perp, UPPER * sinA);
  const u1 = _v4.copy(E).sub(S).normalize();
  _q1.setFromUnitVectors(DOWN, u1);
  sh.quaternion.copy(_q1);
  const T = _v2.copy(S).addScaledVector(dir, d);
  const u2 = T.sub(E).normalize();
  _q2.setFromUnitVectors(DOWN, u2);
  _qi.copy(_q1).invert();
  el.quaternion.copy(_qi.multiply(_q2));
}

const _m = new THREE.Matrix4(), _x = new THREE.Vector3(), _y = new THREE.Vector3(), _z = new THREE.Vector3();
function orientBat(bat: THREE.Group, H: THREE.Vector3, D: THREE.Vector3, F: THREE.Vector3) {
  _y.copy(D).normalize().negate();
  _z.copy(F).addScaledVector(_y, -F.dot(_y)).normalize();
  _x.crossVectors(_y, _z).normalize();
  _m.makeBasis(_x, _y, _z);
  bat.quaternion.setFromRotationMatrix(_m);
  bat.position.copy(H);
}

// ---------------------------------------------------------------- batting keyframes (chest-local, right-hander)
type V = [number, number, number];
interface BatKey { H: V; D: V; F: V; twist: number; lean: number; kneel: number; stride: number }
const STANCE: BatKey = { H: [0.02, -0.34, 0.27], D: [-0.25, -1, 0.06], F: [1, 0, 0.25], twist: 0, lean: 0.35, kneel: 0, stride: 0 };
const BACKLIFT: BatKey = { H: [-0.12, 0.02, 0.22], D: [-0.55, 0.7, -0.15], F: [0.3, 0.2, 1], twist: -0.2, lean: 0.3, kneel: 0, stride: 0.1 };
const FAM: Record<AnimFamily, { contact: BatKey; finish: BatKey; back?: BatKey }> = {
  drive: {
    contact: { H: [0.24, -0.3, 0.32], D: [0.25, -1, 0.05], F: [1, 0, 0.3], twist: 0.25, lean: 0.55, kneel: 0, stride: 1 },
    finish: { H: [0.18, 0.32, 0.18], D: [-0.45, 0.8, -0.3], F: [0, 1, 0.3], twist: 0.5, lean: 0.35, kneel: 0, stride: 1 },
  },
  loft: {
    contact: { H: [0.22, -0.22, 0.32], D: [0.4, -0.95, 0.05], F: [1, 0.3, 0.3], twist: 0.3, lean: 0.4, kneel: 0, stride: 1 },
    finish: { H: [0.05, 0.48, 0.02], D: [-0.6, 0.55, -0.55], F: [0, 1, 0], twist: 0.7, lean: 0.1, kneel: 0, stride: 1 },
  },
  slog: {
    contact: { H: [0.15, -0.12, 0.32], D: [0.6, -0.65, -0.45], F: [1, 0.2, -0.4], twist: 0.6, lean: 0.25, kneel: 0, stride: 0.8 },
    finish: { H: [0.15, 0.4, -0.12], D: [-0.5, 0.45, -0.75], F: [0, 1, 0], twist: 1.0, lean: 0.1, kneel: 0, stride: 0.8 },
  },
  cut: {
    back: { H: [-0.05, 0.25, 0.3], D: [-0.3, 0.9, 0.3], F: [0, 0, 1], twist: -0.1, lean: 0.25, kneel: 0, stride: -0.6 },
    contact: { H: [0.06, -0.05, 0.45], D: [0.25, -0.25, 1], F: [0.3, -1, 0], twist: -0.35, lean: 0.35, kneel: 0, stride: -0.6 },
    finish: { H: [-0.12, 0.12, 0.38], D: [-0.65, 0.1, 0.75], F: [0, -1, 0], twist: -0.6, lean: 0.3, kneel: 0, stride: -0.6 },
  },
  pull: {
    back: { H: [-0.1, 0.2, 0.25], D: [-0.5, 0.75, 0.3], F: [0, 0, 1], twist: -0.1, lean: 0.2, kneel: 0, stride: -0.6 },
    contact: { H: [0.18, 0.02, 0.3], D: [0.35, -0.1, -1], F: [1, 0, 0], twist: 0.6, lean: 0.2, kneel: 0, stride: -0.6 },
    finish: { H: [0.0, 0.28, -0.22], D: [-0.6, 0.4, -0.7], F: [0, 1, 0], twist: 1.0, lean: 0.15, kneel: 0, stride: -0.6 },
  },
  sweep: {
    contact: { H: [0.28, -0.42, 0.22], D: [0.35, -0.45, -0.85], F: [1, -0.3, 0], twist: 0.5, lean: 0.75, kneel: 1, stride: 1 },
    finish: { H: [0.05, -0.2, -0.22], D: [-0.4, 0.1, -0.9], F: [0, 1, 0], twist: 0.9, lean: 0.6, kneel: 1, stride: 1 },
  },
  reverse: {
    contact: { H: [0.28, -0.42, 0.18], D: [0.35, -0.45, 0.85], F: [1, 0, 0], twist: -0.3, lean: 0.75, kneel: 1, stride: 1 },
    finish: { H: [0.05, -0.2, 0.3], D: [-0.3, 0.1, 0.95], F: [0, 1, 0], twist: -0.6, lean: 0.6, kneel: 1, stride: 1 },
  },
  glance: {
    contact: { H: [0.24, -0.3, 0.24], D: [0.15, -1, -0.3], F: [0.4, 0, -1], twist: 0.3, lean: 0.4, kneel: 0, stride: 0.5 },
    finish: { H: [0.12, -0.05, 0.05], D: [-0.25, -0.55, -0.8], F: [0, 0, -1], twist: 0.6, lean: 0.35, kneel: 0, stride: 0.5 },
  },
  defend: {
    contact: { H: [0.3, -0.32, 0.3], D: [0.18, -1, 0.02], F: [1, 0, 0.1], twist: 0.15, lean: 0.6, kneel: 0, stride: 1 },
    finish: { H: [0.3, -0.3, 0.3], D: [0.15, -1, 0.02], F: [1, 0, 0.1], twist: 0.15, lean: 0.6, kneel: 0, stride: 1 },
  },
  defendBack: {
    contact: { H: [0.12, -0.14, 0.32], D: [0.05, -1, 0], F: [1, 0, 0], twist: 0.05, lean: 0.25, kneel: 0, stride: -0.6 },
    finish: { H: [0.12, -0.14, 0.32], D: [0.05, -1, 0], F: [1, 0, 0], twist: 0.05, lean: 0.25, kneel: 0, stride: -0.6 },
  },
  scoop: {
    contact: { H: [0.26, -0.36, 0.3], D: [0.9, -0.4, 0.1], F: [0, 1, 0], twist: 0.1, lean: 0.7, kneel: 0.7, stride: 1 },
    finish: { H: [0.2, -0.1, 0.25], D: [0.55, 0.55, 0], F: [-1, 0.5, 0], twist: 0.1, lean: 0.5, kneel: 0.7, stride: 1 },
  },
  leave: {
    contact: { H: [-0.05, 0.38, 0.12], D: [-0.25, 0.95, 0.15], F: [0, 0, 1], twist: -0.2, lean: 0.15, kneel: 0, stride: 0.4 },
    finish: { H: [-0.05, 0.38, 0.12], D: [-0.25, 0.95, 0.15], F: [0, 0, 1], twist: -0.2, lean: 0.15, kneel: 0, stride: 0.4 },
  },
};

const SWING_TOTAL = 0.75;
const _H = new THREE.Vector3(), _D = new THREE.Vector3(), _F = new THREE.Vector3(), _H2 = new THREE.Vector3(), _D2 = new THREE.Vector3(), _F2 = new THREE.Vector3();
const ease = (t: number) => t * t * (3 - 2 * t);

function lerpKey(a: BatKey, b: BatKey, t: number, out: BatKey) {
  const e = ease(Math.min(1, Math.max(0, t)));
  for (let i = 0; i < 3; i++) { out.H[i] = a.H[i] + (b.H[i] - a.H[i]) * e; out.D[i] = a.D[i] + (b.D[i] - a.D[i]) * e; out.F[i] = a.F[i] + (b.F[i] - a.F[i]) * e; }
  out.twist = a.twist + (b.twist - a.twist) * e; out.lean = a.lean + (b.lean - a.lean) * e;
  out.kneel = a.kneel + (b.kneel - a.kneel) * e; out.stride = a.stride + (b.stride - a.stride) * e;
}
const _k: BatKey = { H: [0, 0, 0], D: [0, 0, 0], F: [0, 0, 0], twist: 0, lean: 0, kneel: 0, stride: 0 };

function batKey(anim: string, fam: string, t: number): BatKey {
  if (anim !== 'swing') return STANCE;
  const f = FAM[(fam as AnimFamily)] ?? FAM.drive;
  const back = f.back ?? BACKLIFT;
  const tc = SWING_LEAD;
  if (t < tc * 0.45) lerpKey(STANCE, back, t / (tc * 0.45), _k);
  else if (t < tc) lerpKey(back, f.contact, (t - tc * 0.45) / (tc * 0.55), _k);
  else if (t < SWING_TOTAL) lerpKey(f.contact, f.finish, (t - tc) / (SWING_TOTAL - tc), _k);
  else lerpKey(f.finish, STANCE, Math.min(1, (t - SWING_TOTAL - 0.4) / 0.5), _k);
  return _k;
}

// ---------------------------------------------------------------- pose generation
const target = new Float32Array(NP);

function locomotion(t: number, speed: number, carry: boolean) {
  const run = speed > 3;
  const freq = run ? 1.45 + speed * 0.06 : 0.85 + speed * 0.35;
  const ph = t * freq * Math.PI * 2;
  const amp = run ? 0.75 : 0.35 + speed * 0.06;
  target[P.lHipX] = -Math.sin(ph) * amp;
  target[P.rHipX] = Math.sin(ph) * amp;
  target[P.lKnee] = Math.max(0, Math.sin(ph + 1.4)) * (run ? 1.35 : 0.55) + 0.08;
  target[P.rKnee] = Math.max(0, Math.sin(ph + 1.4 + Math.PI)) * (run ? 1.35 : 0.55) + 0.08;
  target[P.lShX] = Math.sin(ph) * amp * 0.8;
  target[P.rShX] = carry ? -0.3 - Math.sin(ph) * 0.2 : -Math.sin(ph) * amp * 0.8;
  target[P.lEl] = run ? -1.3 : -0.35;
  target[P.rEl] = carry ? -0.9 : run ? -1.3 : -0.35;
  target[P.spineX] = run ? 0.22 : 0.05;
  target[P.hipsY] = -Math.abs(Math.cos(ph)) * (run ? 0.06 : 0.02);
  target[P.lShZ] = 0.08; target[P.rShZ] = -0.08;
}

function generatePose(a: Pick<Actor, 'anim' | 'animT' | 'animP' | 'animSide' | 'moveSpeed'>, kind: Rig['kind']) {
  target.fill(0);
  const t = a.animT;
  target[P.lShZ] = 0.08; target[P.rShZ] = -0.08; target[P.lEl] = -0.15; target[P.rEl] = -0.15;
  switch (a.anim) {
    case 'idle': {
      const b = Math.sin(t * 1.6) * 0.02;
      target[P.spineX] = 0.03 + b; target[P.lEl] = -0.2; target[P.rEl] = -0.2;
      if (kind === 'umpire') { target[P.lShX] = -0.35; target[P.rShX] = -0.35; target[P.lEl] = -1.2; target[P.rEl] = -1.2; target[P.lShZ] = -0.25; target[P.rShZ] = 0.25; }
      break;
    }
    case 'umpire':
      target[P.lShX] = -0.35; target[P.rShX] = -0.35; target[P.lEl] = -1.25; target[P.rEl] = -1.25; target[P.lShZ] = -0.28; target[P.rShZ] = 0.28;
      target[P.spineX] = 0.08 + Math.sin(t) * 0.01; target[P.lHipZ] = 0.06; target[P.rHipZ] = -0.06;
      break;
    case 'walk': case 'walkBat': locomotion(t, Math.max(1, a.moveSpeed), a.anim === 'walkBat'); break;
    case 'run': case 'runBat': case 'bowlRun': locomotion(t, Math.max(3.5, a.moveSpeed), a.anim === 'runBat'); if (a.anim === 'bowlRun') { target[P.rShX] = -0.8; target[P.rEl] = -1.4; } break;
    case 'ready': {
      target[P.hipsY] = -0.12; target[P.lHipX] = -0.55; target[P.rHipX] = -0.55; target[P.lKnee] = 0.9; target[P.rKnee] = 0.9;
      target[P.lAnk] = -0.35; target[P.rAnk] = -0.35;
      target[P.spineX] = 0.55; target[P.lShX] = -0.75; target[P.rShX] = -0.75; target[P.lEl] = -0.5; target[P.rEl] = -0.5;
      target[P.lHipZ] = 0.18; target[P.rHipZ] = -0.18; target[P.headX] = -0.4;
      break;
    }
    case 'keeper': {
      target[P.hipsY] = -0.5; target[P.lHipX] = -1.55; target[P.rHipX] = -1.55; target[P.lKnee] = 2.1; target[P.rKnee] = 2.1;
      target[P.lAnk] = -0.55; target[P.rAnk] = -0.55; target[P.lHipZ] = 0.35; target[P.rHipZ] = -0.35;
      target[P.spineX] = 0.5; target[P.lShX] = -1.05; target[P.rShX] = -1.05; target[P.lEl] = -0.35; target[P.rEl] = -0.35;
      target[P.lShZ] = -0.2; target[P.rShZ] = 0.2; target[P.headX] = -0.45;
      break;
    }
    case 'bowlDeliver': {
      const p = Math.min(1, t / 0.62);
      // gather -> windmill -> follow through
      const arm = p < 0.25 ? 0.6 - p * 4 * 1.4 : p < 0.6 ? -0.8 - ((p - 0.25) / 0.35) * 2.6 : -3.4 - ((p - 0.6) / 0.4) * 1.6;
      target[P.rShX] = arm; target[P.rEl] = -0.05;
      target[P.lShX] = p < 0.45 ? -2.7 : -2.7 + (p - 0.45) * 5; target[P.lEl] = -0.1; target[P.lShZ] = 0.3;
      target[P.spineX] = p < 0.45 ? -0.35 : -0.35 + (p - 0.45) * 2.2;
      target[P.spineY] = p < 0.45 ? 0.5 : 0.5 - (p - 0.45) * 2;
      target[P.lHipX] = p < 0.5 ? -0.9 : -0.6; target[P.lKnee] = 0.15;
      target[P.rHipX] = p < 0.4 ? 0.5 : -0.4 - (p - 0.4); target[P.rKnee] = p < 0.6 ? 0.6 : 1.2;
      target[P.rootY] = p < 0.35 ? Math.sin((p / 0.35) * Math.PI) * 0.25 : 0;
      break;
    }
    case 'dive': {
      const p = Math.min(1, t / 0.28);
      const s = a.animSide;
      target[P.rootZ] = -s * 1.35 * p; target[P.hipsY] = -0.55 * p;
      target[P.lShZ] = 2.8 * p; target[P.rShZ] = -2.8 * p; target[P.lEl] = -0.1; target[P.rEl] = -0.1;
      target[P.lHipZ] = 0.2; target[P.rHipZ] = -0.2; target[P.lKnee] = 0.4; target[P.rKnee] = 0.4;
      break;
    }
    case 'catch': case 'pickup': {
      if (a.anim === 'catch') {
        target[P.lShX] = -2.2; target[P.rShX] = -2.2; target[P.lEl] = -0.5; target[P.rEl] = -0.5; target[P.lShZ] = -0.1; target[P.rShZ] = 0.1;
        target[P.spineX] = -0.05; target[P.headX] = -0.3;
      } else {
        const p = Math.min(1, t / 0.25);
        target[P.spineX] = 1.0 * p; target[P.lHipX] = -0.8 * p; target[P.rHipX] = -0.1; target[P.lKnee] = 1.1 * p; target[P.rKnee] = 0.4;
        target[P.rShX] = -1.4 * p; target[P.lShX] = -0.6; target[P.hipsY] = -0.25 * p;
      }
      break;
    }
    case 'throw': {
      const p = Math.min(1, t / 0.45);
      target[P.rShX] = p < 0.55 ? 0.4 + p * 3.4 : 2.3 - (p - 0.55) * 8;
      target[P.rShZ] = -0.5; target[P.rEl] = p < 0.55 ? -1.4 : -0.2;
      target[P.lShX] = -1.4; target[P.lShZ] = 0.3;
      target[P.spineY] = p < 0.55 ? 0.6 : 0.6 - (p - 0.55) * 3; target[P.spineX] = p < 0.55 ? -0.1 : 0.4;
      target[P.lHipX] = -0.6; target[P.lKnee] = 0.3; target[P.rHipX] = 0.3; target[P.rKnee] = 0.5;
      break;
    }
    case 'celebrate': case 'appeal': {
      const jump = Math.abs(Math.sin(t * 7)) * (a.anim === 'appeal' ? 0.08 : 0.22);
      target[P.rootY] = jump;
      if (a.anim === 'appeal') { target[P.lShX] = -2.6; target[P.rShX] = -2.9; target[P.spineX] = 0.15; target[P.lEl] = -0.3; }
      else { target[P.lShZ] = 2.6 + Math.sin(t * 9) * 0.3; target[P.rShZ] = -2.6 - Math.sin(t * 9) * 0.3; target[P.lEl] = -0.3; target[P.rEl] = -0.3; target[P.spineX] = -0.15; }
      target[P.lKnee] = jump * 3; target[P.rKnee] = jump * 3; target[P.lHipX] = -jump * 2; target[P.rHipX] = -jump * 2;
      break;
    }
    case 'breakStumps':
      target[P.spineX] = 0.9; target[P.lShX] = -1.2; target[P.rShX] = -1.5 + Math.min(1, t / 0.2) * 0.8; target[P.hipsY] = -0.25; target[P.lKnee] = 0.8; target[P.rKnee] = 0.8; target[P.lHipX] = -0.6; target[P.rHipX] = -0.6;
      break;
    case 'signalOut': target[P.rShX] = -3.05; target[P.rEl] = 0; target[P.lShX] = -0.2; break;
    case 'signalFour': target[P.rShZ] = -1.4; target[P.rShX] = -0.6 + Math.sin(t * 7) * 0.7; target[P.rEl] = -0.1; break;
    case 'signalSix': target[P.lShZ] = 2.95; target[P.rShZ] = -2.95; target[P.lEl] = 0; target[P.rEl] = 0; break;
    case 'signalWide': target[P.lShZ] = 1.55; target[P.rShZ] = -1.55; target[P.lEl] = 0; target[P.rEl] = 0; break;
    case 'signalNoBall': target[P.rShZ] = -1.55; target[P.rEl] = 0; target[P.lShX] = -0.3; target[P.lEl] = -1.2; break;
    case 'batRaise': target[P.rShX] = -2.8; target[P.rEl] = -0.2; target[P.lShZ] = 0.9; target[P.spineX] = -0.1; break;
    case 'dejected': target[P.headX] = 0.55; target[P.spineX] = 0.2; target[P.rShX] = 0.1; target[P.lShX] = 0.1; break;
    case 'stance': case 'swing': {
      // lower body for batters; arms by IK
      const k = batKey(a.anim, a.animP, t);
      target[P.hipsY] = -0.08 - k.kneel * 0.42;
      target[P.lHipX] = -0.25 - Math.max(0, k.stride) * 0.15 - k.kneel * 1.0; target[P.rHipX] = -0.25 + k.kneel * 0.6;
      target[P.lKnee] = 0.42 + Math.max(0, k.stride) * 0.35 + k.kneel * 0.9; target[P.rKnee] = 0.42 + k.kneel * 1.7;
      target[P.lHipZ] = 0.22 + Math.max(0, k.stride) * 0.32; target[P.rHipZ] = -0.2 + Math.min(0, k.stride) * 0.25;
      target[P.spineX] = k.lean; target[P.spineY] = k.twist; target[P.hipsY_rot] = k.twist * 0.4;
      target[P.headY] = 1.25 - k.twist * 0.8; target[P.headX] = 0.15;
      break;
    }
    default: break;
  }
}

/** Apply an actor's state to its rig. dt is used for smooth blending between poses. */
export function applyActor(rig: Rig, a: Pick<Actor, 'x' | 'y' | 'z' | 'rotY' | 'anim' | 'animT' | 'animP' | 'animSide' | 'moveSpeed' | 'holdsBall' | 'visible' | 'mirror'>, dt: number) {
  rig.mirror.visible = a.visible;
  if (!a.visible) return;
  const m = a.mirror < 0 ? -1 : 1;
  rig.mirror.scale.x = m;
  rig.root.position.set(a.x * m, 0, a.z);
  rig.root.rotation.y = a.rotY * m;
  generatePose(a, rig.kind);
  const pose = rig.pose;
  const fast = a.anim === 'swing' || a.anim === 'bowlDeliver' || a.anim === 'throw' || a.anim === 'dive' || a.anim === 'signalOut';
  const k = 1 - Math.exp(-(fast ? 40 : 14) * dt);
  for (let i = 0; i < NP; i++) pose[i] += (target[i] - pose[i]) * k;
  rig.root.position.y = pose[P.rootY];
  rig.root.rotation.z = pose[P.rootZ];
  rig.hips.position.y = 0.98 + pose[P.hipsY];
  rig.hips.rotation.set(pose[P.hipsX], pose[P.hipsY_rot], pose[P.hipsZ]);
  rig.spine.rotation.set(pose[P.spineX], pose[P.spineY], pose[P.spineZ]);
  rig.head.rotation.set(pose[P.headX], pose[P.headY], 0);
  rig.lHip.rotation.set(pose[P.lHipX], 0, pose[P.lHipZ]);
  rig.rHip.rotation.set(pose[P.rHipX], 0, pose[P.rHipZ]);
  rig.lKnee.rotation.set(pose[P.lKnee], 0, 0);
  rig.rKnee.rotation.set(pose[P.rKnee], 0, 0);
  rig.lAnk.rotation.set(pose[P.lAnk] - pose[P.lKnee] * 0.3 - pose[P.lHipX] * 0.2, 0, 0);
  rig.rAnk.rotation.set(pose[P.rAnk] - pose[P.rKnee] * 0.3 - pose[P.rHipX] * 0.2, 0, 0);
  const batting = (a.anim === 'stance' || a.anim === 'swing') && rig.bat;
  if (batting) {
    setBatMode(rig, 'hands');
    const key = batKey(a.anim, a.animP, a.animT);
    _H.set(key.H[0], key.H[1], key.H[2]); _D.set(key.D[0], key.D[1], key.D[2]).normalize(); _F.set(key.F[0], key.F[1], key.F[2]);
    // smooth bat motion
    const ud = rig.bat!.userData as { H?: THREE.Vector3; D?: THREE.Vector3; F?: THREE.Vector3 };
    if (!ud.H) { ud.H = _H.clone(); ud.D = _D.clone(); ud.F = _F.clone(); }
    const kb = 1 - Math.exp(-(a.anim === 'swing' ? 60 : 12) * dt);
    ud.H.lerp(_H, kb); ud.D!.lerp(_D, kb).normalize(); ud.F!.lerp(_F, kb);
    orientBat(rig.bat!, ud.H, ud.D!, ud.F!);
    _H2.copy(ud.H).addScaledVector(ud.D!, 0.05);
    _D2.copy(ud.H).addScaledVector(ud.D!, 0.17);
    solveArm(rig.lSh, rig.lEl, _H2, _F2.set(0.6, -0.4, -0.6));
    solveArm(rig.rSh, rig.rEl, _D2, _F2.set(-0.7, -0.5, -0.2));
  } else {
    if (rig.bat) {
      setBatMode(rig, 'carry');
      (rig.bat.userData as { H?: THREE.Vector3 }).H = undefined;
    }
    rig.lSh.rotation.set(pose[P.lShX], pose[P.lShY], pose[P.lShZ]);
    rig.rSh.rotation.set(pose[P.rShX], pose[P.rShY], pose[P.rShZ]);
    rig.lEl.rotation.set(pose[P.lEl], 0, 0);
    rig.rEl.rotation.set(pose[P.rEl], 0, 0);
  }
  if (rig.ball) rig.ball.visible = a.holdsBall;
}
