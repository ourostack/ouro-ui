import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { compare, describe, latestRelease, parse, staleness, statedVersions } from "./apple-release.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const real = (path) => readFileSync(join(root, path), "utf8");

/** The files statedVersions reads, with `version` in each place that states one. */
const files = (version) => ({
  "site/src/apple/kit.json": JSON.stringify({ release: version, releaseUrl: `https://github.com/ourostack/ouro-ui-apple/releases/tag/v${version}`, packageLine: `.package(url: "x", from: "${version}")` }),
  "docs/platforms/README.md": `| For web | v1 | core |\n| For Apple | [v${version}](https://x)[^a] | core v0.4.0 |\n`,
  "docs/platforms/apple.md": `Release [v${version}](https://x) meets core.\n\n\`\`\`swift\n.package(url: "x", from: "${version}")\n\`\`\`\n`,
});

test("versions compare as numbers, so 0.10.0 is newer than 0.9.9", () => {
  assert.deepEqual(parse("v0.4.1"), [0, 4, 1]);
  assert.equal(parse("0.4"), undefined);
  assert.ok(compare("0.10.0", "0.9.9") > 0);
  assert.ok(compare("0.2.1", "0.4.1") < 0);
  assert.equal(compare("v0.4.1", "0.4.1"), 0);
  assert.throws(() => compare("main", "0.4.1"), /Not versions/);
});

test("every place that states the Apple version is read, and none is behind when all name the newest release", () => {
  const found = statedVersions((path) => files("0.4.1")[path]);
  assert.equal(found.length, 6);
  assert.deepEqual(staleness(found, "0.4.1"), []);
});

test("a page left on the old release is behind, with its place named and what to do", () => {
  const old = { ...files("0.4.1"), "site/src/apple/kit.json": files("0.2.1")["site/src/apple/kit.json"] };
  const stale = staleness(statedVersions((path) => old[path]), "0.4.1");
  assert.deepEqual(stale.map((item) => [item.where, item.kind]), [["site/src/apple/kit.json release", "behind"], ["site/src/apple/kit.json releaseUrl", "behind"], ["site/src/apple/kit.json packageLine", "behind"]]);
  assert.match(describe(stale[0], "0.4.1"), /says 0\.2\.1, and ouro-ui-apple's newest release is 0\.4\.1\. Update the Apple pages/);
});

test("a version newer than any release, a missing row and a missing install line all fail", () => {
  const ahead = staleness(statedVersions((path) => files("9.9.9")[path]), "0.4.1");
  assert.equal(ahead.length, 6);
  assert.ok(ahead.every((item) => item.kind === "ahead"));
  assert.match(describe(ahead[0], "0.4.1"), /newer than ouro-ui-apple's newest release/);
  const bare = { ...files("0.4.1"), "docs/platforms/README.md": "nothing\n", "docs/platforms/apple.md": "nothing\n" };
  const missing = staleness(statedVersions((path) => bare[path]), "0.4.1");
  assert.deepEqual(missing.map((item) => item.kind), ["unreadable", "unreadable", "unreadable"]);
});

test("this repository's own pages state one version, in six places", () => {
  const found = statedVersions(real);
  assert.equal(found.length, 6);
  assert.equal(new Set(found.map((item) => item.version)).size, 1, JSON.stringify(found));
});

test("the newest release is asked for again after a server error or a rate limit, and an API that keeps failing is an error, not drift", async () => {
  const answers = (...statuses) => {
    const calls = [];
    const fetch = async (url, init) => {
      calls.push({ url, init });
      const status = statuses[Math.min(calls.length, statuses.length) - 1];
      return status === 200 ? { ok: true, status, json: async () => ({ tag_name: "v0.4.1" }) } : { ok: false, status, text: async () => "no" };
    };
    return { fetch, calls };
  };
  const ok = answers(500, 429, 200);
  assert.equal(await latestRelease({ fetch: ok.fetch, delayMs: 0, token: "t" }), "0.4.1");
  assert.equal(ok.calls.length, 3);
  assert.equal(ok.calls[0].url, "https://api.github.com/repos/ourostack/ouro-ui-apple/releases/latest");
  assert.equal(ok.calls[0].init.headers.authorization, "Bearer t");
  const broken = answers(500);
  await assert.rejects(latestRelease({ fetch: broken.fetch, delayMs: 0 }), { name: "ReleaseUnreadable", message: /could not be read: 500 no/ });
  assert.equal(broken.calls.length, 3);
  const missing = answers(404);
  await assert.rejects(latestRelease({ fetch: missing.fetch, delayMs: 0 }), { name: "ReleaseUnreadable" });
  assert.equal(missing.calls.length, 1);
  await assert.rejects(latestRelease({ fetch: async () => { throw new Error("offline"); }, delayMs: 0, attempts: 2 }), { message: /offline/ });
  await assert.rejects(latestRelease({ fetch: async () => ({ ok: true, json: async () => ({ tag_name: "nightly" }) }) }), { name: "ReleaseUnreadable", message: /no version number/ });
});

test("the workflow runs hourly, on a change to the pages and by hand, and reports behind-ness, and only that, in one issue at most daily", () => {
  const text = real(".github/workflows/apple-release.yml");
  assert.match(text, /^ {2}schedule:\n {4}- cron: "\d+ \* \* \* \*"$/m);
  assert.match(text, /^ {2}workflow_dispatch:$/m);
  for (const event of ["push", "pull_request"]) {
    const block = text.split(new RegExp(`^ {2}${event}:\n`, "m"))[1].split(/\n {2}\S/)[0];
    for (const path of ["site/src/apple/kit.json", "docs/platforms/README.md", "docs/platforms/apple.md", "scripts/apple-release.mjs"]) assert.ok(block.includes(`- ${path}`), `${event} ${path}`);
  }
  assert.match(text, /^ {8}id: compare\n {8}env:\n {10}GH_TOKEN: \$\{\{ github\.token \}\}\n {8}run: node scripts\/apple-release\.mjs$/m);
  assert.match(text, /needs: \[compare\]\n\s+if: always\(\) && needs\.compare\.outputs\.behind == 'true' && github\.event_name != 'pull_request'/);
  assert.match(text, /QUIET_HOURS: 24/);
});
