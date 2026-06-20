# Kirana Backend, Database, Marketing, and AI Players Plan

> Historical planning note.
>
> Much of this plan has been implemented and evolved. For current behavior, use [Architecture](architecture.md), [API Reference](api-reference.md), [Game Systems](game-systems.md), and [Deployment](deployment.md).

## Summary

Build a DB-backed simulation architecture where the backend owns all 30-day runs for both human and AI players. Use Node + SQLite locally, expose OpenEnv-style `reset` / `step` / `state` endpoints, add marketing as a strategic action system, and store compact AI decision memory in our DB rather than relying on OpenRouter session memory.

## Key Changes

- Add a TypeScript backend using Fastify and local SQLite.
- Move authoritative run state from browser memory into SQLite-backed runs.
- Keep the existing frontend rendering model, but make simulation steps call backend APIs.
- Move `/api/llm-day-context` from Vite middleware into the backend.
- Add marketing inside the Actions section as a campaign board with cost, delay, target segment, expected return, and inventory warnings.
- Add AI replay benchmarks: AI agents play full 30-day runs in the backend, then the UI can compare score, cash, trust, stockouts, waste, marketing ROI, and decision summaries.

## Public Interfaces

### Core REST APIs

- `POST /api/runs` creates a human or AI run.
- `GET /api/runs/:runId/state` returns current observation and serialized game state.
- `POST /api/runs/:runId/step` accepts player actions and simulates the next day.
- `GET /api/runs/:runId/timeline` returns day-by-day history.
- `POST /api/ai-runs` starts an AI benchmark run.
- `GET /api/ai-runs/:runId` returns AI progress and final result.

### OpenEnv-Compatible APIs

- `POST /api/openenv/reset` returns `{ episode_id, observation, done, step_number, scores }`.
- `POST /api/openenv/step` accepts `{ episode_id, action }` and returns `{ observation, reward, done, info, scores }`.
- `GET /api/openenv/state?episode_id=...` returns current episode state.

## Data Model

Core SQLite tables:

- `game_runs`
- `day_results`
- `inventory_snapshots`
- `customer_visits`
- `customer_state`
- `player_actions`
- `marketing_campaigns`
- `ai_players`
- `ai_decisions`
- `ai_memory_summaries`
- `run_events`

## Marketing V1

- Available from Day 1 with basic campaigns, stronger campaigns unlock later.
- Day 1 campaign specs:
  - Chalkboard Offer: walk-ins/snacks, low cost, same-day effect.
  - WhatsApp Status: regulars/families, low cost, tomorrow effect.
  - School Combo: students, moderate cost, next school-day effect.
- Later unlocks:
  - Apartment Pamphlets, Festival Bundle Display, Loyalty Card, Recovery Call.
- Campaigns affect demand pressure probabilistically, never guaranteed sales.
- Campaign cost counts against cash; backend rejects actions where total order + campaign cost exceeds available cash.
- Marketing results are stored and later shown as expected vs actual return.

## AI Player Design

- V1 AI mode is Replay Benchmarks.
- Each AI agent gets the same backend observation as a human player plus reward rules and compact run memory.
- Store only decision summaries: model, agent profile, observation summary/hash, chosen action JSON, short rationale, latency/cost/error, and final day score.
- AI memory is generated from DB each day:
  - last 3 day summaries
  - customer patterns
  - active/upcoming marketing
  - unresolved inventory risks
  - cumulative score/cash/trust trends
- If an AI action is invalid, backend returns validation feedback; the agent gets one retry, then backend uses a conservative fallback action.

## Implementation Phases

1. Add backend server, SQLite schema, migration script, and dev scripts.
2. Refactor game core to serialize/deserialize `GameState` and run server-side steps.
3. Connect frontend to backend run APIs while preserving the current UI.
4. Add marketing specs, simulation effects, scoring impact, and Actions UI.
5. Add OpenEnv-compatible endpoints.
6. Add AI replay benchmark runner and comparison UI.
7. Move LLM day context generation into backend and feed it DB-generated memory packets.

## Test Plan

- Unit tests:
  - GameState serialization round-trip.
  - Backend step produces the same result shape as current simulator.
  - Marketing delay/duration effects apply on correct days.
  - Invalid over-budget actions are rejected.
  - AI fallback action is used after invalid retry.
- API tests:
  - Create run, step day 1, fetch timeline.
  - OpenEnv reset/step/state contract.
  - AI benchmark run completes 30 days.
- UI scenarios:
  - Human starts Day 1, buys opening stock, sees persisted report.
  - Marketing campaign appears in Actions and active pipeline.
  - Refresh keeps run state.
  - AI replay scoreboard compares multiple agents.
- Regression checks:
  - Existing Insights / Inventory / Actions section switching still works.
  - Existing LLM environment context still appears when configured.

## Assumptions

- First DB target is local SQLite.
- Backend becomes authoritative for both human and AI runs.
- OpenEnv support is API-compatible, not a strict dependency.
- AI players are benchmark/replay agents in v1, not visible rival shops.
- OpenRouter remains the LLM provider, but gameplay memory is owned by our DB.
