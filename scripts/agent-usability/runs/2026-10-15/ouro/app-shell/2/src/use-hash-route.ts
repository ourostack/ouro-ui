import { useEffect, useState } from "react";

/** A page of the app, addressed by the URL hash: `#/recipes`. */
export interface Page {
  path: string;
  title: string;
}

export const pages = [
  { path: "/", title: "Home" },
  { path: "/recipes", title: "Recipes" },
  { path: "/cookbooks", title: "Cookbooks" },
  { path: "/shopping-list", title: "Shopping list" },
  { path: "/settings", title: "Settings" },
] as const satisfies readonly Page[];

/** The page for a hash, or `undefined` when the hash is not a route (an in-page anchor). */
function pageFor(hash: string): Page | undefined {
  if (hash === "" || hash === "#") return pages[0];
  if (!hash.startsWith("#/")) return undefined;
  const path = hash.slice(1).replace(/\/+$/, "") || "/";
  return pages.find((page) => page.path === path) ?? pages[0];
}

/** The page the URL hash points at, kept in step with the hash. */
export function useHashRoute(): Page {
  const [page, setPage] = useState<Page>(() => pageFor(window.location.hash) ?? pages[0]);
  useEffect(() => {
    // A hash that is not a route, such as an in-page anchor, keeps the current page.
    const onHashChange = () => {
      const next = pageFor(window.location.hash);
      if (next !== undefined) setPage(next);
    };
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, []);
  return page;
}
