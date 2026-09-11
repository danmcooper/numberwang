/**
 * Generates one puzzle at the shipped 4x5 size and checks it is sound.
 *
 * The test suite generates on a 4x4 board, because solving enumerates all
 * 2^(width*height) assignments and 4x5 is sixteen times dearer — that is what
 * keeps `npm test` in seconds. Nothing in generation is 4x5-specific, but "not
 * specific" is an argument, not evidence, so this runs the real thing: the real
 * shipped clue mix, the real calibrated bands, the real board.
 *
 * Opt-in (`npm run test:generate`), and worth a minute before regenerating the
 * archive with `npm run generate`.
 *
 *   npm run test:generate              # aims at Medium, seed 1, on the 4x5 board
 *   npm run test:generate Brutal 7     # aims at a given label and seed
 *   npm run test:generate Medium 1 5x6 # on a board other than the shipped one
 */
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import mixData from '../config/clue-mix.json' with { type: 'json' };
import { validatePuzzle } from '../shared/puzzle.ts';
import { loadMix, withArithBudgets } from '../shared/solver/mix.ts';
import { bandsFor, classify, loadBands, measure } from '../shared/solver/difficulty.ts';
import { generatePuzzle } from '../shared/solver/generate.ts';
import { offeredShapes } from '../shared/solver/vocab.ts';
import { makeGrid } from '../shared/solver/grid.ts';
import { parseHint } from '../shared/solver/hint.ts';
import { forcedGiven, isUniquelySolvable, parseClues, solveChain } from '../shared/solver/solve.ts';

const [label = 'Medium', seedArg, boardArg = '4x5'] = process.argv.slice(2);
const seed = Number(seedArg ?? 1);
const board = /^(\d+)x(\d+)$/.exec(boardArg);
if (!board) {
  console.error(`board must look like 4x5, got ${boardArg}`);
  process.exit(2);
}
const [width, height] = [Number(board[1]), Number(board[2])];

const bands = loadBands(
  JSON.parse(await readFile(path.join(process.cwd(), 'config', 'difficulty.json'), 'utf8')),
);
const band = bands[label];
if (!band) {
  console.error(`no calibrated band for ${label} — have ${Object.keys(bands).join(', ')}`);
  process.exit(2);
}

const mix = withArithBudgets(loadMix(mixData));
// Bands are calibrated on the archive's 4x5 board; on any other board they have
// to be refitted to it before a label off them means anything.
const boardBands = bandsFor(bands, width * height);
const startedAt = Date.now();
const { puzzle, metrics } = generatePuzzle({
  date: '2026-01-01',
  difficulty: label,
  band,
  seed,
  mix,
  width,
  height,
  labelOf: (m) => classify(boardBands, m),
});
const seconds = (Date.now() - startedAt) / 1000;

const failures: string[] = [];
const check = (ok: boolean, what: string) => {
  if (!ok) failures.push(what);
};

try {
  validatePuzzle(puzzle);
} catch (e) {
  failures.push(`schema: ${(e as Error).message}`);
}

check(
  puzzle.width === width && puzzle.height === height,
  `board is ${puzzle.width}x${puzzle.height}, not ${boardArg}`,
);

const shape = {
  grid: makeGrid(puzzle.width, puzzle.height),
  colours: puzzle.people.map((p) => p.colour),
  numbers: puzzle.people.map((p) => p.number),
};
const clues = parseClues(puzzle.people.map((p) => p.origHint));
const truth = puzzle.people.map((p) => p.numberwang);
check(isUniquelySolvable(shape, clues, truth), 'not uniquely solvable');
check(solveChain(shape, clues, truth, puzzle.initialReveals).solvedAll, 'chain does not solve every card');

puzzle.people.forEach((person, i) => {
  if (!puzzle.initialReveals.includes(i)) {
    check((person.paths ?? []).length > 0, `card ${i} has no sufficient path`);
  }
  // (?!\d) so "#NAMES:1" does not match a clue that names card 11.
  if (person.clue) {
    check(!new RegExp(`#NAMES?:${i}(?!\\d)`).test(person.clue), `card ${i} hosts a clue about itself`);
  }
});

// Hints have to be deductions the player can act on: every card the step claims
// deducible from the sentences it outlines and nothing else, no card it forces
// left unnamed, and at least one offer available from the opening position.
// Shipping solveChain's rounds verbatim satisfied none of it.
const hints = puzzle.hints ?? [];
const hintable = new Set(hints.flatMap((s) => s.reveals));
const forcedBy = (s: (typeof hints)[number]) => {
  const outlined = clues.map((h, j) => (s.clues.includes(j) ? h : null));
  const forced = forcedGiven(shape, outlined, truth, s.flipped);
  return forced.flatMap((v, i) => (v !== null && !s.flipped.includes(i) ? [i] : []));
};
check(
  hints.every((s) => `${forcedBy(s)}` === `${[...s.reveals].sort((a, b) => a - b)}`),
  "a hint's outlined clues do not deduce exactly the cards it names",
);
check(
  puzzle.people.every((_, i) => puzzle.initialReveals.includes(i) || hintable.has(i)),
  'some card has no hint step',
);
check(
  hints.some((s) => s.flipped.every((i) => puzzle.initialReveals.includes(i))),
  'no hint is available from the opening position',
);

// The stored label has to be reproducible from the puzzle's own metrics — the
// same invariant scripts/audit.mts enforces across the whole archive.
check(puzzle.difficulty === classify(boardBands, metrics), `label ${puzzle.difficulty} is not what its metrics classify as`);
const remeasured = measure({
  shape,
  clues,
  truth,
  initialReveals: puzzle.initialReveals,
  paths: puzzle.people.map((p) => p.paths ?? []),
});
check(classify(boardBands, remeasured) === puzzle.difficulty, 'label does not survive re-measuring the written puzzle');

// The cast's colour grouping has to be one the generator was offered: an
// archived shape that seats this board in eight colours or fewer.
const groups = new Map<string, number>();
for (const person of puzzle.people) groups.set(person.colour, (groups.get(person.colour) ?? 0) + 1);
const castShape = [...groups.values()].sort((a, b) => b - a).join(',');
const offered = new Set(offeredShapes(mix, width * height).map((s) => s.join(',')));
check(offered.has(castShape), `colour shape [${castShape}] is not one of the offered shapes`);

// Numbers are how a clue points at a card, and the arithmetic clues add them
// up, so the board has to carry each of 1..N exactly once.
const numbers = [...shape.numbers].sort((a, b) => a - b);
check(
  numbers.join(',') === Array.from({ length: numbers.length }, (_, i) => i + 1).join(','),
  'numbers are not a permutation of 1..N',
);

const preds = new Map<string, number>();
for (const person of puzzle.people) {
  if (person.origHint) preds.set(parseHint(person.origHint).pred, (preds.get(parseHint(person.origHint).pred) ?? 0) + 1);
}

console.log(
  [
    `aimed at ${label}, seed ${seed}, ${boardArg} — generated in ${seconds.toFixed(1)}s`,
    `labelled ${puzzle.difficulty}: ${metrics.numberwangs} numberwangs, ${metrics.clueCards} clues, ` +
      `chain ${metrics.chainLength}, abstract share ${metrics.abstractShare.toFixed(2)}`,
    `cast [${castShape}], ${preds.size} distinct predicates, worst repeat ${Math.max(...preds.values())}`,
  ].join('\n'),
);

if (failures.length > 0) {
  console.error(`\nFAIL\n  ${failures.join('\n  ')}`);
  process.exit(1);
}
console.log('\nOK');
