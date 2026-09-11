import { useEffect, useRef, useState } from "react";
import type { Puzzle } from "../../../shared/puzzle";
import ClueText, { clueReferencedIndices, gridLabel } from "../clue/ClueText";
import type { GameState, Tag } from "../game/reducer";
import Card from "./Card";

interface GridProps {
  puzzle: Puzzle;
  state: GameState;
  /** Card that just flipped from a correct guess (shows the Correct! bubble). */
  justFlipped: number | null;
  /** Card whose mark color picker is open. */
  pickerIndex: number | null;
  onOpen: (index: number) => void;
  onCycleTag: (index: number) => void;
  onOpenPicker: (index: number) => void;
  onPickMark: (index: number, mark: Tag | null) => void;
  onToggleClue: (index: number) => void;
}

export default function Grid({
  puzzle,
  state,
  justFlipped,
  pickerIndex,
  onOpen,
  onCycleTag,
  onOpenPicker,
  onPickMark,
  onToggleClue,
}: GridProps) {
  // Every active (flipped, unconsumed) clue emphasizes its own card's number
  // plus the numbers it mentions.
  const numberRefs = new Set<number>();
  // Subset of the above excluding the clue's own card: only these are
  // eligible for the reveal bounce (the card a player just clicked doesn't
  // need to bounce at itself).
  const otherNumberRefs = new Set<number>();
  // Colour clues are collected per clue rather than merged: only one of them
  // rings its group at a time (see below).
  const colourClues = new Map<number, number[]>();
  puzzle.people.forEach((person, i) => {
    if (!person.clue || !state.flipped.includes(i) || state.consumed.includes(i)) return;
    numberRefs.add(i);
    const refs = clueReferencedIndices(person.clue, puzzle.people, puzzle.width, i);
    refs.numbers.forEach((n) => {
      numberRefs.add(n);
      if (n !== i) otherNumberRefs.add(n);
    });
    if (refs.colours.length) colourClues.set(i, refs.colours);
  });

  // One ring at a time, and it belongs to the newest colour clue. A ring lights
  // a whole group at once, so two of them running together stop reading as two
  // answers to two clues and start reading as one smear across the board — the
  // number halo can stack because it marks single cards. Order of activation is
  // remembered so that dimming the newest clue hands the ring back to the one
  // before it, rather than leaving an open colour clue with nothing to show.
  // Keeping the order in a ref is safe under a double render: the rebuild
  // below is a filter and an append of what is missing, so it lands on the same
  // list every time.
  const ringOrder = useRef<number[]>([]);
  ringOrder.current = [
    ...ringOrder.current.filter((i) => colourClues.has(i)),
    ...[...colourClues.keys()].filter((i) => !ringOrder.current.includes(i)),
  ];
  const ringClue = ringOrder.current.at(-1) ?? null;
  const colourRefs = new Set<number>(ringClue === null ? [] : (colourClues.get(ringClue) ?? []));
  const otherColourRefs = new Set<number>([...colourRefs].filter((n) => n !== ringClue));

  // Bounce animation plays only for cards newly emphasized by an unhidden
  // clue (a fresh flip or un-consuming), never on the initial mount (so a
  // refresh doesn't replay it for clues that were already active).
  const prevOtherRefs = useRef<{ numbers: Set<number>; colours: Set<number> } | null>(null);
  const [bounceNumbers, setBounceNumbers] = useState<Set<number>>(new Set());
  const [bounceColours, setBounceColours] = useState<Set<number>>(new Set());
  useEffect(() => {
    const prev = prevOtherRefs.current;
    if (prev) {
      setBounceNumbers(new Set([...otherNumberRefs].filter((i) => !prev.numbers.has(i))));
      setBounceColours(new Set([...otherColourRefs].filter((i) => !prev.colours.has(i))));
    }
    prevOtherRefs.current = {
      numbers: new Set(otherNumberRefs),
      colours: new Set(otherColourRefs),
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.flipped, state.consumed]);

  return (
    <div className={state.completed ? "grid completed" : "grid"}>
      {puzzle.people.map((person, i) => (
        <Card
          key={i}
          person={person}
          label={gridLabel(i, puzzle.width)}
          flipped={state.flipped.includes(i)}
          rejected={state.rejectedIndex === i}
          tag={state.tags[i]}
          mark={state.marks[i]}
          consumed={state.consumed.includes(i)}
          justFlipped={justFlipped === i}
          pickerOpen={pickerIndex === i}
          hintClue={state.hint?.clues.includes(i) ?? false}
          hintCard={
            state.hintRevealed &&
            !state.flipped.includes(i) &&
            (state.hint?.reveals.includes(i) ?? false)
          }
          numberReferenced={numberRefs.has(i)}
          colourReferenced={colourRefs.has(i)}
          numberBounce={bounceNumbers.has(i) && otherNumberRefs.has(i)}
          colourBounce={bounceColours.has(i) && otherColourRefs.has(i)}
          clueNode={
            person.clue ? (
              <ClueText
                clue={person.clue}
                people={puzzle.people}
                width={puzzle.width}
                selfIndex={i}
              />
            ) : undefined
          }
          onOpen={() => onOpen(i)}
          onCycleTag={() => onCycleTag(i)}
          onOpenPicker={() => onOpenPicker(i)}
          onPickMark={(mark) => onPickMark(i, mark)}
          onToggleClue={() => onToggleClue(i)}
        />
      ))}
    </div>
  );
}
