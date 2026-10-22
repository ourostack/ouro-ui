"use client";

import { useEffect, useId, useLayoutEffect, useRef, useState, type CSSProperties, type JSX, type ReactNode, type Ref, type TextareaHTMLAttributes } from "react";
import { Badge } from "@/registry/ouro/components/ouro/badge/badge";
import { TextArea } from "@/registry/ouro/components/ouro/text-field/text-area";
import { announce } from "@/registry/ouro/lib/ouro/announce";
import { useAppearanceClassNameCheck } from "@/registry/ouro/lib/ouro/class-name-check";
import { cn } from "@/registry/ouro/lib/ouro/cn";
import { useDevWarnings } from "@/registry/ouro/lib/ouro/use-dev-messages";

/** Who wrote a run of text: the person using the app, or an agent working with them. */
export type DraftAuthor = "human" | "agent";

/** A run of the draft written by one author. The runs, joined, are the draft's `value`. */
export interface DraftSegment {
  /** Who wrote this run. */
  author: DraftAuthor;
  /** The run's text. */
  text: string;
}

/**
 * Where the draft stands. An agent may say it `needs-input` or is `ready-for-review`;
 * only a person marks it `approved`.
 */
export type DraftReadiness = "drafting" | "needs-input" | "ready-for-review" | "approved";

/** Who set the readiness: their kind, so a person's approval is told apart from an agent's, and the name to show. */
export interface DraftReadinessBy {
  /** A person or an agent. */
  author: DraftAuthor;
  /** The name to show ("You", "Ouro"). */
  name: string;
}

/** The props DraftEditor adds to the `<textarea>` attributes it passes through. */
export interface DraftEditorOwnProps {
  /** What the draft is, for screen readers ("Reply"). The box shows `placeholder` instead. Required. */
  label: string;
  /** The draft's text (controlled). */
  value: string;
  /**
   * Called when the person edits, with the new text and the runs updated to match: the
   * person's typing is theirs, and what they did not touch keeps its author. Store both.
   * The runs are `undefined` when `segments` did not join to `value`, since who wrote what is
   * then unknown, and the agent's words are not highlighted until the runs join to the text
   * again. To get back in step, store runs that join to the new text: your own record of who
   * wrote what, or else the text as the person's (`[{ author: "human", text }]`), since they
   * have now edited it; the agent's next words are highlighted as before.
   */
  onValueChange: (value: string, segments: DraftSegment[] | undefined) => void;
  /** Who wrote which part of `value`. Agent-written runs are highlighted in place. */
  segments: readonly DraftSegment[];
  /** A short note from whoever set the readiness ("Check the dates"), after their name. */
  readinessNote?: string | undefined;
  /** The readiness badge's text, for other languages. Defaults to "Needs your input", "Ready for your review" or "Approved". */
  readinessLabel?: string | undefined;
  /** The legend for the agent's highlight, for other languages. @default "Written by an agent" */
  agentLabel?: string | undefined;
  /**
   * What screen readers hear after `agentLabel` in the box's description: how many runs the agent
   * wrote and the first few words of the first. For other languages.
   * @default (count, start) => `${count} ${count === 1 ? "passage" : "passages"}, starting “${start}”`
   */
  agentSummary?: ((count: number, start: string) => string) | undefined;
  /** A send button and other actions, at the end of the box. */
  actions?: ReactNode;
  /** Text shown while the draft is empty. */
  placeholder?: string | undefined;
  /** Rows the box starts with; it grows with the text. @default 2 */
  rows?: number | undefined;
  /** Rows the box grows to before it scrolls. @default 10 */
  maxRows?: number | undefined;
  /** Layout only: width, margins, grid placement (`mt-2`). Appearance classes warn in development. */
  className?: string | undefined;
  /** The `<textarea>`. */
  ref?: Ref<HTMLTextAreaElement> | undefined;

  /** Not a prop. The runs are `segments`: `<DraftEditor segments={segments}>`. */
  provenance?: { 'Use segments={segments}': never };
  /** Not a prop. The draft is controlled: `<DraftEditor value={text} onValueChange={save}>`. */
  defaultValue?: { 'Use value={text} with onValueChange={save}': never };
  /** Not a prop. `onValueChange` gives the text and the updated runs: `onValueChange={(text, segments) => save(text, segments)}`. */
  onChange?: { 'Use onValueChange={(text, segments) => save(text, segments)}': never };
}

/** An approved draft: only a person approves, so `readinessBy` names the person. */
export interface DraftApproval {
  /** Where the draft stands, shown as a badge above it. */
  readiness: "approved";
  /** The person who approved it. */
  readinessBy: DraftReadinessBy & { author: "human" };
}

/** A draft not yet approved: where it stands, said by a person or an agent. */
export interface DraftProgress {
  /** Where the draft stands, shown as a badge above it. @default "drafting", which shows the badge only once it moves on */
  readiness?: Exclude<DraftReadiness, "approved"> | (string & { 'Use "drafting", "needs-input", "ready-for-review" or "approved"': never }) | undefined;
  /** Who set the readiness. */
  readinessBy?: DraftReadinessBy | undefined;
}

/** Where the draft stands and who said so: `approved` takes a person in `readinessBy`. */
export type DraftReadinessProps = DraftApproval | DraftProgress;

/** The props both modes share: DraftEditor's own and the `<textarea>` attributes it passes through. */
export type DraftEditorBaseProps = Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, keyof DraftEditorOwnProps | "children"> & DraftEditorOwnProps;

/** Approved by a person, named in `readinessBy`. */
export type DraftEditorApprovedProps = DraftEditorBaseProps & DraftApproval;

/** Drafting, needing input or ready for review, as a person or an agent says. */
export type DraftEditorInProgressProps = DraftEditorBaseProps & DraftProgress;

/** Props for {@link DraftEditor}. Only a person approves: `readiness="approved"` takes a person in `readinessBy`. */
export type DraftEditorProps = DraftEditorApprovedProps | DraftEditorInProgressProps;

const readinessBadges = {
  "needs-input": { label: "Needs your input", tone: "warning" },
  "ready-for-review": { label: "Ready for your review", tone: "primary" },
  approved: { label: "Approved", tone: "success" },
} as const;
// The readinesses past drafting; anything else is drafting.
const readinessNames: readonly string[] = Object.keys(readinessBadges);

// The textarea's metrics the highlight layer copies, so its runs wrap exactly as the text does.
const mirrored = ["fontFamily", "fontSize", "fontWeight", "fontStyle", "lineHeight", "letterSpacing", "wordSpacing", "textIndent", "textTransform", "tabSize"] as const;

// An agent's run: a tint of the theme's primary color and an underline, so it never relies on color alone.
const agentMark =
  "rounded-xs bg-[color-mix(in_oklab,var(--primary)_16%,transparent)] underline decoration-primary decoration-2 underline-offset-4 " +
  // Stryker disable next-line StringLiteral: forced colours only, where the conformance suite checks the highlight.
  "forced-colors:decoration-[Highlight]";
const quiet = "text-[color-mix(in_oklab,var(--muted-foreground)_80%,var(--foreground))]";

// The words of the agent's first run the description quotes.
const startWords = 5;

// A last empty line, as the textarea keeps one under its text.
// Stryker disable next-line StringLiteral: the layer clips to the textarea, so no highlight above the last line moves without it.
const lastLine = "\n";

/** The first few words of a run, with an ellipsis when it goes on. */
function start(text: string): string {
  const words = text.trim().split(/\s+/);
  return words.length > startWords ? `${words.slice(0, startWords).join(" ")}…` : words.join(" ");
}

const join = (segments: readonly DraftSegment[]) => segments.map((segment) => segment.text).join("");

/** Where an edit was: the selection before it and the caret after it. */
interface DraftEdit {
  before: { start: number; end: number };
  caret: number;
}

/**
 * The lengths of the unchanged start and end around an edit: the longest unchanged start, then
 * the longest unchanged end. When the changed text matches its neighbours, the change could sit
 * in more than one place; the selection says where the person made it, so what they typed is
 * theirs even when an agent's words around it read the same.
 */
function unchanged(before: string, after: string, edit: DraftEdit | null): [number, number] {
  let start = 0;
  // Past either string's end its character reads undefined, unequal to the other's: before and after differ, so the bounds only stop the scan sooner.
  // Stryker disable next-line ConditionalExpression,LogicalOperator,EqualityOperator: as above, the comparison alone ends the scan.
  while (start < before.length && start < after.length && before[start] === after[start]) start++;
  let end = 0;
  while (end < before.length - start && end < after.length - start && before[before.length - 1 - end] === after[after.length - 1 - end]) end++;
  if (edit) {
    // The same change, placed by the selection: as small, with the text around it unchanged.
    const at = Math.min(edit.before.start, edit.caret);
    const rest = after.length - edit.caret;
    if (at + rest === start + end && before.slice(0, at) === after.slice(0, at) && before.endsWith(after.slice(edit.caret))) return [at, rest];
  }
  return [start, end];
}

/** The runs after an edit: the text between the unchanged start and end is the person's. */
function rebase(segments: readonly DraftSegment[], before: string, after: string, edit: DraftEdit | null): DraftSegment[] {
  const [start, end] = unchanged(before, after, edit);
  const runs: DraftSegment[] = [];
  const push = (author: DraftAuthor, text: string) => {
    if (!text) return;
    const last = runs.at(-1);
    if (last?.author === author) last.text += text;
    else runs.push({ author, text });
  };
  let at = 0;
  for (const segment of segments) {
    push(segment.author, segment.text.slice(0, Math.max(0, start - at)));
    at += segment.text.length;
  }
  push("human", after.slice(start, after.length - end));
  at = 0;
  for (const segment of segments) {
    push(segment.author, segment.text.slice(Math.max(0, before.length - end - at)));
    at += segment.text.length;
  }
  return runs;
}

/**
 * A draft a person and an agent write together. In its growing text box the agent's words
 * are highlighted in place, and a line above it says the agent wrote some of it and where
 * the draft stands ("Needs your input", "Ready for your review", "Approved"). The person
 * edits freely; `onValueChange` gives the new text and the runs
 * updated to match, so what they type is theirs and what they leave keeps its author.
 * Screen readers hear in the box's description how many runs the agent wrote and how the first
 * starts, and hear where the draft stands each time it changes. An agent can ask for
 * input or say the draft is ready for review, but only a person approves it: an `approved`
 * shows only with a person in `readinessBy`.
 *
 * Use `TextArea` instead for text only one person writes, and `DraftReview` to accept or
 * reject an agent's changes one by one.
 *
 * @group Chat
 * @see https://ourostack.github.io/ouro-ui/docs/draft-editor
 *
 * @example
 * <DraftEditor
 *   label="Reply"
 *   value={draft.text}
 *   segments={draft.segments}
 *   onValueChange={(text, segments) => setDraft({ text, segments: segments ?? [{ author: "human", text }] })}
 *   readiness="ready-for-review"
 *   readinessBy={{ author: "agent", name: "Ouro" }}
 *   actions={<Button>Send</Button>}
 * />
 * @claim "the agent's words are highlighted in" registry/ouro/components/ouro/draft-editor/draft-editor.test.tsx verify:testExists(registry/ouro/components/ouro/draft-editor/draft-editor.test.tsx::DraftEditor > highlights the agent's words in place, under the text, wrapped as the text wraps)
 * @claim "so what they type is theirs" registry/ouro/components/ouro/draft-editor/draft-editor.test.tsx verify:testExists(registry/ouro/components/ouro/draft-editor/draft-editor.test.tsx::DraftEditor > gives the person's typing to them and keeps the author of what they leave)
 * @claim "Screen readers hear in the box's description" registry/ouro/components/ouro/draft-editor/draft-editor.test.tsx verify:testExists(registry/ouro/components/ouro/draft-editor/draft-editor.test.tsx::DraftEditor > describes the box with the agent's words, for screen readers)
 * @claim "hear where the draft stands each time it changes" registry/ouro/components/ouro/draft-editor/draft-editor.test.tsx verify:testExists(registry/ouro/components/ouro/draft-editor/draft-editor.test.tsx::DraftEditor > says where the draft stands once each time it changes, and not when it first shows)
 * @claim "an `approved` shows only with a person" registry/ouro/components/ouro/draft-editor/draft-editor.test.tsx verify:testExists(registry/ouro/components/ouro/draft-editor/draft-editor.test.tsx::DraftEditor > shows approval only from a person)
 */
export function DraftEditor(props: DraftEditorProps): JSX.Element {
  const {
    label,
    value,
    onValueChange,
    segments,
    readiness: readinessProp = "drafting",
    readinessBy,
    readinessNote,
    readinessLabel,
    agentLabel = "Written by an agent",
    agentSummary = (count: number, start: string) => `${count} ${count === 1 ? "passage" : "passages"}, starting “${start}”`,
    actions,
    placeholder,
    rows = 2,
    maxRows = 10,
    className,
    ref,
    onScroll,
    "aria-describedby": describedBy,
    // Guard props (hint types), dropped here so they never reach the DOM.
    provenance,
    defaultValue,
    onChange,
    ...rest
  } = props;
  const readiness = readinessNames.includes(readinessProp) ? (readinessProp as DraftReadiness) : "drafting";
  const id = useId();
  const box = useRef<HTMLDivElement>(null);
  const area = useRef<HTMLTextAreaElement | null>(null);
  const [mirror, setMirror] = useState<CSSProperties | null>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const inStep = join(segments) === value;
  const agentRuns = inStep ? segments.filter((segment) => segment.author === "agent" && segment.text.trim() !== "") : [];
  const highlighted = agentRuns.length > 0;
  // Only a person approves: an approval from an agent, or from no one named, shows as drafting.
  const unapproved = readiness === "approved" && readinessBy?.author !== "human";
  const shown: DraftReadiness = unapproved ? "drafting" : readiness;
  const badge = shown === "drafting" ? null : readinessBadges[shown];
  // Who set the readiness and their note, as the status line shows them.
  const byline = readinessBy ? (readinessNote ? `${readinessBy.name}: ${readinessNote}` : readinessBy.name) : (readinessNote ?? "");
  const standing = badge ? [readinessLabel ?? badge.label, byline].filter(Boolean).join(", ") : "";
  // Said once each time where the draft stands changes, not when it first shows.
  const said = useRef<string | null>(null);
  useEffect(() => {
    const before = said.current;
    said.current = standing;
    // Nothing to say (drafting) says nothing: an empty announcement would cut off another one in flight.
    if (before !== null && standing !== before && standing !== "") announce(standing);
  }, [standing]);
  // The selection when an edit began (the native beforeinput), so the edit is placed where it was made.
  const selection = useRef<DraftEdit["before"] | null>(null);
  useEffect(() => {
    const textarea = area.current!;
    const record = () => (selection.current = { start: textarea.selectionStart, end: textarea.selectionEnd });
    textarea.addEventListener("beforeinput", record);
    // Stryker disable next-line ArrowFunction,StringLiteral: an unmounted editor's listener records a selection that nothing reads.
    return () => textarea.removeEventListener("beforeinput", record);
  },
  // Stryker disable next-line ArrayDeclaration: the textarea is the same for the editor's life, so once is enough with any fixed list.
  []);
  const change = (next: string) => {
    const before = selection.current;
    selection.current = null;
    // Out of step, who wrote what is unknown: the runs are not guessed, and no one is given the edit.
    if (!inStep) return onValueChange(next, undefined);
    onValueChange(next, rebase(segments, value, next, before && { before, caret: area.current!.selectionStart }));
  };

  useAppearanceClassNameCheck(
    "DraftEditor",
    className,
    process.env.NODE_ENV !== "production"
      ? (token: string) => `remove "${token}"; DraftEditor takes its colors from the theme`
      : // Stryker disable next-line StringLiteral: production only; the check never runs there.
        /* istanbul ignore next @preserve -- production only */ "",
  );
  useDevWarnings(
    "DraftEditor",
    process.env.NODE_ENV !== "production"
      ? () => [
          label === undefined && ["label is missing, so screen readers cannot name the draft", '<DraftEditor label="Reply" value={text} segments={segments} onValueChange={save}>'],
          !inStep && ["segments do not join to value, so the agent's words are not highlighted", "<DraftEditor value={text} segments={segments} onValueChange={(text, segments) => save(text, segments)}>"],
          readiness !== readinessProp && [
            `readiness="${String(readinessProp)}" is not a readiness; use "drafting", "needs-input", "ready-for-review" or "approved"`,
            '<DraftEditor readiness="ready-for-review">',
          ],
          unapproved &&
            readinessBy !== undefined && [
              'readiness="approved" was set by an agent, so it is not shown; only a person approves a draft',
              '<DraftEditor readiness="ready-for-review" readinessBy={{ author: "agent", name: "Ouro" }}>',
            ],
          unapproved &&
            readinessBy === undefined && [
              'readiness="approved" has no readinessBy, so it is not shown; only a person approves a draft',
              '<DraftEditor readiness="approved" readinessBy={{ author: "human", name: "You" }}>',
            ],
          provenance !== undefined && ["provenance is not a prop", "<DraftEditor segments={segments}>"],
          defaultValue !== undefined && ["defaultValue is not a prop; the draft is controlled", "<DraftEditor value={text} onValueChange={save}>"],
          onChange !== undefined && ["onChange is not a prop", "<DraftEditor onValueChange={(text, segments) => save(text, segments)}>"],
        ]
      : /* istanbul ignore next @preserve -- production only */ undefined,
  );

  // The highlight layer sits behind the transparent textarea with the same box and type, so
  // the text shows once and the highlight wraps with it. It is measured after mount (the
  // server writes none) and again whenever the textarea or its box changes size.
  useLayoutEffect(() => {
    // Stryker disable next-line ConditionalExpression: with nothing to highlight the layer is not drawn, so measuring it changes nothing shown.
    if (!highlighted) return;
    const textarea = area.current!;
    const measure = () => {
      const style = getComputedStyle(textarea);
      const next: Record<string, string | number> = { top: textarea.offsetTop, left: textarea.offsetLeft, width: textarea.clientWidth, height: textarea.clientHeight };
      for (const key of mirrored) next[key] = style[key];
      setMirror(next as CSSProperties);
    };
    measure();
    const observer = new ResizeObserver(measure);
    // The box holds the textarea and each grows with the other, so either observer alone sees a resize.
    // Stryker disable next-line CallExpression: as above.
    observer.observe(textarea);
    // Stryker disable next-line CallExpression: as above.
    observer.observe(box.current!);
    // Stryker disable next-line ArrowFunction: an unmounted editor's observer measures nothing that is shown.
    return () => observer.disconnect();
  }, [highlighted]);

  const setArea = (node: HTMLTextAreaElement | null) => {
    area.current = node;
    if (typeof ref === "function") ref(node);
    else if (ref) ref.current = node;
  };
  const status = highlighted || badge !== null;
  const describedByIds = [describedBy, status ? `${id}-status` : undefined].filter(Boolean).join(" ") || undefined;

  return (
    <div data-ouro="draft-editor" data-readiness={shown} className={cn("box-border flex min-w-0 flex-col gap-2", className)}>
      {status && (
        <div id={`${id}-status`} className={cn("flex flex-wrap items-center gap-2 text-xs", quiet)}>
          {highlighted && (
            <span data-ouro-draft-legend="" className="inline-flex items-center gap-1.5">
              <span aria-hidden="true" className={cn("inline-block h-3 w-4", agentMark)} />
              <span aria-hidden="true">{agentLabel}</span>
              <span className="sr-only">{`${agentLabel}: ${agentSummary(agentRuns.length, start(agentRuns[0]!.text))}.`}</span>
            </span>
          )}
          {badge && (
            <Badge tone={badge.tone} variant="soft">
              {readinessLabel ?? badge.label}
            </Badge>
          )}
          {badge && byline && <span data-ouro-draft-readiness-by="">{byline}</span>}
        </div>
      )}
      <div className="box-border flex min-w-0 items-end gap-2 rounded-lg border border-solid border-border bg-card p-2 text-card-foreground focus-within:border-ring">
        <div ref={box} className="relative min-w-0 flex-1">
          {highlighted && mirror && (
            <div
              aria-hidden="true"
              data-ouro-draft-highlights=""
              className="pointer-events-none absolute overflow-hidden break-words whitespace-pre-wrap text-transparent forced-color-adjust-none"
              style={mirror}
            >
              <div style={{ transform: `translateY(${-scrollTop}px)` }}>
                {segments.map((segment, index) =>
                  segment.author === "agent" ? (
                    <mark key={index} className={cn("text-transparent", agentMark)}>
                      {segment.text}
                    </mark>
                  ) : (
                    <span key={index}>{segment.text}</span>
                  ),
                )}
                {lastLine}
              </div>
            </div>
          )}
          <TextArea
            {...rest}
            ref={setArea}
            label={label}
            hideLabel
            variant="plain"
            autoGrow
            rows={rows}
            maxRows={maxRows}
            value={value}
            placeholder={placeholder}
            aria-describedby={describedByIds}
            onValueChange={change}
            onScroll={(event) => {
              setScrollTop(event.currentTarget.scrollTop);
              onScroll?.(event);
            }}
            className="relative"
          />
        </div>
        {actions}
      </div>
    </div>
  );
}
