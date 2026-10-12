import { toneFor } from "@/registry/ouro/lib/ouro/appearance-hints";

export { alignWords, gapClasses, justifyClasses, layoutElements, elementReset, checkGap, checkJustify, checkElement, layoutHint, layoutAlignHint };
export type { LayoutGap, LayoutJustify, LayoutElement };

// Shared by Stack and Row, apart from the components so each component file exports only
// components (React Fast Refresh). The export list comes first because the shadcn CLI
// drops comments before a file's first statement.

/** A gap from the spacing scale: `xs` 4px, `sm` 8px, `md` 16px, `lg` 24px, `xl` 32px. */
type LayoutGap = "none" | "xs" | "sm" | "md" | "lg" | "xl";

/** Where the children sit along the main axis; `between` spreads them to both ends. */
type LayoutJustify = "start" | "center" | "end" | "between";

/** The elements Stack and Row render. */
type LayoutElement = "div" | "section" | "ul" | "ol" | "nav" | "header" | "footer" | "main" | "aside" | "form" | "fieldset";

/**
 * Gap classes, one per step. Literal strings so the app's Tailwind finds them.
 *
 * @internal
 */
const gapClasses = { none: "gap-0", xs: "gap-1", sm: "gap-2", md: "gap-4", lg: "gap-6", xl: "gap-8" } as const;

/**
 * Main-axis classes.
 *
 * @internal
 */
const justifyClasses = { start: "justify-start", center: "justify-center", end: "justify-end", between: "justify-between" } as const;

/**
 * The elements Stack and Row may render, for the dev message.
 *
 * @internal
 */
const layoutElements: readonly LayoutElement[] = ["div", "section", "ul", "ol", "nav", "header", "footer", "main", "aside", "form", "fieldset"];

/**
 * What the browser sets on these elements that a layout primitive must not keep: list
 * bullets and indents, and a fieldset's border, padding and minimum width.
 *
 * @internal
 */
const elementReset = "m-0 p-0 list-none min-w-0 border-0" as const;

const names = (values: readonly string[]) => values.map((value) => `"${value}"`).join(", ");

/** A Tailwind spacing number (gap-4) to the nearest named gap. */
function nearestGap(value: number): LayoutGap {
  if (value <= 0) return "none";
  if (value <= 1) return "xs";
  if (value <= 2) return "sm";
  if (value <= 4) return "md";
  if (value <= 6) return "lg";
  return "xl";
}

/**
 * The gap to render and the dev message for one that is not a name: a number (`gap={4}`,
 * Chakra's and MUI's spacing units, which match Tailwind's) points to the nearest name.
 *
 * @internal
 */
function checkGap(component: string, gap: unknown, fallback: LayoutGap): [LayoutGap, readonly [string, string] | false] {
  if (gap === undefined) return [fallback, false];
  if (typeof gap === "string" && Object.hasOwn(gapClasses, gap)) return [gap as LayoutGap, false];
  return [
    fallback,
    process.env.NODE_ENV !== "production"
      ? [
          `${typeof gap === "number" ? `gap={${gap}}` : `gap="${String(gap)}"`} is not a gap; use a name: ${names(Object.keys(gapClasses))}`,
          `<${component} gap="${typeof gap === "number" ? nearestGap(gap) : "md"}">`,
        ]
      : /* istanbul ignore next @preserve -- production only */ false,
  ];
}

/**
 * Words agents use for a direction, to the logical alignment.
 *
 * @internal
 */
const alignWords: Readonly<Record<string, string>> = {
  left: "start",
  top: "start",
  "flex-start": "start",
  right: "end",
  bottom: "end",
  "flex-end": "end",
  "space-between": "between",
};

/**
 * The value to render from a set of named options and the dev message for one that is
 * not in it: `left`, `top` and `flex-start` point to `start`, and so on.
 *
 * @internal
 */
function checkJustify(component: string, justify: unknown): [LayoutJustify, readonly [string, string] | false] {
  if (justify === undefined) return ["start", false];
  if (typeof justify === "string" && Object.hasOwn(justifyClasses, justify)) return [justify as LayoutJustify, false];
  return [
    "start",
    process.env.NODE_ENV !== "production"
      ? [
          `justify="${String(justify)}" is not a justification; use ${names(Object.keys(justifyClasses))}`,
          `<${component} justify="${alignWords[String(justify)] ?? "start"}">`,
        ]
      : /* istanbul ignore next @preserve -- production only */ false,
  ];
}

/**
 * The element to render and the dev message for one that is not in the list.
 *
 * @internal
 */
function checkElement(component: string, as: unknown): [LayoutElement, readonly [string, string] | false] {
  if (as === undefined) return ["div", false];
  if (typeof as === "string" && (layoutElements as readonly string[]).includes(as)) return [as as LayoutElement, false];
  return [
    "div",
    process.env.NODE_ENV !== "production"
      ? [`as="${String(as)}" is not an element ${component} renders; use ${names(layoutElements)}`, `<${component} as="section">`]
      : /* istanbul ignore next @preserve -- production only */ false,
  ];
}

/**
 * The fix for an appearance class on a layout primitive: a surface is a Card, text
 * styling belongs on the Text or Heading inside. Development only.
 *
 * @internal
 */
function layoutHint(component: string): (token: string) => string {
  return (token) => {
    if (/^text-/.test(token) && !/^text-(xs|sm|base|lg|\d?xl)$/.test(token)) return `<Text tone="${toneFor(token)}"> on the text inside`;
    if (/^(text|font)-/.test(token)) return "<Text> or <Heading> on the text inside";
    return `<Card> for a surface, or wrap the ${component} in an element of your own`;
  };
}

/**
 * The fix for a text alignment class on a layout primitive. Development only.
 *
 * @internal
 */
function layoutAlignHint(component: string, prop: "align" | "justify"): string {
  return `<Text align="center"> on the text inside, or <${component} ${prop}="center"> to center the children`;
}
