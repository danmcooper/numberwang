import { describe, expect, it } from 'vitest';
import { tokenizeClue } from './tokenize';

describe('tokenizeClue', () => {
  it('passes plain text through as one segment', () => {
    expect(tokenizeClue('Nothing to see here')).toEqual([
      { kind: 'text', text: 'Nothing to see here' },
    ]);
  });

  it('tokenizes name and possessive-name references', () => {
    expect(tokenizeClue('Ask #NAME:3 about #NAMES:14 alibi')).toEqual([
      { kind: 'text', text: 'Ask ' },
      { kind: 'name', index: 3, possessive: false },
      { kind: 'text', text: ' about ' },
      { kind: 'name', index: 14, possessive: true },
      { kind: 'text', text: ' alibi' },
    ]);
  });

  it('tokenizes colours, columns, and between-pairs', () => {
    expect(tokenizeClue('The #COLOUR:teal and two #COLOURS:red in #C:2')).toEqual([
      { kind: 'text', text: 'The ' },
      { kind: 'colour', word: 'teal', plural: false, counted: false },
      { kind: 'text', text: ' and two ' },
      { kind: 'colour', word: 'red', plural: true, counted: false },
      { kind: 'text', text: ' in ' },
      { kind: 'column', column: 2 },
    ]);
    expect(tokenizeClue('one not_numberwang #BETWEEN:pair(7,11)')).toEqual([
      { kind: 'text', text: 'one not_numberwang ' },
      { kind: 'between', a: 7, b: 11 },
    ]);
  });

  // #COLOURN is ours rather than the source's: the renderer emits it when a clue
  // counts one colour group's members, and only the site can say how many there
  // are, because only the site has the board.
  it('marks a #COLOURN colour as counted so the site fills in the total', () => {
    expect(tokenizeClue('Exactly 1 of #COLOURN:teal has')).toEqual([
      { kind: 'text', text: 'Exactly 1 of ' },
      { kind: 'colour', word: 'teal', plural: true, counted: true },
      { kind: 'text', text: ' has' },
    ]);
  });

  it('parses the three colour tokens', () => {
    expect(tokenizeClue('#COLOUR:teal')).toEqual([
      { kind: 'colour', word: 'teal', plural: false, counted: false },
    ]);
    expect(tokenizeClue('#COLOURS:teal')).toEqual([
      { kind: 'colour', word: 'teal', plural: true, counted: false },
    ]);
    expect(tokenizeClue('#COLOURN:teal')).toEqual([
      { kind: 'colour', word: 'teal', plural: true, counted: true },
    ]);
  });

  it('does not parse the old profession tokens', () => {
    expect(tokenizeClue('#PROF:cook')).toEqual([{ kind: 'text', text: '#PROF:cook' }]);
  });

  it('keeps parsing names, columns and ranges', () => {
    expect(tokenizeClue('#NAME:3 and #NAMES:4 in column #C:2 #BETWEEN:pair(4,7)')).toEqual([
      { kind: 'name', index: 3, possessive: false },
      { kind: 'text', text: ' and ' },
      { kind: 'name', index: 4, possessive: true },
      { kind: 'text', text: ' in column ' },
      { kind: 'column', column: 2 },
      { kind: 'text', text: ' ' },
      { kind: 'between', a: 4, b: 7 },
    ]);
  });

  it('renders unknown or malformed tokens as raw text', () => {
    expect(tokenizeClue('color #FFF here')).toEqual([
      { kind: 'text', text: 'color ' },
      { kind: 'text', text: '#FFF' },
      { kind: 'text', text: ' here' },
    ]);
    expect(tokenizeClue('#NAME:x')).toEqual([{ kind: 'text', text: '#NAME:x' }]);
    // Malformed pair: the token regex captures only "#BETWEEN:pair", the rest stays literal text.
    expect(tokenizeClue('#BETWEEN:pair(1)')).toEqual([
      { kind: 'text', text: '#BETWEEN:pair' },
      { kind: 'text', text: '(1)' },
    ]);
  });
});
