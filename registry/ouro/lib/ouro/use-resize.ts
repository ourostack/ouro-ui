"use client";

import { useCallback, useLayoutEffect, useRef, useState, type HTMLAttributes, type KeyboardEvent, type PointerEvent as ReactPointerEvent } from "react";

/** What a resizable edge reads about its box when it needs to know, in px. */
export interface ResizeRange {
  /** The floor: the box may not be shorter. */
  least: number;
  /** The ceiling: the box may not be taller. */
  most: number;
  /** The size of one step: a line of text, for a text box. The arrow keys move by one, and a drag lands on one. */
  step: number;
  /** The size the box has beside its steps (its padding and border, for a text box), so a step lands on whole lines. */
  offset: number;
  /** The box's size now. */
  now: number;
}

/** What {@link useResize} takes. */
export interface ResizeOptions {
  /** What the edge is called, read aloud as its name: "Resize the reply box". */
  label: string;
  /** Measures the box. Called when a press or a key starts, and when the edge takes focus. */
  read: () => ResizeRange;
  /** Sets the box to `px`. `settled` is false while a drag is under way, and true once a key or the release has landed it. */
  onResize: (px: number, settled: boolean) => void;
  /**
   * Which way the box grows when the edge is dragged away from it: `up` for an edge along the top of the box, `down` for one along its bottom.
   * @default "up"
   */
  grow?: "up" | "down" | undefined;
}

/** What {@link useResize} gives back. */
export interface Resize {
  /** Spread these on the edge's element: the role, name, values, tab stop and the pointer and key handlers. */
  props: HTMLAttributes<HTMLElement> & { "data-ouro-edge": "focus" | "drag" | undefined; "data-dragging": "" | undefined };
  /** Whether a drag is under way. */
  dragging: boolean;
}

/** The size on the steps' grid at or under `px`, kept between the floor and the ceiling. */
function snap(px: number, r: ResizeRange): number {
  const fit = Math.min(Math.max(px, r.least), r.most);
  if (r.step <= 0) return fit;
  const to = Math.round(r.offset + Math.floor((fit - r.offset) / r.step + 0.01) * r.step);
  return Math.min(Math.max(to, r.least), r.most);
}

/**
 * A resizable edge you can drag and also reach with the keyboard: it is a separator that takes focus, with its values in px.
 * A press starts the drag at once, and the box follows the pointer in whole steps. ArrowUp and
 * ArrowDown move it a step (ArrowUp grows an edge along the top), Home takes it to the floor and End to the ceiling.
 * Nothing animates: the box is at its new size at once. Spread `props` on the edge's element and give it a position and size.
 *
 * Use `Composer` with `resizable` for a message box. Use `ResizableHandle` instead when the edge sits between two panels
 * that share a space. Use this when an app's own box needs the same edge.
 *
 * @example
 * const { props } = useResize({ label: "Resize the box", read: () => ({ least: 80, most: 400, step: 20, offset: 0, now: height }), onResize: (px) => setHeight(px) });
 * return <div {...props} className="absolute inset-x-0 -top-1 h-2" />;
 */
export function useResize({ label, read, onResize, grow = "up" }: ResizeOptions): Resize {
  const sign = grow === "up" ? 1 : -1;
  const drag = useRef<{ id: number; y: number; range: ResizeRange; last: number } | null>(null);
  const [values, setValues] = useState<ResizeRange | null>(null);
  const [focus, setFocus] = useState(false);
  const [dragging, setDragging] = useState(false);
  const latest = useRef({ read, onResize });
  useLayoutEffect(() => {
    latest.current = { read, onResize };
  });
  const refresh = useCallback(() => setValues(latest.current.read()), []);
  // The edge says its values from the start, and again each time it takes focus and each time it moves the box.
  useLayoutEffect(refresh, [refresh]);
  const land = (px: number, settled: boolean) => {
    latest.current.onResize(px, settled);
    if (settled) refresh();
  };
  const props: Resize["props"] = {
    role: "separator",
    "aria-orientation": "horizontal",
    "aria-label": label,
    "aria-valuemin": values?.least,
    "aria-valuemax": values?.most,
    "aria-valuenow": values?.now,
    tabIndex: 0,
    "data-ouro-edge": dragging ? "drag" : focus ? "focus" : undefined,
    "data-dragging": dragging ? "" : undefined,
    onFocus: (event) => {
      refresh();
      setFocus(event.currentTarget.matches(":focus-visible"));
    },
    onBlur: () => setFocus(false),
    onPointerDown: (event: ReactPointerEvent<HTMLElement>) => {
      if (event.button !== 0) return;
      event.preventDefault();
      event.currentTarget.focus({ preventScroll: true });
      const range = latest.current.read();
      drag.current = { id: event.pointerId, y: event.clientY, range, last: range.now };
      event.currentTarget.setPointerCapture(event.pointerId);
      setDragging(true);
    },
    onPointerMove: (event: ReactPointerEvent<HTMLElement>) => {
      const d = drag.current;
      if (d?.id !== event.pointerId) return;
      const to = snap(d.range.now + sign * (d.y - event.clientY), d.range);
      if (to === d.last) return;
      d.last = to;
      land(to, false);
    },
    onPointerUp: (event: ReactPointerEvent<HTMLElement>) => {
      const d = drag.current;
      if (d?.id !== event.pointerId) return;
      drag.current = null;
      setDragging(false);
      land(snap(d.range.now + sign * (d.y - event.clientY), d.range), true);
    },
    onPointerCancel: (event: ReactPointerEvent<HTMLElement>) => {
      const d = drag.current;
      if (d?.id !== event.pointerId) return;
      drag.current = null;
      setDragging(false);
      land(d.range.now, true);
    },
    onKeyDown: (event: KeyboardEvent<HTMLElement>) => {
      if (event.altKey || event.ctrlKey || event.metaKey) return;
      const range = latest.current.read();
      const toward = event.key === "ArrowUp" ? sign : event.key === "ArrowDown" ? -sign : 0;
      let to: number;
      if (toward !== 0) to = snap(range.now + toward * range.step, range);
      else if (event.key === "Home") to = range.least;
      else if (event.key === "End") to = snap(range.most, range);
      else return;
      event.preventDefault();
      land(to, true);
    },
  };
  return { props, dragging };
}
