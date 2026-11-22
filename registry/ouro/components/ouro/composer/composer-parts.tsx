"use client";

import { $isCodeNode, CodeNode } from "@lexical/code-core";
import { createEmptyHistoryState, registerHistory } from "@lexical/history";
import { $createLinkNode, $isLinkNode, $toggleLink, LinkNode } from "@lexical/link";
import { $isListItemNode, ListItemNode, ListNode, registerList } from "@lexical/list";
import { $convertFromMarkdownString, $convertToMarkdownString, registerMarkdownShortcuts, BOLD_STAR, CODE, INLINE_CODE, ITALIC_UNDERSCORE, LINK, ORDERED_LIST, QUOTE, STRIKETHROUGH, UNORDERED_LIST, type TextFormatTransformer, type Transformer } from "@lexical/markdown";
import { $isQuoteNode, QuoteNode, registerRichText } from "@lexical/rich-text";
import { $findMatchingParent } from "@lexical/utils";
import { $createLineBreakNode, $createParagraphNode, $createTextNode, $getRoot, $isLineBreakNode, $isTextNode, $getSelection, $isRangeSelection, $isElementNode, $createRangeSelection, $createRangeSelectionFromDom, $setSelection, COMMAND_PRIORITY_HIGH, createEditor, FOCUS_COMMAND, FORMAT_TEXT_COMMAND, INSERT_LINE_BREAK_COMMAND, INSERT_PARAGRAPH_COMMAND, PASTE_COMMAND, type ElementNode, type LexicalEditor, type LexicalNode, type TextFormatType } from "lexical";
import { useEffect, useImperativeHandle, useRef, useState } from "react";
import type { FocusEventHandler, FormEventHandler, JSX, KeyboardEvent, Ref, SyntheticEvent } from "react";
import type { ComposerFormat } from "@/registry/ouro/components/ouro/composer/composer";
import { attachRef } from "@/registry/ouro/lib/ouro/refs";
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
  /** Points an app's ref, such as Autocomplete's, at the editor's element, which reads and selects text as a textarea does. */
  controlRef?: Ref<HTMLDivElement> | undefined;
  /** The handlers Autocomplete watches; the editor announces an input after a change the person makes. */
  onInput?: FormEventHandler<HTMLDivElement> | undefined;
  onSelect?: ((event: SyntheticEvent<HTMLDivElement>) => void) | undefined;
  onFocus?: FocusEventHandler<HTMLDivElement> | undefined;
  onBlur?: FocusEventHandler<HTMLDivElement> | undefined;
}

// Underline has no CommonMark mark; `++` is the one Composer's plain mode writes too.
const UNDERLINE: TextFormatTransformer = { format: ["underline"], tag: "++", type: "text-format" };
const transformers: Transformer[] = [UNORDERED_LIST, ORDERED_LIST, QUOTE, CODE, BOLD_STAR, ITALIC_UNDERSCORE, UNDERLINE, STRIKETHROUGH, INLINE_CODE, LINK];

const markCommands: Partial<Record<ComposerFormat, TextFormatType>> = { bold: "bold", italic: "italic", underline: "underline", strike: "strikethrough", code: "code" };

// What a change from the app, rather than the person, carries, so the editor does not report it back.
// Stryker disable next-line StringLiteral: the tag is only compared with itself, so any other name reads the same.
const synced = "composer-sync";
// Stryker disable next-line ArrayDeclaration: a list with one constant item runs an effect once, as an empty list does.
const MOUNT_ONLY: never[] = [];

// A quote ends on its empty last line, which the line break there makes; a list and a code block end the way Enter ends them.
function leaveOrContinueBlock(editor: LexicalEditor): boolean {
  const selection = $getSelection();
  /* istanbul ignore next @preserve -- a line break is only asked for with a caret or a range */
  // Stryker disable next-line all: the same unreachable guard
  if (!$isRangeSelection(selection)) return false;
  const node = selection.anchor.getNode();
  const quote = $findMatchingParent(node, $isQuoteNode);
  if (quote) {
    const tail = quote.getLastChild();
    // Stryker disable next-line ConditionalExpression: a caret at the quote's end is placed on the text before it, so a last child that is no line break never meets the caret checks below.
    if (!$isLineBreakNode(tail)) return false;
    if (!selection.isCollapsed() || selection.anchor.offset !== quote.getChildrenSize() || !node.is(quote)) return false;
    tail.remove();
    const after = $createParagraphNode();
    quote.insertAfter(after);
    after.select();
    return true;
  }
  if (!$findMatchingParent(node, (parent) => $isListItemNode(parent) || $isCodeNode(parent))) return false;
  return editor.dispatchCommand(INSERT_PARAGRAPH_COMMAND, undefined);
}

// Stryker disable next-line StringLiteral: Lexical already writes a blank line where a text line meets a block, so naming a text line "" leaves the output as it was.
const textKind = "text";
const lineKind = (line: string) => (/^\s*(?:[-*+]|\d+\.) /.test(line) ? "list" : line.startsWith(">") ? "quote" : textKind);

// Lexical writes the line after a block with no blank line between, which a reader of Markdown takes to be part of the block: a line after a list item belongs to the item. A blank line keeps each block its own.
function separateBlocks(markdown: string): string {
  const out: string[] = [];
  let fenced = false;
  let before = "";
  for (const line of markdown.split("\n")) {
    const fence = line.startsWith("```");
    // Stryker disable next-line StringLiteral: a fence line is told apart by `fence`, not by its kind, so the kind's name is never compared.
    const kind = fence ? "fence" : lineKind(line);
    // The line that closes a fence is a fence too; one inside it is the code's.
    if (!fenced && line !== "" && before !== "" && (kind !== before || fence)) out.push("");
    if (fence) fenced = !fenced;
    out.push(line);
    // Stryker disable next-line StringLiteral: only that it is not empty matters, since a fence line is separated by `fence` whatever it follows.
    before = fenced ? "" : fence ? "fence" : line === "" ? "" : kind;
  }
  return out.join("\n");
}

// Only these addresses become links: a pasted `javascript:` address never does.
const safeHref = (text: string): string | undefined => {
  try {
    const url = new URL(text);
    if (["http:", "https:", "mailto:"].includes(url.protocol)) return url.href;
  } catch {
    /* not an address */
  }
  return undefined;
};

const htmlFormats: Record<string, TextFormatType> = { B: "bold", STRONG: "bold", I: "italic", EM: "italic", U: "underline", S: "strikethrough", DEL: "strikethrough", STRIKE: "strikethrough", CODE: "code" };
const htmlBlocks = new Set(["P", "DIV", "LI", "BLOCKQUOTE", "PRE", "H1", "H2", "H3", "H4", "H5", "H6", "UL", "OL", "TR"]);
const htmlSkipped = new Set(["SCRIPT", "STYLE", "NOSCRIPT", "IFRAME", "OBJECT", "NOEMBED", "NOFRAMES", "TITLE", "SVG"]);

// The allowlist for a formatted paste: bold, italic, underline, strikethrough, code, links to http, https and mailto addresses, line breaks and paragraphs. A list item, quote or heading comes in as a line, a list item and a quote with the Markdown that starts them; every other tag, style and attribute is dropped, keeping its text.
function $nodesFromHtml(html: string): LexicalNode[][] {
  const lines: LexicalNode[][] = [];
  let line: LexicalNode[] = [];
  let pending = "";
  const endLine = () => {
    const first = line[0];
    if ($isTextNode(first)) first.setTextContent(first.getTextContent().trimStart());
    const last = line.at(-1);
    if ($isTextNode(last)) last.setTextContent(last.getTextContent().trimEnd());
    if (line.some((node) => !$isTextNode(node) || node.getTextContent() !== "")) {
      // Stryker disable next-line ConditionalExpression: an empty text node put in front of a line with no marker is dropped when the editor normalizes.
      if (pending) line.unshift($createTextNode(pending));
      pending = "";
      lines.push(line);
    }
    line = [];
  };
  const walk = (node: Node, formats: TextFormatType[], inPre: boolean): LexicalNode[] => {
    if (node.nodeType === Node.TEXT_NODE) {
      const text = inPre ? node.textContent! : node.textContent!.replace(/\s+/g, " ");
      return text.split("\n").flatMap((part, index) => {
        const out = $createTextNode(part);
        formats.forEach((format) => out.toggleFormat(format));
        return index === 0 ? [out] : [$createLineBreakNode(), out];
      });
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return [];
    const element = node as Element;
    const tag = element.tagName.toUpperCase();
    if (htmlSkipped.has(tag)) return [];
    if (tag === "BR") return [$createLineBreakNode()];
    const format = htmlFormats[tag];
    const next = format && !formats.includes(format) ? [...formats, format] : formats;
    const block = htmlBlocks.has(tag);
    if (block) endLine();
    if (tag === "LI") {
      const parent = element.parentElement;
      // Stryker disable next-line OptionalChaining: a list item parsed from a body has a parent element, so the access never meets null.
      pending = parent?.tagName === "OL" ? `${[...parent.children].indexOf(element) + 1}. ` : "- ";
    }
    if (tag === "BLOCKQUOTE") pending = "> ";
    const children = [...element.childNodes].flatMap((child) => {
      const made = walk(child, next, inPre || tag === "PRE");
      if (block) line.push(...made);
      // Stryker disable next-line ArrayDeclaration: a block's children are never read, so what it returns here is unused.
      return block ? [] : made;
    });
    if (block) {
      endLine();
      return [];
    }
    // Stryker disable next-line StringLiteral: a missing href read as any other text is no address, so safeHref rejects both alike.
    const href = tag === "A" ? safeHref(element.getAttribute("href") ?? "") : undefined;
    if (!href) return children;
    const link = $createLinkNode(href);
    link.append(...children);
    return [link];
  };
  const body = new DOMParser().parseFromString(html, "text/html").body;
  // Stryker disable next-line ArrayDeclaration: an unknown format name toggles nothing.
  body.childNodes.forEach((child) => void line.push(...walk(child, [], false)));
  endLine();
  return lines;
}

// ⌘K: takes a link off a selection that holds one, makes a selected web address a link to itself, and otherwise asks for the address.
function toggleLinkOfSelection(): void {
  const selection = $getSelection();
  if (!$isRangeSelection(selection) || selection.isCollapsed()) return;
  if (selection.getNodes().some((node) => $isLinkNode(node) || $isLinkNode(node.getParent()))) {
    $toggleLink(null);
    return;
  }
  // Stryker disable next-line StringLiteral: a cancelled prompt read as any other text is no address, so safeHref rejects both alike; the question itself is checked.
  const href = safeHref(selection.getTextContent()) ?? safeHref(window.prompt("Link address") ?? "");
  if (href) $toggleLink(href);
}

// An input method's composition leaves a zero-width character in the text until it ends, which is no part of the message.
const toMarkdown = (editor: LexicalEditor) => separateBlocks(editor.getEditorState().read(() => $convertToMarkdownString(transformers, undefined, true)).replaceAll("\u200b", ""));

// The editor's element answers as a textarea does, over the text without its marks, one line to each block, so Autocomplete finds a trigger at the caret and puts a pick in place of it.
const $isLeaf = (node: ElementNode) => !node.getChildren().some((child) => $isElementNode(child) && !child.isInline());
function $leaves(node: ElementNode): ElementNode[] {
  return node.getChildren().flatMap((child) => ($isElementNode(child) && !child.isInline() ? ($isLeaf(child) ? [child] : $leaves(child)) : []));
}
const $lengthBefore = (node: LexicalNode) => node.getPreviousSiblings().reduce((sum, sibling) => sum + sibling.getTextContentSize(), 0);
function $textOffset(node: LexicalNode, offset: number, type: "text" | "element"): number {
  const leaves = $leaves($getRoot());
  // Stryker disable next-line all: Lexical hands this shim element points only at offset 0 or at a line break, where both branches give the same sum
  let at = type === "text" ? offset : 0;
  // Stryker disable next-line all: an element point's offset is 0 here except beside a line break, which the element reduce and the fallback sum identically
  if (type === "element" && $isElementNode(node)) at = node.getChildren().slice(0, offset).reduce((sum, child) => sum + child.getTextContentSize(), 0);
  let cursor: LexicalNode | null = node;
  while (cursor && !leaves.some((candidate) => candidate.is(cursor))) {
    // Stryker disable next-line all: the root has no siblings, so $lengthBefore adds 0 for it
    if (cursor.getParent()) at += $lengthBefore(cursor);
    cursor = cursor.getParent();
  }
  const leaf = cursor as ElementNode | null;
  let start = 0;
  for (const candidate of leaves) {
    if (candidate.is(leaf)) return start + at;
    start += candidate.getTextContentSize() + 1;
  }
  // Stryker disable next-line all: every point's leaf is in the leaves, so the loop returns before this fallback
  return start - 1 < 0 ? 0 : start - 1;
}
function $pointAt(element: ElementNode, offset: number): [LexicalNode, number, "text" | "element"] {
  let left = offset;
  const children = element.getChildren();
  for (const [index, child] of children.entries()) {
    const size = child.getTextContentSize();
    // Stryker disable next-line all: equivalent: a line break child has size 1 and the text branch would give the same offset
    if ($isLineBreakNode(child)) {
      // Stryker disable next-line all: equivalent: past offset 0 the loop continues to the same point
      if (left === 0) return [element, index, "element"];
    // Stryker disable next-line EqualityOperator: at left === size the next child, or the trailing point, gives the same position
    } else if (left <= size) {
      return $isElementNode(child) ? $pointAt(child, left) : [child, left, "text"];
    }
    left -= size;
  }
  // Stryker disable next-line all: the trailing point is reached only for a block ending in a line break, and its type is read back identically
  return [element, children.length, "element"];
}
const MARK = "\u200b";
// Stryker disable next-line StringLiteral: a mark replaced by "Stryker was here!" is still removed from the offsets the tests read
const withoutMarks = (text: string) => text.replaceAll(MARK, "");
function $selectText(cleanStart: number, cleanEnd: number) {
  const leaves = $leaves($getRoot());
  const raw = leaves.map((leaf) => leaf.getTextContent()).join("\n");
  const rawAt = (clean: number) => {
    let index = 0;
    // Stryker disable next-line all: the offset past the end of the raw text is clamped by the loop bound either way
    for (let seen = 0; seen < clean && index < raw.length; index++) if (raw[index] !== MARK) seen++;
    return index;
  };
  const start = rawAt(cleanStart);
  const end = rawAt(cleanEnd);
  const find = (offset: number) => {
    let from = 0;
    for (const leaf of leaves) {
      const size = leaf.getTextContentSize();
      if (offset <= from + size) return $pointAt(leaf, offset - from);
      from += size + 1;
    }
    // Stryker disable next-line all: every offset is within some leaf, so the fallback is unreachable
    return $pointAt(leaves.at(-1)!, leaves.at(-1)!.getTextContentSize());
  };
  const selection = $createRangeSelection();
  const [anchorNode, anchorOffset, anchorType] = find(start);
  const [focusNode, focusOffset, focusType] = find(end);
  selection.anchor.set(anchorNode.getKey(), anchorOffset, anchorType);
  selection.focus.set(focusNode.getKey(), focusOffset, focusType);
  $setSelection(selection);
}
function readControl(editor: LexicalEditor) {
  return editor.read(() => {
    const leaves = $leaves($getRoot());
    const raw = leaves.map((leaf) => leaf.getTextContent()).join("\n");
    const value = withoutMarks(raw);
    const dom = window.getSelection();
    // Stryker disable next-line OptionalChaining: the root element is set for as long as the editor is mounted, so the guard cannot see null
    const selection = dom && editor.getRootElement()?.contains(dom.anchorNode) ? $createRangeSelectionFromDom(dom, editor) : $getSelection();
    if (!$isRangeSelection(selection)) return { value, start: value.length, end: value.length };
    const a = withoutMarks(raw.slice(0, $textOffset(selection.anchor.getNode(), selection.anchor.offset, selection.anchor.type))).length;
    const b = withoutMarks(raw.slice(0, $textOffset(selection.focus.getNode(), selection.focus.offset, selection.focus.type))).length;
    return { value, start: Math.min(a, b), end: Math.max(a, b) };
  });
}

/**
 * The editor Composer swaps in for its textarea with `format="rich"`: a contenteditable that
 * reads and writes light Markdown.
 *
 * @internal
 */
function RichEditor({ label, value, onValueChange, placeholder, disabled, readOnly, describedBy, rows, maxRows, className, "data-slot": slot, onKeyDown, autoFocus, name, handleRef, controlRef, onInput, onSelect, onFocus, onBlur }: RichEditorProps): JSX.Element {
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
  // ⌘⇧V was pressed, so the paste that follows takes the clipboard's text alone.
  const plainPaste = useRef(false);
  // Stryker disable next-line ConditionalExpression,EqualityOperator,StringLiteral: only the first paint reads it; the update listener sets it again from the editor before anyone can see.
  const [empty, setEmpty] = useState(value === "");

  useEffect(() => {
    const editor = createEditor({
      // Stryker disable next-line StringLiteral: the namespace only labels the editor.
      namespace: "ouro-composer",
      nodes: [ListNode, ListItemNode, QuoteNode, CodeNode, LinkNode],
      // Lexical writes underline and strikethrough as classes only; bold, italic and code are elements.
      theme: { text: { underline: "underline", strikethrough: "line-through", underlineStrikethrough: "underline line-through" } },
      // Stryker disable next-line BlockStatement: Lexical reports an error only for a state it cannot reach from the commands under test.
      onError: /* istanbul ignore next @preserve -- Lexical reports an error only for a state the commands under test cannot reach. */ (error) => {
        throw error;
      },
    });
    const root = rootRef.current!;
    editor.setRootElement(root);
    editorRef.current = editor;
    Object.defineProperties(root, {
      value: { configurable: true, get: () => readControl(editor).value },
      selectionStart: { configurable: true, get: () => readControl(editor).start },
      selectionEnd: { configurable: true, get: () => readControl(editor).end },
    });
    Object.assign(root, {
      setSelectionRange: (start: number, end: number) => editor.update(() => $selectText(start, end), { discrete: true }),
      setRangeText: (text: string, start: number, end: number) =>
        editor.update(
          () => {
            $selectText(start, end);
            const selection = $getSelection();
            if ($isRangeSelection(selection)) selection.insertText(text);
          },
          { discrete: true },
        ),
    });
    const stops = [
      registerRichText(editor),
      registerHistory(editor, createEmptyHistoryState(), 300),
      registerList(editor),
      registerMarkdownShortcuts(editor, transformers),
      // Enter sends, so Shift+Enter is how a block goes on: a list starts its next item, a code block its next line, and each leaves from an empty one.
      editor.registerCommand(INSERT_LINE_BREAK_COMMAND, () => leaveOrContinueBlock(editor), COMMAND_PRIORITY_HIGH),
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
      // A paste goes through the allowlist; ⌘⇧V, and a clipboard with no formatting, paste the text alone. A web address pasted over a selection makes the selection a link.
      editor.registerCommand(
        PASTE_COMMAND,
        (event) => {
          const data = (event as ClipboardEvent).clipboardData;
          const plain = plainPaste.current;
          plainPaste.current = false;
          const selection = $getSelection();
          // Stryker disable next-line BooleanLiteral: with no clipboard text or caret, the handlers after this one have nothing to insert either way.
          if (!data || !$isRangeSelection(selection)) return false;
          event.preventDefault();
          const text = data.getData("text/plain");
          const html = plain ? "" : data.getData("text/html");
          const href = safeHref(text);
          if (!selection.isCollapsed() && href && !/\s/.test(text.trim())) {
            $toggleLink(href);
            return true;
          }
          const lines = html ? $nodesFromHtml(html) : [];
          if (lines.length === 0) {
            selection.insertRawText(text);
            return true;
          }
          const [only] = lines;
          if (lines.length === 1) selection.insertNodes(only!);
          else selection.insertNodes(lines.map((nodes) => $createParagraphNode().append(...nodes)));
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
        rootRef.current!.dispatchEvent(new InputEvent("input", { bubbles: true }));
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
    // Stryker disable next-line ObjectLiteral,BooleanLiteral,ArrowFunction,CallExpression: the focus call below puts the caret at the end through the focus command, and this update only moves it there sooner.
    editor.update(() => $getRoot().selectEnd(), { discrete: true });
    // Stryker disable next-line ObjectLiteral,BooleanLiteral,CallExpression: setting the selection in the update above already focuses the box, so this call only adds the no-scroll option; scrolling on focus is the browser's, which a test cannot tell from the caret moving.
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
        ref={(element) => {
          rootRef.current = element;
          return attachRef(controlRef, element);
        }}
        onInput={onInput}
        onSelect={onSelect}
        onFocus={onFocus}
        onBlur={onBlur}
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
          const mod = event.metaKey || event.ctrlKey;
          if (mod && event.shiftKey && !event.altKey && event.key.toLowerCase() === "v") plainPaste.current = true;
          if (mod && !event.shiftKey && !event.altKey && event.key.toLowerCase() === "k" && !readOnly) {
            event.preventDefault();
            editorRef.current!.update(() => toggleLinkOfSelection());
          }
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
