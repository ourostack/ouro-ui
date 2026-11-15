import type { AgentCase } from "./shared.ts";

/** The thread-rail snippets in thread-rail.snippets.tsx that make mistakes, in file order. */
export const agentCases: AgentCase[] = [
  {
    id: "threadRail01",
    habit: "open for a thread that is showing",
    tsc: ['error TS2322: Type \'boolean\' is not assignable to type \'{ "ThreadRail is open while it is rendered: render it only when a thread is open": never; }\'.'],
    dev: '{thread && <ThreadRail label="Thread" onClose={close}>}',
    names: ["tsc", "dev"],
  },
  {
    id: "threadRail02",
    habit: "onOpenChange from a dialog",
    tsc: ['error TS2322: Type \'() => void\' is not assignable to type \'{ "Use onClose": never; }\'.'],
    dev: "<ThreadRail onClose={() => setOpen(false)}>",
    names: ["tsc", "dev"],
  },
  {
    id: "threadRail03",
    habit: "a rail with no label",
    tsc: [
      "error TS2741: Property 'label' is missing in type '{ title: string; onClose: () => void; }' but required in type 'ThreadRailProps'.",
    ],
    dev: '<ThreadRail label="Thread" onClose={close}>',
    names: ["dev"],
  },
];

/** Valid thread-rail snippets: no type error, no development message, and hover on every prop. */
export const validSnippets: string[] = ["threadRailOk01", "threadRailOk02"];
