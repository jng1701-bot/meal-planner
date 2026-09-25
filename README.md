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

## Sourced roster, veg floor and the fridge check (25 Sep 2026)

- **45 dishes**, each checked against a published recipe (`src`: Kikkoman, Ajinomoto, NHK
  きょうの料理, 白ごはん.com, クラシル, DELISH KITCHEN, ニチレイ, COSORI, Just One Cookbook…),
  linked from the dish sheet. Only the chinchalok omelette and packet gyoza are house recipes.
  New: chikuzenni (frozen root-veg mix), chicken minestrone, chilli con carne, miso pork &
  cabbage, chicken & broccoli oyster stir-fry, oyakodon, yaki udon. Retired: bean soup,
  eggplant dengaku, yaki-onigiri (no protein).
- **Veg floor**: `vegOf(r)` ≥ 150 g a serving for batch dishes, ≥ 100 g for quick ones
  (Japan's 350 g/day, a third a meal). Potato is the carb, not a veg. Where an appliance cannot
  carry that much (the tacook plate), the dish gets an "At each meal" microwave side of frozen
  spinach or broccoli — fixed per-bowl text, never multiplied by the batch.
- **Carb portion**: a potato-carb dish carries ≥ 180 g potato; `PC_G.potato` is 130 g (a LIFE
  男爵 from the bag of 4). The roast is 1½ potatoes a serving, so 4 servings = 6 potatoes.
- **Fridge check**: the first roll of a week opens "What's in the fridge?" (meat, chilled,
  produce; tap for a bit / plenty, amounts in `FRIDGE_Q`). Answers replace the carry ledger in
  grams or pieces, flagged `f:true`. Stated perishables (meat, chilled, ≤5-day produce, or
  plenty of anything) are **must-use**: a dish is built around each before the rest are drawn;
  everything else gets a `carryBoost`. The list subtracts what is there. Re-rolls within 3 days
  do not ask again; "Fridge check" on Week reopens it.

## Flow after the 25 Sep audit

- **One servings answer.** `sessionServ(r, c)` is what one cooking session makes: the week's
  servings for a batch, what keeps for a raw-freeze batch bigger than its fridge life, one for
  anything cooked fresh. The rhythm rows (Cook ×N), the dish sheet and Tonight all use it.
- **Rice runs** are listed run by run (≤3 cups each), each tied to a cook day that exists.
- **Cooked, not counted.** Finishing the wizard on a batch records `S.cooked[id] = {d, serv}`.
  Tonight then leads Zero effort / Something quick with "Reheat the …" until the fridge life
  runs out (or "Finished them"), and stops offering to cook it again. No box counts, by design.
  A new week (fridge check) clears it.
- **New week = fridge check.** It clears last week's basket ticks and cooked marks. Untouched
  chips keep the real leftover amount; "Nothing to use up" empties the ledger.
- Units: rice is always "cup (合)", 150 g dry (`RICE_G`); the plate rule lives once in `PLATE_RULE`.

## Save format and tests (tidy-up, 25 Sep 2026)

- `S.schema` (now 2) and an append-only `MIGRATIONS` list replace the ad-hoc seeding flags; saves
  from before versioning are placed by `shelfSeeded`/`stockSeeded`. Add a migration, bump `SCHEMA`.
- One fraction formatter, `frac(x, snap)`: honest decimals for leftovers, kitchen fractions for
  recipe quantities.
- The Saved tab's button says how many meals it credits ("Log · 7 meals").
- test.js runs in Asia/Tokyo with a seeded `Math.random` (`SEED=n` to vary it) and resets S/U at
  the start of every section; the keep-days and local-date tests use fixed expectations, not
  copies of the app's formulas.

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
pack, when tapped out. The cook schedule still counts cups. Leftovers carry over in their own
unit (pieces or grams): when a week is rolled, each item that was bought (ticked, or on an
untouched list that is at least two days old by `S.planDate` — a Sunday re-roll spree banks
nothing) settles the ledger `have + bought − required` (pieces rounded up, grams in the list's
50 g steps; gram scraps under 20 g are dropped) into `S.carry` with a local date. The weekly
fridge check then shows that ledger and whatever he confirms replaces it (`f:true`). The next
list subtracts it ("1 pc · have ½", "buy at least 450 g · have 300 of 750"),
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
- `S.carry` holds pantry ids (pieces or grams) with a positive amount and a local `YYYY-MM-DD`;
  anything else is dropped by `loadState()`, and expired entries at boot and at the top of
  `render()`. `compute()` is pure — it never changes state.
- A roll banks leftovers only for rows that were bought; an item left unticked while others
  were ticked banks nothing. Undo after any roll — including a fridge check, a meal-count step
  or a variety change — restores `snapshot()`: plan, ticks, carry, dates, N, variety, recents.
- A carried piece comes off the count before rounding; a row covered to within 0.05 is omitted.
- Every recipe states `ready` (minutes to the table, side rice excluded). Tonight shows it.
- Shelf life: cooked meat and fish 3 days, everything else 4, eat-now dishes `keep: 1`. Any
  "keeps N days" in the steps must match `keepDaysOf` — the test enforces it.
- No mackerel in the roster.
- `fitsWeek(r, N, v)` decides what may be planned: short weeks cook fresh, max batch needs a
  batchable dish, a dish covering more meals than it keeps must freeze, and `minServ` must fit.
  `stepMeals` reshuffles whenever the dish count or any dish stops fitting — unless the week is
  already shopped (anything ticked): then the dishes stay, servings respread, and the toast
  offers **Replan**. A variety change on a shopped week does nothing until Replan is tapped.
- An unfinished cook is saved as `S.cooking` and resumes after a reload; Quit mid-recipe has Undo.
- Re-rolling keeps basket ticks for items still on the list. A blank price input is "no change".
- Another tab saving reloads this one (unless mid-cook or mid-typing) instead of overwriting it;
  until that reload (`STALE`), `save()` writes only this tab's unfinished cook into the other save.
- One sanitiser, `loadState(raw)`, serves boot and every tier of the crash recovery.
- Air-fryer steps: preheat 3 min for skin or coating, one layer with gaps, never aerosol oil
  spray, never over 200 °C.
