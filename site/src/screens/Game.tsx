import { useEffect, useRef, useState } from "react";
import type { Puzzle } from "../../../shared/puzzle";
import { validatePuzzle } from "../../../shared/puzzle";
import Grid from "../components/Grid";
import type { GameState, Guess } from "../game/reducer";
import { useGameState } from "../game/useGameState";
import { useFetch } from "../useFetch";

function formatTime(ms: number): string {
  const total = Math.floor(ms / 1000);
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}

// Wall-clock elapsed, biggest-first and trimmed to what's needed. Under an
// hour it's plain mm:ss (00:22, 12:05); past that the units are labelled
// (03h:06m:12s, 11d:02h:05m:00s).
function formatElapsed(ms: number): string {
  let rest = Math.max(0, Math.floor(ms / 1000));
  if (rest < 3_600) return formatTime(rest * 1000);
  const parts: string[] = [];
  for (const [suffix, size] of [
    ["d", 86_400],
    ["h", 3_600],
    ["m", 60],
    ["s", 1],
  ] as const) {
    const value = Math.floor(rest / size);
    rest %= size;
    if (parts.length === 0 && value === 0 && suffix !== "s") continue;
    parts.push(`${String(value).padStart(2, "0")}${suffix}`);
  }
  return parts.join(":");
}

/** Timer display, cycled by tapping it; the choice is kept in localStorage. */
type TimerMode = "minutes" | "seconds" | "elapsed";
const TIMER_MODES: TimerMode[] = ["minutes", "seconds", "elapsed"];
const TIMER_MODE_KEY = "nw:pref:timerMode";

function loadTimerMode(): TimerMode {
  const saved = localStorage.getItem(TIMER_MODE_KEY);
  if (TIMER_MODES.includes(saved as TimerMode)) return saved as TimerMode;
  // Migrate the old two-state seconds toggle.
  return localStorage.getItem("nw:pref:showSeconds") === "1" ? "seconds" : "minutes";
}

// "2026-07-07" -> "Jul 7th 2026"
function formatDateOrdinal(date: string): string {
  const d = new Date(`${date}T00:00:00`);
  const day = d.getDate();
  const suffix =
    day % 100 >= 11 && day % 100 <= 13
      ? "th"
      : (["th", "st", "nd", "rd"][day % 10] ?? "th");
  return `${d.toLocaleString("en-US", { month: "short" })} ${day}${suffix} ${d.getFullYear()}`;
}

function shareLabel(puzzle: Puzzle): string {
  // Every board here is 4x5, so a size would print the same string every day;
  // the difficulty is the only thing that distinguishes one date from another.
  return `${formatDateOrdinal(puzzle.date)} (${puzzle.difficulty})`;
}

function puzzleLabel(puzzle: Puzzle): string {
  return shareLabel(puzzle);
}

function shareOf(slug: string): { tag: string; link: string } {
  // One branch where `cbsbd` had two: there is no source site to link to and no
  // variant to distinguish, so a puzzle links to its own address here. The slug
  // is the one this screen was opened at rather than one rebuilt from the date.
  const { origin, pathname } = window.location;
  return { tag: "#Numberwang", link: `${origin}${pathname}#/play/${slug}` };
}

// Results grid: green = clean solve, yellow square = had a bad answer,
// yellow circle = flipped with a hint, orange circle = with the hint's
// reveal level. Hints outrank bad answers, like on the real site.
type CellColor = "green" | "yellow" | "hint" | "second-hint";

function cellColors(puzzle: Puzzle, state: GameState): CellColor[] {
  return puzzle.people.map((_, i) =>
    state.hinted[i] ?? (state.wrong.includes(i) ? "yellow" : "green"),
  );
}

/** The last card correctly flipped by a guess, or null if only initial reveals are flipped. */
function mostRecentCorrectFlip(puzzle: Puzzle, state: GameState): number | null {
  return state.flipped.length > puzzle.initialReveals.length
    ? state.flipped[state.flipped.length - 1]
    : null;
}

const CELL_EMOJI: Record<CellColor, string> = {
  green: "🟩",
  yellow: "🟨",
  hint: "🟡",
  "second-hint": "🟠",
};

function ResultsModal({
  puzzle,
  slug,
  state,
  onClose,
}: {
  puzzle: Puzzle;
  /** The address this puzzle was opened at, which is what the share text links. */
  slug: string;
  state: GameState;
  onClose: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const title = puzzleLabel(puzzle);
  const solvedIn = `Solved in ${formatTime(state.elapsedMs)}`;
  const colors = cellColors(puzzle, state);
  const rows = [...Array(puzzle.height)].map((_, r) =>
    colors.slice(r * puzzle.width, (r + 1) * puzzle.width),
  );

  const copyText = async () => {
    const grid = rows
      .map((row) => row.map((c) => CELL_EMOJI[c]).join(""))
      .join("\n");
    const { tag, link } = shareOf(slug);
    await navigator.clipboard.writeText(
      `I solved the daily ${tag}, ${shareLabel(puzzle)}, in ${formatTime(state.elapsedMs)}\n${grid}\n${link}`,
    );
    setCopied(true);
  };

  return (
    <div className="overlay" onClick={onClose}>
      <div
        role="dialog"
        aria-label="results"
        className="modal"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="results-title">{title}</h2>
        <div className="share-grid">
          {rows.map((row, r) => (
            <div key={r} className="share-row">
              {row.map((color, c) => (
                <span key={c} className={`share-cell share-${color}`} />
              ))}
            </div>
          ))}
        </div>
        <p className="solved-in">{solvedIn}</p>
        <button className="btn-copy" onClick={copyText}>
          {copied ? "Copied!" : "Copy Text"}
        </button>
        <button className="btn-close" onClick={onClose}>
          Close
        </button>
      </div>
    </div>
  );
}

/** The spoken name of a verdict. `Guess` is the DSL's token, which no player
 * should ever be shown — "not_numberwang" in a sentence is a leak. */
const VERDICT: Record<Guess, string> = {
  numberwang: "Numberwang",
  not_numberwang: "Wangernumb",
};

// Wrong-guess popup, inherited from the real site's "Not enough evidence!"
// modal (sans the share-scenario option). Shown for both wrong-verdict and
// non-deducible guesses, so its wording has to cover the two without leaking
// which one happened — which is why it talks about what is provable rather
// than about what is true.
function NotProvenModal({
  name,
  guess,
  onClose,
}: {
  name: string;
  guess: Guess;
  onClose: () => void;
}) {
  const other: Guess = guess === "numberwang" ? "not_numberwang" : "numberwang";
  return (
    <div className="overlay" onClick={onClose}>
      <div
        role="dialog"
        aria-label="not enough information"
        className="modal not-proven-modal"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="not-proven-title">⚠️ Not enough information!</h2>
        <p className="not-proven-text">
          <b className="card-ref">{name}</b> can't be logically identified as{" "}
          <b>{VERDICT[guess]}</b> from the clues on the board.
        </p>
        <p className="not-proven-text">
          This means there exists at least one other logical scenario where{" "}
          <b className="card-ref">{name}</b> could be <b>{VERDICT[other]}</b>
        </p>
        <button className="btn-continue" onClick={onClose}>
          Continue
        </button>
      </div>
    </div>
  );
}

function GuessModal({
  puzzle,
  index,
  blocked,
  onGuess,
  onClose,
}: {
  puzzle: Puzzle;
  index: number;
  /** Verdicts already rejected for this suspect; disabled until the next reveal. */
  blocked: Guess[];
  onGuess: (guess: Guess) => void;
  onClose: () => void;
}) {
  const person = puzzle.people[index];
  return (
    <div className="overlay" onClick={onClose}>
      <div
        role="dialog"
        aria-label={String(person.number)}
        className="modal"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-number">{person.number}</div>
        {/* The card's band, repeated: the modal covers the board, so without it
            a clue about a colour group cannot be checked against the card being
            called. */}
        <div
          className="modal-colour"
          style={{ background: `var(--colour-${person.colour})` }}
          aria-label={person.colour}
        />
        <div className="modal-choices">
          <button
            className="btn-numberwang"
            disabled={blocked.includes("numberwang")}
            onClick={() => onGuess("numberwang")}
          >
            Numberwang
          </button>
          <button
            className="btn-wangernumb"
            disabled={blocked.includes("not_numberwang")}
            onClick={() => onGuess("not_numberwang")}
          >
            Wangernumb
          </button>
        </div>
        <button className="btn-close" onClick={onClose}>
          Close
        </button>
      </div>
    </div>
  );
}

/** Set when the page is left with a puzzle in progress; cleared on the next mount. */
const parkedKey = (puzzleId: string) => `nw:parked:${puzzleId}`;

/** True when this page load is a refresh, as opposed to a fresh visit. */
function wasReload(): boolean {
  const [nav] = performance.getEntriesByType("navigation") as PerformanceNavigationTiming[];
  return nav?.type === "reload";
}

// The real site lets the final flip, Correct! bubble, and board settle play
// out before the results popup and post-solve controls appear.
const RESULTS_DELAY_MS = 2700;

function Board({ puzzle, slug }: { puzzle: Puzzle; slug: string }) {
  const { state, dispatch } = useGameState(puzzle);
  const [guessing, setGuessing] = useState<number | null>(null);
  // A puzzle that loads already solved shows its results right away; the
  // 2.7s completion delay only applies to a live solve.
  const [resultsOpen, setResultsOpen] = useState(state.completed);
  // Post-solve UI (banner, Results button); immediate for already-solved puzzles.
  const [postComplete, setPostComplete] = useState(state.completed);
  // A puzzle is "new" when localStorage holds no guesses and no elapsed time.
  const [startOpen, setStartOpen] = useState(
    () =>
      !state.completed &&
      state.mistakes === 0 &&
      state.elapsedMs === 0 &&
      state.flipped.length === puzzle.initialReveals.length,
  );
  const completedAtMount = useRef(state.completed);

  useEffect(() => {
    if (state.completed && !completedAtMount.current) {
      const t = setTimeout(() => {
        setResultsOpen(true);
        setPostComplete(true);
      }, RESULTS_DELAY_MS);
      return () => clearTimeout(t);
    }
  }, [state.completed]);

  const begun =
    state.elapsedMs > 0 ||
    state.mistakes > 0 ||
    state.flipped.length > puzzle.initialReveals.length;

  // Two flags, because they answer different questions on the next load. A
  // pause the player asked for is sticky: a refresh comes back paused. An
  // auto-pause only parks the puzzle - a refresh resumes, but a fresh visit
  // (the tab was closed, the phone was locked) stays paused until unpaused.
  // A solved puzzle is never paused - there is no clock left to stop, so a
  // pause left over from mid-solve is dropped.
  const [paused, setPaused] = useState(
    () =>
      !state.completed &&
      (localStorage.getItem(`nw:paused:${puzzle.id}`) === "1" ||
        (localStorage.getItem(parkedKey(puzzle.id)) === "1" && !wasReload())),
  );

  // The park flag is consumed by the mount above; drop it so it can only ever
  // apply to the leave that wrote it.
  useEffect(() => {
    localStorage.removeItem(parkedKey(puzzle.id));
  }, [puzzle.id]);

  // Anything that hides the page - locking the phone, switching apps or tabs,
  // minimizing, closing - stops the clock. visibilitychange is the prompt,
  // reliable signal (background timers are throttled, not stopped, so without
  // this the hidden page keeps crediting time in minute-long chunks);
  // pagehide is the backstop for a teardown that skips straight to unload.
  useEffect(() => {
    if (!begun || state.completed || paused) return;
    const park = () => {
      localStorage.setItem(parkedKey(puzzle.id), "1");
      dispatch({ type: "pause", now: Date.now() });
      setPaused(true);
    };
    const onHide = () => {
      if (document.visibilityState === "hidden") park();
    };
    // Restoring from the back/forward cache keeps the live React state, so
    // that path has to be paused here rather than at the next mount.
    const restore = (e: PageTransitionEvent) => {
      if (e.persisted) park();
    };
    // A tab restored in the background is already hidden, and no event is coming.
    if (document.visibilityState === "hidden") park();
    document.addEventListener("visibilitychange", onHide);
    window.addEventListener("pagehide", park);
    window.addEventListener("pageshow", restore);
    return () => {
      document.removeEventListener("visibilitychange", onHide);
      window.removeEventListener("pagehide", park);
      window.removeEventListener("pageshow", restore);
    };
  }, [begun, state.completed, paused, puzzle.id, dispatch]);

  // A started puzzle resumes its clock immediately after a page refresh,
  // unless it was left paused (that stays paused until unpaused).
  useEffect(() => {
    if (begun && !state.completed && !paused) dispatch({ type: "start", now: Date.now() });
    // Mount-time resume only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Bottom-right mark color picker; any click outside it closes it.
  const [pickerIndex, setPickerIndex] = useState<number | null>(null);
  useEffect(() => {
    if (pickerIndex === null) return;
    const close = (e: PointerEvent) => {
      if (!(e.target as Element | null)?.closest(".tag-picker")) setPickerIndex(null);
    };
    window.addEventListener("pointerdown", close);
    return () => window.removeEventListener("pointerdown", close);
  }, [pickerIndex]);

  // "Correct!" speech bubble on the card that just flipped (real-site pop-fade).
  // Also flashed on the most recent correct suspect right from mount (a
  // refresh) - set via the initial state itself so it's there on the very
  // first paint, not a follow-up effect - and again when coming out of pause,
  // so the feedback isn't lost mid-solve.
  const [justFlipped, setJustFlipped] = useState<number | null>(() =>
    state.completed ? null : mostRecentCorrectFlip(puzzle, state),
  );
  const flashTimer = useRef<number | null>(null);
  const flashCorrect = (index: number) => {
    setJustFlipped(index);
    if (flashTimer.current !== null) clearTimeout(flashTimer.current);
    flashTimer.current = window.setTimeout(() => setJustFlipped(null), 1300);
  };
  const prevFlippedLen = useRef(state.flipped.length);
  useEffect(() => {
    if (state.flipped.length > prevFlippedLen.current) {
      prevFlippedLen.current = state.flipped.length;
      flashCorrect(state.flipped[state.flipped.length - 1]);
    } else {
      prevFlippedLen.current = state.flipped.length;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.flipped]);

  // Arms the auto-clear for the flash set by the initial state above.
  useEffect(() => {
    if (justFlipped === null) return;
    flashTimer.current = window.setTimeout(() => setJustFlipped(null), 1300);
    // Mount-time only; later flashes are timed by flashCorrect itself.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Once started (and not paused/completed), the clock ticks every second the
  // page is shown; each tick folds elapsed time into state, which persists it.
  useEffect(() => {
    if (state.completed) return;
    const id = setInterval(() => dispatch({ type: "tick", now: Date.now() }), 1000);
    return () => clearInterval(id);
  }, [state.completed, dispatch]);
  const elapsed = state.elapsedMs;
  // The coarse reading is an upper bound, so 1:20 reads "< 2 min" rather than
  // claiming a flat minute.
  const minutes = Math.floor(elapsed / 60_000) + 1;
  const [timerMode, setTimerMode] = useState<TimerMode>(loadTimerMode);
  const cycleTimerMode = () => {
    const next = TIMER_MODES[(TIMER_MODES.indexOf(timerMode) + 1) % TIMER_MODES.length];
    localStorage.setItem(TIMER_MODE_KEY, next);
    setTimerMode(next);
  };

  // Elapsed mode is wall-clock from the start of the puzzle - it ignores
  // pauses, so it needs its own clock. It runs to now while the puzzle is
  // unsolved, and stops at the winning flip once it is solved.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (timerMode !== "elapsed" || state.completed) return;
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [timerMode, state.completed]);
  const until = state.completedAt ?? now;
  const sinceStart = state.startedAt === null ? 0 : until - state.startedAt;
  const [resetOpen, setResetOpen] = useState(false);

  // Only the button writes the sticky flag - it's the one pause the player
  // chose, so it's the one that should survive a refresh.
  const togglePause = () => {
    localStorage.setItem(`nw:paused:${puzzle.id}`, paused ? "0" : "1");
    localStorage.removeItem(parkedKey(puzzle.id));
    if (paused) {
      dispatch({ type: "start", now: Date.now() });
      setPaused(false);
      const recent = mostRecentCorrectFlip(puzzle, state);
      if (recent !== null) flashCorrect(recent);
    } else {
      dispatch({ type: "pause", now: Date.now() });
      setPaused(true);
    }
  };

  const confirmReset = () => {
    dispatch({ type: "reset" });
    localStorage.setItem(`nw:paused:${puzzle.id}`, "0");
    localStorage.removeItem(parkedKey(puzzle.id));
    setResetOpen(false);
    setPaused(false);
    setStartOpen(true);
    setPostComplete(false);
    completedAtMount.current = false; // re-solving after a reset animates again
  };

  return (
    <main className="game">
      <div className="board-wrap">
        {/* Inside the wrapper on purpose: the wrapper is zoomed and scrolls with
            the board, so a dim outside it would neither line up with the board
            nor stay clear of the button row. */}
        {paused && <div className="pause-overlay" />}
        <Grid
          puzzle={puzzle}
          state={state}
          justFlipped={justFlipped}
          pickerIndex={pickerIndex}
          onOpen={setGuessing}
          onCycleTag={(index) => dispatch({ type: "cycleTag", index })}
          onOpenPicker={setPickerIndex}
          onPickMark={(index, mark) => {
            dispatch({ type: "setMark", index, mark });
            setPickerIndex(null);
          }}
          onToggleClue={(index) => dispatch({ type: "toggleConsumed", index })}
        />
        <div className="controls">
          <div className="button-row">
            <button
              className="btn-pause"
              aria-label={paused ? "Unpause" : "Pause"}
              disabled={state.completed}
              onClick={togglePause}
            >
              {/* The action the button performs: bars while running, triangle
                  while paused. Drawn rather than emoji, which vary by platform. */}
              <svg viewBox="0 0 20 16" width="18" height="14" aria-hidden="true">
                {paused ? (
                  <path
                    d="M6.9 2.6 C6.9 1.4 7.8 1 8.6 1.7 L13.9 7.1 C14.4 7.6 14.4 8.4 13.9 8.9 L8.6 14.3 C7.8 15 6.9 14.6 6.9 13.4 Z"
                    fill="currentColor"
                  />
                ) : (
                  <>
                    <rect x="6.2" y="1.5" width="3.2" height="13" rx="1.4" fill="currentColor" />
                    <rect x="11" y="1.5" width="3.2" height="13" rx="1.4" fill="currentColor" />
                  </>
                )}
              </svg>
            </button>
            <button
              disabled={
                Object.keys(state.tags).length === 0 && Object.keys(state.marks).length === 0
              }
              onClick={() => dispatch({ type: "clearTags" })}
            >
              Clear Tags
            </button>
            <button onClick={() => setResetOpen(true)}>Reset</button>
            <button
              className="btn-hint"
              disabled={!puzzle.hints || state.completed}
              onClick={() => dispatch({ type: "hint", now: Date.now() })}
            >
              💡
              {state.hint && state.hintRevealed
                ? "Hide hint"
                : state.hint
                  ? "Show more"
                  : "Show hint"}
            </button>
          </div>
          <p className="date-line">
            <span>{puzzleLabel(puzzle)}</span>
            <span className="timer" onClick={cycleTimerMode}>
              {timerMode === "elapsed"
                ? `Elapsed: ${formatElapsed(sinceStart)}`
                : timerMode === "seconds"
                  ? `Timed: ${formatTime(elapsed)}`
                  : `Timed: < ${minutes} min`}
            </span>
          </p>
        </div>
        {postComplete && (
          <p className="completed">
            Solved! {state.mistakes} mistake{state.mistakes === 1 ? "" : "s"} ·{" "}
            {formatTime(state.elapsedMs)}{" "}
            <button
              className="btn-results"
              onClick={() => setResultsOpen(true)}
            >
              Results
            </button>
          </p>
        )}
        <p className="archive-link">
          <a href="#/">← Archive</a>
        </p>
      </div>
      {state.rejectedIndex !== null && state.rejectedGuess !== null && (
        <NotProvenModal
          name={String(puzzle.people[state.rejectedIndex].number)}
          guess={state.rejectedGuess}
          onClose={() => dispatch({ type: "clearRejection" })}
        />
      )}
      {resetOpen && (
        <div className="overlay" onClick={() => setResetOpen(false)}>
          <div
            role="dialog"
            aria-label="reset"
            className="modal reset-modal"
            onClick={(e) => e.stopPropagation()}
          >
            <p className="reset-question">Reset this puzzle?</p>
            <div className="modal-choices">
              <button className="btn-numberwang" onClick={confirmReset}>
                Reset
              </button>
              <button className="btn-close" onClick={() => setResetOpen(false)}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
      {resultsOpen && (
        <ResultsModal
          puzzle={puzzle}
          slug={slug}
          state={state}
          onClose={() => setResultsOpen(false)}
        />
      )}
      {startOpen && (
        <div className="overlay">
          <div role="dialog" aria-label="start" className="modal start-modal">
            <h2 className="start-title">Welcome to Numberwang!</h2>
            <p className="start-date">{formatDateOrdinal(puzzle.date)}</p>
            {/* The label is our own classifier's reading of a puzzle nobody
                else has played — reported, never aimed at. */}
            <p className="start-difficulty">
              Difficulty: <b>{puzzle.difficulty}</b>
            </p>
            <button
              className="btn-start"
              onClick={() => {
                dispatch({ type: "start", now: Date.now() });
                setStartOpen(false);
              }}
            >
              Start
            </button>
          </div>
        </div>
      )}
      {guessing !== null && (
        <GuessModal
          puzzle={puzzle}
          index={guessing}
          blocked={state.blocked[guessing] ?? []}
          onGuess={(guess) => {
            dispatch({
              type: "guess",
              index: guessing,
              guess,
              now: Date.now(),
            });
            setGuessing(null);
          }}
          onClose={() => setGuessing(null)}
        />
      )}
    </main>
  );
}

export default function Game({ slug }: { slug: string }) {
  const { data, error, retry } = useFetch<unknown>(`puzzles/${slug}.json`);
  if (error) {
    return (
      <main>
        <p>Failed to load puzzle: {error}</p>
        <button onClick={retry}>Retry</button>
      </main>
    );
  }
  if (!data) return <p>Loading {slug}</p>;
  let puzzle: Puzzle;
  try {
    puzzle = validatePuzzle(data);
  } catch (e) {
    return (
      <main>
        <p>Bad puzzle data: {String(e)}</p>
      </main>
    );
  }
  return <Board puzzle={puzzle} slug={slug} />;
}
