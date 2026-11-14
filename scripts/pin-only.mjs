// The docs pin is the commit docs-pin.yml makes on main: `node scripts/latest-release.mjs set <tag>`
// and `pnpm run docs`. Release auto must not release it, because nothing in it ships.
//
// A commit is a pin when package.json changes only ouro.latestRelease and description, and every
// other changed file is one `pnpm run docs` writes the tag into, changed only in its version
// literals (#vX.Y.Z and @vX.Y.Z). A file no pin changes, docs/decisions/ included, makes it not a
// pin.
//
//   node scripts/pin-only.mjs <base> <head>
//     exits 0 when the commits are a pin, 1 with the reasons on stderr otherwise
import { execFileSync } from "node:child_process";
import { isDeepStrictEqual } from "node:util";
import { fileURLToPath } from "node:url";

/** Files `pnpm run docs` writes the tag into, besides package.json and the docs pages. */
export const pinFiles = ["README.md", "site/llms.txt", "registry/ouro/lib/ouro/dev.ts", "registry/ouro/lib/ouro/dev.test.ts"];

const literal = /([#@])v\d+\.\d+\.\d+\b/g;

/** Whether `pnpm run docs` writes the tag into this path, which a pin may change in its literals only. */
export function isPinFile(path) {
  return pinFiles.includes(path) || (/^docs\/.+\.md$/.test(path) && !/^docs\/decisions\//.test(path));
}

/** package.json without the two fields the pin sets. */
function withoutPin(pkg) {
  const rest = { ...pkg };
  delete rest.description;
  const ouro = { ...rest.ouro };
  delete ouro.latestRelease;
  return { ...rest, ouro };
}

/**
 * Why `files` is not a docs pin, one line each; none when it is. Each entry is `{ path, before,
 * after }`, with the text on each side and `null` where the file is absent.
 */
export function pinProblems(files) {
  const problems = [];
  const pkg = files.find(({ path }) => path === "package.json");
  if (!pkg || pkg.before === null || pkg.after === null) {
    problems.push("package.json is not changed on both sides, so it holds no pin");
  } else {
    const before = JSON.parse(pkg.before);
    const after = JSON.parse(pkg.after);
    if (before.ouro?.latestRelease === after.ouro?.latestRelease) problems.push("package.json's ouro.latestRelease is unchanged");
    if (!isDeepStrictEqual(withoutPin(before), withoutPin(after))) problems.push("package.json changes more than ouro.latestRelease and description");
  }
  for (const { path, before, after } of files) {
    if (path === "package.json") continue;
    if (!isPinFile(path)) problems.push(`${path} is not a file the docs pin changes`);
    else if (before === null || after === null) problems.push(`${path} is added or removed`);
    else if (before.replace(literal, (_, mark) => `${mark}VERSION`) !== after.replace(literal, (_, mark) => `${mark}VERSION`)) problems.push(`${path} changes more than a version literal`);
  }
  return problems;
}

function git(args) {
  return execFileSync("git", args, { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
}

/** The text of `path` at `rev`, or null when the commit has no such file. */
function contentAt(rev, path) {
  try {
    return git(["show", `${rev}:${path}`]);
  } catch {
    return null;
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const [base, head] = process.argv.slice(2);
  if (!base || !head) {
    console.error("usage: node scripts/pin-only.mjs <base> <head>");
    process.exit(2);
  }
  const paths = git(["diff", "--no-renames", "--name-only", "-z", base, head]).split("\0").filter(Boolean);
  const files = paths.map((path) => ({ path, before: contentAt(base, path), after: contentAt(head, path) }));
  const problems = files.length === 0 ? ["the commit changes no file"] : pinProblems(files);
  for (const problem of problems) console.error(`not a docs pin: ${problem}`);
  process.exit(problems.length === 0 ? 0 : 1);
}
