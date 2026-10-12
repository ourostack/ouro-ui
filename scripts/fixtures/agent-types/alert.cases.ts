import { type AgentCase, notAssignable, hint } from "./shared.ts";

const alertTones = `"primary" | "secondary" | "destructive" | "success" | "warning" | (string & { 'danger and error are "destructive"; info is "primary"; neutral is "secondary"': never; }) | undefined`;

/** The alert snippets in alert.snippets.tsx that make mistakes, in file order. */
export const agentCases: AgentCase[] = [
  { id: "alert01", habit: "shadcn's destructive variant on Alert", tsc: [hint("string", 'Use <Alert tone="destructive">')], dev: '<Alert tone="destructive">', names: ["tsc", "dev"] },
  { id: "alert02", habit: "MUI's severity", tsc: [hint("string", 'Use <Alert tone="destructive">')], dev: '<Alert tone="destructive">', names: ["tsc", "dev"] },
  { id: "alert03", habit: "Chakra's status", tsc: [hint("string", 'Use <Alert tone="primary">')], dev: '<Alert tone="primary">', names: ["tsc", "dev"] },
  {
    id: "alert04",
    habit: "MUI's onClose",
    tsc: [hint("() => void", "Use <Alert onDismiss={() => setOpen(false)}>")],
    dev: "<Alert onDismiss={() => setOpen(false)}>",
    names: ["tsc", "dev"],
  },
  {
    id: "alert05",
    habit: "shadcn's AlertTitle and AlertDescription as children",
    tsc: [
      `error TS2747: 'Alert' components don't accept text as child elements. Text in JSX has the type 'string', but the expected type of 'children' is '{ 'Use <Alert title="..." description="...">': never; } | undefined'.`,
    ],
    dev: '<Alert title="…" description="…">',
    names: ["tsc", "dev"],
  },
  { id: "alert06", habit: "an info tone", tsc: [notAssignable('"info"', alertTones)], dev: '<Alert tone="primary">', names: ["tsc", "dev"] },
];

/** Valid alert snippets: no type error, no development message, and hover on every prop. */
export const validSnippets: string[] = ["alertOk01"];
