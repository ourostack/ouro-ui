import type { ToneName } from "@/src/theme/tokens";

// Builders for the `Fix:` code in className warnings. Each takes the offending
// token without variants (`bg-red-500`, `text-lg`) and returns exact code that
// does the same job with a prop. Components pass them only in development, so
// none of this ships in production bundles.

const PALETTE: Array<[RegExp, ToneName]> = [
  [/-(red|rose|pink)(-|$)/, "danger"],
  [/-(green|emerald|lime|teal)(-|$)/, "success"],
  [/-(amber|yellow|orange)(-|$)/, "warning"],
  [/-(gray|grey|zinc|slate|neutral|stone|black|white)(-|$)/, "neutral"],
];

/** The tone closest to a palette color in the token, or `accent`. */
export function toneFor(token: string): ToneName {
  for (const [pattern, tone] of PALETTE) if (pattern.test(token)) return tone;
  return "accent";
}

const TEXT_SIZE = /^text-(xs|sm|base|lg|xl|\dxl)$/;

/**
 * Maps a Tailwind font-size token to a component size from `scale`, which lists
 * the component's sizes for `xs`, `sm`, `base`, `lg`, `xl`, `2xl` and `3xl` and up.
 * Returns undefined for any other token.
 */
export function sizeFor(token: string, scale: readonly [string, string, string, string, string, string, string]) {
  const match = TEXT_SIZE.exec(token);
  if (!match) return undefined;
  const step = ["xs", "sm", "base", "lg", "xl", "2xl"].indexOf(match[1]!);
  return scale[step === -1 ? 6 : step];
}

/** The `defineTheme` call that sets the control radius a `rounded-*` token asks for. */
export function radiusFor(token: string): string {
  const value = token === "rounded-none" ? "0px" : token === "rounded-full" ? "999px" : "12px";
  return `defineTheme({ radius: { control: "${value}" } })`;
}

const WEIGHT = /^font-(thin|extralight|light|normal|medium|semibold|bold|extrabold|black)$/;

/** True for a font-weight token such as `font-bold`. */
export function isWeight(token: string): boolean {
  return WEIGHT.test(token);
}

/** The fix for a `font-*` token on a component that sets its own font from `family`. */
export function fontFor(component: string, token: string, family: "body" | "display"): string {
  return `remove "${token}"; ${component} sets its own font (change the family with defineTheme({ font: { ${family}: "…" } }))`;
}
