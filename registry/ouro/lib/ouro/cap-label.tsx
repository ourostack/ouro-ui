"use client";

import { Children, type ReactNode } from "react";

export { capLabel, capLabelClass, capLabelTruncateClass };

/**
 * Trims a block of one line to its cap height and baseline, so the line's middle is what the eye reads as its middle
 * rather than the font's own line box, which sits off it by a font-dependent amount. Where `text-box` is missing the
 * line box stays, and a control's fixed height is what keeps it whole.
 *
 * @internal
 */
const capLabelClass = "[text-box:trim-both_cap_alphabetic]";

/**
 * {@link capLabelClass} for a line that truncates: the padding gives the trim back the room it took above the caps
 * and under the baseline, and the negative margin takes it out of the layout again. Uses `overflow: clip`
 * (`overflow-clip`), not `truncate`'s `hidden`: `hidden` makes the box a scroll container when its content
 * overflows, and the trim padding can read there as scrollable overflow, so the padding itself reads as a stray
 * scrollbar and as cut text though nothing a person sees moves or clips.
 * {@link https://developer.mozilla.org/en-US/docs/web/css/overflow | MDN's `overflow` page} says `clip` does not
 * create a scroll container, so clipped content is skipped when an ancestor walk looks for one.
 *
 * @claim "`hidden` makes the box a scroll container when its content overflows" https://developer.mozilla.org/en-US/docs/web/css/overflow verify:urlOk(https://developer.mozilla.org/en-US/docs/web/css/overflow)
 * @claim "`clip` does not create a scroll container, so clipped content is skipped when an ancestor walk looks for one" https://developer.mozilla.org/en-US/docs/web/css/overflow verify:urlOk(https://developer.mozilla.org/en-US/docs/web/css/overflow)
 * @internal
 */
const capLabelTruncateClass = "[text-box:trim-both_cap_alphabetic] overflow-clip text-ellipsis whitespace-nowrap py-[0.3em] -my-[0.3em]";

/**
 * Wraps a control's text children in blocks of their own that {@link capLabelClass} trims, to centre them on
 * their cap height in a flex row. Elements pass through unchanged, as the icons and badges beside the words do.
 *
 * @example
 * <span className="inline-flex items-center">{capLabel("Save")}</span>
 * @internal
 */
function capLabel(children: ReactNode): ReactNode {
  const mapped = Children.map(children, (child) =>
    typeof child === "string" || typeof child === "number" ? <span data-slot="cap-label-text" className={capLabelClass}>{child}</span> : child,
  );
  // Children.map always returns an array, even for the common case of one child; React renders a multi-element
  // array as an implicit Fragment fiber, which a render-weight budget (Message's, for one) counts as a component.
  // Unwrapping the single-child case keeps that weight exactly what passing the child straight through costs.
  return Array.isArray(mapped) && mapped.length === 1 ? mapped[0] : mapped;
}
