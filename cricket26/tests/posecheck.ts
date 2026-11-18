import * as THREE from 'three';
// minimal canvas stub for the shirt-back texture
(globalThis as unknown as { document: unknown }).document = { createElement: () => ({ width: 0, height: 0, getContext: () => new Proxy({}, { get: () => () => ({ addColorStop() {} }) }) }) };
const { buildRig, applyActor } = await import('../src/components/three/PlayerRig');
const rig = buildRig({ jersey: '#00f', pants: '#00f', accent: '#000', skin: '#a87', hair: '#111', kind: 'batter', helmet: true, seed: 1 });
const scene = new THREE.Scene(); scene.add(rig.mirror);
const show = (param: string, t: number) => {
  const anim = param === 'idle' || param === 'lifted' ? 'stance' : 'swing';
  for (let i = 0; i < 60; i++) applyActor(rig, { x: 0, y: 0, z: 0, rotY: 0, anim, animT: Math.max(0, t - 0.6 + i * 0.01), animP: param, animSide: 1, moveSpeed: 0, holdsBall: false, visible: true, mirror: 1 }, 0.01);
  scene.updateMatrixWorld(true);
  const w = (o: THREE.Object3D) => { const v = o.getWorldPosition(new THREE.Vector3()); return `(${v.x.toFixed(2)},${v.y.toFixed(2)},${v.z.toFixed(2)})`; };
  const batTip = rig.bat ? rig.bat.localToWorld(new THREE.Vector3(0, -0.84, 0)) : null;
  console.log(`${param.padEnd(16)} t=${t}  hips${w(rig.hips)} chest${w(rig.chest)} head${w(rig.head)} frontAnk${w(rig.lAnk)} backAnk${w(rig.rAnk)} frontKnee${w(rig.lKnee)} handTop${w(rig.lHand)} batToe(${batTip?.x.toFixed(2)},${batTip?.y.toFixed(2)},${batTip?.z.toFixed(2)})`);
};
console.log('root frame: +x towards bowler, +z chest/off side (rotY=0)');
show('idle', 0.5); show('lifted', 0.5);
for (const t of [0.1, 0.19, 0.24, 0.46]) show('drive|55|f', t);
show('cut|100|b', 0.24); show('pull|-80|b', 0.24); show('sweep|-90|f', 0.24); show('defend|0|f', 0.24);
