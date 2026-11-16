import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { scratchDir } from "./scratch.mjs";

// The registry's agent door (actions/, scripts/ouro-actions/): the vendored generator matches its release, the
// generated projections match their declarations, and the MCP server answers from the registry.

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const vendored = join(root, "scripts/ouro-actions");
const sha256 = (file) => createHash("sha256").update(readFileSync(file)).digest("hex");
const generator = join(vendored, "ouro-actions.mts");

test("the vendored generator and claim set are the release's, by hash", () => {
  const manifest = JSON.parse(readFileSync(join(vendored, "dist-manifest.json"), "utf8"));
  assert.equal(manifest.coreTag, "v0.16.0");
  assert.equal(sha256(generator), manifest.files["dist/actions/ouro-actions.mts"]);
  assert.equal(sha256(join(vendored, "actions.claims.json")), manifest.files["dist/ax/actions.claims.json"]);
});

test("the generated projections match the declarations, and the claims hold", () => {
  const report = join(root, ".tmp/ouro-actions/report.json");
  const result = spawnSync(
    process.execPath,
    [generator, "check", "actions/registry.actions.mts", "actions/generated", "--report", report, "--app", "Ouro UI"],
    { cwd: root, encoding: "utf8" },
  );
  assert.equal(result.status, 0, result.stdout + result.stderr);
  const summary = JSON.parse(readFileSync(report, "utf8")).summary;
  assert.ok(summary.must > 0, "no must claims were checked");
  assert.equal(summary.mustHolding, summary.must);
});

const server = await import("../actions/server/registry-mcp.mts");

test("the registry door lists items, pins install commands to the release and reads docs", async () => {
  const ctx = await server.loadContext(root);
  assert.match(ctx.release, /^v\d+\.\d+\.\d+$/);
  const names = server.listNames(ctx, "DIALOG").split(", ");
  assert.ok(names.includes("dialog"));
  assert.ok(names.every((name) => name.includes("dialog")));
  assert.equal(server.installCommand("dialog", "v1.2.3"), "npx shadcn@latest add ourostack/ouro-ui/dialog#v1.2.3");

  const install = await server.callTool(ctx, "get_item_install", { name: "dialog" });
  assert.deepEqual(install.structuredContent, { command: `npx shadcn@latest add ourostack/ouro-ui/dialog#${ctx.release}`, release: ctx.release });

  const docs = await server.callTool(ctx, "get_item_docs", { name: "dialog" });
  assert.equal(docs.structuredContent.url, "https://ui.ouroboros.bot/docs/dialog/");
  assert.match(docs.structuredContent.markdown, /# Dialog/);
  const noDocs = await server.callTool(ctx, "get_item_docs", { name: "ouro-base" });
  assert.equal(noDocs.structuredContent.markdown, "");
});

test("a call the door cannot answer says what to do, and an unknown tool is an RPC error", async () => {
  const ctx = await server.loadContext(root);
  const missing = await server.callTool(ctx, "get_item_docs", {});
  assert.equal(missing.isError, true);
  assert.match(missing.content[0].text, /Missing required argument name/);

  const unknownItem = await server.callTool(ctx, "get_item_install", { name: "no-such-item" });
  assert.equal(unknownItem.isError, true);
  assert.match(unknownItem.content[0].text, /list_registry_items/);

  const unknownTool = await server.handleMessage(ctx, { id: 7, method: "tools/call", params: { name: "nope" } });
  assert.equal(unknownTool.error.code, -32602);
  assert.equal(await server.handleMessage(ctx, { method: "notifications/initialized" }), undefined);
  assert.deepEqual((await server.handleMessage(ctx, { id: 8, method: "ping" })).result, {});
  assert.equal((await server.handleMessage(ctx, { id: 9, method: "resources/list" })).error.code, -32601);
});

test("the server speaks MCP over stdio and prints its tool names for the X-ray's inventory", () => {
  const messages = [
    { jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-06-18" } },
    { jsonrpc: "2.0", method: "notifications/initialized" },
    { jsonrpc: "2.0", id: 2, method: "tools/list", params: {} },
    { jsonrpc: "2.0", id: 3, method: "tools/call", params: { name: "list_registry_items", arguments: { filter: "tabs" } } },
  ];
  const run = spawnSync(process.execPath, ["actions/server/registry-mcp.mts"], {
    cwd: root,
    input: messages.map((m) => JSON.stringify(m)).join("\n") + "\n",
    encoding: "utf8",
  });
  assert.equal(run.status, 0, run.stderr);
  const [init, list, call] = run.stdout.trim().split("\n").map((line) => JSON.parse(line));
  assert.equal(init.result.serverInfo.name, "ouro-ui-registry");
  assert.deepEqual(list.result.tools.map((t) => t.name), ["list_registry_items", "get_item_install", "get_item_docs"]);
  assert.match(call.result.structuredContent.names, /tabs/);

  const tools = spawnSync(process.execPath, ["actions/server/registry-mcp.mts", "--tools"], { cwd: root, encoding: "utf8" });
  assert.deepEqual(JSON.parse(tools.stdout), ["list_registry_items", "get_item_install", "get_item_docs"]);
});

test("the X-ray over the registry door holds every must claim, so a change that breaks one fails CI", () => {
  const dir = scratchDir("ax-xray-");
  const tools = spawnSync(process.execPath, ["actions/server/registry-mcp.mts", "--tools"], { cwd: root, encoding: "utf8" });
  const inventory = join(dir, "inventory.json");
  writeFileSync(inventory, JSON.stringify({ mcp: JSON.parse(tools.stdout) }));
  const run = spawnSync(
    process.execPath,
    ["registry/ouro/ax/xray.ts", "--mcp", "node actions/server/registry-mcp.mts", "--inventory", inventory, "--conformance", "--home", join(dir, "home"), "--json"],
    { cwd: root, encoding: "utf8", maxBuffer: 64 << 20 },
  );
  const summary = JSON.parse(run.stdout).summary;
  assert.ok(summary.must > 0, "no must claims were checked");
  assert.equal(summary.mustHolding, summary.must, run.stderr);
  assert.equal(run.status, 0, run.stderr);
});
