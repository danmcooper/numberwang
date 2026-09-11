import { useRef, type ReactNode } from "react";
import type { Person } from "../../../shared/puzzle";
import { TAG_COLORS, type Tag } from "../game/reducer";

const LONG_PRESS_MS = 400;

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
  /** An active (unconsumed) clue mentions this card's name / colour. */
  nameReferenced: boolean;
  profReferenced: boolean;
  /** A clue newly revealed this reference (not on mount, not the clue's own card): play the bounce. */
  nameBounce: boolean;
  profBounce: boolean;
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
  nameReferenced,
  profReferenced,
  nameBounce,
  profBounce,
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
    flipped ? "flipped" : "",
    flipped ? (person.numberwang ? "numberwang" : "not_numberwang") : "",
    rejected ? "rejected" : "",
    consumed ? "consumed" : "",
    hintClue ? "hint-clue" : "",
    hintCard ? "hint-card" : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div className="card-container">
      <div role="group" className={classes} onClick={flipped ? undefined : onOpen}>
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
        {justFlipped && <div className="speech-bubble">Correct!</div>}
        <div
          className={[
            "card-name",
            nameReferenced ? "referenced" : "",
            nameBounce ? "bounce" : "",
          ]
            .filter(Boolean)
            .join(" ")}
        >
          {person.number}
        </div>
        <div
          className={[
            "card-prof",
            profReferenced ? "referenced" : "",
            profBounce ? "bounce" : "",
          ]
            .filter(Boolean)
            .join(" ")}
        >
          {person.colour}
        </div>
        {flipped && clueNode && (
          <div className="card-clue" onClick={onToggleClue}>
            {clueNode}
          </div>
        )}
      </div>
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
