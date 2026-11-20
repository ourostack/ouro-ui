import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

// Ouro AX (registry/ouro/ax/) runs in Node, not in a browser, so its tests (*.test.mts, node:test) run under
// node --test with Node's own coverage, held to 100% like the components. The fixtures are the X-ray's test inputs.

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const dir = "registry/ouro/ax";

test("the Ouro AX tests pass and cover every line, branch and function of Ouro AX", () => {
  const files = readdirSync(join(root, dir))
    .filter((name) => name.endsWith(".test.mts"))
    .map((name) => `${dir}/${name}`);
  assert.ok(files.length >= 12, files.join(", "));
  const result = spawnSync(
    process.execPath,
    [
      "--test",
      // One report format on every Node version (Node 24 defaults to spec even when piped).
      "--test-reporter=tap",
      "--experimental-test-coverage",
      `--test-coverage-include=${dir}/*.ts`,
      "--test-coverage-lines=100",
      "--test-coverage-branches=100",
      "--test-coverage-functions=100",
      ...files,
    ],
    // NODE_TEST_CONTEXT would make the child report to this runner instead of printing its report.
    { cwd: root, encoding: "utf8", env: Object.fromEntries(Object.entries(process.env).filter(([name]) => name !== "NODE_TEST_CONTEXT")) },
  );
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.match(result.stdout, /^# all files\s+\|\s+100\.00 \|\s+100\.00 \|\s+100\.00 \|/m, result.stdout);
});

test("the precise-copy list keeps the source rules kit's phrases", async () => {
  const kit = await import("../registry/ouro/source-rules/source-rules.mjs");
  const copy = await import("../registry/ouro/ax/precise-copy.ts");
  const shown = (list) => list.map(([name, pattern]) => `${name} ${String(pattern)}`);
  assert.deepEqual(shown(copy.VAGUE_FAILURE_PHRASES), shown(kit.VAGUE_FAILURE_PHRASES));
  assert.equal(String(copy.BARE_FAILURE), String(kit.BARE_FAILURE));
  assert.equal(String(copy.CAUSE_MARKER), String(kit.CAUSE_MARKER));
  assert.equal(String(copy.LEAD_FAILURE), String(kit.LEAD_FAILURE));
  assert.equal(String(copy.VAGUE_CAUSE), String(kit.VAGUE_CAUSE));
  assert.deepEqual([...copy.NOT_A_CAUSE], kit.NOT_A_CAUSE);
  assert.deepEqual([...copy.NOT_BARE_LEADS], kit.NOT_BARE_LEADS);
  // The two agree on every case, precise or vague.
  const samples = ["Couldn't send: you're offline. Try again when you're back online.", "Couldn't send: try again.", "Something went wrong. Error code: E42", "Error: error", "Error: the photo service says this picture was deleted", "Unable to save - try again", "No errors", "Retry failed", "Upload failed"];
  for (const text of samples) assert.equal(copy.vagueFailureIn(text), kit.vagueFailurePhrase(text) ?? null, text);
  for (const rest of [" send: you're offline.", " send: try again.", " send because the server refused it", " send: it broke.", " send: it failed because the disk is full."]) assert.equal(copy.statesCause(rest), kit.statesCause(rest), rest);
});

test("the guide shows the tasks tool as it is, and the answers it gives", () => {
  const guide = readFileSync(join(root, "docs/guides/ax.md"), "utf8");
  const tool = readFileSync(join(root, dir, "fixtures/tasks.mts"), "utf8");
  assert.ok(guide.includes(`\`\`\`ts\n${tool}\`\`\``), "docs/guides/ax.md shows registry/ouro/ax/fixtures/tasks.mts, with the app's import paths");
  const shown = guide.split("```text\n")[1].split("```")[0];
  const answers = shown.split(/^\$ tasks /m).filter(Boolean).map((block) => {
    const [line, ...out] = block.split("\n");
    const argv = [...line.matchAll(/"([^"]*)"|(\S+)/g)].map((m) => m[1] ?? m[2]);
    return { argv, out: out.join("\n") };
  });
  assert.equal(answers.length, 4);
  for (const { argv, out } of answers) {
    const r = spawnSync(process.execPath, [join(root, dir, "fixtures/tasks.mts"), ...argv], { encoding: "utf8" });
    assert.equal(r.stdout + r.stderr, out, argv.join(" "));
  }
});

test("the guide shows the calling components' declarations as they are", () => {
  const guide = readFileSync(join(root, "docs/guides/ax.md"), "utf8");
  const declarations = readFileSync(join(root, dir, "fixtures/call-components.mts"), "utf8");
  assert.ok(guide.includes(`\`\`\`ts\n${declarations}\`\`\``), "docs/guides/ax.md shows registry/ouro/ax/fixtures/call-components.mts, with the app's import paths");
});
