import { useEffect, useState } from 'react';
import { useGame, ACTION_LABELS, ACTION_GROUPS, DEFAULT_KEYS, Settings } from '../../store/gameStore';
import type { InputAction } from '../../game/GameEngine';
import type { Difficulty } from '../../game/types';
import { keyLabel } from './common';

export function SettingsPanel({ compact = false }: { compact?: boolean }) {
  const settings = useGame((s) => s.settings);
  const update = useGame((s) => s.updateSettings);
  const [listen, setListen] = useState<InputAction | null>(null);
  useEffect(() => {
    if (!listen) return;
    const h = (e: KeyboardEvent) => {
      e.preventDefault(); e.stopPropagation();
      if (e.code !== 'Escape') update({ keys: { ...settings.keys, [listen]: [e.code] } });
      setListen(null);
    };
    window.addEventListener('keydown', h, true);
    return () => window.removeEventListener('keydown', h, true);
  }, [listen, settings.keys, update]);
  const Opt = <K extends keyof Settings>({ k, v, label }: { k: K; v: Settings[K]; label: string }) => (
    <button className={`chip ${settings[k] === v ? 'on' : ''}`} onClick={() => update({ [k]: v } as Partial<Settings>)}>{label}</button>
  );
  return (
    <>
      <div className="section">
        <h3>Graphics & Camera</h3>
        <div className="set-row"><label>Graphics quality</label><div className="row"><Opt k="quality" v="low" label="Low" /><Opt k="quality" v="medium" label="Medium" /><Opt k="quality" v="high" label="High" /></div></div>
        <div className="set-row"><label>Batting camera</label><div className="row"><Opt k="camera" v="broadcast" label="Broadcast" /><Opt k="camera" v="close" label="Close" /><Opt k="camera" v="high" label="High" /></div></div>
        <div className="set-row"><label>Camera smoothing</label><input type="range" min={0} max={1} step={0.05} value={settings.cameraSmoothing} onChange={(e) => update({ cameraSmoothing: +e.target.value })} /></div>
        <div className="set-row"><label>Pitch marker (shows where the ball will land)</label><div className="row"><Opt k="pitchMarker" v="auto" label="Easy/Medium only" /><Opt k="pitchMarker" v="on" label="Always" /><Opt k="pitchMarker" v="off" label="Off" /></div></div>
        <div className="set-row"><label>See the bowler's plan before the ball (target + delivery type during run-up)</label><div className="row"><Opt k="bowlerReveal" v={true} label="On" /><Opt k="bowlerReveal" v={false} label="Off" /></div></div>
        <div className="set-row"><label>Bowling aim: show predicted ball path</label><div className="row"><Opt k="aimPath" v={true} label="On" /><Opt k="aimPath" v={false} label="Off" /></div></div>
        <div className="set-row"><label>On-screen control hints</label><div className="row"><Opt k="showHints" v={true} label="On" /><Opt k="showHints" v={false} label="Off" /></div></div>
      </div>
      <div className="section">
        <h3>Audio</h3>
        <div className="set-row"><label>Sound volume ({Math.round(settings.volume * 100)}%)</label><input type="range" min={0} max={1} step={0.05} value={settings.volume} onChange={(e) => update({ volume: +e.target.value })} /></div>
        <div className="set-row"><label>Commentary volume ({Math.round(settings.commentaryVolume * 100)}%)</label><input type="range" min={0} max={1} step={0.05} value={settings.commentaryVolume} onChange={(e) => update({ commentaryVolume: +e.target.value })} /></div>
        <div className="set-row"><label>Spoken commentary (browser voice)</label><div className="row"><Opt k="speech" v={true} label="On" /><Opt k="speech" v={false} label="Off (text only)" /></div></div>
      </div>
      {!compact && (
        <div className="section">
          <h3>Default difficulty</h3>
          <div className="row">{(['easy', 'medium', 'hard', 'pro'] as Difficulty[]).map((d) => <Opt key={d} k="difficulty" v={d} label={d === 'pro' ? 'Professional' : d[0].toUpperCase() + d.slice(1)} />)}</div>
        </div>
      )}
      <div className="section">
        <h3>Keyboard controls <button className="btn sm" style={{ marginLeft: 12 }} onClick={() => update({ keys: DEFAULT_KEYS })}>Reset defaults</button></h3>
        {ACTION_GROUPS.map((g) => (
          <div key={g.title} style={{ marginBottom: 12 }}>
            <div style={{ color: 'var(--muted)', fontSize: 12, letterSpacing: 1, margin: '8px 0 4px', textTransform: 'uppercase' }}>{g.title}</div>
            <div className="key-grid">
              {g.actions.map((a) => (
                <div className="key-row" key={a}>
                  <span>{ACTION_LABELS[a]}</span>
                  <button className={`kbd ${listen === a ? 'listen' : ''}`} onClick={() => setListen(a)}>{listen === a ? 'press a key…' : settings.keys[a].map(keyLabel).join(' / ')}</button>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </>
  );
}

export function SettingsScreen() {
  const setScreen = useGame((s) => s.setScreen);
  return (
    <div className="page">
      <div className="page-head"><h2>Game <span>Settings</span></h2><button className="btn gold" onClick={() => setScreen('menu')}>Done</button></div>
      <SettingsPanel />
    </div>
  );
}
