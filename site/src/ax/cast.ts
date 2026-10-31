/**
 * The people in Ouro AX's story on the site: the person, someone who answers in the room, and one more teammate. Every
 * name and pronoun the site's AX copy uses comes from here, so changing the cast is a change to this file alone
 * (ax.test.tsx fails if a name appears anywhere else). Canon (the Duo canon): the agent is always named through its
 * person, as "{agent}", the first time it appears in a moment; the person never has a face; the two are shown as a pair. The room, "Design sync", is not here: it is the kit's example
 * tool's own room, and the tool prints its name.
 */
export const CAST = {
  person: { first: "Sam", full: "Sam Lee", their: "their" },
  replier: { first: "Ana", full: "Ana Ruiz" },
  other: { first: "Kim", full: "Kim Ito" },
} as const;

const SLOTS: Record<string, string> = {
  "{person}": CAST.person.first,
  "{person.full}": CAST.person.full,
  "{person.their}": CAST.person.their,
  "{agent}": `${CAST.person.first}'s agent`,
  "{replier}": CAST.replier.first,
  "{replier.full}": CAST.replier.full,
  "{other}": CAST.other.first,
  "{other.full}": CAST.other.full,
};

/** Fills a line's `{person}`, `{person.full}`, `{person.their}`, `{agent}` (the agent, always named through its person), `{replier}`, `{replier.full}`, `{other}` and `{other.full}`. */
export function cast(text: string): string {
  return text.replace(/\{(?:person|agent|replier|other)(?:\.(?:full|their))?\}/g, (slot) => SLOTS[slot] ?? slot);
}

/** `cast` over every string in a JSON value, such as the transcripts. */
export function castAll<T>(value: T): T {
  if (typeof value === "string") return cast(value) as T;
  if (Array.isArray(value)) return value.map((item: unknown) => castAll(item)) as T;
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, castAll(item)])) as T;
  return value;
}
