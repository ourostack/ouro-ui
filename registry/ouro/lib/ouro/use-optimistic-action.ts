"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/** What {@link useOptimisticAction} returns. */
export interface OptimisticAction<T> {
  /** The state to draw: `base` with the changes that are still waiting for their answers applied, oldest first. */
  value: T;
  /** Whether any change is waiting for its answer. */
  pending: boolean;
  /** Why the latest refused change was undone, in words for the person; `undefined` until one is refused, and again after the next change. */
  reason: string | undefined;
  /**
   * Shows `apply` at once and runs `commit`; resolves `true` when `commit` settles, or `false` when it
   * rejects, after the change is undone and `reason` is set. Never rejects.
   */
  run: (apply: (current: T) => T, commit: () => Promise<unknown>) => Promise<boolean>;
}

/** Options for {@link useOptimisticAction}. */
export interface OptimisticActionOptions {
  /** Turns a refusal into the words the person reads. @default the error's `message`, else "That didn't go through" */
  describe?: ((error: unknown) => string) | undefined;
}

/**
 * Shows a change the moment it is made, undoes it and says why if the server refuses it, and tells
 * the page what is still pending. `base` is the server's state, which the app fetches and stores; a
 * change stays applied over it until its `commit` settles, so update `base` before `commit`
 * resolves. A refused change is taken out and the rest stay, so a slow commit never blocks the next
 * press, and quick changes to one item settle in the order they were made. `commit` is a plain
 * function that returns a promise, so any data layer fits.
 *
 * Use `ReactionBar`'s `optimistic` prop instead when the change is a reaction. Use React's
 * `useOptimistic` instead when the app needs no reason and no pending state to read.
 *
 * @group Feedback
 * @see https://ui.ouroboros.bot/docs/reaction-bar
 *
 * @example
 * const { value, pending, reason, run } = useOptimisticAction(liked);
 * <Button pressed={value} data-ouro-pending={pending ? "" : undefined} onClick={() => run((on) => !on, () => api.like(id))}>Like</Button>
 * @claim "undoes it and says why if" registry/ouro/lib/ouro/use-optimistic-action.test.tsx verify:testExists(registry/ouro/lib/ouro/use-optimistic-action.test.tsx::useOptimisticAction > undoes a refused change and says why, leaving the others in place)
 * @claim "a slow commit never blocks the next" registry/ouro/lib/ouro/use-optimistic-action.test.tsx verify:testExists(registry/ouro/lib/ouro/use-optimistic-action.test.tsx::useOptimisticAction > shows a change at once and stays pending without blocking the next)
 * @claim "quick changes to one item settle in" registry/ouro/lib/ouro/use-optimistic-action.test.tsx verify:testExists(registry/ouro/lib/ouro/use-optimistic-action.test.tsx::useOptimisticAction > applies quick changes in the order they were made)
 */
export function useOptimisticAction<T>(base: T, options: OptimisticActionOptions = {}): OptimisticAction<T> {
  const [changes, setChanges] = useState<readonly { id: number; apply: (current: T) => T }[]>([]);
  const [reason, setReason] = useState<string | undefined>(undefined);
  const next = useRef(0);
  const describe = useRef(options.describe);
  useEffect(() => {
    describe.current = options.describe;
  });

  const run = useCallback(
    (apply: (current: T) => T, commit: () => Promise<unknown>) => {
      // Stryker disable next-line UpdateOperator: counting down gives ids just as unique, and only uniqueness is read
      const id = next.current++;
      setReason(undefined);
      setChanges((current) => [...current, { id, apply }]);
      const settle = () => setChanges((current) => current.filter((change) => change.id !== id));
      let attempt: Promise<unknown>;
      try {
        attempt = Promise.resolve(commit());
      } catch (error) {
        attempt = Promise.reject(error);
      }
      return attempt.then(
        () => {
          settle();
          return true;
        },
        (error: unknown) => {
          settle();
          setReason(describe.current ? describe.current(error) : error instanceof Error && error.message ? error.message : "That didn't go through");
          return false;
        },
      );
    },
    // Stryker disable next-line ArrayDeclaration: the dependency list is empty or a constant; either way run keeps one identity
    [],
  );

  return { value: changes.reduce((current, change) => change.apply(current), base), pending: changes.length > 0, reason, run };
}
