import type { CustomerOrderLine, CustomerProfile, CustomerSegment, CustomerWave } from '../../types';

export const CUSTOMER_WAVES: CustomerWave[] = ['morning', 'afternoon', 'evening'];

export interface PlannedVisit {
  customer?: CustomerProfile;
  customerId: string;
  customerName: string;
  segment: CustomerSegment;
  wave: CustomerWave;
  basket: CustomerOrderLine[];
  visitReasons: string[];
  demandReasons: string[];
  visitProbability?: number;
  trustRecoveryBoost?: number;
}
