export { isSecretKey, leaks, REDACT_RULES, redactLine, redactText, redactValue };
export type { RedactOptions, RedactRule };

// The export list comes first because the shadcn CLI drops comments before a file's
// first statement, which would take the JSDoc below with it.

/**
 * Redaction for a diagnostics bundle: what leaves the computer for an agent to read or attach keeps categories, counts,
 * times, versions and the tool's own words, and drops tokens, cookies, ids, email addresses, paths in a person's home
 * and what anyone wrote. `redactText` replaces each shape, and `leaks` checks that none is left, which a bundle runs over
 * its whole text before it writes a byte (ax-bundle).
 *
 * @claim "`redactText` replaces each shape, and `leaks` checks that none is left" registry/ouro/ax/redact.test.mts verify:testExists(registry/ouro/ax/redact.test.mts::leaks names each shape left in a text, an app's own included, and nothing in what redaction leaves)
 * @claim "drops tokens, cookies, ids, email addresses, paths in a person's home and what anyone wrote" registry/ouro/ax/redact.test.mts verify:testExists(registry/ouro/ax/redact.test.mts::a log full of real-looking secrets comes out with none of them, and leaks finds nothing left)
 * @example
 * redactText("GET https://api.example.com/v1/me?token=abc Authorization: Bearer eyJhbGciOi.eyJzdWIiOi.c2ln", { home: "/Users/jordan" });
 * // "GET https://api.example.com/… Authorization: [redacted]"
 */
interface RedactRule {
  /** The shape's name, which `leaks` reports. */
  name: string;
  /** The shape, with the `g` flag. */
  re: RegExp;
  /** What a match becomes: a fixed word in brackets, or a function of the match and its groups. */
  to: string | ((match: string, ...groups: string[]) => string);
}

/**
 * `home` is the person's home folder, which becomes `~`. `rules` are an app's own shapes, such as its chat service's
 * ids, run before the built-in ones; `leaks` reports any match of them left.
 */
interface RedactOptions {
  home?: string;
  rules?: readonly RedactRule[];
}

/** A quoted value the text keeps: a lowercase code or version ("signed-in", "0.2.10", "mode=silent"). */
const SAFE_VALUE = /^[a-z0-9._:/+=-]{0,40}$/;
/** ISO times are kept: they say when, not who. */
const ISO_TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:?\d{2})?$/;
/** Keys whose values are what someone wrote or who they are, whatever they hold. */
const CONTENT_KEYS = /^(title|name|displayname|givenname|surname|text|body|content|preview|subject|summary|message|msg|email|mail|upn|userprincipalname|topic|login_?hint|loginhint|account|user(name)?|owner|author|phone|address|from|to|who)$/i;
/** Keys whose values are secrets, whatever they hold. */
const SECRET_WORDS = "token|secret|passw(?:or)?d|pwd|cookie|session|credential|api_?key|private_?key|signature|assertion|authorization|bearer";
const SECRET_KEY = new RegExp(`^(sid|[A-Za-z_-]*(${SECRET_WORDS})[A-Za-z_-]*)$`, "i");

/**
 * Whether a JSON key holds a secret whatever its value: `token`, `refreshToken`, `cookie`, `sessionId`, `password`,
 * `apiKey`, `authorization`, `sid` and the like.
 *
 * @claim "Whether a JSON key holds a secret whatever its value" registry/ouro/ax/redact.test.mts verify:testExists(registry/ouro/ax/redact.test.mts::redactValue keeps keys, numbers, times and codes, and drops secrets and what anyone wrote)
 * @example
 * isSecretKey("refresh_token"); // true
 * isSecretKey("state"); // false
 */
function isSecretKey(key: string): boolean {
  return SECRET_KEY.test(key);
}

/**
 * Each shape that must never leave in a bundle, with what it becomes. Order matters: whole tokens before their parts,
 * and a URL before the email address its sign-in part would look like.
 *
 * @claim "Each shape that must never leave in a bundle" registry/ouro/ax/redact.test.mts verify:testExists(registry/ouro/ax/redact.test.mts::redactText replaces each shape with its category and keeps the words around it)
 */
const REDACT_RULES: readonly RedactRule[] = Object.freeze([
  { name: "private-key", re: /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?(?:-----END [A-Z ]*PRIVATE KEY-----|$)/g, to: "[private key]" },
  { name: "jwt", re: /\beyJ[\w-]{6,}\.[\w-]{6,}\.[\w-]*/g, to: "[token]" },
  { name: "header", re: /\b(authorization|proxy-authorization|cookie|set-cookie|x-api-key|x-[a-z-]*token)(\s*[:=]\s*)(?!\[redacted\])[^\n]*/gi, to: (_m, key, sep) => `${key}${sep}[redacted]` },
  { name: "secret-field", re: new RegExp(`"(sid|[A-Za-z_-]*(?:${SECRET_WORDS})[A-Za-z_-]*)"(\\s*:\\s*)"(?!\\[redacted\\]")(?:[^"\\\\\\n]|\\\\.)+"`, "gi"), to: (_m, key, sep) => `"${key}"${sep}"[redacted]"` },
  { name: "bearer", re: /\b(bearer|basic)\s+[A-Za-z0-9._~+/=-]{8,}/gi, to: (_m, kind) => `${kind} [token]` },
  // Tokens a service marks with its own prefix: GitHub, GitLab, Slack, Stripe, npm, AWS, Google, SendGrid, OpenAI.
  { name: "service-token", re: /\b(?:gh[pousr]_|github_pat_|glpat-|xox[abposr]-|sk-(?:proj-)?|[spr]k_(?:live|test)_|npm_|AKIA|ASIA|AIza|SG\.)[A-Za-z0-9_.-]{10,}/g, to: "[token]" },
  { name: "url", re: /\b(https?|wss?):\/\/(?:[^/\s"'<>?#@]*@)?([^/\s"'<>?#@]+)[^\s"'<>)\]]*/gi, to: (m, scheme, host) => (m === `${scheme}://${host}` ? m : `${scheme}://${host}/…`) },
  { name: "secret", re: /\b([A-Za-z_]*(?:token|secret|password|passwd|pwd|code|nonce|state|cookie|session|sid|key|auth|assertion|hint|verifier|signature|sig)[A-Za-z_]*)=("[^"]*"|[^\s&,;)"']+)/gi, to: (_m, key) => `${key}=[redacted]` },
  { name: "email", re: /[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+/g, to: "[email]" },
  { name: "guid", re: /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi, to: "[id]" },
  // 32 characters or more with a digit and a letter: a key, a hash or an encoded secret, not a word or a folder path.
  { name: "opaque", re: /[A-Za-z0-9+/_-]{32,}={0,2}/g, to: (m) => (isOpaque(m) ? "[opaque]" : m) },
  { name: "user-path", re: /(\/Users\/|\/home\/|[A-Za-z]:[\\/]Users[\\/])[^/\\\s"']+/g, to: (_m, root) => `${root}[user]` },
]);

/** A long run of key characters is opaque when it mixes digits and letters. */
function isOpaque(run: string): boolean {
  return /\d/.test(run) && /[A-Za-z]/.test(run);
}

/** The longest line the rules read: some take time that grows with a line's length squared, so a longer one is cut first. */
const MAX_LINE = 4000;

/**
 * A line cut to `MAX_LINE` at a space, so a token is kept whole or dropped whole; a line with no space that early becomes
 * its length alone.
 *
 * @claim "so a token is kept whole or dropped whole" registry/ouro/ax/redact.test.mts verify:testExists(registry/ouro/ax/redact.test.mts::a huge line is cut before the rules read it, at a space, so redaction stays fast)
 */
function cutLine(line: string): string {
  if (line.length <= MAX_LINE) return line;
  const space = line.lastIndexOf(" ", MAX_LINE);
  return space > 0 ? `${line.slice(0, space)} …` : `[${line.length} characters]`;
}

/** Quoted words: kept when they are a safe code, else "[text]", since quotes in a log hold what someone wrote or a name. */
function redactQuotes(s: string): string {
  return s
    .replace(/"((?:[^"\\\n]|\\.){0,400})"/g, (m, inner: string) => (SAFE_VALUE.test(inner) || inner === "[redacted]" ? m : `"[text]"`))
    .replace(/“[^”\n]{0,400}”/g, "“[text]”")
    .replace(/‘[^’\n]{0,400}’/g, "‘[text]’")
    .replace(/(^|[\s=(:[])'([^'\n]{1,400})'/g, (m, lead: string, inner: string) => (SAFE_VALUE.test(inner) ? m : `${lead}'[text]'`));
}

/**
 * Free text with every shape replaced by its category: `[token]`, `[redacted]`, `[email]`, `[id]`, `[opaque]`,
 * `[private key]`, `[user]`, a URL cut to its host, and quoted words as `[text]`. The person's home folder becomes `~`.
 * A line longer than 4,000 characters is cut at a space first, and one with no space that early becomes its length, so
 * a huge log line takes no longer than a short one.
 *
 * @claim "A line longer than 4,000 characters is cut at a space first" registry/ouro/ax/redact.test.mts verify:testExists(registry/ouro/ax/redact.test.mts::a huge line is cut before the rules read it, at a space, so redaction stays fast)
 * @claim "every shape replaced by its category" registry/ouro/ax/redact.test.mts verify:testExists(registry/ouro/ax/redact.test.mts::redactText replaces each shape with its category and keeps the words around it)
 * @example
 * redactText(`signed in as jordan@contoso.com from /Users/jordan/Library`, { home: "/Users/jordan" });
 * // "signed in as [email] from ~/Library"
 */
function redactText(s: string, { home, rules = [] }: RedactOptions = {}): string {
  let out = s.split("\n").map(cutLine).join("\n");
  if (home && home.length > 1) out = out.split(home).join("~");
  for (const r of [...rules, ...REDACT_RULES]) out = out.replace(r.re, r.to as string);
  return redactQuotes(out);
}

/**
 * A JSON value with its keys kept, and numbers, booleans, ISO times and lowercase codes. A secret key's value becomes
 * `"[redacted]"`, a content key's (`title`, `name`, `text`, `email`, `message` and the like) `"[text]"`, and any other
 * string `"[text]"` unless it is one word the rules leave alone, or one word they redact, which comes back redacted.
 *
 * @claim "A secret key's value becomes" registry/ouro/ax/redact.test.mts verify:testExists(registry/ouro/ax/redact.test.mts::redactValue keeps keys, numbers, times and codes, and drops secrets and what anyone wrote)
 * @example
 * redactValue({ level: "warn", at: "2026-11-17T19:57:02Z", token: "abc", title: "Plans", n: 3 });
 * // { level: "warn", at: "2026-11-17T19:57:02Z", token: "[redacted]", title: "[text]", n: 3 }
 */
function redactValue(v: unknown, opts: RedactOptions = {}, key = ""): unknown {
  if (typeof v === "string") {
    if (CONTENT_KEYS.test(key)) return "[text]";
    if (isSecretKey(key)) return "[redacted]";
    if (ISO_TIME.test(v)) return v;
    return /\s/.test(v) ? "[text]" : redactText(v, opts);
  }
  if (Array.isArray(v)) return v.map((x) => redactValue(x, opts, key));
  if (v && typeof v === "object") return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, redactValue(x, opts, k)]));
  return v;
}

/**
 * A log line: a JSON object line by its values (`redactValue`), any other line as text (`redactText`).
 *
 * @claim "a JSON object line by its values" registry/ouro/ax/redact.test.mts verify:testExists(registry/ouro/ax/redact.test.mts::redactLine reads a JSON line by its values and any other line as text)
 * @example
 * redactLine(`{"level":"info","event":"sign-in","email":"jordan@contoso.com"}`);
 * // '{"level":"info","event":"sign-in","email":"[text]"}'
 */
function redactLine(line: string, opts: RedactOptions = {}): string {
  const t = line.trim();
  if (t.startsWith("{") && t.endsWith("}")) {
    try {
      return JSON.stringify(redactValue(JSON.parse(t), opts));
    } catch {
      // Not JSON after all: redacted as text.
    }
  }
  return redactText(line, opts);
}

/** What a rule leaves behind, which is clean: a header or key with [redacted], a URL cut to its host, a user folder as [user]. */
function leftByRule(name: string, said: string): boolean {
  if (name === "header" || name === "secret") return /^[^:=]*[:=]\s*\[redacted\]/.test(said);
  if (name === "url") {
    const rest = said.replace(/^[a-z]+:\/\//i, "");
    return !rest.includes("@") && !/\/[^…]/.test(rest);
  }
  if (name === "opaque") return !isOpaque(said);
  return name === "user-path" && said.endsWith("[user]");
}

/**
 * The shapes still in `text` that must never leave, by name; empty when it is clean. A bundle runs it over its whole
 * text after redaction and refuses to write when it finds any (ax-bundle). An app's own `rules` count too.
 *
 * @claim "empty when it is clean" registry/ouro/ax/redact.test.mts verify:testExists(registry/ouro/ax/redact.test.mts::leaks names each shape left in a text, an app's own included, and nothing in what redaction leaves)
 * @example
 * leaks("token=abc and jordan@contoso.com"); // ["secret", "email"]
 * leaks(redactText("token=abc and jordan@contoso.com")); // []
 */
function leaks(text: string, { rules = [] }: Pick<RedactOptions, "rules"> = {}): string[] {
  const found = new Set<string>();
  for (const r of [...rules, ...REDACT_RULES]) {
    for (const m of text.matchAll(new RegExp(r.re.source, r.re.flags))) {
      const app = rules.includes(r);
      if (app ? m[0] === r.to : leftByRule(r.name, m[0])) continue;
      found.add(r.name);
    }
  }
  return [...found];
}
