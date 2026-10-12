import { Children, isValidElement, type ReactElement } from "react";

// The symbol React marks a lazy wrapper with. It is not in React's public types.
const lazyType = Symbol.for("react.lazy");

/**
 * The element behind an element prop, such as a `trigger`, that a Server Component
 * passed. React can hand it to a client component as a lazy wrapper while a module it
 * needs is still loading (https://github.com/facebook/react/issues/32392). The wrapper
 * has no `props`, and `cloneElement` makes an element with no type from it, so unwrap it
 * before reading its props or cloning it. `Children.toArray` does the unwrapping, and
 * suspends until the element has loaded. Anything else is returned as it is.
 *
 * Internal: Ouro UI components use it; apps don't need to.
 */
export function unwrapLazyElement<T extends ReactElement>(element: T | undefined): T | undefined {
  if ((element as { $$typeof?: symbol } | undefined)?.$$typeof !== lazyType) return element;
  const unwrapped = Children.toArray(element)[0];
  // What is not an element stays wrapped, for React to report where it is rendered.
  return isValidElement(unwrapped) ? (unwrapped as T) : element;
}
