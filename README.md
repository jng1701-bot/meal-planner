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
| Tiger JAJ-A550 rice cooker (3-cup tacook) | 3 cups per run; 2 servings for cook-in dishes |
| Amazon Basics air fryer 4.2 L (1200 W, 60–200 °C, 60 min, ceramic non-stick) | 2 servings per basket; 1 for anything breaded |
| 0.8 L kettle, microwave, toaster | — |

Every recipe carries a `cap` = servings per cooking round on its gear. The cook view turns
that into "do N rounds back-to-back" rather than pretending one pan does everything.

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
- Fridge claims stay at 3–4 days. Cooked ground meat never gets a longer claim.
- Air-fryer steps: one layer with gaps, preheat 3 min for skin or coating, never suggest
  aerosol oil spray (it strips the ceramic), and never exceed 200 °C.
