import { test } from "node:test";
import { deepEqual, equal } from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { walkDeclaredTools } from "./declared-tools.mts";
import { WALKERS } from "./registry.mts";

const here = dirname(fileURLToPath(import.meta.url));
const fixtures = join(here, "fixtures");
const declared = JSON.parse(readFileSync(join(fixtures, "declared-tools/tools.json"), "utf8")) as { tools: { function: { name: string; description: string }; ax: { id: string } }[] };

function walk(module: string, source = "declared-tools/tools.json", server = "shop") {
  return walkDeclaredTools({ product: "bundle", module: `declared-tools/${module}`, source, root: fixtures, server });
}

function lineOf(name: string): number {
  return readFileSync(join(fixtures, "declared-tools/tools.json"), "utf8").split("\n").findIndex((l) => l.includes(`"name": "${name}"`)) + 1;
}

test("is the built-in walker for declared in-turn tools", () => {
  deepEqual(WALKERS["declared-tools"]?.kinds, ["tool"]);
  equal(WALKERS["declared-tools"]?.walk, walkDeclaredTools);
});

test("a served tool tools.json declares is a tool door with the declared card, description and line", async () => {
  const { doors, errors } = await walk("server.cjs");
  deepEqual(errors, []);
  for (const entry of declared.tools) {
    const door = doors.find((d) => d.name === `shop_${entry.function.name}`);
    equal(door?.id, `tool:shop_${entry.function.name}`);
    equal(door?.kind, "tool");
    equal(door?.product, "bundle");
    equal(door?.file, "declared-tools/tools.json");
    equal(door?.line, lineOf(entry.function.name), entry.function.name);
    equal(door?.description, entry.function.description);
    deepEqual(door?.card, { ...entry.ax, id: door?.id });
  }
});

test("a served tool tools.json doesn't name is a door with no card, at the line the server names it", async () => {
  const { doors } = await walk("server.cjs");
  const clear = doors.find((d) => d.name === "shop_clear_shopping_list");
  const line = readFileSync(join(fixtures, "declared-tools/server.cjs"), "utf8").split("\n").findIndex((l) => l.includes('"clear_shopping_list"')) + 1;
  deepEqual(clear, { id: "tool:shop_clear_shopping_list", kind: "tool", product: "bundle", name: "shop_clear_shopping_list", description: "Take every item off the list.", file: "declared-tools/server.cjs", line, card: null, evidence: {} });
  equal(doors.length, 5);
});

test("read-only evidence is what the server serves", async () => {
  const { doors } = await walk("server.cjs");
  deepEqual(doors.filter((d) => d.evidence.readOnly).map((d) => d.name), ["shop_get_shopping_list"]);
});

test("a declared tool the server doesn't serve is a census error", async () => {
  const { doors, errors } = await walk("server-short.cjs");
  equal(doors.length, 3);
  deepEqual(errors, ["share_shopping_list: declared in declared-tools/tools.json, but declared-tools/server-short.cjs doesn't serve it"]);
});

test("a tools.json that isn't JSON, or has no tools list, is a census error", async () => {
  deepEqual((await walk("server.cjs", "declared-tools/broken.json")).errors.map((e) => e.split(":")[0]), ["declared-tools/broken.json"]);
  deepEqual((await walk("server.cjs", "declared-tools/no-tools.json")).errors, ["declared-tools/no-tools.json: has no tools list"]);
});

test("a server module that exports no getToolSchemas is a census error", async () => {
  const { doors, errors } = await walk("../mcp-none.cjs");
  deepEqual(doors, []);
  deepEqual(errors, ["declared-tools/../mcp-none.cjs: exports no getToolSchemas function"]);
});

test("a person-only tool is no agent door, served or not", async () => {
  const served = await walk("server.cjs", "declared-tools/person-only.json");
  deepEqual(served.errors, []);
  equal(served.doors.some((d) => d.name === "shop_share_shopping_list"), false);
  equal(served.doors.length, 4);
  deepEqual((await walk("server-short.cjs", "declared-tools/person-only.json")).errors, []);
});

test("a served tool with no name, or served twice, is a census error", async () => {
  const { doors, errors } = await walk("server-bad.cjs");
  deepEqual(errors, ["declared-tools/server-bad.cjs: getToolSchemas returned a tool without a name", "get_shopping_list: declared-tools/server-bad.cjs serves it twice"]);
  equal(doors.length, 4);
});

test("a tool is the door the agent sees: <server>_<name>, unless the name already starts with the server's", async () => {
  const shop = await walk("server.cjs");
  deepEqual(shop.doors.map((d) => d.id), ["tool:shop_get_shopping_list", "tool:shop_add_shopping_list_item", "tool:shop_remove_shopping_list_item", "tool:shop_share_shopping_list", "tool:shop_clear_shopping_list"]);
  deepEqual((await walk("server.cjs", "declared-tools/tools.json", "get")).doors.map((d) => d.id)[0], "tool:get_shopping_list");
  const { doors } = shop;
  // The harness gives the declared card the id the agent sees, so the census checks the card under that id.
  equal(doors[0]!.card!.id, "tool:shop_get_shopping_list");
  equal(doors[0]!.name, "shop_get_shopping_list");
});

test("an entry that isn't a whole declaration leaves its tool undeclared, even one that says person-only", async () => {
  const { doors, errors } = await walk("server.cjs", "declared-tools/incomplete.json");
  deepEqual(errors, []);
  const share = doors.find((d) => d.id === "tool:shop_share_shopping_list");
  equal(share?.card, null);
  equal(share?.file, "declared-tools/server.cjs");
  deepEqual((await walk("server-short.cjs", "declared-tools/incomplete.json")).errors, [], "an incomplete declaration the server doesn't serve declares nothing");
});

test("finds each declared tool's line however tools.json is spaced", async () => {
  const { doors } = await walk("server.cjs", "declared-tools/minified.json");
  deepEqual(doors.filter((d) => d.card).map((d) => d.line), [1, 1, 1, 1]);
});

test("needs the server's name, the one agent.json gives it under mcpServers", async () => {
  deepEqual(await walkDeclaredTools({ product: "bundle", module: "declared-tools/server.cjs", source: "declared-tools/tools.json", root: fixtures }), { doors: [], errors: ["declared-tools/tools.json: the declared-tools source needs server, the name agent.json gives the server under mcpServers"] });
});

function gated(approvals: string[], module = "server.cjs") {
  return walkDeclaredTools({ product: "bundle", module: `declared-tools/${module}`, source: "declared-tools/tools.json", root: fixtures, server: "shop", approvals });
}

test("a consequential door has approval evidence when the code that offers it gates consequential declarations", async () => {
  for (const spec of ["declared-tools/gate.ts#offer", "declared-tools/gate.ts#offerByIf"]) {
    const { doors, errors } = await gated([spec]);
    deepEqual(errors, [], spec);
    deepEqual(doors.filter((d) => d.evidence.approval).map((d) => d.name), ["shop_share_shopping_list"], spec);
  }
  equal((await walk("server.cjs")).doors.some((d) => d.evidence.approval), false, "with no approvals, no door has approval evidence");
});

test("an approvals function that doesn't gate consequential declarations is a census error", async () => {
  for (const fn of ["offerWrongEffect", "offerAlways", "offerNothing"]) {
    const { doors, errors } = await gated([`declared-tools/gate.ts#${fn}`]);
    deepEqual(errors, [`declared-tools: approvals declared-tools/gate.ts#${fn} attaches no approvalPolicy under an effect === "consequential" check. Fix: name the function that offers the declared tools, or remove it from the config.`], fn);
    equal(doors.some((d) => d.evidence.approval), false, fn);
  }
  deepEqual((await gated(["declared-tools/gate.ts#missing"])).errors, ["declared-tools: approvals declared-tools/gate.ts#missing names no function. Fix: remove it from the config."]);
  deepEqual((await gated(["declared-tools/gate.ts"])).errors, ["declared-tools: approvals declared-tools/gate.ts: give it as <file>#<function>."]);
});

// The real-harness check runs against an ourostack/ouroboros checkout named by OURO_CENSUS_HARNESS.
const harness = process.env.OURO_CENSUS_HARNESS;
const offers = harness ? join(harness, "src/repertoire/mcp-tools.ts") : "";
test("the real harness gates every declared consequential tool", { skip: harness && existsSync(offers) ? false : "set OURO_CENSUS_HARNESS to an ouroboros checkout" }, async () => {
  const { doors, errors } = await walkDeclaredTools({ product: "bundle", module: join(fixtures, "declared-tools/server.cjs"), source: join(fixtures, "declared-tools/tools.json"), root: harness!, server: "shop", approvals: ["src/repertoire/mcp-tools.ts#mcpToolsAsDefinitions"] });
  deepEqual(errors, []);
  deepEqual(doors.filter((d) => d.evidence.approval).map((d) => d.name), ["shop_share_shopping_list"]);
});
