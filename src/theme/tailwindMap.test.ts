import { describe, expect, it } from "vitest";
import { tailwindThemeCss } from "./tailwindMap.ts";

describe("tailwindThemeCss", () => {
  const css = tailwindThemeCss();

  it("is an inline theme block", () => {
    expect(css.startsWith("@theme inline {")).toBe(true);
  });

  it("reads soft colors from the variable first, then derives them from the tone", () => {
    expect(css).toContain(
      "--color-soft-accent: var(--ouro-color-soft-accent, color-mix(in oklab, var(--ouro-color-accent) 14%, transparent));",
    );
  });

  it("derives <tone>-ink from the tone and ink, for the four colored tones", () => {
    expect(css).toContain(
      "--color-danger-ink: var(--ouro-color-danger-ink, color-mix(in oklab, var(--ouro-color-danger), var(--ouro-color-ink) 40%));",
    );
    expect(css).not.toContain("--color-neutral-ink");
  });

  it("maps base colors, on colors, radii and fonts directly", () => {
    expect(css).toContain("--color-surface: var(--ouro-color-surface);");
    expect(css).toContain("--color-on-success: var(--ouro-color-on-success);");
    expect(css).toContain("--radius-control: var(--ouro-radius-control);");
    expect(css).toContain("--font-mono: var(--ouro-font-mono);");
  });
});
