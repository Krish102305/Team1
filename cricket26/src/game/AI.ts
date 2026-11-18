import type { Difficulty, Personality, Player } from './types';
import { DELIVERIES, DeliveryType, deliveryOptions, Variation, DeliveryPlan } from './BowlingEngine';
import { isSpin } from '../data/teams';
import { chooseShot, contactZ, readBall, ShotInput, suitability, timingWindows } from './BattingEngine';
import { SHOTS, ShotDef } from '../data/shots';
import { STUMP_HALF_W, BALL_R, STUMPS_Z, SWING_LEAD } from './constants';
import { chance, clamp, gauss, rand, randRange, weightedPick } from '../utils/random';
import { sampleAt, timeAtZ } from './BallPhysics';

export interface SituationCtx {
  phase: number;          // 0..1 of innings overs used
  ballsLeft: number;
  wicketsDown: number;
  rrr: number | null;     // required run rate (chase)
  crr: number;
  freeHit: boolean;
  difficulty: Difficulty;
}

const AI_BOWL_SCATTER: Record<Difficulty, number> = { easy: 1.9, medium: 1.25, hard: 0.85, pro: 0.6 };
const AI_BOWL_EXEC: Record<Difficulty, [number, number]> = { easy: [0.35, 0.8], medium: [0.55, 0.92], hard: [0.7, 0.98], pro: [0.82, 1.0] };
const AI_NB: Record<Difficulty, number> = { easy: 0.035, medium: 0.02, hard: 0.012, pro: 0.008 };

export function aiChooseDelivery(bowler: Player, batter: Player, s: SituationCtx) {
  const opts = deliveryOptions(bowler.bowlStyle);
  const spin = isSpin(bowler.bowlStyle);
  const smart = s.difficulty === 'hard' || s.difficulty === 'pro';
  const weights = opts.map((t) => {
    let w = 1;
    switch (t) {
      case 'goodLength': w = 4; break;
      case 'fullLength': w = 2; break;
      case 'yorker': w = s.phase > 0.75 ? (smart ? 5 : 3) : 0.6; break;
      case 'bouncer': w = 0.9 + (batter.personality === 'aggressive' && smart ? 0.8 : 0); break;
      case 'inswinger': case 'outswinger': w = s.phase < 0.35 ? 2.4 : 1.1; break;
      case 'offCutter': case 'legCutter': w = s.phase > 0.4 ? 1.6 : 0.8; break;
      case 'slower': w = s.phase > 0.6 ? (smart ? 2.5 : 1.5) : 0.6; break;
      case 'offSpin': case 'legSpin': w = 5; break;
      case 'googly': w = 1.5; break;
      case 'topSpinner': w = 1.2; break;
      case 'slider': w = 1.3; break;
      case 'armBall': w = 1.3; break;
    }
    if (s.difficulty === 'easy') w = 1 + w * 0.3; // less strategic
    return w;
  });
  const type = weightedPick(opts, weights) as DeliveryType;
  const def = DELIVERIES[type];
  let variation: Variation = 'normal';
  if (chance(0.18)) variation = chance(0.5) ? 'quicker' : 'slower';
  const [elo, ehi] = AI_BOWL_EXEC[s.difficulty];
  const execution = randRange(elo, ehi);
  // easy AI bowlers occasionally serve up rank long-hops/full tosses
  let length = def.length, line = def.line;
  if (s.difficulty === 'easy' && chance(0.18)) length = chance(0.5) ? randRange(8, 10) : randRange(-0.6, 0.4);
  if (s.difficulty === 'medium' && chance(0.08)) length = chance(0.5) ? randRange(7.5, 9) : randRange(1.8, 3.2);
  if (smart && !spin && s.phase > 0.75 && type === 'yorker' && chance(0.35)) line = 0.65; // wide yorker
  const stray = s.difficulty === 'easy' ? 0.08 : s.difficulty === 'medium' ? 0.05 : s.difficulty === 'hard' ? 0.03 : 0.02;
  if (chance(stray)) line = chance(0.55) ? randRange(0.75, 1.1) : randRange(-0.75, -0.45);
  const noBall = rand() < AI_NB[s.difficulty] * (1.3 - bowler.bowl / 100);
  return { type, variation, line, length, execution, noBall, scatterMul: AI_BOWL_SCATTER[s.difficulty] };
}

const PERSONALITY_AGGR: Record<Personality, number> = { defensive: 0.18, balanced: 0.4, aggressive: 0.62, power: 0.78 };
const AI_TIMING_SD: Record<Difficulty, number> = { easy: 0.1, medium: 0.078, hard: 0.066, pro: 0.056 };

export interface AIShotDecision { input: ShotInput; shot: ShotDef }

/** AI batting: reads the delivery with perception noise, then commits to a shot with a timing error. */
export function aiDecideShot(plan: DeliveryPlan, batter: Player, offSign: number, s: SituationCtx): AIShotDecision | null {
  const spin = DELIVERIES[plan.type].spin;
  const read = readBall(plan.path, plan.bounceIndex, 9.0, offSign, plan.speedKmh, spin);
  // perception noise: worse batters and better deliveries are misread more
  const noise = (1.15 - batter.bat / 100) * (0.6 + plan.quality * 0.8) * (s.difficulty === 'easy' ? 1.4 : s.difficulty === 'pro' ? 0.75 : 1);
  const perceived = {
    ...read,
    pitchDist: read.pitchDist === null ? null : read.pitchDist + gauss() * 0.9 * noise,
    lineOff: read.lineOff + gauss() * 0.12 * noise,
    height: read.height + gauss() * 0.12 * noise,
  };
  // will it hit the stumps? (perceived)
  const ts = timeAtZ(plan.path, STUMPS_Z);
  const atStumps = ts !== null ? sampleAt(plan.path, ts) : null;
  const hittingStumps = !!atStumps && Math.abs(atStumps.x + gauss() * 0.06 * noise) < STUMP_HALF_W + BALL_R && atStumps.y < 0.75;

  // aggression from situation
  let aggr = PERSONALITY_AGGR[batter.personality];
  if (s.rrr !== null) aggr += clamp((s.rrr - 7.5) * 0.06, -0.25, 0.45);
  else aggr += s.phase > 0.75 ? 0.25 : s.phase < 0.2 ? 0.05 : 0;
  aggr -= Math.max(0, s.wicketsDown - 5) * 0.04 * (s.phase < 0.8 ? 1 : 0.3);
  if (s.freeHit) aggr += 0.4;
  if (s.ballsLeft <= 12 && s.rrr !== null && s.rrr > 9) aggr += 0.3;
  aggr = clamp(aggr, 0.05, 1);

  const len = perceived.pitchDist ?? -1;
  const loose = (len > 7.5 && perceived.height < 1.6) || len < 2.6 || Math.abs(perceived.lineOff) > 0.55;
  // leave balls well outside off when not aggressive
  if (!hittingStumps && perceived.lineOff > 0.5 && aggr < 0.5 && chance(0.55 - aggr * 0.5)) return null;
  if (!hittingStumps && perceived.height > 1.7 && chance(0.6)) return null;

  // candidate shots: (kind, direction, modifiers) — the same inputs a human can give
  type Cand = ShotInput;
  const mk = (kind: ShotInput['kind'], angle: number, o: Partial<ShotInput> = {}): Cand =>
    ({ kind, angle, hasDir: true, power: false, soft: false, sweep: false, foot: 0, pressTime: 0, ...o });
  const cands: Cand[] = [mk('defend', 0)];
  for (const a of [-60, 0, 60]) cands.push(mk('ground', a, { soft: true }));
  for (const a of [-140, -90, -50, -20, 0, 25, 55, 90, 135]) cands.push(mk('ground', a));
  for (const a of [-70, -30, 0, 40]) cands.push(mk('loft', a, { power: aggr > 0.65 }));
  if (aggr > 0.6) cands.push(mk('loft', 90), mk('loft', -150));
  if (spin) cands.push(mk('ground', -90, { sweep: true }), mk('ground', 100, { sweep: true }));
  if (spin && aggr > 0.5) cands.push(mk('loft', -60, { sweep: true }), mk('loft', 0, { foot: 1 }));

  let best = cands[0], bestScore = -1e9, bestShot: ShotDef = SHOTS.forwardDefense;
  const wWicket = 32 - 26 * aggr; // value of a wicket in runs
  const pq = clamp(plan.quality + gauss() * 0.1 * noise, 0, 1);
  for (const c of cands) {
    const shot = chooseShot(c, perceived);
    const suit = suitability(shot, perceived);
    const defensive = shot.family === 'defend' || shot.family === 'defendBack';
    let er: number, risk: number;
    if (defensive) { er = 0.25; risk = 0.006 + (1 - suit) * 0.04; }
    else if (c.soft) { er = (0.45 + 0.4 * suit) * (1 - 0.3 * pq); risk = 0.006 + (1 - suit) * 0.06 + pq * 0.01; }
    else if (shot.loft) { er = (0.8 + 2.0 * suit) * (1 - 0.35 * pq) * (c.power ? 1.1 : 1); risk = 0.05 + (1 - suit) * 0.3 + shot.risk * 0.12 + pq * 0.06; }
    else { er = (0.45 + 1.0 * suit) * (1 - 0.45 * pq); risk = 0.008 + (1 - suit) * 0.1 + shot.risk * 0.03 + pq * 0.015; }
    if (s.freeHit) risk *= 0.15;
    const score = er - risk * wWicket + gauss() * 0.12;
    if (score > bestScore) { bestScore = score; best = c; bestShot = shot; }
  }
  const zc = contactZ(bestShot, best, 9.35).z;
  const tArr = timeAtZ(plan.path, zc);
  if (tArr === null) return null;
  const w = timingWindows({ batter, difficulty: s.difficulty, isUser: false }, bestShot);
  let sd = AI_TIMING_SD[s.difficulty] * (1.45 - batter.bat / 100) * (0.75 + plan.quality * 0.6);
  sd = Math.max(sd, w.perfect * 0.5);
  const err = gauss() * sd + (plan.type === 'slower' ? randRange(-0.05, 0) : 0);
  const pressTime = Math.max(0.12, tArr - SWING_LEAD + err);
  return { input: { ...best, pressTime }, shot: bestShot };
}

/** Running decision used by AI batters (and as a safety hint for the user). */
export function runSafetyMargin(timeToComplete: number, ballArrivalAtEnd: number) {
  return ballArrivalAtEnd - timeToComplete;
}

export function aiRunThreshold(p: Player, s: SituationCtx): number {
  let m = p.personality === 'defensive' ? 1.35 : p.personality === 'balanced' ? 1.1 : p.personality === 'aggressive' ? 0.85 : 0.95;
  if (s.rrr !== null && s.rrr > 10) m -= 0.2;
  if (s.ballsLeft <= 6 && s.rrr !== null) m -= 0.25;
  if (s.difficulty === 'easy') m -= 0.25; // easy AI takes silly runs
  if (s.difficulty === 'pro') m += 0.1;
  return Math.max(0.45, m);
}
