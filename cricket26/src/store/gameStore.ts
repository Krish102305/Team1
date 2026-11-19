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
  pitchMarker: 'auto' | 'on' | 'off';
  bowlerReveal: boolean;
  loftResetEachBall: boolean;
  aimPath: boolean;
  keys: Record<InputAction, string[]>;
}

export const DEFAULT_KEYS: Record<InputAction, string[]> = {
  batStraight: ['KeyW'], batLeft: ['KeyA'], batRight: ['KeyD'], batFineLeft: ['KeyQ'], batFineRight: ['KeyE'],
  batDefend: ['KeyS'], batLeave: ['KeyZ'], batLoft: ['KeyL'], batPower: ['Space'], batSoft: ['ShiftLeft', 'ShiftRight'], batSweep: ['KeyX'],
  footFront: ['KeyJ'], footBack: ['KeyK'], moveLeft: ['ArrowLeft'], moveRight: ['ArrowRight'], charge: ['ArrowUp'], retreat: ['ArrowDown'],
  run: ['KeyR'], pause: ['Escape'], replay: ['KeyV'],
  bowlType: ['KeyQ'], bowlVariation: ['KeyE'], bowlAction: ['Space'], bowlLeft: ['KeyA'], bowlRight: ['KeyD'], bowlFuller: ['KeyW'], bowlShorter: ['KeyS'],
  bowlSide: ['KeyT'], fieldPreset: ['KeyF'], skip: ['Enter'], camera: ['KeyC'],
};

export const ACTION_GROUPS: { title: string; actions: InputAction[] }[] = [
  { title: 'Batting — shot direction (screen-relative)', actions: ['batStraight', 'batLeft', 'batRight', 'batFineLeft', 'batFineRight'] },
  { title: 'Batting — shot type', actions: ['batLoft', 'batPower', 'batDefend', 'batLeave', 'batSoft', 'batSweep'] },
  { title: 'Batting — footwork & movement', actions: ['footFront', 'footBack', 'moveLeft', 'moveRight', 'charge', 'retreat', 'run'] },
  { title: 'Bowling', actions: ['bowlAction', 'bowlType', 'bowlVariation', 'bowlLeft', 'bowlRight', 'bowlFuller', 'bowlShorter', 'bowlSide', 'fieldPreset'] },
  { title: 'General', actions: ['pause', 'replay', 'camera', 'skip'] },
];

export const ACTION_LABELS: Record<InputAction, string> = {
  batStraight: 'Hit straight (combine with left/right for diagonals)', batLeft: 'Hit to screen-left', batRight: 'Hit to screen-right',
  batFineLeft: 'Hit fine, behind square (screen-left)', batFineRight: 'Hit fine, behind square (screen-right)',
  batDefend: 'Defend (also: turn back while running)', batLeave: 'Leave the ball', batLoft: 'Loft ON / OFF toggle (attacking shots go in the air)',
  batPower: 'Power shot (in held direction)', batSoft: 'Soft hands — push for a single (hold)', batSweep: 'Sweep / scoop / reverse family (hold)',
  footFront: 'Front foot (hold)', footBack: 'Back foot (hold)', moveLeft: 'Shuffle left at the crease', moveRight: 'Shuffle right at the crease',
  charge: 'Charge down the pitch (hold)', retreat: 'Back into the crease', run: 'Run / call another run',
  pause: 'Pause', replay: 'Replay last highlight', bowlType: 'Change delivery type', bowlVariation: 'Change pace variation',
  bowlAction: 'Hold to run in, release to bowl', bowlLeft: 'Target left', bowlRight: 'Target right', bowlFuller: 'Fuller length',
  bowlShorter: 'Shorter length', bowlSide: 'Over / around the wicket', fieldPreset: 'Change field setting', skip: 'Skip / continue', camera: 'Cycle camera',
};

const SETTINGS_KEY = 'cricket26.settings.v2';
function loadSettings(): Settings {
  const def: Settings = { quality: 'medium', volume: 0.7, commentaryVolume: 0.6, speech: false, camera: 'broadcast', cameraSmoothing: 0.6, difficulty: 'medium', showHints: true, pitchMarker: 'auto', bowlerReveal: false, loftResetEachBall: false, aimPath: true, keys: DEFAULT_KEYS };
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return def;
    const s = JSON.parse(raw);
    const keys = { ...DEFAULT_KEYS };
    for (const k of Object.keys(DEFAULT_KEYS) as InputAction[]) if (Array.isArray(s.keys?.[k])) keys[k] = s.keys[k];
    return { ...def, ...s, keys };
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
