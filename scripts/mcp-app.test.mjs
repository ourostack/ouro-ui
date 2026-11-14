import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { CONFIG_SLOT, embed, inline } from "./mcp-app.mts";

// scripts/mcp-app.mts builds OuroMcpApp into one HTML file per app. The build itself runs in
// registry/ouro/e2e/mcp-app-host/, which frames the built view in a host; these check the two steps
// that make the page safe to serve as one file.

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const catalog = JSON.parse(readFileSync(join(root, "test/fixtures/a2ui/recipe.catalog.json"), "utf8"));
const template = `<head>${CONFIG_SLOT}</head>`;
const config = (html) => JSON.parse(/<script type="application\/json" id="ouro-mcp-app-config">(.*)<\/script>/s.exec(html)[1]);

test("embed() puts the catalog, address and name in the page, as JSON no </script> can end", () => {
  const html = embed(template, { catalog: { ...catalog, description: "</script><script>alert(1)</script>" }, handoffUrl: "https://kitchen.example.com/r?do={action}", appInfo: { name: "Recipes", version: "1.0.0" } });
  assert.equal(html.match(/<\/script>/g).length, 1);
  assert.ok(!html.includes(CONFIG_SLOT));
  const read = config(html);
  assert.equal(read.catalog.description, "</script><script>alert(1)</script>");
  assert.equal(read.handoffUrl, "https://kitchen.example.com/r?do={action}");
  assert.deepEqual(read.appInfo, { name: "Recipes", version: "1.0.0" });
});

test("embed() keeps a $ in the catalog as it is", () => {
  const html = embed(template, { catalog: { ...catalog, description: "$& $' $`" } });
  assert.equal(config(html).catalog.description, "$& $' $`");
});

test("embed() refuses a catalog that isn't one, and an address that isn't http or https", () => {
  assert.throws(() => embed(template, { catalog: { components: {} } }));
  assert.throws(() => embed(template, { catalog, handoffUrl: "javascript:alert(1)" }), /--handoff-url must be an http or https address, got javascript:alert\(1\)/);
});

test("inline() puts the page's own script and stylesheet into it, so neither can end its tag early", () => {
  const files = { "./assets/a.js": 'console.log("</script>")', "./assets/a.css": "a::after{content:'</style>'}" };
  const html = inline('<script type="module" crossorigin src="./assets/a.js"></script><link rel="stylesheet" crossorigin href="./assets/a.css">', (path) => files[path]);
  assert.equal(html, `<script type="module">console.log("<\\/script>")</script><style>a::after{content:'<\\/style>'}</style>`);
});

test("the command prints its usage and exits 2 without --catalog and --out", () => {
  const run = spawnSync(process.execPath, [join(root, "scripts/mcp-app.mts"), "build"], { encoding: "utf8" });
  assert.equal(run.status, 2);
  assert.match(run.stderr, /Usage: node scripts\/mcp-app\.mts build --catalog <catalog\.json> --out <view\.html>/);
});
