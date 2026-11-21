import { isValidElement } from "react";
import type { ReactNode } from "react";
import { findMatches } from "@/registry/ouro/lib/ouro/find-text";
import type { FindFold } from "@/registry/ouro/lib/ouro/find-text";

export { messageText, findInMessages, locateMatch, rangesIn };
export type { MessageFind, MessageFindResult, MessageFindTarget };

/** What to find in a list of messages. */
interface MessageFind {
  query: string;
  fold?: FindFold | undefined;
  locale?: string | undefined;
}

/** Where the matches lie: the count in a message, in order, and the total. */
interface MessageFindResult {
  total: number;
  counts: ReadonlyMap<string, number>;
  order: readonly { key: string; count: number }[];
}

/** The message and the place in it of one match, counted from the start of the list. */
interface MessageFindTarget {
  key: string;
  occurrence: number;
}

/** The text a message's children hold, as the page reads it: strings and numbers, through elements and fragments, and a post's `subject`. */
function messageText(node: ReactNode): string {
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(messageText).join("");
  if (!isValidElement(node)) return "";
  const props = node.props as { children?: ReactNode; subject?: ReactNode };
  return messageText(props.subject) + messageText(props.children);
}

/** The matches of `find` in the messages' text, counting a message that is not drawn as well as one that is. */
function findInMessages(entries: readonly { key: string; text: string }[], find: MessageFind): MessageFindResult {
  const counts = new Map<string, number>();
  const order: { key: string; count: number }[] = [];
  let total = 0;
  if (find.query !== "") {
    const options = { ...(find.fold === undefined ? {} : { fold: find.fold }), ...(find.locale === undefined ? {} : { locale: find.locale }) };
    for (const { key, text } of entries) {
      const count = findMatches(text, find.query, options).length;
      if (count === 0) continue;
      counts.set(key, count);
      order.push({ key, count });
      total += count;
    }
  }
  return { total, counts, order };
}

/** The message and place of the match at `index`, wrapped into range, or null when the result is empty. */
function locateMatch(result: MessageFindResult, index: number): MessageFindTarget | null {
  if (result.total === 0) return null;
  let left = ((Math.trunc(index) % result.total) + result.total) % result.total;
  for (const { key, count } of result.order) {
    if (left < count) return { key, occurrence: left };
    left -= count;
  }
  return null;
}

/** The ranges of the matches in the text drawn inside `root`, in page order, across its text nodes. */
function rangesIn(root: Element, find: MessageFind): Range[] {
  const walker = root.ownerDocument.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const nodes: { node: Text; start: number }[] = [];
  let text = "";
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    nodes.push({ node: node as Text, start: text.length });
    text += node.nodeValue;
  }
  const options = { ...(find.fold === undefined ? {} : { fold: find.fold }), ...(find.locale === undefined ? {} : { locale: find.locale }) };
  const at = (offset: number, end: boolean) => {
    const found = nodes.findLast((entry) => (end ? entry.start < offset : entry.start <= offset))!;
    return { node: found.node, offset: offset - found.start };
  };
  return findMatches(text, find.query, options).map(({ start, end }) => {
    const from = at(start, false);
    const to = at(end, true);
    const range = root.ownerDocument.createRange();
    range.setStart(from.node, from.offset);
    range.setEnd(to.node, to.offset);
    return range;
  });
}
