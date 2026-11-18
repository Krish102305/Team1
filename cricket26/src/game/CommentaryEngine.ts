import { LINES } from '../data/commentary';

export class CommentaryEngine {
  private recent: Record<string, number[]> = {};

  line(cat: string, vars: Record<string, string | number> = {}): string {
    const pool = LINES[cat];
    if (!pool || pool.length === 0) return '';
    const used = (this.recent[cat] ??= []);
    let idx = 0;
    for (let tries = 0; tries < 12; tries++) {
      idx = Math.floor(Math.random() * pool.length);
      if (!used.includes(idx)) break;
    }
    used.push(idx);
    if (used.length > Math.min(pool.length - 1, 5)) used.shift();
    return pool[idx].replace(/\{(\w+)\}/g, (_, k) => String(vars[k] ?? ''));
  }
}
