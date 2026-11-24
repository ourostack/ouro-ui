"use client";

import { Children, type ReactNode } from "react";

export { capLabel, capLabelClass, capLabelClippedClass };

/**
 * Trims a block of one line to its cap height and baseline, so the line's middle is what the eye reads as its middle
 * rather than the font's own line box, which sits off it by a font-dependent amount. Where `text-box` is missing the
 * line box stays, and a control's fixed height is what keeps it whole.
 *
 * @internal
 */
const capLabelClass = "[text-box:trim-both_cap_alphabetic]";

/**
 * {@link capLabelClass} for a line that clips (`truncate`): the padding gives the clip back the room the trim took
 * above the caps and under the baseline, and the negative margin takes it out of the layout again.
 *
 * @internal
 */
const capLabelClippedClass = "[text-box:trim-both_cap_alphabetic] py-[0.3em] -my-[0.3em]";

/**
 * Wraps a control's text children in blocks of their own that {@link capLabelClass} trims, to centre them on
 * their cap height in a flex row. Elements pass through unchanged, as the icons and badges beside the words do.
 *
 * @example
 * <span className="inline-flex items-center">{capLabel("Save")}</span>
 * @internal
 */
function capLabel(children: ReactNode): ReactNode {
  return Children.map(children, (child) =>
    typeof child === "string" || typeof child === "number" ? <span data-slot="cap-label-text" className={capLabelClass}>{child}</span> : child,
  );
}
