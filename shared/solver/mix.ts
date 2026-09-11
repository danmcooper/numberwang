/**
 * The proportions a generated puzzle's clues are drawn in.
 *
 * This cannot be measured here. It comes from `archiveClueMix()` over cbs2's
 * scraped 4x5 archive, is committed as `config/clue-mix.json`, and and is
 * the only measurement this repo has. There is no Numberwang archive and never
 * will be one to scrape, so re-deriving the JSON means going back to cbs2 and
 * running its `archiveClueMix()` again.
 *
 * Everything past the predicate shares is an estimate. It exists to stop the
 * candidate pool's own combinatorial shape deciding the mix - which is how 2D's
 * generated puzzles once came out three times heavier on `between` than any
 * real one - not because anyone measured a Numberwang board.
 *
 * `ClueMix` is declared here rather than in `corpus.ts`, where 2D keeps it: it
 * no longer comes from an archive read, so it no longer belongs to one.
 */

export interface ClueMix {
  /** Share of clues per predicate name, summing to 1. */
  pred: Record<string, number>;
  /**
   * Share of unit slots per feature key, as `hintFeatures` emits them:
   * `unit:<kind>`, `unit:between:<length>`, `dir:<dx>,<dy>,<dz>`,
   * `overlap:<n>`.
   */
  feature: Record<string, number>;
  /** One entry per archived board: its colour group sizes, descending. */
  colourShapes: number[][];
}

export class MixFormatError extends Error {}

const shares = (raw: unknown, what: string): Record<string, number> => {
  if (typeof raw !== 'object' || raw === null) throw new MixFormatError(`${what} is not an object`);
  const out: Record<string, number> = {};
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof v !== 'number' || !Number.isFinite(v) || v < 0) {
      throw new MixFormatError(`${what}.${k} must be a non-negative number`);
    }
    out[k] = v;
  }
  return out;
};

/** Validate a parsed `config/clue-mix.json` into a `ClueMix`. */
export function loadMix(data: unknown): ClueMix {
  if (typeof data !== 'object' || data === null) throw new MixFormatError('mix is not an object');
  const d = data as Record<string, unknown>;
  if (!Array.isArray(d.colourShapes)) throw new MixFormatError('colourShapes is not an array');
  const colourShapes = d.colourShapes.map((shape, i) => {
    if (!Array.isArray(shape)) throw new MixFormatError(`colourShapes[${i}] is not an array`);
    return shape.map((n) => {
      if (!Number.isInteger(n) || (n as number) < 1) {
        throw new MixFormatError(`colourShapes[${i}] must be positive integers`);
      }
      return n as number;
    });
  });
  return { pred: shares(d.pred, 'pred'), feature: shares(d.feature, 'feature'), colourShapes };
}

/**
 * What share of a puzzle's clues each arithmetic predicate gets.
 *
 * These cannot be measured. `config/clue-mix.json` comes from cbs2's 4x5
 * archive, which wrote none of them, so a measured share is 0 and `orderPool`
 * multiplies by share — an unbudgeted predicate is generated never. This is the
 * same problem `CROSS_TRAIT_RATE` solves for the cross-trait comparisons, at
 * eight times the size.
 *
 * They are not weighted evenly. An exact sum pins its unit outright most of the
 * time on a five-card unit — it is the strongest single clue in the game, and a
 * puzzle with two of them is a puzzle with two rows handed over. It gets the
 * smallest share here and a hard cap in `generate.ts` besides. The two parity
 * counts are next-smallest because they say the least per clue and because
 * between them and `sum_parity_in_unit` the puzzle can start to read as one long
 * argument about even numbers.
 *
 * The total comes to 0.23, so roughly a quarter of a puzzle's clues do
 * arithmetic. That is a deliberate quarter: the game is called Numberwang, and
 * the four sum predicates alone were the whole reason the number replaced the
 * name.
 */
export const ARITH_RATE: Record<string, number> = {
  sum_of_trait_in_unit: 0.02,
  diff_of_two_traits_in_unit: 0.035,
  more_sum_in_unit_than_unit: 0.035,
  sum_parity_in_unit: 0.03,
  n_traits_in_unit_are_prime: 0.03,
  n_traits_in_unit_are_even: 0.025,
  n_traits_in_unit_are_odd: 0.025,
  n_traits_in_unit_are_divisible: 0.03,
};

/**
 * Rescale the attested shares to make room for the arithmetic budgets, leaving
 * the attested predicates' proportions relative to each other untouched.
 *
 * Idempotent: a mix that already carries the budgets comes back unchanged,
 * because the rescale is computed from the attested shares alone.
 */
export function withArithBudgets(mix: ClueMix): ClueMix {
  const budget = Object.values(ARITH_RATE).reduce((a, b) => a + b, 0);
  const attested = Object.entries(mix.pred).filter(([p]) => !(p in ARITH_RATE));
  const attestedTotal = attested.reduce((a, [, v]) => a + v, 0);
  if (attestedTotal <= 0) throw new MixFormatError('mix has no attested predicate shares');

  const pred: Record<string, number> = {};
  for (const [p, v] of attested) pred[p] = (v / attestedTotal) * (1 - budget);
  for (const [p, v] of Object.entries(ARITH_RATE)) pred[p] = v;
  return { ...mix, pred };
}
