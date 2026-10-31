"use client";

import { Children, isValidElement, useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import type { HTMLAttributes, JSX, KeyboardEvent, ReactNode, Ref } from "react";
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
   * A key pressed while a message itself has focus, not a control inside it, before the list's
   * own keys: shortcuts on the focused message, such as 1 to 6 for quick reactions. `message` is
   * the message's element (its `id` or `data-*` attributes say which one it is). Call
   * `event.preventDefault()` to keep the list from acting on the key as well.
   * @claim "A key pressed while a message itself has focus" registry/ouro/components/ouro/message/message-list.test.tsx verify:testExists(registry/ouro/components/ouro/message/message-list.test.tsx::MessageList keyboard > hands the app a key pressed on the focused message, and not one pressed in a control inside it)
   */
  onMessageKeyDown?: ((message: HTMLElement, event: KeyboardEvent<HTMLElement>) => void) | undefined;
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

/** What Tab stops on, before the checks for a negative `tabindex`, `disabled`, `inert` and visibility. */
const tabbableSelector =
  'a[href], area[href], button, input:not([type="hidden"]), select, textarea, iframe, summary, audio[controls], video[controls], [tabindex], [contenteditable]:not([contenteditable="false"])';

/** The elements under `root` that Tab stops on, in document order. */
function tabbables(root: Element): HTMLElement[] {
  return [...root.querySelectorAll<HTMLElement>(tabbableSelector)].filter(
    (element) => element.tabIndex >= 0 && !element.matches(":disabled") && element.closest("[inert]") === null && element.checkVisibility({ visibilityProperty: true }),
  );
}

/** Whether a change added or removed a message. */
function touchesItems(record: MutationRecord): boolean {
  return [...record.addedNodes, ...record.removedNodes].some((node) => node instanceof Element && (node.matches(items) || node.querySelector(items) !== null));
}

/** Sets an attribute only when its value differs, so marking the messages again changes nothing in the page. */
function mark(element: Element, name: string, value: string): void {
  // Stryker disable next-line ConditionalExpression: setting the value an attribute already has changes nothing in the page.
  if (element.getAttribute(name) !== value) element.setAttribute(name, value);
}

/** The messages in `content`, leaving out any message inside another one. */
function topItems(content: Element): HTMLElement[] {
  return [...content.querySelectorAll<HTMLElement>(items)].filter((item) => !content.contains(item.parentElement!.closest(items)));
}

/** Space kept between a message brought into view by the keyboard and the list's edge, so its focus ring shows. */
const EDGE = 8;
/** How far an arrow key scrolls through a message taller than the list, in pixels. */
const LINE = 40;

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

/**
 * The focused message's focus ring, drawn by the list on the message, Ouro's or an app's. Its
 * corners round on Ouro's `Message`, whose box is bare; an app's message keeps its own corners.
 */
const itemRing =
  "[&_[data-ouro-control=message-list][data-ouro-part=item]]:outline-ring [&_[data-ouro-control=message-list][data-ouro-part=item]]:outline-offset-2 " +
  "[&_[data-ouro-control=message-list][data-ouro-part=item]:focus-visible]:outline-2 [&_[data-ouro-control=message-list][data-ouro-part=item]:focus-visible]:outline-solid " +
  "[&_[data-ouro=message][data-ouro-part=item]]:rounded-lg";

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
 * The messages are one Tab stop. Tab lands on the newest message in view (or the one focused
 * last, while it shows), and the arrow keys, Home, End, Page Up and Page Down move between
 * messages, with a focus ring; a message taller than the list scrolls through first. The right
 * arrow (the left one, right to left) goes into the focused message's toolbar, such as its action
 * bar, else its first control, and Tab goes through its controls. Tab never stops on the other
 * messages' controls, so the next Tab after a message's own controls leaves the list. A new
 * message never takes focus, and when the focused message goes, focus goes to the one now in its
 * place. Each message that is an article carries its place among them for screen readers
 * (`aria-posinset`, `aria-setsize`). `onMessageKeyDown` adds keys of your own on the focused
 * message, such as 1 to 6 for quick reactions.
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
 * <MessageList
 *   label="Team chat"
 *   className="flex-1"
 *   onMessageKeyDown={(message, event) => {
 *     const reaction = quickReactions[Number(event.key) - 1];
 *     if (reaction) react(message.id, reaction);
 *   }}
 * >
 *   {posts.map((post) => (
 *     <article key={post.id} id={post.id} data-ouro-message-list-item="" data-role={post.mine ? "user" : "assistant"}>
 *       <span data-ouro-message-author="">{post.author}</span>
 *       <p data-ouro-message-content="">{post.text}</p>
 *     </article>
 *   ))}
 * </MessageList>
 * @claim "Your own message components work too" registry/ouro/components/ouro/message/message-list.test.tsx verify:testExists(registry/ouro/components/ouro/message/message-list.test.tsx::MessageList > keeps the reader's place among an app's own messages marked data-ouro-message-list-item, and announces them as it does Messages)
 * @claim "A conversation: `Message`s in a scrolling" registry/ouro/components/ouro/message/message-list.test.tsx verify:testExists(registry/ouro/components/ouro/message/message-list.test.tsx::MessageList > is a named region that opens at the newest message, which is its Tab stop)
 * @claim "The messages are one Tab stop" registry/ouro/components/ouro/message/message-list.test.tsx verify:testExists(registry/ouro/components/ouro/message/message-list.test.tsx::MessageList keyboard > is one Tab stop: Tab lands on the newest message, goes through its controls, and leaves the list)
 * @claim "The messages are one Tab stop" registry/ouro/components/ouro/message/message-list.test.tsx verify:testExists(registry/ouro/components/ouro/message/message-list.test.tsx::MessageList keyboard > keeps focus where it is when a message arrives, and the Tab stop on the message focused last while it shows)
 * @claim "and the arrow keys, Home, End, Page Up" registry/ouro/components/ouro/message/message-list.test.tsx verify:testExists(registry/ouro/components/ouro/message/message-list.test.tsx::MessageList keyboard > moves between messages with the arrow keys, Home, End, Page Up and Page Down, with a focus ring)
 * @claim "and the arrow keys, Home, End, Page Up" registry/ouro/components/ouro/message/message-list.test.tsx verify:testExists(registry/ouro/components/ouro/message/message-list.test.tsx::MessageList keyboard > moves a page at a time to the next message when the next starts more than a list's height away)
 * @claim "a message taller than the list scrolls" registry/ouro/components/ouro/message/message-list.test.tsx verify:testExists(registry/ouro/components/ouro/message/message-list.test.tsx::MessageList keyboard > scrolls through a message taller than the list, a line or a page at a time, before moving on)
 * @claim "The right arrow (the left one, right to" registry/ouro/components/ouro/message/message-list.test.tsx verify:testExists(registry/ouro/components/ouro/message/message-list.test.tsx::MessageList keyboard > goes into the focused message's toolbar with the right arrow, else its first control, and the left arrow right to left)
 * @claim "Tab never stops on the other" registry/ouro/components/ouro/message/message-list.test.tsx verify:testExists(registry/ouro/components/ouro/message/message-list.test.tsx::MessageList keyboard > reaches a control between messages in the Tab order, and passes over the other messages' controls)
 * @claim "A new message never takes focus" registry/ouro/components/ouro/message/message-list.test.tsx verify:testExists(registry/ouro/components/ouro/message/message-list.test.tsx::MessageList keyboard > keeps focus where it is when a message arrives, and the Tab stop on the message focused last while it shows)
 * @claim "and when the focused message goes" registry/ouro/components/ouro/message/message-list.test.tsx verify:testExists(registry/ouro/components/ouro/message/message-list.test.tsx::MessageList keyboard > moves focus to the message now in the place of a focused message that goes, and leaves a control that goes from a message to the app)
 * @claim "Each message that is an article carries" registry/ouro/components/ouro/message/message-list.test.tsx verify:testExists(registry/ouro/components/ouro/message/message-list.test.tsx::MessageList keyboard > gives each message its place among them for screen readers, and keeps an app's own)
 * @claim "`onMessageKeyDown` adds keys of your own" registry/ouro/components/ouro/message/message-list.test.tsx verify:testExists(registry/ouro/components/ouro/message/message-list.test.tsx::MessageList keyboard > hands the app a key pressed on the focused message, and not one pressed in a control inside it)
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
    onMessageKeyDown,
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
  const keyFor = useRef(onMessageKeyDown);
  useLayoutEffect(() => {
    labelFor.current = newMessageLabel;
    keyFor.current = onMessageKeyDown;
  });
  // The list's ends, which Tab passes through to leave the messages behind (see the keyboard effect).
  const startRef = useRef<HTMLSpanElement | null>(null);
  const endRef = useRef<HTMLSpanElement | null>(null);
  // Moves focus to a message, making it the Tab stop; set by the keyboard effect.
  const moveTo = useRef<(item: HTMLElement) => void>(undefined);
  const keyHandler = useRef<(event: KeyboardEvent<HTMLElement>) => void>(undefined);
  // With messages, a message is the Tab stop and the region is not; without, the region is while it scrolls.
  // Stryker disable next-line ArrowFunction,ConditionalExpression,EqualityOperator: a first guess only; the keyboard effect counts the messages before the first paint.
  const [hasItems, setHasItems] = useState(() => Children.count(children) > 0);

  const keyboardRef = useKeyboardScrollable<HTMLDivElement>(!hasItems);
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
    const matters = (record: MutationRecord) => record.type === "attributes" || touchesItems(record);
    const observer = new MutationObserver((records) => {
      if (records.some(matters)) check();
    });
    observer.observe(content, { childList: true, subtree: true, attributes: true, attributeFilter: ["aria-busy"] });
    return () => observer.disconnect();
  }, []);

  // The keyboard: the messages are one Tab stop (a roving tabindex). The current message is in the
  // Tab order and the rest are not; the arrow keys, Home, End, Page Up and Page Down move between them, and the right
  // arrow (the left one, right to left) goes into the focused message's toolbar or first control.
  // Tab goes on through the current message's controls and any between the messages, never the
  // other messages' controls, then leaves the list; arriving by Tab lands on the first of those
  // stops, and arriving by Shift+Tab on the current message. While focus is elsewhere, the current
  // message is the one focus was last in while it is in view, else the newest wholly in view, so
  // arriving does not scroll, and a new message never takes focus. When the focused message goes,
  // focus goes to the message now in its place.
  useLayoutEffect(() => {
    const scroller = scrollerRef.current!;
    const content = contentRef.current!;
    const doc = scroller.ownerDocument;
    let current: HTMLElement | null = null;
    // The message focus was last in, and its place among the messages.
    let last: HTMLElement | null = null;
    let lastIndex = 0;
    // The message focus is in, until focus leaves it.
    let focused: HTMLElement | null = null;
    // A Tab press in progress anywhere in the page (true for Shift+Tab), and where the list was
    // scrolled to before it: the browser scrolls to what it focuses before the list sends focus on.
    let tabbing: boolean | null = null;
    let tabTop = 0;
    // The positions this list wrote, so an app's own aria-posinset stands.
    const written = new WeakMap<Element, string>();

    // The message an element is in, or is, among this list's messages.
    const itemOf = (node: Element, list = topItems(content)): HTMLElement | null => list.find((item) => item.contains(node)) ?? null;
    // Whether any of a message shows in the list's view, or, `whole`, all of it.
    const shows = (item: Element, whole = false) => {
      const box = item.getBoundingClientRect();
      const view = scroller.getBoundingClientRect();
      // Stryker disable next-line EqualityOperator: a message whose edge meets the list's edge to the pixel counts either way.
      return whole ? box.top >= view.top && box.bottom <= view.bottom : box.bottom > view.top && box.top < view.bottom;
    };
    const setCurrent = (item: HTMLElement | null) => {
      // Stryker disable next-line ConditionalExpression: the same message would take -1 and then 0 again, as it was.
      if (current !== item) current?.setAttribute("tabindex", "-1");
      current = item;
      item?.setAttribute("tabindex", "0");
    };
    // Scrolls the list, and only the list, until the element shows, with room for its focus ring:
    // its top when it is taller than the list.
    const reveal = (element: Element) => {
      const box = element.getBoundingClientRect();
      const view = scroller.getBoundingClientRect();
      // Stryker disable next-line EqualityOperator: at the margin to the pixel, the message is where scrolling would put it.
      const atTop = box.top < view.top + EDGE || box.height > view.height - 2 * EDGE;
      // Stryker disable next-line EqualityOperator: at the margin to the pixel, the message is where scrolling would put it.
      const atBottom = box.bottom > view.bottom - EDGE;
      scroller.scrollTop += atTop ? box.top - view.top - EDGE : atBottom ? box.bottom - view.bottom + EDGE : 0;
    };
    // The message takes the Tab stop as it takes focus, in focusIn.
    const focusOn = (item: HTMLElement) => item.focus({ preventScroll: true });
    const move = (item: HTMLElement) => {
      focusOn(item);
      reveal(item);
    };
    moveTo.current = focusOn;
    // What Tab stops on in the list: all but the controls of the messages that are not current.
    const stops = () => {
      const list = topItems(content);
      return tabbables(scroller).filter((element) => [null, current].includes(itemOf(element, list)));
    };

    const place = (list: HTMLElement[]) => {
      if (current?.isConnected && scroller.contains(doc.activeElement)) return;
      const whole = (item: Element) => shows(item, true);
      setCurrent(last?.isConnected && shows(last) ? last : (list.findLast(whole) ?? list.findLast((item) => shows(item)) ?? list.at(-1) ?? null));
    };
    // After React's commit, so it reads no layout unless the Tab stop went: reading where messages
    // are here would lay the page out before the browser does, at every new message.
    const sync = (changed: boolean) => {
      if (focused?.isConnected === false && doc.activeElement === doc.body) {
        focused = null;
        const left = topItems(content);
        const at = Math.min(lastIndex, left.length - 1);
        left.slice(at, at + 1).forEach(move);
      }
      if (!changed) return;
      const list = topItems(content);
      list.forEach((item, index) => {
        // Focusable from code and by a click, in the Tab order only as the current message.
        if (item !== current) mark(item, "tabindex", "-1");
        mark(item, "data-ouro-control", "message-list");
        mark(item, "data-ouro-part", "item");
        // Only an article takes a position (ARIA allows it there), and one the app set stands.
        const own = item.getAttribute("aria-posinset");
        if (!item.matches('article:not([role]), [role="article"]') || (own !== null && own !== written.get(item))) return;
        written.set(item, String(index + 1));
        mark(item, "aria-posinset", String(index + 1));
        mark(item, "aria-setsize", String(list.length));
      });
      // Stryker disable next-line ConditionalExpression: placing it again picks the same message, since a scroll places it too; this only spares reading the layout.
      if (!current?.isConnected) place(list);
      setHasItems(list.length > 0);
    };

    const focusIn = (event: FocusEvent) => {
      const target = event.target as HTMLElement;
      if (tabbing !== null && current !== null && !scroller.contains(event.relatedTarget as Node | null)) {
        // None when the current message cannot take focus (the app hid it): then where the browser put it.
        const all = stops();
        const end = all.at(-1) ?? null;
        const goal = (tabbing ? (current.contains(end) ? current : end) : all[0]) ?? target;
        if (goal !== target) {
          scroller.scrollTop = tabTop;
          // Stryker disable next-line ObjectLiteral,BooleanLiteral: reveal, next, scrolls the list to the same place.
          goal.focus({ preventScroll: true });
          reveal(goal);
          return;
        }
      }
      // Only a message that goes moves focus: a control that goes from a message (a menu's button
      // swapped for its trigger) is its component's to put focus back.
      const item = itemOf(target);
      focused = item;
      if (item === null) return;
      setCurrent(item);
      last = item;
      lastIndex = topItems(content).indexOf(item);
    };
    const focusOut = (event: FocusEvent) => {
      if (scroller.contains(event.relatedTarget as Node | null)) return;
      // Focus left. When it left because what had it was removed, `sync` has already moved it, as
      // the mutation observer runs before this timer.
      setTimeout(() => (focused = null));
    };

    const tab = (event: globalThis.KeyboardEvent) => {
      const from = event.target as HTMLElement;
      const back = event.shiftKey;
      const ahead = (element: Element) => (from.compareDocumentPosition(element) & (back ? Node.DOCUMENT_POSITION_PRECEDING : Node.DOCUMENT_POSITION_FOLLOWING)) !== 0;
      const pick = (list: HTMLElement[]) => (back ? list.findLast(ahead) : list.find(ahead));
      const next = pick(stops());
      if (next === undefined) {
        // Past the last stop: from the list's edge, the browser's own Tab goes on beyond the list.
        // Stryker disable next-line ObjectLiteral,BooleanLiteral: the edges sit outside the scrolling content, so focusing one scrolls nothing.
        (back ? startRef : endRef).current!.focus({ preventScroll: true });
        return;
      }
      // Stryker disable next-line ConditionalExpression: focusing what the browser would focus, and revealing it, ends in the same place.
      if (next === pick(tabbables(scroller))) return;
      event.preventDefault();
      // Stryker disable next-line ObjectLiteral,BooleanLiteral: reveal, next, scrolls the list to the same place.
      next.focus({ preventScroll: true });
      reveal(next);
    };
    // From React's onKeyDown, so it runs after the handlers of the controls inside, and sees what they took.
    keyHandler.current = (reactEvent: KeyboardEvent<HTMLElement>) => {
      const event = reactEvent.nativeEvent;
      if (event.defaultPrevented || !scroller.contains(event.target as Node)) return;
      if (event.key === "Tab") return tab(event);
      const item = event.target as HTMLElement;
      // A key in a control inside a message is the control's.
      if (itemOf(item) !== item) return;
      keyFor.current?.(item, reactEvent);
      if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
      const list = topItems(content);
      const at = list.indexOf(item);
      const box = item.getBoundingClientRect();
      const view = scroller.getBoundingClientRect();
      let goal: HTMLElement | undefined;
      switch (event.key) {
        case getComputedStyle(item).direction === "rtl" ? "ArrowLeft" : "ArrowRight": {
          const inside = tabbables(item);
          goal = inside.find((element) => element.closest('[role="toolbar"]') !== null) ?? inside[0];
          if (goal === undefined) return;
          // Stryker disable next-line all: the messages wrap, so the list has nothing to scroll sideways that the arrow could move.
          event.preventDefault();
          goal.focus();
          return;
        }
        case "Home":
          goal = list[0];
          break;
        case "End":
          goal = list.at(-1);
          break;
        case "ArrowDown":
        case "PageDown":
        case "ArrowUp":
        case "PageUp": {
          const forward = event.key.endsWith("Down");
          const paging = event.key.startsWith("Page");
          // A message taller than the list scrolls through first, a line or a page at a time.
          const beyond = forward ? box.bottom - view.bottom + EDGE : view.top + EDGE - box.top;
          // Stryker disable next-line EqualityOperator: a pixel past the edge is a rounding, not more message.
          if (beyond > 1) {
            event.preventDefault();
            scroller.scrollTop += (forward ? 1 : -1) * Math.min(beyond, paging ? view.height - LINE : LINE);
            return;
          }
          // A page away: the farthest message that starts within a list's height of this one, else the next.
          const step = forward ? 1 : -1;
          const near = list.filter(
            // Stryker disable next-line EqualityOperator: a message that starts exactly a list's height away counts either way.
            (other, index) => (forward ? index > at : index < at) && Math.abs(other.getBoundingClientRect().top - box.top) <= view.height,
          );
          goal = paging ? (near.at(forward ? -1 : 0) ?? list[at + step]) : list[at + step];
          break;
        }
        default:
          return;
      }
      event.preventDefault();
      if (goal !== undefined) move(goal);
    };
    const tabKey = (event: globalThis.KeyboardEvent) => {
      if (event.key !== "Tab") return;
      tabbing = event.shiftKey;
      tabTop = scroller.scrollTop;
      setTimeout(() => (tabbing = null));
    };
    const scrolled = () => place(topItems(content));

    sync(true);
    const observer = new MutationObserver((records) => sync(records.some(touchesItems)));
    observer.observe(content, { childList: true, subtree: true });
    scroller.addEventListener("focusin", focusIn);
    scroller.addEventListener("focusout", focusOut);
    // Stryker disable next-line ObjectLiteral,BooleanLiteral: passive only lets the browser scroll without waiting for this listener.
    scroller.addEventListener("scroll", scrolled, { passive: true });
    doc.addEventListener("keydown", tabKey, true);
    // Stryker disable next-line all: once the list is gone, nothing reads what these listeners would change; removing them frees memory only.
    return () => (observer.disconnect(), scroller.removeEventListener("focusin", focusIn), scroller.removeEventListener("focusout", focusOut), scroller.removeEventListener("scroll", scrolled), doc.removeEventListener("keydown", tabKey, true));
  },
  // Stryker disable next-line ArrayDeclaration: any list that never changes runs it once, as this one does.
  []);

  // A list that gains its first message stops being a Tab stop itself; one with focus hands it to the message.
  useLayoutEffect(() => {
    const scroller = scrollerRef.current!;
    if (!hasItems) return;
    scroller.removeAttribute("tabindex");
    if (scroller.ownerDocument.activeElement === scroller) moveTo.current!(topItems(contentRef.current!).at(-1)!);
  }, [hasItems]);

  const jump = () => {
    pinned.current = true;
    toBottom();
    setShowJump(false);
    // The button goes, so focus goes to the newest message (or to the list, without messages), not to <body>.
    const newest = topItems(contentRef.current!).at(-1);
    if (newest) return moveTo.current!(newest);
    // Stryker disable next-line ObjectLiteral,BooleanLiteral: the list is at the bottom already, so focusing it scrolls nothing.
    scrollerRef.current!.focus({ preventScroll: true });
  };

  return (
    <div {...rest} data-ouro="message-list" className={cn("relative box-border flex min-h-0 flex-col", itemRing, className)}>
      {/* No browser scroll anchoring; the layout effect above keeps the reader's place instead. */}
      <div
        ref={setScroller}
        role="region"
        aria-label={label}
        data-ouro-message-list-scroller=""
        data-ouro-control="message-list"
        data-ouro-part="scroller"
        onKeyDown={(event) => keyHandler.current!(event)}
        className="min-h-0 flex-1 overflow-y-auto overscroll-contain [overflow-anchor:none] outline-ring -outline-offset-2 focus-visible:outline-2 focus-visible:outline-solid forced-colors:[&[tabindex='0']]:outline-1 forced-colors:[&[tabindex='0']]:outline-solid forced-colors:[&[tabindex='0']]:-outline-offset-1"
      >
        <span ref={startRef} tabIndex={-1} aria-hidden="true" data-ouro-message-list-edge="" className="absolute size-0 outline-none" />
        <div ref={contentRef} data-ouro-message-list-content="" className="flex flex-col gap-4 p-4 [&>[data-continued]]:-mt-3">
          {children}
        </div>
        <span ref={endRef} tabIndex={-1} aria-hidden="true" data-ouro-message-list-edge="" className="absolute size-0 outline-none" />
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
