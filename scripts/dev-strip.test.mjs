/* global Buffer */
import assert from "node:assert/strict";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { build } from "vite";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const probe = join(root, "scripts/fixtures/dev-strip-probe.ts");

// The probe imports the dev helpers from src (they are internal, so dist does not
// export them). Vite in app mode statically replaces process.env.NODE_ENV, as a
// consumer's build does.
async function bundle(mode) {
  // Vite builds always set NODE_ENV=production, whatever the mode; the control sets it explicitly.
  const define = mode === "development" ? { "process.env.NODE_ENV": '"development"' } : {};
  const result = await build({
    root,
    configFile: false,
    logLevel: "silent",
    mode,
    define,
    build: {
      write: false,
      minify: mode === "production",
      rollupOptions: { input: probe, preserveEntrySignatures: "strict" },
    },
  });
  const output = (Array.isArray(result) ? result[0] : result).output;
  return output.find((chunk) => chunk.type === "chunk" && chunk.isEntry).code;
}

const load = (code) => import(`data:text/javascript;base64,${Buffer.from(code).toString("base64")}`);

// Short hint literals passed as hook arguments (such as PROBE_HINT) stay in the bundle:
// they are call-site arguments outside any guard. The messages and logic are removed.
const DEV_STRINGS = [
  "Fix:",
  "PROBE_PROBLEM_TEXT",
  "PROBE_FIX_TEXT",
  "PROBE_THROW_FIX",
  "sets appearance",
];

test("a Vite development bundle still contains the dev messages (control)", async () => {
  const code = await bundle("development");
  for (const text of DEV_STRINGS) assert.ok(code.includes(text), `missing ${text}`);
});

test("a Vite production bundle removes every dev message string", async () => {
  const code = await bundle("production");
  for (const text of DEV_STRINGS) assert.ok(!code.includes(text), `still contains ${text}`);
});

test("in a production bundle devWarn is silent and devThrow carries no fix", async () => {
  const mod = await load(await bundle("production"));
  const warnings = [];
  const original = console.warn;
  console.warn = (...args) => warnings.push(args);
  try {
    mod.warnProbe();
  } finally {
    console.warn = original;
  }
  assert.deepEqual(warnings, []);
  assert.throws(() => mod.throwProbe(), {
    message: "[ouro-ui] Sheet.Title: PROBE_THROW_PROBLEM",
  });
});
