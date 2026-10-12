import { type AgentCase, hint } from "./shared.ts";

/** The segmented-control snippets in segmented-control.snippets.tsx that make mistakes, in file order. */
export const agentCases: AgentCase[] = [
  {
    id: "segmentedControl01",
    habit: "options, as on a select",
    tsc: [
      "error TS2741: Property ''Use <SegmentedControl items={[{ value, label }]}>'' is missing in type '{ value: string; label: string; }[]' but required in type '{ 'Use <SegmentedControl items={[{ value, label }]}>': never; }'.",
    ],
    dev: "<SegmentedControl items={[{ value, label }]}>",
    names: ["tsc", "dev"],
  },
  {
    id: "segmentedControl02",
    habit: "an onChange handler",
    tsc: [hint("() => void", "Use <SegmentedControl onValueChange={(value) => ...}>")],
    dev: "<SegmentedControl onValueChange={(value) => …}>",
    names: ["tsc", "dev"],
  },
];

/** Valid segmented-control snippets: no type error, no development message, and hover on every prop. */
export const validSnippets: string[] = ["segmentedControlOk01"];
