import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import axe from "axe-core";
import path from "node:path";
import { after, describe, it } from "node:test";
import { expect, vi } from "./expect.mjs";
import { censusTests, collectCensus, expectCensusMatches, installedItems, recordCensus, recordExpectedCensus } from "../../registry/ouro/census/census-page.mjs";
import { collectInPage } from "../../registry/ouro/census/census-collect.mjs";
import { BASELINE_PATH, EXPECTED_FILE, stringifyCensus, workerFileName } from "../../registry/ouro/census/census.mjs";

const cache = path.join(process.cwd(), "node_modules", ".cache");
mkdirSync(cache, { recursive: true });
const scratch = mkdtempSync(path.join(cache, "ouro-census-page-"));
after(() => rmSync(scratch, { recursive: true, force: true }));

const SAVE = { visible: true, role: "button", name: "Save", control: "button", part: "root", landmark: { role: "main", name: "" }, testId: null };
const LINK = { visible: true, role: "link", name: "Home", control: null, part: null, landmark: null, testId: "nav" };
const HIDDEN = { ...SAVE, name: "Hidden", visible: false };

/** A page whose census readings come from `readings`, one per evaluate of the collector, the last repeating. */
function fakePage(readings, { status = 200, url = "http://localhost/notes", goto } = {}) {
  let reading = 0;
  return {
    evaluate: vi.fn(async (fn) => {
      if (fn !== collectInPage) return undefined;
      const result = readings[Math.min(reading, readings.length - 1)];
      reading += 1;
      return result;
    }),
    waitForFunction: vi.fn(async () => undefined),
    waitForTimeout: vi.fn(async () => undefined),
    goto: vi.fn(goto ?? (async () => ({ status: () => status }))),
    url: () => url,
  };
}

describe("collectCensus", () => {
  it("loads axe-core, waits for animations, and returns the visible controls once two readings agree", async () => {
    const page = fakePage([[SAVE], [SAVE, LINK, HIDDEN], [LINK, SAVE, HIDDEN]]);
    expect(await collectCensus(page, { intervalMs: 5 })).toEqual([
      { identity: 'button "Save" [button/root] in main', count: 1 },
      { identity: 'link "Home" [-/-] in testid "nav"', count: 1 },
    ]);
    expect(page.evaluate).toHaveBeenCalledWith(expect.stringContaining("axe"));
    expect(page.waitForTimeout).toHaveBeenCalledWith(5);
    expect(page.waitForFunction).toHaveBeenCalledTimes(3);
  });

  it("refuses an axe-core older than the kit's minimum before it loads axe into the page, naming the version it found", async () => {
    const installed = axe.version;
    try {
      for (const old of ["4.11.1", "4.9.0", "4.13.0-canary.1", "canary"]) {
        axe.version = old;
        const page = fakePage([[SAVE]]);
        await expect(collectCensus(page, { intervalMs: 0 })).rejects.toThrow(`Ouro census needs axe-core 4.13.0 or later, and found ${old}.`);
        expect(page.evaluate).not.toHaveBeenCalled();
      }
      for (const recent of ["4.13.0", "4.100.0", "10.0.0"]) {
        axe.version = recent;
        expect(await collectCensus(fakePage([[SAVE]]), { intervalMs: 0 })).toEqual([{ identity: 'button "Save" [button/root] in main', count: 1 }]);
      }
    } finally {
      axe.version = installed;
    }
  });

  it("fails when the controls never settle", async () => {
    const page = fakePage([[SAVE], [LINK], [SAVE], [LINK]]);
    await expect(collectCensus(page, { attempts: 2, intervalMs: 0 })).rejects.toThrow("Ouro census: the page's controls never settled (2 readings 0 ms apart all differed).");
  });

  it("reads 20 times, 250 ms apart, by default", async () => {
    const page = fakePage([[SAVE], [LINK]]);
    page.evaluate.mockImplementation(async (fn) => (fn === collectInPage ? [page.waitForTimeout.mock.calls.length % 2 === 0 ? SAVE : LINK] : undefined));
    await expect(collectCensus(page)).rejects.toThrow("(20 readings 250 ms apart all differed)");
    expect(page.waitForTimeout).toHaveBeenCalledWith(250);
  });
});

describe("installedItems", () => {
  it("names each installed component file's stem, the values its markers carry", () => {
    const tree = {
      components: ["button", "select", "README.md"],
      [path.join("components", "button")]: ["button.tsx", "button.test.tsx", "button.stories.tsx", "button-styles.ts"],
      [path.join("components", "select")]: ["select.tsx", "native-select.tsx", "select-parts.tsx", "select-styles.tsx"],
    };
    expect(installedItems("components", (directory) => tree[directory])).toEqual(["button", "native-select", "select"]);
  });

  it("reads the folders on disk by default", () => {
    const root = path.join(scratch, "installed");
    mkdirSync(path.join(root, "dialog"), { recursive: true });
    writeFileSync(path.join(root, "dialog", "confirm-dialog.tsx"), "");
    writeFileSync(path.join(root, "dialog", "dialog.tsx"), "");
    expect(installedItems(root)).toEqual(["confirm-dialog", "dialog"]);
  });
});

describe("recording", () => {
  const journeys = [
    { id: "notes", enrolled: false, path: "/notes", states: [{ id: "default" }, { id: "menu" }] },
    { id: "home", enrolled: true, path: "/", states: [{ id: "default" }] },
  ];

  it("writes the expected set, projects and states, in one rename", () => {
    const directory = path.join(scratch, "expected");
    const file = recordExpectedCensus({ journeys, projects: ["webkit", "chromium"], worker: 3, directory });
    expect(file).toBe(path.join(directory, EXPECTED_FILE));
    expect(JSON.parse(readFileSync(file, "utf8"))).toEqual({ $projects: ["chromium", "webkit"], home: ["default"], notes: ["default", "menu"] });
  });

  it("adds each state to this worker's file", () => {
    const directory = path.join(scratch, "actual");
    const multiset = [{ identity: 'button "Save" [-/-] in main', count: 1 }];
    recordCensus({ directory, project: "webkit", worker: 0, journeyId: "notes", stateId: "default", multiset });
    const file = recordCensus({ directory, project: "webkit", worker: 0, journeyId: "notes", stateId: "menu", multiset: [] });
    expect(file).toBe(path.join(directory, workerFileName("webkit", 0)));
    expect(JSON.parse(readFileSync(file, "utf8"))).toEqual({ webkit: { notes: { default: multiset, menu: [] } } });
  });

  it("throws every problem with a state, and nothing for a match", () => {
    const actual = [{ identity: 'button "Save" [-/-] in main', count: 1 }];
    const options = { baseline: {}, baselinePath: "b.json", project: "webkit", journey: journeys[1], stateId: "default", actual, actualPath: "a.json", knownItems: ["button"] };
    expect(() => expectCensusMatches(options)).toThrow("Ouro census: no baseline for webkit / home / default in b.json");
    expect(() => expectCensusMatches(options)).toThrow("home is enrolled, so every control must be an Ouro control");
    const marked = [{ identity: 'button "Save" [button/root] in main', count: 1 }];
    expect(() => expectCensusMatches({ ...options, actual: marked, baseline: { webkit: { home: { default: marked } } } })).not.toThrow();
  });
});

/** Playwright's `test`, recording what the census registers so a test can run it. */
function fakeTest() {
  const registered = { beforeAll: [], tests: [], uses: [] };
  const test = (name, details, run) => registered.tests.push({ name, details, run, use: registered.uses.at(-1) });
  test.beforeAll = (run) => registered.beforeAll.push(run);
  test.describe = (_name, body) => {
    registered.uses.push(undefined);
    body();
  };
  test.use = (options) => {
    registered.uses[registered.uses.length - 1] = options;
  };
  return { test, registered };
}

describe("censusTests", () => {
  const componentsDir = path.join(scratch, "components");
  mkdirSync(path.join(componentsDir, "button"), { recursive: true });
  writeFileSync(path.join(componentsDir, "button", "button.tsx"), "");
  const marked = [{ identity: 'button "Save" [button/root] in main', count: 1 }];
  const journeys = [
    { id: "notes", enrolled: true, path: "/notes", storageState: "signed-in.json", states: [{ id: "default" }, { id: "menu", action: vi.fn(async () => undefined) }] },
    { id: "missing", enrolled: false, path: "/gone", status: 404, states: [{ id: "default" }] },
  ];
  const info = { project: { name: "webkit" }, workerIndex: 1 };

  it("registers one tagged test per state, each journey with its session, and the expected set before them", async () => {
    const resultsDir = path.join(scratch, "results");
    const baselinePath = path.join(scratch, "baseline.json");
    writeFileSync(baselinePath, stringifyCensus({ webkit: { notes: { default: marked, menu: marked }, missing: { default: marked } } }));
    const { test, registered } = fakeTest();
    const prepare = vi.fn(async () => undefined);
    censusTests({ test, journeys, projects: ["webkit"], componentsDir, baselinePath, resultsDir, prepare });
    expect(registered.tests.map(({ name, details, use }) => [name, details.tag, use])).toEqual([
      ["notes / default", "@ouro-census", { storageState: "signed-in.json" }],
      ["notes / menu", "@ouro-census", { storageState: "signed-in.json" }],
      ["missing / default", "@ouro-census", undefined],
    ]);
    registered.beforeAll[0]({}, info);
    expect(JSON.parse(readFileSync(path.join(resultsDir, EXPECTED_FILE), "utf8"))).toEqual({ $projects: ["webkit"], missing: ["default"], notes: ["default", "menu"] });

    const page = fakePage([[SAVE]]);
    await registered.tests[1].run({ page }, info);
    expect(page.goto).toHaveBeenCalledWith("/notes");
    expect(prepare).toHaveBeenCalledWith(page);
    expect(journeys[0].states[1].action).toHaveBeenCalledWith(page);
    await registered.tests[0].run({ page: fakePage([[SAVE]]) }, info);
    await registered.tests[2].run({ page: fakePage([[SAVE]], { status: 404, url: "http://localhost/gone" }) }, info);
    expect(JSON.parse(readFileSync(path.join(resultsDir, workerFileName("webkit", 1)), "utf8")).webkit.notes).toEqual({ default: marked, menu: marked });
  });

  it("fails a state whose page answers another status, redirects, or differs from the baseline", async () => {
    process.env["OURO_CENSUS_DIR"] = path.join(scratch, "from-env");
    try {
      const { test, registered } = fakeTest();
      censusTests({ test, journeys, projects: ["webkit"], componentsDir });
      await expect(registered.tests[0].run({ page: fakePage([[SAVE]], { status: 500 }) }, info)).rejects.toThrow("Ouro census: /notes answered 500, not 200.");
      await expect(registered.tests[0].run({ page: fakePage([[SAVE]], { goto: async () => null }) }, info)).rejects.toThrow("Ouro census: /notes answered undefined, not 200.");
      await expect(registered.tests[0].run({ page: fakePage([[SAVE]], { url: "http://localhost/login?next=/notes" }) }, info)).rejects.toThrow(
        "Ouro census: /notes redirected to /login?next=/notes; a journey's path is where its page is.",
      );
      // No baseline yet: every state says so, with the update command.
      await expect(registered.tests[0].run({ page: fakePage([[SAVE]]) }, info)).rejects.toThrow(`Ouro census: no baseline for webkit / notes / default in ${BASELINE_PATH}`);
      expect(readFileSync(path.join(scratch, "from-env", workerFileName("webkit", 1)), "utf8")).toContain("notes");
    } finally {
      delete process.env["OURO_CENSUS_DIR"];
    }
    const { test, registered } = fakeTest();
    censusTests({ test, journeys, projects: ["webkit"], componentsDir });
    expect(registered.tests).toHaveLength(3);
  });
});
