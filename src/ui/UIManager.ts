import type { ProductId, PlayerActions, DayResult, VisibleState, CustomerOrderLine, CustomerProfile, CustomerVisit, PerishabilitySnapshot, ProductInventory, LLMDayContext, MarketingCampaignInstance, MarketingCampaignSpec, PlayerProfile, DayLog } from '../types';
import { GameState } from '../game/GameState';
import { PRODUCTS, DEFAULT_CONFIG } from '../constants/products';
import { MARKETING_CAMPAIGNS, getMarketingCampaign } from '../constants/marketing';
import { LIVE_SHOP_FRAMES } from '../assets/live-shop/frames';
import { PerishabilityEngine } from '../game/PerishabilityEngine';
import { EnvironmentSignalEngine, type EnvironmentSignalReport, type WeatherOutlookDay } from '../game/progression/EnvironmentSignalEngine';
import milkImage from '../assets/items/milk.png';
import breadImage from '../assets/items/bread.png';
import eggsImage from '../assets/items/eggs.png';
import maggiImage from '../assets/items/maggi.png';
import chipsImage from '../assets/items/chips.png';
import coldDrinksImage from '../assets/items/cold-drinks.png';
import bananasImage from '../assets/items/bananas.png';

type InventoryCardStatus = 'healthy' | 'low' | 'empty' | 'stockout' | 'perishable';
type AIInsightStatus = 'loading' | 'ready' | 'unavailable';
type LiveScoreboardTone = 'positive' | 'warning' | 'negative' | 'neutral';
type LiveScoreboardMetric = {
  label: string;
  value: number;
  placeholder: string;
  note: string;
  tone: LiveScoreboardTone;
  prefix?: string;
  suffix?: string;
};

type ItemModalDraft = {
  productId: ProductId;
  orderQty: number;
  removeQty: number;
  discountPct: number;
};

type ItemModalSnapshot = {
  productId: ProductId;
  scrollTop: number;
};

type FinancialSummary = {
  revenue: number;
  costOfGoods: number;
  grossMargin: number;
  purchaseSpend: number;
  marketingSpend: number;
  wasteLoss: number;
  removalLoss: number;
  operatingProfit: number;
  cashChange: number;
};

const PRODUCT_IMAGE_BY_ID: Partial<Record<ProductId, string>> = {
  milk: milkImage,
  bread: breadImage,
  eggs: eggsImage,
  maggi: maggiImage,
  chips: chipsImage,
  cold_drinks: coldDrinksImage,
  bananas: bananasImage,
};

const STORE_NAME = 'Shree Shyam Bhandar';
const STORE_SHORT_NAME = 'Shree Shyam Bhandar';

export class UIManager {
  private container: HTMLElement;
  private _currentState?: GameState;
  private orderBasket: Partial<Record<ProductId, number>> = {};
  private removalMap: Partial<Record<ProductId, number>> = {};
  private discountMap: Partial<Record<ProductId, number>> = {};
  private khataReminderIds: Set<string> = new Set();
  private selectedMarketingIds: Set<string> = new Set();
  private marketingProductSelections: Partial<Record<string, Set<ProductId>>> = {};
  private activeMarketing: MarketingCampaignInstance[] = [];
  private itemModalDraft?: ItemModalDraft;
  private itemTrendKeydown?: (event: KeyboardEvent) => void;
  private planError?: string;
  private liveScoreboardTimer?: number;
  private currentCaseResult?: DayResult;
  private currentCaseState?: GameState;
  private currentCaseDayContext?: LLMDayContext;
  private currentCaseAIInsightStatus: AIInsightStatus = 'unavailable';
  private cashReserve: number = DEFAULT_CONFIG.defaultCashReserve;
  private fridgeAlloc: { milk: number; cold_drinks: number; buffer: number } = { milk: 60, cold_drinks: 30, buffer: 10 };
  private openingDayContext?: LLMDayContext;
  private openingAIInsightStatus: AIInsightStatus = 'loading';
  private onAction: (actions: PlayerActions) => void;
  private onPlanChange: (actions: PlayerActions) => void;
  private onNextDay: () => void;
  private onShowAIReplay: () => void;
  private onPlayerLogin: (playerName: string) => void;
  private onPlayerLogout: () => void;
  private player?: PlayerProfile;
  private loginError?: string;

  constructor(
    containerId: string,
    onAction: (actions: PlayerActions) => void,
    onPlanChange: (actions: PlayerActions) => void,
    onNextDay: () => void,
    onShowAIReplay: () => void,
    onPlayerLogin: (playerName: string) => void,
    onPlayerLogout: () => void
  ) {
    this.container = document.getElementById(containerId)!;
    this.onAction = onAction;
    this.onPlanChange = onPlanChange;
    this.onNextDay = onNextDay;
    this.onShowAIReplay = onShowAIReplay;
    this.onPlayerLogin = onPlayerLogin;
    this.onPlayerLogout = onPlayerLogout;
  }

  // ===== SCREENS =====

  setMarketingPipeline(activeMarketing: MarketingCampaignInstance[] = []) {
    this.activeMarketing = activeMarketing;
  }

  setPlayerProfile(player?: PlayerProfile) {
    this.player = player;
    if (player) this.loginError = undefined;
  }

  setLoginError(message?: string) {
    this.loginError = message;
  }

  showLiveDayScreen(day: number, result?: DayResult) {
    this.stopLiveScoreboard();
    const paddedDay = String(day).padStart(2, '0');
    const scoreboardMetrics = result ? this.getLiveScoreboardMetrics(result) : this.getLiveScoreboardPlaceholders();
    const liveStatus = result ? 'Fast-forwarding ledger' : 'Preparing shop floor';
    this.container.scrollTop = 0;
    this.container.innerHTML = `
      <div class="screen active live-day-screen" id="live-day-screen" aria-live="polite">
        <div class="live-frame-stage">
          ${LIVE_SHOP_FRAMES.map((frame, index) => `
            <img
              class="live-shop-frame"
              src="${frame.src}"
              alt="${frame.label}"
              loading="eager"
              style="animation-delay: ${(index * 1.08).toFixed(2)}s;"
            />
          `).join('')}
          <div class="live-shop-vignette"></div>
          <div class="live-day-copy">
            <span>Day ${paddedDay} in progress</span>
            <strong>${result ? 'Watch the day unfold' : 'The shop is opening'}</strong>
            <em>${result ? 'Visits, sales, missed demand, khata, and score update from today’s actual ledger.' : 'Customers are arriving; the shop ledger will start ticking in a moment.'}</em>
          </div>
          <div class="live-monitor-hud">
            <div class="live-monitor-topline">
              <span>Simulating Day ${paddedDay}</span>
              <strong>${liveStatus}</strong>
            </div>
            <div class="live-scoreboard-grid">
              ${scoreboardMetrics.map((metric) => `
                <div class="live-score-card ${metric.tone}">
                  <span>${metric.label}</span>
                  <strong
                    data-live-number
                    data-final="${metric.value}"
                    data-prefix="${metric.prefix ?? ''}"
                    data-suffix="${metric.suffix ?? ''}"
                  >${metric.prefix ?? ''}${result ? '0' : metric.placeholder}${metric.suffix ?? ''}</strong>
                  <em>${metric.note}</em>
                </div>
              `).join('')}
            </div>
            <div class="live-event-strip">
              ${this.renderLiveEventChip('Morning visits', result ? `${Math.max(1, Math.ceil(result.customerVisits.length * 0.35))} customers` : 'queue forming')}
              ${this.renderLiveEventChip('Counter sales', result ? `${this.getTotalItemsSold(result)} items moved` : 'items scanning')}
              ${this.renderLiveEventChip('Closing ledger', result ? `${this.formatSignedNumber(result.rewardBreakdown.total)} score` : 'calculating')}
            </div>
            <div class="live-progress-track">
              <div class="live-progress-fill"></div>
            </div>
          </div>
        </div>
      </div>
    `;

    if (result) {
      this.animateLiveScoreboard();
    }
  }

  private getLiveScoreboardPlaceholders(): LiveScoreboardMetric[] {
    return [
      { label: 'Visits', value: 0, placeholder: '...', note: 'Customers entering', tone: 'neutral' },
      { label: 'Items sold', value: 0, placeholder: '...', note: 'Counter activity', tone: 'positive' },
      { label: 'Revenue', value: 0, placeholder: '...', prefix: '₹', note: 'Cash + khata sales', tone: 'positive' },
      { label: 'Missed', value: 0, placeholder: '...', note: 'Demand not served', tone: 'negative' },
      { label: 'Khata', value: 0, placeholder: '...', prefix: '₹', note: 'Written to ledger', tone: 'warning' },
      { label: 'Score', value: 0, placeholder: '...', note: 'Rewards impact', tone: 'neutral' },
    ];
  }

  private getLiveScoreboardMetrics(result: DayResult): LiveScoreboardMetric[] {
    const missed = this.getTotalMissedDemand(result);
    const score = result.rewardBreakdown.total;
    return [
      { label: 'Visits', value: result.customerVisits.length, placeholder: '0', note: 'Customers visited', tone: result.customerVisits.length > 0 ? 'positive' : 'neutral' },
      { label: 'Items sold', value: this.getTotalItemsSold(result), placeholder: '0', note: 'Units fulfilled', tone: 'positive' },
      { label: 'Revenue', value: Math.round(this.getTotalRevenue(result)), placeholder: '0', prefix: '₹', note: 'Today’s sales', tone: 'positive' },
      { label: 'Missed', value: missed, placeholder: '0', note: 'Units unavailable', tone: missed > 0 ? 'negative' : 'positive' },
      { label: 'Khata', value: Math.round(result.khataAdded), placeholder: '0', prefix: '₹', note: 'New credit today', tone: result.khataAdded > 0 ? 'warning' : 'positive' },
      { label: 'Stockouts', value: result.stockouts, placeholder: '0', note: 'SKUs unavailable', tone: result.stockouts > 0 ? 'negative' : 'positive' },
      { label: 'Cash', value: Math.round(result.cash), placeholder: '0', prefix: '₹', note: 'Closing cash', tone: result.cash >= this.cashReserve ? 'positive' : 'warning' },
      { label: 'Score', value: score, placeholder: '0', note: 'Rewards impact', tone: score >= 0 ? 'positive' : 'negative' },
    ];
  }

  private renderLiveEventChip(label: string, value: string): string {
    return `
      <div>
        <span>${label}</span>
        <strong>${value}</strong>
      </div>
    `;
  }

  private animateLiveScoreboard() {
    const nodes = Array.from(this.container.querySelectorAll<HTMLElement>('[data-live-number]'));
    if (nodes.length === 0) return;

    const startedAt = performance.now();
    const durationMs = 4100;
    const update = () => {
      const elapsed = performance.now() - startedAt;
      const rawProgress = Math.min(1, elapsed / durationMs);
      const progress = 1 - Math.pow(1 - rawProgress, 3);

      nodes.forEach((node) => {
        const finalValue = Number(node.dataset.final ?? 0);
        const prefix = node.dataset.prefix ?? '';
        const suffix = node.dataset.suffix ?? '';
        const currentValue = Math.round(finalValue * progress);
        node.textContent = `${this.formatLiveMetricValue(currentValue, prefix)}${suffix}`;
      });

      if (rawProgress >= 1) {
        this.stopLiveScoreboard();
      }
    };

    update();
    this.liveScoreboardTimer = window.setInterval(update, 90);
  }

  private formatLiveMetricValue(value: number, prefix: string): string {
    if (prefix === '₹' && value < 0) {
      return `-₹${Math.abs(value).toLocaleString()}`;
    }
    return `${prefix}${value.toLocaleString()}`;
  }

  private stopLiveScoreboard() {
    if (this.liveScoreboardTimer !== undefined) {
      window.clearInterval(this.liveScoreboardTimer);
      this.liveScoreboardTimer = undefined;
    }
  }

  showOpeningScreen() {
    this.stopLiveScoreboard();
    this.container.innerHTML = `
      <div class="screen opening-screen active" id="opening-screen">
        <div class="intro-shell">
          <section class="intro-hero-panel">
            <div class="intro-copy">
              <span class="intro-eyebrow">AI Nagar: Kirana Street · Episode 1</span>
              <h1 class="opening-title">${STORE_NAME}</h1>
              <p class="opening-subtitle">Run ${STORE_SHORT_NAME} for 30 days. Read street signals, buy stock, serve visitors, manage khata, and earn rewards.</p>
            </div>

            <div class="intro-stat-grid">
              <div>
                <span>Opening cash</span>
                <strong>₹${DEFAULT_CONFIG.startingCash.toLocaleString()}</strong>
              </div>
              <div>
                <span>Starting trust</span>
                <strong>${DEFAULT_CONFIG.startingTrust}%</strong>
              </div>
              <div>
                <span>Run length</span>
                <strong>${DEFAULT_CONFIG.maxDays} days</strong>
              </div>
              <div>
                <span>Shop size</span>
                <strong>${DEFAULT_CONFIG.shopSize} sq ft</strong>
              </div>
            </div>

            <div class="intro-loop-grid" aria-label="Game loop">
              <article>
                <span>1</span>
                <strong>Read signals</strong>
                <em>Weather, weekday, cash, visits, and AI decision points.</em>
              </article>
              <article>
                <span>2</span>
                <strong>Stock shelves</strong>
                <em>Buy enough for demand without trapping cash or wasting perishables.</em>
              </article>
              <article>
                <span>3</span>
                <strong>Review the day</strong>
                <em>See what sold, what was missed, who used khata, and why score changed.</em>
              </article>
              <article>
                <span>4</span>
                <strong>Plan tomorrow</strong>
                <em>Restock, remove old stock, create offers, remind khata, and market only when shelves can serve it.</em>
              </article>
            </div>

            ${this.renderPlayerEntry()}

            <div class="intro-action-row">
              ${this.player ? `
                <button class="btn btn-primary" id="btn-start-human">
                  Start with opening stock
                </button>
              ` : ''}
              <button class="btn btn-outline" id="btn-watch-ai">
                Watch AI benchmark
              </button>
              ${this.player ? `
                <button class="btn btn-outline" id="btn-player-logout">
                  Change player
                </button>
              ` : ''}
            </div>
          </section>

          <aside class="intro-shop-panel" aria-label="Shop preview">
            <div class="intro-shop-head">
              <span>First decision</span>
              <strong>Empty shelves, ₹${DEFAULT_CONFIG.startingCash.toLocaleString()} cash</strong>
              <em>Choose the first stock mix before Day 1 visitors enter ${STORE_SHORT_NAME}.</em>
            </div>
            ${this.renderIntroShelf()}
            <div class="intro-score-preview">
              <div>
                <span>Rewards care about</span>
                <strong>Service · Inventory · Money · Visits · Marketing</strong>
              </div>
              <em>Good campaigns earn points only when promoted demand is served profitably.</em>
            </div>
            <div class="intro-marketing-preview">
              <span>Marketing score</span>
              <strong>Promote what you can actually sell</strong>
              <em>Campaigns can lift ROI and trust, but promoted stockouts hurt the score.</em>
            </div>
          </aside>
        </div>
      </div>
    `;

    document.getElementById('player-login-form')?.addEventListener('submit', (event) => {
      event.preventDefault();
      const form = event.currentTarget as HTMLFormElement;
      const input = form.elements.namedItem('player-name') as HTMLInputElement | null;
      this.onPlayerLogin(input?.value ?? '');
    });

    document.getElementById('btn-start-human')?.addEventListener('click', () => {
      this.onAction({
        orders: {},
        removals: {},
        discounts: {},
        khataReminders: [],
        marketingActions: [],
        cashReserve: DEFAULT_CONFIG.defaultCashReserve,
        fridgeAllocation: { milk: 60, cold_drinks: 30, buffer: 10 },
      });
    });

    document.getElementById('btn-watch-ai')?.addEventListener('click', () => {
      this.onShowAIReplay();
    });

    document.getElementById('btn-player-logout')?.addEventListener('click', () => {
      this.onPlayerLogout();
    });
  }

  private renderPlayerEntry(): string {
    if (this.player) {
      return `
        <div class="intro-player-card signed-in">
          <div>
            <span>Player session</span>
            <strong>${this.escapeHtml(this.player.displayName)}</strong>
            <em>Your runs, inventory, customers, marketing, and score are saved separately.</em>
          </div>
          <span class="intro-session-badge">Session saved</span>
        </div>
      `;
    }

    return `
      <form class="intro-player-card" id="player-login-form">
        <div>
          <span>Player name</span>
          <strong>Start your own shop run</strong>
          <em>Each player gets a separate saved game, ledger, and history.</em>
          ${this.loginError ? `<p class="intro-login-error">${this.escapeHtml(this.loginError)}</p>` : ''}
        </div>
        <label class="intro-name-field">
          <input
            id="player-name"
            name="player-name"
            type="text"
            maxlength="40"
            autocomplete="name"
            placeholder="Enter your name"
            aria-label="Player name"
          />
          <button class="btn btn-primary" type="submit">Enter shop</button>
        </label>
      </form>
    `;
  }

  private escapeHtml(value: string): string {
    return value
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  private renderIntroShelf(): string {
    const itemIds: ProductId[] = ['milk', 'bread', 'cold_drinks', 'maggi', 'chips', 'bananas', 'eggs'];
    return `
      <div class="intro-shelf">
        ${itemIds.map((productId) => {
          const product = PRODUCTS.find((item) => item.id === productId);
          if (!product) return '';
          const image = PRODUCT_IMAGE_BY_ID[product.id];
          return `
            <div class="intro-shelf-item">
              <div>
                ${image ? `<img src="${image}" alt="${product.name}" />` : `<span>${product.name.slice(0, 2)}</span>`}
              </div>
              <strong>${product.name}</strong>
            </div>
          `;
        }).join('')}
      </div>
    `;
  }

  showInitialStockingScreen(
    state: GameState,
    dayContext?: LLMDayContext,
    preservePlan = false,
    aiInsightStatus: AIInsightStatus = dayContext ? 'ready' : 'loading'
  ) {
    this.stopLiveScoreboard();
    const itemModalSnapshot = preservePlan ? this.getOpenItemTrendSnapshot() : undefined;
    this._currentState = state;
    this.currentCaseResult = undefined;
    this.currentCaseState = undefined;
    this.currentCaseDayContext = undefined;
    this.currentCaseAIInsightStatus = 'unavailable';
    if (dayContext) {
      this.openingDayContext = dayContext;
    }
    if (!preservePlan) {
      this.orderBasket = this.getStarterInventoryPlan();
      this.removalMap = {};
      this.discountMap = {};
      this.khataReminderIds = new Set();
      this.selectedMarketingIds = new Set();
      this.marketingProductSelections = {};
      this.cashReserve = state.config.defaultCashReserve;
      this.openingDayContext = dayContext;
      this.openingAIInsightStatus = aiInsightStatus;
    } else {
      this.openingAIInsightStatus = dayContext ? 'ready' : aiInsightStatus;
    }
    this._renderInitialStockingUI(state, this.openingDayContext, this.openingAIInsightStatus);
    this.restoreOpenItemTrendModal(itemModalSnapshot, state);
    this.onPlanChange(this.getCurrentActions());
  }

  showMorningScreen(state: GameState, visibleState: VisibleState) {
    this.stopLiveScoreboard();
    this._currentState = state;
    this.orderBasket = {};
    this.removalMap = {};
    this.discountMap = {};
    this.khataReminderIds = new Set();
    this._renderMorningUI(state, visibleState);
  }

  showCaseScreen(
    result: DayResult,
    state: GameState,
    dayContext?: LLMDayContext,
    preservePlan = false,
    aiInsightStatus: AIInsightStatus = dayContext ? 'ready' : 'unavailable'
  ) {
    this.stopLiveScoreboard();
    const itemModalSnapshot = preservePlan ? this.getOpenItemTrendSnapshot() : undefined;
    this._currentState = state;
    this.currentCaseResult = result;
    this.currentCaseState = state;
    this.currentCaseDayContext = dayContext;
    this.currentCaseAIInsightStatus = aiInsightStatus;
    if (!preservePlan) {
      this.orderBasket = {};
      this.removalMap = {};
      this.discountMap = {};
      this.khataReminderIds = new Set();
      this.selectedMarketingIds = new Set();
      this.marketingProductSelections = {};
    }
    this._renderCaseUI(result, state, dayContext, aiInsightStatus);
    this.restoreOpenItemTrendModal(itemModalSnapshot, state);
  }

  private _renderInitialStockingUI(
    state: GameState,
    dayContext?: LLMDayContext,
    aiInsightStatus: AIInsightStatus = dayContext ? 'ready' : 'loading'
  ) {
    const environment = new EnvironmentSignalEngine().buildOpening({
      maxDays: DEFAULT_CONFIG.maxDays,
      customers: state.customers,
    });

    this.container.innerHTML = `
      <div class="screen active initial-stock-screen" id="initial-stock-screen">
        <div class="initial-stock-shell">
          ${this.renderOpeningDecisionBrief(state, environment, dayContext, aiInsightStatus)}
        </div>
      </div>
    `;

    this.attachInitialStockListeners(state);
  }

  private _renderCaseUI(
    result: DayResult,
    state: GameState,
    dayContext?: LLMDayContext,
    aiInsightStatus: AIInsightStatus = dayContext ? 'ready' : 'unavailable'
  ) {
    this.container.innerHTML = `
      <div class="screen active ops-screen" id="case-screen">
        <div class="case-shell">
          ${this.renderExecutiveSummary(result, state, dayContext, aiInsightStatus)}
        </div>
      </div>
    `;

    this.attachCaseListeners(result, state);
  }

  private _renderMorningUI(state: GameState, visibleState: VisibleState) {
    const events = this.getTodaysEvents(state.day);
    const situationBanner = events.length > 0 ? this.renderSituationBanner(events[0]) : '';

    this.container.innerHTML = `
      <div class="screen active" id="morning-screen">
        ${this.renderHeader(state, visibleState)}
        ${this.renderMeters(visibleState)}
        ${situationBanner}
        ${this.renderCustomerMemoryPanel(state)}
        ${this.renderProductCards(state)}
        ${this.renderOrderBasket(state)}
        ${this.renderSliders()}
        ${this.renderRiskPreview(state)}
        <button class="btn btn-success btn-plan-lock" id="btn-lock-plan">
          LOCK MORNING PLAN
        </button>
      </div>
    `;

    this.attachListeners();

    document.getElementById('btn-lock-plan')?.addEventListener('click', () => {
      this.onAction(this.getCurrentActions());
    });
  }

  showEveningScreen(result: DayResult, state: GameState) {
    const rb = result.rewardBreakdown;
    const total = rb.total;
    const positive = total >= 0;
    const financials = this.getFinancialSummary(result, state);

    this.container.innerHTML = `
      <div class="screen active" id="evening-screen">
        <div class="panel" style="padding: 32px 24px;">
          <div class="report-header">
            <div class="report-day">Day ${result.day} Complete</div>
            <div class="report-title">Evening Report</div>
            <div class="report-score" style="color: ${positive ? 'var(--success)' : 'var(--danger)'};">
              ${positive ? '+' : ''}${total}
            </div>
          </div>

          <div class="report-breakdown">
            ${this.renderReportRow('Operating Profit', this.formatSignedCurrency(financials.operatingProfit), financials.operatingProfit >= 0 ? 'positive' : 'negative')}
            ${this.renderReportRow('Gross Margin', `₹${financials.grossMargin.toLocaleString()}`, financials.grossMargin >= 0 ? 'positive' : 'negative')}
            ${this.renderReportRow('Revenue', `₹${financials.revenue.toLocaleString()}`, financials.revenue > 0 ? 'positive' : 'neutral')}
            ${this.renderReportRow('Stock Purchased', `₹${financials.purchaseSpend.toLocaleString()}`, financials.purchaseSpend > 0 ? 'neutral' : 'positive')}
            ${this.renderReportRow('Cash Balance', `₹${result.cash.toLocaleString()}`, 'neutral')}
            ${this.renderReportRow('Customer Trust', `${result.trust}%`, result.trust >= 70 ? 'positive' : result.trust >= 50 ? 'neutral' : 'negative')}
            ${this.renderReportRow('Waste Loss', `₹${result.wasteLoss.toLocaleString()}`, result.wasteLoss > 0 ? 'negative' : 'positive')}
            ${this.renderReportRow('Stockouts', `${result.stockouts}`, result.stockouts === 0 ? 'positive' : 'negative')}
          </div>

          ${this.renderCustomerVisitReport(result)}

          <div style="margin-top: 20px; padding-top: 16px; border-top: 1px solid var(--panel-border);">
            <div class="panel-header">Reward Breakdown</div>
            <div class="report-breakdown">
              ${this.renderReportRow('Service', `+${rb.service}`, 'positive')}
              ${this.renderReportRow('Inventory', `+${rb.inventory}`, 'positive')}
              ${this.renderReportRow('Money', `+${rb.money}`, 'positive')}
              ${this.renderReportRow('Relationships', `+${rb.relationships}`, 'positive')}
              ${this.renderReportRow('Marketing', this.formatSignedNumber(rb.marketing), rb.marketing >= 0 ? 'positive' : 'negative')}
              ${this.renderReportRow('Operations', `+${rb.operations}`, 'positive')}
              ${this.renderReportRow('Penalties', `${rb.penalties}`, rb.penalties < 0 ? 'negative' : 'neutral')}
            </div>
          </div>

          <div style="margin-top: 16px; padding: 12px; background: var(--bg-secondary); border-radius: var(--radius-md); font-size: 12px; color: var(--slate); line-height: 1.6;">
            ${this.renderKeyInsight(result)}
          </div>
        </div>

        <button class="btn btn-primary" id="btn-next-day" style="width: 100%; font-size: 14px; padding: 14px; margin-top: 8px;">
          ${state.day >= DEFAULT_CONFIG.maxDays ? 'VIEW FINAL SCORE' : `CONTINUE TO DAY ${state.day + 1}`}
        </button>
      </div>
    `;

    document.getElementById('btn-next-day')?.addEventListener('click', () => {
      this.onNextDay();
    });
  }

  showFinalScoreboard(state: GameState) {
    this.stopLiveScoreboard();
    const totalScore = state.getTotalScore();
    const runFinancials = this.getRunFinancialSummary(state);
    const totalWaste = state.history.reduce((sum, log) => sum + log.results.wasteLoss, 0);
    const stockoutDays = state.history.filter(log => log.results.stockouts > 0).length;
    const totalStockoutIncidents = state.history.reduce((sum, log) => sum + log.results.stockouts, 0);
    const cashCrisisDays = state.history.filter(log => log.results.cash < state.config.cashCrisisThreshold).length;
    const finalTrust = Math.round(state.trust);
    const regularsKept = state.customers.filter(customer => customer.trust >= 70).length;
    const rating = this.getPerformanceRating(totalScore, finalTrust, totalStockoutIncidents, regularsKept, state.config.maxDays);
    const scoreTone = totalScore >= 500 && finalTrust >= 65 && regularsKept >= 5 ? 'var(--success)' : totalScore >= 0 ? 'var(--warning)' : 'var(--danger)';

    this.container.innerHTML = `
      <div class="screen active" id="final-screen">
        <div class="panel" style="padding: 32px 24px;">
          <div style="text-align: center; margin-bottom: 24px;">
            <div style="font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.1em; color: var(--muted); margin-bottom: 8px;">30 Days Complete</div>
            <div style="font-size: 28px; font-weight: 800; color: var(--charcoal);">Final Scoreboard</div>
            <div style="font-family: var(--font-mono); font-size: 48px; font-weight: 700; color: ${scoreTone}; margin: 12px 0;">${totalScore}</div>
          </div>

          <div class="report-breakdown" style="margin-bottom: 20px;">
            ${this.renderReportRow('Operating Profit', this.formatSignedCurrency(runFinancials.operatingProfit), runFinancials.operatingProfit >= 0 ? 'positive' : 'negative')}
            ${this.renderReportRow('Total Revenue', `₹${runFinancials.revenue.toLocaleString()}`, runFinancials.revenue > 0 ? 'positive' : 'neutral')}
            ${this.renderReportRow('Gross Margin', `₹${runFinancials.grossMargin.toLocaleString()}`, runFinancials.grossMargin >= 0 ? 'positive' : 'negative')}
            ${this.renderReportRow('Stock Purchased', `₹${runFinancials.purchaseSpend.toLocaleString()}`, 'neutral')}
            ${this.renderReportRow('Marketing Spend', `₹${runFinancials.marketingSpend.toLocaleString()}`, runFinancials.marketingSpend > 0 ? 'neutral' : 'positive')}
            ${this.renderReportRow('Final Customer Trust', `${finalTrust}%`, finalTrust >= 70 ? 'positive' : finalTrust >= 50 ? 'neutral' : 'negative')}
            ${this.renderReportRow('Waste Loss', `₹${totalWaste.toLocaleString()}`, 'negative')}
            ${this.renderReportRow('Stockout Days', `${stockoutDays}`, stockoutDays < 5 ? 'positive' : 'negative')}
            ${this.renderReportRow('Stockout Incidents', `${totalStockoutIncidents}`, totalStockoutIncidents < 15 ? 'positive' : 'negative')}
            ${this.renderReportRow('Cash Crisis Days', `${cashCrisisDays}`, cashCrisisDays === 0 ? 'positive' : 'negative')}
            ${this.renderReportRow('Regulars Kept', `${regularsKept}/${state.customers.length}`, regularsKept >= 5 ? 'positive' : regularsKept >= 3 ? 'neutral' : 'negative')}
            ${this.renderReportRow('Final Cash', `₹${Math.round(state.cash).toLocaleString()}`, 'neutral')}
          </div>

          <div style="padding: 14px; background: rgba(139,92,246,0.06); border-radius: var(--radius-md); border: 1px solid rgba(139,92,246,0.2); margin-bottom: 16px;">
            <div style="font-size: 12px; font-weight: 600; color: var(--trust); margin-bottom: 4px;">Performance Rating</div>
            <div style="font-size: 20px; font-weight: 800; color: var(--charcoal);">${rating}</div>
          </div>

          <button class="btn btn-primary" id="btn-replay" style="width: 100%; font-size: 14px; padding: 14px;">
            Play Again
          </button>
          <button class="btn btn-outline" id="btn-ai-replay" style="width: 100%; font-size: 13px; margin-top: 8px;">
            Watch AI benchmark run
          </button>
        </div>
      </div>
    `;

    document.getElementById('btn-replay')?.addEventListener('click', () => {
      location.reload();
    });

    document.getElementById('btn-ai-replay')?.addEventListener('click', () => {
      this.onShowAIReplay();
    });
  }

  // ===== RENDERERS =====

  private renderHeader(state: GameState, vs: VisibleState): string {
    const scoreSoFar = state.history.reduce((sum, log) => sum + log.results.rewardBreakdown.total, 0);
    return `
      <div class="panel" style="padding: 14px 18px;">
        <div style="display: flex; justify-content: space-between; align-items: center;">
          <div style="font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.08em; color: var(--muted);">
            Day ${String(vs.day).padStart(2, '0')} / ${vs.maxDays}
          </div>
          <div class="reward-chip ${vs.day === 1 ? 'neutral' : 'positive'}" style="font-size: 11px;">
            Score: ${scoreSoFar}
          </div>
        </div>
      </div>
    `;
  }

  private renderMeters(vs: VisibleState): string {
    const expiryColor = vs.expiryRisk === 'high' ? 'red' : vs.expiryRisk === 'medium' ? 'orange' : 'green';
    const fridgeColor = vs.fridgeUsedPct > 90 ? 'red' : vs.fridgeUsedPct > 70 ? 'amber' : 'blue';

    return `
      <div class="panel">
        <div class="panel-header">Shop Status</div>
        <div class="meter-group">
          ${this.renderMeter('Cash', `₹${vs.cash.toLocaleString()}`, (vs.cash / Math.max(DEFAULT_CONFIG.startingCash, 1)) * 100, 'cash')}
          ${this.renderMeter('Customer Trust', `${Math.round(vs.trust)}%`, vs.trust, 'trust')}
          ${this.renderMeter('Fridge Space', `${vs.fridgeUsedPct}%`, vs.fridgeUsedPct, fridgeColor)}
          ${this.renderMeter('Expiry Risk', vs.expiryRisk.toUpperCase(), vs.expiryRisk === 'high' ? 80 : vs.expiryRisk === 'medium' ? 50 : 20, expiryColor)}
        </div>
      </div>
    `;
  }

  private renderMeter(name: string, value: string, pct: number, colorClass: string): string {
    return `
      <div class="meter">
        <div class="meter-label-row">
          <span class="meter-name">${name}</span>
          <span class="meter-value ${colorClass}">${value}</span>
        </div>
        <div class="meter-bar-bg">
          <div class="meter-bar-fill ${colorClass}" style="width: ${Math.min(100, Math.max(0, pct))}%"></div>
        </div>
      </div>
    `;
  }

  private renderDecisionChip(label: string, value: string, tone: 'calendar' | 'positive' | 'warning' | 'negative'): string {
    return `
      <div class="decision-chip ${tone}">
        <span>${label}</span>
        <strong>${value}</strong>
      </div>
    `;
  }

  private renderExecutiveSummary(
    result: DayResult,
    state: GameState,
    dayContext?: LLMDayContext,
    aiInsightStatus: AIInsightStatus = dayContext ? 'ready' : 'unavailable'
  ): string {
    const khataDue = this.getTotalKhataDue(state);
    const financials = this.getFinancialSummary(result, state);
    const totalSold = this.getTotalItemsSold(result);
    const totalMissed = this.getTotalMissedDemand(result);
    const missedRevenue = this.getMissedRevenue(result);
    const stockoutDays = state.history.filter(log => log.results.stockouts > 0).length;
    const cashCrisisDays = state.history.filter(log => log.results.cash < state.config.cashCrisisThreshold).length;
    const regularsKept = state.customers.filter(customer => customer.trust >= 70).length;
    const losses = financials.wasteLoss + financials.removalLoss;
    const shopStatus = this.getDailyShopStatus(result);
    const rewards = result.unlockedRewards.filter((reward) => reward.unlocked).slice(0, 3);
    const events = this.getTodaysEvents(result.day);
    const environment = new EnvironmentSignalEngine().build({
      completedDay: result.day,
      maxDays: DEFAULT_CONFIG.maxDays,
      customers: state.customers,
      result,
    });
    const fulfilledVisits = result.customerVisits.filter((visit) => visit.outcome === 'fulfilled').length;
    const attentionVisits = result.customerVisits.length - fulfilledVisits;
    const khataVisits = result.customerVisits.filter((visit) => visit.paymentMode === 'khata').length;
    const perishabilityRiskCost = result.inventoryMovements.reduce((sum, row) => sum + row.perishability.wasteRiskCost, 0);
    const perishabilityRiskUnits = result.inventoryMovements.reduce((sum, row) => sum + row.perishability.riskUnits, 0);
    const inventoryDemandUnits = totalSold + totalMissed;
    const inventoryServiceRate = inventoryDemandUnits > 0 ? totalSold / inventoryDemandUnits : 1;
    const severeInventoryRisk = inventoryDemandUnits > 0 && (inventoryServiceRate < 0.55 || (totalSold === 0 && totalMissed > 0));
    const inventoryTone = severeInventoryRisk
      ? 'negative'
      : (totalMissed > 0 || result.stockouts > 0 || perishabilityRiskCost > 0)
        ? 'warning'
        : totalSold > 0
          ? 'positive'
          : 'neutral';
    const inventoryShortageTone = severeInventoryRisk ? 'negative' : 'warning';
    const moneyMain = this.formatSignedCurrency(financials.operatingProfit);
    const moneyLabel = 'operating profit';
    const itemMain = `${totalSold}`;
    const itemLabel = 'sold today';
    const customerMain = `${result.customerVisits.length}`;
    const customerLabel = 'visited today';
    const rewardMain = this.formatSignedNumber(result.rewardBreakdown.total);
    const rewardTone = result.rewardBreakdown.total >= 50
      ? 'positive'
      : result.rewardBreakdown.total < 0
        ? 'negative'
        : 'warning';
    const rewardNote = rewards.length > 0
      ? `Unlocked: ${rewards.map((reward) => reward.title).join(', ')}`
      : `${result.difficulty.focus} · Penalties ${this.formatSignedNumber(result.rewardBreakdown.penalties)}`;
    const decisionHeadline = `${this.weatherLabel(environment.tomorrowWeather.weather)} tomorrow, ${totalMissed > 0 ? 'essentials missed today' : 'shelves held today'}`;
    const aiInsightBlock = dayContext
      ? this.renderCompactLLMDayContext(dayContext)
      : aiInsightStatus === 'loading'
        ? this.renderAIInsightLoader()
        : this.renderAIInsightPlaceholder();

    return `
      <section class="panel executive-summary insight-brief-panel">
        <div class="decision-hero-bar">
          <div class="decision-title-lockup">
            <div class="decision-app-icon" aria-hidden="true">
              <span></span><span></span><span></span>
            </div>
            <h2 class="case-title">${STORE_SHORT_NAME} Report</h2>
          </div>
          <div class="decision-status-chips">
            ${this.renderDecisionChip('Day', String(result.day).padStart(2, '0'), 'calendar')}
            ${this.renderDecisionChip('Plan', environment.dayName, 'calendar')}
            ${this.renderDecisionChip('Trust', `${Math.round(result.trust)}%`, result.trustChange >= 0 ? 'positive' : 'warning')}
            ${this.renderDecisionChip('Profit', this.formatSignedCurrency(financials.operatingProfit), financials.operatingProfit >= 0 ? 'positive' : 'negative')}
            ${this.renderDecisionChip('Cash', `₹${result.cash.toLocaleString()}`, 'positive')}
          </div>
        </div>

        <div class="decision-alert-banner ${totalMissed > 0 ? 'negative' : 'positive'}">
          <div class="decision-weather-icon ${environment.tomorrowWeather.weather}" aria-hidden="true">${this.weatherIcon(environment.tomorrowWeather.weather)}</div>
          <div>
            <strong>${decisionHeadline}</strong>
            <span>${shopStatus.detail}${events.length > 0 ? ` · ${events[0].title}: ${events[0].text}` : ''}</span>
          </div>
        </div>

        <div class="executive-groups insight-metric-groups">
          ${this.renderExecutiveGroup(
            'Money',
            moneyMain,
            moneyLabel,
            financials.operatingProfit >= 0 ? 'positive' : 'negative',
            [
              { label: 'Revenue', value: `₹${financials.revenue.toLocaleString()}`, tone: financials.revenue > 0 ? 'positive' : 'neutral' },
              { label: 'Gross margin', value: `₹${financials.grossMargin.toLocaleString()}`, tone: financials.grossMargin >= 0 ? 'positive' : 'negative' },
              { label: 'Cash change', value: this.formatSignedCurrency(financials.cashChange), tone: financials.cashChange >= 0 ? 'positive' : 'negative' },
              { label: 'Khata due', value: `₹${khataDue.toLocaleString()}`, tone: khataDue > 0 ? 'warning' : 'positive' },
            ],
            `Cash now ₹${result.cash.toLocaleString()} · stock bought ₹${financials.purchaseSpend.toLocaleString()} · losses ₹${losses.toLocaleString()}`
          )}
          ${this.renderExecutiveGroup(
            'Inventory',
            itemMain,
            itemLabel,
            inventoryTone,
            [
              { label: 'Sold', value: `${totalSold}`, tone: totalSold > 0 ? 'positive' : 'neutral' },
              { label: 'Stockout SKUs', value: `${result.stockouts}`, tone: result.stockouts > 0 ? inventoryShortageTone : 'positive' },
              { label: 'Lost sales', value: `₹${missedRevenue.toLocaleString()}`, tone: missedRevenue > 0 ? inventoryShortageTone : 'positive' },
              { label: 'Perishable risk', value: `₹${perishabilityRiskCost.toLocaleString()}`, tone: perishabilityRiskCost > 0 ? 'warning' : 'positive' },
            ],
            `${perishabilityRiskUnits} risk-weighted units · ${stockoutDays} stockout days so far`
          )}
          ${this.renderExecutiveGroup(
            'Visits',
            customerMain,
            customerLabel,
            attentionVisits > 0 ? 'negative' : 'positive',
            [
              { label: 'Visited', value: `${result.customerVisits.length}`, tone: 'neutral' },
              { label: 'Fully served', value: `${fulfilledVisits}`, tone: fulfilledVisits === result.customerVisits.length ? 'positive' : 'warning' },
              { label: 'Trust', value: `${Math.round(result.trust)}%`, tone: result.trustChange >= 0 ? 'positive' : 'negative' },
              { label: 'Khata visits', value: `${khataVisits}`, tone: khataVisits > 0 ? 'warning' : 'positive' },
            ],
            `Trust ${this.formatSignedNumber(result.trustChange)} pts today · regulars kept ${regularsKept}/${state.customers.length} · ${cashCrisisDays} cash crisis days`
          )}
          ${this.renderExecutiveGroup(
            'Rewards',
            rewardMain,
            'today score',
            rewardTone,
            [
              { label: 'Service', value: this.formatSignedNumber(result.rewardBreakdown.service), tone: result.rewardBreakdown.service >= 0 ? 'positive' : 'negative' },
              { label: 'Inventory', value: this.formatSignedNumber(result.rewardBreakdown.inventory), tone: result.rewardBreakdown.inventory >= 0 ? 'positive' : 'negative' },
              { label: 'Money', value: this.formatSignedNumber(result.rewardBreakdown.money), tone: result.rewardBreakdown.money >= 0 ? 'positive' : 'negative' },
              { label: 'Trust', value: this.formatSignedNumber(result.rewardBreakdown.relationships), tone: result.rewardBreakdown.relationships >= 0 ? 'positive' : 'negative' },
              { label: 'Marketing', value: this.formatSignedNumber(result.rewardBreakdown.marketing), tone: result.rewardBreakdown.marketing > 0 ? 'positive' : result.rewardBreakdown.marketing < 0 ? 'negative' : 'neutral' },
            ],
            rewardNote
          )}
        </div>

        ${this.renderCollapsibleInsightSignals(environment, aiInsightBlock, 'Environment signals')}
        ${this.renderInsightInventoryStatus(result, state)}
        ${this.renderMarketingBoard(state, state.day + 1)}
        ${this.renderInsightPlanDock(result, state)}
        ${this.renderInsightCustomerExceptions(result)}
        ${this.renderInventoryLedgerDetails(result)}

        <details class="score-details">
          <summary>
            <span>Today’s score</span>
            <strong class="${result.rewardBreakdown.total >= 0 ? 'positive' : 'negative'}">${this.formatSignedNumber(result.rewardBreakdown.total)}</strong>
            <em>Service, inventory, money, relationships, marketing, operations, and penalties</em>
          </summary>
          <div class="score-details-body">
            <div class="score-chip-row">
              ${this.renderScoreChip('Service', result.rewardBreakdown.service, 'positive')}
              ${this.renderScoreChip('Inventory', result.rewardBreakdown.inventory, 'positive')}
              ${this.renderScoreChip('Money', result.rewardBreakdown.money, 'positive')}
              ${this.renderScoreChip('Relationships', result.rewardBreakdown.relationships, 'positive')}
              ${this.renderScoreChip('Marketing', result.rewardBreakdown.marketing, result.rewardBreakdown.marketing > 0 ? 'positive' : result.rewardBreakdown.marketing < 0 ? 'negative' : 'neutral')}
              ${this.renderScoreChip('Operations', result.rewardBreakdown.operations, 'positive')}
              ${this.renderScoreChip('Penalties', result.rewardBreakdown.penalties, result.rewardBreakdown.penalties < 0 ? 'negative' : 'neutral')}
              ${this.renderScoreChip('Total', result.rewardBreakdown.total, result.rewardBreakdown.total >= 0 ? 'positive' : 'negative')}
            </div>
            <div class="score-details-meta">
              ${rewards.length > 0 ? `<span>Rewards: ${rewards.map((reward) => reward.title).join(', ')}</span>` : '<span>No new rewards today</span>'}
              <span>${result.difficulty.focus}</span>
            </div>
          </div>
        </details>
      </section>
    `;
  }

  private renderOpeningDecisionBrief(
    state: GameState,
    environment: EnvironmentSignalReport,
    dayContext?: LLMDayContext,
    aiInsightStatus: AIInsightStatus = dayContext ? 'ready' : 'loading'
  ): string {
    const orderCost = this.getOrderCost();
    const marketingCost = this.getMarketingCost();
    const totalPlanCost = orderCost + marketingCost;
    const cashAfterOrder = state.cash - totalPlanCost;
    const plannedUnits = Object.values(this.orderBasket).reduce((sum, qty) => sum + (qty ?? 0), 0);
    const plannedSkus = this.getOpeningStockLineCount();
    const projectedFridgeUnits = this.getProjectedOpeningFridgeUnits();
    const projectedFridgePct = Math.round((projectedFridgeUnits / state.config.fridgeCapacity) * 100);
    const possibleMargin = Object.entries(this.orderBasket).reduce((sum, [pid, qty]) => {
      const product = PRODUCTS.find((p) => p.id === pid);
      return sum + ((qty ?? 0) * ((product?.sellPrice ?? 0) - (product?.costPrice ?? 0)));
    }, 0);
    const reserveOk = cashAfterOrder >= this.cashReserve;
    const overBudget = cashAfterOrder < 0;
    const cashTone = overBudget ? 'negative' : reserveOk ? 'positive' : 'warning';
    const perishableSkus = PRODUCTS.filter((product) => (this.orderBasket[product.id] ?? 0) > 0 && product.category.includes('perishable')).length;
    const essentialSkus = PRODUCTS.filter((product) => (this.orderBasket[product.id] ?? 0) > 0 && product.category.includes('essential')).length;
    const regularCustomers = state.customers.filter((customer) => customer.segment === 'regular').length;
    const studentCustomers = state.customers.filter((customer) => customer.segment === 'student').length;
    const aiInsightBlock = dayContext
      ? this.renderCompactLLMDayContext(dayContext)
      : aiInsightStatus === 'loading'
        ? this.renderAIInsightLoader()
        : this.renderAIInsightPlaceholder();

    return `
      <section class="panel opening-decision-panel insight-brief-panel">
        <div class="decision-hero-bar opening-hero-bar">
          <div class="decision-title-lockup">
            <div class="decision-app-icon" aria-hidden="true">
              <span></span><span></span><span></span>
            </div>
            <div>
              <div class="case-eyebrow">Before Day 01</div>
              <h2 class="case-title">Opening Brief</h2>
            </div>
          </div>
          <div class="decision-status-chips">
            ${this.renderDecisionChip('Day', '01', 'calendar')}
            ${this.renderDecisionChip('Plan', environment.dayName, 'calendar')}
            ${this.renderDecisionChip('Weather', `${this.weatherLabel(environment.tomorrowWeather.weather)} ${environment.tomorrowWeather.temperature}°C`, environment.tomorrowWeather.weather === 'rainy' ? 'warning' : 'positive')}
            ${this.renderDecisionChip('Capital', `₹${state.cash.toLocaleString()}`, 'positive')}
            ${this.renderDecisionChip('After plan', `₹${Math.round(cashAfterOrder).toLocaleString()}`, cashTone)}
          </div>
        </div>

        <div class="decision-alert-banner opening-alert ${cashTone}">
          <div class="decision-weather-icon ${environment.tomorrowWeather.weather}" aria-hidden="true">${this.weatherIcon(environment.tomorrowWeather.weather)}</div>
          <div>
            <strong>Your first order sets Day 1 trust</strong>
            <span>Start with essentials, keep a cash buffer, then compare sold, missed, closing stock, khata, and score after the day ends.</span>
          </div>
        </div>

        <div class="executive-groups opening-metric-groups">
          ${this.renderExecutiveGroup(
            'Money',
            `₹${state.cash.toLocaleString()}`,
            'starting capital',
            cashTone,
            [
              { label: 'Plan cost', value: `₹${totalPlanCost.toLocaleString()}`, tone: totalPlanCost > 0 ? 'neutral' : 'warning' },
              { label: 'Cash after', value: `₹${Math.round(cashAfterOrder).toLocaleString()}`, tone: cashTone },
              { label: 'Reserve target', value: `₹${this.cashReserve.toLocaleString()}`, tone: reserveOk ? 'positive' : 'warning' },
              { label: 'Gross margin', value: `₹${possibleMargin.toLocaleString()}`, tone: possibleMargin > 0 ? 'positive' : 'neutral' },
            ],
            'Cash is your correction power for Day 2.'
          )}
          ${this.renderExecutiveGroup(
            'Shelves',
            `${plannedUnits}`,
            'units planned',
            plannedUnits > 0 ? 'positive' : 'negative',
            [
              { label: 'SKUs planned', value: `${plannedSkus}/${PRODUCTS.length}`, tone: plannedSkus > 0 ? 'positive' : 'negative' },
              { label: 'Essentials', value: `${essentialSkus}`, tone: essentialSkus >= 4 ? 'positive' : 'warning' },
              { label: 'Perishables', value: `${perishableSkus}`, tone: perishableSkus > 0 ? 'warning' : 'neutral' },
              { label: 'Fridge used', value: `${projectedFridgePct}%`, tone: projectedFridgePct <= 100 ? 'positive' : 'negative' },
            ],
            'Empty shelves miss demand; too much fresh stock can waste.'
          )}
          ${this.renderExecutiveGroup(
            'Customers',
            `${state.customers.length}`,
            'known patterns',
            'warning',
            [
              { label: 'Regulars', value: `${regularCustomers}`, tone: regularCustomers > 0 ? 'positive' : 'neutral' },
              { label: 'Students', value: `${studentCustomers}`, tone: studentCustomers > 0 ? 'warning' : 'neutral' },
              { label: 'Trust starts', value: `${state.trust}%`, tone: 'positive' },
              { label: 'Khata due', value: `₹${this.getTotalKhataDue(state).toLocaleString()}`, tone: 'positive' },
            ],
            'Regulars test essentials first; walk-ins still buy quick items.'
          )}
        </div>

        ${this.renderOpeningRewardsGuide({
          reserveOk,
          essentialSkus,
          perishableSkus,
          projectedFridgePct,
          marketingCost,
          plannedUnits,
        })}
        ${this.renderCollapsibleInsightSignals(environment, aiInsightBlock, 'Day 1 signals')}
        ${this.renderOpeningShelfPreview(state)}

        ${this.renderMarketingBoard(state, state.day)}
        ${this.renderOpeningPlanDock(state)}
        ${this.renderOpeningPlaybook()}
      </section>
    `;
  }

  private renderOpeningRewardsGuide(plan: {
    reserveOk: boolean;
    essentialSkus: number;
    perishableSkus: number;
    projectedFridgePct: number;
    marketingCost: number;
    plannedUnits: number;
  }): string {
    const serviceTone = plan.essentialSkus >= 4 ? 'positive' : 'warning';
    const inventoryTone = plan.perishableSkus > 3 || plan.projectedFridgePct > 100 ? 'warning' : 'positive';
    const moneyTone = plan.reserveOk ? 'positive' : 'warning';
    const marketingTone = plan.marketingCost > 0 ? 'warning' : 'neutral';

    return `
      <section class="opening-rewards-guide reward-guide">
        <div class="reward-guide-head">
          <div>
            <span>Rewards target</span>
            <strong>What Day 1 will score</strong>
          </div>
          <em>optimise before opening</em>
        </div>
        <div class="opening-reward-grid">
          ${this.renderOpeningRewardCard('Service', 'Serve full orders', `${plan.essentialSkus} essential SKUs planned`, serviceTone)}
          ${this.renderOpeningRewardCard('Inventory', 'Avoid stockouts and waste', `${plan.plannedUnits} units · ${plan.perishableSkus} perishables`, inventoryTone)}
          ${this.renderOpeningRewardCard('Money', 'Keep correction cash', plan.reserveOk ? 'Reserve protected' : 'Reserve is tight', moneyTone)}
          ${this.renderOpeningRewardCard('Relationships', 'Protect regular trust', 'Milk, bread, eggs matter early', serviceTone)}
          ${this.renderOpeningRewardCard('Marketing', 'Promote only served demand', plan.marketingCost > 0 ? `₹${plan.marketingCost.toLocaleString()} spend selected` : 'No campaign active', marketingTone)}
        </div>
      </section>
    `;
  }

  private renderOpeningRewardCard(
    label: string,
    target: string,
    status: string,
    tone: 'positive' | 'warning' | 'neutral'
  ): string {
    return `
      <article class="opening-reward-card ${tone}">
        <span>${label}</span>
        <strong>${target}</strong>
        <em>${status}</em>
      </article>
    `;
  }

  private renderOpeningPlaybook(): string {
    return `
      <section class="opening-playbook-panel">
        <div class="insight-panel-head">
          <div>
            <span>How one day works</span>
            <strong>Buy, sell, learn, correct</strong>
          </div>
          <em>30-day run</em>
        </div>
        <div class="opening-loop-grid" aria-label="Game loop">
          <div>
            <span>1</span>
            <strong>Read signals</strong>
            <em>Weather, weekday, customers, cash.</em>
          </div>
          <div>
            <span>2</span>
            <strong>Stock shelves</strong>
            <em>Balance essentials, snacks, perishables.</em>
          </div>
          <div>
            <span>3</span>
            <strong>Review case</strong>
            <em>Opening, sold, missed, closing, khata.</em>
          </div>
          <div>
            <span>4</span>
            <strong>Plan next day</strong>
            <em>Restock, remove, offer, remind.</em>
          </div>
        </div>
        <div class="opening-playbook-note">
          <strong>Goal</strong>
          <span>Protect trust and cash while learning demand from each day’s report.</span>
        </div>
      </section>
    `;
  }

  private renderOpeningShelfPreview(state: GameState): string {
    const plannedUnits = Object.values(this.orderBasket).reduce((sum, qty) => sum + (qty ?? 0), 0);
    const plannedSkus = this.getOpeningStockLineCount();

    return `
      <section class="opening-shelf-preview-panel">
        <div class="insight-panel-head">
          <div>
            <span>Opening Shelf Preview</span>
            <strong>What customers will see first</strong>
          </div>
          <em>${plannedSkus}/${PRODUCTS.length} SKUs · ${plannedUnits} units · ₹${this.getOrderCost().toLocaleString()} stock</em>
        </div>
        <div class="opening-shelf-preview-grid">
          ${PRODUCTS.map((product) => this.renderOpeningShelfPreviewCard(product, state)).join('')}
        </div>
      </section>
    `;
  }

  private renderOpeningShelfPreviewCard(product: (typeof PRODUCTS)[number], state: GameState): string {
    const qty = this.orderBasket[product.id] ?? 0;
    const unit = this.shortUnit(product.unit);
    const image = PRODUCT_IMAGE_BY_ID[product.id];
    const lineCost = qty * product.costPrice;
    const lineMargin = qty * product.margin;
    const status = qty > 0 ? 'planned' : 'empty';
    const capacityHint = product.storage === 'fridge'
      ? `Fridge ${Math.round((this.getProjectedOpeningFridgeUnits() / state.config.fridgeCapacity) * 100)}%`
      : product.category.includes('perishable')
        ? `${product.shelfLife} day life`
        : 'Shelf stable';

    return `
      <article class="opening-shelf-card ${status} trend-open-card" data-trend-product="${product.id}" tabindex="0" role="button" aria-label="View ${product.name} details">
        <div class="opening-shelf-art">
          ${image ? `<img src="${image}" alt="${product.name}" loading="lazy" />` : `<span>${product.name.slice(0, 2)}</span>`}
        </div>
        <div class="opening-shelf-card-body">
          <strong>${product.name}</strong>
          <div class="opening-shelf-qty">
            <span>${qty}</span>
            <em>${unit || product.unit}</em>
          </div>
          <small>${qty > 0 ? `Cost ₹${lineCost.toLocaleString()} · margin ₹${lineMargin.toLocaleString()} · ${capacityHint}` : `Margin ₹${product.margin}/${unit || product.unit}`}</small>
        </div>
      </article>
    `;
  }

  private renderCollapsibleInsightSignals(
    environment: EnvironmentSignalReport,
    aiInsightBlock: string,
    label: string
  ): string {
    const leadSignal = environment.customerSignals[0] ?? environment.calendarSignals[0] ?? 'Read weekday rhythm before buying.';
    const aiStatus = aiInsightBlock.includes('ai-insight-loading')
      ? 'AI loading'
      : aiInsightBlock.includes('ai-insight-empty')
        ? 'Shop records'
        : 'AI ready';

    return `
      <details class="insight-signal-drawer">
        <summary>
          <div>
            <span>${label}</span>
            <strong>${environment.dayName} · ${this.weatherLabel(environment.tomorrowWeather.weather)} ${environment.tomorrowWeather.temperature}°C</strong>
            <em>${environment.dateLabel} · ${environment.weekendText} · ${aiStatus}</em>
          </div>
          <span class="signal-expand-pill" aria-hidden="true">
            <i class="expand-label">Expand</i>
            <i class="collapse-label">Collapse</i>
          </span>
        </summary>
        <div class="insight-signal-drawer-body">
          <div class="insight-signal-lead">
            <strong>${leadSignal}</strong>
            <span>${environment.marketSignals[0] ?? 'Market pressure is normal.'}</span>
          </div>
          <div class="insight-weather-strip">
            ${environment.week.slice(0, 6).map((day) => this.renderInsightWeatherCard(day)).join('')}
          </div>
          <div class="insight-signal-stack">
            ${this.renderInsightSignalCard('Day rhythm', leadSignal)}
            ${this.renderInsightSignalCard('Market pressure', environment.marketSignals[0] ?? 'Prices stable. No urgency.')}
            ${this.renderInsightSignalCard('What to watch', [environment.marketSignals[1], environment.shopMemorySignals[0]].filter(Boolean).slice(0, 2).join(' · ') || 'Compare closing stock with missed demand before ordering.')}
          </div>
          ${aiInsightBlock}
        </div>
      </details>
    `;
  }

  private renderInsightWeatherCard(day: WeatherOutlookDay): string {
    return `
      <div class="insight-weather-card ${day.weather} ${day.tag === 'Tomorrow' ? 'tomorrow' : ''}">
        <span>${day.dayName.slice(0, 3)}</span>
        <strong>${this.weatherIcon(day.weather)}</strong>
        <em>${this.weatherLabel(day.weather)} ${day.temperature}°</em>
      </div>
    `;
  }

  private renderInsightSignalCard(title: string, value: string): string {
    return `
      <article class="insight-signal-card">
        <strong>${title}</strong>
        <span>${value}</span>
      </article>
    `;
  }

  private renderCompactLLMDayContext(context: LLMDayContext): string {
    return `
      <article class="llm-context-panel ai-insight-panel ai-insight-compact ai-insight-decision">
        <div class="llm-context-head">
          <div>
            <span>AI decision points</span>
            <strong>${context.dayTheme}</strong>
            <em>Use these as clues, then decide stock and cash yourself.</em>
          </div>
          ${context.model ? `<small>${context.model}</small>` : ''}
        </div>
        ${this.renderAIDecisionPoints(context)}
        ${this.renderAIRiskNotes(context, 3)}
        <details class="ai-compact-details">
          <summary>More AI context</summary>
          <div class="llm-context-grid">
            ${this.renderLLMContextList('Neighborhood', context.neighborhoodSignals)}
            ${this.renderLLMContextList('Customer mood', context.customerMoodSignals)}
            ${this.renderLLMContextList('Market cues', context.marketSignals)}
            ${this.renderLLMContextList('Visual cues', context.visualCues)}
          </div>
        </details>
      </article>
    `;
  }

  private renderAIDecisionPoints(context: LLMDayContext): string {
    const points = [
      { title: 'Focus', value: context.planningFocus, tone: 'focus' },
      { title: 'Customers', value: context.customerMoodSignals[0] ?? context.neighborhoodSignals[0], tone: 'customer' },
      { title: 'Market', value: context.marketSignals[0] ?? context.neighborhoodSignals[1], tone: 'market' },
      { title: 'Shelf cue', value: context.visualCues[0] ?? context.localNarrative, tone: 'shelf' },
    ].filter((point): point is { title: string; value: string; tone: string } => Boolean(point.value));

    return `
      <div class="ai-decision-point-grid">
        ${points.map((point) => `
          <div class="ai-decision-point ${point.tone}">
            <strong>${point.title}</strong>
            <span>${this.compactInsightText(point.value)}</span>
          </div>
        `).join('')}
      </div>
    `;
  }

  private renderAIRiskNotes(context: LLMDayContext, limit = 4): string {
    const notes = context.riskNotes.slice(0, limit);
    if (notes.length === 0) return '';
    return `
      <div class="llm-risk-notes ai-risk-strip">
        ${notes.map((note) => `<span>${this.compactInsightText(note, 110)}</span>`).join('')}
      </div>
    `;
  }

  private compactInsightText(value: string, maxLength = 130): string {
    const normalized = value.replace(/^\s+/, '').replace(/^-+\s*/, '').replace(/\s+/g, ' ').trim();
    const firstSentence = normalized.match(/^(.+?[.!?])(\s|$)/)?.[1] ?? normalized;
    return firstSentence.length > maxLength
      ? `${firstSentence.slice(0, maxLength - 3).trim()}...`
      : firstSentence;
  }

  private renderLLMContextList(title: string, signals: string[]): string {
    return `
      <div>
        <strong>${title}</strong>
        <ul>
          ${signals.slice(0, 3).map((signal) => `<li>${signal}</li>`).join('')}
        </ul>
      </div>
    `;
  }

  private renderAIInsightLoader(): string {
    return `
      <article class="llm-context-panel ai-insight-panel ai-insight-loading" aria-live="polite">
        <div class="llm-context-head">
          <div>
            <span>AI decision points</span>
            <strong>Reading ${STORE_SHORT_NAME}’s day</strong>
            <em>Preparing short stocking and customer-risk clues.</em>
          </div>
          <small>Loading</small>
        </div>
        <div class="ai-loading-body">
          <div class="ai-loading-spinner" aria-hidden="true"></div>
          <div>
            <strong>Building point summary</strong>
            <span>Weather, customers, inventory, khata, and recent memory.</span>
          </div>
        </div>
        <div class="ai-skeleton-grid" aria-hidden="true">
          <span></span><span></span><span></span><span></span>
        </div>
      </article>
    `;
  }

  private renderAIInsightPlaceholder(): string {
    return `
      <article class="llm-context-panel ai-insight-panel ai-insight-empty">
        <div class="llm-context-head">
          <div>
            <span>AI decision points</span>
            <strong>Using shop records only</strong>
            <em>AI was unavailable, so use deterministic clues.</em>
          </div>
        </div>
        <div class="ai-decision-point-grid">
          <div class="ai-decision-point focus">
            <strong>Weather</strong>
            <span>Read tomorrow’s forecast before buying perishable stock.</span>
          </div>
          <div class="ai-decision-point customer">
            <strong>Customers</strong>
            <span>Check missed orders and khata before choosing marketing.</span>
          </div>
          <div class="ai-decision-point market">
            <strong>Inventory</strong>
            <span>Restock missed essentials first, then snacks and offers.</span>
          </div>
          <div class="ai-decision-point shelf">
            <strong>Cash</strong>
            <span>Keep a buffer after ordering so tomorrow can be corrected.</span>
          </div>
        </div>
      </article>
    `;
  }

  private renderInsightCustomerExceptions(result: DayResult): string {
    const attentionVisits = result.customerVisits.filter((visit) => visit.outcome !== 'fulfilled');
    const khataVisits = result.customerVisits.filter((visit) => visit.paymentMode === 'khata');
    const fulfilledVisits = result.customerVisits.filter((visit) => visit.outcome === 'fulfilled');
    const priorityVisits = [
      ...attentionVisits,
      ...khataVisits.filter((visit) => !attentionVisits.includes(visit)),
    ];
    const visibleVisits = [
      ...(priorityVisits.length > 0 ? priorityVisits : fulfilledVisits),
    ].slice(0, 3);
    const hiddenVisits = Math.max(0, result.customerVisits.length - visibleVisits.length);

    return `
      <section class="insight-customer-panel">
        <div class="insight-panel-head">
          <div>
            <span>Customer Exceptions</span>
            <strong>${attentionVisits.length > 0 ? `${attentionVisits.length} cases need attention` : 'All visible cases served'}</strong>
          </div>
          <em>${result.customerVisits.length} visits · ${khataVisits.length} khata</em>
        </div>
        <div class="insight-customer-list">
          ${visibleVisits.length > 0
            ? visibleVisits.map((visit) => this.renderInsightCustomerRow(visit)).join('')
            : '<div class="insight-empty-note">No customer visits recorded today.</div>'}
        </div>
        ${hiddenVisits > 0 ? `<div class="insight-more-note">Full customer ledger has ${hiddenVisits} more visits.</div>` : ''}
      </section>
    `;
  }

  private renderInsightCustomerRow(visit: CustomerVisit): string {
    const missed = visit.missed.length > 0 ? this.formatOrderLines(visit.missed, true) : 'Nothing missed';
    const asked = this.formatOrderLines(visit.requested, true);
    const trustText = visit.trustDelta === 0 ? 'Trust steady' : `Trust ${this.formatSignedNumber(visit.trustDelta)}`;
    const reasonText = this.formatVisitReasonText(visit);

    return `
      <article class="insight-customer-row ${visit.outcome}">
        <div class="insight-customer-main">
          <div>
            <strong>${visit.customerName}</strong>
            <span>${this.segmentLabel(visit.segment)} · ${this.titleCase(visit.wave)}</span>
          </div>
          <em>${this.outcomeLabel(visit.outcome)}</em>
        </div>
        <p>Asked: ${asked}</p>
        ${reasonText ? `
          <div class="visit-reason-line">
            <strong>Why</strong>
            <span>${reasonText}</span>
          </div>
        ` : ''}
        <div class="insight-customer-foot">
          <span class="${visit.missed.length > 0 ? 'negative' : 'positive'}">${missed}</span>
          <span>${this.formatPayment(visit)}</span>
          <span>${trustText}</span>
        </div>
      </article>
    `;
  }

  private renderInsightInventoryStatus(result: DayResult, state: GameState): string {
    const rows = PRODUCTS.map((product) => {
      const inventory = state.getProductInventory(product.id);
      const currentStock = inventory?.totalStock ?? 0;
      const movement = result.inventoryMovements.find((row) => row.productId === product.id);
      const perishability = this.getCurrentPerishability(product.id, state);
      const status = this.getInventoryCardStatus(product.id, result, state);
      const priority = status === 'stockout'
        ? 0
        : status === 'empty'
          ? 1
          : status === 'perishable'
            ? 2
            : status === 'low'
              ? 3
              : 4;

      return { product, currentStock, movement, perishability, status, priority };
    }).sort((a, b) => {
      const missedDiff = (b.movement?.missedDemand ?? 0) - (a.movement?.missedDemand ?? 0);
      return a.priority - b.priority || missedDiff || a.currentStock - b.currentStock;
    });

    return `
      <section class="insight-inventory-panel">
        <div class="insight-panel-head">
          <div>
            <span>Shelf Check</span>
            <strong>Closing stock after today’s visits</strong>
          </div>
          <div class="inventory-status-legend">
            <span><i class="legend-dot positive"></i>Good</span>
            <span><i class="legend-dot warning"></i>Low / Risk</span>
            <span><i class="legend-dot negative"></i>Stockout</span>
          </div>
        </div>
        <div class="insight-inventory-grid">
          ${rows.map((row) => this.renderInsightInventoryCard(row.product, row.currentStock, row.movement, row.perishability, row.status)).join('')}
        </div>
        <div class="insight-guidance-strip">
          ${this.renderInsightGuidanceChip('Restock essentials', this.getTotalMissedDemand(result) > 0 ? 'negative' : 'positive')}
          ${this.renderInsightGuidanceChip('Keep cash buffer', result.cash >= this.cashReserve ? 'positive' : 'warning')}
          ${this.renderInsightGuidanceChip('Watch perishables', rows.some((row) => row.status === 'perishable') ? 'warning' : 'positive')}
          ${this.renderInsightGuidanceChip('Follow khata', this.getTotalKhataDue(state) > 0 ? 'warning' : 'positive')}
        </div>
      </section>
    `;
  }

  private renderInsightInventoryCard(
    product: (typeof PRODUCTS)[number],
    currentStock: number,
    movement: DayResult['inventoryMovements'][number] | undefined,
    perishability: PerishabilitySnapshot,
    status: InventoryCardStatus
  ): string {
    const unit = this.shortUnit(product.unit);
    const image = PRODUCT_IMAGE_BY_ID[product.id];
    const statusLabel = this.getInsightInventoryStatusLabel(status);
    const unitLabel = unit || product.unit;

    return `
      <article class="insight-inventory-card ${status} trend-open-card" data-trend-product="${product.id}" tabindex="0" role="button" aria-label="View ${product.name} trend">
        <div class="insight-item-art">
          ${image ? `<img src="${image}" alt="${product.name}" loading="lazy" />` : `<span>${product.name.slice(0, 2)}</span>`}
        </div>
        <div class="insight-item-body">
          <div class="insight-item-head">
            <div>
              <strong>${product.name}</strong>
              <span>${product.storage} · ₹${product.margin}/${unitLabel} margin · ${product.trustImpact} trust</span>
            </div>
            <em>${statusLabel}</em>
          </div>
          <button class="trend-link-btn" type="button" data-trend-open="${product.id}">View trend</button>
          <div class="insight-stock-line">
            <strong>${currentStock}</strong>
            <span>${unit || product.unit}</span>
          </div>
          <div class="insight-item-facts">
            <div>
              <span>Sold</span>
              <strong>${movement?.sold ?? 0}</strong>
            </div>
            <div>
              <span>Missed</span>
              <strong class="${(movement?.missedDemand ?? 0) > 0 ? 'negative' : 'positive'}">${movement?.missedDemand ?? 0}</strong>
            </div>
            <div>
              <span>Waste</span>
              <strong class="${(movement?.wasted ?? 0) > 0 ? 'negative' : ''}">${movement?.wasted ?? 0}</strong>
            </div>
            <div>
              <span>Margin</span>
              <strong class="positive">₹${product.margin}/${unitLabel}</strong>
            </div>
          </div>
          ${this.renderInsightFreshness(perishability)}
        </div>
      </article>
    `;
  }

  private renderInsightFreshness(perishability: PerishabilitySnapshot): string {
    if (!perishability.tracked) {
      return `
        <div class="insight-freshness stable">
          <span>Long shelf life</span>
          <strong>${perishability.statusLabel}</strong>
        </div>
      `;
    }

    return `
      <div class="insight-freshness ${perishability.status}">
        <div>
          <span>Freshness</span>
          <strong>${perishability.statusLabel}</strong>
        </div>
        <div class="insight-freshness-track" aria-label="${perishability.averageFreshness}% fresh">
          <span style="width: ${Math.max(5, Math.min(100, perishability.averageFreshness))}%"></span>
        </div>
        <em>${perishability.riskUnits} risk units · ₹${perishability.wasteRiskCost.toLocaleString()}</em>
      </div>
    `;
  }

  private renderInsightGuidanceChip(label: string, tone: 'positive' | 'warning' | 'negative'): string {
    return `<span class="insight-guidance-chip ${tone}">${label}</span>`;
  }

  private getInventoryCardStatus(productId: ProductId, result: DayResult, state: GameState): InventoryCardStatus {
    const product = PRODUCTS.find((p) => p.id === productId)!;
    const currentStock = state.getProductInventory(productId)?.totalStock ?? 0;
    const movement = result.inventoryMovements.find((row) => row.productId === productId);
    const perishability = this.getCurrentPerishability(productId, state);

    if ((movement?.missedDemand ?? 0) > 0) return 'stockout';
    if (currentStock <= 0) return 'empty';
    if (perishability.status === 'high' || perishability.status === 'expired') return 'perishable';
    if (currentStock < product.baseDemand * 0.4) return 'low';
    return 'healthy';
  }

  private getInsightInventoryStatusLabel(status: InventoryCardStatus): string {
    const labels = {
      healthy: 'Healthy',
      low: 'Low stock',
      empty: 'Empty',
      stockout: 'Missed demand',
      perishable: 'Freshness risk',
    };

    return labels[status];
  }

  private renderInitialBudgetPanel(state: GameState): string {
    const orderCost = this.getOrderCost();
    const marketingCost = this.getMarketingCost();
    const totalPlanCost = orderCost + marketingCost;
    const cashAfter = state.cash - totalPlanCost;
    const overBudget = cashAfter < 0;
    const reserveOk = cashAfter >= this.cashReserve;
    const selectedItems = this.getOpeningStockLineCount();
    const projectedFridgeUnits = this.getProjectedOpeningFridgeUnits();
    const projectedFridgePct = Math.round((projectedFridgeUnits / state.config.fridgeCapacity) * 100);
    const possibleMargin = Object.entries(this.orderBasket).reduce((sum, [pid, qty]) => {
      const product = PRODUCTS.find((p) => p.id === pid);
      return sum + ((qty ?? 0) * ((product?.sellPrice ?? 0) - (product?.costPrice ?? 0)));
    }, 0);
    const canOpen = orderCost > 0 && !overBudget;
    const cashTone = overBudget ? 'negative' : reserveOk ? 'positive' : 'warning';
    const guidance = overBudget
      ? 'Reduce the order. The supplier cannot fill a plan above your cash.'
      : orderCost === 0
        ? 'Add stock before opening. Empty shelves will miss every demand.'
        : reserveOk
          ? 'This plan keeps a correction buffer for Day 2.'
          : 'Playable, but your correction buffer is thin after opening stock.';

    return `
        <div class="initial-summary-sticky">
          <div class="panel-header">Opening Budget</div>
          <div class="initial-budget-hero ${cashTone}">
          <span>Cash after saved cart</span>
          <strong>₹${Math.round(cashAfter).toLocaleString()}</strong>
          <em>${guidance}</em>
        </div>

        <div class="initial-budget-grid">
          <div>
            <span>Capital</span>
            <strong>₹${state.cash.toLocaleString()}</strong>
          </div>
          <div>
            <span>Wholesaler cart</span>
            <strong>₹${orderCost.toLocaleString()}</strong>
          </div>
          <div>
            <span>Marketing cost</span>
            <strong>₹${marketingCost.toLocaleString()}</strong>
          </div>
          <div>
            <span>Total plan cost</span>
            <strong>₹${totalPlanCost.toLocaleString()}</strong>
          </div>
          <div>
            <span>Cash reserve target</span>
            <strong>₹${this.cashReserve.toLocaleString()}</strong>
          </div>
          <div>
            <span>Selected SKUs</span>
            <strong>${selectedItems}/${PRODUCTS.length}</strong>
          </div>
          <div>
            <span>Fridge used</span>
            <strong>${projectedFridgePct}%</strong>
          </div>
          <div>
            <span>Gross margin if sold</span>
            <strong>₹${possibleMargin.toLocaleString()}</strong>
          </div>
        </div>

        <div class="initial-stock-note">
          <strong>After Day 1</strong>
          <span>The case report will show opening stock, goods sold, missed demand, closing stock, customer outcomes, khata, cash, and score.</span>
        </div>

        <div class="initial-summary-actions">
          <button class="btn btn-outline" id="btn-starter-mix">Starter Mix</button>
          <button class="btn btn-outline" id="btn-clear-initial">Clear</button>
          <button class="btn btn-success initial-open-btn" id="btn-open-day-one" ${canOpen ? '' : 'disabled'}>
            Open Shop for Day 1
          </button>
        </div>
      </div>
    `;
  }

  private renderOpeningPlanDock(state: GameState): string {
    return `
      <section class="insight-plan-dock opening-plan-dock" id="opening-plan-dock">
        <div class="decision-rail-head">
          <span>Opening plan</span>
          <strong>Cash, shelf mix, and first impression</strong>
          <em>Balance shelf depth with enough cash for tomorrow.</em>
        </div>
        ${this.renderInitialBudgetPanel(state)}
      </section>
    `;
  }

  private renderInsightPlanDock(result: DayResult, state: GameState): string {
    const isFinalDay = state.day >= DEFAULT_CONFIG.maxDays;
    const canOpenNextDay = this.isPlanAffordable(state);
    return `
      <section class="insight-plan-dock" id="insight-plan-dock">
          <div class="case-section-head">
            <div>
              <div class="panel-header">${isFinalDay ? 'End of Simulation' : `Tomorrow Plan · Day ${state.day + 1}`}</div>
            <h3>${isFinalDay ? 'Close the books' : 'Saved cart, rewards, khata, and commitments'}</h3>
            </div>
          ${!isFinalDay ? `<div class="case-section-meta">Add item changes to the wholesaler cart first; opening the next day uses only saved choices.</div>` : ''}
        </div>
        ${isFinalDay ? this.renderFinalDayAction() : `
          ${this.renderInventoryDiagnosticStrip(result, state)}
          <div class="insight-plan-grid">
            <div class="insight-plan-main">
              ${this.renderActionRewardGuide(result, state)}
              ${this.renderKhataReminderControls(state)}
            </div>
          </div>
          <aside class="decision-bottom-bar" aria-label="Plan summary">
            <div class="decision-bottom-copy">
              <span>Saved plan</span>
              <strong>Open Day ${state.day + 1}</strong>
              <em>Only saved cart choices are ordered.</em>
            </div>
            ${this.renderPlanSummary(state)}
            <div class="decision-bottom-actions">
              ${this.planError ? `<div class="case-submit-note negative">${this.planError}</div>` : `
                <div class="case-submit-note ${canOpenNextDay ? '' : 'negative'}">
                  ${canOpenNextDay
                    ? 'Review saved decisions, then open the next day.'
                    : 'Plan is above available cash. Reduce cart or marketing spend first.'}
                </div>
              `}
              <button class="btn btn-success case-submit-btn" id="btn-submit-case-plan" ${canOpenNextDay ? '' : 'disabled'}>
                OPEN NEXT DAY
              </button>
            </div>
          </aside>
        `}
      </section>
    `;
  }

  private renderInventoryLedgerDetails(result: DayResult): string {
    return `
      <details class="score-details inventory-ledger-details">
        <summary>
          <span>Full inventory ledger</span>
          <strong>${this.getTotalItemsSold(result)} sold · ${this.getTotalMissedDemand(result)} missed</strong>
          <em>Opening, sold, closing, missed demand, waste, and offers</em>
        </summary>
        <div class="score-details-body">
          ${this.renderInventoryMovementTable(result)}
        </div>
      </details>
    `;
  }

  private renderExecutiveGroup(
    title: string,
    mainValue: string,
    mainLabel: string,
    tone: 'positive' | 'negative' | 'warning' | 'neutral',
    stats: Array<{ label: string; value: string; tone: 'positive' | 'negative' | 'warning' | 'neutral' }>,
    note: string
  ): string {
    const titleClass = title.toLowerCase().replace(/\s+/g, '-');
    return `
      <article class="executive-group ${tone} ${titleClass}">
        <div class="executive-group-title">${title}</div>
        <div class="executive-group-main">
          <strong>${mainValue}</strong>
          <span>${mainLabel}</span>
        </div>
        <div class="executive-group-stats">
          ${stats.map((stat) => `
            <div class="${stat.tone}">
              <span>${stat.label}</span>
              <strong>${stat.value}</strong>
            </div>
          `).join('')}
        </div>
        <p>${note}</p>
      </article>
    `;
  }

  private renderScoreChip(label: string, value: number, tone: 'positive' | 'negative' | 'neutral'): string {
    return `
      <div class="score-chip ${tone}">
        <span>${label}</span>
        <strong>${value >= 0 ? '+' : ''}${value}</strong>
      </div>
    `;
  }

  private renderInventoryDiagnosticStrip(result: DayResult, state: GameState): string {
    const stockedSkus = PRODUCTS.filter((product) => (state.getProductInventory(product.id)?.totalStock ?? 0) > 0).length;
    const emptySkus = PRODUCTS.length - stockedSkus;
    const missedUnits = this.getTotalMissedDemand(result);
    const soldUnits = this.getTotalItemsSold(result);
    const perishableWatch = PRODUCTS.filter((product) => {
      const snapshot = this.getCurrentPerishability(product.id, state);
      return snapshot.tracked && ['watch', 'high', 'expired'].includes(snapshot.status);
    }).length;
    const riskCost = result.inventoryMovements.reduce((sum, row) => sum + row.perishability.wasteRiskCost, 0);

    return `
      <div class="inventory-diagnostic-strip">
        ${this.renderInventoryDiagnosticCard('Stocked SKUs', `${stockedSkus}/${PRODUCTS.length}`, `${emptySkus} empty shelves`, emptySkus > 0 ? 'warning' : 'positive')}
        ${this.renderInventoryDiagnosticCard('Sold today', `${soldUnits}`, 'Units fulfilled from shelf', soldUnits > 0 ? 'positive' : 'neutral')}
        ${this.renderInventoryDiagnosticCard('Missed demand', `${missedUnits}`, 'Units customers could not buy', missedUnits > 0 ? 'negative' : 'positive')}
        ${this.renderInventoryDiagnosticCard('Freshness watch', `${perishableWatch}`, `₹${riskCost.toLocaleString()} possible waste`, perishableWatch > 0 ? 'warning' : 'positive')}
      </div>
    `;
  }

  private renderInventoryDiagnosticCard(
    label: string,
    value: string,
    note: string,
    tone: 'positive' | 'warning' | 'negative' | 'neutral'
  ): string {
    return `
      <article class="inventory-diagnostic-card ${tone}">
        <span>${label}</span>
        <strong>${value}</strong>
        <em>${note}</em>
      </article>
    `;
  }

  private renderInventoryMovementTable(result: DayResult): string {
    return `
      <section class="panel case-panel balance-panel">
        <div class="case-section-head">
          <div>
            <div class="panel-header">Inventory Performance</div>
            <h3>What sold, what missed</h3>
          </div>
          <div class="case-section-meta inventory-summary-meta">
            <span>Sold ${this.getTotalItemsSold(result)} units · Missed ${this.getTotalMissedDemand(result)} units</span>
            <span class="inventory-legend">
              <i class="legend-dot positive"></i> Healthy
              <i class="legend-dot warning"></i> Watch
              <i class="legend-dot negative"></i> Action needed
            </span>
          </div>
        </div>
        <div class="table-scroll">
          <table class="case-table inventory-case-table">
            <thead>
              <tr>
                <th>Inventory</th>
                <th>Opening Shelf</th>
                <th>Sold</th>
                <th>Closing</th>
                <th>Missed Demand</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              ${result.inventoryMovements.map((row) => this.renderInventoryMovementRow(row)).join('')}
            </tbody>
          </table>
        </div>
      </section>
    `;
  }

  private renderInventoryMovementRow(row: DayResult['inventoryMovements'][number]): string {
    const product = PRODUCTS.find((p) => p.id === row.productId);
    const unit = this.shortUnit(product?.unit ?? '');
    const unitText = unit ? ` ${unit}` : '';
    const rowStatus = this.getInventoryRowStatus(row, product);
    const statusLabel = this.getInventoryStatusLabel(rowStatus);
    const openingShelf = this.getOpeningShelf(row);
    const sellThroughBase = Math.max(openingShelf, row.sold, 1);
    const sellThroughPct = Math.min(100, Math.round((row.sold / sellThroughBase) * 100));
    const closingTone = rowStatus === 'stockout' || rowStatus === 'empty'
      ? 'negative'
      : rowStatus === 'low'
        ? 'warning'
        : 'positive';

    return `
      <tr class="${rowStatus}-row">
        <td class="inventory-product-cell">
          <strong>${product?.name ?? row.productId}</strong>
          <span class="inventory-status-pill ${rowStatus}">${statusLabel}</span>
        </td>
        <td>${this.renderInventoryValue(openingShelf, unitText, 'neutral')}</td>
        <td>
          ${this.renderInventoryValue(row.sold, unitText, row.sold > 0 ? 'positive' : 'quiet')}
          <div class="sell-through" aria-label="${sellThroughPct}% sell-through">
            <span style="width: ${sellThroughPct}%"></span>
          </div>
          <em>${sellThroughPct}% sell-through</em>
        </td>
        <td>${this.renderInventoryValue(row.closing, unitText, closingTone)}</td>
        <td>${this.renderInventoryValue(row.missedDemand, unitText, row.missedDemand > 0 ? 'negative' : 'positive')}</td>
        <td>
          <details class="inventory-row-details">
            <summary>${statusLabel}</summary>
            <div>
              <span>Previous close ${row.opening}${unitText}</span>
              <span>Ordered ${row.ordered}${unitText}</span>
              <span>Removed ${row.removed}${unitText}</span>
              <span>Opening shelf ${openingShelf}${unitText}</span>
              <span>${row.offerPct > 0 ? `${row.offerPct}% offer active` : 'No offer active'}</span>
              ${this.renderInventoryPerishabilitySpans(row.perishability, unitText)}
            </div>
          </details>
        </td>
      </tr>
    `;
  }

  private renderInventoryPerishabilitySpans(perishability: PerishabilitySnapshot, unitText: string): string {
    if (!perishability.tracked) return '';
    const riskText = perishability.atRiskUnits > 0 || perishability.expiredUnits > 0
      ? `${perishability.atRiskUnits + perishability.expiredUnits}${unitText} at risk`
      : `${perishability.averageFreshness}% fresh`;

    return `
      <span>${perishability.statusLabel}</span>
      <span>${riskText} · ₹${perishability.wasteRiskCost.toLocaleString()}</span>
    `;
  }

  private getInventoryRowStatus(
    row: DayResult['inventoryMovements'][number],
    product?: (typeof PRODUCTS)[number]
  ): 'healthy' | 'low' | 'empty' | 'stockout' {
    if (row.missedDemand > 0) return 'stockout';
    if (row.closing <= 0) return 'empty';
    if (row.closing < (product?.baseDemand ?? 1) * 0.4) return 'low';
    return 'healthy';
  }

  private getInventoryStatusLabel(status: 'healthy' | 'low' | 'empty' | 'stockout'): string {
    const labels = {
      healthy: 'Stock healthy',
      low: 'Low closing',
      empty: 'Closed empty',
      stockout: 'Demand missed',
    };

    return labels[status];
  }

  private renderInventoryValue(
    value: number,
    unitText: string,
    tone: 'neutral' | 'quiet' | 'positive' | 'warning' | 'negative'
  ): string {
    return `<span class="inv-value ${tone}">${value}${unitText}</span>`;
  }

  private renderActionRewardGuide(result: DayResult, state: GameState): string {
    const orderCost = this.getOrderCost();
    const marketingCost = this.getMarketingCost();
    const cashAfter = state.cash - orderCost - marketingCost;
    const reserveOk = cashAfter >= this.cashReserve;
    const missedUnits = this.getTotalMissedDemand(result);
    const missedRevenue = this.getMissedRevenue(result);
    const khataDue = this.getTotalKhataDue(state);
    const riskCost = result.inventoryMovements.reduce((sum, row) => sum + row.perishability.wasteRiskCost, 0);
    const marketingHint = this.getMarketingRewardHint(result, marketingCost);

    return `
      <div class="reward-guide">
        <div class="reward-guide-head">
          <div>
            <span>Score levers</span>
            <strong>What this plan is trying to improve</strong>
          </div>
          <em>${reserveOk ? 'Cash buffer OK' : 'Cash buffer tight'}</em>
        </div>
        <div class="score-grid">
          ${this.renderScoreBucket('Service', result.rewardBreakdown.service, 'Serve full orders', missedUnits > 0 ? 'negative' : 'positive')}
          ${this.renderScoreBucket('Inventory', result.rewardBreakdown.inventory, 'Avoid stockouts and waste', result.stockouts > 0 || riskCost > 0 ? 'warning' : 'positive')}
          ${this.renderScoreBucket('Money', result.rewardBreakdown.money, 'Keep cash after order healthy', reserveOk ? 'positive' : 'negative')}
          ${this.renderScoreBucket('Relationships', result.rewardBreakdown.relationships, 'Protect regular trust', result.trustChange >= 0 ? 'positive' : 'negative')}
          ${this.renderScoreBucket('Marketing', result.rewardBreakdown.marketing, 'Serve promoted demand profitably', this.getMarketingScoreTone(result.rewardBreakdown.marketing))}
          ${this.renderScoreBucket('Penalties', result.rewardBreakdown.penalties, 'Stockout, waste, cash crisis', result.rewardBreakdown.penalties < 0 ? 'negative' : 'positive')}
          ${this.renderScoreBucket('Total', result.rewardBreakdown.total, 'Today outcome', result.rewardBreakdown.total >= 0 ? 'positive' : 'negative')}
        </div>
        <div class="reward-hint-list">
          ${this.renderRewardHint('Restock missed demand', `${missedUnits} units missed today · ₹${missedRevenue.toLocaleString()} possible sales lost`, missedUnits > 0 ? 'negative' : 'positive')}
          ${this.renderRewardHint('Do not trap cash', `Cash after order + marketing: ₹${Math.round(cashAfter).toLocaleString()} · reserve target ₹${this.cashReserve.toLocaleString()}`, reserveOk ? 'positive' : 'warning')}
          ${this.renderRewardHint('Watch freshness', riskCost > 0 ? `Perishable exposure is ₹${riskCost.toLocaleString()}` : 'No material perishability exposure', riskCost > 0 ? 'warning' : 'positive')}
          ${this.renderRewardHint('Follow khata', khataDue > 0 ? `₹${khataDue.toLocaleString()} pending with customers` : 'No pending khata today', khataDue > 0 ? 'warning' : 'positive')}
          ${this.renderRewardHint('Marketing impact', marketingHint.value, marketingHint.tone)}
        </div>
      </div>
    `;
  }

  private renderScoreBucket(label: string, value: number, note: string, tone: 'positive' | 'negative' | 'warning'): string {
    return `
      <div class="score-bucket ${tone}">
        <span>${label}</span>
        <strong>${this.formatSignedNumber(value)}</strong>
        <em>${note}</em>
      </div>
    `;
  }

  private renderRewardHint(label: string, value: string, tone: 'positive' | 'negative' | 'warning'): string {
    return `
      <div class="reward-hint ${tone}">
        <span>${label}</span>
        <strong>${value}</strong>
      </div>
    `;
  }

  private getMarketingRewardHint(
    result: DayResult,
    selectedMarketingCost: number
  ): { value: string; tone: 'positive' | 'negative' | 'warning' } {
    const performance = result.marketingPerformance ?? this.getEmptyMarketingPerformance();
    if (performance.activeCampaigns <= 0) {
      return selectedMarketingCost > 0
        ? { value: `₹${selectedMarketingCost.toLocaleString()} campaign spend selected. Effect starts later.`, tone: 'warning' }
        : { value: 'No marketing active.', tone: 'positive' };
    }

    const roi = this.formatMarketingRoi(performance.roi);
    if (performance.score > 0) {
      return {
        value: `Campaign served demand profitably: ${roi} ROI · ₹${performance.targetGrossMargin.toLocaleString()} target margin · ${this.formatSignedNumber(performance.score)} score`,
        tone: 'positive',
      };
    }
    if (performance.score < 0) {
      return {
        value: `Campaign created missed promoted demand: ${performance.missedTargetUnits} units missed · ${this.formatSignedNumber(performance.score)} score`,
        tone: 'negative',
      };
    }
    return {
      value: `Campaign impact neutral: ${roi} ROI · ${performance.servedTargetUnits} served · ${performance.missedTargetUnits} missed`,
      tone: 'warning',
    };
  }

  private getEmptyMarketingPerformance(): DayResult['marketingPerformance'] {
    return {
      activeCampaigns: 0,
      spendToday: 0,
      allocatedActiveCost: 0,
      targetVisits: 0,
      servedTargetUnits: 0,
      missedTargetUnits: 0,
      targetGrossMargin: 0,
      roi: 0,
      promotedStockoutSkus: [],
      score: 0,
    };
  }

  private getMarketingScoreTone(score: number): 'positive' | 'negative' | 'warning' {
    if (score > 0) return 'positive';
    if (score < 0) return 'negative';
    return 'warning';
  }

  private formatMarketingRoi(roi: number): string {
    return `${Number.isFinite(roi) ? roi.toFixed(1) : '0.0'}x`;
  }

  private renderFinalDayAction(): string {
    return `
      <div class="plan-empty">
        The 30-day run is complete. Review the final scoreboard.
      </div>
      <button class="btn btn-primary case-submit-btn" id="btn-submit-case-plan">
        VIEW FINAL SCORE
      </button>
    `;
  }

  private renderPerishabilitySignal(perishability: PerishabilitySnapshot, unit: string): string {
    const totalUnits = perishability.freshUnits + perishability.agingUnits + perishability.atRiskUnits + perishability.expiredUnits;
    if (!perishability.tracked) return '';

    const unitLabel = this.shortUnit(unit);
    const riskUnits = perishability.atRiskUnits + perishability.expiredUnits;
    const detail = totalUnits <= 0
      ? 'No risk'
      : riskUnits > 0
        ? `${riskUnits} ${unitLabel} at risk`
        : perishability.agingUnits > 0
          ? `${perishability.agingUnits} ${unitLabel} aging`
          : `${perishability.averageFreshness}% fresh`;

    return `
      <div class="perishability-signal ${perishability.status}">
        <div class="perishability-topline">
          <span>Freshness</span>
          <strong>${perishability.statusLabel}</strong>
          <em>${detail}</em>
        </div>
        <div class="freshness-track" aria-label="${perishability.averageFreshness}% freshness">
          <span style="width: ${Math.max(4, Math.min(100, perishability.averageFreshness))}%"></span>
        </div>
      </div>
    `;
  }

  private getCurrentPerishability(productId: ProductId, state: GameState): PerishabilitySnapshot {
    const product = PRODUCTS.find((p) => p.id === productId)!;
    const inventory = state.getProductInventory(productId);
    return PerishabilityEngine.summarizeProduct(
      product,
      inventory,
      state.day,
      state.weather,
      this.getCurrentFridgePressure(state)
    );
  }

  private getCurrentFridgePressure(state: GameState): number {
    const fridgeUnits = PRODUCTS.reduce((sum, product) => {
      if (product.storage !== 'fridge') return sum;
      return sum + (state.getProductInventory(product.id)?.totalStock ?? 0) * product.storageUnits;
    }, 0);

    return state.config.fridgeCapacity <= 0 ? 0 : fridgeUnits / state.config.fridgeCapacity;
  }

  private getProjectedPerishability(
    productId: ProductId,
    state: GameState,
    draft?: Pick<ItemModalDraft, 'orderQty' | 'removeQty' | 'discountPct'>
  ): PerishabilitySnapshot {
    const product = PRODUCTS.find((p) => p.id === productId)!;
    const inventory = state.getProductInventory(productId);
    const buckets = inventory?.buckets.map((bucket) => ({ ...bucket })) ?? [];
    let removeQty = draft?.removeQty ?? this.removalMap[productId] ?? 0;

    while (removeQty > 0 && buckets.length > 0) {
      const bucket = buckets[0];
      const removed = Math.min(bucket.quantity, removeQty);
      bucket.quantity -= removed;
      removeQty -= removed;
      if (bucket.quantity <= 0) buckets.shift();
    }

    const orderQty = draft?.orderQty ?? this.orderBasket[productId] ?? 0;
    if (orderQty > 0) {
      buckets.push({ quantity: orderQty, dayAdded: state.day + 1 });
    }

    const projectedInventory: ProductInventory = {
      productId,
      buckets,
      totalStock: buckets.reduce((sum, bucket) => sum + bucket.quantity, 0),
      discountPct: draft?.discountPct ?? this.discountMap[productId] ?? inventory?.discountPct ?? 0,
    };

    return PerishabilityEngine.summarizeProduct(
      product,
      projectedInventory,
      state.day + 1,
      state.weather,
      this.getProjectedFridgePressure(state, productId, draft)
    );
  }

  private getProjectedFridgePressure(
    state: GameState,
    overrideProductId?: ProductId,
    draft?: Pick<ItemModalDraft, 'orderQty' | 'removeQty'>
  ): number {
    const fridgeUnits = PRODUCTS.reduce((sum, product) => {
      if (product.storage !== 'fridge') return sum;
      const current = state.getProductInventory(product.id)?.totalStock ?? 0;
      const removedQty = product.id === overrideProductId && draft ? draft.removeQty : this.removalMap[product.id] ?? 0;
      const ordered = product.id === overrideProductId && draft ? draft.orderQty : this.orderBasket[product.id] ?? 0;
      const removed = Math.min(current, removedQty);
      return sum + Math.max(0, current - removed + ordered) * product.storageUnits;
    }, 0);

    return state.config.fridgeCapacity <= 0 ? 0 : fridgeUnits / state.config.fridgeCapacity;
  }

  private renderKhataReminderControls(state: GameState): string {
    const customersWithKhata = state.customers.filter((customer) => customer.khataBalance > 0);
    return `
      <div class="khata-control-block">
        <div class="action-subhead">Khata reminders</div>
        ${customersWithKhata.length === 0
          ? '<div class="plan-empty">No customer has pending khata today.</div>'
          : `<div class="khata-list">
              ${customersWithKhata.map((customer) => {
                const selected = this.khataReminderIds.has(customer.id);
                return `
                  <button class="khata-reminder ${selected ? 'selected' : ''}" data-customer="${customer.id}">
                    <span>${customer.name}</span>
                    <strong>₹${customer.khataBalance.toLocaleString()}</strong>
                  </button>
                `;
              }).join('')}
            </div>`}
      </div>
    `;
  }

  private renderMarketingBoard(state: GameState, planningDay: number): string {
    const selectedCost = this.getMarketingCost();
    const activeRows = this.activeMarketing
      .map((campaign) => {
        const spec = getMarketingCampaign(campaign.specId);
        if (!spec) return '';
        const promotedProducts = this.getCampaignTargetProductsForInstance(campaign, spec)
          .map((productId) => PRODUCTS.find((product) => product.id === productId)?.name ?? productId)
          .join(', ');
        const resultLine = campaign.actualResult
          ? `
            <div class="marketing-result-line ${this.getMarketingScoreTone(campaign.actualResult.score ?? 0)}">
              <strong>${this.formatMarketingRoi(campaign.actualResult.roi ?? 0)} ROI · ${this.formatSignedNumber(campaign.actualResult.score ?? 0)} score</strong>
              <em>Margin ₹${Math.round(campaign.actualResult.targetGrossMargin ?? campaign.actualResult.incrementalRevenue ?? 0).toLocaleString()} · missed ${campaign.actualResult.missedUnits} units</em>
            </div>`
          : '';
        return `
          <div class="marketing-pipeline-item ${campaign.status}">
            <span>${spec.name}</span>
            <strong>${this.titleCase(campaign.status)}</strong>
            <em>Effect Day ${campaign.effectStartDay}-${campaign.effectEndDay}</em>
            <small>Promoting ${promotedProducts}</small>
            ${resultLine}
          </div>
        `;
      })
      .join('');

    return `
      <div class="marketing-board">
        <div class="marketing-board-head">
          <div>
            <div class="action-subhead">Marketing campaigns</div>
            <h4>Spend only when inventory can support extra demand</h4>
          </div>
          <strong>Selected spend ₹${selectedCost.toLocaleString()}</strong>
        </div>
        ${activeRows ? `<div class="marketing-pipeline">${activeRows}</div>` : ''}
        <div class="marketing-campaign-grid">
          ${MARKETING_CAMPAIGNS.map((campaign) => this.renderMarketingCampaignCard(campaign, state, planningDay)).join('')}
        </div>
      </div>
    `;
  }

  private renderMarketingCampaignCard(campaign: MarketingCampaignSpec, state: GameState, planningDay: number): string {
    const selected = this.selectedMarketingIds.has(campaign.id);
    const locked = campaign.unlockDay > planningDay;
    const selectedProducts = this.getSelectedMarketingProducts(campaign);
    const targetProducts = selectedProducts
      .map((productId) => PRODUCTS.find((product) => product.id === productId)?.name ?? productId)
      .slice(0, 4)
      .join(', ');
    const targetSegments = campaign.targetSegments.map((segment) => this.segmentLabel(segment)).slice(0, 3).join(', ');
    const warning = this.getCampaignInventoryWarning(campaign, state);
    const delayText = campaign.delayDays === 0
      ? 'same day'
      : campaign.delayDays === 1
        ? 'tomorrow'
        : `after ${campaign.delayDays} days`;

    return `
      <article class="marketing-campaign-card ${selected ? 'selected' : ''} ${locked ? 'locked' : ''}">
        <div class="marketing-card-top">
          <div>
            <strong>${campaign.name}</strong>
            <span>${this.titleCase(campaign.channel.replace('_', ' '))} · ${delayText} · ${campaign.durationDays} day${campaign.durationDays === 1 ? '' : 's'}</span>
          </div>
          <em>₹${campaign.cost}</em>
        </div>
        <p>${campaign.expectedReturn}</p>
        <div class="marketing-targets">
          <span>Customers: ${targetSegments}</span>
          <span>Promoting: ${targetProducts}</span>
        </div>
        <div class="marketing-product-picker" aria-label="${campaign.name} promoted items">
          ${campaign.targetProducts.map((productId) => {
            const product = PRODUCTS.find((item) => item.id === productId);
            const isPicked = selectedProducts.includes(productId);
            const projectedStock = Math.max(
              0,
              (state.getProductInventory(productId)?.totalStock ?? 0) +
                (this.orderBasket[productId] ?? 0) -
                (this.removalMap[productId] ?? 0)
            );
            return `
              <button
                type="button"
                class="${isPicked ? 'active' : ''}"
                data-marketing-product="${campaign.id}"
                data-product="${productId}"
                ${locked ? 'disabled' : ''}
              >
                <span>${product?.name ?? productId}</span>
                <em>${projectedStock} ${this.shortUnit(product?.unit ?? '')}</em>
              </button>
            `;
          }).join('')}
        </div>
        ${warning ? `<div class="marketing-warning">${warning}</div>` : ''}
        <button
          class="marketing-campaign-toggle ${selected ? 'selected' : ''}"
          data-marketing="${campaign.id}"
          ${locked ? 'disabled' : ''}
        >
          ${locked ? `Unlocks Day ${campaign.unlockDay}` : selected ? 'Selected' : 'Select campaign'}
        </button>
      </article>
    `;
  }

  private renderPlanSummary(state: GameState): string {
    const orderCost = this.getOrderCost();
    const marketingCost = this.getMarketingCost();
    const totalPlanCost = orderCost + marketingCost;
    const removalUnits = Object.values(this.removalMap).reduce((sum, qty) => sum + (qty ?? 0), 0);
    const offerCount = Object.values(this.discountMap).filter((pct) => (pct ?? 0) > 0).length;
    const cashAfter = state.cash - totalPlanCost;
    const reserveOk = cashAfter >= this.cashReserve;

    return `
      <div class="plan-summary">
        <div>
          <span>Wholesaler cart</span>
          <strong>₹${orderCost.toLocaleString()}</strong>
        </div>
        <div>
          <span>Marketing spend</span>
          <strong>₹${marketingCost.toLocaleString()}</strong>
        </div>
        <div>
          <span>Cash after saved cart</span>
          <strong class="${reserveOk ? 'positive' : 'negative'}">₹${Math.round(cashAfter).toLocaleString()}</strong>
        </div>
        <div>
          <span>Remove from shop</span>
          <strong>${removalUnits} units</strong>
        </div>
        <div>
          <span>Offers</span>
          <strong>${offerCount}</strong>
        </div>
        <div>
          <span>Khata notices</span>
          <strong>${this.khataReminderIds.size}</strong>
        </div>
        <div>
          <span>Campaigns</span>
          <strong>${this.selectedMarketingIds.size}</strong>
        </div>
      </div>
    `;
  }

  private renderCustomerMemoryPanel(state: GameState): string {
    const summary = state.getCustomerMemorySummary();
    const priorityCustomers = this.getPriorityCustomers(state, 4);
    const atRiskText = summary.atRiskCustomers > 0
      ? `${summary.atRiskCustomers} regular${summary.atRiskCustomers > 1 ? 's' : ''} at risk`
      : 'Relationships steady';

    return `
      <div class="panel customer-memory-panel">
        <div class="panel-header">Regulars Memory</div>
        <div class="customer-memory-strip">
          <div>
            <span class="customer-mini-label">Repeat</span>
            <strong>${summary.repeatCustomers}/${summary.activeCustomers}</strong>
          </div>
          <div>
            <span class="customer-mini-label">Failed</span>
            <strong class="${summary.failedVisits > 0 ? 'negative' : 'positive'}">${summary.failedVisits}</strong>
          </div>
          <div>
            <span class="customer-mini-label">Signal</span>
            <strong class="${summary.atRiskCustomers > 0 ? 'negative' : 'positive'}">${atRiskText}</strong>
          </div>
        </div>
        <div class="customer-memory-list">
          ${priorityCustomers.map((customer) => this.renderCustomerMemoryRow(customer, state.day)).join('')}
        </div>
      </div>
    `;
  }

  private renderCustomerMemoryRow(customer: CustomerProfile, day: number): string {
    const dueToday = customer.cadence === 1 || (day + customer.visitOffset) % customer.cadence === 0;
    const trustClass = customer.trust >= 75 ? 'positive' : customer.trust >= 55 ? 'neutral' : 'negative';
    const lastVisitText = customer.lastVisitDay ? `Last day ${customer.lastVisitDay}` : 'Not visited yet';

    return `
      <div class="customer-memory-row ${dueToday ? 'due' : ''}">
        <div class="customer-memory-top">
          <div>
            <span class="customer-name">${customer.name}</span>
            <span class="customer-segment">${this.segmentLabel(customer.segment)}</span>
          </div>
          <span class="customer-trust ${trustClass}">${Math.round(customer.trust)}%</span>
        </div>
        <div class="customer-pattern">${customer.visitPattern}</div>
        <div class="customer-basket-line">Usually: ${this.formatOrderLines(customer.usualBasket, true)}</div>
        <div class="customer-memory-meta">
          <span>${dueToday ? 'Likely today' : lastVisitText}</span>
          <span>${customer.visitCount} visits · ${customer.failedVisits} misses</span>
        </div>
      </div>
    `;
  }

  private renderCustomerVisitReport(result: DayResult): string {
    const namedVisits = result.customerVisits.filter((visit) => visit.segment !== 'walkin');
    const walkInVisits = result.customerVisits.filter((visit) => visit.segment === 'walkin');
    const problemVisits = namedVisits.filter((visit) => visit.outcome !== 'fulfilled');
    const visibleVisits = [
      ...problemVisits,
      ...namedVisits.filter((visit) => visit.outcome === 'fulfilled'),
    ].slice(0, 6);
    const missedNamedVisits = namedVisits.filter((visit) => visit.outcome !== 'fulfilled').length;
    const walkInRevenue = walkInVisits.reduce((sum, visit) => sum + visit.revenue, 0);

    return `
      <div class="customer-report-block">
        <div class="panel-header">Customer Visits Today</div>
        <div class="customer-summary-grid">
          <div>
            <span class="customer-mini-label">Named visits</span>
            <strong>${namedVisits.length}</strong>
          </div>
          <div>
            <span class="customer-mini-label">Missed</span>
            <strong class="${missedNamedVisits > 0 ? 'negative' : 'positive'}">${missedNamedVisits}</strong>
          </div>
          <div>
            <span class="customer-mini-label">Walk-in sales</span>
            <strong>₹${Math.round(walkInRevenue).toLocaleString()}</strong>
          </div>
        </div>
        <div class="customer-visit-list">
          ${visibleVisits.length > 0
            ? visibleVisits.map((visit) => this.renderCustomerVisitRow(visit)).join('')
            : '<div class="basket-empty">No regular customer visits recorded today</div>'}
        </div>
      </div>
    `;
  }

  private renderCustomerVisitRow(visit: CustomerVisit): string {
    const trustText = visit.trustDelta === 0 ? '' : `${visit.trustDelta > 0 ? '+' : ''}${visit.trustDelta}`;
    const missedText = visit.missed.length > 0
      ? `<div class="customer-missed-line">Missed: ${this.formatOrderLines(visit.missed, true)}</div>`
      : '';
    const reasonText = this.formatVisitReasonText(visit);

    return `
      <div class="customer-visit-row ${visit.outcome}">
        <div class="customer-visit-main">
          <div>
            <span class="customer-name">${visit.customerName}</span>
            <span class="customer-segment">${this.segmentLabel(visit.segment)}</span>
          </div>
          <span class="customer-outcome ${visit.outcome}">${this.outcomeLabel(visit.outcome)}</span>
        </div>
        <div class="customer-basket-line">Asked: ${this.formatOrderLines(visit.requested, true)}</div>
        ${missedText}
        ${reasonText ? `
          <div class="visit-reason-line customer-visit-reason">
            <strong>Why</strong>
            <span>${reasonText}</span>
          </div>
        ` : ''}
        <div class="customer-memory-meta">
          <span>${this.titleCase(visit.wave)} · ₹${visit.revenue.toLocaleString()} sales</span>
          <span>${trustText ? `Trust ${trustText}` : visit.note}</span>
        </div>
      </div>
    `;
  }

  private formatVisitReasonText(visit: CustomerVisit): string {
    const chance = visit.visitProbability !== undefined
      ? `Visit chance ${Math.round(visit.visitProbability * 100)}%`
      : '';
    const reasons = [
      ...(visit.visitReasons ?? []),
      ...(visit.demandReasons ?? []),
    ]
      .filter((reason) => reason && !reason.startsWith('Visit chance'))
      .filter((reason) => reason !== 'Usual basket')
      .slice(0, chance ? 2 : 3);

    return [chance, ...reasons].filter(Boolean).join(' · ');
  }

  private renderSituationBanner(event: { title: string; text: string }): string {
    return `
      <div class="situation-banner">
        <div class="situation-title">⚠️ ${event.title}</div>
        <div class="situation-text">${event.text}</div>
      </div>
    `;
  }

  private renderProductCards(state: GameState): string {
    const cards = PRODUCTS.map(p => {
      const inv = state.getProductInventory(p.id);
      const stock = inv?.totalStock ?? 0;
      const maxStock = p.baseDemand * 2;
      const fillRatio = Math.min(1, stock / maxStock);
      const hasExpiryRisk = inv?.buckets.some(b => state.day - b.dayAdded >= p.shelfLife - 1) ?? false;
      const statusClass = stock === 0 ? 'danger' : hasExpiryRisk ? 'warning' : fillRatio < 0.3 ? 'warning' : '';
      const statusDot = stock === 0 ? 'red' : hasExpiryRisk ? 'amber' : 'green';
      const discount = this.discountMap[p.id] ?? 0;
      const discountHtml = p.shelfLife <= 3 && stock > 0
        ? `<div class="product-discount" style="margin-top: 6px; display: flex; align-items: center; gap: 6px; font-size: 11px;">
             <span style="color: var(--slate);">Discount:</span>
             <div class="discount-chips" style="display: flex; gap: 4px;">
               ${[0, 10, 15, 20].map(d => {
                 const isActive = discount === d;
                 return `<button class="discount-chip-btn ${isActive ? 'active' : ''}" data-product="${p.id}" data-discount="${d}" style="padding: 2px 6px; border-radius: 4px; border: 1px solid ${isActive ? 'var(--expiry)' : 'var(--panel-border)'}; background: ${isActive ? 'rgba(249,115,22,0.1)' : 'transparent'}; color: ${isActive ? 'var(--expiry)' : 'var(--slate)'}; cursor: pointer; font-family: var(--font-mono); font-size: 10px; font-weight: 600;">${d}%</button>`;
               }).join('')}
             </div>
           </div>`
        : '';

      return `
        <div class="product-card ${statusClass}" data-product="${p.id}">
          <div class="product-status-dot ${statusDot}"></div>
          <div class="product-card-header">
            <span class="product-name">${p.name}</span>
            <span class="product-stock">${stock} ${p.unit}</span>
          </div>
          <div class="product-info">
            <div class="product-info-row">
              <span class="product-info-label">Shelf Life</span>
              <span class="product-info-value">${p.shelfLife} days</span>
            </div>
            <div class="product-info-row">
              <span class="product-info-label">Margin</span>
              <span class="product-info-value">₹${p.margin}/${p.unit}</span>
            </div>
            <div class="product-info-row">
              <span class="product-info-label">Storage</span>
              <span class="product-info-value" style="text-transform: capitalize; color: ${p.storage === 'fridge' ? 'var(--fridge)' : 'var(--slate)'}">${p.storage}</span>
            </div>
            <div class="product-info-row">
              <span class="product-info-label">Trust</span>
              <span class="product-info-value" style="text-transform: uppercase; font-size: 10px; color: ${p.trustImpact === 'high' ? 'var(--danger)' : p.trustImpact === 'medium' ? 'var(--warning)' : 'var(--muted)'}">${p.trustImpact}</span>
            </div>
          </div>
          ${discountHtml}
        </div>
      `;
    }).join('');

    return `
      <div class="panel">
        <div class="panel-header">Inventory & Ordering</div>
        <div class="product-grid">
          ${cards}
        </div>
      </div>
    `;
  }

  private renderOrderBasket(state: GameState): string {
    const items = Object.entries(this.orderBasket)
      .filter(([, qty]) => qty && qty > 0)
      .map(([pid, qty]) => {
        const prod = PRODUCTS.find(p => p.id === pid);
        if (!prod) return '';
        const cost = (qty || 0) * prod.costPrice;
        const disc = this.discountMap[pid as ProductId] ?? 0;
        const discLabel = disc > 0 ? ` <span style="color: var(--expiry); font-size: 10px;">-${disc}%</span>` : '';
        return `
          <div class="basket-item" data-product="${pid}">
            <div>
              <div class="basket-item-name">${prod.name}${discLabel}</div>
              <div class="basket-total">₹${cost.toLocaleString()}</div>
            </div>
            <div class="basket-controls">
              <button class="stepper-btn" data-action="minus" data-product="${pid}">−</button>
              <span class="basket-qty">${qty}${prod.unit}</span>
              <button class="stepper-btn" data-action="plus" data-product="${pid}">+</button>
            </div>
          </div>
        `;
      }).join('');

    const totalCost = Object.entries(this.orderBasket).reduce((sum, [pid, qty]) => {
      const prod = PRODUCTS.find(p => p.id === pid);
      return sum + ((qty || 0) * (prod?.costPrice ?? 0));
    }, 0);

    const cashAfter = state.cash - totalCost;
    const reserveOk = cashAfter >= this.cashReserve;

    return `
      <div class="panel" id="basket-panel">
        <div class="panel-header">Order Basket</div>
        <div id="basket-items" style="min-height: 40px;">
          ${items || '<div class="basket-empty">No morning order yet</div>'}
        </div>
        <div style="margin-top: 12px; padding-top: 12px; border-top: 1px solid var(--panel-border); display: flex; justify-content: space-between; align-items: center;">
          <span style="font-size: 12px; font-weight: 600; color: var(--slate);">Total Cost</span>
          <span style="font-family: var(--font-mono); font-size: 16px; font-weight: 700; color: var(--charcoal);">₹${totalCost.toLocaleString()}</span>
        </div>
        <div style="display: flex; justify-content: space-between; align-items: center; margin-top: 6px;">
          <span style="font-size: 11px; color: var(--slate);">Cash After</span>
          <span style="font-family: var(--font-mono); font-size: 12px; font-weight: 700; color: ${reserveOk ? 'var(--success)' : 'var(--danger)'}">₹${Math.round(cashAfter).toLocaleString()}</span>
        </div>
        ${!reserveOk ? `<div style="margin-top: 8px; font-size: 11px; color: var(--danger);">⚠️ Below your cash reserve of ₹${this.cashReserve.toLocaleString()}</div>` : ''}
      </div>
    `;
  }

  private renderSliders(): string {
    const reserveMax = Math.max(DEFAULT_CONFIG.startingCash, DEFAULT_CONFIG.defaultCashReserve * 2);
    return `
      <div class="panel">
        <div class="panel-header">Allocation</div>
        <div class="slider-group" style="margin-bottom: 16px;">
          <div class="slider-label-row">
            <span class="slider-label">Cash Reserve</span>
            <span class="slider-value" id="cash-reserve-val">₹${this.cashReserve.toLocaleString()}</span>
          </div>
          <input type="range" id="cash-reserve-slider" min="0" max="${reserveMax}" step="100" value="${this.cashReserve}">
        </div>
        <div class="slider-group">
          <div class="slider-label-row">
            <span class="slider-label">Fridge — Milk</span>
            <span class="slider-value" id="fridge-milk-val">${this.fridgeAlloc.milk}%</span>
          </div>
          <input type="range" id="fridge-milk-slider" min="0" max="100" step="5" value="${this.fridgeAlloc.milk}">
        </div>
        <div class="slider-group" style="margin-top: 12px;">
          <div class="slider-label-row">
            <span class="slider-label">Fridge — Cold Drinks</span>
            <span class="slider-value" id="fridge-cd-val">${this.fridgeAlloc.cold_drinks}%</span>
          </div>
          <input type="range" id="fridge-cd-slider" min="0" max="100" step="5" value="${this.fridgeAlloc.cold_drinks}">
        </div>
        <div style="margin-top: 8px; font-size: 11px; color: var(--muted); text-align: right;">
          Buffer: ${this.fridgeAlloc.buffer}%
        </div>
      </div>
    `;
  }

  private renderRiskPreview(state: GameState): string {
    const totalCost = Object.entries(this.orderBasket).reduce((sum, [pid, qty]) => {
      const prod = PRODUCTS.find(p => p.id === pid);
      return sum + ((qty || 0) * (prod?.costPrice ?? 0));
    }, 0);

    const cashAfter = state.cash - totalCost;
    const orderedFridgeUnits = Object.entries(this.orderBasket).reduce((sum, [pid, qty]) => {
      const prod = PRODUCTS.find(p => p.id === pid);
      return sum + (prod?.storage === 'fridge' ? (qty || 0) * (prod.storageUnits) : 0);
    }, 0);
    const currentFridgeUsed = state.getFridgeUsage();
    const fridgeAfter = currentFridgeUsed + orderedFridgeUnits;
    const fridgeCapacity = 100;

    const stockoutItems: string[] = [];
    for (const p of PRODUCTS) {
      const inv = state.getProductInventory(p.id);
      const stock = inv?.totalStock ?? 0;
      const added = this.orderBasket[p.id] ?? 0;
      if (stock + added < p.baseDemand * 0.8) {
        stockoutItems.push(p.name);
      }
    }

    const cashRisk = cashAfter < this.cashReserve ? 'High' : cashAfter < this.cashReserve * 1.3 ? 'Medium' : 'Low';
    const fridgeRisk = fridgeAfter > fridgeCapacity * 0.95 ? 'High' : fridgeAfter > fridgeCapacity * 0.8 ? 'Medium' : 'Low';
    const stockoutRisk = stockoutItems.length >= 4 ? 'High' : stockoutItems.length > 0 ? 'Medium' : 'Low';
    const stockoutPreview = stockoutItems.length > 3
      ? `${stockoutItems.slice(0, 3).join(', ')} +${stockoutItems.length - 3} more`
      : stockoutItems.join(', ');

    const cashColor = cashRisk === 'High' ? 'var(--danger)' : cashRisk === 'Medium' ? 'var(--warning)' : 'var(--success)';
    const fridgeColor = fridgeRisk === 'High' ? 'var(--danger)' : fridgeRisk === 'Medium' ? 'var(--warning)' : 'var(--success)';
    const stockoutColor = stockoutRisk === 'High' ? 'var(--danger)' : stockoutRisk === 'Medium' ? 'var(--warning)' : 'var(--success)';

    return `
      <div class="panel" id="risk-panel" style="background: rgba(14,165,233,0.04); border-color: rgba(14,165,233,0.2);">
        <div class="panel-header" style="color: var(--fridge);">Expected Outcome</div>
        <div style="font-size: 12px; color: var(--slate); line-height: 1.7;">
          <div style="display: flex; justify-content: space-between;">
            <span>Stockout Risk</span>
            <span style="font-weight: 600; color: ${stockoutColor};">${stockoutRisk}</span>
          </div>
          <div style="display: flex; justify-content: space-between;">
            <span>Fridge Overflow</span>
            <span style="font-weight: 600; color: ${fridgeColor};">${fridgeRisk}</span>
          </div>
          <div style="display: flex; justify-content: space-between;">
            <span>Cash Risk</span>
            <span style="font-weight: 600; color: ${cashColor};">${cashRisk}</span>
          </div>
          ${stockoutItems.length > 0 ? `<div style="margin-top: 6px; font-size: 10px; color: ${stockoutColor};">Understocked: ${stockoutPreview}</div>` : ''}
        </div>
      </div>
    `;
  }

  private renderReportRow(label: string, value: string, cls: string): string {
    return `
      <div class="report-row">
        <span class="report-row-label">${label}</span>
        <span class="report-row-value" style="color: var(--${cls === 'positive' ? 'success' : cls === 'negative' ? 'danger' : cls === 'neutral' ? 'slate' : cls});">${value}</span>
      </div>
    `;
  }

  // ===== INTERACTION =====

  private attachInitialStockListeners(state: GameState) {
    this.attachItemTrendListeners(state);
    this.attachMarketingListeners(() => {
      this.emitPlanChange();
      this.refreshInitialStockingUI(state);
    });

    document.getElementById('btn-starter-mix')?.addEventListener('click', () => {
      this.orderBasket = this.getStarterInventoryPlan();
      this.emitPlanChange();
      this.refreshInitialStockingUI(state);
    });

    document.getElementById('btn-clear-initial')?.addEventListener('click', () => {
      this.orderBasket = {};
      this.selectedMarketingIds = new Set();
      this.marketingProductSelections = {};
      this.emitPlanChange();
      this.refreshInitialStockingUI(state);
    });

    document.getElementById('btn-open-day-one')?.addEventListener('click', () => {
      if (this.getOrderCost() <= 0 || this.getOrderCost() + this.getMarketingCost() > state.cash) return;
      this.onAction(this.getCurrentActions());
    });
  }

  private refreshInitialStockingUI(state: GameState) {
    const scrollTop = this.container.scrollTop;
    this._renderInitialStockingUI(state, this.openingDayContext, this.openingAIInsightStatus);
    this.container.scrollTop = scrollTop;
  }

  private attachCaseListeners(result: DayResult, state: GameState) {
    this.attachItemTrendListeners(state);
    this.attachMarketingListeners(() => {
      this.emitPlanChange();
      this.refreshCasePlanningUI(result, state);
    });

    document.querySelectorAll('.khata-reminder').forEach((btn) => {
      btn.addEventListener('click', (event) => {
        const customerId = (event.currentTarget as HTMLElement).dataset.customer;
        if (!customerId) return;
        if (this.khataReminderIds.has(customerId)) {
          this.khataReminderIds.delete(customerId);
        } else {
          this.khataReminderIds.add(customerId);
        }
        this.refreshCasePlanningUI(result, state);
      });
    });

    document.querySelectorAll('.customer-filter-btn').forEach((btn) => {
      btn.addEventListener('click', (event) => {
        const el = event.currentTarget as HTMLElement;
        const filter = el.dataset.filter;
        const panel = el.closest<HTMLElement>('.customer-ledger-panel');
        if (!filter || !panel) return;
        panel.dataset.filter = filter;
        panel.querySelectorAll('.customer-filter-btn').forEach((button) => button.classList.remove('active'));
        el.classList.add('active');
      });
    });

    document.getElementById('btn-submit-case-plan')?.addEventListener('click', () => {
      if (!this.isPlanAffordable(state)) {
        this.planError = this.getPlanAffordabilityMessage(state);
        this.refreshCasePlanningUI(result, state);
        return;
      }
      this.planError = undefined;
      this.onAction(this.getCurrentActions());
    });
  }

  private attachItemTrendListeners(state: GameState) {
    document.querySelectorAll<HTMLElement>('[data-trend-open]').forEach((btn) => {
      if (btn.dataset.bound === 'true') return;
      btn.dataset.bound = 'true';
      btn.addEventListener('click', (event) => {
        event.stopPropagation();
        const productId = (event.currentTarget as HTMLElement).dataset.trendOpen as ProductId | undefined;
        if (!productId) return;
        this.showItemTrendModal(productId, state);
      });
    });

    document.querySelectorAll<HTMLElement>('[data-trend-product]').forEach((card) => {
      if (card.dataset.trendBound === 'true') return;
      card.dataset.trendBound = 'true';
      const openTrend = (event: Event) => {
        const target = event.target as HTMLElement;
        if (target.closest('button, input, select, textarea, summary, details')) return;
        const productId = card.dataset.trendProduct as ProductId | undefined;
        if (!productId) return;
        this.showItemTrendModal(productId, state);
      };

      card.addEventListener('click', openTrend);
      card.addEventListener('keydown', (event) => {
        if (event.key !== 'Enter' && event.key !== ' ') return;
        event.preventDefault();
        openTrend(event);
      });
    });
  }

  private showItemTrendModal(productId: ProductId, state: GameState) {
    this.closeItemTrendModal();
    this.beginItemModalDraft(productId);
    this.container.insertAdjacentHTML('beforeend', this.renderItemTrendModal(productId, state));
    this.attachItemTrendModalListeners(productId, state);
  }

  private beginItemModalDraft(productId: ProductId) {
    this.itemModalDraft = {
      productId,
      orderQty: this.orderBasket[productId] ?? 0,
      removeQty: this.removalMap[productId] ?? 0,
      discountPct: this.discountMap[productId] ?? 0,
    };
  }

  private getItemModalDraft(productId: ProductId): ItemModalDraft {
    if (!this.itemModalDraft || this.itemModalDraft.productId !== productId) {
      this.beginItemModalDraft(productId);
    }

    return this.itemModalDraft!;
  }

  private adjustItemModalDraftOrder(productId: ProductId, direction: 1 | -1) {
    const prod = PRODUCTS.find(p => p.id === productId);
    if (!prod) return;
    const draft = this.getItemModalDraft(productId);
    draft.orderQty = Math.max(0, draft.orderQty + prod.orderIncrement * direction);
  }

  private adjustItemModalDraftRemoval(productId: ProductId, direction: 1 | -1, state: GameState) {
    const prod = PRODUCTS.find(p => p.id === productId);
    if (!prod) return;
    const draft = this.getItemModalDraft(productId);
    const stock = state.getProductInventory(productId)?.totalStock ?? 0;
    draft.removeQty = Math.max(0, Math.min(stock, draft.removeQty + prod.orderIncrement * direction));
  }

  private setItemModalDraftDiscount(productId: ProductId, discountPct: number) {
    const draft = this.getItemModalDraft(productId);
    draft.discountPct = discountPct;
  }

  private commitItemModalDraft(productId: ProductId, state: GameState) {
    const draft = this.getItemModalDraft(productId);

    if (draft.orderQty <= 0) {
      delete this.orderBasket[productId];
    } else {
      this.orderBasket[productId] = draft.orderQty;
    }

    if (draft.removeQty <= 0) {
      delete this.removalMap[productId];
    } else {
      this.removalMap[productId] = draft.removeQty;
    }

    if (draft.discountPct <= 0) {
      delete this.discountMap[productId];
    } else {
      this.discountMap[productId] = draft.discountPct;
    }

    this.emitPlanChange();
    this.beginItemModalDraft(productId);
    this.replaceItemTrendModal(productId, state, true);
  }

  private attachItemTrendModalListeners(productId: ProductId, state: GameState) {
    const overlay = this.container.querySelector<HTMLElement>('.item-trend-overlay');
    if (!overlay) return;

    const close = () => {
      this.closeItemTrendModal();
    };
    overlay.querySelectorAll<HTMLElement>('[data-close-trend]').forEach((btn) => {
      btn.addEventListener('click', close);
    });
    overlay.addEventListener('click', (event) => {
      if (event.target === overlay) close();
    });

    if (this.itemTrendKeydown) {
      document.removeEventListener('keydown', this.itemTrendKeydown);
    }
    this.itemTrendKeydown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') close();
    };
    document.addEventListener('keydown', this.itemTrendKeydown);

    overlay.querySelectorAll<HTMLElement>('[data-item-modal-action]').forEach((btn) => {
      btn.addEventListener('click', (event) => {
        event.stopPropagation();
        const action = (event.currentTarget as HTMLElement).dataset.itemModalAction;
        if (action === 'order-plus') this.adjustItemModalDraftOrder(productId, 1);
        if (action === 'order-minus') this.adjustItemModalDraftOrder(productId, -1);
        if (action === 'remove-plus') this.adjustItemModalDraftRemoval(productId, 1, state);
        if (action === 'remove-minus') this.adjustItemModalDraftRemoval(productId, -1, state);
        this.replaceItemTrendModal(productId, state);
      });
    });

    overlay.querySelectorAll<HTMLElement>('[data-item-modal-discount]').forEach((btn) => {
      btn.addEventListener('click', (event) => {
        event.stopPropagation();
        const discount = Number((event.currentTarget as HTMLElement).dataset.itemModalDiscount ?? 0);
        this.setItemModalDraftDiscount(productId, discount);
        this.replaceItemTrendModal(productId, state);
      });
    });

    overlay.querySelector<HTMLElement>('[data-item-modal-save]')?.addEventListener('click', (event) => {
      event.stopPropagation();
      this.commitItemModalDraft(productId, state);
    });

    overlay.querySelector<HTMLElement>('[data-item-know-more]')?.addEventListener('click', (event) => {
      event.stopPropagation();
      this.openLongInsightsFromItemModal();
    });
  }

  private openLongInsightsFromItemModal() {
    this.closeItemTrendModal();
    const drawer = this.container.querySelector<HTMLDetailsElement>('.insight-signal-drawer');
    if (!drawer) return;
    drawer.open = true;
    window.setTimeout(() => {
      drawer.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 0);
  }

  private getOpenItemTrendSnapshot(): ItemModalSnapshot | undefined {
    const overlay = this.container.querySelector<HTMLElement>('.item-trend-overlay');
    if (!overlay || !this.itemModalDraft) return undefined;
    return {
      productId: this.itemModalDraft.productId,
      scrollTop: this.getItemTrendModalScrollTop(),
    };
  }

  private restoreOpenItemTrendModal(snapshot: ItemModalSnapshot | undefined, state: GameState) {
    if (!snapshot) return;
    this.container.insertAdjacentHTML('beforeend', this.renderItemTrendModal(snapshot.productId, state));
    this.attachItemTrendModalListeners(snapshot.productId, state);
    this.restoreItemTrendModalScroll(snapshot.scrollTop);
  }

  private replaceItemTrendModal(productId: ProductId, state: GameState, refreshPlanningUI = false) {
    const isOpeningScreen = Boolean(this.container.querySelector('#initial-stock-screen'));
    const isCaseScreen = Boolean(this.container.querySelector('#case-screen'));
    const modalScrollTop = this.getItemTrendModalScrollTop();

    if (refreshPlanningUI && isOpeningScreen) {
      this.refreshInitialStockingUI(state);
      this.container.insertAdjacentHTML('beforeend', this.renderItemTrendModal(productId, state));
      this.attachItemTrendModalListeners(productId, state);
      this.restoreItemTrendModalScroll(modalScrollTop);
      return;
    }

    if (refreshPlanningUI && isCaseScreen && this.currentCaseResult && this.currentCaseState) {
      this.refreshCasePlanningUI(this.currentCaseResult, this.currentCaseState);
      this.container.insertAdjacentHTML('beforeend', this.renderItemTrendModal(productId, state));
      this.attachItemTrendModalListeners(productId, state);
      this.restoreItemTrendModalScroll(modalScrollTop);
      return;
    }

    const overlay = this.container.querySelector<HTMLElement>('.item-trend-overlay');
    if (!overlay) return;
    overlay.outerHTML = this.renderItemTrendModal(productId, state);
    this.attachItemTrendModalListeners(productId, state);
    this.restoreItemTrendModalScroll(modalScrollTop);
  }

  private getItemTrendModalScrollTop(): number {
    return this.container.querySelector<HTMLElement>('.item-trend-modal')?.scrollTop ?? 0;
  }

  private restoreItemTrendModalScroll(scrollTop: number) {
    const modal = this.container.querySelector<HTMLElement>('.item-trend-modal');
    if (!modal) return;
    modal.scrollTop = scrollTop;
  }

  private closeItemTrendModal() {
    if (this.itemTrendKeydown) {
      document.removeEventListener('keydown', this.itemTrendKeydown);
      this.itemTrendKeydown = undefined;
    }
    this.itemModalDraft = undefined;
    this.container.querySelectorAll('.item-trend-overlay').forEach((modal) => modal.remove());
  }

  private renderItemTrendModal(productId: ProductId, state: GameState): string {
    const product = PRODUCTS.find((p) => p.id === productId);
    if (!product) return '';
    const rows = this.getItemTrendRows(productId, state);
    const unit = this.shortUnit(product.unit) || product.unit;
    const totalSold = rows.reduce((sum, row) => sum + row.sold, 0);
    const totalMissed = rows.reduce((sum, row) => sum + row.missedDemand, 0);
    const recentRows = rows.slice(-3);
    const recentDemand = recentRows.length > 0
      ? Math.round(recentRows.reduce((sum, row) => sum + row.sold + row.missedDemand, 0) / recentRows.length)
      : 0;
    const latest = rows[rows.length - 1];
    const image = PRODUCT_IMAGE_BY_ID[productId];

    return `
      <div class="item-trend-overlay" role="dialog" aria-modal="true" aria-label="${product.name} trend">
        <section class="item-trend-modal">
          <div class="item-trend-head">
            <div class="item-trend-title">
              <div class="item-trend-art">
                ${image ? `<img src="${image}" alt="${product.name}" />` : `<span>${product.name.slice(0, 2)}</span>`}
              </div>
              <div>
                <span>Item trend</span>
                <strong>${product.name}</strong>
                <em>${rows.length} day${rows.length === 1 ? '' : 's'} · ₹${product.margin}/${unit} margin · ${product.trustImpact} trust</em>
              </div>
            </div>
            <button class="trend-close-btn" type="button" data-close-trend aria-label="Close item trend">Close</button>
          </div>

          ${rows.length === 0 ? `
            ${this.renderOpeningItemDetails(product)}
            ${this.renderCompactItemHistory(rows, unit)}
            ${this.renderItemSignalBrief(product, state, rows)}
            ${this.renderItemActionPanel(product, state)}
          ` : `
            <div class="item-trend-summary">
              ${this.renderTrendSummaryCard('Sold', `${totalSold} ${unit}`, 'positive')}
              ${this.renderTrendSummaryCard('Missed', `${totalMissed} ${unit}`, totalMissed > 0 ? 'negative' : 'positive')}
              ${this.renderTrendSummaryCard('Closing', `${latest?.closing ?? 0} ${unit}`, (latest?.closing ?? 0) > 0 ? 'positive' : totalMissed > 0 ? 'negative' : 'neutral')}
              ${this.renderTrendSummaryCard('Demand', `${recentDemand} ${unit}`, 'neutral')}
            </div>

            ${this.renderCompactItemHistory(rows, unit)}
            ${this.renderItemSignalBrief(product, state, rows)}
            ${this.renderItemActionPanel(product, state, latest)}
            <details class="item-history-details">
              <summary>
                <span>More history</span>
                <strong>Chart + table</strong>
              </summary>
              ${this.renderItemTrendChart(rows)}
              ${this.renderItemTrendTable(rows, unit)}
            </details>
          `}
        </section>
      </div>
    `;
  }

  private renderCompactItemHistory(rows: Array<DayResult['inventoryMovements'][number] & { day: number }>, unit: string): string {
    const visibleRows = rows.slice(-3);
    return `
      <div class="item-history-strip" aria-label="Recent day history">
        <div class="item-history-strip-head">
          <span>Day history</span>
          <strong>${rows.length === 0 ? 'No data yet' : rows.length > visibleRows.length ? `Latest ${visibleRows.length}` : `${rows.length} day${rows.length === 1 ? '' : 's'}`}</strong>
        </div>
        <div class="item-history-row-list">
          ${visibleRows.length === 0 ? `
            <div class="item-history-empty">
              <strong>No days recorded yet</strong>
              <span>Run the first day to see sold, missed, closing, and waste.</span>
            </div>
          ` : visibleRows.map((row) => `
            <div class="item-history-row ${row.missedDemand > 0 ? 'attention' : ''}">
              <strong>Day ${row.day}</strong>
              <span>Open ${this.getOpeningShelf(row)}${unit}</span>
              <span>Ordered ${row.ordered}${unit}</span>
              <span>Demand ${row.sold + row.missedDemand}${unit}</span>
              <span class="sold">Sold ${row.sold}${unit}</span>
              <span class="${row.missedDemand > 0 ? 'missed' : ''}">Missed ${row.missedDemand}${unit}</span>
              <span>Close ${row.closing}${unit}</span>
              <span>Waste ${row.wasted}${unit}</span>
            </div>
          `).join('')}
        </div>
      </div>
    `;
  }

  private renderItemSignalBrief(
    product: (typeof PRODUCTS)[number],
    state: GameState,
    rows: Array<DayResult['inventoryMovements'][number] & { day: number }>
  ): string {
    const environment = this.getPlanningEnvironment(state);
    const unit = this.shortUnit(product.unit) || product.unit;
    const likelyCustomers = state.customers.filter((customer) =>
      customer.usualBasket.some((line) => line.productId === product.id) &&
      this.isCustomerLikelyForPlanningDay(environment.planningDay, customer)
    );
    const recentVisits = this.getRecentItemVisitCounts(product.id, state);
    const recentVisitAverage = recentVisits.length > 0
      ? recentVisits.reduce((sum, count) => sum + count, 0) / recentVisits.length
      : 0;
    const pressure = this.getItemEnvironmentPressure(product, environment);
    const walkInPressure = this.getItemWalkInPressure(product, environment, pressure.tone);
    const visitBase = Math.max(likelyCustomers.length, recentVisitAverage);
    const visitLow = Math.max(0, Math.floor(visitBase));
    const visitHigh = Math.max(
      visitLow + (likelyCustomers.length > 0 ? 1 : 0),
      Math.ceil(visitBase + walkInPressure.buffer + (pressure.tone === 'positive' ? 1 : 0))
    );
    const recentDemand = rows.slice(-3);
    const recentDemandAverage = recentDemand.length > 0
      ? Math.round(recentDemand.reduce((sum, row) => sum + row.sold + row.missedDemand, 0) / recentDemand.length)
      : product.baseDemand;
    const segmentText = this.formatSegmentCounts(likelyCustomers);
    const customerPreview = likelyCustomers.slice(0, 3).map((customer) => customer.name).join(', ');
    const driver = pressure.drivers[0] ?? environment.marketSignals[0] ?? 'No special item pressure visible.';

    return `
      <section class="item-signal-panel">
        <div class="item-signal-head">
          <div>
            <span>Tomorrow clues</span>
            <strong>${environment.dayName} · ${this.weatherLabel(environment.tomorrowWeather.weather)} ${environment.tomorrowWeather.temperature}°C</strong>
          </div>
          <button class="item-know-more-btn" type="button" data-item-know-more>Know more</button>
        </div>
        <div class="item-signal-grid">
          <div>
            <span>Likely ${product.name} visits</span>
            <strong>${visitLow}-${visitHigh}</strong>
            <em>${likelyCustomers.length} known · ${walkInPressure.label} walk-ins</em>
          </div>
          <div>
            <span>Recent pull</span>
            <strong>${recentDemandAverage} ${unit}/day</strong>
            <em>${recentVisits.length > 0 ? `${recentVisits.join(', ')} item-visit days` : 'No item visit history yet'}</em>
          </div>
          <div class="${pressure.tone}">
            <span>Environment pressure</span>
            <strong>${pressure.label}</strong>
            <em>${driver}</em>
          </div>
        </div>
        <div class="item-signal-foot">
          <span>${segmentText || 'No fixed customer segment due for this item'}</span>
          <strong>${customerPreview || 'Walk-ins may decide at counter'}</strong>
        </div>
      </section>
    `;
  }

  private renderItemActionPanel(
    product: (typeof PRODUCTS)[number],
    state: GameState,
    latest?: DayResult['inventoryMovements'][number] & { day: number }
  ): string {
    const productId = product.id;
    const unit = this.shortUnit(product.unit) || product.unit;
    const savedOrderQty = this.orderBasket[productId] ?? 0;
    const savedRemoveQty = this.removalMap[productId] ?? 0;
    const savedDiscount = this.discountMap[productId] ?? 0;
    const draft = this.getItemModalDraft(productId);
    const orderQty = draft.orderQty;
    const removeQty = draft.removeQty;
    const discount = draft.discountPct;
    const currentStock = state.getProductInventory(productId)?.totalStock ?? latest?.closing ?? 0;
    const orderLineCost = orderQty * product.costPrice;
    const orderLineMargin = orderQty * product.margin;
    const draftOrderCost = this.getOrderCost() - (savedOrderQty * product.costPrice) + orderLineCost;
    const cashAfterDraft = state.cash - draftOrderCost - this.getMarketingCost();
    const canRemove = currentStock > 0;
    const hasDraftChanges = orderQty !== savedOrderQty || removeQty !== savedRemoveQty || discount !== savedDiscount;
    const projectedPerishability = this.getProjectedPerishability(productId, state, draft);
    const closingText = latest
      ? `${latest.closing} ${unit} closing · ${latest.missedDemand} ${unit} missed`
      : `${currentStock} ${unit} currently in shop`;
    const savedCartText = this.formatCompactItemCart(savedOrderQty, savedRemoveQty, savedDiscount, unit);
    const draftCartText = this.formatCompactItemCart(orderQty, removeQty, discount, unit);
    const saveButtonLabel = hasDraftChanges ? 'Add to cart' : 'Saved';

    return `
      <section class="item-action-panel">
        <div class="item-action-head">
          <div>
            <span>Plan ${product.name}</span>
            <strong>${closingText}</strong>
          </div>
          <em class="${cashAfterDraft >= this.cashReserve ? 'positive' : cashAfterDraft >= 0 ? 'warning' : 'negative'}">
            ₹${Math.round(cashAfterDraft).toLocaleString()} after draft
          </em>
        </div>

        <div class="item-cart-status compact">
          <strong>Cart ${savedCartText}</strong>
          <strong>Draft ${draftCartText}</strong>
          <span class="item-cart-pill ${hasDraftChanges ? 'draft' : 'saved'}">
            ${hasDraftChanges ? 'Unsaved' : 'Saved'}
          </span>
        </div>

        <div class="item-action-grid">
          <div class="item-action-control">
            <span>Order</span>
            <div class="item-action-stepper">
              <button type="button" data-item-modal-action="order-minus" aria-label="Reduce ${product.name} order">−</button>
              <strong>${orderQty}</strong>
              <button type="button" data-item-modal-action="order-plus" aria-label="Add ${product.name} order">+</button>
            </div>
            <em>Pack ${product.orderIncrement} ${unit} · cost ₹${orderLineCost.toLocaleString()} · margin ₹${orderLineMargin.toLocaleString()}</em>
          </div>

          <div class="item-action-control ${canRemove ? '' : 'disabled'}">
            <span>Discard</span>
            <div class="item-action-stepper">
              <button type="button" data-item-modal-action="remove-minus" aria-label="Reduce ${product.name} discard">−</button>
              <strong>${removeQty}</strong>
              <button type="button" data-item-modal-action="remove-plus" aria-label="Discard ${product.name}" ${canRemove ? '' : 'disabled'}>+</button>
            </div>
            <em>${canRemove ? `Max ${currentStock} ${unit}` : 'No stock'}</em>
          </div>
        </div>

        <div class="item-action-offers">
          <div>
            <span>Shelf offer</span>
            <strong>${discount === 0 ? 'No discount' : `${discount}% off selling price`}</strong>
            <em>${discount === 0 ? 'No shelf discount saved' : 'Applies to stock already on the shelf next day'}</em>
          </div>
          <div class="item-action-offer-chips">
            ${[0, 10, 15, 20].map((pct) => `
              <button
                type="button"
                class="${discount === pct ? 'active' : ''}"
                data-item-modal-discount="${pct}"
              >
                ${pct === 0 ? 'No offer' : `${pct}% off`}
              </button>
            `).join('')}
          </div>
        </div>
        ${this.renderPerishabilitySignal(projectedPerishability, product.unit)}
        <div class="item-cart-save-row">
          <button
            class="btn item-cart-save-btn"
            type="button"
            data-item-modal-save
            ${hasDraftChanges ? '' : 'disabled'}
          >
            ${saveButtonLabel}
          </button>
        </div>
      </section>
    `;
  }

  private formatCompactItemCart(orderQty: number, removeQty: number, discountPct: number, unit: string): string {
    const parts = [`${orderQty}${unit}`];
    if (removeQty > 0) parts.push(`discard ${removeQty}${unit}`);
    if (discountPct > 0) parts.push(`${discountPct}% off`);
    return parts.join(' · ');
  }

  private renderOpeningItemDetails(product: (typeof PRODUCTS)[number]): string {
    const productId = product.id;
    const unit = this.shortUnit(product.unit) || product.unit;
    const plannedQty = this.orderBasket[productId] ?? 0;
    const lineCost = plannedQty * product.costPrice;
    const plannedMargin = plannedQty * product.margin;

    return `
      <div class="item-trend-empty item-opening-details">
        <strong>No history yet</strong>
        <span>Buy opening stock, then run Day 1.</span>
      </div>
      <div class="item-trend-summary">
        ${this.renderTrendSummaryCard('Cart', `${plannedQty} ${unit}`, plannedQty > 0 ? 'positive' : 'warning')}
        ${this.renderTrendSummaryCard('Cost', `₹${lineCost.toLocaleString()}`, lineCost > 0 ? 'neutral' : 'warning')}
        ${this.renderTrendSummaryCard('Margin', `₹${plannedMargin.toLocaleString()}`, plannedMargin > 0 ? 'positive' : 'neutral')}
        ${this.renderTrendSummaryCard('Shelf life', `${product.shelfLife} days`, product.shelfLife <= 3 ? 'warning' : 'positive')}
      </div>
    `;
  }

  private getItemTrendRows(productId: ProductId, state: GameState): Array<DayResult['inventoryMovements'][number] & { day: number }> {
    return state.history
      .map((log) => {
        const movement = log.results.inventoryMovements.find((row) => row.productId === productId);
        return movement ? { ...movement, day: log.day } : undefined;
      })
      .filter((row): row is DayResult['inventoryMovements'][number] & { day: number } => Boolean(row))
      .sort((a, b) => a.day - b.day);
  }

  private getPlanningEnvironment(state: GameState): EnvironmentSignalReport {
    const latestLog = state.history[state.history.length - 1];
    const engine = new EnvironmentSignalEngine();
    if (!latestLog) {
      return engine.buildOpening({
        maxDays: DEFAULT_CONFIG.maxDays,
        customers: state.customers,
      });
    }

    return engine.build({
      completedDay: latestLog.results.day,
      maxDays: DEFAULT_CONFIG.maxDays,
      customers: state.customers,
      result: latestLog.results,
    });
  }

  private isCustomerLikelyForPlanningDay(day: number, customer: CustomerProfile): boolean {
    const cadence = Math.max(1, customer.cadence);
    if (cadence === 1 || (day + customer.visitOffset) % cadence === 0) return true;
    if (day >= 4 && day <= 6 && customer.segment === 'student') return true;
    if (day >= 12 && day <= 14 && ['family', 'student', 'snack'].includes(customer.segment)) return true;
    return false;
  }

  private getRecentItemVisitCounts(productId: ProductId, state: GameState): number[] {
    return state.history.slice(-3).map((log) =>
      log.results.customerVisits.filter((visit) =>
        visit.requested.some((line) => line.productId === productId)
      ).length
    );
  }

  private formatSegmentCounts(customers: CustomerProfile[]): string {
    const counts = customers.reduce<Partial<Record<CustomerProfile['segment'], number>>>((acc, customer) => {
      acc[customer.segment] = (acc[customer.segment] ?? 0) + 1;
      return acc;
    }, {});

    return Object.entries(counts)
      .filter(([, count]) => (count ?? 0) > 0)
      .map(([segment, count]) => `${this.segmentLabel(segment as CustomerProfile['segment'])} ${count}`)
      .join(' · ');
  }

  private getItemEnvironmentPressure(
    product: (typeof PRODUCTS)[number],
    environment: EnvironmentSignalReport
  ): { label: string; tone: 'positive' | 'warning' | 'negative' | 'neutral'; drivers: string[] } {
    const drivers: string[] = [];
    let score = 0;
    const weather = environment.tomorrowWeather.weather;
    const day = environment.planningDay;
    const isWeekend = environment.dayName === 'Saturday' || environment.dayName === 'Sunday';
    const isSchoolWindow = day >= 4 && day <= 6;
    const isFestivalWindow = day >= 12 && day <= 14;
    const isMonthEnd = day >= 25;
    const add = (points: number, text: string) => {
      score += points;
      drivers.push(text);
    };

    if (product.id === 'cold_drinks') {
      if (weather === 'very_hot') add(3, 'Very hot weather lifts cold-drink stops.');
      else if (weather === 'hot') add(2, 'Hot weather lifts cold-drink demand.');
      else if (weather === 'rainy') add(-1, 'Rain can soften cold-drink impulse buying.');
      if (isWeekend) add(1, 'Weekend adds family and walk-in drink pressure.');
      if (isSchoolWindow) add(1, 'School rhythm can add student drink demand.');
      if (isFestivalWindow) add(2, 'Festival window lifts drink and snack baskets.');
      if (isMonthEnd) add(-1, 'Month-end can reduce impulse drinks.');
    } else if (product.id === 'maggi') {
      if (weather === 'rainy') add(3, 'Rain lifts comfort purchases like Maggi.');
      if (isSchoolWindow) add(2, 'School rhythm lifts quick student snacks.');
      if (isWeekend) add(1, 'Weekend snacking can lift Maggi.');
    } else if (product.id === 'chips') {
      if (isWeekend) add(2, 'Weekend lifts snack pressure.');
      if (isSchoolWindow) add(2, 'School rhythm lifts student snacks.');
      if (isFestivalWindow) add(3, 'Festival pressure lifts snack add-ons.');
      if (isMonthEnd) add(-1, 'Month-end can soften impulse snacks.');
    } else if (product.id === 'bread') {
      if (weather === 'rainy') add(1, 'Rain can lift bread with comfort baskets.');
      if (day <= 5) add(1, 'Month-start routines support bread.');
      if (isSchoolWindow) add(2, 'School tiffin rhythm lifts bread.');
    } else if (product.id === 'milk') {
      if (day <= 5) add(2, 'Month-start household routines support milk.');
      if (isSchoolWindow) add(1, 'School mornings lift milk routines.');
      if (weather === 'very_hot') add(1, 'Very hot weather can lift fridge-sensitive milk demand.');
    } else if (product.id === 'eggs') {
      if (day <= 5) add(1, 'Month-start routines support eggs.');
      if (isSchoolWindow) add(1, 'School breakfast rhythm can lift eggs.');
    } else if (product.id === 'bananas') {
      if (weather === 'hot' || weather === 'very_hot') add(1, 'Heat can lift quick fresh purchases.');
      if (weather === 'rainy') add(-1, 'Rain can reduce casual counter fruit buying.');
    }

    if (drivers.length === 0) drivers.push(environment.marketSignals[0] ?? 'Routine demand expected.');

    if (score >= 3) return { label: 'High', tone: 'positive', drivers };
    if (score >= 1) return { label: 'Rising', tone: 'warning', drivers };
    if (score <= -1) return { label: 'Soft', tone: 'negative', drivers };
    return { label: 'Normal', tone: 'neutral', drivers };
  }

  private getItemWalkInPressure(
    product: (typeof PRODUCTS)[number],
    environment: EnvironmentSignalReport,
    itemTone: 'positive' | 'warning' | 'negative' | 'neutral'
  ): { label: string; buffer: number } {
    const isImpulse = product.category.includes('snack') || product.category.includes('event');
    const isWeekend = environment.dayName === 'Saturday' || environment.dayName === 'Sunday';
    const hotWeather = environment.tomorrowWeather.weather === 'hot' || environment.tomorrowWeather.weather === 'very_hot';
    const rainy = environment.tomorrowWeather.weather === 'rainy';

    if (itemTone === 'negative' || rainy && isImpulse) return { label: 'low', buffer: 0 };
    if (isImpulse && (hotWeather || isWeekend || itemTone === 'positive')) return { label: 'high', buffer: 3 };
    if (isImpulse || itemTone === 'warning') return { label: 'medium', buffer: 2 };
    return { label: 'low', buffer: 1 };
  }

  private getOpeningShelf(row: DayResult['inventoryMovements'][number]): number {
    return Math.max(0, row.openingShelf ?? row.available ?? (row.opening + row.ordered - row.removed));
  }

  private renderTrendSummaryCard(label: string, value: string, tone: 'positive' | 'warning' | 'negative' | 'neutral'): string {
    return `
      <div class="item-trend-summary-card ${tone}">
        <span>${label}</span>
        <strong>${value}</strong>
      </div>
    `;
  }

  private renderItemTrendChart(rows: Array<DayResult['inventoryMovements'][number] & { day: number }>): string {
    const maxDemand = Math.max(1, ...rows.map((row) => row.sold + row.missedDemand + row.wasted));
    return `
      <div class="item-trend-chart" aria-label="Day-wise item trend">
        <div class="item-trend-chart-legend">
          <span><i class="sold"></i>Sold</span>
          <span><i class="missed"></i>Missed</span>
          <span><i class="wasted"></i>Waste</span>
        </div>
        ${rows.map((row) => {
          const soldPct = Math.max(row.sold > 0 ? 3 : 0, Math.round((row.sold / maxDemand) * 100));
          const missedPct = Math.max(row.missedDemand > 0 ? 3 : 0, Math.round((row.missedDemand / maxDemand) * 100));
          const wastedPct = Math.max(row.wasted > 0 ? 3 : 0, Math.round((row.wasted / maxDemand) * 100));
          return `
            <div class="item-trend-chart-row ${row.missedDemand > 0 ? 'missed-day' : ''}">
              <span>Day ${row.day}</span>
              <div class="item-trend-track">
                <i class="sold" style="width: ${soldPct}%"></i>
                <i class="missed" style="width: ${missedPct}%"></i>
                <i class="wasted" style="width: ${wastedPct}%"></i>
              </div>
              <strong>${row.sold + row.missedDemand}</strong>
            </div>
          `;
        }).join('')}
      </div>
    `;
  }

  private renderItemTrendTable(rows: Array<DayResult['inventoryMovements'][number] & { day: number }>, unit: string): string {
    return `
      <div class="item-trend-table-wrap">
        <table class="item-trend-table">
          <thead>
            <tr>
              <th>Day</th>
              <th>Opening Shelf</th>
              <th>Demand</th>
              <th>Sold</th>
              <th>Missed</th>
              <th>Closing</th>
              <th>Waste</th>
              <th>Ordered</th>
              <th>Offer</th>
            </tr>
          </thead>
          <tbody>
            ${rows.map((row) => `
              <tr class="${row.missedDemand > 0 ? 'attention' : ''}">
                <td>Day ${row.day}</td>
                <td>${this.getOpeningShelf(row)} ${unit}</td>
                <td>${row.sold + row.missedDemand} ${unit}</td>
                <td>${row.sold} ${unit}</td>
                <td>${row.missedDemand} ${unit}</td>
                <td>${row.closing} ${unit}</td>
                <td>${row.wasted} ${unit}</td>
                <td>${row.ordered} ${unit}</td>
                <td>${row.offerPct > 0 ? `${row.offerPct}%` : 'None'}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    `;
  }

  private attachMarketingListeners(onChange: () => void) {
    document.querySelectorAll<HTMLElement>('.marketing-campaign-toggle').forEach((btn) => {
      if (btn.dataset.bound === 'true') return;
      btn.dataset.bound = 'true';
      btn.addEventListener('click', (event) => {
        const specId = (event.currentTarget as HTMLElement).dataset.marketing;
        if (!specId) return;
        this.toggleMarketingCampaign(specId);
        onChange();
      });
    });
    document.querySelectorAll<HTMLElement>('[data-marketing-product]').forEach((btn) => {
      if (btn.dataset.bound === 'true') return;
      btn.dataset.bound = 'true';
      btn.addEventListener('click', (event) => {
        event.stopPropagation();
        const specId = (event.currentTarget as HTMLElement).dataset.marketingProduct;
        const productId = (event.currentTarget as HTMLElement).dataset.product as ProductId | undefined;
        if (!specId || !productId) return;
        this.toggleMarketingProduct(specId, productId);
        onChange();
      });
    });
  }

  private refreshCasePlanningUI(result: DayResult, state: GameState) {
    const scrollTop = this.container.scrollTop;
    this._renderCaseUI(result, state, this.currentCaseDayContext, this.currentCaseAIInsightStatus);
    this.container.scrollTop = scrollTop;
  }

  private toggleMarketingCampaign(specId: string) {
    if (this.selectedMarketingIds.has(specId)) {
      this.selectedMarketingIds.delete(specId);
    } else {
      this.selectedMarketingIds.add(specId);
      this.ensureMarketingProductSelection(specId);
    }
  }

  private toggleMarketingProduct(specId: string, productId: ProductId) {
    const selectedProducts = this.ensureMarketingProductSelection(specId);
    if (selectedProducts.has(productId) && selectedProducts.size > 1) {
      selectedProducts.delete(productId);
    } else {
      selectedProducts.add(productId);
    }
    this.selectedMarketingIds.add(specId);
  }

  private attachListeners() {
    // Product card clicks (add to order)
    document.querySelectorAll('.product-card').forEach(card => {
      card.addEventListener('click', (e) => {
        const target = e.target as HTMLElement;
        if (target.closest('.discount-chip-btn')) return;
        const pid = (e.currentTarget as HTMLElement).dataset.product! as ProductId;
        this.addToBasket(pid);
      });
    });

    // Discount chips
    document.querySelectorAll('.discount-chip-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const el = e.currentTarget as HTMLElement;
        const pid = el.dataset.product! as ProductId;
        const discount = parseInt(el.dataset.discount!);
        this.discountMap[pid] = discount;
        this.emitPlanChange();
        // Re-render just the product cards and basket
        this.refreshMorningUI();
      });
    });

    // Basket steppers
    document.querySelectorAll('.stepper-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const el = e.currentTarget as HTMLElement;
        const pid = el.dataset.product! as ProductId;
        const action = el.dataset.action;
        if (action === 'plus') {
          this.incrementBasket(pid);
        } else {
          this.decrementBasket(pid);
        }
      });
    });

    // Sliders
    const cashSlider = document.getElementById('cash-reserve-slider') as HTMLInputElement;
    const milkSlider = document.getElementById('fridge-milk-slider') as HTMLInputElement;
    const cdSlider = document.getElementById('fridge-cd-slider') as HTMLInputElement;

    cashSlider?.addEventListener('input', (e) => {
      this.cashReserve = parseInt((e.target as HTMLInputElement).value);
      document.getElementById('cash-reserve-val')!.textContent = `₹${this.cashReserve.toLocaleString()}`;
      this.emitPlanChange();
      this.refreshBasketAndRisk();
    });

    milkSlider?.addEventListener('input', (e) => {
      this.fridgeAlloc.milk = parseInt((e.target as HTMLInputElement).value);
      this.fridgeAlloc.cold_drinks = Math.min(100 - this.fridgeAlloc.milk, this.fridgeAlloc.cold_drinks);
      this.fridgeAlloc.buffer = Math.max(0, 100 - this.fridgeAlloc.milk - this.fridgeAlloc.cold_drinks);
      this.emitPlanChange();
      this.refreshSliders();
    });

    cdSlider?.addEventListener('input', (e) => {
      this.fridgeAlloc.cold_drinks = parseInt((e.target as HTMLInputElement).value);
      this.fridgeAlloc.milk = Math.min(100 - this.fridgeAlloc.cold_drinks, this.fridgeAlloc.milk);
      this.fridgeAlloc.buffer = Math.max(0, 100 - this.fridgeAlloc.milk - this.fridgeAlloc.cold_drinks);
      this.emitPlanChange();
      this.refreshSliders();
    });
  }

  private getCurrentActions(): PlayerActions {
    return {
      orders: { ...this.orderBasket },
      removals: { ...this.removalMap },
      discounts: { ...this.discountMap },
      khataReminders: Array.from(this.khataReminderIds),
      marketingActions: Array.from(this.selectedMarketingIds).map((specId) => ({
        specId,
        targetProducts: Array.from(this.ensureMarketingProductSelection(specId)),
      })),
      cashReserve: this.cashReserve,
      fridgeAllocation: { ...this.fridgeAlloc },
    };
  }

  private emitPlanChange() {
    this.planError = undefined;
    this.onPlanChange(this.getCurrentActions());
  }

  private isPlanAffordable(state: GameState): boolean {
    return this.getOrderCost() + this.getMarketingCost() <= state.cash;
  }

  private getPlanAffordabilityMessage(state: GameState): string {
    const planCost = this.getOrderCost() + this.getMarketingCost();
    return `Plan costs ₹${planCost.toLocaleString()}, but cash is ₹${Math.round(state.cash).toLocaleString()}.`;
  }

  private refreshMorningUI() {
    if (!this._currentState) return;
    const state = this._currentState;
    const productGrid = document.querySelector('.product-grid')?.parentElement;
    const oldBasket = document.getElementById('basket-panel');
    const oldRisk = document.getElementById('risk-panel');

    if (productGrid) {
      productGrid.outerHTML = this.renderProductCards(state);
    }
    if (oldBasket) {
      oldBasket.outerHTML = this.renderOrderBasket(state);
    }
    if (oldRisk) {
      oldRisk.outerHTML = this.renderRiskPreview(state);
    }

    this.attachListeners();
  }

  private refreshBasketAndRisk() {
    this.refreshMorningUI();
  }

  private addToBasket(pid: ProductId) {
    const prod = PRODUCTS.find(p => p.id === pid);
    if (!prod) return;
    const current = this.orderBasket[pid] ?? 0;
    this.orderBasket[pid] = current + prod.orderIncrement;
    this.emitPlanChange();
    this.refreshBasketAndRisk();
  }

  private incrementBasket(pid: ProductId) {
    const prod = PRODUCTS.find(p => p.id === pid);
    if (!prod) return;
    const current = this.orderBasket[pid] ?? 0;
    this.orderBasket[pid] = current + prod.orderIncrement;
    this.emitPlanChange();
    this.refreshBasketAndRisk();
  }

  private decrementBasket(pid: ProductId) {
    const prod = PRODUCTS.find(p => p.id === pid);
    if (!prod) return;
    const current = this.orderBasket[pid] ?? 0;
    const next = current - prod.orderIncrement;
    if (next <= 0) {
      delete this.orderBasket[pid];
    } else {
      this.orderBasket[pid] = next;
    }
    this.emitPlanChange();
    this.refreshBasketAndRisk();
  }

  private refreshSliders() {
    const milkVal = document.getElementById('fridge-milk-val');
    const cdVal = document.getElementById('fridge-cd-val');
    if (milkVal) milkVal.textContent = `${this.fridgeAlloc.milk}%`;
    if (cdVal) cdVal.textContent = `${this.fridgeAlloc.cold_drinks}%`;
  }

  // ===== HELPERS =====

  private getStarterInventoryPlan(): Partial<Record<ProductId, number>> {
    return {
      milk: 25,
      bread: 10,
      eggs: 24,
      maggi: 20,
      chips: 20,
      cold_drinks: 12,
      bananas: 4,
    };
  }

  private getOpeningStockLineCount(): number {
    return Object.values(this.orderBasket).filter((qty) => (qty ?? 0) > 0).length;
  }

  private getProjectedOpeningFridgeUnits(): number {
    return Object.entries(this.orderBasket).reduce((sum, [pid, qty]) => {
      const product = PRODUCTS.find((p) => p.id === pid);
      if (!product || product.storage !== 'fridge') return sum;
      return sum + (qty ?? 0) * product.storageUnits;
    }, 0);
  }

  private getPriorityCustomers(state: GameState, limit: number): CustomerProfile[] {
    return [...state.customers]
      .sort((a, b) => this.customerPriorityScore(b, state.day) - this.customerPriorityScore(a, state.day))
      .slice(0, limit);
  }

  private getOrderCost(): number {
    return Object.entries(this.orderBasket).reduce((sum, [pid, qty]) => {
      const product = PRODUCTS.find((p) => p.id === pid);
      return sum + ((qty ?? 0) * (product?.costPrice ?? 0));
    }, 0);
  }

  private getMarketingCost(): number {
    return Array.from(this.selectedMarketingIds).reduce((sum, specId) => {
      const campaign = getMarketingCampaign(specId);
      return sum + (campaign?.cost ?? 0);
    }, 0);
  }

  private getCampaignInventoryWarning(campaign: MarketingCampaignSpec, state: GameState): string {
    const weakProducts = this.getSelectedMarketingProducts(campaign)
      .filter((productId) => {
        const product = PRODUCTS.find((item) => item.id === productId);
        if (!product) return false;
        const current = state.getProductInventory(productId)?.totalStock ?? 0;
        const ordered = this.orderBasket[productId] ?? 0;
        const removed = this.removalMap[productId] ?? 0;
        return Math.max(0, current + ordered - removed) < product.baseDemand * 0.55;
      })
      .map((productId) => PRODUCTS.find((product) => product.id === productId)?.name ?? productId)
      .slice(0, 3);

    return weakProducts.length > 0 ? `Low support stock: ${weakProducts.join(', ')}` : '';
  }

  private ensureMarketingProductSelection(specId: string): Set<ProductId> {
    const campaign = getMarketingCampaign(specId);
    const existing = this.marketingProductSelections[specId];
    if (existing && existing.size > 0) return existing;
    const created = new Set<ProductId>(campaign?.targetProducts ?? []);
    this.marketingProductSelections[specId] = created;
    return created;
  }

  private getSelectedMarketingProducts(campaign: MarketingCampaignSpec): ProductId[] {
    return Array.from(this.ensureMarketingProductSelection(campaign.id))
      .filter((productId) => campaign.targetProducts.includes(productId));
  }

  private getCampaignTargetProductsForInstance(
    campaign: MarketingCampaignInstance,
    spec: MarketingCampaignSpec
  ): ProductId[] {
    const selected = campaign.targetProducts?.filter((productId) => spec.targetProducts.includes(productId));
    return selected && selected.length > 0 ? selected : spec.targetProducts;
  }

  private getTotalItemsSold(result: DayResult): number {
    return result.inventoryMovements.reduce((sum, row) => sum + row.sold, 0);
  }

  private getTotalMissedDemand(result: DayResult): number {
    return result.inventoryMovements.reduce((sum, row) => sum + row.missedDemand, 0);
  }

  private getTotalRevenue(result: DayResult): number {
    return result.productResults.reduce((sum, row) => sum + row.revenue, 0);
  }

  private getFinancialSummary(result: DayResult, state?: GameState, knownLog?: DayLog): FinancialSummary {
    const log = knownLog ?? state?.history.find((entry) => entry.day === result.day);
    const revenue = Math.round(result.productResults.reduce((sum, row) => sum + row.revenue, 0));
    const costOfGoods = Math.round(result.productResults.reduce((sum, row) => sum + row.costOfGoods, 0));
    const grossMargin = revenue - costOfGoods;
    const purchaseSpend = this.getActionPurchaseSpend(log?.playerActions, result);
    const marketingSpend = Math.round(result.marketingPerformance?.spendToday ?? this.getActionMarketingSpend(log?.playerActions));
    const wasteLoss = Math.round(result.wasteLoss);
    const removalLoss = Math.round(result.removalLoss);
    const operatingProfit = grossMargin - wasteLoss - removalLoss - marketingSpend;
    const cashChange = Math.round(result.cash - (log?.visibleStateBefore.cash ?? (result.cash - operatingProfit)));

    return {
      revenue,
      costOfGoods,
      grossMargin,
      purchaseSpend,
      marketingSpend,
      wasteLoss,
      removalLoss,
      operatingProfit,
      cashChange,
    };
  }

  private getRunFinancialSummary(state: GameState): FinancialSummary {
    return state.history.reduce<FinancialSummary>((sum, log) => {
      const day = this.getFinancialSummary(log.results, undefined, log);
      return {
        revenue: sum.revenue + day.revenue,
        costOfGoods: sum.costOfGoods + day.costOfGoods,
        grossMargin: sum.grossMargin + day.grossMargin,
        purchaseSpend: sum.purchaseSpend + day.purchaseSpend,
        marketingSpend: sum.marketingSpend + day.marketingSpend,
        wasteLoss: sum.wasteLoss + day.wasteLoss,
        removalLoss: sum.removalLoss + day.removalLoss,
        operatingProfit: sum.operatingProfit + day.operatingProfit,
        cashChange: sum.cashChange + day.cashChange,
      };
    }, {
      revenue: 0,
      costOfGoods: 0,
      grossMargin: 0,
      purchaseSpend: 0,
      marketingSpend: 0,
      wasteLoss: 0,
      removalLoss: 0,
      operatingProfit: 0,
      cashChange: 0,
    });
  }

  private getActionPurchaseSpend(actions: PlayerActions | undefined, result: DayResult): number {
    if (actions) {
      return Math.round(Object.entries(actions.orders).reduce((sum, [productId, quantity]) => {
        const product = PRODUCTS.find((item) => item.id === productId);
        return sum + (quantity ?? 0) * (product?.costPrice ?? 0);
      }, 0));
    }

    return Math.round(result.inventoryMovements.reduce((sum, row) => {
      const product = PRODUCTS.find((item) => item.id === row.productId);
      return sum + row.ordered * (product?.costPrice ?? 0);
    }, 0));
  }

  private getActionMarketingSpend(actions?: PlayerActions): number {
    return Math.round((actions?.marketingActions ?? []).reduce((sum, selection) => {
      return sum + (getMarketingCampaign(selection.specId)?.cost ?? 0);
    }, 0));
  }

  private getMissedRevenue(result: DayResult): number {
    return result.inventoryMovements.reduce((sum, row) => {
      const product = PRODUCTS.find((p) => p.id === row.productId);
      return sum + row.missedDemand * (product?.sellPrice ?? 0);
    }, 0);
  }

  private getDailyShopStatus(result: DayResult): { label: string; detail: string; tone: 'positive' | 'negative' | 'warning' | 'neutral' } {
    const score = result.rewardBreakdown.total;
    const totalMissed = this.getTotalMissedDemand(result);

    if (result.stockouts >= 5) {
      return { label: 'Critical Stockouts', detail: 'Order missed essentials tomorrow', tone: 'negative' };
    }
    if (result.trust <= 35) {
      return { label: 'Trust Critical', detail: 'Regulars are losing confidence', tone: 'negative' };
    }
    if (score < -80) {
      return { label: 'Bad Trading Day', detail: 'Review stock and khata actions', tone: 'negative' };
    }
    if (score < 0 || result.stockouts > 0 || totalMissed > 0) {
      return { label: 'Missed Demand', detail: 'Restock items customers asked for', tone: 'warning' };
    }
    if (score >= 70 && result.trustChange >= 0) {
      return { label: 'Strong Service', detail: 'Customers mostly got what they wanted', tone: 'positive' };
    }
    return { label: 'Stable Shop', detail: 'Keep checking closing stock', tone: 'neutral' };
  }

  private getTotalKhataDue(state: GameState): number {
    return state.customers.reduce((sum, customer) => sum + customer.khataBalance, 0);
  }

  private formatSignedCurrency(value: number): string {
    const sign = value >= 0 ? '+' : '-';
    return `${sign}₹${Math.abs(Math.round(value)).toLocaleString()}`;
  }

  private formatSignedNumber(value: number): string {
    return `${value >= 0 ? '+' : ''}${value}`;
  }

  private formatPayment(visit: CustomerVisit): string {
    if (visit.paymentMode === 'none') {
      return '<span class="payment-chip none">No sale</span>';
    }
    if (visit.paymentMode === 'khata') {
      return `<span class="payment-chip khata">Khata ₹${visit.khataAmount.toLocaleString()}</span>`;
    }
    return `<span class="payment-chip paid">Paid quickly ₹${visit.amountPaid.toLocaleString()}</span>`;
  }

  private customerPriorityScore(customer: CustomerProfile, day: number): number {
    const dueToday = customer.cadence === 1 || (day + customer.visitOffset) % customer.cadence === 0;
    const riskWeight = customer.trust < 65 ? 30 : 0;
    const failureWeight = customer.failedVisits * 12;
    return (dueToday ? 100 : 0) + customer.visitCount * 8 + riskWeight + failureWeight;
  }

  private formatOrderLines(lines: CustomerOrderLine[], compact = false): string {
    if (lines.length === 0) return 'none';
    const visibleLines = compact ? lines.slice(0, 3) : lines;
    const formatted = visibleLines.map((line) => {
      const product = PRODUCTS.find((p) => p.id === line.productId);
      const name = product?.name ?? line.productId;
      const unit = this.shortUnit(product?.unit ?? '');
      return `${name} ${line.quantity}${unit ? ` ${unit}` : ''}`;
    });
    const remaining = lines.length - visibleLines.length;
    return `${formatted.join(', ')}${remaining > 0 ? ` +${remaining}` : ''}`;
  }

  private shortUnit(unit: string): string {
    const map: Record<string, string> = {
      packs: 'pk',
      packets: 'pk',
      bottles: 'bt',
      eggs: 'eggs',
      kg: 'kg',
      L: 'L',
    };
    return map[unit] ?? unit;
  }

  private segmentLabel(segment: CustomerProfile['segment']): string {
    const labels: Record<CustomerProfile['segment'], string> = {
      regular: 'Regular',
      student: 'Student',
      family: 'Family',
      office: 'Office',
      bulk: 'Bulk',
      snack: 'Snack',
      walkin: 'Walk-in',
    };
    return labels[segment];
  }

  private outcomeLabel(outcome: CustomerVisit['outcome']): string {
    const labels: Record<CustomerVisit['outcome'], string> = {
      fulfilled: 'Served',
      partial: 'Partial',
      missed: 'Missed',
    };
    return labels[outcome];
  }

  private weatherLabel(weather: WeatherOutlookDay['weather']): string {
    const labels: Record<WeatherOutlookDay['weather'], string> = {
      normal: 'Normal',
      hot: 'Hot',
      very_hot: 'Very hot',
      rainy: 'Rainy',
    };
    return labels[weather];
  }

  private weatherIcon(weather: WeatherOutlookDay['weather']): string {
    const labels: Record<WeatherOutlookDay['weather'], string> = {
      normal: 'Clear',
      hot: 'Hot',
      very_hot: 'Heat',
      rainy: 'Rain',
    };
    return labels[weather];
  }

  private titleCase(value: string): string {
    return value.charAt(0).toUpperCase() + value.slice(1);
  }

  private getTodaysEvents(day: number): Array<{ title: string; text: string }> {
    if (day >= 12 && day <= 14) {
      return [{ title: 'Festival Weekend', text: 'Cold drinks +80%, Chips +65%, Milk +25%. Supplier prices up 12%.' }];
    }
    if (day === 3) {
      return [{ title: 'Evening Milk Rush', text: 'Milk demand expected to spike between 5PM-8PM. Stock up early.' }];
    }
    if (day === 7) {
      return [{ title: 'Supplier Delay Risk', text: 'Your usual supplier may be delayed. Emergency restock will be expensive.' }];
    }
    if (day === 18) {
      return [{ title: 'Heat Wave', text: 'Temperature rising. Cold drinks demand will spike. Fridge space is critical.' }];
    }
    if (day >= 4 && day <= 6) {
      return [{ title: 'School Reopening', text: 'Maggi, bread, and milk demand increasing as schools reopen.' }];
    }
    return [];
  }

  private getPerformanceRating(
    score: number,
    finalTrust: number,
    stockoutIncidents: number,
    regularsKept: number,
    maxDays: number
  ): string {
    if (finalTrust < 25 || regularsKept === 0 || stockoutIncidents > maxDays * 4) return 'Shop in Crisis';
    if (finalTrust < 50 || regularsKept < 3 || stockoutIncidents > maxDays * 2) return 'Needs Recovery';
    if (score >= 900 && finalTrust >= 75 && regularsKept >= 6 && stockoutIncidents <= 15) return 'Kirana King';
    if (score >= 600 && finalTrust >= 65 && regularsKept >= 5 && stockoutIncidents <= 35) return 'Seasoned Shopkeeper';
    if (score >= 250 && finalTrust >= 50 && regularsKept >= 3) return 'Learning the Ropes';
    return 'Needs Business School';
  }

  private renderKeyInsight(result: DayResult): string {
    if (result.stockouts > 0 && result.wasteLoss > 200) {
      return '💡 Insight: You had both stockouts AND waste. Try ordering more of essentials and less of perishables.';
    }
    if (result.stockouts > 0) {
      return '💡 Insight: Stockouts hurt trust. Check demand forecasts and order more of high-trust items like milk and bread.';
    }
    if (result.wasteLoss > 300) {
      return '💡 Insight: High waste. Consider discounting near-expiry stock earlier to clear inventory.';
    }
    if (result.profit > 3000) {
      return '💡 Insight: Strong profit day! Good balance of sales and inventory management.';
    }
    return '💡 Insight: No major issues today. Keep monitoring fridge space and expiry risk.';
  }
}
