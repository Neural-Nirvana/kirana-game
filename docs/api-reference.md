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
