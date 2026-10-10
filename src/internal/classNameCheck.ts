import { useEffect, useRef } from "react";
import { devWarn } from "./dev.ts";

const APPEARANCE = /^(bg|text|border|rounded|shadow|font|ring|from|via|to|fill|stroke)-/;

/** Returns the first class token that sets appearance, or undefined. */
export function findAppearanceClass(className: string | undefined): string | undefined {
  if (!className) return undefined;
  return className.split(/\s+/).find((token) => {
    if (token.startsWith("dark:")) return true;
    return APPEARANCE.test(token.slice(token.lastIndexOf(":") + 1));
  });
}

/**
 * Development-only check that `className` is used for layout, not appearance.
 * Runs in an effect, so it never warns during server rendering, and warns at
 * most once per component instance.
 *
 * @param hint What to use instead, for example `Use tone="danger" instead`.
 */
export function useAppearanceClassNameCheck(
  component: string,
  className: string | undefined,
  hint: string,
): void {
  const warned = useRef(false);
  useEffect(() => {
    if (warned.current) return;
    const token = findAppearanceClass(className);
    if (!token) return;
    warned.current = true;
    devWarn(
      component,
      `"${token}" sets appearance, and className is for layout only`,
      hint,
      warned,
    );
  }, [component, className, hint]);
}
