import { type AgentCase, notAssignable, hint } from "./shared.ts";

const sizes = `AvatarSize | (string & { 'Use "xs", "sm", "md", "lg" or "xl"': never; }) | undefined`;
const initials = '<Avatar name="Ada Lovelace" initials="AL" />';

/** The avatar snippets in avatar.snippets.tsx that make mistakes, in file order. */
export const agentCases: AgentCase[] = [
  {
    id: "avatar01",
    habit: "an img-style alt without a name",
    tsc: [`error TS2741: Property 'name' is missing in type '{ src: string; alt: string; }' but required in type 'AvatarOwnProps'.`],
    dev: '<Avatar name="Ada Lovelace" src={url} />',
    names: ["tsc", "dev"],
  },
  {
    id: "avatar02",
    habit: "shadcn's AvatarFallback as children",
    tsc: [
      `error TS2747: 'Avatar' components don't accept text as child elements. Text in JSX has the type 'string', but the expected type of 'children' is '{ 'Use ${initials}': never; } | undefined'.`,
    ],
    dev: initials,
    names: ["tsc", "dev"],
  },
  { id: "avatar03", habit: "a fallback prop", tsc: [hint("string", `Use ${initials}`)], dev: initials, names: ["tsc", "dev"] },
  { id: "avatar04", habit: "a 2xl size", tsc: [notAssignable('"2xl"', sizes)], dev: '<Avatar size="xl">', names: ["tsc", "dev"] },
];

/** Valid avatar snippets: no type error, no development message, and hover on every prop. */
export const validSnippets: string[] = ["avatarOk01", "avatarOk02"];
