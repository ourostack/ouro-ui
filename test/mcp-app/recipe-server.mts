// An example MCP server that returns agent-composed UI as an MCP App: it serves the OuroMcpApp view, built with the
// recipe catalog, as a ui:// resource, and its show_recipe tool returns the recipe card a model composed (core's
// conformance case recipe-card-agent.json, a synthetic recipe) through core's mcpAppToolResult. The card's other
// buttons call the recipe app's own tools. It speaks MCP over stdio, one JSON-RPC message per line, with no SDK.
//
//   node test/mcp-app/recipe-server.mts --view <view.html>
//
// The host harness (registry/ouro/e2e/mcp-app-host/) starts it. Repository only; it ships in no item.
import { readFileSync } from "node:fs";
import { createInterface } from "node:readline";
import { parseArgs } from "node:util";
import { functionCallProblem, loadCatalog, mcpAppResource, mcpAppToolMeta, mcpAppToolResult } from "../../registry/ouro/lib/ouro/a2ui-core.ts";

const fixtures = new URL("../fixtures/a2ui/", import.meta.url);
const catalog = JSON.parse(readFileSync(new URL("recipe.catalog.json", fixtures), "utf8")) as unknown;
const card = JSON.parse(readFileSync(new URL("cases/recipe-card-agent.json", fixtures), "utf8")) as { messages: unknown[] };

const { values } = parseArgs({ options: { view: { type: "string" } } });
if (!values.view) throw new Error("Pass --view <view.html>: the OuroMcpApp view scripts/mcp-app.mts built with the recipe catalog.");
const VIEW = "ui://recipes/card";
const view = mcpAppResource({ uri: VIEW, name: "Recipe card", description: "A recipe, shown with Ouro HX", html: readFileSync(values.view, "utf8") });
// The card's photo is on the Ouro UI site; MCP Apps' default policy loads no other origin's images.
const viewMeta = { ui: { csp: { resourceDomains: ["https://ui.ouroboros.bot"] } } };

const recipe = { type: "object", properties: { recipe: { type: "string" } }, required: ["recipe"] };
const tools = [
  { name: "show_recipe", description: "Show the person a recipe as a card they can act on.", inputSchema: recipe, _meta: mcpAppToolMeta(VIEW) },
  { name: "get_recipe", description: "Open the whole recipe.", inputSchema: recipe },
  { name: "add_recipe_to_shopping_list", description: "Add this recipe's ingredients to your shopping list.", inputSchema: { ...recipe, properties: { ...recipe.properties, servings: { type: "integer" } } } },
  { name: "share_recipe", description: "Send this recipe to someone. Ask the person first.", inputSchema: { ...recipe, properties: { ...recipe.properties, with: { type: "string" } }, required: ["recipe", "with"] } },
  { name: "order_ingredients", description: "Only the person can order and pay; this tool refuses.", inputSchema: recipe },
];

const text = (t: string, isError = false) => ({ content: [{ type: "text", text: t }], ...(isError ? { isError: true } : {}) });

function callTool(name: string, args: Record<string, unknown>) {
  switch (name) {
    case "show_recipe":
      return mcpAppToolResult({ text: "Here is Charred Lemon Orzo: 25 minutes, serves 4.", catalog, messages: card.messages });
    case "get_recipe":
      return text(`Charred Lemon Orzo (${String(args.recipe)}): toast the orzo in brown butter, simmer in stock, finish with peas, parmesan and charred lemon.`);
    case "add_recipe_to_shopping_list":
      return text(`Added 6 ingredients for ${String(args.servings ?? 4)} servings to your shopping list.`);
    case "share_recipe":
      return text(`Shared Charred Lemon Orzo with ${String(args.with)}.`);
    case "order_ingredients":
      return text(functionCallProblem(loadCatalog(catalog), name).message, true);
    default:
      throw Object.assign(new Error(`There is no tool named ${name}.`), { code: -32602 });
  }
}

function handle(method: string, params: Record<string, unknown>): object {
  switch (method) {
    case "initialize":
      return { protocolVersion: String(params.protocolVersion ?? "2025-06-18"), capabilities: { tools: {}, resources: {} }, serverInfo: { name: "ouro-recipe-example", version: "1.0.0" } };
    case "ping":
      return {};
    case "tools/list":
      return { tools };
    case "tools/call":
      return callTool(String(params.name), (params.arguments ?? {}) as Record<string, unknown>);
    case "resources/list":
      return { resources: [{ ...view.listing, _meta: viewMeta }] };
    case "resources/read":
      if (params.uri !== VIEW) throw Object.assign(new Error(`There is no resource ${String(params.uri)}.`), { code: -32002 });
      return { contents: [{ ...view.contents, _meta: viewMeta }] };
    default:
      throw Object.assign(new Error(`${method} is not a method this server has.`), { code: -32601 });
  }
}

for await (const line of createInterface({ input: process.stdin })) {
  if (!line.trim()) continue;
  const message = JSON.parse(line) as { id?: number | string; method: string; params?: Record<string, unknown> };
  if (message.id === undefined) continue;
  try {
    process.stdout.write(JSON.stringify({ jsonrpc: "2.0", id: message.id, result: handle(message.method, message.params ?? {}) }) + "\n");
  } catch (e) {
    const error = e as Error & { code?: number };
    process.stdout.write(JSON.stringify({ jsonrpc: "2.0", id: message.id, error: { code: error.code ?? -32603, message: error.message } }) + "\n");
  }
}
