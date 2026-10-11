// Checks an app after scripts/install-test.sh installed every Ouro UI item and built it:
// the files landed where spec §3 says, every registry import was rewritten, the base
// tokens reached the app's CSS and its build, and the theme is the one the variant wants.
//
//   node scripts/install-check.mjs <app-dir> <shadcn|ouro>
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

/** Problems with an installed app, as readable lines; empty when it passes. */
export function checkInstall(app, variant) {
  const problems = [];
  const read = (path) => readFileSync(join(app, path), "utf8");
  const files = (dir) =>
    existsSync(join(app, dir))
      ? readdirSync(join(app, dir), { recursive: true }).map((file) => join(dir, String(file)))
      : [];

  for (const path of [
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
  ]) {
    if (!existsSync(join(app, path))) problems.push(`missing ${path}`);
  }
  if (existsSync(join(app, "src/components/ui/sheet.tsx"))) problems.push("an Ouro item landed in components/ui");

  for (const path of [...files("src"), ...files("e2e")].filter((file) => /\.(ts|tsx)$/.test(file))) {
    if (read(path).includes("@/registry/")) problems.push(`${path} still imports @/registry/`);
  }

  const css = read("src/index.css");
  const declares = (name) => new RegExp(`${name}\\s*:`).test(css);
  for (const name of [
    "--success",
    "--success-foreground",
    "--warning",
    "--warning-foreground",
    "--destructive-foreground",
    "--ouro-spring-duration",
    "--ouro-ease-spring",
    "--ouro-press-scale",
    "--ouro-backdrop-color",
    "--color-success",
    "--color-warning",
  ]) {
    if (!declares(name)) problems.push(`src/index.css does not declare ${name}`);
  }
  for (const rule of ["@utility press", "@keyframes ouro-spin", "@keyframes ouro-pulse"]) {
    if (!css.includes(rule)) problems.push(`src/index.css has no ${rule}`);
  }
  const primary = css.match(/:root\s*\{[^}]*?--primary:\s*([^;]+);/)?.[1]?.trim();
  if (variant === "ouro" && primary !== "#2261eb") problems.push(`--primary is ${primary}, not the Ouro theme's #2261eb`);
  if (variant === "shadcn" && (!primary || primary === "#2261eb")) problems.push(`--primary is ${primary}; the app's shadcn theme was not kept`);

  const built = files("dist/assets")
    .filter((file) => file.endsWith(".css"))
    .map(read)
    .join("\n");
  if (!built) problems.push("vite build wrote no CSS");
  for (const needle of ["@keyframes ouro-spin", "--ouro-spring-duration", "--success"]) {
    if (built && !built.includes(needle)) problems.push(`the built CSS has no ${needle}`);
  }
  return problems;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [app, variant] = process.argv.slice(2);
  const problems = checkInstall(app, variant);
  for (const problem of problems) console.error(`install check: ${problem}`);
  if (problems.length === 0) console.log(`install check: ${variant} app passes`);
  process.exitCode = problems.length === 0 ? 0 : 1;
}
