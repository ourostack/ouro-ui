import type { CatalogGroup } from "../../../scripts/catalog-groups.mts";
import partsDoc from "../../../docs/parts.md?raw";
import catalog from "./catalog.json";

/**
 * One docs page per registry item. `name` is the registry item name, so the page lives at
 * https://ourostack.github.io/ouro-ui/docs/<name>, the URL each item's install message
 * points to. The page body is the Markdown scripts/gen-docs.mts generates from the JSDoc.
 */
export interface DocsItem {
  /** The registry item name: `npx shadcn@latest add @ouro/<name>`. */
  name: string;
  /** The component's export name. */
  title: string;
  /** Catalog group, as in the README catalog. */
  group: CatalogGroup;
  /** The registry source file, from the repo root. */
  source: string;
  /** docs/<title>.md, generated. */
  markdown: string;
  /** The family in docs/parts.md whose nesting this page shows, if it has parts. */
  parts?: string;
}

/** docs/<Export>.md, generated, by export name. */
const markdownFiles = import.meta.glob<string>("../../../docs/*.md", { query: "?raw", import: "default", eager: true });

/** Every component's page, from site/src/docs/catalog.json, which `pnpm run docs` writes from the registry. */
export const docsItems: DocsItem[] = (catalog as Array<Omit<DocsItem, "markdown">>).map((item) => {
  const markdown = markdownFiles[`../../../docs/${item.title}.md`];
  if (markdown === undefined) throw new Error(`docs/${item.title}.md is missing; run pnpm run docs.`);
  return { ...item, markdown };
});

/** The `## <family> parts` section of docs/parts.md, without its heading. */
export function partsSection(family: string): string {
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

/** The first sentence of the page's purpose paragraph, for the catalog. */
export function summary(markdown: string): string {
  const purpose = markdown.replace(/<!--[\s\S]*?-->/g, "").split("\n").find((line) => line.trim() && !line.startsWith("#")) ?? "";
  return purpose.match(/^.*?\.(?=\s|$)/)?.[0] ?? purpose;
}

export const GITHUB = "https://github.com/ourostack/ouro-ui";
