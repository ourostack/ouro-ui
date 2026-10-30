import type { SiteGroup } from "../../../scripts/catalog-groups.mts";
import catalog from "./catalog.json";
import { markdown } from "./content";

export { summary } from "../../../scripts/docs-summary.mts";

/**
 * One docs page per registry item. `name` is the registry item name, so the page lives at
 * https://ui.ouro.bot/docs/<name>, the URL each item's install message
 * points to. The page body is the Markdown scripts/gen-docs.mts generates from the JSDoc
 * (`itemMarkdown`, once the docs route has loaded `itemFiles`).
 */
export interface DocsItem {
  /** The registry item name: `npx shadcn@latest add @ouro/<name>`. */
  name: string;
  /** The component's export name. */
  title: string;
  /** Catalog group, as in the README catalog; App setup's components come last. */
  group: SiteGroup;
  /** The registry source file, from the repo root. */
  source: string;
  /** The first sentence of its page, for the catalog (`summary`, written by `pnpm run docs`). */
  summary: string;
  /** The family in docs/parts.md whose nesting this page shows, if it has parts. */
  parts?: string;
  /** Functions documented on this page too, after the component: `toast` on the Toaster page. */
  functions?: string[];
}

/** Every component's page, from site/src/docs/catalog.json, which `pnpm run docs` writes from the registry. */
export const docsItems: DocsItem[] = catalog as DocsItem[];

/** The Markdown files an item's page shows: its own, its functions' (docs/toast.md) and, with parts, docs/parts.md. */
export function itemFiles(item: DocsItem): string[] {
  return [`docs/${item.title}.md`, ...(item.functions ?? []).map((name) => `docs/${name}.md`), ...(item.parts ? ["docs/parts.md"] : [])];
}

/** An item's page Markdown: its generated page, then each function's as a section of it. */
export function itemMarkdown(item: DocsItem): string {
  return [markdown(`docs/${item.title}.md`), ...(item.functions ?? []).map((name) => functionSection(markdown(`docs/${name}.md`)))].join("\n");
}

/**
 * A function's generated page (docs/toast.md) as one section of its component's page: its
 * title becomes a `##` heading with the call's parentheses, and its own sections step down
 * a level, so the Toaster page documents `toast()` too.
 */
function functionSection(page: string): string {
  return page
    .replace(/<!--[\s\S]*?-->\n*/g, "")
    .replace(/^## /gm, "### ")
    .replace(/^# (\w+)$/m, (_heading, name: string) => `## ${name}()`);
}

/** The `## <family> parts` section of docs/parts.md, without its heading. */
export function partsSection(family: string): string {
  const partsDoc = markdown("docs/parts.md");
  const start = partsDoc.indexOf(`## ${family} parts\n`);
  const body = partsDoc.slice(start).split("\n").slice(1).join("\n");
  const end = body.search(/^## /m);
  return end === -1 ? body : body.slice(0, end);
}

/**
 * The registry source imports `@/registry/ouro/...`; the shadcn CLI rewrites that to the
 * app's aliases on install. The docs show the installed paths, with shadcn's default `@/`.
 */
export function installedPaths(markdown: string): string {
  return markdown.replace(/@\/registry\/ouro\//g, "@/");
}

export { GITHUB } from "../paths";
