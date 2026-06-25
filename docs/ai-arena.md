# AI Arena

The AI Arena lets language models play full Shree Shyam Bhandar runs through the same backend simulation used by human players.

## Episode Meaning

In this game:

- 1 episode = 1 full 30-day kirana run
- 1 step = 1 in-game day
- 1 action JSON = the shopkeeper plan submitted before that day opens
- 1 reward = the score earned after that day is simulated

The arena repeats this loop until the run is complete:

```text
observation JSON
  -> model returns action JSON
  -> backend validates action
  -> backend simulates one day
  -> reward + next observation
  -> repeat until Day 30
```

For the day-level replay and analysis shape that explains previous environment, upcoming prediction, AI action, actual result, reward earned, and full state variables, see [AI Day Record](ai-day-record.md).

## Backend Contract

The arena is built on top of the OpenEnv-compatible APIs:

- `POST /api/openenv/reset`
- `POST /api/openenv/step`
- `GET /api/openenv/state`

For convenience, it also exposes first-class arena endpoints:

- `GET /api/arena/system-prompt`
- `GET /api/arena/models`
- `POST /api/arena/runs`
- `GET /api/arena/runs/:arenaId`
- `POST /api/arena/runs/:arenaId/resume`
- `GET /api/arena/replays?status=complete&model=...`
- `GET /api/arena/scoreboard`

Arena runs are unowned AI runs, so they do not mix with logged-in human player sessions.

### OpenEnv Versus Arena API

The project supports OpenEnv, but the built-in `/arena` viewer does not call the raw
OpenEnv endpoints directly.

Use OpenEnv when an external agent framework wants the simple environment loop:

```text
reset -> observation
step(action) -> reward, done, next observation
state -> current episode state
```

Use the Arena API when the product needs model metadata and replayability:

```text
start arena job -> model decision -> validation retry/fallback -> saved AI decision -> saved day log -> replay
```

Both paths use the same backend simulation state and day-step machinery. The Arena
API is a higher-level wrapper that adds OpenRouter calls, model ids, rationale text,
latency, validation errors, retries, fallback tracking, and SQLite-backed AI decision
records.

## Model Input

Each model receives a JSON packet with:

- episode metadata
- current cash, trust, score, day, weather
- environment signals and 7-day weather outlook
- item-level inventory, margin, pack size, perishability, and recent movement history
- customer memory and khata state
- active and available marketing campaigns
- recent day results and reward breakdowns
- action rules and validation feedback

The model should infer demand pressure from environment signals, previous sales, missed demand, weather, weekday, customer rhythm, marketing, and current stock.

### Previous-Day Context

The Arena gives models summarized run memory, not a raw transcript of every prior
prompt and response.

- Compact observations include the last `3` day summaries.
- Full observations include the last `5` day summaries.
- Item rows include recent movement for the same recent window.
- The backend also persists full observation snapshots in `ai_memory_summaries`
  for audit and future memory-packet work.

Recent day summaries include day reward, cash, trust, profit, missed demand by SKU,
stockout count, trust breakdown, and marketing score. The current observation also
includes active/scheduled campaigns, customer khata state, at-risk customers, current
stock, perishability, weather, and the fixed neighborhood profile.

This is deliberate: models should reason from recent evidence and environment
signals without receiving a hidden demand answer key or an unbounded transcript.

## Required Model Output

The model must return only JSON:

```json
{
  "action": {
    "orders": {
      "milk": 20,
      "bread": 10
    },
    "removals": {},
    "discounts": {
      "bananas": 10
    },
    "khataReminders": ["mrs_sharma"],
    "marketingActions": [
      {
        "specId": "whatsapp_status",
        "targetProducts": ["milk", "bread", "eggs"]
      }
    ],
    "cashReserve": 600,
    "fridgeAllocation": {
      "milk": 60,
      "cold_drinks": 30,
      "buffer": 10
    }
  },
  "rationale": "Short reason for the decision."
}
```

The backend sanitizes obvious formatting mistakes, but still rejects invalid plans such as over-budget orders or invalid marketing targets.

## Validation And Retry

For LLM arena runs:

1. The model gets one normal attempt.
2. If the action is invalid, the backend sends validation feedback and gives one retry.
3. If the retry is still invalid, the backend uses a conservative fallback action.

The validator also checks action/rationale consistency. This matters because several models produced good business prose but failed to encode the executable action. The backend now rejects and retries when:

- the rationale says to order items that are missing from `action.orders`
- the rationale says to run a marketing campaign or promotion, but `action.marketingActions` is empty or missing the named campaign
- the rationale says to send khata/payment reminders, but `action.khataReminders` is empty while customers have khata balances
- the rationale says to discount an item, but `action.discounts` has no positive discount for that item

The simulator executes the JSON only. Rationale text cannot create orders, campaigns, reminders, or discounts.

Discount validation is sentence-scoped so “No shelf discounts today” does not accidentally attach later item names to a discount claim. The arena also normalizes common LLM discount formats such as `"10%"`, `{ "percent": 10 }`, or `{ "offerPct": 10 }` into numeric action values before validation.

Campaign validation is also sentence-scoped. Mentions of an already active or
scheduled campaign should not be treated as a new same-day campaign action unless
the rationale clearly says the model is launching, selecting, scheduling, or using
that campaign today. This distinction matters for delayed campaigns such as
`whatsapp_status`, `school_combo`, and `recovery_call`.

Every decision is stored in SQLite:

- model
- observation hash
- chosen action JSON
- rationale
- latency
- provider, transport, prompt version, config snapshot, seed, and world version
- token usage, finish reason, response id, and empty-content flag when the provider returns them
- validation error type, retry count, fallback flag, and raw error context when relevant
- day score through the run timeline

Arena jobs themselves are also stored in SQLite. A job created by `POST /api/arena/runs`
can be inspected after a server restart with `GET /api/arena/runs/:arenaId` and continued
with `POST /api/arena/runs/:arenaId/resume`. Resume starts from the latest persisted AI
run day, not from browser memory.

## OpenRouter Integration

The arena uses OpenRouter when `OPENROUTER_API_KEY` is configured. Fast/default
profiles can still use Chat Completions, but max-capability OpenRouter runs now
prefer the Responses API by default because it is safer for long reasoning jobs
and persisted replay evaluation. Requests can still set `transport` to
`chat_completions` or `responses` for compatibility tests.

By default, it requests JSON-schema structured output with:

```json
{
  "response_format": {
    "type": "json_schema",
    "json_schema": {
      "name": "kirana_arena_action",
      "strict": true,
      "schema": {}
    }
  }
}
```

If a provider rejects structured output and `requireJsonSchema` is false, the arena retries without `response_format` and parses the returned JSON text.

For Responses API models, the backend sends `instructions`, compact JSON `input`,
`max_output_tokens`, `reasoning`, and `text.format`. The Responses path uses an
OpenAI-compatible strict schema variant for the validated GPT 5.x family, enables
response healing for JSON modes, and does not force `provider.require_parameters`
because that can prevent OpenRouter from finding a valid Responses endpoint. Other
max-capability OpenRouter models, including Gemini 3.1 Pro and Grok 4.3, default
to Responses `json_object` plus backend validation unless strict Responses schema
compatibility has been proven for that provider.

Exact model IDs are passed through to OpenRouter. Use `GET /api/arena/models` to fetch live hints for model families such as Kimi, GLM, DeepSeek, and Flash when OpenRouter is reachable.

## Start An Arena Run

Heuristic smoke test:

```bash
curl -s -X POST http://127.0.0.1:8787/api/arena/runs \
  -H 'Content-Type: application/json' \
  -d '{"mode":"heuristic","maxDays":30}'
```

OpenRouter run:

```bash
curl -s -X POST http://127.0.0.1:8787/api/arena/runs \
  -H 'Content-Type: application/json' \
  -d '{
    "mode": "llm",
    "models": ["z-ai/glm-5.2"],
    "maxDays": 30,
    "temperature": 0.25
  }'
```

DeepSeek V4 Flash smoke test:

```bash
curl -s -X POST http://127.0.0.1:8787/api/arena/deepseek-flash-runs \
  -H 'Content-Type: application/json' \
  -d '{"maxDays": 1}'
```

The DeepSeek Flash route uses a compact observation, no explicit reasoning request, JSON-schema action output, 1000 output tokens, and a 90-second model timeout. This profile is designed for fast daily action generation rather than long-form strategic analysis.

Max-capability comparison run:

```bash
curl -s -X POST http://127.0.0.1:8787/api/arena/max-capability-runs \
  -H 'Content-Type: application/json' \
  -d '{
    "models": [
      "z-ai/glm-5.2",
      "deepseek/deepseek-v4-flash",
      "google/gemma-4-26b-a4b-it"
    ],
    "maxDays": 30
  }'
```

The max-capability route uses compact observations, 16000 output tokens, and a
15-minute model timeout. For OpenRouter models, it defaults to the Responses API.
The validated GPT 5.x family keeps strict schema output; other providers use
Responses `json_object` with backend validation/retry. Chat Completions runs still
ask OpenRouter for provider parameter enforcement when strict schema is requested.
This is the balanced comparison profile when reliability matters more than raw
latency, while still keeping token cost visible in the persisted decision metadata.

The response includes an `arenaId`. Poll it:

```bash
curl -s http://127.0.0.1:8787/api/arena/runs/<arenaId>
```

Resume an interrupted persisted job:

```bash
curl -s -X POST http://127.0.0.1:8787/api/arena/runs/<arenaId>/resume
```

All Arena jobs store the exact comparison config: model id, provider, transport, prompt
version, observation mode, response mode, reasoning mode, timeout, max tokens,
temperature, schema flags, seed, and world version. Benchmark runs default to the fixed
seed `20260624` unless a `seed` value is supplied in the start request.

## Visual Replay Route

The game also ships a displayable replay UI at:

```text
/arena
```

This route is a Phaser + DOM visualization layer. It can start a live single-model
arena job through `POST /api/arena/runs`, poll `GET /api/arena/runs/:arenaId`, fetch
completed day logs through `GET /api/ai-runs/:runId`, and animate days as they become
available.

The viewer also keeps local shortcuts to recent AI `runId`s. Replaying a saved run
does not call the model again; it rebuilds the animation from SQLite-stored AI
decisions and day logs.

The prominent `Replay 30-day Run` shortcut is shown only when a saved AI replay has
`status=complete` and `daysCompleted=30`. Incomplete smoke tests remain visible as
history, but are not presented as comparable benchmark replays.

The visual route is intentionally not a second simulator. It only shows existing or derivable backend values: cash, trust, score, weather, events, visits, sold units, revenue, missed units, khata, marketing ROI, reward buckets, customer visits, inventory movements, and AI decision metadata.

Key files:

- `src/arena/ArenaApp.ts`
- `src/arena/ArenaStage.ts`
- `src/arena/arena-adapter.ts`
- `docs/ai-arena-game-ui-implementation.md`

## Scoring Goal

Models should optimize long-horizon store health:

- service: fulfill demand, especially trust-sensitive essentials
- inventory: avoid stockouts and waste
- money: build operating profit and cash resilience
- relationships: keep repeat customers and handle khata
- marketing: create demand only when the store can serve it
- operations: make clean, sensible daily decisions

Recent observations include `trustBreakdown`. Models should treat it as the causal explanation for shop reputation movement: stockout severity, essential service, named customer effect, and no-stockout bonus. A high-profit day can still be weak if the trust breakdown shows essential misses or named-customer damage.

Customer observations also include group/persona hints where available. Use them to distinguish household essentials, office/bulk buyers, students, snack crowds, and newly acquired customers instead of treating every repeat customer the same.

This means the best AI should sometimes keep cash aside instead of buying everything, and sometimes skip marketing when stock is not ready.

## How To Judge An AI Run

Use the generated scoreboard from `GET /api/arena/scoreboard` instead of hand-edited notes
when comparing models. Look at:

- daily reward versus cumulative score
- final business health: profit, cash, trust, regulars retained, service rate, waste, and marketing ROI
- reliability: retries, fallbacks, empty-content responses, validation errors, and average latency
- product-level service rates: whether essentials such as milk and bread were protected
- marketing discipline: whether promoted demand was served profitably or converted into stockouts

The best model is not simply the one with the highest same-day score spike. A strong run
protects trust, avoids promoted stockouts, keeps cash usable, and finishes Day 30 with a
healthy shop.

### Current Opus 4.8 Reference Run

After fixing the campaign-validation false-positive that affected earlier Opus
tests, a full `anthropic/claude-opus-4.8` run completed on 2026-06-25 with:

- reward `+1773`
- final cash `₹46,440`
- final trust `99`
- service rate `93.9%`
- profit `₹47,544`
- marketing ROI `13.1x`
- `2` validation retries
- `0` fallback days
- recorded OpenRouter cost about `$2.54`

The two retries were still active-campaign wording edge cases, not fallback days.
Treat the run as a strong current benchmark, while continuing to improve active
campaign intent detection before more expensive comparison batches.
