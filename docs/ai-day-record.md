# AI Day Record

This document defines the day-level record needed to explain how an AI operates Shree Shyam Bhandar.

The record is designed for:

- AI Arena replay UI
- day-by-day model evaluation
- fast timelapse playback
- post-run analysis
- human-vs-AI comparison
- debugging invalid or weak AI decisions

## Core Idea

An AI run should not be shown only as a final score. Every day should be explainable as:

```text
previous day reality
  -> upcoming day signals and prediction
  -> AI action
  -> simulation result
  -> reward earned
  -> next state
```

In arena terms:

- 1 episode = 1 full 30-day game
- 1 step = 1 in-game day
- 1 action = the AI shopkeeper plan before that day opens
- 1 reward = the day score after the day is simulated

## The Player-Facing Story

The replay UI should answer five questions for every day.

### 1. What Happened Yesterday?

Show the previous day as the AI's memory.

Important fields:

- previous day number
- previous weather and environment context
- opening stock
- ordered stock
- sold stock
- missed demand
- closing stock
- waste
- customer visits
- partial or missed customer cases
- revenue
- profit
- khata added and collected
- trust change
- reward breakdown
- active marketing result

For Day 1, there is no previous trading day. Use the opening setup:

- starting cash
- starting trust
- empty inventory
- known customer base
- available marketing
- initial environment signals

### 2. What Does The AI Think Tomorrow Looks Like?

This is the upcoming planning environment. It must be based only on information visible before the day is simulated.

Important fields:

- planning day
- weekday and date
- weather forecast
- weekly weather view
- confidence and randomness band
- customer rhythm
- likely customer groups
- khata pressure
- recent missed demand
- stockout risk
- perishability risk
- active or scheduled marketing
- available campaigns
- cash pressure

This prediction is not hidden future demand. It is the AI-visible interpretation of signals.

Suggested `prediction` fields:

```json
{
  "planningDay": 7,
  "headline": "Hot Saturday may lift drinks and snacks",
  "confidence": "medium",
  "expectedFootfall": {
    "overall": "high",
    "segments": {
      "student": "medium",
      "snack": "high",
      "family": "medium",
      "regular": "normal",
      "walkin": "high"
    }
  },
  "itemDemandHypothesis": [
    {
      "productId": "cold_drinks",
      "direction": "up",
      "reason": "hot weekend signal plus recent sales"
    }
  ],
  "cashRisks": ["Large order may leave too little reserve"],
  "stockoutRisks": ["Milk and bread missed yesterday"],
  "wasteRisks": ["Bananas are perishable in heat"],
  "marketingHypothesis": "Chalkboard offer can lift snack walk-ins if stock is available",
  "assumptions": ["No hidden demand forecast used"]
}
```

### 3. What Action Did The AI Take?

The executable action is the only thing the simulator uses.

Rationale is for explanation only. If the rationale says "run marketing" but `marketingActions` is empty, the simulator does not run a campaign.

Important fields:

- model
- observation mode
- response mode
- reasoning mode
- observation hash
- validation feedback
- action JSON
- short rationale
- retry count
- fallback used or not
- latency
- error, if any

Current action shape:

```json
{
  "orders": {
    "milk": 20,
    "bread": 10
  },
  "removals": {},
  "discounts": {
    "bananas": 10
  },
  "khataReminders": ["mrs_sharma"],
  "marketingActions": [
    {
      "specId": "whatsapp_status",
      "targetProducts": ["milk", "bread", "eggs"]
    }
  ],
  "cashReserve": 600,
  "fridgeAllocation": {
    "milk": 60,
    "cold_drinks": 30,
    "buffer": 10
  }
}
```

### 4. What Actually Happened?

This is the simulated day result.

Important fields:

- actual weather
- customer visits
- requested items
- fulfilled items
- missed items
- payment mode
- khata amount
- revenue
- margin
- item movement
- perishable waste
- marketing performance
- trust breakdown
- closing cash
- closing trust
- closing stock

### 5. How Much Reward Was Earned?

Show both the total and why it happened.

Current reward buckets:

- service
- inventory
- money
- relationships
- marketing
- operations
- penalties
- total

The UI should show reward as a cause-and-effect panel:

```text
Service       +8   Most named customers served
Inventory     -4   Milk stockout and missed demand
Money         +6   Positive margin, cash preserved
Relationships -2   Trust fell after regular miss
Marketing     +3   Campaign demand served profitably
Operations    +1   Cash reserve maintained
Penalties     -5   Stockout and waste penalty
Total         +7
```

## Canonical AI Day Record Shape

Use this shape for replay, analysis, and export.

```json
{
  "schemaVersion": "ai-day-record.v1",
  "run": {
    "runId": "run-id",
    "playerType": "ai",
    "runName": "AI Arena - model-name",
    "episodeDay": 7,
    "maxDays": 30,
    "done": false
  },
  "model": {
    "provider": "openrouter",
    "model": "google/gemini-3.1-flash-lite",
    "profile": "balanced",
    "observationMode": "compact",
    "responseMode": "json_schema",
    "reasoning": "off",
    "temperature": 0.15,
    "maxTokens": 16000,
    "timeoutMs": 900000
  },
  "stateBefore": {},
  "previousDay": {},
  "upcomingEnvironment": {},
  "prediction": {},
  "decision": {},
  "actual": {},
  "reward": {},
  "stateAfter": {},
  "persistence": {}
}
```

## Section Details

### `run`

Use fields from `RunObservation` and arena metadata.

| Field | Meaning |
| --- | --- |
| `runId` | Backend run id. |
| `playerType` | `human` or `ai`. |
| `player` | Player profile when available. |
| `runName` | Human-readable run name. |
| `episodeDay` | Current decision day. |
| `maxDays` | Usually `30`. |
| `done` | Whether the run is complete. |
| `scoreTotalBefore` | Score before this day. |
| `scoreLastDay` | Last completed day score. |

### `model`

Use fields from the arena start request and stored AI decision.

| Field | Meaning |
| --- | --- |
| `model` | Model id, for example `z-ai/glm-5.2`. |
| `mode` | `llm` or `heuristic`. |
| `profile` | Evaluation profile, for example `balanced` or `max_capability`. |
| `observationMode` | `full` or `compact`. |
| `responseMode` | `json_schema`, `json_object`, or `text`. |
| `reasoning` | `off`, `medium`, `high`, or `xhigh`. |
| `temperature` | Sampling temperature. |
| `maxTokens` | Model output token limit. |
| `timeoutMs` | Per-call timeout. |

### `stateBefore`

This is the full `SerializedGameState` before the AI action is executed.

| Field | Meaning |
| --- | --- |
| `day` | Current planning day. |
| `cash` | Cash before ordering and simulation. |
| `trust` | Shop trust before simulation. |
| `weather` | Current stored weather. |
| `inventory` | Full product inventory state. |
| `customers` | Full customer memory state. |
| `history` | Completed day logs. |
| `currentActions` | Current draft action state. |

### `visibleStateBefore`

Use `VisibleState`.

| Field | Meaning |
| --- | --- |
| `cash` | Rounded visible cash. |
| `trust` | Rounded visible trust. |
| `weather` | Visible weather. |
| `fridgeUsedPct` | Fridge usage percentage. |
| `expiryRisk` | `low`, `medium`, or `high`. |
| `day` | Current day. |
| `maxDays` | Run length. |

### `previousDay`

Use the most recent `DayLog` from `stateBefore.history`.

| Field | Source |
| --- | --- |
| `day` | `DayLog.day` |
| `visibleStateBefore` | `DayLog.visibleStateBefore` |
| `playerActions` | `DayLog.playerActions` |
| `events` | `DayLog.events` |
| `crisisResponse` | `DayLog.crisisResponse` |
| `results` | `DayLog.results` |

Suggested UI summary:

```json
{
  "day": 6,
  "weather": "hot",
  "cashAfter": 3280,
  "trustAfter": 64,
  "reward": 11,
  "whatWorked": ["Cold drinks sold well", "No waste"],
  "whatFailed": ["Milk missed 8 L", "One regular partially served"],
  "customerExceptions": [],
  "itemExceptions": []
}
```

### `upcomingEnvironment`

Use the current arena observation and deterministic environment signals.

In full arena observation, the AI sees:

- `contract`
- `shop`
- `environment`
- `inventory`
- `customers`
- `marketing`
- `recentDays`
- `rewardRules`
- `actionRules`
- `actionExamples`
- `validationFeedback`

In compact arena observation, the AI sees:

- `contract`
- `shop`
- `signals`
- `inventory`
- `customers.khata`
- `customers.atRisk`
- `marketing.active`
- `marketing.available`
- `recentDays`
- `rules`
- `examples`
- `validationFeedback`

Recommended normalized fields:

| Field | Meaning |
| --- | --- |
| `planningDay` | Day being planned. |
| `calendar` | Weekday, date, month/week context. |
| `weatherToday` | Current or forecast weather visible to the AI. |
| `weekForecast` | Seven-day signal list. |
| `confidence` | Forecast confidence. |
| `randomnessPct` | Explicit uncertainty band. |
| `customerSignals` | Due customer groups and relationship risks. |
| `marketSignals` | Market pressure and category pressure. |
| `shopMemorySignals` | What the shop should remember from previous days. |
| `inventorySignals` | Stock, margin, perishability, recent movement. |
| `marketingSignals` | Active, scheduled, and available campaigns. |

### `prediction`

This is AI-authored or derived from the AI rationale. It is not hidden simulator truth.

Recommended fields:

| Field | Meaning |
| --- | --- |
| `headline` | One-line prediction. |
| `confidence` | AI confidence. |
| `expectedFootfall` | Expected customer pressure by segment. |
| `itemDemandHypothesis` | Product-level demand direction and reasons. |
| `cashRisks` | Cash concerns. |
| `stockoutRisks` | Items likely to stock out. |
| `wasteRisks` | Items likely to waste. |
| `trustRisks` | Relationship or service risks. |
| `marketingHypothesis` | Expected campaign effect. |
| `assumptions` | Explicit assumptions. |

### `decision`

Use `ArenaDayTrace`, stored `ai_decisions`, and the model response.

| Field | Source |
| --- | --- |
| `observationHash` | `ai_decisions.observation_hash` |
| `action` | `ArenaDayTrace.action` / `ai_decisions.action_json` |
| `rationale` | `ArenaDayTrace.rationale` / `ai_decisions.rationale` |
| `model` | `ArenaDayTrace.model` |
| `latencyMs` | `ArenaDayTrace.latencyMs` |
| `retryCount` | `ArenaDayTrace.retryCount` |
| `error` | `ArenaDayTrace.error` or stored decision error |
| `validationFeedback` | Arena validation messages shown before retry |
| `fallbackUsed` | `true` when fallback action was used after invalid response |

### `actual`

Use `DayResult`.

| Field | Meaning |
| --- | --- |
| `day` | Simulated day. |
| `profit` | Day profit after cost of goods, waste, removals, and marketing cost. |
| `wasteLoss` | Expired or wasted stock cost. |
| `removalLoss` | Cost of manually removed stock. |
| `khataAdded` | Credit extended today. |
| `khataCollected` | Cash collected from reminders. |
| `stockouts` | Count of products with missed demand. |
| `trustChange` | Net trust movement. |
| `trustBreakdown` | Causal trust score details. |
| `trust` | Closing trust. |
| `cash` | Closing cash. |
| `productResults` | Product-level demand, sold, stockout, revenue, cost, margin. |
| `inventoryMovements` | Opening/order/sold/missed/closing/waste by item. |
| `customerVisits` | Every customer case. |
| `customerSummary` | Repeat customer summary. |
| `environmentContext` | Actual environment multipliers used by the simulator. |
| `marketingPerformance` | Campaign result and marketing score. |
| `difficulty` | Difficulty profile for this day. |
| `unlockedRewards` | Rewards available/unlocked after scoring. |
| `rewardBreakdown` | Day score by bucket. |

### `reward`

Use `DayResult.rewardBreakdown` plus selected explanatory fields.

Recommended shape:

```json
{
  "total": 7,
  "buckets": {
    "service": 8,
    "inventory": -4,
    "money": 6,
    "relationships": -2,
    "marketing": 3,
    "operations": 1,
    "penalties": -5
  },
  "causes": [
    "Cold drinks served profitably",
    "Milk stockout hurt service",
    "Marketing had positive ROI"
  ],
  "cumulativeScore": 124
}
```

### `stateAfter`

Use the next `RunObservation.state` after stepping the day.

This is the source of truth for:

- next planning day
- closing cash
- closing trust
- updated inventory
- updated customer trust and khata
- updated history
- active and scheduled marketing
- cumulative score
- `done`

### `persistence`

Map the day record to current SQLite tables.

| Table | Contains |
| --- | --- |
| `game_runs` | Current run state JSON, status, day, score. |
| `day_results` | Full `DayLog` and `DayResult` for each day. |
| `inventory_snapshots` | Item movement rows for replay and analysis. |
| `customer_visits` | Each customer case. |
| `customer_state` | Customer memory snapshot by day. |
| `player_actions` | Action JSON executed for the day. |
| `marketing_campaigns` | Campaign schedule and actual result JSON. |
| `ai_players` | AI identity, model, and profile. |
| `ai_decisions` | Observation hash, action, rationale, model, latency, error. |
| `ai_memory_summaries` | Compact memory summaries. |
| `run_events` | Replay-friendly event stream. |

## Complete State Variable Dictionary

This section lists all current state variables that should be inspectable in an advanced replay/debug UI.

### Product Identity: `ProductSpec`

- `id`
- `name`
- `category`
- `storage`
- `baseDemand`
- `demandVariance`
- `shelfLife`
- `unit`
- `margin`
- `costPrice`
- `sellPrice`
- `trustImpact`
- `storageUnits`
- `orderIncrement`
- `perishabilityFactor`

### Inventory State: `ProductInventory`

- `productId`
- `buckets`
- `totalStock`
- `discountPct`

### Stock Bucket: `StockBucket`

- `quantity`
- `dayAdded`

### Environment State: `EnvironmentContext`

- `day`
- `weather`
- `confidence`
- `randomnessPct`
- `segmentVisitMultipliers`
- `productDemandMultipliers`
- `signals`

### Player Action: `PlayerActions`

- `orders`
- `removals`
- `discounts`
- `khataReminders`
- `marketingActions`
- `cashReserve`
- `fridgeAllocation.milk`
- `fridgeAllocation.cold_drinks`
- `fridgeAllocation.buffer`

### Marketing Action Selection

- `specId`
- `targetProducts`

### Marketing Campaign Spec

- `id`
- `name`
- `channel`
- `targetSegments`
- `targetProducts`
- `cost`
- `delayDays`
- `durationDays`
- `unlockDay`
- `expectedReturn`
- `riskNotes`

### Marketing Campaign Instance

- `id`
- `runId`
- `specId`
- `targetProducts`
- `plannedDay`
- `effectStartDay`
- `effectEndDay`
- `status`
- `cost`
- `actualResult.incrementalVisits`
- `actualResult.incrementalRevenue`
- `actualResult.servedTargetUnits`
- `actualResult.missedUnits`
- `actualResult.targetGrossMargin`
- `actualResult.roi`
- `actualResult.score`
- `actualResult.promotedStockoutSkus`

### Marketing Effect

- `campaignId`
- `specId`
- `segments`
- `products`
- `demandMultiplier`
- `visitMultiplier`
- `campaignCost`
- `allocatedDailyCost`

### Customer Behavior Profile

- `groupId`
- `persona`
- `loyaltyTier`
- `patience`
- `promotionAffinity`
- `environmentSensitivity`
- `relationshipSensitivity`
- `khataReliability`
- `basketFlexibility`
- `acquisitionSource`

### Customer Profile

- `id`
- `name`
- `segment`
- `groupId`
- `persona`
- `behavior`
- `preferredWave`
- `cadence`
- `visitOffset`
- `visitPattern`
- `usualBasket`
- `substitutionTolerance`
- `priceSensitivity`
- `trust`
- `visitCount`
- `successfulVisits`
- `failedVisits`
- `khataBalance`
- `remindersSent`
- `orderHistory`
- `lastVisitDay`

### Customer Visit Record

- `day`
- `requested`
- `fulfilled`
- `missed`
- `outcome`
- `spend`
- `paymentMode`
- `khataAmount`

### Customer Visit Result

- `customerId`
- `customerName`
- `segment`
- `wave`
- `requested`
- `fulfilled`
- `missed`
- `revenue`
- `costOfGoods`
- `margin`
- `paymentMode`
- `amountPaid`
- `khataAmount`
- `trustDelta`
- `outcome`
- `note`
- `visitReasons`
- `demandReasons`
- `visitProbability`

### Product Simulation Result

- `productId`
- `demand`
- `sold`
- `stockout`
- `revenue`
- `costOfGoods`
- `margin`

### Inventory Movement

- `productId`
- `opening`
- `openingShelf`
- `ordered`
- `removed`
- `available`
- `sold`
- `wasted`
- `closing`
- `missedDemand`
- `offerPct`
- `perishability`

### Perishability Snapshot

- `productId`
- `tracked`
- `factor`
- `freshUnits`
- `agingUnits`
- `atRiskUnits`
- `expiredUnits`
- `riskUnits`
- `wasteRiskCost`
- `averageFreshness`
- `status`
- `statusLabel`
- `nextExpiryDay`

### Customer Memory Summary

- `activeCustomers`
- `repeatCustomers`
- `successfulVisits`
- `failedVisits`
- `atRiskCustomers`
- `topCustomerName`
- `topCustomerVisits`

### Marketing Performance

- `activeCampaigns`
- `spendToday`
- `allocatedActiveCost`
- `targetVisits`
- `servedTargetUnits`
- `missedTargetUnits`
- `targetGrossMargin`
- `roi`
- `promotedStockoutSkus`
- `score`

### Trust Breakdown

- `stockoutPenalty`
- `essentialServiceBonus`
- `namedCustomerEffect`
- `noStockoutBonus`
- `total`
- `notes`

### Day Result

- `day`
- `profit`
- `wasteLoss`
- `removalLoss`
- `khataAdded`
- `khataCollected`
- `stockouts`
- `trustChange`
- `trustBreakdown`
- `trust`
- `cash`
- `productResults`
- `inventoryMovements`
- `customerVisits`
- `customerSummary`
- `environmentContext`
- `marketingPerformance`
- `difficulty`
- `unlockedRewards`
- `rewardBreakdown`

### Reward Breakdown

- `service`
- `inventory`
- `money`
- `relationships`
- `marketing`
- `operations`
- `penalties`
- `total`

### Difficulty Profile

- `day`
- `week`
- `label`
- `focus`
- `demandMultiplier`
- `khataPressure`
- `eventPressure`
- `activeItemSlots`
- `unlockedSystems`

### Shop Reward

- `id`
- `title`
- `description`
- `type`
- `unlocked`

### Day Log

- `day`
- `visibleStateBefore`
- `playerActions`
- `events`
- `crisisResponse`
- `results`

### Visible State

- `cash`
- `trust`
- `weather`
- `fridgeUsedPct`
- `expiryRisk`
- `day`
- `maxDays`

### Serialized Game State

- `day`
- `cash`
- `trust`
- `weather`
- `inventory`
- `customers`
- `history`
- `currentActions`

### Run Observation

- `runId`
- `playerType`
- `player`
- `runName`
- `state`
- `visibleState`
- `done`
- `activeMarketing`
- `availableMarketing`
- `scores.total`
- `scores.lastDay`

### Arena Day Trace

- `day`
- `reward`
- `cash`
- `trust`
- `scoreTotal`
- `action`
- `rationale`
- `model`
- `latencyMs`
- `retryCount`
- `error`

## Replay UI Layout

A good AI day replay screen should read top-to-bottom:

1. **Run HUD**: model, day, score, cash, trust, status.
2. **Yesterday**: what happened, what failed, what the AI should remember.
3. **Prediction**: what the AI thinks today will look like.
4. **Action**: executable orders, discounts, marketing, khata reminders.
5. **Timelapse**: customers, sales, misses, khata, stockouts, waste.
6. **Reward**: bucket score and causes.
7. **State Inspector**: full JSON state before and after.

For normal viewers, keep the state inspector collapsed. For debugging and benchmark analysis, it should expose every variable listed above.

## Important UX Rule

Always separate:

- **AI-visible prediction**: what the model inferred before the day.
- **Actual simulator result**: what happened after randomness, customers, inventory, and marketing effects resolved.

This keeps the game fair and makes model mistakes understandable.
