import { useCallback, type RefCallback } from "react";

/**
 * Makes a scroll container a tab stop while its content overflows, so a
 * keyboard user can focus it and scroll with the arrow keys. A dialog body of
 * plain text has nothing else to focus, and without this its overflow is out
 * of keyboard reach (axe `scrollable-region-focusable`, WCAG 2.1.1). It adds no
 * tab stop while the content fits.
 *
 * Pass `false` when the app set its own `tabIndex`, so the app's choice stands.
 *
 * Internal; not exported from the package.
 *
 * @example
 * const scrollRef = useKeyboardScrollable<HTMLDivElement>(props.tabIndex === undefined);
 */
export function useKeyboardScrollable<T extends HTMLElement>(enabled: boolean): RefCallback<T> {
  return useCallback(
    (element: T | null) => {
      if (!element || !enabled) return;
      const update = () => {
        if (element.scrollHeight > element.clientHeight) element.setAttribute("tabindex", "0");
        else element.removeAttribute("tabindex");
      };
      // The container resizes with the viewport; its content changes size as
      // children come and go, so watch the container and each child.
      const resize = new ResizeObserver(update);
      const observe = () => {
        resize.disconnect();
        resize.observe(element);
        for (const child of element.children) resize.observe(child);
      };
      const children = new MutationObserver(() => {
        observe();
        update();
      });
      observe();
      children.observe(element, { childList: true });
      update();
      return () => {
        resize.disconnect();
        children.disconnect();
      };
    },
    [enabled],
  );
}
