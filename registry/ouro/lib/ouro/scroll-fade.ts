"use client";

import { useEffect, type RefObject } from "react";

/**
 * The mask a box that scrolls sideways takes with {@link useScrollFade}: its content fades out
 * at each side that hides more, over as much as that side hides, up to 2rem. A gradient mask
 * is read for its alpha (`mask-mode: match-source`), so `#000` only means opaque and no color
 * of it reaches the page, in light, dark or forced colors. With nothing to the side, the box
 * has no mask at all.
 *
 * Internal: Ouro UI components use it; apps don't need to.
 * @claim "its content fades out at each side that hides more" registry/ouro/lib/ouro/scroll-fade.test.tsx verify:testExists(registry/ouro/lib/ouro/scroll-fade.test.tsx::useScrollFade > fades the side that hides more, as far as it hides, and follows the scroll)
 * @claim "With nothing to the side, the box has no mask at all" registry/ouro/lib/ouro/scroll-fade.test.tsx verify:testExists(registry/ouro/lib/ouro/scroll-fade.test.tsx::useScrollFade > adds nothing while the content fits, or when the box clips instead of scrolling)
 * @claim "no color of it reaches the page, in light, dark or forced colors" registry/ouro/lib/ouro/scroll-fade.test.tsx verify:testExists(registry/ouro/lib/ouro/scroll-fade.test.tsx::useScrollFade > keeps the same mask in dark and forced colors, since the mask carries no color)
 * @claim "A gradient mask is read for its alpha" https://developer.mozilla.org/en-US/docs/Web/CSS/mask-mode verify:urlOk(https://developer.mozilla.org/en-US/docs/Web/CSS/mask-mode)
 */
export const scrollFadeClass =
  "data-ouro-scroll-fade:[mask-image:linear-gradient(to_right,transparent,#000_min(var(--ouro-scroll-fade-left),2rem),#000_calc(100%-min(var(--ouro-scroll-fade-right),2rem)),transparent)]";

/**
 * Shows that a box scrolls sideways: while its content is wider than it, the box gets
 * `data-ouro-scroll-fade` and how far its content runs past each side, as
 * `--ouro-scroll-fade-left` and `--ouro-scroll-fade-right`, for {@link scrollFadeClass}. At rest a
 * cut-off table or line of code fades out where it continues, rather than looking cut off.
 * Physical sides, so a right-to-left box fades on its left. It follows the scroll, the box's
 * size and its first child's size (the content), and leaves keyboard scrolling to the box.
 * Masking hides an outline on the box itself, so draw the box's focus ring on an element
 * the mask doesn't cover.
 *
 * Internal: Ouro UI components use it; apps don't need to.
 *
 * @example
 * const codeRef = useRef<HTMLPreElement>(null);
 * useScrollFade(codeRef);
 * <pre ref={codeRef} className={cn("overflow-auto", scrollFadeClass)}>…</pre>
 * @claim "Shows that a box scrolls sideways" registry/ouro/lib/ouro/scroll-fade.test.tsx verify:testExists(registry/ouro/lib/ouro/scroll-fade.test.tsx::useScrollFade > fades the side that hides more, as far as it hides, and follows the scroll)
 * @claim "Physical sides, so a right-to-left box fades on its left" registry/ouro/lib/ouro/scroll-fade.test.tsx verify:testExists(registry/ouro/lib/ouro/scroll-fade.test.tsx::useScrollFade > fades the left in a right-to-left box)
 * @claim "It follows the scroll, the box's size and its first child's size" registry/ouro/lib/ouro/scroll-fade.test.tsx verify:testExists(registry/ouro/lib/ouro/scroll-fade.test.tsx::useScrollFade > follows the box's size and its content's, and stops when it unmounts)
 */
export function useScrollFade(ref: RefObject<HTMLElement | null>): void {
  useEffect(
    () => {
      const element = ref.current!;
      const update = () => {
        const style = getComputedStyle(element);
        const overflow = element.scrollWidth - element.clientWidth;
        // More than a pixel, so a width that rounds up never fades.
        if (overflow > 1 && /auto|scroll/.test(style.overflowX)) {
          // In a right-to-left box, scrollLeft runs from 0 down to a negative number.
          const scrolled = Math.abs(element.scrollLeft);
          const [left, right] = style.direction === "rtl" ? [overflow - scrolled, scrolled] : [scrolled, overflow - scrolled];
          element.setAttribute("data-ouro-scroll-fade", "");
          element.style.setProperty("--ouro-scroll-fade-left", `${left}px`);
          element.style.setProperty("--ouro-scroll-fade-right", `${right}px`);
        } else {
          element.removeAttribute("data-ouro-scroll-fade");
          element.style.removeProperty("--ouro-scroll-fade-left");
          element.style.removeProperty("--ouro-scroll-fade-right");
        }
      };
      const observer = new ResizeObserver(update);
      observer.observe(element);
      observer.observe(element.firstElementChild!);
      element.addEventListener("scroll", update);
      return () => {
        observer.disconnect();
        element.removeEventListener("scroll", update);
      };
    },
    // Stryker disable next-line ArrayDeclaration: a component's ref object is the same on each render, so it runs once either way.
    [ref],
  );
}
