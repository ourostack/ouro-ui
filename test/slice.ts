import { inject } from "vitest";

// CI runs the browser tests in shards (`vitest run --shard=<index>/<count>`, .github/workflows/ci.yml).
// A test file runs in one shard, except the sliced suites (`slicedSuites` in
// scripts/vitest-shards.mts): each iterates every story or every site page, longer than a whole
// shard should take, so every shard runs it over its own slice of the list. Unsharded, the slice is
// the whole list.

declare module "vitest" {
  export interface ProvidedContext {
    /** This run's shard, `<index>/<count>`, from vitest.config.ts; null when the run is not sharded. */
    ouroSlice: string | null;
  }
}

const [index, count] = (inject("ouroSlice") ?? "1/1").split("/").map(Number) as [number, number];

/** This run's slice: the shard's index (from 1) and the number of shards. */
export const slice = { index, count };

/** The items of `list` this shard checks: every `count`th, starting at its own index. */
export function sliced<T>(list: readonly T[]): T[] {
  return list.filter((_, position) => position % count === index - 1);
}
