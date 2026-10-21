// A node:test reporter that writes how long each test file's tests took, file to milliseconds, as
// JSON: CI's script test shards write it to .tmp/timings/scripts-<index>of<count>.json for
// `node scripts/shard.mjs refresh` (.github/workflows/ci.yml). A file's top-level tests run one
// after another, so their durations add up to the file's.
import { relative } from "node:path";

export default async function* timings(source) {
  const times = {};
  for await (const event of source) {
    if ((event.type === "test:pass" || event.type === "test:fail") && event.data.nesting === 0 && event.data.file) {
      const file = relative(process.cwd(), event.data.file).split("\\").join("/");
      times[file] = Math.round((times[file] ?? 0) + event.data.details.duration_ms);
    }
  }
  yield `${JSON.stringify(Object.fromEntries(Object.entries(times).sort(([a], [b]) => (a < b ? -1 : 1))), null, 2)}\n`;
}
