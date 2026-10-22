import { useCallback, useLayoutEffect, useRef } from "react";

/** A handler whose identity never changes but which always runs the latest render's code. */
export function useStable<Args extends unknown[]>(handler: (...args: Args) => void): (...args: Args) => void {
  const latest = useRef(handler);
  useLayoutEffect(() => {
    latest.current = handler;
  });
  return useCallback((...args: Args) => latest.current(...args), []);
}
