import type { GameEngine } from './GameEngine';

/** Holds the live match engine so the result screen / HUD can read it without React re-renders. */
export const session: { engine: GameEngine | null } = { engine: null };
