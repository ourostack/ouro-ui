// Alignment shared by Text and Heading, apart from the components so each component
// file exports only components (React Fast Refresh).

/** Text alignment, in writing direction: `start` is left in English and right in Arabic. */
export type TextAlign = "start" | "center" | "end";

/**
 * Alignment classes, shared with `Heading`.
 *
 * @internal
 */
export const alignClasses = { start: "text-start", center: "text-center", end: "text-end" } as const;

/**
 * The value an `align` prop is, or `undefined` (inherited) with the dev message for one
 * that is not: `left` and `right` point to `start` and `end`. Shared with `Heading`.
 *
 * @internal
 */
export function checkAlign(component: string, align: string | undefined): [TextAlign | undefined, readonly [string, string] | false] {
  if (align === undefined || Object.hasOwn(alignClasses, align)) return [align as TextAlign | undefined, false];
  const fix = align === "right" ? "end" : "start";
  return [
    undefined,
    process.env.NODE_ENV !== "production"
      ? [`align="${align}" is not an alignment; use "start", "center", "end"`, `<${component} align="${fix}">`]
      : /* istanbul ignore next -- production only */ false,
  ];
}
