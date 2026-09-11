import { Fragment } from 'react';
import type { Person } from '../../../shared/puzzle';
import { tokenizeClue, type ClueSegment } from './tokenize';

const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const columnLetter = (n: number) => String.fromCharCode(65 + n);

// "A1", "D5", … matching the corner labels on the cards.
export const gridLabel = (index: number, width: number) =>
  `${columnLetter(index % width)}${Math.floor(index / width) + 1}`;

interface ClueTextProps {
  clue: string;
  people: Person[];
  width: number;
  /** Index of the card this clue belongs to; its own references render as I/me/my. */
  selfIndex?: number;
}

// String-level rewrites the real renderer applies before token expansion:
// self-references get first-person grammar, "exactly 0" reads as "no".
function prepass(clue: string, self: number | undefined): string {
  let s = clue.replace(' exactly 0 ', ' no ');
  if (self === undefined) return s;
  s = s.replace(new RegExp(`#NAMES:${self}\\b`, 'g'), 'my');
  s = s.replace(/#NAME:(\d+) and #NAME:(\d+)\b/g, (m, x: string, y: string) => {
    if (Number(x) === self) return `#NAME:${y} and I`;
    if (Number(y) === self) return `#NAME:${x} and I`;
    return m;
  });
  s = s.replace(new RegExp(`^#NAME:${self} (is|has)\\b`), (_m, verb: string) =>
    verb === 'is' ? 'I am' : 'I have',
  );
  s = s.replace(new RegExp(`^#NAME:${self}\\b`), 'I');
  s = s.replace(new RegExp(`#NAME:${self}\\b`, 'g'), 'me');
  return s;
}

function numberRef(props: ClueTextProps, index: number): string {
  if (index === props.selfIndex) return 'me';
  return String(props.people[index].number);
}

// Positional paraphrase of an inclusive card range, ported from the live
// bundle: describe the segment by row/column or by the cards just outside it.
// `refs` lists the boundary cards named in the phrase (self excluded).
function betweenParts(
  seg: { a: number; b: number },
  props: ClueTextProps,
): { text: string; refs: number[] } | null {
  const { people, width } = props;
  const height = people.length / width;
  const lo = Math.min(seg.a, seg.b);
  const hi = Math.max(seg.a, seg.b);
  if (hi >= people.length) return null;
  const loCol = lo % width;
  const loRow = Math.floor(lo / width);
  const hiCol = hi % width;
  const hiRow = Math.floor(hi / width);
  const sameRow = loRow === hiRow;
  const before = lo - (sameRow ? 1 : width);
  const after = hi + (sameRow ? 1 : width);
  const refs = (...indices: number[]) => indices.filter((i) => i !== props.selfIndex);
  if (sameRow) {
    if (loCol === 0 && hiCol === width - 1) return { text: `in row ${loRow + 1}`, refs: [] };
    if (loCol === 0) return { text: `to the left of ${numberRef(props, after)}`, refs: refs(after) };
    if (hiCol === width - 1) {
      return { text: `to the right of ${numberRef(props, before)}`, refs: refs(before) };
    }
  } else {
    if (loRow === 0 && hiRow === height - 1) {
      return { text: `in column ${columnLetter(loCol)}`, refs: [] };
    }
    if (loRow === 0) return { text: `above ${numberRef(props, after)}`, refs: refs(after) };
    if (hiRow === height - 1) return { text: `below ${numberRef(props, before)}`, refs: refs(before) };
  }
  if (props.selfIndex === before) {
    return { text: `in between ${numberRef(props, after)} and me`, refs: refs(after) };
  }
  if (props.selfIndex === after) {
    return { text: `in between ${numberRef(props, before)} and me`, refs: refs(before) };
  }
  return {
    text: `in between ${numberRef(props, before)} and ${numberRef(props, after)}`,
    refs: refs(before, after),
  };
}

/** Cards a clue mentions (by number, boundary phrase, or colour group),
 * excluding the clue's own card. */
export function clueReferencedIndices(
  clue: string,
  people: Person[],
  width: number,
  selfIndex: number,
): { numbers: number[]; colours: number[] } {
  const numbers = new Set<number>();
  const colours = new Set<number>();
  for (const seg of tokenizeClue(clue)) {
    if (seg.kind === 'name') {
      if (seg.index !== selfIndex && people[seg.index]) numbers.add(seg.index);
    } else if (seg.kind === 'colour') {
      people.forEach((p, i) => {
        if (p.colour === seg.word) colours.add(i);
      });
    } else if (seg.kind === 'between') {
      betweenParts(seg, { clue, people, width, selfIndex })?.refs.forEach((i) => numbers.add(i));
    }
  }
  return {
    numbers: [...numbers].sort((a, b) => a - b),
    colours: [...colours].sort((a, b) => a - b),
  };
}

function rawToken(seg: ClueSegment): string {
  // Reconstruct the original token for out-of-range references.
  switch (seg.kind) {
    case 'name':
      return `#${seg.possessive ? 'NAMES' : 'NAME'}:${seg.index}`;
    case 'between':
      return `#BETWEEN:pair(${seg.a},${seg.b})`;
    case 'column':
      return `#C:${seg.column}`;
    default:
      return '';
  }
}

type PlainSegment = Exclude<ClueSegment, { kind: 'colour' }>;

function segmentText(seg: PlainSegment, props: ClueTextProps): string {
  switch (seg.kind) {
    case 'name': {
      const p = props.people[seg.index];
      if (!p) return rawToken(seg);
      const n = String(p.number);
      // A number never ends in "s", so the possessive is always "'s".
      return seg.possessive ? `${n}'s` : n;
    }
    case 'column':
      // #C:n is 1-based ("column #C:1" is column A); the word "column" is in the source text.
      return seg.column >= 1 ? columnLetter(seg.column - 1) : rawToken(seg);
    case 'between':
      return betweenParts(seg, props)?.text ?? rawToken(seg);
    case 'text':
      return seg.text;
  }
}

/** A piece of finished clue text; `swatch` is a colour group's name, and asks
 * for that colour's bar to be drawn directly after the piece. */
interface CluePiece {
  text: string;
  swatch?: string;
}

function cluePieces(props: ClueTextProps): CluePiece[] {
  const pieces: CluePiece[] = [];
  for (const seg of tokenizeClue(prepass(props.clue, props.selfIndex))) {
    if (seg.kind !== 'colour') {
      pieces.push({ text: segmentText(seg, props) });
      continue;
    }
    // A counted group takes its number from the board, and its plural from
    // that number rather than from the token — a group of one reads "1 pink
    // card".
    const n = seg.counted ? props.people.filter((p) => p.colour === seg.word).length : null;
    const plural = n === null ? seg.plural : n !== 1;
    // Never an article: the clue text around the token supplies one where it
    // wants one ("among the teal cards"), and most phrasings do not
    // ("more Numberwang teal cards than …", "2 teal cards have …"). The noun
    // is split off so the swatch lands against the colour word itself.
    pieces.push({ text: n !== null ? `${n} ${seg.word}` : seg.word, swatch: seg.word });
    pieces.push({ text: plural ? ' cards' : ' card' });
  }
  // The real renderer capitalizes the first letter of the finished clue.
  const first = pieces.findIndex((piece) => piece.text.length > 0);
  if (first !== -1) pieces[first] = { ...pieces[first], text: capitalize(pieces[first].text) };
  return pieces;
}

export default function ClueText(props: ClueTextProps) {
  return (
    <span className="clue-text">
      {cluePieces(props).map((piece, i) => (
        <Fragment key={i}>
          {piece.text}
          {/* Eight colour groups is more than a player can keep straight by
              name — teal against blue, orange against yellow — so every clue
              that names one shows it. Decoration only: the word is still there
              for anyone who cannot see the bar. */}
          {piece.swatch && (
            <i
              className="clue-swatch"
              style={{ background: `var(--colour-${piece.swatch})` }}
              aria-hidden="true"
            />
          )}
        </Fragment>
      ))}
    </span>
  );
}
