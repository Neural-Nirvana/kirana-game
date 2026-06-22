# AI Arena Game UI Implementation

This document locks the v1 implementation contract for the displayable AI Arena game UI.

## Goal

Build `/arena` as a watchable AI replay theatre for Shree Shyam Bhandar.

The experience should look like a polished arcade management game:

```text
top HUD
  -> customer queue | AI kiosk | racks + conveyor
  -> action cards | thought stream | result metrics | reward breakdown
```

The human gameplay UI remains unchanged.

## Data Source

V1 starts a fast heuristic AI benchmark through the existing backend endpoint:

```text
POST /api/ai-runs
```

The returned `timeline`, `decisions`, `summary`, and `observation` are converted into replay events. No hidden simulator truth is invented in the UI.

Supported source objects:

- `RunObservation`
- `DayLog`
- `DayResult`
- `CustomerVisit`
- `InventoryMovement`
- `RewardBreakdown`
- `MarketingPerformance`
- stored AI decisions

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

## Visual Contract

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

The stage is a fixed wide Phaser diorama (`1280x360`) with three zones:

1. **Customer Queue**: customer sprites line up with demand bubbles.
2. **AI Kiosk**: robot/shopkeeper receives and validates demand. The current model is rendered on the apron by code.
3. **Racks + Conveyor**: rack/fridge sprites show stock; product sprites move along a conveyor toward the counter.

### Bottom Console

The bottom DOM console shows:

- AI Actions
- AI Thought Stream
- Today's Result
- Reward Breakdown
- Day Timeline
- playback controls

## Replay Events

The adapter converts each completed day into these event kinds:

- `customer_entered`
- `demand_shown`
- `ai_scanned`
- `item_conveyed`
- `sale_paid`
- `khata_written`
- `stockout_missed`
- `trust_changed`
- `reward_updated`
- `day_complete`

Phaser is responsible for sprite movement, tweens, conveyor motion, sale/miss popups, and low-stock visual states.

DOM/CSS is responsible for information density, controls, and panels.

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
- `src/arena/ArenaStage.ts`: Phaser scene for the customer queue, AI kiosk, racks, fridge, conveyor, sprites, popups, and tweens.
- `src/arena/arena-adapter.ts`: converts backend `DayLog` and stored AI decisions into replay days and animation events.
- `src/arena/arena-types.ts`: typed replay view model.
- `scripts/extract-arena-sprite-sheet.mjs`: crops generated sprite sheets into project assets.
- `scripts/generate-arena-assets.mjs`: fallback procedural asset generator.

## Browser Contract

`/arena` starts a heuristic run through `POST /api/ai-runs`, then replays the completed timeline one day at a time.

The route must continue to meet these constraints:

- no changes to the existing human game route
- no frontend-only scoring or simulator truth
- no unsupported HUD metrics
- model label rendered by code, not baked into the robot image
- replay report uses backend inventory movements and customer visits
- large Phaser chunk is isolated behind the dynamic `/arena` import

## V1 Limits

- Desktop/wide-screen first.
- `/arena` defaults to heuristic replay.
- LLM model picker and multi-model comparison are v2.
- Live-as-model-thinks playback is v2.
- Sprite atlases are deferred until assets stabilize.
