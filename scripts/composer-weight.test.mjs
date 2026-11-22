import assert from "node:assert/strict";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { build } from "vite";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

/** Every chunk of an app's Vite production build of the Composer probe, with React left out as the app's own: whether the page loads it at once, and how many Lexical modules it holds. */
async function chunks() {
  const result = await build({
    root,
    configFile: false,
    logLevel: "silent",
    mode: "production",
    resolve: { alias: { "@": root } },
    build: { write: false, rollupOptions: { input: join(root, "scripts/fixtures/composer-weight-probe.ts"), external: [/^react($|\/)/, /^react-dom($|\/)/] } },
  });
  return (Array.isArray(result) ? result[0] : result).output
    .filter((output) => output.type === "chunk")
    .map((chunk) => ({
      file: chunk.fileName,
      entry: chunk.isEntry,
      lexical: Object.keys(chunk.modules).filter((id) => id.includes("/node_modules/lexical/") || id.includes("/node_modules/@lexical/")).length,
    }));
}

test("a page with a plain Composer loads no Lexical with it: the rich editor is a chunk fetched on first use", async () => {
  const built = await chunks();
  const loadedAtOnce = built.filter((chunk) => chunk.entry);
  assert.deepEqual(
    loadedAtOnce.map((chunk) => chunk.lexical),
    loadedAtOnce.map(() => 0),
    "no chunk the page loads at once holds a Lexical module",
  );
  assert.ok(
    built.some((chunk) => !chunk.entry && chunk.lexical > 0),
    `Lexical sits in a lazy chunk: ${built.map((chunk) => chunk.file).join(", ")}`,
  );
});
