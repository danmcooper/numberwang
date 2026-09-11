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
