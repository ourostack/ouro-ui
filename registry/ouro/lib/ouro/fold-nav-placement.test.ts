import { describe, expect, it } from "vitest";
import { resolveFoldNavPlacement } from "@/registry/ouro/lib/ouro/fold-nav-placement";
import type { OuroFoldPosture } from "@/registry/ouro/lib/ouro/fold-posture";

const narrow = { width: 400, height: 800 };
const wide = { width: 1024, height: 800 };
const split = {
  first: { x: 0, y: 0, width: 600, height: 380 },
  fold: { x: 0, y: 380, width: 600, height: 2 },
  second: { x: 0, y: 382, width: 600, height: 418 },
  source: "hardware" as const,
};

describe("resolveFoldNavPlacement", () => {
  it("puts a narrow single posture's places in a bottom bar", () => {
    const posture: OuroFoldPosture = { kind: "single" };
    expect(resolveFoldNavPlacement(posture, narrow)).toEqual({ nav: "bar" });
  });

  it("puts a wide single posture's places in a side rail", () => {
    const posture: OuroFoldPosture = { kind: "single" };
    expect(resolveFoldNavPlacement(posture, wide)).toEqual({ nav: "rail" });
  });

  it("puts a closed posture's (the Duo's front screen) places in a side rail even when narrow", () => {
    const posture: OuroFoldPosture = { kind: "closed" };
    expect(resolveFoldNavPlacement(posture, narrow)).toEqual({ nav: "rail" });
  });

  it("puts a tabletop posture's places on its second (controls) pane", () => {
    const posture: OuroFoldPosture = { kind: "tabletop", split };
    expect(resolveFoldNavPlacement(posture, wide)).toEqual({ nav: "rail", pane: "second" });
  });

  it("puts a book posture's places on its first (leading, facing-pages) pane", () => {
    const posture: OuroFoldPosture = { kind: "book", split };
    expect(resolveFoldNavPlacement(posture, wide)).toEqual({ nav: "rail", pane: "first" });
  });

  it("honors a custom railFromWidth rule for a single posture", () => {
    const posture: OuroFoldPosture = { kind: "single" };
    expect(resolveFoldNavPlacement(posture, { width: 500, height: 800 }, { railFromWidth: 500 })).toEqual({ nav: "rail" });
    expect(resolveFoldNavPlacement(posture, { width: 499, height: 800 }, { railFromWidth: 500 })).toEqual({ nav: "bar" });
  });
});
