'use strict';

const {
  generatePuzzle, runPlan, BELLS, HAND, ROSTER_SIZE, BY_ID,
} = require('../game.js');

const DAYS = 366;
let failures = 0;

function fail(day, msg) {
  failures++;
  console.error(`day ${day}: ${msg}`);
}

const baseline = BELLS * HAND;
let parMin = Infinity;
let parMax = 0;
let planLenTotal = 0;

for (let day = 0; day < DAYS; day++) {
  let p;
  try {
    p = generatePuzzle(day);
  } catch (e) {
    fail(day, e.message);
    continue;
  }

  if (p.roster.length !== ROSTER_SIZE) fail(day, `roster of ${p.roster.length}`);
  const seen = new Set(p.roster.map((it) => it.id));
  if (seen.size !== ROSTER_SIZE) fail(day, 'duplicate items in roster');
  for (const it of p.roster) {
    const d = BY_ID[it.id];
    if (!d) { fail(day, `unknown item ${it.id}`); continue; }
    if (it.cost < d.cost[0] || it.cost > d.cost[1]) fail(day, `${it.id} cost ${it.cost} out of range`);
    if (d.val && (it.val < d.val[0] || it.val > d.val[1])) fail(day, `${it.id} val ${it.val} out of range`);
    if (!it.power || typeof it.power !== 'string') fail(day, `${it.id} missing power text`);
  }
  if (p.roster.filter((it) => it.kind === 'engine').length < 2) fail(day, 'fewer than two engines');
  if (p.roster.filter((it) => it.kind === 'hand').length < 1) fail(day, 'no hand item');

  const sol = p.solution;
  if (sol.scores.length !== 1957) fail(day, `${sol.scores.length} plans scored`);
  if (sol.best < baseline * 3.5) fail(day, `par ${sol.best} too close to baseline ${baseline}`);
  if (sol.bestPlan.length < 3) fail(day, `best plan buys only ${sol.bestPlan.length}`);
  const naive = runPlan(p.roster, p.roster.map((_, i) => i)).score;
  if (naive > sol.best * 0.92) fail(day, `naive plan ${naive} too close to par ${sol.best}`);

  // Determinism: the same day generates the same catalogue again.
  const again = generatePuzzle(day);
  if (JSON.stringify(again.roster) !== JSON.stringify(p.roster)) fail(day, 'not deterministic');
  if (again.solution.best !== sol.best) fail(day, 'par not deterministic');

  parMin = Math.min(parMin, sol.best);
  parMax = Math.max(parMax, sol.best);
  planLenTotal += sol.bestPlan.length;
}

if (failures) { console.error(`${failures} failure(s)`); process.exit(1); }
console.log(`generator: ${DAYS} days ok · par ${parMin}–${parMax} · best plan buys ${(planLenTotal / DAYS).toFixed(1)} items on average`);
