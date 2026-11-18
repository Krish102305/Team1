import { useEffect } from 'react';
import { useGame } from './store/gameStore';
import { MainMenu } from './components/ui/MainMenu';
import { SettingsScreen } from './components/ui/Settings';
import { SetupScreen } from './components/ui/Setup';
import { XIScreen } from './components/ui/XISelect';
import { TossScreen } from './components/ui/Toss';
import { MatchScreen } from './components/ui/MatchScreen';
import { ResultScreen } from './components/ui/Result';
import { ExitScreen } from './components/ui/Exit';
import { audio } from './game/Audio';
import { PoseLab } from './components/three/PoseLab';

export default function App() {
  const screen = useGame((s) => s.screen);
  const settings = useGame((s) => s.settings);
  useEffect(() => {
    audio.setVolume(settings.volume);
    audio.commentaryVolume = settings.commentaryVolume;
    audio.speech = settings.speech;
  }, [settings]);
  // dev shortcut: ?quick=1[&bowl=1][&stadium=id][&time=night][&overs=2] jumps straight into a match
  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    if (q.get('quick') !== '1') return;
    const st = useGame.getState();
    st.setConfig({
      userTeamId: 'IND', aiTeamId: 'AUS', overs: Number(q.get('overs') ?? 2), format: 'Custom', difficulty: 'medium',
      stadiumId: q.get('stadium') ?? 'intl', timeOfDay: (q.get('time') as 'day' | 'evening' | 'night') ?? 'day',
      userXI: st.setup.userXI, aiXI: st.setup.aiXI, userBatsFirst: q.get('bowl') !== '1', tossText: 'Quick test match.',
    });
    st.setScreen('match');
  }, []);
  useEffect(() => {
    const unlock = () => audio.ensure();
    window.addEventListener('pointerdown', unlock);
    window.addEventListener('keydown', unlock);
    return () => { window.removeEventListener('pointerdown', unlock); window.removeEventListener('keydown', unlock); };
  }, []);
  if (new URLSearchParams(window.location.search).has('poselab')) return <PoseLab />;
  switch (screen) {
    case 'menu': return <MainMenu />;
    case 'settings': return <SettingsScreen />;
    case 'setup': return <SetupScreen />;
    case 'xi': return <XIScreen />;
    case 'toss': return <TossScreen />;
    case 'match': return <MatchScreen />;
    case 'result': return <ResultScreen />;
    case 'exit': return <ExitScreen />;
  }
}
