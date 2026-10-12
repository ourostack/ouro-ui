"use client";

import { Progress as BaseProgress } from "@base-ui/react/progress";
import { useId, type JSX, type Ref } from "react";
import { toneFor } from "@/registry/ouro/lib/ouro/appearance-hints";
import { useAppearanceClassNameCheck } from "@/registry/ouro/lib/ouro/class-name-check";
import { cn } from "@/registry/ouro/lib/ouro/cn";
import { toneWarning } from "@/registry/ouro/lib/ouro/tones";
import { useDevWarnings } from "@/registry/ouro/lib/ouro/use-dev-warnings";

/** Props for {@link Progress}. */
export interface ProgressProps {
  /**
   * How far along the work is, from `min` to `max`. `null` while you don't know: the bar
   * is indeterminate and slides instead of filling.
   */
  value: number | null;
  /** What is in progress: "Uploading photos". It names the bar for screen readers. */
  label: string;
  /** Hides the label visually; screen readers still use it. */
  hideLabel?: boolean | undefined;
  /** Shows the value beside the label, as a percentage unless `format` says otherwise. */
  showValue?: boolean | undefined;
  /** The value at the start of the bar. @default 0 */
  min?: number | undefined;
  /** The value at the end of the bar, when the work is done. @default 100 */
  max?: number | undefined;
  /**
   * What screen readers say for the value while it is `null`, that the work is under way.
   * Translate it with the rest of your interface.
   * @default "Loading"
   */
  indeterminateText?: string | undefined;
  /** How the value is written, for `showValue` and screen readers: `{ style: "unit", unit: "megabyte" }`. */
  format?: Intl.NumberFormatOptions | undefined;
  /**
   * Color role from the theme for the filled part, named after its token. `secondary` is
   * the muted foreground.
   * @default "primary"
   */
  tone?:
    | "primary"
    | "secondary"
    | "destructive"
    | "success"
    | "warning"
    | (string & { 'danger is "destructive"; accent is "primary"; neutral is "secondary"': never })
    | undefined;
  /** Layout only: margins, width, grid placement (`mt-4`, `max-w-sm`). Appearance classes warn in development; use `tone`. */
  className?: string | undefined;
  /** The progress bar's id, for `aria-describedby` or `aria-controls` elsewhere on the page. */
  id?: string | undefined;
  ref?: Ref<HTMLDivElement> | undefined;

  /** Not a prop. An unknown value is `null`: `<Progress value={null}>`. */
  indeterminate?: { 'Use <Progress value={null}>': never };
  /** Not a prop. An unknown value is `null`: `<Progress value={null}>`. */
  isIndeterminate?: { 'Use <Progress value={null}>': never };
  /** Not a prop. A number `value` is determinate, `null` indeterminate. */
  variant?: { 'Use <Progress value={40}>, or value={null} while unknown': never };
  /** Not a prop. Ouro UI uses `tone`: `<Progress tone="success">`. */
  color?: { 'Use <Progress tone="success">': never };
}

// Class strings are literal so the app's Tailwind finds them when it compiles.
const tones = {
  primary: "bg-primary",
  secondary: "bg-muted-foreground",
  destructive: "bg-destructive",
  success: "bg-success",
  warning: "bg-warning",
} as const;

// Determinate, Base UI sets the width and the bar eases to it. Indeterminate, a third of the
// track slides across; with reduced motion the whole track pulses instead.
const indicatorClass =
  "absolute inset-y-0 start-0 h-full rounded-full transition-[width] duration-(--ouro-duration-slow) ease-out motion-reduce:transition-none " +
  "data-indeterminate:w-1/3 data-indeterminate:animate-[ouro-progress_1.4s_ease-in-out_infinite] " +
  "motion-reduce:data-indeterminate:w-full motion-reduce:data-indeterminate:animate-[ouro-pulse_1.6s_ease-in-out_infinite]";

/**
 * A bar that shows how far along a task is, or that it is under way when you can't tell.
 * It is a labeled `progressbar`, so screen readers hear the label and the value.
 *
 * Use `Spinner` instead for a short wait with no measurable progress, and `Skeleton` to
 * hold the place of content that is loading.
 *
 * @group Feedback
 * @see https://ourostack.github.io/ouro-ui/docs/progress
 *
 * @example
 * <Progress label="Uploading photos" value={40} showValue />
 * <Progress label="Importing recipes" value={null} />
 */
export function Progress(props: ProgressProps): JSX.Element {
  const {
    value,
    label,
    hideLabel,
    showValue,
    min,
    max,
    format,
    indeterminateText = "Loading",
    tone: toneProp = "primary",
    className,
    id,
    ref,
    // Guard props (hint types), dropped here so they never reach the DOM.
    indeterminate,
    isIndeterminate,
    variant,
    color,
  } = props;
  const tone = Object.hasOwn(tones, toneProp) ? (toneProp as keyof typeof tones) : "primary";
  // Base UI links the label in an effect, after the first render; an id of our own puts
  // aria-labelledby in the server HTML too.
  const labelId = `${useId()}-label`;
  useAppearanceClassNameCheck(
    "Progress",
    className,
    process.env.NODE_ENV !== "production" ? (token: string) => `tone="${toneFor(token)}"` : /* istanbul ignore next @preserve -- production only */ "",
  );
  useDevWarnings(
    "Progress",
    process.env.NODE_ENV !== "production"
      ? () => [
          tone !== toneProp && toneWarning("Progress", String(toneProp), Object.keys(tones)),
          indeterminate !== undefined && ["indeterminate is not a prop", "<Progress value={null}>"],
          isIndeterminate !== undefined && ["isIndeterminate is not a prop", "<Progress value={null}>"],
          variant !== undefined && [
            "variant is not a prop; a number value is determinate",
            "<Progress value={40}>, or value={null} while unknown",
          ],
          color !== undefined && ["color is not a prop", `<Progress tone="${toneFor(`bg-${String(color)}`)}">`],
        ]
      : /* istanbul ignore next @preserve -- production only */ undefined,
  );
  return (
    <BaseProgress.Root
      ref={ref}
      id={id}
      value={value}
      {...(min !== undefined && { min })}
      {...(max !== undefined && { max })}
      {...(format !== undefined && { format })}
      aria-labelledby={labelId}
      getAriaValueText={(formatted, current) => (current === null ? indeterminateText : formatted)}
      data-ouro="progress"
      className={cn("grid w-full gap-1.5", className)}
    >
      <div className={hideLabel ? "sr-only" : "flex items-baseline justify-between gap-3 text-sm"}>
        <BaseProgress.Label id={labelId} data-ouro-progress-label="" className="font-medium text-foreground">
          {label}
        </BaseProgress.Label>
        {showValue && value !== null && (
          <BaseProgress.Value data-ouro-progress-value="" className="text-muted-foreground tabular-nums" />
        )}
      </div>
      <BaseProgress.Track data-ouro-progress-track="" className="relative block h-2 w-full overflow-hidden rounded-full bg-secondary">
        <BaseProgress.Indicator data-ouro-progress-indicator="" className={cn(indicatorClass, tones[tone])} />
      </BaseProgress.Track>
    </BaseProgress.Root>
  );
}
