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
  /** One entry per archived board: its profession group sizes, descending. */
  professionShapes: number[][];
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
  if (!Array.isArray(d.professionShapes)) throw new MixFormatError('professionShapes is not an array');
  const professionShapes = d.professionShapes.map((shape, i) => {
    if (!Array.isArray(shape)) throw new MixFormatError(`professionShapes[${i}] is not an array`);
    return shape.map((n) => {
      if (!Number.isInteger(n) || (n as number) < 1) {
        throw new MixFormatError(`professionShapes[${i}] must be positive integers`);
      }
      return n as number;
    });
  });
  return { pred: shares(d.pred, 'pred'), feature: shares(d.feature, 'feature'), professionShapes };
}
