import { A2UISurface } from "@/components/ouro/a2ui-surface/a2ui-surface";

const catalog = {
  catalogId: "https://example.com/a2ui/catalog.json",
  components: { Card: {}, Heading: {}, Text: {} },
};

const messages = [
  {
    version: "1.0",
    createSurface: {
      surfaceId: "card",
      catalogId: catalog.catalogId,
      components: [
        { id: "root", component: "Card", children: ["title", "body"] },
        { id: "title", component: "Heading", text: "ouro a2ui surface title", level: 2 },
        { id: "body", component: "Text", text: "Composed by an agent." },
      ],
    },
  },
];

async function runAction() {
  "use server";
}

async function openApp() {
  "use server";
}

// expect: data-ouro="a2ui-surface"
// expect: ouro a2ui surface title
export default function A2UISurfaceSection() {
  return <A2UISurface catalog={catalog} messages={messages} onAction={runAction} onHandoff={openApp} />;
}
