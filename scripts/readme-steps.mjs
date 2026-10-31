// The steps the README prints for a Next.js app, read from the README itself, so the install
// test (scripts/install-test.sh next) runs what a reader runs and the README cannot drift
// from what works: the quick start's `add` commands, the Next.js section's `add` command for
// OuroProvider, and its two files.
//
//   node scripts/readme-steps.mjs                 prints the steps as JSON
//   node scripts/readme-steps.mjs write <app-dir> writes the two files under <app-dir>/src
//   node scripts/readme-steps.mjs write-router <app-dir> <alias>
//                                                 writes the React Router adapter from
//                                                 docs/OuroProvider.md under <app-dir>/src,
//                                                 with "@/" replaced by the app's alias
//   node scripts/readme-steps.mjs same <git-ref>  exits 0 when README.md at <git-ref> has the same
//                                                 steps (CI's plan: a pull request that changes
//                                                 them runs the install test itself)
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

const section = (readme, heading) => {
  const start = readme.indexOf(`\n### ${heading}\n`);
  if (start < 0) throw new Error(`README.md has no "### ${heading}" section`);
  const end = readme.indexOf("\n### ", start + 1);
  return readme.slice(start, end < 0 ? undefined : end);
};
const blocks = (text, language) => [...text.matchAll(new RegExp("```" + language + "\\n([\\s\\S]*?)```", "g"))].map((match) => match[1]);

/** The item names of each `npx shadcn@latest add` line in `text`'s sh blocks, in order. */
function adds(text) {
  return blocks(text, "sh")
    .flatMap((block) => block.split("\n"))
    .filter((line) => /^npx shadcn@latest add /.test(line))
    .map((line) => [...line.matchAll(/ourostack\/ouro-ui\/([\w-]+)#v\d+\.\d+\.\d+/g)].map((match) => match[1]));
}

/**
 * What the README tells a Next.js app to do: `adds`, the items of each add command in order
 * (the quick start's, then the Next.js section's), and `files`, the two files of the Next.js
 * section by their path under `src/`.
 */
export function readmeSteps(readme) {
  const next = section(readme, "Next.js");
  const files = blocks(next, "tsx");
  if (files.length !== 2) throw new Error(`README.md's Next.js section has ${files.length} tsx blocks; expected app/providers.tsx and app/layout.tsx`);
  for (const path of ["app/providers.tsx", "app/layout.tsx"]) {
    if (!next.includes(`\`${path}\``)) throw new Error(`README.md's Next.js section does not name ${path}`);
  }
  return { adds: [...adds(section(readme, "Quick start")), ...adds(next)], files: { "app/providers.tsx": files[0], "app/layout.tsx": files[1] } };
}

/**
 * The React Router adapter in docs/OuroProvider.md's example, as `{ path under app/: source }`:
 * the files between "// React Router." and "// Next.js", split at each "// app/<path>:" line.
 */
export function routerAdapterFiles(markdown) {
  const example = blocks(markdown.slice(markdown.indexOf("\n## Example\n")), "tsx")[0] ?? "";
  const start = example.indexOf("// React Router.");
  const end = example.indexOf("// Next.js");
  if (start < 0 || end < start) throw new Error("docs/OuroProvider.md's example has no React Router part before the Next.js one");
  const files = {};
  const parts = example.slice(start, end).split(/^(?:\/\/ React Router\. |\/\/ )app\/([\w/.-]+):\n/m);
  for (let index = 1; index < parts.length; index += 2) files[parts[index]] = `${parts[index + 1].trim()}\n`;
  if (Object.keys(files).length !== 2) throw new Error(`docs/OuroProvider.md's React Router part has ${Object.keys(files).length} files; expected the adapter and root.tsx`);
  return files;
}

/**
 * Whether two READMEs tell a Next.js app the same steps (`readmeSteps`): the same items in each add
 * command, whatever release tag they pin, and the same two files. A README whose steps cannot be
 * read differs.
 */
export function sameSteps(before, after) {
  try {
    return JSON.stringify(readmeSteps(before)) === JSON.stringify(readmeSteps(after));
  } catch {
    return false;
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const [mode, app, alias = "@/"] = process.argv.slice(2);
  if (mode === "same") {
    const before = execFileSync("git", ["show", `${app}:README.md`], { cwd: root, encoding: "utf8" });
    process.exit(sameSteps(before, readFileSync(join(root, "README.md"), "utf8")) ? 0 : 1);
  }
  const steps = readmeSteps(readFileSync(join(root, "README.md"), "utf8"));
  if (mode === "write-router") {
    for (const [path, content] of Object.entries(routerAdapterFiles(readFileSync(join(root, "docs/OuroProvider.md"), "utf8")))) {
      mkdirSync(dirname(join(app, "src", path)), { recursive: true });
      writeFileSync(join(app, "src", path), content.replaceAll('"@/', `"${alias}`));
    }
  } else if (mode === "write") {
    for (const [path, content] of Object.entries(steps.files)) {
      mkdirSync(dirname(join(app, "src", path)), { recursive: true });
      writeFileSync(join(app, "src", path), content);
    }
  } else {
    console.log(JSON.stringify(steps.adds));
  }
}
