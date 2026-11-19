import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { namesByStem, partNames } from "./part-names.mts";
import { scratchDir } from "./scratch.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

/** A scratch registry with one component folder and lib/ouro, from `{ "<path>": "<text>" }`. */
function registry(files) {
  const dir = scratchDir("part-names-");
  mkdirSync(join(dir, "registry/ouro/lib/ouro"), { recursive: true });
  for (const [path, text] of Object.entries(files)) {
    mkdirSync(dirname(join(dir, path)), { recursive: true });
    writeFileSync(join(dir, path), text);
  }
  return dir;
}

test("every element a registry component styles carries a part name that starts with its stem", () => {
  assert.deepEqual(partNames(root).problems, []);
  const names = namesByStem(root);
  // A root is named after its stem, a part after the stem and the part, and lib/ouro's components count too.
  assert.ok(names.get("hero")?.includes("hero"));
  assert.ok(names.get("hero")?.includes("hero-media"));
  assert.ok(names.get("touch-target")?.includes("touch-target"));
});

test("the part-name scan fails an HTML element or a package's component with classes and no name, a name that is not a literal, not kebab case or not its stem's", () => {
  const dir = registry({
    "registry/ouro/components/ouro/chip/component.json": JSON.stringify({ order: 1, components: ["chip", "chip-group"] }),
    "registry/ouro/components/ouro/chip/chip.tsx": [
      'import { Button } from "@/registry/ouro/components/ouro/button/button"; import { Tooltip as BaseTooltip } from "@base-ui/react/tooltip"; import * as Base from "@base-ui/react/dialog"; import { Bar } from "./chip-styles"; export const a = <div data-slot="chip" data-ouro="chip" className="flex" />;',
      'export const b = <span className="size-4" />;',
      "export const c = <span data-slot={open ? \"chip-a\" : \"chip-b\"} className=\"x\" />;",
      'export const d = <span data-slot="chip_label" className="x" />;',
      'export const e = <span data-slot="label" className="x" />;',
      'export const f = <span data-slot={"chip-icon"} className="x" />;',
      'export const g = <span data-slot="chip-hint" />;',
      "export const h = <span>plain</span>;",
      'export const i = <Button className="w-full" />;',
      'export const j = <Bar className="w-full" />;',
      'export const k = <BaseTooltip.Popup className="p-2" />;',
      'export const l = <Base.Backdrop className="fixed" />;',
      'function Local() { return null; } export const m = <Local className="w-full" />;',
      'export const n = createElement("div", { "data-slot": "chip", ...rest, className: "flex" });',
      'export const o = createElement("div", { ...rest, className: "flex" });',
      'export const p = createElement("div", { "data-slot": kind, className: "flex" });',
      'export const q = createElement("div", { "data-slot": "row", className: "flex" });',
      'export const r = createElement("div", { id: "x" }, createElement(Other, rest));',
      'export const s = <Heading level={2}>Title</Heading>;',
      'export const t = <Text data-slot="chip-description">Words</Text>;',
      'export const u = <span {...rest} data-slot="chip-late" className="x" />;',
      'const owner = { name: "Pill", data: "pill" }; export const v = <span data-slot="pill-label" className="x" />;',
    ].join("\n"),
    "registry/ouro/components/ouro/chip/chip.test.tsx": 'export const t = <span className="ignored" />;',
    "registry/ouro/components/ouro/chip/parts/stray.tsx": 'export const s = <span className="x" />;',
    "registry/ouro/components/ouro/chip/chip-group.tsx": 'export const g = <div data-slot="chip-group-list" className="grid" />;\nexport const h = <div data-slot="chip-list" className="grid" />;',
    "registry/ouro/components/ouro/toast/component.json": JSON.stringify({ order: 2, components: ["toaster"] }),
    "registry/ouro/components/ouro/toast/toaster.tsx": 'export const t = <li data-slot="toast" data-ouro="toast" className="grid" />;\nexport const u = <p data-slot="toast-title" className="m-0" />;',
    "registry/ouro/lib/ouro/hit-area.tsx": 'export const h = <span className="absolute" />;',
  });
  const { names, problems } = partNames(dir);
  assert.deepEqual(problems, [
    'registry/ouro/components/ouro/chip/chip.tsx:2 <span> carries classes but no part name. Fix: data-slot="chip-<part>" (docs/guides/part-names.md).',
    'registry/ouro/components/ouro/chip/chip.tsx:3 <span>\'s data-slot is not a string literal. Fix: data-slot="chip-<part>".',
    'registry/ouro/components/ouro/chip/chip.tsx:4 <span data-slot="chip_label">: a part name is kebab case. Fix: data-slot="chip-<part>".',
    'registry/ouro/components/ouro/chip/chip.tsx:5 <span data-slot="label">: a part name starts with its stem. Fix: data-slot="chip-label".',
    'registry/ouro/components/ouro/chip/chip.tsx:11 <BaseTooltip.Popup> carries classes but no part name. Fix: data-slot="chip-<part>" (docs/guides/part-names.md).',
    'registry/ouro/components/ouro/chip/chip.tsx:12 <Base.Backdrop> carries classes but no part name. Fix: data-slot="chip-<part>" (docs/guides/part-names.md).',
    'registry/ouro/components/ouro/chip/chip.tsx:15 createElement carries classes but no part name. Fix: "data-slot": "chip" (docs/guides/part-names.md).',
    'registry/ouro/components/ouro/chip/chip.tsx:16 createElement\'s data-slot is not a string literal. Fix: "data-slot": "chip-<part>".',
    'registry/ouro/components/ouro/chip/chip.tsx:17 createElement({ "data-slot": "row" }): a part name starts with its stem. Fix: data-slot="chip-row".',
    'registry/ouro/components/ouro/chip/chip.tsx:19 <Heading> draws a part with no name of its own. Fix: data-slot="chip-<part>", such as "chip-title" (docs/guides/part-names.md).',
    "registry/ouro/components/ouro/chip/chip.tsx:21 <span>'s data-slot comes after a spread, so it overrides a parent's name for the part. Fix: write data-slot first.",
    "registry/ouro/components/ouro/chip/parts/stray.tsx belongs to no component its folder's component.json lists, so its parts have no stem. Fix: name the file <stem>.tsx or <stem>-<part>.tsx.",
    'registry/ouro/lib/ouro/hit-area.tsx:1 <span> carries classes but no part name. Fix: data-slot="hit-area-<part>" (docs/guides/part-names.md).',
  ]);
  // A file belongs to the longest stem that names it, a name may start with a data-ouro value its folder writes (Toaster's toast), and an element with no classes needs no name.
  assert.deepEqual(
    names.map((name) => `${name.stem}:${name.name}`),
    ["chip-group:chip-group-list", "chip-group:chip-list", "chip:chip", "chip:chip-icon", "chip:chip-hint", "chip:chip", "chip:chip-description", "chip:chip-late", "chip:pill", "chip:pill-label", "toaster:toast", "toaster:toast-title"],
  );
  assert.deepEqual([...namesByStem(dir)], [
    ["chip-group", ["chip-group-list", "chip-list"]],
    ["chip", ["chip", "chip-description", "chip-hint", "chip-icon", "chip-late", "pill", "pill-label"]],
    ["toaster", ["toast", "toast-title"]],
  ]);
});
