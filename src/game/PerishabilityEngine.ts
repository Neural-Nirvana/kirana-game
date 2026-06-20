import type {
  PerishabilitySnapshot,
  ProductInventory,
  ProductSpec,
  StockBucket,
  Weather,
} from '../types';

export class PerishabilityEngine {
  static summarizeProduct(
    product: ProductSpec,
    inventory: ProductInventory | undefined,
    day: number,
    weather: Weather = 'normal',
    fridgePressure = 0
  ): PerishabilitySnapshot {
    const factor = product.perishabilityFactor ?? 0;
    const tracked = this.isTracked(product);

    if (!inventory || inventory.totalStock <= 0) {
      return this.emptySnapshot(product, tracked, factor);
    }

    let freshUnits = 0;
    let agingUnits = 0;
    let atRiskUnits = 0;
    let expiredUnits = 0;
    let weightedFreshness = 0;
    let nextExpiryDay: number | undefined;

    for (const bucket of inventory.buckets) {
      if (bucket.quantity <= 0) continue;
      const analysis = this.analyzeBucket(product, bucket, day, weather, fridgePressure);
      weightedFreshness += analysis.freshness * bucket.quantity;
      nextExpiryDay = Math.min(nextExpiryDay ?? analysis.expiryDay, analysis.expiryDay);

      if (!tracked || analysis.band === 'fresh') {
        freshUnits += bucket.quantity;
      } else if (analysis.band === 'aging') {
        agingUnits += bucket.quantity;
      } else if (analysis.band === 'at_risk') {
        atRiskUnits += bucket.quantity;
      } else {
        expiredUnits += bucket.quantity;
      }
    }

    const totalStock = inventory.totalStock;
    const averageFreshness = Math.round(weightedFreshness / Math.max(1, totalStock));
    const riskUnits = expiredUnits + atRiskUnits + Math.round(agingUnits * 0.35);
    const wasteRiskCost = Math.round((expiredUnits + atRiskUnits * 0.75 + agingUnits * 0.3) * product.costPrice);
    const status = this.resolveStatus(tracked, expiredUnits, atRiskUnits, agingUnits);

    return {
      productId: product.id,
      tracked,
      factor,
      freshUnits,
      agingUnits,
      atRiskUnits,
      expiredUnits,
      riskUnits,
      wasteRiskCost,
      averageFreshness,
      status,
      statusLabel: this.statusLabel(status),
      nextExpiryDay,
    };
  }

  static isExpired(product: ProductSpec, bucket: StockBucket, day: number): boolean {
    return day - bucket.dayAdded >= product.shelfLife;
  }

  static isTracked(product: ProductSpec): boolean {
    return (product.perishabilityFactor ?? 0) >= 0.25 || product.category.includes('perishable') || product.category.includes('semi_perishable');
  }

  private static analyzeBucket(
    product: ProductSpec,
    bucket: StockBucket,
    day: number,
    weather: Weather,
    fridgePressure: number
  ): { band: 'fresh' | 'aging' | 'at_risk' | 'expired'; freshness: number; expiryDay: number } {
    const age = Math.max(0, day - bucket.dayAdded);
    const expiryDay = bucket.dayAdded + product.shelfLife;
    const factor = product.perishabilityFactor ?? 0;

    if (!this.isTracked(product)) {
      return { band: 'fresh', freshness: 100, expiryDay };
    }
    if (age >= product.shelfLife) {
      return { band: 'expired', freshness: 0, expiryDay };
    }

    const ageRatio = Math.min(1, age / Math.max(1, product.shelfLife));
    const pressure = this.environmentPressure(product, weather, fridgePressure);
    const curve = Math.pow(ageRatio, 0.75 + (1 - factor) * 0.55);
    const freshness = Math.max(0, Math.round(100 - Math.min(100, curve * 100 * pressure)));
    const daysLeft = product.shelfLife - age;

    if (daysLeft <= 1 || ageRatio >= 0.78 || freshness < 35) {
      return { band: 'at_risk', freshness, expiryDay };
    }
    if (ageRatio >= 0.45 || freshness < 70) {
      return { band: 'aging', freshness, expiryDay };
    }
    return { band: 'fresh', freshness, expiryDay };
  }

  private static environmentPressure(product: ProductSpec, weather: Weather, fridgePressure: number): number {
    let pressure = 1;

    if (weather === 'hot') pressure *= 1.08;
    if (weather === 'very_hot') pressure *= 1.18;
    if (weather === 'rainy' && product.id === 'bread') pressure *= 1.14;

    if (product.storage === 'fridge') {
      pressure *= 0.9;
      if (fridgePressure > 1) pressure *= 1.35;
      else if (fridgePressure > 0.9) pressure *= 1.16;
    }

    if (product.storage === 'counter' && (weather === 'hot' || weather === 'very_hot')) {
      pressure *= weather === 'very_hot' ? 1.24 : 1.14;
    }

    return pressure;
  }

  private static resolveStatus(
    tracked: boolean,
    expiredUnits: number,
    atRiskUnits: number,
    agingUnits: number
  ): PerishabilitySnapshot['status'] {
    if (!tracked) return 'stable';
    if (expiredUnits > 0) return 'expired';
    if (atRiskUnits > 0) return 'high';
    if (agingUnits > 0) return 'watch';
    return 'fresh';
  }

  private static statusLabel(status: PerishabilitySnapshot['status']): string {
    const labels: Record<PerishabilitySnapshot['status'], string> = {
      stable: 'Shelf stable',
      fresh: 'Fresh stock',
      watch: 'Aging stock',
      high: 'Expiry risk',
      expired: 'Expired stock',
    };

    return labels[status];
  }

  private static emptySnapshot(product: ProductSpec, tracked: boolean, factor: number): PerishabilitySnapshot {
    return {
      productId: product.id,
      tracked,
      factor,
      freshUnits: 0,
      agingUnits: 0,
      atRiskUnits: 0,
      expiredUnits: 0,
      riskUnits: 0,
      wasteRiskCost: 0,
      averageFreshness: tracked ? 100 : 100,
      status: tracked ? 'fresh' : 'stable',
      statusLabel: tracked ? 'Fresh stock' : 'Shelf stable',
    };
  }
}
