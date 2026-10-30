"use client";

import { useId, type HTMLAttributes, type JSX, type ReactNode, type Ref } from "react";
import { Badge } from "@/registry/ouro/components/ouro/badge/badge";
import { useAppearanceClassNameCheck } from "@/registry/ouro/lib/ouro/class-name-check";
import { cn } from "@/registry/ouro/lib/ouro/cn";
import { toneWarning } from "@/registry/ouro/lib/ouro/tones";
import { TouchTarget } from "@/registry/ouro/lib/ouro/touch-target";
import { useDevWarnings } from "@/registry/ouro/lib/ouro/use-dev-messages";

/** The props AttentionCard adds to the `<article>` attributes it passes through. */
export interface AttentionCardOwnProps {
  /** Why it needs the person, as a short label in a badge ("Mentioned you", "Asked you"). */
  reason: string;
  /**
   * The badge's color role from the theme, named after its token: `warning` for a question
   * that waits on an answer, `secondary` for something quieter.
   * @default "primary"
   */
  tone?:
    | "primary"
    | "secondary"
    | "destructive"
    | "success"
    | "warning"
    | (string & { 'danger is "destructive"; accent is "primary"; neutral is "secondary"': never })
    | undefined;
  /** Where it happened: the conversation, thread or document's name. */
  title: string;
  /** Who is asking. Their name comes before the message. */
  from: string;
  /** When, already formatted ("9:41", `<RelativeTime>`). */
  time?: ReactNode;
  /**
   * What they wrote, cut to two lines.
   *
   * @claim "What they wrote, cut to two" registry/ouro/components/ouro/attention-card/attention-card.test.tsx verify:testExists(registry/ouro/components/ouro/attention-card/attention-card.test.tsx::AttentionCard > cuts a long message to two lines)
   */
  children?: ReactNode;
  /** Makes the message a button that opens where it happened. */
  onOpen?: (() => void) | undefined;
  /** Buttons under the message, such as a quick reply or Dismiss. */
  actions?: ReactNode;
  /** Layout only: width, margins, grid placement (`mt-2`). Appearance classes warn in development; use `tone`. */
  className?: string | undefined;
  ref?: Ref<HTMLElement> | undefined;

  /** Not a prop. What they wrote is the children: `<AttentionCard reason="Asked you" title="Review" from="Ada">Can you review?</AttentionCard>`. */
  message?: { 'Use <AttentionCard reason="Asked you" title="Review" from="Ada">Can you review?</AttentionCard>': never };
  /** Not a prop. What they wrote is the children: `<AttentionCard reason="Asked you" title="Review" from="Ada">Can you review?</AttentionCard>`. */
  text?: { 'Use <AttentionCard reason="Asked you" title="Review" from="Ada">Can you review?</AttentionCard>': never };
  /** Not a prop. The message opens with `onOpen`: `<AttentionCard onOpen={open}>`. */
  onClick?: { 'Use onOpen={open}': never };
}

/** Props for {@link AttentionCard}: its own props and the `<article>` attributes it passes through. */
export type AttentionCardProps = Omit<HTMLAttributes<HTMLElement>, keyof AttentionCardOwnProps> & AttentionCardOwnProps;

const tones = ["primary", "secondary", "destructive", "success", "warning"] as const;
type Tone = (typeof tones)[number];
const quiet = "text-[color-mix(in_oklab,var(--muted-foreground)_80%,var(--foreground))]";

const open =
  "press relative box-border block w-full min-w-0 cursor-pointer rounded-md border-0 bg-transparent p-0 text-start text-inherit " +
  "touch-manipulation [-webkit-tap-highlight-color:transparent] outline-ring outline-offset-2 focus-visible:outline-2 focus-visible:outline-solid " +
  "pointer-fine:hover:underline pointer-fine:hover:underline-offset-4";

/**
 * Something that waits on the person: a mention, a question asked of them or a request
 * still unanswered. A badge says why, then where and when, who is asking and what they
 * wrote, with buttons to act on it. Screen readers hear the card by its reason and where
 * it happened ("Asked you, Design review"). With `onOpen` the message is a button that
 * opens where it happened.
 *
 * Use `Message` instead for a message inside its conversation, `Alert` for a notice from
 * the app itself, and `Item` for a row in a plain list.
 *
 * @group Chat
 * @see https://ui.ouro.bot/docs/attention-card
 *
 * @example
 * <AttentionCard reason="Asked you" tone="warning" title="Design review" from="Ada Lovelace" time="9:41" onOpen={open}>
 *   Can you look at the second draft before noon?
 * </AttentionCard>
 * @claim "Screen readers hear the card by" registry/ouro/components/ouro/attention-card/attention-card.test.tsx verify:testExists(registry/ouro/components/ouro/attention-card/attention-card.test.tsx::AttentionCard > is an article named by its reason and where it happened)
 */
export function AttentionCard(props: AttentionCardProps): JSX.Element {
  const {
    reason,
    tone: toneProp = "primary",
    title,
    from,
    time,
    children,
    onOpen,
    actions,
    className,
    // Guard props (hint types), dropped here so they never reach the DOM.
    message,
    text,
    onClick,
    ...rest
  } = props;
  const tone: Tone = (tones as readonly string[]).includes(toneProp) ? (toneProp as Tone) : "primary";
  const id = useId();
  useAppearanceClassNameCheck(
    "AttentionCard",
    className,
    process.env.NODE_ENV !== "production"
      ? (token: string) => `remove "${token}"; the badge's color is tone`
      : // Stryker disable next-line StringLiteral: production only; the check never runs there.
        /* istanbul ignore next @preserve -- production only */ "",
  );
  useDevWarnings(
    "AttentionCard",
    process.env.NODE_ENV !== "production"
      ? () => [
          reason === undefined && ["reason is missing, so the card does not say why it needs the person", '<AttentionCard reason="Asked you" title="Design review" from="Ada">'],
          title === undefined && ["title is missing, so the card does not say where it happened", '<AttentionCard reason="Asked you" title="Design review" from="Ada">'],
          from === undefined && ["from is missing, so the card does not say who is asking", '<AttentionCard reason="Asked you" title="Design review" from="Ada">'],
          tone !== toneProp && toneWarning("AttentionCard", String(toneProp), tones),
          (message !== undefined || text !== undefined) && [
            `${message !== undefined ? "message" : "text"} is not a prop; what they wrote is the children`,
            '<AttentionCard reason="Asked you" title="Review" from="Ada">Can you review?</AttentionCard>',
          ],
          onClick !== undefined && ["onClick is not a prop; the message opens with onOpen", "<AttentionCard onOpen={open}>"],
        ]
      : /* istanbul ignore next @preserve -- production only */ undefined,
  );

  const body = (
    <span data-ouro-attention-message="" className="line-clamp-2 text-sm [overflow-wrap:anywhere]">
      <span className="font-semibold">{from}:</span> {children}
    </span>
  );
  return (
    <article
      {...rest}
      data-ouro="attention-card"
      aria-labelledby={`${id}-reason ${id}-title`}
      className={cn("box-border flex min-w-0 flex-col gap-1.5 rounded-xl border border-solid border-border bg-card p-3 text-card-foreground", className)}
    >
      <div className="flex min-w-0 items-center gap-2">
        <Badge id={`${id}-reason`} tone={tone} variant="soft">
          {reason}
        </Badge>
        <span id={`${id}-title`} className="min-w-0 truncate text-sm font-semibold">
          {title}
        </span>
        {time !== undefined && time !== null && <span className={cn("ms-auto shrink-0 text-xs", quiet)}>{time}</span>}
      </div>
      {onOpen ? (
        <button type="button" data-ouro-control="attention-card" data-ouro-part="open" onClick={onOpen} className={open}>
          <TouchTarget />
          {body}
        </button>
      ) : (
        body
      )}
      {actions !== undefined && actions !== null && <div className="flex flex-wrap items-center gap-2 pt-1">{actions}</div>}
    </article>
  );
}
