# DukaanBench

**DukaanBench** is an AI kirana benchmark: a 30-day Indian shop simulation where humans can play the counter, and frontier models are tested on the same fixed neighborhood world.

The fictional test shop is **Shree Shyam Bhandar** on Nehru Colony School Road. One JSON plan per day. Real customers. Real stockouts. Real trust.

The core questions are simple:

> Can you make profit without losing customer trust?

> Can an AI run this kirana for 30 days?

## Current Status

- Human-playable 30-day shop simulation.
- Name-based player sessions with separate saved runs.
- Fastify backend owns all authoritative game runs.
- SQLite stores runs, day results, inventory snapshots, customer visits, customer memory, player actions, marketing, AI decisions, and session data.
- Vite frontend renders the shop, dashboard, item popups, live day simulation, and day reports.
- Optional OpenRouter day-context generation adds AI-written environment insight. Gameplay math does not depend on the LLM.
- AI replay benchmarks exist as backend-run heuristic agents.

## Player Loop

1. Enter a player name.
2. Buy opening stock with the starting cash.
3. Read environment signals such as day, weather, customer rhythm, and market pressure.
4. Simulate the shop day.
5. Review what customers asked for, what was sold, what was missed, and how inventory moved.
6. Click items to inspect trends and add stock or offers.
7. Choose marketing and khata actions.
8. Open the next day and repeat until Day 30.

## Main Concepts

| Concept | Meaning |
| --- | --- |
| Cash | Spendable money for buying inventory and marketing. Starts at ₹3,000. |
| Trust | Customer confidence. Essentials stockouts hurt it most. |
| Inventory | Current stock by item, including perishability and missed demand. |
| Khata | Credit ledger. Sales can happen on khata, but cash is delayed. |
| Marketing | Campaigns that can increase demand, but only score well if the store can serve the promoted demand. |
| Environment Signals | Weekday, date, weather, customer rhythm, market pressure, and shop memory that help the player reason about tomorrow. |
| Rewards | Daily score buckets: service, inventory, money, relationships, marketing, operations, and penalties. |

## Playable Products

| Item | Unit | Buy Cost | Sell Price | Margin | Storage | Shelf Life |
| --- | --- | ---: | ---: | ---: | --- | ---: |
| Milk | L | ₹42 | ₹50 | ₹8 | Fridge | 2 days |
| Bread | packs | ₹24 | ₹30 | ₹6 | Shelf | 3 days |
| Eggs | eggs | ₹7 | ₹10 | ₹3 | Shelf | 7 days |
| Maggi | packets | ₹11 | ₹15 | ₹4 | Shelf | 60 days |
| Chips | packets | ₹15 | ₹20 | ₹5 | Shelf | 45 days |
| Cold Drinks | bottles | ₹20 | ₹30 | ₹10 | Fridge | 30 days |
| Bananas | kg | ₹35 | ₹50 | ₹15 | Counter | 2 days |

## Documentation Map

Start here:

- [Player Guide](docs/player-guide.md) explains how to play and how to read the UI.
- [Game Systems](docs/game-systems.md) explains demand, inventory, perishability, khata, marketing, and scoring.
- [Architecture](docs/architecture.md) explains frontend, backend, database, sessions, simulation flow, and AI replay.
- [API Reference](docs/api-reference.md) documents the REST and OpenEnv-style APIs.
- [Deployment](docs/deployment.md) explains local development, production service setup, and the current GCP VM path.
- [Glossary](docs/glossary.md) defines important gameplay and technical terms.

Historical planning notes:

- [Case Simulator Architecture](docs/case-simulator-architecture.md)
- [Backend, AI, and Marketing Plan](docs/kirana-backend-ai-marketing-plan.md)
- [Original Episode Spec](doc.md)
- [Original Implementation Plan](plan.md)

## Local Development

Requirements:

- Node.js 22 or newer.
- npm.

Install dependencies:

```bash
npm install
```

Create optional local environment config:

```bash
cp .env.example .env
```

Run frontend and backend together:

```bash
npm run dev
```

The frontend runs on:

```text
http://127.0.0.1:5175
```

The backend runs on:

```text
http://127.0.0.1:8787
```

Build:

```bash
npm run build
```

Production start:

```bash
npm run start
```

`npm run start` uses Node's experimental SQLite support:

```text
node --experimental-sqlite --import tsx server/index.ts
```

## Environment Variables

| Variable | Required | Purpose |
| --- | --- | --- |
| `OPENROUTER_API_KEY` | No | Enables AI-generated day context. |
| `OPENROUTER_MODEL` | No | Defaults to `z-ai/glm-5.2`. |
| `KIRANA_DB_PATH` | No | SQLite file path. Defaults to `data/kirana.sqlite`. |
| `KIRANA_SERVER_HOST` | No | Backend bind host. Defaults to `127.0.0.1`. |
| `KIRANA_SERVER_PORT` | No | Backend port. Defaults to `8787`. |
| `KIRANA_STATIC_ROOT` | No | Static build folder. Defaults to `dist`. |
| `KIRANA_SERVE_STATIC` | No | Set to `false` to disable backend static serving. |
| `KIRANA_COOKIE_SECURE` | No | Set to `true` when serving over HTTPS. |

## Repository Shape

```text
server/
  Fastify API, SQLite schema/migrations, run store, player sessions, marketing engine

src/
  Frontend controller, UI, renderer, game simulation, scoring, constants, assets, types

docs/
  Product, player, architecture, API, and deployment documentation
```

## Current Deployment

The current live VM deployment is served by nginx in front of the Fastify backend.

```text
http://34.14.197.72/
```

The VM service is named:

```text
kirana-game
```

The production SQLite database is:

```text
/var/lib/kirana-game/kirana.sqlite
```

The app directory is:

```text
/opt/kirana-game
```

