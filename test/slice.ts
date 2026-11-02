import { inject } from "vitest";
import { server } from "vitest/browser";
import { sliceOf } from "./slice-core.ts";

// CI runs the browser tests in shards (`vitest run --shard=<index>/<count>`, .github/workflows/ci.yml).
// A test file runs in one shard, except the sliced suites (`slicedSuites` in
// scripts/vitest-shards.mts): each iterates every story or every site page, longer than a whole
// shard should take, so every shard runs it over its own slice of the list. Unsharded, the slice is
// the whole list. Each check in each project starts its slices at a shard of its own (offsetOf), so
// one heavy story's scans spread across the shards instead of running side by side in one.

declare module "vitest" {
  export interface ProvidedContext {
    /** This run's shard, `<index>/<count>`, from vitest.config.ts; null when the run is not sharded. */
    ouroSlice: string | null;
  }
}

const [index, count] = (inject("ouroSlice") ?? "1/1").split("/").map(Number) as [number, number];

/** This run's slice: the shard's index (from 1) and the number of shards. */
export const slice = { index, count };

/** The project this runs in, as far as slicing tells them apart: its browser, and whether it is a touch phone's. */
const project = `${server.browser}${navigator.maxTouchPoints > 0 ? " touch" : ""}`;

/** The items of `list` this shard checks for `check` (a name for the check, unique in its file): every `count`th, from the check's offset. */
export function sliced<T>(list: readonly T[], check: string): T[] {
  return sliceOf(list, index, count, `${project} ${check}`);
}
