import type { AgentCase } from "./shared.ts";

/** The a2ui-surface snippets in a2ui-surface.snippets.tsx that make mistakes, in file order. */
export const agentCases: AgentCase[] = [
  {
    id: "a2uiSurface01",
    habit: "an onPress handler",
    // tsc double-quotes this hint's key, because it has braces in it, so shared.ts's `hint` (single quotes) can't build it.
    tsc: [`error TS2322: Type '() => void' is not assignable to type '{ "Use onAction={send} onHandoff={openApp}": never; }'.`],
    dev: "<A2UISurface onAction={send} onHandoff={openApp} />",
    names: ["tsc", "dev"],
  },
];

/** Valid a2ui-surface snippets: no type error, no development message, and hover on every prop. */
export const validSnippets: string[] = ["a2uiSurfaceOk01"];
