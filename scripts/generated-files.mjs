// The generated files that list every component, which main does not commit: two pull requests
// that add components would both edit them in the same place, and the merge queue drops one of
// them on the conflict. `pnpm i` writes them (scripts/generate.mjs, package.json's postinstall),
// so does each generator, and .gitignore keeps them out of commits on main. A release commit adds
// them (scripts/release-commit.sh), so each tag carries the registry.json that
// `shadcn add ourostack/ouro-ui/<item>#<tag>` reads.
import { execFileSync } from "node:child_process";

export const uncommitted = [
  "registry.json",
  "site/public/llms.txt",
  "site/src/docs/catalog.json",
  "site/src/docs/sources.json",
  "site/src/docs/pages.json",
  "site/src/docs/page-index.json",
  "test/generated/control-matrix.json",
  "test/generated/motion-matrix.json",
];

/** The hand-written llms.txt, whose `## Items` list `pnpm registry` fills in to make site/public/llms.txt. */
export const llmsSource = "site/llms.txt";

/**
 * The files among `paths` that git tracks in `root` (in the index): on a release commit, the
 * generated files it adds. Outside a git checkout, none.
 */
export function trackedFiles(root, paths = uncommitted) {
  try {
    return execFileSync("git", ["ls-files", "--", ...paths], { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] })
      .split("\n")
      .filter(Boolean);
  } catch {
    return [];
  }
}

/** Whether git tracks `path` in `root`. */
export const isTracked = (root, path) => trackedFiles(root, [path]).includes(path);
