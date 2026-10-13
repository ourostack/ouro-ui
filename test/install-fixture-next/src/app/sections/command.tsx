import { Button } from "@/components/ouro/button/button";
import { Command } from "@/components/ouro/command/command";

async function newRecipe() {
  "use server";
}

// expect: Open command palette
// expect: aria-haspopup="dialog"
export default function CommandSection() {
  return (
    <Command
      title="Command palette"
      trigger={<Button>Open command palette</Button>}
      items={[{ label: "Recipes", items: [{ label: "New recipe", onSelect: newRecipe, shortcut: ["mod", "n"] }] }]}
    />
  );
}
