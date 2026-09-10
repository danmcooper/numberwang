/**
 * Independent audit of every generated puzzle in `puzzles/`.
 *
 * Deliberately re-derives everything from the puzzle file alone rather than
 * trusting anything the generator recorded: it re-parses the `origHint`
 * strings, re-solves from scratch, and re-measures difficulty. A puzzle that
 * passes here is playable and fair no matter what the generator believed.
 *
 * Run: npm run audit [puzzlesDir] [--no-rederive] [--recent=N]
 * Exits non-zero if any check fails on any file.
 */
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import mixData from '../config/clue-mix.json' with { type: 'json' };
import bandData from '../config/difficulty.json' with { type: 'json' };
import { type Puzzle, validatePuzzle } from '../shared/puzzle.ts';
import { namedCards } from '../shared/solver/candidates.ts';
import type { Bands } from '../shared/solver/difficulty.ts';
import { bandsFor, classify, loadBands, measure } from '../shared/solver/difficulty.ts';
import type { Shape } from '../shared/solver/enumerate.ts';
import { colourShapesFor } from '../shared/solver/generate.ts';
import { makeGrid, neighbors } from '../shared/solver/grid.ts';
import { loadMix } from '../shared/solver/mix.ts';
import { makeBoard, unitMembers } from '../shared/solver/predicates.ts';
import {
  type Clues,
  forcedGiven,
  isUniquelySolvable,
  parseClues,
  solveChain,
} from '../shared/solver/solve.ts';
import { buildPuzzle } from './generate.mts';

/** Only dated files are puzzles; there are no variants and no one-offs. */
const PUZZLE_FILE = /^\d{4}-\d{2}-\d{2}\.json$/;

/**
 * How hard one predicate may be leaned on, measured over the puzzles the bands
 * were fitted from: the worst spends 7 of its 14 clue cards on
 * `unit_shares_n_out_of_n_traits`. Counted as a share, because a threshold
 * counted in cards means nothing on a board of another size; floored at the
 * absolute figure so the two readings agree at 14 clue cards.
 */
const ABSOLUTE_PRED_CAP = 7;
const WORST_PRED_SHARE = 0.5;

/** Counts these families never word: "0 persons in a corner have an innocent
 * directly above them" floors at 1 across all 41 real instances. */
const DIR_FAMILIES = new Set([
  'n_in_unit_have_trait_in_dir',
  'n_t_in_unit_have_trait_in_dir',
  'n_colours_have_trait_in_dir',
]);

interface Loaded {
  file: string;
  puzzle: Puzzle;
  shape: Shape;
  clues: Clues;
  truth: boolean[];
}

function load(file: string, puzzle: Puzzle): Loaded {
  return {
    file,
    puzzle,
    shape: {
      grid: makeGrid(puzzle.width, puzzle.height),
      colours: puzzle.people.map((p) => p.colour),
      numbers: puzzle.people.map((p) => p.number),
    },
    clues: parseClues(puzzle.people.map((p) => p.origHint)),
    truth: puzzle.people.map((p) => p.numberwang),
  };
}

/** Returns one message per failed check; empty means the puzzle is sound. */
export function auditPuzzle(l: Loaded, bands: Bands, shapes: Set<string>): string[] {
  const bad: string[] = [];
  const { puzzle, shape, clues, truth } = l;
  const size = shape.grid.size;

  if (`${puzzle.date}.json` !== l.file) bad.push(`date ${puzzle.date} does not match filename`);
  if (puzzle.source !== 'generated') bad.push(`source is ${puzzle.source}, expected 'generated'`);

  // Fairness. The strict form: every card recoverable from clue text alone,
  // with nothing handed to the player up front.
  if (!isUniquelySolvable(shape, clues, truth)) {
    bad.push('not uniquely solvable from zero reveals');
  }
  if (!solveChain(shape, clues, truth, puzzle.initialReveals).solvedAll) {
    bad.push('deduction chain stalls before every card is revealed');
  }

  // No guessing: each non-initial card must carry at least one stored path, and
  // every stored path must actually suffice to deduce that card.
  const initial = new Set(puzzle.initialReveals);
  for (let i = 0; i < size; i++) {
    if (initial.has(i)) continue;
    const paths = puzzle.people[i].paths;
    if (paths === null || paths.length === 0) {
      bad.push(`card ${i} has no path — the player would have to guess it`);
      continue;
    }
    for (const flipped of paths) {
      if (forcedGiven(shape, clues, truth, flipped)[i] !== truth[i]) {
        bad.push(`card ${i}: stored path [${flipped.join(',')}] does not deduce it`);
      }
    }
  }

  // A hint has to be a deduction the player can act on: the sentences a step
  // outlines must deduce exactly the cards it names. A card it forces but
  // leaves unnamed hides a deduction already earned; one it names but does not
  // force offers a reveal the board will not support.
  const hintable = new Set<number>();
  for (const step of puzzle.hints ?? []) {
    const where = `hint for card ${step.reveals.join(',')}`;
    if (step.reveals.length === 0) bad.push(`${where}: names no card at all`);
    for (const target of step.reveals) {
      hintable.add(target);
      if (step.flipped.includes(target)) bad.push(`${where}: needs its own answer flipped first`);
    }
    for (const i of step.clues) {
      if (!step.flipped.includes(i)) bad.push(`${where}: outlines clue ${i}, not a prerequisite`);
      if (clues[i] === null) bad.push(`${where}: outlines card ${i}, which carries no clue`);
    }
    const outlined = clues.map((h, j) => (step.clues.includes(j) ? h : null));
    const forced = forcedGiven(shape, outlined, truth, step.flipped);
    const actually = forced.flatMap((v, i) => (v !== null && !step.flipped.includes(i) ? [i] : []));
    if (`${actually}` !== `${[...step.reveals].sort((a, b) => a - b)}`) {
      bad.push(`${where}: its outlined clues deduce ${actually.join(',') || 'nothing'} instead`);
    }
  }
  for (let i = 0; i < size; i++) {
    if (!initial.has(i) && !hintable.has(i)) bad.push(`card ${i} has no hint step`);
  }
  if (!(puzzle.hints ?? []).some((s) => s.flipped.every((i) => initial.has(i)))) {
    bad.push('no hint is available from the opening position');
  }

  // The numbers must be a permutation of 1..size. `validatePuzzle` proves that
  // too, but this file exists to re-derive rather than to trust, and the
  // arithmetic clues are only meaningful against a board that has every number
  // exactly once.
  const numbers = [...shape.numbers].sort((a, b) => a - b);
  if (numbers.join(',') !== Array.from({ length: size }, (_, i) => i + 1).join(',')) {
    bad.push('numbers are not a permutation of 1..size');
  }

  const board = makeBoard(shape.grid, shape.colours, shape.numbers, truth);
  for (let i = 0; i < size; i++) {
    const hint = clues[i];
    if (!hint) continue;

    // A clue may not name the card it sits on.
    if (namedCards(board, hint).has(i)) bad.push(`card ${i}: its own clue refers to it`);

    // "Only 1 of the 1 criminals ... is ..." reads as a slip and duplicates
    // `both_traits_in_unit_are_in_unit`; every real instance has shared < total.
    if (hint.pred === 'unit_shares_n_out_of_n_traits_with_unit') {
      const [shared, total] = hint.args.slice(3);
      if (shared.t === 'num' && total.t === 'num' && shared.n >= total.n) {
        bad.push(`card ${i}: clue shares all ${total.n} of the unit's traits`);
      }
    }
    if (DIR_FAMILIES.has(hint.pred)) {
      const count = hint.args[hint.args.length - 1];
      if (count.t === 'num' && count.n === 0) bad.push(`card ${i}: directional clue counts zero`);
    }
    if (hint.pred === 'is_one_of_n_traits_in_unit') {
      const [unit, , , count] = hint.args;
      if (count.t === 'num' && count.n < 2) bad.push(`card ${i}: clue says "one of 1"`);
      // Naming one member of a unit whose members all share the trait tells the
      // player nothing: unit membership is visible, so "Cleo is one of
      // Desmond's 3 innocent neighbors" only says Desmond's neighbors are
      // innocent, with Cleo dressed up as a distinction she does not have.
      if (unit.t === 'unit' && count.t === 'num') {
        const members = unitMembers(board, unit.unit);
        if (count.n >= members.length) {
          bad.push(`card ${i}: names one of all ${members.length} of the unit`);
        }
      }
    }
    // Asking whether traits are "neighbors" inside a unit whose cards are all
    // mutually adjacent tells the player nothing — every subset of such a unit
    // is connected.
    if (
      hint.pred === 'both_traits_are_neighbors_in_unit' ||
      hint.pred === 'all_traits_are_neighbors_in_unit'
    ) {
      const arg0 = hint.args[0];
      if (arg0.t === 'unit') {
        const m = unitMembers(board, arg0.unit);
        if (m.every((x) => m.every((y) => x === y || neighbors(shape.grid, x).includes(y)))) {
          bad.push(`card ${i}: asks for connectedness among ${m.length} mutually adjacent cards`);
        }
      }
    }
  }

  // Real casts run seven to eleven colours in ragged groups of mostly two
  // and three. Requiring an exact refitted shape is stricter than it has to be,
  // but generation samples one wholesale, so anything else means the sampler
  // broke.
  const groups = new Map<string, number>();
  for (const p of puzzle.people) groups.set(p.colour, (groups.get(p.colour) ?? 0) + 1);
  const castShape = [...groups.values()].sort((a, b) => b - a).join(',');
  if (!shapes.has(castShape)) {
    bad.push(`colour shape [${castShape}] is not one refitted from a real puzzle`);
  }

  // No puzzle should lean on one predicate harder than any real one does.
  // Generation soft-caps at 2; this is the backstop.
  const clued = clues.filter((h) => h !== null).length;
  const cap = Math.max(ABSOLUTE_PRED_CAP, Math.floor(WORST_PRED_SHARE * clued));
  const perPred = new Map<string, number>();
  for (const hint of clues) if (hint) perPred.set(hint.pred, (perPred.get(hint.pred) ?? 0) + 1);
  for (const [pred, n] of perPred) {
    if (n > cap) {
      bad.push(`uses ${pred} ${n} of ${clued} clues — no real puzzle leans past ${cap} here`);
    }
  }

  // The stored difficulty must be the one the puzzle's own metrics earn.
  // Generation labels rather than aims, so the invariant worth checking is that
  // the label on disk is reproducible from the puzzle itself.
  if (!bands[puzzle.difficulty]) {
    bad.push(`difficulty ${puzzle.difficulty} has no calibrated band`);
  } else {
    const metrics = measure({
      shape,
      clues,
      truth,
      initialReveals: puzzle.initialReveals,
      paths: puzzle.people.map((p) => p.paths),
    });
    const earned = classify(bandsFor(bands, size), metrics);
    if (earned !== puzzle.difficulty) {
      bad.push(
        `labelled ${puzzle.difficulty} but its metrics classify as ${earned}: ` +
          `clueCards=${metrics.clueCards} chainLength=${metrics.chainLength} ` +
          `abstractShare=${metrics.abstractShare.toFixed(2)} ` +
          `meanPathSize=${metrics.meanPathSize.toFixed(2)}`,
      );
    }
  }

  return bad;
}

/** Rebuild a date from its filename and compare. One message if it differs. */
function auditDerivation(l: Loaded): string[] {
  const date = l.file.slice(0, -'.json'.length);
  return JSON.stringify(buildPuzzle(date)) === JSON.stringify(l.puzzle)
    ? []
    : ['does not rebuild from its own filename — the generator has changed under it'];
}

export interface AuditOptions {
  /** Rebuild every date from its filename. On by default; it is the strongest
   * check here and also much the slowest. */
  rederive?: boolean;
  /**
   * Audit only the `recent` newest dates. The archive only grows, and a puzzle
   * is audited on the night it is written and never edited afterwards, so a
   * nightly run that re-derives the whole archive spends longer every day
   * re-proving the same files. Left undefined, everything is checked — which is
   * what a local run before a release should do.
   */
  recent?: number;
  onProgress?: (event: { file: string; failures: string[] }) => void;
}

export async function auditAll(
  dir: string,
  opts: AuditOptions = {},
): Promise<{ checked: number; failures: string[] }> {
  const bands = loadBands(bandData);
  const mix = loadMix(mixData);

  const all = (await readdir(dir)).filter((f) => PUZZLE_FILE.test(f)).sort();
  const files = opts.recent === undefined ? all : all.slice(Math.max(0, all.length - opts.recent));
  const shapeCache = new Map<number, Set<string>>();
  const shapesFor = (size: number) => {
    let set = shapeCache.get(size);
    if (!set) {
      set = new Set(colourShapesFor(mix.colourShapes, size).map((s) => s.join(',')));
      shapeCache.set(size, set);
    }
    return set;
  };

  const failures: string[] = [];
  for (const file of files) {
    const bad: string[] = [];
    let loaded: Loaded | null = null;
    try {
      loaded = load(file, validatePuzzle(JSON.parse(await readFile(path.join(dir, file), 'utf8'))));
    } catch (e) {
      bad.push(String(e));
    }
    if (loaded) {
      bad.push(...auditPuzzle(loaded, bands, shapesFor(loaded.shape.grid.size)));
      if (opts.rederive !== false) bad.push(...auditDerivation(loaded));
    }
    opts.onProgress?.({ file, failures: bad });
    failures.push(...bad.map((m) => `${file}: ${m}`));
  }
  return { checked: files.length, failures };
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  const args = process.argv.slice(2);
  const dir = args.find((a) => !a.startsWith('--')) ?? path.join(process.cwd(), 'puzzles');
  const recent = Number(args.find((a) => a.startsWith('--recent='))?.slice('--recent='.length));
  if (args.some((a) => a.startsWith('--recent=')) && !Number.isInteger(recent)) {
    console.error('usage: npm run audit [puzzlesDir] [--no-rederive] [--recent=N]');
    process.exit(2);
  }
  auditAll(path.resolve(dir), {
    rederive: !args.includes('--no-rederive'),
    recent: Number.isInteger(recent) ? recent : undefined,
    onProgress: ({ file, failures }) => {
      if (failures.length === 0) console.log(`ok   ${file}`);
      else for (const m of failures) console.error(`FAIL ${file}: ${m}`);
    },
  }).then(
    ({ checked, failures }) => {
      console.log(`\n${checked} checked, ${failures.length} failures`);
      if (failures.length) process.exit(1);
    },
    (e) => {
      console.error(String(e));
      process.exit(1);
    },
  );
}
