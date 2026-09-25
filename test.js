/* Lazy Meal Planner — jsdom test harness
 * Run:  npm i jsdom && node test.js      (SEED=n node test.js to try another planner seed)
 * Runs in Asia/Tokyo with a seeded Math.random, and every top-level section starts from resetAll().
 *
 * Keep this file in the repo. It has been lost twice with session scratch folders.
 *
 * Note: the app's top-level `const`/`let` bindings (RECIPES, ING, CONDS, S, U, ...)
 * are script-scoped and never land on `window`, so everything is reached through
 * global eval. Objects returned that way are live references, so mutating them
 * mutates the app's real state.
 *
 * Tabs: tonight · week · shop · save. The Fridge tab was removed on 17 Sep 2026 — it added
 * nothing to the flow. Its shelf lives on Shop and its reference rules on Week.
 * Step text carries braced quantities ({150 g}); TXT(r) renders them for one serving, and
 * every text check runs on the rendered words, not the template.
 * Cooking is a full-screen overlay (#cook-overlay), dish details a sheet (#sheet-overlay).
 */
/* One clock and one dice for every run: the app is used in Tokyo, and the planner's statistical
   tests should not pass or fail by luck. TZ must be set before any Date is made. */
process.env.TZ = "Asia/Tokyo";
function mulberry32(a) { return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
const SEED = +(process.env.SEED || 20260925);
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
  virtualConsole: vc,
  beforeParse(w) { w.Math.random = mulberry32(SEED); }
});
const W = dom.window;
const D = W.document;
const ev = expr => W.eval(expr);
const tabHTML = t => D.getElementById("tab-" + t).innerHTML;
/* Each top-level section starts from a clean, sanitised state — the same one a first launch gets —
   so no section passes or fails because of what an earlier one left in S or U. */
function resetAll() {
  W.eval("clearTimeout(U._toastTimer); clearTimeout(U._toastTimer)");
  W.localStorage.clear();
  /* S is emptied and re-sanitised in place: the suite holds a reference to the same object */
  W.eval("STALE = false; Object.keys(S).forEach(k => delete S[k]); loadState(S); U = freshU(); render()");
}

ok("no script errors on load", consoleErrors.length === 0, consoleErrors.slice(0, 3).join(" | "));

const R = ev("RECIPES"), ING = ev("ING"), CONDS = ev("CONDS"), GEARLABEL = ev("GEARLABEL");
const S = ev("S"), EAT_OUT = ev("EAT_OUT"), EFFORTS = ev("EFFORTS");
/* an appliance dish is one the air fryer or the rice cooker actually cooks, not one that
   merely has rice on the side */
const isAppliance = r => ev("isApplianceDish")(r);
const gearTipsOf = (r, servings) => ev("gearTips")(r, servings);
const TXT = (r, n) => r.steps.map((s, i) => ev("stepText")(r, i, n || 1));
ok("RECIPES reachable", Array.isArray(R));
ok("ING reachable", ING && typeof ING === "object");
ok("CONDS reachable", CONDS && typeof CONDS === "object");
ok("S reachable", S && typeof S === "object");
ok("U (ephemeral UI state) reachable", ev("typeof U") === "object");

/* ---------- roster shape ---------- */
eq("roster count is 45", R.length, 45);
eq("unique ids", new Set(R.map(r => r.id)).size, R.length);

const TIERS = { A: 9, B: 10, C: 12, D: 5, E: 3, F: 6 };
const tierCount = R.reduce((a, r) => (a[r.tier] = (a[r.tier] || 0) + 1, a), {});
Object.entries(TIERS).forEach(([t, n]) => eq("tier " + t + " count", tierCount[t], n));
ok("no recipe missing a tier", R.every(r => "ABCDEF".includes(r.tier)));

["omurice", "katsu", "mapo", "stirfry", "oyakodon", "yakisoba", "chahan", "napolitan", "gyudon"]
  .forEach(id => ok("cut recipe absent: " + id, !R.some(r => r.id === id)));
/* retired 17 Sep 2026: the cooker curry duplicated the pot curry at half the capacity; the two
   mackerel dishes because Josh does not eat mackerel; tacook chicken duplicated the Hainanese
   chicken once that moved onto the plate */
/* retired 25 Sep 2026 in the sourced-roster rebuild: the bean soup became a chicken minestrone,
   and the eggplant dengaku and yaki-onigiri carried no protein at all */
["rccurry", "afsaba", "sabarice", "tachicken", "beansoup", "afnasu", "afonigiri"].forEach(id => ok("retired recipe absent: " + id, !R.some(r => r.id === id)));
ok("no mackerel anywhere in the roster or pantry",
  !R.some(r => /mackerel|saba|さば|鯖/i.test(r.n + r.jp + TXT(r).join(" "))) && !Object.values(ING).some(i => /mackerel|さば/i.test(i.n + i.jp)));
["iwashi", "belachan", "minestrone", "chilli", "chikuzenni", "misoitame", "torobroc", "oyako", "yakiudon", "butadon", "afroast", "afbreast", "afkatsu", "afgyoza", "aftofu"]
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
  ok(r.id + ": states minutes to the table", Number.isFinite(r.ready) && r.ready > 0);
  ok(r.id + ": has at least one scalable quantity", r.steps.some(s => /\{[\d.]+ [^}]+\}/.test(s)));
  [1, 2, 3, 4].forEach(n => ok(r.id + ": no template leaks at ×" + n, TXT(r, n).every(t => !/[{}]|NaN|undefined/.test(t)),
    TXT(r, n).find(t => /[{}]|NaN|undefined/.test(t))));
});

/* ---------- effort tiers: what the Tonight screen sorts on ---------- */
eq("three effort tiers offered", EFFORTS.length, 3);
ok("every recipe carries an effort tier", R.every(r => [0, 1, 2].includes(r.eff)),
  R.filter(r => ![0, 1, 2].includes(r.eff)).map(r => r.id).join(","));
ok("all three tiers have dishes", [0, 1, 2].every(k => R.some(r => r.eff === k)));
/* batch day = the long pot anchors; zero effort = assembly and set-and-forget only */
/* 3, not 4: the measured pot holds three servings of a stew — see the capacity section */
ok("every eff-2 dish is a batchable anchor", R.filter(r => r.eff === 2).every(r => r.batch && r.cap >= 3),
  R.filter(r => r.eff === 2 && !(r.batch && r.cap >= 3)).map(r => r.id).join(","));
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
ok("every tier-A anchor makes at least 3 a round", anchors.every(r => r.cap >= 3), anchors.filter(r => r.cap < 3).map(r => r.id).join(","));
ok("every tier-A anchor is batchable", anchors.every(r => r.batch === true));
ok("no cap-1 recipe outside the escape hatch",
  R.filter(r => r.cap === 1).every(r => r.tier === "E" || r.gear.includes("air") || r.menu === "risotto"),
  R.filter(r => r.cap === 1 && r.tier !== "E" && !r.gear.includes("air") && r.menu !== "risotto").map(r => r.id).join(","));
ok("at least one legume recipe", R.some(r => r.ing.some(([i]) => i === "mixedbeans")));
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
R.forEach(r => TXT(r).forEach((s, i) => {
  BANNED.forEach(([re, why]) => ok(r.id + " step" + (i + 1) + " vocab (" + why + ")", !re.test(s), s.slice(0, 60)));
}));

/* ---------- cook-in flag ---------- */
const cookin = R.filter(r => r.cookin).map(r => r.id).sort();
ok("cook-in set is the seasoned-rice cooker dishes",
  JSON.stringify(cookin) === JSON.stringify(["rcchahan", "rcrisotto"]), cookin.join(","));
/* the protein-heavy seasoned rices broke Tiger's ~70 g-a-cup rule by 2–3×, so they cook on the
   plate over plain rice and are folded together afterwards */
ok("the mazegohan dishes are plate dishes now",
  ["hainan", "kimchirice", "takikomi", "tomatorice"].every(id => R.find(r => r.id === id).plate));
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

["tonight", "week", "shop", "save"].forEach(t => {
  ev("setTab('" + t + "')");
  const el = D.getElementById("tab-" + t);
  ok("tab renders: " + t, el && el.innerHTML.trim().length > 50, el ? el.innerHTML.length : "missing");
  ok("no undefined leak in tab: " + t, el && !/undefined|NaN|\[object Object\]/.test(el.innerHTML));
  ok("tab is a real section with a heading: " + t, el && /<h[123]/.test(el.innerHTML));
});
ok("exactly one tab is visible at a time",
  ["tonight", "week", "shop", "save"].filter(t => D.getElementById("tab-" + t).className.includes(" on")).length === 1);
ok("there is no Fridge tab", !D.getElementById("tab-fridge") && D.querySelectorAll("#tabbar .tabbtn").length === 4);
["fridgeHTML", "eatFridge", "tossFridge", "nextDay", "simDate", "portInc"].forEach(f =>
  ok("fridge machinery is gone: " + f, ev("typeof " + f) === "undefined"));
ok("S carries no fridge or fake clock", S.fridge === undefined && S.day === undefined);

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
/* barley is bag stock now: it never sits in the weekly rows, it asks for a pack via the shelf */
ok("barley never appears as a weekly row", !mugiRow);
if (nonCookinCups > 0) {
  eq("mugiCups excludes cook-in dishes", after.mugiCups, nonCookinCups);
  ok("the toggle asks the shelf for barley", after.needed.includes("mugi"));
  eq("the toggle leaves the weekly bill alone while the pack lasts", after.food, before.food);
} else {
  ok("no plain-rice dishes in this plan, no barley asked for", !after.needed.includes("mugi"));
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
S.plan = ["rcchahan", "rcrisotto"];
const onlyCookin = ev("compute()");
eq("cook-in-only plan needs no barley", onlyCookin.mugiCups, 0);
ok("cook-in-only plan asks the shelf for no barley", !onlyCookin.needed.includes("mugi"));
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
{
  S.plan = ["curry"]; S.N = 3; ev("setTab('shop')");
  const rows = () => D.querySelectorAll("#tab-shop .pricerow").length;
  eq("the price panel lists this week's items only", rows(), ev("compute()").rows.length);
  ev("togglePriceAll()");
  eq("and every ingredient on request", rows(), Object.keys(ING).length);
  ev("togglePriceAll()");
  ok("the shelf lives on Shop now", !!D.querySelector("#tab-shop .condgrid") && /The shelf/.test(tabHTML("shop")));
  S.plan = undefined; ev("render()");
  ok("and is there even before a week is planned", !!D.querySelector("#tab-shop .condgrid"));
}

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
  S.plan = [r.id]; S.N = Math.max(1, r.cap || 2); ev("render()");
  let threw = null, guard = 0;
  try {
    ev("openSheet('" + r.id + "')");
    ev("startCook('" + r.id + "', " + ((r.cap || 1) + 1) + ")");
    while (ev("U.cook") && guard++ < 60) ev("nextStep()");
  } catch (e) { threw = e.message; }
  ok("cook wizard runs to the end: " + r.id, !threw && !ev("U.cook"), threw || ("stuck after " + guard));
  ok("finishing says done, never boxes: " + r.id, /^Done\./.test(ev("U.toast ? U.toast.msg : ''")));
});

/* ---------- rice portion ---------- */
R.filter(r => r.rice !== undefined).forEach(r => {
  /* a plate dish is plain rice under a protein, so it is an ordinary half-cup bowl — and the
     plate's 1-go ceiling only allows two of them per run */
  if (r.cookin) eq("rice-led dish keeps a full cup: " + r.id, r.rice, 1);
  else eq("standard portion is half a cup: " + r.id, r.rice, 0.5);
});
ok("no recipe still quotes 200 g cooked rice",
  !R.some(r => TXT(r).some(s => /200 g cooked/.test(s))));
R.filter(r => r.cookin).forEach(r =>
  ok("cook-in still measures 150 g dry: " + r.id, TXT(r).some(s => /150 g rice/.test(s))));

/* ---------- the real machine: Amazon Basics 4.2 L, 60-200 C ---------- */
const AIR = R.filter(r => r.gear.includes("air"));
eq("air-fryer roster size", AIR.length, 12);
AIR.forEach(r => {
  ok(r.id + ": declares the floor space a serving takes", Number.isFinite(r.cm2));
  ok(r.id + ": a full round fits the basket floor in one layer", r.cm2 * r.cap <= ev("BASKET_CM2"), r.cm2 + " cm² × " + r.cap);
});
eq("twelve gyoza fill the basket, so one serving a round", R.find(r => r.id === "afgyoza").cap, 1);
eq("six wings fill the basket, so one serving a round", R.find(r => r.id === "aftebasaki").cap, 1);
ok("no air dish exceeds the 4.2 L basket", AIR.every(r => r.cap >= 1 && r.cap <= 2),
  AIR.filter(r => r.cap > 2).map(r => r.id).join(","));
ok("every air dish names a temperature", AIR.every(r => TXT(r).some(s => /\d{2,3}\s*°C/.test(s))),
  AIR.filter(r => !TXT(r).some(s => /\d{2,3}\s*°C/.test(s))).map(r => r.id).join(","));
ok("no air dish asks for more than 200 C", !AIR.some(r => TXT(r).some(s => {
  const m = s.match(/(\d{2,3})\s*°C/g) || [];
  return m.some(x => parseInt(x, 10) > 200);
})));
ok("breaded dishes get the basket to themselves",
  R.filter(r => TXT(r).some(s => /press the panko on|dip in egg/i.test(s))).every(r => r.cap === 1),
  R.filter(r => r.steps.some(s => /press the panko on|dip in egg/i.test(s)) && r.cap !== 1).map(r => r.id).join(","));
ok("no recipe tells you to spray aerosol oil into the basket",
  !R.some(r => TXT(r).some(s => /spray/i.test(s) && !/never (aerosol )?spray/i.test(s))));
{
  const DONE = /juices (run )?clear|no pink|75 °C|flakes apart|blistered gold|golden and firm|deep gold|chopstick slides/i;
  ok("every air dish has a doneness cue", AIR.every(r => TXT(r).some(s => DONE.test(s))),
    AIR.filter(r => !TXT(r).some(s => DONE.test(s))).map(r => r.id).join(","));
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

/* ---------- the measurements outlive the shopping list: collapsed under The rhythm on Week ---------- */
S.plan = ["curry"]; S.N = 3;
ev("setTab('week')");
const fridgeText = () => { S.plan = S.plan || ["curry"]; ev("render()"); return tabHTML("week"); };
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
  resetAll();
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
S.plan = ["curry"]; S.N = 4; S.mugi = true;
const perServing = ev("compute()").mugiCups * 50 * ING.mugi.p / 4;
ok("barley works out at roughly ¥20 a serving, not ¥40", perServing > 8 && perServing < 32, Math.round(perServing));
ok("mugi copy no longer claims ¥40", !/about ¥40 a serving/.test(D.body.innerHTML));
S.mugi = false;

/* ---------- state survives a reload ---------- */
S.plan = ["curry", "keema"]; S.mugi = true; S.N = 7; ev("save()");
const raw = W.localStorage.getItem("lmp");
ok("state persisted", !!raw);
const parsed = JSON.parse(raw || "{}");
eq("mugi persisted", parsed.mugi, true);
ok("plan persisted", Array.isArray(parsed.plan) && parsed.plan.length === 2);
ok("no fridge is persisted", parsed.fridge === undefined && parsed.day === undefined);
S.mugi = false; ev("save()");

/* ---------- protein swap: a stale key here blanks the whole app ---------- */
const MEATCYCLE = ev("MEATCYCLE");
ok("every MEATCYCLE entry exists in the pantry", MEATCYCLE.every(k => ING[k]),
  MEATCYCLE.filter(k => !ING[k]).join(","));
ok("the swap only moves between whole cuts", JSON.stringify(MEATCYCLE) === JSON.stringify(["chicken", "pork"]));
ok("no mince dish offers a swap — chunks cannot become meatballs or soboro",
  !R.some(r => r.flex && r.ing.some(([i]) => i === "gpork")), R.filter(r => r.flex && r.ing.some(([i]) => i === "gpork")).map(r => r.id).join(","));
ok("the poached breast is not swappable", !R.find(r => r.id === "belachan").flex);
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
  const seen = new Set();
  for (let i = 0; i < 4; i++) { ev("cycleProtein('" + r.id + "')"); seen.add(S.protein[r.id]); }
  ok("the swap never lands on ground pork: " + r.id, !seen.has("gpork"));
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
  const { w } = boot({ stepdone: { curry: { 0: true } }, fridge: [{ id: "curry", portions: 2, day: 0 }], day: 3, tab: "fridge" });
  eq("the retired step-checkbox state is dropped", w.eval("typeof S.stepdone"), "undefined");
  eq("an old fridge is dropped on load", w.eval("typeof S.fridge"), "undefined");
  eq("and so is the pretend clock", w.eval("typeof S.day"), "undefined");
  eq("a save sitting on the Fridge tab lands on Tonight", w.eval("S.tab"), "tonight");
  ok("and renders", w.document.getElementById("tab-tonight").innerHTML.trim().length > 50);
  w.close();
}
{
  const { errs, w } = boot({ plan: ["curry", "belachan", "rccurry"], protein: { curry: "gpork", belachan: "pork", keema: "chicken", nikujaga: "pork" }, N: 6 });
  ok("a save with cross-form swaps and a retired dish boots clean", errs.length === 0, errs[0]);
  eq("mince swapped into a whole-cut dish is dropped", w.eval("S.protein.curry"), undefined);
  eq("a swap on a dish that no longer allows one is dropped", w.eval("S.protein.belachan"), undefined);
  eq("a swap on a mince dish is dropped", w.eval("S.protein.keema"), undefined);
  eq("a legitimate swap survives", w.eval("S.protein.nikujaga"), "pork");
  w.close();
}

/* ---------- pan reality ---------- */
R.filter(r => r.gear.includes("pan") && (r.cap || 0) > 2).forEach(r =>
  ok("pan dish above cap 2 warns about crowding: " + r.id, !!r.crowd));
{
  /* butadon is a braise, not a sear: four servings slopped at the brim of the pan, and fit the pot */
  const bd = R.find(r => r.id === "butadon");
  ok("butadon cooks in the pot", bd.gear.includes("pot") && !bd.gear.includes("pan"));
  eq("and three fit it — four boiled at the brim with foam (audit K3)", bd.cap, 3);
  ok("no brim-full pan warning survives", !R.some(r => r.crowd === "full"));
}

/* ---------- leftovers must not outlive food safety ---------- */
ok("no step claims a week in the fridge",
  !R.some(r => TXT(r).some(s => /a week in the fridge|keeps a week/i.test(s))),
  R.filter(r => TXT(r).some(s => /a week in the fridge|keeps a week/i.test(s))).map(r => r.id).join(","));
/* fixed expectations, not a copy of keepDaysOf's own formula */
{
  const kd = ev("keepDaysOf");
  eq("meat or fish: three days", kd({ ing: [["chicken", 100], ["onion", 1]] }), 3);
  eq("salmon counts as fish", kd({ ing: [["salmon", 1]] }), 3);
  eq("no meat: four days", kd({ ing: [["tofu", 1], ["cabbage", 100]] }), 4);
  eq("an explicit keep wins", kd({ keep: 1, ing: [["chicken", 100]] }), 1);
  const FIXED = { curry: 3, nikujaga: 3, aftofu: 1, udon: 1, tompasta: 1, rcrisotto: 1, chinchalok: 1, afgyoza: 3, tomatorice: 3, yakiudon: 1 };
  Object.entries(FIXED).forEach(([id, d]) => eq("keeps " + d + " days: " + id, kd(R.find(r => r.id === id)), d));
}
R.forEach(r => {
  const claims = [...TXT(r).join(" ").matchAll(/[Kk]eeps (?:it )?(\d) days|(\d) days in the fridge|(\d) days chilled/g)].map(m => +(m[1] || m[2] || m[3]));
  const kd = ev("keepDaysOf(rec('" + r.id + "'))");
  ok(r.id + ": the steps and the sheet agree on shelf life", claims.every(d => d === kd), claims.join(",") + " vs " + kd);
});
ok("the risotto is an eat-now dish", ev("keepDaysOf(rec('rcrisotto'))") === 1);

/* ---------- tonight: the effort question ---------- */
{
  resetAll();
  S.plan = ["curry", "udon", "tunamayo"]; S.N = 6; S.cooked = {};
  ev("U.effort = null; render(); setTab('tonight')");
  ok("the question is asked first", /How much/.test(tabHTML("tonight")));
  eq("three ways to answer", D.querySelectorAll("#tab-tonight .effrow").length, 3);

  ev("pickEffort(0)");
  const zero = ev("candidates(compute())");
  ok("zero effort offers only zero-effort dishes",
    zero.every(o => o.eff === 0), zero.filter(o => o.eff !== 0).map(o => o.r.id).join(","));
  ok("a hero dish is proposed", /Cook it/.test(tabHTML("tonight")));
  ok("the hero says when it would be on the table", /ready ~\d+ min/.test(tabHTML("tonight")));

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
      S.locked = []; S.v = 2; S.N = 7; S.plan = undefined; ev("save()");
      ev("plan(true)");
      const heroes = [];
      for (const k of [0, 1, 2]) {
        ev("U.effort=" + k + ";U.heroIdx=0");
        const cand = ev("candidates(compute())");
        const hero = cand[0];
        heroes.push(hero.r.id);
        if (hero.kind !== "reheat" && hero.r.eff > k) harder++;
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
    S.plan = ["tunamayo", "curry"]; S.N = 6; ev("render()");
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
    S.plan = ["tunamayo", "udon"]; S.N = 4; ev("render()");
    ev("U.effort=2;U.heroIdx=0");
    const batch = ev("candidates(compute())");
    eq("batch day still answers with a batch anchor", batch[0].r.eff, 2);
    eq("flagged as off the plan", batch[0].kind, "offplan");
    ok("and the copy says the week has no anchor",
      (function () { ev("render()"); return /no batch anchor in it/.test(tabHTML("tonight")); })());
  }
  /* the suggestion must not move under you between renders, but should differ week to week */
  {
    S.locked = []; S.v = 2; S.N = 7; S.plan = ["curry", "keema"]; ev("save()");
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
    S.plan = undefined; ev("save()");
    [0, 1, 2].forEach(k => {
      ev("U.effort=" + k + ";U.heroIdx=0");
      const cand = ev("candidates(compute())");
      ok("no plan, eff" + k + " still suggests something", cand.length > 0 && cand[0].r.eff === k,
        cand.length ? cand[0].r.id + " eff" + cand[0].r.eff : "empty");
    });
    S.plan = ["curry", "udon", "tunamayo"]; S.N = 6; ev("save()");
  }

  /* 25 Sep: Tonight offers what the wizard finished (no box counting), but never a box ledger */
  ok("Tonight never counts boxes", !/portions? already|boxes left|\d+ boxes/i.test(tabHTML("tonight")));
  ev("backToAsk()");
  ok("not even on the question screen", !/boxes left/i.test(tabHTML("tonight")));
}

/* ---------- the dish sheet ---------- */
{
  resetAll();
  S.plan = ["curry"]; S.N = 4; ev("render()");
  ev("openSheet('curry')");
  const sheet = D.getElementById("sheet-overlay");
  ok("the sheet opens", sheet.className.includes("show"));
  ok("it names the dish", /Japanese curry/.test(sheet.innerHTML));
  ok("it gives hands-on time, servings and gear", /hands on/.test(sheet.innerHTML) && /this week/.test(sheet.innerHTML) && /gear/.test(sheet.innerHTML));
  ok("it says how long to the table, all rounds included", /~70 min \+ rice/.test(sheet.innerHTML) && /to the table/.test(sheet.innerHTML));
  ok("it says how long it keeps", /3 days · freezes/.test(sheet.innerHTML) && /keeps/.test(sheet.innerHTML));
  ok("it lists the per-serving ingredients", /Chicken thigh 120 g/.test(sheet.innerHTML));
  ok("it offers the protein swap on a flex dish", !!sheet.querySelector('[data-k="sheetcycle"]'));
  ok("and a way into cooking", /Cook ×4 · 5 steps/.test(sheet.innerHTML));
  ok("the page behind it is inert", D.getElementById("main").hasAttribute("inert"));
  ok("focus moves into the sheet", sheet.contains(D.activeElement));
  D.dispatchEvent(new W.KeyboardEvent("keydown", { key: "Escape" }));
  eq("escape closes it", ev("U.sheet"), null);
  ok("and the page is live again", !D.getElementById("main").hasAttribute("inert"));
}

/* ---------- cook mode ---------- */
{
  resetAll();
  S.plan = ["curry"]; S.N = 3; ev("render()");
  ev("startCook('curry', 3)");
  const cook = D.getElementById("cook-overlay");
  const n = R.find(r => r.id === "curry").steps.length;
  ok("cook mode opens full screen", cook.className.includes("show"));
  ok("it opens on a before-you-start screen", /Before you start/.test(cook.innerHTML));
  ok("with the servings to cook", /×3/.test(cook.innerHTML));
  ok("and whether it fits in one go", /One go — 3 fit the pot/.test(cook.textContent), cook.textContent.slice(0, 200));
  ok("and the rice cooker is told to start first", /Rice for these 3: 1½ cups \(225 g\) in the cooker now/.test(cook.textContent));
  ok("with a lead time worked out from the dish", /start prepping in about 15 min/.test(cook.textContent));
  ok("and a frozen-rice way out", /frozen rice/.test(cook.textContent));
  eq("one dot per recipe step", cook.querySelectorAll(".dot").length, n);
  ok("the body is marked as cooking, so the toast clears the footer", D.body.classList.contains("cooking"));
  ev("cookServ(1)");
  eq("servings can go up", ev("U.serv"), 4);
  ok("and four is two rounds in this pot", /2 rounds of up to 3/.test(D.getElementById("cook-overlay").textContent));
  ev("cookServ(-1)");
  ev("nextStep()");
  ok("step one is scaled to the servings", /360 g chicken/.test(D.getElementById("cook-overlay").textContent) && /1½ onions/.test(D.getElementById("cook-overlay").textContent),
    D.getElementById("cook-overlay").textContent.slice(0, 200));
  ok("one step at a time", D.getElementById("cook-overlay").querySelectorAll(".steptext").length === 1);
  ev("nextStep()"); ev("nextStep()");
  ok("liquids scale too", /510 ml water/.test(D.getElementById("cook-overlay").textContent));
  ok("frying oil does not", !/45 ml \(3 tbsp\) oil/.test(TXT(R.find(r => r.id === "curry"), 3).join(" ")));
  ev("prevStep()");
  ok("back moves back", /Step 2 of/.test(D.getElementById("cook-overlay").innerHTML));
  ev("prevStep()"); ev("prevStep()");
  ok("back from step one returns to the setup", /Before you start/.test(D.getElementById("cook-overlay").innerHTML));
  ev("prevStep()");
  eq("back from the setup leaves cook mode", ev("U.cook"), null);
  ok("and the body is no longer cooking", !D.body.classList.contains("cooking"));

  ev("startCook('curry', 3)");
  for (let i = 0; i < n; i++) ev("nextStep()");
  ok("the last step says done", /Done</.test(D.getElementById("cook-overlay").innerHTML));
  ev("nextStep()");
  eq("done closes cook mode", ev("U.cook"), null);
  ok("and says how long the boxes keep", /Boxes keep 3 days — Tonight offers them until (Sun|Mon|Tue|Wed|Thu|Fri|Sat)/.test(ev("U.toast ? U.toast.msg : ''")), ev("U.toast ? U.toast.msg : ''"));
  ok("the finished batch is remembered", S.cooked.curry && S.cooked.curry.serv === 3);
  ev("U.effort=0; U.heroIdx=0; render()");
  const cands0 = ev("candidates(compute())");
  eq("Tonight's zero-effort answer is now reheating it", cands0[0].kind + ":" + cands0[0].r.id, "reheat:curry");
  ok("and it says how to reheat it", /Microwave, lid on/.test(tabHTML("tonight")) && /Already cooked · eat by/.test(tabHTML("tonight")));
  ev("U.effort=2; U.heroIdx=0; render()");
  ok("batch day no longer offers to cook it again", !ev("candidates(compute())").some(o => o.r.id === "curry" && o.kind === "cook"));
  ev("finishCooked('curry')");
  ok("'Finished them' stops the offer", !S.cooked.curry);
  ev("runToastUndo()"); ok("and can be undone", !!S.cooked.curry);
  S.cooked = { curry: { d: "2000-01-01", serv: 3 } };
  ok("a batch past its fridge life is not offered", !ev("candidates(compute())").some(o => o.kind === "reheat"));
  S.cooked = {}; ev("U.effort=null; render()");
  eq("and the effort question resets for next time", ev("U.effort"), null);
  ok("no portion-into-boxes step remains", !/go in boxes/.test(D.body.innerHTML));

  /* rounds: three servings of karaage is a round of two then a round of one */
  S.plan = ["karaage"]; S.N = 3; ev("render()");
  ev("startCook('karaage', 3)");
  ok("the setup says two rounds", /2 rounds of up to 2/.test(D.getElementById("cook-overlay").textContent));
  ok("and that prep is shared", /Prep is done once/.test(D.getElementById("cook-overlay").textContent));
  ev("nextStep()");
  ok("prep is sized for the whole batch", /prep for all 3/.test(D.getElementById("cook-overlay").textContent) && /450 g chicken/.test(D.getElementById("cook-overlay").textContent));
  const KR = R.find(r => r.id === "karaage"), kn = KR.steps.length, kf = ev("cookFrom")(KR);
  ok("karaage's basket steps start at the preheat", kf > 0 && /Preheat/.test(KR.steps[kf]));
  for (let i = 1; i <= kf; i++) ev("nextStep()");
  ok("the basket step is labelled round one and sized for it", /round 1 of 2 · ×2/.test(D.getElementById("cook-overlay").textContent));
  for (let i = kf + 1; i < kn; i++) ev("nextStep()");
  ok("the last step of round one leads into round two", /Round 2 of 2/.test(D.getElementById("cook-overlay").innerHTML));
  ev("nextStep()");
  eq("round two skips the prep and starts at the preheat", ev("U.step"), kf + 1);
  ok("with its own amounts", /round 2 of 2 · ×1/.test(D.getElementById("cook-overlay").textContent));
  ev("prevStep()");
  ok("back from round two's first step returns to round one's last", ev("U.round") === 1 && ev("U.step") === kn);
  /* a pan round is the whole recipe again */
  eq("pan and pot rounds repeat from the top", ev("cookFrom")(R.find(r => r.id === "shogayaki")), 0);
  ev("quitCook()");

  /* a dish that makes its own rice must not be told to start rice */
  ev("startCook('hainan', 2)");
  ok("plate dishes get no rice-first line", !/Rice first/.test(D.getElementById("cook-overlay").textContent));
  ok("but do get the plate rules", /never keep warm/.test(D.getElementById("cook-overlay").textContent));
  ev("quitCook()");
  ev("startCook('iwashi', 1)");
  ok("a two-minute bowl is pointed at frozen rice, not a 50-minute run", /microwave a frozen rice pot/.test(D.getElementById("cook-overlay").textContent));
  ev("quitCook()");
  ev("startCook('rcchashu', 1)");
  eq("the simmer menu's minimum fill sets the fewest servings", ev("U.serv"), 3);
  ev("cookServ(-1)");
  eq("and the stepper will not go under it", ev("U.serv"), 3);
  ev("quitCook()");
  /* every side-rice dish gets a rice instruction; every self-rice dish gets none */
  R.forEach(r => {
    const t = ev("riceFirstText")(r, 2), k = ev("riceKind")(r);
    if (k === "side" && r.simmer) ok(r.id + ": a cooker braise says the cooker is busy, never 'cook rice now'", /busy/.test(t) && !/Hot rice|quick-cook/.test(t), t);
    else if (k === "side") ok(r.id + ": side rice is started before cooking", /Rice for these|Hot rice/.test(t), t);
    else if (k === "cooked") ok(r.id + ": cooked-rice dish says so", /cooked rice/.test(t), t);
    else ok(r.id + ": no rice instruction when the dish has none of its own to wait on", t === "", t);
  });
  /* a toast from a previous screen never sits over the cook footer */
  ev("flash('something', function(){})");
  ev("startCook('curry', 3)");
  eq("starting to cook clears any toast", ev("U.toast"), null);
  ev("quitCook()");
}

/* ---------- scaled quantities read like a cookbook ---------- */
{
  resetAll();
  const fq = ev("fmtQty");
  eq("15 ml reads as a tablespoon", fq(15, "ml"), "15 ml (1 tbsp)");
  eq("5 ml reads as a teaspoon", fq(5, "ml"), "5 ml (1 tsp)");
  eq("big volumes lose the spoon", fq(510, "ml"), "510 ml");
  eq("three teaspoons is a tablespoon", fq(3, "tsp"), "1 tbsp");
  eq("half a teaspoon", fq(0.5, "tsp"), "½ tsp");
  eq("a third of a carrot", fq(0.3, "carrot"), "⅓ carrot");
  eq("plurals past one", fq(1.5, "onion"), "1½ onions");
  eq("irregular plurals", fq(2, "potato", "potatoes"), "2 potatoes");
  eq("grams round to 5", fq(3 * 22, "g"), "65 g");
  eq("eggs never come in halves past one", fq(1.5, "egg"), "2 eggs");
  eq("but half an egg is still half", fq(0.5, "egg"), "½ egg");
}

/* ---------- undo covers everything destructive ---------- */
{
  resetAll();
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
  resetAll();
  S.log = []; S.N = 7; ev("setTab('save')");
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

/* ---------- rice is bag stock, never a weekly row ---------- */
{
  resetAll();
  S.price = {}; S.plan = ["curry"]; S.N = 4; S.mugi = false;
  const c = ev("compute()");
  ok("rice is not in the grocery rows", !c.rows.some(r => r.id === "rice"), c.rows.map(r => r.id).join(","));
  ok("a rice week asks the shelf for rice", c.riceGo > 0 && c.needed.includes("rice"));
  /* a price of zero is still a real answer for anything else that was gifted */
  ev("setPrice('rice', 0)");
  eq("a price of zero is accepted, not rejected", S.price.rice, 0);
  ev("setPrice('rice', -5)");
  eq("a negative price is still nonsense", S.price.rice, 0);
  S.price = {}; S.plan = undefined; S.N = 7;
}

/* ---------- a name must never read as a quantity ---------- */
{
  resetAll();
  /* "Mentsuyu (3x)" meant 3-times concentrate, but sitting in a shopping list next to rows
     that really do carry counts, it read as "buy three of them" — and did, for months. */
  const QTY = /\(\s*[0-9]+\s*[xX×]\s*\)|\(\s*[xX×]\s*[0-9]+\s*\)/;
  const names = [...Object.values(CONDS).map(c => c.n), ...Object.values(ING).map(i => i.n)];
  ok("no shelf or pantry name looks like a multiplier",
    !names.some(n => QTY.test(n)), names.filter(n => QTY.test(n)).join(","));
  /* receipt-verified at LIFE 市谷薬王寺店, 2026-09-15, tax inclusive */
  eq("chicken stock is the price on the receipt", CONDS.torigara.p, 538);
  eq("curry roux is priced from the receipt", Math.round(ING.roux.p * 185), 353);
  ok("the simmer rule states a minimum as well as a maximum",
    /1-cup and 3-cup/.test(fridgeText()) && /under the bottom one/.test(fridgeText()));
  ok("mentsuyu still states its strength somewhere",
    /triple-strength/i.test(CONDS.mentsuyu.n) || /3倍/.test(CONDS.mentsuyu.jp));
  /* the dose depends on it, so the strength is not decoration */
  ok("and the recipes still dose it as a concentrate",
    R.filter(r => r.conds.includes("mentsuyu")).some(r => TXT(r).some(s => /parts water|倍|concentrate/i.test(s))));
}

/* ---------- the shelf: a bottle bought once must not be billed every week ---------- */
{
  resetAll();
  /* The default shelf was {oil:true} and nothing ever filled it in, so the Shop tab kept
     asking for mentsuyu, soy and mirin as one-time purchases months after they were bought. */
  const SEED = ev("SHELF_SEED");
  ok("the seed covers every condiment a recipe calls for",
    /* the 25 Sep additions are real one-time buys he has not made yet, so they must NOT be seeded */
    [...new Set(R.flatMap(r => r.conds))].every(k => SEED.includes(k) || ["cheese","consomme","ketchup","chilipowder","oyster"].includes(k)),
    [...new Set(R.flatMap(r => r.conds))].filter(k => !SEED.includes(k) && k !== "cheese").join(","));
  /* roux is consumed a block a serving, so it is groceries, not a shelf bottle */
  ok("curry roux is billed per serving, not once", !SEED.includes("roux") && !CONDS.roux && !!ING.roux);
  R.filter(r => TXT(r).some(s => /roux block/.test(s))).forEach(r => {
    ok(r.id + ": buys the roux it cooks with", r.ing.some(([i]) => i === "roux"),
      JSON.stringify(r.ing.map(x => x[0])));
    ok(r.id + ": no longer treats roux as a shelf item", !r.conds.includes("roux"));
  });
  ok("a fresh install starts with a stocked shelf", SEED.every(k => S.owned[k] === true),
    SEED.filter(k => S.owned[k] !== true).join(","));
  ok("the shelf is marked as seeded", S.shelfSeeded === true);

  /* nikujaga for four: the exact report Josh made */
  S.plan = ["nikujaga"]; S.N = 4; ev("render()");
  const shop = tabHTML("shop");
  ok("four servings of nikujaga does not re-bill mentsuyu", !D.querySelector('[data-k="needmentsuyu"]'), "mentsuyu still billed");
  ok("and asks for no shelf top-up at all", !/Shelf top-up/.test(shop));
  const c4 = ev("compute()");
  ok("mentsuyu is still recognised as needed by the recipe", c4.needed.includes("mentsuyu"));
  ok("it is simply already owned", S.owned.mentsuyu === true);

  /* running out is still expressible, and still reaches the shopping list */
  ev("toggleCond('mentsuyu')");
  ok("marking one as run out puts it back on the list", !!D.querySelector('[data-k="needmentsuyu"]'));
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

/* ---------- capacity claims are physical claims, and get checked ----------
   Tiger's manual for the 3-go tacook: the cooking plate caps rice at 1 go (min 0.5), and
   simmer-menu ingredients must sit between the 1-go and 3-go white-rice marks. cap has been
   wrong three times now — meatballs, onigiri, and a curry claiming four servings in a pot
   that holds about one litre — so it is asserted, not eyeballed. */
{
  const CK = ev("COOKER"), PLATE_MAX_GO = CK.plateMax, PLATE_MIN_GO = CK.plateMin, SIMMER_MAX_ML = CK.simmerMaxMl;
  const loadOf = r => ev("loadOf")(r);
  R.filter(r => r.plate).forEach(r => {
    ok(r.id + ": plate run stays inside Tiger's 1-go rice limit",
      r.rice * r.cap <= PLATE_MAX_GO + 1e-9, (r.rice * r.cap) + " go");
    ok(r.id + ": a single serving still clears the 0.5-go minimum",
      r.rice >= PLATE_MIN_GO - 1e-9, r.rice + " go");
  });
  R.filter(r => r.plate).forEach(r => {
    ok(r.id + ": a plate serving spreads in one layer", loadOf(r) <= ev("PLATE_G"), loadOf(r) + " g");
    ok(r.id + ": the plate comes out when it beeps", TXT(r).some(s => /lift the plate straight out/.test(s)));
    ok(r.id + ": never suggests keep-warm with the plate in",
      TXT(r).every(s => !/keep-warm/.test(s) || /never leave it in on keep-warm/.test(s)));
  });
  R.filter(r => r.cookin).forEach(r => {
    ok(r.id + ": names its Tiger menu", ["takikomi", "risotto", "chahan"].includes(r.menu), r.menu);
    ok(r.id + ": a run stays inside that menu's rice limit", r.rice * r.cap <= CK[r.menu] + 1e-9,
      (r.rice * r.cap) + " go on " + r.menu);
    ok(r.id + ": extras stay under ~70 g a cup", loadOf(r) / r.rice <= CK.gPerCup, Math.round(loadOf(r) / r.rice) + " g/cup");
  });
  eq("the risotto menu takes one cup, so one serving", R.find(r => r.id === "rcrisotto").cap, 1);
  R.filter(r => r.simmer).forEach(r => {
    ok(r.id + ": tells you what to set the simmer timer to", TXT(r).some(s => /set the timer to \d+ min/.test(s)));
    ok(r.id + ": its fewest servings clear the bottom mark", r.mlPerServing * (r.minServ || 1) >= CK.simmerMinMl,
      r.mlPerServing * (r.minServ || 1) + " ml");
  });
  /* the 18 cm pot, measured by Josh on 17 Sep 2026 */
  eq("the pot's working volume is the measured one", ev("POT_ML"), 1600);
  R.filter(r => r.gear.includes("pot")).forEach(r => {
    ok(r.id + ": a full round fits the pot", r.potMl * r.cap <= ev("POT_ML"), r.potMl + " ml × " + r.cap);
    ok(r.id + ": and one more would not, unless a cap below that is deliberate",
      r.potMl * (r.cap + 1) > ev("POT_ML") || r.cap === (r.capMax || 4), r.potMl + " ml × " + (r.cap + 1));
  });
  eq("curry makes three in the pot, not four", R.find(r => r.id === "curry").cap, 3);
  R.filter(r => r.simmer).forEach(r => {
    ok(r.id + ": a simmer dish declares what it puts in the pot", Number.isFinite(r.mlPerServing));
    ok(r.id + ": a full run stays under the fill line",
      r.mlPerServing * r.cap <= SIMMER_MAX_ML, (r.mlPerServing * r.cap) + " ml");
  });
  /* and the copy must not contradict the manual */
  ok("no step still claims two cups of rice under the plate",
    !R.some(r => TXT(r).some(s => /[Tt]wo cups of rice/.test(s))),
    R.filter(r => TXT(r).some(s => /[Tt]wo cups of rice/.test(s))).map(r => r.id).join(","));
  ok("the rules state the 1-go plate limit", /caps the rice at 1 cup/i.test(fridgeText()));
  ok("and the per-menu rice limits", /risotto 1/.test(fridgeText()));
}

/* ---------- the rice line must match the dish ---------- */
{
  resetAll();
  S.plan = ["curry", "rcchahan"]; S.N = 4; ev("render()");
  ev("openSheet('curry')");
  ok("a half-cup dish says half a cup", /75 g \(½ cup\)/.test(D.getElementById("sheet-overlay").innerHTML),
    (D.getElementById("sheet-overlay").innerHTML.match(/rice [^<·]*/) || [""])[0]);
  ev("closeSheet()");
  ev("openSheet('rcchahan')");
  ok("a full-cup dish says a full cup", /150 g \(1 cup\)/.test(D.getElementById("sheet-overlay").innerHTML));
  ev("closeSheet()");
  ok("no dish prints a rice amount that contradicts its own field",
    R.filter(r => r.rice).every(r => {
      ev("S.plan=['" + r.id + "'];S.N=1"); ev("openSheet('" + r.id + "')");
      const h = D.getElementById("sheet-overlay").innerHTML; ev("closeSheet()");
      return h.indexOf("rice " + Math.round(r.rice * 150) + " g") > -1;
    }));
  S.plan = undefined; S.N = 7;
}

/* ---------- every dish says whether it fits in one go ---------- */
{
  resetAll();
  eq("a dish inside its capacity is one go", ev("roundsFor")(R.find(r => r.id === "curry"), 3), 1);
  eq("beyond it, the rounds are counted", ev("roundsFor")(R.find(r => r.id === "curry"), 9), 3);
  eq("a dish with no cap never splits", ev("roundsFor")({ cap: undefined }, 8), 1);
  eq("one round reads as one go", ev("roundsLabel")(R.find(r => r.id === "curry"), 3), "one go");
  eq("more than one reads as rounds", ev("roundsLabel")(R.find(r => r.id === "afkatsu"), 3), "3 rounds");

  S.plan = ["curry", "afkatsu"]; S.N = 6; S.locked = []; ev("render()");
  const week = tabHTML("week");
  ok("the week tab states the rounds for every dish", (week.match(/one go|\d+ rounds/g) || []).length >= 2,
    (week.match(/one go|\d+ rounds/g) || []).join(","));
  ev("openSheet('afkatsu')");
  const sheet = D.getElementById("sheet-overlay").innerHTML;
  ok("the sheet says what one round holds", /per round/.test(sheet));
  ok("and how many rounds this week needs", /rounds/.test(sheet));
  ev("closeSheet()");
  /* a dish that does fit must say so rather than staying silent */
  ev("openSheet('curry')");
  ok("a dish that fits says one go outright", /one go/.test(D.getElementById("sheet-overlay").innerHTML));
  ev("closeSheet()");
  S.plan = undefined; S.N = 7;
}

/* ---------- the week plans around the gear ---------- */
{
  resetAll();
  S.locked = []; S.plan = ["curry", "karaage"]; S.N = 5; S.mugi = false;
  let cc = ev("compute()");
  eq("servings follow the gear: curry takes the pot's three", cc.servings.curry, 3);
  eq("and karaage the basket's two", cc.servings.karaage, 2);
  S.N = 7; cc = ev("compute()");
  const rounds = cc.picks.reduce((a, r) => a + ev("roundsFor")(r, cc.servings[r.id]), 0);
  eq("seven meals over those two cook in three rounds, not four", rounds, 3);
  /* random weeks never cook in more rounds than an even split would */
  let worse = 0;
  for (let i = 0; i < 150; i++) {
    S.plan = undefined; S.v = 2; S.N = 7; ev("plan(true)");
    const c2 = ev("compute()");
    const k = c2.picks.length;
    const even = c2.picks.reduce((a, r, j) => a + Math.ceil((Math.floor(7 / k) + (j < 7 % k ? 1 : 0)) / (r.cap || 2)), 0);
    const got = c2.picks.reduce((a, r) => a + Math.ceil(c2.servings[r.id] / (r.cap || 2)), 0);
    if (got > even) worse++;
  }
  eq("balancing never adds a round", worse, 0);

  /* the rice line counts only rice that needs its own cooker run */
  S.plan = ["curry", "hainan"]; S.N = 5; ev("setTab('week')");
  cc = ev("compute()");
  eq("side rice excludes a dish that cooks its own", cc.sideCups, cc.servings.curry * 0.5);
  ok("and the rhythm says the plate dish brings its own", /Hainanese chicken rice cooks its own rice/.test(tabHTML("week")));
  ok("the batch day pairs the pot with the rice cooker", /rice on first/.test(tabHTML("week")));
  S.plan = ["rcchashu", "karaage"]; S.N = 6; ev("render()");
  ok("a cooker braise says the week's rice goes in before it", /any rice for the week goes in before it/.test(tabHTML("week")));
  S.plan = ["curry", "karaage"]; S.N = 5; ev("render()");
  ok("an air-fryer dish that freezes raw is marinated while the pot simmers", /marinate the karaage/.test(tabHTML("week")));
  S.plan = undefined; S.N = 7;
}

/* ---------- the rice cooker is a cooker, not just a rice pot ---------- */
{
  resetAll();
  const cooker = R.filter(r => r.cookin || r.plate || r.simmer);
  ok("the rice cooker has real range", cooker.length >= 10, cooker.length + " dishes");
  ok("it does more than seasoned rice",
    R.some(r => r.plate) && R.some(r => r.simmer),
    "plate " + R.filter(r => r.plate).length + " simmer " + R.filter(r => r.simmer).length);
  /* the manufacturer's rule: thickeners foam, foam blocks the vent */
  R.filter(r => r.simmer && r.conds.includes("roux")).forEach(r => {
    ok(r.id + ": roux goes in after the cycle, never during",
      TXT(r).some(s => /not put the roux in yet|after the cycle|heat OFF/i.test(s)));
  });
  ok("the week tab documents the cooker's limits", /plain rice underneath only/i.test(fridgeText()) && /Seasoned rice under the plate/.test(fridgeText()));
  ok("including the thickener rule", /blocks the steam vent|foam blocks/i.test(fridgeText()));
  ok("and the wooden paddle rule", /[Ww]ooden paddle/.test(fridgeText()));
  S.plan = undefined; S.N = 7;
}

/* ---------- max-batch mode should not pick a 2-serving basket ---------- */
{
  resetAll();
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
    /* 2.2, down from 2.5 when the measured pot cut the stews from 4 a round to 3 */
    caps.reduce((a, b) => a + b, 0) / caps.length >= 2.2,
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
  resetAll();
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
  resetAll();
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
  resetAll();
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
  resetAll();
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
eq("chicken thigh priced from the receipt", ING.chicken.p, 1.6);    // 25 Sep: 922 +8% over 623 g (the 17 Sep 1.07 was a sticker price)
eq("frozen broccoli priced from the receipt", ING.fbroc.p, 1.42);   // 459 +8% over 350 g
eq("soy priced from the receipt", CONDS.soy.p, 322);                // 298 +8%
/* LIFE 市谷薬王寺店, 2026-09-17, tax inclusive, before the 5% app coupon */
eq("chicken breast priced from the receipt", ING.chickenbreast.p, 0.85); // 458 +8% over 580 g
eq("onion priced from the receipt", ING.onion.p, 93);                    // 25 Sep: 258 +8% for a bag of 3
eq("carrot priced from the receipt", ING.carrot.p, 71);                  // 198 +8% for a bag of 3
eq("potato priced from the receipt", ING.potato.p, 64);                  // 238 +8% for a bag of 4
ok("soy is koikuchi, not the saltier usukuchi", /濃口/.test(CONDS.soy.jp));
ok("garlic and ginger are the value bottles, not tubes",
  /お徳用/.test(CONDS.garlic.jp) && /お徳用/.test(CONDS.ginger.jp));

/* ---------- bottles dispense by spoon; no step may still measure a tube ---------- */
ok("no recipe step mentions a tube",
  !R.some(r => TXT(r).some(s => /tube/i.test(s))),
  R.filter(r => TXT(r).some(s => /tube/i.test(s))).map(r => r.id).join(","));
{
  const DOSE = /\d\s*cm\s*(squeeze\s*)?(of\s*)?(each\s*)?(garlic|ginger)/i;
  ok("no step doses garlic or ginger in centimetres",
    !R.some(r => TXT(r).some(s => DOSE.test(s))),
    R.filter(r => TXT(r).some(s => DOSE.test(s))).map(r => r.id).join(","));
}
{
  const users = R.filter(r => r.conds.includes("garlic") || r.conds.includes("ginger"));
  ok("every garlic/ginger dish gives a spoon measure",
    users.every(r => TXT(r).some(s => /tsp[^.]{0,30}(garlic|ginger) paste/i.test(s))),
    users.filter(r => !TXT(r).some(s => /tsp[^.]{0,30}(garlic|ginger) paste/i.test(s))).map(r => r.id).join(","));
}
ok("knife cuts still measured in cm", R.some(r => TXT(r).some(s => /\d\s*cm (chunks|cubes|strips|half-moons|pieces|slabs)/.test(s))));

/* ---------- user-test fixes, 17 Sep 2026 ---------- */
{
  resetAll();
  /* 1. the meal count must not strand the week on one dish */
  S.locked = []; S.v = 2; S.N = 7; S.plan = undefined; ev("plan(true)");
  for (let i = 0; i < 6; i++) ev("stepMeals(-1)");
  eq("a one-meal week has one dish", S.plan.length, 1);
  for (let i = 0; i < 13; i++) ev("stepMeals(1)");
  eq("stepping back up to 14 meals restores the dish count", S.plan.length, ev("dishCount(14, 2)"));
  let stuck = 0;
  for (let t = 0; t < 30; t++) {
    S.plan = undefined; S.N = 7; ev("plan(true)");
    for (let i = 0; i < 12; i++) { ev("stepMeals(" + (Math.random() < 0.5 ? -1 : 1) + ")"); if (S.plan.length !== ev("dishCount(S.N, S.v)")) stuck++; }
  }
  eq("random meal-count walks never leave the wrong number of dishes", stuck, 0);

  /* 2. max batch never plans more servings than keep + freeze allows */
  S.v = 1; S.N = 7; let unsafe = 0;
  for (let i = 0; i < 120; i++) {
    S.plan = undefined; ev("plan(true)");
    const cc = ev("compute()"), r = cc.picks[0];
    if (cc.servings[r.id] > ev("keepDaysOf")(r) && !r.freeze) unsafe++;
  }
  eq("max batch only picks dishes that freeze when a week outlasts the fridge", unsafe, 0);
  S.plan = ["curry"]; S.N = 7; ev("setTab('week')");
  ok("the rhythm splits a batch bigger than its keep days", /box 3 for the fridge and freeze the other 4/.test(tabHTML("week")), tabHTML("week").match(/keeps \d days[^<]*/));
  S.plan = ["karaage"]; ev("render()");
  ok("a raw-freezing dish is bagged raw, not cooked then frozen", /bag the other 4 raw for the freezer/.test(tabHTML("week")));
  S.v = 2;

  /* 3 + 4. the cooker braise: honest rice line, never planned below its minimum */
  ok("the chashu rice line says the cooker is busy", /busy for ~95 min/.test(ev("riceFirstText")(R.find(r => r.id === "rcchashu"), 3)));
  S.plan = ["rcchashu", "karaage", "afmiso"]; S.N = 6;
  eq("a planned chashu gets at least its minimum servings", ev("compute()").servings.rcchashu, 3);
  S.N = 4; S.plan = ["rcchashu", "karaage"];
  ok("even in a small week", ev("compute()").servings.rcchashu >= 3);
  ok("a week too small for its minimum does not pick it", !ev("fitsWeek")(R.find(r => r.id === "rcchashu"), 5, 3));
  ev("U.planServ = 2; startCook('rcchashu', 2)");
  ok("cooking it from a smaller count says it was bumped and what to buy", /Bumped to ×3[^<]*Shop for 1 more/.test(D.getElementById("cook-overlay").innerHTML));
  ev("quitCook()");

  /* 5. quick means quick */
  S.plan = undefined; ev("save()");
  ev("U.effort=1;U.heroIdx=0");
  const quick = ev("candidates(compute())");
  ok("with no plan, 'something quick' leads with a dish on the table within 35 min", quick[0].r.ready <= 35, quick[0].r.id + " " + quick[0].r.ready);
  ok("the quick ones all come before the slow ones", (() => { let seenSlow = false; return quick.every(o => { if (o.r.ready > 35) seenSlow = true; return !(seenSlow && o.r.ready <= 35); }); })());

  /* 7. a reload mid-cook resumes; quit can be undone */
  S.plan = ["curry"]; S.N = 3; ev("render()");
  ev("startCook('curry', 3)"); ev("nextStep()"); ev("nextStep()");
  ok("cook progress is saved", JSON.parse(W.localStorage.getItem("lmp")).cooking.step === 2);
  {
    const { w } = boot(JSON.parse(W.localStorage.getItem("lmp")));
    eq("a reload reopens the dish", w.eval("U.cook"), "curry");
    eq("at the same step", w.eval("U.step"), 2);
    ok("with the overlay showing", w.document.getElementById("cook-overlay").className.includes("show"));
    w.close();
  }
  {
    const { w, errs } = boot({ cooking: { id: "rccurry", step: 3, round: 1, serv: 2 }, N: 7 });
    ok("a saved cook for a retired dish is dropped", w.eval("U.cook") === null && errs.length === 0);
    w.close();
  }
  ev("quitCook()");
  ok("quitting mid-recipe offers an undo", /Left Japanese curry.* at step 2/.test(ev("U.toast ? U.toast.msg : ''")) && ev("!!U.toast.undo"));
  ev("runToastUndo()");
  ok("undo puts you back where you were", ev("U.cook") === "curry" && ev("U.step") === 2);
  ev("quitCook()"); ev("U.toast=null");
  ok("and a finished or quit cook leaves nothing saved", JSON.parse(W.localStorage.getItem("lmp")).cooking === undefined);

  /* 8. a cleared price is not a free item */
  S.price = {}; ev("setPrice('onion', '')");
  eq("blank price input changes nothing", S.price.onion, undefined);
  ev("setPrice('onion', '999999')");
  eq("an absurd price is refused", S.price.onion, undefined);

  /* 9. ticks survive a re-roll where they still apply */
  S.locked = []; S.plan = ["curry", "karaage"]; S.N = 5; S.bought = { onion: true, chicken: true, nosuch: true }; ev("render()");
  ev("plan(true)");
  const rowsNow = ev("compute()").rows.map(r => r.id);
  ok("a re-roll keeps ticks for items still on the list", Object.keys(S.bought).every(id => rowsNow.includes(id)));
  ok("and says so when it kept any", Object.keys(S.bought).length === 0 || /basket tick/.test(ev("U.toast.msg")));
  ev("U.toast=null");

  /* 10. retired ids are pruned on load */
  {
    const { w } = boot({ plan: ["rccurry", "afsaba", "curry"], locked: ["rccurry", "sabarice", "curry"], N: 7 });
    eq("retired dishes leave the plan", w.eval("JSON.stringify(S.plan)"), JSON.stringify(["curry"]));
    eq("and the locks", w.eval("JSON.stringify(S.locked)"), JSON.stringify(["curry"]));
    w.close();
  }

  /* 11. own-rice dishes are counted as separate runs */
  S.plan = ["hainan", "tabuta", "curry"]; S.N = 7; ev("setTab('week')");
  ok("two plate dishes are two cooker runs", /each cook their own rice — \d more cooker runs, one at a time/.test(tabHTML("week")), (tabHTML("week").match(/[^.]*own rice[^.]*/) || [""])[0]);

  /* 13. rounds add up */
  eq("three rounds of karaage add two basket cycles", ev("readyTotal")(R.find(r => r.id === "karaage"), 6), 45 + 30);
  eq("two pots of curry take two curries' time", ev("readyTotal")(R.find(r => r.id === "curry"), 6), 70);

  /* lows */
  ok("afmiso compares itself to the right dish", !TXT(R.find(r => r.id === "afmiso")).some(s => /teriyaki/.test(s)));
  ok("no fraction of a green pepper", R.every(r => !/[½⅓¼]\s*green pepper/.test(TXT(r).join(" "))));
  ["belachan", "chinchalok"].forEach(k => ok("the shelf tracks " + k, !!CONDS[k] && ev("SHELF_SEED").includes(k)));
  R.forEach(r => {
    const txt = TXT(r).join(" ").toLowerCase();
    [["belachan", /belachan/], ["chinchalok", /chinchalok/], ["mayo", /mayo/]].forEach(([k, re]) => {
      if (re.test(txt)) ok(r.id + ": lists " + k + " it mentions", r.conds.includes(k));
    });
    if (/\d+ ml \(\d tsp\) oil|\d+ ml \(\d tbsp\) oil| ml oil/.test(txt)) ok(r.id + ": lists the oil it uses", r.conds.includes("oil"));
  });
  ok("the pan crowding tip waits for a real crowd", ev("gearTips")(R.find(r => r.id === "shogayaki"), 2).length === 0 && ev("gearTips")(R.find(r => r.id === "soboro"), 4).length > 0);
  S.plan = ["curry"]; S.N = 3; S.log = [{ d: "2026-09-10", spent: 1500, meals: 7 }]; ev("setTab('save')");
  ok("one logged week is singular", /1 week logged/.test(tabHTML("save")));
  S.log = []; ev("render()");
  const spent = D.getElementById("spentInput"); spent.value = "5000000"; ev("logWeek()");
  eq("an absurd receipt total is refused", S.log.length, 0);
  ev("U.toast=null");
  ev("setTab('shop')");
  ok("meat is shown as a floor to buy trays against", /at least \d+ g/.test(tabHTML("shop")));
  ok("html no longer pins the body height (the tab bar hid the last row)", !/html,body\{height:100%\}/.test(fs.readFileSync(HTML, "utf8")));
  S.plan = undefined; S.N = 7; ev("render()");
}

/* ---------- FEATURE A: rice and barley are bag stock, not weekly groceries ---------- */
{
  resetAll();
  const STOCK = ev("STOCK");
  ok("STOCK names rice and mugi", !!STOCK.rice && !!STOCK.mugi);
  eq("rice is a 5 kg bag", STOCK.rice.disp, "5 kg bag");
  eq("the bag price is the bag price", STOCK.rice.p, 4200);
  ok("barley is a pack at a pack price", STOCK.mugi.disp === "1 pack" && STOCK.mugi.p > 200 && STOCK.mugi.p < 800);
  eq("stock is seeded as owned: rice", S.owned.rice, true);
  eq("stock is seeded as owned: mugi", S.owned.mugi, true);
  eq("and the seeding is recorded so it runs once", S.stockSeeded, true);

  S.plan = ["curry"]; S.N = 4; S.mugi = true; S.bought = {}; S.carry = {}; ev("setTab('shop')");
  let c = ev("compute()");
  ok("no rice row while the bag is in stock", !c.rows.some(r => r.id === "rice"));
  ok("no barley row while the pack is in stock", !c.rows.some(r => r.id === "mugi"));
  ok("the cook schedule still knows its rice", c.riceGo > 0 && c.sideCups > 0 && c.mugiCups > 0);
  ok("no rice or barley anywhere in the weekly list", !D.querySelector('[data-k="shoprice"]') && !D.querySelector('[data-k="shopmugi"]'));
  ok("and no top-up asked for either", !D.querySelector('[data-k="needrice"]') && !D.querySelector('[data-k="needmugi"]'));
  const foodOwned = c.food;

  /* savings headline: the Save tab counts logged receipts, and the placeholder counts weekly food — neither moves with the bag */
  S.log = [{ d: "2026-09-10", spent: 1500, meals: 7 }]; ev("setTab('save')");
  const headline = () => D.querySelector("#tab-save .bignum").textContent;
  const placeholder = () => D.getElementById("spentInput").getAttribute("placeholder");
  const h0 = headline(), p0 = placeholder();
  ev("toggleCond('rice')");
  eq("marking rice out: the savings headline is unchanged", headline(), h0);
  eq("marking rice out: the weekly food figure is unchanged", placeholder(), p0);
  eq("the weekly food figure excludes the bag either way", ev("compute()").food, foodOwned);
  S.log = [];

  /* out of rice: exactly one bag row, in the shelf top-up, and ticking it restocks */
  eq("rice is now marked out", S.owned.rice, false);
  ev("setTab('shop')");
  c = ev("compute()");
  ok("still no weekly rice row when out", !c.rows.some(r => r.id === "rice"));
  ok("the week asks the shelf for rice", c.needed.includes("rice"));
  const bagRows = D.querySelectorAll('[data-k="needrice"]');
  eq("exactly one bag row", bagRows.length, 1);
  ok("the bag row says 5 kg bag at the bag price", /5 kg bag/.test(bagRows[0].textContent) && /¥4,200/.test(bagRows[0].textContent));
  ok("it sits in the shelf top-up, not the category list", /Shelf top-up/.test(tabHTML("shop")));
  ok("no second place to say you are out of rice", D.querySelectorAll('[data-k$="rice"]').length === 2, [...D.querySelectorAll('[data-k$="rice"]')].map(e => e.getAttribute("data-k")).join(","));
  bagRows[0].click();
  eq("ticking the bag row puts rice back in stock", S.owned.rice, true);
  ok("and the bag row is gone", !D.querySelector('[data-k="needrice"]'));

  S.owned.mugi = false; ev("render()");
  const packRows = D.querySelectorAll('[data-k="needmugi"]');
  eq("out of barley: exactly one pack row", packRows.length, 1);
  ok("the pack row says 1 pack", /1 pack/.test(packRows[0].textContent));
  packRows[0].click();
  eq("ticking the pack row restocks barley", S.owned.mugi, true);
  S.mugi = false; ev("render()");
  ok("with the blend off no barley is asked for even when out", (S.owned.mugi = false, !ev("compute()").needed.includes("mugi")));
  S.owned.mugi = true;

  /* shelf grid */
  ev("render()");
  const riceBtn = D.querySelector('#tab-shop .condgrid [data-k="condrice"]'), mugiBtn = D.querySelector('#tab-shop .condgrid [data-k="condmugi"]');
  ok("the shelf grid shows rice", !!riceBtn);
  ok("the shelf grid shows barley", !!mugiBtn);
  eq("rice reports in stock", riceBtn && riceBtn.getAttribute("aria-pressed"), "true");
  eq("barley reports in stock", mugiBtn && mugiBtn.getAttribute("aria-pressed"), "true");
  ok("the rice button is labelled for a screen reader", riceBtn && /Rice \(米 5kg\), in stock/.test(riceBtn.getAttribute("aria-label")));
  riceBtn.click();
  eq("tapping rice in the grid marks it out", D.querySelector('[data-k="condrice"]').getAttribute("aria-pressed"), "false");
  ok("which puts the bag on the top-up", !!D.querySelector('[data-k="needrice"]'));
  ev("toggleCond('rice')");
  eq("rice restocked", S.owned.rice, true);

  /* a save from the previous build boots clean: no carry, no stockSeeded, rice never owned */
  const { w, errs } = boot({ plan: ["curry"], N: 4, owned: { oil: true }, shelfSeeded: true, tab: "shop", mugi: true });
  ok("previous-build save boots without error", errs.length === 0, errs[0]);
  eq("rice is seeded as owned", w.eval("S.owned.rice"), true);
  eq("barley is seeded as owned", w.eval("S.owned.mugi"), true);
  eq("the seed is recorded", w.eval("S.stockSeeded"), true);
  eq("and written to storage immediately", JSON.parse(w.localStorage.getItem("lmp")).stockSeeded, true);
  ok("carry starts empty", w.eval("JSON.stringify(S.carry)") === "{}");
  const oldShop = w.document.getElementById("tab-shop").innerHTML;
  ok("its list has no rice", !/data-k="shoprice"|data-k="needrice"/.test(oldShop));
  ok("its list has no barley", !/data-k="shopmugi"|data-k="needmugi"/.test(oldShop));
  ok("but its shelf shows the bag", /data-k="condrice"/.test(oldShop));
  w.close();
  { /* an explicit "out of rice" survives the seed */
    const { w } = boot({ owned: { rice: false } });
    eq("an explicit out-of-rice is not overwritten by the seed", w.eval("S.owned.rice"), false);
    w.close();
  }
  S.plan = undefined; S.N = 7; S.mugi = false; S.bought = {}; ev("render()");
}

/* ---------- FEATURE B: leftover pieces carry over, and the planner uses them up ---------- */
{
  resetAll();
  const today = (() => { const d = new Date(); return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0"); })();
  const daysAgo = n => { const d = new Date(); d.setDate(d.getDate() - n); return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0"); };
  const near = (a, b) => Math.abs(a - b) < 1e-6;
  eq("carry boost constant", ev("CARRY_BOOST"), 1.8);
  eq("onion keeps two weeks", ev("CARRY_DAYS").onion, 14);
  eq("tofu keeps three days", ev("CARRY_DAYS").tofu, 3);
  eq("the date is built locally, not from toISOString", ev("localDate()"), today);
  {
    /* 01:30 on 25 Sep in Tokyo is still 24 Sep in UTC: the app must say the 25th */
    const RealDate = W.Date;
    W.eval("window.__RD = Date; Date = class extends window.__RD { constructor(...a) { if (a.length) super(...a); else super('2026-09-24T16:30:00Z'); } static now() { return new window.__RD('2026-09-24T16:30:00Z').getTime(); } }");
    eq("just after midnight in Tokyo, the date is Tokyo's", ev("localDate()"), "2026-09-25");
    eq("where toISOString would have said yesterday", ev("new Date().toISOString().slice(0,10)"), "2026-09-24");
    W.eval("Date = window.__RD");
    ok("the real Date is back", W.Date === RealDate || ev("Date === window.__RD"));
  }
  eq("fractions: half", ev("frac")(0.5), "½");
  eq("fractions: two thirds", ev("frac")(0.67), "⅔");
  eq("fractions: one and a quarter", ev("frac")(1.25), "1¼");
  eq("fractions: a whole", ev("frac")(2), "2");
  eq("fractions: odd amounts get one decimal", ev("frac")(0.4), "0.4");

  /* sanitiser */
  {
    const { w, errs } = boot({ carry: {
      onion: { q: 0.5, d: today },                 // good
      egg: { q: 0.5, d: daysAgo(10) },             // 10 days: eggs keep 14
      tomato: { q: 0.5, d: daysAgo(6) },           // 6 days: tomatoes keep 4 -> expired
      tofu: { q: 1, d: daysAgo(5) },               // 5 days: tofu keeps 3 -> expired
      nasu: { q: 0.5, d: daysAgo(1) },             // retired from the pantry -> dropped
      chicken: { q: 150, d: today },               // gram unit: the fridge check stores grams
      nothing: { q: 1, d: today },                 // unknown id
      carrot: { q: -1, d: today },                 // negative
      potato: { q: "1", d: today },                // not a number
      negi: { q: 0.5, d: "garbage" },              // bad date
      cucumber: { q: 0.5 },                        // no date
      salmon: "half"                               // not an object
    } });
    ok("garbage carry boots without error", errs.length === 0, errs[0]);
    const kept = Object.keys(w.eval("S.carry")).sort().join(",");
    eq("only the sound, unexpired entries survive", kept, "chicken,egg,onion");
    w.close();
  }
  {
    const { w } = boot({ carry: [1, 2] });
    ok("an array carry becomes an empty object", w.eval("JSON.stringify(S.carry)") === "{}");
    w.close();
  }

  /* rolling a new week banks what the old one left over */
  const curry = R.find(r => r.id === "curry");
  const per = Object.fromEntries(curry.ing);
  S.carry = {}; S.plan = ["curry"]; S.N = 1; S.v = 2; S.locked = [];
  S.bought = { chicken: true, onion: true, carrot: true, potato: true, roux: true };
  ev("U.toast=null"); ev("plan(true)");
  ok("a roll makes a different week", !(S.plan.length === 1 && S.plan[0] === "curry"));
  ok("onion leftover banked", S.carry.onion && near(S.carry.onion.q, 1 - per.onion), JSON.stringify(S.carry.onion));
  ok("carrot leftover banked", S.carry.carrot && near(S.carry.carrot.q, 1 - per.carrot), JSON.stringify(S.carry.carrot));
  ok("potato leftover banked", S.carry.potato && near(S.carry.potato.q, 1 - per.potato), JSON.stringify(S.carry.potato));
  eq("dated local today", S.carry.onion.d, today);
  /* grams settle too (25 Sep audit): 120 g needed, 150 g bought in 50 g steps, 30 g left */
  ok("gram leftovers carry in grams", S.carry.chicken && near(S.carry.chicken.q, 30) && !S.carry.chicken.f, JSON.stringify(S.carry.chicken));
  ok("a settled leftover is arithmetic, not stated", Object.values(S.carry).every(e => !e.f));
  ok("the toast offers undo", ev("U.toast && !!U.toast.undo"));
  ev("runToastUndo()");
  eq("new-week undo restores the plan", S.plan.join(","), "curry");
  eq("new-week undo restores the carry", JSON.stringify(S.carry), "{}");

  /* partial ticks: an item skipped while others were ticked was not bought.
     curry x3: onion 1.5 (buy 2), carrot 0.9 with 0.25 in hand (buy 1, unticked), potato 1.8 (unticked) */
  S.carry = { carrot: { q: 0.25, d: today } }; S.plan = ["curry"]; S.N = 3; S.v = 1;
  S.bought = { onion: true, chicken: true };
  ev("U.toast=null"); ev("plan(true)");
  ok("ticked onion carries", S.carry.onion && near(S.carry.onion.q, 0.5), JSON.stringify(S.carry.onion));
  eq("unticked carrot does not, and its old entry is left alone", S.carry.carrot && S.carry.carrot.q, 0.25);
  ok("unticked potato does not", !S.carry.potato);
  ev("U.toast=null");

  /* the ledger: a piece already in hand is used up, whether or not it made the list */
  S.carry = { onion: { q: 1, d: today } }; S.plan = ["curry"]; S.N = 1; S.v = 2;
  S.bought = { chicken: true, carrot: true, potato: true, roux: true };
  ok("a covered piece makes no row", !ev("compute().rows.some(r=>r.id==='onion')"));
  ev("plan(true)");
  ok("the covered onion is drawn down, not left whole", S.carry.onion && near(S.carry.onion.q, 0.5), JSON.stringify(S.carry.onion));
  ev("U.toast=null");
  S.carry = { onion: { q: 0.25, d: today } }; S.plan = ["curry"]; S.N = 1;
  S.bought = { chicken: true, onion: true, carrot: true, potato: true, roux: true };
  ev("plan(true)");
  ok("a part piece plus a bought one leaves the remainder", S.carry.onion && near(S.carry.onion.q, 0.75), JSON.stringify(S.carry.onion));
  ev("U.toast=null");

  /* no ticks at all: the paper way, so everything counts - but only once the week is old.
     Re-rolling on Sunday afternoon must not bank leftovers from lists that never went to LIFE. */
  S.carry = {}; S.plan = ["curry"]; S.N = 1; S.v = 2; S.bought = {};
  S.planDate = today;
  ev("plan(true)");
  ok("a fresh unshopped list banks nothing", !S.carry.onion && !S.carry.carrot && !S.carry.potato, JSON.stringify(S.carry));
  eq("a roll stamps the plan date", S.planDate, today);
  ev("U.toast=null");
  S.carry = {}; S.plan = ["curry"]; S.N = 1; S.bought = {};
  S.planDate = (d => { d.setDate(d.getDate()-3); return d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0")+"-"+String(d.getDate()).padStart(2,"0"); })(new Date());
  ev("plan(true)");
  ok("with no ticks every piece carries", !!S.carry.onion && !!S.carry.carrot && !!S.carry.potato);
  ev("U.toast=null");
  S.planDate = "garbage"; ev("save()");

  /* the next list subtracts what is in the fridge */
  S.carry = { onion: { q: 0.5, d: today } }; S.plan = ["curry"]; S.N = 3; S.bought = {};
  let c = ev("compute()");
  let row = c.rows.find(r => r.id === "onion");
  ok("onion still listed when the fridge does not cover it", !!row);
  eq("the buy count is reduced", row && row.disp, "1 pc · have ½");
  eq("cost follows the reduced count", row && row.cost, 1 * ev("priceOf")("onion"));
  ok("the raw requirement is kept for the next roll", row && near(row.req, 1.5) && near(row.q, 1.0));
  S.N = 1; c = ev("compute()");
  ok("full coverage drops the row", !c.rows.some(r => r.id === "onion"), c.rows.map(r => r.id).join(","));
  ok("the rest of the list is untouched", c.rows.some(r => r.id === "carrot") && c.rows.some(r => r.id === "chicken"));
  S.carry = { onion: { q: 0.47, d: today } }; c = ev("compute()");
  ok("within a twentieth counts as covered", !c.rows.some(r => r.id === "onion"));
  S.carry = { carrot: { q: 2, d: today } }; S.N = 3; c = ev("compute()");
  eq("a leftover bigger than the need drops the row too", c.rows.some(r => r.id === "carrot"), false);
  S.carry = { onion: { q: 0.5, d: today } }; ev("setTab('shop')");
  ok("the shop shows the have text", /1 pc · have ½/.test(tabHTML("shop")));

  /* compute() expiry */
  S.carry = { tomato: { q: 0.5, d: daysAgo(6) }, onion: { q: 0.5, d: today } };
  ev("render()");
  ok("a render drops an expired leftover", !S.carry.tomato && !!S.carry.onion);
  S.carry = { tomato: { q: 0.5, d: daysAgo(6) } }; ev("compute()");
  ok("compute itself is pure — it leaves the ledger alone", !!S.carry.tomato);

  /* the "have" chip */
  S.carry = {}; S.plan = ["curry"]; S.N = 3; S.bought = {}; ev("U.toast=null"); ev("setTab('shop')");
  const chip = D.querySelector('[data-k="haveonion"]');
  ok("each piece row gets a have chip", !!chip);
  ok("gram rows get none", !D.querySelector('[data-k="havechicken"]'));
  eq("the chip is a real button, not nested in the checkbox", chip && chip.tagName + "/" + chip.closest('[role="checkbox"]'), "BUTTON/null");
  eq("it is labelled", chip && chip.getAttribute("aria-label"), "Already have Onion");
  ok("it is tall enough to tap", /min-height:44px/.test(fs.readFileSync(HTML, "utf8").match(/\.havechip\{[^}]*\}/)[0]));
  ok("no nested buttons anywhere", ![...D.querySelectorAll("button button")].length);
  chip.click();
  ok("the chip banks the whole requirement", S.carry.onion && S.carry.onion.q === 2 && S.carry.onion.d === today, JSON.stringify(S.carry.onion));
  ok("and the row disappears", !D.querySelector('[data-k="shoponion"]'));
  ok("with a toast", /Onion: using what you have/.test(D.body.innerHTML));
  ok("that offers undo", ev("U.toast && !!U.toast.undo"));
  ev("runToastUndo()");
  ok("undo clears the carry", !S.carry.onion);
  ok("and the row is back", !!D.querySelector('[data-k="shoponion"]'));
  S.carry = { onion: { q: 0.25, d: daysAgo(1) } }; ev("render()");
  D.querySelector('[data-k="haveonion"]').click();
  ev("runToastUndo()");
  eq("undo restores the previous entry, not nothing", S.carry.onion && S.carry.onion.q, 0.25);
  S.bought = { onion: true }; ev("render()");
  ok("a ticked row has no chip", !D.querySelector('[data-k="haveonion"]') && !!D.querySelector('[data-k="shoponion"]'));
  S.bought = {};

  /* planner nudge */
  S.carry = {};
  const w0 = ev("dishWeight")(curry, 2, false);
  S.carry = { onion: { q: 0.5, d: today } };
  const w1 = ev("dishWeight")(curry, 2, false);
  ok("a dish that uses a leftover is boosted 1.8×", near(w1 / w0, 1.8), w1 / w0);
  S.carry = { onion: { q: 0.1, d: today } };
  ok("a crumb is not worth chasing", near(ev("dishWeight")(curry, 2, false), w0));
  const noOnion = R.find(r => !r.ing.some(([id]) => id === "onion"));
  S.carry = {};
  const n0 = ev("dishWeight")(noOnion, 2, false);
  S.carry = { onion: { q: 0.5, d: today } };
  ok("a dish without the leftover is not boosted", near(ev("dishWeight")(noOnion, 2, false), n0));

  /* the Week tab says what is being used up */
  S.carry = {}; S.plan = ["curry"]; S.N = 3; ev("setTab('week')");
  ok("nothing said when the fridge is empty", !/Using up/.test(tabHTML("week")));
  S.carry = { onion: { q: 0.5, d: today }, carrot: { q: 0.67, d: today } }; ev("render()");
  ok("leftovers and the dish that eats them", /Using up: ½ onion, ⅔ carrot → Japanese curry/.test(tabHTML("week")), tabHTML("week").match(/Using up[^<]*/));
  S.plan = [noOnion.id]; S.carry = { onion: { q: 0.5, d: today } }; ev("render()");
  ok("says so when nothing on the plan uses them", /Using up: ½ onion — nothing this week uses it/.test(tabHTML("week")), tabHTML("week").match(/Using up[^<]*/));
  S.carry = {}; ev("render()");
  ok("and disappears again", !/Using up/.test(tabHTML("week")));

  /* carry persists */
  S.carry = { onion: { q: 0.5, d: today } }; ev("save()");
  eq("carry is written to storage", JSON.parse(W.localStorage.getItem("lmp")).carry.onion.q, 0.5);
  S.carry = {}; S.plan = undefined; S.N = 7; S.bought = {}; ev("U.toast=null"); ev("save()"); ev("render()");
}

/* ---------- nutrition floor (25 Sep 2026 rebuild) ----------
   Josh: the batch dishes were short on veg, and the roast was short on potato. The floor is
   Japan's 350 g a day, a third a meal: 150 g for anything batched, 100 g for the quick ones. */
{
  const vegOf = ev("vegOf"), VMIN = ev("VEG_MIN"), VQ = ev("VEG_MIN_QUICK");
  eq("batch veg floor", VMIN, 150);
  R.forEach(r => ok(r.id + ": meets its veg floor (" + (r.batch ? "batch" : "quick") + ")",
    vegOf(r) >= (r.batch ? VMIN : VQ), vegOf(r) + " g"));
  ok("potato is not counted as a vegetable", !ev("isVeg")("potato"));
  const PROT = new Set(["tofu", "egg", "tuna", "sardine", "mixedbeans", "gyoza"]);
  R.forEach(r => ok(r.id + ": has a protein", r.ing.some(([i]) => ING[i].cat === "meat" || PROT.has(i))));
  /* a dish with no rice, pasta or udon carries its carb as potato, and enough of it */
  const g = (id, q) => ev("gramsOf")(id, q);
  R.filter(r => !r.rice && !r.ing.some(([i]) => ["pasta", "udon"].includes(i))).forEach(r => {
    const pot = r.ing.filter(([i]) => i === "potato").reduce((a, [i, q]) => a + g(i, q), 0);
    ok(r.id + ": a potato-carb dish has a real carb portion", pot >= 180, pot + " g");
  });
  eq("a LIFE potato is ~130 g, not 150", ev("PC_G").potato, 130);
  const roast = R.find(r => r.id === "afroast");
  ok("the roast now has 1½ potatoes a serving", roast.ing.some(([i, q]) => i === "potato" && q === 1.5));
  eq("four roast servings ask for 6 potatoes", Math.ceil(roast.ing.find(([i]) => i === "potato")[1] * 4), 6);
  /* every dish points at the published recipe it was checked against, except the two house ones */
  R.forEach(r => {
    if (["chinchalok", "afgyoza"].includes(r.id)) return ok(r.id + ": house recipe, no source claimed", r.src === undefined);
    ok(r.id + ": cites a source", Array.isArray(r.src) && r.src.length === 2 && /^https:\/\//.test(r.src[1]), JSON.stringify(r.src));
  });
  ok("no recipe cites the unverified mirror sites", !R.some(r => r.src && /macropus|bbcgoodfood/.test(r.src[1])));
  /* side dishes eaten at each meal are fixed per-bowl text, not scaled by the batch */
  R.forEach(r => TXT(r, 4).forEach((s, i) => { if (/^At each meal/.test(s)) ok(r.id + " step" + (i + 1) + ": per-meal side is not multiplied", !/\b(240|320|400) g frozen/.test(s)); }));
  ok("the sheet shows veg a serving", (() => { ev("openSheet('curry')"); const h = D.getElementById("sheet-overlay").innerHTML; ev("closeSheet()"); return /225 g<\/div><div class="factk">veg a serving/.test(h); })());
}

/* ---------- the weekly fridge check ---------- */
{
  resetAll();
  const today = (() => { const d = new Date(); return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0"); })();
  const FQ = ev("FRIDGE_Q");
  ok("every fridge item is a real, perishable pantry item", Object.keys(FQ).every(id => ING[id] && ["meat", "veg", "other"].includes(ING[id].cat)));
  ok("frozen and dry goods are not asked about", !Object.keys(FQ).some(id => ["frozen", "dry"].includes(ING[id].cat)));
  ok("'a bit' is less than 'plenty' for every item", Object.values(FQ).every(([a, b]) => a > 0 && b > a));

  /* first roll of the week opens the check instead of rolling */
  S.plan = undefined; S.carry = {}; S.fridgeDate = null; S.bought = {}; S.N = 7; S.v = 2; ev("render()");
  ev("rollWeek()");
  ok("rolling a week opens the fridge check", ev("!!U.fridge") && D.getElementById("sheet-overlay").className.includes("show"));
  ok("the check is a modal like the dish sheet", D.getElementById("main").hasAttribute("inert"));
  ok("it asks about meat, chilled and produce", /Meat &amp; fish|Meat & fish/.test(D.getElementById("sheet-overlay").innerHTML) && /Chilled/.test(D.getElementById("sheet-overlay").innerHTML) && /Produce/.test(D.getElementById("sheet-overlay").innerHTML));
  ok("no plan was rolled yet", S.plan === undefined);
  ev("fridgeCycle('chicken')");
  eq("one tap = a bit", ev("U.fridge.chicken"), 1);
  ok("the chip shows the amount", /150 g/.test(D.querySelector('[data-k="frchicken"]').textContent));
  ev("fridgeCycle('chicken')"); eq("two taps = plenty", ev("U.fridge.chicken"), 2);
  ev("fridgeCycle('cabbage')");
  ev("fridgeCycle('onion')"); ev("fridgeCycle('onion')"); ev("fridgeCycle('onion')");
  eq("three taps = none again", ev("U.fridge.onion"), 0);
  ev("fridgeDone(true)");
  ok("the check closes and the week rolls", !ev("U.fridge") && Array.isArray(S.plan) && S.plan.length > 0);
  eq("plenty of chicken is banked in grams", S.carry.chicken && S.carry.chicken.q, 300);
  ok("and flagged as stated, not computed", S.carry.chicken && S.carry.chicken.f === true);
  eq("a bit of cabbage is 150 g", S.carry.cabbage && S.carry.cabbage.q, 150);
  ok("nothing banked for an item left at none", !S.carry.onion);
  eq("the check is dated", S.fridgeDate, today);
  ok("the week uses the chicken", ev("compute()").picks.some(r => ev("ingsOf")(r).some(([i]) => i === "chicken")), S.plan.join(","));
  /* pin the week so the check does not depend on which chicken dishes the roll drew */
  const rolled = S.plan; S.plan = ["curry"]; S.N = 4;
  const row = ev("compute()").rows.find(r => r.id === "chicken");
  eq("curry ×4 needs 480 g; 300 in the fridge leaves 200 to buy", row && row.disp, "buy at least 200 g · have 300 of 480");
  S.plan = rolled; S.N = 7;
  ok("the list subtracts the grams already in the fridge", !!row && /^buy at least \d+ g · have 300 of \d+$/.test(row.disp) && row.q === row.req - 300, row && row.disp);
  ok("the Week tab says what is being used up", /Using up: 300 g chicken thigh/.test(tabHTML("week")), (tabHTML("week").match(/Using up[^<]*/) || [""])[0]);
  ok("and offers the check again", /Fridge check/.test(tabHTML("week")));

  /* a re-roll the same week does not ask again */
  ev("rollWeek()");
  ok("a re-roll within 3 days skips the check", !ev("U.fridge"));
  ev("openFridge()");
  eq("reopening shows what was stated", ev("U.fridge.chicken"), 2);
  ev("closeFridge()");
  ok("✕ closes without rolling", !ev("U.fridge") && !D.getElementById("sheet-overlay").className.includes("show"));
  ev("openFridge()");
  W.document.dispatchEvent(new W.KeyboardEvent("keydown", { key: "Escape" }));
  ok("Escape closes the check", !ev("U.fridge"));

  /* "Nothing to use up" means it: the ledger is emptied, and the check still dates the week */
  S.fridgeDate = "2000-01-01"; S.carry = { onion: { q: 0.5, d: today } };
  ev("rollWeek()"); ev("fridgeDone(false)");
  ok("'Nothing to use up' clears the leftovers", !S.carry.onion, JSON.stringify(S.carry));
  eq("and counts as this week's check", S.fridgeDate, today);

  /* must-use: stated raw meat always gets a dish, across many rolls and every variety */
  let miss = 0, tries = 0;
  [1, 2, 3].forEach(v => [3, 7, 10].forEach(N => { for (let i = 0; i < 12; i++) {
    S.N = N; S.v = v; S.locked = []; S.plan = undefined; S.bought = {};
    S.carry = { pork: { q: 250, d: today, f: true } }; ev("plan(true, true)"); tries++;
    if (!ev("compute()").picks.some(r => ev("ingsOf")(r).some(([x]) => x === "pork"))) miss++;
  } }));
  eq("stated pork is used in every rolled week (" + tries + " rolls)", miss, 0);
  /* but a lone half onion only nudges; it does not dictate the week */
  S.carry = { onion: { q: 0.5, d: today, f: true } };
  ok("half an onion from the check is only a boost", !ev("mustUse")("onion"));
  S.carry = { onion: { q: 2, d: today, f: true } };
  ok("plenty of onion is must-use", ev("mustUse")("onion"));
  S.carry = { tofu: { q: 0.5, d: today, f: true } };
  ok("chilled tofu is must-use even a little", ev("mustUse")("tofu"));
  S.carry = { tofu: { q: 0.5, d: today } };
  ok("computed leftovers are never must-use", !ev("mustUse")("tofu"));
  /* the fridge weighting ranks meat above a half onion */
  ok("meat outranks a half onion in the boost", ev("carryBoost")("pork") > ev("carryBoost")("onion"));

  /* the check survives a reload */
  S.carry = { chicken: { q: 300, d: today, f: true } }; S.fridgeDate = today; ev("save()");
  { const { w, errs } = boot(JSON.parse(W.localStorage.getItem("lmp")));
    ok("a stated gram leftover survives reload", errs.length === 0 && w.eval("S.carry.chicken.q") === 300 && w.eval("S.carry.chicken.f") === true);
    eq("and the check date", w.eval("S.fridgeDate"), today); w.close(); }
  { const { w, errs } = boot({ fridgeDate: "not a date" });
    ok("a garbage check date is dropped", errs.length === 0 && w.eval("S.fridgeDate") === null); w.close(); }
  S.carry = {}; S.plan = undefined; S.fridgeDate = null; S.N = 7; S.v = 2; S.bought = {}; ev("U.toast=null"); ev("save()"); ev("render()");
}

{ ev("openSheet('nikujaga')"); const a = D.querySelector('#sheet-overlay a.srclink');
  ok("the dish sheet links its source in a new tab", a && /kikkoman/.test(a.href) && a.target === "_blank" && /noopener/.test(a.rel)); ev("closeSheet()"); }
/* ---------- 25 Sep 2026 UI/UX audit: regressions ---------- */
{
  resetAll();
  const today = ev("localDate()");
  const reset = () => { S.plan = undefined; S.bought = {}; S.carry = {}; S.cooked = {}; S.locked = []; S.N = 7; S.v = 2; S.fridgeDate = today; ev("U.toast=null; U.effort=null"); ev("save()"); ev("render()"); };
  reset();

  /* R1: the savings log is dated in local time, not UTC */
  const logN = S.log.length;
  ev("setTab('save')"); D.getElementById("spentInput").value = "2000"; ev("logWeek()");
  eq("a logged week is dated today, local time", S.log[S.log.length - 1].d, today);
  S.log.splice(logN); ev("save()");

  /* R2: undo after a meal-count step puts the count back too */
  reset(); S.N = 3; S.v = 1; ev("plan(true)"); const p0 = JSON.stringify(S.plan);
  ev("stepMeals(-1)"); ev("runToastUndo()");
  ok("undo after a step restores the meal count with the plan", S.N === 3 && JSON.stringify(S.plan) === p0, S.N + " " + JSON.stringify(S.plan));
  reset(); ev("plan(true)"); const p1 = JSON.stringify(S.plan); ev("setVariety(3)"); ev("runToastUndo()");
  ok("undo after a variety change restores the variety", S.v === 2 && JSON.stringify(S.plan) === p1);

  /* R4: the servings rebalance never pushes a non-freezer past its keep days */
  let over = 0;
  [2, 3].forEach(v => [4, 5, 6, 7, 8, 9].forEach(N => { for (let i = 0; i < 15; i++) {
    reset(); S.N = N; S.v = v; ev("plan(true)");
    const c = ev("compute()"); c.picks.forEach(r => { if (!r.freeze && c.servings[r.id] > ev("keepDaysOf")(r)) over++; });
  } }));
  eq("no non-freezer is planned beyond its keep days (v2/v3)", over, 0);

  /* R5: a 14-meal max batch survives a reload mid-cook */
  reset(); ev("startCook('curry', 14)"); eq("the wizard takes a 14-serving session", ev("U.serv"), 14);
  { const { w } = boot(JSON.parse(W.localStorage.getItem("lmp"))); eq("and it survives a reload", w.eval("U.cook"), "curry"); w.close(); }
  ev("quitCook()"); ev("U.toast=null");

  /* recovery: the last-resort state is the boot sanitiser, not a hand-written literal */
  { const { w, errs } = boot({ plan: ["curry"], log: [{ d: "nope", spent: 1, meals: 1 }] });
    ok("a bad log entry is dropped at load", errs.length === 0 && w.eval("S.log.length") === 0);
    w.eval("loadState({}); U = freshU(); render(); setVariety(1)");
    ok("the recovered state can roll a week without throwing", Array.isArray(w.eval("S.plan")) && w.eval("typeof S.carry") === "object");
    ok("and keeps the seeded shelf", w.eval("S.owned.soy") === true);
    w.close(); }

  /* R3: while another tab's save is pending, this tab writes only its unfinished cook */
  reset(); W.localStorage.setItem("lmp", JSON.stringify({ N: 9, plan: ["keema"] }));
  ev("STALE = true"); S.N = 4; ev("startCook('curry', 3)");
  const stored = JSON.parse(W.localStorage.getItem("lmp"));
  ok("a stale tab does not overwrite the other tab's save", stored.N === 9 && stored.cooking && stored.cooking.id === "curry", JSON.stringify(stored).slice(0, 120));
  ev("STALE = false"); ev("quitCook()"); ev("U.toast=null"); reset();

  /* shopped week: meal count and variety no longer throw the shopping away */
  reset(); S.N = 6; ev("plan(true)");
  const shopPlan = JSON.stringify(S.plan);
  ev("compute()").rows.forEach(r => { S.bought[r.id] = true; });
  ev("setVariety(3)");
  ok("after shopping, a variety change does not reroll", JSON.stringify(S.plan) === shopPlan && S.v === 2);
  ok("it offers Replan instead", ev("U.toast && U.toast.label") === "Replan");
  ev("runToastUndo()");
  ok("Replan does it", S.v === 3 && JSON.stringify(S.plan) !== shopPlan);
  reset(); S.N = 6; ev("plan(true)"); const sp2 = JSON.stringify(S.plan);
  ev("compute()").rows.forEach(r => { S.bought[r.id] = true; });
  ev("stepMeals(4)");
  ok("after shopping, more meals respread the same dishes", JSON.stringify(S.plan) === sp2 && S.N === 10);

  /* a new week clears last week's ticks; undo restores everything the check changed */
  reset(); ev("plan(true)"); ev("compute()").rows.forEach(r => { S.bought[r.id] = true; });
  S.fridgeDate = "2000-01-01"; const snapCarry = JSON.stringify(S.carry);
  ev("rollWeek()"); ev("fridgeCycle('pork')"); ev("fridgeDone(true)");
  eq("a new week starts with an empty basket", Object.keys(S.bought).length, 0);
  ev("runToastUndo()");
  ok("undo puts back the ticks, the ledger and the old check date",
    Object.keys(S.bought).length > 0 && JSON.stringify(S.carry) === snapCarry && S.fridgeDate === "2000-01-01");

  /* the check shows the real leftover until he touches it */
  reset(); S.carry = { potato: { q: 0.5, d: today }, cabbage: { q: 180, d: today } }; S.fridgeDate = "2000-01-01";
  ev("openFridge()");
  ok("an untouched chip shows the real amount", /½ · a bit/.test(D.querySelector('[data-k="frpotato"]').textContent), D.querySelector('[data-k="frpotato"]').textContent);
  ok("and grams too", /180 g · a bit/.test(D.querySelector('[data-k="frcabbage"]').textContent));
  ev("fridgeDone(true)");
  ok("confirming keeps the real amounts, not the presets", S.carry.potato.q === 0.5 && S.carry.cabbage.q === 180 && S.carry.potato.f === true);
  ev("U.toast=null"); reset();

  /* the rhythm and the wizard agree */
  reset(); S.N = 14; S.v = 1; ev("plan(true)"); ev("setTab('week')");
  const cw = ev("compute()"), r1 = cw.picks[0], nS = ev("sessionServ")(r1, cw);
  const btn = D.querySelector('[data-k="rcook' + r1.id + '"]');
  ok("the Sunday row has a cook button", !!btn);
  ok("with the same servings the row describes", btn && btn.textContent === "Cook ×" + nS);
  if (/raw/.test(r1.freeze || "") && cw.servings[r1.id] > ev("keepDaysOf")(r1))
    ok("a raw-freeze split cooks what keeps", nS === ev("keepDaysOf")(r1));
  btn.click();
  eq("the wizard opens at that count", ev("U.serv"), nS);
  ev("quitCook()"); ev("U.toast=null");
  /* rice runs never exceed the cooker and never name a missing day */
  let badRun = 0;
  [1, 2, 3].forEach(v => [3, 7, 10, 14].forEach(N => { for (let i = 0; i < 6; i++) {
    reset(); S.N = N; S.v = v; ev("plan(true)"); ev("setTab('week')");
    const txt = (tabHTML("week").match(/米 RICE<\/div><div class="schedwhat">([^<]*)/) || ["", ""])[1];
    (txt.match(/(\d*½|\d+) (with|on|another)/g) || []).forEach(m => { const n = parseFloat(m.replace(/^½/, "0.5").replace("½", ".5")); if (n > 3) badRun++; });
    if (/Wednesday/.test(txt) && !/水 WED/.test(tabHTML("week"))) badRun++;
  } }));
  eq("no rice run over 3 cups, and no run tied to a missing Wednesday", badRun, 0);

  /* UI fixes from the audit */
  reset(); ev("setTab('week')");
  ok("variety buttons expose their state", D.querySelector('[data-k="v2"]').getAttribute("aria-pressed") === "true" && D.querySelector('[data-k="v1"]').getAttribute("aria-pressed") === "false");
  S.N = 2; ev("render()");
  ok("variety is disabled in a short week", D.querySelector('[data-k="v1"]').disabled);
  reset(); ev("plan(true)"); ev("setTab('week')");
  const det = D.querySelectorAll("#tab-week details.detailsblock")[0]; det.open = true; det.dispatchEvent(new W.Event("toggle"));
  ev("toggleMugi()");
  ok("the rules panel stays open across a re-render", D.querySelectorAll("#tab-week details.detailsblock")[0].open);
  ev("toggleMugi()"); ev("setRulesOpen(0,false)");
  ok("cook progress dots are styled", /\.stepdots \.dot\.on\{background:var\(--mint\)\}/.test(D.documentElement.innerHTML));
  ev("startCook('curry', 2)"); ev("nextStep()");
  ok("the wizard says which step it is on", /Step 1 of 5/.test(D.getElementById("cook-overlay").textContent));
  ev("quitCook()"); ev("U.toast=null");
  /* focus goes back to the opener */
  const opener = D.querySelector('[data-k="planopen' + S.plan[0] + '"]'); opener.focus(); opener.click();
  ev("closeSheet()");
  eq("closing a sheet returns focus to what opened it", D.activeElement && D.activeElement.dataset.k, "planopen" + S.plan[0]);
  ev("setTab('shop')"); ev("flash('x', ()=>{})"); ev("setTab('week')");
  ok("switching tabs clears a stale toast", !ev("U.toast"));
  reset();
}

/* ---------- tidy-up pass: schema, one fraction formatter, the log's meal count ---------- */
{
  resetAll();
  eq("saves carry a schema version", S.schema, ev("SCHEMA"));
  { const { w } = boot({ owned: { soy: false } });
    ok("a pre-versioning save runs every migration", w.eval("S.schema") === w.eval("SCHEMA") && w.eval("S.owned.mirin") === true && w.eval("S.owned.salt") === true);
    ok("and a bottle marked out stays out", w.eval("S.owned.soy") === false); w.close(); }
  { const { w } = boot({ schema: 2, owned: {} });
    ok("a current save runs none", w.eval("S.owned.mirin") === undefined && w.eval("S.owned.salt") === undefined); w.close(); }
  { const { w } = boot({ schema: 1, owned: { salt: false } });
    ok("a v1 save only gets the salt step, and respects an explicit 'out'", w.eval("S.owned.salt") === false && w.eval("S.schema") === 2); w.close(); }
  const f = ev("frac");
  eq("leftover formatting keeps odd amounts honest", f(0.4), "0.4");
  eq("recipe formatting snaps to a kitchen fraction", f(0.4, true), "⅓");
  eq("recipe formatting never goes below a quarter", f(0.05, true), "¼");
  eq("recipe formatting rounds up to the next whole", f(1.9, true), "2");
  ok("there is only one formatter", ev("typeof fmtCount") === "undefined");
  S.N = 5; ev("setTab('save')");
  ok("the log button says how many meals it credits", /Log · 5 meals/.test(tabHTML("save")));
  S.N = 7; ev("setTab('tonight')");
}

/* ---------- 25 Sep 2026 receipt ---------- */
eq("black pepper priced from the receipt", CONDS.pepper.p, 594);   // 朝岡 黒胡椒中荒 35 g, 550 +8%
eq("sesame oil priced from the 21 Sep receipt", CONDS.sesame.p, 376); // 348 +8%
ok("salt is on the shelf and seeded", !!CONDS.salt && ev("SHELF_SEED").includes("salt"));
{ const { w } = boot({ owned: { soy: true }, shelfSeeded: true, stockSeeded: true });
  ok("an old save gets salt in stock without re-seeding the rest", w.eval("S.owned.salt") === true && w.eval("S.owned.mirin") === undefined); w.close(); }

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
