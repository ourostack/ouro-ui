// Source rules that keep what we ship intact in an app, and the suite addressable:
//
// - leadingComment: the shadcn CLI drops every comment before a file's first statement
//   when it installs the file (a header, or the JSDoc on a first export). Registry files
//   start with a statement that has no comment before it: the imports, or an export list.
// - unpreservedHints: esbuild's TypeScript transform (Vite) strips comments, so an
//   istanbul hint survives only with `@preserve`: `/* istanbul ignore next @preserve -- why */`.
// - needsClientDirective / hasClientDirective: Next.js App Router renders a file as a
//   Server Component unless it starts with "use client", and a hook there fails the build.
//   Every runtime component, parts and provider file, and every module that calls a hook
//   or creates a context, starts with the directive; shadcn keeps it when the app's
//   components.json has "rsc": true.
// - testNames: the full name of every test (describe titles and the test title), so a
//   name filter (`vitest -t`, `playwright -g`) can target each test alone.
//
// - alarmingFileName / alarmingTestTitle: a shipped file name or a test title that an app's
//   log filter reads as a warning or an error (use-dev-warnings.ts, "warn for …").
//
// - directTabPresses: a test or spec that presses Tab itself. WebKit on a Mac skips buttons and
//   links on a plain Tab unless a system setting is on, so tests use pressTab() (testing/tab.ts,
//   e2e/ouro/story.ts), which works whatever the setting.
//
// - physicalUtilities: a class that places, pads, borders or rounds a part by a physical side
//   (`left-2`, `ml-2`, `pr-4`, `border-l`, `rounded-r-xl`, `text-left`), which stays on that
//   side in a right-to-left page. Components use the logical side (`start-2`, `ms-2`, `pe-4`,
//   `border-s`, `rounded-e-xl`, `text-start`), unless `physicalAllowed` lists the class with why
//   it must follow the screen, not the text.
// - timerBoundReads: a test or spec that waits for a state that lasts a set time on the real
//   clock: a confirmation label (Copied, Link copied), a toast with a countdown, a story's save in
//   progress. A loaded runner can take longer than that time between two steps, and the state is
//   gone when the check looks. Such a test holds the page's clock (vi.useFakeTimers, holdClock) or
//   records the state as it happens (watchAnnouncements, watchToasts). A test that means to run on
//   the real clock says why in a `// real clock: <reason>` comment.
//
// scripts/source-rules.test.mjs applies them to the repository; scripts/install-check.mjs
// compares the comments of each installed file with its source.
import { readFileSync } from "node:fs";
import { URL } from "node:url";
import ts from "typescript";

const kind = (path) => (path.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
const parse = (path, text) => ts.createSourceFile(path, text, ts.ScriptTarget.Latest, true, kind(path));

/** The comments before the first statement, as text, or "" when there are none (or no statement). */
export function leadingComment(path, text) {
  const source = parse(path, text);
  const first = source.statements[0];
  if (!first) return "";
  const ranges = ts.getLeadingCommentRanges(text, first.getFullStart()) ?? [];
  return ranges.map((range) => text.slice(range.pos, range.end)).join("\n");
}

/** Whether the file's first statement is the "use client" directive. */
export function hasClientDirective(path, text) {
  const first = parse(path, text).statements[0];
  return Boolean(first && ts.isExpressionStatement(first) && ts.isStringLiteral(first.expression) && first.expression.text === "use client");
}

/**
 * Runtime files under components/ouro/ or lib/ouro/*.tsx that are pure (no hooks, no
 * context, no state), so a Server Component may import their values directly. Every other
 * file there needs "use client". Add a file here only when it can never need a hook.
 */
export const pureFiles = new Set(["registry/ouro/lib/ouro/touch-target.tsx"]);

/** A component's `<stem>-styles.ts`: class strings and value lists, pure like `pureFiles`. */
const stylesFile = /\/components\/ouro\/[^/]+\/[^/]+-styles\.ts$/;

const hookNames = new Set(["use", "createContext"]);
const isHookName = (name) => hookNames.has(name) || /^use[A-Z]/.test(name);

/**
 * Whether a runtime registry file must start with "use client": every component file
 * (under components/) and every lib/ouro .tsx file unless it is in `pureFiles`, and any
 * other module that calls a hook (`useX(...)`, React 19's `use(...)`, a hook imported from
 * react under another name), calls `createContext`, or defines a class component.
 */
export function needsClientDirective(path, text) {
  if ((/\/components\//.test(path) && !stylesFile.test(path)) || /\/lib\/ouro\/[^/]+\.tsx$/.test(path)) return !pureFiles.has(path);
  const source = parse(path, text);
  // Local names bound to react's hooks: `import { useEffect as effect } from "react"`,
  // and namespace or default imports (`React.use(...)`).
  const hookAliases = new Set();
  const reactNamespaces = new Set();
  for (const statement of source.statements) {
    if (!ts.isImportDeclaration(statement) || !ts.isStringLiteral(statement.moduleSpecifier) || statement.moduleSpecifier.text !== "react") continue;
    const clause = statement.importClause;
    if (!clause) continue;
    if (clause.name) reactNamespaces.add(clause.name.text);
    const bindings = clause.namedBindings;
    if (bindings && ts.isNamespaceImport(bindings)) reactNamespaces.add(bindings.name.text);
    if (bindings && ts.isNamedImports(bindings)) {
      for (const element of bindings.elements) {
        if (isHookName((element.propertyName ?? element.name).text)) hookAliases.add(element.name.text);
      }
    }
  }
  let found = false;
  const visit = (node) => {
    if (found) return;
    if (ts.isCallExpression(node)) {
      const callee = node.expression;
      if (ts.isIdentifier(callee) && (isHookName(callee.text) || hookAliases.has(callee.text))) found = true;
      if (ts.isPropertyAccessExpression(callee) && isHookName(callee.name.text)) found = true;
    }
    if (ts.isClassLike(node) && node.heritageClauses?.some((clause) => /\b(Component|PureComponent)\b/.test(clause.getText(source)))) found = true;
    ts.forEachChild(node, visit);
  };
  visit(source);
  return found;
}

/** Every comment in a file, in order, as text. */
export function comments(path, text) {
  const found = [];
  const seen = new Set();
  // Text inside these tokens is not trivia, even when it looks like a comment.
  const literal = new Set([ts.SyntaxKind.JsxText, ts.SyntaxKind.TemplateMiddle, ts.SyntaxKind.TemplateTail]);
  const source = parse(path, text);
  // Walks every node and token (getChildren includes punctuation such as the `}` that
  // follows `{/* a JSX comment */}`), collecting the comment trivia around each.
  const visit = (node) => {
    if (!literal.has(node.kind)) {
      for (const ranges of [ts.getLeadingCommentRanges(text, node.getFullStart()), ts.getTrailingCommentRanges(text, node.getEnd())]) {
        for (const range of ranges ?? []) {
          if (seen.has(range.pos)) continue;
          seen.add(range.pos);
          found.push({ pos: range.pos, text: text.slice(range.pos, range.end) });
        }
      }
    }
    for (const child of node.getChildren(source)) visit(child);
  };
  visit(source);
  return found.sort((a, b) => a.pos - b.pos).map((comment) => comment.text);
}

/** istanbul hints without `@preserve`, as "line: comment". */
export function unpreservedHints(text) {
  const problems = [];
  const lines = text.split("\n");
  lines.forEach((line, index) => {
    for (const match of line.matchAll(/\/\*\s*istanbul\s+ignore\b[^*]*\*\//g)) {
      if (!/^\/\*\s*istanbul\s+ignore\s+(next|if|else|file)\s+@preserve\b/.test(match[0])) {
        problems.push(`${index + 1}: ${match[0]}`);
      }
    }
  });
  return problems;
}

const suiteCalls = new Set(["describe", "it", "test", "suite"]);
const modifiers = new Set(["skip", "only", "todo", "concurrent", "sequential", "fails", "fixme", "serial", "parallel", "describe", "skipIf", "runIf", "each", "for", "extend"]);

/** The root identifier of a test call's callee (`it`, `test.describe.skip`, `it.each([...])`, `chromiumOnly`), or undefined. */
function calleeRoot(expression) {
  let node = expression;
  for (;;) {
    if (ts.isIdentifier(node)) return node.text;
    if (ts.isPropertyAccessExpression(node)) {
      if (!modifiers.has(node.name.text)) return undefined;
      node = node.expression;
    } else if (ts.isCallExpression(node)) node = node.expression;
    else return undefined;
  }
}

/**
 * The full name of every test in a Vitest or Playwright file: its describe titles and
 * its own title, joined with " > ". A title that is not a string literal is kept as its
 * source text. `aliases` names local test functions, such as `const chromiumOnly = it.skipIf(…)`.
 */
export function testNames(path, text) {
  const source = parse(path, text);
  const aliases = new Set();
  const names = [];
  const title = (node) => (ts.isStringLiteralLike(node) ? node.text : node.getText(source));
  const visit = (node, scope) => {
    if (ts.isVariableDeclaration(node) && node.initializer && ts.isIdentifier(node.name)) {
      const root = calleeRoot(node.initializer);
      if (root && (suiteCalls.has(root) || aliases.has(root)) && ts.isCallExpression(node.initializer)) aliases.add(node.name.text);
    }
    if (ts.isCallExpression(node) && node.arguments.length > 0) {
      const root = calleeRoot(node.expression);
      // `it.skipIf(…)`, `it.each(…)` and `test.extend(…)` make a test function; the title comes in the next call.
      const factory = ts.isPropertyAccessExpression(node.expression) && /^(skipIf|runIf|each|for|extend)$/.test(node.expression.name.text);
      if (root && !factory && (suiteCalls.has(root) || aliases.has(root))) {
        const callee = node.expression.getText(source);
        // Playwright's `test.skip(condition, reason)` (and fixme, fail, slow) marks the enclosing tests; only a string title makes a test.
        if (/\.(skip|fixme|fail|slow)$/.test(callee) && !ts.isStringLiteralLike(node.arguments[0]) && !ts.isTemplateExpression(node.arguments[0])) return;
        const isSuite = /(^|\.)(describe|suite)\b/.test(callee);
        const named = [...scope, title(node.arguments[0])];
        if (isSuite) {
          for (const argument of node.arguments.slice(1)) visit(argument, named);
          return;
        }
        // `test.describe.configure(...)`, `test.use(...)` and hooks have no title.
        if (!/\.(configure|use|beforeEach|afterEach|beforeAll|afterAll|step|extend)\b/.test(callee)) names.push(named.join(" > "));
        for (const argument of node.arguments.slice(1)) visit(argument, scope);
        return;
      }
    }
    ts.forEachChild(node, (child) => visit(child, scope));
  };
  visit(source, []);
  return names;
}

/** Full test names that appear more than once across `files` ({ path, text }), with where. */
export function duplicateTestNames(files) {
  const where = new Map();
  for (const { path, text } of files) {
    for (const name of testNames(path, text)) where.set(name, [...(where.get(name) ?? []), path]);
  }
  return [...where].filter(([, paths]) => paths.length > 1).map(([name, paths]) => `${name} (${paths.join(", ")})`);
}

/**
 * Words a log filter reads as trouble. An app's CI that fails on any line holding one fails
 * on a printed file name (the coverage table) or test title (a slow or failed test).
 */
const alarmWords = ["warn", "warning", "warnings", "error", "errors", "fail", "failed", "failure", "failures", "fatal", "deprecated"];

/** The alarm word in a file's own name (`use-dev-warnings.ts` has `warnings`), or null. Words are split on `-`, `_` and `.`. */
export function alarmingFileName(path) {
  const words = path.split("/").at(-1).toLowerCase().split(/[-_.]/);
  return words.find((word) => alarmWords.includes(word)) ?? null;
}

/**
 * The describe or test title in a full test name (`testNames`) that starts with an alarm
 * word, or null. "warn for …" and "Errors" are flagged; a sentence about what the component
 * does ("warns about …", "fails a submit …", "shows the error …") is not.
 */
export function alarmingTestTitle(name) {
  const starts = new RegExp(`^(${alarmWords.join("|")})(?![\\w-])`, "i");
  return name.split(" > ").find((title) => starts.test(title.trim())) ?? null;
}

/** The lines of a test or spec that press Tab directly, as "line: text", instead of with pressTab(). */
export function directTabPresses(text) {
  const press = /(keyboard|press)\(\s*["'`]([^"'`]*[{+])?Tab[}"'`]|userEvent\.tab\(/;
  return text.split("\n").flatMap((line, index) => (press.test(line) && !/^\s*(\*|\/\/)/.test(line) ? [`${index + 1}: ${line.trim()}`] : []));
}

/**
 * A Tailwind class whose side is physical, after its variants and `!`: inset (`left-*`,
 * `right-*`), margin, padding and scroll margin and padding on one side (`ml-*`, `pr-*`,
 * `scroll-ml-*`), one side's border (`border-l`, `border-r-2`), one side's or corner's radius
 * (`rounded-l-*`, `rounded-tr-*`), and alignment, float and clear (`text-left`, `float-right`).
 */
const physicalClass =
  /^-?(?:(?:left|right|ml|mr|pl|pr|scroll-ml|scroll-mr|scroll-pl|scroll-pr)-(?:\d+(?:\.\d+)?|\d+\/\d+|px|full|auto|\[.+\]|\(.+\))|(?:border|rounded)-(?:l|r|tl|tr|bl|br)(?:-.+)?|(?:text|float|clear)-(?:left|right))$/;

/**
 * Utilities with no logical form, which a right-to-left page must reverse with an `rtl:` (or
 * `ltr:`) class of the same kind in the same class list: a horizontal translate, a transform
 * origin, a background position and an object position on a side.
 */
const reversible = {
  "translate-x": /^-?translate-x-.+$/,
  origin: /^origin-(?:left|right|top-left|top-right|bottom-left|bottom-right)$/,
  "background position": /^bg-(?:left|right)(?:-(?:top|bottom))?$/,
  "object position": /^object-(?:left|right)(?:-(?:top|bottom))?$/,
};

/** The kind of `reversible` utility a class is, or undefined. */
const reversibleKind = (utility) => Object.keys(reversible).find((kind) => reversible[kind].test(utility));

/** Whether a class token applies only in one direction (`rtl:`, `ltr:`), so it is a reversal itself. */
const directional = (token) => /(?:^|:)(?:rtl|ltr):/.test(token);

/** A class token's utility, without its variants (split on `:` outside `[...]`) and its `!`. */
function utilityOf(token) {
  let depth = 0;
  let start = 0;
  for (let index = 0; index < token.length; index++) {
    const char = token[index];
    if (char === "[" || char === "(") depth++;
    else if (char === "]" || char === ")") depth--;
    else if (char === ":" && depth === 0) start = index + 1;
  }
  return token.slice(start).replace(/^!|!$/g, "");
}

/**
 * The physical-side classes allowed in a file, by path and then by class, each with why the class
 * must follow the screen rather than the direction of the text: scripts/physical-allowed.json. A
 * pull request that adds one names it in its description (scripts/conformance-exemptions.mjs).
 */
export const physicalAllowed = JSON.parse(readFileSync(new URL("./physical-allowed.json", import.meta.url), "utf8"));

/**
 * The physical-side class tokens in a file's string literals and template text, as "line: token",
 * leaving out the ones `allowed` lists for the file (`physicalAllowed[path]`): each `physicalClass`,
 * and each `reversible` one (a horizontal translate, an origin, a background or object position on
 * a side) its class list does not reverse with an `rtl:` class of the same kind.
 */
export function physicalUtilities(path, text, allowed = physicalAllowed[path] ?? {}) {
  const source = parse(path, text);
  const found = [];
  const visit = (node) => {
    if (ts.isStringLiteralLike(node) || ts.isTemplateHead(node) || ts.isTemplateMiddle(node) || ts.isTemplateTail(node)) {
      const line = source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1;
      const tokens = node.text.split(/\s+/).filter(Boolean);
      // The kinds this class list reverses for right to left.
      const reversed = new Set(tokens.filter(directional).map((token) => reversibleKind(utilityOf(token))).filter(Boolean));
      for (const token of tokens) {
        if (Object.hasOwn(allowed, token)) continue;
        const utility = utilityOf(token);
        const kind = reversibleKind(utility);
        if (physicalClass.test(utility) || (kind && !directional(token) && !reversed.has(kind))) found.push(`${line}: ${token}`);
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return found;
}

/** Labels a component shows for a set time on the real clock: CopyButton's and ShareButton's confirmations. */
const timedLabels = ["Copied", "Link copied", "Copy blocked", "Couldn't share"];

/**
 * What a call does to the page's clock, by its callee: `hold` stops it (Vitest's fake timers, a
 * file's fakeClock helper, Playwright's pauseAt and holdClock), `release` lets it run again
 * (useRealTimers, resume), and `record` keeps the toasts as they show (watchToasts). Playwright's
 * `clock.install()` alone holds nothing: its clock runs on as the real one does.
 */
function clockEffect(callee) {
  if (/^(vi\.useFakeTimers|fakeClock|showOnFakeClock|holdClock)$/.test(callee) || /\.clock\.pauseAt$/.test(callee)) return "hold";
  if (/^vi\.useRealTimers$/.test(callee) || /\.clock\.resume$/.test(callee)) return "release";
  if (callee === "watchToasts") return "record";
  return undefined;
}

/** The tests and specs timerBoundReads reads, as git pathspecs. A pathspec needs a folder where it has a double star and a slash, so site/e2e's own specs are named on their own. */
export const timerBoundFiles = ["registry/**/*.test.ts", "registry/**/*.test.tsx", "registry/ouro/e2e/**/*.spec.ts", "test/**/*.test.tsx", "site/src/**/*.test.tsx", "site/test/*.test.tsx", "site/e2e/*.spec.ts"];

/** The reasons of the `// real clock: <reason>` comments in `text`, in order; one with no reason is no escape. */
export function realClockEscapes(text) {
  return [...text.matchAll(/^[ \t]*\/\/\s*real clock:[ \t]*(\S.*)$/gm)].map((match) => match[1].trim());
}

/** Whether a `// real clock: <reason>` comment leads `node`. */
function leadsEscape(text, node) {
  return (ts.getLeadingCommentRanges(text, node.getFullStart()) ?? []).some((range) => realClockEscapes(text.slice(range.pos, range.end)).length > 0);
}

/**
 * Each `// real clock: <reason>` escape in `text` (the file at `path`), keyed by the file and the
 * first line of the statement it leads, whitespace collapsed: `path: statement`. The ratchet
 * compares these keys, so an escape moved to another statement counts as a new one.
 */
export function realClockEscapeKeys(path, text) {
  const source = parse(path, text);
  const keys = [];
  const visit = (node) => {
    if (ts.isStatement(node) && !ts.isBlock(node) && leadsEscape(text, node)) keys.push(`${path}: ${node.getText(source).split("\n")[0].trim().replace(/\s+/g, " ")}`);
    ts.forEachChild(node, visit);
  };
  visit(source);
  return keys;
}

/**
 * The escapes (`realClockEscapeKeys`, sets of keys) the head adds to the base, in files the pull
 * request's description does not name, as { file, message }: an escape lets a wait on the real
 * clock through, so a reviewer sees each one added or moved, as for claims.config.json's.
 */
export function realClockProblems({ base, head, body = "" }) {
  const added = [...head].filter((key) => !base.has(key));
  const files = [...new Set(added.map((key) => key.slice(0, key.indexOf(": "))))].filter((file) => !body.includes(file));
  return files.map((file) => {
    const statements = added.filter((key) => key.startsWith(`${file}: `)).map((key) => key.slice(file.length + 2));
    return { file, message: `${file} has a "// real clock:" escape the base does not have, on ${statements.map((statement) => `\`${statement}\``).join(", ")}; name the file in the pull request's description, with why the test means the real clock.` };
  });
}

/** Whether a `toast(message, options)` or `show(message, options)` call has a countdown: no `duration` of 0 or Infinity, and no `action` without a duration. */
function countsDown(call) {
  const options = call.arguments[1];
  if (!options) return true;
  if (!ts.isObjectLiteralExpression(options)) return true;
  const property = (name) => options.properties.find((each) => ts.isPropertyAssignment(each) && ts.isIdentifier(each.name) && each.name.text === name);
  const duration = property("duration");
  if (duration) return !/^(0|Infinity)$/.test(duration.initializer.getText());
  return !property("action");
}

/**
 * The reads in a Vitest test or Playwright spec of a state that lasts a set time on the real
 * clock, as "test name: statement". A wait (`expect.poll`, `expect.element`, or in a spec
 * Playwright's `expect`) is one when it reads a confirmation label (`timedLabels`, and the
 * file's own `copiedLabel` and `failedLabel` values), or, in a file with toasts, a page-wide
 * text or dialog (`page.getByText`, `page.getByRole("dialog")`), which may be a toast; in a spec,
 * also `aria-busy="true"`, `data-status="saving"` or a toast's box. A file has toasts when it
 * imports toast() or the Toaster, or is under site/, whose pages mount one. In a test, a toast
 * with a countdown is one too (`toast()`, or a file's `show()` helper, with no `duration: 0`).
 *
 * The read passes when a call before it, and not undone between, holds the clock (`clockEffect`),
 * or records the toasts, for a toast. Comments and strings hold nothing: the calls are read from
 * the syntax tree. A `// real clock: <reason>` comment on the statement, or on one around it,
 * lets it through (`realClockEscapes`).
 */
export function timerBoundReads(path, text) {
  const source = parse(path, text);
  const spec = /\.spec\.ts$/.test(path);
  const labels = new Set([...timedLabels, ...[...text.matchAll(/(?:copiedLabel|failedLabel)=["']([^"']+)["']/g)].map((match) => match[1])]);
  const imports = (pattern) => source.statements.some((statement) => ts.isImportDeclaration(statement) && pattern.test(statement.moduleSpecifier.text));
  const callsToast = imports(/\/lib\/ouro\/toast$/);
  // A spec that opens a Toaster story (`feedback-toast--…`) has toasts too.
  const opensToasts = spec && /["'`]feedback-toast--/.test(text);
  const hasToasts = path.startsWith("site/") || callsToast || opensToasts || imports(/\/components\/ouro\/toast\/toaster$/);
  const calls = (node) => {
    const found = [];
    const visit = (child) => {
      if (ts.isCallExpression(child)) found.push(child);
      ts.forEachChild(child, visit);
    };
    visit(node);
    return found;
  };
  const callee = (call) => call.expression.getText(source).replace(/\s+/g, "");
  // The statement a read is in, and a loop whose one statement that is: an escape leads one of them.
  const loop = (node) => ts.isForStatement(node) || ts.isForOfStatement(node) || ts.isForInStatement(node) || ts.isWhileStatement(node) || ts.isDoStatement(node);
  const escaped = (node) => {
    let at = node;
    while (at && !ts.isStatement(at)) at = at.parent;
    if (!at) return false;
    if (leadsEscape(text, at)) return true;
    const parent = at.parent;
    if (parent && loop(parent) && parent.statement === at) return leadsEscape(text, parent);
    if (parent && ts.isBlock(parent) && parent.statements.length === 1 && parent.parent && loop(parent.parent) && parent.parent.statement === parent) return leadsEscape(text, parent.parent);
    return false;
  };
  const found = [];
  // Within the test being checked: the names its Notifications region is kept under.
  let regions = new Set();
  // A read that may be a toast's: a text or dialog on the whole page, or a dialog or text in the toasts' region.
  const toastRead = (call) => {
    const name = callee(call);
    const dialog = call.arguments[0] && ts.isStringLiteralLike(call.arguments[0]) && /^(alert)?dialog$/.test(call.arguments[0].text);
    if (name === "page.getByText" || (name === "page.getByRole" && dialog)) return true;
    const scoped = /^(\w+)\.(getByText|getByRole)$/.exec(name);
    return Boolean(scoped && regions.has(scoped[1]) && (scoped[2] === "getByText" || dialog));
  };
  const check = (name, body) => {
    regions = new Set();
    const effects = calls(body)
      .map((call) => ({ at: call.getStart(source), effect: clockEffect(callee(call)) }))
      .filter((each) => each.effect)
      .sort((a, b) => a.at - b.at);
    const state = (at) => {
      let held = false;
      let recorded = false;
      for (const each of effects) {
        if (each.at >= at) break;
        if (each.effect === "hold") held = true;
        if (each.effect === "release") held = false;
        if (each.effect === "record") recorded = true;
      }
      return { held, recorded };
    };
    // In a spec, the names a toast locator is kept under: `const toast = page.locator('[data-ouro="toast"]')`.
    const toastNames = new Set();
    // The names the toasts' region is kept under (`page.getByRole("region", { name: "Notifications" })`),
    // and those of a dialog or text read in that region, kept for a later wait.
    const regionNames = regions;
    const readNames = new Set();
    const declare = (node) => {
      if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.initializer) {
        const initializer = node.initializer.getText(source);
        if (/data-ouro="toast"/.test(initializer)) toastNames.add(node.name.text);
        if (/getByRole\(\s*["']region["'][^)]*["']Notifications["']/.test(initializer)) regionNames.add(node.name.text);
        else if (hasToasts && calls(node.initializer).some((call) => toastRead(call) && !/^page\./.test(callee(call)))) readNames.add(node.name.text);
      }
      ts.forEachChild(node, declare);
    };
    if (spec) declare(body);
    const flag = (node, label) => {
      if (!escaped(node)) found.push(`${name}: ${label}`);
    };
    const visit = (node) => {
      if (ts.isExpressionStatement(node) || ts.isVariableStatement(node) || ts.isReturnStatement(node)) {
        const inner = calls(node);
        const names = inner.map(callee);
        const waits = names.some((each) => /^expect\.(poll|element)$/.test(each) || (spec && each === "expect"));
        // A count of what a watch recorded (announcements) is no wait on the state itself.
        const counted = names.some((each) => /\.(count|matching)$/.test(each));
        const strings = [];
        const collect = (child) => {
          if (ts.isStringLiteralLike(child)) strings.push(child.text);
          ts.forEachChild(child, collect);
        };
        collect(node);
        const label = !counted && strings.some((each) => labels.has(each));
        const pageRead = inner.some(toastRead);
        const statement = node.getText(source);
        const busy = spec && names.some((each) => /\.toHaveAttribute$/.test(each)) && (/["']aria-busy["'],\s*["']true["']/.test(statement) || /["']data-status["'],\s*["']saving["']/.test(statement));
        const identifiers = [];
        const named = (child) => {
          if (ts.isIdentifier(child)) identifiers.push(child.text);
          ts.forEachChild(child, named);
        };
        named(node);
        const aboutToast = strings.some((each) => each.includes('data-ouro="toast"')) || identifiers.some((each) => toastNames.has(each));
        const readsKept = identifiers.some((each) => readNames.has(each));
        // A wait for a toast to be gone cannot miss it: gone stays gone.
        const gone = names.some((each) => /\.(toBeHidden|toHaveCount)$/.test(each)) && (/\.toBeHidden\(\s*\)/.test(statement) || /\.toHaveCount\(\s*0\s*\)/.test(statement));
        const toastBox = spec && aboutToast && names.some((each) => /\.(toBeVisible|boundingBox)$/.test(each));
        const { held, recorded } = state(node.getStart(source));
        if (!held && ((waits && label) || busy || (waits && hasToasts && (pageRead || readsKept) && !recorded && !gone) || (toastBox && !recorded))) flag(node, statement.split("\n")[0].trim());
      }
      if (callsToast && !spec && ts.isCallExpression(node) && ts.isIdentifier(node.expression) && /^(toast|show)$/.test(node.expression.text) && node.arguments.length > 0 && countsDown(node)) {
        if (!state(node.getStart(source)).held) flag(node, node.getText(source).split("\n")[0].trim());
      }
      ts.forEachChild(node, visit);
    };
    visit(body);
  };
  const aliases = new Set();
  const title = (node) => (ts.isStringLiteralLike(node) ? node.text : node.getText(source));
  const walk = (node, scope) => {
    if (ts.isVariableDeclaration(node) && node.initializer && ts.isIdentifier(node.name)) {
      const root = calleeRoot(node.initializer);
      if (root && (suiteCalls.has(root) || aliases.has(root)) && ts.isCallExpression(node.initializer)) aliases.add(node.name.text);
    }
    if (ts.isCallExpression(node) && node.arguments.length > 1) {
      const root = calleeRoot(node.expression);
      const factory = ts.isPropertyAccessExpression(node.expression) && /^(skipIf|runIf|each|for|extend)$/.test(node.expression.name.text);
      if (root && !factory && (suiteCalls.has(root) || aliases.has(root))) {
        const callee = node.expression.getText(source);
        const named = [...scope, title(node.arguments[0])];
        if (/(^|\.)(describe|suite)\b/.test(callee)) {
          for (const argument of node.arguments.slice(1)) walk(argument, named);
          return;
        }
        const body = node.arguments.find((argument) => ts.isArrowFunction(argument) || ts.isFunctionExpression(argument));
        if (body && !/\.(configure|use|beforeEach|afterEach|beforeAll|afterAll|step|extend|skip|fixme|fail|slow)$/.test(callee)) check(named.join(" > "), body);
        return;
      }
    }
    ts.forEachChild(node, (child) => walk(child, scope));
  };
  walk(source, []);
  return found;
}
