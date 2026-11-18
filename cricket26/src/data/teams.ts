import type { Player, Team, Role, BowlStyle, Personality, Hand } from '../game/types';
import { mulberry32, hashString, clamp } from '../utils/random';

// Fully fictional squads. Format: "Name|ROLE|Hand|BowlStyle"
interface TeamSeed {
  id: string; name: string; short: string; primary: string; secondary: string; accent: string; pants: string;
  base: number; squad: string[];
}

const SEEDS: TeamSeed[] = [
  {
    id: 'IND', name: 'India', short: 'IND', primary: '#1f5fbf', secondary: '#ff9933', accent: '#0b2a5c', pants: '#1a3f80', base: 86,
    squad: [
      'Virat Parikh|OPN|R|NONE', 'Arjun Shah|OPN|L|NONE', 'Rohan Deshmukh|TOP|R|OB', 'Karan Malhotra|TOP|R|NONE',
      'Siddharth Rane|MID|L|NONE', 'Nikhil Bhosale|WK|R|NONE', 'Aditya Kulkarni|MID|R|LB', 'Varun Chauhan|AR|R|RFM',
      'Pranav Joshi|AR|L|SLA', 'Ankit Sandhu|FAST|R|RF', 'Mohan Tiwari|FAST|R|RFM', 'Devansh Rathore|FAST|L|LFM',
      'Sameer Qureshi|FAST|R|RM', 'Tarun Iyengar|SPIN|R|OB', 'Yash Gaekwad|SPIN|R|LB',
    ],
  },
  {
    id: 'AUS', name: 'Australia', short: 'AUS', primary: '#f2c200', secondary: '#0d6b3d', accent: '#06371f', pants: '#e8b800', base: 86,
    squad: [
      'Jack Thornton|OPN|L|NONE', 'Liam Whitfield|OPN|R|NONE', 'Callum Hargreaves|TOP|R|RM', 'Mitchell Brannigan|TOP|R|NONE',
      'Sam Kellerman|MID|R|OB', 'Riley Dawson|WK|R|NONE', 'Nathan Prowse|MID|L|NONE', 'Cooper Ainslie|AR|R|RFM',
      'Hamish Gallagher|AR|R|OB', 'Brodie McAllister|FAST|R|RF', 'Lachlan Strutt|FAST|L|LF', 'Josh Penrose|FAST|R|RFM',
      'Tom Wexford|FAST|R|RFM', 'Angus Fairley|SPIN|R|LB', 'Declan Moyes|SPIN|L|SLA',
    ],
  },
  {
    id: 'ENG', name: 'England', short: 'ENG', primary: '#13306b', secondary: '#d4213d', accent: '#0a1b3f', pants: '#13306b', base: 84,
    squad: [
      'Oliver Ashcombe|OPN|R|NONE', 'Harry Pembrook|OPN|L|NONE', 'George Fenwick|TOP|R|NONE', 'Alfie Marchant|TOP|R|OB',
      'Will Danbury|MID|L|NONE', 'Ben Hollins|WK|R|NONE', 'Charlie Rookwood|MID|R|LB', 'Freddie Calloway|AR|R|RFM',
      'Archie Bellamy|AR|L|OB', 'Jamie Ravensworth|FAST|R|RF', 'Toby Langridge|FAST|R|RFM', 'Ed Thackeray|FAST|L|LFM',
      'Max Crowther|FAST|R|RM', 'Rory Penhale|SPIN|R|LB', 'Seb Wickham|SPIN|L|SLA',
    ],
  },
  {
    id: 'PAK', name: 'Pakistan', short: 'PAK', primary: '#0f7a3a', secondary: '#bfe3c9', accent: '#05401d', pants: '#0f6a33', base: 83,
    squad: [
      'Hamza Qadir|OPN|R|NONE', 'Usman Rafiq|OPN|L|NONE', 'Bilal Mirza|TOP|R|NONE', 'Faizan Ashraf|TOP|R|OB',
      'Saad Hussain|MID|R|NONE', 'Imran Javed|WK|R|NONE', 'Talha Siddiqui|MID|L|LB', 'Danish Awan|AR|R|RFM',
      'Zeeshan Haider|AR|L|SLA', 'Ahsan Durrani|FAST|R|RF', 'Junaid Tariq|FAST|L|LF', 'Naveed Butt|FAST|R|RFM',
      'Kashif Ghouri|FAST|R|RF', 'Adnan Qureshi|SPIN|R|LB', 'Omer Lodhi|SPIN|R|OB',
    ],
  },
  {
    id: 'RSA', name: 'South Africa', short: 'RSA', primary: '#0a6b45', secondary: '#f5c518', accent: '#033b25', pants: '#f5c518', base: 84,
    squad: [
      'Kyle van Rensburg|OPN|L|NONE', 'Ruan Liebenberg|OPN|R|NONE', 'Sipho Ndlovu|TOP|R|NONE', 'Ethan Coetzer|TOP|R|RM',
      'Thabo Mokoena|MID|R|NONE', 'Jaco Visagie|WK|L|NONE', 'Marco Steenkamp|MID|R|OB', 'Lwazi Dlamini|AR|R|RFM',
      'Keegan Fourie|AR|L|SLA', 'Andile Mahlangu|FAST|R|RF', 'Wian Kruger|FAST|L|LF', 'Bongani Zulu|FAST|R|RFM',
      'Henno Joubert|FAST|R|RFM', 'Tabraiz Moosa|SPIN|L|LWS', 'Zaid Abrahams|SPIN|R|OB',
    ],
  },
  {
    id: 'NZL', name: 'New Zealand', short: 'NZ', primary: '#111111', secondary: '#9a9a9a', accent: '#2c2c2c', pants: '#1c1c1c', base: 83,
    squad: [
      'Finn Callister|OPN|L|NONE', 'Blair Henwood|OPN|R|NONE', 'Corey Tamahori|TOP|R|NONE', 'Aiden McKenzie|TOP|R|RM',
      'Logan Whitcombe|MID|L|NONE', 'Ryan Halberg|WK|R|NONE', 'Mason Kerr|MID|R|OB', 'Jesse Rawiri|AR|R|RFM',
      'Quinn Ashby|AR|L|SLA', 'Hayden Puru|FAST|R|RF', 'Tyler Brookes|FAST|L|LF', 'Dylan Morrissey|FAST|R|RFM',
      'Sean Kerwin|FAST|R|RFM', 'Isaac Pohatu|SPIN|R|LB', 'Ollie Fenton|SPIN|R|OB',
    ],
  },
  {
    id: 'SL', name: 'Sri Lanka', short: 'SL', primary: '#1b3c8f', secondary: '#f6b51e', accent: '#0e2150', pants: '#1b3c8f', base: 80,
    squad: [
      'Kasun Wijeratne|OPN|L|NONE', 'Dinesh Rajapakse|OPN|R|NONE', 'Pathum Gunasekara|TOP|L|NONE', 'Chamika Dissanayake|TOP|R|OB',
      'Lahiru Fernandopulle|MID|R|NONE', 'Dasun Weerasinghe|WK|R|NONE', 'Nuwan Bandara|MID|R|LB', 'Isuru Amarasinghe|AR|R|RFM',
      'Thilina Jayakody|AR|L|SLA', 'Dilshan Madugalle|FAST|R|RF', 'Asitha Ranasinghe|FAST|L|LFM', 'Chathura Peiris|FAST|R|RM',
      'Mahesh Pathirage|FAST|R|RFM', 'Akila Senanayake|SPIN|R|LB', 'Ramesh Kulatunga|SPIN|R|OB',
    ],
  },
  {
    id: 'BAN', name: 'Bangladesh', short: 'BAN', primary: '#006a4e', secondary: '#e03a3e', accent: '#003a2a', pants: '#006a4e', base: 78,
    squad: [
      'Tanvir Haque|OPN|L|NONE', 'Rafiul Islam|OPN|R|NONE', 'Nazmul Karim|TOP|L|NONE', 'Mahfuz Rahman|TOP|R|OB',
      'Sabbir Chowdhury|MID|R|NONE', 'Jakir Alam|WK|R|NONE', 'Towhid Sarkar|MID|R|NONE', 'Mehedi Rana|AR|R|OB',
      'Afif Talukder|AR|L|SLA', 'Hasan Mollah|FAST|R|RF', 'Mustafa Kabir|FAST|L|LFM', 'Rubel Mridha|FAST|R|RFM',
      'Shamim Bhuiyan|FAST|R|RM', 'Nasum Parvez|SPIN|L|SLA', 'Rishad Khondokar|SPIN|R|LB',
    ],
  },
  {
    id: 'WI', name: 'West Indies', short: 'WI', primary: '#7b1530', secondary: '#f2b822', accent: '#430a19', pants: '#7b1530', base: 80,
    squad: [
      'Darnell Baptiste|OPN|L|NONE', 'Kemar Ollivierre|OPN|R|NONE', 'Jermaine Lashley|TOP|L|NONE', 'Shamar Padmore|TOP|R|NONE',
      'Tevin Springer|MID|R|RM', 'Marlon Ince|WK|R|NONE', 'Keon Small|MID|L|SLA', 'Odean Barrow|AR|R|RFM',
      'Romario Clarke|AR|R|OB', 'Oshane Bascombe|FAST|R|RF', 'Obed Charles|FAST|R|RF', 'Jomel Fraser|FAST|L|LFM',
      'Kevon Richards|FAST|R|RFM', 'Dexter Pascal|SPIN|R|LB', 'Shem Alleyne|SPIN|L|SLA',
    ],
  },
  {
    id: 'AFG', name: 'Afghanistan', short: 'AFG', primary: '#1a46a8', secondary: '#d32f2f', accent: '#0c2459', pants: '#1a46a8', base: 79,
    squad: [
      'Fareed Ahmadzai|OPN|R|NONE', 'Sediq Kakar|OPN|R|NONE', 'Najib Sherzad|TOP|L|NONE', 'Zubair Omari|TOP|R|OB',
      'Karim Mangal|MID|R|NONE', 'Noor Wardak|WK|R|NONE', 'Shahidullah Noori|MID|L|NONE', 'Samiullah Safi|AR|R|RFM',
      'Waheed Popal|AR|R|OB', 'Ziaur Momand|FAST|R|RF', 'Fazal Shinwari|FAST|L|LFM', 'Javed Arsala|FAST|R|RFM',
      'Habib Durrani|FAST|R|RM', 'Rahim Stanikzai|SPIN|R|LB', 'Sharif Ludin|SPIN|L|SLA',
    ],
  },
];

const ROLE_TEMPLATE: Record<Role, { bat: number; bowl: number; field: number; speed: number }> = {
  OPN: { bat: 2, bowl: -55, field: -6, speed: -4 },
  TOP: { bat: 3, bowl: -50, field: -5, speed: -6 },
  MID: { bat: 0, bowl: -45, field: -3, speed: -3 },
  WK: { bat: -4, bowl: -70, field: 4, speed: -6 },
  AR: { bat: -7, bowl: -4, field: -2, speed: -4 },
  FAST: { bat: -50, bowl: 1, field: -8, speed: -8 },
  SPIN: { bat: -45, bowl: 0, field: -10, speed: -14 },
};

const PERSONALITY_BY_ROLE: Record<Role, Personality[]> = {
  OPN: ['balanced', 'aggressive', 'balanced', 'defensive'],
  TOP: ['balanced', 'defensive', 'balanced', 'aggressive'],
  MID: ['aggressive', 'power', 'balanced', 'power'],
  WK: ['aggressive', 'balanced', 'power'],
  AR: ['power', 'aggressive', 'balanced'],
  FAST: ['power', 'defensive', 'balanced'],
  SPIN: ['defensive', 'balanced', 'power'],
};

function makeTeam(s: TeamSeed): Team {
  const players: Player[] = s.squad.map((entry, i) => {
    const [name, roleS, hand, style] = entry.split('|');
    const role = roleS as Role;
    const r = mulberry32(hashString(name));
    const t = ROLE_TEMPLATE[role];
    // Earlier squad members (first-choice) slightly better.
    const tier = i < 9 ? 1 : 0;
    const bat = clamp(Math.round(s.base + t.bat + (r() - 0.5) * 12 + tier), 15, 97);
    const bowlStyle = style as BowlStyle;
    let bowl = bowlStyle === 'NONE' ? clamp(Math.round(18 + r() * 14), 10, 35)
      : clamp(Math.round(s.base + t.bowl + (r() - 0.5) * 12 + (role === 'FAST' || role === 'SPIN' ? 1 : 0)), 30, 96);
    if ((role === 'TOP' || role === 'MID' || role === 'OPN') && bowlStyle !== 'NONE') bowl = clamp(Math.round(52 + r() * 14), 40, 70);
    const field = clamp(Math.round(80 + t.field + (r() - 0.5) * 18), 50, 96);
    const speed = clamp(Math.round(84 + t.speed + (r() - 0.5) * 18), 50, 96);
    const overall = Math.round(
      role === 'FAST' || role === 'SPIN' ? bowl * 0.82 + field * 0.1 + bat * 0.08
      : role === 'AR' ? bat * 0.45 + bowl * 0.45 + field * 0.1
      : role === 'WK' ? bat * 0.75 + field * 0.25
      : bat * 0.88 + field * 0.12);
    const pers = PERSONALITY_BY_ROLE[role];
    const parts = name.split(' ');
    return {
      id: `${s.id}-${i}`,
      name,
      short: `${parts[0][0]}. ${parts.slice(1).join(' ')}`,
      teamId: s.id,
      role,
      battingHand: hand as Hand,
      bowlStyle,
      bat, bowl, field, speed, overall,
      personality: pers[Math.floor(r() * pers.length)],
    };
  });
  const xiIdx = [0, 1, 2, 3, 4, 5, 7, 8, 9, 10, 13];
  return {
    id: s.id, name: s.name, short: s.short, primary: s.primary, secondary: s.secondary, accent: s.accent, pants: s.pants,
    players, defaultXI: xiIdx.map((i) => players[i].id),
  };
}

export const TEAMS: Team[] = SEEDS.map(makeTeam);
export const TEAM_MAP: Record<string, Team> = Object.fromEntries(TEAMS.map((t) => [t.id, t]));
export const PLAYER_MAP: Record<string, Player> = Object.fromEntries(TEAMS.flatMap((t) => t.players.map((p) => [p.id, p])));
export const getPlayer = (id: string) => PLAYER_MAP[id];

export const ROLE_LABEL: Record<Role, string> = {
  OPN: 'Opening Batter', TOP: 'Top-order Batter', MID: 'Middle-order Batter', WK: 'Wicketkeeper',
  AR: 'All-rounder', FAST: 'Fast Bowler', SPIN: 'Spin Bowler',
};
export const BOWL_LABEL: Record<BowlStyle, string> = {
  RF: 'Right-arm fast', RFM: 'Right-arm fast-medium', RM: 'Right-arm medium', LF: 'Left-arm fast',
  LFM: 'Left-arm fast-medium', LM: 'Left-arm medium', OB: 'Right-arm off-spin', LB: 'Right-arm leg-spin',
  SLA: 'Slow left-arm orthodox', LWS: 'Left-arm wrist-spin', NONE: '—',
};
export const isSpin = (s: BowlStyle) => s === 'OB' || s === 'LB' || s === 'SLA' || s === 'LWS';
export const isLeftArm = (s: BowlStyle) => s === 'LF' || s === 'LFM' || s === 'LM' || s === 'SLA' || s === 'LWS';
export const canBowl = (p: Player) => p.bowlStyle !== 'NONE' && p.bowl >= 40;

/** Sort an XI into a sensible batting order. */
export function battingOrder(ids: string[]): string[] {
  const order: Record<Role, number> = { OPN: 0, TOP: 1, MID: 2, WK: 3, AR: 4, FAST: 6, SPIN: 5 };
  return [...ids].sort((a, b) => {
    const pa = PLAYER_MAP[a], pb = PLAYER_MAP[b];
    const d = order[pa.role] - order[pb.role];
    if (d !== 0) return d;
    return pb.bat - pa.bat;
  });
}
