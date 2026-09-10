/**
 * Budgets for predicates the generator may use that no archived clue attests.
 *
 * Numberwang has no scraped archive at all — the shares in `config/clue-mix.json`
 * come from cbs2's 4x5 archive, so any predicate that archive never wrote has
 * share 0, and `orderPool` multiplies by share. A predicate with share 0 is
 * generated never. These are the ones that need telling otherwise.
 *
 * The source compares one trait across two units ("more criminals in row 1 than
 * row 4") and two traits within one unit ("more criminals than innocents in row
 * 1"), and never both at once. That looks like an accident of what the source
 * happened to write rather than a rule of the game.
 */
export const CROSS_TRAIT: Record<string, string> = {
  more_traits_in_unit_than_traits_in_unit: 'more_traits_in_unit_than_unit',
  equal_traits_in_unit_and_traits_in_unit: 'equal_number_of_traits_in_units',
};

/** What fraction of its attested parent's rate each `CROSS_TRAIT` predicate
 * gets. A third puts the pair together at rather less than one clue per puzzle:
 * present, not a tic. */
export const CROSS_TRAIT_RATE = 1 / 3;
