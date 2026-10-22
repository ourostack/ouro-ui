"use client";

import { useId, type HTMLAttributes, type JSX, type ReactNode, type Ref } from "react";
import { Badge } from "@/registry/ouro/components/ouro/badge/badge";
import { useAppearanceClassNameCheck } from "@/registry/ouro/lib/ouro/class-name-check";
import { cn } from "@/registry/ouro/lib/ouro/cn";
import { toneWarning } from "@/registry/ouro/lib/ouro/tones";
import { useDevWarnings } from "@/registry/ouro/lib/ouro/use-dev-messages";

/** Where a meeting is in the day: over, happening now, or still to come. */
export type MeetingState = "past" | "now" | "upcoming";

/** The props MeetingRow adds to the `<article>` attributes it passes through. */
export interface MeetingRowOwnProps {
  /** The meeting's title. */
  title: string;
  /** When it starts, already formatted ("10:00", "9:30 AM"). */
  time: string;
  /** The start as a machine-readable date and time ("2026-06-01T10:00"), for the `<time>` element. */
  dateTime?: string | undefined;
  /** How long, already formatted ("30 min"), under the time. */
  duration?: string | undefined;
  /** `past` rows are quieter, and a `now` row is marked and called out. */
  state: MeetingState | (string & { 'Use "past", "now" or "upcoming"': never });
  /** The person's part or answer as a short label ("Organizer", "Tentative", "Declined"). Leave it out for a plain yes. */
  status?: string | undefined;
  /**
   * The status badge's color role from the theme, named after its token.
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
  /** One quiet line under the title ("Ada Lovelace", "Starts in 5 min", "Room 4"). */
  detail?: ReactNode;
  /** Buttons for the meeting, such as Join and Chat. */
  actions?: ReactNode;
  /** The badge on a meeting happening now, for other languages. @default "Now" */
  nowLabel?: string | undefined;
  /** Layout only: margins, grid placement (`mt-1`). Appearance classes warn in development. */
  className?: string | undefined;
  ref?: Ref<HTMLElement> | undefined;

  /** Not a prop. The meeting's title is `title`: `<MeetingRow title="Weekly sync">`. */
  subject?: { 'Use title="Weekly sync"': never };
  /** Not a prop. The start is `time`: `<MeetingRow time="10:00">`. */
  start?: { 'Use time="10:00", and dateTime for the machine-readable start': never };
}

/** Props for {@link MeetingRow}: its own props and the `<article>` attributes it passes through. */
export type MeetingRowProps = Omit<HTMLAttributes<HTMLElement>, keyof MeetingRowOwnProps | "children"> & MeetingRowOwnProps;

// The states other than upcoming; anything else is upcoming.
const states: readonly string[] = ["past", "now"];
const tones = ["primary", "secondary", "destructive", "success", "warning"] as const;
type Tone = (typeof tones)[number];
/** Tones' development message, about `statusTone`. */
function statusToneWarning(value: string): readonly [string, string] {
  const [problem, fix] = toneWarning("MeetingRow", value, tones);
  return [`status${problem.replace("tone=", "Tone=")}`, fix.replace(" tone=", " statusTone=")];
}

const quiet = "text-[color-mix(in_oklab,var(--muted-foreground)_80%,var(--foreground))]";

/**
 * One meeting in an agenda: when it starts and for how long, its title, the person's part or
 * answer, one more line and its actions (Join, Chat). A meeting happening now is marked
 * "Now", with a bar at its start edge, and past meetings are quieter, in text that keeps its
 * contrast.
 * Screen readers hear the row by its time and title, and "Now" when it is happening.
 *
 * Use `Item` instead for a row that is not tied to a time, and `Calendar` to choose a date.
 *
 * @group Lists
 * @see https://ourostack.github.io/ouro-ui/docs/meeting-row
 *
 * @example
 * <MeetingRow title="Weekly sync" time="10:00" duration="30 min" state="now" actions={<Button href={joinUrl}>Join</Button>} />
 * @claim "Screen readers hear the row by" registry/ouro/components/ouro/meeting-row/meeting-row.test.tsx verify:testExists(registry/ouro/components/ouro/meeting-row/meeting-row.test.tsx::MeetingRow > is an article named by its time and title, and Now while it is happening)
 * @claim "past meetings are quieter, in text" registry/ouro/components/ouro/meeting-row/meeting-row.test.tsx verify:testExists(registry/ouro/components/ouro/meeting-row/meeting-row.test.tsx::MeetingRow > quiets a past meeting with color, not opacity)
 */
export function MeetingRow(props: MeetingRowProps): JSX.Element {
  const {
    title,
    time,
    dateTime,
    duration,
    state: stateProp,
    status,
    statusTone: toneProp = "secondary",
    detail,
    actions,
    nowLabel = "Now",
    className,
    // Guard props (hint types), dropped here so they never reach the DOM.
    subject,
    start,
    ...rest
  } = props;
  const state = states.includes(stateProp) ? (stateProp as MeetingState) : "upcoming";
  const tone: Tone = (tones as readonly string[]).includes(toneProp) ? (toneProp as Tone) : "secondary";
  const id = useId();
  useAppearanceClassNameCheck(
    "MeetingRow",
    className,
    process.env.NODE_ENV !== "production"
      ? (token: string) => `remove "${token}"; MeetingRow takes its colors from the theme and its state`
      : // Stryker disable next-line StringLiteral: production only; the check never runs there.
        /* istanbul ignore next @preserve -- production only */ "",
  );
  useDevWarnings(
    "MeetingRow",
    process.env.NODE_ENV !== "production"
      ? () => [
          title === undefined && ["title is missing, so the row does not say which meeting it is", '<MeetingRow title="Weekly sync" time="10:00" state="upcoming">'],
          state !== stateProp && [`state="${String(stateProp)}" is not a state; use "past", "now" or "upcoming"`, '<MeetingRow state="upcoming">'],
          tone !== toneProp && statusToneWarning(String(toneProp)),
          subject !== undefined && ["subject is not a prop", '<MeetingRow title="Weekly sync">'],
          start !== undefined && ["start is not a prop; the start is time, and dateTime for the machine-readable start", '<MeetingRow time="10:00" dateTime="2026-06-01T10:00">'],
        ]
      : /* istanbul ignore next @preserve -- production only */ undefined,
  );

  const now = state === "now";
  return (
    <article
      {...rest}
      data-ouro="meeting-row"
      data-state={state}
      aria-labelledby={`${id}-time ${id}-title${now ? ` ${id}-now` : ""}`}
      className={cn(
        "relative box-border flex min-w-0 items-start gap-3 rounded-md px-2 py-1.5",
        now && "before:absolute before:inset-y-1.5 before:start-0 before:w-0.5 before:rounded-full before:bg-success forced-colors:before:bg-[CanvasText]",
        className,
      )}
    >
      <span className={cn("flex w-16 shrink-0 flex-col pt-0.5 text-xs tabular-nums", quiet)}>
        {dateTime ? (
          <time id={`${id}-time`} dateTime={dateTime}>
            {time}
          </time>
        ) : (
          <span id={`${id}-time`}>{time}</span>
        )}
        {duration && <span>{duration}</span>}
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span id={`${id}-title`} className={cn("line-clamp-2 text-sm font-semibold [overflow-wrap:anywhere]", state === "past" ? quiet : "text-foreground")}>
          {title}
        </span>
        {(now || status) && (
          <span className="flex flex-wrap items-center gap-1">
            {now && (
              <Badge id={`${id}-now`} tone="success" variant="soft">
                {nowLabel}
              </Badge>
            )}
            {status && (
              <Badge tone={tone} variant="outline">
                {status}
              </Badge>
            )}
          </span>
        )}
        {detail !== undefined && detail !== null && <span className={cn("truncate text-xs", quiet)}>{detail}</span>}
        {actions !== undefined && actions !== null && <span className="flex flex-wrap gap-1 pt-0.5">{actions}</span>}
      </span>
    </article>
  );
}
