import type { DayResult, LLMDayContext, ProductId } from '../../types';
import { PRODUCTS } from '../../constants/products';
import { GameState } from '../GameState';
import type { EnvironmentSignalReport } from './EnvironmentSignalEngine';

type DayContextPhase = 'opening' | 'post_day';

interface ContextRequest {
  phase: DayContextPhase;
  planningDay: number;
  shop: ReturnType<LLMDayContextClient['compactShopState']>;
  environment: ReturnType<LLMDayContextClient['compactEnvironment']>;
  result?: ReturnType<LLMDayContextClient['compactResult']>;
}

export class LLMDayContextClient {
  private readonly endpoint = '/api/llm-day-context';
  private readonly timeoutMs = 65000;
  private cache = new Map<string, Promise<LLMDayContext | undefined>>();

  getOpeningContext(state: GameState, environment: EnvironmentSignalReport): Promise<LLMDayContext | undefined> {
    return this.getContext({
      phase: 'opening',
      planningDay: environment.planningDay,
      shop: this.compactShopState(state),
      environment: this.compactEnvironment(environment),
    });
  }

  getPostDayContext(
    state: GameState,
    result: DayResult,
    environment: EnvironmentSignalReport
  ): Promise<LLMDayContext | undefined> {
    return this.getContext({
      phase: 'post_day',
      planningDay: environment.planningDay,
      shop: this.compactShopState(state),
      environment: this.compactEnvironment(environment),
      result: this.compactResult(result),
    });
  }

  private getContext(request: ContextRequest): Promise<LLMDayContext | undefined> {
    const cacheKey = `${request.phase}:${request.planningDay}:${request.result?.day ?? 0}:${request.shop.cash}:${request.shop.trust}`;
    const cached = this.cache.get(cacheKey);
    if (cached) return cached;

    const promise = this.fetchContext(request);
    this.cache.set(cacheKey, promise);
    return promise;
  }

  private async fetchContext(request: ContextRequest): Promise<LLMDayContext | undefined> {
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const response = await fetch(this.endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(request),
        signal: controller.signal,
      });

      if (!response.ok) {
        if (import.meta.env.DEV) {
          const detail = await response.text().catch(() => '');
          console.warn('[kirana llm] Day context request failed', response.status, detail.slice(0, 300));
        }
        return undefined;
      }
      const data = await response.json();
      return this.normalizeContext(data);
    } catch (error) {
      if (import.meta.env.DEV) {
        console.warn('[kirana llm] Day context request unavailable', error);
      }
      return undefined;
    } finally {
      window.clearTimeout(timeout);
    }
  }

  private compactShopState(state: GameState) {
    return {
      day: state.day,
      cash: Math.round(state.cash),
      trust: Math.round(state.trust),
      weather: state.weather,
      inventory: PRODUCTS.map((product) => ({
        productId: product.id,
        name: product.name,
        stock: state.getProductInventory(product.id)?.totalStock ?? 0,
        unit: product.unit,
        storage: product.storage,
        trustImpact: product.trustImpact,
        perishabilityFactor: product.perishabilityFactor,
      })),
      customerMemory: state.getCustomerMemorySummary(),
      historySummary: state.history.slice(-3).map((log) => ({
        day: log.day,
        revenue: log.results.customerVisits.reduce((sum, visit) => sum + visit.revenue, 0),
        missedUnits: log.results.inventoryMovements.reduce((sum, row) => sum + row.missedDemand, 0),
        stockouts: log.results.stockouts,
        trustChange: log.results.trustChange,
        score: log.results.rewardBreakdown.total,
      })),
    };
  }

  private compactEnvironment(environment: EnvironmentSignalReport) {
    return {
      planningDay: environment.planningDay,
      dayName: environment.dayName,
      dateLabel: environment.dateLabel,
      weekLabel: environment.weekLabel,
      monthPhase: environment.monthPhase,
      weekendText: environment.weekendText,
      tomorrowWeather: environment.tomorrowWeather,
      week: environment.week,
      deterministicSignals: {
        calendar: environment.calendarSignals,
        customers: environment.customerSignals,
        market: environment.marketSignals,
        shopMemory: environment.shopMemorySignals,
      },
    };
  }

  private compactResult(result: DayResult) {
    return {
      day: result.day,
      cash: result.cash,
      trust: Math.round(result.trust),
      trustChange: result.trustChange,
      stockouts: result.stockouts,
      khataAdded: result.khataAdded,
      khataCollected: result.khataCollected,
      score: result.rewardBreakdown.total,
      rewardBreakdown: result.rewardBreakdown,
      inventory: result.inventoryMovements.map((row) => ({
        productId: row.productId,
        name: this.productName(row.productId),
        opening: row.openingShelf ?? row.available,
        beforeOrder: row.opening,
        ordered: row.ordered,
        sold: row.sold,
        closing: row.closing,
        missedDemand: row.missedDemand,
        wasted: row.wasted,
        perishability: row.perishability.statusLabel,
      })),
      customerExceptions: result.customerVisits
        .filter((visit) => visit.outcome !== 'fulfilled' || visit.paymentMode === 'khata')
        .slice(0, 8)
        .map((visit) => ({
          customer: visit.customerName,
          segment: visit.segment,
          outcome: visit.outcome,
          missed: visit.missed,
          paymentMode: visit.paymentMode,
          khataAmount: visit.khataAmount,
          trustDelta: visit.trustDelta,
        })),
    };
  }

  private normalizeContext(data: unknown): LLMDayContext | undefined {
    return this.normalizeFlexibleContext(data);
  }

  private normalizeFlexibleContext(data: unknown): LLMDayContext | undefined {
    const flat = this.normalizeFlatContext(data);
    if (flat) return flat;
    if (!data || typeof data !== 'object') return undefined;

    const record = data as Record<string, unknown>;
    const dayContext = this.asRecord(record.dayContext);
    const weather = this.asRecord(record.weather);
    const customerMood = this.asRecord(record.customerMood);
    const marketCues = this.asRecord(record.marketCues);
    const inventory = this.asRecord(record.inventory) ?? this.asRecord(record.inventorySignals);
    const dayName = this.readString(dayContext?.dayName);
    const dateLabel = this.readString(dayContext?.dateLabel);
    const weatherText = this.readString(weather?.tomorrow);
    const weatherSignal = this.readString(weather?.signal);
    const customerSentiment = this.readString(customerMood?.sentiment) ?? this.readString(customerMood?.overall);
    const marketFocus = this.flattenStrings(marketCues, 1)[0];
    const generatedTheme = [dayName, dateLabel, weatherText].filter(Boolean).join(' · ');
    const generatedNarrative = [customerSentiment, weatherSignal, marketFocus].filter(Boolean).join(' ');

    const dayTheme = this.readString(record.dayTheme)
      ?? (generatedTheme || undefined)
      ?? 'AI neighborhood read';
    const planningFocus = this.readString(record.planningFocus)
      ?? weatherSignal
      ?? customerSentiment
      ?? marketFocus
      ?? 'Use local demand signals before ordering.';
    const localNarrative = this.readString(record.localNarrative)
      ?? (generatedNarrative || undefined);

    if (!this.isNonEmptyString(dayTheme) || !this.isNonEmptyString(planningFocus) || !this.isNonEmptyString(localNarrative)) {
      return undefined;
    }

    return {
      source: 'llm',
      model: this.readString(record.model),
      dayTheme,
      planningFocus,
      localNarrative,
      neighborhoodSignals: this.withFallback(
        this.cleanList(record.neighborhoodSignals),
        this.flattenStrings(dayContext, 4)
      ),
      customerMoodSignals: this.withFallback(
        this.cleanList(record.customerMoodSignals),
        this.flattenStrings(customerMood, 4)
      ),
      marketSignals: this.withFallback(
        this.cleanList(record.marketSignals),
        this.flattenStrings(marketCues ?? weather, 4)
      ),
      visualCues: this.withFallback(
        this.cleanList(record.visualCues),
        this.flattenStrings(inventory ?? weather, 4)
      ),
      riskNotes: this.withFallback(
        this.cleanList(record.riskNotes),
        [
          ...this.flattenStrings(record.risks, 3),
          ...this.flattenStrings(record.riskNotes, 3),
          ...this.flattenStrings(inventory, 2),
        ].slice(0, 4)
      ),
    };
  }

  private normalizeFlatContext(data: unknown): LLMDayContext | undefined {
    if (!data || typeof data !== 'object') return undefined;
    const record = data as Partial<LLMDayContext>;
    if (!this.isNonEmptyString(record.dayTheme)) return undefined;
    if (!this.isNonEmptyString(record.planningFocus)) return undefined;
    if (!this.isNonEmptyString(record.localNarrative)) return undefined;

    return {
      source: 'llm',
      model: this.isNonEmptyString(record.model) ? record.model : undefined,
      dayTheme: record.dayTheme,
      planningFocus: record.planningFocus,
      localNarrative: record.localNarrative,
      neighborhoodSignals: this.cleanList(record.neighborhoodSignals),
      customerMoodSignals: this.cleanList(record.customerMoodSignals),
      marketSignals: this.cleanList(record.marketSignals),
      visualCues: this.cleanList(record.visualCues),
      riskNotes: this.cleanList(record.riskNotes),
    };
  }

  private cleanList(value: unknown): string[] {
    return Array.isArray(value)
      ? value.filter((item): item is string => this.isNonEmptyString(item)).slice(0, 4)
      : [];
  }

  private withFallback(primary: string[], fallback: string[]): string[] {
    const merged = [...primary, ...fallback]
      .map((item) => item.trim())
      .filter((item, index, list) => item.length > 0 && list.indexOf(item) === index);
    return merged.slice(0, 4);
  }

  private asRecord(value: unknown): Record<string, unknown> | undefined {
    return value && typeof value === 'object' && !Array.isArray(value)
      ? value as Record<string, unknown>
      : undefined;
  }

  private readString(value: unknown): string | undefined {
    return this.isNonEmptyString(value) ? value : undefined;
  }

  private flattenStrings(value: unknown, limit: number): string[] {
    const out: string[] = [];
    const visit = (item: unknown) => {
      if (out.length >= limit) return;
      if (this.isNonEmptyString(item)) {
        out.push(item);
        return;
      }
      if (Array.isArray(item)) {
        for (const entry of item) visit(entry);
        return;
      }
      if (item && typeof item === 'object') {
        for (const entry of Object.values(item as Record<string, unknown>)) visit(entry);
      }
    };

    visit(value);
    return out.slice(0, limit);
  }

  private isNonEmptyString(value: unknown): value is string {
    return typeof value === 'string' && value.trim().length > 0;
  }

  private productName(productId: ProductId): string {
    return PRODUCTS.find((product) => product.id === productId)?.name ?? productId;
  }
}
