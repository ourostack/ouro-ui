"use client";

import { ScrollArea as BaseScrollArea } from "@base-ui/react/scroll-area";
import type { HTMLAttributes, JSX, ReactNode, Ref } from "react";
import { useAppearanceClassNameCheck } from "@/registry/ouro/lib/ouro/class-name-check";
import { cn } from "@/registry/ouro/lib/ouro/cn";
import { useDevWarnings } from "@/registry/ouro/lib/ouro/use-dev-warnings";

/** Which way a ScrollArea scrolls. */
export type ScrollAreaOrientation = "vertical" | "horizontal" | "both";

/** The props ScrollArea adds to the div attributes it passes through. */
export interface ScrollAreaOwnProps {
  /** The content that scrolls. */
  children: ReactNode;
  /**
   * Which way the content scrolls. `horizontal` keeps a row of tags or cards on one line.
   * @default "vertical"
   */
  orientation?: ScrollAreaOrientation | (string & { 'Use "vertical", "horizontal" or "both"': never }) | undefined;
  /**
   * Names the scrolling region for screen readers ("Method", "Order history"). A keyboard
   * user can focus the region to scroll it, so give it a name when nothing else inside can
   * take focus.
   */
  label?: string | undefined;
  /**
   * Layout: the area's height or maximum height, which it scrolls inside (`h-72`,
   * `max-h-80`), and its width and margins. Appearance classes warn in development.
   */
  className?: string | undefined;
  ref?: Ref<HTMLDivElement> | undefined;

  /** Not a prop. The scrollbar shows while the pointer is over the area or it scrolls, on every device. */
  type?: { "Use <ScrollArea>; the scrollbar shows on hover and scroll": never };
  /** Not a prop. Set the height with a class: `<ScrollArea className="max-h-80">`. */
  maxHeight?: { 'Use <ScrollArea className="max-h-80">': never };
  /** Not a prop. Set the height with a class: `<ScrollArea className="h-72">`. */
  height?: { 'Use <ScrollArea className="h-72">': never };
}

/** Props for {@link ScrollArea}: its own props and the div attributes it passes through to the root. */
export type ScrollAreaProps = Omit<HTMLAttributes<HTMLDivElement>, keyof ScrollAreaOwnProps> & ScrollAreaOwnProps;

const orientations = ["vertical", "horizontal", "both"] as const;

// The custom scrollbar is for a mouse: it fades in on hover, scroll or keyboard focus. On a
// coarse pointer it lets touches through to the native scroll container under it, so a
// finger anywhere pans the content with the platform's momentum, and it is a thin indicator.
const scrollbar =
  "flex p-0.5 opacity-0 transition-opacity duration-(--ouro-duration-base) " +
  "data-hovering:opacity-100 data-scrolling:opacity-100 data-scrolling:duration-0 group-has-[[data-scroll-viewport]:focus-visible]/scroll-area:opacity-100 " +
  "pointer-coarse:pointer-events-none";
const scrollbars = {
  vertical: "w-2.5 pointer-coarse:w-1.5",
  horizontal: "h-2.5 flex-col pointer-coarse:h-1.5",
} as const;

/**
 * A scrolling region with a slim scrollbar that matches the theme, inside a height you set.
 * It keeps the browser's own scrolling, so touch, the mouse wheel, the keyboard and
 * momentum all work; the custom scrollbar is for a mouse and never takes a touch.
 *
 * Use plain page scrolling instead for a page's main content, and `Dialog` or `Sheet`,
 * which scroll their own bodies, for long content in an overlay.
 *
 * @group Layout
 * @see https://ourostack.github.io/ouro-ui/docs/scroll-area
 *
 * @example
 * <ScrollArea className="h-72" label="Method">
 *   {steps.map((step) => <Text key={step.id}>{step.text}</Text>)}
 * </ScrollArea>
 * <ScrollArea orientation="horizontal">
 *   <Row gap="sm">{tags.map((tag) => <Badge key={tag}>{tag}</Badge>)}</Row>
 * </ScrollArea>
 */
export function ScrollArea(props: ScrollAreaProps): JSX.Element {
  const { children, orientation: orientationProp = "vertical", label, className, type, maxHeight, height, ...rest } = props;
  const orientation = (orientations as readonly string[]).includes(orientationProp) ? (orientationProp as ScrollAreaOrientation) : "vertical";
  useAppearanceClassNameCheck(
    "ScrollArea",
    className,
    process.env.NODE_ENV !== "production" ? "put the ScrollArea inside a <Card> for a frame" : /* istanbul ignore next @preserve -- production only */ "",
  );
  useDevWarnings(
    "ScrollArea",
    process.env.NODE_ENV !== "production"
      ? () => [
          orientation !== orientationProp && [
            `orientation="${String(orientationProp)}" is not an orientation; use "vertical", "horizontal", "both"`,
            `<ScrollArea orientation="${String(orientationProp).toLowerCase().startsWith("x") ? "horizontal" : "vertical"}">`,
          ],
          type !== undefined && ["type is not a prop; the scrollbar shows while you hover or scroll", "<ScrollArea>"],
          maxHeight !== undefined && ["maxHeight is not a prop", '<ScrollArea className="max-h-80">'],
          height !== undefined && ["height is not a prop", '<ScrollArea className="h-72">'],
        ]
      : /* istanbul ignore next @preserve -- production only */ undefined,
  );
  return (
    <BaseScrollArea.Root {...rest} data-ouro="scroll-area" className={cn("group/scroll-area relative flex min-h-0 min-w-0 flex-col overflow-hidden", className)}>
      <BaseScrollArea.Viewport
        data-scroll-viewport=""
        role={label ? "region" : undefined}
        aria-label={label}
        className="min-h-0 flex-1 overscroll-contain rounded-[inherit] outline-ring -outline-offset-2 focus-visible:outline-2 focus-visible:outline-solid"
      >
        <BaseScrollArea.Content>{children}</BaseScrollArea.Content>
      </BaseScrollArea.Viewport>
      {orientation !== "horizontal" && (
        <BaseScrollArea.Scrollbar orientation="vertical" className={cn(scrollbar, scrollbars.vertical)}>
          <BaseScrollArea.Thumb className="w-full rounded-full bg-muted-foreground/40" />
        </BaseScrollArea.Scrollbar>
      )}
      {orientation !== "vertical" && (
        <BaseScrollArea.Scrollbar orientation="horizontal" className={cn(scrollbar, scrollbars.horizontal)}>
          <BaseScrollArea.Thumb className="h-full rounded-full bg-muted-foreground/40" />
        </BaseScrollArea.Scrollbar>
      )}
      {orientation === "both" && <BaseScrollArea.Corner />}
    </BaseScrollArea.Root>
  );
}
