import assert from "node:assert/strict";
import { performance } from "node:perf_hooks";
import { test } from "node:test";
import { clearTimeout, setTimeout } from "node:timers";
import { emulateMedia } from "../registry/ouro/lib/ouro/testing/commands.ts";

// `emulateMedia` against a stand-in page whose frame never matches the query, so the wait runs
// out. Node's event loop is held for 5 s while a read is pending, as a loaded runner's can be; the
// frame answers each read after 50 ms, as a frame does. The wait is 10 s on the kit's clock, which
// leaves out Node's own stalls, so a read must still run after the stall ends.

test("emulateMedia waits out Node's own stalls, which do not count against its 10 s wait", async () => {
  const reads = [];
  let stallEnd;
  const frame = {
    evaluate(expression) {
      // The kit's `unmatched` read: a JSON array of queries, then `.find` for the first one not matched.
      const queries = JSON.parse(expression.slice(0, expression.indexOf(".find(")));
      reads.push(performance.now());
      return new Promise((resolve) => setTimeout(() => resolve(queries.find(Boolean)), 50));
    },
  };
  const ctx = { page: { emulateMedia: async () => {} }, frame: async () => frame };

  const start = performance.now();
  const stall = setTimeout(() => {
    const until = performance.now() + 5000;
    while (performance.now() < until);
    stallEnd = performance.now();
  }, 5500);
  try {
    await assert.rejects(emulateMedia(ctx, { reducedMotion: "reduce" }), (error) => {
      assert.match(error.message, /does not match \(prefers-reduced-motion: reduce\)/);
      return true;
    });
    assert.ok(stallEnd !== undefined, "the stall ran");
    // The wait has about 4.5 s of kit time left when the stall ends, so the frame is read for that long after it.
    const lastRead = reads.at(-1) - stallEnd;
    assert.ok(
      lastRead > 3000,
      `the frame was last read ${Math.round(lastRead)}ms after the stall ended at ${Math.round(stallEnd - start)}ms, before the wait ran out; reads at ${reads.map((at) => Math.round(at - start)).join(", ")}ms`,
    );
  } finally {
    clearTimeout(stall);
  }
}, { timeout: 60_000 });
