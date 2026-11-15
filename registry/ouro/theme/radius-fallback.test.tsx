import { afterEach, describe, expect, it } from "vitest";
import { pageCss } from "@/registry/ouro/lib/ouro/testing/page-css";

const hosts: HTMLElement[] = [];
afterEach(() => {
  for (const host of hosts.splice(0)) host.remove();
});

function radius(scale: string | null, utility: string, fallback: string | null = null) {
  const el = document.createElement("div");
  el.className = utility;
  el.style.width = "40px";
  if (scale) el.style.setProperty("--ouro-radius-scale", scale);
  if (fallback) el.style.setProperty("--ouro-corner-fallback", fallback);
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

  it("multiplies an app's own radius scale with the fallback factor, so a scale of 1 keeps the fallback", () => {
    const full = radius("1", "rounded-lg", "1");
    expect(radius("1", "rounded-lg", "0.7")).toBeCloseTo(full * 0.7, 1);
    expect(radius("0.5", "rounded-lg", "0.7")).toBeCloseTo(full * 0.35, 1);
  });

  it("an app that sets --ouro-radius-scale to 1 still gets the 0.7 fallback factor in the fallback rules", () => {
    const base = document.createElement("style");
    base.textContent = ":root { --ouro-radius-scale: 1; }";
    const fallback = document.createElement("style");
    const blocks = [...pageCss().matchAll(/@supports not \(corner-shape: squircle\)\s*\{((?:[^{}]*\{[^{}]*\})*)\s*\}/g)].map((match) => match[1]);
    fallback.textContent = blocks.join("\n");
    document.head.append(base, fallback);
    hosts.push(base, fallback);
    const el = document.createElement("div");
    el.className = "rounded-lg";
    document.body.append(el);
    hosts.push(el);
    const radius = parseFloat(getComputedStyle(el).borderTopLeftRadius);
    const token = parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--radius")) * 16;
    expect(radius).toBeCloseTo(token * 0.7, 1);
  });

  it("sets the fallback factor to 0.7 only where corner-shape is not supported", () => {
    const css = pageCss();
    expect(css).toMatch(/@supports not \(corner-shape: squircle\)\s*\{[^}]*\{[^}]*--ouro-corner-fallback:\s*0\.7/);
  });
});
