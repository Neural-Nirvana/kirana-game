import type { CustomerProfile } from '../types';
import { createDefaultCustomers } from '../game/customers/CustomerModel';

export const DEFAULT_CUSTOMERS: CustomerProfile[] = createDefaultCustomers();

export function cloneCustomers(customers: CustomerProfile[] = DEFAULT_CUSTOMERS): CustomerProfile[] {
  return customers.map((customer) => ({
    ...customer,
    behavior: customer.behavior ? { ...customer.behavior } : undefined,
    usualBasket: customer.usualBasket.map((line) => ({ ...line })),
    orderHistory: customer.orderHistory.map((record) => ({
      ...record,
      requested: record.requested.map((line) => ({ ...line })),
      fulfilled: record.fulfilled.map((line) => ({ ...line })),
      missed: record.missed.map((line) => ({ ...line })),
    })),
  }));
}
