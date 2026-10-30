/**
 * A small tool built only from the kit, for the tests and as the pattern to copy: three commands across both effects,
 * an ambiguous word, and a tool-specific exit code.
 */
import { defineCli, defineCommand } from "./command.ts";
import { audience, privateResult } from "./effects.ts";
import { AxError } from "./errors.ts";
import { BASE_EXIT_CODES, defineExitCodes } from "./exit-codes.ts";

export const exits = defineExitCodes([...BASE_EXIT_CODES, { code: 3, name: "unavailable", short: "unavailable", meaning: "the service could not be reached" }]);

const rooms: Record<string, { title: string; members: string[]; notes: string[] }> = {};
export function resetRooms() {
  for (const k of Object.keys(rooms)) delete rooms[k];
  rooms["abc123"] = { title: "Design sync", members: ["Sam Lee", "Ana Ruiz", "Kim Ito"], notes: [] };
}
resetRooms();

const room = (ref: string) => {
  const r = rooms[ref];
  if (!r) throw new AxError({ code: "no-such-room", exit: exits.code("error"), thing: "room", problem: `there is no room "${ref}"`, fix: "notes rooms" });
  return r;
};

export const exampleCli = defineCli({
  name: "notes",
  about: ["notes: a toy tool built from Ouro AX definitions."],
  exits,
  ambiguous: { edit: [{ means: "a note only you see", use: "note <room> <text>" }, { means: "a message other people see", use: "post <room> <text> --why <why>" }] },
  commands: [
    defineCommand({
      name: "rooms",
      summary: "The rooms, with their short ids.",
      effect: "private",
      readOnly: true,
      flags: { limit: { type: "number", description: "At most this many.", min: 1, max: 100 } },
      output: "[ { ref, title } ]",
      examples: ["notes rooms --limit 5"],
      run: (input) => Object.entries(rooms).slice(0, typeof input["limit"] === "number" ? input["limit"] : undefined).map(([ref, r]) => ({ ref, title: r.title })),
      text: (list) => list.map((r) => `[${r.ref}] ${r.title}`).join("\n"),
    }),
    defineCommand({
      name: "note",
      summary: "Add a private note to a room.",
      effect: "private",
      args: [
        { name: "room", description: "The room's short id.", required: true, source: "rooms" },
        { name: "text", description: "The note.", required: true, rest: true, stdin: true },
      ],
      output: "{ room, notes }",
      examples: ['notes note abc123 "check the dates"'],
      run: (input) => {
        const r = room(String(input["room"]));
        r.notes.push(String(input["text"]));
        return { room: r.title, notes: r.notes.length };
      },
      text: (res) => privateResult(`Note added in "${res.room}"`),
    }),
    defineCommand({
      name: "post",
      summary: "Post a message everyone in the room sees.",
      effect: "others",
      args: [
        { name: "room", description: "The room's short id.", required: true, source: "rooms" },
        { name: "text", description: "The message.", required: true, rest: true, stdin: true },
      ],
      flags: { tone: { type: "enum", values: ["plain", "markdown"], description: "How the text is formatted." } },
      output: "{ room, audience }",
      examples: ['notes post abc123 "Running late" --why "Sam asked me to tell the room"'],
      run: (input) => {
        const r = room(String(input["room"]));
        return { room: r.title, audience: audience({ doing: "Posting", done: "Posted", where: `"${r.title}"`, as: "you", who: r.members }).result };
      },
      text: (res) => res.audience,
    }),
  ],
});
