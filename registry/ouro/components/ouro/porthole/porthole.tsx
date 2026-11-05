"use client";

import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type HTMLAttributes,
  type JSX,
  type KeyboardEvent,
  type PointerEvent,
  type Ref,
} from "react";
import { announce } from "@/registry/ouro/lib/ouro/announce";
import { useAppearanceClassNameCheck } from "@/registry/ouro/lib/ouro/class-name-check";
import { cn } from "@/registry/ouro/lib/ouro/cn";
import { portholeView, type PortholeItem, type PortholeLabels, type PortholeSnapshot, type PortholeSource, type PortholeView } from "@/registry/ouro/lib/ouro/porthole-view";
import { useDevWarnings } from "@/registry/ouro/lib/ouro/use-dev-messages";
import { PORTHOLE_ANNOUNCE_GAP_MS, PORTHOLE_HOVER_DELAY_MS, portholeLightClasses, type PortholeSide } from "@/registry/ouro/components/ouro/porthole/porthole-styles";

/**
 * A snapshot that does not change, with the time of its last beat: for a page rendered on the server, a story or a
 * test. It is plain data, so a Server Component can pass it. The server renders it as of its last beat, so a page read
 * later from a cache hydrates without a mismatch; once hydrated, the spot judges it against the clock, so it says
 * "Status unknown" once the beat is older than `heartbeatTimeoutMs`.
 *
 * @claim "The server renders it as of its last beat" registry/ouro/components/ouro/porthole/porthole.test.tsx verify:testExists(registry/ouro/components/ouro/porthole/porthole.test.tsx::Porthole > renders on the server as of its last beat, hydrates later without a mismatch, then judges against the clock)
 */
export interface PortholeFixed {
  snapshot: PortholeSnapshot;
  lastBeatAt: number;
}

/** Porthole's words: those of `portholeView`, and the dismiss button's name. */
export interface PortholeWords extends PortholeLabels {
  /** The name of the button that dismisses an item. @default "Dismiss" */
  dismiss?: string | undefined;
}

/** The props Porthole adds to the `<div>` attributes it passes through. */
export interface PortholeOwnProps {
  /**
   * Where the status comes from: the app's mirror of its service (`getSnapshot`, `subscribe` and `lastBeatAt`), or a
   * fixed `{ snapshot, lastBeatAt }`.
   */
  source: PortholeSource | PortholeFixed;
  /** The status spot's name for screen readers, such as `"Status"`. */
  label: string;
  /** How recently, in ms, the areas must have been verified for "Up to date", unless an area sets its own `freshWithinMs`. @default 60_000 */
  freshWithinMs?: number | undefined;
  /** "Status unknown" once the last beat is older than this many ms. @default 5_000 */
  heartbeatTimeoutMs?: number | undefined;
  /** An area in trouble for this many ms stops counting as fresh. @default 5_000 */
  troubleAfterMs?: number | undefined;
  /** Starts open, showing the detail lines, as on a page about the app's status. @default false */
  defaultOpen?: boolean | undefined;
  /**
   * At rest and fresh, shows the light alone and the words on hover or focus, in the same room, so nothing moves.
   * Pass `false` to keep the words showing. The spot's name holds them while they are unseen. @default true
   */
  quiet?: boolean | undefined;
  /** Where the detail lines open: under the spot, or over it for a spot at the foot of a column. @default "bottom" */
  side?: PortholeSide | (string & { 'Use "top" or "bottom"': never }) | undefined;
  /** Words for other languages. */
  labels?: PortholeWords | undefined;
  /**
   * Called when the person presses the shown item's action, with the item and the action's id. Pass it to the service,
   * which changes or removes the item: Porthole never changes an item itself.
   */
  onAction?: ((item: PortholeItem, actionId: string) => void) | undefined;
  /** Called when the person dismisses a `dismissable` item. Pass it to the service, which removes the item. */
  onDismiss?: ((item: PortholeItem) => void) | undefined;
  /** Layout only: margins, placement (`ms-auto`). Appearance classes warn in development. */
  className?: string | undefined;
  ref?: Ref<HTMLDivElement> | undefined;

  /** Not a prop. Porthole reads items from `source`: `getSnapshot().items`. */
  items?: { 'Pass items in source.getSnapshot()': never };
  /** Not a prop. Porthole decides the status from `source`. */
  status?: { 'Porthole decides the status from source': never };
}

/** Props for {@link Porthole}: its own props and the `<div>` attributes it passes through. */
export type PortholeProps = Omit<HTMLAttributes<HTMLDivElement>, keyof PortholeOwnProps> & PortholeOwnProps;

// Stryker disable next-line ArrowFunction: React takes a missing unsubscribe as nothing to undo, which this is
const still = () => () => {};
const onClient = () => true;
// Stryker disable next-line ArrowFunction: undefined is as false as false to the one reader, a conditional
const onServer = () => false;
const live = (source: PortholeSource | PortholeFixed): source is PortholeSource => typeof (source as PortholeSource).subscribe === "function";
// What the person sees: a deadline renders only when this changes.
const seen = (view: PortholeView) => JSON.stringify([view.state, view.text, view.detail]);

function Light({ view }: { view: PortholeView }): JSX.Element {
  if (view.state === "working") {
    const progress = view.item!.progress;
    if (Number.isFinite(progress)) {
      const filled = Math.min(1, Math.max(0, progress!));
      return (
        <svg aria-hidden="true" viewBox="0 0 16 16" data-porthole-part="progress" className="size-4 shrink-0 -rotate-90 text-[color-mix(in_oklab,var(--primary)_85%,var(--foreground))] forced-colors:text-[CanvasText]">
          <circle cx="8" cy="8" r="6" fill="none" stroke="currentColor" strokeOpacity="0.25" strokeWidth="2" />
          <circle cx="8" cy="8" r="6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" pathLength="100" strokeDasharray={`${filled * 100} 100`} />
        </svg>
      );
    }
    return (
      <svg aria-hidden="true" viewBox="0 0 16 16" data-porthole-part="progress" className="size-4 shrink-0 text-[color-mix(in_oklab,var(--primary)_85%,var(--foreground))] motion-safe:animate-[ouro-spin_1s_linear_infinite] forced-colors:text-[CanvasText]">
        <path d="M14 8a6 6 0 1 1-4.15-5.7" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      </svg>
    );
  }
  return <span aria-hidden="true" data-porthole-part="light" className={cn("size-2 shrink-0 rounded-full", portholeLightClasses[view.state])} />;
}

/**
 * The status spot: a small round window with one line about how current the app's data is, which opens into the
 * facts behind it. It shows one item at a time, an action over an error over working over rest; at rest it
 * says "Up to date" only while every area was verified within its `freshWithinMs`, otherwise the real age, and
 * "Status unknown" when an area was never verified or the service's heartbeat stops. It owns its clock: it looks again
 * only at the one moment the view could change (`nextChangeAt`), so a stuck service can never hold "Up to date", a beat
 * never renders it, and it waits while the page is hidden. It opens into the detail lines while a mouse is over it, and
 * a press keeps it open until a second press, Escape or a press anywhere else. It never takes focus on its own, and
 * speaks only when it changes into an action or an error, at most once every ten seconds.
 * Its state is on `data-porthole-state` for a fault-injection check.
 *
 * Use `SyncStatus` instead for where one document's own changes are, and `toast()` to confirm a single action.
 *
 * @group Feedback
 * @see https://ui.ouro.bot/docs/porthole
 *
 * @example
 * <Porthole source={statusSource} label="Status" onAction={(item, id) => service.act(item.id, id)} onDismiss={(item) => service.dismiss(item.id)} />
 * @claim "It shows one item at a" registry/ouro/components/ouro/porthole/porthole.test.tsx verify:testExists(registry/ouro/components/ouro/porthole/porthole.test.tsx::Porthole > shows the most urgent item, and the rest line when there is none)
 * @claim "so a stuck service can never" registry/ouro/components/ouro/porthole/porthole.test.tsx verify:testExists(registry/ouro/components/ouro/porthole/porthole.test.tsx::Porthole timing > says Status unknown once at the heartbeat's timeout when the beats stop, and recovers on the next beat)
 * @claim "a beat never renders it" registry/ouro/components/ouro/porthole/porthole.test.tsx verify:testExists(registry/ouro/components/ouro/porthole/porthole.test.tsx::Porthole timing > renders nothing for 60 beats over 60 s at rest, then once when fresh runs out)
 * @claim "it waits while the page" registry/ouro/components/ouro/porthole/porthole.test.tsx verify:testExists(registry/ouro/components/ouro/porthole/porthole.test.tsx::Porthole timing > waits while the page is hidden, and looks again as it shows)
 * @claim "a press keeps it open until" registry/ouro/components/ouro/porthole/porthole.test.tsx verify:testExists(registry/ouro/components/ouro/porthole/porthole.test.tsx::Porthole > opens while a mouse is over it and closes as it leaves, and a touch does not open it) verify:testExists(registry/ouro/components/ouro/porthole/porthole.test.tsx::Porthole > puts pinned lines away at a press anywhere else, and keeps them at a press inside)
 * @claim "never takes focus on its own" registry/ouro/components/ouro/porthole/porthole.test.tsx verify:testExists(registry/ouro/components/ouro/porthole/porthole.test.tsx::Porthole > never takes focus when it changes, and gives it back to the spot when a pressed button leaves)
 * @claim "speaks only when it changes into" registry/ouro/components/ouro/porthole/porthole.test.tsx verify:testExists(registry/ouro/components/ouro/porthole/porthole.test.tsx::Porthole > speaks when it changes into an action or an error, at most once every ten seconds)
 */
export function Porthole(props: PortholeProps): JSX.Element {
  const {
    source,
    label,
    freshWithinMs,
    heartbeatTimeoutMs,
    troubleAfterMs,
    labels,
    defaultOpen,
    side: sideProp,
    quiet,
    onAction,
    onDismiss,
    className,
    onKeyDown,
    onPointerEnter,
    onPointerLeave,
    // Guard props (hint types), dropped here so they never reach the DOM.
    items,
    status,
    ...rest
  } = props;
  useAppearanceClassNameCheck(
    "Porthole",
    className,
    process.env.NODE_ENV !== "production"
      ? (token: string) => `remove "${token}"; Porthole takes its colors from the theme`
      : // Stryker disable next-line StringLiteral: production only, which no test runs
        /* istanbul ignore next @preserve -- production only */ "",
  );

  const subscribe = useCallback((listener: () => void) => (live(source) ? source.subscribe(listener) : still()), [source]);
  const getSnapshot = useCallback(() => (live(source) ? source.getSnapshot() : source.snapshot), [source]);
  const lastBeatAt = useCallback(() => (live(source) ? source.lastBeatAt() : source.lastBeatAt), [source]);
  const snapshot = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  const options = { freshWithinMs, heartbeatTimeoutMs, troubleAfterMs, labels };
  const top = sideProp === "top";
  // The server, and the hydration that must match it, judge as of the last beat, the one time both know; the render
  // right after hydration judges against the clock.
  const hydrated = useSyncExternalStore(still, onClient, onServer);
  const beat = lastBeatAt();
  // eslint-disable-next-line react-hooks/purity -- each render judges against the real clock; the one timeout renders again when that judgement would change
  const view = portholeView(snapshot, beat, hydrated ? Date.now() : beat, options);
  const shown = seen(view);

  useDevWarnings(
    "Porthole",
    process.env.NODE_ENV !== "production"
      ? () => [
          items !== undefined && ["items is not a prop; Porthole reads them from source", "<Porthole source={{ snapshot: { version: 1, items, areas }, lastBeatAt }} />"],
          status !== undefined && ["status is not a prop; Porthole decides it from source", "<Porthole source={statusSource} />"],
          sideProp !== undefined && sideProp !== "top" && sideProp !== "bottom" && [`side="${String(sideProp)}" is not an option; use "top" or "bottom"`, '<Porthole side="top" />'],
          view.item?.action !== undefined &&
            onAction === undefined && [`the item "${view.item.id}" offers an action, but onAction is not set, so its button is hidden`, "<Porthole onAction={(item, actionId) => service.act(item.id, actionId)} />"],
        ]
      : /* istanbul ignore next @preserve -- production only */ undefined,
  );

  // One timeout, for the one moment the view could change. When it comes, the view is judged again with the latest
  // beat: the same view only moves the timeout; a new one renders. A hidden page waits until it shows again.
  const [, look] = useState(0);
  const nextLook = view.nextChangeAt;
  // The latest options, so a new labels object from each render of the app does not reset the timeout: a change that
  // matters changes the view, and so what is shown or when it next changes.
  const judging = useRef(options);
  useLayoutEffect(() => {
    judging.current = options;
  });
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const wait = (at: number | null) => {
      clearTimeout(timer);
      timer = at === null || document.hidden ? undefined : setTimeout(check, at - Date.now());
    };
    const check = () => {
      const next = portholeView(getSnapshot(), lastBeatAt(), Date.now(), judging.current);
      // Stryker disable next-line ArrowFunction,ArithmeticOperator: any state but the last renders, and React renders the component even for the last one here, judging the view again
      if (seen(next) !== shown) look((n) => n + 1);
      else wait(next.nextChangeAt);
    };
    const visibility = () => (document.hidden ? wait(null) : check());
    wait(nextLook);
    document.addEventListener("visibilitychange", visibility);
    return () => {
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", visibility);
    };
  }, [shown, nextLook, getSnapshot, lastBeatAt]);

  // The line fades from the old words to the new; the old stay only to fade out.
  const [line, setLine] = useState({ text: view.text, previous: null as string | null, turn: 0 });
  if (line.text !== view.text) setLine({ text: view.text, previous: line.text, turn: line.turn + 1 });

  // Spoken when it changes into an action or an error, never on the first render, and at most once per gap.
  const urgent = view.state === "action" || view.state === "error" ? `${view.state}\n${view.item!.id}\n${view.text}` : "";
  const spoken = useRef<{ key: string; at: number } | null>(null);
  useEffect(() => {
    const last = spoken.current;
    if (last === null) {
      spoken.current = { key: urgent, at: -Infinity };
      return;
    }
    if (urgent === "" || urgent === last.key) return;
    const say = () => {
      spoken.current = { key: urgent, at: Date.now() };
      announce(urgent.split("\n")[2]!);
    };
    const gap = last.at + PORTHOLE_ANNOUNCE_GAP_MS - Date.now();
    if (gap <= 0) return say();
    const timer = setTimeout(say, gap);
    return () => clearTimeout(timer);
  }, [urgent]);

  // Open while pressed open, or while a mouse is over it. A mouse is always over the spot when it presses, so a press
  // pins the open spot (it stays open as the mouse leaves) and only a press on a pinned spot closes it.
  const [pressed, setPressed] = useState(defaultOpen === true);
  const [hovered, setHovered] = useState(false);
  const open = pressed || hovered;
  const panelId = useId();
  const toggle = () => {
    clearTimeout(intent.current);
    setHovered(false);
    setPressed(!pressed);
  };
  const close = (event: KeyboardEvent<HTMLDivElement>) => {
    onKeyDown?.(event);
    if (event.key !== "Escape" || event.defaultPrevented) return;
    // Escape also calls off a mouse's pending open.
    clearTimeout(intent.current);
    if (!open) return;
    event.preventDefault();
    setPressed(false);
    setHovered(false);
  };
  // A mouse that rests on the spot opens it; one passing over opens nothing.
  const intent = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const enter = (event: PointerEvent<HTMLDivElement>) => {
    onPointerEnter?.(event);
    if (event.pointerType !== "mouse") return;
    // Stryker disable next-line BlockStatement,CallExpression: pointerenter does not come again before pointerleave, which clears the timer
    clearTimeout(intent.current);
    intent.current = setTimeout(() => setHovered(true), PORTHOLE_HOVER_DELAY_MS);
  };
  const leave = (event: PointerEvent<HTMLDivElement>) => {
    onPointerLeave?.(event);
    clearTimeout(intent.current);
    setHovered(false);
  };
  useEffect(
    () => () => clearTimeout(intent.current),
    // Stryker disable next-line ArrayDeclaration: any list that never changes clears the timer once, on leaving the page
    [],
  );

  const item = view.item;
  const action = item?.action !== undefined && onAction !== undefined ? item.action : null;
  const dismissable = item?.dismissable === true && onDismiss !== undefined;

  // The pill's width follows its content, so the change can be eased; the measure writes the style, never state. Where
  // the room is narrower than the content, the line is cut short with an ellipsis (the root carries
  // data-porthole-truncated, and the open lines lead with the whole line), and the room from the spot's start edge to
  // its container's end bounds the open lines (--ouro-porthole-room).
  const pill = useRef<HTMLDivElement>(null);
  const content = useRef<HTMLDivElement>(null);
  const words = useRef<HTMLSpanElement>(null);
  const sizer = useRef<HTMLSpanElement>(null);
  const fit = useCallback(
    () => {
    const box = pill.current!;
    const root = box.parentElement!;
    // The cut is how much wider the whole line (its unseen, unwrapped copy) is than the room the line has. Widths are
    // read unrounded and the pill's rounded up, so a line 196.4px wide gets its room, not 196px and an ellipsis.
    const width = (element: Element) => element.getBoundingClientRect().width;
    const cut = Math.max(0, width(sizer.current!) - width(words.current!.lastElementChild!));
    box.style.width = `${Math.ceil(width(content.current!) + cut) + box.offsetWidth - box.clientWidth}px`;
    root.toggleAttribute("data-porthole-truncated", cut > 0);
    const host = root.parentElement!.getBoundingClientRect();
    const at = root.getBoundingClientRect();
    const room = getComputedStyle(root).direction === "rtl" ? at.right - host.left : host.right - at.left;
    root.style.setProperty("--ouro-porthole-room", `${room}px`);
    },
    // Stryker disable next-line ArrayDeclaration: any list that never changes keeps the one measure
    [],
  );
  useLayoutEffect(fit, [fit, line.text, action?.label, dismissable, open]);
  useLayoutEffect(
    () => {
      const observer = new ResizeObserver(fit);
      observer.observe(content.current!);
      observer.observe(sizer.current!);
      observer.observe(pill.current!.parentElement!.parentElement!);
      return () => observer.disconnect();
    },
    // Stryker disable next-line ArrayDeclaration: fit never changes, so any list that never changes observes once
    [fit],
  );
  // A press anywhere else puts pinned lines away, as a popover's would.
  useEffect(() => {
    // Stryker disable next-line ConditionalExpression: without it the listener only sets pressed to the false it is
    if (!pressed) return;
    const away = (event: Event) => {
      if (!pill.current!.parentElement!.contains(event.target as Node)) setPressed(false);
    };
    document.addEventListener("pointerdown", away, true);
    return () => document.removeEventListener("pointerdown", away, true);
  }, [pressed]);

  // A pressed button that leaves with its item (the service acted on it) hands focus back to the spot rather than
  // the page. React detaches the ref before it removes the button, while focus is still on it.
  const spot = useRef<HTMLButtonElement>(null);
  const hadFocus = useRef(false);
  const leaving = useCallback(
    (node: HTMLButtonElement | null) => () => {
      hadFocus.current = node === document.activeElement;
    },
    // Stryker disable next-line ArrayDeclaration: any list that never changes keeps the ref callback the same
    [],
  );
  useLayoutEffect(() => {
    if (!hadFocus.current) return;
    hadFocus.current = false;
    spot.current!.focus();
  });

  const toneClass = view.state === "error" ? "text-[color-mix(in_oklab,var(--destructive)_80%,var(--foreground))]" : view.state.startsWith("rest") || view.state === "unknown" ? "text-[color-mix(in_oklab,var(--muted-foreground)_88%,var(--foreground))]" : "text-foreground";
  const hushed = quiet !== false && view.state === "rest-fresh" && !open;
  const fadeClass = "whitespace-nowrap transition-opacity duration-(--ouro-duration-base) ease-(--ouro-ease-out) motion-reduce:duration-(--ouro-duration-fast)";

  return (
    <div
      {...rest}
      data-ouro="porthole"
      data-porthole-state={view.state}
      data-open={open ? "" : undefined}
      data-porthole-quiet={hushed ? "" : undefined}
      role="group"
      aria-label={label}
      onKeyDown={close}
      onPointerEnter={enter}
      onPointerLeave={leave}
      className={cn("group/porthole relative inline-flex max-w-full min-w-0 align-middle", className)}
    >
      <div
        ref={pill}
        data-porthole-part="pill"
        className={cn(
          "group/pill inline-flex h-8 max-w-full min-w-0 items-center overflow-hidden rounded-full border border-border bg-card text-sm leading-5 text-card-foreground transition-[width,background-color,border-color] duration-(--ouro-duration-base) ease-(--ouro-ease-out) motion-reduce:transition-none pointer-coarse:h-12",
          // Forced colours would paint the transparent edge, so quiet hushes it in Canvas there and draws it as the words show.
          hushed &&
            "border-transparent bg-transparent focus-within:border-border focus-within:bg-card pointer-fine:hover:border-border pointer-fine:hover:bg-card forced-colors:border-[Canvas] forced-colors:focus-within:border-[CanvasText] forced-colors:pointer-fine:hover:border-[CanvasText]",
        )}
      >
        <div ref={content} className="inline-flex h-full w-max max-w-full min-w-0 items-center">
          <button
            ref={spot}
            type="button"
            data-ouro-control="porthole"
            data-ouro-part="spot"
            data-ax-action={pressed ? "collapse" : "expand"}
            aria-expanded={open}
            aria-controls={open ? panelId : undefined}
            onClick={toggle}
            className={cn(
              "inline-flex h-full min-w-0 cursor-pointer items-center gap-2 rounded-full border-0 bg-transparent ps-3 pe-3 text-start font-[inherit] outline-ring -outline-offset-2 focus-visible:outline-2 focus-visible:outline-solid",
              toneClass,
            )}
          >
            <Light view={view} />
            <span
              ref={words}
              data-porthole-part="words"
              className={cn(
                "relative min-w-0 overflow-hidden transition-opacity duration-(--ouro-duration-base) ease-(--ouro-ease-out) motion-reduce:duration-(--ouro-duration-fast)",
                hushed && "opacity-0 group-focus-within/pill:opacity-100 pointer-fine:group-hover/pill:opacity-100",
              )}
            >
              <span ref={sizer} aria-hidden="true" data-porthole-part="sizer" className="invisible absolute start-0 top-0 whitespace-nowrap">
                {line.text}
              </span>
              {line.previous === null ? null : (
                <span key={`was-${line.turn}`} aria-hidden="true" className={cn("pointer-events-none absolute start-0 top-0 max-w-full truncate opacity-0 starting:opacity-100", fadeClass)}>
                  {line.previous}
                </span>
              )}
              <span key={`is-${line.turn}`} className={cn("block truncate opacity-100", line.turn > 0 && "starting:opacity-0", fadeClass)}>
                {line.text}
              </span>
            </span>
          </button>
          {action === null ? null : (
            // Under forced colours the action keeps its weight in the system highlight. It opts out of forcing, or the
            // label's backplate would hide HighlightText; its focus ring stays a system colour.
            <button
              ref={leaving}
              type="button"
              data-ouro-control="porthole"
              data-ouro-part="act"
              data-ax-action={action.id}
              onClick={() => onAction!(item!, action.id)}
              className="press me-1 inline-flex h-6 shrink-0 cursor-pointer items-center rounded-full border-0 bg-primary px-2.5 font-[inherit] text-xs font-medium text-primary-foreground outline-ring outline-offset-1 focus-visible:outline-2 focus-visible:outline-solid motion-safe:active:scale-(--ouro-press-scale) pointer-coarse:h-11 pointer-coarse:min-w-11 forced-colors:border forced-colors:border-solid forced-colors:border-[Highlight] forced-colors:bg-[Highlight] forced-colors:text-[HighlightText] forced-colors:outline-[CanvasText] forced-colors:forced-color-adjust-none"
            >
              {action.label}
            </button>
          )}
          {dismissable ? (
            <button
              ref={leaving}
              type="button"
              data-ouro-control="porthole"
              data-ouro-part="dismiss"
              data-ax-action="dismiss"
              aria-label={labels?.dismiss ?? "Dismiss"}
              onClick={() => onDismiss!(item!)}
              className="press me-1 inline-flex size-6 shrink-0 cursor-pointer items-center justify-center rounded-full border-0 bg-transparent p-0 text-muted-foreground outline-ring outline-offset-1 focus-visible:outline-2 focus-visible:outline-solid motion-safe:active:scale-(--ouro-press-scale) pointer-fine:hover:bg-muted pointer-coarse:size-11 forced-colors:border forced-colors:border-solid"
            >
              <svg aria-hidden="true" viewBox="0 0 16 16" className="size-3.5" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round">
                <path d="M4 4l8 8M12 4l-8 8" />
              </svg>
            </button>
          ) : null}
        </div>
      </div>
      {open ? (
        <div
          id={panelId}
          data-ouro-part="panel"
          className={cn(
            "absolute start-0 z-10 w-max max-w-[min(24rem,calc(100vw-2rem),var(--ouro-porthole-room,24rem))] min-w-full rounded-2xl bg-popover p-3 text-sm leading-5 text-popover-foreground shadow-(--shadow-lg) ring-1 ring-[color-mix(in_oklab,var(--foreground)_16%,transparent)] transition-opacity forced-colors:border forced-colors:border-solid duration-(--ouro-duration-base) ease-(--ouro-ease-out) starting:opacity-0 motion-reduce:duration-(--ouro-duration-fast)",
            top ? "bottom-full mb-1.5" : "top-full mt-1.5",
            // Opened by a resting mouse alone, the lines let presses through to what they cover.
            !pressed && "pointer-events-none",
          )}
        >
          <ul className="m-0 grid list-none gap-1 p-0">
            <li data-porthole-part="whole-line" className="m-0 hidden font-medium text-pretty group-data-[porthole-truncated]/porthole:list-item">
              {line.text}
            </li>
            {view.detail.map((text, index) => (
              <li key={index} className="m-0 text-pretty">
                {text}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
