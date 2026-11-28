import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { compare, describe, judge, LAG_LIMIT_MS, lagStart, latestRelease, parse, staleness, statedVersions } from "./apple-release.mjs";

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
      return status === 200 ? { ok: true, status, json: async () => ({ tag_name: "v0.4.1", published_at: "2026-11-21T01:11:00Z" }) } : { ok: false, status, text: async () => "no" };
    };
    return { fetch, calls };
  };
  const ok = answers(500, 429, 200);
  assert.deepEqual(await latestRelease({ fetch: ok.fetch, delayMs: 0, token: "t" }), { version: "0.4.1", publishedAt: "2026-11-21T01:11:00Z" });
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
  await assert.rejects(latestRelease({ fetch: async () => ({ ok: true, json: async () => ({ tag_name: "nightly", published_at: "2026-11-21T01:11:00Z" }) }) }), { name: "ReleaseUnreadable", message: /no version number/ });
  await assert.rejects(latestRelease({ fetch: async () => ({ ok: true, json: async () => ({ tag_name: "v0.4.1" }) }) }), { name: "ReleaseUnreadable", message: /no publication time/ });
});

const RELEASED = "2026-11-21T01:11:00Z";
const hoursAfter = (hours) => Date.parse(RELEASED) + hours * 3_600_000;
const behindIn = (where) => ({ where, version: "0.3.0", kind: "behind" });
const onPull = (args) => judge({ event: "pull_request", latest: "0.4.1", publishedAt: RELEASED, ...args });

test("a pull request is held for a stale page only when its base is not behind it, and a pull request with nothing stale passes", () => {
  assert.equal(onPull({ stale: [], baseStale: [] }).fail, false);
  const own = onPull({ stale: [behindIn("docs/platforms/apple.md")], baseStale: [], now: hoursAfter(0.5) });
  assert.equal(own.fail, true);
  assert.match(own.messages[0].text, /docs\/platforms\/apple\.md says 0\.3\.0/);
});

test("a fresh release leaves main behind for under two hours: a pull request passes with a warning, not an error", () => {
  const stale = [behindIn("site/src/apple/kit.json release")];
  const verdict = onPull({ stale, baseStale: stale, now: hoursAfter(1) });
  assert.equal(verdict.fail, false);
  assert.deepEqual(verdict.messages.map((message) => message.level), ["warning"]);
  assert.match(verdict.messages[0].text, /main is behind .* 0\.4\.1.* will catch it up/);
});

test("main behind for more than two hours from the release's publication fails a pull request that stays behind it", () => {
  const stale = [behindIn("site/src/apple/kit.json release")];
  const at = (hours) => onPull({ stale, baseStale: stale, now: hoursAfter(hours) });
  assert.equal(at(2).fail, false, "exactly two hours is not more than two");
  const late = at(2.5);
  assert.equal(late.fail, true);
  assert.match(late.messages[0].text, /behind .* for 2\.5 hours .*\(kit-pin\.yml\)/);
  assert.equal(LAG_LIMIT_MS, 2 * 3_600_000);
});

test("a pull request that pins a wrong version fails even while main is merely behind", () => {
  const stale = [behindIn("site/src/apple/kit.json release"), { where: "docs/platforms/README.md, the For Apple row", version: "9.9.9", kind: "ahead" }];
  const verdict = onPull({ stale, baseStale: [behindIn("site/src/apple/kit.json release")], now: hoursAfter(1) });
  assert.equal(verdict.fail, true);
  assert.deepEqual(verdict.messages.map((message) => message.level), ["error", "warning"]);
  assert.match(verdict.messages[0].text, /which is newer than ouro-ui-apple's newest release/);
});

test("a pull request that moves a page behind a release main already has fails, even on the first hour", () => {
  const stale = [behindIn("docs/platforms/apple.md, Release")];
  assert.equal(onPull({ stale, baseStale: [], now: hoursAfter(0.1) }).fail, true, "with no base read, every stale page is the pull request's own");
  assert.equal(onPull({ stale, baseStale: [{ where: "other", version: "0.4.1", kind: "ahead" }], now: hoursAfter(0.1) }).fail, true, "a base that is not behind on this page leaves it the pull request's own");
});

test("on a push to main or a schedule, a pin behind the newest release warns for two hours after it came out, then fails and files the issue", () => {
  const stale = [behindIn("site/src/apple/kit.json release")];
  for (const event of ["push", "schedule", "workflow_dispatch", undefined]) {
    const early = judge({ event, latest: "0.4.1", stale, publishedAt: RELEASED, now: hoursAfter(1) });
    assert.equal(early.fail, false, `${event} within the window`);
    assert.deepEqual(early.messages.map((message) => message.level), ["warning"], String(event));
    assert.match(early.messages[0].text, /no issue is filed before then/);
    const late = judge({ event, latest: "0.4.1", stale, publishedAt: RELEASED, now: hoursAfter(2.5) });
    assert.equal(late.fail, true, `${event} after the window`);
    assert.deepEqual(late.messages.map((message) => message.level), ["error"], String(event));
  }
  assert.equal(judge({ event: "push", latest: "0.4.1", stale: [behindIn("x")], publishedAt: RELEASED, now: hoursAfter(2) }).fail, false, "exactly two hours is still the window");
});

test("on a push to main or a schedule, a page ahead of the newest release or unreadable fails at once, whatever the release's age", () => {
  for (const kind of ["ahead", "unreadable"]) {
    const verdict = judge({ event: "schedule", latest: "0.4.1", stale: [{ where: "docs/platforms/apple.md, Release", version: "9.9.9", kind }], publishedAt: RELEASED, now: hoursAfter(0.1) });
    assert.equal(verdict.fail, true, kind);
    assert.deepEqual(verdict.messages.map((message) => message.level), ["error"], kind);
  }
  assert.deepEqual(judge({ event: "push", latest: "0.4.1", stale: [], publishedAt: RELEASED }), { fail: false, messages: [] });
});

test("the check's behind output is the verdict, so a warning on main files no issue", () => {
  assert.match(readFileSync(join(root, "scripts/apple-release.mjs"), "utf8"), /behind=\$\{verdict\.fail\}/);
});

test("the workflow judges a pull request against its base, and runs the check that way only there", () => {
  const text = readFileSync(join(root, ".github/workflows/apple-release.yml"), "utf8");
  assert.match(text, /if \[ "\$GITHUB_EVENT_NAME" = pull_request \]; then node scripts\/apple-release\.mjs --base base; else node scripts\/apple-release\.mjs; fi/);
  assert.match(text, /^ {6}- name: The pages state ouro-ui-apple's newest release\n/m, "compare runs under its own step name");
  assert.match(text, /^ {6}- name: The base branch's pages\n {8}# [^\n]*\n {8}if: \$\{\{ github\.event_name == 'pull_request' \}\}\n {8}uses: actions\/checkout@[0-9a-f]{40} # v\d+\.\d+\.\d+\n {8}with:\n {10}persist-credentials: false\n {10}ref: \$\{\{ github\.event\.pull_request\.base\.sha \}\}\n {10}path: base\n {10}sparse-checkout: \|\n {12}site\/src\/apple\/kit\.json\n {12}docs\/platforms\/README\.md\n {12}docs\/platforms\/apple\.md\n {10}sparse-checkout-cone-mode: false$/m);
});

test("the workflow runs hourly, on a change to the pages and by hand, and reports behind-ness, and only that, in one issue at most daily", () => {
  const text = real(".github/workflows/apple-release.yml");
  assert.match(text, /^ {2}schedule:\n {4}- cron: "\d+ \* \* \* \*"$/m);
  assert.match(text, /^ {2}workflow_dispatch:$/m);
  for (const event of ["push", "pull_request"]) {
    const block = text.split(new RegExp(`^ {2}${event}:\n`, "m"))[1].split(/\n {2}\S/)[0];
    for (const path of ["site/src/apple/kit.json", "docs/platforms/README.md", "docs/platforms/apple.md", "scripts/apple-release.mjs"]) assert.ok(block.includes(`- ${path}`), `${event} ${path}`);
  }
  assert.match(text, /^ {8}id: compare\n {8}env:\n {10}GH_TOKEN: \$\{\{ github\.token \}\}\n {8}run: \|\n {10}if \[ "\$GITHUB_EVENT_NAME" = pull_request \]; then node scripts\/apple-release\.mjs --base base; else node scripts\/apple-release\.mjs; fi$/m);
  assert.match(text, /needs: \[compare\]\n\s+if: always\(\) && needs\.compare\.outputs\.behind == 'true' && github\.event_name != 'pull_request'/);
  assert.match(text, /QUIET_HOURS: 24/);
});

test("the lag is measured from the oldest release main is behind on, so a newer release does not reset it", () => {
  const releases = [
    { version: "1.12.0", publishedAt: "2026-11-28T03:00:00Z" },
    { version: "1.11.0", publishedAt: "2026-11-27T20:00:00Z" },
    { version: "1.10.1", publishedAt: "2026-11-27T10:00:00Z" },
  ];
  const stale = [{ where: "x", version: "1.10.1", kind: "behind" }];
  const since = lagStart(releases, stale, releases[0].publishedAt);
  assert.equal(since, "2026-11-27T20:00:00Z");
  const now = Date.parse("2026-11-28T03:39:00Z");
  assert.equal(judge({ event: "schedule", latest: "1.12.0", stale, publishedAt: releases[0].publishedAt, now }).fail, false, "judged from the newest, it only warns");
  assert.equal(judge({ event: "schedule", latest: "1.12.0", stale, publishedAt: since, now }).fail, true, "judged from the oldest, it fails");
  assert.equal(lagStart(releases, [], "fallback"), "fallback");
});
