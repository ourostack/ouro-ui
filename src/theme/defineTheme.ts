import { cssSpring } from "./springs.ts";
import {
  defaultOn,
  defaultTokens,
  toneNames,
  type DeepPartial,
  type SchemeColor,
  type ThemeTokens,
} from "./tokens.ts";

/** What {@link defineTheme} returns: the merged tokens and the CSS that applies them. */
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
 * custom properties that apply it. Put `css` in a stylesheet loaded after
 * `@ouro.bot/ui/styles.css`.
 *
 * Use `opts.selector` to scope a theme to a subtree instead of `:root`.
 * `on-<tone>` defaults to white (light) or black (dark). `soft-<tone>` and `<tone>-ink`
 * are only emitted when you set them; otherwise the utilities derive them with `color-mix`
 * over the base variables where they are used, so a scoped override of a base color
 * reaches them. Text on a soft background uses `<tone>-ink`, not the plain tone.
 *
 * Colors are emitted as `light-dark(light, dark)`. Switching the scheme on the root
 * (`data-theme` on `<html>`, or the OS setting) always works. A scheme set on a wrapper
 * (`color-scheme: dark` on a subtree) needs native `light-dark()` support: if your CSS
 * pipeline lowers it for older browsers (Lightning CSS, Tailwind's optimizer), the
 * lowered tokens resolve once at the root and the wrapper's scheme is ignored.
 *
 * @example
 * const { css } = defineTheme({ color: { accent: { light: "#c2410c", dark: "#fb923c" } } });
 * const { css: brand } = defineTheme({ radius: { control: "999px" } }, { selector: ".brand" });
 */
export function defineTheme(
  partial: DeepPartial<ThemeTokens> = {},
  opts: { selector?: string } = {},
): DefinedTheme {
  const selector = opts.selector ?? ":root";
  const tokens = merge(defaultTokens, partial) as ThemeTokens;
  const { color, radius, font, motion, z, backdrop } = tokens;
  const spring = cssSpring(motion.spring.visualDuration, motion.spring.bounce);

  const lines: string[] = ["color-scheme: light dark;"];
  const prop = (name: string, value: string | number) => lines.push(`--ouro-${name}: ${value};`);

  for (const [name, value] of Object.entries(color)) prop(`color-${name}`, lightDark(value));
  for (const tone of toneNames) {
    if (!color[`on-${tone}`]) prop(`color-on-${tone}`, defaultOn);
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
  prop("backdrop-color", lightDark(backdrop.color));
  prop("backdrop-max", backdrop.opacity);

  // On :root the attribute sits on the same element, so the ancestor form could never match.
  const scheme = (name: "light" | "dark") => {
    const own = `${selector}[data-theme="${name}"]`;
    const selectors = selector === ":root" ? own : `${own}, [data-theme="${name}"] ${selector}`;
    return `${selectors} {\n  color-scheme: ${name};\n}`;
  };
  const css = `${selector} {\n${lines.map((line) => `  ${line}`).join("\n")}\n}\n${scheme("light")}\n${scheme("dark")}\n`;
  return { tokens, css };
}
