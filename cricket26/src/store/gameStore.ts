import { create } from 'zustand';
import type { Difficulty, MatchConfig, TimeOfDay } from '../game/types';
import type { InputAction } from '../game/GameEngine';
import type { Quality } from '../components/three/StadiumBuilder';
import { TEAM_MAP } from '../data/teams';

export type Screen = 'menu' | 'settings' | 'setup' | 'xi' | 'toss' | 'match' | 'result' | 'exit';
export type CameraPreset = 'broadcast' | 'close' | 'high';

export interface Settings {
  quality: Quality;
  volume: number;
  commentaryVolume: number;
  speech: boolean;
  camera: CameraPreset;
  cameraSmoothing: number;
  difficulty: Difficulty;
  showHints: boolean;
  keys: Record<InputAction, string[]>;
}

export const DEFAULT_KEYS: Record<InputAction, string[]> = {
  batStraight: ['KeyW'], batLeg: ['KeyA'], batOff: ['KeyD'], batDefend: ['KeyS'], batPower: ['Space'], batLoft: ['ShiftLeft', 'ShiftRight'],
  aimLeft: ['ArrowLeft'], aimRight: ['ArrowRight'], footForward: ['ArrowUp'], footBack: ['ArrowDown'], run: ['KeyR'],
  pause: ['Escape'], replay: ['KeyV'], bowlType: ['KeyQ'], bowlVariation: ['KeyE'], bowlAction: ['Space'],
  bowlLeft: ['KeyA'], bowlRight: ['KeyD'], bowlFuller: ['KeyW'], bowlShorter: ['KeyS'], skip: ['Enter'], camera: ['KeyC'],
};

export const ACTION_LABELS: Record<InputAction, string> = {
  batStraight: 'Bat: straight / on-side shot', batLeg: 'Bat: leg-side shot', batOff: 'Bat: off-side shot', batDefend: 'Bat: defend / cancel run',
  batPower: 'Bat: power shot', batLoft: 'Bat: lofted modifier (hold)', aimLeft: 'Aim left', aimRight: 'Aim right',
  footForward: 'Front foot / advance (hold)', footBack: 'Back foot (hold)', run: 'Run / call another run', pause: 'Pause',
  replay: 'Replay last highlight', bowlType: 'Bowl: change delivery type', bowlVariation: 'Bowl: change pace variation',
  bowlAction: 'Bowl: hold to run in, release to bowl', bowlLeft: 'Bowl: move target left', bowlRight: 'Bowl: move target right',
  bowlFuller: 'Bowl: fuller length', bowlShorter: 'Bowl: shorter length', skip: 'Skip / continue', camera: 'Cycle camera',
};

const SETTINGS_KEY = 'cricket26.settings.v1';
function loadSettings(): Settings {
  const def: Settings = { quality: 'medium', volume: 0.7, commentaryVolume: 0.6, speech: false, camera: 'broadcast', cameraSmoothing: 0.6, difficulty: 'medium', showHints: true, keys: DEFAULT_KEYS };
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return def;
    const s = JSON.parse(raw);
    return { ...def, ...s, keys: { ...DEFAULT_KEYS, ...(s.keys ?? {}) } };
  } catch { return def; }
}
function saveSettings(s: Settings) { try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(s)); } catch { /* ignore */ } }

export interface SetupState {
  userTeamId: string;
  aiTeamId: string;
  format: 'T20' | 'ODI' | 'Custom';
  customOvers: 2 | 5 | 10;
  difficulty: Difficulty;
  stadiumId: string;
  timeOfDay: TimeOfDay;
  userXI: string[];
  aiXI: string[];
}

export interface Notification { id: number; text: string; kind: string; sub?: string }
export interface CommentaryLine { id: number; text: string }

interface GameStore {
  screen: Screen;
  prevScreen: Screen;
  settings: Settings;
  setup: SetupState;
  config: MatchConfig | null;
  hudVersion: number;
  phase: string;
  notification: Notification | null;
  commentary: CommentaryLine[];
  timing: { label: string; shot: string; quality: number; id: number } | null;
  replayAvailable: boolean;
  paused: boolean;
  setScreen: (s: Screen) => void;
  updateSettings: (p: Partial<Settings>) => void;
  updateSetup: (p: Partial<SetupState>) => void;
  setConfig: (c: MatchConfig | null) => void;
  bumpHud: () => void;
  setPhase: (p: string) => void;
  notify: (text: string, kind: string, sub?: string) => void;
  clearNotification: (id: number) => void;
  addCommentary: (text: string) => void;
  setTiming: (label: string, shot: string, quality: number) => void;
  setReplayAvailable: (v: boolean) => void;
  setPaused: (v: boolean) => void;
}

let nid = 1;
export const useGame = create<GameStore>((set, get) => ({
  screen: 'menu',
  prevScreen: 'menu',
  settings: loadSettings(),
  setup: {
    userTeamId: 'IND', aiTeamId: 'AUS', format: 'T20', customOvers: 5, difficulty: loadSettings().difficulty, stadiumId: 'intl', timeOfDay: 'day',
    userXI: TEAM_MAP.IND.defaultXI, aiXI: TEAM_MAP.AUS.defaultXI,
  },
  config: null,
  hudVersion: 0,
  phase: '',
  notification: null,
  commentary: [],
  timing: null,
  replayAvailable: false,
  paused: false,
  setScreen: (s) => set({ screen: s, prevScreen: get().screen }),
  updateSettings: (p) => { const s = { ...get().settings, ...p }; saveSettings(s); set({ settings: s }); },
  updateSetup: (p) => set({ setup: { ...get().setup, ...p } }),
  setConfig: (c) => set({ config: c, commentary: [], notification: null, timing: null, replayAvailable: false, paused: false }),
  bumpHud: () => set({ hudVersion: get().hudVersion + 1 }),
  setPhase: (p) => set({ phase: p }),
  notify: (text, kind, sub) => set({ notification: { id: nid++, text, kind, sub } }),
  clearNotification: (id) => { if (get().notification?.id === id) set({ notification: null }); },
  addCommentary: (text) => set({ commentary: [...get().commentary.slice(-5), { id: nid++, text }] }),
  setTiming: (label, shot, quality) => set({ timing: { label, shot, quality, id: nid++ } }),
  setReplayAvailable: (v) => set({ replayAvailable: v }),
  setPaused: (v) => set({ paused: v }),
}));
