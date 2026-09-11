import { describe, expect, it } from 'vitest';
import mixData from '../../config/clue-mix.json' with { type: 'json' };
import { ARITH_RATE, MixFormatError, loadMix, withArithBudgets } from './mix';
import { ARITH_PREDS } from './arith';

const flat = loadMix(mixData);

describe('loadMix', () => {
  it('reads the vendored file', () => {
    expect(Object.keys(flat.pred).length).toBeGreaterThan(20);
    expect(flat.colourShapes.length).toBeGreaterThan(0);
  });

  it('rejects anything that is not a mix', () => {
    expect(() => loadMix(null)).toThrow(MixFormatError);
    expect(() => loadMix({ pred: {}, feature: {} })).toThrow(MixFormatError);
    expect(() => loadMix({ pred: { a: -1 }, feature: {}, colourShapes: [] })).toThrow(
      MixFormatError,
    );
    expect(() => loadMix({ pred: {}, feature: { a: 'x' }, colourShapes: [] })).toThrow(
      MixFormatError,
    );
    expect(() => loadMix({ pred: {}, feature: {}, colourShapes: [[0]] })).toThrow(
      MixFormatError,
    );
  });

  it('gives a share to every feature the 4x5 board can produce', () => {
    // `orderPool` zeroes a feature the mix does not mention and never lifts it
    // again, so an unmentioned key bans its whole family of clues rather than
    // merely thinning it.
    expect(flat.feature['unit:row']).toBeGreaterThan(0);
    expect(flat.feature['unit:col']).toBeGreaterThan(0);
    expect(flat.feature['unit:corner']).toBeGreaterThan(0);
    expect(flat.feature['unit:neighbor']).toBeGreaterThan(0);
  });
});

describe('withArithBudgets', () => {
  const base = {
    pred: { number_of_traits_in_unit: 0.6, more_traits_in_unit_than_unit: 0.4 },
    feature: {},
    colourShapes: [[3, 3, 3, 3, 2, 2, 2, 2]],
  };

  it('gives every arithmetic predicate a non-zero share', () => {
    const out = withArithBudgets(base);
    for (const p of ARITH_PREDS) expect(out.pred[p], p).toBeGreaterThan(0);
  });

  it('leaves the shares summing to 1', () => {
    const out = withArithBudgets(base);
    const total = Object.values(out.pred).reduce((a, b) => a + b, 0);
    expect(total).toBeCloseTo(1, 10);
  });

  it('spends 20 to 26 percent of the mix on arithmetic', () => {
    const out = withArithBudgets(base);
    const arith = ARITH_PREDS.reduce((a, p) => a + out.pred[p], 0);
    expect(arith).toBeGreaterThanOrEqual(0.2);
    expect(arith).toBeLessThanOrEqual(0.26);
  });

  it('makes the exact sum the smallest of them', () => {
    const out = withArithBudgets(base);
    for (const p of ARITH_PREDS) {
      if (p === 'sum_of_trait_in_unit') continue;
      expect(out.pred[p], p).toBeGreaterThan(out.pred.sum_of_trait_in_unit);
    }
  });

  it('does not disturb the attested predicates relative to each other', () => {
    const out = withArithBudgets(base);
    const ratio = out.pred.number_of_traits_in_unit / out.pred.more_traits_in_unit_than_unit;
    expect(ratio).toBeCloseTo(0.6 / 0.4, 10);
  });

  it('is idempotent, so a double-wrapped mix is still a mix', () => {
    const once = withArithBudgets(base);
    expect(withArithBudgets(once)).toEqual(once);
  });

  it('refuses a mix with nothing attested to rescale', () => {
    expect(() => withArithBudgets({ ...base, pred: { ...ARITH_RATE } })).toThrow(MixFormatError);
  });

  it('budgets the vendored archive mix too, which measured none of them', () => {
    for (const p of ARITH_PREDS) expect(flat.pred[p] ?? 0).toBe(0);
    const out = withArithBudgets(flat);
    for (const p of ARITH_PREDS) expect(out.pred[p], p).toBeGreaterThan(0);
  });
});
