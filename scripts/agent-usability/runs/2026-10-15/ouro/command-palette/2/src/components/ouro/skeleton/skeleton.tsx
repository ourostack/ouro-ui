"use client";

import type { HTMLAttributes, JSX, Ref } from "react";
import { useAppearanceClassNameCheck } from "@/lib/ouro/class-name-check";
import { cn } from "@/lib/ouro/cn";
import { useDevWarnings } from "@/lib/ouro/use-dev-messages";

/** The props Skeleton adds to the `<div>` attributes it passes through. */
export interface SkeletonOwnProps {
  /**
   * The outline of what is loading: `rect` for a block such as an image or a card, `text`
   * for a line of text, `circle` for an avatar. Size it with layout classes:
   * `className="h-32"`, `className="w-1/2"`, `className="size-12"`.
   * @default "rect"
   */
  shape?: "rect" | "text" | "circle" | (string & { 'Use "rect", "text" or "circle"': never }) | undefined;
  /** Layout only: size, margins and placement (`h-32`, `w-1/2`, `size-12`). The color and corners come from the theme and `shape`. */
  className?: string | undefined;
  ref?: Ref<HTMLDivElement> | undefined;

  /** Not a prop. Ouro UI uses `shape`: `<Skeleton shape="circle">`. */
  variant?: { 'Use <Skeleton shape="circle">': never };
  /** Not a prop. Skeleton shimmers, and pulses instead with reduced motion. */
  animation?: { 'Not a prop: Skeleton shimmers, and pulses with reduced motion': never };
  /** Not a prop. Size it with a layout class: `<Skeleton className="w-32">`. */
  width?: { 'Use <Skeleton className="w-32">': never };
  /** Not a prop. Size it with a layout class: `<Skeleton className="h-6">`. */
  height?: { 'Use <Skeleton className="h-6">': never };
}

/** Props for {@link Skeleton}: its own props and the `<div>` attributes it passes through. */
export type SkeletonProps = Omit<HTMLAttributes<HTMLDivElement>, keyof SkeletonOwnProps | "children"> & SkeletonOwnProps;

// Class strings are literal so the app's Tailwind finds them when it compiles. A band a
// little toward the muted foreground sweeps across the muted surface, which reads in light
// and dark themes alike.
const base =
  "block bg-muted bg-[linear-gradient(90deg,transparent_25%,color-mix(in_oklab,var(--muted-foreground)_12%,transparent)_50%,transparent_75%)] " +
  "bg-size-[200%_100%] bg-no-repeat animate-[ouro-shimmer_1.6s_linear_infinite] motion-reduce:animate-[ouro-pulse_1.6s_ease-in-out_infinite] motion-reduce:bg-none";

const shapes = {
  rect: "h-4 w-full rounded-md",
  text: "h-[0.75em] w-full rounded-sm",
  circle: "aspect-square w-10 rounded-full",
} as const;

const muiVariants: Readonly<Record<string, keyof typeof shapes>> = { circular: "circle", text: "text", rectangular: "rect", rounded: "rect" };

function skeletonHint(token: string): string {
  if (token.startsWith("rounded")) return token === "rounded-full" ? 'shape="circle"' : 'shape="rect"';
  return "remove it; Skeleton takes its color from the theme's --muted";
}

/** The class for a guessed `width` or `height` value, for a development message. */
function sizeClass(prefix: "w" | "h", value: unknown): string {
  return `${prefix}-[${typeof value === "number" ? `${value}px` : String(value)}]`;
}

/**
 * A shimmering placeholder in the shape of content that is still loading. Screen readers
 * skip it, so mark the region that is loading with `aria-busy` while it shows. With reduced
 * motion it is a flat fill that pulses instead of shimmering.
 *
 * Use `Spinner` instead for a wait with no layout to hold, and `Progress` when you know how
 * far along the work is.
 *
 * @group Display
 * @see https://ourostack.github.io/ouro-ui/docs/skeleton
 *
 * @example
 * <div aria-busy="true" className="grid gap-2">
 *   <Skeleton shape="circle" />
 *   <Skeleton shape="text" className="w-1/2" />
 *   <Skeleton className="h-32" />
 * </div>
 */
export function Skeleton(props: SkeletonProps): JSX.Element {
  const { shape: shapeProp = "rect", className, variant, animation, width, height, ...rest } = props;
  // A shape that is not one of Ouro UI's (a type error) warns and renders the default.
  const shape = Object.hasOwn(shapes, shapeProp) ? (shapeProp as keyof typeof shapes) : "rect";
  useAppearanceClassNameCheck(
    "Skeleton",
    className,
    process.env.NODE_ENV !== "production" ? skeletonHint : /* istanbul ignore next @preserve -- production only */ "",
  );
  useDevWarnings(
    "Skeleton",
    process.env.NODE_ENV !== "production"
      ? () => [
          shape !== shapeProp && [`shape="${String(shapeProp)}" is not a shape; use "rect", "text", "circle"`, '<Skeleton shape="rect">'],
          variant !== undefined && [
            "variant is not a prop",
            `<Skeleton shape="${Object.hasOwn(muiVariants, String(variant)) ? muiVariants[String(variant)] : "rect"}">`,
          ],
          animation !== undefined && ["animation is not a prop; Skeleton shimmers, and pulses with reduced motion", "<Skeleton>"],
          width !== undefined && ["width is not a prop", `<Skeleton className="${sizeClass("w", width)}">`],
          height !== undefined && ["height is not a prop", `<Skeleton className="${sizeClass("h", height)}">`],
        ]
      : /* istanbul ignore next @preserve -- production only */ undefined,
  );
  return <div {...rest} aria-hidden="true" data-ouro="skeleton" data-shape={shape} className={cn(base, shapes[shape], className)} />;
}
