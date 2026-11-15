import { ComposedSurface } from "@/components/ouro/composed-surface/composed-surface";
import type { ComposedNode } from "@/lib/ouro/a2ui-core";

const tree: ComposedNode = {
  id: "root",
  component: "Card",
  props: {},
  children: [
    { id: "title", component: "Heading", props: { text: "ouro composed surface title", level: 2 }, children: [] },
    { id: "body", component: "Text", props: { text: "Composed by an agent.", tone: "default" }, children: [] },
  ],
};

async function runAction() {
  "use server";
}

async function openApp() {
  "use server";
}

// expect: data-ouro="composed-surface"
// expect: ouro composed surface title
export default function ComposedSurfaceSection() {
  return <ComposedSurface tree={tree} onPress={runAction} onHandoff={openApp} />;
}
