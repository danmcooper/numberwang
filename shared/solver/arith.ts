/**
 * The four clue families that do arithmetic on the cards' numbers.
 *
 * Everything Clues by Sam wrote is a function of the hidden verdict alone —
 * counting cards, comparing counts, checking adjacency. These four read the
 * numbers as values, which is the one thing a name could never do.
 *
 * Semantics, candidate enumeration and CNF encoding all live here rather than
 * in the three modules that would otherwise own a third each. They have to
 * agree exactly — an encoding that admits one assignment the semantics reject
 * produces a puzzle that is unsolvable or multiply-solvable, silently — and the
 * differential test that proves they agree reads better when it can see both.
 */
import type { Cnf } from './sat';
import type { Hint, HintArg, Trait, Unit } from './hint';
import { type Board, MAX_ENUMERATED_UNIT, hasTrait, unitMembers } from './board';

export class ArithError extends Error {}

/** The four, in the order this file defines them. */
export const ARITH_PREDS = [
  'sum_of_trait_in_unit',
  'diff_of_two_traits_in_unit',
  'more_sum_in_unit_than_unit',
  'sum_parity_in_unit',
] as const;

export const IS_ARITH: ReadonlySet<string> = new Set(ARITH_PREDS);

/** Sum of the numbers on the members that hold `t`. Empty sums to 0. */
export function traitSum(b: Board, members: number[], t: Trait): number {
  let s = 0;
  for (const i of members) if (hasTrait(b, i, t)) s += b.numbers[i];
  return s;
}

function argUnit(a: HintArg[], k: number): Unit {
  const x = a[k];
  if (x.t !== 'unit') throw new ArithError(`arg ${k} is not a unit`);
  return x.unit;
}
function argTrait(a: HintArg[], k: number): Trait {
  const x = a[k];
  if (x.t !== 'trait') throw new ArithError(`arg ${k} is not a trait`);
  return x.trait;
}
function argNum(a: HintArg[], k: number): number {
  const x = a[k];
  if (x.t !== 'num') throw new ArithError(`arg ${k} is not a number`);
  return x.n;
}

/** True when some two members holding `t` have numbers differing by `n`. An
 * existential over pairs: it says nothing about the rest of the unit. */
function hasPairDiff(b: Board, members: number[], t: Trait, n: number): boolean {
  const nums = members.filter((i) => hasTrait(b, i, t)).map((i) => b.numbers[i]);
  for (let x = 0; x < nums.length; x++) {
    for (let y = x + 1; y < nums.length; y++) {
      if (Math.abs(nums[x] - nums[y]) === n) return true;
    }
  }
  return false;
}

export const ARITH_EVALUATORS: Record<string, (b: Board, a: HintArg[]) => boolean> = {
  sum_of_trait_in_unit: (b, a) =>
    traitSum(b, unitMembers(b, argUnit(a, 0)), argTrait(a, 1)) === argNum(a, 2),

  diff_of_two_traits_in_unit: (b, a) =>
    hasPairDiff(b, unitMembers(b, argUnit(a, 0)), argTrait(a, 1), argNum(a, 2)),

  more_sum_in_unit_than_unit: (b, a) => {
    const t = argTrait(a, 2);
    return (
      traitSum(b, unitMembers(b, argUnit(a, 0)), t) >
      traitSum(b, unitMembers(b, argUnit(a, 1)), t)
    );
  },

  sum_parity_in_unit: (b, a) => {
    const want = argNum(a, 2);
    if (want !== 0 && want !== 1) throw new ArithError(`parity must be 0 or 1, got ${want}`);
    return traitSum(b, unitMembers(b, argUnit(a, 0)), argTrait(a, 1)) % 2 === want;
  },
};

/**
 * Encode an arithmetic clue as blocking clauses over the cards it names.
 *
 * There is no pseudo-Boolean encoder here and there does not need to be. A
 * weighted sum over an arbitrary set of cards would want one, but every clue in
 * this file is scoped to one unit — or, for the comparison, two — and units on a
 * 4x5 board are small: a column is five cards, a row four, a colour group two or
 * three. So walk the scope's assignments, ask the semantics about each, and
 * forbid the ones it rejects. A five-card unit costs at most 32 clauses of five
 * literals; the widest comparison, a row against a column, costs at most 256 of
 * eight.
 *
 * This is the same idiom `encode.ts` already uses for
 * `all_traits_are_neighbors_in_unit`, for the same reason and under the same
 * ceiling.
 */
export function encodeArith(cnf: Cnf, board: Board, vars: number[], hint: Hint): void {
  if (!IS_ARITH.has(hint.pred)) throw new ArithError(`not an arithmetic predicate: ${hint.pred}`);

  const scope = [
    ...new Set(hint.args.flatMap((a) => (a.t === 'unit' ? unitMembers(board, a.unit) : []))),
  ].sort((x, y) => x - y);

  if (scope.length > MAX_ENUMERATED_UNIT) {
    throw new ArithError(
      `${hint.pred} over ${scope.length} cards exceeds the ${MAX_ENUMERATED_UNIT}-card ceiling`,
    );
  }

  const evaluator = ARITH_EVALUATORS[hint.pred];
  // One scratch board, rewritten per assignment. It spreads `board`, carrying
  // its membership cache along — deliberately, since membership cannot change
  // and re-deriving it 2^n times would dominate the cost.
  const scratch: Board = { ...board, numberwang: [...board.numberwang] };

  for (let combo = 0; combo < 1 << scope.length; combo++) {
    scope.forEach((card, k) => {
      scratch.numberwang[card] = ((combo >> k) & 1) === 1;
    });
    if (evaluator(scratch, hint.args)) continue;
    // Forbid exactly this assignment: at least one of its cards must differ.
    cnf.add(scope.map((card, k) => (((combo >> k) & 1) === 1 ? -vars[card] : vars[card])));
  }
}

const TRAITS: Trait[] = ['numberwang', 'not_numberwang'];

const u = (unit: Unit): HintArg => ({ t: 'unit', unit });
const t = (trait: Trait): HintArg => ({ t: 'trait', trait });
const n = (value: number): HintArg => ({ t: 'num', n: value });

/**
 * Every arithmetic clue that is true of this board.
 *
 * Candidates are read off the solution — a clue that is false of the board is
 * not a clue — so each family proposes the value the board actually has rather
 * than searching a range.
 */
export function arithCandidates(b: Board, units: Unit[]): Hint[] {
  const out: Hint[] = [];
  const membersOf = (unit: Unit) => unitMembers(b, unit);

  for (const trait of TRAITS) {
    for (const unit of units) {
      const mem = membersOf(unit);
      if (mem.length > MAX_ENUMERATED_UNIT) continue;
      const held = mem.filter((i) => hasTrait(b, i, trait));

      // A sum of 0 means the unit holds none of the trait, which
      // number_of_traits_in_unit says more plainly. Skip it.
      if (held.length > 0) {
        const sum = traitSum(b, mem, trait);
        out.push({ pred: 'sum_of_trait_in_unit', args: [u(unit), t(trait), n(sum)] });
        out.push({ pred: 'sum_parity_in_unit', args: [u(unit), t(trait), n(sum % 2)] });
      }

      // Every distinct gap between two of the trait's members.
      const nums = held.map((i) => b.numbers[i]);
      const gaps = new Set<number>();
      for (let x = 0; x < nums.length; x++) {
        for (let y = x + 1; y < nums.length; y++) gaps.add(Math.abs(nums[x] - nums[y]));
      }
      for (const gap of [...gaps].sort((p, q) => p - q)) {
        out.push({ pred: 'diff_of_two_traits_in_unit', args: [u(unit), t(trait), n(gap)] });
      }
    }

    // Comparisons, in the direction that holds, between units of one kind. A
    // cross-kind comparison ("row 1 against the red cards") reads as a riddle
    // rather than a clue, which is why the counting comparisons are same-kind too.
    for (const a of units) {
      for (const c of units) {
        if (a.kind !== c.kind) continue;
        if (JSON.stringify(a) === JSON.stringify(c)) continue;
        if (traitSum(b, membersOf(a), trait) <= traitSum(b, membersOf(c), trait)) continue;
        if (new Set([...membersOf(a), ...membersOf(c)]).size > MAX_ENUMERATED_UNIT) continue;
        out.push({ pred: 'more_sum_in_unit_than_unit', args: [u(a), u(c), t(trait)] });
      }
    }
  }
  return out;
}
