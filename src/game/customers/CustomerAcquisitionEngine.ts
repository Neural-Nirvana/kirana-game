import type { CustomerProfile, CustomerSegment, EnvironmentContext, MarketingEffect, ProductId, Weather } from '../../types';
import {
  CUSTOMER_GROUPS,
  createGeneratedCustomer,
  scoreGroupForAcquisition,
} from './CustomerModel';

export class CustomerAcquisitionEngine {
  createNewCustomers(params: {
    day: number;
    trust: number;
    weather: Weather;
    events: string[];
    existingCustomers: CustomerProfile[];
    marketingEffects: MarketingEffect[];
    environmentContext: EnvironmentContext;
    random: () => number;
  }): CustomerProfile[] {
    if (params.existingCustomers.length >= 18) return [];

    const promotedProducts = Array.from(new Set(params.marketingEffects.flatMap((effect) => effect.products))) as ProductId[];
    const promotedSegments = Array.from(new Set(params.marketingEffects.flatMap((effect) => effect.segments))) as CustomerSegment[];
    const trustBoost = params.trust >= 70 ? 0.08 : params.trust >= 50 ? 0.03 : -0.05;
    const marketingBoost = params.marketingEffects.length > 0 ? 0.08 : 0;
    const marketLift = Math.max(0.85, Math.min(1.2, params.environmentContext.segmentVisitMultipliers.walkin ?? 1));
    const baseChance = Math.max(0.01, Math.min(0.32, (0.04 + trustBoost + marketingBoost) * marketLift));
    const capacity = Math.min(2, 18 - params.existingCustomers.length);
    const count = this.rollCustomerCount(baseChance, capacity, params.random);

    if (count <= 0) return [];

    const result: CustomerProfile[] = [];
    const existingIds = new Set(params.existingCustomers.map((customer) => customer.id));
    for (let index = 0; index < count; index += 1) {
      const groupId = this.pickGroup({
        trust: params.trust,
        weather: params.weather,
        events: params.events,
        promotedProducts,
        promotedSegments,
        random: params.random,
      });
      const groupIndex = params.existingCustomers.filter((customer) => customer.groupId === groupId).length
        + result.filter((customer) => customer.groupId === groupId).length;
      const customer = createGeneratedCustomer({
        groupId,
        day: params.day,
        index: groupIndex,
        trust: params.trust,
        acquisitionSource: params.marketingEffects.length > 0 ? 'marketing and footfall' : 'organic footfall',
      });
      if (!existingIds.has(customer.id)) result.push(customer);
    }

    return result;
  }

  private rollCustomerCount(chance: number, capacity: number, random: () => number): number {
    let count = 0;
    for (let i = 0; i < capacity; i += 1) {
      if (random() < chance / (i + 1)) count += 1;
    }
    return count;
  }

  private pickGroup(params: {
    trust: number;
    weather: Weather;
    events: string[];
    promotedProducts: ProductId[];
    promotedSegments: CustomerSegment[];
    random: () => number;
  }): string {
    const scored = CUSTOMER_GROUPS.map((group) => ({
      group,
      score: scoreGroupForAcquisition({ group, ...params }),
    }));
    const total = scored.reduce((sum, row) => sum + row.score, 0);
    let cursor = params.random() * total;
    for (const row of scored) {
      cursor -= row.score;
      if (cursor <= 0) return row.group.id;
    }
    return scored[0]?.group.id ?? 'morning_households';
  }
}
