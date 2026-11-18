import { useEffect, useRef, useState } from 'react';
import { GameEngine } from '../../game/GameEngine';
import { MatchCanvas } from '../three/MatchScene';
import { useGame } from '../../store/gameStore';
import { session } from '../../game/session';
import { Controls } from '../../game/Controls';
import { audio } from '../../game/Audio';
import { getPlayer, TEAM_MAP, BOWL_LABEL } from '../../data/teams';
import { STADIUM_MAP } from '../../data/stadiums';
import { oversText } from '../../game/MatchManager';
import { REPLAY_CAMS } from '../../game/Replay';
import { DELIVERIES } from '../../game/BowlingEngine';
import { TeamBadge, keyLabel } from './common';
import { SettingsPanel } from './Settings';

function useHud() { return useGame((s) => s.hudVersion); }

// ---------------------------------------------------------------- scorebug
function Scorebug({ e }: { e: GameEngine }) {
  useHud();
  const m = e.match, inn = m.inn;
  const bat = TEAM_MAP[inn.battingTeamId], bowlT = TEAM_MAP[inn.bowlingTeamId];
  const s = inn.batters[inn.strikerId], n = inn.batters[inn.nonStrikerId];
  const bw = inn.bowlers[inn.currentBowlerId];
  const sr = (c: { runs: number; balls: number }) => (c.balls ? ((c.runs / c.balls) * 100).toFixed(0) : '0');
  const scoreKey = `${inn.runs}-${inn.wickets}`;
  const recent: string[] = [];
  const hist = inn.history.slice(-10);
  let lastOver = -1;
  let legal = inn.legalBalls - hist.filter((h) => h.extraType === 'none').length;
  for (const h of hist) {
    const ov = Math.floor(legal / 6);
    if (lastOver >= 0 && ov !== lastOver) recent.push('|');
    lastOver = ov;
    recent.push(h.wicket ? 'W' : h.extraType === 'wide' ? 'wd' : h.extraType === 'noball' ? 'nb' : h.boundary === 6 && h.batRuns === 6 ? '6' : h.boundary === 4 && h.batRuns === 4 ? '4' : String(h.batRuns + h.byes + h.legByes));
    if (h.extraType === 'none') legal++;
  }
  const rrr = m.requiredRunRate();
  return (
    <div className="scorebug">
      <div className="sb-main">
        <div className="sb-team" style={{ background: `linear-gradient(90deg, ${bat.accent}, ${bat.primary})` }}><TeamBadge teamId={bat.id} size={36} />{bat.short}</div>
        <div className="sb-score"><span key={scoreKey} className="pop">{inn.runs}/{inn.wickets}</span></div>
        <div className="sb-overs"><span>OVERS</span><b>{oversText(inn.legalBalls)}<span style={{ fontSize: 12, color: 'var(--muted)' }}> /{m.config.overs}</span></b></div>
        <div className="sb-extra">
          <span>CRR <b>{m.runRate().toFixed(2)}</b></span>
          {inn.target !== null ? <span>TARGET <b>{inn.target}</b> · RRR <b>{rrr !== null ? rrr.toFixed(2) : '-'}</b></span> : <span>v {bowlT.name}</span>}
        </div>
      </div>
      <div className="sb-sub">
        <div className="sb-bat">
          {[s, n].map((c, i) => c && (
            <div key={c.playerId} className={i === 0 ? 'on' : ''}>
              <span>{getPlayer(c.playerId).name.toUpperCase()}{i === 0 ? ' *' : ''}</span>
              <span>{c.runs} ({c.balls}) <span style={{ color: 'var(--muted)', fontWeight: 400, fontSize: 11 }}>SR {sr(c)}</span></span>
            </div>
          ))}
        </div>
        <div className="sb-bowl">
          <div style={{ color: 'var(--muted)', fontSize: 11 }}>BOWLER · {bowlT.short}</div>
          {bw && <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}><span>{getPlayer(bw.playerId).name}</span><span className="fig">{oversText(bw.balls)}-{bw.maidens}-{bw.runs}-{bw.wickets}</span></div>}
        </div>
      </div>
      <div className="recent">
        <span style={{ marginRight: 6 }}>RECENT</span>
        {recent.map((r, i) => r === '|' ? <span key={i} className="ball-chip sep">|</span> : <span key={i} className={`ball-chip ${r === '4' ? 'b4' : r === '6' ? 'b6' : r === 'W' ? 'bW' : r === 'wd' || r === 'nb' ? 'bx' : ''}`}>{r === '0' ? '•' : r}</span>)}
        {inn.target !== null && <span style={{ marginLeft: 'auto', color: '#fff' }}>Need <b style={{ color: 'var(--gold)' }}>{Math.max(0, inn.target - inn.runs)}</b> from <b style={{ color: 'var(--gold)' }}>{m.ballsLeft}</b> balls</span>}
      </div>
    </div>
  );
}

function TopRight({ e }: { e: GameEngine }) {
  useHud();
  const inn = e.match.inn;
  const role = e.userRole;
  return (
    <div className="top-right">
      <div className="pill">{TEAM_MAP[e.config.userTeamId].short} {role === 'bat' ? 'BATTING' : role === 'bowl' ? 'BOWLING' : ''} · <b>{e.config.difficulty === 'pro' ? 'PROFESSIONAL' : e.config.difficulty.toUpperCase()}</b></div>
      <div className="pill">Partnership <b>{inn.partnershipRuns}</b> ({inn.partnershipBalls}) · Extras <b>{inn.extras.wd + inn.extras.nb + inn.extras.b + inn.extras.lb}</b></div>
      {inn.freeHitNext && <div className="pill" style={{ borderColor: '#ff4d5e' }}><b style={{ color: '#ff4d5e' }}>FREE HIT</b></div>}
      {e.match.current === 0 && <div className="pill">1st innings · {e.config.format}</div>}
    </div>
  );
}

function Commentary() {
  const c = useGame((s) => s.commentary);
  const last = c[c.length - 1];
  if (!last) return null;
  return <div className="commentary" key={last.id}><span className="lbl">COMMENTARY</span>{last.text}</div>;
}

function Notify() {
  const n = useGame((s) => s.notification);
  const clear = useGame((s) => s.clearNotification);
  useEffect(() => { if (!n) return; const t = setTimeout(() => clear(n.id), 2700); return () => clearTimeout(t); }, [n, clear]);
  if (!n) return null;
  return <div className={`notify ${n.kind}`} key={n.id}><div className="big">{n.text}</div>{n.sub && <div className="sub">{n.sub}</div>}</div>;
}

function Timing() {
  const t = useGame((s) => s.timing);
  const [show, setShow] = useState<typeof t>(null);
  useEffect(() => { if (!t) return; setShow(t); const h = setTimeout(() => setShow(null), 1700); return () => clearTimeout(h); }, [t]);
  if (!show) return null;
  const col = /PERFECT/i.test(show.label) ? '#2ee59d' : /GOOD/i.test(show.label) ? '#b5e655' : /Edge|LATE|EARLY|OVER/i.test(show.label) ? '#ff9f1c' : '#fff';
  return (
    <div className="timing" key={show.id}>
      <div className="lab" style={{ color: col }}>{show.label}</div>
      {show.shot && <div className="sh">{show.shot}</div>}
      <div className="bar"><i style={{ width: `${Math.round(show.quality * 100)}%` }} /></div>
    </div>
  );
}

function Speed({ e }: { e: GameEngine }) {
  useHud();
  const ph = useGame((s) => s.phase);
  if (!e.lastSpeed || ph === 'intro' || ph === 'walkIn') return null;
  return <div className="speed"><small>{e.lastDeliveryName || 'Delivery'}</small><b>{e.lastSpeed.toFixed(1)}</b> km/h</div>;
}

function RunHint({ e }: { e: GameEngine }) {
  useHud();
  const ph = useGame((s) => s.phase);
  if (ph !== 'live' || e.userRole !== 'bat' || !e.runHint) return null;
  const running = e.runners.some((r) => r.running);
  const txt = e.runHint === 'safe' ? 'RUN: SAFE' : e.runHint === 'risky' ? 'RUN: RISKY' : 'RUN: DANGER';
  return <div className={`runhint ${e.runHint}`}>{txt} · {running ? `R = another run · S = turn back` : 'R = run'} · runs {e.runsDone}</div>;
}

function BowlPanel({ e }: { e: GameEngine }) {
  useHud();
  const ph = useGame((s) => s.phase);
  const fill = useRef<HTMLDivElement>(null);
  const mark = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let raf = 0;
    const loop = () => {
      if (fill.current) fill.current.style.width = `${(ph === 'runUp' ? e.meter : 0) * 100}%`;
      if (mark.current) {
        if (e.meterReleased >= 0 && (ph === 'runUp' || ph === 'delivery')) { mark.current.style.display = 'block'; mark.current.style.left = `${e.meterReleased * 100}%`; }
        else mark.current.style.display = 'none';
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [e, ph]);
  if (e.userRole !== 'bowl' || !(ph === 'ready' || ph === 'runUp' || ph === 'delivery')) return null;
  const bowler = e.bowlerPlayer;
  const k = useGame.getState().settings.keys;
  return (
    <div className="bowl-panel">
      <div className="t">Bowler</div>
      <div className="v" style={{ fontSize: 16 }}>{bowler.name} <span style={{ color: 'var(--muted)', fontSize: 12 }}>{BOWL_LABEL[bowler.bowlStyle]}</span></div>
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <div><div className="t">Delivery [{keyLabel(k.bowlType[0])}]</div><div className="v">{e.deliveryOptionsForUser().find((d) => d.id === e.bowlType)?.name ?? DELIVERIES[e.bowlType].name}</div></div>
        <div><div className="t">Pace [{keyLabel(k.bowlVariation[0])}]</div><div className="v">{e.bowlVar === 'normal' ? 'Stock' : e.bowlVar === 'quicker' ? 'Quicker' : 'Slower'}</div></div>
      </div>
      <div className="row" style={{ justifyContent: 'space-between', marginBottom: 4 }}>
        <div><div className="t">Side [{keyLabel(k.bowlSide[0])}]</div><div className="v" style={{ fontSize: 15 }}>{e.aroundWicket ? 'Around the wicket' : 'Over the wicket'}</div></div>
        <div><div className="t">Field [{keyLabel(k.fieldPreset[0])}]</div><div className="v" style={{ fontSize: 15 }}>{e.fieldPreset}</div></div>
      </div>
      <div className="t">Length {e.targetLen.toFixed(1)} m · Line {e.targetLine > 0.05 ? `${e.targetLine.toFixed(2)} m off` : e.targetLine < -0.05 ? `${(-e.targetLine).toFixed(2)} m leg` : 'stumps'}</div>
      <div className="meter">
        <div className="zone" style={{ left: '72%', width: '14%' }} />
        <div className="nb" style={{ width: '4%' }} />
        <div className="fill" ref={fill} />
        <div className="mark" ref={mark} />
      </div>
      <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 6 }}>Hold <span className="kbd">{keyLabel(k.bowlAction[0])}</span> to run in, release in the <b style={{ color: 'var(--good)' }}>green</b> zone. Red = no ball.</div>
    </div>
  );
}

function Hints({ e }: { e: GameEngine }) {
  const show = useGame((s) => s.settings.showHints);
  const k = useGame((s) => s.settings.keys);
  const ph = useGame((s) => s.phase);
  useHud();
  if (!show || ph === 'intro') return null;
  const K = (a: keyof typeof k) => <span className="kbd">{keyLabel(k[a][0])}</span>;
  if (e.userRole === 'bat') return (
    <div className="hints">
      <b>BATTING</b> — hit as the ball arrives<br />
      Direction: {K('batLeft')}{K('batStraight')}{K('batRight')} + fine {K('batFineLeft')}{K('batFineRight')} (combine for diagonals)<br />
      Press a direction = ground shot · {K('batLoft')} loft · {K('batPower')} power<br />
      {K('batDefend')} defend · {K('batLeave')} leave · hold {K('batSoft')} soft · hold {K('batSweep')} sweep<br />
      Feet: hold {K('footFront')} front · {K('footBack')} back · {K('moveLeft')}{K('moveRight')} shuffle · {K('charge')} charge<br />
      {K('run')} run · {K('batDefend')} turn back · {K('replay')} replay · {K('pause')} pause
    </div>
  );
  if (e.userRole === 'bowl') return (
    <div className="hints">
      <b>BOWLING</b> — aim with mouse or {K('bowlLeft')}{K('bowlRight')}{K('bowlFuller')}{K('bowlShorter')}<br />
      {K('bowlType')} delivery · {K('bowlVariation')} pace · {K('bowlSide')} over/around · {K('fieldPreset')} field<br />
      hold {K('bowlAction')} to run in → release in green zone<br />
      {K('replay')} replay · {K('pause')} pause · {K('skip')} skip
    </div>
  );
  return null;
}

/** live shot selector: aimed direction on a mini field, footwork, modifiers and crease position */
function ShotSelector({ e }: { e: GameEngine }) {
  const ph = useGame((s) => s.phase);
  useHud();
  const arrow = useRef<SVGGElement>(null);
  const foot = useRef<HTMLSpanElement>(null);
  const mods = useRef<HTMLSpanElement>(null);
  const crease = useRef<HTMLDivElement>(null);
  const shot = useRef<HTMLDivElement>(null);
  const visible = e.userRole === 'bat' && (ph === 'ready' || ph === 'runUp' || ph === 'delivery' || ph === 'live');
  useEffect(() => {
    if (!visible) return;
    let raf = 0;
    const loop = () => {
      const d = e.heldDirection();
      if (arrow.current) {
        const deg = d.has ? (Math.atan2(d.sx, d.sy) * 180) / Math.PI : 0;
        arrow.current.setAttribute('transform', `rotate(${deg} 60 62)`);
        arrow.current.style.opacity = d.has ? '1' : '0.25';
      }
      if (foot.current) {
        const f = (e.held('footFront') ? 1 : 0) - (e.held('footBack') ? 1 : 0);
        foot.current.textContent = f > 0 ? 'FRONT FOOT' : f < 0 ? 'BACK FOOT' : 'AUTO FOOT';
        foot.current.style.color = f ? 'var(--gold)' : 'var(--muted)';
      }
      if (mods.current) {
        const m = [e.held('batSoft') ? 'SOFT' : '', e.held('batSweep') ? 'SWEEP' : '', e.held('batPower') ? 'POWER' : ''].filter(Boolean);
        mods.current.textContent = m.length ? m.join(' · ') : '—';
      }
      if (crease.current) {
        const xScreen = e.shuffle * e.offSign; // world/screen
        crease.current.style.left = `${50 + xScreen * 55}%`;
        crease.current.style.top = `${Math.max(0, (9.35 - e.batterZ) / 2.35) * -26 + 4}px`;
      }
      if (shot.current) {
        const s2 = e.d.shot;
        shot.current.textContent = s2 && s2.shot.family !== 'leave' ? `${s2.shot.name}${s2.timing ? ' · ' + s2.timing : ''}` : e.batterZ < 8.6 ? 'Down the track!' : '';
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [e, visible]);
  if (!visible) return null;
  const right = e.offSign > 0 ? 'OFF' : 'LEG', left = e.offSign > 0 ? 'LEG' : 'OFF';
  return (
    <div className="shot-sel">
      <svg width="120" height="78" viewBox="0 0 120 78">
        <ellipse cx="60" cy="62" rx="56" ry="56" fill="rgba(46,125,50,0.35)" stroke="rgba(255,255,255,0.35)" />
        <ellipse cx="60" cy="62" rx="26" ry="26" fill="none" stroke="rgba(255,255,255,0.25)" strokeDasharray="2 3" />
        <rect x="57" y="40" width="6" height="22" fill="#c9b27c" />
        <text x="8" y="70" fill="#fff" fontSize="10" fontWeight="800">{left}</text>
        <text x="94" y="70" fill="#fff" fontSize="10" fontWeight="800">{right}</text>
        <g ref={arrow}><line x1="60" y1="62" x2="60" y2="14" stroke="#ffc72c" strokeWidth="4" strokeLinecap="round" /><polygon points="52,18 60,4 68,18" fill="#ffc72c" /></g>
        <circle cx="60" cy="62" r="4" fill="#fff" />
      </svg>
      <div className="sel-info">
        <span ref={foot} className="sel-foot">AUTO FOOT</span>
        <span ref={mods} className="sel-mods">—</span>
        <div className="sel-crease"><div ref={crease} className="sel-dot" /></div>
        <div ref={shot} className="sel-shot" />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- overlays
function IntroCard({ e }: { e: GameEngine }) {
  const st = STADIUM_MAP[e.config.stadiumId];
  const a = TEAM_MAP[e.config.userTeamId], b = TEAM_MAP[e.config.aiTeamId];
  return (
    <>
      <div className="intro-card">
        <div className="venue">{st.name} · {st.city}</div>
        <div className="match"><TeamBadge teamId={a.id} size={70} />{a.name} <span style={{ color: 'var(--gold)' }}>v</span> {b.name}<TeamBadge teamId={b.id} size={70} /></div>
        <div className="meta">{e.config.format === 'Custom' ? `${e.config.overs}-over match` : e.config.format} · {e.config.timeOfDay} · {e.config.tossText}</div>
      </div>
      <div className="skip">Press ENTER to skip</div>
    </>
  );
}

function WalkInCard({ e }: { e: GameEngine }) {
  const id = e.walkInIds[0];
  if (!id) return null;
  const p = getPlayer(id);
  const second = e.walkInIds[1] ? getPlayer(e.walkInIds[1]) : null;
  return (
    <>
      <div className="intro-card">
        <div className="venue">{second ? 'Opening batters' : 'New batter'}</div>
        <div className="match" style={{ fontSize: 40 }}>{p.name}{second ? <> <span style={{ color: 'var(--gold)' }}>&</span> {second.name}</> : null}</div>
        {!second && <div className="meta">{p.battingHand === 'R' ? 'Right' : 'Left'}-hand bat · Batting {p.bat} · {p.personality}</div>}
      </div>
      <div className="skip">Press ENTER to skip</div>
    </>
  );
}

function BowlerSelect({ e }: { e: GameEngine }) {
  useHud();
  const ids = e.match.eligibleBowlers();
  const list = ids.length ? ids : e.inn.bowlingXI.filter((id) => id !== e.inn.prevBowlerId);
  useEffect(() => {
    const h = (ev: KeyboardEvent) => {
      const n = parseInt(ev.key, 10);
      if (n >= 1 && n <= list.length) e.selectBowler(list[n - 1]);
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [e, list]);
  return (
    <div className="overlay">
      <div className="modal">
        <h2>Choose <span>Bowler</span></h2>
        <div style={{ color: 'var(--muted)', fontSize: 13, marginBottom: 10 }}>Over {Math.floor(e.inn.legalBalls / 6) + 1} · max {e.match.maxBowlerOvers} overs per bowler</div>
        <div className="bowler-list">
          {list.map((id, i) => {
            const p = getPlayer(id), c = e.inn.bowlers[id];
            return (
              <button key={id} onClick={() => e.selectBowler(id)}>
                <span><span className="k">{i + 1}</span>{p.name} <span style={{ color: 'var(--muted)', fontSize: 12 }}>{BOWL_LABEL[p.bowlStyle]} · {p.bowl}</span></span>
                <span>{c ? `${oversText(c.balls)}-${c.maidens}-${c.runs}-${c.wickets}` : '0-0-0-0'}</span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function InningsBreak({ e }: { e: GameEngine }) {
  useHud();
  const inn = e.match.innings[0];
  const bat = TEAM_MAP[inn.battingTeamId];
  const topBat = Object.values(inn.batters).filter((b) => b.batted).sort((a, b) => b.runs - a.runs).slice(0, 3);
  const topBowl = Object.values(inn.bowlers).sort((a, b) => b.wickets - a.wickets || a.runs - b.runs).slice(0, 3);
  const userChasing = e.match.innings[1].battingTeamId === e.config.userTeamId;
  return (
    <div className="overlay">
      <div className="modal" style={{ minWidth: 520 }}>
        <h2>Innings <span>Break</span></h2>
        <div style={{ fontSize: 26, fontWeight: 900 }}>{bat.name} {inn.runs}/{inn.wickets} <span style={{ color: 'var(--muted)', fontSize: 16 }}>({oversText(inn.legalBalls)} ov)</span></div>
        <div className="card-grid" style={{ marginTop: 14 }}>
          <div>{topBat.map((b) => <div key={b.playerId} style={{ display: 'flex', justifyContent: 'space-between', padding: '3px 0' }}><span>{getPlayer(b.playerId).name}</span><b>{b.runs}{b.out ? '' : '*'} ({b.balls})</b></div>)}</div>
          <div>{topBowl.map((b) => <div key={b.playerId} style={{ display: 'flex', justifyContent: 'space-between', padding: '3px 0' }}><span>{getPlayer(b.playerId).name}</span><b>{b.wickets}/{b.runs} ({oversText(b.balls)})</b></div>)}</div>
        </div>
        <div style={{ margin: '18px 0', fontSize: 18 }}>{TEAM_MAP[e.match.innings[1].battingTeamId].name} need <b style={{ color: 'var(--gold)' }}>{inn.runs + 1}</b> to win. {userChasing ? 'You are batting.' : 'You are bowling — defend it!'}</div>
        <button className="btn gold" autoFocus onClick={() => e.continueAfterInningsBreak()}>Start 2nd Innings ▶</button>
      </div>
    </div>
  );
}

function MatchOver({ e }: { e: GameEngine }) {
  const setScreen = useGame((s) => s.setScreen);
  useEffect(() => { const t = setTimeout(() => setScreen('result'), 9000); return () => clearTimeout(t); }, [setScreen]);
  const r = e.match.result;
  return (
    <div className="intro-card" style={{ bottom: '30%' }}>
      <div className="venue">Match complete</div>
      <div className="match" style={{ fontSize: 'clamp(28px, 4vw, 52px)' }}>{r?.text}</div>
      <button className="btn gold interactive" onClick={() => setScreen('result')} style={{ pointerEvents: 'auto' }}>View Scorecard ▶</button>
    </div>
  );
}

function PauseMenu({ e, onResume }: { e: GameEngine; onResume: () => void }) {
  const setScreen = useGame((s) => s.setScreen);
  const [view, setView] = useState<'main' | 'settings' | 'quit'>('main');
  return (
    <div className="overlay">
      <div className="modal" style={{ minWidth: view === 'settings' ? 760 : 380 }}>
        {view === 'main' && (<>
          <h2>Game <span>Paused</span></h2>
          <div className="btns">
            <button className="btn gold" autoFocus onClick={onResume}>Resume</button>
            <button className="btn" onClick={() => setView('settings')}>Settings & Controls</button>
            <button className="btn" onClick={() => setView('quit')}>Quit to Main Menu</button>
          </div>
        </>)}
        {view === 'settings' && (<>
          <h2>Settings</h2>
          <SettingsPanel compact />
          <button className="btn gold" onClick={() => setView('main')}>Back</button>
        </>)}
        {view === 'quit' && (<>
          <h2>Quit <span>match?</span></h2>
          <div style={{ marginBottom: 16, color: 'var(--muted)' }}>Progress in this match will be lost.</div>
          <div className="row">
            <button className="btn" onClick={() => setView('main')}>Cancel</button>
            <button className="btn gold" onClick={() => { e.paused = false; setScreen('menu'); }}>Quit</button>
          </div>
        </>)}
      </div>
    </div>
  );
}

function ReplayBanner({ e }: { e: GameEngine }) {
  const [, force] = useState(0);
  useEffect(() => { const t = setInterval(() => force((x) => x + 1), 200); return () => clearInterval(t); }, []);
  if (!e.replay.active) return null;
  return (
    <div className="replay-banner">
      ● REPLAY <small>{REPLAY_CAMS[e.replay.cam]} · {e.replay.speed < 1 ? 'SLOW-MO' : 'NORMAL'} · [1] normal [2] slow [C] camera [V] exit</small>
    </div>
  );
}

// ---------------------------------------------------------------- screen
export function MatchScreen() {
  const config = useGame((s) => s.config);
  const [engine] = useState(() => new GameEngine(config!));
  const phase = useGame((s) => s.phase);
  const paused = useGame((s) => s.paused);
  const replayAvailable = useGame((s) => s.replayAvailable);
  const [, setTick] = useState(0);

  useEffect(() => {
    session.engine = engine;
    (window as unknown as { __engine: GameEngine }).__engine = engine;
    const st = useGame.getState();
    const params = new URLSearchParams(window.location.search);
    if (params.get('autoplay') === '1') engine.autoplay = true;
    const sp = Number(params.get('speed'));
    if (sp > 0) engine.timeScale = sp;
    engine.listener = {
      onState: () => useGame.getState().bumpHud(),
      onNotify: (t, k, sub) => useGame.getState().notify(t, k, sub),
      onCommentary: (t, pri) => { useGame.getState().addCommentary(t); if (pri) audio.say(t); },
      onPhase: (p) => { useGame.getState().setPhase(p); if (p === 'runUp') useGame.getState().setReplayAvailable(false); },
      onTiming: (l, s, q) => useGame.getState().setTiming(l, s, q),
      onSound: (s, v) => audio.play(s, v),
      onReplayAvailable: (v) => useGame.getState().setReplayAvailable(v),
    };
    st.setPhase(engine.phase);
    const controls = new Controls(st.settings.keys);
    controls.onPause = () => {
      if (engine.replay.active) { engine.replay.stop(); return; }
      engine.paused = !engine.paused;
      useGame.getState().setPaused(engine.paused);
    };
    controls.onReplayKey = (code) => {
      if (code === 'Digit1' || code === 'Space') engine.replay.speed = 1;
      else if (code === 'Digit2') engine.replay.speed = 0.3;
      else if (code === 'KeyC') engine.replay.cam = (engine.replay.cam + 1) % REPLAY_CAMS.length;
      else if (code === 'KeyV' || code === 'Enter') engine.replay.stop();
      else return false;
      setTick((x) => x + 1);
      return true;
    };
    controls.attach(engine);
    const unsub = useGame.subscribe((s, p) => { if (s.settings.keys !== p.settings.keys) controls.setKeys(s.settings.keys); });
    audio.ensure();
    return () => { controls.detach(); unsub(); engine.listener = { onState() {}, onNotify() {}, onCommentary() {}, onPhase() {}, onTiming() {}, onSound() {}, onReplayAvailable() {} }; audio.setAmbience(0); };
  }, [engine]);

  const resume = () => { engine.paused = false; useGame.getState().setPaused(false); };

  return (
    <div className="screen">
      <div className="fill"><MatchCanvas engine={engine} /></div>
      <div className="hud">
        {phase !== 'intro' && phase !== 'inningsBreak' && <Scorebug e={engine} />}
        {phase !== 'intro' && <TopRight e={engine} />}
        <Commentary />
        <Notify />
        <Timing />
        <Speed e={engine} />
        <RunHint e={engine} />
        <BowlPanel e={engine} />
        <Hints e={engine} />
        <ShotSelector e={engine} />
        <ReplayBanner e={engine} />
        {replayAvailable && !engine.replay.active && (phase === 'dead' || phase === 'ready' || phase === 'selectBowler') && <div className="replay-hint">▶ Press V for replay</div>}
        {phase === 'intro' && <IntroCard e={engine} />}
        {phase === 'walkIn' && <WalkInCard e={engine} />}
        {phase === 'matchOver' && <MatchOver e={engine} />}
      </div>
      {phase === 'selectBowler' && !engine.autoplay && <BowlerSelect e={engine} />}
      {phase === 'inningsBreak' && <InningsBreak e={engine} />}
      {paused && <PauseMenu e={engine} onResume={resume} />}
    </div>
  );
}
