import { type AgentCase } from "./shared.ts";

/** The build-chip snippets in build-chip.snippets.tsx that make mistakes, in file order. */
export const agentCases: AgentCase[] = [
  {
    id: "buildChip01",
    habit: "a Select-style options array for the choices",
    tsc: [`error TS2741: Property ''Use <BuildChip builds={[...]} current="id">'' is missing in type 'string[]' but required in type '{ 'Use <BuildChip builds={[...]} current="id">': never; }'.`],
    names: ["tsc"],
  },
  { id: "buildChip02", habit: "the skew as a plain status string", tsc: [`error TS2322: Type 'string' is not assignable to type 'BuildChipSkew'.`], names: ["tsc"] },
];

/** Valid build-chip snippets: no type error, no development message, and hover on every prop. */
export const validSnippets: string[] = ["buildChipOk01"];
