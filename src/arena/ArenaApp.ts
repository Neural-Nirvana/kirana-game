import { adaptAiReplay } from './arena-adapter';
import { ArenaStage } from './ArenaStage';
import type { AiReplayResponse, ArenaReplayDay, ArenaReplayRun } from './arena-types';

export class ArenaApp {
  private readonly root: HTMLElement;
  private stage?: ArenaStage;
  private run?: ArenaReplayRun;
  private activeDayIndex = 0;
  private speed = 5;
  private paused = false;
  private playing = false;
  private reportOpen = false;

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
    await this.loadHeuristicReplay();
  }

  private async loadHeuristicReplay() {
    this.setLoading('Starting heuristic AI benchmark...');
    try {
      const response = await fetch('/api/ai-runs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ profile: 'balanced', model: 'heuristic-v1' }),
      });
      if (!response.ok) throw new Error(await response.text());
      const replayResponse = await response.json() as AiReplayResponse;
      this.run = adaptAiReplay(replayResponse);
      if (this.run.days.length === 0) throw new Error('AI replay returned no completed days.');
      this.activeDayIndex = 0;
      this.stage?.setDay(this.activeDay);
      this.clearLoading();
      this.renderAll();
      window.setTimeout(() => void this.playActiveDay(), 350);
    } catch (error) {
      this.setLoading(error instanceof Error ? error.message : String(error), true);
    }
  }

  private renderShell() {
    this.root.innerHTML = `
      <main class="arena-root" aria-label="Shree Shyam Bhandar AI Arena Replay">
        <section class="arena-hud" id="arena-hud"></section>
        <section class="arena-stage-shell">
          <div class="arena-stage-frame" id="arena-stage"></div>
          <div class="arena-stage-overlay" id="arena-loading">
            <div class="arena-loader-title">Preparing AI Arena</div>
            <div class="arena-loader-subtitle">Building a 30-day replay from the backend simulator.</div>
          </div>
        </section>
        <section class="arena-dashboard" id="arena-dashboard"></section>
        <section class="arena-footer">
          <div class="arena-timeline" id="arena-timeline"></div>
          <div class="arena-controls" id="arena-controls"></div>
        </section>
        <aside class="arena-report" id="arena-report" hidden></aside>
      </main>
    `;
  }

  private bindEvents() {
    this.root.addEventListener('click', (event) => {
      const target = event.target instanceof Element ? event.target.closest<HTMLElement>('[data-arena-action]') : null;
      if (!target) return;
      const action = target.dataset.arenaAction;
      if (action === 'simulate') void this.playActiveDay();
      if (action === 'pause') this.togglePause();
      if (action === 'replay') void this.replayDay();
      if (action === 'report') this.toggleReport();
      if (action === 'speed') this.setSpeed(Number(target.dataset.speed ?? 5));
      if (action === 'timeline') this.selectDay(Number(target.dataset.dayIndex ?? 0));
    });
  }

  private renderAll() {
    if (!this.run) return;
    this.renderHud(this.activeDay);
    this.renderDashboard(this.activeDay);
    this.renderTimeline();
    this.renderControls();
    this.renderReport(this.activeDay);
  }

  private async playActiveDay() {
    if (!this.run || this.playing) return;
    this.playing = true;
    this.paused = false;
    this.stage?.setPaused(false);
    this.renderControls();
    await this.stage?.playDay(this.activeDay, this.speed);
    this.playing = false;
    this.renderControls();
  }

  private async replayDay() {
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
    this.reportOpen = !this.reportOpen;
    this.renderReport(this.activeDay);
    this.renderControls();
  }

  private renderHud(day: ArenaReplayDay) {
    this.requireElement('arena-hud').innerHTML = `
      <div class="arena-brand">
        <div class="arena-brand-icon">▣</div>
        <div>
          <h1>Shree Shyam Bhandar</h1>
          <p>AI Arena Replay</p>
        </div>
      </div>
      ${hudCard('Day', `${pad(day.day)}/${day.maxDays}`, 'DAY', '')}
      ${hudCard('Cash', money(day.cash), '₹', `Profit today ${money(day.metrics.profit)}`)}
      ${hudCard('Trust', `${day.trust}%`, '♥', `${signed(day.trustDelta)} today`, day.trustDelta < 0 ? 'bad' : 'good')}
      ${hudCard('Score', `${day.score.toLocaleString('en-IN')}`, '★', `Last reward ${signed(day.lastReward)}`, day.lastReward < 0 ? 'bad' : 'good')}
      ${hudCard('Weather', day.weather, weatherIcon(day.weather), '')}
      ${hudCard('Event', day.eventLabel, '⚑', '')}
    `;
  }

  private renderDashboard(day: ArenaReplayDay) {
    this.requireElement('arena-dashboard').innerHTML = `
      <div class="arena-panel arena-actions">
        <div class="arena-panel-title">AI Actions <span>today's plan</span></div>
        <div class="arena-action-cards">
          ${day.actionCards.map((card, index) => `
            <article class="arena-action-card ${card.impact}">
              <div class="arena-action-number">${index + 1}</div>
              <h3>${escapeHtml(card.title)}</h3>
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
    if (!this.run) return;
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
    this.requireElement('arena-controls').innerHTML = `
      <button class="arena-primary" data-arena-action="simulate" type="button" ${this.playing ? 'disabled' : ''}>
        ▶ Simulate Day ${pad(this.activeDay.day)}
        <span>watch what happens</span>
      </button>
      <div class="arena-speed-group">
        ${[1, 5, 20].map((speed) => `
          <button class="${this.speed === speed ? 'active' : ''}" data-arena-action="speed" data-speed="${speed}" type="button">${speed}x</button>
        `).join('')}
      </div>
      <button data-arena-action="pause" type="button" ${!this.playing ? 'disabled' : ''}>${this.paused ? 'Resume' : 'Pause'}</button>
      <button data-arena-action="replay" type="button">Replay</button>
      <button class="${this.reportOpen ? 'active' : ''}" data-arena-action="report" type="button">View Report</button>
    `;
  }

  private renderReport(day: ArenaReplayDay) {
    const report = this.requireElement('arena-report');
    report.hidden = !this.reportOpen;
    if (!this.reportOpen) return;
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
      <div class="arena-loader-title">${isError ? 'Arena failed to load' : 'Preparing AI Arena'}</div>
      <div class="arena-loader-subtitle">${escapeHtml(message)}</div>
    `;
  }

  private clearLoading() {
    this.requireElement('arena-loading').hidden = true;
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

function money(value: number) {
  return `₹${Math.round(value).toLocaleString('en-IN')}`;
}

function signed(value: number) {
  return `${value >= 0 ? '+' : ''}${Math.round(value)}`;
}

function pad(value: number) {
  return value.toString().padStart(2, '0');
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function escapeHtml(value: string) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}
