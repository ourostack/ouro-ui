// A pull request that raises a size ceiling, a budget or margin, or a pattern's measured baseline must
// say which pull request's growth earns the bytes and the CI run that measured it, with a
// `ceiling: <reason>` line in its description — mechanical, like scripts/release-note.mjs's shipped-file
// check, reading the body from the environment only. A diff that only adds a brand-new constant (absent
// from the base) is not a raise and needs no line. `.github/headroom.json`'s own exemptions already need
// a reason (scripts/headroom-ratchet.mjs) and are left alone here.
//
// Report-only for now (AGENTS.md's "Red-main fixes": a new gate like this lands report-only first,
// #3524): this prints what it finds and always exits 0. It is not wired into any required check.
//
//   BASE_REF=origin/main PR_BODY="…" node scripts/ceiling-ratchet.mjs
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

/**
 * Named size-ceiling, budget/margin or measured-baseline declarations this check ratchets. Each is matched
 * from its `const`/`export const` keyword through the first top-level `;` that follows, so the long history
 * comments a raise is recorded in (which sit above the statement, not inside it) are never compared.
 */
export const anchors = [
  { id: "catalog.spec.ts MEASURED", file: "site/e2e/catalog.spec.ts", name: "MEASURED" },
  { id: "catalog.spec.ts MARGIN", file: "site/e2e/catalog.spec.ts", name: "MARGIN" },
  { id: "catalog.spec.ts CSS_MARGIN", file: "site/e2e/catalog.spec.ts", name: "CSS_MARGIN" },
  { id: "catalog.spec.ts CSS_CEILINGS", file: "site/e2e/catalog.spec.ts", name: "CSS_CEILINGS" },
  // CSS_CEILINGS also gets one anchor per key: it is one object literal, and every key shares the same
  // 1024 multiplier, so a raise of one key hidden behind an equal-sized fall of another (#3524) changes
  // none of the combined sums above, however they are computed, but always changes its own key's anchor.
  { id: "catalog.spec.ts CSS_CEILINGS.voyage", file: "site/e2e/catalog.spec.ts", name: "CSS_CEILINGS", key: "voyage" },
  { id: "catalog.spec.ts CSS_CEILINGS.docs", file: "site/e2e/catalog.spec.ts", name: "CSS_CEILINGS", key: "docs" },
  { id: "catalog.spec.ts CSS_CEILINGS.docsShell", file: "site/e2e/catalog.spec.ts", name: "CSS_CEILINGS", key: "docsShell" },
  { id: "catalog.spec.ts CSS_CEILINGS.docsPage", file: "site/e2e/catalog.spec.ts", name: "CSS_CEILINGS", key: "docsPage" },
  { id: "catalog.spec.ts PREVIEWS_CEILING", file: "site/e2e/catalog.spec.ts", name: "PREVIEWS_CEILING" },
  { id: "catalog.spec.ts ISLAND_CEILING", file: "site/e2e/catalog.spec.ts", name: "ISLAND_CEILING" },
  { id: "pattern-size.mjs CEILINGS", file: "scripts/pattern-size.mjs", name: "CEILINGS" },
  { id: "pattern-size.mjs BUDGET", file: "scripts/pattern-size.mjs", name: "BUDGET" },
];

/** The value of one `a + b` or `a * b` run of integer literals (underscores allowed), left to right. */
function evaluateExpr(expr) {
  const tokens = expr.match(/\d[\d_]*|[*+]/g);
  let result = Number(tokens[0].replace(/_/g, ""));
  for (let i = 1; i < tokens.length; i += 2) {
    const value = Number(tokens[i + 1].replace(/_/g, ""));
    result = tokens[i] === "*" ? result * value : result + value;
  }
  return result;
}

/**
 * The sum of every `a + b` or `a * b` arithmetic run (underscores allowed, as `295_904`, either operator,
 * never both in one run) in `name`'s declaration in `text`, evaluated rather than digit-summed, so a
 * `56 * 1024` ceiling counts as 57344 and not as 56 + 1024. Pass `key` to read one property's own run out
 * of an object literal instead of every run in the whole declaration (`\bkey\b`, so `docs` does not match
 * `docsShell`). Returns null when `name` (or `key` within it) is not declared there.
 */
export function declaredSum(text, name, key) {
  const match = text.match(new RegExp(`(?:export\\s+)?const\\s+${name}\\s*=[\\s\\S]*?;`));
  if (!match) return null;
  const scope =
    key === undefined ? match[0] : (match[0].match(new RegExp(`\\b${key}\\b\\s*:\\s*(\\d[\\d_]*(?:\\s*[*+]\\s*\\d[\\d_]*)*)`)) ?? [])[1];
  if (scope === undefined) return null;
  const expressions = scope.match(/\d[\d_]*(?:\s*[*+]\s*\d[\d_]*)*/g) ?? [];
  return expressions.reduce((sum, expr) => sum + evaluateExpr(expr), 0);
}

/** The reason on a `ceiling: <reason>` line of the description, or null when there is none or it is under three characters. */
export function ceilingReason(body) {
  for (const [, reason] of (body ?? "").matchAll(/^[ \t]*ceiling:[ \t]*(.*?)[ \t]*$/gim)) {
    if (reason.replace(/\s/g, "").length >= 3) return reason;
  }
  return null;
}

/**
 * What rose: `anchors` is `[{ id, base, head }]`, each side `declaredSum`'s result (null where the
 * constant is absent there). `body` is the pull request's description. Returns one line per anchor whose
 * sum grew, naming it and the fix, or none when every anchor held or shrank, a side is absent (a brand-new
 * or removed constant, not a raise), or the description already carries a `ceiling:` line.
 */
export function ceilingRatchetProblems({ anchors, body = "" }) {
  if (ceilingReason(body) !== null) return [];
  return anchors
    .filter(({ base, head }) => base !== null && head !== null && head > base)
    .map(
      ({ id, base, head }) =>
        `${id} rose from ${base} to ${head}. Fix: name, in the description, the pull request whose growth earns it and the CI run that measured it, as a "ceiling: <reason>" line.`,
    );
}

function git(args) {
  return execFileSync("git", args, { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
}

/** The text of `path` at `rev`, or null when the commit has no such file. */
function contentAt(rev, path) {
  try {
    return git(["show", `${rev}:${path}`]);
  } catch {
    return null;
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const baseRef = process.env["BASE_REF"];
  if (!baseRef) {
    console.error('usage: BASE_REF=origin/main PR_BODY="…" node scripts/ceiling-ratchet.mjs');
    process.exit(2);
  }
  const base = git(["merge-base", baseRef, "HEAD"]).trim();
  const results = anchors.map(({ id, file, name, key }) => {
    const baseText = contentAt(base, file);
    const headText = contentAt("HEAD", file);
    return {
      id,
      base: baseText === null ? null : declaredSum(baseText, name, key),
      head: headText === null ? null : declaredSum(headText, name, key),
    };
  });
  const body = process.env["PR_BODY"] ?? "";
  const problems = ceilingRatchetProblems({ anchors: results, body });
  for (const problem of problems) console.log(`::warning title=ceiling raised without a reason::${problem}`);
  if (problems.length > 0) {
    console.log(
      `ceiling ratchet: report-only for now (issue #3524) — would otherwise fail on ${problems.length} anchor${problems.length === 1 ? "" : "s"}.`,
    );
  } else {
    console.log('ceiling ratchet: no ceiling, budget/margin or measured baseline rose without a "ceiling:" line.');
  }
}
