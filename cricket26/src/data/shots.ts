export type AnimFamily = 'drive' | 'loft' | 'cut' | 'pull' | 'sweep' | 'glance' | 'defend' | 'defendBack' | 'reverse' | 'scoop' | 'slog' | 'leave';

export interface ShotDef {
  id: string;
  name: string;
  family: AnimFamily;
  theta: number;   // degrees, batter frame: 0 = straight back past bowler, + = off side
  speed: number;   // base exit speed m/s
  elev: number;    // launch angle degrees
  loft: boolean;
  foot: 'front' | 'back';
  len: [number, number];    // ideal pitch distance from batter stumps (m); full toss = -1
  line: [number, number];   // ideal line at contact (m, + off side)
  height: [number, number]; // ideal ball height at contact (m)
  risk: number;             // 0..1 inherent risk (narrows windows)
}

export const SHOTS: Record<string, ShotDef> = {
  forwardDefense: { id: 'forwardDefense', name: 'Forward Defence', family: 'defend', theta: 0, speed: 7, elev: -8, loft: false, foot: 'front', len: [-1.5, 6.5], line: [-0.45, 0.65], height: [0, 1.0], risk: 0 },
  backDefense: { id: 'backDefense', name: 'Back-foot Defence', family: 'defendBack', theta: 8, speed: 6, elev: -10, loft: false, foot: 'back', len: [4.5, 13], line: [-0.45, 0.65], height: [0.25, 1.6], risk: 0 },
  leave: { id: 'leave', name: 'Leave', family: 'leave', theta: 0, speed: 0, elev: 0, loft: false, foot: 'front', len: [-2, 20], line: [-2, 2], height: [0, 3], risk: 0 },
  straightDrive: { id: 'straightDrive', name: 'Straight Drive', family: 'drive', theta: 0, speed: 31, elev: 3, loft: false, foot: 'front', len: [-1.5, 4.6], line: [-0.2, 0.35], height: [0, 0.95], risk: 0.1 },
  offDrive: { id: 'offDrive', name: 'Off Drive', family: 'drive', theta: 24, speed: 31, elev: 3, loft: false, foot: 'front', len: [-1.5, 4.6], line: [0, 0.5], height: [0, 0.95], risk: 0.1 },
  coverDrive: { id: 'coverDrive', name: 'Cover Drive', family: 'drive', theta: 55, speed: 32, elev: 3, loft: false, foot: 'front', len: [-1.5, 4.6], line: [0.12, 0.8], height: [0, 0.95], risk: 0.15 },
  onDrive: { id: 'onDrive', name: 'On Drive', family: 'drive', theta: -22, speed: 30, elev: 3, loft: false, foot: 'front', len: [-1.5, 4.6], line: [-0.35, 0.15], height: [0, 0.95], risk: 0.15 },
  backFootPunch: { id: 'backFootPunch', name: 'Back-foot Punch', family: 'drive', theta: 18, speed: 27, elev: 2, loft: false, foot: 'back', len: [5.5, 10.5], line: [-0.1, 0.55], height: [0.4, 1.3], risk: 0.1 },
  squareCut: { id: 'squareCut', name: 'Square Cut', family: 'cut', theta: 92, speed: 32, elev: 2, loft: false, foot: 'back', len: [5.5, 13], line: [0.32, 1.05], height: [0.3, 1.3], risk: 0.2 },
  lateCut: { id: 'lateCut', name: 'Late Cut', family: 'cut', theta: 138, speed: 24, elev: 1, loft: false, foot: 'back', len: [4.5, 12], line: [0.3, 1.05], height: [0.2, 1.1], risk: 0.25 },
  upperCut: { id: 'upperCut', name: 'Upper Cut', family: 'cut', theta: 118, speed: 33, elev: 30, loft: true, foot: 'back', len: [8.5, 14], line: [0.3, 1.1], height: [0.95, 1.9], risk: 0.35 },
  pull: { id: 'pull', name: 'Pull Shot', family: 'pull', theta: -88, speed: 33, elev: 5, loft: false, foot: 'back', len: [6.5, 13], line: [-0.4, 0.5], height: [0.55, 1.5], risk: 0.25 },
  hook: { id: 'hook', name: 'Hook Shot', family: 'pull', theta: -118, speed: 34, elev: 16, loft: false, foot: 'back', len: [9, 14], line: [-0.45, 0.4], height: [1.15, 2.0], risk: 0.35 },
  loftedPull: { id: 'loftedPull', name: 'Lofted Pull', family: 'pull', theta: -78, speed: 37, elev: 27, loft: true, foot: 'back', len: [6.5, 13.5], line: [-0.45, 0.5], height: [0.55, 1.6], risk: 0.35 },
  sweep: { id: 'sweep', name: 'Sweep', family: 'sweep', theta: -95, speed: 26, elev: 3, loft: false, foot: 'front', len: [1, 5.8], line: [-0.35, 0.5], height: [0, 0.7], risk: 0.25 },
  slogSweep: { id: 'slogSweep', name: 'Slog Sweep', family: 'sweep', theta: -62, speed: 36, elev: 29, loft: true, foot: 'front', len: [1, 6], line: [-0.35, 0.5], height: [0, 0.8], risk: 0.4 },
  reverseSweep: { id: 'reverseSweep', name: 'Reverse Sweep', family: 'reverse', theta: 102, speed: 25, elev: 4, loft: false, foot: 'front', len: [1, 5.8], line: [-0.1, 0.6], height: [0, 0.7], risk: 0.4 },
  flick: { id: 'flick', name: 'Flick', family: 'glance', theta: -55, speed: 29, elev: 3, loft: false, foot: 'front', len: [-1.5, 6.5], line: [-0.5, 0.12], height: [0, 1.0], risk: 0.15 },
  legGlance: { id: 'legGlance', name: 'Leg Glance', family: 'glance', theta: -145, speed: 22, elev: 2, loft: false, foot: 'back', len: [2, 9], line: [-0.65, 0.05], height: [0.2, 1.2], risk: 0.15 },
  paddleScoop: { id: 'paddleScoop', name: 'Paddle Scoop', family: 'scoop', theta: -172, speed: 27, elev: 22, loft: true, foot: 'front', len: [-1.5, 4], line: [-0.35, 0.3], height: [0, 0.9], risk: 0.45 },
  loftedDrive: { id: 'loftedDrive', name: 'Lofted Drive', family: 'loft', theta: 0, speed: 37, elev: 30, loft: true, foot: 'front', len: [-1.5, 4.6], line: [-0.3, 0.45], height: [0, 1.0], risk: 0.3 },
  loftedCover: { id: 'loftedCover', name: 'Lofted Cover Drive', family: 'loft', theta: 48, speed: 36, elev: 28, loft: true, foot: 'front', len: [-1.5, 4.6], line: [0.05, 0.8], height: [0, 1.0], risk: 0.35 },
  loftedOn: { id: 'loftedOn', name: 'Lofted On Drive', family: 'loft', theta: -22, speed: 37, elev: 30, loft: true, foot: 'front', len: [-1.5, 4.6], line: [-0.4, 0.2], height: [0, 1.0], risk: 0.35 },
  slog: { id: 'slog', name: 'Slog', family: 'slog', theta: -42, speed: 39, elev: 31, loft: true, foot: 'front', len: [-1.5, 7.5], line: [-0.5, 0.6], height: [0, 1.3], risk: 0.45 },
};

export const SHOT_LIST = Object.values(SHOTS);
