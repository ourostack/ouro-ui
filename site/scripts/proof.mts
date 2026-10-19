// The hero's proof line, from the sources each claim is about (site-design.md: "claims that mean
// what they say"):
//   - "<n> components": the registry:ui items in registry.json, the components an app installs;
//   - "<n> browser engines + touch profile": the browsers ouroTestProjects runs (vitest.ts) and its
//     touch project, a Chromium phone profile rather than an engine;
//   - "registry <n>% covered": the coverage thresholds vitest.config.ts holds over registry/;
//   - "axe-clean in <n> themes": the presets site/e2e/voyage.spec.ts scans in light and dark.
//
// The site imports it as `virtual:site-proof` (proofPlugin, in site/vite.config.ts and the `site`
// Vitest project), so the line is computed at build time and is never stale.
// `node site/scripts/proof.mts` prints it.
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const repo = join(dirname(fileURLToPath(import.meta.url)), "../..");
const read = (path: string) => readFileSync(join(repo, path), "utf8");

export interface Proof {
  components: number;
  engines: string[];
  touch: boolean;
  coverage: number;
  themes: number;
  line: string;
}

export function deriveProof(files: { registry: string; testProjects: string; vitestConfig: string; themes: string; voyageSpec: string }): Proof {
  const components = (JSON.parse(files.registry) as { items: Array<{ type: string }> }).items.filter((item) => item.type === "registry:ui").length;
  const browsers = /browsers = (\[[^\]]*\])/.exec(files.testProjects)?.[1];
  if (!browsers) throw new Error("vitest.ts no longer names its default browsers");
  const engines = [...new Set(JSON.parse(browsers) as string[])];
  if (/ouroTestProjects\(\{[^}]*browsers:/.test(files.vitestConfig)) throw new Error("vitest.config.ts overrides the browsers; read them there");
  const touch = /name: "ouro-touch"/.test(files.testProjects) && /isMobile: true/.test(files.testProjects);
  const include = /coverage: \{[\s\S]*?include: \["registry\/\*\*\/\*\.\{ts,tsx\}"\]/.test(files.vitestConfig);
  const thresholds = /thresholds: \{ lines: (\d+), branches: (\d+), functions: (\d+), statements: (\d+) \}/.exec(files.vitestConfig);
  if (!include || !thresholds) throw new Error("vitest.config.ts no longer holds coverage thresholds over registry/");
  const coverage = Math.min(...thresholds.slice(1).map(Number));
  const presets = (JSON.parse(files.themes) as unknown[]).length;
  const scanned = /for \(const preset of PRESET_NAMES\)[\s\S]*?for \(const mode of \["light", "dark"\]/.test(files.voyageSpec) && /axe\.run/.test(files.voyageSpec);
  const themes = scanned ? presets : 0;
  const claims = [
    `${components} components`,
    `${engines.length} browser ${engines.length === 1 ? "engine" : "engines"}${touch ? " + touch profile" : ""}`,
    `registry ${coverage}% covered`,
    ...(themes ? [`axe-clean in ${themes} themes`] : []),
  ];
  return { components, engines, touch, coverage, themes, line: claims.join(" · ") };
}

export function currentProof(): Proof {
  return deriveProof({
    registry: read("registry.json"),
    testProjects: read("registry/ouro/lib/ouro/testing/vitest.ts"),
    vitestConfig: read("vitest.config.ts"),
    themes: read("site/src/themes/themes.json"),
    voyageSpec: read("site/e2e/voyage.spec.ts"),
  });
}

const id = "virtual:site-proof";

/** Serves `virtual:site-proof`, the proof computed from the repository when the site builds. */
export function proofPlugin(): { name: string; resolveId: (source: string) => string | undefined; load: (source: string) => string | undefined } {
  return {
    name: "site-proof",
    resolveId: (source) => (source === id ? `\0${id}` : undefined),
    load: (source) => (source === `\0${id}` ? `export default ${JSON.stringify(currentProof())};` : undefined),
  };
}

if (import.meta.url === `file://${process.argv[1]}`) console.log(currentProof().line);
