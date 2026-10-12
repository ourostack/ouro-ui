"use client";

import { Children, isValidElement, useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import type { HTMLAttributes, JSX, ReactNode, Ref } from "react";
import { useAppearanceClassNameCheck } from "@/registry/ouro/lib/ouro/class-name-check";
import { cn } from "@/registry/ouro/lib/ouro/cn";
import { useMergedRef } from "@/registry/ouro/lib/ouro/refs";
import { TouchTarget } from "@/registry/ouro/lib/ouro/touch-target";
import { useDevWarnings } from "@/registry/ouro/lib/ouro/use-dev-warnings";
import { useKeyboardScrollable } from "@/registry/ouro/lib/ouro/use-keyboard-scrollable";

/** The props MessageList adds to the `<div>` attributes it passes through. */
export interface MessageListOwnProps {
  /** What the conversation is, for screen readers: "Conversation with Ouro". Required, so the region has a name. */
  label: string;
  /** The `Message`s, oldest first. */
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

/** How close to the bottom, in pixels, counts as "at the bottom" (zoom leaves fractions). */
const AT_BOTTOM = 4;
/** How many announcements the live region keeps; older ones were already read. */
const KEEP_SPOKEN = 5;

/**
 * The "Jump to latest" pill: a raised quiet button over the newest messages, 16px text and
 * a 44px target on a coarse pointer, fading in where motion is allowed.
 */
const jumpClass =
  "press pointer-events-auto relative m-0 box-border inline-flex h-9 items-center gap-1.5 rounded-full border border-solid border-border " +
  "bg-background px-3.5 text-base font-medium text-foreground shadow-md pointer-fine:h-8 pointer-fine:text-sm whitespace-nowrap " +
  "cursor-pointer touch-manipulation outline-ring outline-offset-2 focus-visible:outline-2 focus-visible:outline-solid " +
  "hover:bg-accent hover:text-accent-foreground motion-safe:active:scale-(--ouro-press-scale) active:duration-(--ouro-duration-fast) " +
  "transition-opacity duration-(--ouro-duration-base) ease-out starting:opacity-0";

interface Spoken {
  id: number;
  text: string;
}

/**
 * A conversation: `Message`s in a scrolling, labeled region that opens at the newest one.
 * While the reader is at the bottom it follows new messages and streaming text; once they
 * scroll up, nothing moves their view, and a "Jump to latest" button appears. Each new
 * message from someone else is read to screen readers once, politely: a streamed reply
 * when it finishes. Scrolling is never announced.
 *
 * Give it a height (`className="h-96"`, or `flex-1` in a column), since it scrolls inside it.
 *
 * Use a plain list instead for messages that do not arrive live, such as an inbox.
 *
 * @group Chat
 * @see https://ourostack.github.io/ouro-ui/docs/message-list
 *
 * @example
 * <MessageList label="Conversation with Ouro" className="h-[60dvh]">
 *   {messages.map((message) => (
 *     <Message key={message.id} role={message.role} name={message.author} streaming={message.streaming}>
 *       {message.text}
 *     </Message>
 *   ))}
 * </MessageList>
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
  useLayoutEffect(() => {
    const scroller = scrollerRef.current!;
    const content = contentRef.current!;
    toBottom();
    const follow = new ResizeObserver(() => {
      if (pinned.current) toBottom();
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
      setShowJump(!pinned.current);
    };
    scroller.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      follow.disconnect();
      scroller.removeEventListener("scroll", onScroll);
    };
  }, [toBottom]);

  // Announce each message from someone else once: when it appears, or, if it is
  // streaming, when streaming ends. The history present at mount is not announced.
  useEffect(() => {
    const content = contentRef.current!;
    const seen = new WeakSet<Element>();
    const messages = () => content.querySelectorAll<HTMLElement>('[data-ouro="message"]');
    for (const message of messages()) if (message.getAttribute("aria-busy") !== "true") seen.add(message);
    const check = () => {
      const fresh: string[] = [];
      for (const message of messages()) {
        if (seen.has(message) || message.getAttribute("aria-busy") === "true") continue;
        seen.add(message);
        if (message.getAttribute("data-role") === "user") continue;
        const author = message.querySelector<HTMLElement>("[data-ouro-message-author]")!.innerText;
        const text = message.querySelector<HTMLElement>("[data-ouro-message-content]")!.innerText.trim();
        fresh.push(labelFor.current(author, text));
      }
      if (fresh.length === 0) return;
      setSpoken((previous) => [...previous, ...fresh.map((text) => ({ id: nextId.current++, text }))].slice(-KEEP_SPOKEN));
    };
    const observer = new MutationObserver(check);
    observer.observe(content, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ["aria-busy"] });
    return () => observer.disconnect();
  }, []);

  const jump = () => {
    pinned.current = true;
    toBottom();
    setShowJump(false);
    scrollerRef.current!.focus({ preventScroll: true });
  };

  return (
    <div {...rest} data-ouro="message-list" className={cn("relative m-0 box-border flex min-h-0 flex-col", className)}>
      {/* No scroll anchoring: the browser's adjustment would read as the reader scrolling up and
          unpin the list, and Safari has none, so this keeps both engines the same. */}
      <div
        ref={setScroller}
        role="region"
        aria-label={label}
        data-ouro-message-list-scroller=""
        className="min-h-0 flex-1 overflow-y-auto overscroll-contain [overflow-anchor:none] outline-ring -outline-offset-2 focus-visible:outline-2 focus-visible:outline-solid"
      >
        <div ref={contentRef} data-ouro-message-list-content="" className="flex flex-col gap-4 p-4">
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
          <button type="button" data-ouro-message-list-jump="" onClick={jump} className={jumpClass}>
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
