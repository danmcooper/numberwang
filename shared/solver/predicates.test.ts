import { describe, expect, it } from 'vitest';
import { makeGrid } from './grid';
import { ARG_KINDS, parseHint } from './hint';
import { type Board, countTrait, evaluate, EVALUATORS, makeBoard, unitMembers, unitsOfKind } from './predicates';

// 4x5. Numberwangs at 0, 1, 6, 13, 19.
const CRIMINALS = [0, 1, 6, 13, 19];
const PROFS = [
  'cook', 'cook', 'cop', 'cop',
  'cook', 'cop', 'pilot', 'pilot',
  'pilot', 'pilot', 'cook', 'cop',
  'cook', 'cook', 'cop', 'cop',
  'pilot', 'pilot', 'pilot', 'cook',
];
const board: Board = {
  grid: makeGrid(4, 5),
  colours: PROFS,
  numbers: Array.from({ length: 20 }, (_, i) => i + 1),
  numberwang: Array.from({ length: 20 }, (_, i) => CRIMINALS.includes(i)),
};

const ok = (s: string) => evaluate(board, parseHint(s));

describe('unitMembers', () => {
  it('resolves every unit kind', () => {
    expect(unitMembers(board, { kind: 'row', n: 2 })).toEqual([4, 5, 6, 7]);
    expect(unitMembers(board, { kind: 'col', n: 3 })).toEqual([2, 6, 10, 14, 18]);
    expect(unitMembers(board, { kind: 'neighbor', i: 5 })).toEqual([0, 1, 2, 4, 6, 8, 9, 10]);
    expect(unitMembers(board, { kind: 'between', a: 2, b: 14 })).toEqual([2, 6, 10, 14]);
    expect(unitMembers(board, { kind: 'corner' })).toEqual([0, 3, 16, 19]);
    expect(unitMembers(board, { kind: 'colour', name: 'cop' })).toEqual([2, 3, 5, 11, 14, 15]);
  });
});

describe('unitsOfKind', () => {
  it('enumerates instances', () => {
    expect(unitsOfKind(board, 'row')).toHaveLength(5);
    expect(unitsOfKind(board, 'col')).toHaveLength(4);
    expect(unitsOfKind(board, 'neighbor')).toHaveLength(20);
    expect(unitsOfKind(board, 'edge')).toEqual([{ kind: 'edge' }]);
    expect(unitsOfKind(board, 'colour').map((u) => (u as { name: string }).name).sort()).toEqual(
      ['cook', 'cop', 'pilot'],
    );
  });
});

describe('countTrait', () => {
  it('counts both traits over a member list', () => {
    expect(countTrait(board, [0, 1, 2, 3], 'numberwang')).toBe(2);
    expect(countTrait(board, [0, 1, 2, 3], 'not_numberwang')).toBe(2);
  });
});

describe('counting predicates', () => {
  it('has_trait', () => {
    expect(ok('has_trait(0,numberwang)')).toBe(true);
    expect(ok('has_trait(0,not_numberwang)')).toBe(false);
    expect(ok('has_trait(2,not_numberwang)')).toBe(true);
  });
  it('number_of_traits', () => {
    expect(ok('number_of_traits(numberwang,5)')).toBe(true);
    expect(ok('number_of_traits(not_numberwang,15)')).toBe(true);
    expect(ok('number_of_traits(numberwang,4)')).toBe(false);
  });
  it('number_of_traits_in_unit', () => {
    expect(ok('number_of_traits_in_unit(unit(row,1),numberwang,2)')).toBe(true);
    expect(ok('number_of_traits_in_unit(unit(corner,void),numberwang,2)')).toBe(true);
    expect(ok('number_of_traits_in_unit(unit(between,pair(4,7)),numberwang,1)')).toBe(true);
  });
  it('min_number_of_traits_in_unit is >=', () => {
    expect(ok('min_number_of_traits_in_unit(unit(row,1),numberwang,2)')).toBe(true);
    expect(ok('min_number_of_traits_in_unit(unit(row,1),numberwang,1)')).toBe(true);
    expect(ok('min_number_of_traits_in_unit(unit(row,1),numberwang,3)')).toBe(false);
  });
  it('odd_number_of_traits_in_unit', () => {
    expect(ok('odd_number_of_traits_in_unit(unit(row,1),numberwang)')).toBe(false);
    expect(ok('odd_number_of_traits_in_unit(unit(row,2),numberwang)')).toBe(true);
  });
  it('is_one_of_n_traits_in_unit requires membership and the trait', () => {
    expect(ok('is_one_of_n_traits_in_unit(unit(row,1),0,numberwang,2)')).toBe(true);
    expect(ok('is_one_of_n_traits_in_unit(unit(row,1),2,numberwang,2)')).toBe(false);
    expect(ok('is_one_of_n_traits_in_unit(unit(row,2),0,numberwang,2)')).toBe(false);
  });
  it('is_not_only_trait_in_unit', () => {
    expect(ok('is_not_only_trait_in_unit(unit(row,1),0,numberwang)')).toBe(true);
    expect(ok('is_not_only_trait_in_unit(unit(row,2),6,numberwang)')).toBe(false);
  });
  it('all_units_have_at_least_n_traits ranges over a bare kind', () => {
    expect(ok('all_units_have_at_least_n_traits(row,not_numberwang,2)')).toBe(true);
    expect(ok('all_units_have_at_least_n_traits(row,numberwang,1)')).toBe(false);
    expect(ok('all_units_have_at_least_n_traits(col,not_numberwang,2)')).toBe(true);
  });
  it('only_one_unit_has_exactly_n_traits', () => {
    expect(ok('only_one_unit_has_exactly_n_traits(row,numberwang,2)')).toBe(true);
    expect(ok('only_one_unit_has_exactly_n_traits(row,numberwang,1)')).toBe(false);
    expect(ok('only_one_unit_has_exactly_n_traits(row,numberwang,0)')).toBe(true);
  });
});

describe('comparison predicates', () => {
  it('more_traits_in_unit_than_unit is strict', () => {
    expect(ok('more_traits_in_unit_than_unit(unit(row,1),unit(row,2),numberwang)')).toBe(true);
    expect(ok('more_traits_in_unit_than_unit(unit(row,2),unit(row,1),numberwang)')).toBe(false);
    expect(ok('more_traits_in_unit_than_unit(unit(row,2),unit(row,4),numberwang)')).toBe(false);
  });
  it('equal_number_of_traits_in_units', () => {
    expect(ok('equal_number_of_traits_in_units(unit(row,2),unit(row,4),numberwang)')).toBe(true);
    expect(ok('equal_number_of_traits_in_units(unit(row,1),unit(row,2),numberwang)')).toBe(false);
  });
  it('more_traits_than_traits_in_unit compares two traits inside one unit', () => {
    expect(ok('more_traits_than_traits_in_unit(unit(row,1),numberwang,not_numberwang)')).toBe(false);
    expect(ok('more_traits_than_traits_in_unit(unit(row,3),not_numberwang,numberwang)')).toBe(true);
  });
  it('equal_traits_and_traits_in_unit', () => {
    expect(ok('equal_traits_and_traits_in_unit(unit(row,1),numberwang,not_numberwang)')).toBe(true);
    expect(ok('equal_traits_and_traits_in_unit(unit(row,2),numberwang,not_numberwang)')).toBe(false);
  });
  // The two comparisons above vary one thing each: same trait across two units,
  // or two traits inside one unit. These vary both, which the source never does
  // and which nothing about the game forbids: "there are as many not_numberwang cooks
  // as numberwang cops" is a perfectly ordinary deduction to hand a player.
  it('more_traits_in_unit_than_traits_in_unit compares across both units and traits', () => {
    // Card 5 has 3 numberwang neighbors, card 0 has 2 not_numberwang ones.
    expect(ok('more_traits_in_unit_than_traits_in_unit(unit(neighbor,5),numberwang,unit(neighbor,0),not_numberwang)')).toBe(true);
    expect(ok('more_traits_in_unit_than_traits_in_unit(unit(neighbor,0),not_numberwang,unit(neighbor,5),numberwang)')).toBe(false);
  });
  it('equal_traits_in_unit_and_traits_in_unit', () => {
    // Card 0 has 2 not_numberwang neighbors, card 1 has 2 numberwang ones.
    expect(ok('equal_traits_in_unit_and_traits_in_unit(unit(neighbor,0),not_numberwang,unit(neighbor,1),numberwang)')).toBe(true);
    expect(ok('equal_traits_in_unit_and_traits_in_unit(unit(neighbor,0),numberwang,unit(neighbor,1),not_numberwang)')).toBe(false);
  });
  it('has_most_traits is a strict maximum over the same kind', () => {
    expect(ok('has_most_traits(unit(row,1),numberwang)')).toBe(true);
    expect(ok('has_most_traits(unit(row,2),numberwang)')).toBe(false);
    expect(ok('has_most_traits(unit(col,2),numberwang)')).toBe(true);
  });
  it('only_unit_has_exactly_n_traits', () => {
    expect(ok('only_unit_has_exactly_n_traits(unit(row,1),numberwang,2)')).toBe(true);
    expect(ok('only_unit_has_exactly_n_traits(unit(row,2),numberwang,1)')).toBe(false);
  });
  it('units_share_n_traits counts the intersection', () => {
    expect(ok('units_share_n_traits(unit(row,1),unit(col,1),numberwang,1)')).toBe(true);
    expect(ok('units_share_n_traits(unit(row,1),unit(row,2),numberwang,0)')).toBe(true);
  });
  it('units_share_odd_n_traits', () => {
    expect(ok('units_share_odd_n_traits(unit(row,1),unit(col,1),numberwang)')).toBe(true);
    expect(ok('units_share_odd_n_traits(unit(row,1),unit(row,2),numberwang)')).toBe(false);
  });
  it('unit_shares_n_out_of_n_traits_with_unit constrains total and overlap', () => {
    expect(ok('unit_shares_n_out_of_n_traits_with_unit(unit(row,1),unit(col,1),numberwang,1,2)')).toBe(
      true,
    );
    expect(ok('unit_shares_n_out_of_n_traits_with_unit(unit(row,1),unit(col,1),numberwang,1,1)')).toBe(
      false,
    );
    expect(ok('unit_shares_n_out_of_n_traits_with_unit(unit(row,1),unit(col,1),numberwang,2,2)')).toBe(
      false,
    );
  });
});

describe('adjacency and direction predicates', () => {
  it('covers every predicate in the signature table', () => {
    expect(Object.keys(EVALUATORS).sort()).toEqual(Object.keys(ARG_KINDS).sort());
  });
  it('max_number_of_traits_in_neighbors_in_unit caps every member', () => {
    // row 5 is 16..19; numberwang-neighbour counts: 16->1 (13), 17->1 (13), 18->2 (13,19), 19->0.
    // Max across the unit is 2.
    expect(ok('max_number_of_traits_in_neighbors_in_unit(unit(row,5),numberwang,2)')).toBe(true);
    expect(ok('max_number_of_traits_in_neighbors_in_unit(unit(row,5),numberwang,1)')).toBe(false);
  });
  it('both_traits_are_neighbors_in_unit needs exactly two, adjacent', () => {
    expect(ok('both_traits_are_neighbors_in_unit(unit(row,1),numberwang)')).toBe(true);
    expect(ok('both_traits_are_neighbors_in_unit(unit(col,1),numberwang)')).toBe(false);
    expect(ok('both_traits_are_neighbors_in_unit(unit(between,pair(0,2)),numberwang)')).toBe(true);
  });
  it('all_traits_are_neighbors_in_unit is 8-way connectivity', () => {
    expect(ok('all_traits_are_neighbors_in_unit(unit(row,1),numberwang)')).toBe(true);
    // col 2 numberwangs are 1 and 13, not neighbours of each other.
    expect(ok('all_traits_are_neighbors_in_unit(unit(col,2),numberwang)')).toBe(false);
  });
  it('both_traits_in_unit_are_in_unit', () => {
    expect(ok('both_traits_in_unit_are_in_unit(unit(row,1),unit(col,1),numberwang)')).toBe(false);
    expect(ok('both_traits_in_unit_are_in_unit(unit(row,1),unit(row,1),numberwang)')).toBe(true);
  });
  it('only_trait_in_unit_is_in_unit', () => {
    expect(ok('only_trait_in_unit_is_in_unit(unit(row,2),unit(col,3),numberwang)')).toBe(true);
    expect(ok('only_trait_in_unit_is_in_unit(unit(row,1),unit(col,3),numberwang)')).toBe(false);
  });
  it('only_one_person_in_unit_has_exactly_n_trait_neighbors', () => {
    // row 1 members 0..3, numberwang-neighbour counts: 0->1, 1->2, 2->2, 3->1 (two members tie at 1).
    expect(ok('only_one_person_in_unit_has_exactly_n_trait_neighbors(unit(row,1),numberwang,1)')).toBe(
      false,
    );
    // row 3 members 8..11, numberwang-neighbour counts: 8->1, 9->2, 10->2, 11->1 (none reach 3).
    expect(ok('only_one_person_in_unit_has_exactly_n_trait_neighbors(unit(row,3),numberwang,3)')).toBe(
      false,
    );
  });
  it('n_in_unit_have_trait_in_dir counts on-grid offsets only', () => {
    // corners 0,3,16,19 with an not_numberwang directly to the right: 0->1 numberwang (no),
    // 3 off-grid, 16->17 not_numberwang (yes), 19 off-grid.
    expect(ok('n_in_unit_have_trait_in_dir(unit(corner,void),not_numberwang,1,0,1)')).toBe(true);
    expect(ok('n_in_unit_have_trait_in_dir(unit(corner,void),not_numberwang,1,0,2)')).toBe(false);
  });
  it('n_t_in_unit_have_trait_in_dir filters the source by trait too', () => {
    // numberwangs in row 1 are 0 and 1; to the right: 1 (numberwang), 2 (not_numberwang).
    expect(ok('n_t_in_unit_have_trait_in_dir(unit(row,1),numberwang,not_numberwang,1,0,1)')).toBe(true);
    expect(ok('n_t_in_unit_have_trait_in_dir(unit(row,1),numberwang,numberwang,1,0,1)')).toBe(true);
  });
  it('n_colours_have_trait_in_dir ranges over a colour', () => {
    // cooks are 0,1,4,10,12,13,19; directly below each: 4,5,8,14,16,17,off-grid.
    // not_numberwang among those: 4(y),5(y),8(y),14(y),16(y),17(y) -> 6
    expect(ok('n_colours_have_trait_in_dir(cook,not_numberwang,0,1,6)')).toBe(true);
    expect(ok('n_colours_have_trait_in_dir(cook,not_numberwang,0,1,7)')).toBe(false);
  });
});

describe('board numbers and colours', () => {
  const grid = makeGrid(2, 2);
  const colours = ['red', 'blue', 'red', 'teal'];
  const numbers = [3, 1, 4, 2];
  const board = makeBoard(grid, colours, numbers, [true, false, true, false]);

  it('exposes each card its number', () => {
    expect(board.numbers).toEqual([3, 1, 4, 2]);
  });

  it('groups cards by colour', () => {
    expect(unitMembers(board, { kind: 'colour', name: 'red' })).toEqual([0, 2]);
  });
});
