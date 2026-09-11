// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import { loadProgress, saveProgress } from './storage';

const saved = { flipped: [0, 2], mistakes: 1, elapsedMs: 12_000, completed: false };

beforeEach(() => localStorage.clear());

describe('storage', () => {
  it('namespaces progress under nw:, not cbs:', () => {
    saveProgress('abc123', { flipped: [1], mistakes: 0, elapsedMs: 0, completed: false });
    expect(localStorage.getItem('nw:progress:abc123')).not.toBeNull();
    expect(localStorage.getItem('cbs:progress:abc123')).toBeNull();
  });

  it('round-trips progress keyed by puzzle id', () => {
    saveProgress('a6f09e2713b2', saved);
    expect(loadProgress('a6f09e2713b2')).toEqual(saved);
    expect(localStorage.getItem('nw:progress:a6f09e2713b2')).toBeTruthy();
    expect(loadProgress('ffffffffffff')).toBeNull();
  });

  it('resets only the corrupt entry', () => {
    saveProgress('a6f09e2713b2', saved);
    localStorage.setItem('nw:progress:ffffffffffff', '{not json');
    expect(loadProgress('ffffffffffff')).toBeNull();
    expect(localStorage.getItem('nw:progress:ffffffffffff')).toBeNull();
    expect(loadProgress('a6f09e2713b2')).toEqual(saved);
  });

  it('treats structurally wrong entries as corrupt', () => {
    localStorage.setItem('nw:progress:a6f09e2713b2', '{"flipped":"nope"}');
    expect(loadProgress('a6f09e2713b2')).toBeNull();
  });
});

describe('storage tags', () => {
  it('round-trips tags and marks and tolerates saves without them', () => {
    saveProgress('a6f09e2713b2', { ...saved, tags: { 2: 'green' }, marks: { 3: 'magenta' } });
    expect(loadProgress('a6f09e2713b2')?.tags).toEqual({ 2: 'green' });
    expect(loadProgress('a6f09e2713b2')?.marks).toEqual({ 3: 'magenta' });
    localStorage.setItem('nw:progress:ffffffffffff', JSON.stringify(saved));
    expect(loadProgress('ffffffffffff')).toMatchObject({ flipped: [0, 2] });
  });

  it('rejects saves with an invalid mark color', () => {
    localStorage.setItem(
      'nw:progress:a6f09e2713b2',
      JSON.stringify({ ...saved, marks: { 1: 'purple' } }),
    );
    expect(loadProgress('a6f09e2713b2')).toBeNull();
  });
});

describe('storage hints', () => {
  it('round-trips hinted marks and the pending penalty', () => {
    saveProgress('a6f09e2713b2', {
      ...saved,
      hinted: { 1: 'hint', 3: 'second-hint' },
      pendingHint: 'second-hint',
    });
    const loaded = loadProgress('a6f09e2713b2');
    expect(loaded?.hinted).toEqual({ 1: 'hint', 3: 'second-hint' });
    expect(loaded?.pendingHint).toBe('second-hint');
  });

  it('rejects invalid hint levels but tolerates their absence', () => {
    localStorage.setItem(
      'nw:progress:a6f09e2713b2',
      JSON.stringify({ ...saved, hinted: { 1: 'mega-hint' } }),
    );
    expect(loadProgress('a6f09e2713b2')).toBeNull();
    localStorage.setItem('nw:progress:ffffffffffff', JSON.stringify(saved));
    expect(loadProgress('ffffffffffff')).toMatchObject({ flipped: [0, 2] });
  });
});
