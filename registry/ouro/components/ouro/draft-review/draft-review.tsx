"use client";

import { useId, useLayoutEffect, useRef, useState, type HTMLAttributes, type JSX, type MouseEvent, type ReactNode, type Ref } from "react";
import { Badge } from "@/registry/ouro/components/ouro/badge/badge";
import { Button } from "@/registry/ouro/components/ouro/button/button";
import { useAppearanceClassNameCheck } from "@/registry/ouro/lib/ouro/class-name-check";
import { cn } from "@/registry/ouro/lib/ouro/cn";
import { useFocusHandoff } from "@/registry/ouro/lib/ouro/focus-handoff";
import { useMergedRef } from "@/registry/ouro/lib/ouro/refs";
import { useDevWarnings } from "@/registry/ouro/lib/ouro/use-dev-messages";

/** A run of the draft under review: unchanged, put in by a change, or taken out by one. */
export interface DraftReviewSegment {
  /** `same` is unchanged text; `insert` is what a change put in; `delete` is what it took out. */
  kind: "same" | "insert" | "delete";
  /** The run's text. */
  text: string;
  /** The `id` of the change an `insert` or `delete` belongs to. */
  changeId?: string | undefined;
}

/** One pending change to the draft, with who made it and what it was based on. */
export interface DraftChange {
  /** Identifies the change; `onAccept` and `onReject` receive it. */
  id: string;
  /** A person or an agent. An agent's change is marked as the agent's, in the text and in its row. */
  author: "human" | "agent";
  /** Who made it ("Ouro", "Ada Lovelace"). */
  name: string;
  /** When, already formatted ("2 min ago", `<RelativeTime>`). */
  time?: ReactNode;
  /** What it was based on, already worded ("Based on 3 messages"). With `onShowSource`, a Show button follows it. */
  source?: ReactNode;
}

/** The props DraftReview adds to the `<section>` attributes it passes through. */
export interface DraftReviewOwnProps {
  /** The draft with the changes in place, in reading order. */
  segments: readonly DraftReviewSegment[];
  /** The pending changes, in reading order. They are numbered in that order, in the text and in the list. */
  changes: readonly DraftChange[];
  /**
   * Called when the person accepts a change. The click event comes second, so the app can
   * check `event.isTrusted` and act only on a person's click: accepting is a person's decision.
   * Return the save's promise when it is saved later: the change stays decided until it settles.
   */
  onAccept: (id: string, event: MouseEvent<HTMLElement>) => unknown;
  /** Called when the person rejects a change, with the click event to check, as `onAccept`. */
  onReject: (id: string, event: MouseEvent<HTMLElement>) => unknown;
  /**
   * Adds Accept all while there is more than one change.
   * @claim "Adds Accept all while there is" registry/ouro/components/ouro/draft-review/draft-review.test.tsx verify:testExists(registry/ouro/components/ouro/draft-review/draft-review.test.tsx::DraftReview > offers Accept all and Reject all only while there is more than one change)
   */
  onAcceptAll?: ((event: MouseEvent<HTMLElement>) => unknown) | undefined;
  /**
   * Adds Reject all while there is more than one change.
   * @claim "Adds Reject all while there is" registry/ouro/components/ouro/draft-review/draft-review.test.tsx verify:testExists(registry/ouro/components/ouro/draft-review/draft-review.test.tsx::DraftReview > offers Accept all and Reject all only while there is more than one change)
   */
  onRejectAll?: ((event: MouseEvent<HTMLElement>) => unknown) | undefined;
  /** Adds Show after a change's `source`, to show what it was based on. */
  onShowSource?: ((id: string) => void) | undefined;
  /** What screen readers hear for the review. Without it, the review is named by its heading. */
  label?: string | undefined;
  /** The heading. @default "1 change to review" or "3 changes to review" */
  heading?: ReactNode;
  /** One quiet line after the heading ("Since you last edited"). */
  description?: ReactNode;
  /** More buttons at the end of the header, such as Approve. */
  actions?: ReactNode;
  /** The Accept button's word, for other languages. @default "Accept" */
  acceptLabel?: string | undefined;
  /** The Reject button's word, for other languages. @default "Reject" */
  rejectLabel?: string | undefined;
  /** The bulk accept button's words, for other languages. @default "Accept all" */
  acceptAllLabel?: string | undefined;
  /** The bulk reject button's words, for other languages. @default "Reject all" */
  rejectAllLabel?: string | undefined;
  /** The Show button's word, for other languages. @default "Show" */
  showSourceLabel?: string | undefined;
  /** The badge on an agent's change. @default "Agent" */
  agentLabel?: string | undefined;
  /** What screen readers hear before a change's text and after its buttons' words. @default (n) => `Change ${n}` */
  changeLabel?: ((n: number) => string) | undefined;
  /** What screen readers hear for put-in text. @default "added" */
  insertedLabel?: string | undefined;
  /** What screen readers hear for taken-out text. @default "removed" */
  deletedLabel?: string | undefined;
  /** Layout only: width, margins, grid placement (`mt-2`). Appearance classes warn in development. */
  className?: string | undefined;
  ref?: Ref<HTMLElement> | undefined;

  /** Not a prop. The text with the changes in place is `segments`: `<DraftReview segments={segments}>`. */
  diff?: { 'Use segments={segments}': never };
  /** Not a prop. Accepting calls `onAccept`: `<DraftReview onAccept={(id) => accept(id)}>`. */
  onApprove?: { 'Use onAccept={(id) => accept(id)}, and actions for a whole-draft Approve': never };
  /** Not a prop. Rejecting calls `onReject`: `<DraftReview onReject={(id) => reject(id)}>`. */
  onDecline?: { 'Use onReject={(id) => reject(id)}': never };
}

/** Props for {@link DraftReview}: its own props and the `<section>` attributes it passes through. */
export type DraftReviewProps = Omit<HTMLAttributes<HTMLElement>, keyof DraftReviewOwnProps | "children"> & DraftReviewOwnProps;

/** The decisions DraftReview keeps: see `DraftReview`. */
interface Decisions {
  /** The decided changes not yet gone, mapped to whether their save is pending. */
  ids: ReadonlyMap<string, boolean>;
  /** The changes a bulk press decided, and whether its save is pending. */
  bulk: { ids: readonly string[]; pending: boolean } | null;
  /** The `changes` these were last checked against. */
  changes: readonly DraftChange[];
}

const isPromise = (value: unknown): value is PromiseLike<unknown> => typeof (value as PromiseLike<unknown> | undefined)?.then === "function";

const quiet = "text-[color-mix(in_oklab,var(--muted-foreground)_80%,var(--foreground))]";
// An agent's text is tinted with the theme's primary color, as in DraftEditor, and underlined, so
// it never relies on color alone; a person's is underlined only, in the text's own color.
const inserted = {
  agent: "rounded-xs bg-[color-mix(in_oklab,var(--primary)_16%,transparent)] decoration-primary",
  human: "",
} as const;

/**
 * A shared draft's changes, to review one by one. It shows the draft with each change's new
 * text underlined (tinted when an agent wrote it) and its removed text struck through, each
 * numbered, then one row per change with who made it, when and what it was based on, and
 * Accept and Reject. Accept all and Reject all join them while there is more than one change.
 * Screen readers hear each change's number and whether it adds or removes text, and each
 * button names its change ("Accept, Change 2"). Accepting and rejecting are a person's
 * decisions: the callbacks receive the click event so the app can check it came from a
 * person, and an agent does not call them. A change is decided once: its buttons, and the bulk
 * ones after a bulk press, say they are unavailable (`aria-disabled`) and ignore presses until
 * the change leaves `changes`, or until the app keeps it (renders it again with no save of it
 * pending: return the save's promise from the callback). When a decided change leaves the
 * list, focus moves to the change now in its place. With no changes it renders nothing, and
 * focus moves to the next control after it; move it elsewhere, such as the draft, if you prefer.
 *
 * Use `DraftEditor` instead to write the draft together; DraftReview never edits text itself.
 *
 * @group Chat
 * @see https://ourostack.github.io/ouro-ui/docs/draft-review
 *
 * @example
 * <DraftReview segments={review.segments} changes={review.changes} onAccept={accept} onReject={reject} onAcceptAll={acceptAll} />
 * @claim "It shows the draft with each" registry/ouro/components/ouro/draft-review/draft-review.test.tsx verify:testExists(registry/ouro/components/ouro/draft-review/draft-review.test.tsx::DraftReview > numbers each change and tells screen readers whether it adds or removes text)
 * @claim "It shows the draft with each" registry/ouro/components/ouro/draft-review/draft-review.test.tsx verify:testExists(registry/ouro/components/ouro/draft-review/draft-review.test.tsx::DraftReview > tints an agent's added text and leaves a person's underlined only)
 * @claim "It shows the draft with each" registry/ouro/components/ouro/draft-review/draft-review.test.tsx verify:testExists(registry/ouro/components/ouro/draft-review/draft-review.test.tsx::DraftReview > says who made each change, marking an agent's, with when and what it was based on)
 * @claim "Accepting and rejecting are a person's" registry/ouro/components/ouro/draft-review/draft-review.test.tsx verify:testExists(registry/ouro/components/ouro/draft-review/draft-review.test.tsx::DraftReview > accepts and rejects one change, with buttons named by their change and the click event)
 * @claim "A change is decided once" registry/ouro/components/ouro/draft-review/draft-review.test.tsx verify:testExists(registry/ouro/components/ouro/draft-review/draft-review.test.tsx::DraftReview > decides a change once, however often or however it is pressed) verify:testExists(registry/ouro/components/ouro/draft-review/draft-review.test.tsx::DraftReview > decides every change once with Accept all or Reject all) verify:testExists(registry/ouro/components/ouro/draft-review/draft-review.test.tsx::DraftReview > keeps a change decided while its save is pending, and focus on the list once it leaves)
 * @claim "Screen readers hear each change's number" registry/ouro/components/ouro/draft-review/draft-review.test.tsx verify:testExists(registry/ouro/components/ouro/draft-review/draft-review.test.tsx::DraftReview > numbers each change and tells screen readers whether it adds or removes text)
 * @claim "each button names its change" registry/ouro/components/ouro/draft-review/draft-review.test.tsx verify:testExists(registry/ouro/components/ouro/draft-review/draft-review.test.tsx::DraftReview > accepts and rejects one change, with buttons named by their change and the click event)
 * @claim "When a decided change leaves the" registry/ouro/components/ouro/draft-review/draft-review.test.tsx verify:testExists(registry/ouro/components/ouro/draft-review/draft-review.test.tsx::DraftReview > keeps keyboard focus on the list as decided changes leave it)
 * @claim "With no changes it renders nothing" registry/ouro/components/ouro/draft-review/draft-review.test.tsx verify:testExists(registry/ouro/components/ouro/draft-review/draft-review.test.tsx::DraftReview > renders nothing with no changes)
 * @claim "focus moves to the next control after it" registry/ouro/components/ouro/draft-review/draft-review.test.tsx verify:testExists(registry/ouro/components/ouro/draft-review/draft-review.test.tsx::DraftReview > hands focus to the next control when a press empties the review)
 * @claim "Accept all and Reject all join" registry/ouro/components/ouro/draft-review/draft-review.test.tsx verify:testExists(registry/ouro/components/ouro/draft-review/draft-review.test.tsx::DraftReview > offers Accept all and Reject all only while there is more than one change)
 */
export function DraftReview(props: DraftReviewProps): JSX.Element | null {
  const {
    segments,
    changes,
    onAccept,
    onReject,
    onAcceptAll,
    onRejectAll,
    onShowSource,
    label,
    heading,
    description,
    actions,
    acceptLabel = "Accept",
    rejectLabel = "Reject",
    acceptAllLabel = "Accept all",
    rejectAllLabel = "Reject all",
    showSourceLabel = "Show",
    agentLabel = "Agent",
    changeLabel = (n: number) => `Change ${n}`,
    insertedLabel = "added",
    deletedLabel = "removed",
    className,
    // Guard props (hint types), dropped here so they never reach the DOM.
    diff,
    onApprove,
    onDecline,
    ref,
    ...rest
  } = props;
  const id = useId();
  const numbers = new Map(changes.map((change, index) => [change.id, index + 1]));
  const byId = new Map(changes.map((change) => [change.id, change]));
  // A change's number follows its last run in the text.
  const lastRun = new Map<string, number>();
  segments.forEach((segment, index) => {
    if (segment.kind !== "same") lastRun.set(segment.changeId!, index);
  });
  const unknown = segments.find((segment) => segment.kind !== "same" && !numbers.has(segment.changeId!));

  useAppearanceClassNameCheck(
    "DraftReview",
    className,
    process.env.NODE_ENV !== "production"
      ? (token: string) => `remove "${token}"; DraftReview takes its colors from the theme`
      : // Stryker disable next-line StringLiteral: production only; the check never runs there.
        /* istanbul ignore next @preserve -- production only */ "",
  );
  useDevWarnings(
    "DraftReview",
    process.env.NODE_ENV !== "production"
      ? () => [
          unknown !== undefined && [
            `${unknown.kind === "insert" ? "an insert" : "a delete"} run ${unknown.changeId === undefined ? "has no changeId" : `has changeId="${unknown.changeId}", which no change has`}, so it shows as unchanged text`,
            '<DraftReview segments={[{ kind: "insert", text: "Friday", changeId: "c1" }]} changes={[{ id: "c1", author: "agent", name: "Ouro" }]}>',
          ],
          diff !== undefined && ["diff is not a prop", "<DraftReview segments={segments}>"],
          onApprove !== undefined && ["onApprove is not a prop; accept a change with onAccept, and put a whole-draft Approve in actions", "<DraftReview onAccept={(id) => accept(id)}>"],
          onDecline !== undefined && ["onDecline is not a prop", "<DraftReview onReject={(id) => reject(id)}>"],
        ]
      : /* istanbul ignore next @preserve -- production only */ undefined,
  );

  // The changes decided and not yet gone, each with whether its save is pending (the callback
  // returned a promise not yet settled), and the bulk press, if any, with the changes it decided.
  // When `changes` comes anew, a change that is gone, or that the app kept with nothing pending,
  // is no longer decided.
  const [stored, setDecisions] = useState<Decisions>(() => ({ ids: new Map(), bulk: null, changes }));
  let decisions = stored;
  if (stored.changes !== changes) {
    const present = new Set(changes.map((change) => change.id));
    const bulk = stored.bulk?.pending && stored.bulk.ids.some((key) => present.has(key)) ? stored.bulk : null;
    decisions = { ids: new Map([...stored.ids].filter(([key, pending]) => pending && present.has(key))), bulk, changes };
    setDecisions(decisions);
  }
  // What the handlers read: the decisions rendered, and any made since, so a second press before
  // the next render is ignored too.
  const live = useRef(decisions);
  useLayoutEffect(() => {
    live.current = decisions;
  });
  // The change the person decided with focus on its button, and where it was in the list. When
  // it leaves, focus goes to the Accept of the change now in its place, or of the last one.
  const focusAt = useRef<{ id: string; index: number } | null>(null);
  const list = useRef<HTMLOListElement>(null);
  // When a press empties the review, focus moves to the next control after it.
  const section = useMergedRef(ref, useFocusHandoff<HTMLElement>());
  useLayoutEffect(() => {
    const at = focusAt.current;
    if (at === null) return;
    if (changes.some((change) => change.id === at.id)) {
      if (!live.current.ids.has(at.id)) focusAt.current = null;
      return;
    }
    focusAt.current = null;
    const active = document.activeElement;
    // With the last change decided the list is gone, and the section's handoff moves focus on.
    if (!list.current || (active !== null && active !== document.body && active.isConnected)) return;
    const rows = list.current.querySelectorAll<HTMLButtonElement>(":scope > li [data-ouro-part='accept']");
    rows[Math.min(at.index, rows.length - 1)]!.focus();
  }, [changes]);
  const record = (next: Decisions) => {
    live.current = next;
    setDecisions(next);
  };
  const decide = (change: DraftChange, index: number, event: MouseEvent<HTMLElement>, callback: typeof onAccept) => {
    if (live.current.ids.has(change.id) || live.current.bulk) return;
    if (event.currentTarget === document.activeElement) focusAt.current = { id: change.id, index };
    const ids = new Map(live.current.ids).set(change.id, false);
    record({ ...live.current, ids });
    const result = callback(change.id, event);
    if (!isPromise(result)) return;
    record({ ...live.current, ids: new Map(live.current.ids).set(change.id, true) });
    const done = () =>
      setDecisions((current) => {
        if (!current.ids.has(change.id)) return current;
        const ids = new Map(current.ids);
        // Settled with the change still there: the app kept it, so it can be decided again.
        if (current.changes.some((each) => each.id === change.id)) ids.delete(change.id);
        else ids.set(change.id, false);
        return { ...current, ids };
      });
    result.then(done, done);
  };
  const decideAll = (event: MouseEvent<HTMLElement>, callback: NonNullable<typeof onAcceptAll>) => {
    if (live.current.bulk) return;
    const press = { ids: changes.map((change) => change.id), pending: false };
    record({ ...live.current, bulk: press });
    const result = callback(event);
    if (!isPromise(result)) return;
    const pending = { ...press, pending: true };
    record({ ...live.current, bulk: pending });
    const done = () =>
      setDecisions((current) => {
        if (current.bulk !== pending) return current;
        const kept = pending.ids.some((key) => current.changes.some((each) => each.id === key));
        return { ...current, bulk: kept ? null : { ...pending, pending: false } };
      });
    result.then(done, done);
  };

  if (changes.length === 0) return null;
  const many = changes.length > 1;
  return (
    <section
      {...rest}
      ref={section}
      aria-label={label}
      aria-labelledby={label === undefined ? `${id}-heading` : undefined}
      data-ouro="draft-review"
      className={cn("box-border flex min-w-0 flex-col gap-3 rounded-xl border border-solid border-border bg-card p-3 text-card-foreground", className)}
    >
      <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
        <p id={`${id}-heading`} data-ouro-draft-review-heading="" className="m-0 text-sm font-semibold">{heading ?? `${changes.length} ${many ? "changes" : "change"} to review`}</p>
        {description !== undefined && description !== null && <span className={cn("text-xs", quiet)}>{description}</span>}
        {((many && (onAcceptAll || onRejectAll)) || (actions !== undefined && actions !== null)) && (
          <span className="ms-auto flex flex-wrap gap-1">
            {many && onAcceptAll && (
              <Button
                size="sm"
                variant="soft"
                data-ouro-control="draft-review"
                data-ouro-part="accept-all"
                aria-disabled={decisions.bulk ? true : undefined}
                onClick={(event) => decideAll(event, onAcceptAll)}
              >
                {acceptAllLabel}
              </Button>
            )}
            {many && onRejectAll && (
              <Button
                size="sm"
                variant="plain"
                tone="destructive"
                data-ouro-control="draft-review"
                data-ouro-part="reject-all"
                aria-disabled={decisions.bulk ? true : undefined}
                onClick={(event) => decideAll(event, onRejectAll)}
              >
                {rejectAllLabel}
              </Button>
            )}
            {actions}
          </span>
        )}
      </div>
      <p data-ouro-draft-review-text="" className="m-0 rounded-md bg-background p-2 text-sm break-words whitespace-pre-wrap text-foreground">
        {segments.map((segment, index) => {
          const n = numbers.get(segment.changeId!);
          if (segment.kind === "same" || n === undefined) return <span key={index}>{segment.text}</span>;
          const number = lastRun.get(segment.changeId!) === index && (
            <sup aria-hidden="true" className={cn("ms-0.5 font-semibold no-underline", quiet)}>
              {n}
            </sup>
          );
          const said = <span className="sr-only">{`[${changeLabel(n)}, ${segment.kind === "insert" ? insertedLabel : deletedLabel}: `}</span>;
          return segment.kind === "insert" ? (
            <ins key={index} data-author={byId.get(segment.changeId!)!.author} className={cn("underline decoration-2 underline-offset-4", inserted[byId.get(segment.changeId!)!.author])}>
              {said}
              {segment.text}
              <span className="sr-only">]</span>
              {number}
            </ins>
          ) : (
            <del key={index} className="text-destructive line-through decoration-2">
              {said}
              {segment.text}
              <span className="sr-only">]</span>
              {number}
            </del>
          );
        })}
      </p>
      <ol ref={list} className="m-0 flex list-none flex-col gap-2 p-0">
        {changes.map((change, index) => {
          const name = changeLabel(index + 1);
          const unavailable = decisions.ids.has(change.id) || decisions.bulk !== null ? true : undefined;
          return (
            <li key={change.id} data-ouro-draft-change={change.id} className="m-0 flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 p-0 text-sm">
              <span aria-hidden="true" className={cn("w-4 shrink-0 text-xs font-semibold tabular-nums", quiet)}>
                {index + 1}
              </span>
              <span className="sr-only">{name}: </span>
              <span className="font-semibold">{change.name}</span>
              {change.author === "agent" && (
                <Badge tone="primary" variant="soft">
                  {agentLabel}
                </Badge>
              )}
              {change.time !== undefined && change.time !== null && <span className={cn("text-xs", quiet)}>{change.time}</span>}
              {change.source !== undefined && change.source !== null && <span className={cn("text-xs", quiet)}>{change.source}</span>}
              {change.source !== undefined && change.source !== null && onShowSource && (
                <Button
                  size="sm"
                  variant="plain"
                  data-ouro-control="draft-review"
                  data-ouro-part="show-source"
                  aria-label={`${showSourceLabel}, ${name}`}
                  onClick={() => onShowSource(change.id)}
                >
                  {showSourceLabel}
                </Button>
              )}
              <span className="ms-auto flex gap-1">
                <Button
                  size="sm"
                  variant="outline"
                  data-ouro-control="draft-review"
                  data-ouro-part="accept"
                  aria-label={`${acceptLabel}, ${name}`}
                  aria-disabled={unavailable}
                  onClick={(event) => decide(change, index, event, onAccept)}
                >
                  {acceptLabel}
                </Button>
                <Button
                  size="sm"
                  variant="plain"
                  tone="destructive"
                  data-ouro-control="draft-review"
                  data-ouro-part="reject"
                  aria-label={`${rejectLabel}, ${name}`}
                  aria-disabled={unavailable}
                  onClick={(event) => decide(change, index, event, onReject)}
                >
                  {rejectLabel}
                </Button>
              </span>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
