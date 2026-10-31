export { checkSafety, claimSetHash, compareInventory, harvest, main, misspell, parseArgs, refusalVerdict, renderHtml, renderMarkdown, renderText, requiredWords, splitCommand, stateDelta, summarize, usageWords, xray, XRAY_VERSION };
export type { CheckResult, Inventory, InventoryCompare, Report, Safety, Verdict, XrayOptions };

// The export list comes first because the shadcn CLI drops comments before a file's
// first statement, which would take the JSDoc below with it.

import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { basename, relative, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { CLAIM_SET, claimSetText, type Claim, type ClaimSurface } from "./claims.ts";
import { isOutcome, validateOutcome } from "./outcome.ts";
import { isWait, validateWait } from "./wait.ts";
import { checkWorkEvent } from "./work-event.ts";

/**
 * The Ouro AX conformance checker: it calls a CLI, an HTTP API or an MCP server the way an agent would, and reports
 * which claims hold on which surface, with the fix where a claim does not hold. It checks from outside, never by
 * importing the interface's code. Reads run freely; what other people see is called only on paths that must refuse (a made-up
 * target, no `--why`) or that act on nothing (`--dry-run`), and only against a target that proves it is a mock.
 *
 *   node xray.ts --cli "<command>" [--http <url> --routes <manifest.json>] [--mcp "<command>"] [options]
 *
 * @claim "never by importing the interface's code" registry/ouro/ax/xray.test.mts verify:testExists(registry/ouro/ax/xray.test.mts::the kit's example tool conforms, and the X-ray acts on nothing)
 * @claim "only against a target that proves it is a mock" registry/ouro/ax/xray.test.mts verify:testExists(registry/ouro/ax/xray.test.mts::without proof of a mock, nothing other people see is called, and it does not conform)
 */
const XRAY_VERSION = "1.0.0";

type Verdict = "pass" | "fail" | "skip";

interface CheckResult {
  claim: string;
  surface: string;
  verdict: Verdict;
  note: string;
}

/** The surfaces an adopter generates from its own registration: CLI command names, HTTP `METHOD /path` routes, MCP tool names. */
interface Inventory {
  cli?: string[];
  http?: string[];
  mcp?: string[];
}

interface InventoryCompare {
  expected: number;
  covered: number;
  missing: string[];
  unknown: string[];
  duplicate: string[];
}

interface Safety {
  /** Whether the X-ray may call what other people see (refused probes and previews). */
  ok: boolean;
  checks: { name: string; ok: boolean; note: string }[];
}

interface XrayOptions {
  cli?: string | undefined;
  http?: string | undefined;
  routes?: string | undefined;
  mcp?: string | undefined;
  name?: string | undefined;
  env: Record<string, string>;
  guard?: string | undefined;
  mock?: string | undefined;
  home?: string | undefined;
  inventory?: string | undefined;
  events?: string | undefined;
  commit?: string | undefined;
  conformance: boolean;
  state: string[];
  volatile: string[];
  samples: Record<string, string>;
  width: number;
  timeoutMs: number;
  json: boolean;
  md?: string | undefined;
  html?: string | undefined;
  command: "claims" | "help" | null;
}

const CLAIMS: readonly Claim[] = CLAIM_SET.claims;
const CLAIM = new Map(CLAIMS.map((c) => [c.id, c]));
const BOGUS = "axxraynoref";
const NO_SUCH_COMMAND = "ax-xray-no-such-command";
const NO_SUCH_FLAG = "--ax-xray-no-such-flag";
const WHY = "ax-xray conformance probe: nobody asked, so this must not reach anyone";
const READ_WORDS = new Set(["show", "list", "status", "profile", "catalog", "get"]);
const AMBIGUOUS = ["edit", "delete", "remove"];
/** An instruction to a person or agent at the start of a clause: "; open the window", "Tell them, do not retry". */
const IMPERATIVE = /(^|[;:.!?]\s+|, )(open|tell|ask|run|use|try|give|wait|restart|start|turn|name|pass|add|choose|pick|check)\b/i;
/** Environment variable names that carry credentials; the X-ray refuses to pass any to what it checks. */
const CREDENTIAL = /TOKEN|SECRET|PASSWORD|PASSWD|CREDENTIAL|API_?KEY|AUTH|COOKIE|SESSION/i;
/** What the X-ray passes on from its own environment: enough to find and run programs, nothing that signs in. */
const PASSED_ENV = ["PATH", "Path", "PATHEXT", "SystemRoot", "COMSPEC", "LANG", "LC_ALL", "TERM", "TZ", "TMPDIR"];

/**
 * The SHA-256 of the claim set's canonical JSON: a report pins the exact standard it checked.
 *
 * @claim "a report pins the exact standard" registry/ouro/ax/xray.test.mts verify:testExists(registry/ouro/ax/xray.test.mts::the claim set: its hash is stable and every claim the X-ray records exists)
 */
function claimSetHash(): string {
  return createHash("sha256").update(claimSetText(CLAIM_SET)).digest("hex");
}

/** Splits a command line into words, honouring single and double quotes. */
function splitCommand(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let quote: string | null = null;
  let has = false;
  for (const ch of line) {
    if (quote) {
      if (ch === quote) quote = null;
      else cur += ch;
    } else if (ch === '"' || ch === "'") {
      quote = ch;
      has = true;
    } else if (/\s/.test(ch)) {
      if (has) out.push(cur);
      cur = "";
      has = false;
    } else {
      cur += ch;
      has = true;
    }
  }
  if (has) out.push(cur);
  return out;
}

const shellWord = (w: string) => (/^[\w@%+=:,./#-]+$/.test(w) ? w : JSON.stringify(w));

interface RunResult {
  code: number | null;
  stdout: string;
  stderr: string;
  timedOut: boolean;
}

/** Runs argv with exactly `env` (nothing inherited); resolves its exit code and output. */
function run(argv: readonly string[], env: Record<string, string>, timeoutMs: number, input: string | null = null): Promise<RunResult> {
  return new Promise((done) => {
    let stdout = "";
    let stderr = "";
    let timedOut = false;
    const child = spawn(argv[0] ?? "", argv.slice(1), { env, stdio: ["pipe", "pipe", "pipe"] });
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill("SIGKILL");
    }, timeoutMs);
    child.stdout.on("data", (d: Buffer) => (stdout += String(d)));
    child.stderr.on("data", (d: Buffer) => (stderr += String(d)));
    child.on("error", (e) => (stderr += e.message));
    child.on("close", (code) => {
      clearTimeout(timer);
      done({ code: timedOut ? null : code, stdout, stderr, timedOut });
    });
    child.stdin.on("error", () => undefined);
    if (input !== null) child.stdin.write(input);
    child.stdin.end();
  });
}

const lines = (s: string) => s.replace(/\n$/, "").split("\n").filter((l, i, a) => l !== "" || i < a.length - 1);
const firstLine = (s: string) => (s.split("\n").find((l) => l.trim()) ?? "").trim();
const clip = (s: string, n = 220) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);
type Parsed = { ok: true; value: unknown } | { ok: false };
const parseJson = (s: string): Parsed => {
  try {
    return { ok: true, value: JSON.parse(s) };
  } catch {
    return { ok: false };
  }
};
const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const hasStack = (s: string) => /^\s+at (?:async )?(?:\S+ \()?(?:file:\/\/|node:|\/|[A-Za-z]:\\)\S*:\d+:\d+\)?$/m.test(s);
const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Splits a usage line into words, keeping a placeholder with spaces (`<message id>`) in one word. */
function usageWords(usage: string): string[] {
  return splitCommand(usage.replace(/<[^<>]*>/g, (p) => p.replace(/ /g, "\u0000"))).map((w) => w.replace(/\u0000/g, " "));
}

/** Removes `[...]` groups (nested) from a usage line and splits it into words. */
function requiredWords(usage: string): string[] {
  let u = usage;
  let prev;
  do {
    prev = u;
    u = u.replace(/\[[^[\]]*\]/g, " ");
  } while (u !== prev);
  return usageWords(u);
}

/**
 * What changed between two state snapshots, element by element: arrays compare by their members.
 *
 * @claim "What changed between two state snapshots" registry/ouro/ax/xray.test.mts verify:testExists(registry/ouro/ax/xray.test.mts::a refusal may leave only a record that says it was refused)
 */
function stateDelta(before: readonly string[], after: readonly string[]): { same: boolean; added: string[]; removed: string[] } {
  const leaves = (snap: readonly string[]) => {
    const out: string[] = [];
    const walk = (v: unknown): void => {
      if (Array.isArray(v)) for (const x of v) out.push(JSON.stringify(x));
      else if (isRecord(v)) for (const x of Object.values(v)) walk(x);
      else out.push(JSON.stringify(v));
    };
    for (const s of snap) {
      const j = parseJson(s);
      if (j.ok) walk(j.value);
      else out.push(s);
    }
    return out;
  };
  const count = (xs: string[]) => xs.reduce((m, x) => m.set(x, (m.get(x) ?? 0) + 1), new Map<string, number>());
  const ca = count(leaves(before));
  const cb = count(leaves(after));
  const added: string[] = [];
  const removed: string[] = [];
  for (const [k, n] of cb) for (let i = ca.get(k) ?? 0; i < n; i++) added.push(k);
  for (const [k, n] of ca) for (let i = cb.get(k) ?? 0; i < n; i++) removed.push(k);
  return { same: added.length === 0 && removed.length === 0, added, removed };
}

/** A refusal's footprint: nothing, or only records that say they were refused. */
function refusalVerdict(delta: { same: boolean; added: string[]; removed: string[] }): { ok: boolean; note: string } {
  if (delta.same) return { ok: true, note: "nothing changed" };
  if (!delta.removed.length && delta.added.every((x) => /refus/i.test(x))) return { ok: true, note: `${delta.added.length} audit record${delta.added.length === 1 ? "" : "s"} of the refusal, nothing else` };
  return { ok: false, note: `${delta.added.length} added, ${delta.removed.length} removed; first: ${clip(delta.added[0] ?? delta.removed[0] ?? "", 200)}` };
}

const placeholderKey = (p: string) => (p.replace(/^<|>$/g, "").split(/[|\s.]/)[0] ?? "").toLowerCase();
const singular = (k: string) => k.toLowerCase().replace(/ies$/, "y").replace(/s$/, "");

/**
 * Collects sample refs from a JSON answer: the first `ref` (else `id`) of each array, keyed by its name, singular.
 *
 * @claim "of each array" registry/ouro/ax/xray.test.mts verify:testExists(registry/ouro/ax/xray.test.mts::harvest takes the first ref of each named list, singular)
 */
function harvest(value: unknown, samples: Record<string, string>, key: string | null = null): Record<string, string> {
  if (Array.isArray(value)) {
    if (key) {
      const k = singular(key);
      for (const item of value) {
        const ref = isRecord(item) ? (typeof item["ref"] === "string" ? item["ref"] : typeof item["id"] === "string" ? item["id"] : null) : null;
        if (ref) {
          if (!(k in samples)) samples[k] = ref;
          break;
        }
      }
    }
    for (const item of value) harvest(item, samples, key);
  } else if (isRecord(value)) {
    for (const [k, v] of Object.entries(value)) harvest(v, samples, k);
  }
  return samples;
}

/** Drops one inner letter: --limit becomes --limt. */
function misspell(flag: string): string {
  const body = flag.replace(/^--/, "");
  if (body.length < 4) return `--${body}x`;
  const i = Math.floor(body.length / 2) + 1;
  return `--${body.slice(0, i)}${body.slice(i + 1)}`;
}

class Recorder {
  readonly results: CheckResult[] = [];
  add(claim: string, surface: string, verdict: Verdict, note = "") {
    if (!CLAIM.has(claim)) throw new Error(`ax-xray: unknown claim ${claim}`);
    this.results.push({ claim, surface, verdict, note: clip(note, 400) });
  }
}

/** Compares what the X-ray covered with the inventory: missing, unknown and listed twice on either side. */
function compareInventory(expected: readonly string[], covered: readonly string[]): InventoryCompare {
  const twice = (xs: readonly string[]) => [...new Set(xs.filter((x, i) => xs.indexOf(x) !== i))];
  const want = new Set(expected);
  const got = new Set(covered);
  return { expected: want.size, covered: got.size, missing: [...want].filter((x) => !got.has(x)), unknown: [...got].filter((x) => !want.has(x)), duplicate: [...new Set([...twice(expected), ...twice(covered)])] };
}

function recordInventory(rec: Recorder, claim: string, compare: InventoryCompare | null, what: string) {
  if (!compare) return rec.add(claim, "inventory", "skip", "no --inventory given, so coverage is unproven");
  for (const m of compare.missing) rec.add(claim, m, "fail", `in the inventory but not in ${what}, so never checked`);
  for (const u of compare.unknown) rec.add(claim, u, "fail", `in ${what} but not in the inventory`);
  for (const d of compare.duplicate) rec.add(claim, d, "fail", "listed twice");
  if (!compare.missing.length && !compare.unknown.length && !compare.duplicate.length) rec.add(claim, "inventory", "pass", `${compare.covered} match the inventory`);
}

const LOOPBACK = new Set(["127.0.0.1", "localhost", "::1", "[::1]"]);
const isLoopback = (url: string) => {
  try {
    return LOOPBACK.has(new URL(url).hostname);
  } catch {
    return false;
  }
};

/** The environment a checked program gets: the passed-on basics, the isolated home, and the --env values. */
function childEnv(opts: XrayOptions): Record<string, string> {
  const env: Record<string, string> = {};
  for (const k of PASSED_ENV) {
    const v = process.env[k];
    if (v !== undefined) env[k] = v;
  }
  const home = opts.home ? resolve(opts.home) : process.env["HOME"];
  if (home !== undefined) {
    env["HOME"] = home;
    env["USERPROFILE"] = home;
  }
  return { ...env, ...opts.env };
}

/** Reads `a.b.c` from a JSON value. */
const at = (value: unknown, path: string): unknown => path.split(".").reduce<unknown>((v, k) => (isRecord(v) ? v[k] : undefined), value);

/**
 * Whether the X-ray may call what other people see, failing closed: every address it can see is loopback, the home is
 * isolated, the target proves it is a mock (`--mock "<url> <key>=<value>"`, or the adopter's `--guard`, which already
 * passed), and no credential is passed to it. Any missing proof refuses those checks and says why.
 *
 * @claim "may call what other people see" registry/ouro/ax/xray.test.mts verify:testExists(registry/ouro/ax/xray.test.mts::checkSafety fails closed: a remote address, the real home, a credential, a wrong or missing mock)
 */
async function checkSafety(opts: XrayOptions, guardPassed: boolean): Promise<Safety> {
  const checks: Safety["checks"] = [];
  const [mockUrl, mockExpect] = opts.mock ? splitCommand(opts.mock) : [];
  const urls = [opts.http, mockUrl, ...Object.values(opts.env).filter((v) => /^https?:\/\//i.test(v))].filter((u): u is string => typeof u === "string" && u !== "");
  const far = urls.filter((u) => !isLoopback(u));
  checks.push(
    urls.length === 0
      ? { name: "loopback", ok: false, note: "no address to check: pass --mock \"<loopback url> <key>=<value>\" or --env <NAME>=<loopback url>" }
      : { name: "loopback", ok: far.length === 0, note: far.length ? `not loopback: ${far.join(", ")}` : `${urls.length} address${urls.length === 1 ? "" : "es"}, all loopback` },
  );
  const real = homedir();
  const home = opts.home ? resolve(opts.home) : null;
  const inside = home !== null && (home === real || !relative(home, real).startsWith(".."));
  checks.push(home === null ? { name: "isolated home", ok: false, note: "no --home <dir>: the checked program would run with the real home" } : { name: "isolated home", ok: !inside, note: inside ? `${home} is or holds the real home` : `HOME=${home}` });
  const leaked = Object.keys(opts.env).filter((k) => CREDENTIAL.test(k));
  checks.push({ name: "no credentials", ok: leaked.length === 0, note: leaked.length ? `--env passes ${leaked.join(", ")}` : `only ${PASSED_ENV.filter((k) => process.env[k] !== undefined).join(", ")} and the --env values are passed on` });
  let identity: { ok: boolean; note: string };
  if (mockUrl && mockExpect) {
    const eq = mockExpect.indexOf("=");
    const key = mockExpect.slice(0, eq);
    const want = mockExpect.slice(eq + 1);
    if (eq < 1) identity = { ok: false, note: `--mock needs <key>=<value> after the URL, not "${mockExpect}"` };
    else if (!isLoopback(mockUrl)) identity = { ok: false, note: `the mock check ${mockUrl} is not loopback` };
    else {
      try {
        const r = await fetch(mockUrl, { signal: AbortSignal.timeout(opts.timeoutMs), redirect: "manual" });
        const j = parseJson(await r.text());
        const got = j.ok ? at(j.value, key) : undefined;
        identity = { ok: r.status === 200 && JSON.stringify(got) === JSON.stringify(parseJson(want).ok ? JSON.parse(want) : want), note: `${mockUrl} answers ${key}=${JSON.stringify(got)}; expected ${want}` };
      } catch (e) {
        identity = { ok: false, note: `${mockUrl}: ${e instanceof Error ? e.message : String(e)}` };
      }
    }
  } else identity = guardPassed ? { ok: true, note: "the --guard command passed" } : { ok: false, note: "no proof the target is a mock: pass --mock \"<url> <key>=<value>\" or --guard \"<command>\"" };
  checks.push({ name: "mock identity", ...identity });
  return { ok: checks.every((c) => c.ok), checks };
}

const refusedNote = (safety: Safety) => `not run: the target is not proven a mock (${safety.checks.filter((c) => !c.ok).map((c) => `${c.name}: ${c.note}`).join("; ")})`;

interface CliCommand {
  name: string;
  effect: string | null;
  readOnly: boolean | null;
  usage: string[];
}

interface Context {
  rec: Recorder;
  opts: XrayOptions;
  env: Record<string, string>;
  safety: Safety;
  inventory: Inventory | null;
  effects: { surface: string; note: string }[];
}

/** Reads help JSON's commands: `usage` as a list or one line, with or without the tool's name in front. */
function commandsOf(help: Record<string, unknown>, name: string): CliCommand[] {
  const list = Array.isArray(help["commands"]) ? help["commands"].filter(isRecord) : [];
  return list.map((c) => {
    const cmd = String(c["name"]);
    const raw = Array.isArray(c["usage"]) ? c["usage"].map(String) : typeof c["usage"] === "string" ? [c["usage"]] : [cmd];
    const usage = raw.map((u) => (u.startsWith(`${name} `) ? u.slice(name.length + 1) : u));
    return { name: cmd, effect: typeof c["effect"] === "string" ? c["effect"] : null, readOnly: typeof c["readOnly"] === "boolean" ? c["readOnly"] : null, usage };
  });
}

async function checkCli(ctx: Context) {
  const { rec, opts, env } = ctx;
  const base = splitCommand(opts.cli ?? "");
  const name = opts.name ?? basename(base[base.length - 1] ?? "cli").replace(/\.[cm]?[jt]s$/, "");
  const calls: (RunResult & { args: string[]; shown: string })[] = [];
  const call = async (args: string[], input: string | null = null, timeoutMs = opts.timeoutMs) => {
    const r = await run([...base, ...args], env, timeoutMs, input);
    const c = { args, shown: [name, ...args].map(shellWord).join(" "), ...r };
    calls.push(c);
    return c;
  };
  const brief = (c: RunResult & { shown: string }) =>
    `\`${clip(c.shown, 120)}\` → ${c.timedOut ? "timed out" : `exit ${c.code}`}${c.stderr.trim() ? `; stderr: ${clip(firstLine(c.stderr), 200)}` : ""}${!c.stderr.trim() && c.stdout.trim() ? `; stdout: ${clip(firstLine(c.stdout), 120)}` : ""}`;
  const snapshot = async () => {
    const out: string[] = [];
    for (const s of opts.state) {
      const r = await run([...base, ...splitCommand(s)], env, opts.timeoutMs);
      const j = parseJson(r.stdout);
      out.push(j.ok ? JSON.stringify(stripKeys(j.value, opts.volatile)) : r.stdout);
    }
    return out;
  };

  // State first, twice: a state that moves on its own cannot show a read changed it.
  let stateBefore: string[] | null = null;
  let stateNote = "no --state command given";
  if (opts.state.length) {
    const a = await snapshot();
    const b = await snapshot();
    if (JSON.stringify(a) === JSON.stringify(b)) stateBefore = b;
    else stateNote = "the state commands answer differently with nothing run between them";
  }
  const runStart = stateBefore;

  // Help as data.
  let help: Record<string, unknown> | null = null;
  for (const args of [["help", "--json"], ["--help", "--json"]]) {
    const c = await call(args);
    const j = parseJson(c.stdout);
    if (c.code === 0 && j.ok && isRecord(j.value) && Array.isArray(j.value["commands"]) && j.value["commands"].every((x) => isRecord(x) && typeof x["name"] === "string")) {
      help = j.value;
      rec.add("cli.help-parses", "help", "pass", `\`${c.shown}\` lists ${j.value["commands"].length} commands`);
      break;
    }
    if (args[0] === "--help") rec.add("cli.help-parses", "help", "fail", brief(c));
  }
  const overview = await call(["--help"]);
  const overviewLines = lines(overview.stdout);
  const commands: CliCommand[] = help ? commandsOf(help, name) : [];
  if (!help) {
    // Without help JSON, commands come from the text: an indented word, two spaces, then words.
    for (const l of overviewLines) {
      const m = /^ {2,4}([a-z][\w-]*):? {2,}\S/.exec(l);
      if (m?.[1]) commands.push({ name: m[1], effect: null, readOnly: null, usage: [m[1]] });
    }
  }
  const names = commands.map((c) => c.name);
  const unique = [...new Set(names)];
  recordInventory(rec, "cli.inventory", ctx.inventory?.cli ? compareInventory(ctx.inventory.cli, names) : null, "help --json");

  if (help) {
    for (const c of commands) {
      if (c.effect === "private" || c.effect === "others") rec.add("cli.help-effects", c.name, "pass", `effect: ${c.effect}`);
      else rec.add("cli.help-effects", c.name, "fail", `help --json gives ${c.name} no effect (private or others)`);
    }
  } else rec.add("cli.help-effects", "help", "fail", "no help JSON, so no command says who sees it");

  // Exit codes, documented.
  let documented: Set<number> | null = null;
  let usageCode: number | null = null;
  const exitCodes = help && Array.isArray(help["exitCodes"]) ? help["exitCodes"].filter(isRecord) : null;
  if (exitCodes) {
    documented = new Set(exitCodes.map((e) => Number(e["code"])));
    const u = exitCodes.find((e) => /usage/i.test(`${String(e["name"] ?? "")} ${String(e["short"] ?? "")} ${String(e["meaning"] ?? "")}`));
    usageCode = u ? Number(u["code"]) : null;
  } else {
    const m = /Exit codes?:([^\n]*(?:\n(?!\S*:)[^\n]*)*)/i.exec(overview.stdout);
    if (m?.[1]) {
      documented = new Set([...m[1].matchAll(/\b(\d{1,3}) [a-z]/gi)].map((x) => Number(x[1])));
      const u = /\b(\d{1,3}) usage/i.exec(m[1]);
      usageCode = u ? Number(u[1]) : null;
    }
  }

  // The overview and each command's help.
  const width = opts.width;
  const tooWide = (text: string) => lines(text).filter((l) => [...l].length > width);
  const wide = tooWide(overview.stdout);
  rec.add("cli.help-width", "--help", wide.length ? "fail" : "pass", wide.length ? `${wide.length} lines over ${width} columns, first: ${clip(wide[0] ?? "", 140)}` : `every line ≤ ${width} columns`);
  rec.add("cli.overview-short", "--help", overviewLines.length <= 60 ? "pass" : "fail", `${overviewLines.length} lines`);
  const helpText: Record<string, string> = {};
  for (const n of unique) {
    const c = await call([...n.split(" "), "--help"]);
    helpText[n] = c.stdout;
    const ok = c.code === 0 && c.stdout.trim() !== "" && !c.stderr.trim();
    rec.add("cli.command-help", n, ok ? "pass" : "fail", ok ? `${lines(c.stdout).length} lines` : brief(c));
    if (ok) {
      const w = tooWide(c.stdout);
      rec.add("cli.help-width", `${n} --help`, w.length ? "fail" : "pass", w.length ? `${w.length} lines over ${width} columns, first (${[...(w[0] ?? "")].length}): ${clip(w[0] ?? "", 140)}` : `every line ≤ ${width} columns`);
    }
  }

  // Errors: one line, and they teach.
  const named = (msg: string, n: string) => new RegExp(`(^|[^\\w-])${escapeRe(n)}([^\\w-]|$)`).test(msg);
  const teaches = (msg: string) => IMPERATIVE.test(msg) || new RegExp(`\\b${escapeRe(name)} [a-z]`).test(msg) || /(^|\s|")--[a-z]/.test(msg) || unique.some((n) => msg.includes(`"${n}`) || msg.includes(`\`${n}`));
  const errorChecks = (surface: string, c: RunResult & { shown: string; args: string[] }) => {
    const errLines = lines(c.stderr).filter((l) => l.trim());
    // With --json, stdout may carry the same error as one JSON document.
    const out = parseJson(c.stdout);
    const quiet = !c.stdout.trim() || (c.args.includes("--json") && out.ok && isRecord(out.value) && isRecord(out.value["error"]));
    const one = errLines.length === 1 && quiet;
    rec.add("cli.one-line-error", surface, one ? "pass" : "fail", one ? clip(errLines[0] ?? "") : `${brief(c)} (${errLines.length} stderr lines, ${lines(c.stdout).filter(Boolean).length} stdout lines)`);
    const t = errLines.length > 0 && teaches(c.stderr);
    rec.add("cli.error-teaches", surface, t ? "pass" : "fail", t ? clip(firstLine(c.stderr)) : `${brief(c)}: names no command or flag to try`);
  };

  // An unknown command.
  {
    const c = await call([NO_SUCH_COMMAND]);
    const heads = [...new Set(unique.map((n) => n.split(" ")[0] ?? n))];
    const listed = heads.filter((n) => named(c.stderr, n)).length;
    const codeOk = c.code !== 0 && !c.timedOut && (usageCode === null || c.code === usageCode);
    const pointsToHelp = c.stderr.includes(`${name} --help`) || c.stderr.includes(`${name} help`);
    const ok = codeOk && heads.length > 0 && (listed >= heads.length / 2 || pointsToHelp);
    rec.add("cli.unknown-command", NO_SUCH_COMMAND, ok ? "pass" : "fail", `${brief(c)}; lists ${listed} of ${heads.length} commands${usageCode !== null && c.code !== usageCode ? `; usage exit code is ${usageCode}` : ""}`);
    if (c.code !== 0) errorChecks(NO_SUCH_COMMAND, c);
  }

  // Ambiguous verbs, only when help JSON says what every command is: an unknown CLI's bare `delete` might act.
  for (const v of help ? AMBIGUOUS.filter((x) => !names.includes(x)) : []) {
    const c = await call([v]);
    const hits = unique.filter((n) => n !== "help" && named(c.stderr, n));
    const ok = c.code !== 0 && !c.timedOut && hits.length >= 1;
    rec.add("cli.ambiguous-verbs", v, ok ? "pass" : "fail", `${brief(c)}${ok ? `; names ${hits.join(", ")}` : ""}`);
    if (c.code !== 0) errorChecks(v, c);
  }

  // Reads: each command's argument-free usage first, then those needing one harvested ref. A wait is checked apart.
  const waiter = commands.find((c) => c.name === "watch" || c.name === "wait") ?? null;
  const samples: Record<string, string> = { word: "the", words: "the", text: "ax-xray preview text", new: "ax-xray preview text", note: "ax-xray preview text", ...opts.samples };
  const knowsReads = commands.some((c) => c.readOnly !== null);
  const readPlan = (cmd: CliCommand) => {
    for (const u of cmd.usage) {
      const w = requiredWords(u);
      const head = cmd.name.split(" ");
      if (head.some((x, i) => w[i] !== x)) continue;
      const rest = w.slice(head.length);
      if (rest.some((t) => t.startsWith("-") || t.includes("|") || t.includes("#") || (t.includes("<") && !/^<[^<>]+>$/.test(t)))) continue;
      const ph = rest.filter((t) => t.startsWith("<"));
      if (ph.length > 1) continue;
      if (!knowsReads && rest.some((t) => !t.startsWith("<") && !READ_WORDS.has(t))) continue;
      return { words: rest, placeholder: ph[0] ? placeholderKey(ph[0]) : null };
    }
    return null;
  };
  const readable = commands.filter((c) => c.effect === "private" && c !== waiter && (knowsReads ? c.readOnly === true : true));
  const plans = readable.map((c) => ({ cmd: c, plan: readPlan(c) }));
  const planned = [...plans.filter((p) => p.plan && !p.plan.placeholder), ...plans.filter((p) => p.plan?.placeholder)];
  const reads: { cmd: CliCommand; args: string[] }[] = [];
  for (const { cmd, plan } of planned) {
    if (!plan) continue;
    let words = plan.words;
    if (plan.placeholder) {
      const v = samples[plan.placeholder];
      if (!v) {
        rec.add("cli.read-json", cmd.name, "skip", `no sample for <${plan.placeholder}>; pass --sample ${plan.placeholder}=<value>`);
        continue;
      }
      words = words.map((t) => (t.startsWith("<") ? v : t));
    }
    const args = [...cmd.name.split(" "), ...words];
    reads.push({ cmd, args });
    const c = await call([...args, "--json"]);
    if (c.timedOut) {
      const ls = lines(c.stdout).filter((l) => l.trim());
      if (!ls.length) rec.add("cli.read-json", cmd.name, "skip", `\`${c.shown}\` streamed nothing in ${opts.timeoutMs} ms`);
      else rec.add("cli.read-json", cmd.name, ls.every((l) => parseJson(l).ok) ? "pass" : "fail", `a stream: ${ls.length} lines${ls.every((l) => parseJson(l).ok) ? ", each JSON" : ", not all JSON"}`);
      continue;
    }
    const j = parseJson(c.stdout);
    const ok = c.code === 0 && j.ok && !c.stderr.trim();
    rec.add("cli.read-json", cmd.name, ok ? "pass" : "fail", ok ? `\`${c.shown}\` → one JSON document` : `${brief(c)}${c.code === 0 && !j.ok ? "; stdout is not one JSON document" : ""}`);
    if (j.ok) harvest(j.value, samples, cmd.name.split(" ").at(-1) ?? null);
  }
  for (const { cmd, plan } of plans) {
    if (plan || cmd.usage.some((u) => requiredWords(u).length === cmd.name.split(" ").length)) continue;
    // Every usage needs something: the bare command must fail and say what.
    const c = await call(cmd.name.split(" "));
    const ok = c.code !== 0 && !c.timedOut && (usageCode === null || c.code === usageCode);
    rec.add("cli.missing-arg", cmd.name, ok ? "pass" : "fail", `${brief(c)}${usageCode !== null && c.code !== usageCode && c.code !== 0 ? `; usage exit code is ${usageCode}` : ""}`);
    if (c.code !== 0) errorChecks(`${cmd.name} (no argument)`, c);
  }

  // Flags: an unknown one, and a misspelt real one, on every read.
  const flagsOf = (cmd: CliCommand) =>
    [...new Set(cmd.usage.flatMap((u) => [...u.matchAll(/(?<![\w-])(--[a-z][\w-]+)( <[^>]+>| N\b)?/g)].map((m) => JSON.stringify({ flag: m[1], value: Boolean(m[2]) }))))]
      .map((s) => JSON.parse(s) as { flag: string; value: boolean })
      .filter((f) => !["--json", "--help", "--why", "--agent"].includes(f.flag));
  for (const { cmd, args } of reads) {
    const c = await call([...args, NO_SUCH_FLAG, "--json"]);
    const ok = c.code !== 0 && !c.timedOut && c.stderr.includes(NO_SUCH_FLAG);
    rec.add("cli.unknown-flag", cmd.name, ok ? "pass" : "fail", ok ? clip(firstLine(c.stderr)) : `${brief(c)}${c.code === 0 ? ": the flag was ignored" : ""}`);
    if (c.code !== 0 && !c.timedOut) errorChecks(`${cmd.name} ${NO_SUCH_FLAG}`, c);
    const f = flagsOf(cmd)[0];
    if (f) {
      const bad = misspell(f.flag);
      const m = await call([...args, bad, ...(f.value ? ["2"] : []), "--json"]);
      const refused = m.code !== 0 && !m.timedOut && m.stderr.includes(bad);
      rec.add("cli.unknown-flag", `${cmd.name} ${bad}`, refused ? "pass" : "fail", refused ? clip(firstLine(m.stderr)) : `${brief(m)}${m.code === 0 ? `: ${bad} was ignored, so the answer is not what was asked` : ""}`);
      const suggests = refused && m.stderr.includes(f.flag);
      rec.add("cli.flag-suggest", `${cmd.name} ${bad}`, suggests ? "pass" : "fail", suggests ? clip(firstLine(m.stderr)) : `${brief(m)}; does not name ${f.flag}`);
    }
  }

  if (stateBefore) {
    const d = stateDelta(stateBefore, await snapshot());
    rec.add("cli.reads-stay-reads", `${reads.length} reads, their flag probes and the missing-argument probes`, d.same ? "pass" : "fail", d.same ? `state: ${opts.state.join("; ")}` : `${opts.state.join("; ")} changed: ${refusalVerdict(d).note}`);
    if (!d.same) ctx.effects.push({ surface: "reads", note: refusalVerdict(d).note });
  } else rec.add("cli.reads-stay-reads", "state", "skip", stateNote);

  // Free text: a command that reads text from stdin ("-") must also take it as an argument: a quoted placeholder, a
  // placeholder where the "-" goes, `<text>|-`, or a text flag (--text <text>, --file <path>).
  for (const cmd of commands.filter((c) => c.effect === "private" || c.effect === "others")) {
    const stdinRe = /(^|\s|\||\{|\[)-(?=\s|$|\}|\]|\|)/;
    const stdin = cmd.usage.filter((u) => stdinRe.test(u));
    if (!stdin.length) continue;
    const forms = cmd.usage.map((u) => usageWords(u.replace(/\[[^[\]]*\]/g, " ")));
    const textFlag = cmd.usage.some((u) => /--(text|file|body|message)\s+<[^>]+>/.test(u));
    const quoted = cmd.usage.some((u) => /"<[^>]+>"/.test(u.replace(/--\w[\w-]* "<[^>]+>"/g, "")));
    const inPlace = forms.some((w) => {
      const i = w.indexOf("-");
      return i > 0 && forms.some((v) => v !== w && v[0] === w[0] && /^"?<[^>]+>"?$/.test(v[i] ?? "") && !v.includes("-"));
    });
    const altInline = stdin.some((u) => /\|\s*<[^>]+>\s*\|/.test(u) || /<[^>]+>\s*\|\s*-/.test(u));
    const ok = textFlag || quoted || inPlace || altInline;
    rec.add("cli.text-as-argument", cmd.name, ok ? "pass" : "fail", ok ? "an argument form is listed beside stdin" : `only stdin: ${clip(stdin.join("; "), 200)}`);
  }

  // Waiting: the wait command takes a conversation ref a read gave, and answers a typed wait.
  const convRef = ["conversation", "chat", "room", "channel"].map((k) => samples[k]).find(Boolean);
  if (waiter && convRef) {
    const waitedCode = exitCodes?.find((e) => /wait|didn.t happen|timed? ?out/i.test(`${String(e["name"] ?? "")} ${String(e["short"] ?? "")} ${String(e["meaning"] ?? "")}`))?.["code"];
    const c = await call([waiter.name, convRef, "--timeout", "1s"], null, Math.max(opts.timeoutMs, 15_000));
    const ok = !c.timedOut && c.code !== usageCode && (c.code === 0 || (waitedCode !== undefined && c.code === Number(waitedCode)) || /resume|--cursor|nothing (yet|happened)/i.test(c.stdout + c.stderr));
    rec.add("cli.wait-on-refs", `${waiter.name} <conversation>`, ok ? "pass" : "fail", brief(c));
    const t = await call([waiter.name, convRef, "--timeout", "1s", "--json"], null, Math.max(opts.timeoutMs, 15_000));
    const j = parseJson(t.stdout);
    const v = j.ok && isWait(j.value) ? validateWait(j.value) : null;
    rec.add("cli.wait-typed", `${waiter.name} <conversation> --json`, v?.ok ? "pass" : "fail", v ? (v.ok ? `wait/1, state ${String((j as { value: { state: string } }).value.state)}` : v.errors.join("; ")) : `${brief(t)}; not a wait/1`);
  } else if (waiter) {
    rec.add("cli.wait-on-refs", waiter.name, "skip", "no conversation ref harvested from the reads");
    rec.add("cli.wait-typed", waiter.name, "skip", "no conversation ref harvested from the reads");
  }

  // What other people see: refused paths, and a preview where the CLI offers one, only against a proven mock.
  const others = commands.filter((c) => c.effect === "others");
  const fill = (word: string, value: (key: string) => string | undefined) => word.replace(/<([^>]+)>/g, (_, p: string) => (/^name$/i.test(p) ? "ax-xray" : (value(placeholderKey(`<${p}>`)) ?? BOGUS)));
  if (others.length && !ctx.safety.ok) {
    for (const cmd of others) for (const id of ["cli.others-need-why", "cli.wrong-ref-first", "cli.others-preview", "cli.outcome"]) rec.add(id, cmd.name, "skip", refusedNote(ctx.safety));
  }
  for (const cmd of ctx.safety.ok ? others : []) {
    const head = cmd.name.split(" ");
    const words = usageWords((cmd.usage[0] ?? cmd.name).replace(/\[[^[\]]*\]/g, " "));
    let input: string | null = null;
    const target: string[] = [];
    for (let i = head.length; i < words.length; i++) {
      const w = words[i] ?? "";
      if (w === "--why") {
        i++;
        continue;
      }
      if (w === "-") input = "ax-xray probe text";
      target.push(w.includes("|") && !w.includes("<") ? (w.split("|")[0] ?? w) : w.replace(/\|-$/, ""));
    }
    // References are made up, so the call must be refused; values the caller supplied (an emoji) stay real.
    const bogus = target.map((w) => fill(w, (k) => opts.samples[k]));
    const pre = stateBefore ? await snapshot() : null;
    const noWhy = await call([...head, ...bogus], input);
    const whyOk = noWhy.code !== 0 && !noWhy.timedOut && /--why\b|\bwhy\b/i.test(noWhy.stderr);
    rec.add("cli.others-need-why", cmd.name, whyOk ? "pass" : "fail", brief(noWhy));
    if (noWhy.code !== 0 && !noWhy.timedOut) errorChecks(`${cmd.name} (no --why)`, noWhy);
    const wrong = await call([...head, ...bogus, "--why", WHY], input);
    const wrongOk = wrong.code !== 0 && !wrong.timedOut && teaches(wrong.stderr);
    rec.add("cli.wrong-ref-first", cmd.name, wrongOk ? "pass" : "fail", brief(wrong));
    if (wrong.code !== 0 && !wrong.timedOut) errorChecks(`${cmd.name} (wrong ref)`, wrong);
    if (pre) {
      const d = stateDelta(pre, await snapshot());
      const v = refusalVerdict(d);
      rec.add("cli.refusals-change-nothing", cmd.name, v.ok ? "pass" : "fail", v.note);
      if (!d.same) ctx.effects.push({ surface: `${cmd.name} (refused)`, note: v.note });
    }
    if (!/--dry-run\b/.test(helpText[cmd.name] ?? "")) {
      rec.add("cli.others-preview", cmd.name, "fail", `\`${name} ${cmd.name} --help\` offers no --dry-run, so who will see it can only be learnt by doing it`);
      rec.add("cli.outcome", cmd.name, "skip", "no --dry-run to read an outcome from");
      continue;
    }
    // A sample may name a whole word (`--sample "<conversation>#<message id>=abc#123"`), or a word in one command (`react:<...>=...`).
    const wholeSample = (w: string) => opts.samples[`${cmd.name}:${w}`] ?? opts.samples[w];
    const realWord = (w: string) => {
      const whole = wholeSample(w);
      if (whole !== undefined) return whole;
      const keys = [...w.matchAll(/<([^>]+)>/g)].map((m) => placeholderKey(`<${m[1]}>`));
      // A harvested message ref already carries its conversation: "<conversation>#<message id>" is that ref alone.
      const last = samples[keys[keys.length - 1] ?? ""];
      if (keys.length > 1 && w.includes("#") && last?.includes("#")) return last;
      return fill(w, (k) => samples[k]);
    };
    const missing = target.filter((w) => wholeSample(w) === undefined).flatMap((w) => [...w.matchAll(/<([^>]+)>/g)].map((m) => placeholderKey(`<${m[1]}>`))).filter((k) => k !== "name" && !samples[k]);
    if (missing.length) {
      rec.add("cli.others-preview", cmd.name, "skip", `no sample for <${missing[0]}>; pass --sample ${missing[0]}=<value>`);
      rec.add("cli.outcome", cmd.name, "skip", `no sample for <${missing[0]}>`);
      continue;
    }
    const real = target.map(realWord);
    const before = stateBefore ? await snapshot() : null;
    const dry = await call([...head, ...real, "--why", WHY, "--dry-run"], input);
    const dryJson = await call([...head, ...real, "--why", WHY, "--dry-run", "--json"], input);
    const after = stateBefore ? await snapshot() : null;
    const unchanged = !before || JSON.stringify(before) === JSON.stringify(after);
    if (!unchanged && before && after) ctx.effects.push({ surface: `${cmd.name} --dry-run`, note: refusalVerdict(stateDelta(before, after)).note });
    const ok = dry.code === 0 && /\b(see|sees|seen|visible|will get|will know|notified)\b/i.test(dry.stdout) && unchanged;
    rec.add("cli.others-preview", cmd.name, ok ? "pass" : "fail", `${brief(dry)}${!unchanged ? "; the state changed" : ""}`);
    const j = parseJson(dryJson.stdout);
    const o = j.ok && isOutcome(j.value) ? j.value : null;
    const v = o ? validateOutcome(o) : null;
    const planned = o?.state === "planned";
    rec.add("cli.outcome", cmd.name, v?.ok && planned ? "pass" : "fail", o ? (planned ? (v?.ok ? `outcome/1, planned, audience: ${o.audience.who}` : (v?.errors ?? []).join("; ")) : `outcome/1 in state ${o.state}, not planned`) : `${brief(dryJson)}; not an outcome/1`);
  }

  // Work events, read through the interface.
  if (opts.events) {
    const c = await call(splitCommand(opts.events));
    const j = parseJson(c.stdout);
    const list = j.ok ? (Array.isArray(j.value) ? j.value : isRecord(j.value) && Array.isArray(j.value["events"]) ? j.value["events"] : null) : lines(c.stdout).every((l) => parseJson(l).ok) && c.stdout.trim() ? lines(c.stdout).map((l) => JSON.parse(l) as unknown) : null;
    if (!list) rec.add("cli.work-events", opts.events, "fail", `${brief(c)}; not a list of events`);
    else {
      const bad = list.map((e) => checkWorkEvent(e)).filter((r): r is { ok: false; problem: string; fix: string } => !r.ok);
      rec.add("cli.work-events", opts.events, bad.length ? "fail" : "pass", bad[0] ? `${bad.length} of ${list.length} events are not work-event/1; first: ${bad[0].problem}. Fix: ${bad[0].fix}` : `${list.length} events, each work-event/1`);
    }
  } else rec.add("cli.work-events", "events", "skip", "no --events command given");

  // The whole run: what the X-ray changed, which must be nothing but refusal records.
  if (runStart) {
    const d = stateDelta(runStart, await snapshot());
    const v = refusalVerdict(d);
    rec.add("cli.refusals-change-nothing", "the whole run", v.ok ? "pass" : "fail", v.ok ? `planned effects: none; ${v.note}` : `an unplanned write: ${v.note}`);
    if (!d.same) ctx.effects.push({ surface: "the whole run", note: v.note });
  }

  // Across every call.
  const traced = calls.filter((c) => hasStack(c.stdout) || hasStack(c.stderr));
  if (traced.length) for (const c of traced) rec.add("cli.no-stack-trace", c.shown, "fail", clip(c.stderr.split("\n").slice(0, 3).join(" | ")));
  else rec.add("cli.no-stack-trace", `all ${calls.length} calls`, "pass");
  if (documented) {
    const known = documented;
    const bad = calls.filter((c) => !c.timedOut && !known.has(c.code ?? -1));
    if (bad.length) for (const c of bad) rec.add("cli.exit-codes", c.shown, "fail", `exit ${c.code} is not documented (${[...known].join(", ")})`);
    else rec.add("cli.exit-codes", `all ${calls.length} calls`, "pass", `documented: ${[...known].join(", ")}`);
  } else rec.add("cli.exit-codes", "help", "fail", "no exit codes in help --json or an `Exit codes:` line");

  return { name, calls: calls.length, commands: unique.length };
}

function stripKeys(value: unknown, keys: readonly string[]): unknown {
  if (!keys.length) return value;
  if (Array.isArray(value)) return value.map((v) => stripKeys(v, keys));
  if (isRecord(value)) return Object.fromEntries(Object.entries(value).filter(([k]) => !keys.includes(k)).map(([k, v]) => [k, stripKeys(v, keys)]));
  return value;
}

interface RoutesManifest {
  base?: string;
  routes?: string[];
  state?: string[];
  skip?: string[];
  others?: { route: string; why?: string; body?: Record<string, unknown> }[];
}

interface HttpAnswer {
  status: number;
  type: string;
  text: string;
  json: Parsed;
}

async function checkHttp(ctx: Context) {
  const { rec, opts } = ctx;
  const manifest = JSON.parse(readFileSync(opts.routes ?? "", "utf8")) as RoutesManifest;
  const origin = (opts.http ?? "").replace(/\/$/, "");
  const basePath = manifest.base ?? "/api";
  const routes = manifest.routes ?? [];
  let count = 0;
  const req = async (method: string, p: string, body?: unknown): Promise<HttpAnswer> => {
    count++;
    try {
      const r = await fetch(origin + p, { method, ...(body === undefined ? {} : { headers: { "content-type": "application/json" }, body: JSON.stringify(body) }), signal: AbortSignal.timeout(opts.timeoutMs), redirect: "manual" });
      const text = await r.text();
      return { status: r.status, type: r.headers.get("content-type") ?? "", text, json: parseJson(text) };
    } catch (e) {
      return { status: 0, type: "", text: e instanceof Error ? e.message : String(e), json: { ok: false } };
    }
  };
  const errorOf = (r: HttpAnswer) => (r.json.ok && isRecord(r.json.value) && typeof r.json.value["error"] === "string" ? r.json.value["error"] : null);
  const brief = (method: string, p: string, r: HttpAnswer) => `\`${method} ${p}\` → ${r.status}${r.text ? ` ${clip(r.text.replace(/\s+/g, " "), 160)}` : ""}`;
  const teaches = (msg: string) => IMPERATIVE.test(msg) || /\b(GET|POST|PUT|DELETE|PATCH) \//.test(msg) || msg.includes(`${basePath}/`) || /(^|\s)--[a-z]/.test(msg) || (opts.name ? msg.includes(`${opts.name} `) : false);
  const errorChecks = (surface: string, method: string, p: string, r: HttpAnswer) => {
    const error = errorOf(r);
    rec.add("http.error-shape", surface, error !== null ? "pass" : "fail", brief(method, p, r));
    const t = error !== null && teaches(error);
    rec.add("http.error-teaches", surface, t ? "pass" : "fail", error !== null ? (t ? clip(error) : `"${clip(error)}" names no route, flag or command`) : brief(method, p, r));
  };
  const snapshot = async () => {
    const out: string[] = [];
    for (const s of manifest.state ?? []) {
      const r = await req("GET", s.split(" ")[1] ?? s);
      out.push(r.json.ok ? JSON.stringify(stripKeys(r.json.value, opts.volatile)) : r.text);
    }
    return out;
  };
  let stateBefore: string[] | null = null;
  if ((manifest.state ?? []).length) {
    const a = await snapshot();
    const b = await snapshot();
    if (JSON.stringify(a) === JSON.stringify(b)) stateBefore = b;
  }
  recordInventory(rec, "http.inventory", ctx.inventory?.http ? compareInventory(ctx.inventory.http, routes) : null, "the routes manifest");

  // The index.
  {
    const r = await req("GET", basePath);
    const text = r.json.ok ? JSON.stringify(r.json.value) : "";
    const named = routes.filter((rt) => text.includes(rt) || text.includes(rt.split(" ")[1] ?? rt));
    const ok = r.status === 200 && r.json.ok && named.length >= routes.length * 0.8;
    rec.add("http.index", `GET ${basePath}`, ok ? "pass" : "fail", `${brief("GET", basePath, r)}; names ${named.length} of ${routes.length} routes`);
  }
  // An unknown route.
  {
    const p = `${basePath}/ax-xray-no-such-route`;
    const r = await req("GET", p);
    const error = errorOf(r);
    const ok = r.status === 404 && error !== null && teaches(error);
    rec.add("http.unknown-route", `GET ${p}`, ok ? "pass" : "fail", brief("GET", p, r));
    if (r.status >= 400) errorChecks(`GET ${p}`, "GET", p, r);
  }
  // Every read route.
  for (const rt of routes) {
    const [method, p = ""] = rt.split(" ");
    if (method !== "GET" || p.includes("?") || (manifest.skip ?? []).includes(rt)) continue;
    const real = p.replace(/\{[^}]+\}/g, BOGUS);
    const r = await req("GET", real);
    const json = /json/i.test(r.type) && r.json.ok;
    rec.add("http.json", rt, json ? "pass" : "fail", json ? `${r.status}` : brief("GET", real, r));
    if (p.includes("{")) {
      const error = errorOf(r);
      const ok = r.status >= 400 && r.status < 500 && error !== null && teaches(error);
      rec.add("http.wrong-ref-first", rt, ok ? "pass" : "fail", brief("GET", real, r));
    }
    if (r.status >= 400) errorChecks(rt, "GET", real, r);
  }
  if (stateBefore) {
    const d = stateDelta(stateBefore, await snapshot());
    rec.add("http.reads-stay-reads", `${count} GET requests`, d.same ? "pass" : "fail", `${(manifest.state ?? []).join("; ")}${d.same ? " unchanged" : ` changed: ${refusalVerdict(d).note}`}`);
    if (!d.same) ctx.effects.push({ surface: "GET requests", note: refusalVerdict(d).note });
  } else rec.add("http.reads-stay-reads", "state", "skip", (manifest.state ?? []).length ? "the state routes answer differently with nothing run between them" : "the manifest names no state routes");
  // What other people see: refused probes only, and only against a proven mock.
  for (const probe of manifest.others ?? []) {
    const label = `${probe.route}${typeof probe.body?.["action"] === "string" ? ` (${probe.body["action"]})` : ""}`;
    if (!ctx.safety.ok) {
      for (const id of ["http.others-need-why", "http.wrong-ref-first"]) rec.add(id, label, "skip", refusedNote(ctx.safety));
      continue;
    }
    const pre = stateBefore ? await snapshot() : null;
    const [method = "POST", p = ""] = probe.route.split(" ");
    const real = p.replace(/\{[^}]+\}/g, BOGUS);
    const body = JSON.parse(JSON.stringify(probe.body ?? {}).replaceAll("{ref}", BOGUS)) as Record<string, unknown>;
    const whyField = probe.why ?? "why";
    const noWhy = await req(method, real, body);
    const whyOk = noWhy.status >= 400 && noWhy.status < 500 && noWhy.text.includes(whyField);
    rec.add("http.others-need-why", label, whyOk ? "pass" : "fail", brief(method, real, noWhy));
    if (noWhy.status >= 400) errorChecks(`${label} (no ${whyField})`, method, real, noWhy);
    const wrong = await req(method, real, { ...body, [whyField]: WHY });
    const error = errorOf(wrong);
    const wrongOk = wrong.status >= 400 && wrong.status < 500 && error !== null && teaches(error);
    rec.add("http.wrong-ref-first", label, wrongOk ? "pass" : "fail", brief(method, real, wrong));
    if (wrong.status >= 400) errorChecks(`${label} (wrong ref)`, method, real, wrong);
    if (pre) {
      const d = stateDelta(pre, await snapshot());
      const v = refusalVerdict(d);
      rec.add("http.refusals-change-nothing", label, v.ok ? "pass" : "fail", v.note);
      if (!d.same) ctx.effects.push({ surface: `${label} (refused)`, note: v.note });
    }
  }
  return { origin, routes: routes.length, requests: count };
}

interface RpcReply {
  id?: unknown;
  result?: { tools?: unknown; content?: { text?: string }[]; isError?: boolean };
  error?: { message?: string; data?: unknown };
}

async function checkMcp(ctx: Context) {
  const { rec, opts } = ctx;
  const argv = splitCommand(opts.mcp ?? "");
  const child = spawn(argv[0] ?? "", argv.slice(1), { env: ctx.env, stdio: ["pipe", "pipe", "pipe"] });
  let buf = "";
  const waiting = new Map<number, (v: RpcReply) => void>();
  child.stdout.on("data", (d: Buffer) => {
    buf += String(d);
    let i;
    while ((i = buf.indexOf("\n")) >= 0) {
      const j = parseJson(buf.slice(0, i));
      buf = buf.slice(i + 1);
      const id = j.ok && isRecord(j.value) ? j.value["id"] : undefined;
      if (typeof id === "number" && waiting.has(id)) {
        waiting.get(id)?.(j.ok ? (j.value as RpcReply) : {});
        waiting.delete(id);
      }
    }
  });
  child.on("error", () => undefined);
  child.stdin.on("error", () => undefined);
  let id = 0;
  const request = (method: string, params: unknown) =>
    new Promise<RpcReply>((done) => {
      const my = ++id;
      const t = setTimeout(() => {
        waiting.delete(my);
        done({ error: { message: `no answer to ${method} in ${opts.timeoutMs} ms` } });
      }, opts.timeoutMs);
      waiting.set(my, (v) => {
        clearTimeout(t);
        done(v);
      });
      child.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", id: my, method, params })}\n`);
    });
  const textOf = (r: RpcReply) => (r.error ? String(r.error.message ?? "") + JSON.stringify(r.error.data ?? "") : (r.result?.content ?? []).map((c) => c.text ?? "").join(" "));
  const refused = (r: RpcReply) => Boolean(r.error) || r.result?.isError === true;
  try {
    const init = await request("initialize", { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "ax-xray", version: XRAY_VERSION } });
    if (init.error) {
      rec.add("mcp.tools-list", "initialize", "fail", textOf(init));
      return { tools: 0 };
    }
    child.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" })}\n`);
    const list = await request("tools/list", {});
    const tools = Array.isArray(list.result?.tools) ? list.result.tools.filter(isRecord) : null;
    if (!tools) {
      rec.add("mcp.tools-list", "tools/list", "fail", textOf(list) || "no tools array");
      return { tools: 0 };
    }
    recordInventory(rec, "mcp.inventory", ctx.inventory?.mcp ? compareInventory(ctx.inventory.mcp, tools.map((t) => String(t["name"]))) : null, "tools/list");
    for (const t of tools) {
      const tname = String(t["name"]);
      const schema = t["inputSchema"];
      const ok = typeof t["description"] === "string" && t["description"].trim() !== "" && isRecord(schema);
      rec.add("mcp.tools-list", tname, ok ? "pass" : "fail", ok ? clip(String(t["description"]), 120) : `missing ${typeof t["description"] === "string" && t["description"].trim() ? "inputSchema" : "description"}`);
      const a = isRecord(t["annotations"]) ? t["annotations"] : {};
      const ann = typeof a["readOnlyHint"] === "boolean" || typeof a["destructiveHint"] === "boolean";
      rec.add("mcp.effect-annotated", tname, ann ? "pass" : "fail", ann ? JSON.stringify(a) : "no readOnlyHint or destructiveHint");
      const required = isRecord(schema) && Array.isArray(schema["required"]) ? schema["required"].map(String) : [];
      if (required.length && a["readOnlyHint"] !== true && !ctx.safety.ok) rec.add("mcp.bad-call-teaches", tname, "skip", refusedNote(ctx.safety));
      else if (required.length) {
        const r = await request("tools/call", { name: tname, arguments: {} });
        const text = textOf(r);
        const ok2 = refused(r) && required.some((f) => text.includes(f));
        rec.add("mcp.bad-call-teaches", tname, ok2 ? "pass" : "fail", `${refused(r) ? "refused" : "ran"}: ${clip(text || "(no text)")}`);
      }
    }
    const u = await request("tools/call", { name: "ax_xray_no_such_tool", arguments: {} });
    const ut = textOf(u);
    const ok = refused(u) && (ut.includes("tools/list") || tools.some((t) => ut.includes(String(t["name"]))));
    rec.add("mcp.unknown-tool", "ax_xray_no_such_tool", ok ? "pass" : "fail", `${refused(u) ? "refused" : "ran"}: ${clip(ut || "(no text)")}`);
    return { tools: tools.length };
  } finally {
    child.kill();
  }
}

interface ClaimSummary extends Claim {
  pass: number;
  fail: number;
  skip: number;
  holds: boolean;
  failing: CheckResult[];
  skipped: CheckResult[];
}

interface Report {
  tool: "ax-xray";
  checker: { version: string };
  claimSet: { version: string; hash: string };
  at: string;
  target: { commit: string | null; cli?: { name: string; calls: number; commands: number }; http?: { origin: string; routes: number; requests: number }; mcp?: { tools: number } };
  safety: Safety;
  inventory: { given: boolean; surfaces: ClaimSurface[] };
  effects: { surface: string; note: string }[];
  /**
   * Every applicable must claim holds, none was skipped, and the inventory covered every checked surface.
   *
   * @claim "Every applicable must claim holds" registry/ouro/ax/xray.test.mts verify:testExists(registry/ouro/ax/xray.test.mts::the kit's example tool conforms, and the X-ray acts on nothing)
   */
  conformant: boolean;
  summary: { claims: number; holding: number; must: number; mustHolding: number; mustSkipped: number; checks: { pass: number; fail: number; skip: number }; score: number | null };
  claims: ClaimSummary[];
  results: CheckResult[];
}

/** The report from the results: per claim, how many surfaces hold it; overall, whether the interface conforms. */
function summarize(results: readonly CheckResult[], parts: Pick<Report, "target" | "safety" | "inventory" | "effects">, at: string = new Date().toISOString()): Report {
  const claims: ClaimSummary[] = CLAIMS.filter((c) => results.some((r) => r.claim === c.id)).map((c) => {
    const rs = results.filter((r) => r.claim === c.id);
    const count = (v: Verdict) => rs.filter((r) => r.verdict === v).length;
    return { ...c, pass: count("pass"), fail: count("fail"), skip: count("skip"), holds: count("fail") === 0 && count("pass") > 0, failing: rs.filter((r) => r.verdict === "fail"), skipped: rs.filter((r) => r.verdict === "skip") };
  });
  const count = (v: Verdict) => results.filter((r) => r.verdict === v).length;
  const must = claims.filter((c) => c.tier === "must");
  const mustSkipped = must.filter((c) => c.skip > 0).length;
  const checked = new Set(results.map((r) => CLAIM.get(r.claim)?.surface));
  const pass = count("pass");
  const fail = count("fail");
  return {
    tool: "ax-xray",
    checker: { version: XRAY_VERSION },
    claimSet: { version: CLAIM_SET.version, hash: claimSetHash() },
    at,
    ...parts,
    conformant: must.every((c) => c.fail === 0 && c.skip === 0) && parts.inventory.given && [...checked].every((s) => s === undefined || parts.inventory.surfaces.includes(s)),
    summary: { claims: claims.length, holding: claims.filter((c) => c.holds).length, must: must.length, mustHolding: must.filter((c) => c.holds).length, mustSkipped, checks: { pass, fail, skip: count("skip") }, score: pass + fail ? Math.round((1000 * pass) / (pass + fail)) / 10 : null },
    claims,
    results: [...results],
  };
}

const targetLine = (t: Report["target"]) =>
  [t.commit && `at ${t.commit}`, t.cli && `CLI \`${t.cli.name}\` (${t.cli.commands} commands, ${t.cli.calls} calls)`, t.http && `HTTP ${t.http.origin} (${t.http.routes} routes in the manifest, ${t.http.requests} requests)`, t.mcp && `MCP (${t.mcp.tools} tools)`].filter(Boolean).join("; ");
const order = (claims: readonly ClaimSummary[]) => [...claims].sort((a, b) => Number(a.holds) - Number(b.holds) || (a.tier === b.tier ? 0 : a.tier === "must" ? -1 : 1) || b.fail - a.fail);
const mark = (c: ClaimSummary) => (c.holds ? "✓" : c.fail ? "✗" : "–");
const pinLine = (r: Report) => `Ouro AX claim set ${r.claimSet.version} (sha256 ${r.claimSet.hash}), checked by ax-xray ${r.checker.version} at ${r.at}.`;
const verdictLine = (r: Report) =>
  r.conformant ? "Conforms: every applicable must claim holds, and the inventory covers every surface checked." : `Does not conform yet: ${[r.summary.mustHolding < r.summary.must ? `${r.summary.must - r.summary.mustHolding} must claim${r.summary.must - r.summary.mustHolding === 1 ? "" : "s"} not holding` : "", !r.inventory.given ? "no inventory given" : "", r.summary.mustSkipped ? `${r.summary.mustSkipped} must claim${r.summary.mustSkipped === 1 ? "" : "s"} skipped` : ""].filter(Boolean).join("; ")}.`;
const safetyLine = (r: Report) => `Calls to what other people see: ${r.safety.ok ? "allowed, the target is a proven mock" : "not made"} (${r.safety.checks.map((c) => `${c.name}: ${c.ok ? "yes" : "no"}`).join(", ")}).`;
const effectsLine = (r: Report) => (r.effects.length ? `Effects the X-ray caused: ${r.effects.map((e) => `${e.surface}: ${e.note}`).join("; ")}.` : "Effects the X-ray caused: none recorded.");

function renderText(report: Report, max = 6): string {
  const s = report.summary;
  const out = [`ax-xray: ${targetLine(report.target)}`, pinLine(report), verdictLine(report), `Claims holding: ${s.holding} of ${s.claims} (must: ${s.mustHolding} of ${s.must}). Checks: ${s.checks.pass} pass, ${s.checks.fail} fail, ${s.checks.skip} skipped.`, safetyLine(report), effectsLine(report), ""];
  for (const c of order(report.claims)) {
    out.push(`${mark(c)} ${c.id} [${c.tier}] ${c.rule} (${c.pass} of ${c.pass + c.fail}${c.skip ? `, ${c.skip} skipped` : ""})`);
    for (const f of c.failing.slice(0, max)) out.push(`    ${f.surface}: ${f.note}`);
    if (c.failing.length > max) out.push(`    … ${c.failing.length - max} more`);
    if (c.fail) out.push(`    Fix: ${c.fix}`);
  }
  return `${out.join("\n")}\n`;
}

const md = (s: string) => s.replace(/\|/g, "\\|").replace(/\n/g, " ");
const titleOf = (r: Report) => r.target.cli?.name ?? r.target.http?.origin ?? "MCP server";
const bySurface = (r: Report) => {
  const by: Record<string, CheckResult[]> = {};
  for (const x of r.results) (by[`${CLAIM.get(x.claim)?.surface ?? "?"} · ${x.surface}`] ??= []).push(x);
  return by;
};

function renderMarkdown(report: Report): string {
  const s = report.summary;
  const out = [
    `# AX X-ray: ${titleOf(report)}`,
    "",
    `${pinLine(report)} Target: ${targetLine(report.target)}.`,
    "",
    `**${verdictLine(report)}** Claims holding: ${s.holding} of ${s.claims} (must: ${s.mustHolding} of ${s.must}). Checks: ${s.checks.pass} pass, ${s.checks.fail} fail, ${s.checks.skip} skipped.`,
    "",
    safetyLine(report),
    "",
    effectsLine(report),
    "",
    "| | Claim | Tier | Rule | Pass | Fail | Skip |",
    "|---|---|---|---|---|---|---|",
    ...order(report.claims).map((c) => `| ${mark(c)} | \`${c.id}\` | ${c.tier} | ${md(c.rule)} | ${c.pass} | ${c.fail} | ${c.skip} |`),
    "",
    "## What fails, and the fix",
    "",
  ];
  for (const c of order(report.claims).filter((x) => x.fail)) {
    out.push(`### \`${c.id}\`: ${c.rule}`, "", `Why: ${c.why}`, "", `Fix: ${c.fix}`, "");
    for (const f of c.failing) out.push(`- **${md(f.surface)}**: ${md(f.note)}`);
    out.push("");
  }
  out.push("## Every surface", "", "| Surface | Holds | Fails | Skipped |", "|---|---|---|---|");
  for (const [k, rs] of Object.entries(bySurface(report))) {
    const ids = (v: Verdict) => rs.filter((r) => r.verdict === v).map((r) => `\`${r.claim}\``).join(" ");
    out.push(`| ${md(k)} | ${ids("pass")} | ${ids("fail")} | ${ids("skip")} |`);
  }
  return `${out.join("\n")}\n`;
}

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c] ?? c);

function renderHtml(report: Report): string {
  const s = report.summary;
  const claims = order(report.claims);
  const cell = (rs: CheckResult[], id: string) => {
    const r = rs.filter((x) => x.claim === id);
    if (!r.length) return "<td></td>";
    const v = r.some((x) => x.verdict === "fail") ? "fail" : r.some((x) => x.verdict === "pass") ? "pass" : "skip";
    return `<td class="${v}" title="${esc(r.map((x) => `${x.verdict}: ${x.note}`).join("\n"))}">${v === "pass" ? "✓" : v === "fail" ? "✗" : "–"}</td>`;
  };
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>AX X-ray: ${esc(titleOf(report))}</title><style>
body{font:14px/1.5 system-ui,sans-serif;margin:2rem;color:#1b1b1f;background:#fff}h1{font-size:1.5rem}code{font:12px ui-monospace,monospace}
table{border-collapse:collapse;margin:1rem 0}th,td{border:1px solid #d0d0d7;padding:.25rem .5rem;text-align:left;vertical-align:top}
th.v{writing-mode:vertical-rl;transform:rotate(180deg);font-weight:500;white-space:nowrap}td.pass{background:#e6f4ea;color:#14532d;text-align:center}td.fail{background:#fde8e8;color:#7f1d1d;text-align:center}td.skip{background:#f3f3f5;text-align:center}
.holds{color:#14532d}.fails{color:#7f1d1d}details{margin:.5rem 0}summary{cursor:pointer}
@media (prefers-color-scheme:dark){body{background:#151518;color:#e8e8ee}th,td{border-color:#3a3a44}td.pass{background:#12351f;color:#bbf7d0}td.fail{background:#3b1414;color:#fecaca}td.skip{background:#26262c}.holds{color:#86efac}.fails{color:#fca5a5}}
</style></head><body><main>
<h1>AX X-ray: ${esc(titleOf(report))}</h1>
<p>${esc(pinLine(report))} ${esc(targetLine(report.target))}.</p>
<p><strong>${esc(verdictLine(report))}</strong> Claims holding: ${s.holding} of ${s.claims} (must: ${s.mustHolding} of ${s.must}). Checks: ${s.checks.pass} pass, ${s.checks.fail} fail, ${s.checks.skip} skipped.</p>
<p>${esc(safetyLine(report))}</p>
<p>${esc(effectsLine(report))}</p>
<h2>Claims</h2>
${claims.map((c) => `<details${c.fail ? " open" : ""}><summary class="${c.holds ? "holds" : "fails"}">${mark(c)} <code>${esc(c.id)}</code> [${c.tier}] ${esc(c.rule)} (${c.pass} of ${c.pass + c.fail})</summary><p>${esc(c.why)}</p>${c.fail ? `<p><strong>Fix:</strong> ${esc(c.fix)}</p><ul>${c.failing.map((f) => `<li><code>${esc(f.surface)}</code>: ${esc(f.note)}</li>`).join("")}</ul>` : ""}</details>`).join("\n")}
<h2>Every surface</h2>
<table><thead><tr><th>Surface</th>${claims.map((c) => `<th class="v" scope="col"><code>${esc(c.id)}</code></th>`).join("")}</tr></thead><tbody>
${Object.entries(bySurface(report)).map(([k, rs]) => `<tr><th scope="row"><code>${esc(k)}</code></th>${claims.map((c) => cell(rs, c.id)).join("")}</tr>`).join("\n")}
</tbody></table></main></body></html>
`;
}

const USAGE = `ax-xray ${XRAY_VERSION}: checks an agent-facing interface against the Ouro AX claims, from outside.

  node xray.ts --cli "<command>" [options]
  node xray.ts --http <url> --routes <manifest.json> [options]
  node xray.ts --mcp "<command>" [options]
  node xray.ts claims [--json]        the standard: every claim, its tier, rule and check

Options:
  --inventory <file>     the surfaces your interface registers, generated from its own registration:
                         { "cli": [names], "http": ["GET /api/x"], "mcp": [names] }
  --conformance          exit 1 unless it conforms: every applicable must claim holds, none skipped, inventory given
  --mock "<url> k=v"     prove the target is a mock: a loopback URL whose JSON has k=v (such as mock=true)
  --guard "<command>"    run this first; refuse to check unless it exits 0 (it also proves a mock)
  --home <dir>           the isolated home every checked program runs with
  --env K=V              set an environment variable for every call (repeat); nothing else is passed on but PATH
  --state "<args>"       CLI args whose output is the state that must not change (repeat)
  --events "<args>"      CLI args that list the interface's work events, to validate
  --commit <sha>         the commit checked, recorded in the report
  --name <name>          the CLI's name in its messages (default: the command's file name)
  --volatile k,k         JSON keys to ignore when comparing state
  --sample k=v           a ref for <k> placeholders (repeat); others are harvested from reads
  --width N              help width limit (default 100)
  --timeout <ms>         per call (default 20000)
  --json                 print the report as JSON
  --md <file>            also write the report as Markdown
  --html <file>          also write the report as a static HTML page
Exit codes: 0 no must claim fails (with --conformance: it conforms), 1 a must claim fails or it does not conform, 2 usage or the guard refused.
`;

const FLAGS: Readonly<Record<string, boolean>> = Object.freeze({
  "--cli": true, "--http": true, "--routes": true, "--mcp": true, "--name": true, "--env": true, "--guard": true, "--mock": true, "--home": true, "--inventory": true, "--events": true, "--commit": true,
  "--state": true, "--volatile": true, "--sample": true, "--width": true, "--timeout": true, "--json": false, "--conformance": false, "--md": true, "--html": true, "--help": false,
});

class UsageError extends Error {}

function distance(a: string, b: string): number {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array<number>(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0]![j] = j;
  for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) d[i]![j] = Math.min(d[i - 1]![j]! + 1, d[i]![j - 1]! + 1, d[i - 1]![j - 1]! + (a[i - 1] === b[j - 1] ? 0 : 1));
  return d[a.length]![b.length]!;
}

function parseArgs(argv: readonly string[]): XrayOptions {
  const o: XrayOptions = { env: {}, state: [], volatile: [], samples: {}, width: 100, timeoutMs: 20_000, json: false, conformance: false, command: null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i] ?? "";
    if (!a.startsWith("--")) {
      if (o.command === null && (a === "claims" || a === "help")) {
        o.command = a;
        continue;
      }
      throw new UsageError(`unexpected "${a}". Fix: node xray.ts --help.`);
    }
    if (!(a in FLAGS)) {
      const near = Object.keys(FLAGS).sort((x, y) => distance(a, x) - distance(a, y))[0];
      throw new UsageError(`there is no ${a}. Fix: ${near}.`);
    }
    const v = FLAGS[a] ? argv[++i] : "";
    if (v === undefined) throw new UsageError(`${a} needs a value. Fix: node xray.ts --help.`);
    if (a === "--env" || a === "--sample") {
      const eq = v.indexOf("=");
      if (eq < 1) throw new UsageError(`${a} takes K=V, not "${v}". Fix: ${a} NAME=value.`);
      (a === "--env" ? o.env : o.samples)[v.slice(0, eq)] = v.slice(eq + 1);
    } else if (a === "--state") o.state.push(v);
    else if (a === "--volatile") o.volatile = v.split(",").filter(Boolean);
    else if (a === "--width" || a === "--timeout") {
      const n = Number(v);
      if (!Number.isFinite(n) || n <= 0) throw new UsageError(`${a} takes a positive number, not "${v}". Fix: ${a} ${a === "--width" ? 100 : 20000}.`);
      if (a === "--width") o.width = n;
      else o.timeoutMs = n;
    } else if (a === "--json") o.json = true;
    else if (a === "--conformance") o.conformance = true;
    else if (a === "--help") o.command = "help";
    else {
      const key = a.slice(2) as "cli" | "http" | "routes" | "mcp" | "name" | "guard" | "mock" | "home" | "inventory" | "events" | "commit" | "md" | "html";
      o[key] = v;
    }
  }
  if (o.http && !o.routes) throw new UsageError("--http needs --routes <manifest.json>, the routes to check. Fix: --routes routes.json.");
  if (!o.command && !o.cli && !o.http && !o.mcp) throw new UsageError("nothing to check. Fix: give --cli, --http or --mcp; node xray.ts --help.");
  if (o.conformance && !o.inventory) throw new UsageError("--conformance needs --inventory <file>, the surfaces your interface registers. Fix: --inventory inventory.json.");
  return o;
}

/** Runs the X-ray: the guard, the safety proof, then the surfaces given; returns the report. */
async function xray(opts: XrayOptions): Promise<Report> {
  const env = childEnv(opts);
  let guardPassed = false;
  if (opts.guard) {
    const g = await run(splitCommand(opts.guard), env, opts.timeoutMs);
    if (g.code !== 0) throw new UsageError(`refusing: the guard failed: ${firstLine(g.stderr) || firstLine(g.stdout) || `exit ${String(g.code)}`}. Fix: point it at the mock.`);
    guardPassed = true;
  }
  const inventory = opts.inventory ? (JSON.parse(readFileSync(opts.inventory, "utf8")) as Inventory) : null;
  const ctx: Context = { rec: new Recorder(), opts, env, safety: await checkSafety(opts, guardPassed), inventory, effects: [] };
  const target: Report["target"] = { commit: opts.commit ?? null };
  if (opts.cli) target.cli = await checkCli(ctx);
  if (opts.http) target.http = await checkHttp(ctx);
  if (opts.mcp) target.mcp = await checkMcp(ctx);
  const surfaces = (["cli", "http", "mcp"] as const).filter((s) => Array.isArray(inventory?.[s]));
  return summarize(ctx.rec.results, { target, safety: ctx.safety, inventory: { given: inventory !== null, surfaces }, effects: ctx.effects });
}

interface Io {
  stdout: { write(s: string): unknown };
  stderr: { write(s: string): unknown };
}

/** The command: parses argv, runs, writes the reports; resolves the exit code. */
async function main(argv: readonly string[], io: Io = { stdout: process.stdout, stderr: process.stderr }): Promise<number> {
  try {
    const o = parseArgs(argv);
    if (o.command === "help") {
      io.stdout.write(USAGE);
      return 0;
    }
    if (o.command === "claims") {
      io.stdout.write(o.json ? `${JSON.stringify({ ...CLAIM_SET, hash: claimSetHash() }, null, 2)}\n` : `${CLAIMS.map((c) => `${c.id} [${c.tier}] ${c.rule}\n    check: ${c.check}`).join("\n")}\n`);
      return 0;
    }
    const report = await xray(o);
    if (o.md) writeFileSync(o.md, renderMarkdown(report));
    if (o.html) writeFileSync(o.html, renderHtml(report));
    io.stdout.write(o.json ? `${JSON.stringify(report, null, 2)}\n` : renderText(report));
    if (o.conformance) return report.conformant ? 0 : 1;
    return report.claims.some((c) => c.tier === "must" && c.fail > 0) ? 1 : 0;
  } catch (e) {
    io.stderr.write(`ax-xray: ${e instanceof Error ? e.message : String(e)}\n`);
    return e instanceof UsageError ? 2 : 1;
  }
}

/* node:coverage ignore next 3 */
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href && fileURLToPath(import.meta.url)) {
  process.exitCode = await main(process.argv.slice(2));
}
