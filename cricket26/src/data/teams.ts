import type { Player, Team, Role, BowlStyle, Personality, Hand } from '../game/types';
import { mulberry32, hashString, clamp } from '../utils/random';

// Real international squads (personal, non-commercial use). Ratings are estimates.
// Format: "Name|ROLE|Hand|BowlStyle|bat|bowl|personality|XI(1/0)|shirt#"
interface TeamSeed {
  id: string; name: string; short: string; primary: string; secondary: string; accent: string; pants: string;
  squad: string[];
}

const SEEDS: TeamSeed[] = [
  {
    id: 'IND', name: 'India', short: 'IND', primary: '#1f5fbf', secondary: '#ff9933', accent: '#0b2a5c', pants: '#1a3f80',
    squad: [
      'Shubman Gill|OPN|R|NONE|87|20|balanced|1|77', 'Abhishek Sharma|OPN|L|SLA|85|56|power|1|4', 'Shreyas Iyer|TOP|R|LB|85|35|balanced|1|96',
      'Suryakumar Yadav|MID|R|NONE|88|20|aggressive|1|63', 'Tilak Varma|TOP|L|OB|84|48|balanced|1|72', 'Sanju Samson|WK|R|NONE|83|15|aggressive|1|9',
      'Rinku Singh|MID|L|NONE|80|20|power|0|35', 'Hardik Pandya|AR|R|RFM|82|80|power|1|33', 'Axar Patel|AR|L|SLA|73|84|balanced|1|20',
      'Jasprit Bumrah|FAST|R|RF|22|96|defensive|1|93', 'Arshdeep Singh|FAST|L|LFM|20|86|defensive|1|2', 'Mohammed Siraj|FAST|R|RF|16|84|defensive|0|73',
      'Kuldeep Yadav|SPIN|L|LWS|22|88|defensive|0|23', 'Varun Chakaravarthy|SPIN|R|LB|12|87|defensive|1|29', 'Yashasvi Jaiswal|OPN|L|LB|84|30|aggressive|0|64',
    ],
  },
  {
    id: 'AUS', name: 'Australia', short: 'AUS', primary: '#f2c200', secondary: '#0d6b3d', accent: '#06371f', pants: '#e8b800',
    squad: [
      'Travis Head|OPN|L|OB|88|45|aggressive|1|62', 'Mitchell Marsh|OPN|R|RM|84|62|power|1|8', 'Josh Inglis|WK|R|NONE|82|15|aggressive|1|48',
      'Cameron Green|AR|R|RFM|82|76|balanced|1|2', 'Glenn Maxwell|AR|R|OB|82|72|power|1|32', 'Tim David|MID|R|NONE|81|20|power|1|85',
      'Marcus Stoinis|AR|R|RM|79|70|power|1|17', 'Steve Smith|TOP|R|LB|84|30|balanced|0|49', 'Matthew Short|OPN|R|OB|77|55|aggressive|0|60',
      'Pat Cummins|FAST|R|RF|32|89|balanced|1|30', 'Mitchell Starc|FAST|L|LF|28|89|power|1|56', 'Josh Hazlewood|FAST|R|RFM|15|90|defensive|1|38',
      'Nathan Ellis|FAST|R|RFM|22|82|defensive|0|12', 'Adam Zampa|SPIN|R|LB|16|88|defensive|1|88', 'Xavier Bartlett|FAST|R|RFM|28|80|power|0|11',
    ],
  },
  {
    id: 'ENG', name: 'England', short: 'ENG', primary: '#13306b', secondary: '#d4213d', accent: '#0a1b3f', pants: '#13306b',
    squad: [
      'Phil Salt|OPN|R|NONE|85|20|aggressive|1|61', 'Jos Buttler|WK|R|NONE|87|15|aggressive|1|63', 'Harry Brook|MID|R|RM|86|35|aggressive|1|88',
      'Jacob Bethell|TOP|L|SLA|80|62|balanced|1|21', 'Ben Duckett|OPN|L|NONE|82|15|aggressive|1|17', 'Will Jacks|AR|R|OB|79|68|power|1|85',
      'Liam Livingstone|AR|R|LB|79|66|power|0|23', 'Sam Curran|AR|L|LFM|74|78|balanced|1|58', 'Jamie Overton|AR|R|RF|62|78|power|0|75',
      'Tom Banton|MID|R|NONE|76|15|aggressive|0|18', 'Jofra Archer|FAST|R|RF|30|91|balanced|1|22', 'Mark Wood|FAST|R|RF|22|86|power|1|33',
      'Adil Rashid|SPIN|R|LB|30|86|defensive|1|95', 'Liam Dawson|SPIN|L|SLA|55|78|balanced|1|83', 'Luke Wood|FAST|L|LFM|20|78|defensive|0|14',
    ],
  },
  {
    id: 'PAK', name: 'Pakistan', short: 'PAK', primary: '#0f7a3a', secondary: '#bfe3c9', accent: '#05401d', pants: '#0f6a33',
    squad: [
      'Babar Azam|TOP|R|NONE|86|20|balanced|1|56', 'Mohammad Rizwan|WK|R|NONE|83|15|balanced|1|16', 'Saim Ayub|OPN|L|OB|80|58|aggressive|1|21',
      'Sahibzada Farhan|OPN|R|NONE|79|15|aggressive|1|99', 'Fakhar Zaman|OPN|L|SLA|80|30|aggressive|0|39', 'Salman Ali Agha|MID|R|OB|77|60|balanced|1|7',
      'Hasan Nawaz|MID|R|NONE|75|15|power|0|94', 'Shadab Khan|AR|R|LB|70|80|power|1|7', 'Mohammad Nawaz|AR|L|SLA|68|78|balanced|1|98',
      'Faheem Ashraf|AR|R|RFM|66|74|power|0|47', 'Shaheen Shah Afridi|FAST|L|LF|26|89|power|1|10', 'Haris Rauf|FAST|R|RF|18|85|defensive|1|97',
      'Naseem Shah|FAST|R|RF|26|86|power|1|71', 'Abrar Ahmed|SPIN|R|LB|10|84|defensive|1|40', 'Usman Khan|WK|R|NONE|74|15|aggressive|0|27',
    ],
  },
  {
    id: 'RSA', name: 'South Africa', short: 'RSA', primary: '#0a6b45', secondary: '#f5c518', accent: '#033b25', pants: '#f5c518',
    squad: [
      'Aiden Markram|TOP|R|OB|84|58|balanced|1|4', 'Quinton de Kock|WK|L|NONE|85|15|aggressive|1|12', 'Ryan Rickelton|OPN|L|NONE|80|15|aggressive|1|17',
      'Tristan Stubbs|MID|R|OB|80|40|power|1|30', 'David Miller|MID|L|NONE|82|15|power|1|10', 'Dewald Brevis|MID|R|LB|80|40|power|1|17',
      'Reeza Hendricks|OPN|R|NONE|79|15|balanced|0|26', 'Marco Jansen|AR|L|LF|65|84|power|1|70', 'Corbin Bosch|AR|R|RFM|60|74|balanced|0|56',
      'Kagiso Rabada|FAST|R|RF|26|90|balanced|1|25', 'Anrich Nortje|FAST|R|RF|15|86|defensive|1|20', 'Lungi Ngidi|FAST|R|RFM|15|82|defensive|0|22',
      'Keshav Maharaj|SPIN|L|SLA|30|84|defensive|1|16', 'Tabraiz Shamsi|SPIN|L|LWS|10|83|defensive|1|99', 'George Linde|AR|L|SLA|60|72|balanced|0|43',
    ],
  },
  {
    id: 'NZL', name: 'New Zealand', short: 'NZ', primary: '#111111', secondary: '#9a9a9a', accent: '#2c2c2c', pants: '#1c1c1c',
    squad: [
      'Devon Conway|OPN|L|NONE|82|15|balanced|1|88', 'Finn Allen|OPN|R|NONE|79|15|power|1|16', 'Rachin Ravindra|TOP|L|SLA|82|68|balanced|1|8',
      'Glenn Phillips|MID|R|OB|82|62|power|1|23', 'Daryl Mitchell|MID|R|RM|83|55|balanced|1|75', 'Tim Seifert|WK|R|NONE|77|15|aggressive|1|43',
      'Mark Chapman|MID|L|SLA|77|30|aggressive|0|80', 'Michael Bracewell|AR|L|OB|72|72|balanced|1|4', 'Mitchell Santner|AR|L|SLA|62|85|balanced|1|74',
      'Matt Henry|FAST|R|RFM|22|86|defensive|1|21', 'Lockie Ferguson|FAST|R|RF|18|86|power|1|69', 'Jacob Duffy|FAST|R|RFM|18|82|defensive|1|36',
      'Adam Milne|FAST|R|RF|20|80|power|0|20', 'Kyle Jamieson|FAST|R|RFM|35|82|balanced|0|12', 'Ish Sodhi|SPIN|R|LB|22|80|defensive|0|61',
    ],
  },
  {
    id: 'SL', name: 'Sri Lanka', short: 'SL', primary: '#1b3c8f', secondary: '#f6b51e', accent: '#0e2150', pants: '#1b3c8f',
    squad: [
      'Pathum Nissanka|OPN|R|NONE|84|15|balanced|1|5', 'Kusal Mendis|WK|R|NONE|82|15|aggressive|1|13', 'Kusal Perera|OPN|L|NONE|78|15|aggressive|1|55',
      'Charith Asalanka|MID|L|OB|80|55|balanced|1|72', 'Kamindu Mendis|AR|L|OB|80|62|balanced|1|21', 'Dasun Shanaka|AR|R|RM|72|65|power|1|7',
      'Janith Liyanage|MID|R|RM|74|50|balanced|0|25', 'Bhanuka Rajapaksa|MID|L|NONE|75|15|power|0|9', 'Wanindu Hasaranga|AR|R|LB|65|88|power|1|49',
      'Maheesh Theekshana|SPIN|R|OB|20|85|defensive|1|61', 'Matheesha Pathirana|FAST|R|RF|10|84|defensive|1|81', 'Dushmantha Chameera|FAST|R|RF|20|82|balanced|1|53',
      'Nuwan Thushara|FAST|R|RFM|10|80|defensive|1|91', 'Dunith Wellalage|AR|L|SLA|60|76|balanced|0|60', 'Asitha Fernando|FAST|R|RFM|12|78|defensive|0|16',
    ],
  },
  {
    id: 'BAN', name: 'Bangladesh', short: 'BAN', primary: '#006a4e', secondary: '#e03a3e', accent: '#003a2a', pants: '#006a4e',
    squad: [
      'Litton Das|WK|R|NONE|80|15|aggressive|1|16', 'Tanzid Hasan|OPN|L|NONE|76|15|aggressive|1|10', 'Parvez Hossain Emon|OPN|L|NONE|74|15|power|1|15',
      'Najmul Hossain Shanto|TOP|L|OB|78|40|balanced|1|9', 'Towhid Hridoy|MID|R|NONE|79|15|balanced|1|63', 'Jaker Ali|MID|R|NONE|74|15|power|1|77',
      'Shamim Hossain|MID|L|OB|72|50|power|0|23', 'Mehidy Hasan Miraz|AR|R|OB|70|80|balanced|1|53', 'Rishad Hossain|SPIN|R|LB|45|80|power|1|28',
      'Mustafizur Rahman|FAST|L|LFM|12|86|defensive|1|90', 'Taskin Ahmed|FAST|R|RF|18|84|balanced|1|3', 'Tanzim Hasan Sakib|FAST|R|RFM|30|78|power|1|98',
      'Shoriful Islam|FAST|L|LFM|15|78|defensive|0|21', 'Nasum Ahmed|SPIN|L|SLA|25|78|defensive|0|71', 'Mahedi Hasan|AR|R|OB|55|76|balanced|0|80',
    ],
  },
  {
    id: 'WI', name: 'West Indies', short: 'WI', primary: '#7b1530', secondary: '#f2b822', accent: '#430a19', pants: '#7b1530',
    squad: [
      'Shai Hope|WK|R|NONE|83|15|balanced|1|4', 'Brandon King|OPN|R|NONE|79|15|aggressive|1|53', 'Evin Lewis|OPN|L|NONE|77|15|power|1|17',
      'Shimron Hetmyer|MID|L|NONE|79|15|power|1|189', 'Rovman Powell|MID|R|RM|78|40|power|1|52', 'Sherfane Rutherford|MID|L|RM|77|35|power|1|50',
      'Roston Chase|AR|R|OB|70|72|balanced|0|10', 'Jason Holder|AR|R|RFM|66|80|balanced|1|98', 'Romario Shepherd|AR|R|RFM|66|77|power|1|15',
      'Alzarri Joseph|FAST|R|RF|30|84|balanced|1|70', 'Shamar Joseph|FAST|R|RF|20|80|power|0|1', 'Jayden Seales|FAST|R|RFM|15|80|defensive|0|31',
      'Akeal Hosein|SPIN|L|SLA|40|83|defensive|1|12', 'Gudakesh Motie|SPIN|L|SLA|30|80|defensive|1|25', 'Matthew Forde|FAST|R|RFM|35|78|power|0|99',
    ],
  },
  {
    id: 'AFG', name: 'Afghanistan', short: 'AFG', primary: '#1a46a8', secondary: '#d32f2f', accent: '#0c2459', pants: '#1a46a8',
    squad: [
      'Rahmanullah Gurbaz|WK|R|NONE|82|15|aggressive|1|21', 'Ibrahim Zadran|OPN|R|NONE|81|15|balanced|1|18', 'Sediqullah Atal|TOP|L|NONE|75|15|aggressive|1|28',
      'Azmatullah Omarzai|AR|R|RFM|75|78|power|1|23', 'Gulbadin Naib|AR|R|RM|70|66|power|0|82', 'Mohammad Nabi|AR|R|OB|72|78|power|1|7',
      'Najibullah Zadran|MID|L|NONE|74|15|power|1|33', 'Darwish Rasooli|MID|R|OB|72|35|balanced|1|69', 'Karim Janat|AR|R|RFM|66|70|power|0|30',
      'Rashid Khan|SPIN|R|LB|60|94|power|1|19', 'Noor Ahmad|SPIN|L|LWS|15|84|defensive|1|15', 'Mujeeb Ur Rahman|SPIN|R|OB|15|84|defensive|0|88',
      'Fazalhaq Farooqi|FAST|L|LFM|10|84|defensive|1|58', 'Naveen-ul-Haq|FAST|R|RFM|18|82|defensive|1|78', 'Fareed Ahmad|FAST|L|LFM|12|77|defensive|0|46',
    ],
  },
];

const ROLE_FIELD: Record<Role, { field: number; speed: number }> = {
  OPN: { field: 78, speed: 82 }, TOP: { field: 79, speed: 80 }, MID: { field: 80, speed: 82 }, WK: { field: 86, speed: 78 },
  AR: { field: 80, speed: 80 }, FAST: { field: 74, speed: 76 }, SPIN: { field: 72, speed: 70 },
};

function makeTeam(s: TeamSeed): Team {
  const xi: string[] = [];
  const players: Player[] = s.squad.map((entry, i) => {
    const [name, roleS, hand, style, batS, bowlS, pers, inXI, num] = entry.split('|');
    const role = roleS as Role;
    const r = mulberry32(hashString(name));
    const bat = Number(batS), bowl = Number(bowlS);
    const rf = ROLE_FIELD[role];
    const field = clamp(Math.round(rf.field + (r() - 0.5) * 16), 55, 95);
    const speed = clamp(Math.round(rf.speed + (r() - 0.5) * 16), 55, 95);
    const overall = Math.round(
      role === 'FAST' || role === 'SPIN' ? bowl * 0.85 + field * 0.08 + bat * 0.07
      : role === 'AR' ? Math.max(bat, bowl) * 0.6 + Math.min(bat, bowl) * 0.32 + field * 0.08
      : role === 'WK' ? bat * 0.82 + field * 0.18
      : bat * 0.9 + field * 0.1);
    const parts = name.split(' ');
    const id = `${s.id}-${i}`;
    if (inXI === '1') xi.push(id);
    return {
      id, name, short: `${parts[0][0]}. ${parts.slice(1).join(' ')}`, teamId: s.id, role,
      battingHand: hand as Hand, bowlStyle: style as BowlStyle, bat, bowl, field, speed, overall,
      personality: pers as Personality, number: Number(num) || i + 1,
    };
  });
  return {
    id: s.id, name: s.name, short: s.short, primary: s.primary, secondary: s.secondary, accent: s.accent, pants: s.pants,
    players, defaultXI: xi,
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
