import { useEffect } from "react";

/**
 * The voyage pages' easter eggs: type "nemo" (outside a text field) and Captain Nemo sails by to
 * wave hello; scroll the Nautilus's story and a ship's log counts the leagues traveled, up to the
 * twenty thousand of the book's title. Only this file loads with the page; each egg's own code
 * and styles load when someone finds it.
 */
export const NEMO = "nemo";

/** Where typing is someone writing, not a word for an egg. */
const FIELD = "input, textarea, select, [contenteditable]:not([contenteditable='false']), [role='textbox'], [role='combobox'], [role='searchbox']";

/** Calls `onWord` each time `word` is typed, letter by letter, outside a field and without a modifier key. */
export function watchForWord(word: string, onWord: () => void): () => void {
  let typed = "";
  const onKey = (event: KeyboardEvent) => {
    if (event.ctrlKey || event.metaKey || event.altKey || event.key.length !== 1) return;
    if (event.target instanceof Element && event.target.closest(FIELD)) return;
    typed = (typed + event.key.toLowerCase()).slice(-word.length);
    if (typed !== word) return;
    typed = "";
    onWord();
  };
  addEventListener("keydown", onKey);
  return () => removeEventListener("keydown", onKey);
}

// Where the browser keeps no session storage (a private window may refuse it), found eggs are remembered until the page reloads.
const found = new Set<string>();

/** Whether this is the first time this visit someone finds an egg; it counts as found from now on. */
export function firstFind(egg: string): boolean {
  const key = `ouro-egg-${egg}`;
  try {
    if (sessionStorage.getItem(key) !== null) return false;
    sessionStorage.setItem(key, "1");
    return true;
  } catch {
    if (found.has(egg)) return false;
    found.add(egg);
    return true;
  }
}

/** Whether the theme sample's Dive (site/src/voyage/dive) is playing. */
export const diving = (): boolean => document.querySelector("[data-site-dive]") !== null;

/** Hides the eggs on a page: "nemo" on both voyage pages, and on the Nautilus's page the leagues log once the reader scrolls. */
export function useEggs(nautilus: boolean): void {
  useEffect(() => {
    let live = true;
    let stopLeagues = () => {};
    const stopNemo = watchForWord(NEMO, () => {
      // The theme sample's Dive has the sea to itself: Nemo comes when his name is typed again after it.
      if (diving()) return;
      if (firstFind(NEMO)) void import("./nemo").then(({ playNemo }) => live && playNemo());
    });
    const onScroll = () => {
      removeEventListener("scroll", onScroll);
      void import("./leagues").then(({ startLeagues }) => {
        if (live) stopLeagues = startLeagues();
      });
    };
    if (nautilus) addEventListener("scroll", onScroll, { passive: true });
    return () => {
      live = false;
      stopNemo();
      removeEventListener("scroll", onScroll);
      stopLeagues();
    };
  }, [nautilus]);
}
