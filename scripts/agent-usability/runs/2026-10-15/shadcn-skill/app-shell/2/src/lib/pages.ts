import {
  BookOpenIcon,
  CookingPotIcon,
  HouseIcon,
  SettingsIcon,
  ShoppingCartIcon,
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
  { name: "Shopping list", hash: "#/shopping-list", icon: ShoppingCartIcon },
  { name: "Settings", hash: "#/settings", icon: SettingsIcon },
]

/** The page for a URL hash. An empty or unknown hash shows Home. */
export function pageForHash(hash: string): Page {
  return pages.find((page) => page.hash === hash) ?? pages[0]
}
