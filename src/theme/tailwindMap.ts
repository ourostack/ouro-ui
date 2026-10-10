import { inkExpression, inkToneNames, softExpression, toneNames } from "./tokens.ts";

/**
 * The `@theme inline` block that maps Tailwind utilities (`ou:bg-accent`, `ou:text-accent-ink`)
 * to the `--ouro-*` variables. Generated into src/generated/tailwind-theme.css.
 *
 * `soft-<tone>` and `<tone>-ink` use the variable when a theme sets it explicitly and
 * otherwise a `color-mix` fallback evaluated where the utility is used, so a scoped override
 * of a base color still reaches them (a custom property holding `var()` resolves where it is
 * declared, not where it is used).
 */
export function tailwindThemeCss(): string {
  const lines: string[] = [];
  const add = (name: string, value: string) => lines.push(`  --${name}: ${value};`);
  for (const name of ["surface", "surface-raised", "ink", "ink-muted", "line"]) {
    add(`color-${name}`, `var(--ouro-color-${name})`);
  }
  for (const tone of toneNames) {
    add(`color-${tone}`, `var(--ouro-color-${tone})`);
    add(`color-on-${tone}`, `var(--ouro-color-on-${tone})`);
    add(`color-soft-${tone}`, `var(--ouro-color-soft-${tone}, ${softExpression(tone)})`);
  }
  for (const tone of inkToneNames) {
    add(`color-${tone}-ink`, `var(--ouro-color-${tone}-ink, ${inkExpression(tone)})`);
  }
  for (const name of ["control", "surface", "pill"]) add(`radius-${name}`, `var(--ouro-radius-${name})`);
  for (const name of ["body", "display", "mono"]) add(`font-${name}`, `var(--ouro-font-${name})`);
  return `@theme inline {\n${lines.join("\n")}\n}\n`;
}
