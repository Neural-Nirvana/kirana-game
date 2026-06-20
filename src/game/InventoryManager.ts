import type { ProductId, ProductInventory, StockBucket } from '../types';
import { PRODUCTS } from '../constants/products';
import { PerishabilityEngine } from './PerishabilityEngine';

export class InventoryManager {
  inventory: Map<ProductId, ProductInventory>;
  currentDay: number;

  constructor(initialInventory: Map<ProductId, ProductInventory>, day: number) {
    this.inventory = new Map();
    for (const [pid, inv] of initialInventory) {
      this.inventory.set(pid, {
        productId: pid,
        buckets: inv.buckets.map(b => ({ ...b })),
        totalStock: inv.totalStock,
        discountPct: inv.discountPct,
      });
    }
    this.currentDay = day;
  }

  addStock(pid: ProductId, quantity: number) {
    const inv = this.inventory.get(pid);
    if (!inv) return;

    inv.buckets.push({ quantity, dayAdded: this.currentDay });
    inv.totalStock += quantity;
  }

  sellStock(pid: ProductId, quantity: number): number {
    const inv = this.inventory.get(pid);
    if (!inv) return 0;

    const sold = Math.min(quantity, inv.totalStock);
    if (sold <= 0) return 0;

    let remaining = sold;
    // FIFO: sell oldest buckets first
    while (remaining > 0 && inv.buckets.length > 0) {
      const bucket = inv.buckets[0];
      if (bucket.quantity <= remaining) {
        remaining -= bucket.quantity;
        inv.buckets.shift();
      } else {
        bucket.quantity -= remaining;
        remaining = 0;
      }
    }

    inv.totalStock -= sold;
    return sold;
  }

  removeStock(pid: ProductId, quantity: number): number {
    return this.sellStock(pid, quantity);
  }

  applyExpiry(): { productId: ProductId; wasted: number; cost: number }[] {
    const wasteLog: { productId: ProductId; wasted: number; cost: number }[] = [];

    for (const [pid, inv] of this.inventory) {
      const prod = PRODUCTS.find(p => p.id === pid);
      if (!prod) continue;

      let wasted = 0;
      const surviving: StockBucket[] = [];

      for (const b of inv.buckets) {
        const age = this.currentDay - b.dayAdded;
        if (age >= prod.shelfLife || PerishabilityEngine.isExpired(prod, b, this.currentDay)) {
          wasted += b.quantity;
        } else {
          surviving.push(b);
        }
      }

      if (wasted > 0) {
        inv.buckets = surviving;
        inv.totalStock = surviving.reduce((sum, b) => sum + b.quantity, 0);
        wasteLog.push({ productId: pid, wasted, cost: wasted * prod.costPrice });
      }
    }

    return wasteLog;
  }

  getTotalStock(pid: ProductId): number {
    return this.inventory.get(pid)?.totalStock ?? 0;
  }

  setDiscount(pid: ProductId, pct: number) {
    const inv = this.inventory.get(pid);
    if (inv) inv.discountPct = pct;
  }

  getDiscountedPrice(pid: ProductId): number {
    const prod = PRODUCTS.find(p => p.id === pid);
    const inv = this.inventory.get(pid);
    if (!prod || !inv) return prod?.sellPrice ?? 0;
    return prod.sellPrice * (1 - inv.discountPct / 100);
  }

  clone(): InventoryManager {
    return new InventoryManager(this.inventory, this.currentDay);
  }
}
