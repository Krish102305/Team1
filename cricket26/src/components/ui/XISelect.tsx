import { useGame } from '../../store/gameStore';
import { TEAM_MAP, ROLE_LABEL, BOWL_LABEL, canBowl, battingOrder } from '../../data/teams';
import { Rating, TeamBadge } from './common';

export function validateXI(ids: string[]) {
  const ps = ids.map((id) => Object.values(TEAM_MAP).flatMap((t) => t.players).find((p) => p.id === id)!);
  const errors: string[] = [];
  if (ids.length !== 11) errors.push(`Select exactly 11 players (${ids.length} selected).`);
  if (!ps.some((p) => p.role === 'WK')) errors.push('Your XI needs a wicketkeeper.');
  if (ps.filter(canBowl).length < 5) errors.push('Pick at least 5 bowling options.');
  return errors;
}

export function XIScreen() {
  const setup = useGame((s) => s.setup);
  const update = useGame((s) => s.updateSetup);
  const setScreen = useGame((s) => s.setScreen);
  const team = TEAM_MAP[setup.userTeamId];
  const sel = new Set(setup.userXI);
  const toggle = (id: string) => {
    const next = new Set(sel);
    if (next.has(id)) next.delete(id); else if (next.size < 11) next.add(id);
    update({ userXI: battingOrder([...next]) });
  };
  const errors = validateXI(setup.userXI);
  const order = battingOrder(setup.userXI);
  return (
    <div className="page">
      <div className="page-head">
        <h2><TeamBadge teamId={team.id} size={44} /> &nbsp;{team.name} <span>Playing XI</span></h2>
        <div className="row"><button className="btn" onClick={() => update({ userXI: team.defaultXI })}>Auto-pick best XI</button><button className="btn" onClick={() => setScreen('setup')}>Back</button></div>
      </div>
      <div className="card-grid">
        <div className="section">
          <h3>Squad (click to select)</h3>
          <table className="xi-table">
            <thead><tr><th></th><th>Player</th><th>Role</th><th>Bat</th><th>Bowl</th><th>Field</th><th>Spd</th><th>OVR</th><th>Style</th></tr></thead>
            <tbody>
              {team.players.map((p) => (
                <tr key={p.id} className={sel.has(p.id) ? 'sel' : ''} onClick={() => toggle(p.id)}>
                  <td><span className={`check ${sel.has(p.id) ? 'on' : ''}`} /></td>
                  <td><b>{p.name}</b></td>
                  <td>{ROLE_LABEL[p.role]}</td>
                  <td><Rating v={p.bat} /></td><td><Rating v={p.bowl} /></td><td><Rating v={p.field} /></td><td><Rating v={p.speed} /></td><td><Rating v={p.overall} /></td>
                  <td style={{ fontSize: 11, color: 'var(--muted)' }}>{p.battingHand}HB · {BOWL_LABEL[p.bowlStyle]} · {p.personality}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="section">
          <h3>Batting order</h3>
          <table className="xi-table"><tbody>
            {order.map((id, i) => { const p = team.players.find((x) => x.id === id)!; return <tr key={id}><td style={{ width: 30, color: 'var(--gold)', fontWeight: 900 }}>{i + 1}</td><td>{p.name}</td><td style={{ color: 'var(--muted)' }}>{ROLE_LABEL[p.role]}</td><td><Rating v={p.overall} /></td></tr>; })}
          </tbody></table>
          {errors.map((e) => <div key={e} className="warn" style={{ marginTop: 8 }}>⚠ {e}</div>)}
          <div style={{ marginTop: 16, color: 'var(--muted)', fontSize: 13 }}>Opponent: {TEAM_MAP[setup.aiTeamId].name} will field their strongest XI.</div>
        </div>
      </div>
      <div className="footer-bar">
        <button className="btn" onClick={() => setScreen('setup')}>Back</button>
        <button className="btn gold" disabled={errors.length > 0} onClick={() => setScreen('toss')}>Go to Toss ▶</button>
      </div>
    </div>
  );
}
