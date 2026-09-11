import { type Person, type Puzzle, validatePuzzle } from '../puzzle';
import { candidateHints, namedCards } from './candidates';
import type { ClueMix } from './mix';
import {
  ABSTRACT_PREDICATES,
  type LabelBand,
  type Metrics,
  bandsFor,
  gatesPass,
  measure,
} from './difficulty';
import type { Shape } from './enumerate';
import { type Grid, edgeMembers, makeGrid } from './grid';
import { type Hint, formatHint } from './hint';
import { type Board, hintFeatures, makeBoard } from './predicates';
import { render } from './render';
import {
  type Clues,
  forcedGiven,
  hintSteps,
  isUniquelySolvable,
  minimalPaths,
  solveChain,
} from './solve';
import { FLAVOUR, TITLES, colourShapeFor, coloursFor, numbersFor } from './vocab';

/** Every archived puzzle is 4x5, and so is every puzzle we ship. */
const DEFAULT_WIDTH = 4;
const DEFAULT_HEIGHT = 5;
const DEFAULT_SIZE = DEFAULT_WIDTH * DEFAULT_HEIGHT;

/** Fitting passes in `fitFeatureWeights`. The marginals are within a fraction of
 * a percent of target well before this, and the whole fit costs milliseconds. */
const FIT_PASSES = 32;

/** How much of each pass's correction `fitFeatureWeights` applies. Square roots
 * converge on this pool in a dozen passes; the full correction does not converge
 * at all. */
const FIT_DAMPING = 0.5;

export class GenerationError extends Error {}

/** mulberry32 */
export function makeRng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let x = Math.imul(a ^ (a >>> 15), 1 | a);
    x = (x + Math.imul(x ^ (x >>> 7), 61 | x)) ^ x;
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}

const randInt = (rng: () => number, min: number, max: number) =>
  min + Math.floor(rng() * (max - min + 1));

export function shuffled<T>(rng: () => number, xs: readonly T[]): T[] {
  const out = [...xs];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/** Share of a puzzle's numberwangs the archive puts on the edge: 331 of 503 across
 * the 54 puzzles, against the 70% a uniform draw over a 4x5 board would give
 * (t = -2.30, p = 0.025). */
const EDGE_CRIMINAL_SHARE = 331 / 503;

/**
 * Which cards are numberwang, drawn leaning slightly inward.
 *
 * A uniform draw puts numberwangs on the edge at whatever rate the board is edge —
 * 70% of a 4x5. The archive runs below that, and the difference is not nothing
 * to play against: an interior card touches eight others where a corner touches
 * three, so the neighbour clues that carry most of the deduction have more to
 * say about an interior numberwang. Generated puzzles came out at the uniform
 * rate, which made their neighbour clues quietly thinner than the real ones.
 *
 * The weight is solved from the board rather than tuned: with `e` edge cards and
 * `n` interior ones, giving each interior card weight `w` would make the edge
 * share `e / (e + n*w)` if cards were drawn one at a time with replacement, so
 * `w = e*(1 - share) / (n*share)`. Drawing without replacement — Efraimidis-
 * Spirakis, the same scheme `orderPool` uses — pulls the result back toward
 * uniform, because a region that has given up several cards has fewer left to
 * give: nine numberwangs on a 4x5 land at 67.0% rather than the 65.8% asked for,
 * against 70.0% uniform. That is most of the gap, and the remainder sits inside
 * the archive's own standard error of 1.6 points, so it is not worth a scheme
 * that trades this one's guarantees — every card reachable, exactly `count`
 * returned — for a decimal place.
 */
export function pickNumberwangs(rng: () => number, grid: Grid, count: number): number[] {
  const edge = new Set(edgeMembers(grid));
  const interior = grid.size - edge.size;
  const weight =
    interior === 0
      ? 1
      : (edge.size * (1 - EDGE_CRIMINAL_SHARE)) / (interior * EDGE_CRIMINAL_SHARE);
  return [...Array(grid.size).keys()]
    .map((i) => ({ i, key: -Math.log(rng() || Number.MIN_VALUE) / (edge.has(i) ? 1 : weight) }))
    .sort((a, b) => a.key - b.key)
    .slice(0, count)
    .map((e) => e.i);
}

function shareIn<T>(xs: readonly T[], keys: (x: T) => string[]): Map<string, number> {
  const counts = new Map<string, number>();
  let total = 0;
  for (const x of xs) {
    for (const k of keys(x)) {
      counts.set(k, (counts.get(k) ?? 0) + 1);
      total++;
    }
  }
  for (const [k, n] of counts) counts.set(k, n / total);
  return counts;
}

/**
 * Order the candidate pool so that walking it front-to-back draws clues in
 * roughly the archive's proportions rather than the pool's own.
 *
 * `buildChain` scans this list and takes the first candidate that makes
 * progress, so the ordering — not any later filter — is what decides what a
 * puzzle is made of. Shuffling uniformly (what this used to do) reproduces the
 * pool's combinatorial shape: 58% of unit slots came out `between` against the
 * archive's 29%, and `number_of_traits_in_unit`, the archive's most common
 * clue at 14% of all clues, is 1.1% of the pool and so all but never appeared.
 *
 * Each candidate is weighted by how far its predicate and its features (unit
 * kinds, between-span lengths, directions — see `hintFeatures`) are over- or
 * under-represented in the pool relative to the archive, then drawn without
 * replacement by the Efraimidis–Spirakis trick (sort by -ln(u)/w), which is one
 * O(n log n) sort instead of the O(n^2) of renormalising after every draw.
 * Features are applied first and the predicate correction is measured against
 * the already-feature-weighted mass, so the two corrections compose instead of
 * fighting: the expected predicate mix is the archive's, and within a predicate
 * the features lean the archive's way too.
 *
 * Nothing is dropped. A candidate the archive never uses would get weight 0 and
 * sort to the back, but every predicate and feature `candidateHints` emits does
 * appear in the archive, so in practice this only reorders.
 */
/**
 * Per-hint weights whose feature marginals match `target`.
 *
 * Scaling each feature once by target/pool — what this used to do — does not
 * land on the target. A hint's weight is the product of its features' factors,
 * so a clue naming two colour groups picks the colour factor up twice,
 * and that factor is large: colour groups are 0.4% of the pool's unit slots
 * against the archive's 7%. The head came out at three times the archive's
 * colour rate, which is a worse error than the under-correction it was
 * fixing — the player notices "there are more numberwang judges than numberwang
 * doctors" twice a puzzle instead of once.
 *
 * So iterate: measure the weighted marginals, correct each feature by how far it
 * still is from target, repeat. This is iterative proportional fitting, and a
 * couple of dozen passes over precomputed feature lists costs nothing next to
 * the solving that follows.
 *
 * Two details keep the iteration on its feet. It is damped, because a feature
 * that is scarce in the pool and common in the archive asks for a big correction
 * and the hints carrying it carry other features too, so the full correction
 * overshoots those and the next pass overshoots back: undamped, the marginals
 * oscillate instead of settling, and the error is worse at pass 7 than at pass
 * 1. And the weights are rescaled each pass, because their absolute size is
 * meaningless — only ratios reach the draw — and left alone the product of
 * corrections runs to Infinity, at which point every weight is Infinity, every
 * sort key is 0, and the ordering is whatever order the pool was built in.
 */
function fitFeatureWeights(featureSets: readonly string[][], target: Record<string, number>): number[] {
  const keys = [...new Set(featureSets.flat())];
  let weights = featureSets.map(() => 1);
  for (let pass = 0; pass < FIT_PASSES; pass++) {
    const mass = new Map<string, number>();
    let total = 0;
    featureSets.forEach((fs, i) => {
      for (const f of fs) {
        mass.set(f, (mass.get(f) ?? 0) + weights[i]);
        total += weights[i];
      }
    });
    if (total === 0) break;
    const correction = new Map<string, number>();
    for (const k of keys) {
      const want = target[k] ?? 0;
      const share = (mass.get(k) ?? 0) / total;
      // A feature the archive never uses goes to zero and stays there. One whose
      // carriers have all been zeroed by some *other* feature cannot be lifted,
      // so leave it be rather than dividing by zero.
      correction.set(k, want === 0 ? 0 : share > 0 ? (want / share) ** FIT_DAMPING : 1);
    }
    weights = weights.map((w, i) =>
      featureSets[i].reduce((acc, f) => acc * (correction.get(f) as number), w),
    );
    // A fold rather than `Math.max(...weights)`: there is one weight per
    // candidate hint, and the pool grows fast enough with the board that
    // spreading it overflows the call stack — an 8x8 does it, and the failure
    // reads as a mysterious RangeError from inside the fitter rather than as
    // "too many arguments".
    let max = 0;
    for (const w of weights) if (w > max) max = w;
    if (max > 0) weights = weights.map((w) => w / max);
  }
  return weights;
}

export function orderPool(
  rng: () => number,
  board: Board,
  pool: readonly Hint[],
  mix: ClueMix,
): Hint[] {
  const featureSets = pool.map((hint) => hintFeatures(board, hint));
  const byFeature = fitFeatureWeights(featureSets, mix.feature);

  const predMass = new Map<string, number>();
  let mass = 0;
  pool.forEach((hint, i) => {
    predMass.set(hint.pred, (predMass.get(hint.pred) ?? 0) + byFeature[i]);
    mass += byFeature[i];
  });

  return pool
    .map((hint, i) => {
      const share = (predMass.get(hint.pred) as number) / mass;
      const w = share === 0 ? 0 : byFeature[i] * ((mix.pred[hint.pred] ?? 0) / share);
      // Math.log(0) is -Infinity, so a zero weight sorts last rather than first.
      const u = rng() || Number.MIN_VALUE;
      return { hint, key: w > 0 ? -Math.log(u) / w : Infinity };
    })
    .sort((a, b) => a.key - b.key)
    .map((e) => e.hint);
}

export interface GenerateInput {
  date: string;
  difficulty: string;
  band: LabelBand;
  seed: number;
  /**
   * Archive clue proportions, from `archiveClueMix()`. Required rather than
   * defaulted: without it the candidate pool's own combinatorial shape decides
   * the clue mix, which is how Dan puzzles ended up 3x heavier on `between`
   * than any real one. See `orderPool`.
   */
  mix: ClueMix;
  /**
   * Board size, defaulting to the archive's 4x5. The mix is always measured on
   * the archive's own 4x5 boards; its colour shapes are refitted to whatever
   * board is asked for here — see `colourShapesFor`.
   */
  width?: number;
  height?: number;
  maxAttempts?: number;
  trialsPerStep?: number;
  /**
   * Names the difficulty of a finished attempt from its own metrics, and by
   * being present switches off band rejection entirely: the first attempt
   * that is uniquely solvable, fully chained, and path-reachable on every
   * card is returned, carrying the label this returns rather than
   * `difficulty`.
   *
   * This is how generation is driven in practice. A valid puzzle is worth
   * keeping whatever its metrics turn out to be — throwing one away costs
   * minutes of CPU to rebuild something no better, and the archive is full of
   * labels we can hand out honestly. `band` still shapes the attempt (it sets
   * the reveal ceiling and the abstraction target), so a date still aims at
   * its real puzzle's difficulty; it just no longer rejects for missing.
   *
   * Without it, the old behaviour stands: attempts that miss `band` are
   * discarded and the puzzle keeps the requested `difficulty`.
   */
  labelOf?: (metrics: Metrics) => string;
}

export interface GenerateResult {
  puzzle: Puzzle;
  seed: number;
  attempt: number;
  metrics: Metrics;
}

function hexId(rng: () => number): string {
  let out = '';
  for (let i = 0; i < 12; i++) out += Math.floor(rng() * 16).toString(16);
  return out;
}


/**
 * How many times a chain will reach for the same predicate before it starts
 * preferring anything else. A soft cap: it ranks candidates, it does not
 * exclude them, so a step with nothing else that works still gets its clue.
 *
 * Two is the archive's own mode: of the 54 real puzzles, 22 lean hardest on a
 * predicate exactly twice, 16 three times, and the tail runs out at 7. Pool
 * weighting alone got Dan puzzles to 8.4 distinct
 * predicates against the archive's 9.4, because a weight is a property of the
 * whole pool and nothing kept one chain from taking the same shape of clue over
 * and over once it happened to be working.
 */
const REPEAT_CAP = 2;

/**
 * How many exact-sum clues one puzzle may carry.
 *
 * One, and unlike REPEAT_CAP this is a filter rather than a preference. A sum
 * clue usually pins its whole unit — on a five-card row there are few ways to
 * hit a given total — so a second one is usually a second row handed over, and
 * the share in ARITH_RATE alone does not stop two landing on the same board.
 */
export const MAX_EXACT_SUMS = 1;

export const EXACT_SUM = 'sum_of_trait_in_unit';

/**
 * What a candidate that flips exactly one card is worth against the two ranking
 * preferences, which are scored at 2 apiece.
 *
 * Every step of the chain puts one clue on the board and flips whatever that
 * clue forces, so a step that flips three cards is two cards that will never
 * carry a clue of their own. Left to itself the chain took whatever it found
 * first and half of a twenty-card board came out holding a maths fact instead
 * of a clue. Worth less than either rank, so it breaks ties rather than
 * deciding the shape of the puzzle: a board that can only progress three cards
 * at a time still progresses.
 */
const SINGLE_REVEAL_BONUS = 1;

/** The score of a candidate that wins on both ranks and flips one card: nothing
 * later in the pool can beat it, so the search for this step can stop. */
const TOP_SCORE = 3 * 2 + SINGLE_REVEAL_BONUS;

interface ChainBuild {
  clues: Clues;
  flippedAt: number[][];
}

/** Grow a forcing chain from the initial reveal. Returns null if it stalls. */
function buildChain(
  rng: () => number,
  shape: Shape,
  truth: boolean[],
  pool: Hint[],
  initialReveals: number[],
  trialsPerStep: number,
  maxReveals: number,
  targetAbstractShare: number,
): ChainBuild | null {
  const size = shape.grid.size;
  const board = makeBoard(shape.grid, shape.colours, shape.numbers, truth);
  const clues: Clues = Array.from({ length: size }, () => null);
  const flippedAt: number[][] = Array.from({ length: size }, () => []);
  let flipped = [...initialReveals].sort((a, b) => a - b);
  let cursor = 0;
  let abstractChosen = 0;
  let totalChosen = 0;
  const predUsed = new Map<string, number>();

  while (flipped.length < size) {
    const hosts = shuffled(
      rng,
      flipped.filter((i) => clues[i] === null),
    );
    let progressed = false;

    for (const host of hosts) {
      // Bias toward the target abstractShare: when the running share among
      // clues chosen so far sits below the target band's midpoint, prefer a
      // candidate from the abstract predicate family for this step; at or
      // above it, prefer one outside the family. A candidate is only ever
      // accepted once it has passed the exact same forcedGiven/maxReveals
      // check as before, so this never trades away correctness — and if no
      // candidate of the preferred kind turns up within the trial budget,
      // the first valid candidate found (the old, unbiased behavior) is used.
      const currentShare = totalChosen === 0 ? 0 : abstractChosen / totalChosen;
      const preferAbstract = currentShare < targetAbstractShare;

      // Rank a candidate on the two soft preferences, worth 2 and 1 so that the
      // abstraction bias — which decides how the puzzle plays — outranks the
      // repeat cap, which only decides how it reads. Both are preferences, not
      // filters: a candidate is only ever accepted after passing the same
      // forcedGiven/maxReveals check as before, and if nothing better turns up
      // within the trial budget a rank-0 candidate is still taken.
      const rankOf = (hint: Hint) =>
        (ABSTRACT_PREDICATES.has(hint.pred) === preferAbstract ? 2 : 0) +
        ((predUsed.get(hint.pred) ?? 0) < REPEAT_CAP ? 1 : 0);

      let tried = 0;
      let best: { hint: Hint; reveals: number[]; score: number } | null = null;

      while (tried < trialsPerStep && cursor < pool.length && best?.score !== TOP_SCORE) {
        const hint = pool[cursor++];
        tried++;
        if (hint.pred === EXACT_SUM && (predUsed.get(EXACT_SUM) ?? 0) >= MAX_EXACT_SUMS) continue;
        const rank = rankOf(hint);
        // The most this candidate could score is its rank plus the single-reveal
        // bonus, so if even that cannot beat what is already in hand it cannot
        // change the outcome: skip the expensive forcedGiven/reveal check. The
        // bound is admissible, so this only ever skips candidates that would
        // have lost anyway. Purely a cost optimization.
        if (best && rank * 2 + 1 <= best.score) continue;
        if (namedCards(board, hint).has(host)) continue;
        clues[host] = hint;
        const forced = forcedGiven(shape, clues, truth, flipped);
        const reveals: number[] = [];
        for (let i = 0; i < size; i++) {
          if (!flipped.includes(i) && forced[i] !== null) reveals.push(i);
        }
        clues[host] = null;
        if (reveals.length === 0 || reveals.length > maxReveals) continue;

        const score = rank * 2 + (reveals.length === 1 ? SINGLE_REVEAL_BONUS : 0);
        if (best && score <= best.score) continue;
        best = { hint, reveals, score };
      }

      const chosen = best;
      if (!chosen) continue;

      clues[host] = chosen.hint;
      for (const i of chosen.reveals) flippedAt[i] = [...flipped];
      flipped = [...flipped, ...chosen.reveals].sort((a, b) => a - b);
      totalChosen++;
      predUsed.set(chosen.hint.pred, (predUsed.get(chosen.hint.pred) ?? 0) + 1);
      if (ABSTRACT_PREDICATES.has(chosen.hint.pred)) abstractChosen++;
      progressed = true;
      break;
    }

    if (!progressed) return null;
  }

  return { clues, flippedAt };
}

export function generatePuzzle(input: GenerateInput): GenerateResult {
  const maxAttempts = input.maxAttempts ?? 25;
  const trialsPerStep = input.trialsPerStep ?? 80;
  const grid = makeGrid(input.width ?? DEFAULT_WIDTH, input.height ?? DEFAULT_HEIGHT);
  // The bands are measured on the archive's 4x5 board whatever board we are
  // filling, so refit them once, up front, rather than asking every caller to.
  // The identity at 4x5.
  const band = bandsFor({ b: input.band }, grid.size).b;
  const failures: string[] = [];

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const rng = makeRng(input.seed + attempt * 7919);
    const numbers = numbersFor(grid.size, rng);
    const colours = coloursFor(grid.size, colourShapeFor(input.mix, grid.size, rng), rng);
    const shape: Shape = { grid, colours, numbers };

    const numberwangs = randInt(rng, band.numberwangs.min, band.numberwangs.max);
    const numberwangSet = new Set(pickNumberwangs(rng, grid, numberwangs));
    const truth = Array.from({ length: grid.size }, (_, i) => numberwangSet.has(i));

    const board = makeBoard(grid, colours, numbers, truth);
    const pool = orderPool(rng, board, candidateHints(board), input.mix);
    const initialReveals = [randInt(rng, 0, grid.size - 1)];

    const maxReveals = Math.max(2, Math.ceil(band.meanRevealsPerStep.max));
    const targetAbstractShare =
      (band.abstractShare.min + band.abstractShare.max) / 2;
    const built = buildChain(
      rng,
      shape,
      truth,
      pool,
      initialReveals,
      trialsPerStep,
      maxReveals,
      targetAbstractShare,
    );
    if (!built) {
      failures.push(`attempt ${attempt}: chain stalled`);
      continue;
    }

    let unreachable = -1;
    const paths: number[][][] = truth.map((_, i) => {
      if (initialReveals.includes(i)) return [];
      const p = minimalPaths(shape, built.clues, truth, i, built.flippedAt[i]);
      if (p.length === 0) unreachable = i;
      return p;
    });
    if (unreachable !== -1) {
      failures.push(`attempt ${attempt}: card ${unreachable} has no sufficient path`);
      continue;
    }

    const chain = solveChain(shape, built.clues, truth, initialReveals);
    const metrics = measure({ shape, clues: built.clues, truth, initialReveals, paths });
    if (!chain.solvedAll || !isUniquelySolvable(shape, built.clues, truth)) {
      failures.push(`attempt ${attempt}: not uniquely solvable`);
      continue;
    }

    const flavour = shuffled(rng, FLAVOUR);
    let flavourAt = 0;
    const people: Person[] = truth.map((numberwang, i) => {
      const hint = built.clues[i];
      return {
        number: numbers[i],
        colour: colours[i],
        numberwang: numberwang,
        // A generated board runs to 49 cards and twenty-one colours, where
        // "Exactly 1 cook has …" leaves you counting cooks before you can use it.
        clue: hint ? render(hint, { colourTotals: true }) : flavour[flavourAt++ % flavour.length],
        origHint: hint ? formatHint(hint) : null,
        paths: paths[i],
      };
    });

    const puzzle: Puzzle = {
      formatVersion: 1,
      id: hexId(rng),
      date: input.date,
      title: TITLES[Math.floor(rng() * TITLES.length)],
      difficulty: input.labelOf ? input.labelOf(metrics) : input.difficulty,
      width: grid.width,
      height: grid.height,
      initialReveals,
      source: 'generated',
      people,
      // `chain` proves the puzzle solvable; it does not describe how to hint it.
      // See `hintSteps`.
      hints: hintSteps(shape, built.clues, truth, paths),
    };

    validatePuzzle(puzzle);

    if (!input.labelOf && !gatesPass(band, metrics)) {
      failures.push(
        `attempt ${attempt}: out of band (chain=${metrics.chainLength} ` +
          `clues=${metrics.clueCards} path=${metrics.meanPathSize.toFixed(2)})`,
      );
      continue;
    }

    return { puzzle, seed: input.seed + attempt * 7919, attempt, metrics };
  }

  throw new GenerationError(
    `no puzzle after ${maxAttempts} attempts:\n  ${failures.join('\n  ')}`,
  );
}
