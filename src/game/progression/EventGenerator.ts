import type { DifficultyProfile, Weather } from '../../types';

export class EventGenerator {
  generate(day: number, weather: Weather, difficulty: DifficultyProfile, random: () => number): string[] {
    const events: string[] = [];
    const r = random();
    const pressure = difficulty.eventPressure;

    if (day === 3 && r < 0.7 * pressure) {
      events.push('evening_milk_rush');
    }
    if (day >= 12 && day <= 14) {
      events.push('festival_weekend');
    }
    if (day === 7 && r < 0.6 * pressure) {
      events.push('supplier_delay');
    }
    if (day === 25 && r < 0.5 * pressure) {
      events.push('competitor_discount');
    }
    if (weather === 'very_hot') {
      events.push('heat_wave');
    }
    if (difficulty.week >= 3 && weather === 'rainy' && r < 0.35 * pressure) {
      events.push('rainy_snack_rush');
    }

    return events;
  }
}
