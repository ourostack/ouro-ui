// A pull request's checks ran against the main it branched from; with no merge queue, two pull
// requests that each pass can break main together (home's CSS went 3 bytes over its ceiling
// that way). This runs last in a pull request's CI, just before its gate: it fetches main, merges
// it into the pull request's head and runs the checks that combine across changes (the generated
// files, the registry, the site's size ceilings). It reads main again at the end, and when main
// moved while it ran it merges the new main and runs the checks again, so a result for a main
// that is no longer main never passes.
//
//   node scripts/fresh-main.mjs [--branch main] [--attempts 3] -- <command> [-- <command>...]
import { execFileSync, spawnSync } from "node:child_process";

const git = (cwd, ...args) => execFileSync("git", ["-c", "user.name=fresh-main", "-c", "user.email=fresh-main@users.noreply.github.com", ...args], { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "inherit"] }).trim();

/**
 * Merges the remote's newest `branch` into the checkout's head and runs each command in it, again
 * for a newer main when it moved meanwhile. Returns `{ ok, tested, attempts }`, `tested` being the
 * commit of main it last merged.
 */
export function freshMain({ cwd = process.cwd(), remote = "origin", branch = "main", commands, attempts = 3, log = console.log }) {
  const head = git(cwd, "rev-parse", "HEAD");
  let tested = "";
  for (let attempt = 1; attempt <= attempts; attempt++) {
    git(cwd, "reset", "--hard", head);
    git(cwd, "fetch", "--no-tags", remote, branch);
    tested = git(cwd, "rev-parse", "FETCH_HEAD");
    try {
      git(cwd, "merge", "--no-edit", tested);
    } catch {
      log(`The pull request does not merge into main at ${tested}: rebase it.`);
      git(cwd, "merge", "--abort");
      return { ok: false, tested, attempts: attempt };
    }
    for (const command of commands) {
      log(`> ${command.join(" ")}`);
      const result = spawnSync(command[0], command.slice(1), { cwd, stdio: "inherit" });
      if (result.status !== 0) {
        log(`${command.join(" ")} fails on this pull request merged with main at ${tested}.`);
        return { ok: false, tested, attempts: attempt };
      }
    }
    git(cwd, "fetch", "--no-tags", remote, branch);
    if (git(cwd, "rev-parse", "FETCH_HEAD") === tested) return { ok: true, tested, attempts: attempt };
    log(`Main moved past ${tested} while the checks ran; testing the newer main.`);
  }
  log(`Main kept moving through ${attempts} attempts.`);
  return { ok: false, tested, attempts };
}

/** Splits the arguments after `--` into commands at each further `--`. */
export function parseArgs(argv) {
  const options = { branch: "main", attempts: 3 };
  const at = argv.indexOf("--");
  const flags = at === -1 ? argv : argv.slice(0, at);
  for (let i = 0; i < flags.length; i += 2) {
    if (flags[i] === "--branch") options.branch = flags[i + 1];
    else if (flags[i] === "--attempts") options.attempts = Number(flags[i + 1]);
    else throw new Error(`Unknown option ${flags[i]}.`);
  }
  const commands = [[]];
  for (const word of at === -1 ? [] : argv.slice(at + 1)) {
    if (word === "--") commands.push([]);
    else commands.at(-1).push(word);
  }
  return { ...options, commands: commands.filter((command) => command.length > 0) };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const options = parseArgs(process.argv.slice(2));
  if (options.commands.length === 0) throw new Error("Give the commands to run after --.");
  const { ok, tested } = freshMain(options);
  if (!ok) process.exit(1);
  console.log(`Passed on this pull request merged with main at ${tested}.`);
}
