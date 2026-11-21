import assert from "node:assert/strict";
import { deflateRawSync } from "node:zlib";
import { test } from "node:test";
import { baseReport, judgeSizes, mainBreaches, readZipEntry, reportName } from "./size-gate.mjs";

// The docs page's JavaScript as #2747 found it: main had crept to 191,889 bytes, 114 under a ceiling of 192,003, and
// #2747 grew it by 162 bytes without touching site/ (its e2e job 136857850020 read 192,051).
const docs = (bytes, ceiling = 192_003) => ({ "docs initial JavaScript": { bytes, ceiling, budget: 512 } });

test("a pull request is judged by its own growth over its base, so one a little over a ceiling main had nearly reached passes", () => {
  const verdict = judgeSizes(docs(192_051), { mode: "pull", base: docs(191_889) });
  assert.equal(verdict.ok, true);
  assert.deepEqual(verdict.failures, []);
  assert.match(verdict.lines.join("\n"), /docs initial JavaScript: 192051 bytes, 162 more than its base's 191889, within the 512 a pull request may add/);
  assert.match(verdict.lines.join("\n"), /over its ceiling of 192003 \(main's own size check reports a ceiling main is over\)/);
});

test("a pull request that grows a size by more than its budget fails, and says by how much it grew", () => {
  const verdict = judgeSizes(docs(191_889 + 4_096), { mode: "pull", base: docs(191_889) });
  assert.equal(verdict.ok, false);
  assert.deepEqual(verdict.failures, ["docs initial JavaScript: 195985 bytes, 4096 more than its base's 191889, over the 512 a pull request may add. Make it smaller, or raise its ceiling with the new measurement and why"]);
});

test("a pull request that raises a ceiling may grow by the raise as well as its budget", () => {
  const raised = judgeSizes(docs(191_889 + 4_096, 192_003 + 4_096), { mode: "pull", base: docs(191_889) });
  assert.equal(raised.ok, true);
  const tooMuch = judgeSizes(docs(191_889 + 4_096 + 513, 192_003 + 4_096), { mode: "pull", base: docs(191_889) });
  assert.equal(tooMuch.ok, false);
});

test("a pull request shrinking a size passes, and a size its base never measured is judged by its ceiling", () => {
  assert.equal(judgeSizes(docs(150_000), { mode: "pull", base: docs(191_889) }).ok, true);
  const unmeasured = judgeSizes(docs(192_051), { mode: "pull", base: null });
  assert.equal(unmeasured.ok, false);
  assert.match(unmeasured.failures[0], /docs initial JavaScript: 192051 bytes, over its ceiling of 192003 \(no measurement of the base commit to compare with\)/);
  assert.equal(judgeSizes(docs(191_889), { mode: "pull", base: {} }).ok, true);
});

test("on main a size over its ceiling is a breach to report, not a failed run, and run by hand the ceiling decides", () => {
  const main = judgeSizes(docs(192_051), { mode: "main", base: null });
  assert.equal(main.ok, true);
  assert.deepEqual(mainBreaches(docs(192_051)), ["docs initial JavaScript: 192051 bytes, over its ceiling of 192003"]);
  assert.deepEqual(mainBreaches(docs(191_889)), []);
  assert.equal(judgeSizes(docs(192_051), { mode: "local", base: null }).ok, false);
});

// A zip as GitHub serves an artifact: one stored or deflated file.
function zip(name, text) {
  const data = Buffer.from(text);
  const packed = deflateRawSync(data);
  const header = Buffer.alloc(30);
  header.writeUInt32LE(0x04034b50, 0);
  header.writeUInt16LE(8, 8);
  header.writeUInt32LE(packed.length, 18);
  header.writeUInt32LE(data.length, 22);
  header.writeUInt16LE(name.length, 26);
  return Buffer.concat([header, Buffer.from(name), packed]);
}

test("the base's report is the newest artifact named for the size check and the base commit's tree", async () => {
  assert.equal(reportName("closure", "abc123"), "size-closure-abc123");
  assert.equal(readZipEntry(zip("closure.json", '{"a":1}')), '{"a":1}');
  const asked = [];
  const fetch = async (url) => {
    asked.push(url);
    if (url.endsWith("/commits/merge")) return Response.json({ parents: [{ sha: "base" }] });
    if (url.endsWith("/commits/base")) return Response.json({ commit: { tree: { sha: "basetree" } } });
    if (url.includes("/actions/artifacts?name=size-closure-basetree")) {
      return Response.json({ artifacts: [
        { id: 1, expired: true, created_at: "2026-11-21T10:00:00Z" },
        { id: 2, expired: false, created_at: "2026-11-21T09:00:00Z" },
        { id: 3, expired: false, created_at: "2026-11-21T08:00:00Z" },
      ] });
    }
    if (url.endsWith("/actions/artifacts/2/zip")) return new Response(zip("closure.json", JSON.stringify(docs(191_889))));
    return new Response("not found", { status: 404 });
  };
  const found = await baseReport({ check: "closure", sha: "merge", repo: "o/r", api: "https://api", token: "t", fetch });
  assert.deepEqual(found, { report: docs(191_889), from: "size-closure-basetree", artifact: 2 });
  assert.ok(asked.every((url) => url.startsWith("https://api/repos/o/r/")));

  const none = await baseReport({ check: "patterns", sha: "merge", repo: "o/r", api: "https://api", token: "t", fetch });
  assert.equal(none.report, null);
  assert.match(none.why, /no artifact named size-patterns-basetree/);
});
