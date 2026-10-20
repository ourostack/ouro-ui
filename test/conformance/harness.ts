import { inject } from "vitest";
import { selectedStories, type StoryEntry } from "../stories.tsx";

// What every conformance check shares: which stories this run renders, and how a check
// describes an element in a failure so the message names exactly what to fix.

declare module "vitest" {
  export interface ProvidedContext {
    /** OURO_CONFORMANCE_SHARD, from vitest.config.ts: `"<index>/<count>"`, or null for every story. */
    ouroShard: string | null;
  }
}

/** Parses `"2/4"` into a 1-based shard index and a count; null means every story. */
export function parseShard(value: string | null): { index: number; count: number } | null {
  if (value === null || value === "") return null;
  const match = /^(\d+)\/(\d+)$/.exec(value);
  const index = Number(match?.[1]);
  const count = Number(match?.[2]);
  if (!match || count < 1 || index < 1 || index > count) throw new Error(`OURO_CONFORMANCE_SHARD must be "<index>/<count>" such as "2/4", not "${value}"`);
  return { index, count };
}

/**
 * The stories one shard renders: every `count`th story from the `index`th, so each shard gets
 * the same mix of small and large stories and the shards finish together.
 */
export function shardStories<T>(entries: readonly T[], shard: { index: number; count: number } | null): T[] {
  return shard === null ? [...entries] : entries.filter((_, position) => position % shard.count === shard.index - 1);
}

/**
 * The stories this run checks: the stories the shared suites render (every story, or a pull
 * request's selected components' stories; test/stories.tsx), split across CI's shards.
 */
export const conformanceStories: StoryEntry[] = shardStories(selectedStories, parseShard(inject("ouroShard")));

/** The start of an element's markup and its marker, enough to find it in the story. */
export function describeElement(element: Element): string {
  const marker = element.closest("[data-ouro-control]");
  const item = marker ? `${marker.getAttribute("data-ouro-control")}/${marker.getAttribute("data-ouro-part") ?? "?"}` : "unmarked";
  return `${item} ${element.outerHTML.slice(0, 140)}`;
}

/**
 * Lays the story host out as Storybook's canvas does for the story's `layout` parameter: 1rem of
 * padding (`padded`, the default), the same with the story centred (`centered`), or none
 * (`fullscreen`). A check that measures against the viewport then sees what Storybook shows: a
 * part that reaches past its box on purpose (a ghost button's negative margin) stays on screen.
 */
export function layOut(host: HTMLElement, parameters: object): void {
  const layout = (parameters as { layout?: string }).layout ?? "padded";
  if (layout === "fullscreen") return;
  host.style.padding = "1rem";
  if (layout === "centered") Object.assign(host.style, { display: "flex", justifyContent: "center", alignItems: "center" });
}
