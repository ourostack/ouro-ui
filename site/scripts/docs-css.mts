// A component's docs page inlines, in its head, the classes its own demo adds to the docs' shared
// shell (shell.css): the Tailwind build of the page's import closure, less the candidates the shell
// already builds and every declaration the shell's build already holds in the same block (theme
// variables, base rules, property defaults). site/scripts/prerender.mts writes each page's delta into
// its <head>; the built pages keep to what their demo renders, and the shell is linked once and cached.
//
// The build is Tailwind's own compiler and scanner, the ones @tailwindcss/vite uses. They are not a
// dependency of the repository, so they load from @tailwindcss/vite's own dependencies and the
// manifest stays as it is.
//
//   import { docsDelta } from "./docs-css.mts"   the minified delta for a demo file, or "" when the shell suffices
import { readFileSync, realpathSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { dropColorMixFallbacks } from "./color-mix-fallbacks.mts";
import { reachable, unreached } from "./page-css.mts";

const repo = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const site = join(repo, "site/src");
const styles = join(site, "styles.css");
const entry = join(site, "entry-client.tsx");
const docsPage = join(site, "pages/docs.tsx");

interface Source {
  base: string;
  pattern: string;
  negated: boolean;
}
interface Compiled {
  sources: Source[];
  build(candidates: string[]): string;
}
interface Tailwind {
  compile(css: string, options: { base: string; from: string; onDependency(path: string): void }): Promise<Compiled>;
  optimize(css: string, options: { minify: boolean }): { code: Buffer | string };
}
interface Oxide {
  Scanner: new (options: { sources: Source[] }) => { scan(): string[] };
}

const fromVite = createRequire(realpathSync(join(repo, "node_modules/@tailwindcss/vite/package.json")));
const fromTailwind = createRequire(fromVite.resolve("@tailwindcss/node"));
const tailwind = fromTailwind("@tailwindcss/node") as Tailwind;
const { Scanner } = fromTailwind("@tailwindcss/oxide") as Oxide;

/** styles.css compiled with `@source not` for each excluded path, as shell.css and each page's build compile it. */
async function compileWith(excluded: string[]): Promise<Compiled> {
  const extra = excluded.map((path) => `@source not "${relative(site, path).replaceAll("\\", "/")}";`).join("\n");
  return tailwind.compile(`${readFileSync(styles, "utf8")}\n${extra}\n`, { base: site, from: styles, onDependency() {} });
}

/** Blocks whose lines are descriptors, not declarations of a rule: their text is not deduplicated. */
const DESCRIPTORS = /^@(property|font-face|page)\b/;

/**
 * Each declaration of an unminified Tailwind build, keyed by the blocks it is in: their headers joined, so the same text in
 * another context (a nested @media, an @supports) is another key. A statement at the top level (@layer order) is keyed "".
 */
export function declarationsByRule(css: string): Map<string, Set<string>> {
  const rules = new Map<string, Set<string>>();
  const headers: string[] = [];
  for (const line of css.split("\n")) {
    const text = line.trim();
    if (text.endsWith("{")) headers.push(text.slice(0, -1).trim());
    else if (text === "}") headers.pop();
    else if (text.endsWith(";") && !DESCRIPTORS.test(headers.at(-1) ?? "")) {
      const key = headers.join("\n");
      rules.set(key, (rules.get(key) ?? new Set()).add(text));
    }
  }
  return rules;
}

/** `css` without the declarations and statements the shell's build already has in the same block (theme variables, base rules, property defaults). */
export function dropDeclarations(css: string, known: Map<string, Set<string>>): string {
  const headers: string[] = [];
  const kept: string[] = [];
  for (const line of css.split("\n")) {
    const text = line.trim();
    if (text.endsWith("{")) headers.push(text.slice(0, -1).trim());
    else if (text === "}") headers.pop();
    else if (text.endsWith(";") && !DESCRIPTORS.test(headers.at(-1) ?? "") && known.get(headers.join("\n"))?.has(text)) continue;
    kept.push(line);
  }
  return kept.join("\n");
}

let shell: Promise<{ candidates: Set<string>; declarations: Map<string, Set<string>> }> | undefined;

/** What shell.css builds: its candidates, and the declarations of its whole build, which a page's delta leaves out. */
function shellBuild(): Promise<{ candidates: Set<string>; declarations: Map<string, Set<string>> }> {
  return (shell ??= (async () => {
    const excluded = unreached(reachable([entry, docsPage], docsPage));
    const candidates = new Scanner({ sources: (await compileWith(excluded)).sources }).scan();
    const built = (await compileWith(excluded)).build(candidates);
    return { candidates: new Set(candidates), declarations: declarationsByRule(built) };
  })());
}

/**
 * The minified CSS a page with this demo adds to the shell, or "" when the shell alone renders it. A
 * page without a demo renders what the shell renders, since its closure is the shell's.
 */
export async function docsDelta(demo: string | undefined): Promise<string> {
  if (!demo) return "";
  const { candidates, declarations } = await shellBuild();
  const excluded = unreached(reachable([entry, docsPage, demo], docsPage));
  const compiled = await compileWith(excluded);
  // Scanning does not build; the compile is used once, because a compile accumulates the candidates it builds.
  const added = new Scanner({ sources: compiled.sources }).scan().filter((candidate) => !candidates.has(candidate));
  if (added.length === 0) return "";
  // Tailwind's licence banner is the shell's too.
  const css = dropDeclarations(compiled.build(added).replace(/\/\*![\s\S]*?\*\//g, ""), declarations);
  const minified = dropColorMixFallbacks(tailwind.optimize(css, { minify: true }).code.toString()).trim();
  if (minified.includes("</style")) throw new Error(`The inline CSS for ${relative(repo, demo)} would end its <style> element.`);
  return minified;
}
