// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { parseHash, useRoute } from './router';

describe('parseHash', () => {
  it('routes a bare date to play', () => {
    expect(parseHash('#/play/2026-09-10')).toEqual({ screen: 'play', slug: '2026-09-10' });
  });

  it('routes a variant suffix to the archive — there are no variants', () => {
    expect(parseHash('#/play/2026-09-10-dan')).toEqual({ screen: 'archive' });
  });

  it('routes a named puzzle to the archive — there are no one-offs', () => {
    expect(parseHash('#/play/10x10')).toEqual({ screen: 'archive' });
  });

  it('routes anything else to the archive', () => {
    expect(parseHash('#/')).toEqual({ screen: 'archive' });
    expect(parseHash('')).toEqual({ screen: 'archive' });
    expect(parseHash('#/nonsense')).toEqual({ screen: 'archive' });
    expect(parseHash('#/play/not-a-date')).toEqual({ screen: 'archive' });
  });
});

describe('useRoute', () => {
  const DATE = '2026-09-10';

  /** Moves the address on without the `hashchange` an in-page link would fire. */
  const silentlyGoTo = (hash: string) => window.history.replaceState(null, '', hash);

  beforeEach(() => silentlyGoTo('#/'));

  it('follows the hash changing under it', async () => {
    const { result } = renderHook(() => useRoute());
    expect(result.current).toEqual({ screen: 'archive' });
    await act(async () => {
      window.location.hash = `#/play/${DATE}`;
      // jsdom queues `hashchange` rather than firing it inline, so the
      // assertion has to wait a turn for it the way a browser would.
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    expect(result.current).toEqual({ screen: 'play', slug: DATE });
  });

  // A phone browser can hand an incoming link to a tab it had put away, which
  // arrives as the page being shown again rather than as the hash changing. Any
  // shared link opened against an already-open tab depends on these two.
  it('catches up on being restored from the back/forward cache', () => {
    const { result } = renderHook(() => useRoute());
    silentlyGoTo(`#/play/${DATE}`);
    expect(result.current).toEqual({ screen: 'archive' });
    act(() => {
      window.dispatchEvent(new Event('pageshow'));
    });
    expect(result.current).toEqual({ screen: 'play', slug: DATE });
  });

  it('catches up on being switched back to', () => {
    const { result } = renderHook(() => useRoute());
    silentlyGoTo(`#/play/${DATE}`);
    act(() => {
      document.dispatchEvent(new Event('visibilitychange'));
    });
    expect(result.current).toEqual({ screen: 'play', slug: DATE });
  });

  // Re-reading on every appearance would otherwise remount the game and lose a
  // half-solved board every time the player glanced at another app.
  it('hands back the very same route when the address has not moved', () => {
    silentlyGoTo(`#/play/${DATE}`);
    const { result } = renderHook(() => useRoute());
    const before = result.current;
    act(() => {
      document.dispatchEvent(new Event('visibilitychange'));
      window.dispatchEvent(new Event('pageshow'));
    });
    expect(result.current).toBe(before);
  });
});
