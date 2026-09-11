/**
 * The board, and the geometry every predicate reads off it.
 *
 * This is a seam, not a layer. `predicates.ts` owns the clue semantics and
 * `arith.ts` owns the four arithmetic ones, but `predicates.ts` folds
 * `arith.ts`'s evaluators into its own table and `arith.ts` needs the same
 * `Board` and `unitMembers` — a cycle that ESM resolves differently depending on
 * which module an entry point reaches first, and resolves silently wrong in at
 * least one order. So the shared half sits here, below both.
 */
import {
  type Grid,
  colMembers,
  cornerMembers,
  edgeMembers,
  neighbors,
  rowMembers,
  segment,
} from './grid';
import type { Trait, Unit, UnitKind } from './hint';

/**
 * How many cards a clue may span before the solver refuses to enumerate its
 * assignments. Both readers walk 2^n: `encode.ts` for the structural clues,
 * `arith.ts` for all four of its predicates.
 *
 * In the real archive the largest unit a structural clue lands on is eight
 * cards, and rows and columns of a 5x6 board are five and six; the ceiling
 * exists for the units that are not shaped like that — a 5x6 board's edge is
 * eighteen cards — so that an unencodable clue is refused rather than silently
 * mis-encoded.
 */
export const MAX_ENUMERATED_UNIT = 16;

export interface Board {
  grid: Grid;
  colours: string[];
  /** 1..size, one per card. The arithmetic predicates in `arith.ts` are the
   * only readers; every other predicate is a function of the verdict alone. */
  numbers: number[];
  numberwang: boolean[];
  /** Memoises unit membership; safe because membership depends only on the grid
   * and colours, never on `numberwang` or `numbers`. */
  cache?: Map<string, number[]>;
}

function computeUnitMembers(b: Board, u: Unit): number[] {
  switch (u.kind) {
    case 'row':
      return rowMembers(b.grid, u.n);
    case 'col':
      return colMembers(b.grid, u.n);
    case 'neighbor':
      return neighbors(b.grid, u.i);
    case 'between':
      return segment(b.grid, u.a, u.b);
    case 'colour':
      return b.colours.flatMap((p, i) => (p === u.name ? [i] : []));
    case 'edge':
      return edgeMembers(b.grid);
    case 'corner':
      return cornerMembers(b.grid);
  }
}

export function makeBoard(
  grid: Grid,
  colours: string[],
  numbers: number[],
  numberwang: boolean[],
): Board {
  return { grid, colours, numbers, numberwang, cache: new Map() };
}

export function unitMembers(b: Board, u: Unit): number[] {
  if (!b.cache) return computeUnitMembers(b, u);
  const key = JSON.stringify(u);
  let members = b.cache.get(key);
  if (!members) {
    members = computeUnitMembers(b, u);
    b.cache.set(key, members);
  }
  return members;
}

export function unitsOfKind(b: Board, kind: UnitKind): Unit[] {
  switch (kind) {
    case 'row':
      return Array.from({ length: b.grid.height }, (_, k) => ({ kind: 'row', n: k + 1 }));
    case 'col':
      return Array.from({ length: b.grid.width }, (_, k) => ({ kind: 'col', n: k + 1 }));
    case 'neighbor':
      return Array.from({ length: b.grid.size }, (_, i) => ({ kind: 'neighbor', i }));
    case 'between':
      return [];
    case 'colour':
      return [...new Set(b.colours)].sort().map((name) => ({ kind: 'colour', name }));
    case 'edge':
      return [{ kind: 'edge' }];
    case 'corner':
      return [{ kind: 'corner' }];
  }
}

export function hasTrait(b: Board, i: number, t: Trait): boolean {
  return t === 'numberwang' ? b.numberwang[i] : !b.numberwang[i];
}

export function countTrait(b: Board, members: number[], t: Trait): number {
  let n = 0;
  for (const i of members) if (hasTrait(b, i, t)) n++;
  return n;
}
