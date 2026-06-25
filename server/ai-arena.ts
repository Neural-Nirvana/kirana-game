import { randomUUID } from 'node:crypto';
import type {
  CustomerProfile,
  DayLog,
  MarketingActionSelection,
  PlayerActions,
  ProductId,
  RunObservation,
} from '../src/types';
import { PRODUCT_NAME, SHOP_NAME } from '../src/constants/brand';
import { DEFAULT_CONFIG, PRODUCTS } from '../src/constants/products';
import { DEFAULT_NEIGHBORHOOD_PROFILE } from '../src/constants/neighborhood';
import { GameState } from '../src/game/GameState';
import { PerishabilityEngine } from '../src/game/PerishabilityEngine';
import { EnvironmentSignalEngine } from '../src/game/progression/EnvironmentSignalEngine';
import { getAvailableCampaigns, normalizeActions } from './marketing-engine';
import type { ArenaJobRecord, ArenaRunRecord, RunStore } from './run-store';

const PRODUCT_IDS = PRODUCTS.map((product) => product.id);
const DISCOUNT_OPTIONS = [0, 10, 15, 20];
const DEFAULT_ARENA_MODELS = ['z-ai/glm-5.2'];
const DEEPSEEK_FLASH_MODEL = 'deepseek/deepseek-v4-flash';
const DEEPSEEK_PRO_MODEL = 'deepseek/deepseek-v4-pro';
const GPT_55_MODEL = 'openai/gpt-5.5';
const GPT_54_MINI_MODEL = 'openai/gpt-5.4-mini';
const GEMINI_31_PRO_MODEL = 'google/gemini-3.1-pro-preview';
const GROK_43_MODEL = 'x-ai/grok-4.3';
const CLAUDE_OPUS_48_MODEL = 'anthropic/claude-opus-4.8';
const SARVAM_105B_MODEL = 'sarvam-105b';
const MAX_CAPABILITY_PROFILE = 'max_capability';
const MAX_CAPABILITY_TOKENS = 16000;
const MAX_CAPABILITY_TIMEOUT_MS = 900000;
const AI_ARENA_PROMPT_VERSION = 'arena-prompt-v2-world-context';
const AI_ARENA_WORLD_VERSION = DEFAULT_NEIGHBORHOOD_PROFILE.id;
const DEFAULT_ARENA_SEED = 20260624;

export const AI_ARENA_SYSTEM_PROMPT = [
  'You are an autonomous AI shopkeeper playing Shree Shyam Bhandar, an Indian kirana store simulation.',
  'One OpenEnv episode is one full 30-day game. One step is exactly one in-game day.',
  'For each step you receive JSON with environment signals, inventory, customers, active marketing, available campaigns, recent history, and reward rules.',
  'Your job is to return a valid action JSON for tomorrow before the shop opens.',
  'Maximize total 30-day reward, not only same-day revenue. Balance operating profit, customer trust, service rate, waste, khata discipline, marketing ROI, and cash survival.',
  'Orders must respect product pack sizes and available cash. Marketing is useful only when promoted demand can be served. Discounts can clear existing inventory but reduce margin.',
  'Order quantities are item units, not supplier pack counts. Example: milk 10 means 10 L, bread 5 means 5 packs, cold_drinks 12 means 12 bottles.',
  'The action JSON is the source of truth. First decide the executable action, then write a rationale that only describes what is actually present in action.',
  'If you mention a campaign, promotion, offer, WhatsApp status, khata reminder, recovery call, or discount in rationale, the matching action field must be filled. Otherwise it did not happen.',
  'Marketing example: "marketingActions":[{"specId":"chalkboard_offer","targetProducts":["chips","cold_drinks","maggi"]}].',
  'Khata example: "khataReminders":["mrs_sharma","office_regular"]. Discount example: "discounts":{"bananas":15}. Use numbers only: 10, 15, or 20; do not write "10%" strings.',
  'Use the word discount only when action.discounts has a positive number for that item. Use the word campaign or marketing for marketingActions instead of calling campaigns discounts.',
  'Use the environment signals to infer demand pressure. Do not ask for hidden demand forecasts. Do not invent products, campaigns, or customers.',
  'Historical baseline demand is only a reference, not tomorrow demand. Prioritize recent sold/missed history, known customers, weather, weekday, events, marketing, and trust.',
  'Every Arena run uses the same fixed fictional neighborhood profile. Use nearby societies, school traffic, commute flow, and segment behavior to reason about visits and demand.',
  'Return only JSON matching the schema: { "action": PlayerActions, "rationale": string }. No markdown.',
].join(' ');

const productNumberProperties = Object.fromEntries(
  PRODUCT_IDS.map((productId) => [productId, { type: 'integer', minimum: 0 }])
);

const productDiscountProperties = Object.fromEntries(
  PRODUCT_IDS.map((productId) => [productId, { type: 'integer', enum: DISCOUNT_OPTIONS }])
);

const productQuantityMapSchema = {
  type: 'object',
  additionalProperties: false,
  properties: productNumberProperties,
};

const strictProductNumberProperties = Object.fromEntries(
  PRODUCT_IDS.map((productId) => [productId, { type: 'integer' }])
);

const strictProductQuantityMapSchema = {
  type: 'object',
  additionalProperties: false,
  required: PRODUCT_IDS,
  properties: strictProductNumberProperties,
};

const strictProductDiscountMapSchema = {
  type: 'object',
  additionalProperties: false,
  required: PRODUCT_IDS,
  properties: productDiscountProperties,
};

export const AI_ARENA_ACTION_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: [
    'orders',
    'removals',
    'discounts',
    'khataReminders',
    'marketingActions',
    'cashReserve',
    'fridgeAllocation',
  ],
  properties: {
    orders: productQuantityMapSchema,
    removals: productQuantityMapSchema,
    discounts: {
      type: 'object',
      additionalProperties: false,
      properties: productDiscountProperties,
    },
    khataReminders: {
      type: 'array',
      items: { type: 'string' },
      uniqueItems: true,
    },
    marketingActions: {
      type: 'array',
      maxItems: 3,
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['specId', 'targetProducts'],
        properties: {
          specId: { type: 'string' },
          targetProducts: {
            type: 'array',
            items: { type: 'string', enum: PRODUCT_IDS },
            minItems: 1,
            uniqueItems: true,
          },
        },
      },
    },
    cashReserve: { type: 'integer', minimum: 0 },
    fridgeAllocation: {
      type: 'object',
      additionalProperties: false,
      required: ['milk', 'cold_drinks', 'buffer'],
      properties: {
        milk: { type: 'integer', minimum: 0, maximum: 100 },
        cold_drinks: { type: 'integer', minimum: 0, maximum: 100 },
        buffer: { type: 'integer', minimum: 0, maximum: 100 },
      },
    },
  },
};

export const AI_ARENA_RESPONSE_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['action', 'rationale'],
  properties: {
    action: AI_ARENA_ACTION_SCHEMA,
    rationale: {
      type: 'string',
      minLength: 1,
      maxLength: 700,
    },
  },
};

const AI_ARENA_OPENAI_RESPONSES_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['action', 'rationale'],
  properties: {
    action: {
      type: 'object',
      additionalProperties: false,
      required: [
        'orders',
        'removals',
        'discounts',
        'khataReminders',
        'marketingActions',
        'cashReserve',
        'fridgeAllocation',
      ],
      properties: {
        orders: strictProductQuantityMapSchema,
        removals: strictProductQuantityMapSchema,
        discounts: strictProductDiscountMapSchema,
        khataReminders: {
          type: 'array',
          items: { type: 'string' },
        },
        marketingActions: {
          type: 'array',
          items: {
            type: 'object',
            additionalProperties: false,
            required: ['specId', 'targetProducts'],
            properties: {
              specId: { type: 'string' },
              targetProducts: {
                type: 'array',
                items: { type: 'string', enum: PRODUCT_IDS },
              },
            },
          },
        },
        cashReserve: { type: 'integer' },
        fridgeAllocation: {
          type: 'object',
          additionalProperties: false,
          required: ['milk', 'cold_drinks', 'buffer'],
          properties: {
            milk: { type: 'integer' },
            cold_drinks: { type: 'integer' },
            buffer: { type: 'integer' },
          },
        },
      },
    },
    rationale: { type: 'string' },
  },
};

export const AI_ARENA_MODEL_PRESETS = [
  {
    id: GPT_55_MODEL,
    label: 'GPT 5.5',
    note: 'Strong OpenAI reasoning baseline. Uses OpenRouter Responses API.',
  },
  {
    id: GPT_54_MINI_MODEL,
    label: 'GPT 5.4 Mini',
    note: 'OpenAI text model for low-latency kirana decisions.',
  },
  {
    id: GEMINI_31_PRO_MODEL,
    label: 'Gemini 3.1 Pro',
    note: 'High-reasoning Gemini candidate. Uses OpenRouter Responses in max runs.',
  },
  {
    id: GROK_43_MODEL,
    label: 'Grok 4.3',
    note: 'xAI high-reasoning candidate. Uses Responses JSON-object in max runs.',
  },
  {
    id: CLAUDE_OPUS_48_MODEL,
    label: 'Claude Opus 4.8',
    note: 'Premium Anthropic reasoning model. Use controlled smoke runs before full benchmarks.',
  },
  {
    id: SARVAM_105B_MODEL,
    label: 'Sarvam 105B',
    note: 'Sarvam flagship Indian-language reasoning model. Uses Sarvam API key and max reasoning.',
  },
  {
    id: 'z-ai/glm-5.2',
    label: 'GLM 5.2',
    note: 'Configured default for this project when available.',
  },
  {
    id: DEEPSEEK_FLASH_MODEL,
    label: 'DeepSeek V4 Flash',
    note: 'Fast arena profile: compact observation, no explicit reasoning, JSON-schema action output.',
  },
  {
    id: 'heuristic-v2',
    label: 'Built-in Heuristic',
    note: 'No OpenRouter call. Useful for smoke tests and fallback baselines.',
  },
];

export type ArenaMode = 'llm' | 'heuristic';
export type ArenaStatus = 'queued' | 'running' | 'complete' | 'failed';
export type ArenaRunStatus = 'queued' | 'running' | 'complete' | 'failed';
export type ArenaObservationMode = 'full' | 'compact';
export type ArenaResponseMode = 'json_schema' | 'json_object' | 'text';
export type ArenaReasoningMode = 'off' | 'medium' | 'high' | 'xhigh';
export type ArenaTransportMode = 'auto' | 'chat_completions' | 'responses';

export interface ArenaStartRequest {
  models?: string[];
  maxDays?: number;
  mode?: ArenaMode;
  profile?: string;
  temperature?: number;
  requireJsonSchema?: boolean;
  requireParameters?: boolean;
  observationMode?: ArenaObservationMode;
  responseMode?: ArenaResponseMode;
  reasoning?: ArenaReasoningMode;
  transport?: ArenaTransportMode;
  timeoutMs?: number;
  maxTokens?: number;
  seed?: number;
}

export interface ArenaDayTrace {
  day: number;
  reward: number;
  cash: number;
  trust: number;
  scoreTotal: number;
  action: PlayerActions;
  rationale: string;
  model: string;
  latencyMs: number;
  retryCount: number;
  error?: string;
  metadata?: ArenaDecisionMetadata;
}

export interface ArenaRunSummary {
  runId?: string;
  model: string;
  status: ArenaRunStatus;
  day: number;
  totalReward: number;
  finalCash?: number;
  finalTrust?: number;
  decisions: ArenaDayTrace[];
  error?: string;
  config?: unknown;
}

export interface ArenaJob {
  arenaId: string;
  status: ArenaStatus;
  mode: ArenaMode;
  models: string[];
  maxDays: number;
  createdAt: string;
  updatedAt: string;
  runs: ArenaRunSummary[];
  error?: string;
  request?: ArenaStartRequest;
  config?: unknown;
}

interface ArenaDecisionMetadata {
  provider: string;
  transport: string;
  promptVersion: string;
  configSnapshot: unknown;
  usage?: unknown;
  finishReason?: string;
  responseId?: string;
  requestJson?: unknown;
  responseText?: string;
  emptyContent?: boolean;
  validationErrorType?: string;
  retryCount?: number;
  fallbackUsed?: boolean;
  seed?: number;
  worldVersion: string;
}

export function createAiArena(params: { store: RunStore }) {
  const runningJobs = new Set<string>();

  return {
    start(request: ArenaStartRequest = {}) {
      const mode = request.mode ?? 'llm';
      const models = normalizeModelList(request.models, mode);
      const maxDays = clampInteger(request.maxDays, 1, DEFAULT_CONFIG.maxDays, DEFAULT_CONFIG.maxDays);
      const seed = getArenaSeed(request);
      const job: ArenaJob = {
        arenaId: randomUUID(),
        status: 'queued',
        mode,
        models,
        maxDays,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        request: { ...request, mode, models, maxDays, seed },
        config: buildArenaJobConfig({ ...request, mode, models, maxDays, seed }),
        runs: models.map((model) => ({
          model,
          status: 'queued',
          day: 1,
          totalReward: 0,
          decisions: [],
          config: buildArenaRunConfig({ ...request, mode, models, maxDays, seed }, model),
        })),
      };
      params.store.createArenaJob(toArenaJobRecord(job));

      void runArenaJob(params.store, job, job.request, runningJobs).catch((error) => {
        job.status = 'failed';
        job.error = error instanceof Error ? error.message : String(error);
        job.updatedAt = new Date().toISOString();
        params.store.updateArenaJob(toArenaJobRecord(job));
      });

      return params.store.getArenaJob(job.arenaId);
    },

    startDeepSeekFlash(request: Omit<ArenaStartRequest, 'models' | 'mode'> = {}) {
      return this.start({
        ...request,
        mode: 'llm',
        models: [DEEPSEEK_FLASH_MODEL],
        observationMode: request.observationMode ?? 'compact',
        responseMode: request.responseMode ?? 'json_schema',
        reasoning: request.reasoning ?? 'off',
        temperature: request.temperature ?? 0.15,
        maxTokens: request.maxTokens ?? 1000,
        timeoutMs: request.timeoutMs ?? 90000,
      });
    },

    startMaxCapability(request: Omit<ArenaStartRequest, 'mode'> = {}) {
      return this.start({
        ...request,
        mode: 'llm',
        profile: request.profile ?? MAX_CAPABILITY_PROFILE,
        observationMode: request.observationMode ?? 'compact',
        responseMode: request.responseMode ?? 'json_schema',
        reasoning: request.reasoning ?? 'medium',
        temperature: request.temperature ?? 0.15,
        requireJsonSchema: request.requireJsonSchema ?? true,
        requireParameters: request.requireParameters ?? true,
        maxTokens: request.maxTokens ?? MAX_CAPABILITY_TOKENS,
        timeoutMs: request.timeoutMs ?? MAX_CAPABILITY_TIMEOUT_MS,
      });
    },

    get(arenaId: string) {
      return params.store.getArenaJob(arenaId);
    },

    resume(arenaId: string) {
      const job = fromArenaJobRecord(params.store.getArenaJob(arenaId));
      if (job.status === 'complete') return job;
      if (runningJobs.has(arenaId)) return params.store.getArenaJob(arenaId);

      job.status = 'queued';
      job.error = undefined;
      job.updatedAt = new Date().toISOString();
      params.store.updateArenaJob(toArenaJobRecord(job));

      void runArenaJob(params.store, job, job.request ?? {}, runningJobs).catch((error) => {
        job.status = 'failed';
        job.error = error instanceof Error ? error.message : String(error);
        job.updatedAt = new Date().toISOString();
        params.store.updateArenaJob(toArenaJobRecord(job));
      });

      return params.store.getArenaJob(arenaId);
    },

    async models() {
      return {
        presets: AI_ARENA_MODEL_PRESETS,
        available: await fetchOpenRouterModelHints().catch(() => []),
        note: 'POST /api/arena/runs accepts any exact OpenRouter model id. Use available[] as live hints when OpenRouter is reachable.',
      };
    },

    systemPrompt() {
      return {
        oneStepEqualsOneDay: true,
        maxDays: DEFAULT_CONFIG.maxDays,
        systemPrompt: AI_ARENA_SYSTEM_PROMPT,
        responseSchema: AI_ARENA_RESPONSE_SCHEMA,
        actionSchema: AI_ARENA_ACTION_SCHEMA,
      };
    },
  };
}

function toArenaJobRecord(job: ArenaJob): ArenaJobRecord {
  return {
    arenaId: job.arenaId,
    status: job.status,
    mode: job.mode,
    models: job.models,
    maxDays: job.maxDays,
    createdAt: job.createdAt,
    updatedAt: job.updatedAt,
    runs: job.runs as ArenaRunRecord[],
    error: job.error,
    request: job.request ?? {},
    config: job.config ?? {},
  };
}

function fromArenaJobRecord(record: ArenaJobRecord): ArenaJob {
  return {
    arenaId: record.arenaId,
    status: record.status,
    mode: record.mode,
    models: record.models,
    maxDays: record.maxDays,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    runs: record.runs as ArenaRunSummary[],
    error: record.error,
    request: record.request as ArenaStartRequest,
    config: record.config,
  };
}

function getArenaSeed(request: ArenaStartRequest): number {
  return Number.isFinite(request.seed) ? Math.round(request.seed as number) : DEFAULT_ARENA_SEED;
}

function buildArenaJobConfig(request: ArenaStartRequest) {
  return {
    promptVersion: AI_ARENA_PROMPT_VERSION,
    worldVersion: AI_ARENA_WORLD_VERSION,
    seed: getArenaSeed(request),
    maxDays: request.maxDays ?? DEFAULT_CONFIG.maxDays,
    models: request.models ?? [],
    mode: request.mode ?? 'llm',
  };
}

function buildArenaRunConfig(request: ArenaStartRequest, model: string) {
  const transportMode = getTransportMode(request, model);
  return {
    provider: providerForModel(model, request.mode),
    transport: transportForModel(model, getResponseMode(request, model), transportMode),
    promptVersion: AI_ARENA_PROMPT_VERSION,
    worldVersion: AI_ARENA_WORLD_VERSION,
    seed: getArenaSeed(request),
    profile: request.profile ?? 'balanced',
    observationMode: getObservationMode(request, model),
    responseMode: getResponseMode(request, model),
    reasoning: getReasoningMode(request, model),
    transportMode,
    requireJsonSchema: getRequireJsonSchema(request, model),
    requireParameters: getRequireParameters(request, model),
    maxTokens: getMaxTokens(request, model),
    timeoutMs: getTimeoutMs(request, model),
    temperature: request.temperature ?? 0.15,
  };
}

function buildDecisionMetadata(
  request: ArenaStartRequest | {
    mode?: ArenaMode;
    profile?: string;
    observationMode: ArenaObservationMode;
    responseMode: ArenaResponseMode;
    reasoning: ArenaReasoningMode;
    transport?: ArenaTransportMode;
    requireJsonSchema?: boolean;
    requireParameters?: boolean;
    timeoutMs: number;
    maxTokens: number;
    temperature?: number;
    seed?: number;
  },
  model: string,
  overrides: Partial<ArenaDecisionMetadata> = {}
): ArenaDecisionMetadata {
  const configSnapshot = buildArenaRunConfig(request as ArenaStartRequest, model);
  return {
    provider: overrides.provider ?? providerForModel(model, request.mode),
    transport: overrides.transport ?? transportForModel(model, request.responseMode, request.transport),
    promptVersion: AI_ARENA_PROMPT_VERSION,
    configSnapshot,
    usage: overrides.usage,
    finishReason: overrides.finishReason,
    responseId: overrides.responseId,
    requestJson: overrides.requestJson,
    responseText: overrides.responseText,
    emptyContent: overrides.emptyContent ?? false,
    validationErrorType: overrides.validationErrorType,
    retryCount: overrides.retryCount ?? 0,
    fallbackUsed: overrides.fallbackUsed ?? false,
    seed: overrides.seed ?? getArenaSeed(request as ArenaStartRequest),
    worldVersion: AI_ARENA_WORLD_VERSION,
  };
}

function withDecisionMetadata(
  metadata: ArenaDecisionMetadata | undefined,
  request: ArenaStartRequest,
  model: string,
  retryCount: number,
  error?: string
): ArenaDecisionMetadata {
  return {
    ...(metadata ?? buildDecisionMetadata(request, model)),
    retryCount,
    validationErrorType: error ? classifyArenaError(error) : metadata?.validationErrorType,
    emptyContent: metadata?.emptyContent ?? Boolean(error && /no .*content|no output text/i.test(error)),
  };
}

function classifyArenaError(error: string): string {
  if (/json|schema|parse/i.test(error)) return 'json';
  if (/content|output text|empty/i.test(error)) return 'empty_content';
  if (/timeout|abort/i.test(error)) return 'timeout';
  if (/rationale|action|marketing|discount|khata/i.test(error)) return 'validation';
  return 'provider';
}

function mergePersistedDecisions(
  current: ArenaDayTrace[],
  persisted: Array<{
    day: number;
    action: PlayerActions;
    rationale: string;
    model: string;
    latencyMs: number;
    error?: string | null;
    retryCount?: number;
    fallbackUsed?: boolean;
    provider?: string;
    transport?: string;
    promptVersion?: string;
    configSnapshot?: unknown;
    usage?: unknown;
    finishReason?: string;
    responseId?: string;
    emptyContent?: boolean;
    validationErrorType?: string;
    seed?: number;
    worldVersion?: string;
  }>,
  model: string
): ArenaDayTrace[] {
  const byDay = new Map<number, ArenaDayTrace>();
  for (const trace of current) byDay.set(trace.day, trace);
  for (const decision of persisted.filter((item) => item.model === model)) {
    if (byDay.has(decision.day)) continue;
    byDay.set(decision.day, {
      day: decision.day,
      reward: 0,
      cash: 0,
      trust: 0,
      scoreTotal: 0,
      action: decision.action,
      rationale: decision.rationale,
      model: decision.model,
      latencyMs: decision.latencyMs,
      retryCount: decision.retryCount ?? 0,
      error: decision.error ?? undefined,
      metadata: decision.provider ? {
        provider: decision.provider,
        transport: decision.transport ?? 'unknown',
        promptVersion: decision.promptVersion ?? AI_ARENA_PROMPT_VERSION,
        configSnapshot: decision.configSnapshot ?? {},
        usage: decision.usage,
        finishReason: decision.finishReason,
        responseId: decision.responseId,
        emptyContent: decision.emptyContent,
        validationErrorType: decision.validationErrorType,
        retryCount: decision.retryCount ?? 0,
        fallbackUsed: decision.fallbackUsed ?? false,
        seed: decision.seed,
        worldVersion: decision.worldVersion ?? AI_ARENA_WORLD_VERSION,
      } : undefined,
    });
  }
  return Array.from(byDay.values()).sort((a, b) => a.day - b.day);
}

async function runArenaJob(store: RunStore, job: ArenaJob, request: ArenaStartRequest, runningJobs: Set<string>) {
  runningJobs.add(job.arenaId);
  job.status = 'running';
  job.updatedAt = new Date().toISOString();
  store.updateArenaJob(toArenaJobRecord(job));

  try {
    await Promise.all(job.runs.map(async (runSummary) => {
      if (runSummary.status === 'complete') return;
      runSummary.status = 'running';
      job.updatedAt = new Date().toISOString();
      store.updateArenaJob(toArenaJobRecord(job));
      try {
        await runSingleArenaModel(store, job, runSummary, request);
        runSummary.status = 'complete';
      } catch (error) {
        runSummary.status = 'failed';
        runSummary.error = error instanceof Error ? error.message : String(error);
      } finally {
        job.updatedAt = new Date().toISOString();
        store.updateArenaJob(toArenaJobRecord(job));
      }
    }));

    job.status = job.runs.some((run) => run.status === 'failed') ? 'failed' : 'complete';
    job.updatedAt = new Date().toISOString();
    store.updateArenaJob(toArenaJobRecord(job));
  } finally {
    runningJobs.delete(job.arenaId);
  }
}

async function runSingleArenaModel(
  store: RunStore,
  job: ArenaJob,
  runSummary: ArenaRunSummary,
  request: ArenaStartRequest
) {
  const seed = getArenaSeed(request);
  const observation = runSummary.runId
    ? store.getAiObservation(runSummary.runId)
    : store.createRun('ai', {
      runName: `${PRODUCT_NAME} · ${runSummary.model}`,
      seed,
    });
  const runConfig = buildArenaRunConfig(request, runSummary.model);
  const aiPlayerId = store.getOrCreateAiPlayer(observation.runId, `Arena ${runSummary.model}`, runSummary.model, {
    profile: request.profile ?? 'balanced',
    mode: job.mode,
    maxDays: job.maxDays,
    seed,
    config: runConfig,
  });
  let current = observation;
  runSummary.runId = current.runId;
  runSummary.config = runConfig;
  runSummary.decisions = mergePersistedDecisions(runSummary.decisions, store.getAiDecisions(current.runId), runSummary.model);
  runSummary.totalReward = current.scores.total;
  runSummary.finalCash = Math.round(current.state.cash);
  runSummary.finalTrust = Math.round(current.state.trust);
  store.upsertArenaJobRun(job.arenaId, runSummary);

  while (!current.done && current.state.history.length < job.maxDays) {
    const day = current.state.day;
    runSummary.day = day;
    const memory = buildArenaObservation(current);
    store.createAiMemorySummary(current.runId, day, memory);

    let decision: ArenaDecision;
    let retryCount = 0;
    let traceError: string | undefined;
    let stepped = false;
    try {
      decision = await decideAction({
        observation: current,
        model: runSummary.model,
        mode: job.mode,
        profile: request.profile ?? 'balanced',
        temperature: request.temperature,
        requireJsonSchema: getRequireJsonSchema(request, runSummary.model),
        requireParameters: getRequireParameters(request, runSummary.model),
        observationMode: getObservationMode(request, runSummary.model),
        responseMode: getResponseMode(request, runSummary.model),
        reasoning: getReasoningMode(request, runSummary.model),
        transport: getTransportMode(request, runSummary.model),
        timeoutMs: getTimeoutMs(request, runSummary.model),
        maxTokens: getMaxTokens(request, runSummary.model),
        seed,
        validationFeedback: [],
      });
    } catch (error) {
      traceError = error instanceof Error ? error.message : String(error);
      if (job.mode === 'llm') {
        retryCount = 1;
        try {
          decision = await decideAction({
            observation: current,
            model: runSummary.model,
            mode: job.mode,
            profile: request.profile ?? 'balanced',
            temperature: request.temperature,
            requireJsonSchema: getRequireJsonSchema(request, runSummary.model),
            requireParameters: getRequireParameters(request, runSummary.model),
            observationMode: getObservationMode(request, runSummary.model),
            responseMode: getResponseMode(request, runSummary.model),
            reasoning: getReasoningMode(request, runSummary.model),
            transport: getTransportMode(request, runSummary.model),
            timeoutMs: getTimeoutMs(request, runSummary.model),
            maxTokens: getMaxTokens(request, runSummary.model),
            seed,
            validationFeedback: [
              `Previous action generation failed before simulation: ${traceError}. Return only one valid JSON object matching the action schema.`,
            ],
          });
          decision.metadata = withDecisionMetadata(decision.metadata, request, runSummary.model, retryCount, traceError);
          traceError = undefined;
        } catch (retryGenerationError) {
          traceError = retryGenerationError instanceof Error ? retryGenerationError.message : String(retryGenerationError);
          decision = {
            action: conservativeFallbackAction(current),
            rationale: `Fallback after retry action generation failed: ${traceError}`,
            model: runSummary.model,
            latencyMs: 0,
            metadata: buildDecisionMetadata(request, runSummary.model, {
              retryCount,
              fallbackUsed: true,
              validationErrorType: 'generation',
              emptyContent: /no .*content|no output text/i.test(traceError),
            }),
          };
        }
      } else {
        retryCount = 1;
        decision = {
          action: conservativeFallbackAction(current),
          rationale: `Fallback after model action generation failed: ${traceError}`,
          model: runSummary.model,
          latencyMs: 0,
          metadata: buildDecisionMetadata(request, runSummary.model, {
            retryCount,
            fallbackUsed: true,
            validationErrorType: 'generation',
            emptyContent: /no .*content|no output text/i.test(traceError),
          }),
        };
      }
    }

    try {
      current = stepArenaDay(store, current, aiPlayerId, decision, memory, retryCount, traceError);
      stepped = true;
    } catch (error) {
      const validationError = error instanceof Error ? error.message : String(error);
      traceError = validationError;
      if (job.mode === 'llm' && retryCount === 0) {
        retryCount = 1;
        try {
          decision = await decideAction({
            observation: current,
            model: runSummary.model,
            mode: job.mode,
            profile: request.profile ?? 'balanced',
            temperature: request.temperature,
            requireJsonSchema: getRequireJsonSchema(request, runSummary.model),
            requireParameters: getRequireParameters(request, runSummary.model),
            observationMode: getObservationMode(request, runSummary.model),
            responseMode: getResponseMode(request, runSummary.model),
            reasoning: getReasoningMode(request, runSummary.model),
            transport: getTransportMode(request, runSummary.model),
            timeoutMs: getTimeoutMs(request, runSummary.model),
            maxTokens: getMaxTokens(request, runSummary.model),
            seed,
            validationFeedback: [validationError],
          });
          decision.metadata = withDecisionMetadata(decision.metadata, request, runSummary.model, retryCount, validationError);
        } catch (retryGenerationError) {
          traceError = retryGenerationError instanceof Error ? retryGenerationError.message : String(retryGenerationError);
          decision = {
            action: conservativeFallbackAction(current),
            rationale: `Fallback after retry action generation failed: ${traceError}`,
            model: runSummary.model,
            latencyMs: 0,
            metadata: buildDecisionMetadata(request, runSummary.model, {
              retryCount,
              fallbackUsed: true,
              validationErrorType: 'generation',
              emptyContent: /no .*content|no output text/i.test(traceError),
            }),
          };
        }
        try {
          current = stepArenaDay(store, current, aiPlayerId, decision, memory, retryCount, validationError);
          stepped = true;
          if (!decision.rationale.startsWith('Fallback after retry action generation failed')) {
            traceError = undefined;
          }
        } catch (retryError) {
          traceError = retryError instanceof Error ? retryError.message : String(retryError);
        }
      }
    }

    if (!stepped) {
      retryCount += 1;
      decision = {
        action: conservativeFallbackAction(current),
        rationale: `Fallback after invalid AI action: ${traceError ?? 'unknown validation error'}`,
        model: runSummary.model,
        latencyMs: 0,
        metadata: buildDecisionMetadata(request, runSummary.model, {
          retryCount,
          fallbackUsed: true,
          validationErrorType: 'validation',
        }),
      };
      current = stepArenaDay(store, current, aiPlayerId, decision, memory, retryCount, traceError);
    }

    const latestLog = current.state.history.at(-1);
    runSummary.decisions.push({
      day,
      reward: latestLog?.results.rewardBreakdown.total ?? 0,
      cash: Math.round(current.state.cash),
      trust: Math.round(current.state.trust),
      scoreTotal: current.scores.total,
      action: decision.action,
      rationale: decision.rationale,
      model: decision.model,
      latencyMs: decision.latencyMs,
      retryCount,
      error: traceError,
      metadata: withDecisionMetadata(decision.metadata, request, runSummary.model, retryCount, traceError),
    });
    runSummary.totalReward = current.scores.total;
    runSummary.finalCash = Math.round(current.state.cash);
    runSummary.finalTrust = Math.round(current.state.trust);
    job.updatedAt = new Date().toISOString();
    store.upsertArenaJobRun(job.arenaId, runSummary);
    store.updateArenaJob(toArenaJobRecord(job));
  }
}

function stepArenaDay(
  store: RunStore,
  observation: RunObservation,
  aiPlayerId: string,
  decision: ArenaDecision,
  memory: unknown,
  retryCount: number,
  priorError?: string
) {
  const startedAt = performance.now();
  const qualityErrors = validateArenaDecisionQuality(observation, decision);
  if (qualityErrors.length > 0) {
    const validationError = qualityErrors.join('; ');
    recordDecisionProviderResponse(store, observation, decision.model, decision.metadata, validationError);
    throw new Error(validationError);
  }
  const finalMetadata: ArenaDecisionMetadata | undefined = decision.metadata
    ? {
      ...decision.metadata,
      retryCount,
      fallbackUsed: decision.rationale.startsWith('Fallback after') || decision.metadata.fallbackUsed,
      validationErrorType: priorError
        ? decision.metadata.validationErrorType ?? classifyArenaError(priorError)
        : decision.metadata.validationErrorType,
      emptyContent: decision.metadata.emptyContent ?? Boolean(priorError && /no .*content|no output text/i.test(priorError)),
    }
    : undefined;
  store.createAiDecision({
    runId: observation.runId,
    aiPlayerId,
    day: observation.state.day,
    observation: memory,
    action: decision.action,
    rationale: retryCount > 0 && priorError
      ? `${decision.rationale} Retry/fallback after validation: ${priorError}`
      : decision.rationale,
    model: decision.model,
    latencyMs: Math.max(decision.latencyMs, Math.round(performance.now() - startedAt)),
    error: priorError,
    metadata: finalMetadata,
  });
  recordDecisionProviderResponse(store, observation, decision.model, finalMetadata, priorError);
  return store.stepOpenEnvRun(observation.runId, decision.action).observation;
}

function recordDecisionProviderResponse(
  store: RunStore,
  observation: RunObservation,
  model: string,
  metadata: ArenaDecisionMetadata | undefined,
  rawError?: string
) {
  if (!metadata?.provider || metadata.provider === 'local') return;
  store.recordAiProviderResponse({
    runId: observation.runId,
    day: observation.state.day,
    model,
    provider: metadata.provider,
    transport: metadata.transport,
    responseId: metadata.responseId,
    finishReason: metadata.finishReason,
    usage: metadata.usage,
    requestJson: metadata.requestJson,
    responseText: metadata.responseText,
    emptyContent: metadata.emptyContent,
    errorClass: rawError ? metadata.validationErrorType ?? classifyArenaError(rawError) : undefined,
    rawError,
  });
}

function validateArenaDecisionQuality(observation: RunObservation, decision: ArenaDecision): string[] {
  if (decision.rationale.startsWith('Fallback after')) return [];

  const state = GameState.fromSerialized(observation.state);
  const errors: string[] = [];
  const orderedProductIds = Object.entries(decision.action.orders)
    .filter(([, qty]) => typeof qty === 'number' && qty > 0)
    .map(([productId]) => productId as ProductId);
  const totalStock = PRODUCTS.reduce((sum, product) => {
    return sum + (state.getProductInventory(product.id)?.totalStock ?? 0);
  }, 0);

  if (state.day === 1 && totalStock === 0 && orderedProductIds.length < 3) {
    errors.push([
      `Action JSON orders only ${orderedProductIds.length} SKU(s) on empty Day 1 shelves.`,
      'Return numeric unit quantities in action.orders, for example {"milk":35,"bread":15,"eggs":12}.',
    ].join(' '));
  }

  const mentionedMissing = getRationaleOrderMentions(decision.rationale)
    .filter((productId) => !orderedProductIds.includes(productId));
  if (mentionedMissing.length >= 2) {
    errors.push([
      `Rationale says to order ${mentionedMissing.join(', ')}, but action.orders does not include them.`,
      'Make rationale match the exact action JSON.',
    ].join(' '));
  }

  const mentionedCampaignIds = getMentionedCampaignIds(decision.rationale, observation.availableMarketing);
  const selectedCampaignIds = new Set((decision.action.marketingActions ?? []).map((action) => action.specId));
  const missingCampaignIds = mentionedCampaignIds.filter((campaignId) => !selectedCampaignIds.has(campaignId));
  if (missingCampaignIds.length > 0) {
    errors.push([
      `Rationale says to run marketing campaign(s) ${missingCampaignIds.join(', ')}, but action.marketingActions does not include them.`,
      'Add entries like {"specId":"chalkboard_offer","targetProducts":["chips","cold_drinks","maggi"]}, or remove the campaign claim from rationale.',
    ].join(' '));
  } else if (mentionsGenericMarketingIntent(decision.rationale) && (decision.action.marketingActions ?? []).length === 0) {
    errors.push([
      'Rationale says to run marketing or a promotion, but action.marketingActions is empty.',
      'If marketing is intended, include a valid available campaign with targetProducts. If not, remove the marketing claim from rationale.',
    ].join(' '));
  }

  const khataCustomers = state.customers.filter((customer) => customer.khataBalance > 0);
  if (mentionsKhataReminderIntent(decision.rationale) && (decision.action.khataReminders ?? []).length === 0 && khataCustomers.length > 0) {
    const exampleIds = khataCustomers.slice(0, 3).map((customer) => customer.id);
    errors.push([
      'Rationale says to send khata/payment reminders, but action.khataReminders is empty.',
      `Add customer id(s), for example ${JSON.stringify(exampleIds)}, or remove the khata reminder claim from rationale.`,
    ].join(' '));
  }

  const missingDiscounts = getRationaleDiscountMentions(decision.rationale)
    .filter((productId) => (decision.action.discounts[productId] ?? 0) <= 0);
  if (missingDiscounts.length > 0) {
    errors.push([
      `Rationale says to discount ${missingDiscounts.join(', ')}, but action.discounts does not include a positive discount for them.`,
      'Use one of 10, 15, or 20, or remove the discount claim from rationale.',
    ].join(' '));
  }

  return errors;
}

function getMentionedCampaignIds(
  rationale: string,
  availableCampaigns: RunObservation['availableMarketing']
): string[] {
  if (hasNegativeMarketingIntent(rationale)) return [];
  const campaignIntentSentences = splitRationaleSentences(rationale)
    .filter(hasCampaignSelectionIntent)
    .map(normalizeRationaleText);
  return availableCampaigns
    .filter((campaign) => {
      const candidates = [
        campaign.id,
        campaign.name,
        campaign.name.replace(/\s+/g, '_'),
      ].map(normalizeRationaleText);
      return campaignIntentSentences.some((sentence) => {
        return candidates.some((candidate) => candidate.length > 2 && sentence.includes(candidate));
      });
    })
    .map((campaign) => campaign.id);
}

function mentionsGenericMarketingIntent(rationale: string): boolean {
  if (hasNegativeMarketingIntent(rationale)) return false;
  return splitRationaleSentences(rationale)
    .some((sentence) => hasCampaignSelectionIntent(sentence) && /\b(marketing|campaign|promotion|offer|whatsapp|status|pamphlet|loyalty|recovery|combo)\b/i.test(sentence));
}

function hasCampaignSelectionIntent(sentence: string): boolean {
  if (hasNegativeMarketingIntent(sentence)) return false;
  const passiveContinuation = /\b(already|currently|existing|ongoing|active|continues?|continuing|carry over|carried over|from yesterday|previously|queued|scheduled|pipeline|effect|effects|activated|activating)\b/i.test(sentence);
  const directAction = /\b(activate|run|start|launch|select|add|use|deploy|schedule|book|initiate|promote|push)\b/i.test(sentence);
  const plannedByActor = /\b(i am|i'm|we are|we're|will|going to|plan to|planning to)\b.{0,50}\b(activate|run|start|launch|select|add|use|deploy|schedule|book|initiate|promote|push)\b.{0,120}\b(marketing|campaign|promotion|offer|whatsapp|status|pamphlet|loyalty|recovery|combo)\b/i.test(sentence);
  if (passiveContinuation && !directAction && !plannedByActor) return false;
  return directAction || plannedByActor;
}

function hasNegativeMarketingIntent(rationale: string): boolean {
  return /\b(no|skip|avoid|without|defer|do not|don't|not running|not use)\s+(marketing|campaign|promotion|offer|whatsapp|status|pamphlet|loyalty|recovery)\b/i.test(rationale);
}

function mentionsKhataReminderIntent(rationale: string): boolean {
  if (/\b(no|skip|avoid|without|defer|do not|don't)\s+(khata|reminder|payment reminder|dues reminder|follow[- ]?up)\b/i.test(rationale)) {
    return false;
  }
  return /\b(khata reminder|khata follow[- ]?up|khata recovery|recover khata|collect khata|payment reminder|dues reminder|collect dues|recover dues|recover cash|recover outstanding|send reminder|remind customer|follow up)\b/i.test(rationale);
}

function getRationaleDiscountMentions(rationale: string): ProductId[] {
  if (!/\b(discount|discounts|discounted)\b/i.test(rationale)) return [];
  const positiveDiscountSentences = splitRationaleSentences(rationale)
    .filter((sentence) => /\b(discount|discounts|discounted)\b/i.test(sentence))
    .filter((sentence) => !hasNegativeDiscountIntent(sentence))
    .filter(hasPositiveDiscountIntent);
  return Array.from(new Set(positiveDiscountSentences.flatMap(getMentionedProducts)));
}

function getRationaleOrderMentions(rationale: string): ProductId[] {
  const lower = rationale.toLowerCase();
  if (!/(order|buy|stock|purchase)/.test(lower)) return [];
  return getMentionedProducts(rationale);
}

function getMentionedProducts(rationale: string): ProductId[] {
  return PRODUCTS
    .filter((product) => {
      const idText = product.id.replace(/_/g, '[ _-]');
      const nameText = product.name.toLowerCase().replace(/\s+/g, '[ _-]');
      return new RegExp(`\\b(${idText}|${nameText})\\b`, 'i').test(rationale);
    })
    .map((product) => product.id);
}

function splitRationaleSentences(rationale: string): string[] {
  return rationale
    .split(/[.!?;\n]+/)
    .map((sentence) => sentence.trim())
    .filter(Boolean);
}

function hasNegativeDiscountIntent(text: string): boolean {
  return /\b(no|skip|avoid|without|defer|do not|don't|not applying|not using|not use|no need for)\b.{0,50}\b(discount|discounts|discounted)\b/i.test(text)
    || /\b(discount|discounts|discounted)\b.{0,30}\b(not needed|not required|avoided|skipped)\b/i.test(text);
}

function hasPositiveDiscountIntent(text: string): boolean {
  return /\b(apply|set|give|run|use|add|select|put|offer)\b.{0,50}\b(discount|discounts|discounted)\b/i.test(text)
    || /\b(discount|discounts|discounted)\b.{0,50}\b(on|for|to)\b/i.test(text)
    || /\b(discounting|discounted)\b/i.test(text);
}

function normalizeRationaleText(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
}

interface ArenaDecision {
  action: PlayerActions;
  rationale: string;
  model: string;
  latencyMs: number;
  metadata?: ArenaDecisionMetadata;
}

interface DecisionTransportResult {
  content: string;
  usage?: unknown;
  finishReason?: string;
  responseId?: string;
  requestJson?: unknown;
  responseText?: string;
  emptyContent?: boolean;
}

async function decideAction(params: {
  observation: RunObservation;
  model: string;
  mode: ArenaMode;
  profile: string;
  temperature?: number;
  requireJsonSchema?: boolean;
  requireParameters?: boolean;
  observationMode: ArenaObservationMode;
  responseMode: ArenaResponseMode;
  reasoning: ArenaReasoningMode;
  transport: ArenaTransportMode;
  timeoutMs: number;
  maxTokens: number;
  seed?: number;
  validationFeedback: string[];
}): Promise<ArenaDecision> {
  if (params.mode === 'heuristic' || params.model === 'heuristic-v2') {
    const startedAt = performance.now();
    return {
      action: buildHeuristicAction(params.observation, params.profile),
      rationale: 'Heuristic baseline: restock missed demand and essentials, protect cash, discount only risky perishables, and use low-cost marketing.',
      model: params.model,
      latencyMs: Math.round(performance.now() - startedAt),
      metadata: buildDecisionMetadata(params, params.model, {
        provider: 'local',
        transport: 'heuristic',
      }),
    };
  }

  if (isSarvamModel(params.model)) {
    return requestSarvamDecision(params);
  }

  return requestOpenRouterDecision(params);
}

async function requestSarvamDecision(params: {
  observation: RunObservation;
  model: string;
  temperature?: number;
  requireJsonSchema?: boolean;
  observationMode: ArenaObservationMode;
  responseMode: ArenaResponseMode;
  reasoning: ArenaReasoningMode;
  transport: ArenaTransportMode;
  timeoutMs: number;
  maxTokens: number;
  seed?: number;
  validationFeedback: string[];
}): Promise<ArenaDecision> {
  const apiKey = process.env.SARVAM_API_KEY;
  if (!apiKey) throw new Error('SARVAM_API_KEY is required for Sarvam arena mode');

  const startedAt = performance.now();
  const promptPayload = buildArenaObservationForModel(
    params.observation,
    params.validationFeedback,
    params.observationMode
  );

  try {
    const result = await callSarvamChatCompletions({
      apiKey,
      model: params.model,
      temperature: params.temperature,
      promptPayload,
      responseMode: params.responseMode,
      reasoning: params.reasoning,
      timeoutMs: params.timeoutMs,
      maxTokens: params.maxTokens,
    });
    const parsed = parseDecisionJson(result.content);
    return {
      action: sanitizeArenaAction(parsed, params.observation),
      rationale: getDecisionRationale(parsed),
      model: params.model,
      latencyMs: Math.round(performance.now() - startedAt),
      metadata: buildDecisionMetadata(params, params.model, {
        provider: 'sarvam',
        transport: 'chat_completions',
	        usage: result.usage,
	        finishReason: result.finishReason,
	        responseId: result.responseId,
	        requestJson: result.requestJson,
	        responseText: result.responseText,
	        emptyContent: result.emptyContent,
	      }),
	    };
  } catch (error) {
    if (params.requireJsonSchema || isAbortError(error)) throw error;
    const result = await callSarvamChatCompletions({
      apiKey,
      model: params.model,
      temperature: params.temperature,
      promptPayload,
      responseMode: 'text',
      reasoning: params.reasoning,
      timeoutMs: params.timeoutMs,
      maxTokens: params.maxTokens,
    });
    const parsed = parseDecisionJson(result.content);
    return {
      action: sanitizeArenaAction(parsed, params.observation),
      rationale: getDecisionRationale(parsed),
      model: params.model,
      latencyMs: Math.round(performance.now() - startedAt),
      metadata: buildDecisionMetadata(params, params.model, {
        provider: 'sarvam',
        transport: 'chat_completions_text_fallback',
	        usage: result.usage,
	        finishReason: result.finishReason,
	        responseId: result.responseId,
	        requestJson: result.requestJson,
	        responseText: result.responseText,
	        emptyContent: result.emptyContent,
	      }),
	    };
  }
}

async function requestOpenRouterDecision(params: {
  observation: RunObservation;
  model: string;
  temperature?: number;
  requireJsonSchema?: boolean;
  requireParameters?: boolean;
  observationMode: ArenaObservationMode;
  responseMode: ArenaResponseMode;
  reasoning: ArenaReasoningMode;
  timeoutMs: number;
  maxTokens: number;
  seed?: number;
  validationFeedback: string[];
}): Promise<ArenaDecision> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) throw new Error('OPENROUTER_API_KEY is required for LLM arena mode');

  const startedAt = performance.now();
  const promptPayload = buildArenaObservationForModel(
    params.observation,
    params.validationFeedback,
    params.observationMode
  );
  const initialResponseMode = params.responseMode;

  try {
    const result = await callOpenRouterDecisionTransport({
      apiKey,
      model: params.model,
      temperature: params.temperature,
      promptPayload,
      responseMode: initialResponseMode,
      reasoning: params.reasoning,
      transport: params.transport,
      requireParameters: params.requireParameters,
      timeoutMs: params.timeoutMs,
      maxTokens: params.maxTokens,
    });
    const parsed = parseDecisionJson(result.content);
    return {
      action: sanitizeArenaAction(parsed, params.observation),
      rationale: getDecisionRationale(parsed),
      model: params.model,
      latencyMs: Math.round(performance.now() - startedAt),
      metadata: buildDecisionMetadata(params, params.model, {
        provider: 'openrouter',
        transport: resolveOpenRouterTransport(params.model, params.transport) === 'responses' ? 'responses' : 'chat_completions',
	        usage: result.usage,
	        finishReason: result.finishReason,
	        responseId: result.responseId,
	        requestJson: result.requestJson,
	        responseText: result.responseText,
	        emptyContent: result.emptyContent,
	      }),
	    };
  } catch (error) {
    if (params.requireJsonSchema || isAbortError(error)) throw error;
    const result = await callOpenRouterDecisionTransport({
      apiKey,
      model: params.model,
      temperature: params.temperature,
      promptPayload,
      responseMode: 'text',
      reasoning: params.reasoning,
      transport: params.transport,
      requireParameters: false,
      timeoutMs: params.timeoutMs,
      maxTokens: params.maxTokens,
    });
    const parsed = parseDecisionJson(result.content);
    return {
      action: sanitizeArenaAction(parsed, params.observation),
      rationale: getDecisionRationale(parsed),
      model: params.model,
      latencyMs: Math.round(performance.now() - startedAt),
      metadata: buildDecisionMetadata(params, params.model, {
        provider: 'openrouter',
        transport: resolveOpenRouterTransport(params.model, params.transport) === 'responses' ? 'responses_text_fallback' : 'chat_completions_text_fallback',
	        usage: result.usage,
	        finishReason: result.finishReason,
	        responseId: result.responseId,
	        requestJson: result.requestJson,
	        responseText: result.responseText,
	        emptyContent: result.emptyContent,
	      }),
	    };
  }
}

async function callOpenRouterDecisionTransport(params: {
  apiKey: string;
  model: string;
  temperature?: number;
  promptPayload: unknown;
  responseMode: ArenaResponseMode;
  reasoning: ArenaReasoningMode;
  transport: ArenaTransportMode;
  requireParameters?: boolean;
  timeoutMs: number;
  maxTokens: number;
}): Promise<DecisionTransportResult> {
  return resolveOpenRouterTransport(params.model, params.transport) === 'responses'
    ? callOpenRouterResponses(params)
    : callOpenRouterChatCompletions(params);
}

async function callSarvamChatCompletions(params: {
  apiKey: string;
  model: string;
  temperature?: number;
  promptPayload: unknown;
  responseMode: ArenaResponseMode;
  reasoning: ArenaReasoningMode;
  timeoutMs: number;
  maxTokens: number;
}): Promise<DecisionTransportResult> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), params.timeoutMs);
  const body: Record<string, unknown> = {
    model: params.model,
    messages: [
      { role: 'system', content: AI_ARENA_SYSTEM_PROMPT },
      { role: 'user', content: JSON.stringify(params.promptPayload) },
    ],
    temperature: params.temperature ?? 0.15,
    top_p: 1,
    max_tokens: params.maxTokens,
    reasoning_effort: getSarvamReasoningEffort(params.reasoning),
  };

  if (params.responseMode === 'json_schema') {
    body.response_format = {
      type: 'json_schema',
      json_schema: {
        name: 'kirana_arena_action',
        strict: true,
        schema: AI_ARENA_RESPONSE_SCHEMA,
      },
    };
  } else if (params.responseMode === 'json_object') {
    body.response_format = { type: 'json_object' };
  }

  try {
    const response = await fetch('https://api.sarvam.ai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'api-subscription-key': params.apiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    if (!response.ok) {
      const details = await response.text().catch(() => '');
      throw new Error(`Sarvam ${params.model} failed with ${response.status}: ${details.slice(0, 500)}`);
    }

    const data = await response.json() as {
      id?: string;
      usage?: unknown;
      choices?: Array<{
        finish_reason?: string;
        message?: {
          content?: unknown;
          reasoning_content?: string;
        };
      }>;
    };
    const choice = data.choices?.[0];
    const content = extractTextContent(choice?.message?.content);
    if (!content) {
      const finishReason = choice?.finish_reason ?? 'unknown';
      const reasoningLength = choice?.message?.reasoning_content?.length ?? 0;
      throw new Error(
        `Sarvam ${params.model} returned no message content (finish_reason=${finishReason}, reasoning_chars=${reasoningLength})`
      );
    }
	    return {
	      content,
	      usage: data.usage,
	      finishReason: choice?.finish_reason,
	      responseId: data.id,
	      requestJson: body,
	      responseText: content,
	      emptyContent: false,
	    };
  } finally {
    clearTimeout(timeout);
  }
}

async function callOpenRouterChatCompletions(params: {
  apiKey: string;
  model: string;
  temperature?: number;
  promptPayload: unknown;
  responseMode: ArenaResponseMode;
  reasoning: ArenaReasoningMode;
  requireParameters?: boolean;
  timeoutMs: number;
  maxTokens: number;
}): Promise<DecisionTransportResult> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), params.timeoutMs);
  const body: Record<string, unknown> = {
    model: params.model,
    messages: [
      { role: 'system', content: AI_ARENA_SYSTEM_PROMPT },
      {
        role: 'user',
        content: JSON.stringify(params.promptPayload),
      },
    ],
    temperature: params.temperature ?? 0.25,
    max_tokens: params.maxTokens,
  };

  if (params.reasoning !== 'off') {
    body.reasoning = { effort: params.reasoning, exclude: true };
  }

  if (params.responseMode === 'json_schema') {
    body.response_format = {
      type: 'json_schema',
      json_schema: {
        name: 'kirana_arena_action',
        strict: true,
        schema: AI_ARENA_RESPONSE_SCHEMA,
      },
    };
  } else if (params.responseMode === 'json_object') {
    body.response_format = { type: 'json_object' };
  }

  if (params.responseMode !== 'text') {
    body.plugins = [{ id: 'response-healing' }];
  }

  if (params.requireParameters && params.responseMode !== 'text') {
    body.provider = { require_parameters: true };
  }

  try {
    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${params.apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'http://localhost:5175',
        'X-Title': PRODUCT_NAME,
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    if (!response.ok) {
      const details = await response.text().catch(() => '');
      throw new Error(`OpenRouter ${params.model} failed with ${response.status}: ${details.slice(0, 500)}`);
    }

    const data = await response.json() as {
      id?: string;
      usage?: unknown;
      choices?: Array<{ finish_reason?: string; message?: { content?: unknown } }>;
    };
    const choice = data.choices?.[0];
    const content = extractTextContent(choice?.message?.content);
    if (!content) throw new Error(`OpenRouter ${params.model} returned no message content`);
	    return {
	      content,
	      usage: data.usage,
	      finishReason: choice?.finish_reason,
	      responseId: data.id,
	      requestJson: body,
	      responseText: content,
	      emptyContent: false,
	    };
  } finally {
    clearTimeout(timeout);
  }
}

async function callOpenRouterResponses(params: {
  apiKey: string;
  model: string;
  temperature?: number;
  promptPayload: unknown;
  responseMode: ArenaResponseMode;
  reasoning: ArenaReasoningMode;
  requireParameters?: boolean;
  timeoutMs: number;
  maxTokens: number;
}): Promise<DecisionTransportResult> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), params.timeoutMs);
  const body: Record<string, unknown> = {
    model: params.model,
    instructions: AI_ARENA_SYSTEM_PROMPT,
    input: JSON.stringify(params.promptPayload),
    temperature: params.temperature ?? 0.25,
    max_output_tokens: params.maxTokens,
    stream: false,
    store: false,
  };

  if (params.reasoning !== 'off') {
    body.reasoning = { effort: params.reasoning, exclude: true };
  }

  if (params.responseMode === 'json_schema') {
    body.text = {
      format: {
        type: 'json_schema',
        name: 'kirana_arena_action',
        strict: true,
        schema: AI_ARENA_OPENAI_RESPONSES_SCHEMA,
      },
    };
  } else if (params.responseMode === 'json_object') {
    body.text = { format: { type: 'json_object' } };
  }

  if (params.responseMode !== 'text') {
    body.plugins = [{ id: 'response-healing' }];
  }

  try {
    const response = await fetch('https://openrouter.ai/api/v1/responses', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${params.apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'http://localhost:5175',
        'X-Title': PRODUCT_NAME,
        'X-OpenRouter-Title': PRODUCT_NAME,
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    if (!response.ok) {
      const details = await response.text().catch(() => '');
      throw new Error(`OpenRouter Responses ${params.model} failed with ${response.status}: ${details.slice(0, 500)}`);
    }

    const data = await response.json() as Record<string, unknown>;
    const content = extractResponsesText(data);
    if (!content) {
      const status = typeof data.status === 'string' ? data.status : 'unknown';
      const responseId = typeof data.id === 'string' ? data.id : 'unknown';
      const error = formatOpenRouterResponseField(data.error);
      const incomplete = formatOpenRouterResponseField(data.incomplete_details);
      throw new Error(
        `OpenRouter Responses ${params.model} returned no output text (id=${responseId}, status=${status}${error}${incomplete})`
      );
    }
	    return {
	      content,
	      usage: data.usage,
	      finishReason: extractResponsesFinishReason(data),
	      responseId: typeof data.id === 'string' ? data.id : undefined,
	      requestJson: body,
	      responseText: content,
	      emptyContent: false,
	    };
  } finally {
    clearTimeout(timeout);
  }
}

function buildArenaObservationForModel(
  observation: RunObservation,
  validationFeedback: string[],
  mode: ArenaObservationMode
) {
  return mode === 'compact'
    ? buildCompactArenaObservation(observation, validationFeedback)
    : buildArenaObservation(observation, validationFeedback);
}

export function buildArenaObservation(observation: RunObservation, validationFeedback: string[] = []) {
  const state = GameState.fromSerialized(observation.state);
  const lastLog = state.history.at(-1);
  const signalEngine = new EnvironmentSignalEngine();
  const environmentSignals = lastLog
    ? signalEngine.build({
      completedDay: lastLog.day,
      maxDays: state.config.maxDays,
      customers: state.customers,
      result: lastLog.results,
    })
    : signalEngine.buildOpening({
      maxDays: state.config.maxDays,
      customers: state.customers,
    });
  const fridgePressure = state.getFridgeUsage() / state.config.fridgeCapacity;
  const recentLogs = state.history.slice(-5);

  return {
    contract: {
      episodeId: observation.runId,
      oneStepEqualsOneDay: true,
      stepNumber: state.history.length,
      currentDecisionDay: state.day,
      maxDays: state.config.maxDays,
      done: observation.done,
      responseShape: '{ "action": PlayerActions, "rationale": string }',
    },
    shop: {
      name: SHOP_NAME,
      cash: Math.round(state.cash),
      trust: Math.round(state.trust),
      scoreSoFar: state.getTotalScore(),
      currentWeather: state.weather,
      cashReserveDefault: DEFAULT_CONFIG.defaultCashReserve,
    },
    neighborhood: DEFAULT_NEIGHBORHOOD_PROFILE,
    environment: environmentSignals,
    inventory: PRODUCTS.map((product) => {
      const inv = state.getProductInventory(product.id);
      const recent = recentLogs.map((log) => itemLogFor(product.id, log)).filter(Boolean);
      const perishability = PerishabilityEngine.summarizeProduct(product, inv, state.day, state.weather, fridgePressure);
      return {
        id: product.id,
        name: product.name,
        unit: product.unit,
        currentStock: inv?.totalStock ?? 0,
        discountPct: inv?.discountPct ?? 0,
        orderIncrement: product.orderIncrement,
        costPrice: product.costPrice,
        sellPrice: product.sellPrice,
        margin: product.margin,
        historicalBaselineDemand: product.baseDemand,
        baselineDemandNote: 'Reference only, not tomorrow demand. Use recent sold/missed history, environment, customers, weather, and marketing.',
        demandVarianceReference: product.demandVariance,
        storage: product.storage,
        shelfLife: product.shelfLife,
        trustImpact: product.trustImpact,
        perishability,
        recent,
      };
    }),
    customers: summarizeCustomers(state.customers),
    marketing: {
      activeOrScheduled: observation.activeMarketing,
      availableCampaigns: observation.availableMarketing.map((campaign) => ({
        id: campaign.id,
        name: campaign.name,
        channel: campaign.channel,
        targetSegments: campaign.targetSegments,
        targetProducts: campaign.targetProducts,
        cost: campaign.cost,
        delayDays: campaign.delayDays,
        durationDays: campaign.durationDays,
        expectedReturn: campaign.expectedReturn,
        riskNotes: campaign.riskNotes,
      })),
    },
    recentDays: recentLogs.map(summarizeDayLog),
    rewardRules: {
      dailyRewardBuckets: ['service', 'inventory', 'money', 'relationships', 'marketing', 'operations', 'penalties'],
      trustMechanics: [
        'Shop trust changes from severity-weighted stockouts, named customer trust deltas, essential service, and no-stockout days.',
        'Small stockouts hurt less than large stockouts, but milk and bread still matter most.',
        'Serving named customers and using relationship campaigns can help trust recover.',
      ],
      goodPlay: [
        'Serve high-trust essentials such as milk and bread.',
        'Avoid promoted-product stockouts after marketing.',
        'Keep enough cash for correction orders.',
        'Use discounts to clear risky stock, not to blindly cut margin.',
        'Follow up khata when customers owe money.',
      ],
      badPlay: [
        'Over-ordering perishables causes waste and trapped cash.',
        'Marketing without stock can reduce trust and marketing score.',
        'Running out of essentials hurts repeat customers.',
      ],
    },
    actionRules: {
      productIds: PRODUCT_IDS,
      discountOptions: DISCOUNT_OPTIONS,
      orderPackSizes: Object.fromEntries(PRODUCTS.map((product) => [product.id, product.orderIncrement])),
      maxMarketingSelections: 3,
      budgetRule: 'orders cost + newly selected campaign cost must be <= current cash',
      campaignTargetRule: 'marketingActions.targetProducts must be a non-empty subset of the campaign targetProducts',
      consistencyRule: 'If rationale says you will run a campaign, send a khata reminder, or apply a discount, the matching action JSON field must contain it.',
      actionFirstRule: 'The simulator only executes action JSON. Rationale cannot create orders, campaigns, reminders, or discounts.',
      discountRule: 'discounts values must be numeric percentages from [0,10,15,20]. Example: {"milk":10}. If no shelf discount is intended, use 0 or omit the item and say "No shelf discounts today."',
    },
    actionExamples: {
      marketingAction: {
        marketingActions: [
          { specId: 'chalkboard_offer', targetProducts: ['chips', 'cold_drinks', 'maggi'] },
        ],
      },
      khataReminder: {
        khataReminders: state.customers
          .filter((customer) => customer.khataBalance > 0)
          .slice(0, 2)
          .map((customer) => customer.id),
      },
      discountAction: {
        discounts: { bananas: 15 },
      },
      noDiscountAction: {
        discounts: {},
        rationaleWording: 'No shelf discounts today.',
      },
    },
    validationFeedback,
  };
}

export function buildCompactArenaObservation(observation: RunObservation, validationFeedback: string[] = []) {
  const state = GameState.fromSerialized(observation.state);
  const lastLog = state.history.at(-1);
  const signalEngine = new EnvironmentSignalEngine();
  const signals = lastLog
    ? signalEngine.build({
      completedDay: lastLog.day,
      maxDays: state.config.maxDays,
      customers: state.customers,
      result: lastLog.results,
    })
    : signalEngine.buildOpening({
      maxDays: state.config.maxDays,
      customers: state.customers,
    });
  const recentLogs = state.history.slice(-3);
  const fridgePressure = state.getFridgeUsage() / state.config.fridgeCapacity;

  return {
    contract: {
      oneStepEqualsOneDay: true,
      day: state.day,
      maxDays: state.config.maxDays,
      output: 'Return only {"action": PlayerActions, "rationale": string}.',
    },
    shop: {
      cash: Math.round(state.cash),
      trust: Math.round(state.trust),
      score: state.getTotalScore(),
      weather: state.weather,
    },
    neighborhood: compactNeighborhoodForArena(),
    signals: {
      day: `${signals.dayName} ${signals.dateLabel}`,
      weather: `${signals.tomorrowWeather.weather} ${signals.tomorrowWeather.temperature}C ${signals.tomorrowWeather.confidence}`,
      calendar: signals.calendarSignals,
      customers: signals.customerSignals,
      market: signals.marketSignals,
      memory: signals.shopMemorySignals,
      week: signals.week.map((day) => ({
        d: day.dayName.slice(0, 3),
        weather: day.weather,
        temp: day.temperature,
        confidence: day.confidence,
        tag: day.tag,
      })),
    },
    inventory: PRODUCTS.map((product) => {
      const inv = state.getProductInventory(product.id);
      const recent = recentLogs.map((log) => itemLogFor(product.id, log)).filter(Boolean);
      const last = recent.at(-1);
      const perishability = PerishabilityEngine.summarizeProduct(product, inv, state.day, state.weather, fridgePressure);
      return {
        id: product.id,
        stock: inv?.totalStock ?? 0,
        unit: product.unit,
        pack: product.orderIncrement,
        cost: product.costPrice,
        price: product.sellPrice,
        margin: product.margin,
        historicalBaselineDemand: product.baseDemand,
        baselineNote: 'reference only; infer tomorrow from signals + recent history',
        trust: product.trustImpact,
        shelfLife: product.shelfLife,
        perishability: perishability.statusLabel,
        riskUnits: perishability.riskUnits,
        last,
      };
    }),
    customers: {
      khata: state.customers
        .filter((customer) => customer.khataBalance > 0)
        .map((customer) => ({
          id: customer.id,
          group: customer.groupId,
          persona: customer.persona,
          segment: customer.segment,
          balance: Math.round(customer.khataBalance),
          trust: Math.round(customer.trust),
        }))
        .slice(0, 6),
      atRisk: state.customers
        .filter((customer) => customer.trust < 55 || customer.failedVisits >= 2)
        .map((customer) => ({
          id: customer.id,
          group: customer.groupId,
          persona: customer.persona,
          segment: customer.segment,
          trust: Math.round(customer.trust),
          failed: customer.failedVisits,
        }))
        .slice(0, 6),
    },
    marketing: {
      active: observation.activeMarketing.map((campaign) => ({
        specId: campaign.specId,
        products: campaign.targetProducts,
        start: campaign.effectStartDay,
        end: campaign.effectEndDay,
        cost: campaign.cost,
      })),
      available: observation.availableMarketing.map((campaign) => ({
        id: campaign.id,
        cost: campaign.cost,
        delay: campaign.delayDays,
        duration: campaign.durationDays,
        products: campaign.targetProducts,
        segments: campaign.targetSegments,
      })),
    },
    recentDays: recentLogs.map((log) => ({
      day: log.day,
      reward: log.results.rewardBreakdown.total,
      cash: log.results.cash,
      trust: Math.round(log.results.trust),
      profit: log.results.profit,
      missed: log.results.inventoryMovements
        .filter((row) => row.missedDemand > 0)
        .map((row) => [row.productId, row.missedDemand]),
      stockouts: log.results.stockouts,
      trustBreakdown: log.results.trustBreakdown,
      marketing: log.results.marketingPerformance.score,
    })),
    rules: {
      products: PRODUCT_IDS,
      discounts: DISCOUNT_OPTIONS,
      maxCampaigns: 3,
      budget: 'orders cost + new campaign cost must fit cash',
      orderQuantities: 'orders values are item units, not pack counts. milk 10 = 10 L. cold_drinks 12 = 12 bottles.',
      objective: 'maximize 30-day reward while keeping trust, cash, service, marketing ROI, and low waste',
      trust: 'Trust changes from stockout severity + named customer trust + essential service + no-stockout bonus. Recent days include trustBreakdown.',
      consistency: 'If rationale says campaign/reminder/discount, the matching action field must be non-empty. The simulator executes JSON only.',
      discountFormat: 'Use numeric discount values only: {"milk":10}, not "10%". If no discount is intended, say "No shelf discounts today."',
    },
    examples: {
      marketingAction: [{ specId: 'chalkboard_offer', targetProducts: ['chips', 'cold_drinks', 'maggi'] }],
      khataReminders: state.customers
        .filter((customer) => customer.khataBalance > 0)
        .slice(0, 2)
        .map((customer) => customer.id),
      discounts: { bananas: 15 },
      noDiscounts: {},
    },
    validationFeedback,
  };
}

function compactNeighborhoodForArena() {
  const profile = DEFAULT_NEIGHBORHOOD_PROFILE;
  return {
    name: profile.name,
    fixedForFairArena: true,
    location: profile.shopLocation.footfallProfile,
    catchmentRadiusMeters: profile.shopLocation.catchmentRadiusMeters,
    nearbyDemandEngines: profile.nearbyPlaces.map((place) => ({
      type: place.type,
      name: place.name,
      distanceMeters: place.distanceMeters,
      households: place.households,
      population: place.population,
      dailyPassersby: place.dailyPassersby,
      segments: place.dominantSegments,
      waves: place.peakWaves,
      signals: place.demandSignals,
    })),
    segmentPressures: profile.demographics.map((group) => ({
      segment: group.segment,
      label: group.label,
      reachablePopulation: group.reachablePopulation,
      baseVisitRatePct: group.baseVisitRatePct,
      peaks: group.peakWaves,
      basket: group.basketStyle,
      payment: group.paymentStyle,
      trustSensitivity: group.trustSensitivity,
      marketingSensitivity: group.marketingSensitivity,
      commonNeeds: group.commonNeeds,
    })),
    commute: profile.commuteFlow,
    reasoningSignals: profile.aiVisibleSignals,
  };
}

function itemLogFor(productId: ProductId, log: DayLog) {
  const movement = log.results.inventoryMovements.find((row) => row.productId === productId);
  if (!movement) return undefined;
  return {
    day: log.day,
    opening: movement.openingShelf ?? movement.available,
    ordered: movement.ordered,
    sold: movement.sold,
    missed: movement.missedDemand,
    closing: movement.closing,
    wasted: movement.wasted,
    offerPct: movement.offerPct,
  };
}

function summarizeCustomers(customers: CustomerProfile[]) {
  return customers.map((customer) => ({
    id: customer.id,
    name: customer.name,
    segment: customer.segment,
    groupId: customer.groupId,
    persona: customer.persona,
    loyaltyTier: customer.behavior?.loyaltyTier,
    behavior: customer.behavior ? {
      patience: customer.behavior.patience,
      promotionAffinity: customer.behavior.promotionAffinity,
      environmentSensitivity: customer.behavior.environmentSensitivity,
      relationshipSensitivity: customer.behavior.relationshipSensitivity,
      khataReliability: customer.behavior.khataReliability,
      basketFlexibility: customer.behavior.basketFlexibility,
      acquisitionSource: customer.behavior.acquisitionSource,
    } : undefined,
    cadence: customer.cadence,
    visitPattern: customer.visitPattern,
    preferredWave: customer.preferredWave,
    trust: Math.round(customer.trust),
    visitCount: customer.visitCount,
    successfulVisits: customer.successfulVisits,
    failedVisits: customer.failedVisits,
    khataBalance: Math.round(customer.khataBalance),
    usualBasket: customer.usualBasket,
    lastVisitDay: customer.lastVisitDay,
  }));
}

function summarizeDayLog(log: DayLog) {
  const missedByItem = log.results.inventoryMovements
    .filter((row) => row.missedDemand > 0)
    .map((row) => ({ productId: row.productId, missed: row.missedDemand }))
    .sort((a, b) => b.missed - a.missed);
  return {
    day: log.day,
    reward: log.results.rewardBreakdown.total,
    rewardBreakdown: log.results.rewardBreakdown,
    trustChange: log.results.trustChange,
    trustBreakdown: log.results.trustBreakdown,
    cash: log.results.cash,
    trust: Math.round(log.results.trust),
    revenue: log.results.customerVisits.reduce((sum, visit) => sum + visit.revenue, 0),
    operatingProfit: log.results.profit,
    stockouts: log.results.stockouts,
    missedUnits: log.results.inventoryMovements.reduce((sum, row) => sum + row.missedDemand, 0),
    wasteLoss: log.results.wasteLoss,
    khataAdded: log.results.khataAdded,
    khataCollected: log.results.khataCollected,
    topMissedItems: missedByItem.slice(0, 4),
    marketingPerformance: log.results.marketingPerformance,
    action: log.playerActions,
  };
}

function sanitizeArenaAction(raw: unknown, observation: RunObservation): PlayerActions {
  const source = asRecord(asRecord(raw).action ?? raw);
  const state = GameState.fromSerialized(observation.state);
  const action = normalizeActions({});
  action.orders = sanitizeQuantityMap(source.orders ?? source.order ?? source.purchases ?? source.purchase, 'order');
  action.removals = sanitizeQuantityMap(source.removals ?? source.remove ?? source.discards ?? source.discard, 'removal');
  action.discounts = sanitizeDiscounts(
    source.discounts
    ?? source.discount
    ?? source.offers
    ?? source.offer
    ?? source.shelfOffers
    ?? source.offerPct
  );
  action.khataReminders = sanitizeKhata(source.khataReminders, state.customers);
  action.marketingActions = sanitizeMarketingActions(source.marketingActions, observation.availableMarketing);
  action.cashReserve = clampInteger(source.cashReserve, 0, Math.max(0, Math.round(state.cash)), DEFAULT_CONFIG.defaultCashReserve);
  action.fridgeAllocation = sanitizeFridgeAllocation(source.fridgeAllocation);
  return action;
}

function sanitizeQuantityMap(value: unknown, kind: 'order' | 'removal'): Partial<Record<ProductId, number>> {
  const result: Partial<Record<ProductId, number>> = {};

  if (Array.isArray(value)) {
    for (const row of value) {
      const entry = asRecord(row);
      const productId = normalizeProductId(entry.productId ?? entry.product ?? entry.item ?? entry.sku ?? entry.id);
      if (!productId) continue;
      const qty = readProductQuantity(entry, productId, kind);
      addQuantity(result, productId, qty, kind);
    }
    return result;
  }

  const source = asRecord(value);
  for (const product of PRODUCTS) {
    const rawValue = source[product.id] ?? source[product.name] ?? source[product.name.toLowerCase()];
    const qty = readProductQuantity(rawValue, product.id, kind);
    addQuantity(result, product.id, qty, kind);
  }
  return result;
}

function addQuantity(
  result: Partial<Record<ProductId, number>>,
  productId: ProductId,
  qty: number,
  kind: 'order' | 'removal'
) {
  if (!Number.isFinite(qty) || qty <= 0) return;
  const product = PRODUCTS.find((item) => item.id === productId);
  if (!product) return;
  const rounded = kind === 'order'
    ? Math.ceil(qty / product.orderIncrement) * product.orderIncrement
    : Math.floor(qty);
  result[productId] = (result[productId] ?? 0) + rounded;
}

function readProductQuantity(value: unknown, productId: ProductId, kind: 'order' | 'removal'): number {
  if (typeof value === 'number') return value;
  if (typeof value === 'string') return Number(value.replace(/[^\d.-]/g, ''));
  const source = asRecord(value);
  const units = Number(
    source.quantity
    ?? source.qty
    ?? source.units
    ?? source.unitQty
    ?? source.order
    ?? source.amount
    ?? source.value
    ?? 0
  );
  if (Number.isFinite(units) && units > 0) return units;
  const packs = Number(source.packs ?? source.packCount ?? source.supplierPacks ?? 0);
  if (Number.isFinite(packs) && packs > 0 && kind === 'order') {
    const product = PRODUCTS.find((item) => item.id === productId);
    return packs * (product?.orderIncrement ?? 1);
  }
  return 0;
}

function sanitizeDiscounts(value: unknown): Partial<Record<ProductId, number>> {
  const result: Partial<Record<ProductId, number>> = {};

  if (Array.isArray(value)) {
    for (const row of value) {
      const entry = asRecord(row);
      const productId = normalizeProductId(entry.productId ?? entry.product ?? entry.item ?? entry.sku ?? entry.id);
      if (!productId) continue;
      const pct = readDiscountPercent(entry, productId);
      if (pct > 0) result[productId] = nearestDiscount(pct);
    }
    return result;
  }

  const source = asRecord(value);
  for (const product of PRODUCTS) {
    const rawPct = source[product.id]
      ?? source[product.name]
      ?? source[product.name.toLowerCase()]
      ?? source[product.name.toLowerCase().replace(/\s+/g, '_')];
    const pct = readDiscountPercent(rawPct, product.id);
    result[product.id] = nearestDiscount(pct);
  }
  return result;
}

function readDiscountPercent(value: unknown, productId: ProductId): number {
  if (typeof value === 'number') return value;
  if (typeof value === 'string') return Number(value.replace(/[^\d.-]/g, ''));
  if (typeof value === 'boolean') return value ? 10 : 0;
  const source = asRecord(value);
  if (Object.keys(source).length === 0) return 0;
  const direct = source.percent
    ?? source.percentage
    ?? source.pct
    ?? source.discount
    ?? source.discountPct
    ?? source.offer
    ?? source.offerPct
    ?? source.value
    ?? source[productId];
  return readDiscountPercent(direct, productId);
}

function sanitizeKhata(value: unknown, customers: CustomerProfile[]): string[] {
  if (!Array.isArray(value)) return [];
  const validCustomers = new Set(customers.map((customer) => customer.id));
  return Array.from(new Set(value.filter((customerId): customerId is string => {
    return typeof customerId === 'string' && validCustomers.has(customerId);
  }))).slice(0, 5);
}

function sanitizeMarketingActions(
  value: unknown,
  availableCampaigns: RunObservation['availableMarketing']
): MarketingActionSelection[] {
  if (!Array.isArray(value)) return [];
  const availableById = new Map(availableCampaigns.map((campaign) => [campaign.id, campaign]));
  const seen = new Set<string>();
  const result: MarketingActionSelection[] = [];
  for (const row of value) {
    const selection = asRecord(row);
    const specId = typeof selection.specId === 'string' ? selection.specId : '';
    const campaign = availableById.get(specId);
    if (!campaign || seen.has(specId)) continue;
    const selectedProducts = Array.isArray(selection.targetProducts)
      ? selection.targetProducts
      : [];
    const targetProducts = Array.from(new Set(selectedProducts.filter((productId): productId is ProductId => {
      return typeof productId === 'string' && campaign.targetProducts.includes(productId as ProductId);
    })));
    result.push({
      specId,
      targetProducts: targetProducts.length > 0 ? targetProducts : campaign.targetProducts,
    });
    seen.add(specId);
    if (result.length >= 3) break;
  }
  return result;
}

function sanitizeFridgeAllocation(value: unknown) {
  const source = asRecord(value);
  let milk = clampInteger(source.milk, 0, 100, 60);
  let coldDrinks = clampInteger(source.cold_drinks, 0, 100, 30);
  if (milk + coldDrinks > 100) {
    const scale = 100 / (milk + coldDrinks);
    milk = Math.floor(milk * scale);
    coldDrinks = Math.floor(coldDrinks * scale);
  }
  const buffer = Math.max(0, 100 - milk - coldDrinks);
  return { milk, cold_drinks: coldDrinks, buffer };
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
    const recentDemand = Math.max(product.baseDemand * 0.55, missed + product.orderIncrement);
    const freshnessCap = product.perishabilityFactor > 0.7 ? product.baseDemand * 1.15 : product.baseDemand * 1.9;
    const desired = Math.max(0, Math.min(freshnessCap, recentDemand) - current);
    const rounded = Math.ceil(desired / product.orderIncrement) * product.orderIncrement;
    const cost = rounded * product.costPrice;
    if (rounded > 0 && cost <= budget) {
      actions.orders[product.id] = rounded;
      budget -= cost;
    }

    const atRisk = movement?.perishability.atRiskUnits ?? 0;
    if (atRisk > 0) actions.discounts[product.id] = product.margin <= 4 ? 10 : 15;
  }

  actions.khataReminders = state.customers
    .filter((customer) => customer.khataBalance > 0)
    .slice(0, 3)
    .map((customer) => customer.id);

  const availableCampaigns = getAvailableCampaigns(state.day);
  if (budget >= 50 && state.day >= 2 && availableCampaigns.some((campaign) => campaign.id === 'whatsapp_status')) {
    actions.marketingActions = [{ specId: 'whatsapp_status', targetProducts: ['milk', 'bread', 'eggs'] }];
  } else if (budget >= 30 && availableCampaigns.some((campaign) => campaign.id === 'chalkboard_offer')) {
    actions.marketingActions = [{ specId: 'chalkboard_offer', targetProducts: ['chips', 'cold_drinks', 'maggi'] }];
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

function parseDecisionJson(content: string) {
  const trimmed = content.trim().replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/\s*```$/i, '');
  try {
    return JSON.parse(trimmed) as unknown;
  } catch {
    const start = trimmed.indexOf('{');
    const end = trimmed.lastIndexOf('}');
    if (start < 0 || end <= start) throw new Error('AI response did not contain a JSON object');
    return JSON.parse(trimmed.slice(start, end + 1)) as unknown;
  }
}

function getDecisionRationale(parsed: unknown): string {
  const source = asRecord(parsed);
  const rationale = source.rationale;
  if (typeof rationale === 'string' && rationale.trim()) return rationale.trim().slice(0, 700);
  return 'AI returned an action without a usable rationale.';
}

function extractTextContent(content: unknown): string {
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return '';
  return content
    .map((part) => {
      const row = asRecord(part);
      return typeof row.text === 'string' ? row.text : '';
    })
    .join('');
}

function extractResponsesText(data: Record<string, unknown>): string {
  if (typeof data.output_text === 'string' && data.output_text.trim()) return data.output_text;
  const output = data.output;
  if (!Array.isArray(output)) return '';
  return output
    .map((item) => {
      const row = asRecord(item);
      const content = row.content;
      if (typeof content === 'string') return content;
      if (!Array.isArray(content)) return '';
      return content
        .map((part) => {
          if (typeof part === 'string') return part;
          const contentPart = asRecord(part);
          if (typeof contentPart.text === 'string') return contentPart.text;
          if (typeof contentPart.output_text === 'string') return contentPart.output_text;
          return '';
        })
        .join('');
    })
    .join('');
}

function extractResponsesFinishReason(data: Record<string, unknown>): string | undefined {
  if (typeof data.status === 'string') return data.status;
  const incomplete = asRecord(data.incomplete_details);
  if (typeof incomplete.reason === 'string') return incomplete.reason;
  const output = data.output;
  if (!Array.isArray(output)) return undefined;
  for (const item of output) {
    const row = asRecord(item);
    if (typeof row.status === 'string') return row.status;
    if (typeof row.finish_reason === 'string') return row.finish_reason;
  }
  return undefined;
}

function formatOpenRouterResponseField(field: unknown): string {
  if (!field) return '';
  if (typeof field === 'string') return `, detail=${field.slice(0, 220)}`;
  try {
    return `, detail=${JSON.stringify(field).slice(0, 220)}`;
  } catch {
    return '';
  }
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && (error.name === 'AbortError' || error.message.toLowerCase().includes('aborted'));
}

function normalizeModelList(models: string[] | undefined, mode: ArenaMode): string[] {
  if (mode === 'heuristic') return ['heuristic-v2'];
  const configuredDefault = process.env.OPENROUTER_MODEL || DEFAULT_ARENA_MODELS[0];
  const selected = models?.length ? models : [configuredDefault];
  return Array.from(new Set(selected.map((model) => model.trim()).filter(Boolean))).slice(0, 6);
}

function getObservationMode(request: ArenaStartRequest, model: string): ArenaObservationMode {
  if (request.observationMode) return request.observationMode;
  if (isMaxCapabilityProfile(request)) return 'compact';
  return isDeepSeekFlash(model) ? 'compact' : 'full';
}

function getResponseMode(request: ArenaStartRequest, model: string): ArenaResponseMode {
  if (request.responseMode) return request.responseMode;
  if (getTransportMode(request, model) === 'responses' && !supportsStrictOpenRouterResponsesSchema(model)) {
    return 'json_object';
  }
  if (isMaxCapabilityProfile(request)) return 'json_schema';
  return isDeepSeekFlash(model) ? 'json_schema' : 'json_schema';
}

function getReasoningMode(request: ArenaStartRequest, model: string): ArenaReasoningMode {
  if (request.reasoning) return request.reasoning;
  if (isDeepSeekPro(model)) return 'high';
  if (isMaxCapabilityProfile(request)) return 'medium';
  return isDeepSeekFlash(model) ? 'off' : 'off';
}

function getTransportMode(request: ArenaStartRequest, model: string): ArenaTransportMode {
  if (request.transport) return request.transport;
  if (isMaxCapabilityProfile(request) && providerForModel(model, request.mode) === 'openrouter') return 'responses';
  return usesOpenRouterResponsesApi(model) ? 'responses' : 'auto';
}

function getTimeoutMs(request: ArenaStartRequest, model: string): number {
  if (isMaxCapabilityProfile(request)) {
    return clampInteger(request.timeoutMs, 15000, MAX_CAPABILITY_TIMEOUT_MS, MAX_CAPABILITY_TIMEOUT_MS);
  }
  const defaultMs = isDeepSeekFlash(model) ? 90000 : 60000;
  return clampInteger(request.timeoutMs, 15000, MAX_CAPABILITY_TIMEOUT_MS, defaultMs);
}

function getMaxTokens(request: ArenaStartRequest, model: string): number {
  if (isMaxCapabilityProfile(request)) {
    return clampInteger(request.maxTokens, 400, MAX_CAPABILITY_TOKENS, MAX_CAPABILITY_TOKENS);
  }
  const defaultTokens = isDeepSeekFlash(model) ? 1000 : 1800;
  return clampInteger(request.maxTokens, 400, MAX_CAPABILITY_TOKENS, defaultTokens);
}

function getRequireJsonSchema(request: ArenaStartRequest, model?: string): boolean {
  if (typeof request.requireJsonSchema === 'boolean') return request.requireJsonSchema;
  if (model && getResponseMode(request, model) !== 'json_schema') return false;
  return isMaxCapabilityProfile(request);
}

function getRequireParameters(request: ArenaStartRequest, model: string): boolean {
  if (typeof request.requireParameters === 'boolean') return request.requireParameters;
  if (getTransportMode(request, model) === 'responses') return false;
  return getResponseMode(request, model) !== 'text';
}

function isMaxCapabilityProfile(request: ArenaStartRequest): boolean {
  return request.profile === MAX_CAPABILITY_PROFILE || request.profile === 'max-capability';
}

function isDeepSeekFlash(model: string): boolean {
  return model === DEEPSEEK_FLASH_MODEL;
}

function isDeepSeekPro(model: string): boolean {
  return model === DEEPSEEK_PRO_MODEL;
}

function isGemini31Pro(model: string): boolean {
  return model.toLowerCase() === GEMINI_31_PRO_MODEL;
}

function supportsStrictOpenRouterResponsesSchema(model: string): boolean {
  const normalized = model.toLowerCase();
  return (
    normalized.startsWith('openai/gpt-5.5') ||
    normalized.startsWith('openai/gpt-5.4') ||
    normalized.startsWith('openai/gpt-5.3-codex')
  );
}

function isSarvamModel(model: string): boolean {
  return model === SARVAM_105B_MODEL;
}

function providerForModel(model: string, mode?: ArenaMode): string {
  if (mode === 'heuristic' || model === 'heuristic-v2') return 'local';
  if (isSarvamModel(model)) return 'sarvam';
  return 'openrouter';
}

function transportForModel(model: string, responseMode?: ArenaResponseMode, transport?: ArenaTransportMode): string {
  if (model === 'heuristic-v2') return 'heuristic';
  if (isSarvamModel(model)) return responseMode === 'text' ? 'chat_completions_text' : 'chat_completions';
  if (resolveOpenRouterTransport(model, transport) === 'responses') return responseMode === 'text' ? 'responses_text' : 'responses';
  return responseMode === 'text' ? 'chat_completions_text' : 'chat_completions';
}

function getSarvamReasoningEffort(reasoning: ArenaReasoningMode): 'low' | 'medium' | 'high' | null {
  if (reasoning === 'off') return null;
  if (reasoning === 'xhigh') return 'high';
  return reasoning;
}

function usesOpenRouterResponsesApi(model: string): boolean {
  const normalized = model.toLowerCase();
  return (
    normalized.startsWith('openai/gpt-5.5') ||
    normalized.startsWith('openai/gpt-5.4') ||
    normalized.startsWith('openai/gpt-5.3-codex') ||
    normalized === GEMINI_31_PRO_MODEL
  );
}

function resolveOpenRouterTransport(model: string, transport?: ArenaTransportMode): 'chat_completions' | 'responses' {
  if (transport === 'chat_completions') return 'chat_completions';
  if (transport === 'responses') return 'responses';
  return usesOpenRouterResponsesApi(model) ? 'responses' : 'chat_completions';
}

async function fetchOpenRouterModelHints() {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);
  try {
    const headers: Record<string, string> = {};
    if (process.env.OPENROUTER_API_KEY) {
      headers.Authorization = `Bearer ${process.env.OPENROUTER_API_KEY}`;
    }
    const response = await fetch('https://openrouter.ai/api/v1/models', {
      headers,
      signal: controller.signal,
    });
    if (!response.ok) return [];
    const data = await response.json() as {
      data?: Array<{
        id?: string;
        name?: string;
        pricing?: unknown;
        context_length?: number;
        architecture?: {
          modality?: string;
          input_modalities?: string[];
          output_modalities?: string[];
        };
      }>;
    };
    const terms = ['gpt-5.5', 'gpt-5.4-mini', 'kimi', 'glm', 'deepseek', 'flash'];
    return (data.data ?? [])
      .filter((model) => {
        const haystack = `${model.id ?? ''} ${model.name ?? ''}`.toLowerCase();
        return terms.some((term) => haystack.includes(term)) && isTextDecisionModel(model);
      })
      .slice(0, 40)
      .map((model) => ({
        id: model.id,
        name: model.name,
        contextLength: model.context_length,
        pricing: model.pricing,
      }));
  } finally {
    clearTimeout(timeout);
  }
}

function isTextDecisionModel(model: {
  id?: string;
  name?: string;
  architecture?: {
    modality?: string;
    output_modalities?: string[];
  };
}) {
  const haystack = `${model.id ?? ''} ${model.name ?? ''}`.toLowerCase();
  if (/\b(image|banana|audio|video|music|voice|tts|sora|veo|imagen)\b/.test(haystack)) return false;

  const outputModalities = model.architecture?.output_modalities;
  if (Array.isArray(outputModalities) && outputModalities.length > 0) {
    return outputModalities.includes('text') && outputModalities.every((item) => item === 'text');
  }

  const modality = model.architecture?.modality;
  if (modality) {
    const output = modality.split('->').at(1) ?? '';
    return output.split('+').every((item) => item.trim() === 'text');
  }

  return true;
}

function nearestDiscount(value: number): number {
  return DISCOUNT_OPTIONS.reduce((best, option) => (
    Math.abs(option - value) < Math.abs(best - value) ? option : best
  ), 0);
}

function normalizeProductId(value: unknown): ProductId | undefined {
  if (typeof value !== 'string') return undefined;
  const normalized = value.trim().toLowerCase().replace(/[\s-]+/g, '_');
  const byId = PRODUCTS.find((product) => product.id === normalized);
  if (byId) return byId.id;
  const byName = PRODUCTS.find((product) => {
    return product.name.trim().toLowerCase().replace(/[\s-]+/g, '_') === normalized;
  });
  return byName?.id;
}

function clampInteger(value: unknown, min: number, max: number, fallback: number): number {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.max(min, Math.min(max, Math.round(number)));
}

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
}
