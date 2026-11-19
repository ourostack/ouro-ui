"use client";

import type { HTMLAttributes, JSX, Ref } from "react";
import { Avatar, type AvatarMember } from "@/registry/ouro/components/ouro/avatar/avatar";
import { writingOf } from "@/registry/ouro/components/ouro/typing-indicator/typing-indicator-styles";
import { useAppearanceClassNameCheck } from "@/registry/ouro/lib/ouro/class-name-check";
import { cn } from "@/registry/ouro/lib/ouro/cn";
import { useDevWarnings } from "@/registry/ouro/lib/ouro/use-dev-messages";

/** The props TypingIndicator adds to the `<div>` attributes it passes through. */
export interface TypingIndicatorOwnProps {
  /**
   * Who is writing now, not counting the reader, in the order they started. Each of the first three shows as a small
   * face (their picture, or one initial in their own hue) beside pulsing dots and the words: "Ned Land is writing…",
   * "Ned Land and Conseil are writing…", then "Several people are writing…". Pass an empty list when nobody is: the
   * line stays, one line tall and empty, so the chat above it never moves.
   * @claim "Each of the first three shows as a small" registry/ouro/components/ouro/typing-indicator/typing-indicator.test.tsx verify:testExists(registry/ouro/components/ouro/typing-indicator/typing-indicator.test.tsx::TypingIndicator > shows who is writing as faces and words, three faces at most)
   * @claim "the line stays, one line tall and empty" registry/ouro/components/ouro/typing-indicator/typing-indicator.test.tsx verify:testExists(registry/ouro/components/ouro/typing-indicator/typing-indicator.test.tsx::TypingIndicator > keeps one line's height whether anyone is writing, so the chat above never moves)
   */
  people: readonly AvatarMember[];
  /**
   * The words, from the writers' names, for other languages. It is not called when nobody is writing.
   * @default one name "is writing…", two "are writing…", then "Several people are writing…"
   * @claim "Several people are writing" registry/ouro/components/ouro/typing-indicator/typing-indicator.test.tsx verify:testExists(registry/ouro/components/ouro/typing-indicator/typing-indicator.test.tsx::TypingIndicator > names one or two writers, and says several past that)
   */
  label?: ((names: readonly string[]) => string) | undefined;
  /** Layout only: margins and padding (`px-4`). Appearance classes warn in development. */
  className?: string | undefined;
  ref?: Ref<HTMLDivElement> | undefined;

  /** Not a prop. Who is writing is `people`: `<TypingIndicator people={[{ name: "Ned Land" }]} />`. */
  users?: { 'Use people={[{ name, src }]}': never };
  /** Not a prop. Who is writing is `people`: `<TypingIndicator people={[{ name: "Ned Land" }]} />`. */
  typing?: { 'Use people={[{ name, src }]}': never };
  /** Not a prop. It shows while `people` has anyone in it: `<TypingIndicator people={writers} />`. */
  visible?: { 'It shows while people has anyone in it': never };
}

/** Props for {@link TypingIndicator}: its own props and the `<div>` attributes it passes through. */
export type TypingIndicatorProps = Omit<HTMLAttributes<HTMLDivElement>, keyof TypingIndicatorOwnProps | "role"> & TypingIndicatorOwnProps;

// Forced colours paint every background as the page, so the dots take the text's system colour there.
const dot = "size-1 animate-[ouro-pulse_1.2s_ease-in-out_infinite] rounded-full bg-current forced-colors:bg-[CanvasText]";

/**
 * The line under a chat that says who is writing: their faces, pulsing dots and "Ned Land is writing…". It is a
 * polite status region, so screen readers hear the words once each time the writers change, and the faces and dots
 * are hidden from them. The dots only fade, so reduced motion keeps them.
 *
 * Put it between a `MessageList` and its `Composer`. Use `Message`'s `streaming` instead for a reply that is already
 * on its way in the chat, such as an AI agent's, and `AgentPresence` for what an agent is doing.
 *
 * @group Chat
 * @see https://ui.ouroboros.bot/docs/typing-indicator
 *
 * @example
 * <TypingIndicator people={writers.map((person) => ({ name: person.name, src: person.photoUrl }))} />
 * @claim "It is a polite status region" registry/ouro/components/ouro/typing-indicator/typing-indicator.test.tsx verify:testExists(registry/ouro/components/ouro/typing-indicator/typing-indicator.test.tsx::TypingIndicator > is a polite status that says the words once per change, with the faces and dots hidden)
 * @claim "The dots only fade" registry/ouro/components/ouro/typing-indicator/typing-indicator.test.tsx verify:testExists(registry/ouro/components/ouro/typing-indicator/typing-indicator.test.tsx::TypingIndicator > fades its dots and moves nothing, with reduced motion too)
 */
export function TypingIndicator(props: TypingIndicatorProps): JSX.Element {
  const {
    people,
    label = writingOf,
    className,
    // Guard props (hint types), dropped here so they never reach the DOM.
    users,
    typing,
    visible,
    ...rest
  } = props;
  useAppearanceClassNameCheck(
    "TypingIndicator",
    className,
    process.env.NODE_ENV !== "production"
      ? (token: string) => `remove "${token}"; TypingIndicator takes its colors from the theme`
      : // Stryker disable next-line StringLiteral: production only; the check never runs there.
        /* istanbul ignore next @preserve -- production only */ "",
  );
  useDevWarnings(
    "TypingIndicator",
    process.env.NODE_ENV !== "production"
      ? () => [
          (users !== undefined || typing !== undefined) && [`${users !== undefined ? "users" : "typing"} is not a prop; who is writing is people`, '<TypingIndicator people={[{ name: "Ned Land", src: ned }]} />'],
          visible !== undefined && ["visible is not a prop; it shows while people has anyone in it", "<TypingIndicator people={writing ? [ned] : []} />"],
        ]
      : /* istanbul ignore next @preserve -- production only */ undefined,
  );
  const words = people.length > 0 ? label(people.map((person) => person.name)) : "";
  return (
    <div
      {...rest}
      role="status"
      data-ouro="typing-indicator"
      data-writing={people.length > 0 ? "" : undefined}
      className={cn("box-border flex h-6 min-w-0 items-center gap-2 text-xs text-muted-foreground", className)}
    >
      {people.length > 0 && (
        <>
          <span aria-hidden="true" className="flex shrink-0 items-center *:shadow-[0_0_0_2px_var(--ouro-avatar-ring,var(--background))] *:not-first:-ms-1.5">
            {people.slice(0, 3).map((person, index) => (
              <Avatar key={`${person.name}-${index}`} name={person.name} src={person.src} idForColor={person.idForColor} initials={[...(person.initials ?? person.name.trim().toUpperCase())][0]} size="xs" alt="" />
            ))}
          </span>
          <span aria-hidden="true" data-ouro-typing-dots="" className="inline-flex shrink-0 items-center gap-0.5">
            <span className={dot} />
            <span className={dot} style={{ animationDelay: "0.2s" }} />
            <span className={dot} style={{ animationDelay: "0.4s" }} />
          </span>
        </>
      )}
      <span data-ouro-typing-words="" className="min-w-0 truncate">
        {words}
      </span>
    </div>
  );
}
