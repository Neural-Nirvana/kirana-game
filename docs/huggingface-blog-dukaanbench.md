---
title: "DukaanBench: Can AI Run an Indian Kirana for 30 Days?"
emoji: "🛒"
colorFrom: "green"
colorTo: "yellow"
sdk: "static"
tags:
  - agents
  - benchmarks
  - simulation
  - retail
  - india
  - llm
---

# DukaanBench: Can AI Run an Indian Kirana for 30 Days?

What happens when an AI is not judged by how smart it sounds, but by whether customers come back tomorrow?

DukaanBench is a benchmark disguised as a game. It asks language models to operate a small Indian kirana store for 30 simulated days. Every day, the model receives a business observation, submits a JSON action, and then the backend simulates customers, inventory movement, payments, credit, marketing effects, stockouts, waste, and trust.

The shop is fictional but fixed: Shree Shyam Bhandar, a neighborhood kirana on Nehru Colony School Road. The goal is not to recreate every detail of Indian retail. The goal is to create a serious, repeatable environment where AI agents must make operational decisions under uncertainty.

## Why Kirana?

Indian kirana stores are tiny operating systems of local commerce.

A shopkeeper is not only buying and selling goods. They are reading neighborhood rhythm, school timings, weather, festivals, salary cycles, supplier constraints, perishability, credit relationships, and customer trust. A missed packet of milk is not just a missed sale. For a regular customer, it can become a reason to try another shop.

This makes kirana a useful AI benchmark domain because it combines:

- limited cash
- uncertain demand
- perishable inventory
- high-frequency customer visits
- informal credit through khata
- local marketing
- relationship memory
- long-term trust

Most AI benchmarks test isolated answers. DukaanBench tests compounding consequences.

## The Benchmark Loop

One complete run is a 30-day episode. One step is one shop day.

Each day follows the same loop:

1. **Observe**: The model receives the current shop state, recent history, weather, event signals, inventory, cash, trust, khata exposure, marketing state, and neighborhood context.
2. **Act**: The model returns a JSON action: supplier orders, discounts, marketing campaigns, khata reminders, cash reserve, and optional fridge allocation.
3. **Validate**: The backend checks whether the JSON is parseable, affordable, executable, and consistent with the model's rationale.
4. **Simulate**: Customers arrive, ask for items, pay in cash or khata, face fulfillment or stockouts, and update trust.
5. **Score**: The backend returns reward and stores the full day record for replay.

The AI does not control customers. It controls only the shopkeeper's decisions before the day begins.

## What the AI Sees

DukaanBench intentionally gives fair planning signals without giving exact future demand.

The observation can include:

- day number and day of week
- cash, score, and trust
- current inventory and perishable risk
- recent sold and missed demand
- weather and event forecast
- customer segment pressure
- active and upcoming marketing campaigns
- khata exposure and customer memory
- neighborhood profile: societies, school, bus stop, market lane, and passersby

The model must infer what to stock and promote. A rainy school day, a hot weekend, or a festival should change its ordering strategy.

## What the AI Can Do

The action JSON can include:

- `orders`: buy stock from the wholesaler
- `discounts`: apply offers on products
- `marketingActions`: run campaigns such as chalkboard offers, WhatsApp status, school combos, or loyalty pushes
- `khataReminders`: remind customers with pending credit
- `cashReserve`: protect money for tomorrow's correction order
- `fridgeAllocation`: prioritize fridge capacity for products such as milk and cold drinks

The simulator rejects actions that exceed available cash, violate product limits, or claim plans in the rationale that are not present in the executable JSON. This matters: agent benchmarks should measure both reasoning and action reliability.

## How Runs Are Scored

DukaanBench is deliberately not a pure profit game. A model can make money and still damage the shop.

The reward breakdown includes:

- **Service**: Did customers get what they asked for?
- **Inventory**: Did the model avoid stockouts and waste?
- **Money**: Did the shop generate revenue and profit while protecting cash?
- **Relationships**: Did trust rise or fall, especially among regulars?
- **Marketing**: Did campaigns create served, profitable demand, or only promoted stockouts?
- **Operations**: Did the model execute valid, disciplined decisions?
- **Penalties**: Did it rely on fallbacks, invalid JSON, impossible plans, or brittle action/rationale mismatches?

The final health of a run is judged through multiple numbers: score, profit, final cash, trust, regulars retained, service rate, missed units, stockout incidents, waste, marketing ROI, retries, and fallbacks.

## Why the Arena Exists

Scores alone are too abstract. DukaanBench includes an AI Arena replay view where saved backend results become a watchable shop simulation.

The arena shows:

- customers entering the shop
- demand bubbles with requested items
- the AI shopkeeper serving or missing items
- cash, khata, trust, and reward changes
- day-by-day timeline
- model thought stream and action summaries
- reward breakdown after each day

The point is simple: if a model lets shelves go empty during a heatwave, the viewer should see customers leave unhappy. A benchmark becomes more legible when failures are visual.

## Early Model Results

Current internal runs show that model intelligence and business operation are not the same thing.

| Model | Reward | Final Cash | Final Trust | Profit | Sold Units | Missed Units | Notes |
|---|---:|---:|---:|---:|---:|---:|---|
| GPT 5.5 | +2294 | Rs 50,184 | 100 | Rs 51,730 | 8,153 | 212 | Strongest current run; high service, zero waste, full request/response audit |
| Gemini 3.1 Pro | +2064 | Rs 45,869 | 97 | Rs 47,506 | 7,558 | 274 | Top-tier after Responses JSON-object compatibility fix |
| Claude Opus 4.8 | +1773 | Rs 46,440 | 99 | Rs 47,544 | 7,305 | 473 | Strong premium run after campaign-validator fixes |
| Gemini 3.1 Flash Lite | +1581 | Rs 34,760 | 90 | Rs 38,848 | 6,327 | 583 | Best fast practical baseline |
| Nemotron 3 Ultra 550B | +1352 | Rs 37,904 | 70 | Rs 39,524 | 6,929 | 632 | Clean compatible-text run; zero fallbacks, weaker trust |
| Grok 4.3 | +1125 | Rs 34,353 | 29 | Rs 35,075 | 5,640 | 750 | Clean transport, weaker stockout/trust policy |
| Gemma 4 31B | +1071 | Rs 33,231 | 58 | Rs 36,875 | 5,963 | 710 | Reliable JSON, weaker service and trust preservation |

These numbers should not be read as universal model rankings. They are rankings for this environment, this prompt contract, this simulator version, and each model's compatible transport profile.

## What We Learned

The most important finding so far: the best-looking rationale is not enough.

Some models explain that they will run marketing but do not emit `marketingActions`. Some models mention products in the rationale but omit them from `orders`. Some models make cash while letting trust collapse. Some smaller models run faster and produce cleaner JSON, while larger models need careful transport and validation settings.

This is exactly why the benchmark needs:

- stored request/response pairs
- validation errors
- fallback counts
- comparable fixed seeds
- replayable day logs
- business metrics beyond reward

AI business operators should be audited like operators, not praised like essay writers.

## Why This Matters

The long-term vision is not to replace kirana owners. It is to study whether AI can become a useful operating companion for small businesses.

A real assistant for a shopkeeper would need to help answer questions like:

- What should I reorder before tomorrow?
- Which products are quietly losing sales?
- Which customers are moving away because of repeated stockouts?
- Which campaigns created demand I could actually serve?
- How much cash should I protect for essentials?
- What is likely to happen if tomorrow is rainy, hot, or school-heavy?

DukaanBench is a controlled first step toward that kind of operational intelligence.

## Current Status

DukaanBench currently includes:

- a human playable kirana simulation
- a backend-owned Fastify + SQLite simulator
- OpenEnv-shaped reset/step/state APIs
- AI Arena live runs and saved replays
- stored AI decisions and provider response metadata
- marketing-aware scoring
- trust and customer-memory systems
- a fixed fictional neighborhood profile
- a public-facing `/about` page and `/arena-2` replay interface

The next milestone is presentation: a cleaner landing page, a more watchable Arena replay loop, public leaderboard pages, and a complete Hugging Face project writeup.

## Closing

DukaanBench asks a practical question:

Can an AI run a small shop without losing the thing that matters most: customer trust?

That is the benchmark.
