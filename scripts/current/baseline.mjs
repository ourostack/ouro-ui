// An update that leaves fewer lint hits in the files it vendors lowers the app's oxlint baseline (oxlint.baseline.json:
// file → rule → count), counted with the oxlint and config the app pins. An app's lint that holds every count to its
// baseline fails when a count falls as well as when it rises, so an update that fixed hits upstream failed the app's
// lint until someone lowered the baseline by hand (spoonjoy-v2#814). A count only ever falls here: one that rises is a
// new hit in what Ouro UI ships, so the baseline stays as it was and the pull request says which count went up.
import { Buffer } from "node:buffer";
import { execFile } from "node:child_process";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, posix, relative, resolve } from "node:path";
import { promisify } from "node:util";

const run = promisify(execFile);
const BASELINE = "oxlint.baseline.json";
const CONFIG = ".oxlintrc.json";
const LINTED = /\.[cm]?[jt]sx?$/;
const UNUSED_DIRECTIVE = /^Unused (?:eslint|oxlint)-disable directive/;
const ourRoot = join(import.meta.dirname, "..", "..");
const code = (text) => `\`${text}\``;
const byCodeUnit = (a, b) => (a < b ? -1 : a > b ? 1 : 0);

/** A hit's rule as the baseline names it: oxlint's code, or the unused directive a lint run that reports them counts. */
const ruleOf = (diagnostic) => diagnostic.code ?? (UNUSED_DIRECTIVE.test(diagnostic.message) ? "unused-disable-directive" : "oxlint");

/** The oxlint version the app pins: an exact version in package.json, or the one its lockfile resolved. */
async function pinnedOxlint(ctx) {
  const manifest = JSON.parse((await ctx.consumerFile("package.json"))?.toString("utf8") ?? "{}");
  const wanted = manifest.devDependencies?.oxlint ?? manifest.dependencies?.oxlint;
  if (!wanted) return null;
  if (/^\d+\.\d+\.\d+$/.test(wanted)) return wanted;
  const pnpm = (await ctx.consumerFile("pnpm-lock.yaml"))?.toString("utf8");
  const npm = (await ctx.consumerFile("package-lock.json"))?.toString("utf8");
  return (pnpm && /^\s+'?oxlint@(\d+\.\d+\.\d+)'?[:(]/m.exec(pnpm)?.[1]) ?? (npm && JSON.parse(npm).packages?.["node_modules/oxlint"]?.version) ?? null;
}

/** Runs that oxlint in `cwd`: the one installed beside Ouro Current when it is that version, else npm's. */
async function oxlint(version, cwd, args) {
  let local = null;
  try {
    if (JSON.parse(await readFile(join(ourRoot, "node_modules", "oxlint", "package.json"), "utf8")).version === version) local = join(ourRoot, "node_modules", ".bin", "oxlint");
  } catch {
    // Not installed here: npm fetches the pinned version.
  }
  const [command, argv] = local ? [local, args] : ["npm", ["exec", "--yes", `--package=oxlint@${version}`, "--", "oxlint", ...args]];
  try {
    return (await run(command, argv, { cwd, timeout: 180_000, maxBuffer: 256 * 1024 * 1024 })).stdout;
  } catch (error) {
    // oxlint exits 1 when it finds a hit, with its report on stdout all the same.
    if (error.stdout?.trim().startsWith("{")) return error.stdout;
    throw error;
  }
}

/** Each changed file's hits, file → rule → count, as the update leaves the files. */
async function count(paths, files, config, version) {
  const dir = await mkdtemp(join(tmpdir(), "ouro-current-lint-"));
  try {
    if (config) await writeFile(join(dir, CONFIG), config);
    for (const path of paths) {
      await mkdir(join(dir, posix.dirname(path)), { recursive: true });
      await writeFile(join(dir, path), Buffer.from(files[path]));
    }
    const { diagnostics } = JSON.parse(await oxlint(version, dir, ["--format", "json", "--report-unused-disable-directives", ...paths]));
    const counts = {};
    for (const diagnostic of diagnostics) {
      const file = relative(dir, resolve(dir, diagnostic.filename)).split("\\").join("/");
      counts[file] ??= {};
      counts[file][ruleOf(diagnostic)] = (counts[file][ruleOf(diagnostic)] ?? 0) + 1;
    }
    return counts;
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

/**
 * The app's baseline with the counts of the files the update changed lowered to what is left in them, and a note for
 * the pull request body: the counts it lowered, the count that rose (the baseline is then as it was), or why it could
 * not count. An app with no baseline, or an update that changes no file oxlint reads, has nothing to lower.
 */
export async function lowerBaseline(files, ctx) {
  const out = {};
  const notes = [];
  const before = await ctx.consumerFile(BASELINE);
  if (!before) return { files: out, notes };
  const paths = [];
  for (const path of Object.keys(files).filter((path) => LINTED.test(path) && !/(^|\/)node_modules\//.test(path)).sort()) {
    const was = await ctx.consumerFile(path);
    if (!was || !was.equals(Buffer.from(files[path]))) paths.push(path);
  }
  if (!paths.length) return { files: out, notes };
  const version = await pinnedOxlint(ctx);
  if (!version) {
    notes.push(`Leaves ${code(BASELINE)} as it was: Ouro Current could not tell which oxlint the repository pins (package.json and its lockfile), so it could not count the hits left in the files this update changes. If the lint fails on a count that fell, run it with --write-baseline and commit the result.`);
    return { files: out, notes };
  }
  const config = (await ctx.consumerFile(CONFIG)) ?? null;
  const counted = `counted with oxlint ${code(version)} and ${config ? code(CONFIG) : "oxlint's default rules"}`;
  let now;
  try {
    now = await count(paths, files, config, version);
  } catch (error) {
    const why = String(error.stderr || error.message).trim().split("\n")[0];
    notes.push(`Leaves ${code(BASELINE)} as it was: counting the hits left in the files this update changes, with oxlint ${code(version)}, failed: ${why.replace(/`/g, "'")}.`);
    return { files: out, notes };
  }
  const baseline = JSON.parse(before.toString("utf8"));
  const rose = [];
  const fell = [];
  for (const path of paths) {
    const was = baseline[path] ?? {};
    const is = now[path] ?? {};
    for (const rule of [...new Set([...Object.keys(was), ...Object.keys(is)])].sort(byCodeUnit)) {
      const from = was[rule] ?? 0;
      const to = is[rule] ?? 0;
      if (to > from) rose.push({ path, rule, from, to });
      else if (to < from) fell.push({ path, rule, from, to });
    }
  }
  if (rose.length) {
    const said = rose.map(({ path, rule, from, to }) => `${code(path)} ${code(rule)} from ${code(from)} to ${code(to)}`).join(", ");
    notes.push(`Leaves ${code(BASELINE)} as it was: this update raises ${said}, ${counted}. That hit is new in what Ouro UI ships, so the repository's lint stays red on it until Ouro UI fixes it.`);
    return { files: out, notes };
  }
  if (!fell.length) return { files: out, notes };
  for (const { path, rule, to } of fell) {
    if (to > 0) baseline[path][rule] = to;
    else delete baseline[path][rule];
    if (Object.keys(baseline[path]).length === 0) delete baseline[path];
  }
  out[BASELINE] = `${JSON.stringify(baseline, null, 2)}\n`;
  const byFile = [...new Set(fell.map(({ path }) => path))].map((path) => `${code(path)} ${fell.filter((one) => one.path === path).map(({ rule, from, to }) => `${code(rule)} ${code(from)} to ${code(to)}`).join(", ")}`);
  notes.push(`Lowers ${code(BASELINE)} to the hits left in the files this update changes, ${counted}, as the repository pins them: ${byFile.join("; ")}.`);
  return { files: out, notes };
}
