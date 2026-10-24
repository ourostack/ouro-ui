/**
 * The Markdown behind the docs pages, one chunk per file, so a docs page loads only the files it
 * shows and the docs don't grow with every page they add (site/e2e/catalog.spec.ts holds the docs
 * index to its ceiling). The docs route loads a page's files before it renders or hydrates
 * (`prepare` in site/src/pages/docs.tsx, called by `loadPage`); `markdown` then reads them.
 */
const files: Record<string, () => Promise<string>> = {
  ...import.meta.glob<string>(["../../../docs/*.md", "../../../docs/guides/*.md"], { query: "?raw", import: "default" }),
  // Keep the shared release-note formatting, but load it only for the Updating page.
  "../../../UPGRADING.md": async () => (await import("../release")).upgrading,
};

const loaded = new Map<string, string>();

/** Loads Markdown files by their path from the repository root (`docs/Button.md`). */
export async function loadMarkdown(paths: readonly string[]): Promise<void> {
  await Promise.all(
    paths.map(async (path) => {
      if (loaded.has(path)) return;
      const load = files[`../../../${path}`];
      if (!load) throw new Error(`${path} is missing; run pnpm run docs.`);
      loaded.set(path, await load());
    }),
  );
}

/** A Markdown file `loadMarkdown` has loaded, by its path from the repository root. */
export function markdown(path: string): string {
  const text = loaded.get(path);
  if (text === undefined) throw new Error(`${path} is not loaded: the docs route loads a page's Markdown before it renders.`);
  return text;
}
