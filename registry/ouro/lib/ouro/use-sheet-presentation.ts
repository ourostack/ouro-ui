"use client";

import { useMediaQuery } from "@/registry/ouro/lib/ouro/use-media-query";

/**
 * When a popup that would be fiddly on a phone (a picker list, a menu) presents as a bottom
 * sheet instead: below the `sm` breakpoint (640px) on a coarse pointer. A narrow desktop
 * window keeps the popup, and so does a phone turned to landscape, past `sm`.
 *
 * @internal
 */
export const sheetPresentationQuery = "(max-width: 639px) and (pointer: coarse)";

/**
 * Whether a picker presents as a bottom sheet ({@link sheetPresentationQuery}). The server
 * and hydration render the popup form, and the client switches after, as `Dialog` does.
 *
 * Internal: Ouro UI components use it; apps don't need to.
 *
 * @example
 * const sheet = useSheetPresentation();
 */
export function useSheetPresentation(): boolean {
  return useMediaQuery(sheetPresentationQuery, false);
}
