import { writeFileSync } from "node:fs";
import { basename, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { resultsTable } from "./table.mts";

//   node scripts/agent-usability/page.mts <runs/<date>> <out.md>
//
// The hook for the docs page "Why Ouro HX needs no skill" (spec §12). It is not written yet,
// because it needs real scores: once the controller has scored all three arms, write the
// page's prose here (what shadcn's skill teaches, https://ui.shadcn.com/docs/skills.md, and
// where Ouro HX puts each thing instead: required props, hint types and dev messages) and
// wire this into the docs. Until then it renders only the results table under the title.

export function whyNoSkillPage(runsDir: string): string {
  return [
    "# Why Ouro HX needs no skill",
    "",
    `Scores from the agent-usability run of ${basename(runsDir)} (scripts/agent-usability/README.md).`,
    "",
    resultsTable(runsDir),
  ].join("\n");
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const [dir, out] = process.argv.slice(2);
  if (!dir || !out) {
    console.error("usage: page.mts <runs/<date>> <out.md>");
    process.exit(1);
  }
  writeFileSync(resolve(out), whyNoSkillPage(resolve(dir)));
}
