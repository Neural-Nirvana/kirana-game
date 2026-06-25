import { randomUUID } from 'node:crypto';
import type { DayLog, MarketingCampaignInstance, PlayerActions, RunObservation } from '../src/types';
import { GameState } from '../src/game/GameState';
import { DaySimulator } from '../src/game/DaySimulator';
import {
  AI_ARENA_SYSTEM_PROMPT,
  buildCompactArenaObservation,
  buildHeuristicAction,
} from './ai-arena';
import {
  createCampaignInstances,
  getCampaignCost,
  buildMarketingEffects,
} from './marketing-engine';
import type { RunStore } from './run-store';

export type DatasetSourceFilter = 'all' | 'human' | 'ai' | 'heuristic';

export interface DatasetRunSummary {
  runId: string;
  playerType: 'human' | 'ai';
  runName?: string;
  status: string;
  daysCompleted: number;
  totalScore: number;
  runSeed?: number;
  playerName?: string;
  aiModel?: string;
  createdAt: string;
  updatedAt: string;
  exampleCount: number;
  hasRationale: boolean;
  sourceTag: 'human' | 'ai' | 'heuristic';
}

export interface TrainingExample {
  runId: string;
  day: number;
  sourceTag: 'human' | 'ai' | 'heuristic';
  model?: string;
  playerName?: string;
  dayReward: number;
  cumulativeScore: number;
  trustAfter: number;
  stockouts: number;
  visits: number;
  missedUnits: number;
  signals: {
    day: string;
    weather: string;
    calendar: string[];
    customers: string[];
    market: string[];
    memory: string[];
  };
  action: PlayerActions;
  rationale?: string;
  outcome: {
    profit: number;
    khataAdded: number;
    khataCollected: number;
    topMissed: Array<{ productId: string; missed: number }>;
  };
  observationMode: 'compact';
  trainingRecord: {
    messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>;
  };
}

function simulationSeed(state: GameState): number | undefined {
  if (!Number.isFinite(state.runSeed)) return undefined;
  return Math.round((state.runSeed as number) + state.day * 1009 + state.history.length * 7919);
}

function sourceTagFor(model?: string, playerType?: string): 'human' | 'ai' | 'heuristic' {
  if (playerType === 'human') return 'human';
  if (model?.includes('heuristic')) return 'heuristic';
  return 'ai';
}

function buildTemplateRationale(action: PlayerActions, observation: RunObservation): string {
  const orders = Object.entries(action.orders ?? {}).filter(([, qty]) => (qty ?? 0) > 0);
  const discounts = Object.entries(action.discounts ?? {}).filter(([, pct]) => (pct ?? 0) > 0);
  const marketing = action.marketingActions ?? [];
  const reminders = action.khataReminders ?? [];
  const parts: string[] = [];

  if (orders.length > 0) {
    parts.push(`Restock ${orders.map(([id, qty]) => `${id} ${qty}`).join(', ')} within cash reserve.`);
  } else {
    parts.push('Hold orders today and protect cash buffer.');
  }
  if (discounts.length > 0) {
    parts.push(`Shelf discounts on ${discounts.map(([id, pct]) => `${id} ${pct}%`).join(', ')}.`);
  }
  if (marketing.length > 0) {
    parts.push(`Run ${marketing.map((m) => m.specId).join(', ')} for promoted demand.`);
  }
  if (reminders.length > 0) {
    parts.push(`Follow up khata for ${reminders.length} customer${reminders.length === 1 ? '' : 's'}.`);
  }
  return parts.join(' ');
}

function buildTrainingRecord(
  observation: RunObservation,
  action: PlayerActions,
  rationale: string
): TrainingExample['trainingRecord'] {
  const compact = buildCompactArenaObservation(observation);
  return {
    messages: [
      { role: 'system', content: AI_ARENA_SYSTEM_PROMPT },
      { role: 'user', content: JSON.stringify(compact) },
      {
        role: 'assistant',
        content: JSON.stringify({ action, rationale }),
      },
    ],
  };
}

function extractSignals(observation: RunObservation): TrainingExample['signals'] {
  const compact = buildCompactArenaObservation(observation);
  const signals = compact.signals as {
    day: string;
    weather: string;
    calendar: string[];
    customers: string[];
    market: string[];
    memory: string[];
  };
  return {
    day: signals.day,
    weather: signals.weather,
    calendar: signals.calendar ?? [],
    customers: signals.customers ?? [],
    market: signals.market ?? [],
    memory: signals.memory ?? [],
  };
}

export function replayObservationAtDay(store: RunStore, runId: string, day: number): RunObservation {
  const meta = store.getDatasetRunMeta(runId);
  const timeline = store.getTimeline(runId);
  const state = new GameState();
  if (Number.isFinite(meta.runSeed)) state.runSeed = meta.runSeed;

  let campaigns: MarketingCampaignInstance[] = [];

  for (const log of timeline) {
    if (log.day >= day) break;

    const newCampaigns = createCampaignInstances({
      runId,
      day: log.day,
      selections: log.playerActions.marketingActions ?? [],
    });
    campaigns = [...campaigns, ...newCampaigns];
    const marketingCost = getCampaignCost(newCampaigns);
    const activeEffects = buildMarketingEffects(campaigns, state.day);
    const simulator = new DaySimulator(simulationSeed(state));
    const result = simulator.simulateDay(state, log.playerActions, {
      marketingEffects: activeEffects,
      marketingCost,
    });
    const dayLog: DayLog = {
      day: result.day,
      visibleStateBefore: state.getVisibleState(),
      playerActions: log.playerActions,
      events: simulator.getEvents(),
      results: result,
    };
    state.history.push(dayLog);
    if (!state.isGameOver()) state.advanceDay(result);
  }

  return store.buildObservationFromState(runId, state, campaigns, meta.playerType);
}

export function buildTrainingExample(
  store: RunStore,
  runId: string,
  day: number,
  options: { rationale?: string; model?: string; playerName?: string; sourceTag?: TrainingExample['sourceTag'] } = {}
): TrainingExample {
  const meta = store.getDatasetRunMeta(runId);
  const timeline = store.getTimeline(runId);
  const log = timeline.find((entry) => entry.day === day);
  if (!log) throw new Error(`Day ${day} not found for run ${runId}`);

  const observation = replayObservationAtDay(store, runId, day);
  const decisions = store.getAiDecisions(runId);
  const decision = decisions.find((entry) => entry.day === day);
  const rationale = options.rationale
    ?? decision?.rationale
    ?? buildTemplateRationale(log.playerActions, observation);
  const cumulativeScore = timeline
    .filter((entry) => entry.day <= day)
    .reduce((sum, entry) => sum + entry.results.rewardBreakdown.total, 0);
  const missedByItem = log.results.inventoryMovements
    .filter((row) => row.missedDemand > 0)
    .map((row) => ({ productId: row.productId, missed: row.missedDemand }))
    .sort((a, b) => b.missed - a.missed);

  return {
    runId,
    day,
    sourceTag: options.sourceTag ?? sourceTagFor(options.model ?? meta.aiModel, meta.playerType),
    model: options.model ?? meta.aiModel,
    playerName: options.playerName ?? meta.playerName,
    dayReward: log.results.rewardBreakdown.total,
    cumulativeScore,
    trustAfter: Math.round(log.results.trust),
    stockouts: log.results.stockouts,
    visits: log.results.customerVisits.length,
    missedUnits: log.results.inventoryMovements.reduce((sum, row) => sum + row.missedDemand, 0),
    signals: extractSignals(observation),
    action: log.playerActions,
    rationale,
    outcome: {
      profit: log.results.profit,
      khataAdded: log.results.khataAdded,
      khataCollected: log.results.khataCollected,
      topMissed: missedByItem.slice(0, 4),
    },
    observationMode: 'compact',
    trainingRecord: buildTrainingRecord(observation, log.playerActions, rationale),
  };
}

export function listTrainingExamplesForRun(store: RunStore, runId: string): TrainingExample[] {
  const meta = store.getDatasetRunMeta(runId);
  const timeline = store.getTimeline(runId);
  const decisions = store.getAiDecisions(runId);
  return timeline.map((log) => buildTrainingExample(store, runId, log.day, {
    model: meta.aiModel,
    playerName: meta.playerName,
    rationale: decisions.find((entry) => entry.day === log.day)?.rationale,
    sourceTag: sourceTagFor(meta.aiModel, meta.playerType),
  }));
}

export function exportJsonl(
  store: RunStore,
  filters: {
    runIds?: string[];
    source?: DatasetSourceFilter;
    minDayReward?: number;
    minTotalScore?: number;
    completeOnly?: boolean;
    limitRuns?: number;
  } = {}
): string {
  const runs = store.listDatasetRuns({
    source: filters.source ?? 'all',
    minScore: filters.minTotalScore,
    completeOnly: filters.completeOnly,
    limit: filters.limitRuns ?? 100,
  }).filter((run) => !filters.runIds?.length || filters.runIds.includes(run.runId));

  const lines: string[] = [];
  for (const run of runs) {
    for (const example of listTrainingExamplesForRun(store, run.runId)) {
      if (filters.minDayReward !== undefined && example.dayReward < filters.minDayReward) continue;
      lines.push(JSON.stringify(example.trainingRecord));
    }
  }
  return `${lines.join('\n')}\n`;
}

export async function generateHeuristicDatasetRuns(
  store: RunStore,
  options: {
    count: number;
    seedStart: number;
    maxDays: number;
    profile?: string;
  }
) {
  const profile = options.profile ?? 'balanced';
  const created: Array<{ runId: string; seed: number; totalScore: number; daysCompleted: number }> = [];

  for (let index = 0; index < options.count; index += 1) {
    const seed = options.seedStart + index;
    const observation = store.createRun('ai', {
      runName: `Dataset heuristic · seed ${seed}`,
      seed,
    });
    const runId = observation.runId;
    const aiPlayerId = store.getOrCreateAiPlayer(runId, 'Dataset Lab', 'heuristic-dataset', { profile, seed });

    let current = observation;
    while (!current.done && current.state.history.length < options.maxDays) {
      const day = current.state.day;
      store.createAiMemorySummary(runId, day, buildCompactArenaObservation(current));
      const action = buildHeuristicAction(current, profile);
      const rationale = buildTemplateRationale(action, current);
      const stepped = store.stepOpenEnvRun(runId, action);
      store.createAiDecision({
        runId,
        aiPlayerId,
        day,
        observation: buildCompactArenaObservation(current),
        action,
        rationale,
        model: 'heuristic-dataset',
        latencyMs: 0,
        metadata: { seed, provider: 'local', transport: 'heuristic-dataset' },
      });
      current = stepped.observation;
    }

    const timeline = store.getTimeline(runId);
    created.push({
      runId,
      seed,
      totalScore: current.scores.total,
      daysCompleted: timeline.length,
    });
  }

  return { runs: created };
}