import { type AgentCase, notAssignable } from "./shared.ts";

/** The error for text children where `children` is a hint type. */
const childText = (component: string, fix: string) =>
  `error TS2747: '${component}' components don't accept text as child elements. Text in JSX has the type 'string', but the expected type of 'children' is '{ '${fix}': never; } | undefined'.`;

const fix = '<Breadcrumb items={[{ label: "Home", href: "/" }, { label: "Ribs" }]} />';

/** The breadcrumb snippets in breadcrumb.snippets.tsx that make mistakes, in file order. */
export const agentCases: AgentCase[] = [
  {
    id: "breadcrumb01",
    habit: "a custom separator",
    tsc: [notAssignable("string", `{ "Remove separator; Breadcrumb draws its own": never; }`)],
    dev: fix,
    names: ["tsc", "dev"],
  },
  { id: "breadcrumb02", habit: "a links prop on Breadcrumb", tsc: [
      `error TS2741: Property ''Use ${fix}'' is missing in type '({ label: string; href: string; } | { label: string; href?: never; })[]' but required in type '{ 'Use ${fix}': never; }'.`,
    ], dev: fix, names: ["tsc", "dev"] },
  { id: "breadcrumb03", habit: "shadcn's breadcrumb parts as children", tsc: [childText("Breadcrumb", `Use ${fix}`)], dev: fix, names: ["tsc", "dev"] },
];

/** Valid breadcrumb snippets: no type error, no development message, and hover on every prop. */
export const validSnippets: string[] = ["breadcrumbOk01"];
