import { type JSX, useState } from "react";
import { CodeBlock } from "@/registry/ouro/components/ouro/code-block/code-block";
import { Collapsible } from "@/registry/ouro/components/ouro/collapsible/collapsible";
import { ComposedSurface } from "@/registry/ouro/components/ouro/composed-surface/composed-surface";
import { Text } from "@/registry/ouro/components/ouro/text/text";
import { mcpAppTreeResult } from "@/registry/ouro/lib/ouro/a2ui-core";
import { recipeCatalog, recipeFormTree } from "@/test/fixtures/composed/recipe-tree";

// The live demo at the top of docs/composed-surface/: a recipe card an agent composed as Ouro's tree, asking the person
// how many servings to shop for and who to share it with. Below it is exactly what the agent sent, an MCP tool result's
// structuredContent.ouro. Each press says what it would run, with what the person entered; sharing asks first, and
// ordering hands the person to the app. The app names the recipe its confirm sheet shows, so the sheet reads "Charred
// Lemon Orzo" with the id beside it. The demo loads the picture this build ships, so a preview or a pull request's build
// shows it before it is deployed.

const titles: Record<string, string> = { rcp_lemon_orzo: "Charred Lemon Orzo" };
const { tree, data } = recipeFormTree({ image: "/a2ui/v1/examples/charred-lemon-orzo.png", label: ({ value }) => titles[value] });
// mcpAppTreeResult validates the tree against the catalog, so the demo can't show a tree the view would refuse.
const sent = JSON.stringify(mcpAppTreeResult({ text: "Charred Lemon Orzo", catalog: recipeCatalog, tree, data }).structuredContent.ouro, null, 2);

export default function ComposedSurfaceDemo(): JSX.Element {
  const [last, setLast] = useState("Fill in the card, then press a button.");
  return (
    <div className="grid max-w-sm gap-3">
      <ComposedSurface tree={tree} data={data} onPress={({ action, input }) => setLast(`Runs ${action} with ${JSON.stringify(input)}.`)} onHandoff={({ how }) => setLast(`Opens the app, to do it ${how}.`)} />
      <Text tone="muted" aria-live="polite">
        {last}
      </Text>
      <Collapsible title="What the agent sent">
        <CodeBlock code={sent} language="json" title="structuredContent.ouro" />
      </Collapsible>
    </div>
  );
}
