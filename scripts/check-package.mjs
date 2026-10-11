// Verifies what `npm pack` would publish: required files (including every generated
// docs page) are present, the client entry chunks start with "use client";, and the
// root types open with the component catalog. Run after `pnpm build` and `pnpm run docs`.
import { execFileSync } from "node:child_process";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

export const requiredFiles = [
  "dist/index.js",
  "dist/index.d.ts",
  "dist/parts.js",
  "dist/theme/index.js",
  "dist/styles.css",
  "src/index.ts",
  "README.md",
  "LICENSE",
  // Agents read these from node_modules (spec section 4.9).
  "docs/Button.md",
  "docs/Sheet.md",
  "docs/parts.md",
];
export const clientEntries = ["dist/index.js", "dist/parts.js"];

function packedFiles(cwd) {
  const out = execFileSync("npm", ["pack", "--dry-run", "--json", "--ignore-scripts"], {
    cwd,
    encoding: "utf8",
  });
  return JSON.parse(out)[0].files.map((file) => file.path);
}

/** Returns a list of problems (empty when the package is fine). */
export function checkPackage(cwd = root, overrides = {}) {
  const files = overrides.files ?? packedFiles(cwd);
  const read = overrides.read ?? ((path) => readFileSync(join(cwd, path), "utf8"));
  const problems = [];
  const docs = overrides.docs ?? readdirSync(join(cwd, "docs")).filter((file) => file.endsWith(".md"));
  for (const path of new Set([...requiredFiles, ...docs.map((file) => `docs/${file}`)])) {
    if (!files.includes(path)) problems.push(`${path} is missing from the package`);
  }
  for (const path of files) {
    // Stories import story-only code (stories/reference) that is not packed.
    if (/\.stories\./.test(path)) problems.push(`${path} is a story and must not be packed`);
    if (path.includes("__screenshots__")) problems.push(`${path} is a screenshot baseline and must not be packed`);
  }
  for (const path of clientEntries) {
    let source;
    try {
      source = read(path);
    } catch {
      problems.push(`${path} cannot be read (run pnpm build first)`);
      continue;
    }
    if (!source.startsWith('"use client";')) problems.push(`${path} must start with "use client";`);
  }
  let types = "";
  try {
    types = read("dist/index.d.ts");
  } catch {
    // Reported above as missing.
  }
  if (!/^\/\*\*\n \* Ouro UI[\s\S]*? \* - \*\*\w+\*\* — [\s\S]*?\*\//.test(types)) {
    problems.push("dist/index.d.ts must open with the component catalog (see tsdown.config.ts)");
  }
  return problems;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const problems = checkPackage();
  if (problems.length > 0) {
    console.error(problems.map((problem) => `- ${problem}`).join("\n"));
    process.exit(1);
  }
  console.log("Package contents OK.");
}
