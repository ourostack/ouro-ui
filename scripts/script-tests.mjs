// The script tests: every .test.mjs file under scripts/ and site/scripts/. pnpm test:scripts
// (scripts/run-script-tests.mjs) runs them, and CI's script shards split them (scripts/shard.mjs), so
// a new test file needs no edit to package.json and two pull requests that add one do not conflict.
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { treeFiles } from "./tree.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

/** The folders, from the repository root, whose .test.mjs files are script tests. */
const folders = ["scripts", "site/scripts"];

/**
 * Whether a test file is run by another runner: scripts/kits/ runs inside scripts/kits.test.mjs,
 * under Node's coverage, so running each file here too would run it twice.
 */
const runByAnother = (file) => file.startsWith("scripts/kits/");

/**
 * The script test files under `rootDir`, as paths from the repository root, sorted. treeFiles
 * skips a folder .gitignore ignores, so a test's scratch folder is never one of them.
 */
export function scriptTestFiles(rootDir = root) {
  return folders
    .filter((dir) => existsSync(join(rootDir, dir)))
    .flatMap((dir) => treeFiles(join(rootDir, dir)).map((file) => `${dir}/${file}`))
    .filter((file) => file.endsWith(".test.mjs") && !runByAnother(file))
    .sort();
}
