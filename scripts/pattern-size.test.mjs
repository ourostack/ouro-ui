import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { BARE, BUDGET, CEILINGS, breakdown, closure, grew, judge, measureAll, ownerOf, owners, pageExport, patternNames, patternSizes, recordedFile, stylesheet } from "./pattern-size.mjs";
import { gateMode, judgeSizes, readBase, writeReport } from "./size-gate.mjs";
import { scratchDir } from "./scratch.mjs";

const registry = JSON.parse(readFileSync("registry.json", "utf8"));
const fixture = {
  items: [
    { name: "page", registryDependencies: ["ourostack/ouro-ui/card", "ourostack/ouro-ui/button"], files: [{ path: "registry/ouro/patterns/page/page.tsx" }] },
    { name: "card", registryDependencies: ["ourostack/ouro-ui/lib-cn"], files: [{ path: "registry/ouro/components/ouro/card/card.tsx" }] },
    { name: "button", registryDependencies: ["ourostack/ouro-ui/lib-cn", "ourostack/ouro-ui/card"], files: [{ path: "registry/ouro/components/ouro/button/button.tsx" }] },
    { name: "lib-cn", files: [{ path: "registry/ouro/lib/ouro/cn.ts" }] },
    { name: "ouro-base" },
  ],
};

test("a pattern's closure is the pattern and every item it depends on, once each, and an unknown or outside item fails", () => {
  assert.deepEqual(closure(fixture, "page"), ["button", "card", "lib-cn", "page"]);
  assert.deepEqual(patternNames(fixture), ["page"]);
  assert.throws(() => closure({ items: [{ name: "page", registryDependencies: ["ourostack/ouro-ui/gone"] }] }, "page"), /page depends on gone, which is no item/);
  assert.throws(() => closure({ items: [{ name: "page", registryDependencies: ["https://example.com/r/x.json"] }] }, "page"), /which is not an Ouro item/);
  assert.deepEqual(closure(registry, "settings-page").filter((item) => ["settings-page", "color-scheme-toggle", "menu", "select"].includes(item)), ["color-scheme-toggle", "menu", "select", "settings-page"]);
});

test("a built module belongs to the app, its registry item or its npm package, and the bytes add up by owner, largest first, leaving out the app's own", () => {
  const files = owners(fixture);
  const root = "/repo";
  assert.equal(ownerOf("/repo/registry/ouro/components/ouro/card/card.tsx", files, root), "card");
  assert.equal(ownerOf("/repo/registry/ouro/lib/ouro/cn.ts?used", files, root), "lib-cn");
  assert.equal(ownerOf("/repo/node_modules/.pnpm/@base-ui+react@1.8.0/node_modules/@base-ui/react/esm/menu/index.js", files, root), "@base-ui/react");
  assert.equal(ownerOf("/repo/node_modules/.pnpm/react-dom@19.3.0/node_modules/react-dom/cjs/react-dom.production.js", files, root), "react-dom");
  assert.equal(ownerOf("\0/repo/node_modules/react/jsx-runtime.js?commonjs-proxy", files, root), "react");
  assert.equal(ownerOf("/tmp/app/main.tsx", files, root), "app");
  assert.equal(ownerOf("/repo/node_modules/.cache/pattern-size/page/main.tsx", files, root, "/repo/node_modules/.cache/pattern-size/page"), "app");
  assert.equal(ownerOf("/repo/node_modules/.cache/pattern-size/page-two/main.tsx", files, root, "/repo/node_modules/.cache/pattern-size/page"), ".cache");
  const chunks = [
    { modules: { "/repo/registry/ouro/components/ouro/card/card.tsx": { renderedLength: 300 }, "/repo/node_modules/clsx/dist/clsx.mjs": { renderedLength: 40 } } },
    { modules: { "/repo/registry/ouro/components/ouro/button/button.tsx": { renderedLength: 300 }, "/repo/registry/ouro/lib/ouro/cn.ts": { renderedLength: 0 }, "/repo/node_modules/clsx/dist/lite.mjs": { renderedLength: 10 } } },
    { modules: { "/tmp/app/main.tsx": { renderedLength: 400 }, "\0vite/preload-helper.js": { renderedLength: 900 } } },
  ];
  assert.deepEqual(Object.entries(breakdown(chunks, files, root, "/tmp/app")), [["button", 300], ["card", 300], ["clsx", 50]]);
});

test("a pattern over its ceiling fails naming what grew since the ceiling was set, one within it passes, and one with no ceiling fails with the fix", () => {
  assert.deepEqual(grew({ menu: 100, card: 50, button: 10 }, { menu: 160, card: 50, button: 5, popover: 30 }), ["menu +60", "popover +30 (new)"]);
  const results = {
    [BARE]: { js: 100, css: 10 },
    lean: { addedJs: 1000, addedCss: 100, modules: {} },
    heavy: { addedJs: 1001, addedCss: 101, modules: { menu: 160, popover: 30 } },
    loud: { addedJs: 500, addedCss: 101, modules: { card: 50 } },
    unknown: { addedJs: 1, addedCss: 1, modules: {} },
  };
  const ceilings = { lean: { js: 1000, css: 100 }, heavy: { js: 1000, css: 100 }, loud: { js: 1000, css: 100 } };
  const verdicts = Object.fromEntries(judge(results, { ceilings, modules: { heavy: { menu: 100 }, loud: { card: 50 } } }).map((verdict) => [verdict.name, verdict]));
  assert.deepEqual(Object.keys(verdicts), ["lean", "heavy", "loud", "unknown"]);
  assert.equal(verdicts.lean.ok, true);
  assert.equal(verdicts.lean.message, "lean adds JavaScript 1000 of 1000 and CSS 100 of 100 gzip bytes");
  assert.equal(verdicts.heavy.ok, false);
  assert.equal(verdicts.heavy.message, "heavy adds JavaScript 1001 of 1000 and CSS 101 of 100 gzip bytes: over in JavaScript 1001 of 1000 and CSS 101 of 100. What its JavaScript gained since the ceiling was set, in bytes before minifying: menu +60, popover +30 (new).");
  assert.equal(verdicts.loud.ok, false);
  assert.match(verdicts.loud.message, /over in CSS 101 of 100\. What its JavaScript gained since the ceiling was set, in bytes before minifying: nothing; its CSS is the classes its closure's files use\.$/);
  assert.equal(verdicts.unknown.ok, false);
  assert.match(verdicts.unknown.message, /unknown has no ceiling: add one to CEILINGS in scripts\/pattern-size\.mjs/);
});

test("an app's stylesheet is app.css's, scanning only the files it installed, and a pattern exports one page", () => {
  const css = stylesheet(["/app/main.tsx", "/repo/registry/ouro/components/ouro/card/card.tsx"]);
  assert.match(css, /@import "\/.+\/node_modules\/tailwindcss\/index\.css" source\(none\);/);
  assert.match(css, /@import "\/.+\/registry\/ouro\/theme\/ouro-base\.css";/);
  assert.match(css, /@source "\/app\/main\.tsx";\n@source "\/repo\/registry\/ouro\/components\/ouro\/card\/card\.tsx";/);
  assert.doesNotMatch(css, /@source "\.\/registry"/);
  assert.equal(pageExport("export interface Stat {}\nexport function DashboardPage() {}\n", "x.tsx"), "DashboardPage");
  assert.throws(() => pageExport("export function Card() {}\n", "x.tsx"), /x\.tsx should export one page \(a function named \*Page\), and exports 0/);
  assert.throws(() => pageExport("export function APage() {}\nexport function BPage() {}\n", "x.tsx"), /exports 2/);
});

test("every page pattern adds no more JavaScript and CSS than its ceiling, gzip bytes over a bare app", async () => {
  const names = patternNames(registry);
  assert.deepEqual(names, ["dashboard-page", "list-detail-page", "settings-page"]);
  assert.deepEqual(Object.keys(CEILINGS).toSorted(), names, "CEILINGS names every pattern and no other");
  const modules = JSON.parse(readFileSync(recordedFile, "utf8"));
  assert.deepEqual(Object.keys(modules).toSorted(), names, "scripts/pattern-size.json records every pattern: run node scripts/pattern-size.mjs --record");
  const results = await measureAll({ registry, work: scratchDir("ouro-pattern-size-") });
  const verdicts = judge(results, { modules });
  for (const verdict of verdicts) console.log(verdict.message);
  // On a pull request, what each pattern adds is judged by the pull request's own growth over its base
  // (scripts/size-gate.mjs); the ceiling is enforced on main. A failure carries what the pattern's JavaScript gained.
  const sizes = patternSizes(results);
  writeReport("patterns", sizes);
  const gate = judgeSizes(sizes, { mode: gateMode(), base: readBase("patterns") });
  for (const line of gate.lines) console.log(`pattern-size-gate ${line}`);
  for (const tip of gate.tips) console.log(`::warning title=Pull request tips a size ceiling::${tip}`);
  const failed = new Set(gate.failures.map((failure) => failure.split(" ")[0]));
  const why = verdicts.filter((verdict) => failed.has(verdict.name)).map((verdict) => verdict.message);
  assert.deepEqual([...gate.failures, ...why], []);
});

test("each pattern's sizes reach the size gate with their ceilings and the budget a pull request may add", () => {
  const results = { [BARE]: { js: 1, css: 1 }, "settings-page": { addedJs: 104_500, addedCss: 13_000 } };
  assert.deepEqual(patternSizes(results), {
    "settings-page JavaScript": { bytes: 104_500, ceiling: CEILINGS["settings-page"].js, budget: BUDGET.js },
    "settings-page CSS": { bytes: 13_000, ceiling: CEILINGS["settings-page"].css, budget: BUDGET.css },
  });
});
