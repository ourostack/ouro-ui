"use client";

import { Children, isValidElement, useCallback, useEffect, useImperativeHandle, useLayoutEffect, useRef, useState } from "react";
import type { HTMLAttributes, JSX, Key, KeyboardEvent, ReactNode, Ref } from "react";
import { useAppearanceClassNameCheck } from "@/registry/ouro/lib/ouro/class-name-check";
import { cn } from "@/registry/ouro/lib/ouro/cn";
import { halveShown } from "@/registry/ouro/lib/ouro/halve";
import { useMergedRef } from "@/registry/ouro/lib/ouro/refs";
import { navigationKey } from "@/registry/ouro/lib/ouro/navigation-key";
import { springAt, type SpringState } from "@/registry/ouro/lib/ouro/spring";
import { TouchTarget } from "@/registry/ouro/lib/ouro/touch-target";
import { useDevWarnings } from "@/registry/ouro/lib/ouro/use-dev-messages";
import { useKeyboardScrollable } from "@/registry/ouro/lib/ouro/use-keyboard-scrollable";
import { useOuro, type OuroMotion } from "@/registry/ouro/lib/ouro/use-ouro";

/** The props MessageList adds to the `<div>` attributes it passes through. */
export interface MessageListOwnProps {
  /** What the conversation is, for screen readers: "Conversation with Ouro". Required, so the region has a name. */
  label: string;
  /** The `Message`s, oldest first, or your own message components marked `data-ouro-message-list-item` (see {@link MessageList}). */
  children: ReactNode;
  /** The button that appears once the reader scrolls up, for other languages. @default "Jump to latest" */
  jumpLabel?: string | undefined;
  /**
   * The `id` of the message to open at, such as one found by search or a link to it, or the `key` of the child that holds
   * it (the message's own id, where a row component of yours takes no `id`). The list opens
   * with that message in the middle of its view, before it first draws, so the newest is never shown
   * first, and it follows new messages only once the reader reaches the end. The list reads it when
   * it first has messages, so it can come with them; a message it does not hold, or the newest,
   * opens at the end, and a later change moves nothing.
   * @claim "or the `key` of the child that holds it" registry/ouro/components/ouro/message/message-list.windowing.test.tsx verify:testExists(registry/ouro/components/ouro/message/message-list.windowing.test.tsx::MessageList windowing > reveals a row component that takes no id by its key, and opens at one by its key, resolving once it is in place)
   * @claim "The list opens with that message in" registry/ouro/components/ouro/message/message-list.test.tsx verify:testExists(registry/ouro/components/ouro/message/message-list.test.tsx::MessageList > opens at the message initialAnchor names, never drawing the newest first, and stops following new messages)
   * @claim "The list reads it when it first" registry/ouro/components/ouro/message/message-list.test.tsx verify:testExists(registry/ouro/components/ouro/message/message-list.test.tsx::MessageList > opens at initialAnchor when it comes with the first messages, after the list mounted empty)
   * @claim "a message it does not hold" registry/ouro/components/ouro/message/message-list.test.tsx verify:testExists(registry/ouro/components/ouro/message/message-list.test.tsx::MessageList > opens at the newest message when initialAnchor names no message in the list, or the newest itself)
   */
  initialAnchor?: string | undefined;
  /**
   * Which conversation the messages are, such as its id. Change it with the other conversation's messages, or before they
   * come (as an app that keeps the last messages while it fetches does): the list opens that conversation at its newest
   * message as they come, whatever keys they have, and moves nothing while the last one's still show. While it stays the
   * same, nothing the messages do counts as a switch: keys swapped for the server's, the newest ones regenerated or removed.
   * The first one named for messages the list already holds names them, and moves nothing. Messages that come before
   * their conversation is named are taken for the last one's, and the name that follows them is taken for theirs, opening
   * nothing; and a conversation whose
   * messages carry exactly the last one's keys (keyed by place, as many of them) can't be told from it until they change,
   * so key messages by their own ids. Without it, the list takes messages that share no `key` with the ones it held for
   * another conversation, so it misses a switch between conversations whose messages share keys, and takes a short
   * conversation whose every message gets a new key at once for another one.
   * @claim "While it stays the same, nothing the" registry/ouro/components/ouro/message/message-list.test.tsx verify:testExists(registry/ouro/components/ouro/message/message-list.test.tsx::MessageList switching conversations > takes a switch from conversation alone: one whose messages share keys with the last is a switch, and messages re-keyed in the same one are not)
 * @claim "While it stays the same, nothing the" registry/ouro/components/ouro/message/message-list.test.tsx verify:testExists(registry/ouro/components/ouro/message/message-list.test.tsx::MessageList switching conversations > takes removing the newest five, as a regenerated turn does, for the same conversation)
 * @claim "Change it with the other conversation's" registry/ouro/components/ouro/message/message-list.test.tsx verify:testExists(registry/ouro/components/ouro/message/message-list.test.tsx::MessageList switching conversations > switches when the conversation is named before its messages come, as an app that keeps the last messages while it fetches does)
   * @claim "Change it with the other conversation's" registry/ouro/components/ouro/message/message-list.test.tsx verify:testExists(registry/ouro/components/ouro/message/message-list.test.tsx::MessageList switching conversations > takes a switch from conversation alone: one whose messages share keys with the last is a switch, and messages re-keyed in the same one are not)
   * @claim "The first one named for messages the" registry/ouro/components/ouro/message/message-list.test.tsx verify:testExists(registry/ouro/components/ouro/message/message-list.test.tsx::MessageList switching conversations > adopts a conversation first named for the messages it holds, leaving a scrolled-up reader where they are)
   * @claim "Messages that come before their conversation" registry/ouro/components/ouro/message/message-list.test.tsx verify:testExists(registry/ouro/components/ouro/message/message-list.test.tsx::MessageList switching conversations > adopts a name that comes after its messages, so switching back in one commit opens the last conversation at its newest)
   * @claim "Messages that come before their conversation" registry/ouro/components/ouro/message/message-list.test.tsx verify:testExists(registry/ouro/components/ouro/message/message-list.test.tsx::MessageList switching conversations > takes messages that come before their conversation is named for the last one's, and opens nothing when it is named after them)
   * @claim "Without it, the list takes messages that" registry/ouro/components/ouro/message/message-list.test.tsx verify:testExists(registry/ouro/components/ouro/message/message-list.test.tsx::MessageList switching conversations > keeps the reader's place, the messages and focus when the newest three get new keys in place, while scrolled up)
   */
  conversation?: Key | undefined;
  /**
   * Whether older messages are loading above: a small "Loading older messages" shows over the
   * top of the list, and screen readers hear it once. It sits over the messages, not among them,
   * so starting and ending it moves no message. At the very top it covers the first message
   * unless `hasOlder` keeps room for it. Fetch older pages ahead of the reader, not when they
   * reach the top: the next older page as soon as the one before it has arrived, while they are
   * still screens away. Then this shows only when they get to the top first.
   * @claim "Whether older messages are loading above" registry/ouro/components/ouro/message/message-list.test.tsx verify:testExists(registry/ouro/components/ouro/message/message-list.test.tsx::MessageList > shows older messages loading over the top of the list, moving no message as it starts or ends)
   * @claim "It sits over the messages, not" registry/ouro/components/ouro/message/message-list.test.tsx verify:testExists(registry/ouro/components/ouro/message/message-list.test.tsx::MessageList > shows older messages loading over the top of the list, moving no message as it starts or ends)
   * @claim "At the very top it covers" registry/ouro/components/ouro/message/message-list.test.tsx verify:testExists(registry/ouro/components/ouro/message/message-list.test.tsx::MessageList > keeps room above the first message while hasOlder, so loading older messages covers no message or focus ring and moves nothing)
   */
  loadingOlder?: boolean | undefined;
  /**
   * Whether older messages may still load above, until the reader reaches the start of the
   * conversation. While it is true the list keeps room above the first message, where "Loading
   * older messages" shows, so at the top it covers no message or focus ring, and nothing moves as
   * loading starts. Set it to `false` once there is nothing older: the room stays until it has left
   * the view, or the list is at its end, and then goes without moving a message.
   * @default false
   * @claim "so at the top it covers" registry/ouro/components/ouro/message/message-list.test.tsx verify:testExists(registry/ouro/components/ouro/message/message-list.test.tsx::MessageList > keeps room above the first message while hasOlder, so loading older messages covers no message or focus ring and moves nothing)
   * @claim "the room stays until it has" registry/ouro/components/ouro/message/message-list.test.tsx verify:testExists(registry/ouro/components/ouro/message/message-list.test.tsx::MessageList > keeps the room once hasOlder ends while it shows, and drops it without moving a message once it leaves the view)
   * @claim "the room stays until it has" registry/ouro/components/ouro/message/message-list.test.tsx verify:testExists(registry/ouro/components/ouro/message/message-list.test.tsx::MessageList > drops the room at once when hasOlder ends at the list's end or with the room out of view, and adds it without moving a message)
   */
  hasOlder?: boolean | undefined;
  /** What shows while older messages load, for other languages. @default "Loading older messages" */
  loadingOlderLabel?: string | undefined;
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
   * Whether Page Up and Page Down on a focused message move a page through the messages, as ⌥↑ and
   * ⌥↓ do on a Mac. With `false` the list leaves those keys alone: it neither acts on them nor calls
   * `preventDefault()`, so an app's own shortcut on them, such as ⌥↓ for the next conversation, gets
   * them as pressed, and the browser scrolls the list. The other keys still move between messages.
   * @default true
   * @claim "With `false` the list leaves those" registry/ouro/components/ouro/message/message-list.test.tsx verify:testExists(registry/ouro/components/ouro/message/message-list.test.tsx::MessageList keyboard > leaves Page Up and Page Down, and ⌥↑ and ⌥↓ on a Mac, to the app with pageKeys={false}, and moves with the other keys)
   * @claim "The other keys still move between" registry/ouro/components/ouro/message/message-list.test.tsx verify:testExists(registry/ouro/components/ouro/message/message-list.test.tsx::MessageList keyboard > leaves Page Up and Page Down, and ⌥↑ and ⌥↓ on a Mac, to the app with pageKeys={false}, and moves with the other keys)
   */
  pageKeys?: boolean | undefined;
  /**
   * Whether the messages spring as the reader scrolls, as in a phone's messages app: each one
   * trails the scroll a little, the farther from where the reader scrolls (the finger, the
   * pointer, the focused message) the more, and catches up on a spring. A fling, or a push past
   * either end, spreads the messages apart and they settle back. It draws with `transform` alone:
   * the list's scroll position never moves for it, and at rest no message has a transform. Only the
   * messages in or near view move, so a long conversation costs what a short one does. It runs for
   * the reader's own wheel, trackpad, touch and keys, never for scrolling the list or your code
   * does (following new messages, setting `scrollTop`), and never with reduced motion (`prefers-reduced-motion: reduce`, or `OuroProvider`'s `motion`).
   * @default true
   * @claim "each one trails the scroll a little" registry/ouro/components/ouro/message/message-list.springs.test.tsx verify:testExists(registry/ouro/components/ouro/message/message-list.springs.test.tsx::MessageList springs > trails the wheel the more the farther a message is from the pointer, and settles back to no transform)
   * @claim "A fling, or a push past" registry/ouro/components/ouro/message/message-list.springs.test.tsx verify:testExists(registry/ouro/components/ouro/message/message-list.springs.test.tsx::MessageList springs > spreads the messages apart on a push past either end, and draws them back)
   * @claim "the list's scroll position never moves" registry/ouro/components/ouro/message/message-list.springs.test.tsx verify:testExists(registry/ouro/components/ouro/message/message-list.springs.test.tsx::MessageList springs > never changes the scroll position, and keeps the reader's place by where messages are laid out)
   * @claim "Only the messages in or near" registry/ouro/components/ouro/message/message-list.springs.test.tsx verify:testExists(registry/ouro/components/ouro/message/message-list.springs.test.tsx::MessageList springs > moves only the messages in or near view, reading as few in a thousand as in fifty, on one frame loop)
   * @claim "It runs for the reader's own" registry/ouro/components/ouro/message/message-list.springs.test.tsx verify:testExists(registry/ouro/components/ouro/message/message-list.springs.test.tsx::MessageList springs > follows the keys, with the focused message where the scroll starts, and its focus ring moves with it)
   * @claim "never for scrolling the list or" registry/ouro/components/ouro/message/message-list.springs.test.tsx verify:testExists(registry/ouro/components/ouro/message/message-list.springs.test.tsx::MessageList springs > never springs for scrolling the reader did not do: new messages it follows, or scrollTop set in code)
   * @claim "and never with reduced motion" registry/ouro/components/ouro/message/message-list.springs.test.tsx verify:testExists(registry/ouro/components/ouro/message/message-list.springs.test.tsx::MessageList springs > moves nothing with reduced motion, or with springy={false})
   */
  springy?: boolean | undefined;
  /**
   * The widest the conversation gets, in CSS pixels, centred in a wider list (`960` is 60rem at
   * the default font size), so in a wide window the user's own messages stay near the others'
   * and the eye never crosses an empty field between them. The list itself still fills its
   * place, so it scrolls from anywhere across it. Leave it out for messages as wide as the list.
   * @claim "centred in a wider list" registry/ouro/components/ouro/message/message-list.test.tsx verify:testExists(registry/ouro/components/ouro/message/message-list.test.tsx::MessageList > centres the conversation at maxWidth in a wider list, the user's own messages with it, and fills a narrower one)
   */
  maxWidth?: number | undefined;
  /**
   * Whether a long conversation draws only the messages near its view. Above 60 children the list
   * draws those within a screen or 800 pixels of the view, whichever is more, the newest, the one with focus, and any
   * still streaming, each measured as it draws, with space for the rest kept above and below, so a long
   * conversation opens and redraws in about the time a screenful does. The browser's find in page, and
   * code that reads messages from the page, see only the messages drawn: search your own messages and
   * call `actionsRef.current.reveal(id)` to show a match. Set `false` to keep every message in the page.
   * A list the reader scrolled up in that takes older and newer messages in one commit renders no more than 60 of the
   * children it drew before, and the 20 newest, before it finds the view; scrolling up through rows never drawn moves
   * what the reader looks at by under a pixel in every frame; and a list opens at its end with no frame moving it more
   * than a pixel.
   * @default true
   * @claim "renders no more than 60 of the" test/message-list-windowing.bench.test.tsx verify:testExists(test/message-list-windowing.bench.test.tsx::MessageList older page > renders about a fifth of the rows, not the list again, when a short list the reader scrolled up in takes 200 older rows and 360 newer in one commit)
   * @claim "moves what the reader looks at by under a pixel" registry/ouro/components/ouro/message/message-list.windowing.test.tsx verify:testExists(registry/ouro/components/ouro/message/message-list.windowing.test.tsx::MessageList windowing > moves no row the reader looks at by a pixel in any frame, scrolling up through 100 rows never drawn whose heights differ from the estimate by up to 40px)
   * @claim "opens at its end with no frame moving it more" registry/ouro/components/ouro/message/message-list.windowing.test.tsx verify:testExists(registry/ouro/components/ouro/message/message-list.windowing.test.tsx::MessageList windowing > opens a conversation of 300 rows of varied heights at its end, moving the view and the row at its top by no more than a pixel in any frame)
   * @claim "Above 60 children the list draws" registry/ouro/components/ouro/message/message-list.windowing.test.tsx verify:testExists(registry/ouro/components/ouro/message/message-list.windowing.test.tsx::MessageList windowing > draws only the messages near the view of a long conversation, in a list as tall as all of them)
   * @claim "Above 60 children the list draws" registry/ouro/components/ouro/message/message-list.tsx verify:fileLine(registry/ouro/components/ouro/message/message-list.tsx, /const OVERSCAN = 800;/) verify:fileLine(registry/ouro/components/ouro/message/message-list.tsx, /Math\.max\(OVERSCAN, scroller\.clientHeight\)/)
   * @claim "Set `false` to keep every message" registry/ouro/components/ouro/message/message-list.windowing.test.tsx verify:testExists(registry/ouro/components/ouro/message/message-list.windowing.test.tsx::MessageList windowing > keeps every message in the page with windowing={false})
   */
  windowing?: boolean | undefined;
  /**
   * A map the list writes the heights of its children into, under a child's key and the list's width in CSS pixels, rounded
   * to a multiple of `BUCKET`, and reads before it measures. Keep one in your app, by conversation, and hand it to each list that shows the conversation:
   * a list that mounts again with it is as tall, from its first commit, as the list before it was, so it opens
   * with no row moving. Leave it out and the list keeps its own for as long as it lives.
   * @claim "a list that mounts again with it is" registry/ouro/components/ouro/message/message-list.windowing.test.tsx verify:testExists(registry/ouro/components/ouro/message/message-list.windowing.test.tsx::MessageList windowing > keeps the height of every row in a heightCache the app hands in, so a list that mounts again with it is as tall, in its first commit, as it was)
   */
  heightCache?: Map<string, number> | undefined;
  /**
   * Gets the list's actions: `reveal(id)` brings a message into view, drawing it first if it is not
   * drawn, for a quote, a link to a message, or find in chat; `jumpToNewest()` goes to the end and
   * follows new messages again. See {@link MessageListActions}.
   */
  actionsRef?: Ref<MessageListActions> | undefined;
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

/** Where `reveal` puts a message: in the middle of the view, at its top, or scrolled only as far as it needs. */
export type MessageListRevealBlock = "center" | "start" | "nearest";

/** How `reveal` shows a message. */
export interface MessageListRevealOptions {
  /** Whether the message takes focus, as for a quote the reader pressed. @default false */
  focus?: boolean | undefined;
  /** Where in the view it goes. @default "center" */
  block?: MessageListRevealBlock | undefined;
}

/**
 * What a MessageList does on request, through its `actionsRef`.
 *
 * @example
 * const actions = useRef<MessageListActions>(null);
 * <Message quote={{ author: "Ana", excerpt: "Lunch?", onActivate: () => void actions.current?.reveal("m-41", { focus: true }) }}>Yes</Message>
 */
export interface MessageListActions {
  /**
   * Brings the message whose `id` is given into view, drawing it first if the list has not, and
   * stops following new messages. A child is found by its `id` prop, or by its `key` (the message's
   * own id, where a row component of yours takes no `id`), and once drawn by the `id` of any element
   * in it. Resolves true once the message is in place (and focused, with `focus`), and false at once
   * when no child has that `id` or `key`, or when another reveal or a key press takes its place. Find
   * in chat searches your own messages, then reveals each match: the browser's find in page sees only
   * what is drawn.
   * @claim "A child is found by its `id` prop, or by its `key`" registry/ouro/components/ouro/message/message-list.windowing.test.tsx verify:testExists(registry/ouro/components/ouro/message/message-list.windowing.test.tsx::MessageList windowing > reveals a row component that takes no id by its key, and opens at one by its key, resolving once it is in place)
   * @claim "Brings the message whose `id` is given" registry/ouro/components/ouro/message/message-list.windowing.test.tsx verify:testExists(registry/ouro/components/ouro/message/message-list.windowing.test.tsx::MessageList windowing > reveals a message that is not drawn, by its id, in the middle of the view, and focuses it when asked)
   * @claim "and false at once when no child has" registry/ouro/components/ouro/message/message-list.windowing.test.tsx verify:testExists(registry/ouro/components/ouro/message/message-list.windowing.test.tsx::MessageList windowing > reveals nothing, and says so, for an id no message has)
   */
  reveal(id: string, options?: MessageListRevealOptions): Promise<boolean>;
  /**
   * Goes to the newest message and follows new messages again, as "Jump to latest" does, leaving focus where it is.
   * @claim "Goes to the newest message and follows" registry/ouro/components/ouro/message/message-list.windowing.test.tsx verify:testExists(registry/ouro/components/ouro/message/message-list.windowing.test.tsx::MessageList windowing > jumps to the newest message from far up, and follows new messages again)
   */
  jumpToNewest(): void;
}

/**
 * The messages in the list: Ouro's `Message`s, and an app's own message components, each marked
 * `data-ouro-message-list-item` on its root.
 * @claim "and an app's own message components" registry/ouro/components/ouro/message/message-list.test.tsx verify:testExists(registry/ouro/components/ouro/message/message-list.test.tsx::MessageList > keeps the reader's place among an app's own messages marked data-ouro-message-list-item, and announces them as it does Messages)
 */
const items = '[data-ouro="message"], [data-ouro-message-list-item]';

/** What Tab stops on, before the checks for a negative `tabindex`, `disabled`, `inert` and visibility. */
const tabbableSelector =
  'a[href], area[href], button, input:not([type="hidden"]), select, textarea, iframe, summary, audio[controls], video[controls], [tabindex], [contenteditable]:not([contenteditable="false"])';

/**
 * Focus guards: the hidden sentinels an open menu puts around its button, in the Tab order. A guard
 * closes the menu as it takes focus and sends focus back the way it came, so Tab onto one from the
 * message would land on the message again.
 */
const guards = '[data-base-ui-focus-guard][tabindex="0"], [data-floating-ui-focus-guard][tabindex="0"]';

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

/** Whether a child's key, as `Children.toArray` writes it (`.$m-41`, `.1:$m-41`, with `=` and `:` escaped), is `key`. */
function keyIs(childKey: string, key: string): boolean {
  return childKey.endsWith(`$${key.replace(/[=:]/g, (mark) => (mark === "=" ? "=0" : "=2"))}`);
}

/**
 * The child whose `id` prop, or else whose key, is `target`; -1 when none is.
 * @claim "The child whose `id` prop, or else whose key" registry/ouro/components/ouro/message/message-list.windowing.test.tsx verify:testExists(registry/ouro/components/ouro/message/message-list.windowing.test.tsx::MessageList windowing > reveals a row component that takes no id by its key, and opens at one by its key, resolving once it is in place) verify:testExists(registry/ouro/components/ouro/message/message-list.windowing.test.tsx::MessageList windowing > reveals nothing, and says so, for an id no message has)
 */
function childNamed(all: readonly ReactNode[], keys: readonly string[], target: string): number {
  const byId = all.findIndex((child) => isValidElement(child) && (child.props as { id?: unknown }).id === target);
  return byId >= 0 ? byId : keys.findIndex((key) => keyIs(key, target));
}

/** The key of the child a message is in, from its slot. */
function slotKeyOf(item: Element): string {
  return item.closest(`[${SLOT}]`)!.getAttribute(SLOT)!;
}

/** The messages in `content`, leaving out any message inside another one. */
function topItems(content: Element): HTMLElement[] {
  return [...content.querySelectorAll<HTMLElement>(items)].filter((item) => !content.contains(item.parentElement!.closest(items)));
}

/** Space kept between a message brought into view by the keyboard and the list's edge, so its focus ring shows. */
const EDGE = 8;
/** How far an arrow key scrolls through a message taller than the list, in pixels. */
const LINE = 40;

/** How close to the bottom, in pixels, counts as "at the bottom", where the list follows new messages (zoom leaves fractions). */
const AT_BOTTOM = 2;
/**
 * "Loading older messages": a raised pill over the top of the list, fading in where motion is allowed, its ring
 * spinning (pulsing with reduced motion).
 */
const olderClass =
  "relative m-0 box-border inline-flex h-8 items-center gap-2 rounded-full border border-solid border-border bg-background px-3 " +
  "text-sm text-muted-foreground shadow-(--shadow-md) whitespace-nowrap transition-opacity duration-(--ouro-duration-base) ease-(--ouro-ease-out) starting:opacity-0";

/** How many older messages go into the list in a frame when a page of them comes at once, to keep the frame short. */
const CHUNK = 20;
/**
 * How many of the newest children's keys, with the first child's, say the list's messages changed enough to look again for a switch.
 * @claim "How many of the newest children's keys" registry/ouro/components/ouro/message/message-list.test.tsx verify:testExists(registry/ouro/components/ouro/message/message-list.test.tsx::MessageList switching conversations > switches a list %s to another conversation of a thousand at its newest, in its first frame, from anywhere in the one before)
 */
const RECENT = 3;

/** How many announcements the live region keeps; older ones were already read. */
const KEEP_SPOKEN = 5;

/**
 * Above this many children the list draws only the messages near its view.
 * @claim "Above this many children the list" registry/ouro/components/ouro/message/message-list.windowing.test.tsx verify:testExists(registry/ouro/components/ouro/message/message-list.windowing.test.tsx::MessageList windowing > keeps a conversation of 60 messages whole, and windows it once it grows past 60, leaving the view where it is)
 */
const WINDOW_ABOVE = 60;
/** How far past the view's edges, in pixels, messages still draw: a page key, or a short scroll, finds them drawn. At least the view's height. */
const OVERSCAN = 800;
/** How much of the conversation draws before the view is known (server HTML, the first draw), in pixels: from its end, or around `initialAnchor`. */
const FIRST_VIEW = 1600;
/** A message's height, with its margins, before any is measured. */
const ESTIMATE = 96;
/**
 * How many messages that arrive at once draw where the reader is not, so each is heard.
 * @claim "How many messages that arrive at once" registry/ouro/components/ouro/message/message-list.windowing.test.tsx verify:testExists(registry/ouro/components/ouro/message/message-list.windowing.test.tsx::MessageList windowing > announces a new message once, and never a message drawn again as the reader scrolls)
 */
const KEEP_ARRIVED = 20;
/**
 * What marks each child's slot, holding the child's key.
 * @claim "What marks each child's slot" registry/ouro/components/ouro/message/message-list.windowing.test.tsx verify:testExists(registry/ouro/components/ouro/message/message-list.windowing.test.tsx::MessageList windowing > puts each child in a slot that draws no box, keeping a continued message's spacing, in a list of any length)
 */
const SLOT = "data-ouro-message-list-slot";

/**
 * Each child's height as last measured, by key, with its margins and without the gap before it; the gap; and the height
 * taken for a child not measured yet, the average of the first measured, fixed from then on. Were it to follow every
 * measurement, the space for hundreds of children above the view would change at once, and near the end the browser
 * would pull the scroll down to a bottom that came up.
 * @claim "Were it to follow every measurement" registry/ouro/components/ouro/message/message-list.windowing.test.tsx verify:testExists(registry/ouro/components/ouro/message/message-list.windowing.test.tsx::MessageList windowing > walks up past the messages first drawn with the Up arrow, each one drawn and shown as focus reaches it)
 * @claim "Each child's height as last measured" registry/ouro/components/ouro/message/message-list.windowing.test.tsx verify:testExists(registry/ouro/components/ouro/message/message-list.windowing.test.tsx::MessageList windowing > draws only the messages near the view of a long conversation, in a list as tall as all of them)
 */
interface Measured {
  heights: ReadonlyMap<string, number>;
  gap: number;
  estimate: number;
  /** The list's width, rounded to a multiple of BUCKET, the heights are of; null before it is measured. */
  bucket: number | null;
}

/** The entry of a `heightCache` that holds the width the heights in it were last measured at. */
// Stryker disable next-line StringLiteral: the entry only has to differ from the `<key>\0<width>` ones, as an empty string does.
const CACHED_WIDTH = "\0width";
/**
 * The width, in CSS pixels, rounded to a multiple of this, that a height is cached for.
 */
const BUCKET = 8;
/** A message to draw and bring into view: by key, the element with `id` in it or its first or last message, and whether to focus it. */
interface Reach {
  key: string;
  id: string | null;
  /** Whether to show the child itself, message or not, as `reveal` by key does; the keys step on to a message. */
  child: boolean;
  forward: boolean;
  focus: boolean;
  block: MessageListRevealBlock;
}

/** The average of the heights measured. */
function averageOf(heights: ReadonlyMap<string, number>): number {
  let sum = 0;
  for (const height of heights.values()) sum += height;
  return sum / heights.size;
}

/**
 * Where a slot's child sits, from the top of its first box's margin to the bottom of its last one's, in viewport pixels
 * (less the springs): a slot draws no box of its own (`display: contents`). One with nothing drawn has no size.
 * @claim "a slot draws no box of its own" registry/ouro/components/ouro/message/message-list.windowing.test.tsx verify:testExists(registry/ouro/components/ouro/message/message-list.windowing.test.tsx::MessageList windowing > puts each child in a slot that draws no box, keeping a continued message's spacing, in a list of any length)
 * @claim "One with nothing drawn has no size" registry/ouro/components/ouro/message/message-list.tsx verify:fileLine(registry/ouro/components/ouro/message/message-list.tsx, /if \(parts\.length === 0\) return \{ top: 0, size: 0 \};/)
 */
function extentOf(slot: Element): { top: number; size: number } {
  const parts = [...slot.children].filter((part) => part.getClientRects().length > 0);
  if (parts.length === 0) return { top: 0, size: 0 };
  const first = parts[0]!;
  const last = parts.at(-1)!;
  const top = boxOf(first).top - parseFloat(getComputedStyle(first).marginTop);
  return { top, size: boxOf(last).bottom + parseFloat(getComputedStyle(last).marginBottom) - top };
}

/**
 * The children to draw before the view is known: those within FIRST_VIEW pixels of the end, or around the child at
 * `anchor`. The same on the server as in the browser, so the HTML hydrates.
 */
function firstRange(count: number, size: (index: number) => number, anchor: number): [number, number] {
  if (anchor < 0) {
    let from = count - 1;
    // Stryker disable next-line ConditionalExpression,EqualityOperator: a windowed list has more than 60 children, more than FIRST_VIEW takes, so this never reaches the first.
    for (let height = size(from); from > 0 && height < FIRST_VIEW; height += size(--from));
    // Stryker disable next-line ArithmeticOperator: an end past the last child draws no more.
    return [from, count - 1];
  }
  let from = anchor;
  let to = anchor;
  // Past either end, a range draws the same children (each size past them is the estimate, so it stops).
  // Stryker disable next-line ConditionalExpression,EqualityOperator: past the first child a range draws the same children, and a child more at exactly half the view is one the window's first look settles.
  for (let height = 0; from > 0 && height < FIRST_VIEW / 2; height += size(--from));
  // Stryker disable next-line ConditionalExpression,EqualityOperator,ArithmeticOperator: past the last child a range draws the same children, and a child more at exactly half the view is one the window's first look settles.
  for (let height = 0; to < count - 1 && height < FIRST_VIEW / 2; height += size(++to));
  return [from, to];
}

// The springs (`springy`). Tuned to feel like a phone's messages app, subtle rather than wobbly:
// a slow trackpad scroll opens the messages farthest from the pointer by a few pixels, a fling by
// up to SPREAD, and they close again in about half a second with an overshoot of a pixel or less.
/** Apple's response (seconds) and damping fraction: a little under critical, so a spread closes with a hint of overshoot. */
const SPRING = { response: 0.42, damping: 0.72 };
/**
 * The share of each scroll a message trails by, once it is REACH px or more from where the reader scrolls.
 * @claim "The share of each scroll a" registry/ouro/components/ouro/message/message-list.springs.test.tsx verify:testExists(registry/ouro/components/ouro/message/message-list.springs.test.tsx::MessageList springs > trails the wheel the more the farther a message is from the pointer, and settles back to no transform)
 */
const LAG = 0.14;
/**
 * How far from where the reader scrolls, in px, a message trails fully; nearer, it trails in proportion.
 * @claim "How far from where the reader" registry/ouro/components/ouro/message/message-list.springs.test.tsx verify:testExists(registry/ouro/components/ouro/message/message-list.springs.test.tsx::MessageList springs > trails the wheel the more the farther a message is from the pointer, and settles back to no transform)
 */
const REACH = 400;
/**
 * The most a message trails by, in px: it eases into this limit and never passes it.
 * @claim "The most a message trails by" registry/ouro/components/ouro/message/message-list.springs.test.tsx verify:testExists(registry/ouro/components/ouro/message/message-list.springs.test.tsx::MessageList springs > trails the wheel the more the farther a message is from the pointer, and settles back to no transform)
 * @claim "The most a message trails by" registry/ouro/components/ouro/message/message-list.tsx verify:fileLine(registry/ouro/components/ouro/message/message-list.tsx, /SPREAD\s\*\sMath\.tanh\(value\s\/\sSPREAD\)/)
 */
const SPREAD = 20;
/** The share of a push past either end (a wheel or finger with nowhere left to scroll) that the messages follow. */
const STRETCH = 0.25;
/** How long a scroll counts as the reader's after their last wheel, touch or key, in ms: momentum keeps it going. */
const ARMED = 250;
/** A message this close to its place, in px, and this slow, in px/ms, is at rest. */
const REST = 0.25;
const REST_SPEED = 0.01;

/**
 * How many messages the springs have drawn away from where they are laid out, in all lists: with none, a box is where it is laid out.
 * @claim "How many messages the springs have" registry/ouro/components/ouro/message/message-list.springs.test.tsx verify:testExists(registry/ouro/components/ouro/message/message-list.springs.test.tsx::MessageList springs > reads where messages are with no more work than before once they rest)
 */
let shifted = 0;

/**
 * How far the springs draw each message from where it is laid out, in px, while it moves.
 * @claim "How far the springs draw each" registry/ouro/components/ouro/message/message-list.springs.test.tsx verify:testExists(registry/ouro/components/ouro/message/message-list.springs.test.tsx::MessageList springs > never changes the scroll position, and keeps the reader's place by where messages are laid out)
 */
const shifts = new WeakMap<Element, number>();

/** Where an element is laid out: its box, less the spring of the message it is in. */
/** A child's key, from `Children.toArray`, or null for one that is not an element. */
function keyOf(child: ReturnType<typeof Children.toArray>[number] | undefined): Key | null {
  return isValidElement(child) ? child.key : null;
}

function boxOf(element: Element): { top: number; bottom: number; height: number } {
  const box = element.getBoundingClientRect();
  if (shifted === 0) return box;
  let shift = 0;
  for (let item = element.closest(items); item !== null; item = item.parentElement!.closest(items)) shift += shifts.get(item) ?? 0;
  return { top: box.top - shift, bottom: box.bottom - shift, height: box.height };
}

/**
 * Whether an element has a box: one hidden (`display: none`, or inside such an element) has none, and reads as all zeros.
 * @claim "one hidden (`display: none`, or inside" registry/ouro/components/ouro/message/message-list.test.tsx verify:testExists(registry/ouro/components/ouro/message/message-list.test.tsx::MessageList through a long conversation > never puts the Tab stop on a hidden message, the newest or one in view, as the view shows the messages around it)
 */
function laidOut(element: Element): boolean {
  return element.getClientRects().length > 0;
}

/**
 * Halves `list`, laid out down the page, for the first message whose box `before` says is not yet past the point it looks
 * for. A hidden message's zero box would break the halving, so a step that lands on one goes to the nearest message
 * with a box; none in the range means the point lies past it.
 * @claim "A hidden message's zero box would" registry/ouro/components/ouro/message/message-list.test.tsx verify:testExists(registry/ouro/components/ouro/message/message-list.test.tsx::MessageList through a long conversation > keeps the reader's place as they scroll and older history loads, under a header, with a hidden message in view and one below it)
 * @claim "A hidden message's zero box would" registry/ouro/components/ouro/message/message-list.test.tsx verify:testExists(registry/ouro/components/ouro/message/message-list.test.tsx::MessageList through a long conversation > never puts the Tab stop on a hidden message, the newest or one in view, as the view shows the messages around it)
 */
function halve(list: readonly Element[], before: (box: { top: number; bottom: number }) => boolean): number {
  return halveShown(list, laidOut, (element) => before(boxOf(element)));
}

/**
 * The springs of one list: `moved` tells them the list scrolled itself, so no message trails it.
 * @claim "The springs of one list: `moved`" registry/ouro/components/ouro/message/message-list.springs.test.tsx verify:testExists(registry/ouro/components/ouro/message/message-list.springs.test.tsx::MessageList springs > follows only the reader's part of a scroll the list adds to as it follows a new message)
 */
interface Springs {
  moved(by: number): void;
  stop(): void;
}

/** Whether to reduce motion under a provider's `motion`, asking the device now, so a frame loop sees a change of its setting at once. */
function reducesMotion(motion: OuroMotion | undefined): boolean {
  return motion === "reduced" || (motion !== "full" && matchMedia("(prefers-reduced-motion: reduce)").matches);
}

/**
 * Springs the messages as the reader scrolls. One frame loop for the whole list, running only
 * while a message moves; each frame finds the messages in or near view by halving, so a long
 * conversation costs what a short one does, reads their boxes, then writes their transforms.
 * @claim "One frame loop for the whole" registry/ouro/components/ouro/message/message-list.springs.test.tsx verify:testExists(registry/ouro/components/ouro/message/message-list.springs.test.tsx::MessageList springs > moves only the messages in or near view, reading as few in a thousand as in fifty, on one frame loop)
 */
function springs(scroller: HTMLElement, content: HTMLElement, reduced: () => boolean): Springs {
  const moving = new Map<HTMLElement, SpringState>();
  let list = topItems(content);
  // The scroll position the springs last followed, less the list's own scrolling since.
  let top = scroller.scrollTop;
  // How far the reader pushed past an end since the last frame.
  let pushed = 0;
  // Where the reader scrolls from: the pointer or finger, or, null, the focused message, for the keys.
  let finger: number | null = null;
  let armedUntil = Number.NEGATIVE_INFINITY;
  let touchY = 0;
  let touchTop = 0;
  let frame = 0;
  let then = 0;
  // The messages near view at the last frame.
  let seen = new Set<HTMLElement>();

  const draw = (item: HTMLElement, value: number) => {
    if (!shifts.has(item)) {
      shifted++;
      item.style.willChange = "transform";
      // Stryker disable next-line StringLiteral: the attribute's presence is what styles and tests read.
      item.setAttribute("data-ouro-settling", "");
    }
    shifts.set(item, value);
    item.style.transform = `translateY(${value}px)`;
  };
  // At rest a message has no transform, and no layer of its own, so its text is drawn crisp.
  const rest = (item: HTMLElement) => {
    moving.delete(item);
    if (shifts.delete(item)) shifted--;
    item.style.removeProperty("transform");
    item.style.removeProperty("will-change");
    if (item.getAttribute("style") === "") item.removeAttribute("style");
    item.removeAttribute("data-ouro-settling");
  };
  const middle = (box: { top: number; bottom: number }) => (box.top + box.bottom) / 2;
  // The messages within half the list's height of its view, found by halving the list.
  const nearby = (view: DOMRect) => {
    const above = view.top - view.height / 2;
    const below = view.bottom + view.height / 2;
    let low = 0;
    let high = list.length;
    while (low < high) {
      const at = (low + high) >> 1;
      // Stryker disable next-line EqualityOperator: a message whose edge meets the band's edge to the pixel is out of sight either way.
      if (boxOf(list[at]!).bottom <= above) low = at + 1;
      else high = at;
    }
    const band: { item: HTMLElement; box: { top: number; bottom: number } }[] = [];
    for (let at = low; at < list.length; at++) {
      const box = boxOf(list[at]!);
      // Stryker disable next-line EqualityOperator: a message whose edge meets the band's edge to the pixel is out of sight either way.
      if (box.top >= below) break;
      band.push({ item: list[at]!, box });
    }
    return band;
  };

  const tick = (now: number) => {
    frame = 0;
    const elapsed = Math.max(now - then, 0);
    then = now;
    const view = scroller.getBoundingClientRect();
    const scrolled = scroller.scrollTop - top;
    top = scroller.scrollTop;
    const push = pushed;
    pushed = 0;
    if (reduced()) return [...moving.keys()].forEach(rest);
    // A move of a list's height or more is a jump (End from far up, a link to an old message), not a scroll.
    const kick = Math.abs(scrolled) < view.height ? scrolled : 0;
    const band = nearby(view);
    const near = new Set(band.map(({ item }) => item));
    // A message that leaves the band is out of sight: it rests at once.
    for (const item of moving.keys()) if (!near.has(item)) rest(item);
    if (kick !== 0 || push !== 0) {
      // Where the scroll starts: the pointer or finger, or, for the keys, the focused message, which
      // lands exactly where they put it while the others trail.
      const held = finger === null ? scroller.ownerDocument.activeElement!.closest<HTMLElement>(items) : null;
      const anchor = held === null ? { top: finger!, bottom: finger! } : boxOf(held);
      const known = band.filter(({ item }) => moving.has(item)).map(({ item, box }) => ({ at: middle(box), state: moving.get(item)! }));
      for (const { item, box } of band) {
        if (item === held) {
          rest(item);
          continue;
        }
        const at = middle(box);
        const reach = Math.min(Math.max(anchor.top - at, at - anchor.bottom, 0) / REACH, 1);
        // A message that comes near mid-scroll starts where its nearest moving neighbour is, so no gap opens at the band's edge.
        // Stryker disable next-line EqualityOperator: of two neighbours exactly as near, either is as near.
        const neighbour = seen.has(item) ? undefined : known.reduce<(typeof known)[number] | undefined>((best, other) => (best === undefined || Math.abs(other.at - at) < Math.abs(best.at - at) ? other : best), undefined);
        const state = moving.get(item) ?? neighbour?.state ?? { value: 0, velocity: 0 };
        const value = state.value + kick * LAG * reach - push * (1 - reach);
        moving.set(item, { value: SPREAD * Math.tanh(value / SPREAD), velocity: state.velocity });
      }
    }
    seen = near;
    for (const [item, state] of moving) {
      const next = springAt(state.value, 0, state.velocity, elapsed, SPRING);
      // Stryker disable next-line EqualityOperator: a spring lands exactly on the rest speed only by chance, and a frame later it rests either way.
      if (Math.abs(next.value) < REST && Math.abs(next.velocity) < REST_SPEED) rest(item);
      else {
        moving.set(item, next);
        draw(item, next.value);
      }
    }
    if (moving.size > 0) frame = requestAnimationFrame(tick);
  };
  const run = () => {
    if (frame !== 0 || reduced()) return;
    then = performance.now();
    frame = requestAnimationFrame(tick);
  };
  const arm = () => {
    armedUntil = performance.now() + ARMED;
  };
  // Whether the list is at the end it is being pushed toward: the top for `delta` up, the bottom for down.
  const atEnd = (delta: number) => {
    // Stryker disable next-line EqualityOperator: a push of 0 moves nothing, whichever end it is checked against.
    if (delta < 0) return scroller.scrollTop <= 0;
    return scroller.scrollTop >= scroller.scrollHeight - scroller.clientHeight - 1;
  };

  const onScroll = () => {
    if (performance.now() <= armedUntil) {
      arm();
      run();
    } else top = scroller.scrollTop;
  };
  const onWheel = (event: WheelEvent) => {
    finger = event.clientY;
    arm();
    const delta = event.deltaMode === 0 ? event.deltaY : event.deltaY * LINE;
    if (!atEnd(delta)) return;
    pushed += delta * STRETCH;
    run();
  };
  const onTouchStart = (event: TouchEvent) => {
    finger = touchY = event.touches[0]!.clientY;
    touchTop = scroller.scrollTop;
    // Stryker disable next-line all: a finger scrolls only once it moves, and each move arms the list again.
    arm();
  };
  const onTouchMove = (event: TouchEvent) => {
    const y = event.touches[0]!.clientY;
    // A finger moving up scrolls down, as a positive wheel does.
    const delta = touchY - y;
    finger = touchY = y;
    // Pushing past an end, where the list did not scroll.
    if (scroller.scrollTop === touchTop && atEnd(delta)) {
      pushed += delta * STRETCH;
      run();
    }
    touchTop = scroller.scrollTop;
    arm();
  };
  const onKey = () => {
    finger = null;
    arm();
  };
  // A message the keys move focus to lands where they put it at once, its ring with it.
  const onFocus = (event: FocusEvent) => {
    const item = (event.target as Element).closest<HTMLElement>(items);
    if (finger === null && item !== null) rest(item);
  };
  const observer = new MutationObserver((records) => {
    // Stryker disable next-line ConditionalExpression: finding the messages again when none came or went finds the same ones.
    if (records.some(touchesItems)) list = topItems(content);
  });
  observer.observe(content, { childList: true, subtree: true });
  // Stryker disable next-line ObjectLiteral,BooleanLiteral: passive only lets the browser scroll without waiting for these listeners.
  const passive = { passive: true };
  scroller.addEventListener("scroll", onScroll, passive);
  scroller.addEventListener("wheel", onWheel, passive);
  scroller.addEventListener("touchstart", onTouchStart, passive);
  scroller.addEventListener("touchmove", onTouchMove, passive);
  scroller.addEventListener("keydown", onKey);
  scroller.addEventListener("focusin", onFocus);
  // Stryker disable next-line all: with the scroll, wheel and touchmove listeners gone, nothing reads what these change; removing them frees memory only.
  const forget = () => (observer.disconnect(), scroller.removeEventListener("touchstart", onTouchStart), scroller.removeEventListener("keydown", onKey), scroller.removeEventListener("focusin", onFocus));
  return {
    moved(by) {
      top += by;
    },
    stop() {
      // Stryker disable next-line all: a frame left after this finds no message moving, and asks for none.
      frame = (cancelAnimationFrame(frame), 0);
      [...moving.keys()].forEach(rest);
      scroller.removeEventListener("scroll", onScroll);
      scroller.removeEventListener("wheel", onWheel);
      scroller.removeEventListener("touchmove", onTouchMove);
      // Stryker disable next-line all: with the scroll, wheel and touchmove listeners gone, nothing reads what these change.
      forget();
    },
  };
}

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
 * A short conversation sits at the region's bottom, by the composer under it, as in a chat
 * app; put what starts it (who it is with, a way to older history) first among the children,
 * and it sits right above the first message. While the reader is at the bottom it follows new messages and streaming text; once they
 * scroll up, nothing moves their view, and a "Jump to latest" button appears. At the bottom it also
 * follows what reaches past its end without changing any message's size, such as the action bar
 * beside a reply's last line. Nor does something in a message that gets shorter for a moment and
 * longer again, such as a picture's placeholder swapped for the picture, pull it off its end. Each new
 * message from someone else is read to screen readers once, politely: a streamed reply
 * when it finishes, and a first reply in a list that mounted empty. History is never
 * announced: the messages it mounts with, several messages filling an empty list at once
 * (history fetched after mount), older messages loaded above, and a message whose `key` changes in place (a temporary id
 * swapped for the server's). Every message re-keyed at once is not held that way: the view moves a little, since windowing holds a place by a child's key. Older messages loaded above a scrolled-up reader leave the message
 * they are reading where it was, in every frame, and so does a message above them that moves, such
 * as a post a reply moves to the end. When the message they are on is the one that moves, the
 * messages around it keep their place. A page of many older messages goes in 20 a frame, those
 * nearest the reader first, so loading it never holds the page up for long (when the messages are
 * the list's own children, each with a `key`).
 * Switching to another conversation is opening one: key the list by the conversation, or give it
 * the other conversation's messages with its `conversation` (or, without one, messages that share no
 * `key` with those it held), even after it held none for a while. Either way it
 * opens at the other's newest message, wherever the reader was, with nothing announced; focus that
 * was on a message moves to the newest one in view. A scroll up from the end stops the list following
 * new messages at once, before the browser reports it. The list follows by how far it is from the
 * bottom, not which way it last scrolled, so your code going to a message (`scrollIntoView`) stops
 * it too, even as the first messages arrive. Scrolling is never announced.
 *
 * While older history may load, set `hasOlder`, and `loadingOlder` while it loads: the list keeps
 * room above the first message for "Loading older messages", so nothing moves as it shows. Fetch
 * older pages ahead of the reader, newer before older, rather than waiting for them to reach the
 * top, so they seldom see it.
 *
 * Give it a height (`className="h-96"`, or `flex-1` in a column), since it scrolls inside it.
 * Nothing in it overflows the boxes around it, so moving focus or scrolling a message into view
 * scrolls the list, not the page around it.
 *
 * A conversation of more than 60 children draws only the messages near its view (`windowing`),
 * each measured as it draws, with space kept for the rest, so a long conversation opens and redraws
 * in about the time a screenful does. The reader's place holds as the messages above them are
 * measured and as older ones load above, in one frame. The newest message, the one with focus and
 * any still streaming stay drawn, and the arrow keys, Home and End reach every message, drawing the
 * one they reach. The browser's find in page sees only what is drawn: search your own messages and
 * call `actionsRef.current.reveal(id)` to show a match, as a quote does. Each child sits in an element
 * of its own that draws no box (`display: contents`, marked `data-ouro-message-list-slot`), so CSS
 * that selects the list's direct children selects those elements, in a list of any length.
 *
 * The messages spring as the reader scrolls, as in a phone's messages app: each trails the scroll a
 * little and catches up, the farther from the pointer, finger or focused message the more, and a
 * fling or a push past either end spreads them apart for a moment. The scroll position never moves
 * for it, and at rest no message has a transform. `springy={false}` turns it off, and it is off with
 * reduced motion.
 *
 * The messages are one Tab stop. Tab lands on the newest message in view (or the one focused
 * last, while it shows), and the arrow keys, Home, End, Page Up and Page Down move between
 * messages, with a focus ring; a message taller than the list scrolls through first. The right
 * arrow (the left one, right to left) goes into the focused message's toolbar, such as its action
 * bar, else its first control, and Tab goes through its controls. Tab never stops on the other
 * messages' controls, so the next Tab after a message's own controls leaves the list. Nor does it
 * stop on the focus guards an open menu puts around its button, so Tab from a message whose menu
 * is open goes on through its controls rather than back to the message. A new
 * message never takes focus, and when the focused message goes, focus goes to the one now in its
 * place. Each message that is an article carries its place among them for screen readers
 * (`aria-posinset`, `aria-setsize`). `onMessageKeyDown` adds keys of your own on the focused
 * message, such as 1 to 6 for quick reactions.
 *
 * On a Mac the list reads ⌘↑, ⌘↓, ⌥↑ and ⌥↓ on a focused message as Home, End, Page Up and Page
 * Down, and calls `preventDefault()` on them. Listen for an app shortcut on those keys in the
 * capture phase (`window.addEventListener("keydown", onKey, { capture: true })`), which runs
 * before the list: call `preventDefault()` there and the list leaves the key alone. Or set
 * `pageKeys={false}` to leave Page Up, Page Down, ⌥↑ and ⌥↓ to the app.
 *
 * Your own message components work too: mark each one's root `data-ouro-message-list-item`, the
 * reader's own with `data-role="user"` and one still streaming with `aria-busy="true"`, and put its
 * author's name and its text in elements marked `data-ouro-message-author` and
 * `data-ouro-message-content`, as `Message` does. The list keeps the reader's place among them and
 * announces them as it does `Message`s, and moves focus among them. Give your component a focus
 * ring (`focus-visible:outline-2`), as `Message` has. Leave `data-ouro="message"` to Ouro's `Message`: it names
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
 * @claim "Every message re-keyed at once is not held that way" registry/ouro/components/ouro/message/message-list.test.tsx verify:testExists(registry/ouro/components/ouro/message/message-list.test.tsx::MessageList switching conversations > keeps the reader's place, and opens nothing, when every message in view gets a new key in place and the rest keep theirs)
 * @claim "The messages spring as the reader" registry/ouro/components/ouro/message/message-list.springs.test.tsx verify:testExists(registry/ouro/components/ouro/message/message-list.springs.test.tsx::MessageList springs > trails the wheel the more the farther a message is from the pointer, and settles back to no transform)
 * @claim "The messages spring as the reader" registry/ouro/components/ouro/message/message-list.springs.test.tsx verify:testExists(registry/ouro/components/ouro/message/message-list.springs.test.tsx::MessageList springs > spreads the messages apart on a push past either end, and draws them back)
 * @claim "The scroll position never moves" registry/ouro/components/ouro/message/message-list.springs.test.tsx verify:testExists(registry/ouro/components/ouro/message/message-list.springs.test.tsx::MessageList springs > never changes the scroll position, and keeps the reader's place by where messages are laid out)
 * @claim "`springy={false}` turns it off" registry/ouro/components/ouro/message/message-list.springs.test.tsx verify:testExists(registry/ouro/components/ouro/message/message-list.springs.test.tsx::MessageList springs > moves nothing with reduced motion, or with springy={false})
 * @claim "the list keeps room above" registry/ouro/components/ouro/message/message-list.test.tsx verify:testExists(registry/ouro/components/ouro/message/message-list.test.tsx::MessageList > keeps room above the first message while hasOlder, so loading older messages covers no message or focus ring and moves nothing)
 * @claim "Your own message components work too" registry/ouro/components/ouro/message/message-list.test.tsx verify:testExists(registry/ouro/components/ouro/message/message-list.test.tsx::MessageList > keeps the reader's place among an app's own messages marked data-ouro-message-list-item, and announces them as it does Messages)
 * @claim "A conversation: `Message`s in a scrolling" registry/ouro/components/ouro/message/message-list.test.tsx verify:testExists(registry/ouro/components/ouro/message/message-list.test.tsx::MessageList > is a named region that opens at the newest message, which is its Tab stop)
 * @claim "The messages are one Tab stop" registry/ouro/components/ouro/message/message-list.test.tsx verify:testExists(registry/ouro/components/ouro/message/message-list.test.tsx::MessageList keyboard > is one Tab stop: Tab lands on the newest message, goes through its controls, and leaves the list)
 * @claim "The messages are one Tab stop" registry/ouro/components/ouro/message/message-list.test.tsx verify:testExists(registry/ouro/components/ouro/message/message-list.test.tsx::MessageList keyboard > keeps focus where it is when a message arrives, and the Tab stop on the message focused last while it shows)
 * @claim "and the arrow keys, Home, End, Page Up" registry/ouro/components/ouro/message/message-list.test.tsx verify:testExists(registry/ouro/components/ouro/message/message-list.test.tsx::MessageList keyboard > moves between messages with the arrow keys, Home, End, Page Up and Page Down, with a focus ring)
 * @claim "and the arrow keys, Home, End, Page Up" registry/ouro/components/ouro/message/message-list.test.tsx verify:testExists(registry/ouro/components/ouro/message/message-list.test.tsx::MessageList keyboard > moves a page at a time to the next message when the next starts more than a list's height away)
 * @claim "a message taller than the list scrolls" registry/ouro/components/ouro/message/message-list.test.tsx verify:testExists(registry/ouro/components/ouro/message/message-list.test.tsx::MessageList keyboard > scrolls through a message taller than the list, a line or a page at a time, before moving on)
 * @claim "The right arrow (the left one, right to" registry/ouro/components/ouro/message/message-list.test.tsx verify:testExists(registry/ouro/components/ouro/message/message-list.test.tsx::MessageList keyboard > goes into the focused message's toolbar with the right arrow, else its first control, and the left arrow right to left)
 * @claim "Tab never stops on the other" registry/ouro/components/ouro/message/message-list.test.tsx verify:testExists(registry/ouro/components/ouro/message/message-list.test.tsx::MessageList keyboard > reaches a control between messages in the Tab order, and passes over the other messages' controls)
 * @claim "Nor does it stop on the focus guards" registry/ouro/components/ouro/message/message-list.test.tsx verify:testExists(registry/ouro/components/ouro/message/message-list.test.tsx::MessageList keyboard > passes over the focus guards around an open menu's button, so Tab never bounces back to the message)
 * @claim "A new message never takes focus" registry/ouro/components/ouro/message/message-list.test.tsx verify:testExists(registry/ouro/components/ouro/message/message-list.test.tsx::MessageList keyboard > keeps focus where it is when a message arrives, and the Tab stop on the message focused last while it shows)
 * @claim "and when the focused message goes" registry/ouro/components/ouro/message/message-list.test.tsx verify:testExists(registry/ouro/components/ouro/message/message-list.test.tsx::MessageList keyboard > moves focus from a focused message replaced under a new key to its replacement, not to its old index, as older messages go in above)
 * @claim "and when the focused message goes" registry/ouro/components/ouro/message/message-list.test.tsx verify:testExists(registry/ouro/components/ouro/message/message-list.test.tsx::MessageList keyboard > moves focus to the message now in the place of a focused message that goes, and leaves a control that goes from a message to the app)
 * @claim "Each message that is an article carries" registry/ouro/components/ouro/message/message-list.test.tsx verify:testExists(registry/ouro/components/ouro/message/message-list.test.tsx::MessageList keyboard > gives each message its place among them for screen readers, and keeps an app's own)
 * @claim "On a Mac the list reads" registry/ouro/components/ouro/message/message-list.test.tsx verify:testExists(registry/ouro/components/ouro/message/message-list.test.tsx::MessageList keyboard > reads ⌘↑ and ⌘↓ as Home and End, and ⌥↑ and ⌥↓ as Page Up and Page Down, on a Mac)
 * @claim "which runs before the list" registry/ouro/components/ouro/message/message-list.test.tsx verify:testExists(registry/ouro/components/ouro/message/message-list.test.tsx::MessageList keyboard > leaves ⌘↑, ⌘↓, ⌥↑ and ⌥↓ alone on a Mac once an app's capture-phase shortcut prevented them)
 * @claim "`onMessageKeyDown` adds keys of your own" registry/ouro/components/ouro/message/message-list.test.tsx verify:testExists(registry/ouro/components/ouro/message/message-list.test.tsx::MessageList keyboard > hands the app a key pressed on the focused message, and not one pressed in a control inside it)
 * @claim "Each new message from someone else" registry/ouro/components/ouro/message/message-list.test.tsx verify:testExists(registry/ouro/components/ouro/message/message-list.test.tsx::MessageList > announces a reply still streaming in the first messages to fill an empty list, once it finishes)
 * @claim "Each new message from someone else" registry/ouro/components/ouro/message/message-list.test.tsx verify:testExists(registry/ouro/components/ouro/message/message-list.test.tsx::MessageList > announces a reply that was streaming when the list mounted, once it finishes)
 * @claim "Each new message from someone else" registry/ouro/components/ouro/message/message-list.test.tsx verify:testExists(registry/ouro/components/ouro/message/message-list.test.tsx::MessageList > does not read back the user's own message)
 * @claim "and so does a message above" registry/ouro/components/ouro/message/message-list.test.tsx verify:testExists(registry/ouro/components/ouro/message/message-list.test.tsx::MessageList > keeps the reader's place when a message above them moves to the end and the list keeps its height)
 * @claim "When the message they are on is the one that moves" registry/ouro/components/ouro/message/message-list.test.tsx verify:testExists(registry/ouro/components/ouro/message/message-list.test.tsx::MessageList > keeps the reader's place by the messages around the one they are on when it moves to the end)
 * @claim "When the message they are on is the one that moves" registry/ouro/components/ouro/message/message-list.test.tsx verify:testExists(registry/ouro/components/ouro/message/message-list.test.tsx::MessageList > keeps the reader's place by the other message in view when the one they are on moves to the end)
 * @claim "The list follows by how far" registry/ouro/components/ouro/message/message-list.test.tsx verify:testExists(registry/ouro/components/ouro/message/message-list.test.tsx::MessageList > stays at a message an app scrolls to as the first messages arrive, instead of following to the newest)
 * @claim "A page of many older messages goes in 20" registry/ouro/components/ouro/message/message-list.test.tsx verify:testExists(registry/ouro/components/ouro/message/message-list.test.tsx::MessageList > puts pages of older messages in a few at a time, holding the reader's message in place in every frame)
 * @claim "A page of many older messages goes in 20" registry/ouro/components/ouro/message/message-list.test.tsx verify:testExists(registry/ouro/components/ouro/message/message-list.test.tsx::MessageList > puts a few older messages in at once)
 * @claim "Switching to another conversation is opening" registry/ouro/components/ouro/message/message-list.test.tsx verify:testExists(registry/ouro/components/ouro/message/message-list.test.tsx::MessageList switching conversations > switches a list %s to another conversation of a thousand at its newest, in its first frame, from anywhere in the one before)
 * @claim "focus that was on a message moves" registry/ouro/components/ouro/message/message-list.test.tsx verify:testExists(registry/ouro/components/ouro/message/message-list.test.tsx::MessageList switching conversations > moves focus on a message of the conversation before to the newest in view of the next, without scrolling)
 * @claim "A scroll up from the end" registry/ouro/components/ouro/message/message-list.test.tsx verify:testExists(registry/ouro/components/ouro/message/message-list.test.tsx::MessageList > stops following the newest message once the list is scrolled up, even before the scroll event comes)
 * @claim "History is never announced: the messages" registry/ouro/components/ouro/message/message-list.test.tsx verify:testExists(registry/ouro/components/ouro/message/message-list.test.tsx::MessageList > never announces the first messages that fill an empty list, such as history fetched after mount)
 * @claim "History is never announced: the messages" registry/ouro/components/ouro/message/message-list.test.tsx verify:testExists(registry/ouro/components/ouro/message/message-list.test.tsx::MessageList > never announces older history loaded above, and keeps the reader's place while it loads)
 * @claim "Nothing in it overflows the boxes around it" registry/ouro/components/ouro/message/message-list.test.tsx verify:testExists(registry/ouro/components/ouro/message/message-list.test.tsx::MessageList > keeps its messages' parts inside its own scroll box, so focus and scrollIntoView never scroll a box around it)
 * @claim "Scrolling is never announced" registry/ouro/components/ouro/message/message-list.test.tsx verify:testExists(registry/ouro/components/ouro/message/message-list.test.tsx::MessageList > never announces while the reader scrolls)
 * @claim "Nor does something in a message" registry/ouro/components/ouro/message/message-list.test.tsx verify:testExists(registry/ouro/components/ouro/message/message-list.test.tsx::MessageList switching conversations > stays at its end when a picture in a message shrinks and grows back between frames, as a placeholder swapped for its picture does)
 * @claim "At the bottom it also follows" registry/ouro/components/ouro/message/message-list.test.tsx verify:testExists(registry/ouro/components/ouro/message/message-list.test.tsx::MessageList > follows its end at the bottom when something in a message reaches past it, though no message changes size)
 * @claim "A conversation of more than 60 children draws" registry/ouro/components/ouro/message/message-list.windowing.test.tsx verify:testExists(registry/ouro/components/ouro/message/message-list.windowing.test.tsx::MessageList windowing > draws only the messages near the view of a long conversation, in a list as tall as all of them)
 * @claim "A conversation of more than 60 children draws" test/message-list-windowing.bench.test.tsx verify:fileLine(test/message-list-windowing.bench.test.tsx, /expect\(windowed\.redraw\)\.toBeLessThan\(whole\.redraw \/ 2\)/)
 * @claim "The reader's place holds as the messages above" registry/ouro/components/ouro/message/message-list.windowing.test.tsx verify:testExists(registry/ouro/components/ouro/message/message-list.windowing.test.tsx::MessageList windowing > keeps the reader's place while messages above are measured, scrolling up through them)
 * @claim "The reader's place holds as the messages above" registry/ouro/components/ouro/message/message-list.windowing.test.tsx verify:testExists(registry/ouro/components/ouro/message/message-list.windowing.test.tsx::MessageList windowing > keeps the reader's place when a page of older messages loads above, putting it in at once)
 * @claim "The newest message, the one with focus" registry/ouro/components/ouro/message/message-list.windowing.test.tsx verify:testExists(registry/ouro/components/ouro/message/message-list.windowing.test.tsx::MessageList windowing > keeps the message with focus drawn, and focus on it, as the reader scrolls far away)
 * @claim "The newest message, the one with focus" registry/ouro/components/ouro/message/message-list.windowing.test.tsx verify:testExists(registry/ouro/components/ouro/message/message-list.windowing.test.tsx::MessageList windowing > follows new messages and streaming text at the bottom, and shows Jump to latest once the reader scrolls up)
 * @claim "and the arrow keys, Home and End reach every message" registry/ouro/components/ouro/message/message-list.windowing.test.tsx verify:testExists(registry/ouro/components/ouro/message/message-list.windowing.test.tsx::MessageList windowing > moves focus to the first message with Home and back to the newest with End, drawing the message it reaches)
 * @claim "and the arrow keys, Home and End reach every message" registry/ouro/components/ouro/message/message-list.windowing.test.tsx verify:testExists(registry/ouro/components/ouro/message/message-list.windowing.test.tsx::MessageList windowing > walks up past the messages first drawn with the Up arrow, each one drawn and shown as focus reaches it)
 * @claim "The browser's find in page sees only" registry/ouro/components/ouro/message/message-list.windowing.test.tsx verify:testExists(registry/ouro/components/ouro/message/message-list.windowing.test.tsx::MessageList windowing > finds a message by its text among the app's messages, which the page does not hold, and reveals it)
 * @claim "Each child sits in an element of its own" registry/ouro/components/ouro/message/message-list.windowing.test.tsx verify:testExists(registry/ouro/components/ouro/message/message-list.windowing.test.tsx::MessageList windowing > puts each child in a slot that draws no box, keeping a continued message's spacing, in a list of any length)
 * @claim "as a quote does" registry/ouro/components/ouro/message/message-list.windowing.test.tsx verify:testExists(registry/ouro/components/ouro/message/message-list.windowing.test.tsx::MessageList windowing > shows the quoted message far up the conversation when the reader presses its quote)
 * @claim "A short conversation sits at" registry/ouro/components/ouro/message/message-list.test.tsx verify:testExists(registry/ouro/components/ouro/message/message-list.test.tsx::MessageList > sits a short conversation at its bottom, by the composer under it, with the room above it empty)
 * @claim "put what starts it (who" registry/ouro/components/ouro/message/message-list.test.tsx verify:testExists(registry/ouro/components/ouro/message/message-list.test.tsx::MessageList > sits what starts a short conversation, its first child, right above the first message)
 */
export function MessageList(props: MessageListProps): JSX.Element {
  const {
    label,
    children,
    jumpLabel = "Jump to latest",
    initialAnchor,
    conversation,
    loadingOlder = false,
    hasOlder = false,
    loadingOlderLabel = "Loading older messages",
    newMessageLabel = (author: string, text: string) => `${author}: ${text}`,
    onMessageKeyDown,
    pageKeys = true,
    springy = true,
    maxWidth,
    windowing = true,
    heightCache,
    actionsRef,
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
            '<MessageList label="Conversation"><Message role="user" name="Ana">Hi</Message></MessageList>',
          ],
        ]
      : /* istanbul ignore next @preserve -- production only */ undefined,
  );

  const scrollerRef = useRef<HTMLDivElement | null>(null);
  const contentRef = useRef<HTMLDivElement | null>(null);
  // Whether the view follows new content: whether it was at the bottom before the content changed.
  const pinned = useRef(true);
  const [showJump, setShowJump] = useState(false);
  const [spoken, setSpoken] = useState<Spoken[]>([]);
  const nextId = useRef(0);
  // The newest label function, for the observer set up once below.
  const labelFor = useRef(newMessageLabel);
  const keyFor = useRef(onMessageKeyDown);
  const anchorFor = useRef(initialAnchor);
  const pagesFor = useRef(pageKeys);
  useLayoutEffect(() => {
    labelFor.current = newMessageLabel;
    keyFor.current = onMessageKeyDown;
    anchorFor.current = initialAnchor;
    pagesFor.current = pageKeys;
  });
  // The list's ends, which Tab passes through to leave the messages behind (see the keyboard effect).
  const startRef = useRef<HTMLSpanElement | null>(null);
  const endRef = useRef<HTMLSpanElement | null>(null);
  // The mark that holds the scroll height while the list follows its end (see the layout effect).
  const floorRef = useRef<HTMLSpanElement | null>(null);
  // Moves focus to a message, making it the Tab stop; set by the keyboard effect.
  const moveTo = useRef<(item: HTMLElement) => void>(undefined);
  const keyHandler = useRef<(event: KeyboardEvent<HTMLElement>) => void>(undefined);
  // With messages, a message is the Tab stop and the region is not; without, the region is while it scrolls.
  // Stryker disable next-line ArrowFunction,ConditionalExpression,EqualityOperator: a first guess only; the keyboard effect counts the messages before the first paint.
  const [hasItems, setHasItems] = useState(() => Children.count(children) > 0);

  // A page of older messages that comes at once goes in a chunk a frame, those nearest the reader first: each frame's
  // work stays short, and the reader's place is kept as each chunk goes in. A few go in at once.
  const all = Children.toArray(children);
  const top = keyOf(all[0]);
  // Above WINDOW_ABOVE children, only the messages near the view draw; see "The window" below.
  const windowed = windowing && all.length > WINDOW_ABOVE;
  // The key of the first child, and of the first one drawn: a page of older ones above it waits.
  // Stryker disable next-line ObjectLiteral: an empty start takes the first child's key in the first render instead; this only spares that render.
  const [edge, setEdge] = useState(() => ({ first: top, drawn: top }));
  // A windowed list puts a page of older messages in at once, as space above the messages drawn, so it waits for none and
  // spares the render this would cost. Should it become whole again, what it drew first stays the edge.
  if (!windowed && top !== edge.first) setEdge({ first: top, drawn: all.findIndex((child) => keyOf(child) === edge.drawn) > CHUNK ? edge.drawn : top });
  const shown = windowed ? all : all.slice(Math.max(0, all.findIndex((child) => keyOf(child) === edge.drawn)));
  const keys = all.map((child, index) => String(keyOf(child) ?? index));

  // The window: which children draw, and the space kept for the others. Each child sits in a slot of its own that draws
  // no box, so the list's spacing and the continued messages' margins work as without one.
  // The heights of every child measured, by key and width, kept for the life of the list or by the app (`heightCache`).
  const [ownCache] = useState(() => new Map<string, number>());
  const cache = heightCache ?? ownCache;
  const [measured, setMeasured] = useState<Measured>(() => ({ heights: new Map(), gap: 16, estimate: ESTIMATE, bucket: cache.get(CACHED_WIDTH) ?? null }));
  const cacheRef = useRef(cache);
  useLayoutEffect(() => {
    cacheRef.current = cache;
  });
  // The children drawn around the view: the first and last, by key, as `<first>\0<last>`, so setting the same band again changes nothing.
  const [band, setBand] = useState<string | null>(null);
  const [reach, setReach] = useState<Reach | null>(null);
  // What a `reveal` waits on: told whether its message came into view, once it has or another took its place.
  const revealed = useRef<((found: boolean) => void) | null>(null);
  const settleRef = useRef((found: boolean) => {
    revealed.current?.(found);
    revealed.current = null;
    setReach(null);
  });
  // A new message to reach, in place of one still on its way.
  const requestRef = useRef((next: Reach) => {
    revealed.current?.(false);
    revealed.current = null;
    setReach(next);
  });
  if (!windowed && band !== null) setBand(null);
  // The newest child's key the announcements last heard of, so the children after it, which just arrived, draw until they are heard.
  const [heard, setHeard] = useState<string | null>(null);
  // The keys of the messages the announcements wait on, kept drawn until a reply that streamed is heard.
  // Stryker disable next-line StringLiteral: no child's key is any text before the announcements publish theirs; each begins with a dot.
  const [waitingKeys, setWaitingKeys] = useState("");
  // The key of the child focus was last in, kept drawn so focus stays as the reader scrolls away.
  const [focusKey, setFocusKey] = useState<string | null>(null);
  const estimate = measured.estimate;
  const sizeOf = (index: number) => measured.heights.get(keys[index]!) ?? cache.get(`${keys[index]!}\0${measured.bucket}`) ?? estimate;
  let draws: (index: number) => boolean = () => true;
  if (windowed) {
    const indexes = new Map(keys.map((key, index) => [key, index]));
    const last = keys.length - 1;
    let range: readonly [number, number];
    if (band !== null) {
      // A band whose edge was deleted draws none of it: the window finds itself again, from what is drawn, before the browser
      // draws, and the space kept for what went keeps the rest where it was.
      const [from, to] = band.split("\0");
      // Stryker disable next-line LogicalOperator,UnaryOperator: whatever range a band with a deleted edge draws, the window finds itself again before the browser draws.
      range = [indexes.get(from!) ?? last, indexes.get(to!) ?? -1];
    } else if (showJump && indexes.has(String(edge.drawn))) {
      // A list the reader scrolled up in that grows long (older history loading above, newer messages after) draws, to begin
      // with, no more than the WINDOW_ABOVE children it drew whole, from the first of them: the rest, and what came with the
      // page, is space. The window then finds itself from where those children are, before the browser draws, so the view
      // stays where it is. One at its end opens at its end.
      const from = indexes.get(String(edge.drawn))!;
      range = [from, Math.min(last, from + WINDOW_ABOVE)];
    } else range = firstRange(keys.length, sizeOf, initialAnchor === undefined ? -1 : childNamed(all, keys, initialAnchor));
    const kept = new Set<number | undefined>([last, indexes.get(focusKey!), reach === null ? undefined : indexes.get(reach.key)]);
    // What just arrived after the newest heard, so it is heard, and what still streams, so its end is.
    const since = indexes.get(heard!) ?? last;
    // Stryker disable next-line EqualityOperator: the newest is kept as the last child anyway.
    for (let index = Math.max(since + 1, last + 1 - KEEP_ARRIVED); index <= last; index++) kept.add(index);
    for (const key of waitingKeys.split("\n")) kept.add(indexes.get(key));
    all.forEach((child, index) => {
      if (!isValidElement(child)) return;
      const props = child.props as { streaming?: unknown; "aria-busy"?: unknown };
      if (props.streaming === true || props["aria-busy"] === true || props["aria-busy"] === "true") kept.add(index);
    });
    draws = (index) => (index >= range[0] && index <= range[1]) || kept.has(index);
  }
  // The slots, with space kept for each run of children not drawn: their heights and the gaps between them, less the gap the
  // list puts before the space itself.
  const slots: ReactNode[] = [];
  let run: number | null = null;
  const space = (end: number) => {
    let height = 0;
    for (let index = run!; index < end; index++) height += sizeOf(index) + (index > 0 && sizeOf(index) > 0 ? measured.gap : 0);
    // Children that draw nothing take no space, and no gap either.
    // Stryker disable next-line ConditionalExpression,EqualityOperator: a run of only such children lies between two kept children far from the view, which the window then draws together.
    if (height > 0) slots.push(<div key={`space:${keys[run!]}`} aria-hidden="true" data-ouro-message-list-space="" className="shrink-0" style={{ height: Math.max(0, height - (run! > 0 ? measured.gap : 0)) }} />);
    run = null;
  };
  shown.forEach((child, at) => {
    const index = at + all.length - shown.length;
    if (!draws(index)) {
      run ??= index;
      return;
    }
    if (run !== null) space(index);
    slots.push(
      <div key={keys[index]} {...{ [SLOT]: keys[index] }} className="contents">
        {child}
      </div>,
    );
  });
  // The newest always draws, so no run is left after it.
  // What the window's effects read: the latest render's.
  const view = { windowed, all, keys, measured, band, reach, sizeOf };
  const viewRef = useRef(view);
  useLayoutEffect(() => {
    viewRef.current = view;
  });
  // The keys of the newest few children: when they or the first child's change, the list looks again for a switch.
  const recent = all.slice(-RECENT).map(keyOf);
  // Every key the list held when its first or newest ones last changed, and the conversation they were: another conversation is a new
  // `conversation`, or without one, messages that share no key with those. Whether the list has held messages, and how many times
  // it has switched to another conversation since.
  const [track, setTrack] = useState(() => ({
    first: top,
    recent,
    keys: new Set(all.map(keyOf)),
    conversation,
    pending: null as { conversation: Key | undefined; keys: ReadonlySet<Key | null> } | null,
    // The keys it held when its conversation was last confirmed: what a wholesale change under the same name leaves alone.
    confirmed: new Set(all.map(keyOf)) as ReadonlySet<Key | null>,
    held: all.length > 0,
    switches: 0,
  }));
  // Messages that share no key with `keys`: another conversation's, or the first ones.
  const strangers = (keys: ReadonlySet<Key | null>) => !all.some((child) => keyOf(child) !== null && keys.has(keyOf(child)));
  const changed = top !== track.first || recent.length !== track.recent.length || recent.some((key, at) => key !== track.recent[at]);
  const renamed = conversation !== track.conversation && (track.pending === null || conversation !== track.pending.conversation);
  // Named back to the conversation it holds before another one's messages came: nothing waits.
  const back = track.pending !== null && conversation === track.conversation;
  if (changed || renamed || back) {
    // A conversation is switched to when `conversation` changes with its messages, or, named before they come (as an app
    // that keeps the last messages while it fetches does), when messages come that share no key with those it held then.
    // One first named for messages the list holds names them. Without `conversation`, messages that share no key with
    // those held are another conversation's.
    let pending = renamed || back ? null : track.pending;
    let fresh = false;
    let named = track.conversation;
    if (all.length === 0) {
      // None to show: whatever is named waits for its messages.
      if (renamed) pending = { conversation, keys: track.keys };
    } else if (!track.held) {
      fresh = true;
      named = conversation;
    } else if (renamed && track.conversation === undefined) {
      fresh = changed && strangers(track.keys);
      named = conversation;
    } else if (renamed && changed) {
      fresh = true;
      named = conversation;
    } else if (renamed) {
      // Messages already another conversation's, come before their name, take the name with no switch; else it waits for them.
      if (strangers(track.confirmed)) named = conversation;
      else pending = { conversation, keys: track.keys };
    } else if (pending !== null) {
      if (strangers(pending.keys)) [fresh, named, pending] = [true, pending.conversation, null];
    } else fresh = conversation === undefined && strangers(track.keys);
    const opening = fresh && track.held;
    if (opening) {
      // The other conversation draws from its newest, whatever of the one before was drawn.
      setEdge({ first: top, drawn: top });
      setBand(null);
      // A reveal on its way finds nothing in the conversation before; the next opens at its newest, with no jump to offer and
      // no focus kept on a message of the one before.
      settleRef.current(false);
      setFocusKey(null);
      setShowJump(false);
    }
    setTrack({
      first: top,
      recent,
      keys: new Set(all.map(keyOf)),
      conversation: named,
      pending,
      // Confirmed again by a new name or switch, and by any change under the same name but a wholesale one, which may be the
      // next conversation's messages come ahead of its name.
      confirmed:
        named !== track.conversation || fresh || (pending === null && all.length > 0 && track.keys.size > 0 && !strangers(track.keys)) ? new Set(all.map(keyOf)) : track.confirmed,
      held: track.held || all.length > 0,
      switches: track.switches + (opening ? 1 : 0),
    });
  }
  const latest = useRef(all);
  useLayoutEffect(() => {
    latest.current = all;
  });
  useEffect(() => {
    // Stryker disable next-line ConditionalExpression: with nothing waiting, a step draws from the first child, as now; this only spares a render.
    if (edge.drawn === edge.first) return;
    // A frame apart, the next chunk: the one above those drawn.
    const frame = requestAnimationFrame(() =>
      setEdge((now) => {
        const list = latest.current;
        return { ...now, drawn: keyOf(list[Math.max(0, list.findIndex((child) => keyOf(child) === now.drawn) - CHUNK)]) };
      }),
    );
    // Stryker disable next-line all: a step left from before goes in the same render as the next one; cancelling it only spares the call.
    return () => cancelAnimationFrame(frame);
  }, [edge]);
  // Another conversation opens at its newest message, wherever the reader was in the one before, before the browser draws it.
  const reopen = useRef<() => void>(undefined);
  // Set as the list switches, for the keyboard effect: focus on a message that went goes to the new conversation's Tab stop.
  const switched = useRef(false);
  useLayoutEffect(() => {
    if (track.switches === 0) return;
    switched.current = true;
    reopen.current!();
  }, [track.switches]);

  // While older messages may load, room above the first message holds "Loading older messages". It outlasts `hasOlder`
  // until it has left the view, or the list is at its end, so it goes without moving a message.
  const [room, setRoom] = useState(hasOlder);
  if (hasOlder && !room) setRoom(true);
  const roomRef = useRef<HTMLDivElement | null>(null);
  useLayoutEffect(() => {
    if (hasOlder || !room) return;
    const scroller = scrollerRef.current!;
    const drop = () => {
      // Stryker disable next-line EqualityOperator: room whose bottom meets the view's top to the pixel is out of view either way.
      if (pinned.current || roomRef.current!.getBoundingClientRect().bottom <= scroller.getBoundingClientRect().top) setRoom(false);
    };
    drop();
    // Stryker disable next-line ObjectLiteral,BooleanLiteral: passive only lets the browser scroll without waiting for this listener.
    scroller.addEventListener("scroll", drop, { passive: true });
    // Stryker disable next-line all: once the room is gone or wanted again, nothing reads what this listener would change; removing it frees memory only.
    return () => scroller.removeEventListener("scroll", drop);
  }, [hasOlder, room]);

  const keyboardRef = useKeyboardScrollable<HTMLDivElement>(!hasItems);
  const setScroller = useMergedRef<HTMLDivElement | null>(keyboardRef, scrollerRef);

  // The springs, while `springy`: told when the list scrolls itself, so no message trails that.
  const springsRef = useRef<Springs | null>(null);
  // Whether to reduce motion, asked afresh each time, so a change of the setting counts at once.
  const { motion } = useOuro();
  const motionRef = useRef(motion);
  useLayoutEffect(() => {
    motionRef.current = motion;
  }, [motion]);
  useLayoutEffect(() => {
    if (!springy) return;
    const handle = springs(scrollerRef.current!, contentRef.current!, () => reducesMotion(motionRef.current));
    springsRef.current = handle;
    return () => {
      handle.stop();
      // Stryker disable next-line all: a stopped handle's `moved` changes nothing in the page.
      springsRef.current = null;
    };
  }, [springy]);

  // Keeps the reader's place after messages came, went, moved or changed size: set by the effect below.
  const holdRef = useRef<() => void>(undefined);

  const toBottom = useCallback(() => {
    const scroller = scrollerRef.current!;
    const before = scroller.scrollTop;
    scroller.scrollTop = scroller.scrollHeight;
    springsRef.current?.moved(scroller.scrollTop - before);
  }, []);

  // Goes to the end and follows it again: a message that arrives before the browser reports the scroll is followed too.
  const toNewest = () => {
    // Stryker disable next-line BooleanLiteral: the list holds where its end was when last measured, which is where this scrolls it, so it follows there anyway; this covers an end that moved since.
    pinned.current = true;
    toBottom();
    setShowJump(false);
  };

  // Open at the newest message (or at `initialAnchor`), then follow growth (new messages, streaming text, images
  // loading, the keyboard resizing the list) only while pinned. Layout effect and resize
  // observer callbacks run before paint, so the view never flashes off the bottom.
  // While unpinned, the first message whose top is in view stays where it is, so older history
  // loading above it never moves the reader, even in the frame they scroll. This replaces the
  // browser's scroll anchoring, which is off: Chrome's adjustment read as the reader scrolling
  // up, and Safari has none. Where an app turns the browser's anchoring back on
  // (`overflow-anchor: auto` on the scroller) and the browser has it, the browser corrects alone.
  useLayoutEffect(() => {
    const scroller = scrollerRef.current!;
    const content = contentRef.current!;
    // The messages whose top is in view (else the one filling it), each with where it sits in the
    // content. Those still in the page are held in place, by the ones that moved together: one may
    // itself have been replaced (a key change), or moved away on its own (a post that a reply moved
    // to the end). Where a message sits in the content does not change as the list scrolls, so the
    // reader's own scrolling in the same frame is never taken back.
    // Stryker disable next-line ArrayDeclaration: keepAnchor fills it below, before the observer can first read it.
    let anchors: { node: Element; at: number }[] = [];
    // How far the list could scroll when the anchors were taken. A scroll event that finds it changed came
    // after messages came, went or grew, and before the resize observer has kept the reader's place.
    let end = 0;
    // The scroll position then: the reader's scrolling since is what the correction leaves alone.
    let taken = 0;
    // The part of the corrections the scroll position could not take yet: WebKit keeps it in whole pixels, and a move under
    // half a pixel is not made, so each correction's remainder goes into the next. Dropped, the remainders of a page of older
    // messages drawn a row a frame would add up, and the reader's place would creep.
    let owed = 0;
    const keepAnchor = () => {
      const view = scroller.getBoundingClientRect();
      // Finds the anchors among the nodes, in the order they come in the page.
      const find = (nodes: readonly Element[]) => {
        const origin = content.getBoundingClientRect().top;
        // Laid out, the messages' tops only grow down the page (one inside another starts within it), so the first whose top
        // is in view is found by halving, and only the messages near the view are read: a long conversation, scrolled, costs
        // what a short one does.
        // Stryker disable next-line EqualityOperator: a message whose top meets the view's edge to the pixel is the same anchor either way.
        const first = halve(nodes, (box) => box.top < view.top);
        // The messages whose top is in view, so not one partly above the view, whose growth the reader is not reading. When none
        // starts in view, the messages filling it, then those that start within a view's height below it.
        const held: { node: Element; at: number }[] = [];
        const take = (from: number, until: number) => {
          for (let at = from; at < nodes.length; at++) {
            if (!laidOut(nodes[at]!)) continue;
            const top = boxOf(nodes[at]!).top;
            // Stryker disable next-line EqualityOperator: a message whose top meets the edge to the pixel is out of the band either way.
            if (top >= until) break;
            held.push({ node: nodes[at]!, at: top - origin });
          }
        };
        take(first, view.bottom);
        if (held.length === 0) {
          // Back from the first below the view's top, those that reach into the view, through to a message that is inside no other.
          for (let at = first - 1; at >= 0; at--) {
            if (!laidOut(nodes[at]!)) continue;
            const box = boxOf(nodes[at]!);
            // Stryker disable next-line EqualityOperator: a message that ends exactly at the view's top is out of view either way, and one below follows it.
            if (box.bottom > view.top) held.unshift({ node: nodes[at]!, at: box.top - origin });
            if (!content.contains(nodes[at]!.parentElement!.closest(items))) break;
          }
          take(first, view.bottom + view.height);
          // A windowed list may draw only messages far below the view, as it is moved to a place not yet drawn: they hold it.
          if (held.length === 0) take(first, Infinity);
        }
        return held;
      };
      anchors = find([...content.querySelectorAll(items)]);
      // When no message shows, what a child draws that holds none (a day's heading) holds the place: it may be all the view
      // shows, as when it is revealed in a windowed list, with the messages around it not drawn yet.
      // An anchor is never wholly above the view (those that reach into it are the ones taken), so it shows when it starts above the view's end.
      // Stryker disable next-line EqualityOperator: a message whose edge meets the view's to the pixel shows none of itself either way.
      if (!anchors.some(({ node }) => boxOf(node).top < view.bottom)) anchors = find([...content.querySelectorAll(`${items}, [${SLOT}] > :not(${items}):not(:has(${items}))`)]);
      end = farthest();
      taken = scroller.scrollTop;
    };
    const farthest = () => scroller.scrollHeight - scroller.clientHeight;
    // At the bottom as the list was before this change, or as it is now: growth at the end, or the
    // view getting shorter, leaves a list that was at the bottom still there, and a scroll anywhere
    // else (the reader's, a key's, or code going to a message) leaves it.
    // Stryker disable next-line EqualityOperator: a list exactly as far from the bottom as counts as at it is at its end either way.
    const atBottom = () => Math.abs(end - scroller.scrollTop) <= AT_BOTTOM || farthest() - scroller.scrollTop <= AT_BOTTOM;
    // While the list follows its end, the scroll height keeps at least the content's height there, held by a 1px mark at that
    // depth (`floorRef`), so a change that shortens the content for a moment and lengthens it again (a picture's placeholder
    // swapped for the picture, with a layout read between) never lets the browser pull the scroll position up, which would
    // stop the following with no one scrolling. The mark is placed absolutely, so moving it lays out nothing else. A real
    // change of height resizes the content, and the resize observer moves the mark with it before the browser draws. Once
    // the reader has left the end, the next change lets it go, which moves nothing, since what it holds is past the
    // content's end; not the scroll itself, since moving the mark then stops WebKit's own scroll anchoring where an app has
    // it on.
    const floorMark = floorRef.current!;
    let floor = 0;
    const setFloor = (px: number) => {
      if (px === floor) return;
      floor = px;
      // Out of the layout when it holds nothing, so moving it never stops the browser's own scroll anchoring.
      floorMark.style.display = px > 0 ? "block" : "";
      floorMark.style.top = `${Math.max(0, px - 1)}px`;
    };
    const followEnd = () => {
      const height = content.offsetHeight;
      setFloor(height > scroller.clientHeight ? height : 0);
      toBottom();
    };
    // Whether the list has opened: at its first messages, at `initialAnchor` if it holds that message, else at the newest.
    let opened = false;
    const open = () => {
      if (content.querySelector(items) === null) return;
      opened = true;
      const id = anchorFor.current;
      // By id, else the first message of the child with that key.
      const keyed = (name: string) => {
        const slot = [...content.querySelectorAll(`:scope > [${SLOT}]`)].find((node) => keyIs(node.getAttribute(SLOT)!, name));
        return slot && topItems(slot)[0];
      };
      const target = id ? (topItems(content).find((item) => item.id === id) ?? keyed(id)) : undefined;
      // None: the list stays at the end, as it opened, and follows the messages there: it goes there now, with messages that came
      // after it mounted empty, before the browser draws them, unless code already scrolled it to one of them.
      if (!target) {
        pinned.current = atBottom();
        if (pinned.current) followEnd();
        return keepAnchor();
      }
      const view = scroller.getBoundingClientRect();
      const box = boxOf(target);
      // In the middle of the view, or its top at the view's top when it is taller. The springs are at rest as it opens.
      scroller.scrollTop += box.top - view.top - Math.max(0, (scroller.clientHeight - box.height) / 2);
      // Held from here, so older messages loading before the browser reports this scroll leave it where it opened, and
      // following only if it opened at the end (the anchor was the newest).
      keepAnchor();
      pinned.current = atBottom();
    };
    followEnd();
    keepAnchor();
    open();
    // The window keeps the reader's place this way too, before it reads where the view is.
    holdRef.current = () => hold();
    reopen.current = () => {
      pinned.current = true;
      followEnd();
      keepAnchor();
      setShowJump(false);
    };
    // After messages come, go, move or change size: follow the end while pinned, else hold the anchor in place.
    const hold = () => {
      // Away from the bottom, by a scroll the scroll event has not reported yet (code scrolled to a message, a key), stops the following.
      // A list at the old bottom follows. One that was following keeps on when its end came up, though something grew below
      // in the same frame: the browser pulled the scroll down, the reader did not scroll. One the bottom came up to that was
      // not following starts only when the browser reports that scroll: in a windowed list the bottom may come up as heights
      // replace estimates above the view, which holding the place below undoes first.
      // Stryker disable next-line EqualityOperator: a list exactly as far from the bottom as counts as at it is at its end either way.
      pinned.current = Math.abs(end - scroller.scrollTop) <= AT_BOTTOM || (pinned.current && farthest() < end - AT_BOTTOM);
      // A scroll of the list's height or more since the anchors were taken (to the top, to a message far off) set its own place: the held message has left the view.
      // Stryker disable next-line EqualityOperator: a scroll of exactly the list's height leaves the held message at the view's edge either way.
      const near = Math.abs(scroller.scrollTop - taken) < scroller.clientHeight;
      // Where an app turned the browser's own anchoring back on, the browser corrects.
      // Stryker disable next-line ConditionalExpression,StringLiteral: Chrome gives up its own anchoring once the list scrolls in that frame, so whether a second correction lands depends on timing a test cannot hold.
      const native = getComputedStyle(scroller).overflowAnchor === "auto";
      if (pinned.current) {
        owed = 0;
        followEnd();
      } else setFloor(0);
      if (!pinned.current && near && !native) {
        // Each message held that is still in the page, with where it sat in the content and how far it moved since. With each, how many
        // of the others it passed or fell behind: a message that moved on its own (a post that a reply moved to the end) passed them.
        const origin = content.getBoundingClientRect().top;
        const held = anchors.filter(({ node }) => node.isConnected).map(({ node, at }) => ({ at, moved: boxOf(node).top - origin - at }));
        const ranked = held.map((message) => ({
          moved: message.moved,
          // Stryker disable next-line EqualityOperator: two messages never sit at one place, and a message compared with itself is alike either way.
          passed: held.filter((other) => other.at < message.at !== other.at + other.moved < message.at + message.moved).length,
        }));
        // The place is held by the messages that moved together, not one that moved away: of those, the one that moved least (with only
        // one other in view, the one that did not go), and the first of those that moved alike.
        const moved = (ranked.sort((a, b) => a.passed - b.passed || Math.abs(a.moved) - Math.abs(b.moved))[0]?.moved ?? 0) + owed;
        owed = moved;
        if (Math.abs(moved) >= 0.5) {
          const before = scroller.scrollTop;
          scroller.scrollTop += moved;
          const applied = scroller.scrollTop - before;
          springsRef.current?.moved(applied);
          // What rounding left over, carried: under a pixel. A move the browser did not apply in full (the list's end or start stopped it, smooth scrolling or snapping took it) is not a debt a later write can pay.
          owed = Math.abs(moved - applied) < 1 ? moved - applied : 0;
        }
      } else owed = 0;
      keepAnchor();
    };
    const follow = new ResizeObserver(hold);
    follow.observe(content);
    follow.observe(scroller);
    // Messages that move without the list changing size (a post moved to the end by a reply) resize nothing: while
    // the reader is scrolled up, the anchor is held as they move, before the browser draws. A move that also resizes
    // the list is held here first, and the resize observer then finds it held. At the end, the list follows wherever its end
    // went: something put in a message that reaches past the end (a reply's action bar, which loads after the message,
    // beside its last line) moves the end without resizing anything, so the resize observer would not see it.
    const moves = new MutationObserver((records) => {
      const touched = records.some(touchesItems);
      // The first messages, which may come after the list mounted empty, open it, before the browser draws them.
      if (!opened) return open();
      // Stryker disable next-line ConditionalExpression,LogicalOperator: a change that resizes the list is followed or held by the resize observer in the same frame, and holding when nothing moved finds nothing moved; both only spare the work.
      // The mark holds the scroll height, so a committed change of the content's own height is looked for too.
      if (pinned.current ? farthest() !== end || (floor > 0 && content.offsetHeight !== floor) : touched) hold();
    });
    moves.observe(content, { childList: true, subtree: true });
    const onScroll = () => {
      // Leaving the bottom, even by a few pixels, stops the following; reaching it again follows.
      pinned.current = atBottom();
      // Messages changed since the anchors were taken: leave them for the resize observer, which comes next.
      if (farthest() === end) keepAnchor();
      setShowJump(!pinned.current);
    };
    scroller.addEventListener("scroll", onScroll, { passive: true });
    // Stryker disable next-line all: once the list is gone, nothing reads what these would change; disconnecting frees memory only.
    return () => (follow.disconnect(), moves.disconnect(), scroller.removeEventListener("scroll", onScroll));
  }, [toBottom]);

  // The window, after every render that changed what it draws, every scroll and every resize: measures the slots drawn,
  // keeps the reader's place as their heights replace the estimates, brings a message asked for into view, and draws the
  // children the view and OVERSCAN reach.
  const windowSync = useRef<(scrolled: boolean) => void>(undefined);
  // Where each slot drawn sits in the content, and its size, as last measured.
  const tops = useRef(new Map<string, { top: number; size: number }>());
  // How many messages each child drawn holds: a child that starts the conversation holds none.
  const counts = useRef(new Map<string, number>());
  // What the window last read, so a render that changed none of it (the app drawing again as someone types) reads no layout.
  const synced = useRef<{ keys: readonly string[]; band: string | null; measured: Measured; reach: Reach | null; windowed: boolean } | null>(null);
  useLayoutEffect(() => {
    const scroller = scrollerRef.current!;
    const content = contentRef.current!;
    const slotOf = (key: string) => [...content.children].find((node) => node.getAttribute(SLOT) === key);
    // Scrolls a message into view: to the middle, to the top, or as little as it takes.
    const bring = (element: HTMLElement, block: MessageListRevealBlock) => {
      const box = boxOf(element);
      const top = scroller.getBoundingClientRect().top;
      const room = scroller.clientHeight;
      const before = scroller.scrollTop;
      // Stryker disable next-line EqualityOperator: at the margin to the pixel, the message is where scrolling would put it.
      const above = box.top < top + EDGE || box.height > room - 2 * EDGE;
      // Stryker disable next-line EqualityOperator: at the margin to the pixel, the message is where scrolling would put it.
      const below = box.bottom > top + room - EDGE;
      const centred = box.top - top - Math.max(0, (room - box.height) / 2);
      scroller.scrollTop += block === "center" ? centred : block === "start" || above ? box.top - top - EDGE : below ? box.bottom - top - room + EDGE : 0;
      springsRef.current?.moved(scroller.scrollTop - before);
    };
    windowSync.current = (scrolled) => {
      const { windowed, keys, measured, reach, sizeOf } = viewRef.current;
      // A list inside a hidden panel draws nothing to measure or place; it does once it shows, and resizes.
      if (windowed && content.getClientRects().length === 0) return;
      if (windowed && !scrolled) {
        const contentTop = content.getBoundingClientRect().top;
        let heights: Map<string, number> | undefined;
        const rounded = Math.round(scroller.clientWidth / BUCKET);
        // Stryker disable next-line ArithmeticOperator: the bucket only keys the cache, and any one number for each rounded width keys it alike.
        const bucket = rounded * BUCKET;
        cacheRef.current.set(CACHED_WIDTH, bucket);
        // At a new width the heights are those of the old: the rows not drawn keep them as estimates until they draw.
        if (measured.bucket !== bucket) heights = new Map(measured.heights);
        const found = new Map<string, { top: number; size: number }>();
        for (const slot of content.querySelectorAll(`:scope > [${SLOT}]`)) {
          const key = slot.getAttribute(SLOT)!;
          const { top, size } = extentOf(slot);
          // Only a child that draws a box has a place to find the others by.
          if (size > 0) found.set(key, { top: top - contentTop, size });
          counts.current.set(key, topItems(slot).length);
          cacheRef.current.set(`${key}\0${bucket}`, size);
          if (measured.heights.get(key) !== size) (heights ??= new Map(measured.heights)).set(key, size);
        }
        tops.current = found;
        if (heights !== undefined) {
          // The heights of children gone are forgotten.
          const present = new Set(keys);
          // Stryker disable next-line ConditionalExpression,CallExpression: keeping a gone child's height only holds memory: a key that comes back is measured again as it draws.
          for (const key of heights.keys()) if (!present.has(key)) heights.delete(key);
          // A render follows at once, which comes back here with the space kept at its new size. The gap is 1rem, so it
          // changes only with the font size, which changes the heights too.
          setMeasured({ heights, gap: parseFloat(getComputedStyle(content).rowGap), estimate: measured.heights.size === 0 ? averageOf(heights) : measured.estimate, bucket });
          return;
        }
        holdRef.current!();
      }
      if (reach !== null && !scrolled) {
        const slot = slotOf(reach.key);
        if (slot === undefined) {
          // Not drawn yet (a page of older messages going in a few at a time), or gone.
          if (!keys.includes(reach.key)) settleRef.current(false);
        } else {
          const found = topItems(slot);
          // By id: the message it is in, else what the child draws around it (what starts the conversation).
          const named = [...slot.querySelectorAll<HTMLElement>("[id]")].find((node) => node.id === reach.id);
          const target =
            reach.id === null
              ? ((reach.forward ? found[0] : found.at(-1)) ?? (reach.child ? (slot.firstElementChild as HTMLElement) : undefined))
              : named && named.closest<HTMLElement>(`${items}, [${SLOT}] > *`)!;
          if (target === undefined) {
            // A child with no message in it (a day's heading): by key, the next child, that way, past the ends to none, which
            // settles. None with the id: settles.
            // Stryker disable next-line ConditionalExpression: an id no element in its child has is had by none in the children after, so stepping on settles too, a render each later.
            if (reach.id === null) setReach({ ...reach, key: keys[keys.indexOf(reach.key) + (reach.forward ? 1 : -1)]! });
            else settleRef.current(false);
          } else {
            bring(target, reach.block);
            if (reach.focus) {
              // A message drawn in this frame is not focusable from code yet (the keyboard effect marks it after): setting the
              // tab index it reports makes an element focusable from code, and leaves one that already is as it is.
              target.setAttribute("tabindex", String(target.tabIndex));
              target.focus({ preventScroll: true });
            }
            settleRef.current(true);
            // The place is now where the message went.
            holdRef.current!();
          }
        }
      }
      // Stryker disable next-line ConditionalExpression: a list drawn whole measures no slot to place a band by, and draws every child whatever the band says.
      if (!windowed) return;
      // Where each child starts, with the gap before it, from a slot drawn, which is where it is: the space kept for the
      // children not drawn is built from the heights this reads, so any slot drawn places all of them alike.
      // The view as it is now, once the reader's place is kept.
      const viewTop = scroller.getBoundingClientRect().top - content.getBoundingClientRect().top;
      const viewBottom = viewTop + scroller.clientHeight;
      const over = Math.max(OVERSCAN, scroller.clientHeight);
      const indexes = new Map(keys.map((key, index) => [key, index]));
      const placed = tops.current.entries().next().value;
      // Every child drawn draws nothing (the app hid them all): nothing to place by, until one draws.
      /* istanbul ignore if @preserve -- the newest message always draws; this only keeps a list whose messages are all hidden from drawing every child */
      // Stryker disable next-line ConditionalExpression: the newest message always draws, so there is always a slot to place by.
      if (placed === undefined) return;
      const near = indexes.get(placed[0])!;
      const nearTop = placed[1].top;
      const sizeAt = (index: number) => tops.current.get(keys[index]!)?.size ?? sizeOf(index);
      // Stryker disable next-line ConditionalExpression,LogicalOperator,EqualityOperator: a gap more or less moves the band's edges by the gap, against an overscan fifty times it.
      const extent = (index: number) => sizeAt(index) + (index > 0 && sizeAt(index) > 0 ? measured.gap : 0);
      let sum = 0;
      const sums = keys.map((_, index) => {
        const at = sum;
        sum += extent(index);
        return at;
      });
      // Stryker disable next-line ConditionalExpression,EqualityOperator: a gap more or less moves the band's edges by the gap, against an overscan fifty times it.
      const shift = nearTop - (near > 0 ? measured.gap : 0) - sums[near]!;
      // Stryker disable next-line ArithmeticOperator: the shift is the content's 16px padding, which moves the band's edges by twice that against an 800px overscan.
      const starts = sums.map((at) => at + shift);
      // The band: from the first child that ends below the overscan's top to the last that starts above its bottom. The child
      // the band is placed by is in view, so both stop by it.
      let from = 0;
      // Stryker disable next-line EqualityOperator: a child that ends exactly at the overscan's edge draws or not, and the next scroll corrects it.
      while (starts[from]! + extent(from) <= viewTop - over) from++;
      let to = keys.length - 1;
      // Stryker disable next-line EqualityOperator: a child that starts exactly at the overscan's edge draws or not, and the next scroll corrects it.
      while (starts[to]! >= viewBottom + over) to--;
      setBand(`${keys[from]}\0${keys[to]}`);
    };
    const now = viewRef.current;
    const last = synced.current;
    synced.current = now;
    // Stryker disable next-line ConditionalExpression,LogicalOperator,EqualityOperator,MethodExpression,OptionalChaining,ArrowFunction: this only spares reading the layout on a render that changed nothing the window reads, as the app draws again while someone types.
    if (last?.windowed === now.windowed && last.band === now.band && last.measured === now.measured && last.reach === now.reach && last.keys.length === now.keys.length && last.keys.every((key, index) => key === now.keys[index])) return;
    windowSync.current(false);
  });
  useLayoutEffect(() => {
    const scroller = scrollerRef.current!;
    const content = contentRef.current!;
    // Stryker disable next-line BooleanLiteral: a scroll moves nothing the window measures, so measuring again on it only costs the time.
    const onScroll = () => windowSync.current!(true);
    // Stryker disable next-line ObjectLiteral,BooleanLiteral: passive only lets the browser scroll without waiting for this listener.
    scroller.addEventListener("scroll", onScroll, { passive: true });
    const resized = new ResizeObserver(() => windowSync.current!(false));
    resized.observe(scroller);
    resized.observe(content);
    // Stryker disable next-line all: once the list is gone, nothing reads what these would change; disconnecting frees memory only.
    return () => (resized.disconnect(), scroller.removeEventListener("scroll", onScroll));
  },
  // Stryker disable next-line ArrayDeclaration: any list that never changes runs it once, as this one does.
  []);

  useImperativeHandle(
    actionsRef,
    () => ({
      reveal(id, options) {
        const { all: children, keys: order } = viewRef.current;
        // An element with the id, drawn; else the child with it as its `id` prop, or as its key.
        const inside = [...contentRef.current!.querySelectorAll("[id]")].find((node) => node.id === id);
        const named = childNamed(children, order, id);
        const index = inside !== undefined ? order.indexOf(slotKeyOf(inside)) : named;
        if (index < 0) return Promise.resolve(false);
        // By key, the child itself; by id, the element with it.
        const byKey = inside === undefined && !(isValidElement(children[index]) && (children[index].props as { id?: unknown }).id === id);
        return new Promise<boolean>((resolve) => {
          requestRef.current({ key: order[index]!, id: byKey ? null : id, child: byKey, forward: true, focus: options?.focus ?? false, block: options?.block ?? "center" });
          revealed.current = resolve;
        });
      },
      jumpToNewest: toNewest,
    }),
  );

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
    const textOf = (message: Element) => message.querySelector("[data-ouro-message-content]")?.textContent.trim();
    const spokenTextOf = (message: Element) => message.querySelector<HTMLElement>("[data-ouro-message-content]")!.innerText.trim();
    let known = messages();
    // Each known message's text when last checked, to tell a key swap from a new reply.
    let texts = new Map(known.map((message) => [message, textOf(message)]));
    // Messages to read once they stop streaming.
    let waiting = new Set(known.filter(busy));
    // The children's keys when last checked: in a windowed list, a message drawn again as the reader scrolls is one of
    // them, not a new one. The newest of them is the last heard, and what comes after it is drawn until it is.
    let keysHeard = new Set(viewRef.current.keys);
    // Stryker disable next-line LogicalOperator: the check the list's first drawing runs, before any message arrives, sets the same.
    setHeard(viewRef.current.keys.at(-1) ?? null);
    // A reply that streams out of view stays drawn until it is heard, though it stops streaming.
    const publish = () => setWaitingKeys([...waiting].map(slotKeyOf).join("\n"));
    const redrawn = (message: Element) => viewRef.current.windowed && keysHeard.has(slotKeyOf(message));
    const check = () => {
      const now = messages();
      const before = new Set(known);
      let last = now.length - 1;
      while (last >= 0 && !before.has(now[last]!)) last--;
      if (known.length > 0 && last >= 0) {
        // Messages after the last one still here replace the ones that were there before, and
        // the rest are new. A replacement is the same message under a new key, so silent, only
        // when it keeps the text and is not streaming; one replacing a message still waiting
        // takes its place in the queue. A message that goes keeps its text, so only those that replace one read any:
        // older messages going in above, a chunk at a time, read nothing.
        const replaced = known.slice(known.indexOf(now[last]!) + 1);
        now.slice(last + 1).forEach((message, index) => {
          const old = replaced[index];
          if (redrawn(message)) return;
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
      keysHeard = new Set(viewRef.current.keys);
      setHeard(viewRef.current.keys.at(-1) ?? null);
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
      publish();
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
    // And its child's key, with the children's keys then: when it goes, focus goes to the child now in its place.
    let lastKey: string | undefined;
    let lastKeys: readonly string[] | undefined;
    const remember = (item: HTMLElement) => {
      lastKey = slotKeyOf(item);
      lastKeys = viewRef.current.keys;
    };
    // The message focus is in, until focus leaves it, and whether it went with nothing in its place, waiting for the next messages.
    let focused: HTMLElement | null = null;
    let waiting = false;
    // A Tab press in progress anywhere in the page (true for Shift+Tab), and where the list was
    // scrolled to before it: the browser scrolls to what it focuses before the list sends focus on.
    let tabbing: boolean | null = null;
    let tabTop = 0;
    // The positions this list wrote, so an app's own aria-posinset stands.
    const written = new WeakMap<Element, string>();
    // The list's own messages, as `sync` last found them.
    // Stryker disable next-line ArrayDeclaration: sync(true) finds them below, before any scroll can read them.
    let tops: HTMLElement[] = [];

    // The message an element is in, or is, among this list's messages.
    const itemOf = (node: Element, list = topItems(content)): HTMLElement | null => list.find((item) => item.contains(node)) ?? null;
    // Whether any of a message shows in the list's view.
    const shows = (item: Element) => {
      const box = boxOf(item);
      const view = scroller.getBoundingClientRect();
      // Stryker disable next-line EqualityOperator: a message whose edge meets the list's edge to the pixel counts either way.
      return box.bottom > view.top && box.top < view.bottom;
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
      const box = boxOf(element);
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

    // The Tab stop, while focus is out of the list: the message focus was last in while it shows, else the last message
    // the view shows whole, else the last it shows any of. Laid out, the messages only go down the list, so the last that
    // starts above the view's bottom is found by halving, and only the few in view are read: a scroll through a long
    // conversation costs what one through a short one does.
    const place = (list: HTMLElement[]) => {
      if (current?.isConnected && scroller.contains(doc.activeElement)) return;
      if (last?.isConnected && shows(last)) return setCurrent(last);
      const view = scroller.getBoundingClientRect();
      // Stryker disable next-line EqualityOperator: a message whose top meets the list's bottom to the pixel shows none of itself either way.
      const after = halve(list, (box) => box.top < view.bottom);
      let showing: HTMLElement | null = null;
      for (let at = after - 1; at >= 0; at--) {
        // A hidden message shows nothing, so it is never the Tab stop the view puts focus on.
        if (!laidOut(list[at]!)) continue;
        const box = boxOf(list[at]!);
        // Above the view: so is every message before it.
        // Stryker disable next-line EqualityOperator: a message whose edge meets the list's edge to the pixel counts either way.
        if (box.bottom <= view.top) break;
        showing ??= list[at]!;
        // Stryker disable next-line EqualityOperator: a message whose edge meets the list's edge to the pixel counts either way.
        if (box.top >= view.top && box.bottom <= view.bottom) return setCurrent(list[at]!);
      }
      setCurrent(showing ?? list.at(-1) ?? null);
    };
    // After React's commit, so it reads no layout unless the Tab stop went: reading where messages
    // are here would lay the page out before the browser does, at every new message.
    const sync = (changed: boolean) => {
      // Out of the Tab order, for the list's Tab and the browser's alike (`guards`).
      // Stryker disable next-line StringLiteral: an empty or any other negative tabindex takes a span out of the Tab order too.
      for (const guard of content.querySelectorAll(guards)) guard.setAttribute("tabindex", "-1");
      // A message removed with nothing in its place waited for the next messages, another conversation's: other messages
      // coming instead let it go, so they never take focus from wherever the reader went since.
      if (waiting && changed && !switched.current) [focused, waiting] = [null, false];
      // In another conversation, focus goes to its Tab stop, below, without scrolling: no message is in the old one's place.
      const refocus = focused?.isConnected === false && doc.activeElement === doc.body && switched.current;
      if (focused?.isConnected === false && doc.activeElement === doc.body && !refocus) {
        if (viewRef.current.keys.length === 0) {
          // With no message left, the focus waits for the next ones: another conversation's, say, after the list emptied.
          waiting = true;
        } else {
          focused = null;
          // The child now in its place (the first after it still there, else the newest), which may not be drawn: drawn, then
          // focused. Children that come and go elsewhere, drawn or not, move none of it.
          const { keys } = viewRef.current;
          const present = new Set(keys);
          const was = lastKeys!.indexOf(lastKey!);
          const after = lastKeys!.slice(was + 1).find((later) => present.has(later));
          const kept = new Set(lastKeys);
          // A child that came where the focused one was (its temporary key swapped for the server's) takes focus, not the one after it.
          const before = lastKeys!.slice(0, was).findLast((earlier) => present.has(earlier));
          const next = keys[before === undefined ? 0 : keys.indexOf(before) + 1];
          const key = next !== undefined && !kept.has(next) ? next : (after ?? keys.at(-1));
          // Stryker disable next-line StringLiteral: any block but "center" or "start" scrolls only as far as it needs.
          requestRef.current({ key: key!, id: null, child: false, forward: true, focus: true, block: "nearest" });
        }
      }
      if (refocus) [focused, waiting] = [null, false];
      switched.current = false;
      if (!changed) return;
      const list = (tops = topItems(content));
      // In a windowed list a message's place counts the children not drawn: one message each, until one is drawn and
      // found to hold none (what starts the conversation) or more.
      const { windowed, keys } = viewRef.current;
      const before = new Map<string, number>();
      let size = list.length;
      if (windowed) {
        size = 0;
        for (const key of keys) {
          before.set(key, size);
          size += counts.current.get(key) ?? 1;
        }
      }
      // How many messages of each child came before, in order.
      const within = new Map<string, number>();
      list.forEach((item, index) => {
        // Focusable from code and by a click, in the Tab order only as the current message.
        if (item !== current) mark(item, "tabindex", "-1");
        mark(item, "data-ouro-control", "message-list");
        mark(item, "data-ouro-part", "item");
        const key = slotKeyOf(item);
        const place = within.get(key) ?? 0;
        within.set(key, place + 1);
        const position = String(windowed ? before.get(key)! + place + 1 : index + 1);
        // Only an article takes a position (ARIA allows it there), and one the app set stands.
        const own = item.getAttribute("aria-posinset");
        if (!item.matches('article:not([role]), [role="article"]') || (own !== null && own !== written.get(item))) return;
        written.set(item, position);
        mark(item, "aria-posinset", position);
        mark(item, "aria-setsize", String(size));
      });
      // Stryker disable next-line ConditionalExpression: placing it again picks the same message, since a scroll places it too; this only spares reading the layout.
      if (!current?.isConnected) place(list);
      if (refocus && current !== null) focusOn(current);
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
      // Whatever child focus is in (a message, a button that loads older ones) stays drawn as the reader scrolls away.
      const slot = target.closest(`[${SLOT}]`);
      if (slot !== null) setFocusKey(slot.getAttribute(SLOT));
      if (item === null) return;
      setCurrent(item);
      last = item;
      remember(item);
    };
    // Focus that lands anywhere outside the list lets go of a message that went: the reader has moved on.
    const elsewhere = (event: FocusEvent) => {
      if (!scroller.contains(event.target as Node)) [focused, waiting] = [null, false];
    };
    const focusOut = (event: FocusEvent) => {
      if (scroller.contains(event.relatedTarget as Node | null)) return;
      // Focus left. When it left because what had it was removed, `sync` has already moved it, as
      // the mutation observer runs before this timer.
      // A message that was removed keeps its place, for the next messages to take focus (another conversation's, after the list
      // emptied); Chromium reports its removal as focus leaving.
      const left = focused;
      setTimeout(() => {
        if (focused === left && left?.isConnected) focused = null;
      });
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
      // The list moves focus itself, so each browser's own Tab order (WebKit's on a Mac, which can skip
      // buttons; a popup's focus guards) never decides it. A radio is the browser's: Tab enters its group
      // at the checked one.
      // Stryker disable next-line ConditionalExpression,EqualityOperator,LogicalOperator: in Chromium the browser's Tab goes where the list's would; only WebKit's own Tab order differs.
      if (next === pick(tabbables(scroller)) && next.matches('input[type="radio"]')) return;
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
      // ⌘↑, ⌘↓, ⌥↑ and ⌥↓ on a Mac are its Home, End, Page Up and Page Down.
      const key = navigationKey(event);
      if (event.defaultPrevented) return;
      // Home and the arrow keys find the message among all the children, which a windowed list may not draw: drawn
      // first, it then takes focus.
      const { keys } = viewRef.current;
      const slot = item.closest(`[${SLOT}]`)!;
      const reachFor = (index: number, forward: boolean) => {
        event.preventDefault();
        // Stryker disable next-line StringLiteral: any block but "center" or "start" scrolls only as far as it needs.
        requestRef.current({ key: keys[index]!, id: null, child: false, forward, focus: true, block: "nearest" });
      };
      const list = topItems(content);
      const at = list.indexOf(item);
      const box = boxOf(item);
      const view = scroller.getBoundingClientRect();
      let goal: HTMLElement | undefined;
      switch (key) {
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
          // The first message, which a windowed list may not draw.
          return reachFor(0, true);
        case "End":
          // The newest, which every list draws.
          goal = list.at(-1);
          break;
        case "ArrowDown":
        case "PageDown":
        case "ArrowUp":
        case "PageUp": {
          const forward = key.endsWith("Down");
          const paging = key.startsWith("Page");
          // The app's, with pageKeys={false}: not acted on, nor prevented.
          if (paging && !pagesFor.current) return;
          // A message taller than the list scrolls through first, a line or a page at a time.
          const beyond = forward ? box.bottom - view.bottom + EDGE : view.top + EDGE - box.top;
          // The scroll position is whole device pixels, so holding the place can put a message one device pixel past the edge, on top of the fraction it already sits at (under a pixel): that is a rounding, not more message.
          // Stryker disable next-line EqualityOperator,ArithmeticOperator: a pixel more or less of tolerance is not told apart by any scroll the tests make.
          if (beyond > 1 + 1 / devicePixelRatio) {
            event.preventDefault();
            scroller.scrollTop += (forward ? 1 : -1) * Math.min(beyond, paging ? view.height - LINE : LINE);
            return;
          }
          const step = forward ? 1 : -1;
          // The next message in the same child, else in the next child: drawn beside it, focus moves there at once, as the
          // springs follow; else (a windowed list has not drawn it, or it holds none) the list draws and finds it.
          if (!paging) {
            const own = topItems(slot);
            const sibling = forward ? slot.nextElementSibling : slot.previousElementSibling;
            const beside = sibling === null ? [] : topItems(sibling);
            goal = own[own.indexOf(item) + step] ?? (forward ? beside[0] : beside.at(-1));
            if (goal === undefined) return reachFor(keys.indexOf(slot.getAttribute(SLOT)!) + step, forward);
            break;
          }
          // A page away: the farthest message that starts within a list's height of this one, else the next.
          const near = list.filter(
            // Stryker disable next-line EqualityOperator: a message that starts exactly a list's height away counts either way.
            (other, index) => (forward ? index > at : index < at) && Math.abs(boxOf(other).top - box.top) <= view.height,
          );
          goal = near.at(forward ? -1 : 0) ?? list[at + step];
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
    // The messages, found again only when messages come or go (`sync`), not on every scroll.
    const scrolled = () => place(tops);

    sync(true);
    const observer = new MutationObserver((records) => sync(records.some(touchesItems)));
    observer.observe(content, { childList: true, subtree: true });
    scroller.addEventListener("focusin", focusIn);
    scroller.addEventListener("focusout", focusOut);
    // Stryker disable next-line ObjectLiteral,BooleanLiteral: passive only lets the browser scroll without waiting for this listener.
    scroller.addEventListener("scroll", scrolled, { passive: true });
    doc.addEventListener("keydown", tabKey, true);
    doc.addEventListener("focusin", elsewhere);
    // Stryker disable next-line all: once the list is gone, nothing reads what these listeners would change; removing them frees memory only.
    return () => (observer.disconnect(), scroller.removeEventListener("focusin", focusIn), scroller.removeEventListener("focusout", focusOut), scroller.removeEventListener("scroll", scrolled), doc.removeEventListener("keydown", tabKey, true), doc.removeEventListener("focusin", elsewhere));
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
    toNewest();
    // The button goes, so focus goes to the newest message (or to the list, without messages), not to <body>.
    const newest = topItems(contentRef.current!).at(-1);
    if (newest) return moveTo.current!(newest);
    // Stryker disable next-line ObjectLiteral,BooleanLiteral: the list is at the bottom already, so focusing it scrolls nothing.
    scrollerRef.current!.focus({ preventScroll: true });
  };

  return (
    <div {...rest} data-ouro="message-list" className={cn("relative box-border flex min-h-0 flex-col", className)}>
      {/* No browser scroll anchoring; the layout effect above keeps the reader's place instead. Positioned, so
          parts placed absolutely inside it (screen-reader text, the list's edges) stay in its overflow, not its
          ancestors': there they would let focus or scrollIntoView scroll the page around the list. */}
      <div
        ref={setScroller}
        role="region"
        aria-label={label}
        data-ouro-message-list-scroller=""
        data-ouro-control="message-list"
        data-ouro-part="scroller"
        onKeyDown={(event) => keyHandler.current!(event)}
        className="relative min-h-0 flex-1 overflow-y-auto overscroll-contain [overflow-anchor:none] outline-ring -outline-offset-2 focus-visible:outline-2 focus-visible:outline-solid forced-colors:[&[tabindex='0']]:outline-1 forced-colors:[&[tabindex='0']]:outline-solid forced-colors:[&[tabindex='0']]:-outline-offset-1"
      >
        <span ref={startRef} tabIndex={-1} aria-hidden="true" data-ouro-message-list-edge="" className="absolute outline-none" />
        <div
          ref={contentRef}
          data-ouro-message-list-content=""
          className="box-border flex min-h-full flex-col justify-end gap-4 p-4 [&>[data-ouro-message-list-slot]>[data-continued]]:-mt-3"
          style={maxWidth === undefined ? undefined : { maxWidth, marginInline: "auto" }}
        >
          {/* With the content's own padding, keeps the first message below "Loading older messages", which sits over the list's top. */}
          {room && <div ref={roomRef} aria-hidden="true" data-ouro-message-list-older-room="" className="-mb-4 h-11 shrink-0" />}
          {slots}
        </div>
        <span ref={endRef} tabIndex={-1} aria-hidden="true" data-ouro-message-list-edge="" className="absolute outline-none" />
        <span ref={floorRef} aria-hidden="true" data-ouro-message-list-floor="" className="pointer-events-none absolute start-0 top-0 hidden size-px" />
      </div>
      {/* Read politely, outside the scrolling content, so new messages are heard once. */}
      <div data-ouro-message-list-live="" aria-live="polite" className="sr-only">
        {spoken.map((item) => (
          <p key={item.id}>{item.text}</p>
        ))}
      </div>
      {/* Over the list, never in it, so it moves no message. Always in the page, so screen readers hear it as it shows; a live region without the status role, so an app's own status stays the page's only one. Marked, so an app can set it lower, below a header of its own over the list. */}
      <div data-ouro-message-list-older="" className="pointer-events-none absolute inset-x-0 top-3 flex justify-center">
        <div aria-live="polite">
          {loadingOlder && (
            <span className={olderClass}>
              <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" className="size-4 animate-[ouro-spin_0.8s_linear_infinite] motion-reduce:animate-[ouro-pulse_1.6s_ease-in-out_infinite]">
                <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2.5" opacity="0.25" />
                <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
              </svg>
              {loadingOlderLabel}
            </span>
          )}
        </div>
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
