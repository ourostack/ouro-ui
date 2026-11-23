"use client";

import { useLayoutEffect, useRef } from "react";
import type { RefObject } from "react";
import { locateMatch, rangesIn } from "@/registry/ouro/lib/ouro/find-messages";
import type { MessageFind, MessageFindResult } from "@/registry/ouro/lib/ouro/find-messages";

export { useFindHighlights, ALL_MATCHES, CURRENT_MATCH };

/** The name of the highlight the matches other than the current one are drawn in, for `::highlight()`. */
const ALL_MATCHES = "ouro-find";
/** The name of the highlight the current match is drawn in, for `::highlight()`. */
const CURRENT_MATCH = "ouro-find-current";
/** Space kept between the current match and the list's edge when it scrolls to it, in pixels. */
const MARGIN = 48;

/**
 * Draws the matches of `find` in the messages drawn inside `content` with the CSS Custom Highlight API, so the text nodes
 * stay as they are, and scrolls `scroller` to the current one while focus stays put. Where the browser lacks the API, the
 * page is left as it is. `slot` is the attribute a message's element carries with its key.
 *
 * Internal: MessageList uses it; apps don't need to.
 */
function useFindHighlights(options: {
  scroller: RefObject<HTMLElement | null>;
  content: RefObject<HTMLElement | null>;
  slot: string;
  find: MessageFind | undefined;
  result: MessageFindResult;
  current: number;
  reduced: boolean;
}): void {
  const { scroller, content, slot, find, result, current, reduced } = options;
  const target = find === undefined ? null : locateMatch(result, current);
  const hasTarget = target !== null;
  const query = find?.query ?? "";
  const fold = find?.fold;
  const locale = find?.locale;
  const latest = useRef({ result, target, reduced });
  useLayoutEffect(() => {
    latest.current = { result, target, reduced };
  });

  const signature = result.order.map((entry) => `${entry.key}:${entry.count}`).join("|");
  const drawn = useRef<Range | undefined>(undefined);
  // Set when the current match's message is not drawn yet, so the scroll is owed once it is.
  const owed = useRef(false);
  const scrollToCurrent = () => {
    const view = scroller.current!;
    const match = drawn.current!.getBoundingClientRect();
    const edge = view.getBoundingClientRect();
    const move = Math.min(0, match.top - edge.top - MARGIN) || Math.max(0, match.bottom - edge.bottom + MARGIN);
    if (move === 0) return true;
    view.scrollTo({ top: view.scrollTop + move, behavior: latest.current.reduced ? "instant" : "smooth" });
    return false;
  };
  const scrollRef = useRef(scrollToCurrent);
  useLayoutEffect(
    () => () => {
      /* istanbul ignore else @preserve -- the effect below never draws without the API, so there is nothing to delete */
      if (typeof CSS !== "undefined" && "highlights" in CSS) {
        CSS.highlights.delete(ALL_MATCHES);
        CSS.highlights.delete(CURRENT_MATCH);
      }
    },
    // Stryker disable next-line ArrayDeclaration: the cleanup reads nothing from the render, so a different list still runs it only on unmount.
    [],
  );

  useLayoutEffect(() => {
    const root = content.current!;
    drawn.current = undefined;
    if (!("highlights" in CSS)) return;
    if (query === "") {
      CSS.highlights.delete(ALL_MATCHES);
      CSS.highlights.delete(CURRENT_MATCH);
      return;
    }
    const spec: MessageFind = { query, fold, locale };
    let currentRange: Range | undefined;
    const draw = () => {
      const { result: now, target: goal } = latest.current;
      const others: Range[] = [];
      const wanted: Range[] = [];
      currentRange = undefined;
      for (const element of root.querySelectorAll(`[${slot}]`)) {
        const key = element.getAttribute(slot)!;
        if (!now.counts.has(key)) continue;
        const found = [...element.querySelectorAll("[data-ouro-message-content]")].flatMap((part) => rangesIn(part, spec));
        // Stryker disable next-line OptionalChaining: goal is null only when the result has no matches, and then no element passes the counts check above.
        const place = goal?.key === key ? Math.min(goal.occurrence, found.length - 1) : -1;
        found.forEach((range, index) => (index === place ? (currentRange = range) : others.push(range)));
      }
      if (currentRange) wanted.push(currentRange);
      CSS.highlights.set(ALL_MATCHES, new Highlight(...others));
      CSS.highlights.set(CURRENT_MATCH, new Highlight(...wanted));
      drawn.current = currentRange;
      // Owed until the match is in view: the list's own scroll to the message can land after this one.
      if (currentRange && owed.current && scrollRef.current()) owed.current = false;
    };
    draw();
    let frame = 0;
    const observer = new MutationObserver(() => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(draw);
    });
    observer.observe(root, { childList: true, subtree: true, characterData: true });
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, [content, slot, query, fold, locale, signature, target?.key, target?.occurrence]);

  useLayoutEffect(() => {
    owed.current = drawn.current === undefined && hasTarget;
    if (drawn.current) scrollRef.current();
  }, [scroller, query, fold, locale, hasTarget, target?.key, target?.occurrence]);
}
