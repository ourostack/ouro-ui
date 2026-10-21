export { claim, parseClaimCheck, parseClaimSource };
export type { ClaimCheck, ClaimEvidence, ClaimSource };

// The export list comes first because the shadcn CLI drops comments before a file's
// first statement, which would take the JSDoc below with it. No imports, so a Node script
// can load this file directly (scripts/claims.mjs) to read the same source and check syntax.

/**
 * Where a claim comes from: a primary source a later reader can open and check.
 *
 * - `{ file, line?, commit? }`: a file in the repository, at a line and commit when one
 *   line of one version is the proof (`scripts/claims.mjs#L12@c752a8bb`).
 * - `{ ciRun }`: a GitHub Actions run (`https://github.com/<owner>/<repo>/actions/runs/<id>`).
 * - `{ test }`: a test, as `<file>::<full test name>` (`describe > it`).
 * - `{ spec }`: a published specification or document, by its address.
 * - `{ evidence }`: a committed evidence file (a run's results, a recording, a score).
 */
type ClaimSource =
  | { file: string; line?: number | undefined; commit?: string | undefined }
  | { ciRun: string }
  | { test: string }
  | { spec: string }
  | { evidence: string };

/**
 * A machine check that the claim still holds, run by `pnpm claims:check`.
 *
 * - `{ count, is }`: how many there are. `count` is a registry item type
 *   (`registry:ui`) or `<file>#<field path>` naming a JSON array or object.
 * - `{ urlOk }`: the address answers with a success status.
 * - `{ testExists }`: the test (`<file>::<full test name>`) exists, is not skipped and runs
 *   in a required CI job, so a green main means it passed.
 * - `{ ciJob, workflow? }`: a workflow defines the job.
 * - `{ fileLine, line?, pattern }`: the file, or that line of it, matches the pattern
 *   (a regular expression's source).
 * - `{ equals, is }`: the value at `<file>#<field path>` in a JSON file is exactly `is`.
 */
type ClaimCheck =
  | { count: string; is: number }
  | { urlOk: string }
  | { testExists: string }
  | { ciJob: string; workflow?: string | undefined }
  | { fileLine: string; line?: number | undefined; pattern: string }
  | { equals: string; is: string | number };

type OneOrMore<T> = T | readonly [T, ...T[]];

/** A claim's evidence: at least one primary source and at least one check. */
interface ClaimEvidence {
  /** Where the claim comes from. */
  source: OneOrMore<ClaimSource>;
  /** How `pnpm claims:check` proves it still holds. */
  verify: OneOrMore<ClaimCheck>;
}

/**
 * Marks a sentence of copy as a claim, with the primary source it comes from and a check
 * that it still holds. It returns the text unchanged, so the copy reads as before; the
 * evidence is for whoever checks it next, and `pnpm claims:check` reads it from the source
 * code (keep the arguments literal) and runs each check.
 *
 * Use a plain string instead when the sentence states no fact a reader could check: an
 * instruction, a label, a question.
 *
 * @group Text
 *
 * @example
 * const tagline = claim("73 components, each tested in Chromium and WebKit.", {
 *   source: { file: "registry.json" },
 *   verify: [{ count: "registry:ui", is: 73 }, { ciJob: "ci" }],
 * });
 */
function claim<const Text extends string>(text: Text, evidence: ClaimEvidence): Text {
  void evidence;
  return text;
}

const CHECK_FORMS = "count(<what>)=<n>, urlOk(<https URL>), testExists(<file>::<full test name>), ciJob([<workflow>#]<job>), fileLine(<path>[#L<line>], /<pattern>/) or equals(<file>#<field path>)=<value>";

/** A repository-relative path: no leading slash, no `..`, no spaces. */
function repoPath(path: string, what: string): string {
  if (!/^[\w@.-][\w@./+-]*$/.test(path) || /(^|\/)\.\.(\/|$)/.test(path)) {
    throw new Error(`${what} "${path}" is not a repository-relative path (such as scripts/claims.mjs). A source outside the repository cannot be checked by the next reader; commit it as evidence first.`);
  }
  return path;
}

const testId = (text: string, what: string): string => {
  if (!/^\S+::\S/.test(text)) throw new Error(`${what} "${text}" needs the form <file>::<full test name>, as Vitest names it ("Button > shows a spinner").`);
  return text;
};

/**
 * Reads a source as the Markdown claim syntax writes it: a repository path
 * (`path#L12@c752a8bb`), a CI run or other address, `test:<file>::<full test name>` or
 * `evidence:<repository path>`. Throws an error that says what a valid source looks like.
 *
 * @internal
 */
function parseClaimSource(text: string): ClaimSource {
  const value = text.trim();
  if (!value) throw new Error("A claim needs a source: a repository path, a CI run, test:<file>::<full test name>, evidence:<path> or a specification's address.");
  if (/^https:\/\/github\.com\/[^/]+\/[^/]+\/actions\/runs\/\d+/.test(value)) return { ciRun: value };
  if (/^https?:\/\//.test(value)) return { spec: value };
  if (value.startsWith("test:")) return { test: testId(value.slice(5), "The test source") };
  if (value.startsWith("evidence:")) {
    if (value === "evidence:") throw new Error("An evidence source needs the form evidence:<repository path>.");
    return { evidence: repoPath(value.slice(9), "The evidence file") };
  }
  const parts = /^([^#@]*)(?:#L(\d+))?(?:@([0-9a-f]{7,40}))?$/.exec(value);
  if (!parts) throw new Error(`The source "${value}" needs the form <repository path>[#L<line>][@<commit>].`);
  const [, path, line, commit] = parts;
  return { file: repoPath(path!, "The source"), ...(line ? { line: Number(line) } : {}), ...(commit ? { commit } : {}) };
}

/**
 * Reads a check as the Markdown claim syntax writes it, after `verify:`. Throws an error
 * that lists every check's form.
 *
 * @internal
 * @claim registry/ouro/lib/ouro/claims.test.ts verify:testExists(registry/ouro/lib/ouro/claims.test.ts::parseClaimCheck > refuses an unknown or malformed check, listing the forms)
 */
function parseClaimCheck(text: string): ClaimCheck {
  const value = text.trim();
  const call = /^(\w+)\((.*)\)\s*(?:=\s*(.*))?$/s.exec(value);
  const name = call ? call[1] : "";
  const args = call ? call[2]! : "";
  const result = call?.[3];
  const malformed = (form: string) => new Error(`"${value}" is not a check. Write ${form}.`);
  switch (name) {
    case "count": {
      if (result === undefined || !/^\d+$/.test(result.trim())) throw malformed("count(<what>)=<n>");
      return { count: args.trim(), is: Number(result.trim()) };
    }
    case "urlOk":
      if (!/^https?:\/\/\S+$/.test(args.trim())) throw malformed("urlOk(<https URL>)");
      return { urlOk: args.trim() };
    case "testExists":
      return { testExists: testId(args.trim(), "The test") };
    case "ciJob": {
      const [workflow, job] = args.includes("#") ? args.trim().split("#") : [undefined, args.trim()];
      return { ciJob: job!, ...(workflow ? { workflow } : {}) };
    }
    case "fileLine": {
      const parts = /^([^,#]+)(?:#L(\d+))?,\s*\/(.*)\/$/s.exec(args.trim());
      if (!parts) throw malformed("fileLine(<path>[#L<line>], /<pattern>/)");
      const [, path, line, pattern] = parts as unknown as [string, string, string | undefined, string];
      try {
        new RegExp(pattern);
      } catch {
        throw new Error(`"${value}": /${pattern}/ is not a valid pattern.`);
      }
      return { fileLine: repoPath(path.trim(), "The file"), ...(line ? { line: Number(line) } : {}), pattern };
    }
    case "equals": {
      if (!/^[^#]+#\S+$/.test(args.trim()) || !result?.trim()) throw malformed("equals(<file>#<field path>)=<value>");
      const is = result.trim();
      return { equals: args.trim(), is: /^-?\d+(\.\d+)?$/.test(is) ? Number(is) : is };
    }
    default:
      throw new Error(`"${value}" is not a check. Write one of ${CHECK_FORMS}.`);
  }
}
