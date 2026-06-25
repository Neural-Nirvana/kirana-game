import Fastify from 'fastify';
import { createReadStream, existsSync } from 'node:fs';
import { stat } from 'node:fs/promises';
import { extname, join, resolve } from 'node:path';
import type { PlayerActions, RunObservation } from '../src/types';
import { PRODUCTS, DEFAULT_CONFIG } from '../src/constants/products';
import { GameState } from '../src/game/GameState';
import { createAiArena, type ArenaStartRequest } from './ai-arena';
import { openDatabase } from './db';
import { loadLocalEnv } from './env';
import { normalizeActions } from './marketing-engine';
import { RunStore } from './run-store';
import { normalizeDisplayName, SessionStore, type AuthenticatedPlayerSession } from './session-store';

loadLocalEnv();

const SESSION_COOKIE = 'kirana_session';
const app = Fastify({ logger: true });
const db = openDatabase();
const store = new RunStore(db);
const sessions = new SessionStore(db);
const arena = createAiArena({ store });
const port = Number(process.env.KIRANA_SERVER_PORT ?? 8787);
const host = process.env.KIRANA_SERVER_HOST ?? '127.0.0.1';
const staticRoot = resolve(process.cwd(), process.env.KIRANA_STATIC_ROOT ?? 'dist');

app.setErrorHandler((error, _request, reply) => {
  const message = error.message || 'Request failed';
  const statusCode = 'statusCode' in error && typeof error.statusCode === 'number'
    ? error.statusCode
    : message.includes('not found') || message.includes('Not found')
      ? 404
      : 400;
  reply.status(statusCode).send({ error: message });
});

app.get('/api/health', async () => ({
  ok: true,
  service: 'kirana-backend',
  db: process.env.KIRANA_DB_PATH ?? 'data/kirana.sqlite',
}));

app.get('/api/me', async (request) => {
  const session = getSession(request);
  if (!session) {
    return {
      authenticated: false,
      runs: [],
    };
  }

  return {
    authenticated: true,
    player: session.player,
    runs: sessions.listRuns(session.player.id),
  };
});

app.post('/api/auth/player', async (request, reply) => {
  const body = request.body as { playerName?: string } | undefined;
  const displayName = normalizeDisplayName(body?.playerName);
  const session = sessions.createPlayerSession(displayName, request.headers['user-agent']);
  reply.header('Set-Cookie', buildSessionCookie(session.token, session.expiresAt));

  return {
    authenticated: true,
    player: session.player,
    runs: sessions.listRuns(session.player.id),
  };
});

app.post('/api/auth/logout', async (request, reply) => {
  sessions.deleteSessionByToken(getCookie(request.headers.cookie, SESSION_COOKIE));
  reply.header('Set-Cookie', clearSessionCookie());
  return {
    authenticated: false,
    runs: [],
  };
});

app.get('/api/me/runs', async (request) => {
  const session = requireSession(request);
  return {
    player: session.player,
    runs: sessions.listRuns(session.player.id),
  };
});

app.post('/api/runs', async (request) => {
  const session = requireSession(request);
  const body = request.body as { playerType?: 'human' | 'ai'; runName?: string } | undefined;
  const playerType = body?.playerType ?? 'human';
  if (playerType !== 'human') {
    throw httpError('Human sessions can only create human runs', 403);
  }
  return store.createRun('human', {
    playerId: session.player.id,
    runName: body?.runName ?? `${session.player.displayName}'s Kirana Run`,
  });
});

app.get('/api/runs/:runId/state', async (request) => {
  const session = requireSession(request);
  const { runId } = request.params as { runId: string };
  return store.getObservation(runId, session.player.id);
});

app.post('/api/runs/:runId/step', async (request) => {
  const session = requireSession(request);
  const { runId } = request.params as { runId: string };
  const body = request.body as Partial<PlayerActions> | { actions?: Partial<PlayerActions>; expectedDay?: number } | undefined;
  const actions = body && 'actions' in body ? body.actions : body;
  const expectedDay = body && 'expectedDay' in body && typeof body.expectedDay === 'number'
    ? body.expectedDay
    : undefined;
  return store.stepRun(runId, actions ?? {}, {
    playerId: session.player.id,
    expectedDay,
  });
});

app.get('/api/runs/:runId/timeline', async (request) => {
  const session = requireSession(request);
  const { runId } = request.params as { runId: string };
  return { runId, timeline: store.getTimeline(runId, session.player.id) };
});

app.post('/api/openenv/reset', async () => {
  const observation = store.createRun('human');
  return {
    episode_id: observation.runId,
    observation,
    done: observation.done,
    step_number: 0,
    scores: observation.scores,
  };
});

app.post('/api/openenv/step', async (request) => {
  const body = request.body as { episode_id?: string; action?: Partial<PlayerActions> } | undefined;
  if (!body?.episode_id) throw new Error('episode_id is required');
  const response = store.stepOpenEnvRun(body.episode_id, body.action ?? {});
  return {
    observation: response.observation,
    reward: response.result?.rewardBreakdown.total ?? 0,
    done: response.observation.done,
    info: {
      runId: response.runId,
      day: response.result?.day,
      log: response.log,
    },
    scores: response.observation.scores,
  };
});

app.get('/api/openenv/state', async (request) => {
  const query = request.query as { episode_id?: string };
  if (!query.episode_id) throw new Error('episode_id is required');
  const observation = store.getOpenEnvObservation(query.episode_id);
  return {
    episode_id: observation.runId,
    observation,
    done: observation.done,
    step_number: observation.state.history.length,
    scores: observation.scores,
  };
});

app.post('/api/ai-runs', async (request) => {
  const body = request.body as { profile?: string; model?: string } | undefined;
  const result = runAiBenchmark(body?.profile ?? 'balanced', body?.model ?? 'heuristic-v1');
  return result;
});

app.get('/api/ai-runs/:runId', async (request) => {
  const { runId } = request.params as { runId: string };
  const observation = store.getAiObservation(runId);
  return {
    runId,
    observation,
    timeline: store.getTimeline(runId),
    decisions: store.getAiDecisions(runId),
  };
});

app.get('/api/ai-runs/:runId/provider-responses', async (request) => {
  const { runId } = request.params as { runId: string };
  const query = request.query as { day?: string; includeBodies?: string } | undefined;
  const day = query?.day ? Number(query.day) : undefined;
  if (query?.day && !Number.isFinite(day)) {
    throw new Error('Invalid day query parameter');
  }
  const includeBodies = day !== undefined
    || query?.includeBodies === 'true'
    || query?.includeBodies === '1';
  const responses = store.getAiProviderResponses(runId, { day, includeBodies });
  return {
    runId,
    day,
    responses,
  };
});

app.get('/api/arena/system-prompt', async () => arena.systemPrompt());

app.get('/api/arena/models', async () => arena.models());

app.get('/api/arena/replays', async (request) => {
  const query = request.query as { status?: string; model?: string; limit?: string } | undefined;
  return {
    replays: store.listAiReplaySummaries({
      status: query?.status,
      model: query?.model,
      limit: query?.limit ? Number(query.limit) : undefined,
    }),
  };
});

app.get('/api/arena/scoreboard', async (request) => {
  const query = request.query as { limit?: string } | undefined;
  return {
    rows: store.getArenaScoreboard(query?.limit ? Number(query.limit) : undefined),
  };
});

app.post('/api/arena/runs', async (request) => {
  const body = request.body as ArenaStartRequest | undefined;
  return arena.start(body ?? {});
});

app.post('/api/arena/deepseek-flash-runs', async (request) => {
  const body = request.body as Omit<ArenaStartRequest, 'models' | 'mode'> | undefined;
  return arena.startDeepSeekFlash(body ?? {});
});

app.post('/api/arena/max-capability-runs', async (request) => {
  const body = request.body as Omit<ArenaStartRequest, 'mode'> | undefined;
  return arena.startMaxCapability(body ?? {});
});

app.get('/api/arena/runs/:arenaId', async (request) => {
  const { arenaId } = request.params as { arenaId: string };
  return arena.get(arenaId);
});

app.post('/api/arena/runs/:arenaId/resume', async (request) => {
  const { arenaId } = request.params as { arenaId: string };
  return arena.resume(arenaId);
});

app.post('/api/llm-day-context', async (request, reply) => {
  const context = await getLlmDayContext(request.body);
  if (!context) {
    reply.status(503).send({ error: 'LLM day context is not configured or unavailable' });
    return;
  }
  return context;
});

if (process.env.KIRANA_SERVE_STATIC !== 'false' && existsSync(staticRoot)) {
  app.get('/*', async (request, reply) => {
    const urlPath = decodeURIComponent((request.params as { '*': string })['*'] ?? '');
    const safePath = urlPath.split('/').filter((part) => part && part !== '..').join('/');
    const candidate = resolve(staticRoot, safePath);
    const target = candidate.startsWith(staticRoot) && await isReadableFile(candidate)
      ? candidate
      : join(staticRoot, 'index.html');

    return reply
      .type(contentTypeFor(target))
      .send(createReadStream(target));
  });
}

function runAiBenchmark(profile: string, model: string) {
  const player = sessions.ensureSystemPlayer(`AI ${profile}`, 'ai');
  const observation = store.createRun('ai', {
    playerId: player.id,
    runName: `AI ${profile} benchmark`,
  });
  const aiPlayerId = store.createAiPlayer(observation.runId, `AI ${profile}`, model, { profile });
  let current = observation;

  while (!current.done && current.state.history.length < DEFAULT_CONFIG.maxDays) {
    const startedAt = performance.now();
    const memory = buildAiMemoryPacket(current);
    store.createAiMemorySummary(current.runId, current.state.day, memory);

    const action = buildHeuristicAction(current, profile);
    const latencyMs = Math.round(performance.now() - startedAt);
    store.createAiDecision({
      runId: current.runId,
      aiPlayerId,
      day: current.state.day,
      observation: memory,
      action,
      rationale: 'Keeps essentials covered, corrects missed demand, preserves a cash buffer, and uses only low-risk marketing.',
      model,
      latencyMs,
    });

    try {
      current = store.stepRun(current.runId, action).observation;
    } catch (error) {
      const fallback = conservativeFallbackAction(current);
      store.createAiDecision({
        runId: current.runId,
        aiPlayerId,
        day: current.state.day,
        observation: memory,
        action: fallback,
        rationale: 'Fallback after invalid action: essentials-only purchase within available cash.',
        model,
        latencyMs: Math.round(performance.now() - startedAt),
        error: error instanceof Error ? error.message : String(error),
      });
      current = store.stepRun(current.runId, fallback).observation;
    }
  }

  const finalState = GameState.fromSerialized(current.state);
  return {
    runId: current.runId,
    observation: current,
    timeline: store.getTimeline(current.runId),
    decisions: store.getAiDecisions(current.runId),
    summary: {
      totalScore: finalState.getTotalScore(),
      finalCash: Math.round(finalState.cash),
      finalTrust: Math.round(finalState.trust),
      daysCompleted: finalState.history.length,
    },
  };
}

function getSession(request: { headers: { cookie?: string } }): AuthenticatedPlayerSession | undefined {
  return sessions.getSessionByToken(getCookie(request.headers.cookie, SESSION_COOKIE));
}

function requireSession(request: { headers: { cookie?: string } }): AuthenticatedPlayerSession {
  const session = getSession(request);
  if (!session) throw httpError('Player login required', 401);
  return session;
}

function getCookie(cookieHeader: string | undefined, name: string): string | undefined {
  if (!cookieHeader) return undefined;
  for (const part of cookieHeader.split(';')) {
    const [rawKey, ...rawValue] = part.trim().split('=');
    if (rawKey === name) return decodeURIComponent(rawValue.join('='));
  }
  return undefined;
}

function buildSessionCookie(token: string, expiresAt: string): string {
  const secure = process.env.KIRANA_COOKIE_SECURE === 'true' ? '; Secure' : '';
  const maxAge = Math.max(0, Math.floor((new Date(expiresAt).getTime() - Date.now()) / 1000));
  return `${SESSION_COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure}`;
}

function clearSessionCookie(): string {
  const secure = process.env.KIRANA_COOKIE_SECURE === 'true' ? '; Secure' : '';
  return `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secure}`;
}

function httpError(message: string, statusCode: number) {
  const error = new Error(message) as Error & { statusCode: number };
  error.statusCode = statusCode;
  return error;
}

function buildHeuristicAction(observation: RunObservation, profile: string): PlayerActions {
  const state = GameState.fromSerialized(observation.state);
  const lastResult = state.history.at(-1)?.results;
  const actions = normalizeActions({});
  const reserve = profile === 'growth' ? 450 : DEFAULT_CONFIG.defaultCashReserve;
  let budget = Math.max(0, state.cash - reserve);

  for (const product of PRODUCTS) {
    const current = state.getProductInventory(product.id)?.totalStock ?? 0;
    const movement = lastResult?.inventoryMovements.find((row) => row.productId === product.id);
    const missed = movement?.missedDemand ?? 0;
    const projectedNeed = Math.max(product.baseDemand * 0.75, missed + product.orderIncrement);
    const desired = Math.max(0, Math.ceil(projectedNeed - current));
    const rounded = Math.ceil(desired / product.orderIncrement) * product.orderIncrement;
    const cost = rounded * product.costPrice;
    if (rounded > 0 && cost <= budget) {
      actions.orders[product.id] = rounded;
      budget -= cost;
    }

    const atRisk = movement?.perishability.atRiskUnits ?? 0;
    if (atRisk > 0) actions.discounts[product.id] = 10;
  }

  actions.khataReminders = state.customers
    .filter((customer) => customer.khataBalance > 0)
    .slice(0, 3)
    .map((customer) => customer.id);

  if (budget >= 50 && state.day >= 2) {
    actions.marketingActions = [{ specId: 'whatsapp_status' }];
  } else if (budget >= 30 && state.day === 1) {
    actions.marketingActions = [{ specId: 'chalkboard_offer' }];
  }

  return actions;
}

function conservativeFallbackAction(observation: RunObservation): PlayerActions {
  const state = GameState.fromSerialized(observation.state);
  const actions = normalizeActions({});
  let budget = Math.max(0, state.cash - DEFAULT_CONFIG.defaultCashReserve);

  for (const productId of ['milk', 'bread', 'eggs'] as const) {
    const product = PRODUCTS.find((item) => item.id === productId);
    if (!product) continue;
    const qty = product.orderIncrement;
    const cost = qty * product.costPrice;
    if (cost <= budget) {
      actions.orders[product.id] = qty;
      budget -= cost;
    }
  }

  actions.khataReminders = state.customers
    .filter((customer) => customer.khataBalance > 0)
    .slice(0, 2)
    .map((customer) => customer.id);

  return actions;
}

function buildAiMemoryPacket(observation: RunObservation) {
  const state = GameState.fromSerialized(observation.state);
  const lastLogs = state.history.slice(-3).map((log) => ({
    day: log.day,
    score: log.results.rewardBreakdown.total,
    cash: log.results.cash,
    trust: Math.round(log.results.trust),
    missedUnits: log.results.inventoryMovements.reduce((sum, row) => sum + row.missedDemand, 0),
    stockouts: log.results.stockouts,
  }));

  return {
    day: state.day,
    cash: Math.round(state.cash),
    trust: Math.round(state.trust),
    lastDays: lastLogs,
    customerPatterns: state.getCustomerMemorySummary(),
    activeMarketing: observation.activeMarketing,
    inventoryRisks: PRODUCTS.map((product) => ({
      productId: product.id,
      stock: state.getProductInventory(product.id)?.totalStock ?? 0,
    })),
  };
}

async function getLlmDayContext(payload: unknown) {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) return undefined;

  const model = process.env.OPENROUTER_MODEL || 'z-ai/glm-5.2';
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 60000);

  try {
    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'http://localhost:5175',
        'X-Title': 'Kirana Game',
      },
      body: JSON.stringify({
        model,
        messages: [
          {
            role: 'system',
            content: [
              'You generate compact JSON environment context for an Indian kirana shop simulation.',
              'Do not control gameplay math. Explain environmental signals, customer mood, market cues, and risks only.',
              'Return only valid JSON matching the requested keys.',
            ].join(' '),
          },
          {
            role: 'user',
            content: JSON.stringify(payload),
          },
        ],
        reasoning: { enabled: true, exclude: true },
        response_format: {
          type: 'json_schema',
          json_schema: {
            name: 'kirana_day_context',
            strict: true,
            schema: {
              type: 'object',
              additionalProperties: false,
              required: [
                'dayTheme',
                'planningFocus',
                'localNarrative',
                'neighborhoodSignals',
                'customerMoodSignals',
                'marketSignals',
                'visualCues',
                'riskNotes',
              ],
              properties: {
                dayTheme: { type: 'string' },
                planningFocus: { type: 'string' },
                localNarrative: { type: 'string' },
                neighborhoodSignals: { type: 'array', items: { type: 'string' }, minItems: 2, maxItems: 4 },
                customerMoodSignals: { type: 'array', items: { type: 'string' }, minItems: 2, maxItems: 4 },
                marketSignals: { type: 'array', items: { type: 'string' }, minItems: 2, maxItems: 4 },
                visualCues: { type: 'array', items: { type: 'string' }, minItems: 2, maxItems: 4 },
                riskNotes: { type: 'array', items: { type: 'string' }, minItems: 1, maxItems: 4 },
              },
            },
          },
        },
        temperature: 0.45,
        max_tokens: 1400,
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      app.log.warn({ status: response.status, body: await response.text().catch(() => '') }, 'OpenRouter context failed');
      return undefined;
    }

    const data = await response.json() as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const content = data.choices?.[0]?.message?.content;
    if (!content) return undefined;
    const parsed = parseJsonContent(content);
    return parsed ? { ...parsed, source: 'llm', model } : undefined;
  } catch (error) {
    app.log.warn({ error }, 'OpenRouter context unavailable');
    return undefined;
  } finally {
    clearTimeout(timeout);
  }
}

function parseJsonContent(content: string) {
  const trimmed = content.trim().replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/\s*```$/i, '');
  try {
    return JSON.parse(trimmed);
  } catch {
    const start = trimmed.indexOf('{');
    const end = trimmed.lastIndexOf('}');
    if (start < 0 || end <= start) return undefined;
    try {
      return JSON.parse(trimmed.slice(start, end + 1));
    } catch {
      return undefined;
    }
  }
}

async function isReadableFile(path: string): Promise<boolean> {
  try {
    return (await stat(path)).isFile();
  } catch {
    return false;
  }
}

function contentTypeFor(path: string): string {
  const types: Record<string, string> = {
    '.css': 'text/css; charset=utf-8',
    '.html': 'text/html; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.png': 'image/png',
    '.svg': 'image/svg+xml',
    '.webp': 'image/webp',
  };
  return types[extname(path)] ?? 'application/octet-stream';
}

process.on('SIGINT', async () => {
  await app.close();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  await app.close();
  process.exit(0);
});

app.listen({ port, host }).catch((error) => {
  app.log.error(error);
  process.exit(1);
});
