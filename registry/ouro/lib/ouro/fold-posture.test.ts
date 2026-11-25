import { describe, expect, it } from "vitest";
import { foldBend, resolveFoldPosture, type OuroFoldRegion } from "@/registry/ouro/lib/ouro/fold-posture";

const tall = { width: 600, height: 800 };
const wide = { width: 800, height: 600 };

function region(x: number, y: number, width: number, height: number, isActive: boolean): OuroFoldRegion {
  return { frame: { x, y, width, height }, isActive };
}

describe("resolveFoldPosture", () => {
  it("has no hinge is one page", () => {
    expect(resolveFoldPosture({ size: tall, hinge: { kind: "none" }, regions: [] })).toEqual({ kind: "single" });
    expect(resolveFoldPosture({ size: { width: 1200, height: 800 }, hinge: { kind: "none" }, regions: [] })).toEqual({ kind: "single" });
  });

  it("is closed when the hinge is closed", () => {
    expect(resolveFoldPosture({ size: tall, hinge: { kind: "closed" }, regions: [region(0, 399, 600, 2, true)] })).toEqual({ kind: "closed" });
  });

  it("stands an active horizontal fold as a tabletop", () => {
    const posture = resolveFoldPosture({ size: tall, hinge: { kind: "partiallyOpen", angleDegrees: 100 }, regions: [region(0, 390, 600, 20, true)] });
    expect(posture.kind).toBe("tabletop");
    if (posture.kind !== "tabletop") throw new Error("expected tabletop");
    // A 20 pt fold widens to the 48 pt margin band, centred.
    expect(posture.split.source).toBe("hardware");
    expect(posture.split.fold).toEqual({ x: 0, y: 376, width: 600, height: 48 });
    expect(posture.split.first).toEqual({ x: 0, y: 0, width: 600, height: 376 });
    expect(posture.split.second).toEqual({ x: 0, y: 424, width: 600, height: 376 });
  });

  it("uses an inactive fold's real position when the hinge is bent", () => {
    const posture = resolveFoldPosture({ size: tall, hinge: { kind: "partiallyOpen", angleDegrees: 100 }, regions: [region(0, 380, 600, 2, false)] });
    if (posture.kind !== "tabletop") throw new Error("expected tabletop");
    expect(posture.split.source).toBe("hardware");
    expect(posture.split.fold.y + posture.split.fold.height / 2).toBe(381);
  });

  it("stays a tabletop between the tabletop band and flat", () => {
    expect(resolveFoldPosture({ size: tall, hinge: { kind: "partiallyOpen", angleDegrees: 145 }, regions: [] }).kind).toBe("tabletop");
    expect(resolveFoldPosture({ size: tall, hinge: { kind: "partiallyOpen", angleDegrees: 150 }, regions: [] })).toEqual({ kind: "single" });
  });

  it("is not a tabletop for an inactive horizontal fold with no bend", () => {
    expect(resolveFoldPosture({ size: tall, hinge: { kind: "fullyOpen" }, regions: [region(0, 399, 600, 2, false)] })).toEqual({ kind: "single" });
  });

  it("splits at the middle when the hinge is bent with no region", () => {
    const posture = resolveFoldPosture({ size: tall, hinge: { kind: "partiallyOpen", angleDegrees: 90 }, regions: [] });
    if (posture.kind !== "tabletop") throw new Error("expected tabletop");
    expect(posture.split.source).toBe("screenMiddle");
    expect(posture.split.fold).toEqual({ x: 0, y: 376, width: 600, height: 48 });
    // Too shallow a bend to stand on, or no angle while fully open: one page.
    expect(resolveFoldPosture({ size: tall, hinge: { kind: "partiallyOpen", angleDegrees: 40 }, regions: [] })).toEqual({ kind: "single" });
    expect(resolveFoldPosture({ size: tall, hinge: { kind: "partiallyOpen", angleDegrees: 160 }, regions: [] })).toEqual({ kind: "single" });
    expect(resolveFoldPosture({ size: tall, hinge: { kind: "fullyOpen" }, regions: [] })).toEqual({ kind: "single" });
  });

  it("opens a book for a vertical fold even when inactive", () => {
    const posture = resolveFoldPosture({ size: wide, hinge: { kind: "fullyOpen" }, regions: [region(399, 0, 2, 600, false)] });
    if (posture.kind !== "book") throw new Error("expected book");
    expect(posture.split.source).toBe("hardware");
    expect(posture.split.fold).toEqual({ x: 376, y: 0, width: 48, height: 600 });
    expect(posture.split.first).toEqual({ x: 0, y: 0, width: 376, height: 600 });
    expect(posture.split.second).toEqual({ x: 424, y: 0, width: 376, height: 600 });
  });

  it("does not call a square region (height equal to width) vertical", () => {
    // Square (300x300) and sized and centred so a book split would succeed if it were wrongly called vertical;
    // real code must never search for a fold here, or this would stand up as a book instead.
    expect(
      resolveFoldPosture({ size: { width: 1200, height: 600 }, hinge: { kind: "fullyOpen" }, regions: [region(450, 150, 300, 300, true)] }),
    ).toEqual({ kind: "single" });
  });

  it("stays one page for a square container, which is neither wider nor taller", () => {
    // A region that would stand up as a book if the container's own width-vs-height guard read ">=" at the
    // boundary; real code must never enter that branch for a square container.
    expect(
      resolveFoldPosture({ size: { width: 700, height: 700 }, hinge: { kind: "fullyOpen" }, regions: [region(345, 150, 10, 400, true)] }),
    ).toEqual({ kind: "single" });
  });

  it("stays one page for a square container, on the tabletop side's guard too", () => {
    // A horizontal, active region wide and centred enough to stand up as a tabletop if the container's own
    // height-vs-width guard read ">=" (or were forced true) at the boundary; real code must never enter that
    // branch for a square container.
    expect(
      resolveFoldPosture({ size: { width: 700, height: 700 }, hinge: { kind: "fullyOpen" }, regions: [region(150, 345, 400, 10, true)] }),
    ).toEqual({ kind: "single" });
  });

  it("ignores a region that only touches the container's edge, on each side", () => {
    // Each region sits exactly on the boundary the padded intersects() check draws on the axis that does not
    // drive the resulting split, so inclusion is the only thing that can change the outcome; a hair further in
    // and it would count. The x-boundary pair uses the tall (tabletop) container, whose result depends only on
    // y; the y-boundary pair uses the wide (book) container, whose result depends only on x.
    expect(resolveFoldPosture({ size: tall, hinge: { kind: "fullyOpen" }, regions: [region(-10.5, 382, 10, 20, true)] })).toEqual({ kind: "single" });
    expect(resolveFoldPosture({ size: tall, hinge: { kind: "fullyOpen" }, regions: [region(600.5, 382, 10, 20, true)] })).toEqual({ kind: "single" });
    expect(resolveFoldPosture({ size: wide, hinge: { kind: "fullyOpen" }, regions: [region(399, -600.5, 2, 600, true)] })).toEqual({ kind: "single" });
    expect(resolveFoldPosture({ size: wide, hinge: { kind: "fullyOpen" }, regions: [region(399, 600.5, 2, 600, true)] })).toEqual({ kind: "single" });
  });

  it("requires a vertical fold's own pane to reach halfway before standing a book up", () => {
    // Vertical, but short of size.height / 2: a wide-enough split would still succeed if the height guard were
    // skipped, so this isolates the guard rather than the split succeeding or failing on its own.
    expect(resolveFoldPosture({ size: wide, hinge: { kind: "fullyOpen" }, regions: [region(397.5, 0, 5, 100, true)] })).toEqual({ kind: "single" });
  });

  it("requires an active horizontal fold's own pane to reach halfway before standing a tabletop up", () => {
    // Active and not vertical, but short of size.width / 2: a wide-enough split would still succeed if the
    // width guard were skipped, so this isolates the guard rather than the split succeeding or failing on its own.
    expect(resolveFoldPosture({ size: tall, hinge: { kind: "fullyOpen" }, regions: [region(0, 382, 100, 20, true)] })).toEqual({ kind: "single" });
  });

  it("is a tabletop at the low end of the tabletop angle band", () => {
    expect(resolveFoldPosture({ size: tall, hinge: { kind: "partiallyOpen", angleDegrees: 60 }, regions: [] }).kind).toBe("tabletop");
  });

  it("filters a region out by its own geometry, not just by skipping the filter", () => {
    // Far outside the container on one axis only, so a build that dropped the filter would still place it with
    // the other axis's geometry and find a tabletop; filtered correctly, no region remains and it stays single.
    expect(resolveFoldPosture({ size: tall, hinge: { kind: "fullyOpen" }, regions: [region(10000, 382, 600, 20, true)] })).toEqual({ kind: "single" });
  });

  it("falls back to one page when a vertical fold's own panes would be too short", () => {
    const posture = resolveFoldPosture({ size: wide, hinge: { kind: "fullyOpen" }, regions: [region(5, 0, 2, 600, true)] });
    expect(posture).toEqual({ kind: "single" });
  });

  it("isolates each too-short-pane clause in the fold band's guard", () => {
    // Near the top: the first pane is short, the second isn't.
    expect(resolveFoldPosture({ size: tall, hinge: { kind: "fullyOpen" }, regions: [region(0, 90, 600, 20, true)] })).toEqual({ kind: "single" });
    // Near the bottom: the second pane is short, the first isn't.
    expect(resolveFoldPosture({ size: tall, hinge: { kind: "fullyOpen" }, regions: [region(0, 690, 600, 20, true)] })).toEqual({ kind: "single" });
  });

  it("allows a pane exactly at the minimum length, on either side of the band", () => {
    // start === minimumPaneLength exactly: the first pane's own guard must use "<", not "<=".
    const low = resolveFoldPosture({ size: tall, hinge: { kind: "fullyOpen" }, regions: [region(0, 274, 600, 20, true)] });
    if (low.kind !== "tabletop") throw new Error("expected tabletop");
    expect(low.split.first).toEqual({ x: 0, y: 0, width: 600, height: 260 });
    // length - end === minimumPaneLength exactly: the second pane's own guard must use "<", not "<=".
    const high = resolveFoldPosture({ size: tall, hinge: { kind: "fullyOpen" }, regions: [region(0, 506, 600, 20, true)] });
    if (high.kind !== "tabletop") throw new Error("expected tabletop");
    expect(high.split.second).toEqual({ x: 0, y: 540, width: 600, height: 260 });
  });

  it("includes a region exactly on the inclusive side of the edge padding", () => {
    // fx at the tall container's own width: real padding includes it (x - 0.5 < width + 0.5); flipped it wouldn't.
    const atRightEdge = resolveFoldPosture({ size: tall, hinge: { kind: "fullyOpen" }, regions: [region(600, 382, 600, 20, true)] });
    expect(atRightEdge.kind).toBe("tabletop");
    // fx + fw barely over the padded left edge: real padding includes it (0 < x + width + 0.5); flipped it wouldn't.
    const nearLeftEdge = resolveFoldPosture({ size: tall, hinge: { kind: "fullyOpen" }, regions: [region(-300.4, 382, 300, 20, true)] });
    expect(nearLeftEdge.kind).toBe("tabletop");
    // fy at the wide container's own height: real padding includes it (y - 0.5 < height + 0.5); flipped it wouldn't.
    const atBottomEdge = resolveFoldPosture({ size: wide, hinge: { kind: "fullyOpen" }, regions: [region(399, 600, 2, 600, true)] });
    expect(atBottomEdge.kind).toBe("book");
    // fy + fh barely over the padded top edge: real padding includes it (0 < y + height + 0.5); flipped it wouldn't.
    const nearTopEdge = resolveFoldPosture({ size: wide, hinge: { kind: "fullyOpen" }, regions: [region(399, -300.4, 2, 300, true)] });
    expect(nearTopEdge.kind).toBe("book");
  });

  it("stays one page when the hinge is open wide enough that no bend stands it up", () => {
    // An inactive, non-vertical region that would otherwise qualify, with the hinge fully open: bent must read
    // false here, not an unconditional true, or this would stand up as a tabletop anyway.
    expect(resolveFoldPosture({ size: tall, hinge: { kind: "fullyOpen" }, regions: [region(0, 399, 600, 2, false)] })).toEqual({ kind: "single" });
  });

  it("prefers an active region over an inactive one", () => {
    const posture = resolveFoldPosture({
      size: wide,
      hinge: { kind: "fullyOpen" },
      regions: [region(300, 0, 2, 600, false), region(399, 0, 2, 600, true)],
    });
    if (posture.kind !== "book") throw new Error("expected book");
    expect(posture.split.fold.x + posture.split.fold.width / 2).toBe(400);
  });

  it("falls back to one page when a pane would be shorter than the minimum", () => {
    const small = { width: 400, height: 500 };
    expect(resolveFoldPosture({ size: small, hinge: { kind: "partiallyOpen", angleDegrees: 90 }, regions: [] })).toEqual({ kind: "single" });
  });

  it("ignores a region outside the container", () => {
    expect(resolveFoldPosture({ size: wide, hinge: { kind: "fullyOpen" }, regions: [region(1200, 0, 2, 600, true)] })).toEqual({ kind: "single" });
  });
});

describe("foldBend", () => {
  it.each([
    [{ kind: "none" } as const, 0],
    [{ kind: "fullyOpen" } as const, 0],
    [{ kind: "partiallyOpen", angleDegrees: 180 } as const, 0],
    [{ kind: "partiallyOpen", angleDegrees: 135 } as const, 0.5],
    [{ kind: "partiallyOpen", angleDegrees: 60 } as const, 1],
  ])("deepens as the hinge closes: %o -> %s", (hinge, bend) => {
    expect(foldBend(hinge)).toBe(bend);
  });
});
