/* global Buffer */
import assert from "node:assert/strict";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { build } from "vite";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const probe = join(root, "scripts/fixtures/dev-strip-probe.ts");
const distProbe = join(root, "scripts/fixtures/dev-strip-dist-probe.js");

// Peer dependencies stay external, so the output is only Ouro UI's code.
const external = [/^react($|\/)/, /^react-dom($|\/)/, /^@base-ui\/react($|\/)/, /^motion($|\/)/];

// Vite in app mode statically replaces process.env.NODE_ENV, as a consumer's build does.
// `input` is either the src probe (internal dev helpers, which dist does not export)
// or the dist probe (real components from the built package; run `pnpm build` first).
async function bundle(mode, input = probe) {
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
      rollupOptions: { input, external: input === distProbe ? external : [], preserveEntrySignatures: "strict" },
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

// The Fix code each component builds for an appearance class, and the message text.
const DIST_DEV_STRINGS = [
  "Fix:",
  "sets appearance",
  "className is for layout only",
  'tone="',
  'size="',
  "defineTheme({ radius",
  "<Text><strong>",
  'align="center"',
  "is not a prop",
  "without href",
  "Pass trigger={<Button>",
  "<SheetPortal><SheetBackdrop />",
  "onOpenChange={setOpen}",
  "snapPoints={[0.5, 1]}",
  "defineTheme({ color: { surface",
  "a Dialog is centered",
  "<DialogPortal><DialogBackdrop />",
  "onConfirm rejected",
  "setError(error.message)",
  "<ConfirmDialog tone=",
];

test("a Vite development bundle of dist keeps the components' dev messages (control)", async () => {
  const code = await bundle("development", distProbe);
  for (const text of DIST_DEV_STRINGS) assert.ok(code.includes(text), `missing ${text}`);
});

test("a Vite production bundle of dist (Button with a bad className) has no dev message text", async () => {
  const code = await bundle("production", distProbe);
  assert.ok(code.includes("bg-red-500"), "the probe's className should survive");
  for (const text of DIST_DEV_STRINGS) assert.ok(!code.includes(text), `still contains ${text}`);
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
