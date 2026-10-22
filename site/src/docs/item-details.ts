import type { DocsItem } from "./items";
import { docsItems } from "./items";

/** A registry item's details the docs show and the navigation does not need. */
export interface DocsItemDetails {
  /** The registry source file, from the repo root. */
  source: string;
  /** The first sentence of its page, for the docs index (`summary`, written by `pnpm run docs`). */
  summary: string;
}

let details: ReadonlyArray<readonly [string, string]> | undefined;

/**
 * Loads site/src/docs/item-details.json, which `pnpm run docs` writes beside the catalog, in its
 * order: its own chunk, which the docs route loads before it renders (`prepare` in
 * site/src/pages/docs.tsx), so neither the landing page nor the docs' first load carries every
 * item's summary.
 */
export async function loadItemDetails(): Promise<void> {
  details ??= (await import("./item-details.json")).default as unknown as ReadonlyArray<readonly [string, string]>;
}

/** An item's source file and summary, once `loadItemDetails` has loaded them. */
export function itemDetails(item: DocsItem): DocsItemDetails {
  if (!details) throw new Error("item details are not loaded: the docs route loads them before it renders.");
  const [path, summary] = details[docsItems.findIndex((each) => each.name === item.name)]!;
  return { source: `registry/ouro/components/ouro/${path}.tsx`, summary };
}
