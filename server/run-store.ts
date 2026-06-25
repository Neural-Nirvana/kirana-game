import { createHash, randomUUID } from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';
import type {
  DayLog,
  DayResult,
  MarketingCampaignInstance,
  PlayerActions,
  ProductId,
  RunObservation,
  SerializedGameState,
  StepRunResponse,
} from '../src/types';
import { dedupeReplaySummariesByModel } from '../src/arena/arena-shared';
import { PRODUCTS } from '../src/constants/products';
import { GameState } from '../src/game/GameState';
import { DaySimulator } from '../src/game/DaySimulator';
import { json, parseJson } from './db';
import {
  buildMarketingEffects,
  createCampaignInstances,
  getAvailableCampaigns,
  getCampaignCost,
  getActiveCampaigns,
  getVisibleMarketingCampaigns,
  normalizeActions,
  summarizeMarketingResult,
  validateMarketingSelections,
} from './marketing-engine';

type PlayerType = 'human' | 'ai';
type ArenaStatus = 'queued' | 'running' | 'complete' | 'failed';
type ArenaRunStatus = 'queued' | 'running' | 'complete' | 'failed';

interface GameRunRow {
  id: string;
  player_id: string | null;
  player_type: PlayerType;
  run_name: string | null;
  status: string;
  current_day: number;
  total_score: number;
  state_json: string;
  created_at: string;
  updated_at: string;
  version: number;
}

interface CampaignRow {
  id: string;
  run_id: string;
  spec_id: string;
  target_products_json: string | null;
  planned_day: number;
  effect_start_day: number;
  effect_end_day: number;
  status: MarketingCampaignInstance['status'];
  cost: number;
  actual_result_json: string | null;
}

export interface ArenaRunTraceRecord {
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

export interface ArenaRunRecord {
  runId?: string;
  model: string;
  status: ArenaRunStatus;
  day: number;
  totalReward: number;
  finalCash?: number;
  finalTrust?: number;
  decisions: ArenaRunTraceRecord[];
  error?: string;
  config?: unknown;
}

export interface ArenaJobRecord {
  arenaId: string;
  status: ArenaStatus;
  mode: 'llm' | 'heuristic';
  models: string[];
  maxDays: number;
  createdAt: string;
  updatedAt: string;
  runs: ArenaRunRecord[];
  error?: string;
  request?: unknown;
  config?: unknown;
}

interface ArenaJobRow {
  id: string;
  status: ArenaStatus;
  mode: 'llm' | 'heuristic';
  models_json: string;
  max_days: number;
  request_json: string;
  config_json: string;
  created_at: string;
  updated_at: string;
  error: string | null;
}

interface ArenaJobRunRow {
  arena_id: string;
  model: string;
  status: ArenaRunStatus;
  day: number;
  total_reward: number;
  run_id: string | null;
  final_cash: number | null;
  final_trust: number | null;
  decisions_json: string;
  config_json: string;
  error: string | null;
}

interface AiDecisionMetadata {
  provider?: string;
  transport?: string;
  promptVersion?: string;
  configSnapshot?: unknown;
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
  worldVersion?: string;
}

export class RunStore {
  constructor(private readonly db: DatabaseSync) {}

  createRun(
    playerType: PlayerType = 'human',
    options: { playerId?: string; runName?: string; seed?: number } = {}
  ): RunObservation {
    const now = new Date().toISOString();
    const state = new GameState();
    if (Number.isFinite(options.seed)) {
      state.runSeed = Math.round(options.seed as number);
    }
    const runId = randomUUID();
    this.db.prepare(`
      INSERT INTO game_runs
        (id, player_id, player_type, run_name, status, current_day, total_score, state_json, created_at, updated_at, version)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      runId,
      options.playerId ?? null,
      playerType,
      options.runName ?? null,
      'active',
      state.day,
      0,
      json(state.toSerialized()),
      now,
      now,
      0
    );
    this.persistCustomerState(runId, state);
    return this.getObservation(runId, options.playerId);
  }

  getObservation(runId: string, playerId?: string): RunObservation {
    return this.buildObservation(this.getRunRow(runId, { playerId }));
  }

  getAiObservation(runId: string): RunObservation {
    const row = this.getRunRow(runId);
    if (row.player_type !== 'ai') throw new Error(`Run not found: ${runId}`);
    return this.buildObservation(row);
  }

  getOpenEnvObservation(runId: string): RunObservation {
    return this.buildObservation(this.getRunRow(runId, { requireUnowned: true }));
  }

  private buildObservation(row: GameRunRow): RunObservation {
    const runId = row.id;
    const state = GameState.fromSerialized(parseJson<SerializedGameState>(row.state_json));
    const campaigns = this.getCampaigns(runId);
    const lastLog = state.history[state.history.length - 1];
    const done = state.isGameOver() || row.status === 'complete';
    const player = row.player_id ? this.getPlayer(row.player_id) : undefined;

    return {
      runId,
      playerType: row.player_type,
      player,
      runName: row.run_name ?? undefined,
      state: state.toSerialized(),
      visibleState: state.getVisibleState(),
      done,
      activeMarketing: getVisibleMarketingCampaigns(campaigns, state.day),
      availableMarketing: getAvailableCampaigns(Math.min(state.day, state.config.maxDays)),
      scores: {
        total: state.getTotalScore(),
        lastDay: lastLog?.results.rewardBreakdown.total ?? 0,
      },
    };
  }

  getTimeline(runId: string, playerId?: string): DayLog[] {
    this.getRunRow(runId, { playerId });
    const rows = this.db.prepare(`
      SELECT log_json FROM day_results WHERE run_id = ? ORDER BY day ASC
    `).all(runId) as Array<{ log_json: string }>;
    return rows.map((row) => parseJson<DayLog>(row.log_json));
  }

  stepRun(
    runId: string,
    input: Partial<PlayerActions>,
    options: { playerId?: string; expectedDay?: number; requireUnowned?: boolean } = {}
  ): StepRunResponse {
    const row = this.getRunRow(runId, {
      playerId: options.playerId,
      requireUnowned: options.requireUnowned,
    });
    if (row.status === 'complete') {
      throw new Error('Run is already complete');
    }

    const state = GameState.fromSerialized(parseJson<SerializedGameState>(row.state_json));
    if (options.expectedDay !== undefined && state.day !== options.expectedDay) {
      throw new Error(`Run is on Day ${state.day}, but the request expected Day ${options.expectedDay}`);
    }

    if (state.isGameOver()) {
      this.markComplete(runId, state);
      return { runId, observation: this.getObservation(runId, options.playerId) };
    }

    const actions = normalizeActions(input);
    const validationErrors = this.validateActions(state, actions);
    if (validationErrors.length > 0) {
      throw new Error(validationErrors.join('; '));
    }

    const campaignsBefore = this.getCampaigns(runId);
    const newCampaigns = createCampaignInstances({
      runId,
      day: state.day,
      selections: actions.marketingActions,
    });
    const allCampaigns = [...campaignsBefore, ...newCampaigns];
    const marketingCost = getCampaignCost(newCampaigns);
    const activeEffects = buildMarketingEffects(allCampaigns, state.day);
    const visibleStateBefore = state.getVisibleState();
    const simulator = new DaySimulator(this.getSimulationSeed(state));
    state.setActions(actions);
    const result = simulator.simulateDay(state, actions, {
      marketingEffects: activeEffects,
      marketingCost,
    });

    const log: DayLog = {
      day: result.day,
      visibleStateBefore,
      playerActions: actions,
      events: simulator.getEvents(),
      results: result,
    };
    state.history.push(log);

    const completedCampaigns = this.resolveCampaignOutcomes(allCampaigns, result);
    if (!state.isGameOver()) {
      state.advanceDay(result);
    }

    const status = state.isGameOver() ? 'complete' : 'active';
    this.db.exec('BEGIN');
    try {
      for (const campaign of newCampaigns) this.insertCampaign(campaign);
      for (const campaign of completedCampaigns) this.updateCampaign(campaign);
      this.persistDay(runId, log, result, actions);
      this.persistCustomerState(runId, state);
      this.updateRun(runId, state, status);
      this.db.exec('COMMIT');
    } catch (error) {
      this.db.exec('ROLLBACK');
      throw error;
    }

    return {
      runId,
      observation: this.getObservation(runId, options.playerId),
      log,
      result,
    };
  }

  stepOpenEnvRun(runId: string, input: Partial<PlayerActions>): StepRunResponse {
    return this.stepRun(runId, input, { requireUnowned: true });
  }

  private getSimulationSeed(state: GameState): number | undefined {
    if (!Number.isFinite(state.runSeed)) return undefined;
    return Math.round((state.runSeed as number) + state.day * 1009 + state.history.length * 7919);
  }

  createAiDecision(params: {
    runId: string;
    aiPlayerId: string;
    day: number;
    observation: unknown;
    action: PlayerActions;
    rationale: string;
    model: string;
    latencyMs: number;
    error?: string;
    metadata?: AiDecisionMetadata;
  }) {
    const observationHash = createHash('sha256').update(json(params.observation)).digest('hex');
    this.db.prepare(`
      INSERT INTO ai_decisions
      (
        id, run_id, ai_player_id, day, observation_hash, action_json, rationale, model,
        latency_ms, cost_estimate, error, provider, transport, prompt_version, config_json,
        usage_json, finish_reason, response_id, empty_content, validation_error_type,
        retry_count, fallback_used, seed, world_version
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      randomUUID(),
      params.runId,
      params.aiPlayerId,
      params.day,
      observationHash,
      json(params.action),
      params.rationale,
      params.model,
      params.latencyMs,
      0,
      params.error ?? null,
      params.metadata?.provider ?? null,
      params.metadata?.transport ?? null,
      params.metadata?.promptVersion ?? null,
      params.metadata?.configSnapshot ? json(params.metadata.configSnapshot) : null,
      params.metadata?.usage ? json(params.metadata.usage) : null,
      params.metadata?.finishReason ?? null,
      params.metadata?.responseId ?? null,
      params.metadata?.emptyContent ? 1 : 0,
      params.metadata?.validationErrorType ?? null,
      params.metadata?.retryCount ?? 0,
      params.metadata?.fallbackUsed ? 1 : 0,
      Number.isFinite(params.metadata?.seed) ? params.metadata?.seed : null,
      params.metadata?.worldVersion ?? null
    );
  }

  recordAiProviderResponse(params: {
    runId?: string;
    day: number;
    model: string;
    provider?: string;
    transport?: string;
    responseId?: string;
    finishReason?: string;
    usage?: unknown;
    requestJson?: unknown;
    responseText?: string;
    emptyContent?: boolean;
    errorClass?: string;
    rawError?: string;
  }) {
    this.db.prepare(`
      INSERT INTO ai_provider_responses
      (
        id, run_id, day, model, provider, transport, response_id, finish_reason,
        usage_json, request_json, response_text, empty_content, error_class, raw_error, created_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      randomUUID(),
      params.runId ?? null,
      params.day,
      params.model,
      params.provider ?? null,
      params.transport ?? null,
      params.responseId ?? null,
      params.finishReason ?? null,
      params.usage ? json(params.usage) : null,
      params.requestJson ? json(params.requestJson) : null,
      params.responseText ?? null,
      params.emptyContent ? 1 : 0,
      params.errorClass ?? null,
      params.rawError ?? null,
      new Date().toISOString()
    );
  }

  createAiMemorySummary(runId: string, day: number, summary: unknown) {
    this.db.prepare(`
      INSERT INTO ai_memory_summaries (id, run_id, day, summary_json, created_at)
      VALUES (?, ?, ?, ?, ?)
    `).run(randomUUID(), runId, day, json(summary), new Date().toISOString());
  }

  getAiProviderResponses(
    runId: string,
    options: { day?: number; includeBodies?: boolean } = {}
  ) {
    this.getRunRow(runId);
    const filters = ['run_id = ?'];
    const args: unknown[] = [runId];
    if (options.day !== undefined) {
      filters.push('day = ?');
      args.push(options.day);
    }
    const includeBodies = options.includeBodies ?? options.day !== undefined;
    const rows = this.db.prepare(`
      SELECT
        id, run_id, day, model, provider, transport, response_id, finish_reason,
        usage_json, request_json, response_text, empty_content, error_class, raw_error, created_at
      FROM ai_provider_responses
      WHERE ${filters.join(' AND ')}
      ORDER BY day ASC, created_at ASC
    `).all(...args) as Array<{
      id: string;
      run_id: string;
      day: number;
      model: string;
      provider: string | null;
      transport: string | null;
      response_id: string | null;
      finish_reason: string | null;
      usage_json: string | null;
      request_json: string | null;
      response_text: string | null;
      empty_content: number;
      error_class: string | null;
      raw_error: string | null;
      created_at: string;
    }>;

    return rows.map((row) => ({
      id: row.id,
      runId: row.run_id,
      day: row.day,
      model: row.model,
      provider: row.provider ?? undefined,
      transport: row.transport ?? undefined,
      responseId: row.response_id ?? undefined,
      finishReason: row.finish_reason ?? undefined,
      usage: row.usage_json ? parseJson(row.usage_json) : undefined,
      emptyContent: Boolean(row.empty_content),
      errorClass: row.error_class ?? undefined,
      rawError: row.raw_error ?? undefined,
      createdAt: row.created_at,
      requestJson: includeBodies && row.request_json ? parseJson(row.request_json) : undefined,
      responseText: includeBodies ? row.response_text ?? undefined : undefined,
      requestBytes: row.request_json?.length ?? 0,
      responseBytes: row.response_text?.length ?? 0,
    }));
  }

  getAiDecisions(runId: string) {
    return this.db.prepare(`
      SELECT
        day, observation_hash, action_json, rationale, model, latency_ms, cost_estimate, error,
        provider, transport, prompt_version, config_json, usage_json, finish_reason, response_id,
        empty_content, validation_error_type, retry_count, fallback_used, seed, world_version
      FROM ai_decisions
      WHERE run_id = ?
      ORDER BY day ASC, rowid ASC
    `).all(runId).map((row) => {
      const decision = row as {
        day: number;
        observation_hash: string;
        action_json: string;
        rationale: string;
        model: string;
        latency_ms: number;
        cost_estimate: number;
        error: string | null;
        provider: string | null;
        transport: string | null;
        prompt_version: string | null;
        config_json: string | null;
        usage_json: string | null;
        finish_reason: string | null;
        response_id: string | null;
        empty_content: number;
        validation_error_type: string | null;
        retry_count: number;
        fallback_used: number;
        seed: number | null;
        world_version: string | null;
      };
      return {
        day: decision.day,
        observationHash: decision.observation_hash,
        action: parseJson(decision.action_json),
        rationale: decision.rationale,
        model: decision.model,
        latencyMs: decision.latency_ms,
        costEstimate: decision.cost_estimate,
        error: decision.error,
        provider: decision.provider ?? undefined,
        transport: decision.transport ?? undefined,
        promptVersion: decision.prompt_version ?? undefined,
        configSnapshot: decision.config_json ? parseJson(decision.config_json) : undefined,
        usage: decision.usage_json ? parseJson(decision.usage_json) : undefined,
        finishReason: decision.finish_reason ?? undefined,
        responseId: decision.response_id ?? undefined,
        emptyContent: Boolean(decision.empty_content),
        validationErrorType: decision.validation_error_type ?? undefined,
        retryCount: decision.retry_count,
        fallbackUsed: Boolean(decision.fallback_used),
        seed: decision.seed ?? undefined,
        worldVersion: decision.world_version ?? undefined,
      };
    });
  }

  createAiPlayer(runId: string, name: string, model: string, profile: unknown): string {
    const id = randomUUID();
    this.db.prepare(`
      INSERT INTO ai_players (id, run_id, name, model, profile_json, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(id, runId, name, model, json(profile), new Date().toISOString());
    return id;
  }

  getOrCreateAiPlayer(runId: string, name: string, model: string, profile: unknown): string {
    const row = this.db.prepare(`
      SELECT id FROM ai_players WHERE run_id = ? AND model = ? ORDER BY rowid ASC LIMIT 1
    `).get(runId, model) as { id: string } | undefined;
    return row?.id ?? this.createAiPlayer(runId, name, model, profile);
  }

  listAiReplaySummaries(options: { limit?: number; status?: string; model?: string } = {}) {
    const limit = options.limit ?? 50;
    const filters = ['game_runs.player_type = ?'];
    const args: unknown[] = ['ai'];
    if (options.status) {
      filters.push('game_runs.status = ?');
      args.push(options.status);
    }
    if (options.model) {
      filters.push('ai_players.model = ?');
      args.push(options.model);
    }
    const rows = this.db.prepare(`
      SELECT
        game_runs.id AS run_id,
        ai_players.model AS model,
        game_runs.status AS status,
        game_runs.total_score AS score,
        game_runs.updated_at AS saved_at,
        COALESCE(day_counts.days_completed, 0) AS days_completed,
        MAX(arena_job_runs.final_cash) AS final_cash,
        MAX(arena_job_runs.final_trust) AS final_trust
      FROM game_runs
      JOIN ai_players ON ai_players.run_id = game_runs.id
      LEFT JOIN (
        SELECT run_id, COUNT(day) AS days_completed
        FROM day_results
        GROUP BY run_id
      ) AS day_counts ON day_counts.run_id = game_runs.id
      LEFT JOIN arena_job_runs ON arena_job_runs.run_id = game_runs.id
      WHERE ${filters.join(' AND ')}
      GROUP BY game_runs.id, ai_players.model
      ORDER BY game_runs.total_score DESC, days_completed DESC, game_runs.updated_at DESC
      LIMIT ?
    `).all(...args, limit) as Array<{
      run_id: string;
      model: string;
      status: string;
      score: number;
      saved_at: string;
      days_completed: number;
      final_cash: number | null;
      final_trust: number | null;
    }>;

    return rows.map((row) => {
      return {
        runId: row.run_id,
        model: row.model,
        status: row.status,
        daysCompleted: row.days_completed,
        score: row.score,
        finalCash: row.final_cash == null ? undefined : Math.round(row.final_cash),
        finalTrust: row.final_trust == null ? undefined : Math.round(row.final_trust),
        savedAt: row.saved_at,
      };
    });
  }

  createArenaJob(job: ArenaJobRecord) {
    const now = new Date().toISOString();
    this.db.prepare(`
      INSERT INTO arena_jobs
      (id, status, mode, models_json, max_days, request_json, config_json, created_at, updated_at, error)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      job.arenaId,
      job.status,
      job.mode,
      json(job.models),
      job.maxDays,
      json(job.request ?? {}),
      json(job.config ?? {}),
      job.createdAt || now,
      job.updatedAt || now,
      job.error ?? null
    );

    for (const run of job.runs) {
      this.upsertArenaJobRun(job.arenaId, run);
    }
  }

  updateArenaJob(job: ArenaJobRecord) {
    const now = new Date().toISOString();
    this.db.prepare(`
      UPDATE arena_jobs
      SET status = ?, mode = ?, models_json = ?, max_days = ?, request_json = ?, config_json = ?, updated_at = ?, error = ?
      WHERE id = ?
    `).run(
      job.status,
      job.mode,
      json(job.models),
      job.maxDays,
      json(job.request ?? {}),
      json(job.config ?? {}),
      now,
      job.error ?? null,
      job.arenaId
    );
    for (const run of job.runs) {
      this.upsertArenaJobRun(job.arenaId, run);
    }
  }

  upsertArenaJobRun(arenaId: string, run: ArenaRunRecord) {
    const now = new Date().toISOString();
    this.db.prepare(`
      INSERT INTO arena_job_runs
      (id, arena_id, model, status, day, total_reward, run_id, final_cash, final_trust, decisions_json, config_json, created_at, updated_at, error)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(arena_id, model) DO UPDATE SET
        status = excluded.status,
        day = excluded.day,
        total_reward = excluded.total_reward,
        run_id = excluded.run_id,
        final_cash = excluded.final_cash,
        final_trust = excluded.final_trust,
        decisions_json = excluded.decisions_json,
        config_json = excluded.config_json,
        updated_at = excluded.updated_at,
        error = excluded.error
    `).run(
      randomUUID(),
      arenaId,
      run.model,
      run.status,
      run.day,
      run.totalReward,
      run.runId ?? null,
      run.finalCash ?? null,
      run.finalTrust ?? null,
      json(run.decisions),
      json(run.config ?? {}),
      now,
      now,
      run.error ?? null
    );
  }

  getArenaJob(arenaId: string): ArenaJobRecord {
    const row = this.db.prepare('SELECT * FROM arena_jobs WHERE id = ?').get(arenaId) as ArenaJobRow | undefined;
    if (!row) throw new Error(`Arena run not found: ${arenaId}`);
    const runs = this.db.prepare(`
      SELECT * FROM arena_job_runs WHERE arena_id = ? ORDER BY rowid ASC
    `).all(arenaId) as ArenaJobRunRow[];

    return {
      arenaId: row.id,
      status: row.status,
      mode: row.mode,
      models: parseJson<string[]>(row.models_json),
      maxDays: row.max_days,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      error: row.error ?? undefined,
      request: parseJson(row.request_json),
      config: parseJson(row.config_json),
      runs: runs.map((run) => ({
        model: run.model,
        status: run.status,
        day: run.day,
        totalReward: run.total_reward,
        runId: run.run_id ?? undefined,
        finalCash: run.final_cash ?? undefined,
        finalTrust: run.final_trust ?? undefined,
        decisions: parseJson<ArenaRunTraceRecord[]>(run.decisions_json),
        config: parseJson(run.config_json),
        error: run.error ?? undefined,
      })),
    };
  }

  getArenaScoreboard(limit = 25) {
    const replays = dedupeReplaySummariesByModel(
      this.listAiReplaySummaries({ status: 'complete', limit: 300 })
        .filter((replay) => replay.daysCompleted >= 30)
    ).slice(0, limit);
    return replays.map((replay) => {
      const timeline = this.getTimeline(replay.runId);
      const decisions = this.getAiDecisions(replay.runId);
      const totals = this.summarizeTimeline(timeline);
      return {
        runId: replay.runId,
        model: replay.model,
        score: replay.score,
        finalCash: replay.finalCash ?? 0,
        finalTrust: replay.finalTrust ?? 0,
        daysCompleted: replay.daysCompleted,
        savedAt: replay.savedAt,
        ...totals,
        retries: decisions.reduce((sum, decision) => sum + (decision.retryCount ?? 0), 0),
        fallbacks: decisions.filter((decision) => decision.fallbackUsed || decision.rationale.startsWith('Fallback after')).length,
        errors: decisions.filter((decision) => decision.error).length,
        averageLatencyMs: decisions.length > 0
          ? Math.round(decisions.reduce((sum, decision) => sum + decision.latencyMs, 0) / decisions.length)
          : 0,
      };
    }).sort((a, b) => b.score - a.score || b.daysCompleted - a.daysCompleted || Date.parse(b.savedAt) - Date.parse(a.savedAt));
  }

  private summarizeTimeline(timeline: DayLog[]) {
    const productDemand: Partial<Record<ProductId, { sold: number; missed: number }>> = {};
    let profit = 0;
    let revenue = 0;
    let soldUnits = 0;
    let missedUnits = 0;
    let wasteLoss = 0;
    let stockoutDays = 0;
    let stockoutIncidents = 0;
    let marketingSpend = 0;
    let marketingScore = 0;
    let marketingMargin = 0;
    let marketingMissedUnits = 0;
    let marketingActiveDays = 0;

    for (const log of timeline) {
      const result = log.results;
      profit += result.profit;
      wasteLoss += result.wasteLoss;
      if (result.stockouts > 0) stockoutDays += 1;
      stockoutIncidents += result.stockouts;
      const marketing = result.marketingPerformance;
      if (marketing) {
        marketingSpend += marketing.spendToday ?? 0;
        marketingScore += marketing.score ?? 0;
        marketingMargin += marketing.targetGrossMargin ?? 0;
        marketingMissedUnits += marketing.missedTargetUnits ?? 0;
        if ((marketing.activeCampaigns ?? 0) > 0) marketingActiveDays += 1;
      }
      for (const visit of result.customerVisits ?? []) {
        revenue += visit.revenue;
      }
      for (const movement of result.inventoryMovements ?? []) {
        soldUnits += movement.sold;
        missedUnits += movement.missedDemand;
        productDemand[movement.productId] ??= { sold: 0, missed: 0 };
        productDemand[movement.productId]!.sold += movement.sold;
        productDemand[movement.productId]!.missed += movement.missedDemand;
      }
    }

    return {
      profit: Math.round(profit),
      revenue: Math.round(revenue),
      soldUnits,
      missedUnits,
      serviceRate: soldUnits + missedUnits > 0 ? soldUnits / (soldUnits + missedUnits) : 1,
      wasteLoss: Math.round(wasteLoss),
      stockoutDays,
      stockoutIncidents,
      marketingSpend: Math.round(marketingSpend),
      marketingScore,
      marketingMargin: Math.round(marketingMargin),
      marketingMissedUnits,
      marketingActiveDays,
      marketingRoi: marketingSpend > 0 ? marketingMargin / marketingSpend : 0,
      productServiceRates: Object.fromEntries(
        PRODUCTS.map((product) => {
          const totals = productDemand[product.id] ?? { sold: 0, missed: 0 };
          const demand = totals.sold + totals.missed;
          return [product.id, demand > 0 ? totals.sold / demand : 1];
        })
      ),
    };
  }

  private validateActions(state: GameState, actions: PlayerActions): string[] {
    const errors = validateMarketingSelections(state.day, actions.marketingActions);
    const orderCost = Object.entries(actions.orders).reduce((sum, [productId, qty]) => {
      const product = PRODUCTS.find((item) => item.id === productId);
      return sum + (qty ?? 0) * (product?.costPrice ?? 0);
    }, 0);
    const campaignCost = actions.marketingActions.reduce((sum, selection) => {
      const campaign = getAvailableCampaigns(state.day).find((item) => item.id === selection.specId);
      return sum + (campaign?.cost ?? 0);
    }, 0);
    if (orderCost + campaignCost > state.cash) {
      errors.push(`Plan costs ₹${orderCost + campaignCost}, but cash is ₹${state.cash}`);
    }
    return errors;
  }

  private resolveCampaignOutcomes(
    campaigns: MarketingCampaignInstance[],
    result: DayResult
  ): MarketingCampaignInstance[] {
    return campaigns
      .filter((campaign) => campaign.effectStartDay <= result.day && campaign.effectEndDay >= result.day)
      .map((campaign) => ({
        ...campaign,
        status: campaign.effectEndDay <= result.day ? 'completed' : 'active',
        actualResult: summarizeMarketingResult(campaign, result),
      }));
  }

  private getRunRow(
    runId: string,
    options: { playerId?: string; requireUnowned?: boolean } = {}
  ): GameRunRow {
    const row = this.db.prepare('SELECT * FROM game_runs WHERE id = ?').get(runId) as GameRunRow | undefined;
    if (!row) throw new Error(`Run not found: ${runId}`);
    if (options.playerId !== undefined && row.player_id !== options.playerId) {
      throw new Error(`Run not found: ${runId}`);
    }
    if (options.requireUnowned && row.player_id !== null) {
      throw new Error(`Run not found: ${runId}`);
    }
    return row;
  }

  private updateRun(runId: string, state: GameState, status: string) {
    this.db.prepare(`
      UPDATE game_runs
      SET status = ?, current_day = ?, total_score = ?, state_json = ?, updated_at = ?, version = version + 1
      WHERE id = ?
    `).run(status, state.day, state.getTotalScore(), json(state.toSerialized()), new Date().toISOString(), runId);
  }

  private markComplete(runId: string, state: GameState) {
    this.updateRun(runId, state, 'complete');
  }

  private persistDay(runId: string, log: DayLog, result: DayResult, actions: PlayerActions) {
    const now = new Date().toISOString();
    this.db.prepare(`
      INSERT INTO player_actions (id, run_id, day, actions_json, created_at)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(run_id, day) DO UPDATE SET actions_json = excluded.actions_json
    `).run(randomUUID(), runId, result.day, json(actions), now);

    this.db.prepare(`
      INSERT INTO day_results (id, run_id, day, result_json, log_json, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(run_id, day) DO UPDATE SET result_json = excluded.result_json, log_json = excluded.log_json
    `).run(randomUUID(), runId, result.day, json(result), json(log), now);

    for (const row of result.inventoryMovements) {
      this.db.prepare(`
        INSERT INTO inventory_snapshots
        (id, run_id, day, product_id, opening, ordered, sold, missed, wasted, closing, perishability_json)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        randomUUID(),
        runId,
        result.day,
        row.productId,
        row.openingShelf ?? row.available,
        row.ordered,
        row.sold,
        row.missedDemand,
        row.wasted,
        row.closing,
        json(row.perishability)
      );
    }

    for (const visit of result.customerVisits) {
      this.db.prepare(`
        INSERT INTO customer_visits
        (id, run_id, day, customer_id, customer_name, segment, outcome, payment_mode, revenue, khata_amount, visit_json)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        randomUUID(),
        runId,
        result.day,
        visit.customerId,
        visit.customerName,
        visit.segment,
        visit.outcome,
        visit.paymentMode,
        visit.revenue,
        visit.khataAmount,
        json(visit)
      );
    }

    for (const event of log.events) {
      this.db.prepare(`
        INSERT INTO run_events (id, run_id, day, event_type, event_json, created_at)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(randomUUID(), runId, result.day, event, json({ event }), now);
    }
  }

  private persistCustomerState(runId: string, state: GameState) {
    for (const customer of state.customers) {
      this.db.prepare(`
        INSERT INTO customer_state (id, run_id, day, customer_id, customer_json)
        VALUES (?, ?, ?, ?, ?)
        ON CONFLICT(run_id, day, customer_id) DO UPDATE SET customer_json = excluded.customer_json
      `).run(randomUUID(), runId, state.day, customer.id, json(customer));
    }
  }

  private insertCampaign(campaign: MarketingCampaignInstance) {
    this.db.prepare(`
      INSERT INTO marketing_campaigns
      (id, run_id, spec_id, target_products_json, planned_day, effect_start_day, effect_end_day, status, cost, actual_result_json)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      campaign.id,
      campaign.runId,
      campaign.specId,
      campaign.targetProducts ? json(campaign.targetProducts) : null,
      campaign.plannedDay,
      campaign.effectStartDay,
      campaign.effectEndDay,
      campaign.status,
      campaign.cost,
      campaign.actualResult ? json(campaign.actualResult) : null
    );
  }

  private updateCampaign(campaign: MarketingCampaignInstance) {
    this.db.prepare(`
      UPDATE marketing_campaigns
      SET status = ?, actual_result_json = ?
      WHERE id = ?
    `).run(campaign.status, campaign.actualResult ? json(campaign.actualResult) : null, campaign.id);
  }

  private getCampaigns(runId: string): MarketingCampaignInstance[] {
    const rows = this.db.prepare(`
      SELECT * FROM marketing_campaigns WHERE run_id = ? ORDER BY planned_day ASC
    `).all(runId) as CampaignRow[];
    return rows.map((row) => ({
      id: row.id,
      runId: row.run_id,
      specId: row.spec_id,
      targetProducts: row.target_products_json ? parseJson(row.target_products_json) : undefined,
      plannedDay: row.planned_day,
      effectStartDay: row.effect_start_day,
      effectEndDay: row.effect_end_day,
      status: row.status,
      cost: row.cost,
      actualResult: row.actual_result_json ? parseJson(row.actual_result_json) : undefined,
    }));
  }

  getDatasetStats() {
    const rows = this.db.prepare(`
      SELECT
        player_type,
        status,
        COUNT(*) AS run_count,
        COALESCE(SUM(day_counts.days_completed), 0) AS step_count
      FROM game_runs
      LEFT JOIN (
        SELECT run_id, COUNT(day) AS days_completed
        FROM day_results
        GROUP BY run_id
      ) AS day_counts ON day_counts.run_id = game_runs.id
      GROUP BY player_type, status
    `).all() as Array<{ player_type: PlayerType; status: string; run_count: number; step_count: number }>;

    let humanRuns = 0;
    let aiRuns = 0;
    let heuristicRuns = 0;
    let totalSteps = 0;
    let completeRuns = 0;

    for (const row of rows) {
      totalSteps += row.step_count;
      if (row.status === 'complete') completeRuns += row.run_count;
      if (row.player_type === 'human') humanRuns += row.run_count;
      else aiRuns += row.run_count;
    }

    const heuristicRow = this.db.prepare(`
      SELECT COUNT(DISTINCT run_id) AS count
      FROM ai_players
      WHERE model LIKE '%heuristic%'
    `).get() as { count: number };
    heuristicRuns = heuristicRow.count;

    return {
      humanRuns,
      aiRuns,
      heuristicRuns,
      completeRuns,
      totalSteps,
      exportableExamples: totalSteps,
    };
  }

  listDatasetRuns(options: {
    source?: 'all' | 'human' | 'ai' | 'heuristic';
    status?: string;
    minScore?: number;
    completeOnly?: boolean;
    limit?: number;
  } = {}) {
    const limit = options.limit ?? 80;
    const filters: string[] = ['1 = 1'];
    const args: unknown[] = [];

    if (options.source === 'human') {
      filters.push('game_runs.player_type = ?');
      args.push('human');
    } else if (options.source === 'ai') {
      filters.push('game_runs.player_type = ?');
      args.push('ai');
      filters.push(`(ai_players.model IS NULL OR ai_players.model NOT LIKE '%heuristic%')`);
    } else if (options.source === 'heuristic') {
      filters.push('game_runs.player_type = ?');
      args.push('ai');
      filters.push(`ai_players.model LIKE '%heuristic%'`);
    }

    if (options.status) {
      filters.push('game_runs.status = ?');
      args.push(options.status);
    }
    if (options.completeOnly) {
      filters.push(`game_runs.status = 'complete'`);
    }
    if (options.minScore !== undefined) {
      filters.push('game_runs.total_score >= ?');
      args.push(options.minScore);
    }

    const rows = this.db.prepare(`
      SELECT
        game_runs.id AS run_id,
        game_runs.player_type,
        game_runs.run_name,
        game_runs.status,
        game_runs.total_score,
        game_runs.created_at,
        game_runs.updated_at,
        COALESCE(day_counts.days_completed, 0) AS days_completed,
        players.display_name AS player_name,
        ai_players.model AS ai_model,
        json_extract(game_runs.state_json, '$.runSeed') AS run_seed,
        COALESCE(decision_counts.rationale_days, 0) AS rationale_days
      FROM game_runs
      LEFT JOIN (
        SELECT run_id, COUNT(day) AS days_completed
        FROM day_results
        GROUP BY run_id
      ) AS day_counts ON day_counts.run_id = game_runs.id
      LEFT JOIN players ON players.id = game_runs.player_id
      LEFT JOIN ai_players ON ai_players.run_id = game_runs.id
      LEFT JOIN (
        SELECT run_id, COUNT(*) AS rationale_days
        FROM ai_decisions
        WHERE rationale IS NOT NULL AND rationale != ''
        GROUP BY run_id
      ) AS decision_counts ON decision_counts.run_id = game_runs.id
      WHERE ${filters.join(' AND ')}
      ORDER BY game_runs.total_score DESC, days_completed DESC, game_runs.updated_at DESC
      LIMIT ?
    `).all(...args, limit) as Array<{
      run_id: string;
      player_type: PlayerType;
      run_name: string | null;
      status: string;
      total_score: number;
      created_at: string;
      updated_at: string;
      days_completed: number;
      player_name: string | null;
      ai_model: string | null;
      run_seed: number | null;
      rationale_days: number;
    }>;

    return rows.map((row) => ({
      runId: row.run_id,
      playerType: row.player_type,
      runName: row.run_name ?? undefined,
      status: row.status,
      daysCompleted: row.days_completed,
      totalScore: row.total_score,
      runSeed: row.run_seed == null ? undefined : Number(row.run_seed),
      playerName: row.player_name ?? undefined,
      aiModel: row.ai_model ?? undefined,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      exampleCount: row.days_completed,
      hasRationale: row.rationale_days > 0,
      sourceTag: row.player_type === 'human'
        ? 'human' as const
        : row.ai_model?.includes('heuristic')
          ? 'heuristic' as const
          : 'ai' as const,
    }));
  }

  getDatasetRunMeta(runId: string) {
    const row = this.getRunRow(runId);
    const daysCompleted = this.db.prepare(`
      SELECT COUNT(day) AS count FROM day_results WHERE run_id = ?
    `).get(runId) as { count: number };
    const aiPlayer = this.db.prepare(`
      SELECT model FROM ai_players WHERE run_id = ? ORDER BY rowid ASC LIMIT 1
    `).get(runId) as { model: string } | undefined;
    const player = row.player_id ? this.getPlayer(row.player_id) : undefined;
    const state = GameState.fromSerialized(parseJson<SerializedGameState>(row.state_json));

    return {
      runId,
      playerType: row.player_type,
      runName: row.run_name ?? undefined,
      status: row.status,
      totalScore: row.total_score,
      daysCompleted: daysCompleted.count,
      runSeed: state.runSeed,
      playerName: player?.displayName,
      aiModel: aiPlayer?.model,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  buildObservationFromState(
    runId: string,
    state: GameState,
    campaigns: MarketingCampaignInstance[],
    playerType: PlayerType
  ): RunObservation {
    const lastLog = state.history[state.history.length - 1];
    const done = state.isGameOver();
    return {
      runId,
      playerType,
      state: state.toSerialized(),
      visibleState: state.getVisibleState(),
      done,
      activeMarketing: getVisibleMarketingCampaigns(campaigns, state.day),
      availableMarketing: getAvailableCampaigns(Math.min(state.day, state.config.maxDays)),
      scores: {
        total: state.getTotalScore(),
        lastDay: lastLog?.results.rewardBreakdown.total ?? 0,
      },
    };
  }

  getMemorySummary(runId: string, day: number) {
    const row = this.db.prepare(`
      SELECT summary_json FROM ai_memory_summaries WHERE run_id = ? AND day = ?
    `).get(runId, day) as { summary_json: string } | undefined;
    return row ? parseJson(row.summary_json) : undefined;
  }

  private getPlayer(playerId: string) {
    const row = this.db.prepare(`
      SELECT id, display_name, kind, created_at FROM players WHERE id = ?
    `).get(playerId) as {
      id: string;
      display_name: string;
      kind: 'human' | 'ai' | 'system';
      created_at: string;
    } | undefined;

    if (!row) return undefined;
    return {
      id: row.id,
      displayName: row.display_name,
      kind: row.kind,
      createdAt: row.created_at,
    };
  }
}
