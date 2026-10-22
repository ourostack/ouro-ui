// The conformance matrix's exemptions against the base branch (docs/guides/conformance.md), as
// claims.config.json's are: a physical-side class `physicalAllowed` lets through
// (scripts/physical-allowed.json), a control a story says takes focus out of the page
// (`parameters.conformance.focusExit`) and a story it says cannot render on a server
// (`clientOnly`). Each one a pull request adds needs its reason, and its pull request names it in
// the description, so review sees every new exemption and why. CI's Conformance exemptions
// workflow runs it on every pull request, and again when the description is edited:
// `BASE_REF=origin/main PR_BODY="…" node scripts/conformance-exemptions.mjs`.
import { spawnSync } from "node:child_process";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const allowedFile = "scripts/physical-allowed.json";
const storyRoots = ["registry/", "stories/"];

/** One exemption: what identifies it, the words the description must contain, and its reason. */
const entry = (key, mention, reason) => ({ key, mention, reason: typeof reason === "string" ? reason.trim() : "" });

/** The exemptions in physical-allowed.json: one per file and class. */
export function physicalEntries(allowed) {
  return Object.entries(allowed).flatMap(([path, classes]) => Object.entries(classes).map(([token, reason]) => entry(`physicalAllowed ${path} ${token}`, token, reason)));
}

/** `text-field.stories.tsx` to `TextField`, as test/stories.tsx names story files. */
const fileKey = (path) => path.replace(/^.*\/([\w-]+)\.stories\.tsx$/, "$1").replace(/(^|-)([a-z])/g, (_, _dash, letter) => letter.toUpperCase());

/** A property's name, for an identifier or a string key. */
const keyOf = (name) => (ts.isIdentifier(name) || ts.isStringLiteral(name) ? name.text : undefined);

/** The text of a string or no-substitution template literal, else undefined. */
const textOf = (node) => (node && (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) ? node.text : undefined);

/**
 * The exemptions a story file declares in its `parameters.conformance`: each `focusExit` control,
 * by the story (`File/Export`, or `File` for the meta) and the control's key, and each
 * `clientOnly`, by the story.
 */
export function storyEntries(path, text) {
  const source = ts.createSourceFile(path, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const found = [];
  const storyOf = (node) => {
    for (let at = node.parent; at; at = at.parent) if (ts.isVariableDeclaration(at) && ts.isIdentifier(at.name)) return at.name.text === "meta" ? fileKey(path) : `${fileKey(path)}/${at.name.text}`;
    return fileKey(path);
  };
  const visit = (node) => {
    if (ts.isPropertyAssignment(node) && keyOf(node.name) === "conformance" && ts.isObjectLiteralExpression(node.initializer)) {
      const story = storyOf(node);
      for (const property of node.initializer.properties) {
        if (!ts.isPropertyAssignment(property)) continue;
        const name = keyOf(property.name);
        if (name === "clientOnly") found.push(entry(`clientOnly ${story}`, story, textOf(property.initializer)));
        if (name === "focusExit" && ts.isObjectLiteralExpression(property.initializer)) {
          for (const exit of property.initializer.properties) {
            if (ts.isPropertyAssignment(exit)) found.push(entry(`focusExit ${story} ${keyOf(exit.name)}`, keyOf(exit.name), textOf(exit.initializer)));
          }
        }
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return found;
}

/**
 * Where a story file writes its parameters in a shape `storyEntries` cannot read, so an exemption
 * could pass the ratchet unseen: `parameters` and `conformance` must be object literals written in
 * place, with no spread, shorthand, computed key or variable, and each `focusExit` reason and
 * `clientOnly` a plain string. Each problem is `path:line: what`.
 */
export function storyShapeProblems(path, text) {
  const source = ts.createSourceFile(path, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const problems = [];
  const report = (node, what) => problems.push(`${path}:${source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1}: ${what}`);
  const literalKey = (property) => (ts.isPropertyAssignment(property) ? keyOf(property.name) : undefined);
  /** An object literal's properties, each a plain `key: value`; reports the rest. */
  const plain = (node, what) => {
    if (!ts.isObjectLiteralExpression(node)) {
      report(node, `${what} must be an object literal written in place`);
      return [];
    }
    return node.properties.filter((property) => {
      if (literalKey(property) !== undefined) return true;
      report(property, `${what} must list each property as key: value, with no spread, shorthand, computed key or method`);
      return false;
    });
  };
  const visit = (node) => {
    if (ts.isShorthandPropertyAssignment(node) && ["parameters", "conformance"].includes(node.name.text)) report(node, `write ${node.name.text} as an object literal, not a variable`);
    if (ts.isPropertyAssignment(node) && keyOf(node.name) === "parameters") plain(node.initializer, "parameters");
    if (ts.isPropertyAssignment(node) && keyOf(node.name) === "conformance") {
      for (const property of plain(node.initializer, "conformance")) {
        const name = literalKey(property);
        if (name === "clientOnly" && textOf(property.initializer) === undefined) report(property, "clientOnly's reason must be a plain string");
        if (name === "focusExit") {
          for (const exit of plain(property.initializer, "focusExit")) if (textOf(exit.initializer) === undefined) report(exit, "each focusExit reason must be a plain string");
        }
      }
    }
    // Set after the story is declared (`A.parameters = …`, `A.parameters.conformance = …`).
    if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.EqualsToken && ts.isPropertyAccessExpression(node.left) && ["parameters", "conformance"].includes(node.left.name.text)) {
      report(node, `set ${node.left.name.text} in the story's object literal, not by assignment`);
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return problems;
}

/** The exemptions in `head` that `base` does not have. */
export function addedEntries(base, head) {
  const known = new Set(base.map(({ key }) => key));
  return head.filter(({ key }) => !known.has(key));
}

/** What is wrong with each added exemption: no reason, or no mention in the pull request's description. */
export function exemptionProblems(added, body) {
  return added.flatMap(({ key, mention, reason }) => [
    ...(reason === "" ? [`${key}: needs its reason`] : []),
    ...(body.includes(mention) ? [] : [`${key}: name ${JSON.stringify(mention)} in the pull request's description, with why`]),
  ]);
}

const git = (args) => spawnSync("git", args, { cwd: root, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });

/** Every exemption at a git ref. */
function entriesAt(ref) {
  const allowed = git(["show", `${ref}:${allowedFile}`]);
  const physical = allowed.status === 0 ? physicalEntries(JSON.parse(allowed.stdout)) : [];
  const files = git(["grep", "-l", "conformance", ref, "--", ...storyRoots.map((dir) => `${dir}*.stories.tsx`)]).stdout.split("\n").filter(Boolean).map((line) => line.slice(ref.length + 1));
  return [...physical, ...files.flatMap((path) => storyEntries(path, git(["show", `${ref}:${path}`]).stdout))];
}

/** Every exemption in the working tree. */
function entriesHere() {
  return [...physicalEntries(JSON.parse(readFileSync(join(root, allowedFile), "utf8"))), ...storyFiles().flatMap((path) => storyEntries(path, readFileSync(join(root, path), "utf8")))];
}

/** The story files in the working tree. */
function storyFiles() {
  return storyRoots.flatMap((dir) =>
    readdirSync(join(root, dir), { recursive: true })
      .map(String)
      .filter((path) => path.endsWith(".stories.tsx"))
      .map((path) => `${dir}${path.split("\\").join("/")}`),
  );
}

function main() {
  const base = process.env["BASE_REF"] ?? "origin/main";
  const added = addedEntries(entriesAt(base), entriesHere());
  const problems = [...storyFiles().flatMap((path) => storyShapeProblems(path, readFileSync(join(root, path), "utf8"))), ...exemptionProblems(added, process.env["PR_BODY"] ?? "")];
  console.log(`${added.length} conformance exemption(s) new against ${base}${added.length > 0 ? `:\n${added.map(({ key, reason }) => `- ${key}: ${reason}`).join("\n")}` : "."}`);
  if (problems.length > 0) {
    console.error(problems.join("\n"));
    return 1;
  }
  return 0;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) process.exitCode = main();
