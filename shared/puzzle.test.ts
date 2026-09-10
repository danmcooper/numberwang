import { describe, expect, it } from 'vitest';
import { PuzzleValidationError, validatePuzzle } from './puzzle';

function person(number: number, overrides: object = {}) {
  return {
    number,
    colour: 'red',
    numberwang: false,
    clue: null,
    origHint: null,
    paths: [],
    ...overrides,
  };
}

/** Four cards numbered 1..4, each optionally overridden by position. */
function people(...overrides: object[]) {
  return [0, 1, 2, 3].map((i) => person(i + 1, overrides[i] ?? {}));
}

function puzzle(overrides: object = {}) {
  return {
    formatVersion: 1,
    id: 'a6f09e2713b2',
    date: '2026-07-07',
    title: 'A tiny test quiz',
    difficulty: 'Easy',
    width: 2,
    height: 2,
    initialReveals: [0],
    source: 'generated',
    people: people(),
    ...overrides,
  };
}

describe('validatePuzzle', () => {
  it('accepts a valid puzzle and returns it', () => {
    const p = puzzle();
    expect(validatePuzzle(p)).toBe(p);
  });

  it('accepts nullable clue/origHint/paths and rich values', () => {
    const p = puzzle({
      people: people({ clue: 'The #COLOUR:teal card is Numberwang', origHint: 'x()', paths: [[0, 1], [3]] }, { paths: null }),
    });
    expect(validatePuzzle(p)).toBe(p);
  });

  it('rejects non-objects', () => {
    expect(() => validatePuzzle(null)).toThrow(PuzzleValidationError);
    expect(() => validatePuzzle('x')).toThrow(PuzzleValidationError);
  });

  it('rejects wrong formatVersion', () => {
    expect(() => validatePuzzle(puzzle({ formatVersion: 2 }))).toThrow(/formatVersion/);
  });

  it('rejects malformed id and date', () => {
    expect(() => validatePuzzle(puzzle({ id: 'nope' }))).toThrow(/id/);
    expect(() => validatePuzzle(puzzle({ date: '07/07/2026' }))).toThrow(/date/);
  });

  it('rejects person count != width*height', () => {
    expect(() => validatePuzzle(puzzle({ people: [person(1)] }))).toThrow(/people length/);
  });

  it('rejects out-of-range initialReveals and paths indices', () => {
    expect(() => validatePuzzle(puzzle({ initialReveals: [4] }))).toThrow(/initialReveals/);
    expect(() => validatePuzzle(puzzle({ people: people({ paths: [[99]] }) }))).toThrow(/paths/);
  });

  it('accepts a valid hints array and absent hints', () => {
    const p = puzzle({
      hints: [
        { flipped: [0], clues: [0], reveals: [1] },
        { flipped: [0, 1], clues: [1], reveals: [2, 3] },
      ],
    });
    expect(validatePuzzle(p)).toBe(p);
    expect(validatePuzzle(puzzle())).toBeTruthy();
  });

  it('rejects malformed hints', () => {
    expect(() => validatePuzzle(puzzle({ hints: 'nope' }))).toThrow(/hints/);
    expect(() => validatePuzzle(puzzle({ hints: [{ flipped: [0], clues: [0] }] }))).toThrow(/hints/);
    expect(() => validatePuzzle(puzzle({ hints: [{ flipped: [0], clues: [99], reveals: [1] }] }))).toThrow(/hints/);
  });

  it('rejects bad person fields', () => {
    expect(() => validatePuzzle(puzzle({ people: people({ numberwang: 'yes' }) }))).toThrow(/numberwang/);
    expect(() => validatePuzzle(puzzle({ people: people({ clue: 42 }) }))).toThrow(/clue/);
  });
});

const card = (number: number, colour: string, numberwang = false) => ({
  number,
  colour,
  numberwang,
  clue: null,
  origHint: null,
  paths: null,
});

const board = () => ({
  formatVersion: 1 as const,
  id: 'abcdef012345',
  date: '2026-09-10',
  title: 'A Test Board',
  difficulty: 'Medium',
  width: 4,
  height: 5,
  initialReveals: [0],
  source: 'generated',
  people: Array.from({ length: 20 }, (_, i) => card(i + 1, 'red')),
});

describe('validatePuzzle numbers', () => {
  it('accepts a 1..N permutation', () => {
    const p = board();
    p.people = [...p.people].reverse();
    expect(validatePuzzle(p).people[0].number).toBe(20);
  });

  it('rejects a repeated number', () => {
    const p = board();
    p.people[3].number = p.people[2].number;
    expect(() => validatePuzzle(p)).toThrow(PuzzleValidationError);
  });

  it('rejects a number outside 1..N', () => {
    const p = board();
    p.people[0].number = 21;
    expect(() => validatePuzzle(p)).toThrow(PuzzleValidationError);
  });

  it('rejects a missing colour', () => {
    const p = board();
    delete (p.people[0] as Record<string, unknown>).colour;
    expect(() => validatePuzzle(p)).toThrow(PuzzleValidationError);
  });
});
