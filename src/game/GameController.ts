import type { PlayerActions, DayResult, RunObservation } from '../types';
import { GameState } from '../game/GameState';
import { ShopRenderer } from '../render/ShopRenderer';
import { UIManager } from '../ui/UIManager';
import { DEFAULT_CONFIG } from '../constants/products';
import { EnvironmentSignalEngine } from './progression/EnvironmentSignalEngine';
import { LLMDayContextClient } from './progression/LLMDayContextClient';
import { BackendGameClient } from './progression/BackendGameClient';

type SimulationSource = 'initial' | 'case';

export class GameController {
  private state: GameState;
  private renderer: ShopRenderer;
  private ui: UIManager;
  private backendClient = new BackendGameClient();
  private environmentEngine = new EnvironmentSignalEngine();
  private dayContextClient = new LLMDayContextClient();
  private readonly liveDaySequenceMs = 4400;
  private readonly runStorageKey = 'kirana.activeRunId';
  private runId?: string;
  private currentReportState?: GameState;
  private pendingActions: PlayerActions = {
    orders: {},
    removals: {},
    discounts: {},
    khataReminders: [],
    marketingActions: [],
    cashReserve: DEFAULT_CONFIG.defaultCashReserve,
    fridgeAllocation: { milk: 60, cold_drinks: 30, buffer: 10 },
  };
  private isSimulating: boolean = false;
  private hasStarted: boolean = false;
  private isInitialStocking: boolean = false;
  private isStartingRun: boolean = false;

  constructor() {
    this.state = new GameState();
    this.renderer = new ShopRenderer('shop-canvas');

    this.ui = new UIManager(
      'ui-layer',
      (actions) => { void this.onPlayerAction(actions); },
      (actions) => this.onPlanChange(actions),
      () => this.showFinalScoreboard(),
      () => { void this.showAIReplay(); }
    );
  }

  private showOpening() {
    this.ui.showOpeningScreen();
    this.renderer.render(this.state);
  }

  private async onPlayerAction(actions: PlayerActions) {
    if (!this.hasStarted) {
      if (this.isStartingRun) return;
      this.isStartingRun = true;
      try {
        await this.ensureRun();
      } catch (error) {
        this.isStartingRun = false;
        this.showBackendError(error);
        return;
      }
      this.isStartingRun = false;
      this.hasStarted = true;
      this.isInitialStocking = true;
      this.pendingActions = this.createEmptyPlan();
      this.state.setActions(this.pendingActions);
      this.ui.showInitialStockingScreen(this.state);
      this.renderer.render(this.state);
      void this.enrichInitialStockingContext();
      return;
    }

    if (this.isInitialStocking) {
      if (this.isSimulating) return;
      this.pendingActions = actions;
      this.state.setActions(actions);
      this.isInitialStocking = false;
      await this.runSimulation('initial');
      return;
    }

    if (this.isSimulating) return;
    if (this.state.isGameOver()) {
      this.showFinalScoreboard();
      return;
    }

    this.pendingActions = actions;
    this.state.setActions(actions);
    await this.runSimulation('case');
  }

  private onPlanChange(actions: PlayerActions) {
    if (!this.hasStarted || this.isSimulating) return;
    this.pendingActions = actions;
    this.state.setActions(actions);
    this.renderer.render(this.state);
  }

  private async runSimulation(source: SimulationSource) {
    this.isSimulating = true;
    const simulationDay = this.state.day;
    this.ui.showLiveDayScreen(simulationDay);
    this.renderer.render(this.state);

    try {
      await this.ensureRun();
      const response = await this.backendClient.stepRun(this.runId!, this.pendingActions);

      if (!response.result) {
        this.applyObservation(response.observation);
        this.showFinalScoreboard();
        return;
      }

      this.ui.showLiveDayScreen(simulationDay, response.result);
      this.renderer.render(this.state);
      await this.wait(this.liveDaySequenceMs);

      this.applyObservation(response.observation);
      const reportState = GameState.fromSerialized(response.observation.state);
      reportState.day = response.result.day;
      this.currentReportState = reportState;
      this.ui.showCaseScreen(response.result, reportState, undefined, false, 'loading');
      this.renderer.render(this.state);
      void this.enrichCaseContext(response.result);
    } catch (error) {
      this.restorePlanningAfterSimulationError(source);
      this.showBackendError(error);
    } finally {
      this.isSimulating = false;
    }
  }

  private restorePlanningAfterSimulationError(source: SimulationSource) {
    if (source === 'initial') {
      this.isInitialStocking = true;
      this.ui.showInitialStockingScreen(this.state);
      this.renderer.render(this.state);
      void this.enrichInitialStockingContext();
      return;
    }

    const latestLog = this.state.history[this.state.history.length - 1];
    if (!latestLog) {
      this.showOpening();
      return;
    }

    const reportState = this.currentReportState ?? this.state;
    this.ui.showCaseScreen(latestLog.results, reportState, undefined, false, 'loading');
    this.renderer.render(this.state);
    void this.enrichCaseContext(latestLog.results);
  }

  private async enrichInitialStockingContext() {
    const environment = this.environmentEngine.buildOpening({
      maxDays: DEFAULT_CONFIG.maxDays,
      customers: this.state.customers,
    });
    const dayContext = await this.dayContextClient.getOpeningContext(this.state, environment);
    if (!this.isInitialStocking || this.isSimulating) return;
    this.ui.showInitialStockingScreen(this.state, dayContext, true, dayContext ? 'ready' : 'unavailable');
  }

  private async enrichCaseContext(result: DayResult) {
    const reportState = this.currentReportState ?? this.state;
    const environment = this.environmentEngine.build({
      completedDay: result.day,
      maxDays: DEFAULT_CONFIG.maxDays,
      customers: reportState.customers,
      result,
    });
    const dayContext = await this.dayContextClient.getPostDayContext(reportState, result, environment);
    const latestLog = this.state.history[this.state.history.length - 1];
    if (this.isSimulating || latestLog?.results.day !== result.day) return;
    this.ui.showCaseScreen(result, reportState, dayContext, true, dayContext ? 'ready' : 'unavailable');
  }

  private showFinalScoreboard() {
    window.localStorage.removeItem(this.runStorageKey);
    this.ui.showFinalScoreboard(this.state);
    this.renderer.render(this.state);
  }

  private async showAIReplay() {
    try {
      const response = await this.backendClient.startAiRun();
      const trust = Math.round(response.summary.finalTrust);
      alert([
        'AI Replay Benchmark Complete',
        `Days: ${response.summary.daysCompleted}`,
        `Score: ${response.summary.totalScore}`,
        `Cash: ₹${Math.round(response.summary.finalCash).toLocaleString()}`,
        `Trust: ${trust}%`,
      ].join('\n'));
    } catch (error) {
      this.showBackendError(error);
    }
  }

  start() {
    void this.restoreOrShowOpening();
  }

  private createEmptyPlan(): PlayerActions {
    return {
      orders: {},
      removals: {},
      discounts: {},
      khataReminders: [],
      marketingActions: [],
      cashReserve: this.pendingActions.cashReserve,
      fridgeAllocation: { ...this.pendingActions.fridgeAllocation },
    };
  }

  private wait(ms: number) {
    return new Promise<void>((resolve) => window.setTimeout(resolve, ms));
  }

  private async ensureRun() {
    if (this.runId) return;
    const observation = await this.backendClient.createRun('human');
    this.applyObservation(observation);
    window.localStorage.setItem(this.runStorageKey, observation.runId);
  }

  private applyObservation(observation: RunObservation) {
    this.runId = observation.runId;
    this.state = GameState.fromSerialized(observation.state);
    this.ui.setMarketingPipeline(observation.activeMarketing);
  }

  private async restoreOrShowOpening() {
    const storedRunId = window.localStorage.getItem(this.runStorageKey);
    if (!storedRunId) {
      this.showOpening();
      return;
    }

    try {
      const observation = await this.backendClient.getState(storedRunId);
      this.applyObservation(observation);
      this.hasStarted = true;
      this.isInitialStocking = observation.state.history.length === 0 && !observation.done;

      if (observation.done) {
        this.showFinalScoreboard();
        return;
      }

      if (this.isInitialStocking) {
        this.ui.showInitialStockingScreen(this.state);
        this.renderer.render(this.state);
        void this.enrichInitialStockingContext();
        return;
      }

      const latestLog = this.state.history[this.state.history.length - 1];
      if (latestLog) {
        const reportState = GameState.fromSerialized(observation.state);
        reportState.day = latestLog.results.day;
        this.currentReportState = reportState;
        this.ui.showCaseScreen(latestLog.results, reportState, undefined, false, 'loading');
        this.renderer.render(this.state);
        void this.enrichCaseContext(latestLog.results);
        return;
      }

      this.showOpening();
    } catch {
      window.localStorage.removeItem(this.runStorageKey);
      this.showOpening();
    }
  }

  private showBackendError(error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    alert(`Game backend request failed:\n${message}`);
  }
}
