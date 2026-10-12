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
import { rubberband, spring, type SpringHandle } from "@/registry/ouro/lib/ouro/spring";
import { renamedTones, type ToneName } from "@/registry/ouro/lib/ouro/tones";
import { useDevWarnings } from "@/registry/ouro/lib/ouro/use-dev-warnings";
import { useDrag } from "@/registry/ouro/lib/ouro/use-drag";
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
 * The row follows the finger. A quick flick opens or closes it however short, by the
 * direction it was moving at release; a slow release opens it past half the actions'
 * width. A flick alone never runs an action: that takes the distance. The row springs to
 * rest from where it was let go, and a new swipe can catch it on the way.
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
  // Whether the last touch on the row was a swipe, whose click (if the browser sends one) is not a tap.
  const swiped = useRef(false);
  // Where the track is, in px from closed, and the spring carrying it to rest.
  const x = useRef(0);
  const settling = useRef<SpringHandle | undefined>(undefined);
  /** The swipe under a finger: where the track was when the finger took it, and where the finger has it now. */
  const swipe = useRef({ base: 0, rtl: false, width: 0, reduce: false, offset: 0, full: false });

  /** Puts the track at `value`. Only the track's own `transform` changes, so nothing else restyles. */
  const place = useCallback((value: number) => {
    x.current = value;
    trackRef.current!.style.transform = value === 0 ? "" : `translateX(${value}px)`;
  }, []);

  /** Stops the spring where it is, leaving the track there for a finger to take. */
  const hold = useCallback(() => {
    const running = settling.current;
    if (!running) return;
    settling.current = undefined;
    rootRef.current!.removeAttribute("data-ouro-settling");
    place(running.stop().value);
  }, [place]);

  /**
   * Brings the row to rest: open on a side, at that side's width, or closed. It springs
   * there from where it is, with the `velocity` the finger left it and a little bounce
   * after a `flick`; with reduced motion the spring is a jump.
   */
  const settle = useCallback(
    (side: SwipeSide | null, velocity = 0, flick = false) => {
      const root = rootRef.current!;
      hold();
      root.removeAttribute("data-dragging");
      root.removeAttribute("data-full");
      const strip = side === "leading" ? leadingRef.current : side === "trailing" ? trailingRef.current : null;
      let target = 0;
      if (side && strip) {
        const rtl = getComputedStyle(root).direction === "rtl";
        target = ((side === "trailing") !== rtl ? -1 : 1) * strip.getBoundingClientRect().width;
      } else if (root.querySelector("[data-ouro-swipe-actions-side] :focus")) {
        // Focus on an action about to become inert moves to the actions button, not to the page.
        root.querySelector<HTMLElement>("[data-ouro-swipe-actions-menu] button")!.focus();
      }
      setOpen(side && strip ? side : null);
      if (x.current === target) return;
      const handle = spring({
        from: x.current,
        to: target,
        velocity,
        damping: flick ? 0.8 : 1,
        onUpdate: place,
        onRest: () => {
          settling.current = undefined;
          root.removeAttribute("data-ouro-settling");
        },
      });
      if (handle.running) {
        settling.current = handle;
        root.setAttribute("data-ouro-settling", "");
      }
    },
    [hold, place],
  );

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

  // A row unmounted while it springs to rest (its action removed it) stops moving.
  useEffect(() => () => void settling.current?.stop(), []);

  const run = (action: SwipeAction) => {
    settle(null);
    action.onClick();
  };

  const actionsOn = (side: SwipeSide) => (side === "leading" ? leading : trailing);
  const drag = useDrag({
    axis: "x",
    onStart: ({ event }) => {
      // A mouse selects text and clicks; its way to the actions is the actions button.
      if (event.pointerType === "mouse") return false;
      const root = rootRef.current!;
      // A row still springing to rest is caught where it is.
      hold();
      swiped.current = true;
      root.setAttribute("data-dragging", "");
      swipe.current = {
        base: x.current,
        rtl: getComputedStyle(root).direction === "rtl",
        width: root.getBoundingClientRect().width,
        reduce: matchMedia("(prefers-reduced-motion: reduce)").matches,
        offset: x.current,
        full: false,
      };
      return true;
    },
    onMove: ({ delta }) => {
      const now = swipe.current;
      // The row moves with the finger, from where the finger took hold of it.
      const wanted = now.base + delta;
      const reach = Math.abs(wanted);
      if (actionsOn(sideOf(wanted, now.rtl)).length === 0) {
        // Nothing on this side: the row resists, and will spring back.
        now.offset = rubberband(wanted, now.width);
        now.full = false;
      } else {
        // Past the row's own width it resists too.
        now.offset = reach <= now.width ? wanted : Math.sign(wanted) * (now.width + rubberband(reach - now.width, now.width));
        now.full = reach >= now.width * FULL_SWIPE;
      }
      rootRef.current!.toggleAttribute("data-full", now.full);
      // With reduced motion the row stays put under the finger and jumps open on release.
      if (!now.reduce) place(now.offset);
    },
    onEnd: ({ velocity, flick, cancelled }) => {
      // The browser took the gesture: back to where the row was.
      if (cancelled) return settle(open);
      const { offset, full, rtl } = swipe.current;
      const side = sideOf(offset, rtl);
      const primary = actionsOn(side)[0];
      if (!primary) return settle(null, velocity, flick);
      // Whether the finger was still moving the row further open when it lifted.
      const opening = Math.sign(velocity) === Math.sign(offset);
      // A full swipe runs the primary action, unless the finger was flicking the row back.
      if (full && (opening || !flick)) return run(primary);
      // A flick goes the way it was moving, however short. A slow release goes by distance.
      const strip = side === "leading" ? leadingRef.current! : trailingRef.current!;
      const opens = flick ? opening : Math.abs(offset) > strip.getBoundingClientRect().width / 2;
      settle(opens ? side : null, velocity, flick);
    },
  });
  const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    swiped.current = false;
    drag.onPointerDown(event);
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
      onPointerMove={drag.onPointerMove}
      onPointerUp={drag.onPointerUp}
      onPointerCancel={drag.onPointerCancel}
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
              // Opening the menu closes a side the row had open: the menu is now the way to the actions.
              onOpenChange={(menuOpen) => {
                if (menuOpen) settle(null);
              }}
              items={all.map((action) => ({
                label: action.label,
                onClick: action.onClick,
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
