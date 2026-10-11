import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

// The workflows publish the registry and push to the repository, so what they run must not
// change under them: every action is pinned to a commit, and only the release job keeps the
// checkout's token.

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const dir = join(root, ".github/workflows");
const workflows = readdirSync(dir)
  .filter((file) => file.endsWith(".yml"))
  .map((file) => ({ file, text: readFileSync(join(dir, file), "utf8") }));

test("every action is pinned to a full commit SHA, with its version in a comment", () => {
  assert.ok(workflows.length >= 4);
  const unpinned = workflows.flatMap(({ file, text }) =>
    text
      .split("\n")
      .filter((line) => /^\s*(- )?uses: /.test(line) && !/uses: [\w.-]+\/[\w.-]+@[0-9a-f]{40} # v\d+\.\d+\.\d+$/.test(line))
      .map((line) => `${file}: ${line.trim()}`),
  );
  assert.deepEqual(unpinned, [], "Pin with owner/repo@<40-character SHA> # vX.Y.Z.");
});

test("only release.yml, which pushes, keeps the checkout's credentials", () => {
  const problems = [];
  for (const { file, text } of workflows) {
    const lines = text.split("\n");
    lines.forEach((line, index) => {
      if (!/uses: actions\/checkout@/.test(line)) return;
      const step = lines.slice(index + 1, index + 4).join("\n");
      const persists = !/^\s+persist-credentials: false$/m.test(step);
      if (persists !== (file === "release.yml")) problems.push(`${file}:${index + 1}`);
    });
  }
  assert.deepEqual(problems, [], "Set persist-credentials: false on every checkout that never pushes.");
});

test("Dependabot proposes new action pins weekly", () => {
  const config = readFileSync(join(root, ".github/dependabot.yml"), "utf8");
  assert.match(config, /package-ecosystem: github-actions\n\s+directory: \/\n\s+schedule:\n\s+interval: weekly/);
});
