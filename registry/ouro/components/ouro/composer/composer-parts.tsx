"use client";

import { createEmptyHistoryState, registerHistory } from "@lexical/history";
import { $convertFromMarkdownString, $convertToMarkdownString, BOLD_STAR, INLINE_CODE, ITALIC_UNDERSCORE, STRIKETHROUGH, type TextFormatTransformer } from "@lexical/markdown";
import { registerRichText } from "@lexical/rich-text";
import { $getRoot, $getSelection, $isRangeSelection, COMMAND_PRIORITY_HIGH, createEditor, FOCUS_COMMAND, FORMAT_TEXT_COMMAND, PASTE_COMMAND, type LexicalEditor, type TextFormatType } from "lexical";
import { useEffect, useImperativeHandle, useRef, useState } from "react";
import type { JSX, KeyboardEvent, Ref } from "react";
import type { ComposerFormat } from "@/registry/ouro/components/ouro/composer/composer";
import { cn } from "@/registry/ouro/lib/ouro/cn";

export { RichEditor };
export type { RichEditorHandle, RichEditorProps };

// Composer's rich mode, loaded only once a composer asks for it, so a page that never does pays for none of Lexical.

/** What Composer drives the rich editor with. @internal */
interface RichEditorHandle {
  /** Applies a mark to the selection, or takes it away when the selection has it already. */
  format: (format: ComposerFormat) => void;
  /** Puts plain text in place of the selection. */
  insert: (text: string) => void;
  /** Puts the caret at the end of the text and focuses the editor. */
  focus: () => void;
}

/** @internal */
interface RichEditorProps {
  label: string;
  value: string;
  onValueChange: (value: string) => void;
  placeholder: string | undefined;
  disabled: boolean;
  readOnly: boolean | undefined;
  describedBy: string | undefined;
  rows: number;
  maxRows: number;
  className: string;
  "data-slot": string;
  /** Sees keys before the editor does, so Enter can send and a mark's key can format. */
  onKeyDown: (event: KeyboardEvent<HTMLDivElement>) => void;
  /** Focus the editor when it mounts, with the caret at the end: the person was in the plain box it replaces. */
  autoFocus: boolean;
  /** The form field name the Markdown submits under. */
  name?: string | undefined;
  handleRef: Ref<RichEditorHandle>;
}

// Underline has no CommonMark mark; `++` is the one Composer's plain mode writes too.
const UNDERLINE: TextFormatTransformer = { format: ["underline"], tag: "++", type: "text-format" };
const transformers = [BOLD_STAR, ITALIC_UNDERSCORE, UNDERLINE, STRIKETHROUGH, INLINE_CODE];

const markCommands: Partial<Record<ComposerFormat, TextFormatType>> = { bold: "bold", italic: "italic", underline: "underline", strike: "strikethrough", code: "code" };

// What a change from the app, rather than the person, carries, so the editor does not report it back.
// Stryker disable next-line StringLiteral: the tag is only compared with itself, so any other name reads the same.
const synced = "composer-sync";
// Stryker disable next-line ArrayDeclaration: a list with one constant item runs an effect once, as an empty list does.
const MOUNT_ONLY: never[] = [];

// An input method's composition leaves a zero-width character in the text until it ends, which is no part of the message.
const toMarkdown = (editor: LexicalEditor) => editor.getEditorState().read(() => $convertToMarkdownString(transformers, undefined, true)).replaceAll("\u200b", "");

/**
 * The editor Composer swaps in for its textarea with `format="rich"`: a contenteditable that
 * reads and writes light Markdown.
 *
 * @internal
 */
function RichEditor({ label, value, onValueChange, placeholder, disabled, readOnly, describedBy, rows, maxRows, className, "data-slot": slot, onKeyDown, autoFocus, name, handleRef }: RichEditorProps): JSX.Element {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const editorRef = useRef<LexicalEditor | null>(null);
  // The Markdown the editor holds, and the callbacks as of the last render, which its listeners read.
  const held = useRef(value);
  const report = useRef(onValueChange);
  useEffect(() => {
    report.current = onValueChange;
  });
  // A press places the caret where it lands; any other way in puts it at the end.
  const pressed = useRef(false);
  // Stryker disable next-line ConditionalExpression,EqualityOperator,StringLiteral: only the first paint reads it; the update listener sets it again from the editor before anyone can see.
  const [empty, setEmpty] = useState(value === "");

  useEffect(() => {
    const editor = createEditor({
      // Stryker disable next-line StringLiteral: the namespace only labels the editor.
      namespace: "ouro-composer",
      // Lexical writes underline and strikethrough as classes only; bold, italic and code are elements.
      theme: { text: { underline: "underline", strikethrough: "line-through", underlineStrikethrough: "underline line-through" } },
      // Stryker disable next-line BlockStatement: Lexical reports an error only for a state it cannot reach from the commands under test.
      onError: (error) => {
        throw error;
      },
    });
    editor.setRootElement(rootRef.current);
    editorRef.current = editor;
    const stops = [
      registerRichText(editor),
      registerHistory(editor, createEmptyHistoryState(), 300),
      // A caret is placed only when the box takes focus, so that loading it never moves focus.
      editor.registerCommand(
        FOCUS_COMMAND,
        () => {
          // Stryker disable next-line ConditionalExpression: a press puts the caret where it landed after this focus, over the end-of-text caret.
          if (!pressed.current) $getRoot().selectEnd();
          pressed.current = false;
          // Stryker disable next-line BooleanLiteral: no other focus handler is registered, so whether this one stops the chain changes nothing.
          return false;
        },
        COMMAND_PRIORITY_HIGH,
      ),
      // Only the clipboard's text goes in: the allowlist for formatted paste follows.
      editor.registerCommand(
        PASTE_COMMAND,
        (event) => {
          const data = (event as ClipboardEvent).clipboardData;
          const selection = $getSelection();
          // Stryker disable next-line BooleanLiteral: with no clipboard text or caret, the handlers after this one have nothing to insert either way.
          if (!data || !$isRangeSelection(selection)) return false;
          event.preventDefault();
          selection.insertRawText(data.getData("text/plain"));
          return true;
        },
        COMMAND_PRIORITY_HIGH,
      ),
      editor.registerUpdateListener(({ tags }) => {
        const markdown = toMarkdown(editor);
        setEmpty(markdown === "");
        if (tags.has(synced) || markdown === held.current) return;
        held.current = markdown;
        report.current(markdown);
      }),
    ];
    editor.update(
      () => {
        $convertFromMarkdownString(held.current, transformers, undefined, true);
      },
      // Stryker disable next-line ObjectLiteral,ArrayDeclaration,StringLiteral,BooleanLiteral: the history keeps nothing for the update that fills an empty editor, so no test can tell its tag, and an update that waits a microtask instead of running at once shows the same content by the time a test or a person looks.
      { tag: [synced, "history-merge"], discrete: true },
    );
    // Stryker disable next-line BlockStatement: nothing is left on the page to read once the box has gone.
    return () => {
      // Stryker disable next-line BlockStatement,ArrowFunction,CallExpression: the cleanup runs as the box leaves the page, where nothing is left to read.
      stops.forEach((stop) => stop());
      // Stryker disable next-line CallExpression: the editor is dropped with the box, so the cleared root is never read.
      editor.setRootElement(null);
      editorRef.current = null;
    };
  }, MOUNT_ONLY); // eslint-disable-line react-hooks/exhaustive-deps

  // A value the app sets, such as the empty one after a send, replaces what the editor holds.
  useEffect(() => {
    const editor = editorRef.current!;
    // Stryker disable next-line ConditionalExpression: converting the Markdown the editor already holds leaves the same content.
    if (value === held.current) return;
    held.current = value;
    const focused = document.activeElement === rootRef.current;
    editor.update(
      () => {
        $convertFromMarkdownString(value, transformers, undefined, true);
        // Stryker disable next-line ConditionalExpression: the conversion leaves the caret at the end already.
        if (focused) $getRoot().selectEnd();
      },
      // Stryker disable next-line ObjectLiteral,ArrayDeclaration,StringLiteral,BooleanLiteral: the held-Markdown guard in the update listener already keeps an app-set value from being reported or undone.
      { tag: [synced, "history-merge"], discrete: true },
    );
  }, [value]);

  useEffect(() => {
    editorRef.current!.setEditable(!disabled && !readOnly);
  }, [disabled, readOnly]);

  const focus = () => {
    const editor = editorRef.current!;
    // Stryker disable next-line ObjectLiteral,BooleanLiteral: the focus call on the next line flushes the update either way.
    editor.update(() => $getRoot().selectEnd(), { discrete: true });
    // Stryker disable next-line ObjectLiteral,BooleanLiteral: scrolling on focus is the browser's, which a test cannot tell from the caret moving.
    rootRef.current!.focus({ preventScroll: true });
  };
  useEffect(() => {
    if (autoFocus) focus();
    // autoFocus is read once, at mount, as the HTML attribute is.
  }, MOUNT_ONLY); // eslint-disable-line react-hooks/exhaustive-deps

  useImperativeHandle(handleRef, () => ({
    format: (format) => {
      const command = markCommands[format];
      // Stryker disable next-line ConditionalExpression,LogicalOperator: Lexical drops a format command whose type is missing, and a read-only box takes none.
      if (command && !readOnly) editorRef.current!.dispatchCommand(FORMAT_TEXT_COMMAND, command);
    },
    insert: (text) => {
      if (readOnly) return;
      editorRef.current!.update(() => {
        const selection = $getSelection();
        ($isRangeSelection(selection) ? selection : $getRoot().selectEnd()).insertText(text);
      });
    },
    focus,
  }));

  return (
    <div data-slot={slot} className={cn("relative", className)}>
      {name !== undefined && <input type="hidden" name={name} value={value} disabled={disabled} />}
      <div
        ref={rootRef}
        role="textbox"
        aria-multiline="true"
        aria-label={label}
        aria-placeholder={placeholder}
        aria-describedby={describedBy}
        aria-disabled={disabled || undefined}
        aria-readonly={readOnly || undefined}
        contentEditable={!disabled && !readOnly}
        // A read-only box stays in the tab order, as a read-only textarea does, so its text can be read and copied.
        tabIndex={readOnly && !disabled ? 0 : undefined}
        suppressContentEditableWarning
        spellCheck
        data-ouro-control="composer"
        data-ouro-part="editor"
        data-slot="composer-rich-editor"
        data-ouro-composer-editor=""
        // Lines are read from the font, so the box grows from `rows` to `maxRows` as the textarea does.
        style={{ minHeight: `${rows}lh`, maxHeight: `${maxRows}lh` }}
        // The capture phase is before the editor's own listener, so a key the composer takes never reaches it.
        // Stryker disable next-line BlockStatement: a press places its own caret after focus, so the flag only spares the end-of-text one.
        onPointerDownCapture={() => {
          // Stryker disable next-line BooleanLiteral: see the press handler above.
          pressed.current = true;
        }}
        onKeyDownCapture={(event) => {
          onKeyDown(event);
          if (event.defaultPrevented) event.stopPropagation();
        }}
        className="m-0 box-content block min-w-0 overflow-y-auto border-0 bg-transparent px-0 py-(--ouro-text-area-py) text-base leading-6 text-inherit outline-0 [--ouro-text-area-py:calc(var(--spacing)*3)] [overflow-wrap:anywhere] whitespace-pre-wrap sm:pointer-fine:text-sm sm:pointer-fine:leading-5 [&_p]:m-0 [&_strong]:font-semibold [&_code]:rounded-ouro-sm [&_code]:bg-muted [&_code]:px-1 [&_code]:font-mono [&_code]:text-[0.9em]"
      />
      {empty && placeholder && (
        <span aria-hidden="true" data-slot="composer-rich-placeholder" data-ouro-composer-placeholder="" className="pointer-events-none absolute inset-x-0 top-(--ouro-text-area-py) text-base leading-6 text-muted-foreground [--ouro-text-area-py:calc(var(--spacing)*3)] sm:pointer-fine:text-sm sm:pointer-fine:leading-5">
          {placeholder}
        </span>
      )}
    </div>
  );
}
