import { execFileSync } from "node:child_process";
import type { Plugin } from "vite";
import { buildSourceInfo, type OuroBuildSourceInfo } from "./ouro-build-source-info.ts";

export { ouroBuildSource };
export type { OuroBuildSourceOptions };

/** Options {@link ouroBuildSource} takes. */
interface OuroBuildSourceOptions {
  /** The app's own name, read back unchanged in the response's `app`. */
  app: string;
  /** The branch `behind` counts against. @default "main" */
  official?: string;
  /** Files besides the page a host's proxy hands through. @default [] */
  serviceFiles?: readonly string[];
  /** The checkout to read git from. @default process.cwd() */
  cwd?: string;
}

function git(cwd: string, ...args: string[]): string {
  return execFileSync("git", args, { cwd, encoding: "utf8" }).trim();
}

function readGit(cwd: string, official: string) {
  let behindOfficial: number | null = null;
  try {
    behindOfficial = Number.parseInt(git(cwd, "rev-list", "--count", `HEAD..origin/${official}`), 10);
  } catch {
    // No origin/<official> to compare against (a shallow clone, or official is the current branch): leave it null.
  }
  return {
    branch: git(cwd, "rev-parse", "--abbrev-ref", "HEAD"),
    root: git(cwd, "rev-parse", "--show-toplevel"),
    sha: git(cwd, "rev-parse", "HEAD"),
    dirty: git(cwd, "status", "--porcelain").length > 0,
    behindOfficial,
  };
}

/**
 * A Vite plugin for the "window builds" loop: the dev server answers `GET <base>__ouro/source`
 * with the app's current build, read from `options.cwd`'s git state, cached per request and
 * invalidated whenever a file under `.git/` changes (a commit, a checkout, a push to `origin`).
 * `BuildChip` is the piece that shows this in an app's title bar; a host's proxy (a later piece)
 * is what makes the dev server reachable at the app's own origin in the first place.
 *
 * Use a plain `fetch` or your own loader instead when nothing needs the dev server's own
 * process (a CI script reading the checkout's git state directly can call `git` itself).
 *
 * @example
 * // vite.config.ts
 * export default defineConfig({
 *   plugins: [ouroBuildSource({ app: "recipes" })],
 * });
 * @group App setup
 */
function ouroBuildSource(options: OuroBuildSourceOptions): Plugin {
  const cwd = options.cwd ?? process.cwd();
  const official = options.official ?? "main";
  let cached: OuroBuildSourceInfo | undefined;
  return {
    name: "ouro-build-source",
    configureServer(server) {
      server.watcher.on("change", (file) => {
        if (file.includes("/.git/")) cached = undefined;
      });
      server.middlewares.use((req, res, next) => {
        if (!req.url || !/(?:^|\/)__ouro\/source(?:\?.*)?$/.test(req.url)) {
          next();
          return;
        }
        cached ??= buildSourceInfo(options.app, readGit(cwd, official), options.serviceFiles);
        res.setHeader("content-type", "application/json");
        res.end(JSON.stringify(cached));
      });
    },
  };
}
