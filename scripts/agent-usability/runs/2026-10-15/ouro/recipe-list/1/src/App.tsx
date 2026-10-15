import { useEffect } from "react";
import { instantThemeSwitch } from "@/lib/instant-theme-switch";
import { RecipeList } from "@/recipes/RecipeList";

export function App() {
  useEffect(() => instantThemeSwitch(), []);
  return <RecipeList />;
}
