// Verifies what `npm pack` would publish: required files are present and the
// client entry chunks start with "use client";. Run after `pnpm build`.
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
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
  for (const path of requiredFiles) {
    if (!files.includes(path)) problems.push(`${path} is missing from the package`);
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
