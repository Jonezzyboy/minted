'use strict';

const {
  newShift, ring, runPlan, rate, BELLS, HAND, STRIKE, BY_ID,
} = require('../game.js');

let failures = 0;

function eq(actual, expected, msg) {
  if (actual !== expected) {
    failures++;
    console.error(`FAIL ${msg}: expected ${expected}, got ${actual}`);
  }
}

function item(id, cost, val) {
  const d = BY_ID[id];
  return { id, name: d.name, glyph: d.glyph, kind: d.kind, cost, val: val ?? null };
}

/* all-strike day: 30 bells at hand 5 */
{
  const r = runPlan([], []);
  eq(r.score, BELLS * HAND, 'all-strike baseline');
  eq(r.state.strikes, BELLS, 'every bell struck');
  eq(r.state.machined, 0, 'no machines, no machine income');
}

/* a machine bought this bell starts on the next */
{
  const roster = [item('hand-crank', 5, 3)];
  const s = newShift();
  ring(s, roster, STRIKE);           // bell 1: +5, income 0 → 5
  eq(s.coins, 5, 'strike mints hand value');
  ring(s, roster, 0);                // bell 2: buy for 5, income still 0 → 0
  eq(s.coins, 0, 'purchase paid, no income yet');
  ring(s, roster, STRIKE);           // bell 3: +5 strike, +3 income → 8
  eq(s.coins, 8, 'machine pays from the following bell');
}

/* can't buy what you can't afford, or twice */
{
  const roster = [item('hand-crank', 100, 3)];
  const s = newShift();
  eq(ring(s, roster, 0).ok, false, 'unaffordable purchase refused');
  const cheap = [item('hand-crank', 5, 3)];
  const s2 = newShift();
  ring(s2, cheap, STRIKE);
  ring(s2, cheap, 0);
  eq(ring(s2, cheap, 0).ok, false, 'owned item refused');
}

/* effect algebra */
{
  const s = newShift();
  BY_ID['heavy-hammer'].apply(s, 4);
  eq(s.hand, HAND + 4, 'hammer raises hand');
  BY_ID['twin-hammers'].apply(s);
  eq(s.hand, (HAND + 4) * 2, 'twin hammers double hand');
  BY_ID['hand-crank'].apply(s, 3);
  BY_ID['double-furnace'].apply(s);
  eq(s.rate, 6, 'furnace doubles rate');
  BY_ID['apprentice'].apply(s);
  eq(s.rate, 6 + s.hand, 'apprentice adds hand to rate');
  const handBefore = s.hand;
  BY_ID['foreman'].apply(s);
  eq(s.hand, handBefore + s.rate, 'foreman adds rate to hand');
  BY_ID['candles'].apply(s);
  eq(s.bellsTotal, BELLS + 2, 'candles extend the day');
  BY_ID['royal-commission'].apply(s);
  BY_ID['assay-office'].apply(s);
  eq(Math.round(s.mult * 100), 132, 'close multipliers compound');
}

/* close multiplier applies to the final vault only */
{
  const roster = [item('royal-commission', 5)];
  const r = runPlan(roster, [0]);
  // bell 1 strike (+5), bell 2 buy (5-5=0), 28 strikes → 140, ×1.2 = 168
  eq(r.score, 168, 'commission adds a fifth at close');
}

/* candles day runs 32 bells */
{
  const roster = [item('candles', 5)];
  const r = runPlan(roster, [0]);
  // bell 1 strike, bell 2 buy (−5), then 30 more strikes: 31 × 5 − 5
  eq(r.score, 150, 'candles buy trades a strike for two more bells');
  eq(r.state.bellsTotal, BELLS + 2, 'day extended');
}

/* ratings */
eq(rate(100, 100).name, 'Mint condition', 'perfect rating');
eq(rate(100, 100).coins, 5, 'perfect coins');
eq(rate(93, 100).name, 'Struck true', '90s rating');
eq(rate(80, 100).name, 'Honest coinage', '75s rating');
eq(rate(60, 100).name, 'Loose change', '55s rating');
eq(rate(20, 100).name, 'Buttons', 'floor rating');
eq(rate(150, 100).pct, 100, 'pct clamped at 100');

if (failures) { console.error(`${failures} failure(s)`); process.exit(1); }
console.log('engine: all tests passed');
