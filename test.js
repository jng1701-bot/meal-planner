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
eq("roster count is 27", R.length, 27);
eq("unique ids", new Set(R.map(r => r.id)).size, R.length);

const TIERS = { A: 9, B: 4, C: 3, D: 6, E: 4, F: 1 };
const tierCount = R.reduce((a, r) => (a[r.tier] = (a[r.tier] || 0) + 1, a), {});
Object.entries(TIERS).forEach(([t, n]) => eq("tier " + t + " count", tierCount[t], n));
ok("no recipe missing a tier", R.every(r => "ABCDEF".includes(r.tier)));

["omurice", "katsu", "mapo", "stirfry", "oyakodon", "yakisoba", "chahan", "napolitan", "gyudon"]
  .forEach(id => ok("cut recipe absent: " + id, !R.some(r => r.id === id)));
["iwashi", "belachan", "beansoup", "butadon"]
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
ok("no cap-1 recipe outside the escape hatch",
  R.filter(r => r.cap === 1).every(r => r.tier === "E"),
  R.filter(r => r.cap === 1 && r.tier !== "E").map(r => r.id).join(","));
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
