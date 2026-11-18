import type { BowlStyle, Player } from './types';
import { isLeftArm, isSpin } from '../data/teams';
import { BallState, makeBall, stepBall, StepEvents, predictPath, PathSample } from './BallPhysics';
import { STUMPS_Z } from './constants';
import { clamp, gauss, rand } from '../utils/random';

export type DeliveryType =
  | 'goodLength' | 'fullLength' | 'yorker' | 'bouncer' | 'inswinger' | 'outswinger' | 'offCutter' | 'legCutter' | 'slower'
  | 'offSpin' | 'legSpin' | 'googly' | 'topSpinner' | 'slider' | 'armBall';

export type Variation = 'normal' | 'quicker' | 'slower';

export interface DeliveryTypeDef {
  id: DeliveryType;
  name: string;
  spin: boolean;
  /** default distance from batter's stumps at which the ball pitches (m) */
  length: number;
  /** default line in batter offside coordinates (m from middle stump) */
  line: number;
  speedMul: number;
  swing: number;   // lateral accel toward off(+)/leg(-) in batter frame, m/s^2
  seam: number;    // lateral velocity change at bounce toward off(+)/leg(-), m/s
  bounceE: number;
  keep: number;
}

export const DELIVERIES: Record<DeliveryType, DeliveryTypeDef> = {
  goodLength: { id: 'goodLength', name: 'Good Length', spin: false, length: 6.0, line: 0.18, speedMul: 1, swing: 0, seam: 0, bounceE: 0.56, keep: 0.88 },
  fullLength: { id: 'fullLength', name: 'Full Length', spin: false, length: 3.6, line: 0.15, speedMul: 1, swing: 0, seam: 0, bounceE: 0.55, keep: 0.88 },
  yorker: { id: 'yorker', name: 'Yorker', spin: false, length: 0.9, line: 0.02, speedMul: 1.01, swing: 0, seam: 0, bounceE: 0.5, keep: 0.86 },
  bouncer: { id: 'bouncer', name: 'Bouncer', spin: false, length: 10.5, line: 0.05, speedMul: 1.01, swing: 0, seam: 0, bounceE: 0.62, keep: 0.86 },
  inswinger: { id: 'inswinger', name: 'Inswinger', spin: false, length: 4.6, line: 0.35, speedMul: 0.97, swing: -2.6, seam: 0, bounceE: 0.55, keep: 0.88 },
  outswinger: { id: 'outswinger', name: 'Outswinger', spin: false, length: 4.6, line: 0.05, speedMul: 0.97, swing: 2.6, seam: 0, bounceE: 0.55, keep: 0.88 },
  offCutter: { id: 'offCutter', name: 'Off Cutter', spin: false, length: 6.0, line: 0.3, speedMul: 0.9, swing: 0, seam: -1.3, bounceE: 0.52, keep: 0.85 },
  legCutter: { id: 'legCutter', name: 'Leg Cutter', spin: false, length: 6.0, line: 0.05, speedMul: 0.9, swing: 0, seam: 1.3, bounceE: 0.52, keep: 0.85 },
  slower: { id: 'slower', name: 'Slower Ball', spin: false, length: 5.0, line: 0.15, speedMul: 0.78, swing: 0, seam: 0.3, bounceE: 0.5, keep: 0.84 },
  offSpin: { id: 'offSpin', name: 'Off Spin', spin: true, length: 4.6, line: 0.3, speedMul: 1, swing: 0, seam: -1.7, bounceE: 0.58, keep: 0.82 },
  legSpin: { id: 'legSpin', name: 'Leg Spin', spin: true, length: 4.8, line: -0.05, speedMul: 1, swing: 0, seam: 1.9, bounceE: 0.6, keep: 0.82 },
  googly: { id: 'googly', name: 'Googly', spin: true, length: 4.6, line: 0.3, speedMul: 0.97, swing: 0, seam: -1.6, bounceE: 0.6, keep: 0.82 },
  topSpinner: { id: 'topSpinner', name: 'Top Spinner', spin: true, length: 5.0, line: 0.12, speedMul: 1, swing: 0, seam: 0, bounceE: 0.7, keep: 0.86 },
  slider: { id: 'slider', name: 'Slider', spin: true, length: 4.6, line: 0.1, speedMul: 1.07, swing: 0, seam: 0.2, bounceE: 0.45, keep: 0.92 },
  armBall: { id: 'armBall', name: 'Arm Ball', spin: true, length: 4.4, line: 0.2, speedMul: 1.1, swing: -0.8, seam: 0, bounceE: 0.5, keep: 0.9 },
};

export function deliveryOptions(style: BowlStyle): DeliveryType[] {
  switch (style) {
    case 'OB': return ['offSpin', 'armBall', 'topSpinner', 'slider'];
    case 'SLA': return ['legSpin', 'armBall', 'topSpinner', 'slider'];
    case 'LB': return ['legSpin', 'googly', 'topSpinner', 'slider'];
    case 'LWS': return ['offSpin', 'googly', 'topSpinner', 'slider'];
    case 'RM': case 'LM': return ['goodLength', 'fullLength', 'inswinger', 'outswinger', 'offCutter', 'legCutter', 'slower', 'yorker', 'bouncer'];
    default: return ['goodLength', 'fullLength', 'yorker', 'bouncer', 'inswinger', 'outswinger', 'offCutter', 'legCutter', 'slower'];
  }
}

/** SLA turns away from a right hander like leg-spin; left-arm wrist spin turns in like off-spin. Name accordingly. */
export function deliveryLabel(style: BowlStyle, t: DeliveryType): string {
  if (style === 'SLA' && t === 'legSpin') return 'Left-arm Spin';
  if (style === 'LWS' && t === 'offSpin') return 'Chinaman';
  return DELIVERIES[t].name;
}

export function baseSpeedKmh(p: Player): number {
  const r = (p.bowl - 50) / 50; // -1..1
  switch (p.bowlStyle) {
    case 'RF': case 'LF': return 136 + r * 10;
    case 'RFM': case 'LFM': return 126 + r * 9;
    case 'RM': case 'LM': return 112 + r * 8;
    case 'OB': case 'SLA': return 84 + r * 8;
    case 'LB': case 'LWS': return 80 + r * 8;
    default: return 105;
  }
}

export interface DeliveryRequest {
  bowler: Player;
  type: DeliveryType;
  variation: Variation;
  /** target in batter-offside coordinates: line (m from middle stump, + = off side), length (m from batter stumps) */
  line: number;
  length: number;
  /** 0..1 execution accuracy (1 = perfect) */
  execution: number;
  offSign: number;
  /** extra scatter multiplier from difficulty */
  scatterMul: number;
  noBall: boolean;
  /** bowl from around the wicket */
  around?: boolean;
}

export interface DeliveryPlan {
  ball: BallState;
  path: PathSample[];
  speedKmh: number;
  pitchX: number;
  pitchZ: number;
  bounceIndex: number;
  type: DeliveryType;
  name: string;
  quality: number; // 0..1 delivery quality used by batting difficulty
  noBall: boolean;
  release: { x: number; y: number; z: number };
  lengthName: string;
  lineName: string;
}

export function lengthName(dist: number | null): string {
  if (dist === null) return 'full toss';
  if (dist < 1.4) return 'yorker';
  if (dist < 3.5) return 'full';
  if (dist < 6.6) return 'good length';
  if (dist < 8.5) return 'back of a length';
  if (dist < 10.5) return 'short';
  return 'bouncer';
}

export function lineName(lineOff: number): string {
  if (lineOff > 0.75) return 'wide outside off';
  if (lineOff > 0.28) return 'outside off';
  if (lineOff > 0.06) return 'off stump';
  if (lineOff > -0.08) return 'middle stump';
  if (lineOff > -0.25) return 'leg stump';
  return 'down leg';
}

export function planDelivery(req: DeliveryRequest): DeliveryPlan {
  const def = DELIVERIES[req.type];
  const p = req.bowler;
  const spin = isSpin(p.bowlStyle);
  const leftArm = isLeftArm(p.bowlStyle);
  const exe = clamp(req.execution, 0, 1);
  // speed
  let kmh = baseSpeedKmh(p) * def.speedMul;
  if (req.variation === 'quicker') kmh *= spin ? 1.1 : 1.04;
  if (req.variation === 'slower') kmh *= spin ? 0.88 : 0.9;
  kmh *= 0.97 + exe * 0.04;
  kmh += gauss() * 1.2;
  const speed = kmh / 3.6;

  // scatter on target based on rating and execution
  const control = clamp(p.bowl / 100, 0.3, 1);
  const scatter = (0.08 + (1 - exe) * 0.9) * (1.35 - control) * req.scatterMul;
  const lengthT = req.length + gauss() * scatter * 1.6;
  const lineT = req.line + gauss() * scatter * 0.55;
  const tx = lineT * req.offSign;
  const tz = STUMPS_Z - lengthT;

  // movement (batter-relative → world). Movement for left-arm/right-hander handled via sign.
  const moveQ = 0.55 + exe * 0.45 + (p.bowl - 70) / 120;
  let swing = def.swing * moveQ * req.offSign;
  let seam = def.seam * moveQ * req.offSign;
  // left-arm finger spin naturally turns the other way than off-spin (handled via def choice), arm ball etc fine
  if (!spin && def.swing === 0 && def.seam === 0) seam += gauss() * 0.25; // natural seam movement
  if (spin) seam *= 0.85 + rand() * 0.3;

  const releaseX = (leftArm ? -0.32 : 0.32) * (spin ? 0.85 : 1) * (req.around ? -1.6 : 1);
  const release = { x: releaseX, y: spin ? 2.05 : 2.2, z: -STUMPS_Z + 0.6 };

  const ball = makeBall();
  ball.dragMul = 0.35;
  ball.swingAcc = swing;
  ball.turnOnBounce = seam;
  ball.pitchE = def.bounceE + (req.type === 'bouncer' ? 0.04 : 0);
  ball.pitchKeep = def.keep;

  // Solve initial velocity so that the first bounce lands on (tx, tz). Full tosses: aim at z, height 0.
  const dz = tz - release.z;
  let vz = speed * 0.995;
  let t = dz / vz;
  let vx = (tx - release.x - 0.5 * swing * t * t) / t;
  let vy = (0.036 - release.y + 0.5 * 9.81 * t * t) / t;
  const ev: StepEvents = { bounced: false, bounceOnPitch: false, bounceX: 0, bounceZ: 0 };
  for (let iter = 0; iter < 6; iter++) {
    const b = { ...ball, p: { ...release }, v: { x: vx, y: vy, z: vz } };
    let tt = 0, landed = false;
    while (tt < 3) {
      stepBall(b, 1 / 480, ev);
      tt += 1 / 480;
      if (ev.bounced) { landed = true; break; }
    }
    if (!landed) break;
    const ez = tz - ev.bounceZ, ex = tx - ev.bounceX;
    if (Math.abs(ez) < 0.02 && Math.abs(ex) < 0.01) break;
    // shorter-than-target → reduce downward velocity
    vy += ez / (vz * tt / Math.max(0.5, 9.81 * tt - vy));
    vx += ex / Math.max(0.2, tt);
  }
  ball.p = { ...release };
  ball.v = { x: vx, y: vy, z: vz };

  const path = predictPath(ball, 3, 1 / 480, STUMPS_Z + 25);
  let bounceIndex = path.findIndex((s) => s.bounces > 0);
  const bounce = bounceIndex >= 0 ? path[bounceIndex] : null;
  const dist = bounce && bounce.z < STUMPS_Z ? STUMPS_Z - bounce.z : null;

  // delivery quality: hitting the stumps on a good length/yorker is hardest
  let quality = exe * 0.5 + control * 0.3;
  if (dist !== null && (dist < 1.4 || (dist > 4.2 && dist < 7))) quality += 0.15;
  if (Math.abs(lineT - 0.15) < 0.25) quality += 0.1;
  if (dist === null || (dist > 2 && dist < 3.6) || Math.abs(lineT) > 0.9) quality -= 0.25;
  quality = clamp(quality, 0, 1);

  return {
    ball, path, speedKmh: kmh, pitchX: bounce ? bounce.x : tx, pitchZ: bounce ? bounce.z : tz, bounceIndex,
    type: req.type, name: deliveryLabel(p.bowlStyle, req.type), quality, noBall: req.noBall, release,
    lengthName: lengthName(dist), lineName: lineName(lineT),
  };
}
