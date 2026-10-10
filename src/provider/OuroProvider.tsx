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

export interface OuroProviderProps {
  children: ReactNode;
  /** Router link component used for internal `href`s, for example React Router's `Link` adapted to `href`. */
  linkComponent?: OuroLinkComponent;
}

/**
 * Optional app-level provider. Components work without it; add it only when you
 * need a router `linkComponent` (client-side navigation for `href`) or want to
 * override reduced motion (it sets Motion's `reducedMotion="user"`, which follows
 * the OS setting).
 *
 * @example
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
