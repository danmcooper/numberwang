import { describe, expect, it } from 'vitest';
import { ARG_KINDS, formatHint, HintParseError, parseHint } from './hint';

describe('parseHint', () => {
  it('parses a unit with a pair argument', () => {
    expect(parseHint('all_traits_are_neighbors_in_unit(unit(between,pair(0,3)),numberwang)')).toEqual({
      pred: 'all_traits_are_neighbors_in_unit',
      args: [
        { t: 'unit', unit: { kind: 'between', a: 0, b: 3 } },
        { t: 'trait', trait: 'numberwang' },
      ],
    });
  });

  it('parses bare kinds, numbers and negative direction offsets', () => {
    expect(parseHint('all_units_have_at_least_n_traits(col,not_numberwang,1)').args[0]).toEqual({
      t: 'kind',
      kind: 'col',
    });
    expect(parseHint('n_colours_have_trait_in_dir(cook,not_numberwang,0,-1,1)').args).toEqual([
      { t: 'colour', name: 'cook' },
      { t: 'trait', trait: 'not_numberwang' },
      { t: 'num', n: 0 },
      { t: 'num', n: -1 },
      { t: 'num', n: 1 },
    ]);
  });

  it('parses void-argument units and person indices', () => {
    expect(parseHint('is_one_of_n_traits_in_unit(unit(edge,void),7,not_numberwang,3)').args).toEqual([
      { t: 'unit', unit: { kind: 'edge' } },
      { t: 'index', i: 7 },
      { t: 'trait', trait: 'not_numberwang' },
      { t: 'num', n: 3 },
    ]);
  });

  it('rejects unknown predicates and wrong arity', () => {
    expect(() => parseHint('no_such_predicate(numberwang)')).toThrow(HintParseError);
    expect(() => parseHint('number_of_traits(numberwang)')).toThrow(HintParseError);
  });

  it('rejects a malformed kind literal', () => {
    expect(() => parseHint('all_units_have_at_least_n_traits(rowz,numberwang,1)')).toThrow(
      HintParseError,
    );
  });
});

describe('formatHint', () => {
  it('round-trips every signature shape', () => {
    for (const s of [
      'has_trait(11,not_numberwang)',
      'number_of_traits(numberwang,6)',
      'number_of_traits_in_unit(unit(between,pair(4,7)),not_numberwang,2)',
      'odd_number_of_traits_in_unit(unit(neighbor,12),numberwang)',
      'only_one_unit_has_exactly_n_traits(row,numberwang,2)',
      'unit_shares_n_out_of_n_traits_with_unit(unit(neighbor,5),unit(row,3),numberwang,1,2)',
      'n_t_in_unit_have_trait_in_dir(unit(edge,void),not_numberwang,not_numberwang,1,0,2)',
      'equal_number_of_traits_in_units(unit(colour,cook),unit(colour,cop),not_numberwang)',
    ]) {
      expect(formatHint(parseHint(s))).toBe(s);
    }
  });
});

describe('ARG_KINDS', () => {
  // 27 the archive uses, plus the two cross-trait comparisons it never does —
  // see CROSS_TRAIT in corpus.ts — plus the eight arithmetic ones, which no
  // archive puzzle could have contained because they read the cards' numbers:
  // four over a unit's total and four counting cards by a property of their own
  // number. See ARITH_PREDS in arith.ts.
  it('covers all 37 predicates', () => {
    expect(Object.keys(ARG_KINDS)).toHaveLength(37);
  });
});
