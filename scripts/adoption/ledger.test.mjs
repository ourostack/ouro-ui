import assert from "node:assert/strict";
import { Buffer } from "node:buffer";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { build, censusAtZero, configPath, createContext, gaveBack, hxFull, isCurrent, measureActions, measureCensus, measureBenchmark, measurePrevious, mergedPrs, measureGiveBack, measurePins, measureXray, mustPasses, parseSteps } from "./ledger.mjs";
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

test("a product with no agent interface of its own passes the must check as n/a, not as measured", () => {
  const site = { id: "site", name: "A site", kind: "web site", repo: "org/web", pins: config.surfaces[0].pins, hx: config.surfaces[0].hx, ax: { kind: "na", reason: "A marketing site; no CLI or MCP." }, giveBackTerms: ["spoonjoy-v2"], xray: [] };
  const ledger = build(ctx([]), { ...config, surfaces: [site, { ...config.surfaces[0], id: "web2" }] });
  const [na, web] = ledger.surfaces;
  assert.equal(na.conditions.must.met, true);
  assert.match(na.cells.xray.note, /^n\/a: A marketing site/);
  assert.equal(na.cells.xray.value, null);
  assert.equal(na.met, 2, "the pin is a day late, and no census has found the site has no doors");
  assert.equal(web.conditions.must.met, false, "a product that has an agent interface still needs its X-ray");
  assert.equal(ledger.summary.unmeasuredCells, 3, "the web app's X-ray and both censuses: the site's n/a X-ray is not counted as unmeasured");
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

test("a library's from: floor with no resolved file lacks no release in its major, and is measured as a pin past it", () => {
  const real = JSON.parse(readFileSync(configPath, "utf8"));
  const shell = real.surfaces.find((surface) => surface.id === "app-shell");
  const manifest = '.package(url: "https://github.com/ourostack/ouro-ui-apple.git", from: "1.0.0"),\n';
  const apple = [
    { tag: "v1.0.0", at: "2026-11-10T00:00:00Z" },
    { tag: "v1.1.0", at: "2026-11-15T00:00:00Z" },
    { tag: "v1.2.0", at: "2026-11-17T00:00:00Z" },
    { tag: "v2.0.0", at: "2026-11-17T12:00:00Z" },
  ];
  const gh = (args) => {
    const line = args.join(" ");
    if (line.includes("contents/Package.swift")) return b64(manifest);
    if (/repos\/ourostack\/ouro-ui-apple\/releases/.test(line)) return apple.map((item) => JSON.stringify({ ...item, url: "u" })).join("\n");
    throw new Error(`unexpected gh call: ${line}`);
  };
  const measure = (tag) => measurePins(createContext({ gh, now: () => NOW, sleep: () => {}, searchGapMs: 0 }), shell, { apple: { repo: "ourostack/ouro-ui-apple", tag } });
  const inRange = measure("v1.2.0");
  assert.deepEqual([inRange.value[0].tag, inRange.value[0].behind, inRange.value[0].late], ["1.0.0 and up", 0, 0]);
  assert.equal(inRange.value[0].note, 'A floor, from: "1.0.0", with no resolved file: it builds against the newest 1.x, v1.2.0.');
  assert.equal(isCurrent(inRange), true);
  // A new major is out of the floor's range: the floor is a pin again, three releases behind.
  const nextMajor = measure("v2.0.0");
  assert.deepEqual([nextMajor.value[0].tag, nextMajor.value[0].behind], ["1.0.0", 3]);
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
      if (/workflows\/ci\.yml\/runs/.test(line)) return JSON.stringify({ workflow_runs: [{ id: 10, event: "push", head_branch: "main", head_repository: { full_name: "org/app" }, html_url: "https://example.test/run/10" }, { id: 11, event: "push", head_branch: "main", head_repository: { full_name: "org/app" }, html_url: "https://example.test/run/11" }] });
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

test("a report in a folder of its artifact is read, so an X-ray uploaded with other files still counts", () => {
  const dir = scratchDir("ledger-nested-");
  execFileSync("mkdir", ["-p", join(dir, "xray")]);
  const report = { tool: "ax-xray", at: "2026-11-16T08:13:55Z", checker: { version: "1" }, claimSet: { version: "0.1.0" }, target: { commit: "abc" }, summary: { claims: 30, holding: 11, must: 12, mustHolding: 7, checks: 30 } };
  writeFileSync(join(dir, "xray", "report.json"), JSON.stringify(report));
  writeFileSync(join(dir, "inventory.json"), "{}");
  execFileSync("zip", ["-q", "-r", "a.zip", "xray", "inventory.json"], { cwd: dir });
  const bytes = readFileSync(join(dir, "a.zip"));
  const gh = (args, { binary } = {}) => {
    const line = args.join(" ");
    if (/workflows\/ax-xray\.yml\/runs/.test(line)) return JSON.stringify({ workflow_runs: [{ id: 7, event: "push", head_branch: "main", head_repository: { full_name: "org/cli" }, html_url: "https://example.test/run/7" }] });
    if (/runs\/7\/artifacts/.test(line)) return JSON.stringify({ artifacts: [{ id: 9, name: "xray", expired: false }] });
    if (/artifacts\/9\/zip/.test(line) && binary) return bytes;
    throw new Error(`unexpected gh call: ${line}`);
  };
  const xray = measureXray(createContext({ gh, now: () => NOW, sleep: () => {}, searchGapMs: 0 }), { repo: "org/cli", xray: [{ repo: "org/cli", workflow: "ax-xray.yml", branch: "main" }] });
  assert.deepEqual([xray.value.must, xray.value.mustHolding], [12, 7]);
  assert.equal(mustPasses(xray), false);
});

test("a pin on a release published after the run read the releases is current, and a tag that is no release is still unknown", () => {
  const web = config.surfaces[0];
  const latest = { web: { repo: "ourostack/ouro-ui", tag: "v1.3.15" } };
  const pinned = (tag, answer) =>
    createContext({
      gh: (args) => {
        const line = args.join(" ");
        if (line.includes("ouro-hx-installed.json")) return b64({ tag });
        if (line.includes("releases/tags/")) {
          if (!answer) throw new Error("gh api: Not Found");
          return JSON.stringify(answer);
        }
        return fakeGh()(args);
      },
      now: () => NOW,
      sleep: () => {},
      searchGapMs: 0,
    });
  const newer = measurePins(pinned("v1.3.16", { tag_name: "v1.3.16", published_at: "2099-01-01T00:00:00Z", draft: false, prerelease: false }), web, latest);
  assert.deepEqual([newer.value[0].behind, newer.value[0].late], [0, 0]);
  assert.equal(isCurrent(newer), true);
  assert.equal(measurePins(pinned("v9.9.9", null), web, latest).value[0].behind, null);
  const pre = measurePins(pinned("v1.3.16", { tag_name: "v1.3.16", published_at: "2099-01-01T00:00:00Z", draft: false, prerelease: true }), web, latest);
  assert.equal(pre.value[0].behind, null, "a prerelease is not a stable release");
});

// ---- Census at zero ----------------------------------------------------------------------------------------

const CHECKER = "c".repeat(64);
const HARNESS_KINDS = ["mcp", "cli", "tool", "approval"];
const censusReport = (overrides = {}, product = {}) => ({
  ax: "census/1",
  tool: "ouro-census",
  checker: { version: "0.1.0", sha256: CHECKER, walkers: [] },
  target: { repo: "org/cli", ref: "refs/heads/main", commit: "abc123" },
  at: "2026-11-13T20:00:00Z",
  ...overrides,
  products: [{ product: "harness", walked: { kinds: HARNESS_KINDS, finders: [] }, summary: { found: 492, declared: 492, weak: 0, undeclared: 0, unwalked: 0, stale: 0, excluded: 3, baseline: 0 }, ...product }],
});

/** A gh that serves one main run with an `ax-census` artifact holding `report`, and the release's census manifest. */
function censusGh(dir, report, { manifest = { tool: "ouro-census", version: "0.1.0", checker: CHECKER, files: {} }, manifests = {}, artifact = "ax-census", headSha = "abc123", run = {}, calls = [] } = {}) {
  execFileSync("mkdir", ["-p", join(dir, "ax-census")]);
  writeFileSync(join(dir, "ax-census", "census.json"), JSON.stringify(report));
  writeFileSync(join(dir, "ax-census", "census.txt"), "harness: ...");
  rmSync(join(dir, "a.zip"), { force: true });
  execFileSync("zip", ["-q", "-r", "a.zip", "ax-census"], { cwd: dir });
  const bytes = readFileSync(join(dir, "a.zip"));
  return (args, { binary } = {}) => {
    const line = args.join(" ");
    calls.push(line);
    if (/workflows\/ax-xray\.yml\/runs/.test(line)) {
      assert.match(line, /branch=main&event=push/, "only pushes to main count, never a pull request from a fork's main");
      return JSON.stringify({ workflow_runs: [{ id: 7, head_sha: headSha, head_branch: "main", event: "push", head_repository: { full_name: "org/cli" }, html_url: "https://example.test/run/7", ...run }] });
    }
    if (/runs\/7\/artifacts/.test(line)) return JSON.stringify({ artifacts: [{ id: 9, name: artifact, expired: false }] });
    if (/artifacts\/9\/zip/.test(line) && binary) return bytes;
    const release = /repos\/ourostack\/ouro-ui\/releases/.test(line);
    if (release) return releases["ourostack/ouro-ui"].map((item) => JSON.stringify({ tag: item.tag_name, at: item.published_at, url: item.html_url })).join("\n");
    const ref = /contents\/scripts\/ouro-census\/dist-manifest\.json\?ref=(v[\d.]+)/.exec(line);
    if (ref) {
      const found = ref[1] === "v1.3.15" ? manifest : manifests[ref[1]];
      if (!found) throw new Error("gh api: Not Found");
      return b64(found);
    }
    throw new Error(`unexpected gh call: ${line}`);
  };
}

const censusSurface = { id: "cli", repo: "org/cli", census: { workflow: "ax-xray.yml", product: "harness", kinds: HARNESS_KINDS } };
const latestWeb = { web: { repo: "ourostack/ouro-ui", tag: "v1.3.15", at: "2026-11-13T10:00:00Z" } };
const censusOf = (report, options = {}, surface = censusSurface) => {
  const dir = scratchDir("ledger-census-");
  try {
    return measureCensus(createContext({ gh: censusGh(dir, report, options), now: () => NOW, sleep: () => {}, searchGapMs: 0 }), surface, latestWeb);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
};

test("a product's census at zero, from its newest run on main with a released checker, is at zero", () => {
  const census = censusOf(censusReport());
  assert.equal(census.value.found, 492);
  assert.equal(census.value.gaps, 0);
  assert.deepEqual(census.value.missingKinds, []);
  assert.equal(census.value.commit, "abc123");
  assert.equal(census.value.run, "https://example.test/run/7");
  assert.equal(census.source, "https://example.test/run/7");
  assert.equal(censusAtZero(census), true);
});

test("a census with gaps, or one that walks only some of the product's door kinds, is not at zero", () => {
  const gaps = censusOf(censusReport({}, { summary: { found: 492, declared: 480, weak: 1, undeclared: 11, unwalked: 1, stale: 1, excluded: 3, baseline: 14 } }));
  assert.equal(gaps.value.gaps, 14);
  assert.equal(censusAtZero(gaps), false);
  assert.match(gaps.note, /480 of 492 doors declared; 14 gaps \(1 weak, 11 undeclared, 1 unwalked, 1 stale\)/);
  const partial = censusOf(censusReport({}, { walked: { kinds: ["mcp", "cli"], finders: [] } }));
  assert.deepEqual(partial.value.missingKinds, ["tool", "approval"]);
  assert.equal(censusAtZero(partial), false);
  assert.match(partial.note, /doesn't walk tool or approval doors yet/);
  const empty = censusOf(censusReport({}, { summary: { found: 0, declared: 0, weak: 0, undeclared: 0, unwalked: 0, stale: 0, excluded: 0, baseline: 0 } }));
  assert.equal(censusAtZero(empty), false, "a census that finds nothing has nothing at zero");
});

test("a census report counts only from main at the run's own commit, with a released checker, within a week", () => {
  const not = (cellValue, pattern) => {
    assert.equal(cellValue.value, null);
    assert.match(cellValue.note, pattern);
    assert.equal(censusAtZero(cellValue), false);
  };
  not(censusOf(censusReport({ target: { repo: "org/cli", ref: "refs/pull/4/merge", commit: "abc123" } })), /^not measured: the census ran on refs\/pull\/4\/merge, not main/);
  not(censusOf(censusReport(), { headSha: "fff999" }), /^not measured: the census reports commit abc123, but its run built fff999/);
  not(censusOf(censusReport({ checker: { version: "0.1.0", sha256: "d".repeat(64), walkers: [] } })), /^not measured: the census's checker dddddddddddd is not one Ouro UI released in the last day \(v1\.3\.15 ships cccccccccccc\)/);
  not(censusOf(censusReport(), { manifest: null }), /^not measured: Ouro UI v1\.3\.15 has no census manifest/);
  not(censusOf(censusReport({ at: "2026-11-05T20:00:00Z" })), /^not measured: the newest census is from 2026-11-05, more than 7 days ago/);
  not(censusOf(censusReport(), { artifact: "xray" }), /^not measured: no ax-census artifact in the latest successful run on main/);
  not(censusOf(censusReport({ ax: "census/0" })), /^not measured: the ax-census artifact holds no census\/1 report/);
  not(censusOf(censusReport(), {}, { ...censusSurface, census: { ...censusSurface.census, product: "shepherd" } }), /^not measured: the census reports no shepherd product yet/);
  const none = measureCensus(ctx([]), { id: "x", repo: "org/x" }, latestWeb);
  not(none, /^not measured: no Ouro AX census runs in CI for this product yet/);
});

test("a product's own walkers are named in the census cell", () => {
  const census = censusOf(censusReport({ checker: { version: "0.1.0", sha256: CHECKER, walkers: [{ name: "desk-skills", module: "ax/skills.mts", kinds: ["skill"], sha256: "e".repeat(64) }] } }));
  assert.deepEqual(census.value.productWalkers, ["desk-skills"]);
  assert.match(census.note, /with the product's own walker desk-skills/);
});

test("Census at zero replaces actions on the one-action model as a condition, and an n/a product needs a census that finds no doors", () => {
  const ledger = build(ctx([]), config);
  assert.ok(ledger.schema >= 2, "schema 2 counts the census where schema 1 counted actions, so the site never reads one as the other");
  const web = ledger.surfaces.find((surface) => surface.id === "web");
  assert.equal(web.conditions.census.label, "Census at zero");
  assert.equal(web.conditions.census.met, false);
  assert.equal("oneAction" in web.conditions, false);
  assert.match(web.cells.census.note, /^not measured: no Ouro AX census/);
  assert.equal(web.cells.actions.value, 3, "the actions column stays, as information");
  const site = { id: "site", name: "A site", kind: "web site", repo: "org/web", pins: config.surfaces[0].pins, hx: config.surfaces[0].hx, ax: { kind: "na", reason: "A marketing site; no CLI or MCP." }, giveBackTerms: [], xray: [] };
  const naLedger = build(ctx([]), { ...config, surfaces: [site] });
  assert.equal(naLedger.surfaces[0].conditions.census.met, false, "a written reason alone no longer holds the check");
  assert.match(naLedger.surfaces[0].cells.census.note, /^not measured: no Ouro AX census/);
});

test("an n/a product whose census finds no doors holds Census at zero as n/a", () => {
  const dir = scratchDir("ledger-census-na-");
  try {
    const report = censusReport({}, { product: "site", walked: { kinds: HARNESS_KINDS, finders: [] }, summary: { found: 0, declared: 0, weak: 0, undeclared: 0, unwalked: 0, stale: 0, excluded: 0, baseline: 0 } });
    const base = fakeGh();
    const census = censusGh(dir, report, { headSha: "abc123", run: { head_repository: { full_name: "org/web" } } });
    const gh = (args, options) => {
      const line = args.join(" ");
      return /actions\/|census/.test(line) && !line.includes("git/trees") ? census(args, options) : base(args, options);
    };
    const site = { id: "site", name: "A site", kind: "web site", repo: "org/web", pins: [], hx: { kind: "na", reason: "x" }, ax: { kind: "na", reason: "A marketing site; no CLI or MCP." }, giveBackTerms: [], xray: [], census: { workflow: "ax-xray.yml", product: "site", kinds: HARNESS_KINDS } };
    const ledger = build(createContext({ gh, now: () => NOW, sleep: () => {}, searchGapMs: 0 }), { ...config, surfaces: [site] });
    const [na] = ledger.surfaces;
    assert.equal(na.conditions.census.met, true);
    assert.match(na.cells.census.note, /^n\/a: A marketing site; no CLI or MCP\. Its census finds no doors\./);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("Shepherd and the Butler have ledger rows, read from the harness's census and left unmeasured while private", () => {
  const real = JSON.parse(readFileSync(configPath, "utf8"));
  const shepherd = real.surfaces.find((surface) => surface.id === "shepherd");
  assert.equal(shepherd.repo, "ourostack/ouroboros");
  assert.deepEqual([shepherd.census.workflow, shepherd.census.product], ["ax-xray.yml", "shepherd"]);
  const butler = real.surfaces.find((surface) => surface.id === "butler");
  assert.equal(butler.privateRepo, true);
  assert.notEqual(butler.inScope, false, "counted, so Confirmed can't skip it");
  const harness = real.surfaces.find((surface) => surface.id === "harness");
  assert.deepEqual([harness.census.workflow, harness.census.product], ["ax-xray.yml", "harness"]);
  for (const surface of real.surfaces.filter((item) => item.census)) assert.ok(surface.census.kinds.length > 0, surface.id);
});

test("a kind only a product's own walker walks counts once that walker's hash is on the reviewed list", () => {
  const walker = { name: "desk-skills", module: "ax/skills.mts", kinds: ["skill"], sha256: "e".repeat(64) };
  const report = censusReport({ checker: { version: "0.1.0", sha256: CHECKER, walkers: [walker] } }, { walked: { kinds: [...HARNESS_KINDS, "skill"], finders: [] } });
  const surface = { ...censusSurface, census: { ...censusSurface.census, kinds: [...HARNESS_KINDS, "skill"] } };
  const unreviewed = censusOf(report, {}, surface);
  assert.deepEqual(unreviewed.value.missingKinds, ["skill"]);
  assert.match(unreviewed.note, /skill doors are walked by desk-skills, whose code eeeeeeeeeeee is not on the reviewed list/);
  assert.equal(censusAtZero(unreviewed), false);
  const reviewed = censusOf(report, {}, { ...surface, census: { ...surface.census, reviewed: { "desk-skills": "e".repeat(64) } } });
  assert.deepEqual(reviewed.value.missingKinds, []);
  assert.equal(censusAtZero(reviewed), true);
});

test("a census run that isn't a push to main in the product's own repository doesn't count", () => {
  const not = (run, pattern) => {
    const census = censusOf(censusReport(), { run });
    assert.equal(census.value, null);
    assert.match(census.note, pattern);
  };
  not({ head_repository: { full_name: "someone/fork" } }, /^not measured: the newest census run on main came from someone\/fork, not org\/cli/);
  not({ head_branch: "feature" }, /^not measured: the newest census run on main ran on feature/);
  not({ event: "pull_request" }, /^not measured: the newest census run on main was a pull_request run, not a push/);
});

test("a census dated after the run, or with counts that aren't whole numbers that add up, doesn't count", () => {
  const not = (report, pattern) => {
    const census = censusOf(report);
    assert.equal(census.value, null);
    assert.match(census.note, pattern);
  };
  not(censusReport({ at: "2026-11-14T22:00:00Z" }), /^not measured: the census is dated 2026-11-14T22:00:00Z, after the ledger's own clock/);
  const summary = (extra) => censusReport({}, { summary: { found: 492, declared: 492, weak: 0, undeclared: 0, unwalked: 0, stale: 0, excluded: 3, baseline: 0, ...extra } });
  not(summary({ weak: -1, undeclared: 1, declared: 492 }), /^not measured: the census's summary has weak -1, not a count/);
  not(summary({ found: "492" }), /^not measured: the census's summary has found "492", not a count/);
  not(summary({ stale: undefined }), /^not measured: the census's summary has stale undefined, not a count/);
  not(summary({ declared: 400 }), /^not measured: the census's summary doesn't add up: 400 declared and 0 weak or undeclared of 492 found/);
  not(censusReport({ checker: { version: "0.1.0", sha256: CHECKER, walkers: [{ module: "x.mts", kinds: ["skill"] }] } }), /^not measured: the census lists a product walker with no name/);
});

test("a product walker with no hash is never taken as reviewed", () => {
  const report = censusReport({ checker: { version: "0.1.0", sha256: CHECKER, walkers: [{ name: "desk-skills", module: "ax/skills.mts", kinds: ["skill"] }] } }, { walked: { kinds: [...HARNESS_KINDS, "skill"], finders: [] } });
  const surface = { ...censusSurface, census: { ...censusSurface.census, kinds: [...HARNESS_KINDS, "skill"] } };
  assert.deepEqual(censusOf(report, {}, surface).value.missingKinds, ["skill"]);
  assert.deepEqual(censusOf(report, {}, { ...surface, census: { ...surface.census, reviewed: { other: undefined } } }).value.missingKinds, ["skill"]);
});

test("a checker from a release out less than a day counts beside the latest one, and an older one doesn't", () => {
  const old = (tag) => censusOf(censusReport({ checker: { version: "0.1.0", sha256: "b".repeat(64), walkers: [] } }), { manifests: { [tag]: { tool: "ouro-census", version: "0.1.0", checker: "b".repeat(64), files: {} } } });
  assert.equal(censusAtZero(old("v1.3.14")), true, "v1.3.14 came out at 2026-11-12T10:00Z, 36 hours before the ledger ran, but v1.3.15, which replaced it, is under a day old");
  const stale = old("v1.2.13");
  assert.equal(stale.value, null);
  assert.match(stale.note, /^not measured: the census's checker bbbbbbbbbbbb is not one Ouro UI released in the last day \(v1\.3\.15 ships cccccccccccc\)/);
});

test("a product's census needs the door kinds it has listed, and its doors counted only over those kinds", () => {
  const none = censusOf(censusReport(), {}, { ...censusSurface, census: { ...censusSurface.census, kinds: [] } });
  assert.match(none.note, /^not measured: the ledger config lists no door kinds for harness's census/);
  const onlySkills = censusReport({}, { walked: { kinds: [...HARNESS_KINDS, "skill"], finders: [] }, byKind: { mcp: { found: 0 }, cli: { found: 0 }, tool: { found: 0 }, approval: { found: 0 }, skill: { found: 4 } }, summary: { found: 4, declared: 4, weak: 0, undeclared: 0, unwalked: 0, stale: 0, excluded: 0, baseline: 0 } });
  assert.equal(censusAtZero(censusOf(onlySkills)), false, "doors of a kind the config doesn't list don't make a census of the listed kinds find something");
});

test("the ledger says when it couldn't read Ouro UI's latest release, rather than naming a null release", () => {
  const dir = scratchDir("ledger-census-norelease-");
  try {
    const census = measureCensus(createContext({ gh: censusGh(dir, censusReport()), now: () => NOW, sleep: () => {}, searchGapMs: 0 }), censusSurface, { web: { repo: "ourostack/ouro-ui", tag: null, error: "boom" } });
    assert.match(census.note, /^not measured: Ouro UI's latest release couldn't be read \(boom\), so the census's checker can't be checked/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// ---- Stricter X-ray: every surface the product lists, from a push to main ---------------------------------

/** A gh that serves the given runs of `ax-xray.yml`, each with its reports as artifacts; `calls` records the lines. */
function xrayGh(dir, runs, calls = []) {
  const bytes = new Map();
  let next = 1;
  const served = runs.map((run) => ({ ...run, artifacts: run.reports.map((report) => {
    const id = next++;
    writeFileSync(join(dir, "report.json"), JSON.stringify(report));
    execFileSync("zip", ["-q", "-j", join(dir, "a.zip"), join(dir, "report.json")]);
    bytes.set(String(id), readFileSync(join(dir, "a.zip")));
    rmSync(join(dir, "a.zip"));
    return { id, name: report.tool === "ouro-actions" ? "actions-xray" : `xray-${id}`, expired: false };
  }) }));
  return (args, { binary } = {}) => {
    const line = args.join(" ");
    calls.push(line);
    if (/workflows\/ax-xray\.yml\/runs/.test(line)) return JSON.stringify({ workflow_runs: served.map((run) => Object.fromEntries(Object.entries(run).filter(([key]) => key !== "reports" && key !== "artifacts"))) });
    const runArtifacts = /runs\/(\d+)\/artifacts/.exec(line);
    if (runArtifacts) return JSON.stringify({ artifacts: served.find((run) => String(run.id) === runArtifacts[1]).artifacts });
    const art = /artifacts\/(\d+)\/zip/.exec(line);
    if (art && binary) return bytes.get(art[1]);
    throw new Error(`unexpected gh call: ${line}`);
  };
}
const pushRun = (id, extra = {}) => ({ id, event: "push", head_branch: "main", head_repository: { full_name: "org/agents" }, html_url: `https://example.test/run/${id}`, ...extra });
const xrayReport = (surface, at, must, mustHolding = must) => ({ tool: "ax-xray", at, checker: { version: "1.8.0" }, claimSet: { version: "1.8.0" }, target: { commit: "abc", [surface]: {} }, summary: { claims: must + 1, holding: mustHolding + 1, must, mustHolding, checks: must + 1 }, claims: [{ id: `${surface}.a`, surface, tier: "must" }, { id: `${surface}.b`, surface, tier: "should" }] });
const actionsReport = (at) => ({ tool: "ouro-actions", at, checker: { version: "1.10.0" }, claimSet: { version: "0.1.0" }, target: { app: { name: "Agents" }, commit: "abc" }, summary: { claims: 3, holding: 3, must: 3, mustHolding: 3, checks: 3 } });
const agents = { repo: "org/agents", xraySurfaces: ["cli", "mcp", "tools"], xray: [{ repo: "org/agents", workflow: "ax-xray.yml", branch: "main" }] };
const xrayOf = (runs, surface = agents, calls = []) => {
  const dir = scratchDir("ledger-xray-surfaces-");
  try {
    return measureXray(createContext({ gh: xrayGh(dir, runs, calls), now: () => NOW, sleep: () => {}, searchGapMs: 0 }), surface);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
};

test("a product's X-ray counts the newest report of each surface, and must claims pass only when every surface it lists is checked", () => {
  const partial = xrayOf([pushRun(10, { reports: [xrayReport("cli", "2026-11-13T12:00:00Z", 13), xrayReport("mcp", "2026-11-13T11:59:00Z", 2), actionsReport("2026-11-13T11:58:00Z")] })]);
  assert.deepEqual(partial.value.surfaces, ["cli", "mcp"], "the CLI and MCP reports are both ax-xray, and both count");
  assert.equal(partial.value.must, 18);
  assert.equal(partial.value.mustHolding, 18);
  assert.deepEqual(partial.value.missingSurfaces, ["tools"]);
  assert.equal(mustPasses(partial), false, "every must claim holds, but the in-turn tools are not checked");
  assert.match(partial.note, /^No X-ray report checks its tools doors yet, so its must claims can.t pass\. Adds up the newest report of each checker and surface: ax-xray cli, ax-xray mcp, ouro-actions\.$/);
  const whole = xrayOf([pushRun(10, { reports: [xrayReport("cli", "2026-11-13T12:00:00Z", 13), xrayReport("mcp", "2026-11-13T11:59:00Z", 2), xrayReport("tools", "2026-11-13T11:57:00Z", 2), actionsReport("2026-11-13T11:58:00Z")] })]);
  assert.deepEqual(whole.value.missingSurfaces, []);
  assert.equal(mustPasses(whole), true);
  const older = xrayOf([pushRun(10, { reports: [xrayReport("cli", "2026-11-13T12:00:00Z", 13, 12)] }), pushRun(11, { reports: [xrayReport("cli", "2026-11-12T12:00:00Z", 13), xrayReport("mcp", "2026-11-12T11:00:00Z", 2), xrayReport("tools", "2026-11-12T10:00:00Z", 2)] })]);
  assert.equal(older.value.mustHolding, 16, "the newest CLI report, which fails one, counts over the older one; each surface's newest is kept");
  assert.equal(mustPasses(older), false);
});

test("an X-ray report counts only from a successful push to main in the product's own repository", () => {
  const calls = [];
  const runs = [
    pushRun(10, { event: "pull_request", reports: [xrayReport("tools", "2026-11-13T12:00:00Z", 2)] }),
    pushRun(11, { head_repository: { full_name: "fork/agents" }, reports: [xrayReport("tools", "2026-11-13T11:00:00Z", 2)] }),
    pushRun(12, { head_branch: "feature", reports: [xrayReport("tools", "2026-11-13T10:00:00Z", 2)] }),
    pushRun(13, { reports: [xrayReport("cli", "2026-11-13T09:00:00Z", 13), xrayReport("mcp", "2026-11-13T09:00:00Z", 2)] }),
  ];
  const xray = xrayOf(runs, agents, calls);
  assert.match(calls.find((line) => /workflows\/ax-xray\.yml\/runs/.test(line)), /branch=main&event=push/);
  assert.deepEqual(xray.value.surfaces, ["cli", "mcp"], "the tools reports from a pull request, a fork and another branch don't count");
  assert.equal(xray.value.run, "https://example.test/run/13");
  const none = xrayOf([pushRun(10, { event: "pull_request", reports: [xrayReport("cli", "2026-11-13T12:00:00Z", 13)] })]);
  assert.equal(none.value, null);
  assert.match(none.note, /^not measured: no report from a push to main in org\/agents among the latest successful runs/);
});

test("every product with X-ray runs lists the surfaces they check, and a product that runs agents lists its in-turn tools", () => {
  const real = JSON.parse(readFileSync(configPath, "utf8"));
  for (const surface of real.surfaces) {
    if (surface.xray.length) assert.ok(Array.isArray(surface.xraySurfaces) && surface.xraySurfaces.length > 0, `${surface.id} has X-ray runs but lists no xraySurfaces`);
    if (surface.runsAgents) assert.ok(surface.xraySurfaces?.includes("tools"), `${surface.id} runs agents, so its xraySurfaces must include tools`);
    for (const entry of surface.xray) assert.equal(entry.branch, "main", `${surface.id}'s ${entry.workflow} counts only from a push to main, so it names branch main`);
  }
  assert.equal(real.surfaces.find((surface) => surface.id === "harness").runsAgents, true);
});

// ---- Ouro HX in full -------------------------------------------------------------------------------------------

test("a product with screens is confirmed only on Ouro HX in full, and one with no screen holds the check as n/a", () => {
  assert.equal(hxFull({ value: "full" }), true);
  assert.equal(hxFull({ value: "partial" }), false);
  assert.equal(hxFull({ value: null }), false, "an HX use not measured is not full");
  const ledger = build(ctx([]), config);
  const web = ledger.surfaces.find((surface) => surface.id === "web");
  assert.equal(ledger.schema, 3, "schema 3 adds the HX check, so the page never reads a ledger of four checks as one of five");
  assert.deepEqual(Object.keys(web.conditions), ["current", "hx", "census", "must", "gaveBack"]);
  assert.equal(web.conditions.hx.label, "Ouro HX in full");
  assert.equal(web.cells.hx.value, "partial");
  assert.equal(web.conditions.hx.met, false, "a web app using some Ouro components has hand-built screens left");
  const cli = ledger.surfaces.find((surface) => surface.id === "cli");
  assert.equal(cli.conditions.hx.met, true, "a CLI has no screens to build");
  const secret = ledger.surfaces.find((surface) => surface.id === "secret");
  assert.equal(secret.conditions.hx.met, false, "a private product's HX isn't read, so n/a in its config doesn't hold the check");
  assert.equal(web.confirmed, false);
});
