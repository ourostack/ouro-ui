import { useEffect } from "react";
import { MyRecipes } from "@/my-recipes";
import { watchThemeSwitch } from "@/theme-switch";

export function App() {
  useEffect(() => watchThemeSwitch(), []);
  return <MyRecipes />;
}
