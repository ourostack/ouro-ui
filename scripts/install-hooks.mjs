// Installs this repository's git hooks (scripts/git-hooks/) into the checkout's hooks folder, the
// one every worktree of the clone shares. package.json's prepare runs it on `pnpm i`. A hook of
// the same name that this script did not write is left alone, and named. CI installs nothing.
//
//   node scripts/install-hooks.mjs
import { spawnSync } from "node:child_process";
import { chmodSync, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, join } from "node:path";
import { fileURLToPath } from "node:url";

const MARK = "ouro-ui pre-push hook";
const source = join(dirname(fileURLToPath(import.meta.url)), "git-hooks");

/** Installs the hooks into `cwd`'s checkout; returns what it did for each hook. */
export function installHooks(cwd, env = process.env) {
  if (env.CI) return [];
  const result = spawnSync("git", ["rev-parse", "--git-path", "hooks"], { cwd, encoding: "utf8" });
  if (result.status !== 0) return [];
  const raw = result.stdout.trim();
  const hooks = isAbsolute(raw) ? raw : join(cwd, raw);
  mkdirSync(hooks, { recursive: true });
  return readdirSync(source).map((name) => {
    const text = readFileSync(join(source, name), "utf8");
    const target = join(hooks, name);
    if (existsSync(target) && !readFileSync(target, "utf8").includes(MARK)) return { name, done: "kept" };
    writeFileSync(target, text);
    chmodSync(target, 0o755);
    return { name, done: "installed" };
  });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  for (const { name, done } of installHooks(process.cwd())) {
    if (done === "kept") process.stderr.write(`.git/hooks/${name} is not this repository's, so it was left as it is; scripts/git-hooks/${name} holds this repository's.\n`);
  }
}
