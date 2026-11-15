"use client";

import { PreviewCard } from "@base-ui/react/preview-card";
import { cloneElement, useEffect, useRef, useState, type FocusEvent, type JSX, type PointerEvent, type ReactElement, type ReactNode, type Ref } from "react";
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
import { useMergedRef } from "@/registry/ouro/lib/ouro/refs";
import { serverElement } from "@/registry/ouro/lib/ouro/server-element";
import { useDevWarnings } from "@/registry/ouro/lib/ouro/use-dev-messages";
import { useMediaQuery } from "@/registry/ouro/lib/ouro/use-media-query";
import { PortalScope, usePortalContainer } from "@/registry/ouro/lib/ouro/portal-container";

// Base UI's own delays for a preview card: it opens after the pointer rests on the link, and lingers as it leaves.
const OPEN_DELAY = 600;
const CLOSE_DELAY = 300;

export type { FloatingAlign as HoverCardAlign, FloatingSide as HoverCardSide } from "@/registry/ouro/lib/ouro/floating";

/** Props for {@link HoverCard}. */
export interface HoverCardProps {
  /**
   * The link the card previews: `trigger={<Link href="/cooks/ari">Ari</Link>}`. It works
   * on its own: touch users, and devices that cannot hover, get only the link.
   */
  trigger: ReactElement;
  /** The preview: a few lines about where the link goes. Only what the user can do without; put controls elsewhere. */
  children: ReactNode;
  /**
   * The side of the link the card sits on; it flips when there is no room. @default "bottom"
   *
   * @claim "The side of the link the" registry/ouro/components/ouro/hover-card/hover-card.test.tsx verify:testExists(registry/ouro/components/ouro/hover-card/hover-card.test.tsx::HoverCard > sits on the side and alignment it is given, and className sets layout)
   * @claim "it flips when there is no room" https://base-ui.com/react/components/preview-card verify:urlOk(https://base-ui.com/react/components/preview-card)
   */
  side?: FloatingSide | (string & { 'Use "top", "bottom", "left" or "right"': never }) | undefined;
  /** How the card lines up with the link along that side. @default "center" */
  align?: FloatingAlign | (string & { 'Use "start", "center" or "end": left is "start", right is "end"': never }) | undefined;
  /**
   * Layout only, applied to the card: width (18rem, `w-72`, by default) and padding. Your
   * classes win over Ouro UI's. Appearance classes warn in development.
   * @claim "Layout only, applied to the card" registry/ouro/components/ouro/hover-card/hover-card.tsx verify:fileLine(registry/ouro/components/ouro/hover-card/hover-card.tsx, /"w-72\smax-w-\(--available-width\)\sp-4/)
   */
  className?: string | undefined;

  /** Not a prop. Ouro UI sets the delays: `<HoverCard trigger={…}>`. */
  openDelay?: { "Ouro UI sets the delays": never };
  /** Not a prop. Ouro UI sets the delays: `<HoverCard trigger={…}>`. */
  closeDelay?: { "Ouro UI sets the delays": never };
  /** Not a prop. The preview is the children: `<HoverCard trigger={…}>…</HoverCard>`. */
  content?: { "Use children: <HoverCard trigger={...}>...</HoverCard>": never };
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
 * @group Overlays
 * @see https://ui.ouroboros.bot/docs/hover-card
 *
 * @example
 * <HoverCard trigger={<Link href="/cooks/ari">Ari Mendelow</Link>}>
 *   <CookSummary cook={ari} />
 * </HoverCard>
 * @claim "It stacks above the page at" registry/ouro/components/ouro/hover-card/hover-card.test.tsx verify:testExists(registry/ouro/components/ouro/hover-card/hover-card.test.tsx::HoverCard > portals at the --ouro-layer level, as its own stacking context)
 * @claim "It stacks above the page at" registry/ouro/theme/ouro-base.css verify:fileLine(registry/ouro/theme/ouro-base.css, /^\s+--ouro-layer:\s50;/)
 * @claim "It shows only on devices that" registry/ouro/components/ouro/hover-card/hover-card.touch.test.tsx verify:fileLine(registry/ouro/components/ouro/hover-card/hover-card.touch.test.tsx, /it\("never opens on a device that cannot hover. not from a tap, and not from keyboard focus"/)
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

  const portal = usePortalContainer("HoverCard");

  // The card mounts only once someone may want it: on the link's first hover or keyboard focus. Until then the link is
  // the app's own element with a few handlers, so a page of links (a chat's authors) mounts no card. The link is never
  // wrapped or drawn again as it arms, so focus and the pointer stay on it.
  const [armed, setArmed] = useState(false);
  const [open, setOpen] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  // Opens or closes the card after a delay, in place of whatever was waiting.
  const after = (delay: number, next: boolean) => {
    clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      // Never on a device that cannot hover, or after a touch: a phone has no way to hover it away.
      // Stryker disable next-line ConditionalExpression: a device that cannot hover is the touch project's (hover-card.touch.test.tsx), which mutation testing does not run.
      if (next && (!canHover || lastInput() === "touch")) return;
      setOpen(next);
    }, delay);
  };
  const want = () => {
    setArmed(true);
    after(OPEN_DELAY, true);
  };
  // A Server Component's link may come wrapped (React's lazy element): the element inside is the one to give handlers.
  const element = serverElement(trigger);
  const own = element.props as {
    ref?: Ref<HTMLAnchorElement>;
    onPointerEnter?: (event: PointerEvent<HTMLAnchorElement>) => void;
    onPointerLeave?: (event: PointerEvent<HTMLAnchorElement>) => void;
    onFocus?: (event: FocusEvent<HTMLAnchorElement>) => void;
    onBlur?: (event: FocusEvent<HTMLAnchorElement>) => void;
  };
  const ref = useMergedRef(own.ref, triggerRef);
  // The link takes the merged ref, which nothing reads during render.
  // eslint-disable-next-line react-hooks/refs
  const link = cloneElement(element as ReactElement<Record<string, unknown>>, {
    ref,
    // Stryker disable next-line StringLiteral: found by the attribute alone, never by its value.
    "data-ouro-hover-card-trigger": "",
    // Stryker disable next-line StringLiteral: read by the attribute alone, as Base UI's open trigger is.
    "data-popup-open": open ? "" : undefined,
    onPointerEnter: (event: PointerEvent<HTMLAnchorElement>) => {
      own.onPointerEnter?.(event);
      want();
    },
    onPointerLeave: (event: PointerEvent<HTMLAnchorElement>) => {
      own.onPointerLeave?.(event);
      after(CLOSE_DELAY, false);
    },
    onFocus: (event: FocusEvent<HTMLAnchorElement>) => {
      own.onFocus?.(event);
      if (event.currentTarget.matches(":focus-visible")) want();
    },
    onBlur: (event: FocusEvent<HTMLAnchorElement>) => {
      own.onBlur?.(event);
      after(0, false);
    },
  });
  if (!armed) return link;
  return (
    <>
      {link}
      <PreviewCard.Root
        open={open}
        // Base UI asks only to close a card it holds no trigger for: on Escape or a press outside it.
        onOpenChange={(next) => after(0, next)}
      >
        <PreviewCard.Portal {...portal} data-ouro="hover-card-portal" className={floatingPortalClass}>
          <PortalScope>
            <PreviewCard.Positioner
              anchor={triggerRef}
              side={side}
              align={align}
              sideOffset={8}
              collisionPadding={8}
              data-ouro="hover-card-positioner"
            >
              <PreviewCard.Popup
                data-ouro="hover-card"
                // The pointer may cross from the link onto the card and stay: the card is part of what it hovers.
                onPointerEnter={() => clearTimeout(timer.current)}
                onPointerLeave={() => after(CLOSE_DELAY, false)}
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
          </PortalScope>
        </PreviewCard.Portal>
      </PreviewCard.Root>
    </>
  );
}
