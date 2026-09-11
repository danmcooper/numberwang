import type { Hint, HintArg, Trait, Unit, UnitKind } from './hint';

export class UnsupportedShapeError extends Error {}

const name = (i: number) => `#NAME:${i}`;
const names = (i: number) => `#NAMES:${i}`;
const colour = (c: string) => `#COLOUR:${c}`;
const colours = (c: string) => `#COLOURS:${c}`;
/**
 * "3 teal cards" — the colour's whole group, not just the ones being counted.
 * Expanded by the site, which has the board and can count; the renderer works
 * from the hint alone and has no way to know.
 */
const colourN = (c: string) => `#COLOURN:${c}`;

/**
 * How much the renderer says beyond what the source site says.
 *
 * `colourTotals` turns "Exactly 1 teal card has a Not Numberwang card below it"
 * into "Exactly 1 of 3 teal cards has …". The source never states the total, which is
 * fine on its 4x5 board where you can count five cooks at a glance and less fine
 * on a 7x7 with twenty-one colours. Off by default so that `render` stays a
 * claim about what the source would write, which is what the archive fidelity
 * test in corpus.test.ts checks; generation turns it on.
 *
 * Only for clues that put a number on one colour's members. A comparison
 * between two colours ("more numberwang judges than numberwang mechanics") is
 * about the difference, and two totals in one sentence obscure it rather than
 * help.
 */
export interface RenderOptions {
  colourTotals?: boolean;
}

const NO_EXTRAS: RenderOptions = {};
const col = (n: number) => `#C:${n}`;
const between = (a: number, b: number) => `#BETWEEN:pair(${a},${b})`;

/**
 * Non-breaking space. The archive glues "row"/"column" to the number or #C:
 * token that immediately follows it with a U+00A0 rather than a regular
 * space — but only in locative ("in row 3", "Row 3 is the only …") and
 * comparative ("row 3 than row 5") phrasings. The bare-noun ("Only one row
 * has …") and "Row 3 has more …" / "rows 3 and 5" phrasings use a plain
 * space instead. Confirmed against every row/column+number occurrence in
 * puzzles/*.json — corpus.test.ts's renderer-fidelity test pins this.
 */
const NBSP = ' ';

const NOUN: Record<Trait, [string, string]> = {
  numberwang: ['Numberwang card', 'Numberwang cards'],
  not_numberwang: ['Not Numberwang card', 'Not Numberwang cards'],
};

/** The noun a clue uses for a trait. Never "numberwangs": the trait is a
 * verdict on a card, and the card is the thing a clue counts. */
export function plural(t: Trait, n: number): string {
  const [one, many] = NOUN[t];
  return n === 1 ? one : many;
}

const ADJ: Record<Trait, string> = {
  numberwang: 'Numberwang',
  not_numberwang: 'Not Numberwang',
};

/**
 * The trait as a modifier rather than a noun: "3 Numberwang neighbors",
 * "an odd number of Numberwang #COLOURS:teal". The noun in those phrases is
 * something other than the card, so `plural` would say "card" twice.
 */
const adj = (t: Trait) => ADJ[t];

const article = (t: Trait) => `a ${plural(t, 1)}`;

/**
 * "no numberwangs" / "only one numberwang" / "exactly 3 numberwangs".
 *
 * Pass `bare: true` to drop the "exactly" for n >= 2 — ground truth
 * (docs/superpowers/specs/2026-08-29-clue-templates.txt, number_of_traits_in_unit
 * section) attests only "There are N not_numberwangs on the edges", never "... exactly N ...",
 * for the edge unit, unlike every other unit kind in that family.
 */
function quantity(n: number, t: Trait, bare = false): string {
  if (n === 0) return `no ${plural(t, 0)}`;
  if (n === 1) return `only one ${plural(t, 1)}`;
  return bare ? `${n} ${plural(t, n)}` : `exactly ${n} ${plural(t, n)}`;
}

/** "no numberwangs" / "one numberwang" / "3 numberwangs" — for "with exactly …" contexts */
function bareQuantity(n: number, t: Trait): string {
  if (n === 0) return `no ${plural(t, 0)}`;
  if (n === 1) return `one ${plural(t, 1)}`;
  return `${n} ${plural(t, n)}`;
}

/** Locative phrase: where the members of this unit are. */
export function where(u: Unit): string {
  switch (u.kind) {
    case 'row':
      return `in row${NBSP}${u.n}`;
    case 'col':
      return `in column${NBSP}${col(u.n)}`;
    case 'neighbor':
      return `neighboring ${name(u.i)}`;
    case 'between':
      return between(u.a, u.b);
    case 'edge':
      return 'on the edges';
    case 'corner':
      return 'in the corners';
    case 'colour':
      throw new UnsupportedShapeError('colour has no locative phrase');
  }
}

/**
 * `where`, but with a phrase for a colour group too.
 *
 * A colour group is not anywhere, so the phrase is partitive rather than
 * locative: "among the teal cards". `where` itself keeps refusing it, and that
 * refusal is load-bearing — `number_of_traits_in_unit` and
 * `min_number_of_traits_in_unit` have no colour branch of their own, so a total
 * `where` would silently start phrasing clue shapes the archive never contained.
 * The predicates that do want a colour phrasing ask for it, the way
 * `odd_number_of_traits_in_unit` already does inline.
 */
export function unitPhrase(u: Unit): string {
  // The article is written here rather than carried by #COLOURS, because every
  // other site wants the bare noun: "more Numberwang orange cards", "2 orange
  // cards have …".
  return u.kind === 'colour' ? `among the ${colours(u.name)}` : where(u);
}

/** Locative phrase used after "Only one card …": corners read "in a corner". */
export function wherePerson(u: Unit): string {
  return u.kind === 'corner' ? 'in a corner' : where(u);
}

export function dirPhrase(dx: number, dy: number): string {
  if (dx === 1 && dy === 0) return 'directly to the right of them';
  if (dx === -1 && dy === 0) return 'directly to the left of them';
  if (dx === 0 && dy === -1) return 'directly above them';
  if (dx === 0 && dy === 1) return 'directly below them';
  throw new UnsupportedShapeError(`no phrase for direction (${dx},${dy})`);
}

function kindWord(k: UnitKind): string {
  if (k === 'row') return 'row';
  if (k === 'col') return 'column';
  throw new UnsupportedShapeError(`no noun for kind ${k}`);
}

function argUnit(a: HintArg[], k: number): Unit {
  const x = a[k];
  if (x.t !== 'unit') throw new UnsupportedShapeError(`arg ${k} is not a unit`);
  return x.unit;
}
function argKind(a: HintArg[], k: number): UnitKind {
  const x = a[k];
  if (x.t !== 'kind') throw new UnsupportedShapeError(`arg ${k} is not a kind`);
  return x.kind;
}
function argTrait(a: HintArg[], k: number): Trait {
  const x = a[k];
  if (x.t !== 'trait') throw new UnsupportedShapeError(`arg ${k} is not a trait`);
  return x.trait;
}
function argNum(a: HintArg[], k: number): number {
  const x = a[k];
  if (x.t !== 'num') throw new UnsupportedShapeError(`arg ${k} is not a number`);
  return x.n;
}
function argIndex(a: HintArg[], k: number): number {
  const x = a[k];
  if (x.t !== 'index') throw new UnsupportedShapeError(`arg ${k} is not an index`);
  return x.i;
}
function argColour(a: HintArg[], k: number): string {
  const x = a[k];
  if (x.t !== 'colour') throw new UnsupportedShapeError(`arg ${k} is not a colour`);
  return x.name;
}

/** The "…is/are X" side of a two-unit clue. */
function predicateTail(u: Unit, singular: boolean): string {
  if (u.kind === 'neighbor') return `${names(u.i)} neighbor${singular ? '' : 's'}`;
  return where(u);
}

function pairOfSameKind<U extends Unit>(u1: U, u2: Unit): asserts u2 is U {
  if (u1.kind !== u2.kind) {
    throw new UnsupportedShapeError(`mixed unit kinds ${u1.kind}/${u2.kind}`);
  }
}

/** Subject phrase for direction clues: "3 cards on the edges" / "2 #COLOURS:teal". */
function dirSubject(u: Unit, n: number, o: RenderOptions): string {
  if (u.kind === 'colour') {
    if (o.colourTotals) return `Exactly ${n} of ${colourN(u.name)}`;
    return n === 1 ? `Only one ${colour(u.name)}` : `${n} ${colours(u.name)}`;
  }
  return n === 1 ? `Only one card ${wherePerson(u)}` : `${n} cards ${wherePerson(u)}`;
}

/**
 * "2 of the Numberwang cards in row 2 are prime."
 *
 * Shared by the four counting predicates in `arith.ts`, which differ only in the
 * property they name. Zero takes "None … is" and one takes "Exactly one … is",
 * following the archive's own habit of spelling small counts rather than
 * printing them — see `n_colours_have_trait_in_dir`.
 */
function propertyCount(a: HintArg[], countAt: number, property: string): string {
  const cards = `${plural(argTrait(a, 1), 2)} ${unitPhrase(argUnit(a, 0))}`;
  const n = argNum(a, countAt);
  if (n === 0) return `None of the ${cards} is ${property}`;
  if (n === 1) return `Exactly one of the ${cards} is ${property}`;
  return `${n} of the ${cards} are ${property}`;
}

export const RENDERERS: Record<string, (a: HintArg[], o: RenderOptions) => string> = {
  has_trait: (a) => {
    const t = argTrait(a, 1);
    return `${name(argIndex(a, 0))} is ${adj(t)}`;
  },

  number_of_traits: (a) => `There are ${argNum(a, 1)} ${plural(argTrait(a, 0), 2)} in total`,

  number_of_traits_in_unit: (a) => {
    const u = argUnit(a, 0);
    const t = argTrait(a, 1);
    const n = argNum(a, 2);
    if (u.kind === 'neighbor') {
      const q = n === 0 ? `no ${adj(t)} neighbors` : n === 1 ? `only one ${adj(t)} neighbor` : `exactly ${n} ${adj(t)} neighbors`;
      return `${name(u.i)} has ${q}`;
    }
    const verb = n === 1 ? 'There is' : 'There are';
    const bare = u.kind === 'edge';
    return `${verb} ${quantity(n, t, bare)} ${where(u)}`;
  },

  min_number_of_traits_in_unit: (a) => {
    const t = argTrait(a, 1);
    const n = argNum(a, 2);
    const verb = n === 1 ? 'There is' : 'There are';
    return `${verb} at least ${bareQuantity(n, t)} ${where(argUnit(a, 0))}`;
  },

  odd_number_of_traits_in_unit: (a) => {
    const u = argUnit(a, 0);
    const t = argTrait(a, 1);
    if (u.kind === 'colour') return `There's an odd number of ${adj(t)} ${colours(u.name)}`;
    return `There's an odd number of ${plural(t, 2)} ${where(u)}`;
  },

  is_one_of_n_traits_in_unit: (a) => {
    const u = argUnit(a, 0);
    const i = argIndex(a, 1);
    const t = argTrait(a, 2);
    const n = argNum(a, 3);
    if (u.kind === 'neighbor') {
      return `${name(i)} is one of ${names(u.i)} ${n} ${adj(t)} neighbors`;
    }
    return `${name(i)} is one of ${n} ${plural(t, 2)} ${where(u)}`;
  },

  is_not_only_trait_in_unit: (a) =>
    `${name(argIndex(a, 1))} is one of two or more ${plural(argTrait(a, 2), 2)} ${where(argUnit(a, 0))}`,

  all_units_have_at_least_n_traits: (a) => {
    const k = argKind(a, 0);
    const t = argTrait(a, 1);
    const n = argNum(a, 2);
    if (k === 'colour') {
      if (n !== 1) throw new UnsupportedShapeError('colour form only attested for n=1');
      return `There is at least one ${plural(t, 1)} among all colours`;
    }
    if (k === 'neighbor') return `Everyone has at least ${n} ${adj(t)} neighbors`;
    return `Each ${kindWord(k)} has at least ${bareQuantity(n, t)}`;
  },

  only_one_unit_has_exactly_n_traits: (a) => {
    const k = argKind(a, 0);
    const t = argTrait(a, 1);
    const n = argNum(a, 2);
    const tail = n === 0 ? `no ${plural(t, 2)}` : `exactly ${bareQuantity(n, t)}`;
    return `Only one ${kindWord(k)} has ${tail}`;
  },

  more_traits_in_unit_than_unit: (a) => {
    const u1 = argUnit(a, 0);
    const u2 = argUnit(a, 1);
    const t = argTrait(a, 2);
    switch (u1.kind) {
      case 'neighbor':
        pairOfSameKind(u1, u2);
        return `${name(u1.i)} has more ${adj(t)} neighbors than ${name(u2.i)}`;
      case 'row':
        pairOfSameKind(u1, u2);
        return `There are more ${plural(t, 2)} in row${NBSP}${u1.n} than row${NBSP}${u2.n}`;
      case 'col':
        pairOfSameKind(u1, u2);
        return `There are more ${plural(t, 2)} in column${NBSP}${col(u1.n)} than column${NBSP}${col(u2.n)}`;
      case 'colour':
        pairOfSameKind(u1, u2);
        return `There are more ${adj(t)} ${colours(u1.name)} than ${adj(t)} ${colours(u2.name)}`;
      default:
        throw new UnsupportedShapeError(`more_traits_in_unit_than_unit over ${u1.kind}`);
    }
  },

  equal_number_of_traits_in_units: (a) => {
    const u1 = argUnit(a, 0);
    const u2 = argUnit(a, 1);
    const t = argTrait(a, 2);
    switch (u1.kind) {
      case 'neighbor':
        pairOfSameKind(u1, u2);
        return `${name(u1.i)} and ${name(u2.i)} have an equal number of ${adj(t)} neighbors`;
      case 'row':
        pairOfSameKind(u1, u2);
        return `There's an equal number of ${plural(t, 2)} in rows ${u1.n} and ${u2.n}`;
      case 'col':
        pairOfSameKind(u1, u2);
        return `There's an equal number of ${plural(t, 2)} in columns ${col(u1.n)} and ${col(u2.n)}`;
      case 'colour':
        pairOfSameKind(u1, u2);
        return `There are as many ${adj(t)} ${colours(u1.name)} as there are ${adj(t)} ${colours(u2.name)}`;
      default:
        throw new UnsupportedShapeError(`equal_number_of_traits_in_units over ${u1.kind}`);
    }
  },

  more_traits_in_unit_than_traits_in_unit: (a) => {
    const u1 = argUnit(a, 0);
    const t1 = argTrait(a, 1);
    const u2 = argUnit(a, 2);
    const t2 = argTrait(a, 3);
    switch (u1.kind) {
      case 'neighbor':
        pairOfSameKind(u1, u2);
        return `${name(u1.i)} has more ${adj(t1)} neighbors than ${name(u2.i)} has ${adj(t2)} ones`;
      case 'row':
        pairOfSameKind(u1, u2);
        return `There are more ${plural(t1, 2)} in row${NBSP}${u1.n} than ${plural(t2, 2)} in row${NBSP}${u2.n}`;
      case 'col':
        pairOfSameKind(u1, u2);
        return `There are more ${plural(t1, 2)} in column${NBSP}${col(u1.n)} than ${plural(t2, 2)} in column${NBSP}${col(u2.n)}`;
      case 'colour':
        pairOfSameKind(u1, u2);
        return `There are more ${adj(t1)} ${colours(u1.name)} than ${adj(t2)} ${colours(u2.name)}`;
      default:
        throw new UnsupportedShapeError(`more_traits_in_unit_than_traits_in_unit over ${u1.kind}`);
    }
  },

  equal_traits_in_unit_and_traits_in_unit: (a) => {
    const u1 = argUnit(a, 0);
    const t1 = argTrait(a, 1);
    const u2 = argUnit(a, 2);
    const t2 = argTrait(a, 3);
    switch (u1.kind) {
      case 'neighbor':
        pairOfSameKind(u1, u2);
        return `${name(u1.i)} has as many ${adj(t1)} neighbors as ${name(u2.i)} has ${adj(t2)} ones`;
      case 'row':
        pairOfSameKind(u1, u2);
        return `There are as many ${plural(t1, 2)} in row${NBSP}${u1.n} as ${plural(t2, 2)} in row${NBSP}${u2.n}`;
      case 'col':
        pairOfSameKind(u1, u2);
        return `There are as many ${plural(t1, 2)} in column${NBSP}${col(u1.n)} as ${plural(t2, 2)} in column${NBSP}${col(u2.n)}`;
      case 'colour':
        pairOfSameKind(u1, u2);
        return `There are as many ${adj(t1)} ${colours(u1.name)} as there are ${adj(t2)} ${colours(u2.name)}`;
      default:
        throw new UnsupportedShapeError(`equal_traits_in_unit_and_traits_in_unit over ${u1.kind}`);
    }
  },

  more_traits_than_traits_in_unit: (a) => {
    const u = argUnit(a, 0);
    const t1 = argTrait(a, 1);
    const t2 = argTrait(a, 2);
    if (u.kind === 'neighbor') return `${name(u.i)} has more ${adj(t1)} than ${adj(t2)} neighbors`;
    return `There are more ${plural(t1, 2)} than ${plural(t2, 2)} ${where(u)}`;
  },

  equal_traits_and_traits_in_unit: (a) => {
    const u = argUnit(a, 0);
    const t1 = argTrait(a, 1);
    const t2 = argTrait(a, 2);
    if (u.kind === 'colour') {
      return `There's an equal number of ${adj(t1)} and ${adj(t2)} ${colours(u.name)}`;
    }
    return `There are as many ${plural(t1, 2)} as ${plural(t2, 2)} ${where(u)}`;
  },

  has_most_traits: (a) => {
    const u = argUnit(a, 0);
    const t = argTrait(a, 1);
    switch (u.kind) {
      case 'row':
        return `Row ${u.n} has more ${plural(t, 2)} than any other row`;
      case 'col':
        return `Column ${col(u.n)} has more ${plural(t, 2)} than any other column`;
      case 'neighbor':
        return `${name(u.i)} has the most ${adj(t)} neighbors`;
      default:
        throw new UnsupportedShapeError(`has_most_traits over ${u.kind}`);
    }
  },

  only_unit_has_exactly_n_traits: (a) => {
    const u = argUnit(a, 0);
    const t = argTrait(a, 1);
    const n = argNum(a, 2);
    const tail = n === 0 ? `no ${plural(t, 2)}` : `exactly ${bareQuantity(n, t)}`;
    if (u.kind === 'row') return `Row${NBSP}${u.n} is the only row with ${tail}`;
    if (u.kind === 'col') return `Column${NBSP}${col(u.n)} is the only column with ${tail}`;
    if (u.kind === 'neighbor') {
      // Ground truth (only_unit_has_exactly_n_traits, line 214) attests a neighbor-shaped
      // clue: "NAME is the only one with exactly N numberwang neighbor" — singular "neighbor"
      // verbatim regardless of n. The brief's step-1 test expected this shape to throw;
      // ground truth wins per task instructions, so we render it (bug-for-bug) instead.
      return `${name(u.i)} is the only one with exactly ${n} ${adj(t)} neighbor`;
    }
    throw new UnsupportedShapeError(`only_unit_has_exactly_n_traits over ${u.kind}`);
  },

  units_share_n_traits: (a) => {
    const u1 = argUnit(a, 0);
    const u2 = argUnit(a, 1);
    const t = argTrait(a, 2);
    const n = argNum(a, 3);
    if (u1.kind === 'neighbor' && u2.kind === 'neighbor') {
      // The archive's ten instances of this shape all count 1 or more, so the
      // zero wording is ours: spell it "no", as every other zero-count branch of
      // this predicate does. "have 0 numberwang neighbors in common" is not a
      // sentence the source would write.
      const q =
        n === 0 ? `no ${adj(t)} neighbors` : n === 1 ? `only one ${adj(t)} neighbor` : `${n} ${adj(t)} neighbors`;
      return `${name(u1.i)} and ${name(u2.i)} have ${q} in common`;
    }
    if (u1.kind === 'neighbor' && u2.kind !== 'neighbor') {
      // Real archive occurrences of this shape (u1 = neighbor, u2 = non-neighbor) use at
      // least three mutually incompatible sentence structures (puzzles/2026-08-26.json,
      // puzzles/2026-08-18.json, puzzles/2026-07-26.json) — one even needs a total-count
      // number that isn't among this predicate's stored args. There's no way to pick the
      // right phrasing from the hint AST alone, so fail closed per the project's binding
      // constraint instead of emitting a plausible-but-wrong sentence.
      throw new UnsupportedShapeError('units_share_n_traits with neighbor unit first');
    }
    if (n === 0 && u2.kind === 'neighbor') {
      // Ground truth (units_share_n_traits, line 60) attests a distinct zero-count phrasing
      // for a neighbor target: "There are no not_numberwangs BTW who neighbor NAME" — not the
      // generic "No X ... is neighboring NAME" the brief's fallback would otherwise produce.
      return `There are no ${plural(t, 2)} ${where(u1)} who neighbor ${name(u2.i)}`;
    }
    const tail = u2.kind === 'neighbor' ? `neighboring ${name(u2.i)}` : where(u2);
    if (n === 0) return `No ${plural(t, 1)} ${where(u1)} is ${tail}`;
    const verb = n === 1 ? 'is' : 'are';
    return `Exactly ${n} ${plural(t, n)} ${where(u1)} ${verb} ${tail}`;
  },

  units_share_odd_n_traits: (a) => {
    const u1 = argUnit(a, 0);
    const u2 = argUnit(a, 1);
    const t = argTrait(a, 2);
    const nbr = u1.kind === 'neighbor' ? u1 : u2.kind === 'neighbor' ? u2 : null;
    if (nbr === null) throw new UnsupportedShapeError('units_share_odd_n_traits needs a neighbor unit');
    const other = nbr === u1 ? u2 : u1;
    if (other.kind === 'neighbor') {
      throw new UnsupportedShapeError('units_share_odd_n_traits over two neighbor units');
    }
    return `An odd number of ${plural(t, 2)} ${where(other)} neighbor ${name(nbr.i)}`;
  },

  unit_shares_n_out_of_n_traits_with_unit: (a) => {
    const u1 = argUnit(a, 0);
    const u2 = argUnit(a, 1);
    const t = argTrait(a, 2);
    const n = argNum(a, 3);
    const m = argNum(a, 4);
    if (u1.kind === 'neighbor' && u2.kind === 'neighbor' && n !== 1) {
      // Derived from real archive data (puzzles/2026-07-12.json, puzzles/2026-08-28.json,
      // puzzles/2026-08-18.json), not the anonymized ground-truth dump alone (which can't
      // show actual numeric values) — see fix-round-1 report for detail. All three real
      // n!==1 occurrences are n=2 (m in {3,4,5}); unverified for n>=3.
      return `Exactly ${n} of ${names(u1.i)} ${m} ${adj(t)} neighbors also neighbor ${name(u2.i)}`;
    }
    const head = n === 1 ? `Only 1 of the ${m} ${plural(t, 2)}` : `Exactly ${n} of the ${m} ${plural(t, 2)}`;
    const verb = n === 1 ? 'is' : 'are';
    return `${head} ${where(u1)} ${verb} ${predicateTail(u2, n === 1)}`;
  },

  max_number_of_traits_in_neighbors_in_unit: (a) => {
    const t = argTrait(a, 1);
    const n = argNum(a, 2);
    const tail = n === 1 ? `one ${adj(t)} neighbor` : `${n} ${adj(t)} neighbors`;
    return `No one ${where(argUnit(a, 0))} has more than ${tail}`;
  },

  both_traits_in_unit_are_in_unit: (a) =>
    `Both ${plural(argTrait(a, 2), 2)} ${where(argUnit(a, 0))} are ${predicateTail(argUnit(a, 1), false)}`,

  only_trait_in_unit_is_in_unit: (a) =>
    `The only ${plural(argTrait(a, 2), 1)} ${where(argUnit(a, 0))} is ${predicateTail(argUnit(a, 1), true)}`,

  both_traits_are_neighbors_in_unit: (a) =>
    `Both ${plural(argTrait(a, 1), 2)} ${where(argUnit(a, 0))} are connected`,

  all_traits_are_neighbors_in_unit: (a) =>
    `All ${plural(argTrait(a, 1), 2)} ${where(argUnit(a, 0))} are connected`,

  only_one_person_in_unit_has_exactly_n_trait_neighbors: (a, o) => {
    const u = argUnit(a, 0);
    const t = argTrait(a, 1);
    const n = argNum(a, 2);
    const head =
      u.kind !== 'colour'
        ? `Only one card ${wherePerson(u)}`
        : o.colourTotals
          ? `Exactly 1 of ${colourN(u.name)}`
          : `Only one ${colour(u.name)}`;
    const tail =
      n === 0 ? `no ${adj(t)} neighbors` : n === 1 ? `exactly one ${adj(t)} neighbor` : `exactly ${n} ${adj(t)} neighbors`;
    return `${head} has ${tail}`;
  },

  n_in_unit_have_trait_in_dir: (a, o) => {
    const u = argUnit(a, 0);
    const t = argTrait(a, 1);
    const n = argNum(a, 4);
    const verb = n === 1 ? 'has' : 'have';
    return `${dirSubject(u, n, o)} ${verb} ${article(t)} ${dirPhrase(argNum(a, 2), argNum(a, 3))}`;
  },

  n_t_in_unit_have_trait_in_dir: (a) => {
    const u = argUnit(a, 0);
    const t1 = argTrait(a, 1);
    const t2 = argTrait(a, 2);
    const n = argNum(a, 5);
    // Ground truth (docs/superpowers/specs/2026-08-29-clue-templates.txt,
    // n_t_in_unit_have_trait_in_dir section) anonymizes numbers, but cross-referencing real
    // archive occurrences of n=1 shows the dominant phrasing is "Only one X in UNIT has ..."
    // (3 of 4 real occurrences, e.g. puzzles/2026-08-02.json, puzzles/2026-08-20.json,
    // puzzles/2026-08-27.json) — matching this file's convention of always saying "Only one"
    // for a singular subject elsewhere. The brief's bare "One X ..." matched only the minority
    // instance (puzzles/2026-07-21.json); ground truth's dominant form wins per task instructions.
    const head = n === 1 ? `Only one ${plural(t1, 1)}` : `Exactly ${n} ${plural(t1, 2)}`;
    const verb = n === 1 ? 'has' : 'have';
    return `${head} ${where(u)} ${verb} ${article(t2)} ${dirPhrase(argNum(a, 3), argNum(a, 4))}`;
  },

  n_colours_have_trait_in_dir: (a, o) => {
    const p = argColour(a, 0);
    const t = argTrait(a, 1);
    const n = argNum(a, 4);
    // Zero of them is a "No X has ..." in the archive (puzzles/2026-09-01.json),
    // never a "0 Xs have ...". The other counts keep their own phrasings.
    const head = o.colourTotals
      ? n === 0
        ? `None of ${colourN(p)} has`
        : `Exactly ${n} of ${colourN(p)} ${n === 1 ? 'has' : 'have'}`
      : n === 0
        ? `No ${colour(p)} has`
        : n === 1
          ? `Exactly 1 ${colour(p)} has`
          : `${n} ${colours(p)} have`;
    return `${head} ${article(t)} ${dirPhrase(argNum(a, 2), argNum(a, 3))}`;
  },

  // The four arithmetic families. Each takes its noun from `plural` and its unit
  // phrase from `unitPhrase`, so all inherit the #COLOURS tokens and the
  // non-breaking spaces the other twenty-nine already agreed on. `plural(t, 2)`
  // is the plural form even when the unit holds one card: "The Numberwang cards
  // in row 2 add to 25" is right whether that row holds one of them or four.
  sum_of_trait_in_unit: (a) =>
    `The ${plural(argTrait(a, 1), 2)} ${unitPhrase(argUnit(a, 0))} add to ${argNum(a, 2)}`,

  diff_of_two_traits_in_unit: (a) =>
    `Two ${plural(argTrait(a, 1), 2)} ${unitPhrase(argUnit(a, 0))} subtract to ${argNum(a, 2)}`,

  more_sum_in_unit_than_unit: (a) => {
    const t = argTrait(a, 2);
    return (
      `The ${plural(t, 2)} ${unitPhrase(argUnit(a, 0))} add to more than ` +
      `the ${plural(t, 2)} ${where(argUnit(a, 1))}`
    );
  },

  sum_parity_in_unit: (a) => {
    const parity = argNum(a, 2) === 0 ? 'even' : 'odd';
    return `The ${plural(argTrait(a, 1), 2)} ${unitPhrase(argUnit(a, 0))} add to an ${parity} number`;
  },

  n_traits_in_unit_are_prime: (a) => propertyCount(a, 2, 'prime'),
  n_traits_in_unit_are_even: (a) => propertyCount(a, 2, 'even'),
  n_traits_in_unit_are_odd: (a) => propertyCount(a, 2, 'odd'),
  n_traits_in_unit_are_divisible: (a) => propertyCount(a, 3, `divisible by ${argNum(a, 2)}`),
};

export function render(h: Hint, options: RenderOptions = NO_EXTRAS): string {
  const fn = RENDERERS[h.pred];
  if (!fn) throw new UnsupportedShapeError(h.pred);
  return fn(h.args, options);
}

export function canRender(h: Hint): boolean {
  try {
    render(h);
    return true;
  } catch (e) {
    if (e instanceof UnsupportedShapeError) return false;
    throw e;
  }
}
