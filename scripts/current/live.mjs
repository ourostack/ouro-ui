// Ouro Current's live checks. Some repositories run Ouro check against their deployed site rather than in their own CI:
// ourostack/factory's .github/workflows/factory-ouro-check.yml checks https://ourostack.github.io/factory/ each day at the
// Ouro UI release its install record names. An update that brings a rule would leave that rule's findings unchecked until
// that run, so an update for such a repository is checked against the site first, at the release it moves to: the
// findings of the rules it brings are recorded as known, and a finding of any other rule holds the whole update back.
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { CONFIG as CHECK_CONFIG, knownKey, recordKnown, recordsEvery } from "./known.mjs";
import { REPOS } from "./pins.mjs";

/**
 * The repositories whose Ouro check runs against their live site, by repository: the URLs it reads, and what their
 * ouro-check.json needs there. Its page keys name the site's own paths, so each gets `prefix`, as the repository's
 * workflow prefixes them; `hostWaive` is what that workflow adds for the host's own page, which the repository does not
 * control. Keep both in step with the workflow.
 */
export const LIVE_CHECKS = {
  "ourostack/factory": {
    targets: ["https://ourostack.github.io/factory/", "https://ourostack.github.io/factory/evidence.html"],
    prefix: "/factory",
    hostWaive: { "/": { https: "ourostack.github.io is GitHub Pages' host: it answers plain HTTP with a 404, not a redirect, and sends no HSTS, and factory cannot set either. Checked by the factory adoption lane." } },
  },
};

/** The live check of a repository, or null when its Ouro check runs in its own CI. */
export const liveFor = (repo) => LIVE_CHECKS[repo] ?? null;

/** The config the live check reads: the repository's ouro-check.json with its waivers moved onto the site's paths. */
export function liveConfig(base, live) {
  const config = base ? JSON.parse(base) : {};
  const moved = Object.fromEntries(Object.entries(config.waive ?? {}).map(([key, rules]) => [key.startsWith("/") ? `${live.prefix}${key}` : key, rules]));
  return { ...config, waive: { ...moved, ...live.hostWaive } };
}

/** The reason an update waits when the live check finds gated findings of rules it does not bring in: the first three. */
function heldFor(tag, existing) {
  const shown = existing.slice(0, 3).map((finding) => `${finding.rule} on ${finding.page}: ${knownKey(finding.detail)}`);
  const rest = existing.length - shown.length;
  return `held back: the Ouro check of ${tag} finds ${existing.length} ${existing.length === 1 ? "finding" : "findings"} of existing rules on the live site: ${shown.join("; ")}${rest > 0 ? `, and ${rest} more` : ""}.`;
}

/** A hold-back stands for this long before the check runs again for the same repository and release. */
export const HOLD_HOURS = 6;
const HOLD_MS = HOLD_HOURS * 60 * 60 * 1000;
const stamp = (ms) => new Date(ms).toISOString().replace(/\.\d{3}Z$/, "Z");

/**
 * Checks an update against its repository's live site, when the update brings Ouro check rules (`rules`, by name) or
 * cannot say which it brings (`unreadable`, the notes of the rules' file). Without either it runs nothing and returns no
 * seed. Otherwise the outcome is one of:
 * - `held`: the reason the update waits, with no pull request, and `live`, the record a later run reads (tag, when the
 *   check ran, and the reason): the same release is held back without a check for HOLD_HOURS;
 * - `seed`: what recordKnown made of the findings of the new rules, its `file` null when none change, and its `counts`,
 *   which the pull request names. A branch that already lists known findings for every new rule (an earlier run's check
 *   of this release) gives its seed with no check.
 *
 * base and branch: ouro-check.json on the default branch and on the update's branch, as text or null. liveCheck({ tag,
 * targets, config }) returns the report's findings, as runLiveCheck does. previous() is the repository's last hold-back
 * record from the published current.json, or null; now is a Date.
 */
export async function gateLive({ live, tag, rules, unreadable = [], base, branch, liveCheck, previous = async () => null, now = new Date() }) {
  if (!rules.length && !unreadable.length) return { seed: null };
  if (unreadable.length) return { held: `held back: the Ouro check rules of ${tag} cannot be read, so the live check cannot tell the new rules from the existing ones: ${unreadable.join(" ")}` };
  let config;
  try {
    config = liveConfig(base, live);
  } catch {
    return { held: `held back: ${CHECK_CONFIG} cannot be read, so the Ouro check cannot run on the live site.` };
  }
  const listed = new Set(rules);
  const brings = (rule) => listed.has(rule);
  if (recordsEvery(branch, rules)) return { seed: recordKnown({ base, branch, found: new Map(rules.map((rule) => [rule, new Set()])), brings }) };
  const last = await previous();
  if (last?.tag === tag && last.held && now.getTime() - Date.parse(last.at) < HOLD_MS) {
    const checked = Date.parse(last.at);
    return { held: `${last.held.replace(/\.$/, "")} (checked at ${stamp(checked)}; next check after ${stamp(checked + HOLD_MS)}).`, live: last };
  }
  const held = (reason) => ({ held: reason, live: { tag, at: now.toISOString(), held: reason } });
  let findings;
  try {
    const report = await liveCheck({ tag, targets: live.targets, config });
    if (!Array.isArray(report?.findings)) throw new Error("the report has no findings");
    findings = report.findings;
  } catch (error) {
    return held(`held back: the Ouro check of ${tag} could not run on the live site: ${error.message}`);
  }
  const found = new Map(rules.map((rule) => [rule, new Set()]));
  const existing = [];
  for (const finding of findings) {
    if (brings(finding.rule)) found.get(finding.rule).add(knownKey(finding.detail));
    else if (finding.gated) existing.push(finding);
  }
  if (existing.length) return held(heldFor(tag, existing));
  return { seed: recordKnown({ base, branch, found, brings }) };
}

/** Runs a command to its end, in `cwd`: its status and output. A command that cannot start throws. */
export function runCommand(file, args, cwd) {
  const result = spawnSync(file, args, { cwd, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  if (result.error) throw result.error;
  return { status: result.status, output: `${result.stdout ?? ""}${result.stderr ?? ""}` };
}

const lastLines = (output) => output.trim().split("\n").slice(-2).join(" ");

/**
 * The live check, for real, at a release: Ouro UI is cloned at its tag into a temporary folder, its dependencies and
 * Chromium are installed there, and Ouro check (registry/ouro/check/check.ts) reads the targets with the config. Its
 * exit code 3 means findings, which its report holds; any other failure throws, which holds the update back. Runs only
 * when an update of a live-checked repository brings a rule (gateLive). Each step's command goes through `run`.
 */
export function runLiveCheck({ tag, targets, config }, { run = runCommand, root = () => mkdtempSync(join(tmpdir(), "ouro-current-live-")), remove = (dir) => rmSync(dir, { recursive: true, force: true }) } = {}) {
  const dir = root();
  try {
    const checkout = join(dir, "ouro-ui");
    const out = join(dir, "report");
    const configFile = join(dir, CHECK_CONFIG);
    writeFileSync(configFile, `${JSON.stringify(config, null, 2)}\n`);
    const step = (file, args, cwd, what) => {
      const result = run(file, args, cwd);
      if (result.status !== 0) throw new Error(`${what} failed (exit ${result.status}): ${lastLines(result.output)}`);
    };
    step("git", ["clone", "--depth", "1", "--branch", tag, `https://github.com/${REPOS.web}.git`, checkout], dir, "git clone");
    step("pnpm", ["install", "--frozen-lockfile"], checkout, "pnpm install");
    // --with-deps adds the system libraries Chromium needs on a Linux runner, as the check action does.
    step("pnpm", ["exec", "playwright", "install", "--with-deps", "chromium"], checkout, "the Chromium install");
    const checked = run(process.execPath, ["registry/ouro/check/check.ts", ...targets, "--config", configFile, "--out", out], checkout);
    if (checked.status !== 0 && checked.status !== 3) throw new Error(`the check stopped (exit ${checked.status}): ${lastLines(checked.output)}`);
    return { findings: JSON.parse(readFileSync(join(out, "report.json"), "utf8")).findings };
  } finally {
    remove(dir);
  }
}
