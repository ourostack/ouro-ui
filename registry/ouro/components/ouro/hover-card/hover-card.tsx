"use client";

import { PreviewCard } from "@base-ui/react/preview-card";
import { useEffect, useRef, type JSX, type ReactElement, type ReactNode } from "react";
import { useAppearanceClassNameCheck } from "@/registry/ouro/lib/ouro/class-name-check";
import { cn } from "@/registry/ouro/lib/ouro/cn";
import { devWarn } from "@/registry/ouro/lib/ouro/dev";
import {
  floatingAlign,
  floatingHint,
  floatingMotionClass,
  floatingPlacementWarnings,
  floatingPortalClass,
  floatingSide,
  floatingSurfaceClass,
  type FloatingAlign,
  type FloatingSide,
} from "@/registry/ouro/lib/ouro/floating";
import { lastInput } from "@/registry/ouro/lib/ouro/last-input";
import { useDevWarnings } from "@/registry/ouro/lib/ouro/use-dev-warnings";
import { useMediaQuery } from "@/registry/ouro/lib/ouro/use-media-query";

export type { FloatingAlign as HoverCardAlign, FloatingSide as HoverCardSide } from "@/registry/ouro/lib/ouro/floating";

/** Props for {@link HoverCard}. */
export interface HoverCardProps {
  /**
   * The link the card previews: `trigger={<Link href="/cooks/ari">Ari</Link>}`. It works
   * on its own: touch users, and devices that cannot hover, get only the link.
   */
  trigger: ReactElement;
  /** The preview: a few lines about where the link goes. Nothing the user needs, and no controls. */
  children: ReactNode;
  /** The side of the link the card sits on; it flips when there is no room. @default "bottom" */
  side?: FloatingSide | (string & { 'Use "top", "bottom", "left" or "right"': never }) | undefined;
  /** How the card lines up with the link along that side. @default "center" */
  align?: FloatingAlign | (string & { 'Use "start", "center" or "end": left is "start", right is "end"': never }) | undefined;
  /**
   * Layout only, applied to the card: width (`w-96`, 18rem by default) and padding. Your
   * classes win over Ouro UI's. Appearance classes warn in development.
   */
  className?: string | undefined;

  /** Not a prop. Ouro UI sets the delays: `<HoverCard trigger={…}>`. */
  openDelay?: { "Ouro UI sets the delays": never };
  /** Not a prop. Ouro UI sets the delays: `<HoverCard trigger={…}>`. */
  closeDelay?: { "Ouro UI sets the delays": never };
  /** Not a prop. The preview is the children: `<HoverCard trigger={…}>…</HoverCard>`. */
  content?: { "Use children: <HoverCard trigger={…}>…</HoverCard>": never };
  /** Not a prop. Ouro UI splits placement into `side` and `align`: `<HoverCard side="bottom" align="start">`. */
  placement?: { 'Use side="bottom" align="start"': never };
}

/**
 * A preview of where a link goes, shown when a mouse rests on the link or the keyboard
 * focuses it: a cook's profile, a recipe's summary. It shows only on devices that can
 * hover and never after a touch, so the link must work without it.
 *
 * Use `Tooltip` instead for a short label, and `Popover` for anything the user needs or
 * acts on, since a Popover opens on tap.
 *
 * It stacks above the page at `--ouro-layer`, a z-index of 50 by default (from
 * ouro-base.css), like Dialog and Sheet.
 *
 * @see https://ourostack.github.io/ouro-ui/docs/hover-card
 *
 * @example
 * <HoverCard trigger={<Link href="/cooks/ari">Ari Mendelow</Link>}>
 *   <CookSummary cook={ari} />
 * </HoverCard>
 */
export function HoverCard(props: HoverCardProps): JSX.Element {
  const {
    trigger,
    children,
    side: sideProp,
    align: alignProp,
    className,
    // Guard props (hint types), dropped here so they never reach the DOM.
    openDelay,
    closeDelay,
    content,
    placement,
  } = props;

  const side = floatingSide(sideProp, "bottom");
  const align = floatingAlign(alignProp);
  const key = useRef({});
  const triggerRef = useRef<HTMLAnchorElement>(null);
  // The server renders for a device that can hover; the client corrects it after.
  const canHover = useMediaQuery("(any-hover: hover)", true);

  useAppearanceClassNameCheck(
    "HoverCard",
    className,
    process.env.NODE_ENV !== "production"
      ? floatingHint("<HoverCard trigger={…}>", "</HoverCard>")
      : /* istanbul ignore next @preserve -- production only */ "",
  );
  useDevWarnings(
    "HoverCard",
    process.env.NODE_ENV !== "production"
      ? () => [
          ...floatingPlacementWarnings("<HoverCard", sideProp, "bottom", alignProp, placement),
          openDelay !== undefined && ["openDelay is not a prop; Ouro UI sets the delays", "<HoverCard trigger={…}>"],
          closeDelay !== undefined && ["closeDelay is not a prop; Ouro UI sets the delays", "<HoverCard trigger={…}>"],
          content !== undefined && ["content is not a prop; the preview is children", "<HoverCard trigger={…}>…</HoverCard>"],
        ]
      : /* istanbul ignore next @preserve -- production only */ undefined,
  );

  // A hover card belongs on a link: everyone who can't hover gets only the link.
  useEffect(() => {
    /* istanbul ignore else @preserve -- the else path exists only in production bundles */
    if (process.env.NODE_ENV !== "production") {
      const element = triggerRef.current!;
      if (element.tagName !== "A" || !element.hasAttribute("href")) {
        devWarn(
          "HoverCard",
          "the trigger is not a link; a hover card previews where a link goes, and touch users get only the link",
          '<HoverCard trigger={<Link href="/cooks/ari">Ari</Link>}>',
          key.current,
        );
      }
    }
  });

  return (
    <PreviewCard.Root
      onOpenChange={(next, details) => {
        if (next && (!canHover || lastInput() === "touch")) details.cancel();
      }}
    >
      <PreviewCard.Trigger render={trigger} ref={triggerRef} />
      <PreviewCard.Portal data-ouro="hover-card-portal" className={floatingPortalClass}>
        <PreviewCard.Positioner side={side} align={align} sideOffset={8} collisionPadding={8} data-ouro="hover-card-positioner">
          <PreviewCard.Popup
            data-ouro="hover-card"
            className={cn(
              floatingSurfaceClass,
              floatingMotionClass,
              "w-72 max-w-(--available-width) p-4 text-sm leading-5",
              className,
            )}
          >
            {children}
          </PreviewCard.Popup>
        </PreviewCard.Positioner>
      </PreviewCard.Portal>
    </PreviewCard.Root>
  );
}
