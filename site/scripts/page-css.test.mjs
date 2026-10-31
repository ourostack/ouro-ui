import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { URL } from "node:url";
import { generate, specifiers } from "./page-css.mts";

const read = (path) => readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");

test("the voyage's CSS sources are current: run node site/scripts/page-css.mts when this fails", () => {
  assert.equal(read("site/src/voyage/voyage-sources.generated.css"), generate());
});

test("the voyage's Tailwind build leaves out what the voyage never renders, and keeps what it does", () => {
  const css = generate();
  // The docs, their page module, and a component the voyage does not import.
  assert.match(css, /@source not "\.\.\/docs";/);
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
