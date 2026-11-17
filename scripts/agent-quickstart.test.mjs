// The agent quickstart (docs/guides/agent-quickstart.md) gives an agent every file and command for a
// new Vite app. This installs what its add commands name, from registry.json, the way the shadcn CLI
// lays files out, writes the guide's own files beside them with create-vite's tsconfig.node.json and
// type-checks the app as `npm run build` does (`tsc -b`), so a file the guide gives can't drift from
// the components' types. It does so twice: with main's registry, and with the newest release's, which
// the @ouro namespace in the guide serves while Pages publishes the guide from main.
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (path) => readFileSync(join(root, path), "utf8");
const guide = read("docs/guides/agent-quickstart.md");
const git = (...args) => execFileSync("git", args, { cwd: root, encoding: "utf8", maxBuffer: 256 * 1024 * 1024 });
/** The newest release tag, which CI's script shards fetch and the @ouro namespace serves. */
const newestRelease = git("tag", "--list", "v*", "--sort=-v:refname").split("\n")[0];
/** Reads a file from the checkout, or from a release tag. */
const reader = (tag) => (path) => (tag ? git("show", `${tag}:${path}`) : read(path));

/** create-vite 9's react-ts tsconfig.node.json, which `tsc -b` builds vite.config.ts with. */
const nodeConfig = {
  compilerOptions: {
    tsBuildInfoFile: "./node_modules/.tmp/tsconfig.node.tsbuildinfo",
    target: "es2023",
    lib: ["ES2023"],
    types: ["node"],
    skipLibCheck: true,
    module: "nodenext",
    allowImportingTsExtensions: true,
    verbatimModuleSyntax: true,
    moduleDetection: "force",
    noEmit: true,
    noUnusedLocals: true,
    noUnusedParameters: true,
    erasableSyntaxOnly: true,
    noFallthroughCasesInSwitch: true,
  },
  include: ["vite.config.ts"],
};
const tsc = createRequire(import.meta.url).resolve("typescript/bin/tsc");

/** The guide's code blocks, each with the file it names on the line before it. */
const blocks = [...guide.matchAll(/(?:^|\n)([^\n]*)\n\n```(\w+)\n([\s\S]*?)```/g)].map(([, lead, language, body]) => ({
  file: lead.match(/`([^`]+\.(?:css|ts|tsx|json))`/)?.[1],
  language,
  body,
}));
const file = (name) => {
  const block = blocks.find((each) => each.file === name);
  assert.ok(block, `the guide gives ${name} whole`);
  return block.body;
};
const commands = blocks.filter((each) => each.language === "sh").flatMap((each) => each.body.split("\n"));
const added = commands.filter((line) => line.startsWith("npx shadcn@latest add ")).flatMap((line) => [...line.matchAll(/@ouro\/([a-z0-9-]+)/g)].map((match) => match[1]));

/** Every item `names` brings, through their registryDependencies. */
function closure(registry, names) {
  const byName = new Map(registry.items.map((item) => [item.name, item]));
  const seen = new Set();
  const visit = (name) => {
    if (seen.has(name)) return;
    const item = byName.get(name);
    assert.ok(item, `the guide adds @ouro/${name}, which is no registry item`);
    seen.add(name);
    for (const dependency of item.registryDependencies ?? []) visit(dependency.replace(/^ourostack\/ouro-ui\//, "").replace(/#.*$/, ""));
  };
  names.forEach(visit);
  return [...seen].map((name) => byName.get(name));
}

/** Where the CLI puts a registry file in an app with src/, and the import that reaches it. */
const installed = (target) => target.replace(/^@components\//, "src/components/").replace(/^@lib\//, "src/lib/");
const withoutExtension = (path) => path.replace(/\.(tsx?|css)$/, "");

/** Installs the guide's adds from `tag`'s registry (the checkout's without one) and builds its types as `npm run build` does. */
function typeCheck(tag) {
  const source = reader(tag);
  const registry = JSON.parse(source("registry.json"));
  assert.ok(added.includes("ouro-base"), "the guide adds ouro-base");
  const files = closure(registry, added).flatMap((item) => item.files ?? []).filter((entry) => entry.target);
  const app = join(root, ".tmp", `agent-quickstart-${tag ?? "main"}`);
  rmSync(app, { recursive: true, force: true });
  try {
    // Imports between registry files read @/registry/…; installed, they read the app's @/components and @/lib.
    const imports = new Map(files.map((entry) => [`@/${withoutExtension(entry.path)}`, `@/${withoutExtension(installed(entry.target)).replace(/^src\//, "")}`]));
    for (const entry of files) {
      const to = join(app, installed(entry.target));
      mkdirSync(dirname(to), { recursive: true });
      writeFileSync(to, source(entry.path).replace(/(["'])(@\/registry\/[^"']+)\1/g, (whole, quote, specifier) => (imports.has(specifier) ? `${quote}${imports.get(specifier)}${quote}` : whole)));
    }
    writeFileSync(join(app, "tsconfig.node.json"), JSON.stringify(nodeConfig, null, 2));
    for (const name of ["src/index.css", "src/main.tsx", "src/App.tsx", "vite.config.ts", "tsconfig.json", "tsconfig.app.json"]) {
      mkdirSync(dirname(join(app, name)), { recursive: true });
      writeFileSync(join(app, name), file(name));
    }
    // Each module the guide's files import is one the adds installed.
    for (const name of ["src/main.tsx", "src/App.tsx", "vite.config.ts"]) {
      for (const [, specifier] of file(name).matchAll(/from "((?:@|\.\/src)\/(?:components|lib)\/ouro\/[^"]+)"/g)) {
        const path = withoutExtension(specifier.replace(/^@\//, "src/").replace(/^\.\/src\//, "src/"));
        assert.ok(files.some((entry) => withoutExtension(installed(entry.target)) === path), `${name} imports ${specifier}, which no add in the guide installs`);
      }
    }
    const appConfig = JSON.parse(file("tsconfig.app.json"));
    assert.deepEqual(appConfig.compilerOptions.paths, { "@/*": ["./src/*"] });
    assert.deepEqual(JSON.parse(file("tsconfig.json")).compilerOptions.paths, { "@/*": ["./src/*"] });
    // When ouro-check's install message gives an exclude (releases that installed its Node code in
    // src), the guide's is the same. Once it installs under scripts/ouro, tsc -b never reads that
    // code, and the guide's exclude only keeps the newest such release type-checking.
    const check = registry.items.find((item) => item.name === "ouro-check");
    if (!tag && /"exclude":/.test(check.docs)) assert.match(check.docs, new RegExp(`"exclude": ${JSON.stringify(appConfig.exclude).replaceAll("[", "\\[").replaceAll("]", "\\]").replaceAll(",", ", ")}`));
    assert.match(file("vite.config.ts"), /from "\.\/src\/lib\/ouro\/color-scheme-script\.ts";/, "vite.config.ts imports the script with .ts, as tsconfig.node.json's nodenext needs");
    const result = spawnSync(process.execPath, [tsc, "-b", join(app, "tsconfig.json"), "--pretty", "false"], { cwd: app, encoding: "utf8" });
    assert.equal(result.status, 0, `the quickstart's app fails to type-check with ${tag ?? "main"}'s registry:\n${result.stdout}${result.stderr}`);
  } finally {
    rmSync(app, { recursive: true, force: true });
  }
}

test("the agent quickstart's app type-checks against the registry, with the files and commands it gives", () => {
  typeCheck(undefined);
  assert.ok(newestRelease, "no release tag: fetch the newest (git fetch origin 'refs/tags/v*:refs/tags/v*')");
  typeCheck(newestRelease);
});

test("the agent quickstart is short enough for an agent's first fetch, and llms.txt points to it first", () => {
  // An agent's fetch tool returns the start of a page, often 5,000 to 20,000 characters: the whole guide fits.
  assert.ok(guide.length <= 10_000, `the quickstart is ${guide.length} characters, past the 10,000 an agent reads in one fetch`);
  const llms = read("site/public/llms.txt");
  const pointer = llms.indexOf("https://ui.ouroboros.bot/docs/agent-quickstart.md");
  assert.ok(pointer > 0 && pointer < 2_000, "llms.txt links the agent quickstart in its first 2,000 characters");
});
