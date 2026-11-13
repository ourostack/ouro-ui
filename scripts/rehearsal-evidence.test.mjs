import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { cpSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { describe, findEvidence, main, MAX_COMMITS, NOTES_FILES, releaseCommit, reusable, runGit } from "./rehearsal-evidence.mjs";
import { scratchDir } from "./scratch.mjs";
import { copyTree } from "./tree.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const registry = JSON.parse(readFileSync(join(root, "registry.json"), "utf8"));
const shipped = new Set(registry.items.flatMap((item) => (item.files ?? []).map((file) => file.path)));
const passes = (files) => files.filter((path) => !reusable(path, shipped).ok);

test("a rehearsal is reused across the test-only and record-only changes main merged recently, and across nothing else", () => {
  // The files of recent commits on main, as `git diff-tree --name-only -r <commit>` lists them.
  // Tests and records that ship nowhere: each would have kept the rehearsal before it.
  assert.deepEqual(passes(["test/current-page.test.tsx"]), [], "3c4adda8 (#439), a shared suite");
  assert.deepEqual(passes(["test/conformance/commands.ts", "test/conformance/forced-colors.test.tsx"]), [], "c4974557 (#396), the conformance harness");
  assert.deepEqual(passes(["docs/decisions/2026-10-30-ouro-ax.md", "docs/decisions/2026-10-30-ouro-ax/evidence/flow-results.json", "AGENTS.md", "site/e2e/latency-evidence/2026-11-01-museum-organ-ab.txt"]), []);
  // A component's own test ships, in its <name>-tests item, so it needs a rehearsal of its own.
  assert.ok(shipped.has("registry/ouro/components/ouro/select/select.test.tsx"));
  assert.deepEqual(passes(["registry/ouro/components/ouro/select/select.test.tsx"]), ["registry/ouro/components/ouro/select/select.test.tsx"], "094e848a (#409)");
  // A workflow, a script, a change fragment, the site, configuration and dependencies.
  assert.deepEqual(passes([".github/workflows/flow-review.yml", "flows/README.md", "scripts/workflows.test.mjs"]), [".github/workflows/flow-review.yml", "flows/README.md"], "b5b24cf0 (#407)");
  assert.deepEqual(passes(["changes/ax-number-flag-nearest.md", "registry/ouro/ax/command.test.mts", "registry/ouro/ax/command.ts"]).length, 3, "b9e36f37 (#403)");
  assert.deepEqual(passes(["AGENTS.md", "site/e2e/latency-evidence/2026-11-01-museum-organ-traces.txt", "site/src/voyage/chapters/chapter-three.tsx"]), ["site/src/voyage/chapters/chapter-three.tsx"], "41581f12");
  assert.deepEqual(passes([".github/workflows/ci.yml", ".gitignore", "AGENTS.md", "package.json", "scripts/control-matrix.mts", "scripts/control-matrix.test.mjs", "test/generated/control-matrix.json", "vitest.config.ts"]), [".github/workflows/ci.yml", ".gitignore", "package.json", "scripts/control-matrix.mts", "vitest.config.ts"], "566f2135 (#311)");
  assert.deepEqual(passes(["site/src/pages/voyage.tsx", "site/src/voyage/chapters/island.tsx"]).length, 2, "bf6d472d (#431)");
});

test("nothing that ships, feeds what ships or runs the release is reused across, whatever its name", () => {
  const refused = [
    "registry.json",
    "registry/ouro/lib/ouro/dev.test.ts", // a test, but the release commit writes its tag into it, and it ships
    "registry/ouro/e2e/ouro/table.spec.ts",
    "registry/ouro/components/ouro/dialog/__screenshots__/x.png",
    "changes/a.md",
    ".github/quarantine.json",
    ".github/workflows/release.yml",
    "test/install-fixture/src/App.tsx", // the release-only install-latest job installs into it
    "test/install-fixture-next/package.json",
    "README.md",
    "UPGRADING.md",
    "CHANGES.md",
    "docs/Dialog.md", // generated, feeds registry.json's descriptions and the site
    "docs/guides/installing.md", // the release commit writes its tag into it
    "docs/guides/claims.md", // the site publishes the guides
    "docs/ax/ax-outcome.md",
    "site/public/llms.txt",
    "site/src/docs/pages.json",
    "stories/reference.stories.tsx",
    "scripts/release-commit.sh",
    "scripts/fixtures/x.json",
    "package.json",
    "pnpm-lock.yaml",
    "pnpm-workspace.yaml",
    "tsconfig.json",
    "tsconfig.registry.json",
    "vitest.config.ts",
    "site/vite.config.ts",
    "site/index.html",
    "site/src/app.tsx",
    "site/scripts/prerender.mts",
    "scripts/namespace.sh",
    "scripts/registry.mts",
    "playwright.config.ts",
    ".storybook/main.ts",
    "app.css",
    "claims.config.json",
    ".gitattributes",
    "LICENSE",
  ];
  for (const path of refused) assert.equal(reusable(path, shipped).ok, false, path);
  // A file an item ships is refused even under a name that passes.
  assert.equal(reusable("test/helper.test.ts").ok, true);
  assert.deepEqual(reusable("test/helper.test.ts", new Set(["test/helper.test.ts"])), { ok: false, why: "an item in registry.json ships it" });
  for (const path of ["test/stories.tsx", "test/__screenshots__/a-linux.png", "site/e2e/toasts.ts", "site/src/site.test.tsx", "site/scripts/art.test.mjs", "scripts/workflows.test.mjs", "scripts/__tests__/x.mjs", "docs/decisions/x/evidence/y.html"]) {
    assert.equal(reusable(path, shipped).ok, true, path);
  }
  // Every file a registry item names is under registry/, which is refused whole.
  assert.deepEqual([...shipped].filter((path) => !path.startsWith("registry/")), []);
});

/** A git repository in a scratch folder, with `commit(files)` writing (null deletes) and committing, and returning the commit. */
function repo(prefix = "ouro-rehearsal-") {
  const dir = scratchDir(prefix);
  const env = { ...process.env, GIT_AUTHOR_NAME: "t", GIT_AUTHOR_EMAIL: "t@example.com", GIT_COMMITTER_NAME: "t", GIT_COMMITTER_EMAIL: "t@example.com", GIT_CONFIG_NOSYSTEM: "1" };
  const git = (...args) => {
    const result = spawnSync("git", ["-c", "commit.gpgsign=false", "-c", "core.hooksPath=/dev/null", ...args], { cwd: dir, encoding: "utf8", env });
    assert.equal(result.status, 0, `git ${args.join(" ")}: ${result.stderr}`);
    return result.stdout.trim();
  };
  git("init", "-q", "-b", "main");
  const commit = (files) => {
    for (const [path, text] of Object.entries(files)) {
      if (text === null) {
        git("rm", "-q", path);
        continue;
      }
      mkdirSync(dirname(join(dir, path)), { recursive: true });
      writeFileSync(join(dir, path), text);
      git("add", path);
    }
    git("commit", "-q", "--allow-empty", "-m", "c");
    return git("rev-parse", "HEAD");
  };
  return { dir, git, commit };
}

const itemFiles = (...paths) => `${JSON.stringify({ items: [{ name: "a", files: paths.map((path) => ({ path })) }] })}\n`;
const now = Date.parse("2026-11-02T03:00:00Z");
const hoursAgo = (hours) => new Date(now - hours * 3_600_000).toISOString();
const run = (databaseId, headSha, { conclusion = "success", status = "completed", tag = "v1.3.2", createdAt = hoursAgo(1) } = {}) => ({ databaseId, headSha, status, conclusion, displayTitle: `Release rehearsal ${tag}`, createdAt });

test("findEvidence takes the newest rehearsal on the commit itself, as Release always has", () => {
  const { dir, commit } = repo();
  const t = commit({ "registry.json": itemFiles("registry/a.tsx"), "registry/a.tsx": "a\n" });
  const find = (runs) => findEvidence({ tag: "v1.3.2", sha: t, runs, git: runGit(dir), now });
  const exact = find([run(7, t)]);
  assert.deepEqual(exact, { ok: true, run: run(7, t), rehearsed: t, commits: 0, files: [] });
  // On the commit itself any age holds, as before.
  assert.equal(find([run(7, t, { createdAt: hoursAgo(500) })]).ok, true);
  // The newest decides: a failure after a pass, or one still running, refuses it.
  assert.match(find([run(8, t, { conclusion: "failure" }), run(7, t)]).reason, /run 8, is 'failure', not success/);
  assert.match(find([run(7, t), run(9, t, { status: "in_progress", conclusion: "" })]).reason, /run 9, is 'in_progress', not success/);
  assert.match(find([run(7, t, { conclusion: "cancelled" })]).reason, /'cancelled'/);
  // Another version's rehearsal is not this one's.
  assert.match(find([run(7, t, { tag: "v1.3.1" })]).reason, /no rehearsal of v1\.3\.2 has run/);
  assert.match(find([]).reason, /no rehearsal of v1\.3\.2 has run/);
  // Unreadable input refuses it.
  assert.equal(findEvidence({ tag: "1.3.2", sha: t, runs: [], git: runGit(dir), now }).ok, false);
  assert.equal(findEvidence({ tag: "v1.3.2", sha: "abc", runs: [], git: runGit(dir), now }).ok, false);
  assert.equal(findEvidence({ tag: "v1.3.2", sha: t, runs: {}, git: runGit(dir), now }).ok, false);
  assert.match(find([{ ...run(7, t), databaseId: "7" }]).reason, /no readable id or commit/);
});

test("findEvidence reuses a rehearsal on an earlier commit of main only across tests and records, only the newest, and only within its bounds", () => {
  const { dir, git, commit } = repo();
  const r = commit({ "registry.json": itemFiles("registry/a.tsx", "registry/a.test.tsx"), "registry/a.tsx": "a\n", "registry/a.test.tsx": "t\n", "test/s.test.tsx": "s\n" });
  const m = commit({ "test/s.test.tsx": "s2\n", "test/new.ts": "n\n" });
  const t = commit({ "AGENTS.md": "agents\n", "docs/decisions/d.md": "d\n" });
  const find = (runs, sha = t, options = {}) => findEvidence({ tag: "v1.3.2", sha, runs, git: runGit(dir), now, ...options });
  const reused = find([run(7, r), run(6, r, { conclusion: "failure" }), run(9, t, { tag: "v1.3.1", conclusion: "failure" })]);
  assert.equal(reused.ok, true, reused.reason);
  assert.equal(reused.rehearsed, r);
  assert.equal(reused.run.databaseId, 7);
  assert.equal(reused.commits, 2);
  assert.deepEqual(reused.files.map(({ path }) => path), ["AGENTS.md", "docs/decisions/d.md", "test/new.ts", "test/s.test.tsx"]);
  // The newest rehearsal before T decides: one that failed, or is running, on a later commit refuses it.
  assert.match(find([run(7, r), run(8, m, { conclusion: "failure" })]).reason, /run 8 on [0-9a-f]{40}, is 'failure', not success/);
  assert.match(find([run(7, r), run(8, m, { status: "queued", conclusion: "" })]).reason, /is 'queued'/);
  assert.equal(find([run(8, m), run(7, r, { conclusion: "failure" })]).rehearsed, m);
  // Bounds: 24 hours from the rehearsal's start, MAX_COMMITS commits.
  assert.equal(find([run(7, r, { createdAt: hoursAgo(23.9) })]).ok, true);
  assert.match(find([run(7, r, { createdAt: hoursAgo(24.1) })]).reason, /started 24\.1 hours ago, over the 24 hours/);
  assert.match(find([run(7, r, { createdAt: "soon" })]).reason, /unreadable time/);
  assert.match(find([run(7, r)], t, { maxCommits: 1 }).reason, /up to 1 commits before it/);
  assert.equal(find([run(7, m)], t, { maxCommits: 1 }).ok, true);
  assert.equal(MAX_COMMITS, 50);
  // A rehearsal on a commit main does not hold (another branch's) is no evidence for it.
  git("switch", "-q", "-c", "side", r);
  const side = commit({ "test/x.test.ts": "x\n" });
  git("switch", "-q", "main");
  assert.match(find([run(7, side)]).reason, /no rehearsal of v1\.3\.2 ran on main/);
  // A commit unknown here is too far back: no evidence, no error.
  assert.match(find([run(7, "f".repeat(40))]).reason, /no rehearsal of v1\.3\.2 ran on main/);

  // Anything else in the diff refuses it, by name and why.
  const refused = (files) => {
    const sha = commit(files);
    const result = find([run(7, r)], sha);
    git("reset", "-q", "--hard", t);
    return result;
  };
  assert.match(refused({ "registry/a.tsx": "b\n" }).reason, /in 1 file\(s\) that may ship: registry\/a\.tsx \(an item in registry\.json ships it\)/);
  assert.match(refused({ "registry/a.test.tsx": "t2\n" }).reason, /registry\/a\.test\.tsx \(an item in registry\.json ships it\)/);
  assert.match(refused({ "changes/fix.md": "- A fix.\n" }).reason, /changes\/fix\.md \(change fragments are the release notes/);
  assert.match(refused({ "package.json": "{}\n", "test/y.test.ts": "y\n" }).reason, /in 1 file\(s\) that may ship: package\.json/);
  assert.match(refused({ ".github/workflows/release.yml": "x\n" }).reason, /\.github\/workflows\/release\.yml/);
  // Scripts, dependencies, TypeScript and build configuration, and the site: each alone, beside a test, refuses it.
  for (const path of ["scripts/release-commit.sh", "package.json", "pnpm-lock.yaml", "tsconfig.json", "tsconfig.registry.json", "vitest.config.ts", "site/vite.config.ts", "site/src/app.tsx", "site/public/llms.txt"]) {
    const result = refused({ [path]: "x\n", "test/z.test.ts": "z\n" });
    assert.equal(result.ok, false, path);
    assert.ok(result.reason.includes(`in 1 file(s) that may ship: ${path} (`), result.reason);
  }
  assert.match(refused({ "README.md": "x\n" }).reason, /README\.md \(the release commit writes/);
  // A deletion, and each side of a rename, count as changes.
  assert.match(refused({ "registry/a.tsx": null }).reason, /registry\/a\.tsx/);
  git("mv", "registry/a.tsx", "test/a.tsx");
  assert.match(refused({}).reason, /in 1 file\(s\) that may ship: registry\/a\.tsx/);
  // A file an item ships at T, though it did not at R, is refused under any name.
  assert.match(refused({ "registry.json": itemFiles("registry/a.tsx", "test/kit.test.ts"), "test/kit.test.ts": "k\n" }).reason, /registry\.json \(registry\.json is the registry\); test\/kit\.test\.ts \(an item in registry\.json ships it\)/);
});

test("releaseCommit releases the commit a passing rehearsal tested, main's head or an earlier commit of main, whatever merged after it", () => {
  const { dir, git, commit } = repo();
  const r = commit({ "registry.json": itemFiles("registry/a.tsx"), "registry/a.tsx": "a\n" });
  const m = commit({ "registry/a.tsx": "b\n", "changes/b.md": "- B.\n" });
  const head = commit({ "package.json": "{}\n" });
  const pick = (runs, options = {}) => releaseCommit({ tag: "v1.3.2", head, runs, git: runGit(dir), now, ...options });
  // A passing rehearsal on main's head releases the head, at any age.
  assert.deepEqual(pick([run(7, r), run(8, head, { createdAt: hoursAgo(500) })]), { ok: true, run: run(8, head, { createdAt: hoursAgo(500) }), sha: head });
  // Else the newest commit of main whose newest rehearsal passed, whatever shipped after it.
  assert.equal(pick([run(7, r), run(8, m), run(9, head, { status: "in_progress", conclusion: "" })]).sha, m);
  assert.equal(pick([run(7, r), run(8, m, { conclusion: "failure" })]).sha, r, "a commit whose newest rehearsal failed is passed over");
  assert.equal(pick([run(8, m), run(7, m, { conclusion: "failure" })]).sha, m, "an older failure on the same commit does not count");
  assert.match(pick([run(9, m, { conclusion: "failure" }), run(8, m)]).reason, /no commit's newest rehearsal of v1\.3\.2 passed/);
  // Bounds: 24 hours from an earlier commit's rehearsal, MAX_COMMITS commits, and main's history only.
  assert.equal(pick([run(7, r), run(8, m, { createdAt: hoursAgo(24.1) })]).sha, r);
  assert.match(pick([run(8, m)], { maxCommits: 0 }).reason, /no passing rehearsal of v1\.3\.2 is on main \([0-9a-f]{40}\) or on a commit of main up to 0 commits before it, started in the last 24 hours/);
  git("switch", "-q", "-c", "side", r);
  const side = commit({ "test/x.test.ts": "x\n" });
  git("switch", "-q", "main");
  assert.equal(pick([run(7, r), run(9, side)]).sha, r);
  assert.equal(pick([run(9, "f".repeat(40)), run(7, r)]).sha, r, "a commit unknown here is too far back");
  // Another version, or input it cannot read, releases nothing.
  assert.equal(pick([run(8, head, { tag: "v1.3.1" })]).ok, false);
  assert.equal(releaseCommit({ tag: "1.3.2", head, runs: [], git: runGit(dir), now }).ok, false);
  assert.equal(releaseCommit({ tag: "v1.3.2", head: "abc", runs: [], git: runGit(dir), now }).ok, false);
  assert.equal(releaseCommit({ tag: "v1.3.2", head, runs: {}, git: runGit(dir), now }).ok, false);
  assert.match(pick([{ ...run(7, r), databaseId: "7" }]).reason, /no readable id or commit/);
  // The command prints the commit, and fails closed.
  const runsFile = join(dir, "runs.json");
  writeFileSync(runsFile, JSON.stringify([run(8, m, { createdAt: new Date().toISOString() })]));
  const lines = { out: [], log: [] };
  const env = { GITHUB_REPOSITORY: "o/r" };
  assert.equal(main(["pick", "v1.3.2", head, "--runs", runsFile], { env, cwd: dir, out: (line) => lines.out.push(line), log: (line) => lines.log.push(line) }), 0);
  assert.deepEqual(lines.out, [m]);
  assert.match(lines.log.join("\n"), /^Releasing v1\.3\.2 from [0-9a-f]{40}, the commit rehearsal run 8 tested; main's head is [0-9a-f]{40}\.$/);
  writeFileSync(runsFile, "[]");
  assert.equal(main(["pick", "v1.3.2", head, "--runs", runsFile], { env, cwd: dir, out: () => {}, log: (line) => lines.log.push(line) }), 1);
  assert.match(lines.log.at(-1), /^::error::No commit to release v1\.3\.2 from: no commit's newest rehearsal/);
  assert.equal(main(["pick", "v1.3.2"], { env, cwd: dir, out: () => {}, log: (line) => lines.log.push(line) }), 1);
  assert.match(lines.log.at(-1), /usage: rehearsal-evidence\.mjs pick/);
});

test("findEvidence deepens a shallow checkout to find the earlier commit, leaves a full one whole, and stops on a git error", () => {
  const origin = repo("ouro-rehearsal-origin-");
  const r = origin.commit({ "registry.json": itemFiles("registry/a.tsx"), "registry/a.tsx": "a\n" });
  origin.commit({ "test/a.test.ts": "1\n" });
  const t = origin.commit({ "test/a.test.ts": "2\n" });
  const clone = scratchDir("ouro-rehearsal-clone-");
  assert.equal(spawnSync("git", ["clone", "-q", "--depth", "1", "--branch", "main", `file://${origin.dir}`, clone], { encoding: "utf8" }).status, 0);
  const git = runGit(clone);
  assert.notEqual(git(["cat-file", "-e", `${r}^{commit}`]).status, 0, "the clone does not hold R yet");
  const reused = findEvidence({ tag: "v1.3.2", sha: t, runs: [run(7, r)], git, now });
  assert.equal(reused.ok, true, reused.reason);
  assert.equal(reused.commits, 2);
  assert.equal(git(["cat-file", "-e", `${r}^{commit}`]).status, 0, "the clone was deepened to R");
  // A full checkout is never fetched into, nor made shallow.
  const calls = [];
  const logged = (args) => {
    calls.push(args.join(" "));
    return runGit(origin.dir)(args);
  };
  assert.equal(findEvidence({ tag: "v1.3.2", sha: t, runs: [run(7, r)], git: logged, now }).ok, true);
  assert.deepEqual(calls.filter((call) => call.startsWith("fetch")), []);
  // A git call that fails throws, and main reports it as refusing the rehearsal.
  const broken = (args) => (args[0] === "diff" ? { status: 128, stdout: "", stderr: "fatal: bad object" } : runGit(origin.dir)(args));
  assert.throws(() => findEvidence({ tag: "v1.3.2", sha: t, runs: [run(7, r)], git: broken, now }), /git diff --name-only --no-renames -z [0-9a-f]+ [0-9a-f]+ failed: fatal: bad object/);
  const shallowBroken = (args) => (args[0] === "fetch" ? { status: 128, stdout: "", stderr: "fatal: no remote" } : args[0] === "rev-parse" ? { status: 0, stdout: "true\n", stderr: "" } : runGit(origin.dir)(args));
  assert.throws(() => findEvidence({ tag: "v1.3.2", sha: t, runs: [run(7, r)], git: shallowBroken, now }), /git fetch .* failed: fatal: no remote/);
  const ancestry = (args) => (args[0] === "merge-base" ? { status: 128, stdout: "", stderr: "fatal" } : runGit(origin.dir)(args));
  assert.throws(() => findEvidence({ tag: "v1.3.2", sha: t, runs: [run(7, r)], git: ancestry, now }), /merge-base --is-ancestor/);
});

test("the summary lists every file and links the run and the diff; the release notes list at most NOTES_FILES", () => {
  const sha = "b".repeat(40);
  const rehearsed = "a".repeat(40);
  const context = { sha, tag: "v1.3.2", server: "https://github.com", repo: "o/r" };
  const exact = describe({ run: { databaseId: 7 }, rehearsed: sha, commits: 0, files: [] }, context);
  assert.equal(exact.notes, `Rehearsed: [the rehearsal of v1.3.2](https://github.com/o/r/actions/runs/7) passed on main's commit \`${sha}\`, which this release is cut from.\n`);
  assert.equal(exact.summary, exact.notes);
  const files = Array.from({ length: NOTES_FILES + 5 }, (_, index) => ({ path: `test/${index}.test.ts`, why: "a test file" }));
  const reused = describe({ run: { databaseId: 7 }, rehearsed, commits: 3, files }, context);
  for (const text of [reused.summary, reused.notes]) {
    assert.match(text, new RegExp(`^Rehearsed: \\[the rehearsal of v1\\.3\\.2\\]\\(https://github\\.com/o/r/actions/runs/7\\) passed on main's commit \`${rehearsed}\`, 3 commit\\(s\\) before \`${sha}\`, which this release is cut from\\. They differ only in ${NOTES_FILES + 5} file\\(s\\)`));
    assert.ok(text.includes(`(https://github.com/o/r/compare/${rehearsed}...${sha})`));
  }
  assert.equal(reused.summary.split("\n").filter((line) => line.startsWith("- `")).length, NOTES_FILES + 5);
  assert.equal(reused.notes.split("\n").filter((line) => line.startsWith("- `")).length, NOTES_FILES);
  assert.match(reused.notes, /^- and 5 more, in the diff$/m);
});

test("the command prints the run, writes the summary and the notes, and fails closed on anything it cannot read", () => {
  const { dir, commit } = repo();
  const r = commit({ "registry.json": itemFiles("registry/a.tsx"), "registry/a.tsx": "a\n" });
  const t = commit({ "test/a.test.ts": "1\n" });
  const files = scratchDir("ouro-rehearsal-cli-");
  const runsFile = join(files, "runs.json");
  const summary = join(files, "summary.md");
  const notes = join(files, "notes.md");
  const call = (args, { runs = [run(7, r)], env = {} } = {}) => {
    writeFileSync(runsFile, typeof runs === "string" ? runs : JSON.stringify(runs));
    writeFileSync(summary, "");
    writeFileSync(notes, "");
    const out = [];
    const log = [];
    const status = main(args, { env: { GITHUB_REPOSITORY: "o/r", GITHUB_STEP_SUMMARY: summary, ...env }, cwd: dir, now, out: (line) => out.push(line), log: (line) => log.push(line) });
    return { status, out: out.join("\n"), log: log.join("\n"), summary: readFileSync(summary, "utf8"), notes: readFileSync(notes, "utf8") };
  };
  const green = call(["v1.3.2", t, "--notes", notes, "--runs", runsFile]);
  assert.equal(green.status, 0, green.log);
  assert.equal(green.out, "7");
  assert.match(green.summary, /^Rehearsed: \[the rehearsal of v1\.3\.2\]\(https:\/\/github\.com\/o\/r\/actions\/runs\/7\) passed on main's commit `[0-9a-f]{40}`, 1 commit\(s\) before/);
  assert.match(green.summary, /^- `test\/a\.test\.ts`: the shared test suites and their data \(test\/\)$/m);
  assert.equal(green.notes, green.summary);
  // Refused: an error names why and how to rehearse, and nothing is written.
  const red = call(["v1.3.2", t, "--notes", notes, "--runs", runsFile], { runs: [run(7, r, { conclusion: "failure" })] });
  assert.equal(red.status, 1);
  assert.match(red.log, /^::error::No rehearsal holds for v1\.3\.2 on main \([0-9a-f]{40}\): the newest rehearsal of v1\.3\.2 before main [^\n]+'failure', not success\. Rehearse main's head: gh workflow run release-rehearsal\.yml -f version=1\.3\.2$/);
  assert.equal(red.out, "");
  assert.equal(red.summary, "");
  assert.equal(red.notes, "");
  // Unreadable runs, no repository, a bad call: errors, not a pass.
  assert.match(call(["v1.3.2", t, "--runs", runsFile], { runs: "not json" }).log, /^::error::Could not tell whether a rehearsal holds: /);
  assert.equal(call(["v1.3.2", t, "--runs", runsFile], { env: { GITHUB_REPOSITORY: "" } }).status, 1);
  assert.equal(call(["v1.3.2", "--runs", runsFile]).status, 1);
  assert.equal(call(["v1.3.2", t, "--notes"]).status, 1);
  // Without --runs it asks gh; a gh that fails refuses the rehearsal.
  const bin = scratchDir("ouro-rehearsal-gh-");
  writeFileSync(join(bin, "gh"), "#!/usr/bin/env bash\necho 'HTTP 502' >&2\nexit 1\n", { mode: 0o755 });
  const result = spawnSync(process.execPath, [join(root, "scripts/rehearsal-evidence.mjs"), "v1.3.2", t], { cwd: dir, encoding: "utf8", env: { ...process.env, PATH: `${bin}:${process.env.PATH}`, GITHUB_REPOSITORY: "o/r", GITHUB_STEP_SUMMARY: "" } });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /^::error::Could not tell whether a rehearsal holds: gh run list failed: HTTP 502$/m);
  assert.equal(result.stdout, "");
});

/** The `run: |` script of release.yml's step with this name, de-indented. */
function releaseStep(name) {
  const release = readFileSync(join(root, ".github/workflows/release.yml"), "utf8");
  const start = release.search(new RegExp(`^ {6}(- | {2})name: ${name.replace(/[?()]/g, "\\$&")}\n`, "m"));
  assert.notEqual(start, -1, `no step named ${name}`);
  const lines = release.slice(start).split("        run: |\n")[1].split("\n");
  const end = lines.findIndex((line) => line !== "" && !line.startsWith(" ".repeat(10)));
  return lines.slice(0, end === -1 ? undefined : end).map((line) => line.slice(10)).join("\n");
}

test("Release's check, end to end on a shallow checkout of main: it releases the commit a passing rehearsal tested, records it, and refuses when none passed", () => {
  // Main: R (rehearsed), then later merges; the checkout is a depth-1 clone of it, as
  // actions/checkout makes. gh stands in for GitHub: main's rules require ci, which run 6 passed
  // on main's commit, with no run of main's own; the rehearsal runs are $RUNS.
  const origin = repo("ouro-release-reuse-origin-");
  const r = origin.commit({ "registry.json": itemFiles("registry/a.tsx", "registry/a.test.tsx"), "registry/a.tsx": "a\n", "registry/a.test.tsx": "t\n" });
  origin.commit({ "test/s.test.tsx": "s\n" });
  const bin = scratchDir("ouro-release-reuse-gh-");
  writeFileSync(
    join(bin, "gh"),
    `#!/usr/bin/env bash
case "$*" in
  "run list --workflow release-rehearsal.yml "*) cat "$RUNS" ;;
  "run list --workflow "*"// empty"*) ;;
  "run list --workflow "*) echo 6 ;;
  "run view 6 "*) echo completed ;;
  "api repos/o/r/rules/branches/main "*) echo ci ;;
  "api repos/o/r/actions/runs/6/jobs"*) printf 'ci\\tsuccess\\n' ;;
  *) exit 1 ;;
esac
`,
    { mode: 0o755 },
  );
  const release = (files, runs) => {
    const t = origin.commit(files);
    const checkout = scratchDir("ouro-release-reuse-checkout-");
    assert.equal(spawnSync("git", ["clone", "-q", "--depth", "1", "--branch", "main", `file://${origin.dir}`, checkout], { encoding: "utf8" }).status, 0);
    // The checkout's scripts and workflows are this repository's, outside its history.
    mkdirSync(join(checkout, "scripts"));
    for (const file of ["rehearsal-evidence.mjs", "latest-release.mjs", "required-producers.mjs", "required-ci.sh", "quarantine.mjs", "ci-budget.mjs"]) cpSync(join(root, "scripts", file), join(checkout, "scripts", file));
    copyTree(join(root, ".github"), join(checkout, ".github"));
    const temp = scratchDir("ouro-release-reuse-temp-");
    for (const file of ["runs.json", "summary.md", "output.txt", "env.txt"]) writeFileSync(join(temp, file), file === "runs.json" ? JSON.stringify(runs(t)) : "");
    const stubs = `git() { case "$1" in ls-remote) return 1 ;; *) command git "$@" ;; esac; }\n`;
    const result = spawnSync("bash", ["-e", "-o", "pipefail", "-c", stubs + releaseStep("Check the version, the tag and main's CI")], {
      cwd: checkout,
      encoding: "utf8",
      env: { ...process.env, PATH: `${bin}:${process.env.PATH}`, RUNS: join(temp, "runs.json"), VERSION: "1.3.2", TAG: "v1.3.2", GITHUB_REPOSITORY: "o/r", GITHUB_SERVER_URL: "https://github.com", GITHUB_OUTPUT: join(temp, "output.txt"), GITHUB_ENV: join(temp, "env.txt"), GITHUB_STEP_SUMMARY: join(temp, "summary.md"), RUNNER_TEMP: temp, POLL_SECONDS: "0" },
    });
    const read = (file) => (spawnSync("test", ["-f", join(temp, file)]).status === 0 ? readFileSync(join(temp, file), "utf8") : undefined);
    return { ...result, t, summary: read("summary.md"), notes: read("rehearsal.md"), env: read("env.txt"), output: read("output.txt") };
  };
  // A component and a test merged since the rehearsal: R is released, and they go out next time.
  const later = release({ "registry/a.tsx": "b\n", "registry/a.test.tsx": "t2\n", "AGENTS.md": "a\n" }, () => [run(7, r, { createdAt: new Date(Date.now() - 3_600_000).toISOString() }), run(9, r, { tag: "v1.3.1", conclusion: "failure" })]);
  assert.equal(later.status, 0, later.stdout + later.stderr);
  assert.match(later.env, new RegExp(`^MAIN_SHA=${r}$`, "m"));
  assert.match(later.output, /^new=true$/m);
  assert.match(later.stderr, new RegExp(`^Releasing v1\\.3\\.2 from ${r}, the commit rehearsal run 7 tested; main's head is ${later.t}\\.$`, "m"));
  for (const text of [later.summary, later.notes]) assert.ok(text.includes(`[the rehearsal of v1.3.2](https://github.com/o/r/actions/runs/7) passed on main's commit \`${r}\`, which this release is cut from.`), text);
  // The rehearsal's retries are read from that run.
  assert.match(later.stdout, /^::warning::Could not read the jobs of the rehearsal https:\/\/github\.com\/o\/r\/actions\/runs\/7, /m);
  // A rehearsal on main's head releases the head, at any age.
  const exact = release({ "test/x.test.ts": "x\n" }, (t) => [run(7, r), run(8, t, { createdAt: "2020-01-01T00:00:00Z" })]);
  assert.equal(exact.status, 0, exact.stdout + exact.stderr);
  assert.match(exact.env, new RegExp(`^MAIN_SHA=${exact.t}$`, "m"));
  assert.match(exact.notes, /^Rehearsed: \[the rehearsal of v1\.3\.2\]\(https:\/\/github\.com\/o\/r\/actions\/runs\/8\) passed on main's commit `[0-9a-f]{40}`, which this release is cut from\.\n$/);
  // With no passing rehearsal, or none GitHub can list, the release stops before anything is cut, saying why.
  const failed = release({ "test/y.test.ts": "y\n" }, () => [run(7, r, { conclusion: "failure", createdAt: new Date().toISOString() })]);
  assert.equal(failed.status, 1);
  assert.match(failed.stderr, /^::error::No commit to release v1\.3\.2 from: no commit's newest rehearsal of v1\.3\.2 passed\./m);
  assert.match(failed.stdout, /^::error::No passing rehearsal of v1\.3\.2 on main to release\. Run it first: gh workflow run release-rehearsal\.yml -f version=1\.3\.2$/m);
  assert.doesNotMatch(failed.env, /MAIN_SHA/);
  assert.equal(failed.notes, undefined);
  const unlisted = release({ "test/z.test.ts": "z\n" }, () => "not a list");
  assert.equal(unlisted.status, 1);
  assert.match(unlisted.stderr, /^::error::No commit to release v1\.3\.2 from: the rehearsal runs are not a list\./m);
});
