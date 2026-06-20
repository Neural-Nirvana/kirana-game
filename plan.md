I've read through the full 1704-line game spec. It's a beautifully designed document — the core concept is **"Kirana Survival"**, a 30-day Indian kirana shop simulator where the emotional hero is milk, and the drama comes from real tradeoffs (fridge space vs. trust, cash buffer vs. festival prep, discount early vs. hold price).

Now let me design a proper implementation plan focused on **aesthetics and architecture**.

---

## What I Recommend

### Tech Stack
**TypeScript + HTML5 Canvas 2D** (single-file entry, no heavy engine)

Why not Phaser/Unity/Pixi?
- The game is **UI-heavy** (cards, meters, sliders, panels) but **animation-light** (customers move, shelves empty, meters update)
- Canvas 2D gives us **pixel-perfect control** over the "clean business dashboard" aesthetic
- No framework overhead = easier to record for YouTube, easier to tweak
- The entire shop board can be a single isometric-ish 2D renderer
- UI overlays (cards, meters) render as DOM on top for crisp text and CSS transitions

### Visual Architecture
Two layers:
1. **Canvas Layer** — The shop board (isometric shop, customer queue, fridge, truck, shelves)
2. **DOM Layer** — Dashboard panels, action cards, product cards, meters (benefits from CSS for layout, fonts, hover states)

This gives us the best of both: the shop feels like a game world, the UI feels like a modern dashboard.

---

## Aesthetic Design Plan

### Color Palette (from doc + refinement)

| Element | Color | Hex |
|---------|-------|-----|
| Background | Warm off-white | `#F5F0EB` |
| Primary UI / Panels | Deep charcoal navy | `#1E293B` |
| Secondary UI | Slate | `#475569` |
| Success / Cash | Emerald | `#10B981` |
| Profit / Positive | Teal green | `#14B8A6` |
| Warning | Amber | `#F59E0B` |
| Danger / Stockout | Rose | `#F43F5E` |
| Expiry / Waste | Orange | `#F97316` |
| Fridge | Cool blue | `#3B82F6` |
| Trust | Soft purple | `#8B5CF6` |
| Panel background | White | `#FFFFFF` |
| Shop floor | Warm sand | `#E8DDD0` |
| Shelf wood | Walnut | `#92400E` |

### Typography

| Use | Font | Weight |
|-----|------|--------|
| Game title / Headers | `Inter` or `Space Grotesk` | 700 |
| Numbers / Meters | `JetBrains Mono` or `Inter` | 700 |
| Body / Cards | `Inter` | 400, 500 |
| Labels | `Inter` | 500, uppercase, letter-spacing |

Numbers should be **large, monospaced, tabular** so they don't jitter when updating.

### Shop Board Style
- **Light isometric** — 2.5D at about 30° angle
- Clean outlines, no heavy shadows
- Warm Indian shop textures (terracotta floor, wood shelves, simple striped awning)
- Products as clean icons/blocks:
  - Milk = white cartons with blue label
  - Bread = tan rectangle
  - Bananas = yellow crescents
  - Chips = small red packets
  - Cold drinks = colored cylinders
- Customers = simple rounded figures (no cartoon faces — just colored shapes with mood indicators)
- Everything communicates state through **color + icon + count**

### UI Panel Style
- **Floating glass-morphism-lite** or clean solid panels
- Rounded corners (`border-radius: 12px`)
- Subtle shadows (not heavy)
- Smooth transitions (CSS `transition: all 0.2s ease`)
- Action cards have **hover lift** effect
- Selected states have **navy border + glow**

---

## Architecture Plan

### State Machine (5 screens)
```
OPENING_SCREEN
  ↓
MORNING_PLANNING
  ↓
LIVE_SIMULATION
  ↓
CRISIS_CHOICE (if event triggers)
  ↓
EVENING_REPORT
  ↓ (repeat for 30 days)
FINAL_SCOREBOARD
```

### Core Game Loop (per day)
```
1. Load state from previous day
2. Generate morning briefing (weather, events, demand forecast)
3. Player plans (orders, discounts, cash reserve, fridge allocation)
4. Validate plan (preview risks)
5. Lock plan → simulate day
6. Run 3 customer waves (morning, afternoon, evening)
7. Trigger random events
8. Calculate profit, waste, trust, stockouts
9. Apply expiry (end of day)
10. Show evening report + reward breakdown
11. Save day log to JSON
12. Advance to next day
```

### Entity Component System (simplified)

| Module | Responsibility |
|--------|---------------|
| `GameState` | Central immutable state for current day |
| `ShopRenderer` | Canvas 2D rendering of shop board |
| `UIManager` | DOM rendering of panels, cards, meters |
| `DaySimulator` | Runs the simulation logic |
| `EventGenerator` | Creates random events per day |
| `DemandEngine` | Calculates demand based on factors |
| `InventoryManager` | Tracks stock with age buckets |
| `ScoringEngine` | Computes daily and final scores |
| `DataLogger` | Generates JSON logs per day |
| `AIInterface` | Accepts AI actions in same format as human |

### Data Flow
```
Player Action / AI Action
       ↓
  ActionValidator
       ↓
  GameState.update()
       ↓
  DaySimulator.run()
       ↓
  EventGenerator.apply()
       ↓
  ScoringEngine.calculate()
       ↓
  DataLogger.save()
       ↓
  ShopRenderer.redraw()
  UIManager.update()
```

---

## Shop Board Layout (16:9)

```
┌─────────────────────────────────────────────┬──────────────────────────────┐
│                                             │                              │
│          SHOP BOARD (60% width)             │    DASHBOARD (40% width)     │
│                                             │                              │
│    ┌─────────────────────────────┐          │  ┌────────────────────────┐  │
│    │      ~ Striped Awning ~     │          │  │  DAY 05/30 | SCORE    │  │
│    ├─────────────────────────────┤          │  └────────────────────────┘  │
│    │  Fridge │ Shelves │ Counter │          │  ┌────────────────────────┐  │
│    │  [Milk] │ [Bread] │  Cash   │          │  │  METERS (Cash, Trust,  │  │
│    │  [Cold] │ [Chips] │  Queue  │          │  │  Expiry, Fridge, Daily │  │
│    │  [Drnk] │ [Maggi] │         │          │  │  Profit)               │  │
│    │         │ [Egg]   │         │          │  └────────────────────────┘  │
│    │         │ [Banana]│         │          │  ┌────────────────────────┐  │
│    ├─────────────────────────────┤          │  │  PRODUCT CARDS (7)     │  │
│    │    Customer Queue (front)   │          │  │  [Milk] [Bread]...     │  │
│    ├─────────────────────────────┤          │  └────────────────────────┘  │
│    │  Supplier Truck Lane        │          │  ┌────────────────────────┐  │
│    │  [Truck] →→→→→→→→→→        │          │  │  ORDER BASKET          │  │
│    └─────────────────────────────┘          │  │  + Discount / Reserve  │  │
│                                             │  │  + Fridge Allocation   │  │
│    Bottom strip: Status icons               │  │  + Risk Preview        │  │
│    (Waste bin, Complaint bubbles)           │  └────────────────────────┘  │
│                                             │                              │
│                                             │  [ LOCK PLAN ]               │
└─────────────────────────────────────────────┴──────────────────────────────┘
```

---

## Implementation Phases

### Phase 1: Foundation (Day 1-2)
- [ ] Project scaffold (Vite + TypeScript, single HTML entry)
- [ ] GameState class with all data structures
- [ ] Basic canvas renderer (shop floor, shelves, fridge as colored rectangles)
- [ ] Basic DOM UI skeleton (panels, meters)
- [ ] Day advancement logic (no simulation yet, just next day button)

### Phase 2: Core Loop (Day 3-4)
- [ ] Morning planning screen with product cards
- [ ] Order basket with +/- steppers
- [ ] Cash reserve slider
- [ ] Fridge allocation sliders
- [ ] Lock plan → simulate → evening report flow
- [ ] JSON data logger (save each day's log)

### Phase 3: Simulation (Day 5-6)
- [ ] Customer wave simulation (3 waves per day)
- [ ] Demand engine (weather, day, events)
- [ ] Inventory aging with expiry
- [ ] Stockout detection
- [ ] Trust changes
- [ ] Profit calculation

### Phase 4: Visual Polish (Day 7-8)
- [ ] Isometric shop board rendering
- [ ] Customer queue animation
- [ ] Product icons on shelves/fridge
- [ ] Visual state changes (yellow/red warnings)
- [ ] Supplier truck animation
- [ ] Floating score chips
- [ ] Transitions between screens

### Phase 5: Events & Tutorial (Day 9-10)
- [ ] Situation cards system
- [ ] Crisis choice events
- [ ] 30-day difficulty curve
- [ ] Tutorial flow (Days 1-3 limited products)
- [ ] Opening screen + final scoreboard

### Phase 6: AI Mode (Day 11-12)
- [ ] AI action interface (same JSON as human)
- [ ] Rule-based agent
- [ ] AI replay comparison screen
- [ ] Replay any day with different decisions

---

## Directory Structure

```
episode1-kirana-game/
├── index.html
├── src/
│   ├── main.ts
│   ├── style.css
│   ├── game/
│   │   ├── GameState.ts
│   │   ├── DaySimulator.ts
│   │   ├── EventGenerator.ts
│   │   ├── DemandEngine.ts
│   │   ├── InventoryManager.ts
│   │   ├── ScoringEngine.ts
│   │   └── DataLogger.ts
│   ├── ui/
│   │   ├── UIManager.ts
│   │   ├── panels/
│   │   │   ├── MorningPanel.ts
│   │   │   ├── SimulationPanel.ts
│   │   │   ├── EveningPanel.ts
│   │   │   └── ScoreboardPanel.ts
│   │   ├── components/
│   │   │   ├── ProductCard.ts
│   │   │   ├── ActionCard.ts
│   │   │   ├── SituationCard.ts
│   │   │   ├── MeterBar.ts
│   │   │   ├── OrderBasket.ts
│   │   │   └── RewardChip.ts
│   │   └── screens/
│   │       ├── OpeningScreen.ts
│   │       ├── MorningScreen.ts
│   │       ├── SimulationScreen.ts
│   │       ├── CrisisScreen.ts
│   │       ├── EveningScreen.ts
│   │       └── FinalScreen.ts
│   ├── render/
│   │   ├── ShopRenderer.ts
│   │   ├── IsometricGrid.ts
│   │   ├── AnimatedQueue.ts
│   │   └── VisualEffects.ts
│   ├── ai/
│   │   ├── AIInterface.ts
│   │   ├── RuleBasedAgent.ts
│   │   └── ReplayEngine.ts
│   ├── types/
│   │   └── index.ts
│   └── constants/
│       ├── products.ts
│       ├── events.ts
│       ├── colors.ts
│       └── config.ts
├── assets/
│   ├── fonts/
│   └── icons/  (SVG icons for products)
└── logs/       (generated daily JSON logs)
```

---

## Key Aesthetic Principles I'll Follow

1. **Numbers must feel alive** — Cash updates with a counting animation, trust changes with a smooth bar transition, stockouts flash red
2. **Every decision has a visual echo** — Order milk → truck arrives → fridge fills. Discount bananas → price tag changes → they sell faster visually
3. **Panels float, shop grounds** — UI feels modern and dashboard-like, shop feels warm and physical
4. **No information hunting** — Eye flow: Day status → shop problem → player action → visual result → reward (exactly as spec'd)
5. **Color has meaning** — Green = money/health, amber = watch out, red = danger, blue = fridge, purple = trust

---

## Questions Before We Start Building

1. **Tech confirmation:** Are you okay with TypeScript + HTML5 Canvas + DOM UI? (I can also do pure Canvas if you want everything in one layer, or React + Canvas if you prefer React for UI)

2. **Art style depth:** Should I use simple geometric shapes for products (rectangles, circles with labels) or do you want custom SVG icons for each product? (Geometric = faster to build and cleaner, SVG = more detailed)

3. **Build target:** Should this be a single-page web app that runs in a browser? (Best for recording/YouTube sharing) Or do you need it as an executable?

4. **Scope for first playable:** Should I build the full 30-day game with all 7 products, or start with the tutorial (Days 1-3 with Milk/Bread/Bananas only) and then expand?

Once you confirm these, I'll create the exact file structure and start with the foundation.