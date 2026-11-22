"use client";

import { useEffect, useLayoutEffect, useMemo, useRef } from "react";
import type { Children, RefObject } from "react";
import type { MessageListFind, MessageListFindReport } from "@/registry/ouro/components/ouro/message/message-list";
import { findInMessages, locateMatch, messageText } from "@/registry/ouro/lib/ouro/find-messages";
import { useFindHighlights } from "@/registry/ouro/lib/ouro/use-find-highlights";
import { useReducedMotion } from "@/registry/ouro/lib/ouro/use-reduced-motion";

export { MessageFindLayer };

/**
 * How matches are drawn, by the highlight names `ouro-find` and `ouro-find-current`: the theme's primary, tinted for the others and solid
 * for the current one, with the paired text colour so a link inside a match stays readable, and the system colours when colours are forced.
 *
 * @internal
 */
const findMarkClasses =
  "[&::highlight(ouro-find)]:bg-[color-mix(in_oklab,var(--primary)_22%,var(--background))] [&::highlight(ouro-find)]:text-foreground " +
  "[&::highlight(ouro-find-current)]:bg-primary [&::highlight(ouro-find-current)]:text-primary-foreground " +
  "forced-colors:[&::highlight(ouro-find)]:bg-[Mark] forced-colors:[&::highlight(ouro-find)]:text-[MarkText] " +
  "forced-colors:[&::highlight(ouro-find-current)]:bg-[Highlight] forced-colors:[&::highlight(ouro-find-current)]:text-[HighlightText]";

/**
 * Counts the matches of a MessageList's `find` in its messages' own text, reports them, and draws them in the page. A list
 * loads it when `find` is set.
 *
 * @internal
 */
function MessageFindLayer({
  all,
  keys,
  find,
  hasOlder,
  scroller,
  content,
  slot,
  onFindMatches,
  onMarks,
  request,
}: {
  all: ReturnType<typeof Children.toArray>;
  keys: string[];
  find: MessageListFind;
  hasOlder: boolean;
  scroller: RefObject<HTMLElement | null>;
  content: RefObject<HTMLElement | null>;
  slot: string;
  onFindMatches: ((report: MessageListFindReport) => void) | undefined;
  onMarks: (marks: string) => void;
  request: RefObject<(next: { key: string; id: null; child: boolean; forward: boolean; focus: boolean; block: "center" }) => void>;
}): null {
  // Stryker disable next-line ArrayDeclaration: the callback is a state setter, which never changes, so its dependencies make no difference.
  useLayoutEffect(() => onMarks(findMarkClasses), [onMarks]);
  const reduced = useReducedMotion();
  const { query, fold, locale } = find;
  const found = useMemo(
    () => findInMessages(all.map((child, index) => ({ key: keys[index]!, text: messageText(child) })), { query, fold, locale }),
    [all, keys, query, fold, locale],
  );
  const current = find.current ?? 0;
  useFindHighlights({ scroller, content, slot, find: { query, fold, locale }, result: found, current, reduced });
  const target = locateMatch(found, current);
  const reportRef = useRef(onFindMatches);
  useEffect(() => {
    reportRef.current = onFindMatches;
  });
  const targetKey = target?.key;
  const targetOccurrence = target?.occurrence;
  useLayoutEffect(() => {
    if (targetKey === undefined) return;
    const drawnNow = [...content.current!.querySelectorAll(`[${slot}]`)].some((element) => element.getAttribute(slot) === targetKey);
    if (!drawnNow) request.current({ key: targetKey, id: null, child: true, forward: true, focus: false, block: "center" });
  // Stryker disable next-line ArrayDeclaration: with no dependencies the effect asks to draw on every render, and each draw renders again, so the test run never ends.
  }, [content, slot, targetKey, targetOccurrence, query, request]);
  let currentIndex: number | null = null;
  if (target !== null) {
    currentIndex = found.order.slice(0, found.order.findIndex((entry) => entry.key === target.key)).reduce((sum, entry) => sum + entry.count, 0) + target.occurrence;
  }
  useEffect(() => {
    reportRef.current?.({ count: found.total, current: currentIndex, partial: hasOlder });
  }, [found.total, currentIndex, hasOlder]);
  return null;
}
