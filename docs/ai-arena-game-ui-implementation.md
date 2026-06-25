# AI Arena Game UI Implementation

This document locks the v1 implementation contract for the displayable AI Arena game UI.

## Goal

Build `/arena` as a watchable AI replay theatre for Shree Shyam Bhandar.

The experience should look like a polished arcade management game:

```text
top HUD
  -> customer service loop | AI kiosk | racks + conveyor
  -> action cards | thought stream | result metrics | reward breakdown
```

The human gameplay UI remains unchanged.

## Data Source

The arena viewer uses the first-class AI Arena endpoints for live model runs:

```text
GET /api/arena/models
POST /api/arena/runs
GET /api/arena/runs/:arenaId
POST /api/arena/runs/:arenaId/resume
GET /api/arena/replays?status=complete
GET /api/arena/scoreboard
GET /api/ai-runs/:runId
```

The higher-level Arena API is used instead of raw OpenEnv because the viewer needs
model ids, rationale, validation retry/fallback state, latency, and saved decision
records. Arena jobs are persisted in SQLite, so an interrupted long model run can be
resumed by `arenaId` instead of being lost with server memory. The raw OpenEnv endpoints
remain available for external agents. Both paths use the same backend state and
simulation step.

Completed day `timeline`, `decisions`, `summary`, and `observation` records are
converted into replay events. No hidden simulator truth is invented in the UI.

Supported source objects:

- `RunObservation`
- `DayLog`
- `DayResult`
- `CustomerVisit`
- `InventoryMovement`
- `RewardBreakdown`
- `MarketingPerformance`
- stored AI decisions
- persisted Arena job/run summaries
- provider response metadata when available

## Displayed Metrics

Only existing or derivable metrics may appear:

- day and max days
- cash
- trust and trust change
- cumulative score and last day reward
- weather
- events
- visits
- sold units
- revenue
- missed units
- stockouts
- profit
- khata added
- marketing ROI
- reward buckets
- AI model
- AI rationale
- latency, retry count, and validation/error state when available

Do not show unsupported metrics such as percentile rank, synthetic efficiency, or invented forecast percentages.

Replay CTAs must respect completion state:

- show `Replay 30-day Run` only when `status=complete` and `daysCompleted=30`
- show incomplete smoke tests as history, not as benchmark-ready replays
- use `GET /api/arena/scoreboard` for model comparison tables instead of hard-coded docs or frontend-only math

## Visual Contract

### First-Visit Intro

The first time a viewer opens `/arena`, show a short intro before starting the backend replay.

The intro answers three questions:

- What is this? A 30-day AI kirana replay.
- What does the AI see? Fixed neighborhood context, weather, events, inventory, customers, trust, cash, khata, perishables, and marketing.
- What are we proving? The model's JSON plan is tested by simulated customers and scored by the real backend.

The intro can be forced for QA with:

```text
/arena?intro=1
```

After the viewer starts the replay, store `shree-shyam-arena-intro-seen=1` in local storage so repeat visits go straight to the arena.

### Fixed Neighborhood Context

Arena comparisons use one fictional, fixed catchment profile:

```text
Nehru Colony School Road
```

This profile lives in:

```text
src/constants/neighborhood.ts
```

Every model receives the same neighborhood facts through the Arena observation:

- mixed residential school-road kirana catchment
- 700m catchment radius
- two nearby residential societies
- a 900-student school
- a 2,500-passersby connector road
- segment behavior for families, students, commuters, regulars, and walk-ins

The viewer also sees this context in the first-visit intro, model-selection modal,
and idle dashboard. This makes demand reasoning visible and keeps model judgement
fair: a better run should come from using the same signals better, not from
receiving different hidden world data.

### Top HUD

The HUD shows:

- store title
- day/max days
- cash
- trust
- score
- weather
- event

### Arena Stage

The stage is a fixed wide Phaser diorama (`1600x390`) with three zones:

1. **Customer Service Loop**: one active customer enters, asks, receives items, reacts, then exits.
2. **AI Kiosk**: robot/shopkeeper receives and validates demand. The current model is rendered on the apron by code.
3. **Racks + Conveyor**: rack/fridge sprites show stock; product sprites move along a conveyor toward the counter.

Customer loop rules:

- Customers are not permanently pre-rendered as a queue.
- Each visit is replayed as a mini scene: entry, speech-bubble demand, AI handoff, fulfillment marks, feedback, and exit.
- Demand bubbles remain visible while the order is being served.
- Product sprites move from shelf/fridge to conveyor, then to the AI kiosk, then to the customer.
- Fulfilled items receive green check marks inside the demand bubble.
- Partial products receive an amber `PART` marker instead of switching from fulfilled to missed.
- Missed items receive warning marks inside the demand bubble.
- Cash, trust, visits, sold units, missed units, revenue, and khata update as customer visits complete.
- Fulfilled or partial customers exit with the `customer-jhola-full.png` sprite to signal they are leaving with purchased goods.
- Missed customers exit with a warning/miss reaction instead of a filled bag.

Day phase rules:

- The day begins without a blocking overlay so customer transactions remain visible.
- A compact top-right live status badge shows ready/live/complete state, day number, phase, weather, and event.
- Afternoon and evening overlays are inserted from the actual visit count, not clock time.
- Phase changes use PNG overlays so the shop feels like one continuous environment moving through the day.

### Decision Console

Above the stage, the viewer shows the decision console:

- AI Actions
- AI Thought Stream
- Today's Result
- Reward Breakdown

This lets the viewer read the AI's plan and expected/actual backend metrics
before watching the shop-floor replay.

### AI Operator Bar

Below the stage and replay controls, the viewer shows an operator bar:

- selected AI model
- current run profile
- max days
- live job status and completed-day count
- `Choose AI Model` button
- `Start Live Run` button
- manual/auto replay mode in the bottom controls

The detailed model controls are not always visible. The `Choose AI Model` button
opens a modal/popup containing:

- model presets from `GET /api/arena/models`
- custom OpenRouter model id input
- max days control for smoke runs
- Fast live profile
- Max capability profile

Fast live uses compact observations and shorter response settings for viewability.
Max capability uses the backend max-capability endpoint with stricter schema,
medium reasoning, and a long timeout.

Manual replay is the default viewer mode. A completed day stops on its report until
the viewer presses `Next Day`. Auto mode can continue through completed days, but
must leave a clear reading pause before advancing.

### Bottom Timeline And Controls

The lower replay strip shows the day timeline and playback controls. The operator
bar sits below this strip so model selection does not interrupt the visual replay.

## Replay Events

The adapter converts each completed day into these event kinds:

- `day_started`
- `ai_scanned`
- `customer_entered`
- `demand_shown`
- `item_conveyed`
- `sale_paid`
- `khata_written`
- `stockout_missed`
- `trust_changed`
- `customer_exited`
- `metrics_changed`
- `reward_updated`
- `day_complete`

Phaser is responsible for sprite movement, tweens, conveyor motion, sale/miss popups, and low-stock visual states.

DOM/CSS is responsible for information density, controls, and panels.

## Art-First Stage Backdrop

The current arena uses a generated wide PNG backdrop:

```text
src/assets/arena/stage-backdrop.png
```

It is produced by:

```bash
node scripts/generate-arena-stage-backdrop.mjs
```

This backdrop bakes the shop environment, active customer service area, AI kiosk zone, shelves, fridge, produce area, and conveyor into one image. Phaser should only place dynamic elements on top:

- customer sprites
- AI robot sprite and model label
- product sprites moving from shelf to conveyor to counter
- demand bubbles
- sale, khata, trust, reward, and warning popups
- low-stock indicators

This keeps the arena closer to a video-game replay screen and avoids rebuilding the shop with many Phaser-drawn panels. If the visual direction changes, regenerate or replace `stage-backdrop.png` first, then adjust the sprite coordinates in `src/arena/ArenaStage.ts`.

The same script also generates viewer-effect PNGs:

- `phase-morning.png`
- `phase-afternoon.png`
- `phase-evening.png`
- `day-start-panel.png`
- `day-complete-panel.png`
- `customer-jhola-full.png`
- `score-burst-good.png`
- `score-burst-bad.png`

Dynamic numbers such as reward, profit, visits, sold units, and missed units are rendered by Phaser on top of these PNG frames so they remain truthful to backend data.

## Asset Contract

Assets live under:

```text
src/assets/arena/
```

V1 uses individual PNGs for easy replacement:

- AI robot/shopkeeper
- customer sprites
- rack modules
- fridge module
- conveyor module
- effect icons
- product sprites

The current arena art comes from a generated sprite sheet that was cropped into individual PNG assets. The source sheet is not required at runtime; Phaser imports the extracted files directly.

To regenerate the extracted assets from a new sheet:

```bash
node scripts/extract-arena-sprite-sheet.mjs /absolute/path/to/sprite-sheet.png
```

The extractor writes cropped RGBA PNGs into `src/assets/arena/` and removes the flat cream sheet background by alpha-matting near-background pixels.

There is also a deterministic placeholder generator:

```bash
node scripts/generate-arena-assets.mjs
```

Use the placeholder generator only when the sprite sheet is unavailable. It creates simpler local PNGs with the same filenames needed by the arena stage.

## Current Implementation Files

- `src/main.ts`: route switch; `/arena` dynamically imports the replay app, the existing human game route remains unchanged.
- `src/arena/ArenaApp.ts`: DOM HUD, dashboard panels, timeline, report drawer, and replay controls.
- `src/arena/ArenaStage.ts`: Phaser scene for the customer service loop, AI kiosk, racks, fridge, conveyor, sprites, popups, and tweens.
- `src/arena/arena-adapter.ts`: converts backend `DayLog` and stored AI decisions into replay days and animation events.
- `src/arena/arena-types.ts`: typed replay view model.
- `scripts/extract-arena-sprite-sheet.mjs`: crops generated sprite sheets into project assets.
- `scripts/generate-arena-stage-backdrop.mjs`: composes the art-first wide arena backdrop from the PNG asset pack.
- `scripts/generate-arena-assets.mjs`: fallback procedural asset generator.

## Browser Contract

`/arena` lets the viewer choose a model, starts a live single-model arena job,
polls for completed days, and animates each completed day from backend logs.
Saved replay shortcuts load `GET /api/ai-runs/:runId` and do not call the model again.

The route must continue to meet these constraints:

- no changes to the existing human game route
- no frontend-only scoring or simulator truth
- no unsupported HUD metrics
- model label rendered by code, not baked into the robot image
- replay report uses backend inventory movements and customer visits
- large Phaser chunk is isolated behind the dynamic `/arena` import

## V1 Limits

- Desktop/wide-screen first.
- `/arena` supports a live single-model run.
- Multi-model comparison is v2.
- True token-by-token model thought streaming is v2; v1 polls completed day traces.
- Sprite atlases are deferred until assets stabilize.
