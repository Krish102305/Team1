# CRICKET 26 — Quick Play

A single-player 3D cricket game that runs in your browser. You pick two of ten international sides, set up a match, call the toss, then bat and bowl a full match against a computer-controlled team inside a 3D stadium.

Teams use **real current international squads** (personal, non-commercial use; player ratings are my own estimates). Stadiums and advertising brands are fictional. All 3D models, textures and sounds are generated in code, so there are no downloaded assets and no copyrighted material.

## Run it

```bash
cd cricket26
npm install
npm run dev        # opens http://localhost:5173
```

Once dependencies are installed it needs no internet connection, accounts or servers.

Other scripts:

| Command | What it does |
|---|---|
| `npm run build` | Type-check and production build (`dist/`) |
| `npm run preview` | Serve the production build |
| `npm run sim -- 20 3 medium` | Headless AI-vs-AI simulation of 3 T20s at Medium, with scoring-invariant checks |
| `npx tsx tests/userplay.ts 5 medium` | Headless match driven through the **human** input paths (keys, meter, running) |

## How to play

**Flow:** Main Menu → Quick Play → choose your team and the opponent, format (T20 / ODI / Custom 2, 5 or 10 overs), difficulty, stadium and time of day → pick your Playing XI → Toss (call heads or tails; if you win, choose to bat or bowl) → stadium intro → match → innings break → result and scorecards.

### Batting (default keys, all remappable in Settings)

Directions are **screen-relative**: A always hits to the left of the screen and D to the right. For a right-hander that means A = leg side, D = off side; for a left-hander it flips automatically (A = off side). The shot selector widget (bottom-right) shows OFF/LEG for whoever is on strike.

| Key | Action |
|---|---|
| **W / A / D** | Hit straight / screen-left / screen-right. Combine for diagonals (W+D = cover/extra-cover region for a right-hander) |
| **Q / E** | Hit fine, behind square (glance, late cut, paddle, ramp) |
| *pressing a direction* | Plays a **ground shot** in that direction, timed from the key press |
| **L** | **Lofted shot** in the direction you're holding (straight if none). Tap L just after a direction key also works |
| **Space** | Power shot in the held direction |
| **S** | Defend (also: turn back while running) |
| **Z** | Leave the ball |
| hold **Shift** | Soft hands — dab it into the gap for a quick single |
| hold **X** | Sweep family: sweep / paddle sweep / reverse sweep; with L: slog sweep, paddle scoop, ramp, reverse hit |
| hold **J** / **K** | Front foot / back foot (otherwise chosen automatically from the length) |
| **← / →** | Shuffle across the crease (make room, or get outside off) before the ball arrives |
| hold **↑** / **↓** | Charge down the pitch (turns good-length balls into half-volleys — you can be stumped) / get back in your crease |
| **R** | Run. Press again during a run to go for another |

The game chooses the actual shot (cover drive, square cut, pull, hook, flick, glance, inside-out loft, upper cut, etc. — over 30 in total) from your direction, footwork, modifiers and the ball you're facing, and the ball goes **where you aimed** (bent by timing: early drags it leg-side, late pushes it off-side). Press about a quarter-second before the ball reaches you; you'll see Perfect / Good / Early / Late. Picking a shot that doesn't suit the ball (pulling a full ball, driving a bouncer) risks edges and misses. With **Pitch marker** on (default for Easy/Medium), a ring shows where each delivery will bounce.

### Bowling

| Key | Action |
|---|---|
| Mouse, or **A/D** and **W/S** (or the arrow keys) | Move the line and length target on the pitch |
| **Q** | Change delivery type (pace bowlers: good length, full, yorker, bouncer, in/outswinger, cutters, slower ball. Spinners: stock ball, googly, top-spinner, slider, arm ball) |
| **E** | Pace variation (stock / quicker / slower) |
| **T** | Bowl over / around the wicket |
| **F** | Field setting: Auto, Attacking, Balanced, Defensive, Death |
| hold **Space** | Run in. **Release in the green zone** of the meter for an accurate delivery. Releasing too late (red) is an overstep, which is a no-ball |

You choose your bowler at the start of each over, either by clicking or by pressing the number keys.

### General

| Key | Action |
|---|---|
| **Esc** | Pause menu (resume, settings and controls, quit) |
| **V** | Replay the last highlight. During a replay: 1 = normal speed, 2 = slow motion, C = change camera, V = exit |
| **Enter** | Skip intros, walk-ins and pauses between balls |

## What's implemented

- **Rules:** six-ball overs; wides and no-balls are not legal deliveries; free hit after a no-ball; byes and leg byes; strike rotation on odd runs and at the end of each over; change of ends; a limit on overs per bowler; innings end on 10 wickets, overs used up or target reached; win, loss and tie results with the margin.
- **Dismissals:** bowled (including played on), caught (including keeper, slip, caught-and-bowled and boundary catches), LBW (pitching, impact and hitting checks, plus umpire's call), run out (direct hits and relayed throws), stumped (when you dance down the track) and hit wicket.
- **Ball physics:** fixed-timestep simulation (480 Hz) with gravity, quadratic drag, bounce, friction, rolling resistance, swing, seam and spin. Collisions are tested segment-against-box so the fast ball can't pass through the stumps.
  - **Sixes and fours:** a six is decided by the ball crossing the boundary before it bounces; a four is a ball that bounced or rolled across.
- **AI:**
  - **Bowlers** plan by match phase, difficulty and batter, with execution error.
  - **Batters** read the delivery with perception noise, weigh expected runs against dismissal risk (adjusted for personality, required rate, wickets left and free hits), aim into gaps, and time the shot with an error that depends on rating and difficulty. They never see the outcome in advance.
  - **Fielders** predict where they can intercept the ball, allowing for reaction time and acceleration. They chase, dive, catch, back up, return the ball to the right end, attempt direct hits and concede overthrows.
  - **AI running** compares how long the run takes with how soon the ball can reach the danger end.
- **Difficulty** changes shot timing windows, AI batting accuracy, AI bowling control (wides and loose balls), field placements, fielders' reactions and catching, and how bold the AI is with runs.
- **Presentation:**
  - Four distinct stadiums, with day, evening and night lighting.
  - An instanced crowd of up to about 14,000 that reacts to boundaries and wickets.
  - Floodlights, advertising boards, sight screens, a live scoreboard screen, a pavilion and the fielding circle.
  - Broadcast-style cameras: batting, bowling, ball-follow, high-ball tracking, boundary and wicket shots.
  - TV-style scorebug, event banners, contextual commentary (optionally spoken by the browser's built-in voice), synthesized sound effects, replays and full scorecards with Player of the Match.

## Architecture

```
src/
  game/                 pure TypeScript simulation (no React); runs headless in tests
    GameEngine.ts       phase state machine: intro → walk-in → ready → run-up → delivery → live → dead
    MatchManager.ts     scoring, overs, innings, extras, strike, results (single source of truth)
    BallPhysics.ts      fixed-step ball integrator, path prediction, collision helpers
    BowlingEngine.ts    delivery types, speeds, solving the release velocity to hit a target
    BattingEngine.ts    shot selection, timing windows, suitability, edges, exit velocity
    FieldingAI.ts       field sets, placement, intercept planning
    AI.ts               AI bowling plans, AI shot decisions, running thresholds
    CommentaryEngine.ts / Replay.ts / Audio.ts / Controls.ts
  data/                 teams (10 × 15 players), stadiums, shots, commentary lines
  components/three/     React Three Fiber scene, stadium builder, procedural player rigs and IK
  components/ui/        menus, setup, XI, toss, HUD, pause, innings break, result
  store/gameStore.ts    Zustand UI state + persisted settings
```

Each delivery's result is recorded through `MatchManager.record()` exactly once (an ID guard blocks duplicate scoring), and a second wicket can't be recorded on the same ball. The headless simulation checks every innings for consistency:

- batters' runs + extras = total
- bowlers' runs + byes + leg byes = total
- balls bowled = legal deliveries
- wickets recorded = wickets in the ball-by-ball history

## Known simplifications

- Players are stylized figures built from simple shapes and animated in code; they are not skinned meshes.
- Shot animations come in 12 families with directional variants, rather than one animation per shot.
- Both batters always run on the same call; there are no run mix-ups between them.
- Bowlers always bowl from the same physical end; a change of ends is shown by rotating the stadium around the pitch.
- There's no Super Over: a tie ends as "Match Tied".
- Spoken commentary uses the browser's built-in text-to-speech when it's switched on in Settings; otherwise commentary is text only.

## Dev shortcuts

`http://localhost:5173/?quick=1` starts a 2-over test match straight away. You can add any of these:

- `&bowl=1` — you bowl first
- `&stadium=classic|coastal|night|intl` — pick the venue
- `&time=night` — pick the time of day
- `&overs=5` — set the match length
- `&autoplay=1&speed=4` — the AI plays both sides at 4× speed
