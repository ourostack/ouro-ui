import { Suspense, use, useEffect, type JSX, type ReactNode } from "react";

/**
 * Hydration in turns. React hydrates every Suspense boundary that a page leaves for later in one
 * pass, and commits them together; a commit can't be cut short, so on the home page the header,
 * the stage, the themes and the footer made one task long enough to hold up a tap on a slow phone
 * (Lighthouse's total blocking time). A `HydrateInTurn` boundary waits its turn instead: each one
 * hydrates after the one before it has committed and the browser has been idle, so each is a task
 * of its own. The server's HTML shows and reads the whole time. A press, a key or focus anywhere
 * ends the wait for every boundary, and the one it lands in hydrates in time to answer it, as React
 * hydrates any boundary someone reaches for.
 */

type Turn = Promise<void> & { status?: string; value?: undefined; release: () => void };

/** Only when the client hydrates the server's HTML (`hydratingServerHtml`); a client render never waits. */
let hydrating = false;
const turns = new Map<string, Turn>();
const committed = new Map<string, () => void>();
let previous: Promise<void> | undefined;

/** Called by the client entry before it hydrates the server's HTML, so boundaries wait their turn. */
export function hydratingServerHtml(): void {
  hydrating = true;
}

function idle(): Promise<void> {
  return new Promise((resolve) => {
    if (typeof requestIdleCallback === "function") requestIdleCallback(() => resolve(), { timeout: 500 });
    else setTimeout(resolve, 1);
  });
}

function releaseAll(): void {
  for (const turn of turns.values()) turn.release();
}

const REACHES = ["pointerdown", "mousedown", "touchstart", "keydown", "focusin", "click"] as const;

function turnFor(name: string): Turn {
  const existing = turns.get(name);
  if (existing) return existing;
  if (turns.size === 0) for (const type of REACHES) window.addEventListener(type, releaseAll, { capture: true, passive: true });
  let resolve!: () => void;
  const turn = new Promise<void>((done) => (resolve = done)) as Turn;
  // Fulfilled at once, not a microtask later, so React reads it as ready when it hydrates the
  // boundary a press lands in, inside that press's own event.
  turn.release = () => {
    if (turn.status === "fulfilled") return;
    turn.status = "fulfilled";
    turn.value = undefined;
    resolve();
  };
  const done = new Promise<void>((resolve) => committed.set(name, resolve));
  previous = (previous ?? Promise.resolve())
    .then(idle)
    .then(() => {
      turn.release();
      return done;
    });
  turns.set(name, turn);
  return turn;
}

function Gate({ name, children }: { name: string; children: ReactNode }): ReactNode {
  if (hydrating) use<void>(turnFor(name) as Promise<void>);
  return children;
}

function Committed({ name }: { name: string }): null {
  useEffect(() => committed.get(name)?.(), [name]);
  return null;
}

/** A Suspense boundary that hydrates in its turn (above). Each needs a name of its own. */
export function HydrateInTurn({ name, children }: { name: string; children: ReactNode }): JSX.Element {
  return (
    <Suspense>
      <Gate name={name}>{children}</Gate>
      <Committed name={name} />
    </Suspense>
  );
}

/** Resolves once every boundary waiting its turn has hydrated, and at once where none waits. */
export async function hydratedInTurn(): Promise<void> {
  if (!hydrating) return;
  // The boundaries join the queue as React reaches them, after the page's own first commit.
  await idle();
  while (previous) {
    const last = previous;
    await last;
    await idle();
    if (previous === last) return;
  }
}
