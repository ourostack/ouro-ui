import { createRef, useMemo, type JSX, type ReactNode } from "react";
import { OuroContext, useOuro } from "@/registry/ouro/lib/ouro/use-ouro";

// One page shows at a time, so one element holds its popups.
const popups = createRef<HTMLDivElement>();

/**
 * Around a page: its menus, selects and popovers open into <Popups /> in its <main>, so landmark navigation reaches them.
 * It sets OuroProvider's portalContainer through the context alone: OuroProvider would also bring Base UI's tooltip
 * provider into the landing page's first load, which has no tooltip.
 */
export function PopupsProvider({ children }: { children: ReactNode }): JSX.Element {
  const outer = useOuro();
  const value = useMemo(() => ({ ...outer, portalContainer: popups }), [outer]);
  return <OuroContext.Provider value={value}>{children}</OuroContext.Provider>;
}

/** Where the page's popups open: last in its <main>. */
export function Popups(): JSX.Element {
  return <div ref={popups} />;
}
