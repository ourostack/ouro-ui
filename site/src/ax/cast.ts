/**
 * The names in Ouro AX's story on the site. The story is told in the product's own voice: the person is "you" and their
 * agent is "your agent", and the agent's replies are its output in plain words, never a character's lines. A name is
 * used only where other people see the person, as in the room, and the people in the room keep their own. Every name
 * the site's AX copy uses comes from here, so changing one is a change to this file alone (ax.test.tsx fails if a name
 * appears anywhere else). The room, "Design sync", is not here: it is the kit's example tool's own room, and the tool
 * prints its name.
 */
export const CAST = {
  person: { full: "Jo Park" },
  replier: { first: "Ana", full: "Ana Ruiz" },
  other: { first: "Kim", full: "Kim Ito" },
} as const;

const SLOTS: Record<string, string> = {
  "{person.full}": CAST.person.full,
  "{replier}": CAST.replier.first,
  "{replier.full}": CAST.replier.full,
  "{other}": CAST.other.first,
  "{other.full}": CAST.other.full,
};

/** Fills a line's `{person.full}` (where other people see the person), `{replier}`, `{replier.full}`, `{other}` and `{other.full}`. */
export function cast(text: string): string {
  return text.replace(/\{(?:person|replier|other)(?:\.full)?\}/g, (slot) => SLOTS[slot] ?? slot);
}

/** `cast` over every string in a JSON value, such as the transcripts. */
export function castAll<T>(value: T): T {
  if (typeof value === "string") return cast(value) as T;
  if (Array.isArray(value)) return value.map((item: unknown) => castAll(item)) as T;
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, castAll(item)])) as T;
  return value;
}
