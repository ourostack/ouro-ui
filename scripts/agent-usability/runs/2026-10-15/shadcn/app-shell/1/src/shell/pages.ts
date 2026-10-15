import { BookOpenIcon, HomeIcon, type LucideIcon, SettingsIcon, ShoppingCartIcon, UtensilsIcon } from "lucide-react";

export interface Page {
  name: string;
  hash: string;
  icon: LucideIcon;
}

export const pages: Page[] = [
  { name: "Home", hash: "#/", icon: HomeIcon },
  { name: "Recipes", hash: "#/recipes", icon: UtensilsIcon },
  { name: "Cookbooks", hash: "#/cookbooks", icon: BookOpenIcon },
  { name: "Shopping list", hash: "#/shopping-list", icon: ShoppingCartIcon },
  { name: "Settings", hash: "#/settings", icon: SettingsIcon },
];

export function pageForHash(hash: string): Page {
  const path = hash.replace(/^#/, "").replace(/\/+$/, "") || "/";
  return pages.find((page) => page.hash === `#${path}`) ?? pages[0];
}
