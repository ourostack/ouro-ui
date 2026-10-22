"use client";

import { useId, type HTMLAttributes, type JSX, type ReactNode, type Ref } from "react";
import { Badge } from "@/registry/ouro/components/ouro/badge/badge";
import { useAppearanceClassNameCheck } from "@/registry/ouro/lib/ouro/class-name-check";
import { cn } from "@/registry/ouro/lib/ouro/cn";
import { toneWarning } from "@/registry/ouro/lib/ouro/tones";
import { useDevWarnings } from "@/registry/ouro/lib/ouro/use-dev-messages";

/** One labelled row of a {@link BriefingCard}. */
export interface BriefingCardItem {
  /** Identifies the row. */
  id: string;
  /** A short word in the margin ("Chat", "Last time", "Waiting on you"). */
  label: string;
  /** What to show: a count and a line, links, small buttons. A row with nothing in it is left out. */
  content: ReactNode;
}

/** The props BriefingCard adds to the `<section>` attributes it passes through. */
export interface BriefingCardOwnProps {
  /** What the briefing is about, its heading and its name for screen readers ("Weekly sync"). */
  title: string;
  /** One quiet line under the title ("In 25 min · 6 people"). */
  detail?: ReactNode;
  /** Where things stand, as a short label in a badge before the title ("Needs you", "Up to date"). */
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
  /** The briefing's labelled rows, shown as a description list. */
  items: readonly BriefingCardItem[];
  /** An agent's note about it, under the rows: an `AgentNote`, or a hint on how to get one. */
  note?: ReactNode;
  /** One row of actions at the end ("Open chat"). */
  actions?: ReactNode;
  /** The heading level of the title, for the page's outline. @default 3 */
  headingLevel?: 2 | 3 | 4 | 5 | 6 | undefined;
  /** Layout only: margins, width, grid placement (`mt-2`). Appearance classes warn in development. */
  className?: string | undefined;
  ref?: Ref<HTMLElement> | undefined;

  /** Not a prop. The rows are `items`: `<BriefingCard items={rows}>`. */
  sections?: { 'Use items={rows}': never };
  /** Not a prop. The title is `title`: `<BriefingCard title="Weekly sync">`. */
  heading?: { 'Use title="Weekly sync"': never };
}

/** Props for {@link BriefingCard}: its own props and the `<section>` attributes it passes through. */
export type BriefingCardProps = Omit<HTMLAttributes<HTMLElement>, keyof BriefingCardOwnProps | "children"> & BriefingCardOwnProps;

const tones = ["primary", "secondary", "destructive", "success", "warning"] as const;
type Tone = (typeof tones)[number];
const quiet = "text-[color-mix(in_oklab,var(--muted-foreground)_80%,var(--foreground))]";

/** Tones' development message, about `statusTone`. */
function statusToneWarning(value: string): readonly [string, string] {
  const [problem, fix] = toneWarning("BriefingCard", value, tones);
  return [`status${problem.replace("tone=", "Tone=")}`, fix.replace(" tone=", " statusTone=")];
}

/**
 * A card of what the person needs to know before they act on one thing. That thing may be a
 * meeting, a customer or a handover; the card holds a status badge and the title, a quiet
 * line, labelled rows of counts, links and small buttons, an agent's note, and a row of actions. The card is a region named by
 * its title, the title is a heading, and the rows are a description list, so screen readers hear
 * each label with its content. Rows with nothing in them are left out.
 *
 * Use `Card` instead for content of your own shape, and `DescriptionList` for a plain list of
 * details.
 *
 * @group Display
 * @see https://ourostack.github.io/ouro-ui/docs/briefing-card
 *
 * @example
 * <BriefingCard
 *   title="Weekly sync"
 *   detail="In 25 min · 6 people"
 *   status="Needs you"
 *   statusTone="warning"
 *   items={[{ id: "chat", label: "Chat", content: "2 new · 1 asks you" }]}
 *   note={<AgentNote text={note.text} author="agent" name="Ouro" />}
 *   actions={<Button size="sm">Open chat</Button>}
 * />
 * @claim "The card is a region named" registry/ouro/components/ouro/briefing-card/briefing-card.test.tsx verify:testExists(registry/ouro/components/ouro/briefing-card/briefing-card.test.tsx::BriefingCard > is a region named by its title, with the title as a heading)
 * @claim "the rows are a description list" registry/ouro/components/ouro/briefing-card/briefing-card.test.tsx verify:testExists(registry/ouro/components/ouro/briefing-card/briefing-card.test.tsx::BriefingCard > lists the rows as terms and details, leaving out empty rows)
 */
export function BriefingCard(props: BriefingCardProps): JSX.Element {
  const {
    title,
    detail,
    status,
    statusTone: toneProp = "secondary",
    items,
    note,
    actions,
    headingLevel = 3,
    className,
    // Guard props (hint types), dropped here so they never reach the DOM.
    sections,
    heading,
    ...rest
  } = props;
  const tone: Tone = (tones as readonly string[]).includes(toneProp) ? (toneProp as Tone) : "secondary";
  const id = useId();
  // Stryker disable next-line ArrayDeclaration: a stand-in item has no content, so it is left out like none.
  const rows = (items ?? []).filter((item) => item.content !== null && item.content !== undefined && item.content !== false && item.content !== "");
  useAppearanceClassNameCheck(
    "BriefingCard",
    className,
    process.env.NODE_ENV !== "production"
      ? (token: string) => `remove "${token}"; BriefingCard takes its colors from the theme and its statusTone`
      : // Stryker disable next-line StringLiteral: production only; the check never runs there.
        /* istanbul ignore next @preserve -- production only */ "",
  );
  useDevWarnings(
    "BriefingCard",
    process.env.NODE_ENV !== "production"
      ? () => [
          title === undefined && ["title is missing, so the card has no heading or name", '<BriefingCard title="Weekly sync" items={rows}>'],
          tone !== toneProp && statusToneWarning(String(toneProp)),
          sections !== undefined && ["sections is not a prop", "<BriefingCard items={rows}>"],
          heading !== undefined && ["heading is not a prop", '<BriefingCard title="Weekly sync">'],
        ]
      : /* istanbul ignore next @preserve -- production only */ undefined,
  );

  const Heading = `h${headingLevel}` as const;
  return (
    <section
      {...rest}
      data-ouro="briefing-card"
      aria-labelledby={`${id}-title`}
      className={cn("box-border flex min-w-0 flex-col gap-3 rounded-xl border border-solid border-border bg-card p-3 text-card-foreground", className)}
    >
      <div className="flex min-w-0 flex-col gap-0.5">
        <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
          {status && (
            <Badge tone={tone} variant="soft">
              {status}
            </Badge>
          )}
          <Heading id={`${id}-title`} className="m-0 min-w-0 font-[family-name:var(--font-heading,inherit)] text-sm font-semibold [overflow-wrap:anywhere] text-foreground">
            {title}
          </Heading>
        </div>
        {detail !== undefined && detail !== null && <p className={cn("m-0 text-xs", quiet)}>{detail}</p>}
      </div>
      {rows.length > 0 && (
        <dl className="m-0 grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-2 text-sm">
          {rows.map((row) => (
            <div key={row.id} className="contents">
              <dt className={cn("pt-0.5 text-xs", quiet)}>{row.label}</dt>
              <dd className="m-0 flex min-w-0 flex-col gap-1 text-foreground">{row.content}</dd>
            </div>
          ))}
        </dl>
      )}
      {note !== undefined && note !== null && <div className="min-w-0">{note}</div>}
      {actions !== undefined && actions !== null && <div className="flex flex-wrap items-center gap-1">{actions}</div>}
    </section>
  );
}
