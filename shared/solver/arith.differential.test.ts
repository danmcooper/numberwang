import { describe, expect, it } from 'vitest';
import { makeGrid } from './grid';
import { type Board, makeBoard, unitMembers } from './predicates';
import { formatHint, type Hint, parseHint } from './hint';
import { Cnf } from './sat';
import { ARITH_EVALUATORS, encodeArith } from './arith';

/**
 * The encoding is pure blocking clauses over the cards the clue names, so it can
 * be checked directly: for every assignment of those cards, the clauses are
 * satisfied exactly when the evaluator says the clue holds. No SAT search needed.
 */
const GRID = makeGrid(4, 5);
const COLOURS = [
  'red', 'red', 'red', 'orange',
  'orange', 'orange', 'yellow', 'yellow',
  'yellow', 'green', 'green', 'green',
  'teal', 'teal', 'blue', 'blue',
  'purple', 'purple', 'pink', 'pink',
];
const NUMBERS = [17, 4, 23, 8, 9, 31, 12, 26, 1, 19, 6, 14, 2, 30, 11, 25, 7, 20, 3, 15];

const boardWith = (numberwang: boolean[]): Board =>
  makeBoard(GRID, COLOURS, NUMBERS, numberwang);

/** Cards a clue's clauses may mention: the union of its units' members. */
function scopeOf(hint: Hint): number[] {
  const b = boardWith(new Array(20).fill(false));
  const seen = new Set<number>();
  for (const a of hint.args) {
    if (a.t === 'unit') for (const i of unitMembers(b, a.unit)) seen.add(i);
  }
  return [...seen].sort((x, y) => x - y);
}

function clausesFor(hint: Hint): number[][] {
  const cnf = new Cnf();
  const vars = Array.from({ length: 20 }, () => cnf.newVar());
  encodeArith(cnf, boardWith(new Array(20).fill(false)), vars, hint);
  return cnf.clauses.map((c) => [...c]);
}

/** Every hint the four predicates can form over this board, at every total that
 * is reachable — plus a spread of totals that are not, so the test also proves
 * the encoding rejects what it should. */
function everyHint(): string[] {
  const out: string[] = [];
  const units = [
    'unit(row,1)', 'unit(row,3)', 'unit(col,2)', 'unit(col,4)',
    'unit(colour,red)', 'unit(colour,teal)', 'unit(between,pair(0,3))',
  ];
  for (const t of ['numberwang', 'not_numberwang']) {
    for (const u of units) {
      for (const n of [0, 1, 8, 17, 25, 44, 60, 200]) {
        out.push(`sum_of_trait_in_unit(${u},${t},${n})`);
        out.push(`diff_of_two_traits_in_unit(${u},${t},${n})`);
      }
      for (const p of [0, 1]) out.push(`sum_parity_in_unit(${u},${t},${p})`);
    }
    out.push(`more_sum_in_unit_than_unit(unit(row,1),unit(row,3),${t})`);
    out.push(`more_sum_in_unit_than_unit(unit(col,2),unit(col,4),${t})`);
    out.push(`more_sum_in_unit_than_unit(unit(row,1),unit(col,2),${t})`);
    out.push(`more_sum_in_unit_than_unit(unit(colour,red),unit(colour,teal),${t})`);
  }
  return out;
}

describe('arithmetic encoding matches its semantics', () => {
  for (const src of everyHint()) {
    it(src, () => {
      const hint = parseHint(src);
      expect(formatHint(hint)).toBe(src);

      const scope = scopeOf(hint);
      expect(scope.length).toBeLessThanOrEqual(16);
      const clauses = clausesFor(hint);

      for (let combo = 0; combo < 1 << scope.length; combo++) {
        const numberwang = new Array<boolean>(20).fill(false);
        scope.forEach((card, k) => {
          numberwang[card] = ((combo >> k) & 1) === 1;
        });

        const semantics = ARITH_EVALUATORS[hint.pred](boardWith(numberwang), hint.args);

        // A clause is satisfied when any literal is true. Variable v is 1-based
        // and corresponds to card v-1; a negative literal reads the other way up.
        const cnfHolds = clauses.every((clause) =>
          clause.some((lit) => (lit > 0 ? numberwang[lit - 1] : !numberwang[-lit - 1])),
        );

        expect(cnfHolds, `combo ${combo} of ${src}`).toBe(semantics);
      }
    });
  }
});

describe('the unit-size ceiling', () => {
  it('refuses a clue over a unit past the enumeration ceiling', () => {
    // The board's edge is 14 cards and the ceiling is 16, so a clue over the
    // whole edge is within it. Unioning an interior column adds its three
    // interior cards and pushes the scope to 17.
    const hint = parseHint('more_sum_in_unit_than_unit(unit(edge,void),unit(col,2),numberwang)');
    expect(scopeOf(hint)).toHaveLength(17);
    expect(() => clausesFor(hint)).toThrow(/ceiling/);
  });
});
