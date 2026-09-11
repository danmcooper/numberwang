import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { makeGrid } from './grid';
import { parseHint } from './hint';
import type { Clues } from './solve';
import {
  type Metrics,
  ABSTRACT_PREDICATES,
  CALIBRATION_SIZE,
  InsufficientSamplesError,
  bandsFor,
  buildBands,
  classify,
  gatesPass,
  loadBands,
  measure,
} from './difficulty';

const shape = { grid: makeGrid(4, 5), colours: Array.from({ length: 20 }, () => 'cook'), numbers: Array.from({ length: 20 }, (_, i) => i + 1) };
const truth = Array.from({ length: 20 }, (_, i) => i < 2);
const clues: Clues = Array.from({ length: 20 }, () => null);
clues[0] = parseHint('number_of_traits(numberwang,2)');
clues[1] = parseHint('number_of_traits_in_unit(unit(between,pair(2,19)),numberwang,0)');

const paths: (number[][] | null)[] = Array.from({ length: 20 }, () => [[0, 1]]);
paths[0] = [];

describe('measure', () => {
  it('reports counts, chain shape, and predicate mix', () => {
    // Both numberwangs must be revealed up front: with only card 0 revealed,
    // clue 1 (on card 1) is not yet active, and clue 0 alone ("exactly 2
    // numberwangs") cannot force any of the 19 remaining candidate positions
    // for the second numberwang, so the chain would have zero steps. With
    // [0, 1] both clues are active from the start and "exactly 2 numberwangs"
    // forces all 18 remaining cards not_numberwang in a single step.
    const m = measure({ shape, clues, truth, initialReveals: [0, 1], paths });
    expect(m.numberwangs).toBe(2);
    expect(m.clueCards).toBe(2);
    expect(m.chainLength).toBe(1);
    expect(m.meanRevealsPerStep).toBe(18);
    expect(m.meanPathSize).toBe(2);
    expect(m.maxPathSize).toBe(2);
    expect(m.predicateMix).toEqual({
      number_of_traits: 1,
      number_of_traits_in_unit: 1,
    });
  });
});

describe('measure abstractShare', () => {
  it('is the share of clues drawn from the abstract predicate family', () => {
    // 2 clues from the abstract family, 6 from outside it: 2/8 = 0.25.
    const mixClues: Clues = Array.from({ length: 20 }, () => null);
    mixClues[0] = parseHint('is_not_only_trait_in_unit(unit(row,0),3,numberwang)');
    mixClues[1] = parseHint('only_unit_has_exactly_n_traits(unit(col,1),numberwang,2)');
    mixClues[2] = parseHint('has_trait(4,numberwang)');
    mixClues[3] = parseHint('number_of_traits(numberwang,2)');
    mixClues[4] = parseHint('number_of_traits_in_unit(unit(row,2),numberwang,1)');
    mixClues[5] = parseHint('odd_number_of_traits_in_unit(unit(col,2),numberwang)');
    mixClues[6] = parseHint('has_most_traits(unit(row,3),numberwang)');
    mixClues[7] = parseHint('min_number_of_traits_in_unit(unit(col,3),numberwang,1)');
    const mixPaths: (number[][] | null)[] = Array.from({ length: 20 }, () => [[0, 1]]);

    // initialReveals is deliberately empty: forcedGiven only checks hints on
    // flipped cards for consistency with truth, and this test's synthetic
    // clues are not meant to be true statements about `truth` — they only
    // need to exercise measure's clue-counting, which reads input.clues
    // directly rather than the chain solveChain derives from them.
    const m = measure({ shape, clues: mixClues, truth, initialReveals: [], paths: mixPaths });
    expect(m.clueCards).toBe(8);
    expect(m.abstractShare).toBe(0.25);
  });

  it('is 0, not NaN, when there are no clues at all', () => {
    const noClues: Clues = Array.from({ length: 20 }, () => null);
    const noCluesPaths: (number[][] | null)[] = Array.from({ length: 20 }, () => [[0, 1]]);
    const m = measure({ shape, clues: noClues, truth, initialReveals: [], paths: noCluesPaths });
    expect(m.clueCards).toBe(0);
    expect(m.abstractShare).toBe(0);
  });
});

const metrics = (over: Partial<Metrics>): Metrics => ({
  numberwangs: 5,
  clueCards: 8,
  chainLength: 6,
  meanRevealsPerStep: 2,
  maxRevealsPerStep: 4,
  meanPathSize: 3,
  maxPathSize: 5,
  predicateMix: {},
  abstractShare: 0.3,
  ...over,
});

describe('buildBands', () => {
  it('takes min and max per label', () => {
    const bands = buildBands([
      { label: 'Easy', metrics: metrics({ chainLength: 4 }) },
      { label: 'Easy', metrics: metrics({ chainLength: 6 }) },
      { label: 'Easy', metrics: metrics({ chainLength: 9 }) },
    ]);
    expect(bands.Easy.samples).toBe(3);
    expect(bands.Easy.chainLength).toEqual({ min: 4, max: 9 });
    expect(bands.Easy.numberwangs).toEqual({ min: 5, max: 5 });
  });
  it('refuses to invent a band from too few samples', () => {
    expect(() => buildBands([{ label: 'Brutal', metrics: metrics({}) }])).toThrow(
      InsufficientSamplesError,
    );
  });
});

describe('bandsFor', () => {
  const bands = loadBands(
    JSON.parse(
      readFileSync(path.join(process.cwd(), 'config', 'difficulty.json'), 'utf8'),
    ),
  );

  it('leaves the board it was calibrated on alone', () => {
    expect(bandsFor(bands, CALIBRATION_SIZE)).toEqual(bands);
  });

  it('scales the metrics that count cards, and only those', () => {
    const got = bandsFor(bands, 30);
    for (const label of Object.keys(bands)) {
      const was = bands[label];
      const now = got[label];
      expect(now.numberwangs, label).toEqual({
        min: Math.round(was.numberwangs.min * 1.5),
        max: Math.round(was.numberwangs.max * 1.5),
      });
      expect(now.clueCards, label).toEqual({
        min: Math.round(was.clueCards.min * 1.5),
        max: Math.round(was.clueCards.max * 1.5),
      });
      // chainLength grows far slower than the board — a wider board reveals
      // more per step rather than taking more steps — and abstractShare is a
      // ratio. Scaling either would be inventing a law neither one follows.
      expect(now.chainLength, label).toEqual(was.chainLength);
      expect(now.abstractShare, label).toEqual(was.abstractShare);
      expect(now.meanPathSize, label).toEqual(was.meanPathSize);
      expect(now.samples, label).toBe(was.samples);
    }
  });

  it('never asks a board for more numberwangs than it has cards', () => {
    for (const [label, band] of Object.entries(bandsFor(bands, 30))) {
      expect(band.numberwangs.max, label).toBeLessThanOrEqual(30);
      expect(band.numberwangs.min, label).toBeGreaterThan(0);
    }
  });

  it('produces bands that still load', () => {
    // The scaled bands are fed straight back to `classify` and `gatesPass`, so
    // they have to satisfy every invariant the calibrated file does.
    expect(() => loadBands(bandsFor(bands, 30))).not.toThrow();
    expect(() => loadBands(bandsFor(bands, 12))).not.toThrow();
  });
});

describe('gatesPass', () => {
  const band = buildBands([
    { label: 'Easy', metrics: metrics({ chainLength: 4, abstractShare: 0.2 }) },
    { label: 'Easy', metrics: metrics({ chainLength: 6, abstractShare: 0.3 }) },
    { label: 'Easy', metrics: metrics({ chainLength: 9, abstractShare: 0.4 }) },
  ]).Easy;

  it('accepts in-band solve shape', () => {
    expect(gatesPass(band, metrics({ chainLength: 5, abstractShare: 0.3 }))).toBe(true);
  });
  it('rejects out-of-band solve shape', () => {
    expect(gatesPass(band, metrics({ chainLength: 12 }))).toBe(false);
    expect(gatesPass(band, metrics({ abstractShare: 0.9 }))).toBe(false);
  });
  it('ignores numberwang count, which is sampled rather than gated', () => {
    expect(gatesPass(band, metrics({ numberwangs: 99 }))).toBe(true);
    expect(gatesPass(band, metrics({ clueCards: 99 }))).toBe(false);
  });
  it('ignores meanPathSize, which is recorded but not yet gated because the generator cannot currently reach the calibrated range', () => {
    expect(gatesPass(band, metrics({ meanPathSize: 999 }))).toBe(true);
  });
});

describe('classify', () => {
  // Two labels separated on chainLength only: Low covers 2-6, High covers
  // 10-14. Every other gated metric is identical across both, so the choice
  // turns entirely on where chainLength falls.
  const bands = buildBands([
    { label: 'Low', metrics: metrics({ chainLength: 2 }) },
    { label: 'Low', metrics: metrics({ chainLength: 4 }) },
    { label: 'Low', metrics: metrics({ chainLength: 6 }) },
    { label: 'High', metrics: metrics({ chainLength: 10 }) },
    { label: 'High', metrics: metrics({ chainLength: 12 }) },
    { label: 'High', metrics: metrics({ chainLength: 14 }) },
  ]);

  it('picks the label whose band contains the metrics', () => {
    expect(classify(bands, metrics({ chainLength: 3 }))).toBe('Low');
    expect(classify(bands, metrics({ chainLength: 13 }))).toBe('High');
  });

  it('picks the nearest label when no band contains the metrics', () => {
    // 7 and 9 both sit in the gap between the bands; each goes to the side
    // it is closer to, so a puzzle is never refused a label for landing
    // between two of them.
    expect(classify(bands, metrics({ chainLength: 7 }))).toBe('Low');
    expect(classify(bands, metrics({ chainLength: 9 }))).toBe('High');
    // Far outside every band on the low side still resolves, to Low.
    expect(classify(bands, metrics({ chainLength: -50 }))).toBe('Low');
  });

  it('breaks containment ties toward the band the metrics sit most centrally in', () => {
    // Wide contains Low's whole range, so a chainLength of 3 is inside both.
    // Without the midpoint key the winner would come down to label spelling;
    // with it, 3 goes to Narrow, whose midpoint is 3 rather than 10.
    const overlapping = buildBands([
      { label: 'Narrow', metrics: metrics({ chainLength: 2 }) },
      { label: 'Narrow', metrics: metrics({ chainLength: 3 }) },
      { label: 'Narrow', metrics: metrics({ chainLength: 4 }) },
      { label: 'Wide', metrics: metrics({ chainLength: 1 }) },
      { label: 'Wide', metrics: metrics({ chainLength: 10 }) },
      { label: 'Wide', metrics: metrics({ chainLength: 19 }) },
    ]);
    expect(classify(overlapping, metrics({ chainLength: 3 }))).toBe('Narrow');
    expect(classify(overlapping, metrics({ chainLength: 17 }))).toBe('Wide');
  });

  it('always returns a calibrated label, and the same one for the same metrics', () => {
    for (const chainLength of [-5, 0, 3, 7, 8, 11, 20, 500]) {
      const m = metrics({ chainLength });
      const label = classify(bands, m);
      expect(Object.keys(bands)).toContain(label);
      expect(classify(bands, m)).toBe(label);
    }
  });
});

describe('loadBands', () => {
  const band = buildBands([
    { label: 'Easy', metrics: metrics({}) },
    { label: 'Easy', metrics: metrics({}) },
    { label: 'Easy', metrics: metrics({}) },
  ]).Easy;

  it('accepts a well-formed bands object', () => {
    expect(loadBands({ Easy: band })).toEqual({ Easy: band });
  });
  it('rejects a band missing a metric or with a reversed range', () => {
    const { meanPathSize, ...missing } = band;
    expect(() => loadBands({ Easy: missing })).toThrow(/meanPathSize/);
    expect(() => loadBands({ Easy: { ...band, chainLength: { min: 9, max: 2 } } })).toThrow(
      /chainLength/,
    );
  });
});
