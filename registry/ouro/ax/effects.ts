/**
 * Effect classes: every command either touches only the person's own space ("private") or reaches other people
 * ("others"). Help groups commands under those two headings, an "others" command needs `--why` and previews its
 * audience before it acts, and its result says who can see it. `readOnly` marks reads, which never change anything.
 */
export type Effect = "private" | "others";

export interface EffectHeadings {
  private: string;
  others: string;
}

export const DEFAULT_HEADINGS: EffectHeadings = Object.freeze({ private: "Only you see these", others: "Other people see these" });

/** The flag every "others" command takes: who asked, and what they said. */
export const WHY_FLAG = "why";
export const WHY_PLACEHOLDER = "<who asked you, and what they said>";

/** MCP tool annotations for an effect (https://modelcontextprotocol.io/specification/2025-06-18/server/tools). */
export function effectAnnotations(effect: Effect, readOnly: boolean): { readOnlyHint: boolean; destructiveHint: boolean; openWorldHint: boolean } {
  return { readOnlyHint: readOnly, destructiveHint: effect === "others", openWorldHint: effect === "others" };
}

/** "Sam Lee", "Sam Lee and Ana Ruiz", "Sam Lee, Ana Ruiz and 3 others". */
export function namesLine(names: readonly string[], max: number = 2): string {
  if (names.length === 0) return "nobody";
  if (names.length <= max) return names.length === 1 ? names[0]! : `${names.slice(0, -1).join(", ")} and ${names.at(-1)!}`;
  const more = names.length - max;
  return `${names.slice(0, max).join(", ")} and ${more} other${more === 1 ? "" : "s"}`;
}

/**
 * The audience preview an "others" action prints before it runs, and the line its result states.
 * @example audience({ doing: "Sending", done: "Sent", where: '"Design sync"', as: "the person", who: ["Sam Lee", "Ana Ruiz"] })
 */
export function audience(a: { doing: string; done: string; where: string; as: string; who: readonly string[] | "everyone" }): { preview: string; result: string } {
  const who = a.who === "everyone" ? `Everyone in ${a.where}` : namesLine(a.who);
  return {
    preview: `${a.doing} to ${a.where} as ${a.as}. ${who} will see it.`,
    result: `${a.done} to ${a.where} as ${a.as}. ${who} can see it.`,
  };
}

/** The result line of a private action: what changed, and that nobody else saw it. */
export function privateResult(what: string): string {
  return `${what.replace(/[.\s]+$/, "")}. Only you see it; nothing was sent.`;
}
