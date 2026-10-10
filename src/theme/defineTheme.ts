import { cssSpring } from "./springs.ts";
import {
  defaultOn,
  defaultTokens,
  softExpression,
  toneNames,
  type DeepPartial,
  type SchemeColor,
  type ThemeTokens,
} from "./tokens.ts";

export type DefinedTheme = { tokens: ThemeTokens; css: string };

type Tree = { [key: string]: unknown };

function merge(base: Tree, patch: Tree): Tree {
  const out: Tree = { ...base };
  for (const [key, value] of Object.entries(patch)) {
    if (value === undefined) continue;
    // A nested patch always lands on a nested token group, so the base is an object too.
    out[key] = typeof value === "object" ? merge(out[key] as Tree, value as Tree) : value;
  }
  return out;
}

const lightDark = ({ light, dark }: SchemeColor) => `light-dark(${light}, ${dark})`;

/**
 * Builds a theme: the full token set (your overrides over the Ouro defaults) and the CSS
 * custom properties that apply it.
 *
 * ```ts
 * const { css } = defineTheme({ color: { accent: { light: "#c2410c", dark: "#fb923c" } } });
 * ```
 *
 * Use `opts.selector` to scope a theme to a subtree instead of `:root`. Derived colors
 * (`soft-<tone>`, and `on-<tone>` unless you set it) are CSS expressions over the base
 * variables, so the utilities follow a scoped override of a base color.
 */
export function defineTheme(
  partial: DeepPartial<ThemeTokens> = {},
  opts: { selector?: string } = {},
): DefinedTheme {
  const selector = opts.selector ?? ":root";
  const tokens = merge(defaultTokens, partial) as ThemeTokens;
  const { color, radius, font, motion, z } = tokens;
  const spring = cssSpring(motion.spring.visualDuration, motion.spring.bounce);

  const lines: string[] = ["color-scheme: light dark;"];
  const prop = (name: string, value: string | number) => lines.push(`--ouro-${name}: ${value};`);

  for (const [name, value] of Object.entries(color)) prop(`color-${name}`, lightDark(value));
  for (const tone of toneNames) {
    const on = color[`on-${tone}`];
    const soft = color[`soft-${tone}`];
    if (!on) prop(`color-on-${tone}`, defaultOn);
    if (!soft) prop(`color-soft-${tone}`, softExpression(tone));
  }
  for (const [name, value] of Object.entries(radius)) prop(`radius-${name}`, value);
  for (const [name, value] of Object.entries(font)) prop(`font-${name}`, value);
  prop("duration-fast", `${motion.fast}ms`);
  prop("duration-base", `${motion.base}ms`);
  prop("duration-slow", `${motion.slow}ms`);
  prop("spring-duration", spring.duration);
  prop("ease-spring", spring.easing);
  prop("press-scale", motion.pressScale);
  for (const [name, value] of Object.entries(z)) prop(`z-${name}`, value);

  const scheme = (name: "light" | "dark") =>
    `${selector}[data-theme="${name}"], [data-theme="${name}"] ${selector} {\n  color-scheme: ${name};\n}`;
  const css = `${selector} {\n${lines.map((line) => `  ${line}`).join("\n")}\n}\n${scheme("light")}\n${scheme("dark")}\n`;
  return { tokens, css };
}
