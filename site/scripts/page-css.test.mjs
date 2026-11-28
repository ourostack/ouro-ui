import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { URL } from "node:url";
import { generate, generateDocsShell, specifiers } from "./page-css.mts";

const read = (path) => readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");

test("the voyage's CSS sources are current: run node site/scripts/page-css.mts when this fails", () => {
  assert.equal(read("site/src/voyage/voyage-sources.generated.css"), generate());
});

test("the site's stylesheet scans no file a page never renders: tests, type tests, the test kit or data", () => {
  // Tailwind emits CSS for every class-like word in what it scans, so a test's fixture class or a JSON file's
  // prose (themes.json's copyable CSS names every --color-* token) would ship in every page's stylesheet.
  const css = read("site/src/styles.css");
  for (const left of ["../../registry/**/*.test-d.ts", "../../registry/ouro/lib/ouro/testing", "./**/*.test.ts", "./**/*.test.tsx", "./**/*.json"]) {
    assert.ok(css.includes(`@source not "${left}";`), left);
  }
});

test("the docs' shell sources are current: run node site/scripts/page-css.mts when this fails", () => {
  assert.equal(read("site/src/docs/shell-sources.generated.css"), generateDocsShell());
});

test("the docs' shell leaves out the demos and the components only a demo renders, and keeps the shell's own", () => {
  const css = generateDocsShell();
  assert.match(css, /@source not "demos";/);
  assert.match(css, /@source not "call-surface\.tsx";/);
  assert.match(css, /@source not "\.\.\/\.\.\/\.\.\/registry\/ouro\/components\/ouro\/porthole";/);
  assert.doesNotMatch(css, /components\/ouro\/(button|link|text)";/);
});

test("the voyage's Tailwind build leaves out what the voyage never renders, and keeps what it does", () => {
  const css = generate();
  // The docs' demos and markdown, their page module, and a component the voyage does not import. The voyage keeps the docs'
  // index of items: its palette (voyage/site-palette.tsx) lists every page through components/docs-sections.tsx, which reads docs/items.ts.
  assert.match(css, /@source not "\.\.\/docs\/demos";/);
  assert.match(css, /@source not "\.\.\/docs\/demos\.tsx";/);
  assert.match(css, /@source not "\.\.\/docs\/markdown\.tsx";/);
  assert.match(css, /@source not "\.\.\/pages\/docs\.tsx";/);
  assert.match(css, /@source not "\.\.\/\.\.\/\.\.\/registry\/ouro\/components\/ouro\/accordion";/);
  // What the voyage renders: its own modules, and the components it imports, through the islands too.
  assert.doesNotMatch(css, /"\.\.\/voyage"|"\.\.\/pages\/voyage\.tsx"/);
  for (const name of ["button", "menu", "reorderable", "toast", "inspector"]) assert.doesNotMatch(css, new RegExp(`components/ouro/${name}";`), name);
});

test("inside a component the voyage renders, a source file the voyage never imports is left out", () => {
  const css = generate();
  assert.match(css, /@source not "\.\.\/\.\.\/\.\.\/registry\/ouro\/components\/ouro\/message\/thread-summary\.tsx";/);
  assert.doesNotMatch(css, /components\/ouro\/message\/message\.tsx";|components\/ouro\/message";/);
  assert.doesNotMatch(css, /\.(test|stories)\.tsx";/);
});

test("an import is found however it is written", () => {
  const source = [
    'import { a } from "./a";',
    'import type { B } from "./b";',
    'import "./c.css";',
    'export { d } from "./d";',
    "import {\n  e,\n  f,\n} from '@/registry/e';",
    'const g = lazy(() => import("./g"));',
  ].join("\n");
  assert.deepEqual(specifiers(source).sort(), ["./a", "./b", "./c.css", "./d", "./g", "@/registry/e"]);
});
