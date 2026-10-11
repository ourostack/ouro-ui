import { MotionConfig } from "motion/react";
import {
  createContext,
  useContext,
  useMemo,
  type AnchorHTMLAttributes,
  type ComponentType,
  type JSX,
  type ReactNode,
  type Ref,
} from "react";

/** A component that renders an internal link, such as a router's `Link`. */
export type OuroLinkComponent = ComponentType<
  AnchorHTMLAttributes<HTMLAnchorElement> & { href: string; ref?: Ref<HTMLAnchorElement> }
>;

export interface OuroContextValue {
  /** Renders internal links. Defaults to a plain `<a>`. */
  linkComponent: OuroLinkComponent;
}

const DefaultLink: OuroLinkComponent = (props) => <a {...props} />;

const OuroContext = createContext<OuroContextValue>({ linkComponent: DefaultLink });

/** Props for {@link OuroProvider}. */
export interface OuroProviderProps {
  /** Your app, or the part of it that uses Ouro UI. */
  children: ReactNode;
  /** Renders internal `href`s, for example an adapter around a router's `Link`. */
  linkComponent?: OuroLinkComponent;
}

/**
 * Optional app-level provider that routes internal `href`s through your
 * router's link. Ouro UI components work without it and honor reduced motion
 * themselves. Add it to supply a router `linkComponent` (client-side
 * navigation for internal `href`s), or to make your own Motion animations
 * follow the OS reduced-motion setting. It sets Motion's `reducedMotion="user"`
 * for its subtree, overriding any outer `MotionConfig`.
 *
 * Type a custom adapter with `ComponentProps<OuroLinkComponent>` so it always
 * compiles, including under `exactOptionalPropertyTypes`.
 *
 * @example
 * const RouterLink = (props: ComponentProps<OuroLinkComponent>) => <Link to={props.href} {...props} />;
 * <OuroProvider linkComponent={RouterLink}><App /></OuroProvider>
 */
export function OuroProvider({ children, linkComponent }: OuroProviderProps): JSX.Element {
  const value = useMemo<OuroContextValue>(
    () => ({ linkComponent: linkComponent ?? DefaultLink }),
    [linkComponent],
  );
  return (
    <MotionConfig reducedMotion="user">
      <OuroContext.Provider value={value}>{children}</OuroContext.Provider>
    </MotionConfig>
  );
}

/** Reads the {@link OuroProvider} settings; returns defaults when there is no provider. */
export function useOuro(): OuroContextValue {
  return useContext(OuroContext);
}
