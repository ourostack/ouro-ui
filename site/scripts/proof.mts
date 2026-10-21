// The hero's proof line, from the sources each claim is about (site-design.md: "claims that mean
// what they say"):
//   - "<n> React components": the registry:ui items in registry.json, the components an app installs;
//   - "TypeScript": every one of their files is .ts or .tsx;
//   - "Chromium + WebKit + touch tested": the browsers ouroTestProjects runs (vitest.ts) and its
//     touch project, a Chromium phone profile;
//   - "axe-clean in <n> themes": the presets site/e2e/voyage.spec.ts scans in light and dark;
//   - "every line covered": the coverage thresholds vitest.config.ts holds over registry/, all 100;
//   - "This stage is built with HX": the porthole stage's source imports its controls from registry/.
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
const read = (path: string) => readFileSync(join(repo, path), "utf8");

/** One claim on the proof line, and where a reader checks it. */
export interface Claim {
  text: string;
  href: string;
  /** Where the link goes, said before you follow it (on hover and focus, and to screen readers). */
  where: string;
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
const SITE = "/ouro-ui";
/** Each claim's evidence: the docs, the source, the CI workflow, the theme matrix, the thresholds. */
export const EVIDENCE = {
  components: `${SITE}/docs/`,
  typescript: `${REPO}/tree/main/registry/ouro/components/ouro`,
  engines: `${REPO}/actions/workflows/ci.yml?query=branch%3Amain`,
  themes: `${REPO}/blob/main/site/e2e/voyage.spec.ts`,
  coverage: `${REPO}/blob/main/vitest.config.ts`,
  stage: `${REPO}/tree/main/site/src/voyage/stage`,
};

/** What a reader finds at each claim's evidence, so they know before they follow the link. */
export const WHERE: Record<keyof typeof EVIDENCE, string> = {
  components: "Opens the component docs",
  typescript: "Opens the source on GitHub",
  engines: "Opens our test runs on GitHub",
  themes: "Opens the test that checks the themes",
  coverage: "Opens the coverage settings on GitHub",
  stage: "Opens this stage's source on GitHub",
};

/** The 1-based line where a pattern first matches, for a link that lands on it. */
export function lineOf(source: string, pattern: RegExp): number {
  const index = source.search(pattern);
  if (index < 0) throw new Error(`No line matches ${pattern}`);
  return source.slice(0, index).split("\n").length;
}

const ENGINE_NAMES: Record<string, string> = { chromium: "Chromium", webkit: "WebKit", firefox: "Firefox" };

export function deriveProof(files: { registry: string; testProjects: string; vitestConfig: string; themes: string; voyageSpec: string; stage: string }): Proof {
  const ui = (JSON.parse(files.registry) as { items: Array<{ type: string; files?: Array<{ path: string }> }> }).items.filter((item) => item.type === "registry:ui");
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
  const scanned = /for \(const preset of PRESET_NAMES\)[\s\S]*?for \(const mode of \["light", "dark"\]/.test(files.voyageSpec) && /axe\.run/.test(files.voyageSpec);
  const themes = scanned ? presets : 0;
  const stage = /from "@\/registry\/ouro\/components\/ouro\//.test(files.stage);
  const themesLine = lineOf(files.voyageSpec, /test\.describe\("every preset, light and dark"/);
  const coverageLine = lineOf(files.vitestConfig, /thresholds: \{ lines:/);
  const tested = [...engines.map((engine) => ENGINE_NAMES[engine] ?? engine), ...(touch ? ["touch"] : [])].join(" + ");
  const claims: Claim[] = [
    { text: `${components} React components`, href: EVIDENCE.components, where: WHERE.components },
    ...(typescript ? [{ text: "TypeScript", href: EVIDENCE.typescript, where: WHERE.typescript }] : []),
    { text: `${tested} tested`, href: EVIDENCE.engines, where: WHERE.engines },
    ...(themes ? [{ text: `axe-clean in ${themes} themes`, href: `${EVIDENCE.themes}#L${themesLine}`, where: WHERE.themes }] : []),
    { text: coverage === 100 ? "every line covered" : `${coverage}% of lines covered`, href: `${EVIDENCE.coverage}#L${coverageLine}`, where: WHERE.coverage },
    ...(stage ? [{ text: "This stage is built with HX", href: EVIDENCE.stage, where: WHERE.stage }] : []),
  ];
  return { components, typescript, engines, touch, coverage, themes, stage, claims, line: claims.map((claim) => claim.text).join(" · ") };
}

export function currentProof(): Proof {
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

/** registry.json as it was at a tag, fetching the tag first when this clone (a shallow CI checkout) lacks it. */
export function registryAt(tag: string): string {
  const show = () => execFileSync("git", ["show", `${tag}:registry.json`], { cwd: repo, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
  try {
    return show();
  } catch {
    execFileSync("git", ["fetch", "--quiet", "--depth=1", "origin", `refs/tags/${tag}:refs/tags/${tag}`], { cwd: repo, stdio: "ignore" });
    return show();
  }
}

export function currentInstall(): Install {
  const release = (JSON.parse(read("package.json")) as { ouro: { latestRelease: string } }).ouro.latestRelease;
  return pickInstall(release, registryAt(release));
}

const id = "virtual:site-proof";

/** Serves `virtual:site-proof`, the proof computed from the repository when the site builds. */
export function proofPlugin(): { name: string; resolveId: (source: string) => string | undefined; load: (source: string) => string | undefined } {
  return {
    name: "site-proof",
    resolveId: (source) => (source === id ? `\0${id}` : undefined),
    load: (source) => (source === `\0${id}` ? `export default ${JSON.stringify(currentProof())};\nexport const install = ${JSON.stringify(currentInstall())};` : undefined),
  };
}

if (import.meta.url === `file://${process.argv[1]}`) console.log(currentProof().line);
