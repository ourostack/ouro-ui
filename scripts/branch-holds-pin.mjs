// The pin workflows (docs-pin.yml, core-pin.yml, kit-pin.yml) force-push their branch. A branch that already pins the
// target release or a newer one, such as a pull request rebuilt by hand under the attributed account, must not be
// overwritten by the workflow's own commit (#4116): the run pushes nothing and the pull request keeps going.
//
//   node scripts/branch-holds-pin.mjs <docs|core|<kit>> <tag> [<ref>]
//     reads the pin at <ref> (default FETCH_HEAD); exits 0 when it is <tag> or newer, 1 when it is older or unreadable
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { compare } from "./apple-release.mjs";

/** Where each pin lives: the file, and the path to the tag in it. */
function place(kind) {
  if (kind === "docs") return { file: "package.json", path: ["ouro", "latestRelease"] };
  if (kind === "core") return { file: "scripts/parity-data/provenance.json", path: ["coreTag"] };
  return { file: "scripts/parity-data/versions.json", path: [kind, "tag"] };
}

/** Whether the pin `read` returns for a file is `tag` or newer. Anything unreadable says no. */
export function holdsPin(kind, tag, read) {
  try {
    const { file, path } = place(kind);
    const pinned = path.reduce((value, key) => value?.[key], JSON.parse(read(file)));
    return typeof pinned === "string" && compare(pinned, tag) >= 0;
  } catch {
    return false;
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const [kind, tag, ref = "FETCH_HEAD"] = process.argv.slice(2);
  if (!kind || !tag) {
    console.error("usage: node scripts/branch-holds-pin.mjs <docs|core|kit> <tag> [<ref>]");
    process.exit(2);
  }
  process.exit(holdsPin(kind, tag, (file) => execFileSync("git", ["show", `${ref}:${file}`], { encoding: "utf8" })) ? 0 : 1);
}
