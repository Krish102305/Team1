import { useEffect, useMemo, useRef } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import type { GameEngine, Actor } from '../../game/GameEngine';
import { buildRig, applyActor, Rig, mat, setIdentity, disposeRig } from './PlayerRig';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { EffectComposer, Bloom, Vignette, HueSaturation, BrightnessContrast, SMAA } from '@react-three/postprocessing';
import { buildSky, buildStadium, Quality, StadiumHandles } from './StadiumBuilder';
import { STADIUM_MAP, StadiumDef } from '../../data/stadiums';
import { TEAM_MAP, PLAYER_MAP } from '../../data/teams';
import type { TimeOfDay } from '../../game/types';
import { BATTER_Z, STUMPS_Z } from '../../game/constants';
import { hashString } from '../../utils/random';
import { useGame, CameraPreset } from '../../store/gameStore';
import { ReplayFrame } from '../../game/Replay';
import { audio } from '../../game/Audio';
import { oversText } from '../../game/MatchManager';

const BLOB_GEO = new THREE.CircleGeometry(0.42, 16);
const BLOB_MAT = new THREE.MeshBasicMaterial({ color: '#000000', transparent: true, opacity: 0.28, depthWrite: false });
const SKIN = ['#7a4a2a', '#8f5d3b', '#a87452', '#c08a66', '#d4a585', '#5e3a22', '#6e4630', '#b98463'];

export function Lighting({ def, time, quality }: { def: StadiumDef; time: TimeOfDay; quality: Quality }) {
  const sky = def.sky[time];
  const { scene, gl } = useThree();
  const skyGroup = useMemo(() => buildSky(sky.top, sky.bottom, time === 'night'), [sky.top, sky.bottom, time]);
  useEffect(() => {
    scene.fog = new THREE.Fog(sky.fog, 180, 950);
    gl.toneMappingExposure = time === 'night' ? 1.0 : time === 'evening' ? 1.02 : 1.05;
    // image-based lighting for nicer helmets, bats, pads and boards
    if (quality === 'low') { return () => { scene.fog = null; }; }
    const pmrem = new THREE.PMREMGenerator(gl);
    const envTex = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    scene.environment = envTex;
    (scene as unknown as { environmentIntensity: number }).environmentIntensity = time === 'night' ? 0.25 : 0.45;
    return () => { scene.fog = null; scene.environment = null; envTex.dispose(); pmrem.dispose(); };
  }, [scene, gl, sky.fog, time, quality]);
  useEffect(() => () => { skyGroup.traverse((o) => { const m = o as THREE.Mesh; m.geometry?.dispose(); (m.material as THREE.Material | undefined)?.dispose?.(); }); }, [skyGroup]);
  useFrame((_, dt) => { skyGroup.children.forEach((c) => { if (c.userData.spin) c.rotation.y += dt * 0.004; }); });
  const sunPos: [number, number, number] = time === 'day' ? [45, 90, 35] : time === 'evening' ? [90, 38, -55] : [25, 95, 15];
  const mapSize = quality === 'high' ? 4096 : quality === 'medium' ? 2048 : 1024;
  return (
    <>
      <primitive object={skyGroup} />
      <hemisphereLight args={[sky.top, def.outfield, sky.ambient * 0.9]} />
      <ambientLight intensity={sky.ambient * 0.25} />
      <directionalLight
        position={sunPos}
        intensity={sky.sunIntensity}
        color={sky.sun}
        castShadow={quality !== 'low'}
        shadow-mapSize-width={mapSize}
        shadow-mapSize-height={mapSize}
        shadow-camera-left={-55}
        shadow-camera-right={55}
        shadow-camera-top={55}
        shadow-camera-bottom={-55}
        shadow-camera-near={10}
        shadow-camera-far={260}
        shadow-bias={-0.0004}
        shadow-normalBias={0.02}
      />
      {time === 'night' && <directionalLight position={[-40, 70, -30]} intensity={1.1} color="#e8eeff" />}
    </>
  );
}

export function StadiumObject({ def, time, quality, onReady, teamColors }: { def: StadiumDef; time: TimeOfDay; quality: Quality; onReady?: (h: StadiumHandles) => void; teamColors?: string[] }) {
  const handles = useMemo(() => buildStadium(def, time, quality, teamColors ?? []), [def, time, quality, teamColors]);
  useEffect(() => { onReady?.(handles); return () => handles.dispose(); }, [handles, onReady]);
  return <primitive object={handles.group} />;
}

// ---------------------------------------------------------------- ball
function makeBallMesh(color: 'white' | 'red') {
  const g = new THREE.Group();
  const s = new THREE.Mesh(new THREE.SphereGeometry(0.036, 20, 14), new THREE.MeshStandardMaterial({ color: color === 'white' ? '#f6f6f2' : '#b3121d', roughness: 0.35 }));
  s.castShadow = true;
  const seam = new THREE.Mesh(new THREE.TorusGeometry(0.0362, 0.0042, 6, 28), new THREE.MeshStandardMaterial({ color: color === 'white' ? '#3a5bd9' : '#f5f0e6', roughness: 0.5 }));
  g.add(s, seam);
  g.scale.setScalar(1.55);
  return g;
}

// ---------------------------------------------------------------- the world
function World({ engine, def, quality }: { engine: GameEngine; def: StadiumDef; quality: Quality }) {
  const { camera, scene } = useThree();
  (window as unknown as { __scene: THREE.Scene }).__scene = scene;
  const stadiumRef = useRef<StadiumHandles | null>(null);
  const rigsRef = useRef<{ version: number; rigs: Rig[]; group: THREE.Group }>({ version: -1, rigs: [], group: new THREE.Group() });
  const ball = useMemo(() => makeBallMesh(def.ballColor), [def.ballColor]);
  const blob = useMemo(() => {
    const m = new THREE.Mesh(new THREE.CircleGeometry(0.09, 16), new THREE.MeshBasicMaterial({ color: '#000', transparent: true, opacity: 0.35, depthWrite: false }));
    m.rotation.x = -Math.PI / 2;
    return m;
  }, []);
  const trail = useMemo(() => {
    const n = 26;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
    const line = new THREE.Line(geo, new THREE.LineBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.45 }));
    line.frustumCulled = false;
    return { line, n, pts: [] as THREE.Vector3[] };
  }, []);
  const marker = useMemo(() => {
    // bowling crosshair: reticle texture + aiming beam
    const cv = document.createElement('canvas'); cv.width = 256; cv.height = 256;
    const c = cv.getContext('2d')!;
    c.strokeStyle = '#ffd400'; c.lineWidth = 7;
    c.beginPath(); c.arc(128, 128, 92, 0, Math.PI * 2); c.stroke();
    c.lineWidth = 4; c.beginPath(); c.arc(128, 128, 46, 0, Math.PI * 2); c.stroke();
    c.lineWidth = 6;
    for (const [x1, y1, x2, y2] of [[128, 8, 128, 66], [128, 190, 128, 248], [8, 128, 66, 128], [190, 128, 248, 128]]) { c.beginPath(); c.moveTo(x1, y1); c.lineTo(x2, y2); c.stroke(); }
    c.fillStyle = '#ff2d2d'; c.beginPath(); c.arc(128, 128, 11, 0, Math.PI * 2); c.fill();
    const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace;
    const g = new THREE.Group();
    const reticle = new THREE.Mesh(new THREE.PlaneGeometry(1.7, 1.7), new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, toneMapped: false }));
    reticle.rotation.x = -Math.PI / 2;
    const glow = new THREE.Mesh(new THREE.CircleGeometry(0.9, 32), new THREE.MeshBasicMaterial({ color: '#ffd400', transparent: true, opacity: 0.12, depthWrite: false }));
    glow.rotation.x = -Math.PI / 2; glow.position.y = -0.003;
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 1.6, 6), new THREE.MeshBasicMaterial({ color: '#ffd400', transparent: true, opacity: 0.5, depthWrite: false }));
    beam.position.y = 0.8;
    g.add(glow, reticle, beam);
    g.position.y = 0.03;
    g.userData.reticle = reticle;
    return g;
  }, []);
  const aimPath = useMemo(() => {
    const m = new THREE.Mesh(new THREE.BufferGeometry(), new THREE.MeshBasicMaterial({ color: '#ffe066', transparent: true, opacity: 0.75, depthWrite: false, toneMapped: false }));
    m.frustumCulled = false;
    m.userData.key = '';
    return m;
  }, []);
  const planRing = useMemo(() => {
    const m = new THREE.Mesh(new THREE.RingGeometry(0.22, 0.34, 32), new THREE.MeshBasicMaterial({ color: '#ff7a00', transparent: true, opacity: 0.95, depthWrite: false, toneMapped: false }));
    m.rotation.x = -Math.PI / 2; m.position.y = 0.025; m.scale.setScalar(1.6);
    return m;
  }, []);
  const bounceMark = useMemo(() => {
    const m = new THREE.Mesh(new THREE.RingGeometry(0.08, 0.17, 24), new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0, depthWrite: false }));
    m.rotation.x = -Math.PI / 2; m.position.y = 0.02;
    return m;
  }, []);
  const camState = useRef({ pos: new THREE.Vector3(0, 30, 80), look: new THREE.Vector3(0, 0, 0), shot: '' });
  const excite = useRef(0);
  const settings = useGame((s) => s.settings);

  useEffect(() => {
    scene.add(rigsRef.current.group, ball, blob, trail.line, marker, bounceMark, aimPath, planRing);
    const g = rigsRef.current.group;
    return () => { scene.remove(g, ball, blob, trail.line, marker, bounceMark, aimPath, planRing); };
  }, [scene, ball, blob, trail, marker, bounceMark, aimPath, planRing]);

  // excite crowd on big events
  useEffect(() => {
    const unsub = useGame.subscribe((s, p) => {
      if (s.notification && s.notification !== p.notification) {
        const k = s.notification.kind;
        if (k === 'six' || k === 'wicket') excite.current = 1;
        else if (k === 'four') excite.current = 0.75;
        else if (k === 'milestone' || k === 'result') excite.current = 0.9;
      }
      if (s.hudVersion !== p.hudVersion && stadiumRef.current) {
        const m = engine.match, inn = m.inn;
        const lines = [`${TEAM_MAP[inn.battingTeamId].short} ${inn.runs}/${inn.wickets}`, `Overs ${oversText(inn.legalBalls)}${inn.target ? `   Target ${inn.target}` : ''}`,
          `${engine.striker.short} ${inn.batters[inn.strikerId]?.runs ?? 0}*   ${TEAM_MAP[inn.bowlingTeamId].short} bowling`];
        stadiumRef.current.updateScoreboard(lines);
      }
    });
    return unsub;
  }, [engine]);

  const buildRigs = () => {
    const R = rigsRef.current;
    for (const r of R.rigs) { R.group.remove(r.mirror); disposeRig(r); }
    R.rigs = engine.actors.map((a: Actor) => {
      const team = a.teamId ? TEAM_MAP[a.teamId] : null;
      const h = hashString(a.playerId ?? String(Math.random()));
      const isKeeper = a.gear === 'keeper';
      const rig = buildRig({
        jersey: team ? (isKeeper ? team.secondary : team.primary) : '#ffffff',
        pants: team ? team.pants : '#1f2533',
        accent: team ? team.accent : '#333333',
        skin: SKIN[h % SKIN.length],
        hair: '#1b1410',
        kind: a.kind === 'umpire' ? 'umpire' : isKeeper ? 'keeper' : a.kind === 'batter' ? 'batter' : 'fielder',
        helmet: a.kind === 'batter',
        secondary: team ? (isKeeper ? team.primary : team.secondary) : '#333333',
        seed: h,
      });
      if (quality === 'low') {
        const blobS = new THREE.Mesh(BLOB_GEO, BLOB_MAT);
        blobS.rotation.x = -Math.PI / 2; blobS.position.y = 0.015;
        rig.root.add(blobS);
      }
      R.group.add(rig.mirror);
      return rig;
    });
    R.version = engine.actorsVersion;
  };

  const tmp = useMemo(() => ({ v: new THREE.Vector3(), v2: new THREE.Vector3(), look: new THREE.Vector3() }), []);

  useFrame((_, rawDt) => {
    const dt = Math.min(rawDt, 0.1);
    engine.update(dt);
    if (rigsRef.current.version !== engine.actorsVersion || rigsRef.current.rigs.length !== engine.actors.length) buildRigs();
    const frame: ReplayFrame | null = engine.replay.active ? engine.replay.frame() : null;
    const actors = frame ? frame.actors : engine.actors;
    const rigs = rigsRef.current.rigs;
    for (let i = 0; i < rigs.length && i < actors.length; i++) {
      const pid = actors[i].playerId;
      if (pid && PLAYER_MAP[pid]) { const p = PLAYER_MAP[pid]; const t = TEAM_MAP[p.teamId]; setIdentity(rigs[i], p.name, p.number, engine.actors[i]?.gear === 'keeper' ? t.primary : t.secondary); }
    }
    for (let i = 0; i < rigs.length && i < actors.length; i++) applyActor(rigs[i], actors[i], engine.replay.active ? dt * engine.replay.speed : dt * (engine.paused ? 0 : 1));

    // ball
    const bp = frame ? frame.ball : engine.ball.p;
    const showBall = frame ? frame.ballVisible : (engine.ballMode === 'flight' || engine.ballMode === 'throw' || engine.ballMode === 'dead');
    ball.visible = showBall && bp.y > -2;
    ball.position.set(bp.x, bp.y, bp.z);
    // keep the ball readable at broadcast distances
    ball.scale.setScalar(Math.max(2.1, camera.position.distanceTo(ball.position) * 0.032));
    if (!frame) {
      const v = engine.ball.v;
      const sp = Math.hypot(v.x, v.z);
      if (sp > 0.1) { ball.rotation.y = Math.atan2(v.x, v.z); ball.rotateX(engine.ball.spin * dt * 0.08); }
    }
    blob.visible = ball.visible;
    blob.position.set(bp.x, 0.02, bp.z);
    const hb = Math.max(0, bp.y);
    blob.scale.setScalar(1 + hb * 0.15);
    (blob.material as THREE.MeshBasicMaterial).opacity = Math.max(0.05, 0.4 - hb * 0.03);
    // trail after the bat
    const hit = engine.d.hitBat && engine.ballMode === 'flight';
    if ((hit || frame) && ball.visible) {
      trail.pts.push(new THREE.Vector3(bp.x, bp.y, bp.z));
      if (trail.pts.length > trail.n) trail.pts.shift();
    } else trail.pts.length = 0;
    const arr = trail.line.geometry.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < trail.n; i++) {
      const p = trail.pts[Math.max(0, Math.min(trail.pts.length - 1, i))] ?? new THREE.Vector3(0, -50, 0);
      arr.setXYZ(i, p.x, p.y, p.z);
    }
    arr.needsUpdate = true;
    trail.line.visible = trail.pts.length > 2;

    // stumps & bails
    const st = stadiumRef.current;
    if (st) {
      const bails = frame ? frame.bails : engine.bails;
      const flyBail = (b: THREE.Mesh, t: number, k: number, dir: number) => {
        const home = b.userData.home as THREE.Vector3;
        if (t <= 0) { b.position.copy(home); b.rotation.set(0, 0, Math.PI / 2); return; }
        const tt = Math.min(t, 1.2);
        const vx = (k ? 0.8 : -0.9), vy = 2.6 + k * 0.6, vz = dir * (1.5 + k * 0.5);
        b.position.set(home.x + vx * tt, Math.max(0.01, home.y + vy * tt - 4.9 * tt * tt), home.z + vz * tt);
        b.rotation.set(tt * 9 * (k ? 1 : -1), tt * 4, Math.PI / 2 + tt * 12);
      };
      st.stumps.strikerBails.forEach((b, k) => flyBail(b, bails.striker, k, 1));
      st.stumps.otherBails.forEach((b, k) => flyBail(b, bails.other, k, -1));
      const tilt = (g: THREE.Group, t: number) => { g.rotation.x = t > 0 ? Math.min(0.25, t * 2) : 0; };
      tilt(st.stumps.striker, bails.striker); tilt(st.stumps.other, bails.other);
      st.env.rotation.y = engine.endFlip ? Math.PI : 0;
      excite.current = Math.max(0, excite.current - dt * 0.22);
      st.tick(dt, excite.current);
      audio.setAmbience(0.25 + excite.current * 0.6);
    }

    // where the delivery pitched (fades out)
    const plan = engine.d.plan;
    const bm = bounceMark.material as THREE.MeshBasicMaterial;
    const pm = settings.pitchMarker;
    const showPreview = engine.userRole === 'bat' && (pm === 'on' || (pm === 'auto' && (engine.config.difficulty === 'easy' || engine.config.difficulty === 'medium')));
    if (!frame && plan && plan.bounceIndex >= 0 && (engine.phase === 'delivery' || engine.phase === 'live' || engine.phase === 'dead')) {
      const pb = plan.path[plan.bounceIndex];
      const since = engine.t - engine.d.releaseT - pb.t;
      bounceMark.position.set(pb.x, 0.02, pb.z);
      if (since < 0 && showPreview) { bm.color.set('#ffd400'); bm.opacity = 0.9; bounceMark.scale.setScalar(1.6); }
      else { bm.color.set('#ffffff'); bounceMark.scale.setScalar(1); bm.opacity = since > 0 ? Math.max(0, 0.75 - since * 0.35) : 0; }
    } else bm.opacity = 0;

    // bowling target marker
    const showMarker = engine.userRole === 'bowl' && (engine.phase === 'ready' || engine.phase === 'runUp');
    marker.visible = showMarker;
    aimPath.visible = showMarker && settings.aimPath;
    if (showMarker) {
      marker.position.set(engine.targetLine * engine.offSign, 0.03, STUMPS_Z - engine.targetLen);
      const pulse = 1 + Math.sin(performance.now() * 0.006) * 0.06;
      (marker.userData.reticle as THREE.Mesh).scale.setScalar(pulse);
      if (aimPath.visible) {
        const key = `${engine.targetLine.toFixed(2)}|${engine.targetLen.toFixed(2)}|${engine.bowlType}|${engine.bowlVar}|${engine.aroundWicket}|${engine.inn.currentBowlerId}|${engine.offSign}`;
        if (key !== aimPath.userData.key) {
          aimPath.userData.key = key;
          const pts = engine.previewPath().map((p) => new THREE.Vector3(p.x, p.y, p.z));
          if (pts.length > 2) {
            aimPath.geometry.dispose();
            aimPath.geometry = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 90, 0.03, 6, false);
          }
        }
      }
    }
    // batting aid: reveal where the AI bowler is aiming during the run-up
    const pd = engine.plannedDelivery;
    planRing.visible = !frame && settings.bowlerReveal && engine.userRole === 'bat' && engine.phase === 'runUp' && !!pd;
    if (planRing.visible && pd) { planRing.position.set(pd.x, 0.025, pd.z); planRing.scale.setScalar(1.6 + Math.sin(performance.now() * 0.008) * 0.15); }

    updateCamera(engine, camera as THREE.PerspectiveCamera, camState.current, dt, CAM_ORDER[(CAM_ORDER.indexOf(settings.camera) + engine.camMode) % 3], settings.cameraSmoothing, frame, tmp);
  });

  const teamColors = useMemo(() => { const a = TEAM_MAP[engine.config.userTeamId], b = TEAM_MAP[engine.config.aiTeamId]; return [a.primary, b.primary, a.secondary, b.secondary]; }, [engine]);
  const onReady = useMemo(() => (h: StadiumHandles) => { stadiumRef.current = h; useGame.getState().bumpHud(); }, []);

  return (
    <>
      <StadiumObject def={def} time={engine.config.timeOfDay} quality={quality} onReady={onReady} teamColors={teamColors} />
      {/* invisible plane for mouse targeting */}
      <mesh rotation-x={-Math.PI / 2} position={[0, 0.03, 0]} onPointerMove={(e) => engine.setTargetFromWorld(e.point.x, e.point.z)}>
        <planeGeometry args={[8, 26]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} />
      </mesh>
    </>
  );
}

// ---------------------------------------------------------------- camera director
const CAM_ORDER: CameraPreset[] = ['broadcast', 'close', 'high'];
const BAT_CAMS: Record<CameraPreset, { pos: [number, number, number]; look: [number, number, number]; fov: number }> = {
  broadcast: { pos: [0, 4.3, 20.5], look: [0, 0.5, -3], fov: 40 },
  close: { pos: [0, 2.9, 15.8], look: [0, 0.9, -2], fov: 46 },
  high: { pos: [0, 8.5, 26], look: [0, 0.0, -3], fov: 38 },
};

function damp3(cur: THREE.Vector3, target: THREE.Vector3, lambda: number, dt: number) {
  const k = 1 - Math.exp(-lambda * dt);
  cur.lerp(target, k);
}

function updateCamera(e: GameEngine, cam: THREE.PerspectiveCamera, cs: { pos: THREE.Vector3; look: THREE.Vector3; shot: string }, dt: number,
  preset: CameraPreset, smoothing: number, frame: ReplayFrame | null, tmp: { v: THREE.Vector3; v2: THREE.Vector3; look: THREE.Vector3 }) {
  const P = tmp.v, L = tmp.look;
  let lambda = 2.2 + (1 - smoothing) * 5;
  let fov = 45;
  const ball = frame ? frame.ball : e.ball.p;
  const userRole = e.userRole;
  const cut = (name: string) => { if (cs.shot !== name) { cs.shot = name; return true; } return false; };
  const bc = BAT_CAMS[preset];
  const bowlingView = () => { P.set(-e.bowlerSide() * 0.9, 8.2, -STUMPS_Z - 21); L.set(0, 0.2, STUMPS_Z - 3.5); fov = 24; };
  const battingView = () => { P.set(...bc.pos); L.set(...bc.look); fov = bc.fov; };
  if (frame) {
    const cams = e.replay.cam;
    lambda = 6;
    if (cams === 0) { P.set(-28 * e.offSign, 3.5, ball.z * 0.6 + 1); L.set(ball.x * 0.5, 1, ball.z); fov = 32; }
    else if (cams === 1) { P.set(-e.offSign * 0.6, 5.2, -STUMPS_Z - 14); L.set(ball.x * 0.6, Math.max(0.3, ball.y * 0.7), Math.min(ball.z, 30)); fov = 30; }
    else if (cams === 2) { P.set(0, 0.35, STUMPS_Z + 0.35); L.set(0, 0.6, -10); fov = 55; }
    else if (cams === 3) {
      tmp.v2.set(ball.x, 0, ball.z).normalize();
      P.set(ball.x - tmp.v2.x * 14, Math.max(3, ball.y + 4), ball.z - tmp.v2.z * 14 + (Math.abs(ball.z) < 12 ? 12 : 0)); L.set(ball.x, ball.y, ball.z); fov = 45;
    } else { P.set(ball.x * 0.5, 70, ball.z * 0.5 + 12); L.set(ball.x * 0.7, 0, ball.z * 0.7); fov = 45; }
    if (cut('replay' + cams)) { cs.pos.copy(P); cs.look.copy(L); }
  } else {
    switch (e.phase) {
      case 'intro': {
        const t = e.phaseT;
        const a = t * 0.16 - 0.9;
        const rr = 62 - t * 3.5;
        P.set(Math.sin(a) * rr, 24 - t * 2.6, Math.cos(a) * rr); L.set(0, 1, 0); fov = 55; lambda = 1.5;
        if (cut('intro')) cs.pos.copy(P);
        break;
      }
      case 'walkIn': {
        const r = e.runners.find((x) => x.playerId === e.walkInIds[0]) ?? e.runners[0];
        const a = e.actors[r.a];
        P.set(a.x + 4, 2.2, a.z + 6); L.set(a.x, 1.3, a.z); fov = 42; lambda = 2.5;
        if (cut('walkIn')) cs.pos.copy(P);
        break;
      }
      case 'selectBowler': case 'ready': case 'runUp': case 'delivery':
        if (userRole === 'bowl') bowlingView(); else battingView();
        lambda = e.phase === 'ready' ? 3 : 8;
        if (cut('play' + userRole)) { cs.pos.copy(P); cs.look.copy(L); }
        break;
      case 'live': case 'dead': {
        const d = e.d;
        const hit = d.hitBat || d.hitPad || d.touchedFielder;
        const dist = Math.hypot(ball.x, ball.z - BATTER_Z);
        if (d.wicket && e.phase === 'dead' && d.wicket.kind !== 'caught' && d.wicket.kind !== 'runout') {
          P.set(2.6 * e.offSign, 1.4, STUMPS_Z - 5); L.set(0, 0.6, STUMPS_Z); fov = 40; lambda = 3;
          break;
        }
        if (d.wicket?.kind === 'runout' && e.phase === 'dead') {
          const E = d.wicketBroken || 1;
          P.set(-12 * e.offSign, 2.5, E * STUMPS_Z); L.set(0, 0.8, E * STUMPS_Z); fov = 35; lambda = 3;
          break;
        }
        if (!hit && dist < 18) {
          if (userRole === 'bowl') bowlingView(); else battingView();
          lambda = 4;
          break;
        }
        // boundary / big hit tracking
        const r = Math.hypot(ball.x, ball.z);
        const ang = Math.atan2(ball.x, ball.z);
        const bR = e.boundaryAt(ang);
        const v = e.ball.v;
        const outward = (ball.x * v.x + ball.z * v.z) > 0;
        if ((d.boundary || (outward && r > bR - 22 && e.ballMode === 'flight')) && r > 25) {
          // boundary camera: beyond the rope looking back at the ball
          const bx = Math.sin(ang) * (bR + 9), bz = Math.cos(ang) * (bR + 9);
          tmp.v2.set(-Math.cos(ang), 0, Math.sin(ang)).multiplyScalar(14);
          P.set(bx + tmp.v2.x, 5 + Math.max(0, ball.y) * 0.4, bz + tmp.v2.z); L.set(ball.x, Math.max(0.5, ball.y), ball.z); fov = 48; lambda = 2.6;
          if (cut('boundary')) { cs.pos.copy(P); }
        } else if (e.ballMode === 'flight' && ball.y > 5 && d.hitBat && !d.bouncedSinceHit) {
          // ball-tracking cam for high balls
          tmp.v2.set(v.x, 0, v.z).normalize();
          P.set(ball.x - tmp.v2.x * 16, ball.y * 0.6 + 3, ball.z - tmp.v2.z * 16); L.set(ball.x, ball.y, ball.z); fov = 50; lambda = 3.5;
          cut('track');
        } else {
          // broadcast follow from the end opposite to the ball
          const behindBat = ball.z > BATTER_Z - 4;
          const endZ = behindBat ? -STUMPS_Z - 30 : STUMPS_Z + 32;
          P.set(ball.x * 0.35, 16 + Math.min(14, dist * 0.12), endZ * 0.9 + ball.z * 0.25); L.set(ball.x, Math.max(0, ball.y * 0.6), ball.z); fov = 40; lambda = 2.4;
          if (cut('follow' + behindBat)) { /* smooth swing */ }
        }
        break;
      }
      case 'inningsBreak': case 'matchOver': {
        const t = e.phaseT;
        P.set(Math.sin(t * 0.1) * 70, 22, Math.cos(t * 0.1) * 70); L.set(0, 2, 0); fov = 50; lambda = 1;
        break;
      }
    }
  }
  const ov = (window as unknown as { __camOverride?: { pos: number[]; look: number[]; fov?: number } }).__camOverride;
  if (ov) { P.set(ov.pos[0], ov.pos[1], ov.pos[2]); L.set(ov.look[0], ov.look[1], ov.look[2]); fov = ov.fov ?? 35; lambda = 50; }
  damp3(cs.pos, P, lambda, dt);
  damp3(cs.look, L, lambda * 1.4, dt);
  cam.position.copy(cs.pos);
  cam.lookAt(cs.look);
  if (Math.abs(cam.fov - fov) > 0.05) { cam.fov += (fov - cam.fov) * Math.min(1, dt * 3); cam.updateProjectionMatrix(); }
}

/** broadcast-style post-processing: bloom on lights, slight grade and vignette */
export function PostFX({ quality, time }: { quality: Quality; time: TimeOfDay }) {
  if (quality === 'low') return null;
  return (
    <EffectComposer multisampling={quality === 'high' ? 4 : 0} enableNormalPass={false}>
      <Bloom intensity={time === 'night' ? 0.85 : time === 'evening' ? 0.5 : 0.22} luminanceThreshold={time === 'night' ? 0.72 : 0.88} luminanceSmoothing={0.2} mipmapBlur />
      <HueSaturation saturation={0.06} />
      <BrightnessContrast contrast={0.07} brightness={0.0} />
      <Vignette eskil={false} offset={0.28} darkness={0.42} />
      {quality === 'medium' ? <SMAA /> : <></>}
    </EffectComposer>
  );
}

export function MatchCanvas({ engine }: { engine: GameEngine }) {
  const quality = useGame((s) => s.settings.quality);
  const def = STADIUM_MAP[engine.config.stadiumId];
  const dpr: [number, number] = quality === 'high' ? [1, 2] : quality === 'medium' ? [1, 1.5] : [0.75, 1];
  return (
    <Canvas shadows={quality !== 'low'} dpr={dpr} gl={{ antialias: quality === 'low', powerPreference: 'high-performance', stencil: false }}
      camera={{ fov: 45, near: 0.1, far: 2000, position: [0, 30, 90] }}>
      <Lighting def={def} time={engine.config.timeOfDay} quality={quality} />
      <World engine={engine} def={def} quality={quality} />
      <PostFX quality={quality} time={engine.config.timeOfDay} />
    </Canvas>
  );
}

export { mat };
