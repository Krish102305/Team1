import { SHOTS, ShotDef } from '../data/shots';
import type { Difficulty, Player } from './types';
import { PathSample, sampleAt, timeAtZ, Vec3 } from './BallPhysics';
import { STUMPS_Z, SWING_LEAD } from './constants';
import { chance, clamp, gauss, rand, randRange } from '../utils/random';

export type ShotDir = 'straight' | 'leg' | 'off' | 'defend' | 'power' | 'leave';

export interface ShotInput {
  dir: ShotDir;
  loft: boolean;
  power: boolean;
  aim: number;   // -1 screen-left, 0, +1 screen-right
  foot: number;  // +1 forward/advance, -1 back, 0 neutral
  soft?: boolean; // soft hands push into a gap
  pressTime: number; // seconds since release
}

export type ContactKind = 'clean' | 'edge' | 'topEdge' | 'insideEdge' | 'miss' | 'leave';
export type TimingLabel = 'Perfect' | 'Good' | 'Early' | 'Late' | 'Very Early' | 'Very Late' | '';

export interface BallRead {
  /** distance from batter's stumps where ball pitches (null = full toss) */
  pitchDist: number | null;
  lineOff: number;   // at the contact plane, batter off side +
  height: number;    // at the contact plane
  speedKmh: number;
  spin: boolean;
}

export interface ShotContext {
  path: PathSample[];
  bounceIndex: number;
  offSign: number;
  batter: Player;
  difficulty: Difficulty;
  isUser: boolean;
  speedKmh: number;
  spin: boolean;
  deliveryQuality: number;
  /** 0..1 how much the ball moved late (swing/seam/turn) */
  movement: number;
}

export interface ShotResolution {
  shot: ShotDef;
  input: ShotInput;
  contact: ContactKind;
  timing: TimingLabel;
  err: number;
  quality: number;
  zContact: number;
  tArrive: number | null;
  exitV: Vec3 | null;
  hitWicket: boolean;
  advance: boolean;
  read: BallRead;
}

export function readBall(path: PathSample[], bounceIndex: number, zc: number, offSign: number, speedKmh: number, spin: boolean): BallRead {
  const t = timeAtZ(path, zc);
  const s = t !== null ? sampleAt(path, t) : path[path.length - 1];
  const b = bounceIndex >= 0 ? path[bounceIndex] : null;
  const pitchDist = b && b.z < zc + 0.3 ? STUMPS_Z - b.z : null;
  return { pitchDist, lineOff: s.x * offSign, height: s.y, speedKmh, spin };
}

/** Choose the concrete shot from directional input + the ball being faced. */
export function chooseShot(input: ShotInput, r: BallRead): ShotDef {
  const len = r.pitchDist ?? -1;
  const short = len > 7.2;
  const bouncer = len > 9.5 && r.height > 1.15;
  const full = len < 4.2;
  const { dir, loft, power, foot } = input;
  if (dir === 'leave') return SHOTS.leave;
  if (dir === 'defend') return (foot < 0 || (short && foot <= 0)) ? SHOTS.backDefense : SHOTS.forwardDefense;
  if (dir === 'off') {
    if (foot < 0 && !short && full && r.spin) return SHOTS.reverseSweep;
    if (foot < 0) return loft ? SHOTS.upperCut : SHOTS.lateCut;
    if (short || (len > 6 && r.lineOff > 0.35)) return loft ? SHOTS.upperCut : SHOTS.squareCut;
    if (loft) return SHOTS.loftedCover;
    return SHOTS.coverDrive;
  }
  if (dir === 'leg') {
    if (foot < 0 && !short) return (loft || power) ? SHOTS.slogSweep : SHOTS.sweep;
    if (short) return bouncer && !loft ? SHOTS.hook : loft ? SHOTS.loftedPull : SHOTS.pull;
    if (loft && power) return SHOTS.slog;
    if (loft) return SHOTS.loftedOn;
    if (r.lineOff < -0.25 && !power) return SHOTS.legGlance;
    return SHOTS.flick;
  }
  if (dir === 'straight') {
    if (foot < 0 && full) return SHOTS.paddleScoop;
    if (short) return loft ? SHOTS.loftedPull : SHOTS.backFootPunch;
    if (loft) return SHOTS.loftedDrive;
    return SHOTS.straightDrive;
  }
  // power with no direction: attacking shot straight-ish chosen by length
  if (short) return loft ? SHOTS.loftedPull : SHOTS.pull;
  if (loft) return SHOTS.slog;
  return SHOTS.loftedDrive;
}

const mem = (v: number, lo: number, hi: number, soft: number) => {
  if (v >= lo && v <= hi) return 1;
  const d = v < lo ? lo - v : v - hi;
  return Math.exp(-(d / soft) * (d / soft));
};

export function suitability(shot: ShotDef, r: BallRead): number {
  if (shot.family === 'leave') return 1;
  const len = r.pitchDist ?? -1;
  let s = mem(len, shot.len[0], shot.len[1], 1.8) * mem(r.lineOff, shot.line[0], shot.line[1], 0.28) * mem(r.height, shot.height[0], shot.height[1], 0.35);
  if ((shot.family === 'sweep' || shot.family === 'reverse') && r.speedKmh > 115) s *= 0.55;
  return clamp(s, 0, 1);
}

export function contactZ(shot: ShotDef, input: ShotInput, spin: boolean): { z: number; advance: boolean } {
  if (input.foot > 0 && spin && shot.family !== 'defendBack') return { z: 7.3, advance: true };
  if (input.foot > 0) return { z: 8.55, advance: false };
  if (input.foot < 0) return { z: 9.55, advance: false };
  return { z: shot.foot === 'back' ? 9.45 : 8.8, advance: false };
}

const USER_WINDOW: Record<Difficulty, number> = { easy: 1.55, medium: 1.2, hard: 0.98, pro: 0.82 };
const AI_WINDOW: Record<Difficulty, number> = { easy: 0.9, medium: 1.0, hard: 1.1, pro: 1.22 };
const USER_POWER: Record<Difficulty, number> = { easy: 1.08, medium: 1.0, hard: 0.97, pro: 0.94 };

export function timingWindows(ctx: Pick<ShotContext, 'batter' | 'difficulty' | 'isUser'>, shot: ShotDef) {
  const diffScale = ctx.isUser ? USER_WINDOW[ctx.difficulty] : AI_WINDOW[ctx.difficulty];
  const rating = 0.78 + 0.42 * (ctx.batter.bat / 100);
  const def = shot.family === 'defend' || shot.family === 'defendBack' ? 1.45 : 1;
  const k = diffScale * rating * def * (1 - shot.risk * 0.25);
  return { perfect: 0.026 * k, good: 0.058 * k, ok: 0.11 * k };
}

export function resolveShot(input: ShotInput, ctx: ShotContext): ShotResolution {
  // shot choice uses where the ball will be at a neutral contact point
  const read0 = readBall(ctx.path, ctx.bounceIndex, 9.0, ctx.offSign, ctx.speedKmh, ctx.spin);
  const shot = chooseShot(input, read0);
  const { z: zc, advance } = contactZ(shot, input, ctx.spin);
  const read = readBall(ctx.path, ctx.bounceIndex, zc, ctx.offSign, ctx.speedKmh, ctx.spin);
  const tArrive = timeAtZ(ctx.path, zc);
  const base: ShotResolution = { shot, input, contact: 'miss', timing: '', err: 0, quality: 0, zContact: zc, tArrive, exitV: null, hitWicket: false, advance, read };
  if (shot.family === 'leave') { base.contact = 'leave'; return base; }
  if (tArrive === null) return base;
  const err = input.pressTime + SWING_LEAD - tArrive;
  base.err = err;
  const w = timingWindows(ctx, shot);
  const a = Math.abs(err);
  if (a <= w.perfect) base.timing = 'Perfect';
  else if (a <= w.good) base.timing = 'Good';
  else if (a <= w.ok) base.timing = err < 0 ? 'Early' : 'Late';
  else { base.timing = err < 0 ? 'Very Early' : 'Very Late'; return base; }

  // physical reach
  if (read.lineOff > 1.08 || read.lineOff < -0.9 || read.height > 2.0) { base.timing = ''; return base; }

  const s = suitability(shot, read);
  let ts: number;
  if (a <= w.perfect) ts = 1;
  else if (a <= w.good) ts = 0.92 - 0.12 * ((a - w.perfect) / (w.good - w.perfect));
  else ts = 0.78 - 0.43 * ((a - w.good) / (w.ok - w.good));
  const ratingMul = 0.84 + 0.24 * (ctx.batter.bat / 100);
  let q = ts * (0.3 + 0.7 * s) * ratingMul * (1 - 0.16 * ctx.deliveryQuality);
  if (input.power) q *= 0.95;
  q = clamp(q, 0, 1);
  base.quality = q;

  const defensive = shot.family === 'defend' || shot.family === 'defendBack';
  // plain miss / beaten when shot doesn't suit
  const pBeaten = (1 - s) * 0.4 * (a > w.good ? 1.5 : 1) * (defensive ? 0.35 : 1) + ctx.movement * 0.05 * ctx.deliveryQuality * (ctx.isUser ? 0.5 : 1);
  if (rand() < pBeaten) { base.contact = 'miss'; return base; }

  const incoming = ctx.speedKmh / 3.6;
  const os = ctx.offSign;
  const dirOf = (thetaDeg: number, elevDeg: number, speed: number): Vec3 => {
    const th = (thetaDeg * Math.PI) / 180, el = (elevDeg * Math.PI) / 180;
    return { x: Math.sin(th) * os * Math.cos(el) * speed, y: Math.sin(el) * speed, z: -Math.cos(th) * Math.cos(el) * speed };
  };

  // edges
  const moveEdge = ctx.movement * (0.05 + 0.12 * ctx.deliveryQuality) * (1.2 - ctx.batter.bat / 100) * (ctx.isUser ? 0.6 : 1) * (defensive ? 0.6 : 1) * (shot.family === 'pull' || shot.family === 'sweep' ? 0.5 : 1);
  const pEdge = clamp((0.46 - q) * 1.7, 0, 0.8) + (err > w.good ? 0.06 : 0) - (defensive ? 0.08 : 0) + moveEdge;
  if (rand() < pEdge) {
    const legFam = shot.family === 'pull' || shot.family === 'sweep' || shot.family === 'scoop' || shot.family === 'slog' || shot.family === 'glance';
    if (legFam && (shot.loft || read.height > 0.6 || chance(0.6))) {
      base.contact = 'topEdge';
      base.exitV = dirOf(randRange(-170, -110) * (chance(0.8) ? 1 : -0.7), randRange(52, 74), randRange(13, 21));
    } else if (read.lineOff > -0.05 || chance(0.4)) {
      base.contact = 'edge';
      base.exitV = dirOf(randRange(150, 176), randRange(1, 13), 10 + incoming * randRange(0.2, 0.35));
    } else {
      base.contact = 'insideEdge';
      base.exitV = dirOf(randRange(172, 188), randRange(-6, 4), randRange(6, 12));
    }
    if (shot.foot === 'back' && err > w.good && chance(0.06)) base.hitWicket = true;
    return base;
  }

  base.contact = 'clean';
  // aim is screen-relative: -1 = screen-left = world -x
  let theta = shot.theta + input.aim * 18 * os;
  theta += (err / w.ok) * 24 + gauss() * (1 - q) * 14;
  let speed = shot.speed * (0.42 + 0.58 * q) * (0.82 + 0.3 * (ctx.batter.bat / 100)) + incoming * 0.1;
  if (input.power) speed *= 1.1;
  if (ctx.isUser) speed *= USER_POWER[ctx.difficulty];
  let elev = shot.elev + gauss() * (shot.loft ? 2.5 : 1.4);
  if (shot.loft) {
    if (q < 0.55) { elev += randRange(10, 26); speed *= 0.82; }
    else elev += (1 - q) * 8;
  } else if (!defensive) {
    if (err < -w.good) elev += ((-err - w.good) / (w.ok - w.good)) * 10 + 2; // early → uppish
    if (err > w.good) elev -= 3;
    if (input.power) elev += 3;
  }
  if (input.soft && !shot.loft && !defensive) { speed *= 0.42; elev = Math.min(elev, 1); }
  if (defensive) { speed = shot.speed * randRange(0.7, 1.25); theta = shot.theta + gauss() * 22; }
  base.exitV = dirOf(theta, elev, speed);
  // name drives after where they actually went
  if (shot.family === 'drive' && shot.foot === 'front') {
    base.shot = Math.abs(theta) < 12 ? SHOTS.straightDrive : theta >= 38 ? SHOTS.coverDrive : theta > 0 ? SHOTS.offDrive : SHOTS.onDrive;
  } else if (shot.family === 'loft') {
    base.shot = theta >= 30 ? SHOTS.loftedCover : theta <= -14 ? SHOTS.loftedOn : SHOTS.loftedDrive;
  }
  return base;
}

/** Time the AI or user must press for perfect timing (relative to release). */
export function idealPressTime(path: PathSample[], zc: number): number | null {
  const t = timeAtZ(path, zc);
  return t === null ? null : t - SWING_LEAD;
}
