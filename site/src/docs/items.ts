import type { SiteGroup } from "../../../scripts/catalog-groups.mts";
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
  /** Catalog group, as in the README catalog; App setup's components come last. */
  group: SiteGroup;
  /** The registry source file, from the repo root. */
  source: string;
  /** docs/<title>.md, generated. */
  markdown: string;
  /** The family in docs/parts.md whose nesting this page shows, if it has parts. */
  parts?: string;
  /** Functions documented on this page too, after the component: `toast` on the Toaster page. */
  functions?: string[];
}

/** docs/<Export>.md, generated, by export name. */
const markdownFiles = import.meta.glob<string>("../../../docs/*.md", { query: "?raw", import: "default", eager: true });

/** Every component's page, from site/src/docs/catalog.json, which `pnpm run docs` writes from the registry. */
export const docsItems: DocsItem[] = (catalog as Array<Omit<DocsItem, "markdown">>).map((item) => {
  const generated = (title: string) => {
    const markdown = markdownFiles[`../../../docs/${title}.md`];
    if (markdown === undefined) throw new Error(`docs/${title}.md is missing; run pnpm run docs.`);
    return markdown;
  };
  const markdown = [generated(item.title), ...(item.functions ?? []).map((name) => functionSection(generated(name)))].join("\n");
  return { ...item, markdown };
});

/**
 * A function's generated page (docs/toast.md) as one section of its component's page: its
 * title becomes a `##` heading with the call's parentheses, and its own sections step down
 * a level, so the Toaster page documents `toast()` too.
 */
function functionSection(markdown: string): string {
  return markdown
    .replace(/<!--[\s\S]*?-->\n*/g, "")
    .replace(/^## /gm, "### ")
    .replace(/^# (\w+)$/m, "## $1()");
}

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
  const text = purpose.replace(/\[([^\]]+)\]\([^)]+\)/g, "$1");
  return text.match(/^.*?\.(?=\s|$)/)?.[0] ?? text;
}

export const GITHUB = "https://github.com/ourostack/ouro-ui";
