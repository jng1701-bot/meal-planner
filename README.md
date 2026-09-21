# Lazy Meal Planner

A single-file meal planner for one person cooking Japanese home food in Tokyo with a
deliberately minimal kitchen. It generates a week of dishes, a costed LIFE shopping list,
a cook schedule that works with what the gear can actually hold, a step-by-step cook mode
with quantities scaled to the batch, and a savings log.

**Live:** https://jng1701-bot.github.io/meal-planner/

Tabs: **Tonight** (how much effort have you got?) · **Week** (dishes, the rhythm, the rules) ·
**Shop** (list, shelf, prices) · **Saved**. The Fridge tab was removed on 17 Sep 2026.

## The kitchen it is built around

| Gear | Working limit | Source |
|---|---|---|
| 18 cm pot | **1,600 ml** to 1.5 cm below the rim (8.1 cm deep) | measured, 17 Sep 2026 |
| 26 cm frying pan | 2 servings per round before it steams instead of sears | — |
| Tiger JAJ-A550 rice cooker (3-cup tacook) | white/quick 3 go · cook-in 2 · fried rice 2 · **risotto 1** · plate 0.5–1 go · simmer between the 1 and 3 marks | manual P.30, P.17, P.19 |
| Air fryer, Amazon Basics 4.2 L (1200 W, 60–200 °C) | ~315 cm² basket floor, one layer | measured against dish size |
| Storage: 4 × 600 mL boxes, 3 × 355 ml rice pots | one serving per box | — |

Rice cooker times (manual P.9): white 42–52 min, quick 20–40, cook-in 41–55, risotto 24–34,
fried rice 34–45.

## Capacity is derived, not asserted

`cap` has been wrong four times, every time because a wanted outcome picked the number. Now:

- **Pot dishes** carry `liquid` (ml per serving). `potMl` = solids by weight + liquid, and
  `cap = floor(POT_ML / potMl)`, clamped by `capMax`. Anything in `after` (roux, toppings) is
  left out because it goes in once the volume has cooked down. With the measured pot, the stews
  make **3**, not 4. Change `POT_ML` and every pot cap follows.
- **Cooking-plate dishes** stay within the 1-go rice limit, spread in one layer
  (`loadOf ≤ PLATE_G`), and lift the plate out when it beeps — never keep warm with it in.
- **Cook-in rice** names its `menu`; rice × cap stays inside that menu's limit, and extras stay
  under Tiger's ~70 g per cup. The protein-heavy seasoned rices broke that 2–3×, so they became
  plate dishes: plain rice under the plate, the topping folded through afterwards (mazegohan).
- **Simmer dishes** declare `mlPerServing`, a timer value, and `minServ` so the fewest servings
  still clear the bottom mark.
- **Air-fryer dishes** carry `cm2` per serving (in `AIR_CM2`); `cm2 × cap ≤ BASKET_CM2`. Twelve
  gyoza or six wings fill the floor, so those are one serving a round.

Work out what fits before deciding what you want to fit.

## Cook-day workflow

- **Servings follow the gear.** `compute()` moves servings between dishes whenever that
  cuts the total number of rounds. Seven meals over curry and karaage cook as 3 curry (one pot)
  + 4 karaage (two baskets) = 3 rounds, where an even 4 + 3 would take 4.
- **The rhythm pairs the appliances.** Sunday/Wednesday rows say what the rice cooker does
  while the anchor cooks (rice on first, or rice before a cooker braise) and what to marinate
  for later. The rice line counts only side rice; dishes that make their own rice say so.
- **Cook mode opens on "Before you start":** a servings stepper, the rounds, minutes to the
  table, and a rice-first line timed against the dish ("start prepping in about 15 min"), with
  frozen rice as the way out.
- **Quantities scale.** Step text carries braced quantities — `{150 g}`, `{15 ml}`, `{1 tsp}`,
  `{0.5 onion}`, `{1 potato|potatoes}` — rendered by `stepText(r, i, n)`. Frying oil, "cover by
  2 cm" and per-bowl seasonings stay outside braces because they do not grow with the batch.
- **Rounds:** each round shows "round k of n · ×s" with that round's amounts. Air-fryer prep
  (cutting, marinating, coating) is done once for the whole batch; only the steps from the
  preheat on repeat.

## Stock and leftovers

Rice and mochi-mugi are bought by the bag (`STOCK`), so they never appear as weekly grocery
rows: they sit on the shelf beside the condiments and only reach the list, as one bag or one
pack, when tapped out. The cook schedule still counts cups. Leftover pieces carry over: when a
week is rolled, each piece-unit item that was bought (ticked, or on an untouched list that is at
least two days old by `S.planDate` — a Sunday re-roll spree banks nothing) settles the ledger
`have + ceil(to buy) − required` into `S.carry` with a local date; the next list subtracts it ("1 pc · have ½"),
drops a fully covered row, and the planner favours dishes that use it up (`CARRY_BOOST`). A
"have" chip on any piece row banks the whole requirement on the spot. Entries expire after
`CARRY_DAYS`.

## Files

- `index.html` — the whole app. No build, no dependencies. Vanilla JS, state in
  `localStorage` under the key `lmp`.
- `test.js` — jsdom harness, ~3,015 assertions. **Keep it committed.** It has been lost twice.

## Running the tests

```bash
mkdir -p ~/npmtest && cd ~/npmtest && npm i jsdom
cd /path/to/meal-planner
NODE_PATH=~/npmtest/node_modules node test.js
```

Text checks run on rendered step text (`TXT(r)`), never on the braced templates.

## Deploying

GitHub Pages serves `main`, so a push is a deploy (~60–90 s). Web UI: **Add file → Upload
files** on `main`, drop `index.html`, `test.js` and `README.md`, commit.

## House rules for edits

- Recipe steps use the shopping-list English names (green onion, potato starch, bean
  sprouts). Loanwords stay: daikon, shimeji, miso, mirin, mentsuyu, hondashi, ponzu.
- Never let a value reach `S.protein` or `S.plan` that does not resolve. The loader sanitises;
  the boot render has a three-step recovery path.
- **Protein swaps are whole cuts only** (`MEATCYCLE = chicken, pork`). Mince dishes are not
  flex: chunks cannot become meatballs or soboro, and poached mince is not a dish.
- `eff: 2` means a batch anchor: `batch` and `cap >= 3`.
- Condiments are a one-time shelf (`SHELF_SEED`), shown on Shop. If a bottle is re-billed every
  week, that is the bug.
- Selection is weighted, not sorted (`dishWeight` / `pickWeighted`).
- Anything the week consumes belongs in `compute()`. A price of 0 means "given to me".
- Rice and barley are `STOCK`, not grocery rows: while `S.owned[id]` is true they are silent,
  and the weekly food figure never includes a bag. Out of stock shows exactly one row, in the
  shelf top-up, and ticking it restocks.
- `S.carry` holds only piece-unit ids with a positive count and a local `YYYY-MM-DD`; anything
  else is dropped at boot, and expired entries are dropped at boot and in `compute()`.
- A roll banks leftovers only for rows that were bought; an item left unticked while others
  were ticked banks nothing. New-week Undo restores plan, ticks and carry together.
- A carried piece comes off the count before rounding; a row covered to within 0.05 is omitted.
- Every recipe states `ready` (minutes to the table, side rice excluded). Tonight shows it.
- Shelf life: cooked meat and fish 3 days, everything else 4, eat-now dishes `keep: 1`. Any
  "keeps N days" in the steps must match `keepDaysOf` — the test enforces it.
- No mackerel in the roster.
- `fitsWeek(r, N, v)` decides what may be planned: short weeks cook fresh, max batch needs a
  batchable dish, a dish covering more meals than it keeps must freeze, and `minServ` must fit.
  `stepMeals` reshuffles whenever the dish count or any dish stops fitting.
- An unfinished cook is saved as `S.cooking` and resumes after a reload; Quit mid-recipe has Undo.
- Re-rolling keeps basket ticks for items still on the list. A blank price input is "no change".
- Another tab saving reloads this one (unless mid-cook or mid-typing) instead of overwriting it.
- Air-fryer steps: preheat 3 min for skin or coating, one layer with gaps, never aerosol oil
  spray, never over 200 °C.
