import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { cpSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const script = join(root, "scripts/gen-docs.mts");
const run = (...args) => spawnSync("node", [script, ...args], { cwd: root, encoding: "utf8" });
const doc = (name) => readFileSync(join(root, "docs", name), "utf8");

test("the committed docs and README catalog are up to date", () => {
  const result = run("--check");
  assert.equal(result.status, 0, result.stderr);
});

test("--check fails when the docs are missing or stale", () => {
  const out = mkdtempSync(join(tmpdir(), "ouro-docs-"));
  const missing = run("--check", "--out", out);
  assert.equal(missing.status, 1);
  assert.match(missing.stderr, /stale/);
  assert.equal(run("--out", out).status, 0);
  assert.equal(run("--check", "--out", out).status, 0);
  writeFileSync(join(out, "docs/Button.md"), "# Button\n");
  assert.equal(run("--check", "--out", out).status, 1);
});

test("--check fails on a doc for a component that no longer exists", () => {
  const out = mkdtempSync(join(tmpdir(), "ouro-docs-"));
  assert.equal(run("--out", out).status, 0);
  writeFileSync(join(out, "docs/Gone.md"), "# Gone\n");
  const result = run("--check", "--out", out);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /Gone\.md/);
});

test("an export with no @group, or an unknown one, fails the generator with the fix", () => {
  // A copy of the repository's inputs, where Link's JSDoc loses its group.
  const copy = mkdtempSync(join(tmpdir(), "ouro-docs-root-"));
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
  const out = mkdtempSync(join(tmpdir(), "ouro-docs-"));
  assert.equal(run("--out", out).status, 0);
  const files = readdirSync(join(out, "docs")).sort();
  assert.deepEqual(files, readdirSync(join(root, "docs")).sort());
  for (const file of files) {
    assert.equal(readFileSync(join(out, "docs", file), "utf8"), doc(file), file);
  }
  for (const file of ["README.md", "site/src/docs/catalog.json"]) {
    assert.equal(readFileSync(join(out, file), "utf8"), readFileSync(join(root, file), "utf8"), file);
  }
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

test("the catalog is grouped by job in README", () => {
  const readme = readFileSync(join(root, "README.md"), "utf8");
  const catalog = readme.split("<!-- catalog:start -->")[1].split("<!-- catalog:end -->")[0];
  assert.match(catalog, /### Actions\n\n- \*\*Button\*\* — A button, or a link styled as one\./);
  assert.match(catalog, /### Overlays\n\n- \*\*ConfirmDialog\*\* — [^\n]+\n- \*\*Dialog\*\* — [^\n]+\n- \*\*Sheet\*\* — A panel that slides in/);
  assert.match(catalog, /### Text\n\n- \*\*Heading\*\* — [^\n]+\n- \*\*Kbd\*\* — [^\n]+\n- \*\*Link\*\* — [^\n]+\n- \*\*Text\*\* — /);
  assert.match(catalog, /### Forms\n\n- \*\*Field\*\* — [^\n]+\n- \*\*Fieldset\*\* — [^\n]+\n- \*\*TextArea\*\* — [^\n]+\n- \*\*TextField\*\* — /);
});

test("no timestamps", () => {
  for (const file of readdirSync(join(root, "docs"))) {
    assert.doesNotMatch(doc(file), /\b20\d\d-\d\d-\d\d\b/, file);
  }
});

test("Sheet's usage names the import of every part it tells you to use", () => {
  assert.match(doc("Sheet.md"), /`import \{ SheetClose \} from "@\/components\/ouro\/sheet\/sheet-parts"`, with your components alias/);
});

test("a function whose @see is a component's page is documented on that page", () => {
  const catalog = JSON.parse(readFileSync(join(root, "site/src/docs/catalog.json"), "utf8"));
  const pages = Object.fromEntries(catalog.filter((item) => item.functions).map((item) => [item.name, item.functions]));
  assert.deepEqual(pages, { toaster: ["toast"] });
  assert.match(doc("toast.md"), /^# toast$/m);
});
