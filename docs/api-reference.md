# API Reference

The backend is a Fastify server. In production it also serves the built frontend.

Default backend:

```text
http://127.0.0.1:8787
```

## Authentication Model

Human game APIs use a player session cookie.

Cookie:

```text
kirana_session
```

Properties:

- `HttpOnly`
- `SameSite=Lax`
- `Path=/`
- `Max-Age` based on session expiry
- `Secure` only when `KIRANA_COOKIE_SECURE=true`

Frontend fetch calls use same-origin credentials.

## Health

### `GET /api/health`

Returns backend status and DB path.

Example response:

```json
{
  "ok": true,
  "service": "kirana-backend",
  "db": "data/kirana.sqlite"
}
```

## Player Session APIs

### `GET /api/me`

Returns the current player session, if any.

Unauthenticated:

```json
{
  "authenticated": false,
  "runs": []
}
```

Authenticated:

```json
{
  "authenticated": true,
  "player": {
    "id": "player-id",
    "displayName": "Asha",
    "kind": "human",
    "createdAt": "2026-06-20T..."
  },
  "runs": []
}
```

### `POST /api/auth/player`

Creates or restores a player by name and sets the session cookie.

Request:

```json
{
  "playerName": "Asha"
}
```

Rules:

- name is required
- whitespace is collapsed
- max length is 40 characters
- name matching is case-insensitive through `name_key`

Response:

```json
{
  "authenticated": true,
  "player": {
    "id": "player-id",
    "displayName": "Asha",
    "kind": "human",
    "createdAt": "2026-06-20T..."
  },
  "runs": []
}
```

### `POST /api/auth/logout`

Deletes the current session and clears the cookie.

### `GET /api/me/runs`

Requires session.

Returns all runs owned by the current player, newest first.

## Human Run APIs

These endpoints require a valid human player session.

### `POST /api/runs`

Creates a human run owned by the current player.

Request:

```json
{
  "playerType": "human",
  "runName": "Asha's Kirana Run"
}
```

Response is a `RunObservation`.

### `GET /api/runs/:runId/state`

Returns the current observation for a run owned by the current session player.

If the run belongs to another player, the backend returns `404`.

### `POST /api/runs/:runId/step`

Simulates the next day using submitted player actions.

Request:

```json
{
  "expectedDay": 4,
  "actions": {
    "orders": {
      "milk": 20,
      "bread": 10
    },
    "removals": {},
    "discounts": {
      "bananas": 10
    },
    "khataReminders": [],
    "marketingActions": [
      { "specId": "whatsapp_status", "targetProducts": ["milk", "bread"] }
    ],
    "cashReserve": 600,
    "fridgeAllocation": {
      "milk": 60,
      "cold_drinks": 30,
      "buffer": 10
    }
  }
}
```

`expectedDay` protects against duplicate tab or double-click problems. If the run has already advanced, the backend rejects the step.

Response:

```json
{
  "runId": "run-id",
  "observation": {},
  "log": {},
  "result": {}
}
```

### `GET /api/runs/:runId/timeline`

Returns day-by-day logs for a run owned by the current session player.

## AI Replay APIs

### `POST /api/ai-runs`

Starts an AI benchmark run.

Request:

```json
{
  "profile": "balanced",
  "model": "heuristic-v1"
}
```

Response includes:

- `runId`
- `observation`
- `timeline`
- `decisions`
- `summary`

### `GET /api/ai-runs/:runId`

Returns an AI run only if the run is an AI run.

Human player runs are rejected with `404` through this endpoint.

## AI Arena APIs

AI Arena runs let one or more models play a full 30-day game through JSON observations and JSON actions.

Important semantics:

- 1 arena episode = 1 full 30-day game
- 1 arena step = 1 in-game day
- 1 model action = the plan submitted before that day opens
- 1 reward = the day score returned after simulation

### `GET /api/arena/system-prompt`

Returns the system prompt, action schema, response schema, max days, and the `oneStepEqualsOneDay` flag.

Use this when building an external OpenEnv runner or comparing prompts.

### `GET /api/arena/models`

Returns local presets and, when OpenRouter is reachable, live model hints for Kimi, GLM, DeepSeek, and Flash-like model families.

Response includes:

- `presets`
- `available`
- `note`

Exact model IDs are passed through to OpenRouter, so callers can supply any current OpenRouter model id.

### `POST /api/arena/runs`

Starts an asynchronous arena job.

Request:

```json
{
  "mode": "llm",
  "models": ["z-ai/glm-5.2"],
  "maxDays": 30,
  "temperature": 0.25,
  "profile": "balanced",
  "requireJsonSchema": false,
  "requireParameters": true,
  "observationMode": "compact",
  "responseMode": "json_schema",
  "reasoning": "off",
  "timeoutMs": 90000,
  "maxTokens": 1000
}
```

For a no-network smoke test:

```json
{
  "mode": "heuristic",
  "maxDays": 30
}
```

Response:

```json
{
  "arenaId": "arena-job-id",
  "status": "queued",
  "mode": "llm",
  "models": ["z-ai/glm-5.2"],
  "maxDays": 30,
  "createdAt": "2026-06-20T...",
  "updatedAt": "2026-06-20T...",
  "runs": []
}
```

LLM mode requires:

```text
OPENROUTER_API_KEY
```

Optional LLM tuning fields:

- `observationMode`: `full` or `compact`
- `responseMode`: `json_schema`, `json_object`, or `text`
- `reasoning`: `off`, `medium`, `high`, or `xhigh`
- `requireJsonSchema`: when `true`, the arena does not fall back to plain text if schema generation fails
- `requireParameters`: when `true`, structured-output calls ask OpenRouter to route only to providers that support required parameters
- `timeoutMs`: per-model call timeout, clamped to 15s-15m
- `maxTokens`: model output token limit, clamped to 400-16000

### `POST /api/arena/deepseek-flash-runs`

Starts an arena job tuned for `deepseek/deepseek-v4-flash`.

Defaults:

```json
{
  "mode": "llm",
  "models": ["deepseek/deepseek-v4-flash"],
  "observationMode": "compact",
  "responseMode": "json_schema",
  "reasoning": "off",
  "temperature": 0.15,
  "maxTokens": 1000,
  "timeoutMs": 90000
}
```

Request:

```json
{
  "maxDays": 1
}
```

Use this endpoint first for provider smoke tests before running a full 30-day LLM tournament.

### `POST /api/arena/max-capability-runs`

Starts an arena job with the same high-capability settings for every model in the request. Use this for fair model comparisons where latency and token cost are allowed to rise.

Defaults:

```json
{
  "mode": "llm",
  "profile": "max_capability",
  "observationMode": "compact",
  "responseMode": "json_schema",
  "reasoning": "medium",
  "temperature": 0.15,
  "requireJsonSchema": true,
  "requireParameters": true,
  "maxTokens": 16000,
  "timeoutMs": 900000
}
```

Request:

```json
{
  "models": [
    "z-ai/glm-5.2",
    "deepseek/deepseek-v4-flash",
    "google/gemma-4-26b-a4b-it"
  ],
  "maxDays": 30
}
```

### `GET /api/arena/runs/:arenaId`

Returns the current arena job state, including each model run's progress and day-level decisions.

Response fields:

- `status`: `queued`, `running`, `complete`, or `failed`
- `runs[].runId`: backend run id for replay/history lookup
- `runs[].day`
- `runs[].totalReward`
- `runs[].finalCash`
- `runs[].finalTrust`
- `runs[].decisions[]`

Each decision contains the action JSON, rationale, reward, cash, trust, cumulative score, latency, retry count, and any validation error.

## OpenEnv-Compatible APIs

OpenEnv runs are unowned environment episodes. They are isolated from human player runs.

### `POST /api/openenv/reset`

Creates an unowned episode.

Response shape:

```json
{
  "episode_id": "run-id",
  "observation": {},
  "done": false,
  "step_number": 0,
  "scores": {}
}
```

### `POST /api/openenv/step`

Steps an unowned OpenEnv episode.

Request:

```json
{
  "episode_id": "run-id",
  "action": {}
}
```

### `GET /api/openenv/state?episode_id=...`

Returns the current OpenEnv episode state.

Player-owned runs are rejected with `404`.

## LLM Day Context

### `POST /api/llm-day-context`

Generates optional AI-written context for the day.

Requires:

```text
OPENROUTER_API_KEY
```

If not configured or unavailable, returns `503` and the frontend falls back to deterministic signals.

The LLM response is expected to contain:

- `dayTheme`
- `planningFocus`
- `localNarrative`
- `neighborhoodSignals`
- `customerMoodSignals`
- `marketSignals`
- `visualCues`
- `riskNotes`

## Common Error Responses

### Login required

```json
{
  "error": "Player login required"
}
```

Status: `401`

### Run not found or not owned by current player

```json
{
  "error": "Run not found: <runId>"
}
```

Status: `404`

### Over-budget plan

```json
{
  "error": "Plan costs ₹3200, but cash is ₹3000"
}
```

Status: `400`
