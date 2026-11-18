import type { AgentCase } from "./shared.ts";

/** The composed-surface snippets in composed-surface.snippets.tsx that make mistakes, in file order. */
export const agentCases: AgentCase[] = [
  {
    id: "composedSurface01",
    habit: "an onAction handler",
    // tsc double-quotes this hint's key, because it has braces in it, so shared.ts's `hint` (single quotes) can't build it.
    tsc: [`error TS2322: Type '() => void' is not assignable to type '{ "Use onPress={run} onHandoff={openApp}": never; }'.`],
    dev: "<ComposedSurface onPress={run} onHandoff={openApp} />",
    names: ["tsc", "dev"],
  },
  {
    id: "composedSurface02",
    habit: "A2UI's name for the data model",
    tsc: [`error TS2353: Object literal may only specify known properties, and 'servings' does not exist in type '{ "Use data={structuredContent.ouro.data}": never; }'.`],
    dev: "<ComposedSurface data={structuredContent.ouro.data} />",
    names: ["tsc", "dev"],
  },
];

/** Valid composed-surface snippets: no type error, no development message, and hover on every prop. */
export const validSnippets: string[] = ["composedSurfaceOk01", "composedSurfaceOk02"];
