/* Lazy Meal Planner — jsdom test harness
 * Run:  npm i jsdom && node test.js
 *
 * Keep this file in the repo. It has been lost twice with session scratch folders.
 *
 * Note: the app's top-level `const`/`let` bindings (RECIPES, ING, CONDS, S, ...)
 * are script-scoped and never land on `window`, so everything is reached through
 * global eval. Objects returned that way are live references, so mutating them
 * mutates the app's real state.
 */
const fs = require("fs");
const path = require("path");
const { JSDOM, VirtualConsole } = require("jsdom");

const HTML = path.join(__dirname, "index.html");
let pass = 0, fail = 0;
const fails = [];
function ok(name, cond, extra) {
  if (cond) pass++;
  else { fail++; fails.push(name + (extra !== undefined && extra !== "" ? "  [" + extra + "]" : "")); }
}
function eq(name, got, want) { ok(name, got === want, "got " + JSON.stringify(got) + " want " + JSON.stringify(want)); }

/* ---------- boot ---------- */
const consoleErrors = [];
const vc = new VirtualConsole();
vc.on("jsdomError", e => consoleErrors.push(String((e && e.message) || e)));
vc.on("error", (...a) => consoleErrors.push(a.join(" ")));

const dom = new JSDOM(fs.readFileSync(HTML, "utf8"), {
  runScripts: "dangerously",
  pretendToBeVisual: true,
  url: "https://localhost/",
  virtualConsole: vc
});
const W = dom.window;
const D = W.document;
const ev = expr => W.eval(expr);

ok("no script errors on load", consoleErrors.length === 0, consoleErrors.slice(0, 3).join(" | "));

const R = ev("RECIPES"), ING = ev("ING"), CONDS = ev("CONDS"), GEARICON = ev("GEARICON");
const S = ev("S"), EAT_OUT = ev("EAT_OUT");
ok("RECIPES reachable", Array.isArray(R));
ok("ING reachable", ING && typeof ING === "object");
ok("CONDS reachable", CONDS && typeof CONDS === "object");
ok("S reachable", S && typeof S === "object");

/* ---------- roster shape ---------- */
eq("roster count is 32", R.length, 32);
eq("unique ids", new Set(R.map(r => r.id)).size, R.length);

const TIERS = { A: 9, B: 4, C: 8, D: 6, E: 4, F: 1 };
const tierCount = R.reduce((a, r) => (a[r.tier] = (a[r.tier] || 0) + 1, a), {});
Object.entries(TIERS).forEach(([t, n]) => eq("tier " + t + " count", tierCount[t], n));
ok("no recipe missing a tier", R.every(r => "ABCDEF".includes(r.tier)));

["omurice", "katsu", "mapo", "stirfry", "oyakodon", "yakisoba", "chahan", "napolitan", "gyudon"]
  .forEach(id => ok("cut recipe absent: " + id, !R.some(r => r.id === id)));
["iwashi", "belachan", "beansoup", "butadon", "afroast", "afbreast", "afkatsu", "afgyoza", "aftofu"]
  .forEach(id => ok("added recipe present: " + id, R.some(r => r.id === id)));

/* ---------- per-recipe invariants ---------- */
R.forEach(r => {
  ok(r.id + ": has name", typeof r.n === "string" && r.n.length > 0);
  ok(r.id + ": has jp", typeof r.jp === "string" && r.jp.length > 0);
  ok(r.id + ": has time", typeof r.time === "string" && /\d/.test(r.time));
  ok(r.id + ": gear non-empty", Array.isArray(r.gear) && r.gear.length > 0);
  ok(r.id + ": gear known", r.gear.every(g => GEARICON[g]));
  ok(r.id + ": cap sane", r.cap === undefined || (Number.isInteger(r.cap) && r.cap >= 1 && r.cap <= 6));
  ok(r.id + ": steps >= 4", Array.isArray(r.steps) && r.steps.length >= 4);
  ok(r.id + ": ing resolve", r.ing.every(([i]) => ING[i]), r.ing.filter(([i]) => !ING[i]).join(","));
  ok(r.id + ": ing qty positive", r.ing.every(([, q]) => typeof q === "number" && q > 0));
  ok(r.id + ": conds resolve", r.conds.every(c => CONDS[c]), r.conds.filter(c => !CONDS[c]).join(","));
  ok(r.id + ": rice sane", r.rice === undefined || (r.rice > 0 && r.rice <= 2));
});

/* ---------- no orphaned pantry entries ---------- */
const usedIng = new Set(R.flatMap(r => r.ing.map(([i]) => i)));
Object.keys(ING).forEach(k => {
  if (k === "mugi") return; // driven by the toggle, not by any recipe
  ok("ING used: " + k, usedIng.has(k));
});
const usedCond = new Set(R.flatMap(r => r.conds));
Object.keys(CONDS).forEach(k => ok("COND used: " + k, usedCond.has(k)));

/* ---------- the effort brief ---------- */
const anchors = R.filter(r => r.tier === "A");
ok("every tier-A anchor is cap 4", anchors.every(r => r.cap === 4), anchors.filter(r => r.cap !== 4).map(r => r.id).join(","));
ok("every tier-A anchor is batchable", anchors.every(r => r.batch === true));
/* cap 1 = the tier-E escape hatch, plus breaded air-fryer work, which needs the basket to itself */
ok("no cap-1 recipe outside the escape hatch",
  R.filter(r => r.cap === 1).every(r => r.tier === "E" || r.gear.includes("air")),
  R.filter(r => r.cap === 1 && r.tier !== "E" && !r.gear.includes("air")).map(r => r.id).join(","));
ok("at least one legume recipe", R.some(r => r.ing.some(([i]) => i === "lentil" || i === "mixedbeans")));
ok("chicken breast is used", R.some(r => r.ing.some(([i]) => i === "chickenbreast")));
ok("beef is gone from the pantry", ING.beef === undefined);

/* ---------- step vocabulary rule ----------
 * Steps use the shopping-list English names; approved loanwords stay. */
const BANNED = [
  [/\bspring onion/i, "use 'green onion'"],
  [/\bscallion/i, "use 'green onion'"],
  [/\bkatakuriko\b/, "use 'potato starch'"],
  [/\bmoyashi\b/, "use 'bean sprouts'"],
  [/\bnegi\b/, "use 'green onion'"],
  [/\bcorn ?starch/i, "use 'potato starch'"]
];
R.forEach(r => r.steps.forEach((s, i) => {
  BANNED.forEach(([re, why]) => ok(r.id + " step" + (i + 1) + " vocab (" + why + ")", !re.test(s), s.slice(0, 60)));
}));

/* ---------- cook-in flag ---------- */
const cookin = R.filter(r => r.cookin).map(r => r.id).sort();
ok("cook-in set is the four rice-cooker dishes",
  JSON.stringify(cookin) === JSON.stringify(["hainan", "kimchirice", "takikomi", "tomatorice"]), cookin.join(","));
R.filter(r => r.cookin).forEach(r => ok(r.id + ": cook-in uses the rice cooker", r.gear.includes("rice")));

/* ---------- drive the UI ---------- */
function freshPlan() { S.plan = undefined; ev("plan(true)"); }
freshPlan();
ok("plan generated", Array.isArray(S.plan) && S.plan.length > 0);

["plan", "shop", "cook", "save"].forEach(t => {
  ev("setTab('" + t + "')");
  const el = D.getElementById("tab-" + t);
  ok("tab renders: " + t, el && el.innerHTML.trim().length > 50, el ? el.innerHTML.length : "missing");
  ok("no undefined leak in tab: " + t, el && !/undefined|NaN|\[object Object\]/.test(el.innerHTML));
});

/* ---------- compute() maths ---------- */
const c = ev("compute()");
ok("compute returns", !!c);
eq("servings sum to N", Object.values(c.servings).reduce((a, b) => a + b, 0), c.N);
ok("food cost positive", c.food > 0);
ok("every row costs > 0", c.rows.every(r => r.cost > 0));
ok("rice cups > 0", c.riceGo > 0);
ok("cost per meal beats the eat-out baseline", c.food / c.N < EAT_OUT, Math.round(c.food / c.N));

/* ---------- mochi-mugi toggle ---------- */
S.mugi = false; ev("save()");
const before = ev("compute()");
ok("barley absent when toggle off", !before.rows.some(r => r.id === "mugi"));
eq("mugiCups zero when off", before.mugiCups, 0);

S.mugi = true; ev("save()");
const after = ev("compute()");
const mugiRow = after.rows.find(r => r.id === "mugi");
const nonCookinCups = after.picks.reduce((a, r) => a + (r.cookin ? 0 : (r.rice || 0) * after.servings[r.id]), 0);
if (nonCookinCups > 0) {
  ok("barley row appears when toggle on", !!mugiRow);
  eq("mugiCups excludes cook-in dishes", after.mugiCups, nonCookinCups);
  ok("barley cost > 0", mugiRow && mugiRow.cost > 0);
  ok("toggle raises the bill", after.food > before.food);
} else {
  ok("no plain-rice dishes in this plan, barley correctly absent", !mugiRow);
}
eq("rice cups unchanged by the toggle", after.riceGo, before.riceGo);

ev("setTab('cook')");
ok("cook view explains the blend when on",
  /Mochi-mugi on/.test(D.getElementById("tab-cook").innerHTML) || after.mugiCups === 0);
S.mugi = false; ev("render()");
ok("cook view drops the blend note when off", !/Mochi-mugi on/.test(D.getElementById("tab-cook").innerHTML));

const m0 = S.mugi;
ev("toggleMugi()");
ok("toggleMugi flips state", S.mugi === !m0);
ev("toggleMugi()");
eq("toggleMugi round-trips", S.mugi, m0);

/* ---------- cook-in dishes never get barley ---------- */
S.mugi = true;
S.plan = ["hainan", "takikomi", "kimchirice", "tomatorice"];
const onlyCookin = ev("compute()");
eq("cook-in-only plan needs no barley", onlyCookin.mugiCups, 0);
ok("cook-in-only plan has no barley row", !onlyCookin.rows.some(r => r.id === "mugi"));
S.mugi = false;

/* ---------- price editing ----------
 * Pinned to a plan that definitely contains onion; a generated plan may not,
 * which made this assertion flaky. */
S.plan = ["curry"]; S.N = 4;
ok("pinned plan contains onion", ev("compute()").rows.some(r => r.id === "onion"));
const base = ev("compute()").food;
ev("setPrice('onion', 999)");
ok("price edit changes the bill", ev("compute()").food !== base);
ok("price edit is recorded", S.price.onion !== undefined);
S.price = {}; ev("save()");
eq("price reset restores the bill", ev("compute()").food, base);

/* ---------- every recipe survives a solo plan ---------- */
R.forEach(r => {
  S.plan = [r.id];
  S.N = Math.max(1, r.cap || 2);
  let c2 = null, threw = null;
  try { c2 = ev("compute()"); ev("render()"); } catch (e) { threw = e.message; }
  ok("solo plan computes: " + r.id, !threw && c2 && c2.food > 0, threw);
  const html = D.getElementById("tab-cook").innerHTML + D.getElementById("tab-shop").innerHTML;
  ok("solo plan renders clean: " + r.id, !/undefined|NaN|\[object Object\]/.test(html));
});

/* ---------- rice portion: 75 g dry per serving, cook-in dishes keep a full cup ---------- */
R.filter(r => r.rice !== undefined).forEach(r => {
  if (r.cookin) eq("cook-in keeps a full cup: " + r.id, r.rice, 1);
  else eq("standard portion is half a cup: " + r.id, r.rice, 0.5);
});
ok("no recipe still quotes 200 g cooked rice",
  !R.some(r => r.steps.some(s => /200 g cooked/.test(s))));
R.filter(r => r.cookin).forEach(r =>
  ok("cook-in still measures 150 g dry: " + r.id, r.steps.some(s => /150 g rice/.test(s))));

/* ---------- the real machine: Amazon Basics 4.2 L, 1200 W, 60-200 C ---------- */
const AIR = R.filter(r => r.gear.includes("air"));
eq("air-fryer roster size", AIR.length, 8);
ok("no air dish exceeds the 4.2 L basket", AIR.every(r => r.cap >= 1 && r.cap <= 2),
  AIR.filter(r => r.cap > 2).map(r => r.id).join(","));
ok("every air dish names a temperature", AIR.every(r => r.steps.some(s => /\d{2,3}\s*\u00b0C/.test(s))),
  AIR.filter(r => !r.steps.some(s => /\d{2,3}\s*\u00b0C/.test(s))).map(r => r.id).join(","));
ok("no air dish asks for more than 200 C", !AIR.some(r => r.steps.some(s => {
  const m = s.match(/(\d{2,3})\s*\u00b0C/g) || [];
  return m.some(x => parseInt(x, 10) > 200);
})));
ok("breaded dishes get the basket to themselves", R.filter(r => r.conds.includes("panko")).every(r => r.cap === 1));
ok("no recipe tells you to spray aerosol oil into the basket",
  !R.some(r => r.steps.some(s => /spray/i.test(s) && !/never (aerosol )?spray/i.test(s))));

/* ---------- the one-time container kit is bought and gone ---------- */
ok("KIT catalogue removed", ev("typeof KIT") === "undefined");
ok("toggleKit removed", ev("typeof toggleKit") === "undefined");
ok("S.kit is not initialised", S.kit === undefined);
S.plan = ["curry"]; S.N = 4;
ev("setTab('shop')");
ok("shop view no longer sells containers",
  !/Meal-prep kit|Daiso/.test(D.getElementById("tab-shop").innerHTML));
{
  /* a save from the version that had the kit must not throw or resurrect it */
  S.kit = { main600: true };
  let threw = null;
  try { ev("render()"); } catch (e) { threw = e.message; }
  ok("a legacy S.kit in an old save is inert", !threw, threw);
  ok("legacy kit does not render", !/Meal-prep kit/.test(D.getElementById("tab-shop").innerHTML));
  delete S.kit;
}

ev("setTab('cook')");
const cookHTML = () => D.getElementById("tab-cook").innerHTML;
ok("cook view states the machine", /Amazon Basics 4.2 L/.test(cookHTML()));
ok("cook view gives the reheat split", /Reheat wet/.test(cookHTML()) && /Reheat crisp/.test(cookHTML()));

/* the measurements outlive the shopping list - they say which box a portion goes in */
ok("portioning rule kept: the 600 mL box", /600 mL box/.test(cookHTML()));
ok("portioning rule kept: the rice pot", /355 ml one-bowl pot/.test(cookHTML()));
ok("portioning rule kept: the volumes", /400\u2013430 ml/.test(cookHTML()));
ok("portioning rule kept: how many of each", /Four boxes and three rice pots/.test(cookHTML()));

/* clutter budget: advice that does not change what you do this week stays out */
{
  S.plan = ["udon", "curry"]; S.N = 4; ev("render()");
  const cook = cookHTML(), shop = D.getElementById("tab-shop").innerHTML;
  ok("no kettle tip", !/Boil the 0.8 L kettle/.test(cook));
  ok("no permanent tap-a-step hint", !/Tap a step to check it off/.test(cook));
  ok("no tacook side-dish aside", !/tacook plate steams/.test(cook));
  ok("no belachan flavour aside in shop", !/Your stash/.test(shop));
  ok("the reference row is collapsed, not a stack of open cards",
    /<details[^>]*>\s*<summary>[^<]*Air fryer, reheating and portioning/.test(cook));
  ok("the tips that change what you cook are still there",
    /rounds back-to-back|only works one serving at a time/.test(
      (function () { S.plan = ["afkatsu"]; S.N = 3; ev("render()"); return cookHTML(); })()));
}

/* a cap-1 dish must warn about rounds in the schedule, not only inside the recipe */
S.plan = ["afkatsu"]; S.N = 3; ev("render()");
ok("schedule warns when a cap-1 dish is planned more than once",
  /quick rounds back-to-back/.test(cookHTML()));
ok("no plural-of-one grammar in the schedule", !/~1 servings per run/.test(cookHTML()));

/* ---------- air-fryer capacity is fixed per recipe (stepper removed) ---------- */
ok("stepAir is gone", ev("typeof stepAir") === "undefined");
ok("capOf ignores any saved aircap", R.filter(r => r.gear.includes("air"))
  .every(r => ev("capOf(RECIPES.find(x=>x.id==='" + r.id + "'))") === r.cap));
S.aircap = 6; // a legacy value from an older save must not change anything
ok("legacy aircap is inert", R.filter(r => r.gear.includes("air"))
  .every(r => ev("capOf(RECIPES.find(x=>x.id==='" + r.id + "'))") === r.cap));
delete S.aircap;
ev("setTab('cook')");
ok("cook view no longer offers an air-fryer stepper",
  !/Air fryer fits/.test(D.getElementById("tab-cook").innerHTML));

/* ---------- barley cost tracks the smaller portion ---------- */
S.plan = ["curry"]; S.N = 4; S.mugi = false;
const plainFood = ev("compute()").food;
S.mugi = true;
const mugiFood = ev("compute()").food;
const perServing = (mugiFood - plainFood) / 4;
ok("barley adds roughly ¥20 a serving, not ¥40", perServing > 8 && perServing < 32, Math.round(perServing));
ok("mugi card copy no longer claims ¥40", !/about ¥40 a serving/.test(D.body.innerHTML));
S.mugi = false;

/* ---------- state survives a reload ---------- */
S.plan = ["curry", "keema"]; S.mugi = true; S.N = 7; ev("save()");
const raw = W.localStorage.getItem("lmp");
ok("state persisted", !!raw);
const parsed = JSON.parse(raw || "{}");
eq("mugi persisted", parsed.mugi, true);
ok("plan persisted", Array.isArray(parsed.plan) && parsed.plan.length === 2);


/* ---------- protein swap: a stale key here blanks the whole app ---------- */
const MEATCYCLE = ev("MEATCYCLE");
ok("every MEATCYCLE entry exists in the pantry", MEATCYCLE.every(k => ING[k]),
  MEATCYCLE.filter(k => !ING[k]).join(","));
R.filter(r => r.flex).forEach(r => {
  S.plan = [r.id]; S.N = r.cap || 2; delete S.protein[r.id];
  let threw = null;
  for (let i = 0; i < MEATCYCLE.length + 2; i++) {
    try { ev("cycleProtein('" + r.id + "')"); ev("compute()"); ev("render()"); }
    catch (e) { threw = e.message; break; }
  }
  ok("protein cycle survives a full loop: " + r.id, !threw, threw);
  ok("protein swap resolves in the pantry: " + r.id,
    S.protein[r.id] === undefined || !!ING[S.protein[r.id]], S.protein[r.id]);
  delete S.protein[r.id];
});

/* a save poisoned by an older build must heal on load, not blank the page */
{
  const poisoned = JSON.stringify({ plan: ["curry"], N: 4, protein: { curry: "beef" }, tab: "plan" });
  const bootErrors = [];
  const vc2 = new VirtualConsole();
  vc2.on("jsdomError", e => bootErrors.push(String((e && e.message) || e)));
  const d2 = new JSDOM(fs.readFileSync(HTML, "utf8"), {
    runScripts: "dangerously", pretendToBeVisual: true, url: "https://localhost/", virtualConsole: vc2,
    beforeParse(w) { w.localStorage.setItem("lmp", poisoned); }
  });
  ok("poisoned save boots without error", bootErrors.length === 0, bootErrors[0]);
  const plan2 = d2.window.document.getElementById("tab-plan");
  ok("poisoned save still renders the plan tab", plan2 && plan2.innerHTML.trim().length > 50);
  eq("poisoned protein key is dropped on load", d2.window.eval("S.protein.curry"), undefined);
  d2.window.close();
}

/* ---------- pan reality ---------- */
R.filter(r => r.gear.includes("pan") && (r.cap || 0) > 2).forEach(r =>
  ok("pan dish above cap 2 warns about crowding: " + r.id, !!r.crowd));
{
  const bd = R.find(r => r.id === "butadon");
  S.plan = ["butadon"]; S.N = 4; ev("render()");
  ok("brim-full pan warning reaches the cook view",
    /brim-full in a 26 cm pan/.test(D.getElementById("tab-cook").innerHTML));
  ok("butadon is flagged, not mislabelled as searing", bd.crowd === "full");
}

/* ---------- leftovers must not outlive food safety ---------- */
ok("no step claims a week in the fridge",
  !R.some(r => r.steps.some(s => /a week in the fridge|keeps a week/i.test(s))),
  R.filter(r => r.steps.some(s => /a week in the fridge|keeps a week/i.test(s))).map(r => r.id).join(","));

/* ---------- every air dish tells you how to know it is cooked ---------- */
{
  const DONE = /juices (run )?clear|no pink|75 °C|flakes apart|blistered gold|golden and firm|deep gold|chopstick slides/i;
  const air = R.filter(r => r.gear.includes("air"));
  ok("every air dish has a doneness cue", air.every(r => r.steps.some(s => DONE.test(s))),
    air.filter(r => !r.steps.some(s => DONE.test(s))).map(r => r.id).join(","));
}

/* ---------- max-batch mode should not pick a 2-serving basket ---------- */
{
  S.locked = []; S.N = 7; S.v = 1;
  const batchCaps = R.filter(r => r.batch).map(r => r.cap || 0);
  const best = Math.max(...batchCaps);
  let low = [];
  for (let i = 0; i < 60; i++) {
    S.plan = undefined; ev("plan(true)");
    S.plan.map(id => R.find(r => r.id === id)).forEach(r => { if ((r.cap || 0) < best) low.push(r.id); });
  }
  ok("v=1 picks the largest-capacity batch dish", low.length === 0, [...new Set(low)].join(","));
  S.v = 2;
}

/* ---------- accessibility: focus survives a re-render, Japanese is tagged ---------- */
{
  S.plan = ["curry"]; S.N = 4; S.bought = {}; ev("setTab('shop')");
  const row = D.querySelector('#tab-shop [data-k]');
  ok("shopping rows carry a stable focus key", !!row);
  if (row) {
    const key = row.getAttribute("data-k");
    row.focus();
    ev("render()");
    const now = D.activeElement;
    ok("focus survives a re-render", !!now && now.getAttribute && now.getAttribute("data-k") === key,
      now && now.getAttribute ? String(now.getAttribute("data-k")) : "body");
  }
  const jp = [...D.querySelectorAll(".jp")];
  ok("Japanese text is present to tag", jp.length > 0);
  ok("every .jp is marked lang=ja", jp.every(el => el.getAttribute("lang") === "ja"),
    jp.filter(el => el.getAttribute("lang") !== "ja").length + " untagged");
}

/* ---------- shelf prices are the ones on the LIFE receipt, 2026-09-05 ---------- */
eq("mirin is hon-mirin, not the mirin-style seasoning", CONDS.mirin.jp, "本みりん 1L");
eq("mirin priced from the receipt", CONDS.mirin.p, 416);
eq("cooking sake priced from the receipt", CONDS.sake.p, 225);
eq("garlic priced from the receipt", CONDS.garlic.p, 376);
eq("ginger priced from the receipt", CONDS.ginger.p, 376);
ok("garlic and ginger are the value bottles, not tubes",
  /お徳用/.test(CONDS.garlic.jp) && /お徳用/.test(CONDS.ginger.jp));

/* ---------- bottles dispense by spoon; no step may still measure a tube ---------- */
ok("no recipe step mentions a tube",
  !R.some(r => r.steps.some(s => /tube/i.test(s))),
  R.filter(r => r.steps.some(s => /tube/i.test(s))).map(r => r.id).join(","));
{
  const DOSE = /\d\s*cm\s*(squeeze\s*)?(of\s*)?(each\s*)?(garlic|ginger)/i;
  ok("no step doses garlic or ginger in centimetres",
    !R.some(r => r.steps.some(s => DOSE.test(s))),
    R.filter(r => r.steps.some(s => DOSE.test(s))).map(r => r.id).join(","));
}
{
  const users = R.filter(r => r.conds.includes("garlic") || r.conds.includes("ginger"));
  ok("every garlic/ginger dish gives a spoon measure",
    users.every(r => r.steps.some(s => /tsp[^.]{0,30}(garlic|ginger) paste/i.test(s))),
    users.filter(r => !r.steps.some(s => /tsp[^.]{0,30}(garlic|ginger) paste/i.test(s))).map(r => r.id).join(","));
}
/* knife measurements in cm are untouched - they are not doses */
ok("knife cuts still measured in cm", R.some(r => r.steps.some(s => /\d\s*cm (chunks|cubes|strips|half-moons|pieces|slabs)/.test(s))));

/* ---------- report ---------- */
console.log("\n" + "=".repeat(52));
console.log("  PASS " + pass + "   FAIL " + fail + "   (" + (pass + fail) + " assertions)");
console.log("=".repeat(52));
if (fail) {
  console.log("\nFailures:");
  fails.forEach(f => console.log("  x " + f));
  process.exit(1);
}
console.log("  All green.\n");
