// The bodies serve-pages.mjs answers with, read and gzipped once per file, as a CDN keeps them. Reading and compressing
// every file again on each request, synchronously, held the server's event loop for seconds when a sweep's pages asked for
// their scripts at once on a busy runner, and a page waited on its own chunk until its test timed out
// (ourostack/ouro-ui#679). The built site does not change while it is served.
import { readFileSync } from "node:fs";
import { gzipSync } from "node:zlib";

/** A cache of each file's body, and its gzipped body once one is asked for; `read` stands in for the file system in tests. */
export function pageBodies(read = readFileSync) {
  const bodies = new Map();
  return (file, gzip) => {
    let entry = bodies.get(file);
    if (!entry) bodies.set(file, (entry = { body: read(file) }));
    if (!gzip) return entry.body;
    return (entry.gzipped ??= gzipSync(entry.body));
  };
}
