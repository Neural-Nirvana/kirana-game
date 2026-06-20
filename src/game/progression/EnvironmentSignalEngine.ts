import type { CustomerProfile, DayResult, ProductId, Weather } from '../../types';
import { PRODUCTS } from '../../constants/products';
import { DifficultyEngine } from './DifficultyEngine';
import { EnvironmentContextEngine } from './EnvironmentContextEngine';

export interface WeatherOutlookDay {
  day: number;
  dayName: string;
  dateLabel: string;
  weather: Weather;
  temperature: number;
  confidence: 'high' | 'medium' | 'low';
  tag?: string;
}

export interface EnvironmentSignalReport {
  planningDay: number;
  dayName: string;
  dateLabel: string;
  weekLabel: string;
  monthPhase: string;
  weekendText: string;
  tomorrowWeather: WeatherOutlookDay;
  week: WeatherOutlookDay[];
  calendarSignals: string[];
  customerSignals: string[];
  marketSignals: string[];
  shopMemorySignals: string[];
}

export class EnvironmentSignalEngine {
  private static readonly DAY_NAMES = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
  private static readonly MONTH_NAME = 'June';
  private readonly difficultyEngine = new DifficultyEngine();
  private readonly contextEngine = new EnvironmentContextEngine();

  buildOpening(params: {
    maxDays: number;
    customers: CustomerProfile[];
  }): EnvironmentSignalReport {
    const planningDay = 1;
    const week = Array.from({ length: 7 }, (_, offset) => this.forecastDay(Math.min(planningDay + offset, params.maxDays), offset));
    week[0] = { ...week[0], tag: 'Opening' };
    const tomorrowWeather = week[0];
    const context = this.contextEngine.build({
      day: planningDay,
      weather: tomorrowWeather.weather,
      events: this.expectedEventsFor(planningDay, tomorrowWeather.weather),
      difficulty: this.difficultyEngine.getProfile(planningDay),
    });
    const contextSignals = this.withForecastUncertainty(context.signals, context.confidence, context.randomnessPct);

    return {
      planningDay,
      dayName: this.dayName(planningDay),
      dateLabel: this.dateLabel(planningDay),
      weekLabel: `Week ${Math.ceil(planningDay / 7)}`,
      monthPhase: this.monthPhase(planningDay),
      weekendText: this.weekendDistance(planningDay),
      tomorrowWeather,
      week,
      calendarSignals: this.calendarSignals(planningDay),
      customerSignals: this.openingCustomerSignals(planningDay, params.customers),
      marketSignals: this.openingMarketSignals(planningDay, tomorrowWeather, contextSignals),
      shopMemorySignals: [
        'Shelves start empty: your first purchase becomes Day 1 opening stock',
        'After closing, compare sold units, missed demand, and cash left',
        'Use the Day 1 report to plan Day 2 restocking',
      ],
    };
  }

  build(params: {
    completedDay: number;
    maxDays: number;
    customers: CustomerProfile[];
    result: DayResult;
  }): EnvironmentSignalReport {
    const planningDay = Math.min(params.completedDay + 1, params.maxDays);
    const week = Array.from({ length: 7 }, (_, offset) => this.forecastDay(Math.min(planningDay + offset, params.maxDays), offset));
    const tomorrowWeather = week[0];
    const context = this.contextEngine.build({
      day: planningDay,
      weather: tomorrowWeather.weather,
      events: this.expectedEventsFor(planningDay, tomorrowWeather.weather),
      difficulty: this.difficultyEngine.getProfile(planningDay),
    });
    const contextSignals = this.withForecastUncertainty(context.signals, context.confidence, context.randomnessPct);

    return {
      planningDay,
      dayName: this.dayName(planningDay),
      dateLabel: this.dateLabel(planningDay),
      weekLabel: `Week ${Math.ceil(planningDay / 7)}`,
      monthPhase: this.monthPhase(planningDay),
      weekendText: this.weekendDistance(planningDay),
      tomorrowWeather,
      week,
      calendarSignals: this.calendarSignals(planningDay),
      customerSignals: this.customerSignals(planningDay, params.customers, params.result),
      marketSignals: this.marketSignals(planningDay, tomorrowWeather, params.result, contextSignals),
      shopMemorySignals: this.shopMemorySignals(params.result),
    };
  }

  private forecastDay(day: number, offset: number): WeatherOutlookDay {
    const weather = this.forecastWeather(day);
    const dayName = this.dayName(day);
    return {
      day,
      dayName,
      dateLabel: this.dateLabel(day),
      weather,
      temperature: this.temperatureFor(day, weather),
      confidence: this.confidenceFor(day, offset),
      tag: this.tagFor(day, dayName, offset),
    };
  }

  private calendarSignals(day: number): string[] {
    const signals = [
      `${this.dayName(day)} · ${this.dateLabel(day)} · ${this.monthPhase(day)}`,
      this.weekendDistance(day),
    ];

    if (day <= 3) signals.push('Opening week: learn normal household rhythm');
    else if (day >= 4 && day <= 6) signals.push('School reopening window: student and family routines active');
    else if (day >= 12 && day <= 14) signals.push('Festival weekend window: family and snack footfall can spike');
    else if (day >= 25) signals.push('Month-end: cash discipline and khata follow-up matter more');
    else signals.push('Regular trading day: use yesterday plus customer rhythm');

    return signals;
  }

  private customerSignals(day: number, customers: CustomerProfile[], result: DayResult): string[] {
    const dueCustomers = customers.filter((customer) => this.isCustomerLikely(day, customer));
    const segmentCounts = this.countSegments(dueCustomers);
    const segmentText = Object.entries(segmentCounts)
      .filter(([, count]) => count > 0)
      .map(([segment, count]) => `${this.segmentLabel(segment)} ${count}`)
      .slice(0, 4)
      .join(' · ');
    const notFullyServed = result.customerVisits.filter((visit) => visit.segment !== 'walkin' && visit.outcome !== 'fulfilled').length;
    const khataCustomers = customers.filter((customer) => customer.khataBalance > 0).length;
    const signals = [
      segmentText ? `${dueCustomers.length} known customers likely: ${segmentText}` : 'Mostly walk-in rhythm expected',
    ];

    if (notFullyServed > 0) signals.push(`${notFullyServed} known customers were not fully served today`);
    else signals.push('Known customers were mostly satisfied today');

    if (khataCustomers > 0) signals.push(`${khataCustomers} customer${khataCustomers === 1 ? '' : 's'} carry khata balance`);
    else signals.push('No active khata pressure from regulars');

    return signals;
  }

  private openingCustomerSignals(day: number, customers: CustomerProfile[]): string[] {
    const dueCustomers = customers.filter((customer) => this.isCustomerLikely(day, customer));
    const segmentCounts = this.countSegments(dueCustomers);
    const segmentText = Object.entries(segmentCounts)
      .filter(([, count]) => count > 0)
      .map(([segment, count]) => `${this.segmentLabel(segment)} ${count}`)
      .slice(0, 4)
      .join(' · ');

    return [
      segmentText ? `${dueCustomers.length} known customers may visit: ${segmentText}` : 'Mostly walk-in rhythm expected',
      'Regulars remember essentials first: missed milk or bread hurts trust more',
      'Walk-ins can still buy snacks, drinks, and quick counter items',
    ];
  }

  private marketSignals(day: number, weather: WeatherOutlookDay, result: DayResult, contextSignals: string[]): string[] {
    const signals: string[] = [];

    if (weather.weather === 'very_hot') signals.push(`Very hot ${weather.temperature}°C forecast: afternoon footfall can shift`);
    else if (weather.weather === 'hot') signals.push(`Hot ${weather.temperature}°C forecast: heat-sensitive routines may rise`);
    else if (weather.weather === 'rainy') signals.push(`Rainy ${weather.temperature}°C forecast: quick comfort purchases may rise`);
    else signals.push(`Normal ${weather.temperature}°C forecast: routine demand more reliable`);

    if (day === 3) signals.push('Evening rush risk window is near');
    else if (day >= 4 && day <= 6) signals.push('School reopening pressure is active');
    else if (day === 7) signals.push('Supplier delay risk day: keep a buffer before opening');
    else if (day >= 12 && day <= 14) signals.push('Festival pressure is active');
    else if (day >= 18 && day <= 24) signals.push('Heat-wave stretch: fridge and perishability pressure rises');
    else if (day === 25) signals.push('Competitor discount risk can change walk-in mix');
    else signals.push(result.difficulty.focus);

    return this.uniqueSignals([...signals, ...contextSignals]).slice(0, 4);
  }

  private openingMarketSignals(day: number, weather: WeatherOutlookDay, contextSignals: string[]): string[] {
    const signals = [
      weather.weather === 'normal'
        ? `Normal ${weather.temperature}°C forecast: routine demand is a good baseline`
        : `${this.weatherLabel(weather.weather)} ${weather.temperature}°C forecast: environment can shift walk-in mix`,
    ];

    if (day <= 3) {
      signals.push('Opening week: buy enough to learn demand, not enough to trap cash');
    }
    signals.push('Keep a cash reserve for tomorrow’s correction order');
    return this.uniqueSignals([...signals, ...contextSignals]).slice(0, 4);
  }

  private shopMemorySignals(result: DayResult): string[] {
    const totalMissed = result.inventoryMovements.reduce((sum, row) => sum + row.missedDemand, 0);
    const perishableRisk = result.inventoryMovements.reduce((sum, row) => sum + row.perishability.wasteRiskCost, 0);
    const groupPressure = this.groupMissedDemand(result);
    const signals = [
      totalMissed > 0
        ? `${totalMissed} units of demand were missed today`
        : 'No missed demand recorded today',
    ];

    if (groupPressure) signals.push(groupPressure);
    else signals.push('No category showed unusual pressure');

    if (perishableRisk > 0) signals.push(`Perishable exposure is about ₹${perishableRisk.toLocaleString()}`);
    else signals.push('Perishable exposure is calm after closing');

    return signals;
  }

  private groupMissedDemand(result: DayResult): string {
    const groups: Record<string, number> = {
      Essentials: 0,
      'Snacks and cold': 0,
      Fresh: 0,
      'Shelf goods': 0,
    };

    for (const row of result.inventoryMovements) {
      if (row.missedDemand <= 0) continue;
      const product = PRODUCTS.find((p) => p.id === row.productId);
      if (!product) continue;
      groups[this.groupForProduct(product.id)] += row.missedDemand;
    }

    const strongest = Object.entries(groups).sort((a, b) => b[1] - a[1])[0];
    return strongest && strongest[1] > 0 ? `${strongest[0]} had the strongest missed-demand pressure` : '';
  }

  private groupForProduct(productId: ProductId): string {
    const product = PRODUCTS.find((p) => p.id === productId);
    if (!product) return 'Shelf goods';
    if (product.category.includes('perishable') || product.category.includes('semi_perishable')) return 'Fresh';
    if (product.category.includes('snack') || product.category.includes('event')) return 'Snacks and cold';
    if (product.category.includes('essential')) return 'Essentials';
    return 'Shelf goods';
  }

  private isCustomerLikely(day: number, customer: CustomerProfile): boolean {
    const cadence = Math.max(1, customer.cadence);
    if (cadence === 1 || (day + customer.visitOffset) % cadence === 0) return true;
    if (day >= 4 && day <= 6 && customer.segment === 'student') return true;
    if (day >= 12 && day <= 14 && ['family', 'student', 'snack'].includes(customer.segment)) return true;
    return false;
  }

  private countSegments(customers: CustomerProfile[]): Record<string, number> {
    return customers.reduce<Record<string, number>>((counts, customer) => {
      counts[customer.segment] = (counts[customer.segment] ?? 0) + 1;
      return counts;
    }, {});
  }

  private forecastWeather(day: number): Weather {
    if (day >= 18 && day <= 24) {
      return day % 3 === 0 ? 'very_hot' : 'hot';
    }
    if (day >= 12 && day <= 14) {
      return day % 2 === 0 ? 'hot' : 'normal';
    }

    const dayIndex = (day - 1) % 7;
    const weeklyPattern: Weather[] = ['normal', 'hot', 'normal', 'rainy', 'hot', 'very_hot', 'hot'];
    return weeklyPattern[dayIndex];
  }

  private expectedEventsFor(day: number, weather: Weather): string[] {
    const events: string[] = [];
    if (day === 3) events.push('evening_milk_rush');
    if (day >= 12 && day <= 14) events.push('festival_weekend');
    if (day === 7) events.push('supplier_delay');
    if (day === 25) events.push('competitor_discount');
    if (weather === 'very_hot') events.push('heat_wave');
    if (day >= 18 && day <= 24 && weather === 'rainy') events.push('rainy_snack_rush');
    return events;
  }

  private temperatureFor(day: number, weather: Weather): number {
    const base: Record<Weather, number> = {
      normal: 31,
      hot: 34,
      very_hot: 38,
      rainy: 28,
    };
    const drift = day >= 18 && day <= 24 ? 2 : day >= 12 && day <= 14 ? 1 : 0;
    return base[weather] + drift + (day % 3 === 0 ? 1 : 0);
  }

  private confidenceFor(day: number, offset: number): WeatherOutlookDay['confidence'] {
    if (day >= 12 && day <= 14) return 'high';
    if (day >= 18 && day <= 24) return offset <= 3 ? 'high' : 'medium';
    if (offset <= 1) return 'high';
    if (offset <= 4) return 'medium';
    return 'low';
  }

  private tagFor(day: number, dayName: string, offset: number): string | undefined {
    if (offset === 0) return 'Tomorrow';
    if (dayName === 'Saturday' || dayName === 'Sunday') return 'Weekend';
    if (day >= 4 && day <= 6) return 'School';
    if (day >= 12 && day <= 14) return 'Festival';
    if (day >= 18 && day <= 24) return 'Heat';
    return undefined;
  }

  private weekendDistance(day: number): string {
    const dayIndex = (day - 1) % 7;
    if (dayIndex === 5 || dayIndex === 6) return 'Weekend trading day';
    return `${5 - dayIndex} day${5 - dayIndex === 1 ? '' : 's'} until weekend`;
  }

  private dayName(day: number): string {
    return EnvironmentSignalEngine.DAY_NAMES[(day - 1) % 7];
  }

  private dateLabel(day: number): string {
    return `${EnvironmentSignalEngine.MONTH_NAME} ${day}`;
  }

  private monthPhase(day: number): string {
    if (day <= 7) return 'Month start';
    if (day <= 14) return 'Mid-month build-up';
    if (day <= 21) return 'Late-month pressure';
    return 'Month-end';
  }

  private segmentLabel(segment: string): string {
    const labels: Record<string, string> = {
      regular: 'regulars',
      student: 'students',
      family: 'families',
      office: 'office',
      bulk: 'bulk',
      snack: 'snack groups',
      walkin: 'walk-ins',
    };
    return labels[segment] ?? segment;
  }

  private weatherLabel(weather: Weather): string {
    const labels: Record<Weather, string> = {
      normal: 'Normal',
      hot: 'Hot',
      very_hot: 'Very hot',
      rainy: 'Rainy',
    };
    return labels[weather];
  }

  private uniqueSignals(signals: string[]): string[] {
    return signals.filter((signal, index, all) => signal.length > 0 && all.indexOf(signal) === index);
  }

  private withForecastUncertainty(
    signals: string[],
    confidence: 'high' | 'medium' | 'low',
    randomnessPct: number
  ): string[] {
    return [`Forecast confidence is ${confidence}; demand can swing about ±${randomnessPct}%`, ...signals];
  }
}
