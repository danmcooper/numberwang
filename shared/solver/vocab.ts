/**
 * The numbers, the colours and the incidental copy a puzzle is dressed in.
 *
 * Clues by Sam's `NAMES` came in size tiers, because `castOf` dealt round-robin
 * from shuffled alphabetical buckets and appending a name would have re-rolled
 * the cast of every puzzle already generated. A `1..N` pool has no such problem:
 * it scales with the board by definition and there is nothing to append. The
 * tiers, the buckets and `castOf` are all gone.
 */
import type { ClueMix } from './mix';

/**
 * Eight colours, in the order a clue would list them.
 *
 * Eight because that is what the source averages in professions — measured over
 * cbs2's 66 scraped puzzles, mean 8.29, median 8, mode 8 — and every name here
 * is one a clue can say without explaining ("teal", not "vermillion").
 */
export const PALETTE: string[] = [
  'red', 'orange', 'yellow', 'green', 'teal', 'blue', 'purple', 'pink',
];

/** Fisher-Yates against a seeded rng, so a board is reproducible from its seed. */
function shuffle<T>(items: T[], rng: () => number): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/** `1..size`, one of each, shuffled. */
export function numbersFor(size: number, rng: () => number): number[] {
  return shuffle(
    Array.from({ length: size }, (_, i) => i + 1),
    rng,
  );
}

/**
 * Every recorded colour shape that fits a `size`-card board in this palette.
 *
 * Exported because `audit.mts` and `check-generation.mts` both have to answer
 * "was this board's grouping one the generator could have dealt?", and they
 * exist to re-derive rather than to trust.
 */
export function offeredShapes(mix: ClueMix, size: number): number[][] {
  return mix.colourShapes.filter(
    (s) => s.reduce((a, b) => a + b, 0) === size && s.length <= PALETTE.length,
  );
}

/**
 * How many colour groups a board gets and how big each is.
 *
 * Drawn from the shapes the archive actually produced rather than divided
 * evenly, for the same reason `mix.ts` exists at all: an even split of 20 cards
 * into 8 groups never yields the singleton group that makes
 * `only_trait_in_unit_is_in_unit` say anything, and the archive has 44 of them.
 */
export function colourShapeFor(mix: ClueMix, size: number, rng: () => number): number[] {
  const usable = offeredShapes(mix, size);
  if (usable.length === 0) {
    throw new Error(`no recorded colour shape seats ${size} cards in ${PALETTE.length} colours`);
  }
  return usable[Math.floor(rng() * usable.length)];
}

/** One colour per card: the shape's groups filled from a shuffled palette, then
 * scattered across the board. */
export function coloursFor(size: number, shape: number[], rng: () => number): string[] {
  const chosen = shuffle(PALETTE, rng).slice(0, shape.length);
  const flat: string[] = [];
  shape.forEach((n, gi) => {
    for (let k = 0; k < n; k++) flat.push(chosen[gi]);
  });
  if (flat.length !== size) throw new Error(`shape seats ${flat.length} cards, not ${size}`);
  return shuffle(flat, rng);
}

/**
 * Clues by Sam's titles are a crime scene and count the board out loud. This is
 * a quiz show, so its titles are rewritten rather than ported.
 */
export const TITLES: string[] = [
  "That's Numberwang!",
  'Round Three: Wangernumb',
  'Twenty Cards, Eight Colours',
  'The Board Does Not Explain Itself',
  'Nobody Asked How the Scoring Works',
  'Rotate the Board',
  'A Perfectly Ordinary Total',
  'Two of These Add Up',
  'The Numbers Were Always There',
  'Let Us Move to the Next Round',
  'Somebody Has Miscounted',
  'The Colours Are Not a Hint',
  'Sum of the Parts',
  'Nineteen Was Never in Doubt',
  'The Quiet Half of the Board',
  'One Row Gives It Away',
  'Every Total Tells',
  'Not All Numbers Are Numberwang',
  'The Difference of Two Cards',
  'An Even Number, Obviously',
];

/**
 * Text for the cards that carry no logical clue. Clues by Sam fills those with
 * suspect patter ("The lights were in my eyes"); a card is not a suspect and has
 * nothing to be evasive about, so it offers a true maths or science fact
 * instead — pleasant to read, and no help whatsoever in solving the board.
 */
export const FLAVOUR: string[] = [
  'In a room of just 23 people, there is a 50% chance that two share a birthday.',
  'A shuffled deck of cards has more possible orders than the Earth has atoms.',
  'Any map can be coloured with four colours so that no two neighbours match.',
  'Add up the digits of any multiple of 9 and you eventually get back to 9.',
  '0.999… recurring is not nearly 1. It is exactly 1.',
  'Euclid proved there is no largest prime more than two thousand years ago.',
  'Every even number yet checked is the sum of two primes; nobody has proved them all.',
  'A googol is a 1 with a hundred zeroes, more than the atoms in the visible universe.',
  'Forty digits of pi would measure the observable universe to within an atom.',
  'The ratio of neighbouring Fibonacci numbers closes in on 1.618, the golden ratio.',
  'Fold a sheet of paper 42 times and it would be thick enough to reach the Moon.',
  'A teaspoon of neutron star would weigh something like a billion tonnes.',
  'Sunlight takes eight minutes and twenty seconds to get here.',
  'A day on Venus lasts longer than a year on Venus.',
  'Helium was found in the Sun before anyone found any of it on Earth.',
  'Bananas are faintly radioactive, on account of the potassium in them.',
  'Octopuses have three hearts, and their blood is blue.',
  'Sharks were swimming about for millions of years before the first tree grew.',
  'Water is one of the few things that expands as it freezes, which is why ice floats.',
  'Honey sealed in Egyptian tombs was still edible thousands of years later.',
];
