"use client";

import {
  isValidElement,
  type CSSProperties,
  useContext,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type HTMLAttributes,
  type JSX,
  type MouseEvent,
  type PointerEvent,
  type ReactElement,
  type ReactNode,
  type Ref,
  type SVGProps,
} from "react";
import { Avatar, type AvatarPresence } from "@/registry/ouro/components/ouro/avatar/avatar";
import { Button } from "@/registry/ouro/components/ouro/button/button";
import { Skeleton } from "@/registry/ouro/components/ouro/skeleton/skeleton";
import type { MenuEntry, MenuShortcut } from "@/registry/ouro/components/ouro/menu/menu";
import type { MessageActionBar, MessageBarData } from "@/registry/ouro/components/ouro/message/message-parts";
import { useAppearanceClassNameCheck } from "@/registry/ouro/lib/ouro/class-name-check";
import { announce } from "@/registry/ouro/lib/ouro/announce";
import { cn } from "@/registry/ouro/lib/ouro/cn";
import { RowLayerContext } from "@/registry/ouro/lib/ouro/row-hover";
import { useDevWarnings } from "@/registry/ouro/lib/ouro/use-dev-messages";

/** Who wrote a message: the person using the app, the assistant, or the app itself. */
export type MessageRole = "user" | "assistant" | "system";

/**
 * How a message is laid out: `default` for a conversation with an assistant, `chat` for a chat
 * between people, `post` for a post in a channel, and `reply` for a reply in its thread.
 */
export type MessageVariant = "default" | "chat" | "post" | "reply";

/**
 * Where a `chat` or `reply` message's action bar sits: `corner` over the bubble's top corner, raised
 * over the line above it, or `beside` the bubble, past its end and level with its top.
 */
export type MessageActionsPlacement = "corner" | "beside";

/**
 * How a `chat` message's bubble, or a `reply` drawn as one, looks: `filled`, the user's own in the
 * primary color and others' on the muted surface, round with equal corners; or
 * `raised`, others' on a raised card and the user's own in a tint of the primary color.
 */
export type MessageBubble = "filled" | "raised";

/** One action in a message's action bar: an icon button with a tooltip. */
export interface MessageAction {
  /** Identifies the action among the message's actions ("reply"). */
  key: string;
  /** The button's name, which its tooltip shows too: "Reply". */
  label: string;
  /** What the button shows: an icon element (`<ReplyIcon />`) or an emoji. Screen readers hear `label` instead. */
  icon: ReactNode;
  /** Runs when the action is pressed. */
  onClick: (event: MouseEvent<HTMLElement>) => void;
  /** Shown, but cannot be pressed: an action the app has turned off for now. */
  disabled?: boolean | undefined;
  /**
   * The keys that run it, as `Kbd` takes them (`["1"]`), shown after its name in its tooltip and
   * under its emoji in the menu's row of reactions, and given to screen readers. It only shows the keys; bind them in your app.
   * @claim "shown after its name in its tooltip" registry/ouro/components/ouro/message/message.test.tsx verify:testExists(registry/ouro/components/ouro/message/message.test.tsx::Message actions > shows each action's shortcut in its tooltip and under its reaction in the menu, and gives it to screen readers)
   */
  shortcut?: MenuShortcut | undefined;
}

/** The message a message replies to, for Message's `quote`: who wrote it and a line of what they wrote. */
export interface MessageQuote {
  /** Who wrote the quoted message: "Ana Lind", or "You". */
  author: string;
  /**
   * What they wrote, or its start. One line shows, cut with an ellipsis.
   * @claim "One line shows, cut with" registry/ouro/components/ouro/message/message.test.tsx verify:testExists(registry/ouro/components/ouro/message/message.test.tsx::Message quote > shows the quote at the top of the message: a bar, the author in semibold and the excerpt on one line, cut with an ellipsis)
   */
  excerpt: string;
  /** The author's picture, before the name: an `Avatar` element, `<Avatar name="Ana" src={url} alt="" size="xs" />`. */
  avatar?: ReactElement | undefined;
  /**
   * Makes the quote a button that shows the quoted message, as by scrolling to it. In a `MessageList`, which may not
   * have drawn a message far up a long conversation, call its `actionsRef.current.reveal(id, { focus: true })`.
   */
  onActivate?: (() => void) | undefined;
  /** What screen readers hear in place of the author's name, before the excerpt. @default `Quoting ${author}` */
  label?: string | undefined;
}

/** The props Message adds to the `<article>` attributes it passes through. */
export interface MessageOwnProps {
  /**
   * Who wrote it. `user` is the person using the app: their messages sit at the end, in
   * the primary color. `assistant` is anyone else, such as an agent, at the start. `system`
   * is the app's own note ("Ana joined"), centered and quiet.
   */
  role: MessageRole | (string & { 'Use "user", "assistant" or "system"': never });
  /**
   * How the message is laid out. `default` suits a conversation with an assistant. `chat`
   * suits people writing to each other: others' messages at the start under their name and
   * time, the user's own at the end with only the time, each bubble at most 85% of the row's
   * width and 36rem, so a line stays readable in a wide window. `chat` also suits a channel without threads, which reads as a chat.
   * `post` is a post in a threaded channel, unboxed: the author's name and time, an optional
   * `subject`, the text, then the `footer` and the `thread` under it, with room around it and
   * a hairline from the text's start to the end between it and a post just before it. `bubble`
   * sets how a `chat` message's bubble looks, and draws a `reply` as one. `reply`
   * is a reply in a thread: the same line of name and time, with the text unboxed under it,
   * starting where a post's text starts. In `post` and `reply` the user's own messages sit at
   * the start too.
   * @default "default"
   *
   * @claim "`chat` suits people writing to each" registry/ouro/components/ouro/message/message.test.tsx verify:testExists(registry/ouro/components/ouro/message/message.test.tsx::Message chat > fills the user's own bubble with the primary color and puts others' on the muted surface by default, each round with equal corners)
   * @claim "each bubble at most 85% of" registry/ouro/components/ouro/message/message.test.tsx verify:testExists(registry/ouro/components/ouro/message/message.test.tsx::Message rows > keeps a bubble to 85% of its row and 36rem, however wide the window)
   * @claim "`post` is a post in a" registry/ouro/components/ouro/message/message.test.tsx verify:testExists(registry/ouro/components/ouro/message/message.test.tsx::Message post > is unboxed, with the name and time over the subject and text, and the footer and thread under them)
   * @claim "a hairline from the text's start" registry/ouro/components/ouro/message/message.test.tsx verify:testExists(registry/ouro/components/ouro/message/message.test.tsx::Message post > draws a hairline from the text's start to the end between two posts, and none above the first)
   * @claim "`reply` is a reply in a" registry/ouro/components/ouro/message/message.test.tsx verify:testExists(registry/ouro/components/ouro/message/message.test.tsx::Message post > lays a reply out unboxed under its name and time, at the start for everyone)
   * @claim "starting where a post's text starts" registry/ouro/components/ouro/message/message.test.tsx verify:testExists(registry/ouro/components/ouro/message/message.test.tsx::Message post > starts a reply's text where a post's text starts)
   */
  variant?: MessageVariant | (string & { 'Use "default", "chat", "post" or "reply"': never }) | undefined;
  /**
   * How a `chat` message's bubble looks. `filled`, the default, is a messaging app's: the user's
   * own message filled with `--ouro-bubble-user` and text in `--ouro-bubble-user-foreground`
   * when the theme sets them, else as a primary button is (`--ouro-action`, else the primary color); others'
   * filled with `--ouro-bubble-other` and text in `--ouro-bubble-other-foreground` when the theme sets them, else
   * the muted surface, each round with equal corners, with an edge that
   * forced colors draw. In a run of `continued` messages from one sender, the corners where neighboring bubbles meet
   * are slightly less round (`--ouro-message-joined-radius`, `--radius-ouro-xl` unless set), on the side the bubbles sit (the end
   * for the user's own, the start for others', mirrored in right-to-left), and `MessageList` keeps
   * `--ouro-message-run-gap` (`--ouro-size-2` unless set) between them. Inside the user's own bubble, the theme's colors follow the fill, so a
   * link (underlined), a mention, a quote, a button or a focus ring in it stays readable on it; on others', a link, a mention or muted text
   * follows the bubble's own text color instead of the page's, so it keeps 4.5:1 there too. `raised` is a workplace chat's: others' messages on a raised card with
   * a hairline and a small shadow, the user's own in a tint of the primary color. A `reply` with a
   * `bubble` is laid out as a chat's message, for a thread that reads as a chat: the user's own at
   * the end, others' at the start under their name, each in a bubble of that look. A `reply`
   * without one stays unboxed, and `default` and `post` ignore it.
   * @default "filled" on a `chat` message; unboxed on a `reply`
   *
   * @claim "`filled`, the default, is a messaging" registry/ouro/components/ouro/message/message.test.tsx verify:testExists(registry/ouro/components/ouro/message/message.test.tsx::Message chat > fills the user's own bubble with the primary color and puts others' on the muted surface by default, each round with equal corners)
   * @claim "others' filled with `--ouro-bubble-other`" registry/ouro/components/ouro/message/message.test.tsx verify:testExists(registry/ouro/components/ouro/message/message.test.tsx::Message chat > fills others' bubble from --ouro-bubble-other and its text from --ouro-bubble-other-foreground before the muted surface)
   * @claim "on others', a link, a mention or muted text" registry/ouro/components/ouro/message/message.test.tsx verify:testExists(registry/ouro/components/ouro/message/message.test.tsx::Message chat > keeps a link in the primary color at 4.5:1 or more on others' muted bubble)
   * @claim "follows the bubble's own text color" registry/ouro/components/ouro/message/message.test.tsx verify:testExists(registry/ouro/components/ouro/message/message.test.tsx::Message chat > mixes a link, a success mark and muted text toward --ouro-bubble-other-foreground, not the page's own foreground, once it is set)
   * @claim "else as a primary button" registry/ouro/components/ouro/message/message.test.tsx verify:testExists(registry/ouro/components/ouro/message/message.test.tsx::Message chat > fills the user's own bubble as a primary button is, from --ouro-action when the theme sets it)
   * @claim "with an edge that" registry/ouro/components/ouro/message/message.test.tsx verify:fileLine(registry/ouro/components/ouro/message/message.test.tsx, /chromiumOnly\("keeps both filled bubbles' edges under forced colors"/)
   * @claim "link (underlined), a mention" registry/ouro/components/ouro/message/message.test.tsx verify:testExists(registry/ouro/components/ouro/message/message.test.tsx::Message chat > underlines a link in the user's own filled bubble, and gives both filled bubbles a clear edge)
   * @claim "the theme's colors follow the fill" registry/ouro/components/ouro/message/message.test.tsx verify:testExists(registry/ouro/components/ouro/message/message.test.tsx::Message chat > keeps the primary color readable inside the user's filled bubble: a link or mention in it takes the bubble's text color)
   * @claim "A `reply` with a" registry/ouro/components/ouro/message/message.test.tsx verify:testExists(registry/ouro/components/ouro/message/message.test.tsx::Message chat > draws a reply given a bubble as a chat's message: the user's own filled at the end, others' at the start, and a reply without one unboxed)
   * @claim "`raised` is a workplace chat's" registry/ouro/components/ouro/message/message.test.tsx verify:testExists(registry/ouro/components/ouro/message/message.test.tsx::Message chat > puts others' messages at the start on a raised bubble under their name and time, and the user's own at the end in a tint)
   */
  bubble?: MessageBubble | (string & { 'Use "filled" or "raised"': never }) | undefined;
  /**
   * The author's name. Screen readers hear it before the message, and the avatar's
   * initials come from it. Required, so every message says who wrote it. The user's own
   * name is read but not shown.
   *
   * Pass `null` while the name is still loading: a name-sized Skeleton line takes the name's
   * place on its line, the avatar shimmers in its own shape, and screen readers hear
   * `nameLoadingLabel`. Nothing moves when the name arrives.
   * @claim "Required, so every message says who" registry/ouro/components/ouro/message/message.test.tsx verify:testExists(registry/ouro/components/ouro/message/message.test.tsx::Message > is an article that says who wrote it, then what they wrote)
   * @claim "Required, so every message says who" registry/ouro/components/ouro/message/message.test-d.ts verify:fileLine(registry/ouro/components/ouro/message/message.test-d.ts, /expectTypeOf<\{\srole:\s"user"\s\}>\(\)\.not\.toExtend<MessageProps>/)
   * @claim "Pass `null` while the name is" registry/ouro/components/ouro/message/message.test.tsx verify:testExists(registry/ouro/components/ouro/message/message.test.tsx::Message > holds the name's place with a name-sized line while it loads, so nothing moves when it arrives)
   */
  name: string | null;
  /** What screen readers hear while `name` is `null`, for other languages. @default "Name loading" */
  nameLoadingLabel?: string | undefined;
  /**
   * What shows as the author's name in place of `name`, when plain text cannot draw it: their
   * name with its emoji as pictures (`<EmojiText text={person.name} catalogue={catalogue} />`).
   * `name` stays what screen readers hear and the avatar's initials come from.
   *
   * @claim "`name` stays what screen readers hear" registry/ouro/components/ouro/message/message.test.tsx verify:testExists(registry/ouro/components/ouro/message/message.test.tsx::Message > shows nameContent as the author's name, while screen readers hear name and the initials come from it)
   */
  nameContent?: ReactNode;
  /**
   * A quiet tag after the author's name, such as "AI agent" for an agent or "Guest": small and
   * muted beside the name, not a badge, and read after it ("Halden, AI agent"). Where the name
   * is hidden (a `continued` message, the user's own `chat` messages) the tag is too, and both
   * are still read.
   * @claim "A quiet tag after the author's" registry/ouro/components/ouro/message/message.test.tsx verify:testExists(registry/ouro/components/ouro/message/message.test.tsx::Message name tag > shows a quiet tag after the name in every layout, read after the name)
   * @claim "Where the name is hidden" registry/ouro/components/ouro/message/message.test.tsx verify:testExists(registry/ouro/components/ouro/message/message.test.tsx::Message name tag > hides the tag with the name, and still reads it)
   */
  nameTag?: string | undefined;
  /**
   * The author's picture URL. Without it the avatar shows initials; `false` shows no avatar.
   * For the author's presence, pass `presence`. Pass an `Avatar` element instead for a square
   * avatar or a color of your own: `avatar={<Avatar name="Ana" src={url} alt="" size="sm" />}`
   * (`alt=""`, since the name is written beside it). In `chat`, the user's own messages show
   * no avatar.
   *
   * @claim "In `chat`, the user's own" registry/ouro/components/ouro/message/message.test.tsx verify:testExists(registry/ouro/components/ouro/message/message.test.tsx::Message chat > shows an Avatar element the app passes, and no avatar on the user's own chat messages)
   * @claim "Pass an `Avatar` element instead for" registry/ouro/components/ouro/message/message.test.tsx verify:testExists(registry/ouro/components/ouro/message/message.test.tsx::Message chat > shows an Avatar element the app passes, and no avatar on the user's own chat messages)
   * @claim "Without it the avatar shows initials" registry/ouro/components/ouro/message/message.test.tsx verify:testExists(registry/ouro/components/ouro/message/message.test.tsx::Message > shows the author's avatar from main's Avatar, silent because the name is written)
   * @claim "Without it the avatar shows initials" registry/ouro/components/ouro/message/message.test.tsx verify:testExists(registry/ouro/components/ouro/message/message.test.tsx::Message > shows a system message centered and quiet, without avatar or bubble)
   */
  avatar?: string | false | ReactElement | undefined;
  /**
   * When it was written, already formatted for the reader ("9:41 AM"), shown after the name.
   * Format it in the browser after hydration, so the server and the reader's clock agree.
   */
  time?: string | undefined;
  /** The same moment for machines, as an ISO date (`2026-05-01T09:41`): the `<time>` element's `dateTime`. */
  dateTime?: string | undefined;
  /**
   * The message follows one from the same author: no avatar and no name line, so a run of
   * messages reads as one. Its time shows beside it on hover and focus. Screen readers still
   * hear the name and time. Not for `post`: every post shows its author.
   *
   * @claim "Not for `post`: every post shows" registry/ouro/components/ouro/message/message.test.tsx verify:testExists(registry/ouro/components/ouro/message/message.test.tsx::Message post > keeps its avatar and name when continued, since every post shows its author)
   * @claim "The message follows one from the" registry/ouro/components/ouro/message/message.test.tsx verify:testExists(registry/ouro/components/ouro/message/message.test.tsx::Message chat > groups a continued message under the one before, without avatar or name, its time on hover)
   */
  continued?: boolean | undefined;
  /** A post's subject, in semibold above its text. `post` only. */
  subject?: ReactNode;
  /** The message: text, or rich content such as a list or a code block. */
  children?: ReactNode;
  /**
   * A short line above the message, before its quote and its text, saying where the message
   * stands, such as "Replied in thread" over the message it replied to. Screen readers hear it
   * first in the message's content, before the quote. Nothing shows when it is undefined, null,
   * false or empty. For example: `<Message role="user" name="Ana" context="Replied in thread" quote={{ author: "Fen", excerpt: "Ship it?" }}>Yes</Message>`.
   *
   * @claim "Screen readers hear it first in the message's content" registry/ouro/components/ouro/message/message.test.tsx verify:testExists(registry/ouro/components/ouro/message/message.test.tsx::Message context > is read before the quote and the text)
   */
  context?: ReactNode | undefined;
  /**
   * The message this one replies to, at the top of the bubble or post, above the text: a bar,
   * the author and a line of what they wrote, as Composer's `quote` shows it before the reply
   * is sent. Screen readers hear it first, as "Quoting Ana: …". With `onActivate` it is a
   * button, to show the quoted message.
   *
   * @claim "as Composer's `quote` shows it" registry/ouro/components/ouro/composer/composer.test.tsx verify:testExists(registry/ouro/components/ouro/composer/composer.test.tsx::Composer quote > looks as Message's quote does once the reply is sent)
   * @claim "Screen readers hear it first, as" registry/ouro/components/ouro/message/message.test.tsx verify:testExists(registry/ouro/components/ouro/message/message.test.tsx::Message quote > is read before the text, as the label and the excerpt)
   * @claim "With `onActivate` it is a button" registry/ouro/components/ouro/message/message.test.tsx verify:testExists(registry/ouro/components/ouro/message/message.test.tsx::Message quote > is a button with onActivate, named by the quote, which keyboard and pointer press)
   */
  quote?: MessageQuote | undefined;
  /**
   * Files and pictures sent with the message, shown under it: `<Attachment>` elements, and
   * pictures as `<Lightbox layout="mosaic">`, which keeps them to a chat's size and opens them
   * full size.
   */
  attachments?: ReactNode;
  /**
   * Under the message: its reactions (`<ReactionBar>`) and "Edited". For whether it was
   * delivered or seen, use `statusMark` instead: a row here reads as a line of its own under
   * every message, rather than a mark that belongs to the bubble.
   */
  footer?: ReactNode;
  /**
   * A small mark seated against the user's own bubble, at its bottom end corner: for example
   * whether the message was delivered or seen. It
   * sits inside the bubble's own box, in room the bubble reserves for it, rather than overlapping
   * the message's own text or adding a row of its own alongside `header` or `footer`. For example
   * `statusMark={<Text size="xs" tone="secondary">Seen 9:41 AM</Text>}`. It draws only on a
   * user's own bubble: a `default` message, a `chat` message, or a `reply` given its own
   * `bubble`. An `assistant` or `system` message, and a `post` or unbubbled `reply`, have no
   * bubble corner to seat it against, so it does not draw there.
   *
   * @claim "sits inside the bubble's own box, in room the bubble reserves for it" registry/ouro/components/ouro/message/message.test.tsx verify:testExists(registry/ouro/components/ouro/message/message.test.tsx::Message statusMark > sits inside the bubble's own box, against its bottom end corner, in room the bubble reserves for it)
   * @claim "It draws only on a user's own bubble" registry/ouro/components/ouro/message/message.test.tsx verify:testExists(registry/ouro/components/ouro/message/message.test.tsx::Message statusMark > draws on role="user" only, not on assistant or a bubbleless post)
   * @claim "have no bubble corner to seat it against, so it does not draw there" registry/ouro/components/ouro/message/message.test.tsx verify:testExists(registry/ouro/components/ouro/message/message.test.tsx::Message statusMark > draws on role="user" only, not on assistant or a bubbleless post)
   */
  statusMark?: ReactNode | undefined;
  /** Under a post, or a message in a channel without threads: its thread, as a `<ThreadSummary>`. */
  thread?: ReactNode;
  /**
   * The message's actions, as icon buttons with tooltips in a small bar at the bubble's top end
   * (`actionsPlacement`) or over a post's top end. The bar shows while the pointer is over
   * the message, while focus is in it, and after a tap on a touch screen. It is a toolbar: one Tab stop, with the arrow
   * keys moving between its buttons. In a `MessageList` the list draws one bar for all its
   * messages, on the message the pointer is over (or that keyboard focus is in, or was tapped), and
   * hides it as the pointer leaves, the list scrolls under it, the window loses focus or the menu opens,
   * so at most one bar shows and none stays behind. Escape hides it.
   *
   * @claim "In a `MessageList` the list draws" registry/ouro/components/ouro/message/message-list.actions.test.tsx verify:testExists(registry/ouro/components/ouro/message/message-list.actions.test.tsx::MessageList actions > draws one bar for the whole list, on the message the pointer is over, and listens the same for a hundred messages as for two)
   * @claim "so at most one bar shows" registry/ouro/components/ouro/message/message-list.actions.test.tsx verify:testExists(registry/ouro/components/ouro/message/message-list.actions.test.tsx::MessageList actions > hides the bar when the list scrolls under the pointer, and never shows more than one)
   * @claim "It is a toolbar: one Tab" registry/ouro/components/ouro/message/message.test.tsx verify:testExists(registry/ouro/components/ouro/message/message.test.tsx::Message actions > is one Tab stop, and the arrow keys, Home and End move between its buttons)
   * @claim "The bar shows while the pointer" registry/ouro/components/ouro/message/message.test.tsx verify:testExists(registry/ouro/components/ouro/message/message.test.tsx::Message actions > shows the bar on hover and while focus is in the message, and hides it otherwise)
   */
  actions?: readonly MessageAction[] | undefined;
  /**
   * Where the action bar sits on a `chat` or `reply` message. `beside` puts it just past the
   * bubble's end, level with its top, so it covers neither the name nor the message and stays
   * with the bubble however wide the row; where the row has no room left, it ends at the row's
   * edge, over the bubble's corner. On the user's own `chat` message it sits before the bubble.
   * `corner` puts it over the bubble's top corner, raised over the line above. A `post`'s bar is
   * over its top end, and the default layout's over its bubble's corner.
   *
   * @default "beside" on a `reply`, "corner" on a `chat`
   * @claim "`beside` puts it just past the" registry/ouro/components/ouro/message/message.test.tsx verify:testExists(registry/ouro/components/ouro/message/message.test.tsx::Message actions > puts a reply's bar beside its text, level with its top, clear of the name)
   * @claim "where the row has no room left" registry/ouro/components/ouro/message/message.test.tsx verify:testExists(registry/ouro/components/ouro/message/message.test.tsx::Message actions > ends a bar beside a bubble at the row's edge when the bubble fills the row, with an avatar or without, right to left too)
   * @claim "On the user's own `chat` message" registry/ouro/components/ouro/message/message.test.tsx verify:testExists(registry/ouro/components/ouro/message/message.test.tsx::Message actions > puts a chat bar beside the bubble when asked: past others' bubbles, before the user's own)
   */
  actionsPlacement?: MessageActionsPlacement | (string & { 'Use "corner" or "beside"': never }) | undefined;
  /**
   * More actions, in a menu that opens from the last button in the action bar: the same
   * entries as Menu's `items`, each with an optional `icon` before its label and its `shortcut` at its end. The bar stays while the menu is open. The bar renders in the
   * browser once its code loads, so server HTML has the message without it; Menu's code loads as
   * soon as a bar with a menu is on the page, so the first press opens it without a wait. In a `MessageList`, the list has one menu for all its
   * messages: the bar's menu button, a right-click on the message (except on a field, a link, a picture or
   * selected text, which keep the browser's menu) and Shift+F10 or the context-menu key on it all open it, named by `actionsMenuLabel`, and
   * closing it puts focus back on the message.
   *
   * @claim "In a `MessageList`, the list has one menu" registry/ouro/components/ouro/message/message-list.actions.test.tsx verify:testExists(registry/ouro/components/ouro/message/message-list.actions.test.tsx::MessageList actions > opens one menu from the bar's button and a right-click, with the reactions on top, and the same menu again for another message)
   * @claim "Menu's code loads as soon as" registry/ouro/components/ouro/message/message.warm.test.tsx verify:testExists(registry/ouro/components/ouro/message/message.warm.test.tsx::Message's menu code > is fetched as a bar with a menu mounts, before anyone presses its button)
   * @claim "Shift+F10 or the context-menu key" registry/ouro/components/ouro/message/message-list.actions.test.tsx verify:testExists(registry/ouro/components/ouro/message/message-list.actions.test.tsx::MessageList actions > opens the menu from the keyboard on the focused message, and Escape puts focus back on it)
   * @claim "More actions, in a menu that" registry/ouro/components/ouro/message/message.test.tsx verify:testExists(registry/ouro/components/ouro/message/message.test.tsx::Message actions > opens the menu from the last button, and keeps the bar while it is open)
   */
  menu?: readonly MenuEntry[] | undefined;
  /**
   * Reactions at the top of the message's menu, as a row of emoji: each an action whose `icon` is the
   * emoji and whose `label` names it ("Like"). Left and right move along the row. Put one that opens
   * a picker of every reaction last ("More reactions").
   * @claim "Reactions at the top of the" registry/ouro/components/ouro/message/message.test.tsx verify:testExists(registry/ouro/components/ouro/message/message.test.tsx::Message actions > puts the quick reactions at the top of the menu, named, and the arrow keys move along them)
   */
  quickReactions?: readonly MessageAction[] | undefined;
  /** What screen readers hear for the row of reactions in the menu, for other languages. @default "Reactions" */
  quickReactionsLabel?: string | undefined;
  /** What screen readers hear for the action bar, for other languages. @default "Message actions" */
  actionsLabel?: string | undefined;
  /** What screen readers hear for the menu a `MessageList` opens for the message. @default `Message actions for ${name}` */
  actionsMenuLabel?: string | undefined;
  /** The menu button's name, for other languages. @default "More actions" */
  menuLabel?: string | undefined;
  /**
   * The reply is still being written. The message is `aria-busy`, an empty one shows a
   * typing indicator, and `MessageList` announces it once, when streaming ends.
   */
  streaming?: boolean | undefined;
  /** What screen readers hear for the typing indicator, for other languages. @default "Writing" */
  streamingLabel?: string | undefined;
  /**
   * The message did not send, and what the person can do about it: `{ onRetry, onDelete }`. A
   * calm marker under it says "Not sent" beside Retry and Delete buttons, and stays until the app
   * clears `failed`, so a failed send never goes quiet. Screen readers hear the marker as the
   * message's description. It appears at once, with no motion. To put the text back in a
   * `Composer` instead, set the Composer's `value` to it and delete the message.
   * @claim "A calm marker under it says" registry/ouro/components/ouro/message/message.test.tsx verify:testExists(registry/ouro/components/ouro/message/message.test.tsx::Message not sent > marks the message not sent under its bubble, with Retry and Delete, and describes the message with it)
   * @claim "and stays until the app clears" registry/ouro/components/ouro/message/message.test.tsx verify:testExists(registry/ouro/components/ouro/message/message.test.tsx::Message not sent > offers Retry alone without onDelete, and goes once the app clears failed)
   * @claim "Screen readers hear the marker as" registry/ouro/components/ouro/message/message.test.tsx verify:testExists(registry/ouro/components/ouro/message/message.test.tsx::Message not sent > keeps the app's own description beside the marker's)
   * @claim "It appears at once, with no" registry/ouro/components/ouro/message/message.test.tsx verify:testExists(registry/ouro/components/ouro/message/message.test.tsx::Message not sent > shows the marker at once, with nothing animating, under reduced motion too)
   */
  failed?: MessageFailed | false | undefined;
  /**
   * The person sent it and the app has not heard back yet. Only a send that takes longer than a
   * second shows it: a small clock fades in beside the message, or after the time on a post or
   * reply, taking no room, so a quick send never flashes and confirming it moves nothing. Screen
   * readers hear "Sending" once, after that second, and as the message's description while it
   * lasts. `failed` takes its place.
   * @claim "a small clock fades in beside the message" registry/ouro/components/ouro/message/message.test.tsx verify:testExists(registry/ouro/components/ouro/message/message.test.tsx::Message pending > shows a %s %s message's clock %s its bubble after a second, taking no room)
   * @claim "or after the time on a post or" registry/ouro/components/ouro/message/message.test.tsx verify:testExists(registry/ouro/components/ouro/message/message.test.tsx::Message pending > puts a pending %s's clock after its time, on the same line, taking no room)
   * @claim "taking no room" registry/ouro/components/ouro/message/message.test.tsx verify:testExists(registry/ouro/components/ouro/message/message.test.tsx::Message pending > puts a continued reply's clock in its gutter, clear of a long first line)
   * @claim "Only a send that takes longer" registry/ouro/components/ouro/message/message.test.tsx verify:testExists(registry/ouro/components/ouro/message/message.test.tsx::Message pending > still waits its second inside OuroProvider's reduced motion, which ends every transition)
   * @claim "once, after that second" registry/ouro/components/ouro/message/message.test.tsx verify:testExists(registry/ouro/components/ouro/message/message.test.tsx::Message pending > announcements > says Sending once a second has passed, once for every message pending together)
   * @claim "once, after that second" registry/ouro/components/ouro/message/message.test.tsx verify:testExists(registry/ouro/components/ouro/message/message.test.tsx::Message pending > announcements > says nothing for a send confirmed within the second)
   * @claim "`failed` takes its place" registry/ouro/components/ouro/message/message.test.tsx verify:testExists(registry/ouro/components/ouro/message/message.test.tsx::Message pending > describes a pending message as Sending once it shows, gives way to failed, and drops the description once confirmed)
   */
  pending?: boolean | undefined;
  /**
   * When the pending send started, as `Date.now()` gave it. A `MessageList` draws a long
   * conversation's messages again as the reader scrolls; with this, a pending message drawn again
   * after its second shows its clock at once and says nothing again.
   * @claim "with this, a pending message drawn again" registry/ouro/components/ouro/message/message.test.tsx verify:testExists(registry/ouro/components/ouro/message/message.test.tsx::Message pending > announcements > shows the clock at once and says nothing for a message drawn again after its second)
   */
  pendingSince?: number | undefined;
  /** What screen readers hear for a `pending` message, for other languages. @default "Sending" */
  pendingLabel?: string | undefined;
  /** What the marker under a `failed` message says, for other languages. @default "Not sent" */
  failedLabel?: string | undefined;
  /**
   * What screen readers hear once a `pending` message is confirmed, for other languages. The sender hears Sent
   * when the send is confirmed, or the failed label when it fails, and these words are not the message's own.
   * @default "Sent"
   * @claim "The sender hears Sent when the send is confirmed" registry/ouro/components/ouro/message/message.test.tsx verify:testExists(registry/ouro/components/ouro/message/message.test.tsx::Message pending > announcements > says Sent once when a pending send is confirmed, quick or slow, and never for a message that was not pending)
   */
  sentLabel?: string | undefined;
  /** The name of a `failed` message's retry button, for other languages. @default "Retry" */
  retryLabel?: string | undefined;
  /** The name of a `failed` message's delete button, for other languages. @default "Delete" */
  deleteLabel?: string | undefined;
  /** Layout only: margins (`mt-4`). Appearance classes warn in development; the colors follow `role`. */
  className?: string | undefined;
  ref?: Ref<HTMLElement> | undefined;

  /** Not a prop. Who wrote it is `role`: `<Message role="user" name="Ana">`. */
  from?: { 'Use <Message role="user" name="Ana">': never };
  /** Not a prop. The author is `name`: `<Message role="user" name="Ana">`. */
  sender?: { 'Use <Message role="user" name="Ana">': never };
  /** Not a prop. The author is `name`: `<Message role="user" name="Ana">`. */
  author?: { 'Use <Message role="user" name="Ana">': never };
  /** Not a prop. The message is the children: `<Message role="user" name="Ana">Hi</Message>`. */
  content?: { 'Use <Message role="user" name="Ana">Hi</Message>': never };
  /** Not a prop. The user's own messages are `role="user"`: `<Message role="user" variant="chat">`. */
  own?: { 'Use <Message role="user" variant="chat">': never };
  /** Not a prop. The time is `time`, formatted: `<Message time="9:41 AM" dateTime={iso}>`. */
  timestamp?: { 'Use <Message time="9:41 AM" dateTime={iso}>': never };
  /** Not a prop. The message this one replies to is `quote`: `<Message quote={{ author: "Ana", excerpt: "Lunch?" }}>`. */
  replyTo?: { 'Use <Message quote={{ author: "Ana", excerpt: "Lunch?" }}>': never };
  /** Not a prop. A message that did not send is `failed`: `<Message role="user" failed={{ onRetry: retry }}>`. */
  error?: { 'Use <Message role="user" failed={{ onRetry: retry }}>': never };
  /** Not a prop. A message that did not send is `failed`: `<Message role="user" failed={{ onRetry: retry }}>`. */
  status?: { 'Use <Message role="user" failed={{ onRetry: retry }}>': never };
  /** Not a prop. Retry is part of `failed`: `<Message role="user" failed={{ onRetry: retry }}>`. */
  onRetry?: { 'Use <Message role="user" failed={{ onRetry: retry }}>': never };
}

/** What the person can do about a message of their own that did not send: `Message`'s `failed`. */
export interface MessageFailed {
  /**
   * Sends the message again. Required, so a message that did not send always offers another try.
   * @claim "Required, so a message that" registry/ouro/components/ouro/message/message.test-d.ts verify:fileLine(registry/ouro/components/ouro/message/message.test-d.ts, /failed:\s\{\sonDelete:\s\(\)\s=>\svoid\s\}\s\}>\(\)\.not\.toExtend<MessageProps>/)
   */
  onRetry: () => void;
  /** Deletes the message that did not send. Leave it out to offer Retry alone. */
  onDelete?: (() => void) | undefined;
}

/** A Message whose avatar shows the author's presence, and the words it says. */
export interface MessagePresenceProps {
  /**
   * The author's presence, as Avatar's dot on the avatar's lower end corner: available,
   * busy, away, do not disturb, offline or out of office, each in its own shape and tone. It
   * shows wherever the avatar does, so not on a `continued` message or the user's own `chat`
   * messages. With an `Avatar` element as `avatar`, pass `presence` to that Avatar instead.
   * @claim "as Avatar's dot on the avatar's" registry/ouro/components/ouro/message/message.test.tsx verify:testExists(registry/ouro/components/ouro/message/message.test.tsx::Message presence > shows the author's presence on the avatar in every variant, and says it)
   * @claim "It shows wherever the avatar does" registry/ouro/components/ouro/message/message.test.tsx verify:testExists(registry/ouro/components/ouro/message/message.test.tsx::Message presence > shows no dot where there is no avatar)
   */
  presence: AvatarPresence | (string & { 'dnd is "do-not-disturb"; ooo is "out-of-office"': never });
  /**
   * What the dot says, such as "Busy" or "In a meeting". Screen readers hear it on the avatar,
   * as Avatar reads a presence beside a written name. Required with `presence`, so no dot is
   * silent.
   * @claim "Screen readers hear it on the" registry/ouro/components/ouro/message/message.test.tsx verify:testExists(registry/ouro/components/ouro/message/message.test.tsx::Message presence > shows the author's presence on the avatar in every variant, and says it)
   * @claim "Required with `presence`, so no dot" registry/ouro/components/ouro/message/message.test-d.ts verify:fileLine(registry/ouro/components/ouro/message/message.test-d.ts, /presence:\s"busy"\s\}>\(\)\.not\.toExtend<MessageProps>/)
   */
  presenceLabel: string;
}

/** A Message without a presence dot. */
export interface MessageNoPresenceProps {
  /** Leave it out for no dot; pass it with `presenceLabel` to show one. */
  presence?: undefined;
  /** Read only with `presence`. */
  presenceLabel?: string | undefined;
}

/**
 * Props for {@link Message}: its own props, `presence` with `presenceLabel` or neither, and the
 * `<article>` attributes it passes through.
 */
export type MessageProps = Omit<HTMLAttributes<HTMLElement>, keyof MessageOwnProps | "content" | "presence" | "presenceLabel"> &
  MessageOwnProps &
  (MessagePresenceProps | MessageNoPresenceProps);

const roles = ["user", "assistant", "system"] as const;

const variants = ["default", "chat", "post", "reply"] as const;

const placements = ["corner", "beside"] as const;

const bubbles = {
  user: "rounded-ouro-2xl [--ouro-jr:var(--ouro-message-joined-radius,var(--radius-ouro-xl))] [--ouro-fr:var(--radius-ouro-2xl)] [--ouro-fi:0.5rem] group-data-continued/message:rounded-se-(--ouro-jr) [[data-ouro-message-list-run-next]_&]:rounded-ee-(--ouro-jr) group-has-[+[data-continued]]/message:rounded-ee-(--ouro-jr) bg-primary px-3.5 pt-2 pb-2 text-primary-foreground",
  assistant: "rounded-ouro-2xl [--ouro-jr:var(--ouro-message-joined-radius,var(--radius-ouro-xl))] [--ouro-fr:var(--radius-ouro-2xl)] [--ouro-fi:0.5rem] group-data-continued/message:rounded-ss-(--ouro-jr) [[data-ouro-message-list-run-next]_&]:rounded-es-(--ouro-jr) group-has-[+[data-continued]]/message:rounded-es-(--ouro-jr) bg-muted px-3.5 py-2 text-foreground",
  system: "bg-transparent text-center text-muted-foreground",
} as const;

// A raised surface: the theme's card with its hairline and small shadow, for a chat's bubbles.
const raised = "bg-card text-card-foreground ring-1 ring-border/60 shadow-(--shadow-sm)";

// The user's filled bubble is drawn as a primary button is (`--ouro-bubble-user`, else `--ouro-action`, else the primary color), and inside it
// the theme's colors follow the fill, so a link, a mention, a quote, a card, a code block or a button in it stays
// readable: the primary color, the foreground, the muted text, a primary button and the focus ring read as the
// bubble's text color; the card, muted and accent surfaces as the fill, the accent a shade lighter for a hover; and a
// primary button's hover and press as shades of its text color. The message sets the fill and its text color
// (bubbleColors), because the bubble re-points the colors for what is inside it (filledColors). These are inline
// custom properties, not classes, so they add nothing to an app's stylesheet.
const bubbleColors = {
  "--ouro-bubble": "var(--ouro-bubble-user,var(--ouro-action,var(--primary)))",
  "--ouro-bubble-ink": "var(--ouro-bubble-user-foreground,var(--ouro-action-foreground,var(--primary-foreground)))",
} as CSSProperties;
const filledColors = {
  "--primary": "var(--ouro-bubble-ink)",
  "--primary-foreground": "var(--ouro-bubble)",
  "--foreground": "var(--ouro-bubble-ink)",
  "--muted-foreground": "var(--ouro-bubble-ink)",
  "--muted": "var(--ouro-bubble)",
  "--card": "var(--ouro-bubble)",
  "--card-foreground": "var(--ouro-bubble-ink)",
  "--accent": "color-mix(in oklab,var(--ouro-bubble-ink) 12%,var(--ouro-bubble))",
  "--ring": "var(--ouro-bubble-ink)",
  "--ouro-action": "var(--ouro-bubble-ink)",
  "--ouro-action-foreground": "var(--ouro-bubble)",
  "--ouro-action-hover": "color-mix(in oklab,var(--ouro-bubble-ink) 88%,var(--ouro-bubble))",
  "--ouro-action-active": "color-mix(in oklab,var(--ouro-bubble-ink) 76%,var(--ouro-bubble))",
} as CSSProperties;
// Selected text inverts, so it shows on the fill; a link, in the text's own color there, is underlined.
const filledInk = "bg-(--ouro-bubble) text-(--ouro-bubble-ink) selection:bg-(--ouro-bubble-ink) selection:text-(--ouro-bubble) [&_a]:underline";
// Others' bubble reads `--ouro-bubble-other` and `--ouro-bubble-other-foreground` before the muted surface, the
// same shape as the user's own (bubbleColors above): the message resolves the fill and its ink, the bubble is
// filled and colored from them directly, and the primary, success and muted text colors take a little of the
// resolved ink, so a link, a mention, a success mark or a table's header keeps 4.5:1 on whatever fill the theme
// sets, flat, with no shadow, like the user's own. The message mixes them (mutedColors) and the bubble reads
// them (mutedInk): a variable can't be mixed from itself.
const mutedColors = {
  "--ouro-bubble-other-fill": "var(--ouro-bubble-other,var(--muted))",
  "--ouro-bubble-other-ink": "var(--ouro-bubble-other-foreground,var(--foreground))",
  "--ouro-bubble-link": "color-mix(in oklab,var(--primary) 85%,var(--ouro-bubble-other-ink))",
  "--ouro-bubble-success": "color-mix(in oklab,var(--success) 85%,var(--ouro-bubble-other-ink))",
  "--ouro-bubble-quiet": "color-mix(in oklab,var(--muted-foreground) 85%,var(--ouro-bubble-other-ink))",
} as CSSProperties;
const mutedInk = {
  "--muted": "var(--ouro-bubble-other-fill)",
  "--foreground": "var(--ouro-bubble-other-ink)",
  "--primary": "var(--ouro-bubble-link)",
  "--success": "var(--ouro-bubble-success)",
  "--muted-foreground": "var(--ouro-bubble-quiet)",
} as CSSProperties;

const layouts = {
  filled: {
    // A transparent border, which forced colours draw, so a bubble that is only a fill keeps its edge there.
    user: `rounded-ouro-2xl [--ouro-jr:var(--ouro-message-joined-radius,var(--radius-ouro-xl))] [--ouro-fr:var(--radius-ouro-2xl)] [--ouro-fi:9px] group-data-continued/message:rounded-se-(--ouro-jr) [[data-ouro-message-list-run-next]_&]:rounded-ee-(--ouro-jr) group-has-[+[data-continued]]/message:rounded-ee-(--ouro-jr) border border-solid border-transparent px-3 pt-2 pb-2 ${filledInk}`,
    assistant:
      "rounded-ouro-2xl [--ouro-jr:var(--ouro-message-joined-radius,var(--radius-ouro-xl))] [--ouro-fr:var(--radius-ouro-2xl)] [--ouro-fi:9px] group-data-continued/message:rounded-ss-(--ouro-jr) [[data-ouro-message-list-run-next]_&]:rounded-es-(--ouro-jr) group-has-[+[data-continued]]/message:rounded-es-(--ouro-jr) border border-solid border-transparent bg-(--ouro-bubble-other-fill) px-3 py-2 text-(--ouro-bubble-other-ink)",
  },
  raised: {
    user: "rounded-ouro-lg [--ouro-fr:var(--radius-ouro-lg)] [--ouro-fi:0.5rem] bg-[color-mix(in_oklab,var(--primary)_12%,var(--card))] px-3 pt-2 pb-2 text-foreground",
    assistant: `rounded-ouro-lg [--ouro-fr:var(--radius-ouro-lg)] [--ouro-fi:0.5rem] px-3 py-2 ${raised}`,
  },
} as const;

const bubbleLooks = ["filled", "raised"] as const;

// A post's line after its name line: one each, in order after the name line (and an unanswered post's Reply beside it).
const postRow = "order-3 basis-full";

// A post or a reply: the avatar's column (w-ouro-8) and the gap after it (gap-3), where the text starts.
const peopleGutter = "2.75rem";

// Between two posts, a hairline from the text's start to the end, midway between them as MessageList spaces them (16px,
// and each post's 4px): a border, which forced colours keep. In a MessageList each post sits in a slot of its own (a
// box it does not draw), so there the posts are each in the slot after the other's. MessageList marks each slot that
// follows a post, so the list rules need no `:has()` and no sibling combinator. Measured in WebKit, prepending 40 posts
// to 300 drawn cost 225 ms of style with `:has()` and 248 ms with a sibling combinator, and 4 ms with this.
const postHairline =
  "[[data-variant=post]+[data-variant=post]_&]:before:absolute [[data-variant=post]+[data-variant=post]_&]:before:inset-x-0 " +
  "[[data-variant=post]+[data-variant=post]_&]:before:-top-3 [[data-variant=post]+[data-variant=post]_&]:before:border-0 " +
  "[[data-variant=post]+[data-variant=post]_&]:before:border-t [[data-variant=post]+[data-variant=post]_&]:before:border-solid " +
  "[[data-variant=post]+[data-variant=post]_&]:before:border-border [[data-variant=post]+[data-variant=post]_&]:before:content-[''] " +
  "[[data-ouro-message-list-after-post]>[data-variant=post]_&]:before:absolute " +
  "[[data-ouro-message-list-after-post]>[data-variant=post]_&]:before:inset-x-0 " +
  "[[data-ouro-message-list-after-post]>[data-variant=post]_&]:before:-top-3 " +
  // Stryker disable next-line StringLiteral: the tests' page loads Tailwind's base styles, which give ::before a solid border of no width; an app without them needs this.
  "[[data-ouro-message-list-after-post]>[data-variant=post]_&]:before:border-0 " +
  "[[data-ouro-message-list-after-post]>[data-variant=post]_&]:before:border-t " +
  // Stryker disable next-line StringLiteral: the tests' page loads Tailwind's base styles, which give ::before a solid border of no width; an app without them needs this.
  "[[data-ouro-message-list-after-post]>[data-variant=post]_&]:before:border-solid " +
  "[[data-ouro-message-list-after-post]>[data-variant=post]_&]:before:border-border " +
  // Stryker disable next-line StringLiteral: Tailwind gives every before: utility content: var(--tw-content), so the line draws without this class too.
  "[[data-ouro-message-list-after-post]>[data-variant=post]_&]:before:content-['']";

// The action bar's code, loaded once, the first time a message with actions or a menu mounts: a
// page whose messages have no bar never loads it, nor the Tooltip and Menu it uses.
let barModule: Promise<typeof MessageActionBar> | undefined;
const loadBar = () => (barModule ??= import("@/registry/ouro/components/ouro/message/message-parts").then((module) => module.MessageActionBar));

// The ring a message shows when it has keyboard focus, as one in a MessageList takes: the focus
// outline Ouro's controls have, with rounded corners, since the message's own box is bare.
const focusRing = "rounded-ouro-lg outline-ring outline-offset-2 focus-visible:outline-2 focus-visible:outline-solid";

/**
 * The author's name as text, or the app's content for it shown while screen readers hear the text.
 * While the name loads (`loading` is its label), the label laid out invisibly gives the line its
 * height and baseline and the placeholder its width, and a Skeleton line shows over it.
 */
function authorName(name: string, content: ReactNode, loading: string | undefined): ReactNode {
  if (loading !== undefined) {
    return (
      <span data-ouro-message-name-loading="" className="relative inline-block max-w-full">
        <span aria-hidden="true" className="invisible">
          {loading}
        </span>
        <span aria-hidden="true" className="absolute inset-0 flex items-center">
          <Skeleton shape="text" />
        </span>
        <span className="sr-only">{loading}</span>
      </span>
    );
  }
  if (content === undefined) return name;
  return (
    <>
      <span aria-hidden="true">{content}</span>
      <span className="sr-only">{name}</span>
    </>
  );
}

/**
 * One message in a chat: who wrote it, their avatar and what they wrote, with any
 * attachments under it. `role` places and colors it: the user's own messages at the end
 * in the primary color, the assistant's at the start, the app's `system` notes centered.
 * `streaming` marks a reply still being written. `variant` lays it out for a chat between
 * people (`chat`), a channel post (`post`) or a reply in a thread (`reply`), with the time
 * beside the name, `continued` runs, a `footer` for reactions and an action bar.
 *
 * Use it inside `MessageList`, which keeps the newest message in view and announces new
 * ones. Use `Alert` instead for a notice that is not part of a conversation, and
 * `toast()` for a passing confirmation.
 *
 * @group Chat
 * @see https://ui.ouroboros.bot/docs/message
 *
 * @example
 * <Message role="user" name={user.name} avatar={user.photoUrl}>How long do I rest the dough?</Message>
 * <Message role="assistant" name="Ouro" streaming={!reply.done}>{reply.text}</Message>
 * <Message variant="chat" role="assistant" name="Grace" time="9:41 AM" footer={<ReactionBar reactions={reactions} />} actions={[{ key: "reply", label: "Reply", icon: <ReplyIcon />, onClick: reply }]}>Lunch?</Message>
 * <Message variant="post" role="assistant" name="Grace" time="9:41 AM" subject="Launch plan" thread={<ThreadSummary count={2} onOpen={open} />}>Notes inside.</Message>
 */
export function Message(props: MessageProps): JSX.Element {
  const {
    role: roleProp,
    name: nameProp,
    nameLoadingLabel = "Name loading",
    nameContent,
    nameTag,
    variant: variantProp = "default",
    bubble: bubbleProp,
    avatar,
    presence,
    presenceLabel,
    time,
    dateTime,
    continued: continuedProp = false,
    subject,
    children,
    context,
    quote,
    attachments,
    footer,
    statusMark,
    thread,
    actions,
    actionsPlacement,
    menu,
    quickReactions,
    quickReactionsLabel = "Reactions",
    actionsLabel = "Message actions",
    actionsMenuLabel,
    menuLabel = "More actions",
    streaming = false,
    streamingLabel = "Writing",
    failed = false,
    pending = false,
    pendingLabel = "Sending",
    pendingSince,
    failedLabel = "Not sent",
    sentLabel = "Sent",
    retryLabel = "Retry",
    deleteLabel = "Delete",
    className,
    // Guard props (hint types), dropped here so they never reach the DOM.
    from,
    sender,
    author,
    content,
    own,
    timestamp,
    replyTo,
    error,
    status,
    onRetry,
    ...rest
  } = props;
  const name = nameProp ?? "";
  const nameLoading = nameProp === null;
  // A role that is not one of Ouro UI's (a type error) warns and renders as the assistant's.
  const role = (roles as readonly string[]).includes(roleProp) ? (roleProp as MessageRole) : "assistant";
  const variant = (variants as readonly string[]).includes(variantProp) ? (variantProp as MessageVariant) : "default";
  const bubble = (bubbleLooks as readonly string[]).includes(bubbleProp as string) ? (bubbleProp as MessageBubble) : "filled";
  // A chat's message is a bubble; a reply is one when it is given a bubble, laid out as a chat's.
  const bubbled = variant === "chat" || (variant === "reply" && bubbleProp !== undefined);
  const shape = bubbled ? "chat" : variant;
  // Stryker disable next-line StringLiteral: only "beside" is read; any other placement is the corner.
  const placement = (placements as readonly unknown[]).includes(actionsPlacement) ? (actionsPlacement as MessageActionsPlacement) : variant === "reply" ? "beside" : "corner";
  useAppearanceClassNameCheck(
    "Message",
    className,
    process.env.NODE_ENV !== "production"
      ? (token: string) => `remove "${token}"; the bubble color follows role`
      : /* istanbul ignore next @preserve -- production only */ "",
  );
  useDevWarnings(
    "Message",
    process.env.NODE_ENV !== "production"
      ? () => [
          nameProp === undefined && ["name is missing, so screen readers cannot say who wrote it", `<Message role="${role}" name="Ouro">`],
          role !== roleProp && [`role="${String(roleProp)}" is not a role; use "user", "assistant" or "system"`, '<Message role="assistant" name="Ouro">'],
          variant !== variantProp && [`variant="${String(variantProp)}" is not a variant; use "default", "chat", "post" or "reply"`, '<Message variant="chat" role="assistant" name="Grace">'],
          bubbleProp !== undefined && bubble !== bubbleProp && [`bubble="${String(bubbleProp)}" is not a bubble; use "filled" or "raised"`, '<Message variant="chat" bubble="raised">'],
          actionsPlacement !== undefined &&
            placement !== actionsPlacement && [`actionsPlacement="${String(actionsPlacement)}" is not a placement; use "corner" or "beside"`, '<Message variant="chat" actionsPlacement="beside">'],
          from !== undefined && ["from is not a prop", '<Message role="user" name="Ana">'],
          (sender !== undefined || author !== undefined) && [`${sender !== undefined ? "sender" : "author"} is not a prop`, '<Message role="user" name="Ana">'],
          content !== undefined && ["content is not a prop; the message is the children", '<Message role="user" name="Ana">Hi</Message>'],
          own !== undefined && ["own is not a prop; the user's own messages are role=\"user\"", '<Message role="user" variant="chat">'],
          timestamp !== undefined && ["timestamp is not a prop", '<Message time="9:41 AM" dateTime={iso}>'],
          replyTo !== undefined && ["replyTo is not a prop; the message this one replies to is quote", '<Message quote={{ author: "Ana", excerpt: "Lunch?" }}>'],
          (error !== undefined || status !== undefined || onRetry !== undefined) && [
            `${error !== undefined ? "error" : status !== undefined ? "status" : "onRetry"} is not a prop; a message that did not send is failed`,
            '<Message role="user" failed={{ onRetry: retry }}>',
          ],
          variant === "post" && continuedProp && ["a post is never continued: every post shows its author", '<Message variant="reply" continued>'],
          variant !== "post" && subject !== undefined && ["subject shows only on a post", '<Message variant="post" subject="Launch plan">'],
          statusMark !== undefined &&
            (role !== "user" || (variant !== "default" && !bubbled)) && [
              'statusMark shows only on role="user" with a bubble, where it has a corner to seat against: variant="default", or variant="chat" or a bubbled reply',
              '<Message role="user" statusMark={<Text size="xs" tone="secondary">Seen</Text>}>',
            ],
          presence !== undefined &&
            isValidElement(avatar) && [
              "presence does not reach an Avatar element passed as avatar; give that Avatar the presence",
              `avatar={<Avatar name=${nameLoading ? "{null}" : `"${name}"`} alt="" size="sm" presence="${presence}" presenceLabel="${wordsFor(presence, presenceLabel)}" />}`,
            ],
          presence !== undefined &&
            !presenceLabel && [
              "presenceLabel is missing, so screen readers hear no presence",
              `<Message presence="${presence}" presenceLabel="${wordsFor(presence, presenceLabel)}">`,
            ],
        ]
      : /* istanbul ignore next @preserve -- production only */ undefined,
  );
  // Tapped on a touch screen: the action bar shows until a press lands outside the message.
  const [active, setActive] = useState(false);
  // The message's element, kept in a ref rather than state: setting state as the element mounts would draw every
  // message of a list again, in a second commit, as the list opens.
  const element = useRef<HTMLElement | null>(null);
  useEffect(() => {
    // Stryker disable next-line ConditionalExpression: listening while inactive would only set it inactive again.
    if (!active) return;
    const away = (event: Event) => {
      if (!element.current!.contains(event.target as Node)) setActive(false);
    };
    document.addEventListener("pointerdown", away);
    return () => document.removeEventListener("pointerdown", away);
  }, [active]);
  const hasBar =
    (actions !== undefined && actions.length > 0) || (menu !== undefined && menu.length > 0) || (quickReactions !== undefined && quickReactions.length > 0);
  // In a MessageList, the list draws one bar for all its messages: this message gives it what to show, and where.
  const layer = useContext(RowLayerContext);
  const layered = layer !== null && hasBar;
  const tap = (event: PointerEvent<HTMLElement>) => {
    rest.onPointerUp?.(event);
    // A tap on a control is the control's; the message itself takes a tabindex in a MessageList, and a tap on it is the message's.
    const control = (event.target as Element).closest("a, button, input, textarea, select, [tabindex]");
    if (hasBar && !layered && event.pointerType === "touch" && (control === null || control === event.currentTarget)) setActive(true);
  };
  const ref = (node: HTMLElement | null) => {
    element.current = node;
    const forwarded = props.ref;
    if (typeof forwarded === "function") forwarded(node);
    else if (forwarded) forwarded.current = node;
  };

  // Not sent: a line under the bubble that says so, with Retry and Delete, and the message's description.
  const failedId = useId();
  const isFailed = failed !== false;
  // Sending: a marker that shows once the send has taken a while, and the same once for screen readers.
  const pendingId = useId();
  const nameId = useId();
  const timeId = useId();
  const isPending = pending && !isFailed && role !== "system";
  // The second is timed here, not by a CSS delay, so an app's own reduced motion (OuroProvider's, which ends every
  // transition at once) never shows a quick send's clock.
  const [shown, setShown] = useState(false);
  useEffect(() => {
    if (!isPending) return;
    let quiet: (() => void) | undefined;
    const show = () => {
      setShown(true);
      quiet = announce(pendingLabel);
    };
    // A message drawn again after its second was already heard: its clock shows at once, and nothing is said.
    const waited = pendingSince === undefined ? 0 : Date.now() - pendingSince;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (waited >= PENDING_DELAY) setShown(true);
    const timer = waited >= PENDING_DELAY ? undefined : setTimeout(show, PENDING_DELAY - waited);
    return () => {
      clearTimeout(timer);
      quiet?.();
      setShown(false);
    };
  }, [isPending, pendingSince, pendingLabel]);
  // The sender hears the outcome too, never the message's own words: Sent once a pending send is confirmed, and the
  // failed label once a send fails.
  const outcome = isFailed ? "failed" : isPending ? "pending" : "idle";
  const lastOutcome = useRef(outcome);
  useEffect(() => {
    const before = lastOutcome.current;
    lastOutcome.current = outcome;
    if (before === outcome || outcome === "pending") return;
    if (outcome === "idle" && before !== "pending") return;
    return announce(outcome === "failed" ? failedLabel : sentLabel);
  }, [outcome, failedLabel, sentLabel]);
  const showing = isPending && shown;
  const marker = isFailed ? failedId : showing ? pendingId : undefined;
  // Stryker disable next-line StringLiteral,ConditionalExpression: `named` is read only behind `rest["aria-labelledby"] ??`, so an app's own aria-labelledby wins whatever the first test reads.
  const named = rest["aria-labelledby"] === undefined && !rest["aria-label"];
  const labelledBy = rest["aria-labelledby"] ?? (named ? `${nameId} ${timeId}` : undefined);
  // The name span of a bubbled message holds its time already.
  const labelledByName = rest["aria-labelledby"] ?? (named ? nameId : undefined);
  const describedBy = marker ? [rest["aria-describedby"], marker].filter(Boolean).join(" ") : rest["aria-describedby"];
  // Retry pressed: when the app clears failed, the marker goes with the focused button, so focus
  // goes to the message rather than the page.
  // Stryker disable next-line BooleanLiteral: the first run of the effect below, at mount, finds no element yet and clears it either way.
  const retried = useRef(false);
  useLayoutEffect(() => {
    if (isFailed || !retried.current) return;
    retried.current = false;
    const article = element.current!;
    if (document.activeElement !== document.body) return;
    if (!article.hasAttribute("tabindex")) article.setAttribute("tabindex", "-1");
    // Stryker disable next-line ObjectLiteral,BooleanLiteral: it keeps the page where the reader pressed Retry; whether a browser scrolls a partly shown message into view on focus differs by engine, so no test can tell.
    article.focus({ preventScroll: true });
  }, [isFailed]);
  // Beside a bubble, out of the flow, or after a post's or reply's time on its line: it takes no room, so going moves nothing.
  const sending = (place: string) =>
    showing && (
      <span data-ouro-message-pending="" className={cn(pendingClass, place)}>
        <PendingIcon aria-hidden="true" className="size-ouro-3_5 shrink-0" />
        <span id={pendingId} className="sr-only">
          {pendingLabel}
        </span>
      </span>
    );
  const notSent = failed !== false && (
    <div data-ouro-message-failed="" className={cn("flex max-w-full flex-wrap items-center gap-x-1 text-xs", variant === "post" && postRow)}>
      <span id={failedId} className="inline-flex items-center gap-1 font-medium text-destructive">
        <NotSentIcon aria-hidden="true" className="size-ouro-3_5 shrink-0" />
        {failedLabel}
      </span>
      <Button data-ouro-control="message" data-ouro-part="retry" tone="primary" variant="plain" size="sm" onClick={() => ((retried.current = true), failed.onRetry())}>
        {retryLabel}
      </Button>
      {failed.onDelete && (
        <Button data-ouro-control="message" data-ouro-part="delete" tone="secondary" variant="plain" size="sm" onClick={failed.onDelete}>
          {deleteLabel}
        </Button>
      )}
    </div>
  );

  const empty = children === undefined || children === null || children === false || children === "";
  const body = streaming && empty ? typing(streamingLabel) : children;
  const quoted = quote && quoteBox(quote);
  // A context that is nothing draws no line and leaves no gap above the quote.
  const hasContext = context !== undefined && context !== null && typeof context !== "boolean" && context !== "";
  // Muted as the quote's excerpt is, except on a default message's own primary bubble: that bubble does not re-point
  // the muted token, and a muted line on the primary fill fails 4.5:1, so it takes the bubble's text color.
  const primaryBubble = role === "user" && variant === "default";
  const contextLine = hasContext ? (
    <div
      data-ouro-message-context=""
      className={cn("m-0 mb-1 text-xs", !primaryBubble && "text-[color-mix(in_oklab,var(--muted-foreground)_80%,var(--foreground))]")}
    >
      {context}
    </div>
  ) : null;
  // The bar's code, with Tooltip, loads in the browser for a message that has a bar.
  const [Bar, setBar] = useState<typeof MessageActionBar | undefined>(undefined);
  useEffect(() => {
    // Stryker disable next-line ConditionalExpression,LogicalOperator: `Bar` only reaches the render when `!layered` (the ternary a few lines down shows it only there), so loading it when `layered` instead (as `||` would, and as a forced-true condition does) can never be seen in what the message draws; the bar's code for a message without one renders nothing either way; site/e2e/catalog.spec.ts holds a page without bars to never loading it.
    if (hasBar && !layered) void loadBar().then((Loaded) => setBar(() => Loaded));
  }, [hasBar, layered]);
  // The box the bar sits in: the bubble's own, or a post's body. In a MessageList, the list puts its one bar there.
  const slot = useRef<HTMLDivElement | null>(null);
  // Beside the bubble: a chat or reply message's own layout, with the room before the bubble that the
  // avatar's column takes when it is at the start (w-ouro-8, and the row's gap-2 in a chat or gap-3 in a reply).
  const beside =
    placement === "beside" && (variant === "chat" || variant === "reply") && role !== "system"
      ? avatar === false || (shape === "chat" && role === "user")
        ? "0px"
        : shape === "reply"
          ? peopleGutter
          : "2.5rem"
      : undefined;
  const start = shape === "chat" && role === "user";
  const bar = layered ? null : hasBar && Bar ? (
    <Bar
      actions={actions ?? []}
      menu={menu}
      reactions={quickReactions}
      reactionsLabel={quickReactionsLabel}
      label={actionsLabel}
      menuLabel={menuLabel}
      start={start}
      post={variant === "post"}
      beside={beside}
    />
  ) : null;
  // Room for a bar around the bubble: the message's own bar, or the list's, which goes in while it is on this message.
  const room = layered || bar !== null;
  // What the list's bar and menu show for this message, given again on every render, so they show what it shows now.
  // The element the list knows this message by, so the cleanup below takes out the one it set. A mounted message keeps
  // one element: both of its branches draw an article in the same place, so React keeps the node when it switches.
  const registered = useRef<HTMLElement | null>(null);
  useLayoutEffect(() => {
    if (!layered) return;
    const article = element.current!;
    registered.current = article;
    const data: MessageBarData = {
      actions: actions ?? [],
      menu,
      reactions: quickReactions,
      label: actionsLabel,
      menuLabel,
      menuName: actionsMenuLabel ?? (name ? `Message actions for ${name}` : "Message actions"),
      reactionsLabel: quickReactionsLabel,
      start,
      post: variant === "post",
      beside,
      slot: () => slot.current,
    };
    layer.set(article, data);
  });
  useLayoutEffect(() => {
    if (!layered) return;
    return () => {
      layer.delete(registered.current!);
      registered.current = null;
    };
  }, [layer, layered]);

  if (variant === "default" || role === "system") {
    const continued = continuedProp && role !== "system";
    const marked = role === "user" && statusMark !== undefined && statusMark !== null && statusMark !== false;
    const bubble = (
      // Stryker disable next-line ConditionalExpression,EqualityOperator,LogicalOperator,StringLiteral: on a fine pointer the article is text-sm already; the touch tests hold the system note's smaller text.
      <div data-ouro-message-content="" className={cn("relative max-w-full leading-relaxed [overflow-wrap:anywhere]", bubbles[role], marked && "pb-6", role === "system" && "text-sm")}>
        {contextLine}
        {quoted}
        {body}
        {marked && (
          <div data-slot="message-status-mark" data-ouro-message-status-mark="" className="absolute end-1 bottom-1 text-xs leading-none">
            {statusMark}
          </div>
        )}
      </div>
    );
    return (
      <article
        {...rest}
        ref={ref}
        data-ouro="message"
        data-role={role}
        data-variant={variant === "default" ? undefined : variant}
        data-continued={continued ? "" : undefined}
        data-ouro-message-active={active ? "" : undefined}
        aria-busy={streaming || rest["aria-busy"]}
        aria-labelledby={labelledByName}
      aria-describedby={describedBy}
        onPointerUp={tap}
        className={cn(
          "group/message box-border flex w-full min-w-0 items-end gap-2 text-base pointer-fine:text-sm",
          focusRing,
          role === "user" && "flex-row-reverse",
          role === "system" && "justify-center",
          className,
        )}
      >
        {role !== "system" && avatar !== false && (continued ? <span aria-hidden="true" className="w-ouro-8 shrink-0" /> : avatarSlot(avatar, nameLoading ? null : name, presence, presenceLabel, "mb-0.5"))}
        <div
          className={cn(
            "relative flex max-w-[min(85%,42rem)] min-w-0 flex-col gap-1",
            role === "user" ? "items-end" : role === "system" ? "items-center" : "items-start",
          )}
        >
          <span id={nameId} data-ouro-message-author="" className={role === "assistant" && !continued ? "px-1 text-xs font-medium text-muted-foreground" : "sr-only"}>
            {authorName(name, nameContent, nameLoading ? nameLoadingLabel : undefined)}
            {nameTag && <span className="sr-only">, </span>}
            {nameTag && (
              <span data-ouro-message-name-tag="" className="ms-1.5 font-normal">
                {nameTag}
              </span>
            )}
            {time !== undefined && <span className="sr-only">, </span>}
            {time !== undefined && (
              <time id={timeId} dateTime={dateTime} className="ms-1.5 font-normal tabular-nums">
                {time}
              </time>
            )}
          </span>
          {room ? (
            <div ref={slot} className="relative flex max-w-full flex-col">
              {bubble}
              {bar}
            </div>
          ) : (
            bubble
          )}
          {attachments !== undefined && attachments !== null && (
            <div data-ouro-message-attachments="" className={cn("mt-1 flex max-w-full flex-wrap gap-2", role === "user" && "justify-end")}>
              {attachments}
            </div>
          )}
          {notSent}
          {sending(role === "user" ? "absolute end-full bottom-0 me-2" : "absolute start-full bottom-0 ms-2")}
          {extra("footer", role === "user", false, footer, true)}
          {extra("thread", role === "user", false, thread, true)}
        </div>
      </article>
    );
  }

  // chat, post and reply: the avatar's column at the start, then a line of name and time over the message.
  const mine = role === "user";
  const end = shape === "chat" && mine;
  const continued = continuedProp && variant !== "post";
  const post = variant === "post";
  // A post or a reply names its author in the text's size; a chat's bubbles carry a smaller line above them.
  const people = shape !== "chat";
  // In chat the user's own name is not shown (the side says whose it is), only the time.
  const nameShown = !continued && !end;
  const header = (
    <span data-ouro-message-header="" className={continued ? "sr-only" : cn("flex max-w-full min-w-0 items-baseline gap-2", people ? "text-sm" : "px-0.5 text-xs", post && "order-1")}>
      <span id={nameId} data-ouro-message-author="" className={nameShown ? "truncate font-semibold text-foreground" : "sr-only"}>
        {authorName(name, nameContent, nameLoading ? nameLoadingLabel : undefined)}
      </span>
      {nameTag && (
        <span data-ouro-message-name-tag="" className={nameShown ? cn("shrink-0 text-muted-foreground", people && "text-xs") : "sr-only"}>
          <span className="sr-only">, </span>
          {nameTag}
        </span>
      )}
      {time !== undefined && <span className="sr-only">, </span>}
      {time !== undefined && (
        <time id={timeId} dateTime={dateTime} className={cn("shrink-0 text-muted-foreground tabular-nums", people && "text-xs")}>
          {time}
        </time>
      )}
      {people && sending("self-center")}
    </span>
  );
  // A chat's bubble; a post's and a reply's text sits on the page, unboxed.
  const surface = shape === "chat" ? layouts[bubble][mine ? "user" : "assistant"] : undefined;
  // A filled bubble's colors, as inline custom properties: the message sets them, and the bubble re-points the theme's.
  const filled = shape === "chat" && bubble === "filled";
  const ownColors = filled ? (mine ? bubbleColors : mutedColors) : undefined;
  const surfaceColors = filled ? (mine ? filledColors : mutedInk) : undefined;
  // A bar beside the bubble measures the message's width (100cqw), so the message is a container. In a MessageList the
  // list makes it one only while its bar is on it.
  const containerStyle = hasBar && !layered && beside !== undefined ? { containerType: "inline-size" as const } : undefined;
  const articleStyle = { ...rest.style, ...ownColors, ...containerStyle };
  const titled = post && subject !== undefined && subject !== null;
  // A message of pictures or files alone draws no empty bubble above them.
  const worded = !empty || streaming || quote !== undefined || titled || hasContext;
  // Hidden rather than left out when empty: MessageList reads every message's text from it.
  const marked = end && statusMark !== undefined && statusMark !== null && statusMark !== false;
  const contentBox = (
    <div data-ouro-message-content="" hidden={!worded} style={surfaceColors} className={cn("relative box-border max-w-full min-w-0 leading-relaxed [overflow-wrap:anywhere]", surface, marked && "pb-6")}>
      {contextLine}
      {titled && (
        <p data-ouro-message-subject="" className="m-0 mb-0.5 font-[family-name:var(--font-heading,inherit)] text-base leading-snug font-semibold">
          {subject}
        </p>
      )}
      {quoted}
      {body}
      {marked && (
        <div data-slot="message-status-mark" data-ouro-message-status-mark="" className="absolute end-1 bottom-1 text-xs leading-none">
          {statusMark}
        </div>
      )}
    </div>
  );
  return (
    <article
      {...rest}
      ref={ref}
      data-ouro="message"
      data-role={role}
      data-variant={variant}
      data-bubble={bubbled ? bubble : undefined}
      data-continued={continued ? "" : undefined}
      data-ouro-message-active={active ? "" : undefined}
      aria-busy={streaming || rest["aria-busy"]}
      aria-labelledby={labelledBy}
      aria-describedby={describedBy}
      onPointerUp={tap}
      style={articleStyle}
      className={cn(
        "group/message box-border flex w-full min-w-0 items-start text-base pointer-fine:text-sm",
        people ? "gap-3" : "gap-2",
        // With MessageList's 16px between messages, 24px between one post's last line and the next one's name.
        post && "py-1",
        focusRing,
        end && "flex-row-reverse",
        className,
      )}
    >
      {!end && avatar !== false && (
        <span data-ouro-message-gutter="" className="flex w-ouro-8 shrink-0 justify-center">
          {continued ? (
            showing ? (
              // A continued reply's line holds its text, so its clock sits in the gutter, where its time shows on hover.
              <PendingIcon data-ouro-message-pending-gutter="" aria-hidden="true" className={cn(pendingClass, "mt-1.5 size-ouro-3_5")} />
            ) : (
              time !== undefined && (
              <time
                aria-hidden="true"
                dateTime={dateTime}
                // Centered wider than the gutter, so its first glyph would otherwise sit under the row's focus ring; ms-1.5 clears it.
                className="mt-2.5 ms-1.5 text-[0.625rem] leading-none whitespace-nowrap text-muted-foreground tabular-nums opacity-0 transition-opacity duration-(--ouro-duration-fast) ease-[ease] pointer-fine:group-hover/message:opacity-100 group-focus-within/message:opacity-100"
              >
                {time}
              </time>
              )
            )
          ) : (
            avatarSlot(avatar, nameLoading ? null : name, presence, presenceLabel)
          )}
        </span>
      )}
      <div
        ref={post ? slot : undefined}
        data-ouro-message-body=""
        className={cn(
          "relative flex min-w-0 gap-2",
          // A post's rows wrap in a row, so an unanswered post's Reply ends its name line and the rest take a line each.
          post ? "flex-row flex-wrap items-center gap-x-2 gap-y-1" : "flex-col",
          shape === "chat" ? "max-w-[min(85%,36rem)]" : "flex-1",
          !post && (end ? "items-end" : "items-start"),
          post && postHairline,
        )}
      >
        {header}
        {!post && !room && worded ? (
          contentBox
        ) : (
          <div
            ref={post ? undefined : slot}
            className={cn(
              "relative box-border flex max-w-full min-w-0 flex-col",
              end ? "items-end" : "items-start",
              post && postRow,
              // The bar beside the bubble is absolutely positioned level with its top, so a bubble shorter than the bar
              // (36px, 40px below the button's sm: breakpoint) would let it overflow past the row's own bottom edge,
              // eating into the gap below: reserve the bar's height so a short bubble's row is never shorter than it (#3617).
              !post && room && beside !== undefined && "min-h-10 sm:min-h-9",
            )}
          >
            {contentBox}
            {!post && bar}
          </div>
        )}
        {attachments !== undefined && attachments !== null && (
          <div data-ouro-message-attachments="" className={cn("flex w-full max-w-full min-w-0 flex-wrap gap-2", end && "justify-end", post && ["mt-1", postRow])}>
            {attachments}
          </div>
        )}
        {notSent}
        {shape === "chat" && sending(end ? "absolute end-full bottom-0 me-1.5" : "absolute start-full bottom-0 ms-1.5")}
        {extra("footer", end, post, footer)}
        {extra("thread", end, post, thread)}
        {post && bar}
      </div>
    </article>
  );
}

/**
 * The author's avatar: the Avatar element the app passed, or one drawn from the picture URL and
 * name, with the author's presence. A missing label still says the presence, as Avatar would.
 */
function avatarSlot(avatar: string | ReactElement | undefined, name: string | null, presence: string | undefined, presenceLabel: string | undefined, className?: string): JSX.Element {
  if (isValidElement(avatar)) return avatar;
  const dot = presence === undefined ? {} : { presence: presence as AvatarPresence, presenceLabel: presenceLabel || presence.replaceAll("-", " ") };
  return <Avatar name={name} src={avatar} alt="" size="sm" className={className} {...dot} />;
}

// The quote: a box on the muted surface with a hairline, as Composer's quote (composer.tsx).
const quoteClass =
  "m-0 mb-2 flex min-w-0 items-center gap-2 rounded-ouro-inner bg-muted p-1.5 ring-1 ring-border/60 forced-colors:border forced-colors:border-solid";
// The quote as a button: it highlights while hovered rather than scaling, as a wide row does, and
// with two lines of text it is taller than a touch target already.
const quoteButtonClass =
  "box-border w-full cursor-pointer border-0 text-start font-[inherit] text-inherit pointer-fine:hover:bg-accent " +
  "outline-ring outline-offset-2 focus-visible:outline-2 focus-visible:outline-solid";

/**
 * The message a message replies to: the bar, the avatar, the author and the excerpt. Screen
 * readers hear the label ("Quoting Ana") in place of the author's name, then the excerpt.
 */
function quoteBox(quote: MessageQuote): JSX.Element {
  const body = (
    <>
      <span aria-hidden="true" data-ouro-message-quote-bar="" className="w-ouro-1 shrink-0 self-stretch rounded-full bg-primary forced-colors:bg-[Highlight]" />
      {quote.avatar}
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="sr-only">{quote.label ?? `Quoting ${quote.author}`}: </span>
        <span aria-hidden="true" data-ouro-message-quote-author="" className="truncate text-xs font-semibold text-foreground">
          {quote.author}
        </span>
        <span data-ouro-message-quote-excerpt="" className="truncate text-sm text-[color-mix(in_oklab,var(--muted-foreground)_80%,var(--foreground))]">
          {quote.excerpt}
        </span>
      </span>
    </>
  );
  return quote.onActivate ? (
    <button type="button" data-ouro-control="message" data-ouro-part="quote" data-ouro-message-quote="" data-ouro-allow="nested-frame" data-ouro-allow-why="the quote bar is a 4px stroke, which cannot hold a concentric corner" onClick={quote.onActivate} className={cn(quoteClass, quoteButtonClass)}>
      {body}
    </button>
  ) : (
    <blockquote data-ouro-message-quote="" data-ouro-allow="nested-frame" data-ouro-allow-why="the quote bar is a 4px stroke, which cannot hold a concentric corner" className={quoteClass}>
      {body}
    </blockquote>
  );
}

/** The words a presence's fix suggests: the app's own label, else the presence's name ("Do not disturb"). */
function wordsFor(presence: string, label: string | undefined): string {
  return label || `${presence[0]!.toUpperCase()}${presence.slice(1).replaceAll("-", " ")}`;
}

/**
 * A row under the message (its footer or thread), or nothing when the app passed nothing. A post's rows keep a little
 * more room, and a post's thread that is only Reply (nobody has replied) ends the name line instead.
 */
function extra(slot: "footer" | "thread", end: boolean, post: boolean, children: ReactNode, spaced = false): JSX.Element | null {
  if (children === undefined || children === null || children === false) return null;
  return (
    <div
      {...{ [`data-ouro-message-${slot}`]: "" }}
      className={cn(
        "flex max-w-full min-w-0 flex-wrap items-center gap-2",
        end && "justify-end",
        post && ["mt-1", postRow],
        spaced && "mt-1",
        post && slot === "thread" && "has-data-ouro-thread-summary-unanswered:order-2 has-data-ouro-thread-summary-unanswered:mt-0 has-data-ouro-thread-summary-unanswered:basis-auto",
      )}
    >
      {children}
    </div>
  );
}

/** How long a send runs before it shows as pending. */
const PENDING_DELAY = 1000;

// Fades in as it mounts (from @starting-style): an opacity change, so it runs with reduced motion too.
const pendingClass =
  "pointer-events-none flex shrink-0 items-center text-[color-mix(in_oklab,var(--muted-foreground)_80%,var(--foreground))] " +
  "transition-opacity duration-(--ouro-duration-fast) ease-[ease] starting:opacity-0";

function PendingIcon(props: SVGProps<SVGSVGElement>): JSX.Element {
  return (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" {...props}>
      <circle cx="10" cy="10" r="7.5" />
      <path d="M10 6v4l2.5 2" />
    </svg>
  );
}

/** A circle with an exclamation mark: the message did not send. */
function NotSentIcon(props: SVGProps<SVGSVGElement>): JSX.Element {
  return (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" {...props}>
      <circle cx="10" cy="10" r="7.5" />
      <path d="M10 6.5v4.5M10 13.75v.01" />
    </svg>
  );
}

// Forced colours paint every background as the page, so the dots take the text's system colour there.
const typingDot = "size-ouro-1_5 animate-[ouro-pulse_1.2s_ease-in-out_infinite] rounded-full bg-current forced-colors:bg-[CanvasText]";

/**
 * Three dots that pulse in turn (opacity only, so reduced motion keeps them), with a spoken label.
 *
 * @claim "Three dots that pulse in turn" registry/ouro/components/ouro/message/message.tsx verify:fileLine(registry/ouro/components/ouro/message/message.tsx, /animate-\[ouro-pulse_1\.2s_ease-in-out_infinite\]/)
 * @claim "Three dots that pulse in turn" registry/ouro/theme/ouro-base.css verify:fileLine(registry/ouro/theme/ouro-base.css, /^@keyframes\souro-pulse\s\{/)
 * @claim "Three dots that pulse in turn" registry/ouro/components/ouro/message/message.test.tsx verify:testExists(registry/ouro/components/ouro/message/message.test.tsx::Message > is busy while streaming, with a typing indicator the app can name)
 */
function typing(label: string): JSX.Element {
  return (
    <span data-ouro-message-typing="" className="inline-flex h-[1lh] items-center gap-1">
      <span aria-hidden="true" className={typingDot} />
      <span aria-hidden="true" className={typingDot} style={{ animationDelay: "0.2s" }} />
      <span aria-hidden="true" className={typingDot} style={{ animationDelay: "0.4s" }} />
      <span className="sr-only">{label}</span>
    </span>
  );
}
