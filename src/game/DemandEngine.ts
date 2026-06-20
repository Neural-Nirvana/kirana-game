import type { ProductId, Weather, DemandForecast } from '../types';
import { PRODUCTS, WEATHER_EFFECTS } from '../constants/products';

export class DemandEngine {
  randomSeed: number;

  constructor(seed: number = Date.now()) {
    this.randomSeed = seed;
  }

  // Simple seeded random for deterministic replays
  nextRandom(): number {
    this.randomSeed = (this.randomSeed * 9301 + 49297) % 233280;
    return this.randomSeed / 233280;
  }

  chance(probability: number): boolean {
    return this.nextRandom() < Math.max(0, Math.min(1, probability));
  }

  randomFactor(spreadPct: number): number {
    const spread = Math.max(0, spreadPct) / 100;
    return 1 - spread + this.nextRandom() * spread * 2;
  }

  generateWeather(day: number): Weather {
    const r = this.nextRandom();
    if (day >= 18 && day <= 24) {
      // Hot weather period
      if (r < 0.4) return 'very_hot';
      if (r < 0.7) return 'hot';
      return 'normal';
    }
    if (day >= 12 && day <= 14) {
      // Festival weekend - hot
      if (r < 0.5) return 'hot';
      return 'normal';
    }
    // Normal distribution
    if (r < 0.6) return 'normal';
    if (r < 0.8) return 'hot';
    if (r < 0.9) return 'rainy';
    return 'very_hot';
  }

  getForecast(productId: ProductId, day: number, trust: number, weather: Weather, events: string[]): DemandForecast {
    const prod = PRODUCTS.find(p => p.id === productId);
    if (!prod) return { productId, min: 0, max: 0, expected: 0 };

    let base = prod.baseDemand;

    // Trust effect
    const trustFactor = 0.7 + (trust / 100) * 0.6; // 0.7 to 1.3
    base *= trustFactor;

    // Weather effect
    const weatherMult = WEATHER_EFFECTS.find(
      w => w.product === productId && w.weather === weather
    )?.multiplier ?? 1.0;
    base *= weatherMult;

    // Weekend effect
    const dayOfWeek = (day - 1) % 7;
    if (dayOfWeek === 5 || dayOfWeek === 6) {
      base *= 1.15;
    }

    // Festival effect (Day 12-14)
    if (day >= 12 && day <= 14) {
      const festivalMult = this.getFestivalMultiplier(productId);
      base *= festivalMult;
    }

    // School reopening (Day 4-6)
    if (day >= 4 && day <= 6) {
      const schoolMult = this.getSchoolReopeningMultiplier(productId);
      base *= schoolMult;
    }

    // Event effects
    for (const event of events) {
      if (event === 'evening_milk_rush' && productId === 'milk') {
        base *= 1.3;
      }
      if (event === 'competitor_discount' && productId === 'chips') {
        base *= 0.85;
      }
    }

    // Random variance
    const variance = prod.demandVariance * (0.8 + this.nextRandom() * 0.4);
    const min = Math.max(0, Math.floor(base - variance));
    const max = Math.floor(base + variance);
    const expected = Math.round(base);

    return { productId, min, max, expected };
  }

  getActualDemand(forecast: DemandForecast): number {
    // Actual demand is somewhere in the forecast range, biased toward expected
    const r = this.nextRandom();
    const range = forecast.max - forecast.min;
    if (range <= 0) return forecast.expected;
    // Bias toward expected value
    const normalized = r * range;
    const distFromExpected = Math.abs(normalized - (range / 2));
    const bias = distFromExpected * 0.3; // Pull toward center
    const biased = normalized < range / 2
      ? normalized + bias
      : normalized - bias;
    return Math.round(forecast.min + Math.max(0, Math.min(range, biased)));
  }

  private getFestivalMultiplier(productId: ProductId): number {
    const map: Record<string, number> = {
      milk: 1.25, bread: 1.35, eggs: 1.20, maggi: 1.15,
      chips: 1.65, cold_drinks: 1.80, bananas: 1.10,
    };
    return map[productId] ?? 1.0;
  }

  private getSchoolReopeningMultiplier(productId: ProductId): number {
    const map: Record<string, number> = {
      milk: 1.20, bread: 1.30, eggs: 1.15, maggi: 1.40,
      chips: 1.25, cold_drinks: 1.30, bananas: 1.05,
    };
    return map[productId] ?? 1.0;
  }
}
