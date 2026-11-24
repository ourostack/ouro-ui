/** A claim's footnote reference (docs/guides/claims.md) dropped from a line of Markdown. */
const dropFootnotes = (text: string): string => text.replace(/\[\^[^\]]+\]/g, "");

/**
 * The first sentence of a docs page's purpose paragraph, for the catalog: links become their text,
 * and a claim's footnote references (docs/guides/claims.md) are dropped.
 * `pnpm run docs` (scripts/gen-docs.mts) writes it into site/src/docs/catalog.json and pages.json,
 * so the docs index lists every page without loading each page's Markdown.
 */
export function summary(markdown: string): string {
  const purpose = markdown.replace(/<!--[\s\S]*?-->/g, "").split("\n").find((line) => line.trim() && !line.startsWith("#")) ?? "";
  const text = dropFootnotes(purpose).replace(/\[([^\]]+)\]\([^)]+\)/g, "$1");
  return text.match(/^.*?\.(?=\s|$)/)?.[0] ?? text;
}

/**
 * A page's title, as its first heading gives it, with a claim's footnote reference (docs/guides/claims.md)
 * dropped: a guide or platform page's `# Title[^mark]` heading carries its mark so the claim is sourced and
 * checked, but the mark is not part of the title itself, so `pnpm run docs` drops it before the title reaches
 * the docs menu and the sidebar (ourostack/ouro-ui#3556).
 */
export function pageTitle(heading: string): string {
  return dropFootnotes(heading).trim();
}
