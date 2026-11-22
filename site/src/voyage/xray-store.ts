import { useEffect, useSyncExternalStore } from "react";

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

/** Calls `onChange` with X-ray's state now and each time it changes, for code outside React; returns the unsubscribe. */
export function watchXray(onChange: (on: boolean) => void): () => void {
  onChange(on);
  return subscribe(() => onChange(on));
}

export const openXray = (): void => setXray(true);

export function useXray(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => on,
    () => false,
  );
}

/**
 * The component an address asks X-ray to point out, as its registry item: `?xray=TextField` and
 * `?xray=text-field` both name `text-field`. A bare `?xray` names none.
 */
export function spotlightFrom(search: string): string | undefined {
  const name = new URLSearchParams(search).get("xray")?.trim();
  if (!name) return undefined;
  return name.replace(/([a-z0-9])([A-Z])/g, "$1-$2").toLowerCase();
}

/** X-ray on at load when the address asks for it (`?xray`), as the home page's "X-ray it" link does. */
export function useXrayFromAddress(): void {
  useEffect(() => {
    if (new URLSearchParams(window.location.search).has("xray")) setXray(true);
  }, []);
}

/**
 * The component the address names for X-ray to point out (`?xray=Switch`), as each docs page's
 * links do, or `undefined`. The address stays put while the page is open, and the server has none.
 * Only X-ray reads it: a page that re-rendered with it as it hydrates would drop the server's HTML
 * of a chapter still waiting to hydrate.
 */
export function useSpotlight(): string | undefined {
  return useSyncExternalStore(
    noSubscription,
    () => spotlightFrom(window.location.search),
    () => undefined,
  );
}

const noSubscription = () => () => {};
