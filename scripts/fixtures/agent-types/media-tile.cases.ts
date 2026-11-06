import { type AgentCase, notAssignable } from "./shared.ts";

/** The media-tile snippets in media-tile.snippets.tsx that make mistakes, in file order. */
export const agentCases: AgentCase[] = [
  {
    id: "mediaTile01",
    habit: "the speaking level as level",
    tsc: [notAssignable("number", `{ "Use <MediaTile speaking={level > 0.1}>": never; }`)],
    dev: "<MediaTile speaking={level > 0.1}>",
    names: ["tsc", "dev"],
  },
  {
    id: "mediaTile02",
    habit: "a tile with no name",
    tsc: [`error TS2741: Property 'name' is missing in type '{ speaking: true; }' but required in type 'MediaTileOwnProps'.`],
    names: ["tsc"],
  },
  {
    id: "mediaTile03",
    habit: "speaking as a level",
    tsc: [notAssignable("number", "boolean | undefined")],
    dev: "<MediaTile speaking={level > 0.1}>",
    names: ["dev"],
  },
  { id: "mediaTile04", habit: "muted as isMuted", tsc: [notAssignable("boolean", `{ "Use <MediaTile muted>": never; }`)], dev: "<MediaTile muted>", names: ["tsc", "dev"] },
  {
    id: "mediaTile05",
    habit: "the name as label",
    tsc: [notAssignable("string", `{ 'Use <MediaTile name="Mara Lind">': never; }`)],
    dev: '<MediaTile name="Mara Lind">',
    names: ["tsc", "dev"],
  },
  {
    id: "mediaTile06",
    habit: "fit as objectFit",
    tsc: [notAssignable("string", `{ 'Use <MediaTile fit="contain">': never; }`)],
    dev: '<MediaTile fit="contain">',
    names: ["tsc", "dev"],
  },
  {
    id: "mediaTile07",
    habit: "a picture as src",
    tsc: [notAssignable("string", `{ "Use <MediaTile avatar={{ src: photoUrl }}>": never; }`)],
    dev: '<MediaTile avatar={{ src: "/mara.jpg" }}>',
    names: ["tsc", "dev"],
  },
  {
    id: "mediaTile08",
    habit: "a connection that isn't one",
    tsc: [notAssignable('"bad"', `MediaTileConnection | (string & { 'Use "good", "fair" or "poor"': never; }) | undefined`)],
    dev: '<MediaTile connection="poor">',
    names: ["tsc", "dev"],
  },
];

/** Valid media-tile snippets: no type error, no development message, and hover on every prop. */
export const validSnippets: string[] = ["mediaTileValid"];
