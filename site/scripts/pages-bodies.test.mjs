import assert from "node:assert/strict";
import { Buffer } from "node:buffer";
import { test } from "node:test";
import { gunzipSync } from "node:zlib";
import { pageBodies } from "./pages-bodies.mjs";

test("serve-pages reads and gzips each file once, however often it is asked for, and answers with the same bytes", () => {
  const reads = [];
  const body = pageBodies((file) => (reads.push(file), Buffer.from(`body of ${file}`)));
  const first = body("/a.js", true);
  assert.equal(body("/a.js", true), first);
  assert.equal(gunzipSync(first).toString(), "body of /a.js");
  assert.equal(body("/a.js", false).toString(), "body of /a.js");
  assert.equal(body("/b.png", false).toString(), "body of /b.png");
  assert.deepEqual(reads, ["/a.js", "/b.png"]);
});
