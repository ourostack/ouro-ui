import { afterEach, describe, expect, it } from "vitest";
import { pageCss } from "@/registry/ouro/lib/ouro/testing/page-css";

const hosts: HTMLElement[] = [];
afterEach(() => {
  for (const host of hosts.splice(0)) host.remove();
});

function radius(scale: string | null, utility: string) {
  const el = document.createElement("div");
  el.className = utility;
  el.style.width = "40px";
  if (scale) el.style.setProperty("--ouro-radius-scale", scale);
  document.body.append(el);
  hosts.push(el);
  return parseFloat(getComputedStyle(el).borderTopLeftRadius);
}

describe("radius scale where the engine has no corner-shape", () => {
  it("scales every rounded-* step by --ouro-radius-scale, and leaves rounded-full alone", () => {
    for (const utility of ["rounded-sm", "rounded-md", "rounded-lg", "rounded-xl", "rounded-2xl", "rounded-3xl", "rounded-4xl"]) {
      const full = radius(null, utility);
      expect(radius("0.7", utility)).toBeCloseTo(full * 0.7, 1);
    }
    expect(radius("0.7", "rounded-full")).toBe(radius(null, "rounded-full"));
  });

  it("sets the scale to 0.7 only where corner-shape is not supported", () => {
    const css = pageCss();
    expect(css).toMatch(/@supports not \(corner-shape: squircle\)\s*\{[^}]*\{[^}]*--ouro-radius-scale:\s*0\.7/);
  });
});
