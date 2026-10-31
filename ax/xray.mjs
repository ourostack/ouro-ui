#!/usr/bin/env node
// ax-xray: the Ouro AX conformance checker. Runs the claims in ax/claims.json against a CLI, an HTTP API
// and an MCP server from outside, by calling them, never by importing their code, and reports per surface
// which claims hold and which fail, with the fix. Safe by construction: it runs reads freely, and it calls
// what other people see only on paths that must refuse (a made-up target, no --why) or that the CLI
// itself advertises as acting on nothing (--dry-run). It sends only GET requests, except the refused
// probes a routes manifest names. Zero dependencies; Node 22 or later.
//
//   node ax/xray.mjs --cli "<command>" [--http <url> --routes <manifest.json>] [--mcp "<command>"]
//                    [--json] [--md <file>] [--html <file>] [--env K=V]... [--guard "<command>"]
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const STANDARD = JSON.parse(fs.readFileSync(new URL("./claims.json", import.meta.url), "utf8"));
export const CLAIMS = STANDARD.claims;
const CLAIM = Object.fromEntries(CLAIMS.map((c) => [c.id, c]));

const BOGUS = "axxraynoref";
const NO_SUCH_COMMAND = "ax-xray-no-such-command";
const NO_SUCH_FLAG = "--ax-xray-no-such-flag";
const WHY = "ax-xray conformance probe: nobody asked, so this must not reach anyone";
const READ_WORDS = new Set(["show", "list", "status", "profile", "catalog", "get"]);
const AMBIGUOUS = ["edit", "delete", "remove"];
/** An instruction to a person or agent at the start of a clause: "; open the tandem window", "Tell them, do not retry". */
const IMPERATIVE = /(^|[;:.!?]\s+|, )(open|tell|ask|run|use|try|give|wait|restart|start|turn|name|pass|add|choose|pick|check)\b/i;

/** Splits a command line into words, honouring single and double quotes. */
export function splitCommand(line) {
  const out = [];
  let cur = "";
  let quote = null;
  let has = false;
  for (const ch of String(line)) {
    if (quote) {
      if (ch === quote) quote = null;
      else cur += ch;
    } else if (ch === '"' || ch === "'") {
      quote = ch;
      has = true;
    } else if (/\s/.test(ch)) {
      if (has || cur) out.push(cur);
      cur = "";
      has = false;
    } else {
      cur += ch;
      has = true;
    }
  }
  if (has || cur) out.push(cur);
  return out;
}

const shellWord = (w) => (/^[\w@%+=:,./#-]+$/.test(w) ? w : JSON.stringify(w));

/** Runs argv; resolves { code, stdout, stderr, timedOut, ms }. */
export function run(argv, { env = {}, input = null, timeoutMs = 20_000, cwd } = {}) {
  return new Promise((resolve) => {
    const t0 = Date.now();
    let stdout = "";
    let stderr = "";
    let timedOut = false;
    let child;
    try {
      child = spawn(argv[0], argv.slice(1), { env: { ...process.env, ...env }, stdio: ["pipe", "pipe", "pipe"], cwd });
    } catch (e) {
      resolve({ code: 127, stdout: "", stderr: String(e?.message ?? e), timedOut: false, ms: 0 });
      return;
    }
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill("SIGKILL");
    }, timeoutMs);
    child.stdout.on("data", (d) => (stdout += d));
    child.stderr.on("data", (d) => (stderr += d));
    child.on("error", (e) => (stderr += String(e?.message ?? e)));
    child.on("close", (code) => {
      clearTimeout(timer);
      resolve({ code: timedOut ? null : code, stdout, stderr, timedOut, ms: Date.now() - t0 });
    });
    child.stdin.on("error", () => {});
    if (input !== null) child.stdin.write(input);
    child.stdin.end();
  });
}

const lines = (s) => s.replace(/\n$/, "").split("\n").filter((l, i, a) => l !== "" || i < a.length - 1);
const firstLine = (s) => (s.split("\n").find((l) => l.trim()) ?? "").trim();
const clip = (s, n = 220) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);
const parseJson = (s) => {
  try {
    return { ok: true, value: JSON.parse(s) };
  } catch {
    return { ok: false };
  }
};
const hasStack = (s) => /^\s+at (?:async )?(?:\S+ \()?(?:file:\/\/|node:|\/|[A-Za-z]:\\)\S*:\d+:\d+\)?$/m.test(s);

/** Splits a usage line into words, keeping a placeholder with spaces (`<message id>`) in one word. */
export function usageWords(usage) {
  return splitCommand(usage.replace(/<[^<>]*>/g, (p) => p.replace(/ /g, "\u0000"))).map((w) => w.replace(/\u0000/g, " "));
}

/** Removes `[...]` groups (nested) from a usage line and splits it into words. */
export function requiredWords(usage) {
  let u = usage;
  let prev;
  do {
    prev = u;
    u = u.replace(/\[[^[\]]*\]/g, " ");
  } while (u !== prev);
  return usageWords(u);
}

/** What changed between two state snapshots, element by element: arrays compare by their members. */
export function stateDelta(before, after) {
  const leaves = (snap) => {
    const out = [];
    const walk = (v) => {
      if (Array.isArray(v)) for (const x of v) out.push(JSON.stringify(x));
      else if (v && typeof v === "object") for (const x of Object.values(v)) walk(x);
      else out.push(JSON.stringify(v));
    };
    for (const s of snap) {
      const j = parseJson(s);
      if (j.ok) walk(j.value);
      else out.push(s);
    }
    return out;
  };
  const a = leaves(before);
  const b = leaves(after);
  const count = (xs) => xs.reduce((m, x) => m.set(x, (m.get(x) ?? 0) + 1), new Map());
  const ca = count(a);
  const cb = count(b);
  const added = [];
  const removed = [];
  for (const [k, n] of cb) for (let i = ca.get(k) ?? 0; i < n; i++) added.push(k);
  for (const [k, n] of ca) for (let i = cb.get(k) ?? 0; i < n; i++) removed.push(k);
  return { same: !added.length && !removed.length, added, removed };
}

/** A refusal's footprint: nothing, or only records that say they were refused. */
export function refusalVerdict(delta) {
  if (delta.same) return { ok: true, note: "nothing changed" };
  if (!delta.removed.length && delta.added.every((x) => /refus/i.test(x))) return { ok: true, note: `${delta.added.length} audit record${delta.added.length === 1 ? "" : "s"} of the refusal, nothing else` };
  return { ok: false, note: `${delta.added.length} added, ${delta.removed.length} removed; first: ${clip(delta.added[0] ?? delta.removed[0], 200)}` };
}

const placeholderKey = (p) => p.replace(/^<|>$/g, "").split(/[|\s]/)[0].toLowerCase();
const singular = (k) => k.toLowerCase().replace(/ies$/, "y").replace(/s$/, "");

/** Collects sample refs from a JSON answer: the first `ref` (else `id`) of each array, keyed by its name, singular. */
export function harvest(value, samples, key = null) {
  if (Array.isArray(value)) {
    if (key) {
      const k = singular(key);
      for (const item of value) {
        if (item && typeof item === "object" && !Array.isArray(item)) {
          const ref = typeof item.ref === "string" ? item.ref : typeof item.id === "string" ? item.id : null;
          if (ref && !(k in samples)) samples[k] = ref;
          if (ref) break;
        }
      }
    }
    for (const item of value) harvest(item, samples, key);
  } else if (value && typeof value === "object") {
    for (const [k, v] of Object.entries(value)) harvest(v, samples, k);
  }
  return samples;
}

/** Edit distance, for "did you mean". */
export function distance(a, b) {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return d[a.length][b.length];
}

/** Drops one inner letter: --limit becomes --limt. */
export const misspell = (flag) => {
  const body = flag.replace(/^--/, "");
  if (body.length < 4) return `--${body}x`;
  const i = Math.floor(body.length / 2) + 1;
  return `--${body.slice(0, i)}${body.slice(i + 1)}`;
};

class Recorder {
  constructor() {
    this.results = [];
  }
  add(claim, surface, verdict, note = "") {
    if (!CLAIM[claim]) throw new Error(`unknown claim ${claim}`);
    this.results.push({ claim, surface, verdict, note: clip(String(note), 400) });
  }
}

// ---------------------------------------------------------------------------------------------------------------
// CLI

async function checkCli(rec, opts) {
  const base = splitCommand(opts.cli);
  const name = opts.name ?? path.basename(base[base.length - 1]).replace(/\.[cm]?[jt]s$/, "");
  const calls = [];
  const call = async (args, { input = null, timeoutMs = opts.timeoutMs } = {}) => {
    const r = await run([...base, ...args], { env: opts.env, input, timeoutMs });
    const shown = [name, ...args].map(shellWord).join(" ");
    const c = { args, shown, ...r };
    calls.push(c);
    return c;
  };
  const brief = (c) => `\`${clip(c.shown, 120)}\` → ${c.timedOut ? "timed out" : `exit ${c.code}`}${c.stderr.trim() ? `; stderr: ${clip(firstLine(c.stderr), 200)}` : ""}${!c.stderr.trim() && c.stdout.trim() ? `; stdout: ${clip(firstLine(c.stdout), 120)}` : ""}`;

  const snapshot = async () => {
    const out = [];
    for (const s of opts.state) {
      const r = await run([...base, ...splitCommand(s)], { env: opts.env, timeoutMs: opts.timeoutMs });
      const j = parseJson(r.stdout);
      out.push(j.ok ? JSON.stringify(stripKeys(j.value, opts.volatile)) : r.stdout);
    }
    return out;
  };

  // State first, twice: a state that moves on its own cannot show a read changed it.
  let stateBefore = null;
  let stateNote = "";
  if (opts.state.length) {
    const a = await snapshot();
    const b = await snapshot();
    if (JSON.stringify(a) === JSON.stringify(b)) stateBefore = b;
    else stateNote = "the state commands answer differently with nothing run between them";
  }

  // Help as data.
  let help = null;
  for (const args of [["help", "--json"], ["--help", "--json"]]) {
    const c = await call(args);
    const j = parseJson(c.stdout);
    if (c.code === 0 && j.ok && Array.isArray(j.value?.commands) && j.value.commands.every((x) => typeof x?.name === "string")) {
      help = j.value;
      rec.add("cli.help-parses", "help", "pass", `\`${c.shown}\` lists ${help.commands.length} commands`);
      break;
    }
    if (args[0] === "--help") rec.add("cli.help-parses", "help", "fail", brief(c));
  }
  const overview = await call(["--help"]);
  const overviewLines = lines(overview.stdout);
  let commands = help ? help.commands.map((c) => ({ name: c.name, effect: c.effect ?? null, usage: Array.isArray(c.usage) ? c.usage : [c.name] })) : [];
  if (!help) {
    // Without help JSON, commands come from the text: an indented word, two spaces, then words.
    for (const l of overviewLines) {
      const m = /^ {2,4}([a-z][\w-]*):? {2,}\S/.exec(l);
      if (m) commands.push({ name: m[1], effect: null, usage: [m[1]] });
    }
  }
  const names = commands.map((c) => c.name);

  if (help) {
    for (const c of commands) {
      if (c.effect === "private" || c.effect === "others") rec.add("cli.help-effects", c.name, "pass", `effect: ${c.effect}`);
      else rec.add("cli.help-effects", c.name, "fail", `help --json gives ${c.name} no effect (private or others)`);
    }
  } else rec.add("cli.help-effects", "help", "fail", "no help JSON, so no command says who sees it");

  // Exit codes, documented.
  let documented = null;
  let usageCode = null;
  if (help && Array.isArray(help.exitCodes)) {
    documented = new Set(help.exitCodes.map((e) => Number(e.code)));
    usageCode = help.exitCodes.find((e) => /usage/i.test(`${e.short ?? ""} ${e.meaning ?? ""}`))?.code ?? null;
  } else {
    const m = /Exit codes?:([^\n]*(?:\n(?!\S*:)[^\n]*)*)/i.exec(overview.stdout);
    if (m) {
      documented = new Set([...m[1].matchAll(/\b(\d{1,3}) [a-z]/gi)].map((x) => Number(x[1])));
      const u = /\b(\d{1,3}) usage/i.exec(m[1]);
      usageCode = u ? Number(u[1]) : null;
    }
  }

  // Overview and each command's help.
  const width = opts.width;
  const tooWide = (text) => lines(text).filter((l) => [...l].length > width);
  const wide = tooWide(overview.stdout);
  rec.add("cli.help-width", "--help", wide.length ? "fail" : "pass", wide.length ? `${wide.length} lines over ${width} columns, first: ${clip(wide[0], 140)}` : `every line ≤ ${width} columns`);
  rec.add("cli.overview-short", "--help", overviewLines.length <= 60 ? "pass" : "fail", `${overviewLines.length} lines`);
  const helpText = {};
  for (const n of names) {
    const c = await call([n, "--help"]);
    helpText[n] = c.stdout;
    const ok = c.code === 0 && c.stdout.trim() && !c.stderr.trim();
    rec.add("cli.command-help", n, ok ? "pass" : "fail", ok ? `${lines(c.stdout).length} lines` : brief(c));
    if (ok) {
      const w = tooWide(c.stdout);
      rec.add("cli.help-width", `${n} --help`, w.length ? "fail" : "pass", w.length ? `${w.length} lines over ${width} columns, first (${[...w[0]].length}): ${clip(w[0], 140)}` : `every line ≤ ${width} columns`);
    }
  }

  // Errors: one line, teaches.
  const teaches = (msg) => IMPERATIVE.test(msg) || new RegExp(`\\b${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")} [a-z]`).test(msg) || /(^|\s|")--[a-z]/.test(msg) || names.some((n) => msg.includes(`"${n}`) || msg.includes(`\`${n}`));
  const errorChecks = (surface, c) => {
    const errLines = lines(c.stderr).filter((l) => l.trim());
    const one = errLines.length === 1 && !c.stdout.trim();
    rec.add("cli.one-line-error", surface, one ? "pass" : "fail", one ? clip(errLines[0]) : `${brief(c)} (${errLines.length} stderr lines, ${lines(c.stdout).filter(Boolean).length} stdout lines)`);
    const t = errLines.length > 0 && teaches(c.stderr);
    rec.add("cli.error-teaches", surface, t ? "pass" : "fail", t ? clip(firstLine(c.stderr)) : `${brief(c)}: names no command or flag to try`);
  };

  // Unknown command.
  {
    const c = await call([NO_SUCH_COMMAND]);
    const listed = names.filter((n) => new RegExp(`\\b${n.replace(/[-]/g, "\\-")}\\b`).test(c.stderr)).length;
    const codeOk = c.code !== 0 && !c.timedOut && (usageCode === null || c.code === usageCode);
    const ok = codeOk && names.length > 0 && listed >= names.length / 2;
    rec.add("cli.unknown-command", NO_SUCH_COMMAND, ok ? "pass" : "fail", `${brief(c)}; lists ${listed} of ${names.length} commands${usageCode !== null && c.code !== usageCode ? `; usage exit code is ${usageCode}` : ""}`);
    if (c.code !== 0) errorChecks(NO_SUCH_COMMAND, c);
  }

  // Ambiguous verbs, only when help JSON says what every command is: an unknown CLI's bare `delete` might act.
  for (const v of help ? AMBIGUOUS.filter((v) => !names.includes(v)) : []) {
    const c = await call([v]);
    const named = names.filter((n) => new RegExp(`\\b${n.replace(/[-]/g, "\\-")}\\b`).test(c.stderr) && !["help"].includes(n));
    const ok = c.code !== 0 && !c.timedOut && named.length >= 1;
    rec.add("cli.ambiguous-verbs", v, ok ? "pass" : "fail", `${brief(c)}${ok ? `; names ${named.join(", ")}` : ""}`);
    if (c.code !== 0) errorChecks(v, c);
  }

  // Reads: plan each command's argument-free usage first, then those needing one harvested ref.
  // Free text needs no harvesting; it is only ever passed to a --dry-run or a call that must be refused.
  const samples = { word: "the", words: "the", text: "ax-xray preview text", new: "ax-xray preview text", note: "ax-xray preview text", ...opts.samples };
  const readPlan = (cmd) => {
    for (const u of cmd.usage) {
      const w = requiredWords(u);
      if (w[0] !== cmd.name) continue;
      const rest = w.slice(1);
      if (rest.some((t) => t.startsWith("-") || t.includes("|") || t.includes("#") || (t.includes("<") && !/^<[^<>]+>$/.test(t)))) continue;
      const ph = rest.filter((t) => t.startsWith("<"));
      if (ph.length > 1) continue;
      if (rest.some((t) => !t.startsWith("<") && !READ_WORDS.has(t))) continue;
      return { usage: u, words: rest, placeholder: ph[0] ? placeholderKey(ph[0]) : null };
    }
    return null;
  };
  const flagsOf = (cmd) => [...new Set(cmd.usage.flatMap((u) => [...u.matchAll(/(?<![\w-])(--[a-z][\w-]+)( <[^>]+>| N\b)?/g)].map((m) => ({ flag: m[1], value: Boolean(m[2]) }))).filter((f) => !["--json", "--help", "--why", "--agent"].includes(f.flag)).map((f) => JSON.stringify(f)))].map((s) => JSON.parse(s));
  const readable = commands.filter((c) => c.effect === "private" || (help === null && c.effect === null && false));
  const plans = readable.map((c) => ({ cmd: c, plan: readPlan(c) }));
  const planned = [...plans.filter((p) => p.plan && !p.plan.placeholder), ...plans.filter((p) => p.plan && p.plan.placeholder)];
  const reads = [];
  for (const { cmd, plan } of planned) {
    let args = plan.words;
    if (plan.placeholder) {
      const v = samples[plan.placeholder];
      if (!v) {
        rec.add("cli.read-json", cmd.name, "skip", `no sample for <${plan.placeholder}>; pass --sample ${plan.placeholder}=<value>`);
        continue;
      }
      args = plan.words.map((t) => (t.startsWith("<") ? v : t));
    }
    args = [cmd.name, ...args];
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
    if (j.ok) harvest(j.value, samples);
  }
  for (const { cmd, plan } of plans) if (!plan && cmd.effect === "private" && !cmd.usage.some((u) => requiredWords(u).length === 1)) {
    // Every usage needs something: the bare command must fail and say what.
    const c = await call([cmd.name]);
    const ok = c.code !== 0 && !c.timedOut && (usageCode === null || c.code === usageCode);
    rec.add("cli.missing-arg", cmd.name, ok ? "pass" : "fail", `${brief(c)}${usageCode !== null && c.code !== usageCode && c.code !== 0 ? `; usage exit code is ${usageCode}` : ""}`);
    if (c.code !== 0) errorChecks(`${cmd.name} (no argument)`, c);
  }

  // Flags: an unknown one, and a misspelt real one, on every read.
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
    const after = await snapshot();
    const d = stateDelta(stateBefore, after);
    rec.add("cli.reads-stay-reads", `${reads.length} reads, their flag probes and the missing-argument probes`, d.same ? "pass" : "fail", d.same ? `state: ${opts.state.join("; ")}` : `${opts.state.join("; ")} changed: ${refusalVerdict(d).note}`);
  } else rec.add("cli.reads-stay-reads", "state", "skip", stateNote || "no --state command given");

  // Free text: a command that reads text from stdin ("-") must also take it as an argument: a quoted placeholder, a
  // placeholder where the "-" goes, or a text flag (--text <text>, --file <path>).
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
    rec.add("cli.text-as-argument", cmd.name, ok ? "pass" : "fail", ok ? "an argument form is listed beside stdin" : `only stdin: ${stdin.join("; ").slice(0, 200)}`);
  }

  // Waiting: a watch or wait command takes a conversation ref a read gave.
  const waiter = commands.find((c) => c.name === "watch" || c.name === "wait");
  const convRef = ["conversation", "chat", "room", "channel"].map((k) => samples[k]).find(Boolean);
  if (waiter && convRef) {
    const waitedCode = help?.exitCodes?.find((e) => /wait|didn.t happen|timed? ?out/i.test(`${e.short ?? ""} ${e.meaning ?? ""}`))?.code;
    const c = await call([waiter.name, convRef, "--timeout", "1s"], { timeoutMs: Math.max(opts.timeoutMs, 15_000) });
    const ok = !c.timedOut && (c.code === 0 || (waitedCode !== undefined && c.code === waitedCode));
    rec.add("cli.wait-on-refs", `${waiter.name} <conversation>`, ok ? "pass" : "fail", brief(c));
  } else if (waiter) rec.add("cli.wait-on-refs", waiter.name, "skip", "no conversation ref harvested from the reads");

  // What other people see: refused paths only, and a preview only where the CLI advertises one.
  const others = commands.filter((c) => c.effect === "others");
  const fill = (word, value) => word.replace(/<([^>]+)>/g, (_, p) => (/^name$/i.test(p) ? "ax-xray" : typeof value === "function" ? value(placeholderKey(`<${p}>`)) : value));
  for (const cmd of others) {
    const words = usageWords(cmd.usage[0].replace(/\[[^[\]]*\]/g, " "));
    let input = null;
    const target = [];
    for (let i = 1; i < words.length; i++) {
      const w = words[i];
      if (w === "--why") {
        i++;
        continue;
      }
      if (w === "-") input = "ax-xray probe text";
      target.push(w.includes("|") && !w.includes("<") ? w.split("|")[0] : w);
    }
    // References are made up, so the call must be refused; values the caller supplied (an emoji) stay real.
    const bogus = target.map((w) => fill(w, (k) => opts.samples[k] ?? BOGUS));
    const pre = stateBefore ? await snapshot() : null;
    const noWhy = await call([cmd.name, ...bogus], { input });
    const whyOk = noWhy.code !== 0 && !noWhy.timedOut && /--why\b|\bwhy\b/i.test(noWhy.stderr);
    rec.add("cli.others-need-why", cmd.name, whyOk ? "pass" : "fail", brief(noWhy));
    if (noWhy.code !== 0 && !noWhy.timedOut) errorChecks(`${cmd.name} (no --why)`, noWhy);
    const wrong = await call([cmd.name, ...bogus, "--why", WHY], { input });
    const wrongOk = wrong.code !== 0 && !wrong.timedOut && teaches(wrong.stderr);
    rec.add("cli.wrong-ref-first", cmd.name, wrongOk ? "pass" : "fail", brief(wrong));
    if (wrong.code !== 0 && !wrong.timedOut) errorChecks(`${cmd.name} (wrong ref)`, wrong);
    if (pre) {
      const v = refusalVerdict(stateDelta(pre, await snapshot()));
      rec.add("cli.refusals-change-nothing", cmd.name, v.ok ? "pass" : "fail", v.note);
    }
    if (!/--dry-run\b/.test(helpText[cmd.name] ?? "")) {
      rec.add("cli.others-preview", cmd.name, "fail", `\`${name} ${cmd.name} --help\` offers no --dry-run, so who will see it can only be learnt by doing it`);
      continue;
    }
    // A sample may name a whole word (`--sample "<conversation>#<message id>=abc#123"`), or a word in one command (`react:<...>=...`).
    const wholeSample = (n, w) => opts.samples[`${n}:${w}`] ?? opts.samples[w];
    const realWord = (n, w) => {
      const whole = wholeSample(n, w);
      if (whole !== undefined) return whole;
      const keys = [...w.matchAll(/<([^>]+)>/g)].map((m) => placeholderKey(`<${m[1]}>`));
      // A harvested message ref already carries its conversation: "<conversation>#<message id>" is that ref alone.
      const last = samples[keys[keys.length - 1]];
      if (keys.length > 1 && w.includes("#") && typeof last === "string" && last.includes("#")) return last;
      return fill(w, (k) => samples[k]);
    };
    const missing = target.filter((w) => wholeSample(cmd.name, w) === undefined).flatMap((w) => [...w.matchAll(/<([^>]+)>/g)].map((m) => placeholderKey(`<${m[1]}>`))).filter((k) => k !== "name" && !samples[k]);
    if (missing.length) {
      rec.add("cli.others-preview", cmd.name, "skip", `no sample for <${missing[0]}>; pass --sample ${missing[0]}=<value>`);
      continue;
    }
    const real = target.map((w) => realWord(cmd.name, w));
    const before = stateBefore ? await snapshot() : null;
    const dry = await call([cmd.name, ...real, "--why", WHY, "--dry-run"], { input });
    const after = stateBefore ? await snapshot() : null;
    const unchanged = !before || JSON.stringify(before) === JSON.stringify(after);
    const ok = dry.code === 0 && /\b(see|sees|seen|visible|will get|will know|notified)\b/i.test(dry.stdout) && unchanged;
    rec.add("cli.others-preview", cmd.name, ok ? "pass" : "fail", `${brief(dry)}${!unchanged ? "; the state changed" : ""}`);
  }

  // Across every call.
  const traced = calls.filter((c) => hasStack(c.stdout) || hasStack(c.stderr));
  if (traced.length) for (const c of traced) rec.add("cli.no-stack-trace", c.shown, "fail", clip(c.stderr.split("\n").slice(0, 3).join(" | ")));
  else rec.add("cli.no-stack-trace", `all ${calls.length} calls`, "pass");
  if (documented) {
    const bad = calls.filter((c) => !c.timedOut && !documented.has(c.code));
    if (bad.length) for (const c of bad) rec.add("cli.exit-codes", c.shown, "fail", `exit ${c.code} is not documented (${[...documented].join(", ")})`);
    else rec.add("cli.exit-codes", `all ${calls.length} calls`, "pass", `documented: ${[...documented].join(", ")}`);
  } else rec.add("cli.exit-codes", "help", "fail", "no exit codes in help --json or an `Exit codes:` line");

  return { name, calls: calls.length, commands: names.length, samples };
}

function stripKeys(value, keys) {
  if (!keys.length) return value;
  if (Array.isArray(value)) return value.map((v) => stripKeys(v, keys));
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).filter(([k]) => !keys.includes(k)).map(([k, v]) => [k, stripKeys(v, keys)]));
  return value;
}

// ---------------------------------------------------------------------------------------------------------------
// HTTP

async function checkHttp(rec, opts) {
  const manifest = JSON.parse(fs.readFileSync(opts.routes, "utf8"));
  const origin = opts.http.replace(/\/$/, "");
  const basePath = manifest.base ?? "/api";
  const routes = manifest.routes ?? [];
  let count = 0;
  const req = async (method, p, body) => {
    count++;
    try {
      const r = await fetch(origin + p, { method, headers: body ? { "content-type": "application/json" } : {}, body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(opts.timeoutMs), redirect: "manual" });
      const text = await r.text();
      return { status: r.status, type: r.headers.get("content-type") ?? "", text, json: parseJson(text) };
    } catch (e) {
      return { status: 0, type: "", text: String(e?.message ?? e), json: { ok: false } };
    }
  };
  const brief = (method, p, r) => `\`${method} ${p}\` → ${r.status}${r.text ? ` ${clip(r.text.replace(/\s+/g, " "), 160)}` : ""}`;
  const teaches = (msg) => IMPERATIVE.test(msg) || /\b(GET|POST|PUT|DELETE|PATCH) \//.test(msg) || msg.includes(`${basePath}/`) || /(^|\s)--[a-z]/.test(msg) || (opts.name ? msg.includes(`${opts.name} `) : false);
  const errorChecks = (surface, method, p, r) => {
    const shape = r.json.ok && r.json.value && typeof r.json.value.error === "string";
    rec.add("http.error-shape", surface, shape ? "pass" : "fail", brief(method, p, r));
    const t = shape && teaches(r.json.value.error);
    rec.add("http.error-teaches", surface, t ? "pass" : "fail", shape ? (t ? clip(r.json.value.error) : `"${clip(r.json.value.error)}" names no route, flag or command`) : brief(method, p, r));
  };
  const snapshot = async () => {
    const out = [];
    for (const s of manifest.state ?? []) {
      const [, p] = s.split(" ");
      const r = await req("GET", p);
      out.push(r.json.ok ? JSON.stringify(stripKeys(r.json.value, opts.volatile)) : r.text);
    }
    return out;
  };
  let stateBefore = null;
  if ((manifest.state ?? []).length) {
    const a = await snapshot();
    const b = await snapshot();
    if (JSON.stringify(a) === JSON.stringify(b)) stateBefore = b;
  }

  // The index.
  {
    const r = await req("GET", basePath);
    const text = r.json.ok ? JSON.stringify(r.json.value) : "";
    const named = routes.filter((rt) => text.includes(rt) || text.includes(rt.split(" ")[1]));
    const ok = r.status === 200 && r.json.ok && named.length >= routes.length * 0.8;
    rec.add("http.index", `GET ${basePath}`, ok ? "pass" : "fail", `${brief("GET", basePath, r)}; names ${named.length} of ${routes.length} routes`);
  }
  // An unknown route.
  {
    const p = `${basePath}/ax-xray-no-such-route`;
    const r = await req("GET", p);
    const ok = r.status === 404 && r.json.ok && typeof r.json.value?.error === "string" && teaches(r.json.value.error);
    rec.add("http.unknown-route", `GET ${p}`, ok ? "pass" : "fail", brief("GET", p, r));
    if (r.status >= 400) errorChecks(`GET ${p}`, "GET", p, r);
  }
  // Every read route.
  for (const rt of routes) {
    const [method, p] = rt.split(" ");
    if (method !== "GET" || p.includes("?") || (manifest.skip ?? []).includes(rt)) continue;
    const real = p.replace(/\{[^}]+\}/g, BOGUS);
    const r = await req("GET", real);
    const json = /json/i.test(r.type) && r.json.ok;
    rec.add("http.json", rt, json ? "pass" : "fail", json ? `${r.status}` : brief("GET", real, r));
    if (p.includes("{")) {
      const ok = r.status >= 400 && r.status < 500 && r.json.ok && typeof r.json.value?.error === "string" && teaches(r.json.value.error);
      rec.add("http.wrong-ref-first", rt, ok ? "pass" : "fail", brief("GET", real, r));
    }
    if (r.status >= 400) errorChecks(rt, "GET", real, r);
  }
  if (stateBefore) {
    const d = stateDelta(stateBefore, await snapshot());
    rec.add("http.reads-stay-reads", `${count} GET requests`, d.same ? "pass" : "fail", `${(manifest.state ?? []).join("; ")}${d.same ? " unchanged" : ` changed: ${refusalVerdict(d).note}`}`);
  } else rec.add("http.reads-stay-reads", "state", "skip", (manifest.state ?? []).length ? "the state routes answer differently with nothing run between them" : "the manifest names no state routes");
  // What other people see: refused probes only.
  for (const probe of manifest.others ?? []) {
    const pre = stateBefore ? await snapshot() : null;
    const [method, p] = probe.route.split(" ");
    const real = p.replace(/\{[^}]+\}/g, BOGUS);
    const fillBody = (b) => JSON.parse(JSON.stringify(b).replaceAll("{ref}", BOGUS));
    const label = `${probe.route}${probe.body?.action ? ` (${probe.body.action})` : ""}`;
    const whyField = probe.why ?? "why";
    const noWhy = await req(method, real, fillBody(probe.body ?? {}));
    const whyOk = noWhy.status >= 400 && noWhy.status < 500 && noWhy.text.includes(whyField);
    rec.add("http.others-need-why", label, whyOk ? "pass" : "fail", brief(method, real, noWhy));
    if (noWhy.status >= 400) errorChecks(`${label} (no ${whyField})`, method, real, noWhy);
    const wrong = await req(method, real, { ...fillBody(probe.body ?? {}), [whyField]: WHY });
    const wrongOk = wrong.status >= 400 && wrong.status < 500 && wrong.json.ok && typeof wrong.json.value?.error === "string" && teaches(wrong.json.value.error);
    rec.add("http.wrong-ref-first", label, wrongOk ? "pass" : "fail", brief(method, real, wrong));
    if (wrong.status >= 400) errorChecks(`${label} (wrong ref)`, method, real, wrong);
    if (pre) {
      const v = refusalVerdict(stateDelta(pre, await snapshot()));
      rec.add("http.refusals-change-nothing", label, v.ok ? "pass" : "fail", v.note);
    }
  }
  return { origin, routes: routes.length, requests: count };
}

// ---------------------------------------------------------------------------------------------------------------
// MCP (stdio, newline-delimited JSON-RPC)

async function checkMcp(rec, opts) {
  const argv = splitCommand(opts.mcp);
  const child = spawn(argv[0], argv.slice(1), { env: { ...process.env, ...opts.env }, stdio: ["pipe", "pipe", "pipe"] });
  let buf = "";
  const waiting = new Map();
  child.stdout.on("data", (d) => {
    buf += d;
    let i;
    while ((i = buf.indexOf("\n")) >= 0) {
      const line = buf.slice(0, i);
      buf = buf.slice(i + 1);
      const j = parseJson(line);
      if (j.ok && j.value?.id !== undefined && waiting.has(j.value.id)) {
        waiting.get(j.value.id)(j.value);
        waiting.delete(j.value.id);
      }
    }
  });
  child.on("error", () => {});
  child.stdin.on("error", () => {});
  let id = 0;
  const request = (method, params) =>
    new Promise((resolve) => {
      const my = ++id;
      const t = setTimeout(() => {
        waiting.delete(my);
        resolve({ error: { message: `no answer to ${method} in ${opts.timeoutMs} ms` } });
      }, opts.timeoutMs);
      waiting.set(my, (v) => {
        clearTimeout(t);
        resolve(v);
      });
      child.stdin.write(JSON.stringify({ jsonrpc: "2.0", id: my, method, params }) + "\n");
    });
  const textOf = (r) => (r.error ? String(r.error.message ?? "") + JSON.stringify(r.error.data ?? "") : (r.result?.content ?? []).map((c) => c.text ?? "").join(" "));
  const refused = (r) => Boolean(r.error) || r.result?.isError === true;
  try {
    const init = await request("initialize", { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "ax-xray", version: STANDARD.version } });
    if (init.error) {
      rec.add("mcp.tools-list", "initialize", "fail", textOf(init));
      return { tools: 0 };
    }
    child.stdin.write(JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" }) + "\n");
    const list = await request("tools/list", {});
    const tools = list.result?.tools;
    if (!Array.isArray(tools)) {
      rec.add("mcp.tools-list", "tools/list", "fail", textOf(list) || "no tools array");
      return { tools: 0 };
    }
    for (const t of tools) {
      const ok = typeof t.description === "string" && t.description.trim() && t.inputSchema && typeof t.inputSchema === "object";
      rec.add("mcp.tools-list", t.name, ok ? "pass" : "fail", ok ? clip(t.description, 120) : `missing ${!t.description ? "description" : "inputSchema"}`);
      const a = t.annotations ?? {};
      const ann = typeof a.readOnlyHint === "boolean" || typeof a.destructiveHint === "boolean";
      rec.add("mcp.effect-annotated", t.name, ann ? "pass" : "fail", ann ? JSON.stringify(a) : "no readOnlyHint or destructiveHint");
      const required = Array.isArray(t.inputSchema?.required) ? t.inputSchema.required : [];
      if (required.length) {
        const r = await request("tools/call", { name: t.name, arguments: {} });
        const text = textOf(r);
        const ok2 = refused(r) && required.some((f) => text.includes(f));
        rec.add("mcp.bad-call-teaches", t.name, ok2 ? "pass" : "fail", `${refused(r) ? "refused" : "ran"}: ${clip(text || "(no text)")}`);
      }
    }
    const u = await request("tools/call", { name: "ax_xray_no_such_tool", arguments: {} });
    const ut = textOf(u);
    const ok = refused(u) && (ut.includes("tools/list") || tools.some((t) => ut.includes(t.name)));
    rec.add("mcp.unknown-tool", "ax_xray_no_such_tool", ok ? "pass" : "fail", `${refused(u) ? "refused" : "ran"}: ${clip(ut || "(no text)")}`);
    return { tools: tools.length };
  } finally {
    child.kill();
  }
}

// ---------------------------------------------------------------------------------------------------------------
// The report

export function summarize(results, target) {
  const claims = CLAIMS.filter((c) => results.some((r) => r.claim === c.id)).map((c) => {
    const rs = results.filter((r) => r.claim === c.id);
    const pass = rs.filter((r) => r.verdict === "pass").length;
    const fail = rs.filter((r) => r.verdict === "fail").length;
    const skip = rs.filter((r) => r.verdict === "skip").length;
    return { ...c, pass, fail, skip, holds: fail === 0 && pass > 0, failing: rs.filter((r) => r.verdict === "fail"), skipped: rs.filter((r) => r.verdict === "skip") };
  });
  const pass = results.filter((r) => r.verdict === "pass").length;
  const fail = results.filter((r) => r.verdict === "fail").length;
  const skip = results.filter((r) => r.verdict === "skip").length;
  const must = claims.filter((c) => c.severity === "must");
  const surfaces = {};
  for (const r of results) (surfaces[`${CLAIM[r.claim].surface}:${r.surface}`] ??= []).push(r);
  return {
    tool: "ax-xray",
    standard: STANDARD.version,
    at: new Date().toISOString(),
    target,
    summary: { claims: claims.length, holding: claims.filter((c) => c.holds).length, must: must.length, mustHolding: must.filter((c) => c.holds).length, checks: { pass, fail, skip }, score: pass + fail ? Math.round((1000 * pass) / (pass + fail)) / 10 : null },
    claims: claims.map(({ failing, skipped, ...c }) => ({ ...c, failing, skipped })),
    results,
    surfaces: Object.keys(surfaces).length,
  };
}

const targetLine = (t) => [t.commit && `at ${t.commit}`, t.cli && `CLI \`${t.cli.name}\` (${t.cli.commands} commands, ${t.cli.calls} calls)`, t.http && `HTTP ${t.http.origin} (${t.http.routes} routes in the manifest, ${t.http.requests} requests)`, t.mcp && `MCP (${t.mcp.tools} tools)`].filter(Boolean).join("; ");
const order = (claims) => [...claims].sort((a, b) => Number(a.holds) - Number(b.holds) || (a.severity === b.severity ? 0 : a.severity === "must" ? -1 : 1) || b.fail - a.fail);

export function renderText(report, { max = 6 } = {}) {
  const s = report.summary;
  const out = [`ax-xray (Ouro AX ${report.standard}): ${targetLine(report.target)}`, `Claims holding: ${s.holding} of ${s.claims} (must: ${s.mustHolding} of ${s.must}). Checks: ${s.checks.pass} pass, ${s.checks.fail} fail, ${s.checks.skip} skipped. Score ${s.score}%.`, ""];
  for (const c of order(report.claims)) {
    out.push(`${c.holds ? "✓" : c.fail ? "✗" : "–"} ${c.id} [${c.severity}] ${c.rule} (${c.pass} of ${c.pass + c.fail}${c.skip ? `, ${c.skip} skipped` : ""})`);
    for (const f of c.failing.slice(0, max)) out.push(`    ${f.surface}: ${f.note}`);
    if (c.failing.length > max) out.push(`    … ${c.failing.length - max} more`);
    if (c.fail) out.push(`    Fix: ${c.fix}`);
  }
  return out.join("\n") + "\n";
}

const md = (s) => String(s).replace(/\|/g, "\\|").replace(/\n/g, " ");
export function renderMarkdown(report) {
  const s = report.summary;
  const out = [
    `# AX X-ray: ${report.target.cli?.name ?? report.target.http?.origin ?? "MCP server"}`,
    "",
    `Ouro AX standard ${report.standard}, checked by ax-xray at ${report.at}. Target: ${targetLine(report.target)}.`,
    "",
    `Claims holding: **${s.holding} of ${s.claims}** (must: ${s.mustHolding} of ${s.must}). Checks: ${s.checks.pass} pass, ${s.checks.fail} fail, ${s.checks.skip} skipped. Score **${s.score}%**.`,
    "",
    "| | Claim | Severity | Rule | Pass | Fail | Skip |",
    "|---|---|---|---|---|---|---|",
    ...order(report.claims).map((c) => `| ${c.holds ? "✓" : c.fail ? "✗" : "–"} | \`${c.id}\` | ${c.severity} | ${md(c.rule)} | ${c.pass} | ${c.fail} | ${c.skip} |`),
    "",
    "## What fails, and the fix",
    "",
  ];
  for (const c of order(report.claims).filter((c) => c.fail)) {
    out.push(`### \`${c.id}\`: ${c.rule}`, "", `Why: ${c.rationale} Source: ${c.source}.`, "", `Fix: ${c.fix}`, "");
    for (const f of c.failing) out.push(`- **${md(f.surface)}**: ${md(f.note)}`);
    out.push("");
  }
  out.push("## Every surface", "");
  const by = {};
  for (const r of report.results) (by[`${CLAIM[r.claim].surface} · ${r.surface}`] ??= []).push(r);
  out.push("| Surface | Holds | Fails |", "|---|---|---|");
  for (const [k, rs] of Object.entries(by)) out.push(`| ${md(k)} | ${rs.filter((r) => r.verdict === "pass").map((r) => `\`${r.claim}\``).join(" ")} | ${rs.filter((r) => r.verdict === "fail").map((r) => `\`${r.claim}\``).join(" ")} |`);
  return out.join("\n") + "\n";
}

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
export function renderHtml(report) {
  const s = report.summary;
  const by = {};
  for (const r of report.results) (by[`${CLAIM[r.claim].surface} · ${r.surface}`] ??= []).push(r);
  const claims = order(report.claims);
  const cell = (rs, id) => {
    const r = rs.filter((x) => x.claim === id);
    if (!r.length) return "<td></td>";
    const v = r.some((x) => x.verdict === "fail") ? "fail" : r.some((x) => x.verdict === "pass") ? "pass" : "skip";
    return `<td class="${v}" title="${esc(r.map((x) => `${x.verdict}: ${x.note}`).join("\n"))}">${v === "pass" ? "✓" : v === "fail" ? "✗" : "–"}</td>`;
  };
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>AX X-ray: ${esc(report.target.cli?.name ?? "")}</title><style>
body{font:14px/1.5 system-ui,sans-serif;margin:2rem;color:#1b1b1f;background:#fff}h1{font-size:1.5rem}code{font:12px ui-monospace,monospace}
table{border-collapse:collapse;margin:1rem 0}th,td{border:1px solid #d0d0d7;padding:.25rem .5rem;text-align:left;vertical-align:top}
th.v{writing-mode:vertical-rl;transform:rotate(180deg);font-weight:500;white-space:nowrap}td.pass{background:#e6f4ea;color:#14532d;text-align:center}td.fail{background:#fde8e8;color:#7f1d1d;text-align:center}td.skip{background:#f3f3f5;text-align:center}
.holds{color:#14532d}.fails{color:#7f1d1d}details{margin:.5rem 0}summary{cursor:pointer}
@media (prefers-color-scheme:dark){body{background:#151518;color:#e8e8ee}th,td{border-color:#3a3a44}td.pass{background:#12351f;color:#bbf7d0}td.fail{background:#3b1414;color:#fecaca}td.skip{background:#26262c}.holds{color:#86efac}.fails{color:#fca5a5}}
</style></head><body><main>
<h1>AX X-ray: ${esc(report.target.cli?.name ?? report.target.http?.origin ?? "MCP server")}</h1>
<p>Ouro AX standard ${esc(report.standard)}, checked by ax-xray at ${esc(report.at)}. ${esc(targetLine(report.target))}.</p>
<p><strong>Claims holding: ${s.holding} of ${s.claims}</strong> (must: ${s.mustHolding} of ${s.must}). Checks: ${s.checks.pass} pass, ${s.checks.fail} fail, ${s.checks.skip} skipped. Score <strong>${s.score}%</strong>.</p>
<h2>Claims</h2>
${claims.map((c) => `<details${c.fail ? " open" : ""}><summary class="${c.holds ? "holds" : "fails"}">${c.holds ? "✓" : c.fail ? "✗" : "–"} <code>${esc(c.id)}</code> [${c.severity}] ${esc(c.rule)} (${c.pass} of ${c.pass + c.fail})</summary><p>${esc(c.rationale)} <em>Source: ${esc(c.source)}.</em></p>${c.fail ? `<p><strong>Fix:</strong> ${esc(c.fix)}</p><ul>${c.failing.map((f) => `<li><code>${esc(f.surface)}</code>: ${esc(f.note)}</li>`).join("")}</ul>` : ""}</details>`).join("\n")}
<h2>Every surface</h2>
<table><thead><tr><th>Surface</th>${claims.map((c) => `<th class="v" scope="col"><code>${esc(c.id)}</code></th>`).join("")}</tr></thead><tbody>
${Object.entries(by).map(([k, rs]) => `<tr><th scope="row"><code>${esc(k)}</code></th>${claims.map((c) => cell(rs, c.id)).join("")}</tr>`).join("\n")}
</tbody></table></main></body></html>
`;
}

// ---------------------------------------------------------------------------------------------------------------
// The command

export const USAGE = `ax-xray: checks an agent-facing interface against the Ouro AX claims, from outside.

  node ax/xray.mjs --cli "<command>" [options]
  node ax/xray.mjs --http <url> --routes <manifest.json> [options]
  node ax/xray.mjs --mcp "<command>" [options]
  node ax/xray.mjs claims [--json]       the standard: every claim, its rule and its check

Options:
  --name <name>          the CLI's name in its messages (default: the command's file name)
  --env K=V              set an environment variable for every call (repeat)
  --guard "<command>"    run this first; refuse to check unless it exits 0
  --state "<args>"       CLI args whose output is the state reads must not change (repeat)
  --volatile k,k         JSON keys to ignore when comparing state
  --sample k=v           a ref for <k> placeholders (repeat); others are harvested from reads
  --width N              help width limit (default 100)
  --timeout <ms>         per call (default 20000)
  --json                 print the report as JSON
  --md <file>            also write the report as Markdown
  --html <file>          also write the report as a static HTML page
Exit codes: 0 every must claim holds, 1 a must claim fails, 2 usage or the guard refused.
`;

const FLAGS = { "--cli": 1, "--http": 1, "--routes": 1, "--mcp": 1, "--name": 1, "--env": 1, "--guard": 1, "--state": 1, "--volatile": 1, "--sample": 1, "--width": 1, "--timeout": 1, "--json": 0, "--md": 1, "--html": 1, "--help": 0 };

export function parseArgs(argv) {
  const o = { env: {}, state: [], volatile: [], samples: {}, width: 100, timeoutMs: 20_000, json: false, command: null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith("--")) {
      if (o.command === null && (a === "claims" || a === "help")) {
        o.command = a;
        continue;
      }
      throw usageError(`unexpected "${a}". Run: node ax/xray.mjs --help`);
    }
    if (!(a in FLAGS)) {
      const near = Object.keys(FLAGS).sort((x, y) => distance(a, x) - distance(a, y))[0];
      throw usageError(`unknown flag ${a}; did you mean ${near}? Run: node ax/xray.mjs --help`);
    }
    const v = FLAGS[a] ? argv[++i] : true;
    if (v === undefined) throw usageError(`${a} needs a value. Run: node ax/xray.mjs --help`);
    if (a === "--env" || a === "--sample") {
      const eq = v.indexOf("=");
      if (eq < 1) throw usageError(`${a} takes K=V, not "${v}"`);
      (a === "--env" ? o.env : o.samples)[v.slice(0, eq)] = v.slice(eq + 1);
    } else if (a === "--state") o.state.push(v);
    else if (a === "--volatile") o.volatile = v.split(",").filter(Boolean);
    else if (a === "--width") o.width = Number(v);
    else if (a === "--timeout") o.timeoutMs = Number(v);
    else if (a === "--json") o.json = true;
    else if (a === "--help") o.command = "help";
    else o[a.slice(2)] = v;
  }
  if (o.http && !o.routes) throw usageError("--http needs --routes <manifest.json>, the routes to check");
  if (!o.command && !o.cli && !o.http && !o.mcp) throw usageError("give --cli, --http or --mcp. Run: node ax/xray.mjs --help");
  return o;
}
const usageError = (m) => Object.assign(new Error(m), { exit: 2 });

export async function xray(opts) {
  const rec = new Recorder();
  const target = {};
  if (opts.guard) {
    const g = await run(splitCommand(opts.guard), { env: opts.env, timeoutMs: opts.timeoutMs });
    if (g.code !== 0) throw Object.assign(new Error(`refusing: the guard failed: ${firstLine(g.stderr) || firstLine(g.stdout) || `exit ${g.code}`}`), { exit: 2 });
  }
  if (opts.cli) target.cli = await checkCli(rec, opts);
  if (opts.http) target.http = await checkHttp(rec, opts);
  if (opts.mcp) target.mcp = await checkMcp(rec, opts);
  return summarize(rec.results, target);
}

export async function main(argv, { stdout = process.stdout, stderr = process.stderr } = {}) {
  let o;
  try {
    o = parseArgs(argv);
  } catch (e) {
    stderr.write(`ax-xray: ${e.message}\n`);
    return 2;
  }
  if (o.command === "help") {
    stdout.write(o.json ? JSON.stringify({ commands: [{ name: "xray", effect: "private", usage: ["--cli \"<command>\"", "--http <url> --routes <file>", "--mcp \"<command>\""] }, { name: "claims", effect: "private", usage: ["claims [--json]"] }], exitCodes: [{ code: 0, meaning: "every must claim holds" }, { code: 1, meaning: "a must claim fails" }, { code: 2, meaning: "usage, or the guard refused" }] }, null, 2) + "\n" : USAGE);
    return 0;
  }
  if (o.command === "claims") {
    stdout.write(o.json ? JSON.stringify(STANDARD, null, 2) + "\n" : CLAIMS.map((c) => `${c.id} [${c.severity}] ${c.rule}\n    check: ${c.check}`).join("\n") + "\n");
    return 0;
  }
  let report;
  try {
    report = await xray(o);
  } catch (e) {
    stderr.write(`ax-xray: ${e.message}\n`);
    return e.exit ?? 1;
  }
  if (o.md) fs.writeFileSync(o.md, renderMarkdown(report));
  if (o.html) fs.writeFileSync(o.html, renderHtml(report));
  stdout.write(o.json ? JSON.stringify(report, null, 2) + "\n" : renderText(report));
  return report.summary.mustHolding === report.summary.must ? 0 : 1;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  // A reader that stops early (`| head`) is not an error.
  process.stdout.on("error", (e) => {
    if (e.code === "EPIPE") process.exit(process.exitCode ?? 0);
    throw e;
  });
  process.exitCode = await main(process.argv.slice(2));
}
