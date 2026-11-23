import assert from "node:assert/strict";
import { Buffer } from "node:buffer";
import { deflateRawSync } from "node:zlib";
import { test } from "node:test";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { scratchDir } from "./scratch.mjs";
import { LOOKBACK, baseReport, judgeSizes, mainBreaches, readBase, readZipEntry, reportName, treeBreaches } from "./size-gate.mjs";

// The docs page's JavaScript as #2747 found it: main had crept to 191,889 bytes, 114 under a ceiling of 192,003, and
// #2747 grew it by 162 bytes without touching site/ (its e2e job 136857850020 read 192,051).
const docs = (bytes, ceiling = 192_003) => ({ "docs initial JavaScript": { bytes, ceiling, budget: 512 } });

test("a pull request is judged by its own growth over its base, so one a little over a ceiling main had nearly reached passes", () => {
  const verdict = judgeSizes(docs(192_051), { mode: "pull", base: docs(191_889) });
  assert.equal(verdict.ok, true);
  assert.deepEqual(verdict.failures, []);
  assert.match(verdict.lines.join("\n"), /docs initial JavaScript: 192051 bytes, 162 more than its base's 191889, within the 512 a pull request may add/);
  assert.match(verdict.lines.join("\n"), /past its ceiling of 192003 for the first time: this pull request tips it over/);
});

test("a pull request that is the first to carry a size past its ceiling is flagged as a tip, report-only", () => {
  const verdict = judgeSizes(docs(192_051), { mode: "pull", base: docs(191_889) });
  assert.equal(verdict.ok, true, "report-only: a tip never fails the run");
  assert.deepEqual(verdict.failures, []);
  assert.deepEqual(verdict.tips, ["docs initial JavaScript: 192051 bytes, 162 more than its base's 191889, within the 512 a pull request may add, but past its ceiling of 192003 for the first time: this pull request tips it over. Raise the ceiling with the new measurement and why, or make it smaller"]);
});

test("a pull request whose base was already over its ceiling is not flagged as a tip: that stays main's report, as before", () => {
  const verdict = judgeSizes(docs(192_060), { mode: "pull", base: docs(192_051) });
  assert.equal(verdict.ok, true);
  assert.deepEqual(verdict.tips, []);
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

// A zip as upload-artifact writes one: a stream, so the file's own header records no sizes (flag bit 3), and the central
// directory at the end does.
function zip(name, text) {
  const data = Buffer.from(text);
  const packed = deflateRawSync(data);
  const local = Buffer.alloc(30);
  local.writeUInt32LE(0x04034b50, 0);
  local.writeUInt16LE(0x0008, 6);
  local.writeUInt16LE(8, 8);
  local.writeUInt16LE(name.length, 26);
  const descriptor = Buffer.alloc(16);
  descriptor.writeUInt32LE(0x08074b50, 0);
  descriptor.writeUInt32LE(packed.length, 8);
  descriptor.writeUInt32LE(data.length, 12);
  const central = Buffer.alloc(46);
  central.writeUInt32LE(0x02014b50, 0);
  central.writeUInt16LE(0x0008, 8);
  central.writeUInt16LE(8, 10);
  central.writeUInt32LE(packed.length, 20);
  central.writeUInt32LE(data.length, 24);
  central.writeUInt16LE(name.length, 28);
  const body = Buffer.concat([local, Buffer.from(name), packed, descriptor]);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(1, 8);
  end.writeUInt16LE(1, 10);
  end.writeUInt32LE(46 + name.length, 12);
  end.writeUInt32LE(body.length, 16);
  return Buffer.concat([body, central, Buffer.from(name), end]);
}

test("the base's report is the newest artifact named for the size check and the base commit's tree", async () => {
  assert.equal(reportName("closure", "abc123"), "size-closure-abc123");
  assert.equal(readZipEntry(zip("closure.json", '{"a":1}')), '{"a":1}');
  const asked = [];
  const fetch = async (url) => {
    asked.push(url);
    if (url.endsWith("/commits/merge")) return globalThis.Response.json({ commit: { tree: { sha: "mergetree" } }, parents: [{ sha: "base" }] });
    if (url.endsWith("/commits/base")) return globalThis.Response.json({ commit: { tree: { sha: "basetree" } } });
    if (url.includes("/actions/artifacts?name=size-closure-basetree")) {
      return globalThis.Response.json({ artifacts: [
        { id: 1, expired: true, created_at: "2026-11-21T10:00:00Z" },
        { id: 2, expired: false, created_at: "2026-11-21T09:00:00Z" },
        { id: 3, expired: false, created_at: "2026-11-21T08:00:00Z" },
      ] });
    }
    if (url.includes("/actions/artifacts?name=")) return globalThis.Response.json({ total_count: 0, artifacts: [] });
    if (url.endsWith("/actions/artifacts/2/zip")) return new globalThis.Response(zip("closure.json", JSON.stringify(docs(191_889))));
    return new globalThis.Response("not found", { status: 404 });
  };
  const found = await baseReport({ check: "closure", sha: "merge", repo: "o/r", api: "https://api", token: "t", fetch });
  assert.deepEqual(found, { report: docs(191_889), from: "size-closure-basetree", artifact: 2, commit: "base", behind: 0 });
  assert.ok(asked.every((url) => url.startsWith("https://api/repos/o/r/")));

  const none = await baseReport({ check: "patterns", sha: "merge", repo: "o/r", api: "https://api", token: "t", fetch });
  assert.equal(none.report, null);
  assert.match(none.why, /no artifact named size-patterns-basetree/);
});

test("on main, the sizes a commit's tree measured are read from its artifacts, and a check that measured nothing is named", async () => {
  const fetch = async (url) => {
    if (url.endsWith("/commits/main")) return globalThis.Response.json({ commit: { tree: { sha: "maintree" } } });
    if (url.includes("/actions/artifacts?name=size-closure-maintree")) return globalThis.Response.json({ artifacts: [{ id: 7, expired: false, created_at: "2026-11-21T13:30:00Z" }] });
    if (url.includes("/actions/artifacts?name=")) return globalThis.Response.json({ artifacts: [] });
    if (url.endsWith("/actions/artifacts/7/zip")) return new globalThis.Response(zip("closure.json", JSON.stringify(docs(192_051))));
    return new globalThis.Response("not found", { status: 404 });
  };
  const found = await treeBreaches({ checks: ["closure", "patterns"], sha: "main", repo: "o/r", api: "https://api", token: "t", fetch });
  assert.deepEqual(found, { breaches: ["docs initial JavaScript: 192051 bytes, over its ceiling of 192003"], missing: ["size-patterns-maintree"] });
});

// main's history as GitHub's commits API serves it: each commit's tree and parents, first parent first.
function history(commits, reported) {
  const asked = [];
  const fetch = async (url) => {
    asked.push(url);
    const sha = url.match(/\/commits\/([^/?]+)$/)?.[1];
    if (sha && commits[sha]) return globalThis.Response.json({ sha, commit: { tree: { sha: `${sha}tree` } }, parents: commits[sha].map((parent) => ({ sha: parent })) });
    const name = url.match(/artifacts\?name=([^&]+)/)?.[1];
    if (name) {
      const at = reported.findIndex((sha) => name === `size-closure-${sha}tree`);
      return globalThis.Response.json({ artifacts: at < 0 ? [] : [{ id: 100 + at, expired: false, created_at: "2026-11-21T09:00:00Z" }] });
    }
    const id = url.match(/artifacts\/(\d+)\/zip$/)?.[1];
    if (id) return new globalThis.Response(zip("closure.json", JSON.stringify(docs(191_000 + Number(id)))));
    return new globalThis.Response("not found", { status: 404 });
  };
  return { fetch, asked };
}

test("with no report for the commit a pull request merges into, the base is the nearest first-parent ancestor that has one", async () => {
  // merge -> m0 (main's run still measuring) -> m1 -> m2 (measured). m0's second parent, a side branch, was measured too,
  // and is not main's history.
  const { fetch, asked } = history({ merge: ["m0", "pr"], m0: ["m1", "side"], m1: ["m2"], m2: ["m3"], side: [] }, ["side", "m2"]);
  const found = await baseReport({ check: "closure", sha: "merge", repo: "o/r", api: "https://api", token: "t", fetch });
  assert.deepEqual(found, { report: docs(191_101), from: "size-closure-m2tree", artifact: 101, commit: "m2", behind: 2 });
  assert.ok(!asked.some((url) => url.includes("sidetree")), "a second parent's report is never used");
});

test("beyond LOOKBACK commits back no ancestor's report is used, and the ceilings decide", async () => {
  assert.equal(LOOKBACK, 20);
  const chain = Object.fromEntries(Array.from({ length: 30 }, (_, i) => [`m${i}`, [`m${i + 1}`]]));
  const { fetch } = history({ merge: ["m0"], ...chain }, [`m${LOOKBACK}`]);
  const found = await baseReport({ check: "closure", sha: "merge", repo: "o/r", api: "https://api", token: "t", fetch });
  assert.equal(found.report, null);
  assert.match(found.why, /no artifact named size-closure-m0tree, nor for the 19 commits before it on main/);

  const { fetch: near } = history({ merge: ["m0"], ...chain }, [`m${LOOKBACK - 1}`]);
  const last = await baseReport({ check: "closure", sha: "merge", repo: "o/r", api: "https://api", token: "t", fetch: near });
  assert.equal(last.commit, `m${LOOKBACK - 1}`);
  assert.equal(last.behind, LOOKBACK - 1);
});

test("a base taken from an earlier commit is named in each size's line, which says the growth includes the commits between", () => {
  const dir = scratchDir("ouro-size-gate-");
  writeFileSync(join(dir, "base-closure.json"), JSON.stringify(docs(191_889)));
  writeFileSync(join(dir, "base-closure.origin.json"), JSON.stringify({ commit: "abcdef1234567890", behind: 2 }));
  const base = readBase("closure", dir);
  assert.deepEqual(Object.keys(base), ["docs initial JavaScript"]);
  const verdict = judgeSizes(docs(192_051), { mode: "pull", base });
  assert.match(verdict.lines[0], /162 more than its base's 191889 \(measured at abcdef1, 2 commits before the commit this merges into; the growth includes theirs\)/);

  writeFileSync(join(dir, "base-closure.origin.json"), JSON.stringify({ commit: "abcdef1234567890", behind: 0 }));
  assert.doesNotMatch(judgeSizes(docs(192_051), { mode: "pull", base: readBase("closure", dir) }).lines[0], /measured at/);
});
