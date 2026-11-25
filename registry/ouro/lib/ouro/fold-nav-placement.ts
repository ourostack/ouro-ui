export type { OuroFoldNavPlacement, OuroFoldNavRules };
export { resolveFoldNavPlacement, standardFoldNavRules };

import type { OuroFoldPosture } from "@/registry/ouro/lib/ouro/fold-posture";

/**
 * Where the places (a bottom bar, a side rail, or a rail pinned to one pane of a fold) go for a
 * {@link OuroFoldPosture}: a phone puts them in a bar, the Duo's front screen puts them on the
 * side (its `closed` posture has no room to fold, so a bar would sit at the very bottom edge,
 * under the thumb that is already holding the device), and the Duo open or a tablet in tabletop
 * or book puts them on the pane the posture's own JSDoc calls "controls" (tabletop) or the
 * leading, facing-pages pane (book).
 */
type OuroFoldNavPlacement =
  | { nav: "bar" }
  | { nav: "rail" }
  | { nav: "rail"; pane: "first" | "second" };

/** How wide a `single` posture (an ordinary screen, no fold) must be before its places move from a bottom bar to a side rail. */
type OuroFoldNavRules = { railFromWidth: number };

/** The width Ouro HX's own bottom-bar/side-rail pattern switches at today: Tailwind's `sm` breakpoint, 640px. */
const standardFoldNavRules: OuroFoldNavRules = { railFromWidth: 640 };

/**
 * Decides where an app's places (its top-level destinations) belong for a given fold posture and
 * screen size, so a bottom bar and a side rail never drift out of step with each other's own
 * breakpoint.
 *
 * @example
 * ```ts
 * const placement = resolveFoldNavPlacement(resolveFoldPosture(input), { width, height });
 * // placement.nav === "bar" ? render a TabBar : render a NavigationRail, in placement.pane when it names one
 * ```
 */
function resolveFoldNavPlacement(
  posture: OuroFoldPosture,
  size: { width: number; height: number },
  rules: OuroFoldNavRules = standardFoldNavRules,
): OuroFoldNavPlacement {
  switch (posture.kind) {
    case "single":
      return size.width >= rules.railFromWidth ? { nav: "rail" } : { nav: "bar" };
    case "closed":
      return { nav: "rail" };
    case "tabletop":
      return { nav: "rail", pane: "second" };
    case "book":
      return { nav: "rail", pane: "first" };
  }
}
