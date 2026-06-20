import type {
  ProductInventory,
  ProductId,
  PlayerActions,
  DayLog,
  VisibleState,
  DayResult,
  Weather,
  CustomerProfile,
  CustomerMemorySummary,
  SerializedGameState,
} from '../types';
import { PRODUCTS, DEFAULT_CONFIG } from '../constants/products';
import { cloneCustomers } from '../constants/customers';
import { PerishabilityEngine } from './PerishabilityEngine';

export class GameState {
  day: number = 0;
  cash: number = DEFAULT_CONFIG.startingCash;
  trust: number = DEFAULT_CONFIG.startingTrust;
  weather: Weather = 'normal';
  inventory: Map<ProductId, ProductInventory> = new Map();
  customers: CustomerProfile[] = cloneCustomers();
  history: DayLog[] = [];
  currentActions: PlayerActions = {
    orders: {},
    removals: {},
    discounts: {},
    khataReminders: [],
    marketingActions: [],
    cashReserve: DEFAULT_CONFIG.defaultCashReserve,
    fridgeAllocation: { milk: 60, cold_drinks: 30, buffer: 10 },
  };
  config = DEFAULT_CONFIG;

  constructor() {
    this.reset();
  }

  reset() {
    this.day = 1;
    this.cash = this.config.startingCash;
    this.trust = this.config.startingTrust;
    this.history = [];
    this.weather = 'normal';
    this.customers = cloneCustomers();
    this.currentActions = {
      orders: {},
      removals: {},
      discounts: {},
      khataReminders: [],
      marketingActions: [],
      cashReserve: this.config.defaultCashReserve,
      fridgeAllocation: { milk: 60, cold_drinks: 30, buffer: 10 },
    };

    // Opening inventory is bought by the player during onboarding.
    this.inventory = new Map();
    for (const p of PRODUCTS) {
      this.inventory.set(p.id, {
        productId: p.id,
        buckets: [],
        totalStock: 0,
        discountPct: 0,
      });
    }
  }

  getVisibleState(): VisibleState {
    const fridgeUsed = this.getFridgeUsage();
    const expiryRisk = this.calculateExpiryRisk();

    return {
      cash: Math.round(this.cash),
      trust: Math.round(this.trust),
      weather: this.weather,
      fridgeUsedPct: Math.round((fridgeUsed / this.config.fridgeCapacity) * 100),
      expiryRisk,
      day: this.day,
      maxDays: this.config.maxDays,
    };
  }

  getProductInventory(pid: ProductId): ProductInventory | undefined {
    return this.inventory.get(pid);
  }

  getFridgeUsage(): number {
    let used = 0;
    for (const [pid, inv] of this.inventory) {
      const prod = PRODUCTS.find(p => p.id === pid);
      if (prod?.storage === 'fridge') {
        used += inv.totalStock * prod.storageUnits;
      }
    }
    return used;
  }

  calculateExpiryRisk(): 'low' | 'medium' | 'high' {
    const fridgePressure = this.getFridgeUsage() / this.config.fridgeCapacity;
    let wasteRiskCost = 0;
    let totalTrackedCost = 0;
    let highRiskUnits = 0;
    let totalTrackedUnits = 0;

    for (const [pid, inv] of this.inventory) {
      const prod = PRODUCTS.find(p => p.id === pid);
      if (!prod || !PerishabilityEngine.isTracked(prod)) continue;

      const snapshot = PerishabilityEngine.summarizeProduct(prod, inv, this.day, this.weather, fridgePressure);
      wasteRiskCost += snapshot.wasteRiskCost;
      totalTrackedCost += inv.totalStock * prod.costPrice;
      highRiskUnits += snapshot.atRiskUnits + snapshot.expiredUnits;
      totalTrackedUnits += inv.totalStock;
    }

    if (totalTrackedUnits === 0 || totalTrackedCost === 0) return 'low';
    const costRatio = wasteRiskCost / totalTrackedCost;
    const unitRatio = highRiskUnits / totalTrackedUnits;
    if (costRatio > 0.42 || unitRatio > 0.45) return 'high';
    if (costRatio > 0.2 || unitRatio > 0.2) return 'medium';
    return 'low';
  }

  setActions(actions: PlayerActions) {
    this.currentActions = actions;
  }

  getCustomerMemorySummary(): CustomerMemorySummary {
    const repeatCustomers = this.customers.filter((customer) => customer.visitCount >= 2).length;
    const successfulVisits = this.customers.reduce((sum, customer) => sum + customer.successfulVisits, 0);
    const failedVisits = this.customers.reduce((sum, customer) => sum + customer.failedVisits, 0);
    const atRiskCustomers = this.customers.filter((customer) => customer.trust < 60 || customer.failedVisits >= 2).length;
    const topCustomer = this.customers.reduce<CustomerProfile | undefined>((best, customer) => {
      if (!best) return customer;
      return customer.visitCount > best.visitCount ? customer : best;
    }, undefined);

    return {
      activeCustomers: this.customers.length,
      repeatCustomers,
      successfulVisits,
      failedVisits,
      atRiskCustomers,
      topCustomerName: topCustomer?.name ?? 'None yet',
      topCustomerVisits: topCustomer?.visitCount ?? 0,
    };
  }

  advanceDay(result: DayResult) {
    this.day++;
    this.cash = result.cash;
    this.trust = result.trust;
  }

  isGameOver(): boolean {
    return this.day > this.config.maxDays;
  }

  getTotalScore(): number {
    return this.history.reduce((sum, log) => sum + log.results.rewardBreakdown.total, 0);
  }

  toSerialized(): SerializedGameState {
    return {
      day: this.day,
      cash: this.cash,
      trust: this.trust,
      weather: this.weather,
      inventory: Array.from(this.inventory.values()).map((inv) => ({
        productId: inv.productId,
        buckets: inv.buckets.map((bucket) => ({ ...bucket })),
        totalStock: inv.totalStock,
        discountPct: inv.discountPct,
      })),
      customers: cloneCustomers(this.customers),
      history: this.history.map((log) => ({
        ...log,
        playerActions: {
          ...log.playerActions,
          marketingActions: log.playerActions.marketingActions ?? [],
        },
      })),
      currentActions: {
        ...this.currentActions,
        marketingActions: this.currentActions.marketingActions ?? [],
      },
    };
  }

  static fromSerialized(serialized: SerializedGameState): GameState {
    const state = new GameState();
    state.day = serialized.day;
    state.cash = serialized.cash;
    state.trust = serialized.trust;
    state.weather = serialized.weather;
    state.customers = cloneCustomers(serialized.customers);
    state.history = serialized.history.map((log) => ({
      ...log,
      playerActions: {
        ...log.playerActions,
        marketingActions: log.playerActions.marketingActions ?? [],
      },
    }));
    state.currentActions = {
      ...serialized.currentActions,
      marketingActions: serialized.currentActions.marketingActions ?? [],
    };
    state.inventory = new Map();
    for (const inv of serialized.inventory) {
      state.inventory.set(inv.productId, {
        productId: inv.productId,
        buckets: inv.buckets.map((bucket) => ({ ...bucket })),
        totalStock: inv.totalStock,
        discountPct: inv.discountPct,
      });
    }
    return state;
  }
}
