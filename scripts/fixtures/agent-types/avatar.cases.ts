import { type AgentCase, notAssignable, hint } from "./shared.ts";

const sizes = `AvatarSize | (string & { 'Use "xs", "sm", "md", "lg", "xl", "2xl" or "3xl"': never; }) | undefined`;
const presences = `AvatarPresence | (string & { 'dnd is "do-not-disturb"; ooo is "out-of-office"': never; }) | undefined`;
const shapes = `AvatarShape | (string & { 'Use "circle", "square" or "agent"; rounded is "square", hexagon is "agent", a group chat is members': never; }) | undefined`;
const members = '<Avatar name="Crew" members={[{ name: "Ana Lind", src: ana }]} />';
const initials = '<Avatar name="Ana Lind" initials="AL" />';

/** The avatar snippets in avatar.snippets.tsx that make mistakes, in file order. */
export const agentCases: AgentCase[] = [
  {
    id: "avatar01",
    habit: "an img-style alt without a name",
    tsc: [
      `error TS2322: Type '{ src: string; alt: string; }' is not assignable to type 'IntrinsicAttributes & AvatarProps'.\n  Property 'name' is missing in type '{ src: string; alt: string; }' but required in type 'AvatarOwnProps'.`,
    ],
    dev: '<Avatar name="Ana Lind" src={url} />',
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
  { id: "avatar08", habit: "a hexagon shape", tsc: [notAssignable('"hexagon"', shapes)], dev: '<Avatar shape="agent">', names: ["tsc", "dev"] },
  {
    id: "avatar09",
    habit: "participants for a group chat's people",
    tsc: [
      `error TS2741: Property ''Use members={[{ name, src }]}'' is missing in type '{ name: string; }[]' but required in type '{ 'Use members={[{ name, src }]}': never; }'.`,
    ],
    dev: members,
    names: ["tsc", "dev"],
  },
  {
    id: "avatar10",
    habit: "a group shape for a group chat",
    tsc: [notAssignable('"group"', shapes)],
    dev: '<Avatar name="The whole crew" members={[{ name: "Ana Lind", src: ana }, { name: "Ben Ito" }]} />',
    names: ["tsc", "dev"],
  },
  { id: "avatar11", habit: "a channel's square on a group chat", tsc: [], dev: '<Avatar name="The whole crew" members={members} />', names: ["dev"] },
];

/** Valid avatar snippets: no type error, no development message, and hover on every prop. */
export const validSnippets: string[] = ["avatarOk01", "avatarOk02", "avatarOk03", "avatarOk04", "avatarOk05"];
