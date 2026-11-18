import assert from "node:assert/strict";
import { Buffer } from "node:buffer";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { lintMarkdown } from "../../registry/ouro/lib/ouro/claims-check.mjs";
import { BRANCH, createSources, keepRepo, publicView } from "./current.mjs";
import { fakeRepo } from "./fake-github.mjs";
import { gateLive, liveConfig, liveFor, runLiveCheck } from "./live.mjs";
import { scratchDir } from "../scratch.mjs";

const RELEASES = {
  web: { repo: "ourostack/ouro-ui", name: "Ouro UI", tag: "v1.3.187", sha: "c".repeat(40), url: "https://example.test/web" },
  core: { repo: "ourostack/ouro-ui-core", name: "Ouro UI core", tag: "v0.15.0", sha: "d".repeat(40), url: "https://example.test/core" },
  apple: { repo: "ourostack/ouro-ui-apple", name: "Ouro UI for Apple", tag: "v0.9.0", sha: "e".repeat(40), url: "https://example.test/apple" },
};

/** A live-checked app's config as the test gives it: the site at /app/, with the host's own waiver on its root. */
const LIVE = {
  targets: ["https://live.test/app/", "https://live.test/app/evidence.html"],
  prefix: "/app",
  hostWaive: { "/": { https: "the host's own answer" } },
};

const OFF_THEME = { rule: "off-theme", summary: "A colour written past the theme." };
const OFF_SCALE = { rule: "off-scale", summary: "Spacing off the theme's scale." };
const FINDING = { rule: "off-theme", page: "/app/", detail: ".hero sets color: #333, a fixed colour; use var(--ink) (text-ink)", gated: true };
const finding = (rule, page, detail, gated = true) => ({ rule, page, detail, gated });

/**
 * An app on v1.3.117 whose release v1.3.187 is the one Ouro Current moves it to. The two tags' new-rules.json are
 * `before` and `after` (text, or undefined for a tag without the file). liveCheck answers with `findings`, and records
 * each call in `calls`.
 */
function liveApp({ before = JSON.stringify([OFF_SCALE]), after = JSON.stringify([OFF_SCALE, OFF_THEME]), config = '{\n  "waive": {\n    "/": {\n      "overlap": "a reason"\n    }\n  }\n}\n', findings = [] } = {}) {
  const release = (rules) => new Map([["registry.json", Buffer.from(JSON.stringify({ items: [] }))], ...(rules === undefined ? [] : [["registry/ouro/check/new-rules.json", Buffer.from(rules)]])]);
  const previous = release(before);
  const next = release(after);
  const repo = fakeRepo({ ".github/ouro-hx-installed.json": `${JSON.stringify({ tag: "v1.3.117", tagCommit: "old", files: {} }, null, 2)}\n`, "ouro-check.json": config });
  const calls = [];
  const sources = {
    tarball: async (follows, at) => (at === "v1.3.117" ? previous : next),
    liveCheck: async (options) => {
      calls.push(options);
      return { findings };
    },
  };
  return { repo, sources, calls };
}

test("live: the check reads the waivers on the site's paths, as the factory workflow moves them, and the host's waiver on the root", () => {
  const config = liveConfig(JSON.stringify({ waive: { "**": { overlap: "x" }, "/": { "off-scale": "a" }, "/evidence.html": { "linked-card-dead-zone": "b" } }, known: { "off-theme": ["k"] } }), LIVE);
  assert.deepEqual(config, {
    waive: { "**": { overlap: "x" }, "/app/": { "off-scale": "a" }, "/app/evidence.html": { "linked-card-dead-zone": "b" }, "/": { https: "the host's own answer" } },
    known: { "off-theme": ["k"] },
  });
  assert.equal(liveFor("o/r"), null, "a repository without a live check gets none");
  assert.equal(liveFor("ourostack/factory").prefix, "/factory", "factory's site is checked under its own path");
});

test("live: the check runs at the release in a checkout and its findings come back, and a step that fails throws with its reason and removes the checkout", () => {
  const dir = scratchDir("ouro-current-live-");
  const root = () => {
    mkdirSync(join(dir, "run"));
    return join(dir, "run");
  };
  const fakeRun = ({ failAt = null, checkStatus = 3 } = {}) => {
    const ran = [];
    const run = (file, args, cwd) => {
      ran.push({ file, args, cwd });
      if (file === process.execPath) {
        const out = args[args.indexOf("--out") + 1];
        mkdirSync(out, { recursive: true });
        writeFileSync(join(out, "report.json"), JSON.stringify({ findings: [FINDING] }));
        return { status: checkStatus, output: checkStatus === 3 ? "" : "no Chromium" };
      }
      return failAt === file ? { status: 128, output: "fatal: repository not found" } : { status: 0, output: "" };
    };
    return { ran, run };
  };
  const config = { waive: {}, known: {} };
  const ok = fakeRun();
  assert.deepEqual(runLiveCheck({ tag: "v1.3.187", targets: LIVE.targets, config }, { run: ok.run, root }).findings, [FINDING], "exit 3 is findings, which the report holds");
  assert.deepEqual(ok.ran.map(({ file, args }) => (file === process.execPath ? "check" : `${file} ${args[0]}`)), ["git clone", "pnpm install", "scripts/retry.sh pnpm", "check"]);
  assert.deepEqual(ok.ran[2].args, ["pnpm", "exec", "playwright", "install", "--with-deps", "chromium"], "the browser download goes through the release's retry.sh, in the checkout");
  assert.equal(ok.ran[2].cwd, ok.ran[3].cwd);
  assert.deepEqual(ok.ran[0].args.slice(0, 5), ["clone", "--depth", "1", "--branch", "v1.3.187"]);
  assert.equal(ok.ran[0].args[5], "https://github.com/ourostack/ouro-ui.git");
  assert.equal(ok.ran[3].cwd.endsWith("ouro-ui"), true, "the check runs in the checkout at the release");
  assert.deepEqual(ok.ran[3].args.slice(1, 3), LIVE.targets);
  assert.match(ok.ran[3].args[ok.ran[3].args.indexOf("--config") + 1], /ouro-check\.json$/);
  assert.equal(existsSync(join(dir, "run")), false, "the checkout and its report are removed afterwards");

  const badCheck = fakeRun({ checkStatus: 1 });
  assert.throws(() => runLiveCheck({ tag: "v1.3.187", targets: LIVE.targets, config }, { run: badCheck.run, root }), /the check stopped \(exit 1\): no Chromium/);
  assert.equal(existsSync(join(dir, "run")), false, "a failed check removes its checkout too");

  const badClone = fakeRun({ failAt: "git" });
  assert.throws(() => runLiveCheck({ tag: "v1.3.187", targets: LIVE.targets, config }, { run: badClone.run, root }), /git clone failed \(exit 128\): fatal: repository not found/);
  assert.equal(badClone.ran.length, 1, "nothing is installed after a clone that fails");
  assert.equal(existsSync(join(dir, "run")), false);
});

test("live: an update that brings no rule runs nothing, and a rule file that cannot be read holds the update back before the check", async () => {
  const never = async () => {
    throw new Error("the check must not run");
  };
  assert.deepEqual(await gateLive({ live: LIVE, tag: "v1.3.187", rules: [], base: "{}", liveCheck: never }), { seed: null });
  const held = await gateLive({ live: LIVE, tag: "v1.3.187", rules: [], unreadable: ["Leaves the new Ouro check rules out of this list."], base: "{}", liveCheck: never });
  assert.match(held.held, /^held back: the Ouro check rules of v1\.3\.187 cannot be read, so the live check cannot tell the new rules from the existing ones: Leaves the new Ouro check rules/);
  const broken = await gateLive({ live: LIVE, tag: "v1.3.187", rules: ["off-theme"], base: "{", liveCheck: never });
  assert.match(broken.held, /ouro-check\.json cannot be read, so the Ouro check cannot run on the live site/);
});

test("live: the findings of the rules a release brings are recorded as known with the branch's keys for them, and a finding of another rule that is not gated is left out", async () => {
  const base = JSON.stringify({ waive: {}, known: { "off-theme": [".old sets color: red, a fixed colour"] } });
  // The branch lists off-theme but not reveal-reflow, so the rules are not all recorded and the live check runs.
  const branch = JSON.stringify({ known: { "off-theme": [".earlier sets color: blue, a fixed colour"], overlap: ["not brought by this release"] } });
  const liveCheck = async () => ({ findings: [FINDING, finding("overlap", "/app/", "two controls overlap", false)] });
  const gate = await gateLive({ live: LIVE, tag: "v1.3.187", rules: ["off-theme", "reveal-reflow"], base, branch, liveCheck });
  assert.deepEqual(JSON.parse(gate.seed.file), {
    waive: {},
    known: { "off-theme": [".earlier sets color: blue, a fixed colour", ".hero sets color: #333, a fixed colour", ".old sets color: red, a fixed colour"], "reveal-reflow": [] },
  });
  assert.deepEqual(gate.seed.counts, { "off-theme": 3, "reveal-reflow": 0 });
  const none = await gateLive({ live: LIVE, tag: "v1.3.187", rules: ["off-theme"], base, branch: null, liveCheck: async () => ({ findings: [] }) });
  assert.equal(none.seed.file, null, "a live site with no finding of the rule changes nothing, and the count is none");
  assert.deepEqual(none.seed.counts, { "off-theme": 1 }, "the rule's one recorded finding is the base's, and the live site has no more");
});

test("live: an update for a live-checked app records its new rule's findings as known and names them, the check run with the site's waivers", async () => {
  const { repo, sources, calls } = liveApp({
    findings: [
      finding("off-theme", "/app/", ".hero-sub sets color: var(--ink-soft), a fixed colour; use var(--muted-foreground) (text-muted-foreground)"),
      finding("off-theme", "/app/evidence.html", ".cta sets color: #333, a fixed colour; use var(--ink) (text-ink)"),
      finding("off-theme", "/app/evidence.html", ".hero-sub sets color: var(--ink-soft), a fixed colour; use var(--muted-foreground) (text-muted-foreground)"),
      finding("off-scale", "/app/", ".row sets gap: 1rem, a fixed spacing", false),
    ],
  });
  const result = await keepRepo(repo.gh, "o/r", RELEASES, sources, { live: LIVE });
  assert.equal(result.state, "pr");
  assert.deepEqual(calls, [{ tag: "v1.3.187", targets: LIVE.targets, config: { waive: { "/app/": { overlap: "a reason" }, "/": { https: "the host's own answer" } } } }]);
  assert.deepEqual(JSON.parse(repo.fileAt(BRANCH, "ouro-check.json")), {
    waive: { "/": { overlap: "a reason" } },
    known: { "off-theme": [".cta sets color: #333, a fixed colour", ".hero-sub sets color: var(--ink-soft), a fixed colour"] },
  });
  const text = repo.pulls[0].body;
  assert.match(text, /### New Ouro check rules\n\n- `off-theme`: A colour written past the theme\.\[\^ouro-check-off-theme\] `2` findings this app already has are recorded in `ouro-check\.json`'s `known`: they pass, and a new one fails\./);
  assert.doesNotMatch(text, /off-scale/, "a rule the old tag listed is not new, so it is not named");
  assert.deepEqual(lintMarkdown(text, { file: "pull request body" }), [], "the section passes a repository's claims check");
});

test("live: an update for a live-checked app whose live site has a finding of an existing rule gets no pull request, and the reason names the first three", async () => {
  const gated = (detail) => finding("off-scale", "/app/", detail);
  const { repo, sources } = liveApp({
    findings: [
      finding("off-theme", "/app/", ".hero sets color: #333, a fixed colour; use var(--ink) (text-ink)"),
      gated(".row sets gap: 1rem, a fixed spacing; use calc(var(--spacing) * 4) (gap-4)"),
      gated(".stack sets gap: 2rem, a fixed spacing; use calc(var(--spacing) * 8) (gap-8)"),
      finding("off-scale", "/app/evidence.html", ".grid sets gap: 3rem, a fixed spacing; use calc(var(--spacing) * 12) (gap-12)"),
      finding("off-scale", "/app/evidence.html", ".strip sets gap: 4rem, a fixed spacing; use calc(var(--spacing) * 16) (gap-16)"),
    ],
  });
  const result = await keepRepo(repo.gh, "o/r", RELEASES, sources, { live: LIVE });
  assert.equal(result.state, "skipped");
  assert.equal(result.pr, null);
  assert.equal(result.reason, "held back: the Ouro check of v1.3.187 finds 4 findings of existing rules on the live site: off-scale on /app/: .row sets gap: 1rem, a fixed spacing; off-scale on /app/: .stack sets gap: 2rem, a fixed spacing; off-scale on /app/evidence.html: .grid sets gap: 3rem, a fixed spacing, and 1 more.");
  assert.equal(repo.pulls.length, 0, "no pull request is opened");
  assert.equal(repo.refs.has(BRANCH), false, "and nothing is written to the update's branch");
});

test("live: a second run whose update branch already lists the new rule's findings runs no live check, and keeps that record", async () => {
  const { repo, sources, calls } = liveApp({ findings: [FINDING, finding("off-theme", "/app/evidence.html", ".cta sets color: #333, a fixed colour; use var(--ink) (text-ink)")] });
  await keepRepo(repo.gh, "o/r", RELEASES, sources, { live: LIVE });
  const recorded = repo.fileAt(BRANCH, "ouro-check.json");
  const head = repo.refs.get(BRANCH);
  const again = await keepRepo(repo.gh, "o/r", RELEASES, sources, { live: LIVE });
  assert.equal(calls.length, 1, "the branch already records the rule, so the second run checks nothing");
  assert.equal(again.state, "pr");
  assert.equal(repo.fileAt(BRANCH, "ouro-check.json"), recorded, "the record is kept as the branch has it");
  assert.equal(repo.refs.get(BRANCH), head, "and nothing new is pushed");
  assert.match(repo.pulls[0].body, /`2` findings this app already has are recorded/, "the pull request still names the counts");
});

test("live: a live check that finds nothing records the new rule with an empty list, so the next run does not check again", async () => {
  const { repo, sources, calls } = liveApp({ findings: [] });
  await keepRepo(repo.gh, "o/r", RELEASES, sources, { live: LIVE });
  assert.deepEqual(JSON.parse(repo.fileAt(BRANCH, "ouro-check.json")).known, { "off-theme": [] });
  assert.match(repo.pulls[0].body, /This app's live site has no finding of it, so none is recorded/);
  await keepRepo(repo.gh, "o/r", RELEASES, sources, { live: LIVE });
  assert.equal(calls.length, 1);
});

test("live: a branch recorded for another release is not reused, and this release is checked", async () => {
  const { repo, sources, calls } = liveApp({ findings: [FINDING] });
  await keepRepo(repo.gh, "o/r", RELEASES, sources, { live: LIVE });
  const later = { ...RELEASES, web: { ...RELEASES.web, tag: "v1.3.200", sha: "f".repeat(40) } };
  const result = await keepRepo(repo.gh, "o/r", later, sources, { live: LIVE });
  assert.equal(calls.length, 2);
  assert.equal(calls[1].tag, "v1.3.200");
  assert.equal(result.state, "pr");
  assert.match(repo.pulls[0].title, /v1\.3\.200/);
});

test("live: a hold-back checked under six hours ago holds its release back again, with the earlier reason and times, and the check runs after six hours", async () => {
  const held = "held back: the Ouro check of v1.3.187 finds 1 finding of existing rules on the live site: off-scale on /app/: .row sets gap: 1rem, a fixed spacing.";
  const published = { repos: [{ repo: "o/r", state: "skipped", pins: [], pr: null, live: { tag: "v1.3.187", at: "2026-11-18T01:00:00Z", held } }] };
  const { repo, sources, calls } = liveApp({ findings: [FINDING] });
  sources.publishedLive = async (name) => published.repos.find((item) => item.repo === name)?.live ?? null;
  const again = await keepRepo(repo.gh, "o/r", RELEASES, sources, { live: LIVE, now: () => new Date("2026-11-18T03:00:00Z") });
  assert.equal(again.state, "skipped");
  assert.equal(again.reason, "held back: the Ouro check of v1.3.187 finds 1 finding of existing rules on the live site: off-scale on /app/: .row sets gap: 1rem, a fixed spacing (checked at 2026-11-18T01:00:00Z; next check after 2026-11-18T07:00:00Z).");
  assert.deepEqual(again.live, published.repos[0].live, "the record keeps its first check time");
  assert.deepEqual(calls, [], "no live check runs within the six hours");
  assert.equal(repo.pulls.length, 0);
  const after = await keepRepo(repo.gh, "o/r", RELEASES, sources, { live: LIVE, now: () => new Date("2026-11-18T07:00:00Z") });
  assert.equal(calls.length, 1, "after six hours it checks again");
  assert.equal(after.state, "pr");
});

test("live: a live check that cannot run is recorded with its reason, so the hold-back stands for six hours", async () => {
  const { repo, sources } = liveApp();
  sources.liveCheck = async () => {
    throw new Error("the check stopped (exit 1): no Chromium");
  };
  const now = new Date("2026-11-18T01:00:00Z");
  const result = await keepRepo(repo.gh, "o/r", RELEASES, sources, { live: LIVE, now: () => now });
  assert.deepEqual(result.live, { tag: "v1.3.187", at: "2026-11-18T01:00:00.000Z", held: result.reason });
});

test("live: the last hold-back is read from the published current.json on adoption-data, and a file that cannot be read gives none", async () => {
  const file = (value) => ({ content: Buffer.from(JSON.stringify(value)).toString("base64") });
  const paths = [];
  const record = { tag: "v1.3.187", at: "2026-11-18T01:00:00Z", held: "held back: x." };
  const readable = createSources({
    get: async (path) => {
      paths.push(path);
      return file({ repos: [{ repo: "ourostack/factory", state: "skipped", live: record }] });
    },
  });
  assert.deepEqual(await readable.publishedLive("ourostack/factory"), record);
  assert.equal(await readable.publishedLive("ourostack/other"), null);
  assert.deepEqual(paths, ["repos/ourostack/ouro-ui/contents/current.json?ref=adoption-data"], "read once per run");
  const missing = createSources({
    get: async () => {
      throw new Error("Not Found");
    },
  });
  assert.equal(await missing.publishedLive("ourostack/factory"), null, "without the file, the check runs");
});

test("live: the published current.json keeps a live check's hold-back and when it ran, beside the repository's state", () => {
  const live = { tag: "v1.3.187", at: "2026-11-18T01:00:00Z", held: "held back: x." };
  const view = publicView({ generatedAt: "2026-11-18T01:00:00Z", releases: RELEASES, installations: 1, repos: [{ repo: "ourostack/factory", private: false, state: "skipped", pins: [], pr: null, live }] });
  assert.deepEqual(view.repos[0].live, live);
});

  const unchanged = liveApp({ before: JSON.stringify([OFF_SCALE, OFF_THEME]), after: JSON.stringify([OFF_SCALE, OFF_THEME]), findings: [finding("off-scale", "/app/", ".row sets gap: 1rem, a fixed spacing")] });
  const kept = await keepRepo(unchanged.repo.gh, "o/r", RELEASES, unchanged.sources, { live: LIVE });
  assert.equal(kept.state, "pr");
  assert.deepEqual(unchanged.calls, []);
  assert.equal(unchanged.repo.fileAt(BRANCH, "ouro-check.json"), '{\n  "waive": {\n    "/": {\n      "overlap": "a reason"\n    }\n  }\n}\n', "nothing is recorded");
test("live: an update that brings no rule runs no live check, and a repository without a live check is updated without one", async () => {
  const unchanged = liveApp({ before: JSON.stringify([OFF_SCALE, OFF_THEME]), after: JSON.stringify([OFF_SCALE, OFF_THEME]), findings: [finding("off-scale", "/app/", ".row sets gap: 1rem, a fixed spacing")] });
  const kept = await keepRepo(unchanged.repo.gh, "o/r", RELEASES, unchanged.sources, { live: LIVE });
  assert.equal(kept.state, "pr");
  assert.deepEqual(unchanged.calls, []);
  assert.equal(unchanged.repo.fileAt(BRANCH, "ouro-check.json"), '{\n  "waive": {\n    "/": {\n      "overlap": "a reason"\n    }\n  }\n}\n', "nothing is recorded");

  const plain = liveApp({ findings: [FINDING] });
  const updated = await keepRepo(plain.repo.gh, "o/r", RELEASES, plain.sources);
  assert.equal(updated.state, "pr");
  assert.deepEqual(plain.calls, [], "no live check without a live configuration");
  assert.equal(updated.pr.pushed, true);
});

test("live: a live check that cannot run holds the update back, with its reason, and no pull request is opened", async () => {
  const { repo, sources } = liveApp();
  sources.liveCheck = async () => {
    throw new Error("the check stopped (exit 1): no Chromium");
  };
  const result = await keepRepo(repo.gh, "o/r", RELEASES, sources, { live: LIVE });
  assert.equal(result.state, "skipped");
  assert.equal(result.reason, "held back: the Ouro check of v1.3.187 could not run on the live site: the check stopped (exit 1): no Chromium");
  assert.equal(repo.pulls.length, 0);
});

test("live: a dry run of a live-checked update runs no live check, and says that one runs when the update is written", async () => {
  const { repo, sources, calls } = liveApp({ findings: [FINDING] });
  const result = await keepRepo(repo.gh, "o/r", RELEASES, sources, { dryRun: true, live: LIVE });
  assert.equal(result.state, "would-update");
  assert.deepEqual(calls, []);
  assert.match(result.plan.notes.join("\n"), /runs against the live site when this update is written: a finding of a rule it does not bring in holds the update back\./);
  assert.match(result.plan.sections[0], /### New Ouro check rules\n\n- `off-theme`/);
});
