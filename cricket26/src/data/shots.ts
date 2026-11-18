export type AnimFamily = 'drive' | 'loft' | 'cut' | 'pull' | 'sweep' | 'glance' | 'defend' | 'defendBack' | 'reverse' | 'scoop' | 'slog' | 'leave';

export interface ShotDef {
  id: string;
  name: string;
  family: AnimFamily;
  /** direction range this shot can send the ball, batter frame degrees: 0 = straight, + = off side, ±180 = behind */
  range: [number, number];
  speed: number;   // base exit speed m/s
  elev: number;    // launch angle degrees
  loft: boolean;
  sweep?: boolean; // needs the sweep modifier
  foot: 'front' | 'back' | 'any';
  len: [number, number];    // ideal pitch distance from batter stumps (m); full toss = -1
  line: [number, number];   // ideal line at contact relative to the batter (m, + off side)
  height: [number, number]; // ideal ball height at contact (m)
  risk: number;             // 0..1 inherent risk (narrows windows)
}

const S = (d: Omit<ShotDef, 'id'> & { id: string }) => d;

export const SHOTS: Record<string, ShotDef> = {
  forwardDefense: S({ id: 'forwardDefense', name: 'Forward Defence', family: 'defend', range: [-30, 30], speed: 7, elev: -8, loft: false, foot: 'front', len: [-1.5, 6.5], line: [-0.45, 0.65], height: [0, 1.0], risk: 0 }),
  backDefense: S({ id: 'backDefense', name: 'Back-foot Defence', family: 'defendBack', range: [-30, 30], speed: 6, elev: -10, loft: false, foot: 'back', len: [4.5, 13], line: [-0.45, 0.65], height: [0.25, 1.6], risk: 0 }),
  leave: S({ id: 'leave', name: 'Leave', family: 'leave', range: [0, 0], speed: 0, elev: 0, loft: false, foot: 'any', len: [-2, 20], line: [-2, 2], height: [0, 3], risk: 0 }),

  // ---- front-foot ground shots
  straightDrive: S({ id: 'straightDrive', name: 'Straight Drive', family: 'drive', range: [-12, 12], speed: 31, elev: 3, loft: false, foot: 'front', len: [-1.5, 4.8], line: [-0.2, 0.35], height: [0, 0.95], risk: 0.1 }),
  offDrive: S({ id: 'offDrive', name: 'Off Drive', family: 'drive', range: [12, 35], speed: 31, elev: 3, loft: false, foot: 'front', len: [-1.5, 4.8], line: [0, 0.5], height: [0, 0.95], risk: 0.1 }),
  coverDrive: S({ id: 'coverDrive', name: 'Cover Drive', family: 'drive', range: [35, 72], speed: 32, elev: 3, loft: false, foot: 'front', len: [-1.5, 5.2], line: [0.12, 0.8], height: [0, 0.95], risk: 0.15 }),
  squareDrive: S({ id: 'squareDrive', name: 'Square Drive', family: 'drive', range: [72, 108], speed: 31, elev: 2, loft: false, foot: 'front', len: [-1.5, 5.5], line: [0.3, 0.95], height: [0, 0.9], risk: 0.2 }),
  onDrive: S({ id: 'onDrive', name: 'On Drive', family: 'drive', range: [-38, -12], speed: 30, elev: 3, loft: false, foot: 'front', len: [-1.5, 4.8], line: [-0.35, 0.15], height: [0, 0.95], risk: 0.15 }),
  flick: S({ id: 'flick', name: 'Flick', family: 'glance', range: [-105, -38], speed: 29, elev: 3, loft: false, foot: 'front', len: [-1.5, 6.5], line: [-0.5, 0.15], height: [0, 1.0], risk: 0.15 }),
  legGlance: S({ id: 'legGlance', name: 'Leg Glance', family: 'glance', range: [-170, -105], speed: 22, elev: 2, loft: false, foot: 'any', len: [1.5, 9.5], line: [-0.65, 0.05], height: [0.2, 1.2], risk: 0.15 }),

  // ---- back-foot ground shots
  backFootPunch: S({ id: 'backFootPunch', name: 'Back-foot Punch', family: 'drive', range: [-25, 45], speed: 27, elev: 2, loft: false, foot: 'back', len: [5.5, 11], line: [-0.1, 0.6], height: [0.4, 1.3], risk: 0.1 }),
  squareCut: S({ id: 'squareCut', name: 'Square Cut', family: 'cut', range: [45, 115], speed: 32, elev: 2, loft: false, foot: 'back', len: [5.5, 13], line: [0.32, 1.05], height: [0.3, 1.3], risk: 0.2 }),
  lateCut: S({ id: 'lateCut', name: 'Late Cut', family: 'cut', range: [115, 170], speed: 24, elev: 1, loft: false, foot: 'back', len: [4.5, 12], line: [0.25, 1.05], height: [0.2, 1.1], risk: 0.25 }),
  pull: S({ id: 'pull', name: 'Pull Shot', family: 'pull', range: [-115, -25], speed: 33, elev: 5, loft: false, foot: 'back', len: [6.5, 13], line: [-0.45, 0.5], height: [0.55, 1.5], risk: 0.25 }),
  hook: S({ id: 'hook', name: 'Hook Shot', family: 'pull', range: [-170, -115], speed: 33, elev: 12, loft: false, foot: 'back', len: [9, 14], line: [-0.45, 0.4], height: [1.1, 2.0], risk: 0.35 }),

  // ---- lofted
  loftedDrive: S({ id: 'loftedDrive', name: 'Lofted Straight Drive', family: 'loft', range: [-15, 15], speed: 37, elev: 30, loft: true, foot: 'front', len: [-1.5, 4.8], line: [-0.3, 0.45], height: [0, 1.0], risk: 0.3 }),
  loftedCover: S({ id: 'loftedCover', name: 'Lofted Cover Drive', family: 'loft', range: [15, 70], speed: 36, elev: 28, loft: true, foot: 'front', len: [-1.5, 5.2], line: [0.05, 0.85], height: [0, 1.0], risk: 0.35 }),
  insideOut: S({ id: 'insideOut', name: 'Inside-out over Point', family: 'loft', range: [70, 115], speed: 35, elev: 27, loft: true, foot: 'front', len: [-1.5, 5.5], line: [0.1, 0.95], height: [0, 1.0], risk: 0.42 }),
  loftedOn: S({ id: 'loftedOn', name: 'Lofted On Drive', family: 'loft', range: [-42, -15], speed: 37, elev: 30, loft: true, foot: 'front', len: [-1.5, 5.2], line: [-0.4, 0.2], height: [0, 1.0], risk: 0.35 }),
  slog: S({ id: 'slog', name: 'Slog over Midwicket', family: 'slog', range: [-105, -42], speed: 39, elev: 31, loft: true, foot: 'front', len: [-1.5, 7.5], line: [-0.5, 0.6], height: [0, 1.3], risk: 0.45 }),
  loftedFlick: S({ id: 'loftedFlick', name: 'Lofted Flick', family: 'glance', range: [-165, -105], speed: 33, elev: 26, loft: true, foot: 'front', len: [-1.5, 6], line: [-0.6, 0.1], height: [0, 1.1], risk: 0.4 }),
  loftedPunch: S({ id: 'loftedPunch', name: 'Lofted Back-foot Drive', family: 'loft', range: [-25, 45], speed: 35, elev: 26, loft: true, foot: 'back', len: [5.5, 11], line: [-0.1, 0.6], height: [0.4, 1.4], risk: 0.4 }),
  thirdManSteer: S({ id: 'thirdManSteer', name: 'Lofted Steer over Third Man', family: 'cut', range: [115, 175], speed: 30, elev: 24, loft: true, foot: 'front', len: [-1.5, 6], line: [0.15, 0.95], height: [0, 1.1], risk: 0.42 }),
  upperCut: S({ id: 'upperCut', name: 'Upper Cut', family: 'cut', range: [95, 165], speed: 33, elev: 30, loft: true, foot: 'back', len: [8, 14], line: [0.3, 1.1], height: [0.9, 1.9], risk: 0.35 }),
  loftedPull: S({ id: 'loftedPull', name: 'Lofted Pull', family: 'pull', range: [-115, -25], speed: 37, elev: 27, loft: true, foot: 'back', len: [6.5, 13.5], line: [-0.45, 0.5], height: [0.55, 1.6], risk: 0.35 }),
  hookSix: S({ id: 'hookSix', name: 'Hook over Fine Leg', family: 'pull', range: [-175, -115], speed: 36, elev: 25, loft: true, foot: 'back', len: [9, 14], line: [-0.45, 0.4], height: [1.1, 2.0], risk: 0.45 }),

  // ---- sweep family (hold the sweep modifier)
  sweep: S({ id: 'sweep', name: 'Sweep', family: 'sweep', range: [-130, -55], speed: 26, elev: 3, loft: false, sweep: true, foot: 'front', len: [1, 5.8], line: [-0.35, 0.5], height: [0, 0.7], risk: 0.25 }),
  paddleSweep: S({ id: 'paddleSweep', name: 'Paddle Sweep', family: 'sweep', range: [-180, -130], speed: 20, elev: 3, loft: false, sweep: true, foot: 'front', len: [1, 5.8], line: [-0.4, 0.4], height: [0, 0.7], risk: 0.25 }),
  reverseSweep: S({ id: 'reverseSweep', name: 'Reverse Sweep', family: 'reverse', range: [55, 150], speed: 25, elev: 4, loft: false, sweep: true, foot: 'front', len: [1, 5.8], line: [-0.1, 0.65], height: [0, 0.7], risk: 0.4 }),
  slogSweep: S({ id: 'slogSweep', name: 'Slog Sweep', family: 'sweep', range: [-120, -25], speed: 36, elev: 29, loft: true, sweep: true, foot: 'front', len: [1, 6], line: [-0.35, 0.5], height: [0, 0.8], risk: 0.4 }),
  paddleScoop: S({ id: 'paddleScoop', name: 'Paddle Scoop', family: 'scoop', range: [-180, -120], speed: 27, elev: 22, loft: true, sweep: true, foot: 'front', len: [-1.5, 4.5], line: [-0.35, 0.3], height: [0, 0.9], risk: 0.45 }),
  rampShot: S({ id: 'rampShot', name: 'Ramp over Slips', family: 'scoop', range: [120, 180], speed: 26, elev: 20, loft: true, sweep: true, foot: 'front', len: [-1.5, 6], line: [0.1, 0.8], height: [0, 1.2], risk: 0.5 }),
  reverseHit: S({ id: 'reverseHit', name: 'Reverse Hit', family: 'reverse', range: [25, 120], speed: 33, elev: 26, loft: true, sweep: true, foot: 'front', len: [1, 6], line: [-0.1, 0.65], height: [0, 0.8], risk: 0.5 }),
};

export const SHOT_LIST = Object.values(SHOTS);
export const ATTACK_SHOTS = SHOT_LIST.filter((s) => s.family !== 'defend' && s.family !== 'defendBack' && s.family !== 'leave');
