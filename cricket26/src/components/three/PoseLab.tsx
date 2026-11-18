import { useMemo } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { buildRig, applyActor } from './PlayerRig';
import { TEAM_MAP } from '../../data/teams';

/** Dev page: ?poselab=drive|55|f&t=0.24&cam=side — renders a batter frozen at a moment of a shot. */
function Lab({ param, t, cam }: { param: string; t: number; cam: string }) {
  const rig = useMemo(() => {
    const team = TEAM_MAP.IND;
    const r = buildRig({ jersey: team.primary, pants: team.pants, accent: team.accent, secondary: team.secondary, skin: '#a87452', hair: '#1b1410', kind: 'batter', helmet: true, seed: 3 });
    return r;
  }, []);
  const ground = useMemo(() => {
    const g = new THREE.Group();
    const m = new THREE.Mesh(new THREE.PlaneGeometry(40, 40), new THREE.MeshStandardMaterial({ color: '#4a8f3d' }));
    m.rotation.x = -Math.PI / 2; m.receiveShadow = true;
    const pitch = new THREE.Mesh(new THREE.PlaneGeometry(3, 22), new THREE.MeshStandardMaterial({ color: '#cdb57f' }));
    pitch.rotation.x = -Math.PI / 2; pitch.position.set(0, 0.005, 0);
    const crease = new THREE.Mesh(new THREE.PlaneGeometry(3, 0.05), new THREE.MeshBasicMaterial({ color: '#fff' }));
    crease.rotation.x = -Math.PI / 2; crease.position.set(0, 0.01, -0.5);
    g.add(m, pitch, crease);
    return g;
  }, []);
  useFrame(({ camera }) => {
    const anim = param === 'idle' || param === 'lifted' ? 'stance' : 'swing';
    // converge smoothing by stepping a few times at the requested time
    for (let i = 0; i < 40; i++) applyActor(rig, { x: 0, y: 0, z: 0, rotY: Math.PI / 2, anim, animT: Math.max(0, t - 0.4 + i * 0.01), animP: anim === 'stance' ? param : param, animSide: 1, moveSpeed: 0, holdsBall: false, visible: true, mirror: 1 }, 0.01);
    // batter faces off side (+x world), bowler is at -z world
    const views: Record<string, [number, number, number]> = { side: [0, 1.2, -3.6], front: [3.6, 1.3, -0.4], back: [0.6, 2.6, 6.5], leg: [-3.6, 1.3, -0.2], top: [0.01, 6, 0.3], diag: [2.8, 1.6, -2.6] };
    const p = views[cam] ?? views.side;
    camera.position.set(p[0], p[1], p[2]);
    camera.lookAt(0, 0.9, -0.1);
  });
  return (
    <>
      <primitive object={ground} />
      <primitive object={rig.mirror} />
    </>
  );
}

export function PoseLab() {
  const q = new URLSearchParams(window.location.search);
  const param = q.get('poselab') ?? 'drive|55|f';
  const t = Number(q.get('t') ?? 0.24);
  const cam = q.get('cam') ?? 'side';
  return (
    <div style={{ position: 'fixed', inset: 0 }}>
      <Canvas shadows camera={{ fov: 40 }}>
        <hemisphereLight args={['#cfe6ff', '#3a5f2a', 1.1]} />
        <directionalLight position={[4, 8, 3]} intensity={2.2} castShadow />
        <Lab param={param} t={t} cam={cam} />
      </Canvas>
      <div style={{ position: 'absolute', left: 10, top: 10, color: '#fff', font: '14px monospace', background: 'rgba(0,0,0,.5)', padding: 6 }}>{param} t={t} cam={cam}</div>
    </div>
  );
}
