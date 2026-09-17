'use strict';

const {
  newShift, ring, runPlan, solve, percentBeaten, mulberry32,
  generatePuzzle, STRIKE, BY_ID,
} = require('../game.js');

let failures = 0;

function fail(msg) {
  failures++;
  console.error(`FAIL ${msg}`);
}

function eq(actual, expected, msg) {
  if (actual !== expected) fail(`${msg}: expected ${expected}, got ${actual}`);
}

function item(id, cost, val) {
  const d = BY_ID[id];
  return { id, name: d.name, glyph: d.glyph, kind: d.kind, cost, val: val ?? null };
}

/* solve enumerates every ordered subset: 1,957 plans for six items */
{
  const roster = [
    item('hand-crank', 20, 3), item('screw-press', 55, 8),
    item('heavy-hammer', 25, 5), item('apprentice', 100),
    item('double-furnace', 270), item('royal-commission', 240),
  ];
  const sol = solve(roster);
  eq(sol.scores.length, 1957, 'plan count');
  if (sol.best <= 150) fail('best plan should beat all-strike');
  // The best plan's purchases were all actually made.
  eq(sol.purchases.length, sol.bestPlan.length, 'best plan fully bought');
}

/* the solver's par is unbeatable by free play: random strategies,
   including deliberately delayed purchases, never exceed it */
{
  for (let day = 0; day < 6; day++) {
    const p = generatePuzzle(day);
    const par = p.solution.best;
    const rng = mulberry32(day * 7919 + 1);
    for (let trial = 0; trial < 400; trial++) {
      const s = newShift();
      while (!s.over) {
        // Random policy: sometimes strike even when a buy is possible,
        // sometimes buy a random affordable item.
        const affordable = [];
        p.roster.forEach((it, i) => {
          if (s.owned[it.id] === undefined && s.coins >= it.cost) affordable.push(i);
        });
        if (affordable.length && rng() < 0.5) {
          ring(s, p.roster, affordable[Math.floor(rng() * affordable.length)]);
        } else {
          ring(s, p.roster, STRIKE);
        }
      }
      if (s.final > par) {
        fail(`day ${day} trial ${trial}: random play ${s.final} beat par ${par}`);
        break;
      }
    }
  }
}

/* percentBeaten */
{
  const scores = [10, 20, 20, 30, 40];
  eq(percentBeaten(25, scores), 60, 'beats three of five');
  eq(percentBeaten(10, scores), 0, 'beats none');
  eq(percentBeaten(99, scores), 100, 'beats all');
}

/* runPlan skips items that never become affordable */
{
  const roster = [item('rolling-mill', 100000, 30)];
  const r = runPlan(roster, [0]);
  eq(r.score, 150, 'unaffordable plan falls back to striking');
  eq(r.purchases.length, 0, 'nothing bought');
}

if (failures) { console.error(`${failures} failure(s)`); process.exit(1); }
console.log('solver: all tests passed');
