"use client";

import { useId, useLayoutEffect, useRef, type JSX, type KeyboardEvent, type ReactNode, type RefObject } from "react";
import { Button } from "@/registry/ouro/components/ouro/button/button";
import { Kbd } from "@/registry/ouro/components/ouro/kbd/kbd";
import { Tooltip } from "@/registry/ouro/components/ouro/tooltip/tooltip";
import { useAppearanceClassNameCheck } from "@/registry/ouro/lib/ouro/class-name-check";
import { cn } from "@/registry/ouro/lib/ouro/cn";
import { useFocusHandoff } from "@/registry/ouro/lib/ouro/focus-handoff";
import { useMergedRef } from "@/registry/ouro/lib/ouro/refs";
import { useDevWarnings } from "@/registry/ouro/lib/ouro/use-dev-messages";

/** Props for {@link ThreadRail}. */
export interface ThreadRailProps {
  /** The rail's name for screen readers when `title` is left out, such as "Thread". Required, so the rail has a name. */
  label: string;
  /** The heading's words, which screen readers also hear as the rail's name. @default the label */
  title?: string | undefined;
  /** One muted line under the heading, cut short with an ellipsis: the conversation the thread belongs to. */
  detail?: string | undefined;
  /** Muted words after the heading, such as "2 replies". */
  meta?: ReactNode;
  /**
   * Called when the close button is pressed, or Escape is pressed with focus in the rail. The app
   * removes the rail in response.
   */
  onClose: () => void;
  /** The close button's name, which its tooltip also shows. @default "Close thread" */
  closeLabel?: string | undefined;
  /** The control that takes focus when the rail opens, instead of the rail itself. */
  initialFocus?: RefObject<HTMLElement | null> | undefined;
  /** Whether the rail takes focus when it opens. Pass `false` to leave focus where it is. @default true */
  autoFocus?: boolean | undefined;
  /** Where focus goes when the rail closes, instead of the control that had focus when it opened. */
  returnFocus?: RefObject<HTMLElement | null> | undefined;
  /** The thread: usually a `MessageList` and a `Composer`, which fill the rail's height. */
  children?: ReactNode;
  /** Layout only: the rail's size and margins. Appearance classes warn in development; the colors come from the theme. */
  className?: string | undefined;
  /** Not a prop. The rail shows while it is rendered: `{thread && <ThreadRail onClose={close}>}`. */
  open?: { "ThreadRail is open while it is rendered: render it only when a thread is open": never };
  /** Not a prop. The rail closes through `onClose`: `<ThreadRail onClose={() => setOpen(false)}>`. */
  onOpenChange?: { "Use onClose": never };
}

/** Elements that take Escape for themselves when they are open: a menu, a listbox or a dialog. */
const POPUP = '[role="menu"], [role="listbox"], [role="dialog"]';
/** Text a person types into: Escape there is not a request to close. */
const TEXT_ENTRY = 'input, textarea, select, [contenteditable]:not([contenteditable="false"])';
// Stryker disable next-line ArrayDeclaration: equivalent; the effect runs once, on mount, with any list that never changes
const MOUNT_ONLY: readonly never[] = [];

/** Whether the target sits in a popup between it and the rail, or in one drawn outside the rail's DOM. */
function inPopup(target: Element, rail: Element): boolean {
  for (let node: Element | null = target; node !== null && node !== rail; node = node.parentElement) {
    if (node.matches(POPUP)) return true;
  }
  return false;
}

/** The close button's icon, a cross. */
function CloseIcon(): JSX.Element {
  return (
    <svg aria-hidden="true" viewBox="0 0 16 16" fill="none" className="size-4">
      <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

/**
 * A thread beside its conversation: a labelled landmark with a header and a close button. Escape closes it.
 * It takes focus when it opens and gives it back when it closes.
 *
 * Use Sheet instead when the thread should cover the page, as on a phone, and close on a tap outside it.
 *
 * @group Chat
 * @example
 * <ThreadRail label="Thread" title="Thread" detail="Design reviews" meta="2 replies" onClose={closeThread}>
 *   <MessageList label="Replies">{replies}</MessageList>
 *   <Composer label="Reply in thread" onSend={send} />
 * </ThreadRail>
 * @claim "It takes focus when it opens" registry/ouro/components/ouro/thread-rail/thread-rail.test.tsx verify:testExists(registry/ouro/components/ouro/thread-rail/thread-rail.test.tsx::ThreadRail focus > takes focus on mount, on the rail itself or on initialFocus)
 * @claim "gives it back when it closes" registry/ouro/components/ouro/thread-rail/thread-rail.test.tsx verify:testExists(registry/ouro/components/ouro/thread-rail/thread-rail.test.tsx::ThreadRail focus > returns focus to the control that opened it when it closes)
 * @claim "Escape closes it" registry/ouro/components/ouro/thread-rail/thread-rail.test.tsx verify:testExists(registry/ouro/components/ouro/thread-rail/thread-rail.test.tsx::ThreadRail Escape > calls onClose on Escape with focus in the rail, and ignores other keys)
 */
export function ThreadRail(props: ThreadRailProps): JSX.Element {
  const {
    label,
    title,
    detail,
    meta,
    onClose,
    closeLabel = "Close thread",
    initialFocus,
    autoFocus = true,
    returnFocus,
    children,
    className,
    open,
    onOpenChange,
  } = props;
  const headingId = useId();
  const railRef = useRef<HTMLElement>(null);
  const opener = useRef<HTMLElement | null>(null);
  const handoff = useFocusHandoff<HTMLElement>();
  const rail = useMergedRef<HTMLElement>(railRef, handoff);

  useAppearanceClassNameCheck(
    "ThreadRail",
    className,
    process.env.NODE_ENV !== "production"
      ? (token: string) => `remove "${token}"; the theme sets ThreadRail's colors`
      : // Stryker disable next-line StringLiteral: production only; the check never runs there.
        /* istanbul ignore next @preserve -- production only */ "",
  );
  useDevWarnings(
    "ThreadRail",
    process.env.NODE_ENV !== "production"
      ? () => [
          label === undefined && ["label is missing, so screen readers cannot name the rail", '<ThreadRail label="Thread" onClose={close}>'],
          open !== undefined && ["open is not a prop; the rail shows while it is rendered", '{thread && <ThreadRail label="Thread" onClose={close}>}'],
          onOpenChange !== undefined && ["onOpenChange is not a prop", "<ThreadRail onClose={() => setOpen(false)}>"],
        ]
      : /* istanbul ignore next @preserve -- production only */ undefined,
  );

  // Mount only: the rail takes focus when it opens, and gives focus back when it closes. The
  // opener is remembered only when the rail took focus from it.
  /* eslint-disable react-hooks/exhaustive-deps -- the effect runs once, on mount: the focus an open rail takes is decided then */
  useLayoutEffect(() => {
    const element = railRef.current!;
    const returned = returnFocus;
    if (autoFocus) {
      opener.current = document.activeElement as HTMLElement | null;
      (initialFocus?.current ?? element).focus();
    }
    return () => {
      if (!element.contains(document.activeElement)) return;
      [returned?.current, opener.current].find((candidate) => candidate?.isConnected && !element.contains(candidate))?.focus();
    };
  }, MOUNT_ONLY);
  /* eslint-enable react-hooks/exhaustive-deps */

  // Escape closes the rail unless it is pressed in a text field or a popup inside the rail, or
  // something already handled it.
  function onKeyDown(event: KeyboardEvent<HTMLElement>) {
    if (event.key !== "Escape" || event.nativeEvent.defaultPrevented) return;
    const target = event.target as Element;
    if (target.matches(TEXT_ENTRY) || inPopup(target, event.currentTarget)) return;
    event.preventDefault();
    onClose();
  }

  return (
    <aside
      ref={rail}
      data-ouro="thread-rail"
      aria-labelledby={headingId}
      tabIndex={-1}
      onKeyDown={onKeyDown}
      className={cn("flex h-full min-h-0 flex-col border-s border-border bg-background outline-none", className)}
    >
      <div data-ouro-thread-rail-header="" className="flex min-w-0 shrink-0 items-start gap-2 border-b border-border px-4 py-3">
        <div className="min-w-0 flex-1">
          <h2 id={headingId} className="m-0 truncate text-base leading-6 font-semibold font-[family-name:var(--font-heading,inherit)]">
            {title ?? label}
          </h2>
          {detail !== undefined && <p className="m-0 truncate text-sm leading-5 text-muted-foreground">{detail}</p>}
          {meta !== undefined && <p className="m-0 text-xs leading-4 text-muted-foreground">{meta}</p>}
        </div>
        <Tooltip content={<span className="inline-flex items-center gap-2">{closeLabel}<Kbd keys={["escape"]} /></span>}>
          <Button
            data-ouro-control="thread-rail"
            data-ouro-part="close"
            variant="plain"
            tone="secondary"
            size="sm"
            aria-label={closeLabel}
            aria-keyshortcuts="Escape"
            onClick={() => onClose()}
            className="px-2"
          >
            <CloseIcon />
          </Button>
        </Tooltip>
      </div>
      <div className="flex min-h-0 flex-1 flex-col">{children}</div>
    </aside>
  );
}
