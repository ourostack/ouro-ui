"use client";

import "@/registry/ouro/lib/ouro/last-input";
import { Children, useEffect, useId, useImperativeHandle, useLayoutEffect, useRef, useState } from "react";
import type { ClipboardEvent, FocusEventHandler, FormEventHandler, JSX, KeyboardEvent, MouseEvent, ReactElement, ReactNode, Ref, TextareaHTMLAttributes } from "react";
import { Button } from "@/registry/ouro/components/ouro/button/button";
import type { RichEditor, RichEditorHandle } from "@/registry/ouro/components/ouro/composer/composer-parts";
import { composerDrafts, composerShortcuts, formatEdit, isApple, markFormats, pressed, richShortcuts } from "@/registry/ouro/components/ouro/composer/composer-styles";
import type { EmojiCatalogue } from "@/registry/ouro/components/ouro/emoji/emoji";
import { emojiTextToTokens } from "@/registry/ouro/components/ouro/emoji/emoji-styles";
import { Kbd } from "@/registry/ouro/components/ouro/kbd/kbd";
import { TextArea, type TextAreaHighlight } from "@/registry/ouro/components/ouro/text-field/text-area";
import { Tooltip } from "@/registry/ouro/components/ouro/tooltip/tooltip";
import { announce } from "@/registry/ouro/lib/ouro/announce";
import { useAppearanceClassNameCheck } from "@/registry/ouro/lib/ouro/class-name-check";
import { cn } from "@/registry/ouro/lib/ouro/cn";
import { insertText } from "@/registry/ouro/lib/ouro/insert-text";
import { ariaKeyShortcuts } from "@/registry/ouro/lib/ouro/key-shortcuts";
import { useMergedRef } from "@/registry/ouro/lib/ouro/refs";
import { useDevWarnings } from "@/registry/ouro/lib/ouro/use-dev-messages";
import { usePlatform } from "@/registry/ouro/lib/ouro/use-platform";

/** What sent the message: the Enter key in the box, or a press of the send button. */
export type ComposerSendEvent = KeyboardEvent<HTMLTextAreaElement | HTMLDivElement> | MouseEvent<HTMLButtonElement>;

type RichModule = typeof import("@/registry/ouro/components/ouro/composer/composer-parts");

let richLoading: Promise<RichModule> | undefined;
// The module itself, once the import above has settled, so a later mount in the same page draws it straight away instead of a plain box that swaps a tick later.
let richModule: RichModule | undefined;

// Loads the rich editor once, by a dynamic import, so Lexical stays out of a plain page's build.
function loadRich(): Promise<RichModule> {
  return (richLoading ??= import("@/registry/ouro/components/ouro/composer/composer-parts").then((loaded) => (richModule = loaded)));
}

/**
 * What the bubbling `ouro-composer-move` event carries while the box expands or collapses, so the
 * surroundings can follow on transforms: a thread that makes room, a header that keeps its place.
 * Listen on the composer's root or above; use `playing` to know when the move is over.
 *
 * @example
 * element.addEventListener("ouro-composer-move", (event) => {
 *   const { from, to, playing } = (event as CustomEvent<ComposerMove>).detail;
 * });
 */
export interface ComposerMove {
  /** The height the box showed when the move began, in pixels. */
  from: number;
  /** The height it ends at, in pixels. */
  to: number;
  /** Settles when the move has ended or the box has expanded or collapsed again and cut it short. */
  playing: Promise<void>;
}

/** The message a reply quotes, for Composer's `quote`: who wrote it and a line of what they wrote. */
export interface ComposerQuote {
  /** Who wrote the quoted message: "Ana Lind", or "You". */
  author: string;
  /**
   * What they wrote, or its start. One line shows, cut with an ellipsis.
   * @claim "One line shows, cut with" registry/ouro/components/ouro/composer/composer.test.tsx verify:testExists(registry/ouro/components/ouro/composer/composer.test.tsx::Composer quote > shows the quote inside the frame above the text: a bar, the author in semibold and the excerpt on one line, cut with an ellipsis)
   */
  excerpt: string;
  /**
   * What the quote shows in place of `author`, when plain text cannot draw it: a name with its
   * emoji as pictures (`<EmojiText text={name} catalogue={catalogue} />`). `author` stays the
   * name in the remove button's and screen readers' words.
   *
   * @claim "What the quote shows in place of `author`" registry/ouro/components/ouro/composer/composer.test.tsx verify:testExists(registry/ouro/components/ouro/composer/composer.test.tsx::Composer quote > shows authorContent and excerptContent in place of the author and the excerpt, while screen readers hear the text)
   */
  authorContent?: ReactNode;
  /**
   * What the quote shows in place of `excerpt`, when plain text cannot draw it: the line with its
   * emoji as pictures (`<EmojiText text={line} catalogue={catalogue} />`), on one line, cut with an
   * ellipsis. `excerpt` stays what screen readers hear.
   *
   * @claim "What the quote shows in place of `excerpt`" registry/ouro/components/ouro/composer/composer.test.tsx verify:testExists(registry/ouro/components/ouro/composer/composer.test.tsx::Composer quote > shows authorContent and excerptContent in place of the author and the excerpt, while screen readers hear the text)
   */
  excerptContent?: ReactNode;
  /** The author's picture, before the name: an `Avatar` element, `<Avatar name="Ana" src={url} alt="" size="xs" />`. */
  avatar?: ReactElement | undefined;
  /** Removes the quote: called by the remove button, and by Escape while the box is empty. Set `quote` to `undefined` in it. */
  onRemove: () => void;
  /** Makes the quote a button that shows the quoted message, as by scrolling to it. */
  onActivate?: (() => void) | undefined;
  /** What screen readers hear in place of the author's name, before the excerpt. @default `Quoting ${author}` */
  label?: string | undefined;
  /** The remove button's name, which its tooltip shows too. @default `Remove quote from ${author}` */
  removeLabel?: string | undefined;
}

/**
 * A format Composer applies to the selected text, as light Markdown: `bold` (`**`), `italic`
 * (`_`), `underline` (`++`), `strike` (`~~`) and `code` (a backtick) wrap it in marks, `bullets`,
 * `numbers` and `quote` mark its lines, and `codeBlock` fences them.
 */
export type ComposerFormat = "bold" | "italic" | "underline" | "strike" | "code" | "bullets" | "numbers" | "quote" | "codeBlock";

/** What an app's formatting bar, emoji button or link dialog changes the text with: `editorRef`. */
export interface ComposerEditor {
  /** Applies a format to the selection, or takes it away when the selection has it already. */
  format: (format: ComposerFormat) => void;
  /** Puts text in place of the selection, or at the caret: an emoji, a link. */
  insert: (text: string) => void;
}

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
  /**
   * Which conversation this box writes to, such as its id. An uncontrolled composer keeps the unsent draft of a conversation in
   * memory, so it is back when the person returns, and shows `defaultValue` for one with no draft; it holds a bounded number of
   * drafts, and a controlled one is the app's to keep and reset.
   *
   * @claim "An uncontrolled composer keeps the unsent draft of a conversation in memory, so it is back when the person returns, and shows `defaultValue` for one with no draft; it holds a bounded number of drafts, and a controlled one is the app's to keep and reset." registry/ouro/components/ouro/composer/composer.test.tsx verify:testExists(registry/ouro/components/ouro/composer/composer.test.tsx::Composer drafts > gives a draft back when the person returns to its conversation)
   */
  conversation?: string | undefined;
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
   * and pressing Enter says it again. `hideSendDisabledReason` leaves the line out.
   */
  sendDisabledReason?: string | undefined;
  /**
   * Keeps the `sendDisabledReason` line from being drawn under the box. Sending stays off, the
   * reason is still the box's description for screen readers, and Enter still says it. For two
   * composers side by side, so the reason shows under the one being written in only.
   * @claim "For two composers side by side" registry/ouro/components/ouro/composer/composer.test.tsx verify:testExists(registry/ouro/components/ouro/composer/composer.test.tsx::Composer states > with hideSendDisabledReason, keeps the reason as the box's description and says it on Enter, but draws no line for it)
   */
  hideSendDisabledReason?: boolean | undefined;
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
  /**
   * The message this one replies to, shown inside the box above the text until it is sent or
   * removed: a bar, the author, a line of what they wrote and a remove button. Screen readers
   * hear it as part of the text's description. Escape in the empty box removes it, as the
   * remove button does, and that Escape goes no further, so a dialog around the composer stays
   * open. The quote fades in (opacity only, and not at all with reduced motion) and takes no
   * focus: focus stays in the box. It stays after a send, so clear it in `onSend`.
   *
   * @claim "Screen readers hear it as part" registry/ouro/components/ouro/composer/composer.test.tsx verify:testExists(registry/ouro/components/ouro/composer/composer.test.tsx::Composer quote > describes the text with the quote, so screen readers hear what the reply quotes)
   * @claim "Escape in the empty box removes" registry/ouro/components/ouro/composer/composer.test.tsx verify:testExists(registry/ouro/components/ouro/composer/composer.test.tsx::Composer quote > removes the quote on Escape while the box is empty, and that Escape goes no further)
   * @claim "Escape in the empty box removes" registry/ouro/components/ouro/composer/composer.test.tsx verify:testExists(registry/ouro/components/ouro/composer/composer.test.tsx::Composer quote > leaves Escape alone while the box has text, while an input method composes, or after the app's onKeyDown prevents it)
   * @claim "The quote fades in (opacity" registry/ouro/components/ouro/composer/composer.test.tsx verify:testExists(registry/ouro/components/ouro/composer/composer.test.tsx::Composer quote > fades in with opacity only, and not at all with reduced motion)
   * @claim "takes no focus: focus stays in" registry/ouro/components/ouro/composer/composer.test.tsx verify:testExists(registry/ouro/components/ouro/composer/composer.test.tsx::Composer quote > leaves focus in the box when a quote appears)
   * @claim "It stays after a send, so" registry/ouro/components/ouro/composer/composer.test.tsx verify:testExists(registry/ouro/components/ouro/composer/composer.test.tsx::Composer quote > stays after a send until the app clears it)
   */
  quote?: ComposerQuote | undefined;
  /** Buttons before the send button: emoji, attach a file, show formatting. Ouro `Button`s with `variant="plain"` and an `aria-label`. */
  actions?: ReactNode;
  /**
   * Tools shown above the text, inside the box: a formatting bar. In a composer that expands, it
   * shows only while expanded; otherwise pass it only while it should show.
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
   * In `format="rich"` the box draws a token as the emoji's picture and the value stays the token.
   *
   * @claim "goes in as its `:shortcode:` token" registry/ouro/components/ouro/composer/composer.test.tsx verify:testExists(registry/ouro/components/ouro/composer/composer.test.tsx::Composer with a catalogue > puts a typed emoji in as its token, with the caret after it, in one step undo takes out)
   * @claim "or pasted goes in as its" registry/ouro/components/ouro/composer/composer.test.tsx verify:testExists(registry/ouro/components/ouro/composer/composer.test.tsx::Composer with a catalogue > puts pasted emoji in as their tokens, including joined and toned ones, and leaves those it does not list)
   */
  catalogue?: EmojiCatalogue | undefined;
  /**
   * Ranges of the text to mark in place, as TextArea's `highlights`: words an assistant suggested, spelling notes. In `format="rich"` the ranges are indexes into the Markdown `value`, which the box marks over the formatted text.
   *
   * @example
   * ```tsx
   * <Composer label="Message" format="rich" defaultValue="Meet at noon" highlights={[{ start: 8, end: 12, label: "Suggested time" }]} />
   * ```
   */
  highlights?: readonly TextAreaHighlight[] | undefined;
  /** Called with the highlights moved to fit the text after the person edits it, as TextArea's; in rich mode the ranges stay Markdown indexes. */
  onHighlightsChange?: ((highlights: TextAreaHighlight[]) => void) | undefined;
  /**
   * The bigger box for a long message, as a chat app's format button opens: taller (`expandedRows`,
   * growing to `expandedMaxRows`), with the `toolbar`, and Enter starts a new line while Ctrl+Enter
   * (Command+Enter on a Mac) or the send button sends, whatever `sendOn` says. It is the same text
   * either way, and the caret stays where it was. ⌘⇧X (Ctrl+Shift+X off Apple platforms) expands and
   * collapses it, as in Teams, and the expand button's tooltip shows the key. Escape collapses it,
   * and that Escape goes no further. The box takes its new height at once and a clip over its frame opens or closes to it, with the toolbar
   * fading and sliding as it comes and goes; with reduced motion nothing is clipped and the toolbar only fades in.
   * While it runs the frame carries `data-ouro-moving`, and a bubbling `ouro-composer-move` event (`ComposerMove`) tells
   * the surroundings the heights it moves between.
   * Controlled; pair it with `onExpandedChange`, or use `defaultExpanded`.
   *
   * @claim "Enter starts a new line while" registry/ouro/components/ouro/composer/composer.test.tsx verify:testExists(registry/ouro/components/ouro/composer/composer.test.tsx::Composer expanded > starts a new line on Enter and sends on Ctrl+Enter or Command+Enter, whatever sendOn says)
   * @claim "It is the same text either" registry/ouro/components/ouro/composer/composer.test.tsx verify:testExists(registry/ouro/components/ouro/composer/composer.test.tsx::Composer expanded > keeps the text, focus and the caret when it expands and collapses)
   * @claim "expands and collapses it, as in Teams" registry/ouro/components/ouro/composer/composer.test.tsx verify:testExists(registry/ouro/components/ouro/composer/composer.test.tsx::Composer formatting > expands and collapses on Command+Shift+X, and shows the key in the expand button's tooltip)
   * @claim "Escape collapses it, and that Escape" registry/ouro/components/ouro/composer/composer.test.tsx verify:testExists(registry/ouro/components/ouro/composer/composer.test.tsx::Composer expanded > collapses on Escape, and that Escape goes no further)
   * @claim "The box takes its new height at once" registry/ouro/components/ouro/composer/composer.test.tsx verify:testExists(registry/ouro/components/ouro/composer/composer.test.tsx::Composer expanded motion > moves one way in steps the curve allows, with no layout of the page around it, and ends on one line)
   * @claim "nothing is clipped and the toolbar only fades in" registry/ouro/components/ouro/composer/composer.test.tsx verify:testExists(registry/ouro/components/ouro/composer/composer.test.tsx::Composer expanded motion > only fades the toolbar in with reduced motion, and clips nothing)
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
  /**
   * Teams' formatting keys in the box: ⌘B bold, ⌘I italic, ⌘U underline, ⌘⌥X strikethrough and
   * ⌘⇧C code (Ctrl for ⌘, Alt for ⌥, off Apple platforms), each as a `ComposerFormat`.
   * `composerShortcuts` (from `composer-styles`) has the keys, for your toolbar's tooltips.
   *
   * @claim "Teams' formatting keys in the box" registry/ouro/components/ouro/composer/composer.test.tsx verify:testExists(registry/ouro/components/ouro/composer/composer.test.tsx::Composer formatting > applies Teams' formatting keys, and takes each back with Undo and gives it again with Redo)
   */
  formatting?: boolean | undefined;
  /**
   * `"rich"` swaps the text box for a rich-text editor: bold, italic, underline, strikethrough and
   * code, as the keys ⌘B, ⌘I, ⌘U, ⌘⇧X and ⌘⇧E, and as light Markdown typed (`**bold**`, `_italic_`,
   * `++underline++`, `~~strike~~`, a backtick for code). `value`, `defaultValue` and `onSend` stay
   * Markdown text, the shape the plain box has. The editor loads on first use, so a page with only
   * plain composers pays nothing for it; until it arrives, and on the server, a plain textarea
   * shows. A paste keeps only what an allowlist names: bold, italic, underline, strikethrough, code,
   * web and mail links, line breaks, and lists and quotes as lines with their Markdown marks; scripts,
   * styles, attributes and other links are dropped and their text kept. ⌘⇧V pastes the text only, a web
   * address pasted over selected text links it, and ⌘K links the selection or takes its link off: over
   * words that aren't an address it asks for one in its own popover, never the browser's prompt, and
   * with just the caret it still asks, the typed address becoming the new link's own text.
   * A `value` or `defaultValue` spelling italic with a star (`*italic*`) or bold with underscores
   * (`__bold__`) reads the same way and writes back out with that same mark, rather than switching
   * to the keys' own underscore or star; plain text keeps a star, an underscore or a tilde bare
   * where no pair of marks is near enough to read as formatting.
   * An `Autocomplete` around the composer works as around the plain box, for mentions and emoji
   * shortcodes: `ref` is the editor's element, which answers `value`, `selectionStart` and
   * `selectionEnd` over the text without its marks, and an input method's composition does not pick.
   * Attachments show as they do on the plain box. In rich mode `onPaste`
   * does not apply (`catalogue`, `highlights` and `pasteText` do: see their notes), and ⌘⇧X is strikethrough rather than expanding the box. Use `"plain"` (the default) for text only.
   *
   * @claim "`value`, `defaultValue` and `onSend` stay Markdown text" registry/ouro/components/ouro/composer/composer.rich.test.tsx verify:testExists(registry/ouro/components/ouro/composer/composer.rich.test.tsx::Composer rich mode > shows Markdown marks as formatting, and writes formatting back out as the same Markdown)
   * @claim "over words that aren't an address it asks for one in its own popover, never the browser's prompt" registry/ouro/components/ouro/composer/composer.rich-paste.test.tsx verify:testExists(registry/ouro/components/ouro/composer/composer.rich-paste.test.tsx::Composer rich paste > asks for an address in its own popover, never the browser's prompt, and links the words it was asked over)
   * @claim "with just the caret it still asks, the typed address becoming the new link's own text" registry/ouro/components/ouro/composer/composer.rich-paste.test.tsx verify:testExists(registry/ouro/components/ouro/composer/composer.rich-paste.test.tsx::Composer rich paste > asks for a link with just the caret too, the typed address becoming the new link's own text)
   * @claim "as the keys ⌘B, ⌘I, ⌘U, ⌘⇧X and ⌘⇧E" registry/ouro/components/ouro/composer/composer.rich.test.tsx verify:testExists(registry/ouro/components/ouro/composer/composer.rich.test.tsx::Composer rich mode > formats with the keys: mod+B, mod+I, mod+U, mod+Shift+X for strikethrough and mod+Shift+E for code)
   * @claim "so a page with only plain composers pays nothing for it" scripts/composer-weight.test.mjs verify:testExists(scripts/composer-weight.test.mjs::a page with a plain Composer loads no Lexical with it: the rich editor is a chunk fetched on first use)
   * @claim "until it arrives, and on the server, a plain textarea shows" registry/ouro/components/ouro/composer/composer.rich.test.tsx verify:testExists(registry/ouro/components/ouro/composer/composer.rich.test.tsx::Composer rich mode > renders the plain textarea on the server and until the editor has loaded, so the first render never touches the editor)
   * @claim "reads the same way and writes back out with that same mark" registry/ouro/components/ouro/composer/composer.rich.test.tsx verify:fileLine(registry/ouro/components/ouro/composer/composer.rich.test.tsx, /a star-spelled italic run.*Hi \*there[*]/) verify:fileLine(registry/ouro/components/ouro/composer/composer.rich.test.tsx, /an underscore-spelled bold run.*__bold__/)
   * @claim "plain text keeps a star, an underscore or a tilde bare where no pair of marks is near enough to read as formatting" registry/ouro/components/ouro/composer/composer.rich.test.tsx verify:fileLine(registry/ouro/components/ouro/composer/composer.rich.test.tsx, /a lone star with no partner, as in a sum.*2\*3=6/) verify:fileLine(registry/ouro/components/ouro/composer/composer.rich.test.tsx, /a mention with an underscore in its name.*@quiet_fox hi/)
   */
  format?: "plain" | "rich" | (string & { 'Use "plain" (the default) or "rich"': never }) | undefined;
  /**
   * What the rich editor's element (`ref`) answers `value`, `selectionStart`, `selectionEnd`,
   * `setSelectionRange` and `setRangeText` over. `"text"` (the default) is the text without its
   * marks, which is what an `Autocomplete` around the composer reads. `"markdown"` is the Markdown
   * `value` and `onValueChange` carry, so an app that keeps its draft as Markdown, such as one
   * co-edited by another writer, compares `element.value` with its draft and places a caret by the
   * same offsets: `setRangeText` replaces a range of the Markdown with Markdown and leaves the caret
   * after it. It reads at the time it is asked, so the prop can change while the box is open. It
   * does nothing with `format="plain"`, where the textarea reads its own text.
   *
   * @example
   * ```tsx
   * <Composer label="Reply" format="rich" offsets="markdown" ref={box} onSend={send} />
   * ```
   */
  offsets?: "text" | "markdown" | (string & { 'Use "text" (the default) or "markdown"': never }) | undefined;
  /**
   * A handle that formats the text and inserts into it, for a formatting bar, an emoji button or
   * a link dialog. Every change it makes, a key's format and a `pasteText` paste go through the
   * browser's own editing, as typing does, so Undo (⌘Z) and Redo (⌘⇧Z) step through them. WebKit
   * (Safari) can join changes made in a row into one step, as it joins typing.
   *
   * @claim "so Undo (⌘Z) and Redo" registry/ouro/components/ouro/composer/composer.test.tsx verify:testExists(registry/ouro/components/ouro/composer/composer.test.tsx::Composer formatting > formats and inserts from editorRef, each a step that Undo takes back)
   * @claim "can join changes made in a row" registry/ouro/components/ouro/composer/composer.test.tsx verify:testExists(registry/ouro/components/ouro/composer/composer.test.tsx::Composer formatting > applies Teams' formatting keys, and takes each back with Undo and gives it again with Redo)
   * @claim "so Undo (⌘Z) and Redo" registry/ouro/components/ouro/composer/composer.test.tsx verify:testExists(registry/ouro/components/ouro/composer/composer.test.tsx::Composer formatting > puts a paste through pasteText, as one step that Undo takes back)
   */
  editorRef?: Ref<ComposerEditor> | undefined;
  /**
   * Turns a paste into the box's text, such as formatted text into Markdown: return the text, or
   * `undefined` for the browser's own paste. With `format="rich"` the text is Markdown, and it
   * goes in as formatting before the clipboard's HTML reaches the allowlist.
   *
   * @example
   * <Composer format="rich" pasteText={(data) => data.getData("text/plain").replace(/^/gm, "> ")} />
   */
  pasteText?: ((data: DataTransfer) => string | undefined) | undefined;

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
  /** Not a prop. The message a reply quotes is `quote`: `<Composer quote={{ author: "Ana", excerpt: "Lunch?", onRemove }}>`. */
  replyTo?: { 'Use <Composer quote={{ author: "Ana", excerpt: "Lunch?", onRemove }}>': never };
  /** Not a prop. A composer that expands takes `defaultExpanded` or `onExpandedChange`: `<Composer defaultExpanded={false}>`. */
  expandable?: { 'Use <Composer defaultExpanded={false}> or expanded with onExpandedChange': never };
}

/** Props for {@link Composer}: its own props and the `<textarea>` attributes it passes through (`onKeyDown`, `onPaste`, `readOnly`). */
export type ComposerProps = Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, keyof ComposerOwnProps | "children"> & ComposerOwnProps;

const sendKeys = ["enter", "mod-enter"] as const;
const draftLimit = 50;

// One frame for the whole composer, with the field's border and one focus outline while the
// text has focus; the textarea inside draws neither.
const frameClass =
  "relative box-border flex min-w-0 flex-col rounded-ouro-lg border border-solid border-input bg-card text-card-foreground " +
  "ouro-field-cue outline-ring outline-offset-2 has-[textarea:focus-visible]:outline-2 has-[textarea:focus-visible]:outline-solid has-[[data-ouro-composer-editor]:focus-visible]:outline-2 has-[[data-ouro-composer-editor]:focus-visible]:outline-solid " +
  "[&_textarea:focus-visible]:outline-0 group/frame " +
  "data-[ouro-moving=grow]:motion-safe:animate-[ouro-composer-reveal_var(--ouro-duration-slow)_var(--ouro-ease-drawer)_both] " +
  "data-[ouro-moving=shrink]:motion-safe:animate-[ouro-composer-conceal_var(--ouro-duration-slow)_var(--ouro-ease-drawer)_both] data-[ouro-moving=shrink]:justify-end";

// The toolbar fades and slides up into place when the box expands, and out when it collapses; with
// reduced motion it only fades in.
const toolbarClass =
  "flex min-w-0 flex-wrap items-center gap-0.5 border-0 border-b border-solid border-border px-1 py-1 " +
  "group-data-[ouro-moving=grow]/frame:motion-safe:animate-[ouro-composer-toolbar-in_var(--ouro-duration-slow)_var(--ouro-ease-drawer)_both] " +
  "group-data-[ouro-moving=grow]/frame:motion-reduce:animate-[ouro-composer-fade-in_var(--ouro-duration-fast)_ease_both] " +
  "group-data-[ouro-moving=shrink]/frame:motion-safe:animate-[ouro-composer-toolbar-out_var(--ouro-duration-slow)_var(--ouro-ease-drawer)_both]";

// The quote: a box on the muted surface with a hairline, which fades in when it appears after the
// composer is on screen (not with reduced motion); a quote there at mount is drawn at once.
const quoteBoxClass =
  "flex min-w-0 items-center gap-2 rounded-ouro-inner [--ouro-fr:var(--radius-ouro-lg)] [--ouro-fi:0.5rem] bg-muted pe-1 ring-1 ring-border/60 forced-colors:border forced-colors:border-solid " +
  "transition-opacity duration-(--ouro-duration-base) ease-(--ouro-ease-out) motion-reduce:transition-none";
const quoteFadeClass = "starting:opacity-0";
const quoteBodyClass = "flex min-w-0 flex-1 items-center gap-2 p-1.5";
// The quote as a button: it highlights while hovered rather than scaling, as a wide row does, and
// with two lines of text it is taller than a touch target already.
const quoteButtonClass =
  `${quoteBodyClass} m-0 cursor-pointer rounded-ouro-inner [--ouro-fr:var(--radius-ouro-lg)] [--ouro-fi:0.5rem] border-0 bg-transparent text-start font-[inherit] text-inherit pointer-fine:hover:bg-accent ` +
  "outline-ring outline-offset-2 focus-visible:outline-2 focus-visible:outline-solid";

/**
 * What the quote shows: the bar, the avatar, the author and the excerpt. Screen readers hear the
 * label ("Quoting Ana") in place of the author's name, then the excerpt.
 */
function QuoteBody({ quote, id }: { quote: ComposerQuote; id: string }): JSX.Element {
  return (
    <>
      <span aria-hidden="true" data-ouro-composer-quote-bar="" className="w-ouro-1 shrink-0 self-stretch rounded-full bg-primary forced-colors:bg-[Highlight]" />
      {quote.avatar}
      <span className="flex min-w-0 flex-1 flex-col">
        <span id={`${id}-quote`} className="sr-only">
          {quote.label ?? `Quoting ${quote.author}`}:{" "}
        </span>
        <span aria-hidden="true" data-ouro-composer-quote-author="" className="truncate text-xs font-semibold text-foreground">
          {quote.authorContent ?? quote.author}
        </span>
        <span id={`${id}-excerpt`} data-ouro-composer-quote-excerpt="" className="truncate text-sm text-[color-mix(in_oklab,var(--muted-foreground)_80%,var(--foreground))]">
          {quote.excerptContent === undefined ? (
            quote.excerpt
          ) : (
            <>
              <span aria-hidden="true">{quote.excerptContent}</span>
              <span className="sr-only">{quote.excerpt}</span>
            </>
          )}
        </span>
      </span>
    </>
  );
}

/** A cross: remove. */
function RemoveIcon(): JSX.Element {
  return (
    <svg aria-hidden="true" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" className="size-ouro-4 shrink-0">
      <path d="M4 4l8 8M12 4l-8 8" />
    </svg>
  );
}

const reducedQuery = "(prefers-reduced-motion: reduce)";

// The visible height a running move has left to clear: the frame's clip-path inset from the top, in px.
const clipTop = (frame: HTMLElement) => Number(/inset\(([\d.]+)px/.exec(getComputedStyle(frame).clipPath)?.[1] ?? /* istanbul ignore next @preserve -- a move is only read while its clip runs, so the inset is always there; 0 only guards a clip the browser reports as none */ 0);

/** Arrows: out to expand, in to collapse. */
function ExpandIcon({ expanded }: { expanded: boolean }): JSX.Element {
  return (
    <svg aria-hidden="true" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="size-ouro-5 shrink-0">
      <path d={expanded ? "M4 11h5v5M11 4v5h5M9 11l-5 5M11 9l5-5" : "M11 4h5v5M9 16H4v-5M16 4l-5 5M4 16l5-5"} />
    </svg>
  );
}

/** A paper plane. */
function SendIcon(): JSX.Element {
  return (
    <svg aria-hidden="true" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" className="size-ouro-5 shrink-0 rtl:-scale-x-100">
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

// The app's own id and data-/aria- attributes, which the plain textarea already gets through its own {...rest}
// spread (`TextareaHTMLAttributes`): picked out so the rich editor's root can carry them too, since it takes
// named props instead of a spread.
function ownAttrsOf(rest: object): Record<string, unknown> {
  const picked: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(rest)) {
    if (key === "id" || key.startsWith("data-") || key.startsWith("aria-")) picked[key] = value;
  }
  return picked;
}

/**
 * A chat message box: text that grows from one line as the person writes, a send button, and
 * room for the rest of a composer, in one frame with one focus outline. Enter sends and
 * Shift+Enter starts a new line, or `sendOn="mod-enter"` for Ctrl+Enter, and Enter never
 * sends mid-word in an input method. A press anywhere around the text, out to the frame's
 * edge, puts the caret where it lands, as in a text field. `actions` holds the buttons before Send (emoji, attach,
 * formatting), `toolbar` a formatting bar above the text while it is on, `attachments`
 * the files waiting to go, and `quote` the message a reply quotes, which Escape in the empty
 * box removes. `sendDisabledReason` turns sending off and says why, while the
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
 * @see https://ui.ouroboros.bot/docs/composer
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
 * <Composer
 *   label="Reply to Ana"
 *   quote={quoted && { author: quoted.author, excerpt: quoted.text, onRemove: () => setQuoted(undefined), onActivate: () => scrollTo(quoted.id) }}
 *   onSend={(text) => { send(text, quoted?.id); setQuoted(undefined); }}
 * />
 *
 * @example
 * <Composer label="Reply" defaultExpanded={false} toolbar={<Toolbar label="Formatting" items={formatting} />} onSend={(text) => send(text)} />
 * @claim "Enter sends and Shift+Enter starts" registry/ouro/components/ouro/composer/composer.test.tsx verify:testExists(registry/ouro/components/ouro/composer/composer.test.tsx::Composer > starts a new line on Shift+Enter, and sends on Ctrl+Enter or Command+Enter too)
 * @claim "Enter sends and Shift+Enter starts" registry/ouro/components/ouro/composer/composer.test.tsx verify:testExists(registry/ouro/components/ouro/composer/composer.test.tsx::Composer > never sends on the Enter that ends a word an input method is composing)
 * @claim "an `Autocomplete` trigger with `catalogue` inserts them" registry/ouro/components/ouro/autocomplete/autocomplete.catalogue.test.tsx verify:testExists(registry/ouro/components/ouro/autocomplete/autocomplete.catalogue.test.tsx::Autocomplete with a catalogue > inserts the picked emoji's token and a space in a Composer, which EmojiText draws as its image)
 * @claim "gives its `selection.token` to put at the caret" registry/ouro/components/ouro/emoji-picker/emoji-picker.catalogue.test.tsx verify:testExists(registry/ouro/components/ouro/emoji-picker/emoji-picker.catalogue.test.tsx::EmojiPicker with a catalogue > chooses an emoji: onSelect gets its id, name, token, tone and catalogue item, and the token draws as its image)
 * @claim "A press anywhere around the" registry/ouro/components/ouro/composer/composer.test.tsx verify:testExists(registry/ouro/components/ouro/composer/composer.test.tsx::Composer presses around the text > puts the caret at the start of the text on a press in the box's top left corner)
 * @claim "A press anywhere around the" registry/ouro/components/ouro/composer/composer.test.tsx verify:testExists(registry/ouro/components/ouro/composer/composer.test.tsx::Composer presses around the text > puts the caret at the end of a line on a press between the line and the send button)
 * @claim "room for the rest of a composer" registry/ouro/components/ouro/composer/composer.test.tsx verify:testExists(registry/ouro/components/ouro/composer/composer.test.tsx::Composer > draws one focus outline, on the frame, while the text has focus, and none on the text itself)
 */
export function Composer(props: ComposerProps): JSX.Element {
  const platform = usePlatform();
  const {
    label,
    onSend,
    value,
    defaultValue,
    conversation,
    onValueChange,
    placeholder,
    sendOn: sendOnProp = "enter",
    sendLabel = "Send",
    sending = false,
    sendingLabel = "Sending",
    sendDisabledReason,
    hideSendDisabledReason = false,
    disabled = false,
    attachments,
    attachmentsLabel = "Attachments",
    quote,
    actions,
    toolbar: toolbarProp,
    description,
    highlights,
    onHighlightsChange,
    catalogue,
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
    formatting = false,
    format: formatMode = "plain",
    editorRef,
    offsets = "text",
    pasteText,
    onKeyDown,
    onPaste,
    "aria-describedby": describedByProp,
    // Guard props (hint types), dropped here so they never reach the DOM.
    onSubmit,
    submitOnEnter,
    enterToSend,
    loading,
    sendDisabled,
    replyTo,
    expandable: expandableHint,
    ...rest
  } = props;
  const [mounted, setMounted] = useState(false);
  useEffect(
    () => {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setMounted(true);
    },
    // Stryker disable next-line ArrayDeclaration: an effect that only sets a flag to true runs the same whatever its list holds.
    [],
  );
  const [ownExpanded, setOwnExpanded] = useState(defaultExpanded ?? false);
  const expandable = expandedProp !== undefined || defaultExpanded !== undefined || onExpandedChange !== undefined;
  // The person can expand and collapse it: the composer holds the state, or the app listens.
  const canExpand = expandedProp === undefined ? expandable : onExpandedChange !== undefined;
  const expanded = expandedProp ?? ownExpanded;
  const rows = expanded ? expandedRows : rowsProp;
  const maxRows = expanded ? expandedMaxRows : maxRowsProp;
  // The frame, and its height after the last render, from which it grows or shrinks when the box expands or collapses.
  const frameRef = useRef<HTMLDivElement | null>(null);
  const height = useRef<{ expanded: boolean; px: number } | null>(null);
  const move = useRef<{ end: () => void; full: number } | null>(null);
  // A collapse keeps the toolbar on screen while it fades out; the render that collapses sets this.
  const [wasExpanded, setWasExpanded] = useState(expanded);
  const [leaving, setLeaving] = useState(false);
  if (wasExpanded !== expanded) {
    setWasExpanded(expanded);
    // Stryker disable next-line ConditionalExpression,LogicalOperator: a leaving flag set when it need not be is cleared by the move's end, and the toolbar it keeps is the same one the app passed.
    setLeaving(!expanded && expandable && toolbarProp !== undefined && !matchMedia(reducedQuery).matches);
  }
  const toolbar = expandable && !expanded && !leaving ? undefined : toolbarProp;
  // Any other value is enter, as the default; expanded, Enter is a new line.
  const modEnter = expanded || sendOnProp === "mod-enter";
  const [own, setOwn] = useState(() => composerDrafts.get(conversation) ?? defaultValue ?? "");
  const [ownConversation, setOwnConversation] = useState(conversation);
  const kept = composerDrafts;
  // The effect below fills it after every render, before any cleanup reads it.
  const latest = useRef<{ conversation: string | undefined; own: string; defaultValue: string | undefined; controlled: boolean }>(undefined as never);
  useEffect(() => {
    latest.current = { conversation, own, defaultValue, controlled: value !== undefined };
  });
  // A composer that unmounts, such as the box of a conversation a phone leaves for the list, leaves its draft for the next one.
  useEffect(
    () => () => {
      const { conversation: id, own: draft, defaultValue: initial, controlled } = latest.current;
      if (id === undefined || controlled) return;
      kept.delete(id);
      if (draft !== "" && draft !== initial) kept.set(id, draft);
      if (kept.size > draftLimit) kept.delete(kept.keys().next().value);
    },
    // Stryker disable next-line ArrayDeclaration: `kept` is the module's one store, so the dependency never changes.
    [kept],
  );
  if (conversation !== ownConversation) {
    // The draft left behind waits for its conversation; the oldest of more than `draftLimit` are dropped.
    // A box with no conversation has no draft to keep, and the store is shared with every other box.
    if (ownConversation !== undefined) {
      kept.delete(ownConversation);
      if (own !== "") kept.set(ownConversation, own);
      if (kept.size > draftLimit) kept.delete(kept.keys().next().value);
    }
    setOwnConversation(conversation);
    setOwn(kept.get(conversation) ?? defaultValue ?? "");
  }
  const text = value ?? own;
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const setRef = useMergedRef(ref, textareaRef);
  const richRef = useRef<RichEditorHandle | null>(null);
  // Some sequences commit an input method's word as a plain insertText with no compositionend (ourostack/ouro-ui#3843): the rich editor sets this once it sees that happen, so a later Enter whose isComposing still reads true (the browser's own composition session never closed) is trusted as composing only until then.
  const richComposed = useRef(false);
  const [rich, setRich] = useState<{ Editor: typeof RichEditor; focus: boolean } | undefined>();
  useLayoutEffect(
    () => {
      // A page that already loaded the editor's module (an earlier Composer, or a swap in this same box) draws it before the paint that follows, so this mount never flashes the plain box: the server always renders plain, and this never runs there, so hydration still matches.
      // Stryker disable next-line ConditionalExpression,LogicalOperator: a plain mount, or one whose module has not loaded yet, is drawn by the effect below instead, exactly as before.
      if (!(formatMode === "rich" && richModule)) return;
      // Once this fills rich, a render this same mount triggers later (even one that retests the list below with a changed array) finds it already drawn and fills nothing twice.
      // Stryker disable next-line ConditionalExpression: rich starts undefined and nothing else fills it before this effect's first run, so this still lets that first fill through.
      /* istanbul ignore if @preserve -- the empty dependency array below means this body runs once per mount, so nothing has filled rich by its own first run to make this true */
      if (rich !== undefined) return;
      // eslint-disable-next-line react-hooks/set-state-in-effect -- a one-time fill before the first paint, as live-captions.demo.tsx's does
      setRich({ Editor: richModule.RichEditor, focus: rest.autoFocus === true });
    },
    // Only the warm cache at this mount is read here; a later format change or a cold load is the effect below's job. `rich` is read only to skip a repeat of this same fill, never to decide whether to run at all.
    // Stryker disable next-line ArrayDeclaration: a changed dependency array still finds rich already set, from this same fill, and stops at the check above.
    [], // eslint-disable-line react-hooks/exhaustive-deps
  );
  useEffect(() => {
    // Stryker disable next-line ConditionalExpression,EqualityOperator,StringLiteral,BlockStatement: loading the editor in plain mode changes nothing a person or a test can read, as richOn below also needs the rich format.
    if (formatMode !== "rich") return;
    // Stryker disable next-line ConditionalExpression: the layout effect above already drew the editor for this same mount, from a module that was already loaded; loading it again would only replace a correct focus flag with a wrong one.
    /* istanbul ignore if @preserve -- this closure is the one React commits from the mount that set rich, so a test never observes rich already set when this runs */
    if (rich !== undefined) return;
    // An app that turns rich on with the editor already loaded gets it at once, focus and all (its own change, not the load's).
    if (richModule) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- the format the app just chose, drawn in this same pass
      setRich({ Editor: richModule.RichEditor, focus: textareaRef.current === document.activeElement });
      return () => setRich(undefined);
    }
    let live = true;
    void loadRich().then(({ RichEditor: Editor }) => {
      // Stryker disable next-line ConditionalExpression: only a load that outlives an unmount skips this, and the dynamic import settles before a test can unmount in between.
      if (!live) return;
      const swap = () => void (live && setRich({ Editor, focus: false }));
      // A box the person is in stays theirs until they leave it: the editor replacing it under them would move their
      // focus (a screen reader says the box's name again) and their caret. The plain box takes their typing meanwhile.
      // After the swap the plain box is gone, and after cleanup `live` is false, so the listener needs no removing.
      const box = textareaRef.current;
      if (box && box === document.activeElement) box.addEventListener("blur", swap);
      else swap();
    });
    return () => {
      // Stryker disable next-line BooleanLiteral: a load that settles after the cleanup is ignored only by this flag, and no test can unmount in between.
      live = false;
      setRich(undefined);
    };
    // `rich` is read only to skip a redundant load the layout effect above already did for this same mount, never to decide whether to re-run.
  }, [formatMode]); // eslint-disable-line react-hooks/exhaustive-deps
  // Stryker disable next-line LogicalOperator,ConditionalExpression: the effect clears the loaded editor when the format changes, so only one render between them could tell.
  const richOn = formatMode === "rich" && rich !== undefined;
  // Stryker disable next-line LogicalOperator: richOn is true only when rich is loaded, so either side alone reads the same.
  const ActiveEditor = richOn && rich ? rich.Editor : undefined;
  const focusText = () => (richOn ? richRef.current!.focus() : textareaRef.current!.focus({ preventScroll: true }));
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
          // Stryker disable next-line StringLiteral: the example only shows in the console message.
          !(["plain", "rich"] as readonly string[]).includes(formatMode) && [`format="${String(formatMode)}" is not a format; use "plain" or "rich"`, '<Composer format="rich">'],
          // Stryker disable next-line StringLiteral: the example only shows in the console message.
          !(["text", "markdown"] as readonly string[]).includes(offsets) && [`offsets="${String(offsets)}" is not an offset; use "text" or "markdown"`, '<Composer format="rich" offsets="markdown">'],
          onSubmit !== undefined && ["onSubmit is not a prop; sending calls onSend", "<Composer onSend={(text) => send(text)}>"],
          submitOnEnter !== undefined && ["submitOnEnter is not a prop", '<Composer sendOn="enter">'],
          enterToSend !== undefined && ["enterToSend is not a prop", '<Composer sendOn="enter">'],
          loading !== undefined && ["loading is not a prop", "<Composer sending>"],
          sendDisabled !== undefined && ["sendDisabled is not a prop; say why sending is off", '<Composer sendDisabledReason="Sending is off">'],
          replyTo !== undefined && ["replyTo is not a prop; the message a reply quotes is quote", '<Composer quote={{ author: "Ana", excerpt: "Lunch?", onRemove }}>'],
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
    // After a press of Send, the person goes on writing; after Enter, focus is there already. No
    // box around the composer scrolls for it.
    focusText();
  };
  const setExpanded = (next: boolean) => {
    setOwnExpanded(next);
    onExpandedChange?.(next);
  };
  const toggleExpanded = () => {
    setExpanded(!expanded);
    // The person goes on writing where they were: the textarea keeps its caret while it has no focus.
    focusText();
  };
  const removeQuote = () => {
    quote!.onRemove();
    // The remove button goes with the quote, so focus goes back to the text, scrolling no box around it.
    focusText();
  };

  // After every render, once TextArea has fitted the box: a render that expands or collapses it
  // gives the frame its new height at once and clips it from the old one, the clip running to
  // nothing (a collapse reads its short height in a layout pass of its own first, then keeps the
  // toolbar and the old height while the clip closes). Nothing lays out while it runs.
  useLayoutEffect(() => {
    const frame = frameRef.current!;
    const running = move.current;
    // A render that leaves the box expanded or collapsed as it was lets the move run on.
    // Stryker disable next-line ConditionalExpression,OptionalChaining: a render that changes nothing during a move and one that restarts it with the same result differ only in frames a test cannot sample.
    if (running && height.current?.expanded === expanded) return;
    // The first render only notes its state; its height is read in the frame's own pass, not forced in the commit.
    if (!running && height.current === null) {
      const first = { expanded, px: Number.NaN };
      height.current = first;
      requestAnimationFrame(() => {
        if (height.current === first) first.px = frame.offsetHeight;
      });
      return;
    }
    const shown = running ? running.full - clipTop(frame) : frame.offsetHeight;
    running?.end();
    const toolbarElement = frame.querySelector<HTMLElement>("[data-ouro-composer-toolbar]");
    // Stryker disable next-line ConditionalExpression,LogicalOperator,StringLiteral: the hidden toolbar only changes the short height by the toolbar row, which the sampled browser tests cover but a mutant run cannot tell from the long one.
    if (toolbarElement && leaving) toolbarElement.style.display = "none";
    const px = frame.offsetHeight;
    // Stryker disable next-line ConditionalExpression,StringLiteral: showing the toolbar again is undone by the next render's own style, so a test reads the same box.
    if (toolbarElement) toolbarElement.style.display = "";
    const before = height.current;
    height.current = { expanded, px };
    if (before === null || before.expanded === expanded || Number.isNaN(before.px)) return;
    const reduced = matchMedia(reducedQuery).matches;
    if (reduced && !expanded) return;
    const from = running ? shown : before.px;
    // Stryker disable next-line EqualityOperator: a change of exactly half a pixel is no change a person sees.
    if (Math.abs(px - from) < 0.5 && !toolbarElement) return;
    // Stryker disable next-line ArrayDeclaration,ArrowFunction,ConditionalExpression: the elements only hold the animations' paused state for two frames, which a test cannot sample.
    const elements = [frame, toolbarElement].filter((element) => element !== null);
    frame.style.setProperty("--ouro-composer-gap", `${Math.abs(px - from)}px`);
    frame.style.setProperty("--ouro-composer-radius", getComputedStyle(frame).borderTopLeftRadius);
    if (!expanded) frame.style.minHeight = `${Math.max(from, px)}px`;
    // Stryker disable next-line StringLiteral: a paused state that is not "paused" only lets the first two frames run, which no test can sample.
    for (const element of elements) element.style.animationPlayState = "paused";
    frame.setAttribute("data-ouro-moving", expanded ? "grow" : "shrink");
    let finish!: () => void;
    const playing = new Promise<void>((resolve) => (finish = resolve));
    let frames = 0;
    let ended = false;
    const end = () => {
      if (ended) return;
      ended = true;
      // Stryker disable next-line all: cancelling the pending frame only stops a callback that the ended guard already ignores.
      cancelAnimationFrame(frames);
      frame.removeAttribute("data-ouro-moving");
      frame.style.minHeight = "";
      frame.style.removeProperty("--ouro-composer-gap");
      frame.style.removeProperty("--ouro-composer-radius");
      // Stryker disable next-line StringLiteral: clearing the paused state or writing any other value plays the animation the same.
      for (const element of elements) element.style.animationPlayState = "";
      move.current = null;
      setLeaving(false);
      finish();
    };
    move.current = { end, full: expanded ? px : Math.max(from, px) };
    // The animations wait two frames, so the commit's own work does not eat their first ones.
    frames = requestAnimationFrame(() => {
      frames = requestAnimationFrame(() => {
        for (const element of elements) element.style.animationPlayState = "";
        void Promise.allSettled(frame.getAnimations({ subtree: true }).map((animation) => animation.finished)).then(() => {
          // One more frame, so the browser reports the animations' ends before they are removed.
          frames = requestAnimationFrame(end);
        });
      });
    });
    frame.dispatchEvent(new CustomEvent<ComposerMove>("ouro-composer-move", { bubbles: true, detail: { from, to: px, playing } }));
  });
  // Stryker disable next-line ArrowFunction,ArrayDeclaration: the cleanup only settles a move an unmount cut short, which leaves nothing a test can read.
  useEffect(() => () => move.current?.end(), []);
  // Changes the text as the browser's own editing does, so Undo and Redo step through them; never in a read-only box.
  const edit = (change: (textarea: HTMLTextAreaElement) => void) => {
    const textarea = textareaRef.current!;
    if (!textarea.readOnly) change(textarea);
  };
  const format = (kind: ComposerFormat) =>
    richOn ? richRef.current!.format(kind) : edit((textarea) => {
      const change = formatEdit(textarea.value, textarea.selectionStart, textarea.selectionEnd, kind);
      insertText(textarea, change.from, change.to, change.text);
      textarea.setSelectionRange(change.start, change.end);
    });
  const insert = (text: string) => richOn ? richRef.current!.insert(text) : edit((textarea) => insertText(textarea, textarea.selectionStart, textarea.selectionEnd, text));
  useImperativeHandle(editorRef, () => ({ format, insert }));
  const keyDown = (event: KeyboardEvent<HTMLTextAreaElement | HTMLDivElement>) => {
    onKeyDown?.(event as KeyboardEvent<HTMLTextAreaElement>);
    // A word an input method is still composing ends with Enter, and Escape cancels it; those keys are the input method's.
    if (event.defaultPrevented || event.keyCode === 229) return;
    // A stale isComposing (ourostack/ouro-ui#3843) is trusted only until the editor itself has reported the word committed.
    if (event.nativeEvent.isComposing && !(richOn && richComposed.current)) return;
    const apple = isApple();
    const keys = richOn ? richShortcuts : composerShortcuts;
    const key = formatting || richOn ? markFormats.find((kind) => pressed(event, keys[kind], apple)) : undefined;
    if (key) {
      event.preventDefault();
      format(key);
      return;
    }
    if (canExpand && pressed(event, composerShortcuts.expand, apple)) {
      event.preventDefault();
      setExpanded(!expanded);
      return;
    }
    if (event.key === "Escape" && quote && text === "") {
      // This Escape is the quote's: a dialog around the composer stays open.
      event.preventDefault();
      event.stopPropagation();
      quote.onRemove();
      return;
    }
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

  // With a catalogue, an emoji typed (from the system's emoji panel, which inserts it whole) goes in as its token.
  useEffect(() => {
    if (!catalogue || richOn) return;
    const control = textareaRef.current!;
    const typed = (event: InputEvent) => {
      // A word an input method is composing is the input method's until it ends; a replacement without text inserts none.
      if (event.isComposing || event.data === null || (event.inputType !== "insertText" && event.inputType !== "insertReplacementText")) return;
      insertTokens(control, event, event.data, catalogue);
    };
    control.addEventListener("beforeinput", typed);
    return () => control.removeEventListener("beforeinput", typed);
  }, [catalogue, richOn]);
  const paste = (event: ClipboardEvent<HTMLTextAreaElement>) => {
    onPaste?.(event);
    if (event.defaultPrevented) return;
    // An app's pasteText turns the paste into the box's text; with a catalogue, its emoji go in as tokens either way.
    const custom = pasteText?.(event.clipboardData);
    if (custom === undefined) {
      if (catalogue) insertTokens(event.currentTarget, event, event.clipboardData.getData("text/plain"), catalogue);
      return;
    }
    event.preventDefault();
    insert(catalogue ? emojiTextToTokens(custom, catalogue) : custom);
  };

  const notes = [sendDisabledReason !== undefined && !disabled ? `${id}-reason` : undefined, description ? `${id}-description` : undefined];
  const quoteIds = quote ? [`${id}-quote`, `${id}-excerpt`] : [];
  const removeLabel = quote && (quote.removeLabel ?? `Remove quote from ${quote.author}`);
  const describedBy = [describedByProp, ...quoteIds, ...notes].filter(Boolean).join(" ") || undefined;
  const reasonDrawn = notes[0] !== undefined && !hideSendDisabledReason;
  const reasonHidden = notes[0] !== undefined && hideSendDisabledReason;

  return (
    <div data-ouro="composer" data-expanded={expanded ? "" : undefined} data-sending={sending ? "" : undefined} data-send-disabled={sendDisabledReason !== undefined ? "" : undefined} className={cn("box-border flex min-w-0 flex-col gap-2", className)}>
      <div ref={frameRef} data-ouro-composer-frame="" data-ouro-part="frame" className={frameClass}>
        {toolbar && (
          <div data-ouro-composer-toolbar="" data-ouro-part="toolbar" className={toolbarClass}>
            {toolbar}
          </div>
        )}
        {quote && (
          <div className="px-2 pt-2">
            <div data-ouro-composer-quote="" className={cn(quoteBoxClass, mounted && quoteFadeClass)}>
              {quote.onActivate ? (
                <button type="button" data-ouro-control="composer" data-ouro-part="quote" onClick={quote.onActivate} className={quoteButtonClass}>
                  <QuoteBody quote={quote} id={id} />
                </button>
              ) : (
                <div className={quoteBodyClass}>
                  <QuoteBody quote={quote} id={id} />
                </div>
              )}
              <Tooltip content={removeLabel}>
                <Button data-ouro-control="composer" data-ouro-part="remove" variant="plain" tone="secondary" size="sm" disabled={disabled} onClick={removeQuote} className="px-1.5">
                  <RemoveIcon />
                  <span className="sr-only">{removeLabel}</span>
                </Button>
              </Tooltip>
            </div>
          </div>
        )}
        {/* The text's padding is the textarea's own, out to the frame's edge, so a press anywhere around the text takes the caret where it lands. At rest the padding makes the text row as tall as the actions' (the send button, lg, and its padding), so one line sits centred beside the icons; the actions stay at the bottom as the text grows. */}
        <div data-ouro-composer-body="" className="flex min-w-0 flex-wrap items-end [--ouro-composer-action-h:calc(var(--spacing)*11)] [--ouro-composer-lh:1.5rem] [--ouro-composer-py:calc((var(--ouro-composer-action-h)+var(--spacing)*2-var(--ouro-composer-lh))/2)] [&_:is(textarea,[data-ouro-composer-editor],[data-ouro-composer-placeholder])]:[--ouro-text-area-py:var(--ouro-composer-py)] sm:[--ouro-composer-action-h:calc(var(--spacing)*9)] sm:pointer-fine:[--ouro-composer-lh:1.25rem]">
          {ActiveEditor ? (
            <ActiveEditor
              handleRef={richRef}
              catalogue={catalogue}
              highlights={highlights}
              onHighlightsChange={onHighlightsChange}
              pasteText={pasteText}
              label={label}
              value={text}
              onValueChange={change}
              placeholder={placeholder}
              disabled={disabled}
              readOnly={rest.readOnly}
              describedBy={describedBy}
              rows={rows}
              maxRows={maxRows}
              onKeyDown={keyDown}
              enterSends={!modEnter}
              composedRef={richComposed}
              autoFocus={rich!.focus}
              name={name}
              controlRef={ref as Ref<HTMLDivElement> | undefined}
              markdownOffsets={offsets === "markdown"}
              onInput={rest.onInput as FormEventHandler<HTMLDivElement> | undefined}
              onSelect={rest.onSelect as FormEventHandler<HTMLDivElement> | undefined}
              onFocus={rest.onFocus as FocusEventHandler<HTMLDivElement> | undefined}
              onBlur={rest.onBlur as FocusEventHandler<HTMLDivElement> | undefined}
              ownAttrs={ownAttrsOf(rest)}
              comboboxProps={{
                role: rest["aria-autocomplete"] ? "combobox" : rest.role,
                "aria-expanded": rest["aria-autocomplete"] ? !!rest["aria-controls"] : undefined,
                "aria-autocomplete": rest["aria-autocomplete"],
                "aria-controls": rest["aria-controls"],
                "aria-activedescendant": rest["aria-activedescendant"],
              }}
              data-slot="composer-rich"
              className={cn("min-w-[min(12rem,100%)] flex-1 basis-48 ps-3 pe-2", expanded && "w-full flex-auto")}
            />
          ) : (
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
            // Expanded, the text takes the whole width, and the buttons go on a row under it.
            className={cn("min-w-[min(12rem,100%)] flex-1 basis-48 [&_textarea]:ps-3 [&_textarea]:pe-2", expanded && "w-full flex-auto")}
          />
          )}
          <div className="ms-auto flex shrink-0 items-center gap-0.5 p-1">
            {canExpand && (
              <Tooltip
                content={
                  <span className="inline-flex items-center gap-2">
                    {expandLabel}
                    <Kbd keys={composerShortcuts.expand} />
                  </span>
                }
              >
                <Button
                  data-ouro-control="composer"
                  data-ouro-part="expand"
                  variant={expanded ? "outline" : "plain"}
                  tone={expanded ? "primary" : "secondary"}
                  aria-label={expandLabel}
                  aria-pressed={expanded}
                  aria-keyshortcuts={ariaKeyShortcuts(composerShortcuts.expand, platform)}
                  disabled={disabled}
                  // A press keeps focus, and the caret, in the text.
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={toggleExpanded}
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
                aria-describedby={notes[0]}
                disabled={!ready && !sending}
                loading={sending}
                loadingLabel={sendingLabel}
                onClick={send}
              >
                <SendIcon />
              </Button>
            </Tooltip>
          </div>
        </div>
        {hasAttachments && (
          <div role="group" aria-label={attachmentsLabel} data-ouro-composer-attachments="" className="flex min-w-0 flex-wrap gap-2 px-2 pt-1 pb-2">
            {attachments}
          </div>
        )}
      </div>
      {(reasonDrawn || description) && (
        <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 px-1 text-xs text-muted-foreground">
          {reasonDrawn && (
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
      {reasonHidden && (
        <span id={notes[0]} data-ouro-composer-reason="" className="sr-only">
          {sendDisabledReason}
        </span>
      )}
    </div>
  );
}
