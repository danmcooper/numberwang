# Numberwang — design

A daily deduction puzzle in the shape of Clues by Sam, with numbers instead of
names, colours instead of professions, and a new family of clues that do
arithmetic on the numbers.

Forked from `cbsbd`, which is the second of three repos built on one solver:
`cbsbd` (the 2D archive and generator), `cbsbd3d` (the same solver on a 3x3x3
cube), and this one. Where a decision differs between the two parents, this
document says which it follows and why.

## The board

Four wide, five high. Twenty cards. The same shape as every real Clues by Sam
puzzle — all 66 in `cbsbd/puzzles/` are `(width 4, height 5)`, and `4x5` in this
codebase already means that, so there is nothing to transpose.

The weekday board schedule that `cbsbd` runs — 3x4 on Monday up to 6x6 on
Sunday — is deliberately **not** ported. One size, every day. The schedule is a
good idea and may come back; it is out of scope here.

Each card carries:

| Field | Replaces | What it is |
| --- | --- | --- |
| `number` | `name` | 1..20, one of each, shuffled |
| `colour` | `profession` | one of 8, in groups of mostly 2-3 |
| `numberwang` | `criminal` | the hidden boolean |

### Play

Unchanged from Clues by Sam, and from `cbsbd`. Some cards start revealed. Each
card carries a clue, hidden until that card is solved, so solving a card pays
out the next piece of evidence and the puzzle unfolds rather than arriving all
at once. A puzzle has one solution, and the generator proves it before shipping.
A board of this size runs to roughly fourteen clue cards.

### Numbers

The numbers are exactly `1..N` for a board of `N` cards, one of each, shuffled.
This was chosen against wider pools on measured evidence, not taste.

A subset-sum clue names a unit and a total and asks which cards make it. How
often that clue settles its unit outright depends entirely on how spread out the
numbers are. Measured over 20,000 trials on a 5-card unit:

| Numbers | Pins the unit | 2 ways | 3+ ways | Median total |
| --- | --- | --- | --- | --- |
| **1..20, one of each** | 72% | 26% | 2% | 25 |
| 20 distinct in 1..30 | 81% | 18% | 1% | 37 |
| 20 distinct in 1..99 | 94% | 6% | 0% | 119 |

Spread-out numbers make sum clues *too* strong: at 1..99 a single clue ends its
unit 94% of the time, so a puzzle is four clues and out, with nothing arguing
with anything. Tight consecutive numbers are the only setting where the
arithmetic has to cooperate with the other clues, and they keep the mental
addition at two digits.

The choice also deletes a whole category of complexity that `vocab.ts` carries
for names. `cbsbd` gates its name list in tiers (`NAMES`, `EXTRA_NAMES`,
`namesFor`) because `castOf` deals round-robin from shuffled buckets, so
appending a name would re-roll the cast of every puzzle already generated. A
`1..N` pool has no such problem: it scales with the board by definition, and
there is nothing to append. The tiers go.

Numbers are unique per card. "Numberwang" is a property of the **card**, not of
the number — two cards showing 17 cannot happen, so the question never arises,
and the solver keeps one variable per card.

### Colours

Eight colours per board, in groups sized to match the source material. The count
is derived, not picked: measured across all 66 scraped Clues by Sam puzzles,

| | |
| --- | --- |
| Distinct professions per puzzle | mean 8.29, median 8, mode 8 (30 of 66) |
| Cards per profession | mean 2.41, median 2 |
| Group size distribution | 1: 44, 2: 245, 3: 252, 4: 4, 6: 1, 8: 1 |

So eight groups over twenty cards, overwhelmingly twos and threes, with
singletons common enough to matter and four-plus rare enough to be noise.
Generation should draw group shapes from that distribution rather than dividing
evenly — an even split would never produce the singleton that makes
`only_trait_in_unit_is_in_unit` interesting.

The palette is red, orange, yellow, green, teal, blue, purple, pink — eight
names a clue can say plainly, with no "vermillion" or "sky" to explain.

Groups this small matter for play: they keep `"exactly 2 red cards are
Numberwang"` a strong clue, right where Clues by Sam has it. An earlier
six-colour proposal would have put six cards in a group on a large board and
softened every count clue that names one.

## Card appearance

Three states, and the colour must be legible in all of them — clues name colour
groups constantly, so colour has to survive the moment a card is solved, or you
lose the ability to reason about the group you just learned something about.

| State | Appearance |
| --- | --- |
| Unsolved | Neutral card, dark number |
| Numberwang | Peach ground with subtle blue and pink confetti |
| Not Numberwang | Black ground, white number |

Both solved states own the card's *background*, so colour lives in a **plain
band across the top** — a solid strip the background never touches, readable at
grid scale, present in all three states.

The band carries no text. Eight colours is past what colour alone reliably
carries, and a named band was considered and rejected in favour of the quieter
card; if colour identification proves to be a real friction in play, the name is
the first thing to add back.

## The clue language

Every predicate `cbsbd` has, renamed. `Trait` becomes `numberwang` /
`not_numberwang`; `unit(profession, cook)` becomes `unit(colour, teal)`. The
hint DSL's grammar is unchanged — `[a-z_]+` already admits the new names.

`has_trait` renders as the sketch's own catchphrase without any special casing:
**"17 is Numberwang."**

### The arithmetic families

Four new predicates. These are the point of the project.

| Predicate | Renders as | Strength |
| --- | --- | --- |
| `sum_of_trait_in_unit` | "The Numberwang cards in row 2 add to 25" | pins its unit 72% of the time |
| `diff_of_two_traits_in_unit` | "Two Numberwang cards in teal subtract to 6" | names two cards, leaves the rest open |
| `more_sum_in_unit_than_unit` | "The Numberwang cards in row 1 add to more than those in row 3" | settles nothing alone |
| `sum_parity_in_unit` | "The Numberwang cards in column 2 add to an even number" | one clean bit |

The four are deliberately a spread of strengths. A generator with only the exact
sum would write puzzles that fall over in four steps; the comparison and the
parity clue are the ones that compose with the counting predicates rather than
pre-empting them.

`diff_of_two_traits_in_unit` is the "subtracts to" of the original idea, read as
a pair gap. It asserts that *some* two Numberwang cards in the unit differ by
`n` — an existential, not a claim about the whole unit.

### Encoding

No pseudo-Boolean encoder, and no new SAT machinery at all.

Every arithmetic clue is scoped to a single unit, and units on this board are
small — the largest is a 5-card column, and colour groups are 2-3. So the
encoding is: enumerate the unit's `2^n` assignments, keep those whose sum
satisfies the clue, and emit a blocking clause for each that does not. That is
at most 32 clauses of at most 5 literals. `more_sum_in_unit_than_unit` spans two
units and enumerates the product — at most 1024 clauses of 10 literals, still
nothing.

`sat.ts` and `cardinality.ts` are untouched by this feature.

A size guard belongs in the code regardless: refuse to emit an arithmetic clue
over a unit larger than 12 cards. Rows and columns are bounded by the board, but
`between` and `reach` units are not bounded the same way, and a future larger
board would find the cliff before a human did. At 4x5 the guard never fires.

### Clue mix

`cbsbd` measures predicate rates off the real archive and multiplies candidate
scores by those rates in `orderPool`. The four arithmetic predicates appear in
no archive at any rate, so a measured mix gives them share 0 and they would be
generated never. They need explicit budgets, exactly as `CROSS_TRAIT_RATE` in
`corpus.ts` handles the cross-trait comparisons the source happens never to
write.

Starting budget: arithmetic clues at roughly 15-20% of a puzzle's clue cards,
with `sum_of_trait_in_unit` **capped at one per puzzle**. On a board of about
fourteen clue cards that is two or three arithmetic clues, at most one of them
decisive. The cap is the main defence against the 72% pin rate turning puzzles
shallow.

These live in `config/clue-mix.json` and are expected to be tuned by playing.

## Pipeline

Forked from `cbsbd`, with the parts that depend on a source site removed.

**Dropped:**

- `scripts/extract.mts` and its fixtures. There is no site to scrape.
- `VARIANTS` and `ONE_OFFS` in `shared/puzzle.ts`. Both exist to relate a
  generated puzzle to a real one — a variant is a *sibling of* a scraped
  puzzle, and the one-off is the escape hatch from that scheme. With no scraped
  puzzles, every puzzle here is simply the puzzle for its date, with no suffix
  and no variant field.
- Difficulty *targeting*. `cbsbd` aims generation at a label per weekday; the
  bands that make a label meaningful are fitted to human labels on the source's
  archive, which does not exist here and could not cover the arithmetic
  predicates if it did.
- The weekday board schedule, per the board section above.

**Kept:**

- The solver in full: `sat.ts`, `encode.ts`, `cardinality.ts`, `candidates.ts`,
  `enumerate.ts`, `solve.ts`, `backbone.ts`, `hint.ts`, `predicates.ts`,
  `grid.ts`, `generate.ts`, `render.ts`.
- `difficulty.ts`, demoted from a **target** to a **reporter**: it scores the
  finished puzzle and the puzzle carries that score, but generation does not
  steer toward it. This follows `cbsbd3d`, which hit the same wall.
- The manifest, the archive screen, the nightly generation Action, and `audit`.

**Deploy:** GitHub Pages at `/numberwang/`, with no UUID base path. This follows
`cbsbd3d`'s later call rather than `cbsbd`'s original one.

## Modules

The fork keeps `cbsbd`'s file boundaries. The work is one new file, a set of
renames, and small extensions at four known points.

**New — `shared/solver/arith.ts`:** the four arithmetic families in one place —
their semantics against a board, their candidate enumeration for the generator,
and their blocking-clause encoding. Keeping the encoding beside the semantics is
deliberate: the two must agree exactly, and the test that proves they do reads
better when it can see both.

**Extended:**

- `hint.ts` — four rows in `ARG_KINDS`, and `colour` replacing `profession` in
  the `ArgKind` union and the unit kinds.
- `predicates.ts` — `unit(colour, …)` membership; `hasTrait` renamed.
- `render.ts` — four phrasings.
- `encode.ts` — dispatch the four to `arith.ts`.

**Rewritten — `vocab.ts`:** loses the name tiers and `castOf` entirely (a `1..N`
pool needs neither), gains the palette, the colour-group shape sampler, and new
titles and flavour text. The existing titles count the board out loud in the
language of a crime scene; this game is a quiz show, and its copy should sound
like one.

## Testing

Test-driven throughout, with the ported suites carried over.

The test that matters most is a **differential test on the arithmetic
encoding**: for every arithmetic predicate, over every unit of every size the
board produces, assert that the blocking-clause encoding admits exactly the
assignments the semantics accept — checked by brute force over all `2^n`. This
is the same shape as the existing `sat.differential.test.ts` and exists for the
same reason. Arithmetic that is subtly wrong does not crash; it produces puzzles
that are unsolvable or multiply-solvable, and finding that out from a generated
board is far more expensive than finding it here.

Beyond that: semantics tests per predicate, render tests for the four phrasings,
a generation test that a produced puzzle is uniquely solvable, and an audit that
re-derives every committed puzzle from its file alone.

## Risks

**Sum clues are strong.** A 72% pin rate means over-use produces shallow
puzzles. The one-per-puzzle cap is the mitigation and the difficulty reporter is
the alarm; both want revisiting once there are puzzles to play.

**Arithmetic is a different cognitive load** from Clues by Sam's pure logic, and
some players will bounce off it. The budget keeps it a spice rather than the
meal, but this is a real change in what the game asks of someone.

**The inherited difficulty bands are miscalibrated** for a vocabulary they were
never fitted to — `bandsFor` counts cards in two of its fields, and the
arithmetic predicates are absent from the calibration entirely. Reporting rather
than aiming keeps this honest: no label is claimed that was not earned. Refitting
needs a labelled corpus of Numberwang puzzles, which does not exist yet and is
out of scope.

## Out of scope

- The weekday board schedule, and boards other than 4x5.
- One-offs and variants.
- Difficulty targeting and band recalibration.
- Named colour bands (recorded above as the first thing to add back if colour
  identification turns out to be a friction).
