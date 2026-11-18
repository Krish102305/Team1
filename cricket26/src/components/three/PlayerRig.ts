import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
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
  const handle = mesh(cyl(0.016, 0.018, 0.3, 10), mat('#202020', { rough: 0.9 }), 0, -0.15, 0);
  const grip = mesh(cyl(0.02, 0.02, 0.21, 12), mat('#c81e2a', { rough: 0.95 }), 0, -0.12, 0);
  const bladeGeo = geo('blade', () => {
    const sh = new THREE.Shape();
    sh.moveTo(-0.054, 0); sh.lineTo(0.054, 0); sh.lineTo(0.054, -0.52); sh.quadraticCurveTo(0.054, -0.56, 0.04, -0.56); sh.lineTo(-0.04, -0.56); sh.quadraticCurveTo(-0.054, -0.56, -0.054, -0.52); sh.lineTo(-0.054, 0);
    const e = new THREE.ExtrudeGeometry(sh, { depth: 0.022, bevelEnabled: true, bevelThickness: 0.008, bevelSize: 0.006, bevelSegments: 2 });
    e.translate(0, -0.3, -0.011);
    return e;
  });
  const blade = mesh(bladeGeo, mat('#ecd29d', { rough: 0.55 }), 0, 0, 0);
  const spine = mesh(geo('batSpine', () => { const c = new THREE.CapsuleGeometry(0.022, 0.4, 4, 8); c.scale(1, 1, 0.8); return c; }), mat('#dcc184', { rough: 0.55 }), 0, -0.6, -0.022);
  const sticker = mesh(box(0.092, 0.13, 0.002), mat('#1d4fa3'), 0, -0.42, 0.02, false);
  const sticker2 = mesh(box(0.092, 0.05, 0.002), mat('#ffc72c'), 0, -0.78, 0.02, false);
  g.add(handle, grip, blade, spine, sticker, sticker2);
  return g;
}

// ---------------------------------------------------------------- rig
export interface Rig {
  root: THREE.Group;     // positioned in world (inside mirror group)
  mirror: THREE.Group;
  hips: THREE.Object3D;
  spine: THREE.Object3D;
  chest: THREE.Object3D;
  head: THREE.Object3D;
  lSh: THREE.Object3D; lEl: THREE.Object3D; rSh: THREE.Object3D; rEl: THREE.Object3D;
  lHand: THREE.Object3D; rHand: THREE.Object3D;
  lHip: THREE.Object3D; lKnee: THREE.Object3D; rHip: THREE.Object3D; rKnee: THREE.Object3D;
  lAnk: THREE.Object3D; rAnk: THREE.Object3D;
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

export interface RigLook {
  jersey: string; pants: string; accent: string; skin: string; hair: string; kind: Rig['kind']; helmet: boolean;
  secondary?: string; seed?: number; teamShort?: string;
}

// smoother shared shapes
const torsoGeo = () => geo('torso', () => { const g = new THREE.CapsuleGeometry(0.155, 0.28, 6, 16); g.scale(1.12, 1, 0.78); return g; });
const shoulderGeo = () => geo('shoulder', () => new THREE.SphereGeometry(0.062, 14, 10));
const limb = (r: number, l: number) => geo(`limb${r}-${l}`, () => new THREE.CapsuleGeometry(r, l, 6, 14));
const shoeGeo = () => geo('shoe', () => { const g = new THREE.CapsuleGeometry(0.048, 0.17, 4, 10); g.rotateX(Math.PI / 2); g.scale(1.05, 0.75, 1); return g; });
const soleGeo = () => geo('sole', () => new THREE.BoxGeometry(0.1, 0.022, 0.27));
const padGeo = () => geo('pad', () => { const g = new THREE.CapsuleGeometry(0.075, 0.38, 4, 12); g.scale(1.05, 1, 0.75); return g; });
const gloveGeo = () => geo('glove', () => { const g = new THREE.SphereGeometry(0.05, 12, 10); g.scale(0.85, 1.2, 0.85); return g; });
const keeperGloveGeo = () => geo('kglove', () => { const g = new THREE.SphereGeometry(0.068, 12, 10); g.scale(1, 1.15, 0.7); return g; });

/** Merge static meshes that share a material inside each bone group (cuts draw calls ~3x). */
export function mergeStatic(group: THREE.Object3D, recurse = true) {
  const buckets = new Map<THREE.Material, THREE.Mesh[]>();
  for (const c of [...group.children]) {
    const m = c as THREE.Mesh;
    if (m.isMesh && !(m as unknown as THREE.InstancedMesh).isInstancedMesh && !m.userData.noMerge && !Array.isArray(m.material)) {
      const arr = buckets.get(m.material as THREE.Material) ?? [];
      arr.push(m); buckets.set(m.material as THREE.Material, arr);
    } else if (!m.isMesh && recurse) mergeStatic(c);
  }
  for (const [material, meshes] of buckets) {
    if (meshes.length < 2) continue;
    const anyNonIndexed = meshes.some((m) => !m.geometry.index);
    const geos = meshes.map((m) => {
      m.updateMatrix();
      let g = m.geometry.clone();
      if (anyNonIndexed && g.index) g = g.toNonIndexed();
      for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal' && k !== 'uv') g.deleteAttribute(k);
      if (!g.attributes.uv) g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
      g.applyMatrix4(m.matrix);
      return g;
    });
    const merged = mergeGeometries(geos);
    geos.forEach((g) => g.dispose());
    if (!merged) continue;
    const mm = new THREE.Mesh(merged, material);
    mm.castShadow = meshes.some((m) => m.castShadow);
    mm.receiveShadow = meshes.some((m) => m.receiveShadow);
    mm.userData.ownGeo = true;
    meshes.forEach((m) => group.remove(m));
    group.add(mm);
  }
}

/** Convert the bone hierarchy + per-bone meshes into one SkinnedMesh per material (rigid skinning). */
function skinRig(root: THREE.Object3D) {
  root.updateMatrixWorld(true);
  const rootInv = root.matrixWorld.clone().invert();
  const bones: THREE.Bone[] = [];
  root.traverse((o) => { if ((o as THREE.Bone).isBone) bones.push(o as THREE.Bone); });
  const buckets = new Map<THREE.Material, THREE.BufferGeometry[]>();
  const remove: THREE.Mesh[] = [];
  const tmp = new THREE.Matrix4();
  root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh || m.userData.noMerge || Array.isArray(m.material)) return;
    const parent = m.parent as THREE.Bone | null;
    if (!parent || !parent.isBone) return;
    const bi = bones.indexOf(parent);
    let g = m.geometry.clone();
    if (g.index) g = g.toNonIndexed();
    for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal' && k !== 'uv') g.deleteAttribute(k);
    if (!g.attributes.uv) g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
    g.applyMatrix4(tmp.multiplyMatrices(rootInv, m.matrixWorld));
    const n = g.attributes.position.count;
    const si = new Uint16Array(n * 4), sw = new Float32Array(n * 4);
    for (let i = 0; i < n; i++) { si[i * 4] = bi; sw[i * 4] = 1; }
    g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(si, 4));
    g.setAttribute('skinWeight', new THREE.Float32BufferAttribute(sw, 4));
    const arr = buckets.get(m.material as THREE.Material) ?? [];
    arr.push(g); buckets.set(m.material as THREE.Material, arr);
    remove.push(m);
  });
  remove.forEach((m) => m.parent?.remove(m));
  const skeleton = new THREE.Skeleton(bones);
  for (const [material, geos] of buckets) {
    const merged = mergeGeometries(geos);
    geos.forEach((g) => g.dispose());
    if (!merged) continue;
    const sm = new THREE.SkinnedMesh(merged, material);
    sm.castShadow = true;
    sm.frustumCulled = false;
    sm.userData.ownGeo = true;
    root.add(sm);
    sm.updateMatrixWorld(true);
    sm.bind(skeleton, sm.matrixWorld.clone());
  }
}

/** paints name + number on the back of the shirt */
export function setIdentity(rig: Rig, name: string, num: number | undefined, fg: string) {
  const ud = rig.root.userData as { backTex?: THREE.CanvasTexture; backCanvas?: HTMLCanvasElement; ident?: string };
  const key = `${name}|${num}`;
  if (ud.ident === key || !ud.backCanvas || !ud.backTex) return;
  ud.ident = key;
  const c = ud.backCanvas.getContext('2d')!;
  c.clearRect(0, 0, 256, 256);
  c.fillStyle = fg; c.textAlign = 'center';
  const surname = name.split(' ').slice(-1)[0].toUpperCase();
  c.font = `bold ${surname.length > 9 ? 30 : 38}px Arial`;
  c.fillText(surname, 128, 60);
  c.font = 'bold 150px Arial';
  c.fillText(String(num ?? ''), 128, 205);
  ud.backTex.needsUpdate = true;
}

export function buildRig(look: RigLook): Rig {
  const mirror = new THREE.Group();
  const root = new THREE.Group();
  mirror.add(root);
  const seed = look.seed ?? Math.floor(Math.random() * 1e6);
  const rr = (k: number) => ((Math.sin(seed * 12.9898 + k * 78.233) * 43758.5453) % 1 + 1) % 1;
  const jersey = mat(look.jersey, { rough: 0.72 });
  const pants = mat(look.pants, { rough: 0.8 });
  const skin = mat(look.skin, { rough: 0.62 });
  const shoe = mat('#f6f6f6', { rough: 0.45 });
  const accent = mat(look.accent, { rough: 0.55 });
  const second = mat(look.secondary ?? look.accent, { rough: 0.6 });
  const dark = mat('#141414', { rough: 0.5 });
  const umpire = look.kind === 'umpire';
  const shirt = umpire ? mat('#d7e7ff', { rough: 0.85 }) : jersey;
  const trousers = umpire ? mat('#1f2533', { rough: 0.85 }) : pants;

  const hips = new THREE.Bone(); hips.position.y = 0.98; root.add(hips);
  const pelvis = mesh(geo('pelvis', () => { const g = new THREE.CapsuleGeometry(0.13, 0.12, 4, 12); g.rotateZ(Math.PI / 2); g.scale(1, 1, 0.8); return g; }), trousers, 0, 0, 0);
  hips.add(pelvis);
  const spine = new THREE.Bone(); spine.position.y = 0.08; hips.add(spine);
  spine.add(mesh(torsoGeo(), shirt, 0, 0.22, 0));
  if (!umpire) {
    // side panels / chest trim in secondary colour, collar
    spine.add(mesh(box(0.3, 0.035, 0.02), second, 0, 0.36, 0.118, false));
    const collar = new THREE.Mesh(geo('collar', () => new THREE.TorusGeometry(0.065, 0.014, 6, 16)), second);
    collar.rotation.x = Math.PI / 2; collar.position.set(0, 0.45, 0.005); spine.add(collar);
    // chest badge
    const badge = new THREE.Mesh(geo('badge', () => new THREE.CircleGeometry(0.035, 16)), second);
    badge.position.set(0.075, 0.33, 0.124); spine.add(badge);
    // name + number on the back
    const cv = document.createElement('canvas'); cv.width = 256; cv.height = 256;
    const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
    const back = new THREE.Mesh(geo('backPlane', () => new THREE.PlaneGeometry(0.27, 0.27)), new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false }));
    back.position.set(0, 0.25, -0.123); back.rotation.y = Math.PI; back.userData.noMerge = true; spine.add(back);
    root.userData.backTex = tex; root.userData.backCanvas = cv;
  } else spine.add(mesh(box(0.34, 0.5, 0.23), mat('#f2f2f2', { rough: 0.9 }), 0, 0.2, 0)); // umpire coat
  const chest = new THREE.Bone(); chest.position.y = 0.42; spine.add(chest);
  const head = new THREE.Bone(); head.position.y = 0.08; chest.add(head);
  head.add(mesh(cyl(0.048, 0.056, 0.11, 12), skin, 0, 0.03, 0));
  const skull = mesh(geo('skull', () => { const g = new THREE.SphereGeometry(0.105, 18, 14); g.scale(0.92, 1.05, 1); return g; }), skin, 0, 0.17, 0.01);
  head.add(skull);
  head.add(mesh(geo('nose', () => { const g = new THREE.ConeGeometry(0.018, 0.045, 6); g.rotateX(Math.PI / 2); return g; }), skin, 0, 0.16, 0.117, false));
  for (const ex of [-0.035, 0.035]) {
    head.add(mesh(geo('eye', () => new THREE.SphereGeometry(0.011, 8, 6)), dark, ex, 0.19, 0.098, false));
    head.add(mesh(box(0.032, 0.008, 0.01), mat(look.hair, { rough: 0.9 }), ex, 0.207, 0.099, false));
  }
  if (!look.helmet && !umpire && rr(3) < 0.45) {
    head.add(mesh(geo('beard', () => { const g = new THREE.SphereGeometry(0.1, 14, 10, 0, Math.PI * 2, Math.PI * 0.55, Math.PI * 0.45); g.scale(0.95, 1, 1.02); return g; }), mat(look.hair, { rough: 0.95 }), 0, 0.17, 0.012, false));
  }
  if (look.helmet) {
    const helmMat = mat(look.accent, { rough: 0.25, metal: 0.25 });
    const helm = new THREE.Mesh(geo('helmet', () => new THREE.SphereGeometry(0.13, 24, 14, 0, Math.PI * 2, 0, Math.PI * 0.6)), helmMat);
    helm.position.set(0, 0.185, 0); helm.castShadow = true; head.add(helm);
    head.add(mesh(geo('helmBack', () => { const g = new THREE.CylinderGeometry(0.115, 0.1, 0.07, 16, 1, true, Math.PI * 0.6, Math.PI * 0.8); return g; }), helmMat, 0, 0.14, -0.005));
    head.add(mesh(geo('peak', () => { const g = new THREE.BoxGeometry(0.21, 0.012, 0.085); return g; }), helmMat, 0, 0.205, 0.115));
    const logo = new THREE.Mesh(geo('hlogo', () => new THREE.CircleGeometry(0.025, 14)), second);
    logo.position.set(0, 0.255, 0.105); logo.rotation.x = -0.5; head.add(logo);
    const grilleM = mat('#b9bec4', { metal: 0.9, rough: 0.25 });
    for (const [y, sc] of [[0.15, 1], [0.115, 0.94], [0.085, 0.86]] as const) {
      const g = new THREE.Mesh(geo('grille', () => new THREE.TorusGeometry(0.12, 0.0055, 5, 20, Math.PI)), grilleM);
      g.position.set(0, y, 0.02); g.rotation.set(Math.PI / 2 + 0.2, 0, 0); g.scale.setScalar(sc); head.add(g);
    }
    head.add(mesh(box(0.006, 0.08, 0.006), grilleM, 0, 0.115, 0.135, false));
  } else if (umpire) {
    head.add(mesh(cyl(0.2, 0.2, 0.012, 24), mat('#f5f5f0'), 0, 0.235, 0));
    head.add(mesh(cyl(0.1, 0.11, 0.09, 16), mat('#f5f5f0'), 0, 0.28, 0));
  } else {
    const cap = rr(1) < 0.55;
    head.add(mesh(geo('hair', () => new THREE.SphereGeometry(0.112, 16, 8, 0, Math.PI * 2, 0, Math.PI * 0.5)), cap ? jersey : mat(look.hair, { rough: 0.95 }), 0, 0.182, 0));
    if (cap) {
      head.add(mesh(geo('capPeak', () => { const g = new THREE.CylinderGeometry(0.1, 0.1, 0.01, 16, 1, false, -Math.PI / 2, Math.PI); g.scale(1, 1, 0.9); return g; }), jersey, 0, 0.2, 0.05));
      head.add(mesh(geo('capBadge', () => new THREE.CircleGeometry(0.022, 12)), second, 0, 0.25, 0.09, false));
    }
  }

  const arm = (side: 1 | -1) => {
    const sh = new THREE.Bone(); sh.position.set(0.2 * side, -0.02, 0); chest.add(sh);
    sh.add(mesh(shoulderGeo(), shirt, 0, 0, 0));
    sh.add(mesh(limb(0.052, 0.12), umpire ? mat('#f2f2f2') : shirt, 0, -0.1, 0)); // sleeve
    sh.add(mesh(limb(0.045, 0.16), skin, 0, -0.18, 0));
    const el = new THREE.Bone(); el.position.y = -0.3; sh.add(el);
    el.add(mesh(limb(0.042, 0.19), look.helmet ? mat('#ffffff', { rough: 0.8 }) : skin, 0, -0.13, 0));
    const hand = new THREE.Bone(); hand.position.y = -0.28; el.add(hand);
    if (look.kind === 'keeper') { hand.add(mesh(keeperGloveGeo(), mat('#f4f1ea', { rough: 0.7 }), 0, -0.035, 0)); hand.add(mesh(box(0.11, 0.03, 0.06), accent, 0, 0.02, 0, false)); }
    else if (look.helmet) { hand.add(mesh(gloveGeo(), mat('#fafafa', { rough: 0.75 }), 0, -0.03, 0)); hand.add(mesh(limb(0.047, 0.02), accent, 0, 0.02, 0, false)); }
    else hand.add(mesh(sphere(0.045), skin, 0, -0.03, 0));
    return { sh, el, hand };
  };
  const L = arm(1), R = arm(-1);

  const leg = (side: 1 | -1) => {
    const hip = new THREE.Bone(); hip.position.set(0.1 * side, -0.04, 0); hips.add(hip);
    hip.add(mesh(limb(0.078, 0.27), trousers, 0, -0.22, 0));
    const knee = new THREE.Bone(); knee.position.y = -0.45; hip.add(knee);
    knee.add(mesh(limb(0.06, 0.29), trousers, 0, -0.21, 0));
    if (look.helmet || look.kind === 'keeper') {
      const padM = mat('#fdfdfd', { rough: 0.7 });
      knee.add(mesh(padGeo(), padM, 0, -0.2, 0.045));
      knee.add(mesh(geo('kneeRoll', () => { const g = new THREE.SphereGeometry(0.07, 12, 8); g.scale(1.1, 0.75, 0.9); return g; }), padM, 0, 0.02, 0.06));
      knee.add(mesh(box(0.15, 0.022, 0.1), accent, 0, -0.08, 0.06, false));
      knee.add(mesh(box(0.15, 0.022, 0.1), accent, 0, -0.3, 0.06, false));
    }
    const ank = new THREE.Bone(); ank.position.y = -0.44; knee.add(ank);
    ank.add(mesh(shoeGeo(), shoe, 0, -0.03, 0.05));
    ank.add(mesh(soleGeo(), dark, 0, -0.065, 0.05));
    ank.add(mesh(box(0.06, 0.012, 0.08), accent, side * 0.05, -0.02, 0.05, false));
    return { hip, knee, ank };
  };
  const Lg = leg(1), Rg = leg(-1);

  const rig: Rig = {
    root, mirror, hips, spine, chest, head, lSh: L.sh, lEl: L.el, rSh: R.sh, rEl: R.el, lHand: L.hand, rHand: R.hand,
    lHip: Lg.hip, lKnee: Lg.knee, rHip: Rg.hip, rKnee: Rg.knee, lAnk: Lg.ank, rAnk: Rg.ank,
    bat: null, batMode: 'none', ball: null, pose: new Float32Array(NP), kind: look.kind,
  };
  skinRig(root);
  if (look.helmet) { rig.bat = makeBat(); mergeStatic(rig.bat); setBatMode(rig, 'carry'); }
  const ball = mesh(sphere(0.04), mat('#d8d8d8'), 0, -0.07, 0.03, false);
  ball.visible = false; ball.userData.noMerge = true;
  R.hand.add(ball);
  rig.ball = ball;
  return rig;
}

/** free per-rig merged geometries and textures */
export function disposeRig(rig: Rig) {
  rig.mirror.traverse((o) => {
    const m = o as THREE.Mesh;
    if (m.isMesh && m.userData.ownGeo) m.geometry.dispose();
  });
  (rig.root.userData.backTex as THREE.Texture | undefined)?.dispose();
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

function solveArm(sh: THREE.Object3D, el: THREE.Object3D, target: THREE.Vector3, pole: THREE.Vector3) {
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
