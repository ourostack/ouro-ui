// The hero's proof line, from the sources each claim is about (site-design.md: "claims that mean
// what they say"), in words a person feels rather than test-suite terms, and with no component count
// (Ari, 2026-10-30):
//   - "From buttons and forms to calendars and chat": the registry:ui items in registry.json, the
//     components an app installs, include each of COVERS;
//   - "Typed, …": every one of their files is .ts or .tsx;
//   - "Tested in Chrome and Safari engines, by mouse and by touch": the browsers ouroTestProjects runs
//     (vitest.ts) and its touch project, a Chromium phone profile;
//   - "Passes accessibility checks in all six looks, …": the presets site/e2e/voyage.spec.ts scans in
//     light and dark, each expected to pass the audit kit's strict audit (site/e2e/audit.ts);
//   - "Every line of code runs in a test": the coverage thresholds vitest.config.ts holds over
//     registry/, all 100;
//   - "The porthole's controls are Ouro HX too": the stage's source imports its controls from registry/.
// Each links to its evidence (EVIDENCE): the component inventory, CI's runs on main (the browser
// matrix), the line of voyage.spec.ts that runs axe over every preset, the line of vitest.config.ts
// that holds the thresholds, and the stage's own source. A line link is computed from the source it
// points into, so it lands on the line that makes the claim. The module also says which component the install command
// adds: the first of PREFERRED_INSTALL in the latest release's registry.json (`install`).
//
// The site imports it as `virtual:site-proof` (proofPlugin, in site/vite.config.ts and the `site`
// Vitest project), so the line is computed at build time and is never stale.
// `node site/scripts/proof.mts` prints it.
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const repo = join(dirname(fileURLToPath(import.meta.url)), "../..");
const reader = (root: string) => (path: string) => readFileSync(join(root, path), "utf8");

/** One claim on the proof line, and where a reader checks it. */
export interface Claim {
  text: string;
  href: string;
}

export interface Proof {
  components: number;
  typescript: boolean;
  engines: string[];
  touch: boolean;
  coverage: number;
  themes: number;
  stage: boolean;
  claims: Claim[];
  line: string;
}

const REPO = "https://github.com/ourostack/ouro-ui";
/** Each claim's evidence: the docs, the source, the CI workflow, the theme matrix, the thresholds. */
export const EVIDENCE = {
  components: "/docs/",
  typescript: `${REPO}/tree/main/registry/ouro/components/ouro`,
  engines: `${REPO}/actions/workflows/ci.yml?query=branch%3Amain`,
  themes: `${REPO}/blob/main/site/e2e/voyage.spec.ts`,
  coverage: `${REPO}/blob/main/vitest.config.ts`,
  stage: `${REPO}/tree/main/site/src/voyage/stage`,
};

/** The 1-based line where a pattern first matches, for a link that lands on it. */
export function lineOf(source: string, pattern: RegExp): number {
  const index = source.search(pattern);
  if (index < 0) throw new Error(`No line matches ${pattern}`);
  return source.slice(0, index).split("\n").length;
}

/** Each engine by the browser people know it from. */
const ENGINE_NAMES: Record<string, string> = { chromium: "Chrome", webkit: "Safari", firefox: "Firefox" };

/** The parts the first claim names, by registry item: buttons, forms, calendars and chat. */
export const COVERS = ["button", "form", "calendar", "message"] as const;

const WORDS = ["no", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten"];
const inWords = (n: number) => WORDS[n] ?? String(n);

export function deriveProof(files: { registry: string; testProjects: string; vitestConfig: string; themes: string; voyageSpec: string; stage: string }): Proof {
  const ui = (JSON.parse(files.registry) as { items: Array<{ name?: string; type: string; files?: Array<{ path: string }> }> }).items.filter((item) => item.type === "registry:ui");
  const components = ui.length;
  const typescript = ui.every((item) => (item.files ?? []).length > 0 && item.files!.every((file) => /\.tsx?$/.test(file.path)));
  const browsers = /browsers = (\[[^\]]*\])/.exec(files.testProjects)?.[1];
  if (!browsers) throw new Error("vitest.ts no longer names its default browsers");
  const engines = [...new Set(JSON.parse(browsers) as string[])];
  if (/ouroTestProjects\(\{[^}]*browsers:/.test(files.vitestConfig)) throw new Error("vitest.config.ts overrides the browsers; read them there");
  const touch = /name: "ouro-touch"/.test(files.testProjects) && /isMobile: true/.test(files.testProjects);
  // Every registry source, and any other file it names (the census kit's in-page collector).
  const include = /coverage: \{[\s\S]*?include: \["registry\/\*\*\/\*\.\{ts,tsx\}"(?:, "[^"]+")*\]/.test(files.vitestConfig);
  const thresholds = /thresholds: \{ lines: (\d+), branches: (\d+), functions: (\d+), statements: (\d+) \}/.exec(files.vitestConfig);
  if (!include || !thresholds) throw new Error("vitest.config.ts no longer holds coverage thresholds over registry/");
  const coverage = Math.min(...thresholds.slice(1).map(Number));
  const presets = (JSON.parse(files.themes) as unknown[]).length;
  const scanned = /for \(const preset of PRESET_NAMES\)[\s\S]*?for \(const mode of \["light", "dark"\]/.test(files.voyageSpec) && /expect\(await auditPage\(page, browserName\)\)\.toBe\(""\)/.test(files.voyageSpec);
  const themes = scanned ? presets : 0;
  const stage = /from "@\/registry\/ouro\/components\/ouro\//.test(files.stage);
  const themesLine = lineOf(files.voyageSpec, /test\.describe\("every preset, light and dark"/);
  const coverageLine = lineOf(files.vitestConfig, /thresholds: \{ lines:/);
  const names = ui.map((item) => item.name);
  const covers = COVERS.every((name) => names.includes(name));
  const shown = engines.map((engine) => ENGINE_NAMES[engine] ?? engine);
  const browserList = shown.length > 1 ? `${shown.slice(0, -1).join(", ")} and ${shown.at(-1)} engines` : `${shown[0]} engine`;
  const tested = `Tested in ${browserList}${touch ? ", by mouse and by touch" : ""}`;
  const claims: Claim[] = [
    { text: covers ? "From buttons and forms to calendars and chat" : "React components for whole apps", href: EVIDENCE.components },
    ...(typescript ? [{ text: "Typed, so editors and agents see every prop", href: EVIDENCE.typescript }] : []),
    { text: tested, href: EVIDENCE.engines },
    ...(themes ? [{ text: `Passes accessibility checks in all ${inWords(themes)} looks, light and dark`, href: `${EVIDENCE.themes}#L${themesLine}` }] : []),
    { text: coverage === 100 ? "Every line of code runs in a test" : `${coverage}% of lines run in a test`, href: `${EVIDENCE.coverage}#L${coverageLine}` },
    ...(stage ? [{ text: "The porthole's controls are Ouro HX too", href: EVIDENCE.stage }] : []),
  ];
  return { components, typescript, engines, touch, coverage, themes, stage, claims, line: claims.map((claim) => claim.text).join(" · ") };
}

export function currentProof(root = repo): Proof {
  const read = reader(root);
  return deriveProof({
    registry: read("registry.json"),
    testProjects: read("registry/ouro/lib/ouro/testing/vitest.ts"),
    vitestConfig: read("vitest.config.ts"),
    themes: read("site/src/themes/themes.json"),
    voyageSpec: read("site/e2e/voyage.spec.ts"),
    stage: read("site/src/voyage/stage/stage.tsx"),
  });
}

/** The components the hero would most like to advertise, first choice first. */
export const PREFERRED_INSTALL = ["checklist", "switch"] as const;

export interface Install {
  item: string;
  release: string;
  /** The components that release has. */
  count: number;
}

/** The first preferred component the release has: Checklist once a release includes it. */
export function pickInstall(release: string, registry: string): Install {
  const names = (JSON.parse(registry) as { items: Array<{ name: string; type: string }> }).items.filter((item) => item.type === "registry:ui").map((item) => item.name);
  const item = PREFERRED_INSTALL.find((name) => names.includes(name));
  if (!item) throw new Error(`${release} has none of ${PREFERRED_INSTALL.join(", ")}`);
  return { item, release, count: names.length };
}

/**
 * registry.json as it was at a tag, fetching the tag first when this clone (a shallow CI checkout)
 * lacks it. On the release commit for that tag (release.yml), whose registry.json records the
 * tag's version (scripts/registry.mts --release), it is this checkout's own: CI on that commit runs
 * before the tag exists, and has to pass for the tag to be pushed.
 */
export function registryAt(tag: string, root = repo): string {
  const own = reader(root)("registry.json");
  if (tag === `v${(JSON.parse(own) as { version?: string }).version}`) return own;
  const show = () => execFileSync("git", ["show", `${tag}:registry.json`], { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
  try {
    return show();
  } catch {
    execFileSync("git", ["fetch", "--quiet", "--depth=1", "origin", `refs/tags/${tag}:refs/tags/${tag}`], { cwd: root, stdio: "ignore" });
    return show();
  }
}

export function currentInstall(root = repo): Install {
  const release = (JSON.parse(reader(root)("package.json")) as { ouro: { latestRelease: string } }).ouro.latestRelease;
  return pickInstall(release, registryAt(release, root));
}

const id = "virtual:site-proof";

/** Serves `virtual:site-proof`, the proof computed from the repository (`root`) when the site builds. */
export function proofPlugin(root = repo): { name: string; resolveId: (source: string) => string | undefined; load: (source: string) => string | undefined } {
  return {
    name: "site-proof",
    resolveId: (source) => (source === id ? `\0${id}` : undefined),
    load: (source) => (source === `\0${id}` ? `export default ${JSON.stringify(currentProof(root))};\nexport const install = ${JSON.stringify(currentInstall(root))};` : undefined),
  };
}

if (import.meta.url === `file://${process.argv[1]}`) console.log(currentProof().line);
