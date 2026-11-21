"use client";

import { useCallback, useMemo } from "react";
import { flushSync } from "react-dom";
import { useReducedMotion } from "@/registry/ouro/lib/ouro/use-reduced-motion";

/** What a navigation does to the page: it may return a promise that settles once the new view is in the document. */
export type ViewSwap = () => void | Promise<void>;

/** What {@link useViewTransition} returns. */
export interface ViewTransitionControls {
  /** Whether a navigation may animate: `false` under reduced motion, from the device or `<OuroProvider motion="reduced">`. Pass it to a router's own `viewTransition` prop. */
  enabled: boolean;
  /** Runs `swap` inside a view transition where the browser has them and motion is not reduced; otherwise runs it at once. Resolves when the new view is in the document, not when the animation ends. */
  run: (swap: ViewSwap) => Promise<void>;
}

type StartViewTransition = (update: () => void | Promise<void>) => { updateCallbackDone: Promise<void>; ready: Promise<void>; finished: Promise<void> };

/**
 * Runs a navigation as a same-document view transition, for a router adapter to call. It uses
 * the browser's `document.startViewTransition` where there is one and motion is not reduced,
 * under `<OuroProvider motion="reduced">` or the device's setting, and swaps the view at
 * once everywhere else. A transition moves no focus and changes no title: the swap does both,
 * as it does without one, so the focus and the announced title are the same either way.
 *
 * Only the element that moves between views (the opened row's avatar or title) takes a
 * `view-transition-name`, since a name repeated across rows makes the browser skip the transition.
 * Keep a transition short, because a press during one lands on its overlay.
 *
 * Ouro UI takes no router, so you give `run` the swap: a router's `navigate`, or a state update,
 * which `run` flushes inside the transition. Where a router has its own `viewTransition` prop,
 * pass it `enabled`. The browser runs the back and forward buttons' swap itself, so only
 * navigations you start go through `run`. Import it only where a navigation needs it.
 *
 * Use it instead of calling `document.startViewTransition` yourself, which ignores
 * `<OuroProvider motion>` and the device's reduced-motion setting.
 *
 * @group App setup
 * @example
 * // React Router. app/components/ouro-router-link.tsx:
 * import type { ComponentProps } from "react";
 * import { Link } from "react-router";
 * import type { OuroLinkComponent } from "@/lib/ouro/use-ouro";
 * import { useViewTransition } from "@/lib/ouro/use-view-transition";
 *
 * export function OuroRouterLink({ href, ...props }: ComponentProps<OuroLinkComponent>) {
 *   const { enabled } = useViewTransition();
 *   return <Link to={href} viewTransition={enabled} {...props} />;
 * }
 *
 * // Any router, from code:
 * const { run } = useViewTransition();
 * await run(() => navigate("/recipes/42"));
 * @claim "Ouro UI takes no router, so you" registry/ouro/lib/ouro/use-view-transition.test.tsx verify:testExists(registry/ouro/lib/ouro/use-view-transition.test.tsx::useViewTransition > runs the swap inside the browser's transition, once, and resolves when the new view is in)
 * @claim "swaps the view at once everywhere else" registry/ouro/lib/ouro/use-view-transition.test.tsx verify:testExists(registry/ouro/lib/ouro/use-view-transition.test.tsx::useViewTransition > swaps at once, with no transition, where the browser has none or motion is reduced)
 * @claim "so the focus and the announced title are the same either way" registry/ouro/lib/ouro/use-view-transition.test.tsx verify:testExists(registry/ouro/lib/ouro/use-view-transition.test.tsx::useViewTransition > leaves the same focus and the same title with a transition, without one and under reduced motion)
 */
export function useViewTransition(): ViewTransitionControls {
  const reduced = useReducedMotion();
  const run = useCallback(
    (swap: ViewSwap): Promise<void> => {
      const start = (document as Document & { startViewTransition?: StartViewTransition }).startViewTransition;
      if (reduced || typeof start !== "function") return Promise.resolve(swap());
      const transition = start.call(document, () => {
        let result: void | Promise<void> = undefined;
        flushSync(() => {
          result = swap();
        });
        return result;
      });
      // A skipped or interrupted transition rejects these; the swap still ran, so there is nothing to report.
      transition.ready.catch(() => {});
      transition.finished.catch(() => {});
      return transition.updateCallbackDone;
    },
    [reduced],
  );
  return useMemo(() => ({ enabled: !reduced, run }), [reduced, run]);
}
