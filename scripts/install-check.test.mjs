import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { checkComments, checkDirectives, checkInstall, checkLayerOverride, checkSources } from "./install-check.mjs";

// A real installed app is the install job's to build; these cases prove the check fails
// on each kind of broken install, using a stand-in with a passing app's key files.

const runtimeFiles = [
  "src/components/ouro/button/button.tsx",
  "src/components/ouro/text/heading.tsx",
  "src/components/ouro/sheet/sheet-parts.tsx",
  "src/components/ouro/dialog/confirm-dialog.tsx",
  "src/lib/ouro/cn.ts",
  "src/lib/ouro/env.d.ts",
];
const testFiles = [
  "src/components/ouro/button/button.test.tsx",
  "src/components/ouro/button/button.stories.tsx",
  "src/lib/ouro/testing/vitest.ts",
  "e2e/ouro/sheet.spec.ts",
  "e2e/ouro/story.ts",
];

const app = (variant, css, stage = "tests") => {
  const dir = mkdtempSync(join(tmpdir(), "ouro-install-check-"));
  const write = (file, text) => {
    mkdirSync(dirname(join(dir, file)), { recursive: true });
    writeFileSync(join(dir, file), text);
  };
  const files = stage === "tests" ? [...runtimeFiles, ...testFiles] : runtimeFiles;
  const devDependencies = stage === "tests" ? { vitest: "^5.0.3", storybook: "^10.6.1" } : { vite: "^8.3.2" };
  write("package.json", JSON.stringify({ dependencies: { react: "^19.3.0" }, devDependencies }));
  for (const file of files) write(file, 'import { cn } from "~/lib/ouro/cn";\n');
  const primary = variant === "ouro" ? "#2261eb" : "oklch(0.205 0 0)";
  const index = css ?? `:root {\n  --primary: ${primary};\n  --success: #157d3c;\n  --success-foreground: #fff;\n  --warning: #b05109;\n  --warning-foreground: #fff;\n  --destructive-foreground: #fff;\n  --ouro-spring-duration: 750ms;\n  --ouro-ease-spring: linear(0, 1);\n  --ouro-press-scale: 0.97;\n  --ouro-backdrop-color: #000;\n}\n@theme inline {\n  --color-success: var(--success);\n  --color-warning: var(--warning);\n  @keyframes ouro-spin { to { rotate: 1turn; } }\n  @keyframes ouro-pulse { 50% { opacity: 0.4; } }\n}\n@utility press { scale: 1; }\n`;
  write("src/index.css", index);
  write("dist/assets/index.css", "@keyframes ouro-spin{} :root{--ouro-spring-duration:750ms;--success:#157d3c}");
  return dir;
};

test("a complete install passes, for each variant and stage", () => {
  assert.deepEqual(checkInstall(app("ouro"), "ouro", "tests"), []);
  assert.deepEqual(checkInstall(app("shadcn"), "shadcn", "tests"), []);
  assert.deepEqual(checkInstall(app("shadcn", undefined, "runtime"), "shadcn", "runtime"), []);
});

test("a runtime install that brought tests, stories, specs, the test kit or test tooling fails", () => {
  const dir = app("shadcn", undefined, "runtime");
  writeFileSync(join(dir, "src/components/ouro/button/button.stories.tsx"), "");
  mkdirSync(join(dir, "e2e/ouro"), { recursive: true });
  writeFileSync(join(dir, "e2e/ouro/sheet.spec.ts"), "");
  mkdirSync(join(dir, "src/lib/ouro/testing"), { recursive: true });
  writeFileSync(join(dir, "src/lib/ouro/testing/act.ts"), "");
  writeFileSync(join(dir, "package.json"), JSON.stringify({ devDependencies: { "@playwright/test": "^1.63.0", "@storybook/react-vite": "^10.6.1", vitest: "^5.0.3" } }));
  const problems = checkInstall(dir, "shadcn", "runtime").join("\n");
  assert.match(problems, /runtime install added src\/components\/ouro\/button\/button\.stories\.tsx/);
  assert.match(problems, /runtime install added e2e\/ouro\/sheet\.spec\.ts/);
  assert.match(problems, /runtime install added src\/lib\/ouro\/testing\/act\.ts/);
  assert.match(problems, /runtime install added @playwright\/test, @storybook\/react-vite, vitest to package\.json/);
});

test("a token that refers to itself fails", () => {
  const dir = app("ouro");
  const css = readFileSync(join(dir, "src/index.css"), "utf8");
  writeFileSync(join(dir, "src/index.css"), css.replace("@theme inline {", "@theme inline {\n  --ouro-press-scale: var(--ouro-press-scale);\n  --color-ouro-backdrop-color:var( --ouro-backdrop-color );"));
  const problems = checkInstall(dir, "ouro", "tests").join("\n");
  assert.match(problems, /--ouro-press-scale: var\(--ouro-press-scale\) refers to itself/);
  assert.doesNotMatch(problems, /--color-ouro-backdrop-color.*refers to itself/);
});

test("the wrong theme fails", () => {
  assert.match(checkInstall(app("shadcn"), "ouro", "tests").join("\n"), /not the Ouro theme/);
  assert.match(checkInstall(app("ouro"), "shadcn", "tests").join("\n"), /shadcn theme was not kept/);
});

test("a missing token, rule or file, or an unrewritten import, fails", () => {
  const dir = app("ouro");
  const css = readFileSync(join(dir, "src/index.css"), "utf8");
  writeFileSync(join(dir, "src/index.css"), css.replace("--warning: #b05109;", "").replace("@keyframes ouro-pulse", ""));
  writeFileSync(join(dir, "src/lib/ouro/cn.ts"), 'import { x } from "@/registry/ouro/lib/ouro/x";\n');
  writeFileSync(join(dir, "dist/assets/index.css"), "");
  const problems = checkInstall(dir, "ouro", "tests").join("\n");
  assert.match(problems, /does not declare --warning\b/);
  assert.match(problems, /no @keyframes ouro-pulse/);
  assert.match(problems, /cn\.ts still imports @\/registry\//);
  assert.match(problems, /vite build wrote no CSS/);
  const missingTests = app("ouro", undefined, "runtime");
  assert.match(checkInstall(missingTests, "ouro", "tests").join("\n"), /missing e2e\/ouro\/story\.ts/);
});

test("an installed file that lost a comment of its source fails, and one that kept them passes", () => {
  const root = mkdtempSync(join(tmpdir(), "ouro-install-source-"));
  const dir = mkdtempSync(join(tmpdir(), "ouro-install-comments-"));
  const write = (base, file, text) => {
    mkdirSync(dirname(join(base, file)), { recursive: true });
    writeFileSync(join(base, file), text);
  };
  const source = '// Header.\nimport { cn } from "@/registry/ouro/lib/ouro/cn";\n\n/** Doc. */\nexport const a = cn;\n';
  write(root, "registry/ouro/lib/ouro/a.ts", source);
  write(root, "registry/ouro/e2e/ouro/b.spec.ts", "// Kept.\nexport {};\n");
  write(root, "registry/ouro/lib/ouro/not-installed.ts", "// Never installed.\nexport {};\n");
  write(dir, "src/lib/ouro/a.ts", 'import { cn } from "~/lib/ouro/cn";\n\n/** Doc. */\nexport const a = cn;\n');
  write(dir, "e2e/ouro/b.spec.ts", "// Kept.\nexport {};\n");
  assert.deepEqual(checkComments(dir, root), ["src/lib/ouro/a.ts lost comments from registry/ouro/lib/ouro/a.ts: // Header."]);
  write(dir, "src/lib/ouro/a.ts", source.replace("@/registry/ouro/lib/ouro/cn", "~/lib/ouro/cn"));
  assert.deepEqual(checkComments(dir, root), []);
});

test("an installed file must equal its source once import paths are mapped to the app's aliases", () => {
  const root = mkdtempSync(join(tmpdir(), "ouro-install-source-"));
  const dir = mkdtempSync(join(tmpdir(), "ouro-install-equal-"));
  const write = (base, file, text) => {
    mkdirSync(dirname(join(base, file)), { recursive: true });
    writeFileSync(join(base, file), text);
  };
  const aliases = { components: "~/components", lib: "~/lib" };
  write(root, "registry/ouro/components/ouro/a/a.tsx", 'import { cn } from "@/registry/ouro/lib/ouro/cn";\nimport { B } from "@/registry/ouro/components/ouro/b/b";\nexport const a = [cn, B];\n');
  write(dir, "src/components/ouro/a/a.tsx", 'import { cn } from "~/lib/ouro/cn";\nimport { B } from "~/components/ouro/b/b";\nexport const a = [cn, B];\n');
  assert.deepEqual(checkSources(dir, root, aliases), []);
  write(dir, "src/components/ouro/a/a.tsx", 'import { cn } from "~/lib/ouro/cn";\nimport { B } from "~/components/ouro/b/b";\nexport const a = [B, cn];\n');
  assert.deepEqual(checkSources(dir, root, aliases), [
    'src/components/ouro/a/a.tsx differs from registry/ouro/components/ouro/a/a.tsx at line 3: "export const a = [cn, B];" became "export const a = [B, cn];"',
  ]);
});

test("an --ouro-layer override passes only as the last declaration, in :root, outside @layer", () => {
  const base = ":root {\n  --primary: red;\n  --ouro-layer: 50;\n}\n";
  assert.deepEqual(checkLayerOverride(base + ":root {\n  --ouro-layer: 60;\n}\n", "60"), []);
  assert.deepEqual(checkLayerOverride(base, "60"), ["the last --ouro-layer is 50, not the app's 60"]);
  assert.deepEqual(checkLayerOverride(base + "@layer base {\n  :root { --ouro-layer: 60; }\n}\n", "60"), [
    "the override is inside @layer, where the unlayered default wins",
  ]);
  assert.deepEqual(checkLayerOverride(base + ".app { --ouro-layer: 60; }\n", "60"), ["the override is not in a :root rule"]);
  assert.deepEqual(checkLayerOverride(":root { --primary: red; }", "60"), ["no --ouro-layer declaration"]);
});

test("a Next.js app passes with the CSS file components.json names and the next build output", () => {
  const dir = app("shadcn", undefined, "runtime");
  const css = readFileSync(join(dir, "src/index.css"), "utf8");
  mkdirSync(join(dir, "src/app"), { recursive: true });
  writeFileSync(join(dir, "src/app/globals.css"), css);
  writeFileSync(join(dir, "src/index.css"), "");
  writeFileSync(join(dir, "components.json"), JSON.stringify({ tailwind: { css: "src/app/globals.css" } }));
  mkdirSync(join(dir, ".next/static/chunks"), { recursive: true });
  writeFileSync(join(dir, ".next/static/chunks/app.css"), readFileSync(join(dir, "dist/assets/index.css"), "utf8"));
  assert.deepEqual(checkInstall(dir, "next", "runtime"), []);
  writeFileSync(join(dir, ".next/static/chunks/app.css"), "");
  assert.match(checkInstall(dir, "next", "runtime").join("\n"), /next build wrote no CSS/);
  writeFileSync(join(dir, "src/app/globals.css"), "");
  assert.match(checkInstall(dir, "next", "runtime").join("\n"), /src\/app\/globals\.css does not declare --success/);
});

test("an installed file that lost its source's \"use client\" fails", () => {
  const root = join(dirname(fileURLToPath(import.meta.url)), "..");
  const dir = mkdtempSync(join(tmpdir(), "ouro-install-check-"));
  const write = (file, text) => {
    mkdirSync(dirname(join(dir, file)), { recursive: true });
    writeFileSync(join(dir, file), text);
  };
  const source = readFileSync(join(root, "registry/ouro/components/ouro/button/button.tsx"), "utf8");
  write("src/components/ouro/button/button.tsx", source);
  write("src/lib/ouro/cn.ts", readFileSync(join(root, "registry/ouro/lib/ouro/cn.ts"), "utf8"));
  assert.deepEqual(checkDirectives(dir, root), []);
  write("src/components/ouro/button/button.tsx", source.replace(/^"use client";\n\n/, ""));
  assert.deepEqual(checkDirectives(dir, root), [
    'src/components/ouro/button/button.tsx lost "use client" from registry/ouro/components/ouro/button/button.tsx',
  ]);
});

test("with the @/components alias, a JSDoc that quotes an installed path is not mistaken for an import", () => {
  const root = mkdtempSync(join(tmpdir(), "ouro-install-source-"));
  const dir = mkdtempSync(join(tmpdir(), "ouro-install-equal-"));
  const write = (base, file, text) => {
    mkdirSync(dirname(join(base, file)), { recursive: true });
    writeFileSync(join(base, file), text);
  };
  const doc = '/** Wrap it: `import { SheetClose } from "@/components/ouro/sheet/sheet-parts"`. */\n';
  write(root, "registry/ouro/components/ouro/a/a.tsx", `import { cn } from "@/registry/ouro/lib/ouro/cn";\n${doc}export const a = cn;\n`);
  write(dir, "src/components/ouro/a/a.tsx", `import { cn } from "@/lib/ouro/cn";\n${doc}export const a = cn;\n`);
  assert.deepEqual(checkSources(dir, root, { components: "@/components", lib: "@/lib" }), []);
});

test("only Ouro's tokens must not refer to themselves; an app's own theme may", () => {
  const dir = app("shadcn");
  const css = readFileSync(join(dir, "src/index.css"), "utf8");
  writeFileSync(join(dir, "src/index.css"), css.replace("@theme inline {", "@theme inline {\n  --font-sans: var(--font-sans);\n  --color-success: var(--color-success);"));
  assert.deepEqual(checkInstall(dir, "shadcn", "tests"), ["src/index.css: --color-success: var(--color-success) refers to itself"]);
});

test("the README's Next.js files are the ones the Next.js install job builds", () => {
  const root = join(dirname(fileURLToPath(import.meta.url)), "..");
  const readme = readFileSync(join(root, "README.md"), "utf8");
  for (const file of ["src/app/providers.tsx", "src/app/layout.tsx"]) {
    const text = readFileSync(join(root, "test/install-fixture-next", file), "utf8");
    assert.ok(readme.includes("```tsx\n" + text + "```"), `README.md does not show test/install-fixture-next/${file} verbatim`);
  }
  assert.match(readFileSync(join(root, "test/install-fixture-next/src/app/providers.tsx"), "utf8"), /^"use client";\n/);
  for (const file of ["src/app/layout.tsx", "src/app/page.tsx"]) {
    assert.doesNotMatch(readFileSync(join(root, "test/install-fixture-next", file), "utf8"), /"use client"/, `${file} must stay a Server Component`);
  }
});
