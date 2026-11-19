#!/usr/bin/env node
// The registry's MCP door: a stdio server that lists the tools in actions/generated/mcp.json and answers each call from
// the registry (registry.json, written by `pnpm registry`) and the docs folder. Run it from the repository root:
//   node actions/server/registry-mcp.mts            serve MCP over stdin and stdout
//   node actions/server/registry-mcp.mts --tools    print the tool names it registers, as a JSON array (the X-ray's inventory)
import { readFile } from "node:fs/promises";
import { createInterface } from "node:readline";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const SITE = "https://ui.ouroboros.bot";
const MODERN = "2026-07-28";
const LEGACY = ["2025-11-25", "2025-06-18", "2025-03-26", "2024-11-05"];
const META = "io.modelcontextprotocol/";
const CACHE = { ttlMs: 3_600_000, cacheScope: "public" };

export interface RegistryItem {
  name: string;
  title?: string;
  description?: string;
}
export interface Registry {
  items: RegistryItem[];
}
export interface Tool {
  name: string;
  description: string;
  inputSchema: { properties: Record<string, { type: string; description?: string }>; required: string[] };
  [key: string]: unknown;
}
export interface Context {
  registry: Registry;
  tools: Tool[];
  release: string;
  root: string;
}
interface Call {
  name?: unknown;
  arguments?: Record<string, unknown>;
}
export interface Answer {
  content: { type: "text"; text: string }[];
  structuredContent?: Record<string, unknown>;
  isError?: boolean;
}

/** The release tag the install commands pin: ouro.latestRelease in package.json, the one tag the docs name. */
export async function latestRelease(root: string): Promise<string> {
  const pkg = JSON.parse(await readFile(join(root, "package.json"), "utf8")) as { ouro?: { latestRelease?: unknown } };
  if (typeof pkg.ouro?.latestRelease !== "string") throw new Error("package.json has no ouro.latestRelease");
  return pkg.ouro.latestRelease;
}

/** Loads what the tools answer from: the generated registry, the tool list and the release. */
export async function loadContext(root = repoRoot): Promise<Context> {
  const registry = JSON.parse(await readFile(join(root, "registry.json"), "utf8")) as Registry;
  const mcp = JSON.parse(await readFile(join(root, "actions/generated/mcp.json"), "utf8")) as { tools: Tool[] };
  return { registry, tools: mcp.tools, release: await latestRelease(root), root };
}

const itemNamed = (ctx: Context, name: string) => ctx.registry.items.find((item) => item.name === name);

/** The PascalCase export name a component's docs page is written under: docs/<Export>.md. */
export const exportName = (item: string) => item.split("-").map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join("");

/** The names of the registry items whose name contains the filter, ignoring case, in registry order. */
export function listNames(ctx: Context, filter = ""): string {
  const wanted = filter.toLowerCase();
  return ctx.registry.items.map((item) => item.name).filter((name) => name.includes(wanted)).join(", ");
}

/** The command that adds one item, pinned to the release. */
export const installCommand = (name: string, release: string) => `npx shadcn@latest add ourostack/ouro-ui/${name}#${release}`;

async function docsMarkdown(root: string, name: string): Promise<string> {
  try {
    return await readFile(join(root, "docs", `${exportName(name)}.md`), "utf8");
  } catch {
    return "";
  }
}

const text = (value: Record<string, unknown>, isError = false): Answer => ({
  content: [{ type: "text", text: JSON.stringify(value) }],
  structuredContent: value,
  ...(isError ? { isError: true } : {}),
});

/** Runs one tool. Unknown or incomplete calls answer as tool errors that name the fix. */
export async function callTool(ctx: Context, name: string, args: Record<string, unknown>): Promise<Answer> {
  const tool = ctx.tools.find((t) => t.name === name);
  if (!tool) throw new RpcError(-32602, `No tool named ${name}. Call tools/list for the tools this server has.`);
  const missing = tool.inputSchema.required.find((field) => typeof args[field] !== "string");
  if (missing) {
    return text({ error: `Missing required argument ${missing}. Fix: pass ${missing} as a string, such as "dialog".` }, true);
  }
  if (name === "list_registry_items") {
    return text({ names: listNames(ctx, typeof args["filter"] === "string" ? args["filter"] : "") });
  }
  const item = itemNamed(ctx, String(args["name"]));
  if (!item) return text({ error: `No registry item named ${String(args["name"])}. Fix: call list_registry_items and use one of its names.` }, true);
  if (name === "get_item_install") return text({ command: installCommand(item.name, ctx.release), release: ctx.release });
  if (name === "get_item_docs") {
    return text({ url: `${SITE}/docs/${item.name}/`, markdown: await docsMarkdown(ctx.root, item.name) });
  }
  throw new RpcError(-32601, `Tool ${name} has no handler.`);
}

class RpcError extends Error {
  code: number;
  constructor(code: number, message: string) {
    super(message);
    this.code = code;
  }
}

interface Request {
  id?: number | string;
  method?: string;
  params?: Record<string, unknown>;
}

/** Answers one JSON-RPC message; undefined for a notification, which takes no answer. */
export async function handleMessage(ctx: Context, message: Request): Promise<Record<string, unknown> | undefined> {
  if (message.id === undefined) return undefined;
  const serverInfo = { name: "ouro-ui-registry", version: ctx.release };
  // A request that names its version in _meta is MCP 2026-07-28's and stands alone; one without is an older client's, after initialize.
  const asked = (message.params?.["_meta"] as Record<string, unknown> | undefined)?.[`${META}protocolVersion`];
  const modern = asked !== undefined;
  const reply = (result: Record<string, unknown>) => ({ jsonrpc: "2.0", id: message.id, result: modern ? { resultType: "complete", ...result, _meta: { [`${META}serverInfo`]: serverInfo } } : result });
  try {
    if (modern && asked !== MODERN) {
      throw new RpcError(-32022, `Unsupported protocol version: ${String(asked)}. Send "${MODERN}" in _meta; the older versions open with initialize instead.`);
    }
    switch (message.method) {
      case "server/discover":
        if (!modern) throw new RpcError(-32602, `Invalid params: send _meta["${META}protocolVersion"]: "${MODERN}" and _meta["${META}clientCapabilities"]: {} with server/discover.`);
        return reply({ supportedVersions: [MODERN, ...LEGACY], capabilities: { tools: {} }, ...CACHE });
      case "initialize": {
        const requested = message.params?.["protocolVersion"];
        return reply({ protocolVersion: LEGACY.find((v) => v === requested) ?? LEGACY[0], capabilities: { tools: {} }, serverInfo });
      }
      case "ping":
        return reply({});
      case "tools/list":
        return reply({ tools: ctx.tools, ...(modern ? CACHE : {}) });
      case "tools/call": {
        const call = (message.params ?? {}) as Call;
        return reply(await callTool(ctx, String(call.name), call.arguments ?? {}));
      }
      default:
        throw new RpcError(-32601, `Method ${String(message.method)} is not served here.`);
    }
  } catch (error) {
    const code = error instanceof RpcError ? error.code : -32603;
    return { jsonrpc: "2.0", id: message.id, error: { code, message: error instanceof Error ? error.message : String(error) } };
  }
}

/** Serves JSON-RPC over stdin and stdout, one message per line, until stdin closes. */
export function serve(ctx: Context, input = process.stdin, output = process.stdout): Promise<void> {
  const lines = createInterface({ input });
  let pending = Promise.resolve();
  lines.on("line", (line) => {
    pending = pending.then(async () => {
      if (line.trim() === "") return;
      const answer = await handleMessage(ctx, JSON.parse(line) as Request);
      if (answer) output.write(`${JSON.stringify(answer)}\n`);
    });
  });
  return new Promise((done) => lines.on("close", () => done(pending)));
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const ctx = await loadContext();
  if (process.argv.includes("--tools")) {
    process.stdout.write(`${JSON.stringify(ctx.tools.map((tool) => tool.name))}\n`);
  } else {
    await serve(ctx);
  }
}
