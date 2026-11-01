"use client";

import { createContext, createElement, useContext, type AnchorHTMLAttributes, type ComponentType, type Ref, type RefObject } from "react";
import { useMediaQuery } from "@/registry/ouro/lib/ouro/use-media-query";

// The OuroProvider context and its hook, apart from the provider so ouro-provider.tsx
// exports only components (React Fast Refresh).

/** A component that renders an internal link, such as a router's `Link`. */
export type OuroLinkComponent = ComponentType<
  AnchorHTMLAttributes<HTMLAnchorElement> & { href: string; ref?: Ref<HTMLAnchorElement> }
>;

/**
 * How much Ouro UI moves: `system` follows the device's reduced-motion setting, `reduced` moves
 * as with that setting on, and `full` as with it off, whatever the device says.
 */
export type OuroMotion = "system" | "reduced" | "full";

export interface OuroContextValue {
  /** Renders internal links. Defaults to a plain `<a>`. */
  linkComponent: OuroLinkComponent;
  /** Where floating popups render. Unset, they render where Base UI puts them: the end of `<body>`, or the portal they open from. */
  portalContainer?: HTMLElement | RefObject<HTMLElement | null> | undefined;
  /** How much Ouro UI moves. Unset, it follows the device: `system`. */
  motion?: OuroMotion | undefined;
}

/**
 * The link `OuroProvider` uses without a `linkComponent`: a plain `<a>`.
 *
 * @internal
 */
export const DefaultLink: OuroLinkComponent = (props) => createElement("a", props);

/**
 * The settings `OuroProvider` provides.
 *
 * @internal
 */
export const OuroContext = createContext<OuroContextValue>({ linkComponent: DefaultLink });

/**
 * Reads the `OuroProvider` settings; returns defaults when there is no provider.
 *
 * @claim "Reads the `OuroProvider` settings; returns defaults" registry/ouro/lib/ouro/ouro-provider.test.tsx verify:testExists(registry/ouro/lib/ouro/ouro-provider.test.tsx::OuroProvider and useOuro > defaults to a plain anchor without a provider)
 */
export function useOuro(): OuroContextValue {
  return useContext(OuroContext);
}

/**
 * Whether to reduce motion under a provider's `motion`, asking the device now: for code that runs
 * long after a render, such as a frame loop, which must see a change of the device's setting at once.
 *
 * @internal
 */
export function reducesMotion(motion: OuroMotion | undefined): boolean {
  return motion === "reduced" || (motion !== "full" && matchMedia("(prefers-reduced-motion: reduce)").matches);
}

/**
 * Whether to reduce motion: `true` under `<OuroProvider motion="reduced">`, `false` under
 * `motion="full"`, and otherwise what the device's `prefers-reduced-motion` says, live.
 * `serverDefault` is the answer while the server renders and the page hydrates, as with
 * `useMediaQuery`. Ouro UI's own motion in script (springs, smooth scrolls, a moment's
 * entrance) reads it; read it in your own components to follow the same setting.
 *
 * @example
 * const reduced = useReducedMotion();
 * element.scrollIntoView({ behavior: reduced ? "instant" : "smooth" });
 * @claim "Whether to reduce motion" registry/ouro/lib/ouro/ouro-provider.test.tsx verify:testExists(registry/ouro/lib/ouro/ouro-provider.test.tsx::OuroProvider motion > answers useReducedMotion by its motion, and by the device under system or no provider)
 */
export function useReducedMotion(serverDefault = false): boolean {
  const { motion } = useOuro();
  const device = useMediaQuery("(prefers-reduced-motion: reduce)", serverDefault);
  return motion === "reduced" || (motion !== "full" && device);
}
