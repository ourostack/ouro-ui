"use client";

import type { HTMLAttributes, JSX } from "react";
import { cn } from "@/registry/ouro/lib/ouro/cn";

/** The props UnreadDot adds to the `<span>` attributes it passes through. */
export interface UnreadDotOwnProps {
  /** What screen readers hear for the dot, such as "Unread". A required prop. */
  label: string;
  /** Draws the dot. Pass `false` where a mark takes the dot's place: screen readers still hear `label`, and nothing is drawn. @default true */
  dot?: boolean | undefined;
}

/** Props for {@link UnreadDot}: its own props and the `<span>` attributes it passes through. */
export type UnreadDotProps = Omit<HTMLAttributes<HTMLSpanElement>, keyof UnreadDotOwnProps> & UnreadDotOwnProps;

/**
 * The dot that marks something unread: a small round dot in the theme's primary color, with a spoken label.
 * ConversationList and Command draw it for their unread rows; use it for an unread mark of your own, such as
 * a chat row's mark slot.
 *
 * Use `Avatar`'s `presence` instead when the dot says whether a person is online, and `Badge` for a count.
 *
 * @group Display
 * @see https://ui.ouroboros.bot/docs/unread-dot
 *
 * @example
 * <UnreadDot label="Unread" />
 */
export function UnreadDot(props: UnreadDotProps): JSX.Element {
  const { label, dot = true, className, ...rest } = props;
  // Without its dot it is only words for screen readers, out of the line's flow, so it adds no gap.
  if (!dot)
    return (
      <span {...rest} data-ouro="unread-dot" className="sr-only">
        {label}
      </span>
    );
  return (
    <span {...rest} data-ouro="unread-dot" className={cn("flex shrink-0 items-center", className)}>
      <span aria-hidden="true" className="size-2 rounded-full bg-primary" />
      <span className="sr-only">{label}</span>
    </span>
  );
}
