import assert from "node:assert/strict";
import { Buffer } from "node:buffer";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { build, configPath, createContext, gaveBack, isCurrent, measureActions, measureBenchmark, measurePrevious, mergedPrs, measureGiveBack, measurePins, measureXray, mustPasses, parseSteps } from "./ledger.mjs";
import { execFileSync } from "node:child_process";
import { rmSync, writeFileSync } from "node:fs";
import { scratchDir } from "../scratch.mjs";
import { join } from "node:path";

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
const declared = { generator: "ouro-actions 0.6.1", set: "shopping", tool: "web", actions: [{ id: "add_item" }, { id: "list_items" }, { id: "approve_access" }] };
const b64 = (value) => JSON.stringify({ content: Buffer.from(typeof value === "string" ? value : JSON.stringify(value)).toString("base64") });

function fakeGh(calls = []) {
  return (args) => {
    calls.push(args.join(" "));
    const line = args.join(" ");
    const release = /repos\/([^/]+\/[^/]+)\/releases/.exec(line);
    if (release) return releases[release[1]].map((item) => JSON.stringify({ tag: item.tag_name, at: item.published_at, url: item.html_url })).join("\n");
    if (line.includes("contents/.github/ouro-hx-installed.json")) return b64({ tag: "v1.2.13" });
    if (line.includes("contents/Package.resolved")) return b64('{"identity":"ouro-ui-apple","state":{"version":"0.4.1"}}');
    if (line.includes("contents/actions/generated/actions.json")) return b64(declared);
    if (line.includes("contents/")) throw new Error("gh api: Not Found");
    if (line.includes("git/trees")) return JSON.stringify({ truncated: false, tree: ["actions/generated/actions.json", "test/fixtures/actions/actions.json", "scripts/agent-benchmark/fixture/generated/actions.json", "app/components/ouro/button/button.tsx", "app/components/ouro/alert/alert.tsx", "app/components/ouro/alert/alert.test.tsx", "registry/ouro/components/ouro/a/x.tsx", "registry/ouro/components/ouro/b/x.tsx"].map((path) => ({ type: "blob", path })) });
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
  assert.equal(cellValue.value[0].late, 1, "v1.3.14 came out more than a day ago; v1.3.15 is younger than a day");
  assert.equal(isCurrent(cellValue), false);
  assert.equal(cellValue.source, "https://github.com/org/web/blob/HEAD/.github/ouro-hx-installed.json");
});

test("the summary adds up the releases products are behind, and names each product a day late or more", () => {
  const ledger = build(ctx([]), config);
  assert.equal(ledger.summary.releasesBehind, 2);
  assert.deepEqual(ledger.summary.late, [{ id: "web", name: "A web app", late: 1, behind: 2 }]);
});

test("a product within a day of every release it lacks is current, and one a day late is not", () => {
  const web = config.surfaces[0];
  const latest = { web: { repo: "ourostack/ouro-ui", tag: "v1.3.15" } };
  const fresh = (tag) => createContext({ gh: (args) => (args.join(" ").includes("ouro-hx-installed.json") ? b64({ tag }) : fakeGh()(args)), now: () => NOW, sleep: () => {}, searchGapMs: 0 });
  const day = measurePins(fresh("v1.3.14"), web, latest);
  assert.equal(day.value[0].behind, 1, "v1.3.15 came out after it");
  assert.equal(day.value[0].late, 0, "but less than a day ago");
  assert.equal(isCurrent(day), true);
  assert.equal(isCurrent(measurePins(fresh("v1.2.13"), web, latest)), false, "v1.3.14 has been out for more than a day");
});

test("a product with no agent interface of its own passes the action and must checks as n/a, not as measured", () => {
  const site = { id: "site", name: "A site", kind: "web site", repo: "org/web", pins: config.surfaces[0].pins, hx: config.surfaces[0].hx, ax: { kind: "na", reason: "A marketing site; no CLI or MCP." }, giveBackTerms: ["spoonjoy-v2"], xray: [] };
  const ledger = build(ctx([]), { ...config, surfaces: [site, { ...config.surfaces[0], id: "web2" }] });
  const [na, web] = ledger.surfaces;
  assert.equal(na.conditions.oneAction.met, true);
  assert.equal(na.conditions.must.met, true);
  assert.match(na.cells.xray.note, /^n\/a: A marketing site/);
  assert.equal(na.cells.xray.value, null);
  assert.equal(na.met, 3, "the pin is a day late, so only current fails");
  assert.equal(web.conditions.must.met, false, "a product that has an agent interface still needs its X-ray");
  assert.equal(ledger.summary.unmeasuredCells, 1, "only the web app's X-ray: the site's n/a cells are not counted as unmeasured");
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
  assert.equal(web.cells.actions.value, 3, "the actions come from the declaration, not from the program's steps");
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

test("code search stops waiting once its time budget is spent, so the hourly run finishes", () => {
  let clock = NOW.getTime();
  let calls = 0;
  const context = createContext({
    gh: () => {
      calls += 1;
      throw new Error("gh: try again in 60s (HTTP 429)");
    },
    now: () => new Date(clock),
    sleep: (ms) => {
      clock += ms;
    },
    searchBudgetMs: 5 * 60_000,
  });
  for (let i = 0; i < 40; i += 1) assert.throws(() => context.search(`q${i}`, "o/r"), /rate limited|429/);
  assert.ok(clock - NOW.getTime() <= 5 * 60_000 + 6500, `waited ${clock - NOW.getTime()} ms, more than the budget`);
  assert.throws(() => context.search("late", "o/r"), /code search's time budget/);
  assert.ok(calls < 40, `asked GitHub ${calls} times after the budget ran out`);
});

test("code search waits as long as GitHub says on an HTTP 429, within a cap", () => {
  const messages = ["gh: try again in 14.98s (HTTP 429)", "gh: try again in 732.6s (HTTP 429)", "gh: try again in 588ms (HTTP 429)"];
  const waits = [];
  const context = createContext({
    gh: () => {
      if (messages.length) throw new Error(messages.shift());
      return JSON.stringify({ total_count: 1, items: [{ path: "a" }] });
    },
    now: () => NOW,
    sleep: (ms) => waits.push(ms),
  });
  assert.equal(context.search("q", "o/r").total, 1);
  assert.deepEqual(waits.filter((ms) => ms !== 6500).slice(-3), [15980, 90000, 1588]);
});

test("Gatefold's pin is read from the ouro-ui-apple package in its XcodeGen project.yml", () => {
  const real = JSON.parse(readFileSync(configPath, "utf8"));
  const gatefold = real.surfaces.find((surface) => surface.id === "gatefold");
  const projectYml = "packages:\n  OuroUIApple:\n    url: https://github.com/ourostack/ouro-ui-apple\n    minorVersion: 0.2.1\n  GatefoldCore:\n    path: Packages/GatefoldCore\n";
  const gh = (args) => {
    const line = args.join(" ");
    if (line.includes("contents/project.yml")) return b64(projectYml);
    const release = /repos\/([^/]+\/[^/]+)\/releases/.exec(line);
    if (release) return releases[release[1]].map((item) => JSON.stringify({ tag: item.tag_name, at: item.published_at, url: item.html_url })).join("\n");
    throw new Error(`unexpected gh call: ${line}`);
  };
  const cellValue = measurePins(createContext({ gh, now: () => NOW, sleep: () => {}, searchGapMs: 0 }), gatefold, { apple: { repo: "ourostack/ouro-ui-apple", tag: "v0.4.1" } });
  assert.equal(cellValue.value[0].tag, "0.2.1");
  assert.equal(cellValue.value[0].behind, 1);
  assert.equal(cellValue.source, "https://github.com/ourostack/gatefold/blob/HEAD/project.yml");
});

test("actions count what ouro-actions generated, once each, and leave out fixtures and benchmark copies", () => {
  const calls = [];
  const cellValue = measureActions(ctx(calls), config.surfaces[0]);
  assert.equal(cellValue.value, 3);
  assert.match(cellValue.note, /3 in the "shopping" set \(actions\/generated\/actions\.json, ouro-actions 0\.6\.1\)/);
  assert.equal(cellValue.source, "https://github.com/org/web/blob/HEAD/actions/generated/actions.json");
  assert.ok(!calls.some((call) => call.includes("fixture")), "a fixture's or benchmark's actions.json is never read");
});

test("a product with no declaration has no actions on the model, and one whose file list was cut short is not measured", () => {
  const tree = (truncated, paths) => (args) => {
    const line = args.join(" ");
    if (line.includes("git/trees")) return JSON.stringify({ truncated, tree: paths.map((path) => ({ type: "blob", path })) });
    if (line.includes("contents/actions.json")) return b64({ name: "not from the generator", actions: [{ id: "x" }] });
    throw new Error(`unexpected gh call: ${line}`);
  };
  const make = (gh) => createContext({ gh, now: () => NOW, sleep: () => {}, searchGapMs: 0 });
  const none = measureActions(make(tree(false, ["src/index.ts", "actions.json"])), config.surfaces[0]);
  assert.equal(none.value, 0, "an actions.json the generator did not write is not a declaration");
  assert.match(none.note, /No actions declared/);
  const cut = measureActions(make(tree(true, ["src/index.ts"])), config.surfaces[0]);
  assert.equal(cut.value, null);
  assert.match(cut.note, /^not measured: .*truncated/);
});

test("the upstream has nothing to give back to, so that condition holds and its cell is not counted as unmeasured", () => {
  const upstream = { ...config.surfaces[0], id: "upstream", upstream: true };
  const ledger = build(ctx([]), { ...config, surfaces: [upstream] });
  const surface = ledger.surfaces[0];
  assert.equal(surface.cells.giveBack.value, null);
  assert.match(surface.cells.giveBack.note, /^n\/a/);
  assert.equal(surface.conditions.gaveBack.met, true);
  const nulls = Object.entries(surface.cells).filter(([, value]) => value.value === null).map(([key]) => key);
  assert.ok(nulls.includes("giveBack"));
  assert.equal(ledger.summary.unmeasuredCells, nulls.length - 1);
});

test("the ledger carries the checks of a day before, read from the data branch's history", () => {
  const earlier = {
    generatedAt: "2026-11-12T21:00:00Z",
    surfaces: [
      { id: "web", cells: { pins: { value: [] } }, conditions: { current: { label: "pins current", met: false }, must: { label: "AX must", met: true } } },
      { id: "listed-only", cells: {} },
    ],
  };
  const calls = [];
  const gh = (args) => {
    const line = args.join(" ");
    calls.push(line);
    if (line.includes("commits?sha=adoption-data&path=ledger.json")) return JSON.stringify([{ sha: "abc123" }]);
    if (line.includes("contents/ledger.json?ref=abc123")) return JSON.stringify(earlier);
    throw new Error(`unexpected gh call: ${line}`);
  };
  const previous = measurePrevious(createContext({ gh, now: () => NOW, sleep: () => {}, searchGapMs: 0 }), NOW.toISOString());
  assert.deepEqual(previous, { generatedAt: "2026-11-12T21:00:00Z", surfaces: [{ id: "web", conditions: { current: { met: false }, must: { met: true } } }] });
  assert.match(calls[0], /until=2026-11-12T22:00:00\.000Z/, "the newest ledger at least a day older than this one");
  const none = createContext({ gh: () => "[]", now: () => NOW, sleep: () => {}, searchGapMs: 0 });
  assert.equal(measurePrevious(none, NOW.toISOString()), null, "no history yet");
  const failing = createContext({ gh: () => { throw new Error("HTTP 502"); }, now: () => NOW, sleep: () => {}, searchGapMs: 0 });
  assert.equal(measurePrevious(failing, NOW.toISOString()), null, "a failed read leaves it out rather than failing the run");
});

test("the benchmark cell counts the published runs as the benchmark's page does: the latest run per model, interface and task", () => {
  const trial = (model, arm, task, success) => ({ model, arm, task, success, steps: 1, wallMs: 1000, tokens: { total: 10 }, costAiu: 0, personOnlyTask: false, personOnlyDone: false });
  const runs = {
    "2026-11-14-first": { startedAt: "2026-11-14T01:00:00Z", models: [{ provider: "m1" }], trials: [trial("m1", "action-model", "add-item", true), trial("m1", "browser", "add-item", false)] },
    "2026-11-14-oracle": { startedAt: "2026-11-14T00:00:00Z", models: [{ provider: "oracle" }], trials: [trial("oracle", "browser", "add-item", true)] },
    "2026-11-15-screens": { startedAt: "2026-11-15T01:00:00Z", models: [{ provider: "m1" }], trials: [trial("m1", "browser", "add-item", true)] },
    "2026-11-16-other-app": { startedAt: "2026-11-16T01:00:00Z", models: [{ provider: "m2" }], trials: [trial("m2", "plain-mcp", "md-append", true)] },
    "2026-11-16-broken": { startedAt: "2026-11-16T02:00:00Z", invalid: "too many infrastructure errors", models: [{ provider: "m1" }], trials: [trial("m1", "action-model", "add-item", false)] },
  };
  const gh = (args) => {
    const path = args.at(-1);
    if (path.endsWith("/results")) return JSON.stringify([...Object.keys(runs).map((name) => ({ name, type: "dir" })), { name: "README.md", type: "file" }]);
    const folder = /results\/([^/]+)\/results\.json$/.exec(path)?.[1];
    if (folder) return b64(runs[folder]);
    throw new Error(`unexpected ${path}`);
  };
  const config = JSON.parse(readFileSync(configPath, "utf8"));
  const measured = measureBenchmark(createContext({ gh, now: () => NOW }), config);
  assert.equal(measured.value, "Action model 1 of 1 done; browser driving 1 of 1 done; plain MCP 1 of 1 done");
  assert.match(measured.note, /across 3 trials by 2 models/);
  assert.equal(measured.source, "https://ui.ouroboros.bot/docs/agent-interfaces/");
  const failing = measureBenchmark(createContext({ gh: () => { throw new Error("HTTP 404"); }, now: () => NOW }), config);
  assert.equal(failing.value, null);
  assert.match(failing.note, /^not measured: HTTP 404/);
});

test("an app's X-ray and its action claims report add up, the newest report of each checker counting once", () => {
  const dir = scratchDir("ledger-xray-");
  try {
    const zipOf = (report) => {
      writeFileSync(join(dir, "report.json"), JSON.stringify(report));
      execFileSync("zip", ["-q", "-j", join(dir, "a.zip"), join(dir, "report.json")]);
      const bytes = readFileSync(join(dir, "a.zip"));
      rmSync(join(dir, "a.zip"));
      return bytes;
    };
    const report = (tool, at, must, mustHolding, score) => ({ tool, at, checker: { version: "1" }, claimSet: { version: "0.1.0" }, target: { app: { name: "App" }, commit: "abc" }, summary: { claims: must + 2, holding: mustHolding + 1, must, mustHolding, checks: must + 2, ...(score === undefined ? {} : { score }) } });
    const artifacts = {
      1: zipOf(report("ax-xray", "2026-11-15T12:00:00Z", 0, 0, 40)),
      2: zipOf(report("ouro-actions", "2026-11-15T11:00:00Z", 3, 3)),
      3: zipOf(report("ouro-actions", "2026-11-14T11:00:00Z", 3, 0)),
    };
    const gh = (args, { binary } = {}) => {
      const line = args.join(" ");
      if (/workflows\/ci\.yml\/runs/.test(line)) return JSON.stringify({ workflow_runs: [{ id: 10, html_url: "https://example.test/run/10" }, { id: 11, html_url: "https://example.test/run/11" }] });
      if (/runs\/10\/artifacts/.test(line)) return JSON.stringify({ artifacts: [{ id: 1, name: "xray", expired: false }, { id: 2, name: "actions-xray", expired: false }] });
      if (/runs\/11\/artifacts/.test(line)) return JSON.stringify({ artifacts: [{ id: 3, name: "actions-xray", expired: false }] });
      const art = /artifacts\/(\d+)\/zip/.exec(line);
      if (art && binary) return artifacts[art[1]];
      throw new Error(`unexpected gh call: ${line}`);
    };
    const context = createContext({ gh, now: () => NOW, sleep: () => {}, searchGapMs: 0 });
    const xray = measureXray(context, { repo: "org/app", xray: [{ repo: "org/app", workflow: "ci.yml", branch: "main" }] });
    assert.equal(xray.value.must, 3, "the X-ray's claim set has none; the action claims bring three");
    assert.equal(xray.value.mustHolding, 3, "the older action report that failed does not count");
    assert.equal(xray.value.claims, 7);
    assert.equal(xray.value.score, 40, "the X-ray's score is kept");
    assert.deepEqual(xray.value.reports.map((item) => item.tool), ["ax-xray 1", "ouro-actions 1"]);
    assert.equal(mustPasses(xray), true);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
