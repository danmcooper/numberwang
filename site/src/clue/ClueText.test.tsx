// @vitest-environment jsdom
import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { Person } from '../../../shared/puzzle';
import ClueText, { clueReferencedIndices } from './ClueText';

const person = (number: number, colour: string): Person => ({
  number, colour, numberwang: false, clue: null, origHint: null, paths: [],
});
const people = [person(7, 'red'), person(3, 'teal'), person(12, 'blue')];

// A full 4x5 board, whose card at index i holds the number i + 1 — so a
// positional assertion below reads one higher than the index it names.
const grid = [...Array(20)].map((_, i) => person(i + 1, 'red'));

const renderClue = (clue: string, opts: { people?: Person[]; width?: number; selfIndex?: number } = {}) =>
  render(
    <ClueText clue={clue} people={opts.people ?? grid} width={opts.width ?? 4} selfIndex={opts.selfIndex} />,
  ).container.textContent;

describe('ClueText', () => {
  it('renders the whole clue as a single flat span with no nested markup', () => {
    const { container } = render(
      <ClueText clue="#NAME:0 is one of 11 not_numberwangs on the edges" people={people} width={3} />,
    );
    expect(container.innerHTML).toBe(
      '<span class="clue-text">7 is one of 11 not_numberwangs on the edges</span>',
    );
  });

  it('renders a card reference as its number', () => {
    expect(renderClue('Ask #NAME:1 or #NAMES:0 friend', { people, width: 3 })).toBe(
      "Ask 3 or 7's friend",
    );
  });

  it('renders self-references with the right grammar (me/my/I/I am/and I)', () => {
    expect(renderClue('No not_numberwangs neighbor #NAME:1, says #NAMES:1 friend', { selfIndex: 1 })).toBe(
      'No not_numberwangs neighbor me, says my friend',
    );
    expect(renderClue('#NAME:1 is guilty', { selfIndex: 1 })).toBe('I am guilty');
    expect(renderClue('#NAME:1 has a hat', { selfIndex: 1 })).toBe('I have a hat');
    expect(renderClue('#NAME:1 sleeps', { selfIndex: 1 })).toBe('I sleeps');
    expect(renderClue('#NAME:0 and #NAME:1 are cousins', { selfIndex: 1 })).toBe('1 and I are cousins');
    expect(renderClue('#NAME:1 and #NAME:0 are cousins', { selfIndex: 1 })).toBe('1 and I are cousins');
  });

  it('renders 1-based #C column tokens as letters', () => {
    // Real data: card 8's "There is only one numberwang in column #C:1" renders as column A.
    expect(renderClue('There is only one numberwang in column #C:1')).toBe(
      'There is only one numberwang in column A',
    );
    expect(renderClue('two cops in column #C:4')).toBe('Two cops in column D');
  });

  describe('#BETWEEN positional paraphrasing (ported from the real renderer)', () => {
    it('column segment touching the top edge: above <card below it>', () => {
      // pair(0,4) = A1..A2; card below is 9 (A3, index 8)
      expect(renderClue('There are no not_numberwangs #BETWEEN:pair(0,4) who neighbor #NAME:9', { selfIndex: 9 }))
        .toBe('There are no not_numberwangs above 9 who neighbor me');
      expect(renderClue('no not_numberwangs #BETWEEN:pair(0,4)', { selfIndex: 8 })).toBe('No not_numberwangs above me');
    });

    it('column segment touching the bottom edge: below <card above it>', () => {
      // pair(12,16) = A4..A5; card above is 9 (A3, index 8)
      expect(renderClue('one numberwang #BETWEEN:pair(12,16)')).toBe('One numberwang below 9');
    });

    it('mid-column segment: in between <bounding cards>', () => {
      // pair(7,11) = D2..D3; bounded by 4 (D1, index 3) and 16 (D4, index 15)
      expect(renderClue('There is only one not_numberwang #BETWEEN:pair(7,11)'))
        .toBe('There is only one not_numberwang in between 4 and 16');
      // self as a bounding card renders as me, placed last
      expect(renderClue('one not_numberwang #BETWEEN:pair(7,11)', { selfIndex: 15 }))
        .toBe('One not_numberwang in between 4 and me');
    });

    it('row segment touching the right edge: to the right of <card left of it>', () => {
      // pair(9,11) = B3..D3; card to the left is 9 (A3, index 8)
      expect(renderClue('There are exactly 2 not_numberwangs #BETWEEN:pair(9,11)'))
        .toBe('There are exactly 2 not_numberwangs to the right of 9');
    });

    it('row segment touching the left edge: to the left of <card right of it>', () => {
      // pair(4,6) = A2..C2; card to the right is 8 (D2, index 7)
      expect(renderClue('no numberwangs #BETWEEN:pair(4,6)')).toBe('No numberwangs to the left of 8');
    });

    it('full rows and full columns', () => {
      expect(renderClue('All not_numberwangs #BETWEEN:pair(0,3) are connected'))
        .toBe('All not_numberwangs in row 1 are connected');
      expect(renderClue('Both numberwangs #BETWEEN:pair(12,15) are connected'))
        .toBe('Both numberwangs in row 4 are connected');
      expect(renderClue('one numberwang #BETWEEN:pair(1,17)')).toBe('One numberwang in column B');
    });
  });

  it('rewrites "exactly 0" as "no" and capitalizes the clue', () => {
    expect(renderClue('there are exactly 0 numberwangs #BETWEEN:pair(0,3)'))
      .toBe('There are no numberwangs in row 1');
  });

  it('renders unknown tokens and out-of-range indices as plain text', () => {
    const { container } = render(<ClueText clue="#FFF and #NAME:99" people={people} width={3} />);
    expect(container.textContent).toBe('#FFF and #NAME:99');
  });
});

describe('clueReferencedIndices', () => {
  it('collects number, colour, and between-boundary references, excluding self', () => {
    const refs = clueReferencedIndices(
      'The #COLOUR:red saw #NAME:2 and #NAME:9 #BETWEEN:pair(0,4)',
      grid.map((p, i) => (i === 2 ? { ...p, colour: 'teal' } : p)),
      4,
      9,
    );
    // #NAME:9 is self (excluded); pair(0,4) touches the top so it references card 8.
    expect(refs.numbers).toEqual([2, 8]);
    // every red card (all but index 2, which we made teal)
    expect(refs.colours).toEqual(grid.map((_, i) => i).filter((i) => i !== 2));
  });

  it('returns nothing for flavor clues', () => {
    expect(clueReferencedIndices('Nothing to see here', grid, 4, 0)).toEqual({
      numbers: [],
      colours: [],
    });
  });
});

// Cards 0..3 are row 1. Groups: teal x3, red x2, blue x2, pink x1.
const board = [
  person(17, 'red'), person(4, 'teal'), person(23, 'teal'), person(8, 'blue'),
  person(9, 'teal'), person(31, 'red'), person(12, 'blue'), person(26, 'pink'),
];
const say = (clue: string, selfIndex?: number) =>
  renderClue(clue, { people: board, width: 4, selfIndex });

describe('numbers and colours', () => {
  it('renders a card reference as its number', () => {
    expect(say('#NAME:0 is Numberwang')).toBe('17 is Numberwang');
  });

  it('renders a possessive reference', () => {
    expect(say('#NAMES:2 neighbors are Numberwang')).toBe("23's neighbors are Numberwang");
  });

  it('renders a singular colour reference', () => {
    expect(say('Only one #COLOUR:teal is Numberwang')).toBe('Only one teal card is Numberwang');
  });

  it('renders a plural colour reference as a bare noun phrase', () => {
    // The generator writes the article itself where a phrase wants one, so the
    // token expands to "teal cards" and never "the teal cards".
    expect(say('The Numberwang cards among the #COLOURS:teal add to 12')).toBe(
      'The Numberwang cards among the teal cards add to 12',
    );
    expect(say('There are more Numberwang #COLOURS:teal than Numberwang #COLOURS:blue')).toBe(
      'There are more Numberwang teal cards than Numberwang blue cards',
    );
  });

  it('counts the group for a #COLOURN reference', () => {
    expect(say('Exactly 1 of #COLOURN:teal has a Numberwang neighbor')).toBe(
      'Exactly 1 of 3 teal cards has a Numberwang neighbor',
    );
  });

  it('says "card" not "cards" for a group of one', () => {
    expect(say('Exactly 1 of #COLOURN:pink is Numberwang')).toBe(
      'Exactly 1 of 1 pink card is Numberwang',
    );
  });

  it('draws a bar of the colour immediately after the colour word', () => {
    const { container } = render(
      <ClueText clue="Only one #COLOUR:teal is Numberwang" people={board} width={4} />,
    );
    const swatch = container.querySelector('.clue-swatch')!;
    expect(swatch.getAttribute('style')).toContain('var(--colour-teal)');
    // Against the word, not after the whole phrase: "teal [bar] card".
    expect(swatch.previousSibling!.textContent).toBe('teal');
    expect(swatch.nextSibling!.textContent).toBe(' card');
    // Decoration only — the reading of the clue is unchanged.
    expect(container.textContent).toBe('Only one teal card is Numberwang');
  });

  it('capitalizes a clue that opens on a colour word', () => {
    expect(say('#COLOURS:teal are Numberwang')).toBe('Teal cards are Numberwang');
  });

  it('expands a column token to its letter', () => {
    expect(say('The Numberwang cards in column #C:2 add to an even number')).toBe(
      'The Numberwang cards in column B add to an even number',
    );
  });

  it('speaks in the first person on its own card', () => {
    expect(say('#NAME:0 is Numberwang', 0)).toBe('I am Numberwang');
    expect(say('#NAME:1 and #NAME:0 are Numberwang', 0)).toBe('4 and I are Numberwang');
    expect(say('#NAMES:0 neighbors are Numberwang', 0)).toBe('My neighbors are Numberwang');
  });

  it('leaves an unknown token as raw text rather than dropping the clue', () => {
    expect(say('#WHAT:5 is Numberwang')).toBe('#WHAT:5 is Numberwang');
  });
});

describe('clueReferencedIndices with colours', () => {
  it('reports the cards a clue names and the cards its colour groups hold', () => {
    const refs = clueReferencedIndices('#NAME:3 and #COLOURS:teal', board, 4, 0);
    expect(refs.numbers).toEqual([3]);
    expect(refs.colours).toEqual([1, 2, 4]);
  });

  it("excludes the clue's own card from the named set", () => {
    expect(clueReferencedIndices('#NAME:0 and #NAME:3', board, 4, 0).numbers).toEqual([3]);
  });
});
