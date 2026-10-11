/** The five tones every component maps its `tone` prop to. */
export type ToneName = "neutral" | "accent" | "success" | "warning" | "danger";

/** A color that has one value per color scheme. */
export type SchemeColor = { light: string; dark: string };

/** Tones that have a `<tone>-ink` text color for use on `soft-<tone>`. Neutral uses `ink`. */
export type InkToneName = Exclude<ToneName, "neutral">;

/** The colors every theme sets: page surfaces, text, lines and the five tones. */
export type BaseColorName = "surface" | "surface-raised" | "ink" | "ink-muted" | "line" | ToneName;
/**
 * `on-<tone>` is the text color on a solid tone. `soft-<tone>` is the tone's tinted
 * background, and text on it uses `<tone>-ink` (the tone darkened toward `ink`), never the
 * plain tone, which fails 4.5:1 in light mode.
 */
export type DerivedColorName = `on-${ToneName}` | `soft-${ToneName}` | `${InkToneName}-ink`;

/** All token groups of a theme. `on-<tone>` and `soft-<tone>` are derived when not given. */
export type ThemeTokens = {
  color: Record<BaseColorName, SchemeColor> & Partial<Record<DerivedColorName, SchemeColor>>;
  radius: { control: string; surface: string; pill: string };
  font: { body: string; display: string; mono: string };
  motion: {
    /** Milliseconds. */
    fast: number;
    base: number;
    slow: number;
    spring: { visualDuration: number; bounce: number };
    /** Scale applied while a control is pressed. */
    pressScale: number;
  };
  z: { overlay: number; popover: number; toast: number };
  /** The dimming layer behind sheets and dialogs. */
  backdrop: {
    color: SchemeColor;
    /** Opacity when the sheet or dialog is fully open. A dragged sheet fades it toward 0. */
    opacity: number;
  };
};

/** Every key optional, at every depth: the shape `defineTheme` takes for overrides. */
export type DeepPartial<T> = {
  [K in keyof T]?: (T[K] extends object ? DeepPartial<T[K]> : T[K]) | undefined;
};

export const toneNames: readonly ToneName[] = ["neutral", "accent", "success", "warning", "danger"];
export const inkToneNames: readonly InkToneName[] = ["accent", "success", "warning", "danger"];

/** Share of the tone color mixed into transparent to make `soft-<tone>`. */
export const softAmount = "14%";

/** The CSS expression for a derived `soft-<tone>` color, evaluated over the base variable. */
export function softExpression(tone: ToneName): string {
  return `color-mix(in oklab, var(--ouro-color-${tone}) ${softAmount}, transparent)`;
}

/** Share of `ink` mixed into the tone to make `<tone>-ink`. Chosen so it reaches 4.5:1 on `soft-<tone>`. */
export const inkAmount = "40%";

/** The CSS expression for a derived `<tone>-ink` color, evaluated over the base variables. */
export function inkExpression(tone: InkToneName): string {
  return `color-mix(in oklab, var(--ouro-color-${tone}), var(--ouro-color-ink) ${inkAmount})`;
}

/** The default `on-<tone>` color: white on light, black on dark. */
export const defaultOn = "light-dark(white, black)";

/** The provisional neutral Ouro palette. Spread into `defineTheme` overrides, never mutated. */
export const defaultTokens: ThemeTokens = {
  color: {
    surface: { light: "#ffffff", dark: "#0b0b0d" },
    "surface-raised": { light: "#f5f5f6", dark: "#18181b" },
    ink: { light: "#18181b", dark: "#f4f4f5" },
    "ink-muted": { light: "#62626b", dark: "#a1a1aa" },
    line: { light: "#e4e4e7", dark: "#2e2e33" },
    neutral: { light: "#3f3f46", dark: "#d4d4d8" },
    accent: { light: "#2563eb", dark: "#60a5fa" },
    success: { light: "#15803d", dark: "#4ade80" },
    warning: { light: "#b45309", dark: "#fbbf24" },
    danger: { light: "#dc2626", dark: "#f87171" },
  },
  radius: { control: "8px", surface: "12px", pill: "999px" },
  font: {
    body: 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
    display: 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
    mono: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
  },
  motion: {
    fast: 100,
    base: 200,
    slow: 400,
    spring: { visualDuration: 0.4, bounce: 0.15 },
    pressScale: 0.97,
  },
  z: { overlay: 1000, popover: 1100, toast: 1200 },
  backdrop: { color: { light: "#18181b", dark: "#000000" }, opacity: 0.4 },
};
