"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type JSX,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
  type RefObject,
} from "react";
import { useAppearanceClassNameCheck } from "@/registry/ouro/lib/ouro/class-name-check";
import { cn } from "@/registry/ouro/lib/ouro/cn";
import { renamedTones, type ToneName } from "@/registry/ouro/lib/ouro/tones";
import { useDevWarnings } from "@/registry/ouro/lib/ouro/use-dev-warnings";
import { Button } from "@/registry/ouro/components/ouro/button/button";
import { Menu } from "@/registry/ouro/components/ouro/menu/menu";
import {
  actionClass,
  actionTones,
  contentClass,
  fadeClass,
  FULL_SWIPE,
  menuClass,
  rootClass,
  sideOf,
  SLOP,
  stripClass,
  stripTones,
  trackClass,
  type SwipeSide,
} from "@/registry/ouro/components/ouro/swipe-actions/swipe-actions-styles";

/** One action of a `SwipeActions` row: a button beside the row, and an item in the row's actions menu. */
export interface SwipeAction {
  /** The button's text: a short verb, such as "Delete" or "Pin". */
  label: string;
  /** Runs when the action is chosen: by a tap on its button, from the actions menu, or by a full swipe when it is the first action of its side. The row then closes. */
  onClick: () => void;
  /**
   * The button's color, a theme token name: `destructive` for an action that deletes.
   * @default "secondary"
   */
  tone?: ToneName | (string & { 'danger is "destructive"; accent is "primary"; neutral is "secondary"': never }) | undefined;

  /** Not a field. Ouro UI uses `onClick`: `{ label: "Delete", onClick: remove }`. */
  onPress?: { 'Use onClick: { label: "Delete", onClick: remove }': never };
  /** Not a field. Ouro UI uses `tone`: `{ label: "Delete", tone: "destructive", onClick: remove }`. */
  variant?: { 'Use tone: { label: "Delete", tone: "destructive", onClick: remove }': never };
}

/** Props for {@link SwipeActions}. */
export interface SwipeActionsProps {
  /** Names the row for its actions button: "Braised short ribs" gives "Actions for Braised short ribs". Always required. */
  label: string;
  /** The row itself, usually an `Item`. It may be a link (`<Item href>`): a tap follows it and a swipe does not. */
  children: ReactNode;
  /** The actions a swipe toward the end reveals at the start edge, the first one outermost. A full swipe runs the first. */
  leading?: readonly SwipeAction[] | undefined;
  /** The actions a swipe toward the start reveals at the end edge, the first one outermost. A full swipe runs the first. */
  trailing?: readonly SwipeAction[] | undefined;
  /**
   * The accessible name of the row's actions button; `{label}` is the row's `label`.
   * Translate it with the rest of your interface.
   * @default "Actions for {label}"
   */
  actionsLabel?: string | undefined;
  /** Layout only: margins (`mt-2`). Appearance classes warn in development; give an action a `tone`. */
  className?: string | undefined;

  /** Not a prop. Ouro UI names the side: `trailing={[{ label: "Delete", onClick: remove }]}`. */
  actions?: { 'Use trailing={[{ label: "Delete", onClick: remove }]}': never };
  /** Not a prop. Ouro UI uses `leading`, which follows the reading direction: `leading={[{ label: "Pin", onClick: pin }]}`. */
  left?: { 'Use leading={[{ label: "Pin", onClick: pin }]}': never };
  /** Not a prop. Ouro UI uses `trailing`, which follows the reading direction: `trailing={[{ label: "Delete", onClick: remove }]}`. */
  right?: { 'Use trailing={[{ label: "Delete", onClick: remove }]}': never };
  /** Not a prop. Ouro UI uses `leading`: `leading={[{ label: "Pin", onClick: pin }]}`. */
  leftActions?: { 'Use leading={[{ label: "Pin", onClick: pin }]}': never };
  /** Not a prop. Ouro UI uses `trailing`: `trailing={[{ label: "Delete", onClick: remove }]}`. */
  rightActions?: { 'Use trailing={[{ label: "Delete", onClick: remove }]}': never };
  /** Not a prop. Deleting is an action: `trailing={[{ label: "Delete", tone: "destructive", onClick: remove }]}`. */
  onDelete?: { 'Use trailing={[{ label: "Delete", tone: "destructive", onClick: remove }]}': never };
}

const trailingFix = 'trailing={[{ label: "Delete", tone: "destructive", onClick: remove }]}';
const leadingFix = 'leading={[{ label: "Pin", onClick: pin }]}';

const toneOf = (action: SwipeAction): ToneName => (action.tone !== undefined && Object.hasOwn(actionTones, action.tone) ? (action.tone as ToneName) : "secondary");

/** A swipe in progress. */
interface Gesture {
  /** Stops listening for the finger. */
  stop: () => void;
}

function EllipsisIcon(): JSX.Element {
  return (
    <svg aria-hidden="true" viewBox="0 0 16 16" fill="currentColor" className="size-4">
      <circle cx="3" cy="8" r="1.5" />
      <circle cx="8" cy="8" r="1.5" />
      <circle cx="13" cy="8" r="1.5" />
    </svg>
  );
}

/** One side's buttons. They cannot be reached, by focus or by a screen reader, unless that side is open. */
function Strip({
  side,
  actions,
  open,
  stripRef,
  onAction,
}: {
  side: SwipeSide;
  actions: readonly SwipeAction[];
  open: boolean;
  stripRef: RefObject<HTMLDivElement | null>;
  onAction: (action: SwipeAction) => void;
}): JSX.Element | null {
  const primary = actions[0];
  if (!primary) return null;
  // The first action is outermost: last in the trailing side's reading order.
  const ordered = side === "trailing" ? [...actions].reverse() : actions;
  return (
    <div
      ref={stripRef}
      data-ouro-swipe-actions-side={side}
      data-open={open ? "" : undefined}
      inert={!open}
      className={cn(stripClass[side], stripTones[toneOf(primary)])}
    >
      {ordered.map((action, index) => (
        <button
          key={index}
          type="button"
          data-tone={toneOf(action)}
          data-primary={action === primary ? "" : undefined}
          className={cn(actionClass, actionTones[toneOf(action)], action !== primary && fadeClass)}
          onClick={() => onAction(action)}
        >
          {action.label}
        </button>
      ))}
    </div>
  );
}

/**
 * A list row with actions beside it that a horizontal swipe reveals: swipe toward the
 * start for the `trailing` actions (Delete, Archive), toward the end for the `leading`
 * ones (Pin). Wrap the row, usually an `Item`, and name it with `label`. It is for touch
 * and pen; every action is also in the row's actions button, a `Menu`, which a mouse
 * sees at the end of the row and a keyboard or screen reader reaches on any device.
 *
 * The first action of each side is its primary one: it sits at the outer edge, and a
 * swipe past 60% of the row runs it on release, with no confirmation. So make a
 * destructive primary action undoable: delete, then offer Undo in a toast, as in the
 * example. When it cannot be undone, open a `ConfirmDialog` from `onClick` instead.
 *
 * A vertical swipe that starts on a row scrolls the page. A row that is a link follows it
 * on a tap, never on a swipe. One row is open at a time, and an open row closes on a tap
 * outside it, on a tap on the row, when the page scrolls and on Escape. `leading` and
 * `trailing` follow the reading direction. With reduced motion nothing slides: the row
 * jumps open and its actions fade in.
 *
 * Use `Item` with `actions` instead when the buttons should always show, and `Menu` with
 * `contextTrigger` for actions on something that is not a list row.
 *
 * @group Lists
 * @see https://ourostack.github.io/ouro-ui/docs/swipe-actions
 *
 * @example
 * <ItemGroup label="Recipes">
 *   {recipes.map((recipe) => (
 *     <SwipeActions
 *       key={recipe.id}
 *       label={recipe.title}
 *       leading={[{ label: "Pin", tone: "primary", onClick: () => pin(recipe) }]}
 *       trailing={[
 *         {
 *           label: "Delete",
 *           tone: "destructive",
 *           onClick: () => {
 *             remove(recipe);
 *             toast("Recipe deleted", { action: { label: "Undo", onClick: () => restore(recipe) } });
 *           },
 *         },
 *         { label: "Archive", onClick: () => archive(recipe) },
 *       ]}
 *     >
 *       <Item href={`/recipes/${recipe.id}`} title={recipe.title} />
 *     </SwipeActions>
 *   ))}
 * </ItemGroup>
 */
export function SwipeActions(props: SwipeActionsProps): JSX.Element {
  const {
    label,
    children,
    leading: leadingProp,
    trailing: trailingProp,
    actionsLabel = "Actions for {label}",
    className,
    // Guard props (hint types), dropped here so they never reach the DOM.
    actions,
    left,
    right,
    leftActions,
    rightActions,
    onDelete,
  } = props;
  const leading = leadingProp ?? [];
  const trailing = trailingProp ?? [];
  const all = [...leading, ...trailing];

  useAppearanceClassNameCheck(
    "SwipeActions",
    className,
    process.env.NODE_ENV !== "production"
      ? (token: string) => `remove "${token}"; give an action a tone: { label: "Delete", tone: "destructive", onClick: remove }`
      : /* istanbul ignore next @preserve -- production only */ "",
  );
  useDevWarnings(
    "SwipeActions",
    process.env.NODE_ENV !== "production"
      ? () => [
          !label && ["label is required; it names the row for its actions button", '<SwipeActions label="Braised short ribs">'],
          all.length === 0 && ["it has no actions", `<SwipeActions label="…" ${trailingFix}>`],
          ...all.map((action): readonly [string, string] | false => {
            const bad = action as { onPress?: unknown; variant?: unknown };
            const tone = String(action.tone);
            if (action.tone !== undefined && !Object.hasOwn(actionTones, tone)) {
              const fix = Object.hasOwn(renamedTones, tone) ? renamedTones[tone]! : "destructive";
              return [
                `the action "${action.label}" has tone: "${tone}", which is not a tone; use "primary", "secondary", "destructive", "success", "warning"`,
                `{ label: "${action.label}", tone: "${fix}", onClick: … }`,
              ];
            }
            if (bad.onPress !== undefined) return [`the action "${action.label}" has onPress, which is not a field`, `{ label: "${action.label}", onClick: … }`];
            if (bad.variant !== undefined) {
              return [`the action "${action.label}" has variant, which is not a field`, `{ label: "${action.label}", tone: "destructive", onClick: … }`];
            }
            return false;
          }),
          actions !== undefined && ["actions is not a prop; name the side", trailingFix],
          left !== undefined && ["left is not a prop; the sides follow the reading direction", leadingFix],
          right !== undefined && ["right is not a prop; the sides follow the reading direction", trailingFix],
          leftActions !== undefined && ["leftActions is not a prop", leadingFix],
          rightActions !== undefined && ["rightActions is not a prop", trailingFix],
          onDelete !== undefined && ["onDelete is not a prop; deleting is an action", trailingFix],
        ]
      : /* istanbul ignore next @preserve -- production only */ undefined,
  );

  const [open, setOpen] = useState<SwipeSide | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const leadingRef = useRef<HTMLDivElement>(null);
  const trailingRef = useRef<HTMLDivElement>(null);
  const gesture = useRef<Gesture | undefined>(undefined);
  // Whether the last touch on the row was a swipe, whose click (if the browser sends one) is not a tap.
  const swiped = useRef(false);
  // The latest props and state for the listeners a gesture attaches once.
  const latest = useRef({ leading, trailing, open });
  useLayoutEffect(() => {
    latest.current = { leading, trailing, open };
  });

  /** Brings the row to rest: open on a side, at that side's width, or closed. */
  const settle = useCallback((side: SwipeSide | null) => {
    const root = rootRef.current!;
    const track = trackRef.current!;
    root.removeAttribute("data-dragging");
    root.removeAttribute("data-full");
    const strip = side === "leading" ? leadingRef.current : side === "trailing" ? trailingRef.current : null;
    if (side && strip) {
      const rtl = getComputedStyle(root).direction === "rtl";
      const sign = (side === "trailing") !== rtl ? -1 : 1;
      track.style.setProperty("--ouro-swipe-x", `${sign * strip.getBoundingClientRect().width}px`);
    } else {
      track.style.removeProperty("--ouro-swipe-x");
      // Focus on an action about to become inert moves to the actions button, not to the page.
      if (root.querySelector("[data-ouro-swipe-actions-side] :focus")) {
        root.querySelector<HTMLElement>("[data-ouro-swipe-actions-menu] button")!.focus();
      }
    }
    setOpen(side && strip ? side : null);
  }, []);

  // An open row closes on a press outside it, when anything else scrolls and on Escape.
  useEffect(() => {
    if (!open) return;
    const root = rootRef.current!;
    const inside = (target: EventTarget | null) => target instanceof Node && root.contains(target);
    const onPointerDown = (event: PointerEvent) => {
      if (!inside(event.target)) settle(null);
    };
    const onScroll = (event: Event) => {
      if (!inside(event.target)) settle(null);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      // This Escape closes the row only, not a Dialog or Sheet the row sits in.
      event.stopPropagation();
      settle(null);
    };
    document.addEventListener("pointerdown", onPointerDown, true);
    document.addEventListener("keydown", onKeyDown, true);
    addEventListener("scroll", onScroll, { capture: true, passive: true });
    return () => {
      document.removeEventListener("pointerdown", onPointerDown, true);
      document.removeEventListener("keydown", onKeyDown, true);
      removeEventListener("scroll", onScroll, { capture: true });
    };
  }, [open, settle]);

  // An open side whose actions the app took away closes.
  useLayoutEffect(() => {
    if (open && (open === "leading" ? leading : trailing).length === 0) settle(open);
  });

  // A row unmounted mid-swipe (its action removed it) stops listening.
  useEffect(() => () => gesture.current?.stop(), []);

  const run = (action: SwipeAction) => {
    settle(null);
    action.onClick();
  };

  const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    swiped.current = false;
    // A mouse selects text and clicks; its way to the actions is the actions button.
    if (event.pointerType === "mouse" || !event.isPrimary || gesture.current) return;
    const root = rootRef.current!;
    const track = trackRef.current!;
    const pointer = event.pointerId;
    const startX = event.clientX;
    const startY = event.clientY;
    const base = Number.parseFloat(track.style.getPropertyValue("--ouro-swipe-x")) || 0;
    const rtl = getComputedStyle(root).direction === "rtl";
    const width = root.getBoundingClientRect().width;
    const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
    let locked = false;
    let offset = base;
    let full = false;

    const actionsOn = (side: SwipeSide) => latest.current[side];
    const stop = () => {
      removeEventListener("pointermove", move);
      removeEventListener("pointerup", up);
      removeEventListener("pointercancel", cancel);
      gesture.current = undefined;
    };
    const move = (moved: PointerEvent) => {
      if (moved.pointerId !== pointer) return;
      const dx = moved.clientX - startX;
      const dy = moved.clientY - startY;
      if (!locked) {
        if (Math.abs(dx) < SLOP && Math.abs(dy) < SLOP) return;
        // A vertical move is the page's scroll: the browser takes it (`touch-pan-y`).
        if (Math.abs(dy) >= Math.abs(dx)) return stop();
        locked = true;
        swiped.current = true;
        root.setAttribute("data-dragging", "");
      }
      const wanted = Math.min(Math.max(base + dx, -width), width);
      // A side with no actions does not open.
      offset = actionsOn(sideOf(wanted, rtl)).length > 0 ? wanted : 0;
      full = Math.abs(offset) >= width * FULL_SWIPE;
      root.toggleAttribute("data-full", full);
      // With reduced motion the row stays put under the finger and jumps open on release.
      if (!reduce) track.style.setProperty("--ouro-swipe-x", `${offset}px`);
    };
    const up = (lifted: PointerEvent) => {
      if (lifted.pointerId !== pointer) return;
      stop();
      if (!locked) return;
      const side = sideOf(offset, rtl);
      const primary = actionsOn(side)[0];
      if (full && primary) return run(primary);
      const strip = side === "leading" ? leadingRef.current : trailingRef.current;
      settle(strip && Math.abs(offset) > strip.getBoundingClientRect().width / 2 ? side : null);
    };
    const cancel = (cancelled: PointerEvent) => {
      if (cancelled.pointerId !== pointer) return;
      stop();
      // The browser took the gesture: back to where the row was.
      if (locked) settle(latest.current.open);
    };
    addEventListener("pointermove", move);
    addEventListener("pointerup", up);
    addEventListener("pointercancel", cancel);
    gesture.current = { stop };
  };

  const onClickCapture = (event: ReactMouseEvent<HTMLDivElement>) => {
    // A click from the keyboard or a screen reader (`detail` 0) is never part of a swipe.
    const pointer = event.detail !== 0;
    if (pointer && swiped.current) {
      swiped.current = false;
      event.preventDefault();
      event.stopPropagation();
      return;
    }
    // A tap on an open row closes it and does nothing else: it does not follow the row's link.
    if (open && contentRef.current!.contains(event.target as Node)) {
      settle(null);
      if (pointer) {
        event.preventDefault();
        event.stopPropagation();
      }
    }
  };

  return (
    <div
      ref={rootRef}
      data-ouro="swipe-actions"
      data-open={open ?? undefined}
      className={cn(rootClass, className)}
      onPointerDown={onPointerDown}
      onClickCapture={onClickCapture}
    >
      <div ref={trackRef} data-ouro-swipe-actions-track="" className={trackClass}>
        <Strip side="leading" actions={leading} open={open === "leading"} stripRef={leadingRef} onAction={run} />
        <div ref={contentRef} data-ouro-swipe-actions-content="" className={contentClass}>
          {children}
        </div>
        {all.length > 0 && (
          <div data-ouro-swipe-actions-menu="" className={menuClass}>
            <Menu
              trigger={
                <Button variant="plain" tone="secondary" size="sm" aria-label={actionsLabel.replaceAll("{label}", label)}>
                  <EllipsisIcon />
                </Button>
              }
              items={all.map((action) => ({
                label: action.label,
                onClick: () => run(action),
                tone: toneOf(action) === "destructive" ? ("destructive" as const) : undefined,
              }))}
            />
          </div>
        )}
        <Strip side="trailing" actions={trailing} open={open === "trailing"} stripRef={trailingRef} onAction={run} />
      </div>
    </div>
  );
}
