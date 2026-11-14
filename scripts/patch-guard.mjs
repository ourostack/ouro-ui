import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const runtimeDirs = ["registry/ouro/components/ouro", "registry/ouro/lib/ouro"];
const testLike = /\.(test|stories|test-d|spec)\.[tj]sx?$|\/testing\/|\/e2e\//;

export function patchedPackage(file) {
  const name = file.replace(/^patches\//, "").replace(/\.patch$/, "");
  const at = name.lastIndexOf("@");
  return name.slice(0, at).replace("__", "/");
}

function walk(dir) {
  return readdirSync(dir).flatMap((entry) => {
    const path = join(dir, entry);
    return statSync(path).isDirectory() ? walk(path) : [path];
  });
}

export function importsAtRuntime(pkg, root = ".") {
  const pattern = new RegExp(`from "${pkg.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&")}(/[^"]*)?"`);
  return runtimeDirs
    .flatMap((dir) => (existsSync(join(root, dir)) ? walk(join(root, dir)) : []))
    .filter((file) => /\.tsx?$/.test(file) && !testLike.test(file))
    .some((file) => pattern.test(readFileSync(file, "utf8")));
}

// A pull request names where the behaviour also ships: `Patch-covered: <registry file>` or `Upstream-release: <version>`.
export function problems({ changed, body = "", root = "." }) {
  return changed
    .filter((file) => /^patches\/.+\.patch$/.test(file))
    .filter((file) => importsAtRuntime(patchedPackage(file), root))
    .filter(() => {
      const covered = [...body.matchAll(/^Patch-covered:\s*(\S+)/gm)].some((m) => existsSync(join(root, m[1])) && m[1].startsWith("registry/"));
      const released = /^Upstream-release:\s*\S+/m.test(body);
      return !covered && !released;
    })
    .map(
      (file) =>
        `${file} changes ${patchedPackage(file)}, which registry components import at runtime, so consumers never get it. Fix: ship the behaviour in registry source and add "Patch-covered: <registry file>" to the pull request description, or add "Upstream-release: <version>" naming the release that carries it.`,
    );
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const base = process.env.PATCH_GUARD_BASE_REF;
  const changed = base ? execFileSync("git", ["diff", "--name-only", `${base}...HEAD`, "--", "patches"], { encoding: "utf8" }).split("\n").filter(Boolean) : [];
  const found = problems({ changed, body: process.env.PR_BODY ?? "" });
  for (const line of found) console.error(line);
  process.exit(found.length ? 1 : 0);
}
