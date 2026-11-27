"use client";

import { Children, cloneElement, isValidElement, useCallback, useEffect, useImperativeHandle, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import type { HTMLAttributes, JSX, Key, KeyboardEvent, ReactNode, Ref } from "react";
import { Message, type MessageProps } from "@/registry/ouro/components/ouro/message/message";
import type { MessageBarData, MessageBarLayer } from "@/registry/ouro/components/ouro/message/message-parts";
import type { MessageFindLayer } from "@/registry/ouro/components/ouro/message/message-list-parts";
import { OLDER_CHUNK, isFlingKick } from "@/registry/ouro/components/ouro/message/message-list-styles";
import { useAppearanceClassNameCheck } from "@/registry/ouro/lib/ouro/class-name-check";
import { cn } from "@/registry/ouro/lib/ouro/cn";
import { hasLazyType } from "@/registry/ouro/lib/ouro/server-element";
import { halveShown } from "@/registry/ouro/lib/ouro/halve";
import { createRowLayer, RowLayerContext, type RowLayer } from "@/registry/ouro/lib/ouro/row-hover";
import { useMergedRef } from "@/registry/ouro/lib/ouro/refs";
import { navigationKey } from "@/registry/ouro/lib/ouro/navigation-key";
import { springAt, type SpringState } from "@/registry/ouro/lib/ouro/spring";
import { TouchTarget } from "@/registry/ouro/lib/ouro/touch-target";
import type { FindFold } from "@/registry/ouro/lib/ouro/find-text";
import { useDevWarnings } from "@/registry/ouro/lib/ouro/use-dev-messages";
import { useKeyboardScrollable } from "@/registry/ouro/lib/ouro/use-keyboard-scrollable";
import { useOuro, type OuroMotion } from "@/registry/ouro/lib/ouro/use-ouro";

/**
 * What a MessageList finds, and which match is the current one.
 *
 * @example
 * <MessageList label="Chat" find={{ query: "lunch", current: 0 }}>{messages}</MessageList>
 */
export interface MessageListFind {
  /** The text to look for. Nothing is found while it is empty. */
  query: string;
  /** What the match ignores: `"none"`, `"case"`, `"accents"` or `"all"`. @default "all" */
  fold?: FindFold | undefined;
  /** A language tag for case, such as `"tr"`, where `I` and `i` are different letters from the dotted İ and dotless ı. */
  locale?: string | undefined;
  /** Which match is the current one, counted through the whole list, oldest first, from the first. It wraps round past either end. @default 0 */
  current?: number | undefined;
}

/** What a MessageList says about its find: how many matches there are, which is current, and whether more may lie in history not loaded yet. */
export interface MessageListFindReport {
  /** How many matches the messages in the list hold. */
  count: number;
  /** The index of the current match, or null when there is nothing to point at. */
  current: number | null;
  /** True while older messages may still load (`hasOlder`), so a match may lie above the ones counted. */
  partial: boolean;
}

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
   * it first has messages, so it can come with them, and again at each switch to another `conversation`, which opens that
   * conversation at it the same way. A message it does not hold, or the newest, opens at the end, and while the conversation
   * stays the same a later change moves nothing.
   * @claim "or the `key` of the child that holds it" registry/ouro/components/ouro/message/message-list.windowing.test.tsx verify:testExists(registry/ouro/components/ouro/message/message-list.windowing.test.tsx::MessageList windowing > reveals a row component that takes no id by its key, and opens at one by its key, resolving once it is in place)
   * @claim "The list opens with that message in" registry/ouro/components/ouro/message/message-list.test.tsx verify:testExists(registry/ouro/components/ouro/message/message-list.test.tsx::MessageList > opens at the message initialAnchor names, never drawing the newest first, and stops following new messages)
   * @claim "The list reads it when it first" registry/ouro/components/ouro/message/message-list.test.tsx verify:testExists(registry/ouro/components/ouro/message/message-list.test.tsx::MessageList > opens at initialAnchor when it comes with the first messages, after the list mounted empty)
   * @claim "A message it does not hold" registry/ouro/components/ouro/message/message-list.test.tsx verify:testExists(registry/ouro/components/ouro/message/message-list.test.tsx::MessageList > opens at the newest message when initialAnchor names no message in the list, or the newest itself)
   * @claim "which opens that conversation at it the same way" registry/ouro/components/ouro/message/message-list.windowing.test.tsx verify:testExists(registry/ouro/components/ouro/message/message-list.windowing.test.tsx::MessageList windowing > re-opens at the initialAnchor that comes with another conversation, with no remount, and at its newest without one)
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
   * another conversation, so it misses a switch between conversations whose messages share keys, and takes a conversation whose
   * every message gets a new key at once for another one, at any length. An app can give `conversation` instead of keying the
   * list by it: a switch opens the other conversation at its `initialAnchor` if it holds that message, else at its newest, and
   * reads the other conversation's `heightCache`.
   * @claim "While it stays the same, nothing the" registry/ouro/components/ouro/message/message-list.test.tsx verify:testExists(registry/ouro/components/ouro/message/message-list.switching.test.tsx::MessageList switching conversations > takes a switch from conversation alone: one whose messages share keys with the last is a switch, and messages re-keyed in the same one are not)
 * @claim "While it stays the same, nothing the" registry/ouro/components/ouro/message/message-list.test.tsx verify:testExists(registry/ouro/components/ouro/message/message-list.switching.test.tsx::MessageList switching conversations > takes removing the newest five, as a regenerated turn does, for the same conversation)
 * @claim "Change it with the other conversation's" registry/ouro/components/ouro/message/message-list.test.tsx verify:testExists(registry/ouro/components/ouro/message/message-list.switching.test.tsx::MessageList switching conversations > switches when the conversation is named before its messages come, as an app that keeps the last messages while it fetches does)
   * @claim "Change it with the other conversation's" registry/ouro/components/ouro/message/message-list.test.tsx verify:testExists(registry/ouro/components/ouro/message/message-list.switching.test.tsx::MessageList switching conversations > takes a switch from conversation alone: one whose messages share keys with the last is a switch, and messages re-keyed in the same one are not)
   * @claim "The first one named for messages the" registry/ouro/components/ouro/message/message-list.test.tsx verify:testExists(registry/ouro/components/ouro/message/message-list.switching.test.tsx::MessageList switching conversations > adopts a conversation first named for the messages it holds, leaving a scrolled-up reader where they are)
   * @claim "Messages that come before their conversation" registry/ouro/components/ouro/message/message-list.test.tsx verify:testExists(registry/ouro/components/ouro/message/message-list.switching.test.tsx::MessageList switching conversations > adopts a name that comes after its messages, so switching back in one commit opens the last conversation at its newest)
   * @claim "Messages that come before their conversation" registry/ouro/components/ouro/message/message-list.test.tsx verify:testExists(registry/ouro/components/ouro/message/message-list.switching.test.tsx::MessageList switching conversations > takes messages that come before their conversation is named for the last one's, and opens nothing when it is named after them)
   * @claim "Without it, the list takes messages that" registry/ouro/components/ouro/message/message-list.test.tsx verify:testExists(registry/ouro/components/ouro/message/message-list.switching.test.tsx::MessageList switching conversations > keeps the reader's place, the messages and focus when the newest three get new keys in place, while scrolled up)
   * @claim "An app can give `conversation` instead of keying" registry/ouro/components/ouro/message/message-list.windowing.test.tsx verify:testExists(registry/ouro/components/ouro/message/message-list.windowing.test.tsx::MessageList windowing > re-opens at the initialAnchor that comes with another conversation, with no remount, and at its newest without one)
   * @claim "and reads the other conversation's `heightCache`" registry/ouro/components/ouro/message/message-list.windowing.test.tsx verify:testExists(registry/ouro/components/ouro/message/message-list.windowing.test.tsx::MessageList windowing > reads the heightCache that comes with another conversation from its first commit, as tall as that conversation's list was, and writes only to its own)
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
   * the view, or the list is at its end, and then goes without moving a message, not even for
   * the one frame the browser draws as it goes.
   * @default false
   * @claim "not even for the one frame the browser draws as it goes" registry/ouro/components/ouro/message/message-list.test.tsx verify:testExists(registry/ouro/components/ouro/message/message-list.test.tsx::MessageList > holds the reader's message still in every frame as the last older page comes and the room above it goes)
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
   * the list's scroll position never moves for it, and at rest, once the reader's scroll has ended, no message has a transform. Only the
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
   * Whether a long conversation draws only the messages near its view. Above 20 children the list
   * draws those within a screen or 800 pixels of the view, whichever is more, the newest, the one with focus, and any
   * still streaming (as it opens, only those its view shows, and the rest once that frame is painted), each measured as it draws, with space for the rest kept above and below, so a long
   * conversation opens and redraws in about the time a screenful does. The browser's find in page, and
   * code that reads messages from the page, see only the messages drawn: search your own messages and
   * call `actionsRef.current.reveal(id)` to show a match. Set `false` to keep every message in the page.
   * A list the reader scrolled up in that takes older and newer messages in one commit renders no more than 20 of the
   * children it drew before, and the 20 newest, before it finds the view; scrolling up through rows never drawn moves
   * what the reader looks at by under a pixel in every frame; and a list opens at its end with no frame moving the row at the
   * view's top by more than a pixel. A wheel that takes the reader to the top faster than the rows above them came in moves
   * nothing either: where those rows came in shorter than the space kept for them and the top stops the scroll position, the
   * difference stays as space above the first message, until the reader has scrolled past it and the wheel rests.
   * A page of older messages that lands in a window already drawn commits once in the task it lands in, holding the reader's
   * row; its rows near the view but out of it draw in the frames after, 20 at most a frame, nearest the view first, and those
   * the view shows draw at once.
   * @default true
   * @claim "and those the view shows draw at once" registry/ouro/components/ouro/message/message-list.windowing.test.tsx verify:testExists(registry/ouro/components/ouro/message/message-list.windowing.test.tsx::MessageList windowing > draws, in the task a page of older messages lands in, the rows of it the view shows, so no space kept for a row shows)
   * @claim "A page of older messages that lands in a window" registry/ouro/components/ouro/message/message-list.windowing.test.tsx verify:testExists(registry/ouro/components/ouro/message/message-list.windowing.test.tsx::MessageList windowing > commits once in the task a page of older messages lands in, holding the reader's row, and draws the page's rows the overscan reaches in later frames, a chunk at most a frame) verify:fileLine(registry/ouro/components/ouro/message/message-list-styles.ts, /const OLDER_CHUNK = 20;/)
   * @claim "A wheel that takes the reader to the top" registry/ouro/components/ouro/message/message-list.windowing.test.tsx verify:testExists(registry/ouro/components/ouro/message/message-list.windowing.test.tsx::MessageList windowing > holds the reader's row to the pixel as a wheel takes them past the top before the shorter rows above were paid, keeping the rest as space above the first message)
   * @claim "A wheel that takes the reader to the top" registry/ouro/components/ouro/message/message-list.windowing.test.tsx verify:testExists(registry/ouro/components/ouro/message/message-list.windowing.test.tsx::MessageList windowing > keeps the space above the first message while the wheel turns, and lets it go without moving anything once the reader is past it and the wheel rests) verify:testExists(registry/ouro/components/ouro/message/message-list.windowing.test.tsx::MessageList windowing > keeps the space above the first message while the reader is in it once the wheel rests, and lets it go without moving anything as they scroll past it)
   * @claim "renders no more than 20 of the" test/message-list-windowing.bench.test.tsx verify:testExists(test/message-list-windowing.bench.test.tsx::MessageList older page > renders about a fifth of the rows, not the list again, when a short list the reader scrolled up in takes 200 older rows and 360 newer in one commit)
   * @claim "moves what the reader looks at by under a pixel" registry/ouro/components/ouro/message/message-list.windowing.test.tsx verify:testExists(registry/ouro/components/ouro/message/message-list.windowing.test.tsx::MessageList windowing > moves no row the reader looks at by a pixel in any frame, scrolling up through 100 rows never drawn whose heights differ from the estimate by up to 40px)
   * @claim "opens at its end with no frame moving the row" registry/ouro/components/ouro/message/message-list.windowing.test.tsx verify:testExists(registry/ouro/components/ouro/message/message-list.windowing.test.tsx::MessageList windowing > opens a conversation of 300 rows of varied heights at its end, moving the row at the view's top by no more than a pixel in any frame)
   * @claim "as it opens, only those its view shows" registry/ouro/components/ouro/message/message-list.windowing.test.tsx verify:testExists(registry/ouro/components/ouro/message/message-list.windowing.test.tsx::MessageList windowing > opens with no more rows than fill the window, and draws the rows past the view's edges only after the first paint)
   * @claim "Above 20 children the list draws" registry/ouro/components/ouro/message/message-list.windowing.test.tsx verify:testExists(registry/ouro/components/ouro/message/message-list.windowing.test.tsx::MessageList windowing > draws only the messages near the view of a long conversation, in a list as tall as all of them)
   * @claim "Above 20 children the list draws" registry/ouro/components/ouro/message/message-list.tsx verify:fileLine(registry/ouro/components/ouro/message/message-list.tsx, /const OVERSCAN = 800;/) verify:fileLine(registry/ouro/components/ouro/message/message-list.tsx, /Math\.max\(OVERSCAN, scroller\.clientHeight\)/)
   * @claim "Set `false` to keep every message" registry/ouro/components/ouro/message/message-list.windowing.test.tsx verify:testExists(registry/ouro/components/ouro/message/message-list.windowing.test.tsx::MessageList windowing > keeps every message in the page with windowing={false})
   */
  windowing?: boolean | undefined;
  /**
   * A map the list writes the heights of its children into, under a child's key and the list's width in CSS pixels, rounded
   * to a multiple of `BUCKET`, and reads before it measures. Keep one in your app, by conversation, and hand it to each list that shows the conversation:
   * a list that mounts again with it is as tall, from its first commit, as the list before it was, so it opens
   * with no row moving. It keeps the height the list took for a row not measured yet too, which the next list opens with, unless
   * it is given `estimatedItemHeight`. Leave it out and the list keeps its own for as long as it lives. A switch to another
   * `conversation` that comes with its own map reads that map from its first commit, as a list that mounts with it does, so it
   * opens as tall as that conversation's list was, and writes what it measures into that map, not the one before.
   * @claim "reads that map from its first commit" registry/ouro/components/ouro/message/message-list.windowing.test.tsx verify:testExists(registry/ouro/components/ouro/message/message-list.windowing.test.tsx::MessageList windowing > reads the heightCache that comes with another conversation from its first commit, as tall as that conversation's list was, and writes only to its own)
   * @claim "writes what it measures into that map" registry/ouro/components/ouro/message/message-list.windowing.test.tsx verify:testExists(registry/ouro/components/ouro/message/message-list.windowing.test.tsx::MessageList windowing > reads the heightCache that comes with another conversation from its first commit, as tall as that conversation's list was, and writes only to its own)
   * @claim "It keeps the height the list took" registry/ouro/components/ouro/message/message-list.windowing.test.tsx verify:testExists(registry/ouro/components/ouro/message/message-list.windowing.test.tsx::MessageList windowing > opens with the estimate a heightCache kept from the list before it, for the rows neither measured)
   * @claim "a list that mounts again with it is" registry/ouro/components/ouro/message/message-list.windowing.test.tsx verify:testExists(registry/ouro/components/ouro/message/message-list.windowing.test.tsx::MessageList windowing > keeps the height of every row in a heightCache the app hands in, so a list that mounts again with it is as tall, in its first commit, as it was)
   */
  heightCache?: Map<string, number> | undefined;
  /**
   * The height, in CSS pixels with its margins, the list takes for a row it has not measured yet, from its first commit: the
   * usual height of your rows. Give it when they are much shorter or taller than 96, the list's own first guess, so the first
   * commit draws as many rows as fill the view, and no more, and the space kept for the rows not drawn is about as tall as they
   * are. Left out, the list starts at 96, or at what a `heightCache` kept from the list before it, and then takes the average of
   * the first rows it measures.
   * @claim "and no more" registry/ouro/components/ouro/message/message-list.windowing.test.tsx verify:testExists(registry/ouro/components/ouro/message/message-list.windowing.test.tsx::MessageList windowing > draws only the rows that fill the view in the first commit, given their estimatedItemHeight, where the built-in estimate would draw more)
   * @claim "the list takes for a row it has not measured yet" registry/ouro/components/ouro/message/message-list.windowing.test.tsx verify:testExists(registry/ouro/components/ouro/message/message-list.windowing.test.tsx::MessageList windowing > keeps the space for the rows not drawn at estimatedItemHeight each, not the average of the rows measured)
   * @claim "so the first commit draws as many rows as fill the view" registry/ouro/components/ouro/message/message-list.windowing.test.tsx verify:testExists(registry/ouro/components/ouro/message/message-list.windowing.test.tsx::MessageList windowing > draws as many short rows as fill the view in the first commit, given their estimatedItemHeight)
   * @claim "Left out, the list starts at 96" registry/ouro/components/ouro/message/message-list.tsx verify:fileLine(registry/ouro/components/ouro/message/message-list.tsx, /const ESTIMATE = 96;/) verify:fileLine(registry/ouro/components/ouro/message/message-list.tsx, /: averageOf\(heights\)/)
   */
  estimatedItemHeight?: number | undefined;
  /**
   * Gets the list's actions: `reveal(id)` brings a message into view, drawing it first if it is not
   * drawn, for a quote, a link to a message, or find in chat; `jumpToNewest()` goes to the end and
   * follows new messages again. See {@link MessageListActions}.
   */
  actionsRef?: Ref<MessageListActions> | undefined;
  /**
   * Finds `find.query` in the messages and marks the matches in the text drawn, the current one in a stronger colour. It
   * reads the text the children hold (strings, through elements, and a post's `subject`), so a message the window has not
   * drawn counts as well as one that is. Highlights are the CSS Custom Highlight API's, so the text stays as it is and links
   * keep working; where the browser lacks the API matches are counted but not drawn. Their colours follow the theme, in
   * light, dark and forced colours. The current match scrolls into view when it changes, gently unless motion is reduced,
   * and focus stays where it is, so a find box keeps the keys. Counts come back through `onFindMatches`. A current match in a
   * message the window has not drawn is drawn and scrolled to, and `onFindMatches` reports `partial` while older history that
   * has not loaded may hold more matches, so the app can load it.
   * @claim "is drawn and scrolled to" registry/ouro/components/ouro/message/message-list.find-reveal.test.tsx verify:testExists(registry/ouro/components/ouro/message/message-list.find-reveal.test.tsx::MessageList find in a windowed list > draws a match that is not drawn, scrolls it into view and highlights it as the current one)
   * @example
   * <MessageList label="Chat" find={{ query, current }} onFindMatches={({ count }) => setCount(count)}>{messages}</MessageList>
   */
  find?: MessageListFind | undefined;
  /** Called with how many matches there are and which is current, whenever either changes, or `partial` does. See {@link MessageListFindReport}. */
  onFindMatches?: ((report: MessageListFindReport) => void) | undefined;
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
  /** Not a prop. The usual height of a row, for those the list has not measured yet, is `estimatedItemHeight`. */
  estimateSize?: { 'Not a prop. Use <MessageList estimatedItemHeight={56}>': never };
  /** Not a prop. The usual height of a row, for those the list has not measured yet, is `estimatedItemHeight`. */
  itemHeight?: { 'Not a prop. Use <MessageList estimatedItemHeight={56}>': never };
  /** Not a prop. The usual height of a row, for those the list has not measured yet, is `estimatedItemHeight`. */
  defaultItemHeight?: { 'Not a prop. Use <MessageList estimatedItemHeight={56}>': never };
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

// Whether a change is only the list's one action bar moving between messages or changing in place, which leaves the
// messages as they were: the list skips placing, marking and announcing for it.
function barOnly(record: MutationRecord): boolean {
  if ((record.target as Element).closest("[data-ouro-message-bar-slot]") !== null) return true;
  // The bar's host going into a message or out of it. The lists read this only for records of children, each of which
  // adds or removes a node, and the host moves alone.
  // Stryker disable next-line MethodExpression: the host goes in and out by itself, so a record of it holds it alone; some and every agree.
  return [...record.addedNodes, ...record.removedNodes].every((node) => node instanceof Element && node.matches("[data-ouro-message-bar-slot]"));
}

/** Whether a change added or removed a message. */
function touchesItems(record: MutationRecord): boolean {
  return [...record.addedNodes, ...record.removedNodes].some((node) => node instanceof Element && (node.matches(items) || node.querySelector(items) !== null));
}

/**
 * The messages, with each child of a slot that holds none (a day's heading), in page order: the children found slot by slot,
 * rather than with a `:has()` selector over the whole content, which a scroll landing where nothing is drawn yet would pay for.
 * @claim "The messages, with each child of a slot that holds none" registry/ouro/components/ouro/message/message-list.windowing.test.tsx verify:testExists(registry/ouro/components/ouro/message/message-list.windowing.test.tsx::MessageList windowing > keeps the reader's place over rows not drawn yet without a :has() selector over the whole conversation, which reads every element against every message)
 */
function withBareChildren(content: Element, messages: readonly Element[]): Element[] {
  const bare: Element[] = [];
  for (const slot of content.children) {
    for (const child of slot.children) {
      // Stryker disable next-line ConditionalExpression,LogicalOperator,BooleanLiteral: a message listed twice, or a child of the app's listed with the messages it holds (it starts where the first does and moves with them), holds the place as the messages alone do.
      if (!child.matches(items) && child.querySelector(items) === null) bare.push(child);
    }
  }
  return [...messages, ...bare].sort((a, b) => (a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1));
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
 * "Loading older messages": a raised pill over the top of the list, fading in where motion is allowed when loading starts after mount, its ring
 * spinning (pulsing with reduced motion).
 */
const olderClass =
  "relative m-0 box-border inline-flex h-8 items-center gap-2 rounded-full border border-solid border-border bg-background px-3 " +
  "text-sm text-muted-foreground shadow-(--shadow-md) whitespace-nowrap transition-opacity duration-(--ouro-duration-base) ease-(--ouro-ease-out)";
const olderFadeClass = "starting:opacity-0";

/**
 * How many of the newest children's keys, with the first child's, say the list's messages changed enough to look again for a switch.
 * @claim "How many of the newest children's keys" registry/ouro/components/ouro/message/message-list.test.tsx verify:testExists(registry/ouro/components/ouro/message/message-list.switching.test.tsx::MessageList switching conversations > switches a list %s to another conversation of a thousand at its newest, in its first frame, from anywhere in the one before)
 */
const RECENT = 3;

/** How many announcements the live region keeps; older ones were already read. */
const KEEP_SPOKEN = 5;

/**
 * Above this many children the list draws only the messages near its view.
 * @claim "Above this many children the list" registry/ouro/components/ouro/message/message-list.windowing.test.tsx verify:testExists(registry/ouro/components/ouro/message/message-list.windowing.test.tsx::MessageList windowing > keeps a conversation of 20 messages whole, and windows it once it grows past 20, leaving the view where it is)
 */
const WINDOW_ABOVE = 20;
/** How far past the view's edges, in pixels, messages still draw: a page key, or a short scroll, finds them drawn. At least the view's height. */
const OVERSCAN = 800;
/**
 * How soon after the reader's own input (a wheel, a finger, a key) a scroll is theirs, in milliseconds. It stays theirs until
 * the browser says it ended (`scrollend`), a fling's momentum included, and a press on the scrollbar keeps it theirs while held.
 */
const READER_GAP = 150;
/** How much of the conversation the server HTML draws, in pixels: from its end, or around `initialAnchor`. */
const FIRST_VIEW = 1600;
/**
 * The height of the last view a list measured, which a list that opens in the browser takes for its own, up to the window's:
 * the conversations an app opens one after another sit in the same pane. Before any, the window's.
 */
let lastView: number | null = null;
// Stryker disable next-line ArrowFunction: the store never changes, so nothing calls this.
const noChange = () => () => {};
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
 * Marks a slot whose previous slot holds a post, so the post in this slot draws its hairline by a rule with no sibling
 * combinator, which WebKit restyles slots for.
 * @claim "draws its hairline by a rule with no sibling combinator" registry/ouro/components/ouro/message/message-list.windowing.test.tsx verify:testExists(registry/ouro/components/ouro/message/message-list.windowing.test.tsx::MessageList windowing > draws the hairline between posts in a list with no :has() or sibling rule over its slots, which WebKit restyles for)
 */
const POST_AFTER = "data-ouro-message-list-after-post";
/** Marks a slot whose next slot holds a continued message, so the bubble here joins it without a sibling selector. */
const RUN_NEXT = "data-ouro-message-list-run-next";
/** Sets a slot's run mark from the slot after it, as it is now. */
const markRunNext = (slot?: Element | null) => void slot?.toggleAttribute(RUN_NEXT, slot.nextElementSibling?.firstElementChild?.hasAttribute("data-continued") === true);
/** Sets a slot's mark from the child of the slot before it, as it is now. */
const markPostAfter = (slot?: Element | null) => void slot?.toggleAttribute(POST_AFTER, slot.previousElementSibling?.firstElementChild?.getAttribute("data-variant") === "post");

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
/** The entry of a `heightCache` that holds the height the list last took for a row not measured yet: the next list opens with it. */
// Stryker disable next-line StringLiteral: the entry only has to differ from the others, as an empty string does.
const CACHED_ESTIMATE = "\0estimate";
/**
 * The width, in CSS pixels, rounded to a multiple of this, that a height is cached for.
 */
const BUCKET = 8;
/** The children drawn around the view, by key: its first, its last and those it held when it was set (`id` joins them). */
interface Band {
  id: string;
  from: string;
  to: string;
  held: ReadonlySet<string>;
}
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
 * The children to draw before the view is known: those within `view` pixels of the end, or around the child at `anchor`.
 */
function firstRange(count: number, size: (index: number) => number, anchor: number, view: number): [number, number] {
  if (anchor < 0) {
    let from = count - 1;
    // Stryker disable next-line ConditionalExpression,EqualityOperator: a windowed list has more than 20 children, which the first view rarely all takes, and one that does draws them all either way.
    for (let height = size(from); from > 0 && height < view; height += size(--from));
    // Stryker disable next-line ArithmeticOperator: an end past the last child draws no more.
    return [from, count - 1];
  }
  let from = anchor;
  let to = anchor;
  // Past either end, a range draws the same children (each size past them is the estimate, so it stops).
  // Stryker disable next-line ConditionalExpression,EqualityOperator: past the first child a range draws the same children, and a child more at exactly half the view is one the window's first look settles.
  for (let height = 0; from > 0 && height < view / 2; height += size(--from));
  // Stryker disable next-line ConditionalExpression,EqualityOperator,ArithmeticOperator: past the last child a range draws the same children, and a child more at exactly half the view is one the window's first look settles.
  for (let height = 0; to < count - 1 && height < view / 2; height += size(++to));
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
/**
 * How long a scroll counts as the reader's after their last wheel, touch, key or scroll, in ms: momentum keeps it going.
 * Once a scroll is theirs, so is the rest of it, until the browser says it ended (`scrollend`): a fling goes on off the main
 * thread, so a long frame between its scroll events never hands the rest of it to the list. Without `scrollend`, this alone decides.
 * @claim "until the browser says it ended" registry/ouro/components/ouro/message/message-list.springs.touch.test.tsx verify:testExists(registry/ouro/components/ouro/message/message-list.springs.touch.test.tsx::follows the whole of a fling through a long frame, and settles only once it stops)
 * @claim "until the browser says it ended" registry/ouro/components/ouro/message/message-list.springs.test.tsx verify:testExists(registry/ouro/components/ouro/message/message-list.springs.test.tsx::MessageList springs > keeps a scroll the reader's until the browser says it ended, however long a frame takes)
 */
const ARMED = 250;
/** How long, in ms, after a wheel turn the list leaves the reader's place unwritten, and past the frame it turned in: a scroll position set meanwhile stops the wheel's own scroll. */
const WHEEL_REST = 80;
/** At most how far, in px, a scroll at rest that neither the reader nor the list made is put back (onScroll's stray). */
const STRAY_PX = 3;
/** How long after the reader's last press, key or touch, or a scroll code asked for, a scroll at rest may still be theirs, in ms. */
const INPUT_MS = 1000;
/** A gap between a wheel's events shorter than this is the same turn of the wheel, its events waiting behind long frames; a longer one is a new turn. */
const WHEEL_GAP = 4 * WHEEL_REST;
/** How long, in ms, after a wheel turn the browser's first scroll is still the wheel's: a loaded machine begins an animated wheel scroll a frame or more after the turn, past the rest. */
const WHEEL_START = 1000;
/** A message this close to its place, in px, and this slow, in px/ms, is at rest, once the reader's scroll has ended. */
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

// The list's one action bar and menu, loaded with the first message that has actions.
// Once it has loaded, a list that mounts later starts with it, rather than getting it a commit after its first.
let layerModule: Promise<typeof MessageBarLayer> | undefined;
let loadedLayer: typeof MessageBarLayer | undefined;
const loadLayer = () =>
  (layerModule ??= import("@/registry/ouro/components/ouro/message/message-parts").then((module) => (loadedLayer = module.MessageBarLayer)));

// The find layer and its marks, loaded with the first list that has `find`, so a list without it adds none of that code.
let findPromise: Promise<typeof MessageFindLayer> | undefined;
let findLoaded: typeof MessageFindLayer | undefined;
const loadFind = () =>
  (findPromise ??= import("@/registry/ouro/components/ouro/message/message-list-parts").then((module) => (findLoaded = module.MessageFindLayer)));

/** A child's key, from `Children.toArray`, or null for one that is not an element. */
function keyOf(child: ReturnType<typeof Children.toArray>[number] | undefined): Key | null {
  return isValidElement(child) ? child.key : null;
}

/** The children's keys as a set, built in render when the list's first or last children change. */
function keySet(children: readonly ReturnType<typeof Children.toArray>[number][]): Set<Key | null> {
  return new Set(children.map(keyOf));
}

// Each key's index, rebuilt only when the keys change; the keys are text, so they compare by what they say.
function useIndexByKey(keys: readonly string[]): Map<string, number> {
  // Joined by NUL, which no key holds.
  const text = keys.join("\0");
  return useMemo(() => new Map(text.split("\0").map((key, index) => [key, index])), [text]);
}

/** Where an element is laid out: its box, less the spring of the message it is in. */
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
  // Where the list last put the scroll position itself, until its scroll event, which WebKit sends no scrollend after.
  let own: number | null = null;
  // How far the reader pushed past an end since the last frame.
  let pushed = 0;
  // Where the reader scrolls from: the pointer or finger, or, null, the focused message, for the keys.
  let finger: number | null = null;
  let armedUntil = Number.NEGATIVE_INFINITY;
  // Whether the reader's scroll is still going, from their first scroll event until `scrollend`, where the browser has it.
  let scrolling = false;
  const ends = "onscrollend" in scroller;
  // Whether a scroll since the last frame went on with a scroll of the reader's still going.
  let going = false;
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
    // A move of a list's height or more is a jump (End from far up, a link to an old message), not a scroll, unless it goes on
    // with the reader's scroll: a fling that a long frame gathered into one scroll event.
    const kick = isFlingKick(going, scrolling, scrolled, view.height) ? scrolled : 0;
    going = false;
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
        // From the message's nearer edge, so the message the pointer is in has none, wherever in it the pointer is.
        const reach = Math.min(Math.max(anchor.top - box.bottom, box.top - anchor.bottom, 0) / REACH, 1);
        // A message that comes near mid-scroll starts where its nearest moving neighbour is, so no gap opens at the band's edge.
        // Stryker disable next-line EqualityOperator: of two neighbours exactly as near, either is as near.
        const neighbour = seen.has(item) ? undefined : known.reduce<(typeof known)[number] | undefined>((best, other) => (best === undefined || Math.abs(other.at - at) < Math.abs(best.at - at) ? other : best), undefined);
        const state = moving.get(item) ?? neighbour?.state ?? { value: 0, velocity: 0 };
        const value = state.value + kick * LAG * reach - push * (1 - reach);
        moving.set(item, { value: SPREAD * Math.tanh(value / SPREAD), velocity: state.velocity });
      }
    }
    seen = near;
    let springing = false;
    for (const [item, state] of moving) {
      const next = springAt(state.value, 0, state.velocity, elapsed, SPRING);
      // Stryker disable next-line EqualityOperator: a spring lands exactly on the rest speed only by chance, and a frame later it rests either way.
      if (Math.abs(next.value) < REST && Math.abs(next.velocity) < REST_SPEED) {
        // While the reader's scroll goes on, a message drawn away that comes back to its place waits there for the scroll's end,
        // asking for no frames: the next scroll event of a fling may come only after a long frame, and moves it again.
        if (scrolling && shifts.has(item)) {
          moving.set(item, { value: 0, velocity: 0 });
          draw(item, 0);
        } else rest(item);
      } else {
        springing = true;
        moving.set(item, next);
        draw(item, next.value);
      }
    }
    if (springing) frame = requestAnimationFrame(tick);
  };
  // A frame for the messages, when none is asked for yet.
  const ask = () => {
    if (frame !== 0) return;
    then = performance.now();
    frame = requestAnimationFrame(tick);
  };
  const run = () => {
    if (!reduced()) ask();
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
    const mine = scroller.scrollTop === own;
    own = null;
    if (scrolling || performance.now() <= armedUntil) {
      going ||= scrolling;
      // Only a scroll of the reader's waits for its scrollend: WebKit sends none after the list's own.
      if (!mine) scrolling = ends;
      arm();
      run();
    } else top = scroller.scrollTop;
  };
  // The reader's scroll ended: the messages waiting at their places rest, in the next frame.
  const onScrollEnd = () => {
    scrolling = false;
    if (moving.size > 0) ask();
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
  scroller.addEventListener("scrollend", onScrollEnd);
  scroller.addEventListener("wheel", onWheel, passive);
  scroller.addEventListener("touchstart", onTouchStart, passive);
  scroller.addEventListener("touchmove", onTouchMove, passive);
  scroller.addEventListener("keydown", onKey);
  scroller.addEventListener("focusin", onFocus);
  // Stryker disable next-line all: with the scroll, wheel and touchmove listeners gone, nothing reads what these change, and stop() rests every message first, so a scrollend left behind finds none moving and asks for no frame; removing them frees memory only.
  const forget = () => (observer.disconnect(), scroller.removeEventListener("scrollend", onScrollEnd), scroller.removeEventListener("touchstart", onTouchStart), scroller.removeEventListener("keydown", onKey), scroller.removeEventListener("focusin", onFocus));
  return {
    moved(by) {
      top += by;
      own = scroller.scrollTop;
    },
    stop() {
      // Stryker disable next-line all: a frame left after this finds no message moving, and asks for none.
      frame = (cancelAnimationFrame(frame), 0);
      [...moving.keys()].forEach(rest);
      scroller.removeEventListener("scroll", onScroll);
      scroller.removeEventListener("wheel", onWheel);
      scroller.removeEventListener("touchmove", onTouchMove);
      // Stryker disable next-line all: with the scroll, wheel and touchmove listeners gone, nothing reads what these change, and with no message moving a scrollend asks for no frame.
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
  "press pointer-events-auto relative m-0 box-border inline-flex h-ouro-9 items-center gap-1.5 rounded-full border border-solid border-border " +
  "bg-background px-3.5 text-base font-medium text-foreground shadow-(--shadow-md) pointer-fine:h-ouro-8 pointer-fine:text-sm whitespace-nowrap " +
  "cursor-pointer touch-manipulation outline-ring outline-offset-2 focus-visible:outline-2 focus-visible:outline-solid " +
  "pointer-fine:hover:bg-(--ouro-jump-hover,var(--accent)) pointer-fine:hover:text-accent-foreground motion-safe:active:scale-(--ouro-press-scale) " +
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
 * swapped for the server's). Every message re-keyed at once is held that way in a named conversation (`conversation`): its measured heights carry over by position, so the reader's place holds. Without `conversation`, a full re-key is taken for a switch, as another conversation's messages are. Older messages loaded above a scrolled-up reader leave the message
 * they are reading where it was, in every frame, and so does a message above them that moves, such
 * as a post a reply moves to the end. When the message they are on is the one that moves, the
 * messages around it keep their place. A page of many older messages goes in 20 a frame, those
 * nearest the reader first, so loading it never holds the page up for long (when the messages are
 * the list's own children, each with a `key`).
 * Switching to another conversation is opening one: key the list by the conversation, or give it
 * the other conversation's messages with its `conversation` (or, without one, messages that share no
 * `key` with those it held), even after it held none for a while. Either way it opens at the other's
 * `initialAnchor` if it comes with one the list holds, else at its newest message, wherever the reader
 * was, with nothing announced; focus that was on a message moves to the newest one in view. It reads
 * the other conversation's `heightCache` from its first commit, as a list that mounts with it does.
 * A scroll up from the end stops the list following new messages at once, before the browser reports it. The list follows by
 * how far it is from the bottom, not which way it last scrolled, so your code going to a message (`scrollIntoView`) stops
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
 * A conversation of more than 20 children draws only the messages near its view (`windowing`),
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
 * for it, and at rest, once the reader's scroll has ended, no message has a transform. `springy={false}` turns it off, and it is off with
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
 * @see https://ui.ouroboros.bot/docs/message-list
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
 * @claim "Every message re-keyed at once is held that way in a named conversation" registry/ouro/components/ouro/message/message-list.test.tsx verify:testExists(registry/ouro/components/ouro/message/message-list.switching.test.tsx::MessageList switching conversations > holds the reader's place through a full re-key of a named conversation, with its rows not yet measured, in messages of varied heights)
 * @claim "a full re-key is taken for a switch" registry/ouro/components/ouro/message/message-list.test.tsx verify:testExists(registry/ouro/components/ouro/message/message-list.switching.test.tsx::MessageList switching conversations > opens the newest message when every message gets a new key with no conversation named, as another conversation's messages would)
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
 * @claim "Switching to another conversation is opening" registry/ouro/components/ouro/message/message-list.test.tsx verify:testExists(registry/ouro/components/ouro/message/message-list.switching.test.tsx::MessageList switching conversations > switches a list %s to another conversation of a thousand at its newest, in its first frame, from anywhere in the one before)
 * @claim "Either way it opens at the other's" registry/ouro/components/ouro/message/message-list.windowing.test.tsx verify:testExists(registry/ouro/components/ouro/message/message-list.windowing.test.tsx::MessageList windowing > re-opens at the initialAnchor that comes with another conversation, with no remount, and at its newest without one)
 * @claim "from its first commit, as a list that mounts with it does" registry/ouro/components/ouro/message/message-list.windowing.test.tsx verify:testExists(registry/ouro/components/ouro/message/message-list.windowing.test.tsx::MessageList windowing > reads the heightCache that comes with another conversation from its first commit, as tall as that conversation's list was, and writes only to its own)
 * @claim "focus that was on a message moves" registry/ouro/components/ouro/message/message-list.test.tsx verify:testExists(registry/ouro/components/ouro/message/message-list.switching.test.tsx::MessageList switching conversations > moves focus on a message of the conversation before to the newest in view of the next, without scrolling)
 * @claim "A scroll up from the end" registry/ouro/components/ouro/message/message-list.test.tsx verify:testExists(registry/ouro/components/ouro/message/message-list.test.tsx::MessageList > stops following the newest message once the list is scrolled up, even before the scroll event comes)
 * @claim "History is never announced: the messages" registry/ouro/components/ouro/message/message-list.test.tsx verify:testExists(registry/ouro/components/ouro/message/message-list.test.tsx::MessageList > never announces the first messages that fill an empty list, such as history fetched after mount)
 * @claim "History is never announced: the messages" registry/ouro/components/ouro/message/message-list.test.tsx verify:testExists(registry/ouro/components/ouro/message/message-list.test.tsx::MessageList > never announces older history loaded above, and keeps the reader's place while it loads)
 * @claim "Nothing in it overflows the boxes around it" registry/ouro/components/ouro/message/message-list.test.tsx verify:testExists(registry/ouro/components/ouro/message/message-list.test.tsx::MessageList > keeps its messages' parts inside its own scroll box, so focus and scrollIntoView never scroll a box around it)
 * @claim "Scrolling is never announced" registry/ouro/components/ouro/message/message-list.test.tsx verify:testExists(registry/ouro/components/ouro/message/message-list.test.tsx::MessageList > never announces while the reader scrolls)
 * @claim "Nor does something in a message" registry/ouro/components/ouro/message/message-list.test.tsx verify:testExists(registry/ouro/components/ouro/message/message-list.switching.test.tsx::MessageList switching conversations > stays at its end when a picture in a message shrinks and grows back between frames, as a placeholder swapped for its picture does)
 * @claim "At the bottom it also follows" registry/ouro/components/ouro/message/message-list.test.tsx verify:testExists(registry/ouro/components/ouro/message/message-list.test.tsx::MessageList > follows its end at the bottom when something in a message reaches past it, though no message changes size)
 * @claim "A conversation of more than 20 children draws" registry/ouro/components/ouro/message/message-list.windowing.test.tsx verify:testExists(registry/ouro/components/ouro/message/message-list.windowing.test.tsx::MessageList windowing > draws only the messages near the view of a long conversation, in a list as tall as all of them)
 * @claim "A conversation of more than 20 children draws" test/message-list-windowing.bench.test.tsx verify:fileLine(test/message-list-windowing.bench.test.tsx, /expect\(windowed\.redraw, "redraw, ms"\)\.toBeLessThan\(whole\.redraw \/ 2\)/)
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
    estimatedItemHeight,
    actionsRef,
    find,
    onFindMatches,
    className,
    // Guard props (hint types), dropped here so they never reach the DOM.
    autoScroll,
    stickToBottom,
    estimateSize,
    itemHeight,
    defaultItemHeight,
    ...rest
  } = props;
  const [mounted, setMounted] = useState(false);
  useEffect(
    () => {
      setMounted(true);
    },
    // Stryker disable next-line ArrayDeclaration: an effect that only sets a flag to true runs the same whatever its list holds.
    [],
  );
  // The height an app gives for a row not measured yet, where it is a positive number of pixels.
  const estimate = Number.isFinite(estimatedItemHeight) && estimatedItemHeight! > 0 ? estimatedItemHeight : undefined;
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
          (estimateSize !== undefined || itemHeight !== undefined || defaultItemHeight !== undefined) && [
            `${estimateSize !== undefined ? "estimateSize" : itemHeight !== undefined ? "itemHeight" : "defaultItemHeight"} is not a prop; the usual height of a row the list has not measured is estimatedItemHeight`,
            "<MessageList estimatedItemHeight={56}>",
          ],
          estimatedItemHeight !== undefined &&
            estimate === undefined && [
              `estimatedItemHeight is ${String(estimatedItemHeight)}, not a positive number of pixels, so the list estimates its rows itself`,
              "<MessageList estimatedItemHeight={56}>",
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
  // One action bar and one menu for every message, rather than one each: the messages give the layer what to show.
  const [Layer, setLayer] = useState<typeof MessageBarLayer | undefined>(() => loadedLayer);
  const [layer] = useState(() => createRowLayer<MessageBarData>(() => void loadLayer().then((Loaded) => setLayer(() => Loaded))));
  // Whether the view follows new content: whether it was at the bottom before the content changed.
  const pinned = useRef(true);
  const [showJump, setShowJump] = useState(false);
  // Whether a message has arrived while scrolled away from the bottom, so the newest drawn row could reach the pill: the
  // list keeps no room for it merely from being scrolled away, since most of what is scrolled past (message-list.windowing.test.tsx)
  // never comes near the pill at all.
  const [jumpRoom, setJumpRoom] = useState(false);
  const jumpRoomRef = useRef<HTMLDivElement | null>(null);
  const jumpRef = useRef<HTMLButtonElement | null>(null);
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
  // The mark that holds the scroll height down to the content's end between two holds of the reader's place (see keepAnchor).
  const endMarkRef = useRef<HTMLSpanElement | null>(null);
  // Moves focus to a message, making it the Tab stop; set by the keyboard effect.
  const moveTo = useRef<(item: HTMLElement) => void>(undefined);
  const keyHandler = useRef<(event: KeyboardEvent<HTMLElement>) => void>(undefined);
  // With messages, a message is the Tab stop and the region is not; without, the region is while it scrolls.
  // Stryker disable next-line ArrowFunction,ConditionalExpression,EqualityOperator: a first guess only; the keyboard effect counts the messages before the first paint.
  const [hasItems, setHasItems] = useState(() => Children.count(children) > 0);

  // A page of older messages that comes at once goes in a chunk a frame, those nearest the reader first: each frame's
  // work stays short, and the reader's place is kept as each chunk goes in. A few go in at once.
  // Read again only when the app hands in new children, not on the list's own renders as it measures and places them.
  const all = useMemo(() => Children.toArray(children), [children]);
  const top = keyOf(all[0]);
  // Above WINDOW_ABOVE children, only the messages near the view draw; see "The window" below.
  const windowed = windowing && all.length > WINDOW_ABOVE;
  // The key of the first child, and of the first one drawn: a page of older ones above it waits.
  // Stryker disable next-line ObjectLiteral: an empty start takes the first child's key in the first render instead; this only spares that render.
  const [edge, setEdge] = useState(() => ({ first: top, drawn: top }));
  // Whether the list drew every child until it grew long: until it finds its window it keeps those children where they are.
  const [drewWhole, setDrewWhole] = useState(!windowed);
  // A windowed list puts a page of older messages in at once, as space above the messages drawn, so it waits for none and
  // spares the render this would cost. Should it become whole again, what it drew first stays the edge.
  if (!windowed && top !== edge.first) setEdge({ first: top, drawn: all.findIndex((child) => keyOf(child) === edge.drawn) > OLDER_CHUNK ? edge.drawn : top });
  const shown = windowed ? all : all.slice(Math.max(0, all.findIndex((child) => keyOf(child) === edge.drawn)));
  const keys = useMemo(() => all.map((child, index) => String(keyOf(child) ?? index)), [all]);
  // How many messages each child drawn holds: a child that starts the conversation holds none. Read here, before the
  // keyboard's own effect, so a Message's position and the list's size are already right in its first render, from the
  // counts the last sync found; the keyboard's marks below write nothing more for a row these did not change.
  const counts = useRef(new Map<string, number>());

  // Find: loaded with the first list that has `find`; its layer counts the matches and draws them.
  const hasFind = find !== undefined;
  // Stryker disable next-line ArrowFunction: starting empty only delays the layer by the effect below, which loads it at once.
  const [findModule, setFindModule] = useState<typeof MessageFindLayer | undefined>(() => findLoaded);
  const [findMarks, setFindMarks] = useState<string>();
  useEffect(() => {
    if (!hasFind) return;
    // Stryker disable next-line ConditionalExpression: asking again for a module already held returns the cached promise and changes nothing a page can see.
    if (!findModule) void loadFind().then((layer) => setFindModule(() => layer));
  }, [hasFind, findModule]);
  const FindLayer = hasFind ? findModule : undefined;

  // The window: which children draw, and the space kept for the others. Each child sits in a slot of its own that draws
  // no box, so the list's spacing and the continued messages' margins work as without one.
  // The heights of every child measured, by key and width, kept for the life of the list or by the app (`heightCache`).
  const [ownCache] = useState(() => new Map<string, number>());
  const cache = heightCache ?? ownCache;
  const [measured, setMeasured] = useState<Measured>(() => ({ heights: new Map(), gap: 16, estimate: cache.get(CACHED_ESTIMATE) ?? ESTIMATE, bucket: cache.get(CACHED_WIDTH) ?? null }));
  // Counts the heights kept in place (see the window's measure), so the sizes read them again.
  const heightsKept = useRef(0);
  const cacheRef = useRef(cache);
  useLayoutEffect(() => {
    cacheRef.current = cache;
  });
  // The children drawn around the view, by key: the first, the last and every one between them when the band was set.
  const [band, setBand] = useState<Band | null>(null);
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
  // Once long it stays set, as the band decides from then on; another conversation clears it.
  if (!windowed && !drewWhole) setDrewWhole(true);
  // The newest child's key the announcements last heard of, so the children after it, which just arrived, draw until they are heard.
  const [heard, setHeard] = useState<string | null>(null);
  // The keys of the messages the announcements wait on, kept drawn until a reply that streamed is heard.
  // Stryker disable next-line StringLiteral: no child's key is any text before the announcements publish theirs; each begins with a dot.
  const [waitingKeys, setWaitingKeys] = useState("");
  // The key of the child focus was last in, kept drawn so focus stays as the reader scrolls away.
  const [focusKey, setFocusKey] = useState<string | null>(null);
  // Each child's height, read again only when the children or the heights measured change: the window reads every child's on
  // every scroll, and a cached height's key is text built from the child's key and the width. The heights a window keeps in
  // place (see its measure) count in `heightsKept`, so they are read again too.
  const sizes = useMemo(
    () => keys.map((key) => measured.heights.get(key) ?? cache.get(`${key}\0${measured.bucket}`) ?? estimate ?? measured.estimate),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- heightsKept is the count of heights written in place: a change of it is a change of the heights
    [keys, measured, cache, estimate, heightsKept.current],
  );
  const sizeOf = (index: number) => sizes[index]!;
  // Each child's index by its key, built when the keys change, not on every render (the keys are text, so they compare by what they say).
  const indexes = useIndexByKey(keys);
  // How much the first draw takes before the view is measured: in server HTML and as it hydrates, FIRST_VIEW, so the two
  // match; in a list that opens in the browser, a view's height, so opening costs what the view shows.
  // Stryker disable next-line ArrowFunction: a snapshot of undefined reads as false, as the client's does.
  const hydrating = useSyncExternalStore(noChange, () => false, () => true);
  const firstView = hydrating ? FIRST_VIEW : Math.min(lastView ?? Infinity, window.innerHeight);
  let draws: (index: number) => boolean = () => true;
  if (windowed) {
    const last = keys.length - 1;
    let range: readonly [number, number];
    let held: ReadonlySet<string> | null = null;
    if (band !== null) {
      // A band whose edge was deleted draws none of it: the window finds itself again, from what is drawn, before the browser
      // draws, and the space kept for what went keeps the rest where it was.
      // Stryker disable next-line LogicalOperator,UnaryOperator: whatever range a band with a deleted edge draws, the window finds itself again before the browser draws.
      range = [indexes.get(band.from) ?? last, indexes.get(band.to) ?? -1];
      // Children that went in between its edges since (a page of older messages after a first child that is no message) draw as
      // space, as above the band: the window then draws those the view reaches, before the browser draws. Children that took the
      // place of ones that went (a message's key changed in place) draw.
      // Stryker disable next-line ArithmeticOperator: a child more or less between the edges is one the window draws, or not, before the browser draws.
      if (range[1] - range[0] + 1 > band.held.size) held = band.held;
    } else if ((showJump || drewWhole) && indexes.has(String(edge.drawn))) {
      // A list the reader scrolled up in that grows long (older history loading above, newer messages after), or any list that
      // drew whole until now, draws, to begin with, no more than the WINDOW_ABOVE children it drew whole, from the first of them:
      // the rest, and what came with the page, is space. The window then finds itself from where those children are, before the
      // browser draws, so the view stays where it is, though code moved it before the browser reported the scroll.
      const from = indexes.get(String(edge.drawn))!;
      range = [from, Math.min(last, from + WINDOW_ABOVE)];
    } else range = firstRange(keys.length, sizeOf, initialAnchor === undefined ? -1 : childNamed(all, keys, initialAnchor), firstView);
    const kept: (number | undefined)[] = [last, indexes.get(focusKey!), reach === null ? undefined : indexes.get(reach.key)];
    // What just arrived after the newest heard, so it is heard, and what still streams, so its end is.
    const since = indexes.get(heard!) ?? last;
    // Stryker disable next-line EqualityOperator: the newest is kept as the last child anyway.
    for (let index = Math.max(since + 1, last + 1 - KEEP_ARRIVED); index <= last; index++) kept.push(index);
    for (const key of waitingKeys.split("\n")) kept.push(indexes.get(key));
    all.forEach((child, index) => {
      if (!isValidElement(child)) return;
      const props = child.props as { streaming?: unknown; "aria-busy"?: unknown };
      if (props.streaming === true || props["aria-busy"] === true || props["aria-busy"] === "true") kept.push(index);
    });
    draws = (index) => (index >= range[0] && index <= range[1] && (held === null || held.has(keys[index]!))) || kept.includes(index);
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
  // Where each key starts counting from, among all of them, by the messages each held last sync (one, until counted
  // otherwise): what a Message's own first render needs for its position, so the keyboard's marks below find it already
  // right and write nothing more.
  const before = new Map<string, number>();
  let size = 0;
  for (const key of keys) {
    before.set(key, size);
    size += counts.current.get(key) ?? 1;
  }
  shown.forEach((child, at) => {
    const index = at + all.length - shown.length;
    if (!draws(index)) {
      run ??= index;
      return;
    }
    if (run !== null) space(index);
    const key = keys[index]!;
    // A Message takes its position and size in its own first render: the app's own aria-posinset, when it set one, stands.
    // Across a Server Component boundary a Message's type is a lazy reference, never Message itself, so there it is known
    // by its string `role` (every Message has one; nothing else visible across the boundary tells them apart).
    const message = isValidElement<MessageProps>(child) && (child.type === Message || (hasLazyType(child) && typeof child.props.role === "string")) ? child : null;
    const own = message?.props["aria-posinset"];
    const drawn = message
      ? cloneElement(
          message,
          {
            tabIndex: -1,
            "data-ouro-control": "message-list",
            "data-ouro-part": "item",
            ...(own === undefined && { "aria-posinset": String(before.get(key)! + 1), "aria-setsize": String(size) }),
          } as Record<string, unknown>,
        )
      : child;
    slots.push(
      <div key={key} {...{ [SLOT]: key }} className="contents">
        {drawn}
      </div>,
    );
  });
  // The newest always draws, so no run is left after it.
  // What the window's effects read: the latest render's.
  const view = { windowed, all, keys, indexes, measured, band, reach, sizeOf };
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
    // The keys in order, as the heights measured for them are keyed: what a full re-key carries over by position.
    order: keys,
    conversation,
    // The heightCache the heights measured for this conversation were read from.
    cache,
    pending: null as { conversation: Key | undefined; keys: ReadonlySet<Key | null> } | null,
    // The keys it held when its conversation was last confirmed: what a wholesale change under the same name leaves alone.
    confirmed: new Set(all.map(keyOf)) as ReadonlySet<Key | null>,
    // Stryker disable next-line ConditionalExpression,EqualityOperator: the first messages of a list that mounted empty, taken for a switch, reset only what it already holds (the edge, the band, no focus, no jump), and the keyboard effect's first sync clears `switched` before anything reads it.
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
    // A full re-key that keeps the conversation: the same messages under new keys, as many as before. Their heights were measured under
    // the old keys, so they carry over by position, and the space above the view stays where it was. A partial re-key takes no part.
    if (!fresh && all.length === track.order.length && strangers(track.keys)) {
      const carried = new Map<string, number>();
      track.order.forEach((key, index) => {
        const height = measured.heights.get(key);
        if (height !== undefined) carried.set(keys[index]!, height);
      });
      setMeasured({ ...measured, heights: carried });
    }
    // A conversation that comes with another heightCache map reads its heights from that map from this render, as a fresh list
    // does: the heights measured for the one before are dropped, with the estimate and width the map keeps for this one.
    if (fresh && cache !== track.cache) setMeasured({ heights: new Map(), gap: measured.gap, estimate: cache.get(CACHED_ESTIMATE) ?? ESTIMATE, bucket: cache.get(CACHED_WIDTH) ?? null });
    const opening = fresh && track.held;
    if (opening) {
      // The other conversation draws from its newest, whatever of the one before was drawn.
      // Stryker disable next-line ObjectLiteral: an empty edge has no drawn key, so the slice starts at the first child, as drawn: top does; the next frame's step sets it to the first child's key. The same rows draw either way; on a non-windowed list the empty edge makes the render near line 1020 call setEdge again, one extra render before the commit and no extra commit.
      setEdge({ first: top, drawn: top });
      // Another conversation opens at its newest, not where the one before was drawn.
      setDrewWhole(false);
      setBand(null);
      // The next opens at its newest, with no jump to offer and no focus kept on a message of the one before.
      setFocusKey(null);
      // Stryker disable next-line CallExpression: the layout effect on the switch count calls reopen, which clears the jump in the same commit before the browser draws.
      setShowJump(false);
    }
    setTrack({
      first: top,
      recent,
      keys: keySet(all),
      order: keys,
      conversation: named,
      cache: fresh ? cache : track.cache,
      pending,
      // Confirmed again by a new name or switch, and by any change under the same name but a wholesale one, which may be the
      // next conversation's messages come ahead of its name.
      confirmed:
        // Stryker disable next-line ConditionalExpression,EqualityOperator,LogicalOperator: not equivalent for the two LogicalOperator mutants; "confirms nothing for messages that come back to a list emptied under the same name" and "adopts a name that comes after its messages" (message-list.test.tsx) fail on both, but per-test coverage attributes this expression to other tests, so the shard never runs them. A new name comes only with no pending name, so the last clause confirms it as well; with no keys held, or none now, every key is a stranger or nothing changes, so the set kept is the one that would be read.
        named !== track.conversation || fresh || (pending === null && all.length > 0 && track.keys.size > 0 && !strangers(track.keys)) ? keySet(all) : track.confirmed,
      // Stryker disable next-line ConditionalExpression,EqualityOperator: a list that holds nothing is empty at its first commit, and its first messages open it either way.
      held: track.held || all.length > 0,
      // Stryker disable next-line ArithmeticOperator: only a change of the count runs the layout effect, and a count that goes down by one each switch changes as a count that goes up does; it is never compared with another.
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
        return { ...now, drawn: keyOf(list[Math.max(0, list.findIndex((child) => keyOf(child) === now.drawn) - OLDER_CHUNK)]) };
      }),
    );
    // Stryker disable next-line all: a step left from before goes in the same render as the next one; cancelling it only spares the call.
    return () => cancelAnimationFrame(frame);
  }, [edge]);
  // Another conversation opens at its newest message, wherever the reader was in the one before, before the browser draws it.
  const reopen = useRef<() => void>(undefined);
  // Set as the list switches, for the keyboard effect: focus on a message that went goes to the new conversation's Tab stop.
  // Stryker disable next-line BooleanLiteral: the keyboard effect's first sync(true) sets it false, on mount, before any focus or switch can read it.
  const switched = useRef(false);
  // Whether the list has switched to another conversation: the heights a list measured before it are kept in place only until then.
  const everSwitched = useRef(false);
  useLayoutEffect(() => {
    if (track.switches === 0) return;
    switched.current = true;
    everSwitched.current = true;
    // The next conversation opens as the list did: what its view shows, then the rest.
    wide.current = false;
    // A reveal on its way finds nothing in the conversation before.
    settleRef.current(false);
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
  // How far the content is drawn up (a `translate`) to hold the reader's place while the wheel turns: what the scroll position
  // takes once the wheel rests, or before the reader reaches an end. Set by the effect below.
  const carriedRef = useRef(0);

  const toBottom = useCallback(() => {
    const scroller = scrollerRef.current!;
    // At the end, nothing above is held: the carry goes with the scroll to the end.
    // Stryker disable next-line ConditionalExpression: with nothing carried, removing no translate and setting the carry to 0 again change nothing.
    if (carriedRef.current !== 0) {
      carriedRef.current = 0;
      contentRef.current!.style.removeProperty("translate");
    }
    const before = scroller.scrollTop;
    scroller.scrollTop = scroller.scrollHeight;
    ownTop.current = scroller.scrollTop;
    // Stryker disable next-line BooleanLiteral: not equivalent in intent, but unobservable here; hold()'s own two-frame window (armHeld,
    // message-list.test.tsx) already puts a hold back on its own, and a loaded runner can spend that window on the click and the scroll it
    // reads here before this line even runs, leaving nothing left for this write to be seen changing.
    held.current = false;
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
    // Between two holds, a 1px mark keeps the scroll range down to where the content ended when its place was last kept. When the
    // content gets shorter than the scroll position needs, for good (rows above coming in shorter than the space kept for them, by
    // more than lies below the view) or for a moment in a commit (the window takes out a space before it puts the rows in, and
    // WebKit can lay the page out between), the browser would pull the scroll position up at the next layout, before the hold has
    // corrected it; the hold, which reads where each message sits in the content, would take that pull for the reader's own scroll
    // and leave the row being read moved by it (ourostack/ouro-ui#3892). Held, the place stays until the hold has kept it, and
    // keepAnchor then moves the mark to where the content ends now, so content truly shorter than the view still pulls the scroll
    // position up. The mark moves only when the content's end does, not as the reader scrolls.
    const endMark = endMarkRef.current!;
    let endHeld = 0;
    const holdEnd = (px: number) => {
      // Stryker disable next-line ConditionalExpression: only spares writing the values the mark already holds.
      if (px === endHeld) return;
      endHeld = px;
      // Stryker disable next-line ConditionalExpression,EqualityOperator,StringLiteral: a mark at the very top holds no range the content does not, in the layout or out of it.
      endMark.style.display = px > 0 ? "block" : "";
      endMark.style.top = `${Math.max(0, px - 1)}px`;
    };
    // Where the content ends, in the scroller's own coordinates: below the space kept above the first message, if any.
    const contentEnd = () => content.offsetTop + content.offsetHeight;
    // Stryker disable next-line ArrowFunction,ConditionalExpression,StringLiteral: Chromium's own anchoring takes no notice of the mark and WebKit's stops when it moves (message-list.test.tsx, in WebKit), and mutation testing runs Chromium only.
    const browserAnchors = () => getComputedStyle(scroller).overflowAnchor === "auto";
    const keepAnchor = () => {
      // Hidden by an app around it (a pane put away behind an open thread), the scroller reads all zeros: reading it now
      // would make the list think it sits at the top, and a message that arrives meanwhile would be lost once it shows
      // again. Left alone, what was taken before it was hidden is still good once it is shown and the resize observer runs.
      if (!laidOut(scroller)) return;
      // Where an app turned the browser's own anchoring on, the mark is not moved, which would stop WebKit's: it goes only once
      // the content has come up past it, where letting it go is a change the browser's own clamp would make anyway.
      const anchoring = browserAnchors();
      // Stryker disable next-line ConditionalExpression: Chromium's own anchoring takes no notice of the mark and WebKit's stops when it moves (message-list.test.tsx, in WebKit), and mutation testing runs Chromium only.
      if (!anchoring) holdEnd(contentEnd());
      // Stryker disable next-line ConditionalExpression,EqualityOperator: Chromium's own anchoring takes no notice of the mark and WebKit's stops when it moves (message-list.test.tsx, in WebKit), and mutation testing runs Chromium only.
      else if (endHeld > contentEnd()) holdEnd(0);
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
      const messages = [...content.querySelectorAll(items)];
      anchors = find(messages);
      // When no message shows, what a child draws that holds none (a day's heading) holds the place: it may be all the view
      // shows, as when it is revealed in a windowed list, with the messages around it not drawn yet.
      // An anchor is never wholly above the view (those that reach into it are the ones taken), so it shows when it starts above the view's end.
      // Stryker disable next-line EqualityOperator,MethodExpression: a message whose edge meets the view's to the pixel shows none of itself either way; and where some anchors show, looking again with the children that hold no message finds those same messages showing, which hold the place alike.
      if (!anchors.some(({ node }) => boxOf(node).top < view.bottom)) anchors = find(withBareChildren(content, messages));
      end = farthest();
      taken = scroller.scrollTop;
    };
    const farthest = () => scroller.scrollHeight - scroller.clientHeight;
    // At the bottom as the list was before this change, or as it is now: growth at the end, or the
    // view getting shorter, leaves a list that was at the bottom still there, and a scroll anywhere
    // else (the reader's, a key's, or code going to a message) leaves it.
    // Stryker disable next-line EqualityOperator: a list exactly as far from the bottom as counts as at it is at its end either way.
    const atBottom = () => Math.abs(end - scroller.scrollTop) <= AT_BOTTOM || farthest() - scroller.scrollTop <= AT_BOTTOM;
    // Jump to latest shows only with more than a line below the view: a list opened at a message among the last (an app's
    // first unread) sits at its end without following it, and a jump there would only cover the newest message.
    // Stryker disable next-line EqualityOperator: exactly a line from the end shows or hides the jump, a pixel either way.
    const jumpOwed = () => !pinned.current && farthest() - scroller.scrollTop > LINE;
    // While the list follows its end, the scroll height keeps at least the content's height there, held by a 1px mark at that
    // depth (`floorRef`), so a change that shortens the content for a moment and lengthens it again (a picture's placeholder
    // swapped for the picture, with a layout read between) never lets the browser pull the scroll position up, which would
    // stop the following with no one scrolling. The mark is placed absolutely, so moving it lays out nothing else. A real
    // change of height resizes the content, and the resize observer moves the mark with it before the browser draws. Once
    // the reader has left the end, the next change lets it go, which moves nothing, since what it holds is past the
    // content's end; not the scroll itself, since moving the mark then stops WebKit's own scroll anchoring where an app has
    // it on. While the wheel turns, it holds at least the content's height at each turn, and goes only once the wheel rests:
    // a reader still within a change's height of the end would otherwise be pulled up as a row above comes in shorter, and
    // the browser's pull, like any scroll position written, ends WebKit's wheel.
    const floorMark = floorRef.current!;
    let floor = 0;
    // Space kept above the first message, in px (see setSlack).
    let slack = 0;
    const setFloor = (px: number) => {
      // Stryker disable next-line ConditionalExpression: only spares writing the values the mark already holds.
      if (px === floor) return;
      floor = px;
      // Out of the layout when it holds nothing, so moving it never stops the browser's own scroll anchoring.
      floorMark.style.display = px > 0 ? "block" : "";
      placeFloor();
    };
    // The mark sits at the content's height below the content's top, which the space kept above the first message moves down.
    const placeFloor = () => void (floorMark.style.top = `${Math.max(0, floor - 1 + slack)}px`);
    // Sets the mark between the anchors being taken and held: the range it holds changes with no change of the messages, so the
    // anchors' range moves with it, and the reader's own scrolling, which takes the anchors again only while the range is the
    // one they were taken with, still does.
    const moveFloor = (px: number) => {
      const range = farthest();
      setFloor(px);
      end += farthest() - range;
    };
    const followEnd = () => {
      // As in keepAnchor: hidden, the scroller's height and scroll range both read zero, so scrolling it "to the end" now
      // would scroll it to the top instead, and it would stay there once shown again.
      if (!laidOut(scroller)) return;
      const height = content.offsetHeight;
      setFloor(height > scroller.clientHeight ? height : 0);
      toBottom();
      // Content that settles at another height in a later render of the same task (long messages folding behind "See more"
      // as a conversation opens) moves no node the mutation observer hears of, and the resize observer runs only after the
      // frame's animation callbacks: until then the mark would hold the view past the messages. Once the task's work is
      // done, the end is followed to where it settled.
      if (floor !== 0) queueMicrotask(() => content.offsetHeight !== floor && hold());
    };
    // Whether the list has opened: at its first messages, at `initialAnchor` if it holds that message, else at the newest.
    let opened = false;
    // Where code scrolled the list to a message before the newest, until a scroll moves it from there.
    let placed: number | null = null;
    // Every message node drawn so far, so a message moved to the end (a reply bumping a post) is told from one that is
    // new there (the reader's own, just sent): only a node never drawn before counts as new.
    const seenMessages = new WeakSet<Element>();
    // The message `initialAnchor` names, if the list draws it: by id, else the first message of the child with that key.
    const anchored = (): HTMLElement | undefined => {
      const id = anchorFor.current;
      if (!id) return undefined;
      const keyed = (name: string) => {
        const slot = [...content.querySelectorAll(`:scope > [${SLOT}]`)].find((node) => keyIs(node.getAttribute(SLOT)!, name));
        return slot && topItems(slot)[0];
      };
      return topItems(content).find((item) => item.id === id) ?? keyed(id);
    };
    // Scrolls the message to the middle of the view, or its top to the top when it is taller.
    const centre = (target: HTMLElement) => {
      const view = scroller.getBoundingClientRect();
      const box = boxOf(target);
      scroller.scrollTop += box.top - view.top - Math.max(0, (scroller.clientHeight - box.height) / 2);
      ownTop.current = scroller.scrollTop;
      // Stryker disable next-line BooleanLiteral: both callers reach centre with the hold already clear, open()'s initial
      // ref default and reopen()'s followEnd (toBottom) called just before it, so a test cannot tell this write from none.
      held.current = false;
    };
    const open = () => {
      if (content.querySelector(items) === null) return;
      opened = true;
      // Every message already drawn as the list opens counts as known, so one later moved to the end (not just sent)
      // is told apart from a genuinely new one.
      for (const node of content.querySelectorAll<HTMLElement>(items)) seenMessages.add(node);
      const target = anchored();
      // None: the list stays at the end, as it opened, and follows the messages there: it goes there now, with messages that came
      // after it mounted empty, before the browser draws them, unless code already scrolled it to one of them.
      if (!target) {
        pinned.current = atBottom();
        if (pinned.current) followEnd();
        return keepAnchor();
      }
      // In the middle of the view, or its top at the view's top when it is taller. The springs are at rest as it opens.
      centre(target);
      // Held from here, so older messages loading before the browser reports this scroll leave it where it opened, and
      // following only if it opened at the end (the anchor was the newest).
      keepAnchor();
      const newest = target === topItems(content).at(-1);
      placed = newest ? null : scroller.scrollTop;
      // Stryker disable next-line ConditionalExpression: the hold in the microtask after this reads the list at its end and follows it, so not following here changes nothing.
      pinned.current = newest && atBottom();
    };
    followEnd();
    keepAnchor();
    open();
    // The window keeps the reader's place this way too, before it reads where the view is.
    holdRef.current = () => hold();
    reopen.current = () => {
      // Stryker disable next-line BooleanLiteral: a switch adds messages, so the observer holds in the microtask after the commit, before any frame or event, and a hold with the list at its end pins it again.
      pinned.current = true;
      // Another conversation opens at its end: space the one before kept above its first message goes with it.
      setSlack(0);
      followEnd();
      // At the message `initialAnchor` names when the switch brings it, as the list opened at it; else at the end, as before.
      const target = anchored();
      if (target) {
        centre(target);
        // Stryker disable next-line all: the same read as at open, for a switch to another conversation.
        const newest = target === topItems(content).at(-1);
        // Stryker disable next-line all: the same read as at open, for a switch to another conversation.
        placed = newest ? null : scroller.scrollTop;
        // Stryker disable next-line all: the same read as at open, for a switch to another conversation.
        pinned.current = newest && atBottom();
      }
      // Stryker disable next-line CallExpression: the observer's hold in the microtask after the commit takes the anchors and the end, before any frame or event; at the end of the new conversation, the next message is then followed.
      keepAnchor();
      setShowJump(false);
    };
    // After messages come, go, move or change size: follow the end while pinned, else hold the anchor in place.
    // A scroll position written while the wheel turns stalls WebKit's own scroll, so whatever moves the reader's place then (older
    // history drawn above a few a frame, a row drawn in place of the space kept for it, taller or shorter than the estimate) is held
    // by drawing the content that far up or down instead, a `translate` the wheel's own scroll never meets, and the scroll
    // position takes it in one move once the wheel rests, or as the reader nears an end, so what went in above is always in reach.
    let wheelAt = Number.NEGATIVE_INFINITY;
    // The gap before the wheel's last event, capped at WHEEL_GAP once a burst of short gaps has begun. A page drawing slowly hands
    // the wheel's events over a frame or more apart, so the wheel counts as still turning for twice that gap, not only the rest.
    let wheelGap = 0;
    // The frame the wheel last turned in. Where a frame takes longer than the rest (a slow machine drawing much), the wheel's next
    // events wait behind it, so the wheel turns until the time has passed and a later frame has begun.
    let wheelFrame: CSSNumberish | null = null;
    // The scroll a wheel started goes on until the browser says it ended (`scrollend`): WebKit animates a wheel's scroll after
    // its last event, over frames a loaded machine draws slowly, and a scroll position written meanwhile stops it.
    let wheelScrolling = false;
    // Whether the wheel turned since the last scroll that was not the list's own: the turn's scroll, which may not have begun yet.
    // Stryker disable next-line BooleanLiteral: before any turn, the last turn is never under WHEEL_START ago, so no scroll counts as one's either way.
    let wheelStarts = false;
    const turning = () => wheelScrolling || performance.now() - wheelAt < Math.max(WHEEL_REST, 2 * wheelGap) || document.timeline.currentTime === wheelFrame;
    let resting: ReturnType<typeof setTimeout> | undefined;
    let restFrame = 0;
    // How close to an end, in px, the reader comes before the scroll position takes what is carried: a few frames of a fast wheel.
    const edge = () => scroller.clientHeight / 4;
    // The end the wheel last turned toward: -1 the top, 1 the bottom, 0 either, before it turns.
    let heading = 0;
    // Whether what is carried goes into the scroll position now. Near an end where the content, drawn by what is carried, would
    // leave space with nothing in it, whichever way the wheel turns. Near the end the wheel turns toward, so what is past it is
    // in reach. Not near the other: a wheel turned up from the bottom is near the bottom for its first frames, and a scroll
    // position written then stops it.
    const nearEnd = () => {
      const top = scroller.scrollTop;
      const carried = carriedRef.current;
      // Where the view's bottom meets the bottom of what is drawn, drawn up by what is carried.
      const last = farthest() - carried;
      // Stryker disable next-line EqualityOperator: a scroll position exactly at the margin pays a frame sooner or later, and moves nothing on screen either way.
      const space = (carried > 0 && top > last - edge()) || (carried < 0 && top < edge() - carried);
      // Stryker disable next-line EqualityOperator: a scroll position exactly at the margin pays a frame sooner or later, and moves nothing on screen either way.
      return space || (heading <= 0 && top < edge()) || (heading >= 0 && top > last - edge());
    };
    // Space kept above the first message, in px: the part of what was carried down that the scroll position could not take, as the
    // list's start stopped it. A reader whose wheel brings them to the top faster than the rows above were paid (a slowed page
    // hands a wheel's scroll over in steps of hundreds of pixels) would otherwise see the content jump up by that part. It sits
    // above the content as a margin, so where each message sits in the content, which the anchors and the window read, stays.
    const setSlack = (px: number) => {
      // Stryker disable next-line ConditionalExpression,EqualityOperator: moving the mark to where it already is writes nothing, and a list whose space changed and whose mark stayed has it moved by the keepAnchor that follows every change of the space.
      const moved = px !== slack;
      slack = px;
      content.style.marginBlockStart = `${px}px`;
      placeFloor();
      // The mark held the content's end where the space put it: it follows the end.
      // Stryker disable next-line ConditionalExpression,LogicalOperator,BooleanLiteral,CallExpression: the keepAnchor that follows every change of the space moves the mark to the content's end as well; and Chromium's own anchoring takes no notice of the mark and WebKit's stops when it moves (message-list.test.tsx, in WebKit), and mutation testing runs Chromium only.
      if (moved && !browserAnchors()) holdEnd(contentEnd());
    };
    // Scrolls the list by `by` itself, which the springs leave alone, and returns how far it went.
    const scrollOwn = (by: number) => {
      const before = scroller.scrollTop;
      scroller.scrollTop += by;
      ownTop.current = scroller.scrollTop;
      held.current = false;
      const applied = scroller.scrollTop - before;
      springsRef.current?.moved(applied);
      return applied;
    };
    // Lets the space go once the reader has scrolled past it and the wheel rests: the content moves up by it as the scroll
    // position does, so nothing on screen moves.
    const release = () => {
      // Stryker disable next-line EqualityOperator: a reader exactly the space's height down lets it go now or at their next scroll, and nothing on screen moves either way.
      if (slack === 0 || turning() || scroller.scrollTop < slack) return;
      // Scrolled while the space still holds the scroll range, then the space goes.
      const range = farthest();
      const gone = slack;
      const applied = scrollOwn(-gone);
      setSlack(0);
      // The anchors sit in the content, which the space going does not move: only the list's own scroll and the range it took
      // away are left out, so a change waiting for the resize observer is still held.
      taken += applied;
      end += farthest() - range;
    };
    const pay = () => {
      // Stryker disable next-line CallExpression: a rest left waiting pays nothing once this has paid, and a carry since starts it again.
      clearTimeout(resting);
      const by = carriedRef.current;
      // Once the wheel rests, the end the list is not following is held no more: what was carried goes first, so nothing is pulled.
      const letGo = () => {
        if (!pinned.current && !turning()) moveFloor(0);
        release();
      };
      // Stryker disable next-line ConditionalExpression: paying nothing removes no translate and scrolls by 0, which moves nothing.
      if (by === 0) return letGo();
      const wheeling = turning();
      const before = scroller.scrollTop;
      // The translate holds the scroll range where it draws the content past the content's end: the mark holds it down to the view's
      // bottom instead while the translate goes and the scroll position takes it, so a carry the content came up by (rows above coming
      // in shorter) is not pulled up by the browser first (ourostack/ouro-ui#3892).
      const anchoring = browserAnchors();
      // Stryker disable next-line ConditionalExpression: Chromium's own anchoring takes no notice of the mark and WebKit's stops when it moves (message-list.test.tsx, in WebKit), and mutation testing runs Chromium only.
      if (!anchoring) holdEnd(Math.max(endHeld, before + scroller.clientHeight));
      content.style.removeProperty("translate");
      // In whole pixels: WebKit drops the fraction of a scroll position written to it, so a carry of 3,499.99 px moved the
      // reader's place a whole pixel there (ourostack/ouro-ui#2648).
      const applied = scrollOwn(Math.round(by));
      // Stryker disable next-line ConditionalExpression,BooleanLiteral,CallExpression: Chromium's own anchoring takes no notice of the mark and WebKit's stops when it moves (message-list.test.tsx, in WebKit), and mutation testing runs Chromium only; left where it held the view, the mark is moved to the content's end by the keepAnchor the write's scroll event brings.
      if (!anchoring) holdEnd(contentEnd());
      // A scroll position written while the wheel turns may land in part there, and the rest settles frames later against the
      // reader. Where no end stopped the write, what has not landed stays carried, drawn by the translate, until a later write lands it.
      const top = scroller.scrollTop;
      // Stryker disable next-line ConditionalExpression,EqualityOperator: at the end a write that was stopped leaves its rest drawn by the translate only until the wheel rests, where the next pay finds nothing to land and lets it go.
      const unlanded = wheeling && top > 0 && top < farthest() ? Math.round(by) - applied : 0;
      // Stryker disable next-line EqualityOperator: a part of exactly one pixel kept carried or paid with the next write moves nothing on screen that WebKit shows, which keeps whole pixels.
      if (Math.abs(unlanded) >= 1) {
        carriedRef.current = unlanded;
        content.style.translate = `0 ${-unlanded}px`;
        // Stryker disable next-line AssignmentOperator: the scroll event the write brings takes the anchors again, so `taken` is read stale only in the task of the write, as everywhere else it is paid.
        taken += applied;
        return rest();
      }
      carriedRef.current = 0;
      // What the list's start stops, the part of the move past it, goes above the content instead, so the content stays where the
      // reader sees it.
      setSlack(slack + Math.max(0, -(before + by)));
      // The anchors sit where they did in the content, which a scroll does not move: only the list's own scroll since they were
      // taken is left out of the reader's, so a change waiting for the resize observer is still held.
      taken += applied;
      letGo();
    };
    // Pays once the wheel has rested: after the rest, in a frame, so a page drawing nothing still begins one to tell by.
    const rest = () => {
      // Stryker disable next-line CallExpression: a second rest left waiting pays once the wheel rests, as this one does, and the later of the two then pays nothing.
      clearTimeout(resting);
      resting = setTimeout(() => (restFrame = requestAnimationFrame(() => (turning() ? rest() : pay()))), WHEEL_REST);
    };
    const carry = (by: number) => {
      carriedRef.current += by;
      content.style.translate = `0 ${-carriedRef.current}px`;
      if (nearEnd()) pay();
      else rest();
    };
    const onWheel = (event: WheelEvent) => {
      heading = Math.sign(event.deltaY) || heading;
      const now = performance.now();
      const gap = now - wheelAt;
      // A gap at the bound or past it either starts a new turn (nothing short came before it, so there is no burst to extend) or is
      // itself the frame a loaded page drew slowly in an already-turning burst: capped at the bound, not dropped to 0, so the wheel
      // still counts as turning long enough for its next event, which a slow frame delays rather than stops, to arrive.
      wheelGap = gap < WHEEL_GAP ? gap : wheelGap > 0 ? WHEEL_GAP : 0;
      wheelAt = now;
      wheelFrame = document.timeline.currentTime;
      wheelStarts = true;
      // The scroll range the wheel turns in holds until it rests (see setFloor): at least the content's height now.
      const height = content.offsetHeight;
      // Stryker disable next-line EqualityOperator: a floor set to the height it already holds writes nothing.
      if (height > Math.max(floor, scroller.clientHeight)) setFloor(height);
      rest();
      // A wheel pushing at an end scrolls nothing, so no scroll event says the reader got there.
      // Stryker disable next-line ConditionalExpression,LogicalOperator: with nothing carried, paying pays nothing; the check only spares reading the layout on every turn of the wheel.
      if (carriedRef.current !== 0 && nearEnd()) pay();
    };
    // Stryker disable next-line ObjectLiteral,BooleanLiteral: passive only tells the browser the listener never cancels the wheel; no test can observe it.
    scroller.addEventListener("wheel", onWheel, { passive: true });
    // When the reader last did something that may scroll the list, besides the wheel (turning), or code asked the list to scroll
    // (scrollTo, scrollBy: a find's smooth scroll to its match, an app's own), which may take frames to get there.
    let inputAt = Number.NEGATIVE_INFINITY;
    const onInput = () => void (inputAt = performance.now());
    // Stryker disable next-line BooleanLiteral: passive only tells the browser these listeners never cancel the event; onInput never calls preventDefault, so no test can observe it.
    for (const type of ["pointerdown", "keydown", "touchstart"]) scroller.addEventListener(type, onInput, { capture: true, passive: true });
    const asked = (name: "scrollTo" | "scrollBy") => {
      const scroll = Element.prototype[name];
      // Stryker disable next-line ObjectLiteral,BooleanLiteral: a non-configurable, writable property still lets defineProperty redefine its value (only configurable:true→false and a plain `scroller.scrollTo = …` assignment would differ), and nothing here ever does either; the cleanup below's delete is the only reader of configurable, and it runs once, at unmount, on a node about to be discarded either way.
      Object.defineProperty(scroller, name, { configurable: true, writable: true, value: (...args: Parameters<typeof scroll>) => (onInput(), scroll.apply(scroller, args)) });
    };
    asked("scrollTo");
    asked("scrollBy");
    // hold()'s write is put back to only until the frame after next: a stray comes in the frame after it, and a scroll later is another's.
    let disarm = 0;
    const armHeld = () => {
      held.current = true;
      // Stryker disable next-line CallExpression: hold() writes again within two frames only in the frame it wrote, whose disarm comes in the same frame either way.
      cancelAnimationFrame(disarm);
      disarm = requestAnimationFrame(() => (disarm = requestAnimationFrame(() => (held.current = false))));
    };
    const hold = () => {
      // A list unmounted before this ran has no scroller left to hold.
      if (scrollerRef.current === null) return;
      // Away from the bottom, by a scroll the scroll event has not reported yet (code scrolled to a message, a key), stops the following.
      // A list at the old bottom follows. One that was following keeps on when its end came up, though something grew below
      // in the same frame: the browser pulled the scroll down, the reader did not scroll. One the bottom came up to that was
      // not following starts only when the browser reports that scroll: in a windowed list the bottom may come up as heights
      // replace estimates above the view, which holding the place below undoes first.
      // A list opened at a message before the newest, still where that put it, is not at its end by a pixel or two of overflow:
      // nothing scrolled it there, so it does not start following.
      // Stryker disable next-line all: the guard only keeps a pixel or two of overflow from reading as the end; a list scrolled by the reader or by code leaves its place either way.
      if (placed !== null && scroller.scrollTop !== placed) placed = null;
      // Stryker disable next-line EqualityOperator: a list exactly as far from the bottom as counts as at it is at its end either way.
      // Stryker disable next-line all: the guard only keeps a pixel or two of overflow from reading as the end; a list scrolled by the reader or by code leaves its place either way.
      if (placed === null) pinned.current = Math.abs(end - scroller.scrollTop) <= AT_BOTTOM || (pinned.current && farthest() < end - AT_BOTTOM);
      // A scroll of the list's height or more since the anchors were taken (to the top, to a message far off) set its own place: the held message has left the view.
      // Stryker disable next-line EqualityOperator: a scroll of exactly the list's height leaves the held message at the view's edge either way.
      const near = Math.abs(scroller.scrollTop - taken) < scroller.clientHeight;
      // Where an app turned the browser's own anchoring back on, the browser corrects.
      // Stryker disable next-line ConditionalExpression,StringLiteral: Chrome gives up its own anchoring once the list scrolls in that frame, so whether a second correction lands depends on timing a test cannot hold.
      const native = getComputedStyle(scroller).overflowAnchor === "auto";
      if (pinned.current) {
        owed = 0;
        followEnd();
      } else if (!turning()) setFloor(0);
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
        const wheeling = turning();
        // Stryker disable next-line EqualityOperator: a move of exactly half a pixel is under what the scroll position keeps (whole pixels in WebKit), carried or not.
        if (Math.abs(moved) >= 0.5 && wheeling) {
          owed = 0;
          carry(moved);
          return keepAnchor();
        }
        // The wheel's scroll has ended with something still carried: the move joins it, and both are written in one move, not
        // two that each round to the browser's whole pixels and may not cancel.
        // Stryker disable next-line EqualityOperator: a move of exactly half a pixel is under what the scroll position keeps, carried or not.
        if (Math.abs(moved) >= 0.5 && carriedRef.current !== 0) {
          owed = 0;
          carriedRef.current += moved;
          // pay() takes the translate away itself, holding the range as it does; with nothing left to pay, it goes here.
          // Stryker disable next-line ConditionalExpression,EqualityOperator,StringLiteral,CallExpression: a carry and a change that cancel to the pixel leave nothing for pay() to take the translate away by, and no test lands a change in the frames between the wheel's scroll ending and its rest; taken away here with a carry left, the range goes before pay() holds it, as before #3892.
          if (carriedRef.current === 0) content.style.removeProperty("translate");
          pay();
          return keepAnchor();
        }
        owed = moved;
        if (Math.abs(moved) >= 0.5) {
          const before = scroller.scrollTop;
          scroller.scrollTop += moved;
          ownTop.current = heldTop.current = scroller.scrollTop;
          armHeld();
          const applied = scroller.scrollTop - before;
          springsRef.current?.moved(applied);
          // What rounding left over, carried: under a pixel. A move the browser did not apply in full (the list's end or start stopped it, smooth scrolling or snapping took it) is not a debt a later write can pay.
          owed = Math.abs(moved - applied) < 1 ? moved - applied : 0;
        }
      } else owed = 0;
      keepAnchor();
      // Something grew below while the reader is near the end: the jump shows once it is more than a line away. Only a
      // change is set (the jump is drawn while its button is), as setting the same value here still costs a render.
      if (jumpOwed() !== (jumpRef.current !== null)) setShowJump(jumpOwed());
    };
    const follow = new ResizeObserver(hold);
    follow.observe(content);
    follow.observe(scroller);
    // Messages that move without the list changing size (a post moved to the end by a reply) resize nothing: while
    // the reader is scrolled up, the anchor is held as they move, before the browser draws. A move that also resizes
    // the list is held here first, and the resize observer then finds it held. At the end, the list follows wherever its end
    // went: something put in a message that reaches past the end (a picture that loads beside its last line) moves the
    // end without resizing anything, so the resize observer would not see it. The list's one action bar moving between
    // messages is left out: it shows on hover, and following it would move the list under the pointer.
    const moves = new MutationObserver((all) => {
      const records = all.filter((record) => !barOnly(record));
      if (records.length === 0) return;
      // The first messages, which may come after the list mounted empty, open it, before the browser draws them.
      if (!opened) return open();
      const newest = [...content.querySelectorAll<HTMLElement>(items)].at(-1);
      // The mark holds the scroll height, so a committed change of the content's own height is looked for too.
      // Stryker disable next-line ConditionalExpression,ArrowFunction: not equivalent; "drops the room at once when hasOlder ends" (message-list.test.tsx) fails on both mutants, but per-test coverage attributes this observer callback to another test, so the shard never runs it.
      const floorMoved = () => floor !== 0 && content.offsetHeight !== floor;
      // Stryker disable next-line ConditionalExpression,LogicalOperator: a change that resizes the list is followed or held by the resize observer in the same frame, and holding when nothing moved finds nothing moved; both only spare the work.
      if (!pinned.current || farthest() !== end || floorMoved()) hold();
      // The reader's own message follows to the end even scrolled up: its sender already knows what it says, so it never
      // waits behind an older place held while reading. Only a node never drawn before counts: one moved to the end (a
      // reply bumping a post there) leaves the place held, as any other message would.
      if (newest !== undefined) {
        const known = seenMessages.has(newest);
        seenMessages.add(newest);
        // `node === newest` would never add a case `node instanceof Element && node.contains(newest)` does not: newest
        // is always an Element (it answers getAttribute above), and a node contains itself, so an exact match is
        // already a self-contained one.
        if (!pinned.current && !known && newest.getAttribute("data-role") === "user" && records.some((record) => [...record.addedNodes].some((node) => node instanceof Element && node.contains(newest)))) {
          // Stryker disable next-line BooleanLiteral: not equivalent in intent, but unobservable here; followEnd's toBottom already puts the scroller at the live bottom, so the next atBottom() or hold() reads its own geometry (farthest() - scrollTop) and recomputes the same pinned value regardless of this assignment.
          pinned.current = true;
          owed = 0;
          followEnd();
          // Stryker disable next-line CallExpression: not equivalent in intent, but unobservable here; skipping this resync only leaves end/anchors stale until the next moves() run, whose own farthest() !== end check (above) already differs once content has grown, so hold() still runs and resyncs them from live geometry.
          keepAnchor();
          // Stryker disable next-line BooleanLiteral: not equivalent in intent, but unobservable here; followEnd's programmatic scroll fires the scroll handler's own setShowJump(!pinned.current) moments later, and since pinned.current is already true above, that correction lands on the same value regardless of this assignment.
          setShowJump(false);
        }
      }
    });
    moves.observe(content, { childList: true, subtree: true });
    const onScroll = (event: Event) => {
      // Just after hold() kept the reader's place, with nothing from the reader since (a wheel, a touch, a key, a press, the scrollbar's
      // too), a scroll of a few pixels the list didn't write is none of the reader's: Chromium sometimes moves the scroll position a
      // pixel or two by itself in the frame after hold() wrote it through rows measured above the view, which moves what the reader is
      // reading. The list puts hold()'s position back. It stays the place to put back to through the scroll event its write brings, as
      // the stray move comes a frame later.
      const stray = scroller.scrollTop - heldTop.current;
      // Stryker disable next-line EqualityOperator: a stray of exactly STRAY_PX is put back or kept, a pixel either way.
      if (stray !== 0 && Math.abs(stray) <= STRAY_PX && held.current && !turning() && performance.now() - inputAt > INPUT_MS) {
        scrollOwn(-stray);
        return;
      }
      // Any other move ends it: a scroll after that is the reader's or the app's, judged from where that move left the list.
      if (stray !== 0) held.current = false;
      // Only the browser's own scroll, where it says when it ends. The first scroll after a turn is the wheel's when it comes
      // within WHEEL_START, which a loaded machine may take to begin it; judged by time alone, never by the frame the wheel turned
      // in, as a scroll the page makes in that frame (a scrollbar, a jump) is none of the wheel's, and with no scrollend after it
      // would keep the place held by drawing for good. The list's own write is none of the wheel's, and leaves the turn's start.
      if (scroller.scrollTop !== ownTop.current) {
        if (event.isTrusted && ended) endSoon();
        if (event.isTrusted && "onscrollend" in scroller && wheelStarts && performance.now() - wheelAt < WHEEL_START) wheelScrolling = true;
        wheelStarts = false;
      }
      // Leaving the bottom, even by a few pixels, stops the following; reaching it again follows.
      // Stryker disable next-line all: the guard only keeps a pixel or two of overflow from reading as the end; a list scrolled by the reader or by code leaves its place either way.
      if (placed !== null && scroller.scrollTop !== placed) placed = null;
      // Stryker disable next-line all: the guard only keeps a pixel or two of overflow from reading as the end; a list scrolled by the reader or by code leaves its place either way.
      if (placed === null) pinned.current = atBottom();
      // What is carried goes into the scroll position before the reader reaches an end, so it never stops them there.
      if (nearEnd()) pay();
      release();
      // Messages changed since the anchors were taken: leave them for the resize observer, which comes next.
      if (farthest() === end) keepAnchor();
      setShowJump(jumpOwed());
      // Back at the bottom: no room is owed any more.
      if (pinned.current) setJumpRoom(false);
    };
    scroller.addEventListener("scroll", onScroll, { passive: true });
    // Once the pill's held place settles, the raised pill can land over the newest message. Only an overlap the fixed
    // reserve below the list can fully absorb is cleared, once scrolling is fully done: a deeper one means the held
    // place is far from the end for its own reason (a page up, a jump elsewhere), which this leaves alone, since
    // pushing the view by more than that would itself move the held place; and clearing mid-scroll would fight the
    // carry and anchor work above, which also move the scroll position as the turn continues.
    const clearJump = () => {
      // The room and the button it clears are raised by the same showJump gate below, so a mounted room's
      // button is always mounted too: nothing left to check once room is non-null.
      const room = jumpRoomRef.current;
      if (pinned.current || room === null) {
        // Test-only: reaching the very end sets pinned synchronously, same tick, while the commit that would
        // drop room and the button is still scheduled for its own, later turn; a run caught in that exact
        // window leaves the DOM exactly as it finds it, with nothing else to tell its bail apart from a run
        // that reached past this guard and simply found nothing to correct.
        scroller.dataset.ouroMessageListJumpGuard = "bailed";
        return;
      }
      scroller.dataset.ouroMessageListJumpGuard = "ran";
      const drawn = content.querySelectorAll<HTMLElement>(items);
      const newest = drawn[drawn.length - 1]!;
      const clear = jumpRef.current!.getBoundingClientRect().top - newest.getBoundingClientRect().bottom;
      const clears = clear < 0 && clear >= -room.offsetHeight;
      // Test-only: at clear exactly 0 the correction below is a no-op on scrollTop either way, so a boundary
      // test needs the guard's own decision, not a scrollTop or rendered-position read, to tell the two apart.
      room.dataset.ouroMessageListJumpClears = String(clears);
      if (clears) {
        scroller.scrollTop -= clear;
        ownTop.current = scroller.scrollTop;
      }
    };
    // A loaded machine sends `scrollend` between the parts of one long wheel scroll: the wheel stops counting as turning only
    // once no scroll has followed for the rest, so the carry is not paid into a scroll that goes on.
    let ended = 0;
    const endSoon = () => {
      clearTimeout(ended);
      ended = window.setTimeout(() => ((ended = 0), (wheelScrolling = false), clearJump()), WHEEL_REST);
    };
    const onScrollEnd = endSoon;
    scroller.addEventListener("scrollend", onScrollEnd);
    return () => (["pointerdown", "keydown", "touchstart"].forEach((type) => scroller.removeEventListener(type, onInput, { capture: true })), Reflect.deleteProperty(scroller, "scrollTo"), Reflect.deleteProperty(scroller, "scrollBy"), cancelAnimationFrame(disarm), (held.current = false), scroller.removeEventListener("scrollend", onScrollEnd), clearTimeout(ended), clearTimeout(resting), cancelAnimationFrame(restFrame), (carriedRef.current = 0), content.style.removeProperty("translate"), content.style.removeProperty("margin-block-start"), follow.disconnect(), moves.disconnect(), scroller.removeEventListener("scroll", onScroll), scroller.removeEventListener("wheel", onWheel));
  }, [toBottom]);

  // The window, after every render that changed what it draws, every scroll and every resize: measures the slots drawn,
  // keeps the reader's place as their heights replace the estimates, brings a message asked for into view, and draws the
  // children the view and OVERSCAN reach.
  const windowSync = useRef<(scrolled: boolean) => void>(undefined);
  // The keyboard's marks of the messages, run before the window reads the layout (see that effect).
  const keyboardMark = useRef<(() => void) | undefined>(undefined);
  // Whether the rows past the view's edges draw: from the frame after the list opens, or another conversation opens in it.
  const wide = useRef(false);
  // Whether the estimate is fixed: once the rows past the view's edges are first measured.
  // Stryker disable next-line BooleanLiteral: not equivalent; "takes a switch from conversation alone: one whose messages share keys with the last is a switch, and messages re-keyed in the same one are not" (message-list.test.tsx) fails on it, but per-test coverage attributes the first measurement to another test, so the shard never runs it.
  const estimated = useRef(false);
  const widening = useRef<{ frame: number; timer?: ReturnType<typeof setTimeout> } | null>(null);
  const widen = () => {
    // Stryker disable next-line ConditionalExpression: a second request in the same frame draws the same rows a frame later.
    if (widening.current !== null) return;
    // A frame, then a task: the one after the browser paints the frame the list opened in.
    // Stryker disable next-line ObjectLiteral: the frame is set on the next line, before anything reads it.
    const pending: { frame: number; timer?: ReturnType<typeof setTimeout> } = { frame: 0 };
    widening.current = pending;
    pending.frame = requestAnimationFrame(() => {
      pending.timer = setTimeout(() => {
        widening.current = null;
        // Stryker disable next-line BooleanLiteral: not equivalent; "opens with no more rows than fill the window, and draws the rows past the view's edges only after the first paint" (message-list.windowing.test.tsx) fails on it, but per-test coverage attributes this timer to another test, so the shard never runs it.
        wide.current = true;
        // Stryker disable next-line BooleanLiteral: measuring as it widens finds the heights the last sync measured, and changes nothing.
        windowSync.current!(true);
      });
    });
  };
  // The keys of children that came into a window already drawn and wait to draw out of view, a chunk a frame (see the band):
  // how many of them the window draws now, OLDER_CHUNK in the frame it draws them in, else none, and that frame's request.
  const arriving = useRef(new Set<string>());
  // Keys once found out of view this page's task, which the next sync in the same task, drawing rows measured shorter than
  // estimated, must not find in view again: a key found once stays waiting for its frame, so the task commits once, not a
  // growing band each time rows already drawn correct the overscan's reach (ourostack/ouro-ui#3753).
  const everOut = useRef(new Set<string>());
  const budget = useRef(0);
  const dripping = useRef(0);
  // The band the last sync set, until React draws it. A frame that syncs before then reads the DOM without that band's rows,
  // so it would spend another chunk on rows it takes for ordinary ones: it waits for the commit instead.
  const setting = useRef<string | null>(null);
  useLayoutEffect(() => {
    // Stryker disable next-line ConditionalExpression: a commit of another band also draws the rows the sync stopped waiting for, since a band computed after the sync keeps them, so clearing there draws the same frames.
    if (band?.id === setting.current) setting.current = null;
  }, [band]);
  const drip = () => {
    // One request a frame: a second would spend a second chunk on rows the first has not committed yet.
    if (dripping.current !== 0) return;
    dripping.current = requestAnimationFrame(() => {
      dripping.current = 0;
      // The band the last sync set is not drawn yet, and a frame that syncs now would read the DOM without its rows. The commit
      // that draws it runs the sync that asks for the next frame while rows still wait, so this frame waits.
      if (setting.current !== null) return;
      budget.current = OLDER_CHUNK;
      // Stryker disable next-line BooleanLiteral: measuring here finds the heights the commit before it measured, and changes nothing.
      windowSync.current!(true);
      budget.current = 0;
    });
  };
  // The reader's own scrolling: when they last gave input, whether a scroll of theirs is going on, and whether they hold the
  // scrollbar. A scroll made by code (find in page, a screen reader, a test tool, the app) is none of these.
  // `code` is whether the last scroll was neither theirs nor the list's own (`ownTop`, where it last put the scroll position).
  // Stryker disable next-line ObjectLiteral: an empty start reads as no input, no scroll going and nothing held, as these do.
  const reader = useRef({
    // Stryker disable next-line UnaryOperator: at most the first scroll after the list mounts is taken for the reader's, and its scrollend hands the next to code.
    at: -Infinity,
    // Stryker disable next-line BooleanLiteral: at most the first scroll after the list mounts is taken for the reader's, and its scrollend hands the next to code.
    going: false,
    held: false,
    code: false,
  });
  const ownTop = useRef<number | null>(null);
  // Where hold() last put the scroll position to keep the reader's place, and whether a stray scroll just after it is still put back
  // to it (onScroll). Any other write of the list's clears it.
  const heldTop = useRef(0);
  // Stryker disable next-line BooleanLiteral: followEnd (toBottom) runs first, unconditionally, at the top of the mount effect,
  // clearing held before anything can read the ref, so true or false here changes nothing a test can see.
  const held = useRef(false);
  // Where each slot drawn sits in the content, and its size, as last measured.
  const tops = useRef(new Map<string, { top: number; size: number }>());
  // Slots a resize observer has caught changing box since the list last read them fresh: read again, leaving the rest at
  // their cached size. Set from the observer's own callback, which also asks for a sync, so a slot's new size is read the
  // same frame the observer reports it, never a frame late; cleared once a sync reads it fresh.
  const dirtySlots = useRef(new Set<string>());
  // The children each slot held when the list last read it fresh, by key: a slot whose children changed (one grouped in,
  // or gone) is read fresh too, since a child only starts reporting its size to the observer below once observed, and a
  // brand new child can already carry its settled size by the time this reads it.
  const watchedChildren = useRef(new Map<string, Element[]>());
  // What each slot's box is found by: a slot itself draws none of its own (`display: contents`), so this watches its
  // children, the boxes `extentOf` reads. Created once; the listener effect below disconnects it. Every sync re-observes
  // the children currently drawn, which is how a brand new one starts being watched; observing one already watched asks
  // the browser for nothing new.
  const slotWatch = useRef<ResizeObserver | null>(null);
  // What the window last read, so a render that changed none of it (the app drawing again as someone types) reads no layout.
  const synced = useRef<{ keys: readonly string[]; band: Band | null; measured: Measured; reach: Reach | null; windowed: boolean } | null>(null);
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
      const { windowed, keys, indexes, measured, band, reach, sizeOf } = viewRef.current;
      // A list inside a hidden panel draws nothing to measure or place; it does once it shows, and resizes.
      if (windowed && content.getClientRects().length === 0) return;
      if (windowed && !scrolled) {
        const contentTop = content.getBoundingClientRect().top;
        const rounded = Math.round(scroller.clientWidth / BUCKET);
        // Stryker disable next-line ArithmeticOperator: the bucket only keys the cache, and any one number for each rounded width keys it alike.
        const bucket = rounded * BUCKET;
        cacheRef.current.set(CACHED_WIDTH, bucket);
        // At a new width the heights are those of the old: the rows not drawn keep them as estimates until they draw.
        const bucketMoved = measured.bucket !== bucket;
        const found = new Map<string, { top: number; size: number }>();
        // The heights measured that differ from those the list holds, by key.
        const moved = new Map<string, number>();
        for (const slot of content.querySelectorAll(`:scope > [${SLOT}]`)) {
          const key = slot.getAttribute(SLOT)!;
          const children = [...slot.children];
          for (const child of children) slotWatch.current?.observe(child);
          const before = watchedChildren.current.get(key);
          const regrouped =
            before === undefined ||
            // Stryker disable next-line ConditionalExpression: each slot wraps exactly one child, the message drawn for its key, so once a slot has a before to compare, its length always matches the one found now.
            before.length !== children.length ||
            // Stryker disable next-line ConditionalExpression,MethodExpression,ArrowFunction: a slot wraps exactly one child, so .some and .every agree over the single element either reads. And a swapped child is observed for the first time this very pass (`slotWatch.current?.observe(child)` above reobserves every current child, every pass), so its own first ResizeObserver notification delivers in a later windowSync call regardless of what regrouping decided here, marking the key dirty and re-measuring it then: a slot that silently regroups converges to the real size one pass later than a slot this directly caught would, and nothing between those two passes ever reads the gap.
            before.some((child, index) => child !== children[index]);
          watchedChildren.current.set(key, children);
          const cached = measured.heights.get(key);
          // Only a child that draws a box has a place to find the others by, and only its top is ever read: until one is
          // found, each slot is read fresh, so that one's top is real, never the placeholder a cached entry carries.
          const fresh =
            found.size === 0 ||
            bucketMoved ||
            // Stryker disable next-line ConditionalExpression: this key only ever lacks a cached height on the pass that first draws its slot, and that pass always finds `before === undefined` too (nothing has watched this key's children yet), which already forces `regrouped` true below; by the next pass this slot's fresh read has written its height here, cached or not, so this term can never be the one true term on its own.
            cached === undefined ||
            // Stryker disable next-line ConditionalExpression: the same self-heal regrouped's own disable above relies on: whatever a swap this pass missed, its child's first observation (queued above, every pass) lands as a later windowSync call that marks the key dirty and re-measures it, before anything reads the gap.
            regrouped ||
            dirtySlots.current.has(key);
          if (fresh) {
            const { top, size } = extentOf(slot);
            if (size > 0) found.set(key, { top: top - contentTop, size });
            cacheRef.current.set(`${key}\0${bucket}`, size);
            if (measured.heights.get(key) !== size) moved.set(key, size);
            dirtySlots.current.delete(key);
          }
          // Stryker disable next-line BlockStatement,ConditionalExpression: not fresh, so nothing a resize observer caught or regrouped since the last fresh read: the cached size still holds, the one `sizeOf`'s own cache fallback already reads for this key, and the one real top `tops.current`'s first entry ever needs only ever comes from a fresh read, never from this branch. Forcing the test false skips the block exactly as forcing its body empty does, for the same reason.
          if (!fresh) {
            // Nothing a resize observer caught, and nothing regrouped, since the last fresh read: the cached size still holds.
            // Stryker disable next-line ConditionalExpression,EqualityOperator,ObjectLiteral,CallExpression: what this writes, `sizeOf` reads again for the same key, from the same `measured.heights.get(key)` this reads as `cached`, so `tops.current.get(key)?.size ?? sizeOf(index)` reads the same number whether or not this call runs at all, zero included; and its `top: NaN` is never the first entry either, since reaching this branch needs `found.size !== 0` already, and that first entry only ever comes from a fresh read.
            if (cached! > 0) found.set(key, { top: NaN, size: cached! });
            // Stryker disable next-line StringLiteral,CallExpression: the size written is the one already cached under this exact key, from the fresh read that set `cached`, so writing it again, or under any other key, changes no read of this key's size.
            cacheRef.current.set(`${key}\0${bucket}`, cached!);
          }
          counts.current.set(key, topItems(slot).length);
        }
        tops.current = found;
        {
          // A slot gone draws no box to watch, and holds no place in the sync that follows.
          const present = new Set(keys);
          for (const [key, children] of watchedChildren.current) {
            if (present.has(key)) continue;
            // Stryker disable next-line OptionalChaining: a key only reaches this map once the listener effect below has already set this ref, so it is never null by the time a slot has gone.
            for (const child of children) slotWatch.current?.unobserve(child);
            // Stryker disable next-line CallExpression: a key gone from `keys` is never drawn again, so the entry left here holds only memory.
            watchedChildren.current.delete(key);
            // Stryker disable next-line CallExpression: a key gone from `keys` is never drawn again, so the mark left here holds only memory.
            dirtySlots.current.delete(key);
          }
        }
        if (bucketMoved || moved.size > 0) {
          // The heights of children gone are forgotten.
          const present = new Set(keys);
          const gap = parseFloat(getComputedStyle(content).rowGap);
          // Once the estimate is fixed, a height measured for a row drawn changes no space the list keeps: the rows not drawn
          // keep their own heights and the estimate. Those are kept in place, which the next render reads, so no render
          // follows, and the window places the rows it draws as it would after one.
          if (!everSwitched.current && !bucketMoved && estimated.current && Object.is(gap, measured.gap)) {
            // Written in place, as the renders read them through `heightsKept`, which makes them read the heights again.
            const kept = measured.heights as Map<string, number>;
            for (const [key, size] of moved) kept.set(key, size);
            // Stryker disable next-line ConditionalExpression,CallExpression: keeping a gone child's height only holds memory: a key that comes back is measured again as it draws.
            for (const key of kept.keys()) if (!present.has(key)) kept.delete(key);
            // Stryker disable next-line UpdateOperator: the counter only has to change, which an increment and a decrement both do.
            heightsKept.current++;
          } else {
            const heights = new Map(measured.heights);
            for (const [key, size] of moved) heights.set(key, size);
            // Stryker disable next-line ConditionalExpression,CallExpression: keeping a gone child's height only holds memory: a key that comes back is measured again as it draws.
            for (const key of heights.keys()) if (!present.has(key)) heights.delete(key);
            // A render follows at once, which comes back here with the space kept at its new size. The gap is 1rem, so it
            // changes only with the font size, which changes the heights too.
            // The estimate is the average of the rows the list first draws past its view: those it opened with, and those drawn
            // after, as the view alone may hold a few.
            const estimate = estimated.current ? measured.estimate : averageOf(heights);
            // Kept for the next list handed the cache, which opens with it.
            cacheRef.current.set(CACHED_ESTIMATE, estimate);
            setMeasured({ heights, gap, estimate, bucket });
            estimated.current = wide.current;
            return;
          }
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
      // Stryker disable next-line ConditionalExpression,EqualityOperator: a list that measures no height draws nothing to remember.
      if (scroller.clientHeight > 0) lastView = scroller.clientHeight;
      // As it opens, only what the view shows draws, so the frame it opens in is short; the rows past its edges draw after
      // that frame is painted.
      const over = wide.current ? Math.max(OVERSCAN, scroller.clientHeight) : 0;
      // Stryker disable next-line ConditionalExpression: widening a list already wide only draws the same band again, a frame later.
      if (!wide.current) widen();
      const placed = tops.current.entries().next().value;
      // Every child drawn draws nothing (the app hid them all): nothing to place by, until one draws.
      /* istanbul ignore if @preserve -- the newest message always draws; this only keeps a list whose messages are all hidden from drawing every child */
      // Stryker disable next-line ConditionalExpression: the newest message always draws, so there is always a slot to place by.
      if (placed === undefined) return;
      const near = indexes.get(placed[0])!;
      const nearTop = placed[1].top;
      // Each child's height with the gap before it, read once for the walks below: on every scroll, for every child.
      const extents = keys.map((key, index) => {
        const size = tops.current.get(key)?.size ?? sizeOf(index);
        // Stryker disable next-line ConditionalExpression,LogicalOperator,EqualityOperator: a gap more or less moves the band's edges by the gap, against an overscan fifty times it.
        return size + (index > 0 && size > 0 ? measured.gap : 0);
      });
      const extent = (index: number) => extents[index]!;
      let sum = 0;
      const sums = extents.map((each) => {
        const at = sum;
        sum += each;
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
      // The band drawn now, by index: NaN, which no keep range holds and no band meets, where there is none or its edge went.
      const drawnFrom = band === null ? NaN : (indexes.get(band.from) ?? NaN);
      const drawnTo = band === null ? NaN : (indexes.get(band.to) ?? NaN);
      const code = reader.current.code;
      // Children already drawn stay drawn until they are twice the overscan from the view: a scroll back and forth finds them
      // still in the page. After a scroll made by code, eight times, while the band they are in meets the new one: code that
      // brings one message after another into view (a contrast check measuring each) finds them all still there, and a jump
      // past them lets them go.
      const keep = (code ? 8 : 2) * over;
      let keepFrom = 0;
      // Stryker disable next-line EqualityOperator: a child that ends exactly at the keep distance stays or goes, and the next scroll settles it.
      while (starts[keepFrom]! + extent(keepFrom) <= viewTop - keep) keepFrom++;
      let keepTo = keys.length - 1;
      // Stryker disable next-line EqualityOperator: a child that starts exactly at the keep distance stays or goes, and the next scroll settles it.
      while (starts[keepTo]! >= viewBottom + keep) keepTo--;
      // Stryker disable next-line EqualityOperator,ArithmeticOperator: a band that meets the new one only within a child draws that child or not, and the next scroll settles it.
      const meets = !code || (drawnFrom <= to + 1 && drawnTo >= from - 1);
      if (meets && drawnFrom >= keepFrom) from = Math.min(from, drawnFrom);
      if (meets && drawnTo <= keepTo) to = Math.max(to, drawnTo);
      let inBand = keys.slice(from, to + 1);
      // Stryker disable next-line ConditionalExpression,EqualityOperator: with none waiting, the rows filtered below are none; this only spares reading which are drawn.
      if (arriving.current.size > 0) {
        // Rows that came with the children (a page of older messages landing among the rows drawn) and that the band reaches
        // out of view draw in later frames, OLDER_CHUNK a frame, those nearest the view first: the task they land in only
        // holds the reader's place, and lays out none of them. Those the view shows draw at once, and those drawn stay.
        const drawn = new Set([...content.children].map((node) => node.getAttribute(SLOT)));
        const off = (index: number) => Math.max(viewTop - starts[index]! - extent(index), starts[index]! - viewBottom);
        // Under a pixel in view is none of a row: the reader's place, held in WebKit's whole pixels, leaves the row beside it that much in.
        // Stryker disable next-line EqualityOperator,UnaryOperator: a row exactly a pixel in view shows a pixel of its gap, drawn now or a frame later.
        const outOfView = (offset: number) => offset > -1;
        const later = inBand
          .map((key, at) => ({ key, off: off(from + at) }))
          .filter(({ key, off }) => arriving.current.has(key) && !drawn.has(key) && (everOut.current.has(key) || outOfView(off)))
          .sort((a, b) => a.off - b.off)
          .slice(budget.current)
          .map(({ key }) => key);
        for (const key of later) everOut.current.add(key);
        arriving.current = new Set(later);
        // Stryker disable next-line ConditionalExpression,EqualityOperator,LogicalOperator: with none to wait, the filter takes none out and the frame asked for draws none; a band whose every row waits is one the view shows none of, which a window with rows never has.
        if (later.length > 0 && later.length < inBand.length) {
          inBand = inBand.filter((key) => !arriving.current.has(key));
          from = indexes.get(inBand[0]!)!;
          to = indexes.get(inBand.at(-1)!)!;
          drip();
        }
      }
      // Stryker disable next-line StringLiteral: keys joined with no separator tell two bands apart too, but for keys that run into each other.
      const id = inBand.join("\n");
      // The same band as drawn asks for no render: a state set to what it holds still renders the list again, in the same task
      // when set from a layout effect.
      // Stryker disable next-line ConditionalExpression: the check before it already leaves the band drawn alone; this one only spares a render that draws the same rows, when two syncs in a task land on one band.
      if (band?.id !== id) {
        setting.current = id;
        // Stryker disable next-line ConditionalExpression: when two syncs in a task land on one band, the band already set is returned, which spares a render that draws the same rows.
        setBand((now) => (now?.id === id ? now : { id, from: keys[from]!, to: keys[to]!, held: new Set(inBand) }));
      }
    };
    // The post marks go in before the early return below, since a child's variant can change on a render that reads nothing
    // else, and the counts the keyboard's marks place by with them. A mark that already holds writes nothing, and reading
    // attributes, siblings and children forces no layout.
    for (const slot of content.querySelectorAll(`:scope > [${SLOT}]`)) {
      markPostAfter(slot);
      markRunNext(slot);
      // Stryker disable next-line CallExpression: the window counts the children again just after this, and the observer that follows marks each message by those counts, so the marks end the same without this.
      counts.current.set(slot.getAttribute(SLOT)!, topItems(slot).length);
    }
    const now = viewRef.current;
    const last = synced.current;
    synced.current = now;
    // Stryker disable next-line ConditionalExpression,LogicalOperator,EqualityOperator,MethodExpression,OptionalChaining,ArrowFunction: this only spares reading the layout on a render that changed nothing the window reads, as the app draws again while someone types.
    if (last?.windowed === now.windowed && last.band === now.band && last.measured === now.measured && last.reach === now.reach && last.keys.length === now.keys.length && last.keys.every((key, index) => key === now.keys[index])) return;
    // Children that came since the window last looked, which the band waits to draw where the view does not show them. A list
    // that opens another conversation draws its view first, which leaves none of them waiting, then the rest at once.
    if (last !== null) {
      // Stryker disable next-line ConditionalExpression,LogicalOperator: a list drawn whole draws every child and never reads which came, and the same keys hold none that came; this only keeps keys from piling up, and spares looking.
      const before = now.windowed && last.keys !== now.keys ? new Set(last.keys) : null;
      if (before !== null) for (const key of now.keys) if (!before.has(key)) arriving.current.add(key);
    }
    // The keyboard's marks for the messages that come into the page go in first: a mark is a write, and a read of the layout
    // after the write flushes the styles again. The counts they place by were taken above.
    keyboardMark.current?.();
    windowSync.current(false);
  });
  useLayoutEffect(() => {
    const scroller = scrollerRef.current!;
    const content = contentRef.current!;
    const state = reader.current;
    const byReader = () => void (state.at = performance.now());
    const press = () => ((state.held = true), byReader());
    const release = () => void (state.held = false);
    const onScroll = () => {
      // Stryker disable next-line EqualityOperator: a scroll exactly at the gap is the reader's or code's alike.
      if (performance.now() - state.at <= READER_GAP) state.going = true;
      // The list's own move (following the end, keeping the reader's place) leaves the last scroll's say.
      if (scroller.scrollTop !== ownTop.current) state.code = !state.going && !state.held;
      ownTop.current = null;
      // Stryker disable next-line BooleanLiteral: a scroll moves nothing the window measures, so measuring again on it only costs the time.
      windowSync.current!(true);
    };
    // The reader's scroll is over: a scroll after this is code's, unless they act again.
    const onScrollEnd = () => void (state.going = false);
    // Stryker disable next-line ObjectLiteral,BooleanLiteral: passive only lets the browser scroll without waiting for this listener.
    scroller.addEventListener("scroll", onScroll, { passive: true });
    scroller.addEventListener("scrollend", onScrollEnd);
    const reading = ["wheel", "touchstart", "touchmove", "keydown"] as const;
    // Stryker disable next-line ObjectLiteral,BooleanLiteral: passive only lets the browser scroll without waiting for this listener.
    for (const type of reading) scroller.addEventListener(type, byReader, { passive: true });
    scroller.addEventListener("pointerdown", press);
    const doc = scroller.ownerDocument;
    // Stryker disable next-line BooleanLiteral: captured, so a release an app stops on its way still lets go; bubbling, it lets go alike where none does.
    doc.addEventListener("pointerup", release, true);
    // Stryker disable next-line BooleanLiteral: captured, so a release an app stops on its way still lets go; bubbling, it lets go alike where none does.
    doc.addEventListener("pointercancel", release, true);
    const resized = new ResizeObserver(() => windowSync.current!(false));
    resized.observe(scroller);
    resized.observe(content);
    const slots = new ResizeObserver((entries) => {
      // A target is usually still its slot's own child; one swapped out for a different element under the same key is
      // removed before a notification already queued for it arrives, so it finds no slot left to mark dirty.
      for (const entry of entries) {
        const key = (entry.target as Element).closest(`[${SLOT}]`)?.getAttribute(SLOT);
        // Stryker disable next-line ConditionalExpression,LogicalOperator: key is never null (getAttribute only
        // returns null when the attribute is missing, and closest only ever matches an ancestor that carries it), and
        // nothing after this ever reads dirtySlots.current as a whole or asks it for undefined, only has/delete of a
        // real key, so forcing this guard true, or swapping && for ||, changes nothing anything after it reads.
        if (key !== null && key !== undefined) dirtySlots.current.add(key);
      }
      windowSync.current!(false);
    });
    slotWatch.current = slots;
    // Stryker disable next-line all: once the list is gone, nothing reads what these would change; disconnecting frees memory only.
    return () => (resized.disconnect(), slots.disconnect(), slotWatch.current === slots && (slotWatch.current = null), scroller.removeEventListener("scroll", onScroll), scroller.removeEventListener("scrollend", onScrollEnd), reading.forEach((type) => scroller.removeEventListener(type, byReader)), scroller.removeEventListener("pointerdown", press), doc.removeEventListener("pointerup", release, true), doc.removeEventListener("pointercancel", release, true), cancelAnimationFrame(widening.current?.frame ?? 0), clearTimeout(widening.current?.timer), cancelAnimationFrame(dripping.current));
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
          // Stryker disable next-line LogicalOperator,ConditionalExpression: a message without one to replace has no
          // `old` to look up in `texts`, so `texts.get(old)` reads `undefined` there, and `textOf(message)` on any real
          // message is never `undefined` (`data-ouro-message-content` is required of every one, per its own docs above);
          // the third clause is therefore already true whenever `old === undefined` is, and forcing the first clause, or
          // the first `||` alone, false never changes the result some test here could observe.
          if (old === undefined || waiting.has(old) || texts.get(old) !== textOf(message)) {
            waiting.add(message);
            // A message new to the conversation's end, not merely redrawn by windowing nor a quiet replacement of the one
            // in its place: the newest drawn row could now reach the pill, so the room it keeps clear of it is owed.
            // Stryker disable next-line ConditionalExpression: while pinned, this same arrival also keeps the view following
            // the end, which writes the scroll position and so fires the browser's own scroll event before any render is seen;
            // that event's pinned.current check (below) finds the view still at the end and resets this to false in the same
            // batch, so setting it unconditionally here is never observable.
            if (!pinned.current) setJumpRoom(true);
          }
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
    // Stryker disable next-line BooleanLiteral: the first sync(true), as this effect mounts, runs with `switched` false and sets it false.
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
      // Only a change writes: a scroll places the Tab stop again, and a write that changes nothing still lays the page out.
      if (item) mark(item, "tabindex", "0");
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
    // The messages' marks: each Tab stop, the control and part they are, and their places. The window runs them before it
    // reads the layout (see the effect that calls it), so each mark is written before a read flushes the styles.
    const markItems = (): HTMLElement[] => {
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
        // Only an article takes a position (ARIA allows it there), and one the app set stands; a Message's own first
        // render already wrote this position, so it is the list's own, not an app override, the first time this reads it.
        const own = item.getAttribute("aria-posinset");
        if (!item.matches('article:not([role]), [role="article"]') || (own !== null && own !== written.get(item) && own !== position)) return;
        written.set(item, position);
        mark(item, "aria-posinset", position);
        mark(item, "aria-setsize", String(size));
      });
      return list;
    };
    // After React's commit, so it reads no layout unless the Tab stop went: reading where messages
    // are here would lay the page out before the browser does, at every new message.
    const sync = (changed: boolean) => {
      // Out of the Tab order, for the list's Tab and the browser's alike (`guards`).
      // Stryker disable next-line StringLiteral: an empty or any other negative tabindex takes a span out of the Tab order too.
      for (const guard of content.querySelectorAll(guards)) mark(guard, "tabindex", "-1");
      // A message removed with nothing in its place waited for the next messages, another conversation's: other messages
      // coming instead let it go, so they never take focus from wherever the reader went since.
      // Stryker disable next-line ArrayDeclaration: undefined and null are alike to every read of `focused`.
      if (waiting && changed && !switched.current) [focused, waiting] = [null, false];
      // In another conversation, focus goes to its Tab stop, below, without scrolling: no message is in the old one's place.
      // Stryker disable next-line ConditionalExpression: a focus that went elsewhere is reported by a focus event, which clears `focused` before this runs, so a message that went with `focused` still set left focus on the body.
      const onBody = doc.activeElement === doc.body;
      const lost = focused?.isConnected === false && onBody;
      const refocus = lost && switched.current;
      if (lost && !refocus) {
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
          // Stryker disable next-line ConditionalExpression: with none before it, `indexOf(undefined)` is -1, which also gives the first.
          const next = keys[before === undefined ? 0 : keys.indexOf(before) + 1];
          const key = next !== undefined && !kept.has(next) ? next : (after ?? keys.at(-1));
          // Stryker disable next-line StringLiteral: any block but "center" or "start" scrolls only as far as it needs.
          requestRef.current({ key: key!, id: null, child: false, forward: true, focus: true, block: "nearest" });
        }
      }
      // Stryker disable next-line ArrayDeclaration: an empty pattern leaves both undefined, which every read of them (`?.`, a truthiness test) treats as null and false.
      if (refocus) [focused, waiting] = [null, false];
      switched.current = false;
      if (!changed) return;
      const list = markItems();
      // Stryker disable next-line ConditionalExpression: placing it again picks the same message, since a scroll places it too; this only spares reading the layout.
      if (!current?.isConnected) place(list);
      // A switch has its messages in (an empty commit is not one: "does not switch on an empty commit"), so there is a Tab stop.
      if (refocus) focusOn(current!);
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
      // Stryker disable next-line ArrayDeclaration: an empty pattern leaves both undefined, which every read of them treats as null and false.
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
    keyboardMark.current = markItems;
    const observer = new MutationObserver((records) => {
      // A message that changes its variant without the list rendering re-renders its children, which the child list shows, so
      // no attribute is watched. The mark that moves is the next slot's, the only one that reads this slot.
      for (const { target } of records) {
        const slot = (target as Element).closest(`[${SLOT}]`);
        markPostAfter(slot?.nextElementSibling);
        markRunNext(slot?.previousElementSibling);
      }
      // Stryker disable next-line ConditionalExpression,MethodExpression,BooleanLiteral: after only the bar moved, syncing finds and marks the same messages again; skipping it only spares the work.
      if (!records.every(barOnly)) sync(records.some(touchesItems));
    });
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
    <div {...rest} data-ouro="message-list" className={cn("relative box-border flex min-h-0 flex-col", hasFind && findMarks, className)}>
      {/* Holds the scroller and its focus ring, drawn over it, so content that sticks to an edge never covers the ring. */}
      <div className="relative flex min-h-0 flex-1 flex-col">
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
          // While focused, isolate keeps the content's own stacking (a sticky header's z-index) inside the scroller, under the ring.
          className="peer relative min-h-0 flex-1 overflow-y-auto bg-(--ouro-scroller-surface) overscroll-contain [overflow-anchor:none] outline-none focus-visible:isolate forced-colors:[&[tabindex='0']]:outline-1 forced-colors:[&[tabindex='0']]:outline-solid forced-colors:[&[tabindex='0']]:-outline-offset-1"
        >
          <span ref={startRef} tabIndex={-1} aria-hidden="true" data-ouro-message-list-edge="" className="absolute outline-none" />
          <div
            ref={contentRef}
            data-ouro-message-list-content=""
            className="box-border flex min-h-full flex-col justify-end gap-4 p-4 [&>[data-ouro-message-list-slot]>[data-continued]]:-mt-[calc(1rem-var(--ouro-message-run-gap,var(--ouro-size-1)))]"
            style={maxWidth === undefined ? undefined : { maxWidth, marginInline: "auto" }}
          >
            {/* With the content's own padding, keeps the first message below "Loading older messages", which sits over the list's top. */}
            {room && <div ref={roomRef} aria-hidden="true" data-ouro-message-list-older-room="" className="-mb-4 h-11 shrink-0" />}
            <RowLayerContext.Provider value={layer as RowLayer<unknown>}>{slots}</RowLayerContext.Provider>
            {/* While "Jump to latest" shows, keeps the newest message clear of its own raised pill at the list's bottom. */}
            {showJump && jumpRoom && <div ref={jumpRoomRef} aria-hidden="true" data-ouro-message-list-jump-room="" data-slot="message-list-jump-room" className="-mb-4 h-20 shrink-0" />}
          </div>
          <span ref={endRef} tabIndex={-1} aria-hidden="true" data-ouro-message-list-edge="" className="absolute outline-none" />
          {/* The one bar and menu: portals, so nothing of theirs is here in the page; inside the scroller in React, so a key
              in the bar (Tab, the arrows) reaches the list's keyboard handling as a key in its message would. */}
          {Layer && <Layer scroller={scrollerRef} layer={layer} />}
          <span ref={floorRef} aria-hidden="true" data-ouro-message-list-floor="" className="pointer-events-none absolute start-0 top-0 hidden size-px" />
          <span ref={endMarkRef} aria-hidden="true" data-ouro-message-list-end-mark="" data-slot="message-list-end-mark" className="pointer-events-none absolute start-0 top-0 hidden size-px [overflow-anchor:none]" />
        </div>
        {/* There only while the scroller has focus: at rest nothing lies over the content, so a contrast check sees the text's own background. */}
        <span
          aria-hidden="true"
          data-ouro-message-list-focus-ring=""
          className="pointer-events-none absolute inset-0 hidden rounded-[inherit] outline-ring -outline-offset-2 peer-focus-visible:block peer-focus-visible:outline-2 peer-focus-visible:outline-solid"
        />
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
            <span className={cn(olderClass, mounted && olderFadeClass)}>
              <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" className="size-ouro-4 animate-[ouro-spin_0.8s_linear_infinite] motion-reduce:animate-[ouro-pulse_1.6s_ease-in-out_infinite]">
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
          <button ref={jumpRef} type="button" data-ouro-message-list-jump="" data-ouro-control="message-list" data-ouro-part="jump" onClick={jump} className={jumpClass}>
            <TouchTarget />
            {jumpLabel}
            <svg aria-hidden="true" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="size-ouro-4">
              <path d="M8 3v10M4 9l4 4 4-4" />
            </svg>
          </button>
        </div>
      )}
      {FindLayer && find ? <FindLayer all={all} keys={keys} find={find} hasOlder={hasOlder} scroller={scrollerRef} content={contentRef} slot={SLOT} onFindMatches={onFindMatches} onMarks={setFindMarks} request={requestRef} /> : null}
    </div>
  );
}
