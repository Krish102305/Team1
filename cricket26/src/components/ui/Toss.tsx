import { useMemo, useState } from 'react';
import { useGame } from '../../store/gameStore';
import { TEAM_MAP } from '../../data/teams';
import { STADIUM_MAP } from '../../data/stadiums';
import { audio } from '../../game/Audio';
import type { MatchConfig } from '../../game/types';
import { TeamBadge } from './common';

type Stage = 'call' | 'flip' | 'choose' | 'done';

export function TossScreen() {
  const setup = useGame((s) => s.setup);
  const setScreen = useGame((s) => s.setScreen);
  const setConfig = useGame((s) => s.setConfig);
  const [stage, setStage] = useState<Stage>('call');
  const [call, setCall] = useState<'heads' | 'tails'>('heads');
  const result = useMemo(() => (Math.random() < 0.5 ? 'heads' : 'tails'), []);
  const [decision, setDecision] = useState<{ userBats: boolean; text: string } | null>(null);
  const user = TEAM_MAP[setup.userTeamId], ai = TEAM_MAP[setup.aiTeamId];
  const userWon = call === result;
  const spins = 6 + (result === 'tails' ? 0.5 : 0);

  const doCall = (c: 'heads' | 'tails') => {
    setCall(c); setStage('flip'); audio.play('throw');
    setTimeout(() => {
      audio.play('catch');
      if (c === result) setStage('choose');
      else {
        // AI decides from conditions: night/evening games → chase under lights; otherwise bat first
        const st = STADIUM_MAP[setup.stadiumId];
        const bowlFirst = setup.timeOfDay !== 'day' || st.id === 'classic' ? Math.random() < 0.75 : Math.random() < 0.3;
        const text = `${ai.name} won the toss and elected to ${bowlFirst ? 'bowl' : 'bat'} first${bowlFirst && setup.timeOfDay !== 'day' ? ' (expecting dew later)' : ''}.`;
        setDecision({ userBats: bowlFirst, text }); setStage('done');
      }
    }, 2500);
  };
  const choose = (bat: boolean) => {
    setDecision({ userBats: bat, text: `${user.name} won the toss and elected to ${bat ? 'bat' : 'bowl'} first.` });
    setStage('done');
  };
  const start = () => {
    if (!decision) return;
    const overs = setup.format === 'T20' ? 20 : setup.format === 'ODI' ? 50 : setup.customOvers;
    const cfg: MatchConfig = {
      userTeamId: setup.userTeamId, aiTeamId: setup.aiTeamId, overs, format: setup.format, difficulty: setup.difficulty,
      stadiumId: setup.stadiumId, timeOfDay: setup.timeOfDay, userXI: setup.userXI, aiXI: setup.aiXI, userBatsFirst: decision.userBats, tossText: decision.text,
    };
    setConfig(cfg);
    setScreen('match');
  };
  return (
    <div className="toss-stage">
      <div className="row" style={{ gap: 30, alignItems: 'center' }}>
        <TeamBadge teamId={user.id} size={70} /><span className="toss-text">{user.name} <span style={{ color: 'var(--gold)' }}>vs</span> {ai.name}</span><TeamBadge teamId={ai.id} size={70} />
      </div>
      <div className="coin-wrap">
        <div className={`coin ${stage !== 'call' ? 'flip' : ''}`} style={{ ['--spin' as string]: `${spins * 360}deg`, ['--spinmid' as string]: `${spins * 180}deg` }}>
          <div className="coin-face">HEADS</div>
          <div className="coin-face back">TAILS</div>
        </div>
      </div>
      {stage === 'call' && (<>
        <div className="toss-text">You call. Heads or tails?</div>
        <div className="row"><button className="btn gold" onClick={() => doCall('heads')}>Heads</button><button className="btn gold" onClick={() => doCall('tails')}>Tails</button></div>
      </>)}
      {stage === 'flip' && <div className="toss-sub">You called {call}…</div>}
      {stage === 'choose' && (<>
        <div className="toss-text">It's {result.toUpperCase()}! You won the toss.</div>
        <div className="toss-sub">What would you like to do?</div>
        <div className="row"><button className="btn gold" onClick={() => choose(true)}>Bat first</button><button className="btn gold" onClick={() => choose(false)}>Bowl first</button></div>
      </>)}
      {stage === 'done' && decision && (<>
        <div className="toss-text">It's {result.toUpperCase()}! {userWon ? '' : 'You lost the toss.'}</div>
        <div className="toss-sub" style={{ fontSize: 18 }}>{decision.text}</div>
        <button className="btn gold" onClick={start}>Start Match ▶</button>
      </>)}
      <button className="btn sm" style={{ position: 'absolute', top: 20, left: 20 }} onClick={() => setScreen('xi')}>Back</button>
    </div>
  );
}
