export type Role = 'OPN' | 'TOP' | 'MID' | 'WK' | 'AR' | 'FAST' | 'SPIN';
export type BowlStyle = 'RF' | 'RFM' | 'RM' | 'LF' | 'LFM' | 'LM' | 'OB' | 'LB' | 'SLA' | 'LWS' | 'NONE';
export type Personality = 'defensive' | 'balanced' | 'aggressive' | 'power';
export type Difficulty = 'easy' | 'medium' | 'hard' | 'pro';
export type Hand = 'R' | 'L';

export interface Player {
  id: string;
  name: string;
  short: string;
  teamId: string;
  role: Role;
  battingHand: Hand;
  bowlStyle: BowlStyle;
  bat: number;
  bowl: number;
  field: number;
  speed: number;
  overall: number;
  personality: Personality;
}

export interface Team {
  id: string;
  name: string;
  short: string;
  primary: string;
  secondary: string;
  accent: string;
  pants: string;
  players: Player[];
  defaultXI: string[];
}

export type TimeOfDay = 'day' | 'evening' | 'night';

export interface MatchConfig {
  userTeamId: string;
  aiTeamId: string;
  overs: number;
  format: 'T20' | 'ODI' | 'Custom';
  difficulty: Difficulty;
  stadiumId: string;
  timeOfDay: TimeOfDay;
  userXI: string[];
  aiXI: string[];
  userBatsFirst: boolean;
  tossText: string;
}

export type DismissalKind = 'bowled' | 'caught' | 'lbw' | 'runout' | 'stumped' | 'hitwicket';

export interface WicketInfo {
  kind: DismissalKind;
  batterId: string;
  fielderId?: string;
}

export interface DeliveryMeta {
  shotName?: string;
  timing?: string;
  contact?: string;
  deliveryName: string;
  speedKmh: number;
  length: string;
  line: string;
  dropped?: boolean;
  edged?: boolean;
  beaten?: boolean;
  leave?: boolean;
  defended?: boolean;
  lofted?: boolean;
  directHit?: boolean;
  overthrow?: boolean;
  misfield?: boolean;
  appealDenied?: boolean;
  catchType?: string;
}

export interface DeliveryOutcome {
  id: number;
  bowlerId: string;
  strikerId: string;
  nonStrikerId: string;
  extraType: 'none' | 'wide' | 'noball';
  batRuns: number;
  byes: number;
  legByes: number;
  wideRuns: number;
  boundary: 0 | 4 | 6;
  runsRun: number;
  wicket: WicketInfo | null;
  /** batter standing at the striker (+z) end after the play; null = vacant for the incoming batter */
  atStrikerEnd: string | null;
  atOtherEnd: string | null;
  freeHit: boolean;
  meta: DeliveryMeta;
}

export interface BatterCard {
  playerId: string;
  runs: number;
  balls: number;
  fours: number;
  sixes: number;
  out: boolean;
  howOut: string;
  batted: boolean;
}

export interface BowlerCard {
  playerId: string;
  balls: number;
  runs: number;
  wickets: number;
  maidens: number;
  wides: number;
  noballs: number;
}

export interface FieldingCard {
  catches: number;
  runouts: number;
  stumpings: number;
}
