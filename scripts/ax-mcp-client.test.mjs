import assert from "node:assert/strict";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/client";
import { StdioClientTransport } from "@modelcontextprotocol/client/stdio";

// ax-mcp has no dependencies, so the official TypeScript client (a devDependency of this repository only) is how it is
// checked against another implementation of MCP: it spawns the kit's example tool, notes, as an MCP server over stdio.
// The MCP conformance suite (@modelcontextprotocol/conformance) tests servers over HTTP and against its own fixture
// tools, so it cannot reach a stdio server.

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const server = "registry/ouro/ax/fixtures/notes-mcp.mts";

async function withClient(options, body) {
  const client = new Client({ name: "ouro-ui-tests", version: "1.0.0" }, options);
  await client.connect(new StdioClientTransport({ command: process.execPath, args: [server], cwd: root }));
  try {
    return await body(client);
  } finally {
    await client.close();
  }
}

async function useTheTools(client) {
  assert.deepEqual(client.getServerVersion(), { name: "notes", version: "1.0.0" });
  assert.ok(client.getServerCapabilities()?.tools);
  assert.match(client.getInstructions() ?? "", /Every error has a fix/);
  const { tools } = await client.listTools();
  assert.deepEqual(tools.map((tool) => tool.name), ["rooms", "note", "post", "watch"]);
  assert.deepEqual(tools.find((tool) => tool.name === "post")?.annotations, { title: "notes post", readOnlyHint: false, destructiveHint: true, openWorldHint: true });
  const rooms = await client.callTool({ name: "rooms", arguments: {} });
  assert.equal(rooms.isError, false);
  assert.match(rooms.content[0].text, /Design sync/);
  const refused = await client.callTool({ name: "post", arguments: { room: "abc123", text: "hi" } });
  assert.equal(refused.isError, true);
  assert.equal(refused.structuredContent.error.code, "needs-why");
  assert.match(refused.content[0].text, /Fix: /);
}

test("the official client, pinned to 2026-07-28, lists and calls ax-mcp's tools with no initialize", async () => {
  await withClient({ versionNegotiation: { mode: { pin: "2026-07-28" } } }, async (client) => {
    assert.equal(client.getProtocolEra(), "modern");
    assert.equal(client.getNegotiatedProtocolVersion(), "2026-07-28");
    await useTheTools(client);
  });
});

test("the official client that probes with server/discover settles on 2026-07-28 against ax-mcp", async () => {
  await withClient({ versionNegotiation: { mode: "auto" } }, async (client) => {
    assert.equal(client.getProtocolEra(), "modern");
    assert.equal(client.getNegotiatedProtocolVersion(), "2026-07-28");
    await useTheTools(client);
  });
});

test("the official client that opens with initialize is served 2025-11-25, and each older revision it asks for", async () => {
  await withClient(undefined, async (client) => {
    assert.equal(client.getProtocolEra(), "legacy");
    assert.equal(client.getNegotiatedProtocolVersion(), "2025-11-25");
    await useTheTools(client);
  });
  for (const version of ["2025-06-18", "2025-03-26", "2024-11-05"]) {
    await withClient({ supportedProtocolVersions: [version] }, async (client) => {
      assert.equal(client.getProtocolEra(), "legacy");
      assert.equal(client.getNegotiatedProtocolVersion(), version);
      await useTheTools(client);
    });
  }
});

async function withRegistry(options, body) {
  const client = new Client({ name: "ouro-ui-tests", version: "1.0.0" }, options);
  await client.connect(new StdioClientTransport({ command: process.execPath, args: ["actions/server/registry-mcp.mts"], cwd: root }));
  try {
    return await body(client);
  } finally {
    await client.close();
  }
}

test("the official client reaches the registry door on 2026-07-28 with no initialize, and on 2025-06-18 with it", async () => {
  await withRegistry({ versionNegotiation: { mode: "auto" } }, async (client) => {
    assert.equal(client.getProtocolEra(), "modern");
    assert.equal(client.getNegotiatedProtocolVersion(), "2026-07-28");
    assert.equal(client.getServerVersion()?.name, "ouro-ui-registry");
    const { tools } = await client.listTools();
    assert.deepEqual(tools.map((tool) => tool.name), ["list_registry_items", "get_item_install", "get_item_docs"]);
    const found = await client.callTool({ name: "list_registry_items", arguments: { filter: "tabs" } });
    assert.match(found.structuredContent.names, /tabs/);
  });
  await withRegistry({ supportedProtocolVersions: ["2025-06-18"] }, async (client) => {
    assert.equal(client.getProtocolEra(), "legacy");
    assert.equal(client.getNegotiatedProtocolVersion(), "2025-06-18");
    const { tools } = await client.listTools();
    assert.equal(tools.length, 3);
  });
});
