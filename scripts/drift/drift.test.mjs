import assert from "node:assert/strict";
import { Buffer } from "node:buffer";
import { createHash } from "node:crypto";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { scratchDir } from "../scratch.mjs";
import { driftReport, main, reportText } from "./drift.mjs";

const REPO = "ourostack/ouro-ui";
const TAG = "v9.9.9";
const sha256 = (value) => createHash("sha256").update(value).digest("hex");

const registry = {
  name: "ouro",
  version: "9.9.9",
  items: [
    { name: "ouro-theme", type: "registry:theme", cssVars: { light: { accent: "#fff" } } },
    { name: "dialog", type: "registry:ui", files: [{ path: "registry/ouro/components/ouro/dialog/dialog.tsx", type: "registry:ui", target: "@components/ouro/dialog/dialog.tsx" }, { path: "registry/ouro/components/ouro/dialog/sheet.tsx", type: "registry:ui", target: "@components/ouro/dialog/sheet.tsx" }] },
    { name: "lib-cn", type: "registry:lib", files: [{ path: "registry/ouro/lib/ouro/cn.ts", type: "registry:lib", target: "@lib/ouro/cn.ts" }] },
  ],
};
const sources = {
  "registry/ouro/components/ouro/dialog/dialog.tsx": 'import { cn } from "@/registry/ouro/lib/ouro/cn";\nexport const Dialog = cn;\n',
  "registry/ouro/components/ouro/dialog/sheet.tsx": "export const sheet = 1;\n",
  "registry/ouro/lib/ouro/cn.ts": "export const cn = () => 1;\n",
};
// The files as the CLI installs them in an app whose aliases are @/components and @/lib.
const installed = {
  "src/components/ouro/dialog/dialog.tsx": 'import { cn } from "@/lib/ouro/cn";\nexport const Dialog = cn;\n',
  "src/components/ouro/dialog/sheet.tsx": "export const sheet = 1;\n",
  "src/lib/ouro/cn.ts": "export const cn = () => 1;\n",
};
const hashes = { "src/components/ouro/dialog/dialog.tsx": sha256(sources["registry/ouro/components/ouro/dialog/dialog.tsx"]), "src/components/ouro/dialog/sheet.tsx": sha256(sources["registry/ouro/components/ouro/dialog/sheet.tsx"]), "src/lib/ouro/cn.ts": sha256(sources["registry/ouro/lib/ouro/cn.ts"]) };

function write(dir, files) {
  for (const [path, text] of Object.entries(files)) {
    mkdirSync(dirname(join(dir, path)), { recursive: true });
    writeFileSync(join(dir, path), text);
  }
}
/** A checkout of the release v9.9.9. */
const checkout = (reg = registry) => {
  const dir = scratchDir("ouro-drift-release-");
  write(dir, { "registry.json": JSON.stringify(reg), ...sources });
  return dir;
};
/** An app that installed v9.9.9, with `changes` applied to its files (null removes one). */
function app(changes = {}, { tag = TAG, files = hashes } = {}) {
  const dir = scratchDir("ouro-drift-app-");
  write(dir, { ".github/ouro-hx-installed.json": JSON.stringify({ tag, files }), "components.json": JSON.stringify({ aliases: { components: "@/components", lib: "@/lib" } }), "tsconfig.json": "{}" });
  write(dir, { ...installed, ...Object.fromEntries(Object.entries(changes).filter(([, text]) => text !== null)) });
  for (const [path, text] of Object.entries(changes)) if (text === null) rmSync(join(dir, path));
  return dir;
}

test("an app whose files are the release's source, rewritten for its aliases, reports every item as released", async () => {
  const report = await driftReport([app()], { source: checkout(), latest: TAG });
  const [record] = report.apps[0].records;
  assert.equal(record.tag, TAG);
  assert.equal(record.behind, false);
  assert.deepEqual(record.summary, { items: 2, files: 3, released: 3, edited: 0, missing: 0, unlisted: 0 });
  assert.deepEqual(record.items.map((item) => item.name), ["dialog", "lib-cn"]);
  assert.match(reportText(report), /Ouro HX v9\.9\.9, the newest release, v9\.9\.9\.\n.*2 items, 3 files: 3 as released, 0 edited, 0 missing, 0 not in that release\.\n.*Items: dialog, lib-cn\./);
});

test("a file the app changed is edited, a file it deleted is missing, and each is named under its item", async () => {
  const dir = app({ "src/components/ouro/dialog/sheet.tsx": "export const sheet = 2;\n", "src/lib/ouro/cn.ts": null });
  const report = await driftReport([dir], { source: checkout(), latest: TAG });
  const [record] = report.apps[0].records;
  assert.deepEqual(record.summary, { items: 2, files: 3, released: 1, edited: 1, missing: 1, unlisted: 0 });
  assert.deepEqual(record.items.find((item) => item.name === "dialog").files, [{ path: "src/components/ouro/dialog/dialog.tsx", state: "released" }, { path: "src/components/ouro/dialog/sheet.tsx", state: "edited" }]);
  const text = reportText(report);
  assert.match(text, /^ {2}dialog: edited src\/components\/ouro\/dialog\/sheet\.tsx$/m);
  assert.match(text, /^ {2}lib-cn: missing src\/lib\/ouro\/cn\.ts$/m);
  assert.doesNotMatch(text, /dialog\.tsx$/m);
});

test("a file the release's registry no longer lists is unlisted, since there is nothing to compare it with", async () => {
  const dir = app({ "src/components/ouro/old/old.tsx": "export {};\n" }, { files: { ...hashes, "src/components/ouro/old/old.tsx": "0".repeat(64) } });
  const [record] = (await driftReport([dir], { source: checkout(), latest: TAG })).apps[0].records;
  assert.equal(record.summary.unlisted, 1);
  assert.deepEqual(record.items.find((item) => item.name === "(not in this release)"), { name: "(not in this release)", files: [{ path: "src/components/ouro/old/old.tsx", state: "unlisted" }] });
});

test("an app on an older release is behind the newest, and with no newest release behind is unknown", async () => {
  const older = checkout({ ...registry, version: "9.9.8" });
  const dir = app({}, { tag: "v9.9.8" });
  assert.equal((await driftReport([dir], { source: older, latest: TAG })).apps[0].records[0].behind, true);
  const unknown = await driftReport([dir], { source: older, latest: null, fetch: async () => ({ status: 500 }) });
  assert.equal(unknown.latest, null);
  assert.equal(unknown.apps[0].records[0].behind, null);
  assert.match(reportText(unknown), /Ouro HX v9\.9\.8, the newest release is unknown\./);
});

test("the newest release comes from the GitHub API when --latest is not given", async () => {
  const asked = [];
  const fetch = async (url) => {
    asked.push(url);
    return { status: 200, json: async () => ({ tag_name: "v9.9.10" }) };
  };
  const report = await driftReport([app()], { source: checkout(), fetch });
  assert.equal(report.latest, "v9.9.10");
  assert.equal(report.apps[0].records[0].behind, true);
  assert.deepEqual(asked, [`https://api.github.com/repos/${REPO}/releases/latest`]);
});

test("without a checkout the release's registry and the files it needs come from raw.githubusercontent.com, once per tag", async () => {
  const served = { "registry.json": JSON.stringify(registry), ...sources };
  const asked = [];
  const fetch = async (url) => {
    asked.push(url);
    const path = url.replace(`https://raw.githubusercontent.com/${REPO}/${TAG}/`, "");
    return path in served ? { status: 200, arrayBuffer: async () => Buffer.from(served[path]) } : { status: 404 };
  };
  const report = await driftReport([app(), app({ "src/lib/ouro/cn.ts": "export const cn = () => 2;\n" })], { latest: TAG, fetch });
  assert.deepEqual(report.apps.map((one) => one.records[0].summary.edited), [0, 1]);
  assert.equal(asked.filter((url) => url.endsWith("/registry.json")).length, 1, "the registry is read once for both apps");

  const missing = await driftReport([app({}, { tag: "v1.0.0" })], { latest: TAG, fetch });
  assert.match(missing.apps[0].records[0].error, /has no registry\.json at v1\.0\.0/);
  const refused = await driftReport([app()], { latest: TAG, fetch: async () => ({ status: 503 }) });
  assert.match(refused.apps[0].records[0].error, /answered HTTP 503/);
});

test("a --source checkout of another release, a record that is not one and an app with no record each say so", async () => {
  const mismatch = await driftReport([app()], { source: checkout({ ...registry, version: "9.9.8" }), latest: TAG });
  assert.match(mismatch.apps[0].records[0].error, /the --source checkout is v9\.9\.8, not v9\.9\.9\. Fix: pass a checkout of v9\.9\.9/);
  const notRecord = scratchDir("ouro-drift-app-");
  write(notRecord, { ".github/ouro-hx-installed.json": "[]" });
  assert.match((await driftReport([notRecord], { source: checkout(), latest: TAG })).apps[0].records[0].error, /is not an Ouro HX install record/);
  const empty = scratchDir("ouro-drift-app-");
  const none = await driftReport([empty], { source: checkout(), latest: TAG });
  assert.deepEqual(none.apps[0].records, []);
  assert.match(reportText(none), /no Ouro HX install record \(\.github\/ouro-hx-installed\.json\) found\./);
});

test("the command prints text or JSON, and --strict exits 1 for an app that drifted", async () => {
  const source = checkout();
  const clean = app();
  const edited = app({ "src/components/ouro/dialog/sheet.tsx": "export const sheet = 2;\n" });
  const lines = [];
  const run = (args) => main([...args, "--source", source, "--latest", TAG], { log: (line) => lines.push(line) });
  assert.equal(await run([clean, "--strict"]), 0);
  assert.equal(await run([edited]), 0, "a report alone never fails");
  assert.equal(await run([clean, edited, "--strict"]), 1);
  assert.equal(await run([scratchDir("ouro-drift-app-"), "--strict"]), 1, "an app with no install record cannot be measured, so it is not clean");
  lines.length = 0;
  assert.equal(await run([edited, "--json"]), 0);
  assert.equal(JSON.parse(lines[0]).apps[0].records[0].summary.edited, 1);
  await assert.rejects(main([], { log: () => {} }), /no app\. Fix: pass the checkout of each app/);
  await assert.rejects(main(["/no/such/folder"], { log: () => {} }), /is not a folder/);
});
