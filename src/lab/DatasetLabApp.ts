import './dataset-lab.css';
import { apiPath, appPath } from '../base-path';
import { PRODUCT_NAME } from '../constants/brand';

type DatasetStats = {
  humanRuns: number;
  aiRuns: number;
  heuristicRuns: number;
  completeRuns: number;
  totalSteps: number;
  exportableExamples: number;
};

type DatasetRun = {
  runId: string;
  playerType: 'human' | 'ai';
  runName?: string;
  status: string;
  daysCompleted: number;
  totalScore: number;
  runSeed?: number;
  playerName?: string;
  aiModel?: string;
  exampleCount: number;
  hasRationale: boolean;
  sourceTag: 'human' | 'ai' | 'heuristic';
};

type ExampleSummary = {
  day: number;
  dayReward: number;
  cumulativeScore: number;
  trustAfter: number;
  stockouts: number;
  visits: number;
  missedUnits: number;
  sourceTag: string;
  hasRationale: boolean;
  signals: {
    day: string;
    weather: string;
    calendar: string[];
    customers: string[];
    market: string[];
    memory: string[];
  };
  action: Record<string, unknown>;
  rationale?: string;
  outcome: {
    profit: number;
    khataAdded: number;
    khataCollected: number;
    topMissed: Array<{ productId: string; missed: number }>;
  };
};

type RunDetail = {
  meta: {
    runId: string;
    runName?: string;
    playerType: string;
    status: string;
    totalScore: number;
    daysCompleted: number;
    runSeed?: number;
    playerName?: string;
    aiModel?: string;
  };
  examples: ExampleSummary[];
};

type TrainingExample = ExampleSummary & {
  runId: string;
  trainingRecord: {
    messages: Array<{ role: string; content: string }>;
  };
};

async function requestJson<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(apiPath(path), {
    ...init,
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json', ...(init.headers ?? {}) },
  });
  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    throw new Error(detail || `Request failed (${response.status})`);
  }
  return response.json() as Promise<T>;
}

function escapeHtml(value: string) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function shortId(runId: string) {
  return runId.slice(0, 8);
}

function signed(value: number) {
  return value > 0 ? `+${value}` : `${value}`;
}

export class DatasetLabApp {
  private readonly root: HTMLElement;
  private stats: DatasetStats | null = null;
  private runs: DatasetRun[] = [];
  private selectedRunId?: string;
  private selectedDay?: number;
  private runDetail?: RunDetail;
  private trainingExample?: TrainingExample;
  private statusMessage = 'Loading dataset catalog…';
  private statusTone: 'neutral' | 'good' | 'error' = 'neutral';
  private busy = false;

  private sourceFilter: 'all' | 'human' | 'ai' | 'heuristic' = 'all';
  private completeOnly = false;
  private minScore = '';

  constructor(rootId: string) {
    const root = document.getElementById(rootId);
    if (!root) throw new Error(`Missing dataset lab root: ${rootId}`);
    this.root = root;
  }

  async start() {
    document.documentElement.classList.add('lab-route');
    document.body.classList.add('lab-route');
    this.root.classList.add('lab-route');
    this.bindEvents();
    await this.refresh();
  }

  private bindEvents() {
    this.root.addEventListener('click', (event) => {
      const target = (event.target as HTMLElement).closest('[data-lab-action]') as HTMLElement | null;
      if (!target) return;
      const action = target.dataset.labAction;
      if (action === 'refresh') void this.refresh();
      if (action === 'select-run') {
        const runId = target.dataset.runId;
        if (runId) void this.selectRun(runId);
      }
      if (action === 'select-day') {
        const day = Number(target.dataset.day);
        if (Number.isFinite(day)) void this.selectDay(day);
      }
      if (action === 'generate') void this.generateHeuristic();
      if (action === 'export') void this.exportJsonl();
      if (action === 'download-example') void this.downloadCurrentExample();
    });

    this.root.addEventListener('change', (event) => {
      const target = event.target as HTMLElement;
      if (target.id === 'lab-source-filter') {
        this.sourceFilter = (target as HTMLSelectElement).value as typeof this.sourceFilter;
        void this.loadRuns();
      }
      if (target.id === 'lab-complete-only') {
        this.completeOnly = (target as HTMLInputElement).checked;
        void this.loadRuns();
      }
      if (target.id === 'lab-min-score') {
        this.minScore = (target as HTMLInputElement).value;
        void this.loadRuns();
      }
    });
  }

  private async refresh() {
    this.busy = true;
    this.render();
    try {
      this.stats = await requestJson<DatasetStats>('/api/dataset/stats');
      await this.loadRuns();
      this.setStatus('Dataset catalog ready.', 'good');
    } catch (error) {
      this.setStatus(error instanceof Error ? error.message : String(error), 'error');
    } finally {
      this.busy = false;
      this.render();
    }
  }

  private async loadRuns() {
    const params = new URLSearchParams();
    params.set('source', this.sourceFilter);
    if (this.completeOnly) params.set('completeOnly', 'true');
    if (this.minScore.trim()) params.set('minScore', this.minScore.trim());
    params.set('limit', '80');
    const response = await requestJson<{ runs: DatasetRun[] }>(`/api/dataset/runs?${params}`);
    this.runs = response.runs;
    if (this.selectedRunId && !this.runs.some((run) => run.runId === this.selectedRunId)) {
      this.selectedRunId = undefined;
      this.runDetail = undefined;
      this.trainingExample = undefined;
      this.selectedDay = undefined;
    }
    if (!this.selectedRunId && this.runs.length > 0) {
      await this.selectRun(this.runs[0].runId);
    } else if (this.selectedRunId) {
      await this.selectRun(this.selectedRunId, true);
    }
  }

  private async selectRun(runId: string, preserveDay = false) {
    this.selectedRunId = runId;
    this.busy = true;
    this.render();
    try {
      this.runDetail = await requestJson<RunDetail>(`/api/dataset/runs/${encodeURIComponent(runId)}`);
      const day = preserveDay && this.selectedDay
        ? this.selectedDay
        : this.runDetail.examples[this.runDetail.examples.length - 1]?.day;
      if (day) await this.selectDay(day, true);
      else {
        this.selectedDay = undefined;
        this.trainingExample = undefined;
      }
    } catch (error) {
      this.setStatus(error instanceof Error ? error.message : String(error), 'error');
    } finally {
      this.busy = false;
      this.render();
    }
  }

  private async selectDay(day: number, silent = false) {
    if (!this.selectedRunId) return;
    this.selectedDay = day;
    if (!silent) {
      this.busy = true;
      this.render();
    }
    try {
      this.trainingExample = await requestJson<TrainingExample>(
        `/api/dataset/runs/${encodeURIComponent(this.selectedRunId)}/examples/${day}`
      );
      if (!silent) this.setStatus(`Loaded training example for Day ${String(day).padStart(2, '0')}.`, 'good');
    } catch (error) {
      this.setStatus(error instanceof Error ? error.message : String(error), 'error');
    } finally {
      if (!silent) {
        this.busy = false;
        this.render();
      }
    }
  }

  private async generateHeuristic() {
    const count = Number((this.root.querySelector('#lab-gen-count') as HTMLInputElement | null)?.value ?? 3);
    const seedStart = Number((this.root.querySelector('#lab-gen-seed') as HTMLInputElement | null)?.value ?? 20260701);
    const maxDays = Number((this.root.querySelector('#lab-gen-days') as HTMLInputElement | null)?.value ?? 30);
    this.busy = true;
    this.setStatus(`Generating ${count} heuristic run(s)…`, 'neutral');
    this.render();
    try {
      const result = await requestJson<{ runs: Array<{ runId: string; seed: number; totalScore: number; daysCompleted: number }> }>(
        '/api/dataset/generate/heuristic',
        { method: 'POST', body: JSON.stringify({ count, seedStart, maxDays, profile: 'balanced' }) }
      );
      this.sourceFilter = 'heuristic';
      await this.refresh();
      const first = result.runs[0];
      if (first) await this.selectRun(first.runId);
      this.setStatus(`Created ${result.runs.length} heuristic run(s). Latest score ${signed(first?.totalScore ?? 0)}.`, 'good');
    } catch (error) {
      this.setStatus(error instanceof Error ? error.message : String(error), 'error');
    } finally {
      this.busy = false;
      this.render();
    }
  }

  private async exportJsonl() {
    const minTotalScore = Number((this.root.querySelector('#lab-export-min-score') as HTMLInputElement | null)?.value ?? '');
    const minDayReward = Number((this.root.querySelector('#lab-export-min-day') as HTMLInputElement | null)?.value ?? '');
    const body = {
      source: this.sourceFilter === 'all' ? undefined : this.sourceFilter,
      completeOnly: this.completeOnly,
      minTotalScore: Number.isFinite(minTotalScore) && minTotalScore !== 0 ? minTotalScore : undefined,
      minDayReward: Number.isFinite(minDayReward) && minDayReward !== 0 ? minDayReward : undefined,
      runIds: this.selectedRunId ? [this.selectedRunId] : undefined,
      limitRuns: this.selectedRunId ? undefined : 50,
    };
    this.busy = true;
    this.setStatus('Building JSONL export…', 'neutral');
    this.render();
    try {
      const response = await fetch(apiPath('/api/dataset/export'), {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!response.ok) throw new Error(await response.text());
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = 'dukaanbench-sft.jsonl';
      anchor.click();
      URL.revokeObjectURL(url);
      this.setStatus('JSONL download started.', 'good');
    } catch (error) {
      this.setStatus(error instanceof Error ? error.message : String(error), 'error');
    } finally {
      this.busy = false;
      this.render();
    }
  }

  private downloadCurrentExample() {
    if (!this.trainingExample) return;
    const blob = new Blob([JSON.stringify(this.trainingExample.trainingRecord, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `example-${this.trainingExample.runId.slice(0, 8)}-day-${this.trainingExample.day}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  private setStatus(message: string, tone: 'neutral' | 'good' | 'error') {
    this.statusMessage = message;
    this.statusTone = tone;
  }

  private render() {
    const stats = this.stats;
    const detail = this.runDetail;
    const example = this.trainingExample;
    const summary = detail?.examples.find((item) => item.day === this.selectedDay);

    this.root.innerHTML = `
      <div class="lab-root">
        <header class="lab-top">
          <div>
            <span class="lab-eyebrow">${PRODUCT_NAME} · Dataset Lab</span>
            <h1>Training data, explained.</h1>
            <p>
              Browse human plays and AI arena runs, inspect each day as
              <strong>signals → action → outcome → SFT record</strong>, generate heuristic rollouts, and export JSONL for fine-tuning.
            </p>
          </div>
          <nav class="lab-nav">
            <a href="${appPath('/play')}">Play shop</a>
            <a href="${appPath('/arena-2')}">Arena</a>
            <a href="${appPath('/about')}">About</a>
            <button type="button" data-lab-action="refresh" ${this.busy ? 'disabled' : ''}>Refresh</button>
          </nav>
        </header>

        <div class="lab-flow">
          <span><strong>1. Signals</strong> — what the model sees before the day (forecast, customers, inventory memory).</span>
          <span><strong>2. Action</strong> — executable JSON plan (orders, discounts, khata, marketing).</span>
          <span><strong>3. Outcome</strong> — simulated result and day reward (for filtering, not leaked into training input).</span>
          <span><strong>4. Export</strong> — chat-format JSONL: system prompt + compact observation + action/rationale.</span>
        </div>

        <section class="lab-stats">
          <div class="lab-stat"><strong>${stats?.exportableExamples ?? '—'}</strong><span>exportable day steps</span></div>
          <div class="lab-stat"><strong>${stats?.humanRuns ?? '—'}</strong><span>human runs</span></div>
          <div class="lab-stat"><strong>${stats?.aiRuns ?? '—'}</strong><span>AI runs</span></div>
          <div class="lab-stat"><strong>${stats?.heuristicRuns ?? '—'}</strong><span>heuristic dataset runs</span></div>
          <div class="lab-stat"><strong>${stats?.completeRuns ?? '—'}</strong><span>completed episodes</span></div>
        </section>

        <div class="lab-grid">
          <section class="lab-panel">
            <div class="lab-panel-head">
              <h2>Generate & export</h2>
              <p>No LLM required for bulk baseline data. Heuristic runs are seeded and fully traced in SQLite.</p>
            </div>
            <div class="lab-panel-body">
              <div class="lab-field">
                <label>Generate heuristic runs</label>
                <input id="lab-gen-count" type="number" min="1" max="20" value="3" />
              </div>
              <div class="lab-field">
                <label>Seed start</label>
                <input id="lab-gen-seed" type="number" value="20260701" />
              </div>
              <div class="lab-field">
                <label>Days per run</label>
                <input id="lab-gen-days" type="number" min="1" max="30" value="30" />
              </div>
              <div class="lab-btn-row">
                <button class="lab-btn primary" type="button" data-lab-action="generate" ${this.busy ? 'disabled' : ''}>
                  Generate runs
                </button>
              </div>

              <hr style="border:none;border-top:1px solid var(--lab-border);margin:16px 0;" />

              <div class="lab-field">
                <label>Export min total score</label>
                <input id="lab-export-min-score" type="number" placeholder="optional" />
              </div>
              <div class="lab-field">
                <label>Export min day reward</label>
                <input id="lab-export-min-day" type="number" placeholder="optional" />
              </div>
              <div class="lab-btn-row">
                <button class="lab-btn secondary" type="button" data-lab-action="export" ${this.busy ? 'disabled' : ''}>
                  ${this.selectedRunId ? 'Export selected run' : 'Export filtered runs'}
                </button>
              </div>

              <p class="lab-status ${this.statusTone === 'error' ? 'error' : this.statusTone === 'good' ? 'good' : ''}">
                ${escapeHtml(this.statusMessage)}
              </p>
            </div>
          </section>

          <section class="lab-panel">
            <div class="lab-panel-head">
              <h2>Saved runs</h2>
              <p>Human shop sessions and arena replays become training rows automatically.</p>
            </div>
            <div class="lab-panel-body">
              <div class="lab-filters">
                <div class="lab-field" style="margin:0">
                  <label>Source</label>
                  <select id="lab-source-filter">
                    <option value="all" ${this.sourceFilter === 'all' ? 'selected' : ''}>All</option>
                    <option value="human" ${this.sourceFilter === 'human' ? 'selected' : ''}>Human</option>
                    <option value="ai" ${this.sourceFilter === 'ai' ? 'selected' : ''}>AI models</option>
                    <option value="heuristic" ${this.sourceFilter === 'heuristic' ? 'selected' : ''}>Heuristic</option>
                  </select>
                </div>
                <div class="lab-field" style="margin:0">
                  <label>Min score</label>
                  <input id="lab-min-score" type="number" value="${escapeHtml(this.minScore)}" placeholder="any" />
                </div>
              </div>
              <label style="display:flex;gap:8px;align-items:center;font-size:12px;margin-bottom:12px;color:var(--lab-ink-muted);">
                <input id="lab-complete-only" type="checkbox" ${this.completeOnly ? 'checked' : ''} />
                Complete 30-day runs only
              </label>
              <div class="lab-run-list">
                ${this.runs.length === 0 ? '<div class="lab-empty">No runs match these filters yet.</div>' : this.runs.map((run) => `
                  <button
                    class="lab-run-item ${run.runId === this.selectedRunId ? 'active' : ''}"
                    type="button"
                    data-lab-action="select-run"
                    data-run-id="${escapeHtml(run.runId)}"
                  >
                    <div class="lab-run-item-head">
                      <strong>${escapeHtml(run.runName ?? run.aiModel ?? run.playerName ?? 'Unnamed run')}</strong>
                      <em>${signed(run.totalScore)}</em>
                    </div>
                    <span>${run.daysCompleted} days · ${run.status} · ${shortId(run.runId)}${run.runSeed ? ` · seed ${run.runSeed}` : ''}</span>
                    <span class="lab-tag ${run.sourceTag}">${run.sourceTag}</span>
                    ${run.hasRationale ? '<span class="lab-tag ai">rationale</span>' : ''}
                  </button>
                `).join('')}
              </div>
            </div>
          </section>

          <section class="lab-panel">
            <div class="lab-panel-head">
              <h2>Day inspector</h2>
              <p>${detail ? `${detail.meta.runName ?? detail.meta.aiModel ?? detail.meta.playerName ?? 'Run'} · ${detail.examples.length} training steps` : 'Select a run to inspect each day.'}</p>
            </div>
            <div class="lab-panel-body">
              ${!detail ? '<div class="lab-empty">Pick a run from the catalog.</div>' : `
                <div class="lab-day-strip">
                  ${detail.examples.map((item) => `
                    <button
                      class="lab-day-pill ${item.day === this.selectedDay ? 'active' : ''} ${item.dayReward >= 0 ? 'good' : 'bad'}"
                      type="button"
                      data-lab-action="select-day"
                      data-day="${item.day}"
                    >
                      D${String(item.day).padStart(2, '0')} ${signed(item.dayReward)}
                    </button>
                  `).join('')}
                </div>

                ${!summary ? '<div class="lab-empty">Select a day.</div>' : `
                  <dl class="lab-kv" style="margin-bottom:14px;">
                    <dt>Day reward</dt><dd>${signed(summary.dayReward)}</dd>
                    <dt>Cumulative</dt><dd>${signed(summary.cumulativeScore)}</dd>
                    <dt>Trust</dt><dd>${summary.trustAfter}%</dd>
                    <dt>Visits</dt><dd>${summary.visits}</dd>
                    <dt>Missed units</dt><dd>${summary.missedUnits}</dd>
                    <dt>Stockouts</dt><dd>${summary.stockouts}</dd>
                  </dl>

                  <div class="lab-inspector-grid">
                    <article class="lab-card">
                      <h3>Signals (input)</h3>
                      <div class="lab-card-body">
                        <p><strong>${escapeHtml(summary.signals.day)}</strong> · ${escapeHtml(summary.signals.weather)}</p>
                        <p style="margin-top:8px;font-weight:700;color:var(--lab-ink);">Calendar</p>
                        <ul class="lab-signal-list">${summary.signals.calendar.map((line) => `<li>${escapeHtml(line)}</li>`).join('')}</ul>
                        <p style="margin-top:8px;font-weight:700;color:var(--lab-ink);">Customers</p>
                        <ul class="lab-signal-list">${summary.signals.customers.map((line) => `<li>${escapeHtml(line)}</li>`).join('')}</ul>
                        <p style="margin-top:8px;font-weight:700;color:var(--lab-ink);">Market</p>
                        <ul class="lab-signal-list">${summary.signals.market.map((line) => `<li>${escapeHtml(line)}</li>`).join('')}</ul>
                        <p style="margin-top:8px;font-weight:700;color:var(--lab-ink);">Memory</p>
                        <ul class="lab-signal-list">${summary.signals.memory.map((line) => `<li>${escapeHtml(line)}</li>`).join('')}</ul>
                      </div>
                    </article>

                    <article class="lab-card">
                      <h3>Action (label)</h3>
                      <div class="lab-card-body">
                        ${summary.rationale ? `<p style="margin-bottom:10px;"><em>${escapeHtml(summary.rationale)}</em></p>` : '<p style="margin-bottom:10px;color:var(--lab-ink-muted);">Template or model rationale attached in export.</p>'}
                        <pre class="lab-pre">${escapeHtml(JSON.stringify(summary.action, null, 2))}</pre>
                      </div>
                    </article>

                    <article class="lab-card">
                      <h3>Outcome (filter)</h3>
                      <div class="lab-card-body">
                        <dl class="lab-kv">
                          <dt>Profit</dt><dd>₹${summary.outcome.profit}</dd>
                          <dt>Khata added</dt><dd>₹${summary.outcome.khataAdded}</dd>
                          <dt>Khata collected</dt><dd>₹${summary.outcome.khataCollected}</dd>
                        </dl>
                        ${summary.outcome.topMissed.length > 0 ? `
                          <p style="margin-top:10px;font-weight:700;color:var(--lab-ink);">Top missed</p>
                          <ul class="lab-signal-list">
                            ${summary.outcome.topMissed.map((row) => `<li>${escapeHtml(row.productId)} · ${row.missed}</li>`).join('')}
                          </ul>
                        ` : '<p style="margin-top:10px;">No missed demand recorded.</p>'}
                      </div>
                    </article>
                  </div>

                  <div style="margin-top:14px;">
                    <div class="lab-btn-row" style="margin-bottom:10px;">
                      <button class="lab-btn secondary" type="button" data-lab-action="download-example" ${example ? '' : 'disabled'}>
                        Download SFT record JSON
                      </button>
                    </div>
                    <pre class="lab-pre">${example ? escapeHtml(JSON.stringify(example.trainingRecord, null, 2)) : 'Loading training record…'}</pre>
                  </div>
                `}
              `}
            </div>
          </section>
        </div>
      </div>
    `;
  }
}