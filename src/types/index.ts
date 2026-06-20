export type ProductId = 'milk' | 'bread' | 'eggs' | 'maggi' | 'chips' | 'cold_drinks' | 'bananas';

export type ProductCategory = 'essential' | 'perishable' | 'semi_perishable' | 'snack' | 'long_shelf' | 'event';

export type StorageType = 'fridge' | 'shelf' | 'counter';

export type Weather = 'normal' | 'hot' | 'very_hot' | 'rainy';

export type DayPhase = 'morning' | 'simulation' | 'crisis' | 'evening' | 'complete';

export type ScreenState = 'opening' | 'playing' | 'final';

export type CustomerWave = 'morning' | 'afternoon' | 'evening';

export type CustomerSegment = 'regular' | 'student' | 'family' | 'office' | 'bulk' | 'snack' | 'walkin';

export type CustomerVisitOutcome = 'fulfilled' | 'partial' | 'missed';

export type PaymentMode = 'instant' | 'khata' | 'none';

export type MarketingChannel = 'offline' | 'online' | 'in_store' | 'relationship';

export type MarketingCampaignStatus = 'scheduled' | 'active' | 'completed';

export interface ProductSpec {
  id: ProductId;
  name: string;
  category: ProductCategory[];
  storage: StorageType;
  baseDemand: number;       // base daily demand
  demandVariance: number;   // +/- variance
  shelfLife: number;        // days until expiry
  unit: string;             // 'L', 'packs', 'eggs', 'packets', 'bottles', 'kg'
  margin: number;           // profit per unit
  costPrice: number;        // cost per unit
  sellPrice: number;        // selling price per unit
  trustImpact: 'high' | 'medium' | 'low';
  storageUnits: number;     // units per item in storage
  orderIncrement: number;   // step size for orders
  perishabilityFactor: number; // 0 stable, 1 highly perishable
}

export interface StockBucket {
  quantity: number;
  dayAdded: number;         // which day this stock was added
}

export interface ProductInventory {
  productId: ProductId;
  buckets: StockBucket[];   // age-buckets for FIFO expiry
  totalStock: number;
  discountPct: number;      // 0-100
}

export interface WeatherEffect {
  weather: Weather;
  product: ProductId;
  multiplier: number;
}

export interface DemandForecast {
  productId: ProductId;
  min: number;
  max: number;
  expected: number;
}

export interface EnvironmentContext {
  day: number;
  weather: Weather;
  confidence: 'high' | 'medium' | 'low';
  randomnessPct: number;
  segmentVisitMultipliers: Partial<Record<CustomerSegment, number>>;
  productDemandMultipliers: Partial<Record<ProductId, number>>;
  signals: string[];
}

export interface PlayerActions {
  orders: Partial<Record<ProductId, number>>;
  removals: Partial<Record<ProductId, number>>;
  discounts: Partial<Record<ProductId, number>>;
  khataReminders: string[];
  marketingActions: MarketingActionSelection[];
  cashReserve: number;
  fridgeAllocation: {
    milk: number;
    cold_drinks: number;
    buffer: number;
  };
}

export interface MarketingActionSelection {
  specId: string;
  targetProducts?: ProductId[];
}

export interface MarketingCampaignSpec {
  id: string;
  name: string;
  channel: MarketingChannel;
  targetSegments: CustomerSegment[];
  targetProducts: ProductId[];
  cost: number;
  delayDays: number;
  durationDays: number;
  unlockDay: number;
  expectedReturn: string;
  riskNotes: string[];
}

export interface MarketingCampaignInstance {
  id: string;
  runId: string;
  specId: string;
  targetProducts?: ProductId[];
  plannedDay: number;
  effectStartDay: number;
  effectEndDay: number;
  status: MarketingCampaignStatus;
  cost: number;
  actualResult?: {
    incrementalVisits: number;
    incrementalRevenue: number;
    servedTargetUnits?: number;
    missedUnits: number;
    targetGrossMargin?: number;
    roi?: number;
    score?: number;
    promotedStockoutSkus?: ProductId[];
  };
}

export interface MarketingEffect {
  campaignId: string;
  specId: string;
  segments: CustomerSegment[];
  products: ProductId[];
  demandMultiplier: number;
  visitMultiplier: number;
  campaignCost: number;
  allocatedDailyCost: number;
}

export interface CrisisEvent {
  id: string;
  title: string;
  description: string;
  choices: CrisisChoice[];
  day: number;
}

export interface CrisisChoice {
  id: string;
  label: string;
  cost?: number;
  effect: string;
  risk: string;
}

export interface SimulationResult {
  productId: ProductId;
  demand: number;
  sold: number;
  stockout: number;
  revenue: number;
  costOfGoods: number;
  margin: number;
}

export interface CustomerOrderLine {
  productId: ProductId;
  quantity: number;
}

export interface CustomerVisitRecord {
  day: number;
  requested: CustomerOrderLine[];
  fulfilled: CustomerOrderLine[];
  missed: CustomerOrderLine[];
  outcome: CustomerVisitOutcome;
  spend: number;
  paymentMode: PaymentMode;
  khataAmount: number;
}

export interface CustomerProfile {
  id: string;
  name: string;
  segment: CustomerSegment;
  preferredWave: CustomerWave;
  cadence: number;
  visitOffset: number;
  visitPattern: string;
  usualBasket: CustomerOrderLine[];
  substitutionTolerance: number;
  priceSensitivity: number;
  trust: number;
  visitCount: number;
  successfulVisits: number;
  failedVisits: number;
  khataBalance: number;
  remindersSent: number;
  orderHistory: CustomerVisitRecord[];
  lastVisitDay?: number;
}

export interface CustomerVisit {
  customerId: string;
  customerName: string;
  segment: CustomerSegment;
  wave: CustomerWave;
  requested: CustomerOrderLine[];
  fulfilled: CustomerOrderLine[];
  missed: CustomerOrderLine[];
  revenue: number;
  costOfGoods: number;
  margin: number;
  paymentMode: PaymentMode;
  amountPaid: number;
  khataAmount: number;
  trustDelta: number;
  outcome: CustomerVisitOutcome;
  note: string;
  visitReasons: string[];
  demandReasons: string[];
  visitProbability?: number;
}

export interface InventoryMovement {
  productId: ProductId;
  /** Stock held before the supplier order for this day was applied. */
  opening: number;
  /** Stock actually on the shelf when customers started arriving. */
  openingShelf?: number;
  ordered: number;
  removed: number;
  available: number;
  sold: number;
  wasted: number;
  closing: number;
  missedDemand: number;
  offerPct: number;
  perishability: PerishabilitySnapshot;
}

export type PerishabilityStatus = 'stable' | 'fresh' | 'watch' | 'high' | 'expired';

export interface PerishabilitySnapshot {
  productId: ProductId;
  tracked: boolean;
  factor: number;
  freshUnits: number;
  agingUnits: number;
  atRiskUnits: number;
  expiredUnits: number;
  riskUnits: number;
  wasteRiskCost: number;
  averageFreshness: number;
  status: PerishabilityStatus;
  statusLabel: string;
  nextExpiryDay?: number;
}

export interface CustomerMemorySummary {
  activeCustomers: number;
  repeatCustomers: number;
  successfulVisits: number;
  failedVisits: number;
  atRiskCustomers: number;
  topCustomerName: string;
  topCustomerVisits: number;
}

export interface MarketingPerformance {
  activeCampaigns: number;
  spendToday: number;
  allocatedActiveCost: number;
  targetVisits: number;
  servedTargetUnits: number;
  missedTargetUnits: number;
  targetGrossMargin: number;
  roi: number;
  promotedStockoutSkus: ProductId[];
  score: number;
}

export interface DayResult {
  day: number;
  profit: number;
  wasteLoss: number;
  removalLoss: number;
  khataAdded: number;
  khataCollected: number;
  stockouts: number;
  trustChange: number;
  trust: number;
  cash: number;
  productResults: SimulationResult[];
  inventoryMovements: InventoryMovement[];
  customerVisits: CustomerVisit[];
  customerSummary: CustomerMemorySummary;
  environmentContext: EnvironmentContext;
  marketingPerformance: MarketingPerformance;
  difficulty: DifficultyProfile;
  unlockedRewards: ShopReward[];
  rewardBreakdown: RewardBreakdown;
}

export interface RewardBreakdown {
  service: number;
  inventory: number;
  money: number;
  relationships: number;
  marketing: number;
  operations: number;
  penalties: number;
  total: number;
}

export interface DifficultyProfile {
  day: number;
  week: number;
  label: string;
  focus: string;
  demandMultiplier: number;
  khataPressure: number;
  eventPressure: number;
  activeItemSlots: number;
  unlockedSystems: string[];
}

export interface ShopReward {
  id: string;
  title: string;
  description: string;
  type: 'supplier' | 'storage' | 'relationship' | 'forecast' | 'category';
  unlocked: boolean;
}

export interface DayLog {
  day: number;
  visibleStateBefore: VisibleState;
  playerActions: PlayerActions;
  events: string[];
  crisisResponse?: string;
  results: DayResult;
}

export interface VisibleState {
  cash: number;
  trust: number;
  weather: Weather;
  fridgeUsedPct: number;
  expiryRisk: 'low' | 'medium' | 'high';
  day: number;
  maxDays: number;
}

export interface SerializedProductInventory {
  productId: ProductId;
  buckets: StockBucket[];
  totalStock: number;
  discountPct: number;
}

export interface SerializedGameState {
  day: number;
  cash: number;
  trust: number;
  weather: Weather;
  inventory: SerializedProductInventory[];
  customers: CustomerProfile[];
  history: DayLog[];
  currentActions: PlayerActions;
}

export interface RunObservation {
  runId: string;
  playerType: 'human' | 'ai';
  player?: PlayerProfile;
  runName?: string;
  state: SerializedGameState;
  visibleState: VisibleState;
  done: boolean;
  activeMarketing: MarketingCampaignInstance[];
  availableMarketing: MarketingCampaignSpec[];
  scores: {
    total: number;
    lastDay: number;
  };
}

export interface StepRunResponse {
  runId: string;
  observation: RunObservation;
  log?: DayLog;
  result?: DayResult;
}

export interface PlayerProfile {
  id: string;
  displayName: string;
  kind: 'human' | 'ai' | 'system';
  createdAt: string;
}

export interface PlayerRunSummary {
  id: string;
  runName?: string;
  playerType: 'human' | 'ai';
  status: string;
  currentDay: number;
  totalScore: number;
  createdAt: string;
  updatedAt: string;
}

export interface PlayerSessionResponse {
  authenticated: boolean;
  player?: PlayerProfile;
  runs: PlayerRunSummary[];
}

export interface LLMDayContext {
  source: 'llm';
  model?: string;
  dayTheme: string;
  planningFocus: string;
  localNarrative: string;
  neighborhoodSignals: string[];
  customerMoodSignals: string[];
  marketSignals: string[];
  visualCues: string[];
  riskNotes: string[];
}

export interface ShopVisualState {
  customersInQueue: number;
  customerMood: 'happy' | 'neutral' | 'angry';
  truckPresent: boolean;
  truckDelay: number;
  complaintBubbles: string[];
  wasteBinItems: number;
  shelfFillPct: Record<ProductId, number>;
  fridgeFillPct: Record<ProductId, number>;
}

export interface GameConfig {
  maxDays: number;
  startingCash: number;
  startingTrust: number;
  defaultCashReserve: number;
  cashCrisisThreshold: number;
  fridgeCapacity: number;
  shelfCapacity: number;
  shopSize: number;
  tutorialDays: number;
}
