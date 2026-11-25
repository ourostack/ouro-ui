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
    expect(posture.split.fold).toEqual({ x: 376, y: 0, width: 48, height: 600 });
    expect(posture.split.first).toEqual({ x: 0, y: 0, width: 376, height: 600 });
    expect(posture.split.second).toEqual({ x: 424, y: 0, width: 376, height: 600 });
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
