# Game Systems

This document explains how the main simulation systems fit together.

## Starting Conditions

| Setting | Value |
| --- | ---: |
| Run length | 30 days |
| Starting cash | ₹3,000 |
| Starting trust | 70% |
| Default cash reserve | ₹600 |
| Fridge capacity | 100 units |
| Shelf capacity | 200 units |
| Shop size | 300 sq ft |

## Products

The first playable version uses seven SKUs.

| Item | Base Demand | Variance | Order Increment | Trust Impact | Perishability |
| --- | ---: | ---: | ---: | --- | ---: |
| Milk | 36 | 8 | 5 | High | 1.00 |
| Bread | 18 | 4 | 5 | High | 0.78 |
| Eggs | 12 | 3 | 12 | Medium | 0.35 |
| Maggi | 20 | 5 | 10 | Low | 0.00 |
| Chips | 15 | 5 | 10 | Low | 0.00 |
| Cold Drinks | 12 | 4 | 6 | Medium | 0.05 |
| Bananas | 5 | 2 | 1 | Low | 0.95 |

Base demand is not a promise. The actual day is affected by environment, customers, marketing, discounts, and seeded randomness.

## Environment Signals

Environment signals help the player reason about the future.

Current signals include:

- weekday and date
- month phase
- weekend distance
- weather and temperature
- week-level forecast confidence
- known customer rhythm
- recent missed demand
- khata pressure
- category pressure
- perishable exposure
- difficulty focus

Special day windows:

| Period | Meaning |
| --- | --- |
| Days 1-3 | Opening week. Learn normal rhythm. |
| Days 4-6 | School reopening pressure. Students and family routines matter. |
| Day 7 | Supplier delay risk. |
| Days 12-14 | Festival pressure. Family and snack demand can spike. |
| Days 18-24 | Heat-wave stretch. Fridge and perishables matter more. |
| Day 25 onward | Month-end cash and khata discipline matter more. |

## Demand And Visits

The day simulator does not simply roll random total demand. It builds customer visits, then fulfills baskets against inventory.

High-level flow:

```text
Environment context
  -> customer visit planning
  -> requested baskets
  -> inventory fulfillment
  -> payment mode
  -> trust and memory updates
```

Each customer visit can record:

- customer name
- segment
- visit wave
- requested items
- fulfilled items
- missed items
- payment mode
- khata amount
- trust delta
- visit reasons
- demand reasons
- visit probability

## Customer Groups And Personas

Named customers are created from customer group profiles, not hand-written as isolated one-off rows.

Each group defines:

- segment and default visit wave
- base cadence and starting trust
- usual basket
- price sensitivity and substitution tolerance
- weather and event affinity
- behavior profile: patience, promotion affinity, environment sensitivity, relationship sensitivity, khata reliability, and basket flexibility

Seed customers such as Mrs. Sharma, Patel Family, Cafe Uncle, School Group, Office Pantry, Hostel Boys, Evening Walkers, and Birthday Kids are generated from these group profiles with individual personas and loyalty tiers.

The simulation can also acquire new named customers over time. Acquisition is affected by:

- shop trust
- active marketing
- promoted segments and products
- weather and event pressure
- existing customer count

This means good service and well-timed marketing can grow the repeat-customer base, while low trust makes new customer acquisition harder.

Customer behavior uses these profiles during simulation:

- patient customers tolerate misses longer before churning
- promotion-sensitive customers react more to discounts and campaigns
- environment-sensitive groups react more strongly to rain, heat, school, festival, and similar signals
- relationship-sensitive customers respond better to loyalty and recovery actions
- reliable khata customers repay more when reminded
- flexible baskets shift more when trust is low or offers are active

## Inventory Ledger

Each product is tracked through a day as:

```text
opening stock
+ ordered stock
- removed stock
= available stock
- sold stock
- wasted stock
= closing stock
```

The report distinguishes:

- stock before supplier order
- opening shelf stock when customers arrive
- ordered units
- sold units
- missed demand
- closing stock
- waste

This matters because the player needs to see whether a problem came from too little opening stock, too little ordering, or unexpectedly high demand.

## Perishability

Perishable items use age buckets. Stock is fulfilled using FIFO logic, and older stock can become riskier.

Perishability tracks:

- fresh units
- aging units
- at-risk units
- expired units
- risk units
- risk cost
- average freshness
- next expiry day

High perishability items:

- milk
- bananas
- bread

Stable items:

- Maggi
- chips
- cold drinks

## Khata

Some customer purchases can be written to khata. Khata increases relationship realism but delays usable cash.

Khata affects:

- cash available for ordering
- money score
- customer relationship memory
- reminder actions

The player can send khata reminders. Reminders can help collections, but should not be treated as free money forever.

## Trust

Shop trust is a reputation meter, not just a stockout counter.

Daily trust now comes from four drivers:

- stockout reputation damage, scaled by missed quantity and product trust impact
- essential service bonus when high-trust essentials are fully served
- named customer experience, based on customer-level trust deltas
- no-stockout bonus when the store serves all demand that day

Small stockouts hurt less than large stockouts, but milk and bread still matter most. A shop can recover trust by consistently serving named customers, protecting essentials, and using relationship campaigns such as Loyalty Card or Recovery Call when customers are at risk.

The day result includes `trustBreakdown` so the dashboard, AI arena, and future explainability views can show why trust changed.

## Marketing

Marketing campaigns are strategic demand shapers.

| Campaign | Unlock | Cost | Delay | Duration | Target |
| --- | ---: | ---: | ---: | ---: | --- |
| Chalkboard Offer | Day 1 | ₹30 | 0 days | 1 day | Walk-ins, snacks |
| WhatsApp Status | Day 1 | ₹50 | 1 day | 2 days | Regulars, families |
| School Combo | Day 1 | ₹80 | 1 day | 2 days | Students, snacks |
| Apartment Pamphlets | Day 8 | ₹250 | 2 days | 3 days | Families, regulars |
| Festival Bundle Display | Day 12 | ₹180 | 0 days | 2 days | Families, walk-ins |
| Loyalty Card | Day 15 | ₹120 | 2 days | 5 days | Regulars, families, office |
| Recovery Call | Day 18 | ₹40 | 1 day | 2 days | Regulars, office, bulk |

Marketing effects:

- can increase visit pressure
- can increase target product demand
- use player-selected promoted SKUs when a campaign supports multiple eligible products
- costs cash immediately
- can generate positive score if demand is served
- can generate negative score if promoted items stock out

## Reward Scoring

Daily reward score is split into buckets.

| Bucket | Rewards | Punishes |
| --- | --- | --- |
| Service | Serving customer demand, especially named customers | missed named visits and stockouts |
| Inventory | low missed units, healthy closing stock, low waste | stockouts, overstocked perishables, risk cost |
| Money | operating profit, khata collection, cash buffer | khata added, low cash |
| Relationships | fulfilled named customers, trust gains | missed regulars, trust drops |
| Marketing | served promoted demand, ROI, no promoted stockouts | missed promoted demand, poor ROI |
| Operations | useful ordering, offers, reminders, removals | no direct penalty here |
| Penalties | separate negative pressure from stockouts, waste, khata, no-action days | avoidable operational failure |

Marketing score is calculated only from active campaign performance. Selecting a campaign does not create score by itself.

Marketing score range:

```text
-10 to +15
```

The relationships bucket also includes the daily shop-trust movement, so profitable play that damages long-term reputation is no longer treated as a clean win.

Total score:

```text
service + inventory + money + relationships + marketing + operations + penalties
```

## AI Day Context

The optional LLM layer generates compact context only.

It may explain:

- neighborhood mood
- customer mood
- market cues
- visual cues
- risks

It does not:

- control demand math
- decide sales
- alter inventory
- award score

If `OPENROUTER_API_KEY` is not configured or the request fails, the game continues using deterministic environment signals.
