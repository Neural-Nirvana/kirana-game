import { createHash, randomUUID } from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';
import type {
  DayLog,
  DayResult,
  MarketingCampaignInstance,
  PlayerActions,
  RunObservation,
  SerializedGameState,
  StepRunResponse,
} from '../src/types';
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

export class RunStore {
  constructor(private readonly db: DatabaseSync) {}

  createRun(
    playerType: PlayerType = 'human',
    options: { playerId?: string; runName?: string } = {}
  ): RunObservation {
    const now = new Date().toISOString();
    const state = new GameState();
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
    const simulator = new DaySimulator();
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
  }) {
    const observationHash = createHash('sha256').update(json(params.observation)).digest('hex');
    this.db.prepare(`
      INSERT INTO ai_decisions
      (id, run_id, ai_player_id, day, observation_hash, action_json, rationale, model, latency_ms, cost_estimate, error)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
      params.error ?? null
    );
  }

  createAiMemorySummary(runId: string, day: number, summary: unknown) {
    this.db.prepare(`
      INSERT INTO ai_memory_summaries (id, run_id, day, summary_json, created_at)
      VALUES (?, ?, ?, ?, ?)
    `).run(randomUUID(), runId, day, json(summary), new Date().toISOString());
  }

  getAiDecisions(runId: string) {
    return this.db.prepare(`
      SELECT day, observation_hash, action_json, rationale, model, latency_ms, cost_estimate, error
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
