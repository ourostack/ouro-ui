"use client";

import { useCallback, useSyncExternalStore } from "react";

/**
 * The list for each query, kept by the `matchMedia` that made it: a list's `matches` is live, so one per query serves every
 * reader and every render. Only a browser's own `MediaQueryList` is kept, and none from a Vitest or Jest mock (which has a
 * `mock` property): a test's stub that answers with plain objects, or a mock that may change its answer between renders, is
 * asked again on every read, and a `matchMedia` swapped in makes lists of its own.
 * @claim "The list for each query, kept by" registry/ouro/lib/ouro/use-media-query.test.tsx verify:testExists(registry/ouro/lib/ouro/use-media-query.test.tsx::useMediaQuery > calls matchMedia once for a query, however many components read it and however often they render) verify:testExists(registry/ouro/lib/ouro/use-media-query.test.tsx::useMediaQuery > reads a matchMedia swapped in after the real one made a list for the same query, as a test's stub is)
 * @claim "Only a browser's own `MediaQueryList` is kept" registry/ouro/lib/ouro/use-media-query.test.tsx verify:testExists(registry/ouro/lib/ouro/use-media-query.test.tsx::useMediaQuery > asks a stub that answers with plain objects again on each read, so one that changes its answer is followed) verify:testExists(registry/ouro/lib/ouro/use-media-query.test.tsx::useMediaQuery > follows a spy on matchMedia that passed the browser's lists through and then changes its answer) verify:testExists(registry/ouro/lib/ouro/use-media-query.test.tsx::useMediaQuery > reads a mocked matchMedia where MediaQueryList is not defined, as in jsdom)
 */
const lists = new WeakMap<typeof matchMedia, Map<string, MediaQueryList>>();

function listFor(query: string): MediaQueryList {
  if ("mock" in matchMedia) return matchMedia(query);
  let byQuery = lists.get(matchMedia);
  if (byQuery === undefined) lists.set(matchMedia, (byQuery = new Map()));
  const kept = byQuery.get(query);
  if (kept !== undefined) return kept;
  const list = matchMedia(query);
  if (typeof MediaQueryList === "function" && list instanceof MediaQueryList) byQuery.set(query, list);
  return list;
}

/**
 * Subscribes to a CSS media query. Returns `serverDefault` during server
 * rendering and hydration, then the live value, so there is no hydration
 * mismatch. Where `matchMedia` does not exist (for example jsdom), it always
 * returns `serverDefault`. Every component that reads the same query shares one
 * `MediaQueryList`, so a render reads a value and makes no new list.
 *
 * @example
 * const isWide = useMediaQuery("(min-width: 640px)", true);
 * @claim "Returns `serverDefault` during server rendering and" registry/ouro/lib/ouro/use-media-query.test.tsx verify:testExists(registry/ouro/lib/ouro/use-media-query.test.tsx::useMediaQuery > returns serverDefault from renderToString, whatever the viewport)
 * @claim "Returns `serverDefault` during server rendering and" registry/ouro/lib/ouro/use-media-query.test.tsx verify:testExists(registry/ouro/lib/ouro/use-media-query.test.tsx::useMediaQuery > returns the live value on the client and follows viewport changes)
 * @claim "Where `matchMedia` does not exist (for" registry/ouro/lib/ouro/use-media-query.test.tsx verify:testExists(registry/ouro/lib/ouro/use-media-query.test.tsx::useMediaQuery > falls back to serverDefault where matchMedia is missing)
 * @claim "Every component that reads the same query shares one" registry/ouro/lib/ouro/use-media-query.test.tsx verify:testExists(registry/ouro/lib/ouro/use-media-query.test.tsx::useMediaQuery > calls matchMedia once for a query, however many components read it and however often they render)
 */
export function useMediaQuery(query: string, serverDefault: boolean): boolean {
  const subscribe = useCallback(
    (onChange: () => void) => {
      if (typeof matchMedia !== "function") return () => {};
      const list = listFor(query);
      list.addEventListener("change", onChange);
      return () => list.removeEventListener("change", onChange);
    },
    [query],
  );
  const getSnapshot = useCallback(() => (typeof matchMedia === "function" ? listFor(query).matches : serverDefault), [query, serverDefault]);
  return useSyncExternalStore(subscribe, getSnapshot, () => serverDefault);
}
