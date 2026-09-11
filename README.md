# Numberwang

A daily logic puzzle in the shape of Clues by Sam, with three things swapped and
one thing added. Every card carries a **number** instead of a name and a
**colour** instead of a profession, and the hidden verdict on each card is
**Numberwang** or **Not Numberwang**. Because the cards carry numbers, the clues
can do arithmetic: totals, differences, comparisons, parity, and counts of the
cards whose own number is prime, even, odd, or divisible by something.

Twenty cards, four wide and five high. The numbers are `1..20`, one of each. The
cast is seated in eight colour groups. Every puzzle is solvable from its clue
text alone with nothing revealed up front, and every card has a stored path
proving it can be deduced rather than guessed — `npm run audit` re-proves both
from the file.

The design is `docs/superpowers/specs/2026-09-10-numberwang-design.md`. **The
playable site is not in this repo yet**; it is the subject of
`docs/superpowers/plans/2026-09-10-numberwang-app.md`. What lives here is the
generator and the archive it writes.

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

A night of generation is `generate`, `manifest`, `audit --recent=10`, commit —
see `.github/workflows/generate.yml`, which runs at 03:17 UTC and pushes what
changed. It keeps a week in hand deliberately: a 4x5 board is a second or two of
SAT solving on a good seed and a quarter-minute on a bad one, so several failed
nights in a row should still cost nobody their puzzle.

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

## The clue mix, and why the arithmetic budgets are hand-set

`config/clue-mix.json` holds the measured share of each predicate, each feature
weight, and each colour-group shape. It was produced by running cbs2's
`archiveClueMix()` over its scraped archive of real Clues by Sam puzzles, and it
**cannot be re-derived in this repo** — there is no archive here to measure.
There is no script that generates it; the file is the measurement.

`orderPool` multiplies a candidate clue's score by its predicate's measured
share, so a predicate the archive never contained has share zero and is
generated *never*. Every arithmetic predicate is in exactly that position. Their
shares are therefore written by hand in `ARITH_RATE` in `shared/solver/mix.ts`,
totalling 23%, and `withArithBudgets` rescales the attested shares into the
remaining 77%. The budget is a judgement about how much arithmetic a puzzle
should ask for, not a measurement of anything — the only honest way to say it is
in a table with the number in it.

A share is a preference, though, and the exact-sum clue needs a limit: two "the
Numberwang cards in row 2 add to 47" clues on one board turn the puzzle into
arithmetic homework. `MAX_EXACT_SUMS` is one per puzzle, enforced as a filter
during generation and re-checked by the audit.

Measured over the first week generated: 22 of 91 clues arithmetic (24%), all
eight families present, one puzzle in eight carrying an exact sum.

## Colours

Eight, from `PALETTE` in `shared/solver/vocab.ts`, all of them words a clue can
say without explaining. Eight because that is what the source site averages in
professions across cbs2's 66 scraped puzzles — mean 8.29, median 8, mode 8.

How the twenty cards divide among those eight is drawn from `colourShapes`, the
group shapes the real archive actually produced, rather than split evenly. An
even split gives every colour two or three cards and never the singleton group
that makes a clue like "the only red card that is Numberwang" say anything; the
archive has 44 such groups.

## Clue text is tokenized, not finished English

`render` writes `#NAME:`, `#NAMES:`, `#COLOUR:`, `#COLOURS:`, `#COLOURN:`, `#C:`
and `#BETWEEN:` tokens and leaves the expansion to the app, which has the board
in front of it. So a stored clue reads

    2 of the Not Numberwang cards neighboring #NAME:6 are even

and the player sees the number on card 6. Generation also renders with
`colourTotals` on, which writes "Exactly 1 of 3 reds has …" where a bare
"Exactly 1 red has …" would leave you counting reds before the clue is usable.
