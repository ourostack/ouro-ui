import { test } from "node:test";
import { deepEqual } from "node:assert/strict";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { walkArgvEntries } from "./argv-entries.mts";

const root = join(dirname(fileURLToPath(import.meta.url)), "fixtures", "entries-shapes");

test("an entry's words are read through a spread copy, a bare comparison, a callback, a loop and a call that isn't a table", async () => {
  const { doors, errors } = await walkArgvEntries({ product: "harness", module: "dist", source: "src", root });
  deepEqual(errors, []);
  // Only the first word is a subcommand: words a callback or loop sees have no known position.
  deepEqual(doors.map((d) => [d.id, d.line]), [["cli:node dist/shapes-entry.js", 3], ["cli:node dist/shapes-entry.js watch", 4]]);
});
