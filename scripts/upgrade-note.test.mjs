import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { fillPlaceholder, latestRelease, PLACEHOLDER } from "./latest-release.mjs";
import { localCommand, noteBody, rawHint, steps } from "./upgrade-note.mjs";

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

test("the raw note says what {{latestRelease}} stands for, and each filled copy drops that line", () => {
  const hint = note.match(rawHint);
  assert.ok(hint && note.indexOf(hint[0]) === note.indexOf("\n\n") + 2, "UPGRADING.md needs the raw-file hint right under its title");
  assert.ok(hint[0].includes(`Replace each \`${PLACEHOLDER}\``) && hint[0].includes("newest release tag"));
  assert.ok(!noteBody(note).includes("Reading this file on GitHub"));
  assert.ok(!read("README.md").includes("Reading this file on GitHub"));
  assert.ok(read("site/src/release.ts").includes(rawHint.source), "site/src/release.ts must drop the hint with the same pattern");
});

test("the README section is the note, between its markers, with the newest release", () => {
  const section = read("README.md").match(/<!-- upgrade:start -->\n([\s\S]*)\n<!-- upgrade:end -->/);
  assert.ok(section, "README.md needs <!-- upgrade:start --> and <!-- upgrade:end -->");
  assert.equal(section[1], fillPlaceholder(noteBody(note), latestRelease()));
});

test("the site's Updating page renders the note itself", () => {
  const docs = read("site/src/pages/docs.tsx");
  assert.match(docs, /import \{ latestRelease, upgrading \} from "\.\.\/release";/);
  assert.match(read("site/src/release.ts"), /import upgradingNote from "\.\.\/\.\.\/UPGRADING\.md\?raw";/);
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
  assert.ok(!result.stdout.includes(PLACEHOLDER), `a ${PLACEHOLDER} placeholder is left`);
  assert.ok(!result.stdout.includes("Reading this file on GitHub"), "the raw-file hint is left");
  assert.match(result.stdout, /^### Upgrading from v0\.1\.0\n\nv0\.1\.0 installed/);
  for (const command of commands) assert.ok(result.stdout.includes(command.replaceAll(PLACEHOLDER, "v9.9.9")), command);
});

test("the upgrade install test runs the note's commands and copies none", () => {
  const script = read("scripts/install-test.sh");
  assert.match(script, /upgrade-note\.mjs" commands "\$1"/);
  for (const number of [1, 2, 3]) assert.match(script, new RegExp(`^  note_step ${number}$`, "m"));
  for (const command of commands) assert.ok(!script.includes(command), `install-test.sh copies ${command}`);
});

test("the commands find the app's folders through shadcn, never a hard-coded src/", () => {
  for (const command of commands) assert.doesNotMatch(command, /(^|[\s"'])\.?\/?src\//, command);
  for (const number of [1, 2, 3]) {
    const text = steps(note).find((step) => step.number === number).commands.join("\n");
    assert.match(text, /npx shadcn@latest info --json/, `step ${number}`);
  }
  assert.doesNotMatch(note, /assume[s]? .*`src\/`/, "the note still asks readers to swap src/");
});

test("the commands delete only paths Ouro owns and uninstall nothing", () => {
  for (const command of commands) {
    assert.doesNotMatch(command, /\b(npm|pnpm|yarn|bun) (uninstall|remove)\b/, command);
    assert.doesNotMatch(command, /\brm\b/, command);
    if (!command.includes("-delete")) continue;
    assert.match(command, /c="\$\(p components\)\/ouro"/, command);
    assert.match(command, /l="\$\(p lib\)\/ouro"/, command);
    for (const call of command.matchAll(/\bfind ((?:(?!\\\(|-delete).)*)/g)) {
      for (const path of call[1].trim().split(/\s+/)) assert.match(path, /^("\$c"|"\$l"|"\$l\/testing"|e2e\/ouro)$/, command);
    }
  }
});

test("localCommand points the note's addresses at a local registry and pins the CLI", () => {
  const options = { shadcn: "npx --yes shadcn@4.21.1", address: "/tmp/r/{name}.json" };
  assert.equal(
    localCommand("x; npx shadcn@latest add ourostack/ouro-ui/dialog#{{latestRelease}} ourostack/ouro-ui/ouro-lib-tests#{{latestRelease}} --overwrite", options),
    "x; npx --yes shadcn@4.21.1 add --yes /tmp/r/dialog.json /tmp/r/ouro-lib-tests.json --overwrite",
  );
  assert.equal(localCommand("npx shadcn@latest info --json | node", options), "npx --yes shadcn@4.21.1 info --json | node");
  assert.equal(
    localCommand("sed -E 's|.*|ourostack/ouro-ui/&#{{latestRelease}} ourostack/ouro-ui/&-tests#{{latestRelease}}|'", options),
    "sed -E 's|.*|/tmp/r/&.json /tmp/r/&-tests.json|'",
  );
  for (const command of commands) assert.doesNotMatch(localCommand(command, options), /ourostack\/ouro-ui|shadcn@latest/, command);
});

// The commands, run for real in a scratch app whose `npx` is a stand-in: `info --json`
// reports the app's resolved folders (an app/ layout here), and `add` is only recorded.
function scratchApp(componentFiles) {
  const app = mkdtempSync(join(tmpdir(), "ouro-upgrade-"));
  const bin = join(app, ".bin");
  mkdirSync(bin);
  const resolved = { components: join(app, "app/components"), lib: join(app, "app/lib"), tailwindCss: join(app, "app/styles/tailwind.css") };
  writeFileSync(join(app, "info.json"), JSON.stringify({ config: { resolvedPaths: resolved } }));
  writeFileSync(
    join(bin, "npx"),
    `#!/bin/sh\ncase "$*" in\n  *" info --json") cat "${join(app, "info.json")}" ;;\n  *" add "*) echo "$*" >>"${join(app, "added.log")}" ;;\n  *) exit 9 ;;\nesac\n`,
  );
  chmodSync(join(bin, "npx"), 0o755);
  for (const file of componentFiles) {
    mkdirSync(dirname(join(app, file)), { recursive: true });
    writeFileSync(join(app, file), "export {};\n");
  }
  const run = (number, shell = "bash") => {
    const step = steps(note).find((item) => item.number === number);
    return spawnSync(shell, ["-c", step.commands.join("\n")], {
      cwd: app,
      encoding: "utf8",
      env: { ...process.env, PATH: `${bin}:${process.env.PATH}` },
    });
  };
  const added = () => (existsSync(join(app, "added.log")) ? readFileSync(join(app, "added.log"), "utf8") : "");
  return { app, run, added };
}

const shells = ["bash", ...(spawnSync("zsh", ["-c", "true"]).status === 0 ? ["zsh"] : [])];

for (const shell of shells) {
  test(`step 1 adds every component file's item and its tests (${shell})`, () => {
    const { run, added } = scratchApp([
      "app/components/ouro/dialog/dialog.tsx",
      "app/components/ouro/dialog/dialog-parts.tsx",
      "app/components/ouro/dialog/confirm-dialog.tsx",
      "app/components/ouro/dialog/dialog.test.tsx",
      "app/components/ouro/dialog/dialog.stories.tsx",
      "app/components/ouro/button/button.tsx",
      "app/components/ui/button.tsx",
    ]);
    const result = run(1, shell);
    assert.equal(result.status, 0, result.stderr);
    const args = added().trim().split(/\s+/);
    const items = args.filter((arg) => arg.startsWith("ourostack/")).sort();
    assert.deepEqual(
      items,
      ["button", "button-tests", "confirm-dialog", "confirm-dialog-tests", "dialog", "dialog-tests", "ouro-lib-tests"].map((name) => `ourostack/ouro-ui/${name}#{{latestRelease}}`),
    );
    assert.ok(args.includes("--overwrite"));
    // One line in both shells: zsh does not split an unquoted $items.
    assert.match(result.stdout, /^Updating: button confirm-dialog dialog\n/m);
  });

  test(`step 1 stops before calling shadcn add when it finds no Ouro component (${shell})`, () => {
    const { run, added } = scratchApp(["src/components/ouro/dialog/dialog.tsx"]);
    const result = run(1, shell);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /No Ouro components? in .*app\/components\/ouro/);
    assert.equal(added(), "");
  });
}

test("step 3 deletes Ouro's test files and kit, and nothing of the app's", () => {
  const ouroTests = [
    "app/components/ouro/dialog/dialog.test.tsx",
    "app/components/ouro/dialog/dialog.touch.test.tsx",
    "app/components/ouro/dialog/dialog.test-d.ts",
    "app/components/ouro/dialog/dialog.stories.tsx",
    "app/lib/ouro/cn.test.ts",
    "app/lib/ouro/testing/vitest.ts",
    "e2e/ouro/dialog.spec.ts",
  ];
  const kept = [
    "app/components/ouro/dialog/dialog.tsx",
    "app/lib/ouro/cn.ts",
    "app/own/own.test.ts",
    "app/components/ui/button.stories.tsx",
    "e2e/app.spec.ts",
    "vitest.config.ts",
    "playwright.config.ts",
    ".storybook/main.ts",
  ];
  const { app, run } = scratchApp([...ouroTests, ...kept]);
  const result = run(3);
  assert.equal(result.status, 0, result.stderr);
  for (const file of ouroTests) assert.ok(!existsSync(join(app, file)), `${file} is left`);
  assert.ok(!existsSync(join(app, "app/lib/ouro/testing")));
  for (const file of kept) assert.ok(existsSync(join(app, file)), `${file} was deleted`);
});

test("step 3 stops when it finds no Ouro folders", () => {
  const { app, run } = scratchApp(["src/components/ouro/dialog/dialog.test.tsx"]);
  const result = run(3);
  assert.notEqual(result.status, 0);
  assert.ok(existsSync(join(app, "src/components/ouro/dialog/dialog.test.tsx")));
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
    steps(note)
      .find((step) => step.number === 3)
      .commands.map((command) => localCommand(command, { shadcn: "npx shadcn", address: "r/{name}.json" })),
  );
});

test("the note says what changed by version, for an app that reads only this note", () => {
  const section = note.match(/^#### What changed, by version\n([\s\S]*?)\n#### 0\./m);
  assert.ok(section, "UPGRADING.md needs #### What changed, by version before step 0");
  for (const needle of ["**v0.2.0:**", "**v0.3.0:**", "--ouro-layer", "z-index 1 to 49", "touch or pen tap", "@preserve", "\"use client\""]) {
    assert.ok(section[1].includes(needle), `What changed lacks ${needle}`);
  }
});

test("step 0 warns that add rewrites the Tailwind CSS file and package.json, and step 1 explains shadcn's Skipped message", () => {
  const step0 = note.slice(note.indexOf("#### 0."), note.indexOf("#### 1."));
  assert.match(step0, /@custom-variant dark \(&:is\(\.dark \*\)\);/);
  assert.match(step0, /Keep only the new `--ouro-\*` lines and step 2's deletions/);
  const step1 = note.slice(note.indexOf("#### 1."), note.indexOf("#### 2."));
  assert.match(step1, /Skipped N files: \(files might be identical, use --overwrite to overwrite\)/);
  assert.match(step1, /restore every test-tool version you had pinned \(`git diff package\.json`\): Vitest and its companions, Playwright and Storybook/);
});

test("no doc suggests re-pinning a test tool to a ^ range", () => {
  for (const path of ["README.md", "UPGRADING.md", "site/public/llms.txt"]) {
    assert.doesNotMatch(read(path), /(add -D|install -D) [^`]*@\^/, `${path} re-pins to a range`);
  }
  assert.match(read("README.md"), /after `add`, restore every test-tool version you had pinned \(`git diff package\.json`\)/);
});
