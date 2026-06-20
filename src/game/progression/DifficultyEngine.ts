import type { DifficultyProfile, ShopReward } from '../../types';

export class DifficultyEngine {
  getProfile(day: number): DifficultyProfile {
    if (day <= 7) {
      return {
        day,
        week: 1,
        label: 'Starter Counter',
        focus: 'Basic fulfillment and stockouts',
        demandMultiplier: 1,
        khataPressure: 0.75,
        eventPressure: 0.7,
        activeItemSlots: 7,
        unlockedSystems: ['case_report', 'stock_ordering', 'offers'],
      };
    }

    if (day <= 14) {
      return {
        day,
        week: 2,
        label: 'Khata & Perishables',
        focus: 'Credit discipline, waste, and regular memory',
        demandMultiplier: 1.08,
        khataPressure: 1,
        eventPressure: 1,
        activeItemSlots: 9,
        unlockedSystems: ['case_report', 'stock_ordering', 'offers', 'khata_reminders', 'stock_removal'],
      };
    }

    if (day <= 21) {
      return {
        day,
        week: 3,
        label: 'Event Pressure',
        focus: 'Weather, festival bursts, and supplier risk',
        demandMultiplier: 1.18,
        khataPressure: 1.12,
        eventPressure: 1.25,
        activeItemSlots: 12,
        unlockedSystems: ['events', 'supplier_risk', 'khata_reminders', 'stock_removal', 'offers'],
      };
    }

    return {
      day,
      week: 4,
      label: 'Scaling Rush',
      focus: 'More demand, tighter cash, and harder customer recovery',
      demandMultiplier: 1.3,
      khataPressure: 1.2,
      eventPressure: 1.45,
      activeItemSlots: 16,
      unlockedSystems: ['events', 'supplier_risk', 'category_expansion', 'customer_recovery', 'advanced_khata'],
    };
  }

  getRewards(day: number, totalScore: number): ShopReward[] {
    return [
      {
        id: 'supplier_terms',
        title: 'Better supplier terms',
        description: 'Higher future order comfort after disciplined cash handling.',
        type: 'supplier',
        unlocked: totalScore >= 180 || day >= 8,
      },
      {
        id: 'khata_discipline',
        title: 'Khata discipline',
        description: 'Reminder actions become more effective as customer records mature.',
        type: 'relationship',
        unlocked: day >= 8,
      },
      {
        id: 'extra_fridge_shelf',
        title: 'Extra fridge shelf',
        description: 'Future expansion path for milk and cold drinks pressure.',
        type: 'storage',
        unlocked: totalScore >= 360 || day >= 15,
      },
      {
        id: 'demand_note',
        title: 'Demand note',
        description: 'Future forecast layer for recurring missed demand.',
        type: 'forecast',
        unlocked: totalScore >= 420 || day >= 18,
      },
      {
        id: 'staples_category',
        title: 'Staples category',
        description: 'Future playable expansion: rice, atta, dal, oil, sugar, and salt.',
        type: 'category',
        unlocked: totalScore >= 520 || day >= 22,
      },
    ];
  }
}
