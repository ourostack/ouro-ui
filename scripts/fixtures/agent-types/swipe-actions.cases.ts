import { type AgentCase, hint, notAssignable } from "./shared.ts";

const actionList = "{ label: string; onClick: () => void; }[]";
const missing = (fix: string) => `error TS2741: Property ''${fix}'' is missing in type '${actionList}' but required in type '{ '${fix}': never; }'.`;
const trailing = 'Use trailing={[{ label: "Delete", onClick: remove }]}';
const leading = 'Use leading={[{ label: "Pin", onClick: pin }]}';
const trailingFix = 'trailing={[{ label: "Delete", tone: "destructive", onClick: remove }]}';

/** The swipe-actions snippets in swipe-actions.snippets.tsx that make mistakes, in file order. */
export const agentCases: AgentCase[] = [
  { id: "swipeActions01", habit: "one actions list with no side", tsc: [missing(trailing)], dev: trailingFix, names: ["tsc", "dev"] },
  { id: "swipeActions02", habit: "a physical side, right", tsc: [missing(trailing)], dev: trailingFix, names: ["tsc", "dev"] },
  { id: "swipeActions03", habit: "React Native's leftActions", tsc: [missing(leading)], dev: 'leading={[{ label: "Pin", onClick: pin }]}', names: ["tsc", "dev"] },
  {
    id: "swipeActions04",
    habit: "an onDelete callback",
    tsc: [hint("() => void", 'Use trailing={[{ label: "Delete", tone: "destructive", onClick: remove }]}')],
    dev: trailingFix,
    names: ["tsc", "dev"],
  },
  {
    id: "swipeActions05",
    habit: "a row with no label",
    tsc: [`error TS2741: Property 'label' is missing in type '{ children: string; trailing: { label: string; onClick: () => void; }[]; }' but required in type 'SwipeActionsProps'.`],
    dev: '<SwipeActions label="Braised short ribs">',
    names: ["tsc", "dev"],
  },
  {
    id: "swipeActions06",
    habit: "a danger tone on an action",
    tsc: [notAssignable('"danger"', `ToneName | (string & { 'danger is "destructive"; accent is "primary"; neutral is "secondary"': never; }) | undefined`)],
    dev: '{ label: "Delete", tone: "destructive", onClick: … }',
    names: ["tsc", "dev"],
  },
  {
    id: "swipeActions07",
    habit: "shadcn's variant on an action",
    tsc: [hint("string", 'Use tone: { label: "Delete", tone: "destructive", onClick: remove }')],
    dev: '{ label: "Delete", tone: "destructive", onClick: … }',
    names: ["tsc", "dev"],
  },
];

/** Valid swipe-actions snippets: no type error, no development message, and hover on every prop. */
export const validSnippets: string[] = ["swipeActionsOk01"];
