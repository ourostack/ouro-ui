// An update that vendors a new ouro-actions generator generates the repository's projections again with it, as the
// repository runs generate, and commits what changed. A newer generator can write different projections from the
// same declarations (core v1.2.0 added `title` and `_meta` to the MCP and WebMCP files), so an update that moved only
// the generator failed the repository's own projections check (ouro-ui-core#123).
import { Buffer } from "node:buffer";
import { execFile } from "node:child_process";
import { mkdtemp, mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, posix } from "node:path";
import { promisify } from "node:util";

const run = promisify(execFile);
const GENERATOR = /(^|\/)ouro-actions\.mts$/;
/**
 * Where a repository says how it runs generate: its package scripts, its workflows, its Makefile or justfile, and a
 * shell script those call, such as ouro-md's `scripts/ouro-actions.sh generate` (ouro-md#215).
 */
const SOURCE = /(^|\/)package\.json$|^\.github\/workflows\/[^/]+\.ya?ml$|^(?:Makefile|makefile|GNUmakefile|justfile|Justfile|\.justfile)$|(^|\/)scripts\/[^/]+\.sh$|^[^/]+\.sh$/;
const SHELL = /\.sh$/;
const ASSIGNMENT = /^\s*(?:export\s+|readonly\s+|local\s+)?([A-Za-z_]\w*)=("([^"`]*)"|'([^']*)'|([^\s"'`;|&]*))\s*(?:#.*)?$/;
const REFERENCE = /\$\{([A-Za-z_]\w*)\}|\$([A-Za-z_]\w*)/g;

/**
 * A shell script with the plain values it assigns written in where it uses them, so `node "$GEN" generate
 * "$DECLARATIONS" "$OUT"` reads as the command it runs. A value that is not plain text (a command's output, an
 * argument, a default) stays a variable, and a command that uses one is not read as a step.
 */
function expandShell(text) {
  const known = new Map();
  const expand = (line) => line.replace(REFERENCE, (all, braced, bare) => known.get(braced ?? bare) ?? all);
  return text.split("\n").map((line) => {
    const assigned = ASSIGNMENT.exec(line);
    if (assigned) {
      const value = expand(assigned[3] ?? assigned[4] ?? assigned[5] ?? "");
      if (!/\$/.test(value)) known.set(assigned[1], value);
      else known.delete(assigned[1]);
      return line;
    }
    return expand(line).replace(/"([^"$]*)"/g, "$1");
  }).join("\n");
}
const notRead = /(^|\/)node_modules\//;
const PATH = String.raw`["']?((?:\.\/)?[\w@.\/-]+)["']?`;
// `<generator> generate|check <declarations> <folder>`: check takes the same two arguments as generate, so either names
// them. A command split over lines with `\` reads as one line.
const COMMAND = new RegExp(String.raw`${PATH}\s+(generate|check)\s+${PATH}\s+${PATH}([^\n]*)`, "g");
const RELATIVE = /(?:\bfrom\s*|\bimport\s*\(\s*|\bimport\s+)["'](\.{1,2}\/[^"']+)["']/g;
const code = (text) => `\`${text}\``;
const list = (paths) => paths.map(code).join(", ");

/** Each way the repository runs one of the moved generators: `{ generator, declarations, folder, targets, from }`. */
async function generateSteps(generators, ctx) {
  const steps = [];
  for (const path of ctx.consumerPaths().filter((path) => SOURCE.test(path) && !notRead.test(path)).sort()) {
    const read = (await ctx.consumerFile(path))?.toString("utf8").replace(/\\\r?\n/g, " ");
    if (!read) continue;
    const text = SHELL.test(path) ? expandShell(read) : read;
    // A package script runs in its package's folder; a workflow, a Makefile or a shell script at the root, where a
    // wrapper like ouro-md's changes to before it runs the generator.
    const cwd = posix.basename(path) === "package.json" ? posix.dirname(path) : ".";
    const at = (relative) => posix.normalize(posix.join(cwd, relative));
    for (const match of text.matchAll(COMMAND)) {
      const generator = at(match[1]);
      if (!generators.includes(generator) || /\$/.test(match[3] + match[4])) continue;
      const targets = /--targets[\s=]+["']?([\w,]+)/.exec(match[5])?.[1];
      const step = { generator, declarations: at(match[3]), folder: at(match[4]).replace(/\/$/, ""), targets: match[2] === "generate" ? targets : undefined, from: path };
      if (!steps.some((other) => other.generator === step.generator && other.declarations === step.declarations && other.folder === step.folder)) steps.push(step);
    }
  }
  return steps;
}

/** The bytes of one repository file as the update leaves it: the update's, or the default branch's. */
const fileOf = async (files, ctx, path) => (path in files ? Buffer.from(files[path]) : await ctx.consumerFile(path));

/** Writes the declarations and every file they import, relatively, into `dir`, as the update leaves them. */
async function copyDeclarations(start, files, ctx, dir) {
  const seen = new Set();
  const queue = [start];
  while (queue.length) {
    const path = queue.shift();
    if (seen.has(path)) continue;
    seen.add(path);
    const bytes = await fileOf(files, ctx, path);
    if (!bytes) throw new Error(`${code(path)} is not in the repository`);
    await mkdir(join(dir, posix.dirname(path)), { recursive: true });
    await writeFile(join(dir, path), bytes);
    if (!/\.[cm]?[jt]sx?$/.test(path)) continue;
    for (const match of bytes.toString("utf8").matchAll(RELATIVE)) queue.push(posix.normalize(posix.join(posix.dirname(path), match[1])));
  }
}

/** Runs one step's generate with the update's generator; returns the projections whose bytes it changed. */
async function generateOnce(step, files, ctx) {
  const dir = await mkdtemp(join(tmpdir(), "ouro-current-generate-"));
  try {
    await copyDeclarations(step.generator, files, ctx, dir);
    await copyDeclarations(step.declarations, files, ctx, dir);
    const args = [step.generator, "generate", step.declarations, step.folder, ...(step.targets ? ["--targets", step.targets] : [])];
    await run(process.execPath, args, { cwd: dir, timeout: 120_000 });
    const changed = {};
    for (const name of (await readdir(join(dir, step.folder))).sort()) {
      const path = `${step.folder}/${name}`;
      const bytes = await readFile(join(dir, path));
      const before = await fileOf(files, ctx, path);
      if (!before || !before.equals(bytes)) changed[path] = bytes;
    }
    return changed;
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

/**
 * The projections an update's new generators write, with a note for the pull request body for each generator: what it
 * generated and changed, that it found no generate step, or why generate failed. A generator the update does not move
 * has nothing to generate.
 */
export async function regenerate(files, ctx) {
  const generators = [];
  for (const path of Object.keys(files).filter((path) => GENERATOR.test(path)).sort()) {
    const before = await ctx.consumerFile(path);
    if (!before || !before.equals(Buffer.from(files[path]))) generators.push(path);
  }
  const out = {};
  const notes = [];
  if (!generators.length) return { files: out, notes };
  const steps = await generateSteps(generators, ctx);
  for (const generator of generators) {
    const mine = steps.filter((step) => step.generator === generator);
    if (!mine.length) {
      notes.push(`Leaves the projections as they were: Ouro Current reads how a repository runs \`generate\` from its package scripts, workflows, Makefile and shell scripts, and could not find a step that runs ${code(generator)}. Run \`node ${generator} generate <declarations> <folder>\` and commit what changes, or the projections check can fail on this update.`);
      continue;
    }
    for (const step of mine) {
      try {
        const changed = await generateOnce(step, files, ctx);
        Object.assign(out, changed);
        const paths = Object.keys(changed).sort();
        notes.push(`Runs \`generate\` with the new ${code(generator)} on ${code(step.declarations)}, as ${code(step.from)} does, and commits what it changed: ${paths.length ? list(paths) : "nothing, since the projections are already what it writes"}.`);
      } catch (error) {
        const why = String(error.stderr || error.message).trim().split("\n")[0];
        notes.push(`Running \`generate\` with the new ${code(generator)} on ${code(step.declarations)}, as ${code(step.from)} does, failed: ${why.replace(/`/g, "'")}. The projections are as they were; run it and commit what changes.`);
      }
    }
  }
  return { files: out, notes };
}
