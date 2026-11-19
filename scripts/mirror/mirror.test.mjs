import assert from "node:assert/strict";
import { Buffer } from "node:buffer";
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { buildProblems } from "../public-registry.mjs";
import { scratchDir } from "../scratch.mjs";
import { buildMirror, checkNamespace, main, mirrorDependency, mirrorRelease } from "./mirror.mjs";

const REPO = "ourostack/ouro-ui";
const TAG = "v9.9.9";
const sha256 = (value) => createHash("sha256").update(value).digest("hex");

// A release registry as release.yml commits it: same-repo dependencies pinned to the tag.
const registry = {
  $schema: "https://ui.shadcn.com/schema/registry.json",
  name: "ouro",
  homepage: "https://ui.ouroboros.bot/",
  version: "9.9.9",
  items: [
    { name: "ouro-theme", type: "registry:theme", cssVars: { light: { accent: "#fff" } }, docs: "Theme. Ouro UI v9.9.9." },
    {
      name: "dialog",
      type: "registry:ui",
      registryDependencies: [`${REPO}/lib-cn#v9.9.9`, `${REPO}/ouro-base`, "https://example.com/r/other.json", "@shadcn/label"],
      files: [
        { path: "registry/ouro/dialog/dialog.tsx", type: "registry:ui", target: "@components/ouro/dialog/dialog.tsx" },
        { path: "registry/ouro/dialog/sheet.tsx", type: "registry:ui", target: "@components/ouro/dialog/sheet.tsx" },
      ],
    },
    { name: "lib-cn", type: "registry:lib", files: [{ path: "registry/ouro/lib/ouro/cn.ts", type: "registry:lib", target: "@lib/ouro/cn.ts" }] },
  ],
};
const sources = {
  "registry/ouro/dialog/dialog.tsx": "export function Dialog() {\n  return null;\n}\n",
  "registry/ouro/dialog/sheet.tsx": 'export const sheet = "ünïcode";\n',
  "registry/ouro/lib/ouro/cn.ts": 'export const cn = (...names: string[]) => names.join(" ");\n',
};
const read = (files = sources) => (path) => (path in files ? Buffer.from(files[path]) : undefined);
const mirror = (namespace = "@acme", over = {}) => buildMirror({ registry, read: read(), tag: TAG, namespace, repo: REPO, ...over });
const parsed = (files, path) => JSON.parse(files.get(path));

/** A checkout of the release in a scratch folder: its registry.json and the files it lists. */
function checkout(files = sources, reg = registry) {
  const dir = scratchDir("ouro-mirror-");
  writeFileSync(join(dir, "registry.json"), JSON.stringify(reg));
  for (const [path, text] of Object.entries(files)) {
    mkdirSync(dirname(join(dir, path)), { recursive: true });
    writeFileSync(join(dir, path), text);
  }
  return dir;
}

test("a mirror points every dependency on an item of this repository at the company's namespace, and keeps any other", () => {
  const files = mirror();
  assert.deepEqual(parsed(files, "r/dialog.json").registryDependencies, ["@acme/lib-cn", "@acme/ouro-base", "https://example.com/r/other.json", "@shadcn/label"]);
  assert.deepEqual(parsed(files, "r/registry.json").items.find((item) => item.name === "dialog").registryDependencies, ["@acme/lib-cn", "@acme/ouro-base", "https://example.com/r/other.json", "@shadcn/label"]);
  assert.equal(mirrorDependency(`${REPO}/button#v1.0.0`, REPO, "@acme"), "@acme/button");
  assert.equal(mirrorDependency("other/repo/button", REPO, "@acme"), "other/repo/button");
  // A fork's release registry still names its items as this repository's, and a registry rewritten for the fork's own name works too.
  assert.equal(mirrorDependency(`${REPO}/button#v1.0.0`, "myorg/ouro-ui", "@acme"), "@acme/button");
  assert.equal(mirrorDependency("myorg/ouro-ui/button#v1.0.0", "myorg/ouro-ui", "@acme"), "@acme/button");
});

test("a mirror carries each file's contents and is what the public namespace build is, byte for byte, under another name", () => {
  const files = mirror("@ouro");
  const dialog = parsed(files, "r/dialog.json");
  assert.equal(dialog.files[1].content, sources["registry/ouro/dialog/sheet.tsx"]);
  const namespace = new Map([...files].filter(([path]) => path.startsWith("r/")).map(([path, text]) => [path.slice(2), Buffer.from(text)]));
  assert.deepEqual(buildProblems({ registry, readSource: read(), namespace, repo: REPO, ref: TAG }), []);
});

test("mirror.json records each item's source tag, the sha256 of each source file and of the item's own JSON", () => {
  const files = mirror();
  const record = parsed(files, "mirror.json");
  assert.deepEqual(record.source, { repo: REPO, tag: TAG, version: "9.9.9" });
  assert.equal(record.namespace, "@acme");
  assert.deepEqual(Object.keys(record.items), ["ouro-theme", "dialog", "lib-cn"]);
  assert.deepEqual(record.items.dialog.files, { "registry/ouro/dialog/dialog.tsx": sha256(sources["registry/ouro/dialog/dialog.tsx"]), "registry/ouro/dialog/sheet.tsx": sha256(sources["registry/ouro/dialog/sheet.tsx"]) });
  assert.equal(record.items.dialog.sourceTag, TAG);
  assert.equal(record.items.dialog.hash, sha256(files.get("r/dialog.json")));
  assert.deepEqual(record.items["ouro-theme"].files, {});
  // A change to one source file moves that item's hash and no other's.
  const changed = mirror("@acme", { read: read({ ...sources, "registry/ouro/lib/ouro/cn.ts": "export const cn = 1;\n" }) });
  const after = parsed(changed, "mirror.json").items;
  assert.notEqual(after["lib-cn"].hash, record.items["lib-cn"].hash);
  assert.equal(after.dialog.hash, record.items.dialog.hash);
  assert.deepEqual([...mirror()], [...files], "the same release builds the same files");
});

test("a registry that is not a release's, a missing file, a path outside registry/, a bad tag and a bad namespace each fail with the fix", () => {
  assert.throws(() => mirror("@acme", { registry: { ...registry, version: undefined } }), /has version none, not 9\.9\.9: main commits no registry\.json.*Fix: mirror a release tag/);
  assert.throws(() => mirror("@acme", { registry: { ...registry, version: "9.9.8" } }), /has version 9\.9\.8, not 9\.9\.9/);
  assert.throws(() => mirror("@acme", { read: read({}) }), /dialog lists registry\/ouro\/dialog\/dialog\.tsx, which v9\.9\.9 does not have/);
  const climbing = { ...registry, items: [{ name: "x", type: "registry:lib", files: [{ path: "registry/../../etc/passwd" }] }] };
  assert.throws(() => mirror("@acme", { registry: climbing }), /x lists registry\/\.\.\/\.\.\/etc\/passwd, which is not a file under registry\//);
  for (const name of ["../../x", "a/b", "registry", "dialog"]) {
    const named = { ...registry, items: [registry.items[2], { name, type: "registry:lib" }] };
    named.items[0] = { ...named.items[0], name: name === "dialog" ? "dialog" : "lib-cn" };
    assert.throws(() => mirror("@acme", { registry: named }), /is not an item name a mirror can write/, name);
  }
  assert.throws(() => checkNamespace("acme"), /Fix: pass one like --namespace @acme/);
  assert.throws(() => checkNamespace("@ouro"), /public Ouro namespace/);
  assert.equal(checkNamespace("@acme-ui"), "@acme-ui");
});

test("the command writes the mirror from a checkout of the tag, and --check says whether a folder still is it", async () => {
  const source = checkout();
  const out = scratchDir("ouro-mirror-out-");
  const lines = [];
  const run = (...args) => main(["--tag", TAG, "--namespace", "@acme", "--out", out, "--source", source, ...args], { log: (line) => lines.push(line) });
  assert.equal(await run(), 0);
  assert.match(lines[0], /^Mirrored 3 items of ourostack\/ouro-ui v9\.9\.9 as @acme into /);
  assert.match(lines[1], /"registries": \{ "@acme": "https:\/\/<your host>\/r\/\{name\}\.json" \}/);
  assert.equal(JSON.parse(readFileSync(join(out, "r/lib-cn.json"), "utf8")).files[0].content, sources["registry/ouro/lib/ouro/cn.ts"]);

  lines.length = 0;
  assert.equal(await run("--check"), 0);
  assert.match(lines.at(-1), /is the v9\.9\.9 mirror, byte for byte: 3 items\./);

  // Someone edited an item, deleted another and added a third.
  writeFileSync(join(out, "r/dialog.json"), "{}\n");
  writeFileSync(join(out, "r/stray.json"), "{}\n");
  writeFileSync(join(out, "r/lib-cn.json"), "{}\n");
  lines.length = 0;
  assert.equal(await run("--check"), 1);
  assert.deepEqual(lines.slice(0, 3), ["dialog: r/dialog.json differs from the tag's build.", "lib-cn: r/lib-cn.json differs from the tag's build.", "stray: r/stray.json is not in the tag's build."]);
  assert.match(lines.at(-1), /is not the v9\.9\.9 mirror: 3 differences\./);

  // Writing again puts it back.
  assert.equal(await run(), 0);
  assert.equal(await run("--check"), 0);
});

test("the command will not write into a folder that has an r/ folder and no mirror.json", async () => {
  const out = scratchDir("ouro-mirror-out-");
  mkdirSync(join(out, "r"));
  writeFileSync(join(out, "r/keep.json"), "{}\n");
  await assert.rejects(main(["--tag", TAG, "--namespace", "@acme", "--out", out, "--source", checkout()], { log: () => {} }), /has an r\/ folder but no mirror\.json.*Fix: pass an empty --out/);
  assert.equal(readFileSync(join(out, "r/keep.json"), "utf8"), "{}\n");
});

test("without a checkout it reads the tag's registry.json and the files it lists from raw.githubusercontent.com", async () => {
  const served = { "registry.json": JSON.stringify(registry), ...sources };
  const asked = [];
  const fetch = async (url) => {
    asked.push(url);
    const path = url.replace(`https://raw.githubusercontent.com/${REPO}/${TAG}/`, "");
    return path in served ? { status: 200, arrayBuffer: async () => Buffer.from(served[path]) } : { status: 404 };
  };
  const files = await mirrorRelease({ tag: TAG, namespace: "@acme", fetch });
  assert.deepEqual([...files], [...mirror()]);
  assert.equal(asked[0], `https://raw.githubusercontent.com/${REPO}/${TAG}/registry.json`);
  assert.equal(asked.length, 4, "the registry and each file once");

  await assert.rejects(mirrorRelease({ tag: "v9.9.7", namespace: "@acme", fetch: async () => ({ status: 404 }) }), /has no registry\.json at v9\.9\.7.*Fix: pass a release tag/);
  await assert.rejects(mirrorRelease({ tag: TAG, namespace: "@acme", fetch: async () => ({ status: 503 }) }), /answered HTTP 503/);
  await assert.rejects(mirrorRelease({ tag: "main", namespace: "@acme", fetch }), /"main" is not a release tag/);
});
