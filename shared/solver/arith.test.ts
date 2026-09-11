import { describe, expect, it } from 'vitest';
import { type Unit, formatHint, parseHint } from './hint';
import { makeGrid } from './grid';
import { makeBoard } from './predicates';
import { ARITH_EVALUATORS, ArithError, arithCandidates, isPrime, traitSum } from './arith';

// A 4x2 board. Row 1 is cards 0..3, row 2 is cards 4..7.
//   numbers  17  4  23   8        (row 1)
//             9 31  12  26        (row 2)
//   verdict   Y  N   N   Y        (row 1) -> Numberwang sum 25
//             N  Y   Y   N        (row 2) -> Numberwang sum 43
const board = () =>
  makeBoard(
    makeGrid(4, 2),
    ['red', 'red', 'blue', 'blue', 'teal', 'teal', 'pink', 'pink'],
    [17, 4, 23, 8, 9, 31, 12, 26],
    [true, false, false, true, false, true, true, false],
  );

const ev = (src: string) => {
  const h = parseHint(src);
  return ARITH_EVALUATORS[h.pred](board(), h.args);
};

describe('traitSum', () => {
  it('adds the numbers of the cards holding the trait', () => {
    expect(traitSum(board(), [0, 1, 2, 3], 'numberwang')).toBe(25);
    expect(traitSum(board(), [0, 1, 2, 3], 'not_numberwang')).toBe(27);
  });

  it('is zero when no member holds the trait', () => {
    expect(traitSum(board(), [1, 2], 'numberwang')).toBe(0);
  });
});

describe('sum_of_trait_in_unit', () => {
  it('is true at the exact total', () => {
    expect(ev('sum_of_trait_in_unit(unit(row,1),numberwang,25)')).toBe(true);
  });
  it('is false at any other total', () => {
    expect(ev('sum_of_trait_in_unit(unit(row,1),numberwang,24)')).toBe(false);
  });
  it('counts the other trait too', () => {
    expect(ev('sum_of_trait_in_unit(unit(row,1),not_numberwang,27)')).toBe(true);
  });
  it('sums a colour group as readily as a row', () => {
    // Blue is cards 2 and 3 — 23 Wangernumb, 8 Numberwang.
    expect(ev('sum_of_trait_in_unit(unit(colour,blue),numberwang,8)')).toBe(true);
  });
  it('is true at 0 for a unit with none of the trait', () => {
    // Cards 1 and 2 are both Wangernumb.
    expect(ev('sum_of_trait_in_unit(unit(between,pair(1,2)),numberwang,0)')).toBe(true);
  });
});

describe('diff_of_two_traits_in_unit', () => {
  it('is true when some pair differs by n', () => {
    // Row 1's Numberwang cards are 17 and 8 -> difference 9.
    expect(ev('diff_of_two_traits_in_unit(unit(row,1),numberwang,9)')).toBe(true);
  });
  it('is false when no pair differs by n', () => {
    expect(ev('diff_of_two_traits_in_unit(unit(row,1),numberwang,4)')).toBe(false);
  });
  it('is false when fewer than two members hold the trait', () => {
    expect(ev('diff_of_two_traits_in_unit(unit(colour,blue),numberwang,0)')).toBe(false);
  });
  it('reads the difference unsigned', () => {
    // Row 2's Numberwang cards are 31 and 12 -> 19, in either order.
    expect(ev('diff_of_two_traits_in_unit(unit(row,2),numberwang,19)')).toBe(true);
  });
});

describe('more_sum_in_unit_than_unit', () => {
  it('is true when the first unit sums higher', () => {
    expect(ev('more_sum_in_unit_than_unit(unit(row,2),unit(row,1),numberwang)')).toBe(true);
  });
  it('is false when it sums lower', () => {
    expect(ev('more_sum_in_unit_than_unit(unit(row,1),unit(row,2),numberwang)')).toBe(false);
  });
  it('is false on a tie', () => {
    expect(ev('more_sum_in_unit_than_unit(unit(row,1),unit(row,1),numberwang)')).toBe(false);
  });
});

describe('sum_parity_in_unit', () => {
  it('is true when the parity matches — 25 is odd', () => {
    expect(ev('sum_parity_in_unit(unit(row,1),numberwang,1)')).toBe(true);
  });
  it('is false when it does not', () => {
    expect(ev('sum_parity_in_unit(unit(row,1),numberwang,0)')).toBe(false);
  });
  it('reads the other trait as readily', () => {
    // Blue's one Wangernumb card is 23, an odd sum.
    expect(ev('sum_parity_in_unit(unit(colour,blue),not_numberwang,1)')).toBe(true);
  });
  it('treats an empty sum of 0 as even', () => {
    expect(ev('sum_parity_in_unit(unit(between,pair(1,2)),numberwang,0)')).toBe(true);
  });
});

describe('arithCandidates', () => {
  const units: Unit[] = [
    { kind: 'row', n: 1 },
    { kind: 'row', n: 2 },
    { kind: 'colour', name: 'red' },
  ];
  const srcs = () => arithCandidates(board(), units).map(formatHint);

  it('proposes only clues that are true of the board', () => {
    const b = board();
    for (const h of arithCandidates(b, units)) {
      expect(ARITH_EVALUATORS[h.pred](b, h.args), formatHint(h)).toBe(true);
    }
  });

  it("proposes the unit's actual sum", () => {
    expect(srcs()).toContain('sum_of_trait_in_unit(unit(row,1),numberwang,25)');
  });

  it('proposes a pair difference that exists', () => {
    expect(srcs()).toContain('diff_of_two_traits_in_unit(unit(row,1),numberwang,9)');
  });

  it('proposes the comparison in the direction that holds', () => {
    expect(srcs()).toContain('more_sum_in_unit_than_unit(unit(row,2),unit(row,1),numberwang)');
    expect(srcs()).not.toContain('more_sum_in_unit_than_unit(unit(row,1),unit(row,2),numberwang)');
  });

  it('proposes the parity the sum actually has', () => {
    expect(srcs()).toContain('sum_parity_in_unit(unit(row,1),numberwang,1)');
    expect(srcs()).not.toContain('sum_parity_in_unit(unit(row,1),numberwang,0)');
  });

  it('does not compare units of different kinds', () => {
    for (const s of srcs()) {
      if (!s.startsWith('more_sum')) continue;
      const kinds = [...s.matchAll(/unit\((\w+),/g)].map((m) => m[1]);
      expect(new Set(kinds).size).toBe(1);
    }
  });

  it('does not propose a parity the unit could not have contradicted', () => {
    // Pink is cards 6 and 7 — 12 and 26, both even — so every assignment of them
    // sums to an even number and "adds to an even number" is a tautology.
    const pink: Unit[] = [{ kind: 'colour', name: 'pink' }];
    const proposed = arithCandidates(board(), pink).map(formatHint);
    expect(proposed.filter((s) => s.startsWith('sum_parity_in_unit'))).toEqual([]);
    // The sum itself still says something, and is still proposed.
    expect(proposed).toContain('sum_of_trait_in_unit(unit(colour,pink),numberwang,12)');
  });

  it('does not propose a sum over a unit with none of the trait', () => {
    // A sum of 0 tells a player the unit is empty of the trait, which the
    // counting predicates already say better.
    expect(srcs()).not.toContain('sum_of_trait_in_unit(unit(colour,red),numberwang,0)');
  });
});

describe('isPrime', () => {
  it('rejects 0 and 1, which divide nothing usefully', () => {
    expect(isPrime(0)).toBe(false);
    expect(isPrime(1)).toBe(false);
  });
  it('accepts 2 and the odd primes', () => {
    expect([2, 3, 17, 31].map(isPrime)).toEqual([true, true, true, true]);
  });
  it('rejects composites, including odd ones', () => {
    expect([4, 9, 12, 26].map(isPrime)).toEqual([false, false, false, false]);
  });
});

describe('counting by a property of the number', () => {
  it('counts primes among the trait', () => {
    // The whole board is its own edge at 4x2. Numberwang holds 17, 8, 31, 12.
    expect(ev('n_traits_in_unit_are_prime(unit(edge,void),numberwang,2)')).toBe(true);
    expect(ev('n_traits_in_unit_are_prime(unit(row,1),numberwang,1)')).toBe(true);
    expect(ev('n_traits_in_unit_are_prime(unit(row,1),numberwang,2)')).toBe(false);
  });

  it('counts evens and odds separately, and only among the trait', () => {
    expect(ev('n_traits_in_unit_are_even(unit(edge,void),numberwang,2)')).toBe(true);
    expect(ev('n_traits_in_unit_are_odd(unit(edge,void),numberwang,2)')).toBe(true);
    // Row 1's Wangernumb cards are 4 and 23 — one of each.
    expect(ev('n_traits_in_unit_are_even(unit(row,1),not_numberwang,1)')).toBe(true);
    expect(ev('n_traits_in_unit_are_odd(unit(row,1),not_numberwang,1)')).toBe(true);
  });

  it('counts multiples of the divisor it names', () => {
    // Row 2's Numberwang cards are 31 and 12.
    expect(ev('n_traits_in_unit_are_divisible(unit(row,2),numberwang,3,1)')).toBe(true);
    expect(ev('n_traits_in_unit_are_divisible(unit(row,2),numberwang,4,1)')).toBe(true);
    expect(ev('n_traits_in_unit_are_divisible(unit(row,2),numberwang,5,0)')).toBe(true);
    expect(ev('n_traits_in_unit_are_divisible(unit(row,2),numberwang,3,2)')).toBe(false);
  });

  it('refuses a divisor that says nothing new', () => {
    // 1 is every card and 2 is n_traits_in_unit_are_even in worse English.
    expect(() => ev('n_traits_in_unit_are_divisible(unit(row,2),numberwang,2,1)')).toThrow(
      ArithError,
    );
    expect(() => ev('n_traits_in_unit_are_divisible(unit(row,2),numberwang,1,2)')).toThrow(
      ArithError,
    );
  });
});

describe('arithCandidates over number properties', () => {
  const srcsOver = (units: Unit[]) => arithCandidates(board(), units).map(formatHint);

  it('proposes the count the board actually has', () => {
    const srcs = srcsOver([{ kind: 'row', n: 2 }]);
    expect(srcs).toContain('n_traits_in_unit_are_prime(unit(row,2),numberwang,1)');
    expect(srcs).toContain('n_traits_in_unit_are_divisible(unit(row,2),numberwang,3,1)');
    expect(srcs).not.toContain('n_traits_in_unit_are_prime(unit(row,2),numberwang,2)');
  });

  it('proposes nothing whose count could not have differed', () => {
    // Pink is 12 and 26: no prime and no odd number among them, so both counts
    // are 0 under every assignment and neither clue could ever be wrong.
    const srcs = srcsOver([{ kind: 'colour', name: 'pink' }]);
    expect(srcs.filter((x) => x.startsWith('n_traits_in_unit_are_prime'))).toEqual([]);
    expect(srcs.filter((x) => x.startsWith('n_traits_in_unit_are_odd'))).toEqual([]);
    expect(srcs).toContain('n_traits_in_unit_are_even(unit(colour,pink),numberwang,1)');
  });

  it('never names a divisor below the floor, or one that divides nothing here', () => {
    const divisors = srcsOver([{ kind: 'colour', name: 'pink' }])
      .filter((x) => x.startsWith('n_traits_in_unit_are_divisible'))
      .map((x) => Number(/,(\d+),\d+\)$/.exec(x)![1]));
    // Pink holds 12 and 26; 3, 4, 6 and 12 divide the first, 13 and 26 the second.
    expect([...new Set(divisors)].sort((a, b) => a - b)).toEqual([3, 4, 6, 12, 13, 26]);
  });

  it('proposes only clues that are true of the board', () => {
    const b = board();
    const units: Unit[] = [
      { kind: 'row', n: 1 },
      { kind: 'row', n: 2 },
      { kind: 'colour', name: 'pink' },
      { kind: 'edge' },
    ];
    for (const h of arithCandidates(b, units)) {
      expect(ARITH_EVALUATORS[h.pred](b, h.args), formatHint(h)).toBe(true);
    }
  });
});
