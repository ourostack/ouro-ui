"use client";

import type { HTMLAttributes, JSX, MouseEvent, Ref, SVGProps } from "react";
import { Avatar, AvatarGroup } from "@/registry/ouro/components/ouro/avatar/avatar";
import { Button } from "@/registry/ouro/components/ouro/button/button";
import { useAppearanceClassNameCheck } from "@/registry/ouro/lib/ouro/class-name-check";
import { cn } from "@/registry/ouro/lib/ouro/cn";
import { useDevWarnings } from "@/registry/ouro/lib/ouro/use-dev-messages";

/** Someone who replied in a thread: their name, and their picture if there is one. */
export interface ThreadReplier {
  /** Their name, for the avatar's initials and for screen readers. */
  name: string;
  /** Their picture's URL. Without it the avatar shows initials. */
  src?: string | undefined;
}

/** The props ThreadSummary adds to the `<div>` attributes it passes through. */
export interface ThreadSummaryOwnProps {
  /**
   * How many replies the thread has. With none, the summary is a single "Reply" button that
   * opens the thread to write the first one.
   *
   * @claim "With none, the summary is a" registry/ouro/components/ouro/message/thread-summary.test.tsx verify:testExists(registry/ouro/components/ouro/message/thread-summary.test.tsx::ThreadSummary > is a single Reply button with no replies yet)
   */
  count: number;
  /** Opens the thread, with the click event, so the app can check `event.isTrusted`. */
  onOpen: (event: MouseEvent<HTMLElement>) => void;
  /**
   * Who replied, in the order to show them. The first three show as overlapping avatars, then a
   * "+N" count.
   *
   * @claim "The first three show as overlapping" registry/ouro/components/ouro/message/thread-summary.test.tsx verify:testExists(registry/ouro/components/ouro/message/thread-summary.test.tsx::ThreadSummary > shows who replied, a button with the count that opens the thread, and the last reply's time)
   */
  repliers?: readonly ThreadReplier[] | undefined;
  /** When the last reply came, already formatted for the reader ("7:44 AM"). */
  lastReply?: string | undefined;
  /** The same moment for machines, as an ISO date: the `<time>` element's `dateTime`. */
  lastReplyDateTime?: string | undefined;
  /**
   * The button's words for a count, for other languages.
   * @default (count) => count === 1 ? "1 reply" : `${count} replies`
   */
  repliesLabel?: ((count: number) => string) | undefined;
  /**
   * What screen readers hear for the button, when its words alone ("2 replies") would repeat
   * from post to post: "2 replies to Riley's post Settings mockups". Start it with the words the
   * button shows, so speech input that says them still finds it (WCAG's label in name).
   * @claim "What screen readers hear for the" registry/ouro/components/ouro/message/thread-summary.test.tsx verify:testExists(registry/ouro/components/ouro/message/thread-summary.test.tsx::ThreadSummary > names its button for screen readers with label, keeping the words it shows)
   * @claim "Start it with the words the" registry/ouro/components/ouro/message/thread-summary.test.tsx verify:testExists(registry/ouro/components/ouro/message/thread-summary.test.tsx::ThreadSummary development messages > says when label leaves out the words the button shows)
   * @claim "Start it with the words the" https://www.w3.org/WAI/WCAG22/Understanding/label-in-name verify:urlOk(https://www.w3.org/WAI/WCAG22/Understanding/label-in-name)
   */
  label?: string | undefined;
  /** The button's words before anyone has replied, for other languages. @default "Reply" */
  replyLabel?: string | undefined;
  /**
   * The words around the last reply's time, for other languages.
   * @default (time) => `Last reply ${time}`
   */
  lastReplyLabel?: ((time: string) => string) | undefined;
  /** What screen readers hear for the repliers' avatars, for other languages. @default "Replied" */
  repliersLabel?: string | undefined;
  /** Layout only: margins (`mt-1`). Appearance classes warn in development. */
  className?: string | undefined;
  ref?: Ref<HTMLDivElement> | undefined;

  /** Not a prop. The thread opens with `onOpen`: `<ThreadSummary count={2} onOpen={openThread}>`. */
  onClick?: { 'Use onOpen={openThread}': never };
  /** Not a prop. The number of replies is `count`: `<ThreadSummary count={replies.length}>`. */
  replyCount?: { 'Use count={replies.length}': never };
}

/** Props for {@link ThreadSummary}: its own props and the `<div>` attributes it passes through. */
export type ThreadSummaryProps = Omit<HTMLAttributes<HTMLDivElement>, keyof ThreadSummaryOwnProps> & ThreadSummaryOwnProps;

const defaultReplies = (count: number) => (count === 1 ? "1 reply" : `${count} replies`);
const defaultLast = (time: string) => `Last reply ${time}`;

/**
 * The line under a post that leads to its thread: who replied, "N replies" (a button that
 * opens the thread) and when the last reply came. Before anyone has replied it is a "Reply"
 * button with a reply arrow, to start the thread.
 *
 * Pass it to `Message`'s `thread`, under a `variant="post"` message. Use `Button` instead for
 * an action that is not about a thread, and `AvatarGroup` alone to show who is in something.
 *
 * @group Chat
 * @see https://ui.ouro.bot/docs/thread-summary
 *
 * @example
 * <ThreadSummary count={thread.replies.length} repliers={thread.repliers} lastReply={formatTime(thread.lastReplyAt)} onOpen={() => openThread(thread.id)} />
 * @claim "Before anyone has replied it is" registry/ouro/components/ouro/message/thread-summary.test.tsx verify:testExists(registry/ouro/components/ouro/message/thread-summary.test.tsx::ThreadSummary > is a single Reply button with no replies yet)
 * @claim "The line under a" registry/ouro/components/ouro/message/thread-summary.test.tsx verify:testExists(registry/ouro/components/ouro/message/thread-summary.test.tsx::ThreadSummary > shows who replied, a button with the count that opens the thread, and the last reply's time)
 */
export function ThreadSummary(props: ThreadSummaryProps): JSX.Element {
  const {
    count,
    onOpen,
    repliers,
    lastReply,
    lastReplyDateTime,
    repliesLabel = defaultReplies,
    replyLabel = "Reply",
    lastReplyLabel = defaultLast,
    repliersLabel = "Replied",
    label,
    className,
    // Guard props (hint types), dropped here so they never reach the DOM.
    onClick,
    replyCount,
    ...rest
  } = props;
  useAppearanceClassNameCheck(
    "ThreadSummary",
    className,
    process.env.NODE_ENV !== "production"
      ? (token: string) => `remove "${token}"; ThreadSummary takes its colors from the theme`
      : // Stryker disable next-line StringLiteral: production only; the check never runs there.
        /* istanbul ignore next @preserve -- production only */ "",
  );
  const replied = count > 0;
  const shown = replied ? repliesLabel(count) : replyLabel;
  useDevWarnings(
    "ThreadSummary",
    process.env.NODE_ENV !== "production"
      ? () => [
          label !== undefined &&
            !label.toLowerCase().startsWith(shown.toLowerCase()) && [
              `label "${label}" does not start with the button's words "${shown}", so speech input that says them misses it`,
              `<ThreadSummary count={${count}} label="${shown} to Riley's post">`,
            ],
          onOpen === undefined && ["onOpen is missing, so the button opens nothing", "<ThreadSummary count={2} onOpen={openThread}>"],
          onClick !== undefined && ["onClick is not a prop", "<ThreadSummary count={2} onOpen={openThread}>"],
          replyCount !== undefined && ["replyCount is not a prop", "<ThreadSummary count={replies.length}>"],
        ]
      : /* istanbul ignore next @preserve -- production only */ undefined,
  );
  const faces = replied && repliers !== undefined && repliers.length > 0;
  return (
    <div {...rest} data-ouro="thread-summary" className={cn("box-border flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1", className)}>
      {faces && (
        <AvatarGroup label={repliersLabel} size="xs" max={3}>
          {repliers.map((replier, index) => (
            <Avatar key={`${replier.name}-${index}`} name={replier.name} src={replier.src} />
          ))}
        </AvatarGroup>
      )}
      <Button
        data-ouro-control="thread-summary"
        data-ouro-part="open"
        variant="plain"
        size="sm"
        startIcon={replied ? undefined : ReplyIcon}
        aria-label={label}
        onClick={(event) => onOpen?.(event)}
        // The label lines up with the text above it, or sits just after the avatars.
        className={faces ? "-ms-1" : "-ms-(--ouro-button-px)"}
      >
        {shown}
      </Button>
      {replied && lastReply !== undefined && (
        <time dateTime={lastReplyDateTime} className="text-xs text-muted-foreground tabular-nums">
          {lastReplyLabel(lastReply)}
        </time>
      )}
    </div>
  );
}

/** An arrow curving back: reply. */
function ReplyIcon(props: SVGProps<SVGSVGElement>): JSX.Element {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="m9 14-5-5 5-5" />
      <path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11" />
    </svg>
  );
}
