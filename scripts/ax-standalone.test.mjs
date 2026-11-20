import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { buildRegistry } from "./registry.mts";
import { scratchDir } from "./scratch.mjs";
import { copyTree } from "./tree.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const registry = buildRegistry(root);
const byName = Object.fromEntries(registry.items.map((entry) => [entry.name, entry]));
const prefix = "ourostack/ouro-ui/";

function closure(name, seen = new Set()) {
  if (seen.has(name)) return seen;
  seen.add(name);
  for (const dependency of byName[name].registryDependencies ?? []) closure(dependency.replace(prefix, ""), seen);
  return seen;
}

test("ouro-ax installs only AX items: no Ouro HX component, theme, stylesheet or package", () => {
  const items = [...closure("ouro-ax")].map((name) => byName[name]);
  const outsiders = items.filter((entry) => entry.name !== "ouro-ax" && !entry.name.startsWith("ax-"));
  assert.deepEqual(outsiders.map((entry) => entry.name), []);
  for (const entry of items) {
    assert.ok(!entry.css && !entry.cssVars, `${entry.name} writes the app's stylesheet`);
    assert.deepEqual(entry.dependencies ?? [], [], `${entry.name} adds an npm package`);
    for (const file of entry.files ?? []) assert.ok(file.path.startsWith("registry/ouro/ax/"), `${entry.name} ships ${file.path}, outside registry/ouro/ax/`);
  }
});

// Installs the files ouro-ax lists the way the shadcn CLI places them, then adds the one package.json entry the guide gives.
function install(app) {
  copyTree(join(root, "test/ax-standalone-fixture"), app);
  for (const name of closure("ouro-ax")) {
    for (const file of byName[name].files ?? []) {
      const target = file.type === "registry:lib" ? join("src/lib/ouro/ax", basename(file.path)) : file.target.replace(/^~\//, "");
      mkdirSync(join(app, dirname(target)), { recursive: true });
      copyFileSync(join(root, file.path), join(app, target));
    }
  }
  mkdirSync(join(app, "scripts/ouro-actions"), { recursive: true });
  copyFileSync(join(root, "scripts/ouro-actions/ouro-actions.mts"), join(app, "scripts/ouro-actions/ouro-actions.mts"));
  const actions = join(app, "tasks.actions.mts");
  writeFileSync(actions, readFileSync(actions, "utf8").replace("../../scripts/ouro-actions", "./scripts/ouro-actions"));
  const manifest = JSON.parse(readFileSync(join(app, "package.json"), "utf8"));
  manifest.imports = { "#ouro-ax/*": "./src/lib/ouro/ax/*" };
  writeFileSync(join(app, "package.json"), JSON.stringify(manifest, null, 2));
}

const run = (app, args) => spawnSync("node", args, { cwd: app, encoding: "utf8" });

test("an app with no Ouro HX declares two actions, and the generated projections match them", () => {
  const app = scratchDir("ax-standalone-");
  install(app);
  const result = run(app, ["scripts/ouro-actions/ouro-actions.mts", "check", "tasks.actions.mts", "generated", "--targets", "web,mcp,actions"]);
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.match(result.stdout, /2 actions, every projection matches its declaration/);
});

test("a button and the MCP tool call the same handler, so a press and an agent's call give one answer", () => {
  const app = scratchDir("ax-standalone-");
  install(app);
  const script = `
    import { press, render } from "./src/page.mjs";
    import { spawn } from "node:child_process";
    const html = render();
    const bound = [...html.matchAll(/data-ax-action="([^"]+)"/g)].map((m) => m[1]);
    const server = spawn("node", ["src/mcp.mjs"]);
    const lines = [];
    server.stdout.on("data", (d) => lines.push(...String(d).split("\\n").filter(Boolean)));
    const send = (m) => server.stdin.write(JSON.stringify({ jsonrpc: "2.0", ...m }) + "\\n");
    send({ id: 1, method: "initialize", params: {} });
    send({ id: 2, method: "tools/call", params: { name: "complete_task", arguments: { id: "t1" } } });
    await new Promise((r) => setTimeout(r, 800));
    server.kill();
    const viaMcp = JSON.parse(lines.map(JSON.parse).find((m) => m.id === 2).result.content[0].text);
    console.log(JSON.stringify({ bound, viaMcp, viaButton: press("complete-task", { id: "t1" }) }));
  `;
  const result = run(app, ["--input-type=module", "-e", script]);
  assert.equal(result.status, 0, result.stderr);
  const { bound, viaMcp, viaButton } = JSON.parse(result.stdout);
  assert.deepEqual(bound.sort(), ["complete-task", "list-tasks"]);
  assert.deepEqual(viaMcp, { id: "t1" });
  assert.deepEqual(viaButton, viaMcp);
});

test("ax-xray checks the app's MCP server from outside and finds it conformant, with no Ouro HX installed", () => {
  const app = scratchDir("ax-standalone-");
  install(app);
  writeFileSync(join(app, "inventory.json"), JSON.stringify({ mcp: ["list_tasks", "complete_task"] }));
  const result = run(app, ["scripts/ouro/ax/xray.ts", "--mcp", "node src/mcp.mjs", "--inventory", "inventory.json", "--conformance", "--home", join(app, "home"), "--json"]);
  assert.equal(result.status, 0, result.stdout + result.stderr);
  const { summary } = JSON.parse(result.stdout);
  assert.equal(summary.mustHolding, summary.must);
  assert.equal(summary.checks.fail, 0);
});
