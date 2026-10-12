import { fileURLToPath } from "node:url";
import { isScreen, taskText, type Screen } from "./screens.mts";

//   node scripts/agent-usability/prompt.mts <arm> <screen> <workspace>
// prints the exact prompt a fresh agent gets. Only the first line, the arm's setup line,
// differs between arms.

export const arms = ["shadcn", "shadcn-skill", "ouro"] as const;
export type Arm = (typeof arms)[number];

/** How tables and the docs name each arm. */
export const armNames: Record<Arm, string> = {
  shadcn: "shadcn/ui",
  "shadcn-skill": "shadcn/ui with its skill",
  ouro: "Ouro HX",
};

export function isArm(value: string): value is Arm {
  return (arms as readonly string[]).includes(value);
}

const setup: Record<Arm, string> = {
  shadcn: "Setup: this app uses shadcn/ui. Its components are installed in src/components/ui.",
  "shadcn-skill":
    "Setup: this app uses shadcn/ui. Its components are installed in src/components/ui. Before you start, read and follow the shadcn skill in .claude/skills/shadcn/SKILL.md, including the files it links to and the commands it runs.",
  ouro: "Setup: this app uses Ouro HX. Its components are installed in src/components/ouro.",
};

export function prompt(arm: Arm, screen: Screen, workspace: string): string {
  return `${setup[arm]}

You are a product engineer on a cooking app. Build the screen described below in the app at ${workspace}.

- Work only inside ${workspace}. The screen is the whole app: render it from \`App\` in src/App.tsx, and put any new files under src/.
- Build it with the component library the app already has installed. Its docs index is llms.txt in the app root. Don't add npm packages.
- src/api/ stands in for the backend. Use it as it is and don't change it.
- The app turns on dark mode with the \`dark\` class on the html element. The screen must work in light and dark mode.
- Before you finish, run \`npm run build\` in ${workspace} and fix every error it reports.
- When you are done, reply with a short summary of what you built.

${taskText(screen)}
`;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const [arm, screen, workspace] = process.argv.slice(2);
  if (!arm || !isArm(arm) || !screen || !isScreen(screen) || !workspace) {
    console.error(`usage: prompt.mts <${arms.join("|")}> <screen> <workspace>`);
    process.exit(1);
  }
  process.stdout.write(prompt(arm, screen, workspace));
}
