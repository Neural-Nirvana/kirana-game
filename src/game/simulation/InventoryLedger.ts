import type { InventoryMovement, ProductId, SimulationResult } from '../../types';
import { PRODUCTS } from '../../constants/products';
import { InventoryManager } from '../InventoryManager';
import { PerishabilityEngine } from '../PerishabilityEngine';
import { createProductQuantityMap } from './productMaps';
import type { Weather } from '../../types';

export class InventoryLedger {
  readonly openingStock: Record<ProductId, number>;
  readonly orderedStock = createProductQuantityMap();
  readonly removedStock = createProductQuantityMap();
  readonly wastedStock = createProductQuantityMap();

  private constructor(openingStock: Record<ProductId, number>) {
    this.openingStock = openingStock;
  }

  static start(inv: InventoryManager): InventoryLedger {
    const openingStock = createProductQuantityMap();
    for (const product of PRODUCTS) {
      openingStock[product.id] = inv.getTotalStock(product.id);
    }
    return new InventoryLedger(openingStock);
  }

  recordOrder(productId: ProductId, quantity: number) {
    this.orderedStock[productId] += quantity;
  }

  recordRemoval(productId: ProductId, quantity: number) {
    this.removedStock[productId] += quantity;
  }

  recordWaste(wasteLog: Array<{ productId: ProductId; wasted: number }>) {
    for (const waste of wasteLog) {
      this.wastedStock[waste.productId] += waste.wasted;
    }
  }

  buildMovements(
    inv: InventoryManager,
    productResults: Map<ProductId, SimulationResult>,
    discounts: Partial<Record<ProductId, number>>,
    weather: Weather,
    fridgePressure: number
  ): InventoryMovement[] {
    return PRODUCTS.map((product) => {
      const result = productResults.get(product.id);
      const inventory = inv.inventory.get(product.id);
      const opening = this.openingStock[product.id];
      const ordered = this.orderedStock[product.id];
      const removed = this.removedStock[product.id];
      const openingShelf = Math.max(0, opening + ordered - removed);
      return {
        productId: product.id,
        opening,
        openingShelf,
        ordered,
        removed,
        available: openingShelf,
        sold: result?.sold ?? 0,
        wasted: this.wastedStock[product.id],
        closing: inv.getTotalStock(product.id),
        missedDemand: result?.stockout ?? 0,
        offerPct: discounts[product.id] ?? 0,
        perishability: PerishabilityEngine.summarizeProduct(product, inventory, inv.currentDay + 1, weather, fridgePressure),
      };
    });
  }
}
