import { useCallback, useSyncExternalStore } from "react";

/**
 * Subscribes to a CSS media query. Returns `serverDefault` during server
 * rendering and hydration, then the live value, so there is no hydration
 * mismatch.
 *
 * @example
 * const isWide = useMediaQuery("(min-width: 640px)", true);
 */
export function useMediaQuery(query: string, serverDefault: boolean): boolean {
  const subscribe = useCallback(
    (onChange: () => void) => {
      const list = matchMedia(query);
      list.addEventListener("change", onChange);
      return () => list.removeEventListener("change", onChange);
    },
    [query],
  );
  const getSnapshot = useCallback(() => matchMedia(query).matches, [query]);
  return useSyncExternalStore(subscribe, getSnapshot, () => serverDefault);
}
