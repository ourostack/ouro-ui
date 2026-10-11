import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { checkInstall } from "./install-check.mjs";

// A real installed app is the install job's to build; these cases prove the check fails
// on each kind of broken install, using a stand-in with a passing app's key files.

const app = (variant, css) => {
  const dir = mkdtempSync(join(tmpdir(), "ouro-install-check-"));
  const write = (file, text) => {
    mkdirSync(dirname(join(dir, file)), { recursive: true });
    writeFileSync(join(dir, file), text);
  };
  const files = [
    "src/components/ouro/button/button.tsx",
    "src/components/ouro/button/button.test.tsx",
    "src/components/ouro/button/button.stories.tsx",
    "src/components/ouro/text/heading.tsx",
    "src/components/ouro/sheet/sheet-parts.tsx",
    "src/components/ouro/dialog/confirm-dialog.tsx",
    "src/lib/ouro/cn.ts",
    "src/lib/ouro/env.d.ts",
    "src/lib/ouro/testing/vitest.ts",
    "e2e/ouro/sheet.spec.ts",
    "e2e/ouro/story.ts",
  ];
  for (const file of files) write(file, 'import { cn } from "~/lib/ouro/cn";\n');
  const primary = variant === "ouro" ? "#2261eb" : "oklch(0.205 0 0)";
  const index = css ?? `:root {\n  --primary: ${primary};\n  --success: #157d3c;\n  --success-foreground: #fff;\n  --warning: #b05109;\n  --warning-foreground: #fff;\n  --destructive-foreground: #fff;\n  --ouro-spring-duration: 750ms;\n  --ouro-ease-spring: linear(0, 1);\n  --ouro-press-scale: 0.97;\n  --ouro-backdrop-color: #000;\n}\n@theme inline {\n  --color-success: var(--success);\n  --color-warning: var(--warning);\n  @keyframes ouro-spin { to { rotate: 1turn; } }\n  @keyframes ouro-pulse { 50% { opacity: 0.4; } }\n}\n@utility press { scale: 1; }\n`;
  write("src/index.css", index);
  write("dist/assets/index.css", "@keyframes ouro-spin{} :root{--ouro-spring-duration:750ms;--success:#157d3c}");
  return dir;
};

test("a complete install passes, for each variant", () => {
  assert.deepEqual(checkInstall(app("ouro"), "ouro"), []);
  assert.deepEqual(checkInstall(app("shadcn"), "shadcn"), []);
});

test("the wrong theme fails", () => {
  assert.match(checkInstall(app("shadcn"), "ouro").join("\n"), /not the Ouro theme/);
  assert.match(checkInstall(app("ouro"), "shadcn").join("\n"), /shadcn theme was not kept/);
});

test("a missing token, rule or file, or an unrewritten import, fails", () => {
  const dir = app("ouro");
  const css = readFileSync(join(dir, "src/index.css"), "utf8");
  writeFileSync(join(dir, "src/index.css"), css.replace("--warning: #b05109;", "").replace("@keyframes ouro-pulse", ""));
  writeFileSync(join(dir, "src/lib/ouro/cn.ts"), 'import { x } from "@/registry/ouro/lib/ouro/x";\n');
  writeFileSync(join(dir, "dist/assets/index.css"), "");
  const problems = checkInstall(dir, "ouro").join("\n");
  assert.match(problems, /does not declare --warning\b/);
  assert.match(problems, /no @keyframes ouro-pulse/);
  assert.match(problems, /cn\.ts still imports @\/registry\//);
  assert.match(problems, /vite build wrote no CSS/);
});
