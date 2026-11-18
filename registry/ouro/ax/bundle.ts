export { bundleText, tailLines, writeBundle };
export type { BundleOptions, BundleParts };

// The export list comes first because the shadcn CLI drops comments before a file's
// first statement, which would take the JSDoc below with it.

import fs from "node:fs";
import path from "node:path";
import { isSecretKey, leaks, redactLine, redactText, type RedactOptions } from "./redact.ts";

/**
 * A diagnostics bundle: one JSON file a doctor writes for an agent to read or attach, the agent's version of a desktop
 * app's "get logs" menu item. Every string in it is redacted first (ax-redact), and the whole text is checked for
 * anything shaped like a token, an id or an address before a byte is written: a leak refuses the bundle.
 *
 * @claim "Every string in it is redacted first" registry/ouro/ax/bundle.test.mts verify:testExists(registry/ouro/ax/bundle.test.mts::bundleText redacts the facts and every log line, and keeps the tool's own words)
 * @claim "a leak refuses the bundle" registry/ouro/ax/bundle.test.mts verify:testExists(registry/ouro/ax/bundle.test.mts::a bundle that still holds a secret's shape after redaction is refused, and nothing is written)
 * @example
 * const file = writeBundle(
 *   { facts: { tool: "notes doctor", verdict: report.verdict, rows: report.rows }, logs: { service: tailLines(logFile, 300) } },
 *   { dir: logsDir, prefix: "notes-doctor", at: Date.now(), home: os.homedir() },
 * );
 */
interface BundleParts {
  /** The tool's own facts, as plain JSON: its strings go through `redactText`, and a secret key's value is dropped. */
  facts: Record<string, unknown>;
  /** Log lines by source ("service", "engine"), which go through `redactLine`. */
  logs: Record<string, readonly string[]>;
}

/** `home` becomes `~`, and `rules` are the app's own shapes (ax-redact). */
type BundleOptions = RedactOptions;

/** Strings redacted as text, keys kept, and a secret key's value as "[redacted]". */
function textDeep(v: unknown, opts: BundleOptions, key = ""): unknown {
  if (typeof v === "string") return isSecretKey(key) ? "[redacted]" : redactText(v, opts);
  if (Array.isArray(v)) return v.map((x) => textDeep(x, opts, key));
  if (v && typeof v === "object") return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, textDeep(x, opts, k)]));
  return v;
}

/**
 * The bundle's text, redacted. Throws, naming the shapes, when anything shaped like a secret is left, such as an email
 * address used as a key.
 *
 * @claim "Throws, naming the shapes, when anything shaped like a secret is left" registry/ouro/ax/bundle.test.mts verify:testExists(registry/ouro/ax/bundle.test.mts::a bundle that still holds a secret's shape after redaction is refused, and nothing is written)
 * @example
 * const text = bundleText({ facts: { verdict: "failed" }, logs: { service: ["signed in as jordan@contoso.com"] } });
 * // logs.service is ["signed in as [email]"]
 */
function bundleText(parts: BundleParts, opts: BundleOptions = {}): string {
  const logs = Object.fromEntries(Object.entries(parts.logs).map(([source, lines]) => [source, lines.map((line) => redactLine(line, opts))]));
  const text = `${JSON.stringify({ ...(textDeep(parts.facts, opts) as object), logs }, null, 2)}\n`;
  const left = leaks(text, opts);
  if (left.length) throw new Error(`bundle: the bundle still held ${left.join(", ")} after redaction, so it was not written. Fix: drop or rename the facts that hold it.`);
  return text;
}

/**
 * Writes the bundle into `dir` as `<prefix>-<time>.json`, readable by this user only, never over an existing file,
 * and returns its path for the tool to print.
 *
 * @claim "readable by this user only, never over an existing file" registry/ouro/ax/bundle.test.mts verify:testExists(registry/ouro/ax/bundle.test.mts::writeBundle writes a redacted file only this user can read, named by its time, and never over another)
 * @example
 * const file = writeBundle(parts, { dir: logsDir, prefix: "notes-doctor", at: Date.now(), home: os.homedir() });
 * stdout.write(`Bundle (redacted), for an agent to read or attach:\n  ${file}\n`);
 */
function writeBundle(parts: BundleParts, { dir, prefix, at, ...opts }: BundleOptions & { dir: string; prefix: string; at: number }): string {
  const text = bundleText(parts, opts);
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  const file = path.join(dir, `${prefix}-${new Date(at).toISOString().replace(/[:.]/g, "-")}.json`);
  fs.writeFileSync(file, text, { mode: 0o600, flag: "wx" });
  return file;
}

/**
 * The last `n` lines of a file, reading at most `maxBytes` from its end, without blank lines; none when it isn't there.
 *
 * @claim "reading at most `maxBytes` from its end" registry/ouro/ax/bundle.test.mts verify:testExists(registry/ouro/ax/bundle.test.mts::tailLines reads the last lines from the end of a file, drops a line cut in half, and gives none for a missing file)
 * @example
 * tailLines(path.join(logsDir, "service.log"), 300); // the service log's last 300 lines
 */
function tailLines(file: string, n: number, maxBytes = 256 * 1024): string[] {
  let fd: number;
  try {
    fd = fs.openSync(file, "r");
  } catch {
    return [];
  }
  try {
    const size = fs.fstatSync(fd).size;
    const len = Math.min(size, maxBytes);
    const buf = Buffer.alloc(len);
    fs.readSync(fd, buf, 0, len, size - len);
    const lines = buf.toString("utf8").split(/\r?\n/);
    // A first line cut by maxBytes is part of a line: dropped.
    if (len < size) lines.shift();
    return lines.filter((line) => line.trim()).slice(-n);
  } finally {
    fs.closeSync(fd);
  }
}
