import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { localCommand, noteBody, steps } from "./upgrade-note.mjs";

// UPGRADING.md is the one source of "Upgrading from v0.1.0". The README section, the
// site's Updating page and the release notes are made from it, and the upgrade install
// test runs its commands, so no copy can drift from what CI runs.

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (path) => readFileSync(join(root, path), "utf8");
const note = read("UPGRADING.md");
const commands = steps(note).flatMap((step) => step.commands);

test("the note has steps 0 to 4, and steps 1 to 3 have commands", () => {
  assert.deepEqual(
    steps(note).map((step) => step.number),
    [0, 1, 2, 3, 4],
  );
  for (const number of [1, 2, 3]) {
    assert.ok(steps(note).find((step) => step.number === number).commands.length > 0, `step ${number}`);
  }
});

test("the README section is the note, between its markers", () => {
  const section = read("README.md").match(/<!-- upgrade:start -->\n([\s\S]*)\n<!-- upgrade:end -->/);
  assert.ok(section, "README.md needs <!-- upgrade:start --> and <!-- upgrade:end -->");
  assert.equal(section[1], noteBody(note));
});

test("the site's Updating page renders the note itself", () => {
  const docs = read("site/src/pages/docs.tsx");
  assert.match(docs, /import upgrading from "\.\.\/\.\.\/\.\.\/UPGRADING\.md\?raw";/);
  for (const command of commands) assert.ok(!docs.includes(command), `docs.tsx copies ${command}`);
});

test("the release notes are rendered from the note, with the release tag", () => {
  const release = read(".github/workflows/release.yml");
  const line = release.split("\n").find((text) => /^\s*sed .*UPGRADING\.md$/.test(text));
  assert.ok(line, "release.yml does not read UPGRADING.md");
  for (const command of commands) assert.ok(!release.includes(command), `release.yml copies ${command}`);
  const script = line.trim();
  const result = spawnSync("bash", ["-c", script], { cwd: root, encoding: "utf8", env: { ...process.env, TAG: "v9.9.9" } });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /^### Upgrading from v0\.1\.0\n/);
  assert.ok(!result.stdout.includes("#v0.2.0"), "a #v0.2.0 address is left");
  for (const command of commands) assert.ok(result.stdout.includes(command.replaceAll("#v0.2.0", "#v9.9.9")), command);
});

test("the upgrade install test runs the note's commands and copies none", () => {
  const script = read("scripts/install-test.sh");
  assert.match(script, /upgrade-note\.mjs" commands "\$1"/);
  for (const number of [1, 2, 3]) assert.match(script, new RegExp(`^  note_step ${number}$`, "m"));
  for (const command of commands) assert.ok(!script.includes(command), `install-test.sh copies ${command}`);
});

test("the commands delete only paths Ouro owns and uninstall nothing", () => {
  for (const command of commands) {
    assert.doesNotMatch(command, /\b(npm|pnpm|yarn|bun) (uninstall|remove)\b/, command);
    assert.doesNotMatch(command, /\brm\b/, command);
    if (!command.includes("-delete")) continue;
    const paths = command.replace(/^find /, "").split(/ \\\(| -delete/)[0].trim().split(/\s+/);
    for (const path of paths) assert.match(path, /^(src\/components\/ouro|src\/lib\/ouro|src\/lib\/ouro\/testing|e2e\/ouro)$/, command);
  }
});

test("localCommand points the note's addresses at a local registry and pins the CLI", () => {
  const options = { shadcn: "npx --yes shadcn@4.21.1", address: "/tmp/r/{name}.json" };
  assert.equal(
    localCommand("npx shadcn@latest add ourostack/ouro-ui/dialog#v0.2.0 ourostack/ouro-ui/ouro-lib-tests#v0.2.0 --overwrite", options),
    "npx --yes shadcn@4.21.1 add --yes /tmp/r/dialog.json /tmp/r/ouro-lib-tests.json --overwrite",
  );
  assert.equal(
    localCommand("sed -E 's|.*/(.*)\\.tsx$|ourostack/ouro-ui/\\1#v0.2.0 ourostack/ouro-ui/\\1-tests#v0.2.0|'", options),
    "sed -E 's|.*/(.*)\\.tsx$|/tmp/r/\\1.json /tmp/r/\\1-tests.json|'",
  );
  for (const command of commands) assert.doesNotMatch(localCommand(command, options), /ourostack\/ouro-ui|shadcn@latest/, command);
});

test("the CLI prints one step's commands for the install test", () => {
  const result = spawnSync(
    "node",
    [join(root, "scripts/upgrade-note.mjs"), "commands", "3", "--shadcn", "npx shadcn", "--address", "r/{name}.json"],
    { cwd: root, encoding: "utf8" },
  );
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(
    result.stdout.trim().split("\n"),
    steps(note).find((step) => step.number === 3).commands,
  );
});
