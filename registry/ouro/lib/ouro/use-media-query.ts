"use client";

import { useCallback, useSyncExternalStore } from "react";

/**
 * The list for each query, made at most once a task: every component that reads a query in one render, or in one long task of
 * renders (a scroll that draws rows), shares one. The lists go once the task's work is done, so the next task asks `matchMedia`
 * again: WebKit's list made earlier reports a change of the media (a window resized, reduced motion turned on) only once it next
 * draws, and a new one at once. A change the list reports drops it at once, in whatever task it comes.
 * @claim "A change the list reports drops it at once" registry/ouro/lib/ouro/use-media-query.test.tsx verify:testExists(registry/ouro/lib/ouro/use-media-query.test.tsx::useMediaQuery > reads the answer a change reports in the task a render read the query in, as a stub that calls its listeners does)
 * @claim "The list for each query, made at most once a task" registry/ouro/lib/ouro/use-media-query.test.tsx verify:testExists(registry/ouro/lib/ouro/use-media-query.test.tsx::useMediaQuery > calls matchMedia once for a query in a render, however many components read it)
 * @claim "The lists go once the task's work is done" registry/ouro/lib/ouro/use-media-query.test.tsx verify:testExists(registry/ouro/lib/ouro/use-media-query.test.tsx::useMediaQuery > reads a change of the media in the next task, before the browser has drawn a frame, as WebKit's lists made earlier do not)
 */
let lists: Map<string, MediaQueryList> | null = null;

function listFor(query: string): MediaQueryList {
  if (lists === null) {
    lists = new Map();
    queueMicrotask(() => (lists = null));
  }
  let list = lists.get(query);
  if (list === undefined) lists.set(query, (list = matchMedia(query)));
  return list;
}

/**
 * Subscribes to a CSS media query. Returns `serverDefault` during server
 * rendering and hydration, then the live value, so there is no hydration
 * mismatch. Where `matchMedia` does not exist (for example jsdom), it always
 * returns `serverDefault`. The components that read a query in one render share one
 * `MediaQueryList`, so a render asks `matchMedia` once a query, however many read it.
 *
 * @example
 * const isWide = useMediaQuery("(min-width: 640px)", true);
 * @claim "Returns `serverDefault` during server rendering and" registry/ouro/lib/ouro/use-media-query.test.tsx verify:testExists(registry/ouro/lib/ouro/use-media-query.test.tsx::useMediaQuery > returns serverDefault from renderToString, whatever the viewport)
 * @claim "Returns `serverDefault` during server rendering and" registry/ouro/lib/ouro/use-media-query.test.tsx verify:testExists(registry/ouro/lib/ouro/use-media-query.test.tsx::useMediaQuery > returns the live value on the client and follows viewport changes)
 * @claim "Where `matchMedia` does not exist (for" registry/ouro/lib/ouro/use-media-query.test.tsx verify:testExists(registry/ouro/lib/ouro/use-media-query.test.tsx::useMediaQuery > falls back to serverDefault where matchMedia is missing)
 * @claim "The components that read a query in one render share one" registry/ouro/lib/ouro/use-media-query.test.tsx verify:testExists(registry/ouro/lib/ouro/use-media-query.test.tsx::useMediaQuery > calls matchMedia once for a query in a render, however many components read it)
 */
export function useMediaQuery(query: string, serverDefault: boolean): boolean {
  const subscribe = useCallback(
    (onChange: () => void) => {
      if (typeof matchMedia !== "function") return () => {};
      const list = listFor(query);
      // A change drops the list kept for this task, so the read that follows asks `matchMedia` for the new answer.
      const changed = () => {
        lists?.delete(query);
        onChange();
      };
      list.addEventListener("change", changed);
      return () => list.removeEventListener("change", changed);
    },
    [query],
  );
  const getSnapshot = useCallback(() => (typeof matchMedia === "function" ? listFor(query).matches : serverDefault), [query, serverDefault]);
  return useSyncExternalStore(subscribe, getSnapshot, () => serverDefault);
}
