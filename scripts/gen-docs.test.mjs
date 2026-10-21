import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { cpSync, mkdirSync, readFileSync, readdirSync, symlinkSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { scratchDir } from "./scratch.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const script = join(root, "scripts/gen-docs.mts");
const run = (...args) => spawnSync("node", [script, ...args], { cwd: root, encoding: "utf8" });
const doc = (name) => readFileSync(join(root, "docs", name), "utf8");

test("the committed docs and README catalog are up to date", () => {
  const result = run("--check");
  assert.equal(result.status, 0, result.stderr);
});

test("--check fails when the docs are missing or stale", () => {
  const out = scratchDir("ouro-docs-");
  const missing = run("--check", "--out", out);
  assert.equal(missing.status, 1);
  assert.match(missing.stderr, /stale/);
  assert.equal(run("--out", out).status, 0);
  assert.equal(run("--check", "--out", out).status, 0);
  writeFileSync(join(out, "docs/Button.md"), "# Button\n");
  assert.equal(run("--check", "--out", out).status, 1);
});

test("--check fails on a doc for a component that no longer exists", () => {
  const out = scratchDir("ouro-docs-");
  assert.equal(run("--out", out).status, 0);
  writeFileSync(join(out, "docs/Gone.md"), "# Gone\n");
  const result = run("--check", "--out", out);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /Gone\.md/);
});

test("an export with no @group, or an unknown one, fails the generator with the fix", () => {
  // A copy of the repository's inputs, where Link's JSDoc loses its group.
  const copy = scratchDir("ouro-docs-root-");
  for (const path of ["registry", "scripts", "docs", "site/public", "README.md", "UPGRADING.md", "package.json", "tsconfig.json"]) {
    mkdirSync(dirname(join(copy, path)), { recursive: true });
    cpSync(join(root, path), join(copy, path), { recursive: true });
  }
  symlinkSync(join(root, "node_modules"), join(copy, "node_modules"));
  const link = join(copy, "registry/ouro/components/ouro/link/link.tsx");
  const source = readFileSync(link, "utf8");
  const generate = () => spawnSync("node", [join(copy, "scripts/gen-docs.mts"), "--check"], { cwd: copy, encoding: "utf8" });
  writeFileSync(link, source.replace(" * @group Text\n", ""));
  assert.match(generate().stderr, /Link is exported from registry\/ouro\/components\/ouro\/link\/link\.tsx but has no catalog group\. Add `@group/);
  writeFileSync(link, source.replace(" * @group Text\n", " * @group Typography\n"));
  assert.match(generate().stderr, /Link's @group Typography is not a catalog group/);
});

test("generating is deterministic and matches the committed files", () => {
  const out = scratchDir("ouro-docs-");
  assert.equal(run("--out", out).status, 0);
  const files = readdirSync(join(out, "docs")).filter((name) => name.endsWith(".md")).sort();
  // docs/guides is hand-written; everything else in docs/ is generated.
  const committed = readdirSync(join(root, "docs"), { withFileTypes: true });
  assert.deepEqual(committed.filter((entry) => entry.isDirectory()).map((entry) => entry.name), ["guides"]);
  assert.deepEqual(files, committed.filter((entry) => entry.isFile()).map((entry) => entry.name).sort());
  for (const file of files) {
    assert.equal(readFileSync(join(out, "docs", file), "utf8"), doc(file), file);
  }
  for (const file of ["README.md", "site/src/docs/catalog.json", "site/src/docs/pages.json"]) {
    assert.equal(readFileSync(join(out, file), "utf8"), readFileSync(join(root, file), "utf8"), file);
  }
});

test("each mode of a union gets its own heading, so a reader can tell the modes apart", () => {
  for (const file of readdirSync(join(root, "docs")).filter((name) => name.endsWith(".md"))) {
    const modes = doc(file).split("\n## ").find((section) => section.startsWith("Modes\n"));
    if (!modes) continue;
    const headings = [...modes.matchAll(/^### (.+)$/gm)].map(([, heading]) => heading);
    assert.equal(new Set(headings).size, headings.length, `${file} repeats a mode heading: ${headings.join(" | ")}`);
  }
  assert.match(doc("ToggleGroup.md"), /^### Single: `ToggleGroupSingleProps`$/m);
  assert.match(doc("ToggleGroup.md"), /^### Multiple: `ToggleGroupMultipleProps`$/m);
});

test("there is one doc per component, plus parts", () => {
  const files = readdirSync(join(root, "docs")).sort();
  for (const name of ["Button", "ConfirmDialog", "Dialog", "Field", "Fieldset", "Heading", "Link", "OuroProvider", "Sheet", "Text", "TextArea", "TextField", "parts"]) {
    assert.ok(files.includes(`${name}.md`), `docs/${name}.md is missing`);
  }
});

test("a component doc has purpose, import, example, props, and use-instead guidance", () => {
  const button = doc("Button.md");
  assert.match(button, /^# Button\n\nA button, or a link styled as one\./m);
  assert.match(button, /import \{ Button \} from "@\/registry\/ouro\/components\/ouro\/button\/button";/);
  assert.match(button, /## Example\n\n```tsx\n<Button onClick=\{save\} loading=\{saving\}>Save<\/Button>/);
  assert.match(button, /## Use instead when\n\n- Use `Text` with an `<a>` instead when a link sits inside running text\./);
  assert.match(button, /\| Prop \| Type \| Default \| Description \|/);
  assert.match(button, /\| `tone` \| `"primary" \\\| "secondary" \\\| "destructive" \\\| "success" \\\| "warning"` \| `"primary"` \|/);
  assert.match(button, /\| `children` \(required\) \| `ReactNode` \|/);
});

test("props are sorted by name", () => {
  const table = doc("Button.md").split("## Props")[1].split("\n## ")[0];
  const names = [...table.matchAll(/^\| `([^`]+)`/gm)].map((match) => match[1]);
  assert.ok(names.length > 5);
  assert.deepEqual(names, [...names].sort((a, b) => a.localeCompare(b, "en")));
});

test("discriminated unions become modes, each with its own props and exclusions", () => {
  const button = doc("Button.md");
  assert.match(button, /## Modes/);
  assert.match(button, /### Link: `ButtonLinkProps`\n\nA Button with `href`: renders a link that looks like a button\./);
  assert.match(button, /### Button: `ButtonButtonProps`/);
  assert.match(button, /- `disabled`: A link cannot be disabled\./);
  const sheet = doc("Sheet.md");
  assert.match(sheet, /### With trigger: `SheetWithTriggerProps`/);
  assert.match(sheet, /### Controlled: `SheetControlledProps`/);
  assert.match(sheet, /\| `trigger` \(required\) \| `ReactElement` \|/);
  assert.match(sheet, /- `open`: Not with `trigger`\./);
  const text = doc("Text.md");
  assert.match(text, /### With `lines`/);
  assert.match(text, /### With `truncate`/);
});

test("guard props are listed under Don't use, with their redirect", () => {
  const button = doc("Button.md");
  assert.match(button, /## Don't use\n/);
  assert.match(button, /- `isLoading`: Not a prop\. Ouro UI uses `loading`: `<Button loading>`\./);
  assert.doesNotMatch(button.split("## Props")[1].split("\n## ")[0], /isLoading/);
  assert.match(doc("Sheet.md"), /- `onClose`: Not a prop\./);
});

test("the className rule is spelled out where className is accepted", () => {
  const button = doc("Button.md");
  assert.match(button, /## `className` is for layout only/);
  assert.match(button, /`bg-`/);
  const text = doc("Text.md");
  assert.match(text, /use the `align` prop/);
});

test("referenced types are defined in the doc", () => {
  assert.match(doc("Sheet.md"), /### `SheetSnapPoint`[\s\S]*type SheetSnapPoint = number \| `\$\{number\}px` \| `\$\{number\}rem`;/);
});

test("the parts doc shows the required nesting and every part", () => {
  const parts = doc("parts.md");
  assert.match(parts, /import \{\n {2}DialogBackdrop,\n[\s\S]* {2}DialogViewport,\n\} from "@\/registry\/ouro\/components\/ouro\/dialog\/dialog-parts";/);
  assert.match(parts, /import \{\n {2}SheetBackdrop,\n[\s\S]* {2}SheetViewport,\n\} from "@\/registry\/ouro\/components\/ouro\/sheet\/sheet-parts";/);
  for (const internal of ["DialogPopupUnchecked", "SheetPopupUnchecked", "AlertDialogRoot", "SheetFrame"]) {
    assert.doesNotMatch(parts, new RegExp(internal), internal);
  }
  assert.match(parts, /## Sheet parts[\s\S]*### Required nesting\n\n```tsx\n<SheetRoot side="bottom">/);
  assert.match(parts, /## Dialog parts[\s\S]*<DialogRoot>/);
  assert.match(parts, /throws in development/);
  for (const part of ["SheetBackdrop", "SheetClose", "SheetContent", "DialogFooter", "DialogViewport"]) {
    assert.match(parts, new RegExp(`\\| \`${part}\` \\|`), part);
  }
  assert.match(doc("Sheet.md"), /\[parts\.md\]\(parts\.md#sheet-parts\)/);
});

test("the catalog is grouped by job in README", async () => {
  // Checks structure and membership, never which components sit next to each other, so
  // parallel component PRs that add to the same group do not conflict here.
  const { groupOrder, APP_SETUP } = await import("./catalog-groups.mts");
  const readme = readFileSync(join(root, "README.md"), "utf8");
  const catalog = readme.split("<!-- catalog:start -->")[1].split("<!-- catalog:end -->")[0];
  const sections = new Map(
    catalog.split(/^### /m).slice(1).map((chunk) => {
      const [heading, ...lines] = chunk.split("\n");
      return [heading.trim(), lines.filter((line) => line.startsWith("- **")).map((line) => line.slice(4, line.indexOf("**", 4)))];
    }),
  );
  const headings = [...sections.keys()];
  const groups = headings.filter((heading) => groupOrder.includes(heading));
  assert.deepEqual(groups, groupOrder.filter((group) => sections.has(group)), "component groups follow groupOrder");
  assert.ok(headings.indexOf(APP_SETUP) > headings.indexOf(groups.at(-1)), "App setup follows the component groups");
  for (const [heading, names] of sections) {
    assert.ok(names.length > 0, `${heading} lists at least one component`);
    assert.deepEqual(names, [...names].sort((a, b) => a.localeCompare(b, "en")), `${heading} is alphabetical`);
  }
  const member = (group, name) => assert.ok(sections.get(group)?.includes(name), `${name} is listed under ${group}`);
  member("Actions", "Button");
  member("Text", "Link");
  member("Forms", "TextField");
  member("Overlays", "Sheet");
  assert.match(catalog, /- \*\*Button\*\* — A button, or a link styled as one\./);
});

test("generated docs have no timestamps", () => {
  // Example dates in code (Calendar's `value="2026-10-11"`) are not timestamps; prose must have none.
  // Guides are authored separately; a comparison's cohort dates are provenance, not build timestamps.
  const prose = (text) => text.replace(/```[\s\S]*?```/g, "").replace(/`[^`\n]*`/g, "");
  for (const file of readdirSync(join(root, "docs")).filter((name) => name.endsWith(".md"))) {
    assert.doesNotMatch(prose(doc(file)), /\b20\d\d-\d\d-\d\d\b/, file);
  }
  assert.match(prose("Generated 2026-10-11."), /\b20\d\d-\d\d-\d\d\b/);
});

test("Sheet's usage names the import of every part it tells you to use", () => {
  assert.match(doc("Sheet.md"), /`import \{ SheetClose \} from "@\/components\/ouro\/sheet\/sheet-parts"`, with your components alias/);
});

test("a function whose @see is a component's page is documented on that page", () => {
  const catalog = JSON.parse(readFileSync(join(root, "site/src/docs/catalog.json"), "utf8"));
  const pages = Object.fromEntries(catalog.filter((item) => item.functions).map((item) => [item.name, item.functions]));
  assert.deepEqual(pages, { "color-scheme-toggle": ["colorSchemeScript", "useColorScheme"], "install-prompt": ["useInstallPrompt"], "share-button": ["canShare", "copyText", "share"], timer: ["buzz", "chime", "createChimeContext", "formatDuration", "useTimer"], toaster: ["toast"] });
  assert.match(doc("toast.md"), /^# toast$/m);
});
