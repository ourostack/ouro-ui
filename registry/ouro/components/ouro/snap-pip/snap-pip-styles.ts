import type { RefObject } from "react";

/** A corner a `SnapPiP` rests in: the screen's corners, the same in either reading direction. */
export type SnapPiPCorner = "top-left" | "top-right" | "bottom-left" | "bottom-right";

/** The sizes a `SnapPiP` toggles between. */
export type SnapPiPSize = "small" | "large";

/** A rectangle in the container, in px from its top-left corner (inside its border). */
export interface SnapPiPRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Something the corners keep clear of: a rectangle in the container, or a ref to an element whose box is measured. */
export type SnapPiPKeepOut = SnapPiPRect | RefObject<Element | null>;

/** The words screen readers hear for a corner when the picture settles in it. */
export type SnapPiPCornerLabels = Record<SnapPiPCorner, string>;

/** The corners. */
export const corners: readonly SnapPiPCorner[] = ["top-left", "top-right", "bottom-left", "bottom-right"];

/** The sizes. */
export const sizes: readonly SnapPiPSize[] = ["small", "large"];

/** The corner words before an app translates them. */
export const defaultCornerLabels: SnapPiPCornerLabels = {
  "top-left": "Top left",
  "top-right": "Top right",
  "bottom-left": "Bottom left",
  "bottom-right": "Bottom right",
};

/** How far a flick coasts: scrolling's deceleration, as `project` takes it. */
export const DECELERATION = 0.998;
/** The spring's response, in seconds. */
export const RESPONSE = 0.3;
/** The spring's damping after a flick: it overshoots a little and settles. */
export const FLICK_DAMPING = 0.8;

/**
 * The picture's width in px for a container `stage` px wide: under 900, 160 small and 240 large;
 * from 900, a sixth of the stage between 160 and 320, and twice that up to a third of the stage;
 * from 1800, 288 and 480. Never wider than the stage less `inset` on each side.
 * @claim "The picture's width in px for" registry/ouro/components/ouro/snap-pip/snap-pip.test.tsx verify:testExists(registry/ouro/components/ouro/snap-pip/snap-pip.test.tsx::SnapPiP > sizes itself from the container's width, small and large)
 * @claim "Never wider than the stage less" registry/ouro/components/ouro/snap-pip/snap-pip.test.tsx verify:testExists(registry/ouro/components/ouro/snap-pip/snap-pip.test.tsx::SnapPiP > sizes itself from the container's width, small and large)
 */
export function widthFor(stage: number, size: SnapPiPSize, inset: number): number {
  let small = 160;
  let large = 240;
  if (stage >= 1800) {
    small = 288;
    large = 480;
  } else if (stage >= 900) {
    small = Math.min(Math.max(stage / 6, 160), 320);
    large = Math.min(small * 2, stage / 3);
  }
  return Math.round(Math.max(Math.min(size === "large" ? large : small, stage - inset * 2), 0));
}

const overlaps = (x: number, y: number, width: number, height: number, rect: SnapPiPRect) =>
  x < rect.x + rect.width && x + width > rect.x && y < rect.y + rect.height && y + height > rect.y;

/**
 * Where a picture `pip` big rests in `corner` of a `stage`: `inset` in from both edges, or, when
 * that overlaps a keep-out, the nearest place that clears every keep-out by `inset`, moving only
 * away from the corner's own edges and staying inside the stage. When nothing clears them all,
 * the corner itself.
 * @claim "Where a picture `pip` big rests" registry/ouro/components/ouro/snap-pip/snap-pip.test.tsx verify:testExists(registry/ouro/components/ouro/snap-pip/snap-pip.test.tsx::SnapPiP > finds each corner's place clear of every keep-out, toward the middle, or keeps the corner when nothing clears)
 * @claim "When nothing clears them all, the" registry/ouro/components/ouro/snap-pip/snap-pip.test.tsx verify:testExists(registry/ouro/components/ouro/snap-pip/snap-pip.test.tsx::SnapPiP > finds each corner's place clear of every keep-out, toward the middle, or keeps the corner when nothing clears)
 */
export function anchorFor(
  corner: SnapPiPCorner,
  stage: { width: number; height: number },
  pip: { width: number; height: number },
  inset: number,
  keepOut: readonly SnapPiPRect[],
): { x: number; y: number } {
  const right = corner.endsWith("right");
  const bottom = corner.startsWith("bottom");
  const x = right ? stage.width - pip.width - inset : inset;
  const y = bottom ? stage.height - pip.height - inset : inset;
  // Each place that clears one keep-out on one axis, toward the middle of the stage.
  const xs = [x, ...keepOut.map((rect) => (right ? rect.x - inset - pip.width : rect.x + rect.width + inset))].filter(
    (at) => (right ? at <= x : at >= x) && at >= 0 && at <= stage.width - pip.width,
  );
  const ys = [y, ...keepOut.map((rect) => (bottom ? rect.y - inset - pip.height : rect.y + rect.height + inset))].filter(
    (at) => (bottom ? at <= y : at >= y) && at >= 0 && at <= stage.height - pip.height,
  );
  let best = { x, y };
  let distance = Infinity;
  for (const atY of ys) {
    for (const atX of xs) {
      const moved = Math.hypot(atX - x, atY - y);
      if (moved < distance && !keepOut.some((rect) => overlaps(atX, atY, pip.width, pip.height, rect))) {
        best = { x: atX, y: atY };
        distance = moved;
      }
    }
  }
  return best;
}

/** The arrow keys that move the picture with Option. */
export type ArrowKey = "ArrowLeft" | "ArrowRight" | "ArrowUp" | "ArrowDown";

/** The corner an Option-arrow key moves to from `corner`: the same corner when it is already on that side. */
export function cornerToward(corner: SnapPiPCorner, key: ArrowKey): SnapPiPCorner {
  const [vertical, horizontal] = corner.split("-") as ["top" | "bottom", "left" | "right"];
  if (key === "ArrowLeft") return `${vertical}-left`;
  if (key === "ArrowRight") return `${vertical}-right`;
  if (key === "ArrowUp") return `top-${horizontal}`;
  return `bottom-${horizontal}`;
}

/**
 * The corner whose place is nearest `point`, a place the picture could be in: each corner's place
 * as `anchorFor` finds it, clear of the keep-outs, so the line between two corners falls halfway
 * between where the picture would rest in each.
 * @claim "The corner whose place is nearest" registry/ouro/components/ouro/snap-pip/snap-pip.test.tsx verify:testExists(registry/ouro/components/ouro/snap-pip/snap-pip.test.tsx::SnapPiP > picks the corner whose place, clear of the keep-outs, is nearest)
 */
export function nearestCorner(
  point: { x: number; y: number },
  stage: { width: number; height: number },
  pip: { width: number; height: number },
  inset: number,
  keepOut: readonly SnapPiPRect[],
): SnapPiPCorner {
  const away = (corner: SnapPiPCorner) => {
    const place = anchorFor(corner, stage, pip, inset, keepOut);
    return Math.hypot(place.x - point.x, place.y - point.y);
  };
  return corners.reduce((best, corner) => (away(corner) < away(best) ? corner : best));
}

/**
 * The picture's classes: a raised surface with a faint light hairline for a dark stage, which
 * lifts while dragged and has no motion of its own under reduced motion. Its place is a
 * `translate` it sets itself from what it measures.
 * @claim "The picture's classes: a raised surface" registry/ouro/components/ouro/snap-pip/snap-pip.test.tsx verify:testExists(registry/ouro/components/ouro/snap-pip/snap-pip.test.tsx::SnapPiP > follows the pointer from the first pixel and lifts while dragged)
 * @claim "The picture's classes: a raised surface" registry/ouro/components/ouro/snap-pip/snap-pip.test.tsx verify:testExists(registry/ouro/components/ouro/snap-pip/snap-pip.test.tsx::SnapPiP > jumps to its corner with reduced motion, with no lift and no rubberband)
 */
export const pipClass = [
  "absolute isolate box-border touch-none rounded-xl bg-muted text-foreground select-none data-dragging:cursor-grabbing",
  "shadow-(--shadow-lg) ring-1 ring-white/10 data-dragging:shadow-(--shadow-2xl)",
  "motion-safe:transition-[scale,box-shadow] motion-safe:duration-(--ouro-duration-fast) motion-safe:ease-(--ouro-ease-out) motion-safe:data-dragging:scale-[1.04]",
  "outline-ring outline-offset-2 focus-visible:outline-2 focus-visible:outline-solid",
  "forced-colors:border forced-colors:border-solid",
  "[&_img]:pointer-events-none [&_video]:pointer-events-none",
].join(" ");

/** The frame that clips the app's content to the picture's rounded corners. */
export const frameClass = "block size-full overflow-hidden rounded-[inherit]";

/**
 * The hint's place beside the picture: above it in a bottom corner and below it in a top one, so
 * it never covers the picture. Its padding bridges the gap, so the pointer can move onto it
 * without it closing. The component lines it up with the picture's outer edge.
 */
export const hintClass = [
  "pointer-events-none absolute z-10 w-max max-w-80 opacity-0",
  "motion-safe:transition-opacity motion-safe:duration-(--ouro-duration-fast) motion-safe:ease-(--ouro-ease-out)",
  "data-[side=bottom]:top-full data-[side=bottom]:pt-2 data-[side=top]:bottom-full data-[side=top]:pb-2",
  "data-open:pointer-events-auto data-open:opacity-100",
].join(" ");

/** The hint itself: one quiet line, as a tooltip is. */
export const hintTextClass =
  "block rounded-md bg-foreground px-2 py-1 text-xs leading-4 text-balance text-background forced-colors:border forced-colors:border-solid";

/** How long the pointer rests on the picture before the hint shows, in ms: a tooltip's delay. */
export const HINT_DELAY = 600;

/**
 * SnapPiP's agent side, for Ouro AX's kit. It declares no reads, and one action, `move`, which only
 * the person takes: where their own picture sits is theirs. The picture carries
 * `data-ax-action="move"`.
 *
 * @example
 * snapPipAx.actions[0].id; // "move"
 * @claim "It declares no reads, and one" registry/ouro/components/ouro/snap-pip/snap-pip.test.tsx verify:testExists(registry/ouro/components/ouro/snap-pip/snap-pip.test.tsx::SnapPiP > declares no agent reads and one move only the person makes, on the picture)
 */
// TODO(ourostack/ouro-ui ax/component): wrap with defineComponentAx once it lands
export const snapPipAx = {
  component: "SnapPiP",
  reads: [],
  actions: [
    {
      id: "move",
      summary: "Move the person's own picture to another corner.",
      effect: "private",
      personOnly: "You can't move the person's own picture; only they can.",
    },
  ],
} as const;
