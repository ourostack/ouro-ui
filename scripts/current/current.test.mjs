import assert from "node:assert/strict";
import { Buffer } from "node:buffer";
import { createHash, createVerify, generateKeyPairSync } from "node:crypto";
import { test } from "node:test";
import { gzipSync } from "node:zlib";
import { lintMarkdown, lintPlain } from "../../registry/ouro/lib/ouro/claims-check.mjs";
import { BRANCH, body, keepCurrent, keepRepo, publicView, title } from "./current.mjs";
import { appJwt, createGitHub, retryable } from "./github.mjs";
import { UPDATERS, findPins, isBehind, isCandidate } from "./pins.mjs";
import { readTarball } from "./tar.mjs";

const sha256 = (value) => createHash("sha256").update(value).digest("hex");
const RELEASES = {
  web: { repo: "ourostack/ouro-ui", name: "Ouro UI", tag: "v1.3.187", sha: "c".repeat(40), url: "https://example.test/web" },
  core: { repo: "ourostack/ouro-ui-core", name: "Ouro UI core", tag: "v0.15.0", sha: "d".repeat(40), url: "https://example.test/core" },
  apple: { repo: "ourostack/ouro-ui-apple", name: "Ouro UI for Apple", tag: "v0.9.0", sha: "e".repeat(40), url: "https://example.test/apple" },
};

/** A gzipped tar like GitHub's: one top folder, and a pax record for a long name. */
function tarball(files) {
  const blocks = [];
  const header = (name, size, type) => {
    const block = Buffer.alloc(512);
    block.write(name.slice(0, 99), 0);
    block.write(size.toString(8).padStart(11, "0"), 124);
    block.write(type, 156);
    return block;
  };
  const pad = (bytes) => Buffer.concat([bytes, Buffer.alloc((512 - (bytes.length % 512)) % 512)]);
  for (const [path, content] of Object.entries(files)) {
    const name = `ourostack-ouro-ui-abc123/${path}`;
    const bytes = Buffer.from(content);
    if (name.length > 99) {
      const rest = ` path=${name}\n`;
      let size = rest.length + 2;
      while (String(size).length + rest.length !== size) size = String(size).length + rest.length;
      const pax = Buffer.from(`${size}${rest}`);
      blocks.push(header("pax", pax.length, "x"), pad(pax));
    }
    blocks.push(header(name, bytes.length, "0"), pad(bytes));
  }
  blocks.push(Buffer.alloc(1024));
  return gzipSync(Buffer.concat(blocks));
}

test("the tarball reader drops the top folder and reads long names", () => {
  const long = `registry/ouro/components/ouro/${"x".repeat(80)}/file.tsx`;
  const files = readTarball(tarball({ "a.txt": "one", [long]: "two" }));
  assert.equal(files.get("a.txt").toString(), "one");
  assert.equal(files.get(long).toString(), "two");
});

test("pins are found by file name in every format Ouro UI is taken in", () => {
  const found = (path, text) => findPins(path, text).map((pin) => [pin.kind, pin.follows, pin.current]);
  assert.deepEqual(found(".github/ouro-hx-installed.json", JSON.stringify({ tag: "v1.3.117", files: {} })), [["hx-installed", "web", "v1.3.117"]]);
  assert.deepEqual(found("vendor/ouro-ui-core/pin.json", JSON.stringify({ tag: "v0.13.1", asset: "ouro-ui-core-v0.13.1-dist.zip", path: "web/themes/cookbook.css" })), [["core-pin", "core", "v0.13.1"]]);
  assert.deepEqual(found("Package.swift", '.package(url: "https://github.com/ourostack/ouro-ui-apple.git", exact: "0.6.0")'), [["swiftpm", "apple", "0.6.0"]]);
  assert.deepEqual(found("Package.swift", '.package(url: "https://github.com/ourostack/ouro-ui-apple.git", .upToNextMinor(from: "0.6.0"))'), [["swiftpm", "apple", "0.6.0"]]);
  assert.deepEqual(found("Package.resolved", '{"pins":[{"identity":"ouro-ui-apple","kind":"remoteSourceControl","state":{"revision":"abc","version":"0.6.0"}}]}'), [["swiftpm-resolved", "apple", "0.6.0"]]);
  assert.deepEqual(found("project.yml", "packages:\n  OuroUIApple:\n    url: https://github.com/ourostack/ouro-ui-apple\n    minorVersion: 0.8.0\n"), [["xcodegen", "apple", "0.8.0"]]);
  assert.deepEqual(found("App.xcodeproj/project.pbxproj", 'repositoryURL = "https://github.com/ourostack/ouro-ui-apple";\n\t\t\trequirement = {\n\t\t\t\tkind = upToNextMinorVersion;\n\t\t\t\tminimumVersion = 0.5.1;\n\t\t\t};'), [["xcodeproj", "apple", "0.5.1"]]);
  assert.deepEqual(found(".github/workflows/site-checks.yml", "env:\n  OURO_UI_TAG: v1.3.99\n"), [["workflow-tag", "web", "v1.3.99"]]);
  assert.deepEqual(found("upstream-sources.lock.json", JSON.stringify({ sources: [{ id: "ax", repository: "ourostack/ouro-ui", commit: "4e44b67613dc", files: [] }, { id: "other", repository: "someone/else", commit: "f", files: [] }] })), [["vendor-lock", "web", "commit 4e44b67"]]);
  assert.deepEqual(found("Package.swift", '.package(url: "https://github.com/apple/swift-argument-parser", from: "1.0.0")'), []);
  assert.equal(isCandidate("node_modules/x/Package.swift"), false);
  assert.equal(isCandidate("Sources/App/Package.swift"), true);
  assert.equal(isCandidate("README.md"), false);
});

test("a pin is behind unless it is on the release it follows, with or without the v", () => {
  assert.equal(isBehind({ kind: "swiftpm", current: "0.9.0" }, RELEASES.apple), false);
  assert.equal(isBehind({ kind: "swiftpm", current: "0.8.0" }, RELEASES.apple), true);
  assert.equal(isBehind({ kind: "vendor-lock", commit: RELEASES.web.sha }, RELEASES.web), false);
});

test("version pins move to the release, written the way the file writes them", async () => {
  const run = async (kind, file, text, follows) => (await UPDATERS[kind]({ kind, file, follows }, text, RELEASES[follows], {})).files[file];
  assert.equal(await run("swiftpm", "Package.swift", '.package(url: "https://github.com/ourostack/ouro-ui-apple.git", exact: "0.6.0")', "apple"), '.package(url: "https://github.com/ourostack/ouro-ui-apple.git", exact: "0.9.0")');
  assert.equal(await run("xcodegen", "project.yml", "  OuroUIApple:\n    url: https://github.com/ourostack/ouro-ui-apple\n    minorVersion: 0.8.0\n", "apple"), "  OuroUIApple:\n    url: https://github.com/ourostack/ouro-ui-apple\n    minorVersion: 0.9.0\n");
  assert.equal(await run("workflow-tag", ".github/workflows/a.yml", "  OURO_UI_TAG: v1.3.99\n", "web"), "  OURO_UI_TAG: v1.3.187\n");
  assert.match(await run("xcodeproj", "p.pbxproj", 'repositoryURL = "https://github.com/ourostack/ouro-ui-apple";\n requirement = {\n kind = exactVersion;\n version = 0.5.1;\n };', "apple"), /version = 0\.9\.0;/);
  const resolved = await run("swiftpm-resolved", "Package.resolved", '{"pins":[{"identity":"other","state":{"revision":"111","version":"1.0.0"}},{"identity":"ouro-ui-apple","state":{"revision":"abc123","version":"0.6.0"}}]}', "apple");
  assert.equal(resolved, `{"pins":[{"identity":"other","state":{"revision":"111","version":"1.0.0"}},{"identity":"ouro-ui-apple","state":{"revision":"${"e".repeat(40)}","version":"0.9.0"}}]}`);
});

test("Ouro HX takes the new tag's source as the CLI would write it, adds files its items gained, and leaves an edited file alone", async () => {
  const registry = { items: [
    { name: "button", files: [{ path: "registry/ouro/components/ouro/button/button.tsx", target: "@components/ouro/button/button.tsx" }, { path: "registry/ouro/lib/ouro/press.ts", target: "@lib/ouro/press.ts" }] },
    { name: "alert", files: [{ path: "registry/ouro/components/ouro/alert/alert.tsx", target: "@components/ouro/alert/alert.tsx" }] },
    { name: "census", files: [{ path: "registry/ouro/census/census.mjs", target: "~/e2e/ouro-census/census.mjs" }] },
  ] };
  const oldRegistry = { items: registry.items.map((item) => ({ ...item, files: item.files.filter((file) => !file.path.endsWith("press.ts")) })) };
  const button = (v) => `import { cn } from "@/registry/ouro/lib/ouro/cn";\nexport const Button = "${v}";\n`;
  const previous = new Map(Object.entries({ "registry.json": JSON.stringify(oldRegistry), "registry/ouro/components/ouro/button/button.tsx": button("v1"), "registry/ouro/components/ouro/alert/alert.tsx": "alert v1", "registry/ouro/census/census.mjs": "census v1" }).map(([k, v]) => [k, Buffer.from(v)]));
  const next = new Map(Object.entries({ "registry.json": JSON.stringify(registry), "registry/ouro/components/ouro/button/button.tsx": button("v2"), "registry/ouro/lib/ouro/press.ts": 'import { cn } from "@/registry/ouro/lib/ouro/cn";\n', "registry/ouro/components/ouro/alert/alert.tsx": "alert v2", "registry/ouro/census/census.mjs": "census v2" }).map(([k, v]) => [k, Buffer.from(v)]));
  const record = { tag: "v1.3.117", tagCommit: "old", files: { "app/components/ouro/button/button.tsx": sha256(button("v1")), "app/components/ouro/alert/alert.tsx": sha256("alert v1"), "e2e/ouro-census/census.mjs": sha256("census v1") } };
  const consumer = new Map([
    ["components.json", Buffer.from(JSON.stringify({ aliases: { components: "~/components", lib: "~/lib" } }))],
    ["app/components/ouro/button/button.tsx", Buffer.from(button("v1").replace("@/registry/ouro/lib/", "~/lib/"))],
    ["app/components/ouro/alert/alert.tsx", Buffer.from("alert edited here")],
    ["e2e/ouro-census/census.mjs", Buffer.from("census v1")],
  ]);
  const ctx = { tarball: async (follows, tag) => (tag === "v1.3.117" ? previous : next), consumerFiles: async () => consumer };
  const pin = { kind: "hx-installed", file: ".github/ouro-hx-installed.json", follows: "web" };
  const update = await UPDATERS["hx-installed"](pin, JSON.stringify(record), RELEASES.web, ctx);
  assert.equal(update.files["app/components/ouro/button/button.tsx"].toString(), button("v2").replace("@/registry/ouro/lib/", "~/lib/"), "imports are rewritten to the app's aliases, as the CLI does");
  assert.equal(update.files["app/lib/ouro/press.ts"].toString(), 'import { cn } from "~/lib/ouro/cn";\n', "the button item's new file comes with it");
  assert.equal(update.files["e2e/ouro-census/census.mjs"].toString(), "census v2");
  assert.equal(update.files["app/components/ouro/alert/alert.tsx"], undefined, "an edited file is never overwritten");
  const written = JSON.parse(update.files[pin.file]);
  assert.equal(written.tag, "v1.3.187");
  assert.equal(written.tagCommit, RELEASES.web.sha);
  assert.equal(written.files["app/components/ouro/button/button.tsx"], sha256(button("v2")), "the record keeps the registry source's hash");
  assert.equal(written.files["app/components/ouro/alert/alert.tsx"], sha256("alert v1"));
  assert.ok(update.notes.some((note) => note.includes("alert.tsx") && /edited here/.test(note)));
});

test("a vendored source moves to the release's commit with each file's new bytes and hash", async () => {
  const lock = { schemaVersion: 1, sources: [{ id: "ax", repository: "ourostack/ouro-ui", commit: "old", files: [{ sourcePath: "registry/ouro/ax/cli.ts", generatedPath: "lib/ouro-ui/registry/ouro/ax/cli.ts", sha256: "x" }] }] };
  const ctx = { tarball: async () => new Map([["registry/ouro/ax/cli.ts", Buffer.from("cli v2")]]) };
  const update = await UPDATERS["vendor-lock"]({ kind: "vendor-lock", file: "upstream-sources.lock.json", follows: "web", source: "ax" }, JSON.stringify(lock), RELEASES.web, ctx);
  assert.equal(update.files["lib/ouro-ui/registry/ouro/ax/cli.ts"].toString(), "cli v2");
  const written = JSON.parse(update.files["upstream-sources.lock.json"]);
  assert.equal(written.sources[0].commit, RELEASES.web.sha);
  assert.equal(written.sources[0].files[0].sha256, sha256("cli v2"));
});

test("a vendored core file comes from the new release's asset", async () => {
  const pin = { tag: "v0.13.1", release: "https://github.com/ourostack/ouro-ui-core/releases/tag/v0.13.1", asset: "ouro-ui-core-v0.13.1-dist.zip", path: "web/themes/cookbook.css", sha256: "x" };
  const asked = [];
  const ctx = { assetFile: async (...args) => (asked.push(args), Buffer.from("css v2")) };
  const update = await UPDATERS["core-pin"]({ kind: "core-pin", file: "vendor/ouro-ui-core/pin.json", follows: "core" }, JSON.stringify(pin), RELEASES.core, ctx);
  assert.deepEqual(asked[0], ["core", "v0.15.0", "ouro-ui-core-v0.15.0-dist.zip", "web/themes/cookbook.css"]);
  assert.equal(update.files["vendor/ouro-ui-core/cookbook.css"].toString(), "css v2");
  assert.deepEqual(JSON.parse(update.files["vendor/ouro-ui-core/pin.json"]), { ...pin, tag: "v0.15.0", release: "https://github.com/ourostack/ouro-ui-core/releases/tag/v0.15.0", asset: "ouro-ui-core-v0.15.0-dist.zip", sha256: sha256("css v2") });
});

test("the title names each release a pull request moves to", () => {
  assert.equal(title([{ follows: "apple" }], RELEASES), "Update to Ouro UI for Apple v0.9.0");
  assert.equal(title([{ follows: "web" }, { follows: "core" }, { follows: "web" }], RELEASES), "Update to Ouro UI core v0.15.0 and Ouro UI v1.3.187");
});

// ---- A GitHub in memory: one repository, its refs, commits, trees, blobs and pull requests ----------------

function fakeRepo(files, { mergeMethods = ["SQUASH"] } = {}) {
  let next = 1;
  const id = () => `${(next++).toString(16).padStart(40, "0")}`;
  const blobs = new Map();
  const trees = new Map();
  const commits = new Map();
  const refs = new Map();
  const pulls = [];
  const calls = [];
  const blob = (content) => {
    const sha = sha256(content).slice(0, 40);
    blobs.set(sha, Buffer.from(content));
    return sha;
  };
  const tree = (entries) => {
    const sha = sha256(JSON.stringify([...entries].sort())).slice(0, 40);
    trees.set(sha, new Map(entries));
    return sha;
  };
  const root = tree(Object.entries(files).map(([path, text]) => [path, blob(text)]));
  const main = id();
  commits.set(main, { tree: root, parents: [] });
  refs.set("main", main);
  const ok = (data, status = 200) => ({ status, headers: new Map(), text: async () => JSON.stringify(data), arrayBuffer: async () => Buffer.from(JSON.stringify(data)) });
  const missing = () => ({ status: 404, headers: new Map(), text: async () => "Not Found" });
  const fetch = async (url, init) => {
    const path = url.replace("https://api.github.com/", "");
    const method = init.method;
    const input = init.body ? JSON.parse(init.body) : null;
    calls.push(`${method} ${path}`);
    let match;
    if (method === "GET" && path === "repos/o/r") return ok({ default_branch: "main", private: false, owner: { login: "o" } });
    if ((match = /^repos\/o\/r\/git\/ref\/heads\/(.+)$/.exec(path)) && method === "GET") {
      const name = decodeURIComponent(match[1]);
      return refs.has(name) ? ok({ object: { sha: refs.get(name) } }) : missing();
    }
    if ((match = /^repos\/o\/r\/git\/trees\/([^?]+)\?recursive=1$/.exec(path))) {
      const sha = commits.get(match[1])?.tree ?? match[1];
      return ok({ sha, truncated: false, tree: [...trees.get(sha)].map(([p, s]) => ({ path: p, type: "blob", sha: s })) });
    }
    if ((match = /^repos\/o\/r\/git\/blobs\/(.+)$/.exec(path)) && method === "GET") return ok({ content: blobs.get(match[1]).toString("base64") });
    if ((match = /^repos\/o\/r\/git\/commits\/(.+)$/.exec(path)) && method === "GET") {
      const commit = commits.get(match[1]);
      return ok({ sha: match[1], tree: { sha: commit.tree }, parents: commit.parents.map((sha) => ({ sha })) });
    }
    if (path === "repos/o/r/git/blobs") return ok({ sha: blob(Buffer.from(input.content, "base64")) }, 201);
    if (path === "repos/o/r/git/trees") {
      const base = new Map(trees.get(input.base_tree));
      for (const entry of input.tree) {
        if (entry.sha === null) base.delete(entry.path);
        else base.set(entry.path, entry.sha);
      }
      return ok({ sha: tree([...base]) }, 201);
    }
    if (path === "repos/o/r/git/commits") {
      const sha = id();
      commits.set(sha, { tree: input.tree, parents: input.parents });
      return ok({ sha }, 201);
    }
    if (path === "repos/o/r/git/refs" && method === "POST") {
      refs.set(input.ref.replace("refs/heads/", ""), input.sha);
      return ok({}, 201);
    }
    if ((match = /^repos\/o\/r\/git\/refs\/heads\/(.+)$/.exec(path)) && method === "PATCH") {
      refs.set(match[1], input.sha);
      return ok({});
    }
    if (path.startsWith("repos/o/r/pulls?state=open")) return ok(pulls.filter((pr) => pr.state === "open"));
    if (path === "repos/o/r/pulls" && method === "POST") {
      const pr = { number: pulls.length + 1, node_id: `PR${pulls.length + 1}`, html_url: `https://example.test/pull/${pulls.length + 1}`, state: "open", title: input.title, body: input.body, head: input.head, autoMerge: null };
      pulls.push(pr);
      return ok(pr, 201);
    }
    if ((match = /^repos\/o\/r\/pulls\/(\d+)$/.exec(path)) && method === "PATCH") {
      const pr = pulls[Number(match[1]) - 1];
      Object.assign(pr, input);
      return ok(pr);
    }
    if (/^repos\/o\/r\/issues\/\d+\/comments$/.test(path)) return ok({}, 201);
    if (path === "graphql") {
      const pr = pulls.find((item) => item.node_id === input.variables.id);
      if (!mergeMethods.includes(input.variables.method)) return ok({ errors: [{ message: `Merge method ${input.variables.method.toLowerCase()} merging is not allowed on this repository` }] });
      pr.autoMerge = input.variables.method;
      return ok({ data: { enablePullRequestAutoMerge: { clientMutationId: null } } });
    }
    throw new Error(`fake GitHub has no ${method} ${path}`);
  };
  const fileAt = (ref, path) => blobs.get(trees.get(commits.get(refs.get(ref)).tree).get(path))?.toString();
  return { gh: createGitHub({ token: "t", fetch, sleep: async () => {} }), refs, pulls, calls, fileAt, setMain: (changes) => {
    const base = new Map(trees.get(commits.get(refs.get("main")).tree));
    for (const [path, text] of Object.entries(changes)) base.set(path, blob(text));
    const sha = id();
    commits.set(sha, { tree: tree([...base]), parents: [refs.get("main")] });
    refs.set("main", sha);
  } };
}

const SWIFT = '.package(url: "https://github.com/ourostack/ouro-ui-apple.git", exact: "0.6.0")';

test("one pull request per repository: opened once, left alone when nothing changed, and updated in place", async () => {
  const repo = fakeRepo({ "Package.swift": SWIFT, "README.md": "hi" });
  const first = await keepRepo(repo.gh, "o/r", RELEASES, {});
  assert.equal(first.state, "pr");
  assert.equal(first.pr.title, "Update to Ouro UI for Apple v0.9.0");
  assert.equal(first.pr.autoMerge, true);
  assert.equal(repo.fileAt(BRANCH, "Package.swift"), SWIFT.replace("0.6.0", "0.9.0"));
  assert.equal(repo.fileAt("main", "Package.swift"), SWIFT, "the default branch is never written");
  const pushes = repo.calls.filter((call) => call.startsWith("POST repos/o/r/git/commits")).length;

  const again = await keepRepo(repo.gh, "o/r", RELEASES, {});
  assert.equal(again.pr.number, first.pr.number);
  assert.equal(again.pr.pushed, false, "the same update is not pushed twice");
  assert.equal(repo.calls.filter((call) => call.startsWith("POST repos/o/r/git/commits")).length, pushes);
  assert.equal(repo.pulls.length, 1);

  const newer = { ...RELEASES, apple: { ...RELEASES.apple, tag: "v0.10.0", sha: "f".repeat(40) } };
  const updated = await keepRepo(repo.gh, "o/r", newer, {});
  assert.equal(updated.pr.number, first.pr.number, "a newer release updates the same pull request");
  assert.equal(repo.pulls.length, 1);
  assert.equal(repo.pulls[0].title, "Update to Ouro UI for Apple v0.10.0");
  assert.equal(repo.fileAt(BRANCH, "Package.swift"), SWIFT.replace("0.6.0", "0.10.0"));
});

test("a repository that caught up on its own has its stale pull request closed", async () => {
  const repo = fakeRepo({ "Package.swift": SWIFT });
  await keepRepo(repo.gh, "o/r", RELEASES, {});
  repo.setMain({ "Package.swift": SWIFT.replace("0.6.0", "0.9.0") });
  const result = await keepRepo(repo.gh, "o/r", RELEASES, {});
  assert.equal(result.state, "current");
  assert.equal(repo.pulls[0].state, "closed");
});

test("auto-merge falls back to a merge method the repository allows", async () => {
  const repo = fakeRepo({ "Package.swift": SWIFT }, { mergeMethods: ["MERGE"] });
  const result = await keepRepo(repo.gh, "o/r", RELEASES, {});
  assert.equal(result.pr.autoMerge, true);
  assert.equal(repo.pulls[0].autoMerge, "MERGE");
});

test("a repository with no pin file gets nothing", async () => {
  const repo = fakeRepo({ "README.md": "hi" });
  const result = await keepRepo(repo.gh, "o/r", RELEASES, {});
  assert.equal(result.state, "no-pins");
  assert.equal(repo.pulls.length, 0);
});

test("requests are retried on a server error or rate limit, and not on a refusal", async () => {
  assert.equal(retryable(502), true);
  assert.equal(retryable(429), true);
  assert.equal(retryable(403, "API rate limit exceeded"), true);
  assert.equal(retryable(404), false);
  assert.equal(retryable(422), false);
  let calls = 0;
  const flaky = createGitHub({ fetch: async () => (++calls < 3 ? { status: 502, headers: new Map(), text: async () => "Bad Gateway" } : { status: 200, headers: new Map(), text: async () => "{\"ok\":true}" }), sleep: async () => {} });
  assert.deepEqual(await flaky.get("x"), { ok: true });
  assert.equal(calls, 3);
  let refused = 0;
  const strict = createGitHub({ fetch: async () => (refused++, { status: 404, headers: new Map(), text: async () => "Not Found" }), sleep: async () => {} });
  await assert.rejects(strict.get("x"), (error) => error.status === 404);
  assert.equal(refused, 1);
});

test("the app signs in with a JWT its public key verifies", () => {
  const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048, privateKeyEncoding: { type: "pkcs1", format: "pem" }, publicKeyEncoding: { type: "spki", format: "pem" } });
  const token = appJwt(5773987, privateKey, Date.parse("2026-11-15T20:00:00Z"));
  const [head, payload, signature] = token.split(".");
  const claims = JSON.parse(Buffer.from(payload, "base64url").toString());
  assert.equal(claims.iss, "5773987");
  assert.ok(claims.exp - claims.iat <= 600, "GitHub refuses a token that lives longer than ten minutes");
  assert.ok(createVerify("RSA-SHA256").update(`${head}.${payload}`).verify(publicKey, Buffer.from(signature, "base64url")));
});

test("every installation runs, a failing repository is reported while the rest go on, and a private one is never named in public", async () => {
  const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048, privateKeyEncoding: { type: "pkcs1", format: "pem" }, publicKeyEncoding: { type: "spki", format: "pem" } });
  const ok = (data) => ({ status: 200, headers: new Map(), text: async () => JSON.stringify(data) });
  const fetch = async (url) => {
    const path = url.replace("https://api.github.com/", "");
    if (/releases\/latest$/.test(path)) return ok({ tag_name: "v9.9.9", html_url: "https://example.test/r" });
    if (/\/commits\//.test(path)) return ok({ sha: "a".repeat(40) });
    if (path.startsWith("app/installations?")) return ok([{ id: 1, account: { login: "o" } }]);
    if (path === "app/installations/1/access_tokens") return ok({ token: "inst" });
    if (path.startsWith("installation/repositories")) return ok({ repositories: [{ full_name: "o/broken", private: false }, { full_name: "o/secret", private: true }, { full_name: "o/old", archived: true }, { full_name: "ourostack/ouro-ui" }] });
    if (path === "repos/o/broken") return { status: 500, headers: new Map(), text: async () => "boom" };
    if (path === "repos/o/secret") return ok({ default_branch: "main", private: true, owner: { login: "o" } });
    if (path === "repos/o/secret/git/ref/heads/main") return ok({ object: { sha: "s" } });
    if (path.startsWith("repos/o/secret/git/trees/")) return ok({ sha: "t", tree: [] });
    if (path.startsWith("repos/o/secret/pulls")) return ok([]);
    throw new Error(`no ${path}`);
  };
  const lines = [];
  const report = await keepCurrent({ appId: 1, privateKey, makeGitHub: (options) => createGitHub({ ...options, fetch, sleep: async () => {} }), log: (line) => lines.push(line), now: () => new Date("2026-11-15T20:00:00Z") });
  assert.deepEqual(report.repos.map((repo) => [repo.repo, repo.state]), [["o/broken", "failed"], ["o/secret", "no-pins"]], "archived repositories and Ouro UI itself are skipped");
  assert.match(report.repos[0].error, /500/);
  assert.ok(!lines.join("\n").includes("o/secret"), "the public log never names a private repository");
  const view = publicView({ ...report, repos: [...report.repos, { repo: "o/secret2", private: true, state: "pr", pins: [] }] });
  assert.equal(view.privateRepos, 2);
  assert.ok(!JSON.stringify(view).includes("secret"));
});

test("the pull request's title and body pass Ouro UI's claims check, which a repository may run on pull requests", () => {
  const releases = {
    web: { tag: "v1.3.187", url: "https://github.com/ourostack/ouro-ui/releases/tag/v1.3.187" },
    apple: { tag: "v0.9.0", url: "https://github.com/ourostack/ouro-ui-apple/releases/tag/v0.9.0" },
  };
  const behind = [
    { file: ".github/ouro-hx-installed.json", follows: "web", current: "v1.3.117" },
    { file: "Package.swift", follows: "apple", current: "0.6.0" },
  ];
  const notes = ["Leaves `app/lib/x.ts` at `v1.3.117`, because it is not what the CLI wrote for `v1.3.117` (edited here, or rewritten in a way Ouro Current does not reproduce). Install it again with the CLI, or move the change into Ouro UI.", "Adds what installed items now include: `app/lib/y.ts`.", "Keeps what the registry no longer has: `app/lib/z.ts`."];
  assert.deepEqual(lintPlain(title(behind, releases), { file: "pull request title" }), []);
  assert.deepEqual(lintMarkdown(body(behind, releases, notes), { file: "pull request body" }), []);
});
