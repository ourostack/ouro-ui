import { type AgentCase, notAssignable, hint } from "./shared.ts";

const sizes = `AvatarSize | (string & { 'Use "xs", "sm", "md", "lg", "xl", "2xl" or "3xl"': never; }) | undefined`;
const presences = `AvatarPresence | (string & { 'dnd is "do-not-disturb"; ooo is "out-of-office"': never; }) | undefined`;
const shapes = `AvatarShape | (string & { 'Use "circle" or "square"; rounded is "square"': never; }) | undefined`;
const initials = '<Avatar name="Ada Lovelace" initials="AL" />';

/** The avatar snippets in avatar.snippets.tsx that make mistakes, in file order. */
export const agentCases: AgentCase[] = [
  {
    id: "avatar01",
    habit: "an img-style alt without a name",
    tsc: [
      `error TS2322: Type '{ src: string; alt: string; }' is not assignable to type 'IntrinsicAttributes & AvatarProps'.\n  Property 'name' is missing in type '{ src: string; alt: string; }' but required in type 'AvatarOwnProps'.`,
    ],
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
  { id: "avatar04", habit: "a 4xl size", tsc: [notAssignable('"4xl"', sizes)], dev: '<Avatar size="3xl">', names: ["tsc", "dev"] },
  {
    id: "avatar05",
    habit: "a presence with no words for it",
    tsc: [
      `error TS2322: Type '{ name: string; presence: "busy"; }' is not assignable to type 'IntrinsicAttributes & AvatarProps'.\n  Property 'presenceLabel' is missing in type '{ name: string; presence: "busy"; }' but required in type 'AvatarPresenceProps'.`,
    ],
    dev: '<Avatar presence="busy" presenceLabel="Busy">',
    names: ["tsc", "dev"],
  },
  {
    id: "avatar06",
    habit: "dnd for do not disturb",
    tsc: [notAssignable('"dnd"', presences)],
    dev: '<Avatar presence="do-not-disturb" presenceLabel="Do not disturb">',
    names: ["tsc", "dev"],
  },
  { id: "avatar07", habit: "a rounded shape", tsc: [notAssignable('"rounded"', shapes)], dev: '<Avatar shape="square">', names: ["tsc", "dev"] },
];

/** Valid avatar snippets: no type error, no development message, and hover on every prop. */
export const validSnippets: string[] = ["avatarOk01", "avatarOk02", "avatarOk03"];
