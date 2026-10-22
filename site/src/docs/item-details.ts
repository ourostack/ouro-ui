import details from "./item-details.json";
import { docsItems, type DocsItem } from "./items";

/** A registry item's details the docs show and the navigation does not need. */
export interface DocsItemDetails {
  /** The registry source file, from the repo root. */
  source: string;
  /** The first sentence of its page, for the docs index (`summary`, written by `pnpm run docs`). */
  summary: string;
}

/**
 * An item's source file and summary, from site/src/docs/item-details.json, which `pnpm run docs`
 * writes beside the catalog, in its order. Only the docs import it, so the landing page loads no
 * summaries.
 */
export function itemDetails(item: DocsItem): DocsItemDetails {
  const [path, summary] = (details as Array<[string, string]>)[docsItems.findIndex((each) => each.name === item.name)]!;
  return { source: `registry/ouro/components/ouro/${path}.tsx`, summary };
}
