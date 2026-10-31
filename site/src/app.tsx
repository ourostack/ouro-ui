import { useEffect, type JSX } from "react";
import { hydratedInTurn } from "./hydrate";
import { pageKind, type PageKind } from "./paths";

/** A page module's component: it renders the whole page for a site path. */
export type PageComponent = (props: { path: string }) => JSX.Element;

/**
 * Each page kind is its own chunk, so the voyage pages (home and the Nautilus) and the docs each load
 * only their own JavaScript (site/e2e/catalog.spec.ts measures each closure). The client entry
 * loads the module after the server HTML has painted, then hydrates.
 */
/** A page module: its component and, if it has one, what it loads before it renders (a docs page's Markdown). */
interface PageModule {
  default: PageComponent;
  prepare?: (path: string) => Promise<void>;
}

const modules: Record<PageKind, () => Promise<PageModule>> = {
  voyage: () => import("./pages/voyage"),
  docs: () => import("./pages/docs"),
};

/** The component that renders a path, from its page module, once the module has loaded what the path's page needs. */
export async function loadPage(path: string): Promise<PageComponent> {
  const page = await modules[pageKind(path)]();
  await page.prepare?.(path);
  return page.default;
}

/** The page for a site path (relative to the base). The server prerenders it; the client hydrates the same tree. */
export function App({ path, Page }: { path: string; Page: PageComponent }): JSX.Element {
  // Hydrated, every boundary that waits its turn too (hydrate.tsx): the page answers from here on
  // (the end-to-end specs wait for html[data-site-ready]).
  useEffect(() => {
    let live = true;
    void hydratedInTurn().then(() => live && document.documentElement.setAttribute("data-site-ready", ""));
    return () => {
      live = false;
      document.documentElement.removeAttribute("data-site-ready");
    };
  }, []);
  return <Page path={path} />;
}
