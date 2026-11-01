"use client";

import { Children, useId, useLayoutEffect, useRef, useState } from "react";
import type { JSX, KeyboardEvent, MouseEvent, ReactNode, Ref, TextareaHTMLAttributes } from "react";
import { Button } from "@/registry/ouro/components/ouro/button/button";
import { TextArea, type TextAreaHighlight } from "@/registry/ouro/components/ouro/text-field/text-area";
import { Tooltip } from "@/registry/ouro/components/ouro/tooltip/tooltip";
import { announce } from "@/registry/ouro/lib/ouro/announce";
import { useAppearanceClassNameCheck } from "@/registry/ouro/lib/ouro/class-name-check";
import { cn } from "@/registry/ouro/lib/ouro/cn";
import { useMergedRef } from "@/registry/ouro/lib/ouro/refs";
import { useDevWarnings } from "@/registry/ouro/lib/ouro/use-dev-messages";

/** What sent the message: the Enter key in the box, or a press of the send button. */
export type ComposerSendEvent = KeyboardEvent<HTMLTextAreaElement> | MouseEvent<HTMLButtonElement>;

/** The props Composer adds to the `<textarea>` attributes it passes through. */
export interface ComposerOwnProps {
  /**
   * What the message box is for, read as its name: "Message Mia", "Reply in thread". Required:
   * the box shows `placeholder`, which is not a label.
   */
  label: string;
  /**
   * Called with the text when the person sends: Enter in the box (see `sendOn`) or the send
   * button. The event says which, and `event.isTrusted` that a person did it. It is not called
   * while the text is blank (unless there are `attachments`), while `sending`, or with
   * `sendDisabledReason` set. Without `value`, the box clears after it.
   */
  onSend: (text: string, event: ComposerSendEvent) => void;
  /** The text, for a controlled composer; pair it with `onValueChange`, and clear it yourself once the message is sent. */
  value?: string | undefined;
  /** The starting text, for an uncontrolled composer, which clears itself after a send. */
  defaultValue?: string | undefined;
  /** Called with the new text when it changes. */
  onValueChange?: ((value: string) => void) | undefined;
  /** An example of what to write, shown on the first line while the box is empty. */
  placeholder?: string | undefined;
  /**
   * Which key sends. `enter`: Enter sends and Shift+Enter starts a new line, as chat apps do.
   * `mod-enter`: Ctrl+Enter (Command+Enter on a Mac) sends and Enter starts a new line, for
   * long messages. Enter never sends while an input method is composing a word or while a
   * suggestion list (`Autocomplete`) is open, and an `expanded` composer sends on Ctrl+Enter.
   * @default "enter"
   * @claim "Enter never sends while an input" registry/ouro/components/ouro/composer/composer.test.tsx verify:testExists(registry/ouro/components/ouro/composer/composer.test.tsx::Composer > never sends on the Enter that ends a word an input method is composing)
   * @claim "Enter never sends while an input" registry/ouro/components/ouro/composer/composer.test.tsx verify:testExists(registry/ouro/components/ouro/composer/composer.test.tsx::Composer expanded > never sends while a suggestion list is open, Ctrl+Enter included)
   * @claim "and an `expanded` composer sends on" registry/ouro/components/ouro/composer/composer.test.tsx verify:testExists(registry/ouro/components/ouro/composer/composer.test.tsx::Composer expanded > starts a new line on Enter and sends on Ctrl+Enter or Command+Enter, whatever sendOn says)
   */
  sendOn?: "enter" | "mod-enter" | (string & { 'Use "enter" (Shift+Enter is a new line) or "mod-enter"': never }) | undefined;
  /** The send button's name, which its tooltip shows too. @default "Send" */
  sendLabel?: string | undefined;
  /** The message is on its way: the send button shows a spinner, and nothing more sends until it is done. */
  sending?: boolean | undefined;
  /** What screen readers hear when `sending` turns on. @default "Sending" */
  sendingLabel?: string | undefined;
  /**
   * Sending is off, and why: "Sending is off while you review the draft". The person can still
   * write; the send button is disabled, the reason shows under the box and is read with it,
   * and pressing Enter says it again.
   */
  sendDisabledReason?: string | undefined;
  /** Disables the whole composer: the box and the send button. */
  disabled?: boolean | undefined;
  /**
   * Files waiting to go with the message, shown in a row inside the box under the text:
   * `Attachment` items with `onRemove`. Pass it only when there are some; with it, the
   * message can be sent without text.
   */
  attachments?: ReactNode;
  /** A name for the attachments row, for screen readers. @default "Attachments" */
  attachmentsLabel?: string | undefined;
  /** Buttons before the send button: emoji, attach a file, show formatting. Ouro `Button`s with `variant="plain"` and an `aria-label`. */
  actions?: ReactNode;
  /**
   * Tools shown above the text, inside the box: a formatting bar. In a composer that expands, it
   * shows only while expanded; otherwise pass it only while it should show.
   */
  toolbar?: ReactNode;
  /** A quiet line under the box, read as the text's description: what the marks mean, a character count. */
  description?: ReactNode;
  /** Ranges of the text to mark in place, as TextArea's `highlights`: words an assistant suggested, spelling notes. */
  highlights?: readonly TextAreaHighlight[] | undefined;
  /** Called with the highlights moved to fit the text after the person edits it, as TextArea's. */
  onHighlightsChange?: ((highlights: TextAreaHighlight[]) => void) | undefined;
  /**
   * The bigger box for a long message, as a chat app's format button opens: taller (`expandedRows`,
   * growing to `expandedMaxRows`), with the `toolbar`, and Enter starts a new line while Ctrl+Enter
   * (Command+Enter on a Mac) or the send button sends, whatever `sendOn` says. It is the same text
   * either way, and the caret stays where it was. Escape collapses it, and that Escape goes no
   * further. The box grows and shrinks in height over a moment, and at once with reduced motion.
   * Controlled; pair it with `onExpandedChange`, or use `defaultExpanded`.
   *
   * @claim "Enter starts a new line while" registry/ouro/components/ouro/composer/composer.test.tsx verify:testExists(registry/ouro/components/ouro/composer/composer.test.tsx::Composer expanded > starts a new line on Enter and sends on Ctrl+Enter or Command+Enter, whatever sendOn says)
   * @claim "It is the same text either" registry/ouro/components/ouro/composer/composer.test.tsx verify:testExists(registry/ouro/components/ouro/composer/composer.test.tsx::Composer expanded > keeps the text, focus and the caret when it expands and collapses)
   * @claim "Escape collapses it, and that Escape" registry/ouro/components/ouro/composer/composer.test.tsx verify:testExists(registry/ouro/components/ouro/composer/composer.test.tsx::Composer expanded > collapses on Escape, and that Escape goes no further)
   * @claim "The box grows and shrinks in" registry/ouro/components/ouro/composer/composer.test.tsx verify:testExists(registry/ouro/components/ouro/composer/composer.test.tsx::Composer expanded > grows and shrinks in height over a moment, and at once with reduced motion)
   */
  expanded?: boolean | undefined;
  /** Whether it starts expanded, for an uncontrolled composer that the expand button opens; `false` to start small. */
  defaultExpanded?: boolean | undefined;
  /**
   * Called when the person expands or collapses it: the expand button, or Escape. With it, or with
   * `defaultExpanded`, the expand button shows first among the actions.
   * @claim "With it, or with `defaultExpanded`, the" registry/ouro/components/ouro/composer/composer.test.tsx verify:testExists(registry/ouro/components/ouro/composer/composer.test.tsx::Composer expanded > shows the expand button first among the actions, pressed while expanded, with the toolbar only while expanded)
   */
  onExpandedChange?: ((expanded: boolean) => void) | undefined;
  /** The expand button's name, which its tooltip shows too. @default "Expand" */
  expandLabel?: string | undefined;
  /** Lines the expanded box starts with. @default 6 */
  expandedRows?: number | undefined;
  /** Lines the expanded box grows to before it scrolls. @default 20 */
  expandedMaxRows?: number | undefined;
  /** Lines the box starts with; it grows as the person writes. @default 1 */
  rows?: number | undefined;
  /** Lines it grows to before it scrolls. @default 10 */
  maxRows?: number | undefined;
  /** The form field name the text submits under. */
  name?: string | undefined;
  /** Layout only: margins, width, grid placement (`mt-2`). Appearance classes warn in development. */
  className?: string | undefined;
  /** The `<textarea>`. */
  ref?: Ref<HTMLTextAreaElement> | undefined;

  /** Not a prop. Sending calls `onSend`: `<Composer onSend={(text) => send(text)}>`. */
  onSubmit?: { 'Use <Composer onSend={(text) => send(text)}>': never };
  /** Not a prop. Ouro UI uses `sendOn`: `<Composer sendOn="mod-enter">`. */
  submitOnEnter?: { 'Use <Composer sendOn="enter"> or sendOn="mod-enter"': never };
  /** Not a prop. Ouro UI uses `sendOn`: `<Composer sendOn="mod-enter">`. */
  enterToSend?: { 'Use <Composer sendOn="enter"> or sendOn="mod-enter"': never };
  /** Not a prop. Ouro UI uses `sending`: `<Composer sending>`. */
  loading?: { 'Use <Composer sending>': never };
  /** Not a prop. Ouro UI uses `sendDisabledReason`: `<Composer sendDisabledReason="Sending is off">`. */
  sendDisabled?: { 'Use <Composer sendDisabledReason="Sending is off">': never };
  /** Not a prop. A composer that expands takes `defaultExpanded` or `onExpandedChange`: `<Composer defaultExpanded={false}>`. */
  expandable?: { 'Use <Composer defaultExpanded={false}> or expanded with onExpandedChange': never };
}

/** Props for {@link Composer}: its own props and the `<textarea>` attributes it passes through (`onKeyDown`, `onPaste`, `readOnly`). */
export type ComposerProps = Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, keyof ComposerOwnProps | "children"> & ComposerOwnProps;

const sendKeys = ["enter", "mod-enter"] as const;

// One frame for the whole composer, with the field's border and one focus outline while the
// text has focus; the textarea inside draws neither.
const frameClass =
  "relative box-border flex min-w-0 flex-col rounded-lg border border-solid border-input bg-card text-card-foreground " +
  "outline-ring outline-offset-2 has-[textarea:focus-visible]:outline-2 has-[textarea:focus-visible]:outline-solid " +
  "[&_textarea:focus-visible]:outline-0";

// The row's height transition while the box expands or collapses, clipped: the classes are added
// for that moment only.
const growClasses = ["overflow-hidden", "transition-[height]", "duration-(--ouro-duration-base)", "ease-(--ouro-ease-out)"];

/** Arrows: out to expand, in to collapse. */
function ExpandIcon({ expanded }: { expanded: boolean }): JSX.Element {
  return (
    <svg aria-hidden="true" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="size-5 shrink-0">
      <path d={expanded ? "M4 11h5v5M11 4v5h5M9 11l-5 5M11 9l5-5" : "M11 4h5v5M9 16H4v-5M16 4l-5 5M4 16l5-5"} />
    </svg>
  );
}

/** A paper plane. */
function SendIcon(): JSX.Element {
  return (
    <svg aria-hidden="true" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" className="size-5 shrink-0 rtl:-scale-x-100">
      <path d="M3.5 3.2 17 10 3.5 16.8 5.6 10z" />
      <path d="M5.6 10h5.4" strokeLinecap="round" />
    </svg>
  );
}

/**
 * A chat message box: text that grows from one line as the person writes, a send button, and
 * room for the rest of a composer, in one frame with one focus outline. Enter sends and
 * Shift+Enter starts a new line, or `sendOn="mod-enter"` for Ctrl+Enter, and Enter never
 * sends mid-word in an input method. `actions` holds the buttons before Send (emoji, attach,
 * formatting), `toolbar` a formatting bar above the text while it is on, and `attachments`
 * the files waiting to go. `sendDisabledReason` turns sending off and says why, while the
 * person can still write, and `highlights` marks words in the text, as TextArea's do.
 *
 * The text is plain text, so emoji from an image catalogue go in as `:shortcode:` tokens: an
 * `Autocomplete` trigger with `catalogue` inserts them as the person types `:` and a few
 * letters, and an `EmojiPicker` with `catalogue` in `actions` gives its `selection.token` to
 * put at the caret. `EmojiText` draws the tokens as the catalogue's images once the message
 * is sent.
 *
 * Use `TextArea` instead for a long text that is saved rather than sent, and `Message` for
 * a message once it is sent.
 *
 * @group Chat
 * @see https://ui.ouro.bot/docs/composer
 *
 * @example
 * <Composer label="Message Mia" placeholder="Write a message" onSend={(text) => send(text)} />
 *
 * @example
 * <Composer
 *   label="Reply"
 *   value={text}
 *   onValueChange={setText}
 *   onSend={(text) => { send(text); setText(""); }}
 *   highlights={[{ start: 0, end: 22, label: "Suggested by your assistant" }]}
 *   description="Your assistant's suggestions are underlined."
 *   actions={<Button variant="plain" aria-label="Attach a file" onClick={attach}><PaperclipIcon /></Button>}
 *   attachments={files.length > 0 && files.map((file) => <Attachment key={file.name} name={file.name} onRemove={() => remove(file)} />)}
 *   sendDisabledReason={offline ? "You're offline. Sending resumes when you reconnect." : undefined}
 * />
 *
 * @example
 * <Composer label="Reply" defaultExpanded={false} toolbar={<Toolbar label="Formatting" items={formatting} />} onSend={(text) => send(text)} />
 * @claim "Enter sends and Shift+Enter starts" registry/ouro/components/ouro/composer/composer.test.tsx verify:testExists(registry/ouro/components/ouro/composer/composer.test.tsx::Composer > starts a new line on Shift+Enter, and sends on Ctrl+Enter or Command+Enter too)
 * @claim "Enter sends and Shift+Enter starts" registry/ouro/components/ouro/composer/composer.test.tsx verify:testExists(registry/ouro/components/ouro/composer/composer.test.tsx::Composer > never sends on the Enter that ends a word an input method is composing)
 * @claim "an `Autocomplete` trigger with `catalogue` inserts them" registry/ouro/components/ouro/autocomplete/autocomplete.catalogue.test.tsx verify:testExists(registry/ouro/components/ouro/autocomplete/autocomplete.catalogue.test.tsx::Autocomplete with a catalogue > inserts the picked emoji's token and a space in a Composer, which EmojiText draws as its image)
 * @claim "gives its `selection.token` to put at the caret" registry/ouro/components/ouro/emoji-picker/emoji-picker.catalogue.test.tsx verify:testExists(registry/ouro/components/ouro/emoji-picker/emoji-picker.catalogue.test.tsx::EmojiPicker with a catalogue > chooses an emoji: onSelect gets its id, name, token, tone and catalogue item, and the token draws as its image)
 * @claim "room for the rest of a composer" registry/ouro/components/ouro/composer/composer.test.tsx verify:testExists(registry/ouro/components/ouro/composer/composer.test.tsx::Composer > draws one focus outline, on the frame, while the text has focus, and none on the text itself)
 */
export function Composer(props: ComposerProps): JSX.Element {
  const {
    label,
    onSend,
    value,
    defaultValue,
    onValueChange,
    placeholder,
    sendOn: sendOnProp = "enter",
    sendLabel = "Send",
    sending = false,
    sendingLabel = "Sending",
    sendDisabledReason,
    disabled = false,
    attachments,
    attachmentsLabel = "Attachments",
    actions,
    toolbar: toolbarProp,
    description,
    highlights,
    onHighlightsChange,
    expanded: expandedProp,
    defaultExpanded,
    onExpandedChange,
    expandLabel = "Expand",
    expandedRows = 6,
    expandedMaxRows = 20,
    rows: rowsProp = 1,
    maxRows: maxRowsProp = 10,
    name,
    className,
    ref,
    onKeyDown,
    "aria-describedby": describedByProp,
    // Guard props (hint types), dropped here so they never reach the DOM.
    onSubmit,
    submitOnEnter,
    enterToSend,
    loading,
    sendDisabled,
    expandable: expandableHint,
    ...rest
  } = props;
  const [ownExpanded, setOwnExpanded] = useState(defaultExpanded ?? false);
  const expandable = expandedProp !== undefined || defaultExpanded !== undefined || onExpandedChange !== undefined;
  // The person can expand and collapse it: the composer holds the state, or the app listens.
  const canExpand = expandedProp === undefined ? expandable : onExpandedChange !== undefined;
  const expanded = expandedProp ?? ownExpanded;
  const rows = expanded ? expandedRows : rowsProp;
  const maxRows = expanded ? expandedMaxRows : maxRowsProp;
  const toolbar = expandable && !expanded ? undefined : toolbarProp;
  // Any other value is enter, as the default; expanded, Enter is a new line.
  const modEnter = expanded || sendOnProp === "mod-enter";
  const [own, setOwn] = useState(defaultValue ?? "");
  const text = value ?? own;
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  // The row around the text, and its height after the last render, from which it grows or shrinks when the box expands or collapses.
  const rowRef = useRef<HTMLDivElement | null>(null);
  const height = useRef<{ expanded: boolean; px: number } | null>(null);
  const setRef = useMergedRef(ref, textareaRef);
  const id = useId();
  const hasAttachments = Children.toArray(attachments).length > 0;
  const blocked = disabled || sending || sendDisabledReason !== undefined;
  const ready = !blocked && (text.trim() !== "" || hasAttachments);

  useAppearanceClassNameCheck(
    "Composer",
    className,
    process.env.NODE_ENV !== "production"
      ? (token: string) => `remove "${token}"; Composer takes its colors from the theme`
      : // Stryker disable next-line StringLiteral: production only; the check never runs there.
        /* istanbul ignore next @preserve -- production only */ "",
  );
  useDevWarnings(
    "Composer",
    process.env.NODE_ENV !== "production"
      ? () => [
          !(sendKeys as readonly string[]).includes(sendOnProp) && [`sendOn="${String(sendOnProp)}" is not a key; use "enter" or "mod-enter"`, '<Composer sendOn="enter">'],
          onSubmit !== undefined && ["onSubmit is not a prop; sending calls onSend", "<Composer onSend={(text) => send(text)}>"],
          submitOnEnter !== undefined && ["submitOnEnter is not a prop", '<Composer sendOn="enter">'],
          enterToSend !== undefined && ["enterToSend is not a prop", '<Composer sendOn="enter">'],
          loading !== undefined && ["loading is not a prop", "<Composer sending>"],
          sendDisabled !== undefined && ["sendDisabled is not a prop; say why sending is off", '<Composer sendDisabledReason="Sending is off">'],
          expandableHint !== undefined && ["expandable is not a prop; defaultExpanded or onExpandedChange shows the expand button", "<Composer defaultExpanded={false}>"],
        ]
      : /* istanbul ignore next @preserve -- production only */ undefined,
  );

  // A controlled composer reads its text from value, so its own copy is never read.
  const change = (next: string) => {
    setOwn(next);
    onValueChange?.(next);
  };
  const send = (event: ComposerSendEvent) => {
    if (sendDisabledReason !== undefined && !disabled) announce(sendDisabledReason);
    if (!ready) return;
    onSend(text, event);
    setOwn("");
    // After a press of Send, the person goes on writing; after Enter, focus is there already.
    textareaRef.current!.focus();
  };
  const setExpanded = (next: boolean) => {
    setOwnExpanded(next);
    onExpandedChange?.(next);
  };
  const toggleExpanded = () => {
    setExpanded(!expanded);
    // The person goes on writing where they were: the textarea keeps its caret while it has no focus.
    textareaRef.current!.focus();
  };
  // After every render, once TextArea has fitted the box: a render that expands or collapses it
  // grows or shrinks the row around the text from the height it had, clipped, while the text takes
  // its new height at once (so autoGrow measures it as ever). Any other render ends that at once.
  useLayoutEffect(() => {
    const row = rowRef.current!;
    const animating = row.style.height !== "";
    // What shows now: a running change's height, or the row's own.
    const shown = row.offsetHeight;
    row.style.height = "";
    const px = row.offsetHeight;
    const before = height.current;
    height.current = { expanded, px };
    const from = animating ? shown : before?.px;
    // A change still running stops at once here: its classes go once its transition is cancelled, below.
    if (before === null || before.expanded === expanded || matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    row.style.height = `${from}px`;
    void row.offsetHeight;
    row.classList.add(...growClasses);
    row.style.height = `${px}px`;
    // Once it ends, or is cancelled with nothing after it, the row takes its own height again.
    void Promise.allSettled(row.getAnimations().map((animation) => animation.finished)).then(() => {
      if (row.getAnimations().length > 0) return;
      row.classList.remove(...growClasses);
      row.style.height = "";
    });
  });
  const keyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    onKeyDown?.(event);
    // A word an input method is still composing ends with Enter, and Escape cancels it; those keys are the input method's.
    if (event.defaultPrevented || event.nativeEvent.isComposing || event.keyCode === 229) return;
    if (event.key === "Escape" && expanded && canExpand) {
      // This Escape is the expanded box's: a dialog around the composer stays open.
      event.preventDefault();
      event.stopPropagation();
      setExpanded(false);
      return;
    }
    // An open suggestion list (Autocomplete) owns Enter, Ctrl+Enter too.
    if (event.key !== "Enter" || event.currentTarget.hasAttribute("aria-activedescendant")) return;
    const sends = modEnter ? event.metaKey || event.ctrlKey : !event.shiftKey;
    if (!sends) return;
    event.preventDefault();
    send(event);
  };

  const notes = [sendDisabledReason !== undefined && !disabled ? `${id}-reason` : undefined, description ? `${id}-description` : undefined];
  const describedBy = [describedByProp, ...notes].filter(Boolean).join(" ") || undefined;

  return (
    <div data-ouro="composer" data-expanded={expanded ? "" : undefined} data-sending={sending ? "" : undefined} data-send-disabled={sendDisabledReason !== undefined ? "" : undefined} className={cn("box-border flex min-w-0 flex-col gap-1.5", className)}>
      <div data-ouro-composer-frame="" className={frameClass}>
        {toolbar && (
          <div data-ouro-composer-toolbar="" className="flex min-w-0 flex-wrap items-center gap-0.5 border-0 border-b border-solid border-border px-1 py-1">
            {toolbar}
          </div>
        )}
        <div ref={rowRef} data-ouro-composer-body="" className="flex min-w-0 flex-wrap items-end gap-x-1 p-1">
          <TextArea
            {...rest}
            ref={setRef}
            label={label}
            hideLabel
            name={name}
            variant="plain"
            autoGrow
            rows={rows}
            maxRows={maxRows}
            value={text}
            onValueChange={change}
            placeholder={placeholder}
            disabled={disabled}
            highlights={highlights}
            onHighlightsChange={onHighlightsChange}
            onKeyDown={keyDown}
            aria-describedby={describedBy}
            // Expanded, the text takes the whole width, and the buttons go on a row under it.
            className={cn("min-w-[min(12rem,100%)] flex-1 basis-48 px-2 py-2", expanded && "w-full flex-auto")}
          />
          <div className="ms-auto flex shrink-0 items-center gap-0.5">
            {canExpand && (
              <Tooltip content={expandLabel}>
                <Button
                  data-ouro-control="composer"
                  data-ouro-part="expand"
                  variant={expanded ? "outline" : "plain"}
                  tone={expanded ? "primary" : "secondary"}
                  aria-label={expandLabel}
                  aria-pressed={expanded}
                  disabled={disabled}
                  // A press keeps focus, and the caret, in the text.
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={toggleExpanded}
                  className="px-2"
                >
                  <ExpandIcon expanded={expanded} />
                </Button>
              </Tooltip>
            )}
            {actions}
            <Tooltip content={sendLabel}>
              <Button
                data-ouro-control="composer"
                data-ouro-part="send"
                variant="plain"
                aria-label={sendLabel}
                disabled={!ready && !sending}
                loading={sending}
                loadingLabel={sendingLabel}
                onClick={send}
                className="px-2"
              >
                <SendIcon />
              </Button>
            </Tooltip>
          </div>
        </div>
        {hasAttachments && (
          <div role="group" aria-label={attachmentsLabel} data-ouro-composer-attachments="" className="flex min-w-0 flex-wrap gap-2 px-2 pb-2">
            {attachments}
          </div>
        )}
      </div>
      {(notes[0] || description) && (
        <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 px-1 text-xs text-muted-foreground">
          {notes[0] && (
            <span id={notes[0]} data-ouro-composer-reason="" className="font-medium text-[color-mix(in_oklab,var(--muted-foreground)_70%,var(--foreground))]">
              {sendDisabledReason}
            </span>
          )}
          {description && (
            <span id={notes[1]} data-ouro-composer-description="">
              {description}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
