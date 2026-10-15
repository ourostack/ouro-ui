import { MyRecipes } from "@/components/recipes/my-recipes"
import { Toaster } from "@/components/ui/toast"

export function App() {
  return (
    <Toaster>
      <MyRecipes />
    </Toaster>
  )
}
