import type { BatterCard, BowlerCard, DeliveryOutcome, FieldingCard, MatchConfig, Player } from './types';
import { battingOrder, canBowl, getPlayer, isSpin, TEAM_MAP } from '../data/teams';
import { rand } from '../utils/random';

export interface InningsState {
  index: number;
  battingTeamId: string;
  bowlingTeamId: string;
  battingXI: string[];
  bowlingXI: string[];
  order: string[];
  runs: number;
  wickets: number;
  legalBalls: number;
  extras: { wd: number; nb: number; b: number; lb: number };
  batters: Record<string, BatterCard>;
  bowlers: Record<string, BowlerCard>;
  bowlerOrder: string[];
  fielding: Record<string, FieldingCard>;
  strikerId: string;
  nonStrikerId: string;
  nextBatIdx: number;
  currentBowlerId: string;
  prevBowlerId: string | null;
  thisOver: string[];
  overRunsBowler: number;
  recent: string[];
  fallOfWickets: { runs: number; wickets: number; batterId: string; over: string }[];
  partnershipRuns: number;
  partnershipBalls: number;
  complete: boolean;
  target: number | null;
  freeHitNext: boolean;
  history: DeliveryOutcome[];
}

export interface RecordResult {
  overComplete: boolean;
  inningsComplete: boolean;
  matchComplete: boolean;
  wicketFell: boolean;
  newBatterId: string | null;
  milestone: string | null;
  maiden: boolean;
  totalAdded: number;
}

export interface MatchResult {
  winnerTeamId: string | null;
  text: string;
  margin: string;
  playerOfMatch: string;
  pomLine: string;
}

export const oversText = (balls: number) => `${Math.floor(balls / 6)}.${balls % 6}`;

export class MatchManager {
  config: MatchConfig;
  innings: InningsState[] = [];
  current = 0;
  result: MatchResult | null = null;
  maxBowlerOvers: number;
  private recordedIds = new Set<number>();

  constructor(config: MatchConfig) {
    this.config = config;
    this.maxBowlerOvers = Math.max(1, Math.ceil(config.overs / 5));
    const userBat = config.userBatsFirst;
    const first = userBat ? config.userTeamId : config.aiTeamId;
    const second = userBat ? config.aiTeamId : config.userTeamId;
    this.innings.push(this.makeInnings(0, first, second, null));
    this.innings.push(this.makeInnings(1, second, first, null));
  }

  xiOf(teamId: string) {
    return teamId === this.config.userTeamId ? this.config.userXI : this.config.aiXI;
  }

  private makeInnings(index: number, bat: string, bowl: string, target: number | null): InningsState {
    const battingXI = this.xiOf(bat);
    const order = battingOrder(battingXI);
    const batters: Record<string, BatterCard> = {};
    for (const id of order) batters[id] = { playerId: id, runs: 0, balls: 0, fours: 0, sixes: 0, out: false, howOut: 'did not bat', batted: false };
    const fielding: Record<string, FieldingCard> = {};
    for (const id of this.xiOf(bowl)) fielding[id] = { catches: 0, runouts: 0, stumpings: 0 };
    batters[order[0]].batted = true; batters[order[0]].howOut = 'not out';
    batters[order[1]].batted = true; batters[order[1]].howOut = 'not out';
    return {
      index, battingTeamId: bat, bowlingTeamId: bowl, battingXI, bowlingXI: this.xiOf(bowl), order,
      runs: 0, wickets: 0, legalBalls: 0, extras: { wd: 0, nb: 0, b: 0, lb: 0 },
      batters, bowlers: {}, bowlerOrder: [], fielding,
      strikerId: order[0], nonStrikerId: order[1], nextBatIdx: 2,
      currentBowlerId: '', prevBowlerId: null, thisOver: [], overRunsBowler: 0, recent: [],
      fallOfWickets: [], partnershipRuns: 0, partnershipBalls: 0,
      complete: false, target, freeHitNext: false, history: [],
    };
  }

  get inn() { return this.innings[this.current]; }
  get isChase() { return this.current === 1; }
  get totalBalls() { return this.config.overs * 6; }
  get ballsLeft() { return this.totalBalls - this.inn.legalBalls; }
  get userBatting() { return this.inn.battingTeamId === this.config.userTeamId; }

  requiredRunRate(): number | null {
    const inn = this.inn;
    if (inn.target === null) return null;
    const need = inn.target - inn.runs;
    const left = this.ballsLeft;
    if (left <= 0) return null;
    return (need / left) * 6;
  }

  runRate(inn = this.inn) {
    return inn.legalBalls > 0 ? (inn.runs / inn.legalBalls) * 6 : 0;
  }

  /** Eligible bowlers for the next over. */
  eligibleBowlers(): string[] {
    const inn = this.inn;
    return inn.bowlingXI.filter((id) => {
      const p = getPlayer(id);
      if (!canBowl(p)) return false;
      if (id === inn.prevBowlerId) return false;
      const card = inn.bowlers[id];
      return !card || Math.floor(card.balls / 6) < this.maxBowlerOvers;
    });
  }

  /** AI captain choice of bowler. */
  chooseBowlerAI(): string {
    const inn = this.inn;
    let options = this.eligibleBowlers();
    if (options.length === 0) options = inn.bowlingXI.filter((id) => id !== inn.prevBowlerId);
    const over = Math.floor(inn.legalBalls / 6);
    const phase = over / Math.max(1, this.config.overs);
    let best = options[0], bestScore = -1e9;
    for (const id of options) {
      const p = getPlayer(id);
      const card = inn.bowlers[id];
      const bowled = card ? Math.floor(card.balls / 6) : 0;
      let score = p.bowl - bowled * 2.5 + rand() * 6;
      const spin = isSpin(p.bowlStyle);
      if (phase < 0.3 && !spin) score += 6;
      if (phase > 0.3 && phase < 0.75 && spin) score += 7;
      if (phase >= 0.75 && !spin) score += 5;
      if (card && card.balls > 0) score += (card.wickets * 2 - (card.runs / Math.max(1, card.balls)) * 6 + 8) * 0.6;
      // keep enough overs available for the remaining bowlers
      if (score > bestScore) { bestScore = score; best = id; }
    }
    return best;
  }

  setBowler(id: string) {
    const inn = this.inn;
    inn.currentBowlerId = id;
    if (!inn.bowlers[id]) {
      inn.bowlers[id] = { playerId: id, balls: 0, runs: 0, wickets: 0, maidens: 0, wides: 0, noballs: 0 };
      inn.bowlerOrder.push(id);
    }
    inn.overRunsBowler = 0;
    inn.thisOver = [];
  }

  record(o: DeliveryOutcome): RecordResult {
    const inn = this.inn;
    const res: RecordResult = { overComplete: false, inningsComplete: false, matchComplete: false, wicketFell: false, newBatterId: null, milestone: null, maiden: false, totalAdded: 0 };
    if (inn.complete || this.recordedIds.has(o.id)) return res; // duplicate-guard
    this.recordedIds.add(o.id);
    inn.history.push(o);

    const bowler = inn.bowlers[o.bowlerId];
    const striker = inn.batters[o.strikerId];
    const legal = o.extraType === 'none';
    const wideTotal = o.extraType === 'wide' ? 1 + o.wideRuns : 0;
    const nb = o.extraType === 'noball' ? 1 : 0;
    const total = o.batRuns + o.byes + o.legByes + wideTotal + nb;
    res.totalAdded = total;
    inn.runs += total;
    inn.extras.wd += wideTotal;
    inn.extras.nb += nb;
    inn.extras.b += o.byes;
    inn.extras.lb += o.legByes;
    inn.partnershipRuns += total;

    const before = striker.runs;
    striker.runs += o.batRuns;
    if (o.extraType !== 'wide') { striker.balls += 1; inn.partnershipBalls += 1; }
    if (o.boundary === 4 && o.batRuns === 4) striker.fours++;
    if (o.boundary === 6 && o.batRuns === 6) striker.sixes++;
    if (before < 50 && striker.runs >= 50 && striker.runs < 100) res.milestone = `FIFTY for ${getPlayer(striker.playerId).name}!`;
    if (before < 100 && striker.runs >= 100) res.milestone = `HUNDRED for ${getPlayer(striker.playerId).name}!`;

    const conceded = o.batRuns + wideTotal + nb;
    bowler.runs += conceded;
    inn.overRunsBowler += conceded;
    if (o.extraType === 'wide') bowler.wides += wideTotal;
    if (nb) bowler.noballs += 1;

    // ball symbol
    let sym: string;
    if (o.wicket) sym = 'W';
    else if (o.extraType === 'wide') sym = wideTotal > 1 ? `${wideTotal}wd` : 'wd';
    else if (o.extraType === 'noball') sym = total > 1 ? `${total}nb` : 'nb';
    else if (o.byes) sym = `${o.byes}b`;
    else if (o.legByes) sym = `${o.legByes}lb`;
    else sym = o.batRuns === 0 ? '•' : String(o.batRuns);
    inn.thisOver.push(sym);
    inn.recent.push(sym);
    if (inn.recent.length > 12) inn.recent.shift();

    // positions after the play
    let plusEnd = o.atStrikerEnd;
    let minusEnd = o.atOtherEnd;

    if (o.wicket) {
      res.wicketFell = true;
      const w = o.wicket;
      inn.wickets += 1;
      const card = inn.batters[w.batterId];
      card.out = true;
      card.howOut = this.howOutText(o);
      const credited = w.kind !== 'runout';
      if (credited) bowler.wickets += 1;
      if (w.fielderId && inn.fielding[w.fielderId]) {
        if (w.kind === 'caught') inn.fielding[w.fielderId].catches++;
        if (w.kind === 'runout') inn.fielding[w.fielderId].runouts++;
        if (w.kind === 'stumped') inn.fielding[w.fielderId].stumpings++;
      }
      inn.fallOfWickets.push({ runs: inn.runs, wickets: inn.wickets, batterId: w.batterId, over: oversText(inn.legalBalls + (legal ? 1 : 0)) });
      inn.partnershipRuns = 0; inn.partnershipBalls = 0;
      if (plusEnd === w.batterId) plusEnd = null;
      if (minusEnd === w.batterId) minusEnd = null;
    }

    if (legal) {
      inn.legalBalls += 1;
      bowler.balls += 1;
    }
    inn.freeHitNext = o.extraType === 'noball';

    // bring in new batter
    const maxWickets = inn.order.length - 1;
    if (o.wicket && inn.wickets < maxWickets && inn.nextBatIdx < inn.order.length) {
      const nb2 = inn.order[inn.nextBatIdx++];
      inn.batters[nb2].batted = true;
      inn.batters[nb2].howOut = 'not out';
      res.newBatterId = nb2;
      if (plusEnd === null) plusEnd = nb2; else minusEnd = nb2;
    }
    if (plusEnd) inn.strikerId = plusEnd;
    if (minusEnd) inn.nonStrikerId = minusEnd;

    // over completion
    if (legal && inn.legalBalls % 6 === 0) {
      res.overComplete = true;
      if (inn.overRunsBowler === 0) { bowler.maidens += 1; res.maiden = true; }
      const t = inn.strikerId; inn.strikerId = inn.nonStrikerId; inn.nonStrikerId = t;
      inn.prevBowlerId = inn.currentBowlerId;
    }

    // innings completion
    const allOut = inn.wickets >= maxWickets;
    const oversDone = inn.legalBalls >= this.totalBalls;
    const chased = inn.target !== null && inn.runs >= inn.target;
    if (allOut || oversDone || chased) {
      inn.complete = true;
      res.inningsComplete = true;
      if (this.current === 1) { res.matchComplete = true; this.finishMatch(); }
    }
    return res;
  }

  howOutText(o: DeliveryOutcome): string {
    const w = o.wicket!;
    const bowler = getPlayer(o.bowlerId).short;
    const f = w.fielderId ? getPlayer(w.fielderId).short : '';
    switch (w.kind) {
      case 'bowled': return `b ${bowler}`;
      case 'lbw': return `lbw b ${bowler}`;
      case 'caught': return w.fielderId === o.bowlerId ? `c & b ${bowler}` : `c ${f} b ${bowler}`;
      case 'stumped': return `st ${f} b ${bowler}`;
      case 'hitwicket': return `hit wicket b ${bowler}`;
      case 'runout': return `run out (${f})`;
    }
  }

  startSecondInnings() {
    const first = this.innings[0];
    this.current = 1;
    this.innings[1].target = first.runs + 1;
  }

  private finishMatch() {
    const a = this.innings[0], b = this.innings[1];
    const ta = TEAM_MAP[a.battingTeamId], tb = TEAM_MAP[b.battingTeamId];
    let winner: string | null = null, text = '', margin = '';
    if (b.runs > a.runs) {
      winner = tb.id;
      const wl = b.order.length - 1 - b.wickets;
      const bl = this.totalBalls - b.legalBalls;
      margin = `${wl} wicket${wl === 1 ? '' : 's'}`;
      text = `${tb.name} won by ${margin}${bl > 0 ? ` (${bl} ball${bl === 1 ? '' : 's'} left)` : ''}`;
    } else if (a.runs > b.runs) {
      winner = ta.id;
      const r = a.runs - b.runs;
      margin = `${r} run${r === 1 ? '' : 's'}`;
      text = `${ta.name} won by ${margin}`;
    } else {
      text = 'Match Tied!';
      margin = 'tie';
    }
    const pom = this.playerOfMatch(winner);
    this.result = { winnerTeamId: winner, text, margin, playerOfMatch: pom.id, pomLine: pom.line };
  }

  playerOfMatch(winner: string | null): { id: string; line: string } {
    const pts: Record<string, number> = {};
    const lines: Record<string, string[]> = {};
    for (const inn of this.innings) {
      for (const c of Object.values(inn.batters)) {
        if (!c.batted) continue;
        const sr = c.balls ? c.runs / c.balls : 0;
        pts[c.playerId] = (pts[c.playerId] ?? 0) + c.runs + (c.runs >= 20 ? (sr - 1.2) * 12 : 0) + (c.runs >= 50 ? 10 : 0);
        (lines[c.playerId] ??= []).push(`${c.runs}${c.out ? '' : '*'} (${c.balls})`);
      }
      for (const c of Object.values(inn.bowlers)) {
        pts[c.playerId] = (pts[c.playerId] ?? 0) + c.wickets * 24 + (c.balls >= 12 ? (7.5 - (c.runs / c.balls) * 6) * 3 : 0) + c.maidens * 5;
        (lines[c.playerId] ??= []).push(`${c.wickets}/${c.runs} (${oversText(c.balls)})`);
      }
      for (const [id, f] of Object.entries(inn.fielding)) {
        pts[id] = (pts[id] ?? 0) + f.catches * 8 + f.runouts * 10 + f.stumpings * 9;
      }
    }
    let best = '', bestPts = -1e9;
    for (const [id, v] of Object.entries(pts)) {
      const p = getPlayer(id);
      const bonus = winner && p.teamId === winner ? 15 : 0;
      if (v + bonus > bestPts) { bestPts = v + bonus; best = id; }
    }
    return { id: best, line: (lines[best] ?? []).join(' & ') };
  }

  batterCard(id: string) { return this.inn.batters[id]; }
  bowlerCard(id: string) { return this.inn.bowlers[id]; }
  player(id: string): Player { return getPlayer(id); }
}
