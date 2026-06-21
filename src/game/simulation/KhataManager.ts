import type { CustomerProfile } from '../../types';

export class KhataManager {
  collectReminders(customers: CustomerProfile[], reminderIds: string[]): number {
    let collected = 0;
    const uniqueReminderIds = new Set(reminderIds);

    for (const customer of customers) {
      if (!uniqueReminderIds.has(customer.id) || customer.khataBalance <= 0) continue;

      const reliability = (customer.behavior?.khataReliability ?? 55) / 100;
      const baseRate = customer.trust >= 75 ? 0.75 : customer.trust >= 55 ? 0.55 : 0.35;
      const collectionRate = Math.max(0.2, Math.min(0.85, baseRate * (0.75 + reliability * 0.5)));
      const amount = Math.max(0, Math.min(customer.khataBalance, Math.round(customer.khataBalance * collectionRate)));
      customer.khataBalance -= amount;
      customer.remindersSent += 1;
      collected += amount;

      if (customer.remindersSent > 2 && customer.trust > 40) {
        customer.trust -= 1;
      }
    }

    return collected;
  }
}
