// Checks an app after scripts/install-test.sh installed Ouro UI items and built it: the
// files landed where spec §3 says, every registry import was rewritten, the base tokens
// reached the app's CSS and its build, no token refers to itself, and the theme is the
// one the variant wants.
//
//   node scripts/install-check.mjs <app-dir> <shadcn|ouro|next> <runtime|tests>
//
// runtime: only the component items were added, so the app must have no Ouro test,
//          story, spec or test kit, and no test tooling in package.json.
// tests:   the -tests items were added too, so their files must be there.
// next:    a Next.js App Router app: the CSS file is the one components.json names
//          (src/app/globals.css), the build is `next build` (.next/static), and the app
//          keeps the theme `shadcn init` wrote.
//
// Every installed Ouro file must also equal its source once import paths are mapped to the
// app's aliases, and keep every comment: the shadcn CLI drops comments before a file's first
// statement, so a header or a first export's JSDoc would vanish (scripts/source-rules.mjs).
// A file whose source starts with "use client" must keep it, or a Next.js Server Component
// that renders it fails to build.
//
//   node scripts/install-check.mjs --layer-override <css-file>
//
// Checks that an app's own `:root { --ouro-layer: … }` rule, after the Ouro tokens and
// outside any @layer, is still the declaration that wins after a later `shadcn add`.
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import postcss from "postcss";
import { comments, hasClientDirective } from "./source-rules.mjs";

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
const testFile = /\.(test|touch\.test)\.tsx?$|\.test-d\.ts$|\.stories\.tsx$|\.spec\.ts$/;
const testTooling = /^(storybook|@storybook\/.*|vitest|@vitest\/.*|playwright|@playwright\/.*)$/;

/** Problems with an installed app, as readable lines; empty when it passes. */
export function checkInstall(app, variant, stage) {
  const problems = [];
  const read = (path) => readFileSync(join(app, path), "utf8");
  const files = (dir) =>
    existsSync(join(app, dir))
      ? readdirSync(join(app, dir), { recursive: true }).map((file) => join(dir, String(file)))
      : [];

  for (const path of stage === "tests" ? [...runtimeFiles, ...testFiles] : runtimeFiles) {
    if (!existsSync(join(app, path))) problems.push(`missing ${path}`);
  }
  if (stage === "runtime") {
    const ouroFiles = [...files("src/components/ouro"), ...files("src/lib/ouro"), ...files("e2e/ouro")];
    for (const path of ouroFiles.filter((file) => testFile.test(file) || file.startsWith("src/lib/ouro/testing/") || file.startsWith("e2e/"))) {
      if (/\.\w+$/.test(path)) problems.push(`the runtime install added ${path}`);
    }
    const pkg = JSON.parse(read("package.json"));
    const tooling = Object.keys({ ...pkg.dependencies, ...pkg.devDependencies }).filter((name) => testTooling.test(name)).sort();
    if (tooling.length > 0) problems.push(`the runtime install added ${tooling.join(", ")} to package.json`);
  }
  if (existsSync(join(app, "src/components/ui/sheet.tsx"))) problems.push("an Ouro item landed in components/ui");

  for (const path of [...files("src"), ...files("e2e")].filter((file) => /\.(ts|tsx)$/.test(file))) {
    if (read(path).includes("@/registry/")) problems.push(`${path} still imports @/registry/`);
  }

  const cssPath = existsSync(join(app, "components.json")) ? JSON.parse(read("components.json")).tailwind.css : "src/index.css";
  const css = read(cssPath);
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
    if (!declares(name)) problems.push(`${cssPath} does not declare ${name}`);
  }
  // `--x: var(--x)` is a cycle: it only works while another declaration of --x wins the cascade.
  for (const match of css.matchAll(/(--[\w-]+)\s*:\s*var\(\s*(--[\w-]+)\s*\)/g)) {
    if (match[1] === match[2]) problems.push(`${cssPath}: ${match[1]}: var(${match[2]}) refers to itself`);
  }
  for (const rule of ["@utility press", "@keyframes ouro-spin", "@keyframes ouro-pulse"]) {
    if (!css.includes(rule)) problems.push(`${cssPath} has no ${rule}`);
  }
  const primary = css.match(/:root\s*\{[^}]*?--primary:\s*([^;]+);/)?.[1]?.trim();
  if (variant === "ouro" && primary !== "#2261eb") problems.push(`--primary is ${primary}, not the Ouro theme's #2261eb`);
  if ((variant === "shadcn" || variant === "next") && (!primary || primary === "#2261eb")) problems.push(`--primary is ${primary}; the app's shadcn theme was not kept`);

  const builder = variant === "next" ? { dir: ".next/static", name: "next build" } : { dir: "dist/assets", name: "vite build" };
  const built = files(builder.dir)
    .filter((file) => file.endsWith(".css"))
    .map(read)
    .join("\n");
  if (!built) problems.push(`${builder.name} wrote no CSS`);
  for (const needle of ["@keyframes ouro-spin", "--ouro-spring-duration", "--success"]) {
    if (built && !built.includes(needle)) problems.push(`the built CSS has no ${needle}`);
  }
  return problems;
}

/** Where the CLI installs a registry file in an app with src/ aliases, or undefined for a non-file. */
function installedPath(path) {
  const match = /^registry\/ouro\/(components\/ouro|lib\/ouro|e2e\/ouro)\/(.+\.tsx?)$/.exec(path);
  if (!match) return undefined;
  return match[1] === "e2e/ouro" ? `e2e/ouro/${match[2]}` : `src/${match[1]}/${match[2]}`;
}

/**
 * Installed files whose comments differ from their source's, as readable lines; empty when
 * every installed Ouro file kept them all. Files the app does not have are skipped.
 */
export function checkComments(app, root) {
  const problems = [];
  const sources = readdirSync(join(root, "registry/ouro"), { recursive: true }).map((file) => `registry/ouro/${String(file)}`);
  for (const path of sources) {
    const target = installedPath(path);
    if (!target || !existsSync(join(app, target))) continue;
    const want = comments(path, readFileSync(join(root, path), "utf8"));
    const have = comments(target, readFileSync(join(app, target), "utf8"));
    const lost = want.filter((comment, index) => have[index] !== comment);
    if (lost.length > 0) problems.push(`${target} lost comments from ${path}: ${lost[0].split("\n")[0]}`);
  }
  return problems;
}

/**
 * Installed files whose source starts with "use client" but which lost it, as readable lines.
 * Files the app does not have are skipped.
 */
export function checkDirectives(app, root) {
  const problems = [];
  const sources = readdirSync(join(root, "registry/ouro"), { recursive: true }).map((file) => `registry/ouro/${String(file)}`);
  for (const path of sources) {
    const target = installedPath(path);
    if (!target || !existsSync(join(app, target))) continue;
    if (hasClientDirective(path, readFileSync(join(root, path), "utf8")) && !hasClientDirective(target, readFileSync(join(app, target), "utf8"))) {
      problems.push(`${target} lost "use client" from ${path}`);
    }
  }
  return problems;
}

/**
 * Installed files that differ from their source other than in import paths, as readable lines.
 * `aliases` are components.json's (`{ components: "~/components", lib: "~/lib" }`).
 */
export function checkSources(app, root, aliases) {
  const problems = [];
  const toSource = (text) =>
    text
      .replaceAll(`"${aliases.components}/ouro/`, '"@/registry/ouro/components/ouro/')
      .replaceAll(`"${aliases.lib}/ouro/`, '"@/registry/ouro/lib/ouro/');
  const sources = readdirSync(join(root, "registry/ouro"), { recursive: true }).map((file) => `registry/ouro/${String(file)}`);
  for (const path of sources) {
    const target = installedPath(path);
    if (!target || !existsSync(join(app, target))) continue;
    const want = readFileSync(join(root, path), "utf8");
    const have = toSource(readFileSync(join(app, target), "utf8"));
    if (have === want) continue;
    const wantLines = want.split("\n");
    const haveLines = have.split("\n");
    const line = wantLines.findIndex((text, index) => haveLines[index] !== text);
    problems.push(`${target} differs from ${path} at line ${line + 1}: ${JSON.stringify(wantLines[line])} became ${JSON.stringify(haveLines[line])}`);
  }
  return problems;
}

/**
 * Problems with an app's `--ouro-layer` override: the last declaration must be the app's
 * value, in a plain `:root` rule outside any `@layer`, so it wins over ouro-base's 50.
 */
export function checkLayerOverride(css, value) {
  const declarations = [];
  postcss.parse(css).walkDecls("--ouro-layer", (decl) => declarations.push(decl));
  const last = declarations.at(-1);
  if (!last) return ["no --ouro-layer declaration"];
  const problems = [];
  if (last.value !== value) problems.push(`the last --ouro-layer is ${last.value}, not the app's ${value}`);
  if (last.parent?.type !== "rule" || last.parent.selector !== ":root") problems.push("the override is not in a :root rule");
  for (let node = last.parent; node; node = node.parent) {
    if (node.type === "atrule" && node.name === "layer") problems.push("the override is inside @layer, where the unlayered default wins");
  }
  return problems;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url) && process.argv[2] === "--layer-override") {
  const problems = checkLayerOverride(readFileSync(process.argv[3], "utf8"), process.argv[4] ?? "60");
  for (const problem of problems) console.error(`install check: ${problem}`);
  if (problems.length === 0) console.log("install check: the app's --ouro-layer override survived");
  process.exitCode = problems.length === 0 ? 0 : 1;
} else if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [app, variant, stage] = process.argv.slice(2);
  if (stage !== "runtime" && stage !== "tests") {
    console.error("usage: install-check.mjs <app-dir> <shadcn|ouro|next> <runtime|tests>");
    process.exitCode = 2;
  } else {
    const root = join(dirname(fileURLToPath(import.meta.url)), "..");
    const { aliases } = JSON.parse(readFileSync(join(app, "components.json"), "utf8"));
    const problems = [
      ...checkInstall(app, variant, stage),
      ...checkComments(app, root),
      ...checkDirectives(app, root),
      ...checkSources(app, root, aliases),
    ];
    for (const problem of problems) console.error(`install check: ${problem}`);
    if (problems.length === 0) console.log(`install check: ${variant} app passes (${stage})`);
    process.exitCode = problems.length === 0 ? 0 : 1;
  }
}
