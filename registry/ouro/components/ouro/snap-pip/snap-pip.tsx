"use client";

import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type JSX,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
  type Ref,
} from "react";
import {
  anchorFor,
  corners,
  cornerToward,
  DECELERATION,
  defaultCornerLabels,
  FLICK_DAMPING,
  hintClass,
  pipClass,
  RESPONSE,
  sizes,
  widthFor,
  type ArrowKey,
  type SnapPiPCorner,
  type SnapPiPCornerLabels,
  type SnapPiPKeepOut,
  type SnapPiPRect,
  type SnapPiPSize,
} from "@/registry/ouro/components/ouro/snap-pip/snap-pip-styles";
import { announce } from "@/registry/ouro/lib/ouro/announce";
import { useAppearanceClassNameCheck } from "@/registry/ouro/lib/ouro/class-name-check";
import { cn } from "@/registry/ouro/lib/ouro/cn";
import { attachRef } from "@/registry/ouro/lib/ouro/refs";
import { nearest, project, rubberband, spring, type SpringHandle } from "@/registry/ouro/lib/ouro/spring";
import { useDevWarnings } from "@/registry/ouro/lib/ouro/use-dev-messages";
import { FLICK_VELOCITY, useDrag } from "@/registry/ouro/lib/ouro/use-drag";
import { useReducedMotion } from "@/registry/ouro/lib/ouro/use-reduced-motion";

export type { SnapPiPCorner, SnapPiPCornerLabels, SnapPiPKeepOut, SnapPiPRect, SnapPiPSize };

/** Props for {@link SnapPiP}. */
export interface SnapPiPProps {
  /** What the picture is: "Your camera". It names it for screen readers, before its corner and the hint. */
  label: string;
  /** The app's content, such as a `<video>` with `className="size-full object-cover"`, which the app renders itself. */
  children?: ReactNode;
  /**
   * The corner it rests in, controlled. Pass `onCornerChange` too, or a throw comes back to this corner.
   * @claim "Pass `onCornerChange` too, or a throw" registry/ouro/components/ouro/snap-pip/snap-pip.test.tsx verify:testExists(registry/ouro/components/ouro/snap-pip/snap-pip.test.tsx::SnapPiP > follows a controlled corner with the spring, and goes back to it when the app keeps it)
   */
  corner?: SnapPiPCorner | (string & { 'Use "top-left", "top-right", "bottom-left" or "bottom-right"': never }) | undefined;
  /**
   * The corner it starts in, uncontrolled.
   * @default "bottom-right"
   */
  defaultCorner?: SnapPiPCorner | (string & { 'Use "top-left", "top-right", "bottom-left" or "bottom-right"': never }) | undefined;
  /**
   * Called with the new corner when the person throws or moves it there, so the app can remember it.
   * @claim "Called with the new corner when" registry/ouro/components/ouro/snap-pip/snap-pip.test.tsx verify:testExists(registry/ouro/components/ouro/snap-pip/snap-pip.test.tsx::SnapPiP > moves to the next corner that way with Option and an arrow, and announces it once it settles)
   */
  onCornerChange?: ((corner: SnapPiPCorner) => void) | undefined;
  /**
   * Its size, controlled. Small and large widths follow the container's width: under 900px, 160
   * and 240; from 900px, a sixth of it (160 to 320) and twice that, up to a third; from 1800px, 288
   * and 480.
   * @claim "Small and large widths follow the" registry/ouro/components/ouro/snap-pip/snap-pip.test.tsx verify:testExists(registry/ouro/components/ouro/snap-pip/snap-pip.test.tsx::SnapPiP > sizes itself from the container's width, small and large)
   */
  size?: SnapPiPSize | (string & { 'Use "small" or "large"': never }) | undefined;
  /**
   * The size it starts at, uncontrolled.
   * @default "small"
   */
  defaultSize?: SnapPiPSize | (string & { 'Use "small" or "large"': never }) | undefined;
  /**
   * Called with the new size when the person double-clicks it or presses Option-Return on it.
   * @claim "Called with the new size when" registry/ouro/components/ouro/snap-pip/snap-pip.test.tsx verify:testExists(registry/ouro/components/ouro/snap-pip/snap-pip.test.tsx::SnapPiP > toggles small and large on a double-click or Option-Return, controlled or not)
   */
  onSizeChange?: ((size: SnapPiPSize) => void) | undefined;
  /**
   * How far the corners sit in from the container's edges, and from a keep-out, in px.
   * @default 16
   */
  inset?: number | undefined;
  /**
   * What the corners keep clear of: rectangles in the container (`{ x, y, width, height }`, px from
   * its top-left corner), or refs to elements, such as a toolbar's band, a captions band or another
   * SnapPiP, measured whenever they or the container resize. A corner that would overlap one moves
   * just clear of it, toward the middle. When they change, the picture follows its corner with
   * the spring.
   * @claim "A corner that would overlap one" registry/ouro/components/ouro/snap-pip/snap-pip.test.tsx verify:testExists(registry/ouro/components/ouro/snap-pip/snap-pip.test.tsx::SnapPiP > keeps its corners clear of keep-outs, rectangles or elements, and follows them with the spring when they change)
   */
  keepOut?: readonly SnapPiPKeepOut[] | undefined;
  /**
   * Width over height, such as a camera's: 1.6 (16:10), or 0.5625 (9:16) for a phone held upright.
   * @default 1.6
   * @claim "Width over height, such as a" registry/ouro/components/ouro/snap-pip/snap-pip.test.tsx verify:testExists(registry/ouro/components/ouro/snap-pip/snap-pip.test.tsx::SnapPiP > sizes itself from the container's width, small and large)
   */
  aspectRatio?: number | undefined;
  /**
   * How to move it from the keyboard, read after its name and corner and shown on it while it has
   * keyboard focus. Translate it with the rest of your interface.
   * @default "Option-arrow keys to move it"
   */
  hint?: string | undefined;
  /**
   * The words for each corner, read after its name and announced when it settles in a new one.
   * @claim "The words for each corner, read" registry/ouro/components/ouro/snap-pip/snap-pip.test.tsx verify:testExists(registry/ouro/components/ouro/snap-pip/snap-pip.test.tsx::SnapPiP > reads translated corners and hint)
   * @claim "The words for each corner, read" registry/ouro/components/ouro/snap-pip/snap-pip.test.tsx verify:testExists(registry/ouro/components/ouro/snap-pip/snap-pip.test.tsx::SnapPiP > moves to the next corner that way with Option and an arrow, and announces it once it settles)
   * @default { "top-left": "Top left", "top-right": "Top right", "bottom-left": "Bottom left", "bottom-right": "Bottom right" }
   */
  cornerLabels?: SnapPiPCornerLabels | undefined;
  /** Layout only. Appearance classes warn in development; style what you put inside it instead. */
  className?: string | undefined;
  /** The picture's id. */
  id?: string | undefined;
  ref?: Ref<HTMLDivElement> | undefined;

  /** Not a prop. It rests in a corner: `<SnapPiP corner="bottom-right">`. */
  position?: { 'It rests in a corner: <SnapPiP corner="bottom-right">': never };
  /** Not a prop. Ouro UI uses `inset`: `<SnapPiP inset={16}>`. */
  offset?: { "Use <SnapPiP inset={16}>": never };
  /** Not a prop. Ouro UI uses `keepOut`: `<SnapPiP keepOut={[toolbarRef]}>`. */
  avoid?: { "Use <SnapPiP keepOut={[toolbarRef]}>": never };
}

const zero = { x: 0, y: 0 };
const isCorner = (value: unknown): value is SnapPiPCorner => corners.includes(value as SnapPiPCorner);
const isSize = (value: unknown): value is SnapPiPSize => sizes.includes(value as SnapPiPSize);
const arrows: readonly string[] = ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"];

/**
 * A floating picture inside a container, such as the person's own camera in a call, that they drag
 * and throw into a corner, where it comes to rest, as a phone's picture in picture does. Put it in a positioned container (`relative`); it moves within that
 * container's box.
 *
 * It follows the pointer from the first pixel and lifts while held. On release it works out where
 * the throw would coast to (`project`, at scrolling's deceleration of 0.998), picks the corner
 * nearest that point, and springs there from the release speed (response 0.3s; damping 0.8 after
 * a flick, so it overshoots a little, and 1 after a slow drop). Pressing it in flight catches it.
 * Dragged past the container's edge, it resists more and more (`rubberband`).
 *
 * The corners sit `inset` in from the edges and keep clear of `keepOut`. It keeps its corner, not
 * its position: when the keep-outs change it follows its corner with the spring, and while the
 * container resizes it stays in its corner without one. While it springs it carries
 * `data-ouro-settling`.
 *
 * It is focusable: Option and an arrow key move it to the next corner that way, with the same
 * spring, and the new corner is announced politely once it settles, never during the move. Its
 * name, corner and `hint` are what screen readers read, and the hint shows on it while it has
 * keyboard focus. Double-click it, or press Option-Return, to toggle small and large.
 *
 * With reduced motion it jumps straight to its corner: no spring, no lift and no rubberband.
 *
 * Its agent side, `snapPipAx` in `snap-pip-styles.ts`, declares no reads and one action, `move`,
 * which only the person takes: where their own picture sits is theirs.
 *
 * Use `Popover` or `HoverCard` instead for an overlay anchored to a control, `Resizable` for a
 * split layout the person sizes, and `Sheet` for a side panel.
 *
 * @claim "It follows the pointer from the" registry/ouro/components/ouro/snap-pip/snap-pip.test.tsx verify:testExists(registry/ouro/components/ouro/snap-pip/snap-pip.test.tsx::SnapPiP > follows the pointer from the first pixel and lifts while held)
 * @claim "On release it works out where" registry/ouro/components/ouro/snap-pip/snap-pip.test.tsx verify:testExists(registry/ouro/components/ouro/snap-pip/snap-pip.test.tsx::SnapPiP > goes to the corner a flick points at, across the stage, with a little overshoot)
 * @claim "On release it works out where" registry/ouro/components/ouro/snap-pip/snap-pip.test.tsx verify:testExists(registry/ouro/components/ouro/snap-pip/snap-pip.test.tsx::SnapPiP > goes to the nearest corner after a slow drop, with no overshoot)
 * @claim "Pressing it in flight catches it." registry/ouro/components/ouro/snap-pip/snap-pip.test.tsx verify:testExists(registry/ouro/components/ouro/snap-pip/snap-pip.test.tsx::SnapPiP > catches it in flight, holds it under the pointer, and lets it go on when only pressed)
 * @claim "Dragged past the container's edge, it" registry/ouro/components/ouro/snap-pip/snap-pip.test.tsx verify:testExists(registry/ouro/components/ouro/snap-pip/snap-pip.test.tsx::SnapPiP > resists past the container's edges, more the further it goes)
 * @claim "The corners sit `inset` in from" registry/ouro/components/ouro/snap-pip/snap-pip.test.tsx verify:testExists(registry/ouro/components/ouro/snap-pip/snap-pip.test.tsx::SnapPiP > keeps its corners clear of keep-outs, rectangles or elements, and follows them with the spring when they change)
 * @claim "while the container resizes it stays" registry/ouro/components/ouro/snap-pip/snap-pip.test.tsx verify:testExists(registry/ouro/components/ouro/snap-pip/snap-pip.test.tsx::SnapPiP > stays in its corner without a spring while the container resizes)
 * @claim "Option and an arrow key move" registry/ouro/components/ouro/snap-pip/snap-pip.test.tsx verify:testExists(registry/ouro/components/ouro/snap-pip/snap-pip.test.tsx::SnapPiP > moves to the next corner that way with Option and an arrow, and announces it once it settles)
 * @claim "Its name, corner and `hint` are" registry/ouro/components/ouro/snap-pip/snap-pip.test.tsx verify:testExists(registry/ouro/components/ouro/snap-pip/snap-pip.test.tsx::SnapPiP > is a focusable group named by its label, described by its corner and hint, which shows on keyboard focus)
 * @claim "Double-click it, or press Option-Return," registry/ouro/components/ouro/snap-pip/snap-pip.test.tsx verify:testExists(registry/ouro/components/ouro/snap-pip/snap-pip.test.tsx::SnapPiP > toggles small and large on a double-click or Option-Return, controlled or not)
 * @claim "With reduced motion it jumps straight" registry/ouro/components/ouro/snap-pip/snap-pip.test.tsx verify:testExists(registry/ouro/components/ouro/snap-pip/snap-pip.test.tsx::SnapPiP > jumps to its corner with reduced motion, with no lift and no rubberband)
 * @claim "Its agent side, `snapPipAx` in `snap-pip-styles.ts`," registry/ouro/components/ouro/snap-pip/snap-pip.test.tsx verify:testExists(registry/ouro/components/ouro/snap-pip/snap-pip.test.tsx::SnapPiP > declares no agent reads and one move only the person makes, on the picture)
 * @group Layout
 * @see https://ui.ouro.bot/docs/snap-pip
 *
 * @example
 * <div className="relative h-dvh">
 *   <SpeakerStage />
 *   <SnapPiP label="Your camera" corner={corner} onCornerChange={setCorner} keepOut={[toolbarRef]}>
 *     <video ref={selfView} autoPlay muted playsInline className="size-full -scale-x-100 object-cover" />
 *   </SnapPiP>
 * </div>
 */
export function SnapPiP(props: SnapPiPProps): JSX.Element {
  const {
    label,
    children,
    corner: cornerProp,
    defaultCorner = "bottom-right",
    onCornerChange,
    size: sizeProp,
    defaultSize = "small",
    onSizeChange,
    inset = 16,
    keepOut,
    aspectRatio = 16 / 10,
    hint = "Option-arrow keys to move it",
    cornerLabels = defaultCornerLabels,
    className,
    id,
    ref,
    // Guard props (hint types), dropped here so they never reach the DOM.
    position: positionProp,
    offset,
    avoid,
  } = props;
  const reduced = useReducedMotion();
  const [ownCorner, setOwnCorner] = useState<SnapPiPCorner>(isCorner(defaultCorner) ? defaultCorner : "bottom-right");
  const corner = cornerProp === undefined ? ownCorner : isCorner(cornerProp) ? cornerProp : "bottom-right";
  const [ownSize, setOwnSize] = useState<SnapPiPSize>(isSize(defaultSize) ? defaultSize : "small");
  const size = sizeProp === undefined ? ownSize : isSize(sizeProp) ? sizeProp : "small";
  // The container's size once measured; until then CSS places it, as on the server.
  const [stage, setStage] = useState<{ width: number; height: number } | undefined>(undefined);
  // A new object on each release, so a controlled corner the app kept is gone back to.
  const [release, setRelease] = useState({});
  const descriptionId = `${useId()}-description`;

  useAppearanceClassNameCheck(
    "SnapPiP",
    className,
    process.env.NODE_ENV !== "production"
      ? (token: string) => `remove "${token}"; style what you put inside it`
      : // Stryker disable next-line StringLiteral: production only; the check never runs there.
        /* istanbul ignore next @preserve -- production only */ "",
  );
  useDevWarnings(
    "SnapPiP",
    process.env.NODE_ENV !== "production"
      ? () => [
            !label && ["label is required; it names the picture for screen readers", '<SnapPiP label="Your camera">'],
            cornerProp !== undefined && !isCorner(cornerProp) && [`corner="${String(cornerProp)}" is not a corner; use "top-left", "top-right", "bottom-left", "bottom-right"`, '<SnapPiP corner="bottom-right">'],
            !isCorner(defaultCorner) && [`defaultCorner="${String(defaultCorner)}" is not a corner; use "top-left", "top-right", "bottom-left", "bottom-right"`, '<SnapPiP defaultCorner="bottom-right">'],
            sizeProp !== undefined && !isSize(sizeProp) && [`size="${String(sizeProp)}" is not a size; use "small", "large"`, '<SnapPiP size="small">'],
            !isSize(defaultSize) && [`defaultSize="${String(defaultSize)}" is not a size; use "small", "large"`, '<SnapPiP defaultSize="small">'],
            cornerProp !== undefined && !onCornerChange && ["corner is controlled without onCornerChange, so a throw comes back to it", "<SnapPiP corner={corner} onCornerChange={setCorner}>"],
            positionProp !== undefined && ["position is not a prop; it rests in a corner", '<SnapPiP corner="bottom-right">'],
            offset !== undefined && ["offset is not a prop", `<SnapPiP inset={${typeof offset === "number" ? offset : 16}}>`],
            avoid !== undefined && ["avoid is not a prop", "<SnapPiP keepOut={[toolbarRef]}>"],
          ]
      : /* istanbul ignore next @preserve -- production only */ undefined,
  );

  const element = useRef<HTMLDivElement | null>(null);
  // Where it is, in px from the container's top-left corner, and the springs carrying it.
  const at = useRef(zero);
  const springs = useRef<{ x: SpringHandle; y: SpringHandle; to: { x: number; y: number } } | undefined>(undefined);
  // The corner it rests in or is on its way to, and the last one it settled in.
  const target = useRef<SnapPiPCorner>(corner);
  const settled = useRef<SnapPiPCorner>(corner);
  // Whether the person moved it, so the corner it settles in is announced.
  const moved = useRef(false);
  // A drag under way: where it was when the pointer took it.
  const drag = useRef<{ x: number; y: number } | undefined>(undefined);
  const stageRef = useRef(stage);
  // The latest props and measurements, for the callbacks that outlive a render.
  const latest = useRef({ inset, keepOut, reduced, cornerLabels });
  useLayoutEffect(() => {
    stageRef.current = stage;
    latest.current = { inset, keepOut, reduced, cornerLabels };
  });

  const place = useCallback((x: number, y: number) => {
    at.current = { x, y };
    element.current!.style.translate = `${x}px ${y}px`;
  }, []);

  /** The keep-outs as rectangles in the container, elements measured now. */
  const keepRects = useCallback((): SnapPiPRect[] => {
    const container = element.current!.parentElement!;
    const box = container.getBoundingClientRect();
    return (latest.current.keepOut ?? []).flatMap((item): SnapPiPRect[] => {
      if (!("current" in item)) return [item];
      const target = item.current;
      if (!target) return [];
      const rect = target.getBoundingClientRect();
      return [{ x: rect.left - box.left - container.clientLeft, y: rect.top - box.top - container.clientTop, width: rect.width, height: rect.height }];
    });
  }, []);

  const anchor = useCallback(
    (to: SnapPiPCorner) => {
      const pip = element.current!;
      return anchorFor(to, stageRef.current!, { width: pip.offsetWidth, height: pip.offsetHeight }, latest.current.inset, keepRects());
    },
    [keepRects],
  );

  /** Stops the springs where they are, and says how fast it was moving. */
  const halt = useCallback(() => {
    const running = springs.current;
    if (!running) return zero;
    springs.current = undefined;
    element.current!.removeAttribute("data-ouro-settling");
    return { x: running.x.stop().velocity, y: running.y.stop().velocity };
  }, []);

  const rested = useCallback(() => {
    const now = target.current;
    if (moved.current && now !== settled.current) announce(latest.current.cornerLabels[now]);
    moved.current = false;
    settled.current = now;
  }, []);

  /**
   * Takes it to `to`'s place: with the spring from where it is, at `velocity` (or the speed it was
   * moving at), or at once with `jump` and with reduced motion.
   */
  const go = useCallback(
    (to: SnapPiPCorner, { velocity, flick = false, jump = false }: { velocity?: { x: number; y: number }; flick?: boolean; jump?: boolean } = {}) => {
      const speed = halt();
      target.current = to;
      const { x, y } = anchor(to);
      const from = at.current;
      const { x: vx, y: vy } = velocity ?? speed;
      if (jump || latest.current.reduced || (x === from.x && y === from.y && vx === 0 && vy === 0)) {
        place(x, y);
        return rested();
      }
      let moving = 2;
      const done = () => {
        if (--moving > 0) return;
        springs.current = undefined;
        element.current!.removeAttribute("data-ouro-settling");
        rested();
      };
      const options = { response: RESPONSE, damping: flick ? FLICK_DAMPING : 1, reduced: false, onRest: done };
      springs.current = {
        x: spring({ ...options, from: from.x, to: x, velocity: vx, onUpdate: (value) => place(value, at.current.y) }),
        y: spring({ ...options, from: from.y, to: y, velocity: vy, onUpdate: (value) => place(at.current.x, value) }),
        to: { x, y },
      };
      element.current!.setAttribute("data-ouro-settling", "");
    },
    [anchor, halt, place, rested],
  );

  /** Puts it back in its corner's place after a change around it: with the spring, or at once (`jump`). */
  const reflow = useCallback(
    (jump: boolean) => {
      if (!stageRef.current || drag.current) return;
      const { x, y } = anchor(target.current);
      // Already there, or on its way there.
      const goal = springs.current ? springs.current.to : at.current;
      if (x === goal.x && y === goal.y) return;
      go(target.current, { jump });
    },
    [anchor, go],
  );

  // Measures the container, then follows it and its keep-outs as they resize. A container that
  // changed size is a window being resized: the picture keeps to its corner, with no spring.
  const observer = useRef<ResizeObserver | undefined>(undefined);
  const watched = useRef<Element[]>([]);
  useLayoutEffect(() => {
    const container = element.current!.parentElement!;
    const measure = () => ({ width: container.clientWidth, height: container.clientHeight });
    setStage(measure());
    const watching = new ResizeObserver(() => {
      const next = measure();
      const last = stageRef.current!;
      if (next.width !== last.width || next.height !== last.height) setStage(next);
      else reflow(false);
    });
    watching.observe(container);
    observer.current = watching;
    return () => {
      watching.disconnect();
      observer.current = undefined;
      watched.current = [];
    };
  }, [reflow]);
  // The keep-out elements it watches, kept in step with each render's list.
  useLayoutEffect(() => {
    for (const gone of watched.current) observer.current!.unobserve(gone);
    watched.current = (keepOut ?? []).flatMap((item) => ("current" in item && item.current ? [item.current] : []));
    for (const added of watched.current) observer.current!.observe(added);
  });

  // A new size, shape or container size: it stays in its corner, at once.
  useLayoutEffect(() => reflow(true), [stage, size, aspectRatio, reflow]);
  // New keep-outs or a new inset: it follows its corner's new place with the spring.
  const keepKey = JSON.stringify((keepOut ?? []).map((item) => ("current" in item ? null : item)));
  useLayoutEffect(() => reflow(false), [keepKey, inset, reflow]);
  // A corner the app sets, or keeps after a throw: it goes there with the spring.
  useLayoutEffect(() => {
    if (!drag.current && corner !== target.current) go(corner);
  }, [corner, release, go]);
  // Unmounted while it springs, it stops.
  useEffect(() => () => void halt(), [halt]);

  const choose = (next: SnapPiPCorner) => {
    if (next !== corner) {
      setOwnCorner(next);
      onCornerChange?.(next);
    }
    setRelease({});
  };

  const dragProps = useDrag({
    axis: "x",
    crossAxis: "follow",
    threshold: 1,
    onPress: () => {
      // Caught in flight, it holds still under the pointer.
      halt();
      if (!latest.current.reduced) element.current!.setAttribute("data-dragging", "");
    },
    onPressEnd: () => {
      element.current!.removeAttribute("data-dragging");
      // Only pressed: it goes on to its corner, if a press caught it on its way.
      go(target.current);
    },
    onStart: () => {
      drag.current = at.current;
    },
    onMove: ({ delta, crossDelta }) => {
      const pip = element.current!;
      const { width, height } = stageRef.current!;
      // Inside the container 1:1; past an edge, held there with reduced motion, or resisting.
      const follow = (value: number, max: number, dimension: number) => {
        const inside = Math.min(Math.max(value, 0), max);
        return inside + (latest.current.reduced ? 0 : rubberband(value - inside, dimension));
      };
      place(follow(drag.current!.x + delta, width - pip.offsetWidth, pip.offsetWidth), follow(drag.current!.y + crossDelta, height - pip.offsetHeight, pip.offsetHeight));
    },
    onEnd: ({ velocity, crossVelocity, cancelled }) => {
      drag.current = undefined;
      element.current!.removeAttribute("data-dragging");
      if (cancelled) return go(target.current);
      // Where the throw would coast to, and the corner nearest that.
      const { width, height } = stageRef.current!;
      const pip = element.current!;
      const { inset: gap } = latest.current;
      const left = gap;
      const right = width - pip.offsetWidth - gap;
      const top = gap;
      const bottom = height - pip.offsetHeight - gap;
      const horizontal = nearest([left, right], project(at.current.x, velocity, DECELERATION)) === left ? "left" : "right";
      const vertical = nearest([top, bottom], project(at.current.y, crossVelocity, DECELERATION)) === top ? "top" : "bottom";
      const next: SnapPiPCorner = `${vertical}-${horizontal}`;
      moved.current = true;
      go(next, { velocity: { x: velocity, y: crossVelocity }, flick: Math.hypot(velocity, crossVelocity) >= FLICK_VELOCITY });
      choose(next);
    },
  });

  const toggleSize = () => {
    const next = size === "small" ? "large" : "small";
    setOwnSize(next);
    onSizeChange?.(next);
  };

  const onKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (!event.altKey || event.ctrlKey || event.metaKey) return;
    if (event.key === "Enter") {
      event.preventDefault();
      return toggleSize();
    }
    if (!arrows.includes(event.key)) return;
    // Option-arrow is the browser's back and forward in some places: here it moves the picture.
    event.preventDefault();
    const next = cornerToward(target.current, event.key as ArrowKey);
    moved.current = true;
    go(next);
    choose(next);
  };

  const dragRef = dragProps.ref;
  const setRef = useCallback(
    (node: HTMLDivElement) => {
      element.current = node;
      const undoDrag = dragRef(node);
      const undoApp = attachRef(ref, node);
      // The element stays known after it goes, so an effect cleaning up after it can still reach it.
      return () => {
        undoDrag!();
        undoApp();
      };
    },
    [dragRef, ref],
  );

  const right = corner.endsWith("right");
  const bottom = corner.startsWith("bottom");
  // Until it has measured its container, as on the server, CSS puts it in its corner.
  const style: CSSProperties = stage
    ? { left: 0, top: 0, width: widthFor(stage.width, size, inset), aspectRatio }
    : {
        [right ? "right" : "left"]: inset,
        [bottom ? "bottom" : "top"]: inset,
        width: size === "large" ? "clamp(160px, calc(100% / 3), 480px)" : "clamp(160px, calc(100% / 6), 320px)",
        aspectRatio,
      };

  return (
    <div
      ref={setRef}
      id={id}
      role="group"
      tabIndex={0}
      aria-label={label}
      aria-describedby={descriptionId}
      data-ouro="snap-pip"
      data-ouro-control="snap-pip"
      data-ouro-part="pip"
      data-ax-action="move"
      data-corner={corner}
      data-size={size}
      className={cn(pipClass, className)}
      style={style}
      onPointerDown={dragProps.onPointerDown}
      onPointerMove={dragProps.onPointerMove}
      onPointerUp={dragProps.onPointerUp}
      onPointerCancel={dragProps.onPointerCancel}
      onDoubleClick={toggleSize}
      onDragStart={(event) => event.preventDefault()}
      onKeyDown={onKeyDown}
    >
      {children}
      <span id={descriptionId} className="sr-only">
        {`${cornerLabels[corner]}. ${hint}`}
      </span>
      <span aria-hidden="true" className={hintClass}>
        {hint}
      </span>
    </div>
  );
}
