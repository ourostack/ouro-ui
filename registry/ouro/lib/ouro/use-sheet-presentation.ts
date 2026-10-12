"use client";

import { useMediaQuery } from "@/registry/ouro/lib/ouro/use-media-query";

/**
 * Whether an overlay with a `presentation` prop renders as a bottom sheet right now:
 * always for `"sheet"`, and below the `sm` breakpoint (640px) for `"auto"`. Any other
 * value (`"dialog"`, `"popover"`) never does. The server and hydration render the
 * wide form, and the client corrects it after, so there is no hydration mismatch.
 *
 * Internal: `Dialog` and `Popover` use it; apps don't need to.
 *
 * @example
 * const asSheet = useSheetPresentation(presentation);
 */
export function useSheetPresentation(presentation: string): boolean {
  const wide = useMediaQuery("(min-width: 640px)", true);
  return presentation === "sheet" || (presentation === "auto" && !wide);
}
