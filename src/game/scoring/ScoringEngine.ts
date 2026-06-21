import type { CustomerVisit, InventoryMovement, MarketingPerformance, PlayerActions, RewardBreakdown } from '../../types';
import { PRODUCTS } from '../../constants/products';

export interface ScoringInput {
  profit: number;
  wasteLoss: number;
  removalLoss: number;
  khataAdded: number;
  khataCollected: number;
  stockoutCount: number;
  noStockouts: boolean;
  trustChange: number;
  currentCash: number;
  actions: PlayerActions;
  customerVisits: CustomerVisit[];
  inventoryMovements: InventoryMovement[];
  marketingPerformance: MarketingPerformance;
}

export class ScoringEngine {
  static calculateMarketingScore(performance?: MarketingPerformance): number {
    if (!performance || performance.activeCampaigns <= 0) return 0;

    const targetDemand = performance.servedTargetUnits + performance.missedTargetUnits;
    const serviceRatio = targetDemand === 0 ? 0 : performance.servedTargetUnits / targetDemand;
    const servicePoints = targetDemand === 0 ? 0 : Math.round(serviceRatio * 4);
    const roiPoints = performance.roi >= 2
      ? 6
      : performance.roi >= 1.5
        ? 5
        : performance.roi >= 1
          ? 4
          : performance.roi >= 0.75
            ? 2
            : performance.roi > 0
              ? 1
              : 0;
    const stockoutProtection = targetDemand > 0 && performance.promotedStockoutSkus.length === 0
      ? performance.missedTargetUnits === 0 ? 3 : 1
      : 0;
    const missedPenalty = Math.min(
      10,
      Math.ceil(performance.missedTargetUnits / 3) + performance.promotedStockoutSkus.length * 3
    );

    return Math.max(-10, Math.min(15, servicePoints + roiPoints + stockoutProtection - missedPenalty));
  }

  calculate(input: ScoringInput): RewardBreakdown {
    const namedVisits = input.customerVisits.filter((visit) => visit.segment !== 'walkin');
    const requestedUnits = namedVisits.reduce((sum, visit) => sum + this.totalQty(visit.requested), 0);
    const fulfilledUnits = namedVisits.reduce((sum, visit) => sum + this.totalQty(visit.fulfilled), 0);
    const missedNamedVisits = namedVisits.filter((visit) => visit.outcome !== 'fulfilled').length;
    const serviceRatio = requestedUnits === 0 ? 1 : fulfilledUnits / requestedUnits;

    const service = this.clamp(
      Math.round(serviceRatio * 35) - missedNamedVisits * 5 - input.stockoutCount * 2,
      -15,
      35
    );

    const missedUnits = input.inventoryMovements.reduce((sum, row) => sum + row.missedDemand, 0);
    const lowClosingRows = input.inventoryMovements.filter((row) => {
      const product = PRODUCTS.find((p) => p.id === row.productId);
      return row.closing < (product?.baseDemand ?? 1) * 0.35;
    }).length;
    const perishableOverstockRows = input.inventoryMovements.filter((row) => {
      const product = PRODUCTS.find((p) => p.id === row.productId);
      return Boolean(product && product.shelfLife <= 3 && row.closing > product.baseDemand * 1.4);
    }).length;
    const perishabilityRiskCost = input.inventoryMovements.reduce((sum, row) => sum + row.perishability.wasteRiskCost, 0);
    const inventory = this.clamp(
      18 - input.stockoutCount * 4 - Math.round(missedUnits / 6) - Math.round(input.wasteLoss / 150) - Math.round(perishabilityRiskCost / 350) - lowClosingRows * 2 - perishableOverstockRows * 3,
      -20,
      25
    );

    const cashBufferEffect = input.currentCash > input.actions.cashReserve ? 1 : -4;
    const money = this.clamp(
      Math.round(input.profit / 700 + input.khataCollected / 300 - input.khataAdded / 250 + cashBufferEffect),
      -15,
      20
    );

    const trustDelta = namedVisits.reduce((sum, visit) => sum + visit.trustDelta, 0);
    const fulfilledNamedVisits = namedVisits.filter((visit) => visit.outcome === 'fulfilled').length;
    const shopTrustEffect = Math.round(input.trustChange * 1.4);
    const relationship = this.clamp(
      Math.round(trustDelta * 1.5) + fulfilledNamedVisits * 2 - missedNamedVisits * 4 + shopTrustEffect,
      -35,
      25
    );

    const orderDiversity = Object.values(input.actions.orders).filter((quantity) => (quantity ?? 0) > 0).length;
    const removalUnits = Object.values(input.actions.removals).reduce((sum, quantity) => sum + (quantity ?? 0), 0);
    const offerCount = Object.values(input.actions.discounts).filter((pct) => (pct ?? 0) > 0).length;
    const reminderCount = input.actions.khataReminders.length;
    const marketingCount = input.actions.marketingActions?.length ?? 0;
    const marketing = ScoringEngine.calculateMarketingScore(input.marketingPerformance);
    const operations = this.clamp(
      Math.min(8, orderDiversity * 2) +
        Math.min(4, offerCount) +
        Math.min(4, reminderCount * 2) +
        (removalUnits > 0 ? 2 : 0),
      0,
      20
    );

    const madeNoAction = orderDiversity === 0 && removalUnits === 0 && offerCount === 0 && reminderCount === 0 && marketingCount === 0;
    const penalties = -Math.round(
      input.stockoutCount * 4 +
      missedUnits / 10 +
      input.wasteLoss / 200 +
      perishabilityRiskCost / 500 +
      input.removalLoss / 250 +
      input.khataAdded / 300 +
      (input.noStockouts ? 0 : 3) +
      (madeNoAction && input.stockoutCount > 0 ? 6 : 0)
    );

    return {
      service,
      inventory,
      money,
      relationships: relationship,
      marketing,
      operations,
      penalties,
      total: service + inventory + money + relationship + marketing + operations + penalties,
    };
  }

  private totalQty(lines: Array<{ quantity: number }>): number {
    return lines.reduce((sum, line) => sum + line.quantity, 0);
  }

  private clamp(value: number, min: number, max: number): number {
    return Math.max(min, Math.min(max, value));
  }
}
