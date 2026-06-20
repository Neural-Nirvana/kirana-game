Absolutely. Episode 1 should be designed as a **human-playable kirana strategy game first**, and only later should AI agents enter the arena.

That matters because viewers should think:

> “I can understand this game. I can play this. Now let’s see if AI plays better than me.”

That is much stronger than:

> “AI is optimizing some invisible backend simulation.”

# Episode 1 Game Spec

## **AI Nagar: Kirana Street**

### Episode title

**I Made AI Run a Kirana Shop for 30 Days**

### Game promise

You run a small Indian kirana shop for 30 days.

Your job is simple:

> **Make profit without losing customer trust.**

But the game keeps throwing familiar real-life problems at you:

* milk expires quickly
* fridge space is limited
* customers get angry when essentials run out
* suppliers are sometimes late
* festivals suddenly increase demand
* cash gets locked in slow-moving stock
* discounts save waste but reduce margin

This should feel like a **small business survival simulator**, not a children’s shop game.

---

# 1. Core feel

The feel should be:

## **“Serious small business simulator with clean game energy.”**

Not cartoonish. Not too Excel-like.

Think:

```text
Kirana shop visual board
+ clean business dashboard
+ action cards
+ live score
+ visible consequences
+ end-of-day reward breakdown
```

The viewer should immediately understand:

```text
I have cash.
I have stock.
Some stock can expire.
Customers want things.
I must decide what to buy, discount, delay, or preserve.
```

The emotional loop is:

```text
I made a decision.
The shop reacted.
Customers reacted.
Money changed.
Score changed.
I understand why.
```

That is the core.

---

# 2. Human-first design principle

The first version should not begin with AI.

It should begin with a **human player mode**.

### Mode 1: Human Manager

The human runs the kirana shop manually for 30 days.

### Mode 2: AI Replay

The AI plays the same 30-day scenario with the same starting conditions.

### Mode 3: Battle Replay

Human vs Rule-Based Agent vs Big AI vs Small Trained AI.

This makes the content much more watchable because viewers can compare decisions.

Example:

```text
Day 12 Festival Crisis

Human:
Bought too many chips, ran out of milk.

Rule-Based Agent:
Followed normal reorder rule, failed during demand spike.

Big AI:
Made a reasonable plan but spent too much cash.

Small Trained AI:
Prioritized milk, cold drinks, and cash buffer.

Winner: Small Trained AI
```

That becomes a story.

---

# 3. Main screen layout

Use one consistent 16:9 screen.

```text
┌──────────────────────────────────────────────────────────────┐
│ AI NAGAR: KIRANA STREET | DAY 05 / 30 | SCORE | CASH | TRUST │
├─────────────────────────────────┬────────────────────────────┤
│                                 │                            │
│        SHOP GAME BOARD           │   TODAY'S SITUATION        │
│                                 │                            │
│   shelves | fridge | customers  │   ACTION CARDS             │
│   stock   | counter | truck     │                            │
│                                 │   ORDER BASKET             │
│                                 │                            │
├─────────────────────────────────┴────────────────────────────┤
│ CASH | TRUST | STOCK HEALTH | EXPIRY RISK | FRIDGE SPACE      │
├──────────────────────────────────────────────────────────────┤
│ DECISION LOG | REWARD BREAKDOWN | 30-DAY TIMELINE             │
└──────────────────────────────────────────────────────────────┘
```

The eye flow should always be:

```text
Day status → shop problem → player action → visual result → reward
```

Do not make the player hunt.

---

# 4. The shop board

The main world should be a clean 2D/2.5D kirana shop.

## Visual objects

The board should include:

* front customer queue
* cash counter
* fridge
* milk crate area
* banana basket
* bread shelf
* snacks shelf
* Maggi/essentials shelf
* cold drink fridge section
* supplier truck lane
* expired stock bin
* complaint bubbles

The shop should feel Indian but simplified.

Not over-detailed. Use strong readable icons.

Example visual states:

| Situation           | Visual effect                        |
| ------------------- | ------------------------------------ |
| Milk in stock       | Milk crates visible inside fridge    |
| Milk running low    | Fridge section flashes yellow        |
| Milk stockout       | Empty red outline in fridge          |
| Bananas near expiry | Bananas turn yellow-orange/red       |
| Chips overstocked   | Shelf visually crowded               |
| Supplier delay      | Truck stuck outside with delay timer |
| Customer angry      | Small red complaint bubble           |
| Good sales          | Customer queue moves smoothly        |
| Waste               | Items move to expired stock bin      |

Every major system must be visible.

---

# 5. Main game meters

Use these six meters for Episode 1:

```text
Cash
Customer Trust
Inventory Health
Expiry Risk
Fridge Space
Daily Profit
```

## Meter behavior

### Cash

Shows spendable money.

```text
Cash: ₹38,500
Reserved: ₹8,000
Available: ₹30,500
```

### Customer Trust

Falls when essentials are unavailable.

```text
Trust: 76%
```

Milk, bread, eggs, and Maggi should affect trust more than chips.

### Inventory Health

Shows whether the shop has enough stock.

```text
Stock Health: Good
```

### Expiry Risk

Increases when too much perishable inventory is near expiry.

```text
Expiry Risk: Medium
```

### Fridge Space

Very important for milk and cold drinks.

```text
Fridge: 82% full
```

### Daily Profit

Shows today’s running business result.

```text
Today: +₹2,850
```

---

# 6. Product categories

Do not start with 50 SKUs.

Start with 7 product types.

| Product     | Type                        | Demand                | Risk                                | Why it matters         |
| ----------- | --------------------------- | --------------------- | ----------------------------------- | ---------------------- |
| Milk        | Essential/perishable/fridge | High daily            | Very high expiry + stockout penalty | Best drama product     |
| Bread       | Essential/perishable        | Medium-high           | Medium expiry                       | Easy to understand     |
| Eggs        | Essential/semi-perishable   | Stable                | Low-medium                          | Good margin/stability  |
| Maggi       | Essential-ish/long shelf    | Stable                | Low expiry                          | Safe inventory         |
| Chips       | Snack/long shelf            | Event-driven          | Cash lock risk                      | Festival trap          |
| Cold Drinks | Fridge/event/weather item   | High in heat/festival | Fridge space                        | Good tradeoff          |
| Bananas     | Perishable                  | Variable              | Very high expiry                    | Discount mechanic hero |

This is enough for the first game.

The player should understand these seven products deeply.

---

# 7. Product card design

Each product should have a card like this:

```text
MILK

Stock: 18 L
Expected Demand: 32–44 L
Shelf Life: 2 days
Margin: ₹8 / L
Storage: Fridge
Trust Impact: High
Expiry Risk: Medium
```

Use icons, not dense text.

Each product card should show:

```text
Current stock
Tomorrow demand forecast
Shelf life
Margin
Storage requirement
Trust importance
Expiry risk
```

Color code:

```text
Green = healthy
Yellow = attention needed
Red = danger
Blue = fridge item
Orange = expiry risk
```

---

# 8. Core day loop

Each day has five phases.

```text
Morning Briefing
      ↓
Stock & Price Planning
      ↓
Sales Simulation
      ↓
Crisis / Event Response
      ↓
Evening Result
```

## Phase 1: Morning Briefing

The player sees the day context.

Example:

```text
Day 5 — Morning

Weather: Hot
Cash: ₹38,500
Customer Trust: 76%
Supplier Reliability: 82%
Upcoming Event: School reopening in 2 days

Challenge:
Milk demand is rising, but fridge space is limited.
```

This screen should be plain and punchy.

## Phase 2: Stock & Price Planning

The player decides:

```text
What to order
What to discount
How much cash to reserve
How to use fridge space
```

## Phase 3: Sales Simulation

The day runs visually.

Customers come in waves:

```text
Morning rush
Afternoon slow period
Evening rush
```

Products get sold. Shelves empty. Cash changes. Trust changes.

## Phase 4: Crisis / Event Response

A card appears.

Example:

```text
⚠️ Supplier Delay

Your milk supplier is delayed by 4 hours.
Evening milk demand is expected to be high.

Choose one:
1. Buy emergency milk at higher price
2. Push curd/cold drink substitute
3. Wait and risk stockout
```

## Phase 5: Evening Result

Show exactly what happened.

```text
Day 5 Reward: +34

+15 Milk demand met
+8 Banana waste avoided
+7 Cash buffer maintained
+4 Customer trust improved
```

Then timeline moves to Day 6.

---

# 9. Player controls

The game should be playable with simple mouse controls first.

## Main controls

### 1. Drag product into order basket

Player drags product cards into the order basket.

```text
Milk: +10 L
Bread: +20 packs
Bananas: +5 kg
```

The basket instantly shows:

```text
Total cost
Fridge usage
Shelf usage
Expected expiry risk
Cash left after order
```

### 2. Quantity stepper

Each product has `-` and `+` controls.

Example:

```text
Milk: 20 L  [-] [+]
```

Use fixed increments:

```text
Milk: 5 L
Bread: 5 packs
Eggs: 12 eggs
Maggi: 10 packets
Chips: 10 packets
Cold drinks: 6 bottles
Bananas: 1 kg
```

This prevents messy micro-management.

### 3. Discount chips

Player can apply simple discounts.

```text
0% | 5% | 10% | 15% | 20%
```

Discounting should mostly be used for near-expiry stock.

Example:

```text
Bananas: 15% discount
Expected effect: Faster sales
Risk: Lower margin
```

### 4. Cash reserve slider

Player sets a minimum cash buffer.

```text
Keep cash reserve: ₹8,000
```

If the player tries to spend too much, the UI warns:

```text
⚠️ You will have only ₹2,500 cash left.
Supplier delay or emergency order may hurt you.
```

### 5. Fridge allocation bar

The fridge should be a visual capacity bar.

```text
Milk: 55%
Cold Drinks: 35%
Buffer: 10%
```

Player can adjust with sliders or drag handles.

This creates a great tradeoff:

```text
More milk = fewer stockouts
More cold drinks = better festival/heat profit
Too full = no flexibility
```

### 6. Lock Plan button

After planning:

```text
LOCK MORNING PLAN
```

Once locked, the day begins.

Allow undo before lock. After lock, decisions become consequences.

### 7. Speed controls

During simulation:

```text
Pause
1x
2x
Skip to Event
Skip to Evening
```

For YouTube recording, `1x` and `Skip to Event` are enough.

### 8. Explain Score button

At any time, player can click:

```text
Why did score change?
```

It opens:

```text
+₹1,200 profit from milk
-₹300 banana expiry
-4 trust because bread stockout
```

This is essential.

---

# 10. Action card system

The player should not type decisions.

The player should choose from action cards.

## Morning action cards

Examples:

```text
Order extra milk
Discount near-expiry bananas
Restock Maggi
Keep higher cash reserve
Prioritize fridge for milk
Buy festival snacks
Reduce cold drink order
```

## Midday emergency cards

Examples:

```text
Emergency supplier run
Cost: +12% purchase price
Effect: restock one product by evening

Flash discount
Cost: lower margin
Effect: clear near-expiry stock faster

Promote substitute
Cost: small trust risk
Effect: reduce pressure on stockout item

Accept stockout
Cost: trust loss
Effect: save cash
```

Each action card should show:

```text
Action name
Cost
Expected effect
Risk
```

After the day ends, the same card should show actual result.

Example:

```text
Discount bananas by 15%

Expected:
Reduce expiry waste

Actual:
Sold 80% before spoilage

Reward:
+8 waste avoided
-2 margin loss
```

This is very watchable.

---

# 11. Situation cards

Situation cards introduce tension.

Examples:

```text
⚠️ Evening Milk Rush
Milk demand may spike between 5 PM and 8 PM.
Current stock may not be enough.
```

```text
⚠️ Festival Weekend Coming
Cold drinks +80%
Chips +65%
Milk +25%
Supplier prices +12%
```

```text
⚠️ Bananas Near Expiry
6 kg bananas will expire tomorrow.
Discounting may save waste.
```

```text
⚠️ Supplier Delay Risk
Your usual supplier reliability dropped to 62%.
Emergency restock may be expensive.
```

Situation cards should be written in human language.

Bad:

```text
Demand volatility coefficient increased by 0.32.
```

Good:

```text
Festival shoppers may buy almost double snacks and cold drinks.
```

---

# 12. Consequence cards

After actions, show what happened.

Example:

```text
Result: Milk Stockout

Milk ran out at 6:20 PM.
14 customers left without buying.
Customer Trust: -6
Lost Sales: ₹840
Penalty: -8
```

Another:

```text
Result: Smart Discount

Bananas were discounted before expiry.
4.2 kg sold before spoilage.
Waste reduced by ₹210.
Reward: +8
```

These cards are where the audience learns.

---

# 13. Visual consequence rules

Every decision should visibly affect the shop.

| Player action         | Visual consequence                              |
| --------------------- | ----------------------------------------------- |
| Order milk            | Supplier truck arrives, milk crates fill fridge |
| Over-order milk       | Fridge fills, expiry warning appears next day   |
| Discount bananas      | Price tag changes, customers buy faster         |
| Ignore bananas        | Red spoilage icon appears, waste bin fills      |
| Stockout bread        | Empty shelf, customer complaint bubble          |
| Keep cash reserve     | Cash meter has locked reserve section           |
| Buy too many chips    | Shelf crowded, cash meter drops                 |
| Festival demand spike | Customer queue grows, snack shelf empties fast  |
| Supplier delay        | Truck timer appears, shelves stay empty         |
| Emergency purchase    | Stock arrives, but margin chip turns red        |

Cause and effect must be obvious.

---

# 14. Reward system

The reward should feel fair and simple.

Use five reward buckets:

```text
Money
People
Stock Management
Risk Control
Waste Control
```

## Daily reward example

```text
Day 5 Reward: +34

Money: +12
People: +8
Stock Management: +7
Risk Control: +3
Waste Control: +4
```

Then show detail:

```text
+15 milk demand met
+8 banana wastage avoided
+7 cash buffer maintained
-5 bread stockout
-3 fridge overfilled
```

## Final 30-day score

```text
Final Score: 812

Total Profit: ₹42,800
Customer Trust: 86%
Waste Loss: ₹2,100
Stockouts: 3
Cash Crisis Days: 1
Best Decision: Day 12 festival milk planning
Worst Decision: Day 7 banana overstock
```

The final scoreboard should feel like a cricket scorecard.

---

# 15. Human-readable scoring logic

Behind the scenes, scoring can be formulaic.

But on screen, keep it simple.

Example internal logic:

```text
Money Score:
Profit earned minus inventory waste

People Score:
Demand fulfilled, especially essential items

Stock Score:
Enough stock without overstocking

Risk Score:
Cash buffer, supplier delay preparedness

Waste Score:
Low expiry loss and smart discounts
```

The viewer does not need to know coefficients.

But “Nerd Mode” can show:

```text
Score = Profit + Trust + Demand Met - Waste - Stockouts - Cash Risk
```

Keep that optional.

---

# 16. The most important product: milk

Milk should be the emotional hero of Episode 1.

Why?

Because everyone understands it.

Milk creates the perfect tradeoff:

```text
High demand
High trust importance
Short shelf life
Needs fridge
Can stockout in evening
Can spoil if over-ordered
```

The memorable game moment should be:

```text
Milk runs out at 6 PM.
Customers leave angry.
Trust drops.
```

Then later:

```text
The trained model learns to order more milk before evening rush,
but not so much that it expires.
```

That is the audience hook.

---

# 17. Difficulty curve across 30 days

Do not show every day in detail in the YouTube episode.

But the actual game can simulate all 30 days.

Important story days:

| Day       | Event                      | Purpose                         |
| --------- | -------------------------- | ------------------------------- |
| Day 1     | Tutorial day               | Teach ordering and trust        |
| Day 3     | Milk evening rush          | First stockout lesson           |
| Day 5     | Banana expiry              | Teach discounting               |
| Day 7     | Supplier delay             | Teach risk buffer               |
| Day 10    | Cash crunch                | Teach overstock danger          |
| Day 12–14 | Festival weekend           | Main drama                      |
| Day 18    | Weather turns hot          | Cold drink/milk/fridge tradeoff |
| Day 21    | Fridge pressure            | Storage constraint              |
| Day 25    | Competitor discount nearby | Price pressure                  |
| Day 30    | Final result               | Scoreboard                      |

This creates a proper episode arc.

---

# 18. Tutorial experience

The first 3 days should teach the player.

## Day 1

Only 3 products:

```text
Milk
Bread
Bananas
```

Teach:

```text
Order stock
Run day
See reward
```

## Day 2

Add:

```text
Cash reserve
Expiry risk
```

## Day 3

Add:

```text
Discount
Stockout penalty
```

After Day 3, unlock full shop.

Do not overwhelm the human player with all systems immediately.

---

# 19. Main interaction example

## Morning screen

```text
Day 5 — Morning

Cash: ₹38,500
Trust: 76%
Fridge: 68% full
Expiry Risk: Medium
Weather: Hot

Today’s Challenge:
Milk demand is rising, but fridge space is limited.
```

## Player action

```text
Order:
Milk +30 L
Bread +20 packs
Bananas +4 kg
Cold Drinks +18 bottles

Discount:
Bananas 10%

Cash Reserve:
₹8,000

Fridge Allocation:
Milk 65%
Cold Drinks 25%
Buffer 10%
```

## Prediction preview

Before locking:

```text
Expected:
Milk stockout risk: Low
Banana waste risk: Medium-low
Cash risk: Safe
Fridge pressure: High
```

## End result

```text
Day 5 Result

Profit: ₹3,200
Trust: 78% → 81%
Waste: ₹90
Stockouts: 0

Reward: +34
```

Then show floating chips:

```text
+₹3,200 profit
+3 trust
-₹90 waste
+0 stockouts
```

---

# 20. Game controls in detail

## Mouse controls

| Control                  | Action                |
| ------------------------ | --------------------- |
| Click product            | Open product details  |
| Drag product card        | Add to order basket   |
| Click `+/-`              | Change quantity       |
| Click discount chip      | Set discount          |
| Drag fridge slider       | Allocate fridge space |
| Drag cash reserve slider | Set minimum cash      |
| Click action card        | Select special action |
| Click Lock Plan          | Start day             |
| Click Pause              | Pause simulation      |
| Click Explain Score      | Open reward breakdown |
| Click Timeline Day       | Replay that day       |

## Keyboard shortcuts

| Key   | Action                 |
| ----- | ---------------------- |
| Space | Pause/play             |
| 1–7   | Select product card    |
| A     | Open action cards      |
| O     | Open order basket      |
| D     | Open discounts         |
| F     | Open fridge allocation |
| Enter | Lock plan              |
| Z     | Undo before lock       |
| R     | Replay day             |
| N     | Nerd mode              |
| Esc   | Close panel            |

Keyboard shortcuts are not necessary for casual users, but useful for recording content.

---

# 21. Screen states

The game should have these main screens.

## 1. Opening screen

```text
AI Nagar: Kirana Street

Run a kirana shop for 30 days.
Goal: Make profit without losing customer trust.

Starting Cash: ₹50,000
Shop Size: 300 sq ft
Main Products: Milk, Bread, Eggs, Maggi, Chips, Cold Drinks, Bananas
Special Event: Festival Weekend on Day 12
```

Button:

```text
Start as Human Manager
```

Secondary button:

```text
Watch AI Play
```

But first-time experience should push Human Manager.

---

## 2. Morning planning screen

Main decision screen.

Contains:

```text
Today’s situation
Product cards
Order basket
Discount controls
Cash reserve
Fridge allocation
Risk preview
Lock plan button
```

---

## 3. Live shop simulation screen

The shop runs visually.

Shows:

```text
Customers entering
Shelves emptying
Cash increasing
Trust changing
Expiry warnings
Event cards appearing
```

This is the most screen-recordable part.

---

## 4. Crisis choice screen

A mid-day event pauses the simulation.

Example:

```text
⚠️ Milk supplier delayed

Choose response:
1. Emergency purchase at +12% cost
2. Promote cold drinks as substitute
3. Wait and risk evening stockout
```

The player chooses one.

---

## 5. Evening report screen

Shows:

```text
Sales
Profit
Waste
Stockouts
Trust change
Reward breakdown
Tomorrow warnings
```

Button:

```text
Continue to Day 6
```

---

## 6. Final scoreboard

After Day 30:

```text
Final Score: 812

Profit: ₹42,800
Customer Trust: 86%
Waste Loss: ₹2,100
Stockouts: 3
Cash Crisis Days: 1
```

Then:

```text
Now let AI play the same shop.
```

This transition is powerful.

---

# 22. AI mode integration

The AI should not get special powers.

It should use the same controls as the human.

Human action:

```json
{
  "order": {
    "milk_l": 30,
    "bread_packs": 20,
    "bananas_kg": 4
  },
  "discounts": {
    "bananas": 10
  },
  "cash_reserve": 8000,
  "fridge_allocation": {
    "milk": 65,
    "cold_drinks": 25,
    "buffer": 10
  }
}
```

AI action should produce the same structure.

That makes the comparison fair.

The replay can say:

```text
Human chose:
Order 30L milk

Small Trained AI chose:
Order 42L milk, reduce cold drinks, keep ₹10,000 buffer

Result:
AI avoided evening stockout.
```

---

# 23. Replay design

Replay is critical for YouTube.

At the end of any day, allow:

```text
Replay this day
Compare with AI
Compare with rule-based agent
```

## Replay screen

```text
Same crisis. Different decisions.
```

Example:

```text
Day 12 Festival Crisis

Human:
Bought extra chips and cold drinks.
Result: Milk stockout, high missed demand.

Rule-Based:
Normal reorder quantity.
Result: Failed to handle festival spike.

Fine-Tuned Small AI:
Prioritized milk and cold drinks, reduced chips, kept cash reserve.
Result: Best balance.

Winner: Fine-Tuned Small AI
```

This becomes the educational punchline.

---

# 24. Visual language

## Style

Use:

```text
flat 2D / light isometric
clean outlines
warm Indian shop textures
modern dashboard panels
large readable numbers
minimal animation
```

Avoid:

```text
childish cartoon faces
too many emojis
neon hacker aesthetic
dense Excel tables
photorealistic clutter
```

## Color mood

Suggested palette:

```text
Background: warm off-white
Primary UI: deep navy / charcoal
Success: green
Warning: amber
Danger: red
Cash: green
Expiry: orange/red
Fridge: cool blue
Trust: soft purple/blue
```

The shop world can be warm. The dashboard can be clean.

That contrast will look good.

---

# 25. UI object designs

## Situation card

```text
⚠️ Festival Demand Spike

For the next 3 days:
Cold drinks +80%
Chips +65%
Milk +25%

Supplier prices are up 12%.
Cash discipline matters.
```

## Action card

```text
Order Extra Milk

Cost: ₹1,800
Fridge Use: High
Expected Effect: Avoid evening stockout
Risk: Expiry if demand is lower
```

## Product warning

```text
Bananas

6 kg near expiry
Likely waste tomorrow: ₹240
Suggested action: 10–15% discount
```

## Reward chip

```text
+₹3,200 profit
```

```text
-6 trust: milk stockout
```

```text
+8 waste avoided
```

---

# 26. What the player should feel

The player should constantly face understandable tradeoffs.

## Tradeoff 1

```text
Should I buy more milk and risk expiry,
or buy less and risk angry customers?
```

## Tradeoff 2

```text
Should I fill the fridge with cold drinks for profit,
or keep milk space for trust?
```

## Tradeoff 3

```text
Should I discount bananas early,
or wait and hope they sell at full price?
```

## Tradeoff 4

```text
Should I spend cash before festival,
or keep a reserve for supplier shocks?
```

## Tradeoff 5

```text
Should I buy snacks because demand may spike,
or avoid locking cash in slow stock?
```

These are real business decisions. That is why the game will work.

---

# 27. MVP scope

Build only this first:

```text
1. One kirana shop board
2. Seven products
3. Morning order planning
4. Discount controls
5. Cash reserve slider
6. Fridge space slider
7. Three customer waves per day
8. Random event cards
9. Daily reward breakdown
10. 30-day timeline
11. Final scoreboard
12. Replay JSON log
```

Do not build yet:

```text
No Unity
No 3D shop
No complex accounting
No hundreds of products
No staff hiring
No loan system initially
No complicated customer personalities
No multiplayer
```

Keep it clean.

---

# 28. MVP game rules

## Starting conditions

```text
Starting Cash: ₹50,000
Customer Trust: 70%
Shop Size: 300 sq ft
Fridge Capacity: 100 units
Shelf Capacity: 200 units
Simulation Length: 30 days
```

## Daily customer waves

```text
Morning: essentials-heavy
Afternoon: snacks/light demand
Evening: milk, bread, snacks, cold drinks
```

## Demand factors

Demand changes based on:

```text
Day of week
Weather
Festival
Previous stockouts
Customer trust
Discounts
Random events
```

## Inventory aging

Each perishable product has age buckets.

Example:

```text
Milk:
Day 0 stock
Day 1 stock
Expired stock
```

This is important for expiry simulation.

## Trust changes

Trust increases when:

```text
Essentials are available
Prices are stable
Stockouts are rare
```

Trust falls when:

```text
Milk/bread stockout
Repeated missed demand
Bad festival preparation
Too many price hikes
```

---

# 29. Data log structure

Every day should produce a clean log.

```json
{
  "day": 5,
  "visible_state_before": {
    "cash": 38500,
    "trust": 76,
    "weather": "hot",
    "fridge_used_pct": 68,
    "expiry_risk": "medium"
  },
  "player_actions": {
    "orders": {
      "milk_l": 30,
      "bread_packs": 20,
      "bananas_kg": 4,
      "cold_drinks_units": 18
    },
    "discounts": {
      "bananas": 10
    },
    "cash_reserve": 8000,
    "fridge_allocation": {
      "milk_pct": 65,
      "cold_drinks_pct": 25,
      "buffer_pct": 10
    }
  },
  "events": [
    "evening_milk_rush"
  ],
  "results": {
    "profit": 3200,
    "waste_loss": 90,
    "stockouts": 0,
    "trust_change": 3
  },
  "reward_breakdown": {
    "money": 12,
    "people": 8,
    "stock_management": 7,
    "risk_control": 3,
    "waste_control": 4,
    "total": 34
  }
}
```

This same log powers:

```text
Replay
AI training
Leaderboard
YouTube overlays
Debugging
```

Very important.

---

# 30. What makes Episode 1 addictive

The game should create these repeated moments:

## Moment 1: Human mistake

```text
You thought chips would sell.
But milk ran out.
Trust dropped.
```

## Moment 2: Obvious learning

```text
Discounting bananas one day earlier saved more money than waiting.
```

## Moment 3: Festival tension

```text
Cash is low, demand is high, supplier prices are up.
What do you buy?
```

## Moment 4: AI surprise

```text
The trained small model buys less chips than humans expect,
but wins because it protects milk and cash.
```

## Moment 5: Final scoreboard

```text
Human: 690
Rule-Based: 610
Big Prompted AI: 735
Small Base Model: 540
Fine-Tuned Small Model: 812
```

That tells the whole story.

---

# 31. Best first build name

For the playable MVP:

## **Kirana Survival**

Inside the larger world:

## **AI Nagar: Kirana Street**

Episode label:

```text
AI Nagar: Small Model Arena
Episode 1 — Kirana Survival
```

This gives you a repeatable franchise structure.

---

# 32. Final design rule

For Episode 1, always remember:

> **The player should never feel like they are managing data. They should feel like they are managing a real shop.**

So every important number must become a visible thing:

```text
Cash → cash meter
Milk stock → fridge crates
Expiry → color-changing products
Trust → customer queue mood
Demand spike → crowd increase
Supplier delay → truck timer
Waste → expired stock bin
Reward → floating score chips
```

That is the difference between a dashboard and a watchable game.

The first build should be:

```text
Simple enough for a college student to play in 2 minutes.
Deep enough for a founder, shopkeeper, or corporate viewer to respect.
Fair enough that AI winning feels meaningful.
```

That is the sweet spot.
