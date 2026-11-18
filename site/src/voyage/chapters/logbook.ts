import { useSyncExternalStore } from "react";
import { afterPaint } from "../after-paint";

/**
 * What the reader did on this voyage, kept for the chapters after: Chapter I writes the launch and
 * your name, Chapter II the course and the finds, and Chapter III's log and the radio read them.
 * Each chapter is its own island, and they share this module (with frame.tsx), so it is one store
 * for the page. Each island may hydrate before or after another writes, so a reader subscribes
 * (useLogbook) and shows what was written whenever it comes. Nothing is saved: a new page load
 * starts a new voyage. The server always reads the empty log, so the HTML never claims a voyage.
 */
export interface Logbook {
  /** The days she took to build, once she is launched; null while she is on the slip. */
  launched: number | null;
  /** Who signed on, and as what; null before, and once they leave the crew. */
  you: { name: string; trade: string } | null;
  /** The course, once the reader has planned it (moved a port or picked the day), with its figures as Chapter II writes them. */
  course: { day: string; leagues: string; way: "shortest" | "book" | "own" } | null;
  /** How many new finds the reader has sorted. */
  sorted: number;
}

const EMPTY: Logbook = { launched: null, you: null, course: null, sorted: 0 };

let state = EMPTY;
const listeners = new Set<() => void>();

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => void listeners.delete(listener);
};

/**
 * Writes to the log once the press that changed it has painted (afterPaint), so another chapter's
 * answer never holds up the press. Returns the cancel, so an effect can hand it back as its cleanup.
 */
export function writeLog(next: Partial<Logbook>): () => void {
  return afterPaint(() => {
    state = { ...state, ...next };
    for (const listener of listeners) listener();
  });
}

/** Reads one part of the log, and renders again only when that part changes. */
export function useLogbook<T>(pick: (log: Logbook) => T): T {
  return useSyncExternalStore(
    subscribe,
    () => pick(state),
    () => pick(EMPTY),
  );
}

/** The name the crew calls you by: the first word of the one you signed. */
export const firstName = (name: string): string => name.trim().split(/\s+/)[0]!;
