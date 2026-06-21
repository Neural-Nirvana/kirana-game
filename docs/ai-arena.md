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

Arena runs are unowned AI runs, so they do not mix with logged-in human player sessions.

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

Every decision is stored in SQLite:

- model
- observation hash
- chosen action JSON
- rationale
- latency
- error, if any
- day score through the run timeline

## OpenRouter Integration

The arena uses OpenRouter chat completions when `OPENROUTER_API_KEY` is configured.

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

The max-capability route uses compact observations, strict JSON-schema output, OpenRouter provider parameter enforcement, `medium` reasoning with reasoning excluded from returned content, 16000 output tokens, and a 15-minute model timeout. This is the balanced comparison profile when latency and token cost still matter.

The response includes an `arenaId`. Poll it:

```bash
curl -s http://127.0.0.1:8787/api/arena/runs/<arenaId>
```

## Scoring Goal

Models should optimize long-horizon store health:

- service: fulfill demand, especially trust-sensitive essentials
- inventory: avoid stockouts and waste
- money: build operating profit and cash resilience
- relationships: keep repeat customers and handle khata
- marketing: create demand only when the store can serve it
- operations: make clean, sensible daily decisions

This means the best AI should sometimes keep cash aside instead of buying everything, and sometimes skip marketing when stock is not ready.
