import type { DeliveryMeta, DeliveryOutcome, Difficulty, MatchConfig, Player, WicketInfo, DismissalKind } from './types';
import { MatchManager, RecordResult, oversText } from './MatchManager';
import { BallState, makeBall, stepBall, StepEvents, segmentHitsBox, sampleAt, timeAtZ } from './BallPhysics';
import { DELIVERIES, DeliveryPlan, DeliveryType, deliveryOptions, planDelivery, Variation, deliveryLabel } from './BowlingEngine';
import { resolveShot, ShotInput, ShotResolution, ShotDir } from './BattingEngine';
import { aiChooseDelivery, aiDecideShot, aiRunThreshold, SituationCtx, AIShotDecision } from './AI';
import { chooseFieldSet, FIELD_SETS, fielderStats, fieldPosToWorld, FielderStats, planIntercepts, POSITIONS, predictLive } from './FieldingAI';
import { CommentaryEngine } from './CommentaryEngine';
import { BALL_R, BAT_REACH, BATTER_Z, CREASE_Z, PHYS_SUBSTEPS, RECEIVER_OFFSET, SIM_STEP, STUMP_H, STUMP_HALF_W, STUMPS_Z } from './constants';
import { getPlayer, isLeftArm, isSpin, TEAM_MAP } from '../data/teams';
import { STADIUM_MAP, boundaryRadius, StadiumDef } from '../data/stadiums';
import { chance, clamp, gauss, rand, randRange } from '../utils/random';
import { Replay, ReplayFrame } from './Replay';

export type Phase = 'intro' | 'walkIn' | 'selectBowler' | 'ready' | 'runUp' | 'delivery' | 'live' | 'dead' | 'inningsBreak' | 'matchOver';

export type AnimId =
  | 'idle' | 'walk' | 'run' | 'stance' | 'swing' | 'bowlRun' | 'bowlDeliver' | 'ready' | 'keeper' | 'dive' | 'catch' | 'throw'
  | 'celebrate' | 'breakStumps' | 'umpire' | 'signalOut' | 'signalFour' | 'signalSix' | 'signalWide' | 'signalNoBall'
  | 'runBat' | 'walkBat' | 'appeal' | 'pickup' | 'dejected' | 'batRaise';

export interface Actor {
  kind: 'fielder' | 'batter' | 'umpire';
  playerId: string | null;
  teamId: string | null;
  x: number; y: number; z: number;
  rotY: number;
  mirror: number;
  anim: AnimId;
  animT: number;
  animP: string;
  animSide: number;
  moveSpeed: number;
  holdsBall: boolean;
  gear: 'none' | 'bat' | 'keeper';
  visible: boolean;
}

interface Fielder {
  a: number; // actor index
  playerId: string;
  stats: FielderStats;
  homeX: number; homeZ: number;
  posName: string;
  role: 'field' | 'bowler' | 'keeper';
  state: 'set' | 'chase' | 'toStumps' | 'hold' | 'throwing' | 'celebrate' | 'return' | 'dive' | 'backup' | 'breaking';
  tx: number; tz: number;
  cooldown: number;
  stateT: number;
  speedNow: number;
  dive: boolean;
}

interface Runner {
  a: number;
  playerId: string;
  z: number; x: number;
  end: number;        // last end where grounded (+1 striker end / -1)
  target: number;     // end currently heading to
  running: boolean;
  runFrom: number;
  speedNow: number;
  maxSpeed: number;
  turnWait: number;
}

interface Throw { from: number; end: number; direct: boolean; receiver: number; t: number }

interface DeliveryState {
  id: number;
  plan: DeliveryPlan | null;
  releaseT: number;
  shot: ShotResolution | null;
  pending: { input: ShotInput; deadline: number } | null;
  ai: AIShotDecision | null;
  contactDone: boolean;
  hitBat: boolean;
  hitPad: boolean;
  bouncedSinceHit: boolean;
  touchedFielder: boolean;
  passedBatter: boolean;
  wide: boolean;
  noBall: boolean;
  freeHit: boolean;
  wicket: WicketInfo | null;
  boundary: 0 | 4 | 6;
  deadT: number;
  liveT: number;
  holdT: number;
  meta: DeliveryMeta;
  strikerId: string;
  nonStrikerId: string;
  bowlerId: string;
  startStriker: string;
  lbwT: number;
  lbwOut: boolean;
  keeperDone: boolean;
  wicketBroken: number; // end whose wicket is broken (0 none)
  important: number;
  inAirCalled: boolean;
  stumpingCheck: boolean;
}

export type SoundName = 'bat' | 'batEdge' | 'bounce' | 'stumps' | 'cheer' | 'bigCheer' | 'ooh' | 'catch' | 'throw' | 'whistle' | 'appeal' | 'groan';

export interface EngineListener {
  onState(e: GameEngine): void;           // scoreboard / hud refresh (called on change)
  onNotify(text: string, kind: string, sub?: string): void;
  onCommentary(text: string, priority?: boolean): void;
  onPhase(p: Phase): void;
  onTiming(label: string, shot: string, quality: number): void;
  onSound(s: SoundName, v?: number): void;
  onReplayAvailable(v: boolean): void;
}

const NOOP: EngineListener = { onState() {}, onNotify() {}, onCommentary() {}, onPhase() {}, onTiming() {}, onSound() {}, onReplayAvailable() {} };

export type InputAction =
  | 'batStraight' | 'batLeg' | 'batOff' | 'batDefend' | 'batPower' | 'batLoft' | 'aimLeft' | 'aimRight' | 'footForward' | 'footBack'
  | 'run' | 'pause' | 'replay' | 'bowlType' | 'bowlVariation' | 'bowlAction' | 'bowlLeft' | 'bowlRight' | 'bowlFuller' | 'bowlShorter' | 'skip' | 'camera';

export interface InputState {
  held: Set<InputAction>;
  queue: { a: InputAction; down: boolean }[];
}

const RUNUP_PACE = 2.3, RUNUP_SPIN = 1.25;
const DELIVER_DUR = 0.62, RELEASE_AT = 0.36;

export class GameEngine {
  match: MatchManager;
  config: MatchConfig;
  stadium: StadiumDef;
  listener: EngineListener = NOOP;
  commentary = new CommentaryEngine();
  replay = new Replay();
  t = 0;
  acc = 0;
  phase: Phase = 'intro';
  phaseT = 0;
  paused = false;
  timeScale = 1;
  autoplay = false;
  headless = false;

  ball: BallState = makeBall();
  ballMode: 'hidden' | 'bowlerHand' | 'flight' | 'held' | 'throw' | 'dead' = 'hidden';
  holder = -1;
  throwInfo: Throw | null = null;
  actors: Actor[] = [];
  fielders: Fielder[] = [];
  runners: Runner[] = [];
  umpires: number[] = [];
  departing = -1;
  bowlerF = -1;
  keeperF = -1;
  chaser = -1;
  backupF = -1;
  replanT = 0;
  bails = { striker: 0, other: 0 }; // time since broken (0 = intact)
  endFlip = false;
  runsDone = 0;
  runQueued = false;
  d!: DeliveryState;
  deliveryCounter = 0;
  fieldSet = 'paceBalanced';
  walkInIds: string[] = [];
  pendingOver = false;
  pendingWicketWalk = false;
  lastResult: RecordResult | null = null;
  input: InputState = { held: new Set(), queue: [] };
  camMode = 0;

  // user bowling ui
  bowlType: DeliveryType = 'goodLength';
  bowlVar: Variation = 'normal';
  targetLine = 0.15;
  targetLen = 6;
  meter = 0;
  meterReleased = -1;
  runUpStartZ = -28;
  runUpDur = RUNUP_PACE;
  deliverT = -1;
  lastSpeed = 0;
  lastTiming = '';
  runHint: 'safe' | 'risky' | 'danger' | '' = '';
  bannerText = '';

  constructor(config: MatchConfig) {
    this.config = config;
    this.match = new MatchManager(config);
    this.stadium = STADIUM_MAP[config.stadiumId];
    this.setupInnings();
    this.newDeliveryState();
    this.setPhase('intro');
  }

  get difficulty(): Difficulty { return this.config.difficulty; }
  get inn() { return this.match.inn; }
  get userBatting() { return this.match.userBatting && !this.autoplay; }
  get userBowling() { return !this.match.userBatting && !this.autoplay; }
  get striker(): Player { return getPlayer(this.inn.strikerId); }
  get bowlerPlayer(): Player { return getPlayer(this.inn.currentBowlerId); }
  get offSign() { return this.striker.battingHand === 'R' ? 1 : -1; }
  boundaryAt = (angle: number) => boundaryRadius(this.stadium, angle);

  // ---------------------------------------------------------------- setup
  private mkActor(kind: Actor['kind'], playerId: string | null, teamId: string | null): number {
    this.actors.push({ kind, playerId, teamId, x: 0, y: 0, z: 0, rotY: 0, mirror: 1, anim: 'idle', animT: 0, animP: '', animSide: 1, moveSpeed: 0, holdsBall: false, gear: 'none', visible: true });
    return this.actors.length - 1;
  }

  actorsVersion = 0;

  setupInnings() {
    const inn = this.inn;
    this.actors = [];
    this.fielders = [];
    this.runners = [];
    this.umpires = [];
    const diff = this.difficulty;
    const aiFielding = inn.bowlingTeamId === this.config.aiTeamId;
    for (const pid of inn.bowlingXI) {
      const a = this.mkActor('fielder', pid, inn.bowlingTeamId);
      const p = getPlayer(pid);
      this.fielders.push({ a, playerId: pid, stats: fielderStats(p, diff, aiFielding), homeX: 0, homeZ: 0, posName: '', role: 'field', state: 'set', tx: 0, tz: 0, cooldown: 0, stateT: 0, speedNow: 0, dive: false });
    }
    this.keeperF = Math.max(0, this.fielders.findIndex((f) => getPlayer(f.playerId).role === 'WK'));
    this.actors[this.fielders[this.keeperF].a].gear = 'keeper';
    for (let i = 0; i < 2; i++) {
      const pid = i === 0 ? inn.strikerId : inn.nonStrikerId;
      const a = this.mkActor('batter', pid, inn.battingTeamId);
      this.actors[a].gear = 'bat';
      const p = getPlayer(pid);
      this.runners.push({ a, playerId: pid, z: 0, x: 0, end: i === 0 ? 1 : -1, target: i === 0 ? 1 : -1, running: false, runFrom: 1, speedNow: 0, maxSpeed: 6 + (p.speed / 100) * 1.8, turnWait: 0 });
    }
    this.departing = this.mkActor('batter', null, inn.battingTeamId);
    this.actors[this.departing].gear = 'bat';
    this.actors[this.departing].visible = false;
    this.umpires.push(this.mkActor('umpire', null, null), this.mkActor('umpire', null, null));
    this.actorsVersion++;
    this.endFlip = false;
    // first bowler
    this.match.setBowler(this.match.chooseBowlerAI());
    this.walkInIds = [inn.strikerId, inn.nonStrikerId];
    this.assignField();
    this.placeEveryone(true);
  }

  private runnerFor(pid: string) { return this.runners.find((r) => r.playerId === pid)!; }

  /** Choose and assign field positions for the current bowler. */
  assignField() {
    const inn = this.inn;
    const bowler = getPlayer(inn.currentBowlerId);
    this.bowlerF = this.fielders.findIndex((f) => f.playerId === inn.currentBowlerId);
    const spin = isSpin(bowler.bowlStyle);
    const sit = this.situation();
    this.fieldSet = chooseFieldSet({ spin, phase: sit.phase, difficulty: this.difficulty, wicketsDown: inn.wickets, rrr: sit.rrr, batterAggressive: this.striker.personality === 'aggressive' || this.striker.personality === 'power' });
    const names = FIELD_SETS[this.fieldSet];
    const others = this.fielders.map((_, i) => i).filter((i) => i !== this.bowlerF && i !== this.keeperF)
      .sort((a, b) => getPlayer(this.fielders[b].playerId).field - getPlayer(this.fielders[a].playerId).field);
    const os = this.offSign;
    others.forEach((fi, k) => {
      const pos = POSITIONS[names[k % names.length]];
      const f = this.fielders[fi];
      let p = fieldPosToWorld(pos, os, this.boundaryAt);
      if (spin && (pos.id === 'slip1' || pos.id === 'slip2')) p = fieldPosToWorld({ ...pos, dist: 8.5 }, os, this.boundaryAt);
      f.homeX = p.x; f.homeZ = p.z; f.posName = pos.name; f.role = 'field';
    });
    const k = this.fielders[this.keeperF];
    const kmh = this.bowlerSpeedClass();
    k.role = 'keeper'; k.posName = 'Wicketkeeper';
    k.homeX = 0.35 * os; k.homeZ = spin ? STUMPS_Z + 1.0 : STUMPS_Z + (kmh > 132 ? 14 : kmh > 118 ? 11 : 8);
    const b = this.fielders[this.bowlerF];
    b.role = 'bowler'; b.posName = 'Bowler';
    const leftArm = isLeftArm(bowler.bowlStyle);
    this.runUpDur = spin ? RUNUP_SPIN : RUNUP_PACE;
    this.runUpStartZ = -STUMPS_Z - (spin ? 5.5 : 17);
    b.homeX = leftArm ? -0.9 : 0.9; b.homeZ = this.runUpStartZ;
    // default user bowling choices
    const opts = deliveryOptions(bowler.bowlStyle);
    if (!opts.includes(this.bowlType)) this.bowlType = opts[0];
    this.targetLine = DELIVERIES[this.bowlType].line;
    this.targetLen = DELIVERIES[this.bowlType].length;
  }

  bowlerSpeedClass() {
    const s = this.bowlerPlayer.bowlStyle;
    return s === 'RF' || s === 'LF' ? 140 : s === 'RFM' || s === 'LFM' ? 128 : s === 'RM' || s === 'LM' ? 115 : 85;
  }

  /** Put fielders/batters/umpires at their stations. */
  placeEveryone(teleport: boolean) {
    for (const f of this.fielders) {
      if (teleport) { const a = this.actors[f.a]; a.x = f.homeX; a.z = f.homeZ; }
      f.state = 'set'; f.tx = f.homeX; f.tz = f.homeZ; f.cooldown = 0; f.dive = false;
      this.actors[f.a].holdsBall = false;
    }
    const os = this.offSign;
    const inn = this.inn;
    const s = this.runnerFor(inn.strikerId), n = this.runnerFor(inn.nonStrikerId);
    if (s && n) {
      s.end = 1; s.target = 1; s.running = false; s.z = BATTER_Z; s.x = -0.12 * os; s.speedNow = 0;
      n.end = -1; n.target = -1; n.running = false; n.z = -STUMPS_Z + 0.3; n.x = -1.05 * os; n.speedNow = 0;
      for (const r of [s, n]) { const a = this.actors[r.a]; a.x = r.x; a.z = r.z; a.visible = true; a.mirror = getPlayer(r.playerId).battingHand === 'R' ? 1 : -1; }
    }
    const u0 = this.actors[this.umpires[0]], u1 = this.actors[this.umpires[1]];
    u0.x = -1.3 * os * -1; u0.z = -STUMPS_Z - 2.2; u0.rotY = 0; u0.anim = 'umpire';
    u1.x = -24 * os; u1.z = BATTER_Z - 0.4; u1.rotY = os > 0 ? Math.PI / 2 : -Math.PI / 2; u1.anim = 'umpire';
    this.bails.striker = 0; this.bails.other = 0;
  }

  private newDeliveryState() {
    const inn = this.inn;
    this.d = {
      id: ++this.deliveryCounter + this.match.current * 100000, plan: null, releaseT: 0, shot: null, pending: null, ai: null,
      contactDone: false, hitBat: false, hitPad: false, bouncedSinceHit: false, touchedFielder: false, passedBatter: false,
      wide: false, noBall: false, freeHit: inn.freeHitNext, wicket: null, boundary: 0, deadT: 0, liveT: 0, holdT: 0,
      meta: { deliveryName: '', speedKmh: 0, length: '', line: '' }, strikerId: inn.strikerId, nonStrikerId: inn.nonStrikerId,
      bowlerId: inn.currentBowlerId, startStriker: inn.strikerId, lbwT: -1, lbwOut: false, keeperDone: false, wicketBroken: 0,
      important: 0, inAirCalled: false, stumpingCheck: false,
    };
    this.runsDone = 0;
    this.runQueued = false;
    this.chaser = -1; this.backupF = -1;
    this.holder = -1;
    this.throwInfo = null;
    this.runHint = '';
  }

  situation(): SituationCtx {
    const m = this.match;
    return {
      phase: m.inn.legalBalls / Math.max(1, m.totalBalls), ballsLeft: m.ballsLeft, wicketsDown: m.inn.wickets,
      rrr: m.requiredRunRate(), crr: m.runRate(), freeHit: m.inn.freeHitNext, difficulty: this.difficulty,
    };
  }

  setPhase(p: Phase) {
    this.phase = p;
    this.phaseT = 0;
    this.listener.onPhase(p);
    this.listener.onState(this);
  }

  // ---------------------------------------------------------------- input
  keyDown(a: InputAction) {
    if (!this.input.held.has(a)) this.input.queue.push({ a, down: true });
    this.input.held.add(a);
  }
  keyUp(a: InputAction) {
    this.input.held.delete(a);
    this.input.queue.push({ a, down: false });
  }
  held(a: InputAction) { return this.input.held.has(a); }

  setTargetFromWorld(x: number, z: number) {
    if (!this.userBowling || (this.phase !== 'ready' && this.phase !== 'runUp')) return;
    this.targetLine = clamp(x * this.offSign, -1.3, 1.3);
    this.targetLen = clamp(STUMPS_Z - z, -0.5, 13);
  }

  selectBowler(id: string) {
    if (this.phase !== 'selectBowler') return;
    this.match.setBowler(id);
    this.assignField();
    this.placeEveryone(false);
    this.newDeliveryState();
    this.setPhase('ready');
  }

  continueAfterInningsBreak() {
    if (this.phase !== 'inningsBreak') return;
    this.match.startSecondInnings();
    this.setupInnings();
    this.newDeliveryState();
    this.listener.onNotify(`TARGET ${this.inn.target}`, 'info', `${TEAM_MAP[this.inn.battingTeamId].name} need ${this.inn.target} from ${this.config.overs} overs`);
    this.setPhase('walkIn');
  }

  skipIntro() { if (this.phase === 'intro') this.setPhase('walkIn'); }

  // ---------------------------------------------------------------- main loop
  update(realDt: number) {
    if (this.paused) return;
    if (this.replay.active) { this.replay.update(Math.min(realDt, 0.1)); return; }
    this.acc += Math.min(realDt, 0.1) * this.timeScale;
    let n = 0;
    while (this.acc >= SIM_STEP && n < 400) { this.tick(SIM_STEP); this.acc -= SIM_STEP; n++; }
  }

  /** advance simulated seconds (used by headless tests) */
  advance(seconds: number) {
    const steps = Math.round(seconds / SIM_STEP);
    for (let i = 0; i < steps; i++) this.tick(SIM_STEP);
  }

  private tick(h: number) {
    this.t += h;
    this.phaseT += h;
    this.processInput();
    switch (this.phase) {
      case 'intro': if (this.phaseT > 6 || this.autoplay) this.setPhase('walkIn'); break;
      case 'walkIn': this.tickWalkIn(h); break;
      case 'selectBowler': if (this.autoplay) this.selectBowler(this.match.chooseBowlerAI()); break;
      case 'ready': this.tickReady(h); break;
      case 'runUp': this.tickRunUp(h); break;
      case 'delivery': this.tickBall(h); this.tickDelivery(h); break;
      case 'live': this.tickBall(h); this.tickLive(h); break;
      case 'dead': this.tickDead(h); break;
      case 'inningsBreak': if (this.autoplay && this.phaseT > 1) this.continueAfterInningsBreak(); break;
      case 'matchOver': break;
    }
    this.tickActors(h);
    if (this.phase === 'runUp' || this.phase === 'delivery' || this.phase === 'live' || this.phase === 'dead') this.replay.capture(this, h);
  }

  private processInput() {
    const q = this.input.queue;
    this.input.queue = [];
    for (const ev of q) {
      if (!ev.down) {
        if (ev.a === 'bowlAction' && this.phase === 'runUp' && this.userBowling && this.meterReleased < 0) this.meterReleased = this.meter;
        continue;
      }
      const a = ev.a;
      if (a === 'skip' || (a === 'bowlAction' && !this.userBowling)) {
        if (this.phase === 'intro') { this.setPhase('walkIn'); continue; }
        if (this.phase === 'walkIn') { this.finishWalkIn(); continue; }
        if (this.phase === 'dead' && this.phaseT > 0.6) { this.phaseT = 99; continue; }
      }
      if (a === 'replay' && (this.phase === 'dead' || this.phase === 'ready' || this.phase === 'selectBowler') && this.replay.hasClip()) {
        this.replay.start(this);
        continue;
      }
      if (a === 'camera') { this.camMode = (this.camMode + 1) % 3; continue; }
      if (this.userBowling) this.bowlingInput(a);
      if (this.userBatting) this.battingInput(a);
    }
  }

  private bowlingInput(a: InputAction) {
    const opts = deliveryOptions(this.bowlerPlayer.bowlStyle);
    if (this.phase === 'ready') {
      if (a === 'bowlType') {
        this.bowlType = opts[(opts.indexOf(this.bowlType) + 1) % opts.length];
        this.targetLine = DELIVERIES[this.bowlType].line;
        this.targetLen = DELIVERIES[this.bowlType].length;
        this.listener.onState(this);
      } else if (a === 'bowlVariation') {
        const v: Variation[] = ['normal', 'quicker', 'slower'];
        this.bowlVar = v[(v.indexOf(this.bowlVar) + 1) % 3];
        this.listener.onState(this);
      } else if (a === 'bowlAction' && this.phaseT > 0.4 && this.fieldSettled()) {
        this.beginRunUp();
      }
    }
  }

  private battingInput(a: InputAction) {
    if (this.phase === 'live') {
      if (a === 'run') this.requestRun();
      if (a === 'batDefend') this.cancelRun();
      return;
    }
    if (this.phase !== 'delivery' || this.d.shot || !this.d.plan) return;
    const dirMap: Partial<Record<InputAction, ShotDir>> = { batStraight: 'straight', batLeg: 'leg', batOff: 'off', batDefend: 'defend', batPower: 'power' };
    const dir = dirMap[a];
    if (!dir) return;
    const now = this.t - this.d.releaseT;
    if (this.d.pending) {
      // merge keys pressed within the grace window
      const p = this.d.pending.input;
      if (dir === 'power') p.power = true;
      else if (p.dir === 'power') p.dir = dir;
      return;
    }
    const input: ShotInput = { dir, loft: false, power: dir === 'power', aim: 0, foot: 0, pressTime: now };
    if (dir === 'defend' && this.held('batLoft')) input.dir = 'leave';
    this.d.pending = { input, deadline: this.t + 0.07 };
  }

  private commitPending() {
    const p = this.d.pending;
    if (!p || this.t < p.deadline) return;
    this.d.pending = null;
    const inp = p.input;
    inp.loft = this.held('batLoft') && inp.dir !== 'defend' && inp.dir !== 'leave';
    inp.power = inp.power || this.held('batPower');
    if (inp.dir === 'power') {
      inp.dir = this.held('batOff') ? 'off' : this.held('batLeg') ? 'leg' : this.held('batStraight') ? 'straight' : 'power';
    }
    inp.aim = (this.held('aimLeft') ? -1 : 0) + (this.held('aimRight') ? 1 : 0);
    inp.foot = (this.held('footForward') ? 1 : 0) + (this.held('footBack') ? -1 : 0);
    this.playShot(inp, true);
  }

  private playShot(input: ShotInput, isUser: boolean) {
    const plan = this.d.plan!;
    const res = resolveShot(input, {
      path: plan.path, bounceIndex: plan.bounceIndex, offSign: this.offSign, batter: this.striker, difficulty: this.difficulty,
      isUser, speedKmh: plan.speedKmh, spin: DELIVERIES[plan.type].spin, deliveryQuality: plan.quality,
      movement: clamp(Math.abs(plan.ball.swingAcc) / 2.4 + Math.abs(plan.ball.turnOnBounce) / 1.6, 0, 1),
    });
    this.d.shot = res;
    const sa = this.actors[this.runnerFor(this.d.strikerId).a];
    sa.anim = res.shot.family === 'leave' ? 'stance' : 'swing';
    sa.animP = res.shot.family;
    sa.animT = 0;
    if (res.shot.family === 'leave') { sa.animP = 'leave'; sa.anim = 'swing'; }
    if (res.exitV && res.contact !== 'miss' && res.contact !== 'leave' && this.ball.p.z >= res.zContact) {
      if (this.ball.p.z < STUMPS_Z - 0.1 && this.phase === 'delivery') this.onBatContact(res);
      else { res.contact = 'miss'; res.exitV = null; }
    }
  }

  // ---------------------------------------------------------------- phases
  private tickWalkIn(h: number) {
    // batters jog from the pavilion to their ends
    const ids = this.walkInIds;
    let done = true;
    for (const id of ids) {
      const r = this.runnerFor(id);
      if (!r) continue;
      const a = this.actors[r.a];
      const isStriker = id === this.inn.strikerId;
      const tx = isStriker ? -0.12 * this.offSign : -1.05 * this.offSign;
      const tz = isStriker ? BATTER_Z : -STUMPS_Z + 0.3;
      if (this.phaseT < 0.05) {
        const ang = this.pavilionAngle();
        const R = this.boundaryAt(ang) - 4;
        a.x = Math.sin(ang) * R * 0.55 + (isStriker ? 1 : -1); a.z = Math.cos(ang) * R * 0.55;
      }
      const dx = tx - a.x, dz = tz - a.z;
      const dist = Math.hypot(dx, dz);
      if (dist > 0.15) {
        done = false;
        const sp = Math.min(dist, 4.2 * h * (this.phaseT < 0.5 ? this.phaseT * 2 : 1));
        a.x += (dx / dist) * sp; a.z += (dz / dist) * sp;
        a.rotY = Math.atan2(dx, dz);
        this.setAnim(a, 'runBat'); a.moveSpeed = 4.2;
      }
      r.x = a.x; r.z = a.z;
    }
    const dep = this.actors[this.departing];
    if (dep.visible) {
      const ang = this.pavilionAngle();
      const tx = Math.sin(ang) * 80, tz = Math.cos(ang) * 80;
      const dx = tx - dep.x, dz = tz - dep.z, dist = Math.hypot(dx, dz);
      dep.x += (dx / dist) * 2.2 * h; dep.z += (dz / dist) * 2.2 * h; dep.rotY = Math.atan2(dx, dz);
      this.setAnim(dep, 'walkBat'); dep.moveSpeed = 1.6;
      if (this.phaseT > 6) dep.visible = false;
    }
    if (done || this.phaseT > 12 || this.autoplay) this.finishWalkIn();
  }

  pavilionAngle() { return this.endFlip ? Math.PI * 0.62 : -Math.PI * 0.38; }

  private finishWalkIn() {
    this.actors[this.departing].visible = false;
    this.placeEveryone(true);
    if (this.pendingOver) { this.pendingOver = false; this.startNewOver(); return; }
    if (this.inn.legalBalls === 0 && this.inn.wickets === 0 && this.inn.thisOver.length === 0) {
      this.listener.onCommentary(`${TEAM_MAP[this.inn.battingTeamId].name} openers ${getPlayer(this.inn.strikerId).name} and ${getPlayer(this.inn.nonStrikerId).name} are at the crease. ${getPlayer(this.inn.currentBowlerId).name} has the new ball.`);
      if (this.userBowling) { this.setPhase('selectBowler'); return; }
    }
    this.newDeliveryState();
    this.setPhase('ready');
  }

  private startNewOver() {
    this.endFlip = !this.endFlip;
    if (this.userBowling) { this.setPhase('selectBowler'); return; }
    this.match.setBowler(this.match.chooseBowlerAI());
    this.assignField();
    this.placeEveryone(false);
    this.newDeliveryState();
    this.listener.onCommentary(`${getPlayer(this.inn.currentBowlerId).name} will bowl the next over.`);
    this.setPhase('ready');
  }

  fieldSettled() {
    return this.fielders.every((f) => Math.hypot(this.actors[f.a].x - f.homeX, this.actors[f.a].z - f.homeZ) < 3) || this.phaseT > 12;
  }

  private tickReady(h: number) {
    this.ballMode = 'bowlerHand';
    if (!this.userBowling) {
      const wait = this.autoplay ? 0.3 : 1.6;
      if (this.phaseT > wait && this.fieldSettled()) this.beginRunUp();
    } else {
      const sp = 1.4 * h;
      const os = this.offSign;
      if (this.held('bowlLeft') || this.held('aimLeft')) this.targetLine = clamp(this.targetLine + sp * os * 1, -1.3, 1.3);
      if (this.held('bowlRight') || this.held('aimRight')) this.targetLine = clamp(this.targetLine - sp * os * 1, -1.3, 1.3);
      if (this.held('bowlFuller') || this.held('footForward')) this.targetLen = clamp(this.targetLen - sp * 3, -0.5, 13);
      if (this.held('bowlShorter') || this.held('footBack')) this.targetLen = clamp(this.targetLen + sp * 3, -0.5, 13);
    }
  }

  private beginRunUp() {
    const b = this.fielders[this.bowlerF];
    const a = this.actors[b.a];
    a.x = b.homeX; a.z = this.runUpStartZ;
    this.meter = 0;
    this.meterReleased = -1;
    this.deliverT = -1;
    this.setPhase('runUp');
    if (chance(0.45)) this.listener.onCommentary(this.commentary.line('runup', { bw: getPlayer(b.playerId).name, b: this.striker.name }));
    if (this.inn.freeHitNext) this.listener.onNotify('FREE HIT', 'freehit');
  }

  private tickRunUp(h: number) {
    const b = this.fielders[this.bowlerF];
    const a = this.actors[b.a];
    const p = clamp(this.phaseT / this.runUpDur, 0, 1);
    this.meter = p;
    const stopZ = -STUMPS_Z - 0.9;
    if (this.deliverT < 0) {
      // ease-in run toward the crease
      const z = this.runUpStartZ + (stopZ - this.runUpStartZ) * (p * (0.6 + 0.4 * p));
      a.moveSpeed = Math.abs(stopZ - this.runUpStartZ) / this.runUpDur * 1.2;
      a.z = z; a.rotY = 0;
      this.setAnim(a, 'bowlRun');
      if (p >= 1) { this.deliverT = 0; this.setAnim(a, 'bowlDeliver'); }
    } else {
      this.deliverT += h;
      a.z = Math.min(-STUMPS_Z + 0.4, a.z + h * 3);
      if (this.deliverT >= RELEASE_AT && !this.d.plan) this.release();
    }
    if (this.userBatting) { /* batter waits in stance */ }
  }

  private release() {
    const bowler = this.bowlerPlayer;
    let req;
    if (this.userBowling) {
      const m = this.meterReleased < 0 ? 1 : this.meterReleased;
      const zoneLo = 0.72, zoneHi = 0.86;
      let exec: number;
      if (m >= zoneLo && m <= zoneHi) exec = 1 - (Math.abs(m - 0.79) / 0.07) * 0.12;
      else exec = Math.max(0.12, 0.86 - (m < zoneLo ? zoneLo - m : m - zoneHi) * 3);
      const noBall = m > 0.96;
      req = { type: this.bowlType, variation: this.bowlVar, line: this.targetLine, length: this.targetLen, execution: exec, noBall, scatterMul: 1 };
      this.lastTiming = m >= zoneLo && m <= zoneHi ? (exec > 0.95 ? 'PERFECT RELEASE' : 'GOOD RELEASE') : noBall ? 'OVERSTEPPED' : m < zoneLo ? 'EARLY RELEASE' : 'LATE RELEASE';
      this.listener.onTiming(this.lastTiming, '', exec);
    } else {
      req = aiChooseDelivery(bowler, this.striker, this.situation());
    }
    const plan = planDelivery({ bowler, offSign: this.offSign, ...req });
    this.d.plan = plan;
    this.d.releaseT = this.t;
    this.d.noBall = plan.noBall;
    this.d.meta.deliveryName = plan.name;
    this.d.meta.speedKmh = plan.speedKmh;
    this.d.meta.length = plan.lengthName;
    this.d.meta.line = plan.lineName;
    this.lastSpeed = plan.speedKmh;
    this.ball = { ...plan.ball, p: { ...plan.ball.p }, v: { ...plan.ball.v } };
    this.ballMode = 'flight';
    if (this.d.noBall) { this.listener.onNotify('NO BALL', 'extra'); this.listener.onSound('whistle'); }
    // AI batter decision (perception happens now; no knowledge of future outcome)
    if (!this.userBatting) {
      this.d.ai = aiDecideShot(plan, this.striker, this.offSign, this.situation());
      if (this.d.ai) this.d.ai.input.aim = this.aiAimForGap(this.d.ai.shot.theta, this.d.ai.shot.loft);
    }
    this.setPhase('delivery');
    this.listener.onState(this);
  }

  /** choose the aim (-1/0/1) that points the shot furthest from fielders */
  private aiAimForGap(theta: number, loft: boolean): number {
    const os = this.offSign;
    const angles: number[] = [];
    this.fielders.forEach((f, i) => {
      if (i === this.keeperF) return;
      const a = this.actors[f.a];
      const dx = a.x * os, dz = BATTER_Z - a.z;
      const dist = Math.hypot(dx, dz);
      const deep = dist > 45;
      if (loft ? !deep : deep) return;
      angles.push((Math.atan2(dx, dz) * 180) / Math.PI);
    });
    let best = 0, bestGap = -1;
    for (const aim of [0, -1, 1]) {
      const th = theta + aim * 18 * os * os; // batter frame
      let gap = 180;
      for (const fa of angles) { let dd = Math.abs(th - fa); if (dd > 180) dd = 360 - dd; gap = Math.min(gap, dd); }
      if (gap > bestGap + (aim === 0 ? 0 : 3)) { bestGap = gap; best = aim; }
    }
    // aim is screen-relative; convert batter-frame offset back
    return best * os;
  }

  // ---------------------------------------------------------------- ball physics & collisions
  private ev: StepEvents = { bounced: false, bounceOnPitch: false, bounceX: 0, bounceZ: 0 };

  private tickBall(h: number) {
    if (this.ballMode !== 'flight' && this.ballMode !== 'throw') return;
    const sub = h / PHYS_SUBSTEPS;
    for (let i = 0; i < PHYS_SUBSTEPS; i++) {
      const px = this.ball.p.x, py = this.ball.p.y, pz = this.ball.p.z;
      stepBall(this.ball, sub, this.ev);
      if (this.ev.bounced) {
        if (this.d.hitBat) this.d.bouncedSinceHit = true;
        if (Math.abs(this.ball.v.y) > 1.5) this.listener.onSound('bounce', Math.min(1, Math.abs(this.ball.v.y) / 8));
      }
      const b = this.ball.p;
      // striker stumps
      if (!this.d.wicketBroken && !this.d.touchedFielder && this.ballMode === 'flight' &&
        segmentHitsBox(px, py, pz, b.x, b.y, b.z, -STUMP_HALF_W - BALL_R, STUMP_HALF_W + BALL_R, 0, STUMP_H + BALL_R, STUMPS_Z - 0.03 - BALL_R, STUMPS_Z + 0.03 + BALL_R)) {
        this.onBallHitsStrikerStumps();
        if (this.phase === 'dead') return;
      }
      if (this.ballMode === 'throw' && this.throwInfo) {
        const E = this.throwInfo.end;
        const sz = E * STUMPS_Z;
        if (!this.wicketDown(E) && segmentHitsBox(px, py, pz, b.x, b.y, b.z, -STUMP_HALF_W - BALL_R, STUMP_HALF_W + BALL_R, 0, STUMP_H + BALL_R, sz - 0.04 - BALL_R, sz + 0.04 + BALL_R)) {
          this.onThrowHitsStumps(E);
          if (this.phase === 'dead') return;
        }
      }
      // boundary
      const r = Math.hypot(b.x, b.z);
      if (r > 40 && r >= this.boundaryAt(Math.atan2(b.x, b.z))) { this.onBoundary(); return; }
      if (this.phase === 'delivery') this.deliveryCollisions(px, py, pz);
      if (this.phase !== 'delivery' && this.phase !== 'live') return;
    }
  }

  private wicketDown(E: number) { return E > 0 ? this.bails.striker > 0 : this.bails.other > 0; }

  private breakWicket(E: number) {
    if (E > 0) this.bails.striker = 0.001; else this.bails.other = 0.001;
    this.d.wicketBroken = E;
    this.listener.onSound('stumps');
  }

  private onBallHitsStrikerStumps() {
    const d = this.d;
    this.breakWicket(1);
    // deflect
    this.ball.v.z *= -0.25; this.ball.v.x += gauss() * 1.5; this.ball.v.y = Math.abs(this.ball.v.y) * 0.3 + 0.5;
    if (d.noBall || d.freeHit) { this.listener.onCommentary('Hits the stumps, but it\'s a ' + (d.noBall ? 'no ball!' : 'free hit!')); return; }
    if (d.wide) return;
    d.meta.edged = d.hitBat;
    this.wicket({ kind: 'bowled', batterId: d.strikerId }, d.hitBat ? 'playedOn' : 'bowled');
  }

  private deliveryCollisions(px: number, py: number, pz: number) {
    const d = this.d, b = this.ball.p, plan = d.plan!;
    const os = this.offSign;
    // bat contact
    const s = d.shot;
    if (s && !d.contactDone && s.exitV && s.contact !== 'miss' && s.contact !== 'leave' && pz < s.zContact && b.z >= s.zContact) {
      this.onBatContact(s);
      return;
    }
    // pad (only when bat missed / no shot)
    const noBat = !s || s.contact === 'miss' || s.contact === 'leave';
    if (noBat && !d.hitPad) {
      const fz = s && s.contact === 'miss' ? s.zContact : 9.0;
      const lo = -0.24, hi = 0.12;
      const minX = Math.min(lo * os, hi * os), maxX = Math.max(lo * os, hi * os);
      if (segmentHitsBox(px, py, pz, b.x, b.y, b.z, minX - BALL_R, maxX + BALL_R, 0, 0.85, fz - 0.2, fz + 0.55)) {
        this.onPadHit();
        return;
      }
    }
    // beamer / high full toss
    if (!d.noBall && this.ball.bounces === 0 && pz < 9.3 && b.z >= 9.3 && b.y > 1.1) {
      d.noBall = true; this.listener.onNotify('NO BALL', 'extra', 'Above waist height'); this.listener.onSound('whistle');
    }
    // passing the batter
    if (!d.passedBatter && b.z > 9.75) {
      d.passedBatter = true;
      if (noBat) {
        const lineOff = b.x * os;
        if (lineOff > 0.92 || lineOff < -0.62 || b.y > 1.9) { d.wide = true; }
        else if (s && s.contact === 'miss') { d.meta.beaten = true; }
        if (!s || s.contact === 'leave') d.meta.leave = true;
        this.toLive();
      }
    }
  }

  private onBatContact(s: ShotResolution) {
    const d = this.d;
    d.contactDone = true;
    d.hitBat = true;
    d.meta.shotName = s.shot.name;
    d.meta.timing = s.timing;
    d.meta.contact = s.contact;
    d.meta.lofted = s.shot.loft;
    d.meta.edged = s.contact !== 'clean';
    d.meta.defended = s.shot.family === 'defend' || s.shot.family === 'defendBack';
    const v = s.exitV!;
    this.ball.v = { ...v };
    this.ball.bounces = 0;
    this.ball.rolling = false;
    this.ball.dragMul = 1;
    this.ball.swingAcc = 0;
    this.ball.turnOnBounce = 0;
    this.ball.pitchE = 0.42;
    this.ball.pitchKeep = 0.85;
    this.listener.onSound(s.contact === 'clean' ? 'bat' : 'batEdge', s.quality);
    const label = s.contact === 'clean' ? s.timing : s.contact === 'edge' ? 'Edged' : s.contact === 'topEdge' ? 'Top Edge' : 'Inside Edge';
    if (this.userBatting) this.listener.onTiming(label, s.shot.name, s.quality);
    this.lastTiming = label;
    if (s.hitWicket && !d.noBall && !d.freeHit) {
      this.breakWicket(1);
      this.wicket({ kind: 'hitwicket', batterId: d.strikerId }, 'hitwicket');
      return;
    }
    this.toLive();
    if (v.y > 9 && !d.inAirCalled) { d.inAirCalled = true; this.listener.onCommentary(this.commentary.line('highInAir'), true); this.listener.onSound('ooh'); }
  }

  private onPadHit() {
    const d = this.d, plan = d.plan!, os = this.offSign;
    d.hitPad = true;
    const b = this.ball.p;
    // LBW evaluation using the original (pre-impact) path
    const ts = timeAtZ(plan.path, STUMPS_Z);
    const at = ts !== null ? sampleAt(plan.path, ts) : null;
    const pitch = plan.bounceIndex >= 0 ? plan.path[plan.bounceIndex] : null;
    const strictness = this.userBatting ? ({ easy: 0.6, medium: 0.85, hard: 1, pro: 1 } as const)[this.difficulty] : 1;
    // umpire's call: ball must be clearly hitting (centre within ~2/3 of the stumps)
    const hitting = !!at && Math.abs(at.x) < STUMP_HALF_W * 0.8 * strictness && at.y < STUMP_H - 0.05;
    const tooFar = STUMPS_Z - b.z > 2.6;
    const pitchedOutsideLeg = !!pitch && pitch.x * os < -(STUMP_HALF_W + BALL_R);
    const impactLine = b.x * os;
    const shotOffered = !!d.shot && d.shot.contact !== 'leave';
    const inLine = Math.abs(impactLine) <= STUMP_HALF_W + BALL_R || (!shotOffered && impactLine > 0);
    d.lbwOut = hitting && !tooFar && !pitchedOutsideLeg && inLine && !d.noBall && !d.freeHit && !d.wide && rand() > 0.25;
    d.lbwT = 0;
    // deflection off pad
    this.ball.v = { x: this.ball.v.x * 0.2 + gauss() * 1.6, y: 1.2, z: -Math.abs(this.ball.v.z) * randRange(0.05, 0.18) };
    this.ball.bounces = 1;
    this.ball.rolling = false;
    this.ball.dragMul = 1;
    this.ball.swingAcc = 0;
    this.ball.turnOnBounce = 0;
    this.listener.onSound('appeal');
    for (const f of this.fielders) if (f.role !== 'field' || Math.hypot(this.actors[f.a].x, this.actors[f.a].z - BATTER_Z) < 25) this.setAnim(this.actors[f.a], 'appeal');
    this.toLive();
  }

  private toLive() {
    if (this.phase !== 'delivery') return;
    this.setPhase('live');
    this.d.liveT = 0;
    if (this.d.hitBat || this.d.hitPad) this.replan();
  }

  // ---------------------------------------------------------------- live play
  private replan() {
    this.replanT = 0;
    if (this.ballMode !== 'flight') return;
    const pred = predictLive(this.ball, this.boundaryAt, 12);
    const fl = this.fielders.map((f, i) => {
      const a = this.actors[f.a];
      const keeperBehind = i === this.keeperF && !this.d.passedBatter && this.ball.v.z < 0;
      return { x: a.x, z: a.z, stats: f.stats, available: f.cooldown <= 0 && f.state !== 'hold' && !keeperBehind, isKeeper: i === this.keeperF };
    });
    const ints = planIntercepts(pred, fl, this.d.bouncedSinceHit || !this.d.hitBat);
    const prevChaser = this.chaser;
    this.chaser = ints.length ? ints[0].fielder : -1;
    this.backupF = ints.length > 1 ? ints[1].fielder : -1;
    // keeper should not chase balls hit far in front: let infielders do it, unless it's behind
    if (this.chaser === this.keeperF && ints.length > 1 && this.ball.v.z < -2 && ints[0].t > 1.2) { this.chaser = ints[1].fielder; this.backupF = ints.length > 2 ? ints[2].fielder : -1; }
    for (const it of ints) {
      const f = this.fielders[it.fielder];
      if (it.fielder === this.chaser) { f.state = 'chase'; f.tx = it.x; f.tz = it.z; f.dive = it.dive; }
    }
    if (this.backupF >= 0 && this.backupF !== this.keeperF) {
      const f = this.fielders[this.backupF];
      const it = ints[1];
      const dx = it.x - this.ball.p.x, dz = it.z - this.ball.p.z, dl = Math.hypot(dx, dz) || 1;
      f.state = 'backup'; f.tx = it.x + (dx / dl) * 8; f.tz = it.z + (dz / dl) * 8;
    }
    if (prevChaser >= 0 && prevChaser !== this.chaser && prevChaser !== this.backupF) {
      const f = this.fielders[prevChaser];
      if (f.state === 'chase') f.state = 'return';
    }
    // run hint for user
    const first = ints[0];
    if (first) this.predictedCollect = { t: this.t + first.t, x: first.x, z: first.z, boundary: first.beyondBoundary };
  }

  predictedCollect: { t: number; x: number; z: number; boundary: boolean } | null = null;

  private tickLive(h: number) {
    if (this.phase !== 'live') return;
    const d = this.d;
    d.liveT += h;
    this.replanT += h;
    // LBW decision delay
    if (d.lbwT >= 0) {
      d.lbwT += h;
      if (d.lbwT > 0.9) {
        const out = d.lbwOut;
        d.lbwT = -1;
        if (out) { this.setAnim(this.actors[this.umpires[0]], 'signalOut'); this.wicket({ kind: 'lbw', batterId: d.strikerId }, 'lbw'); return; }
        d.meta.appealDenied = true;
      }
    }
    if (this.ballMode === 'flight' && this.replanT > 0.35 &&
      (d.hitBat || d.hitPad || d.keeperDone || this.ball.p.z > this.fielders[this.keeperF].homeZ + 1.5)) this.replan();
    this.tickFielders(h);
    if (this.phase !== 'live') return;
    this.tickHolder(h);
    if (this.phase !== 'live') return;
    this.tickRunners(h);
    if (this.phase !== 'live') return;
    this.aiRunning();
    this.computeRunHint();
    // dead ball checks
    const bothIn = this.runners.every((r) => this.inGround(r, r.end) && !r.running);
    if (this.holder >= 0 && bothIn && !this.runQueued) {
      d.holdT += h;
      if (d.holdT > 0.5) this.deadBall();
    } else d.holdT = 0;
    if (this.ballMode === 'flight' && this.ball.rolling && Math.hypot(this.ball.v.x, this.ball.v.z) < 0.05 && d.liveT > 15 && bothIn) this.deadBall();
    if (d.liveT > 28) this.deadBall();
  }

  private moveActorToward(f: Fielder, tx: number, tz: number, h: number, maxSpeed: number, faceBall = true) {
    const a = this.actors[f.a];
    const dx = tx - a.x, dz = tz - a.z;
    const dist = Math.hypot(dx, dz);
    const want = dist < 0.25 ? 0 : Math.min(maxSpeed, dist * 3);
    f.speedNow += clamp(want - f.speedNow, -12 * h, 7 * h);
    if (dist > 0.01) {
      const step = Math.min(dist, f.speedNow * h);
      let nx = a.x + (dx / dist) * step, nz = a.z + (dz / dist) * step;
      // keep off the pitch (except keeper/bowler/close fielders)
      if (f.role === 'field' && Math.abs(nz) < STUMPS_Z + 0.5 && Math.abs(nx) < 1.7) nx = nx >= 0 ? 1.7 : -1.7;
      // stay inside the boundary
      const R = this.boundaryAt(Math.atan2(nx, nz)) - 0.6;
      const r = Math.hypot(nx, nz);
      if (r > R) { nx *= R / r; nz *= R / r; }
      a.x = nx; a.z = nz;
    }
    a.moveSpeed = f.speedNow;
    if (f.speedNow > 0.4) a.rotY = Math.atan2(dx, dz);
    else if (faceBall) a.rotY = Math.atan2(this.ball.p.x - a.x, this.ball.p.z - a.z);
    return dist;
  }

  private tickFielders(h: number) {
    const d = this.d;
    const ball = this.ball.p;
    for (let i = 0; i < this.fielders.length; i++) {
      const f = this.fielders[i];
      const a = this.actors[f.a];
      f.cooldown -= h; f.stateT += h;
      if (f.state === 'hold' || f.state === 'throwing' || f.state === 'breaking' || f.state === 'celebrate') continue;
      if (f.state === 'dive') { if (f.stateT > 1.0) { f.state = 'return'; } continue; }
      let tx = f.homeX, tz = f.homeZ, sp = 3.5;
      const stumpsReceiver = this.receiverFor(-1);
      if (f.state === 'chase') { tx = f.tx; tz = f.tz; sp = f.stats.speed; if (d.liveT < f.stats.reaction) sp = 0; }
      else if (f.state === 'backup') { tx = f.tx; tz = f.tz; sp = f.stats.speed * 0.85; }
      else if (i === this.keeperF && (d.hitBat || d.passedBatter)) {
        const kp = this.ballMode === 'flight' && d.passedBatter && !d.hitBat && !d.keeperDone;
        if (kp) { tx = clamp(ball.x, -4, 4); tz = f.homeZ; sp = 5; }
        else { tx = 0.2 * this.offSign; tz = STUMPS_Z + RECEIVER_OFFSET; sp = 6; f.state = 'toStumps'; }
      } else if (i === this.keeperF) {
        // track the line of the delivery
        if (this.ballMode === 'flight' && d.plan) { tx = clamp(ball.x * 1.2, -2.5, 2.5); tz = f.homeZ; sp = 4.5; }
      } else if (i === stumpsReceiver && d.hitBat) {
        tx = -0.3 * this.offSign; tz = -STUMPS_Z - RECEIVER_OFFSET; sp = f.stats.speed * 0.9; f.state = 'toStumps';
      } else if (i === this.bowlerF) {
        // follow through
        tx = a.x; tz = Math.min(-4.5, a.z + 0.01);
        if (d.liveT > 0.8 || this.phase === 'live') { tx = 1.8 * (isLeftArm(this.bowlerPlayer.bowlStyle) ? -1 : 1); tz = -6; }
        sp = 3;
      } else if (f.state === 'return' || f.state === 'set' || f.state === 'toStumps') {
        // drift toward the ball a little (walking in / covering)
        if (d.hitBat && this.ballMode === 'flight') {
          const dx = ball.x - f.homeX, dz = ball.z - f.homeZ, dl = Math.hypot(dx, dz);
          if (dl < 30) { tx = f.homeX + (dx / dl) * Math.min(6, dl * 0.3); tz = f.homeZ + (dz / dl) * Math.min(6, dl * 0.3); sp = 4; }
        }
      }
      this.moveActorToward(f, tx, tz, h, sp);
      // animation
      if (a.anim !== 'appeal' || a.animT > 1.2) {
        if (f.speedNow > 3.5) this.setAnim(a, 'run');
        else if (f.speedNow > 0.5) this.setAnim(a, 'walk');
        else if (i === this.keeperF && !d.hitBat && (this.phase === 'delivery' || this.phase === 'runUp' || this.phase === 'ready')) this.setAnim(a, 'keeper');
        else if (this.phase === 'delivery' || (this.phase === 'live' && this.ballMode === 'flight')) this.setAnim(a, 'ready');
        else this.setAnim(a, 'idle');
      }
      // collection attempts
      if (this.ballMode === 'flight' && f.cooldown <= 0 && this.phase === 'live') this.tryCollect(i, f);
      if (this.phase !== 'live') return;
    }
  }

  /** index of fielder who receives throws at the bowler's end */
  private receiverFor(end: number): number {
    if (end > 0) return this.keeperF;
    if (this.chaser !== this.bowlerF && this.holder !== this.bowlerF) return this.bowlerF;
    // nearest non-chasing fielder
    let best = -1, bd = 1e9;
    this.fielders.forEach((f, i) => {
      if (i === this.chaser || i === this.keeperF || i === this.holder || i === this.backupF) return;
      const a = this.actors[f.a];
      const dd = Math.hypot(a.x, a.z + STUMPS_Z);
      if (dd < bd) { bd = dd; best = i; }
    });
    return best;
  }

  private tryCollect(i: number, f: Fielder) {
    const d = this.d, a = this.actors[f.a], b = this.ball.p;
    const dist = Math.hypot(b.x - a.x, b.z - a.z);
    const inAir = d.hitBat && !d.bouncedSinceHit && !d.touchedFielder;
    const isKeeperOnDelivery = i === this.keeperF && !d.hitBat && !d.keeperDone;
    const reach = isKeeperOnDelivery ? 1.5 : 0.95;
    const diveReach = 2.4;
    const maxH = inAir || isKeeperOnDelivery ? 2.4 : 0.9;
    if (b.y > maxH + (f.state === 'chase' ? 0.3 : 0)) return;
    // the ball has to leave the bat before anyone can touch it (edges excepted for the keeper)
    const fromBat = Math.hypot(b.x, b.z - (d.shot?.zContact ?? BATTER_Z));
    if (d.hitBat && fromBat < 1.6 && !(i === this.keeperF && d.shot && d.shot.contact !== 'clean')) return;
    let dive = false;
    if (dist > reach) {
      if (dist > diveReach || (f.state !== 'chase' && !isKeeperOnDelivery)) return;
      // dive only if the ball is going past
      const vToward = ((a.x - b.x) * this.ball.v.x + (a.z - b.z) * this.ball.v.z) / (dist || 1);
      if (vToward < 0.5 && Math.hypot(this.ball.v.x, this.ball.v.z) > 2) return;
      if (Math.hypot(this.ball.v.x, this.ball.v.z) <= 2) return; // slow ball: just run to it
      dive = true;
    }
    f.cooldown = 0.7;
    const speed = Math.hypot(this.ball.v.x, this.ball.v.y, this.ball.v.z);
    if (isKeeperOnDelivery) d.keeperDone = true;
    if (inAir) {
      let p = f.stats.catchSkill;
      if (speed > 24) p *= 0.86;
      if (speed > 32) p *= 0.85;
      if (dive) p *= 0.55;
      if (i === this.keeperF) p = Math.min(0.99, p * 1.06);
      if (b.y > 2.1) p *= 0.9;
      const tFlight = Math.hypot(b.x, b.z - BATTER_Z) / Math.max(5, speed);
      if (tFlight < 0.7 && (i !== this.keeperF || d.shot?.contact === 'clean')) p *= 0.35 + tFlight;
      const r = Math.hypot(b.x, b.z);
      if (r > this.boundaryAt(Math.atan2(b.x, b.z)) - 4) p *= 0.9;
      if (dive) this.startDive(f, b);
      else this.setAnim(a, 'catch');
      if (rand() < p) {
        if (d.noBall || d.freeHit) { this.gather(i, 'catch'); return; }
        this.gather(i, 'catch');
        this.listener.onSound('catch');
        if (this.debugLog) this.debugLog(`CATCH ${d.shot?.shot.name}/${d.shot?.timing} by f${i} ${f.posName} at (${a.x.toFixed(1)},${a.z.toFixed(1)}) ball=(${b.x.toFixed(1)},${b.y.toFixed(2)},${b.z.toFixed(1)}) v=(${this.ball.v.x.toFixed(1)},${this.ball.v.y.toFixed(1)},${this.ball.v.z.toFixed(1)}) exit=${JSON.stringify(d.shot?.exitV)} liveT=${d.liveT.toFixed(2)} bounces=${this.ball.bounces} rolling=${this.ball.rolling}`);
        const kind: DismissalKind = 'caught';
        d.meta.catchType = i === this.keeperF ? 'keeper' : i === this.bowlerF ? 'cab' : dive ? 'diving' : 'normal';
        this.wicket({ kind, batterId: d.strikerId, fielderId: f.playerId }, i === this.keeperF ? 'caughtBehind' : i === this.bowlerF ? 'caughtAndBowled' : 'caught');
        return;
      }
      d.meta.dropped = true;
      this.listener.onCommentary(this.commentary.line('dropped', { f: getPlayer(f.playerId).name, b: this.striker.name }), true);
      this.listener.onSound('groan');
      this.deflect(0.25);
      return;
    }
    // ground fielding / keeper taking delivery
    let p = isKeeperOnDelivery ? (isSpin(this.bowlerPlayer.bowlStyle) ? 0.965 : 0.985) * (0.97 + getPlayer(f.playerId).field / 3000) : f.stats.groundSkill;
    if (speed > 20) p *= 0.96;
    if (dive) { p *= 0.78; this.startDive(f, b); }
    if (rand() < p) { this.gather(i, dive ? 'dive' : 'pickup'); return; }
    if (!isKeeperOnDelivery) { d.meta.misfield = true; this.listener.onCommentary(this.commentary.line('misfield'), true); }
    this.deflect(0.35);
  }

  private startDive(f: Fielder, b: { x: number; z: number }) {
    const a = this.actors[f.a];
    f.state = 'dive'; f.stateT = 0;
    const side = Math.sign((b.x - a.x) * Math.cos(a.rotY) - (b.z - a.z) * Math.sin(a.rotY)) || 1;
    a.animSide = side;
    this.setAnim(a, 'dive', '', true);
    a.rotY = Math.atan2(b.x - a.x, b.z - a.z);
    const dx = b.x - a.x, dz = b.z - a.z;
    a.x += dx * 0.6; a.z += dz * 0.6;
  }

  private deflect(k: number) {
    const v = this.ball.v;
    this.d.touchedFielder = true;
    v.x = v.x * k + gauss() * 2; v.z = v.z * k + gauss() * 2; v.y = Math.abs(v.y) * 0.2 + 0.8;
    this.ball.rolling = false;
    this.replan();
  }

  private gather(i: number, how: 'catch' | 'pickup' | 'dive') {
    const f = this.fielders[i];
    this.holder = i;
    this.ballMode = 'held';
    this.d.touchedFielder = true;
    f.state = 'hold'; f.stateT = 0;
    const a = this.actors[f.a];
    a.holdsBall = true;
    if (how === 'pickup') this.setAnim(a, 'pickup');
    f.speedNow = 0;
    this.throwInfo = null;
    this.chaser = -1;
    this.fielders.forEach((o, k) => { if (k !== i && (o.state === 'chase' || o.state === 'backup')) o.state = 'return'; });
  }

  private tickHolder(h: number) {
    if (this.holder < 0 || this.ballMode !== 'held') return;
    const f = this.fielders[this.holder];
    const a = this.actors[f.a];
    // ball sits in hand
    this.ball.p.x = a.x + Math.sin(a.rotY) * 0.3; this.ball.p.y = 1.15; this.ball.p.z = a.z + Math.cos(a.rotY) * 0.3;
    if (f.state === 'breaking') {
      if (f.stateT > 0.22) { const E = a.z > 0 ? 1 : -1; this.breakWicket(E); this.runOutCheck(E, f.playerId, false); f.state = 'hold'; }
      f.stateT += h;
      return;
    }
    if (f.state === 'throwing') {
      f.stateT += h;
      if (f.stateT > 0.32 && this.pendingThrow) { this.launchThrow(this.pendingThrow); this.pendingThrow = null; }
      return;
    }
    if (f.state !== 'hold') return;
    if (f.stateT < (this.holder === this.keeperF || f.role === 'bowler' ? 0.12 : 0.42)) return;
    // at stumps?
    for (const E of [1, -1]) {
      const dS = Math.hypot(a.x, a.z - E * STUMPS_Z);
      if (dS < 2.5) {
        const resp = this.responsibleFor(E);
        if (resp && !this.inGround(resp, E) && !this.wicketDown(E)) {
          f.state = 'breaking'; f.stateT = 0; this.setAnim(a, 'breakStumps');
          this.d.stumpingCheck = this.holder === this.keeperF && !this.d.hitBat && !resp.running;
          return;
        }
        const other = this.responsibleFor(-E);
        if (other && other.running && !this.inGround(other, -E)) {
          const remain = Math.abs(-E * (CREASE_Z - BAT_REACH) - other.z);
          const rec = this.receiverFor(-E);
          if (remain > 3 && rec >= 0) this.prepareThrow(-E, false, rec);
        }
        return;
      }
    }
    // in the field: pick an end
    let best = 0, bestMargin = -1e9;
    for (const E of [1, -1]) {
      const r = this.responsibleFor(E);
      if (!r || this.inGround(r, E)) continue;
      const remain = Math.abs(E * (CREASE_Z - BAT_REACH) - r.z) / Math.max(4, r.maxSpeed);
      const dist = Math.hypot(a.x, a.z - E * STUMPS_Z);
      const tThrow = 0.35 + dist / f.stats.throwSpeed + 0.25;
      const m = remain - tThrow;
      if (m > bestMargin) { bestMargin = m; best = E; }
    }
    if (best === 0 && (this.holder === this.keeperF || this.holder === this.bowlerF)) return;
    if (best === 0) {
      // nobody in danger: return to keeper (or bowler if closer)
      const dk = Math.hypot(a.x, a.z - STUMPS_Z), db = Math.hypot(a.x, a.z + STUMPS_Z);
      best = dk <= db * 1.3 ? 1 : -1;
    }
    const dist = Math.hypot(a.x, a.z - best * STUMPS_Z);
    const rec = this.receiverFor(best);
    const recA = rec >= 0 ? this.actors[this.fielders[rec].a] : null;
    const recReady = recA ? Math.hypot(recA.x, recA.z - best * (STUMPS_Z + RECEIVER_OFFSET)) < 3 : false;
    const direct = bestMargin > -0.4 && bestMargin < 0.6 && dist < 32 && (chance(0.45) || !recReady);
    this.prepareThrow(best, direct, rec);
  }

  private pendingThrow: Throw | null = null;

  private prepareThrow(end: number, direct: boolean, receiver: number) {
    const f = this.fielders[this.holder];
    f.state = 'throwing'; f.stateT = 0;
    const a = this.actors[f.a];
    a.rotY = Math.atan2(-a.x, end * STUMPS_Z - a.z);
    this.setAnim(a, 'throw');
    this.pendingThrow = { from: this.holder, end, direct, receiver, t: 0 };
  }

  private launchThrow(th: Throw) {
    const f = this.fielders[th.from];
    const a = this.actors[f.a];
    a.holdsBall = false;
    const sx = a.x + Math.sin(a.rotY) * 0.4, sz = a.z + Math.cos(a.rotY) * 0.4;
    let tx = 0, ty = 0.45, tz = th.end * STUMPS_Z;
    if (th.direct) {
      const acc = 0.25 + getPlayer(f.playerId).field / 220 - Math.hypot(a.x, a.z - tz) / 120;
      if (rand() > acc) tx = (chance(0.5) ? 1 : -1) * randRange(0.2, 0.9);
    } else {
      tx = 0; ty = 1.0; tz = th.end * (STUMPS_Z + RECEIVER_OFFSET - 0.4);
    }
    const dist = Math.hypot(tx - sx, tz - sz);
    const T = Math.max(0.25, dist / f.stats.throwSpeed);
    this.ball.p = { x: sx, y: 1.8, z: sz };
    this.ball.v = { x: (tx - sx) / T, y: (ty - 1.8 + 0.5 * 9.81 * T * T) / T, z: (tz - sz) / T };
    this.ball.dragMul = 0; this.ball.bounces = 0; this.ball.rolling = false; this.ball.swingAcc = 0; this.ball.turnOnBounce = 0;
    this.ball.pitchE = 0.4; this.ball.pitchKeep = 0.75;
    this.ballMode = 'throw';
    this.throwInfo = { ...th, t: 0 };
    this.holder = -1;
    f.state = 'return'; f.cooldown = 0.8;
    this.listener.onSound('throw');
  }

  private onThrowHitsStumps(E: number) {
    this.breakWicket(E);
    const th = this.throwInfo!;
    const thrower = this.fielders[th.from].playerId;
    const out = this.runOutCheck(E, thrower, true);
    if (!out) {
      this.d.meta.directHit = true;
      this.ball.v.x *= 0.5; this.ball.v.z *= -0.3;
    }
  }

  /** while a throw is in flight, receivers try to take it, otherwise it's loose (overthrow) */
  private tickThrow() {
    const th = this.throwInfo;
    if (!th || this.ballMode !== 'throw') return;
    th.t += SIM_STEP;
    const b = this.ball.p;
    const rec = th.receiver;
    if (rec >= 0) {
      const ra = this.actors[this.fielders[rec].a];
      const dd = Math.hypot(b.x - ra.x, b.z - ra.z);
      if (dd < 1.3 && b.y < 2.4) {
        if (rand() < 0.97) {
          this.gather(rec, 'catch');
          this.setAnim(ra, 'catch');
          return;
        }
      }
    }
    // the throw has passed its target end -> loose ball
    const pastEnd = th.end > 0 ? b.z > STUMPS_Z + 3.5 : b.z < -STUMPS_Z - 3.5;
    if (pastEnd || this.ball.bounces > 1 || th.t > 4) {
      this.ballMode = 'flight';
      this.d.touchedFielder = true;
      this.throwInfo = null;
      if (this.runners.some((r) => r.running)) this.d.meta.overthrow = true;
      this.replan();
    }
  }

  // ---------------------------------------------------------------- running
  inGround(r: Runner, E: number) { return r.z * E >= CREASE_Z - BAT_REACH; }

  /** the batter whose ground the wicket at end E belongs to */
  private responsibleFor(E: number): Runner | null {
    const [a, b] = this.runners;
    const ra = a.running ? a.target : Math.sign(a.z) || a.end;
    const rb = b.running ? b.target : Math.sign(b.z) || b.end;
    if (ra === E && rb !== E) return a;
    if (rb === E && ra !== E) return b;
    // both heading same way (shouldn't happen) – closest to E
    return Math.abs(a.z - E * STUMPS_Z) < Math.abs(b.z - E * STUMPS_Z) ? a : b;
  }

  requestRun() {
    if (this.phase !== 'live') return;
    const anyRunning = this.runners.some((r) => r.running);
    if (!anyRunning) this.startRun();
    else this.runQueued = true;
  }

  cancelRun() {
    if (this.phase !== 'live') return;
    this.runQueued = false;
    for (const r of this.runners) {
      if (r.running && r.target !== r.runFrom && r.z * r.runFrom > 0) { r.target = r.runFrom; r.speedNow *= 0.3; }
    }
  }

  private startRun() {
    if (this.d.wicket) return;
    // striker that advanced down the track still counts as from striker end
    for (const r of this.runners) {
      r.runFrom = r.end;
      r.target = -r.end;
      r.running = true;
      r.turnWait = 0;
    }
  }

  private tickRunners(h: number) {
    for (const r of this.runners) {
      const a = this.actors[r.a];
      if (r.running) {
        if (r.turnWait > 0) { r.turnWait -= h; continue; }
        const goal = r.target * (CREASE_Z + 0.7);
        const dir = Math.sign(goal - r.z);
        r.speedNow = Math.min(r.maxSpeed, r.speedNow + 8 * h);
        r.z += dir * r.speedNow * h;
        const lane = r.target > 0 ? 0.8 : -0.8;
        r.x += (lane * this.offSign - r.x) * Math.min(1, h * 2);
        if ((dir > 0 && r.z >= goal) || (dir < 0 && r.z <= goal)) { r.z = goal; }
        a.rotY = dir > 0 ? 0 : Math.PI;
        this.setAnim(a, 'runBat');
        a.moveSpeed = r.speedNow;
      } else {
        r.speedNow = Math.max(0, r.speedNow - 10 * h);
        // advanced striker walks back
        if (r.end === 1 && r.z < BATTER_Z - 0.2 && this.phase === 'live' && this.d.liveT > 0.45) {
          r.z = Math.min(BATTER_Z, r.z + 3.2 * h);
          this.setAnim(a, 'walkBat'); a.rotY = 0; a.moveSpeed = 2;
        } else if (r.speedNow < 0.3 && a.anim !== 'swing' && a.anim !== 'celebrate' && a.anim !== 'batRaise' && a.anim !== 'dejected') this.setAnim(a, 'idle');
        else if (a.anim === 'swing' && a.animT > 1.2) this.setAnim(a, 'idle');
      }
      a.x = r.x; a.z = r.z;
    }
    // completed run?
    const [ra, rb] = this.runners;
    if (ra.running && rb.running && this.inGround(ra, ra.target) && this.inGround(rb, rb.target)) {
      const counted = ra.target !== ra.runFrom;
      if (counted) { this.runsDone++; this.listener.onState(this); }
      for (const r of this.runners) { r.end = r.target; }
      if (this.runQueued && counted) {
        this.runQueued = false;
        for (const r of this.runners) { r.runFrom = r.end; r.target = -r.end; r.speedNow = 0; r.turnWait = 0.25; }
      } else {
        for (const r of this.runners) r.running = false;
        this.runQueued = false;
      }
    }
  }

  /** remaining time for the slower batter to complete the current/next run */
  private timeToComplete(): number {
    let t = 0;
    for (const r of this.runners) {
      const target = r.running ? r.target : -r.end;
      const dist = Math.abs(target * (CREASE_Z - BAT_REACH) - r.z);
      const v = r.running ? Math.max(r.speedNow, 2) : 0;
      const tt = r.running ? dist / ((v + r.maxSpeed) / 2) : 0.35 + dist / (r.maxSpeed * 0.88);
      t = Math.max(t, tt);
    }
    return t;
  }

  /** time until the ball could reach the end the danger batter is running to */
  private ballToEndTime(E: number): number {
    const b = this.ball.p;
    let tCollect = 0, cx = b.x, cz = b.z, ts = 24;
    if (this.ballMode === 'held' && this.holder >= 0) {
      const a = this.actors[this.fielders[this.holder].a]; cx = a.x; cz = a.z; ts = this.fielders[this.holder].stats.throwSpeed;
      tCollect = 0.3;
    } else if (this.ballMode === 'throw') {
      return Math.hypot(b.x, b.z - E * STUMPS_Z) / 25;
    } else if (this.predictedCollect) {
      if (this.predictedCollect.boundary) return 99;
      tCollect = Math.max(0, this.predictedCollect.t - this.t) + 0.5;
      cx = this.predictedCollect.x; cz = this.predictedCollect.z;
      if (this.chaser >= 0) ts = this.fielders[this.chaser].stats.throwSpeed;
    }
    return tCollect + 0.35 + Math.hypot(cx, cz - E * STUMPS_Z) / ts + 0.2;
  }

  private computeRunHint() {
    if (!this.userBatting) { this.runHint = ''; return; }
    const tc = this.timeToComplete();
    const tb = Math.min(this.ballToEndTime(1), this.ballToEndTime(-1));
    const m = tb - tc;
    const hint = m > 1.0 ? 'safe' : m > 0.2 ? 'risky' : 'danger';
    if (hint !== this.runHint) { this.runHint = hint; this.listener.onState(this); }
  }

  private aiRunDecisionT = 0;

  private aiRunning() {
    if (this.userBatting) return;
    const d = this.d;
    if (d.wicket || d.lbwT >= 0) return;
    this.aiRunDecisionT -= SIM_STEP;
    if (this.aiRunDecisionT > 0) return;
    this.aiRunDecisionT = 0.15;
    if (this.predictedCollect?.boundary && this.ballMode === 'flight') { if (!this.runners.some((r) => r.running) && d.liveT > 0.5 && d.liveT < 1.5) this.startRun(); return; }
    const running = this.runners.some((r) => r.running);
    const sit = this.situation();
    const thr = aiRunThreshold(this.striker, sit) + gauss() * (this.difficulty === 'pro' ? 0.06 : this.difficulty === 'easy' ? 0.25 : 0.14);
    if (!running) {
      if (d.liveT < 0.25 || d.liveT > 6) return;
      if (!d.hitBat && !d.hitPad && this.ballMode === 'held') return; // keeper has it
      const tc = this.timeToComplete();
      const E = -this.runners[0].end;
      const tb = Math.min(this.ballToEndTime(E), this.ballToEndTime(-E));
      if (tb - tc > thr) {
        if (this.debugLog) this.debugLog(`AIRUN liveT=${d.liveT.toFixed(2)} tb=${tb.toFixed(2)} tc=${tc.toFixed(2)} thr=${thr.toFixed(2)} mode=${this.ballMode} holder=${this.holder} pc=${this.predictedCollect ? (this.predictedCollect.t - this.t).toFixed(2) + (this.predictedCollect.boundary ? 'B' : '') : '-'} chaser=${this.chaser}`);
        this.startRun();
      }
    } else if (!this.runQueued) {
      // decide on another run when the current one is nearly complete
      const near = this.runners.every((r) => Math.abs(r.target * CREASE_Z - r.z) < 4.5);
      if (!near) return;
      const tNext = this.timeToComplete() + 17.7 / 6.5 + 0.3;
      const E = this.runners[0].target * -1;
      const tb = Math.min(this.ballToEndTime(E), this.ballToEndTime(-E));
      if (tb - tNext > thr + 0.4) this.runQueued = true;
    }
  }

  private runOutCheck(E: number, fielderId: string, direct: boolean): boolean {
    const r = this.responsibleFor(E);
    if (!r || this.inGround(r, E)) {
      if (direct) this.listener.onCommentary(this.commentary.line('directHit'), true);
      return false;
    }
    if (this.d.wicket) return false;
    const stumpCase = this.d.stumpingCheck && r.playerId === this.d.strikerId && !r.running;
    if (stumpCase && (this.d.noBall || this.d.freeHit)) return false;
    if (!stumpCase && !r.running && this.d.noBall) return false;
    const stumped = stumpCase;
    this.d.meta.directHit = direct;
    this.wicket({ kind: stumped ? 'stumped' : 'runout', batterId: r.playerId, fielderId }, stumped ? 'stumped' : 'runout');
    return true;
  }

  // ---------------------------------------------------------------- outcomes
  private onBoundary() {
    const d = this.d;
    if (d.wicket || this.phase === 'dead') return;
    const six = d.hitBat && !d.bouncedSinceHit && !d.touchedFielder && this.ballMode === 'flight' && this.ball.bounces === 0;
    d.boundary = six ? 6 : 4;
    this.ballMode = 'dead';
    d.important = six ? 3 : 2;
    this.deadBall();
  }

  debugLog: ((s: string) => void) | null = null;

  private wicket(w: WicketInfo, cat: string) {
    const d = this.d;
    if (d.wicket) return; // never two wickets on one ball
    if (this.debugLog) {
      const rs = this.runners.map((r) => `${r.playerId}:z=${r.z.toFixed(2)} end=${r.end} tgt=${r.target} run=${r.running} from=${r.runFrom}`).join(' | ');
      this.debugLog(`${w.kind} bat=${w.batterId} liveT=${d.liveT.toFixed(2)} shot=${d.shot?.shot.name} v=${JSON.stringify(d.shot?.exitV && Object.fromEntries(Object.entries(d.shot.exitV).map(([k, v]) => [k, +v.toFixed(1)])))} ball=(${this.ball.p.x.toFixed(1)},${this.ball.p.y.toFixed(2)},${this.ball.p.z.toFixed(1)}) bsh=${d.bouncedSinceHit} broken=${d.wicketBroken} runs=${this.runsDone} q=${this.runQueued} || ${rs}`);
    }
    d.wicket = w;
    d.important = 4;
    this.wicketCat = cat;
    this.listener.onSound('bigCheer');
    if (w.kind !== 'lbw') this.setAnim(this.actors[this.umpires[0]], 'signalOut');
    this.deadBall();
  }

  wicketCat = '';

  private deadBall() {
    if (this.phase === 'dead') return;
    const d = this.d;
    if (this.ballMode === 'flight' || this.ballMode === 'throw') this.ballMode = d.boundary ? 'dead' : this.ballMode;
    this.composeOutcome();
    this.setPhase('dead');
  }

  private outcome: DeliveryOutcome | null = null;

  private composeOutcome() {
    const d = this.d;
    const runs = d.boundary || d.wicket?.kind === 'caught' ? 0 : this.runsDone;
    const off = d.boundary || runs;
    let batRuns = 0, byes = 0, legByes = 0, wideRuns = 0;
    if (d.wide) wideRuns = off;
    else if (d.hitBat) batRuns = off;
    else if (d.hitPad) legByes = off;
    else byes = off;
    // final ends
    const [a, b] = this.runners;
    const endOf = (r: Runner) => {
      if (d.boundary) return r.playerId === d.strikerId ? 1 : -1; // batters back to their original ends
      if (r.running) return r.target !== r.runFrom && r.z * r.target > 0 ? r.target : r.runFrom;
      return r.end;
    };
    let ea = endOf(a), eb = endOf(b);
    if (ea === eb) eb = -ea;
    let atPlus: string | null = ea === 1 ? a.playerId : b.playerId;
    let atMinus: string | null = ea === 1 ? b.playerId : a.playerId;
    if (d.wicket) {
      const w = d.wicket;
      if (w.kind === 'runout') {
        // run-out at end E: dismissed batter's end becomes vacant, survivor goes to the other end
        const E = d.wicketBroken || 1;
        const survivor = w.batterId === a.playerId ? b : a;
        atPlus = E === 1 ? null : survivor.playerId;
        atMinus = E === 1 ? survivor.playerId : null;
      } else if (w.kind === 'caught') {
        const survivor = w.batterId === a.playerId ? b : a;
        atPlus = null; atMinus = survivor.playerId; // new batter on strike
      } else {
        atPlus = null; atMinus = d.nonStrikerId;
      }
    }
    const meta = d.meta;
    this.outcome = {
      id: d.id, bowlerId: d.bowlerId, strikerId: d.strikerId, nonStrikerId: d.nonStrikerId,
      extraType: d.wide ? 'wide' : d.noBall ? 'noball' : 'none',
      batRuns, byes, legByes, wideRuns, boundary: (d.boundary && d.hitBat ? d.boundary : d.boundary ? 4 : 0) as 0 | 4 | 6, runsRun: runs,
      wicket: d.wicket, atStrikerEnd: atPlus, atOtherEnd: atMinus, freeHit: d.freeHit, meta,
    };
    this.presentOutcome(this.outcome);
    if (d.important >= 2 || (d.meta.beaten && d.plan && d.plan.quality > 0.7) || d.meta.dropped) {
      this.replay.keep(this, d.important);
      this.listener.onReplayAvailable(true);
    }
  }

  private presentOutcome(o: DeliveryOutcome) {
    const d = this.d;
    const vars = { b: getPlayer(o.strikerId).name, bw: getPlayer(o.bowlerId).name, f: o.wicket?.fielderId ? getPlayer(o.wicket.fielderId).name : '', shot: (d.meta.shotName ?? 'shot').toLowerCase(), r: o.runsRun };
    let line = '';
    const u = this.actors[this.umpires[0]];
    if (o.wicket) {
      line = this.commentary.line(this.wicketCat, vars);
      const dismissed = getPlayer(o.wicket.batterId);
      const card = this.inn.batters[o.wicket.batterId];
      const how = { bowled: 'BOWLED', caught: 'CAUGHT', lbw: 'LBW', runout: 'RUN OUT', stumped: 'STUMPED', hitwicket: 'HIT WICKET' }[o.wicket.kind];
      this.listener.onNotify('WICKET!', 'wicket', `${how} — ${dismissed.name} ${card.runs + (o.wicket.batterId === o.strikerId ? o.batRuns : 0)} (${card.balls + (o.wicket.batterId === o.strikerId && o.extraType !== 'wide' ? 1 : 0)})`);
      for (const f of this.fielders) { const a = this.actors[f.a]; f.state = 'celebrate'; this.setAnim(a, 'celebrate'); }
      const ra = this.actors[this.runnerFor(o.wicket.batterId).a];
      this.setAnim(ra, 'dejected');
    } else if (d.boundary === 6 && d.hitBat) {
      line = this.commentary.line('six', vars);
      this.listener.onNotify('SIX!', 'six');
      this.listener.onSound('bigCheer');
      this.setAnim(u, 'signalSix');
      this.setAnim(this.actors[this.runnerFor(o.strikerId).a], 'batRaise');
    } else if (d.boundary === 4) {
      line = d.hitBat ? this.commentary.line('four', vars) : `${this.commentary.line(d.hitPad ? 'legbyes' : 'byes')} Four of them!`;
      this.listener.onNotify('FOUR!', 'four', d.hitBat ? '' : d.hitPad ? 'Leg byes' : 'Byes');
      this.listener.onSound('cheer');
      this.setAnim(u, 'signalFour');
    } else if (d.wide) {
      line = this.commentary.line('wide');
      this.listener.onNotify('WIDE', 'extra', o.wideRuns ? `+${o.wideRuns} run${o.wideRuns > 1 ? 's' : ''}` : '');
      this.setAnim(u, 'signalWide');
    } else {
      const r = o.runsRun;
      if (d.noBall) this.setAnim(u, 'signalNoBall');
      if (r === 0) {
        if (d.meta.appealDenied) line = this.commentary.line('lbwNotOut');
        else if (d.meta.beaten) line = this.commentary.line('beaten', vars);
        else if (d.meta.leave) line = this.commentary.line(d.plan && d.plan.type === 'bouncer' ? 'bouncer' : 'leave', vars);
        else if (d.meta.defended) line = this.commentary.line('defend', vars);
        else if (d.plan?.type === 'yorker' && d.plan.lengthName === 'yorker') line = this.commentary.line('yorker', vars);
        else line = this.commentary.line('dot', vars);
      } else if (!d.hitBat) line = this.commentary.line(d.hitPad ? 'legbyes' : 'byes');
      else if (d.meta.edged) line = this.commentary.line('edgeSafe') + ` ${r} run${r > 1 ? 's' : ''}.`;
      else line = this.commentary.line(r === 1 ? 'single' : r === 2 ? 'two' : 'three', vars);
      if (d.meta.overthrow) line += ' ' + this.commentary.line('overthrow');
    }
    if (d.noBall && !o.wicket) line = this.commentary.line('noball') + ' ' + line;
    if (line) this.listener.onCommentary(line, true);
  }

  private tickDead(h: number) {
    const d = this.d;
    d.deadT += h;
    if (this.ballMode === 'held' && this.holder >= 0) {
      const a = this.actors[this.fielders[this.holder].a];
      this.ball.p.x = a.x + Math.sin(a.rotY) * 0.3; this.ball.p.y = 1.15; this.ball.p.z = a.z + Math.cos(a.rotY) * 0.3;
    } else if (this.ballMode === 'flight' || this.ballMode === 'dead') {
      // keep the ball rolling visually after the boundary
      if (this.ball.p.y > -5) stepBall(this.ball, h);
      const r = Math.hypot(this.ball.p.x, this.ball.p.z);
      if (r > this.boundaryAt(Math.atan2(this.ball.p.x, this.ball.p.z)) + 6) { this.ball.v.x = 0; this.ball.v.z = 0; }
    }
    for (const r of this.runners) {
      const a = this.actors[r.a];
      if (r.running) { r.speedNow = Math.max(0, r.speedNow - 8 * h); r.z += (r.target > 0 ? 1 : -1) * r.speedNow * h; a.z = r.z; if (r.speedNow < 0.3) { r.running = false; } }
    }
    const minT = this.autoplay ? 0.3 : d.wicket ? 3.4 : d.boundary ? 3.0 : 2.0;
    if (d.deadT > minT || this.phaseT > 90) this.afterDead();
  }

  private afterDead() {
    if (!this.outcome) return;
    const o = this.outcome;
    this.outcome = null;
    const res = this.match.record(o);
    this.lastResult = res;
    this.listener.onState(this);
    if (res.milestone) this.listener.onNotify(res.milestone.split(' for ')[0], 'milestone', res.milestone);
    if (res.overComplete && !res.inningsComplete) {
      const bc = this.inn.bowlers[o.bowlerId];
      this.listener.onNotify('OVER COMPLETE', 'over', `${getPlayer(o.bowlerId).name}  ${oversText(bc.balls)}-${bc.maidens}-${bc.runs}-${bc.wickets}`);
      if (res.maiden) this.listener.onCommentary(this.commentary.line('maiden', { bw: getPlayer(o.bowlerId).name }));
    }
    if (res.matchComplete) {
      this.listener.onNotify(this.match.result!.text.toUpperCase(), 'result');
      this.setPhase('matchOver');
      return;
    }
    if (res.inningsComplete) {
      this.listener.onNotify('INNINGS COMPLETE', 'innings', `${TEAM_MAP[this.inn.battingTeamId].name} ${this.inn.runs}/${this.inn.wickets} (${oversText(this.inn.legalBalls)})`);
      this.setPhase('inningsBreak');
      return;
    }
    if (res.wicketFell && res.newBatterId) {
      // reuse dismissed batter's runner slot for the incoming batter
      const dismissedId = o.wicket!.batterId;
      const slot = this.runnerFor(dismissedId);
      const dep = this.actors[this.departing];
      const sa = this.actors[slot.a];
      dep.x = sa.x; dep.z = sa.z; dep.visible = true; dep.playerId = dismissedId; dep.mirror = sa.mirror;
      slot.playerId = res.newBatterId;
      sa.playerId = res.newBatterId;
      const np = getPlayer(res.newBatterId);
      slot.maxSpeed = 6 + (np.speed / 100) * 1.8;
      sa.mirror = np.battingHand === 'R' ? 1 : -1;
      this.walkInIds = [res.newBatterId];
      this.pendingOver = res.overComplete;
      this.actorsVersion++;
      this.listener.onCommentary(`${np.name} walks out to the middle.`);
      this.setPhase('walkIn');
      return;
    }
    if (res.overComplete) { this.startNewOver(); return; }
    this.placeEveryone(false);
    this.newDeliveryState();
    this.setPhase('ready');
  }

  // ---------------------------------------------------------------- delivery phase specifics
  private tickDelivery(h: number) {
    const d = this.d;
    if (this.phase !== 'delivery') return;
    const now = this.t - d.releaseT;
    if (d.ai && !d.shot && now >= d.ai.input.pressTime) this.playShot(d.ai.input, false);
    if (d.pending) this.commitPending();
    // safety: ball stopped short of the batter
    if (now > 3) this.toLive();
  }

  // ---------------------------------------------------------------- actors
  setAnim(a: Actor, anim: AnimId, p = '', restart = false) {
    if (a.anim !== anim || restart) { a.anim = anim; a.animT = 0; }
    if (p) a.animP = p;
  }

  private tickActors(h: number) {
    for (const a of this.actors) a.animT += h;
    if (this.bails.striker > 0) this.bails.striker += h;
    if (this.bails.other > 0) this.bails.other += h;
    if (this.phase === 'live') this.tickThrow();
    const ph = this.phase;
    // batters: stance pose before/at delivery
    if (ph === 'ready' || ph === 'runUp' || ph === 'delivery') {
      const s = this.runnerFor(this.inn.strikerId), n = this.runnerFor(this.inn.nonStrikerId);
      if (s && n) {
        const sa = this.actors[s.a], na = this.actors[n.a];
        sa.rotY = this.offSign > 0 ? Math.PI / 2 : -Math.PI / 2;
        if (sa.anim !== 'swing') this.setAnim(sa, 'stance');
        if (this.d.shot?.advance && ph === 'delivery') { s.z = Math.max(7.6, s.z - h * 4.5); sa.z = s.z; }
        na.rotY = 0;
        if (ph === 'runUp' && this.phaseT > this.runUpDur * 0.5) {
          n.z = Math.min(-STUMPS_Z + 1.4, n.z + h * 1.2); na.z = n.z; this.setAnim(na, 'walkBat'); na.moveSpeed = 1.2;
        } else if (ph !== 'delivery') this.setAnim(na, 'idle');
        else this.setAnim(na, 'idle');
      }
    }
    if (ph === 'ready' || ph === 'selectBowler') {
      for (let i = 0; i < this.fielders.length; i++) {
        const f = this.fielders[i];
        const a = this.actors[f.a];
        a.holdsBall = i === this.bowlerF;
        let tx = f.homeX, tz = f.homeZ;
        const far = Math.hypot(a.x - tx, a.z - tz);
        const dist = this.moveActorToward(f, tx, tz, h, i === this.bowlerF ? (far > 8 ? 7 : 4) : far > 6 ? 7.5 : 4, false);
        if (dist < 0.3) a.rotY = i === this.bowlerF ? 0 : Math.atan2(-a.x, BATTER_Z - a.z);
        if (f.speedNow > 3.5) this.setAnim(a, 'run'); else if (f.speedNow > 0.4) this.setAnim(a, 'walk');
        else this.setAnim(a, i === this.keeperF ? 'keeper' : 'idle');
      }
      const ba = this.actors[this.fielders[this.bowlerF].a];
      this.ball.p = { x: ba.x + 0.25, y: 1.1, z: ba.z + 0.2 };
    }
    if (ph === 'runUp' || (ph === 'delivery' && this.d.liveT === 0)) {
      for (let i = 0; i < this.fielders.length; i++) {
        if (i === this.bowlerF) continue;
        const f = this.fielders[i];
        const a = this.actors[f.a];
        if (i === this.keeperF) { this.setAnim(a, 'keeper'); a.rotY = Math.PI; continue; }
        // walk in with the bowler
        if (ph === 'runUp' && this.phaseT > this.runUpDur * 0.4 && f.homeZ < 60) {
          const dx = -a.x, dz = BATTER_Z - a.z, dl = Math.hypot(dx, dz);
          if (dl > 6) { a.x += (dx / dl) * 1.1 * h; a.z += (dz / dl) * 1.1 * h; this.setAnim(a, 'walk'); a.moveSpeed = 1.1; }
        } else this.setAnim(a, 'ready');
        a.rotY = Math.atan2(-a.x, BATTER_Z - a.z);
      }
      if (ph === 'runUp') {
        const ba = this.actors[this.fielders[this.bowlerF].a];
        a_hand(this.ball, ba);
      }
    }
    if (ph === 'delivery') {
      const b = this.fielders[this.bowlerF];
      const a = this.actors[b.a];
      a.holdsBall = false;
      a.z = Math.min(-5, a.z + h * 2.5);
      for (const f of this.fielders) if (f !== b) this.actors[f.a].holdsBall = false;
      for (let i = 0; i < this.fielders.length; i++) {
        if (i === this.bowlerF) continue;
        const f = this.fielders[i];
        const fa = this.actors[f.a];
        if (i === this.keeperF) {
          this.setAnim(fa, 'keeper'); fa.rotY = Math.PI;
          // keeper shuffles to line
          const tx = clamp(this.ball.p.x * 1.1, -2.2, 2.2);
          fa.x += clamp(tx - fa.x, -4 * h, 4 * h);
          continue;
        }
        this.setAnim(fa, 'ready');
        fa.rotY = Math.atan2(-fa.x, BATTER_Z - fa.z);
      }
      // keeper collection of a delivery that passes the batter is handled in live
    }
    // umpire idle return
    for (const u of this.umpires) {
      const a = this.actors[u];
      if (a.anim !== 'umpire' && a.animT > 2.6) this.setAnim(a, 'umpire');
    }
    // celebrate end
    if (ph === 'dead' && this.d.wicket) {
      const dismissed = this.runnerFor(this.d.wicket.batterId);
      if (dismissed) {
        const a = this.actors[dismissed.a];
        if (a.animT > 1.2) {
          const ang = this.pavilionAngle();
          const tx = Math.sin(ang) * 70, tz = Math.cos(ang) * 70;
          const dx = tx - a.x, dz = tz - a.z, dl = Math.hypot(dx, dz);
          a.x += (dx / dl) * 1.6 * h; a.z += (dz / dl) * 1.6 * h; a.rotY = Math.atan2(dx, dz);
          this.setAnim(a, 'walkBat'); a.moveSpeed = 1.6;
          dismissed.x = a.x; dismissed.z = a.z;
        }
      }
    }
  }

  // ---------------------------------------------------------------- queries for UI/camera
  get userRole(): 'bat' | 'bowl' | 'watch' { return this.autoplay ? 'watch' : this.match.userBatting ? 'bat' : 'bowl'; }

  deliveryOptionsForUser() { return deliveryOptions(this.bowlerPlayer.bowlStyle).map((t) => ({ id: t, name: deliveryLabel(this.bowlerPlayer.bowlStyle, t) })); }

  replayFrameOrLive(): ReplayFrame | null { return this.replay.active ? this.replay.frame() : null; }
}

function a_hand(ball: BallState, a: Actor) {
  ball.p.x = a.x + Math.cos(a.rotY) * -0.25; ball.p.y = 1.2; ball.p.z = a.z + 0.15;
}
