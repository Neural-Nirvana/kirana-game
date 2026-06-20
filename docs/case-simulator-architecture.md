# AI Nagar: Kirana Street - Case Simulator Architecture

> Historical architecture note.
>
> This remains useful for design intent. For current implementation details, use [Architecture](architecture.md), [Game Systems](game-systems.md), and [API Reference](api-reference.md).

## Core Game Loop

The game is a daily kirana case simulator.

1. The simulator opens the shop for the day.
2. Customers arrive with item demands.
3. The store tries to fulfill those demands from current inventory.
4. Each visit records fulfillment, missed demand, and payment mode.
5. Inventory movement is recorded from opening balance to closing balance.
6. The player reviews the case report.
7. The player chooses tomorrow's operational actions.
8. The next day tests whether those actions improved the shop.

The player should never feel they are guessing against an invisible model. The game should show what happened, why it happened, and what action levers are available next.

## Case Report Tables

### Customer Demand Ledger

Each row represents a customer demand group.

| Field | Meaning |
| --- | --- |
| Customer | Named regular, segment, and visit wave |
| Asked for | Product list |
| Qty | Requested quantities |
| Got it? | Full, partial, or missed fulfillment |
| Payment | Paid instantly, khata, or no sale |

### Inventory Movement

Each row represents one playable inventory item.

| Field | Meaning |
| --- | --- |
| Inventory | Product name and offer status |
| Opening | Stock at start of the day |
| Ordered | Stock added from yesterday's action plan |
| Removed | Stock removed before opening |
| Available | Opening + ordered - removed |
| Goods sold | Units fulfilled |
| Closing | End-of-day stock after sales and waste |
| Missed | Demand that could not be served |

## Player Action Levers

The action panel should stay operational, not decorative.

| Lever | Player Decision | Simulation Effect |
| --- | --- | --- |
| Order stock | Add units for tomorrow | Costs cash, raises available inventory |
| Remove stock | Pull stock from shop | Reduces expiry/overcrowding risk, costs inventory value |
| Put offer | Discount product | Increases ability to move stock, lowers margin |
| Khata reminder | Notify customers with dues | Collects cash, may hurt trust if overused |

Future levers can include stock reservation for regular customers, supplier choice, emergency buying, and category expansion.

## Points And Rewards

Daily score should measure shopkeeper competence. It is not an arcade counter.

### Score Buckets

| Bucket | Rewarded Behavior |
| --- | --- |
| Service | Fulfilling customer demand, especially named regulars |
| Inventory | Healthy closing stock, low missed demand, low waste |
| Money | Profit, cash discipline, khata collection |
| Relationships | Customer trust, repeat visits, responsible reminders |
| Operations | Corrective actions: ordering, offers, removals, reminders |
| Penalties | Stockouts, waste, excessive khata, avoidable removals |

The daily score is the sum of these buckets.

Example:

```text
Service        +28
Inventory      +14
Money          +18
Relationships  +11
Operations      +8
Penalties       -9
Total           70
```

### Reward Unlocks

Rewards should unlock operational power, not just badges.

| Unlock | Trigger Direction | Future Effect |
| --- | --- | --- |
| Better supplier terms | Strong cash and score streak | Larger order limits or lower costs |
| Extra fridge shelf | High trust and cash | More cold storage capacity |
| Reserve for regulars | Good relationship score | Protects named customers from stockouts |
| Better khata discipline | Strong collections | Higher collection rate |
| Demand note | Repeated low stockouts | Better next-day signal |
| New product category | Stable operations | More playable items and higher difficulty |

Unlocks can initially be informational, then become real mechanics as the simulation grows.

## Difficulty Progression

Difficulty should rise naturally as the shop grows, not from a separate menu.

| Period | Focus | New Pressure |
| --- | --- | --- |
| Days 1-7 | Basic fulfillment | Understand demand, inventory, stockouts |
| Days 8-14 | Khata and perishables | More credit, more waste pressure |
| Days 15-21 | Events and suppliers | Heat, rain, festival, demand shocks |
| Days 22-30 | Scaling | More demand, tighter cash, more customer memory |

Increasing items is useful, but it should happen by category and only when the player has learned the current systems.

Future item expansion order:

1. Current essentials: milk, bread, eggs, Maggi, chips, cold drinks, bananas.
2. Staples: rice, atta, dal, oil, sugar, salt.
3. Home care: soap, detergent, toothpaste, shampoo.
4. Event/ritual goods: agarbatti, matchbox, festival snack bundles.

## Modular Code Architecture

The simulator is split by responsibility.

```text
GameController
  owns screen flow and day advancement

DaySimulator
  orchestrates one day only

DifficultyEngine
  returns day/week difficulty profile and reward unlock metadata

EventGenerator
  generates weather/event pressure for the day

InventoryLedger
  records opening, ordered, removed, wasted, sold, closing, missed

CustomerDemandPlanner
  creates named customer and walk-in demand cases

VisitProcessor
  fulfills visits against inventory, records payment and customer memory

KhataManager
  applies reminder actions and collections

ScoringEngine
  calculates daily point buckets and total score
```

The UI should consume `DayResult` as a stable report object. It should not recreate simulation facts by inspecting game state.

## Data Flow

```text
PlayerActions from previous report
        |
        v
DaySimulator.simulateDay
        |
        +-- DifficultyEngine
        +-- EventGenerator
        +-- InventoryLedger
        +-- CustomerDemandPlanner
        +-- VisitProcessor
        +-- KhataManager
        +-- ScoringEngine
        |
        v
DayResult
        |
        v
UIManager.showCaseScreen
```

## Design Guardrails

- Show daily facts before asking for decisions.
- Keep tables compact and readable.
- Use the shelf background as atmosphere, not the main information surface.
- Make every action visibly affect a later report row.
- Keep scoring explainable by buckets.
- Add complexity by week, not all at once.
