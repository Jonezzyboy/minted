# Minted.

One working day at the coin press. Part of [The Daily Shelf](https://jonezzyboy.github.io/).

**Play it: [jonezzyboy.github.io/minted](https://jonezzyboy.github.io/minted/)**

## The game

The day runs to thirty bells. At each one you do a single thing:

- **Strike** a coin by hand — it goes straight into the vault.
- **Buy** one machine from the day's catalogue of six.

A machine pays out at every bell from the next one on. Bought early it earns
all day; bought late it never wins its price back. Spent coins are gone, and
only what is in the vault at the last bell counts.

Three shifts a day, and your best one counts — measured against the day's
single best plan. Everyone, everywhere, works the same catalogue.

## The daily

- Day catalogues are generated deterministically from the day number — no
  server, no data files. Everyone sees the same six machines at the same
  prices.
- The day flips at **local midnight**.
- `?day=N` (0-based) or `?no=N` (1-based) replays a past day for practice —
  streaks, stats and commendations unaffected.

## The best plan

Every catalogue effect only ever raises the strike value, the machine rate,
the number of bells, or the close multiplier — and none reads the vault.
For that monotone family, buying each machine the moment it's affordable is
provably the best timing for any purchase order, so the 1,957 ordered
subsets of the six items are the *entire* strategy space. The solver plays
them all and the best is the day's par: exact, and unbeatable by free play
(`test/solver.test.js` checks this against random strategies).

Days that fail quality gates are rerolled at generation time: buying has to
matter (par well above the all-strike baseline), the best plan has to buy at
least three machines, and lazily buying the shelf left to right must fall
short of par.

## Development

No build step — open `index.html` or `npm start`.

```
npm test
```

## Suite conventions

Shares The Daily Shelf's house style: `Name.` wordmark, midnight-local flip,
`minted-*-v1` localStorage keys, the shared `dailies-v1` ledger for sibling
ticks, commendations, and ASCII-punctuation share text.
