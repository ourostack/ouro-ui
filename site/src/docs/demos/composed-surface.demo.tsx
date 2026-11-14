import { type JSX, useState } from "react";
import { ComposedSurface } from "@/registry/ouro/components/ouro/composed-surface/composed-surface";
import { Text } from "@/registry/ouro/components/ouro/text/text";
import { recipeTree } from "@/test/fixtures/composed/recipe-tree";

// The live demo at the top of docs/composed-surface/: a recipe card as Ouro's composed tree, built in code from a
// recipe app's catalog and a synthetic recipe, with what each button would do. The app names the recipe its confirm
// sheet shows, so the sheet reads "Charred Lemon Orzo" with the id beside it. The demo loads the picture this build
// ships, so a preview or a pull request's build shows it before it is deployed.

const titles: Record<string, string> = { rcp_lemon_orzo: "Charred Lemon Orzo" };
const tree = recipeTree({ image: "/a2ui/v1/examples/charred-lemon-orzo.png", label: ({ value }) => titles[value] });

export default function ComposedSurfaceDemo(): JSX.Element {
  const [last, setLast] = useState("Press a button.");
  return (
    <div className="grid max-w-md gap-3">
      <ComposedSurface tree={tree} onPress={({ action, input }) => setLast(`Runs ${action} with ${JSON.stringify(input)}.`)} onHandoff={({ how }) => setLast(`Opens the app, to do it ${how}.`)} />
      <Text tone="muted" aria-live="polite">
        {last}
      </Text>
    </div>
  );
}
