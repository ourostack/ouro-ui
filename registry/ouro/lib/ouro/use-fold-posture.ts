"use client";

import { useMemo, useSyncExternalStore } from "react";
import type { OuroFoldHinge, OuroFoldPosture, OuroFoldRegion, OuroFoldRules } from "@/registry/ouro/lib/ouro/fold-posture";
import { resolveFoldPosture } from "@/registry/ouro/lib/ouro/fold-posture";

export type { OuroFoldHostInput };
export { FOLD_INPUT_EVENT, foldInputFromSegments, isFoldHostInput, useFoldHostInput, useFoldPosture, useViewportSegments };

/** What a native host (Apple's `OuroFoldReader`, Android's WindowManager) reports about the fold. */
type OuroFoldHostInput = { hinge: OuroFoldHinge; regions: OuroFoldRegion[] };

/**
 * The event a native host dispatches on `window` to report the fold: `new CustomEvent(FOLD_INPUT_EVENT, { detail })`,
 * with `detail` an {@link OuroFoldHostInput}. The host redispatches it whenever the hinge or the regions change.
 */
const FOLD_INPUT_EVENT = "ouro-fold-input";

function isFoldHinge(value: unknown): value is OuroFoldHinge {
  if (typeof value !== "object" || value === null) return false;
  const kind = (value as { kind?: unknown }).kind;
  if (kind === "none" || kind === "closed" || kind === "fullyOpen") return true;
  return kind === "partiallyOpen" && typeof (value as { angleDegrees?: unknown }).angleDegrees === "number";
}

function isFoldRegion(value: unknown): value is OuroFoldRegion {
  if (typeof value !== "object" || value === null) return false;
  const { frame, isActive } = value as { frame?: unknown; isActive?: unknown };
  if (typeof isActive !== "boolean" || typeof frame !== "object" || frame === null) return false;
  const { x, y, width, height } = frame as Record<string, unknown>;
  return typeof x === "number" && typeof y === "number" && typeof width === "number" && typeof height === "number";
}

/** Checks an unknown value against the {@link FOLD_INPUT_EVENT} detail shape, so a malformed event changes nothing. */
function isFoldHostInput(value: unknown): value is OuroFoldHostInput {
  if (typeof value !== "object" || value === null) return false;
  const { hinge, regions } = value as { hinge?: unknown; regions?: unknown };
  return isFoldHinge(hinge) && Array.isArray(regions) && regions.every(isFoldRegion);
}

/** A segment from `window.visualViewport`'s `segments`, read down to the position and size {@link foldInputFromSegments} needs. */
type OuroViewportSegment = { x: number; y: number; width: number; height: number };

/** `visualViewport` with the Viewport Segments API's `segments`, which the DOM lib types don't carry yet. */
type OuroVisualViewportWithSegments = VisualViewport & { segments?: readonly DOMRectReadOnly[] };

let lastRawSegments: readonly DOMRectReadOnly[] | undefined;
let lastReadSegments: readonly OuroViewportSegment[] | undefined;

function readViewportSegments(): readonly OuroViewportSegment[] | undefined {
  // Stryker disable next-line ConditionalExpression,StringLiteral: every test runs in a browser-like environment
  // with window defined; only a real server, which has no window to read a viewport from, takes this branch.
  /* istanbul ignore if @preserve -- server only, which has no window to read a viewport from */
  if (typeof window === "undefined") return undefined;
  const viewport = window.visualViewport as OuroVisualViewportWithSegments | null;
  const raw = viewport?.segments;
  // useSyncExternalStore requires a cached snapshot: mapping the browser's segments on every read would return a
  // new array every call, even when the browser's own array hasn't changed, and React treats that as an infinite
  // loop. Map again only once the browser's array reference itself changes.
  if (raw !== lastRawSegments) {
    lastRawSegments = raw;
    lastReadSegments = raw?.map((segment) => ({ x: segment.x, y: segment.y, width: segment.width, height: segment.height }));
  }
  return lastReadSegments;
}

function subscribeViewportSegments(onChange: () => void) {
  const viewport = /* istanbul ignore next @preserve -- server only, which has no window to subscribe on */ (
    // Stryker disable next-line ConditionalExpression,StringLiteral: every test runs in a browser-like environment
    // with window defined; only a real server, which has no window to subscribe on, takes the null branch.
    typeof window === "undefined" ? null : window.visualViewport
  );
  if (viewport === null) return () => {};
  viewport.addEventListener("resize", onChange);
  return () => viewport.removeEventListener("resize", onChange);
}

/**
 * Reads `window.visualViewport.segments`, redrawing as a fold changes the segments the browser reports. `undefined`
 * where the browser reports none: without a `visualViewport`, or with one that lacks `segments`.
 *
 * @claim "where the browser reports none" registry/ouro/lib/ouro/use-fold-posture.test.tsx verify:testExists(registry/ouro/lib/ouro/use-fold-posture.test.tsx::useViewportSegments > reads undefined where the browser reports no segments) verify:testExists(registry/ouro/lib/ouro/use-fold-posture.test.tsx::useViewportSegments > reads undefined, and subscribes to nothing, where the browser has no visualViewport)
 *
 * @example
 * const segments = useViewportSegments();
 */
function useViewportSegments(): readonly OuroViewportSegment[] | undefined {
  return useSyncExternalStore(
    subscribeViewportSegments,
    readViewportSegments,
    // Stryker disable next-line ArrowFunction: React calls this only on a real server render, which no test
    // performs; every test hydrates or renders in a browser-like environment, never through this snapshot.
    /* istanbul ignore next @preserve -- the server snapshot never runs in a browser test */
    () => undefined,
  );
}

/**
 * Turns a pair of adjacent {@link OuroViewportSegment}s into the fold region between them, side by side (a
 * vertical, book-style fold) or stacked (a horizontal, tabletop-style fold). `null` for anything else: a lone
 * segment, more than a pair, or a pair that shares neither a row nor a column.
 */
function foldRegionFromSegments(segments: readonly OuroViewportSegment[]): OuroFoldRegion | null {
  if (segments.length !== 2) return null;
  const [first, second] = [...segments].sort((a, b) => a.x - b.x || a.y - b.y) as [OuroViewportSegment, OuroViewportSegment];
  const sameRow = Math.abs(first.y - second.y) < 1 && Math.abs(first.height - second.height) < 1 && second.x >= first.x + first.width;
  if (sameRow) {
    return {
      frame: { x: first.x + first.width, y: first.y, width: second.x - (first.x + first.width), height: first.height },
      isActive: true,
    };
  }
  const sameColumn = Math.abs(first.x - second.x) < 1 && Math.abs(first.width - second.width) < 1 && second.y >= first.y + first.height;
  if (sameColumn) {
    return {
      frame: { x: first.x, y: first.y + first.height, width: first.width, height: second.y - (first.y + first.height) },
      isActive: true,
    };
  }
  return null;
}

/**
 * Turns `window.visualViewport.segments` into an {@link OuroFoldHostInput}, the same shape a native host reports:
 * `{ kind: "fullyOpen" }` with the region between the pair of segments. `null` without a pair to fold between
 * (a lone segment, or a browser without the Viewport Segments API), so {@link useFoldPosture} falls back to the
 * native host's report.
 *
 * @example
 * foldInputFromSegments([{ x: 0, y: 0, width: 400, height: 800 }, { x: 420, y: 0, width: 400, height: 800 }])
 */
function foldInputFromSegments(segments: readonly OuroViewportSegment[] | undefined): OuroFoldHostInput | null {
  if (segments === undefined) return null;
  const region = foldRegionFromSegments(segments);
  return region === null ? null : { hinge: { kind: "fullyOpen" }, regions: [region] };
}

let hostInput: OuroFoldHostInput | null = null;

function subscribeHostInput(onChange: () => void) {
  // Stryker disable next-line ConditionalExpression,StringLiteral: every test runs in a browser-like environment
  // with window defined; only a real server, which has no window to subscribe on, takes this branch.
  /* istanbul ignore if @preserve -- server only, which has no window to subscribe on */
  if (typeof window === "undefined") return () => {};
  const listener = (event: Event) => {
    const detail = (event as CustomEvent<unknown>).detail;
    if (isFoldHostInput(detail)) {
      hostInput = detail;
      onChange();
    }
  };
  window.addEventListener(FOLD_INPUT_EVENT, listener);
  return () => window.removeEventListener(FOLD_INPUT_EVENT, listener);
}

/**
 * Reads the fold input a native host has reported over {@link FOLD_INPUT_EVENT}, or `null` where a host has not
 * reported one yet (a plain browser tab, or a host page before its first report).
 *
 * @example
 * const input = useFoldHostInput();
 */
function useFoldHostInput(): OuroFoldHostInput | null {
  return useSyncExternalStore(
    subscribeHostInput,
    () => hostInput,
    // Stryker disable next-line ArrowFunction: React calls this only on a real server render, which no test
    // performs; every test hydrates or renders in a browser-like environment, never through this snapshot.
    /* istanbul ignore next @preserve -- the server snapshot never runs in a browser test */
    () => null,
  );
}

/**
 * Resolves a container's fold posture from its `size` and whatever fold input is available, calling
 * {@link resolveFoldPosture} again as that input changes. Reads `window.visualViewport.segments` first, where the
 * browser reports one; otherwise falls back to whatever a native host has reported over {@link FOLD_INPUT_EVENT}.
 * Reads as `{ kind: "single" }` until either reports a fold: a plain browser tab, with no segments and outside a
 * host bridge, stays in that posture.
 *
 * @claim "a plain browser tab, with no segments and outside a host bridge, stays in that posture" registry/ouro/lib/ouro/use-fold-posture.test.tsx verify:testExists(registry/ouro/lib/ouro/use-fold-posture.test.tsx::useFoldPosture > resolves to single with no host input)
 *
 * @example
 * const posture = useFoldPosture({ width: 600, height: 800 });
 */
function useFoldPosture(size: { width: number; height: number }, rules?: OuroFoldRules): OuroFoldPosture {
  const segments = useViewportSegments();
  const hostInputValue = useFoldHostInput();
  const input = foldInputFromSegments(segments) ?? hostInputValue;
  return useMemo(
    () =>
      resolveFoldPosture(
        // Stryker disable next-line ConditionalExpression: resolveFoldPosture destructures rules with a default
        // value (`rules = standardFoldRules`), which falls back for an explicit `rules: undefined` exactly as it
        // does for the key's absence; always taking the branch below changes nothing when rules is undefined.
        rules === undefined
          ? {
              size,
              // Stryker disable next-line ObjectLiteral,StringLiteral: this fallback only ever applies once
              // useFoldHostInput's input is null, at which point its regions fallback below is always empty
              // too, so resolveFoldPosture's hinge.kind checks never see an active region to split on; { kind:
              // "none" } and {} (or "none" and "") always resolve to the same single posture here.
              hinge: input?.hinge ?? { kind: "none" },
              regions: input?.regions ?? [],
            }
          : {
              size,
              // Stryker disable next-line ObjectLiteral,StringLiteral: same as the no-rules branch above.
              hinge: input?.hinge ?? { kind: "none" },
              regions: input?.regions ?? [],
              rules,
            },
      ),
    [size, input, rules],
  );
}
