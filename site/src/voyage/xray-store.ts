import { useSyncExternalStore } from "react";

/**
 * Whether X-ray (HX Inspector) is on. Kept outside React so that turning it on re-renders only what
 * reads it, the header's Switch and the Inspector, and not the page around them.
 */
let on = false;
const listeners = new Set<() => void>();

function subscribe(onChange: () => void): () => void {
  listeners.add(onChange);
  return () => listeners.delete(onChange);
}

export function setXray(next: boolean): void {
  if (next === on) return;
  on = next;
  for (const listener of listeners) listener();
}

export const openXray = (): void => setXray(true);

export function useXray(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => on,
    () => false,
  );
}
