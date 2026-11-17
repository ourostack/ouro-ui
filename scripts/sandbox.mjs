// The environment the script tests give a child process that runs workflow steps or the scripts they call.
// The child cannot reach GitHub with this login or token: the tokens are removed, gh reads its login from
// an empty folder, and a `gh` that refuses to run comes before the system's PATH, so a test that misses a
// stub fails with exit 97 instead of calling GitHub.
import { chmodSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { scratchDir } from "./scratch.mjs";

/** The exit status of the refusing gh. */
export const GH_REFUSED = 97;
const TOKENS = ["GH_TOKEN", "GITHUB_TOKEN", "GH_ENTERPRISE_TOKEN"];

let guard;

/** The folder holding the refusing gh and an empty gh config, made once for the test file and removed after it. */
function guardDirs() {
  if (!guard) {
    const root = scratchDir("ouro-no-github-");
    const bin = join(root, "bin");
    const config = join(root, "gh-config");
    mkdirSync(bin);
    mkdirSync(config);
    writeFileSync(join(bin, "gh"), `#!/bin/sh\necho "a test reached the real gh: $*" >&2\nexit ${GH_REFUSED}\n`);
    chmodSync(join(bin, "gh"), 0o755);
    guard = { bin, config };
  }
  return guard;
}

/**
 * The environment for a child process: this process's, with `extra` on top, the GitHub tokens removed
 * even when `extra` sets them, gh's config in an empty folder, and the PATH of `bins` (the test's own stub
 * folders) first, then the refusing gh, then the system's PATH. A test that stubs gh puts its stub in `bins`.
 */
export function sandboxEnv(extra = {}, bins = []) {
  const { bin, config } = guardDirs();
  const env = { ...process.env, ...extra };
  for (const name of TOKENS) delete env[name];
  env.GH_CONFIG_DIR = config;
  env.PATH = [...bins, bin, process.env.PATH].join(":");
  return env;
}
