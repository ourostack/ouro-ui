import { type JSX, useMemo, useState } from "react";
import { OuroMcpApp } from "@/registry/ouro/components/ouro/mcp-app/ouro-mcp-app";
import { Text } from "@/registry/ouro/components/ouro/text/text";
import type { McpAppHostLink, McpAppMessage } from "@/registry/ouro/lib/ouro/mcp-app";
import recipeCase from "@/test/fixtures/a2ui/cases/recipe-card-agent.json";
import catalog from "@/test/fixtures/a2ui/recipe.catalog.json";

// The live demo at the top of docs/ouro-mcp-app/: the view as an MCP host frames it, with the page playing the host.
// The tool's result is the card a model composed from a recipe app's catalog and a synthetic recipe (core's
// conformance case recipe-card-agent.json); the line under it says what the view asked the host for.

// The case names the picture's address on the live site; the demo loads the copy this build ships, so a preview or a
// pull request's build shows it before it is deployed.
const LIVE = "https://ui.ouroboros.bot/a2ui/v1/examples/";
const messages = JSON.parse(JSON.stringify(recipeCase.messages).replaceAll(LIVE, "/a2ui/v1/examples/")) as unknown[];

/** A host in the page: answers the view as an MCP Apps host would, and reports each request. */
function pageHost(report: (line: string) => void): McpAppHostLink {
  let listener: ((message: unknown) => void) | undefined;
  const send = (message: object) => queueMicrotask(() => listener?.({ jsonrpc: "2.0", ...message }));
  return {
    post: (m: McpAppMessage) => {
      if (m.method === "ui/initialize") send({ id: m.id, result: { protocolVersion: "2026-01-26", hostInfo: { name: "docs", version: "1.0.0" }, hostCapabilities: { openLinks: {} }, hostContext: {} } });
      else if (m.method === "ui/notifications/initialized") send({ method: "ui/notifications/tool-result", params: { content: [{ type: "text", text: "Here is Charred Lemon Orzo." }], structuredContent: { a2ui: { version: "1.0", catalogId: catalog.catalogId, messages } } } });
      else if (m.method === "tools/call") {
        const { name, arguments: args } = m.params as { name: string; arguments: unknown };
        report(`The host calls the ${name} tool with ${JSON.stringify(args)}.`);
        send({ id: m.id, result: { content: [{ type: "text", text: `${name} ran.` }] } });
      } else if (m.method === "ui/open-link") {
        report(`The host opens ${(m.params as { url: string }).url}.`);
        send({ id: m.id, result: {} });
      }
    },
    listen: (onMessage) => {
      listener = onMessage;
      return () => {
        listener = undefined;
      };
    },
  };
}

export default function OuroMcpAppDemo(): JSX.Element {
  const [last, setLast] = useState("Press a button.");
  const host = useMemo(() => pageHost(setLast), []);
  return (
    <div className="grid max-w-md gap-3">
      <OuroMcpApp catalog={catalog} host={host} handoffUrl={({ action }) => `https://kitchen.example.com/recipes/rcp_lemon_orzo?do=${action}`} />
      <Text tone="muted" aria-live="polite">
        {last}
      </Text>
    </div>
  );
}
