import { readFileSync, writeFileSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { runsPerCell } from "./formula.mts";
import { arms } from "./prompt.mts";
import { summary, type ScoreResult } from "./score.mts";
import { screens } from "./screens.mts";
import { resultsTable, runFolders } from "./table.mts";

//   node scripts/agent-usability/page.mts <runs/<date>> <out.md>
//
// The publication renderer, not part of the scoring harness. Supply the complete CI-scored
// cohort; partial runs stay useful to table.mts but cannot become this comparison page.

export function whyNoSkillPage(runsDir: string): string {
  const expected = Array.from({ length: runsPerCell }, (_, index) => String(index + 1)).join(", ");
  const details: string[] = [];
  for (const arm of arms) for (const screen of screens) {
    const folders = runFolders(runsDir, arm, screen);
    if (folders.map((folder) => basename(folder)).join(", ") !== expected) {
      throw new Error(`${arm}/${screen} needs scored runs ${expected} before publication`);
    }
    for (const folder of folders) {
      const result: ScoreResult = JSON.parse(readFileSync(join(folder, "score/score.json"), "utf8"));
      if (result.arm !== arm || result.screen !== screen) throw new Error(`${folder}/score/score.json identifies a different arm or screen`);
      const path = `scripts/agent-usability/runs/${basename(runsDir)}/${arm}/${screen}/${basename(folder)}/score`;
      details.push(summary(result, path).replace(/^## (.*?):/, `### $1, run ${basename(folder)}:`));
    }
  }
  return [
    "# Why Ouro HX needs no skill",
    "",
    "Ouro HX puts component guidance in the source an agent already reads: required props, compiler hints and development messages. No Ouro-specific skill is required; that is a design choice, not a promise that every agent will build every screen correctly.",
    "",
    "## Guidance at the point of use",
    "",
    "| What an agent needs to learn | Where Ouro HX puts it |",
    "| --- | --- |",
    "| A field needs an accessible name; a dialog needs a title. | Required `label`, `legend` and `title` props make omission a type error. Visual hiding keeps the accessible name. |",
    "| Which prop expresses a state. | Hint types name the supported prop when an agent guesses another: `loading`, not `isLoading`; `error`, not `errorMessage`. |",
    "| How to compose and use the component. | Exported types carry JSDoc, examples and guidance about alternatives. Higher-level patterns such as `ConfirmDialog` and `EditSheet` own the interaction. |",
    "| What went wrong at runtime. | Development messages identify the component, explain the misuse and show a concrete fix. Production builds strip those messages. |",
    "| How to style without breaking the shared design. | Named `tone`, `variant` and `size` options use theme tokens; appearance-class warnings distinguish styling from layout. |",
    "",
    "These contracts do not replace application logic. For example, repeated server errors still need the actual accepted answer through `formErrors`; the library does not infer request ownership from a submit counter or a rebuilt error object. See [Forms](forms.md).",
    "",
    "## Skills solve a broader problem",
    "",
    "The [official shadcn/ui skill](https://ui.shadcn.com/docs/skills.md) supplies project context, CLI guidance, composition patterns, theming, registry authoring and MCP discovery. Those are useful capabilities, not redundant work. HX's narrower choice is to keep component-specific contracts beside the installed component, so an agent can encounter them without loading a separate HX skill. Agents may still need project instructions, documentation and tools.",
    "",
    "## The comparison",
    "",
    `This is the ${basename(runsDir)} cohort: five screens, three arms and three fresh agent processes per arm and screen, for 45 builds. The arms are shadcn/ui, shadcn/ui with its official skill, and Ouro HX without a skill. The recorded model, effort, tool versions, installed sources and baseline findings follow the scores.`,
    "",
    "The same frozen checks judge every arm: types, lint, WCAG A/AA scans and behavior. The arm's original configuration is restored before scoring; existing baseline findings cost nothing. A screen that does nothing, does not build or changes the backend stand-in scores zero. Screenshots are evidence, not points. The per-run results below include every behavior and accessibility check, not just the totals.",
    "",
    "The protocol notes are part of the result. The formula grades the resulting apps, not operational safety or adherence to workspace instructions. Shared-host interference, additional tool-reported model usage and tool-version gaps disclosed in those notes limit how these numbers can be interpreted.",
    "",
    `The [committed cohort source and per-run evidence](https://github.com/ourostack/ouro-ui/tree/main/scripts/agent-usability/runs/${basename(runsDir)}) accompany the [runbook](https://github.com/ourostack/ouro-ui/blob/main/scripts/agent-usability/README.md).`,
    "",
    resultsTable(runsDir),
    "",
    "## Limits of this comparison",
    "",
    "The five screens come from Ouro HX's own catalog plan, not an independently sampled benchmark. shadcn/ui ships no swipe row, which matters for the recipe-list task. Three runs per cell and one primary model/effort setting are a small sample, not a claim about every agent or application. Read the individual failures, protocol notes and baseline counts before comparing medians.",
    "",
    "Automated checks cover the named states at phone and desktop sizes, in light and dark themes. They do not establish visual preference, complete accessibility or physical-device VoiceOver behavior. Nothing in these results defines or evaluates Ouro AX, whose product scope remains undecided.",
    "",
    "## Every run and check",
    "",
    ...details,
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
