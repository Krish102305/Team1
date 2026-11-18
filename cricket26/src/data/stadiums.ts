import type { TimeOfDay } from '../game/types';

export interface StadiumDef {
  id: string;
  name: string;
  city: string;
  description: string;
  defaultTime: TimeOfDay;
  boundary: { rx: number; rz: number; wobble: number; wobblePhase: number };
  grass: [string, string];
  outfield: string;
  seatColors: string[];
  standColor: string;
  roof: 'canopy' | 'ring' | 'none';
  tiers: number;
  standGap: number; // missing arc (radians) for open grounds
  floodlights: number;
  water: boolean;
  trees: boolean;
  pavilion: boolean;
  crowdDensity: number;
  ballColor: 'white' | 'red';
  boards: string[];
  sky: Record<TimeOfDay, { top: string; bottom: string; fog: string; sun: string; sunIntensity: number; ambient: number }>;
}

const SKY_DEFAULT: StadiumDef['sky'] = {
  day: { top: '#3d7fd6', bottom: '#cfe6ff', fog: '#cfe2f5', sun: '#fff6e0', sunIntensity: 3.0, ambient: 0.9 },
  evening: { top: '#2a3a78', bottom: '#ff9e5e', fog: '#d9a17e', sun: '#ffc48a', sunIntensity: 2.3, ambient: 0.65 },
  night: { top: '#03060f', bottom: '#14223f', fog: '#0b1222', sun: '#f2f6ff', sunIntensity: 3.2, ambient: 0.45 },
};

export const STADIUMS: StadiumDef[] = [
  {
    id: 'intl', name: 'Grand International Stadium', city: 'Metro City', description: 'A towering double-tier bowl with a sweeping canopy roof.',
    defaultTime: 'day', boundary: { rx: 70, rz: 74, wobble: 0, wobblePhase: 0 },
    grass: ['#3f8f37', '#367f2f'], outfield: '#2f6b2a', seatColors: ['#1d4fa3', '#2565c7', '#173f86'], standColor: '#c9ccd3',
    roof: 'canopy', tiers: 2, standGap: 0, floodlights: 6, water: false, trees: false, pavilion: false, crowdDensity: 1,
    ballColor: 'white', boards: ['VOLTEX', 'AQUAFIZZ', 'NOVA BANK', 'SKYJET', 'ZENTRA', 'PIXELON', 'RAPIDO', 'MAXCOLA'],
    sky: SKY_DEFAULT,
  },
  {
    id: 'night', name: 'Neon Lights Arena', city: 'Harbour Heights', description: 'An electric floodlit cauldron built for night cricket.',
    defaultTime: 'night', boundary: { rx: 66, rz: 70, wobble: 0, wobblePhase: 0 },
    grass: ['#3a8a3a', '#2f7731'], outfield: '#255d27', seatColors: ['#6a2aa3', '#9b2fbf', '#3b2a8f', '#c42b7a'], standColor: '#2a2d3a',
    roof: 'ring', tiers: 2, standGap: 0, floodlights: 8, water: false, trees: false, pavilion: false, crowdDensity: 1,
    ballColor: 'white', boards: ['NEONIX', 'HYPERCHARGE', 'ORBITEL', 'FLUXPAY', 'GLOWMAX', 'STARLINE', 'VOLTEX', 'BLAZE'],
    sky: SKY_DEFAULT,
  },
  {
    id: 'coastal', name: 'Coral Bay Oval', city: 'Seaside Point', description: 'Open-air seaside ground with grass banks and ocean views.',
    defaultTime: 'evening', boundary: { rx: 62, rz: 68, wobble: 0.03, wobblePhase: 0.7 },
    grass: ['#4aa047', '#3f8f3d'], outfield: '#3a8236', seatColors: ['#e8e2d0', '#f08a4b', '#2bb3c0'], standColor: '#e9e4d6',
    roof: 'none', tiers: 1, standGap: 1.6, floodlights: 4, water: true, trees: true, pavilion: false, crowdDensity: 0.7,
    ballColor: 'white', boards: ['SURFWAVE', 'CORALINE', 'SUNNY FM', 'TIDEPOOL', 'BAYSIDE', 'MANGO COOL', 'SEABREEZE', 'PALMAIR'],
    sky: {
      ...SKY_DEFAULT,
      day: { top: '#2f8be0', bottom: '#d9f1ff', fog: '#d4ecfa', sun: '#fff8e8', sunIntensity: 3.2, ambient: 1.0 },
    },
  },
  {
    id: 'classic', name: 'Old Hollingbrook Ground', city: 'Hollingbrook', description: 'A historic English ground with a grand pavilion and tree-lined boundary.',
    defaultTime: 'day', boundary: { rx: 60, rz: 66, wobble: 0.07, wobblePhase: 1.9 },
    grass: ['#4c9440', '#41843a'], outfield: '#3c7a35', seatColors: ['#f3f1ea', '#2d6b3c', '#c9c3b2'], standColor: '#ece7da',
    roof: 'none', tiers: 1, standGap: 0.9, floodlights: 4, water: false, trees: true, pavilion: true, crowdDensity: 0.6,
    ballColor: 'red', boards: ['HOLLING ALE', 'BRIGHTWELL', 'KINGS TEA', 'OAKLEY & CO', 'MERIDIAN', 'ROYAL OAK', 'THAMESIDE', 'WREN CYCLES'],
    sky: {
      ...SKY_DEFAULT,
      day: { top: '#6f93bd', bottom: '#dfe8ee', fog: '#d8e0e6', sun: '#fff3de', sunIntensity: 2.4, ambient: 1.05 },
    },
  },
];

export const STADIUM_MAP: Record<string, StadiumDef> = Object.fromEntries(STADIUMS.map((s) => [s.id, s]));

/** Boundary radius in the given world direction (angle measured atan2(x, z)). */
export function boundaryRadius(def: StadiumDef, angle: number): number {
  const { rx, rz, wobble, wobblePhase } = def.boundary;
  const s = Math.sin(angle), c = Math.cos(angle);
  const r = 1 / Math.sqrt((s * s) / (rx * rx) + (c * c) / (rz * rz));
  return r * (1 + wobble * Math.sin(2 * angle + wobblePhase) + wobble * 0.5 * Math.sin(3 * angle + wobblePhase * 2));
}
