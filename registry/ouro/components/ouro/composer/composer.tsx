"use client";

import { Children, useEffect, useId, useRef, useState } from "react";
import type { ClipboardEvent, JSX, KeyboardEvent, MouseEvent, ReactNode, Ref, TextareaHTMLAttributes } from "react";
import { Button } from "@/registry/ouro/components/ouro/button/button";
import type { EmojiCatalogue } from "@/registry/ouro/components/ouro/emoji/emoji";
import { emojiTextToTokens } from "@/registry/ouro/components/ouro/emoji/emoji-styles";
import { TextArea, type TextAreaHighlight } from "@/registry/ouro/components/ouro/text-field/text-area";
import { Tooltip } from "@/registry/ouro/components/ouro/tooltip/tooltip";
import { announce } from "@/registry/ouro/lib/ouro/announce";
import { useAppearanceClassNameCheck } from "@/registry/ouro/lib/ouro/class-name-check";
import { cn } from "@/registry/ouro/lib/ouro/cn";
import { insertText } from "@/registry/ouro/lib/ouro/insert-text";
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
   * long messages. Enter never sends while an input method is composing a word.
   * @default "enter"
   * @claim "Enter never sends while an input" registry/ouro/components/ouro/composer/composer.test.tsx verify:testExists(registry/ouro/components/ouro/composer/composer.test.tsx::Composer > never sends on the Enter that ends a word an input method is composing)
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
   * Tools shown above the text, inside the box: a formatting bar. Pass it only while it
   * should show, as when the person turns formatting on.
   */
  toolbar?: ReactNode;
  /** A quiet line under the box, read as the text's description: what the marks mean, a character count. */
  description?: ReactNode;
  /**
   * An image emoji catalogue. With it, an emoji typed into the box (from the system's emoji
   * panel, say) or pasted goes in as its `:shortcode:` token, the token `Autocomplete` and
   * `EmojiPicker` insert, so the text holds the catalogue's emoji only as tokens, which
   * `EmojiText` draws as its images. That includes an emoji joined from others and one with a
   * skin tone, which become the catalogue's emoji or tone for it; an emoji the catalogue does
   * not list stays as it is. The caret lands after what went in, and one undo takes it out.
   *
   * @claim "goes in as its `:shortcode:` token" registry/ouro/components/ouro/composer/composer.test.tsx verify:testExists(registry/ouro/components/ouro/composer/composer.test.tsx::Composer with a catalogue > puts a typed emoji in as its token, with the caret after it, in one step undo takes out)
   * @claim "or pasted goes in as its" registry/ouro/components/ouro/composer/composer.test.tsx verify:testExists(registry/ouro/components/ouro/composer/composer.test.tsx::Composer with a catalogue > puts pasted emoji in as their tokens, including joined and toned ones, and leaves those it does not list)
   */
  catalogue?: EmojiCatalogue | undefined;
  /** Ranges of the text to mark in place, as TextArea's `highlights`: words an assistant suggested, spelling notes. */
  highlights?: readonly TextAreaHighlight[] | undefined;
  /** Called with the highlights moved to fit the text after the person edits it, as TextArea's. */
  onHighlightsChange?: ((highlights: TextAreaHighlight[]) => void) | undefined;
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
 * Puts text in at the caret, in place of the browser's own insertion, with the catalogue's
 * tokens for the emoji it lists, when it has any; otherwise the browser inserts it as usual.
 * One edit, so one undo takes it out.
 */
function insertTokens(control: HTMLTextAreaElement, event: { preventDefault(): void }, text: string, catalogue: EmojiCatalogue): void {
  const tokens = emojiTextToTokens(text, catalogue);
  if (tokens === text) return;
  event.preventDefault();
  insertText(control, control.selectionStart, control.selectionEnd, tokens);
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
 * is sent. Given the `catalogue` too, Composer puts an emoji typed from the system's emoji
 * panel or pasted in as its token as well.
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
    toolbar,
    description,
    highlights,
    onHighlightsChange,
    catalogue,
    rows = 1,
    maxRows = 10,
    name,
    className,
    ref,
    onKeyDown,
    onPaste,
    "aria-describedby": describedByProp,
    // Guard props (hint types), dropped here so they never reach the DOM.
    onSubmit,
    submitOnEnter,
    enterToSend,
    loading,
    sendDisabled,
    ...rest
  } = props;
  // Any other value is enter, as the default.
  const modEnter = sendOnProp === "mod-enter";
  const [own, setOwn] = useState(defaultValue ?? "");
  const text = value ?? own;
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
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
  const keyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    onKeyDown?.(event);
    // A word an input method is still composing ends with Enter; that Enter is the input method's.
    if (event.defaultPrevented || event.key !== "Enter" || event.nativeEvent.isComposing || event.keyCode === 229) return;
    const sends = modEnter ? event.metaKey || event.ctrlKey : !event.shiftKey;
    if (!sends) return;
    event.preventDefault();
    send(event);
  };

  // With a catalogue, an emoji typed (from the system's emoji panel, which inserts it whole) goes in as its token.
  useEffect(() => {
    if (!catalogue) return;
    const control = textareaRef.current!;
    const typed = (event: InputEvent) => {
      // A word an input method is composing is the input method's until it ends.
      if (event.isComposing || (event.inputType !== "insertText" && event.inputType !== "insertReplacementText")) return;
      insertTokens(control, event, event.data ?? "", catalogue);
    };
    control.addEventListener("beforeinput", typed);
    return () => control.removeEventListener("beforeinput", typed);
  }, [catalogue]);
  const paste = (event: ClipboardEvent<HTMLTextAreaElement>) => {
    onPaste?.(event);
    if (catalogue && !event.defaultPrevented) insertTokens(event.currentTarget, event, event.clipboardData.getData("text/plain"), catalogue);
  };

  const notes = [sendDisabledReason !== undefined && !disabled ? `${id}-reason` : undefined, description ? `${id}-description` : undefined];
  const describedBy = [describedByProp, ...notes].filter(Boolean).join(" ") || undefined;

  return (
    <div data-ouro="composer" data-sending={sending ? "" : undefined} data-send-disabled={sendDisabledReason !== undefined ? "" : undefined} className={cn("box-border flex min-w-0 flex-col gap-1.5", className)}>
      <div data-ouro-composer-frame="" className={frameClass}>
        {toolbar && (
          <div data-ouro-composer-toolbar="" className="flex min-w-0 flex-wrap items-center gap-0.5 border-0 border-b border-solid border-border px-1 py-1">
            {toolbar}
          </div>
        )}
        <div className="flex min-w-0 flex-wrap items-end gap-x-1 p-1">
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
            onPaste={paste}
            aria-describedby={describedBy}
            className="min-w-[min(12rem,100%)] flex-1 basis-48 px-2 py-2"
          />
          <div className="ms-auto flex shrink-0 items-center gap-0.5">
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
