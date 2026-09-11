import { describe, expect, it } from 'vitest';
import { parseHint } from './hint';
import { makeGrid } from './grid';
import { makeBoard } from './predicates';
import { ARITH_EVALUATORS, traitSum } from './arith';

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
    // Blue is cards 2 and 3 — 23 Not Numberwang, 8 Numberwang.
    expect(ev('sum_of_trait_in_unit(unit(colour,blue),numberwang,8)')).toBe(true);
  });
  it('is true at 0 for a unit with none of the trait', () => {
    // Cards 1 and 2 are both Not Numberwang.
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
    // Blue's one Not Numberwang card is 23, an odd sum.
    expect(ev('sum_parity_in_unit(unit(colour,blue),not_numberwang,1)')).toBe(true);
  });
  it('treats an empty sum of 0 as even', () => {
    expect(ev('sum_parity_in_unit(unit(between,pair(1,2)),numberwang,0)')).toBe(true);
  });
});
