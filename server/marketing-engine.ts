import type {
  DayResult,
  MarketingActionSelection,
  MarketingCampaignInstance,
  MarketingCampaignSpec,
  MarketingEffect,
  PlayerActions,
  ProductId,
} from '../src/types';
import { randomUUID } from 'node:crypto';
import { getMarketingCampaign, getUnlockedMarketingCampaigns } from '../src/constants/marketing';
import { PRODUCTS } from '../src/constants/products';
import { ScoringEngine } from '../src/game/scoring/ScoringEngine';

export function normalizeActions(actions: Partial<PlayerActions> | undefined): PlayerActions {
  return {
    orders: actions?.orders ?? {},
    removals: actions?.removals ?? {},
    discounts: actions?.discounts ?? {},
    khataReminders: actions?.khataReminders ?? [],
    marketingActions: actions?.marketingActions ?? [],
    cashReserve: actions?.cashReserve ?? 600,
    fridgeAllocation: actions?.fridgeAllocation ?? { milk: 60, cold_drinks: 30, buffer: 10 },
  };
}

export function createCampaignInstances(params: {
  runId: string;
  day: number;
  selections: MarketingActionSelection[];
}): MarketingCampaignInstance[] {
  return params.selections
    .map((selection) => ({
      selection,
      spec: getMarketingCampaign(selection.specId),
    }))
    .filter((entry): entry is { selection: MarketingActionSelection; spec: MarketingCampaignSpec } => Boolean(entry.spec))
    .filter(({ spec }) => spec.unlockDay <= params.day)
    .map(({ selection, spec }) => {
      const effectStartDay = params.day + spec.delayDays;
      const effectEndDay = effectStartDay + spec.durationDays - 1;
      return {
        id: randomUUID(),
        runId: params.runId,
        specId: spec.id,
        targetProducts: resolveCampaignTargetProducts(spec, selection),
        plannedDay: params.day,
        effectStartDay,
        effectEndDay,
        status: effectStartDay <= params.day ? 'active' : 'scheduled',
        cost: spec.cost,
      };
    });
}

export function getCampaignCost(instances: MarketingCampaignInstance[]): number {
  return instances.reduce((sum, campaign) => sum + campaign.cost, 0);
}

export function getAvailableCampaigns(day: number): MarketingCampaignSpec[] {
  return getUnlockedMarketingCampaigns(day);
}

export function getActiveCampaigns(
  campaigns: MarketingCampaignInstance[],
  day: number
): MarketingCampaignInstance[] {
  return campaigns.filter((campaign) => campaign.effectStartDay <= day && campaign.effectEndDay >= day);
}

export function getVisibleMarketingCampaigns(
  campaigns: MarketingCampaignInstance[],
  day: number
): MarketingCampaignInstance[] {
  return campaigns.filter((campaign) => {
    const isScheduledOrActive = campaign.effectEndDay >= day;
    const justCompleted = Boolean(campaign.actualResult) && campaign.effectEndDay >= day - 1;
    return isScheduledOrActive || justCompleted;
  });
}

export function buildMarketingEffects(
  campaigns: MarketingCampaignInstance[],
  day: number
): MarketingEffect[] {
  return getActiveCampaigns(campaigns, day)
    .map((campaign) => {
      const spec = getMarketingCampaign(campaign.specId);
      if (!spec) return undefined;
      const baseLift = spec.channel === 'relationship' ? 1.08 : spec.cost >= 150 ? 1.18 : 1.12;
      const targetProducts = campaign.targetProducts?.length ? campaign.targetProducts : spec.targetProducts;
      return {
        campaignId: campaign.id,
        specId: spec.id,
        segments: spec.targetSegments,
        products: targetProducts,
        demandMultiplier: baseLift,
        visitMultiplier: spec.channel === 'offline' ? 1.08 : 1.03,
        campaignCost: campaign.cost,
        allocatedDailyCost: campaign.cost / Math.max(1, spec.durationDays),
      };
    })
    .filter((effect): effect is MarketingEffect => Boolean(effect));
}

export function validateMarketingSelections(day: number, selections: MarketingActionSelection[]): string[] {
  const errors: string[] = [];
  const seen = new Set<string>();
  for (const selection of selections) {
    const spec = getMarketingCampaign(selection.specId);
    if (!spec) {
      errors.push(`Unknown marketing campaign: ${selection.specId}`);
      continue;
    }
    if (spec.unlockDay > day) {
      errors.push(`${spec.name} unlocks on day ${spec.unlockDay}`);
    }
    if (seen.has(spec.id)) {
      errors.push(`${spec.name} selected more than once`);
    }
    const targetProducts = selection.targetProducts;
    if (targetProducts !== undefined) {
      const selectedProducts = Array.from(new Set(targetProducts));
      if (selectedProducts.length === 0) {
        errors.push(`${spec.name} needs at least one promoted item`);
      }
      const validProductIds = new Set(PRODUCTS.map((product) => product.id));
      const invalidProducts = selectedProducts.filter((productId) => {
        return !validProductIds.has(productId) || !spec.targetProducts.includes(productId);
      });
      if (invalidProducts.length > 0) {
        errors.push(`${spec.name} cannot promote ${invalidProducts.join(', ')}`);
      }
    }
    seen.add(spec.id);
  }
  return errors;
}

export function summarizeMarketingResult(
  campaign: MarketingCampaignInstance,
  result: DayResult
): MarketingCampaignInstance['actualResult'] {
  const spec = getMarketingCampaign(campaign.specId);
  if (!spec) return undefined;
  const targetProducts = campaign.targetProducts?.length ? campaign.targetProducts : spec.targetProducts;
  const relevantVisits = result.customerVisits.filter((visit) => spec.targetSegments.includes(visit.segment));
  const relevantRevenue = relevantVisits.reduce((sum, visit) => sum + visit.revenue, 0);
  let servedTargetUnits = 0;
  let missedUnits = 0;
  let targetGrossMargin = 0;

  for (const visit of relevantVisits) {
    for (const line of visit.fulfilled) {
      if (!targetProducts.includes(line.productId)) continue;
      const product = PRODUCTS.find((item) => item.id === line.productId);
      servedTargetUnits += line.quantity;
      targetGrossMargin += line.quantity * (product?.margin ?? 0);
    }
    for (const line of visit.missed) {
      if (targetProducts.includes(line.productId)) {
        missedUnits += line.quantity;
      }
    }
  }

  const promotedStockoutSkus = result.inventoryMovements
    .filter((row) => targetProducts.includes(row.productId) && row.missedDemand > 0)
    .map((row) => row.productId);
  const allocatedDailyCost = campaign.cost / Math.max(1, spec.durationDays);
  const roi = allocatedDailyCost > 0 ? targetGrossMargin / allocatedDailyCost : 0;
  const score = ScoringEngine.calculateMarketingScore({
    activeCampaigns: 1,
    spendToday: campaign.plannedDay === result.day ? campaign.cost : 0,
    allocatedActiveCost: Math.round(allocatedDailyCost),
    targetVisits: relevantVisits.length,
    servedTargetUnits,
    missedTargetUnits: missedUnits,
    targetGrossMargin: Math.round(targetGrossMargin),
    roi: Math.round(roi * 100) / 100,
    promotedStockoutSkus,
    score: 0,
  });
  const fallbackMissedUnits = result.inventoryMovements
    .filter((row) => targetProducts.includes(row.productId))
    .reduce((sum, row) => sum + row.missedDemand, 0);

  return {
    incrementalVisits: relevantVisits.length,
    incrementalRevenue: relevantRevenue,
    servedTargetUnits,
    missedUnits: missedUnits || fallbackMissedUnits,
    targetGrossMargin: Math.round(targetGrossMargin),
    roi: Math.round(roi * 100) / 100,
    score,
    promotedStockoutSkus,
  };
}

function resolveCampaignTargetProducts(
  spec: MarketingCampaignSpec,
  selection?: MarketingActionSelection
): ProductId[] {
  const selected = uniqueProductIds(selection?.targetProducts ?? []);
  const allowed = selected.filter((productId) => spec.targetProducts.includes(productId));
  return allowed.length > 0 ? allowed : spec.targetProducts;
}

function uniqueProductIds(productIds: ProductId[]): ProductId[] {
  const validProductIds = new Set(PRODUCTS.map((product) => product.id));
  return Array.from(new Set(productIds)).filter((productId) => validProductIds.has(productId));
}
