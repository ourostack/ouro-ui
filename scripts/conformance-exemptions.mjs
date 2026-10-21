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
  const stories = storyRoots.flatMap((dir) =>
    readdirSync(join(root, dir), { recursive: true })
      .map(String)
      .filter((path) => path.endsWith(".stories.tsx"))
      .map((path) => `${dir}${path.split("\\").join("/")}`),
  );
  return [...physicalEntries(JSON.parse(readFileSync(join(root, allowedFile), "utf8"))), ...stories.flatMap((path) => storyEntries(path, readFileSync(join(root, path), "utf8")))];
}

function main() {
  const base = process.env["BASE_REF"] ?? "origin/main";
  const added = addedEntries(entriesAt(base), entriesHere());
  const problems = exemptionProblems(added, process.env["PR_BODY"] ?? "");
  console.log(`${added.length} conformance exemption(s) new against ${base}${added.length > 0 ? `:\n${added.map(({ key, reason }) => `- ${key}: ${reason}`).join("\n")}` : "."}`);
  if (problems.length > 0) {
    console.error(problems.join("\n"));
    return 1;
  }
  return 0;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) process.exitCode = main();
