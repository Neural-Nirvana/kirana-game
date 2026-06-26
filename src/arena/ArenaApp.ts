import { apiPath } from '../base-path';
import { PRODUCT_NAME, PRODUCT_TAGLINE, SHOP_NAME } from '../constants/brand';
import { adaptAiReplay } from './arena-adapter';
import {
  compareByFinalScore,
  dedupeReplaySummariesByModel,
  modelMatchesReplay,
  sortModelPresetsByScore,
} from './arena-shared';
import { ArenaStage } from './ArenaStage';
import { DEFAULT_NEIGHBORHOOD_PROFILE } from '../constants/neighborhood';
import type {
  AiReplayResponse,
  ArenaJobResponse,
  ArenaLiveMetrics,
  ArenaModelPreset,
  ArenaModelsResponse,
  ArenaReplayDay,
  ArenaReplayIndexResponse,
  ArenaReplayRun,
  ArenaReplaySummary,
  ArenaRunSummary,
} from './arena-types';

import effectCustomersUrl from '../assets/arena/effect-customers.png';
import effectKhataUrl from '../assets/arena/effect-khata.png';
import effectWarningUrl from '../assets/arena/effect-warning.png';
import productChipsUrl from '../assets/arena/product-chips.png';
import productMilkUrl from '../assets/arena/product-milk.png';

type ArenaProfile = 'fast' | 'max';
type ArenaPlaybackMode = 'manual' | 'auto';

type RecentArenaReplay = ArenaReplaySummary;

const RECENT_REPLAYS_KEY = 'shree-shyam-arena-recent-replays';
const POLL_INTERVAL_MS = 3500;
const AUTO_ADVANCE_DELAY_MS = 5200;
const COMPLETE_REPLAY_DAYS = 30;
const DEFAULT_MODEL_PRESETS: ArenaModelPreset[] = [
  {
    id: 'heuristic-v2',
    label: 'Built-in Heuristic',
    note: 'Instant local baseline. No OpenRouter cost.',
  },
  {
    id: 'google/gemini-3.1-flash-lite',
    label: 'Gemini Flash Lite',
    note: 'Fast US-provider candidate for live viewing.',
  },
  {
    id: 'openai/gpt-5.5',
    label: 'GPT 5.5',
    note: 'Strong OpenAI reasoning baseline. Uses Responses API.',
  },
  {
    id: 'openai/gpt-5.4-mini',
    label: 'GPT 5.4 Mini',
    note: 'OpenAI text model for low-latency kirana decisions.',
  },
  {
    id: 'google/gemini-3.1-pro-preview',
    label: 'Gemini 3.1 Pro',
    note: 'High-reasoning Gemini candidate. Uses Responses in max runs.',
  },
  {
    id: 'x-ai/grok-4.3',
    label: 'Grok 4.3',
    note: 'xAI high-reasoning candidate. Uses Responses JSON-object in max runs.',
  },
  {
    id: 'anthropic/claude-opus-4.8',
    label: 'Claude Opus 4.8',
    note: 'Premium Anthropic reasoning model. Smoke-test before full runs.',
  },
  {
    id: 'z-ai/glm-5.2',
    label: 'GLM 5.2',
    note: 'Thinking-capable model. Can be slower.',
  },
  {
    id: 'deepseek/deepseek-v4-flash',
    label: 'DeepSeek V4 Flash',
    note: 'Fast DeepSeek profile with compact observation.',
  },
  {
    id: 'deepseek/deepseek-v4-pro',
    label: 'DeepSeek V4 Pro',
    note: 'Stronger DeepSeek candidate; max runs use high reasoning.',
  },
];

export class ArenaApp {
  private readonly root: HTMLElement;
  private stage?: ArenaStage;
  private run?: ArenaReplayRun;
  private arenaJob?: ArenaJobResponse;
  private pollTimer?: number;
  private activeDayIndex = 0;
  private speed = 5;
  private paused = false;
  private playing = false;
  private reportOpen = false;
  private introVisible = false;
  private modelPickerOpen = false;
  private playbackMode: ArenaPlaybackMode = 'manual';
  private liveMetrics?: ArenaLiveMetrics;
  private selectedModel = 'heuristic-v2';
  private customModel = '';
  private profile: ArenaProfile = 'fast';
  private maxDays = 30;
  private modelPresets: ArenaModelPreset[] = DEFAULT_MODEL_PRESETS;
  private recentReplays: RecentArenaReplay[] = loadRecentReplays();
  private indexedReplays: ArenaReplaySummary[] = [];
  private autoPlayedDays = new Set<number>();
  private launcherMessage = 'Choose an AI model, start a live run, then watch each completed day replay from the backend.';
  private launcherError = false;

  constructor(rootId: string) {
    const root = document.getElementById(rootId);
    if (!root) throw new Error(`Missing arena root: ${rootId}`);
    this.root = root;
  }

  async start() {
    this.renderShell();
    this.bindEvents();
    this.stage = new ArenaStage(this.requireElement('arena-stage'), (metrics) => this.updateLiveMetrics(metrics));
    this.stage.mount(undefined);
    this.setLoading('Pick an AI model, then replay a completed benchmark or start a fresh live run.', false, true);
    this.renderIdle();
    void this.loadModelOptions();
    void this.loadReplayIndex();
    if (shouldShowIntro()) this.showIntro();
  }

  private async loadModelOptions() {
    try {
      const response = await requestJson<ArenaModelsResponse>('/api/arena/models');
      this.modelPresets = mergeModelPresets(DEFAULT_MODEL_PRESETS, response.presets, response.available);
      this.renderLauncher();
      this.renderModelPicker();
    } catch {
      this.modelPresets = DEFAULT_MODEL_PRESETS;
      this.renderLauncher();
      this.renderModelPicker();
    }
  }

  private async loadReplayIndex() {
    try {
      const response = await requestJson<ArenaReplayIndexResponse>('/api/arena/replays?status=complete');
      this.indexedReplays = response.replays;
      this.renderLauncher();
      this.renderModelPicker();
      this.renderHud(this.run?.days[this.activeDayIndex]);
    } catch {
      this.indexedReplays = [];
    }
  }

  private renderShell() {
    this.root.innerHTML = `
      <main class="arena-root" aria-label="${PRODUCT_NAME} Replay">
        <section class="arena-hud" id="arena-hud"></section>
        <section class="arena-dashboard" id="arena-dashboard"></section>
        <section class="arena-stage-shell">
          <div class="arena-stage-frame" id="arena-stage"></div>
          <div class="arena-stage-overlay" id="arena-loading">
            <div class="arena-loader-title">Preparing ${PRODUCT_NAME}</div>
            <div class="arena-loader-subtitle">Choose a model to begin.</div>
          </div>
        </section>
        <section class="arena-footer">
          <div class="arena-timeline" id="arena-timeline"></div>
          <div class="arena-controls" id="arena-controls"></div>
        </section>
        <section class="arena-launcher" id="arena-launcher"></section>
        <section class="arena-intro" id="arena-intro" hidden>
          <div class="arena-intro-card">
            <div class="arena-intro-eyebrow">${PRODUCT_NAME} Replay</div>
            <h2>Can an AI run a kirana for 30 days?</h2>
            <p>
              ${SHOP_NAME} turns dukaandari into a visible AI test:
              the model reads a fixed fictional neighborhood, inventory, weather, customers, trust, khata, and marketing,
              then submits one JSON plan per day.
            </p>
            <div class="arena-intro-grid">
              <div><strong>1. Pick a model</strong><span>Use a local baseline or an OpenRouter model.</span></div>
              <div><strong>2. Watch it decide</strong><span>Every action JSON is validated and saved.</span></div>
              <div><strong>3. Replay the proof</strong><span>Customers, rewards, misses, and trust changes animate from real backend results.</span></div>
            </div>
            ${neighborhoodBrief('intro')}
            <button data-arena-action="start-intro" type="button">Choose AI Model</button>
          </div>
        </section>
        <section class="arena-model-modal" id="arena-model-modal" hidden></section>
        <aside class="arena-report" id="arena-report" hidden></aside>
      </main>
    `;
  }

  private bindEvents() {
    this.root.addEventListener('click', (event) => {
      const target = event.target instanceof Element ? event.target.closest<HTMLElement>('[data-arena-action]') : null;
      if (!target) return;
      const action = target.dataset.arenaAction;
      if (action === 'open-model-picker') this.openModelPicker();
      if (action === 'close-model-picker') this.closeModelPicker();
      if (action === 'select-model') this.selectModel(target.dataset.model ?? 'heuristic-v2');
      if (action === 'profile') this.setProfile(target.dataset.profile === 'max' ? 'max' : 'fast');
      if (action === 'start-live') void this.startLiveArena();
      if (action === 'replay-run') {
        this.modelPickerOpen = false;
        void this.loadStoredReplay(target.dataset.runId ?? '');
      }
      if (action === 'clear-replays') this.clearRecentReplays();
      if (action === 'simulate') void this.playActiveDay();
      if (action === 'pause') this.togglePause();
      if (action === 'replay') void this.replayDay();
      if (action === 'report') this.toggleReport();
      if (action === 'speed') this.setSpeed(Number(target.dataset.speed ?? 5));
      if (action === 'playback-mode') this.setPlaybackMode(target.dataset.mode === 'auto' ? 'auto' : 'manual');
      if (action === 'next-day') void this.playNextDayFromControls();
      if (action === 'timeline') this.selectDay(Number(target.dataset.dayIndex ?? 0));
      if (action === 'start-intro') this.dismissIntro();
    });

    this.root.addEventListener('input', (event) => {
      const target = event.target;
      if (!(target instanceof HTMLInputElement)) return;
      if (target.id === 'arena-custom-model') {
        this.customModel = target.value;
      }
      if (target.id === 'arena-max-days') {
        this.maxDays = clamp(Number(target.value || 30), 1, 30);
        target.value = String(this.maxDays);
      }
      this.renderHud(this.run?.days[this.activeDayIndex]);
    });
  }

  private showIntro() {
    const intro = this.requireElement('arena-intro');
    intro.hidden = false;
    this.introVisible = true;
  }

  private dismissIntro() {
    if (!this.introVisible) return;
    markIntroSeen();
    this.requireElement('arena-intro').hidden = true;
    this.introVisible = false;
    this.setLoading('Pick an AI model, then replay a completed benchmark or start a fresh live run.', false, true);
    this.openModelPicker();
  }

  private openModelPicker() {
    this.modelPickerOpen = true;
    this.renderModelPicker();
  }

  private closeModelPicker() {
    this.modelPickerOpen = false;
    this.renderModelPicker();
    this.renderLauncher();
    this.renderHud(this.run?.days[this.activeDayIndex]);
  }

  private selectModel(model: string) {
    this.selectedModel = model;
    if (model !== 'custom') this.customModel = '';
    const completedReplay = this.completedReplayForModel(this.resolvedModel);
    this.launcherError = false;
    this.launcherMessage = completedReplay
      ? `${modelLabel(this.resolvedModel, this.modelPresets)} has a completed 30-day replay. Use Replay 30-day Run for instant judging.`
      : isHeuristicModel(this.resolvedModel)
      ? 'Built-in heuristic will run instantly and save the replay like any other AI.'
      : 'This model will call OpenRouter and stream completed days into the arena as they finish.';
    this.renderLauncher();
    this.renderModelPicker();
    this.renderHud(this.run?.days[this.activeDayIndex]);
  }

  private setProfile(profile: ArenaProfile) {
    this.profile = profile;
    this.launcherMessage = profile === 'max'
      ? 'Max capability uses stricter JSON schema, medium reasoning, and a long timeout. Good for fairer model tests.'
      : 'Fast live uses compact observations and shorter response settings so the replay starts sooner.';
    this.renderLauncher();
    this.renderModelPicker();
  }

  private async startLiveArena() {
    const model = this.resolvedModel.trim();
    if (!model) {
      this.launcherError = true;
      this.launcherMessage = 'Enter a custom OpenRouter model id, or choose one of the presets.';
      this.renderLauncher();
      return;
    }

    this.stopPolling();
    this.stage?.stopReplay();
    this.playing = false;
    this.paused = false;
    this.reportOpen = false;
    this.liveMetrics = undefined;
    this.run = undefined;
    this.arenaJob = undefined;
    this.autoPlayedDays.clear();
    this.modelPickerOpen = false;
    this.renderIdle();
    this.setLoading(`Starting ${modelLabel(model, this.modelPresets)}...`);

    try {
      const job = await this.createArenaJob(model);
      this.arenaJob = job;
      this.launcherError = false;
      this.launcherMessage = `Arena job ${shortId(job.arenaId)} started. Waiting for Day 1 decision and simulation.`;
      this.renderLauncher();
      await this.pollArenaJob();
    } catch (error) {
      this.launcherError = true;
      this.launcherMessage = error instanceof Error ? error.message : String(error);
      this.renderLauncher();
      this.setLoading(this.launcherMessage, true);
    }
  }

  private async createArenaJob(model: string): Promise<ArenaJobResponse> {
    if (isHeuristicModel(model)) {
      return requestJson<ArenaJobResponse>('/api/arena/runs', {
        method: 'POST',
        body: JSON.stringify({
          mode: 'heuristic',
          models: ['heuristic-v2'],
          maxDays: this.maxDays,
          profile: 'balanced',
        }),
      });
    }

    if (this.profile === 'max') {
      return requestJson<ArenaJobResponse>('/api/arena/max-capability-runs', {
        method: 'POST',
        body: JSON.stringify({
          models: [model],
          maxDays: this.maxDays,
        }),
      });
    }

    return requestJson<ArenaJobResponse>('/api/arena/runs', {
      method: 'POST',
      body: JSON.stringify({
        mode: 'llm',
        models: [model],
        maxDays: this.maxDays,
        profile: 'balanced',
        observationMode: 'compact',
        responseMode: 'json_schema',
        reasoning: 'off',
        temperature: 0.15,
        requireJsonSchema: false,
        requireParameters: true,
        timeoutMs: 90000,
        maxTokens: 1800,
      }),
    });
  }

  private async pollArenaJob() {
    if (!this.arenaJob) return;
    this.stopPolling();

    try {
      const job = await requestJson<ArenaJobResponse>(`/api/arena/runs/${encodeURIComponent(this.arenaJob.arenaId)}`);
      this.arenaJob = job;
      this.renderLauncher();
      await this.refreshReplayFromJob(job);

      if (job.status === 'running' || job.status === 'queued') {
        this.pollTimer = window.setTimeout(() => void this.pollArenaJob(), POLL_INTERVAL_MS);
      } else if (job.status === 'failed') {
        this.launcherError = true;
        this.launcherMessage = job.error ?? primaryRun(job)?.error ?? 'Arena job failed.';
        this.renderLauncher();
        if (!this.run) this.setLoading(this.launcherMessage, true);
      } else {
        this.launcherError = false;
        this.launcherMessage = 'Arena run complete. The exact AI actions and results are saved in SQLite and can be replayed.';
        this.renderLauncher();
        if (!this.playing && this.run) this.clearLoading();
      }
    } catch (error) {
      this.launcherError = true;
      this.launcherMessage = error instanceof Error ? error.message : String(error);
      this.renderLauncher();
      this.pollTimer = window.setTimeout(() => void this.pollArenaJob(), POLL_INTERVAL_MS * 2);
    }
  }

  private async refreshReplayFromJob(job: ArenaJobResponse) {
    const run = primaryRun(job);
    if (!run?.runId) {
      this.setLoading(`${modelLabel(run?.model ?? this.resolvedModel, this.modelPresets)} is preparing Day ${run?.day ?? 1}...`);
      return;
    }

    const replay = await requestJson<AiReplayResponse>(`/api/ai-runs/${encodeURIComponent(run.runId)}`);
    const previousRunId = this.run?.runId;
    const previousDays = previousRunId === run.runId ? this.run?.days.length ?? 0 : 0;
    this.applyReplayResponse(replay, job.maxDays);
    this.rememberReplay(run);

    const hasNewDay = this.run && this.run.days.length > previousDays;
    if (hasNewDay) {
      this.launcherError = false;
      this.launcherMessage = this.playbackMode === 'auto'
        ? `Day ${this.run?.days.length ?? 0} completed by ${modelLabel(run.model, this.modelPresets)}. Animating backend result.`
        : `Day ${this.run?.days.length ?? 0} is ready. Press Play Day when you are ready to watch.`;
      this.renderLauncher();
      if (this.playbackMode === 'auto') void this.playNextUnplayedDay();
      else this.renderAll();
    } else if (job.status === 'running') {
      const nextDay = Math.min((this.run?.days.length ?? 0) + 1, job.maxDays);
      this.setLoading(`${modelLabel(run.model, this.modelPresets)} is thinking through Day ${nextDay}...`);
    }
  }

  private async loadStoredReplay(runId: string) {
    if (!runId) return;
    this.stopPolling();
    this.stage?.stopReplay();
    this.arenaJob = undefined;
    this.playing = false;
    this.paused = false;
    this.modelPickerOpen = false;
    this.autoPlayedDays.clear();
    this.setLoading(`Loading saved replay ${shortId(runId)}...`);

    try {
      const replay = await requestJson<AiReplayResponse>(`/api/ai-runs/${encodeURIComponent(runId)}`);
      this.applyReplayResponse(replay);
      if (!this.run || this.run.days.length === 0) throw new Error('Saved run has no completed days yet.');
      this.selectModelFromReplay(this.run.days[0]?.model);
      this.launcherError = false;
      this.launcherMessage = `Loaded ${modelLabel(this.run.days[0].model, this.modelPresets)} replay ${shortId(runId)}. No model call needed.`;
      this.renderLauncher();
      this.clearLoading();
      if (this.playbackMode === 'auto') void this.playNextUnplayedDay();
      else this.renderAll();
    } catch (error) {
      this.launcherError = true;
      this.launcherMessage = error instanceof Error ? error.message : String(error);
      this.renderLauncher();
      this.setLoading(this.launcherMessage, true);
    }
  }

  private applyReplayResponse(response: AiReplayResponse, maxDaysOverride?: number) {
    const replay = adaptAiReplay(response, maxDaysOverride);
    const sameRun = this.run?.runId === replay.runId;
    this.run = replay;
    this.liveMetrics = undefined;
    if (!sameRun) {
      this.activeDayIndex = 0;
      this.autoPlayedDays.clear();
      this.stage?.setDay(this.run.days[0]);
    } else {
      this.activeDayIndex = clamp(this.activeDayIndex, 0, Math.max(0, this.run.days.length - 1));
    }
    if (this.run.days.length > 0) {
      this.clearLoading();
      this.renderAll();
    } else {
      this.renderIdle();
    }
  }

  private rememberReplay(run: ArenaRunSummary) {
    if (!run.runId) return;
    const replay: RecentArenaReplay = {
      runId: run.runId,
      model: run.model,
      status: run.status,
      daysCompleted: run.decisions.length,
      score: run.totalReward,
      finalCash: run.finalCash,
      finalTrust: run.finalTrust,
      savedAt: new Date().toISOString(),
    };
    this.recentReplays = [
      replay,
      ...this.recentReplays.filter((candidate) => candidate.runId !== replay.runId),
    ].slice(0, 6);
    saveRecentReplays(this.recentReplays);
  }

  private clearRecentReplays() {
    this.recentReplays = [];
    saveRecentReplays(this.recentReplays);
    this.renderLauncher();
  }

  private allReplaySummaries() {
    const byRunId = new Map<string, ArenaReplaySummary>();
    for (const replay of [...this.indexedReplays, ...this.recentReplays]) {
      const existing = byRunId.get(replay.runId);
      if (!existing || replay.daysCompleted > existing.daysCompleted) byRunId.set(replay.runId, replay);
    }
    return [...byRunId.values()].sort(compareByFinalScore);
  }

  private featuredReplaySummaries() {
    return dedupeReplaySummariesByModel(this.allReplaySummaries());
  }

  private rankedModelPresets() {
    return sortModelPresetsByScore(this.modelPresets, this.featuredReplaySummaries());
  }

  private completedReplayForModel(model: string) {
    return this.featuredReplaySummaries().find((replay) =>
      modelMatchesReplay(model, replay.model) && replay.status === 'complete' && replay.daysCompleted >= COMPLETE_REPLAY_DAYS
    );
  }

  private selectModelFromReplay(model: string | undefined) {
    if (!model) return;
    if (this.modelPresets.some((preset) => preset.id === model)) {
      this.selectedModel = model;
      this.customModel = '';
    } else {
      this.selectedModel = 'custom';
      this.customModel = model;
    }
  }

  private renderIdle() {
    this.renderHud();
    this.renderLauncher();
    this.renderModelPicker();
    this.renderDashboard();
    this.renderTimeline();
    this.renderControls();
    this.renderReport();
  }

  private renderAll() {
    this.renderHud(this.run?.days[this.activeDayIndex]);
    this.renderLauncher();
    this.renderModelPicker();
    this.renderDashboard(this.run?.days[this.activeDayIndex]);
    this.renderTimeline();
    this.renderControls();
    this.renderReport(this.run?.days[this.activeDayIndex]);
  }

  private async playNextUnplayedDay() {
    if (!this.run || this.playing) return;
    const nextIndex = this.run.days.findIndex((day) => !this.autoPlayedDays.has(day.day));
    if (nextIndex < 0) return;
    this.activeDayIndex = nextIndex;
    this.liveMetrics = undefined;
    this.stage?.setDay(this.activeDay);
    this.renderAll();
    await this.playActiveDay(true);
  }

  private async playActiveDay(autoAdvance = false) {
    if (!this.run || this.playing || this.run.days.length === 0) return;
    this.playing = true;
    this.paused = false;
    this.liveMetrics = openingLiveMetrics(this.activeDay);
    this.stage?.setPaused(false);
    this.renderAll();
    await this.stage?.playDay(this.activeDay, this.speed);
    this.autoPlayedDays.add(this.activeDay.day);
    this.liveMetrics = finalLiveMetrics(this.activeDay);
    this.playing = false;
    this.renderAll();
    if (autoAdvance && this.playbackMode === 'auto') {
      window.setTimeout(() => void this.playNextUnplayedDay(), AUTO_ADVANCE_DELAY_MS);
    }
  }

  private async replayDay() {
    if (!this.run) return;
    this.stage?.stopReplay();
    this.playing = false;
    this.liveMetrics = undefined;
    await this.playActiveDay();
  }

  private togglePause() {
    if (!this.playing) return;
    this.paused = !this.paused;
    this.stage?.setPaused(this.paused);
    this.renderControls();
  }

  private selectDay(dayIndex: number) {
    if (!this.run) return;
    const nextIndex = clamp(dayIndex, 0, this.run.days.length - 1);
    this.stage?.stopReplay();
    this.activeDayIndex = nextIndex;
    this.playing = false;
    this.paused = false;
    this.liveMetrics = undefined;
    this.stage?.setDay(this.activeDay);
    this.reportOpen = false;
    this.renderAll();
  }

  private setSpeed(speed: number) {
    this.speed = speed;
    this.renderControls();
  }

  private setPlaybackMode(mode: ArenaPlaybackMode) {
    this.playbackMode = mode;
    this.launcherMessage = mode === 'auto'
      ? 'Auto mode will continue to the next completed day after a longer reading pause.'
      : 'Manual mode waits after every day so you can read the report before moving on.';
    this.renderLauncher();
    this.renderControls();
    if (mode === 'auto') void this.playNextUnplayedDay();
  }

  private async playNextDayFromControls() {
    if (!this.run || this.playing) return;
    const nextIndex = this.activeDayIndex + 1;
    if (nextIndex >= this.run.days.length) return;
    this.stage?.stopReplay();
    this.activeDayIndex = nextIndex;
    this.paused = false;
    this.liveMetrics = undefined;
    this.stage?.setDay(this.activeDay);
    this.renderAll();
    await this.playActiveDay();
  }

  private updateLiveMetrics(metrics: ArenaLiveMetrics) {
    if (!this.run || metrics.day !== this.activeDay.day) return;
    this.liveMetrics = metrics;
    this.renderHud(this.activeDay);
    this.renderDashboard(this.activeDay);
  }

  private liveMetricsFor(day: ArenaReplayDay | undefined) {
    if (!day || this.liveMetrics?.day !== day.day) return undefined;
    return this.liveMetrics;
  }

  private toggleReport() {
    if (!this.run) return;
    this.reportOpen = !this.reportOpen;
    this.renderReport(this.activeDay);
    this.renderControls();
  }

  private renderHud(day?: ArenaReplayDay) {
    const live = this.liveMetricsFor(day);
    this.requireElement('arena-hud').innerHTML = `
      <div class="arena-brand">
        <div class="arena-brand-icon">▣</div>
        <div>
          <h1>${PRODUCT_NAME}</h1>
          <p>${PRODUCT_TAGLINE} · Live</p>
        </div>
      </div>
      ${day
        ? [
          hudCard('Day', `${pad(day.day)}/${day.maxDays}`, 'DAY', ''),
          hudCard('Cash', money(live?.cash ?? day.cash), '₹', live ? `Revenue live ${money(live.revenue)}` : `Profit today ${money(day.metrics.profit)}`),
          hudCard('Trust', `${live?.trust ?? day.trust}%`, '♥', live ? `${live.visits} visits live` : `${signed(day.trustDelta)} today`, (live?.trust ?? day.trust) < day.trust ? 'bad' : 'good'),
          hudCard('Score', `${(live?.score ?? day.score).toLocaleString('en-IN')}`, '★', live ? 'updates at close' : `Last reward ${signed(day.lastReward)}`, day.lastReward < 0 ? 'bad' : 'good'),
          hudCard('Weather', day.weather, weatherIcon(day.weather), ''),
          hudCard('Event', day.eventLabel, '⚑', ''),
        ].join('')
        : [
          hudCard('Model', modelLabel(this.resolvedModel, this.modelPresets), 'AI', isHeuristicModel(this.resolvedModel) ? 'local baseline' : 'OpenRouter'),
          hudCard('Episode', `0/${this.maxDays}`, 'DAY', '1 step = 1 shop day'),
          hudCard('Replay', `${this.allReplaySummaries().length}`, 'SAVE', 'saved AI runs'),
          hudCard('Status', this.arenaJob?.status ?? 'Ready', 'RUN', this.arenaJob ? shortId(this.arenaJob.arenaId) : 'choose model'),
        ].join('')}
    `;
  }

  private renderLauncher() {
    const model = this.resolvedModel;
    const run = this.arenaJob ? primaryRun(this.arenaJob) : undefined;
    const activeReplayDay = this.run?.days[this.activeDayIndex];
    const replayLoaded = Boolean(activeReplayDay && !this.arenaJob);
    const displayModel = activeReplayDay?.model ?? run?.model ?? model;
    const completedDays = this.run?.days.length ?? run?.decisions.length ?? 0;
    const displayMaxDays = activeReplayDay?.maxDays ?? this.arenaJob?.maxDays ?? this.maxDays;
    const statusLabel = this.arenaJob ? this.arenaJob.status : replayLoaded ? 'replay loaded' : 'ready';
    const latestLatency = latestDecisionLatency(run);
    const selectedBenchmarkReplay = this.completedReplayForModel(model);
    const replayShortcuts = this.featuredReplaySummaries();
    this.requireElement('arena-launcher').innerHTML = `
      <div class="arena-launcher-main">
        <div class="arena-operator-summary">
          <div class="arena-panel-title">AI Operator <span>${this.arenaJob ? `job ${shortId(this.arenaJob.arenaId)}` : replayLoaded ? `replay ${shortId(this.run?.runId ?? '')}` : 'ready'}</span></div>
          <div class="arena-operator-row">
            <div class="arena-selected-model">
              <span>${replayLoaded ? 'Loaded Replay' : 'Selected AI'}</span>
              <strong>${escapeHtml(modelLabel(displayModel, this.modelPresets))}</strong>
              <small>${escapeHtml(displayModel)}</small>
            </div>
            <div class="arena-run-spec">
              <span>${replayLoaded ? 'Saved replay' : this.profile === 'max' ? 'Max capability' : 'Fast live'}</span>
              <strong>${replayLoaded ? `${completedDays}/${displayMaxDays}` : `${this.maxDays} day${this.maxDays === 1 ? '' : 's'}`}</strong>
              <small>${replayLoaded ? `run ${shortId(this.run?.runId ?? '')}` : isHeuristicModel(model) ? 'local baseline' : 'OpenRouter run'}</small>
            </div>
            <div class="arena-operator-actions">
              <button data-arena-action="open-model-picker" type="button">Choose AI Model</button>
              ${selectedBenchmarkReplay ? `
                <button
                  class="arena-replay-run"
                  data-arena-action="replay-run"
                  data-run-id="${escapeHtml(selectedBenchmarkReplay.runId)}"
                  type="button"
                  ${this.playing ? 'disabled' : ''}
                >
                  Replay 30-day Run
                </button>
              ` : ''}
              <button class="arena-start-run" data-arena-action="start-live" type="button" ${this.playing ? 'disabled' : ''}>
                ${replayLoaded ? 'Start New Live Run' : 'Start Live Run'}
              </button>
            </div>
          </div>
        </div>
        <aside class="arena-live-card ${this.launcherError ? 'error' : ''}">
          <span>${statusLabel}</span>
          <strong>${escapeHtml(modelLabel(displayModel, this.modelPresets))}</strong>
          <p>${escapeHtml(this.launcherMessage)}</p>
          <div class="arena-live-progress">
            <span>${completedDays}/${displayMaxDays} days</span>
            <span>${replayLoaded ? `day ${activeReplayDay?.day ?? 1} selected` : run?.status ?? 'not started'}</span>
            ${latestLatency ? `<span>${Math.round(latestLatency / 1000)}s latency</span>` : ''}
          </div>
        </aside>
      </div>
      ${replayShortcuts.length > 0 ? `
        <div class="arena-replay-library">
          <div class="arena-library-title">
            Saved replay shortcuts
            ${this.recentReplays.length > 0 ? '<button data-arena-action="clear-replays" type="button">Clear local</button>' : ''}
          </div>
          <div class="arena-library-list">
            ${replayShortcuts.map((replay) => `
              <button class="${this.run?.runId === replay.runId ? 'active' : ''}" data-arena-action="replay-run" data-run-id="${escapeHtml(replay.runId)}" type="button">
                <strong>${escapeHtml(modelLabel(replay.model, this.modelPresets))}</strong>
                <span>${replay.daysCompleted} days · score ${signed(replay.score)} · ${shortId(replay.runId)}</span>
              </button>
            `).join('')}
          </div>
        </div>
      ` : ''}
    `;
  }

  private renderModelPicker() {
    const modal = this.requireElement('arena-model-modal');
    modal.hidden = !this.modelPickerOpen;
    if (!this.modelPickerOpen) return;

    const model = this.resolvedModel;
    const selectedBenchmarkReplay = this.completedReplayForModel(model);
    modal.innerHTML = `
      <div class="arena-model-backdrop" data-arena-action="close-model-picker"></div>
      <div class="arena-model-dialog" role="dialog" aria-modal="true" aria-label="Choose AI model">
        <div class="arena-model-dialog-head">
          <div>
            <span>AI Operator Setup</span>
            <strong>Choose model and run profile</strong>
          </div>
          <button data-arena-action="close-model-picker" type="button">Close</button>
        </div>
        <div class="arena-model-grid">
          ${this.rankedModelPresets().map((preset) => {
            const benchmarkReplay = this.completedReplayForModel(preset.id);
            return `
              <button
                class="arena-model-chip ${model === preset.id ? 'active' : ''} ${benchmarkReplay ? 'has-replay' : ''}"
                data-arena-action="select-model"
                data-model="${escapeHtml(preset.id)}"
                type="button"
              >
                <strong>${escapeHtml(preset.label)}</strong>
                <span>${escapeHtml(compactSentence(preset.note, 92))}</span>
                ${benchmarkReplay ? `<em>30-day replay ready · score ${signed(benchmarkReplay.score)}</em>` : ''}
              </button>
            `;
          }).join('')}
          <button
            class="arena-model-chip ${this.selectedModel === 'custom' ? 'active' : ''}"
            data-arena-action="select-model"
            data-model="custom"
            type="button"
          >
            <strong>Custom model</strong>
            <span>Paste any exact OpenRouter model id below.</span>
          </button>
        </div>
        <div class="arena-custom-row">
          <label>
            Custom id
            <input id="arena-custom-model" value="${escapeHtml(this.customModel)}" placeholder="provider/model-id" />
          </label>
          <label>
            Days
            <input id="arena-max-days" type="number" min="1" max="30" value="${this.maxDays}" />
          </label>
          <div class="arena-profile-toggle" aria-label="Run profile">
            <button class="${this.profile === 'fast' ? 'active' : ''}" data-arena-action="profile" data-profile="fast" type="button">
              <strong>Fast live</strong>
              <span>quick replay settings</span>
            </button>
            <button class="${this.profile === 'max' ? 'active' : ''}" data-arena-action="profile" data-profile="max" type="button">
              <strong>Max capability</strong>
              <span>deeper reasoning run</span>
            </button>
          </div>
          ${selectedBenchmarkReplay ? `
            <button
              class="arena-model-replay-cta"
              data-arena-action="replay-run"
              data-run-id="${escapeHtml(selectedBenchmarkReplay.runId)}"
              type="button"
            >
              <strong>Replay 30-day Run</strong>
              <span>Score ${signed(selectedBenchmarkReplay.score)} · ${selectedBenchmarkReplay.daysCompleted} days</span>
            </button>
          ` : ''}
          <button class="arena-start-run" data-arena-action="start-live" type="button" ${this.playing ? 'disabled' : ''}>
            <strong>Start Live Run</strong>
            <span>calls selected AI now</span>
          </button>
        </div>
        <div class="arena-model-world-strip">
          <strong>Fixed arena world</strong>
          <span>Nehru Colony School Road · 700m catchment · 2 societies · 900 students · 2,500 road passers/day</span>
        </div>
        <div class="arena-model-dialog-note">
          <strong>${escapeHtml(modelLabel(model, this.modelPresets))}</strong>
          <span>${escapeHtml(this.profile === 'max'
            ? 'Max capability asks for stricter JSON, model-aware reasoning, and a longer timeout.'
            : 'Fast live is tuned for watchability with compact observations and shorter response settings.')}</span>
        </div>
      </div>
    `;
  }

  private renderDashboard(day?: ArenaReplayDay) {
    if (!day) {
      this.requireElement('arena-dashboard').innerHTML = `
        <div class="arena-panel arena-setup-panel">
          <div class="arena-panel-title">How This Run Works <span>OpenEnv-compatible backend</span></div>
          <div class="arena-setup-grid">
            <div><strong>Episode</strong><span>One complete ${this.maxDays}-day kirana game.</span></div>
            <div><strong>Step</strong><span>One model action JSON before one shop day.</span></div>
            <div><strong>Reward</strong><span>The backend day score after customers actually visit.</span></div>
            <div><strong>Replay</strong><span>Saved AI decisions plus day logs rebuild the animation.</span></div>
          </div>
          ${neighborhoodStrip()}
        </div>
      `;
      return;
    }

    const live = this.liveMetricsFor(day);
    const resultMetrics = {
      visits: live?.visits ?? day.metrics.visits,
      soldUnits: live?.soldUnits ?? day.metrics.soldUnits,
      missedUnits: live?.missedUnits ?? day.metrics.missedUnits,
      revenue: live?.revenue ?? day.metrics.revenue,
      khata: live?.khata ?? day.metrics.khata,
    };

    this.requireElement('arena-dashboard').innerHTML = `
      <div class="arena-panel arena-actions">
        <div class="arena-panel-title">AI Actions <span>today's plan</span></div>
        <div class="arena-action-cards">
          ${day.actionCards.map((card, index) => `
            <article class="arena-action-card ${card.impact}">
              <div class="arena-action-number">${index + 1}</div>
              <div class="arena-action-main">
                <img src="${actionIcon(card.id)}" alt="" />
                <h3>${escapeHtml(card.title)}</h3>
              </div>
              <p>${escapeHtml(card.detail)}</p>
              <div class="arena-action-meta">
                <span>Cost ${money(card.cost)}</span>
                <strong>${card.impact}</strong>
              </div>
            </article>
          `).join('')}
        </div>
      </div>
      <div class="arena-panel arena-thoughts">
        <div class="arena-panel-title">AI Thought Stream <span>${escapeHtml(day.model)}</span></div>
        <div class="arena-thought-list">
          ${day.thoughts.map((thought) => `
            <div class="arena-thought ${thought.tone}">
              <span>${thought.label}</span>
              <p>${escapeHtml(thought.text)}</p>
            </div>
          `).join('')}
        </div>
      </div>
      <div class="arena-panel arena-results">
        <div class="arena-panel-title">Today's Result <span>actual backend output</span></div>
        <div class="arena-result-grid">
          ${metricCard('Visits', resultMetrics.visits.toString(), 'VIS')}
          ${metricCard('Sold Units', resultMetrics.soldUnits.toString(), 'SLD')}
          ${metricCard('Revenue', money(resultMetrics.revenue), '₹')}
          ${metricCard('Missed Units', resultMetrics.missedUnits.toString(), 'MIS', resultMetrics.missedUnits > 0 ? 'bad' : 'good')}
          ${metricCard('Khata', money(resultMetrics.khata), 'KHA', resultMetrics.khata > 0 ? 'warn' : 'good')}
          ${metricCard('Mkt ROI', `${day.metrics.marketingRoi.toFixed(1)}x`, 'ROI')}
        </div>
      </div>
      <div class="arena-panel arena-rewards">
        <div class="arena-panel-title">Reward Breakdown <span>total ${signed(day.rewards.total)}</span></div>
        <div class="arena-reward-list">
          ${rewardRow('Service', day.rewards.service)}
          ${rewardRow('Inventory', day.rewards.inventory)}
          ${rewardRow('Money', day.rewards.money)}
          ${rewardRow('Relationships', day.rewards.relationships)}
          ${rewardRow('Marketing', day.rewards.marketing)}
          ${rewardRow('Operations', day.rewards.operations)}
          ${rewardRow('Penalties', day.rewards.penalties)}
        </div>
      </div>
    `;
  }

  private renderTimeline() {
    if (!this.run || this.run.days.length === 0) {
      this.requireElement('arena-timeline').innerHTML = `
        <div class="arena-timeline-title">Day Timeline</div>
        <div class="arena-timeline-empty">Completed days will appear here as the AI plays.</div>
      `;
      return;
    }

    this.requireElement('arena-timeline').innerHTML = `
      <div class="arena-timeline-title">Day Timeline</div>
      <div class="arena-timeline-days">
        ${this.run.days.map((day, index) => `
          <button
            class="${index === this.activeDayIndex ? 'active' : ''} ${dayTone(day)}"
            data-arena-action="timeline"
            data-day-index="${index}"
            type="button"
          >${pad(day.day)}</button>
        `).join('')}
      </div>
    `;
  }

  private renderControls() {
    const day = this.run?.days[this.activeDayIndex];
    const dayPlayed = day ? this.autoPlayedDays.has(day.day) : false;
    const hasNextDay = Boolean(this.run && this.activeDayIndex + 1 < this.run.days.length);
    const waitingForLiveDay = !day && (this.arenaJob?.status === 'queued' || this.arenaJob?.status === 'running');
    const primaryAction = day ? 'simulate' : 'start-live';
    const primaryDisabled = day ? this.playing : this.playing || waitingForLiveDay;
    const primaryTitle = day
      ? `${dayPlayed ? 'Replay' : 'Play'} Day ${pad(day.day)}`
      : waitingForLiveDay
        ? 'AI Thinking'
        : 'Start Live Run';
    const primarySubtitle = day
      ? 'watch saved backend replay'
      : waitingForLiveDay
        ? 'waiting for first completed day'
        : 'use selected model below';
    this.requireElement('arena-controls').innerHTML = `
      <button class="arena-primary" data-arena-action="${primaryAction}" type="button" ${primaryDisabled ? 'disabled' : ''}>
        ▶ ${primaryTitle}
        <span>${primarySubtitle}</span>
      </button>
      <div class="arena-speed-group">
        ${(['manual', 'auto'] as ArenaPlaybackMode[]).map((mode) => `
          <button class="${this.playbackMode === mode ? 'active' : ''}" data-arena-action="playback-mode" data-mode="${mode}" type="button">${mode === 'manual' ? 'Manual' : 'Auto'}</button>
        `).join('')}
      </div>
      <div class="arena-speed-group">
        ${[1, 5, 20].map((speed) => `
          <button class="${this.speed === speed ? 'active' : ''}" data-arena-action="speed" data-speed="${speed}" type="button">${speed}x</button>
        `).join('')}
      </div>
      <button data-arena-action="next-day" type="button" ${!dayPlayed || !hasNextDay || this.playing ? 'disabled' : ''}>Next Day</button>
      <button data-arena-action="pause" type="button" ${!this.playing ? 'disabled' : ''}>${this.paused ? 'Resume' : 'Pause'}</button>
      <button data-arena-action="replay" type="button" ${!day ? 'disabled' : ''}>Replay</button>
      <button class="${this.reportOpen ? 'active' : ''}" data-arena-action="report" type="button" ${!day ? 'disabled' : ''}>View Report</button>
    `;
  }

  private renderReport(day?: ArenaReplayDay) {
    const report = this.requireElement('arena-report');
    report.hidden = !this.reportOpen || !day;
    if (!this.reportOpen || !day) return;
    report.innerHTML = `
      <div class="arena-report-head">
        <div>
          <span>Day ${pad(day.day)} Report</span>
          <strong>${day.weather} · ${escapeHtml(day.eventLabel)}</strong>
        </div>
        <button data-arena-action="report" type="button">Close</button>
      </div>
      <div class="arena-report-grid">
        <section>
          <h3>Inventory Movement</h3>
          <table>
            <thead><tr><th>Item</th><th>Open</th><th>Sold</th><th>Missed</th><th>Close</th></tr></thead>
            <tbody>
              ${day.inventory.map((item) => `
                <tr>
                  <td>${escapeHtml(item.name)}</td>
                  <td>${item.openingShelf}</td>
                  <td>${item.sold}</td>
                  <td class="${item.missed > 0 ? 'bad' : ''}">${item.missed}</td>
                  <td>${item.closing}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </section>
        <section>
          <h3>Customer Visits</h3>
          <table>
            <thead><tr><th>Customer</th><th>Asked</th><th>Outcome</th><th>Payment</th></tr></thead>
            <tbody>
              ${day.visits.slice(0, 10).map((visit) => `
                <tr>
                  <td>${escapeHtml(visit.customerName)}</td>
                  <td>${escapeHtml(visit.requested.map((line) => `${line.quantity} ${line.productId}`).join(', '))}</td>
                  <td class="${visit.outcome !== 'fulfilled' ? 'bad' : ''}">${visit.outcome}</td>
                  <td>${visit.paymentMode === 'khata' ? `Khata ${money(visit.khataAmount)}` : money(visit.amountPaid)}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </section>
      </div>
    `;
  }

  private setLoading(message: string, isError = false, showStartActions = false) {
    const loading = this.requireElement('arena-loading');
    loading.hidden = false;
    loading.classList.toggle('error', isError);
    loading.innerHTML = `
      <div class="arena-loader-title">${isError ? 'Arena needs attention' : PRODUCT_NAME}</div>
      <div class="arena-loader-subtitle">${escapeHtml(message)}</div>
      ${showStartActions ? `
        <div class="arena-loader-actions">
          <button class="arena-loader-primary" data-arena-action="open-model-picker" type="button">Start Live Replay</button>
          <button data-arena-action="start-live" type="button">Quick Heuristic Run</button>
        </div>
      ` : ''}
    `;
  }

  private clearLoading() {
    this.requireElement('arena-loading').hidden = true;
  }

  private stopPolling() {
    if (this.pollTimer) window.clearTimeout(this.pollTimer);
    this.pollTimer = undefined;
  }

  private get resolvedModel() {
    return this.selectedModel === 'custom' ? this.customModel.trim() : this.selectedModel;
  }

  private get activeDay() {
    if (!this.run) throw new Error('Arena replay not loaded');
    return this.run.days[this.activeDayIndex];
  }

  private requireElement(id: string) {
    const element = this.root.querySelector<HTMLElement>(`#${id}`);
    if (!element) throw new Error(`Missing arena element: ${id}`);
    return element;
  }
}

function primaryRun(job: ArenaJobResponse): ArenaRunSummary | undefined {
  return job.runs[0];
}

function latestDecisionLatency(run: ArenaRunSummary | undefined) {
  return run?.decisions.at(-1)?.latencyMs ?? 0;
}

function neighborhoodBrief(variant: 'intro' | 'model') {
  const profile = DEFAULT_NEIGHBORHOOD_PROFILE;
  const school = profile.nearbyPlaces.find((place) => place.type === 'school');
  const societies = profile.nearbyPlaces.filter((place) => place.type === 'residential_society');
  const households = societies.reduce((sum, place) => sum + (place.households ?? 0), 0);
  const className = variant === 'intro' ? 'arena-neighborhood-brief intro' : 'arena-neighborhood-brief';

  return `
    <section class="${className}" aria-label="Fixed neighborhood context">
      <div class="arena-neighborhood-head">
        <span>Fixed Arena World</span>
        <strong>${escapeHtml(profile.name)}</strong>
        <p>${escapeHtml(profile.shopLocation.footfallProfile)}</p>
      </div>
      <div class="arena-neighborhood-facts">
        <div><span>Catchment</span><strong>${profile.shopLocation.catchmentRadiusMeters}m</strong></div>
        <div><span>Societies</span><strong>${societies.length} · ${households} homes</strong></div>
        <div><span>School</span><strong>${school?.population ?? 0} students</strong></div>
        <div><span>Road Flow</span><strong>${profile.commuteFlow.dailyPassersby.toLocaleString('en-IN')}/day</strong></div>
      </div>
      <div class="arena-neighborhood-places">
        ${profile.nearbyPlaces.slice(0, 4).map((place) => `
          <article>
            <span>${escapeHtml(placeTypeLabel(place.type))} · ${place.distanceMeters}m</span>
            <strong>${escapeHtml(place.name)}</strong>
            <p>${escapeHtml(place.demandSignals[0] ?? '')}</p>
          </article>
        `).join('')}
      </div>
      <div class="arena-neighborhood-signals">
        ${profile.aiVisibleSignals.slice(0, variant === 'intro' ? 5 : 4).map((signal) => `
          <span>${escapeHtml(signal)}</span>
        `).join('')}
      </div>
    </section>
  `;
}

function neighborhoodStrip() {
  const profile = DEFAULT_NEIGHBORHOOD_PROFILE;
  const school = profile.nearbyPlaces.find((place) => place.type === 'school');
  return `
    <div class="arena-neighborhood-strip">
      <div>
        <span>Fixed test world</span>
        <strong>${escapeHtml(profile.name)}</strong>
      </div>
      <div>
        <span>Nearby school</span>
        <strong>${school?.population ?? 0} students</strong>
      </div>
      <div>
        <span>Commute road</span>
        <strong>${profile.commuteFlow.dailyPassersby.toLocaleString('en-IN')} passersby/day</strong>
      </div>
      <div>
        <span>AI receives</span>
        <strong>societies · school · road · segments</strong>
      </div>
    </div>
  `;
}

function placeTypeLabel(type: string) {
  return type.replace(/_/g, ' ');
}

async function requestJson<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(apiPath(path), {
    ...init,
    credentials: 'same-origin',
    headers: {
      'Content-Type': 'application/json',
      ...(init.headers ?? {}),
    },
  });
  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    throw new Error(parseErrorMessage(detail) || `Request failed with ${response.status}`);
  }
  return response.json() as Promise<T>;
}

function parseErrorMessage(detail: string) {
  if (!detail) return '';
  try {
    const parsed = JSON.parse(detail) as { error?: string };
    return parsed.error ?? detail;
  } catch {
    return detail;
  }
}

function hudCard(label: string, value: string, icon: string, subtext: string, tone = '') {
  return `
    <article class="arena-hud-card ${tone}">
      <div class="arena-hud-icon">${escapeHtml(icon)}</div>
      <div>
        <span>${escapeHtml(label)}</span>
        <strong>${escapeHtml(value)}</strong>
        ${subtext ? `<small>${escapeHtml(subtext)}</small>` : ''}
      </div>
    </article>
  `;
}

function metricCard(label: string, value: string, icon: string, tone = '') {
  return `
    <div class="arena-metric ${tone}">
      <span>${escapeHtml(icon)} ${escapeHtml(label)}</span>
      <strong>${escapeHtml(value)}</strong>
    </div>
  `;
}

function rewardRow(label: string, value: number) {
  return `
    <div class="arena-reward-row ${value < 0 ? 'bad' : value > 0 ? 'good' : ''}">
      <span>${escapeHtml(label)}</span>
      <strong>${signed(value)}</strong>
    </div>
  `;
}

function actionIcon(id: string) {
  if (id === 'marketing') return effectCustomersUrl;
  if (id === 'discount') return productChipsUrl;
  if (id === 'khata') return effectKhataUrl;
  if (id === 'waste') return effectWarningUrl;
  return productMilkUrl;
}

function dayTone(day: ArenaReplayDay) {
  if (day.lastReward < 0) return 'bad';
  if (day.lastReward <= 6) return 'average';
  return 'good';
}

function openingLiveMetrics(day: ArenaReplayDay): ArenaLiveMetrics {
  const paidToday = day.visits.reduce((total, visit) => total + visit.amountPaid, 0);
  return {
    day: day.day,
    cash: Math.round(day.cash - paidToday),
    trust: Math.round(day.trust - day.trustDelta),
    score: day.score - day.lastReward,
    visits: 0,
    soldUnits: 0,
    missedUnits: 0,
    revenue: 0,
    khata: 0,
  };
}

function finalLiveMetrics(day: ArenaReplayDay): ArenaLiveMetrics {
  return {
    day: day.day,
    cash: day.cash,
    trust: day.trust,
    score: day.score,
    visits: day.metrics.visits,
    soldUnits: day.metrics.soldUnits,
    missedUnits: day.metrics.missedUnits,
    revenue: day.metrics.revenue,
    khata: day.metrics.khata,
  };
}

function weatherIcon(weather: string) {
  if (/rain/i.test(weather)) return 'RAIN';
  if (/heat/i.test(weather)) return 'HEAT';
  if (/hot/i.test(weather)) return 'HOT';
  return 'WX';
}

function modelLabel(model: string, presets: ArenaModelPreset[]) {
  if (model === 'heuristic-v2' || model === 'heuristic-v1') {
    return presets.find((preset) => preset.id === 'heuristic-v2')?.label ?? 'Built-in Heuristic';
  }
  return presets.find((preset) => preset.id === model)?.label ?? model;
}

function mergeModelPresets(
  defaults: ArenaModelPreset[],
  presets: ArenaModelPreset[],
  available: ArenaModelsResponse['available']
): ArenaModelPreset[] {
  const byId = new Map<string, ArenaModelPreset>();
  for (const preset of [...defaults, ...presets]) byId.set(preset.id, preset);
  for (const model of available.filter(isArenaTextModelHint).slice(0, 10)) {
    if (!model.id || byId.has(model.id)) continue;
    byId.set(model.id, {
      id: model.id,
      label: model.name ?? model.id,
      note: 'Live OpenRouter hint. Exact id will be passed through.',
    });
  }
  return Array.from(byId.values());
}

function isArenaTextModelHint(model: ArenaModelsResponse['available'][number]) {
  const haystack = `${model.id} ${model.name ?? ''}`.toLowerCase();
  return !/\b(image|banana|audio|video|music|voice|tts|sora|veo|imagen)\b/.test(haystack);
}

function isHeuristicModel(model: string) {
  return model === 'heuristic-v2' || model === 'heuristic-v1';
}

function loadRecentReplays(): RecentArenaReplay[] {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(RECENT_REPLAYS_KEY) ?? '[]') as RecentArenaReplay[];
    return parsed
      .filter((item) => item.runId && item.model)
      .slice(0, 6);
  } catch {
    return [];
  }
}

function saveRecentReplays(replays: RecentArenaReplay[]) {
  try {
    window.localStorage.setItem(RECENT_REPLAYS_KEY, JSON.stringify(replays.slice(0, 6)));
  } catch {
    // Non-critical: replay truth is in SQLite; localStorage is only a shortcut list.
  }
}

function money(value: number) {
  return `₹${Math.round(value).toLocaleString('en-IN')}`;
}

function signed(value: number) {
  return `${value >= 0 ? '+' : ''}${Math.round(value)}`;
}

function pad(value: number) {
  return value.toString().padStart(2, '0');
}

function shortId(value: string) {
  return value.slice(0, 8);
}

function compactSentence(value: string, maxLength: number) {
  const normalized = value.replace(/\s+/g, ' ').trim();
  return normalized.length <= maxLength ? normalized : `${normalized.slice(0, maxLength - 1)}…`;
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function shouldShowIntro() {
  try {
    if (new URLSearchParams(window.location.search).get('intro') === '1') return true;
    return window.localStorage.getItem('shree-shyam-arena-intro-seen') !== '1';
  } catch {
    return true;
  }
}

function markIntroSeen() {
  try {
    window.localStorage.setItem('shree-shyam-arena-intro-seen', '1');
  } catch {
    // Non-critical: private browsing can block storage.
  }
}

function escapeHtml(value: string) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}
