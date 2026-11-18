"use client";

import { useCallback, useSyncExternalStore } from "react";

/**
 * The list for each query, kept by the `matchMedia` that made it: a list's `matches` is live, so one per query serves every
 * reader and every render, and a `matchMedia` swapped in (a test's stub) makes lists of its own.
 * @claim "The list for each query, kept by" registry/ouro/lib/ouro/use-media-query.test.tsx verify:testExists(registry/ouro/lib/ouro/use-media-query.test.tsx::useMediaQuery > calls matchMedia once for a query, however many components read it and however often they render) verify:testExists(registry/ouro/lib/ouro/use-media-query.test.tsx::useMediaQuery > reads a matchMedia swapped in after the real one made a list for the same query, as a test's stub is)
 */
const lists = new WeakMap<typeof matchMedia, Map<string, MediaQueryList>>();

function listFor(query: string): MediaQueryList {
  let byQuery = lists.get(matchMedia);
  if (byQuery === undefined) lists.set(matchMedia, (byQuery = new Map()));
  let list = byQuery.get(query);
  if (list === undefined) byQuery.set(query, (list = matchMedia(query)));
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
