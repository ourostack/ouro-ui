import { OuroMcpApp } from "@/components/ouro/mcp-app/ouro-mcp-app";

const catalog = {
  catalogId: "https://example.com/a2ui/catalog.json",
  components: { Card: {}, Heading: {}, Text: {} },
};

// The view waits for its host's tool result, so the server renders its spinner.
// expect: data-ouro="ouro-mcp-app"
// expect: Waiting for the card
export default function OuroMcpAppSection() {
  return <OuroMcpApp catalog={catalog} />;
}
