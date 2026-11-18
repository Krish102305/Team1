import { useEffect } from 'react';
import { useGame } from '../../store/gameStore';

export function ExitScreen() {
  const setScreen = useGame((s) => s.setScreen);
  useEffect(() => {
    // Browsers only allow closing windows opened by script; try, then show a farewell screen.
    const t = setTimeout(() => { try { window.close(); } catch { /* ignore */ } }, 400);
    return () => clearTimeout(t);
  }, []);
  return (
    <div className="toss-stage">
      <h1 className="title">THANKS FOR <span>PLAYING</span></h1>
      <div className="toss-sub">You can now close this browser tab, or stop the dev server with Ctrl+C.</div>
      <button className="btn gold" onClick={() => setScreen('menu')}>Back to Main Menu</button>
    </div>
  );
}
