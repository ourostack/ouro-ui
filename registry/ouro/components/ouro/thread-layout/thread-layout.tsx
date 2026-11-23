"use client";

import { Children, useCallback, useLayoutEffect, useRef, type FocusEvent, type JSX, type ReactNode } from "react";
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
  /**
   * The conversation pane's name, which a screen reader hears when focus comes to the pane: when a thread closes that
   * no control in the conversation opened and the conversation has no heading to take focus. Name it apart from the
   * MessageList inside it, which is a region too. Translate it with the rest of your interface.
   * @claim "The conversation pane's name, which a" registry/ouro/components/ouro/thread-layout/thread-layout.test.tsx verify:testExists(registry/ouro/components/ouro/thread-layout/thread-layout.test.tsx::ThreadLayout > moves focus to the conversation pane, named, when a thread closes that nothing opened and the conversation has no heading)
   * @default "Conversation pane"
   */
  conversationLabel?: string | undefined;
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
 * When a thread that holds focus closes, focus goes back to the control in the conversation that
 * opened it. When none did (a thread opened from a link, or its opener gone since), focus comes to
 * the conversation's heading, or else to the conversation pane itself, a region named by
 * `conversationLabel`, so focus never falls to the page.
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
 * @claim "When a thread that holds focus closes" registry/ouro/components/ouro/thread-layout/thread-layout.test.tsx verify:testExists(registry/ouro/components/ouro/thread-layout/thread-layout.test.tsx::ThreadLayout > gives focus back to the conversation's control that opened the thread, once a narrow box shows it again)
 * @claim "When none did (a thread opened" registry/ouro/components/ouro/thread-layout/thread-layout.test.tsx verify:testExists(registry/ouro/components/ouro/thread-layout/thread-layout.test.tsx::ThreadLayout > moves focus to the conversation's heading when a thread closes that nothing in the conversation opened (%dpx)) verify:testExists(registry/ouro/components/ouro/thread-layout/thread-layout.test.tsx::ThreadLayout > moves focus to the conversation pane, named, when a thread closes that nothing opened and the conversation has no heading)
 * @claim "The widths follow the layout's own box, not the window" registry/ouro/components/ouro/thread-layout/thread-layout.test.tsx verify:testExists(registry/ouro/components/ouro/thread-layout/thread-layout.test.tsx::ThreadLayout > keeps the conversation mounted and its draft while a narrow box hides it)
 */
export function ThreadLayout(props: ThreadLayoutProps): JSX.Element {
  const { conversation, thread, conversationLabel = "Conversation pane", className, rail } = props;
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
  // focused in it takes focus back, if nothing else has it. When no control there opened the thread (a thread opened from
  // a link, or one gone since), focus comes to the conversation's heading, or else the conversation pane itself, by name.
  const lastFocused = useRef<HTMLElement | null>(null);
  const pane = useRef<HTMLDivElement>(null);
  // Whether the thread held focus as it closed: read as its box leaves, before the rail gives focus back.
  const threadHeldFocus = useRef(false);
  // Stryker disable next-line ArrayDeclaration: the callback reads nothing from render, so any dependency list keeps it.
  const threadBox = useCallback((box: HTMLDivElement) => () => void (threadHeldFocus.current = box.contains(document.activeElement)), []);
  useLayoutEffect(() => {
    if (!open && document.activeElement === document.body) lastFocused.current?.focus({ preventScroll: true });
    // The thread box's cleanup sets threadHeldFocus as each thread closes, so it is current whenever a close is handled here.
    if (open || !threadHeldFocus.current || document.activeElement !== document.body) return;
    // The conversation's own heading: not one inside a message, which would scroll the list away from the newest.
    const heading = [...pane.current!.querySelectorAll<HTMLElement>("h1, h2, h3, h4, h5, h6")].find((element) => element.closest('[data-ouro="message-list"], [data-ouro="message"]') === null);
    if (heading !== undefined) {
      const added = !heading.hasAttribute("tabindex");
      if (added) heading.tabIndex = -1;
      heading.focus({ preventScroll: true });
      // A heading that cannot take focus (hidden) is left as it was.
      if (added && document.activeElement !== heading) heading.removeAttribute("tabindex");
    }
    // No heading, or one that cannot take focus: the pane itself.
    if (document.activeElement !== heading) pane.current!.focus();
  }, [open]);
  const remember = (event: FocusEvent<HTMLElement>) => void (lastFocused.current = event.target);

  // The conversation's display is set only by the container query, and its layout by the element
  // inside it, so no element has a display utility and a display variant at once.
  return (
    <div data-ouro="thread-layout" className={cn("@container flex h-full min-h-0 w-full", className)}>
      <div
        ref={pane}
        role="region"
        aria-label={conversationLabel}
        tabIndex={-1}
        data-ouro-thread-layout-conversation=""
        className={cn("min-w-0 flex-1 outline-ring -outline-offset-2 focus-visible:outline-2 focus-visible:outline-solid", open && "@max-lg:hidden")}
        onFocus={remember}
      >
        <div className="flex h-full min-h-0 min-w-0 flex-col">{conversation}</div>
      </div>
      {open && (
        <div ref={threadBox} className="flex h-full min-h-0 w-full min-w-0 flex-col @lg:max-w-ouro-80">
          {thread}
        </div>
      )}
    </div>
  );
}
