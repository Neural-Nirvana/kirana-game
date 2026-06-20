import type { ProductId } from '../../types';
import { PRODUCTS } from '../../constants/products';

export function createProductQuantityMap(): Record<ProductId, number> {
  const demand = {} as Record<ProductId, number>;
  for (const product of PRODUCTS) {
    demand[product.id] = 0;
  }
  return demand;
}
