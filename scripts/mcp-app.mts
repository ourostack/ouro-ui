// Builds OuroMcpApp into one self-contained HTML file per app, with the app's A2UI catalog embedded, for an MCP server
// to serve as its `ui://` resource (core's mcpAppResource).
//
//   node scripts/mcp-app.mts build --catalog <catalog.json> --out <view.html> [--handoff-url <url with {action}>] [--name <name>] [--version <version>]
//
// The page holds its script, its stylesheet and the catalog inline, so it loads under MCP Apps' default content
// security policy, which allows inline script and style and no other origin.
import { mkdtempSync, readFileSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { build, type Plugin, type Rolldown } from "vite";
import { loadCatalog } from "../registry/ouro/lib/ouro/a2ui-core.ts";

const root = fileURLToPath(new URL("..", import.meta.url));
const entryDir = join(root, "scripts/mcp-app");

/** Where the page's configuration goes; the template keeps this comment for it. */
export const CONFIG_SLOT = "<!-- ouro-mcp-app-config -->";

/** What the view reads at load: the catalog, and optionally the app's address for person-only actions and its name. */
export interface ViewConfig {
  catalog: unknown;
  handoffUrl?: string;
  appInfo?: { name: string; version: string };
}

/** Puts the configuration into a built template, as JSON that no `</script>` in it can end early. */
export function embed(template: string, config: ViewConfig): string {
  loadCatalog(config.catalog);
  if (config.handoffUrl !== undefined && !/^https?:\/\//.test(config.handoffUrl)) throw new Error(`--handoff-url must be an http or https address, got ${config.handoffUrl}. Fix: such as https://kitchen.example.com/recipes?do={action}.`);
  const json = JSON.stringify(config).replaceAll("<", "\\u003c");
  return template.replace(CONFIG_SLOT, () => `<script type="application/json" id="ouro-mcp-app-config">${json}</script>`);
}

/** Puts a built page's own script and stylesheet into it, so it is one file. */
export function inline(html: string, read: (path: string) => string): string {
  return html
    .replace(/<script type="module" crossorigin src="([^"]+)"><\/script>/g, (_, src: string) => `<script type="module">${read(src).replaceAll("</script", "<\\/script")}</script>`)
    .replace(/<link rel="stylesheet" crossorigin href="([^"]+)">/g, (_, href: string) => `<style>${read(href).replaceAll("</style", "<\\/style")}</style>`);
}

const stylesheet = join(entryDir, "view.css");

/** The view's stylesheet with `extra` after it, in place of the file on disk. */
const withStylesheet = (extra: string): Plugin => ({
  name: "ouro-mcp-app-stylesheet",
  enforce: "pre",
  load: (id) => (id === stylesheet ? readFileSync(stylesheet, "utf8") + extra : undefined),
});

const options = (plugins: Plugin[]) => ({
  root: entryDir,
  configFile: false as const,
  logLevel: "warn" as const,
  base: "./",
  plugins: [react(), ...plugins],
  resolve: { alias: { "@": root.replace(/\/$/, "") } },
});

/** The registry files the view's script imports, which Tailwind scans for the classes it can render. */
async function registrySources(): Promise<string[]> {
  const result = (await build({ ...options([{ name: "ouro-mcp-app-no-css", enforce: "pre", load: (id) => (id.endsWith(".css") ? "" : undefined) }]), build: { write: false, modulePreload: false } })) as Rolldown.RolldownOutput;
  const modules = result.output.flatMap((chunk) => (chunk.type === "chunk" ? Object.keys(chunk.modules) : []));
  return modules.filter((id) => id.startsWith(join(root, "registry/")) || id === join(entryDir, "entry.tsx")).sort();
}

/** Builds the view's template: the page with its script and stylesheet inline, and the configuration slot empty. */
export async function buildTemplate(): Promise<string> {
  const sources = (await registrySources()).map((id) => `@source "./${relative(entryDir, id)}";\n`).join("");
  const outDir = mkdtempSync(join(tmpdir(), "ouro-mcp-app-"));
  try {
    await build({
      ...options([withStylesheet(`\n${sources}`), ...tailwindcss()]),
      build: { outDir, emptyOutDir: true, assetsInlineLimit: Number.MAX_SAFE_INTEGER, cssCodeSplit: false, modulePreload: false, reportCompressedSize: false },
    });
    const html = inline(readFileSync(join(outDir, "index.html"), "utf8"), (path) => readFileSync(join(outDir, path), "utf8"));
    if (/<script[^>]+src=|<link[^>]+stylesheet/.test(html)) throw new Error("The built view still loads a file of its own; it must be one file.");
    return html;
  } finally {
    rmSync(outDir, { recursive: true, force: true });
  }
}

async function main(argv: string[]) {
  const { positionals, values } = parseArgs({ args: argv, allowPositionals: true, options: { catalog: { type: "string" }, out: { type: "string" }, "handoff-url": { type: "string" }, name: { type: "string" }, version: { type: "string" } } });
  if (positionals[0] !== "build" || !values.catalog || !values.out) {
    console.error("Usage: node scripts/mcp-app.mts build --catalog <catalog.json> --out <view.html> [--handoff-url <url with {action}>] [--name <name>] [--version <version>]");
    process.exit(2);
  }
  const catalog = JSON.parse(readFileSync(resolve(values.catalog), "utf8")) as unknown;
  const config: ViewConfig = {
    catalog,
    ...(values["handoff-url"] ? { handoffUrl: values["handoff-url"] } : {}),
    ...(values.name ? { appInfo: { name: values.name, version: values.version ?? "1.0.0" } } : {}),
  };
  const html = embed(await buildTemplate(), config);
  mkdirSync(dirname(resolve(values.out)), { recursive: true });
  writeFileSync(resolve(values.out), html);
  console.log(`Wrote ${values.out}: the OuroMcpApp view for ${loadCatalog(catalog).catalogId}, ${Math.round(html.length / 1024)} KB in one file.`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main(process.argv.slice(2));
