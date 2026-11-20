import { type AgentCase, hint, notAssignable } from "./shared.ts";

const variants = `"plain" | "outline" | (string & { 'From shadcn? default is "plain"; use "plain" or "outline"': never; }) | undefined`;

/** The toggle snippets in toggle.snippets.tsx that make mistakes, in file order. */
export const agentCases: AgentCase[] = [
  { id: "toggle01", habit: "a checkbox's checked on a toggle", tsc: [hint("boolean", "Use <Toggle pressed>")], dev: "<Toggle pressed>", names: ["tsc", "dev"] },
  {
    id: "toggle02",
    habit: "Radix Switch's onCheckedChange",
    tsc: [hint("() => void", "Use <Toggle onPressedChange={(pressed) => ...}>")],
    dev: "<Toggle onPressedChange={(pressed) => …}>",
    names: ["tsc", "dev"],
  },
  { id: "toggle03", habit: "shadcn's default variant", tsc: [notAssignable('"default"', variants)], dev: "<Toggle>", names: ["tsc", "dev"] },
  { id: "toggle04", habit: "React Aria's isPressed", tsc: [hint("boolean", "Use <Toggle pressed>")], dev: "<Toggle pressed>", names: ["tsc", "dev"] },
];

/** Valid toggle snippets: no type error, no development message, and hover on every prop. */
export const validSnippets: string[] = ["toggleOk"];
