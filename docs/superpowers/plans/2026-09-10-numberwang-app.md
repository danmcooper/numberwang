# Numberwang App Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The playable Numberwang — a 4x5 board of numbered cards in eight colour groups, where clicking a card calls it Numberwang or Wangernumb, a correct call reveals its clue, and the archive lists every day so far — deployed to GitHub Pages at `/numberwang/`.

**Architecture:** Fork `cbsbd`'s `site/` and adapt it. The play mechanic is unchanged — same reducer, same deduction gate, same hint ladder, same local-storage progress, same archive — so this plan is a rename through the game layer plus a genuinely new card, a new clue tokenizer contract, and a set of deletions that a fixed 4-wide board of numbers makes possible. React 19 with no router library (hash routing in 71 lines), no state library (one `useReducer`), no CSS framework (one stylesheet).

**Tech Stack:** TypeScript, React 19, Vite 8, Vitest 4 with jsdom and Testing Library. No new dependencies.

**Spec:** `docs/superpowers/specs/2026-09-10-numberwang-design.md`

**Prerequisite:** `docs/superpowers/plans/2026-09-10-numberwang-generator.md`, complete. This plan reads `puzzles/*.json` and `puzzles/index.json`; without them there is nothing to play.

## Global Constraints

- **Board is fixed at width 4, height 5** — 20 cards, every day. Nothing in the app may branch on board width.
- **Card states are exactly three**, and their colours are the approved mockup's, verbatim:
  - Unsolved — `#f4f1ec` ground, `#2a2724` number, `1px solid #ddd6cc` border
  - Numberwang — `#FFD9B8` peach ground, `#3a2a1c` number, subtle confetti in `#7FB2E5` (blue) and `#F2A6C4` (pink) at 0.5 opacity
  - Wangernumb — `#111` ground, `#fff` number
- **The colour band is a plain strip across the top of the card and carries no text.** It is present in all three states and the card background never touches it.
- **The trait is spoken as "Numberwang" and "Wangernumb"** in every player-facing string. Never "numberwangs", never "criminal". Wangernumb is the show's own reversed round, and the nearest thing it has to an opposite; Numberwang is only ever declared, never denied. Renamed after Task 3, so Tasks 1-3 below still say "Not Numberwang" and `not-numberwang` where the code now says Wangernumb and `wangernumb` — they record what was done at the time. The DSL trait token stays `not_numberwang` everywhere: in hints, in puzzle JSON, and in `Guess`.
- **The number on a card is drawn in that card's group colour**, and on an
  unsolved card it is as large as the card will hold. Asked for after Task 4,
  and it supersedes the numbers named in the card-state constraint above: the
  three grounds and the confetti stand, the number's colour does not. The band
  went to 14px in the same round, the tag moved from a triangle in the top-right
  to a square flush into the bottom-left corner, a clue that names a colour
  group draws a small bar of it after the word (eight groups is more than a
  player can hold by name), and a card whose text is a fact rather than a clue
  sets that text in italic.
- **The two verdict colours are aqua green and pinkish red** — Numberwang
  `#5cbd84` with `#08301c` ink, Wangernumb `#9e2547` with `#ffe6ec`. Asked for
  after Task 5, and it supersedes the peach and the black in the card-state
  constraint above; the confetti stays blue and pink, and the gray unsolved
  ground stays. One light and one dark on purpose, so the verdict on a card is
  legible across the board and not only to someone who can separate the hues.
- **Most of a board carries a clue, not a fact.** Generator-side, and recorded
  here because it was asked for while this plan was being executed: the chain
  now prefers a clue that flips a single card, which took a twenty-card board
  from about 10 clue cards to 14-18, and the arithmetic budget went from 0.23
  of the clues to 0.375 weighted toward the three predicates that add, so
  "add to" turns up on nearly every board.
- **No analytics.** `cbsbd`'s `index.html` carries a umami script with cbsbd's own website id; it does not come along.
- **Deploy base path is `/numberwang/`**, with no UUID and no `config/site.json`.
- **Local-storage keys are namespaced `nw:`**, so a browser that has played `cbsbd` on the same host cannot collide.
- Puzzle JSON is read-only to the app. If a puzzle looks wrong, the generator is wrong.

---

## The Contract With The Generator

The app consumes what the generator plan produces. Copied here because the app's
implementer does not read that plan:

```ts
// shared/puzzle.ts
interface Person {
  number: number;        // 1..20, unique on the board
  colour: string;        // one of PALETTE
  numberwang: boolean;   // the hidden verdict
  clue: string | null;   // tokenized text, see below
  origHint: string | null;
  paths: number[][] | null;
}
```

`clue` is not finished English. It carries tokens the app expands against the
board, because the renderer works from a hint alone and cannot count cards:

| Token | Means | Renders as |
| --- | --- | --- |
| `#NAME:7` | card 7 | `17` (that card's number) |
| `#NAMES:7` | card 7, possessive | `17's` |
| `#COLOUR:teal` | the colour group, singular | `teal card` |
| `#COLOURS:teal` | the colour group, plural | `teal cards` |
| `#COLOURN:teal` | the group with its size | `3 teal cards` |
| `#C:2` | column 2 | `B` |
| `#BETWEEN:pair(4,7)` | an inclusive card range | a positional paraphrase |

Clue text also joins "row" and "column" to what follows with U+00A0. That is the
generator's business; the app passes it through untouched.

`puzzles/index.json` is `ManifestEntry[]`, newest last:

```ts
interface ManifestEntry {
  date: string;      // YYYY-MM-DD, and also the play slug
  id: string;
  title: string;
  difficulty: string;
  width: number;
  height: number;
}
```

There is no `variant` and no `slug` — every puzzle is the puzzle for its date.

---

## File Structure

Forked from `cbsbd/site/` and modified:

| File | Responsibility after this plan |
| --- | --- |
| `index.html` | Document head. Retitled, refavicon'd, analytics removed |
| `vite.config.ts` | Root `site/`, base `/numberwang/`, dev-time `puzzles/` serving |
| `site/src/main.tsx` | Mount. Unchanged |
| `site/src/App.tsx` | Route switch. Unchanged |
| `site/src/router.ts` | Hash routing. Loses the variant and one-off alternations |
| `site/src/useFetch.ts` | Fetch hook. Unchanged |
| `site/src/components/Card.tsx` | One card: colour band, number, clue, marks |
| `site/src/components/Grid.tsx` | The 4x5 and its reference highlighting |
| `site/src/clue/tokenize.ts` | Clue token grammar. `#PROF*` → `#COLOUR*` |
| `site/src/clue/ClueText.tsx` | Token expansion against the board |
| `site/src/game/reducer.ts` | Game state machine. `Guess` renamed |
| `site/src/game/deduce.ts` | The deduction gate. `Shape` gains `numbers` |
| `site/src/game/storage.ts` | Progress in local storage. Key namespace `nw:` |
| `site/src/game/useGameState.ts` | Reducer + persistence. Unchanged |
| `site/src/screens/Game.tsx` | The play screen. Loses `useFitBoard` |
| `site/src/screens/Archive.tsx` | The archive. Loses the source filter |
| `site/src/screens/archiveData.ts` | Archive grouping and filtering |
| `site/src/styles.css` | Everything visual |

Deleted:

| File | Why |
| --- | --- |
| `site/src/faces.ts`, `faces.test.ts` | 91 lines of profession→emoji. A number is its own glyph |

Created:

| File | Responsibility |
| --- | --- |
| `.github/workflows/pages.yml` | Build and deploy to Pages |

---

### Task 1: Restore the app and make it compile against the new puzzle format

The mechanical task. Deliverable is a green suite and a board that boots — ugly,
showing raw fields, but real and clickable.

**Files:**
- Create: `site/` (copied from `cbsbd`), `index.html`, `vite.config.ts`
- Modify: `package.json`, `site/src/router.ts`, `site/src/game/storage.ts`, `site/src/game/deduce.ts`, `site/src/game/reducer.ts`
- Delete: `site/src/faces.ts`, `site/src/faces.test.ts`

**Interfaces:**
- Consumes: `Person`, `Puzzle`, `validatePuzzle` from `shared/puzzle.ts`; `Shape` from `shared/solver/enumerate.ts`; `ManifestEntry` from `scripts/manifest.mts`
- Produces: `Guess = 'numberwang' | 'not_numberwang'`; `parseHash(hash: string): Route` with `Route = { screen: 'archive' } | { screen: 'play'; slug: string }`; local-storage keys prefixed `nw:`

- [x] **Step 1: Copy the app in**

```bash
cd /Users/dan/code/numberwang
rsync -a --exclude='dist' /Users/dan/code/cbsbd/site/ ./site/
cp /Users/dan/code/cbsbd/index.html ./index.html 2>/dev/null || true
cp /Users/dan/code/cbsbd/vite.config.ts ./vite.config.ts
```

`index.html` lives at `site/index.html` (Vite's root is `site/`), so if the copy
above found nothing at the repo root, that is correct — `site/index.html` came
across with the rsync.

- [x] **Step 2: Restore the app scripts to `package.json`**

The generator plan removed these because there was nothing to serve:

```json
    "dev": "vite",
    "build": "vite build",
    "preview": "vite preview",
```

Put them back above `"test"`, keeping the rest of `scripts` as it is.

- [x] **Step 3: Point `vite.config.ts` at `/numberwang/` and stop reading a deleted file**

The inherited config reads `config/site.json` for a UUID base path; the generator
plan deleted that file. Replace the top of the file:

```ts
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { existsSync, createReadStream } from 'node:fs';
import path from 'node:path';

// `cbsbd` serves itself under a UUID for obscurity and reads it from
// config/site.json. `cbsbd3d` decided against that; this follows the later call,
// so the base path is a literal and there is no config file to keep in sync.
const base = '/numberwang/';
```

Leave the `servePuzzles` plugin and the `defineConfig` call as they are — the
plugin closes over `base` and needs no change.

- [x] **Step 4: Delete `faces.ts`**

```bash
rm site/src/faces.ts site/src/faces.test.ts
```

A profession needed a picture because "cook" is a word; a number is already a
glyph, and the biggest thing on the card. Every `faceFor` call goes away in Tasks
2 and 4; for now, expect the typecheck to name them.

- [x] **Step 5: Write the failing tests for the two renamed contracts**

Add to `site/src/router.test.ts`:

```ts
describe('routing without variants', () => {
  it('routes a bare date to play', () => {
    expect(parseHash('#/play/2026-09-10')).toEqual({ screen: 'play', slug: '2026-09-10' });
  });

  it('routes a variant suffix to the archive — there are no variants', () => {
    expect(parseHash('#/play/2026-09-10-dan')).toEqual({ screen: 'archive' });
  });

  it('routes a named puzzle to the archive — there are no one-offs', () => {
    expect(parseHash('#/play/10x10')).toEqual({ screen: 'archive' });
  });

  it('routes anything else to the archive', () => {
    expect(parseHash('#/')).toEqual({ screen: 'archive' });
    expect(parseHash('')).toEqual({ screen: 'archive' });
  });
});
```

Add to `site/src/game/storage.test.ts`:

```ts
it('namespaces progress under nw:, not cbs:', () => {
  saveProgress('abc123', { flipped: [1], mistakes: 0, elapsedMs: 0, completed: false });
  expect(localStorage.getItem('nw:progress:abc123')).not.toBeNull();
  expect(localStorage.getItem('cbs:progress:abc123')).toBeNull();
});
```

- [x] **Step 6: Run them to verify they fail**

Run: `npx vitest run site/src/router.test.ts site/src/game/storage.test.ts`
Expected: FAIL — `router.ts` still imports `VARIANTS` and `ONE_OFFS`, which no
longer exist, so the module will not even load; `storage.ts` still writes `cbs:`.

- [x] **Step 7: Simplify `router.ts`**

Both alternations existed to route a *suffix* or a *name*. Neither exists now, so
the whole mechanism collapses to a date:

```ts
import { useEffect, useState } from 'react';

export type Route = { screen: 'archive' } | { screen: 'play'; slug: string };

/**
 * A play slug is a date, full stop.
 *
 * `cbsbd` built this pattern out of `VARIANTS` and `ONE_OFFS` so that adding a
 * variant made its links open — a slug that was not in those tables was not a
 * route. With every puzzle simply the puzzle for its date, the tables are gone
 * and so is the machinery that read them.
 */
const PLAY = /^#\/play\/(\d{4}-\d{2}-\d{2})$/;

export function parseHash(hash: string): Route {
  const m = hash.match(PLAY);
  return m ? { screen: 'play', slug: m[1] } : { screen: 'archive' };
}
```

Keep the rest of the file — the route-identity helper and the `useRoute` hook —
exactly as it is.

- [x] **Step 8: Renamespace `storage.ts`**

```ts
/**
 * `nw:` rather than `cbsbd`'s `cbs:`. Local storage is per-origin, and both games
 * may be served from the same github.io host under different paths — which share
 * an origin. A shared key would have one game reading the other's progress under
 * a puzzle id that happens to collide.
 */
const key = (puzzleId: string) => `nw:progress:${puzzleId}`;
```

Two more keys live outside this file:

```bash
grep -rn "'cbs:" site/src
```

- `Game.tsx`'s `parkedKey` — `cbs:parked:` → `nw:parked:`.
- `Archive.tsx`'s `SOURCE_KEY` (`cbs:pref:archiveSource`) — deleted, not renamed.
  It remembers a source filter that Step 11 removes.

- [x] **Step 9: Rename the trait through the game layer**

```bash
cd /Users/dan/code/numberwang
FILES=$(git ls-files 'site/**/*.ts' 'site/**/*.tsx')
sed -i '' \
  -e 's/innocents/not_numberwangs/g' \
  -e 's/innocent/not_numberwang/g' \
  -e 's/Innocent/NotNumberwang/g' \
  -e 's/criminals/numberwangs/g' \
  -e 's/criminal/numberwang/g' \
  -e 's/Criminal/Numberwang/g' \
  -e 's/professions/colours/g' \
  -e 's/profession/colour/g' \
  -e 's/Profession/Colour/g' \
  -e 's/person\.name/person.number/g' \
  -e 's/people\[\([a-zA-Z0-9.]*\)\]\.name/people[\1].number/g' \
  $FILES
git diff --stat
```

`innocent` before `numberwang` so the second pass cannot rewrite the first pass's
output — the same ordering the generator plan uses.

This leaves CSS class names (`.btn-innocent`, `.card.criminal`) untouched in
`styles.css`, which is not in `$FILES`. Task 2 renames those together with the
card's look; until then the classes the TSX emits and the classes the stylesheet
defines disagree, and the board renders unstyled cards. That is expected and the
tests do not depend on it.

- [x] **Step 10: Give `deduce.ts` the numbers the solver now requires**

`Shape` gained a `numbers` field, and the arithmetic predicates read it. Without
it the deduction gate silently degrades: `solvableFor` throws, the `catch` returns
`null`, `isForced` returns `false`, and every card falls back to the sampled
`paths` — which is exactly the bug the comment in that file describes at length.

```ts
      shape: {
        grid: makeGrid(puzzle.width, puzzle.height),
        colours: puzzle.people.map((p) => p.colour),
        // The arithmetic predicates read these. Omitting them does not fail
        // loudly — `solvableFor` throws, the catch below returns null, and every
        // card falls back to its sampled `paths`, which counts correct
        // deductions as mistakes. See the note on `isDeducible`.
        numbers: puzzle.people.map((p) => p.number),
      },
```

- [x] **Step 11: Fix the remaining typecheck errors**

Run: `npx tsc --noEmit`

The errors, and what each wants:

- **`faceFor` is not exported** — `Card.tsx`'s import, and `Game.tsx`'s
  `GuessModal`. Delete the import and the element at each site:
  `<div className="card-face">{faceFor(person)}</div>` and
  `<div className="modal-face">{faceFor(person)}</div>`. Tasks 2 and 4 build what
  replaces them; a card with no glyph is fine for one task, a card with a broken
  import is not.
- **`person.gender` does not exist** — nothing but `faces.ts` read it, but the
  test fixtures all set it.
- **The three fixtures still describe people.** Each is a module-level constant,
  not a factory, so there is one edit per file.

  `site/src/screens/Game.test.tsx` — its `puzzle` is a 2x2 whose `people` become:

  ```ts
    { number: 7, colour: 'red', numberwang: false, clue: 'Start here', origHint: null, paths: [] },
    { number: 3, colour: 'teal', numberwang: true, clue: 'Clue of #NAME:1', origHint: null, paths: [[0]] },
    { number: 12, colour: 'red', numberwang: false, clue: null, origHint: null, paths: [[0, 1]] },
    { number: 9, colour: 'blue', numberwang: true, clue: null, origHint: null, paths: [[0, 2]] },
  ```

  Drop `source: 'cluesbysam.com'` from the puzzle while you are there — there is
  no source site. Its `describe('board width')` block builds a 5-wide board from
  a list of names: rename those fields the same way and otherwise leave the block
  alone. Task 5 deletes it along with the machinery it tests.

  Tests in this file address cards by name — `expect(modal.textContent).toContain('ozan')`,
  `[['mira', 'Criminal'], …]`. Those become numbers as strings: `'12'`, and the
  verdict labels become `'Numberwang'` / `'Not Numberwang'` once Task 4 relabels
  the buttons. Until then the labels are the sed's mechanical output
  (`NotNumberwang`), so expect this file to need one more pass in Task 4 — that
  is why its tests are listed there too.

  `site/src/clue/ClueText.test.tsx` — its `person` helper and `names20` grid:

  ```ts
  const person = (number: number, colour: string): Person => ({
    number, colour, numberwang: false, clue: null, origHint: null, paths: [],
  });
  const people = [person(7, 'red'), person(3, 'teal'), person(12, 'blue')];
  const grid = [...Array(20)].map((_, i) => person(i + 1, 'red'));
  ```

  Its `renderClue(clue, opts)` helper needs no change and Task 3 uses it as it is.

  `site/src/screens/Archive.test.tsx` — its `manifest` entries lose `slug` and
  `variant`, keeping `date`, `id`, `difficulty`, `title`, `width`, `height`. Its
  `localStorage.setItem('cbs:progress:…')` becomes `nw:progress:`.

- **`ManifestEntry.variant` and `.slug` do not exist** — `Archive.tsx` and
  `archiveData.ts`. Do the compile-level removal now and leave the screen's copy
  to Task 6. Delete: the `VARIANTS` / `Variant` / `puzzleBillingOf` imports,
  `SOURCES`, `SOURCE_LABELS`, `SOURCE_KEY`, `loadSource`, the `source` state,
  `chooseSource`, the `variant` derived from it, the Source `<label>` and its
  `<select>`, and the `.arch-source` badge. Then:

  - `<span className="arch-billing">{puzzleBillingOf(entry)}</span>` becomes
    `<span className="arch-billing">{entry.difficulty}</span>`. `puzzleBillingOf`
    printed a board size for a variant and a difficulty for a real puzzle; every
    board here is 4x5, so a size would print the same string on every row.
  - `ArchiveFilters` loses its `variant?: ManifestEntry['variant']` field and
    `filterEntries` loses the clause that read it.
  - The `difficulties` `useMemo` loses its `variant` filter and its `variant`
    dependency: `[...new Set((data ?? []).map((e) => e.difficulty))]`.
  - `entry.slug` becomes `entry.date`, in the `<li key>` and the `href`.

  Delete the two tests that exist only to test source behaviour — the "bills a
  real puzzle by difficulty and a Dan one by its board" test and the one asserting
  difficulty options are scoped to the current source. They assert a distinction
  that no longer exists, so there is nothing to salvage.

- [x] **Step 12: Run the whole suite**

Run: `npx tsc --noEmit && npm test`
Expected: PASS, clean typecheck. Delete, don't weaken, any test that asserted
something the fork removed (a face, a variant label).

- [x] **Step 13: Look at it**

```bash
npm run generate -- 2026-09-10 && npm run manifest && npm run dev
```
Open `http://localhost:5173/numberwang/#/play/2026-09-10`. Expected: twenty
unstyled cards showing numbers, clickable, and a guess modal with two buttons.
It will look wrong. Confirm it *works* — a correct call flips a card and reveals
its clue text.

- [x] **Step 14: Commit**

```bash
git add -A
git commit -m "Restore the app against the new puzzle format

A rename through the game layer, plus two deletions that carry their own
argument. faces.ts is gone: a profession needed a picture because \"cook\" is a
word, and a number is already a glyph. The router's variant and one-off
alternations are gone with the tables that fed them.

deduce.ts needed the numbers threaded through, and that one is a trap: leave them
out and nothing throws where you can see it. solvableFor fails, the catch returns
null, and every card silently falls back to its sampled paths — which is the exact
bug that file's own comment describes, where 32 of 54 puzzles rejected a card the
flipped clues plainly forced.

The board renders unstyled at this commit: the stylesheet still names .criminal
and .innocent. The next commit is the card."
```

---

### Task 2: The card

**Files:**
- Modify: `site/src/components/Card.tsx`, `site/src/styles.css`
- Test: `site/src/components/Card.test.tsx` (create)

**Interfaces:**
- Consumes: `Person` from `shared/puzzle.ts`; `Tag`, `TAG_COLORS` from `game/reducer.ts`
- Produces: `Card` props gain `colourReferenced: boolean` and `colourBounce: boolean`, replacing `profReferenced`/`profBounce`; `numberReferenced`/`numberBounce` replace `nameReferenced`/`nameBounce`; CSS classes `.card.numberwang`, `.card.not-numberwang`, `.colour-band`, `.card-number`, and `--colour-<name>` custom properties for the eight palette colours

- [x] **Step 1: Write the failing tests**

Create `site/src/components/Card.test.tsx`:

```tsx
// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { Person } from '../../../shared/puzzle';
import Card from './Card';

const person = (number: number, colour: string, numberwang = false): Person => ({
  number, colour, numberwang, clue: null, origHint: null, paths: [],
});

const noop = () => {};
// Card's props are all required bar tag/mark/clueNode.
const base = {
  label: 'A1',
  flipped: false,
  rejected: false,
  consumed: false,
  justFlipped: false,
  numberReferenced: false,
  colourReferenced: false,
  numberBounce: false,
  colourBounce: false,
  pickerOpen: false,
  hintClue: false,
  hintCard: false,
  onOpen: noop,
  onCycleTag: noop,
  onOpenPicker: noop,
  onPickMark: noop,
  onToggleClue: noop,
};

const cardEl = () => screen.getByRole('group');

describe('Card', () => {
  it('shows the number as the card face', () => {
    render(<Card {...base} person={person(17, 'teal')} />);
    expect(screen.getByText('17')).toBeTruthy();
  });

  it('carries a colour band in every state, and the band has no text', () => {
    for (const flipped of [false, true]) {
      const { unmount, container } = render(
        <Card {...base} flipped={flipped} person={person(17, 'teal', true)} />,
      );
      const band = container.querySelector('.colour-band');
      expect(band).toBeTruthy();
      expect(band!.textContent).toBe('');
      unmount();
    }
  });

  it('names the colour on the band for assistive tech, since it carries no text', () => {
    const { container } = render(<Card {...base} person={person(17, 'teal')} />);
    expect(container.querySelector('.colour-band')!.getAttribute('aria-label')).toBe('teal');
  });

  it('takes the band colour from a custom property, not an inline hex', () => {
    const { container } = render(<Card {...base} person={person(17, 'teal')} />);
    const band = container.querySelector('.colour-band') as HTMLElement;
    expect(band.style.background).toBe('var(--colour-teal)');
  });

  it('is neither solved class while unflipped', () => {
    render(<Card {...base} person={person(17, 'teal', true)} />);
    expect(cardEl().className).not.toContain('numberwang');
  });

  it('marks a flipped Numberwang card', () => {
    render(<Card {...base} flipped person={person(17, 'teal', true)} />);
    expect(cardEl().classList.contains('numberwang')).toBe(true);
    expect(cardEl().classList.contains('not-numberwang')).toBe(false);
  });

  it('marks a flipped Not Numberwang card', () => {
    render(<Card {...base} flipped person={person(17, 'teal', false)} />);
    expect(cardEl().classList.contains('not-numberwang')).toBe(true);
    expect(cardEl().classList.contains('numberwang')).toBe(false);
  });

  it('says the catchphrase on a fresh correct call', () => {
    render(<Card {...base} flipped justFlipped person={person(17, 'teal', true)} />);
    expect(screen.getByText("That's Numberwang!")).toBeTruthy();
  });

  it('does not say the catchphrase for a Not Numberwang card', () => {
    render(<Card {...base} flipped justFlipped person={person(17, 'teal', false)} />);
    expect(screen.queryByText("That's Numberwang!")).toBeNull();
    expect(screen.getByText('Correct!')).toBeTruthy();
  });

  it('highlights the number and the band independently', () => {
    const { container } = render(
      <Card {...base} numberReferenced colourReferenced person={person(17, 'teal')} />,
    );
    expect(container.querySelector('.card-number')!.className).toContain('referenced');
    expect(container.querySelector('.colour-band')!.className).toContain('referenced');
  });

  it('gives the confetti a per-card offset so solved cards do not look stamped', () => {
    const seed = (n: number) => {
      const { container } = render(<Card {...base} flipped person={person(n, 'red', true)} />);
      return (container.querySelector('.card') as HTMLElement).style.getPropertyValue(
        '--confetti-seed',
      );
    };
    expect(seed(3)).not.toBe(seed(18));
  });
});
```

Note `classList.contains` rather than `className.includes`: `numberwang` is a
substring of `not-numberwang`, so a substring test cannot tell the two states
apart.

- [x] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run site/src/components/Card.test.tsx`
Expected: FAIL — the props are still `nameReferenced`/`profReferenced`, there is
no `.colour-band` and no `.card-number`.

- [x] **Step 3: Rebuild the card's markup**

In `Card.tsx`, rename the four reference props and replace the face/name/prof
elements. The prop block becomes:

```tsx
  /** An active (unconsumed) clue mentions this card's number / colour group. */
  numberReferenced: boolean;
  colourReferenced: boolean;
  /** A clue newly revealed this reference (not on mount, not the clue's own
   * card): play the bounce. */
  numberBounce: boolean;
  colourBounce: boolean;
```

The class list:

```tsx
  const classes = [
    "card",
    flipped ? "flipped" : "",
    flipped ? (person.numberwang ? "numberwang" : "not-numberwang") : "",
    rejected ? "rejected" : "",
    consumed ? "consumed" : "",
    hintClue ? "hint-clue" : "",
    hintCard ? "hint-card" : "",
  ]
    .filter(Boolean)
    .join(" ");
```

Note `not-numberwang` with a hyphen, not the DSL's underscore: a class name for a
state, not a trait token. `numberwang` is a substring of `not-numberwang`, so a
`className.includes('numberwang')` check cannot tell them apart — read the
specific class, as the tests do.

Inside the card, replacing `.card-face`, `.card-name` and `.card-prof`:

```tsx
        {/* The band carries no text — eight colours were chosen over a named
            band deliberately. So the name goes where a screen reader can still
            reach it, since nothing else on the card says which group this is. */}
        <div
          className={[
            "colour-band",
            colourReferenced ? "referenced" : "",
            colourBounce ? "bounce" : "",
          ]
            .filter(Boolean)
            .join(" ")}
          style={{ background: `var(--colour-${person.colour})` }}
          aria-label={person.colour}
        />
        <div className="card-pos">{label}</div>
        {justFlipped && (
          <div className="speech-bubble">
            {person.numberwang ? "That's Numberwang!" : 'Correct!'}
          </div>
        )}
        <div
          className={[
            "card-number",
            numberReferenced ? "referenced" : "",
            numberBounce ? "bounce" : "",
          ]
            .filter(Boolean)
            .join(" ")}
        >
          {person.number}
        </div>
```

And on the card element itself, the confetti offset:

```tsx
      <div
        role="group"
        className={classes}
        style={{ ['--confetti-seed' as string]: String(person.number) }}
        onClick={flipped ? undefined : onOpen}
      >
```

The number is the seed because it is already unique per card and already known
here — no index needs threading down for it.

- [x] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run site/src/components/Card.test.tsx`
Expected: PASS. `Grid.tsx` still passes the old prop names, so `tsc` will
complain — that is Task 3.

- [x] **Step 5: Restyle the card**

In `styles.css`, add the palette to `:root`. These are the mockup's hexes, chosen
to stay distinguishable as small strips on a dark ground:

```css
  /* The eight colour groups. A band is a small strip on a dark card, so these
     are the mockup's measured values rather than named CSS colours, which are
     too light (yellow) or too dark (purple) at this size. */
  --colour-red: #d6453f;
  --colour-orange: #de7a28;
  --colour-yellow: #c9a21b;
  --colour-green: #3e9b62;
  --colour-teal: #2b9a9a;
  --colour-blue: #2f6fb5;
  --colour-purple: #8e5aa8;
  --colour-pink: #db6fa4;

  /* The three card states. */
  --card-unsolved: #f4f1ec;
  --card-unsolved-text: #2a2724;
  --card-unsolved-border: #ddd6cc;
  --card-numberwang: #ffd9b8;
  --card-numberwang-text: #3a2a1c;
  --card-not: #111;
  --card-not-text: #fff;
  --confetti-blue: #7fb2e5;
  --confetti-pink: #f2a6c4;
```

Replace the `.card.innocent` / `.card.criminal` rules (the Task 1 sed left them
under their old names in this file) and the `.card-face` / `.card-name` /
`.card-prof` rules:

```css
.card {
  /* …existing box rules unchanged… */
  background: var(--card-unsolved);
  color: var(--card-unsolved-text);
  border: 1px solid var(--card-unsolved-border);
}

/* A plain strip the card background never reaches, so the colour survives both
   solved states — clues name colour groups constantly, and losing the group the
   moment you learn something about it is losing the reason to reason about it. */
.colour-band {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: 9px;
  z-index: 2;
}

.card-number {
  position: relative;
  z-index: 3;
  font-size: 30px;
  line-height: 30px;
  font-weight: 700;
  margin-top: 7px;
}
.card.flipped .card-number {
  font-size: 17px;
  line-height: 17px;
  margin-top: 5px;
  margin-bottom: 2px;
}

.card.numberwang {
  background: var(--card-numberwang);
  color: var(--card-numberwang-text);
  border-color: #e8bd93;
}
.card.not-numberwang {
  background: var(--card-not);
  color: var(--card-not-text);
  /* The page ground is #1a1d24, so a #111 card needs an edge or it dissolves
     into the gap between cards. */
  border-color: #3a3a3a;
}

/* Confetti: six gradient dots rather than six elements, offset per card by
   --confetti-seed so twenty solved cards are not twenty identical stamps. The
   dots are a background layer under the number, which sits at z-index 3. */
.card.numberwang::before {
  content: '';
  position: absolute;
  inset: 9px 0 0 0;   /* below the band */
  z-index: 1;
  opacity: 0.5;
  background-image:
    radial-gradient(circle 2px, var(--confetti-blue) 99%, transparent 100%),
    radial-gradient(circle 2px, var(--confetti-pink) 99%, transparent 100%),
    radial-gradient(circle 2px, var(--confetti-pink) 99%, transparent 100%),
    radial-gradient(circle 2px, var(--confetti-blue) 99%, transparent 100%),
    radial-gradient(circle 2px, var(--confetti-pink) 99%, transparent 100%),
    radial-gradient(circle 2px, var(--confetti-blue) 99%, transparent 100%);
  background-repeat: no-repeat;
  background-position:
    calc(8px + var(--confetti-seed) * 1px) 14px,
    calc(46px - var(--confetti-seed) * 1px) 11px,
    calc(18px + var(--confetti-seed) * 2px) 50px,
    calc(50px - var(--confetti-seed) * 1px) 46px,
    calc(32px + var(--confetti-seed) * 1px) 26px,
    calc(12px + var(--confetti-seed) * 2px) 36px;
}

/* An active clue's references. The number brightens; the band, which has no text
   to brighten, gets a ring instead. */
.card-number.referenced {
  text-decoration: underline;
}
.colour-band.referenced {
  box-shadow: inset 0 0 0 2px #fff;
}
.card-number.bounce,
.colour-band.bounce {
  animation: bounce-ref 0.45s;
}
```

Then sweep the file for the old names, which the Task 1 sed did not reach:

```bash
grep -n 'innocent\|criminal\|card-face\|card-name\|card-prof' site/src/styles.css
```

Every hit is either a card rule handled above or a button/modal rule Task 4 owns.
Rename the card ones now; leave the modal ones for Task 4.

- [x] **Step 6: Look at all three states at once**

Run: `npm run dev`, open the day's board, and solve four or five cards on purpose
— getting some wrong so both solved states are on screen together.

Check, and fix what fails: the band is legible on all three grounds; the peach
card's number is readable over the confetti; the black card does not dissolve into
the page; two adjacent solved Numberwang cards do not have identical confetti.

- [x] **Step 7: Commit**

```bash
git add site/src/components/Card.tsx site/src/components/Card.test.tsx site/src/styles.css
git commit -m "Give the card a number, a colour band and three states

The band is the whole reason the card is laid out this way. Both solved states own
the background — peach with confetti, or black — so a colour living in the
background would vanish exactly when a card was solved, and clues name colour
groups constantly. A strip across the top survives all three states.

It carries no text, which was the deliberate choice over a named band, so the
colour name goes in aria-label: without it nothing on the card says which group
this is, for anyone who cannot see the strip.

Confetti is six gradient dots offset by the card's own number rather than six
elements, so twenty solved cards are not twenty identical stamps."
```

---

### Task 3: Clue text

The clue is the game. This task is what turns `The Numberwang cards among
#COLOURS:teal add to 12` into something a person reads.

**Files:**
- Modify: `site/src/clue/tokenize.ts`, `site/src/clue/ClueText.tsx`, `site/src/components/Grid.tsx`
- Test: `site/src/clue/tokenize.test.ts`, `site/src/clue/ClueText.test.tsx`

**Interfaces:**
- Consumes: the token table in **The Contract With The Generator**
- Produces: `ClueSegment` variant `{ kind: 'colour'; word: string; plural: boolean; counted: boolean }`; `clueReferencedIndices(clue, people, width, selfIndex): { numbers: number[]; colours: number[] }`

- [x] **Step 1: Write the failing tokenizer tests**

Add to `site/src/clue/tokenize.test.ts`:

```ts
it('parses the three colour tokens', () => {
  expect(tokenizeClue('#COLOUR:teal')).toEqual([
    { kind: 'colour', word: 'teal', plural: false, counted: false },
  ]);
  expect(tokenizeClue('#COLOURS:teal')).toEqual([
    { kind: 'colour', word: 'teal', plural: true, counted: false },
  ]);
  expect(tokenizeClue('#COLOURN:teal')).toEqual([
    { kind: 'colour', word: 'teal', plural: true, counted: true },
  ]);
});

it('does not parse the old profession tokens', () => {
  expect(tokenizeClue('#PROF:cook')).toEqual([{ kind: 'text', text: '#PROF:cook' }]);
});

it('keeps parsing names, columns and ranges', () => {
  expect(tokenizeClue('#NAME:3 and #NAMES:4 in column #C:2 #BETWEEN:pair(4,7)')).toEqual([
    { kind: 'name', index: 3, possessive: false },
    { kind: 'text', text: ' and ' },
    { kind: 'name', index: 4, possessive: true },
    { kind: 'text', text: ' in column ' },
    { kind: 'column', column: 2 },
    { kind: 'text', text: ' ' },
    { kind: 'between', a: 4, b: 7 },
  ]);
});
```

- [x] **Step 2: Run them to verify they fail**

Run: `npx vitest run site/src/clue/tokenize.test.ts`
Expected: FAIL — `#COLOUR:teal` falls through to the raw-text fallback.

- [x] **Step 3: Teach the tokenizer the colour tokens**

In `tokenize.ts`, replace the `prof` segment variant and its cases:

```ts
  /** `counted` prefixes the group's whole size: "3 teal cards" rather than
   * "teal cards". */
  | { kind: 'colour'; word: string; plural: boolean; counted: boolean }
```

```ts
    // #COLOURN is ours, not the source's: "Exactly 1 of #COLOURN:teal has …"
    // reads as "Exactly 1 of 3 teal cards has …". The count comes from the
    // board, so only the site can fill it in — see RenderOptions.colourTotals.
    case 'COLOUR':
    case 'COLOURS':
    case 'COLOURN': {
      if (arg === undefined || /^\d/.test(arg)) return null;
      return { kind: 'colour', word: arg, plural: tag !== 'COLOUR', counted: tag === 'COLOURN' };
    }
```

The `TOKEN` regex is `/#([A-Z]+)(?::(pair\(\d+,\d+\)|\w+))?/g` and needs no
change; `COLOURN` matches `[A-Z]+` already.

- [x] **Step 4: Run them to verify they pass**

Run: `npx vitest run site/src/clue/tokenize.test.ts`
Expected: PASS

- [x] **Step 5: Write the failing `ClueText` tests**

`ClueText.test.tsx` already has a `renderClue(clue, opts)` helper returning the
container's text, and Task 1 rewrote its `person` helper. Add a board whose
numbers are deliberately not in card order, so a test that reads an index where
it should read a number fails visibly:

```tsx
// Cards 0..3 are row 1. Groups: teal x3, red x2, blue x2, pink x1.
const board = [
  person(17, 'red'), person(4, 'teal'), person(23, 'teal'), person(8, 'blue'),
  person(9, 'teal'), person(31, 'red'), person(12, 'blue'), person(26, 'pink'),
];
const say = (clue: string, selfIndex?: number) =>
  renderClue(clue, { people: board, width: 4, selfIndex });

describe('numbers and colours', () => {
  it('renders a card reference as its number', () => {
    expect(say('#NAME:0 is Numberwang')).toBe('17 is Numberwang');
  });

  it('renders a possessive reference', () => {
    expect(say('#NAMES:2 neighbors are Numberwang')).toBe("23's neighbors are Numberwang");
  });

  it('renders a singular colour reference', () => {
    expect(say('Only one #COLOUR:teal is Numberwang')).toBe('Only one teal card is Numberwang');
  });

  it('renders a plural colour reference', () => {
    expect(say('The Numberwang cards among #COLOURS:teal add to 12')).toBe(
      'The Numberwang cards among the teal cards add to 12',
    );
  });

  it('counts the group for a #COLOURN reference', () => {
    expect(say('Exactly 1 of #COLOURN:teal has a Numberwang neighbor')).toBe(
      'Exactly 1 of 3 teal cards has a Numberwang neighbor',
    );
  });

  it('says "card" not "cards" for a group of one', () => {
    expect(say('Exactly 1 of #COLOURN:pink is Numberwang')).toBe(
      'Exactly 1 of 1 pink card is Numberwang',
    );
  });

  it('expands a column token to its letter', () => {
    expect(say('The Numberwang cards in column #C:2 add to an even number')).toBe(
      'The Numberwang cards in column B add to an even number',
    );
  });

  it('speaks in the first person on its own card', () => {
    expect(say('#NAME:0 is Numberwang', 0)).toBe('I am Numberwang');
    expect(say('#NAME:1 and #NAME:0 are Numberwang', 0)).toBe('4 and I are Numberwang');
    expect(say('#NAMES:0 neighbors are Numberwang', 0)).toBe('My neighbors are Numberwang');
  });

  it('leaves an unknown token as raw text rather than dropping the clue', () => {
    expect(say('#WHAT:5 is Numberwang')).toBe('#WHAT:5 is Numberwang');
  });
});

describe('clueReferencedIndices with colours', () => {
  it('reports the cards a clue names and the cards its colour groups hold', () => {
    const refs = clueReferencedIndices('#NAME:3 and #COLOURS:teal', board, 4, 0);
    expect(refs.numbers).toEqual([3]);
    expect(refs.colours).toEqual([1, 2, 4]);
  });

  it("excludes the clue's own card from the named set", () => {
    expect(clueReferencedIndices('#NAME:0 and #NAME:3', board, 4, 0).numbers).toEqual([3]);
  });
});
```

The tests already in this file, which Task 1 renamed to numbers, stay as they are.

- [x] **Step 6: Run them to verify they fail**

Run: `npx vitest run site/src/clue/ClueText.test.tsx`
Expected: FAIL — the `prof` segment kind is gone, `clueReferencedIndices` still
returns `{ names, profs }`, and `capitalize` is being applied to a number.

- [x] **Step 7: Rework `ClueText.tsx`**

Four changes.

`nameRef` and the `name` segment case return the number as a string. `capitalize`
is a no-op on a digit, so drop it from those two paths — a number is not a word
and pretending otherwise invites someone to "fix" it later:

```tsx
function numberRef(props: ClueTextProps, index: number): string {
  if (index === props.selfIndex) return 'me';
  return String(props.people[index].number);
}
```

```tsx
    case 'name': {
      const p = props.people[seg.index];
      if (!p) return rawToken(seg);
      const n = String(p.number);
      // A number never ends in "s", so the possessive is always "'s".
      return seg.possessive ? `${n}'s` : n;
    }
```

The `colour` segment case. The noun is fixed — "card" — and its number comes from
the count when there is one, so a group of one reads "1 pink card":

```tsx
    case 'colour': {
      const n = seg.counted
        ? props.people.filter((p) => p.colour === seg.word).length
        : null;
      const plural = n === null ? seg.plural : n !== 1;
      const noun = plural ? 'cards' : 'card';
      // "the teal cards" reads as a group; "3 teal cards" already does, so the
      // article would be wrong there.
      if (n !== null) return `${n} ${seg.word} ${noun}`;
      return plural ? `the ${seg.word} ${noun}` : `${seg.word} ${noun}`;
    }
```

`clueReferencedIndices` renames its two sets and matches on colour:

```tsx
export function clueReferencedIndices(
  clue: string,
  people: Person[],
  width: number,
  selfIndex: number,
): { numbers: number[]; colours: number[] } {
  const numbers = new Set<number>();
  const colours = new Set<number>();
  for (const seg of tokenizeClue(clue)) {
    if (seg.kind === 'name') {
      if (seg.index !== selfIndex && people[seg.index]) numbers.add(seg.index);
    } else if (seg.kind === 'colour') {
      people.forEach((p, i) => {
        if (p.colour === seg.word) colours.add(i);
      });
    } else if (seg.kind === 'between') {
      betweenParts(seg, { clue, people, width, selfIndex })?.refs.forEach((i) => numbers.add(i));
    }
  }
  return {
    numbers: [...numbers].sort((a, b) => a - b),
    colours: [...colours].sort((a, b) => a - b),
  };
}
```

Leave `prepass` alone. Its first-person rewrites ("I am", "me", "my") are exactly
right here — a clue card in this game is a number that speaks, which is the
sketch's own register — and it works on `#NAME:` tokens, which still exist. The
one thing to check is its `capitalize` of the finished clue: `'17 is …'` is
unchanged by it, so it stays.

- [x] **Step 8: Run them to verify they pass**

Run: `npx vitest run site/src/clue/ClueText.test.tsx`
Expected: PASS

- [x] **Step 9: Rewire `Grid.tsx`**

Rename its four sets and pass the renamed props through:

```tsx
  const numberRefs = new Set<number>();
  const colourRefs = new Set<number>();
  const otherNumberRefs = new Set<number>();
  const otherColourRefs = new Set<number>();
  puzzle.people.forEach((person, i) => {
    if (!person.clue || !state.flipped.includes(i) || state.consumed.includes(i)) return;
    numberRefs.add(i);
    const refs = clueReferencedIndices(person.clue, puzzle.people, puzzle.width, i);
    refs.numbers.forEach((n) => {
      numberRefs.add(n);
      if (n !== i) otherNumberRefs.add(n);
    });
    refs.colours.forEach((n) => {
      colourRefs.add(n);
      if (n !== i) otherColourRefs.add(n);
    });
  });
```

and on each `<Card>`:

```tsx
          numberReferenced={numberRefs.has(i)}
          colourReferenced={colourRefs.has(i)}
          numberBounce={bounceNumbers.has(i) && otherNumberRefs.has(i)}
          colourBounce={bounceColours.has(i) && otherColourRefs.has(i)}
```

Rename the two `useState` sets and the `prevOtherRefs` ref fields to match. The
bounce logic itself — never on mount, only for newly emphasized cards — is
unchanged and still correct.

- [x] **Step 10: Run the whole suite**

Run: `npx tsc --noEmit && npm test`
Expected: PASS

- [x] **Step 11: Read the clues on a real board**

Run: `npm run dev` and solve most of a board. Read every clue that appears out
loud. Expected: complete English sentences, no `#` anywhere on screen, the
arithmetic clues among them reading naturally.

```bash
grep -c '#COLOURN' puzzles/*.json || echo 'no counted colour tokens in this board'
```

If a board has none, generate a few more dates and check one that does — the
counted token only appears when the generator turns `colourTotals` on for a clue
that names one group.

- [x] **Step 12: Commit**

```bash
git add -A
git commit -m "Expand clue tokens against the board

The renderer works from a hint alone and cannot count a board, so it writes
#COLOURN:teal and the site turns that into \"3 teal cards\" — including \"1 pink
card\" for a group of one, which is why the plural comes from the count rather
than from the token.

prepass survives untouched. Its first-person rewrites were built so a clue card
could say \"I am innocent\"; a number saying \"I am Numberwang\" is if anything
more at home in this game than in the one it came from."
```

---

### Task 4: The guess modal and the results screen

**Files:**
- Modify: `site/src/screens/Game.tsx`, `site/src/styles.css`
- Test: `site/src/screens/Game.test.tsx`

**Interfaces:**
- Consumes: `Guess` from `game/reducer.ts`; the palette custom properties from Task 2
- Produces: CSS classes `.btn-numberwang`, `.btn-wangernumb`, `.modal-number`, `.modal-colour`

- [ ] **Step 1: Write the failing tests**

`Game.test.tsx` renders through its own `renderGame(user?)`, which mounts `Game`
against the module-level `puzzle` served by a stubbed `fetch` and clicks past the
start popup. It takes no fixture argument. Add:

```tsx
describe('the guess modal', () => {
  it('identifies the card by its number and its colour', async () => {
    const user = userEvent.setup();
    await renderGame(user);
    await user.click(screen.getAllByRole('group')[2]); // card 2, unrevealed
    const modal = screen.getByRole('dialog');
    expect(modal.getAttribute('aria-label')).toBe('4');
    expect(modal.textContent).toContain('4');
    expect(modal.querySelector('.modal-colour')!.getAttribute('aria-label')).toBe('red');
  });

  it('offers the two verdicts by name', async () => {
    const user = userEvent.setup();
    await renderGame(user);
    await user.click(screen.getAllByRole('group')[2]);
    expect(screen.getByRole('button', { name: 'Numberwang' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Wangernumb' })).toBeTruthy();
  });
});
```

`getByRole('button', { name: 'Numberwang' })` matches the accessible name in
full, and "Wangernumb" does not contain it — but a `/numberwang/i` regex would
match both. Use the exact string in every one of these.

The tests this file already has were relabelled when the verdict was renamed
(see "Numberwang or Wangernumb" below), so they already click
`{ name: 'Wangernumb' }`.

The blocked-verdict test this file already has — a rejected verdict is disabled
until the next reveal — is the coverage this task needs for `blocked`, so it wants
the relabelling and nothing more.

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run site/src/screens/Game.test.tsx`
Expected: FAIL — the modal has no `.modal-colour`, its `aria-label` is a number
rather than a string.

- [ ] **Step 3: Rebuild the modal body**

In `Game.tsx`, the modal that Task 1 left with its face removed:

The modal's `aria-label={person.name}` becomes the number, which must be a
string — React renders a number child fine but an `aria-label` must not be one:

```tsx
        aria-label={String(person.number)}
```

Then the body:

```tsx
        <div className="modal-number">{person.number}</div>
        {/* The card's band, repeated: the modal covers the board, so without it
            a clue about a colour group cannot be checked against the card being
            called. */}
        <div
          className="modal-colour"
          style={{ background: `var(--colour-${person.colour})` }}
          aria-label={person.colour}
        />
        <div className="modal-choices">
          <button
            className="btn-numberwang"
            disabled={blocked.includes('numberwang')}
            onClick={() => onGuess('numberwang')}
          >
            Numberwang
          </button>
          <button
            className="btn-wangernumb"
            disabled={blocked.includes('not_numberwang')}
            onClick={() => onGuess('not_numberwang')}
          >
            Wangernumb
          </button>
        </div>
```

Numberwang goes first, where `cbsbd` puts Innocent: the first button is the
good news in both games.

Also update the `other` line the wrong-guess modal uses, which the sed left as a
pair of renamed strings — confirm it reads:

```tsx
  const other: Guess = guess === 'numberwang' ? 'not_numberwang' : 'numberwang';
```

- [ ] **Step 4: Style the modal and the buttons**

In `styles.css`, replace the `.modal-face` / `.modal-name` / `.modal-prof` and
`.btn-innocent` / `.btn-criminal` rules:

```css
.modal-number {
  font-size: 44px;
  line-height: 44px;
  font-weight: 700;
}
.modal-colour {
  width: 64px;
  height: 9px;
  border-radius: 2px;
  margin: 8px auto 4px;
}
/* The two verdicts stack rather than sitting side by side: at the inherited
   horizontal layout neither button gets enough width to read on a phone. */
.modal-choices {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.btn-numberwang {
  background: var(--card-numberwang);
  color: var(--card-numberwang-text);
  border-color: #e8bd93;
}
.btn-wangernumb {
  background: var(--card-wangernumb);
  color: var(--card-wangernumb-text);
  border-color: #3a3a3a;
}
.btn-numberwang:hover:not(:disabled) {
  border-color: #fff;
}
.btn-wangernumb:hover:not(:disabled) {
  border-color: #fff;
}
```

Each verdict button wears the colour of the card it will produce, so the choice
and its consequence look the same — which the two buttons in `cbsbd` also do.

- [x] **Step 5: Fix the player-facing copy**

The verdict copy is already right; what is left is the rest of the sed's output
from Task 1, which needs reading as English:

```bash
grep -rn 'NotNumberwang\|Not Numberwang' site/src && echo 'FIX THESE' || echo 'clean'
grep -in 'suspect\|evidence\|caught\|mystery\|crime' site/src/screens/Game.tsx
```

Rewrite each hit for a quiz show rather than a crime scene — the "Not enough
evidence!" rejection, the completion line, the share text.

The share grid's cell classes (`.share-green`, `.share-yellow`, …) encode *how* a
card was solved, not what it was, so they are unchanged.

*Done:* the first grep was clean; every hit was in the wrong-guess popup.
`EvidenceModal` is now `NotProvenModal`, its heading "Not enough information!"
(it fires for a wrong call and for a correct-but-undeducible one alike, and must
not leak which), `.suspect` is `.card-ref`, and — the actual defect — the two
`<b>` tags printed the DSL's own `not_numberwang` at the player. A `VERDICT`
map now speaks them. The completion banner also read "1 mistakes"; it counts in
English now.

- [x] **Step 6: Run the tests to verify they pass**

Run: `npx vitest run site/src/screens/Game.test.tsx`
Expected: PASS

- [x] **Step 7: Run the whole suite**

Run: `npx tsc --noEmit && npm test`
Expected: PASS

- [x] **Step 8: Play a board to the end**

Run: `npm run dev`, solve a whole puzzle including at least one wrong call and one
hint. Check the modal, the rejection popup, the completion screen and the copied
share text all read as this game.

*Done* through the headless screenshot loop rather than `npm run dev`: seeded
2026-09-11 nineteen cards deep, called the last one, and read the results popup
("Solved in 04:02", the share grid, the solved banner) off the screenshot.

- [x] **Step 9: Commit**

```bash
git add -A
git commit -m "Call it Numberwang or Wangernumb

Each verdict button is cued by a border in the colour of the card it produces,
and the two stack rather than sitting side by side, which leaves each of them a
full row to be read in. (Written here as a fill; filled buttons either side of
the card's number read as two more cards rather than as two choices about one,
so the fill moved to the hover state in the round of tweaks after this task.)

The modal repeats the card's colour band. It covers the board while it is open,
so without it a clue about a colour group cannot be checked against the card you
are about to call."
```

---

### Task 5: Delete the board-fitting machinery

`cbsbd` scales boards wider than four columns to fit a phone, in about ninety
lines of `Game.tsx` and a measuring observer, all of it argued out against Safari
in a comment worth reading. Numberwang is four columns wide, always. The
stylesheet's two narrow breakpoints were measured on exactly this board and are
the right thing to leave in charge of it.

**Files:**
- Modify: `site/src/screens/Game.tsx`, `site/src/styles.css`
- Test: `site/src/screens/Game.test.tsx`

**Interfaces:**
- Consumes: nothing
- Produces: `Game.tsx` with no `useFitBoard`, no `ResizeObserver`, and no `.board-fit` wrapper

- [ ] **Step 1: Read the comment you are about to delete**

Run: `grep -n 'NARROW_COLS' -B4 -A95 site/src/screens/Game.tsx`

It documents four real findings: WebKit will not draw text below 9px so `zoom`
cannot get under it; a transform paints smaller without shrinking its box; a
negative `margin-bottom` will not shrink an inline-block's line box; an
inline-level box contributes its *unscaled* size to scrollable overflow. None of
it applies to a 4-wide board, which fits without scaling. All of it is worth
knowing if a later Numberwang ever grows a board — so quote the load-bearing part
into the commit message rather than letting `git log` be the only record.

- [ ] **Step 2: Write the failing test**

Add to `site/src/screens/Game.test.tsx`, and delete the whole
`describe('board width')` block it replaces — every test in that block exercises
the machinery this task removes:

```tsx
it('renders the board at its natural size, with no fitting wrapper', async () => {
  await renderGame();
  expect(document.querySelector('.board-fit')).toBeNull();
  const wrap = document.querySelector('.board-wrap') as HTMLElement;
  expect(wrap.style.transform).toBe('');
  expect(wrap.style.zoom).toBe('');
});
```

- [ ] **Step 3: Run it to verify it fails**

Run: `npx vitest run site/src/screens/Game.test.tsx -t 'natural size'`
Expected: FAIL — `.board-fit` is in the tree.

- [ ] **Step 4: Delete it**

From `Game.tsx`: the `NARROW_COLS` constant, the whole `useFitBoard` hook with its
comment, its `useRef`/`useState`/`ResizeObserver`, and the `.board-fit` element,
leaving `.board-wrap` wrapping `<Grid>` directly.

From `styles.css`: the `.board-fit` rule. Keep `.board-wrap`, keep both narrow
breakpoints (`max-width: 369px` and `max-width: 344px`) — they were measured on a
4x5 and this is a 4x5.

Also drop the `style={{ gridTemplateColumns: ... }}` from `Grid.tsx` in favour of
the stylesheet, since the column count is now a constant of the game:

```css
.grid {
  display: grid;
  grid-template-columns: repeat(4, auto);
  gap: 5px;
  justify-content: center;
  padding-top: 2px;
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx tsc --noEmit && npm test`
Expected: PASS. `puzzle.width` may now be unused in `Grid.tsx` — it is still
needed by `clueReferencedIndices` and `gridLabel`, so check before removing the
prop.

- [ ] **Step 6: Check the two narrow widths for real**

Run `npm run dev` and use the browser's device toolbar at 375px, 360px and 340px
wide. Expected: the board fits at each, no horizontal scrollbar, the mark pickers
on the right-hand column still reachable.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "Drop the board-fitting machinery: this board is always 4 wide

cbsbd scales any board wider than four columns to fit a phone, in ninety lines
and a ResizeObserver. Numberwang has one board size and it is the size those
were measured against, so the stylesheet's two narrow breakpoints are back in
sole charge.

Worth keeping from the deleted comment, if a later Numberwang ever grows a
board: zoom cannot scale text below 9px because WebKit will not draw text
smaller than that, so the fit has to be a transform; a transform paints smaller
without shrinking its box, so the box needs sizing separately; a negative
margin-bottom will not shrink the line box an inline-block sits in; and an
inline-level box contributes its unscaled size to scrollable overflow, so the
outer box has to be a block or the page offers hundreds of pixels of empty
scroll."
```

---

### Task 6: The archive and the copy

Task 1 removed the source filter to make the code compile. This task finishes the
screen: the copy that explained the filter, the difficulty test whose fixture went
with it, and the document head.

**Files:**
- Modify: `site/src/screens/Archive.tsx`, `site/src/styles.css`, `site/index.html`
- Test: `site/src/screens/Archive.test.tsx`, `site/src/screens/archiveData.test.ts`

**Interfaces:**
- Consumes: `ManifestEntry` and `ArchiveFilters` as Task 1 left them
- Produces: an archive with exactly two filters, entries keyed and linked by date

- [ ] **Step 1: Write the failing tests**

`Archive.test.tsx` renders with a bare `render(<Archive />)` against a
module-level `manifest` served by a stubbed `fetch`; there is no render helper.
Add:

```tsx
it('offers difficulty and status filters, and no source filter', async () => {
  render(<Archive />);
  await screen.findByText('July 2026');
  expect(screen.getByLabelText(/difficulty/i)).toBeTruthy();
  expect(screen.getByLabelText(/status/i)).toBeTruthy();
  expect(screen.queryByLabelText(/source/i)).toBeNull();
});

it('links each entry to its date', async () => {
  render(<Archive />);
  await screen.findByText('July 2026');
  expect(screen.getAllByRole('link')[0].getAttribute('href')).toBe('#/play/2026-07-03');
});

it('says that difficulty is measured rather than aimed at', async () => {
  render(<Archive />);
  expect((await screen.findByText(/measured, not aimed at/)).className).toContain('arch-note');
});

// Restores the coverage deleted in Task 1, whose fixture was all variant rows.
it('lists difficulty options from Easy to Brutal regardless of manifest order', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn(
      async () =>
        new Response(
          JSON.stringify([
            { date: '2026-07-03', id: 'c', difficulty: 'Brutal', title: 'Third', width: 4, height: 5 },
            { date: '2026-07-02', id: 'b', difficulty: 'Tricky', title: 'Second', width: 4, height: 5 },
            { date: '2026-07-01', id: 'a', difficulty: 'Easy', title: 'First', width: 4, height: 5 },
          ]),
          { status: 200 },
        ),
    ),
  );
  render(<Archive />);
  await screen.findByText('July 2026');
  const options = within(screen.getByLabelText(/difficulty/i)).getAllByRole('option');
  expect(options.map((o) => o.textContent)).toEqual(['All', 'Easy', 'Tricky', 'Brutal']);
});
```

And in `archiveData.test.ts`, pinning the filter shape Task 1 cut down to:

```ts
it('takes no variant filter', () => {
  // @ts-expect-error variant is not part of the archive any more
  filterEntries([], { variant: 'real' });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run site/src/screens/`
Expected: FAIL on the note (nothing in the tree has `.arch-note`) and on the
difficulty options (Task 1 deleted that test). The other two should already pass —
they assert what Task 1 built, and a test that cannot fail first is worth knowing
about.

- [ ] **Step 3: Finish the archive screen**

`cbsbd`'s archive explains that a generated puzzle's difficulty is the source's
label for the puzzle it is a sibling of. That relationship does not exist here.
Replace the note with what is true, above the year sections:

```tsx
        <p className="arch-note">
          Difficulty is measured, not aimed at. The bands come from Clues by Sam's
          own puzzles, so treat the label as a rough guide to a board nobody has
          played yet rather than a promise.
        </p>
```

```css
.arch-note {
  margin: 0 0 14px;
  font-size: 12px;
  opacity: 0.62;
}
```

Delete the `.arch-source` rule from `styles.css` — Task 1 deleted the only element
that ever carried the class.

- [x] **Step 4: Rewrite the document head**  *(done early, out of task order:
the player asked for the title while Task 4 was in hand, and the umami script
went with it rather than being left pointing at cbsbd for another commit.)*

Replace `site/index.html`'s head, keeping the module script tag and the root div:

```html
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <link
      rel="icon"
      href="data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 100 100%22><text y=%22.9em%22 font-size=%2290%22>🔢</text></svg>"
    />
    <meta property="og:title" content="Numberwang" />
    <meta
      property="og:description"
      content="A daily logic puzzle. Twenty numbers, eight colours — work out which ones are Numberwang."
    />
    <meta name="color-scheme" content="dark" />
    <meta name="supported-color-schemes" content="dark" />
    <meta name="robots" content="noindex" />
    <title>Numberwang</title>
```

The umami `<script>` is deliberately absent. It carried cbsbd's own website id,
so leaving it in would file this game's traffic under that one — and nobody asked
for analytics here.

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run site/src/screens/`
Expected: PASS

- [ ] **Step 6: Run the whole suite and sweep for stale copy**

```bash
npx tsc --noEmit && npm test
grep -rni 'clues by sam\|cbs\b\|suspect\|criminal' site/src site/index.html
```

Every hit should be either a class name that is not player-facing or a deliberate
reference to the parent game (the archive note above is one). Fix the rest.

- [ ] **Step 7: Look at the archive**

Run: `npm run generate && npm run manifest && npm run dev` and open the archive.
Expected: puzzles grouped by year and month, two working filters, statuses that
reflect what you have played, and every link opening its board.

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "Trim the archive to one puzzle a day, and rewrite the copy

The source filter went with the variants it filtered: there is one puzzle per
date and nothing to distinguish it from. Its billing note went too — it explained
that a generated puzzle borrowed the difficulty of the real puzzle it was a
sibling of, and there are no real puzzles here.

No analytics script. The inherited one carried cbsbd's own website id, so keeping
it would have filed this game's traffic under that one."
```

---

### Task 7: Deploy to Pages

**Files:**
- Create: `.github/workflows/pages.yml`
- Modify: `README.md`

**Interfaces:**
- Consumes: `npm run build`; `puzzles/` and `puzzles/index.json`
- Produces: a Pages deploy serving the app at `/numberwang/` with its puzzles alongside

- [ ] **Step 1: Confirm the production build works and is correctly based**

```bash
npm run build
grep -o '/numberwang/assets/[^"]*' site/dist/index.html | head
```
Expected: asset paths under `/numberwang/`. A path starting `/assets/` means the
base did not apply and every asset will 404 on Pages.

- [ ] **Step 2: Write the workflow**

Take `/Users/dan/code/cbsbd3d/.github/workflows/pages.yml` as the base. It must:
checkout, set up Node, `npm ci`, `npm run build`, **copy `puzzles/` into
`site/dist/puzzles/`**, upload `site/dist` as the Pages artifact, deploy.

That copy step is the one to get right. In dev the `servePuzzles` plugin serves
`puzzles/` from the repo root; in production nothing does, so the deploy has to
place the files at the same path the app fetches — `<base>puzzles/`. Miss it and
the app builds, deploys, and every board fails to load.

- [ ] **Step 3: Verify the workflow parses and its build output is complete**

```bash
node --input-type=module -e "
import { readFileSync } from 'node:fs';
import { parse } from 'yaml';
console.log(Object.keys(parse(readFileSync('.github/workflows/pages.yml','utf8')).jobs));
"
```
Expected: the job names print.

Then rehearse the artifact locally, exactly as the workflow builds it, and serve
it as Pages would:

```bash
rm -rf site/dist && npm run build && mkdir -p site/dist/puzzles && cp puzzles/*.json site/dist/puzzles/
npx vite preview
```
Open the previewed URL at `/numberwang/`. Expected: the archive lists puzzles and
a board opens and plays. This catches the missing-puzzles mistake before a deploy
does.

- [ ] **Step 4: Update the README**

Add to what the generator plan's README already says: `npm run dev` for the app,
`npm run build` for the artifact, that the app reads `puzzles/` through a
dev-only Vite plugin and that the deploy copies the same directory into the
artifact, and that the site is served at `/numberwang/` with no UUID.

State the three card states and their colours, and that the colour band is plain
by choice — with a pointer to the spec's note that a named band is the first
thing to add back if identifying colours turns out to be a friction in play.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "Build and deploy the app to Pages at /numberwang/

The deploy copies puzzles/ into the artifact. In dev a Vite plugin serves that
directory from the repo root and in production nothing does, so without the copy
the site builds and deploys clean and then fails to load a single board."
```

- [ ] **Step 6: Push, and check the deployed site**

```bash
git push
```
Wait for both workflows, then open the Pages URL. Play a board start to finish on
a phone-sized window. This is the first time the whole thing runs as a player
will meet it.

---

## Self-Review

**Spec coverage.** Play — some cards start revealed, a clue hidden until its card
is solved, one solution → inherited unchanged, Tasks 1 and 3. Card appearance,
three states with the approved colours → Global Constraints and Task 2. Plain
top band present in all three states → Task 2. `has_trait` reading "17 is
Numberwang" → Task 3 Step 5's first test. Colour groups as clue units → Task 3.
Board 4x5 → Global Constraints, Task 5. Deploy at `/numberwang/` with no UUID →
Tasks 1 and 7. Archive screen kept → Task 6. Numbers 1..20 and eight colours →
the generator's business; the app renders what it is given.

**Two spec items this plan adds to.**

1. The spec says the band carries no text and records a named band as the first
   thing to add back. Task 2 puts the colour name in `aria-label` — not text on
   the card, and not a design change, but without it nothing on the card names
   the group for anyone who cannot see the strip. The visible card is exactly as
   approved.
2. The spec does not mention analytics. `cbsbd`'s `index.html` carries a umami
   script keyed to cbsbd's own site, which would misfile this game's traffic, so
   Global Constraints and Task 6 drop it.

**One inherited hazard, deliberately left alone.** The player's own corner marks
(`TAG_COLORS`) are yellow, red, green, orange, magenta, cyan, and five of those
names also name colour groups. A red mark on a red-banded card is a real
confusion. They are left as they are because the two live in different places —
a corner dot versus a strip across the top — and renaming the marks would change
a mechanic the spec says is unchanged. Worth watching in play; if it bites, the
cheap fix is marks as shapes rather than colours.

**Type consistency.** `Guess` is `'numberwang' | 'not_numberwang'` from Task 1
onward, and Task 4's modal passes exactly those. `Route` and `parseHash` keep
their Task 1 signatures. `Card`'s four reference props are `numberReferenced`,
`colourReferenced`, `numberBounce`, `colourBounce` in Task 2 and are what Task 3
Step 9 passes. `clueReferencedIndices` returns `{ numbers, colours }` in Task 3
and Task 3 Step 9 reads those two fields. The `colour` `ClueSegment` variant is
`{ kind: 'colour'; word; plural; counted }` in Task 3 Step 3 and is consumed
under that shape in Step 7. `ManifestEntry` has no `variant` and no `slug`
anywhere in this plan, matching the generator plan's Task 11. CSS custom
properties `--colour-<name>`, `--card-numberwang`, `--card-not` are defined in
Task 2 Step 5 and reused in Task 4 Step 4. `ArchiveFilters` is
`{ difficulty?, status? }` from Task 1 and Task 6 pins it there. The class
`not-numberwang` is hyphenated everywhere; the trait token `not_numberwang` is
underscored everywhere; they are never interchanged.

**Fixture consistency.** Every test in this plan uses the idiom its file already
has: `Game.test.tsx`'s `renderGame(user?)` over a module-level `puzzle` and a
stubbed `fetch`, `Archive.test.tsx`'s bare `render(<Archive />)` over a
module-level `manifest`, and `ClueText.test.tsx`'s `renderClue(clue, opts)`. Only
`Card.test.tsx` is new, and it is the one file that defines its own helpers. This
is worth stating because the first draft of this plan invented a factory helper
per file, and none of them exist.

**Ordering.** Task 1 leaves the board deliberately unstyled — the TSX emits
`.numberwang` while the stylesheet still defines `.criminal` — and says so in its
own commit message. That is the one task whose deliverable is not something you
would want to look at. Every later task ends with the app both green and worth
opening.
