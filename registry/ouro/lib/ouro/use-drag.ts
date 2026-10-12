"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, type PointerEvent as ReactPointerEvent } from "react";

/** The slowest release, in px/ms, that is a flick: fast enough that its direction decides, however short the drag. */
export const FLICK_VELOCITY = 0.11;

// A release velocity is read from the moves of the last 100ms.
const VELOCITY_WINDOW = 100;

/** Where a drag is. */
export interface DragState {
  /** Movement from the grab point along the axis, in px. 1:1 with the finger; the caller applies `rubberband`. */
  delta: number;
  /** Velocity along the axis in px/ms, from the last 100ms of moves. Its sign is the direction at release; 0 for a finger that rested first. */
  velocity: number;
  /** Whether the velocity is a flick: `Math.abs(velocity) >= FLICK_VELOCITY`. */
  flick: boolean;
  event: PointerEvent;
}

/** What `useDrag` takes. */
export interface DragOptions {
  /** The gesture's axis. */
  axis: "x" | "y";
  /**
   * Movement in px before the axis is chosen and the pointer captured.
   * @default 10
   */
  threshold?: number | undefined;
  /**
   * What a move along the other axis means. `scroll`: it is left to the browser, so the
   * page scrolls, and the gesture is given up when it wins the first `threshold` px.
   * `ignore`: for an element with `touch-action: none`, such as a drag handle, where
   * every touch is the gesture's.
   * @default "scroll"
   */
  crossAxis?: "scroll" | "ignore" | undefined;
  /** Called once the axis is chosen. Stop a running spring here and start from its value. Return false to refuse the drag. */
  onStart?: ((state: DragState) => boolean | void) | undefined;
  /** Called on every move after the start, the move that started it included. */
  onMove: (state: DragState) => void;
  /** Called on release, or on cancel with `cancelled` true. Not called for a press that never became a drag. */
  onEnd: (state: DragState & { cancelled: boolean }) => void;
}

/** The handlers `useDrag` returns, to spread on the element. */
export interface DragProps {
  onPointerDown: (event: ReactPointerEvent<HTMLElement>) => void;
  onPointerMove: (event: ReactPointerEvent<HTMLElement>) => void;
  onPointerUp: (event: ReactPointerEvent<HTMLElement>) => void;
  onPointerCancel: (event: ReactPointerEvent<HTMLElement>) => void;
}

/** A press being followed. */
interface Gesture {
  /** Whether the press has become a drag. */
  started: () => boolean;
  move: (event: PointerEvent) => void;
  end: (event: PointerEvent) => void;
  release: () => void;
}

/**
 * Pointer handlers for a one-axis drag. The element also needs `touch-pan-y` (axis "x")
 * or `touch-pan-x` (axis "y"), or `touch-none` with `crossAxis: "ignore"`.
 *
 * It follows the first pointer only and a mouse's primary button only, ignores a second
 * finger, gives up without capturing when the cross axis wins the first 10px, captures
 * the pointer once the drag has started, and never blocks a new `pointerdown` while a
 * settle is running: stop the spring in `onStart`. The handlers are the same on every
 * render and call the options of the latest one.
 */
export function useDrag(options: DragOptions): DragProps {
  const latest = useRef(options);
  useLayoutEffect(() => {
    latest.current = options;
  });
  const gesture = useRef<Gesture | undefined>(undefined);
  // A component unmounted mid-drag stops listening.
  useEffect(() => () => gesture.current?.release(), []);

  const onPointerDown = useCallback((event: ReactPointerEvent<HTMLElement>) => {
    if (!event.isPrimary || event.button !== 0) return;
    // Once a drag has begun, another press is ignored. A press that never became a drag
    // and whose release went unheard gives way to the next one.
    if (gesture.current?.started()) return;
    gesture.current?.release();
    const element = event.currentTarget;
    const pointer = event.pointerId;
    const horizontal = latest.current.axis === "x";
    const along = (at: PointerEvent) => (horizontal ? at.clientX : at.clientY);
    const across = (at: PointerEvent) => (horizontal ? at.clientY : at.clientX);
    const origin = along(event.nativeEvent);
    const crossOrigin = across(event.nativeEvent);
    let samples = [{ position: origin, time: event.timeStamp }];
    let started = false;
    // The element's handlers and the window's listeners can hear the same event: it counts once.
    let seen: Event = event.nativeEvent;

    const state = (at: PointerEvent): DragState => {
      const recent = samples.filter((sample) => at.timeStamp - sample.time <= VELOCITY_WINDOW);
      const first = recent[0];
      const last = recent.at(-1);
      const velocity = first && last && last.time > first.time ? (last.position - first.position) / (last.time - first.time) : 0;
      return { delta: along(at) - origin, velocity, flick: Math.abs(velocity) >= FLICK_VELOCITY, event: at };
    };
    const release = () => {
      removeEventListener("pointermove", move);
      removeEventListener("pointerup", end);
      removeEventListener("pointercancel", end);
      gesture.current = undefined;
    };
    const move = (moved: PointerEvent) => {
      if (moved.pointerId !== pointer || moved === seen) return;
      seen = moved;
      const { threshold = 10, crossAxis = "scroll", onStart, onMove } = latest.current;
      samples = [...samples.filter((sample) => moved.timeStamp - sample.time <= VELOCITY_WINDOW), { position: along(moved), time: moved.timeStamp }];
      if (!started) {
        const distance = Math.abs(along(moved) - origin);
        const cross = crossAxis === "scroll" ? Math.abs(across(moved) - crossOrigin) : 0;
        if (distance < threshold && cross < threshold) return;
        // The other axis won: the gesture is the browser's, a scroll.
        if (cross >= distance) return release();
        if (onStart?.(state(moved)) === false) return release();
        started = true;
        try {
          element.setPointerCapture(pointer);
        } catch {
          // A pointer the browser no longer has cannot be captured; the window listeners still hear it.
        }
      }
      onMove(state(moved));
    };
    const end = (ended: PointerEvent) => {
      if (ended.pointerId !== pointer || ended === seen) return;
      seen = ended;
      release();
      if (started) latest.current.onEnd({ ...state(ended), cancelled: ended.type === "pointercancel" });
    };
    // Until it is captured, a pointer that leaves the element is heard on the window.
    addEventListener("pointermove", move);
    addEventListener("pointerup", end);
    addEventListener("pointercancel", end);
    gesture.current = { started: () => started, move, end, release };
  }, []);
  const onPointerMove = useCallback((event: ReactPointerEvent<HTMLElement>) => gesture.current?.move(event.nativeEvent), []);
  const onPointerEnd = useCallback((event: ReactPointerEvent<HTMLElement>) => gesture.current?.end(event.nativeEvent), []);
  return useMemo(
    () => ({ onPointerDown, onPointerMove, onPointerUp: onPointerEnd, onPointerCancel: onPointerEnd }),
    [onPointerDown, onPointerMove, onPointerEnd],
  );
}
