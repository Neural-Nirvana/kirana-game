import type {
  CustomerOrderLine,
  CustomerProfile,
  CustomerSegment,
  CustomerVisit,
  CustomerVisitOutcome,
  PaymentMode,
  ProductId,
  SimulationResult,
} from '../../types';
import { PRODUCTS } from '../../constants/products';
import { InventoryManager } from '../InventoryManager';
import type { PlannedVisit } from './types';

export class VisitProcessor {
  processVisit(params: {
    planned: PlannedVisit;
    inv: InventoryManager;
    productResults: Map<ProductId, SimulationResult>;
    day: number;
    khataPressure: number;
    random: () => number;
  }): CustomerVisit {
    const requested = this.normalizeBasket(params.planned.basket);
    const fulfilled: CustomerOrderLine[] = [];
    const missed: CustomerOrderLine[] = [];
    let revenue = 0;
    let costOfGoods = 0;

    for (const line of requested) {
      const product = PRODUCTS.find((p) => p.id === line.productId);
      if (!product) continue;

      const discountedPrice = params.inv.getDiscountedPrice(line.productId);
      const sold = params.inv.sellStock(line.productId, line.quantity);
      const stockout = line.quantity - sold;

      if (sold > 0) {
        fulfilled.push({ productId: line.productId, quantity: sold });
      }
      if (stockout > 0) {
        missed.push({ productId: line.productId, quantity: stockout });
      }

      const result = params.productResults.get(line.productId)!;
      result.demand += line.quantity;
      result.sold += sold;
      result.stockout += stockout;
      result.revenue += sold * discountedPrice;
      result.costOfGoods += sold * product.costPrice;

      revenue += sold * discountedPrice;
      costOfGoods += sold * product.costPrice;
    }

    const requestedTotal = requested.reduce((sum, line) => sum + line.quantity, 0);
    const fulfilledTotal = fulfilled.reduce((sum, line) => sum + line.quantity, 0);
    const outcome: CustomerVisitOutcome = requestedTotal === 0 || missed.length === 0
      ? 'fulfilled'
      : fulfilledTotal === 0
        ? 'missed'
        : 'partial';
    const payment = this.resolvePayment(params.planned.customer, revenue, outcome, params.khataPressure, params.random);
    const trustDelta = this.applyTrustRecoveryBoost(
      this.calculateCustomerTrustDelta(params.planned.customer, outcome, missed),
      outcome,
      params.planned.trustRecoveryBoost ?? 0
    );
    const note = this.getVisitNote(outcome, missed, params.planned.customer, params.planned.trustRecoveryBoost ?? 0);

    if (params.planned.customer) {
      this.recordCustomerVisit(
        params.planned.customer,
        params.day,
        requested,
        fulfilled,
        missed,
        outcome,
        revenue,
        trustDelta,
        payment.mode,
        payment.khataAmount
      );
    }

    return {
      customerId: params.planned.customerId,
      customerName: params.planned.customerName,
      segment: params.planned.segment,
      wave: params.planned.wave,
      requested,
      fulfilled,
      missed,
      revenue: Math.round(revenue),
      costOfGoods: Math.round(costOfGoods),
      margin: Math.round(revenue - costOfGoods),
      paymentMode: payment.mode,
      amountPaid: Math.round(payment.amountPaid),
      khataAmount: Math.round(payment.khataAmount),
      trustDelta,
      outcome,
      note,
      visitReasons: params.planned.visitReasons,
      demandReasons: params.planned.demandReasons,
      visitProbability: params.planned.visitProbability,
    };
  }

  private resolvePayment(
    customer: CustomerProfile | undefined,
    revenue: number,
    outcome: CustomerVisitOutcome,
    khataPressure: number,
    random: () => number
  ): { mode: PaymentMode; amountPaid: number; khataAmount: number } {
    if (revenue <= 0 || outcome === 'missed') {
      return { mode: 'none', amountPaid: 0, khataAmount: 0 };
    }
    if (!customer) {
      return { mode: 'instant', amountPaid: revenue, khataAmount: 0 };
    }

    const khataChanceBySegment: Record<CustomerSegment, number> = {
      regular: 0.2,
      student: 0.06,
      family: 0.32,
      office: 0.38,
      bulk: 0.46,
      snack: 0.1,
      walkin: 0,
    };
    const baseChance = khataChanceBySegment[customer.segment] ?? 0;
    const balancePressure = customer.khataBalance > 500 ? -0.16 : customer.khataBalance > 0 ? -0.06 : 0;
    const pricePressure = customer.priceSensitivity > 60 ? 0.08 : 0;
    const chance = Math.max(0, Math.min(0.75, (baseChance + balancePressure + pricePressure) * khataPressure));

    if (random() >= chance) {
      return { mode: 'instant', amountPaid: revenue, khataAmount: 0 };
    }

    const khataShare = customer.segment === 'bulk' || customer.segment === 'office' ? 0.75 : 0.55;
    const khataAmount = Math.round(revenue * khataShare);
    return {
      mode: 'khata',
      amountPaid: revenue - khataAmount,
      khataAmount,
    };
  }

  private calculateCustomerTrustDelta(
    customer: CustomerProfile | undefined,
    outcome: CustomerVisitOutcome,
    missed: CustomerOrderLine[]
  ): number {
    if (!customer) return 0;
    if (outcome === 'fulfilled') {
      return customer.trust >= 92 ? 1 : 2;
    }

    const missedPenalty = missed.reduce((sum, line) => sum + this.getMissedLinePenalty(line), 0);
    if (outcome === 'partial') {
      return -Math.max(2, Math.min(8, missedPenalty));
    }
    return -Math.max(4, Math.min(12, missedPenalty + 3));
  }

  private applyTrustRecoveryBoost(
    baseDelta: number,
    outcome: CustomerVisitOutcome,
    trustRecoveryBoost: number
  ): number {
    if (trustRecoveryBoost <= 0) return baseDelta;
    if (outcome === 'fulfilled') return baseDelta + trustRecoveryBoost;
    if (outcome === 'partial') return baseDelta + Math.floor(trustRecoveryBoost / 2);
    return baseDelta;
  }

  private getMissedLinePenalty(line: CustomerOrderLine): number {
    const product = PRODUCTS.find((p) => p.id === line.productId);
    const impact = product?.trustImpact ?? 'low';
    const base = impact === 'high' ? 4 : impact === 'medium' ? 2 : 1;
    const quantityWeight = Math.min(3, Math.ceil(line.quantity / Math.max(1, product?.orderIncrement ?? 1)));
    return base + quantityWeight;
  }

  private recordCustomerVisit(
    customer: CustomerProfile,
    day: number,
    requested: CustomerOrderLine[],
    fulfilled: CustomerOrderLine[],
    missed: CustomerOrderLine[],
    outcome: CustomerVisitOutcome,
    spend: number,
    trustDelta: number,
    paymentMode: PaymentMode,
    khataAmount: number
  ) {
    customer.visitCount += 1;
    if (outcome === 'fulfilled') {
      customer.successfulVisits += 1;
    } else {
      customer.failedVisits += 1;
    }
    customer.trust = Math.max(0, Math.min(100, customer.trust + trustDelta));
    customer.khataBalance += khataAmount;
    customer.lastVisitDay = day;
    customer.orderHistory = [
      ...customer.orderHistory,
      {
        day,
        requested: requested.map((line) => ({ ...line })),
        fulfilled: fulfilled.map((line) => ({ ...line })),
        missed: missed.map((line) => ({ ...line })),
        outcome,
        spend: Math.round(spend),
        paymentMode,
        khataAmount: Math.round(khataAmount),
      },
    ].slice(-8);
  }

  private getVisitNote(
    outcome: CustomerVisitOutcome,
    missed: CustomerOrderLine[],
    customer: CustomerProfile | undefined,
    trustRecoveryBoost: number
  ): string {
    if (outcome === 'fulfilled') {
      if (customer && trustRecoveryBoost > 0) {
        return 'Full basket served after relationship outreach; trust recovered.';
      }
      return customer ? 'Full basket served; relationship improved.' : 'Walk-in demand served.';
    }

    const missedNames = missed
      .map((line) => PRODUCTS.find((product) => product.id === line.productId)?.name ?? line.productId)
      .slice(0, 2)
      .join(', ');

    if (outcome === 'partial') {
      return `Partial basket; missed ${missedNames}.`;
    }
    return `Customer left without ${missedNames}.`;
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
}
