import { type AgentCase, hint } from "./shared.ts";

/** The local-date snippets in local-date.snippets.tsx that make mistakes, in file order. */
export const agentCases: AgentCase[] = [
  { id: "localDate01", habit: "dateTime as on a <time>", tsc: [hint("string", "Use value={date}; dateTime is set from it")], dev: "<LocalDate value={date} />", names: ["tsc", "dev"] },
  {
    id: "localDate02",
    habit: "the formatted date as children",
    tsc: [
      `error TS2747: 'LocalDate' components don't accept text as child elements. Text in JSX has the type 'string', but the expected type of 'children' is '{ 'LocalDate writes the date itself; pass value={date}': never; } | undefined'.`,
    ],
    dev: "<LocalDate value={date} />",
    names: ["tsc", "dev"],
  },
];

/** Valid local-date snippets: no type error, no development message, and hover on every prop. */
export const validSnippets: string[] = ["localDateOk01"];
