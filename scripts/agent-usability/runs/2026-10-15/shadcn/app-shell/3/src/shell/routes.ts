import * as React from "react"

export interface Page {
  name: string
  hash: string
}

export const pages: Page[] = [
  { name: "Home", hash: "#/" },
  { name: "Recipes", hash: "#/recipes" },
  { name: "Cookbooks", hash: "#/cookbooks" },
  { name: "Shopping list", hash: "#/shopping-list" },
  { name: "Settings", hash: "#/settings" },
]

function pageFromHash(hash: string): Page {
  // "", "#" and trailing slashes all name the same pages as their canonical hashes.
  const normalized = hash.length > 2 ? hash.replace(/\/+$/, "") : "#/"
  return pages.find((page) => page.hash === normalized) ?? pages[0]
}

function subscribe(onChange: () => void) {
  window.addEventListener("hashchange", onChange)
  return () => window.removeEventListener("hashchange", onChange)
}

/** The page named by the URL hash. Unknown hashes show Home. */
export function useCurrentPage(): Page {
  const hash = React.useSyncExternalStore(subscribe, () => window.location.hash)
  return pageFromHash(hash)
}
