import type {
  CustomerOrderLine,
  CustomerProfile,
  CustomerSegment,
  CustomerWave,
  DifficultyProfile,
  EnvironmentContext,
  MarketingEffect,
  ProductId,
  Weather,
} from '../../types';
import { PRODUCTS } from '../../constants/products';
import { DemandEngine } from '../DemandEngine';
import { getCustomerGroupFor } from '../customers/CustomerModel';
import { createProductQuantityMap } from './productMaps';
import type { PlannedVisit } from './types';

export class CustomerDemandPlanner {
  private demandEngine: DemandEngine;

  constructor(demandEngine: DemandEngine) {
    this.demandEngine = demandEngine;
  }

  planWave(params: {
    customers: CustomerProfile[];
    wave: CustomerWave;
    day: number;
    trust: number;
    weather: Weather;
    events: string[];
    difficulty: DifficultyProfile;
    discounts: Partial<Record<ProductId, number>>;
    marketingEffects?: MarketingEffect[];
    environmentContext: EnvironmentContext;
  }): PlannedVisit[] {
    const namedVisits = this.planNamedVisits(
      params.customers,
      params.wave,
      params.day,
      params.weather,
      params.events,
      params.difficulty,
      params.discounts,
      params.marketingEffects ?? [],
      params.environmentContext
    );
    const namedDemand = createProductQuantityMap();

    for (const planned of namedVisits) {
      for (const line of planned.basket) {
        namedDemand[line.productId] += line.quantity;
      }
    }

    const walkInPlan = this.buildWalkInBasket(
      params.wave,
      params.day,
      params.trust,
      params.weather,
      params.events,
      params.difficulty,
      params.discounts,
      params.marketingEffects ?? [],
      params.environmentContext,
      namedDemand
    );

    if (walkInPlan.basket.length === 0) {
      return namedVisits;
    }

    return [
      ...namedVisits,
      {
        customerId: `walkin_${params.wave}`,
        customerName: `${this.titleCase(params.wave)} Walk-ins`,
        segment: 'walkin',
        wave: params.wave,
        basket: walkInPlan.basket,
        visitReasons: walkInPlan.visitReasons,
        demandReasons: walkInPlan.demandReasons,
      },
    ];
  }

  private planNamedVisits(
    customers: CustomerProfile[],
    wave: CustomerWave,
    day: number,
    weather: Weather,
    events: string[],
    difficulty: DifficultyProfile,
    discounts: Partial<Record<ProductId, number>>,
    marketingEffects: MarketingEffect[],
    environmentContext: EnvironmentContext
  ): PlannedVisit[] {
    return customers
      .filter((customer) => customer.preferredWave === wave)
      .flatMap((customer) => {
        const visitPlan = this.evaluateCustomerVisit(customer, day, weather, events, marketingEffects, environmentContext);
        if (!visitPlan.shouldVisit) return [];
        const basketPlan = this.adjustCustomerBasket(customer, weather, difficulty, discounts, marketingEffects, environmentContext);
        return [{
          customer,
          customerId: customer.id,
          customerName: customer.name,
          segment: customer.segment,
          wave,
          basket: basketPlan.basket,
          visitReasons: visitPlan.reasons,
          demandReasons: basketPlan.reasons,
          visitProbability: visitPlan.probability,
          trustRecoveryBoost: visitPlan.trustRecoveryBoost,
        }];
      })
      .filter((visit) => visit.basket.length > 0);
  }

  private evaluateCustomerVisit(
    customer: CustomerProfile,
    day: number,
    weather: Weather,
    events: string[],
    marketingEffects: MarketingEffect[],
    environmentContext: EnvironmentContext
  ): { shouldVisit: boolean; probability: number; reasons: string[]; trustRecoveryBoost: number } {
    let cadence = Math.max(1, customer.cadence);
    const isFestival = events.includes('festival_weekend');
    const isSchoolWeek = day >= 4 && day <= 6;
    const wantsColdDrinks = customer.usualBasket.some((line) => line.productId === 'cold_drinks');
    const reasons: string[] = [];
    const behavior = customer.behavior;
    const group = getCustomerGroupFor(customer);
    const marketingLift = this.applyPromotionAffinity(
      this.getMarketingVisitLift(customer.segment, marketingEffects),
      behavior?.promotionAffinity
    );
    const trustRecoveryBoost = this.getTrustRecoveryBoost(customer, marketingEffects);

    if (trustRecoveryBoost > 0) {
      cadence = 1;
      reasons.push(trustRecoveryBoost >= 4 ? 'Recovery call invited at-risk customer' : 'Relationship campaign rebuilt confidence');
    }

    if (isFestival && ['family', 'student', 'snack'].includes(customer.segment)) {
      cadence = 1;
      reasons.push('Festival routine');
    }
    if (isSchoolWeek && customer.segment === 'student') {
      cadence = 1;
      reasons.push('School reopening');
    }
    if ((weather === 'hot' || weather === 'very_hot') && wantsColdDrinks) {
      cadence = Math.max(1, cadence - 1);
      reasons.push('Heat pushed cold-drink routine');
    }
    const groupWeatherLift = this.applyEnvironmentSensitivity(group?.weatherAffinity[weather] ?? 1, behavior?.environmentSensitivity);

    const cadenceDue = cadence === 1 || (day + customer.visitOffset) % cadence === 0;
    if (cadenceDue) reasons.unshift('Regular cadence');

    const patience = behavior?.patience ?? 55;
    const dropoutTrustThreshold = 38 + Math.round((100 - patience) * 0.1);
    if (customer.trust < dropoutTrustThreshold && customer.failedVisits > customer.successfulVisits && trustRecoveryBoost <= 0 && marketingLift <= 1.03) {
      return { shouldVisit: false, probability: 0, reasons: ['Trust too low after repeated misses'], trustRecoveryBoost: 0 };
    }

    let probability = cadenceDue ? 0.92 : 0.06;
    probability *= environmentContext.segmentVisitMultipliers[customer.segment] ?? 1;
    probability *= marketingLift;
    probability *= groupWeatherLift;

    if (customer.trust >= 80) probability += 0.03 + ((behavior?.relationshipSensitivity ?? 50) / 100) * 0.04;
    else if (customer.trust < 60) probability -= 0.08 + ((100 - patience) / 100) * 0.08;
    if (customer.failedVisits > 0) probability -= Math.min(0.16, customer.failedVisits * (0.03 + ((100 - patience) / 100) * 0.025));
    if (customer.khataBalance > 600) probability -= 0.04 + ((100 - (behavior?.khataReliability ?? 55)) / 100) * 0.08;

    probability = Math.max(cadenceDue ? 0.48 : 0.02, Math.min(cadenceDue ? 0.98 : 0.55, probability));

    const environmentVisitMultiplier = environmentContext.segmentVisitMultipliers[customer.segment] ?? 1;
    if (environmentVisitMultiplier > 1.03) reasons.push('Environment lifted segment footfall');
    if (environmentVisitMultiplier < 0.97) reasons.push('Environment reduced segment footfall');
    if (groupWeatherLift > 1.03) reasons.push(`${group?.label ?? 'Customer group'} reacted to ${weather}`);
    if (groupWeatherLift < 0.97) reasons.push(`${group?.label ?? 'Customer group'} avoided ${weather}`);
    if (marketingLift > 1.01) reasons.push('Marketing reminded this segment');
    if (customer.trust >= 80) reasons.push('High trust');
    if (customer.trust < 60) reasons.push('Low trust drag');
    reasons.push(`Visit chance ${Math.round(probability * 100)}%`);

    return {
      shouldVisit: this.demandEngine.chance(probability),
      probability,
      reasons: this.uniqueReasons(reasons),
      trustRecoveryBoost,
    };
  }

  private adjustCustomerBasket(
    customer: CustomerProfile,
    weather: Weather,
    difficulty: DifficultyProfile,
    discounts: Partial<Record<ProductId, number>>,
    marketingEffects: MarketingEffect[],
    environmentContext: EnvironmentContext
  ): { basket: CustomerOrderLine[]; reasons: string[] } {
    const adjusted = new Map<ProductId, number>();
    const reasons: string[] = [];
    const addLine = (productId: ProductId, quantity: number) => {
      adjusted.set(productId, (adjusted.get(productId) ?? 0) + Math.max(0, Math.round(quantity)));
    };

    for (const line of customer.usualBasket) {
      let quantity = line.quantity;
      const environmentProductLift = environmentContext.productDemandMultipliers[line.productId] ?? 1;
      if (environmentProductLift !== 1) {
        quantity *= environmentProductLift;
        reasons.push(this.productEnvironmentReason(line.productId, environmentContext));
      }
      if (customer.trust < 55 && (line.productId === 'chips' || line.productId === 'cold_drinks')) {
        const flexibility = customer.behavior?.basketFlexibility ?? customer.substitutionTolerance;
        quantity *= Math.max(0.68, 0.9 - (flexibility / 100) * 0.18);
        reasons.push('Low trust reduced impulse add-ons');
      }
      if (difficulty.demandMultiplier > 1.15 && customer.segment !== 'regular') {
        quantity *= Math.min(1.35, difficulty.demandMultiplier);
        reasons.push(difficulty.focus);
      }
      const discountLift = this.getNamedDiscountDemandLift(line.productId, customer, discounts);
      if (discountLift > 1) reasons.push('Offer increased price-sensitive quantity');
      quantity *= discountLift;
      const marketingLift = this.getMarketingDemandLift(line.productId, customer.segment, marketingEffects);
      if (marketingLift > 1) reasons.push('Marketing lifted promoted product demand');
      quantity *= marketingLift;

      addLine(line.productId, quantity);
    }

    if ((weather === 'hot' || weather === 'very_hot') && ['student', 'snack'].includes(customer.segment)) {
      const extraColdDrinks = weather === 'very_hot' ? 2 : 1;
      addLine('cold_drinks', extraColdDrinks);
      reasons.push('Heat added extra cold-drink demand');
    }

    return {
      basket: this.normalizeBasket(Array.from(adjusted.entries()).map(([productId, quantity]) => ({ productId, quantity }))),
      reasons: this.uniqueReasons(reasons.length > 0 ? reasons : ['Usual basket']),
    };
  }

  private buildWalkInBasket(
    wave: CustomerWave,
    day: number,
    trust: number,
    weather: Weather,
    events: string[],
    difficulty: DifficultyProfile,
    discounts: Partial<Record<ProductId, number>>,
    marketingEffects: MarketingEffect[],
    environmentContext: EnvironmentContext,
    namedDemand: Record<ProductId, number>
  ): { basket: CustomerOrderLine[]; visitReasons: string[]; demandReasons: string[] } {
    const waveFactor = wave === 'morning' ? 0.4 : wave === 'evening' ? 0.45 : 0.15;
    const basket: CustomerOrderLine[] = [];
    const demandReasons: string[] = [`Forecast confidence ${environmentContext.confidence} (±${environmentContext.randomnessPct}%)`];
    const visitReasons: string[] = ['Walk-in footfall'];
    const walkInMultiplier = environmentContext.segmentVisitMultipliers.walkin ?? 1;
    const marketingVisitLift = this.getMarketingVisitLift('walkin', marketingEffects);
    if (walkInMultiplier > 1.03) visitReasons.push('Environment lifted walk-ins');
    if (walkInMultiplier < 0.97) visitReasons.push('Environment reduced walk-ins');
    if (marketingVisitLift > 1.01) visitReasons.push('Marketing lifted walk-in footfall');

    for (const product of PRODUCTS) {
      const forecast = this.demandEngine.getForecast(product.id, day, trust, weather, events);
      const discountLift = this.getWalkInDiscountDemandLift(product.id, discounts);
      const marketingLift = this.getMarketingDemandLift(product.id, 'walkin', marketingEffects);
      const waveDemand = Math.round(
        forecast.expected *
        difficulty.demandMultiplier *
        discountLift *
        marketingLift *
        walkInMultiplier *
        marketingVisitLift *
        waveFactor *
        this.demandEngine.randomFactor(environmentContext.randomnessPct)
      );
      const residualDemand = Math.max(0, waveDemand - namedDemand[product.id]);

      if (residualDemand > 0) {
        basket.push({ productId: product.id, quantity: residualDemand });
        if (discountLift > 1) demandReasons.push('Offer pulled walk-in quantity');
        if (marketingLift > 1) demandReasons.push('Marketing lifted walk-in promoted items');
      }
    }

    return {
      basket,
      visitReasons: this.uniqueReasons(visitReasons),
      demandReasons: this.uniqueReasons(demandReasons),
    };
  }

  private normalizeBasket(lines: CustomerOrderLine[]): CustomerOrderLine[] {
    const normalized = new Map<ProductId, number>();
    for (const line of lines) {
      const quantity = Math.max(0, Math.round(line.quantity));
      if (quantity <= 0) continue;
      normalized.set(line.productId, (normalized.get(line.productId) ?? 0) + quantity);
    }
    return Array.from(normalized.entries()).map(([productId, quantity]) => ({ productId, quantity }));
  }

  private getNamedDiscountDemandLift(
    productId: ProductId,
    customer: CustomerProfile,
    discounts: Partial<Record<ProductId, number>>
  ): number {
    const discountPct = discounts[productId] ?? 0;
    if (discountPct <= 0) return 1;
    const sensitivity = (customer.priceSensitivity * 0.7 + (customer.behavior?.promotionAffinity ?? 50) * 0.3) / 100;
    return Math.min(1.35, 1 + (discountPct / 100) * sensitivity * 1.3);
  }

  private getWalkInDiscountDemandLift(
    productId: ProductId,
    discounts: Partial<Record<ProductId, number>>
  ): number {
    const discountPct = discounts[productId] ?? 0;
    if (discountPct <= 0) return 1;
    return Math.min(1.35, 1 + (discountPct / 100) * 1.5);
  }

  private getMarketingDemandLift(
    productId: ProductId,
    segment: CustomerProfile['segment'],
    marketingEffects: MarketingEffect[]
  ): number {
    return marketingEffects.reduce((lift, effect) => {
      if (!effect.products.includes(productId)) return lift;
      if (!effect.segments.includes(segment)) return lift;
      return lift * effect.demandMultiplier;
    }, 1);
  }

  private getMarketingVisitLift(
    segment: CustomerSegment,
    marketingEffects: MarketingEffect[]
  ): number {
    return marketingEffects.reduce((lift, effect) => {
      if (!effect.segments.includes(segment)) return lift;
      return lift * effect.visitMultiplier;
    }, 1);
  }

  private getTrustRecoveryBoost(customer: CustomerProfile, marketingEffects: MarketingEffect[]): number {
    return marketingEffects.reduce((boost, effect) => {
      if (!effect.segments.includes(customer.segment)) return boost;
      const relationshipLift = Math.max(0.7, Math.min(1.35, (customer.behavior?.relationshipSensitivity ?? 55) / 70));
      if (effect.specId === 'recovery_call' && customer.trust < 60 && customer.failedVisits > customer.successfulVisits) {
        return Math.max(boost, Math.round(4 * relationshipLift));
      }
      if (effect.specId === 'loyalty_card' && customer.trust < 75) {
        return Math.max(boost, Math.round(2 * relationshipLift));
      }
      return boost;
    }, 0);
  }

  private applyPromotionAffinity(lift: number, affinity = 50): number {
    if (lift <= 1) return lift;
    return Math.min(1.6, 1 + (lift - 1) * Math.max(0.45, affinity / 55));
  }

  private applyEnvironmentSensitivity(lift: number, sensitivity = 50): number {
    if (lift === 1) return lift;
    return 1 + (lift - 1) * Math.max(0.35, sensitivity / 60);
  }

  private productEnvironmentReason(productId: ProductId, environmentContext: EnvironmentContext): string {
    if (environmentContext.weather === 'rainy') return 'Rain shifted comfort-item demand';
    if (environmentContext.weather === 'hot' || environmentContext.weather === 'very_hot') return 'Heat shifted product demand';
    const signal = environmentContext.signals.find((item) => item.toLowerCase().includes(productId.replace('_', ' ')));
    return signal ?? 'Environment shifted product demand';
  }

  private uniqueReasons(reasons: string[]): string[] {
    return reasons
      .map((reason) => reason.trim())
      .filter((reason, index, all) => reason.length > 0 && all.indexOf(reason) === index)
      .slice(0, 5);
  }

  private titleCase(value: string): string {
    return value.charAt(0).toUpperCase() + value.slice(1);
  }
}
