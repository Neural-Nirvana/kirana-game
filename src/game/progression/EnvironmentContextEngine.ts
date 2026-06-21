import type {
  CustomerSegment,
  DifficultyProfile,
  EnvironmentContext,
  MarketingEffect,
  ProductId,
  Weather,
} from '../../types';

export class EnvironmentContextEngine {
  build(params: {
    day: number;
    weather: Weather;
    events: string[];
    difficulty: DifficultyProfile;
    marketingEffects?: MarketingEffect[];
  }): EnvironmentContext {
    const segmentVisitMultipliers: Partial<Record<CustomerSegment, number>> = {};
    const productDemandMultipliers: Partial<Record<ProductId, number>> = {};
    const signals: string[] = [];
    const dayOfWeek = (params.day - 1) % 7;

    if (params.weather === 'rainy') {
      this.multiplySegment(segmentVisitMultipliers, 'walkin', 0.72);
      this.multiplySegment(segmentVisitMultipliers, 'student', 0.86);
      this.multiplySegment(segmentVisitMultipliers, 'snack', 0.9);
      this.multiplySegment(segmentVisitMultipliers, 'regular', 0.95);
      this.multiplyProduct(productDemandMultipliers, 'maggi', 1.28);
      this.multiplyProduct(productDemandMultipliers, 'bread', 1.08);
      this.multiplyProduct(productDemandMultipliers, 'cold_drinks', 0.82);
      signals.push('Rain lowers casual walk-ins but raises comfort purchases like Maggi and bread');
    } else if (params.weather === 'hot') {
      this.multiplySegment(segmentVisitMultipliers, 'walkin', 1.08);
      this.multiplySegment(segmentVisitMultipliers, 'student', 1.08);
      this.multiplySegment(segmentVisitMultipliers, 'snack', 1.12);
      this.multiplyProduct(productDemandMultipliers, 'cold_drinks', 1.22);
      this.multiplyProduct(productDemandMultipliers, 'bananas', 1.08);
      signals.push('Hot weather lifts cold drinks, snacks, and quick walk-ins');
    } else if (params.weather === 'very_hot') {
      this.multiplySegment(segmentVisitMultipliers, 'walkin', 1.16);
      this.multiplySegment(segmentVisitMultipliers, 'student', 1.16);
      this.multiplySegment(segmentVisitMultipliers, 'snack', 1.22);
      this.multiplyProduct(productDemandMultipliers, 'cold_drinks', 1.42);
      this.multiplyProduct(productDemandMultipliers, 'bananas', 1.12);
      this.multiplyProduct(productDemandMultipliers, 'milk', 1.06);
      signals.push('Very hot weather creates cold-drink pressure and fridge-sensitive demand');
    } else {
      signals.push('Normal weather keeps routine demand more predictable');
    }

    if (dayOfWeek === 5 || dayOfWeek === 6) {
      this.multiplySegment(segmentVisitMultipliers, 'family', 1.12);
      this.multiplySegment(segmentVisitMultipliers, 'snack', 1.1);
      this.multiplySegment(segmentVisitMultipliers, 'walkin', 1.1);
      this.multiplyProduct(productDemandMultipliers, 'chips', 1.08);
      this.multiplyProduct(productDemandMultipliers, 'cold_drinks', 1.08);
      signals.push('Weekend rhythm brings more family, snack, and walk-in pressure');
    }

    if (params.day <= 5) {
      this.multiplySegment(segmentVisitMultipliers, 'family', 1.06);
      this.multiplySegment(segmentVisitMultipliers, 'regular', 1.04);
      this.multiplyProduct(productDemandMultipliers, 'milk', 1.06);
      this.multiplyProduct(productDemandMultipliers, 'bread', 1.06);
      this.multiplyProduct(productDemandMultipliers, 'eggs', 1.05);
      signals.push('Month-start budgets support essentials and family baskets');
    }

    if (params.day >= 25) {
      this.multiplySegment(segmentVisitMultipliers, 'family', 0.9);
      this.multiplySegment(segmentVisitMultipliers, 'regular', 0.94);
      this.multiplySegment(segmentVisitMultipliers, 'walkin', 0.94);
      this.multiplyProduct(productDemandMultipliers, 'chips', 0.9);
      this.multiplyProduct(productDemandMultipliers, 'cold_drinks', 0.92);
      signals.push('Month-end pressure makes baskets smaller and cash discipline more important');
    }

    if (params.day >= 4 && params.day <= 6) {
      this.multiplySegment(segmentVisitMultipliers, 'student', 1.28);
      this.multiplyProduct(productDemandMultipliers, 'maggi', 1.18);
      this.multiplyProduct(productDemandMultipliers, 'chips', 1.15);
      this.multiplyProduct(productDemandMultipliers, 'cold_drinks', 1.12);
      signals.push('School reopening lifts student snacks and quick afternoon demand');
    }

    if (params.events.includes('festival_weekend') || (params.day >= 12 && params.day <= 14)) {
      this.multiplySegment(segmentVisitMultipliers, 'family', 1.24);
      this.multiplySegment(segmentVisitMultipliers, 'snack', 1.22);
      this.multiplySegment(segmentVisitMultipliers, 'walkin', 1.18);
      this.multiplyProduct(productDemandMultipliers, 'chips', 1.28);
      this.multiplyProduct(productDemandMultipliers, 'cold_drinks', 1.28);
      this.multiplyProduct(productDemandMultipliers, 'bread', 1.1);
      signals.push('Festival pressure raises family baskets and snack add-ons');
    }

    if (params.events.includes('evening_milk_rush')) {
      this.multiplyProduct(productDemandMultipliers, 'milk', 1.3);
      this.multiplySegment(segmentVisitMultipliers, 'regular', 1.08);
      signals.push('Evening milk rush can pull regulars back late in the day');
    }

    if (params.difficulty.demandMultiplier > 1.15) {
      this.multiplySegment(segmentVisitMultipliers, 'walkin', Math.min(1.18, params.difficulty.demandMultiplier));
      this.multiplySegment(segmentVisitMultipliers, 'snack', Math.min(1.16, params.difficulty.demandMultiplier));
      signals.push(`${params.difficulty.label}: ${params.difficulty.focus}`);
    }

    for (const effect of params.marketingEffects ?? []) {
      signals.push(`Active marketing ${effect.specId} lifts ${effect.segments.slice(0, 3).join(', ')} visits`);
    }

    const confidence = this.confidenceFor(params.day, params.weather, params.events);
    return {
      day: params.day,
      weather: params.weather,
      confidence,
      randomnessPct: confidence === 'high' ? 8 : confidence === 'medium' ? 15 : 25,
      segmentVisitMultipliers,
      productDemandMultipliers,
      signals: signals.slice(0, 6),
    };
  }

  private multiplySegment(
    multipliers: Partial<Record<CustomerSegment, number>>,
    segment: CustomerSegment,
    multiplier: number
  ) {
    multipliers[segment] = (multipliers[segment] ?? 1) * multiplier;
  }

  private multiplyProduct(
    multipliers: Partial<Record<ProductId, number>>,
    productId: ProductId,
    multiplier: number
  ) {
    multipliers[productId] = (multipliers[productId] ?? 1) * multiplier;
  }

  private confidenceFor(day: number, weather: Weather, events: string[]): EnvironmentContext['confidence'] {
    if (day >= 25 || weather === 'very_hot') return 'low';
    if (weather === 'rainy' || events.length > 0 || day >= 12) return 'medium';
    return 'high';
  }
}
