export type { OuroFoldHinge, OuroFoldRect, OuroFoldRegion, OuroFoldRules, OuroFoldSplit, OuroFoldPosture };
export { foldBend, resolveFoldPosture, standardFoldRules };

/**
 * A foldable's hinge, as the host (or, once browsers add one, the Viewport Segments API) reports it.
 *
 * @group App setup
 */
type OuroFoldHinge =
  | { kind: "none" }
  | { kind: "closed" }
  /** Bent somewhere between shut and lying flat. */
  | { kind: "partiallyOpen"; angleDegrees: number }
  | { kind: "fullyOpen" };

/** A rectangle in the container's own coordinates, independent of any DOM type. */
type OuroFoldRect = { x: number; y: number; width: number; height: number };

/** A reserved region where the screen folds, in the container's coordinates. */
type OuroFoldRegion = {
  frame: OuroFoldRect;
  /** The host marks the fold inactive while the device lies open flat; it still marks where the pages meet. */
  isActive: boolean;
};

/** A pane on either side of the fold. */
type OuroFoldSplit = {
  /** The top pane (tabletop) or the leading pane (book). */
  first: OuroFoldRect;
  /** The band nothing tappable or readable may sit on, margins included. */
  fold: OuroFoldRect;
  /** The bottom pane (tabletop) or the trailing pane (book). */
  second: OuroFoldRect;
  /** `"hardware"` when the host reported the fold; `"screenMiddle"` when the hinge is bent without a reported region, so the split falls at the middle. */
  source: "hardware" | "screenMiddle";
};

/** How a container should lay out for the way a foldable is held. */
type OuroFoldPosture =
  | { kind: "single" }
  | { kind: "closed" }
  /** Held tall and bent like a small laptop, or open with an active horizontal fold: content above, controls below. */
  | { kind: "tabletop"; split: OuroFoldSplit }
  /** Held wide with a vertical fold, active or not: facing pages. */
  | { kind: "book"; split: OuroFoldSplit };

/** The numbers {@link resolveFoldPosture} uses. The defaults are Spoonjoy's, which shipped on the iPhone Duo. */
type OuroFoldRules = {
  /** The shortest a pane may be; below it the posture falls back to one page. */
  minimumPaneLength: number;
  /** Clear space on each side of the fold's centre line. A reported fold wider than this keeps its width. */
  foldMargin: number;
  /** The bends that stand up as a tabletop: under the low bound is too shallow to stand on, and from the high bound the screen lies flat. */
  tabletopAngles: readonly [low: number, high: number];
};

const standardFoldRules: OuroFoldRules = { minimumPaneLength: 260, foldMargin: 24, tabletopAngles: [60, 150] };

/** A fraction of how deep a spine shadow should be, growing as the hinge bends. An effect, not a layout input. */
function foldBend(hinge: OuroFoldHinge): number {
  if (hinge.kind !== "partiallyOpen") return 0;
  return Math.min(1, Math.max(0, (180 - hinge.angleDegrees) / 90));
}

function isVertical(region: OuroFoldRegion): boolean {
  return region.frame.height > region.frame.width;
}

function intersects(a: OuroFoldRect, b: OuroFoldRect): boolean {
  return a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
}

function inTabletopAngles(angle: number, [low, high]: readonly [number, number]): boolean {
  return angle >= low && angle < high;
}

function split(
  bounds: { width: number; height: number },
  axis: "horizontal" | "vertical",
  centre: number,
  thickness: number,
  source: OuroFoldSplit["source"],
  rules: OuroFoldRules,
): OuroFoldSplit | null {
  const band = Math.max(thickness, rules.foldMargin * 2);
  const length = axis === "horizontal" ? bounds.height : bounds.width;
  const start = Math.max(0, centre - band / 2);
  const end = Math.min(length, centre + band / 2);
  if (start < rules.minimumPaneLength || length - end < rules.minimumPaneLength) return null;
  return axis === "horizontal"
    ? {
        first: { x: 0, y: 0, width: bounds.width, height: start },
        fold: { x: 0, y: start, width: bounds.width, height: end - start },
        second: { x: 0, y: end, width: bounds.width, height: length - end },
        source,
      }
    : {
        first: { x: 0, y: 0, width: start, height: bounds.height },
        fold: { x: start, y: 0, width: end - start, height: bounds.height },
        second: { x: end, y: 0, width: length - end, height: bounds.height },
        source,
      };
}

/**
 * The posture for a container of `size`, given the hinge and the fold regions the host (or the Viewport Segments
 * API) reports. Pure, with `fold-posture.test.ts` exercising its postures; ported from Ouro HX for Apple's `OuroFoldPosture.resolve`,
 * which generalizes Spoonjoy's `TabletopLayout` and `FoldRegionChoice`.
 *
 * @example
 * resolveFoldPosture({ size: { width: 600, height: 800 }, hinge: { kind: "partiallyOpen", angleDegrees: 100 }, regions: [] })
 */
function resolveFoldPosture(options: {
  size: { width: number; height: number };
  hinge: OuroFoldHinge;
  regions: readonly OuroFoldRegion[];
  rules?: OuroFoldRules;
}): OuroFoldPosture {
  const { size, hinge, regions, rules = standardFoldRules } = options;
  if (hinge.kind === "closed") return { kind: "closed" };
  const bounds = { x: 0, y: 0, width: size.width, height: size.height };
  // A region can be reported for another window or screen; a zero-width fold still counts when it lies inside.
  const inside = regions.filter((region) =>
    intersects(bounds, { x: region.frame.x - 0.5, y: region.frame.y - 0.5, width: region.frame.width + 1, height: region.frame.height + 1 }),
  );
  const ordered = [...inside.filter((region) => region.isActive), ...inside.filter((region) => !region.isActive)];

  if (size.width > size.height) {
    const fold = ordered.find((region) => isVertical(region) && region.frame.height >= size.height / 2);
    if (fold) {
      const result = split(bounds, "vertical", fold.frame.x + fold.frame.width / 2, fold.frame.width, "hardware", rules);
      return result ? { kind: "book", split: result } : { kind: "single" };
    }
  } else if (size.height > size.width) {
    const bent = hinge.kind === "partiallyOpen" && inTabletopAngles(hinge.angleDegrees, rules.tabletopAngles);
    // Bent, the fold's real position wins even when the region is inactive (the Duo reports it inactive whether
    // flat or half open). Not bent, only an active fold splits the screen.
    const fold = ordered.find((region) => (region.isActive || bent) && !isVertical(region) && region.frame.width >= size.width / 2);
    if (fold) {
      const result = split(bounds, "horizontal", fold.frame.y + fold.frame.height / 2, fold.frame.height, "hardware", rules);
      return result ? { kind: "tabletop", split: result } : { kind: "single" };
    }
    if (bent) {
      const result = split(bounds, "horizontal", bounds.height / 2, 0, "screenMiddle", rules);
      return result ? { kind: "tabletop", split: result } : { kind: "single" };
    }
  }
  return { kind: "single" };
}
