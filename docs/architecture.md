# Architecture

Shree Shyam Bhandar is a browser game with a backend-owned simulation state.

The browser renders the experience. The backend owns the authoritative run state and steps the simulation.

## High-Level Shape

```text
Browser
  Vite frontend
  GameController
  UIManager
  ShopRenderer
  BackendGameClient

Backend
  Fastify API
  RunStore
  SessionStore
  SQLite database
  Simulation modules from src/game
```

## Runtime Responsibilities

| Area | Responsibility |
| --- | --- |
| `src/game/GameController.ts` | Screen flow, player actions, restore/start logic, backend calls. |
| `src/ui/UIManager.ts` | DOM UI rendering, opening screen, item popups, reports, controls. |
| `src/render/ShopRenderer.ts` | Canvas/background shop visual state. |
| `src/game/DaySimulator.ts` | Runs one simulated shop day. |
| `src/game/simulation/*` | Demand planning, visits, inventory ledger, khata. |
| `src/game/scoring/ScoringEngine.ts` | Daily reward buckets and total score. |
| `src/game/progression/*` | difficulty, events, environment signals, AI day context client. |
| `server/index.ts` | Fastify routes, static serving, AI replay runner, OpenRouter call. |
| `server/run-store.ts` | SQLite persistence for runs and day data. |
| `server/session-store.ts` | Player-name sessions and run listing. |
| `server/db.ts` | SQLite schema and lightweight migrations. |

## Screen Flow

```text
Opening screen
  -> player name login
  -> opening stock purchase
  -> live day simulation
  -> evening report
  -> next-day planning
  -> repeat until Day 30
  -> final scoreboard
```

The controller stores only the active run id in browser storage. The backend decides whether that run belongs to the current player session.

## Backend-Owned Runs

The backend stores each run in `game_runs`.

Important fields:

- `id`
- `player_id`
- `player_type`
- `run_name`
- `status`
- `current_day`
- `total_score`
- `state_json`
- `version`
- timestamps

`state_json` is the serialized `GameState`. Detailed reports are also stored in normalized tables so the game can later support analytics, comparisons, AI memory, and replays.

## Player Sessions

Login is intentionally simple: the player enters a name.

The backend:

1. normalizes the name into a `name_key`
2. creates or reuses a `players` record
3. creates a `player_sessions` row
4. returns an `HttpOnly` cookie named `kirana_session`

The frontend:

1. calls `/api/me`
2. restores the player and owned runs if the cookie is valid
3. stores active run ids under a per-player localStorage key

Run isolation rule:

```text
run.player_id must equal currentSession.player.id
```

If it does not match, the backend returns `404`.

## Database Tables

| Table | Purpose |
| --- | --- |
| `players` | human, AI, and system player records. |
| `player_sessions` | hashed session tokens and expiry metadata. |
| `game_runs` | current authoritative serialized state per run. |
| `day_results` | day-level report JSON and log JSON. |
| `inventory_snapshots` | item-level opening/sold/missed/waste/closing records. |
| `customer_visits` | customer demand ledger rows. |
| `customer_state` | customer memory after each day. |
| `player_actions` | action JSON submitted for each day. |
| `marketing_campaigns` | scheduled, active, completed campaign instances. |
| `ai_players` | AI benchmark agent metadata. |
| `ai_decisions` | AI action, rationale, hash, latency, error. |
| `ai_memory_summaries` | compact memory packets for AI runs. |
| `run_events` | notable simulation events. |

SQLite uses:

```text
PRAGMA journal_mode = WAL
PRAGMA foreign_keys = ON
```

## Simulation Flow

One backend `stepRun` does this:

```text
load run
deserialize GameState
normalize player actions
validate budget and marketing selections
create new marketing instances
build active marketing effects
capture visible state before simulation
simulate one day
create DayLog
resolve campaign outcomes
advance GameState
persist day results, inventory, customers, actions, campaigns
update game_runs.state_json
return new observation
```

## Why Frontend Still Imports Game Code

The frontend uses game classes for rendering and local report reconstruction. The authoritative step happens on the backend.

Shared TypeScript modules under `src/game` and `src/types` are imported by both frontend and backend. That keeps the simulation and UI report shape aligned.

## AI Replay

AI replay is currently a backend benchmark mode.

The runner:

1. creates an AI-owned run
2. builds a compact memory packet
3. generates a heuristic action
4. stores the action and rationale
5. steps the backend run
6. repeats until completion

Invalid AI actions get a conservative fallback.

The current agent is heuristic-first. The architecture is ready for OpenRouter-driven agents, but gameplay memory should remain in SQLite.

## Static Serving

Production can serve the built frontend from the backend.

Relevant env:

```text
KIRANA_SERVE_STATIC=true by default
KIRANA_STATIC_ROOT=dist by default
```

For local dev, Vite proxies `/api` to the backend.

## Important Design Guardrails

- The backend owns the real run state.
- Browser localStorage is convenience only, never authority.
- Player-owned runs require a valid session cookie.
- OpenEnv-created runs are unowned and isolated from human runs.
- AI runs are AI-owned and isolated from human runs.
- LLM context explains environment only; it does not control gameplay math.

