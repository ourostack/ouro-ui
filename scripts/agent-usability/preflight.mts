import { cpSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { isArm } from "./prompt.mts";
import { score, summary } from "./score.mts";
import { armRecordPath, createWorkspace, readArmRecord } from "./workspace.mts";

//   node scripts/agent-usability/preflight.mts <arm-app> <empty-folder>
//
// Proves, in a real arm app and before any agent runs, that a correct screen built with the
// arm's own menu scores 100. It copies the arm to <empty-folder> as a workspace, adds the
// known-good recipe list (test/screens/recipe-list.tsx) with its actions menu swapped for the
// library's (shadcn/ui's DropdownMenu in the shadcn arms; Base UI's Menu in the Ouro HX arm,
// which ships no menu component yet), and scores it against the arm's record. Both menus
// render in a portal on the body. It exits 1 unless the score is 100.

const here = dirname(fileURLToPath(import.meta.url));

/** The known-good recipe list with its hand-written menu swapped for `./ActionsMenu`. */
export function withLibraryMenu(source: string): string {
  const swapped = source
    .replace(/function ActionsMenu[\s\S]*?\n}\n\nfunction Row/, "function Row")
    .replace('import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";', 'import { useEffect, useRef, useState, type PointerEvent } from "react";\nimport { ActionsMenu } from "./ActionsMenu";');
  if (swapped === source || swapped.includes("function ActionsMenu")) throw new Error("the recipe list's menu was not swapped; test/screens/recipe-list.tsx changed shape");
  return swapped;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const [armApp, workspace] = process.argv.slice(2).map((path) => resolve(path));
  if (!armApp || !workspace) {
    console.error("usage: preflight.mts <arm-app> <empty-folder>");
    process.exit(1);
  }
  const { arm } = readArmRecord(armRecordPath(armApp));
  if (!isArm(arm)) throw new Error(`${armApp} is not an arm app`);
  createWorkspace(armApp, "recipe-list", workspace);
  const screen = withLibraryMenu(readFileSync(join(here, "test/screens/recipe-list.tsx"), "utf8"));
  writeFileSync(join(workspace, "src/App.tsx"), `import "./fixture.css";\n${screen}`);
  cpSync(join(here, "test/fixture-app/src/index.css"), join(workspace, "src/fixture.css"));
  cpSync(join(here, "test/screens", arm === "ouro" ? "actions-menu.base-ui.tsx" : "actions-menu.shadcn.tsx"), join(workspace, "src/ActionsMenu.tsx"));
  const result = await score({ arm, screen: "recipe-list", dir: workspace, record: armRecordPath(armApp), log: (line) => console.error(`[preflight] ${line}`) });
  process.stdout.write(summary(result));
  if (result.points.score !== 100) {
    console.error(`A known-good screen scored ${result.points.score} in the ${arm} arm, not 100. Fix the scorer or the arm before any agent runs.`);
    process.exit(1);
  }
}
