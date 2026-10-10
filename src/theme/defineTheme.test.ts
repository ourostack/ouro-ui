import { describe, expect, it } from "vitest";
import { defineTheme } from "./defineTheme.ts";
import { ouroTheme } from "./ouro.ts";
import { cssSpring } from "./springs.ts";

describe("defineTheme", () => {
  it("writes a color override as light-dark()", () => {
    const { css } = defineTheme({ color: { accent: { light: "#000", dark: "#fff" } } });
    expect(css).toContain("--ouro-color-accent: light-dark(#000, #fff)");
  });

  it("keeps every unspecified token from the Ouro theme", () => {
    const { tokens } = defineTheme({ radius: { control: "2px" } });
    expect(tokens.radius).toEqual({ ...ouroTheme.tokens.radius, control: "2px" });
    expect(tokens.color).toEqual(ouroTheme.tokens.color);
    expect(tokens.motion).toEqual(ouroTheme.tokens.motion);
    expect(tokens.z).toEqual(ouroTheme.tokens.z);
  });

  it("ignores undefined values in a partial", () => {
    const { tokens } = defineTheme({ radius: { control: undefined }, motion: { fast: 50 } });
    expect(tokens.radius.control).toBe("8px");
    expect(tokens.motion.fast).toBe(50);
    expect(tokens.motion.slow).toBe(400);
  });

  it("has the documented default accent, radii and motion", () => {
    const { tokens } = ouroTheme;
    expect(tokens.color.accent).toEqual({ light: "#2563eb", dark: "#60a5fa" });
    expect(tokens.radius).toEqual({ control: "8px", surface: "12px", pill: "999px" });
    expect(tokens.motion).toEqual({
      fast: 100,
      base: 200,
      slow: 400,
      spring: { visualDuration: 0.4, bounce: 0.15 },
      pressScale: 0.97,
    });
  });

  it("emits color-scheme for the default and for forced light or dark", () => {
    const { css } = ouroTheme;
    expect(css).toContain(":root {\n  color-scheme: light dark;");
    expect(css).toMatch(/:root\[data-theme="light"\][^{]*\{\s*color-scheme: light;/);
    expect(css).toMatch(/:root\[data-theme="dark"\][^{]*\{\s*color-scheme: dark;/);
  });

  it("emits the spring easing and its duration", () => {
    expect(ouroTheme.css).toMatch(/--ouro-ease-spring: linear\(0, /);
    expect(ouroTheme.css).toMatch(/--ouro-spring-duration: \d+ms;/);
  });

  it("defaults on-<tone> and leaves soft and ink to the utilities", () => {
    const { css } = ouroTheme;
    expect(css).toContain("--ouro-color-on-danger: light-dark(white, black);");
    expect(css).not.toContain("--ouro-color-soft-");
    expect(css).not.toMatch(/(accent|success|warning|danger)-ink:/);
  });

  it("uses explicit on and soft colors instead of deriving them", () => {
    const { css } = defineTheme({
      color: {
        "on-warning": { light: "#000", dark: "#111" },
        "soft-warning": { light: "#fef3c7", dark: "#451a03" },
        "warning-ink": { light: "#78350f", dark: "#fde68a" },
      },
    });
    expect(css).toContain("--ouro-color-on-warning: light-dark(#000, #111);");
    expect(css).toContain("--ouro-color-soft-warning: light-dark(#fef3c7, #451a03);");
    expect(css).toContain("--ouro-color-warning-ink: light-dark(#78350f, #fde68a);");
    expect(css.match(/--ouro-color-on-warning:/g)).toHaveLength(1);
    expect(css.match(/--ouro-color-soft-warning:/g)).toHaveLength(1);
  });

  it("scopes everything to a custom selector", () => {
    const { css } = defineTheme({}, { selector: ".sj-theme" });
    expect(css.startsWith(".sj-theme {")).toBe(true);
    expect(css).toContain('.sj-theme[data-theme="dark"], [data-theme="dark"] .sj-theme {');
    expect(css).not.toContain(":root");
  });

  it("does not emit the dead ancestor selector for :root", () => {
    expect(ouroTheme.css).not.toContain(':root[data-theme="dark"], [data-theme="dark"] :root');
    expect(ouroTheme.css).toContain(':root[data-theme="dark"] {');
  });

  it("emits radius, font, motion, press scale and z tokens", () => {
    const { css } = ouroTheme;
    for (const name of [
      "--ouro-radius-control: 8px;",
      "--ouro-radius-pill: 999px;",
      "--ouro-font-mono:",
      "--ouro-duration-base: 200ms;",
      "--ouro-press-scale: 0.97;",
      "--ouro-z-overlay: 1000;",
    ]) {
      expect(css).toContain(name);
    }
  });
});

describe("cssSpring", () => {
  it("splits Motion's transition string into duration and linear() easing", () => {
    const { duration, easing } = cssSpring(0.4, 0.15);
    expect(duration).toMatch(/^\d+ms$/);
    expect(easing.startsWith("linear(")).toBe(true);
    expect(easing.endsWith(")")).toBe(true);
  });

  it("runs at least as long as the visual duration", () => {
    for (const visualDuration of [0.2, 0.4, 0.8]) {
      const ms = Number.parseFloat(cssSpring(visualDuration, 0.15).duration);
      expect(ms).toBeGreaterThanOrEqual(visualDuration * 1000);
    }
    const emitted = /--ouro-spring-duration: (\d+)ms/.exec(ouroTheme.css);
    expect(Number(emitted?.[1])).toBeGreaterThanOrEqual(ouroTheme.tokens.motion.spring.visualDuration * 1000);
  });
});
