import * as React from "react"
import {
  BookOpenIcon,
  CookingPotIcon,
  HouseIcon,
  SettingsIcon,
  ShoppingBasketIcon,
  type LucideIcon,
} from "lucide-react"

export interface Page {
  name: string
  hash: string
  icon: LucideIcon
}

export const pages: Page[] = [
  { name: "Home", hash: "#/", icon: HouseIcon },
  { name: "Recipes", hash: "#/recipes", icon: CookingPotIcon },
  { name: "Cookbooks", hash: "#/cookbooks", icon: BookOpenIcon },
  { name: "Shopping list", hash: "#/shopping-list", icon: ShoppingBasketIcon },
  { name: "Settings", hash: "#/settings", icon: SettingsIcon },
]

function subscribe(onChange: () => void) {
  window.addEventListener("hashchange", onChange)
  return () => window.removeEventListener("hashchange", onChange)
}

function getHash() {
  return window.location.hash
}

/** The page named by the URL hash. Unknown or empty hashes show Home. */
export function useHashRoute(): Page {
  const hash = React.useSyncExternalStore(subscribe, getHash)
  const path = hash.replace(/\/+$/, "") || "#"
  return pages.find((page) => page.hash.replace(/\/+$/, "") === path) ?? pages[0]
}
