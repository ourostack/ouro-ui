// The claims lint that claims.yml runs on a pull request, run before a push instead, so a title,
// body or change fragment it would fail never costs a CI run. The pre-push hook
// (scripts/git-hooks/pre-push, which scripts/install-hooks.mjs installs on `pnpm i`) runs it.
// It reads the open pull request of the branch being pushed with `gh`, when gh can, and lints its
// title and body with the change fragments the branch adds; without one it lints the fragments
// alone. CI skips it, and `git push --no-verify` skips it once.
//
//   node scripts/pre-push.mjs
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

/** The open pull request's title and body for `branch`, or an empty text when gh can't say. */
export function pullRequestText(branch, run = spawnSync) {
  if (!branch) return { title: "", body: "" };
  const result = run("gh", ["pr", "view", branch, "--repo", "ourostack/ouro-ui", "--json", "title,body,state"], { cwd: root, encoding: "utf8" });
  if (result.status !== 0 || !result.stdout) return { title: "", body: "" };
  try {
    const pr = JSON.parse(result.stdout);
    return pr.state === "OPEN" ? { title: pr.title ?? "", body: pr.body ?? "" } : { title: "", body: "" };
  } catch {
    return { title: "", body: "" };
  }
}

export function main(env = process.env) {
  if (env.CI) return 0;
  const branch = spawnSync("git", ["symbolic-ref", "--quiet", "--short", "HEAD"], { cwd: root, encoding: "utf8" }).stdout?.trim() ?? "";
  const { title, body } = pullRequestText(branch);
  const dir = mkdtempSync(join(tmpdir(), "ouro-pre-push-"));
  try {
    const file = join(dir, "body.md");
    writeFileSync(file, body);
    const lint = spawnSync(process.execPath, [join(root, "scripts/claims.mjs"), "lint", "--pr", "--title", title, "--body-file", file], { cwd: root, stdio: "inherit" });
    if (lint.status === 0) return 0;
    process.stderr.write("The claims lint would fail this branch's pull request in CI. Fix the title or body (gh pr edit) or the change fragment, then push again; git push --no-verify skips this check once.\n");
    return lint.status ?? 1;
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

if (import.meta.url === `file://${process.argv[1]}`) process.exit(main());
