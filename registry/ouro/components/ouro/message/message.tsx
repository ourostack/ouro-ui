"use client";

import type { HTMLAttributes, JSX, ReactNode, Ref } from "react";
import { Avatar } from "@/registry/ouro/components/ouro/avatar/avatar";
import { useAppearanceClassNameCheck } from "@/registry/ouro/lib/ouro/class-name-check";
import { cn } from "@/registry/ouro/lib/ouro/cn";
import { useDevWarnings } from "@/registry/ouro/lib/ouro/use-dev-messages";

/** Who wrote a message: the person using the app, the assistant, or the app itself. */
export type MessageRole = "user" | "assistant" | "system";

/** The props Message adds to the `<article>` attributes it passes through. */
export interface MessageOwnProps {
  /**
   * Who wrote it. `user` is the person using the app: their messages sit at the end, in
   * the primary color. `assistant` is anyone else, such as an agent, at the start. `system`
   * is the app's own note ("Ada joined"), centered and quiet.
   */
  role: MessageRole | (string & { 'Use "user", "assistant" or "system"': never });
  /**
   * The author's name. Screen readers hear it before the message, and the avatar's
   * initials come from it. Required, so every message says who wrote it. The user's own
   * name is read but not shown.
   * @claim "Required, so every message says who" registry/ouro/components/ouro/message/message.test.tsx verify:testExists(registry/ouro/components/ouro/message/message.test.tsx::Message > is an article that says who wrote it, then what they wrote)
   * @claim "Required, so every message says who" registry/ouro/components/ouro/message/message.test-d.ts verify:fileLine(registry/ouro/components/ouro/message/message.test-d.ts, /expectTypeOf<\{\srole:\s"user"\s\}>\(\)\.not\.toExtend<MessageProps>/)
   */
  name: string;
  /** The author's picture URL. Without it the avatar shows initials; `false` shows no avatar. */
  avatar?: string | false | undefined;
  /** The message: text, or rich content such as a list or a code block. */
  children?: ReactNode;
  /** Files sent with the message, shown under it: `<Attachment>` elements. */
  attachments?: ReactNode;
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
}

/** Props for {@link Message}: its own props and the `<article>` attributes it passes through. */
export type MessageProps = Omit<HTMLAttributes<HTMLElement>, keyof MessageOwnProps | "content"> & MessageOwnProps;

const roles = ["user", "assistant", "system"] as const;

const bubbles = {
  user: "rounded-2xl rounded-ee-md bg-primary px-3.5 py-2 text-primary-foreground",
  assistant: "rounded-2xl rounded-es-md bg-muted px-3.5 py-2 text-foreground",
  system: "bg-transparent text-center text-muted-foreground",
} as const;

/**
 * One message in a chat: who wrote it, their avatar and what they wrote, with any
 * attachments under it. `role` places and colors it: the user's own messages at the end
 * in the primary color, the assistant's at the start, the app's `system` notes centered.
 * `streaming` marks a reply still being written.
 *
 * Use it inside `MessageList`, which keeps the newest message in view and announces new
 * ones. Use `Alert` instead for a notice that is not part of a conversation, and
 * `toast()` for a passing confirmation.
 *
 * @group Chat
 * @see https://ourostack.github.io/ouro-ui/docs/message
 *
 * @example
 * <Message role="user" name={user.name} avatar={user.photoUrl}>How long do I rest the dough?</Message>
 * <Message role="assistant" name="Ouro" streaming={!reply.done}>{reply.text}</Message>
 */
export function Message(props: MessageProps): JSX.Element {
  const {
    role: roleProp,
    name: nameProp,
    avatar,
    children,
    attachments,
    streaming = false,
    streamingLabel = "Writing",
    className,
    // Guard props (hint types), dropped here so they never reach the DOM.
    from,
    sender,
    author,
    content,
    ...rest
  } = props;
  const name = nameProp ?? "";
  // A role that is not one of Ouro UI's (a type error) warns and renders as the assistant's.
  const role = (roles as readonly string[]).includes(roleProp) ? (roleProp as MessageRole) : "assistant";
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
          from !== undefined && ["from is not a prop", '<Message role="user" name="Ada">'],
          (sender !== undefined || author !== undefined) && [`${sender !== undefined ? "sender" : "author"} is not a prop`, '<Message role="user" name="Ada">'],
          content !== undefined && ["content is not a prop; the message is the children", '<Message role="user" name="Ada">Hi</Message>'],
        ]
      : /* istanbul ignore next @preserve -- production only */ undefined,
  );
  const empty = children === undefined || children === null || children === false || children === "";
  return (
    <article
      {...rest}
      data-ouro="message"
      data-role={role}
      aria-busy={streaming || rest["aria-busy"]}
      className={cn(
        "box-border flex w-full min-w-0 items-end gap-2 text-base pointer-fine:text-sm",
        role === "user" && "flex-row-reverse",
        role === "system" && "justify-center",
        className,
      )}
    >
      {role !== "system" && avatar !== false && <Avatar name={name} src={avatar} alt="" size="sm" className="mb-0.5" />}
      <div
        className={cn(
          "flex max-w-[min(85%,42rem)] min-w-0 flex-col gap-1",
          role === "user" ? "items-end" : role === "system" ? "items-center" : "items-start",
        )}
      >
        <span data-ouro-message-author="" className={role === "assistant" ? "px-1 text-xs font-medium text-muted-foreground" : "sr-only"}>
          {name}
        </span>
        <div data-ouro-message-content="" className={cn("max-w-full leading-relaxed [overflow-wrap:anywhere]", bubbles[role], role === "system" && "text-sm")}>
          {streaming && empty ? <Typing label={streamingLabel} /> : children}
        </div>
        {attachments !== undefined && attachments !== null && (
          <div data-ouro-message-attachments="" className={cn("flex max-w-full flex-wrap gap-2", role === "user" && "justify-end")}>
            {attachments}
          </div>
        )}
      </div>
    </article>
  );
}

/** Three dots that pulse in turn (opacity only, so reduced motion keeps them), with a spoken label. */
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
