import { type JSX } from "react";
import { Button } from "@/registry/ouro/components/ouro/button/button";
import { Toaster } from "@/registry/ouro/components/ouro/toast/toaster";
import { toast } from "@/registry/ouro/lib/ouro/toast";

// The live demo at the top of docs/toaster/: the component as an app would use it, with its props, nothing else.

export default function ToasterDemo(): JSX.Element {
  return (
    <div className="flex flex-wrap items-center justify-center gap-3">
      <Button onClick={() => toast("Recipe saved", { tone: "success", description: "Find it in your cookbook." })}>Save recipe</Button>
      <Button
        tone="destructive"
        variant="soft"
        onClick={() => toast("Recipe deleted", { action: { label: "Undo", onClick: () => toast("Recipe restored", { tone: "success" }) } })}
      >
        Delete recipe
      </Button>
      <Toaster />
    </div>
  );
}
