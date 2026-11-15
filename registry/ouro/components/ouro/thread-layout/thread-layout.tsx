"use client";

import { Children, useLayoutEffect, useRef, type FocusEvent, type JSX, type ReactNode } from "react";
import { useAppearanceClassNameCheck } from "@/registry/ouro/lib/ouro/class-name-check";
import { cn } from "@/registry/ouro/lib/ouro/cn";
import { useDevWarnings } from "@/registry/ouro/lib/ouro/use-dev-messages";

/** Props for {@link ThreadLayout}. */
export interface ThreadLayoutProps {
  /**
   * The main pane: the list and its reply box. It stays mounted while a thread covers it, so its
   * scroll position and its draft stay.
   */
  conversation: ReactNode;
  /**
   * The thread, usually a `ThreadRail`. Pass `null` when no thread is open, and the conversation
   * takes the whole box.
   */
  thread?: ReactNode | undefined;
  /** Layout only: the box's size and margins. Appearance classes warn in development; the colors come from the theme. */
  className?: string | undefined;

  /** Not a prop. The thread is `thread`: `<ThreadLayout conversation={list} thread={open ? <ThreadRail …/> : null} />`. */
  rail?: { "Pass the ThreadRail as thread, or null when closed": never };
}

/**
 * A conversation beside its thread. From 32rem up the conversation takes the rest of the width and
 * the thread its own 20rem. Below that, an open thread takes the whole box and the conversation is
 * hidden, not unmounted. The widths follow the layout's own box, not the window.
 *
 * Use `ThreadRail` for the thread itself. Use `Sheet` instead when the thread should cover the page
 * as a modal panel, and `Resizable` instead when the person sizes the panes.
 *
 * @group Layout
 * @example
 * <ThreadLayout
 *   conversation={<MessageList label="Messages">{messages}</MessageList>}
 *   thread={open ? <ThreadRail label="Thread" onClose={closeThread}><MessageList label="Replies">{replies}</MessageList></ThreadRail> : null}
 * />
 * @claim "From 32rem up the conversation takes the rest of the width and the thread its own 20rem" registry/ouro/components/ouro/thread-layout/thread-layout.test.tsx verify:testExists(registry/ouro/components/ouro/thread-layout/thread-layout.test.tsx::ThreadLayout > puts the conversation and the rail side by side from 32rem up, the rail at 20rem)
 * @claim "Below that, an open thread takes the whole box and the conversation is hidden, not unmounted" registry/ouro/components/ouro/thread-layout/thread-layout.test.tsx verify:testExists(registry/ouro/components/ouro/thread-layout/thread-layout.test.tsx::ThreadLayout > gives the rail the whole box below 32rem, and hides the conversation)
 * @claim "Below that, an open thread takes the whole box and the conversation is hidden, not unmounted" registry/ouro/components/ouro/thread-layout/thread-layout.test.tsx verify:testExists(registry/ouro/components/ouro/thread-layout/thread-layout.test.tsx::ThreadLayout > keeps the conversation mounted and its draft while a narrow box hides it)
 * @claim "The widths follow the layout's own box, not the window" registry/ouro/components/ouro/thread-layout/thread-layout.test.tsx verify:testExists(registry/ouro/components/ouro/thread-layout/thread-layout.test.tsx::ThreadLayout > keeps the conversation mounted and its draft while a narrow box hides it)
 */
export function ThreadLayout(props: ThreadLayoutProps): JSX.Element {
  const { conversation, thread, className, rail } = props;
  // `Children.toArray` drops null, undefined and booleans, the nodes that render nothing.
  const open = Children.toArray(thread).length > 0;

  useAppearanceClassNameCheck(
    "ThreadLayout",
    className,
    process.env.NODE_ENV !== "production"
      ? (token: string) => `remove "${token}"; the theme sets the colors of the panes ThreadLayout holds`
      : // Stryker disable next-line StringLiteral: production only; the check never runs there.
        /* istanbul ignore next @preserve -- production only */ "",
  );
  useDevWarnings(
    "ThreadLayout",
    process.env.NODE_ENV !== "production"
      ? () => [
          rail !== undefined && [
            "rail is not a prop; the thread takes its place",
            '<ThreadLayout conversation={list} thread={open ? <ThreadRail label="Thread" onClose={close} /> : null} />',
          ],
        ]
      : /* istanbul ignore next @preserve -- production only */ undefined,
  );

  // A thread that closes gives focus back as it unmounts, which in a narrow box is before the conversation shows again, so
  // the control it gives focus to is still hidden and focus falls to the page. Once the conversation shows, the last control
  // focused in it takes focus back, if nothing else has it.
  const lastFocused = useRef<HTMLElement | null>(null);
  const wasOpen = useRef(open);
  useLayoutEffect(() => {
    const closed = wasOpen.current && !open;
    wasOpen.current = open;
    const lost = document.activeElement === document.body;
    if (closed && lost && lastFocused.current?.isConnected) lastFocused.current.focus();
  }, [open]);
  const remember = (event: FocusEvent<HTMLElement>) => void (lastFocused.current = event.target);

  // The conversation's display is set only by the container query, and its layout by the element
  // inside it, so no element has a display utility and a display variant at once.
  return (
    <div data-ouro="thread-layout" className={cn("@container flex h-full min-h-0 w-full", className)}>
      <div className={cn("min-w-0 flex-1", open && "@max-lg:hidden")} onFocus={remember}>
        <div className="flex h-full min-h-0 min-w-0 flex-col">{conversation}</div>
      </div>
      {open && <div className="flex h-full min-h-0 w-full min-w-0 flex-col @lg:max-w-80">{thread}</div>}
    </div>
  );
}
