"use client";

import type { JSX, Ref } from "react";
import { useAppearanceClassNameCheck } from "@/registry/ouro/lib/ouro/class-name-check";
import { cn } from "@/registry/ouro/lib/ouro/cn";
import { useDevWarnings } from "@/registry/ouro/lib/ouro/use-dev-messages";

/** Props for {@link RouteProgress}. */
export interface RouteProgressProps {
  /**
   * Whether a navigation or a form submission is under way: in React Router,
   * `useNavigation().state !== "idle"`; in Next.js, the pending state of `useTransition`
   * around `router.push`.
   */
  active: boolean;
  /** What screen readers hear when a navigation starts. @default "Loading" */
  label?: string | undefined;
  /** Layout only: rarely needed, since the bar places itself at the top of the screen. Appearance classes warn in development. */
  className?: string | undefined;
  /** Reaches the root, the status region. */
  ref?: Ref<HTMLDivElement> | undefined;

  /** Not a prop. Ouro UI uses `active`: `<RouteProgress active={navigation.state !== "idle"} />`. */
  loading?: { 'Use <RouteProgress active={navigation.state !== "idle"} />': never };
  /** Not a prop. Ouro UI uses `active`: `<RouteProgress active={navigation.state !== "idle"} />`. */
  isLoading?: { 'Use <RouteProgress active={navigation.state !== "idle"} />': never };
  /** Not a prop. RouteProgress shows that something is loading, not how much; use `Progress` for a known amount. */
  value?: { 'RouteProgress has no amount; use <Progress value={50}> for a known one': never };
}

// Class strings are literal so the app's Tailwind finds them when it compiles.
const rootClass = "pointer-events-none fixed inset-x-0 top-0 z-(--ouro-layer) block h-0.5 print:hidden";
// The bar fades in and out; with reduced motion it fades faster and never sweeps.
const barClass =
  "group absolute inset-0 overflow-hidden transition-opacity duration-(--ouro-duration-base) ease-(--ouro-ease-out) data-closed:opacity-0 " +
  "motion-reduce:duration-(--ouro-duration-fast)";
// A third of the width sweeps across, as an indeterminate Progress does, and pauses while hidden. With reduced motion it is a still bar that pulses.
const sweepClass =
  "h-full w-1/3 bg-primary animate-[ouro-progress_1.4s_ease-in-out_infinite] group-data-closed:[animation-play-state:paused] " +
  "motion-reduce:w-full motion-reduce:animate-[ouro-pulse_1.6s_ease-in-out_infinite] forced-colors:bg-[CanvasText]";

const fix = '<RouteProgress active={navigation.state !== "idle"} />';

/**
 * The thin bar across the top of the screen while the app loads the next page or submits
 * a form, so a click that waits on the server never feels frozen: one global affordance
 * instead of a pending state on every action. A third of the bar sweeps across while
 * `active`, fades out when the navigation ends, and screen readers hear "Loading" once as
 * it starts. With reduced motion the bar stays still and pulses.
 *
 * Render it once, in the root layout, with your router's navigation state.
 *
 * Use `Progress` instead for a task whose amount is known, `Spinner` inside the control
 * that is busy, and `Button`'s `loading` for the one action a person just took.
 *
 * @group Feedback
 * @see https://ourostack.github.io/ouro-ui/docs/route-progress
 *
 * @example
 * // React Router, in the root route:
 * const navigation = useNavigation();
 * <RouteProgress active={navigation.state !== "idle"} />
 */
export function RouteProgress(props: RouteProgressProps): JSX.Element {
  const {
    active,
    label = "Loading",
    className,
    ref,
    // Guard props (hint types), dropped here so they never reach the DOM.
    loading,
    isLoading,
    value,
  } = props;
  useAppearanceClassNameCheck(
    "RouteProgress",
    className,
    process.env.NODE_ENV !== "production"
      ? (token: string) => `remove "${token}"; RouteProgress takes the theme's --primary color`
      : /* istanbul ignore next @preserve -- production only */ "",
  );
  useDevWarnings(
    "RouteProgress",
    process.env.NODE_ENV !== "production"
      ? () => [
          loading !== undefined && ["loading is not a prop", fix],
          isLoading !== undefined && ["isLoading is not a prop", fix],
          value !== undefined && ["RouteProgress has no amount", "<Progress value={50}>"],
          typeof active !== "boolean" && ["active is required; pass whether a navigation is under way", fix],
        ]
      : /* istanbul ignore next @preserve -- production only */ undefined,
  );
  return (
    // A status region that is always there, so screen readers hear the label when it appears in it.
    <div ref={ref} role="status" data-ouro="route-progress" className={cn(rootClass, className)}>
      <span className="sr-only">{active ? label : ""}</span>
      <div aria-hidden="true" data-ouro-part="bar" data-open={active ? "" : undefined} data-closed={active ? undefined : ""} className={barClass}>
        <div className={sweepClass} />
      </div>
    </div>
  );
}
