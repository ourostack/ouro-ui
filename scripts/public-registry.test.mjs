import assert from "node:assert/strict";
import { Buffer } from "node:buffer";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { buildProblems, ITEM_SCHEMA, liveProblems, namespaceDependency, waitForLive } from "./public-registry.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const REPO = "ourostack/ouro-ui";

// A release registry as release.yml commits it: same-repo dependencies pinned to the tag.
const registry = {
  $schema: "https://ui.shadcn.com/schema/registry.json",
  name: "ouro",
  homepage: "https://ui.ouro.bot/",
  version: "9.9.9",
  items: [
    { name: "ouro-theme", type: "registry:theme", cssVars: { light: { accent: "#fff" } }, docs: "Theme. Ouro UI v9.9.9." },
    {
      name: "dialog",
      type: "registry:ui",
      dependencies: ["@base-ui/react@^1.8.0"],
      registryDependencies: [`${REPO}/lib-cn#v9.9.9`, "https://example.com/r/other.json"],
      docs: "Dialog. Ouro UI v9.9.9.",
      files: [
        { path: "registry/ouro/dialog/dialog.tsx", type: "registry:ui", target: "@components/ouro/dialog/dialog.tsx" },
        { path: "registry/ouro/dialog/sheet.tsx", type: "registry:ui", target: "@components/ouro/dialog/sheet.tsx" },
      ],
    },
    {
      name: "lib-cn",
      type: "registry:lib",
      files: [{ path: "registry/ouro/lib/ouro/cn.ts", type: "registry:lib", target: "@lib/ouro/cn.ts" }],
    },
  ],
};
const sources = {
  "registry/ouro/dialog/dialog.tsx": "export function Dialog() {\n  return null;\n}\n",
  "registry/ouro/dialog/sheet.tsx": "export const sheet = \"ünïcode\";\n",
  "registry/ouro/lib/ouro/cn.ts": "export const cn = (...names: string[]) => names.join(\" \");\n",
};

/** The namespace as `namespace.sh` builds it: what `shadcn build` writes for that registry. */
function built(source = registry, files = sources) {
  const index = { ...source, items: source.items.map((item) => ({ ...item, ...(item.registryDependencies ? { registryDependencies: item.registryDependencies.map((dep) => namespaceDependency(dep, REPO)) } : {}) })) };
  const out = new Map([["registry.json", Buffer.from(`${JSON.stringify(index, null, 2)}\n`)]]);
  for (const item of index.items) {
    const json = { $schema: ITEM_SCHEMA, ...item, ...(item.files ? { files: item.files.map((file) => ({ ...file, content: files[file.path] })) } : {}) };
    out.set(`${item.name}.json`, Buffer.from(`${JSON.stringify(json, null, 2)}\n`));
  }
  return out;
}

const read = (files = sources) => (path) => (path in files ? Buffer.from(files[path]) : undefined);
const check = (namespace, files = sources, source = registry) => buildProblems({ registry: source, readSource: read(files), namespace, repo: REPO, ref: "abc1234" });
const edit = (namespace, name, change) => {
  const copy = new Map(namespace);
  const json = JSON.parse(copy.get(name).toString("utf8"));
  change(json);
  copy.set(name, Buffer.from(`${JSON.stringify(json, null, 2)}\n`));
  return copy;
};

test("same-repo dependencies point at @ouro/<item>, pinned or not; others stay", () => {
  assert.equal(namespaceDependency(`${REPO}/lib-cn#v9.9.9`, REPO), "@ouro/lib-cn");
  assert.equal(namespaceDependency(`${REPO}/lib-cn`, REPO), "@ouro/lib-cn");
  assert.equal(namespaceDependency("https://example.com/r/other.json", REPO), "https://example.com/r/other.json");
  assert.equal(namespaceDependency("ourostack/ouro-ui-other/x", REPO), "ourostack/ouro-ui-other/x");
});

test("a namespace built from the commit's registry and files passes, whatever the item count", () => {
  assert.deepEqual(check(built()), []);
  const two = { ...registry, items: registry.items.slice(0, 2).map((item) => (item.name === "dialog" ? { ...item, registryDependencies: [] } : item)) };
  assert.deepEqual(check(built(two), sources, two), []);
});

test("a file whose content differs from the commit's by one byte fails, naming the item and the file", () => {
  const namespace = built(registry, { ...sources, "registry/ouro/dialog/sheet.tsx": "export const sheet = \"unicode\";\n" });
  const problems = check(namespace);
  assert.equal(problems.length, 1, problems.join("\n"));
  assert.match(problems[0], /^dialog: registry\/ouro\/dialog\/sheet\.tsx differs from abc1234's file/);
});

test("a file the commit does not hold fails", () => {
  const files = { ...sources };
  delete files["registry/ouro/lib/ouro/cn.ts"];
  assert.match(check(built(), files).join("\n"), /^lib-cn: registry\/ouro\/lib\/ouro\/cn\.ts is not in abc1234/m);
});

test("an item missing from the namespace fails, naming it", () => {
  const namespace = built();
  namespace.delete("lib-cn.json");
  assert.deepEqual(check(namespace), ["lib-cn: lib-cn.json is missing from the namespace."]);
});

test("an extra item in the namespace fails, naming it", () => {
  const namespace = built();
  namespace.set("stray.json", Buffer.from("{}\n"));
  assert.deepEqual(check(namespace), ["stray: stray.json is in the namespace but not in abc1234's registry.json."]);
});

test("a dependency not pointed at @ouro, other metadata, or a wrong schema fails, naming the item", () => {
  const pinned = edit(built(), "dialog.json", (json) => (json.registryDependencies[0] = `${REPO}/lib-cn#v9.9.9`));
  assert.match(check(pinned).join("\n"), /^dialog: registryDependencies\[0\] is "ourostack\/ouro-ui\/lib-cn#v9\.9\.9", not "@ouro\/lib-cn"/m);
  const docs = edit(built(), "ouro-theme.json", (json) => (json.docs = "Theme. Ouro UI v9.9.8."));
  assert.match(check(docs).join("\n"), /^ouro-theme: docs is "Theme\. Ouro UI v9\.9\.8\.", not "Theme\. Ouro UI v9\.9\.9\."/m);
  const vars = edit(built(), "ouro-theme.json", (json) => delete json.cssVars);
  assert.match(check(vars).join("\n"), /^ouro-theme: cssVars is missing/m);
  const schema = edit(built(), "lib-cn.json", (json) => (json.$schema = "https://example.com/item.json"));
  assert.match(check(schema).join("\n"), /^lib-cn: \$schema is "https:\/\/example\.com\/item\.json", not "https:\/\/ui\.shadcn\.com\/schema\/registry-item\.json"/m);
  const extra = edit(built(), "lib-cn.json", (json) => (json.extra = true));
  assert.match(check(extra).join("\n"), /^lib-cn: extra is not in abc1234's registry\.json/m);
});

test("a long field that differs only at its end fails, in an item and in the index: fields compare in full", () => {
  const long = (version) => `${"Every Ouro UI helper is in lib/ouro. OuroProvider is optional; it routes internal hrefs through your router's link. ".repeat(3)}Ouro UI v${version}.`;
  assert.ok(long("9.9.9").length > 200);
  const source = { ...registry, items: registry.items.map((item) => (item.name === "lib-cn" ? { ...item, docs: long("9.9.9") } : item)) };
  const item = edit(built(source), "lib-cn.json", (json) => (json.docs = long("9.9.8")));
  const itemProblems = check(item, sources, source);
  assert.equal(itemProblems.length, 1, itemProblems.join("\n"));
  assert.match(itemProblems[0], /^lib-cn: docs differs from character \d+: …".*Ouro UI v9\.9\.8\.", not …".*Ouro UI v9\.9\.9\."\.$/);
  const index = edit(built(source), "registry.json", (json) => (json.items.find((entry) => entry.name === "lib-cn").docs = long("9.9.8")));
  const indexProblems = check(index, sources, source);
  assert.equal(indexProblems.length, 1, indexProblems.join("\n"));
  assert.match(indexProblems[0], /^registry\.json: items\[2\]\.docs differs from character \d+: …".*Ouro UI v9\.9\.8\.", not …".*Ouro UI v9\.9\.9\."\.$/);
});

test("the namespace's index must be the commit's registry with its dependencies at @ouro", () => {
  const missing = built();
  missing.delete("registry.json");
  assert.deepEqual(check(missing), ["registry.json is missing from the namespace."]);
  const stale = edit(built(), "registry.json", (json) => (json.version = "9.9.8"));
  assert.match(check(stale).join("\n"), /^registry\.json: version is "9\.9\.8", not "9\.9\.9"/m);
});

test("a registry path outside registry/ is refused", () => {
  const escape = { ...registry, items: [{ name: "x", type: "registry:lib", files: [{ path: "registry/../package.json", type: "registry:lib" }] }] };
  assert.match(check(built(escape, { "registry/../package.json": "{}" }), sources, escape).join("\n"), /^x: registry\/\.\.\/package\.json is not a file under registry\//m);
});

// What Pages serves, as a stand-in fetch: `served` maps a file name to its bytes, or to a status.
const serving = (served) => async (name) => (name in served ? (typeof served[name] === "number" ? { status: served[name] } : { status: 200, body: Buffer.from(served[name]) }) : { status: 404 });
const asServed = (namespace) => Object.fromEntries([...namespace].map(([name, bytes]) => [name, bytes.toString("utf8")]));

test("a live namespace that serves every item of the build byte for byte passes", async () => {
  assert.deepEqual(await liveProblems(built(), serving(asServed(built())), "v9.9.9"), []);
});

test("a stale live copy fails, naming the item and the release the deploy serves", async () => {
  const served = asServed(built());
  served["dialog.json"] = served["dialog.json"].replace("Ouro UI v9.9.9.", "Ouro UI v9.9.8.");
  served["registry.json"] = served["registry.json"].replace('"version": "9.9.9"', '"version": "9.9.8"');
  const problems = await liveProblems(built(), serving(served), "v9.9.9");
  assert.ok(problems.includes("dialog: the served dialog.json differs from the v9.9.9 build."), problems.join("\n"));
  assert.ok(problems.includes("registry.json: the deploy serves the index of v9.9.8, not v9.9.9."), problems.join("\n"));
});

test("a served copy that differs only in whitespace still fails: the comparison is byte for byte", async () => {
  const served = asServed(built());
  served["lib-cn.json"] = served["lib-cn.json"].trimEnd();
  assert.deepEqual(await liveProblems(built(), serving(served), "v9.9.9"), ["lib-cn: the served lib-cn.json differs from the v9.9.9 build."]);
});

test("an item the deploy does not serve fails, naming it", async () => {
  const served = asServed(built());
  delete served["lib-cn.json"];
  assert.deepEqual(await liveProblems(built(), serving(served), "v9.9.9"), ["lib-cn: lib-cn.json is not served (HTTP 404)."]);
});

test("an extra item the deploy serves fails, naming it", async () => {
  const served = asServed(built());
  const index = JSON.parse(served["registry.json"]);
  index.items.push({ name: "stray", type: "registry:ui" });
  served["registry.json"] = `${JSON.stringify(index, null, 2)}\n`;
  const problems = await liveProblems(built(), serving(served), "v9.9.9");
  assert.ok(problems.includes("stray: the deploy serves stray, which the v9.9.9 build does not have."), problems.join("\n"));
  assert.ok(problems.includes("registry.json: the served registry.json differs from the v9.9.9 build."), problems.join("\n"));
});

test("a fetch that throws is a problem for that file, not a crash", async () => {
  const fetchFile = async (name) => {
    if (name === "dialog.json") throw new Error("socket hang up");
    return serving(asServed(built()))(name);
  };
  assert.deepEqual(await liveProblems(built(), fetchFile, "v9.9.9"), ["dialog: dialog.json could not be fetched (socket hang up)."]);
});

test("--wait retries a stale deploy until it serves the build", async () => {
  const stale = asServed(built());
  stale["dialog.json"] = stale["dialog.json"].replace("Ouro UI v9.9.9.", "Ouro UI v9.9.8.");
  let clock = 0;
  let rounds = 0;
  const fetchFile = (name) => serving(rounds > 2 ? asServed(built()) : stale)(name);
  const problems = await waitForLive({
    local: built(), tag: "v9.9.9", waitMs: 120_000, intervalMs: 20_000, now: () => clock,
    sleep: async (ms) => { clock += ms; rounds += 1; }, fetchFile, log: () => {},
  });
  assert.deepEqual(problems, []);
  assert.equal(rounds, 3);
});

test("--wait gives up when the wait ends, with the stale item", async () => {
  const stale = asServed(built());
  stale["dialog.json"] = stale["dialog.json"].replace("Ouro UI v9.9.9.", "Ouro UI v9.9.8.");
  let clock = 0;
  let rounds = 0;
  const problems = await waitForLive({
    local: built(), tag: "v9.9.9", waitMs: 60_000, intervalMs: 20_000, now: () => clock,
    sleep: async (ms) => { clock += ms; rounds += 1; }, fetchFile: serving(stale), log: () => {},
  });
  assert.deepEqual(problems, ["dialog: the served dialog.json differs from the v9.9.9 build."]);
  assert.equal(rounds, 3);
});

/** A git repository holding the fixture registry and files, and a namespace folder built from it. */
function fixtureRepo(namespace = built()) {
  const scratch = join(root, ".tmp");
  mkdirSync(scratch, { recursive: true });
  const dir = mkdtempSync(join(scratch, "public-registry-"));
  const repo = join(dir, "repo");
  for (const [path, text] of Object.entries({ "registry.json": `${JSON.stringify(registry, null, 2)}\n`, ...sources })) {
    mkdirSync(dirname(join(repo, path)), { recursive: true });
    writeFileSync(join(repo, path), text);
  }
  const git = (...args) => execFileSync("git", ["-C", repo, "-c", "user.name=t", "-c", "user.email=t@example.com", ...args], { encoding: "utf8" });
  git("init", "-q");
  git("add", ".");
  git("commit", "-qm", "release");
  const ns = join(dir, "ns");
  mkdirSync(ns);
  for (const [name, bytes] of namespace) writeFileSync(join(ns, name), bytes);
  return { repo, ns, sha: git("rev-parse", "HEAD").trim() };
}

const cli = (args, cwd) => spawnSync(process.execPath, [join(root, "scripts/public-registry.mjs"), ...args], { cwd, encoding: "utf8", env: { ...process.env, GITHUB_REPOSITORY: REPO } });

test("verify-build reads the registry and every file from the commit, and passes a matching namespace", () => {
  const { repo, ns, sha } = fixtureRepo();
  const result = cli(["verify-build", ns, "HEAD"], repo);
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.match(result.stdout, new RegExp(`^The namespace in .+ns matches ${sha.slice(0, 12)} byte for byte: 3 items, 3 files and its index\\.$`, "m"));
});

test("verify-build fails with a GitHub error line per problem", () => {
  const { repo, ns } = fixtureRepo(built(registry, { ...sources, "registry/ouro/lib/ouro/cn.ts": "export const cn = 1;\n" }));
  const result = cli(["verify-build", ns, "HEAD"], repo);
  assert.equal(result.status, 1);
  assert.match(result.stdout, /^::error::lib-cn: registry\/ouro\/lib\/ouro\/cn\.ts differs from [0-9a-f]{12}'s file/m);
});

test("the commands refuse bad arguments", () => {
  assert.notEqual(cli(["verify-build"], root).status, 0);
  assert.notEqual(cli(["verify-live", "1.0.0"], root).status, 0);
  assert.notEqual(cli(["verify-live", "v1.0.0", "--wait", "soon"], root).status, 0);
  assert.notEqual(cli(["publish"], root).status, 0);
});
