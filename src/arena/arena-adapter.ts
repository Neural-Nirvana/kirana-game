import { PRODUCT_NAME } from '../constants/brand';
import { getMarketingCampaign } from '../constants/marketing';
import { DEFAULT_CONFIG, PRODUCTS } from '../constants/products';
import type {
  CustomerOrderLine,
  DayLog,
  InventoryMovement,
  PlayerActions,
  ProductId,
  RewardBreakdown,
} from '../types';
import type {
  AiDecisionRecord,
  AiReplayResponse,
  ArenaActionCard,
  ArenaDayMetrics,
  ArenaInventoryTile,
  ArenaLiveMetrics,
  ArenaReplayDay,
  ArenaReplayEvent,
  ArenaReplayRun,
  ArenaThoughtLine,
} from './arena-types';

const productsById = new Map(PRODUCTS.map((product) => [product.id, product]));

const fallbackRewards: RewardBreakdown = {
  service: 0,
  inventory: 0,
  money: 0,
  relationships: 0,
  marketing: 0,
  operations: 0,
  penalties: 0,
  total: 0,
};

export function adaptAiReplay(response: AiReplayResponse, maxDaysOverride?: number): ArenaReplayRun {
  const decisionsByDay = groupDecisions(response.decisions);
  const maxDays = maxDaysOverride ?? response.observation.visibleState.maxDays ?? DEFAULT_CONFIG.maxDays;
  let runningScore = 0;
  const days = response.timeline.map((log) => {
    runningScore += log.results.rewardBreakdown.total;
    const decisions = decisionsByDay.get(log.day) ?? [];
    return adaptDay(log, decisions, runningScore, maxDays);
  });

  return {
    runId: response.runId,
    summary: response.summary ?? {
      totalScore: runningScore,
      finalCash: days.at(-1)?.cash ?? Math.round(response.observation.state.cash),
      finalTrust: days.at(-1)?.trust ?? Math.round(response.observation.state.trust),
      daysCompleted: days.length,
    },
    days,
  };
}

function adaptDay(
  log: DayLog,
  decisions: AiDecisionRecord[],
  runningScore: number,
  maxDays: number
): ArenaReplayDay {
  const decision = decisions[decisions.length - 1];
  const action = decision?.action ?? log.playerActions;
  const metrics = buildMetrics(log);
  const inventory = buildInventoryTiles(log.results.inventoryMovements);
  const rationale = decision?.rationale ?? 'Heuristic replay action generated from current inventory, cash, and demand risks.';
  const validationStatus = decision?.error ? 'fallback' : 'valid';
  const thoughts = buildThoughts(log, metrics, rationale, validationStatus, decision?.error ?? undefined);

  return {
    day: log.day,
    maxDays,
    model: decision?.model ?? 'heuristic-v1',
    runName: `${PRODUCT_NAME} Replay`,
    weather: formatWeather(log.results.environmentContext.weather),
    eventLabel: formatEventLabel(log),
    cash: Math.round(log.results.cash),
    trust: Math.round(log.results.trust),
    trustDelta: Math.round(log.results.trustChange),
    score: runningScore,
    lastReward: log.results.rewardBreakdown.total,
    latencyMs: decision?.latencyMs ?? 0,
    validationStatus,
    retryCount: Math.max(0, decisions.length - 1),
    rationale,
    decisionAction: action,
    actionCards: buildActionCards(action),
    thoughts,
    metrics,
    rewards: log.results.rewardBreakdown ?? fallbackRewards,
    inventory,
    visits: log.results.customerVisits,
    events: buildReplayEvents(log, metrics, runningScore, action, inventory, thoughts),
  };
}

function groupDecisions(decisions: AiDecisionRecord[]) {
  const byDay = new Map<number, AiDecisionRecord[]>();
  for (const decision of decisions) {
    const group = byDay.get(decision.day) ?? [];
    group.push(decision);
    byDay.set(decision.day, group);
  }
  return byDay;
}

function buildMetrics(log: DayLog): ArenaDayMetrics {
  const soldUnits = sum(log.results.inventoryMovements, (movement) => movement.sold);
  const missedUnits = sum(log.results.inventoryMovements, (movement) => movement.missedDemand);
  const revenue = sum(log.results.productResults, (product) => product.revenue);
  return {
    visits: log.results.customerVisits.length,
    soldUnits,
    missedUnits,
    revenue,
    profit: log.results.profit,
    khata: log.results.khataAdded,
    stockouts: log.results.stockouts,
    marketingRoi: log.results.marketingPerformance?.roi ?? 0,
  };
}

function buildInventoryTiles(movements: InventoryMovement[]): ArenaInventoryTile[] {
  return movements.map((movement) => {
    const product = productsById.get(movement.productId);
    const openingShelf = movement.openingShelf ?? movement.available;
    const lowLimit = Math.max(product?.orderIncrement ?? 1, Math.ceil(openingShelf * 0.25));
    const status = movement.missedDemand > 0 || movement.closing <= 0
      ? 'stockout'
      : movement.closing <= lowLimit
        ? 'low'
        : 'good';

    return {
      productId: movement.productId,
      name: product?.name ?? movement.productId,
      unit: product?.unit ?? 'units',
      opening: movement.opening,
      openingShelf,
      ordered: movement.ordered,
      sold: movement.sold,
      missed: movement.missedDemand,
      closing: movement.closing,
      status,
    };
  });
}

function buildActionCards(action: PlayerActions): ArenaActionCard[] {
  const cards: ArenaActionCard[] = [];
  const orders = objectEntries(action.orders);
  const removals = objectEntries(action.removals);
  const discounts = objectEntries(action.discounts).filter(([, pct]) => pct > 0);
  const orderCost = orders.reduce((total, [productId, quantity]) => {
    const product = productsById.get(productId);
    return total + quantity * (product?.costPrice ?? 0);
  }, 0);

  if (orders.length > 0) {
    cards.push({
      id: 'restock',
      title: 'Restock stock',
      detail: `${sum(orders, ([, quantity]) => quantity)} units across ${orders.length} SKUs`,
      cost: orderCost,
      impact: orderCost > 1000 ? 'high' : 'medium',
    });
  }

  if (discounts.length > 0) {
    cards.push({
      id: 'discount',
      title: 'Discount offers',
      detail: discounts.map(([productId, pct]) => `${productLabel(productId)} ${pct}%`).join(', '),
      cost: 0,
      impact: 'medium',
    });
  }

  if (action.marketingActions.length > 0) {
    cards.push({
      id: 'marketing',
      title: 'Marketing push',
      detail: `${action.marketingActions.length} campaign${action.marketingActions.length > 1 ? 's' : ''} selected`,
      cost: 0,
      impact: 'high',
    });
  }

  if (action.khataReminders.length > 0) {
    cards.push({
      id: 'khata',
      title: 'Khata reminders',
      detail: `${action.khataReminders.length} customer${action.khataReminders.length > 1 ? 's' : ''} reminded`,
      cost: 0,
      impact: 'low',
    });
  }

  if (removals.length > 0) {
    cards.push({
      id: 'waste',
      title: 'Clear risk stock',
      detail: `${sum(removals, ([, quantity]) => quantity)} units removed`,
      cost: 0,
      impact: 'risk',
    });
  }

  if (cards.length === 0) {
    cards.push({
      id: 'hold',
      title: 'Hold position',
      detail: 'No purchase, offer, reminder, or removal action',
      cost: 0,
      impact: 'low',
    });
  }

  return cards.slice(0, 5);
}

function buildThoughts(
  log: DayLog,
  metrics: ArenaDayMetrics,
  rationale: string,
  validationStatus: ArenaReplayDay['validationStatus'],
  error: string | undefined
): ArenaThoughtLine[] {
  return [
    {
      id: 'observe',
      label: 'observe',
      tone: 'cyan',
      text: `${formatWeather(log.results.environmentContext.weather)} day, ${metrics.visits} visits, ${metrics.missedUnits} missed units.`,
    },
    {
      id: 'decide',
      label: 'decide',
      tone: 'green',
      text: compactSentence(rationale, 112),
    },
    {
      id: 'validate',
      label: 'validate',
      tone: validationStatus === 'valid' ? 'yellow' : 'red',
      text: validationStatus === 'valid' ? 'Action JSON accepted by backend.' : `Fallback used: ${compactSentence(error ?? 'invalid action', 84)}`,
    },
    {
      id: 'simulate',
      label: 'simulate',
      tone: 'purple',
      text: `Day replay sold ${metrics.soldUnits} units for ${currency(metrics.revenue)} revenue.`,
    },
    {
      id: 'reward',
      label: 'reward',
      tone: log.results.rewardBreakdown.total >= 0 ? 'green' : 'red',
      text: `Reward ${signed(log.results.rewardBreakdown.total)}. Profit ${currency(metrics.profit)}.`,
    },
  ];
}

function buildPlanningEvents(
  log: DayLog,
  liveMetrics: ArenaLiveMetrics,
  action: PlayerActions,
  inventory: ArenaInventoryTile[],
  thoughts: ArenaThoughtLine[]
): { events: ArenaReplayEvent[]; endAt: number } {
  const events: ArenaReplayEvent[] = [];
  let at = 200;

  events.push({
    type: 'ai_planning_start',
    at,
    text: `Planning Day ${log.day} before opening`,
    severity: 'neutral',
  });
  at += 280;

  const env = log.results.environmentContext;
  const envSignals: Array<{ text: string; severity: ArenaReplayEvent['severity']; productId?: ProductId }> = [
    { text: `Weather · ${formatWeather(env.weather)}`, severity: 'neutral' },
    { text: `Event · ${formatEventLabel(log)}`, severity: 'neutral' },
    { text: `Cash · ${currency(liveMetrics.cash)}`, severity: liveMetrics.cash < 1200 ? 'warn' : 'good' },
    { text: `Trust · ${liveMetrics.trust}%`, severity: liveMetrics.trust < 55 ? 'warn' : 'good' },
    { text: `Score · ${signed(liveMetrics.score)}`, severity: 'neutral' },
  ];

  for (const signal of env.signals.slice(0, 3)) {
    envSignals.push({ text: `Signal · ${compactSentence(signal, 42)}`, severity: 'neutral' });
  }

  const riskTiles = inventory.filter((tile) => tile.status !== 'good');
  const stableTiles = inventory.filter((tile) => tile.status === 'good').slice(0, 2);
  for (const tile of [...riskTiles, ...stableTiles].slice(0, 5)) {
    envSignals.push({
      text: `Shelf · ${tile.name} ${tile.openingShelf} ${tile.unit} (${tile.status})`,
      severity: tile.status === 'stockout' ? 'bad' : tile.status === 'low' ? 'warn' : 'good',
      productId: tile.productId,
    });
  }

  for (const signal of envSignals) {
    events.push({
      type: 'ai_env_review',
      at,
      text: signal.text,
      severity: signal.severity,
      productId: signal.productId,
    });
    at += 340;
  }

  const observeThought = thoughts.find((thought) => thought.label === 'observe');
  const decideThought = thoughts.find((thought) => thought.label === 'decide');
  events.push({
    type: 'ai_thinking',
    at,
    text: observeThought?.text ?? `Reading ${formatWeather(env.weather)} demand and shelf risk.`,
    severity: 'neutral',
  });
  at += 520;
  events.push({
    type: 'ai_thinking',
    at,
    text: decideThought?.text ?? 'Choosing restock, offers, and marketing for today.',
    severity: 'good',
  });
  at += 560;

  const discounts = objectEntries(action.discounts).filter(([, pct]) => pct > 0);
  if (discounts.length > 0) {
    events.push({
      type: 'ai_env_review',
      at,
      text: `Offers · ${discounts.map(([productId, pct]) => `${productLabel(productId)} ${pct}%`).join(', ')}`,
      severity: 'warn',
    });
    at += 360;
  }

  events.push({
    type: 'ai_plan_ready',
    at,
    text: 'Inventory and marketing plan locked',
    severity: 'good',
  });
  at += 300;

  const orders = objectEntries(action.orders);
  for (const [productId, quantity] of orders) {
    events.push({
      type: 'ai_restock_order',
      at,
      productId,
      productName: productLabel(productId),
      quantity,
      text: `Order ${productLabel(productId)} +${quantity}`,
      severity: 'good',
    });
    at += 460;
  }

  if (orders.length === 0) {
    events.push({
      type: 'ai_env_review',
      at,
      text: 'Restock · No supplier orders today',
      severity: 'neutral',
    });
    at += 320;
  }

  for (const selection of action.marketingActions.slice(0, 3)) {
    const campaign = getMarketingCampaign(selection.specId);
    events.push({
      type: 'ai_marketing_launch',
      at,
      text: campaign?.name ?? selection.specId,
      severity: 'good',
    });
    at += 420;
  }

  if (action.marketingActions.length === 0) {
    events.push({
      type: 'ai_env_review',
      at,
      text: 'Marketing · No campaign launched today',
      severity: 'neutral',
    });
    at += 280;
  }

  return { events, endAt: at };
}

function buildReplayEvents(
  log: DayLog,
  metrics: ArenaDayMetrics,
  runningScore: number,
  action: PlayerActions,
  inventory: ArenaInventoryTile[],
  thoughts: ArenaThoughtLine[]
): ArenaReplayEvent[] {
  const visibleVisits = log.results.customerVisits.slice(0, 12);
  const openingScore = runningScore - log.results.rewardBreakdown.total;
  const openingCash = Math.round(log.results.cash - sum(log.results.customerVisits, (visit) => visit.amountPaid));
  const openingTrust = Math.round(log.results.trust - log.results.trustChange);
  const liveMetrics: ArenaLiveMetrics = {
    day: log.day,
    cash: openingCash,
    trust: openingTrust,
    score: openingScore,
    visits: 0,
    soldUnits: 0,
    missedUnits: 0,
    revenue: 0,
    khata: 0,
  };
  const events: ArenaReplayEvent[] = [
    {
      type: 'day_started',
      at: 0,
      text: `Day ${log.day}`,
      severity: 'neutral',
      liveMetrics: { ...liveMetrics },
    },
    {
      type: 'day_phase',
      at: 120,
      phase: 'morning',
      text: 'Pre-open planning',
      severity: 'neutral',
    },
  ];

  const planning = buildPlanningEvents(log, liveMetrics, action, inventory, thoughts);
  events.push(...planning.events);
  let at = planning.endAt + 240;
  const afternoonIndex = Math.max(1, Math.floor(visibleVisits.length / 3));
  const eveningIndex = Math.max(2, Math.floor((visibleVisits.length * 2) / 3));
  const usedPhases = new Set<ArenaReplayEvent['phase']>(['morning']);

  for (const [index, visit] of visibleVisits.entries()) {
    if (index === afternoonIndex && !usedPhases.has('afternoon')) {
      events.push({
        type: 'day_phase',
        at,
        phase: 'afternoon',
        text: 'Afternoon counter',
        severity: 'neutral',
      });
      usedPhases.add('afternoon');
      at += 280;
    }

    if (index === eveningIndex && !usedPhases.has('evening')) {
      events.push({
        type: 'day_phase',
        at,
        phase: 'evening',
        text: 'Evening close',
        severity: 'neutral',
      });
      usedPhases.add('evening');
      at += 280;
    }

    events.push({
      type: 'customer_entered',
      at,
      customerIndex: index,
      customerName: visit.customerName,
      segment: visit.segment,
      text: visit.customerName,
      severity: 'neutral',
    });

    at += 360;

    events.push({
      type: 'demand_shown',
      at,
      customerIndex: index,
      customerName: visit.customerName,
      text: orderSummary(visit.requested),
      severity: visit.outcome === 'fulfilled' ? 'good' : visit.outcome === 'partial' ? 'warn' : 'bad',
    });

    for (const line of visit.fulfilled.slice(0, 4)) {
      at += 520;
      events.push({
        type: 'item_conveyed',
        at,
        customerIndex: index,
        customerName: visit.customerName,
        productId: line.productId,
        productName: productLabel(line.productId),
        quantity: line.quantity,
        text: `${productLabel(line.productId)} x${line.quantity}`,
        severity: 'good',
      });
    }

    if (visit.amountPaid > 0) {
      at += 280;
      events.push({
        type: 'sale_paid',
        at,
        customerIndex: index,
        amount: visit.amountPaid,
        text: currency(visit.amountPaid),
        severity: 'good',
      });
    }

    if (visit.khataAmount > 0) {
      at += 240;
      events.push({
        type: 'khata_written',
        at,
        customerIndex: index,
        amount: visit.khataAmount,
        text: currency(visit.khataAmount),
        severity: 'warn',
      });
    }

    for (const line of visit.missed.slice(0, 2)) {
      at += 300;
      events.push({
        type: 'stockout_missed',
        at,
        customerIndex: index,
        productId: line.productId,
        productName: productLabel(line.productId),
        quantity: line.quantity,
        text: `${productLabel(line.productId)} missed x${line.quantity}`,
        severity: 'bad',
      });
    }

    if (visit.trustDelta !== 0) {
      at += 260;
      events.push({
        type: 'trust_changed',
        at,
        customerIndex: index,
        trustDelta: visit.trustDelta,
        text: `${signed(visit.trustDelta)} trust`,
        severity: visit.trustDelta >= 0 ? 'good' : 'bad',
      });
    }

    liveMetrics.visits += 1;
    liveMetrics.soldUnits += sum(visit.fulfilled, (line) => line.quantity);
    liveMetrics.missedUnits += sum(visit.missed, (line) => line.quantity);
    liveMetrics.revenue += Math.round(visit.revenue);
    liveMetrics.khata += Math.round(visit.khataAmount);
    liveMetrics.cash += Math.round(visit.amountPaid);
    liveMetrics.trust += Math.round(visit.trustDelta);

    at += 160;
    events.push({
      type: 'metrics_changed',
      at,
      customerIndex: index,
      customerName: visit.customerName,
      severity: visit.outcome === 'fulfilled' ? 'good' : visit.outcome === 'partial' ? 'warn' : 'bad',
      liveMetrics: { ...liveMetrics },
    });

    at += 240;
    events.push({
      type: 'customer_exited',
      at,
      customerIndex: index,
      customerName: visit.customerName,
      text: visit.outcome === 'fulfilled' ? 'Bag filled' : visit.outcome === 'partial' ? 'Partial bag' : 'Left unhappy',
      severity: visit.outcome === 'fulfilled' ? 'good' : visit.outcome === 'partial' ? 'warn' : 'bad',
    });

    at += 260;
  }

  events.push({
    type: 'reward_updated',
    at: at + 450,
    amount: log.results.rewardBreakdown.total,
    text: `${signed(log.results.rewardBreakdown.total)} reward`,
    severity: log.results.rewardBreakdown.total >= 0 ? 'good' : 'bad',
    liveMetrics: {
      day: log.day,
      cash: Math.round(log.results.cash),
      trust: Math.round(log.results.trust),
      score: runningScore,
      visits: metrics.visits,
      soldUnits: metrics.soldUnits,
      missedUnits: metrics.missedUnits,
      revenue: metrics.revenue,
      khata: metrics.khata,
    },
  });
  events.push({
    type: 'day_complete',
    at: at + 900,
    text: `${metrics.visits} visits complete`,
    severity: metrics.missedUnits > 0 ? 'warn' : 'good',
  });

  return events;
}

function formatEventLabel(log: DayLog) {
  if (log.events.length > 0) return log.events.slice(0, 2).join(' + ');
  const signals = log.results.environmentContext.signals.filter((signal) => /festival|school|weekend|rain|heat/i.test(signal));
  return signals[0] ?? 'Routine day';
}

function formatWeather(weather: string) {
  const labels: Record<string, string> = {
    normal: 'Normal',
    hot: 'Hot',
    very_hot: 'Heatwave',
    rainy: 'Rainy',
  };
  return labels[weather] ?? weather;
}

function productLabel(productId: ProductId) {
  return productsById.get(productId)?.name ?? productId;
}

function orderSummary(lines: CustomerOrderLine[]) {
  return lines.map((line) => `${productLabel(line.productId)} ${line.quantity}`).join(' · ');
}

function compactSentence(text: string, maxLength: number) {
  const clean = text.replace(/\s+/g, ' ').trim();
  return clean.length > maxLength ? `${clean.slice(0, maxLength - 1).trim()}...` : clean;
}

function objectEntries(record: Partial<Record<ProductId, number>>) {
  return (Object.entries(record) as Array<[ProductId, number]>).filter(([, value]) => value > 0);
}

function currency(value: number) {
  return `₹${Math.round(value).toLocaleString('en-IN')}`;
}

function signed(value: number) {
  return `${value >= 0 ? '+' : ''}${Math.round(value)}`;
}

function sum<T>(items: T[], mapper: (item: T) => number) {
  return items.reduce((total, item) => total + mapper(item), 0);
}
