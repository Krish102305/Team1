import type { GameEngine, AnimId } from './GameEngine';

export interface ActorSnap {
  x: number; y: number; z: number; rotY: number; anim: AnimId; animT: number; animP: string; animSide: number;
  moveSpeed: number; holdsBall: boolean; visible: boolean; mirror: number; playerId: string | null;
}

export interface ReplayFrame {
  t: number;
  ball: { x: number; y: number; z: number };
  ballVisible: boolean;
  actors: ActorSnap[];
  bails: { striker: number; other: number };
}

export const REPLAY_CAMS = ['Side-on', 'Behind Bowler', 'Stump Cam', 'Follow Ball', 'Aerial'] as const;

export class Replay {
  private buf: ReplayFrame[] = [];
  private clip: ReplayFrame[] = [];
  private clipImportance = 0;
  private clipVersion = -1;
  private acc = 0;
  active = false;
  t = 0;
  speed = 1;
  cam = 0;
  private engineVersion = 0;

  capture(e: GameEngine, h: number) {
    if (e.phase === 'runUp' && e.phaseT <= h * 1.5) { this.buf = []; this.acc = 0; }
    this.acc += h;
    if (this.acc < 1 / 30 && this.buf.length > 0) return;
    this.acc = 0;
    if (this.buf.length > 30 * 40) return;
    this.buf.push({
      t: e.t,
      ball: { ...e.ball.p },
      ballVisible: e.ballMode !== 'hidden',
      actors: e.actors.map((a) => ({ x: a.x, y: a.y, z: a.z, rotY: a.rotY, anim: a.anim, animT: a.animT, animP: a.animP, animSide: a.animSide, moveSpeed: a.moveSpeed, holdsBall: a.holdsBall, visible: a.visible, mirror: a.mirror, playerId: a.playerId })),
      bails: { ...e.bails },
    });
  }

  keep(e: GameEngine, importance: number) {
    // capture continues a little after the dead ball; we snapshot the buffer reference and trim later
    this.clip = this.buf;
    this.clipImportance = importance;
    this.clipVersion = e.actorsVersion;
    this.engineVersion = e.actorsVersion;
  }

  hasClip() { return this.clip.length > 10; }

  start(e: GameEngine) {
    if (!this.hasClip() || e.actorsVersion !== this.clipVersion) return false;
    this.active = true;
    this.t = 0;
    this.speed = this.clipImportance >= 3 ? 0.5 : 1;
    this.cam = this.clipImportance >= 3 ? 3 : 0;
    return true;
  }

  stop() { this.active = false; }
  get duration() { return this.clip.length ? this.clip[this.clip.length - 1].t - this.clip[0].t : 0; }

  update(dt: number) {
    if (!this.active) return;
    this.t += dt * this.speed;
    if (this.t > this.duration + 0.6) this.stop();
  }

  frame(): ReplayFrame | null {
    if (!this.clip.length) return null;
    const t0 = this.clip[0].t + Math.min(this.t, this.duration);
    let i = 1;
    while (i < this.clip.length - 1 && this.clip[i].t < t0) i++;
    const a = this.clip[i - 1], b = this.clip[i];
    const f = b.t > a.t ? Math.min(1, Math.max(0, (t0 - a.t) / (b.t - a.t))) : 0;
    const L = (x: number, y: number) => x + (y - x) * f;
    return {
      t: t0,
      ball: { x: L(a.ball.x, b.ball.x), y: L(a.ball.y, b.ball.y), z: L(a.ball.z, b.ball.z) },
      ballVisible: b.ballVisible,
      actors: b.actors.map((s, k) => {
        const p = a.actors[k] ?? s;
        let dr = s.rotY - p.rotY;
        while (dr > Math.PI) dr -= Math.PI * 2;
        while (dr < -Math.PI) dr += Math.PI * 2;
        return { ...s, x: L(p.x, s.x), y: L(p.y, s.y), z: L(p.z, s.z), rotY: p.rotY + dr * f, animT: s.anim === p.anim ? L(p.animT, s.animT) : s.animT };
      }),
      bails: b.bails,
    };
  }
}
