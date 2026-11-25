"use client";

import { useMemo, useSyncExternalStore } from "react";
import type { OuroFoldHinge, OuroFoldPosture, OuroFoldRegion, OuroFoldRules } from "@/registry/ouro/lib/ouro/fold-posture";
import { resolveFoldPosture } from "@/registry/ouro/lib/ouro/fold-posture";

export type { OuroFoldHostInput };
export { FOLD_INPUT_EVENT, isFoldHostInput, useFoldHostInput, useFoldPosture };

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

let hostInput: OuroFoldHostInput | null = null;

function subscribeHostInput(onChange: () => void) {
  // Stryker disable next-line ConditionalExpression,StringLiteral: every test runs in a browser-like environment
  // with window defined; only a real server, which has no window to subscribe on, takes this branch.
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
    () => null,
  );
}

/**
 * Resolves a container's fold posture from its `size` and whatever fold input a native host has reported, calling
 * {@link resolveFoldPosture} again as the host's report changes. Reads as `{ kind: "single" }` until a host reports
 * a hinge: a plain browser tab, outside a host bridge, stays in that posture.
 *
 * @example
 * const posture = useFoldPosture({ width: 600, height: 800 });
 */
function useFoldPosture(size: { width: number; height: number }, rules?: OuroFoldRules): OuroFoldPosture {
  const input = useFoldHostInput();
  return useMemo(
    () =>
      resolveFoldPosture(
        rules === undefined
          ? { size, hinge: input?.hinge ?? { kind: "none" }, regions: input?.regions ?? [] }
          : { size, hinge: input?.hinge ?? { kind: "none" }, regions: input?.regions ?? [], rules },
      ),
    [size, input, rules],
  );
}
