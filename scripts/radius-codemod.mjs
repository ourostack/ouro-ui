// Moves Ouro UI's own code from shadcn's radius steps to Ouro's (`rounded-lg` to `rounded-ouro-lg`,
// `var(--radius-lg)` to `var(--radius-ouro-lg)`). shadcn init writes --radius-sm..--radius-4xl into an
// app's theme, and an add never replaces a variable the app already has, so ouro-base's steps never
// reach such an app; its --radius-ouro-* steps are new names, which every add appends.
//
//   node scripts/radius-codemod.mjs
//
// Idempotent: a second run changes nothing. ouro-base.css and ouro-theme.css define the steps and are
// left alone. scripts/source-rules.mjs (radiusSteps) fails on a shadcn step that comes back.
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const STEPS = "sm|md|lg|xl|2xl|3xl|4xl";
const SIDES = "ss|se|es|ee|tl|tr|bl|br|t|r|b|l|s|e";
const CLASS = new RegExp(`(?<![\\w-])rounded((?:-(?:${SIDES}))?)-(${STEPS})(?![\\w-])`, "g");
const VARIABLE = new RegExp(`var\\(--radius-(${STEPS})\\)`, "g");
const THEME_DEFINITIONS = new Set(["registry/ouro/theme/ouro-base.css", "registry/ouro/theme/ouro-theme.css"]);

/** The text with each radius step renamed, and a count per class or variable it renamed. */
export function renameRadius(text) {
  const counts = new Map();
  const count = (key) => counts.set(key, (counts.get(key) ?? 0) + 1);
  const renamed = text
    .replace(CLASS, (_, side, step) => {
      count(`rounded${side}-${step}`);
      return `rounded${side}-ouro-${step}`;
    })
    .replace(VARIABLE, (_, step) => {
      count(`var(--radius-${step})`);
      return `var(--radius-ouro-${step})`;
    });
  return { text: renamed, counts };
}

/** The tracked registry files this rewrites: components, lib, tests, stories and the plain stylesheet. */
export function radiusFiles() {
  return execFileSync("git", ["ls-files", "registry/ouro"], { cwd: root, encoding: "utf8" })
    .split("\n")
    .filter((file) => /\.(tsx?|css)$/.test(file) && !THEME_DEFINITIONS.has(file));
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const total = new Map();
  const changed = [];
  for (const file of radiusFiles()) {
    const path = join(root, file);
    const text = readFileSync(path, "utf8");
    const { text: renamed, counts } = renameRadius(text);
    if (renamed === text) continue;
    writeFileSync(path, renamed);
    changed.push(file);
    for (const [key, n] of counts) total.set(key, (total.get(key) ?? 0) + n);
  }
  for (const file of changed) console.log(`changed ${file}`);
  for (const [key, n] of [...total].sort(([a], [b]) => a.localeCompare(b))) console.log(`${String(n).padStart(5)}  ${key}`);
  console.log(`radius codemod: ${changed.length} files, ${[...total.values()].reduce((sum, n) => sum + n, 0)} renames`);
}
