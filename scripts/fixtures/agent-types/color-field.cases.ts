import { type AgentCase, hint } from "./shared.ts";

/** The color-field snippets in color-field.snippets.tsx that make mistakes, in file order. */
export const agentCases: AgentCase[] = [
  {
    id: "colorField01",
    habit: "a color prop for the value",
    tsc: [hint("string", 'Use <ColorField defaultValue="#ff0000">')],
    dev: '<ColorField defaultValue="#ff0000">',
    names: ["tsc", "dev"],
  },
  {
    id: "colorField02",
    habit: "react-colorful's format",
    tsc: [hint("string", 'ColorField takes and gives #rrggbb: <ColorField defaultValue="#3366ff">')],
    dev: '<ColorField defaultValue="#3366ff">',
    names: ["tsc", "dev"],
  },
];

/** Valid color-field snippets: no type error, no development message, and hover on every prop. */
export const validSnippets: string[] = ["colorFieldOk"];
