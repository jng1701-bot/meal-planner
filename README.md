# Lazy Meal Planner

A single-file meal planner for one person cooking Japanese home food in Tokyo with a
deliberately minimal kitchen. Generates a week of dishes, a costed LIFE shopping list,
a cook schedule that respects what the gear can actually hold, and a savings log.

**Live:** https://jng1701-bot.github.io/meal-planner/

## The kitchen it is built around

| Gear | Working limit |
|---|---|
| 18 cm pot (~2 L) | 4 stew servings, or 2 one-pot pasta/udon |
| 26 cm frying pan | 2 servings per round before it steams instead of sears |
| Tiger JAJ-A550 rice cooker (3-cup tacook) | 3 cups per run; 2 cups with the cooking plate in; 2 servings for cook-in and plate dishes; 4 for a simmer-menu braise |
| Amazon Basics air fryer 4.2 L (1200 W, 60–200 °C, 60 min, ceramic non-stick) | 2 servings per basket; 1 for anything breaded |
| 0.8 L kettle, microwave, toaster | — |
| Storage: 4 × 600 mL boxes, 3 × 355 ml rice pots | one serving per box; peak 3 boxes in circulation |

Every recipe carries a `cap` = servings per cooking round on its gear. The cook view turns
that into "do N rounds back-to-back" rather than pretending one pan does everything.

### The rice cooker is a cooker

The JAJ-A550 is a tacook model, so it is not just a rice pot, and the roster uses four
different things it does. Recipes are flagged accordingly:

| Flag | What it means | Rule |
|---|---|---|
| `cookin` | seasoned rice cooked with its ingredients (takikomi, chahan, risotto) | never combine with the plate |
| `plate` | a dish steamed on the cooking plate above the rice | plain rice underneath only, 2 cups max |
| `simmer` | a braise on the simmer menu, no rice in the pot | fill well under the max line |
| none | rice is just a side | `rice: 0.5` |

Tiger's own guidance for non-rice cooking sets the hard limits, and the recipes follow it:
no roux, starch or other thickener during a cycle (thickened liquid foams, foam blocks the
steam vent), dairy only after the cycle on residual heat, no foil or bags inside, easy on
the oil, wooden paddle only. Seasoned rice under the cooking plate welds itself to the
plate's underside, which is why `cookin` and `plate` are mutually exclusive — `test.js`
enforces that.

Container counts come from the same logic. Simulated against the app's own Sunday/Wednesday
batch schedule, a default week (7 meals, 2–3 dishes) peaks at 3 main containers in
circulation, so four covers it with one in the sink. Rice pots are set by how many portions
you freeze per cooker run: 1.5 cups twice a week needs three, one 3-cup run needs five. Only
"1 dish, max batch" mode needs seven mains. Portion volumes: curry, keema and nikujaga
400–430 ml, tonjiru and bean soup ~520 ml, nabe ~600 ml — which is why 600 mL is one size for
everything, and why rice keeps its own 355 ml pot.

## Files

- `index.html` — the whole app. No build, no dependencies, no framework. Vanilla JS,
  state in `localStorage` under the key `lmp`.
- `test.js` — jsdom harness, 1567 assertions. **Keep it committed.** It has been lost
  twice with scratch folders.

## Running the tests

```bash
mkdir -p ~/npmtest && cd ~/npmtest && npm i jsdom
cd /path/to/meal-planner
NODE_PATH=~/npmtest/node_modules node test.js
```

It boots the real `index.html` in jsdom, drives the UI, and checks the roster, the
capacity rules, food-safety wording, step vocabulary, accessibility, and that a corrupt
save heals instead of blanking the page. Run it before every push.

## Deploying

GitHub Pages serves `main` directly, so a push is a deploy — roughly 60–90 seconds.
The web UI is the deploy path: **Add file → Upload files** on `main`, drop `index.html`
and `test.js`, commit directly to `main`.

## House rules for edits

- Recipe steps use the shopping-list English names (green onion, potato starch, bean
  sprouts). Loanwords that have no plain English equivalent stay: daikon, shimeji, miso,
  mirin, mentsuyu, hondashi, ponzu. `test.js` enforces this.
- Never let a value reach `S.protein` or `S.plan` that does not resolve in `ING` /
  `RECIPES`. A stale key used to persist to `localStorage` and blank the app on every
  subsequent load; the loader now sanitises and the boot render has a recovery path.
- Tier A dishes are the batch anchors: `cap: 4` and `batch: true`, always.
- `eff: 2` means the dish yields 4+ servings from one session: `batch` and `cap >= 4`. It
  normally also means 20+ minutes, but an appliance dish is exempt, because 8 minutes of prep
  and an hour of the cooker doing the waiting is a better batch day than standing over a pot.
- Condiments are a one-time shelf, not a weekly cost. `SHELF_SEED` stocks them on first load
  and only fills keys that were never set, so "I have run out of this" survives. If a bottle
  starts being re-billed every week, that is the bug, not the recipe.
- Dish selection is weighted, not sorted (`dishWeight` / `pickWeighted`). The air fryer and
  rice cooker carry `APPLIANCE_BIAS` because they cost real money; capacity is a weight in
  max-batch mode rather than a ranking, because sorting by it collapsed the whole mode onto
  nine pot dishes; `S.recent` damps anything picked in the last dozen slots.
- Anything the week actually consumes belongs in `compute()`, including rice. A price of 0
  is legal and means "given to me" — it is not nonsense input.
- Fridge claims stay at 3–4 days. Cooked ground meat never gets a longer claim.
- Air-fryer steps: one layer with gaps, preheat 3 min for skin or coating, never suggest
  aerosol oil spray (it strips the ceramic), and never exceed 200 °C.
