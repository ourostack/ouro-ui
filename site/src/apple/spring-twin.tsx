import { useCallback, useEffect, useRef, useState, type JSX, type PointerEvent as ReactPointerEvent } from "react";
import { Button } from "@/registry/ouro/components/ouro/button/button";
import { Switch } from "@/registry/ouro/components/ouro/switch/switch";
import { spring, springAt, type SpringHandle } from "@/registry/ouro/lib/ouro/spring";
import { useReducedMotion } from "@/registry/ouro/lib/ouro/use-reduced-motion";
import kit from "./kit.json";

/*
 * The web twin of core's spring: the same numbers SwiftUI gets, on HX web's own spring solver, in the browser.
 * SwiftUI's spring(duration:bounce:) is the spring with response = duration and damping ratio = 1 - bounce, which is
 * exactly what spring() in lib/ouro/spring.ts solves, so this is the same equation, not a look-alike. It is still
 * the browser, not SwiftUI, and says so.
 */

/** Core's spring as HX web's solver takes it. */
export const TWIN = { response: kit.spring.visualDuration, damping: 1 - kit.spring.bounce } as const;

const PUCK = 56;

/** The spring's path from 0 to 1 over its settle time, as an SVG path in a 240 × 72 box. */
export function curvePath(samples = 48): string {
  const settle = kit.spring.settle * 1000;
  const points: string[] = [];
  for (let index = 0; index <= samples; index++) {
    const t = (settle * index) / samples;
    const { value } = springAt(0, 1, 0, t, TWIN);
    const x = (240 * index) / samples;
    const y = 64 - value * 52;
    points.push(`${index === 0 ? "M" : "L"}${x.toFixed(1)} ${y.toFixed(2)}`);
  }
  return points.join(" ");
}

export function SpringTwin(): JSX.Element {
  const device = useReducedMotion();
  const [chosen, setChosen] = useState(false);
  const reduced = device || chosen;
  const track = useRef<HTMLDivElement>(null);
  const puck = useRef<HTMLDivElement>(null);
  const handle = useRef<SpringHandle | null>(null);
  const position = useRef(0);
  const [atEnd, setAtEnd] = useState(false);
  const [moving, setMoving] = useState(false);
  const drag = useRef<{ id: number; offset: number; last: number; at: number; velocity: number } | null>(null);

  const span = () => Math.max((track.current?.clientWidth ?? PUCK) - PUCK, 0);
  const place = (value: number) => {
    position.current = value;
    if (puck.current) puck.current.style.transform = `translate3d(${value}px, 0, 0)`;
  };

  // A resize keeps the puck at its end.
  useEffect(() => {
    const element = track.current;
    if (!element || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() => {
      if (!handle.current?.running && !drag.current) place(atEnd ? span() : 0);
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, [atEnd]);
  useEffect(() => () => void handle.current?.stop(), []);

  /** Sends the puck to an end: by spring, or under Reduce Motion by fading out here and in there. */
  const go = useCallback(
    (end: boolean, velocity = 0) => {
      setAtEnd(end);
      const to = end ? span() : 0;
      const element = puck.current;
      if (reduced) {
        handle.current?.stop();
        if (!element) return place(to);
        element.dataset.appleFading = "";
        window.setTimeout(() => {
          place(to);
          delete element.dataset.appleFading;
        }, kit.reducedMotionCrossfade * 500);
        return;
      }
      // Already moving: aim the same spring somewhere new, so it keeps its speed. That is what interruptible means.
      if (handle.current?.running && velocity === 0) {
        handle.current.retarget(to);
        return;
      }
      const from = handle.current?.running ? handle.current.stop() : { value: position.current, velocity };
      setMoving(true);
      handle.current = spring({
        from: from.value,
        to,
        velocity: velocity || from.velocity,
        ...TWIN,
        element,
        reduced: false,
        onUpdate: place,
        onRest: () => setMoving(false),
      });
    },
    [reduced],
  );

  const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (reduced || event.button !== 0) return;
    const state = handle.current?.running ? handle.current.stop() : { value: position.current, velocity: 0 };
    setMoving(false);
    event.currentTarget.setPointerCapture(event.pointerId);
    drag.current = { id: event.pointerId, offset: event.clientX - state.value, last: event.clientX, at: event.timeStamp, velocity: 0 };
  };
  const onPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const state = drag.current;
    if (!state || state.id !== event.pointerId) return;
    const elapsed = Math.max(event.timeStamp - state.at, 1);
    state.velocity = (event.clientX - state.last) / elapsed;
    state.last = event.clientX;
    state.at = event.timeStamp;
    const raw = event.clientX - state.offset;
    const max = span();
    // Past an end it follows at a third, the way a scroll view's edge gives.
    place(raw < 0 ? raw / 3 : raw > max ? max + (raw - max) / 3 : raw);
  };
  const onPointerUp = (event: ReactPointerEvent<HTMLDivElement>) => {
    const state = drag.current;
    if (!state || state.id !== event.pointerId) return;
    drag.current = null;
    // Where a flick would carry it, then the nearer end.
    const projected = position.current + state.velocity * 180;
    go(projected > span() / 2, state.velocity);
  };

  return (
    <div className="apple-twin" data-apple-twin="spring">
      <p className="apple-twin-label">
        <span className="apple-twin-badge">Web twin</span> The same spring, solved in your browser by HX web. Not SwiftUI, and proud of it.
      </p>
      <div
        ref={track}
        className="apple-twin-track"
        onClick={(event) => {
          if (event.target === event.currentTarget) go(!atEnd);
        }}
        aria-hidden="true"
      >
        <span className="apple-twin-stop apple-twin-stop-start" />
        <span className="apple-twin-stop apple-twin-stop-end" />
        <div
          ref={puck}
          className="apple-twin-puck"
          data-moving={moving ? "" : undefined}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
        />
      </div>
      <div className="apple-twin-controls">
        <Button onClick={() => go(!atEnd)}>{atEnd ? "Send it back" : "Send it over"}</Button>
        <Switch
          label="Reduce Motion"
          checked={reduced}
          disabled={device}
          onCheckedChange={setChosen}
          description={device ? "Your device asks for less motion, so this twin only fades." : "Fade instead of moving, as OuroMotion does."}
        />
      </div>
      <p className="apple-twin-help">Drag it, fling it, or press the button twice quickly to catch it mid-flight.</p>
      <figure className="apple-curve">
        <svg viewBox="0 0 240 72" role="img" aria-label="The spring's curve: it rises quickly, overshoots by a hair, and settles.">
          <line x1="0" x2="240" y1="12" y2="12" className="apple-curve-target" />
          <path d={curvePath()} className="apple-curve-line" />
        </svg>
        <figcaption className="apple-curve-caption site-mono">
          response {TWIN.response} s · damping {TWIN.damping.toFixed(2)} · settles in {kit.spring.settle} s
        </figcaption>
      </figure>
    </div>
  );
}
