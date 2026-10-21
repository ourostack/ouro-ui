// Claims: every factual sentence on every surface carries its primary source and a machine
// check (docs/guides/claims.md).
//
//   pnpm claims:check              lints every surface and runs every claim's checks
//   pnpm claims:lint <file>…       the same for some files; --pr lints a pull request's
//                                  title and body (PR_TITLE, PR_BODY), --stdin reads text
//   pnpm claims:show <file>        lists the file's claims, their sources and each check's result
//
// A claim is a sentence with a source and a `verify:` check: in Markdown a source link
// (`[73 components](registry.json "verify:count(registry:ui)=73")`) or a footnote
// (`[^id]` with `[^id]: <source> verify:<check>`), in JSDoc an `@claim <source> verify:<check>`
// tag (it covers its comment), in TypeScript copy `claim(text, { source, verify })` from
// lib/ouro/claims.ts, which also parses the source and check syntax. The lint fails a
// factual-sounding sentence (a number, version or date; "tested", "accessible", "every",
// "all", "works with", "supports", a superlative) that is not a claim, unless it is an
// instruction. The checks read only the repository, so they are deterministic; `urlOk`
// reads scripts/claims-urls.json, which `--network` refreshes.
import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, realpathSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import ts from "typescript";
import { parseClaimCheck, parseClaimSource } from "../registry/ouro/lib/ouro/claims.ts";
import { syncedFiles } from "./latest-release.mjs";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const URL_CACHE = "scripts/claims-urls.json";

// ---------------------------------------------------------------------------------------
// What makes a sentence a factual claim

const MONTH = "January|February|March|April|May|June|July|August|September|October|November|December";
const DATE = new RegExp(`\\b(?:19|20)\\d\\d-\\d\\d-\\d\\d\\b|\\b(?:${MONTH})(?:\\s+\\d{1,2},?)?\\s+(?:19|20)\\d\\d\\b|\\b\\d{1,2}\\s+(?:${MONTH})\\s+(?:19|20)\\d\\d\\b`, "g");
const VERSION = /\bv?\d+\.\d+(?:\.\d+)*\b(?![:\d])/g;

/** The words that make a sentence factual, in report order, after numbers, versions and dates. */
const WORDS = [
  ["tested", /\btested\b/i],
  ["accessible", /\baccessib(?:le|ility)\b(?!\s+(?:names?|descriptions?|labels?)\b)/i],
  ["every", /\bevery(?:thing|one|where)?\b/i],
  ["all", /\ball\b/i],
  ["works with", /\bworks?\s+with\b/i],
  ["supports", /\bsupport(?:s|ed)?\b/i],
  ["superlative", /\b(?<!\bat\s)(?:best|worst|fastest|slowest|quickest|smallest|largest|biggest|lightest|heaviest|easiest|simplest|safest|highest|lowest|strongest|newest|most|least|fewest)\b/i],
];

/** What each kind of claim needs, said so an agent can supply it. */
const NEEDS = {
  date: "dates an event. Cite the commit, release, CI run or evidence file that records it, checked with verify:fileLine(<file>, /<date>/)",
  version: "names a version. Cite the file that pins it, checked with verify:equals(<file>#<field path>)=<version> or verify:fileLine(<file>, /<version>/)",
  number: "states a number. Cite where it comes from, checked with verify:count(registry:ui)=<n> (or dir:<path>, <file>#<field path>), verify:equals(<file>#<field path>)=<value> or verify:fileLine(<file>, /<pattern>/)",
  tested: "says something is tested. Cite the test, test:<file>::<full test name> with verify:testExists(<file>::<full test name>), or the CI job, verify:ciJob(<job>)",
  accessible: "claims accessibility. Cite the axe or screen-reader test that checks it, with verify:testExists(<file>::<full test name>)",
  every: "makes a universal claim. Cite the test or script that checks every case, with verify:testExists(<file>::<full test name>) or verify:fileLine(<file>, /<pattern>/)",
  all: "makes a universal claim. Cite the test or script that checks every case, with verify:testExists(<file>::<full test name>) or verify:fileLine(<file>, /<pattern>/)",
  "works with": "claims compatibility. Cite the install test, CI job or specification that proves it, with verify:ciJob(<job>), verify:testExists(<file>::<full test name>) or verify:urlOk(<url>)",
  supports: "claims compatibility. Cite the install test, CI job or specification that proves it, with verify:ciJob(<job>), verify:testExists(<file>::<full test name>) or verify:urlOk(<url>)",
  superlative: "makes a superlative. Cite the measurement (an evidence file, checked with verify:fileLine), or say it without the superlative",
};

const HOW_TO = {
  markdown: 'Mark it as a claim: [the words](<source> "verify:<check>"), or end the sentence with [^id] and add "[^id]: <source> verify:<check>" (docs/guides/claims.md).',
  jsdoc: "Add `@claim <source> verify:<check>` to the comment (docs/guides/claims.md).",
  copy: 'Wrap it in claim("…", { source, verify }) from lib/ouro/claims (docs/guides/claims.md).',
};

/** Code spans, links' targets and addresses: their digits and words are not prose. */
function maskCode(text) {
  return text
    .replace(/(`+)[\s\S]*?\1/g, (span) => "§".repeat(span.length))
    .replace(/\]\([^)]*\)/g, (target) => "]" + " ".repeat(target.length - 1))
    .replace(/<?https?:\/\/[^\s)>\]]*[^\s)>\].,;:!?'"]>?/g, (url) => "§".repeat(url.length))
    .replace(QUOTED, (quote) => "§".repeat(quote.length));
}

/** A short quotation: text mentioned, such as a label or an example of output ("3 days ago"), not asserted. */
const QUOTED = /"[^"\n]{1,80}"|“[^”\n]{1,80}”/g;

/** The kinds of claim a sentence makes, with the words that make it. */
export function triggers(sentence) {
  let text = maskCode(sentence);
  const found = [];
  const take = (kind, pattern) => {
    const words = [...text.matchAll(pattern)].map((match) => match[0]);
    if (words.length === 0) return;
    found.push({ kind, words });
    text = text.replace(pattern, (match) => " ".repeat(match.length));
  };
  take("date", DATE);
  take("version", VERSION);
  take("number", /\d+/g);
  for (const [kind, pattern] of WORDS) {
    const match = pattern.exec(text);
    if (match) found.push({ kind, words: [match[0]] });
  }
  return found;
}

/** Verbs an instruction starts with: "Run pnpm test", "Don't add a class". */
const VERBS = new Set(
  "add allow apply ask avoid build call change check choose clear click close commit compare compose configure copy cover create declare delete describe disable do don't download drag draw edit enable ensure export fill find fix follow give go hide import include install keep leave let link list load look make mark merge move name never note open pass pick pin place prefer press put raise read rebase record refresh regenerate release remove rename render replace report request reset restart return review run score see select set show skip sort start stop swap switch tag tap tell test translate try turn type update upgrade use wait wrap write".split(" "),
);

/**
 * Whether a sentence is an instruction, which needs no source: it starts with a verb from
 * the list above ("Run pnpm test"), or with a condition and then one ("If it fails, run it
 * again"), or it is a question.
 */
export function isInstruction(sentence) {
  const text = maskCode(sentence).replace(/^[\s>*_#-]*(?:\d+[.)]\s+)?(?:\*\*|__)?/, "").trim();
  if (/\?["'”’)*_]*$/.test(text)) return true;
  const first = /^([A-Za-z’']+)(?=[\s,:])/.exec(text)?.[1]?.toLowerCase().replace("’", "'");
  if (first && VERBS.has(first)) return true;
  if (!/^(?:if|when|whenever|before|after|once|to|for|unless|until|while|with|without|in|on)\b/i.test(text)) return false;
  // The condition may list several things ("For each arm, each screen and each run, make…"): any clause after a comma may start the instruction.
  return [...text.matchAll(/,\s+([A-Za-z’']+)/g)].some((match) => VERBS.has(match[1].toLowerCase()));
}

// ---------------------------------------------------------------------------------------
// Sources and checks as written

/** `<source>; <source> verify:<check> verify:<check>`, as a footnote or `@claim` writes it. */
function parseEvidence(body) {
  const errors = [];
  const at = body.search(/(?:^|\s)verify:/);
  const sourceText = at === -1 ? body : body.slice(0, at);
  const checkText = at === -1 ? "" : body.slice(at);
  const sources = [];
  for (const piece of sourceText.split(/\s*;\s*/).map((part) => part.trim()).filter(Boolean)) {
    const link = /^\[[^\]]*\]\(([^)\s]+)\)$/.exec(piece);
    try {
      sources.push(parseClaimSource(link ? link[1] : piece));
    } catch (error) {
      errors.push(error.message);
    }
  }
  if (sources.length === 0 && errors.length === 0) errors.push("A claim needs a source: a repository path, a CI run, test:<file>::<full test name>, evidence:<path> or a specification's address.");
  const checks = [];
  for (const piece of checkText.split(/(?:^|\s+)verify:/).map((part) => part.trim()).filter(Boolean)) {
    try {
      checks.push(parseClaimCheck(piece));
    } catch (error) {
      errors.push(error.message);
    }
  }
  return { sources, checks, errors, hasCheck: at !== -1 };
}

// ---------------------------------------------------------------------------------------
// Markdown

const collapse = (text) => text.replace(/\s+/g, " ").trim();

/** Splits Markdown into the units sentences come from: paragraphs, list items, headings and table cells. */
function blocks(text, { skip = [], skipSections = [] } = {}) {
  const lines = text.replace(/\r\n?/g, "\n").split("\n");
  const definitions = new Map();
  const out = [];
  let current = null;
  let fence = null;
  let comment = false;
  let skipping = null;
  let section = null;
  const end = () => {
    if (current) out.push(current);
    current = null;
  };
  const push = (line, offset, content, fresh) => {
    if (fresh) end();
    if (!current) current = { lines: [] };
    current.lines.push({ line, text: " ".repeat(offset) + content });
  };
  for (let index = 0; index < lines.length; index++) {
    const raw = lines[index];
    const line = index + 1;
    if (fence) {
      if (raw.trim().startsWith(fence)) fence = null;
      continue;
    }
    if (skipping) {
      if (raw.includes(`<!-- ${skipping}:end -->`)) skipping = null;
      continue;
    }
    const marker = /<!-- ([\w-]+):start -->/.exec(raw);
    if (marker && skip.includes(marker[1])) {
      end();
      if (!raw.includes(`<!-- ${marker[1]}:end -->`)) skipping = marker[1];
      continue;
    }
    const heading = /^(#{1,6})\s+(.*)$/.exec(raw);
    if (section) {
      if (!heading || heading[1].length > section) continue;
      section = null;
    }
    if (comment) {
      if (raw.includes("-->")) comment = false;
      continue;
    }
    if (/^\s*<!--/.test(raw) && !raw.includes("-->")) {
      end();
      comment = true;
      continue;
    }
    const opening = /^\s*(```+|~~~+)/.exec(raw);
    if (opening) {
      end();
      fence = opening[1];
      continue;
    }
    const definition = /^\[\^([^\]]+)\]:\s?(.*)$/.exec(raw);
    if (definition) {
      end();
      let body = definition[2];
      while (index + 1 < lines.length && /^\s{2,}\S/.test(lines[index + 1])) body += ` ${lines[++index].trim()}`;
      definitions.set(definition[1], { line, body });
      continue;
    }
    if (raw.trim() === "") {
      end();
      continue;
    }
    if (heading) {
      end();
      if (skipSections.includes(heading[2].trim())) {
        section = heading[1].length;
        continue;
      }
      // A heading is a label, and a claim marker in it would change its anchor: the section's sentences carry the claims.
      continue;
    }
    if (/^\s*\|/.test(raw)) {
      end();
      if (/^\s*\|?[\s:|-]+\|?\s*$/.test(raw)) continue;
      let offset = 0;
      for (const cell of raw.split(/(?<!\\)\|/)) {
        if (cell.trim()) out.push({ lines: [{ line, text: " ".repeat(offset) + cell }] });
        offset += cell.length + 1;
      }
      continue;
    }
    const item = /^(\s*(?:>\s*)*(?:[-*+]|\d+[.)])\s+)(.*)$/.exec(raw);
    if (item) {
      push(line, item[1].length, item[2], true);
      continue;
    }
    const quote = /^(\s*(?:>\s?)+)(.*)$/.exec(raw);
    if (quote) push(line, quote[1].length, quote[2], false);
    else push(line, 0, raw, false);
  }
  end();
  return { blocks: out, definitions };
}

/** The block's text with code, addresses and markup masked to the same length, and its claim markers. */
function maskBlock(text, definitions) {
  const markers = [];
  let masked = text
    .replace(/<!--[\s\S]*?-->/g, (match) => " ".repeat(match.length))
    .replace(/(`+)[\s\S]*?\1/g, (span) => "§".repeat(span.length))
    .replace(/!\[[^\]]*\]\([^)]*\)/g, (image) => "§".repeat(image.length));
  masked = masked.replace(/\[([^\]^][^\]]*)\]\(\s*(<[^>]*>|[^\s)]+)(?:\s+"([^"]*)")?\s*\)/g, (match, label, target, title, offset) => {
    if (title !== undefined && /^\s*verify:/.test(title)) {
      const parsed = parseEvidence(`${target.replace(/^<|>$/g, "")} ${title.trim()}`);
      markers.push({ at: offset, text: match, ...parsed });
    }
    return `[${label}]${" ".repeat(match.length - label.length - 2)}`;
  });
  masked = masked.replace(/\[\^([^\]]+)\]/g, (match, id, offset) => {
    const definition = definitions.get(id);
    if (!definition) markers.push({ at: offset, sources: [], checks: [], errors: [`The footnote [^${id}] has no definition. Add "[^${id}]: <source> verify:<check>".`], hasCheck: true });
    else {
      const parsed = parseEvidence(definition.body);
      if (!parsed.hasCheck) parsed.errors.push(`The footnote [^${id}] has no verify: check. Add one to its definition: "[^${id}]: ${definition.body} verify:<check>".`);
      markers.push({ at: offset, ...parsed });
    }
    return "¹".repeat(match.length);
  });
  masked = masked
    .replace(/<?https?:\/\/[^\s)>\]]*[^\s)>\].,;:!?'"]>?/g, (url) => "§".repeat(url.length))
    .replace(QUOTED, (quote) => "§".repeat(quote.length))
    .replace(/<\/?[A-Za-z][^>]*>/g, (tag) => " ".repeat(tag.length));
  return { masked, markers };
}

/** Sentence spans in masked text: a sentence ends at . ! or ? (and any closing marks or footnote references) before a space and a capital, digit or mark. */
function sentenceSpans(masked) {
  const spans = [];
  let start = 0;
  for (const match of masked.matchAll(/[.!?]["'”’)*_¹]*\s+(?=[A-Z0-9"'“‘([*_§¹]|v\d)/g)) {
    const stop = match.index + match[0].trimEnd().length;
    spans.push([start, stop]);
    start = match.index + match[0].length;
  }
  spans.push([start, masked.length]);
  return spans;
}

/**
 * Reads Markdown: the claims it makes (with their sources and checks) and a finding for each
 * factual sentence that is not one, or for a claim marker that cannot be read.
 * `skip` names generated regions (`<!-- catalog:start -->`…`<!-- catalog:end -->`),
 * `skipSections` headings whose section is generated. `covered` (from a JSDoc `@claim`)
 * makes every sentence a claim. `howTo` says how to mark a claim in this kind of file.
 */
export function readMarkdown(text, { file, skip = [], skipSections = [], startLine = 1, lineOf, covered = false, howTo = HOW_TO.markdown } = {}) {
  const findings = [];
  const claims = [];
  const { blocks: units, definitions } = blocks(text, { skip, skipSections });
  const at = (line) => (lineOf ? lineOf(line) : line + startLine - 1);
  for (const unit of units) {
    const joined = unit.lines.map((entry) => entry.text).join("\n");
    const starts = [];
    let offset = 0;
    for (const entry of unit.lines) {
      starts.push(offset);
      offset += entry.text.length + 1;
    }
    const lineAt = (position) => {
      let index = 0;
      while (index + 1 < starts.length && starts[index + 1] <= position) index++;
      return at(unit.lines[index].line);
    };
    const { masked, markers } = maskBlock(joined, definitions);
    for (const [from, to] of sentenceSpans(masked)) {
      const clean = collapse(masked.slice(from, to).replace(/[§¹]/g, " "));
      if (!/[A-Za-z0-9]/.test(clean)) continue;
      const lead = from + (masked.slice(from, to).length - masked.slice(from, to).trimStart().length);
      const line = lineAt(lead);
      const sentence = collapse(joined.slice(from, to));
      const own = markers.filter((marker) => marker.at >= from && marker.at < to);
      for (const marker of own) for (const error of marker.errors) findings.push({ file, line, sentence, message: `${file}:${line}: "${sentence}": ${error}` });
      if (own.length > 0) {
        if (own.every((marker) => marker.errors.length === 0)) claims.push({ file, line, text: sentence, sources: own.flatMap((marker) => marker.sources), checks: own.flatMap((marker) => marker.checks) });
        continue;
      }
      if (covered || isInstruction(clean)) continue;
      const found = triggers(clean);
      if (found.length === 0) continue;
      const kinds = found.map((entry) => entry.kind);
      const words = found.flatMap((entry) => entry.words).map((word) => `"${word}"`).join(", ");
      findings.push({ file, line, sentence, kinds, message: `${file}:${line}: "${sentence}" ${NEEDS[kinds[0]]}. (It reads as a claim because of ${words}.) ${howTo}` });
    }
  }
  return { findings, claims };
}

/** The findings for some Markdown. */
export function lintMarkdown(text, options) {
  return readMarkdown(text, options).findings;
}

/** The findings for plain text, such as a pull request's title. */
export function lintPlain(text, options) {
  return readMarkdown(text.replace(/^#+\s*/, ""), options).findings;
}

// ---------------------------------------------------------------------------------------
// TypeScript: JSDoc and copy

const JSDOC_TAGS = "claim|default|defaultValue|example|group|see|internal|param|returns?|deprecated|remarks|throws|link|template|typeParam";

/** A JSDoc comment's prose with its tags handled: @claim read as evidence, @example and the like blanked, line breaks kept. */
function jsdocProse(comment) {
  const body = comment
    .replace(/^\/\*\*/, "   ")
    .replace(/\*\/$/, "  ")
    .split("\n")
    .map((line) => line.replace(/^(\s*\*(?!\/)\s?)/, (prefix) => " ".repeat(prefix.length)))
    .join("\n");
  const evidence = [];
  const tag = new RegExp(`(^|\\s)@(${JSDOC_TAGS})\\b`, "g");
  const found = [...body.matchAll(tag)].map((match) => ({ at: match.index + match[1].length, name: match[2] }));
  let prose = found.length > 0 ? body.slice(0, found[0].at) : body;
  for (const [index, entry] of found.entries()) {
    const text = body.slice(entry.at, found[index + 1]?.at ?? body.length);
    const keep = ["param", "returns", "return", "deprecated", "remarks", "throws", "typeParam"].includes(entry.name);
    if (entry.name === "claim") evidence.push({ line: body.slice(0, entry.at).split("\n").length, ...parseEvidence(collapse(text.slice("@claim".length))) });
    const shown = keep ? text.replace(/^@\w+(?:\s+[\w.$[\]]+(?=\s+[-–]?\s*\S))?/, (head) => " ".repeat(head.length)) : text.replace(/[^\n]/g, " ");
    prose += shown;
  }
  return { prose: prose.replace(/\{@link\s+([^}|]+?)(?:\s*\|\s*([^}]+))?\}/g, (match, target, label) => (label ?? target).padEnd(match.length)), evidence };
}

/** A literal expression's value, or undefined when it is not one (an identifier, a call). */
function literal(node) {
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) return node.text;
  if (ts.isNumericLiteral(node)) return Number(node.text);
  if (node.kind === ts.SyntaxKind.TrueKeyword) return true;
  if (node.kind === ts.SyntaxKind.FalseKeyword) return false;
  if (ts.isPrefixUnaryExpression(node) && node.operator === ts.SyntaxKind.MinusToken && ts.isNumericLiteral(node.operand)) return -Number(node.operand.text);
  if (ts.isAsExpression(node) || ts.isSatisfiesExpression?.(node) || ts.isParenthesizedExpression(node)) return literal(node.expression);
  if (ts.isArrayLiteralExpression(node)) {
    const values = node.elements.map(literal);
    return values.includes(undefined) ? undefined : values;
  }
  if (ts.isObjectLiteralExpression(node)) {
    const out = {};
    for (const property of node.properties) {
      if (!ts.isPropertyAssignment(property) || !(ts.isIdentifier(property.name) || ts.isStringLiteral(property.name))) return undefined;
      const value = literal(property.initializer);
      if (value === undefined) return undefined;
      out[property.name.text] = value;
    }
    return out;
  }
  return undefined;
}

const SOURCE_KEYS = ["file", "ciRun", "test", "spec", "evidence"];
const CHECK_KEYS = ["count", "urlOk", "testExists", "ciJob", "fileLine", "equals"];

/** A claim() call's evidence object, checked for shape. */
function evidenceOf(value) {
  const errors = [];
  const list = (entry) => (entry === undefined ? [] : Array.isArray(entry) ? entry : [entry]);
  const sources = list(value?.source);
  const checks = list(value?.verify);
  if (sources.length === 0) errors.push("claim() needs at least one source.");
  if (checks.length === 0) errors.push("claim() needs at least one check in verify.");
  for (const source of sources) if (Object.keys(source).filter((key) => SOURCE_KEYS.includes(key)).length !== 1) errors.push(`${JSON.stringify(source)} is not a source: give one of ${SOURCE_KEYS.join(", ")}.`);
  for (const check of checks) if (Object.keys(check).filter((key) => CHECK_KEYS.includes(key)).length !== 1) errors.push(`${JSON.stringify(check)} is not a check: give one of ${CHECK_KEYS.join(", ")}.`);
  return { sources, checks, errors };
}

/** Attributes whose string is code, not copy. */
const CODE_ATTRIBUTES = /^(className|class|id|key|href|src|srcSet|type|role|name|value|htmlFor|rel|target|lang|dir|as|variant|tone|size|align|side|presentation|data-[\w-]+|style)$/;

/** Whether a string literal reads as prose: three or more words, starting with a capital or ending a sentence. */
const isProse = (text) => /(?:[A-Za-z’'][\w’'/.-]*\s+){2,}[A-Za-z’']/.test(text) && (/^[\s"“'(]*[A-Z]/.test(text) || /[.!?]["”']?\s*$/.test(text)) && !/[{};=]|=>|--|\bvar\(/.test(text);

/**
 * Reads a TypeScript file: with `jsdoc`, its JSDoc comments (an `@claim` tag covers its
 * comment); with `copy`, its claim() calls, and its prose string literals and JSX text,
 * each of which must be a claim if it states a fact.
 */
export function lintTypeScript(source, { file, jsdoc = false, copy = false }) {
  const findings = [];
  const claims = [];
  const lineAt = (position) => source.slice(0, position).split("\n").length;
  if (jsdoc) {
    for (const match of source.matchAll(/\/\*\*(?!\/)[\s\S]*?\*\//g)) {
      const start = lineAt(match.index);
      const { prose, evidence } = jsdocProse(match[0]);
      const errors = evidence.flatMap((entry) => entry.errors.map((error) => ({ line: start + entry.line - 1, error })));
      for (const entry of evidence) if (!entry.hasCheck) errors.push({ line: start + entry.line - 1, error: "This @claim has no verify: check. Add one: @claim <source> verify:<check>." });
      for (const { line, error } of errors) findings.push({ file, line, sentence: "@claim", message: `${file}:${line}: ${error}` });
      const valid = evidence.length > 0 && errors.length === 0;
      if (valid) claims.push({ file, line: start, text: collapse(prose).slice(0, 160), sources: evidence.flatMap((entry) => entry.sources), checks: evidence.flatMap((entry) => entry.checks) });
      findings.push(...readMarkdown(prose, { file, startLine: start, covered: evidence.length > 0, howTo: HOW_TO.jsdoc }).findings);
    }
  }
  if (!copy) return { findings, claims };
  const kind = file.endsWith(".tsx") ? ts.ScriptKind.TSX : file.endsWith(".ts") || file.endsWith(".mts") ? ts.ScriptKind.TS : ts.ScriptKind.JS;
  const tree = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, kind);
  const lineOf = (node) => tree.getLineAndCharacterOfPosition(node.getStart(tree)).line + 1;
  const prose = (text, node) => findings.push(...readMarkdown(text, { file, startLine: lineOf(node), howTo: HOW_TO.copy }).findings);
  const visit = (node) => {
    if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === "claim") {
      const [textNode, evidenceNode] = node.arguments;
      const text = textNode ? literal(textNode) : undefined;
      const value = evidenceNode ? literal(evidenceNode) : undefined;
      const line = lineOf(node);
      const sentence = typeof text === "string" ? collapse(text) : node.getText(tree).slice(0, 80);
      if (typeof text !== "string" || value === undefined) {
        findings.push({ file, line, sentence, message: `${file}:${line}: "${sentence}": claim()'s arguments must be literals (a string, then an object of strings, numbers and arrays), so pnpm claims:check can read them.` });
        return;
      }
      const evidence = evidenceOf(value);
      for (const error of evidence.errors) findings.push({ file, line, sentence, message: `${file}:${line}: "${sentence}": ${error}` });
      if (evidence.errors.length === 0) claims.push({ file, line, text: sentence, sources: evidence.sources, checks: evidence.checks });
      return;
    }
    if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) return;
    if (ts.isJsxAttribute(node) && CODE_ATTRIBUTES.test(node.name.getText(tree))) return;
    if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && ["cn", "clsx", "require", "matchMedia", "querySelector", "querySelectorAll"].includes(node.expression.text)) return;
    if (ts.isJsxElement(node) || ts.isJsxFragment(node)) {
      const parts = node.children.map((child) => (ts.isJsxText(child) ? child.text : ts.isJsxExpression(child) && child.expression && literal(child.expression) !== undefined ? String(literal(child.expression)) : "§"));
      if (node.children.some((child) => ts.isJsxText(child) && /[A-Za-z]/.test(child.text))) prose(parts.join(""), node);
      for (const child of node.children) if (!ts.isJsxText(child) && !(ts.isJsxExpression(child) && child.expression && literal(child.expression) !== undefined)) visit(child);
      if (ts.isJsxElement(node)) visit(node.openingElement);
      return;
    }
    if ((ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) && isProse(node.text)) {
      if (!(ts.isPropertyAssignment(node.parent) && node.parent.name === node)) prose(node.text, node);
      return;
    }
    if (ts.isTemplateExpression(node)) {
      const text = [node.head.text, ...node.templateSpans.map((span) => `§${span.literal.text}`)].join("");
      if (isProse(text)) prose(text, node);
    }
    ts.forEachChild(node, visit);
  };
  visit(tree);
  return { findings, claims };
}

// ---------------------------------------------------------------------------------------
// Tests

/** Every statically named test in a file, by full name (`describe > it`), and whether it is skipped (skip, todo, fails, or { skip }). */
export function testNames(source, file) {
  const kind = /\.[jt]sx$/.test(file) ? ts.ScriptKind.TSX : /\.m?js$/.test(file) ? ts.ScriptKind.JS : ts.ScriptKind.TS;
  const tree = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, kind);
  const names = new Map();
  const visit = (node, prefix, skipped) => {
    if (ts.isCallExpression(node)) {
      let callee = node.expression;
      const modifiers = [];
      while (ts.isPropertyAccessExpression(callee)) {
        modifiers.unshift(callee.name.text);
        callee = callee.expression;
      }
      const [first, second] = node.arguments;
      if (ts.isIdentifier(callee) && ["describe", "it", "test", "suite"].includes(callee.text) && first && !modifiers.includes("each")) {
        const name = ts.isStringLiteral(first) || ts.isNoSubstitutionTemplateLiteral(first) ? first.text : null;
        const options = second && ts.isObjectLiteralExpression(second) ? literal(second) : undefined;
        const skip = skipped || modifiers.some((modifier) => ["skip", "todo", "fails"].includes(modifier)) || Boolean(options?.skip || options?.todo);
        if (name === null || prefix === null) {
          for (const argument of node.arguments) visit(argument, null, skip);
          return;
        }
        const full = prefix ? `${prefix} > ${name}` : name;
        names.set(full, { skipped: skip });
        for (const argument of node.arguments.slice(1)) visit(argument, full, skip);
        return;
      }
    }
    ts.forEachChild(node, (child) => visit(child, prefix, skipped));
  };
  visit(tree, "", false);
  return names;
}

/** The required CI job that runs a test file, or null. */
function requiredJobFor(root, file) {
  if (/\.sr\.spec\.ts$/.test(file)) return null;
  if (/\.visual\.test\.tsx?$/.test(file)) return "visual";
  if (/^test\/themes\//.test(file)) return "themes";
  if (/^(registry|test|site)\/.*\.test\.tsx?$/.test(file)) return "ci";
  if (/^(registry\/ouro\/e2e\/ouro|site\/e2e)\/.*\.spec\.ts$/.test(file)) return "e2e";
  if (/\.test\.m[jt]s$/.test(file)) {
    const scripts = readJson(root, "package.json")?.scripts ?? {};
    return (scripts["test:scripts"] ?? "").split(/\s+/).includes(file) ? "ci" : null;
  }
  return null;
}

// ---------------------------------------------------------------------------------------
// Checks

function readJson(root, file) {
  const path = join(root, file);
  return existsSync(path) ? JSON.parse(readFileSync(path, "utf8")) : undefined;
}

const read = (root, file) => (existsSync(join(root, file)) && statSync(join(root, file)).isFile() ? readFileSync(join(root, file), "utf8") : undefined);

/** A field path into JSON: `ouro.latestRelease`, `items.0.name`, `items[0]`. */
function field(value, path) {
  let current = value;
  for (const key of path.replace(/\[(\d+)\]/g, ".$1").split(".")) {
    if (current === null || typeof current !== "object" || !(key in current)) return { missing: true };
    current = current[key];
  }
  return { value: current };
}

/** The jobs each workflow defines: id and, when it has one, name. */
function workflowJobs(root) {
  const dir = join(root, ".github/workflows");
  if (!existsSync(dir)) return [];
  const jobs = [];
  for (const workflow of readdirSync(dir).filter((name) => /\.ya?ml$/.test(name)).sort()) {
    const lines = readFileSync(join(dir, workflow), "utf8").split("\n");
    const start = lines.findIndex((line) => /^jobs:\s*$/.test(line));
    if (start === -1) continue;
    for (let index = start + 1; index < lines.length && !/^\S/.test(lines[index]); index++) {
      const id = /^ {2}([\w-]+):\s*$/.exec(lines[index])?.[1];
      if (!id) continue;
      let name;
      for (let inner = index + 1; inner < lines.length && !/^ {0,2}\S/.test(lines[inner]); inner++) name ??= /^ {4}name:\s*(.+?)\s*$/.exec(lines[inner])?.[1]?.replace(/^["']|["']$/g, "");
      jobs.push({ workflow, id, name });
    }
  }
  return jobs;
}

/** The repository's owner/name, for recognising its own GitHub addresses. */
function repoSlug(root) {
  const url = readJson(root, "package.json")?.repository?.url ?? "";
  return /github\.com\/([^/]+\/[^/.]+)/.exec(url)?.[1] ?? "ourostack/ouro-ui";
}

async function fetchStatus(url) {
  let last = 0;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      for (const method of ["HEAD", "GET"]) {
        const response = await globalThis.fetch(url, { method, redirect: "follow", signal: globalThis.AbortSignal.timeout(15000), headers: { "user-agent": "ouro-ui claims check" } });
        last = response.status;
        if (response.ok) return last;
      }
    } catch {
      last = 0;
    }
    await new Promise((settle) => globalThis.setTimeout(settle, 1000 * (attempt + 1)));
  }
  return last;
}

/** Whether a test exists, is not skipped and runs in a required CI job; the failure message otherwise. */
function testProblem(root, id) {
  const [file, name] = [id.slice(0, id.indexOf("::")), id.slice(id.indexOf("::") + 2)];
  const source = read(root, file);
  if (source === undefined) return `${file} does not exist.`;
  const names = testNames(source, file);
  const found = names.get(name);
  if (!found) return `${file} has no test "${name}"; it has: ${[...names.keys()].slice(0, 12).join(", ")}${names.size > 12 ? ", …" : ""}. (A computed name cannot be cited; cite the file with verify:fileLine instead.)`;
  if (found.skipped) return `${file}::${name} is skipped, so it proves nothing.`;
  if (!requiredJobFor(root, file)) return `no required CI job runs ${file}, so a green main does not mean it passed. Cite a test a required job runs, or the run's address.`;
  return null;
}

/**
 * Runs checks (and checks sources that can be checked offline) against the repository at
 * `context.root`. Returns a failure for each that does not hold, with the reason.
 */
export async function verify(checks, context, sources = []) {
  const { root, network = false } = context;
  const cacheFile = context.urlCache ?? URL_CACHE;
  const cache = (context.cache ??= readJson(root, cacheFile) ?? {});
  const failures = [];
  const fail = (message) => failures.push({ message });
  const lines = (text) => text.split("\n").length - (text.endsWith("\n") ? 1 : 0);
  for (const check of checks) {
    if ("count" in check) {
      const what = check.count;
      let count;
      if (what.startsWith("registry:")) count = (readJson(root, "registry.json")?.items ?? []).filter((item) => item.type === what).length;
      else if (what.startsWith("dir:")) {
        const dir = join(root, what.slice(4));
        count = existsSync(dir) ? readdirSync(dir).filter((name) => !name.startsWith(".")).length : undefined;
      } else if (what.includes("#")) {
        const [file, path] = what.split("#");
        const value = field(readJson(root, file), path);
        count = value.missing ? undefined : Array.isArray(value.value) ? value.value.length : value.value && typeof value.value === "object" ? Object.keys(value.value).length : undefined;
      } else {
        fail(`count(${what}): count registry:<type>, dir:<path> or <file>#<field path>.`);
        continue;
      }
      if (count === undefined) fail(`count(${what}) names nothing that exists.`);
      else if (count !== check.is) fail(`count(${what}) counts ${count}, not ${check.is}.`);
    } else if ("equals" in check) {
      const [file, path] = check.equals.split("#");
      const json = readJson(root, file);
      const value = json === undefined ? { missing: true } : field(json, path);
      if (json === undefined) fail(`${file} does not exist.`);
      else if (value.missing) fail(`${file} has no ${path}.`);
      else if (String(value.value) !== String(check.is)) fail(`equals(${check.equals}) is ${JSON.stringify(value.value)}, not ${JSON.stringify(check.is)}.`);
    } else if ("fileLine" in check) {
      const text = read(root, check.fileLine);
      const pattern = new RegExp(check.pattern, check.line ? "" : "m");
      if (text === undefined) fail(`${check.fileLine} does not exist.`);
      else if (check.line) {
        const line = text.split("\n")[check.line - 1];
        if (line === undefined || !pattern.test(line)) fail(`${check.fileLine}:${check.line} does not match /${check.pattern}/${line === undefined ? ` (it has ${lines(text)} lines)` : `: ${line.trim().slice(0, 120)}`}.`);
      } else if (!pattern.test(text)) fail(`${check.fileLine} does not match /${check.pattern}/.`);
    } else if ("ciJob" in check) {
      const jobs = workflowJobs(root).filter((job) => !check.workflow || job.workflow === check.workflow);
      if (!jobs.some((job) => job.id === check.ciJob || job.name === check.ciJob)) fail(`No workflow${check.workflow ? ` (${check.workflow})` : ""} defines a job "${check.ciJob}"; jobs: ${[...new Set(jobs.map((job) => job.id))].join(", ")}.`);
    } else if ("testExists" in check) {
      const problem = testProblem(root, check.testExists);
      if (problem) fail(problem);
    } else if ("urlOk" in check) {
      if (network) {
        cache[check.urlOk] = { status: await fetchStatus(check.urlOk), checked: new Date().toISOString().slice(0, 10) };
        context.cacheChanged = true;
      }
      const entry = cache[check.urlOk];
      if (!entry) fail(`${check.urlOk} has not been checked. Run pnpm claims:check --network and commit ${cacheFile}.`);
      else if (entry.status < 200 || entry.status >= 400) fail(`${check.urlOk} answered ${entry.status || "nothing"} (checked ${entry.checked}).`);
    }
  }
  const slug = repoSlug(root);
  for (const source of sources) {
    if ("file" in source || "evidence" in source) {
      const file = source.file ?? source.evidence;
      const text = read(root, file);
      if (text === undefined && !(existsSync(join(root, file)) && statSync(join(root, file)).isDirectory())) fail(`${file} does not exist.`);
      else if (source.line && text !== undefined && source.line > lines(text)) fail(`${file} has ${lines(text)} lines, not ${source.line}.`);
    } else if ("test" in source) {
      const problem = testProblem(root, source.test);
      if (problem) fail(problem);
    } else if ("spec" in source) {
      const own = new RegExp(`^https://github\\.com/${slug.replace(".", "\\.")}/(?:blob|tree)/[^/]+/([^#?]+)(?:#L(\\d+))?`).exec(source.spec);
      if (own) {
        const file = decodeURIComponent(own[1]).replace(/\/$/, "");
        const text = read(root, file);
        if (!existsSync(join(root, file))) fail(`${file} does not exist.`);
        else if (own[2] && text !== undefined && Number(own[2]) > lines(text)) fail(`${file} has ${lines(text)} lines, not ${own[2]}.`);
      }
    }
  }
  return failures;
}

// ---------------------------------------------------------------------------------------
// Surfaces

/** Files that are not linted, and why: each is generated, evidence or an input whose words are not ours to source. */
const NOT_LINTED = [
  [/^docs\/[^/]+\.md$/, "generated", "pnpm run docs writes it from the JSDoc in registry/, which is linted; CI's `pnpm run docs --check` holds it equal"],
  [/^docs\/guides\/why-no-skill(-[\w-]+)?\.md$/, "generated", "scripts/agent-usability/page.mts renders it from the scored runs in scripts/agent-usability/runs/; pnpm claims:check renders it again and compares"],
  [/^scripts\/agent-usability\/runs\//, "evidence", "a scored run's record, written by the agent-usability harness"],
  [/^scripts\/agent-usability\/(screens|arms)\//, "input", "what the benchmark gives each agent, frozen with its cohort"],
  [/^scripts\/fixtures\/|\/fixtures?\/|^test\/install-fixture/, "input", "a test fixture"],
  [/(^|\/)(LICENSE|THIRD-PARTY-LICENSES)(\.\w+)?$/, "input", "license text"],
  [/^site\/src\/docs\/demos\//, "input", "a docs demo's sample content, not a statement about Ouro HX"],
  [/^site\/src\/(generated|docs\/(catalog|pages)\.json)/, "generated", "written by scripts from the registry and workflows"],
];

function listFiles(root) {
  const git = (args) => execFileSync("git", args, { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
  try {
    if (realpathSync(git(["rev-parse", "--show-toplevel"])) !== realpathSync(root)) throw new Error("not the repository's root");
    return execFileSync("git", ["ls-files", "--cached", "--others", "--exclude-standard"], { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] })
      .split("\n")
      .filter(Boolean)
      .filter((file) => existsSync(join(root, file)));
  } catch {
    const out = [];
    const walk = (dir) => {
      for (const name of readdirSync(dir)) {
        if (["node_modules", ".git", ".tmp"].includes(name)) continue;
        const path = join(dir, name);
        if (statSync(path).isDirectory()) walk(path);
        else out.push(relative(root, path).split("\\").join("/"));
      }
    };
    walk(root);
    return out.sort();
  }
}

/** How a file is read, or undefined when it is not prose a reader sees. */
function modeOf(file) {
  if (/\.(md|txt)$/.test(file)) return "markdown";
  if (/^registry\/.*\.tsx?$/.test(file) && !/\.(test|test-d|stories)\.tsx?$|\.d\.ts$|^registry\/ouro\/e2e\//.test(file)) return "jsdoc";
  if (/^site\/src\/.*\.tsx?$/.test(file) && !/\.test\.tsx?$|\.d\.ts$/.test(file)) return "copy";
  return undefined;
}

/** Every prose surface in the repository: linted, or not, with the reason. */
export function surfaces(root) {
  const out = [];
  for (const file of listFiles(root)) {
    const kind = modeOf(file);
    if (!kind) continue;
    const excluded = NOT_LINTED.find(([pattern]) => pattern.test(file));
    out.push(excluded ? { file, mode: excluded[1], reason: excluded[2] } : { file, mode: "lint", kind });
  }
  return out;
}

/**
 * Sentences that read as claims but state nothing about the world: the Nautilus story's
 * narration on the voyage page. Exact sentences, each with its reason. Keep it short; an entry
 * that no longer matches a finding fails, so it cannot outlive its sentence.
 */
export const ALLOWED = [
  { file: "site/src/voyage/stage/copy.ts", sentence: "All three tanks are full.", reason: "the Nautilus story: Conseil and Nemo on the ship's ballast" },
  { file: "site/src/voyage/stage/copy.ts", sentence: "All stop.", reason: "the Nautilus story: Captain Nemo's order" },
  { file: "site/src/voyage/repaint.tsx", sentence: "All set.", reason: "the Nautilus story: the dive checklist is done" },
  { file: "site/src/voyage/repaint.tsx", sentence: "At 300 fathoms the sea is dark and very quiet.", reason: "the Nautilus story: the dive dialog's narration" },
];

/** Findings without the allowed sentences, and the allowed entries that matched nothing. */
export function applyAllowed(findings, allowed = ALLOWED, files) {
  const used = new Set();
  const kept = findings.filter((finding) => {
    const entry = allowed.find((each) => each.file === finding.file && each.sentence === finding.sentence && finding.kinds);
    if (entry) used.add(entry);
    return !entry;
  });
  const unused = allowed.filter((entry) => !used.has(entry) && (!files || files.includes(entry.file)));
  return { findings: kept, unused: unused.map((entry) => ({ message: `scripts/claims.mjs: the allowed sentence "${entry.sentence}" (${entry.file}) matches no finding any more. Remove it from ALLOWED.` })) };
}

/** Generated regions and sections each linted file leaves out, because a generator writes them from linted sources. */
const GENERATED_REGIONS = {
  "README.md": { skip: ["catalog", "items", "upgrade"] },
  "site/public/llms.txt": { skipSections: ["Items"] },
};

/**
 * Lints one file by its kind. In the files `pnpm run docs` keeps on the newest release
 * (scripts/latest-release.mjs), each `#vX.Y.Z` or `@vX.Y.Z` tag is already a checked claim:
 * `pnpm run docs --check` fails unless it names package.json's `ouro.latestRelease`.
 */
async function readSurface(root, file, kind = modeOf(file)) {
  const raw = readFileSync(join(root, file), "utf8");
  const text = syncedFiles.includes(file) ? raw.replace(/([#@])v\d+\.\d+\.\d+\b/g, (tag) => tag[0] + "§".repeat(tag.length - 1)) : raw;
  if (kind === "markdown") return readMarkdown(text, { file, ...GENERATED_REGIONS[file] });
  return lintTypeScript(text, { file, jsdoc: kind === "jsdoc", copy: kind === "copy" });
}

/** The generated pages claims:check renders again, because no other check does. */
async function generatedFailures(root) {
  const runs = "scripts/agent-usability/runs/2026-10-15";
  if (!existsSync(join(root, runs)) || !existsSync(join(root, "scripts/agent-usability/page.mts"))) return [];
  const { publicationPages } = await import(pathToFileURL(join(root, "scripts/agent-usability/page.mts")).href);
  const failures = [];
  for (const [name, text] of Object.entries(publicationPages(join(root, runs), "why-no-skill.md"))) {
    if (read(root, `docs/guides/${name}`) !== text) failures.push({ message: `docs/guides/${name} differs from what scripts/agent-usability/page.mts renders from ${runs}. Render it again: node scripts/agent-usability/page.mts ${runs} docs/guides/why-no-skill.md.` });
  }
  return failures;
}

/** Verifies claims, prefixing each failure with where the claim is. */
async function verifyClaims(claims, context) {
  const failures = [];
  for (const claim of claims) {
    for (const failure of await verify(claim.checks, context, claim.sources)) failures.push({ ...failure, message: `${claim.file}:${claim.line}: "${claim.text}": ${failure.message}` });
  }
  return failures;
}

/** Writes the addresses `--network` checked into scripts/claims-urls.json, sorted. */
function saveUrlCache(context) {
  if (context.cacheChanged) writeFileSync(join(context.root, URL_CACHE), `${JSON.stringify(Object.fromEntries(Object.entries(context.cache).sort()), null, 2)}\n`);
}

/** Lints every surface and runs every claim's checks. */
export async function checkClaims({ root = repoRoot, network = false, files } = {}) {
  const context = { root, network };
  const listed = surfaces(root).filter((entry) => entry.mode === "lint" && (!files || files.includes(entry.file)));
  const claims = [];
  const failures = [];
  const findings = [];
  for (const entry of listed) {
    const result = await readSurface(root, entry.file, entry.kind);
    claims.push(...result.claims);
    findings.push(...result.findings);
  }
  const allowed = applyAllowed(findings, root === repoRoot ? ALLOWED : [], listed.map((entry) => entry.file));
  failures.push(...allowed.findings, ...allowed.unused);
  failures.push(...(await verifyClaims(claims, context)));
  if (!files) failures.push(...(await generatedFailures(root)));
  saveUrlCache(context);
  return { claims, failures, surfaces: listed.length };
}

// ---------------------------------------------------------------------------------------
// Command line

async function main(argv) {
  const [command, ...rest] = argv;
  const flag = (name) => rest.includes(name);
  const option = (name) => (rest.includes(name) ? rest[rest.indexOf(name) + 1] : undefined);
  const root = option("--root") ?? repoRoot;
  const network = flag("--network");
  const positional = rest.filter((arg, index) => !arg.startsWith("--") && rest[index - 1] !== "--root");
  const report = (failures, ok) => {
    for (const failure of failures) process.stderr.write(`${failure.message}\n`);
    if (failures.length > 0) {
      process.stderr.write(`\n${failures.length} problem${failures.length === 1 ? "" : "s"}. Each factual sentence needs a primary source and a check: docs/guides/claims.md.\n`);
      return 1;
    }
    process.stdout.write(`${ok}\n`);
    return 0;
  };
  if (command === "check") {
    const result = await checkClaims({ root, network });
    return report(result.failures, `${result.claims.length} claim${result.claims.length === 1 ? "" : "s"} verified on ${result.surfaces} surfaces.`);
  }
  if (command === "lint") {
    const context = { root, network };
    const claims = [];
    const failures = [];
    const texts = [];
    if (flag("--pr")) {
      texts.push({ file: "pull request title", text: process.env.PR_TITLE ?? "", plain: true });
      texts.push({ file: "pull request body", text: process.env.PR_BODY ?? "" });
    }
    if (flag("--stdin")) texts.push({ file: option("--name") ?? "stdin", text: readFileSync(0, "utf8") });
    for (const { file, text, plain } of texts) {
      const result = readMarkdown(plain ? text.replace(/^#+\s*/, "") : text, { file });
      claims.push(...result.claims);
      failures.push(...result.findings);
    }
    const modes = new Map(surfaces(root).map((entry) => [entry.file, entry]));
    for (const file of positional) {
      const entry = modes.get(file);
      if (entry && entry.mode !== "lint") {
        process.stderr.write(`${file} is not linted: ${entry.mode}, ${entry.reason}.\n`);
        continue;
      }
      const result = await readSurface(root, file);
      claims.push(...result.claims);
      failures.push(...applyAllowed(result.findings, ALLOWED, [file]).findings);
    }
    failures.push(...(await verifyClaims(claims, context)));
    saveUrlCache(context);
    return report(failures, `${claims.length} claim${claims.length === 1 ? "" : "s"} verified; no unsourced claims.`);
  }
  if (command === "show") {
    for (const file of positional) {
      const { claims, findings } = await readSurface(root, file);
      for (const claim of claims) {
        const failures = await verify(claim.checks, { root, network }, claim.sources);
        process.stdout.write(`${file}:${claim.line}: ${claim.text}\n`);
        for (const source of claim.sources) process.stdout.write(`  source ${JSON.stringify(source)}\n`);
        for (const check of claim.checks) process.stdout.write(`  verify ${JSON.stringify(check)}\n`);
        process.stdout.write(failures.length === 0 ? "  holds\n" : failures.map((failure) => `  FAILS: ${failure.message}\n`).join(""));
      }
      for (const finding of findings) process.stdout.write(`UNSOURCED ${finding.message}\n`);
    }
    return 0;
  }
  process.stderr.write("Usage: node scripts/claims.mjs check [--network] | lint [<file>…] [--pr] [--stdin] | show <file>…\n");
  return 2;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = await main(process.argv.slice(2));
}
