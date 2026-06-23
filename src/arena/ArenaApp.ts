import { adaptAiReplay } from './arena-adapter';
import { ArenaStage } from './ArenaStage';
import type {
  AiReplayResponse,
  ArenaJobResponse,
  ArenaModelPreset,
  ArenaModelsResponse,
  ArenaReplayDay,
  ArenaReplayRun,
  ArenaRunSummary,
} from './arena-types';

import effectCustomersUrl from '../assets/arena/effect-customers.png';
import effectKhataUrl from '../assets/arena/effect-khata.png';
import effectWarningUrl from '../assets/arena/effect-warning.png';
import productChipsUrl from '../assets/arena/product-chips.png';
import productMilkUrl from '../assets/arena/product-milk.png';

type ArenaProfile = 'fast' | 'max';

interface RecentArenaReplay {
  runId: string;
  model: string;
  daysCompleted: number;
  score: number;
  savedAt: string;
}

const RECENT_REPLAYS_KEY = 'shree-shyam-arena-recent-replays';
const POLL_INTERVAL_MS = 3500;
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
    note: 'Stronger DeepSeek candidate for longer runs.',
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
  private selectedModel = 'heuristic-v2';
  private customModel = '';
  private profile: ArenaProfile = 'fast';
  private maxDays = 30;
  private modelPresets: ArenaModelPreset[] = DEFAULT_MODEL_PRESETS;
  private recentReplays: RecentArenaReplay[] = loadRecentReplays();
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
    this.stage = new ArenaStage(this.requireElement('arena-stage'));
    this.stage.mount(undefined);
    this.setLoading('Choose a model above to start a live AI arena run.');
    this.renderIdle();
    void this.loadModelOptions();
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

  private renderShell() {
    this.root.innerHTML = `
      <main class="arena-root" aria-label="Shree Shyam Bhandar AI Arena Replay">
        <section class="arena-hud" id="arena-hud"></section>
        <section class="arena-launcher" id="arena-launcher"></section>
        <section class="arena-stage-shell">
          <div class="arena-stage-frame" id="arena-stage"></div>
          <div class="arena-stage-overlay" id="arena-loading">
            <div class="arena-loader-title">Preparing AI Arena</div>
            <div class="arena-loader-subtitle">Choose a model to begin.</div>
          </div>
        </section>
        <section class="arena-dashboard" id="arena-dashboard"></section>
        <section class="arena-footer">
          <div class="arena-timeline" id="arena-timeline"></div>
          <div class="arena-controls" id="arena-controls"></div>
        </section>
        <section class="arena-intro" id="arena-intro" hidden>
          <div class="arena-intro-card">
            <div class="arena-intro-eyebrow">AI Arena Replay</div>
            <h2>Can an AI run a kirana for 30 days?</h2>
            <p>
              Shree Shyam Bhandar turns dukaandari into a visible AI test:
              the model reads inventory, weather, customers, trust, khata, and marketing,
              then submits one JSON plan per day.
            </p>
            <div class="arena-intro-grid">
              <div><strong>1. Pick a model</strong><span>Use a local baseline or an OpenRouter model.</span></div>
              <div><strong>2. Watch it decide</strong><span>Every action JSON is validated and saved.</span></div>
              <div><strong>3. Replay the proof</strong><span>Customers, rewards, misses, and trust changes animate from real backend results.</span></div>
            </div>
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
      if (action === 'replay-run') void this.loadStoredReplay(target.dataset.runId ?? '');
      if (action === 'clear-replays') this.clearRecentReplays();
      if (action === 'simulate') void this.playActiveDay();
      if (action === 'pause') this.togglePause();
      if (action === 'replay') void this.replayDay();
      if (action === 'report') this.toggleReport();
      if (action === 'speed') this.setSpeed(Number(target.dataset.speed ?? 5));
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
    this.setLoading('Choose a model above to start a live AI arena run.');
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
    this.launcherError = false;
    this.launcherMessage = isHeuristicModel(this.resolvedModel)
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
      this.launcherMessage = `Day ${this.run?.days.length ?? 0} completed by ${modelLabel(run.model, this.modelPresets)}. Animating backend result.`;
      this.renderLauncher();
      void this.playNextUnplayedDay();
    } else if (job.status === 'running') {
      const nextDay = Math.min((this.run?.days.length ?? 0) + 1, job.maxDays);
      this.setLoading(`${modelLabel(run.model, this.modelPresets)} is thinking through Day ${nextDay}...`);
    }
  }

  private async loadStoredReplay(runId: string) {
    if (!runId) return;
    this.stopPolling();
    this.stage?.stopReplay();
    this.playing = false;
    this.paused = false;
    this.autoPlayedDays.clear();
    this.setLoading(`Loading saved replay ${shortId(runId)}...`);

    try {
      const replay = await requestJson<AiReplayResponse>(`/api/ai-runs/${encodeURIComponent(runId)}`);
      this.applyReplayResponse(replay);
      if (!this.run || this.run.days.length === 0) throw new Error('Saved run has no completed days yet.');
      this.launcherError = false;
      this.launcherMessage = `Loaded saved replay ${shortId(runId)}. No model call needed.`;
      this.renderLauncher();
      this.clearLoading();
      void this.playNextUnplayedDay();
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
      daysCompleted: run.decisions.length,
      score: run.totalReward,
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
    this.autoPlayedDays.add(this.run.days[nextIndex].day);
    this.stage?.setDay(this.activeDay);
    this.renderAll();
    await this.playActiveDay(true);
  }

  private async playActiveDay(autoAdvance = false) {
    if (!this.run || this.playing || this.run.days.length === 0) return;
    this.playing = true;
    this.paused = false;
    this.stage?.setPaused(false);
    this.renderControls();
    await this.stage?.playDay(this.activeDay, this.speed);
    this.playing = false;
    this.renderControls();
    if (autoAdvance) window.setTimeout(() => void this.playNextUnplayedDay(), 450);
  }

  private async replayDay() {
    if (!this.run) return;
    this.stage?.stopReplay();
    this.playing = false;
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
    this.stage?.setDay(this.activeDay);
    this.reportOpen = false;
    this.renderAll();
  }

  private setSpeed(speed: number) {
    this.speed = speed;
    this.renderControls();
  }

  private toggleReport() {
    if (!this.run) return;
    this.reportOpen = !this.reportOpen;
    this.renderReport(this.activeDay);
    this.renderControls();
  }

  private renderHud(day?: ArenaReplayDay) {
    this.requireElement('arena-hud').innerHTML = `
      <div class="arena-brand">
        <div class="arena-brand-icon">▣</div>
        <div>
          <h1>Shree Shyam Bhandar</h1>
          <p>AI Arena Live</p>
        </div>
      </div>
      ${day
        ? [
          hudCard('Day', `${pad(day.day)}/${day.maxDays}`, 'DAY', ''),
          hudCard('Cash', money(day.cash), '₹', `Profit today ${money(day.metrics.profit)}`),
          hudCard('Trust', `${day.trust}%`, '♥', `${signed(day.trustDelta)} today`, day.trustDelta < 0 ? 'bad' : 'good'),
          hudCard('Score', `${day.score.toLocaleString('en-IN')}`, '★', `Last reward ${signed(day.lastReward)}`, day.lastReward < 0 ? 'bad' : 'good'),
          hudCard('Weather', day.weather, weatherIcon(day.weather), ''),
          hudCard('Event', day.eventLabel, '⚑', ''),
        ].join('')
        : [
          hudCard('Model', modelLabel(this.resolvedModel, this.modelPresets), 'AI', isHeuristicModel(this.resolvedModel) ? 'local baseline' : 'OpenRouter'),
          hudCard('Episode', `0/${this.maxDays}`, 'DAY', '1 step = 1 shop day'),
          hudCard('Replay', `${this.recentReplays.length}`, 'SAVE', 'saved local shortcuts'),
          hudCard('Status', this.arenaJob?.status ?? 'Ready', 'RUN', this.arenaJob ? shortId(this.arenaJob.arenaId) : 'choose model'),
        ].join('')}
    `;
  }

  private renderLauncher() {
    const model = this.resolvedModel;
    const run = this.arenaJob ? primaryRun(this.arenaJob) : undefined;
    const completedDays = this.run?.days.length ?? run?.decisions.length ?? 0;
    const latestLatency = latestDecisionLatency(run);
    this.requireElement('arena-launcher').innerHTML = `
      <div class="arena-launcher-main">
        <div class="arena-operator-summary">
          <div class="arena-panel-title">AI Operator <span>${this.arenaJob ? `job ${shortId(this.arenaJob.arenaId)}` : 'ready'}</span></div>
          <div class="arena-operator-row">
            <div class="arena-selected-model">
              <span>Selected AI</span>
              <strong>${escapeHtml(modelLabel(model, this.modelPresets))}</strong>
              <small>${escapeHtml(model)}</small>
            </div>
            <div class="arena-run-spec">
              <span>${this.profile === 'max' ? 'Max capability' : 'Fast live'}</span>
              <strong>${this.maxDays} day${this.maxDays === 1 ? '' : 's'}</strong>
              <small>${isHeuristicModel(model) ? 'local baseline' : 'OpenRouter run'}</small>
            </div>
            <div class="arena-operator-actions">
              <button data-arena-action="open-model-picker" type="button">Choose AI Model</button>
              <button class="arena-start-run" data-arena-action="start-live" type="button" ${this.playing ? 'disabled' : ''}>
                Start Live Run
              </button>
            </div>
          </div>
        </div>
        <aside class="arena-live-card ${this.launcherError ? 'error' : ''}">
          <span>${this.arenaJob ? this.arenaJob.status : 'ready'}</span>
          <strong>${escapeHtml(modelLabel(model, this.modelPresets))}</strong>
          <p>${escapeHtml(this.launcherMessage)}</p>
          <div class="arena-live-progress">
            <span>${completedDays}/${this.arenaJob?.maxDays ?? this.maxDays} days</span>
            <span>${run?.status ?? 'not started'}</span>
            ${latestLatency ? `<span>${Math.round(latestLatency / 1000)}s latency</span>` : ''}
          </div>
        </aside>
      </div>
      ${this.recentReplays.length > 0 ? `
        <div class="arena-replay-library">
          <div class="arena-library-title">Saved replay shortcuts <button data-arena-action="clear-replays" type="button">Clear</button></div>
          <div class="arena-library-list">
            ${this.recentReplays.map((replay) => `
              <button data-arena-action="replay-run" data-run-id="${escapeHtml(replay.runId)}" type="button">
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
          ${this.modelPresets.slice(0, 10).map((preset) => `
            <button
              class="arena-model-chip ${model === preset.id ? 'active' : ''}"
              data-arena-action="select-model"
              data-model="${escapeHtml(preset.id)}"
              type="button"
            >
              <strong>${escapeHtml(preset.label)}</strong>
              <span>${escapeHtml(compactSentence(preset.note, 92))}</span>
            </button>
          `).join('')}
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
            <button class="${this.profile === 'fast' ? 'active' : ''}" data-arena-action="profile" data-profile="fast" type="button">Fast live</button>
            <button class="${this.profile === 'max' ? 'active' : ''}" data-arena-action="profile" data-profile="max" type="button">Max capability</button>
          </div>
          <button class="arena-start-run" data-arena-action="start-live" type="button" ${this.playing ? 'disabled' : ''}>
            Start Live Run
          </button>
        </div>
        <div class="arena-model-dialog-note">
          <strong>${escapeHtml(modelLabel(model, this.modelPresets))}</strong>
          <span>${escapeHtml(this.profile === 'max'
            ? 'Max capability asks for stricter JSON, medium reasoning, and a longer timeout.'
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
        </div>
      `;
      return;
    }

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
          ${metricCard('Visits', day.metrics.visits.toString(), 'VIS')}
          ${metricCard('Sold Units', day.metrics.soldUnits.toString(), 'SLD')}
          ${metricCard('Revenue', money(day.metrics.revenue), '₹')}
          ${metricCard('Missed Units', day.metrics.missedUnits.toString(), 'MIS', day.metrics.missedUnits > 0 ? 'bad' : 'good')}
          ${metricCard('Khata', money(day.metrics.khata), 'KHA', day.metrics.khata > 0 ? 'warn' : 'good')}
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
    this.requireElement('arena-controls').innerHTML = `
      <button class="arena-primary" data-arena-action="simulate" type="button" ${!day || this.playing ? 'disabled' : ''}>
        ▶ ${day ? `Simulate Day ${pad(day.day)}` : 'Waiting for Day 1'}
        <span>${day ? 'watch what happened' : 'start or load a run'}</span>
      </button>
      <div class="arena-speed-group">
        ${[1, 5, 20].map((speed) => `
          <button class="${this.speed === speed ? 'active' : ''}" data-arena-action="speed" data-speed="${speed}" type="button">${speed}x</button>
        `).join('')}
      </div>
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

  private setLoading(message: string, isError = false) {
    const loading = this.requireElement('arena-loading');
    loading.hidden = false;
    loading.classList.toggle('error', isError);
    loading.innerHTML = `
      <div class="arena-loader-title">${isError ? 'Arena needs attention' : 'AI Arena'}</div>
      <div class="arena-loader-subtitle">${escapeHtml(message)}</div>
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

async function requestJson<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(path, {
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

function weatherIcon(weather: string) {
  if (/rain/i.test(weather)) return 'RAIN';
  if (/heat/i.test(weather)) return 'HEAT';
  if (/hot/i.test(weather)) return 'HOT';
  return 'WX';
}

function modelLabel(model: string, presets: ArenaModelPreset[]) {
  return presets.find((preset) => preset.id === model)?.label ?? model;
}

function mergeModelPresets(
  defaults: ArenaModelPreset[],
  presets: ArenaModelPreset[],
  available: ArenaModelsResponse['available']
): ArenaModelPreset[] {
  const byId = new Map<string, ArenaModelPreset>();
  for (const preset of [...defaults, ...presets]) byId.set(preset.id, preset);
  for (const model of available.slice(0, 10)) {
    if (!model.id || byId.has(model.id)) continue;
    byId.set(model.id, {
      id: model.id,
      label: model.name ?? model.id,
      note: 'Live OpenRouter hint. Exact id will be passed through.',
    });
  }
  return Array.from(byId.values());
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
