import { useRef, type ReactNode } from "react";
import type { Person } from "../../../shared/puzzle";
import { TAG_COLORS, type Tag } from "../game/reducer";

const LONG_PRESS_MS = 400;

/** One span each, thrown on its own bearing by `--i`. See `.confetti-piece`. */
const CONFETTI_PIECES = Array.from({ length: 14 }, (_, i) => i);

interface CardProps {
  person: Person;
  label: string;
  flipped: boolean;
  rejected: boolean;
  tag?: Tag;
  /** Bottom-right corner mark, set via the color picker. */
  mark?: Tag;
  /** The player marked this card's clue as used. */
  consumed: boolean;
  /** Just flipped from a correct guess; shows the Correct! bubble. */
  justFlipped: boolean;
  /** An active (unconsumed) clue mentions this card's number / colour group. */
  numberReferenced: boolean;
  colourReferenced: boolean;
  /** A clue newly revealed this reference (not on mount, not the clue's own
   * card): play the bounce. */
  numberBounce: boolean;
  colourBounce: boolean;
  /** The color picker for this card's mark is open. */
  pickerOpen: boolean;
  /** The active hint points at this card's clue (solid outline). */
  hintClue: boolean;
  /** The active hint's reveal level marks this card as deducible (dotted outline). */
  hintCard: boolean;
  /** Rendered clue shown on the card once it is flipped. */
  clueNode?: ReactNode;
  /** Opens the guess modal for this card. */
  onOpen: () => void;
  /** Cycles the corner tag: none -> yellow -> red -> green -> none. */
  onCycleTag: () => void;
  /** Long-press on the bottom-right corner opens the color picker. */
  onOpenPicker: () => void;
  /** Picker selection (null clears the mark). */
  onPickMark: (mark: Tag | null) => void;
  /** Toggles this card's clue between active and consumed. */
  onToggleClue: () => void;
}

export default function Card({
  person,
  label,
  flipped,
  rejected,
  tag,
  mark,
  consumed,
  justFlipped,
  numberReferenced,
  colourReferenced,
  numberBounce,
  colourBounce,
  pickerOpen,
  hintClue,
  hintCard,
  clueNode,
  onOpen,
  onCycleTag,
  onOpenPicker,
  onPickMark,
  onToggleClue,
}: CardProps) {
  const pressTimer = useRef<number | null>(null);

  const startPress = () => {
    pressTimer.current = window.setTimeout(onOpenPicker, LONG_PRESS_MS);
  };
  const endPress = () => {
    if (pressTimer.current !== null) {
      clearTimeout(pressTimer.current);
      pressTimer.current = null;
    }
  };

  const classes = [
    "card",
    // The colour group's highlight, which used to be a ring on the band. With
    // the band gone the card itself takes it: the number already glows for a
    // number reference, and two glows on one card could not be told apart.
    colourReferenced ? "colour-ref" : "",
    colourBounce ? "colour-bounce" : "",
    flipped ? "flipped" : "",
    // The card's own word for the trait the DSL calls `not_numberwang`, which
    // keeps its underscored name in hints and puzzle data. Tests still read
    // this with classList.contains rather than a substring check: the two words
    // no longer overlap, but the next state class added here might.
    flipped ? (person.numberwang ? "numberwang" : "wangernumb") : "",
    rejected ? "rejected" : "",
    consumed ? "consumed" : "",
    hintClue ? "hint-clue" : "",
    hintCard ? "hint-card" : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div className="card-container">
      <div
        role="group"
        className={classes}
        style={{
          // The card's group colour. The number is drawn in it, and that is
          // the only place the group shows on the card.
          ["--card-colour" as string]: `var(--colour-${person.colour})`,
        }}
        onClick={flipped ? undefined : onOpen}
      >
        <div
          className={tag ? `tag tag-${tag}` : "tag"}
          onClick={(e) => {
            e.stopPropagation();
            onCycleTag();
          }}
        />
        <div
          className={mark ? `mark mark-${mark}` : "mark"}
          onPointerDown={(e) => {
            e.stopPropagation();
            startPress();
          }}
          onPointerUp={endPress}
          onPointerLeave={endPress}
          onContextMenu={(e) => e.preventDefault()}
          onClick={(e) => e.stopPropagation()}
        />
        <div className="card-pos">{label}</div>
        {justFlipped && (
          <div className="speech-bubble">
            {person.numberwang ? "That's Numberwang!" : "Correct!"}
          </div>
        )}
        <div
          className={[
            "card-number",
            numberReferenced ? "referenced" : "",
            numberBounce ? "bounce" : "",
          ]
            .filter(Boolean)
            .join(" ")}
        >
          {person.number}
        </div>
        {flipped && clueNode && (
          // A card with no logical clue carries a maths or science fact
          // instead, and says so by leaning over: the player should be able to
          // tell at a glance which cards are worth reasoning about. `origHint`
          // is the deduction the clue came from, so a null one is a fact.
          <div
            className={person.origHint === null ? "card-clue flavour" : "card-clue"}
            onClick={onToggleClue}
          >
            {clueNode}
          </div>
        )}
      </div>
      {/* The burst goes outside the card, which is `overflow: hidden`: confetti
          that cannot leave the card it is thrown from is just a pattern. It
          lives as long as the bubble does and then unmounts, so nothing is left
          speckling a solved board. */}
      {justFlipped && person.numberwang && (
        <div className="confetti-burst" aria-hidden="true">
          {CONFETTI_PIECES.map((i) => (
            <span key={i} className="confetti-piece" style={{ ["--i" as string]: String(i) }} />
          ))}
        </div>
      )}
      {pickerOpen && (
        <div className="tag-picker" onClick={(e) => e.stopPropagation()}>
          {TAG_COLORS.map((color) => (
            <button
              key={color ?? "none"}
              aria-label={color ? `${color} mark` : "clear mark"}
              className={[
                "tag-swatch",
                `swatch-${color ?? "none"}`,
                (mark ?? null) === color ? "active" : "",
              ]
                .filter(Boolean)
                .join(" ")}
              onClick={() => onPickMark(color)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
