# Lazy Meal Planner

A single-file meal planner for one person cooking Japanese home food in Tokyo with a
deliberately minimal kitchen. It opens by asking how much effort you have got tonight,
and answers with one dish — either something already cooked in the fridge, or the thing
worth cooking now. Behind that sit a week's plan, a costed LIFE shopping list, a cook
schedule that respects what the gear can actually hold, and a savings log.

**Live:** https://jng1701-bot.github.io/meal-planner/

## The kitchen it is built around

| Gear | Working limit |
|---|---|
| 18 cm pot (~2 L) | 4 stew servings, or 2 one-pot pasta/udon |
| 26 cm frying pan | 2 servings per round before it steams instead of sears |
| Tiger JAJ-A550 rice cooker (3-cup tacook) | 3 cups per run; 2 servings for cook-in dishes |
| Amazon Basics air fryer 4.2 L (1200 W, 60–200 °C, 60 min, ceramic non-stick) | 2 servings per basket; 1 for anything breaded |
| 0.8 L kettle, microwave, toaster | — |
| Storage: 4 × 600 mL boxes, 3 × 355 ml rice pots | one serving per box; peak 3 boxes in circulation |

Every recipe carries a `cap` = servings per cooking round on its gear. The week's rhythm
turns that into "do N rounds back-to-back" rather than pretending one pan does everything.

Container counts come from the same logic. Simulated against the app's own Sunday/Wednesday
batch schedule, a default week (7 meals, 2–3 dishes) peaks at 3 main containers in
circulation, so four covers it with one in the sink. Rice pots are set by how many portions
you freeze per cooker run: 1.5 cups twice a week needs three, one 3-cup run needs five. Only
"1 dish, max batch" mode needs seven mains. Portion volumes: curry, keema and nikujaga
400–430 ml, tonjiru and bean soup ~520 ml, nabe ~600 ml — which is why 600 mL is one size for
everything, and why rice keeps its own 355 ml pot. Those numbers live in the collapsed rules
block on the Fridge tab.

## The five screens

| Tab | What it is for |
|---|---|
| **Tonight** 今夜 | "How much effort have you got?" → one hero suggestion, plus three alternates. Leftovers outrank cooking; picking a dish drops straight into cook mode. |
| **Week** 献立 | Meals-at-home stepper, variety setting, roll a week, the dish list, and the rhythm (Sunday batch / Wednesday top-up / rice runs). |
| **Shop** 買物 | The costed LIFE list by aisle, ticked off as you go, plus the one-time shelf top-ups and the price-tuning panel. |
| **Fridge** 冷蔵 | What is cooked and waiting, with a day counter per box. Eat one, bin it, or advance the clock. Also the container maths, reheating rules and the condiment shelf. |
| **Saved** 貯金 | Log the real receipt, watch the gap against ¥1,000 a meal outside. |

Cooking is a full-screen overlay: one step at a time, ending in "how many go in boxes?".
Whatever you answer lands in the Fridge, stamped with the day, and ages from there.
Dish details are a bottom sheet — facts, capacity warnings, per-serving ingredients,
protein swap, and the way into cook mode.

### The effort model

Every recipe carries `eff`: `0` zero effort (assembly or set-and-forget, ≤8 min, never
batched), `1` something quick (one pot, one wash), `2` batch day (the ≥20 min pot anchors,
`cap: 4`, `batch: true`). Tonight filters candidates by the tier you pick — except on batch
day, which leads with anchors but still shows everything else underneath. `test.js` enforces
the tier definitions, so adding a recipe means deciding honestly which one it is.

### The fridge clock

`S.day` is a manual counter, not a real clock: it starts at 0 and only moves when you tap
"pretend it's tomorrow". Everything dated reads from the same place — the Tonight header and
the savings log both use today's real date plus `S.day` — so they never disagree. Shelf life
is per dish: ground-meat dishes get 3 days, everything else 4.

## Files

- `index.html` — the whole app. No build, no dependencies, no framework. Vanilla JS,
  state in `localStorage` under the key `lmp`. Dark only.
- `test.js` — jsdom harness, 1758 assertions. **Keep it committed.** It has been lost
  twice with scratch folders.

State that persists: `owned locked bought protein log N v tab price mugi fridge day`.
State that deliberately does not (it resets on every load, so a crash mid-cook cannot
strand you): the effort answer, the hero index, the open sheet, cook mode and its step.

## Running the tests

```bash
mkdir -p ~/npmtest && cd ~/npmtest && npm i jsdom
cd /path/to/meal-planner
NODE_PATH=~/npmtest/node_modules node test.js
```

It boots the real `index.html` in jsdom, drives every screen, cooks every recipe end to
end, and checks the roster, the capacity rules, the effort tiers, food-safety wording, step
vocabulary, receipt prices, accessibility, and that a corrupt save heals instead of blanking
the page. Run it before every push.

## Deploying

GitHub Pages serves `main` directly, so a push is a deploy — roughly 60–90 seconds.
The web UI is the deploy path: **Add file → Upload files** on `main`, drop `index.html`
and `test.js`, commit directly to `main`.

## House rules for edits

- Recipe steps use the shopping-list English names (green onion, potato starch, bean
  sprouts). Loanwords that have no plain English equivalent stay: daikon, shimeji, miso,
  mirin, mentsuyu, hondashi, ponzu. `test.js` enforces this.
- Never let a value reach `S.protein`, `S.plan` or `S.fridge` that does not resolve in
  `ING` / `RECIPES`. A stale key used to persist to `localStorage` and blank the app on
  every subsequent load; the loader now sanitises every field the renderers touch, and the
  boot render has three recovery steps, each throwing away strictly more than the last.
- Anything destructive carries an undo in the toast — eating or binning a box, deleting a
  logged week, clearing the basket, rolling a new week, resetting prices. No exceptions.
- Tap targets stay at 44 px. Overlays stay modal: the page behind gets `inert`, the body
  stops scrolling, Escape backs out, focus moves in.
- Tier A dishes are the batch anchors: `cap: 4` and `batch: true`, always.
- Fridge claims stay at 3–4 days. Cooked ground meat never gets a longer claim.
- Air-fryer steps: one layer with gaps, preheat 3 min for skin or coating, never suggest
  aerosol oil spray (it strips the ceramic), and never exceed 200 °C.
- The Tonight and Week screens carry only what changes what you cook this week. Standing
  reference goes in a collapsed block, never an open card.
- Inline `onclick`/`ontoggle` handlers can only see globals, and the script's `let`
  bindings are not globals — write through a function (`setPriceOpen`), never assign.
