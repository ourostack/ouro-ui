import { useEffect, type JSX } from "react";
import { pageKind, type PageKind } from "./paths";

/** A page module's component: it renders the whole page for a site path. */
export type PageComponent = (props: { path: string }) => JSX.Element;

/**
 * Each page kind is its own chunk, so the landing page, the voyage preview and the docs each load
 * only their own JavaScript (site/e2e/catalog.spec.ts measures each closure). The client entry
 * loads the module after the server HTML has painted, then hydrates.
 */
const modules: Record<PageKind, () => Promise<{ default: PageComponent }>> = {
  landing: () => import("./pages/landing"),
  voyage: () => import("./pages/voyage"),
  docs: () => import("./pages/docs"),
};

/** The component that renders a path, from its page module. */
export async function loadPage(path: string): Promise<PageComponent> {
  return (await modules[pageKind(path)]()).default;
}

/** The page for a site path (relative to the base). The server prerenders it; the client hydrates the same tree. */
export function App({ path, Page }: { path: string; Page: PageComponent }): JSX.Element {
  // Hydrated: the page answers from here on (the end-to-end specs wait for html[data-site-ready]).
  useEffect(() => {
    document.documentElement.setAttribute("data-site-ready", "");
    return () => document.documentElement.removeAttribute("data-site-ready");
  }, []);
  return <Page path={path} />;
}
