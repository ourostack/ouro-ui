import { test } from "node:test";
import assert from "node:assert/strict";
import { devCommandIn, devCommandsIn, MESSAGE_KEYS, sourceCheckoutTexts } from "./dev-commands.ts";

const command = (text: string) => devCommandIn(text, true)?.match ?? null;
const prose = (text: string) => devCommandIn(text)?.match ?? null;

test("finds developer commands and repository paths in a command and in prose", () => {
  // The refusal that started it: a script of the tool's source checkout, sent to every install.
  assert.deepEqual(devCommandIn("Writes are off. Run npm run writes -- on, then try again."), { match: "npm run writes -- on", kind: "command" });
  assert.equal(command("npm run writes -- on"), "npm run writes -- on");
  assert.equal(command("$ CI=1 npm test"), "$ CI=1 npm test");
  assert.equal(command('"pnpm" docs'), '"pnpm" docs');
  assert.equal(command("pnpm writes on"), "pnpm writes on");
  assert.equal(command("yarn"), "yarn");
  assert.equal(command("npm exec tsx src/cli.ts"), "npm exec tsx src/cli.ts");
  assert.equal(command("npx vitest"), "npx vitest");
  assert.equal(command("bunx ./bin/dev.ts"), "bunx ./bin/dev.ts");
  assert.equal(command("node --import tsx scripts/build.mjs"), "node --import tsx scripts/build.mjs");
  assert.equal(command("python3 tools/sync.py"), "python3 tools/sync.py");
  assert.equal(command("./scripts/dev.sh --fast"), "./scripts/dev.sh --fast");
  assert.equal(command("make test"), "make test");
  assert.equal(command("cargo build --release"), "cargo build --release");
  assert.equal(command("go run ./cmd/app"), "go run ./cmd/app");
  assert.equal(command("git config core.hooksPath hooks"), "git config core.hooksPath hooks");
  assert.equal(command("notes sync; git pull"), "git pull");
  // In prose, a code span is read as a command, and the unmistakable forms count outside one.
  assert.equal(prose("Run `make lint` first."), "make lint");
  assert.equal(prose("Then run pnpm install, and try again."), "pnpm install");
  assert.equal(prose("Fetch it with git pull."), "git pull");
  assert.equal(prose("Start it with node dist/main.js."), "node dist/main.js");
  assert.deepEqual(devCommandIn("The switch is in src/cli/writes.ts."), { match: "src/cli/writes.ts", kind: "path" });
  assert.equal(prose("Edit package.json and retry."), "package.json");
  assert.equal(prose("See .github/workflows/ci.yml"), ".github/workflows/ci.yml");
  // A path inside a command is that command's finding, not a second one.
  assert.deepEqual(
    devCommandsIn("Run node scripts/a.mjs and read scripts/b.md.").map((f) => f.match),
    ["node scripts/a.mjs", "scripts/b.md"],
  );
  assert.deepEqual(devCommandsIn("`node scripts/a.mjs`, then scripts/a.mjs").map((f) => f.match), ["node scripts/a.mjs"]);
  assert.deepEqual(devCommandsIn("scripts/a.mjs runs `node scripts/a.mjs --all`").map((f) => f.match), ["node scripts/a.mjs --all"]);
});

test("leaves alone what an installed tool runs, prose, global installs and web addresses", () => {
  for (const text of ["notes sync", "notes doctor --json", "", "/usr/local/bin/notes sync", "~/bin/notes", "npm install -g @scope/notes", "pnpm add --global notes", "npm view notes", "pnpm dlx notes init", "npx @scope/notes init", "pnpm --version", "node --version", "deno", "go version", "make sure the file exists", "notes sync;"]) {
    assert.equal(command(text), null, text);
  }
  for (const text of ["The git history is long.", "Every node is offline.", "pnpm is fast", "yarn is soft", "Make sure the file exists.", "tools/list returned nothing", "https://example.com/o/r/blob/main/src/x.ts", "Saved to ~/notes/src/today.md", "Open docs/guide.md"]) {
    assert.equal(prose(text), null, text);
  }
});

test("walks a value, reads command and fix as commands, and skips what is marked sourceCheckout", () => {
  const outcome = {
    ax: "outcome/1",
    text: "Your note says make test.",
    items: [{ title: "npm run build", count: 2, done: null }],
    next: [
      { command: "make test", why: "Run the tests" },
      { command: "pnpm dev", why: "Start the dev server", sourceCheckout: true },
    ],
    human: { reason: "Writes are off", resume: { command: "node scripts/writes.mjs on", why: "Turn writes on" } },
    error: { code: "writes-off", fix: "git pull", message: "notes: writes are off. Fix: notes writes on." },
  };
  assert.deepEqual(devCommandsIn(outcome, { messagesOnly: true }), [
    { match: "make test", kind: "command", where: "next[0].command", text: "make test" },
    { match: "node scripts/writes.mjs on", kind: "command", where: "human.resume.command", text: "node scripts/writes.mjs on" },
    { match: "git pull", kind: "command", where: "error.fix", text: "git pull" },
  ]);
  // Help is read in full: everything it says is the tool's own words.
  assert.deepEqual(
    devCommandsIn(outcome).map((f) => f.where),
    ["items[0].title", "next[0].command", "human.resume.command", "error.fix"],
  );
  assert.deepEqual(devCommandsIn("npm ci"), [{ match: "npm ci", kind: "command", where: "", text: "npm ci" }]);
  assert.deepEqual(devCommandsIn({ dev: { sourceCheckout: true, steps: ["npm run dev", { command: "make" }] } }), []);
  assert.deepEqual(sourceCheckoutTexts(outcome), ["pnpm dev", "Start the dev server"]);
  assert.deepEqual(sourceCheckoutTexts([{ sourceCheckout: false, command: "make" }, 3, null]), []);
  assert.ok(MESSAGE_KEYS.has("next") && MESSAGE_KEYS.has("human") && MESSAGE_KEYS.has("error") && MESSAGE_KEYS.has("fix"));
});
