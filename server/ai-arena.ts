import { randomUUID } from 'node:crypto';
import type {
  CustomerProfile,
  DayLog,
  MarketingActionSelection,
  PlayerActions,
  ProductId,
  RunObservation,
} from '../src/types';
import { DEFAULT_CONFIG, PRODUCTS } from '../src/constants/products';
import { GameState } from '../src/game/GameState';
import { PerishabilityEngine } from '../src/game/PerishabilityEngine';
import { EnvironmentSignalEngine } from '../src/game/progression/EnvironmentSignalEngine';
import { getAvailableCampaigns, normalizeActions } from './marketing-engine';
import type { RunStore } from './run-store';

const PRODUCT_IDS = PRODUCTS.map((product) => product.id);
const DISCOUNT_OPTIONS = [0, 10, 15, 20];
const DEFAULT_ARENA_MODELS = ['z-ai/glm-5.2'];
const DEEPSEEK_FLASH_MODEL = 'deepseek/deepseek-v4-flash';
const MAX_CAPABILITY_PROFILE = 'max_capability';
const MAX_CAPABILITY_TOKENS = 16000;
const MAX_CAPABILITY_TIMEOUT_MS = 900000;

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

export const AI_ARENA_MODEL_PRESETS = [
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
  timeoutMs?: number;
  maxTokens?: number;
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
}

export function createAiArena(params: { store: RunStore }) {
  const jobs = new Map<string, ArenaJob>();

  return {
    start(request: ArenaStartRequest = {}) {
      const mode = request.mode ?? 'llm';
      const models = normalizeModelList(request.models, mode);
      const maxDays = clampInteger(request.maxDays, 1, DEFAULT_CONFIG.maxDays, DEFAULT_CONFIG.maxDays);
      const job: ArenaJob = {
        arenaId: randomUUID(),
        status: 'queued',
        mode,
        models,
        maxDays,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        runs: models.map((model) => ({
          model,
          status: 'queued',
          day: 1,
          totalReward: 0,
          decisions: [],
        })),
      };
      jobs.set(job.arenaId, job);

      void runArenaJob(params.store, job, request).catch((error) => {
        job.status = 'failed';
        job.error = error instanceof Error ? error.message : String(error);
        job.updatedAt = new Date().toISOString();
      });

      return job;
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
      const job = jobs.get(arenaId);
      if (!job) throw new Error(`Arena run not found: ${arenaId}`);
      return job;
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

async function runArenaJob(store: RunStore, job: ArenaJob, request: ArenaStartRequest) {
  job.status = 'running';
  job.updatedAt = new Date().toISOString();

  await Promise.all(job.runs.map(async (runSummary) => {
    runSummary.status = 'running';
    job.updatedAt = new Date().toISOString();
    try {
      await runSingleArenaModel(store, job, runSummary, request);
      runSummary.status = 'complete';
    } catch (error) {
      runSummary.status = 'failed';
      runSummary.error = error instanceof Error ? error.message : String(error);
    } finally {
      job.updatedAt = new Date().toISOString();
    }
  }));

  job.status = job.runs.some((run) => run.status === 'failed') ? 'failed' : 'complete';
  job.updatedAt = new Date().toISOString();
}

async function runSingleArenaModel(
  store: RunStore,
  job: ArenaJob,
  runSummary: ArenaRunSummary,
  request: ArenaStartRequest
) {
  const observation = store.createRun('ai', {
    runName: `AI Arena · ${runSummary.model}`,
  });
  const aiPlayerId = store.createAiPlayer(observation.runId, `Arena ${runSummary.model}`, runSummary.model, {
    profile: request.profile ?? 'balanced',
    mode: job.mode,
    maxDays: job.maxDays,
    observationMode: getObservationMode(request, runSummary.model),
    responseMode: getResponseMode(request, runSummary.model),
    reasoning: getReasoningMode(request, runSummary.model),
    requireJsonSchema: getRequireJsonSchema(request),
    requireParameters: getRequireParameters(request, runSummary.model),
    maxTokens: getMaxTokens(request, runSummary.model),
    timeoutMs: getTimeoutMs(request, runSummary.model),
  });
  let current = observation;
  runSummary.runId = current.runId;

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
        requireJsonSchema: getRequireJsonSchema(request),
        requireParameters: getRequireParameters(request, runSummary.model),
        observationMode: getObservationMode(request, runSummary.model),
        responseMode: getResponseMode(request, runSummary.model),
        reasoning: getReasoningMode(request, runSummary.model),
        timeoutMs: getTimeoutMs(request, runSummary.model),
        maxTokens: getMaxTokens(request, runSummary.model),
        validationFeedback: [],
      });
    } catch (error) {
      traceError = error instanceof Error ? error.message : String(error);
      retryCount = 1;
      decision = {
        action: conservativeFallbackAction(current),
        rationale: `Fallback after model action generation failed: ${traceError}`,
        model: runSummary.model,
        latencyMs: 0,
      };
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
            requireJsonSchema: getRequireJsonSchema(request),
            requireParameters: getRequireParameters(request, runSummary.model),
            observationMode: getObservationMode(request, runSummary.model),
            responseMode: getResponseMode(request, runSummary.model),
            reasoning: getReasoningMode(request, runSummary.model),
            timeoutMs: getTimeoutMs(request, runSummary.model),
            maxTokens: getMaxTokens(request, runSummary.model),
            validationFeedback: [validationError],
          });
        } catch (retryGenerationError) {
          traceError = retryGenerationError instanceof Error ? retryGenerationError.message : String(retryGenerationError);
          decision = {
            action: conservativeFallbackAction(current),
            rationale: `Fallback after retry action generation failed: ${traceError}`,
            model: runSummary.model,
            latencyMs: 0,
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
    });
    runSummary.totalReward = current.scores.total;
    runSummary.finalCash = Math.round(current.state.cash);
    runSummary.finalTrust = Math.round(current.state.trust);
    job.updatedAt = new Date().toISOString();
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
    throw new Error(qualityErrors.join('; '));
  }
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
  });
  return store.stepOpenEnvRun(observation.runId, decision.action).observation;
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
  const normalized = normalizeRationaleText(rationale);
  return availableCampaigns
    .filter((campaign) => {
      const candidates = [
        campaign.id,
        campaign.name,
        campaign.name.replace(/\s+/g, '_'),
      ].map(normalizeRationaleText);
      return candidates.some((candidate) => candidate.length > 2 && normalized.includes(candidate));
    })
    .map((campaign) => campaign.id);
}

function mentionsGenericMarketingIntent(rationale: string): boolean {
  if (hasNegativeMarketingIntent(rationale)) return false;
  const lower = rationale.toLowerCase();
  return /(activate|run|start|launch|select|use|deploy|schedule|book|promote|push)\s+(a\s+)?(marketing|campaign|promotion|offer|whatsapp|status|pamphlet|loyalty|recovery)/i.test(lower)
    || /(marketing|campaign|promotion)\s+(active|selected|deployed|planned|scheduled|started|launched)/i.test(lower);
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
  timeoutMs: number;
  maxTokens: number;
  validationFeedback: string[];
}): Promise<ArenaDecision> {
  if (params.mode === 'heuristic' || params.model === 'heuristic-v2') {
    const startedAt = performance.now();
    return {
      action: buildHeuristicAction(params.observation, params.profile),
      rationale: 'Heuristic baseline: restock missed demand and essentials, protect cash, discount only risky perishables, and use low-cost marketing.',
      model: params.model,
      latencyMs: Math.round(performance.now() - startedAt),
    };
  }

  return requestOpenRouterDecision(params);
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
    const content = await callOpenRouter({
      apiKey,
      model: params.model,
      temperature: params.temperature,
      promptPayload,
      responseMode: initialResponseMode,
      reasoning: params.reasoning,
      requireParameters: params.requireParameters,
      timeoutMs: params.timeoutMs,
      maxTokens: params.maxTokens,
    });
    const parsed = parseDecisionJson(content);
    return {
      action: sanitizeArenaAction(parsed, params.observation),
      rationale: getDecisionRationale(parsed),
      model: params.model,
      latencyMs: Math.round(performance.now() - startedAt),
    };
  } catch (error) {
    if (params.requireJsonSchema || isAbortError(error)) throw error;
    const content = await callOpenRouter({
      apiKey,
      model: params.model,
      temperature: params.temperature,
      promptPayload,
      responseMode: 'text',
      reasoning: params.reasoning,
      requireParameters: false,
      timeoutMs: params.timeoutMs,
      maxTokens: params.maxTokens,
    });
    const parsed = parseDecisionJson(content);
    return {
      action: sanitizeArenaAction(parsed, params.observation),
      rationale: getDecisionRationale(parsed),
      model: params.model,
      latencyMs: Math.round(performance.now() - startedAt),
    };
  }
}

async function callOpenRouter(params: {
  apiKey: string;
  model: string;
  temperature?: number;
  promptPayload: unknown;
  responseMode: ArenaResponseMode;
  reasoning: ArenaReasoningMode;
  requireParameters?: boolean;
  timeoutMs: number;
  maxTokens: number;
}): Promise<string> {
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
        'X-Title': 'Kirana AI Arena',
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    if (!response.ok) {
      const details = await response.text().catch(() => '');
      throw new Error(`OpenRouter ${params.model} failed with ${response.status}: ${details.slice(0, 500)}`);
    }

    const data = await response.json() as {
      choices?: Array<{ message?: { content?: unknown } }>;
    };
    const content = extractTextContent(data.choices?.[0]?.message?.content);
    if (!content) throw new Error(`OpenRouter ${params.model} returned no message content`);
    return content;
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
      name: 'Shree Shyam Bhandar',
      cash: Math.round(state.cash),
      trust: Math.round(state.trust),
      scoreSoFar: state.getTotalScore(),
      currentWeather: state.weather,
      cashReserveDefault: DEFAULT_CONFIG.defaultCashReserve,
    },
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
        baseDemand: product.baseDemand,
        demandVariance: product.demandVariance,
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
        baseDemand: product.baseDemand,
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
  if (isMaxCapabilityProfile(request)) return 'json_schema';
  return isDeepSeekFlash(model) ? 'json_schema' : 'json_schema';
}

function getReasoningMode(request: ArenaStartRequest, model: string): ArenaReasoningMode {
  if (request.reasoning) return request.reasoning;
  if (isMaxCapabilityProfile(request)) return 'medium';
  return isDeepSeekFlash(model) ? 'off' : 'off';
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

function getRequireJsonSchema(request: ArenaStartRequest): boolean {
  if (typeof request.requireJsonSchema === 'boolean') return request.requireJsonSchema;
  return isMaxCapabilityProfile(request);
}

function getRequireParameters(request: ArenaStartRequest, model: string): boolean {
  if (typeof request.requireParameters === 'boolean') return request.requireParameters;
  return getResponseMode(request, model) !== 'text';
}

function isMaxCapabilityProfile(request: ArenaStartRequest): boolean {
  return request.profile === MAX_CAPABILITY_PROFILE || request.profile === 'max-capability';
}

function isDeepSeekFlash(model: string): boolean {
  return model === DEEPSEEK_FLASH_MODEL;
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
    const data = await response.json() as { data?: Array<{ id?: string; name?: string; pricing?: unknown; context_length?: number }> };
    const terms = ['kimi', 'glm', 'deepseek', 'flash'];
    return (data.data ?? [])
      .filter((model) => {
        const haystack = `${model.id ?? ''} ${model.name ?? ''}`.toLowerCase();
        return terms.some((term) => haystack.includes(term));
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
