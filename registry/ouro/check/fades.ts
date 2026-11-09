export { FADE_FIX, findFades, main, SCANNED, SKIPPED, scan };
export type { Fade };

import { realpathSync } from "node:fs";
import { readdir, readFile, stat } from "node:fs/promises";
import { extname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { EXIT } from "./check.ts";

// The fade check: a picture never fades into the page. It reads an app's source and finds every gradient used as a mask,
// the usual way a picture is made to dissolve at an edge, in stylesheets, Tailwind classes and style objects alike:
//
//   node lib/ouro/check/fades.ts <folder | file>…
//
// A gradient mask that fades text or controls rather than a picture (a row that scrolls sideways, a folded paragraph)
// stays when the line it is on, or the line before, says why: `fade-ok: <reason>`. A marker without a reason does not
// count. Exits as check.ts does (EXIT): 0 none found, 2 usage, 3 findings; 1 when a file cannot be read.

interface Fade {
  file: string;
  line: number;
  declaration: string;
}

// The files read, by extension, and the folders never entered: dependencies, build output and hidden folders.
const SCANNED = [".css", ".scss", ".ts", ".tsx", ".js", ".jsx", ".mjs", ".astro", ".html", ".svelte", ".vue"];
const SKIPPED = ["node_modules", "dist", "build", "storybook-static", "coverage"];
const FADE_FIX =
  "end the picture on a hard edge, or put it on a solid band; if this mask fades text or controls rather than a picture, mark it `fade-ok: <why>`";

// Where a mask is declared, and how its value is read. `css` is a declaration (`mask-image: …`, up to its `;`); `js` a
// style object's key (`maskImage: …`, up to the next comma at its own level); `bracket` a Tailwind arbitrary property
// or value (`[mask-image:…]`, `mask-[…]`, up to its `]`); `utility` one of Tailwind's own gradient mask utilities,
// which are a gradient by name.
const DECLARATIONS: { pattern: RegExp; read: "css" | "js" | "bracket" | "utility" }[] = [
  { pattern: /(?<![\w$[-])(?:-webkit-)?mask(?:-image)?\s*:(?!:)/g, read: "css" },
  { pattern: /(?<![\w$])(?:[Ww]ebkit)?[Mm]ask(?:Image)?\s*:(?!:)/g, read: "js" },
  { pattern: /["'](?:-webkit-)?mask(?:-image)?["']\s*[:,]/g, read: "js" },
  { pattern: /\[(?:-webkit-)?mask(?:-image)?:/g, read: "bracket" },
  { pattern: /(?<![\w$[/.-])mask-\[/g, read: "bracket" },
  { pattern: /(?<![\w$[/.-])-?mask-(?:linear|radial|conic|[tblrxy]-(?:from|to))(?![\w])[^\s"'`]*/g, read: "utility" },
];
const OPENERS: Record<string, string> = { "(": ")", "[": "]", "{": "}" };
const QUOTES = new Set(['"', "'", "`"]);

// The value from `start`: up to what ends it at its own level (`stops`), or a line break once some of it has been read.
// Brackets nest and quotes hold their contents whole, except that in a declaration (`css`) a quote at its own level
// ends the value, as the end of a style attribute or of the string the declaration is in does.
function readValue(text: string, start: number, read: "css" | "js" | "bracket"): string {
  const stops = read === "css" ? ";{}" : read === "js" ? ",;})]" : "]";
  const closing: string[] = [];
  let i = start;
  for (; i < text.length; i++) {
    const c = text[i]!;
    if (closing.length === 0) {
      if (stops.includes(c) || (read === "css" && QUOTES.has(c))) break;
      if (c === "\n" && text.slice(start, i).trim() !== "") break;
    }
    const close = OPENERS[c];
    if (QUOTES.has(c)) {
      const end = text.indexOf(c, i + 1);
      i = end < 0 ? text.length : end;
    } else if (close) closing.push(close);
    else if (c === closing.at(-1)) closing.pop();
  }
  return text.slice(start, i);
}

// Whether a line opts its fade out with a reason: `fade-ok:` and words after it, other than a comment's closing marks.
const optsOut = (line: string | undefined) => {
  const marker = /fade-ok:(.*)$/.exec(line ?? "");
  return marker !== null && /\p{L}/u.test(marker[1]!.replace(/\*\/|-->|\}+/g, ""));
};

// Every gradient mask in `text`, by line, that neither its line nor the line before opts out.
function findFades(text: string, file: string): Fade[] {
  const lines = text.split("\n");
  const found = new Map<number, Fade>();
  for (const { pattern, read } of DECLARATIONS) {
    for (const match of text.matchAll(pattern)) {
      const at = match.index;
      const end = at + match[0].length;
      const value = read === "utility" ? "" : readValue(text, end, read);
      if (read !== "utility" && !/gradient\(/i.test(value)) continue;
      const line = text.slice(0, at).split("\n").length;
      if (found.has(line) || optsOut(lines[line - 1]) || optsOut(lines[line - 2])) continue;
      const declaration = `${match[0]}${value}${read === "bracket" ? "]" : ""}`.replace(/\s+/g, " ").trim();
      found.set(line, { file, line, declaration: declaration.length > 160 ? `${declaration.slice(0, 159)}…` : declaration });
    }
  }
  return [...found.values()].sort((a, b) => a.line - b.line);
}

// The files under each path (or the path itself, when it is a file), sorted, read and checked.
async function scan(paths: string[], cwd: string): Promise<Fade[]> {
  const files: string[] = [];
  const walk = async (dir: string) => {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) {
        if (!entry.name.startsWith(".") && !SKIPPED.includes(entry.name)) await walk(path);
      } else if (SCANNED.includes(extname(entry.name))) files.push(path);
    }
  };
  for (const path of paths) {
    const full = resolve(cwd, path);
    if ((await stat(full)).isDirectory()) await walk(full);
    else files.push(full);
  }
  const fades: Fade[] = [];
  for (const file of [...new Set(files)].sort()) fades.push(...findFades(await readFile(file, "utf8"), relative(cwd, file)));
  return fades;
}

const USAGE = `Usage: node lib/ouro/check/fades.ts <folder | file>…

Finds every gradient used as a mask in the source under each folder (its stylesheets, Tailwind classes and style
objects; not node_modules, build output or hidden folders), so that no picture fades into the page. Where a mask fades
text or controls rather than a picture, say why on its line or the line before: fade-ok: <reason>.

Exit codes: 0 none found, 1 error (a file could not be read), 2 usage, 3 findings to fix.`;

interface Env {
  cwd: string;
  env: Record<string, string | undefined>;
  log: (line: string) => void;
  error: (line: string) => void;
}

// The command: returns the exit code.
async function main(argv: string[], { cwd, env, log, error }: Env): Promise<number> {
  if (argv.includes("--help") || argv.includes("-h")) {
    log(USAGE);
    return EXIT.ok;
  }
  const option = argv.find((arg) => arg.startsWith("-"));
  if (option !== undefined || !argv.length) {
    error(`${option === undefined ? "Name a folder or a file to check." : `Unknown option ${option}.`}\n\n${USAGE}`);
    return EXIT.usage;
  }
  for (const path of argv) {
    if (!(await stat(resolve(cwd, path)).then(() => true, () => false))) {
      error(`${path} is not a folder or a file.\n\n${USAGE}`);
      return EXIT.usage;
    }
  }
  let fades: Fade[];
  try {
    fades = await scan(argv, cwd);
  } catch (problem) {
    error(`The fade check stopped before it finished: ${(problem as Error).message}`);
    return EXIT.error;
  }
  for (const fade of fades) {
    log(`${fade.file}:${fade.line}: ${fade.declaration}\n  Fix: ${FADE_FIX}.`);
    if (env.GITHUB_ACTIONS === "true") log(`::error file=${fade.file},line=${fade.line},title=Picture fade::${fade.declaration}: ${FADE_FIX}.`);
  }
  log(fades.length ? `\n${fades.length} gradient mask${fades.length === 1 ? "" : "s"} to fix.` : "No gradient masks without a fade-ok reason.");
  return fades.length ? EXIT.findings : EXIT.ok;
}

/* node:coverage disable */
if (process.argv[1] && realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url))) {
  process.exitCode = await main(process.argv.slice(2), { cwd: process.cwd(), env: process.env, log: console.log, error: console.error });
}
/* node:coverage enable */
