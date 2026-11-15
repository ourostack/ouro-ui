"use client";

import { type HTMLAttributes, type JSX, type ReactNode, type Ref, useEffect, useRef } from "react";
import { useAppearanceClassNameCheck } from "@/registry/ouro/lib/ouro/class-name-check";
import { cn } from "@/registry/ouro/lib/ouro/cn";
import { devWarn } from "@/registry/ouro/lib/ouro/dev";
import { scrollFadeClass, useScrollFade } from "@/registry/ouro/lib/ouro/scroll-fade";
import { useDevWarnings } from "@/registry/ouro/lib/ouro/use-dev-messages";

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
   * Keeps a scroll that reaches the area's end from scrolling the page behind it, for a
   * chat thread or a list inside a dialog. Off by default, so a finger that runs out of a
   * recipe's method keeps scrolling the page.
   * @default false
   */
  contain?: boolean | undefined;
  /**
   * Layout: the area's height or maximum height, which it scrolls inside (`h-72`,
   * `max-h-80`), and its width and margins. Appearance classes warn in development.
   */
  className?: string | undefined;
  ref?: Ref<HTMLDivElement> | undefined;

  /**
   * Not a prop. The scrollbar is the browser's own, thin and in the theme's color, on every device.
   */
  type?: { "Use <ScrollArea>; the scrollbar is the browser's own": never };
  /** Not a prop. Set the height with a class: `<ScrollArea className="max-h-80">`. */
  maxHeight?: { 'Use <ScrollArea className="max-h-80">': never };
  /** Not a prop. Set the height with a class: `<ScrollArea className="h-72">`. */
  height?: { 'Use <ScrollArea className="h-72">': never };
}

/** Props for {@link ScrollArea}: its own props and the div attributes it passes through to the root. */
export type ScrollAreaProps = Omit<HTMLAttributes<HTMLDivElement>, keyof ScrollAreaOwnProps> & ScrollAreaOwnProps;

const orientations = ["vertical", "horizontal", "both"] as const;

/**
 * The browser's own scrollbar, thin and in the theme's muted color, so nothing measures the page to draw one:
 * a custom scrollbar needs a layout read at mount. A mouse drags it, a finger pans past it and the keyboard scrolls the viewport.
 */
const scrollbar =
  "[scrollbar-width:thin] [scrollbar-color:color-mix(in_oklab,var(--muted-foreground)_40%,transparent)_transparent] " +
  "pointer-fine:hover:[scrollbar-color:color-mix(in_oklab,var(--muted-foreground)_60%,transparent)_transparent]";
const viewports = {
  vertical: "overflow-x-hidden overflow-y-auto",
  horizontal: "overflow-x-auto overflow-y-hidden",
  both: "overflow-auto",
} as const;

const focusable = "a[href],button,input,select,textarea,summary,[tabindex]:not([tabindex='-1']),[contenteditable='true']";

/**
 * Makes the viewport a tab stop while its content overflows, so a keyboard user can scroll it. Reads
 * sizes only when the browser reports a resize, after layout, never while React commits.
 */
function useScrollTabStop(viewportRef: { current: HTMLDivElement | null }): void {
  useEffect(() => {
    const viewport = viewportRef.current!;
    const update = () => {
      viewport.tabIndex = viewport.scrollHeight > viewport.clientHeight || viewport.scrollWidth > viewport.clientWidth ? 0 : -1;
    };
    const observer = new ResizeObserver(update);
    observer.observe(viewport);
    observer.observe(viewport.firstElementChild!);
    return () => observer.disconnect();
  }, [viewportRef]);
}

/**
 * Warns when the viewport takes keyboard focus to scroll (it is a tab stop once
 * the content overflows) but has no name and nothing inside that could take focus instead.
 * Development only.
 * @claim "Warns when the viewport takes keyboard" registry/ouro/components/ouro/scroll-area/scroll-area.test.tsx verify:testExists(registry/ouro/components/ouro/scroll-area/scroll-area.test.tsx::ScrollArea development messages > warns when the area takes keyboard focus to scroll but has no name)
 */
function useUnnamedRegionCheck(viewportRef: { current: HTMLDivElement | null }, label: string | undefined): void {
  const key = useRef({});
  useEffect(() => {
    /* istanbul ignore else @preserve -- the else path exists only in production bundles; scripts/dev-strip.test.mjs covers it */
    if (process.env.NODE_ENV !== "production") {
      const viewport = viewportRef.current;
      if (!viewport || label) return;
      const check = () => {
        if (viewport.tabIndex === 0 && !viewport.querySelector(focusable)) {
          devWarn("ScrollArea", "the area takes keyboard focus to scroll, and has no name", '<ScrollArea label="Method">', key.current);
        }
      };
      check();
      const observer = new MutationObserver(check);
      observer.observe(viewport, { attributes: true, attributeFilter: ["tabindex"] });
      return () => observer.disconnect();
    }
  }, [viewportRef, label]);
}

/**
 * A scrolling region with a thin scrollbar in the theme's color, inside a height you set.
 * It keeps the browser's own scrolling, so touch, the mouse wheel, the keyboard and
 * momentum all work; Content
 * wider than the area fades out at the side where it goes on, so at rest it reads as more
 * to scroll to, not as cut off.
 *
 * Use plain page scrolling instead for a page's main content, and `Dialog` or `Sheet`,
 * which scroll their own bodies, for long content in an overlay.
 *
 * @group Layout
 * @see https://ui.ouroboros.bot/docs/scroll-area
 *
 * @example
 * <ScrollArea className="h-72" label="Method">
 *   {steps.map((step) => <Text key={step.id}>{step.text}</Text>)}
 * </ScrollArea>
 * <ScrollArea orientation="horizontal" label="Tags">
 *   <Row gap="sm">{tags.map((tag) => <Badge key={tag}>{tag}</Badge>)}</Row>
 * </ScrollArea>
 * @claim "Content wider than the area fades out" registry/ouro/components/ouro/scroll-area/scroll-area.test.tsx verify:testExists(registry/ouro/components/ouro/scroll-area/scroll-area.test.tsx::ScrollArea > fades out at the side that hides more, drawing its focus ring over the fade, and keeps keyboard scrolling)
 * @claim "It keeps the browser's own scrolling" registry/ouro/components/ouro/scroll-area/scroll-area.touch.test.tsx verify:testExists(registry/ouro/components/ouro/scroll-area/scroll-area.touch.test.tsx::leaves touch scrolling to the browser: the viewport is a native scroll container)
 * @claim "It keeps the browser's own scrolling" registry/ouro/components/ouro/scroll-area/scroll-area.test.tsx verify:testExists(registry/ouro/components/ouro/scroll-area/scroll-area.test.tsx::ScrollArea > draws a thin native scrollbar in the theme's muted color, and scrolls only the way it is asked to)
 */
export function ScrollArea(props: ScrollAreaProps): JSX.Element {
  const { children, orientation: orientationProp = "vertical", label, contain, className, type, maxHeight, height, ...rest } = props;
  const viewportRef = useRef<HTMLDivElement>(null);
  useUnnamedRegionCheck(viewportRef, label);
  useScrollFade(viewportRef);
  useScrollTabStop(viewportRef);
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
          type !== undefined && ["type is not a prop; the scrollbar is the browser's own", "<ScrollArea>"],
          maxHeight !== undefined && ["maxHeight is not a prop", '<ScrollArea className="max-h-80">'],
          height !== undefined && ["height is not a prop", '<ScrollArea className="h-72">'],
        ]
      : /* istanbul ignore next @preserve -- production only */ undefined,
  );
  return (
    <div
      {...rest}
      data-ouro="scroll-area"
      className={cn(
        "group/scroll-area relative flex min-h-0 min-w-0 flex-col overflow-hidden",
        // The focus ring is the root's, drawn over the viewport, so the viewport's edge fade never hides it.
        "outline-ring -outline-offset-2 has-[>[data-scroll-viewport]:focus-visible]:outline-2 has-[>[data-scroll-viewport]:focus-visible]:outline-solid",
        className,
      )}
    >
      <div
        ref={viewportRef}
        data-scroll-viewport=""
        tabIndex={-1}
        data-ouro-control="scroll-area"
        data-ouro-part="viewport"
        role={label ? "region" : undefined}
        aria-label={label}
        className={cn("min-h-0 flex-1 rounded-[inherit] outline-none", viewports[orientation], scrollbar, scrollFadeClass, contain && "overscroll-contain")}
      >
        <div className={orientation === "vertical" ? "min-w-0" : "min-w-fit"}>{children}</div>
      </div>
    </div>
  );
}
