import { claim } from "@/registry/ouro/lib/ouro/claims";

/**
 * Every word "Built for agents too" says (site-design.md §5), around the type errors, source and
 * console messages that site/scripts/agent-messages.mts generates from the real Button. The prose is
 * the site's; the messages are quoted as the tools print them.
 */

/**
 * Every control in the section, by the `data-chapter-control` its wrapper carries, in page order.
 * site/e2e/agents.spec.ts operates each in a test named "control: <id>" and asserts what it changes;
 * site/scripts/stage-census.test.mjs fails when one here has no such test.
 */
export const AGENTS_CONTROLS = ["mistakes", "llms", "manifest", "install"] as const;

export const AGENTS = {
  eyebrow: "Built for agents too",
  title: "Conseil classifies your mistakes",
  intro: "An agent that learned on shadcn/ui writes what it knows. Conseil sorts its slips, as he sorts the fish, and files them where the agent looks: the type check, the source it just put in, and the console.",
  real: claim("Every message here is real output from the code, checked against the code on every CI run.", {
    source: [{ file: "site/scripts/agent-messages.mts" }, { file: "package.json" }],
    verify: [
      { testExists: "site/scripts/agent-messages.test.mjs::every example is a real type error, quoted as tsc prints it, with the prop's declaration from Button's source" },
      { fileLine: "package.json", pattern: "agent-messages\\.mts --check" },
      { ciJob: "ci" },
    ],
  }),
  file: "agent-mistakes.tsx",
  tabs: "The agent's mistakes",
  writes: "The agent writes",
  typeCheck: "The type check",
  source: "The installed source",
  console: "The console, in development",
  reads: "What your agent reads",
  llms: "llms.txt",
  llmsNote: "The library in one file, for agents.",
  manifest: "registry.json",
  manifestNote: "The list of items the shadcn CLI installs.",
  install: "The install line",
} as const;

/** How Conseil files each of the agent's habits: its class, and its species (the prop). */
export const SPECIES: Record<string, { family: string; tab: string }> = {
  variant: { family: "a shadcn habit", tab: "variant=\"destructive\"" },
  isLoading: { family: "a usual name", tab: "isLoading" },
  asChild: { family: "a Radix habit", tab: "asChild" },
};

export const FILED = (family: string, prop: string) => `Class: ${family}. Species: ${prop}. Filed.`;

/** The section's own prose, for the readability check. */
export function allAgentsText(): string[] {
  return [AGENTS.eyebrow, AGENTS.title, AGENTS.intro, AGENTS.writes, AGENTS.typeCheck, AGENTS.source, AGENTS.reads, AGENTS.llmsNote, AGENTS.manifestNote, AGENTS.install, ...Object.values(SPECIES).map((each) => FILED(each.family, "variant"))];
}
