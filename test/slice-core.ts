import storyCosts from "./story-costs.json" with { type: "json" };

// How a sliced suite's list is split across CI's browser shards (test/slice.ts), apart from Vitest,
// so a script test can hold the split to its promises (scripts/shard.test.mjs).

/**
 * Where a check's slices start, from 0 to count - 1: the same for the same check in the same project
 * on every run, and spread across checks and projects (FNV-1a), so the heaviest items of a list, the
 * stories that open the most overlays, don't land in one shard for every check and project at once.
 */
export function offsetOf(key: string, count: number): number {
  let hash = 0x811c9dc5;
  for (const character of key) hash = Math.imul(hash ^ character.codePointAt(0)!, 0x01000193) >>> 0;
  return hash % count;
}

/** What an item is called in the cost table: a story's id, a page's path or a docs item's name. */
function itemKey(item: unknown): string | undefined {
  if (typeof item !== "object" || item === null) return undefined;
  const { id, path, name } = item as { id?: unknown; path?: unknown; name?: unknown };
  if (typeof id === "string") return id;
  if (typeof path === "string") return path;
  return typeof name === "string" ? `docs/${name}` : undefined;
}

/**
 * The items of `list` shard `index` (from 1) of `count` checks for `key`. Items go longest first to the
 * shard with the least cost so far (the measured times in story-costs.json, scripts/story-costs.mjs;
 * an item with none costs the median), and a tie goes to the next shard from the key's offset, so every
 * shard computes the same split and each item runs in exactly one.
 */
export function sliceOf<T>(list: readonly T[], index: number, count: number, key: string, costs: Readonly<Record<string, number>> = storyCosts): T[] {
  const known = Object.values(costs).sort((a, b) => a - b);
  const fallback = known[Math.floor(known.length / 2)] ?? 1;
  const weights = list.map((item) => costs[itemKey(item) ?? ""] ?? fallback);
  const order = list.map((_, position) => position).sort((a, b) => weights[b]! - weights[a]! || a - b);
  const offset = offsetOf(key, count);
  const loads = Array.from({ length: count }, () => 0);
  const mine = new Set<number>();
  for (const position of order) {
    let shard = offset;
    for (let step = 1; step < count; step += 1) {
      const next = (offset + step) % count;
      if (loads[next]! < loads[shard]!) shard = next;
    }
    loads[shard]! += weights[position]!;
    if (shard === index - 1) mine.add(position);
  }
  return list.filter((_, position) => mine.has(position));
}
