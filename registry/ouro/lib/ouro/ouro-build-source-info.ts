export { buildSourceInfo };
export type { OuroBuildSourceGit, OuroBuildSourceInfo };

/**
 * What `ouroBuildSource()` answers: the build a dev server runs, for `BuildChip` (or a host
 * app's own CLI) to show and compare against the official build.
 */
interface OuroBuildSourceInfo {
  /** The app's own name, as it was given to `ouroBuildSource`. */
  app: string;
  /** The checkout's current branch, or the literal `"HEAD"` for a detached-head checkout. */
  branch: string;
  /** The checkout's folder name, so a person running several worktrees at once tells them apart. */
  worktree: string;
  /** The checkout's current commit. */
  sha: string;
  /** Whether the checkout has uncommitted changes. */
  dirty: boolean;
  /**
   * How many commits the checkout trails the official branch, 0 when it is not behind or that could not be read.
   * @claim "0 when it is not behind or that could not be read" registry/ouro/lib/ouro/ouro-build-source-info.test.ts verify:testExists(registry/ouro/lib/ouro/ouro-build-source-info.test.ts::buildSourceInfo > reads 0 behind when it could not be read, rather than null)
   */
  behind: number;
  /** The files a host's proxy (a later piece) hands through besides the page itself, such as a service worker. */
  serviceFiles: readonly string[];
}

/** The checkout facts {@link buildSourceInfo} needs, read however the caller likes (git, a cache, a test double). */
interface OuroBuildSourceGit {
  branch: string;
  root: string;
  sha: string;
  dirty: boolean;
  /** Commits the checkout trails the official branch, or `null` when that could not be read. */
  behindOfficial: number | null;
}

/**
 * Builds the shape `ouroBuildSource()` serves, from `git`'s already-read facts. Pure, so it is
 * the one part of the plugin a plain test proves directly; `ouroBuildSource` is the Node-only
 * glue that reads `git` and serves this over a dev-server route.
 *
 * @example
 * buildSourceInfo("recipes", { branch: "main", root: "/code/recipes", sha: "abc123", dirty: false, behindOfficial: 0 });
 * // { app: "recipes", branch: "main", worktree: "recipes", sha: "abc123", dirty: false, behind: 0, serviceFiles: [] }
 * @group App setup
 */
function buildSourceInfo(app: string, git: OuroBuildSourceGit, serviceFiles: readonly string[] = []): OuroBuildSourceInfo {
  return {
    app,
    branch: git.branch,
    worktree: git.root.split("/").pop() || git.root,
    sha: git.sha,
    dirty: git.dirty,
    behind: git.behindOfficial ?? 0,
    serviceFiles,
  };
}
