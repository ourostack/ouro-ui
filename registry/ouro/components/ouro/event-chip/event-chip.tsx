"use client";

import type { JSX, MouseEventHandler, ReactNode, Ref } from "react";
import { Badge, type BadgeProps } from "@/registry/ouro/components/ouro/badge/badge";
import { useAppearanceClassNameCheck } from "@/registry/ouro/lib/ouro/class-name-check";
import { cn } from "@/registry/ouro/lib/ouro/cn";
import { toneWarning } from "@/registry/ouro/lib/ouro/tones";
import { useDevWarnings } from "@/registry/ouro/lib/ouro/use-dev-messages";

/** How near the event is: still to come, starting soon, or happening now. */
export type EventChipState = "upcoming" | "soon" | "now";

/** Props for {@link EventChip}. */
export interface EventChipProps {
  /** The event's title, cut to one line ("Weekly sync"). */
  title: string;
  /** When, already formatted ("in 12 min", "Tomorrow 9:00"); pass `<RelativeTime>` for one that keeps itself current. */
  when: ReactNode;
  /** `soon` and `now` draw the chip's border and time in the primary color. @default "upcoming" */
  state?: EventChipState | (string & { 'Use "upcoming", "soon" or "now"': never }) | undefined;
  /** Where the person stands with it, as a short label after a dot ("Ready", "Needs you"). */
  status?: string | undefined;
  /**
   * The status dot's color role from the theme, named after its token.
   * @default "secondary"
   */
  statusTone?:
    | "primary"
    | "secondary"
    | "destructive"
    | "success"
    | "warning"
    | (string & { 'danger is "destructive"; accent is "primary"; neutral is "secondary"': never })
    | undefined;
  /** What the chip is, read first by screen readers ("Next meeting"). */
  label?: string | undefined;
  /** Makes the chip a link to the event, as Badge's `href`. */
  href?: string | undefined;
  /** Makes the chip a button, such as one that opens the event's briefing. */
  onClick?: MouseEventHandler<HTMLElement> | undefined;
  /** Layout only: margins, a maximum width (`max-w-80`). Appearance classes warn in development. */
  className?: string | undefined;
  ref?: Ref<HTMLElement> | undefined;

  /** Not a prop. The event's title is `title`: `<EventChip title="Weekly sync">`. */
  subject?: { 'Use title="Weekly sync"': never };
  /** Not a prop. The chip opens through `onClick` or `href`: `<EventChip onClick={open}>`. */
  onOpen?: { 'Use onClick={open}, or href for a link': never };
  /** Not a prop. How near it is, is `state`: `<EventChip state="soon">`. */
  soon?: { 'Use state="soon"': never };
}

const tones = ["primary", "secondary", "destructive", "success", "warning"] as const;
type Tone = (typeof tones)[number];
const dots: Record<Tone, string> = {
  primary: "bg-primary",
  secondary: "bg-muted-foreground",
  destructive: "bg-destructive",
  success: "bg-success",
  warning: "bg-warning",
};
const quiet = "text-[color-mix(in_oklab,var(--muted-foreground)_80%,var(--foreground))]";

/** Tones' development message, about `statusTone`. */
function statusToneWarning(value: string): readonly [string, string] {
  const [problem, fix] = toneWarning("EventChip", value, tones);
  return [`status${problem.replace("tone=", "Tone=")}`, fix.replace(" tone=", " statusTone=")];
}

/**
 * An upcoming event as a small chip that leads to it: how soon it starts, its title cut to one
 * line, and where the person stands with it after a dot ("Needs you"). Starting soon or happening
 * now draws its border and time in the primary color. It is a `Badge`, so `onClick` makes it a
 * button and `href` a link (without either it is a static label), with Badge's touch target and
 * press feedback, and screen readers hear its `label`, time, title and status in order. Pass
 * `<RelativeTime>` as `when` to keep the time current.
 *
 * Use `MeetingRow` instead for the event in a list, and `Badge` for a label that is not an event.
 *
 * @group Display
 * @see https://ourostack.github.io/ouro-ui/docs/event-chip
 *
 * @example
 * <EventChip label="Next meeting" when="in 12 min" title="Weekly sync" state="soon" status="Needs you" statusTone="warning" onClick={openBriefing} />
 * @claim "screen readers hear its `label`, time" registry/ouro/components/ouro/event-chip/event-chip.test.tsx verify:testExists(registry/ouro/components/ouro/event-chip/event-chip.test.tsx::EventChip > is a button named by its label, time, title and status)
 * @claim "Starting soon or happening now draws" registry/ouro/components/ouro/event-chip/event-chip.test.tsx verify:testExists(registry/ouro/components/ouro/event-chip/event-chip.test.tsx::EventChip > draws the border and time in the primary color when soon or now)
 */
export function EventChip(props: EventChipProps): JSX.Element {
  const {
    title,
    when,
    state: stateProp = "upcoming",
    status,
    statusTone: toneProp = "secondary",
    label,
    href,
    onClick,
    className,
    ref,
    // Guard props (hint types), dropped here so they never reach the DOM.
    subject,
    onOpen,
    soon,
  } = props;
  const state: EventChipState = stateProp === "soon" || stateProp === "now" ? (stateProp as EventChipState) : "upcoming";
  const tone: Tone = (tones as readonly string[]).includes(toneProp) ? (toneProp as Tone) : "secondary";
  useAppearanceClassNameCheck(
    "EventChip",
    className,
    process.env.NODE_ENV !== "production"
      ? (token: string) => `remove "${token}"; EventChip takes its colors from its state and statusTone`
      : // Stryker disable next-line StringLiteral: production only; the check never runs there.
        /* istanbul ignore next @preserve -- production only */ "",
  );
  useDevWarnings(
    "EventChip",
    process.env.NODE_ENV !== "production"
      ? () => [
          title === undefined && ["title is missing, so the chip does not say which event it is", '<EventChip title="Weekly sync" when="in 12 min">'],
          state !== stateProp && [`state="${String(stateProp)}" is not a state; use "upcoming", "soon" or "now"`, '<EventChip state="soon">'],
          tone !== toneProp && statusToneWarning(String(toneProp)),
          subject !== undefined && ["subject is not a prop", '<EventChip title="Weekly sync">'],
          onOpen !== undefined && ["onOpen is not a prop", "<EventChip onClick={open}>"],
          soon !== undefined && ["soon is not a prop", '<EventChip state="soon">'],
        ]
      : /* istanbul ignore next @preserve -- production only */ undefined,
  );

  const near = state !== "upcoming";
  const content = (
    <>
      {label && <span className="sr-only">{label}: </span>}
      <span data-ouro-event-when="" className={cn("shrink-0 font-semibold tabular-nums", near ? "text-primary" : quiet)}>
        {when}
      </span>
      <span data-ouro-event-title="" className="min-w-0 truncate">
        {title}
      </span>
      {status && (
        <span data-ouro-event-status="" className={cn("inline-flex shrink-0 items-center gap-1", quiet)}>
          <span aria-hidden="true" className={cn("size-1.5 rounded-full forced-colors:bg-[CanvasText]", dots[tone])} />
          <span className="sr-only">, </span>
          {status}
        </span>
      )}
    </>
  );
  // Badge makes a link of an `href`, a button of an `onClick`, and a label of neither.
  const chip = {
    tone: near ? "primary" : "secondary",
    variant: "outline",
    href,
    onClick,
    ref,
    "data-ouro-event-chip": "",
    "data-state": state,
    className: cn("max-w-full min-w-0 gap-2", className),
    children: content,
  } as BadgeProps;
  return <Badge {...chip} />;
}
