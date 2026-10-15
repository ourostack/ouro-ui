import { RecipeListPage } from "@/components/recipe-list-page"
import { useInstantThemeSwitch } from "@/hooks/use-instant-theme-switch"

export function App() {
  useInstantThemeSwitch()

  return <RecipeListPage />
}
