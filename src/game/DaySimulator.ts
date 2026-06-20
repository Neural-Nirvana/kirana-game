import type { CustomerSegment, DayResult, MarketingEffect, MarketingPerformance, PlayerActions, ProductId, SimulationResult } from '../types';
import { GameState } from './GameState';
import { InventoryManager } from './InventoryManager';
import { DemandEngine } from './DemandEngine';
import { PRODUCTS, TRUST_BONUSES, TRUST_PENALTIES } from '../constants/products';
import { cloneCustomers } from '../constants/customers';
import { CustomerDemandPlanner } from './simulation/CustomerDemandPlanner';
import { CUSTOMER_WAVES } from './simulation/types';
import { InventoryLedger } from './simulation/InventoryLedger';
import { KhataManager } from './simulation/KhataManager';
import { VisitProcessor } from './simulation/VisitProcessor';
import { ScoringEngine } from './scoring/ScoringEngine';
import { DifficultyEngine } from './progression/DifficultyEngine';
import { EventGenerator } from './progression/EventGenerator';
import { EnvironmentContextEngine } from './progression/EnvironmentContextEngine';

export class DaySimulator {
  private demandEngine: DemandEngine;
  private customerDemandPlanner: CustomerDemandPlanner;
  private visitProcessor = new VisitProcessor();
  private khataManager = new KhataManager();
  private scoringEngine = new ScoringEngine();
  private difficultyEngine = new DifficultyEngine();
  private eventGenerator = new EventGenerator();
  private environmentContextEngine = new EnvironmentContextEngine();
  private events: string[] = [];

  constructor(seed?: number) {
    this.demandEngine = new DemandEngine(seed);
    this.customerDemandPlanner = new CustomerDemandPlanner(this.demandEngine);
  }

  simulateDay(
    state: GameState,
    actions: PlayerActions,
    options: { marketingEffects?: MarketingEffect[]; marketingCost?: number } = {}
  ): DayResult {
    const day = state.day;
    const difficulty = this.difficultyEngine.getProfile(day);
    const weather = this.demandEngine.generateWeather(day);
    state.weather = weather;
    this.events = this.eventGenerator.generate(day, weather, difficulty, () => this.demandEngine.nextRandom());
    const environmentContext = this.environmentContextEngine.build({
      day,
      weather,
      events: this.events,
      difficulty,
      marketingEffects: options.marketingEffects ?? [],
    });

    const inv = new InventoryManager(state.inventory, day);
    let ledger = InventoryLedger.start(inv);
    const customers = cloneCustomers(state.customers);
    const khataCollected = this.khataManager.collectReminders(customers, actions.khataReminders);
    const totalOrderCost = this.applyOrders(inv, ledger, actions, state.cash);
    if (day === 1 && state.history.length === 0) {
      ledger = InventoryLedger.start(inv);
    }
    const totalRemovalLoss = this.applyRemovals(inv, ledger, actions);
    this.applyDiscounts(inv, actions);

    const productResults = this.createProductResults();
    const customerVisits = [];

    for (const wave of CUSTOMER_WAVES) {
      const plannedVisits = this.customerDemandPlanner.planWave({
        customers,
        wave,
        day,
        trust: state.trust,
        weather,
        events: this.events,
        difficulty,
        discounts: actions.discounts,
        marketingEffects: options.marketingEffects ?? [],
        environmentContext,
      });

      for (const planned of plannedVisits) {
        customerVisits.push(this.visitProcessor.processVisit({
          planned,
          inv,
          productResults,
          day,
          khataPressure: difficulty.khataPressure,
          random: () => this.demandEngine.nextRandom(),
        }));
      }
    }

    const { totalRevenue, totalCostOfGoods } = this.finalizeProductMargins(productResults);
    const fridgePressure = this.getFridgePressure(inv, state.config.fridgeCapacity);
    const wasteLog = inv.applyExpiry();
    ledger.recordWaste(wasteLog);
    const totalWasteLoss = wasteLog.reduce((sum, waste) => sum + waste.cost, 0);
    const stockoutCounts = this.getStockoutCounts(productResults);
    const noStockouts = Object.keys(stockoutCounts).length === 0;
    const trustChange = this.calculateTrustChange(stockoutCounts, noStockouts);
    const newTrust = Math.max(0, Math.min(100, state.trust + trustChange));
    const khataAdded = customerVisits.reduce((sum, visit) => sum + visit.khataAmount, 0);
    const cashRevenue = customerVisits.reduce((sum, visit) => sum + visit.amountPaid, 0);
    const marketingCost = options.marketingCost ?? 0;
    const profit = totalRevenue - totalCostOfGoods - totalOrderCost - totalWasteLoss - totalRemovalLoss - marketingCost;
    const newCash = state.cash - totalOrderCost - marketingCost + cashRevenue + khataCollected;
    const inventoryMovements = ledger.buildMovements(inv, productResults, actions.discounts, weather, fridgePressure);
    const marketingPerformanceBase = this.calculateMarketingPerformance(
      options.marketingEffects ?? [],
      marketingCost,
      customerVisits,
      inventoryMovements
    );
    const rewardBreakdown = this.scoringEngine.calculate({
      profit,
      wasteLoss: totalWasteLoss,
      removalLoss: totalRemovalLoss,
      khataAdded,
      khataCollected,
      stockoutCount: Object.keys(stockoutCounts).length,
      noStockouts,
      currentCash: state.cash,
      actions,
      customerVisits,
      inventoryMovements,
      marketingPerformance: marketingPerformanceBase,
    });
    const marketingPerformance = {
      ...marketingPerformanceBase,
      score: rewardBreakdown.marketing,
    };
    const historicalScore = state.getTotalScore();
    const unlockedRewards = this.difficultyEngine.getRewards(day, historicalScore + rewardBreakdown.total);

    this.commitInventory(state, inv);
    state.customers = customers;
    state.cash = Math.round(newCash);
    state.trust = newTrust;

    return {
      day,
      profit: Math.round(profit),
      wasteLoss: Math.round(totalWasteLoss),
      removalLoss: Math.round(totalRemovalLoss),
      khataAdded: Math.round(khataAdded),
      khataCollected: Math.round(khataCollected),
      stockouts: Object.keys(stockoutCounts).length,
      trustChange,
      trust: newTrust,
      cash: Math.round(newCash),
      productResults: Array.from(productResults.values()),
      inventoryMovements,
      customerVisits,
      customerSummary: state.getCustomerMemorySummary(),
      environmentContext,
      marketingPerformance,
      difficulty,
      unlockedRewards,
      rewardBreakdown,
    };
  }

  private calculateMarketingPerformance(
    marketingEffects: MarketingEffect[],
    spendToday: number,
    customerVisits: DayResult['customerVisits'],
    inventoryMovements: DayResult['inventoryMovements']
  ): MarketingPerformance {
    if (marketingEffects.length === 0) {
      return {
        activeCampaigns: 0,
        spendToday: Math.round(spendToday),
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

    const campaignIds = new Set(marketingEffects.map((effect) => effect.campaignId));
    const targetSegments = new Set<CustomerSegment>(marketingEffects.flatMap((effect) => effect.segments));
    const targetProducts = new Set<ProductId>(marketingEffects.flatMap((effect) => effect.products));
    const allocatedActiveCost = marketingEffects.reduce((sum, effect) => sum + effect.allocatedDailyCost, 0);
    let targetVisits = 0;
    let servedTargetUnits = 0;
    let missedTargetUnits = 0;
    let targetGrossMargin = 0;

    for (const visit of customerVisits) {
      if (!targetSegments.has(visit.segment)) continue;
      const requestedTargetUnits = visit.requested
        .filter((line) => targetProducts.has(line.productId))
        .reduce((sum, line) => sum + line.quantity, 0);
      if (requestedTargetUnits <= 0) continue;
      targetVisits += 1;

      for (const line of visit.fulfilled) {
        if (!targetProducts.has(line.productId)) continue;
        const product = PRODUCTS.find((item) => item.id === line.productId);
        servedTargetUnits += line.quantity;
        targetGrossMargin += line.quantity * (product?.margin ?? 0);
      }

      for (const line of visit.missed) {
        if (targetProducts.has(line.productId)) {
          missedTargetUnits += line.quantity;
        }
      }
    }

    const promotedStockoutSkus = inventoryMovements
      .filter((row) => targetProducts.has(row.productId) && row.missedDemand > 0)
      .map((row) => row.productId);
    const roi = allocatedActiveCost > 0 ? targetGrossMargin / allocatedActiveCost : 0;

    return {
      activeCampaigns: campaignIds.size,
      spendToday: Math.round(spendToday),
      allocatedActiveCost: Math.round(allocatedActiveCost),
      targetVisits,
      servedTargetUnits,
      missedTargetUnits,
      targetGrossMargin: Math.round(targetGrossMargin),
      roi: Math.round(roi * 100) / 100,
      promotedStockoutSkus,
      score: 0,
    };
  }

  private applyOrders(
    inv: InventoryManager,
    ledger: InventoryLedger,
    actions: PlayerActions,
    cash: number
  ): number {
    let totalOrderCost = 0;

    for (const [pid, qty] of Object.entries(actions.orders)) {
      if (!qty || qty <= 0) continue;
      const product = PRODUCTS.find((p) => p.id === pid);
      if (!product) continue;
      const cost = qty * product.costPrice;
      if (cash >= totalOrderCost + cost) {
        inv.addStock(pid as ProductId, qty);
        ledger.recordOrder(pid as ProductId, qty);
        totalOrderCost += cost;
      }
    }

    return totalOrderCost;
  }

  private applyRemovals(inv: InventoryManager, ledger: InventoryLedger, actions: PlayerActions): number {
    let totalRemovalLoss = 0;

    for (const [pid, qty] of Object.entries(actions.removals)) {
      if (!qty || qty <= 0) continue;
      const product = PRODUCTS.find((p) => p.id === pid);
      if (!product) continue;
      const removed = inv.removeStock(pid as ProductId, qty);
      ledger.recordRemoval(pid as ProductId, removed);
      totalRemovalLoss += removed * product.costPrice;
    }

    return totalRemovalLoss;
  }

  private applyDiscounts(inv: InventoryManager, actions: PlayerActions) {
    for (const [pid, pct] of Object.entries(actions.discounts)) {
      if (pct !== undefined) {
        inv.setDiscount(pid as ProductId, pct);
      }
    }
  }

  private createProductResults(): Map<ProductId, SimulationResult> {
    const productResults: Map<ProductId, SimulationResult> = new Map();

    for (const product of PRODUCTS) {
      productResults.set(product.id, {
        productId: product.id,
        demand: 0,
        sold: 0,
        stockout: 0,
        revenue: 0,
        costOfGoods: 0,
        margin: 0,
      });
    }

    return productResults;
  }

  private finalizeProductMargins(productResults: Map<ProductId, SimulationResult>): {
    totalRevenue: number;
    totalCostOfGoods: number;
  } {
    let totalRevenue = 0;
    let totalCostOfGoods = 0;

    for (const result of productResults.values()) {
      result.margin = result.revenue - result.costOfGoods;
      totalRevenue += result.revenue;
      totalCostOfGoods += result.costOfGoods;
    }

    return { totalRevenue, totalCostOfGoods };
  }

  private getStockoutCounts(productResults: Map<ProductId, SimulationResult>): Record<string, number> {
    const stockoutCounts: Record<string, number> = {};

    for (const result of productResults.values()) {
      if (result.stockout > 0) {
        stockoutCounts[result.productId] = result.stockout;
      }
    }

    return stockoutCounts;
  }

  private calculateTrustChange(stockoutCounts: Record<string, number>, noStockouts: boolean): number {
    let trustChange = 0;

    for (const productId of Object.keys(stockoutCounts)) {
      const penaltyKey = `${productId}_stockout` as keyof typeof TRUST_PENALTIES;
      trustChange -= TRUST_PENALTIES[penaltyKey] ?? 0;
    }

    if (noStockouts) {
      trustChange += TRUST_BONUSES.no_stockouts;
    }

    return trustChange;
  }

  private commitInventory(state: GameState, inv: InventoryManager) {
    state.inventory = new Map();

    for (const [pid, item] of inv.inventory) {
      state.inventory.set(pid, {
        productId: pid,
        buckets: item.buckets.map((bucket) => ({ ...bucket })),
        totalStock: inv.getTotalStock(pid),
        discountPct: item.discountPct,
      });
    }
  }

  private getFridgePressure(inv: InventoryManager, capacity: number): number {
    const fridgeUnits = Array.from(inv.inventory.entries()).reduce((sum, [pid, item]) => {
      const product = PRODUCTS.find((p) => p.id === pid);
      return sum + (product?.storage === 'fridge' ? item.totalStock * product.storageUnits : 0);
    }, 0);

    return capacity <= 0 ? 0 : fridgeUnits / capacity;
  }

  getEvents(): string[] {
    return this.events;
  }
}
