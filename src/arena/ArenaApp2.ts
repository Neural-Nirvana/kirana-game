import './arena2.css';
import './arena2-editorial.css';
import './provider-brand.css';
import { PRODUCT_NAME, PRODUCT_TAGLINE, SHOP_NAME, SHOP_LOCATION } from '../constants/brand';
import sidebarHeroUrl from '../assets/arena2/sidebar-hero.jpg';
import emptyStateUrl from '../assets/arena2/empty-state.jpg';
import { adaptAiReplay } from './arena-adapter';
import { filterOfficialBenchmarkRows } from './benchmark-roster';
import { initProviderLogoFallbacks, renderBenchmarkModelCell } from './provider-brand';
import { ArenaStage } from './ArenaStage';
import {
  actionIcon,
  AUTO_ADVANCE_DELAY_MS,
  clamp,
  compareByFinalScore,
  compactSentence,
  dayTone,
  DEFAULT_MODEL_PRESETS,
  escapeHtml,
  finalLiveMetrics,
  isHeuristicModel,
  loadRecentReplays,
  dedupeReplaySummariesByModel,
  mergeModelPresets,
  modelLabel,
  money,
  openingLiveMetrics,
  pad,
  requestJson,
  saveRecentReplays,
  shortId,
  signed,
  weatherIcon,
  type ArenaPlaybackMode,
} from './arena-shared';
import type {
  AiProviderResponseRecord,
  AiProviderResponsesResponse,
  AiReplayResponse,
  ArenaLiveMetrics,
  ArenaModelPreset,
  ArenaModelsResponse,
  ArenaReplayDay,
  ArenaReplayIndexResponse,
  ArenaReplayRun,
  ArenaReplaySummary,
  ArenaScoreboardResponse,
} from './arena-types';

type DetailTab = 'actions' | 'thoughts' | 'results' | 'rewards' | 'report' | 'audit';
type SidebarSection = 'replays' | 'scoreboard';

export class ArenaApp2 {
  private readonly root: HTMLElement;
  private stage?: ArenaStage;
  private run?: ArenaReplayRun;
  private activeDayIndex = 0;
  private speed = 5;
  private paused = false;
  private playing = false;
  private activeTab: DetailTab = 'actions';
  private sidebarSection: SidebarSection = 'replays';
  private playbackMode: ArenaPlaybackMode = 'manual';
  private liveMetrics?: ArenaLiveMetrics;
  private modelPresets: ArenaModelPreset[] = DEFAULT_MODEL_PRESETS;
  private recentReplays: ArenaReplaySummary[] = loadRecentReplays();
  private indexedReplays: ArenaReplaySummary[] = [];
  private scoreboardRows: ArenaScoreboardResponse['rows'] = [];
  private autoPlayedDays = new Set<number>();
  private statusMessage = 'Connecting to backend…';
  private statusError = false;
  private sidebarCollapsed = false;
  private backendConnected = false;
  private backendChecked = false;
  private introActive = true;
  private providerAuditByDay = new Map<number, AiProviderResponseRecord[]>();
  private providerAuditStatus: 'idle' | 'loading' | 'error' = 'idle';
  private providerAuditError = '';

  constructor(rootId: string) {
    const root = document.getElementById(rootId);
    if (!root) throw new Error(`Missing arena root: ${rootId}`);
    this.root = root;
  }

  async start() {
    this.renderShell();
    this.bindEvents();
    this.stage = new ArenaStage(this.requireElement('a2-stage'), (metrics) => this.updateLiveMetrics(metrics));
    this.stage.mount(undefined);
    this.renderAll();
    this.showIntroOverlay('loading');
    void this.bootstrap();
  }

  private async bootstrap() {
    await this.checkBackend();
    // Replay index is enough for the intro; scoreboard + OpenRouter model hints are heavy.
    await this.loadReplayIndex();

    const runId = new URLSearchParams(window.location.search).get('runId')?.trim();
    if (runId) {
      this.introActive = false;
      await this.loadStoredReplay(runId);
      void this.loadDeferredBootstrapData();
      return;
    }

    if (!this.backendConnected) {
      this.showIntroOverlay('error');
      return;
    }

    this.showIntroOverlay('ready');
    void this.loadDeferredBootstrapData();
  }

  private async loadDeferredBootstrapData() {
    await Promise.all([this.loadModelOptions(), this.loadScoreboard()]);
    if (this.introActive) this.showIntroOverlay('ready');
  }

  private async checkBackend() {
    try {
      await requestJson<{ ok: boolean }>('/api/health');
      this.backendChecked = true;
      this.backendConnected = true;
      this.statusError = false;
      this.statusMessage = 'Backend connected — indexing saved replays…';
      this.renderHud();
      this.renderSidebar();
    } catch {
      this.backendChecked = true;
      this.backendConnected = false;
      this.statusError = true;
      this.statusMessage = 'Backend offline — run `npm run dev` to start the API server on port 8787.';
      this.renderHud();
      this.renderSidebar();
    }
  }

  private async loadModelOptions() {
    try {
      const response = await requestJson<ArenaModelsResponse>('/api/arena/models');
      this.modelPresets = mergeModelPresets(DEFAULT_MODEL_PRESETS, response.presets, response.available);
    } catch {
      this.modelPresets = DEFAULT_MODEL_PRESETS;
    }
    this.renderSidebar();
  }

  private async loadReplayIndex() {
    try {
      const response = await requestJson<ArenaReplayIndexResponse>('/api/arena/replays?status=complete&limit=40');
      this.indexedReplays = filterOfficialBenchmarkRows(response.replays);
      if (this.backendConnected) {
        this.statusError = false;
        this.statusMessage = this.indexedReplays.length > 0
          ? `${this.featuredReplaySummaries().length} replay-ready models loaded.`
          : 'Backend connected — no completed replays yet.';
      }
      this.renderSidebar();
      this.renderHud();
    } catch {
      this.indexedReplays = [];
      if (this.backendConnected) {
        this.statusError = true;
        this.statusMessage = 'Backend connected, but saved replays could not be indexed.';
        this.renderSidebar();
        this.renderHud();
      }
    }
  }

  private async loadScoreboard() {
    try {
      const response = await requestJson<ArenaScoreboardResponse>('/api/arena/scoreboard?limit=12');
      this.scoreboardRows = response.rows;
      this.renderSidebar();
    } catch {
      this.scoreboardRows = [];
    }
  }

  private renderShell() {
    this.root.innerHTML = `
      <main class="a2-root a2-editorial" aria-label="${PRODUCT_NAME} Arena">
        <header class="a2-topbar" id="a2-topbar"></header>
        <div class="a2-body ${this.sidebarCollapsed ? 'sidebar-collapsed' : ''}">
          <aside class="a2-sidebar" id="a2-sidebar"></aside>
          <section class="a2-theater" id="a2-theater">
            <header class="a2-theater-head" id="a2-theater-head"></header>
            <div class="a2-screen-deck">
              <div class="a2-stage-cinema">
                <div class="a2-stage-frame">
                  <div class="a2-stage-glow" aria-hidden="true"></div>
                  <div class="a2-stage-vignette" aria-hidden="true"></div>
                  <div class="a2-stage" id="a2-stage"></div>
                  <div class="a2-stage-scanlines" aria-hidden="true"></div>
                  <div class="a2-stage-overlay" id="a2-overlay"></div>
                </div>
              </div>
              <div class="a2-theater-status" id="a2-theater-status"></div>
            </div>
            <div class="a2-transport-deck">
              <div class="a2-transport" id="a2-transport"></div>
              <div class="a2-timeline" id="a2-timeline"></div>
            </div>
          </section>
          <aside class="a2-detail" id="a2-detail"></aside>
        </div>
      </main>
    `;
  }

  private bindEvents() {
    this.root.addEventListener('click', (event) => {
      const target = event.target instanceof Element ? event.target.closest<HTMLElement>('[data-a2-action]') : null;
      if (!target) return;
      const action = target.dataset.a2Action;
      if (action === 'sidebar-section') this.setSidebarSection(target.dataset.section as SidebarSection);
      if (action === 'replay-run') void this.loadStoredReplay(target.dataset.runId ?? '');
      if (action === 'clear-replays') this.clearRecentReplays();
      if (action === 'simulate') void this.playActiveDay();
      if (action === 'pause') this.togglePause();
      if (action === 'replay') void this.replayDay();
      if (action === 'speed') this.setSpeed(Number(target.dataset.speed ?? 5));
      if (action === 'playback-mode') this.setPlaybackMode(target.dataset.mode === 'auto' ? 'auto' : 'manual');
      if (action === 'next-day') void this.playNextDayFromControls();
      if (action === 'prev-day') this.selectDay(this.activeDayIndex - 1);
      if (action === 'timeline') this.selectDay(Number(target.dataset.dayIndex ?? 0));
      if (action === 'tab') this.setTab(target.dataset.tab as DetailTab);
      if (action === 'toggle-sidebar') this.toggleSidebar();
      if (action === 'intro-browse-replays') this.dismissIntro('replays');
      if (action === 'intro-leaderboard') this.dismissIntro('scoreboard');
      if (action === 'retry-backend') {
        this.showIntroOverlay('loading');
        void this.bootstrap();
      }
    });

    window.addEventListener('keydown', (event) => {
      if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) return;
      if (event.code === 'Space') {
        event.preventDefault();
        if (this.playing) this.togglePause();
        else if (this.run?.days[this.activeDayIndex]) void this.playActiveDay();
      }
      if (event.code === 'ArrowRight') void this.playNextDayFromControls();
      if (event.code === 'ArrowLeft') this.selectDay(this.activeDayIndex - 1);
    });
  }

  private setSidebarSection(section: SidebarSection) {
    this.sidebarSection = section;
    this.renderSidebar();
  }

  private setTab(tab: DetailTab) {
    this.activeTab = tab;
    this.renderDetail(this.run?.days[this.activeDayIndex]);
  }

  private clearProviderAuditCache() {
    this.providerAuditByDay.clear();
    this.providerAuditStatus = 'idle';
    this.providerAuditError = '';
  }

  private async ensureProviderAuditLoaded(dayNumber: number) {
    if (!this.run || isHeuristicModel(this.run.days[0]?.model ?? '')) return;
    if (this.providerAuditByDay.has(dayNumber) || this.providerAuditStatus === 'loading') return;
    this.providerAuditStatus = 'loading';
    this.providerAuditError = '';
    this.renderDetail(this.run.days[this.activeDayIndex]);
    try {
      const response = await requestJson<AiProviderResponsesResponse>(
        `/api/ai-runs/${encodeURIComponent(this.run.runId)}/provider-responses?day=${dayNumber}`
      );
      this.providerAuditByDay.set(dayNumber, response.responses);
      this.providerAuditStatus = 'idle';
    } catch (error) {
      this.providerAuditStatus = 'error';
      this.providerAuditError = error instanceof Error ? error.message : String(error);
    }
    if (this.run?.days[this.activeDayIndex]?.day === dayNumber) {
      this.renderDetail(this.run.days[this.activeDayIndex]);
    }
  }

  private toggleSidebar() {
    this.sidebarCollapsed = !this.sidebarCollapsed;
    this.root.querySelector('.a2-body')?.classList.toggle('sidebar-collapsed', this.sidebarCollapsed);
    this.renderSidebar();
  }

  private async loadStoredReplay(runId: string) {
    if (!runId) return;
    this.introActive = false;
    this.stage?.stopReplay();
    this.playing = false;
    this.paused = false;
    this.autoPlayedDays.clear();
    this.setStageOverlay(`Loading replay ${shortId(runId)}…`);

    try {
      const replay = await requestJson<AiReplayResponse>(`/api/ai-runs/${encodeURIComponent(runId)}`);
      this.applyReplayResponse(replay);
      if (!this.run || this.run.days.length === 0) throw new Error('Saved run has no completed days yet.');
      this.statusError = false;
      this.statusMessage = `Loaded ${modelLabel(this.run.days[0].model, this.modelPresets)} — ${this.run.days.length} days ready. Press Play Day 01 to watch.`;
      this.sidebarSection = 'replays';
      this.clearStageOverlay();
      if (this.playbackMode === 'auto') void this.playNextUnplayedDay();
      else this.renderAll();
    } catch (error) {
      this.statusError = true;
      this.statusMessage = error instanceof Error ? error.message : String(error);
      this.setStageOverlay(this.statusMessage, true);
      this.renderSidebar();
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
      this.clearProviderAuditCache();
      this.stage?.setDay(this.run.days[0]);
    } else {
      this.activeDayIndex = clamp(this.activeDayIndex, 0, Math.max(0, this.run.days.length - 1));
    }
    if (this.run.days.length > 0) {
      this.clearStageOverlay();
      this.renderAll();
    }
  }

  private clearRecentReplays() {
    this.recentReplays = [];
    saveRecentReplays(this.recentReplays);
    this.renderSidebar();
  }

  private allReplaySummaries() {
    const byRunId = new Map<string, ArenaReplaySummary>();
    for (const replay of filterOfficialBenchmarkRows([...this.indexedReplays, ...this.recentReplays])) {
      const existing = byRunId.get(replay.runId);
      if (!existing || replay.daysCompleted > existing.daysCompleted) byRunId.set(replay.runId, replay);
    }
    return [...byRunId.values()].sort(compareByFinalScore);
  }

  private featuredReplaySummaries() {
    return dedupeReplaySummariesByModel(this.allReplaySummaries());
  }

  private renderAll() {
    this.renderTheaterChrome();
    this.renderHud(this.run?.days[this.activeDayIndex]);
    this.renderSidebar();
    this.renderTransport();
    this.renderTimeline();
    this.renderDetail(this.run?.days[this.activeDayIndex]);
  }

  private renderTheaterChrome() {
    const day = this.run?.days[this.activeDayIndex];
    const displayModel = day?.model ?? this.run?.days[0]?.model ?? 'Pick a replay';
    const episodeProgress = this.run
      ? Math.round(((this.activeDayIndex + 1) / this.run.days.length) * 100)
      : 0;

    this.root.querySelector('#a2-theater')?.classList.toggle('is-playing', this.playing);
    this.root.querySelector('#a2-theater')?.classList.toggle('is-paused', this.paused);
    this.root.querySelector('#a2-theater')?.classList.toggle('has-replay', Boolean(this.run));

    this.requireElement('a2-theater-head').innerHTML = `
      <div class="a2-marquee">
        <span class="a2-marquee-eyebrow">${PRODUCT_TAGLINE}</span>
        <strong>${SHOP_NAME}</strong>
        <p>${SHOP_LOCATION} · Live replay theatre</p>
      </div>
      <div class="a2-theater-meta">
        ${day ? `
          <div class="a2-meta-chip highlight">
            <span>Episode</span>
            <strong>Day ${pad(day.day)} / ${pad(day.maxDays)}</strong>
          </div>
          <div class="a2-meta-chip">
            <span>Weather</span>
            <strong>${weatherIcon(day.weather)} ${escapeHtml(day.weather)}</strong>
          </div>
          <div class="a2-meta-chip">
            <span>Event</span>
            <strong>${escapeHtml(compactSentence(day.eventLabel, 22))}</strong>
          </div>
        ` : `
          <div class="a2-meta-chip">
            <span>Model</span>
            <strong>${escapeHtml(this.run ? modelLabel(displayModel, this.modelPresets) : displayModel)}</strong>
          </div>
          <div class="a2-meta-chip">
            <span>Episode</span>
            <strong>${this.run ? `${this.run.days.length} / ${this.run.days[0]?.maxDays ?? this.run.days.length} days` : '—'}</strong>
          </div>
        `}
        ${this.playing ? '<div class="a2-live-badge"><em></em> Replaying</div>' : ''}
      </div>
    `;

    this.requireElement('a2-theater-status').innerHTML = day ? `
      <div class="a2-status-strip">
        <div class="a2-status-item">
          <span>Operator</span>
          <strong>${escapeHtml(modelLabel(day.model, this.modelPresets))}</strong>
        </div>
        <div class="a2-status-item">
          <span>Today reward</span>
          <strong class="${dayTone(day)}">${signed(day.lastReward)}</strong>
        </div>
        <div class="a2-status-item">
          <span>Trust</span>
          <strong>${day.trust}% <small>${signed(day.trustDelta)}</small></strong>
        </div>
        <div class="a2-status-item">
          <span>Cash</span>
          <strong>${money(day.cash)}</strong>
        </div>
        <div class="a2-status-progress">
          <span>Episode progress</span>
          <div class="a2-status-progress-track">
            <div class="a2-status-progress-fill" style="width:${episodeProgress}%"></div>
          </div>
          <small>${this.activeDayIndex + 1} of ${this.run?.days.length ?? 0} days viewed</small>
        </div>
      </div>
    ` : this.introActive ? `
      <div class="a2-status-strip idle">
        <div class="a2-status-item wide">
          <span>Welcome</span>
          <strong>Pick a saved replay from the sidebar to start watching.</strong>
        </div>
      </div>
    ` : `
      <div class="a2-status-strip idle">
        <div class="a2-status-item wide">
          <span>Stage</span>
          <strong>Pick a saved replay from the sidebar to animate the shop floor.</strong>
        </div>
      </div>
    `;
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
    this.renderTheaterChrome();
    this.renderTransport();
  }

  private selectDay(dayIndex: number) {
    if (!this.run) return;
    const nextIndex = clamp(dayIndex, 0, this.run.days.length - 1);
    if (nextIndex === this.activeDayIndex && !this.playing) return;
    this.stage?.stopReplay();
    this.activeDayIndex = nextIndex;
    this.playing = false;
    this.paused = false;
    this.liveMetrics = undefined;
    this.stage?.setDay(this.activeDay);
    this.renderAll();
  }

  private setSpeed(speed: number) {
    this.speed = speed;
    this.renderTransport();
  }

  private setPlaybackMode(mode: ArenaPlaybackMode) {
    this.playbackMode = mode;
    this.statusMessage = mode === 'auto'
      ? 'Auto mode advances to the next day after each replay.'
      : 'Manual mode — you control when each day plays.';
    this.renderTransport();
    this.renderSidebar();
    if (mode === 'auto') void this.playNextUnplayedDay();
  }

  private async playNextDayFromControls() {
    if (!this.run || this.playing) return;
    const nextIndex = this.activeDayIndex + 1;
    if (nextIndex >= this.run.days.length) return;
    this.selectDay(nextIndex);
    await this.playActiveDay();
  }

  private updateLiveMetrics(metrics: ArenaLiveMetrics) {
    if (!this.run || metrics.day !== this.activeDay.day) return;
    this.liveMetrics = metrics;
    this.renderHud(this.activeDay);
    if (this.activeTab === 'results') this.renderDetail(this.activeDay);
  }

  private renderHud(day?: ArenaReplayDay) {
    const live = this.liveMetricsFor(day);
    const displayModel = day?.model ?? this.run?.days[0]?.model;
    const backendLabel = this.backendConnected
      ? 'Backend connected'
      : this.backendChecked
        ? 'Backend offline'
        : 'Connecting…';
    const backendClass = this.backendConnected
      ? 'online'
      : this.backendChecked
        ? 'offline'
        : 'pending';

    this.requireElement('a2-topbar').innerHTML = `
      <div class="a2-brand">
        <button class="a2-sidebar-toggle" data-a2-action="toggle-sidebar" type="button" aria-label="Toggle sidebar">☰</button>
        <div>
          <h1>${PRODUCT_NAME}</h1>
          <p>${PRODUCT_TAGLINE} · <a href="/about" class="a2-v1-link">about</a> · <a href="/arena" class="a2-v1-link">v1</a></p>
        </div>
      </div>
      <div class="a2-metrics">
        ${day ? [
          metricPill('Day', `${pad(day.day)}/${day.maxDays}`),
          metricPill('Cash', money(live?.cash ?? day.cash), live ? `+${money(live.revenue)} live` : `profit ${money(day.metrics.profit)}`),
          metricPill('Trust', `${live?.trust ?? day.trust}%`, signed(day.trustDelta), (live?.trust ?? day.trust) < day.trust ? 'bad' : 'good'),
          metricPill('Score', (live?.score ?? day.score).toLocaleString('en-IN'), signed(day.lastReward), day.lastReward < 0 ? 'bad' : 'good'),
          metricPill('Weather', day.weather, weatherIcon(day.weather)),
          metricPill('Event', compactSentence(day.eventLabel, 18)),
        ].join('') : [
          metricPill('Replays', `${this.featuredReplaySummaries().length}`, 'models ready'),
          metricPill('Leaderboard', `${this.scoreboardRows.length}`, 'ranked'),
          metricPill('Status', this.run ? 'Replay loaded' : 'Pick a replay', this.run ? `${this.run.days.length} days` : 'from sidebar'),
        ].join('')}
      </div>
      <div class="a2-topbar-status">
        <span class="a2-backend-dot ${backendClass}"></span>
        <span class="a2-backend-label">${backendLabel}</span>
      </div>
      <div class="a2-model-badge">
        <span>${escapeHtml(displayModel ? modelLabel(displayModel, this.modelPresets) : 'Replay theatre')}</span>
      </div>
    `;
  }

  private renderSidebar() {
    const replays = this.featuredReplaySummaries();
    const totalReplayRuns = this.allReplaySummaries().length;

    this.requireElement('a2-sidebar').innerHTML = `
      <nav class="a2-sidebar-nav">
        ${sidebarNavBtn('replays', 'Replays', this.sidebarSection, replays.length)}
        ${sidebarNavBtn('scoreboard', 'Leaderboard', this.sidebarSection)}
      </nav>
      <div class="a2-sidebar-content">
        ${this.sidebarSection === 'replays' ? `
          <div class="a2-sidebar-hero">
            <img src="${sidebarHeroUrl}" alt="" />
            <div class="a2-sidebar-hero-copy">
              <strong>${SHOP_NAME}</strong>
              <span>${SHOP_LOCATION}</span>
            </div>
          </div>
          <div class="a2-panel">
            <div class="a2-panel-head">
              <h2>Saved Replays</h2>
              ${this.recentReplays.length > 0 ? '<button data-a2-action="clear-replays" type="button">Clear local</button>' : ''}
            </div>
            <p class="a2-hint">${totalReplayRuns > replays.length
              ? `Best run per model · ${totalReplayRuns} saved replays on record`
              : 'Best completed run per model — click to load'}</p>
            ${replays.length === 0 ? '<p class="a2-empty">No completed replays yet.</p>' : `
              <div class="a2-replay-list">
                ${replays.map((replay) => `
                  <button
                    class="a2-replay-item ${this.run?.runId === replay.runId ? 'active' : ''}"
                    data-a2-action="replay-run"
                    data-run-id="${escapeHtml(replay.runId)}"
                    type="button"
                  >
                    <div class="a2-replay-item-head">
                      <strong>${escapeHtml(modelLabel(replay.model, this.modelPresets))}</strong>
                      <span class="a2-score ${replay.score >= 0 ? 'good' : 'bad'}">${signed(replay.score)}</span>
                    </div>
                    <span>${replay.daysCompleted} days · trust ${replay.finalTrust ?? '—'}% · ${shortId(replay.runId)}</span>
                  </button>
                `).join('')}
              </div>
            `}
          </div>
          <div class="a2-status-card ${this.statusError ? 'error' : ''}">
            <span>${this.backendConnected ? 'ready' : this.backendChecked ? 'offline' : 'connecting'}</span>
            <p>${escapeHtml(this.statusMessage)}</p>
            ${this.backendChecked && !this.backendConnected ? '<button class="a2-retry-btn" data-a2-action="retry-backend" type="button">Retry connection</button>' : ''}
          </div>
        ` : ''}
        ${this.sidebarSection === 'scoreboard' ? `
          <div class="a2-panel">
            <h2>Model Leaderboard</h2>
            <p class="a2-hint">Completed 30-day runs, ranked by final score.</p>
            ${this.scoreboardRows.length === 0 ? '<p class="a2-empty">No scoreboard data yet.</p>' : `
              <div class="a2-scoreboard-wrap">
                <table class="a2-scoreboard">
                  <thead>
                    <tr>
                      <th>Model</th>
                      <th>Reward</th>
                      <th>Final Cash</th>
                      <th>Final Trust</th>
                      <th>Profit</th>
                      <th>Sold Units</th>
                      <th>Missed Units</th>
                    </tr>
                  </thead>
                  <tbody>
                    ${this.scoreboardRows.map((row, i) => `
                      <tr class="${this.run?.runId === row.runId ? 'active' : ''}">
                        <td>
                          <button data-a2-action="replay-run" data-run-id="${escapeHtml(row.runId)}" type="button">
                            ${renderBenchmarkModelCell(row.model, this.modelPresets, { rank: i + 1 })}
                          </button>
                        </td>
                        <td class="${row.score >= 0 ? 'good' : 'bad'}">${signed(row.score)}</td>
                        <td>${money(row.finalCash)}</td>
                        <td>${row.finalTrust}%</td>
                        <td class="${row.profit >= 0 ? 'good' : 'bad'}">${money(row.profit)}</td>
                        <td>${row.soldUnits.toLocaleString('en-IN')}</td>
                        <td class="${row.missedUnits > 0 ? 'bad' : 'good'}">${row.missedUnits.toLocaleString('en-IN')}</td>
                      </tr>
                    `).join('')}
                  </tbody>
                </table>
              </div>
            `}
          </div>
        ` : ''}
      </div>
    `;
    initProviderLogoFallbacks(this.requireElement('a2-sidebar'));
  }

  private renderTransport() {
    const day = this.run?.days[this.activeDayIndex];
    const dayPlayed = day ? this.autoPlayedDays.has(day.day) : false;
    const hasNext = Boolean(this.run && this.activeDayIndex + 1 < this.run.days.length);
    const hasPrev = this.activeDayIndex > 0;

    this.requireElement('a2-transport').innerHTML = `
      <div class="a2-transport-label">
        <span>Playback</span>
        <strong>${day ? `Day ${pad(day.day)}` : 'Pick a replay'}</strong>
      </div>
      <div class="a2-transport-main">
        <button class="a2-transport-btn" data-a2-action="prev-day" type="button" ${!hasPrev || this.playing ? 'disabled' : ''} title="Previous day (←)" aria-label="Previous day">◀</button>
        <button class="a2-transport-primary ${day && !this.playing ? 'ready' : ''}" data-a2-action="${day ? (this.playing ? 'pause' : 'simulate') : ''}" type="button" ${!day ? 'disabled' : ''}>
          <span class="a2-transport-primary-icon">${day ? (this.playing ? (this.paused ? '▶' : '⏸') : '▶') : '▶'}</span>
          <span class="a2-transport-primary-text">
            <strong>${day ? (this.playing ? (this.paused ? 'Resume' : 'Pause') : dayPlayed ? 'Replay Day' : 'Play Day') : 'Load a replay'}</strong>
            <em>${day ? pad(day.day) : 'from the sidebar'}</em>
          </span>
        </button>
        <button class="a2-transport-btn" data-a2-action="next-day" type="button" ${!hasNext || this.playing ? 'disabled' : ''} title="Next day (→)" aria-label="Next day">▶</button>
        ${day ? `<button class="a2-transport-secondary" data-a2-action="replay" type="button" ${this.playing ? 'disabled' : ''} title="Replay current day">↺</button>` : ''}
      </div>
      <div class="a2-transport-options">
        <div class="a2-transport-option">
          <span>Mode</span>
          <div class="a2-pill-group" aria-label="Playback mode">
            ${(['manual', 'auto'] as ArenaPlaybackMode[]).map((mode) => `
              <button class="${this.playbackMode === mode ? 'active' : ''}" data-a2-action="playback-mode" data-mode="${mode}" type="button">${mode === 'manual' ? 'Manual' : 'Auto'}</button>
            `).join('')}
          </div>
        </div>
        <div class="a2-transport-option">
          <span>Speed</span>
          <div class="a2-pill-group" aria-label="Speed">
            ${[1, 5, 20].map((s) => `
              <button class="${this.speed === s ? 'active' : ''}" data-a2-action="speed" data-speed="${s}" type="button">${s}x</button>
            `).join('')}
          </div>
        </div>
        <span class="a2-shortcut-hint">Space · ← →</span>
      </div>
    `;
  }

  private renderTimeline() {
    if (!this.run || this.run.days.length === 0) {
      this.requireElement('a2-timeline').innerHTML = `
        <div class="a2-timeline-empty">
          <span>Day timeline</span>
          <p>Load a replay to see completed days here.</p>
        </div>
      `;
      return;
    }

    const activeDay = this.run.days[this.activeDayIndex];
    const timelineProgress = Math.round(((this.activeDayIndex + 1) / this.run.days.length) * 100);

    this.requireElement('a2-timeline').innerHTML = `
      <div class="a2-timeline-label">
        <span>Timeline</span>
        <strong>${pad(activeDay?.day ?? 1)} / ${pad(this.run.days.length)}</strong>
      </div>
      <div class="a2-timeline-track">
        <div class="a2-timeline-progress" style="width:${timelineProgress}%"></div>
        <div class="a2-timeline-scroll">
          ${this.run.days.map((day, index) => `
            <button
              class="a2-day-chip ${index === this.activeDayIndex ? 'active' : ''} ${dayTone(day)} ${this.autoPlayedDays.has(day.day) ? 'played' : ''}"
              data-a2-action="timeline"
              data-day-index="${index}"
              type="button"
              title="Day ${day.day}: ${signed(day.lastReward)} reward"
            >
              <em>${pad(day.day)}</em>
              <i class="${dayTone(day)}"></i>
            </button>
          `).join('')}
        </div>
      </div>
      ${activeDay ? `
        <div class="a2-day-summary-card ${dayTone(activeDay)}">
          <span>${escapeHtml(activeDay.weather)}</span>
          <strong>${signed(activeDay.lastReward)}</strong>
          <small>reward</small>
        </div>
      ` : ''}
    `;
  }

  private renderDetail(day?: ArenaReplayDay) {
    const tabs: Array<{ id: DetailTab; label: string; hint: string }> = [
      { id: 'actions', label: 'Plan', hint: 'AI actions' },
      { id: 'thoughts', label: 'Mind', hint: 'Thought stream' },
      { id: 'audit', label: 'Audit', hint: 'Provider I/O' },
      { id: 'results', label: 'Stats', hint: 'Day results' },
      { id: 'rewards', label: 'Score', hint: 'Reward buckets' },
      { id: 'report', label: 'Log', hint: 'Inventory & visits' },
    ];

    if (!day) {
      this.requireElement('a2-detail').innerHTML = `
        <div class="a2-detail-empty">
          <h2>Day Intelligence</h2>
          <p>AI actions, rationale, and backend results show here once a day is loaded.</p>
          <div class="a2-detail-preview">
            ${tabs.map((tab) => `
              <div><strong>${escapeHtml(tab.label)}</strong><span>${escapeHtml(tab.hint)}</span></div>
            `).join('')}
          </div>
        </div>
      `;
      return;
    }

    if (this.activeTab === 'audit') {
      void this.ensureProviderAuditLoaded(day.day);
    }

    const live = this.liveMetricsFor(day);
    const activeTabMeta = tabs.find((tab) => tab.id === this.activeTab) ?? tabs[0];
    this.requireElement('a2-detail').innerHTML = `
      <div class="a2-detail-layout">
        <nav class="a2-detail-tabs" aria-label="Day detail sections">
          ${tabs.map((tab) => `
            <button
              class="${this.activeTab === tab.id ? 'active' : ''}"
              data-a2-action="tab"
              data-tab="${tab.id}"
              type="button"
              title="${escapeHtml(tab.hint)}"
            >
              <strong>${escapeHtml(tab.label)}</strong>
              <span>${escapeHtml(tab.hint)}</span>
            </button>
          `).join('')}
        </nav>
        <div class="a2-detail-panel">
          <header class="a2-detail-panel-head">
            <span>Day ${pad(day.day)}</span>
            <strong>${escapeHtml(activeTabMeta.hint)}</strong>
          </header>
          <div class="a2-detail-body">
            ${this.activeTab === 'actions' ? renderActionsTab(day) : ''}
            ${this.activeTab === 'thoughts' ? renderThoughtsTab(day) : ''}
            ${this.activeTab === 'audit' ? this.renderAuditTab(day) : ''}
            ${this.activeTab === 'results' ? renderResultsTab(day, live) : ''}
            ${this.activeTab === 'rewards' ? renderRewardsTab(day) : ''}
            ${this.activeTab === 'report' ? renderReportTab(day) : ''}
          </div>
        </div>
      </div>
    `;
  }

  private renderAuditTab(day: ArenaReplayDay) {
    if (isHeuristicModel(day.model)) {
      return `
        <div class="a2-tab-content">
          <header class="a2-tab-head">
            <h3>Provider Audit</h3>
            <span>local baseline</span>
          </header>
          <p class="a2-audit-empty">Built-in heuristic runs do not call OpenRouter, so no provider request/response audit is stored.</p>
        </div>
      `;
    }

    if (this.providerAuditStatus === 'loading' && !this.providerAuditByDay.has(day.day)) {
      return `
        <div class="a2-tab-content">
          <header class="a2-tab-head">
            <h3>Provider Audit</h3>
            <span>loading…</span>
          </header>
          <p class="a2-audit-empty">Fetching saved OpenRouter request and response for Day ${pad(day.day)}…</p>
        </div>
      `;
    }

    if (this.providerAuditStatus === 'error') {
      return `
        <div class="a2-tab-content">
          <header class="a2-tab-head">
            <h3>Provider Audit</h3>
            <span class="bad">error</span>
          </header>
          <p class="a2-audit-empty">${escapeHtml(this.providerAuditError)}</p>
        </div>
      `;
    }

    const attempts = this.providerAuditByDay.get(day.day) ?? [];
    if (attempts.length === 0) {
      return `
        <div class="a2-tab-content">
          <header class="a2-tab-head">
            <h3>Provider Audit</h3>
            <span>${escapeHtml(day.model)}</span>
          </header>
          <p class="a2-audit-empty">No provider request/response saved for this day. Older runs may only have decision metadata.</p>
        </div>
      `;
    }

    return `
      <div class="a2-tab-content">
        <header class="a2-tab-head">
          <h3>Provider Audit</h3>
          <span>${attempts.length} attempt${attempts.length === 1 ? '' : 's'}</span>
        </header>
        <div class="a2-audit-list">
          ${attempts.map((attempt, index) => renderProviderAttempt(attempt, index)).join('')}
        </div>
      </div>
    `;
  }

  private showIntroOverlay(phase: 'loading' | 'ready' | 'error') {
    this.introActive = true;
    const overlay = this.requireElement('a2-overlay');
    overlay.hidden = false;
    overlay.classList.add('is-intro');
    overlay.classList.toggle('error', phase === 'error');

    const replayCount = this.featuredReplaySummaries().length;
    const totalReplayRuns = this.allReplaySummaries().length;
    const leaderboardCount = this.scoreboardRows.length;
    const isLoading = phase === 'loading';
    const isError = phase === 'error';

    overlay.innerHTML = `
      <div class="a2-overlay-card a2-intro-card ${isError ? 'is-error' : ''}">
        <img class="a2-overlay-art" src="${emptyStateUrl}" alt="" />
        <div class="a2-overlay-copy">
          <span class="a2-overlay-eyebrow">${PRODUCT_NAME} · ${PRODUCT_TAGLINE}</span>
          <h2>${isError ? 'Backend needs attention' : isLoading ? 'Opening the theatre…' : 'Welcome to the replay theatre'}</h2>
          <p class="a2-intro-lead">
            ${isError
              ? escapeHtml(this.statusMessage)
              : isLoading
                ? 'Connecting to the backend and indexing saved replays…'
                : `Watch AI models operate ${SHOP_NAME} on ${SHOP_LOCATION}. One JSON shopkeeper plan per day — the backend simulates customers, trust, and rewards, then you replay the proof.`}
          </p>
        </div>
        ${!isError && !isLoading ? `
          <ol class="a2-intro-steps">
            <li class="a2-intro-step"><strong>1</strong><span><em>Pick a replay</em> — browse saved runs or open the leaderboard.</span></li>
            <li class="a2-intro-step"><strong>2</strong><span><em>Load a day</em> — press Play on Day 01 to animate customers on the counter.</span></li>
            <li class="a2-intro-step"><strong>3</strong><span><em>Read the proof</em> — Plan, Mind, Stats, Score, and Log panels explain each decision.</span></li>
          </ol>
          <div class="a2-intro-stats">
            <div class="a2-intro-stat"><strong>${replayCount}</strong><span>models with replays${totalReplayRuns > replayCount ? ` · ${totalReplayRuns} runs` : ''}</span></div>
            <div class="a2-intro-stat"><strong>${leaderboardCount}</strong><span>ranked models</span></div>
            <div class="a2-intro-stat"><strong>30</strong><span>days per episode</span></div>
          </div>
          <div class="a2-intro-actions">
            ${replayCount > 0 ? `
              <button class="a2-cta-primary a2-intro-primary" data-a2-action="intro-browse-replays" type="button">
                Browse ${replayCount} Saved Replays
              </button>
            ` : ''}
            <button class="${replayCount > 0 ? 'a2-cta-secondary a2-intro-primary' : 'a2-cta-primary a2-intro-primary'}" data-a2-action="intro-leaderboard" type="button">
              View Leaderboard
            </button>
            <a class="a2-intro-link subtle" href="/about">What is ${PRODUCT_NAME}? →</a>
          </div>
        ` : ''}
        ${isLoading ? `
          <div class="a2-intro-loading" aria-hidden="true">
            <span class="a2-intro-spinner"></span>
            <span>Preparing arena…</span>
          </div>
        ` : ''}
        ${isError ? `
          <div class="a2-intro-actions">
            <button class="a2-cta-primary a2-intro-primary" data-a2-action="retry-backend" type="button">Retry connection</button>
            <a class="a2-intro-link subtle" href="/about">Read the project overview →</a>
          </div>
        ` : ''}
      </div>
    `;
    this.renderTheaterChrome();
  }

  private dismissIntro(section: SidebarSection) {
    this.introActive = false;
    this.sidebarSection = section;
    this.requireElement('a2-overlay').classList.remove('is-intro');
    this.clearStageOverlay();
    this.statusError = false;
    this.statusMessage = section === 'replays'
      ? `${this.allReplaySummaries().length} saved replays — click one, then press Play Day.`
      : 'Compare completed 30-day runs — click a row to load a replay.';
    this.renderSidebar();
    this.renderTheaterChrome();
    this.renderHud();
    this.renderTransport();
  }

  private setStageOverlay(message: string, isError = false) {
    this.requireElement('a2-overlay').classList.remove('is-intro');
    const overlay = this.requireElement('a2-overlay');
    overlay.hidden = false;
    overlay.classList.toggle('error', isError);
    overlay.innerHTML = `
      <div class="a2-overlay-card ${isError ? 'is-error' : 'is-status'}">
        ${isError ? '<div class="a2-overlay-icon">!</div>' : ''}
        <div class="a2-overlay-copy">
          <span class="a2-overlay-eyebrow">${isError ? 'Arena Alert' : 'Working'}</span>
          <h2>${isError ? 'Something went wrong' : 'Please wait'}</h2>
          <p>${escapeHtml(message)}</p>
        </div>
      </div>
    `;
  }

  private clearStageOverlay() {
    const overlay = this.requireElement('a2-overlay');
    overlay.hidden = true;
    overlay.classList.remove('is-intro', 'error');
  }

  private get activeDay() {
    if (!this.run) throw new Error('Arena replay not loaded');
    return this.run.days[this.activeDayIndex];
  }

  private liveMetricsFor(day: ArenaReplayDay | undefined) {
    if (!day || this.liveMetrics?.day !== day.day) return undefined;
    return this.liveMetrics;
  }

  private requireElement(id: string) {
    const element = this.root.querySelector<HTMLElement>(`#${id}`);
    if (!element) throw new Error(`Missing arena2 element: ${id}`);
    return element;
  }
}

function metricPill(label: string, value: string, sub = '', tone = '') {
  return `
    <article class="a2-metric ${tone}">
      <span>${escapeHtml(label)}</span>
      <strong>${escapeHtml(value)}</strong>
      ${sub ? `<small>${escapeHtml(sub)}</small>` : ''}
    </article>
  `;
}

function renderProviderAttempt(attempt: AiProviderResponseRecord, index: number) {
  const usage = attempt.usage as { cost?: number; input_tokens?: number; output_tokens?: number } | undefined;
  const usageLabel = usage
    ? `${usage.input_tokens ?? '—'} in · ${usage.output_tokens ?? '—'} out${usage.cost !== undefined ? ` · $${usage.cost.toFixed(4)}` : ''}`
    : 'usage n/a';
  const statusClass = attempt.errorClass ? 'warn' : attempt.emptyContent ? 'bad' : 'good';
  const statusLabel = attempt.errorClass
    ? `validation · ${attempt.errorClass}`
    : attempt.finishReason ?? 'completed';

  return `
    <article class="a2-audit-attempt ${statusClass}">
      <header class="a2-audit-head">
        <strong>Attempt ${index + 1}</strong>
        <span>${escapeHtml(statusLabel)}</span>
      </header>
      <dl class="a2-audit-meta">
        <div><dt>Provider</dt><dd>${escapeHtml(attempt.provider ?? '—')} · ${escapeHtml(attempt.transport ?? '—')}</dd></div>
        <div><dt>Response</dt><dd>${escapeHtml(shortId(attempt.responseId ?? '—'))} · ${usageLabel}</dd></div>
        <div><dt>Payload</dt><dd>${attempt.requestBytes.toLocaleString('en-IN')} B req · ${attempt.responseBytes.toLocaleString('en-IN')} B resp</dd></div>
      </dl>
      ${attempt.rawError ? `
        <div class="a2-audit-error">
          <span>Validator</span>
          <p>${escapeHtml(attempt.rawError)}</p>
        </div>
      ` : ''}
      ${attempt.responseText ? `
        <details class="a2-audit-block" open>
          <summary>Response text</summary>
          <pre class="a2-audit-pre">${escapeHtml(attempt.responseText)}</pre>
        </details>
      ` : ''}
      ${attempt.requestJson ? `
        <details class="a2-audit-block">
          <summary>Request JSON</summary>
          <pre class="a2-audit-pre">${escapeHtml(JSON.stringify(attempt.requestJson, null, 2))}</pre>
        </details>
      ` : ''}
    </article>
  `;
}

function sidebarNavBtn(section: SidebarSection, label: string, active: SidebarSection, badge?: number) {
  return `
    <button class="${active === section ? 'active' : ''}" data-a2-action="sidebar-section" data-section="${section}" type="button">
      ${escapeHtml(label)}${badge !== undefined && badge > 0 ? `<em>${badge}</em>` : ''}
    </button>
  `;
}

function renderActionsTab(day: ArenaReplayDay) {
  return `
    <div class="a2-tab-content">
      <header class="a2-tab-head">
        <h3>Today's Plan</h3>
        <span>${day.actionCards.length} actions · ${day.latencyMs ? `${Math.round(day.latencyMs / 1000)}s` : 'instant'}</span>
      </header>
      <div class="a2-action-cards">
        ${day.actionCards.map((card, i) => `
          <article class="a2-action-card ${card.impact}">
            <div class="a2-action-num">${i + 1}</div>
            <img src="${actionIcon(card.id)}" alt="" />
            <div>
              <h4>${escapeHtml(card.title)}</h4>
              <p>${escapeHtml(card.detail)}</p>
              <footer><span>${money(card.cost)}</span><em>${card.impact}</em></footer>
            </div>
          </article>
        `).join('')}
      </div>
    </div>
  `;
}

function renderThoughtsTab(day: ArenaReplayDay) {
  return `
    <div class="a2-tab-content">
      <header class="a2-tab-head">
        <h3>Thought Stream</h3>
        <span>${escapeHtml(day.model)}</span>
      </header>
      <div class="a2-thoughts">
        ${day.thoughts.map((thought) => `
          <div class="a2-thought ${thought.tone}">
            <span>${thought.label}</span>
            <p>${escapeHtml(thought.text)}</p>
          </div>
        `).join('')}
      </div>
      ${day.rationale ? `
        <blockquote class="a2-rationale">
          <span>Rationale</span>
          <p>${escapeHtml(day.rationale)}</p>
        </blockquote>
      ` : ''}
    </div>
  `;
}

function renderResultsTab(day: ArenaReplayDay, live?: ArenaLiveMetrics) {
  const m = {
    visits: live?.visits ?? day.metrics.visits,
    soldUnits: live?.soldUnits ?? day.metrics.soldUnits,
    missedUnits: live?.missedUnits ?? day.metrics.missedUnits,
    revenue: live?.revenue ?? day.metrics.revenue,
    khata: live?.khata ?? day.metrics.khata,
  };
  return `
    <div class="a2-tab-content">
      <header class="a2-tab-head">
        <h3>Backend Results</h3>
        <span>${live ? 'updating live' : 'day complete'}</span>
      </header>
      <div class="a2-result-grid">
        ${resultTile('Visits', String(m.visits))}
        ${resultTile('Sold', String(m.soldUnits))}
        ${resultTile('Revenue', money(m.revenue))}
        ${resultTile('Missed', String(m.missedUnits), m.missedUnits > 0 ? 'bad' : 'good')}
        ${resultTile('Khata', money(m.khata), m.khata > 0 ? 'warn' : 'good')}
        ${resultTile('Mkt ROI', `${day.metrics.marketingRoi.toFixed(1)}x`)}
        ${resultTile('Profit', money(day.metrics.profit))}
        ${resultTile('Stockouts', String(day.metrics.stockouts), day.metrics.stockouts > 0 ? 'bad' : 'good')}
      </div>
    </div>
  `;
}

function renderRewardsTab(day: ArenaReplayDay) {
  return `
    <div class="a2-tab-content">
      <header class="a2-tab-head">
        <h3>Reward Breakdown</h3>
        <span class="${day.rewards.total >= 0 ? 'good' : 'bad'}">${signed(day.rewards.total)} total</span>
      </header>
      <div class="a2-reward-bars">
        ${rewardBar('Service', day.rewards.service)}
        ${rewardBar('Inventory', day.rewards.inventory)}
        ${rewardBar('Money', day.rewards.money)}
        ${rewardBar('Relationships', day.rewards.relationships)}
        ${rewardBar('Marketing', day.rewards.marketing)}
        ${rewardBar('Operations', day.rewards.operations)}
        ${rewardBar('Penalties', day.rewards.penalties)}
      </div>
    </div>
  `;
}

function renderReportTab(day: ArenaReplayDay) {
  return `
    <div class="a2-tab-content a2-report-tab">
      <header class="a2-tab-head">
        <h3>Day Report</h3>
        <span>${escapeHtml(day.eventLabel)}</span>
      </header>
      <section>
        <h4>Inventory</h4>
        <div class="a2-report-cards">
          ${day.inventory.map((item) => `
            <article class="a2-report-card">
              <strong>${escapeHtml(item.name)}</strong>
              <div class="a2-report-metrics">
                <span>Open <em>${item.openingShelf}</em></span>
                <span>Sold <em>${item.sold}</em></span>
                <span class="${item.missed > 0 ? 'bad' : ''}">Miss <em>${item.missed}</em></span>
                <span>Close <em>${item.closing}</em></span>
              </div>
            </article>
          `).join('')}
        </div>
      </section>
      <section>
        <h4>Customer Visits</h4>
        <div class="a2-report-cards">
          ${day.visits.slice(0, 12).map((visit) => `
            <article class="a2-report-card">
              <div class="a2-report-card-head">
                <strong>${escapeHtml(visit.customerName)}</strong>
                <span class="${visit.outcome !== 'fulfilled' ? 'bad' : 'good'}">${visit.outcome}</span>
              </div>
              <p>${escapeHtml(visit.requested.map((l) => `${l.quantity} ${l.productId}`).join(', '))}</p>
              <footer>${visit.paymentMode === 'khata' ? `Khata ${money(visit.khataAmount)}` : money(visit.amountPaid)}</footer>
            </article>
          `).join('')}
        </div>
      </section>
    </div>
  `;
}

function resultTile(label: string, value: string, tone = '') {
  return `<div class="a2-result-tile ${tone}"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></div>`;
}

function rewardBar(label: string, value: number) {
  const max = 30;
  const width = Math.min(100, Math.abs(value) / max * 100);
  return `
    <div class="a2-reward-bar ${value < 0 ? 'bad' : value > 0 ? 'good' : ''}">
      <div class="a2-reward-bar-label"><span>${escapeHtml(label)}</span><strong>${signed(value)}</strong></div>
      <div class="a2-reward-bar-track"><div class="a2-reward-bar-fill" style="width:${width}%"></div></div>
    </div>
  `;
}
