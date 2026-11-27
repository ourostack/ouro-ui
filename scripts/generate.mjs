// Writes the generated files main does not commit (scripts/generated-files.mjs): the control and
// motion matrices, the site's catalog.json, sources.json, pages.json and page-index.json,
// registry.json, site/public/llms.txt, the model reviews and interviews pages and Ouro Feel's built probe. package.json's postinstall runs it, so every checkout and
// every CI job has them after `pnpm i`. A file git tracks, as a release commit's, is left as
// committed.
//
//   node scripts/generate.mjs
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { isTracked } from "./generated-files.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const steps = [
  // The model pages come first: gen-docs lists the site's pages from the docs folder, these two among them.
  ...[
    ["scripts/model-reviews/page.mjs", "docs/guides/model-reviews.md"],
    ["scripts/model-reviews/interviews-page.mjs", "docs/guides/model-interviews.md"],
    ["scripts/a11y-evidence/page.mjs", "docs/guides/accessibility-evidence.md"],
  ].filter(([, page]) => !isTracked(root, page)),
  ["scripts/control-matrix.mts", "--uncommitted"],
  // gen-docs runs registry.mts --uncommitted after it, for registry.json and llms.txt.
  ["scripts/gen-docs.mts", "--uncommitted"],
];
for (const [script, ...args] of steps) {
  const result = spawnSync(process.execPath, [join(root, script), ...args], { cwd: root, stdio: "inherit" });
  if (result.status !== 0) {
    process.stderr.write(`${script} failed, so the generated files are missing or stale: fix it, then run node scripts/generate.mjs.\n`);
    process.exit(result.status ?? 1);
  }
}
