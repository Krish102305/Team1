import { useMemo, useRef } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { useGame } from '../../store/gameStore';
import { Lighting, StadiumObject, PostFX } from '../three/MatchScene';
import type { StadiumHandles } from '../three/StadiumBuilder';
import { STADIUM_MAP } from '../../data/stadiums';
import { buildRig, applyActor } from '../three/PlayerRig';
import { TEAM_MAP } from '../../data/teams';
import * as THREE from 'three';
import { audio } from '../../game/Audio';

const MENU_COLORS = [TEAM_MAP.IND.primary, TEAM_MAP.AUS.primary, TEAM_MAP.IND.secondary, TEAM_MAP.AUS.secondary];
let menuStadium: StadiumHandles | null = null;
const setHandles = (h: StadiumHandles) => { menuStadium = h; };

function MenuWorld() {
  const t = useRef(0);
  const rigs = useMemo(() => {
    const ind = TEAM_MAP.IND, aus = TEAM_MAP.AUS;
    const bat = buildRig({ jersey: ind.primary, pants: ind.pants, accent: ind.accent, skin: '#a8713f', hair: '#111', kind: 'batter', helmet: true });
    const keep = buildRig({ jersey: aus.secondary, pants: aus.pants, accent: aus.accent, skin: '#f1c27d', hair: '#3a2a1a', kind: 'keeper', helmet: false });
    const slip = buildRig({ jersey: aus.primary, pants: aus.pants, accent: aus.accent, skin: '#e0ac69', hair: '#3a2a1a', kind: 'fielder', helmet: false });
    const bowl = buildRig({ jersey: aus.primary, pants: aus.pants, accent: aus.accent, skin: '#c68642', hair: '#111', kind: 'fielder', helmet: false });
    const g = new THREE.Group();
    [bat, keep, slip, bowl].forEach((r) => g.add(r.mirror));
    return { g, bat, keep, slip, bowl };
  }, []);
  useFrame(({ camera }, dt) => {
    t.current += dt;
    menuStadium?.tick(dt, 0.15 + Math.max(0, Math.sin(t.current * 0.4)) * 0.4);
    const a = t.current * 0.06 + 0.4;
    camera.position.set(Math.sin(a) * 26 + 6, 4.5 + Math.sin(t.current * 0.2) * 1.5, Math.cos(a) * 26 + 9);
    camera.lookAt(0, 1.2, 6);
    const tt = t.current % 6;
    applyActor(rigs.bat, { x: -0.1, y: 0, z: 9.35, rotY: Math.PI / 2, anim: tt > 4 ? 'swing' : 'stance', animT: tt > 4 ? tt - 4 : tt, animP: 'drive', animSide: 1, moveSpeed: 0, holdsBall: false, visible: true, mirror: 1 }, dt);
    applyActor(rigs.keep, { x: 0.3, y: 0, z: 23, rotY: Math.PI, anim: 'keeper', animT: tt, animP: '', animSide: 1, moveSpeed: 0, holdsBall: false, visible: true, mirror: 1 }, dt);
    applyActor(rigs.slip, { x: 3.4, y: 0, z: 24, rotY: Math.PI + 0.2, anim: 'ready', animT: tt, animP: '', animSide: 1, moveSpeed: 0, holdsBall: false, visible: true, mirror: 1 }, dt);
    applyActor(rigs.bowl, { x: 0.9, y: 0, z: -14 + (tt < 3 ? tt * 1.2 : 3.6), rotY: 0, anim: tt < 3 ? 'walk' : 'idle', animT: tt, animP: '', animSide: 1, moveSpeed: 1.3, holdsBall: true, visible: true, mirror: 1 }, dt);
  });
  return <primitive object={rigs.g} />;
}

export function MainMenu() {
  const setScreen = useGame((s) => s.setScreen);
  const quality = useGame((s) => s.settings.quality);
  const def = STADIUM_MAP.night;
  const go = (s: Parameters<typeof setScreen>[0]) => { audio.ensure(); audio.play('bat', 0.6); setScreen(s); };
  return (
    <div className="screen">
      <div className="fill">
        <Canvas shadows={quality !== 'low'} dpr={quality === 'high' ? [1, 2] : [1, 1.25]} camera={{ fov: 48, near: 0.1, far: 2000, position: [20, 6, 30] }}>
          <Lighting def={def} time="night" quality={quality === 'high' ? 'medium' : quality} />
          <StadiumObject def={def} time="night" quality={quality === 'high' ? 'medium' : quality} teamColors={MENU_COLORS} onReady={setHandles} />
          <PostFX quality={quality} time="night" />
          <MenuWorld />
        </Canvas>
      </div>
      <div className="menu-wrap">
        <h1 className="title">CRICKET <span>26</span></h1>
        <div className="subtitle">Quick Play Edition</div>
        <button className="menu-btn primary" autoFocus onClick={() => go('setup')}><span>▶ Quick Play</span></button>
        <button className="menu-btn" onClick={() => go('settings')}><span>Settings</span></button>
        <button className="menu-btn" onClick={() => go('exit')}><span>Exit Game</span></button>
      </div>
      <div className="menu-foot">Real international squads (ratings are estimates) · fictional stadiums &amp; brands · Bat: A/W/D + Q/E aim · L loft · J/K feet · ←→ shuffle · R run</div>
    </div>
  );
}
