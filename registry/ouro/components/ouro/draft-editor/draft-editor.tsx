"use client";

import { useId, useLayoutEffect, useRef, useState, type CSSProperties, type JSX, type ReactNode, type Ref, type TextareaHTMLAttributes } from "react";
import { Badge } from "@/registry/ouro/components/ouro/badge/badge";
import { TextArea } from "@/registry/ouro/components/ouro/text-field/text-area";
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
   */
  onValueChange: (value: string, segments: DraftSegment[]) => void;
  /** Who wrote which part of `value`. Agent-written runs are highlighted in place. */
  segments: readonly DraftSegment[];
  /** Where the draft stands, shown as a badge above it. @default "drafting", which shows the badge only once it moves on */
  readiness?: DraftReadiness | (string & { 'Use "drafting", "needs-input", "ready-for-review" or "approved"': never }) | undefined;
  /** Who set the readiness. An agent's `approved` is not shown: only a person approves. */
  readinessBy?: DraftReadinessBy | undefined;
  /** A short note from whoever set the readiness ("Check the dates"). */
  readinessNote?: string | undefined;
  /** The readiness badge's text, for other languages. Defaults to "Needs your input", "Ready for your review" or "Approved". */
  readinessLabel?: string | undefined;
  /** The legend for the agent's highlight, for other languages. @default "Written by an agent" */
  agentLabel?: string | undefined;
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

/** Props for {@link DraftEditor}: its own props and the `<textarea>` attributes it passes through. */
export type DraftEditorProps = Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, keyof DraftEditorOwnProps | "children"> & DraftEditorOwnProps;

const readinessBadges = {
  "needs-input": { label: "Needs your input", tone: "warning" },
  "ready-for-review": { label: "Ready for your review", tone: "primary" },
  approved: { label: "Approved", tone: "success" },
} as const;
const readinessNames: readonly string[] = ["drafting", ...Object.keys(readinessBadges)];

// The textarea's metrics the highlight layer copies, so its runs wrap exactly as the text does.
const mirrored = ["fontFamily", "fontSize", "fontWeight", "fontStyle", "lineHeight", "letterSpacing", "wordSpacing", "textIndent", "textTransform", "tabSize"] as const;

// An agent's run: a tint of the theme's primary color and an underline, so it never relies on color alone.
const agentMark =
  "rounded-xs bg-[color-mix(in_oklab,var(--primary)_16%,transparent)] underline decoration-primary decoration-2 underline-offset-4 " +
  "forced-colors:decoration-[Highlight]";
const quiet = "text-[color-mix(in_oklab,var(--muted-foreground)_80%,var(--foreground))]";

const join = (segments: readonly DraftSegment[]) => segments.map((segment) => segment.text).join("");

/** The runs after an edit: the text between the unchanged start and end is the person's. */
function rebase(segments: readonly DraftSegment[], before: string, after: string): DraftSegment[] {
  let start = 0;
  while (start < before.length && start < after.length && before[start] === after[start]) start++;
  let end = 0;
  while (end < before.length - start && end < after.length - start && before[before.length - 1 - end] === after[after.length - 1 - end]) end++;
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
 * A draft that a person and an agent write together: a growing text box in which the
 * agent's words are highlighted in place, and a line above it that says the agent wrote
 * some of it and where the draft stands ("Needs your input", "Ready for your review",
 * "Approved"). The person edits freely; `onValueChange` gives the new text and the runs
 * updated to match, so what they type is theirs and what they leave keeps its author.
 * Screen readers hear the agent's words in the box's description. An agent can ask for
 * input or say the draft is ready for review, but only a person approves it: an `approved`
 * set by an agent is not shown.
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
 *   onValueChange={(text, segments) => setDraft({ text, segments })}
 *   readiness="ready-for-review"
 *   readinessBy={{ author: "agent", name: "Ouro" }}
 *   actions={<Button>Send</Button>}
 * />
 * @claim "the agent's words are highlighted in" registry/ouro/components/ouro/draft-editor/draft-editor.test.tsx verify:testExists(registry/ouro/components/ouro/draft-editor/draft-editor.test.tsx::DraftEditor > highlights the agent's words in place, under the text, wrapped as the text wraps)
 * @claim "so what they type is theirs" registry/ouro/components/ouro/draft-editor/draft-editor.test.tsx verify:testExists(registry/ouro/components/ouro/draft-editor/draft-editor.test.tsx::DraftEditor > gives the person's typing to them and keeps the author of what they leave)
 * @claim "Screen readers hear the agent's words" registry/ouro/components/ouro/draft-editor/draft-editor.test.tsx verify:testExists(registry/ouro/components/ouro/draft-editor/draft-editor.test.tsx::DraftEditor > describes the box with the agent's words, for screen readers)
 * @claim "an `approved` set by an agent" registry/ouro/components/ouro/draft-editor/draft-editor.test.tsx verify:testExists(registry/ouro/components/ouro/draft-editor/draft-editor.test.tsx::DraftEditor > shows approval only from a person)
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
  const agentApproved = readiness === "approved" && readinessBy?.author === "agent";
  const badge = readiness === "drafting" || agentApproved ? null : readinessBadges[readiness];

  useAppearanceClassNameCheck(
    "DraftEditor",
    className,
    process.env.NODE_ENV !== "production"
      ? (token: string) => `remove "${token}"; DraftEditor takes its colors from the theme`
      : /* istanbul ignore next @preserve -- production only */ "",
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
          agentApproved && [
            'readiness="approved" was set by an agent, so it is not shown; only a person approves a draft',
            '<DraftEditor readiness="ready-for-review" readinessBy={{ author: "agent", name: "Ouro" }}>',
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
    observer.observe(textarea);
    observer.observe(box.current!);
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
    <div data-ouro="draft-editor" data-readiness={readiness} className={cn("box-border flex min-w-0 flex-col gap-2", className)}>
      {status && (
        <div id={`${id}-status`} className={cn("flex flex-wrap items-center gap-2 text-xs", quiet)}>
          {highlighted && (
            <span data-ouro-draft-legend="" className="inline-flex items-center gap-1.5">
              <span aria-hidden="true" className={cn("inline-block h-3 w-4", agentMark)} />
              <span aria-hidden="true">{agentLabel}</span>
              <span className="sr-only">{`${agentLabel}: ${agentRuns.map((run) => `“${run.text.trim()}”`).join(", ")}.`}</span>
            </span>
          )}
          {badge && (
            <Badge tone={badge.tone} variant="soft">
              {readinessLabel ?? badge.label}
            </Badge>
          )}
          {badge && readinessBy && (
            <span data-ouro-draft-readiness-by="">
              {readinessBy.name}
              {readinessNote ? `: ${readinessNote}` : ""}
            </span>
          )}
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
                {"\n"}
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
            onValueChange={(next: string) => onValueChange(next, rebase(inStep ? segments : [{ author: "human", text: value }], value, next))}
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
