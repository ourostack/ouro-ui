// The text of a page's h1s, as the prerender check (prerender.mts) compares them with each docs page's title.

/** HTML's character references that React writes for text: the five it escapes, and any numeric one. */
const named: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" };

/** A text node's markup read back as text: numeric references (React writes an apostrophe as `&#x27;`) and the named five. */
export function decodeText(text: string): string {
  return text.replace(/&(?:#x([0-9a-f]+)|#(\d+)|(amp|lt|gt|quot|apos));/gi, (_, hex: string | undefined, dec: string | undefined, name: string | undefined) =>
    hex !== undefined ? String.fromCodePoint(parseInt(hex, 16)) : dec !== undefined ? String.fromCodePoint(Number(dec)) : named[name!.toLowerCase()]!,
  );
}

/** The text of each h1 on a page, without its tags (a platform page sets "for Apple" in smaller type, inside its h1). */
export function pageHeadings(html: string): string[] {
  return [...html.matchAll(/<h1[^>]*>([\s\S]*?)<\/h1>/g)].map(([, inner]) => decodeText(inner!.replace(/<[^>]+>/g, "")));
}
