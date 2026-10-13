import { Children, isValidElement, type ReactNode } from "react";

/**
 * The element (or node) a Server Component passed as a prop or child. React's Flight client can hand a
 * client component a lazy wrapper in its place, with no `type` or `props`
 * (https://github.com/facebook/react/issues/32392), so cloning it renders `undefined`
 * and fails the build. `Children.toArray` resolves the wrapper, as Base UI's own
 * `render` prop does. Anything else comes back unchanged.
 *
 * Internal: Ouro UI components use it; apps don't need to.
 */
export function serverElement<T>(element: T): T {
  if ((element as { $$typeof?: symbol } | undefined)?.$$typeof !== Symbol.for("react.lazy")) return element;
  const resolved = Children.toArray(element as ReactNode)[0];
  return (isValidElement(resolved) ? resolved : element) as T;
}
