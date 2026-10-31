"use client";

import { Children, isValidElement, useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import type { HTMLAttributes, JSX, ReactNode, Ref } from "react";
import { useAppearanceClassNameCheck } from "@/registry/ouro/lib/ouro/class-name-check";
import { cn } from "@/registry/ouro/lib/ouro/cn";
import { useMergedRef } from "@/registry/ouro/lib/ouro/refs";
import { TouchTarget } from "@/registry/ouro/lib/ouro/touch-target";
import { useDevWarnings } from "@/registry/ouro/lib/ouro/use-dev-messages";
import { useKeyboardScrollable } from "@/registry/ouro/lib/ouro/use-keyboard-scrollable";

/** The props MessageList adds to the `<div>` attributes it passes through. */
export interface MessageListOwnProps {
  /** What the conversation is, for screen readers: "Conversation with Ouro". Required, so the region has a name. */
  label: string;
  /** The `Message`s, oldest first, or your own message components marked `data-ouro-message-list-item` (see {@link MessageList}). */
  children: ReactNode;
  /** The button that appears once the reader scrolls up, for other languages. @default "Jump to latest" */
  jumpLabel?: string | undefined;
  /**
   * What screen readers hear when a new message arrives, for other languages. It gets the
   * author's name and the message's text. The user's own messages are not read back.
   * @default (author, text) => `${author}: ${text}`
   */
  newMessageLabel?: ((author: string, text: string) => string) | undefined;
  /**
   * Layout only: the list's height (`h-96`, `flex-1`), margins. It scrolls inside that
   * height, so give it one. Appearance classes warn in development.
   */
  className?: string | undefined;
  ref?: Ref<HTMLDivElement> | undefined;

  /** Not a prop. The list follows new messages while the reader is at the bottom, and stops when they scroll up. */
  autoScroll?: { 'Not a prop: the list follows new messages at the bottom. Use <MessageList label="Conversation">': never };
  /** Not a prop. The list follows new messages while the reader is at the bottom, and stops when they scroll up. */
  stickToBottom?: { 'Not a prop: the list follows new messages at the bottom. Use <MessageList label="Conversation">': never };
}

/** Props for {@link MessageList}: its own props and the `<div>` attributes it passes through. */
export type MessageListProps = Omit<HTMLAttributes<HTMLDivElement>, keyof MessageListOwnProps | "role"> & MessageListOwnProps;

/**
 * The messages in the list: Ouro's `Message`s, and an app's own message components, each marked
 * `data-ouro-message-list-item` on its root.
 * @claim "and an app's own message components" registry/ouro/components/ouro/message/message-list.test.tsx verify:testExists(registry/ouro/components/ouro/message/message-list.test.tsx::MessageList > keeps the reader's place among an app's own messages marked data-ouro-message-list-item, and announces them as it does Messages)
 */
const items = '[data-ouro="message"], [data-ouro-message-list-item]';

/** How close to the bottom, in pixels, counts as "at the bottom" (zoom leaves fractions). */
const AT_BOTTOM = 4;
/** How many announcements the live region keeps; older ones were already read. */
const KEEP_SPOKEN = 5;

/**
 * The "Jump to latest" pill: a raised quiet button over the newest messages, 16px text and
 * a 44px target on a coarse pointer, fading in where motion is allowed.
 * @claim "pill: a raised quiet button over the newest" registry/ouro/components/ouro/message/message-list.touch.test.tsx verify:testExists(registry/ouro/components/ouro/message/message-list.touch.test.tsx::keeps the reader's place on a phone once they swipe up, and jumps back with a 44px button)
 * @claim "pill: a raised quiet button over the newest" registry/ouro/components/ouro/message/message-list.touch.test.tsx verify:testExists(registry/ouro/components/ouro/message/message-list.touch.test.tsx::keeps 16px message text on a landscape phone)
 */
const jumpClass =
  "press pointer-events-auto relative m-0 box-border inline-flex h-9 items-center gap-1.5 rounded-full border border-solid border-border " +
  "bg-background px-3.5 text-base font-medium text-foreground shadow-(--shadow-md) pointer-fine:h-8 pointer-fine:text-sm whitespace-nowrap " +
  "cursor-pointer touch-manipulation outline-ring outline-offset-2 focus-visible:outline-2 focus-visible:outline-solid " +
  "pointer-fine:hover:bg-accent pointer-fine:hover:text-accent-foreground motion-safe:active:scale-(--ouro-press-scale) " +
  "transition-opacity duration-(--ouro-duration-base) ease-(--ouro-ease-out) starting:opacity-0";

interface Spoken {
  id: number;
  text: string;
}

/**
 * A conversation: `Message`s in a scrolling, labeled region that opens at the newest one.
 * While the reader is at the bottom it follows new messages and streaming text; once they
 * scroll up, nothing moves their view, and a "Jump to latest" button appears. Each new
 * message from someone else is read to screen readers once, politely: a streamed reply
 * when it finishes, and a first reply in a list that mounted empty. History is never
 * announced: the messages it mounts with, several messages filling an empty list at once
 * (history fetched after mount), older messages loaded above, and a message whose `key` changes in place (a temporary id
 * swapped for the server's). Older messages loaded above a scrolled-up reader leave the
 * message they are reading where it was. Scrolling is never announced.
 *
 * Give it a height (`className="h-96"`, or `flex-1` in a column), since it scrolls inside it.
 *
 * Your own message components work too: mark each one's root `data-ouro-message-list-item`, the
 * reader's own with `data-role="user"` and one still streaming with `aria-busy="true"`, and put its
 * author's name and its text in elements marked `data-ouro-message-author` and
 * `data-ouro-message-content`, as `Message` does. The list keeps the reader's place among them and
 * announces them as it does `Message`s. Leave `data-ouro="message"` to Ouro's `Message`: it names
 * the element Ouro's Message, and X-ray outlines it as one.
 *
 * Use a plain list instead for messages that do not arrive live, such as an inbox.
 *
 * @group Chat
 * @see https://ui.ouro.bot/docs/message-list
 *
 * @example
 * <MessageList label="Conversation with Ouro" className="h-[60dvh]">
 *   {messages.map((message) => (
 *     <Message key={message.id} role={message.role} name={message.author} streaming={message.streaming}>
 *       {message.text}
 *     </Message>
 *   ))}
 * </MessageList>
 * <MessageList label="Team chat" className="flex-1">
 *   {posts.map((post) => (
 *     <article key={post.id} data-ouro-message-list-item="" data-role={post.mine ? "user" : "assistant"}>
 *       <span data-ouro-message-author="">{post.author}</span>
 *       <p data-ouro-message-content="">{post.text}</p>
 *     </article>
 *   ))}
 * </MessageList>
 * @claim "Your own message components work too" registry/ouro/components/ouro/message/message-list.test.tsx verify:testExists(registry/ouro/components/ouro/message/message-list.test.tsx::MessageList > keeps the reader's place among an app's own messages marked data-ouro-message-list-item, and announces them as it does Messages)
 * @claim "A conversation: `Message`s in a scrolling" registry/ouro/components/ouro/message/message-list.test.tsx verify:testExists(registry/ouro/components/ouro/message/message-list.test.tsx::MessageList > is a named, keyboard-scrollable region that opens at the newest message)
 * @claim "Each new message from someone else" registry/ouro/components/ouro/message/message-list.test.tsx verify:testExists(registry/ouro/components/ouro/message/message-list.test.tsx::MessageList > announces a reply still streaming in the first messages to fill an empty list, once it finishes)
 * @claim "Each new message from someone else" registry/ouro/components/ouro/message/message-list.test.tsx verify:testExists(registry/ouro/components/ouro/message/message-list.test.tsx::MessageList > announces a reply that was streaming when the list mounted, once it finishes)
 * @claim "Each new message from someone else" registry/ouro/components/ouro/message/message-list.test.tsx verify:testExists(registry/ouro/components/ouro/message/message-list.test.tsx::MessageList > does not read back the user's own message)
 * @claim "History is never announced: the messages" registry/ouro/components/ouro/message/message-list.test.tsx verify:testExists(registry/ouro/components/ouro/message/message-list.test.tsx::MessageList > never announces the first messages that fill an empty list, such as history fetched after mount)
 * @claim "History is never announced: the messages" registry/ouro/components/ouro/message/message-list.test.tsx verify:testExists(registry/ouro/components/ouro/message/message-list.test.tsx::MessageList > never announces older history loaded above, and keeps the reader's place while it loads)
 * @claim "Scrolling is never announced" registry/ouro/components/ouro/message/message-list.test.tsx verify:testExists(registry/ouro/components/ouro/message/message-list.test.tsx::MessageList > never announces while the reader scrolls)
 */
export function MessageList(props: MessageListProps): JSX.Element {
  const {
    label,
    children,
    jumpLabel = "Jump to latest",
    newMessageLabel = (author: string, text: string) => `${author}: ${text}`,
    className,
    // Guard props (hint types), dropped here so they never reach the DOM.
    autoScroll,
    stickToBottom,
    ...rest
  } = props;
  useAppearanceClassNameCheck(
    "MessageList",
    className,
    process.env.NODE_ENV !== "production"
      ? (token: string) => `<div className="${token}"><MessageList /></div>`
      : /* istanbul ignore next @preserve -- production only */ "",
  );
  useDevWarnings(
    "MessageList",
    process.env.NODE_ENV !== "production"
      ? () => [
          label === undefined && ["label is missing, so the conversation has no name", '<MessageList label="Conversation">'],
          (autoScroll !== undefined || stickToBottom !== undefined) && [
            `${autoScroll !== undefined ? "autoScroll" : "stickToBottom"} is not a prop; the list follows new messages while the reader is at the bottom`,
            '<MessageList label="Conversation">',
          ],
          Children.toArray(children).some((child) => !isValidElement(child)) && [
            "MessageList holds Messages",
            '<MessageList label="Conversation"><Message role="user" name="Ada">Hi</Message></MessageList>',
          ],
        ]
      : /* istanbul ignore next @preserve -- production only */ undefined,
  );

  const scrollerRef = useRef<HTMLDivElement | null>(null);
  const contentRef = useRef<HTMLDivElement | null>(null);
  // Whether the view follows new content. Only the reader's scrolling changes it.
  const pinned = useRef(true);
  const lastTop = useRef(0);
  const [showJump, setShowJump] = useState(false);
  const [spoken, setSpoken] = useState<Spoken[]>([]);
  const nextId = useRef(0);
  // The newest label function, for the observer set up once below.
  const labelFor = useRef(newMessageLabel);
  useLayoutEffect(() => {
    labelFor.current = newMessageLabel;
  });

  const keyboardRef = useKeyboardScrollable<HTMLDivElement>(true);
  const setScroller = useMergedRef<HTMLDivElement | null>(keyboardRef, scrollerRef);

  const toBottom = useCallback(() => {
    const scroller = scrollerRef.current!;
    scroller.scrollTop = scroller.scrollHeight;
    lastTop.current = scroller.scrollTop;
  }, []);

  // Open at the newest message, then follow growth (new messages, streaming text, images
  // loading, the keyboard resizing the list) only while pinned. Layout effect and resize
  // observer callbacks run before paint, so the view never flashes off the bottom.
  // While unpinned, the message at the top of the view stays where it is, so older history
  // loading above it never moves the reader. This replaces the browser's scroll anchoring,
  // which is off: Chrome's adjustment read as the reader scrolling up, and Safari has none.
  useLayoutEffect(() => {
    const scroller = scrollerRef.current!;
    const content = contentRef.current!;
    // The messages in view, top first, with where each sits. The first one still in the page
    // is held in place: the top one may itself have been replaced (a key change).
    let anchors: { node: Element; offset: number }[] = [];
    const offsetOf = (node: Element) => node.getBoundingClientRect().top - scroller.getBoundingClientRect().top;
    const keepAnchor = () => {
      const view = scroller.getBoundingClientRect();
      anchors = [...content.querySelectorAll(items)]
        .filter((message) => {
          const box = message.getBoundingClientRect();
          return box.bottom > view.top && box.top < view.bottom;
        })
        .map((node) => ({ node, offset: offsetOf(node) }));
    };
    toBottom();
    keepAnchor();
    const follow = new ResizeObserver(() => {
      const anchor = anchors.find(({ node }) => node.isConnected);
      if (pinned.current) toBottom();
      else if (anchor) {
        const moved = offsetOf(anchor.node) - anchor.offset;
        if (Math.abs(moved) >= 0.5) {
          scroller.scrollTop += moved;
          lastTop.current = scroller.scrollTop;
        }
      }
      keepAnchor();
    });
    follow.observe(content);
    follow.observe(scroller);
    const onScroll = () => {
      const top = scroller.scrollTop;
      const distance = scroller.scrollHeight - top - scroller.clientHeight;
      // Moving up at all unpins, even by a few pixels; reaching the bottom pins again.
      if (top < lastTop.current - 0.5 && distance > 1) pinned.current = false;
      else if (distance <= AT_BOTTOM) pinned.current = true;
      lastTop.current = top;
      keepAnchor();
      setShowJump(!pinned.current);
    };
    scroller.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      follow.disconnect();
      scroller.removeEventListener("scroll", onScroll);
    };
  }, [toBottom]);

  // Announce each message from someone else once: when it is appended after the last
  // message already seen, when it replaces one with different text (a regenerated reply), or,
  // if it is streaming, when streaming ends, including a message that streams again.
  // Messages are known by their element, which React replaces exactly when the key changes.
  // Never announced: the messages present on mount, several messages filling an empty list
  // at once (history fetched after mount; a single one is a first reply), anything inserted above
  // the last seen message (older history), and a message whose key changed in place with the
  // same text (a temporary id swapped for the server's), and anything that arrives while the
  // list is inside a `hidden` element (a closed panel), where its live region is not heard either.
  //
  // Telling messages apart reads `textContent`, which needs no layout. Only a message read out
  // reads `innerText`, for its line breaks, and only outside a `hidden` element: run from this
  // observer, right after React's commit, `innerText` forces a layout before the browser's own,
  // and inside a closed `hidden="until-found"` panel a layout of the content the browser skips.
  // (So does `checkVisibility()` in Chromium, so the check is the attribute.)
  useEffect(() => {
    const content = contentRef.current!;
    const messages = () => [...content.querySelectorAll<HTMLElement>(items)];
    const busy = (message: Element) => message.getAttribute("aria-busy") === "true";
    const textOf = (message: Element) => message.querySelector("[data-ouro-message-content]")!.textContent.trim();
    const spokenTextOf = (message: Element) => message.querySelector<HTMLElement>("[data-ouro-message-content]")!.innerText.trim();
    let known = messages();
    // Each known message's text when last checked, to tell a key swap from a new reply.
    let texts = new Map(known.map((message) => [message, textOf(message)]));
    // Messages to read once they stop streaming.
    let waiting = new Set(known.filter(busy));
    const check = () => {
      const now = messages();
      const before = new Set(known);
      let last = now.length - 1;
      while (last >= 0 && !before.has(now[last]!)) last--;
      if (known.length > 0 && last >= 0) {
        // Messages after the last one still here replace the ones that were there before, and
        // the rest are new. A replacement is the same message under a new key, so silent, only
        // when it keeps the text and is not streaming; one replacing a message still waiting
        // takes its place in the queue.
        const replaced = known.slice(known.indexOf(now[last]!) + 1);
        now.slice(last + 1).forEach((message, index) => {
          const old = replaced[index];
          if (old === undefined || waiting.has(old) || texts.get(old) !== textOf(message)) waiting.add(message);
        });
      } else if (known.length === 0 && now.length === 1) {
        // One message into an empty list is a first reply or greeting. Several at once are
        // history fetched after mount.
        waiting.add(now[0]!);
      }
      // Anything streaming is read when it ends: the first messages' streaming reply, and a
      // known message that starts streaming again.
      for (const message of now) if (busy(message)) waiting.add(message);
      known = now;
      texts = new Map(now.map((message) => [message, textOf(message)]));
      if (content.closest("[hidden]")) {
        waiting = new Set(now.filter(busy));
        return;
      }
      const fresh: string[] = [];
      const still = new Set<HTMLElement>();
      for (const message of now) {
        if (!waiting.has(message)) continue;
        if (busy(message)) {
          still.add(message);
          continue;
        }
        if (message.getAttribute("data-role") === "user") continue;
        const author = message.querySelector<HTMLElement>("[data-ouro-message-author]")!.innerText;
        const text = spokenTextOf(message);
        fresh.push(labelFor.current(author, text));
      }
      waiting = still;
      if (fresh.length === 0) return;
      setSpoken((previous) => [...previous, ...fresh.map((text) => ({ id: nextId.current++, text }))].slice(-KEEP_SPOKEN));
    };
    // Only messages coming and going, and streaming ending, matter; each streamed token
    // changes text, which is skipped without a scan.
    const matters = (record: MutationRecord) =>
      record.type === "attributes" || [...record.addedNodes, ...record.removedNodes].some((node) => node instanceof Element && (node.matches(items) || node.querySelector(items) !== null));
    const observer = new MutationObserver((records) => {
      if (records.some(matters)) check();
    });
    observer.observe(content, { childList: true, subtree: true, attributes: true, attributeFilter: ["aria-busy"] });
    return () => observer.disconnect();
  }, []);

  const jump = () => {
    pinned.current = true;
    toBottom();
    setShowJump(false);
    scrollerRef.current!.focus({ preventScroll: true });
  };

  return (
    <div {...rest} data-ouro="message-list" className={cn("relative box-border flex min-h-0 flex-col", className)}>
      {/* No browser scroll anchoring; the layout effect above keeps the reader's place instead. */}
      <div
        ref={setScroller}
        role="region"
        aria-label={label}
        data-ouro-message-list-scroller=""
        data-ouro-control="message-list"
        data-ouro-part="scroller"
        className="min-h-0 flex-1 overflow-y-auto overscroll-contain [overflow-anchor:none] outline-ring -outline-offset-2 focus-visible:outline-2 focus-visible:outline-solid forced-colors:[&[tabindex='0']]:outline-1 forced-colors:[&[tabindex='0']]:outline-solid forced-colors:[&[tabindex='0']]:-outline-offset-1"
      >
        <div ref={contentRef} data-ouro-message-list-content="" className="flex flex-col gap-4 p-4 [&>[data-continued]]:-mt-3">
          {children}
        </div>
      </div>
      {/* Read politely, outside the scrolling content, so new messages are heard once. */}
      <div data-ouro-message-list-live="" aria-live="polite" className="sr-only">
        {spoken.map((item) => (
          <p key={item.id}>{item.text}</p>
        ))}
      </div>
      {showJump && (
        <div className="pointer-events-none absolute inset-x-0 bottom-3 flex justify-center">
          <button type="button" data-ouro-message-list-jump="" data-ouro-control="message-list" data-ouro-part="jump" onClick={jump} className={jumpClass}>
            <TouchTarget />
            {jumpLabel}
            <svg aria-hidden="true" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="size-4">
              <path d="M8 3v10M4 9l4 4 4-4" />
            </svg>
          </button>
        </div>
      )}
    </div>
  );
}
