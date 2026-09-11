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
 *
 * A board shuffles this list and takes the first few, so the length of the list
 * is how long a daily player goes before seeing a fact twice. Grouped loosely
 * (numbers, space, matter, life) for editing; the shuffle ignores the order.
 */
export const FLAVOUR: string[] = [
  'In a room of just 23 people, there is a 50% chance that two share a birthday.',
  'A shuffled deck of cards has more possible orders than the Earth has atoms.',
  'There are more possible games of chess than there are atoms in the universe.',
  'Any map can be coloured with four colours so that no two neighbours match.',
  'Add up the digits of any multiple of 9 and you eventually get back to 9.',
  '0.999… recurring is not nearly 1. It is exactly 1.',
  'Euclid proved there is no largest prime more than two thousand years ago.',
  'Every even number yet checked is the sum of two primes; nobody has proved them all.',
  'Nobody knows whether primes two apart, like 11 and 13, carry on for ever.',
  'A googol is a 1 with a hundred zeroes, more than the atoms in the visible universe.',
  'Forty digits of pi would measure the observable universe to within an atom.',
  'The digits of pi never settle into a repeating pattern, and it is proved they never will.',
  'The ratio of neighbouring Fibonacci numbers closes in on 1.618, the golden ratio.',
  'Fibonacci numbers turn up in pine cones, sunflower heads and pineapples.',
  '6 is a perfect number: 1, 2 and 3 divide it, and 1, 2 and 3 add up to it.',
  '28 is the next perfect number after 6, and nobody has ever found an odd one.',
  '2 is the only even prime, which makes it the oddest prime of the lot.',
  '1 is not a prime number, by agreement rather than by accident.',
  'Every whole number is the sum of at most four square numbers.',
  '111111111 times itself is 12345678987654321.',
  'Add 1/2, then 1/4, then 1/8, and keep going for ever: the total is exactly 1.',
  '1 + 2 + 3 + … + 100 is 5050, which Gauss is said to have spotted as a schoolboy.',
  'Some infinities are bigger than others: no list can hold every decimal between 0 and 1.',
  'There are as many even numbers as whole numbers, despite half of them missing.',
  'The Greeks proved the square root of 2 is no fraction, and were upset about it.',
  'In lists of real-world numbers, about a third of them begin with the digit 1.',
  'Switching doors in Monty Hall doubles your chances. Most people refuse to believe it.',
  'The chance of tossing ten heads in a row is one in 1024.',
  'Twenty yes-or-no questions can pick out any one of a million things.',
  'There are 43,252,003,274,489,856,000 ways to scramble a Rubik’s cube.',
  'Any scrambled Rubik’s cube can be solved in twenty moves or fewer.',
  'A Möbius strip has one side and one edge. Cut it lengthways and it stays in one piece.',
  'Stir a cup of tea and at least one point of it ends up exactly where it started.',
  'You cannot comb a hairy ball flat, which is why somewhere on Earth the wind is still.',
  'Of all the shapes enclosing the same area, the circle needs the shortest fence.',
  'A 50p piece is the same width whichever way you measure it, which is why it rolls.',
  'The equals sign was invented in 1557 by a man tired of writing "is equal to".',
  'Roman numerals have no symbol for zero; it was simply not thought of as a number.',
  'A pizza of radius z and thickness a has a volume of pi times z times z times a.',
  'Sixty minutes and three hundred and sixty degrees are Babylonian. They counted in sixties.',
  'Sunlight takes eight minutes and twenty seconds to get here.',
  'Light goes round the Earth seven and a half times in a second.',
  'A day on Venus lasts longer than a year on Venus.',
  'Venus spins backwards, so the Sun there comes up in the west.',
  'Venus is hotter than Mercury, despite being further from the Sun.',
  'A teaspoon of neutron star would weigh something like a billion tonnes.',
  'Saturn is less dense than water. Given a big enough bath, it would float.',
  'Jupiter has no surface. There is nowhere on it to stand.',
  'Neptune has completed one orbit since it was discovered in 1846.',
  'A day on Mars is about forty minutes longer than a day here.',
  'Olympus Mons on Mars is nearly three times the height of Everest.',
  'The Moon drifts about four centimetres further away every year.',
  'Space is silent. Sound needs something to travel through, and there is nothing there.',
  'Astronauts come back from orbit an inch or two taller than they went up.',
  'There are more trees on Earth than there are stars in the Milky Way.',
  'Almost every atom in your body was made inside a star.',
  'Water is one of the few things that expands as it freezes, which is why ice floats.',
  'Absolute zero is minus 273.15 degrees, and nothing anywhere can be colder.',
  'Lightning is about five times hotter than the surface of the Sun.',
  'Lightning strikes the Earth roughly forty times every second.',
  'Thunder takes about three seconds to travel a kilometre. Count, and you have the distance.',
  'A rainbow is really a full circle. The ground hides the bottom half.',
  'A single fluffy cloud can weigh several hundred tonnes.',
  'Sound travels about four times faster through water than through air.',
  'Helium makes your voice squeak because sound moves faster through it than through air.',
  'Helium was found in the Sun before anyone found any of it on Earth.',
  'Mercury is the only metal that is liquid at room temperature.',
  'Diamond and pencil lead are the same element, arranged differently.',
  'Glass is not a very slow liquid. Old windows are uneven because they were made that way.',
  'Under enough pressure, water at the sea bed stays liquid well past boiling point.',
  'Lower the pressure enough and water will boil at room temperature.',
  'Hot water sometimes freezes faster than cold, and nobody quite agrees why.',
  'The Eiffel Tower is up to fifteen centimetres taller in summer than in winter.',
  'A litre of water weighs a kilogram, which is not a coincidence.',
  'The Earth’s core is roughly as hot as the surface of the Sun.',
  'Antarctica is a desert. It hardly ever rains or snows there.',
  'The deepest trench in the ocean is deeper than Everest is tall.',
  'We have better maps of the surface of Mars than of our own ocean floor.',
  'About half the oxygen you breathe was made in the sea, not by trees.',
  'There are more bacteria in a spoonful of soil than there are people on Earth.',
  'Bananas are faintly radioactive, on account of the potassium in them.',
  'Octopuses have three hearts, and their blood is blue.',
  'Sharks were swimming about for millions of years before the first tree grew.',
  'Honey sealed in Egyptian tombs was still edible thousands of years later.',
  'Bees build in hexagons because a hexagon holds the most honey for the least wax.',
  'A honeybee tells the others the direction and distance of flowers by dancing.',
  'Wombats produce droppings that come out as neat little cubes.',
  'Starfish have no brain, and manage perfectly well without one.',
  'Tardigrades can survive being frozen, boiled, dried out and sent into space.',
  'Flamingos are pink because of what they eat, not because of what they are.',
  'A shrimp’s heart is in its head.',
  'Butterflies taste things by standing on them.',
  'A snail’s mouth can carry thousands of tiny teeth.',
  'A hummingbird’s heart beats over a thousand times a minute.',
  'A sloth can take a month to digest a single leaf.',
  'Bamboo can grow the better part of a metre in one day.',
  'Trees pass food and warnings to each other through fungus threads underground.',
  'Blue is rare in nature. Most blue creatures are a trick of structure, not pigment.',
  'You are made of about seven octillion atoms, nearly all of it empty space.',
  'The DNA in a single cell of yours would stretch to about two metres.',
  'You share roughly half your DNA with a banana.',
  'Your body holds about as many bacterial cells as human ones.',
  'Your brain runs on about a fifth of everything you eat.',
  'Nerve signals reach speeds of over a hundred metres a second.',
  'On a dark, clear night the eye can pick out a candle flame miles away.',
];
