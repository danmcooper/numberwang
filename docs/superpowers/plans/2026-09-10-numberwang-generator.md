# Numberwang Generator Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A generator that produces a uniquely-solvable Numberwang puzzle per date — a 4x5 board of numbers 1–20 in eight colour groups, with a hidden Numberwang verdict per card — and commits it as JSON with a manifest.

**Architecture:** Fork `cbsbd`'s solver (2D geometry, SAT encoding, candidate search, difficulty scoring) and `cbsbd3d`'s `mix.ts` (clue proportions for a game with no scraped archive). Rename `profession`→`colour` and `criminal`→`numberwang`, add a `numbers` array to `Shape`/`Board`, and add one new module, `arith.ts`, holding four arithmetic clue families — semantics, candidate enumeration, and CNF encoding together. Arithmetic needs no pseudo-Boolean encoder: each clue is scoped to one unit, units here are ≤5 cards, so the existing subset-blocking idiom in `encode.ts` covers it under the existing `MAX_ENUMERATED_UNIT` ceiling.

**Tech Stack:** TypeScript (ESM, `"type": "module"`), Vitest, tsx for scripts, Node 22+. No new runtime dependencies — the arithmetic feature adds no libraries.

**Spec:** `docs/superpowers/specs/2026-09-10-numberwang-design.md`

## Global Constraints

- **Board is fixed at width 4, height 5** — 20 cards. No weekday schedule, no other sizes.
- **Numbers are exactly `1..N` for an `N`-card board, one of each, shuffled.** Never drawn from a wider pool.
- **Eight colours per board**, from the palette `red, orange, yellow, green, teal, blue, purple, pink` in that canonical order.
- **Colour group sizes are sampled from `clue-mix.json`'s recorded shapes**, never divided evenly.
- **Trait names in the hint DSL are `numberwang` and `not_numberwang`.** The DSL's predicate/arg grammar is `[a-z_]+`, which already admits both.
- **Trait nouns in rendered clue text are `Numberwang card` / `Numberwang cards` and `Not Numberwang card` / `Not Numberwang cards`.** Never "numberwangs".
- **`sum_of_trait_in_unit` is capped at one clue per puzzle.** Arithmetic clues overall target 15–20% of clue cards.
- **Difficulty is reported, never targeted.** No generation path takes a difficulty label as an aim.
- **Arithmetic clues reuse `MAX_ENUMERATED_UNIT` (16)** as their unit-size ceiling. Do not introduce a second ceiling constant.
- **No `variant` and no one-offs.** Every puzzle is the puzzle for its date; filenames are `YYYY-MM-DD.json` with no suffix.
- Deploy path is `/numberwang/`, with no UUID base path.

---

## File Structure

Copied from `cbsbd` and modified:

| File | Responsibility after this plan |
| --- | --- |
| `shared/puzzle.ts` | `Person`/`Puzzle` types and `validatePuzzle`. Loses `VARIANTS`, `ONE_OFFS`, `Variant`, `puzzleBillingOf` |
| `shared/solver/grid.ts` | Unchanged — 2D geometry |
| `shared/solver/hint.ts` | Hint DSL. Gains 4 `ARG_KINDS` rows; `profession`→`colour`; new `Trait` union |
| `shared/solver/predicates.ts` | Board model + `EVALUATORS`. Board gains `numbers`; delegates 4 predicates to `arith.ts` |
| `shared/solver/encode.ts` | Clue→CNF. Delegates 4 predicates to `arith.ts` |
| `shared/solver/candidates.ts` | Candidate hint enumeration. Delegates 4 predicates to `arith.ts` |
| `shared/solver/render.ts` | Clue→English. Gains 4 phrasings and the new trait nouns |
| `shared/solver/vocab.ts` | Number pool, colour palette, colour-group shapes, titles, flavour |
| `shared/solver/mix.ts` | **Copied from `cbsbd3d`.** Clue proportions for a game with no archive |
| `shared/solver/corpus.ts` | `CROSS_TRAIT` budgets only. Loses every archive read |
| `shared/solver/difficulty.ts` | Scores a finished puzzle. Demoted from target to reporter |

Created:

| File | Responsibility |
| --- | --- |
| `shared/solver/arith.ts` | The four arithmetic families: semantics, candidates, CNF encoding |
| `shared/solver/arith.test.ts` | Semantics + candidate tests |
| `shared/solver/arith.differential.test.ts` | Encoding agrees with semantics over all 2^n assignments |

Not in this plan — `site/`, `index.html` and `vite.config.ts` are the app plan's
(`docs/superpowers/plans/2026-09-10-numberwang-app.md`). Task 1 leaves them out
of the fork rather than carrying a suite that Task 2 breaks.

Deleted from the fork:

`scripts/extract.mts`, `scripts/extract.test.mts`, `scripts/lib/` (all), `scripts/one-off.mts`, `scripts/calibrate.mts`, `shared/solver/corpus.test.ts`, `shared/solver/__snapshots__/`.

---

### Task 1: Fork the repo and strip the source-site half

Get a repo whose tests pass with everything that depends on a scraped archive removed. Nothing about Numberwang yet — this task's deliverable is a green `npm test` on a smaller `cbsbd`.

**Files:**
- Create: the whole tree, copied from `/Users/dan/code/cbsbd`
- Create: `shared/solver/mix.ts`, `shared/solver/mix.test.ts`, `config/clue-mix.json` (copied from `/Users/dan/code/cbsbd3d`)
- Modify: `package.json`, `shared/puzzle.ts`, `shared/solver/corpus.ts`
- Delete: `scripts/extract.mts`, `scripts/extract.test.mts`, `scripts/lib/`, `scripts/one-off.mts`, `scripts/calibrate.mts`, `shared/solver/corpus.test.ts`, `shared/solver/__snapshots__/`, `puzzles/`, `site/`, `everfiresearch.pdf`, `config/site.json`, `docs/superpowers/plans/`, `docs/superpowers/specs/2026-07-07-*`, `docs/superpowers/specs/2026-08-29-*`

**Interfaces:**
- Consumes: nothing
- Produces: a tree where `shared/solver/*` compiles and `npm test` passes; `ClueMix` and `loadMix()` from `mix.ts`; `CROSS_TRAIT` and `CROSS_TRAIT_RATE` from `corpus.ts`

- [ ] **Step 1: Copy the tree, excluding what the fork does not want**

`site/` is excluded deliberately: the app is a separate plan
(`2026-09-10-numberwang-app.md`), and its tests read `person.name` and
`person.criminal`, which Task 2 removes. Copying it now would mean carrying a
broken suite through nine tasks. The generator plan ships committed puzzle JSON
and nothing rendered.

```bash
cd /Users/dan/code/numberwang
rsync -a --exclude='.git' --exclude='node_modules' --exclude='puzzles' \
  --exclude='site' --exclude='.DS_Store' --exclude='docs' \
  --exclude='everfiresearch.pdf' \
  /Users/dan/code/cbsbd/ ./
```

- [ ] **Step 2: Delete the source-site half**

```bash
cd /Users/dan/code/numberwang
rm -rf scripts/lib scripts/extract.mts scripts/extract.test.mts \
       scripts/one-off.mts scripts/calibrate.mts \
       shared/solver/corpus.test.ts shared/solver/__snapshots__ \
       config/site.json vite.config.ts
git mv scripts/audit-dan.mts scripts/audit.mts 2>/dev/null || mv scripts/audit-dan.mts scripts/audit.mts
```

- [ ] **Step 3: Copy the no-archive mix machinery from cbsbd3d**

`cbsbd3d` already solved the problem Numberwang has: clue proportions for a game with no scraped archive of its own. Take its module and its committed JSON rather than rebuilding either.

```bash
cd /Users/dan/code/numberwang
cp /Users/dan/code/cbsbd3d/shared/solver/mix.ts      shared/solver/mix.ts
cp /Users/dan/code/cbsbd3d/shared/solver/mix.test.ts shared/solver/mix.test.ts
cp /Users/dan/code/cbsbd3d/config/clue-mix.json      config/clue-mix.json
```

- [ ] **Step 4: Rewrite `corpus.ts` to hold only the cross-trait budgets**

Everything else in it read the archive. Replace the whole file with:

```ts
/**
 * Budgets for predicates the generator may use that no archived clue attests.
 *
 * Numberwang has no scraped archive at all — the shares in `config/clue-mix.json`
 * come from cbs2's 4x5 archive, so any predicate that archive never wrote has
 * share 0, and `orderPool` multiplies by share. A predicate with share 0 is
 * generated never. These are the ones that need telling otherwise.
 *
 * The source compares one trait across two units ("more criminals in row 1 than
 * row 4") and two traits within one unit ("more criminals than innocents in row
 * 1"), and never both at once. That looks like an accident of what the source
 * happened to write rather than a rule of the game.
 */
export const CROSS_TRAIT: Record<string, string> = {
  more_traits_in_unit_than_traits_in_unit: 'more_traits_in_unit_than_unit',
  equal_traits_in_unit_and_traits_in_unit: 'equal_number_of_traits_in_units',
};

/** What fraction of its attested parent's rate each `CROSS_TRAIT` predicate
 * gets. A third puts the pair together at rather less than one clue per puzzle:
 * present, not a tic. */
export const CROSS_TRAIT_RATE = 1 / 3;
```

- [ ] **Step 5: Strip `VARIANTS`, `ONE_OFFS` and `puzzleBillingOf` from `shared/puzzle.ts`**

Delete the `VARIANTS` const and its `Variant` type, the `ONE_OFFS` const and its `OneOffSlug` type, `puzzleBillingOf`, the `VARIANT_NAMES` const, the `variant` field on `Puzzle`, and the `variant` branch of `validatePuzzle`. Every puzzle here is simply the puzzle for its date.

- [ ] **Step 6: Update `package.json`**

```json
{
  "name": "numberwang",
  "private": true,
  "type": "module",
  "scripts": {
    "test": "vitest run",
    "test:generate": "tsx scripts/check-generation.mts",
    "manifest": "tsx scripts/manifest.mts",
    "generate": "tsx scripts/generate.mts",
    "audit": "tsx scripts/audit.mts"
  }
}
```

Keep the `dependencies` and `devDependencies` blocks exactly as copied — the app
plan needs React and `@vitejs/plugin-react`, and reinstalling them later would
only risk a different version. `dev`, `build` and `preview` are absent because
there is nothing to serve until the app plan restores `site/` and
`vite.config.ts`.

- [ ] **Step 7: Delete every test that referenced what was removed, then run the suite**

Run: `npm install && npx tsc --noEmit`
Expected: errors ONLY in `scripts/` and tests that referenced `VARIANTS`, `ONE_OFFS`, `puzzleBillingOf`, `archiveClueMix`, or the extractor. Fix each by deleting the referencing test case or, in `scripts/`, the referencing branch. `shared/solver/*.ts` must compile untouched.

Run: `npm test`
Expected: PASS. If a solver test fails here, the fork copied wrong — stop and re-copy rather than editing the solver.

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "Fork cbsbd's solver without its source site

Everything that read the scraped archive is gone: the extractor, the
calibrator, corpus.ts's archive walks, and the variant and one-off schemes
that only mean something relative to a real puzzle. mix.ts and clue-mix.json
come from cbsbd3d, which already needed clue proportions for a game with no
archive of its own."
```

---

### Task 2: The puzzle file format

**Files:**
- Modify: `shared/puzzle.ts`
- Test: `shared/puzzle.test.ts`

**Interfaces:**
- Consumes: nothing from Task 1 beyond the stripped file
- Produces: `Person { number: number; colour: string; numberwang: boolean; clue: string | null; origHint: string | null; paths: number[][] | null }`; `validatePuzzle(data: unknown): Puzzle` enforcing a `1..N` permutation

- [ ] **Step 1: Write the failing tests**

Add to `shared/puzzle.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { PuzzleValidationError, validatePuzzle } from './puzzle';

const person = (number: number, colour: string, numberwang = false) => ({
  number, colour, numberwang, clue: null, origHint: null, paths: null,
});

const good = () => ({
  formatVersion: 1 as const,
  id: 'abcdef012345',
  date: '2026-09-10',
  title: 'A Test Board',
  difficulty: 'Medium',
  width: 4,
  height: 5,
  initialReveals: [0],
  source: 'generated',
  people: Array.from({ length: 20 }, (_, i) => person(i + 1, 'red')),
});

describe('validatePuzzle numbers', () => {
  it('accepts a 1..N permutation', () => {
    const p = good();
    p.people = [...p.people].reverse();
    expect(validatePuzzle(p).people[0].number).toBe(20);
  });

  it('rejects a repeated number', () => {
    const p = good();
    p.people[3].number = p.people[2].number;
    expect(() => validatePuzzle(p)).toThrow(PuzzleValidationError);
  });

  it('rejects a number outside 1..N', () => {
    const p = good();
    p.people[0].number = 21;
    expect(() => validatePuzzle(p)).toThrow(PuzzleValidationError);
  });

  it('rejects a missing colour', () => {
    const p = good();
    delete (p.people[0] as Record<string, unknown>).colour;
    expect(() => validatePuzzle(p)).toThrow(PuzzleValidationError);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run shared/puzzle.test.ts`
Expected: FAIL — the old `Person` shape has `name`/`profession`/`criminal`, so the fixtures are rejected or the number checks are absent.

- [ ] **Step 3: Rewrite `Person` and add the number check**

Replace the `Person` interface with:

```ts
export interface Person {
  /** 1..N, unique across the board. Replaces Clues by Sam's `name`. */
  number: number;
  /** One of `PALETTE`. Replaces `profession`, and groups the same way. */
  colour: string;
  /** The hidden verdict. Replaces `criminal`. */
  numberwang: boolean;
  clue: string | null;
  origHint: string | null;
  paths: number[][] | null;
}
```

In `validatePuzzle`, after the `people.length` check, add:

```ts
  const people = p.people as Record<string, unknown>[];
  const seen = new Set<number>();
  for (const [k, person] of people.entries()) {
    const num = person.number;
    if (!Number.isInteger(num) || (num as number) < 1 || (num as number) > count) {
      fail(`person ${k}: number must be an integer in 1..${count}`);
    }
    if (seen.has(num as number)) fail(`person ${k}: number ${num} appears twice`);
    seen.add(num as number);
    if (typeof person.colour !== 'string' || person.colour.length === 0) {
      fail(`person ${k}: colour must be a non-empty string`);
    }
    if (typeof person.numberwang !== 'boolean') fail(`person ${k}: numberwang must be a boolean`);
  }
```

The uniqueness check plus the `1..count` range check together prove a permutation without sorting: `count` distinct integers drawn from a range of size `count` must be all of them.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run shared/puzzle.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add shared/puzzle.ts shared/puzzle.test.ts
git commit -m "Put a number, a colour and a verdict on every card

The number is checked as a permutation of 1..N rather than merely as an
integer: uniqueness plus a range of exactly N proves it without sorting, and
an off-by-one in the dealer would otherwise ship a board with two 7s and no 3."
```

---

### Task 3: `Shape` and `Board` carry numbers, and `profession` becomes `colour`

The arithmetic predicates need each card's number at evaluation time, and `Board` is what every evaluator receives. This is also the natural moment for the `profession`→`colour` rename, because both touch the same declarations.

**Files:**
- Modify: `shared/solver/enumerate.ts`, `shared/solver/predicates.ts`, `shared/solver/hint.ts`, `shared/solver/encode.ts`, `shared/solver/candidates.ts`, `shared/solver/render.ts`, `shared/solver/generate.ts`, `shared/solver/difficulty.ts`, `shared/solver/sample.ts`
- Test: `shared/solver/predicates.test.ts`

**Interfaces:**
- Consumes: `Person` from Task 2
- Produces: `Shape { grid: Grid; colours: string[]; numbers: number[] }`; `makeBoard(grid, colours, numbers, numberwang): Board`; `Board { grid; colours; numbers; numberwang; cache? }`; `Unit` variant `{ kind: 'colour'; name: string }`; `HintArg` variant `{ t: 'colour'; name: string }`

- [ ] **Step 1: Write the failing test**

Add to `shared/solver/predicates.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { makeGrid } from './grid';
import { makeBoard, unitMembers } from './predicates';

describe('board numbers and colours', () => {
  const grid = makeGrid(2, 2);
  const colours = ['red', 'blue', 'red', 'teal'];
  const numbers = [3, 1, 4, 2];
  const board = makeBoard(grid, colours, numbers, [true, false, true, false]);

  it('exposes each card its number', () => {
    expect(board.numbers).toEqual([3, 1, 4, 2]);
  });

  it('groups cards by colour', () => {
    expect(unitMembers(board, { kind: 'colour', name: 'red' })).toEqual([0, 2]);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run shared/solver/predicates.test.ts`
Expected: FAIL — `makeBoard` takes three arguments and there is no `colour` unit kind.

- [ ] **Step 3: Rename `profession` to `colour` mechanically**

The rename is exact and total across the solver. Run it, then read the diff.

```bash
cd /Users/dan/code/numberwang
FILES=$(git ls-files 'shared/**/*.ts' 'scripts/**/*.mts')
sed -i '' \
  -e 's/professions/colours/g' \
  -e 's/profession/colour/g' \
  -e 's/Professions/Colours/g' \
  -e 's/Profession/Colour/g' \
  -e 's/PROFESSIONS/PALETTE/g' \
  -e 's/#PROFN/#COLOURN/g' \
  -e 's/#PROFS/#COLOURS/g' \
  -e 's/#PROF/#COLOURN_PLACEHOLDER_NEVER/g' \
  $FILES
git diff --stat
```

The third token needs care, so do it separately and in this order — longest
first, or `#PROF` eats the prefix of the other two:

```bash
sed -i '' -e 's/#COLOURN_PLACEHOLDER_NEVER/#COLOUR/g' $FILES
grep -rn '#PROF' shared scripts || echo 'no PROF tokens left'
```

These three tokens are the contract between `render.ts` and the app's
`tokenize.ts`: the renderer works from a hint alone and cannot count a board, so
it emits `#COLOUR:teal` / `#COLOURS:teal` / `#COLOURN:teal` and the app fills in
the noun and the count. Renaming them now means the app plan parses what the
generator actually writes.

`mix.ts`'s `professionShapes` field is renamed by the same pass to `colourShapes`; `config/clue-mix.json` still holds the old key, so update it too:

```bash
sed -i '' 's/"professionShapes"/"colourShapes"/' config/clue-mix.json
```

- [ ] **Step 4: Rename the three token helpers in `render.ts` by hand**

`sed` cannot see these — they are `prof`, not `profession`:

```ts
const colour = (c: string) => `#COLOUR:${c}`;
const colours = (c: string) => `#COLOURS:${c}`;
/**
 * "3 teal cards" — the colour's whole group, not just the ones being counted.
 * Expanded by the site, which has the board and can count; the renderer works
 * from the hint alone and has no way to know.
 */
const colourN = (c: string) => `#COLOURN:${c}`;
```

Rename every call: `prof(` → `colour(`, `profs(` → `colours(`, `profN(` →
`colourN(`. Then confirm nothing was missed, in `render.ts` and everywhere else:

```bash
grep -rn '\bprofN\?s\?\b' shared scripts || echo 'no short prof names left'
```

`RenderOptions.professionTotals` is renamed to `colourTotals` by Step 3's sed;
verify that with the same grep.

- [ ] **Step 5: Add `numbers` to `Shape` and `Board`**

In `shared/solver/enumerate.ts`:

```ts
export interface Shape {
  grid: Grid;
  colours: string[];
  /** 1..size, one per card, in card order. */
  numbers: number[];
}
```

In `shared/solver/predicates.ts`:

```ts
export interface Board {
  grid: Grid;
  colours: string[];
  /** 1..size, one per card. The arithmetic predicates in `arith.ts` are the
   * only readers; every other predicate is a function of `numberwang` alone. */
  numbers: number[];
  numberwang: boolean[];
  /** Memoises unit membership; safe because membership depends only on the
   * grid and colours, never on `numberwang` or `numbers`. */
  cache?: Map<string, number[]>;
}

export function makeBoard(
  grid: Grid,
  colours: string[],
  numbers: number[],
  numberwang: boolean[],
): Board {
  return { grid, colours, numbers, numberwang, cache: new Map() };
}
```

- [ ] **Step 6: Fix every `makeBoard` call site**

Run: `npx tsc --noEmit`
Expected: errors at each `makeBoard(...)` call with 3 arguments. Fix each by threading `shape.numbers` through as the third argument. In `enumerate.ts`'s `filterMasks`, that is `makeBoard(shape.grid, shape.colours, shape.numbers, numberwang)`. In `encode.ts`'s `encode`, the same. Where a test constructs a board with no arithmetic in play, pass an ascending array: `Array.from({ length: size }, (_, i) => i + 1)`.

- [ ] **Step 7: Run the tests to verify they pass**

Run: `npx tsc --noEmit && npm test`
Expected: PASS, clean typecheck.

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "Give the board colours and numbers

Colour is a straight rename of profession — same categorical attribute, same
double life as a clue unit. The number is new, and only arith.ts will read it;
every predicate carried over from Clues by Sam is a function of the hidden
verdict alone, which is still why unitMembers can memoise."
```

---

### Task 4: `criminal`/`innocent` become `numberwang`/`not_numberwang`

**Files:**
- Modify: every file under `shared/` and `scripts/`
- Test: `shared/solver/render.test.ts`

**Interfaces:**
- Consumes: Task 3's board
- Produces: `Trait = 'numberwang' | 'not_numberwang'`; `plural(t: Trait, n: number): string` returning the card nouns

- [ ] **Step 1: Write the failing test**

Add to `shared/solver/render.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { plural } from './render';

describe('trait nouns', () => {
  it('never says "numberwangs"', () => {
    expect(plural('numberwang', 1)).toBe('Numberwang card');
    expect(plural('numberwang', 3)).toBe('Numberwang cards');
    expect(plural('not_numberwang', 1)).toBe('Not Numberwang card');
    expect(plural('not_numberwang', 3)).toBe('Not Numberwang cards');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run shared/solver/render.test.ts`
Expected: FAIL — `'numberwang'` is not assignable to `Trait`.

- [ ] **Step 3: Rename the trait mechanically**

Order matters: rewrite `innocent` first, so that the `criminal`→`numberwang` pass cannot then rewrite anything the first pass produced.

```bash
cd /Users/dan/code/numberwang
FILES=$(git ls-files 'shared/**/*.ts' 'scripts/**/*.mts')
sed -i '' \
  -e 's/innocents/not_numberwangs/g' \
  -e 's/innocent/not_numberwang/g' \
  -e 's/Innocent/NotNumberwang/g' \
  -e 's/criminals/numberwangs/g' \
  -e 's/criminal/numberwang/g' \
  -e 's/Criminal/Numberwang/g' \
  $FILES
sed -i '' 's/"numberwangs"/"numberwangs"/' config/difficulty.json
git diff --stat
```

`config/difficulty.json` has a `criminals` band key; rename it to match:

```bash
sed -i '' 's/"criminals"/"numberwangs"/' config/difficulty.json
```

- [ ] **Step 4: Replace `plural` in `render.ts` with the card nouns**

The mechanical pass will have produced `numberwang`/`numberwangs` as the rendered nouns, which is wrong English and wrong for the game. Replace `plural` with:

```ts
const NOUN: Record<Trait, [string, string]> = {
  numberwang: ['Numberwang card', 'Numberwang cards'],
  not_numberwang: ['Not Numberwang card', 'Not Numberwang cards'],
};

/** The noun a clue uses for a trait. Never "numberwangs": the trait is a
 * verdict on a card, and the card is the thing a clue counts. */
export function plural(t: Trait, n: number): string {
  const [one, many] = NOUN[t];
  return n === 1 ? one : many;
}
```

- [ ] **Step 5: Read every rendered string and fix the ones the rename broke**

Run: `npx vitest run shared/solver/render.test.ts`
Expected: many failures with visibly wrong English, because the archive-derived phrasings assumed a one-word noun. Fix each renderer's template so the sentence reads correctly with a multi-word noun — in particular any that wrote `${t}s` or `${argTrait(a, 0)}s` inline rather than calling `plural`.

```bash
grep -n 'argTrait(a, [0-9])}s\|${t}s' shared/solver/render.ts
```

Every hit is a bug introduced by the rename. Route each through `plural`.

- [ ] **Step 6: Run the whole suite**

Run: `npx tsc --noEmit && npm test`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "Rename the hidden verdict to Numberwang

A mechanical rename except in render.ts, where the archive's phrasings assumed
the trait was one word and pluralised with an inline -s. The trait is a verdict
on a card now, so the noun a clue counts is the card: \"Numberwang cards\", not
\"numberwangs\"."
```

---

### Task 5: The vocabulary — numbers, palette, colour groups

**Files:**
- Modify: `shared/solver/vocab.ts`
- Test: `shared/solver/vocab.test.ts`

**Interfaces:**
- Consumes: `ClueMix` and its `colourShapes` from `mix.ts`
- Produces: `PALETTE: string[]`; `numbersFor(size: number, rng: () => number): number[]`; `colourShapeFor(mix: ClueMix, size: number, rng: () => number): number[]`; `coloursFor(size: number, shape: number[], rng: () => number): string[]`; `TITLES: string[]`; `FLAVOUR: string[]`

- [ ] **Step 1: Write the failing tests**

Replace `shared/solver/vocab.test.ts` with:

```ts
import { describe, expect, it } from 'vitest';
import { PALETTE, coloursFor, colourShapeFor, numbersFor } from './vocab';

// A deterministic stand-in for the generator's seeded rng.
const seq = (values: number[]) => {
  let k = 0;
  return () => values[k++ % values.length];
};

describe('numbersFor', () => {
  it('deals each of 1..size exactly once', () => {
    const out = numbersFor(20, seq([0.1, 0.7, 0.3, 0.9, 0.5]));
    expect([...out].sort((a, b) => a - b)).toEqual(
      Array.from({ length: 20 }, (_, i) => i + 1),
    );
  });

  it('shuffles rather than returning them in order', () => {
    const out = numbersFor(20, seq([0.1, 0.7, 0.3, 0.9, 0.5]));
    expect(out).not.toEqual(Array.from({ length: 20 }, (_, i) => i + 1));
  });
});

describe('PALETTE', () => {
  it('holds eight plainly nameable colours in canonical order', () => {
    expect(PALETTE).toEqual([
      'red', 'orange', 'yellow', 'green', 'teal', 'blue', 'purple', 'pink',
    ]);
  });
});

describe('colourShapeFor', () => {
  const mix = {
    pred: {},
    feature: {},
    colourShapes: [[3, 3, 3, 3, 2, 2, 2, 2], [4, 3, 3, 3, 3, 2, 1, 1]],
  };

  it('returns a shape that seats every card', () => {
    const shape = colourShapeFor(mix, 20, seq([0.1]));
    expect(shape.reduce((a, b) => a + b, 0)).toBe(20);
  });

  it('returns one of the recorded shapes, not an even division', () => {
    const shape = colourShapeFor(mix, 20, seq([0.1]));
    expect(mix.colourShapes).toContainEqual(shape);
  });

  it('never uses more groups than the palette has colours', () => {
    const shape = colourShapeFor(mix, 20, seq([0.9]));
    expect(shape.length).toBeLessThanOrEqual(PALETTE.length);
  });
});

describe('coloursFor', () => {
  it('assigns a colour per card matching the shape it was given', () => {
    const out = coloursFor(20, [3, 3, 3, 3, 2, 2, 2, 2], seq([0.2, 0.6, 0.4]));
    expect(out).toHaveLength(20);
    const sizes = [...new Set(out)].map((c) => out.filter((x) => x === c).length);
    expect(sizes.sort((a, b) => b - a)).toEqual([3, 3, 3, 3, 2, 2, 2, 2]);
  });

  it('draws only from the palette', () => {
    const out = coloursFor(20, [3, 3, 3, 3, 2, 2, 2, 2], seq([0.2, 0.6]));
    for (const c of out) expect(PALETTE).toContain(c);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run shared/solver/vocab.test.ts`
Expected: FAIL — none of these functions exist.

- [ ] **Step 3: Rewrite `vocab.ts`**

Replace the whole file:

```ts
/**
 * The numbers, the colours and the incidental copy a puzzle is dressed in.
 *
 * Clues by Sam's `NAMES` came in size tiers, because `castOf` dealt round-robin
 * from shuffled alphabetical buckets and appending a name would have re-rolled
 * the cast of every puzzle already generated. A `1..N` pool has no such problem:
 * it scales with the board by definition and there is nothing to append. The
 * tiers, the buckets and `castOf` are all gone.
 */
import type { ClueMix } from './mix';

/**
 * Eight colours, in the order a clue would list them.
 *
 * Eight because that is what the source averages in professions — measured over
 * cbs2's 66 scraped puzzles, mean 8.29, median 8, mode 8 — and every name here
 * is one a clue can say without explaining ("teal", not "vermillion").
 */
export const PALETTE: string[] = [
  'red', 'orange', 'yellow', 'green', 'teal', 'blue', 'purple', 'pink',
];

/** Fisher-Yates against a seeded rng, so a board is reproducible from its seed. */
function shuffle<T>(items: T[], rng: () => number): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/** `1..size`, one of each, shuffled. */
export function numbersFor(size: number, rng: () => number): number[] {
  return shuffle(
    Array.from({ length: size }, (_, i) => i + 1),
    rng,
  );
}

/**
 * How many colour groups a board gets and how big each is.
 *
 * Drawn from the shapes the archive actually produced rather than divided
 * evenly, for the same reason `mix.ts` exists at all: an even split of 20 cards
 * into 8 groups never yields the singleton group that makes
 * `only_trait_in_unit_is_in_unit` say anything, and the archive has 44 of them.
 */
export function colourShapeFor(mix: ClueMix, size: number, rng: () => number): number[] {
  const usable = mix.colourShapes.filter(
    (s) => s.reduce((a, b) => a + b, 0) === size && s.length <= PALETTE.length,
  );
  if (usable.length === 0) {
    throw new Error(`no recorded colour shape seats ${size} cards in ${PALETTE.length} colours`);
  }
  return usable[Math.floor(rng() * usable.length)];
}

/** One colour per card: the shape's groups filled from a shuffled palette, then
 * scattered across the board. */
export function coloursFor(size: number, shape: number[], rng: () => number): string[] {
  const chosen = shuffle(PALETTE, rng).slice(0, shape.length);
  const flat: string[] = [];
  shape.forEach((n, gi) => {
    for (let k = 0; k < n; k++) flat.push(chosen[gi]);
  });
  if (flat.length !== size) throw new Error(`shape seats ${flat.length} cards, not ${size}`);
  return shuffle(flat, rng);
}

/**
 * Clues by Sam's titles are a crime scene and count the board out loud. This is
 * a quiz show, so its titles are rewritten rather than ported.
 */
export const TITLES: string[] = [
  "That's Numberwang!",
  'Round Three: Wangernumb',
  'Twenty Cards, Eight Colours',
  'The Board Does Not Explain Itself',
  'Nobody Asked How the Scoring Works',
  'Rotate the Board',
  'A Perfectly Ordinary Total',
  'Two of These Add Up',
  'The Numbers Were Always There',
  'Let Us Move to the Next Round',
  'Somebody Has Miscounted',
  'The Colours Are Not a Hint',
  'Sum of the Parts',
  'Nineteen Was Never in Doubt',
  'The Quiet Half of the Board',
  'One Row Gives It Away',
  'Every Total Tells',
  'Not All Numbers Are Numberwang',
  'The Difference of Two Cards',
  'An Even Number, Obviously',
];

export const FLAVOUR: string[] = [
  'I did not catch the rules either.',
  'I only play for the prizes.',
  'Do not look at me, I am terrible at this.',
  'I was told there would be a buzzer.',
  'My round was earlier.',
  'I have never been good with totals.',
  'Ask the one next to me.',
  'I would rather not commit to a number.',
  'The lights were in my eyes.',
  'I am here to make up the board.',
  'I lost count somewhere around the middle.',
  'They do not tell us anything backstage.',
  'I was reading my card the whole time.',
  'Nobody explained the colours to me.',
  'I have a system, but it is not working.',
  'That is a matter for the adjudicator.',
];
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run shared/solver/vocab.test.ts`
Expected: PASS

- [ ] **Step 5: Run the whole suite and fix `castOf` call sites**

Run: `npx tsc --noEmit`
Expected: errors wherever `generate.ts` or `sample.ts` called `castOf`, `namesFor` or `coloursFor`'s old signature. Replace each with `numbersFor` + `colourShapeFor` + `coloursFor`.

Run: `npm test`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "Deal numbers 1..N and eight colour groups

The number pool deletes vocab.ts's whole tier system: 1..N scales with the
board by definition, so there is no list to append to and no cast to re-roll.

Colour group sizes come from the shapes the archive produced, not from dividing
20 by 8. An even split never makes a singleton group, and the archive has 44 of
them — they are what gives only_trait_in_unit_is_in_unit anything to say."
```

---

### Task 6: `arith.ts` — the four predicates' semantics

**Files:**
- Create: `shared/solver/arith.ts`
- Create: `shared/solver/arith.test.ts`
- Modify: `shared/solver/hint.ts`, `shared/solver/predicates.ts`

**Interfaces:**
- Consumes: `Board` (with `numbers`) from Task 3; `unitMembers`, `hasTrait` from `predicates.ts`
- Produces: `ARITH_PREDS: readonly string[]`; `traitSum(b, members, t): number`; `ARITH_EVALUATORS: Record<string, (b: Board, a: HintArg[]) => boolean>`

- [ ] **Step 1: Write the failing tests**

Create `shared/solver/arith.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { parseHint } from './hint';
import { makeGrid } from './grid';
import { makeBoard } from './predicates';
import { ARITH_EVALUATORS, traitSum } from './arith';

// A 4x2 board. Row 1 is cards 0..3, row 2 is cards 4..7.
//   numbers  17  4  23   8        (row 1)
//             9 31  12  26        (row 2)
//   verdict    Y  N   N   Y        (row 1) -> Numberwang sum 25
//             N  Y   Y   N        (row 2) -> Numberwang sum 43
const board = () =>
  makeBoard(
    makeGrid(4, 2),
    ['red', 'red', 'blue', 'blue', 'teal', 'teal', 'pink', 'pink'],
    [17, 4, 23, 8, 9, 31, 12, 26],
    [true, false, false, true, false, true, true, false],
  );

const ev = (src: string) => {
  const h = parseHint(src);
  return ARITH_EVALUATORS[h.pred](board(), h.args);
};

describe('traitSum', () => {
  it('adds the numbers of the cards holding the trait', () => {
    expect(traitSum(board(), [0, 1, 2, 3], 'numberwang')).toBe(25);
    expect(traitSum(board(), [0, 1, 2, 3], 'not_numberwang')).toBe(27);
  });

  it('is zero when no member holds the trait', () => {
    expect(traitSum(board(), [1, 2], 'numberwang')).toBe(0);
  });
});

describe('sum_of_trait_in_unit', () => {
  it('is true at the exact total', () => {
    expect(ev('sum_of_trait_in_unit(unit(row,1),numberwang,25)')).toBe(true);
  });
  it('is false at any other total', () => {
    expect(ev('sum_of_trait_in_unit(unit(row,1),numberwang,24)')).toBe(false);
  });
  it('counts the other trait too', () => {
    expect(ev('sum_of_trait_in_unit(unit(row,1),not_numberwang,27)')).toBe(true);
  });
  it('is true at 0 for a unit with none of the trait', () => {
    expect(ev('sum_of_trait_in_unit(unit(colour,blue),numberwang,8)')).toBe(true);
  });
});

describe('diff_of_two_traits_in_unit', () => {
  it('is true when some pair differs by n', () => {
    // Row 1's Numberwang cards are 17 and 8 -> difference 9.
    expect(ev('diff_of_two_traits_in_unit(unit(row,1),numberwang,9)')).toBe(true);
  });
  it('is false when no pair differs by n', () => {
    expect(ev('diff_of_two_traits_in_unit(unit(row,1),numberwang,4)')).toBe(false);
  });
  it('is false when fewer than two members hold the trait', () => {
    expect(ev('diff_of_two_traits_in_unit(unit(colour,blue),numberwang,0)')).toBe(false);
  });
  it('reads the difference unsigned', () => {
    // Row 2's Numberwang cards are 31 and 12 -> 19, in either order.
    expect(ev('diff_of_two_traits_in_unit(unit(row,2),numberwang,19)')).toBe(true);
  });
});

describe('more_sum_in_unit_than_unit', () => {
  it('is true when the first unit sums higher', () => {
    expect(ev('more_sum_in_unit_than_unit(unit(row,2),unit(row,1),numberwang)')).toBe(true);
  });
  it('is false when it sums lower', () => {
    expect(ev('more_sum_in_unit_than_unit(unit(row,1),unit(row,2),numberwang)')).toBe(false);
  });
  it('is false on a tie', () => {
    expect(ev('more_sum_in_unit_than_unit(unit(row,1),unit(row,1),numberwang)')).toBe(false);
  });
});

describe('sum_parity_in_unit', () => {
  it('is true when the parity matches — 25 is odd', () => {
    expect(ev('sum_parity_in_unit(unit(row,1),numberwang,1)')).toBe(true);
  });
  it('is false when it does not', () => {
    expect(ev('sum_parity_in_unit(unit(row,1),numberwang,0)')).toBe(false);
  });
  it('treats an empty sum of 0 as even', () => {
    expect(ev('sum_parity_in_unit(unit(colour,blue),not_numberwang,1)')).toBe(true);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run shared/solver/arith.test.ts`
Expected: FAIL — `Cannot find module './arith'`.

- [ ] **Step 3: Add the four predicates to the hint DSL**

In `shared/solver/hint.ts`, add to `ARG_KINDS`:

```ts
  sum_of_trait_in_unit: [U, T, N],
  diff_of_two_traits_in_unit: [U, T, N],
  more_sum_in_unit_than_unit: [U, U, T],
  sum_parity_in_unit: [U, T, N],
```

- [ ] **Step 4: Write `arith.ts`**

Create `shared/solver/arith.ts`:

```ts
/**
 * The four clue families that do arithmetic on the cards' numbers.
 *
 * Everything Clues by Sam wrote is a function of the hidden verdict alone —
 * counting cards, comparing counts, checking adjacency. These four read the
 * numbers as values, which is the one thing a name could never do.
 *
 * Semantics, candidate enumeration and CNF encoding all live here rather than
 * in the three modules that would otherwise own a third each. They have to
 * agree exactly — an encoding that admits one assignment the semantics reject
 * produces a puzzle that is unsolvable or multiply-solvable, silently — and the
 * differential test that proves they agree reads better when it can see both.
 */
import type { Cnf } from './sat';
import type { Hint, HintArg, Trait, Unit } from './hint';
import { type Board, hasTrait, unitMembers } from './predicates';

export class ArithError extends Error {}

/** The four, in the order this file defines them. */
export const ARITH_PREDS = [
  'sum_of_trait_in_unit',
  'diff_of_two_traits_in_unit',
  'more_sum_in_unit_than_unit',
  'sum_parity_in_unit',
] as const;

export const IS_ARITH: ReadonlySet<string> = new Set(ARITH_PREDS);

/** Sum of the numbers on the members that hold `t`. Empty sums to 0. */
export function traitSum(b: Board, members: number[], t: Trait): number {
  let s = 0;
  for (const i of members) if (hasTrait(b, i, t)) s += b.numbers[i];
  return s;
}

function argUnit(a: HintArg[], k: number): Unit {
  const x = a[k];
  if (x.t !== 'unit') throw new ArithError(`arg ${k} is not a unit`);
  return x.unit;
}
function argTrait(a: HintArg[], k: number): Trait {
  const x = a[k];
  if (x.t !== 'trait') throw new ArithError(`arg ${k} is not a trait`);
  return x.trait;
}
function argNum(a: HintArg[], k: number): number {
  const x = a[k];
  if (x.t !== 'num') throw new ArithError(`arg ${k} is not a number`);
  return x.n;
}

/** True when some two members holding `t` have numbers differing by `n`. An
 * existential over pairs: it says nothing about the rest of the unit. */
function hasPairDiff(b: Board, members: number[], t: Trait, n: number): boolean {
  const nums = members.filter((i) => hasTrait(b, i, t)).map((i) => b.numbers[i]);
  for (let x = 0; x < nums.length; x++) {
    for (let y = x + 1; y < nums.length; y++) {
      if (Math.abs(nums[x] - nums[y]) === n) return true;
    }
  }
  return false;
}

export const ARITH_EVALUATORS: Record<string, (b: Board, a: HintArg[]) => boolean> = {
  sum_of_trait_in_unit: (b, a) =>
    traitSum(b, unitMembers(b, argUnit(a, 0)), argTrait(a, 1)) === argNum(a, 2),

  diff_of_two_traits_in_unit: (b, a) =>
    hasPairDiff(b, unitMembers(b, argUnit(a, 0)), argTrait(a, 1), argNum(a, 2)),

  more_sum_in_unit_than_unit: (b, a) => {
    const t = argTrait(a, 2);
    return (
      traitSum(b, unitMembers(b, argUnit(a, 0)), t) >
      traitSum(b, unitMembers(b, argUnit(a, 1)), t)
    );
  },

  sum_parity_in_unit: (b, a) => {
    const want = argNum(a, 2);
    if (want !== 0 && want !== 1) throw new ArithError(`parity must be 0 or 1, got ${want}`);
    return traitSum(b, unitMembers(b, argUnit(a, 0)), argTrait(a, 1)) % 2 === want;
  },
};
```

- [ ] **Step 5: Wire the evaluators into `predicates.ts`**

At the end of `predicates.ts`'s `EVALUATORS` declaration, spread the arithmetic ones in:

```ts
import { ARITH_EVALUATORS } from './arith';

export const EVALUATORS: Record<string, (b: Board, a: HintArg[]) => boolean> = {
  // ... the existing entries, unchanged ...
  ...ARITH_EVALUATORS,
};
```

`arith.ts` imports `Board`, `hasTrait` and `unitMembers` from `predicates.ts`, and `predicates.ts` imports `ARITH_EVALUATORS` back — a cycle that ESM resolves because the spread runs at module evaluation and `ARITH_EVALUATORS` is a top-level const in a module with no top-level side effects. If the cycle proves troublesome, move `Board`, `hasTrait` and `unitMembers` to a new `board.ts` that both import; do not duplicate them.

- [ ] **Step 6: Run the tests to verify they pass**

Run: `npx vitest run shared/solver/arith.test.ts`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add shared/solver/arith.ts shared/solver/arith.test.ts shared/solver/hint.ts shared/solver/predicates.ts
git commit -m "Add the four arithmetic predicates' semantics

A sum, an unsigned pair difference, a sum comparison and a sum parity. These
are the only predicates that read the cards' numbers as values rather than as
labels, which is the whole reason the number replaced the name.

The pair difference is deliberately existential: it says some two Numberwang
cards here differ by n, and nothing at all about the rest of the unit. That is
what makes it the soft clue of the four."
```

---

### Task 7: `arith.ts` — CNF encoding, and the differential test that guards it

The load-bearing task. An encoding that disagrees with the semantics produces broken puzzles silently.

**Files:**
- Modify: `shared/solver/arith.ts`, `shared/solver/encode.ts`
- Create: `shared/solver/arith.differential.test.ts`

**Interfaces:**
- Consumes: `ARITH_EVALUATORS`, `IS_ARITH` from Task 6; `Cnf` from `sat.ts`; `MAX_ENUMERATED_UNIT` from `encode.ts`
- Produces: `encodeArith(cnf: Cnf, board: Board, vars: number[], hint: Hint): void`

- [ ] **Step 1: Write the failing differential test**

Create `shared/solver/arith.differential.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { makeGrid } from './grid';
import { type Board, makeBoard, unitMembers } from './predicates';
import { formatHint, type Hint, parseHint } from './hint';
import { Cnf } from './sat';
import { ARITH_EVALUATORS, encodeArith } from './arith';

/**
 * The encoding is pure blocking clauses over the cards the clue names, so it can
 * be checked directly: for every assignment of those cards, the clauses are
 * satisfied exactly when the evaluator says the clue holds. No SAT search needed.
 */
const GRID = makeGrid(4, 5);
const COLOURS = [
  'red', 'red', 'red', 'orange',
  'orange', 'orange', 'yellow', 'yellow',
  'yellow', 'green', 'green', 'green',
  'teal', 'teal', 'blue', 'blue',
  'purple', 'purple', 'pink', 'pink',
];
const NUMBERS = [17, 4, 23, 8, 9, 31, 12, 26, 1, 19, 6, 14, 2, 30, 11, 25, 7, 20, 3, 15];

const boardWith = (numberwang: boolean[]): Board =>
  makeBoard(GRID, COLOURS, NUMBERS, numberwang);

/** Cards a clue's clauses may mention: the union of its units' members. */
function scopeOf(hint: Hint): number[] {
  const b = boardWith(new Array(20).fill(false));
  const seen = new Set<number>();
  for (const a of hint.args) {
    if (a.t === 'unit') for (const i of unitMembers(b, a.unit)) seen.add(i);
  }
  return [...seen].sort((x, y) => x - y);
}

function clausesFor(hint: Hint): number[][] {
  const cnf = new Cnf();
  const vars = Array.from({ length: 20 }, () => cnf.newVar());
  encodeArith(cnf, boardWith(new Array(20).fill(false)), vars, hint);
  return cnf.clauses.map((c) => [...c]);
}

/** Every hint the four predicates can form over this board, at every total that
 * is reachable — plus a spread of totals that are not, so the test also proves
 * the encoding rejects what it should. */
function everyHint(): string[] {
  const out: string[] = [];
  const units = [
    'unit(row,1)', 'unit(row,3)', 'unit(col,2)', 'unit(col,4)',
    'unit(colour,red)', 'unit(colour,teal)', 'unit(between,pair(0,3))',
  ];
  for (const t of ['numberwang', 'not_numberwang']) {
    for (const u of units) {
      for (const n of [0, 1, 8, 17, 25, 44, 60, 200]) {
        out.push(`sum_of_trait_in_unit(${u},${t},${n})`);
        out.push(`diff_of_two_traits_in_unit(${u},${t},${n})`);
      }
      for (const p of [0, 1]) out.push(`sum_parity_in_unit(${u},${t},${p})`);
    }
    out.push(`more_sum_in_unit_than_unit(unit(row,1),unit(row,3),${t})`);
    out.push(`more_sum_in_unit_than_unit(unit(col,2),unit(col,4),${t})`);
    out.push(`more_sum_in_unit_than_unit(unit(row,1),unit(col,2),${t})`);
    out.push(`more_sum_in_unit_than_unit(unit(colour,red),unit(colour,teal),${t})`);
  }
  return out;
}

describe('arithmetic encoding matches its semantics', () => {
  for (const src of everyHint()) {
    it(src, () => {
      const hint = parseHint(src);
      expect(formatHint(hint)).toBe(src);

      const scope = scopeOf(hint);
      expect(scope.length).toBeLessThanOrEqual(16);
      const clauses = clausesFor(hint);

      for (let combo = 0; combo < 1 << scope.length; combo++) {
        const numberwang = new Array<boolean>(20).fill(false);
        scope.forEach((card, k) => {
          numberwang[card] = ((combo >> k) & 1) === 1;
        });

        const semantics = ARITH_EVALUATORS[hint.pred](boardWith(numberwang), hint.args);

        // A clause is satisfied when any literal is true. Variable v is 1-based
        // and corresponds to card v-1; a negative literal reads the other way up.
        const cnfHolds = clauses.every((clause) =>
          clause.some((lit) => (lit > 0 ? numberwang[lit - 1] : !numberwang[-lit - 1])),
        );

        expect(cnfHolds, `combo ${combo} of ${src}`).toBe(semantics);
      }
    });
  }
});

describe('the unit-size ceiling', () => {
  it('refuses a clue over a unit past the enumeration ceiling', () => {
    // The board's edge is 14 cards; two edges unioned would exceed the ceiling,
    // but a single arithmetic clue over the whole edge is within it. Force the
    // refusal with a comparison of two large units.
    const hint = parseHint('more_sum_in_unit_than_unit(unit(edge,void),unit(row,1),numberwang)');
    expect(() => clausesFor(hint)).toThrow(/ceiling/);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run shared/solver/arith.differential.test.ts`
Expected: FAIL — `encodeArith` is not exported from `./arith`.

- [ ] **Step 3: Write `encodeArith`**

Append to `shared/solver/arith.ts`:

```ts
import { MAX_ENUMERATED_UNIT } from './encode';

/**
 * Encode an arithmetic clue as blocking clauses over the cards it names.
 *
 * There is no pseudo-Boolean encoder here and there does not need to be. A
 * weighted sum over an arbitrary set of cards would want one, but every clue in
 * this file is scoped to one unit — or, for the comparison, two — and units on a
 * 4x5 board are small: a column is five cards, a row four, a colour group two or
 * three. So walk the scope's assignments, ask the semantics about each, and
 * forbid the ones it rejects. A five-card unit costs at most 32 clauses of five
 * literals; the widest comparison, a row against a column, costs at most 256 of
 * eight.
 *
 * This is the same idiom `encode.ts` already uses for `all_traits_are_neighbors_in_unit`,
 * for the same reason and under the same ceiling.
 */
export function encodeArith(cnf: Cnf, board: Board, vars: number[], hint: Hint): void {
  if (!IS_ARITH.has(hint.pred)) throw new ArithError(`not an arithmetic predicate: ${hint.pred}`);

  const scope = [
    ...new Set(
      hint.args.flatMap((a) => (a.t === 'unit' ? unitMembers(board, a.unit) : [])),
    ),
  ].sort((x, y) => x - y);

  if (scope.length > MAX_ENUMERATED_UNIT) {
    throw new ArithError(
      `${hint.pred} over ${scope.length} cards exceeds the ${MAX_ENUMERATED_UNIT}-card ceiling`,
    );
  }

  const evaluator = ARITH_EVALUATORS[hint.pred];
  // One scratch board, rewritten per assignment. `unitMembers` memoises against
  // the grid and colours, which this never touches, so the cache stays valid.
  const scratch: Board = {
    ...board,
    numberwang: [...board.numberwang],
  };

  for (let combo = 0; combo < 1 << scope.length; combo++) {
    scope.forEach((card, k) => {
      scratch.numberwang[card] = ((combo >> k) & 1) === 1;
    });
    if (evaluator(scratch, hint.args)) continue;
    // Forbid exactly this assignment: at least one of its cards must differ.
    cnf.add(scope.map((card, k) => (((combo >> k) & 1) === 1 ? -vars[card] : vars[card])));
  }
}
```

Note the scratch board is built by spreading `board`, which carries its `cache` along — deliberately, since membership cannot change and re-deriving it 2^n times would dominate the cost.

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run shared/solver/arith.differential.test.ts`
Expected: PASS. If a case fails, the printed `combo N of <hint>` names the exact assignment — decode it against the hint's scope rather than guessing.

- [ ] **Step 5: Dispatch the four from `encode.ts`**

In `shared/solver/encode.ts`, add the four to `SUPPORTED`:

```ts
  'sum_of_trait_in_unit',
  'diff_of_two_traits_in_unit',
  'more_sum_in_unit_than_unit',
  'sum_parity_in_unit',
```

and at the top of `encodeHint`, before the switch:

```ts
  if (IS_ARITH.has(hint.pred)) {
    encodeArith(cnf, board, vars, hint);
    return;
  }
```

with `import { IS_ARITH, encodeArith } from './arith';`.

- [ ] **Step 6: Verify the solver agrees with brute force end to end**

The existing `sat.differential.test.ts` compares SAT results against `enumerate.ts`'s exhaustive filter. Add an arithmetic clue to whatever hint set it uses, so the check covers the new path through the real solver rather than only the encoding in isolation.

Run: `npm test`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "Encode arithmetic clues by blocking what they forbid

No pseudo-Boolean encoder. A weighted sum over an arbitrary card set would
want one, but these clues are scoped to a unit, and a unit here is at most five
cards — so walk the scope's assignments, ask the semantics, and forbid the
losers. Five cards is 32 clauses of five literals. encode.ts already does this
for connectivity, under the same ceiling.

The differential test is the point of the task: it checks every assignment of
every clue's scope against the evaluator directly, no SAT search involved.
Arithmetic that is subtly wrong does not crash, it ships a puzzle with two
solutions."
```

---

### Task 8: `arith.ts` — candidate enumeration

**Files:**
- Modify: `shared/solver/arith.ts`, `shared/solver/candidates.ts`
- Modify: `shared/solver/arith.test.ts`

**Interfaces:**
- Consumes: `candidateUnits`, `hasMultipleUnitsOfKind` from `candidates.ts`
- Produces: `arithCandidates(b: Board, units: Unit[]): Hint[]`

- [ ] **Step 1: Write the failing test**

Add to `shared/solver/arith.test.ts`:

```ts
import { arithCandidates } from './arith';
import { formatHint } from './hint';

describe('arithCandidates', () => {
  const units: Unit[] = [
    { kind: 'row', n: 1 },
    { kind: 'row', n: 2 },
    { kind: 'colour', name: 'red' },
  ];
  const srcs = () => arithCandidates(board(), units).map(formatHint);

  it('proposes only clues that are true of the board', () => {
    const b = board();
    for (const h of arithCandidates(b, units)) {
      expect(ARITH_EVALUATORS[h.pred](b, h.args), formatHint(h)).toBe(true);
    }
  });

  it('proposes the unit's actual sum', () => {
    expect(srcs()).toContain('sum_of_trait_in_unit(unit(row,1),numberwang,25)');
  });

  it('proposes a pair difference that exists', () => {
    expect(srcs()).toContain('diff_of_two_traits_in_unit(unit(row,1),numberwang,9)');
  });

  it('proposes the comparison in the direction that holds', () => {
    expect(srcs()).toContain('more_sum_in_unit_than_unit(unit(row,2),unit(row,1),numberwang)');
    expect(srcs()).not.toContain('more_sum_in_unit_than_unit(unit(row,1),unit(row,2),numberwang)');
  });

  it('proposes the parity the sum actually has', () => {
    expect(srcs()).toContain('sum_parity_in_unit(unit(row,1),numberwang,1)');
    expect(srcs()).not.toContain('sum_parity_in_unit(unit(row,1),numberwang,0)');
  });

  it('does not compare units of different kinds', () => {
    for (const s of srcs()) {
      if (!s.startsWith('more_sum')) continue;
      const kinds = [...s.matchAll(/unit\((\w+),/g)].map((m) => m[1]);
      expect(new Set(kinds).size).toBe(1);
    }
  });

  it('does not propose a sum over a unit with none of the trait', () => {
    // A sum of 0 tells a player the unit is empty of the trait, which the
    // counting predicates already say better.
    expect(srcs()).not.toContain('sum_of_trait_in_unit(unit(colour,red),numberwang,0)');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run shared/solver/arith.test.ts`
Expected: FAIL — `arithCandidates` is not exported.

- [ ] **Step 3: Write `arithCandidates`**

Append to `shared/solver/arith.ts`:

```ts
const TRAITS: Trait[] = ['numberwang', 'not_numberwang'];

const u = (unit: Unit): HintArg => ({ t: 'unit', unit });
const t = (trait: Trait): HintArg => ({ t: 'trait', trait });
const n = (value: number): HintArg => ({ t: 'num', n: value });

/**
 * Every arithmetic clue that is true of this board.
 *
 * Candidates are read off the solution — a clue that is false of the board is
 * not a clue — so each family proposes the value the board actually has rather
 * than searching a range.
 */
export function arithCandidates(b: Board, units: Unit[]): Hint[] {
  const out: Hint[] = [];
  const membersOf = (unit: Unit) => unitMembers(b, unit);

  for (const trait of TRAITS) {
    for (const unit of units) {
      const mem = membersOf(unit);
      if (mem.length > MAX_ENUMERATED_UNIT) continue;
      const held = mem.filter((i) => hasTrait(b, i, trait));

      // A sum of 0 means the unit holds none of the trait, which
      // number_of_traits_in_unit says more plainly. Skip it.
      if (held.length > 0) {
        const sum = traitSum(b, mem, trait);
        out.push({ pred: 'sum_of_trait_in_unit', args: [u(unit), t(trait), n(sum)] });
        out.push({ pred: 'sum_parity_in_unit', args: [u(unit), t(trait), n(sum % 2)] });
      }

      // Every distinct gap between two of the trait's members.
      const nums = held.map((i) => b.numbers[i]);
      const gaps = new Set<number>();
      for (let x = 0; x < nums.length; x++) {
        for (let y = x + 1; y < nums.length; y++) gaps.add(Math.abs(nums[x] - nums[y]));
      }
      for (const gap of [...gaps].sort((p, q) => p - q)) {
        out.push({ pred: 'diff_of_two_traits_in_unit', args: [u(unit), t(trait), n(gap)] });
      }
    }

    // Comparisons, in the direction that holds, between units of one kind. A
    // cross-kind comparison ("row 1 against the red cards") reads as a riddle
    // rather than a clue, which is why the counting comparisons are same-kind too.
    for (const a of units) {
      for (const c of units) {
        if (a.kind !== c.kind) continue;
        if (JSON.stringify(a) === JSON.stringify(c)) continue;
        if (traitSum(b, membersOf(a), trait) <= traitSum(b, membersOf(c), trait)) continue;
        out.push({ pred: 'more_sum_in_unit_than_unit', args: [u(a), u(c), t(trait)] });
      }
    }
  }
  return out;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run shared/solver/arith.test.ts`
Expected: PASS

- [ ] **Step 5: Wire into `candidates.ts`**

At the end of `candidateHints`, before the return, add:

```ts
  out.push(...arithCandidates(b, candidateUnits(b)));
```

with `import { arithCandidates } from './arith';`. `candidateHints` already computes its units; reuse that local rather than calling `candidateUnits` twice.

- [ ] **Step 6: Run the whole suite**

Run: `npx tsc --noEmit && npm test`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "Propose the arithmetic clues a board actually supports

Candidates are read off the solution rather than searched, so each family
proposes the value the board has: the unit's real total, its real parity, the
gaps that really occur between two of the trait's cards.

Two exclusions earn their keep. A sum of 0 is skipped because it only says the
unit is empty of the trait, and the counting predicates say that better. And
comparisons stay within one unit kind, for the same reason the counting
comparisons do — a row weighed against a colour group reads as a riddle."
```

---

### Task 9: Render the four in English

Rendered clues are not finished English: they carry `#COLOURS:teal` and `#C:2`
tokens the app expands against the board, and they join "row"/"column" to what
follows with U+00A0. Both conventions are pinned by tests over every real puzzle,
so these four inherit them rather than inventing a third.

**Files:**
- Modify: `shared/solver/render.ts`
- Modify: `shared/solver/render.test.ts`

**Interfaces:**
- Consumes: `plural`, `where`, `colours`, `argUnit`, `argTrait`, `argNum` from `render.ts`
- Produces: four `RENDERERS` entries; `where` gains a `colour` case returning `among #COLOURS:<name>`

- [ ] **Step 1: Write the failing tests**

Add to `shared/solver/render.test.ts`:

```ts
import { canRender, render } from './render';
import { parseHint } from './hint';

const say = (src: string) => render(parseHint(src));
// The archive glues "row"/"column" to what follows with U+00A0. Spelling it as
// an escape here rather than pasting the character keeps the expectation
// readable in a diff — see the note at the top of this file.
const NBSP = '\u00a0';

describe('arithmetic clue text', () => {
  it('renders a sum over a row', () => {
    expect(say('sum_of_trait_in_unit(unit(row,2),numberwang,25)')).toBe(
      `The Numberwang cards in row${NBSP}2 add to 25`,
    );
  });

  it('renders a sum over a colour group as a token the app expands', () => {
    expect(say('sum_of_trait_in_unit(unit(colour,teal),numberwang,12)')).toBe(
      'The Numberwang cards among #COLOURS:teal add to 12',
    );
  });

  it('renders a pair difference', () => {
    expect(say('diff_of_two_traits_in_unit(unit(colour,teal),numberwang,6)')).toBe(
      'Two Numberwang cards among #COLOURS:teal subtract to 6',
    );
  });

  it('renders a comparison', () => {
    expect(say('more_sum_in_unit_than_unit(unit(row,1),unit(row,3),numberwang)')).toBe(
      `The Numberwang cards in row${NBSP}1 add to more than ` +
        `the Numberwang cards in row${NBSP}3`,
    );
  });

  it('renders even parity, with the column as a #C token', () => {
    expect(say('sum_parity_in_unit(unit(col,2),numberwang,0)')).toBe(
      `The Numberwang cards in column${NBSP}#C:2 add to an even number`,
    );
  });

  it('renders odd parity, and the other trait', () => {
    expect(say('sum_parity_in_unit(unit(col,2),not_numberwang,1)')).toBe(
      `The Not Numberwang cards in column${NBSP}#C:2 add to an odd number`,
    );
  });

  it('can render every arithmetic predicate', () => {
    for (const src of [
      'sum_of_trait_in_unit(unit(row,1),numberwang,25)',
      'diff_of_two_traits_in_unit(unit(row,1),numberwang,9)',
      'more_sum_in_unit_than_unit(unit(row,1),unit(row,3),numberwang)',
      'sum_parity_in_unit(unit(row,1),numberwang,1)',
    ]) {
      expect(canRender(parseHint(src)), src).toBe(true);
    }
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run shared/solver/render.test.ts`
Expected: FAIL — `UnsupportedShapeError` naming each of the four predicates, and
for the colour-group cases `UnsupportedShapeError: colour has no locative phrase`
thrown from `where`.

- [ ] **Step 3: Give `where` a phrase for a colour unit**

The mechanical rename in Task 3 turned `case 'profession'` into `case 'colour'`,
still throwing. It threw because no predicate in Clues by Sam ever put a
profession unit in a locative position — these four do. Replace the throw:

```ts
    case 'colour':
      // A colour group has no place on the board, so the phrase is partitive
      // rather than locative: "among the teal cards". Nothing before this task
      // called `where` with a colour unit, so adding the case cannot change any
      // existing clue's text.
      return `among ${colours(u.name)}`;
```

`wherePerson` delegates to `where` for every kind but `corner`, so it inherits
this and needs no change.

- [ ] **Step 4: Add the four renderers**

In `shared/solver/render.ts`, add to `RENDERERS`:

```ts
  sum_of_trait_in_unit: (a) =>
    `The ${plural(argTrait(a, 1), 2)} ${where(argUnit(a, 0))} add to ${argNum(a, 2)}`,

  diff_of_two_traits_in_unit: (a) =>
    `Two ${plural(argTrait(a, 1), 2)} ${where(argUnit(a, 0))} subtract to ${argNum(a, 2)}`,

  more_sum_in_unit_than_unit: (a) => {
    const t = argTrait(a, 2);
    return (
      `The ${plural(t, 2)} ${where(argUnit(a, 0))} add to more than ` +
      `the ${plural(t, 2)} ${where(argUnit(a, 1))}`
    );
  },

  sum_parity_in_unit: (a) => {
    const parity = argNum(a, 2) === 0 ? 'even' : 'odd';
    return `The ${plural(argTrait(a, 1), 2)} ${where(argUnit(a, 0))} add to an ${parity} number`;
  },
```

Every one takes its noun from `plural` and its unit phrase from `where`, so all
four inherit the tokens and the non-breaking spaces the other predicates already
agreed on. `plural(t, 2)` is the plural form even when a clue's answer involves
one card: "The Numberwang cards in row 2 add to 25" is right whether that row
holds one of them or four.

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run shared/solver/render.test.ts`
Expected: PASS

- [ ] **Step 6: Confirm nothing else regressed**

`where` gained a branch that other predicates reach through `wherePerson`, so run
the whole suite rather than just the render tests.

Run: `npm test`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add shared/solver/render.ts shared/solver/render.test.ts
git commit -m "Say the arithmetic clues out loud

All four route their noun through plural() and their unit through where(), so
they inherit the #COLOURS tokens and the non-breaking spaces the other 29
predicates already agreed on rather than inventing a second way to name a row.

where() had to learn a colour unit, which it previously refused outright. It
refused because no Clues by Sam predicate ever put a profession in a locative
position; a sum over a colour group does. The phrase is partitive rather than
locative for the obvious reason — a colour group is not anywhere."
```

---

### Task 9b: Number properties — prime, even, odd, divisible by n

Added mid-execution, at the user's request, after Task 9 and before Task 10 so
that the budgets in Task 10 are written once for all eight predicates rather
than twice.

Four counting predicates, all `[U, T, N]` but for the divisor that
`n_traits_in_unit_are_divisible` carries ahead of its count:

- `n_traits_in_unit_are_prime`
- `n_traits_in_unit_are_even`
- `n_traits_in_unit_are_odd`
- `n_traits_in_unit_are_divisible`

They live in `arith.ts` beside the four sum predicates and reuse every piece of
machinery Tasks 6–9 built: `encodeArith` encodes them unchanged, because
blocking clauses do not care what Boolean function they are blocking;
`arithCandidates` proposes the count the board has; `propertyCount` in
`render.ts` says all four.

Three judgements worth keeping:

- **The divisor floor is 3.** "Divisible by 1" is every card and "divisible by
  2" is `n_traits_in_unit_are_even` in worse English, so `MIN_DIVISOR` refuses
  both rather than leaving the generator to write a clue the player already has.
- **Candidates only propose a count that could have differed.** If no member of
  the unit has the property, the count is 0 under every assignment and the clue
  is a tautology — the same failure `sum_parity_in_unit` had over a unit of
  all-even numbers.
- **Divisors are drawn from what actually divides something in the unit**, and
  never above the unit's largest number: "divisible by 19" over a unit whose
  biggest card is 12 is a roundabout way of saying none of them are.

`ARITH_PREDS` is now `SUM_PREDS` plus `PROP_PREDS`, so everything keyed off it —
`IS_ARITH`, `SUPPORTED`, the differential test, Task 10's budgets — picks the
new four up without a second list to keep in step.

---

### Task 10: Clue-mix budgets and the one-per-puzzle cap

Without this the four predicates are generated never: `clue-mix.json` comes from an archive that never wrote them, so their share is 0, and `orderPool` multiplies by share.

**Files:**
- Modify: `shared/solver/mix.ts`, `shared/solver/generate.ts`, `config/clue-mix.json`
- Test: `shared/solver/mix.test.ts`, `shared/solver/generate.test.ts`

**Interfaces:**
- Consumes: `ClueMix` from `mix.ts`; `CROSS_TRAIT_RATE` from `corpus.ts`
- Produces: `ARITH_RATE: Record<string, number>`; `withArithBudgets(mix: ClueMix): ClueMix`; a `MAX_EXACT_SUMS = 1` cap honoured in `generate.ts`

- [ ] **Step 1: Write the failing tests**

Add to `shared/solver/mix.test.ts`:

```ts
import { ARITH_RATE, withArithBudgets } from './mix';
import { ARITH_PREDS } from './arith';

describe('withArithBudgets', () => {
  const base = {
    pred: { number_of_traits_in_unit: 0.6, more_traits_in_unit_than_unit: 0.4 },
    feature: {},
    colourShapes: [[3, 3, 3, 3, 2, 2, 2, 2]],
  };

  it('gives every arithmetic predicate a non-zero share', () => {
    const out = withArithBudgets(base);
    for (const p of ARITH_PREDS) expect(out.pred[p]).toBeGreaterThan(0);
  });

  it('leaves the shares summing to 1', () => {
    const out = withArithBudgets(base);
    const total = Object.values(out.pred).reduce((a, b) => a + b, 0);
    expect(total).toBeCloseTo(1, 10);
  });

  it('spends 15 to 20 percent of the mix on arithmetic', () => {
    const out = withArithBudgets(base);
    const arith = ARITH_PREDS.reduce((a, p) => a + out.pred[p], 0);
    expect(arith).toBeGreaterThanOrEqual(0.15);
    expect(arith).toBeLessThanOrEqual(0.20);
  });

  it('makes the exact sum the smallest of the four', () => {
    const out = withArithBudgets(base);
    const others = ARITH_PREDS.filter((p) => p !== 'sum_of_trait_in_unit');
    for (const p of others) {
      expect(out.pred[p]).toBeGreaterThan(out.pred.sum_of_trait_in_unit);
    }
  });

  it('does not disturb the attested predicates relative to each other', () => {
    const out = withArithBudgets(base);
    const ratio = out.pred.number_of_traits_in_unit / out.pred.more_traits_in_unit_than_unit;
    expect(ratio).toBeCloseTo(0.6 / 0.4, 10);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run shared/solver/mix.test.ts`
Expected: FAIL — `withArithBudgets` is not exported.

- [ ] **Step 3: Add the budgets to `mix.ts`**

```ts
import { ARITH_PREDS } from './arith';

/**
 * What share of a puzzle's clues each arithmetic predicate gets.
 *
 * These cannot be measured. `config/clue-mix.json` comes from cbs2's 4x5
 * archive, which wrote none of them, so a measured share is 0 and `orderPool`
 * multiplies by share — an unbudgeted predicate is generated never. This is the
 * same problem `CROSS_TRAIT_RATE` solves for the cross-trait comparisons, at
 * four times the size.
 *
 * The four are weighted by how much they give away rather than evenly. An exact
 * sum pins its unit outright 72% of the time on a five-card unit, measured over
 * 20,000 trials — it is the strongest single clue in the game, and a puzzle with
 * two of them is a puzzle with two rows handed over. It gets the smallest share
 * here and a hard cap in `generate.ts` besides.
 */
export const ARITH_RATE: Record<string, number> = {
  sum_of_trait_in_unit: 0.03,
  diff_of_two_traits_in_unit: 0.05,
  more_sum_in_unit_than_unit: 0.05,
  sum_parity_in_unit: 0.04,
};

/** Rescale the attested shares to make room for the arithmetic budgets, leaving
 * the attested predicates' proportions relative to each other untouched. */
export function withArithBudgets(mix: ClueMix): ClueMix {
  const budget = Object.values(ARITH_RATE).reduce((a, b) => a + b, 0);
  const attested = Object.entries(mix.pred).filter(([p]) => !(p in ARITH_RATE));
  const attestedTotal = attested.reduce((a, [, v]) => a + v, 0);
  if (attestedTotal <= 0) throw new MixFormatError('mix has no attested predicate shares');

  const pred: Record<string, number> = {};
  for (const [p, v] of attested) pred[p] = (v / attestedTotal) * (1 - budget);
  for (const p of ARITH_PREDS) pred[p] = ARITH_RATE[p];
  return { ...mix, pred };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run shared/solver/mix.test.ts`
Expected: PASS

- [ ] **Step 5: Write the failing cap test**

Add to `shared/solver/generate.test.ts`:

```ts
import { MAX_EXACT_SUMS } from './generate';

it('never spends more than one exact sum on a puzzle', () => {
  // Uses whatever seeded generate helper the existing tests in this file use;
  // follow their pattern for board size and seed.
  const puzzle = generateForTest({ seed: 3 });
  const sums = puzzle.people.filter(
    (p) => p.origHint?.startsWith('sum_of_trait_in_unit(') ?? false,
  );
  expect(MAX_EXACT_SUMS).toBe(1);
  expect(sums.length).toBeLessThanOrEqual(MAX_EXACT_SUMS);
});
```

- [ ] **Step 6: Run it to verify it fails**

Run: `npx vitest run shared/solver/generate.test.ts`
Expected: FAIL — `MAX_EXACT_SUMS` is not exported.

- [ ] **Step 7: Enforce the cap in `generate.ts`**

```ts
/**
 * How many exact-sum clues one puzzle may carry.
 *
 * One. A sum clue pins its unit outright 72% of the time on a five-card unit,
 * so a second one is usually a second row handed over, and the share in
 * ARITH_RATE alone does not stop two landing on the same board.
 */
export const MAX_EXACT_SUMS = 1;
```

In the loop that accepts a chosen clue, reject a candidate whose `pred` is `sum_of_trait_in_unit` once the accepted set already holds `MAX_EXACT_SUMS` of them. Apply the check where the existing per-predicate accounting lives, so it composes with the mix rather than fighting it.

Wrap the mix load so every generation path sees the budgets:

```ts
const mix = withArithBudgets(loadMix());
```

- [ ] **Step 8: Run the whole suite**

Run: `npx tsc --noEmit && npm test`
Expected: PASS

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "Budget the arithmetic clues, and cap the exact sum at one

An unbudgeted predicate is generated never: clue-mix.json comes from an archive
that wrote none of these, share 0, and orderPool multiplies by share. So the
four get explicit rates, the way CROSS_TRAIT_RATE already does for the
cross-trait comparisons.

They are not weighted evenly. An exact sum pins its five-card unit 72% of the
time, which makes it the strongest clue in the game; it takes the smallest share
and a hard cap of one per puzzle, because a share alone does not stop two
landing on the same board."
```

---

### Task 11: The generation pipeline

**Files:**
- Modify: `scripts/generate.mts`, `scripts/manifest.mts`, `scripts/audit.mts`, `scripts/check-generation.mts`, `shared/solver/difficulty.ts`
- Test: `scripts/generate.test.mts`, `scripts/manifest.test.mts`

**Interfaces:**
- Consumes: everything above
- Produces: `puzzles/YYYY-MM-DD.json` files and `puzzles/index.json`; `npm run generate`, `npm run manifest`, `npm run audit`, `npm run test:generate` all working

- [ ] **Step 1: Write the failing test**

Add to `scripts/generate.test.mts`:

```ts
import { describe, expect, it } from 'vitest';
import { validatePuzzle } from '../shared/puzzle';
import { buildPuzzle } from './generate.mts';

describe('buildPuzzle', () => {
  const puzzle = buildPuzzle('2026-09-10');

  it('is a valid 4x5 puzzle', () => {
    expect(() => validatePuzzle(puzzle)).not.toThrow();
    expect(puzzle.width).toBe(4);
    expect(puzzle.height).toBe(5);
  });

  it('carries no variant field', () => {
    expect('variant' in puzzle).toBe(false);
  });

  it('reports a difficulty rather than having been aimed at one', () => {
    expect(typeof puzzle.difficulty).toBe('string');
    expect(puzzle.difficulty.length).toBeGreaterThan(0);
  });

  it('is reproducible from its date', () => {
    expect(buildPuzzle('2026-09-10')).toEqual(puzzle);
  });

  it('differs from another date', () => {
    expect(buildPuzzle('2026-09-11')).not.toEqual(puzzle);
  });

  it('uses eight colours or fewer, from the palette', () => {
    const used = new Set(puzzle.people.map((p) => p.colour));
    expect(used.size).toBeLessThanOrEqual(8);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run scripts/generate.test.mts`
Expected: FAIL — `buildPuzzle` is not exported, and `generate.mts` still walks real puzzles for its work list.

- [ ] **Step 3: Rewrite `generate.mts`'s work list and shape construction**

`cbsbd`'s `runGenerate` finds its work by walking the scraped puzzles and takes each one's difficulty as an aim. Neither applies. Replace with:

- A work list of dates: every date from a start date through today plus seven, skipping any that already has a `puzzles/YYYY-MM-DD.json`, `--force` to redo. Accept a single date argument as `cbsbd` does.
- `buildPuzzle(date: string): Puzzle`, exported, which seeds the rng from the date string, builds the shape with `numbersFor`, `colourShapeFor` and `coloursFor`, generates clues against `withArithBudgets(loadMix())`, scores the finished puzzle with `difficulty.ts`, and writes that score into `difficulty`.
- No `variant` field, no `aimedAt` parameter, no `WEEKDAY_BOARDS`. Delete that table; the board is `makeGrid(4, 5)` everywhere.

- [ ] **Step 4: Demote `difficulty.ts` from target to reporter**

Delete any exported function whose job is to decide whether a puzzle *hits* a label — the acceptance predicate generation used to steer by. Keep the scorer that turns a finished puzzle into a label, and keep `bandsFor`. Add a note at the top of the file:

```ts
/**
 * ...existing description...
 *
 * These bands are inherited, not earned. They were fitted to human labels on
 * cbs2's 4x5 archive, and two of their fields count clue cards, so `bandsFor`
 * refits those for a board of a different size. Numberwang has no labelled
 * corpus at all, and the four arithmetic predicates appear in the calibration
 * nowhere — so this module reports a label and generation never aims at one. A
 * reported label is an opinion; an aimed one would be a claim.
 */
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run scripts/generate.test.mts`
Expected: PASS

- [ ] **Step 6: Update `manifest.mts` and `audit.mts`**

`manifest.mts`: drop the variant grouping and the `puzzleBillingOf` call; one entry per date, carrying `date`, `id`, `title`, `difficulty`, `width`, `height`.

`audit.mts`: drop the `VARIANTS`/`ONE_OFFS` claims-from-filename checks. Keep the core: re-derive each committed puzzle from its file alone, confirm it validates, confirm every clue renders, confirm the clue set has exactly one solution, and confirm no predicate exceeds its share cap. Add a check that no puzzle carries more than `MAX_EXACT_SUMS` exact sums.

Run: `npx vitest run scripts/manifest.test.mts`
Expected: PASS

- [ ] **Step 7: Generate a real puzzle and read it**

Run: `npm run test:generate`
Expected: one 4x5 puzzle built and checked sound, in well under a minute.

Run: `npm run generate -- 2026-09-10 && cat puzzles/2026-09-10.json | head -40`
Expected: a valid file. **Read the clue text.** Confirm the arithmetic clues read as English, that at most one is an exact sum, and that the numbers are a permutation of 1–20.

- [ ] **Step 8: Generate a week and audit it**

```bash
npm run generate && npm run manifest && npm run audit
```
Expected: seven or more puzzles, a manifest listing them, a clean audit.

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "Generate a Numberwang a day, unaimed

The work list is dates rather than a walk over scraped puzzles, because there
are none to walk. Board is 4x5 always: WEEKDAY_BOARDS is gone with the schedule
it served.

difficulty.ts is demoted to a reporter. Its bands were fitted to human labels
on cbs2's archive and the arithmetic predicates appear in that calibration
nowhere, so a label here is an opinion about a puzzle nobody has played. Saying
it is one is honest; aiming at it would not be."
```

---

### Task 12: Nightly generation

Deploying the page belongs to the app plan, which owns `site/` and
`vite.config.ts`. This task's deliverable is a repo that grows a puzzle a day on
its own.

**Files:**
- Modify: `.github/workflows/generate.yml`
- Delete: `.github/workflows/pages.yml` (the app plan writes its own)
- Create: `README.md`

**Interfaces:**
- Consumes: `npm run generate`, `npm run manifest`, `npm run audit`
- Produces: a nightly commit of a week of puzzles to `puzzles/`

- [ ] **Step 1: Adapt the nightly workflow**

Take `/Users/dan/code/cbsbd3d/.github/workflows/generate.yml` as the base and
adjust: `npm ci`, then `npm run generate`, `npm run manifest`, `npm run audit`,
then commit `puzzles/` if it changed. Keep `cbsbd3d`'s week-ahead behaviour — a
4x5 board costs minutes, so generating seven means a failed night costs nobody a
puzzle. Remove any step that references the extractor or a source site.

Delete the inherited `pages.yml`; there is nothing to deploy until the app plan
restores `site/`, and a workflow that fails every push is worse than none.

- [ ] **Step 2: Verify the workflow parses**

The `yaml` package is already a dependency, so parse it in Node rather than
trusting the eye:

```bash
node --input-type=module -e "
import { readFileSync } from 'node:fs';
import { parse } from 'yaml';
const wf = parse(readFileSync('.github/workflows/generate.yml', 'utf8'));
console.log(Object.keys(wf.jobs));
"
```
Expected: the job names print, no throw.

- [ ] **Step 3: Prove the workflow's own commands run clean from a cold start**

The workflow's value is that it works unattended, so run exactly what it runs:

```bash
rm -rf puzzles && npm run generate && npm run manifest && npm run audit
```
Expected: a week or more of `puzzles/YYYY-MM-DD.json`, an `index.json` listing
them, and a clean audit. Read one clue from a puzzle you have not read before.

- [ ] **Step 4: Write the README**

Document: what the game is; the commands (`test`, `test:generate`, `generate`,
`manifest`, `audit`); the board and number rules; that eight colours and their
group shapes are drawn from measurements of cbs2's archive; why the arithmetic
budgets in `ARITH_RATE` are explicit rather than measured; and that difficulty is
reported rather than aimed at.

Say plainly that `config/clue-mix.json` was produced by running cbs2's
`archiveClueMix()` against its scraped archive and **cannot be re-derived in this
repo** — there is no archive here. Someone will otherwise go looking for the
script that generates it.

Note that the playable site is not in this repo yet and point at the app plan.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "Generate a Numberwang a day, unattended

A week ahead each night, because a 4x5 costs minutes and a failed night should
not cost anybody their puzzle.

No pages.yml: there is nothing to deploy until the app lands, and a workflow
that fails on every push teaches people to ignore the failures that matter."
```

---

## Self-Review

**Spec coverage.** Board 4x5 → Global Constraints, Task 11. Numbers 1..N → Tasks
2, 5. Play mechanic → inherited unchanged; the app plan owns it. Eight colours and
group shapes → Task 5. Card appearance → app plan. Clue language rename → Tasks 3,
4. Four arithmetic families → Tasks 6–9. Encoding without a PB encoder → Task 7.
Clue mix budgets and the one-per-puzzle cap → Task 10. Pipeline drops and keeps →
Tasks 1, 11. Deploy at `/numberwang/` → **app plan**, which owns `vite.config.ts`.
Modules table → File Structure. Testing, including the differential test → Task 7.
Risks → mitigated in Tasks 10 and 11.

**Three corrections to the spec, folded in.**

1. The spec proposes a 12-card ceiling for arithmetic units. `encode.ts` already
   exports `MAX_ENUMERATED_UNIT = 16` for exactly this purpose, so the plan reuses
   it rather than adding a second constant. Recorded in Global Constraints.
2. The spec's example clue text ("The Numberwang cards in row 2 add to 25") is not
   what `render` returns. Rendered clues carry `#COLOURS:` and `#C:` tokens the app
   expands against the board, and glue "row"/"column" to what follows with U+00A0.
   Task 9's expectations use the real forms; the spec's are the finished English a
   player sees, which is the app's output, not the generator's.
3. `where()` throws `UnsupportedShapeError` for a colour unit — no Clues by Sam
   predicate ever put a profession in a locative position. Three of the four
   arithmetic predicates do, so Task 9 gives it a partitive phrase. This is an
   addition the spec did not anticipate and could not have.

**One item deferred by design.** Card appearance — peach with confetti, black with
white text, the plain colour band — is in the app plan. It carries no generator
work.

**Type consistency.** `Board` is `{ grid, colours, numbers, numberwang, cache? }`
in Task 3 and used that way in Tasks 6, 7, 8. `makeBoard(grid, colours, numbers,
numberwang)` — four arguments, consistent across Tasks 3, 6, 7. `Trait` is
`'numberwang' | 'not_numberwang'` from Task 4 onward, and the arithmetic tests in
Tasks 6–9 use exactly those spellings. `Shape` is `{ grid, colours, numbers }` in
Task 3, consumed in Task 11. `colourShapes` is the `ClueMix` field in Tasks 3, 5
and 10, and Task 3 renames the JSON key to match. The token helpers are `colour`,
`colours`, `colourN` from Task 3 Step 4 onward, and Task 9 calls `colours`.
`ARITH_PREDS`, `IS_ARITH`, `traitSum`, `ARITH_EVALUATORS`, `encodeArith`,
`arithCandidates`, `ARITH_RATE`, `withArithBudgets`, `MAX_EXACT_SUMS` are each
defined once and referenced under the same name thereafter.

**Interface handshake with the app plan.** The generator produces
`puzzles/YYYY-MM-DD.json` whose `people[i]` is `{ number, colour, numberwang, clue,
origHint, paths }`, with `clue` carrying `#NAME:`, `#NAMES:`, `#COLOUR:`,
`#COLOURS:`, `#COLOURN:`, `#C:` and `#BETWEEN:` tokens. The app plan's Task 1
consumes exactly that.
