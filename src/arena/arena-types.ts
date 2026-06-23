import type {
  CustomerSegment,
  CustomerVisit,
  DayLog,
  PlayerActions,
  ProductId,
  RewardBreakdown,
  RunObservation,
} from '../types';

export type ArenaReplayEventType =
  | 'day_started'
  | 'day_phase'
  | 'ai_scanned'
  | 'customer_entered'
  | 'demand_shown'
  | 'item_conveyed'
  | 'sale_paid'
  | 'khata_written'
  | 'stockout_missed'
  | 'trust_changed'
  | 'customer_exited'
  | 'reward_updated'
  | 'day_complete';

export interface AiDecisionRecord {
  day: number;
  observationHash: string;
  action: PlayerActions;
  rationale: string;
  model: string;
  latencyMs: number;
  costEstimate: number;
  error?: string | null;
}

export interface AiReplayResponse {
  runId: string;
  observation: RunObservation;
  timeline: DayLog[];
  decisions: AiDecisionRecord[];
  summary?: {
    totalScore: number;
    finalCash: number;
    finalTrust: number;
    daysCompleted: number;
  };
}

export type ArenaMode = 'llm' | 'heuristic';
export type ArenaStatus = 'queued' | 'running' | 'complete' | 'failed';
export type ArenaRunStatus = 'queued' | 'running' | 'complete' | 'failed';

export interface ArenaModelPreset {
  id: string;
  label: string;
  note: string;
}

export interface ArenaModelsResponse {
  presets: ArenaModelPreset[];
  available: Array<{
    id: string;
    name?: string;
    contextLength?: number;
    pricing?: unknown;
  }>;
  note: string;
}

export interface ArenaDayTrace {
  day: number;
  reward: number;
  cash: number;
  trust: number;
  scoreTotal: number;
  action: PlayerActions;
  rationale: string;
  model: string;
  latencyMs: number;
  retryCount: number;
  error?: string;
}

export interface ArenaRunSummary {
  model: string;
  status: ArenaRunStatus;
  day: number;
  totalReward: number;
  runId?: string;
  finalCash?: number;
  finalTrust?: number;
  decisions: ArenaDayTrace[];
  error?: string;
}

export interface ArenaJobResponse {
  arenaId: string;
  status: ArenaStatus;
  mode: ArenaMode;
  models: string[];
  maxDays: number;
  createdAt: string;
  updatedAt: string;
  runs: ArenaRunSummary[];
  error?: string;
}

export interface ArenaReplayEvent {
  type: ArenaReplayEventType;
  at: number;
  customerIndex?: number;
  customerName?: string;
  segment?: CustomerSegment;
  productId?: ProductId;
  productName?: string;
  quantity?: number;
  amount?: number;
  trustDelta?: number;
  phase?: 'morning' | 'afternoon' | 'evening';
  text?: string;
  severity?: 'good' | 'warn' | 'bad' | 'neutral';
}

export interface ArenaInventoryTile {
  productId: ProductId;
  name: string;
  unit: string;
  opening: number;
  openingShelf: number;
  ordered: number;
  sold: number;
  missed: number;
  closing: number;
  status: 'good' | 'low' | 'stockout';
}

export interface ArenaDayMetrics {
  visits: number;
  soldUnits: number;
  missedUnits: number;
  revenue: number;
  profit: number;
  khata: number;
  stockouts: number;
  marketingRoi: number;
}

export interface ArenaActionCard {
  id: string;
  title: string;
  detail: string;
  cost: number;
  impact: 'high' | 'medium' | 'low' | 'risk';
}

export interface ArenaThoughtLine {
  id: string;
  label: 'observe' | 'decide' | 'validate' | 'simulate' | 'reward';
  text: string;
  tone: 'cyan' | 'green' | 'yellow' | 'purple' | 'red';
}

export interface ArenaReplayDay {
  day: number;
  maxDays: number;
  model: string;
  runName: string;
  weather: string;
  eventLabel: string;
  cash: number;
  trust: number;
  trustDelta: number;
  score: number;
  lastReward: number;
  latencyMs: number;
  validationStatus: 'valid' | 'fallback';
  retryCount: number;
  rationale: string;
  decisionAction: PlayerActions;
  actionCards: ArenaActionCard[];
  thoughts: ArenaThoughtLine[];
  metrics: ArenaDayMetrics;
  rewards: RewardBreakdown;
  inventory: ArenaInventoryTile[];
  visits: CustomerVisit[];
  events: ArenaReplayEvent[];
}

export interface ArenaReplayRun {
  runId: string;
  summary: NonNullable<AiReplayResponse['summary']>;
  days: ArenaReplayDay[];
}
