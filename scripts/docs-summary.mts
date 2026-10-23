/**
 * The first sentence of a docs page's purpose paragraph, for the catalog: links become their text,
 * and a claim's footnote references (docs/guides/claims.md) are dropped.
 * `pnpm run docs` (scripts/gen-docs.mts) writes it into site/src/docs/item-details.json and pages.json,
 * so the docs index lists every page without loading each page's Markdown.
 */
export function summary(markdown: string): string {
  const purpose = markdown.replace(/<!--[\s\S]*?-->/g, "").split("\n").find((line) => line.trim() && !line.startsWith("#")) ?? "";
  const text = purpose.replace(/\[\^[^\]]+\]/g, "").replace(/\[([^\]]+)\]\([^)]+\)/g, "$1");
  return text.match(/^.*?\.(?=\s|$)/)?.[0] ?? text;
}
