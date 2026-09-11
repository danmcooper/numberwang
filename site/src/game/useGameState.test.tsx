// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import type { Puzzle } from '../../../shared/puzzle';
import { loadProgress, saveProgress } from './storage';
import { useGameState } from './useGameState';

const puzzle: Puzzle = {
  formatVersion: 1,
  id: 'a6f09e2713b2',
  date: '2026-07-07',
  title: 'T',
  difficulty: 'Easy',
  width: 2,
  height: 2,
  initialReveals: [0],
  source: 'generated',
  people: [
    { number: 3, colour: 'red', numberwang: false, clue: null, origHint: null, paths: [] },
    { number: 1, colour: 'teal', numberwang: true, clue: null, origHint: null, paths: [[0]] },
    { number: 4, colour: 'red', numberwang: false, clue: null, origHint: null, paths: [[0, 1]] },
    { number: 2, colour: 'blue', numberwang: true, clue: null, origHint: null, paths: [[0, 2]] },
  ],
};

beforeEach(() => localStorage.clear());

describe('useGameState', () => {
  it('starts fresh and persists after each action', () => {
    const { result } = renderHook(() => useGameState(puzzle));
    expect(result.current.state.flipped).toEqual([0]);
    act(() => result.current.dispatch({ type: 'guess', index: 1, guess: 'numberwang', now: 1000 }));
    expect(result.current.state.flipped).toEqual([0, 1]);
    expect(loadProgress(puzzle.id)).toMatchObject({ flipped: [0, 1], mistakes: 0 });
  });

  it('restores saved progress on mount', () => {
    saveProgress(puzzle.id, { flipped: [0, 1], mistakes: 2, elapsedMs: 30_000, completed: false });
    const { result } = renderHook(() => useGameState(puzzle));
    expect(result.current.state.flipped).toEqual([0, 1]);
    expect(result.current.state.mistakes).toBe(2);
    expect(result.current.state.elapsedMs).toBe(30_000);
  });

  it('persists and restores hint bookkeeping', () => {
    const hinted: Puzzle = { ...puzzle, hints: [{ flipped: [0], clues: [0], reveals: [1] }] };
    const first = renderHook(() => useGameState(hinted));
    act(() => first.result.current.dispatch({ type: 'hint', now: 1000 }));
    act(() =>
      first.result.current.dispatch({ type: 'guess', index: 1, guess: 'numberwang', now: 2000 }),
    );
    expect(loadProgress(puzzle.id)).toMatchObject({ hinted: { 1: 'hint' }, pendingHint: null });
    first.unmount();
    const second = renderHook(() => useGameState(hinted));
    expect(second.result.current.state.hinted).toEqual({ 1: 'hint' });
  });
});
