import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, posix } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

// Examples never borrow a real product's name for a made-up agent or person ("do not reuse the names
// of existing products that are different"). The scan reads the registry, docs, site and kits, and
// looks only where a name names an agent or a person: --agent <name>, agent: "<name>", "agent:<name>",
// a person's name field, and "<Name> asked".

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const self = "scripts/product-names.test.mjs";

/** Assistants and agents, plus Sam: names a made-up agent or person could be mistaken for. */
export const PERSONAS = [
  "Alexa", "Bard", "Bixby", "ChatGPT", "Claude", "Clippy", "Codex", "Copilot", "Cortana", "Cursor", "Devin", "Gemini",
  "Grok", "Jarvis", "Kiro", "Llama", "Perplexity", "Sam", "Scout", "Siri", "Windsurf",
];
/**
 * Denied only as a whole name in an agent's or a person's place: services that rightly appear as themselves
 * ("Teams asked to wait"), and Ada, an AI agent product whose name is also a common first name.
 */
export const SERVICES = ["Ada", "Bing", "Edge", "Loop", "Outlook", "Teams", "Viva"];

/** Legitimate uses of a product's name as itself. Each entry says why; a file ending in "/" is a folder. */
export const ALLOWED = [
  {
    file: "docs/decisions/2026-10-30-ouro-ax/evidence/",
    name: "copilot",
    why: "recorded runs: real agents in the Copilot CLI named themselves copilot, kept as they typed it",
  },
  {
    file: "scripts/agent-usability/",
    name: "Ada",
    why: "a frozen benchmark: its screens and checks match the runs recorded with them",
  },
];
const allowed = (rel, name) =>
  ALLOWED.some((a) => (a.file.endsWith("/") ? rel.startsWith(a.file) : a.file === rel) && a.name.toLowerCase() === name.toLowerCase());

const ROOTS = ["registry", "docs", "site/src", "site/scripts", "scripts", "README.md", "AGENTS.md"];
/** Recorded agent runs keep the words they were written with; Git carries their history. */
const SKIP = ["scripts/agent-usability/runs/"];
const TEXT = /\.(ts|tsx|mts|mjs|js|json|jsonl|md|mdx|html|txt)$/;

function files(rel, out = []) {
  if (SKIP.some((s) => rel.startsWith(s))) return out;
  const abs = join(root, rel);
  let stat;
  try {
    stat = statSync(abs);
  } catch {
    return out;
  }
  if (stat.isFile()) {
    if (TEXT.test(rel) && rel !== self) out.push(rel);
    return out;
  }
  for (const e of readdirSync(abs, { withFileTypes: true })) {
    if (e.name === "node_modules" || e.name === "dist" || e.name.startsWith(".")) continue;
    files(posix.join(rel, e.name), out);
  }
  return out;
}

const P = PERSONAS.join("|");
const ALL = [...PERSONAS, ...SERVICES].join("|");
const Q = "[\"'\\x60]";
const PATTERNS = [
  { what: "an agent's name", re: new RegExp(String.raw`(?:--agent[ =]["']?|"--agent",\s*"|\bagent"?\s*:\s*${Q}|"agent:|X-Tandem-Agent"?\s*:\s*${Q}|TANDEM_AGENT"?\s*[:=]\s*${Q}?)((?:GitHub )?(?:${ALL}))(?![\w-])`, "gi") },
  { what: "a person's name", re: new RegExp(String.raw`\b(?:displayName|senderName|sender|fullName|author|organizer|name|from)"?\s*[:=]\s*${Q}((?:${P})(?: [A-Z][a-z]+)?|${SERVICES.join("|")})${Q}`, "g") },
  { what: "a person's name", re: new RegExp(String.raw`\b((?:${P})(?: [A-Z][a-z]+)?) (?:asked|asks|wrote|replied)\b|\b[Ss]ent by ((?:${P})(?: [A-Z][a-z]+)?)\b`, "g") },
];

/** "file:line: ..." for each denied name in an agent's or a person's place. */
export function scan(rels, read) {
  const hits = [];
  for (const rel of rels) {
    read(rel)
      .split("\n")
      .forEach((line, i) => {
        for (const { what, re } of PATTERNS) {
          for (const m of line.matchAll(re)) {
            const name = (m[1] ?? m[2] ?? "").trim();
            if (allowed(rel, name)) continue;
            hits.push(`${rel}:${i + 1}: "${name}" is a real product's name used as ${what}; use a role name (inbox-agent, research-agent) or a neutral person's name`);
          }
        }
      });
  }
  return hits;
}

test("no example agent or person borrows a real product's name", () => {
  const rels = ROOTS.flatMap((r) => files(r));
  assert.ok(rels.length > 500, `the scan reads the repository (${rels.length} files)`);
  const hits = scan(rels, (rel) => readFileSync(join(root, rel), "utf8"));
  assert.deepEqual(hits, [], `\n${hits.join("\n")}`);
});

test("the scan catches each position and spares the product as itself", () => {
  const sample = {
    "a.ts": [
      `run("draft", "set", "x", "--agent", "copilot")`,
      "app send x --agent Scout --why y",
      `{ agent: "cortana" }`,
      `{ displayName: "Sam Lee" }`,
      `{ name: "Teams" }`,
      "Sent by Alexa",
      `Teams asked to wait; if Edge asks, pick the account. an AI agent: Teams shows none. { name: "Teams Client" }. agency copilot runs it.`,
      `{ agent: "inbox-agent", displayName: "Jo Park" }`,
      "app draft set x --agent ada --why y",
      `<Message role="user" name="Ada">Hi</Message> <AttentionCard from="Teams" /> <input name="email" /> Ada asked.`,
    ].join("\n"),
  };
  const hits = scan(Object.keys(sample), (rel) => sample[rel]);
  assert.deepEqual(
    hits.map((h) => h.split(" is ")[0]),
    ['a.ts:1: "copilot"', 'a.ts:2: "Scout"', 'a.ts:3: "cortana"', 'a.ts:4: "Sam Lee"', 'a.ts:5: "Teams"', 'a.ts:6: "Alexa"', 'a.ts:9: "ada"', 'a.ts:10: "Ada"', 'a.ts:10: "Teams"'],
  );
  assert.match(hits[0], /use a role name \(inbox-agent, research-agent\) or a neutral person's name$/);
});
