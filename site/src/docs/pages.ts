import catalog from "./catalog.json";
import { installedPaths } from "./items";
import pages from "./pages.json";

/**
 * The docs pages that are not a registry item's: each documented export without an item of
 * its own (`Radio`, which ships in `radio-group`; `OuroProvider`, in `lib/ouro`) and each
 * guide in docs/guides. site/src/docs/pages.json lists them (`pnpm run docs` writes it), and
 * each is published at docs/<name>/ and docs/<name>.md like an item's page, so every page
 * in docs/ has an address on the site.
 */
export interface DocsPage {
  /** The page's address: docs/<name>/. */
  name: string;
  title: string;
  kind: "guide" | "export";
  /** The catalog group of an export, or "Guides". */
  group: string;
  /** The Markdown file, from the repository root. */
  file: string;
  markdown: string;
}

const files = import.meta.glob<string>(["../../../docs/*.md", "../../../docs/guides/*.md"], { query: "?raw", import: "default", eager: true });

export const docsPages: DocsPage[] = (pages as Array<Omit<DocsPage, "markdown" | "file"> & { markdown: string }>).map((page) => {
  const markdown = files[`../../../${page.markdown}`];
  if (markdown === undefined) throw new Error(`${page.markdown} is missing; run pnpm run docs.`);
  return { ...page, kind: page.kind as DocsPage["kind"], file: page.markdown, markdown };
});

export const guidePages = docsPages.filter((page) => page.kind === "guide");
export const exportPages = docsPages.filter((page) => page.kind === "export");

/** The site name of the page a Markdown file is published as: `Form.md` is `form`, `guides/testing.md` is `testing`. */
const published = new Map<string, string>([
  ...(catalog as Array<{ name: string; title: string }>).map((item) => [`${item.title}.md`, item.name] as const),
  ...docsPages.map((page) => [page.file.replace(/^docs\//, ""), page.name] as const),
  ["parts.md", "parts"],
]);

/**
 * Where a link between Markdown files in docs/ goes on the site. `Form.md` (from docs/) and
 * `../Form.md` (from docs/guides/) name the page published for docs/Form.md; the fragment is
 * kept. Anything else (a full URL, an anchor) is returned unchanged.
 */
export function publishedName(link: string, from: string): { name: string; fragment: string } | undefined {
  const [path = "", fragment = ""] = link.split("#");
  if (path === "" || /^[a-z][a-z\d+.-]*:/i.test(path)) return undefined;
  const dir = from.replace(/^docs\//, "").split("/").slice(0, -1);
  for (const part of path.split("/")) {
    if (part === "..") dir.pop();
    else if (part !== ".") dir.push(part);
  }
  const name = published.get(dir.join("/"));
  return name === undefined ? undefined : { name, fragment: fragment === "" ? "" : `#${fragment}` };
}

/** A page's Markdown as the site publishes it at docs/<name>.md: installed paths, and links to the published `.md` files. */
export function publishedMarkdown(markdown: string, from: string): string {
  return installedPaths(markdown).replace(/\]\(([^)\s]+)\)/g, (whole, link: string) => {
    const target = publishedName(link, from);
    return target ? `](${target.name}.md${target.fragment})` : whole;
  });
}
