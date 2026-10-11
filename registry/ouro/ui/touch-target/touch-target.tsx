import type { JSX } from "react";

/**
 * Invisible hit-area expander for interactive components. Place it as the
 * first child of a `position: relative` control: on a coarse pointer it covers
 * at least 44x44px, centered on the control, so small controls are easy to tap
 * without growing visually. With a fine pointer it is not rendered as a box at
 * all, so dense desktop layouts keep their exact hit areas.
 *
 * Internal; not exported from the package.
 *
 * @example
 * <button className="ou:relative">
 *   <TouchTarget />
 *   Save
 * </button>
 */
export function TouchTarget(): JSX.Element {
  return (
    <span
      aria-hidden="true"
      data-ouro-touch-target=""
      className="ou:absolute ou:top-1/2 ou:left-1/2 ou:hidden ou:size-[max(100%,44px)] ou:-translate-1/2 ou:pointer-coarse:block"
    />
  );
}
