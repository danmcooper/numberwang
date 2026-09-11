export interface Person {
  /** 1..N, unique across the board. Replaces Clues by Sam's `name`. */
  number: number;
  /** One of `PALETTE`. Replaces `colour`, and groups the same way. */
  colour: string;
  /** The hidden verdict. Replaces `numberwang`. */
  numberwang: boolean;
  clue: string | null;
  origHint: string | null;
  paths: number[][] | null;
}

/** One precomputed deduction step: with `flipped` on the table, the clues on
 * `clues` cards suffice to deduce the `reveals` cards. */
export interface HintStep {
  flipped: number[];
  clues: number[];
  reveals: number[];
}

export interface Puzzle {
  formatVersion: 1;
  id: string;
  date: string;
  title: string;
  difficulty: string;
  width: number;
  height: number;
  initialReveals: number[];
  source: string;
  people: Person[];
  /** Absent in older puzzle files and when the source puzzle has no hints. */
  hints?: HintStep[];
}

export class PuzzleValidationError extends Error {}

function fail(msg: string): never {
  throw new PuzzleValidationError(msg);
}

export function validatePuzzle(data: unknown): Puzzle {
  if (typeof data !== 'object' || data === null) fail('puzzle is not an object');
  const p = data as Record<string, unknown>;
  if (p.formatVersion !== 1) fail(`unsupported formatVersion: ${String(p.formatVersion)}`);
  if (typeof p.id !== 'string' || !/^[0-9a-f]{12}$/.test(p.id)) fail('id must be 12 lowercase hex chars');
  if (typeof p.date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(p.date)) fail('date must be YYYY-MM-DD');
  if (typeof p.title !== 'string') fail('title must be a string');
  if (typeof p.difficulty !== 'string') fail('difficulty must be a string');
  if (typeof p.source !== 'string') fail('source must be a string');
  if (!Number.isInteger(p.width) || (p.width as number) < 1) fail('width must be a positive integer');
  if (!Number.isInteger(p.height) || (p.height as number) < 1) fail('height must be a positive integer');
  const count = (p.width as number) * (p.height as number);
  if (!Array.isArray(p.people)) fail('people must be an array');
  if (p.people.length !== count) fail(`people length ${p.people.length} != width*height ${count}`);
  const inRange = (n: unknown) => Number.isInteger(n) && (n as number) >= 0 && (n as number) < count;
  if (!Array.isArray(p.initialReveals) || !p.initialReveals.every(inRange)) {
    fail('initialReveals must be an array of in-range card indices');
  }
  if (p.hints !== undefined) {
    const indexArrayOk = (v: unknown) => Array.isArray(v) && v.every(inRange);
    const ok =
      Array.isArray(p.hints) &&
      p.hints.every(
        (raw) =>
          typeof raw === 'object' &&
          raw !== null &&
          indexArrayOk((raw as Record<string, unknown>).flipped) &&
          indexArrayOk((raw as Record<string, unknown>).clues) &&
          indexArrayOk((raw as Record<string, unknown>).reveals),
      );
    if (!ok) fail('hints must be absent or an array of {flipped, clues, reveals} in-range index arrays');
  }
  // A number appearing once and inside 1..count, over exactly `count` cards, is
  // a permutation of 1..count — uniqueness plus a range of exactly that size
  // leaves nothing else it could be, and nothing has to be sorted to see it.
  const seen = new Set<number>();
  p.people.forEach((raw, i) => {
    const where = `people[${i}]`;
    if (typeof raw !== 'object' || raw === null) fail(`${where} is not an object`);
    const q = raw as Record<string, unknown>;
    const num = q.number;
    if (!Number.isInteger(num) || (num as number) < 1 || (num as number) > count) {
      fail(`${where}.number must be an integer in 1..${count}`);
    }
    if (seen.has(num as number)) fail(`${where}.number ${String(num)} appears twice`);
    seen.add(num as number);
    if (typeof q.colour !== 'string' || q.colour === '') fail(`${where}.colour must be a non-empty string`);
    if (typeof q.numberwang !== 'boolean') fail(`${where}.numberwang must be a boolean`);
    if (q.clue !== null && typeof q.clue !== 'string') fail(`${where}.clue must be a string or null`);
    if (q.origHint !== null && typeof q.origHint !== 'string') fail(`${where}.origHint must be a string or null`);
    if (q.paths !== null) {
      const ok =
        Array.isArray(q.paths) &&
        q.paths.every((path) => Array.isArray(path) && path.every(inRange));
      if (!ok) fail(`${where}.paths must be null or an array of arrays of in-range indices`);
    }
  });
  return data as Puzzle;
}
