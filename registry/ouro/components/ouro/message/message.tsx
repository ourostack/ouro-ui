"use client";

import {
  isValidElement,
  useEffect,
  useState,
  type HTMLAttributes,
  type JSX,
  type MouseEvent,
  type PointerEvent,
  type ReactElement,
  type ReactNode,
  type Ref,
} from "react";
import { Avatar, type AvatarPresence } from "@/registry/ouro/components/ouro/avatar/avatar";
import type { MenuEntry } from "@/registry/ouro/components/ouro/menu/menu";
import type { MessageActionBar } from "@/registry/ouro/components/ouro/message/message-parts";
import { useAppearanceClassNameCheck } from "@/registry/ouro/lib/ouro/class-name-check";
import { cn } from "@/registry/ouro/lib/ouro/cn";
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
}

/** The props Message adds to the `<article>` attributes it passes through. */
export interface MessageOwnProps {
  /**
   * Who wrote it. `user` is the person using the app: their messages sit at the end, in
   * the primary color. `assistant` is anyone else, such as an agent, at the start. `system`
   * is the app's own note ("Ada joined"), centered and quiet.
   */
  role: MessageRole | (string & { 'Use "user", "assistant" or "system"': never });
  /**
   * How the message is laid out. `default` suits a conversation with an assistant. `chat`
   * suits people writing to each other: others' messages at the start on a raised bubble
   * under their name and time, the user's own at the end in a tint of the primary color,
   * with only the time. `post` is a post in a channel: a card as wide as the list, under the
   * author's name and time, with an optional `subject` and the `footer` inside it. `reply` is
   * a reply in a thread: the same line of name and time, with the text unboxed under it. In
   * `post` and `reply` the user's own messages sit at the start too.
   * @default "default"
   *
   * @claim "`chat` suits people writing to each" registry/ouro/components/ouro/message/message.test.tsx verify:testExists(registry/ouro/components/ouro/message/message.test.tsx::Message chat > puts others' messages at the start on a raised bubble under their name and time, and the user's own at the end in a tint)
   * @claim "`post` is a post in a" registry/ouro/components/ouro/message/message.test.tsx verify:testExists(registry/ouro/components/ouro/message/message.test.tsx::Message post > is a card as wide as the list under the name and time, with the subject and footer inside it)
   * @claim "`reply` is a reply in a" registry/ouro/components/ouro/message/message.test.tsx verify:testExists(registry/ouro/components/ouro/message/message.test.tsx::Message post > lays a reply out unboxed under its name and time, at the start for everyone)
   */
  variant?: MessageVariant | (string & { 'Use "default", "chat", "post" or "reply"': never }) | undefined;
  /**
   * The author's name. Screen readers hear it before the message, and the avatar's
   * initials come from it. Required, so every message says who wrote it. The user's own
   * name is read but not shown.
   * @claim "Required, so every message says who" registry/ouro/components/ouro/message/message.test.tsx verify:testExists(registry/ouro/components/ouro/message/message.test.tsx::Message > is an article that says who wrote it, then what they wrote)
   * @claim "Required, so every message says who" registry/ouro/components/ouro/message/message.test-d.ts verify:fileLine(registry/ouro/components/ouro/message/message.test-d.ts, /expectTypeOf<\{\srole:\s"user"\s\}>\(\)\.not\.toExtend<MessageProps>/)
   */
  name: string;
  /**
   * The author's picture URL. Without it the avatar shows initials; `false` shows no avatar.
   * For the author's presence, pass `presence`. Pass an `Avatar` element instead for a square
   * avatar or a color of your own: `avatar={<Avatar name="Ada" src={url} alt="" size="sm" />}`
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
  /** A post's subject, in bold above its text. `post` only. */
  subject?: ReactNode;
  /** The message: text, or rich content such as a list or a code block. */
  children?: ReactNode;
  /** Files sent with the message, shown under it: `<Attachment>` elements. */
  attachments?: ReactNode;
  /**
   * Under the message, or inside a post's card: its reactions (`<ReactionBar>`), "Edited",
   * whether it was delivered or seen.
   */
  footer?: ReactNode;
  /** Under a post: its thread, as a `<ThreadSummary>`. */
  thread?: ReactNode;
  /**
   * The message's actions, as icon buttons with tooltips in a small bar at the bubble's top end
   * (`actionsPlacement`) or over a post card's corner. The bar shows while the pointer is over
   * the message, while focus is in it, and after a tap on a touch screen. It is a toolbar: one Tab stop, with the arrow
   * keys moving between its buttons.
   *
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
   * over its card's corner, and the default layout's over its bubble's.
   *
   * @default "beside" on a `reply`, "corner" on a `chat`
   * @claim "`beside` puts it just past the" registry/ouro/components/ouro/message/message.test.tsx verify:testExists(registry/ouro/components/ouro/message/message.test.tsx::Message actions > puts a reply's bar beside its text, level with its top, clear of the name)
   * @claim "where the row has no room left" registry/ouro/components/ouro/message/message.test.tsx verify:testExists(registry/ouro/components/ouro/message/message.test.tsx::Message actions > ends a bar beside a bubble at the row's edge when the bubble fills the row, with an avatar or without, right to left too)
   * @claim "On the user's own `chat` message" registry/ouro/components/ouro/message/message.test.tsx verify:testExists(registry/ouro/components/ouro/message/message.test.tsx::Message actions > puts a chat bar beside the bubble when asked: past others' bubbles, before the user's own)
   */
  actionsPlacement?: MessageActionsPlacement | (string & { 'Use "corner" or "beside"': never }) | undefined;
  /**
   * More actions, in a menu that opens from the last button in the action bar: the same
   * entries as Menu's `items`, each with an optional `icon` before its label. The bar stays while the menu is open. The bar renders in the
   * browser once its code loads, so server HTML has the message without it; Menu's code loads the
   * first time someone opens a message's menu.
   *
   * @claim "More actions, in a menu that" registry/ouro/components/ouro/message/message.test.tsx verify:testExists(registry/ouro/components/ouro/message/message.test.tsx::Message actions > opens the menu from the last button, and keeps the bar while it is open)
   */
  menu?: readonly MenuEntry[] | undefined;
  /** What screen readers hear for the action bar, for other languages. @default "Message actions" */
  actionsLabel?: string | undefined;
  /** The menu button's name, for other languages. @default "More actions" */
  menuLabel?: string | undefined;
  /**
   * The reply is still being written. The message is `aria-busy`, an empty one shows a
   * typing indicator, and `MessageList` announces it once, when streaming ends.
   */
  streaming?: boolean | undefined;
  /** What screen readers hear for the typing indicator, for other languages. @default "Writing" */
  streamingLabel?: string | undefined;
  /** Layout only: margins (`mt-4`). Appearance classes warn in development; the colors follow `role`. */
  className?: string | undefined;
  ref?: Ref<HTMLElement> | undefined;

  /** Not a prop. Who wrote it is `role`: `<Message role="user" name="Ada">`. */
  from?: { 'Use <Message role="user" name="Ada">': never };
  /** Not a prop. The author is `name`: `<Message role="user" name="Ada">`. */
  sender?: { 'Use <Message role="user" name="Ada">': never };
  /** Not a prop. The author is `name`: `<Message role="user" name="Ada">`. */
  author?: { 'Use <Message role="user" name="Ada">': never };
  /** Not a prop. The message is the children: `<Message role="user" name="Ada">Hi</Message>`. */
  content?: { 'Use <Message role="user" name="Ada">Hi</Message>': never };
  /** Not a prop. The user's own messages are `role="user"`: `<Message role="user" variant="chat">`. */
  own?: { 'Use <Message role="user" variant="chat">': never };
  /** Not a prop. The time is `time`, formatted: `<Message time="9:41 AM" dateTime={iso}>`. */
  timestamp?: { 'Use <Message time="9:41 AM" dateTime={iso}>': never };
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
  user: "rounded-2xl rounded-ee-md bg-primary px-3.5 py-2 text-primary-foreground",
  assistant: "rounded-2xl rounded-es-md bg-muted px-3.5 py-2 text-foreground",
  system: "bg-transparent text-center text-muted-foreground",
} as const;

// A raised surface: the theme's card with its hairline and small shadow.
const raised = "bg-card text-card-foreground ring-1 ring-border/60 shadow-(--shadow-sm)";

const layouts = {
  chat: {
    user: "rounded-lg bg-[color-mix(in_oklab,var(--primary)_12%,var(--card))] px-3 py-2 text-foreground",
    assistant: `rounded-lg px-3 py-2 ${raised}`,
  },
  post: `w-full rounded-lg px-4 py-3 ${raised}`,
  reply: "px-0.5",
} as const;

// The action bar's code, loaded once, the first time a message with actions or a menu mounts: a
// page whose messages have no bar never loads it, nor the Tooltip and Menu it uses.
let barModule: Promise<typeof MessageActionBar> | undefined;
const loadBar = () => (barModule ??= import("@/registry/ouro/components/ouro/message/message-parts").then((module) => module.MessageActionBar));

// The ring a message shows when it has keyboard focus, as one in a MessageList takes: the focus
// outline Ouro's controls have, with rounded corners, since the message's own box is bare.
const focusRing = "rounded-lg outline-ring outline-offset-2 focus-visible:outline-2 focus-visible:outline-solid";

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
 * @see https://ui.ouro.bot/docs/message
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
    variant: variantProp = "default",
    avatar,
    presence,
    presenceLabel,
    time,
    dateTime,
    continued: continuedProp = false,
    subject,
    children,
    attachments,
    footer,
    thread,
    actions,
    actionsPlacement,
    menu,
    actionsLabel = "Message actions",
    menuLabel = "More actions",
    streaming = false,
    streamingLabel = "Writing",
    className,
    // Guard props (hint types), dropped here so they never reach the DOM.
    from,
    sender,
    author,
    content,
    own,
    timestamp,
    ...rest
  } = props;
  const name = nameProp ?? "";
  // A role that is not one of Ouro UI's (a type error) warns and renders as the assistant's.
  const role = (roles as readonly string[]).includes(roleProp) ? (roleProp as MessageRole) : "assistant";
  const variant = (variants as readonly string[]).includes(variantProp) ? (variantProp as MessageVariant) : "default";
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
          actionsPlacement !== undefined &&
            placement !== actionsPlacement && [`actionsPlacement="${String(actionsPlacement)}" is not a placement; use "corner" or "beside"`, '<Message variant="chat" actionsPlacement="beside">'],
          from !== undefined && ["from is not a prop", '<Message role="user" name="Ada">'],
          (sender !== undefined || author !== undefined) && [`${sender !== undefined ? "sender" : "author"} is not a prop`, '<Message role="user" name="Ada">'],
          content !== undefined && ["content is not a prop; the message is the children", '<Message role="user" name="Ada">Hi</Message>'],
          own !== undefined && ["own is not a prop; the user's own messages are role=\"user\"", '<Message role="user" variant="chat">'],
          timestamp !== undefined && ["timestamp is not a prop", '<Message time="9:41 AM" dateTime={iso}>'],
          variant === "post" && continuedProp && ["a post is never continued: every post shows its author", '<Message variant="reply" continued>'],
          variant !== "post" && subject !== undefined && ["subject shows only on a post", '<Message variant="post" subject="Launch plan">'],
          presence !== undefined &&
            isValidElement(avatar) && [
              "presence does not reach an Avatar element passed as avatar; give that Avatar the presence",
              `avatar={<Avatar name="${name}" alt="" size="sm" presence="${presence}" presenceLabel="${wordsFor(presence, presenceLabel)}" />}`,
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
  const [element, setElement] = useState<HTMLElement | null>(null);
  useEffect(() => {
    // Stryker disable next-line ConditionalExpression: listening while inactive would only set it inactive again.
    if (!active) return;
    const away = (event: Event) => {
      if (!element!.contains(event.target as Node)) setActive(false);
    };
    document.addEventListener("pointerdown", away);
    return () => document.removeEventListener("pointerdown", away);
  }, [active, element]);
  const hasBar = (actions !== undefined && actions.length > 0) || (menu !== undefined && menu.length > 0);
  const tap = (event: PointerEvent<HTMLElement>) => {
    rest.onPointerUp?.(event);
    // A tap on a control is the control's; the message itself takes a tabindex in a MessageList, and a tap on it is the message's.
    const control = (event.target as Element).closest("a, button, input, textarea, select, [tabindex]");
    if (hasBar && event.pointerType === "touch" && (control === null || control === event.currentTarget)) setActive(true);
  };
  const ref = (node: HTMLElement | null) => {
    setElement(node);
    const forwarded = props.ref;
    if (typeof forwarded === "function") forwarded(node);
    else if (forwarded) forwarded.current = node;
  };

  const empty = children === undefined || children === null || children === false || children === "";
  const body = streaming && empty ? <Typing label={streamingLabel} /> : children;
  // The bar's code, with Tooltip, loads in the browser for a message that has a bar.
  const [Bar, setBar] = useState<typeof MessageActionBar | undefined>(undefined);
  useEffect(() => {
    // Stryker disable next-line ConditionalExpression: the bar's code for a message without one renders nothing; site/e2e/catalog.spec.ts holds a page without bars to never loading it.
    if (hasBar) void loadBar().then((Loaded) => setBar(() => Loaded));
  }, [hasBar]);
  // Beside the bubble: a chat or reply message's own layout, with the room before the bubble that the
  // avatar's column takes (w-8 and the row's gap-2) when it is at the start.
  const beside =
    placement === "beside" && (variant === "chat" || variant === "reply") && role !== "system"
      ? avatar === false || (variant === "chat" && role === "user")
        ? "0px"
        : "2.5rem"
      : undefined;
  const bar =
    hasBar && Bar ? (
      <Bar actions={actions ?? []} menu={menu} label={actionsLabel} menuLabel={menuLabel} start={variant === "chat" && role === "user"} card={variant === "post"} beside={beside} />
    ) : null;

  if (variant === "default" || role === "system") {
    const continued = continuedProp && role !== "system";
    const bubble = (
      // Stryker disable next-line ConditionalExpression,EqualityOperator,LogicalOperator,StringLiteral: on a fine pointer the article is text-sm already; the touch tests hold the system note's smaller text.
      <div data-ouro-message-content="" className={cn("max-w-full leading-relaxed [overflow-wrap:anywhere]", bubbles[role], role === "system" && "text-sm")}>
        {body}
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
        onPointerUp={tap}
        className={cn(
          "group/message box-border flex w-full min-w-0 items-end gap-2 text-base pointer-fine:text-sm",
          focusRing,
          role === "user" && "flex-row-reverse",
          role === "system" && "justify-center",
          className,
        )}
      >
        {role !== "system" && avatar !== false && (continued ? <span aria-hidden="true" className="w-8 shrink-0" /> : <AvatarSlot avatar={avatar} name={name} presence={presence} presenceLabel={presenceLabel} size="sm" className="mb-0.5" />)}
        <div
          className={cn(
            "flex max-w-[min(85%,42rem)] min-w-0 flex-col gap-1",
            role === "user" ? "items-end" : role === "system" ? "items-center" : "items-start",
          )}
        >
          <span data-ouro-message-author="" className={role === "assistant" && !continued ? "px-1 text-xs font-medium text-muted-foreground" : "sr-only"}>
            {name}
            {time !== undefined && (
              <>
                <span className="sr-only">, </span>
                <time dateTime={dateTime} className="ms-1.5 font-normal tabular-nums">
                  {time}
                </time>
              </>
            )}
          </span>
          {bar ? (
            <div className="relative flex max-w-full flex-col">
              {bubble}
              {bar}
            </div>
          ) : (
            bubble
          )}
          {attachments !== undefined && attachments !== null && (
            <div data-ouro-message-attachments="" className={cn("flex max-w-full flex-wrap gap-2", role === "user" && "justify-end")}>
              {attachments}
            </div>
          )}
          <Extra slot="footer" end={role === "user"}>
            {footer}
          </Extra>
          <Extra slot="thread" end={role === "user"}>
            {thread}
          </Extra>
        </div>
      </article>
    );
  }

  // chat, post and reply: the avatar's column at the start, then a line of name and time over the message.
  const mine = role === "user";
  const end = variant === "chat" && mine;
  const continued = continuedProp && variant !== "post";
  // In chat the user's own name is not shown (the side says whose it is), only the time.
  const nameShown = !continued && !end;
  const header = (
    <span data-ouro-message-header="" className={continued ? "sr-only" : "flex min-w-0 items-baseline gap-2 px-0.5 text-xs"}>
      <span data-ouro-message-author="" className={nameShown ? "truncate font-semibold text-foreground" : "sr-only"}>
        {name}
      </span>
      {time !== undefined && (
        <>
          <span className="sr-only">, </span>
          <time dateTime={dateTime} className="shrink-0 text-muted-foreground tabular-nums">
            {time}
          </time>
        </>
      )}
    </span>
  );
  const card = variant === "post";
  const surface = variant === "chat" ? layouts.chat[mine ? "user" : "assistant"] : layouts.reply;
  return (
    <article
      {...rest}
      ref={ref}
      data-ouro="message"
      data-role={role}
      data-variant={variant}
      data-continued={continued ? "" : undefined}
      data-ouro-message-active={active ? "" : undefined}
      aria-busy={streaming || rest["aria-busy"]}
      onPointerUp={tap}
      // A bar beside the bubble measures the message's width (100cqw), so the message is a container.
      style={hasBar && beside !== undefined ? { ...rest.style, containerType: "inline-size" } : rest.style}
      className={cn("group/message box-border flex w-full min-w-0 items-start gap-2 text-base pointer-fine:text-sm", focusRing, end && "flex-row-reverse", className)}
    >
      {!end && avatar !== false && (
        <span data-ouro-message-gutter="" className="flex w-8 shrink-0 justify-center">
          {continued ? (
            time !== undefined && (
              <time
                aria-hidden="true"
                dateTime={dateTime}
                className="mt-2.5 text-[0.625rem] leading-none whitespace-nowrap text-muted-foreground tabular-nums opacity-0 transition-opacity duration-(--ouro-duration-fast) ease-[ease] pointer-fine:group-hover/message:opacity-100 group-focus-within/message:opacity-100"
              >
                {time}
              </time>
            )
          ) : (
            <AvatarSlot avatar={avatar} name={name} presence={presence} presenceLabel={presenceLabel} size="sm" />
          )}
        </span>
      )}
      <div className={cn("flex min-w-0 flex-col gap-1", variant === "chat" ? "max-w-[min(85%,42rem)]" : "flex-1", end ? "items-end" : "items-start")}>
        {header}
        <div
          data-ouro-message-card={card ? "" : undefined}
          className={cn("relative box-border flex max-w-full min-w-0 flex-col", card ? layouts.post : end ? "items-end" : "items-start")}
        >
          <div data-ouro-message-content="" className={cn("box-border max-w-full min-w-0 leading-relaxed [overflow-wrap:anywhere]", !card && surface)}>
            {card && subject !== undefined && subject !== null && (
              <p data-ouro-message-subject="" className="m-0 mb-1 font-[family-name:var(--font-heading,inherit)] text-lg leading-snug font-semibold">
                {subject}
              </p>
            )}
            {body}
          </div>
          {card && (
            <Extra slot="footer" end={false} inset>
              {footer}
            </Extra>
          )}
          {bar}
        </div>
        {attachments !== undefined && attachments !== null && (
          <div data-ouro-message-attachments="" className={cn("flex max-w-full flex-wrap gap-2", end && "justify-end")}>
            {attachments}
          </div>
        )}
        {!card && (
          <Extra slot="footer" end={end}>
            {footer}
          </Extra>
        )}
        <Extra slot="thread" end={end}>
          {thread}
        </Extra>
      </div>
    </article>
  );
}

/**
 * The author's avatar: the Avatar element the app passed, or one drawn from the picture URL and
 * name, with the author's presence. A missing label still says the presence, as Avatar would.
 */
function AvatarSlot({
  avatar,
  name,
  presence,
  presenceLabel,
  size,
  className,
}: {
  avatar: string | ReactElement | undefined;
  name: string;
  presence: string | undefined;
  presenceLabel: string | undefined;
  size: "sm" | "md";
  className?: string;
}): JSX.Element {
  if (isValidElement(avatar)) return avatar;
  const dot = presence === undefined ? {} : { presence: presence as AvatarPresence, presenceLabel: presenceLabel || presence.replaceAll("-", " ") };
  return <Avatar name={name} src={avatar} alt="" size={size} className={className} {...dot} />;
}

/** The words a presence's fix suggests: the app's own label, else the presence's name ("Do not disturb"). */
function wordsFor(presence: string, label: string | undefined): string {
  return label || `${presence[0]!.toUpperCase()}${presence.slice(1).replaceAll("-", " ")}`;
}

/** A row under the message (its footer or thread), or nothing when the app passed nothing. */
function Extra({ slot, end, inset = false, children }: { slot: "footer" | "thread"; end: boolean; inset?: boolean; children: ReactNode }): JSX.Element | null {
  if (children === undefined || children === null || children === false) return null;
  return (
    <div
      {...{ [`data-ouro-message-${slot}`]: "" }}
      className={cn("flex max-w-full min-w-0 flex-wrap items-center gap-2", end && "justify-end", inset && "mt-2")}
    >
      {children}
    </div>
  );
}

/**
 * Three dots that pulse in turn (opacity only, so reduced motion keeps them), with a spoken label.
 *
 * @claim "Three dots that pulse in turn" registry/ouro/components/ouro/message/message.tsx verify:fileLine(registry/ouro/components/ouro/message/message.tsx, /animate-\[ouro-pulse_1\.2s_ease-in-out_infinite\]/)
 * @claim "Three dots that pulse in turn" registry/ouro/theme/ouro-base.css verify:fileLine(registry/ouro/theme/ouro-base.css, /^@keyframes\souro-pulse\s\{/)
 * @claim "Three dots that pulse in turn" registry/ouro/components/ouro/message/message.test.tsx verify:testExists(registry/ouro/components/ouro/message/message.test.tsx::Message > is busy while streaming, with a typing indicator the app can name)
 */
function Typing({ label }: { label: string }): JSX.Element {
  return (
    <span data-ouro-message-typing="" className="inline-flex h-[1lh] items-center gap-1">
      {[0, 1, 2].map((dot) => (
        <span
          key={dot}
          aria-hidden="true"
          className="size-1.5 animate-[ouro-pulse_1.2s_ease-in-out_infinite] rounded-full bg-current"
          style={{ animationDelay: `${dot * 0.2}s` }}
        />
      ))}
      <span className="sr-only">{label}</span>
    </span>
  );
}
