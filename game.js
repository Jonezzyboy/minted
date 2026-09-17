'use strict';

/* ============================================================
   Minted — one working day at the coin press.
   Thirty bells; at each one you strike a coin by hand or buy a
   machine from the day's catalogue. Only the vault at close
   counts — every purchase is a bet the day can pay back.
   ============================================================ */

function mulberry32(seed) {
  let a = seed | 0;
  return function () {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffle(arr, rng) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function randInt(rng, lo, hi) {
  return lo + Math.floor(rng() * (hi - lo + 1));
}

/* ---------- the day ---------- */

const BELLS = 30;      // the working day
const HAND = 5;        // what a strike mints before upgrades
const ROSTER_SIZE = 6; // items in a day's catalogue
const SHIFTS = 3;
const STRIKE = -1;     // the non-buy action

/* ---------- the catalogue ----------
   Every effect only ever raises hand, rate, bells or the close
   multiplier, and none reads the vault. That monotone family is
   what makes the solver exact: for any purchase order, buying
   each item the moment it's affordable is provably the best
   timing, so the ordered subsets ARE the whole strategy space. */

const CATALOGUE = [
  { id: 'hand-crank', name: 'Hand Crank', glyph: '\u{1F529}', kind: 'engine',
    cost: [10, 16], val: [3, 4],
    power: (v) => `The machines make ${v} more a bell.`,
    apply: (s, v) => { s.rate += v; } },
  { id: 'screw-press', name: 'Screw Press', glyph: '\u{1F5DC}\u{FE0F}', kind: 'engine',
    cost: [35, 50], val: [8, 11],
    power: (v) => `The machines make ${v} more a bell.`,
    apply: (s, v) => { s.rate += v; } },
  { id: 'steam-press', name: 'Steam Press', glyph: '\u{2668}\u{FE0F}', kind: 'engine',
    cost: [90, 130], val: [18, 24],
    power: (v) => `The machines make ${v} more a bell.`,
    apply: (s, v) => { s.rate += v; } },
  { id: 'rolling-mill', name: 'Rolling Mill', glyph: '\u{1F3ED}', kind: 'engine',
    cost: [200, 280], val: [40, 52],
    power: (v) => `The machines make ${v} more a bell.`,
    apply: (s, v) => { s.rate += v; } },
  { id: 'apprentice', name: 'The Apprentice', glyph: '\u{1F9D1}\u{200D}\u{1F3ED}', kind: 'engine',
    cost: [60, 90], val: null,
    power: () => 'Adds what a strike mints, as it stands, to the machines.',
    apply: (s) => { s.rate += s.hand; } },
  { id: 'heavy-hammer', name: 'Heavier Hammer', glyph: '\u{1F528}', kind: 'hand',
    cost: [15, 22], val: [4, 6],
    power: (v) => `A strike mints ${v} more.`,
    apply: (s, v) => { s.hand += v; } },
  { id: 'engraved-die', name: 'Engraved Die', glyph: '\u{1F4A0}', kind: 'hand',
    cost: [45, 70], val: [10, 14],
    power: (v) => `A strike mints ${v} more.`,
    apply: (s, v) => { s.hand += v; } },
  { id: 'silver-blanks', name: 'Silver Blanks', glyph: '\u{1F948}', kind: 'hand',
    cost: [110, 160], val: [20, 30],
    power: (v) => `A strike mints ${v} more.`,
    apply: (s, v) => { s.hand += v; } },
  { id: 'twin-hammers', name: 'Twin Hammers', glyph: '\u{2692}\u{FE0F}', kind: 'hand',
    cost: [50, 80], val: null,
    power: () => 'Doubles what a strike mints.',
    apply: (s) => { s.hand *= 2; } },
  { id: 'foreman', name: 'The Foreman', glyph: '\u{1F477}', kind: 'hand',
    cost: [60, 90], val: null,
    power: () => 'Adds what the machines make, as it stands, to the strike.',
    apply: (s) => { s.hand += s.rate; } },
  { id: 'double-furnace', name: 'Double Furnace', glyph: '\u{1F525}', kind: 'works',
    cost: [150, 230], val: null,
    power: () => 'Doubles what the machines make.',
    apply: (s) => { s.rate *= 2; } },
  { id: 'royal-commission', name: 'Royal Commission', glyph: '\u{1F4DC}', kind: 'close',
    cost: [140, 200], val: null,
    power: () => 'At close, the Crown adds a fifth to the vault.',
    apply: (s) => { s.mult *= 1.2; } },
  { id: 'assay-office', name: 'The Assay', glyph: '\u{2696}\u{FE0F}', kind: 'close',
    cost: [60, 90], val: null,
    power: () => 'At close, certification adds a tenth to the vault.',
    apply: (s) => { s.mult *= 1.1; } },
  { id: 'candles', name: 'Candles', glyph: '\u{1F56F}\u{FE0F}', kind: 'works',
    cost: [70, 110], val: null,
    power: () => 'The day runs two bells past close.',
    apply: (s) => { s.bellsTotal += 2; } },
];

const BY_ID = Object.fromEntries(CATALOGUE.map((c) => [c.id, c]));

/* ---------- the shift ---------- */

function newShift() {
  return {
    bell: 1, bellsTotal: BELLS, coins: 0, hand: HAND, rate: 0, mult: 1,
    owned: {}, purchases: [], strikes: 0, struck: 0, machined: 0,
    over: false, final: 0,
  };
}

// One bell: strike (action === STRIKE) or buy roster[action].
// The machines pay out on the bell as it was rung in, so a machine
// bought this bell starts on the next.
function ring(s, roster, action) {
  if (s.over) return { ok: false };
  const income = s.rate;
  let struck = 0;
  if (action === STRIKE) {
    s.coins += s.hand;
    s.struck += s.hand;
    s.strikes++;
    struck = s.hand;
  } else {
    const it = roster[action];
    if (!it || s.owned[it.id] !== undefined || s.coins < it.cost) return { ok: false };
    s.coins -= it.cost;
    s.owned[it.id] = s.bell;
    s.purchases.push({ index: action, bell: s.bell });
    BY_ID[it.id].apply(s, it.val);
  }
  s.coins += income;
  s.machined += income;
  s.bell++;
  if (s.bell > s.bellsTotal) {
    s.over = true;
    s.final = Math.round(s.coins * s.mult);
  }
  return { ok: true, struck, income };
}

/* ---------- plans ----------
   A plan is an ordered list of roster indexes: buy each the moment
   it's affordable, strike every other bell. */

function runPlan(roster, plan) {
  const s = newShift();
  let next = 0;
  while (!s.over) {
    const idx = next < plan.length ? plan[next] : -1;
    if (idx >= 0 && s.owned[roster[idx].id] === undefined && s.coins >= roster[idx].cost) {
      ring(s, roster, idx);
      next++;
    } else {
      ring(s, roster, STRIKE);
    }
  }
  return { score: s.final, purchases: s.purchases, state: s };
}

/* ---------- the best plan ----------
   Every ordered subset of the six-item catalogue: 1,957 plans. */

function solve(roster) {
  let best = -1;
  let bestPlan = null;
  const scores = [];
  const used = new Array(roster.length).fill(false);
  const cur = [];
  (function rec() {
    const score = runPlan(roster, cur).score;
    scores.push(score);
    if (score > best) { best = score; bestPlan = cur.slice(); }
    if (cur.length === roster.length) return;
    for (let i = 0; i < roster.length; i++) {
      if (used[i]) continue;
      used[i] = true;
      cur.push(i);
      rec();
      cur.pop();
      used[i] = false;
    }
  })();
  scores.sort((a, b) => a - b);
  const detail = runPlan(roster, bestPlan);
  return { best, bestPlan, purchases: detail.purchases, scores };
}

function percentBeaten(score, scores) {
  let lo = 0;
  let hi = scores.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (scores[mid] < score) lo = mid + 1;
    else hi = mid;
  }
  return Math.round((lo / scores.length) * 100);
}

/* ---------- deterministic daily catalogue ----------
   Rejects flat or giveaway days: buying has to matter, the best
   plan has to be worth hunting for, and the lazy plan of buying
   the shelf left to right must fall short. */

function generatePuzzle(dayIndex) {
  const baseline = BELLS * HAND;
  for (let attempt = 0; attempt < 400; attempt++) {
    const rng = mulberry32(((dayIndex + 1) * 2654435761) ^ (attempt * 40503 + 17));
    const ids = shuffle(CATALOGUE.map((c) => c.id), rng).slice(0, ROSTER_SIZE);
    const defs = ids.map((id) => BY_ID[id]);
    if (defs.filter((d) => d.kind === 'engine').length < 2) continue;
    if (defs.filter((d) => d.kind === 'hand').length < 1) continue;
    const roster = defs.map((d) => {
      const val = d.val ? randInt(rng, d.val[0], d.val[1]) : null;
      return {
        id: d.id, name: d.name, glyph: d.glyph, kind: d.kind,
        cost: randInt(rng, d.cost[0], d.cost[1]), val, power: d.power(val),
      };
    });
    const sol = solve(roster);
    if (sol.best < baseline * 3.5) continue;
    if (sol.bestPlan.length < 3) continue;
    const naive = runPlan(roster, roster.map((_, i) => i)).score;
    if (naive > sol.best * 0.92) continue;
    return { day: dayIndex, roster, solution: sol };
  }
  throw new Error(`no honest day's work for day ${dayIndex}`);
}

/* ---------- the calendar ---------- */

// Pressing No. 1 = 17 September 2026. Flips at local midnight.
const EPOCH = { y: 2026, m: 8, d: 17 };

function todayIndex() {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const epoch = new Date(EPOCH.y, EPOCH.m, EPOCH.d);
  return Math.max(0, Math.round((start - epoch) / 864e5));
}

function msToMidnight() {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1) - now;
}

/* ---------- the assay ---------- */

function rate(best, optimal) {
  const pct = Math.min(100, Math.round((best / optimal) * 100));
  if (pct >= 100) return { coins: 5, pct, name: 'Mint condition' };
  if (pct >= 90) return { coins: 4, pct, name: 'Struck true' };
  if (pct >= 75) return { coins: 3, pct, name: 'Honest coinage' };
  if (pct >= 55) return { coins: 2, pct, name: 'Loose change' };
  return { coins: 1, pct, name: 'Buttons' };
}

/* ---------- commendations ----------
   Judged against a summary of a finished day:
   { played, streak, perfects, pct, coins, best, shifts, climbing,
     fullTill, catalogue }. */

const BADGES = [
  { id: 'first-strike', seal: 'No1', name: 'First Strike',
    desc: 'Mint your first day.',
    test: (c) => c.played >= 1 },
  { id: 'honest-coinage', seal: '75', name: 'Honest Coinage',
    desc: 'Take three coins or better.',
    test: (c) => c.coins >= 3 },
  { id: 'struck-true', seal: '90', name: 'Struck True',
    desc: "Finish within a tenth of the day's best plan.",
    test: (c) => c.pct >= 90 },
  { id: 'mint-condition', seal: 'MAX', name: 'Mint Condition',
    desc: "Match the day's best plan.",
    test: (c) => c.pct >= 100 },
  { id: 'one-pressing', seal: '1st', name: 'In One Pressing',
    desc: "Match the day's best plan on your very first shift.",
    test: (c) => c.pct >= 100 && c.shifts === 1 },
  { id: 'early-close', seal: '2/3', name: 'Early Close',
    desc: 'Take four coins with a shift still in hand.',
    test: (c) => c.coins >= 4 && c.shifts < SHIFTS },
  { id: 'rising-output', seal: '↗', name: 'Rising Output',
    desc: 'Mint more on every shift of a full three.',
    test: (c) => c.climbing },
  { id: 'full-till', seal: '6/6', name: 'The Full Till',
    desc: "Own all six of a day's catalogue in one shift.",
    test: (c) => c.fullTill },
  { id: 'thousand-day', seal: '1k', name: 'A Thousand in a Day',
    desc: 'Close a shift with 1,000 or more in the vault.',
    test: (c) => c.best >= 1000 },
  { id: 'regular-shift', seal: '3d', name: 'Regular Shift',
    desc: 'Mint three days running.',
    test: (c) => c.streak >= 3 },
  { id: 'working-week', seal: '7d', name: 'The Working Week',
    desc: 'Mint seven days running.',
    test: (c) => c.streak >= 7 },
  { id: 'month-in-coin', seal: '30', name: 'A Month in Coin',
    desc: 'Mint thirty days running.',
    test: (c) => c.streak >= 30 },
  { id: 'year-of-the-coin', seal: '1yr', name: 'Year of the Coin',
    desc: 'Mint a full year running.',
    test: (c) => c.streak >= 365 },
  { id: 'master-of-the-mint', seal: '5×', name: 'Master of the Mint',
    desc: 'Match the best plan five days in all.',
    test: (c) => c.perfects >= 5 },
  { id: 'whole-catalogue', seal: `${CATALOGUE.length}`, name: 'The Whole Catalogue',
    desc: `Buy every machine in the catalogue, across your days.`,
    test: (c) => c.catalogue },
  { id: 'hundred-days', seal: '100', name: 'A Hundred Days Minted',
    desc: 'Mint one hundred days in all.',
    test: (c) => c.played >= 100 },
];

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    CATALOGUE, BY_ID, BELLS, HAND, ROSTER_SIZE, SHIFTS, STRIKE, BADGES,
    mulberry32, shuffle, randInt,
    newShift, ring, runPlan, solve, percentBeaten, generatePuzzle, rate,
    todayIndex, msToMidnight, EPOCH,
  };
}

/* ============================================================
   The mint floor (browser only)
   ============================================================ */

if (typeof document !== 'undefined') (function () {
  const $ = (sel) => document.querySelector(sel);

  const fmt = (n) => n.toLocaleString('en-US');

  const DAY_KEY = 'minted-day-v1';
  const STATS_KEY = 'minted-stats-v1';
  const BADGES_KEY = 'minted-badges-v1';
  const BOUGHT_KEY = 'minted-catalogue-v1';
  const THEME_KEY = 'minted-theme-v1';

  const params = new URLSearchParams(location.search);
  const today = todayIndex();
  let day = today;
  let archive = false;
  if (params.has('day') || params.has('no')) {
    const d = params.has('day') ? parseInt(params.get('day'), 10)
      : parseInt(params.get('no'), 10) - 1;
    if (Number.isFinite(d) && d >= 0 && d < today) { day = d; archive = true; }
  }

  const puzzle = generatePuzzle(day);
  const roster = puzzle.roster;
  const optimal = puzzle.solution.best;

  /* ---------- state ---------- */

  const state = {
    shift: newShift(),
    actions: [],          // this shift's actions: STRIKE or roster index
    shifts: [],           // { actions, score }
    finished: false,
  };

  function load(key) {
    try { return JSON.parse(localStorage.getItem(key)) || null; } catch { return null; }
  }

  function saveDay() {
    if (archive) return;
    localStorage.setItem(DAY_KEY, JSON.stringify({
      day, shifts: state.shifts, current: state.actions, finished: state.finished,
    }));
  }

  function bestShift() {
    return state.shifts.reduce((m, s) => Math.max(m, s.score), 0);
  }

  /* ---------- stats ---------- */

  function loadStats() {
    return load(STATS_KEY) || {
      played: 0, perfects: 0, streak: 0, maxStreak: 0, lastDay: -2, totalPct: 0,
    };
  }

  function recordFinish(pct) {
    if (archive) return loadStats();
    markShelf();
    const stats = loadStats();
    if (stats.lastDay === day) return stats;
    stats.played++;
    stats.totalPct += pct;
    if (pct >= 100) stats.perfects++;
    stats.streak = stats.lastDay === day - 1 ? stats.streak + 1 : 1;
    stats.maxStreak = Math.max(stats.maxStreak, stats.streak);
    stats.lastDay = day;
    localStorage.setItem(STATS_KEY, JSON.stringify(stats));
    return stats;
  }

  /* ---------- the daily shelf ----------
     The dailies share this origin, so a tiny shared ledger of
     "finished today" dates lets each game tick off its siblings. */

  const SHELF_KEY = 'dailies-v1';
  const SHELF_SLUG = 'minted';

  function localDate() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }

  function markShelf() {
    const shelf = load(SHELF_KEY) || {};
    shelf[SHELF_SLUG] = localDate();
    localStorage.setItem(SHELF_KEY, JSON.stringify(shelf));
  }

  function renderShelfTicks() {
    const shelf = load(SHELF_KEY) || {};
    const todayKey = localDate();
    document.querySelectorAll('.also a[data-daily]').forEach((a) => {
      if (shelf[a.dataset.daily] === todayKey) {
        const tick = document.createElement('span');
        tick.className = 'done-tick';
        tick.title = 'Played today';
        tick.textContent = ' ✓';
        a.after(tick);
      }
    });
  }

  /* ---------- commendations ---------- */

  function loadBadges() {
    return load(BADGES_KEY) || {};
  }

  function recordBought() {
    const bought = new Set(load(BOUGHT_KEY) || []);
    for (const sh of state.shifts) {
      for (const a of sh.actions) if (a !== STRIKE) bought.add(roster[a].id);
    }
    const list = [...bought];
    localStorage.setItem(BOUGHT_KEY, JSON.stringify(list));
    return list;
  }

  // Idempotent, so replaying a saved finished day awards nothing twice.
  function awardBadges(stats, rating, best) {
    if (archive) return;
    const totals = state.shifts.map((s) => s.score);
    const ctx = {
      played: stats.played,
      streak: stats.streak,
      perfects: stats.perfects,
      pct: rating.pct,
      coins: rating.coins,
      shifts: totals.length,
      best,
      climbing: totals.length === SHIFTS && totals.every((t, i) => i === 0 || t > totals[i - 1]),
      fullTill: state.shifts.some((s) => s.actions.filter((a) => a !== STRIKE).length >= ROSTER_SIZE),
      catalogue: recordBought().length >= CATALOGUE.length,
    };
    const earned = loadBadges();
    const fresh = [];
    for (const b of BADGES) {
      if (!(b.id in earned) && b.test(ctx)) {
        earned[b.id] = day;
        fresh.push(b);
      }
    }
    if (fresh.length) {
      localStorage.setItem(BADGES_KEY, JSON.stringify(earned));
      fresh.forEach(queueToast);
    }
  }

  /* ---------- toasts ---------- */

  const toastQueue = [];
  let toastShowing = false;

  function queueToast(badge) {
    toastQueue.push(badge);
    if (!toastShowing) nextToast();
  }

  function nextToast() {
    const b = toastQueue.shift();
    if (!b) { toastShowing = false; return; }
    toastShowing = true;
    const el = document.createElement('div');
    el.className = 'toast';
    el.innerHTML =
      `<span class="seal">${b.seal}</span>` +
      '<span class="toast-text">' +
      '<span class="toast-eyebrow">Commendation earned</span>' +
      `<span class="toast-name">${b.name}</span></span>`;
    $('#toasts').appendChild(el);
    requestAnimationFrame(() => el.classList.add('show'));
    setTimeout(() => {
      el.classList.remove('show');
      setTimeout(() => { el.remove(); nextToast(); }, 300);
    }, 3800);
  }

  function renderBadges() {
    const earned = loadBadges();
    $('#badgeCount').textContent = `${Object.keys(earned).length} of ${BADGES.length}`;
    const ul = $('#badgeList');
    ul.innerHTML = '';
    for (const b of BADGES) {
      const got = b.id in earned;
      const li = document.createElement('li');
      li.className = 'badge' + (got ? ' earned' : '')
        + (!archive && earned[b.id] === day ? ' fresh' : '');
      li.innerHTML =
        `<span class="seal">${b.seal}</span>` +
        '<span class="badge-text">' +
        `<span class="badge-name">${b.name}</span>` +
        `<span class="badge-desc">${got ? `${b.desc} Earned No. ${earned[b.id] + 1}.` : b.desc}</span>` +
        '</span>';
      ul.appendChild(li);
    }
  }

  /* ---------- rendering ---------- */

  const vaultEl = $('#vault');
  const catalogueEl = $('#catalogue');
  const strikeBtn = $('#strike');
  const ledgerEl = $('#ledger');
  const afterEl = $('#afterShift');
  const againBtn = $('#again');
  const doneBtn = $('#done');
  const resultsEl = $('#results');
  const floatsEl = $('#floats');

  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

  function renderMeters() {
    const s = state.shift;
    $('#handVal').textContent = fmt(s.hand);
    $('#rateVal').textContent = fmt(s.rate);
    $('#bellNow').textContent = Math.min(s.bell, s.bellsTotal);
    $('#bellTotal').textContent = s.bellsTotal;
    vaultEl.textContent = fmt(s.coins);
    if (s.mult > 1) {
      $('#closeNote').hidden = false;
      $('#closeNote').textContent = `worth ${fmt(Math.round(s.coins * s.mult))} at close`;
    } else {
      $('#closeNote').hidden = true;
    }
  }

  function renderBells() {
    const s = state.shift;
    const row = $('#bellRow');
    row.innerHTML = '';
    for (let i = 1; i <= s.bellsTotal; i++) {
      const tick = document.createElement('span');
      tick.className = 'bell-tick' + (i < s.bell ? ' rung' : '')
        + (i > BELLS ? ' overtime' : '');
      row.appendChild(tick);
    }
  }

  function renderCatalogue() {
    const s = state.shift;
    catalogueEl.innerHTML = '';
    roster.forEach((it, i) => {
      const boughtAt = s.owned[it.id];
      const bought = boughtAt !== undefined;
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'item' + (bought ? ' bought' : '');
      btn.disabled = bought || state.finished || s.over || s.coins < it.cost;
      btn.innerHTML =
        `<span class="item-plate">${it.glyph}</span>` +
        '<span class="item-text">' +
        `<span class="item-name">${it.name}</span>` +
        `<span class="item-power">${it.power}</span></span>` +
        (bought
          ? `<span class="item-price sold">bell ${boughtAt}</span>`
          : `<span class="item-price">${fmt(it.cost)}</span>`);
      btn.addEventListener('click', () => takeAction(i));
      catalogueEl.appendChild(btn);
    });
  }

  function renderShifts() {
    const marks = [];
    for (let i = 0; i < SHIFTS; i++) {
      const sh = state.shifts[i];
      marks.push(sh ? `<span class="run-mark used">${fmt(sh.score)}</span>`
        : '<span class="run-mark"></span>');
    }
    $('#shiftMarks').innerHTML = marks.join('');
  }

  function render() {
    renderMeters();
    renderBells();
    renderCatalogue();
    renderShifts();
    const working = !state.finished && !state.shift.over;
    strikeBtn.disabled = !working;
    $('#board').classList.toggle('closed', state.finished);
  }

  /* ---------- floats ---------- */

  function floatUp(text, cls) {
    if (reducedMotion) return;
    const el = document.createElement('span');
    el.className = `float ${cls}`;
    el.textContent = text;
    el.style.left = `${44 + (Math.random() * 24 - 12)}%`;
    floatsEl.appendChild(el);
    setTimeout(() => el.remove(), 900);
  }

  /* ---------- playing ---------- */

  function takeAction(action) {
    const s = state.shift;
    const res = ring(s, roster, action);
    if (!res.ok) return;
    state.actions.push(action);
    if (action === STRIKE) {
      floatUp(`+${fmt(res.struck + res.income)}`, 'gain');
      vaultEl.classList.remove('pop');
      void vaultEl.offsetWidth;
      vaultEl.classList.add('pop');
    } else {
      floatUp(`−${fmt(roster[action].cost)}`, 'spend');
    }
    saveDay();
    if (s.over) endShift();
    else render();
  }

  strikeBtn.addEventListener('click', () => takeAction(STRIKE));

  /* ---------- the shift ledger ---------- */

  function ledgerRow(label, value, cls) {
    const row = document.createElement('div');
    row.className = 'ledger-row' + (cls ? ` ${cls}` : '');
    row.innerHTML = `<span class="ledger-label">${label}</span><span class="ledger-value">${value}</span>`;
    return row;
  }

  function showLedger(s, shiftNo) {
    ledgerEl.innerHTML = '';
    ledgerEl.hidden = false;
    for (const p of s.purchases) {
      const it = roster[p.index];
      ledgerEl.appendChild(ledgerRow(
        `Bell ${p.bell} · ${it.glyph} ${it.name}`, `−${fmt(it.cost)}`, 'spend'));
    }
    ledgerEl.appendChild(ledgerRow(
      `Struck by hand ×${s.strikes}`, `+${fmt(s.struck)}`));
    ledgerEl.appendChild(ledgerRow('The machines paid out', `+${fmt(s.machined)}`));
    if (s.mult > 1) {
      ledgerEl.appendChild(ledgerRow('At the close', `${fmt(s.coins)} → ${fmt(s.final)}`));
    }
    const total = document.createElement('div');
    total.className = 'ledger-total';
    total.innerHTML = `<span>Shift ${shiftNo}</span><b>${fmt(s.final)}</b>`;
    ledgerEl.appendChild(total);
  }

  function endShift() {
    const s = state.shift;
    state.shifts.push({ actions: state.actions.slice(), score: s.final });
    state.actions = [];
    saveDay();
    render();
    showLedger(s, state.shifts.length);
    if (state.shifts.length >= SHIFTS) {
      finish();
    } else {
      const left = SHIFTS - state.shifts.length;
      againBtn.textContent = `Back to the floor · ${left} shift${left === 1 ? '' : 's'} left`;
      afterEl.hidden = false;
    }
  }

  /* ---------- the result ---------- */

  function bestPlanLine() {
    const names = puzzle.solution.purchases.map((p) => {
      const it = roster[p.index];
      return `${it.name} (bell ${p.bell})`;
    });
    return names.join(' → ');
  }

  function finish() {
    state.finished = true;
    afterEl.hidden = true;
    saveDay();
    render();

    const best = bestShift();
    const rating = rate(best, optimal);
    const stats = recordFinish(rating.pct);

    $('#finalScore').textContent = fmt(best);
    $('#finalOptimal').textContent = fmt(optimal);
    $('#rosette').textContent = '\u{1FA99}'.repeat(rating.coins);
    $('#ratingName').textContent = rating.name;
    $('#ratingPct').textContent =
      rating.pct >= 100
        ? "The day's best plan, found. It gets no better than this."
        : `${rating.pct}% of the best plan · ${fmt(optimal - best)} short at the close.`;
    $('#bestPlan').textContent = `The best plan: ${bestPlanLine()}.`;

    $('#statPlayed').textContent = stats.played;
    $('#statStreak').textContent = stats.streak;
    $('#statPerfects').textContent = stats.perfects;
    $('#statAvg').textContent = stats.played ? Math.round(stats.totalPct / stats.played) + '%' : '—';
    $('#dayStats').hidden = archive;

    awardBadges(stats, rating, best);
    const earned = loadBadges();
    const fresh = archive ? [] : BADGES.filter((b) => earned[b.id] === day);
    $('#newBadges').hidden = fresh.length === 0;
    $('#newBadges').textContent = fresh.length
      ? `New commendation${fresh.length === 1 ? '' : 's'}: ${fresh.map((b) => b.name).join(' · ')}`
      : '';
    renderBadges();

    resultsEl.hidden = false;
    resultsEl.scrollIntoView({ behavior: reducedMotion ? 'auto' : 'smooth', block: 'nearest' });
  }

  /* ---------- share ---------- */

  // Plain punctuation only — em dashes and middle dots garble in some
  // messaging apps, so the shared text sticks to ASCII plus emoji.
  function shareText() {
    const best = bestShift();
    const rating = rate(best, optimal);
    const shifts = state.shifts.length;
    const lines = [`\u{1FA99} Minted No. ${day + 1}`];
    lines.push(rating.pct >= 100
      ? `The day's best plan, ${fmt(best)} in the vault, in ${shifts} shift${shifts === 1 ? '' : 's'}`
      : `${fmt(best)} in the vault, ${rating.pct}% of the day's best, in ${shifts} shift${shifts === 1 ? '' : 's'}`);
    lines.push('\u{1FA99}'.repeat(rating.coins));
    const s = loadStats();
    if (!archive && s.streak > 1) lines.push(`\u{1F4C8} ${s.streak} days running`);
    const earned = loadBadges();
    const fresh = archive ? [] : BADGES.filter((b) => earned[b.id] === day).map((b) => b.name);
    if (fresh.length) lines.push(`\u{1F3C5} ${fresh.join(', ')}`);
    lines.push('', 'https://jonezzyboy.github.io/minted/');
    return lines.join('\n');
  }

  const shareBtn = $('#share');
  const canShare = typeof navigator.share === 'function';
  const shareLabel = canShare ? 'Share result' : 'Copy result';
  shareBtn.textContent = shareLabel;

  function flashShare(msg) {
    shareBtn.textContent = msg;
    setTimeout(() => { shareBtn.textContent = shareLabel; }, 2000);
  }

  shareBtn.addEventListener('click', async () => {
    const text = shareText();
    if (canShare) {
      try { await navigator.share({ text }); return; }
      catch (e) { if (e.name === 'AbortError') return; }
    }
    try {
      await navigator.clipboard.writeText(text);
      flashShare('Copied');
    } catch {
      flashShare('Could not copy');
    }
  });

  /* ---------- the vault you work in ---------- */

  const THEMES = [
    { id: '', name: 'Counting house', floor: '#1b2a20', card: '#f6f0dc', coin: '#d9a63d' },
    { id: 'bullion', name: 'Bullion room', floor: '#e8dbb4', card: '#fcf8ea', coin: '#ab7d10' },
    { id: 'copperworks', name: 'Copperworks', floor: '#2c1b12', card: '#f5e9dc', coin: '#d07a3d' },
    { id: 'ledger', name: 'The ledger', floor: '#e5e0d1', card: '#fbf9f1', coin: '#9c7514' },
    { id: 'nightvault', name: 'Night vault', floor: '#0d0f12', card: '#1c2026', coin: '#dcaa4c' },
  ];

  let themeId = localStorage.getItem(THEME_KEY) || '';
  if (!THEMES.some((t) => t.id === themeId)) themeId = '';

  const themeBtn = $('#theme');
  const themeMenu = $('#themeMenu');

  // Each swatch is a coin on that vault's floor: floor square, coin in the
  // theme's brass, rim in its card stock.
  function themeChip(t) {
    const chip = document.createElement('span');
    chip.className = 'chip';
    chip.style.background = t.floor;
    const coin = document.createElement('span');
    coin.className = 'chip-coin';
    coin.style.background = t.coin;
    coin.style.boxShadow = `inset 0 0 0 1.5px ${t.card}`;
    chip.appendChild(coin);
    return chip;
  }

  function applyTheme() {
    if (themeId) document.documentElement.dataset.theme = themeId;
    else delete document.documentElement.dataset.theme;
    const label = document.createElement('span');
    label.className = 'theme-label';
    label.textContent = 'Vault';
    themeBtn.innerHTML = '';
    themeBtn.append(themeChip(THEMES.find((t) => t.id === themeId)), label);
  }

  function closeThemeMenu() {
    themeMenu.hidden = true;
    themeBtn.setAttribute('aria-expanded', 'false');
  }

  function renderThemeMenu() {
    themeMenu.innerHTML = '';
    for (const t of THEMES) {
      const b = document.createElement('button');
      b.type = 'button';
      b.setAttribute('role', 'option');
      b.setAttribute('aria-selected', String(t.id === themeId));
      if (t.id === themeId) b.classList.add('selected');
      const name = document.createElement('span');
      name.className = 'theme-name';
      name.textContent = t.name;
      b.append(themeChip(t), name);
      if (t.id === themeId) {
        const tick = document.createElement('span');
        tick.className = 'tick';
        tick.textContent = '✓';
        b.appendChild(tick);
      }
      b.addEventListener('click', () => {
        themeId = t.id;
        localStorage.setItem(THEME_KEY, themeId);
        applyTheme();
        closeThemeMenu();
      });
      themeMenu.appendChild(b);
    }
  }

  themeBtn.addEventListener('click', () => {
    if (themeMenu.hidden) {
      renderThemeMenu();
      themeMenu.hidden = false;
      themeBtn.setAttribute('aria-expanded', 'true');
    } else {
      closeThemeMenu();
    }
  });

  document.addEventListener('click', (e) => {
    if (!themeMenu.hidden && !themeMenu.contains(e.target) && !themeBtn.contains(e.target)) {
      closeThemeMenu();
    }
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeThemeMenu();
  });

  applyTheme();

  /* ---------- wiring ---------- */

  againBtn.addEventListener('click', () => {
    state.shift = newShift();
    state.actions = [];
    afterEl.hidden = true;
    ledgerEl.hidden = true;
    saveDay();
    render();
  });
  doneBtn.addEventListener('click', finish);

  /* ---------- boot ---------- */

  $('#issue').textContent = `No. ${day + 1}`;
  const shownDate = archive ? new Date(EPOCH.y, EPOCH.m, EPOCH.d + day) : new Date();
  $('#date').textContent = shownDate.toLocaleDateString(undefined, {
    weekday: 'long', day: 'numeric', month: 'long',
  });
  $('#archiveNote').hidden = !archive;
  renderBadges();
  renderShelfTicks();

  function tickClock() {
    const ms = msToMidnight();
    const h = Math.floor(ms / 36e5);
    const m = Math.floor((ms % 36e5) / 6e4);
    $('#clock').textContent = `${h}h ${String(m).padStart(2, '0')}m`;
  }
  tickClock();
  setInterval(tickClock, 30e3);

  function replay(actions) {
    const s = newShift();
    for (const a of actions) ring(s, roster, a);
    return s;
  }

  const saved = archive ? null : load(DAY_KEY);
  if (saved && saved.day === day) {
    state.shifts = saved.shifts || [];
    state.finished = !!saved.finished;
    if (state.finished) {
      const bestSh = state.shifts.slice().sort((a, b) => b.score - a.score)[0];
      if (bestSh) {
        state.shift = replay(bestSh.actions);
        showLedger(state.shift, state.shifts.indexOf(bestSh) + 1);
      }
      finish();
    } else if (state.shifts.length >= SHIFTS) {
      finish();
    } else if (saved.current && saved.current.length) {
      state.actions = saved.current.slice();
      state.shift = replay(state.actions);
      if (state.shift.over) endShift();
    } else if (state.shifts.length > 0) {
      const last = state.shifts[state.shifts.length - 1];
      showLedger(replay(last.actions), state.shifts.length);
      const left = SHIFTS - state.shifts.length;
      againBtn.textContent = `Back to the floor · ${left} shift${left === 1 ? '' : 's'} left`;
      afterEl.hidden = false;
    }
  }
  render();
})();
