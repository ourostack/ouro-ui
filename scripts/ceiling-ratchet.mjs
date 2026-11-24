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
  { id: "catalog.spec.ts PREVIEWS_CEILING", file: "site/e2e/catalog.spec.ts", name: "PREVIEWS_CEILING" },
  { id: "catalog.spec.ts ISLAND_CEILING", file: "site/e2e/catalog.spec.ts", name: "ISLAND_CEILING" },
  { id: "pattern-size.mjs CEILINGS", file: "scripts/pattern-size.mjs", name: "CEILINGS" },
  { id: "pattern-size.mjs BUDGET", file: "scripts/pattern-size.mjs", name: "BUDGET" },
];

/**
 * The sum of every integer literal (underscores allowed, as `295_904`) in `name`'s declaration in `text`,
 * or null when `name` is not declared there. A declaration's shape (how many keys, what multiplies what)
 * is never the same between unrelated changes, but its sum only grows when a measured value, a ceiling or
 * a budget genuinely does.
 */
export function declaredSum(text, name) {
  const match = text.match(new RegExp(`(?:export\\s+)?const\\s+${name}\\s*=[\\s\\S]*?;`));
  if (!match) return null;
  const numbers = [...match[0].matchAll(/\d[\d_]*/g)].map((digits) => Number(digits[0].replace(/_/g, "")));
  return numbers.reduce((sum, n) => sum + n, 0);
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
  const results = anchors.map(({ id, file, name }) => {
    const baseText = contentAt(base, file);
    const headText = contentAt("HEAD", file);
    return {
      id,
      base: baseText === null ? null : declaredSum(baseText, name),
      head: headText === null ? null : declaredSum(headText, name),
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
