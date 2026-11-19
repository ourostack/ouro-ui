import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const REPO = "https://github.com/ourostack/ouro-ui";
const components = "registry/ouro/components/ouro";
const specs = "registry/ouro/e2e/screen-reader";

const read = (file, base = root) => fs.readFileSync(path.join(base, file), "utf8");
const link = (text, file, ref = "blob/main") => `[${text}](${REPO}/${ref}/${file})`;

/** Story export names in a stories file: every `export const X` except the meta. */
export function storyNames(source) {
  return [...source.matchAll(/^export const (\w+)\b/gm)].map((match) => match[1]).filter((name) => name !== "meta");
}

/** The `storyIds` the screen-reader specs share (stories.ts), as `{ key: "storybook-id" }`. */
export function srStoryIds(source) {
  return Object.fromEntries([...source.matchAll(/^\s+(\w+): "([\w-]+)",?$/gm)].map((match) => [match[1], match[2]]));
}

/** What one screen-reader spec file says it checks: its test titles and the story ids it opens. */
export function specFacts(source, ids) {
  const titles = [...source.matchAll(/^\s*test\(\s*"([^"]+)"/gm)].map((match) => match[1]);
  const stories = [...new Set([...source.matchAll(/storyIds\.(\w+)/g)].map((match) => ids[match[1]]).filter(Boolean))];
  return { titles, stories };
}

/** Every component folder with its stories, conformance declarations and screen-reader spec, read from the repository's own files. */
export function evidenceRows(base = root) {
  const ids = srStoryIds(read(`${specs}/stories.ts`, base));
  const specFiles = fs.readdirSync(path.join(base, specs)).filter((file) => file.endsWith(".sr.spec.ts")).sort();
  const claimed = new Set();
  const rows = [];
  for (const folder of fs.readdirSync(path.join(base, components)).sort()) {
    const manifest = path.join(base, components, folder, "component.json");
    if (!fs.existsSync(manifest)) continue;
    const stems = JSON.parse(fs.readFileSync(manifest, "utf8")).components ?? [];
    const files = fs.readdirSync(path.join(base, components, folder)).filter((file) => file.endsWith(".stories.tsx")).sort();
    const sources = files.map((file) => fs.readFileSync(path.join(base, components, folder, file), "utf8"));
    const spec = specFiles.find((file) => [folder, ...stems].includes(file.replace(".sr.spec.ts", "")));
    if (spec) claimed.add(spec);
    rows.push({
      folder,
      stories: sources.reduce((sum, source) => sum + storyNames(source).length, 0),
      conformanceDeclarations: sources.reduce((sum, source) => sum + (source.match(/^\s+conformance:/gm) ?? []).length, 0),
      spec: spec ? { file: `${specs}/${spec}`, ...specFacts(read(`${specs}/${spec}`, base), ids) } : null,
    });
  }
  const others = specFiles.filter((file) => !claimed.has(file)).map((file) => ({ file: `${specs}/${file}`, ...specFacts(read(`${specs}/${file}`, base), ids) }));
  return { rows, others };
}

/** The page, from `evidenceRows()`. */
export function renderEvidencePage({ rows, others }) {
  const withSpec = rows.filter((row) => row.spec);
  const out = [];
  out.push("# Accessibility evidence, per component");
  out.push("");
  out.push("Ouro HX's accessibility claims are checked by the project's own CI. This page lets anyone run the same checks, or open the CI run behind each one, without taking the project's word. It is generated from the repository's files, so a component with no screen-reader spec shows that here rather than being left out.");
  out.push("");
  out.push("**What this is not.** The checks are run by the project that writes the components, and no outside auditor has reviewed them. An independent audit is separate evidence and is not claimed here; the [model interviews](model-interviews.md) record that compliance-minded models asked for exactly that.");
  out.push("");
  out.push("## The four checks");
  out.push("");
  out.push("| Check | What it proves | Where it lives | CI runs | Run it yourself |");
  out.push("| --- | --- | --- | --- | --- |");
  out.push(`| axe on every story | No axe violation in any story, closed and with each overlay open. It runs in Chromium, leaves out Base UI's focus-trap guards (`test/story-axe.ts`), and axe finds only part of what WCAG asks | ${link("test/stories.test.tsx", "test/stories.test.tsx")} | [main's CI runs](${REPO}/actions/workflows/ci.yml?query=branch%3Amain); open a run and read its browser shards | \`pnpm exec vitest run --project ouro-chromium test/stories.test.tsx\` |`);
  out.push(`| Conformance matrix | Focus handoff, announcements, right-to-left, forced colours and hydration hold for every story; an exemption is declared in the story and named in the pull request | ${link("test/conformance/", "test/conformance", "tree/main")}, ${link("guide", "docs/guides/conformance.md")} | [main's CI runs](${REPO}/actions/workflows/ci.yml?query=branch%3Amain); open a run and read its conformance shards | \`pnpm conformance\` |`);
  out.push(`| VoiceOver on macOS | What the screen reader says for a control's name, role and state, driven by Guidepup. Some steps pass through documented fallbacks, and the macOS 15 and strict nightly jobs are advisory | ${link("screen-reader specs", specs, "tree/main")}, ${link("guide", "docs/guides/screen-reader-lane.md")} | [push, nightly and release runs](${REPO}/actions/workflows/screen-reader.yml) | \`pnpm test:sr --project voiceover\` (macOS only) |`);
  out.push(`| NVDA on Windows | The same specs, read by NVDA in Chromium | the same specs | [push, nightly and release runs](${REPO}/actions/workflows/screen-reader.yml) | \`pnpm test:sr --project nvda\` (Windows only) |`);
  out.push("");
  out.push(`Some specs pass a step through a fallback or only log it, and the lane's advisory jobs do not fail the lane; the screen-reader lane's own page lists those and the other known findings recorded against VoiceOver and NVDA, with an issue for each: ${link("known findings", "docs/guides/screen-reader-lane.md#known-findings")}.`);
  out.push("");
  out.push("## Per component");
  out.push("");
  out.push(`Stories are counted as the \`export const\` entries of each component's \`*.stories.tsx\` files. Every one goes through the axe and conformance checks above. A screen-reader spec exists for ${withSpec.length} of ${rows.length} component folders; the rest are covered by axe and the conformance matrix only, and say so below.`);
  out.push("");
  out.push("| Component | Stories | Conformance declarations | Screen-reader spec (VoiceOver and NVDA) |");
  out.push("| --- | --- | --- | --- |");
  for (const row of rows) {
    const spec = row.spec ? `${link(path.basename(row.spec.file), row.spec.file)}: ${row.spec.titles.length} test${row.spec.titles.length === 1 ? "" : "s"} on ${row.spec.stories.map((id) => `\`${id}\``).join(", ") || "its own story"}` : "none yet";
    out.push(`| ${link(row.folder, `${components}/${row.folder}`, "tree/main")} | ${row.stories} | ${row.conformanceDeclarations} | ${spec} |`);
  }
  out.push("");
  if (others.length) {
    out.push("Screen-reader specs that cover a pattern rather than one component:");
    out.push("");
    for (const spec of others) out.push(`- ${link(path.basename(spec.file), spec.file)}: ${spec.titles.join("; ")}`);
    out.push("");
  }
  out.push("## What each screen-reader test says it proves");
  out.push("");
  out.push("The test titles, in the words of the specs, so a reader sees the claim before opening the file.");
  out.push("");
  for (const row of withSpec) {
    out.push(`- **${row.folder}**`);
    for (const title of row.spec.titles) out.push(`  - ${title}`);
  }
  out.push("");
  out.push("## Rerun it");
  out.push("");
  out.push("1. Clone the repository and run `pnpm i`.");
  out.push("2. Run `pnpm exec vitest run --project ouro-chromium test/stories.test.tsx` for axe, and `pnpm conformance` for the matrix.");
  out.push("3. On macOS or Windows, run `pnpm test:sr --project voiceover` or `--project nvda` for the screen-reader lane; the guide lists what the runner needs.");
  out.push("4. To read a CI result without running anything, open a run from the links above and read the job's result and log.");
  out.push("");
  out.push("This page is rendered by `scripts/a11y-evidence/page.mjs`; `pnpm claims:check` renders it again and compares, so it cannot drift from the files it counts.");
  out.push("");
  return out.join("\n");
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const target = process.argv[2];
  if (!target) {
    console.error("Usage: node scripts/a11y-evidence/page.mjs <out.md>");
    process.exitCode = 2;
  } else {
    fs.writeFileSync(target, renderEvidencePage(evidenceRows()));
    console.log(`Wrote ${target}`);
  }
}
