import { type AgentCase, hint } from "./shared.ts";

/** The resizable snippets in resizable.snippets.tsx that make mistakes, in file order. */
export const agentCases: AgentCase[] = [
  {
    id: "resizable01",
    habit: "shadcn's direction",
    tsc: [hint("string", 'Use orientation="horizontal" or orientation="vertical"')],
    dev: '<ResizablePanelGroup orientation="horizontal">',
    names: ["tsc", "dev"],
  },
  {
    id: "resizable02",
    habit: "a panel with no label",
    tsc: [`error TS2741: Property 'label' is missing in type '{ children: string; defaultSize: number; }' but required in type 'ResizablePanelProps'.`],
    dev: '<ResizablePanel label="Files">',
    names: ["tsc", "dev"],
  },
  { id: "resizable03", habit: "shadcn's withHandle", tsc: [hint("boolean", "The handle always shows its grip; remove withHandle")], dev: "<ResizableHandle />", names: ["tsc", "dev"] },
];

/** Valid resizable snippets: no type error, no development message, and hover on every prop. */
export const validSnippets: string[] = ["resizableOk01", "resizableOk02"];
