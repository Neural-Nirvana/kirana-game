---
title: "Shree Shyam Bhandar: A Kirana Shop Simulation for Evaluating AI Business Operators"
tags:
  - ai-agents
  - reinforcement-learning
  - simulation
  - retail
  - india
  - openenv
  - game-ai
  - small-business
---

# Shree Shyam Bhandar: A Kirana Shop Simulation for Evaluating AI Business Operators

## Abstract

Shree Shyam Bhandar is a 30-day Indian kirana store simulation built to evaluate whether an AI can operate a small retail business with the same constraints a real shopkeeper faces: limited cash, uncertain demand, perishable stock, customer trust, informal credit, marketing pressure, and neighborhood-specific buying patterns.

The game is not a pure inventory spreadsheet and not a cosmetic game wrapper around a chatbot. It is a backend-owned business environment where one AI action JSON controls one simulated shop day. The backend then simulates customers, demand, fulfillment, payments, khata, marketing effects, trust movement, waste, and rewards. One episode is one complete 30-day run. One step is one shop day. One reward is the score earned after customers actually visit.

The long-term goal is bigger than a game. Kirana owners already make dozens of hard decisions every day with thin margins and incomplete information. Frontier AI and fine-tuned local models could become practical companions for these owners: not replacing the shopkeeper, but helping them read demand signals, protect cash, avoid stockouts, plan offers, manage khata, and learn from yesterday's sales.

## Why Kiranas Matter

Indian kirana stores are dense, relationship-led, neighborhood retail networks. A kirana is not only a place where goods are sold. It is often a local credit layer, a daily essentials buffer, a memory system for household preferences, a trusted emergency source, and a convenience point for people moving through a street.

India's retail market is enormous and still changing quickly. IBEF describes India as one of the world's largest retail markets and projects retail growth through the decade, with a continuing shift toward organized and digital retail while traditional stores remain central to daily commerce. Digital commerce infrastructure is also expanding through initiatives like ONDC, which aims to make digital commerce more open and accessible to sellers and buyers. UPI has made small payments easier and more common, and quick commerce has raised customer expectations around speed, availability, and price.

That creates a difficult operating world for a small shopkeeper:

- Customers expect milk, bread, snacks, cold drinks, eggs, and household essentials to be available at the exact moment they walk in.
- Weather, school schedules, festivals, weekends, salary dates, and local commute patterns can change demand within a day.
- Perishable items create a double bind: too little stock loses trust, too much stock becomes waste.
- Khata helps relationships, but unpaid credit reduces usable cash.
- Marketing can bring footfall, but a campaign without stock can damage reputation.
- Quick commerce and digital-first competitors make availability, speed, and targeted offers more important.

Shree Shyam Bhandar turns this operating reality into a measurable AI environment.

## The Game World

The simulated shop is Shree Shyam Bhandar, a small kirana on Nehru Colony School Road. The profile is fictional and fixed so every AI model faces the same environment.

The catchment includes:

| Place | Role In Demand |
| --- | --- |
| Shyam Residency | Residential families, morning and evening essentials, khata-sensitive regular demand |
| Gokul Apartments | Evening family top-ups and offer-sensitive household purchases |
| Bright Public School | Afternoon student snack bursts, Maggi, chips, cold drinks |
| Colony Chowk Bus Stop | Morning and evening commuter impulse demand |
| Stationery + Medical Lane | Walk-in add-ons from nearby errands |

The neighborhood has five broad demand segments:

| Segment | Typical Basket | Why It Matters |
| --- | --- | --- |
| Families | Milk, bread, eggs, bananas, household top-ups | High trust sensitivity; missed essentials hurt most |
| Students | Chips, Maggi, cold drinks | Promotion-sensitive and school-day dependent |
| Commuters | Bread, eggs, cold drinks, quick snacks | Evening impulse demand and weather-driven drinks |
| Known regulars | Habit-led essentials, khata purchases | Relationship-sensitive repeat customers |
| Road walk-ins | Snacks, drinks, bananas, small baskets | Affected strongly by rain, visible offers, and commute flow |

This fixed world context is visible to the model and to the viewer. That is important for fairness: the AI is not guessing from hidden world lore, and the human evaluator can see the same signals the model receives.

## The Core Game Loop

The human game and AI Arena share the same business logic:

```text
read signals
  -> inspect inventory
  -> choose shop actions
  -> simulate one day of customers
  -> score the result
  -> persist the state
  -> repeat until Day 30
```

For AI evaluation:

```text
observation JSON
  -> model returns action JSON
  -> backend validates action
  -> backend simulates the shop day
  -> reward + next observation
  -> repeat for 30 days
```

In arena terms:

| Term | Meaning |
| --- | --- |
| Episode | One full 30-day kirana game |
| Step | One in-game shop day |
| Action | One pre-day shopkeeper plan JSON |
| Reward | The day score after customers actually visit |
| Observation | The state and signals visible before the action |

The AI does not directly control customers. It controls the shop plan. The simulator then tests whether that plan survives the day.

## State Variables

The environment gives the AI enough information to reason, but not a hidden answer key. The model sees signals, recent history, and business constraints.

### Run State

| Variable | Meaning |
| --- | --- |
| day | Current planning day, from 1 to 30 |
| cash | Usable cash after previous results |
| trust | Shop reputation with customers |
| score | Cumulative reward |
| weather | Forecast and actual day pattern |
| event window | Routine, school pressure, supplier risk, festival, heat wave, month-end |
| recent history | Last day results and short trend memory |
| active campaigns | Marketing that is already running or scheduled |

### Inventory State

Each SKU carries:

- current stock
- opening stock
- ordered stock
- sold stock
- missed demand
- closing stock
- waste
- margin
- purchase cost
- selling price
- pack size
- shelf/fridge placement
- perishability
- age and expiry risk
- recent service rate

The initial playable SKU set is:

| SKU | Character |
| --- | --- |
| Milk | High trust impact, fully perishable, fridge pressure |
| Bread | High trust impact, perishable, morning essentials |
| Eggs | Medium trust impact, pack-size planning |
| Maggi | Stable, snack and student pressure |
| Chips | Stable, offer and impulse demand |
| Cold drinks | Heat-sensitive, fridge capacity pressure |
| Bananas | Highly perishable, low unit count, weather-sensitive |

### Customer And Khata State

The simulation tracks named customers and groups, not only aggregate demand. A customer visit can include:

- customer name
- segment
- visit wave
- requested basket
- fulfilled basket
- missed items
- payment mode
- khata amount
- trust delta
- visit reason
- demand reason
- visit probability

Khata is intentionally modeled as both relationship strength and cash delay. A good AI must understand that revenue written to khata is not the same as cash available for tomorrow's order.

## Actions Available To The AI

The model must return executable JSON. The rationale is only explanatory; the simulator executes the structured action.

```json
{
  "action": {
    "orders": {
      "milk": 20,
      "bread": 10
    },
    "removals": {
      "bananas": 2
    },
    "discounts": {
      "chips": 10
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
  },
  "rationale": "Short explanation of the plan."
}
```

The action tools are:

| Tool | What It Does | Good Use | Failure Mode |
| --- | --- | --- | --- |
| `orders` | Buys stock from the wholesaler | Restock essentials, correct missed demand, prepare for events | Overspending or overstocking perishables |
| `removals` | Removes or discards stock | Reduce expiry risk | Removing useful stock before demand arrives |
| `discounts` | Applies shelf offers on existing inventory | Move slow/perishable stock or promote impulse demand | Discounts without enough margin or stock |
| `khataReminders` | Requests repayment from selected customers | Recover cash gently from reliable customers | Relationship damage if overused or mistimed |
| `marketingActions` | Runs campaigns with target products | Pull the right segment when stock can serve demand | Promoted stockouts and wasted spend |
| `cashReserve` | Sets desired buffer after ordering | Keep correction power for tomorrow | Excessive reserve causing avoidable stockouts |
| `fridgeAllocation` | Communicates cold-storage planning | Balance milk and drinks | Ignoring fridge-constrained demand |

Invalid actions are rejected. LLM runs get one retry with validation feedback. If the retry fails, the backend uses a conservative fallback plan and records the failure.

## Marketing As A First-Class Decision

Marketing is not a decorative feature. It changes demand pressure and is scored separately.

Early campaigns include:

| Campaign | Target | Cost Logic | Timing |
| --- | --- | --- | --- |
| Chalkboard Offer | Walk-ins and snacks | Low cost | Same-day effect |
| WhatsApp Status | Regulars and families | Low cost | Tomorrow effect |
| School Combo | Students and snacks | Moderate cost | Next school-day effect |

Later campaigns include apartment pamphlets, festival bundle display, loyalty cards, and recovery calls.

The key design choice is that marketing is only rewarded when it creates demand the shop can actually serve. Selecting a campaign is not enough. The marketing score looks at target visits, served promoted units, missed promoted units, target gross margin, allocated campaign cost, ROI proxy, and promoted stockout SKUs.

That makes marketing strategically honest:

- A good campaign can grow profitable demand and improve rewards.
- A bad campaign can create angry customers and negative score.
- A campaign with no stock is worse than no campaign.

## Reward Function

The game rewards robust shopkeeping, not a single metric.

Daily score is split into:

| Bucket | Rewards | Penalizes |
| --- | --- | --- |
| Service | Fulfilled demand and named customer service | Missed demand and stockouts |
| Inventory | Healthy closing stock, low missed units, low waste | Stockout days, overstock risk, perishable risk |
| Money | Operating profit, collected cash, cash buffer | Low cash, excessive khata, weak margin |
| Relationships | Trust gains and repeat-customer service | Missed regulars and trust drops |
| Marketing | Served promoted demand, campaign ROI, no promoted stockouts | Missed promoted demand and wasteful campaigns |
| Operations | Useful ordering, offers, removals, reminders | Weak or inconsistent operational planning |
| Penalties | Avoidable failures | Stockouts, waste, no-action days, severe cash issues |

The total is:

```text
service + inventory + money + relationships + marketing + operations + penalties
```

This matters because a model can make money while destroying trust. In a real kirana, that is not a clean win. A shop that ends with cash but alienates regular customers has weakened its future.

## How An AI Should Play

A strong AI should behave like a disciplined assistant to the shopkeeper:

1. Read the environment before touching inventory.
2. Protect high-trust essentials first.
3. Preserve enough cash to correct tomorrow.
4. Treat perishable items as timed risk, not just stock.
5. Use marketing only when inventory can serve the extra demand.
6. Watch named customers and khata, not only aggregate sales.
7. Learn from missed demand, but avoid blindly ordering all missed units.
8. Keep structured action JSON consistent with the written rationale.

The best AI plans are boring in a useful way: they keep milk and bread available, stock snacks before school or festival pressure, prepare cold drinks before heat, avoid banana waste, and remind khata customers without destroying trust.

## Why The Environment Is Useful For AI Research

Many AI benchmarks reward answering a question. This environment rewards operating a small business over time.

It tests:

- structured action generation
- stateful planning
- cash-constrained decision-making
- partial demand inference
- delayed consequences
- causal interpretation of environment signals
- marketing under uncertainty
- relationship-aware decision-making
- long-horizon correction after mistakes
- JSON reliability under real validation

The environment also produces a useful day-level record:

```text
previous day reality
  -> upcoming day signals
  -> AI action
  -> actual customer visits
  -> reward breakdown
  -> next state
```

That record can become a dataset for supervised fine-tuning, reward-model training, policy comparison, and replay-based explanation.

## Evaluation Methodology

Every serious model comparison should report both final score and business health.

Recommended metrics:

| Metric | Why It Matters |
| --- | --- |
| Total reward | Overall benchmark objective |
| Final cash | Survival and ordering capacity |
| Final trust | Long-term customer health |
| Profit | Economic outcome |
| Revenue | Sales scale |
| Sold units | Fulfillment volume |
| Missed units | Unserved demand |
| Stockout incidents | Operational failure |
| Waste loss | Perishable discipline |
| Marketing ROI | Campaign quality |
| Khata balance and collections | Cash conversion |
| Retries and fallbacks | Model reliability |
| Latency | Practical usability |
| Product service rates | Where the model succeeded or failed |

Recent internal arena runs after the fixed-world context and Responses API changes show why multiple metrics matter:

| Model | Reward | Final Cash | Final Trust | Profit | Sold Units | Missed Units | Diagnosis |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| GPT 5.5 | +2136 | Rs 39,071 | 100 | Rs 51,552 | 7,941 | 233 | Strongest strategic run; protected trust and used marketing well |
| Gemini 3.1 Pro | +2064 | Rs 45,869 | 97 | Rs 47,506 | 7,558 | 274 | Top-tier high-reasoning run after Responses JSON-object compatibility fix; zero fallbacks and 96.5% service |
| Claude Opus 4.8 | +1773 | Rs 46,440 | 99 | Rs 47,544 | 7,305 | 473 | Premium reasoning run after campaign-validation fixes; zero fallback days, high trust, and strong marketing ROI |
| Gemini 3.1 Flash Lite | +1581 | Rs 34,760 | 90 | Rs 38,848 | 6,327 | 583 | Best current fast baseline; no fallbacks, high trust, average latency around 2.5 seconds |
| Grok 4.3 | +1125 | Rs 34,353 | 29 | Rs 35,075 | 5,640 | 750 | Clean Responses JSON-object run with zero fallbacks, but trust remained weak because stockouts stayed frequent |
| Gemma 4 31B | +1071 | Rs 33,231 | 58 | Rs 36,875 | 5,963 | 710 | Reliable JSON, but weaker service and trust preservation |
| Sarvam 105B | +350 | Rs 30,899 | 6 | Rs 31,075 | 5,105 | 1,136 | Direct Indian model API worked, but service gaps caused late trust collapse |
| Qwen 3.7 Max | +275 | Rs 28,731 | 10 | Rs 28,524 | 4,570 | 1,155 | Clean transport, but weak service coverage and trust collapse |

This is not a claim that one model is universally better. It is a claim about this environment, this prompt contract, this fixed neighborhood, and this simulator version. Transport profile also matters. Gemini 3.1 Flash Lite used a fast text-JSON arena profile, Sarvam 105B and Qwen 3.7 Max used Chat Completions `json_object`, GPT 5.5 used Responses with strict schema, and Gemini 3.1 Pro, Claude Opus 4.8, and Grok 4.3 used Responses `json_object` with high reasoning.

The Gemini 3.1 Pro result is a useful harness lesson. Under Chat Completions with strict schema, the same model previously completed 30 days but scored only `+237`, ended with trust `0`, and needed six fallback days because its rationale and executable action often diverged. After moving it to OpenRouter Responses and using `json_object` plus backend validation, it reached `+2064`, retained trust at `97`, served `96.5%` of demand, and used zero fallback days. The business policy improved, but the bigger finding is about evaluation design: agent benchmarks must measure both model intelligence and the reliability of the action contract.

Grok 4.3 adds another useful datapoint. It completed all 30 days through OpenRouter Responses `json_object` with zero retries and zero fallbacks, proving that the safer async Responses route is not only an OpenAI/Gemini path. Its business policy, however, was weaker than its transport: it made profit and avoided waste, but ended with trust `29` because it still missed too many essentials and perishable units.

Claude Opus 4.8 shows why benchmark harness quality must be reported with the score. An early run was distorted by campaign-validation false positives: the model mentioned active campaigns such as `school_combo` or `whatsapp_status`, and the validator treated those references as new campaign claims. After narrowing that validator and storing raw request/response text for audit, a full 30-day Opus run reached `+1773`, final cash `Rs 46,440`, final trust `99`, `93.9%` service, `13.1x` marketing ROI, and zero fallback days. It still needed two validation retries, so the result is strong but also records a remaining active-campaign wording edge in the harness.

The AI does receive previous-day context, but not as an unlimited raw transcript. The compact Arena observation includes the last three day summaries and item-level recent movement; full observations include the last five days. Those summaries expose reward, cash, trust, profit, missed demand, stockouts, trust breakdown, marketing score, active campaigns, customer/khata state, and current inventory. This keeps the prompt small enough for repeated 30-day runs while still giving the model enough memory to learn from recent sales and mistakes.

The most important output of the benchmark is not the leaderboard alone; it is the day-by-day explanation of why a model won or lost.

## Frontier AI And Fine-Tuned AI As Kirana Companions

The practical vision is not an autonomous AI replacing the kirana owner. The more useful vision is an AI companion that sits beside the owner and helps with decisions the owner already makes.

### What Frontier AI Can Do

Frontier models are useful because they can reason across messy context:

- "Rain tomorrow, but school is open. What changes?"
- "Milk missed twice, but cash is tight. What is the safest order?"
- "Should I run a WhatsApp offer if cold drinks are low?"
- "Which khata customer should I remind without hurting trust?"
- "Why did my score fall despite high revenue?"

They can turn raw ledgers into understandable advice, explain trade-offs, and adapt to unusual events.

### What Fine-Tuned Local Models Can Do

Fine-tuned smaller models can be more practical at the edge:

- reliable structured actions
- local language support
- regional product baskets
- festival and school-calendar patterns
- supplier pack-size habits
- shop-specific customer memory
- low-latency offline or low-connectivity use

A strong production system may combine both: a frontier model for difficult reasoning and a smaller tuned policy for daily execution.

### What A Real Kirana Assistant Might Eventually Need

Moving from simulation to real shops would require:

- POS and UPI transaction ingestion
- wholesaler price and pack-size data
- local weather and event signals
- customer privacy and consent controls
- owner override on every recommendation
- offline-first behavior
- simple Hindi/Hinglish/local-language explanations
- supplier ordering integration
- safe khata reminder policies
- transparent reasoning for why a recommendation was made

The benchmark environment is a small but concrete step toward that future.

## Limitations

Shree Shyam Bhandar is a simulation. It should not be confused with the full complexity of Indian retail.

Current limitations include:

- only seven playable SKUs
- simplified supplier behavior
- simulated rather than real customer behavior
- fixed fictional neighborhood
- simplified marketing response
- no real payment integrations
- no legal, tax, or supplier-credit modeling
- limited multilingual and voice interaction

These constraints are intentional for the first environment. A good benchmark starts controllable, then becomes richer.

## Future Work

Promising next steps:

- expand to 50+ SKUs with category-level shelves
- add supplier delays, wholesale price changes, and credit terms
- model nearby competitors and quick-commerce leakage
- add festival calendars and region-specific event profiles
- generate multiple fixed neighborhoods for evaluation splits
- publish anonymized day-record datasets
- build a Hugging Face leaderboard for AI shopkeepers
- train small models on strong day-level action traces
- add human-vs-AI and AI-vs-AI replay comparisons
- test model robustness under hidden shocks and incomplete data

## Conclusion

Shree Shyam Bhandar is a game, but the problem is real. Kirana owners operate under uncertainty every day. They must manage trust, cash, inventory, waste, credit, customers, and competition at the same time.

That makes the kirana a powerful testbed for AI agents. The environment asks a model to do something practical: read context, make a plan, output valid actions, accept consequences, and improve over a 30-day run.

If AI can learn to help a kirana owner avoid missed milk sales, reduce banana waste, preserve cash, time a school snack campaign, and maintain customer trust, then it is no longer only answering questions. It is becoming a useful business companion.

## References

- [IBEF: Retail Industry in India](https://www.ibef.org/industry/retail-india)
- [ONDC: Open Network for Digital Commerce](https://ondc.org/)
- [NPCI: UPI Product Statistics](https://www.npci.org.in/what-we-do/upi/product-statistics)
- [Economic Times: Reinventing Retail, how kirana stores are adapting to e-commerce and quick commerce](https://economictimes.indiatimes.com/small-biz/sme-sector/reinventing-retail-how-kirana-stores-are-adapting-to-the-challenges-posed-by-e-commerce-q-commerce/articleshow/117128635.cms)
- [arXiv: Artificial Intelligence in Retail Operations and Demand Forecasting](https://arxiv.org/search/?query=retail+demand+forecasting+artificial+intelligence&searchtype=all)
- [Project doc: Game Systems](game-systems.md)
- [Project doc: AI Arena](ai-arena.md)
- [Project doc: AI Day Record](ai-day-record.md)
- [Project doc: AI Model Performance Ledger](ai-model-performance.md)
