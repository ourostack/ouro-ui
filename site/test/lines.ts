/**
 * The lines an element's text sits on, as the browser laid them out: each character's box is measured, and a character
 * whose box starts below the line before starts a new line. A space the line break swallowed has no box and is left out.
 */
export function renderedLines(element: Element): string[] {
  const lines: { top: number; text: string }[] = [];
  const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
  const range = document.createRange();
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const text = node.textContent ?? "";
    for (let index = 0; index < text.length; index++) {
      range.setStart(node, index);
      range.setEnd(node, index + 1);
      const box = [...range.getClientRects()].find((rect) => rect.width > 0);
      if (!box) continue;
      const last = lines.at(-1);
      if (!last || box.top >= last.top + box.height / 2) lines.push({ top: box.top, text: text[index]! });
      else last.text += text[index];
    }
  }
  return lines.map((line) => line.text.trim());
}

/**
 * The places where a line breaks inside a word, as "end of one line|start of the next". A break is fine after a space
 * or after a "/" (a web address breaks only between its parts), and anywhere else splits a word, such as "llms|.txt".
 */
export function splitWords(element: Element): string[] {
  const lines = renderedLines(element);
  const splits: string[] = [];
  for (let index = 1; index < lines.length; index++) {
    const before = lines[index - 1]!;
    const after = lines[index]!;
    if (before.endsWith("/") && !after.startsWith("/")) continue;
    const joined = (element.textContent ?? "").replace(/\s+/g, " ");
    if (joined.includes(`${before} ${after.split(" ")[0]}`)) continue;
    splits.push(`${before.split(" ").at(-1)}|${after.split(" ")[0]}`);
  }
  return splits;
}
