import { type AgentCase, notAssignable } from "./shared.ts";

const corners = `'SnapPiPCorner | (string & { 'Use "top-left", "top-right", "bottom-left" or "bottom-right"': never; }) | undefined'`;

/** The snap-pip snippets in snap-pip.snippets.tsx that make mistakes, in file order. */
export const agentCases: AgentCase[] = [
  {
    id: "snapPip01",
    habit: "a position to put it at",
    tsc: [`error TS2353: Object literal may only specify known properties, and 'x' does not exist in type '{ 'It rests in a corner: <SnapPiP corner="bottom-right">': never; }'.`],
    dev: '<SnapPiP corner="bottom-right">',
    names: ["tsc", "dev"],
  },
  { id: "snapPip02", habit: "an offset from the edges", tsc: [notAssignable("number", '{ "Use <SnapPiP inset={16}>": never; }')], dev: "<SnapPiP inset={16}>", names: ["tsc", "dev"] },
  {
    id: "snapPip03",
    habit: "a list of things to avoid",
    tsc: [
      `error TS2741: Property '"Use <SnapPiP keepOut={[toolbarRef]}>"' is missing in type '{ current: null; }[]' but required in type '{ "Use <SnapPiP keepOut={[toolbarRef]}>": never; }'.`,
    ],
    dev: "<SnapPiP keepOut={[toolbarRef]}>",
    names: ["tsc", "dev"],
  },
  {
    id: "snapPip04",
    habit: "a side for a corner",
    tsc: [`error TS2322: Type '"top"' is not assignable to type ${corners}.`],
    dev: '<SnapPiP corner="bottom-right">',
    names: ["tsc", "dev"],
  },
  {
    id: "snapPip05",
    habit: "a picture with no label",
    tsc: [`error TS2741: Property 'label' is missing in type '{ corner: "top-left"; onCornerChange: () => void; }' but required in type 'SnapPiPProps'.`],
    dev: '<SnapPiP label="Your camera">',
    names: ["tsc", "dev"],
  },
  { id: "snapPip06", habit: "a controlled corner with no onCornerChange", tsc: [], dev: "<SnapPiP corner={corner} onCornerChange={setCorner}>", names: ["dev"] },
];

/** Valid snap-pip snippets: no type error, no development message, and hover on every prop. */
export const validSnippets: string[] = ["snapPipValid"];
