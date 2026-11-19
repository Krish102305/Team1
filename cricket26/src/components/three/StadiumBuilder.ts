import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { StadiumDef, boundaryRadius } from '../../data/stadiums';
import type { TimeOfDay } from '../../game/types';
import { CREASE_Z, STUMPS_Z, STUMP_H } from '../../game/constants';
import { mulberry32 } from '../../utils/random';
import { mergeStatic } from './PlayerRig';

export type Quality = 'low' | 'medium' | 'high';

export interface StadiumHandles {
  group: THREE.Group;        // everything static
  env: THREE.Group;          // rotates 180° on change of ends
  stumps: { striker: THREE.Group; other: THREE.Group; strikerBails: THREE.Mesh[]; otherBails: THREE.Mesh[] };
  crowdMat: THREE.Material & { userData: { shader?: { uniforms: Record<string, { value: number }> } } };
  updateScoreboard: (lines: string[]) => void;
  tick: (dt: number, excite: number) => void;
  dispose: () => void;
}

function canvasTex(w: number, h: number, draw: (c: CanvasRenderingContext2D) => void, repeat?: [number, number]) {
  const cv = document.createElement('canvas');
  cv.width = w; cv.height = h;
  const ctx = cv.getContext('2d')!;
  draw(ctx);
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(repeat[0], repeat[1]); }
  return t;
}

function noise(ctx: CanvasRenderingContext2D, w: number, h: number, amount: number, seed: number) {
  const r = mulberry32(seed);
  const img = ctx.getImageData(0, 0, w, h);
  for (let i = 0; i < img.data.length; i += 4) {
    const n = (r() - 0.5) * amount;
    img.data[i] += n; img.data[i + 1] += n; img.data[i + 2] += n;
  }
  ctx.putImageData(img, 0, 0);
}

export function buildStadium(def: StadiumDef, time: TimeOfDay, quality: Quality, teamColors: string[] = []): StadiumHandles {
  const group = new THREE.Group();
  const env = new THREE.Group();
  group.add(env);
  const disposables: { dispose: () => void }[] = [];
  const track = <T extends { dispose: () => void }>(x: T) => { disposables.push(x); return x; };
  const R = (a: number) => boundaryRadius(def, a);
  const night = time === 'night';
  const rnd = mulberry32(1234);

  // ------------------------------------------------ ground
  const maxR = Math.max(def.boundary.rx, def.boundary.rz) * (1 + def.boundary.wobble * 1.5);
  const outer = maxR + 16;
  const GS = quality === 'high' ? 2048 : 1024;
  const grassTex = track(canvasTex(GS, GS, (c) => {
    const stripes = 26;
    const w = GS / stripes;
    // soft-edged mowing stripes (light/dark from the mower direction)
    for (let i = 0; i < stripes; i++) {
      const g = c.createLinearGradient(i * w, 0, (i + 1) * w, 0);
      const a = i % 2 === 0 ? def.grass[0] : def.grass[1];
      const b = i % 2 === 0 ? def.grass[1] : def.grass[0];
      g.addColorStop(0, a); g.addColorStop(0.08, a); g.addColorStop(0.92, a); g.addColorStop(1, b);
      c.fillStyle = g; c.fillRect(i * w, 0, w + 1, GS);
    }
    // cross-cut pattern
    c.globalAlpha = 0.06;
    for (let i = 0; i < stripes; i++) if (i % 2) { c.fillStyle = '#000'; c.fillRect(0, i * w, GS, w); }
    // large-scale colour variation (patchy turf)
    const r = mulberry32(11);
    for (let i = 0; i < 90; i++) {
      const x = r() * GS, y = r() * GS, rad = GS * (0.03 + r() * 0.09);
      const gr = c.createRadialGradient(x, y, 0, x, y, rad);
      const tone = r() < 0.5 ? '255,255,200' : '0,40,0';
      gr.addColorStop(0, `rgba(${tone},0.10)`); gr.addColorStop(1, `rgba(${tone},0)`);
      c.globalAlpha = 1; c.fillStyle = gr; c.fillRect(x - rad, y - rad, rad * 2, rad * 2);
    }
    c.globalAlpha = 1;
    noise(c, GS, GS, 12, 7);
  }));
  // tiled micro-detail used as a bump + roughness map so the turf catches the light
  const detail = track(canvasTex(256, 256, (c) => {
    c.fillStyle = '#808080'; c.fillRect(0, 0, 256, 256);
    const r = mulberry32(21);
    for (let i = 0; i < 5000; i++) {
      const v = Math.floor(90 + r() * 120);
      c.fillStyle = `rgb(${v},${v},${v})`;
      c.fillRect(r() * 256, r() * 256, 1, 2 + r() * 4);
    }
  }, [160, 160]));
  detail.colorSpace = THREE.NoColorSpace;
  const ground = new THREE.Mesh(new THREE.CircleGeometry(outer, 128), new THREE.MeshStandardMaterial(quality === 'low' ? { map: grassTex, roughness: 0.95 } : { map: grassTex, roughness: 1, roughnessMap: detail, bumpMap: detail, bumpScale: 0.9, envMapIntensity: 0.25 }));
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  track(ground.geometry); track(ground.material as THREE.Material);
  group.add(ground);
  // outfield beyond rope tint
  const ringShape = new THREE.Shape();
  for (let i = 0; i <= 128; i++) { const a = (i / 128) * Math.PI * 2; const r = outer + 2; ringShape[i ? 'lineTo' : 'moveTo'](Math.sin(a) * r, Math.cos(a) * r); }
  const hole = new THREE.Path();
  for (let i = 0; i <= 128; i++) { const a = (i / 128) * Math.PI * 2; const r = R(a) + 1.2; hole[i ? 'lineTo' : 'moveTo'](Math.sin(a) * r, Math.cos(a) * r); }
  ringShape.holes.push(hole);
  const beyond = new THREE.Mesh(new THREE.ShapeGeometry(ringShape, 1), new THREE.MeshStandardMaterial({ color: def.outfield, roughness: 1, transparent: true, opacity: 0.55 }));
  beyond.rotation.x = -Math.PI / 2; beyond.position.y = 0.01; beyond.receiveShadow = true;
  // ShapeGeometry is in XY; after rotation y-> -z, flip
  beyond.scale.y = -1;
  track(beyond.geometry); track(beyond.material as THREE.Material);
  group.add(beyond);

  // fielding circle (30-yard): two semicircles of 27.43 m centred on each set of stumps, joined by straight lines
  const circleR = 27.43;
  const per = 2 * Math.PI * circleR + 4 * STUMPS_Z;
  const nDots = Math.round(per / 1.9);
  const dotGeo = track(new THREE.CircleGeometry(0.22, 10));
  const dots = new THREE.InstancedMesh(dotGeo, track(new THREE.MeshBasicMaterial({ color: '#f7f7f7' })), nDots);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion().setFromEuler(new THREE.Euler(-Math.PI / 2, 0, 0)), sc = new THREE.Vector3(1, 1, 1), pos = new THREE.Vector3();
  const semi = Math.PI * circleR, straight = 2 * STUMPS_Z;
  for (let i = 0; i < nDots; i++) {
    let s = (i / nDots) * per, x: number, z: number;
    if (s < straight) { x = circleR; z = -STUMPS_Z + s; }
    else if ((s -= straight) < semi) { const th = s / circleR; x = circleR * Math.cos(th); z = STUMPS_Z + circleR * Math.sin(th); }
    else if ((s -= semi) < straight) { x = -circleR; z = STUMPS_Z - s; }
    else { s -= straight; const th = Math.PI + s / circleR; x = circleR * Math.cos(th); z = -STUMPS_Z + circleR * Math.sin(th); }
    pos.set(x, 0.02, z);
    m4.compose(pos, q, sc);
    dots.setMatrixAt(i, m4);
  }
  group.add(dots);

  // ------------------------------------------------ pitch
  const pitchTex = track(canvasTex(256, 2048, (c) => {
    c.fillStyle = '#c9b27c'; c.fillRect(0, 0, 256, 2048);
    const r = mulberry32(3);
    for (let i = 0; i < 2600; i++) {
      c.fillStyle = r() < 0.5 ? 'rgba(120,95,55,0.18)' : 'rgba(235,220,180,0.18)';
      c.fillRect(r() * 256, r() * 2048, 1 + r() * 4, 1 + r() * 6);
    }
    // worn areas
    const grad = (y: number) => { const g = c.createRadialGradient(128, y, 5, 128, y, 120); g.addColorStop(0, 'rgba(150,115,70,0.5)'); g.addColorStop(1, 'rgba(150,115,70,0)'); c.fillStyle = g; c.fillRect(0, y - 140, 256, 280); };
    grad(2048 * 0.25); grad(2048 * 0.75);
    // bowlers' footmarks and batters' guard marks
    for (const end of [-1, 1]) {
      const zc = 1024 + end * (CREASE_Z - 0.4) * (2048 / 24);
      for (let k = 0; k < 40; k++) {
        const x = 128 + (r() - 0.5) * 70 + end * 20, y = zc + (r() - 0.5) * 60;
        c.fillStyle = `rgba(95,72,40,${0.12 + r() * 0.18})`;
        c.beginPath(); c.ellipse(x, y, 4 + r() * 7, 6 + r() * 10, r() * 3, 0, Math.PI * 2); c.fill();
      }
      c.fillStyle = 'rgba(90,70,40,0.35)'; c.fillRect(124, 1024 + end * (CREASE_Z + 0.25) * (2048 / 24) - 18, 8, 36);
    }
    noise(c, 256, 2048, 18, 9);
    // creases: pitch plane is 3.4m wide x 24m long → px per m
    const pxX = 256 / 3.4, pxZ = 2048 / 24;
    const zpx = (z: number) => 1024 + z * pxZ;
    const xpx = (x: number) => 128 + x * pxX;
    c.fillStyle = '#ffffff';
    for (const s of [-1, 1]) {
      const pop = zpx(s * CREASE_Z), bowl = zpx(s * STUMPS_Z);
      c.fillRect(0, pop - 3, 256, 6);                          // popping crease
      c.fillRect(xpx(-1.32), bowl - 2, xpx(1.32) - xpx(-1.32), 4); // bowling crease
      for (const x of [-1.32, 1.32]) {                         // return creases
        const z0 = Math.min(pop, zpx(s * (STUMPS_Z + 1.22))), z1 = Math.max(pop, zpx(s * (STUMPS_Z + 1.22)));
        c.fillRect(xpx(x) - 2, z0, 4, z1 - z0);
      }
    }
    // wide guidelines
    for (const s of [-1, 1]) for (const x of [-0.89, 0.89]) {
      const z0 = zpx(s * CREASE_Z), z1 = zpx(s * (CREASE_Z - 1.0));
      c.fillRect(xpx(x) - 1.5, Math.min(z0, z1), 3, Math.abs(z1 - z0));
    }
  }));
  const pitch = new THREE.Mesh(new THREE.PlaneGeometry(3.4, 24), new THREE.MeshStandardMaterial({ map: pitchTex, roughness: 0.92 }));
  pitch.rotation.x = -Math.PI / 2; pitch.position.y = 0.012; pitch.receiveShadow = true;
  track(pitch.geometry); track(pitch.material as THREE.Material);
  group.add(pitch);
  // slightly lighter "square" around pitch
  const square = new THREE.Mesh(new THREE.PlaneGeometry(14, 30), new THREE.MeshStandardMaterial({ color: def.grass[0], roughness: 0.9, transparent: true, opacity: 0.35 }));
  square.rotation.x = -Math.PI / 2; square.position.y = 0.006; square.receiveShadow = true;
  track(square.geometry); track(square.material as THREE.Material);
  group.add(square);

  // ------------------------------------------------ stumps
  const stumpMat = track(new THREE.MeshStandardMaterial({ color: '#f1ead6', roughness: 0.5 }));
  const stumpGeo = track(new THREE.CylinderGeometry(0.018, 0.018, STUMP_H, 10));
  const bailGeo = track(new THREE.CylinderGeometry(0.009, 0.009, 0.11, 6));
  const stumpLogo = track(new THREE.MeshStandardMaterial({ color: '#c8102e', roughness: 0.5 }));
  const makeStumps = (z: number) => {
    const g = new THREE.Group();
    const bails: THREE.Mesh[] = [];
    for (const x of [-0.1, 0, 0.1]) {
      const s = new THREE.Mesh(stumpGeo, stumpMat); s.position.set(x, STUMP_H / 2, 0); s.castShadow = true; g.add(s);
      const band = new THREE.Mesh(new THREE.CylinderGeometry(0.0185, 0.0185, 0.12, 10), stumpLogo); band.position.set(x, 0.45, 0); g.add(band); track(band.geometry);
    }
    for (const x of [-0.05, 0.05]) {
      const b = new THREE.Mesh(bailGeo, stumpMat); b.rotation.z = Math.PI / 2; b.position.set(x, STUMP_H + 0.012, 0); b.castShadow = true;
      b.userData.home = b.position.clone(); g.add(b); bails.push(b);
    }
    g.position.z = z;
    group.add(g);
    return { g, bails };
  };
  const sStr = makeStumps(STUMPS_Z), sOth = makeStumps(-STUMPS_Z);

  // ------------------------------------------------ boundary rope
  const ropePts: THREE.Vector3[] = [];
  for (let i = 0; i < 200; i++) { const a = (i / 200) * Math.PI * 2; const r = R(a); ropePts.push(new THREE.Vector3(Math.sin(a) * r, 0.07, Math.cos(a) * r)); }
  const ropeCurve = new THREE.CatmullRomCurve3(ropePts, true);
  const rope = new THREE.Mesh(new THREE.TubeGeometry(ropeCurve, 400, 0.08, 6, true), new THREE.MeshStandardMaterial({ color: def.id === 'classic' ? '#ffffff' : '#e8e8e8', roughness: 0.6 }));
  rope.castShadow = false;
  track(rope.geometry); track(rope.material as THREE.Material);
  group.add(rope);
  // boundary marker flags
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2 + 0.1;
    const r = R(a) + 0.4;
    const flag = new THREE.Mesh(new THREE.ConeGeometry(0.22, 0.5, 4), new THREE.MeshStandardMaterial({ color: i % 2 ? '#ffffff' : '#ff6a00' }));
    flag.position.set(Math.sin(a) * r, 0.25, Math.cos(a) * r);
    track(flag.geometry); track(flag.material as THREE.Material);
    group.add(flag);
  }

  // ------------------------------------------------ advertising boards (LED style)
  const brandTex = def.boards.map((name, i) => track(canvasTex(512, 64, (c) => {
    const hues = ['#0a1f44', '#b0102a', '#0b6e4f', '#311b92', '#e65100', '#004d73', '#1b1b1b', '#6a1b9a'];
    const bg = hues[i % hues.length];
    const g = c.createLinearGradient(0, 0, 0, 64); g.addColorStop(0, bg); g.addColorStop(1, '#000');
    c.fillStyle = g; c.fillRect(0, 0, 512, 64);
    c.fillStyle = i % 3 === 0 ? '#ffd23f' : '#ffffff';
    c.font = 'bold 40px Arial Black, Arial, sans-serif';
    c.textAlign = 'center'; c.textBaseline = 'middle';
    c.fillText(name, 256, 34);
  })));
  const boardMats = brandTex.map((t) => track(new THREE.MeshStandardMaterial({ map: t, emissive: '#ffffff', emissiveMap: t, emissiveIntensity: night ? 0.9 : 0.35, roughness: 0.6 })));
  const backMat = track(new THREE.MeshStandardMaterial({ color: '#1a1a1a', roughness: 0.9 }));
  const nBoards = 56;
  for (let i = 0; i < nBoards; i++) {
    const a0 = (i / nBoards) * Math.PI * 2;
    const a1 = ((i + 1) / nBoards) * Math.PI * 2;
    // gaps for sightscreens at both ends
    const am = (a0 + a1) / 2;
    if (Math.abs(Math.sin(am)) < 0.12) continue;
    const r0 = R(a0) + 3.2, r1 = R(a1) + 3.2;
    const p0 = new THREE.Vector3(Math.sin(a0) * r0, 0, Math.cos(a0) * r0), p1 = new THREE.Vector3(Math.sin(a1) * r1, 0, Math.cos(a1) * r1);
    const len = p0.distanceTo(p1);
    const b = new THREE.Mesh(track(new THREE.BoxGeometry(len, 0.9, 0.15)), backMat);
    b.position.copy(p0).add(p1).multiplyScalar(0.5); b.position.y = 0.45;
    b.lookAt(0, 0.45, 0);
    b.castShadow = quality !== 'low';
    const face = new THREE.Mesh(track(new THREE.PlaneGeometry(len, 0.86)), boardMats[i % boardMats.length]);
    face.position.copy(b.position).multiplyScalar(0.9985); face.position.y = 0.45;
    face.lookAt(0, 0.45, 0);
    env.add(b, face);
  }

  // ------------------------------------------------ sightscreens
  for (const s of [-1, 1]) {
    const a = s > 0 ? 0 : Math.PI;
    const r = R(a) + 5;
    const scrMat = new THREE.MeshStandardMaterial({ color: def.ballColor === 'red' ? '#f7f7f2' : '#0d0d10', roughness: 0.9 });
    const scr = new THREE.Mesh(new THREE.BoxGeometry(14, 5.5, 0.4), scrMat);
    scr.position.set(0, 2.75, s * r);
    track(scr.geometry); track(scrMat);
    env.add(scr);
  }

  // ------------------------------------------------ stands
  const seatCols = def.seatColors.map((c) => new THREE.Color(c));
  const standCol = new THREE.Color(def.standColor);
  const riserCol = standCol.clone().multiplyScalar(0.45);
  const N = 160;
  const standGap = def.standGap;
  const inGap = (a: number) => {
    if (standGap <= 0) return false;
    // gap centered at angle PI/2 (one side: x+)
    let d = Math.abs(((a - Math.PI / 2 + Math.PI * 3) % (Math.PI * 2)) - Math.PI);
    return d < standGap / 2;
  };
  const sightGap = (a: number) => Math.abs(Math.sin(a)) < 0.11;
  const positions: number[] = [], colors: number[] = [], indices: number[] = [];
  const crowdSpots: { x: number; y: number; z: number; a: number }[] = [];
  const tiers = def.tiers;
  const rowsPerTier = quality === 'low' ? 10 : 14;
  let tierBaseR = 10, tierBaseH = 1.2;
  const rowDepth = 0.85, rowRise = 0.45;
  const addQuad = (a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3, d: THREE.Vector3, col: THREE.Color) => {
    const i0 = positions.length / 3;
    for (const v of [a, b, c, d]) { positions.push(v.x, v.y, v.z); colors.push(col.r, col.g, col.b); }
    indices.push(i0, i0 + 1, i0 + 2, i0, i0 + 2, i0 + 3);
  };
  const P3 = (a: number, rOff: number, h: number) => { const r = R(a) + rOff; return new THREE.Vector3(Math.sin(a) * r, h, Math.cos(a) * r); };
  const tierTops: { rOff: number; h: number }[] = [];
  const tierFronts: { r: number; h: number; wall: number }[] = [];
  for (let t = 0; t < tiers; t++) {
    for (let i = 0; i < N; i++) {
      const a0 = (i / N) * Math.PI * 2, a1 = ((i + 1) / N) * Math.PI * 2, am = (a0 + a1) / 2;
      if (inGap(am) || (t === 0 && sightGap(am))) continue;
      const section = Math.floor(i / 8);
      const aisle = i % 8 === 0;
      for (let r = 0; r < rowsPerTier; r++) {
        const rOff = tierBaseR + r * rowDepth, h = tierBaseH + r * rowRise;
        const seat = aisle ? standCol : seatCols[(section + t) % seatCols.length].clone().multiplyScalar(0.85 + (r % 2) * 0.15);
        // tread
        addQuad(P3(a0, rOff, h), P3(a1, rOff, h), P3(a1, rOff + rowDepth, h), P3(a0, rOff + rowDepth, h), seat);
        // riser
        addQuad(P3(a0, rOff + rowDepth, h), P3(a1, rOff + rowDepth, h), P3(a1, rOff + rowDepth, h + rowRise), P3(a0, rOff + rowDepth, h + rowRise), riserCol);
        if (!aisle) {
          // one seat every ~0.6 m along the row
          const segLen = (R(am) + rOff) * (a1 - a0);
          const seats = Math.max(1, Math.floor(segLen / 0.62));
          for (let k = 0; k < seats; k++) crowdSpots.push({ x: 0, y: h, z: rOff + rowDepth * 0.45, a: a0 + ((k + 0.5) / seats) * (a1 - a0) });
        }
      }
      // front wall
      addQuad(P3(a0, tierBaseR, tierBaseH - (t === 0 ? 1.2 : 1.6)), P3(a1, tierBaseR, tierBaseH - (t === 0 ? 1.2 : 1.6)), P3(a1, tierBaseR, tierBaseH), P3(a0, tierBaseR, tierBaseH), standCol.clone().multiplyScalar(0.7));
      // back wall
      const backR = tierBaseR + rowsPerTier * rowDepth, topH = tierBaseH + rowsPerTier * rowRise;
      addQuad(P3(a1, backR, topH), P3(a0, backR, topH), P3(a0, backR, topH + 2.5), P3(a1, backR, topH + 2.5), standCol.clone().multiplyScalar(0.6));
    }
    tierTops.push({ rOff: tierBaseR + rowsPerTier * rowDepth, h: tierBaseH + rowsPerTier * rowRise });
    tierFronts.push({ r: tierBaseR, h: tierBaseH, wall: t === 0 ? 1.2 : 1.6 });
    tierBaseR += rowsPerTier * rowDepth - 2.5;
    tierBaseH += rowsPerTier * rowRise + 3.2;
  }
  // ring band helper (follows the boundary shape), facing the field
  const band = (rOff: number, y0: number, y1: number, material: THREE.Material, repeatU: number) => {
    const NB = 220, pos2: number[] = [], uv: number[] = [], idx: number[] = [];
    for (let i = 0; i <= NB; i++) {
      const a = (i / NB) * Math.PI * 2, rr = R(a) + rOff;
      const x = Math.sin(a) * rr, z = Math.cos(a) * rr;
      pos2.push(x, y0, z, x, y1, z); uv.push((1 - i / NB) * repeatU, 0, (1 - i / NB) * repeatU, 1);
      if (i < NB) { const k = i * 2; idx.push(k, k + 2, k + 1, k + 1, k + 2, k + 3); }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos2, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idx); g.computeVertexNormals();
    const m = new THREE.Mesh(track(g), material);
    m.userData.noMerge = true;
    env.add(m);
    return m;
  };
  // LED ribbon boards on the tier fascias (scrolling)
  const ribbonTex = track(canvasTex(2048, 64, (c) => {
    const cols = [...teamColors, '#0a1f44', '#b0102a', '#ffc72c'];
    for (let i = 0; i < 8; i++) {
      c.fillStyle = cols[i % cols.length] ?? '#0a1f44'; c.fillRect(i * 256, 0, 256, 64);
      c.fillStyle = '#ffffff'; c.font = 'bold 34px Arial Black, Arial'; c.textAlign = 'center'; c.textBaseline = 'middle';
      c.fillText(def.boards[i % def.boards.length], i * 256 + 128, 34);
    }
  }));
  ribbonTex.wrapS = THREE.RepeatWrapping;
  const ribbonMat = track(new THREE.MeshBasicMaterial({ map: ribbonTex, side: THREE.DoubleSide, toneMapped: false }));
  const ribbons: THREE.Texture[] = [ribbonTex];
  for (let t = 0; t < tierFronts.length; t++) {
    const f = tierFronts[t];
    if (def.standGap > 0 && t === 0) continue; // open grounds keep simple walls
    band(f.r - 0.06, f.h - f.wall + 0.1, f.h - 0.1, ribbonMat, 18);
  }
  // hospitality boxes: glass band under the upper tier
  if (tierFronts.length > 1) {
    const f = tierFronts[1];
    const winTex2 = track(canvasTex(512, 64, (c) => {
      c.fillStyle = night ? '#2a2216' : '#1b2633'; c.fillRect(0, 0, 512, 64);
      for (let i = 0; i < 16; i++) { c.fillStyle = night ? 'rgba(255,214,140,0.85)' : 'rgba(150,190,220,0.55)'; c.fillRect(i * 32 + 3, 6, 26, 52); }
    }));
    winTex2.wrapS = THREE.RepeatWrapping;
    const glass = track(new THREE.MeshStandardMaterial({ map: winTex2, emissive: night ? '#ffffff' : '#000000', emissiveMap: night ? winTex2 : null, emissiveIntensity: 0.45, roughness: 0.15, metalness: 0.4, side: THREE.DoubleSide }));
    band(f.r + 0.8, f.h - f.wall - 2.6, f.h - f.wall - 0.1, glass, 60);
  }

  const standGeo = new THREE.BufferGeometry();
  standGeo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  standGeo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  standGeo.setIndex(indices);
  standGeo.computeVertexNormals();
  const standMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85, side: THREE.DoubleSide });
  const stands = new THREE.Mesh(standGeo, standMat);
  stands.receiveShadow = quality === 'high';
  track(standGeo); track(standMat);
  env.add(stands);

  // ------------------------------------------------ crowd (instanced, shader-animated)
  const crowdCount = Math.floor((quality === 'low' ? 6000 : quality === 'medium' ? 15000 : 26000) * def.crowdDensity);
  // painted spectator cards: an atlas of 8 fans x 2 poses (arms down / arms up), shirts tinted per fan
  const atlas = track(canvasTex(512, 256, (c) => {
    const skins = ['#f1c7a5', '#d9a07a', '#b97d57', '#8d5a3b', '#6b4229', '#e3b38f', '#a8714c', '#c98e66'];
    const hairs = ['#1a1410', '#3b2414', '#0d0d0d', '#6b4a2b', '#c9a35f', '#222222', '#2b1a10', '#8a8a8a'];
    for (let v = 0; v < 8; v++) for (let up = 0; up < 2; up++) {
      const ox = v * 64, oy = up ? 128 : 0;
      const cx = ox + 32;
      const shirtKey = (shade: number) => `rgb(0,255,${shade})`;
      // lap / legs (seated, mostly hidden by the row in front)
      c.fillStyle = v % 3 === 0 ? '#2b3550' : v % 3 === 1 ? '#3a3a3a' : '#4a3b2a';
      c.fillRect(cx - 17, oy + 104, 34, 24);
      // torso (shirt keyed for tinting, with shading in the blue channel)
      const g = c.createLinearGradient(cx - 20, 0, cx + 20, 0);
      g.addColorStop(0, shirtKey(120)); g.addColorStop(0.5, shirtKey(255)); g.addColorStop(1, shirtKey(110));
      c.fillStyle = g;
      c.beginPath(); c.moveTo(cx - 19, oy + 108); c.lineTo(cx - 21, oy + 62); c.quadraticCurveTo(cx, oy + 50, cx + 21, oy + 62); c.lineTo(cx + 19, oy + 108); c.closePath(); c.fill();
      // arms
      c.strokeStyle = shirtKey(170); c.lineWidth = 9; c.lineCap = 'round';
      if (up) {
        c.beginPath(); c.moveTo(cx - 18, oy + 66); c.lineTo(cx - 26, oy + 34); c.lineTo(cx - 22, oy + 12); c.stroke();
        c.beginPath(); c.moveTo(cx + 18, oy + 66); c.lineTo(cx + 26, oy + 34); c.lineTo(cx + 22, oy + 12); c.stroke();
        c.fillStyle = skins[v]; c.beginPath(); c.arc(cx - 22, oy + 10, 5, 0, Math.PI * 2); c.arc(cx + 22, oy + 10, 5, 0, Math.PI * 2); c.fill();
      } else {
        c.beginPath(); c.moveTo(cx - 18, oy + 66); c.lineTo(cx - 22, oy + 92); c.lineTo(cx - 10, oy + 104); c.stroke();
        c.beginPath(); c.moveTo(cx + 18, oy + 66); c.lineTo(cx + 22, oy + 92); c.lineTo(cx + 10, oy + 104); c.stroke();
      }
      // neck + head
      c.fillStyle = skins[v]; c.fillRect(cx - 5, oy + 48, 10, 10);
      c.beginPath(); c.ellipse(cx, oy + 38, 11, 13, 0, 0, Math.PI * 2); c.fill();
      // hair or cap
      c.fillStyle = v === 2 || v === 5 ? shirtKey(200) : hairs[v];
      c.beginPath(); c.ellipse(cx, oy + 30, 12, 8, 0, Math.PI, Math.PI * 2); c.fill();
      if (v === 2 || v === 5) c.fillRect(cx - 4, oy + 28, 16, 3);
      // eyes
      c.fillStyle = 'rgba(20,10,5,0.8)'; c.fillRect(cx - 5, oy + 37, 2, 2); c.fillRect(cx + 3, oy + 37, 2, 2);
    }
  }));
  atlas.magFilter = THREE.LinearFilter;
  const personGeo = new THREE.PlaneGeometry(0.62, 1.24); personGeo.translate(0, 0.5, 0);
  const phase = new Float32Array(crowdCount);
  const variant = new Float32Array(crowdCount);
  const shirtCol = new Float32Array(crowdCount * 3);
  const crowdMat = new THREE.MeshLambertMaterial({ map: atlas, alphaTest: 0.5, side: THREE.DoubleSide }) as unknown as StadiumHandles['crowdMat'];
  crowdMat.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = { value: 0 };
    shader.uniforms.uExcite = { value: 0 };
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float aPhase;\nattribute float aVar;\nattribute vec3 aShirt;\nvarying vec3 vShirt;\nuniform float uTime;\nuniform float uExcite;')
      .replace('#include <uv_vertex>', `#include <uv_vertex>
        float wave = step(0.0, sin(uTime * (2.5 + aPhase * 2.0) + aPhase * 60.0));
        float upProb = clamp(uExcite * 1.4, 0.0, 1.0);
        float frame = step(aPhase, upProb) * (uExcite > 0.5 ? 1.0 : wave) + step(0.93, aPhase) * wave;
        frame = min(frame, 1.0);
        vMapUv = vec2((uv.x + aVar) / 8.0, uv.y * 0.5 + (1.0 - frame) * 0.5);
        vShirt = aShirt;`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        float bob = max(0.0, sin(uTime * (5.0 + aPhase * 3.0) + aPhase * 40.0));
        transformed.y += bob * uExcite * 0.35;`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vShirt;')
      .replace('#include <map_fragment>', `
        vec4 tx = texture2D(map, vMapUv);
        float isShirt = step(0.8, tx.g) * step(tx.r, 0.2);
        vec3 base = mix(tx.rgb, vShirt * (0.55 + 0.45 * tx.b), isShirt);
        diffuseColor.rgb *= base; diffuseColor.a *= tx.a;`);
    crowdMat.userData.shader = shader as unknown as { uniforms: Record<string, { value: number }> };
  };
  const crowd = new THREE.InstancedMesh(personGeo, crowdMat, crowdCount);
  const shirt = [def.seatColors[0], '#ffffff', '#ffcc00', '#1f5fbf', '#d32f2f', '#2e7d32', '#ff9933', '#212121', '#90caf9', '#f48fb1', ...teamColors, ...teamColors];
  const col = new THREE.Color();
  const occupancy = Math.min(1, crowdCount / Math.max(1, crowdSpots.length));
  let ci = 0;
  for (let i = 0; i < crowdSpots.length && ci < crowdCount; i++) {
    if (rnd() > occupancy) continue;
    const s = crowdSpots[i];
    const a = s.a + (rnd() - 0.5) * 0.004;
    const r = R(a) + s.z;
    pos.set(Math.sin(a) * r, s.y, Math.cos(a) * r);
    const face = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), a + Math.PI + (rnd() - 0.5) * 0.3);
    const sz = 0.92 + rnd() * 0.18;
    m4.compose(pos, face, new THREE.Vector3(sz, sz, sz));
    crowd.setMatrixAt(ci, m4);
    col.set(shirt[Math.floor(rnd() * shirt.length)]).multiplyScalar(0.8 + rnd() * 0.3);
    shirtCol[ci * 3] = col.r; shirtCol[ci * 3 + 1] = col.g; shirtCol[ci * 3 + 2] = col.b;
    variant[ci] = Math.floor(rnd() * 8);
    phase[ci] = rnd();
    ci++;
  }
  crowd.count = ci;
  personGeo.setAttribute('aVar', new THREE.InstancedBufferAttribute(variant, 1));
  personGeo.setAttribute('aShirt', new THREE.InstancedBufferAttribute(shirtCol, 3));

  // waving flags in the two teams' colours
  const flagMats: THREE.Material[] = [];
  if (teamColors.length && quality !== 'low') {
    const nFlags = quality === 'high' ? 90 : 50;
    const flagGeo = new THREE.PlaneGeometry(1.1, 0.7, 8, 1); flagGeo.translate(0.55, 1.75, 0);
    const flagMat = new THREE.MeshLambertMaterial({ side: THREE.DoubleSide });
    flagMats.push(flagMat);
    flagMat.onBeforeCompile = (sh) => {
      sh.uniforms.uTime = { value: 0 };
      flagMat.userData.shader = sh;
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nuniform float uTime;')
        .replace('#include <begin_vertex>', `#include <begin_vertex>
          float k = max(0.0, transformed.x);
          transformed.z += sin(uTime * 6.0 + transformed.x * 5.0 + float(gl_InstanceID)) * 0.18 * k;
          transformed.y += sin(uTime * 3.0 + float(gl_InstanceID)) * 0.05;`);
    };
    const flags = new THREE.InstancedMesh(flagGeo, flagMat, nFlags);
    const poleGeo = new THREE.CylinderGeometry(0.015, 0.015, 1.8, 4); poleGeo.translate(0, 1.0, 0);
    const poles = new THREE.InstancedMesh(poleGeo, new THREE.MeshBasicMaterial({ color: '#dddddd' }), nFlags);
    const fc = new THREE.Color();
    for (let i = 0; i < nFlags; i++) {
      const sp = crowdSpots[Math.floor(rnd() * crowdSpots.length)];
      if (!sp) break;
      const r = R(sp.a) + sp.z;
      pos.set(Math.sin(sp.a) * r, sp.y, Math.cos(sp.a) * r);
      const face = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), sp.a + Math.PI / 2);
      m4.compose(pos, face, new THREE.Vector3(1, 1, 1));
      flags.setMatrixAt(i, m4); poles.setMatrixAt(i, m4);
      fc.set(teamColors[i % teamColors.length]); flags.setColorAt(i, fc);
    }
    flags.frustumCulled = false; poles.frustumCulled = false;
    track(flagGeo); track(flagMat); track(poleGeo); track(poles.material as THREE.Material);
    env.add(flags, poles);
  }
  personGeo.setAttribute('aPhase', new THREE.InstancedBufferAttribute(phase, 1));
  crowd.frustumCulled = false;
  track(personGeo); track(crowdMat);
  env.add(crowd);

  // ------------------------------------------------ roof
  const topTier = tierTops[tierTops.length - 1];
  if (def.roof !== 'none') {
    const rp: number[] = [], ri: number[] = [];
    const roofIn = def.roof === 'canopy' ? topTier.rOff - 14 : topTier.rOff - 4;
    const roofOut = topTier.rOff + 1;
    const h0 = topTier.h + 9, h1 = topTier.h + 6;
    for (let i = 0; i <= N; i++) {
      const a = (i / N) * Math.PI * 2;
      const pi = P3(a, roofIn, h0), po = P3(a, roofOut, h1);
      rp.push(pi.x, pi.y, pi.z, po.x, po.y, po.z);
      if (i < N) { const k = i * 2; ri.push(k, k + 1, k + 3, k, k + 3, k + 2); }
    }
    const rg = new THREE.BufferGeometry();
    rg.setAttribute('position', new THREE.Float32BufferAttribute(rp, 3)); rg.setIndex(ri); rg.computeVertexNormals();
    const rm = new THREE.MeshStandardMaterial({ color: def.roof === 'canopy' ? '#e9edf2' : '#1b1d26', roughness: 0.6, metalness: 0.2, side: THREE.DoubleSide, transparent: def.roof === 'canopy', opacity: 0.92 });
    const roof = new THREE.Mesh(rg, rm);
    track(rg); track(rm);
    env.add(roof);
    // LED ring on the roof edge
    const led: THREE.Vector3[] = [];
    for (let i = 0; i < 200; i++) { const a = (i / 200) * Math.PI * 2; led.push(P3(a, roofIn, h0 - 0.4)); }
    const ledMesh = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(led, true), 300, 0.35, 4, true),
      new THREE.MeshBasicMaterial({ color: def.roof === 'ring' ? '#b44dff' : '#ffffff' }));
    track(ledMesh.geometry); track(ledMesh.material as THREE.Material);
    env.add(ledMesh);
    // support columns
    const colGeo = track(new THREE.CylinderGeometry(0.5, 0.7, h1, 8));
    const colMat = track(new THREE.MeshStandardMaterial({ color: '#9aa1ab', metalness: 0.4, roughness: 0.5 }));
    for (let i = 0; i < 24; i++) {
      const a = (i / 24) * Math.PI * 2;
      const p = P3(a, roofOut, 0);
      const c = new THREE.Mesh(colGeo, colMat); c.position.set(p.x, h1 / 2, p.z); env.add(c);
    }
  }

  // ------------------------------------------------ floodlights
  const towerMat = track(new THREE.MeshStandardMaterial({ color: '#8d939c', metalness: 0.5, roughness: 0.5 }));
  const lampTex = track(canvasTex(128, 64, (c) => {
    c.fillStyle = '#222'; c.fillRect(0, 0, 128, 64);
    for (let y = 0; y < 4; y++) for (let x = 0; x < 8; x++) {
      const g = c.createRadialGradient(8 + x * 16, 8 + y * 16, 1, 8 + x * 16, 8 + y * 16, 8);
      g.addColorStop(0, '#ffffff'); g.addColorStop(1, night ? '#fff7d6' : '#8a8a8a');
      c.fillStyle = g; c.fillRect(x * 16 + 1, y * 16 + 1, 14, 14);
    }
  }));
  const lampMat = track(new THREE.MeshStandardMaterial({ map: lampTex, emissive: '#ffffff', emissiveMap: lampTex, emissiveIntensity: night ? 2.2 : time === 'evening' ? 0.9 : 0.2 }));
  const glowTex = track(canvasTex(128, 128, (c) => {
    const g = c.createRadialGradient(64, 64, 2, 64, 64, 64); g.addColorStop(0, 'rgba(255,250,230,1)'); g.addColorStop(0.25, 'rgba(255,240,200,0.45)'); g.addColorStop(1, 'rgba(255,240,200,0)');
    c.fillStyle = g; c.fillRect(0, 0, 128, 128);
  }));
  const nTowers = def.floodlights;
  for (let i = 0; i < nTowers; i++) {
    const a = (i / nTowers) * Math.PI * 2 + Math.PI / nTowers;
    const r = (def.roof !== 'none' ? topTier.rOff + 6 : topTier.rOff + 8);
    const height = def.roof !== 'none' ? topTier.h + 30 : 42;
    const p = P3(a, r - R(a) + R(a) - R(a) + 0, 0);
    const pr = R(a) + r;
    p.set(Math.sin(a) * pr, 0, Math.cos(a) * pr);
    const tower = new THREE.Mesh(track(new THREE.CylinderGeometry(0.6, 1.4, height, 8)), towerMat);
    tower.position.set(p.x, height / 2, p.z);
    env.add(tower);
    const head = new THREE.Mesh(track(new THREE.BoxGeometry(9, 5, 0.6)), lampMat);
    head.position.set(p.x, height + 2, p.z);
    head.lookAt(0, 0, 0);
    env.add(head);
    if (night || time === 'evening') {
      const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: night ? 0.9 : 0.4 }));
      glow.scale.set(26, 26, 1);
      glow.position.copy(head.position).multiplyScalar(0.985);
      track(glow.material);
      env.add(glow);
    }
  }

  // ------------------------------------------------ scoreboard screen
  const sbCanvas = document.createElement('canvas'); sbCanvas.width = 1024; sbCanvas.height = 512;
  const sbTex = track(new THREE.CanvasTexture(sbCanvas)); sbTex.colorSpace = THREE.SRGBColorSpace;
  const sbMat = track(new THREE.MeshBasicMaterial({ map: sbTex, toneMapped: false }));
  const sbA = Math.PI * 0.32;
  const sbR = R(sbA) + (topTier ? topTier.rOff + 2 : 30);
  const sbPos = new THREE.Vector3(Math.sin(sbA) * sbR, (topTier?.h ?? 8) + 6, Math.cos(sbA) * sbR);
  const screen = new THREE.Mesh(track(new THREE.PlaneGeometry(26, 13)), sbMat);
  screen.position.copy(sbPos); screen.lookAt(0, sbPos.y - 6, 0);
  const frame = new THREE.Mesh(track(new THREE.BoxGeometry(27.5, 14.5, 1)), track(new THREE.MeshStandardMaterial({ color: '#15171c' })));
  frame.position.copy(sbPos).multiplyScalar(1.006); frame.lookAt(0, sbPos.y - 6, 0);
  const post = new THREE.Mesh(track(new THREE.BoxGeometry(2, sbPos.y, 2)), towerMat); post.position.set(sbPos.x * 1.01, sbPos.y / 2, sbPos.z * 1.01);
  env.add(frame, screen, post);
  const updateScoreboard = (lines: string[]) => {
    const c = sbCanvas.getContext('2d')!;
    const g = c.createLinearGradient(0, 0, 0, 512); g.addColorStop(0, '#081226'); g.addColorStop(1, '#02060f');
    c.fillStyle = g; c.fillRect(0, 0, 1024, 512);
    c.fillStyle = '#ffcc00'; c.fillRect(0, 0, 1024, 70);
    c.fillStyle = '#081226'; c.font = 'bold 48px Arial'; c.textAlign = 'center'; c.fillText(def.name.toUpperCase(), 512, 52);
    c.textAlign = 'left';
    lines.forEach((l, i) => {
      c.fillStyle = i === 0 ? '#ffffff' : '#9fd3ff';
      c.font = i === 0 ? 'bold 110px Arial' : 'bold 52px Arial';
      c.fillText(l, 50, i === 0 ? 200 : 200 + i * 78);
    });
    sbTex.needsUpdate = true;
  };
  updateScoreboard(['CRICKET 26', 'Quick Play']);
  let clock = 0;

  // ------------------------------------------------ pavilion / dressing rooms
  const pavA = -Math.PI * 0.38;
  const pavR = R(pavA) + (topTier ? 9 : 10);
  const pav = new THREE.Group();
  const winTex = track(canvasTex(256, 128, (c) => {
    c.fillStyle = def.pavilion ? '#d9c7a3' : '#cfd4da'; c.fillRect(0, 0, 256, 128);
    for (let y = 0; y < 3; y++) for (let x = 0; x < 8; x++) {
      c.fillStyle = night ? '#ffe9a8' : '#3b4a5e'; c.fillRect(8 + x * 31, 10 + y * 40, 20, 26);
    }
  }));
  const pavBody = new THREE.Mesh(track(new THREE.BoxGeometry(34, 12, 12)), track(new THREE.MeshStandardMaterial({ map: winTex, emissive: night ? '#ffffff' : '#000000', emissiveMap: night ? winTex : null, emissiveIntensity: 0.25, roughness: 0.8 })));
  pavBody.position.y = 6;
  pav.add(pavBody);
  const balcony = new THREE.Mesh(track(new THREE.BoxGeometry(34, 0.4, 3)), track(new THREE.MeshStandardMaterial({ color: '#f5f5f5' })));
  balcony.position.set(0, 4.2, -7.2); pav.add(balcony);
  if (def.pavilion) {
    const roofG = new THREE.ConeGeometry(14, 6, 4); roofG.rotateY(Math.PI / 4); roofG.scale(1.7, 1, 0.65);
    const proof = new THREE.Mesh(track(roofG), track(new THREE.MeshStandardMaterial({ color: '#7b2d26', roughness: 0.8 })));
    proof.position.y = 15; pav.add(proof);
    const clock = new THREE.Mesh(track(new THREE.CylinderGeometry(1.4, 1.4, 0.3, 24)), track(new THREE.MeshStandardMaterial({ color: '#ffffff' })));
    clock.rotation.x = Math.PI / 2; clock.position.set(0, 10.5, -6.2); pav.add(clock);
  }
  pav.position.set(Math.sin(pavA) * pavR, def.pavilion || def.tiers === 1 ? 0 : 0, Math.cos(pavA) * pavR);
  pav.lookAt(0, 0, 0); pav.rotateY(Math.PI);
  group.add(pav); // pavilion stays put (players walk to it)

  // ------------------------------------------------ scenery
  if (def.trees) {
    const trunk = track(new THREE.CylinderGeometry(0.35, 0.5, 5, 6));
    const trunkMat = track(new THREE.MeshStandardMaterial({ color: '#5b4026' }));
    const leafGeo = def.water ? track(new THREE.ConeGeometry(3.2, 2.4, 7)) : track(new THREE.SphereGeometry(4, 8, 6));
    const leafMat = track(new THREE.MeshStandardMaterial({ color: def.water ? '#2f7d3b' : '#2e5e2a', roughness: 0.9 }));
    const nT = quality === 'low' ? 30 : 60;
    for (let i = 0; i < nT; i++) {
      const a = rnd() * Math.PI * 2;
      const r = R(a) + (topTier?.rOff ?? 20) + 6 + rnd() * 20;
      const tr = new THREE.Mesh(trunk, trunkMat);
      const s = 0.8 + rnd() * 0.8;
      tr.position.set(Math.sin(a) * r, 2.5 * s, Math.cos(a) * r); tr.scale.setScalar(s);
      const lf = new THREE.Mesh(leafGeo, leafMat);
      lf.position.set(tr.position.x, (def.water ? 6 : 7) * s, tr.position.z); lf.scale.setScalar(s * (def.water ? 1 : 1));
      if (def.water) { tr.scale.y = s * 1.8; tr.position.y = 4.5 * s; lf.position.y = 9 * s; }
      env.add(tr, lf);
    }
  }
  if (def.water) {
    const water = new THREE.Mesh(track(new THREE.PlaneGeometry(900, 900)), track(new THREE.MeshStandardMaterial({ color: '#1f6f99', roughness: 0.15, metalness: 0.3 })));
    water.rotation.x = -Math.PI / 2; water.position.y = -1.2;
    group.add(water);
  }
  // far ground disc to avoid void
  const far = new THREE.Mesh(track(new THREE.CircleGeometry(600, 48)), track(new THREE.MeshStandardMaterial({ color: def.water ? '#d8c89b' : '#3b5d33', roughness: 1 })));
  far.rotation.x = -Math.PI / 2; far.position.y = def.water ? -1.0 : -0.4;
  if (def.water) far.scale.setScalar(0.25);
  group.add(far);

  // merge static dressing that shares materials (boards, columns, trees, flags…) to cut draw calls
  mergeStatic(env, false);
  mergeStatic(group, false);

  return {
    group, env,
    stumps: { striker: sStr.g, other: sOth.g, strikerBails: sStr.bails, otherBails: sOth.bails },
    crowdMat,
    updateScoreboard,
    tick: (dt, excite) => {
      clock += dt;
      ribbonTex.offset.x = (clock * 0.01) % 1;
      const u = crowdMat.userData.shader?.uniforms;
      if (u) { u.uTime.value = clock; u.uExcite.value = excite; }
      for (const fm of flagMats) { const fu = (fm.userData.shader as { uniforms: Record<string, { value: number }> } | undefined)?.uniforms; if (fu) fu.uTime.value = clock; }
    },
    dispose: () => { disposables.forEach((d) => d.dispose()); },
  };
}

/** gradient sky dome with optional stars */
export function buildSky(top: string, bottom: string, night: boolean): THREE.Group {
  const g = new THREE.Group();
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false,
    uniforms: { top: { value: new THREE.Color(top) }, bottom: { value: new THREE.Color(bottom) } },
    vertexShader: 'varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: 'uniform vec3 top; uniform vec3 bottom; varying vec3 vP; void main(){ float h = clamp(vP.y*1.6+0.05,0.0,1.0); gl_FragColor = vec4(mix(bottom, top, pow(h,0.7)),1.0); }',
  });
  const sky = new THREE.Mesh(new THREE.SphereGeometry(800, 32, 16), mat);
  g.add(sky);
  if (!night) {
    const cv = document.createElement('canvas'); cv.width = 1024; cv.height = 256;
    const c = cv.getContext('2d')!;
    const r = mulberry32(77);
    for (let i = 0; i < 70; i++) {
      const x = r() * 1024, y = 60 + r() * 140, rad = 20 + r() * 60;
      for (let k = 0; k < 6; k++) {
        const cx = x + (r() - 0.5) * rad * 2, cy = y + (r() - 0.5) * rad * 0.5, cr = rad * (0.5 + r() * 0.6);
        const gr = c.createRadialGradient(cx, cy, 0, cx, cy, cr);
        gr.addColorStop(0, 'rgba(255,255,255,0.55)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
        c.fillStyle = gr; c.fillRect(cx - cr, cy - cr, cr * 2, cr * 2);
      }
    }
    const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace; tex.wrapS = THREE.RepeatWrapping;
    const clouds = new THREE.Mesh(new THREE.CylinderGeometry(760, 760, 260, 48, 1, true),
      new THREE.MeshBasicMaterial({ map: tex, transparent: true, side: THREE.BackSide, depthWrite: false, fog: false, color: bottom }));
    clouds.position.y = 170;
    clouds.userData.spin = true;
    g.add(clouds);
  }
  if (night) {
    const r = mulberry32(5);
    const pts: number[] = [];
    for (let i = 0; i < 1500; i++) {
      const th = r() * Math.PI * 2, ph = Math.acos(r() * 0.9 + 0.1);
      pts.push(Math.sin(ph) * Math.cos(th) * 780, Math.cos(ph) * 780, Math.sin(ph) * Math.sin(th) * 780);
    }
    const sg = new THREE.BufferGeometry(); sg.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
    g.add(new THREE.Points(sg, new THREE.PointsMaterial({ color: '#ffffff', size: 1.6, sizeAttenuation: false })));
  }
  return g;
}
