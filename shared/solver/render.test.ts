import { describe, expect, it } from 'vitest';
import { ARG_KINDS, parseHint } from './hint';
import { canRender, plural, render, RENDERERS, UnsupportedShapeError } from './render';

const r = (s: string) => render(parseHint(s));

// NOTE: many expected strings below join "row"/"column" to the following number
// or #C: token with a U+00A0 non-breaking space rather than a plain space (looks
// identical in a diff/editor). That matches the archive's convention for locative
// and comparative phrasings — see the `NBSP` constant in render.ts and
// corpus.test.ts's renderer-fidelity test, which measures this against every
// real puzzle in puzzles/*.json.

describe('counting clue templates', () => {
  it('has_trait', () => {
    expect(r('has_trait(11,not_numberwang)')).toBe('#NAME:11 is Not Numberwang');
    expect(r('has_trait(11,numberwang)')).toBe('#NAME:11 is Numberwang');
  });
  it('number_of_traits', () => {
    expect(r('number_of_traits(numberwang,6)')).toBe('There are 6 Numberwang cards in total');
  });
  it('number_of_traits_in_unit over a between segment', () => {
    expect(r('number_of_traits_in_unit(unit(between,pair(4,7)),not_numberwang,1)')).toBe(
      'There is only one Not Numberwang card #BETWEEN:pair(4,7)',
    );
    expect(r('number_of_traits_in_unit(unit(between,pair(4,7)),not_numberwang,3)')).toBe(
      'There are exactly 3 Not Numberwang cards #BETWEEN:pair(4,7)',
    );
    expect(r('number_of_traits_in_unit(unit(between,pair(4,7)),numberwang,0)')).toBe(
      'There are no Numberwang cards #BETWEEN:pair(4,7)',
    );
  });
  it('number_of_traits_in_unit over neighbours, rows, columns, edges, corners', () => {
    expect(r('number_of_traits_in_unit(unit(neighbor,5),numberwang,2)')).toBe(
      '#NAME:5 has exactly 2 Numberwang neighbors',
    );
    expect(r('number_of_traits_in_unit(unit(neighbor,5),not_numberwang,1)')).toBe(
      '#NAME:5 has only one Not Numberwang neighbor',
    );
    expect(r('number_of_traits_in_unit(unit(neighbor,5),numberwang,0)')).toBe(
      '#NAME:5 has no Numberwang neighbors',
    );
    expect(r('number_of_traits_in_unit(unit(row,3),not_numberwang,2)')).toBe(
      'There are exactly 2 Not Numberwang cards in row 3',
    );
    expect(r('number_of_traits_in_unit(unit(col,2),numberwang,1)')).toBe(
      'There is only one Numberwang card in column #C:2',
    );
    // Ground truth (docs/superpowers/specs/2026-08-29-clue-templates.txt, "number_of_traits_in_unit"
    // section) attests only the bare-number phrasing for the edge unit ("There are N Not Numberwang cards on
    // the edges" / "There are N Numberwang cards on the edges") — never "exactly N ... on the edges".
    // The brief's step-1 test used "exactly 7"; ground truth wins per task instructions.
    expect(r('number_of_traits_in_unit(unit(edge,void),not_numberwang,7)')).toBe(
      'There are 7 Not Numberwang cards on the edges',
    );
    expect(r('number_of_traits_in_unit(unit(corner,void),not_numberwang,3)')).toBe(
      'There are exactly 3 Not Numberwang cards in the corners',
    );
  });
  it('min_number_of_traits_in_unit', () => {
    expect(r('min_number_of_traits_in_unit(unit(col,2),not_numberwang,3)')).toBe(
      'There are at least 3 Not Numberwang cards in column #C:2',
    );
    expect(r('min_number_of_traits_in_unit(unit(between,pair(0,3)),not_numberwang,1)')).toBe(
      'There is at least one Not Numberwang card #BETWEEN:pair(0,3)',
    );
  });
  it('odd_number_of_traits_in_unit', () => {
    expect(r('odd_number_of_traits_in_unit(unit(neighbor,12),not_numberwang)')).toBe(
      "There's an odd number of Not Numberwang cards neighboring #NAME:12",
    );
    expect(r('odd_number_of_traits_in_unit(unit(col,3),numberwang)')).toBe(
      "There's an odd number of Numberwang cards in column #C:3",
    );
    expect(r('odd_number_of_traits_in_unit(unit(colour,singer),numberwang)')).toBe(
      "There's an odd number of Numberwang #COLOURS:singer",
    );
  });
  it('is_one_of_n_traits_in_unit', () => {
    expect(r('is_one_of_n_traits_in_unit(unit(neighbor,9),4,not_numberwang,3)')).toBe(
      '#NAME:4 is one of #NAMES:9 3 Not Numberwang neighbors',
    );
    expect(r('is_one_of_n_traits_in_unit(unit(between,pair(0,3)),1,numberwang,2)')).toBe(
      '#NAME:1 is one of 2 Numberwang cards #BETWEEN:pair(0,3)',
    );
    expect(r('is_one_of_n_traits_in_unit(unit(edge,void),7,not_numberwang,5)')).toBe(
      '#NAME:7 is one of 5 Not Numberwang cards on the edges',
    );
  });
  it('is_not_only_trait_in_unit', () => {
    expect(r('is_not_only_trait_in_unit(unit(row,2),5,not_numberwang)')).toBe(
      '#NAME:5 is one of two or more Not Numberwang cards in row 2',
    );
  });
  it('all_units_have_at_least_n_traits', () => {
    expect(r('all_units_have_at_least_n_traits(col,not_numberwang,2)')).toBe(
      'Each column has at least 2 Not Numberwang cards',
    );
    expect(r('all_units_have_at_least_n_traits(row,not_numberwang,1)')).toBe(
      'Each row has at least one Not Numberwang card',
    );
    expect(r('all_units_have_at_least_n_traits(colour,numberwang,1)')).toBe(
      'There is at least one Numberwang card among all colours',
    );
    expect(r('all_units_have_at_least_n_traits(neighbor,numberwang,2)')).toBe(
      'Everyone has at least 2 Numberwang neighbors',
    );
  });
  it('only_one_unit_has_exactly_n_traits', () => {
    expect(r('only_one_unit_has_exactly_n_traits(row,numberwang,2)')).toBe(
      'Only one row has exactly 2 Numberwang cards',
    );
    expect(r('only_one_unit_has_exactly_n_traits(col,not_numberwang,1)')).toBe(
      'Only one column has exactly one Not Numberwang card',
    );
    expect(r('only_one_unit_has_exactly_n_traits(col,numberwang,0)')).toBe(
      'Only one column has no Numberwang cards',
    );
  });
});

describe('comparison clue templates', () => {
  it('more_traits_in_unit_than_unit', () => {
    expect(r('more_traits_in_unit_than_unit(unit(neighbor,3),unit(neighbor,9),numberwang)')).toBe(
      '#NAME:3 has more Numberwang neighbors than #NAME:9',
    );
    expect(r('more_traits_in_unit_than_unit(unit(row,1),unit(row,4),not_numberwang)')).toBe(
      'There are more Not Numberwang cards in row 1 than row 4',
    );
    expect(r('more_traits_in_unit_than_unit(unit(col,1),unit(col,3),numberwang)')).toBe(
      'There are more Numberwang cards in column #C:1 than column #C:3',
    );
    expect(
      r('more_traits_in_unit_than_unit(unit(colour,cook),unit(colour,cop),numberwang)'),
    ).toBe('There are more Numberwang #COLOURS:cook than Numberwang #COLOURS:cop');
  });
  it('equal_number_of_traits_in_units', () => {
    expect(r('equal_number_of_traits_in_units(unit(neighbor,3),unit(neighbor,9),numberwang)')).toBe(
      '#NAME:3 and #NAME:9 have an equal number of Numberwang neighbors',
    );
    expect(r('equal_number_of_traits_in_units(unit(row,1),unit(row,4),not_numberwang)')).toBe(
      "There's an equal number of Not Numberwang cards in rows 1 and 4",
    );
    expect(r('equal_number_of_traits_in_units(unit(col,1),unit(col,3),numberwang)')).toBe(
      "There's an equal number of Numberwang cards in columns #C:1 and #C:3",
    );
    expect(
      r('equal_number_of_traits_in_units(unit(colour,cook),unit(colour,cop),not_numberwang)'),
    ).toBe('There are as many Not Numberwang #COLOURS:cook as there are Not Numberwang #COLOURS:cop');
  });
  it('more_traits_than_traits_in_unit', () => {
    expect(r('more_traits_than_traits_in_unit(unit(between,pair(0,3)),not_numberwang,numberwang)')).toBe(
      'There are more Not Numberwang cards than Numberwang cards #BETWEEN:pair(0,3)',
    );
    expect(r('more_traits_than_traits_in_unit(unit(neighbor,5),numberwang,not_numberwang)')).toBe(
      '#NAME:5 has more Numberwang than Not Numberwang neighbors',
    );
  });
  it('equal_traits_and_traits_in_unit', () => {
    expect(r('equal_traits_and_traits_in_unit(unit(between,pair(0,3)),numberwang,not_numberwang)')).toBe(
      'There are as many Numberwang cards as Not Numberwang cards #BETWEEN:pair(0,3)',
    );
    expect(r('equal_traits_and_traits_in_unit(unit(colour,cop),not_numberwang,numberwang)')).toBe(
      "There's an equal number of Not Numberwang and Numberwang #COLOURS:cop",
    );
  });
  it('more_traits_in_unit_than_traits_in_unit', () => {
    expect(
      r('more_traits_in_unit_than_traits_in_unit(unit(neighbor,3),numberwang,unit(neighbor,9),not_numberwang)'),
    ).toBe('#NAME:3 has more Numberwang neighbors than #NAME:9 has Not Numberwang ones');
    expect(r('more_traits_in_unit_than_traits_in_unit(unit(row,1),not_numberwang,unit(row,4),numberwang)')).toBe(
      'There are more Not Numberwang cards in row 1 than Numberwang cards in row 4',
    );
    expect(r('more_traits_in_unit_than_traits_in_unit(unit(col,1),numberwang,unit(col,3),not_numberwang)')).toBe(
      'There are more Numberwang cards in column #C:1 than Not Numberwang cards in column #C:3',
    );
    expect(
      r('more_traits_in_unit_than_traits_in_unit(unit(colour,cook),not_numberwang,unit(colour,cop),numberwang)'),
    ).toBe('There are more Not Numberwang #COLOURS:cook than Numberwang #COLOURS:cop');
  });
  it('equal_traits_in_unit_and_traits_in_unit', () => {
    expect(
      r('equal_traits_in_unit_and_traits_in_unit(unit(neighbor,3),numberwang,unit(neighbor,9),not_numberwang)'),
    ).toBe('#NAME:3 has as many Numberwang neighbors as #NAME:9 has Not Numberwang ones');
    expect(r('equal_traits_in_unit_and_traits_in_unit(unit(row,1),not_numberwang,unit(row,4),numberwang)')).toBe(
      'There are as many Not Numberwang cards in row 1 as Numberwang cards in row 4',
    );
    expect(r('equal_traits_in_unit_and_traits_in_unit(unit(col,1),numberwang,unit(col,3),not_numberwang)')).toBe(
      'There are as many Numberwang cards in column #C:1 as Not Numberwang cards in column #C:3',
    );
    expect(
      r('equal_traits_in_unit_and_traits_in_unit(unit(colour,cook),not_numberwang,unit(colour,cop),numberwang)'),
    ).toBe('There are as many Not Numberwang #COLOURS:cook as there are Numberwang #COLOURS:cop');
  });
  it('has_most_traits', () => {
    expect(r('has_most_traits(unit(col,2),numberwang)')).toBe(
      'Column #C:2 has more Numberwang cards than any other column',
    );
    expect(r('has_most_traits(unit(row,3),not_numberwang)')).toBe(
      'Row 3 has more Not Numberwang cards than any other row',
    );
    expect(r('has_most_traits(unit(neighbor,7),not_numberwang)')).toBe(
      '#NAME:7 has the most Not Numberwang neighbors',
    );
  });
  it('only_unit_has_exactly_n_traits', () => {
    expect(r('only_unit_has_exactly_n_traits(unit(row,2),not_numberwang,3)')).toBe(
      'Row 2 is the only row with exactly 3 Not Numberwang cards',
    );
    expect(r('only_unit_has_exactly_n_traits(unit(col,4),numberwang,1)')).toBe(
      'Column #C:4 is the only column with exactly one Numberwang card',
    );
    // Ground truth (only_unit_has_exactly_n_traits, line 214) attests this neighbor-shaped
    // clue: "NAME is the only one with exactly N Numberwang neighbor" — singular "neighbor"
    // verbatim regardless of the count. The brief's step-1 test expected this shape to
    // throw UnsupportedShapeError; ground truth wins per task instructions.
    expect(r('only_unit_has_exactly_n_traits(unit(neighbor,4),numberwang,2)')).toBe(
      '#NAME:4 is the only one with exactly 2 Numberwang neighbor',
    );
  });
  it('units_share_n_traits', () => {
    expect(r('units_share_n_traits(unit(neighbor,3),unit(neighbor,9),not_numberwang,1)')).toBe(
      '#NAME:3 and #NAME:9 have only one Not Numberwang neighbor in common',
    );
    expect(r('units_share_n_traits(unit(neighbor,3),unit(neighbor,9),not_numberwang,2)')).toBe(
      '#NAME:3 and #NAME:9 have 2 Not Numberwang neighbors in common',
    );
    // "have 0 Numberwang neighbors in common" is not English the source would write,
    // and every other zero-count branch of this predicate spells the zero as a word.
    expect(r('units_share_n_traits(unit(neighbor,3),unit(neighbor,9),numberwang,0)')).toBe(
      '#NAME:3 and #NAME:9 have no Numberwang neighbors in common',
    );
    expect(r('units_share_n_traits(unit(between,pair(0,3)),unit(neighbor,9),not_numberwang,1)')).toBe(
      'Exactly 1 Not Numberwang card #BETWEEN:pair(0,3) is neighboring #NAME:9',
    );
    expect(r('units_share_n_traits(unit(between,pair(0,3)),unit(neighbor,9),not_numberwang,2)')).toBe(
      'Exactly 2 Not Numberwang cards #BETWEEN:pair(0,3) are neighboring #NAME:9',
    );
    expect(r('units_share_n_traits(unit(between,pair(0,3)),unit(row,2),not_numberwang,0)')).toBe(
      'No Not Numberwang card #BETWEEN:pair(0,3) is in row 2',
    );
    // Ground truth (units_share_n_traits, line 60) attests a distinct zero-count phrasing for
    // a neighbor target: "There are no Not Numberwang cards BTW who neighbor NAME" — not the generic
    // "No X ... is neighboring NAME" the row/col branch above uses. Added beyond the brief's
    // step-1 test to cover this deviation.
    expect(r('units_share_n_traits(unit(between,pair(0,3)),unit(neighbor,9),not_numberwang,0)')).toBe(
      'There are no Not Numberwang cards #BETWEEN:pair(0,3) who neighbor #NAME:9',
    );
    // Fix round 1, Finding 1: neighbor-unit-first paired with a non-neighbor unit has at
    // least 3 mutually incompatible real sentence shapes in the archive (see fix report) —
    // unrenderable from the hint AST alone, so it must throw rather than approximate.
    expect(() => r('units_share_n_traits(unit(neighbor,5),unit(row,2),not_numberwang,1)')).toThrow(
      UnsupportedShapeError,
    );
  });
  it('units_share_odd_n_traits', () => {
    expect(r('units_share_odd_n_traits(unit(between,pair(0,3)),unit(neighbor,9),not_numberwang)')).toBe(
      'An odd number of Not Numberwang cards #BETWEEN:pair(0,3) neighbor #NAME:9',
    );
    expect(r('units_share_odd_n_traits(unit(neighbor,9),unit(row,2),not_numberwang)')).toBe(
      'An odd number of Not Numberwang cards in row 2 neighbor #NAME:9',
    );
    expect(() => r('units_share_odd_n_traits(unit(row,1),unit(row,2),not_numberwang)')).toThrow(
      UnsupportedShapeError,
    );
  });
  it('unit_shares_n_out_of_n_traits_with_unit', () => {
    expect(
      r('unit_shares_n_out_of_n_traits_with_unit(unit(neighbor,5),unit(between,pair(0,3)),numberwang,1,3)'),
    ).toBe('Only 1 of the 3 Numberwang cards neighboring #NAME:5 is #BETWEEN:pair(0,3)');
    expect(
      r('unit_shares_n_out_of_n_traits_with_unit(unit(neighbor,5),unit(neighbor,9),numberwang,1,2)'),
    ).toBe('Only 1 of the 2 Numberwang cards neighboring #NAME:5 is #NAMES:9 neighbor');
    expect(
      r('unit_shares_n_out_of_n_traits_with_unit(unit(edge,void),unit(neighbor,9),numberwang,2,5)'),
    ).toBe('Exactly 2 of the 5 Numberwang cards on the edges are #NAMES:9 neighbors');
    expect(
      r('unit_shares_n_out_of_n_traits_with_unit(unit(neighbor,5),unit(row,3),numberwang,2,4)'),
    ).toBe('Exactly 2 of the 4 Numberwang cards neighboring #NAME:5 are in row 3');
    // Fix round 1, Finding 2: neighbor+neighbor pair with n!==1 uses a distinct "also
    // neighbor" construction, derived from real archive data (puzzles/2026-07-12.json).
    expect(
      r(
        'unit_shares_n_out_of_n_traits_with_unit(unit(neighbor,14),unit(neighbor,12),numberwang,2,4)',
      ),
    ).toBe('Exactly 2 of #NAMES:14 4 Numberwang neighbors also neighbor #NAME:12');
  });
});

describe('adjacency and direction clue templates', () => {
  it('covers every predicate', () => {
    expect(Object.keys(RENDERERS).sort()).toEqual(Object.keys(ARG_KINDS).sort());
  });
  it('max_number_of_traits_in_neighbors_in_unit', () => {
    expect(r('max_number_of_traits_in_neighbors_in_unit(unit(row,2),not_numberwang,3)')).toBe(
      'No one in row 2 has more than 3 Not Numberwang neighbors',
    );
    expect(r('max_number_of_traits_in_neighbors_in_unit(unit(corner,void),not_numberwang,1)')).toBe(
      'No one in the corners has more than one Not Numberwang neighbor',
    );
  });
  it('both_traits_in_unit_are_in_unit', () => {
    expect(
      r('both_traits_in_unit_are_in_unit(unit(between,pair(0,3)),unit(neighbor,9),numberwang)'),
    ).toBe('Both Numberwang cards #BETWEEN:pair(0,3) are #NAMES:9 neighbors');
    expect(
      r('both_traits_in_unit_are_in_unit(unit(neighbor,5),unit(neighbor,9),not_numberwang)'),
    ).toBe('Both Not Numberwang cards neighboring #NAME:5 are #NAMES:9 neighbors');
  });
  it('only_trait_in_unit_is_in_unit', () => {
    expect(r('only_trait_in_unit_is_in_unit(unit(row,2),unit(neighbor,9),numberwang)')).toBe(
      'The only Numberwang card in row 2 is #NAMES:9 neighbor',
    );
    expect(
      r('only_trait_in_unit_is_in_unit(unit(between,pair(0,3)),unit(between,pair(4,7)),numberwang)'),
    ).toBe('The only Numberwang card #BETWEEN:pair(0,3) is #BETWEEN:pair(4,7)');
  });
  it('both_traits_are_neighbors_in_unit and all_traits_are_neighbors_in_unit', () => {
    expect(r('both_traits_are_neighbors_in_unit(unit(between,pair(0,3)),not_numberwang)')).toBe(
      'Both Not Numberwang cards #BETWEEN:pair(0,3) are connected',
    );
    expect(r('all_traits_are_neighbors_in_unit(unit(between,pair(0,3)),numberwang)')).toBe(
      'All Numberwang cards #BETWEEN:pair(0,3) are connected',
    );
  });
  it('only_one_person_in_unit_has_exactly_n_trait_neighbors', () => {
    expect(r('only_one_person_in_unit_has_exactly_n_trait_neighbors(unit(row,2),not_numberwang,3)')).toBe(
      'Only one person in row 2 has exactly 3 Not Numberwang neighbors',
    );
    expect(
      r('only_one_person_in_unit_has_exactly_n_trait_neighbors(unit(corner,void),numberwang,0)'),
    ).toBe('Only one person in a corner has no Numberwang neighbors');
    expect(
      r('only_one_person_in_unit_has_exactly_n_trait_neighbors(unit(colour,mech),numberwang,2)'),
    ).toBe('Only one #COLOUR:mech has exactly 2 Numberwang neighbors');
  });
  it('n_in_unit_have_trait_in_dir', () => {
    expect(r('n_in_unit_have_trait_in_dir(unit(colour,cook),numberwang,1,0,1)')).toBe(
      'Only one #COLOUR:cook has a Numberwang card directly to the right of them',
    );
    expect(r('n_in_unit_have_trait_in_dir(unit(corner,void),numberwang,0,1,2)')).toBe(
      '2 persons in a corner have a Numberwang card directly below them',
    );
    expect(r('n_in_unit_have_trait_in_dir(unit(edge,void),numberwang,0,-1,3)')).toBe(
      '3 persons on the edges have a Numberwang card directly above them',
    );
    expect(r('n_in_unit_have_trait_in_dir(unit(colour,builder),not_numberwang,0,-1,2)')).toBe(
      '2 #COLOURS:builder have a Not Numberwang card directly above them',
    );
  });
  it('n_t_in_unit_have_trait_in_dir', () => {
    expect(r('n_t_in_unit_have_trait_in_dir(unit(row,2),numberwang,numberwang,0,1,2)')).toBe(
      'Exactly 2 Numberwang cards in row 2 have a Numberwang card directly below them',
    );
    // Ground truth (docs/superpowers/specs/2026-08-29-clue-templates.txt,
    // n_t_in_unit_have_trait_in_dir section) anonymizes numbers, but cross-referencing real
    // archive occurrences shows 3 of 4 n=1 cases use "Only one X in UNIT has ..."
    // (puzzles/2026-08-02.json col case, puzzles/2026-08-20.json and puzzles/2026-08-27.json
    // row/col cases) while only 1 of 4 (puzzles/2026-07-21.json, the exact args used here)
    // drops "Only". The brief's step-1 test expected the bare "One Numberwang card ..." form (the
    // minority variant); ground truth's dominant phrasing — also the convention used
    // everywhere else in this file for n=1 subjects — wins per task instructions.
    expect(r('n_t_in_unit_have_trait_in_dir(unit(row,2),numberwang,not_numberwang,1,0,1)')).toBe(
      'Only one Numberwang card in row 2 has a Not Numberwang card directly to the right of them',
    );
  });
  it('n_colours_have_trait_in_dir', () => {
    expect(r('n_colours_have_trait_in_dir(painter,not_numberwang,1,0,2)')).toBe(
      '2 #COLOURS:painter have a Not Numberwang card directly to the right of them',
    );
    expect(r('n_colours_have_trait_in_dir(cook,not_numberwang,-1,0,1)')).toBe(
      'Exactly 1 #COLOUR:cook has a Not Numberwang card directly to the left of them',
    );
    expect(r('n_colours_have_trait_in_dir(singer,not_numberwang,-1,0,0)')).toBe(
      'No #COLOUR:singer has a Not Numberwang card directly to the left of them',
    );
  });
});

// `colourTotals` is an extension, off unless generation asks for it: the
// source site never states a colour's total, and `corpus.test.ts` measures
// the default rendering against every real puzzle. It exists because a 6x6
// board has more colours than you can count at a glance, so "Exactly 1 cook
// has …" leaves a player counting cooks before the clue is usable.
describe('colour totals', () => {
  const rt = (s: string) => render(parseHint(s), { colourTotals: true });

  it('says how many there are in total, in each shape that counts a colour', () => {
    expect(rt('n_colours_have_trait_in_dir(painter,not_numberwang,1,0,2)')).toBe(
      'Exactly 2 of #COLOURN:painter have a Not Numberwang card directly to the right of them',
    );
    expect(rt('n_colours_have_trait_in_dir(cook,not_numberwang,-1,0,1)')).toBe(
      'Exactly 1 of #COLOURN:cook has a Not Numberwang card directly to the left of them',
    );
    expect(rt('n_in_unit_have_trait_in_dir(unit(colour,cook),not_numberwang,0,1,1)')).toBe(
      'Exactly 1 of #COLOURN:cook has a Not Numberwang card directly below them',
    );
    expect(
      rt('only_one_person_in_unit_has_exactly_n_trait_neighbors(unit(colour,cook),not_numberwang,2)'),
    ).toBe('Exactly 1 of #COLOURN:cook has exactly 2 Not Numberwang neighbors');
  });

  // Zero of them is a "None of …" rather than an "Exactly 0 of …", matching the
  // archive's own habit of writing "No cook has …" instead of "0 cooks have …".
  it('says none rather than exactly zero', () => {
    expect(rt('n_colours_have_trait_in_dir(singer,not_numberwang,-1,0,0)')).toBe(
      'None of #COLOURN:singer has a Not Numberwang card directly to the left of them',
    );
  });

  // The clue is about the difference between two colours, and two totals in
  // one sentence bury it. Nothing in these shapes counts one colour's
  // members, so the option has nothing to add and leaves them alone.
  it('leaves colour comparisons and non-colour units untouched', () => {
    for (const hint of [
      // Comparisons: the claim is the difference, and two totals bury it.
      'more_traits_in_unit_than_unit(unit(colour,judge),unit(colour,mechanic),numberwang)',
      'equal_number_of_traits_in_units(unit(colour,coder),unit(colour,cook),not_numberwang)',
      // No count of one colour's members to put a total against.
      'odd_number_of_traits_in_unit(unit(colour,scientist),not_numberwang)',
      // Same shapes as above, over units that are not colours at all.
      'n_in_unit_have_trait_in_dir(unit(row,2),not_numberwang,0,1,2)',
      'only_one_person_in_unit_has_exactly_n_trait_neighbors(unit(col,1),not_numberwang,2)',
    ]) {
      expect(rt(hint), hint).toBe(r(hint));
    }
  });
});

describe('unsupported shapes', () => {
  it('throws rather than inventing a phrasing', () => {
    expect(() => r('number_of_traits_in_unit(unit(colour,cook),not_numberwang,2)')).toThrow(
      UnsupportedShapeError,
    );
    expect(canRender(parseHint('number_of_traits_in_unit(unit(colour,cook),not_numberwang,2)'))).toBe(
      false,
    );
    expect(canRender(parseHint('number_of_traits_in_unit(unit(row,1),not_numberwang,2)'))).toBe(true);
  });
});

describe('trait nouns', () => {
  it('never says "numberwangs"', () => {
    expect(plural('numberwang', 1)).toBe('Numberwang card');
    expect(plural('numberwang', 3)).toBe('Numberwang cards');
    expect(plural('not_numberwang', 1)).toBe('Not Numberwang card');
    expect(plural('not_numberwang', 3)).toBe('Not Numberwang cards');
  });
});

describe('arithmetic clue text', () => {
  const say = (src: string) => render(parseHint(src));
  // The archive glues "row"/"column" to what follows with U+00A0. Spelling it as
  // an escape here rather than pasting the character keeps the expectation
  // readable in a diff — see the note at the top of this file.
  const NBSP = '\u00a0';

  it('renders a sum over a row', () => {
    expect(say('sum_of_trait_in_unit(unit(row,2),numberwang,25)')).toBe(
      `The Numberwang cards in row${NBSP}2 add to 25`,
    );
  });

  it('renders a sum over a colour group as a token the app expands', () => {
    expect(say('sum_of_trait_in_unit(unit(colour,teal),numberwang,12)')).toBe(
      'The Numberwang cards among #COLOURS:teal add to 12',
    );
  });

  it('renders a pair difference', () => {
    expect(say('diff_of_two_traits_in_unit(unit(colour,teal),numberwang,6)')).toBe(
      'Two Numberwang cards among #COLOURS:teal subtract to 6',
    );
  });

  it('renders a comparison', () => {
    expect(say('more_sum_in_unit_than_unit(unit(row,1),unit(row,3),numberwang)')).toBe(
      `The Numberwang cards in row${NBSP}1 add to more than ` +
        `the Numberwang cards in row${NBSP}3`,
    );
  });

  it('renders even parity, with the column as a #C token', () => {
    expect(say('sum_parity_in_unit(unit(col,2),numberwang,0)')).toBe(
      `The Numberwang cards in column${NBSP}#C:2 add to an even number`,
    );
  });

  it('renders odd parity, and the other trait', () => {
    expect(say('sum_parity_in_unit(unit(col,2),not_numberwang,1)')).toBe(
      `The Not Numberwang cards in column${NBSP}#C:2 add to an odd number`,
    );
  });

  it('renders a count of primes', () => {
    expect(say('n_traits_in_unit_are_prime(unit(row,2),numberwang,2)')).toBe(
      `2 of the Numberwang cards in row${NBSP}2 are prime`,
    );
  });

  it('spells one and none rather than printing them', () => {
    expect(say('n_traits_in_unit_are_prime(unit(row,2),numberwang,1)')).toBe(
      `Exactly one of the Numberwang cards in row${NBSP}2 is prime`,
    );
    expect(say('n_traits_in_unit_are_prime(unit(row,2),numberwang,0)')).toBe(
      `None of the Numberwang cards in row${NBSP}2 is prime`,
    );
  });

  it('renders even and odd counts, and keeps the #C token in a column', () => {
    expect(say('n_traits_in_unit_are_even(unit(col,2),numberwang,3)')).toBe(
      `3 of the Numberwang cards in column${NBSP}#C:2 are even`,
    );
    expect(say('n_traits_in_unit_are_odd(unit(edge,void),not_numberwang,4)')).toBe(
      '4 of the Not Numberwang cards on the edges are odd',
    );
  });

  it('names the divisor, and the colour group as a token', () => {
    expect(say('n_traits_in_unit_are_divisible(unit(colour,teal),not_numberwang,3,2)')).toBe(
      '2 of the Not Numberwang cards among #COLOURS:teal are divisible by 3',
    );
  });

  it('can render every arithmetic predicate', () => {
    for (const src of [
      'sum_of_trait_in_unit(unit(row,1),numberwang,25)',
      'diff_of_two_traits_in_unit(unit(row,1),numberwang,9)',
      'more_sum_in_unit_than_unit(unit(row,1),unit(row,3),numberwang)',
      'sum_parity_in_unit(unit(row,1),numberwang,1)',
      'n_traits_in_unit_are_prime(unit(row,1),numberwang,2)',
      'n_traits_in_unit_are_even(unit(row,1),numberwang,2)',
      'n_traits_in_unit_are_odd(unit(row,1),numberwang,2)',
      'n_traits_in_unit_are_divisible(unit(row,1),numberwang,3,1)',
    ]) {
      expect(canRender(parseHint(src)), src).toBe(true);
    }
  });
});
