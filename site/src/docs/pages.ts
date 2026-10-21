import catalog from "./catalog.json";
import { markdown } from "./content";
import { GITHUB } from "../paths";
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
  /** The Markdown file, from the repository root (`pageMarkdown`, once the docs route has loaded it). */
  file: string;
  /** The first sentence of its summary paragraph, for the catalog (written by `pnpm run docs`). */
  summary: string;
}

export const docsPages: DocsPage[] = (pages as Array<Omit<DocsPage, "file"> & { markdown: string }>).map(({ markdown: file, ...page }) => ({
  ...page,
  kind: page.kind as DocsPage["kind"],
  file,
}));

/** A page's Markdown, once the docs route has loaded its file. */
export function pageMarkdown(page: DocsPage): string {
  return markdown(page.file);
}

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

/**
 * A relative link to a repository file that is not a docs page (a claim's source, such as
 * `../../scripts/claims.mjs#L12`), as its address on GitHub, so it opens from the site too.
 * `from` is the Markdown file's path from the repository root.
 */
export function repositoryLink(link: string, from: string): string | undefined {
  const [path = "", fragment = ""] = link.split("#");
  if (path === "" || path.startsWith("/") || /^[a-z][a-z\d+.-]*:/i.test(path)) return undefined;
  const dir = from.split("/").slice(0, -1);
  for (const part of path.split("/")) {
    if (part === "..") dir.pop();
    else if (part !== ".") dir.push(part);
  }
  return `${GITHUB}/blob/main/${dir.join("/")}${fragment === "" ? "" : `#${fragment}`}`;
}

/** A page's Markdown as the site publishes it at docs/<name>.md: installed paths, links to the published `.md` files, and other repository links on GitHub. */
export function publishedMarkdown(markdown: string, from: string): string {
  return installedPaths(markdown).replace(/\]\(([^)\s]+)((?:\s+"[^"]*")?)\)/g, (whole, link: string, title: string) => {
    const target = publishedName(link, from);
    if (target) return `](${target.name}.md${target.fragment}${title})`;
    const repository = repositoryLink(link, from);
    return repository ? `](${repository}${title})` : whole;
  });
}
