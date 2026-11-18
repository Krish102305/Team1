import { useGame } from '../../store/gameStore';
import { TEAMS, TEAM_MAP } from '../../data/teams';
import { STADIUMS } from '../../data/stadiums';
import type { Difficulty, TimeOfDay } from '../../game/types';
import { TeamBadge } from './common';

const DIFF: { id: Difficulty; name: string; desc: string }[] = [
  { id: 'easy', name: 'Easy', desc: 'Wide timing windows, wayward AI bowling, slow fielders' },
  { id: 'medium', name: 'Medium', desc: 'Balanced bowling and batting' },
  { id: 'hard', name: 'Hard', desc: 'Smarter bowling plans and field settings' },
  { id: 'pro', name: 'Professional', desc: 'Accurate bowling, sharp fielding, tight timing' },
];

const teamOverall = (id: string) => {
  const t = TEAM_MAP[id];
  const xi = t.defaultXI.map((p) => t.players.find((x) => x.id === p)!);
  return Math.round(xi.reduce((a, p) => a + p.overall, 0) / xi.length);
};

export function SetupScreen() {
  const setup = useGame((s) => s.setup);
  const update = useGame((s) => s.updateSetup);
  const setScreen = useGame((s) => s.setScreen);
  const pickTeam = (side: 'user' | 'ai', id: string) => {
    if (side === 'user') update({ userTeamId: id, userXI: TEAM_MAP[id].defaultXI });
    else update({ aiTeamId: id, aiXI: TEAM_MAP[id].defaultXI });
  };
  const stadium = STADIUMS.find((s) => s.id === setup.stadiumId)!;
  return (
    <div className="page">
      <div className="page-head">
        <h2>Quick <span>Play</span></h2>
        <button className="btn" onClick={() => setScreen('menu')}>Back</button>
      </div>
      <div className="section">
        <div className="vs-bar">
          <div className="vs-team"><div className="lbl">YOUR TEAM</div><TeamBadge teamId={setup.userTeamId} size={96} /><div className="nm">{TEAM_MAP[setup.userTeamId].name}</div><div className="lbl">OVR {teamOverall(setup.userTeamId)}</div></div>
          <div className="vs">VS</div>
          <div className="vs-team"><div className="lbl">OPPONENT (AI)</div><TeamBadge teamId={setup.aiTeamId} size={96} /><div className="nm">{TEAM_MAP[setup.aiTeamId].name}</div><div className="lbl">OVR {teamOverall(setup.aiTeamId)}</div></div>
        </div>
      </div>
      <div className="card-grid">
        <div className="section">
          <h3>Your team</h3>
          <div className="grid-teams">
            {TEAMS.map((t) => (
              <button key={t.id} className={`team-card ${setup.userTeamId === t.id ? 'on' : ''} ${setup.aiTeamId === t.id ? 'disabled' : ''}`} onClick={() => pickTeam('user', t.id)}>
                <TeamBadge teamId={t.id} size={48} /><div className="nm">{t.name}</div><div className="ov">OVR {teamOverall(t.id)}</div>
              </button>
            ))}
          </div>
        </div>
        <div className="section">
          <h3>Opponent</h3>
          <div className="grid-teams">
            {TEAMS.map((t) => (
              <button key={t.id} className={`team-card ${setup.aiTeamId === t.id ? 'on' : ''} ${setup.userTeamId === t.id ? 'disabled' : ''}`} onClick={() => pickTeam('ai', t.id)}>
                <TeamBadge teamId={t.id} size={48} /><div className="nm">{t.name}</div><div className="ov">OVR {teamOverall(t.id)}</div>
              </button>
            ))}
          </div>
        </div>
      </div>
      <div className="card-grid">
        <div className="section">
          <h3>Match format</h3>
          <div className="row">
            <button className={`chip ${setup.format === 'T20' ? 'on' : ''}`} onClick={() => update({ format: 'T20' })}>T20<small>20 overs</small></button>
            <button className={`chip ${setup.format === 'ODI' ? 'on' : ''}`} onClick={() => update({ format: 'ODI' })}>ODI<small>50 overs</small></button>
            {([2, 5, 10] as const).map((o) => (
              <button key={o} className={`chip ${setup.format === 'Custom' && setup.customOvers === o ? 'on' : ''}`} onClick={() => update({ format: 'Custom', customOvers: o })}>Custom<small>{o} overs</small></button>
            ))}
          </div>
        </div>
        <div className="section">
          <h3>Difficulty</h3>
          <div className="row">
            {DIFF.map((d) => <button key={d.id} title={d.desc} className={`chip ${setup.difficulty === d.id ? 'on' : ''}`} onClick={() => update({ difficulty: d.id })}>{d.name}</button>)}
          </div>
          <div style={{ color: 'var(--muted)', fontSize: 13, marginTop: 10 }}>{DIFF.find((d) => d.id === setup.difficulty)!.desc}</div>
        </div>
      </div>
      <div className="section">
        <h3>Stadium</h3>
        <div className="stadium-grid">
          {STADIUMS.map((s) => (
            <button key={s.id} className={`stadium-card ${setup.stadiumId === s.id ? 'on' : ''}`}
              style={{ background: `linear-gradient(160deg, ${s.sky[s.defaultTime].top}, ${s.grass[1]} 70%)` }}
              onClick={() => update({ stadiumId: s.id, timeOfDay: s.defaultTime })}>
              <div className="nm">{s.name}</div>
              <div className="ds">{s.city} · {s.description}</div>
              <div className="ds">Boundary {Math.round(Math.min(s.boundary.rx, s.boundary.rz))}–{Math.round(Math.max(s.boundary.rx, s.boundary.rz))} m · {s.ballColor} ball</div>
            </button>
          ))}
        </div>
        <div className="row" style={{ marginTop: 14 }}>
          <span style={{ color: 'var(--muted)', fontSize: 13, marginRight: 6 }}>Time of day</span>
          {(['day', 'evening', 'night'] as TimeOfDay[]).map((t) => <button key={t} className={`chip ${setup.timeOfDay === t ? 'on' : ''}`} onClick={() => update({ timeOfDay: t })}>{t[0].toUpperCase() + t.slice(1)}</button>)}
          <span style={{ color: 'var(--muted)', fontSize: 12 }}>Default for {stadium.name}: {stadium.defaultTime}</span>
        </div>
      </div>
      <div className="footer-bar">
        <button className="btn" onClick={() => setScreen('menu')}>Cancel</button>
        <button className="btn gold" onClick={() => setScreen('xi')}>Next: Playing XI ▶</button>
      </div>
    </div>
  );
}
