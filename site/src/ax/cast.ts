/**
 * The people in Ouro AX's story on the site: the duo, and two people in the room. Every name and pronoun the site's AX
 * copy uses comes from here, so changing the cast is a change to this file alone (ax.test.tsx fails if a name appears
 * anywhere else).
 *
 * The duo: the Captain is the person and the Stoker is their agent. The Captain has no face and goes by "they"; the
 * Stoker acts only on the Captain's word. In the story the Stoker never says "I": its replies give the fact first, then
 * who will see it. The duo's names belong to the story pages only; the kit and its docs say "the person" and "the
 * person's agent". Ana and Kim are other people in the room. The room, "Design sync", is not here: it is the kit's
 * example tool's own room, and the tool prints its name.
 */
export const CAST = {
  person: { name: "the Captain", Name: "The Captain", their: "their" },
  agent: { name: "the Stoker", Name: "The Stoker" },
  replier: { first: "Ana", full: "Ana Ruiz" },
  other: { first: "Kim", full: "Kim Ito" },
} as const;

const SLOTS: Record<string, string> = {
  "{person}": CAST.person.name,
  "{Person}": CAST.person.Name,
  "{person.their}": CAST.person.their,
  "{agent}": CAST.agent.name,
  "{Agent}": CAST.agent.Name,
  "{replier}": CAST.replier.first,
  "{replier.full}": CAST.replier.full,
  "{other}": CAST.other.first,
  "{other.full}": CAST.other.full,
};

/**
 * Fills a line's slots: `{person}` and `{Person}` (the Captain, mid-sentence and at the start of one), `{person.their}`,
 * `{agent}` and `{Agent}` (the Stoker), `{replier}`, `{replier.full}`, `{other}` and `{other.full}`.
 */
export function cast(text: string): string {
  return text.replace(/\{(?:person|Person|agent|Agent|replier|other)(?:\.(?:full|their))?\}/g, (slot) => SLOTS[slot] ?? slot);
}

/** `cast` over every string in a JSON value, such as the transcripts. */
export function castAll<T>(value: T): T {
  if (typeof value === "string") return cast(value) as T;
  if (Array.isArray(value)) return value.map((item: unknown) => castAll(item)) as T;
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, castAll(item)])) as T;
  return value;
}
