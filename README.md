# Numberwang

A daily logic puzzle in the shape of Clues by Sam, with three things swapped and
one thing added. Every card carries a **number** instead of a name and a
**colour** instead of a profession, and the hidden verdict on each card is
**Numberwang** or **Wangernumb**. Because the cards carry numbers, the clues
can do arithmetic: totals, differences, comparisons, parity, and counts of the
cards whose own number is prime, even, odd, or divisible by something.

Twenty cards, four wide and five high. The numbers are `1..20`, one of each. The
cast is seated in eight colour groups. Every puzzle is solvable from its clue
text alone with nothing revealed up front, and every card has a stored path
proving it can be deduced rather than guessed — `npm run audit` re-proves both
from the file.

The design is `docs/superpowers/specs/2026-09-10-numberwang-design.md`. This repo
holds all three parts of it: the generator, the archive it writes, and the app
that plays them.

## Commands

- `npm test` — the full Vitest suite. Generation tests run on a 4x4 board,
  because solving enumerates all `2^(width*height)` assignments and 4x5 is
  sixteen times dearer.
- `npm run test:generate` — build one puzzle at the shipped 4x5 size and check it
  is sound. Worth a minute before regenerating the archive.
- `npm run test:generate Brutal 7 5x6` — the same with another shaping band,
  seed, and board.
- `npm run generate` — fill every date from yesterday through today + 6 that has
  no file yet. `npm run generate -- 2026-09-10` for one date, `--force` to
  rebuild dates that already exist, `--days=N` for a different horizon.
- `npm run manifest` — regenerate `puzzles/index.json`. `npm run generate` does
  this already; the script is for fixing an index by hand.
- `npm run audit` — re-derive every committed puzzle from its filename alone and
  re-check it. `--recent=N` for the live window, `--no-rederive` for the fast
  structural pass.
- `npm run dev` — the app, at `/numberwang/`, reading `puzzles/` live.
- `npm run build` — the production bundle into `site/dist`. It is not the whole
  artifact on its own; see below.

A night of generation is `generate`, `manifest`, `audit --recent=10`, commit —
see `.github/workflows/generate.yml`, which runs at 03:17 UTC and pushes what
changed. It keeps a week in hand deliberately: a 4x5 board is a second or two of
SAT solving on a good seed and a quarter-minute on a bad one, so several failed
nights in a row should still cost nobody their puzzle.

## The app

Vite and React, rooted at `site/`, served at `/numberwang/` — a literal base in
`vite.config.ts`, not a UUID and not a config file. Routing is by hash
(`#/play/2026-09-11`), so Pages needs no rewrite rules and a deep link survives a
reload.

`puzzles/` is read over HTTP at `<base>puzzles/`, which is served two different
ways. In dev the `servePuzzles` plugin in `vite.config.ts` streams it out of the
repo root. In production nothing does, so `.github/workflows/pages.yml` copies
`puzzles/*.json` into `site/dist/puzzles/` before uploading the artifact. That
copy is the step to get right: leave it out and the site builds, deploys, and
then fails to load a single board. `npm run build` alone does not make a
servable tree — rehearse a deploy with

    npm run build && mkdir -p site/dist/puzzles && cp puzzles/*.json site/dist/puzzles/ && npx vite preview

Not every card carries a clue. The forcing chain only puts one on a card it
deduces something *from*, which on a twenty-card board leaves a handful holding
nothing; `fillSpareCards` gives those a real clue — true of the board, redundant
to the solution, and indistinguishable from the rest until you try to use it —
and leaves `MAX_FACT_CARDS` of them, three, carrying a maths or science fact in
italic instead. The fact is a joke that lands once a board and not six times.

A card has three states, and the solved two own the whole card:

| State | Look |
|---|---|
| Unsolved | Dark slate ground, the clue text on it |
| Numberwang | Clues by Sam's green (`#264d3b`), a burst of confetti as it lands |
| Wangernumb | Clues by Sam's red (`#5c2235`) |

A card's colour group is the colour of its number, in all three states, and is
nowhere else on the card: no band, no swatch, no word — the guess modal draws
its number the same way. The confetti is a one-second burst thrown from the card
that was just called Numberwang, not a pattern the solved card keeps; a board of
twenty kept patterns was twenty patterns, and the confetti stopped meaning
anything. A clue that names a colour group rings the cards in that group, in the
group's own colour — one group at a time, the most recently revealed (or
un-dimmed) colour clue, since a ring lights a whole group and two at once read
as one smear. Dimming that clue hands the ring back to the colour clue before
it. The ring is drawn above the corner ticks unless a tick has been coloured,
which makes it the player's own note and gives it back its corner.

Eight colours is past what colour alone reliably carries, and the design records
a named band as the first thing to add back if identifying groups turns out to
be a friction in play — `docs/superpowers/specs/2026-09-10-numberwang-design.md`,
"The card".

## Everything a date's puzzle is comes from the date

`buildPuzzle(date)` hashes the date string into a seed and reads the bands and
the clue mix out of `config/`. Nothing else goes in. So any file in `puzzles/`
can be rebuilt from its own name, which is what `audit.mts` does on every run,
and which makes a lost or corrupted puzzle a non-event. It also means changing
the generator changes history: the audit will say so rather than let the archive
drift away from the code that claims to produce it.

## Difficulty is reported, not aimed at

`config/difficulty.json` holds per-label metric bands fitted to human labels on
cbs2's 4x5 Clues by Sam archive. Two of their fields count clue cards, so
`bandsFor` refits those for a board of another size.

Numberwang has no labelled corpus at all, and none of the arithmetic predicates
appears in that calibration anywhere. So generation never rejects a puzzle for
missing a band: the first attempt that is uniquely solvable, fully chained and
path-reachable on every card is kept, and `classify` names whatever it turned out
to be. A reported label is an opinion; an aimed one would be a claim.

## The clue mix, and why two of its budgets are hand-set

`config/clue-mix.json` holds the measured share of each predicate, each feature
weight, and each colour-group shape. It was produced by running cbs2's
`archiveClueMix()` over its scraped archive of real Clues by Sam puzzles, and it
**cannot be re-derived in this repo** — there is no archive here to measure.
There is no script that generates it; the file is the measurement.

`orderPool` multiplies a candidate clue's score by its predicate's measured
share, so a predicate the archive never contained has share zero and is
generated *never*. Every arithmetic predicate is in exactly that position. Their
shares are therefore written by hand in `ARITH_RATE` in `shared/solver/mix.ts`,
totalling 37.5%, and `withArithBudgets` rescales the attested shares into the
remaining 62.5%. The budget is a judgement about how much arithmetic a puzzle
should ask for, not a measurement of anything — the only honest way to say it is
in a table with the number in it.

A share is a preference, though, and the exact-sum clue needs a limit: two "the
Numberwang cards in row 2 add to 47" clues on one board turn the puzzle into
arithmetic homework. `MAX_EXACT_SUMS` is one per puzzle, enforced as a filter
during generation and re-checked by the audit.

The second hand-set budget is `COLOUR_UNIT_RATE`, and it is hand-set for the
opposite reason: colour *was* measured, at 5.7% of unit slots, and the
measurement is of the wrong thing. In the source archive that unit is a
profession competing with rows, columns, neighbours and spans; here the group's
colour is half of what an unsolved card even shows. At the measured share a
whole board could go by without a card's colour being worth looking at. `withColourBudget`
lifts it to 0.3 and rescales the other features around it.

Neither budget lands where it aims, and not in the same direction. Colour
undershoots badly on its own — colour hints are under 2% of the candidate pool,
and a group of two or three scattered cards is a poor thing to deduce from, so
the chain passes over them however hard `orderPool` pushes. What actually spends
the colour budget is `fillSpareCards`, which reaches for a colour clue first.

Measured over the first week generated: 52 of 136 clues arithmetic (38%), all
eight families present, two puzzles in eight carrying an exact sum, and 52
clues naming a colour group (38%, against 11% before the budget).

## Colours

Eight, from `PALETTE` in `shared/solver/vocab.ts`, all of them words a clue can
say without explaining. Eight because that is what the source site averages in
professions across cbs2's 66 scraped puzzles — mean 8.29, median 8, mode 8.

Five or six clues a board name a colour group, and a clue that names one draws a
small bar of it after the word: eight groups is more than a player holds by name.

How the twenty cards divide among those eight is drawn from `colourShapes`, the
group shapes the real archive actually produced, rather than split evenly. An
even split gives every colour two or three cards and never the singleton group
that makes a clue like "the only red card that is Numberwang" say anything; the
archive has 44 such groups.

## Clue text is tokenized, not finished English

`render` writes `#NAME:`, `#NAMES:`, `#COLOUR:`, `#COLOURS:`, `#COLOURN:`, `#C:`
and `#BETWEEN:` tokens and leaves the expansion to the app, which has the board
in front of it. So a stored clue reads

    2 of the Wangernumb cards neighboring #NAME:6 are even

and the player sees the number on card 6. Generation also renders with
`colourTotals` on, which writes "Exactly 1 of 3 reds has …" where a bare
"Exactly 1 red has …" would leave you counting reds before the clue is usable.
