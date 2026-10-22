"use client";

import { useEffect, useId, useRef, useState, type HTMLAttributes, type JSX, type KeyboardEvent, type MouseEvent, type ReactNode, type Ref } from "react";
import { Badge } from "@/registry/ouro/components/ouro/badge/badge";
import { Button } from "@/registry/ouro/components/ouro/button/button";
import { TextArea } from "@/registry/ouro/components/ouro/text-field/text-area";
import { announce } from "@/registry/ouro/lib/ouro/announce";
import { useAppearanceClassNameCheck } from "@/registry/ouro/lib/ouro/class-name-check";
import { cn } from "@/registry/ouro/lib/ouro/cn";
import { useFocusHandoff } from "@/registry/ouro/lib/ouro/focus-handoff";
import { useMergedRef } from "@/registry/ouro/lib/ouro/refs";
import { useDevWarnings } from "@/registry/ouro/lib/ouro/use-dev-messages";

/** A person's decision about a note: the `revision` they saw when the press began, and the click. */
export type AgentNoteHandler = (revision: string | undefined, event: MouseEvent<HTMLElement>) => void;

/**
 * Saves the person's words. Receives the `revision` they last saw (the newer one once the note
 * changed while they edited), and the click. Return `false`, or a promise of it, to keep the
 * editor open, such as when saving failed; a throw or a rejection keeps it open too, is reported
 * (`reportError`) and tells the person (`saveErrorLabel`). Until it settles, the text box is
 * read-only and Cancel waits.
 */
export type AgentNoteSaveHandler = (text: string, revision: string | undefined, event: MouseEvent<HTMLElement>) => boolean | void | Promise<boolean | void>;

/** The props AgentNote adds to the `<article>` attributes it passes through. */
export interface AgentNoteOwnProps {
  /**
   * The note, as plain text. It shows as text, never as markup, keeping its line breaks.
   * @claim "It shows as text, never as" registry/ouro/components/ouro/agent-note/agent-note.test.tsx verify:testExists(registry/ouro/components/ouro/agent-note/agent-note.test.tsx::AgentNote > shows the text as text, never markup, keeping its line breaks)
   */
  text: string;
  /** Who wrote the words on screen: the agent, or the person once they edited them. */
  author: "agent" | "human";
  /** The agent's name ("Ouro"), shown while the words are the agent's. */
  name: string;
  /** When, already formatted ("5 min ago", `<RelativeTime>`). */
  time?: ReactNode;
  /** What the agent read to write it, already worded, such as the messages and transcripts it used. */
  source?: ReactNode;
  /**
   * The person kept the note. A pinned note, like one the person edited, is theirs: the agent no longer replaces it.
   * @claim "A pinned note, like one the" registry/ouro/components/ouro/agent-note/agent-note.test.tsx verify:testExists(registry/ouro/components/ouro/agent-note/agent-note.test.tsx::AgentNote > says a pinned or edited note is kept)
   */
  pinned?: boolean | undefined;
  /**
   * Which version of the note this is, such as a counter or a hash. The handlers receive the one
   * on screen when the press began; while the person edits, a newer one shows a notice and keeps
   * their words.
   */
  revision?: string | undefined;
  /** Adds Pin. Pinning is a person's decision: check `event.isTrusted` before you keep the note. */
  onPin?: AgentNoteHandler | undefined;
  /** Adds Unpin to a pinned note, so the agent may replace it again. Check `event.isTrusted`, as for `onPin`. */
  onUnpin?: AgentNoteHandler | undefined;
  /** Adds Edit, which turns the note into a text box in place with Save and Cancel. Check `event.isTrusted` before you save. */
  onSave?: AgentNoteSaveHandler | undefined;
  /** Adds Dismiss. Check `event.isTrusted`, as for `onPin`. */
  onDismiss?: AgentNoteHandler | undefined;
  /** The longest note the person may save, in characters. @default 1500 */
  maxLength?: number | undefined;
  /** What the note is, before its author and in its name for screen readers. @default "Note" */
  label?: string | undefined;
  /** The badge beside the agent's name, for other languages. @default "Agent" */
  agentLabel?: string | undefined;
  /** What shows in place of the agent's name once the person edited the note. @default "Edited by you" */
  editedLabel?: string | undefined;
  /** The badge on a pinned note, for other languages. @default "Pinned" */
  pinnedLabel?: string | undefined;
  /** The line on a note the person kept, for other languages. @default "Kept: your agent won't change this note." */
  keptLabel?: string | undefined;
  /** The notice while the person edits a note that changed underneath, spoken once when it appears. For other languages. */
  changedLabel?: string | undefined;
  /** What the person hears when a save throws or rejects, for other languages. @default "Couldn't save the note. Your words are still here." */
  saveErrorLabel?: string | undefined;
  /** The Pin button's word, for other languages. @default "Pin" */
  pinButtonLabel?: string | undefined;
  /** The Unpin button's word, for other languages. @default "Unpin" */
  unpinButtonLabel?: string | undefined;
  /** The Edit button's word, for other languages. @default "Edit" */
  editButtonLabel?: string | undefined;
  /** The text box's name while the person edits. @default `label` */
  editorLabel?: string | undefined;
  /** The Save button's word, for other languages. @default "Save" */
  saveButtonLabel?: string | undefined;
  /** What screen readers hear while a save is in progress, for other languages. @default "Saving note" */
  savingLabel?: string | undefined;
  /** The Cancel button's word, for other languages. @default "Cancel" */
  cancelButtonLabel?: string | undefined;
  /** The Dismiss button's word, for other languages. @default "Dismiss" */
  dismissButtonLabel?: string | undefined;
  /** Layout only: margins, width, grid placement (`mt-2`). Appearance classes warn in development. */
  className?: string | undefined;
  ref?: Ref<HTMLElement> | undefined;

  /** Not a prop. The words are `text`: `<AgentNote text={note.text}>`. */
  children?: { 'Use text={note.text}': never };
  /** Not a prop. Who wrote it is `author`, and the agent's name `name`: `<AgentNote author="agent" name="Ouro">`. */
  by?: { 'Use author="agent" name="Ouro"': never };
  /** Not a prop. What it was based on is `source`: `<AgentNote source="Based on 3 messages">`. */
  basis?: { 'Use source="Based on 3 messages"': never };
  /** Not a prop. The person's words save through `onSave`: `<AgentNote onSave={(text, revision, event) => save(text)}>`. */
  onEdit?: { 'Use onSave={(text, revision, event) => save(text)}': never };
}

/** Props for {@link AgentNote}: its own props and the `<article>` attributes it passes through. */
export type AgentNoteProps = Omit<HTMLAttributes<HTMLElement>, keyof AgentNoteOwnProps> & AgentNoteOwnProps;

const quiet = "text-[color-mix(in_oklab,var(--muted-foreground)_80%,var(--foreground))]";

/**
 * A short note an agent leaves for the person, attributed to the agent. It says who wrote it,
 * when, and what the agent read to write it, and offers the person's own actions: Pin, Edit (a
 * text box in place, with Save and Cancel) and Dismiss. While the words are the agent's, an
 * Agent badge sits beside its name and a bar marks the note's start edge. A note the person
 * pinned or edited is theirs: it says so, and the agent no longer replaces it. Pinning,
 * editing and dismissing are a person's decisions: the handlers receive the click event, so
 * the app can check `event.isTrusted`, and the `revision` on screen when the press began, so
 * the app can refuse a decision about a note the agent replaced under the click. A newer
 * revision that arrives while the person edits shows a notice, spoken once, and never replaces
 * their words. While a save is in progress the text box is read-only and Cancel waits. When the
 * app removes a dismissed note, focus moves to the next control after it. Leave a handler out
 * to leave its button out.
 *
 * Use `Alert` instead for a notice from the app itself.
 *
 * @group Chat
 * @see https://ourostack.github.io/ouro-ui/docs/agent-note
 *
 * @example
 * <AgentNote
 *   text={note.text}
 *   author={note.author}
 *   name="Ouro"
 *   time="5 min ago"
 *   source="Based on 3 messages and a transcript"
 *   pinned={note.pinned}
 *   revision={note.revision}
 *   onPin={(revision, event) => event.isTrusted && revision === note.revision && pin()}
 *   onSave={(text, revision, event) => event.isTrusted && save(text)}
 *   onDismiss={(revision, event) => event.isTrusted && dismiss()}
 * />
 * @claim "While the words are the agent's" registry/ouro/components/ouro/agent-note/agent-note.test.tsx verify:testExists(registry/ouro/components/ouro/agent-note/agent-note.test.tsx::AgentNote > attributes the agent's words with a badge and a bar, and the person's edit to them)
 * @claim "A note the person pinned or" registry/ouro/components/ouro/agent-note/agent-note.test.tsx verify:testExists(registry/ouro/components/ouro/agent-note/agent-note.test.tsx::AgentNote > says a pinned or edited note is kept)
 * @claim "the `revision` on screen when the" registry/ouro/components/ouro/agent-note/agent-note.test.tsx verify:testExists(registry/ouro/components/ouro/agent-note/agent-note.test.tsx::AgentNote > passes the revision on screen when the press began, so a replaced note can be refused)
 * @claim "A newer revision that arrives while" registry/ouro/components/ouro/agent-note/agent-note.test.tsx verify:testExists(registry/ouro/components/ouro/agent-note/agent-note.test.tsx::AgentNote > keeps the person's words when the note changes while they edit, and says so)
 */
export function AgentNote(props: AgentNoteProps): JSX.Element {
  const {
    text,
    author,
    name,
    time,
    source,
    pinned = false,
    revision,
    onPin,
    onUnpin,
    onSave,
    onDismiss,
    maxLength = 1500,
    label = "Note",
    agentLabel = "Agent",
    editedLabel = "Edited by you",
    pinnedLabel = "Pinned",
    keptLabel = "Kept: your agent won't change this note.",
    changedLabel = "Your agent changed this note while you were editing. Your words stay here; Save replaces the new version.",
    saveErrorLabel = "Couldn't save the note. Your words are still here.",
    pinButtonLabel = "Pin",
    unpinButtonLabel = "Unpin",
    editButtonLabel = "Edit",
    editorLabel = label,
    saveButtonLabel = "Save",
    savingLabel = "Saving note",
    cancelButtonLabel = "Cancel",
    dismissButtonLabel = "Dismiss",
    className,
    // Guard props (hint types), dropped here so they never reach the DOM.
    children,
    by,
    basis,
    onEdit,
    ref,
    ...rest
  } = props;
  // When the app removes the note (Dismiss), focus moves to the next control after it.
  const article = useMergedRef(ref, useFocusHandoff<HTMLElement>());
  const id = useId();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(text);
  const [startedFrom, setStartedFrom] = useState<string | undefined>(undefined);
  const [saving, setSaving] = useState(false);
  const area = useRef<HTMLTextAreaElement>(null);
  const editButton = useRef<HTMLButtonElement>(null);
  const refocus = useRef<"area" | "edit" | null>(null);
  const changedUnder = editing && revision !== startedFrom;
  const human = author === "human";
  const kept = pinned || human;

  // The revision on screen when a press began. A click finishes the press with it, so a note the
  // agent replaced between the press and the click is reported as the one the person saw.
  const pressed = useRef<{ revision: string | undefined } | null>(null);
  const begin = () => {
    pressed.current = { revision };
    const clear = () => setTimeout(() => (pressed.current = null), 0);
    // A listener left behind would only clear a later press after that press's own click, as this one does.
    // Stryker disable next-line ObjectLiteral,BooleanLiteral: the same press is cleared either way.
    window.addEventListener("pointerup", clear, { once: true });
    // Stryker disable next-line ObjectLiteral,BooleanLiteral: the same press is cleared either way.
    window.addEventListener("keyup", clear, { once: true });
  };
  const seen = () => {
    const at = pressed.current ? pressed.current.revision : revision;
    pressed.current = null;
    return at;
  };
  const decisions: Record<string, AgentNoteHandler | undefined> = { pin: onPin, unpin: onUnpin, dismiss: onDismiss };
  const decide = (event: MouseEvent<HTMLElement>) => decisions[event.currentTarget.dataset.ouroPart!]!(seen(), event);

  const startEditing = () => {
    setDraft(text);
    setStartedFrom(revision);
    refocus.current = "area";
    setEditing(true);
  };
  const stopEditing = () => {
    // A save in progress finishes first: its words are on their way.
    if (saving) return;
    refocus.current = "edit";
    setEditing(false);
  };
  const save = async (event: MouseEvent<HTMLElement>) => {
    const at = seen();
    setSaving(true);
    let result: boolean | void = false;
    try {
      result = await onSave!(draft, at, event);
    } catch (error) {
      // The editor stays open with the person's words; the error is reported, and the person told.
      reportError(error);
      announce(saveErrorLabel);
    } finally {
      setSaving(false);
    }
    if (result !== false) {
      refocus.current = "edit";
      setEditing(false);
    }
  };
  const cancelOnEscape = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key !== "Escape") return;
    event.preventDefault();
    stopEditing();
  };
  // The notice that the note changed underneath is spoken once, when it appears.
  useEffect(() => {
    if (changedUnder) announce(changedLabel);
  }, [changedUnder, changedLabel]);
  useEffect(() => {
    if (refocus.current === "area") {
      // The caret goes to the end, where the person most often adds to the agent's words.
      const box = area.current!;
      box.focus();
      box.setSelectionRange(box.value.length, box.value.length);
    }
    if (refocus.current === "edit") editButton.current?.focus();
    refocus.current = null;
  }, [editing]);

  useAppearanceClassNameCheck(
    "AgentNote",
    className,
    process.env.NODE_ENV !== "production"
      ? (token: string) => `remove "${token}"; AgentNote takes its colors from the theme`
      : // Stryker disable next-line StringLiteral: production only; the check never runs there.
        /* istanbul ignore next @preserve -- production only */ "",
  );
  // Once the person keeps a note, the agent's words no longer replace it: a kept note that comes
  // back as the agent's, with other words, is a bug in the app, and development says so.
  // Stryker disable next-line ObjectLiteral: the first render compares the note with itself, so it never warns.
  const previous = useRef({ text, kept });
  useDevWarnings(
    "AgentNote",
    process.env.NODE_ENV !== "production"
      ? () => [
          (author === undefined || name === undefined) && ["author and name are required, so the note says who wrote it", '<AgentNote text={note.text} author="agent" name="Ouro">'],
          previous.current.kept &&
            !human &&
            previous.current.text !== text && [
              "a pinned or edited note came back with the agent's words; once the person keeps a note, the agent leaves it",
              '<AgentNote pinned author="human" text={keptText}>',
            ],
          children !== undefined && ["children is not a prop; the note is text", "<AgentNote text={note.text}>"],
          by !== undefined && ["by is not a prop", '<AgentNote author="agent" name="Ouro">'],
          basis !== undefined && ["basis is not a prop", '<AgentNote source="Based on 3 messages">'],
          onEdit !== undefined && ["onEdit is not a prop", "<AgentNote onSave={(text, revision, event) => save(text)}>"],
        ]
      : /* istanbul ignore next @preserve -- production only */ undefined,
  );
  // After the development check above, which reads the previous render's note.
  useEffect(() => {
    previous.current = { text, kept };
  });

  const pressProps = { onPointerDown: begin, onKeyDown: begin };
  return (
    <article
      {...rest}
      ref={article}
      data-ouro="agent-note"
      data-author={author}
      data-pinned={pinned ? "" : undefined}
      aria-labelledby={`${id}-label ${id}-author`}
      aria-busy={saving || undefined}
      className={cn(
        "relative box-border flex min-w-0 flex-col gap-1.5 overflow-hidden rounded-lg border border-solid border-border bg-card p-3 text-card-foreground",
        !human && "ps-4 before:absolute before:inset-y-0 before:start-0 before:w-1 before:bg-primary forced-colors:before:bg-[CanvasText]",
        className,
      )}
    >
      <div className={cn("flex min-w-0 flex-wrap items-center gap-1.5 text-xs", quiet)}>
        <span id={`${id}-label`} className="font-semibold text-foreground">
          {label}
        </span>
        <span id={`${id}-author`} data-ouro-note-author="" className="inline-flex items-center gap-1.5">
          {human ? (
            editedLabel
          ) : (
            <>
              {name}
              <Badge tone="primary" variant="soft">
                {agentLabel}
              </Badge>
            </>
          )}
        </span>
        {time !== undefined && time !== null && <span>· {time}</span>}
        {pinned && (
          <Badge tone="success" variant="outline">
            {pinnedLabel}
          </Badge>
        )}
      </div>
      {editing ? (
        <>
          {changedUnder && (
            <p data-ouro-note-changed="" className={cn("m-0 text-xs", quiet)}>
              {changedLabel}
            </p>
          )}
          <TextArea
            ref={area}
            label={editorLabel}
            hideLabel
            readOnly={saving}
            value={draft}
            onValueChange={(next: string) => setDraft(next)}
            onKeyDown={cancelOnEscape}
            autoGrow
            rows={3}
            maxRows={10}
            maxLength={maxLength}
          />
        </>
      ) : (
        <p data-ouro-note-text="" className="m-0 text-sm break-words whitespace-pre-wrap text-foreground">
          {text}
        </p>
      )}
      {!editing && source !== undefined && source !== null && (
        <p data-ouro-note-source="" className={cn("m-0 text-xs", quiet)}>
          {source}
        </p>
      )}
      {!editing && kept && (
        <p data-ouro-note-kept="" className={cn("m-0 text-xs", quiet)}>
          {keptLabel}
        </p>
      )}
      <div className="flex flex-wrap items-center gap-1">
        {editing ? (
          <>
            {onSave && (
              <Button
                size="sm"
                data-ouro-control="agent-note"
                data-ouro-part="save"
                loading={saving}
                loadingLabel={savingLabel}
                disabled={!draft.trim()}
                {...pressProps}
                onClick={save}
              >
                {saveButtonLabel}
              </Button>
            )}
            <Button size="sm" variant="plain" data-ouro-control="agent-note" data-ouro-part="cancel" aria-disabled={saving || undefined} onClick={stopEditing}>
              {cancelButtonLabel}
            </Button>
          </>
        ) : (
          <>
            {pinned
              ? onUnpin && (
                  <Button size="sm" variant="plain" data-ouro-control="agent-note" data-ouro-part="unpin" {...pressProps} onClick={decide}>
                    {unpinButtonLabel}
                  </Button>
                )
              : onPin && (
                  <Button size="sm" variant="outline" data-ouro-control="agent-note" data-ouro-part="pin" {...pressProps} onClick={decide}>
                    {pinButtonLabel}
                  </Button>
                )}
            {onSave && (
              <Button ref={editButton} size="sm" variant="plain" data-ouro-control="agent-note" data-ouro-part="edit" onClick={startEditing}>
                {editButtonLabel}
              </Button>
            )}
            {onDismiss && (
              <Button size="sm" variant="plain" data-ouro-control="agent-note" data-ouro-part="dismiss" {...pressProps} onClick={decide}>
                {dismissButtonLabel}
              </Button>
            )}
          </>
        )}
      </div>
    </article>
  );
}
