import assert from "node:assert/strict";
import { Buffer } from "node:buffer";
import { test } from "node:test";
import { build, createContext, gaveBack, isCurrent, mergedPrs, measureGiveBack, measurePins, mustPasses, parseSteps } from "./ledger.mjs";

const NOW = new Date("2026-11-13T22:00:00Z");
const releases = {
  "ourostack/ouro-ui": [
    { tag_name: "v1.3.15", published_at: "2026-11-13T10:00:00Z", html_url: "https://example.test/r/1.3.15", draft: false, prerelease: false },
    { tag_name: "v1.3.14", published_at: "2026-11-12T10:00:00Z", html_url: "https://example.test/r/1.3.14", draft: false, prerelease: false },
    { tag_name: "v1.2.13", published_at: "2026-11-01T10:00:00Z", html_url: "https://example.test/r/1.2.13", draft: false, prerelease: false },
  ],
  "ourostack/ouro-ui-core": [{ tag_name: "v0.4.1", published_at: "2026-11-08T10:00:00Z", html_url: "https://example.test/c", draft: false, prerelease: false }],
  "ourostack/ouro-ui-apple": [
    { tag_name: "v0.4.1", published_at: "2026-11-08T10:00:00Z", html_url: "https://example.test/a", draft: false, prerelease: false },
    { tag_name: "v0.2.1", published_at: "2026-11-01T10:00:00Z", html_url: "https://example.test/a0", draft: false, prerelease: false },
  ],
};
const b64 = (value) => JSON.stringify({ content: Buffer.from(typeof value === "string" ? value : JSON.stringify(value)).toString("base64") });

function fakeGh(calls = []) {
  return (args) => {
    calls.push(args.join(" "));
    const line = args.join(" ");
    const release = /repos\/([^/]+\/[^/]+)\/releases/.exec(line);
    if (release) return releases[release[1]].map((item) => JSON.stringify({ tag: item.tag_name, at: item.published_at, url: item.html_url })).join("\n");
    if (line.includes("contents/.github/ouro-hx-installed.json")) return b64({ tag: "v1.2.13" });
    if (line.includes("contents/Package.resolved")) return b64('{"identity":"ouro-ui-apple","state":{"version":"0.4.1"}}');
    if (line.includes("contents/")) throw new Error("gh api: Not Found");
    if (line.includes("git/trees")) return JSON.stringify({ truncated: false, tree: ["app/components/ouro/button/button.tsx", "app/components/ouro/alert/alert.tsx", "app/components/ouro/alert/alert.test.tsx", "registry/ouro/components/ouro/a/x.tsx", "registry/ouro/components/ouro/b/x.tsx"].map((path) => ({ type: "blob", path })) });
    if (args[0] === "issue") {
      return JSON.stringify([
        { number: 5, title: "Adoption: one", body: "<!-- adoption:card=card-one -->", state: "OPEN", url: "https://example.test/i/5", updatedAt: "2026-11-13T00:00:00Z" },
        { number: 6, title: "Adoption: program", body: "<!-- adoption:program -->\n| Step | Depends on | Repo | State | Evidence |\n|---|---|---|---|---|\n| action-model | decision-record | core | pending | todo |\n| decision-record | — | core | done | merged |", state: "OPEN", url: "https://example.test/i/6", updatedAt: "2026-11-13T00:00:00Z" },
      ]);
    }
    if (args[0] === "pr") {
      return JSON.stringify([
        { number: 1, title: "Button: spoonjoy-v2 asked for a retry", body: "", url: "https://example.test/p/1", mergedAt: "2026-11-10T00:00:00Z", headRefName: "x" },
        { number: 2, title: "Prepare main for the next release", body: "spoonjoy-v2", url: "https://example.test/p/2", mergedAt: "2026-11-11T00:00:00Z", headRefName: "prepare" },
        { number: 3, title: "Unrelated", body: "", url: "https://example.test/p/3", mergedAt: "2026-11-11T00:00:00Z", headRefName: "other" },
      ]);
    }
    if (line.includes("search/code")) {
      if (line.includes("components/ouro/")) return JSON.stringify({ total_count: 12, items: [] });
      if (line.includes("defineCommand")) return JSON.stringify({ total_count: 2, items: [{ path: "src/cli.ts" }, { path: "vendor/x.test.ts" }] });
      return JSON.stringify({ total_count: 0, items: [] });
    }
    if (line.includes("workflows/")) throw new Error("gh api: Not Found");
    throw new Error(`unexpected gh call: ${line}`);
  };
}

const config = {
  home: "ourostack/ouro-ui",
  label: "adoption",
  latest: { web: { repo: "ourostack/ouro-ui", name: "Ouro UI (web)" }, core: { repo: "ourostack/ouro-ui-core", name: "Core" }, apple: { repo: "ourostack/ouro-ui-apple", name: "Apple" } },
  giveBackRepos: ["ourostack/ouro-ui"],
  ax: { appleImport: "OuroAX" },
  cards: [{ id: "card-one", title: "One", outcome: "Do one.", surfaces: ["web"] }],
  surfaces: [
    {
      id: "web", name: "A web app", kind: "web app", repo: "org/web",
      pins: [{ label: "Ouro HX", latest: "web", from: "json", file: ".github/ouro-hx-installed.json", key: "tag" }],
      hx: { kind: "web", treeDirs: "(^|/)components/ouro/([^/]+)/[^/]+\\.tsx$", search: "components/ouro/", tokens: "ouro-hx" },
      ax: { search: "defineCommand", exclude: "\\.test\\." },
      giveBackTerms: ["spoonjoy-v2"], xray: [],
    },
    {
      id: "app", name: "A native app", kind: "native app", repo: "org/app",
      pins: [{ label: "ouro-ui-apple", latest: "apple", from: "regex", file: "Package.resolved", regex: "\"version\":\"([0-9.]+)\"" }],
      hx: { kind: "apple", components: "OuroButton", foundation: "OuroHX" },
      ax: { kind: "apple" },
      giveBackTerms: [], xray: [],
    },
    { id: "cli", name: "A CLI", kind: "CLI", repo: "org/cli", pins: [], hx: { kind: "na", reason: "CLI only" }, ax: { kind: "na", reason: "x" }, giveBackTerms: [], xray: [], inScope: false },
    { id: "secret", name: "Private", kind: "app", repo: "org/secret", privateRepo: true, pins: [], hx: { kind: "na", reason: "x" }, ax: { kind: "na", reason: "x" }, giveBackTerms: [], xray: [] },
  ],
};

const ctx = (calls) => createContext({ gh: fakeGh(calls), now: () => NOW, sleep: () => {}, searchGapMs: 0 });

test("parseSteps reads the program table and its dependencies", () => {
  const steps = parseSteps("| Step | Depends on | Repo | State | Evidence |\n|---|---|---|---|---|\n| `a` | — | r | Done | e |\n| b | a, c | — | pending | f |\ntext");
  assert.deepEqual(steps.map((step) => [step.id, step.dependsOn, step.repo, step.state]), [["a", [], "r", "done"], ["b", ["a", "c"], null, "pending"]]);
  assert.deepEqual(parseSteps(null), []);
});

test("a pin is behind by the stable releases published after it", () => {
  const web = config.surfaces[0];
  const latest = { web: { repo: "ourostack/ouro-ui", tag: "v1.3.15" } };
  const cellValue = measurePins(ctx([]), web, latest);
  assert.equal(cellValue.value[0].tag, "v1.2.13");
  assert.equal(cellValue.value[0].behind, 2);
  assert.equal(isCurrent(cellValue), false);
  assert.equal(cellValue.source, "https://github.com/org/web/blob/HEAD/.github/ouro-hx-installed.json");
});

test("a pin that cannot be read is null, never zero", () => {
  const web = { ...config.surfaces[0], pins: [{ label: "x", latest: "web", from: "json", file: "missing.json", key: "tag" }] };
  const cellValue = measurePins(ctx([]), web, { web: { repo: "ourostack/ouro-ui", tag: "v1.3.15" } });
  assert.equal(cellValue.value[0].behind, null);
  assert.match(cellValue.value[0].note, /^not measured/);
  assert.equal(isCurrent(cellValue), false);
});

test("a product on the latest release is current; one with no pin is not", () => {
  const app = config.surfaces[1];
  const current = measurePins(ctx([]), app, { apple: { repo: "ourostack/ouro-ui-apple", tag: "v0.4.1" } });
  assert.equal(isCurrent(current), true);
  assert.equal(isCurrent(measurePins(ctx([]), config.surfaces[2], {})), false);
});

test("give-back counts merged pull requests that name the product, and skips release pull requests", () => {
  const context = ctx([]);
  const prs = mergedPrs(context, ["ourostack/ouro-ui"]);
  const cellValue = measureGiveBack(context, config.surfaces[0], prs, config);
  assert.equal(cellValue.value, 1);
  assert.equal(cellValue.prs[0].number, 1);
  assert.equal(gaveBack(cellValue), true);
  assert.equal(gaveBack(measureGiveBack(context, config.surfaces[1], prs, config)), false);
  assert.equal(measureGiveBack(context, { ...config.surfaces[0], upstream: true }, prs, config).value, null);
});

test("must claims pass only when a report has must claims and all hold", () => {
  assert.equal(mustPasses({ value: null }), false);
  assert.equal(mustPasses({ value: { must: 0, mustHolding: 0 } }), false);
  assert.equal(mustPasses({ value: { must: 3, mustHolding: 2 } }), false);
  assert.equal(mustPasses({ value: { must: 3, mustHolding: 3 } }), true);
});

test("the ledger measures every cell, counts confirmed, and leaves unknowns null", () => {
  const calls = [];
  const ledger = build(ctx(calls), config);
  assert.equal(ledger.generatedAt, NOW.toISOString());
  assert.equal(ledger.summary.total, 3, "the out-of-scope CLI is listed but not counted");
  assert.equal(ledger.summary.listed, 4);
  assert.equal(ledger.summary.confirmed, 0);
  const web = ledger.surfaces.find((surface) => surface.id === "web");
  assert.equal(web.cells.hx.value, "partial", "two installed components is fewer than the ten that make it full");
  assert.equal(web.cells.ax.value, "yes");
  assert.equal(web.cells.actions.value, 0);
  assert.equal(web.cells.xray.value, null);
  assert.match(web.cells.xray.note, /^not measured/);
  assert.equal(web.cells.tracking.value[0].number, 5);
  assert.equal(web.conditions.gaveBack.met, true);
  assert.equal(web.conditions.current.met, false);
  const app = ledger.surfaces.find((surface) => surface.id === "app");
  assert.equal(app.cells.hx.value, "none");
  assert.equal(app.cells.tracking.value.length, 0);
  const secret = ledger.surfaces.find((surface) => surface.id === "secret");
  assert.equal(secret.url, null);
  assert.equal(secret.cells.hx.value, null);
  assert.deepEqual(ledger.program.steps.map((step) => step.id), ["action-model", "decision-record"]);
  assert.equal(ledger.program.headline.find((item) => item.key === "components").value, 2);
  assert.equal(ledger.program.headline.find((item) => item.key === "benchmark").value, null);
  for (const surface of ledger.surfaces) for (const value of Object.values(surface.cells)) assert.ok(value.measuredAt, "every cell says when it was measured");
  assert.deepEqual(ledger.summary.order[0], ledger.surfaces.filter((surface) => surface.inScope).sort((a, b) => a.met - b.met)[0].id);
});

test("code search waits its turn and retries a refusal", () => {
  let refusals = 1;
  const waits = [];
  const context = createContext({
    gh: () => {
      if (refusals-- > 0) throw new Error("gh api: HTTP 403 API rate limit exceeded");
      return JSON.stringify({ total_count: 1, items: [{ path: "a" }] });
    },
    now: () => NOW,
    sleep: (ms) => waits.push(ms),
  });
  assert.equal(context.search("q", "o/r").total, 1);
  assert.ok(waits.includes(30000));
});
