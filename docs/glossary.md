# Glossary

## Gameplay

**Cash**  
Money immediately available for ordering stock or marketing.

**Closing Stock**  
Inventory left after sales and waste at the end of a day.

**Customer Demand Ledger**  
The report table showing who visited, what they asked for, what they received, and how they paid.

**Environment Signals**  
Visible clues such as day, weather, weekend distance, customer rhythm, market pressure, and shop memory.

**Khata**  
Credit ledger. A customer gets goods now but pays later.

**Marketing Campaign**  
A paid action that creates demand pressure for selected products and customer segments.

**Missed Demand**  
Customer-requested units that could not be served because stock was unavailable.

**Opening Shelf**  
Stock available when customers start arriving, after planned orders and removals are applied.

**Perishability**  
How quickly an item ages and creates waste risk.

**Run**  
One 30-day game attempt.

**Stockout**  
An item reaches zero while customers still want it.

**Trust**  
Customer confidence. Missed essentials hurt trust more than missed snacks.

**Waste**  
Expired or unusable stock that creates loss.

## Rewards

**Service Score**  
Reward for serving customer demand, especially named customers.

**Inventory Score**  
Reward for avoiding stockouts, waste, unhealthy closing stock, and perishable risk.

**Money Score**  
Reward for profit, cash buffer, and khata collection.

**Relationship Score**  
Reward for protecting named customers and trust.

**Marketing Score**  
Reward for campaigns that create demand the shop can serve profitably.

**Operations Score**  
Reward for using useful action levers such as ordering, offers, reminders, and removals.

**Penalties**  
Negative score from stockouts, missed units, waste, khata pressure, removals, and no-action failure.

## Technical

**AI Replay**  
A backend-run benchmark where an AI or heuristic agent plays a full run.

**DayResult**  
The canonical report object for a simulated day.

**GameState**  
The serialized state of a run: day, cash, trust, inventory, customers, history, and current actions.

**OpenEnv**  
An API-compatible reset/step/state interface for agent experiments.

**Player Session**  
The server-side login session created from a player name and represented by an `HttpOnly` cookie.

**RunObservation**  
The API response containing the current run state, visible state, marketing info, done flag, and score summary.

**SQLite WAL**  
Write-ahead logging mode used by the local SQLite DB for safer concurrent reads/writes.

**Wholesaler Cart**  
The saved item-level order/removal/offer plan before opening the next day.

