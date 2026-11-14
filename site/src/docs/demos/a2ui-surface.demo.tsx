import { type JSX, useState } from "react";
import { A2UISurface } from "@/registry/ouro/components/ouro/a2ui-surface/a2ui-surface";
import { Text } from "@/registry/ouro/components/ouro/text/text";
import recipeCase from "@/test/fixtures/a2ui/cases/recipe-card-agent.json";
import catalog from "@/test/fixtures/a2ui/recipe.catalog.json";

// The live demo at the top of docs/a2ui-surface/: the card a model composed from a recipe app's catalog and a
// synthetic recipe (core's conformance case recipe-card-agent.json), with what each button would do.

// The case names the picture's address on the live site; the demo loads the copy this build ships, so a preview or a
// pull request's build shows it before it is deployed.
const LIVE = "https://ui.ouroboros.bot/a2ui/v1/examples/";
const messages = JSON.parse(JSON.stringify(recipeCase.messages).replaceAll(LIVE, "/a2ui/v1/examples/")) as unknown[];

export default function A2UISurfaceDemo(): JSX.Element {
  const [last, setLast] = useState("Press a button.");
  return (
    <div className="grid max-w-md gap-3">
      <A2UISurface
        catalog={catalog}
        messages={messages}
        onAction={({ action }) => setLast(`Sent ${action.name} with ${JSON.stringify(action.context)}.`)}
        onHandoff={({ how }) => setLast(`Opens the app, to do it ${how}.`)}
      />
      <Text tone="muted" aria-live="polite">
        {last}
      </Text>
    </div>
  );
}
