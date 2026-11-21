import assert from "node:assert/strict";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { baselinePath, namesByStem, partNames, ratchetProblems, readBaseline, writeBaseline } from "./part-names.mts";
import { scratchDir } from "./scratch.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

/** A scratch registry with lib/ouro and a baseline, from `{ "<path>": "<text>" }`. */
function registry(files, baseline = { named: [], unnamed: {} }) {
  const dir = scratchDir("part-names-");
  mkdirSync(join(dir, "registry/ouro/lib/ouro"), { recursive: true });
  mkdirSync(join(dir, "scripts"), { recursive: true });
  writeFileSync(join(dir, baselinePath), JSON.stringify(baseline));
  for (const [path, text] of Object.entries(files)) {
    mkdirSync(dirname(join(dir, path)), { recursive: true });
    writeFileSync(join(dir, path), text);
  }
  return dir;
}

test("every element a named component styles carries a part name, and the other components hold their ratchet", () => {
  assert.deepEqual(partNames(root).problems, []);
  assert.deepEqual(ratchetProblems(root), []);
  const names = namesByStem(root);
  assert.ok(names.get("card")?.includes("card-content"));
});

test("the named components carry the shadcn names their roots and parts use, and an Ouro-only part starts with its stem", () => {
  const names = namesByStem(root);
  assert.ok(names.get("button")?.includes("button"));
  assert.ok(names.get("card")?.includes("card-title"));
  assert.ok(names.get("dialog")?.includes("dialog-content"));
  assert.ok(names.get("dialog")?.includes("dialog-overlay"));
  assert.ok(names.get("popover")?.includes("popover-content"));
  assert.ok(names.get("tooltip")?.includes("tooltip-content"));
  assert.ok(names.get("sheet")?.includes("sheet-content"));
  assert.ok(names.get("text-field")?.includes("input"));
  assert.ok(names.get("field")?.includes("label"));
  assert.ok(names.get("select")?.includes("select-content"));
  assert.ok(names.get("sheet")?.includes("sheet-scroller"));
});

test("the part-name scan fails a named component's unnamed element, a name that is not a literal, not kebab case, not its stem's, or after a spread", () => {
  const dir = registry({
    "registry/ouro/components/ouro/chip/component.json": JSON.stringify({ order: 1, components: ["chip"] }),
    "registry/ouro/components/ouro/chip/chip.tsx": [
      'import { Button } from "@/registry/ouro/components/ouro/button/button"; import { Tooltip as BaseTooltip } from "@base-ui/react/tooltip"; export const a = <div data-slot="chip" data-ouro="chip" className="flex" />;',
      'export const b = <span className="size-4" />;',
      'export const c = <span data-slot={open ? "chip-a" : "chip-b"} className="x" />;',
      'export const d = <span data-slot="chip_label" className="x" />;',
      'export const e = <span data-slot="label" className="x" />;',
      'export const f = <span {...rest} data-slot="chip-late" className="x" />;',
      'export const g = <Heading level={2}>Title</Heading>;',
      'export const h = <Button className="w-full" />;',
      'export const i = <BaseTooltip.Popup className="p-2" />;',
      'export const j = createElement("div", { "data-slot": "chip", ...rest, className: "flex" });',
      'export const k = createElement("div", { ...rest, className: "flex" });',
      'export const l = <span data-slot="chip-note" className="x" />;',
    ].join("\n"),
  }, { named: ["chip"], unnamed: {} });
  const { problems } = partNames(dir);
  const about = (line) => problems.filter((problem) => problem.startsWith(`registry/ouro/components/ouro/chip/chip.tsx:${line} `));
  assert.equal(about(2).length, 1, "a styled span with no name");
  assert.match(about(2)[0], /carries classes but no part name/);
  assert.match(about(3)[0], /is not a string literal/);
  assert.match(about(4)[0], /kebab case/);
  assert.match(about(5)[0], /starts with its stem/);
  assert.match(about(6)[0], /comes after a spread/);
  assert.match(about(7)[0], /draws a part with no name/);
  assert.equal(about(8).length, 0, "an Ouro component names its own root");
  assert.match(about(9)[0], /carries classes but no part name/);
  assert.equal(about(10).length, 0, "a createElement root that names itself passes");
  assert.match(about(11)[0], /createElement carries classes but no part name/);
  assert.equal(about(12).length, 0, "a name with its stem passes");
});

test("the part-name scan takes shadcn's name where a component's part is the same thing, and nothing else", () => {
  const dir = registry({
    "registry/ouro/components/ouro/field/component.json": JSON.stringify({ order: 1, components: ["field"] }),
    "registry/ouro/components/ouro/field/field.tsx": [
      'export const a = <label data-slot="label" className="x" />;',
      'export const b = <label className="x" />;',
    ].join("\n"),
  }, { named: ["field"], unnamed: {} });
  const { problems, names } = partNames(dir);
  assert.equal(problems.length, 1);
  assert.match(problems[0], /field.tsx:2 /);
  assert.deepEqual(names.map((name) => name.name), ["label"]);
});

test("the ratchet fails when a component's unnamed count rises or falls, and writes the count back when it falls", () => {
  const files = {
    "registry/ouro/components/ouro/hero/component.json": JSON.stringify({ order: 1, components: ["hero"] }),
    "registry/ouro/components/ouro/hero/hero.tsx": 'export const a = <span className="x" />;\nexport const b = <span className="y" />;',
  };
  const rose = registry(files, { named: [], unnamed: { hero: 1 } });
  assert.deepEqual(ratchetProblems(rose, partNames(rose)).map((problem) => problem.split(" ")[0]), ["hero"]);
  assert.match(ratchetProblems(rose, partNames(rose))[0], /2 styled element\(s\).*1 in .*name the new ones/);

  const fell = registry(files, { named: [], unnamed: { hero: 3 } });
  assert.match(ratchetProblems(fell, partNames(fell))[0], /down from 3.*--write/);
  writeBaseline(fell);
  assert.deepEqual(readBaseline(fell).unnamed, { hero: 2 });
  assert.deepEqual(ratchetProblems(fell, partNames(fell)), []);
  assert.deepEqual(JSON.parse(readFileSync(join(fell, baselinePath), "utf8")).named, []);
});
