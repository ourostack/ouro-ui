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

/** The items of `list` shard `index` (from 1) of `count` checks for `key`: every `count`th, from the key's offset. */
export function sliceOf<T>(list: readonly T[], index: number, count: number, key: string): T[] {
  const offset = offsetOf(key, count);
  return list.filter((_, position) => (position + offset) % count === index - 1);
}
