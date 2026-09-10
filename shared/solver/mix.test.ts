import { describe, expect, it } from 'vitest';
import mixData from '../../config/clue-mix.json' with { type: 'json' };
import { MixFormatError, loadMix } from './mix';

const flat = loadMix(mixData);

describe('loadMix', () => {
  it('reads the vendored file', () => {
    expect(Object.keys(flat.pred).length).toBeGreaterThan(20);
    expect(flat.professionShapes.length).toBeGreaterThan(0);
  });

  it('rejects anything that is not a mix', () => {
    expect(() => loadMix(null)).toThrow(MixFormatError);
    expect(() => loadMix({ pred: {}, feature: {} })).toThrow(MixFormatError);
    expect(() => loadMix({ pred: { a: -1 }, feature: {}, professionShapes: [] })).toThrow(
      MixFormatError,
    );
    expect(() => loadMix({ pred: {}, feature: { a: 'x' }, professionShapes: [] })).toThrow(
      MixFormatError,
    );
    expect(() => loadMix({ pred: {}, feature: {}, professionShapes: [[0]] })).toThrow(
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
