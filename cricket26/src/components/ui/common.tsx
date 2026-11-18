import { TEAM_MAP } from '../../data/teams';

export function TeamBadge({ teamId, size = 64 }: { teamId: string; size?: number }) {
  const t = TEAM_MAP[teamId];
  return (
    <span className="badge" style={{ width: size, height: size, fontSize: size * 0.34, background: `conic-gradient(from 210deg, ${t.primary} 0 50%, ${t.secondary} 50% 62%, ${t.primary} 62% 100%)` }}>
      {t.short}
    </span>
  );
}

export function ratingColor(r: number) {
  return r >= 85 ? '#2ee59d' : r >= 75 ? '#b5e655' : r >= 65 ? '#ffc72c' : r >= 50 ? '#ff9f1c' : '#ff6b6b';
}

export function Rating({ v }: { v: number }) {
  return <span className="rating" style={{ background: ratingColor(v), color: '#111' }}>{v}</span>;
}

export function keyLabel(code: string) {
  return code.replace(/^Key/, '').replace(/^Digit/, '').replace('Arrow', '').replace('Left', ' L').replace('Right', ' R').replace('ShiftL', 'Shift').replace('Space', 'Space').replace('Escape', 'Esc');
}
