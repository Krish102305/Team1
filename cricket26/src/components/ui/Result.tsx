import { useGame } from '../../store/gameStore';
import { session } from '../../game/session';
import { getPlayer, TEAM_MAP } from '../../data/teams';
import { oversText, InningsState } from '../../game/MatchManager';
import { TeamBadge } from './common';

function Scorecard({ inn }: { inn: InningsState }) {
  const team = TEAM_MAP[inn.battingTeamId];
  const ex = inn.extras;
  const exT = ex.wd + ex.nb + ex.b + ex.lb;
  const dnb = inn.order.filter((id) => !inn.batters[id].batted);
  return (
    <div className="section">
      <h3 style={{ display: 'flex', alignItems: 'center', gap: 10 }}><TeamBadge teamId={team.id} size={30} /> {team.name} — {inn.runs}/{inn.wickets} ({oversText(inn.legalBalls)} ov)</h3>
      <table className="sc-table">
        <thead><tr><th>Batter</th><th></th><th>R</th><th>B</th><th>4s</th><th>6s</th><th>SR</th></tr></thead>
        <tbody>
          {inn.order.filter((id) => inn.batters[id].batted).map((id) => {
            const c = inn.batters[id];
            return <tr key={id}><td><b>{getPlayer(id).name}</b></td><td className="how">{c.howOut}</td><td><b>{c.runs}</b></td><td>{c.balls}</td><td>{c.fours}</td><td>{c.sixes}</td><td>{c.balls ? ((c.runs / c.balls) * 100).toFixed(1) : '-'}</td></tr>;
          })}
          <tr><td>Extras</td><td className="how">(wd {ex.wd}, nb {ex.nb}, b {ex.b}, lb {ex.lb})</td><td><b>{exT}</b></td><td colSpan={4}></td></tr>
          <tr className="tot"><td>Total</td><td className="how">({inn.wickets} wkts, {oversText(inn.legalBalls)} ov, RR {(inn.legalBalls ? (inn.runs / inn.legalBalls) * 6 : 0).toFixed(2)})</td><td>{inn.runs}</td><td colSpan={4}></td></tr>
        </tbody>
      </table>
      {dnb.length > 0 && <div style={{ fontSize: 12, color: 'var(--muted)', margin: '6px 0 10px' }}>Did not bat: {dnb.map((id) => getPlayer(id).name).join(', ')}</div>}
      {inn.fallOfWickets.length > 0 && <div style={{ fontSize: 12, color: 'var(--muted)', margin: '6px 0 10px' }}>Fall of wickets: {inn.fallOfWickets.map((f) => `${f.runs}-${f.wickets} (${getPlayer(f.batterId).short}, ${f.over})`).join(', ')}</div>}
      <table className="sc-table">
        <thead><tr><th>Bowler ({TEAM_MAP[inn.bowlingTeamId].short})</th><th>O</th><th>M</th><th>R</th><th>W</th><th>Econ</th><th>Wd</th><th>Nb</th></tr></thead>
        <tbody>
          {inn.bowlerOrder.map((id) => {
            const c = inn.bowlers[id];
            return <tr key={id}><td><b>{getPlayer(id).name}</b></td><td>{oversText(c.balls)}</td><td>{c.maidens}</td><td>{c.runs}</td><td><b>{c.wickets}</b></td><td>{c.balls ? ((c.runs / c.balls) * 6).toFixed(2) : '-'}</td><td>{c.wides}</td><td>{c.noballs}</td></tr>;
          })}
        </tbody>
      </table>
    </div>
  );
}

export function ResultScreen() {
  const setScreen = useGame((s) => s.setScreen);
  const e = session.engine;
  if (!e || !e.match.result) {
    return <div className="page"><div className="page-head"><h2>No result</h2><button className="btn gold" onClick={() => setScreen('menu')}>Main Menu</button></div></div>;
  }
  const m = e.match, r = m.result!;
  const pom = getPlayer(r.playerOfMatch);
  const userWon = r.winnerTeamId === m.config.userTeamId;
  return (
    <div className="page">
      <div className="result-hero">
        <div style={{ letterSpacing: 6, color: 'var(--muted)', fontSize: 13 }}>{userWon ? 'VICTORY' : r.winnerTeamId ? 'DEFEAT' : 'TIED'} · {m.config.format === 'Custom' ? `${m.config.overs} OVERS` : m.config.format}</div>
        <div className="row" style={{ justifyContent: 'center', gap: 30, margin: '12px 0' }}>
          {m.innings.map((inn) => (
            <div key={inn.index} className="vs-team"><TeamBadge teamId={inn.battingTeamId} size={70} /><div className="nm">{TEAM_MAP[inn.battingTeamId].short} {inn.runs}/{inn.wickets}</div><div className="lbl">{oversText(inn.legalBalls)} OV</div></div>
          ))}
        </div>
        <div className="win">{r.text}</div>
        {pom && <div className="pom"><span className="l">PLAYER OF THE MATCH</span><b>{pom.name}</b><span style={{ color: 'var(--muted)' }}>{TEAM_MAP[pom.teamId].short} · {r.pomLine}</span></div>}
      </div>
      <div className="card-grid">
        {m.innings.map((inn) => <Scorecard key={inn.index} inn={inn} />)}
      </div>
      <div className="footer-bar">
        <button className="btn" onClick={() => setScreen('menu')}>Main Menu</button>
        <button className="btn gold" onClick={() => setScreen('toss')}>Play Again ▶</button>
      </div>
    </div>
  );
}
