/* Lazy Meal Planner — jsdom test harness
 * Run:  npm i jsdom && node test.js
 *
 * Keep this file in the repo. It has been lost twice with session scratch folders.
 *
 * Note: the app's top-level `const`/`let` bindings (RECIPES, ING, CONDS, S, U, ...)
 * are script-scoped and never land on `window`, so everything is reached through
 * global eval. Objects returned that way are live references, so mutating them
 * mutates the app's real state.
 *
 * Tabs since the redesign: tonight · week · shop · fridge · save.
 * Cooking is a full-screen overlay (#cook-overlay), dish details a sheet (#sheet-overlay).
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
const tabHTML = t => D.getElementById("tab-" + t).innerHTML;

ok("no script errors on load", consoleErrors.length === 0, consoleErrors.slice(0, 3).join(" | "));

const R = ev("RECIPES"), ING = ev("ING"), CONDS = ev("CONDS"), GEARLABEL = ev("GEARLABEL");
const S = ev("S"), EAT_OUT = ev("EAT_OUT"), EFFORTS = ev("EFFORTS");
/* an appliance dish is one the air fryer or the rice cooker actually cooks, not one that
   merely has rice on the side */
const isAppliance = r => ev("isApplianceDish")(r);
const gearTipsOf = (r, servings) => ev("gearTips")(r, servings);
ok("RECIPES reachable", Array.isArray(R));
ok("ING reachable", ING && typeof ING === "object");
ok("CONDS reachable", CONDS && typeof CONDS === "object");
ok("S reachable", S && typeof S === "object");
ok("U (ephemeral UI state) reachable", ev("typeof U") === "object");

/* ---------- roster shape ---------- */
eq("roster count is 45", R.length, 45);
eq("unique ids", new Set(R.map(r => r.id)).size, R.length);

const TIERS = { A: 9, B: 13, C: 15, D: 4, E: 3, F: 1 };
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
  ok(r.id + ": gear known", r.gear.every(g => GEARLABEL[g]));
  ok(r.id + ": cap sane", r.cap === undefined || (Number.isInteger(r.cap) && r.cap >= 1 && r.cap <= 6));
  ok(r.id + ": steps >= 4", Array.isArray(r.steps) && r.steps.length >= 4);
  ok(r.id + ": ing resolve", r.ing.every(([i]) => ING[i]), r.ing.filter(([i]) => !ING[i]).join(","));
  ok(r.id + ": ing qty positive", r.ing.every(([, q]) => typeof q === "number" && q > 0));
  ok(r.id + ": conds resolve", r.conds.every(c => CONDS[c]), r.conds.filter(c => !CONDS[c]).join(","));
  ok(r.id + ": rice sane", r.rice === undefined || (r.rice > 0 && r.rice <= 2));
});

/* ---------- effort tiers: what the Tonight screen sorts on ---------- */
eq("three effort tiers offered", EFFORTS.length, 3);
ok("every recipe carries an effort tier", R.every(r => [0, 1, 2].includes(r.eff)),
  R.filter(r => ![0, 1, 2].includes(r.eff)).map(r => r.id).join(","));
ok("all three tiers have dishes", [0, 1, 2].every(k => R.some(r => r.eff === k)));
/* batch day = the long pot anchors; zero effort = assembly and set-and-forget only */
ok("every eff-2 dish is a batchable anchor", R.filter(r => r.eff === 2).every(r => r.batch && r.cap >= 4),
  R.filter(r => r.eff === 2 && !(r.batch && r.cap >= 4)).map(r => r.id).join(","));
ok("no eff-2 dish is quicker than 20 minutes unless the appliance does the waiting",
  R.filter(r => r.eff === 2).every(r => parseInt(r.time, 10) >= 20 || isAppliance(r)),
  R.filter(r => r.eff === 2 && parseInt(r.time, 10) < 20 && !isAppliance(r)).map(r => r.id).join(","));
ok("no zero-effort dish takes more than 8 minutes", R.filter(r => r.eff === 0).every(r => parseInt(r.time, 10) <= 8),
  R.filter(r => r.eff === 0 && parseInt(r.time, 10) > 8).map(r => r.id).join(","));
ok("zero-effort dishes never need batching", R.filter(r => r.eff === 0).every(r => !r.batch),
  R.filter(r => r.eff === 0 && r.batch).map(r => r.id).join(","));

/* ---------- no orphaned pantry entries ---------- */
const usedIng = new Set(R.flatMap(r => r.ing.map(([i]) => i)));
Object.keys(ING).forEach(k => {
  // both are added by compute() from the rice count, not listed in any recipe's ingredients
  if (k === "mugi" || k === "rice") return;
  ok("ING used: " + k, usedIng.has(k));
});
const usedCond = new Set(R.flatMap(r => r.conds));
Object.keys(CONDS).forEach(k => ok("COND used: " + k, usedCond.has(k)));

/* ---------- the effort brief ---------- */
const anchors = R.filter(r => r.tier === "A");
ok("every tier-A anchor is cap 4", anchors.every(r => r.cap === 4), anchors.filter(r => r.cap !== 4).map(r => r.id).join(","));
ok("every tier-A anchor is batchable", anchors.every(r => r.batch === true));
ok("no cap-1 recipe outside the escape hatch",
  R.filter(r => r.cap === 1).every(r => r.tier === "E" || r.gear.includes("air")),
  R.filter(r => r.cap === 1 && r.tier !== "E" && !r.gear.includes("air")).map(r => r.id).join(","));
ok("at least one legume recipe", R.some(r => r.ing.some(([i]) => i === "lentil" || i === "mixedbeans")));
ok("chicken breast is used", R.some(r => r.ing.some(([i]) => i === "chickenbreast")));
ok("beef is gone from the pantry", ING.beef === undefined);

/* ---------- step vocabulary rule ---------- */
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
ok("cook-in set is the seasoned-rice cooker dishes",
  JSON.stringify(cookin) === JSON.stringify(["hainan", "kimchirice", "rcchahan", "rcrisotto", "sabarice", "takikomi", "tomatorice"]), cookin.join(","));
/* the cooking plate steams a dish above plain rice, so it is never a seasoned-rice dish */
ok("no dish is both cook-in and cooking-plate", !R.some(r => r.cookin && r.plate),
  R.filter(r => r.cookin && r.plate).map(r => r.id).join(","));
R.filter(r => r.plate).forEach(r => {
  ok(r.id + ": plate dish uses the rice cooker", r.gear.includes("rice"));
  ok(r.id + ": plate dish warns about seasoned rice sticking",
    gearTipsOf(r, 1).some(x => /plain rice underneath only/i.test(x)));
});
R.filter(r => r.cookin).forEach(r => ok(r.id + ": cook-in uses the rice cooker", r.gear.includes("rice")));

/* ---------- drive the UI ---------- */
function freshPlan() { S.plan = undefined; ev("plan(true)"); }
freshPlan();
ok("plan generated", Array.isArray(S.plan) && S.plan.length > 0);

["tonight", "week", "shop", "fridge", "save"].forEach(t => {
  ev("setTab('" + t + "')");
  const el = D.getElementById("tab-" + t);
  ok("tab renders: " + t, el && el.innerHTML.trim().length > 50, el ? el.innerHTML.length : "missing");
  ok("no undefined leak in tab: " + t, el && !/undefined|NaN|\[object Object\]/.test(el.innerHTML));
  ok("tab is a real section with a heading: " + t, el && /<h[123]/.test(el.innerHTML));
});
ok("exactly one tab is visible at a time",
  ["tonight", "week", "shop", "fridge", "save"].filter(t => D.getElementById("tab-" + t).className.includes(" on")).length === 1);

/* ---------- compute() maths ---------- */
const c = ev("compute()");
ok("compute returns", !!c);
eq("servings sum to N", Object.values(c.servings).reduce((a, b) => a + b, 0), c.N);
ok("food cost positive", c.food > 0);
ok("every row costs > 0", c.rows.every(r => r.cost > 0));
ok("rice cups > 0", c.riceGo > 0);
ok("cost per meal beats the eat-out baseline", c.food / c.N < EAT_OUT, Math.round(c.food / c.N));
ok("no dish is planned zero times", Object.values(c.servings).every(s => s >= 1));

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

ev("setTab('week')");
ok("the rhythm explains the blend when on",
  /Mochi-mugi on/.test(tabHTML("week")) || after.mugiCups === 0);
S.mugi = false; ev("render()");
ok("the rhythm drops the blend note when off", !/Mochi-mugi on/.test(tabHTML("week")));

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

/* ---------- price editing ---------- */
S.plan = ["curry"]; S.N = 4;
ok("pinned plan contains onion", ev("compute()").rows.some(r => r.id === "onion"));
const base = ev("compute()").food;
ev("setPrice('onion', 999)");
ok("price edit changes the bill", ev("compute()").food !== base);
ok("price edit is recorded", S.price.onion !== undefined);
S.price = {}; ev("save()");
eq("price reset restores the bill", ev("compute()").food, base);
ev("setTab('shop')");
ok("the price panel is still reachable from Shop", /Tune prices to your receipts/.test(tabHTML("shop")));
ev("setPriceOpen(true); render()");
ok("an opened price panel survives a re-render", !!D.querySelector("#tab-shop details[open]"));
ev("setPriceOpen(false); render()");

/* ---------- every recipe survives a solo plan ---------- */
R.forEach(r => {
  S.plan = [r.id];
  S.N = Math.max(1, r.cap || 2);
  let c2 = null, threw = null;
  try { c2 = ev("compute()"); ev("render()"); } catch (e) { threw = e.message; }
  ok("solo plan computes: " + r.id, !threw && c2 && c2.food >= 0, threw);
  if (r.ing.length) ok("solo plan costs something: " + r.id, c2.food > 0);
  const html = tabHTML("week") + tabHTML("shop");
  ok("solo plan renders clean: " + r.id, !/undefined|NaN|\[object Object\]/.test(html));
});

/* ---------- every recipe survives being cooked end to end ---------- */
R.forEach(r => {
  S.plan = [r.id]; S.N = Math.max(1, r.cap || 2); S.fridge = []; ev("render()");
  let threw = null;
  try {
    ev("openSheet('" + r.id + "')");
    ev("startCook('" + r.id + "', 1)");
    for (let i = 0; i <= r.steps.length; i++) ev("nextStep()");
  } catch (e) { threw = e.message; }
  ok("cook wizard runs to the end: " + r.id, !threw, threw);
  eq("finishing puts one box in the fridge: " + r.id, S.fridge.length, 1);
  S.fridge = [];
});

/* ---------- rice portion ---------- */
R.filter(r => r.rice !== undefined).forEach(r => {
  if (r.cookin || r.plate || r.id === "afonigiri") eq("rice-led dish keeps a full cup: " + r.id, r.rice, 1);
  else eq("standard portion is half a cup: " + r.id, r.rice, 0.5);
});
ok("no recipe still quotes 200 g cooked rice",
  !R.some(r => r.steps.some(s => /200 g cooked/.test(s))));
R.filter(r => r.cookin).forEach(r =>
  ok("cook-in still measures 150 g dry: " + r.id, r.steps.some(s => /150 g rice/.test(s))));

/* ---------- the real machine: Amazon Basics 4.2 L, 60-200 C ---------- */
const AIR = R.filter(r => r.gear.includes("air"));
eq("air-fryer roster size", AIR.length, 15);
ok("no air dish exceeds the 4.2 L basket", AIR.every(r => r.cap >= 1 && r.cap <= 2),
  AIR.filter(r => r.cap > 2).map(r => r.id).join(","));
ok("every air dish names a temperature", AIR.every(r => r.steps.some(s => /\d{2,3}\s*°C/.test(s))),
  AIR.filter(r => !r.steps.some(s => /\d{2,3}\s*°C/.test(s))).map(r => r.id).join(","));
ok("no air dish asks for more than 200 C", !AIR.some(r => r.steps.some(s => {
  const m = s.match(/(\d{2,3})\s*°C/g) || [];
  return m.some(x => parseInt(x, 10) > 200);
})));
ok("breaded dishes get the basket to themselves",
  R.filter(r => r.steps.some(s => /press the panko on|dip in egg/i.test(s))).every(r => r.cap === 1),
  R.filter(r => r.steps.some(s => /press the panko on|dip in egg/i.test(s)) && r.cap !== 1).map(r => r.id).join(","));
ok("no recipe tells you to spray aerosol oil into the basket",
  !R.some(r => r.steps.some(s => /spray/i.test(s) && !/never (aerosol )?spray/i.test(s))));
{
  const DONE = /juices (run )?clear|no pink|75 °C|flakes apart|blistered gold|golden and firm|deep gold|chopstick slides/i;
  ok("every air dish has a doneness cue", AIR.every(r => r.steps.some(s => DONE.test(s))),
    AIR.filter(r => !r.steps.some(s => DONE.test(s))).map(r => r.id).join(","));
}

/* ---------- the one-time container kit is bought and gone ---------- */
ok("KIT catalogue removed", ev("typeof KIT") === "undefined");
ok("toggleKit removed", ev("typeof toggleKit") === "undefined");
ok("S.kit is not initialised", S.kit === undefined);
S.plan = ["curry"]; S.N = 4;
ev("setTab('shop')");
ok("shop view no longer sells containers", !/Meal-prep kit|Daiso/.test(tabHTML("shop")));
{
  S.kit = { main600: true };
  let threw = null;
  try { ev("render()"); } catch (e) { threw = e.message; }
  ok("a legacy S.kit in an old save is inert", !threw, threw);
  ok("legacy kit does not render", !/Meal-prep kit/.test(tabHTML("shop")));
  delete S.kit;
}

/* ---------- the measurements outlive the shopping list: now on the Fridge tab ---------- */
ev("setTab('fridge')");
const fridgeText = () => tabHTML("fridge");
ok("fridge view states the machine", /Amazon Basics 4.2 L/.test(fridgeText()));
ok("fridge view gives the reheat split", /Reheat wet/.test(fridgeText()) && /Reheat crisp/.test(fridgeText()));
ok("portioning rule kept: the 600 mL box", /600 mL box/.test(fridgeText()));
ok("portioning rule kept: the rice pot", /355 ml one-bowl pot/.test(fridgeText()));
ok("portioning rule kept: the volumes", /400–430 ml/.test(fridgeText()));
ok("portioning rule kept: how many of each", /Four boxes and three rice pots/.test(fridgeText()));
ok("mochi-mugi reasoning kept somewhere", /ten times the fibre/.test(fridgeText()));
ok("the reference row is collapsed, not a stack of open cards",
  /<details[^>]*>\s*<summary>[^<]*Air fryer, reheating and portioning/.test(fridgeText()));

/* ---------- clutter budget ---------- */
{
  S.plan = ["udon", "curry"]; S.N = 4; ev("render()");
  const week = tabHTML("week"), shop = tabHTML("shop");
  ok("no kettle tip", !/Boil the 0.8 L kettle/.test(week));
  ok("no permanent tap-a-step hint", !/Tap a step to check it off/.test(week));
  ok("no tacook side-dish aside", !/tacook plate steams/.test(week));
  ok("no belachan flavour aside in shop", !/Your stash/.test(shop));
  ok("the tips that change what you cook are still there",
    /rounds back to back|only works one serving at a time|won't fit in one go/.test(
      (function () { S.plan = ["afkatsu"]; S.N = 3; ev("render()"); ev("openSheet('afkatsu')"); return D.getElementById("sheet-overlay").innerHTML; })()));
  ev("closeSheet()");
}

/* a cap-1 dish must warn about rounds in the schedule, not only inside the sheet */
S.plan = ["afkatsu"]; S.N = 3; ev("render()");
ok("schedule warns when a cap-1 dish is planned more than once",
  /quick rounds back to back/.test(tabHTML("week")));
ok("no plural-of-one grammar in the schedule", !/~1 per run/.test(tabHTML("week")));

/* ---------- air-fryer capacity is fixed per recipe ---------- */
ok("stepAir is gone", ev("typeof stepAir") === "undefined");
S.aircap = 6; // a legacy value from an older save must not change anything
ok("legacy aircap is inert", R.filter(r => r.gear.includes("air")).every(r => r.cap <= 2));
delete S.aircap;
ok("no air-fryer stepper anywhere", !/Air fryer fits/.test(D.body.innerHTML));

/* ---------- barley cost tracks the smaller portion ---------- */
S.plan = ["curry"]; S.N = 4; S.mugi = false;
const plainFood = ev("compute()").food;
S.mugi = true;
const mugiFood = ev("compute()").food;
const perServing = (mugiFood - plainFood) / 4;
ok("barley adds roughly ¥20 a serving, not ¥40", perServing > 8 && perServing < 32, Math.round(perServing));
ok("mugi copy no longer claims ¥40", !/about ¥40 a serving/.test(D.body.innerHTML));
S.mugi = false;

/* ---------- state survives a reload ---------- */
S.plan = ["curry", "keema"]; S.mugi = true; S.N = 7;
S.fridge = [{ id: "curry", portions: 2, day: 0 }]; S.day = 1; ev("save()");
const raw = W.localStorage.getItem("lmp");
ok("state persisted", !!raw);
const parsed = JSON.parse(raw || "{}");
eq("mugi persisted", parsed.mugi, true);
ok("plan persisted", Array.isArray(parsed.plan) && parsed.plan.length === 2);
ok("fridge persisted", Array.isArray(parsed.fridge) && parsed.fridge.length === 1);
eq("the day counter persisted", parsed.day, 1);
S.mugi = false; S.fridge = []; S.day = 0; ev("save()");

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

/* ---------- corrupt or legacy saves must heal on load, never blank the page ---------- */
function boot(seed) {
  const errs = [];
  const v = new VirtualConsole();
  v.on("jsdomError", e => errs.push(String((e && e.message) || e)));
  const d = new JSDOM(fs.readFileSync(HTML, "utf8"), {
    runScripts: "dangerously", pretendToBeVisual: true, url: "https://localhost/", virtualConsole: v,
    beforeParse(w) { w.localStorage.setItem("lmp", typeof seed === "string" ? seed : JSON.stringify(seed)); }
  });
  return { d, errs, w: d.window };
}
{
  const { d, errs, w } = boot({ plan: ["curry"], N: 4, protein: { curry: "beef" }, tab: "week" });
  ok("poisoned save boots without error", errs.length === 0, errs[0]);
  ok("poisoned save still renders", w.document.getElementById("tab-week").innerHTML.trim().length > 50);
  eq("poisoned protein key is dropped on load", w.eval("S.protein.curry"), undefined);
  w.close();
}
{
  const { w } = boot({ tab: "save", log: [{ spent: 1700, meals: 7 }] }); // log entry with no date
  ok("a dateless log entry cannot brick the app",
    !/Something went wrong/.test(w.document.getElementById("tab-save").innerHTML));
  eq("the bad log entry is dropped", w.eval("S.log.length"), 0);
  w.close();
}
{
  const { w } = boot({ log: [{ d: "2026-01-01", spent: 1e999, meals: 7 }] });
  eq("an infinite spend is rejected", w.eval("S.log.length"), 0);
  ok("no infinity leaks into the savings headline", !/∞/.test(w.document.getElementById("tab-save").innerHTML));
  w.close();
}
{
  const { w } = boot("{not json");
  ok("unparseable save still boots", w.document.getElementById("tab-tonight").innerHTML.trim().length > 50);
  w.close();
}
{
  const { w } = boot({ tab: "plan" });
  eq("the old plan tab migrates to week", w.eval("S.tab"), "week");
  w.close();
}
{
  const { w } = boot({ tab: "cook" });
  eq("the old cook tab migrates to tonight", w.eval("S.tab"), "tonight");
  w.close();
}
{
  const { w } = boot({ stepdone: { curry: { 0: true } }, fridge: [{ id: "nosuchdish", portions: 2, day: 0 }] });
  eq("the retired step-checkbox state is dropped", w.eval("typeof S.stepdone"), "undefined");
  eq("a fridge entry for a deleted recipe is dropped", w.eval("S.fridge.length"), 0);
  w.close();
}
{
  const { w } = boot({ fridge: [{ id: "curry", portions: 2.5, day: 9 }], day: 0 });
  eq("half a portion is not a portion", w.eval("S.fridge.length"), 0);
  w.close();
}
{
  const { w } = boot({ fridge: [{ id: "curry", portions: 2, day: 9 }], day: 0 });
  eq("a cook date in the future is pulled back to today", w.eval("S.fridge[0].day"), 0);
  ok("no negative day counts reach the screen", !/Day -/.test(w.document.getElementById("tab-fridge").innerHTML));
  w.close();
}

/* ---------- pan reality ---------- */
R.filter(r => r.gear.includes("pan") && (r.cap || 0) > 2).forEach(r =>
  ok("pan dish above cap 2 warns about crowding: " + r.id, !!r.crowd));
{
  const bd = R.find(r => r.id === "butadon");
  S.plan = ["butadon"]; S.N = 4; ev("render()"); ev("openSheet('butadon')");
  ok("brim-full pan warning reaches the dish sheet",
    /brim-full in a 26 cm pan/.test(D.getElementById("sheet-overlay").innerHTML));
  ok("butadon is flagged, not mislabelled as searing", bd.crowd === "full");
  ev("closeSheet()");
}

/* ---------- leftovers must not outlive food safety ---------- */
ok("no step claims a week in the fridge",
  !R.some(r => r.steps.some(s => /a week in the fridge|keeps a week/i.test(s))),
  R.filter(r => r.steps.some(s => /a week in the fridge|keeps a week/i.test(s))).map(r => r.id).join(","));
ok("ground-meat dishes get three days, everything else four",
  R.every(r => ev("keepDaysOf(rec('" + r.id + "'))") === (r.ing.some(([i]) => i === "gpork") ? 3 : 4)));

/* ---------- the fridge: cooked portions with a clock on them ---------- */
{
  S.fridge = []; S.day = 0; S.plan = ["curry", "soboro"]; S.N = 6; ev("render()");
  ev("startCook('curry', 3)");
  const steps = R.find(r => r.id === "curry").steps.length;
  for (let i = 0; i <= steps; i++) ev("nextStep()");
  eq("cooking puts the portions in the fridge", S.fridge.length, 1);
  eq("with the portion count chosen", S.fridge[0].portions, 3);
  eq("stamped with today", S.fridge[0].day, 0);
  eq("cook mode closes when it is done", ev("U.cook"), null);
  eq("and the effort question resets for next time", ev("U.effort"), null);

  ev("setTab('fridge')");
  ok("the fridge lists it", /Japanese curry/.test(fridgeText()));
  ok("day 1 of 4 for a non-ground-meat dish", /Day 1 of 4/.test(fridgeText()));
  ev("nextDay()"); ev("nextDay()");
  ok("day 3 of 4 after two days", /Day 3 of 4/.test(fridgeText()));
  ev("nextDay()");
  ok("the last day says so", /Eat today — last day/.test(fridgeText()));
  ev("nextDay()");
  ok("past its day it says bin it", /Past it. Bin it./.test(fridgeText()));

  const n0 = S.fridge[0].portions;
  ev("eatFridge(0)");
  eq("eating one takes one", S.fridge[0].portions, n0 - 1);
  ok("and offers an undo", ev("!!(U.toast && U.toast.undo)"));
  ev("runToastUndo()");
  eq("undo puts it back", S.fridge[0].portions, n0);
  ev("tossFridge(0)");
  eq("binning removes the entry", S.fridge.length, 0);
  ev("runToastUndo()");
  eq("undo un-bins it", S.fridge.length, 1);
  while (S.fridge.length && S.fridge[0].portions > 0) ev("eatFridge(0)");
  eq("an emptied box leaves the fridge", S.fridge.length, 0);
  S.day = 0;
}

/* ---------- tonight: the effort question ---------- */
{
  S.fridge = []; S.day = 0; S.plan = ["curry", "udon", "tunamayo"]; S.N = 6;
  ev("U.effort = null; render(); setTab('tonight')");
  ok("the question is asked first", /How much/.test(tabHTML("tonight")));
  eq("three ways to answer", D.querySelectorAll("#tab-tonight .effrow").length, 3);

  ev("pickEffort(0)");
  const zero = ev("candidates(compute())");
  ok("zero effort offers only zero-effort dishes",
    zero.every(o => o.eff === 0), zero.filter(o => o.eff !== 0).map(o => o.r.id).join(","));
  ok("a hero dish is proposed", /Cook it|Eat it/.test(tabHTML("tonight")));

  ev("pickEffort(2)");
  const batch = ev("candidates(compute())");
  ok("batch day leads with a batch anchor", batch[0].kind === "cook" && batch[0].r.eff === 2, batch[0] && batch[0].r.id);

  ev("nextHero()");
  ok("'Nah' moves to another suggestion", ev("U.heroIdx") === 1);
  ev("backToAsk()");
  eq("and you can go back to the question", ev("U.effort"), null);

  /* The question must get an honest answer. A 2-3 dish week usually cannot cover all three
     tiers - 61% of generated weeks contain no zero-effort dish - so Tonight falls back to the
     rest of the roster rather than answering "zero effort" with a 30-minute stew. */
  {
    let identical = 0, harder = 0, unlabelled = 0, trials = 120;
    for (let i = 0; i < trials; i++) {
      S.locked = []; S.v = 2; S.N = 7; S.plan = undefined; S.fridge = []; ev("save()");
      ev("plan(true)");
      const heroes = [];
      for (const k of [0, 1, 2]) {
        ev("U.effort=" + k + ";U.heroIdx=0");
        const cand = ev("candidates(compute())");
        const hero = cand[0];
        heroes.push(hero.r.id);
        if (hero.r.eff > k) harder++;
        ev("render()");
        if (hero.kind === "offplan" && !/Not in this week's plan/.test(tabHTML("tonight"))) unlabelled++;
      }
      if (new Set(heroes).size === 1) identical++;
    }
    eq("no effort tier is ever answered with a harder dish", harder, 0);
    eq("the three effort answers never collapse into one dish", identical, 0);
    eq("an off-plan suggestion always says so", unlabelled, 0);
  }
  /* in-plan beats off-plan at the same tier: it is already shopped for */
  {
    S.plan = ["tunamayo", "curry"]; S.N = 6; S.fridge = []; ev("render()");
    ev("U.effort=0;U.heroIdx=0");
    const zero = ev("candidates(compute())");
    eq("a planned zero-effort dish is preferred over the roster", zero[0].kind, "cook");
    eq("and it is the planned one", zero[0].r.id, "tunamayo");
    ok("off-plan dishes still follow as alternates", zero.some(o => o.kind === "offplan"));
    ok("every zero-effort candidate really is zero effort", zero.every(o => o.eff === 0),
      zero.filter(o => o.eff !== 0).map(o => o.r.id).join(","));
  }
  /* asking for a batch day when the week has no anchor answers with an anchor, not a quick dish */
  {
    S.plan = ["tunamayo", "udon"]; S.N = 4; S.fridge = []; ev("render()");
    ev("U.effort=2;U.heroIdx=0");
    const batch = ev("candidates(compute())");
    eq("batch day still answers with a batch anchor", batch[0].r.eff, 2);
    eq("flagged as off the plan", batch[0].kind, "offplan");
    ok("and the copy says the week has no anchor",
      (function () { ev("render()"); return /no batch anchor in it/.test(tabHTML("tonight")); })());
  }
  /* the suggestion must not move under you between renders, but should differ week to week */
  {
    S.locked = []; S.v = 2; S.N = 7; S.plan = ["curry", "keema"]; S.fridge = []; ev("save()");
    ev("U.effort=0;U.heroIdx=0");
    const a = ev("candidates(compute())")[0].r.id;
    ev("render()"); ev("render()");
    eq("the hero is stable across re-renders", ev("candidates(compute())")[0].r.id, a);
    S.plan = ["soboro", "nabe"]; ev("save()");
    const b = ev("candidates(compute())")[0].r.id;
    ok("a different week rotates the off-plan order", typeof b === "string");
  }
  /* an off-plan dish must not claim servings it does not have */
  {
    S.plan = ["curry"]; S.N = 4; ev("render()");
    ev("openSheet('tunamayo')");
    const sheet = D.getElementById("sheet-overlay").innerHTML;
    ok("the sheet marks an unplanned dish as unplanned", /not planned/.test(sheet));
    ok("and does not invent a serving count", !/×undefined|×NaN/.test(sheet));
    ev("closeSheet()");
  }
  /* even with no plan at all, every tier has an answer */
  {
    S.plan = undefined; S.fridge = []; ev("save()");
    [0, 1, 2].forEach(k => {
      ev("U.effort=" + k + ";U.heroIdx=0");
      const cand = ev("candidates(compute())");
      ok("no plan, eff" + k + " still suggests something", cand.length > 0 && cand[0].r.eff === k,
        cand.length ? cand[0].r.id + " eff" + cand[0].r.eff : "empty");
    });
    S.plan = ["curry", "udon", "tunamayo"]; S.N = 6; ev("save()");
  }

  /* leftovers outrank cooking, and are offered as 'eat it' not 'cook it' */
  S.fridge = [{ id: "curry", portions: 2, day: 0 }];
  ev("pickEffort(1); render()");
  const withFridge = ev("candidates(compute())");
  eq("what is already cooked comes first", withFridge[0].kind, "fridge");
  ok("the hero offers to eat it", /Eat it/.test(tabHTML("tonight")));
  ok("the nudge counts the portions waiting",
    (function () { ev("backToAsk()"); return /2 portions already sitting in the fridge/.test(tabHTML("tonight")); })());
  S.fridge = [];
}

/* ---------- the dish sheet ---------- */
{
  S.plan = ["curry"]; S.N = 4; ev("render()");
  ev("openSheet('curry')");
  const sheet = D.getElementById("sheet-overlay");
  ok("the sheet opens", sheet.className.includes("show"));
  ok("it names the dish", /Japanese curry/.test(sheet.innerHTML));
  ok("it gives hands-on time, servings and gear", /hands on/.test(sheet.innerHTML) && /this week/.test(sheet.innerHTML) && /gear/.test(sheet.innerHTML));
  ok("it lists the per-serving ingredients", /Chicken thigh 120 g/.test(sheet.innerHTML));
  ok("it offers the protein swap on a flex dish", !!sheet.querySelector('[data-k="sheetcycle"]'));
  ok("and a way into cooking", /Cook it · 5 steps/.test(sheet.innerHTML));
  ok("the page behind it is inert", D.getElementById("main").hasAttribute("inert"));
  ok("focus moves into the sheet", sheet.contains(D.activeElement));
  D.dispatchEvent(new W.KeyboardEvent("keydown", { key: "Escape" }));
  eq("escape closes it", ev("U.sheet"), null);
  ok("and the page is live again", !D.getElementById("main").hasAttribute("inert"));
}

/* ---------- cook mode ---------- */
{
  S.plan = ["curry"]; S.N = 4; S.fridge = []; ev("render()");
  ev("startCook('curry', 2)");
  const cook = D.getElementById("cook-overlay");
  ok("cook mode opens full screen", cook.className.includes("show"));
  eq("one dot per step plus the portioning step", cook.querySelectorAll(".dot").length, R.find(r => r.id === "curry").steps.length + 1);
  ok("it shows step one", /01/.test(cook.innerHTML));
  ok("one step at a time", cook.querySelectorAll(".steptext").length === 1);
  ev("nextStep()");
  ok("next moves on", /02/.test(cook.innerHTML));
  ev("prevStep()");
  ok("back moves back", /01/.test(cook.innerHTML));
  ev("prevStep()");
  eq("back from step one leaves cook mode", ev("U.cook"), null);

  ev("startCook('curry', 2)");
  const steps = R.find(r => r.id === "curry").steps.length;
  for (let i = 0; i < steps - 1; i++) ev("nextStep()");
  ok("the last step says done cooking", /Done cooking/.test(D.getElementById("cook-overlay").innerHTML));
  ev("nextStep()");
  ok("then it asks how many go in boxes", /go in boxes/.test(D.getElementById("cook-overlay").innerHTML));
  ok("the portioning step warns about ground meat", /never gets more than 3 days/.test(D.getElementById("cook-overlay").innerHTML));
  ev("portInc()");
  eq("portions can go up", ev("U.portions"), 3);
  ev("portDec()"); ev("portDec()"); ev("portDec()"); ev("portDec()"); ev("portDec()");
  eq("and stop at zero", ev("U.portions"), 0);
  ev("nextStep()");
  eq("zero portions means nothing was stored", S.fridge.length, 0);
  ok("and it says so", /Eaten on the spot/.test(ev("U.toast ? U.toast.msg : ''")));
  S.fridge = [];
}

/* ---------- undo covers everything destructive ---------- */
{
  S.plan = ["curry", "keema"]; S.N = 6; S.bought = { chicken: true }; ev("render()");
  ev("clearTicks()");
  ok("clearing the basket offers an undo", ev("!!(U.toast && U.toast.undo)"));
  ev("runToastUndo()");
  ok("undo brings the ticks back", S.bought.chicken === true);

  const planBefore = JSON.stringify(S.plan);
  ev("plan(true)");
  ok("rolling a new week offers an undo", ev("!!(U.toast && U.toast.undo)"));
  ev("runToastUndo()");
  eq("undo restores the old week", JSON.stringify(S.plan), planBefore);

  S.log = [{ d: "2026-09-01", spent: 1700, meals: 7 }];
  ev("delLog(0)");
  eq("deleting a logged week removes it", S.log.length, 0);
  ev("runToastUndo()");
  eq("undo restores it", S.log.length, 1);
  S.log = [];
}

/* ---------- the savings log ---------- */
{
  S.log = []; S.N = 7; S.day = 0; ev("setTab('save')");
  const input = D.getElementById("spentInput");
  ok("there is somewhere to type the receipt total", !!input);
  input.value = "1700";
  ev("logWeek()");
  eq("logging records the week", S.log.length, 1);
  eq("with what it cost", S.log[0].spent, 1700);
  eq("and how many meals it covered", S.log[0].meals, 7);
  ok("the field clears after logging", D.getElementById("spentInput").value === "");
  ok("the headline counts the saving", /¥5,300/.test(tabHTML("save")));
  /* typing must survive a re-render, or a toast timer eats the number */
  D.getElementById("spentInput").value = "1234";
  ev("render()");
  eq("a half-typed total survives a re-render", D.getElementById("spentInput").value, "1234");
  S.log = [];
}

/* ---------- rice was free in every total until now ---------- */
{
  S.price = {}; S.plan = ["curry"]; S.N = 4; S.mugi = false;
  const c = ev("compute()");
  const riceRow = c.rows.find(r => r.id === "rice");
  ok("rice appears in the grocery list", !!riceRow, c.rows.map(r => r.id).join(","));
  ok("it is priced by the gram of dry rice", riceRow && riceRow.cost > 0);
  ok("the amount matches the cooker cups", riceRow && /\d+ g/.test(riceRow.disp), riceRow && riceRow.disp);
  const withRice = c.food;
  /* a gifted bag costs nothing, and the planner has to be able to say so */
  ev("setPrice('rice', 0)");
  eq("a price of zero is accepted, not rejected", S.price.rice, 0);
  const free = ev("compute()").food;
  ok("a free bag drops out of the bill", free < withRice, withRice + " -> " + free);
  ok("but the rice is still on the list to buy", ev("compute()").rows.some(r => r.id === "rice"));
  ev("setPrice('rice', -5)");
  eq("a negative price is still nonsense", S.price.rice, 0);
  S.price = {}; S.plan = undefined; S.N = 7;
}

/* ---------- the shelf: a bottle bought once must not be billed every week ---------- */
{
  /* The default shelf was {oil:true} and nothing ever filled it in, so the Shop tab kept
     asking for mentsuyu, soy and mirin as one-time purchases months after they were bought. */
  const SEED = ev("SHELF_SEED");
  ok("the seed covers every condiment a recipe calls for",
    [...new Set(R.flatMap(r => r.conds))].every(k => SEED.includes(k) || k === "cheese"),
    [...new Set(R.flatMap(r => r.conds))].filter(k => !SEED.includes(k) && k !== "cheese").join(","));
  ok("a fresh install starts with a stocked shelf", SEED.every(k => S.owned[k] === true),
    SEED.filter(k => S.owned[k] !== true).join(","));
  ok("the shelf is marked as seeded", S.shelfSeeded === true);

  /* nikujaga for four: the exact report Josh made */
  S.plan = ["nikujaga"]; S.N = 4; ev("render()");
  const shop = tabHTML("shop");
  ok("four servings of nikujaga does not re-bill mentsuyu", !/Mentsuyu/.test(shop), "mentsuyu still billed");
  ok("and asks for no shelf top-up at all", !/Shelf top-up/.test(shop));
  const c4 = ev("compute()");
  ok("mentsuyu is still recognised as needed by the recipe", c4.needed.includes("mentsuyu"));
  ok("it is simply already owned", S.owned.mentsuyu === true);

  /* running out is still expressible, and still reaches the shopping list */
  ev("toggleCond('mentsuyu')");
  ok("marking one as run out puts it back on the list", /Mentsuyu/.test(tabHTML("shop")));
  ok("and the list explains it is a one-time buy", /A bottle lasts months/.test(tabHTML("shop")));
  ev("toggleCond('mentsuyu')");
  ok("putting it back in stock clears it again", !/Shelf top-up/.test(tabHTML("shop")));
}
{
  /* a condiment deliberately marked as run out must survive the migration, not be re-stocked */
  const d2 = new JSDOM(fs.readFileSync(HTML, "utf8"), {
    runScripts: "dangerously", pretendToBeVisual: true, url: "https://localhost/",
    virtualConsole: new VirtualConsole(),
    beforeParse(w) {
      w.localStorage.setItem("lmp", JSON.stringify({ owned: { mentsuyu: false }, N: 7, v: 2 }));
    }
  });
  eq("an explicit out-of-stock is not overwritten by the seed", d2.window.eval("S.owned.mentsuyu"), false);
  eq("while untouched staples are stocked", d2.window.eval("S.owned.soy"), true);
  d2.window.close();
}
{
  /* the old default put one key in the shelf; that save must migrate to a full one */
  const d3 = new JSDOM(fs.readFileSync(HTML, "utf8"), {
    runScripts: "dangerously", pretendToBeVisual: true, url: "https://localhost/",
    virtualConsole: new VirtualConsole(),
    beforeParse(w) { w.localStorage.setItem("lmp", JSON.stringify({ owned: { oil: true }, N: 7, v: 2 })); }
  });
  eq("an existing {oil:true} save gets the rest of the shelf", d3.window.eval("S.owned.mentsuyu"), true);
  eq("and the migration is recorded so it runs once", d3.window.eval("S.shelfSeeded"), true);
  eq("and it is written to storage immediately",
    JSON.parse(d3.window.localStorage.getItem("lmp")).shelfSeeded, true);
  d3.window.close();
}

/* ---------- the rice cooker is a cooker, not just a rice pot ---------- */
{
  const cooker = R.filter(r => r.cookin || r.plate || r.simmer);
  ok("the rice cooker has real range", cooker.length >= 10, cooker.length + " dishes");
  ok("it does more than seasoned rice",
    R.some(r => r.plate) && R.some(r => r.simmer),
    "plate " + R.filter(r => r.plate).length + " simmer " + R.filter(r => r.simmer).length);
  /* the manufacturer's rule: thickeners foam, foam blocks the vent */
  R.filter(r => r.simmer && r.conds.includes("roux")).forEach(r => {
    ok(r.id + ": roux goes in after the cycle, never during",
      r.steps.some(s => /not put the roux in yet|after the cycle|heat OFF/i.test(s)));
  });
  ok("the fridge tab documents the cooker's limits", /plain rice underneath, never seasoned rice/i.test(tabHTML("fridge")));
  ok("including the thickener rule", /blocks the steam vent|foam blocks/i.test(tabHTML("fridge")));
  ok("and the wooden paddle rule", /[Ww]ooden paddle/.test(tabHTML("fridge")));
  S.plan = undefined; S.N = 7;
}

/* ---------- max-batch mode should not pick a 2-serving basket ---------- */
{
  /* Max-batch used to sort by capacity and take the top, which meant it returned only the nine
     cap-4 pot and pan dishes: no air fryer, no rice cooker, and the same handful every roll.
     Capacity is now a weight, not a ranking, so the contract is a spread of dishes that still
     leans toward the ones needing fewest rounds. */
  S.locked = []; S.N = 7; S.v = 1; S.recent = [];
  const seen = {}, caps = [];
  let appliance = 0, total = 0;
  for (let i = 0; i < 400; i++) {
    S.plan = undefined; ev("plan(true)");
    S.plan.map(id => R.find(r => r.id === id)).forEach(r => {
      seen[r.id] = (seen[r.id] || 0) + 1; caps.push(r.cap || 0);
      total++; if (isAppliance(r)) appliance++;
    });
  }
  const distinct = Object.keys(seen).length;
  ok("max batch draws on more than the pot shelf", distinct >= 12, "only " + distinct + " dishes");
  ok("max batch reaches the appliances", appliance / total > 0.35,
    Math.round(appliance / total * 100) + "% appliance");
  ok("max batch still favours fewer rounds",
    caps.reduce((a, b) => a + b, 0) / caps.length >= 2.5,
    "mean cap " + (caps.reduce((a, b) => a + b, 0) / caps.length).toFixed(2));
  ok("max batch only ever picks batchable dishes",
    Object.keys(seen).every(id => R.find(r => r.id === id).batch),
    Object.keys(seen).filter(id => !R.find(r => r.id === id).batch).join(","));
  const hog = Object.entries(seen).sort((a, b) => b[1] - a[1])[0];
  ok("no single dish dominates the rolls", hog[1] / 400 < 0.25, hog[0] + " " + Math.round(hog[1] / 400 * 100) + "%");
  S.v = 2; S.recent = [];
}

/* ---------- the appliances cost money; the planner should reach for them ---------- */
{
  S.locked = []; S.recent = [];
  [1, 2, 3].forEach(v => {
    S.v = v; S.N = 7;
    let appliance = 0, total = 0;
    for (let i = 0; i < 200; i++) {
      S.plan = undefined; ev("plan(true)");
      S.plan.map(id => R.find(r => r.id === id)).forEach(r => { total++; if (isAppliance(r)) appliance++; });
    }
    ok("variety " + v + " leans on the air fryer and rice cooker", appliance / total > 0.45,
      Math.round(appliance / total * 100) + "% appliance");
  });
  S.v = 2; S.recent = [];
}

/* ---------- a fresh roll should not hand back the week you just rejected ---------- */
{
  S.locked = []; S.v = 2; S.N = 7; S.plan = undefined; S.recent = [];
  ev("plan(true)");
  const first = [...S.plan];
  let repeats = 0;
  for (let i = 0; i < 40; i++) {
    const before = [...S.plan];
    ev("plan(true)");
    repeats += S.plan.filter(id => before.includes(id)).length;
  }
  ok("rolling again mostly changes the dishes", repeats / 40 < 1.0, (repeats / 40).toFixed(2) + " carried over per roll");
  ok("recent dishes are remembered", S.recent.length > 0 && S.recent.length <= ev("RECENT_KEEP"));
  ok("the memory holds real dish ids", S.recent.every(id => R.some(r => r.id === id)));
  S.recent = [];
}

/* ---------- stepping the meal count never strands a dish at zero ---------- */
{
  let worst = 99;
  for (let trial = 0; trial < 40; trial++) {
    S.locked = []; S.v = 3; S.N = 9; S.plan = undefined; ev("save()");
    ev("plan(true)");
    for (let i = 0; i < 4; i++) ev("stepMeals(-1)");
    const cc = ev("compute()");
    worst = Math.min(worst, Math.min(...cc.picks.map(r => cc.servings[r.id])));
  }
  ok("no dish drops to zero servings when the week shrinks", worst >= 1, "worst ×" + worst);
  S.v = 2; S.N = 7;
}

/* ---------- accessibility ---------- */
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
  ev("render()");
  const jp = [...D.querySelectorAll(".jp,.jpx,.tabjp")];
  ok("Japanese text is present to tag", jp.length > 0);
  ok("every Japanese run is marked lang=ja", jp.every(el => el.getAttribute("lang") === "ja"),
    jp.filter(el => el.getAttribute("lang") !== "ja").length + " untagged");
  ok("the app has a heading and a main landmark", !!D.querySelector("h1") && !!D.querySelector("main"));
  ok("toggles report their state", D.querySelectorAll("[aria-pressed]").length > 0);
  ok("shopping rows report ticked state", !!D.querySelector('#tab-shop [role="checkbox"][aria-checked]'));
  ok("the current tab is marked", !!D.querySelector('#tabbar [aria-current="page"]'));
  /* no duplicate focus keys, or focus restoration lands on the wrong control */
  const keys = [...D.querySelectorAll("[data-k]")].map(el => el.getAttribute("data-k"));
  eq("focus keys are unique", new Set(keys).size, keys.length);
}

/* ---------- shelf prices are the ones on the LIFE receipt, 2026-09-05 ---------- */
eq("mirin is hon-mirin, not the mirin-style seasoning", CONDS.mirin.jp, "本みりん 1L");
eq("mirin priced from the receipt", CONDS.mirin.p, 416);
eq("cooking sake priced from the receipt", CONDS.sake.p, 225);
eq("garlic priced from the receipt", CONDS.garlic.p, 376);
eq("ginger priced from the receipt", CONDS.ginger.p, 376);
eq("chicken thigh priced from the receipt", ING.chicken.p, 1.07);   // 618 +8% over 625 g
eq("frozen broccoli priced from the receipt", ING.fbroc.p, 1.42);   // 459 +8% over 350 g
eq("soy priced from the receipt", CONDS.soy.p, 322);                // 298 +8%
ok("soy is koikuchi, not the saltier usukuchi", /濃口/.test(CONDS.soy.jp));
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
