import { useEffect, useState } from 'react';

export type Route = { screen: 'archive' } | { screen: 'play'; slug: string };

/**
 * A play slug is a date, full stop.
 *
 * `cbsbd` built this pattern out of `VARIANTS` and `ONE_OFFS` so that adding a
 * variant made its links open — a slug that was not in those tables was not a
 * route. With every puzzle simply the puzzle for its date, the tables are gone
 * and so is the machinery that read them.
 */
const PLAY = /^#\/play\/(\d{4}-\d{2}-\d{2})$/;

export function parseHash(hash: string): Route {
  const m = hash.match(PLAY);
  return m ? { screen: 'play', slug: m[1] } : { screen: 'archive' };
}

/** Identifies a route, so a re-read that found no change can keep the old one. */
const keyOf = (route: Route) => (route.screen === 'play' ? `play/${route.slug}` : route.screen);

export function useRoute(): Route {
  const [route, setRoute] = useState<Route>(() => parseHash(window.location.hash));
  useEffect(() => {
    const sync = () =>
      setRoute((prev) => {
        const next = parseHash(window.location.hash);
        return keyOf(prev) === keyOf(next) ? prev : next;
      });
    // `hashchange` is the event for a hash that changes while the page is
    // watching. A tab on a phone is often not watching: it comes back from the
    // back/forward cache, or the browser hands an incoming link to a tab it had
    // frozen, and the page can find itself showing one route at an address that
    // says another. Neither of those fires `hashchange`; `pageshow` covers the
    // first and `visibilitychange` the second, so re-read on all three.
    //
    // Re-reading is only safe because it is cheap and idempotent: a parse and,
    // when the route has not moved, the same object back, so a tab that is
    // merely being switched to does not re-render or lose its game state.
    window.addEventListener('hashchange', sync);
    window.addEventListener('pageshow', sync);
    document.addEventListener('visibilitychange', sync);
    return () => {
      window.removeEventListener('hashchange', sync);
      window.removeEventListener('pageshow', sync);
      document.removeEventListener('visibilitychange', sync);
    };
  }, []);
  return route;
}
