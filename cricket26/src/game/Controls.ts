import type { GameEngine, InputAction } from './GameEngine';

/** Maps physical keys to game actions using the user's bindings and feeds the engine. */
export class Controls {
  private engine: GameEngine | null = null;
  private keys: Record<InputAction, string[]>;
  onPause: () => void = () => {};
  onReplayKey: (code: string) => boolean = () => false;

  constructor(keys: Record<InputAction, string[]>) { this.keys = keys; }

  setKeys(keys: Record<InputAction, string[]>) { this.keys = keys; }
  attach(e: GameEngine) {
    this.engine = e;
    window.addEventListener('keydown', this.down);
    window.addEventListener('keyup', this.up);
    window.addEventListener('blur', this.blur);
  }
  detach() {
    window.removeEventListener('keydown', this.down);
    window.removeEventListener('keyup', this.up);
    window.removeEventListener('blur', this.blur);
    this.engine = null;
  }

  private actionsFor(code: string): InputAction[] {
    const out: InputAction[] = [];
    for (const [a, ks] of Object.entries(this.keys) as [InputAction, string[]][]) if (ks.includes(code)) out.push(a);
    return out;
  }

  private down = (ev: KeyboardEvent) => {
    const e = this.engine;
    if (!e) return;
    const target = ev.target as HTMLElement | null;
    if (target && (target.tagName === 'INPUT' || target.tagName === 'SELECT')) return;
    const acts = this.actionsFor(ev.code);
    if (acts.length || ev.code === 'Space' || ev.code.startsWith('Arrow')) ev.preventDefault();
    if (ev.repeat) return;
    if (e.replay.active) { if (this.onReplayKey(ev.code)) return; }
    if (acts.includes('pause')) { this.onPause(); return; }
    if (e.paused) return;
    for (const a of acts) e.keyDown(a);
  };
  private up = (ev: KeyboardEvent) => {
    const e = this.engine;
    if (!e) return;
    for (const a of this.actionsFor(ev.code)) e.keyUp(a);
  };
  private blur = () => {
    const e = this.engine;
    if (!e) return;
    for (const a of [...e.input.held]) e.keyUp(a);
  };
}
