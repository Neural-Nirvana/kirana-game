import type {
  CustomerBehaviorProfile,
  CustomerOrderLine,
  CustomerProfile,
  CustomerSegment,
  CustomerWave,
  ProductId,
  Weather,
} from '../../types';

export interface CustomerGroupProfile {
  id: string;
  label: string;
  segment: CustomerSegment;
  defaultWave: CustomerWave;
  baseCadence: number;
  baseTrust: number;
  substitutionTolerance: number;
  priceSensitivity: number;
  baseBasket: CustomerOrderLine[];
  weatherAffinity: Partial<Record<Weather, number>>;
  eventAffinity: Partial<Record<string, number>>;
  behavior: Omit<CustomerBehaviorProfile, 'groupId' | 'persona' | 'loyaltyTier' | 'acquisitionSource'>;
  names: string[];
}

interface SeedCustomerSpec {
  id: string;
  name: string;
  groupId: string;
  persona: string;
  loyaltyTier: CustomerBehaviorProfile['loyaltyTier'];
  preferredWave?: CustomerWave;
  cadence?: number;
  visitOffset?: number;
  visitPattern: string;
  usualBasket?: CustomerOrderLine[];
  substitutionTolerance?: number;
  priceSensitivity?: number;
  trust?: number;
}

export const CUSTOMER_GROUPS: CustomerGroupProfile[] = [
  {
    id: 'morning_households',
    label: 'Morning Households',
    segment: 'regular',
    defaultWave: 'morning',
    baseCadence: 1,
    baseTrust: 78,
    substitutionTolerance: 28,
    priceSensitivity: 38,
    baseBasket: [
      { productId: 'milk', quantity: 2 },
      { productId: 'bread', quantity: 1 },
    ],
    weatherAffinity: { rainy: 0.92, hot: 1.02, very_hot: 1.04 },
    eventAffinity: { school_reopening: 1.12, festival_weekend: 1.05 },
    behavior: {
      patience: 72,
      promotionAffinity: 34,
      environmentSensitivity: 45,
      relationshipSensitivity: 78,
      khataReliability: 72,
      basketFlexibility: 35,
    },
    names: ['Mrs. Sharma', 'Gupta Aunty', 'Verma Family', 'Morning Regular'],
  },
  {
    id: 'family_pantries',
    label: 'Family Pantries',
    segment: 'family',
    defaultWave: 'morning',
    baseCadence: 2,
    baseTrust: 74,
    substitutionTolerance: 36,
    priceSensitivity: 48,
    baseBasket: [
      { productId: 'milk', quantity: 3 },
      { productId: 'bread', quantity: 2 },
      { productId: 'eggs', quantity: 6 },
      { productId: 'bananas', quantity: 1 },
    ],
    weatherAffinity: { rainy: 0.96, hot: 1.04, very_hot: 1.08 },
    eventAffinity: { festival_weekend: 1.22, school_reopening: 1.12 },
    behavior: {
      patience: 66,
      promotionAffinity: 50,
      environmentSensitivity: 55,
      relationshipSensitivity: 70,
      khataReliability: 62,
      basketFlexibility: 48,
    },
    names: ['Patel Family', 'Agarwal Family', 'Apartment Household', 'Breakfast Family'],
  },
  {
    id: 'tea_stalls_bulk',
    label: 'Tea Stalls and Bulk Buyers',
    segment: 'bulk',
    defaultWave: 'morning',
    baseCadence: 3,
    baseTrust: 68,
    substitutionTolerance: 18,
    priceSensitivity: 58,
    baseBasket: [
      { productId: 'milk', quantity: 8 },
      { productId: 'bread', quantity: 3 },
    ],
    weatherAffinity: { rainy: 1.04, hot: 1.02, very_hot: 1.04 },
    eventAffinity: { festival_weekend: 1.08 },
    behavior: {
      patience: 46,
      promotionAffinity: 30,
      environmentSensitivity: 38,
      relationshipSensitivity: 58,
      khataReliability: 48,
      basketFlexibility: 18,
    },
    names: ['Cafe Uncle', 'Tea Stall Uncle', 'Tiffin Counter', 'Breakfast Vendor'],
  },
  {
    id: 'school_students',
    label: 'School Students',
    segment: 'student',
    defaultWave: 'afternoon',
    baseCadence: 1,
    baseTrust: 70,
    substitutionTolerance: 74,
    priceSensitivity: 78,
    baseBasket: [
      { productId: 'chips', quantity: 3 },
      { productId: 'cold_drinks', quantity: 2 },
      { productId: 'maggi', quantity: 2 },
    ],
    weatherAffinity: { rainy: 0.88, hot: 1.14, very_hot: 1.24 },
    eventAffinity: { school_reopening: 1.32, festival_weekend: 1.12 },
    behavior: {
      patience: 54,
      promotionAffinity: 86,
      environmentSensitivity: 78,
      relationshipSensitivity: 40,
      khataReliability: 88,
      basketFlexibility: 82,
    },
    names: ['Ravi School Group', 'After School Kids', 'Tuition Students', 'School Snack Group'],
  },
  {
    id: 'office_pantries',
    label: 'Office Pantries',
    segment: 'office',
    defaultWave: 'afternoon',
    baseCadence: 2,
    baseTrust: 70,
    substitutionTolerance: 28,
    priceSensitivity: 42,
    baseBasket: [
      { productId: 'milk', quantity: 4 },
      { productId: 'bread', quantity: 2 },
      { productId: 'cold_drinks', quantity: 3 },
    ],
    weatherAffinity: { rainy: 0.94, hot: 1.08, very_hot: 1.16 },
    eventAffinity: { heat_wave: 1.16 },
    behavior: {
      patience: 58,
      promotionAffinity: 45,
      environmentSensitivity: 58,
      relationshipSensitivity: 62,
      khataReliability: 54,
      basketFlexibility: 30,
    },
    names: ['Office Pantry', 'Clinic Staff', 'Coaching Office', 'Nearby Office'],
  },
  {
    id: 'hostel_snackers',
    label: 'Hostel and Snack Crowd',
    segment: 'snack',
    defaultWave: 'evening',
    baseCadence: 1,
    baseTrust: 72,
    substitutionTolerance: 64,
    priceSensitivity: 58,
    baseBasket: [
      { productId: 'maggi', quantity: 5 },
      { productId: 'eggs', quantity: 6 },
      { productId: 'cold_drinks', quantity: 2 },
    ],
    weatherAffinity: { rainy: 1.08, hot: 1.1, very_hot: 1.18 },
    eventAffinity: { festival_weekend: 1.2, school_reopening: 1.08 },
    behavior: {
      patience: 50,
      promotionAffinity: 72,
      environmentSensitivity: 68,
      relationshipSensitivity: 42,
      khataReliability: 70,
      basketFlexibility: 68,
    },
    names: ['Hostel Boys', 'PG Students', 'Evening Snackers', 'Roommates Group'],
  },
  {
    id: 'evening_regulars',
    label: 'Evening Regulars',
    segment: 'regular',
    defaultWave: 'evening',
    baseCadence: 2,
    baseTrust: 78,
    substitutionTolerance: 45,
    priceSensitivity: 36,
    baseBasket: [
      { productId: 'bananas', quantity: 2 },
      { productId: 'milk', quantity: 1 },
    ],
    weatherAffinity: { rainy: 0.9, hot: 1.04, very_hot: 1.08 },
    eventAffinity: { festival_weekend: 1.06 },
    behavior: {
      patience: 70,
      promotionAffinity: 38,
      environmentSensitivity: 46,
      relationshipSensitivity: 76,
      khataReliability: 74,
      basketFlexibility: 46,
    },
    names: ['Evening Walkers', 'Park Regulars', 'Retired Couple', 'Evening Family'],
  },
  {
    id: 'occasion_snacks',
    label: 'Occasion Snack Buyers',
    segment: 'snack',
    defaultWave: 'evening',
    baseCadence: 5,
    baseTrust: 64,
    substitutionTolerance: 52,
    priceSensitivity: 52,
    baseBasket: [
      { productId: 'chips', quantity: 6 },
      { productId: 'cold_drinks', quantity: 4 },
    ],
    weatherAffinity: { rainy: 0.9, hot: 1.14, very_hot: 1.24 },
    eventAffinity: { festival_weekend: 1.42, school_reopening: 1.06 },
    behavior: {
      patience: 44,
      promotionAffinity: 68,
      environmentSensitivity: 74,
      relationshipSensitivity: 35,
      khataReliability: 82,
      basketFlexibility: 56,
    },
    names: ['Birthday Kids', 'Party Snack Buyers', 'Cricket Match Group', 'Weekend Snack Group'],
  },
];

const SEED_CUSTOMERS: SeedCustomerSpec[] = [
  {
    id: 'mrs_sharma',
    name: 'Mrs. Sharma',
    groupId: 'morning_households',
    persona: 'school-drop household regular',
    loyaltyTier: 'anchor',
    visitPattern: 'Every morning before school drop-off',
    trust: 82,
  },
  {
    id: 'patel_family',
    name: 'Patel Family',
    groupId: 'family_pantries',
    persona: 'alternate-day breakfast household',
    loyaltyTier: 'regular',
    visitPattern: 'Alternate mornings, larger breakfast basket',
    trust: 76,
  },
  {
    id: 'cafe_uncle',
    name: 'Cafe Uncle',
    groupId: 'tea_stalls_bulk',
    persona: 'bulk milk buyer',
    loyaltyTier: 'regular',
    visitOffset: 1,
    visitPattern: 'Bulk top-up when his tea stall runs low',
  },
  {
    id: 'school_group',
    name: 'Ravi School Group',
    groupId: 'school_students',
    persona: 'after-school snack group',
    loyaltyTier: 'casual',
    visitPattern: 'After school snack stop',
    trust: 72,
  },
  {
    id: 'office_pantry',
    name: 'Office Pantry',
    groupId: 'office_pantries',
    persona: 'team supplies buyer',
    loyaltyTier: 'regular',
    visitOffset: 1,
    visitPattern: 'Every other afternoon for team supplies',
  },
  {
    id: 'hostel_boys',
    name: 'Hostel Boys',
    groupId: 'hostel_snackers',
    persona: 'evening hostel top-up',
    loyaltyTier: 'casual',
    visitPattern: 'Evening Maggi and eggs run',
    trust: 74,
  },
  {
    id: 'evening_walkers',
    name: 'Evening Walkers',
    groupId: 'evening_regulars',
    persona: 'park-walk routine buyer',
    loyaltyTier: 'anchor',
    visitPattern: 'Light fruit and milk after the park',
    trust: 80,
  },
  {
    id: 'birthday_kids',
    name: 'Birthday Kids',
    groupId: 'occasion_snacks',
    persona: 'occasional party snack burst',
    loyaltyTier: 'new',
    visitOffset: 2,
    visitPattern: 'Occasional party snack burst',
    trust: 66,
  },
];

export function createDefaultCustomers(): CustomerProfile[] {
  return SEED_CUSTOMERS.map(createSeedCustomer);
}

export function getCustomerGroup(groupId: string | undefined): CustomerGroupProfile | undefined {
  return CUSTOMER_GROUPS.find((group) => group.id === groupId);
}

export function getCustomerGroupFor(customer: CustomerProfile): CustomerGroupProfile | undefined {
  return getCustomerGroup(customer.groupId);
}

export function createGeneratedCustomer(params: {
  groupId: string;
  day: number;
  index: number;
  trust: number;
  acquisitionSource: string;
}): CustomerProfile {
  const group = getCustomerGroup(params.groupId) ?? CUSTOMER_GROUPS[0];
  const name = group.names[params.index % group.names.length];
  const suffix = Math.max(1, Math.floor(params.index / group.names.length) + 1);
  const displayName = suffix > 1 ? `${name} ${suffix}` : name;
  const id = `gen_${params.day}_${params.index}_${group.id}`;
  const trust = clamp(Math.round(group.baseTrust * 0.55 + params.trust * 0.35 + 8), 42, 86);

  return buildCustomer({
    id,
    name: displayName,
    group,
    persona: `${group.label.toLowerCase()} acquired on Day ${params.day}`,
    loyaltyTier: 'new',
    visitPattern: `New ${group.label.toLowerCase()} lead from ${params.acquisitionSource}`,
    visitOffset: params.day % Math.max(1, group.baseCadence),
    trust,
    acquisitionSource: params.acquisitionSource,
  });
}

export function scoreGroupForAcquisition(params: {
  group: CustomerGroupProfile;
  trust: number;
  weather: Weather;
  events: string[];
  promotedProducts: ProductId[];
  promotedSegments: CustomerSegment[];
}): number {
  let score = 1;
  score *= params.group.weatherAffinity[params.weather] ?? 1;
  for (const event of params.events) {
    score *= params.group.eventAffinity[event] ?? 1;
  }
  if (params.promotedSegments.includes(params.group.segment)) score *= 1.35;
  if (params.promotedProducts.some((productId) => params.group.baseBasket.some((line) => line.productId === productId))) {
    score *= 1.18;
  }
  if (params.trust >= 75) score *= 1.2;
  if (params.trust < 45) score *= 0.55;
  return score;
}

function createSeedCustomer(spec: SeedCustomerSpec): CustomerProfile {
  const group = getCustomerGroup(spec.groupId);
  if (!group) throw new Error(`Unknown customer group: ${spec.groupId}`);
  return buildCustomer({
    id: spec.id,
    name: spec.name,
    group,
    persona: spec.persona,
    loyaltyTier: spec.loyaltyTier,
    preferredWave: spec.preferredWave,
    cadence: spec.cadence,
    visitOffset: spec.visitOffset,
    visitPattern: spec.visitPattern,
    usualBasket: spec.usualBasket,
    substitutionTolerance: spec.substitutionTolerance,
    priceSensitivity: spec.priceSensitivity,
    trust: spec.trust,
  });
}

function buildCustomer(params: {
  id: string;
  name: string;
  group: CustomerGroupProfile;
  persona: string;
  loyaltyTier: CustomerBehaviorProfile['loyaltyTier'];
  preferredWave?: CustomerWave;
  cadence?: number;
  visitOffset?: number;
  visitPattern: string;
  usualBasket?: CustomerOrderLine[];
  substitutionTolerance?: number;
  priceSensitivity?: number;
  trust?: number;
  acquisitionSource?: string;
}): CustomerProfile {
  return {
    id: params.id,
    name: params.name,
    segment: params.group.segment,
    groupId: params.group.id,
    persona: params.persona,
    preferredWave: params.preferredWave ?? params.group.defaultWave,
    cadence: params.cadence ?? params.group.baseCadence,
    visitOffset: params.visitOffset ?? 0,
    visitPattern: params.visitPattern,
    usualBasket: (params.usualBasket ?? params.group.baseBasket).map((line) => ({ ...line })),
    substitutionTolerance: params.substitutionTolerance ?? params.group.substitutionTolerance,
    priceSensitivity: params.priceSensitivity ?? params.group.priceSensitivity,
    trust: params.trust ?? params.group.baseTrust,
    visitCount: 0,
    successfulVisits: 0,
    failedVisits: 0,
    khataBalance: 0,
    remindersSent: 0,
    orderHistory: [],
    behavior: {
      ...params.group.behavior,
      groupId: params.group.id,
      persona: params.persona,
      loyaltyTier: params.loyaltyTier,
      acquisitionSource: params.acquisitionSource,
    },
  };
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
