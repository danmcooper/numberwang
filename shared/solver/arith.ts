/**
 * The four clue families that do arithmetic on the cards' numbers.
 *
 * Everything Clues by Sam wrote is a function of the hidden verdict alone —
 * counting cards, comparing counts, checking adjacency. These read the numbers
 * as values, which is the one thing a name could never do.
 *
 * Two groups. Four do arithmetic over a unit's total — its sum, a gap between
 * two of its cards, a comparison against another unit, the sum's parity. Four
 * more count the cards in a unit whose own number is prime, even, odd, or
 * divisible by something. Both groups encode identically, because both are
 * arbitrary Boolean functions of one small set of cards.
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

/** The four that work on a unit's total. */
export const SUM_PREDS = [
  'sum_of_trait_in_unit',
  'diff_of_two_traits_in_unit',
  'more_sum_in_unit_than_unit',
  'sum_parity_in_unit',
] as const;

/** The four that count cards by a property of their own number. */
export const PROP_PREDS = [
  'n_traits_in_unit_are_prime',
  'n_traits_in_unit_are_even',
  'n_traits_in_unit_are_odd',
  'n_traits_in_unit_are_divisible',
] as const;

/** Both groups, in the order this file defines them. */
export const ARITH_PREDS = [...SUM_PREDS, ...PROP_PREDS] as const;

export const IS_ARITH: ReadonlySet<string> = new Set<string>(ARITH_PREDS);

/**
 * Whether `x` is prime. Numbers on a board run 1..size, so trial division to
 * the square root is not merely adequate, it is over-engineering.
 */
export function isPrime(x: number): boolean {
  if (x < 2) return false;
  for (let d = 2; d * d <= x; d++) if (x % d === 0) return false;
  return true;
}

/**
 * The smallest divisor a divisibility clue may name.
 *
 * Three. "Divisible by 1" is every card and "divisible by 2" is
 * `n_traits_in_unit_are_even` in worse English, so both are excluded rather than
 * left to produce a clue the player has already been given.
 */
export const MIN_DIVISOR = 3;

/**
 * The fewest multiples of a divisor a unit must hold for the clue to be worth
 * asking.
 *
 * Two. See the proposal loop: below that the divisor picks out one card and the
 * count stops being arithmetic. This is also what keeps the divisors small
 * without naming a ceiling — on a 1..20 board only 3, 4 and 5 have two
 * multiples inside a colour group often enough to matter.
 */
export const MIN_MULTIPLES = 2;

/** Count of the members holding `t` whose number satisfies `ok`. */
function countWhere(
  b: Board,
  members: number[],
  t: Trait,
  ok: (x: number) => boolean,
): number {
  let n = 0;
  for (const i of members) if (hasTrait(b, i, t) && ok(b.numbers[i])) n++;
  return n;
}

/** The property each counting predicate tests, given its arguments. */
const PROPERTY: Record<string, (a: HintArg[]) => (x: number) => boolean> = {
  n_traits_in_unit_are_prime: () => isPrime,
  n_traits_in_unit_are_even: () => (x) => x % 2 === 0,
  n_traits_in_unit_are_odd: () => (x) => x % 2 === 1,
  n_traits_in_unit_are_divisible: (a) => {
    const d = argNum(a, 2);
    if (d < MIN_DIVISOR) throw new ArithError(`divisor must be at least ${MIN_DIVISOR}, got ${d}`);
    return (x) => x % d === 0;
  },
};

/** Where each counting predicate keeps the count it asserts. */
const COUNT_AT: Record<string, number> = {
  n_traits_in_unit_are_prime: 2,
  n_traits_in_unit_are_even: 2,
  n_traits_in_unit_are_odd: 2,
  n_traits_in_unit_are_divisible: 3,
};

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

  // All four counting predicates are the same evaluator over a different
  // property, so they share one rather than repeating it with the test swapped.
  ...Object.fromEntries(
    PROP_PREDS.map((pred) => [
      pred,
      (b: Board, a: HintArg[]) =>
        countWhere(b, unitMembers(b, argUnit(a, 0)), argTrait(a, 1), PROPERTY[pred](a)) ===
        argNum(a, COUNT_AT[pred]),
    ]),
  ),
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
        // Parity only says something if it could have come out the other way.
        // Flipping one card changes the sum's parity exactly when that card's
        // number is odd, so a unit of all-even numbers sums even under every
        // assignment and the clue is a tautology — true of the board, but true
        // of every other board too, which is worse than uninformative because
        // the generator would count it as progress.
        if (mem.some((i) => b.numbers[i] % 2 === 1)) {
          out.push({ pred: 'sum_parity_in_unit', args: [u(unit), t(trait), n(sum % 2)] });
        }
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

    // The counting predicates. Each proposes the count the board actually has,
    // but only where that count could have come out differently: if no member of
    // the unit has the property at all, the count is 0 under every assignment
    // and the clue is a tautology dressed as arithmetic.
    for (const unit of units) {
      const mem = membersOf(unit);
      if (mem.length > MAX_ENUMERATED_UNIT) continue;

      const propose = (pred: string, ok: (x: number) => boolean, extra: HintArg[]) => {
        if (!mem.some((i) => ok(b.numbers[i]))) return;
        const count = mem.filter((i) => hasTrait(b, i, trait) && ok(b.numbers[i])).length;
        out.push({ pred, args: [u(unit), t(trait), ...extra, n(count)] });
      };

      propose('n_traits_in_unit_are_prime', isPrime, []);
      propose('n_traits_in_unit_are_even', (x) => x % 2 === 0, []);
      propose('n_traits_in_unit_are_odd', (x) => x % 2 === 1, []);
      // Only divisors with at least `MIN_MULTIPLES` multiples inside the unit,
      // which also rules out every divisor above its largest number. One
      // multiple is the degenerate case the tautology guard above misses: with
      // a single multiple in the unit, the count is that one card's verdict
      // written in arithmetic, so "exactly one of the teal cards is evenly
      // divisible by 9" is just "18 is Numberwang" with the answer spelled out.
      // Two is what makes the player choose between cards.
      const largest = Math.max(0, ...mem.map((i) => b.numbers[i]));
      for (let d = MIN_DIVISOR; d <= largest; d++) {
        if (mem.filter((i) => b.numbers[i] % d === 0).length < MIN_MULTIPLES) continue;
        propose('n_traits_in_unit_are_divisible', (x) => x % d === 0, [n(d)]);
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
