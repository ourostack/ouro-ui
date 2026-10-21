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
//
// scripts/source-rules.test.mjs applies them to the repository; scripts/install-check.mjs
// compares the comments of each installed file with its source.
import { readFileSync } from "node:fs";
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
