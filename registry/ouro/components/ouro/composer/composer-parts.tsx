"use client";

import { CodeNode } from "@lexical/code-core";
import { createEmptyHistoryState, registerHistory } from "@lexical/history";
import { $createLinkNode, $isLinkNode, $toggleLink, LinkNode } from "@lexical/link";
import { ListItemNode, ListNode, registerList } from "@lexical/list";
import { $convertFromMarkdownString, $convertToMarkdownString, registerMarkdownShortcuts, BOLD_STAR, CODE, INLINE_CODE, ITALIC_UNDERSCORE, LINK, ORDERED_LIST, QUOTE, STRIKETHROUGH, UNORDERED_LIST, type TextFormatTransformer, type TextMatchTransformer, type Transformer } from "@lexical/markdown";
import { $isQuoteNode, QuoteNode, registerRichText } from "@lexical/rich-text";
import { $findMatchingParent } from "@lexical/utils";
import { $getNodeByKey, $createLineBreakNode, $createParagraphNode, $createTextNode, $getRoot, $isLineBreakNode, $isTextNode, $getSelection, $isRangeSelection, $isElementNode, $createRangeSelection, $createRangeSelectionFromDom, $setSelection, $getState, $setState, createState, COMMAND_PRIORITY_HIGH, createEditor, FOCUS_COMMAND, FORMAT_TEXT_COMMAND, INSERT_LINE_BREAK_COMMAND, INSERT_PARAGRAPH_COMMAND, KEY_ESCAPE_COMMAND, PASTE_COMMAND, type EditorState, type ElementNode, type LexicalEditor, type LexicalNode, type TextFormatType, type TextNode, type RangeSelection, type NodeKey, type SerializedLexicalNode, type Spread, CONTROLLED_TEXT_INSERTION_COMMAND, DecoratorNode, $isDecoratorNode } from "lexical";
import { useEffect, useId, useImperativeHandle, useLayoutEffect, useRef, useState } from "react";
import type { FocusEventHandler, HTMLAttributes, FormEventHandler, JSX, KeyboardEvent, Ref, SyntheticEvent } from "react";
import type { ComposerFormat } from "@/registry/ouro/components/ouro/composer/composer";
import type { EmojiCatalogue } from "@/registry/ouro/components/ouro/emoji/emoji";
import { emojiToken, splitEmojiText, toneOf } from "@/registry/ouro/components/ouro/emoji/emoji-styles";
import type { EmojiTextPart } from "@/registry/ouro/components/ouro/emoji/emoji-styles";
import type { TextAreaHighlight } from "@/registry/ouro/components/ouro/text-field/text-area";
import { describeHighlights, highlightTone, highlightsKey, moveHighlights, normalizeHighlights } from "@/registry/ouro/components/ouro/text-field/text-area-styles";
import { Button } from "@/registry/ouro/components/ouro/button/button";
import { Popover } from "@/registry/ouro/components/ouro/popover/popover";
import { TextField } from "@/registry/ouro/components/ouro/text-field/text-field";
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
  /** Whether the element answers its value and selection in Markdown offsets, read when asked. */
  markdownOffsets: boolean;
  /** The emoji whose `:shortcode:` tokens the editor draws as pictures. */
  catalogue?: EmojiCatalogue | undefined;
  /** The runs of the Markdown to mark, as Markdown offsets, which move with the text. */
  highlights?: readonly TextAreaHighlight[] | undefined;
  /** Turns a paste into Markdown before the allowlist reads the clipboard; `undefined` leaves the paste to the allowlist. */
  pasteText?: ((data: DataTransfer) => string | undefined) | undefined;
  /** Told the marks that came of an edit. */
  onHighlightsChange?: ((highlights: TextAreaHighlight[]) => void) | undefined;
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
  /** The role and states a wrapping Autocomplete sets (combobox, expanded, controls, active suggestion), which the editor carries over its own textbox role. */
  comboboxProps: HTMLAttributes<HTMLDivElement>;
  /** The app's own `id` and any `data-*`/`aria-*` attribute it set on Composer, carried to whichever editor renders (the plain textarea already gets them through its own spread). */
  ownAttrs: Record<string, unknown>;
}

// Underline has no CommonMark mark; `++` is the one Composer's plain mode writes too.
const UNDERLINE: TextFormatTransformer = { format: ["underline"], tag: "++", type: "text-format" };

// Backslash-escapes only a `* _ ~` that bare would read as part of a mark, so writing the value back out never changes a URL's or a handle's underscore or a lone star or tilde that pairs with nothing.
function escapeMarkText(text: string): string {
  return text.replaceAll(/[*_~]/g, (char, index: number, whole: string) => {
    // Stryker disable next-line ConditionalExpression: unescapeSafeMarkText re-derives bare-or-escaped from the exported string's own adjacency and overrides whichever branch runs here whenever this mark has no escaped same-mark neighbor in the output, so routing to the wrong branch below is unobservable; only an actual escape-vs-bare divergence inside each branch shows up.
    if (char === "_") {
      // CommonMark never opens or closes emphasis on an underscore flanked by word characters, so one there is always safe bare.
      const before = whole[index - 1];
      const after = whole[index + 1];
      // Stryker disable next-line ConditionalExpression: unescapeSafeMarkText applies this identical word-flank test to the same underscore in the exported string and strips or keeps the backslash itself, so forcing this escape is unobservable whenever the node-local and exported-string neighbors agree, which they do unless this underscore sits at a run boundary unescapeSafeMarkText reads differently.
      if (before !== undefined && after !== undefined && /\w/.test(before) && /\w/.test(after)) return char;
      return `\\${char}`;
    }
    // A star or tilde next to another of the same mark could open or close one with it, so only a mark with no neighbor of its kind goes out bare.
    const runStart = whole.slice(0, index).match(new RegExp(`\\${char}+$`))?.[0].length ?? 0;
    const runAfter = whole.slice(index + 1).match(new RegExp(`^\\${char}+`))?.[0].length ?? 0;
    // Stryker disable next-line ConditionalExpression: unescapeSafeMarkText strips any escape here back to bare unless an escaped same-mark neighbor sits right beside it in the exported string, so forcing an escape for a mark with no such neighbor leaves the final output unchanged.
    return runStart === 0 && runAfter === 0 ? char : `\\${char}`;
  });
}

// Finds a backslash this library put in front of a `* _ ~` that could not have meant a mark, and takes it back off, so a URL, a handle or a product name comes back the way it was typed.
function unescapeSafeMarkText(markdown: string): string {
  return markdown.replaceAll(/\\([*_~])/g, (whole, char: string, index: number) => {
    if (char === "_") {
      const before = markdown[index - 1];
      const after = markdown[index + 2];
      return before !== undefined && after !== undefined && /\w/.test(before) && /\w/.test(after) ? char : whole;
    }
    const escapedBefore = markdown.slice(0, index).endsWith(`\\${char}`);
    const escapedAfter = markdown.slice(index + 2).startsWith(`\\${char}`);
    return escapedBefore || escapedAfter ? whole : char;
  });
}

// Remembers which literal mark (star or underscore) a run of italic or bold text was typed with, so writing it back out gives the same mark rather than the array's other default.
const markState = createState("composerMark", { parse: (value: unknown) => (value === "star" || value === "underscore" ? value : null) });

// Private-use markers a text node's content carries, right after import, to say which literal mark it was spelled with. Lexical's own delimiter scan only knows the array's one tag per format (star for bold, underscore for italic), so a star-spelled run of italic or an underscore-spelled run of bold is rewritten to the array's tag with one of these in front before that scan ever runs, and read back off, into state, once it has.
const STAR_ITALIC_MARKER = "\uE000";
const UNDERSCORE_BOLD_MARKER = "\uE001";

// Rewrites a lone `*text*` or `__text__` span to the syntax the array's BOLD_STAR/ITALIC_UNDERSCORE already parse, carrying a marker in the content so the mark it was spelled with is not lost. Left alone: a run already inside `**...**` or `_..._`, one next to its own kind (so `**`/`___` keep meaning what they already do), one starting with whitespace, and anything the library would already read as a fence, a link destination or a line of code, none of which this pass ever sees since it runs before those are stripped out: it is a span of a single `*` or a doubled `_` with nothing of its own kind touching either side.
function markPreservingSyntax(markdown: string): string {
  return markdown
    .replaceAll(/(?<!\*)\*(?!\*)([^*\s][^*]*?)\*(?!\*)/g, (_whole, content: string) => `_${STAR_ITALIC_MARKER}${content}_`)
    .replaceAll(/(?<!_)__(?!_)([^_\s][^_]*?)__(?!_)/g, (_whole, content: string) => `**${UNDERSCORE_BOLD_MARKER}${content}**`);
}

// Reads the marker `markPreservingSyntax` left at the front of an imported run's content, drops it from the text, and remembers the mark it names, so export spells the run back the way it was typed.
function $restoreMarkMemory(root: ElementNode) {
  for (const node of root.getChildren()) {
    if ($isTextNode(node)) {
      const text = node.getTextContent();
      if (text.startsWith(STAR_ITALIC_MARKER)) {
        node.setTextContent(text.slice(STAR_ITALIC_MARKER.length));
        $setState(node, markState, "star");
      } else if (text.startsWith(UNDERSCORE_BOLD_MARKER)) {
        node.setTextContent(text.slice(UNDERSCORE_BOLD_MARKER.length));
        $setState(node, markState, "underscore");
      }
    } else if ($isElementNode(node)) {
      $restoreMarkMemory(node);
    }
  }
}

// Reads Markdown into the editor the way every other call site here does, plus the marker pass above and below it, so a star-spelled italic or an underscore-spelled bold survives the round trip.
function $fromMarkdown(markdown: string, transformersArg: Transformer[], node?: ElementNode, shouldPreserveNewLines?: boolean) {
  $convertFromMarkdownString(markPreservingSyntax(markdown), transformersArg, node, shouldPreserveNewLines);
  $restoreMarkMemory(node ?? $getRoot());
}

// `*text*` reads as italic like `_text_` does, but writes back out with the star it came in with, never the array's underscore default.
const ITALIC_STAR_MARK: TextMatchTransformer = {
  dependencies: [],
  export: (node) => {
    if (!$isTextNode(node) || $getState(node, markState) !== "star" || !node.hasFormat("italic") || node.hasFormat("bold")) return null;
    return `*${escapeMarkText(node.getTextContent())}*`;
  },
  regExp: /(?!)/,
  type: "text-match",
};

// `__text__` reads as bold like `**text**` does, but writes back out with the underscores it came in with, never the array's star default.
const BOLD_UNDERSCORE_MARK: TextMatchTransformer = {
  dependencies: [],
  export: (node) => {
    if (!$isTextNode(node) || $getState(node, markState) !== "underscore" || !node.hasFormat("bold") || node.hasFormat("italic")) return null;
    return `__${escapeMarkText(node.getTextContent())}__`;
  },
  regExp: /(?!)/,
  type: "text-match",
};

type SerializedEmojiNode = Spread<{ token: string; name: string; src: string }, SerializedLexicalNode>;

// One emoji from the catalogue, drawn as its picture and written as the token it stands for, so the Markdown stays light text.
class EmojiNode extends DecoratorNode<null> {
  __token: string;
  __name: string;
  __src: string;
  static override getType(): string {
    return "ouro-emoji";
  }
  static override clone(node: EmojiNode): EmojiNode {
    return new EmojiNode(node.__token, node.__name, node.__src, node.__key);
  }
  static override importJSON(json: SerializedEmojiNode): EmojiNode {
    return new EmojiNode(json.token, json.name, json.src);
  }
  constructor(token: string, name: string, src: string, key?: NodeKey) {
    super(key);
    this.__token = token;
    this.__name = name;
    this.__src = src;
  }
  override exportJSON(): SerializedEmojiNode {
    return { ...super.exportJSON(), token: this.__token, name: this.__name, src: this.__src };
  }
  override createDOM(): HTMLElement {
    const picture = document.createElement("img");
    picture.alt = this.__name;
    picture.src = this.__src;
    picture.draggable = false;
    picture.className = "inline-block size-[1.25em] align-text-bottom";
    return picture;
  }
  // Stryker disable next-line BlockStatement: the picture never changes, and a node that is never dirty is never asked
  override updateDOM(): false {
    // Stryker disable next-line BooleanLiteral: the same
    return false;
  }
  override isInline(): true {
    return true;
  }
  override getTextContent(): string {
    return this.__token;
  }
  // Stryker disable next-line BlockStatement: a decorator must answer, and nothing reads the answer of one drawn by createDOM
  override decorate(): null {
    return null;
  }
}

// Stryker disable next-line MethodExpression: a token starts and ends with a colon, and a character with neither, so endsWith tells them apart as startsWith does
const $emojiNode = (found: Exclude<EmojiTextPart, string>) => new EmojiNode(found.source.startsWith(":") ? found.source : emojiToken(found.item, found.tone), found.item.name, toneOf(found.item, found.tone).src);

// Reads a token in as its picture; the transformer is made for the editor, which knows its catalogue. An emoji goes out as its text, the token.
const emojiTransformer = (catalogue: () => EmojiCatalogue | undefined): TextMatchTransformer => ({
  // Stryker disable next-line ArrayDeclaration: Lexical only checks that the class is registered, which the editor's nodes do
  dependencies: [EmojiNode],
  importRegExp: /:[^\s:]+:/,
  regExp: /:[^\s:]+:$/,
  trigger: ":",
  replace: (node, match) => {
    // Stryker disable next-line ArrayDeclaration: with no catalogue the parts are not one emoji whatever they hold, so nothing is replaced
    const parts = catalogue() ? splitEmojiText(match[0], catalogue()!) : [];
    if (parts.length === 1 && typeof parts[0] !== "string") node.replace($emojiNode(parts[0]!));
  },
  type: "text-match",
});

// Puts text in at the selection, with the catalogue's emoji in it as pictures; `text` puts in each run between them.
function $insertWithEmoji(selection: RangeSelection, text: string, catalogue: EmojiCatalogue | undefined, put: (text: string) => void = (run) => selection.insertText(run)): void {
  for (const part of catalogue ? splitEmojiText(text, catalogue) : [text]) {
    if (typeof part === "string") put(part);
    else selection.insertNodes([$emojiNode(part)]);
  }
}

const transformers: Transformer[] = [UNORDERED_LIST, ORDERED_LIST, QUOTE, CODE, BOLD_STAR, ITALIC_UNDERSCORE, UNDERLINE, STRIKETHROUGH, INLINE_CODE, LINK, ITALIC_STAR_MARK, BOLD_UNDERSCORE_MARK];

const markCommands: Partial<Record<ComposerFormat, TextFormatType>> = { bold: "bold", italic: "italic", underline: "underline", strike: "strikethrough", code: "code" };

// What a change from the app, rather than the person, carries, so the editor does not report it back.
// Stryker disable next-line StringLiteral: the tag is only compared with itself, so any other name reads the same.
const synced = "composer-sync";
// Stryker disable next-line ArrayDeclaration: a list with one constant item runs an effect once, as an empty list does.
const MOUNT_ONLY: never[] = [];

// A quote ends on its empty last line, which the line break there makes; a list, a code block and a plain line each go on the way Enter goes on, which is a new paragraph outside a quote.
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
  return editor.dispatchCommand(INSERT_PARAGRAPH_COMMAND, undefined);
}

// A private-use character that stands for a caret while the Markdown is written, so its place in it can be read.
const CARET = "\uE000";

// Stryker disable next-line StringLiteral: Lexical already writes a blank line where a text line meets a block, so naming a text line "" leaves the output as it was.
const textKind = "text";
const lineKind = (line: string) => (/^\s*(?:[-*+]|\d+\.) /.test(line) ? "list" : line.startsWith(">") ? "quote" : textKind);

// Lexical writes the line after a block with no blank line between, which a reader of Markdown takes to be part of the block: a line after a list item belongs to the item. A blank line keeps each block its own.
function separateBlocks(markdown: string): string {
  const out: string[] = [];
  let fenced = false;
  let before = "";
  for (const marked of markdown.split("\n")) {
    // A caret mark on a line is no text of it, so it takes the place of nothing in what kind the line is.
    const line = marked.replaceAll(CARET, "");
    const fence = line.startsWith("```");
    // Stryker disable next-line StringLiteral: a fence line is told apart by `fence`, not by its kind, so the kind's name is never compared.
    const kind = fence ? "fence" : lineKind(line);
    // The line that closes a fence is a fence too; one inside it is the code's.
    if (!fenced && line !== "" && before !== "" && (kind !== before || fence)) out.push("");
    if (fence) fenced = !fenced;
    out.push(marked);
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

// ⌘K: takes a link off a selection that holds one, makes a selected web address a link to itself, and otherwise gives back
// the selection, for the editor to ask for the address in its own popover.
function toggleLinkOfSelection(): RangeSelection | null {
  const selection = $getSelection();
  if (!$isRangeSelection(selection) || selection.isCollapsed()) return null;
  if (selection.getNodes().some((node) => $isLinkNode(node) || $isLinkNode(node.getParent()))) {
    $toggleLink(null);
    return null;
  }
  const href = safeHref(selection.getTextContent());
  if (!href) return selection.clone();
  $toggleLink(href);
  return null;
}

// An input method's composition leaves a zero-width character in the text until it ends, which is no part of the message.
const NODES = [ListNode, ListItemNode, QuoteNode, CodeNode, LinkNode, EmojiNode];
const toMarkdown = (editor: LexicalEditor) => separateBlocks(unescapeSafeMarkText(editor.getEditorState().read(() => $convertToMarkdownString(transformers, undefined, true)).replaceAll("\u200b", "")));

// The editor's element answers as a textarea does, over the text without its marks, one line to each block, so Autocomplete finds a trigger at the caret and puts a pick in place of it.
const $isLeaf = (node: ElementNode) => !node.getChildren().some((child) => $isElementNode(child) && !child.isInline());
function $leaves(node: ElementNode): ElementNode[] {
  // Stryker disable next-line LogicalOperator,MethodExpression,ConditionalExpression: a block that is not a leaf holds only block children, so the filter keeps every child however it is written
  const blocks = node.getChildren().filter((child): child is ElementNode => $isElementNode(child) && !child.isInline());
  return blocks.flatMap((block) => ($isLeaf(block) ? [block] : $leaves(block)));
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
    /* istanbul ignore else @preserve -- the loop ends at the root, so only the root lacks a parent and it stops the loop first */
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
  /* istanbul ignore next @preserve -- unreachable: the point's leaf is always among the leaves */
  // Stryker disable next-line all: every point's leaf is in the leaves, so the loop returns before this fallback
  return start - 1 < 0 ? 0 : start - 1;
}
function $pointAt(element: ElementNode, offset: number): [LexicalNode, number, "text" | "element"] {
  let left = offset;
  const children = element.getChildren();
  for (const [index, child] of children.entries()) {
    const size = child.getTextContentSize();
    // Stryker disable next-line EqualityOperator: at left === size the next child, or the trailing point, gives the same position
    const fits = left <= size;
    if ($isDecoratorNode(child)) {
      // An emoji has no text point: the caret goes before it, or after it when the offset is past its token.
      // Stryker disable next-line EqualityOperator,StringLiteral: at left === size the next child gives the same position, and the point's kind is read only as "text"
      if (left <= size) return [element, left === size ? index + 1 : index, "element"];
    // Stryker disable next-line all: equivalent: a line break child has size 1 and the text branch would give the same offset
    } else if ($isLineBreakNode(child)) {
      // Stryker disable next-line all: equivalent: past offset 0 the loop continues to the same point
      if (left === 0) return [element, index, "element"];
    } else if (fits) {
      return $isElementNode(child) ? $pointAt(child, left) : [child, left, "text"];
    }
    left -= size;
  }
  // Stryker disable next-line all: the trailing point is reached only for a block ending in a line break, and its type is read back identically
  return [element, children.length, "element"];
}
// Stryker disable next-line StringLiteral: no test carries a zero-width mark, so the constant only matters to the editor's own caret marks
const MARK = "\u200b";
// Stryker disable next-line StringLiteral: no test puts a zero-width mark in the text, so what replaces it is never read
const withoutMarks = (text: string) => text.replaceAll(MARK, "");
type Point = readonly [key: string, offset: number, type: "text" | "element"];
// Where the text, without its marks, has the offset `clean`, as a point in a leaf.
function $pointOfText(clean: number): [LexicalNode, number, "text" | "element"] {
  const leaves = $leaves($getRoot());
  const raw = leaves.map((leaf) => leaf.getTextContent()).join("\n");
  let index = 0;
  // Stryker disable next-line all: the offset past the end of the raw text is clamped by the loop bound either way
  for (let seen = 0; seen < clean && index < raw.length; index++) /* istanbul ignore else @preserve -- no test text holds a zero-width mark */ if (raw[index] !== MARK) seen++;
  let from = 0;
  for (const leaf of leaves) {
    const size = leaf.getTextContentSize();
    if (index <= from + size) return $pointAt(leaf, index - from);
    from += size + 1;
  }
  /* istanbul ignore next @preserve -- unreachable: every offset lies within some leaf */
  // Stryker disable next-line all: every offset is within some leaf, so the fallback is unreachable
  return $pointAt(leaves.at(-1)!, leaves.at(-1)!.getTextContentSize());
}
function $selectText(cleanStart: number, cleanEnd: number) {
  const selection = $createRangeSelection();
  const [anchorNode, anchorOffset, anchorType] = $pointOfText(cleanStart);
  const [focusNode, focusOffset, focusType] = $pointOfText(cleanEnd);
  selection.anchor.set(anchorNode.getKey(), anchorOffset, anchorType);
  selection.focus.set(focusNode.getKey(), focusOffset, focusType);
  $setSelection(selection);
}
// The selection the person has: the page's when it is inside the editor, else the editor's own.
function $currentSelection(editor: LexicalEditor) {
  const dom = window.getSelection();
  // Stryker disable next-line OptionalChaining: the root element is set for as long as the editor is mounted, so the guard cannot see null
  return dom && editor.getRootElement()?.contains(dom.anchorNode) ? $createRangeSelectionFromDom(dom, editor) : $getSelection();
}
function readControl(editor: LexicalEditor) {
  return editor.read(() => {
    const leaves = $leaves($getRoot());
    const raw = leaves.map((leaf) => leaf.getTextContent()).join("\n");
    const value = withoutMarks(raw);
    const selection = $currentSelection(editor);
    if (!$isRangeSelection(selection)) return { value, start: value.length, end: value.length };
    const a = withoutMarks(raw.slice(0, $textOffset(selection.anchor.getNode(), selection.anchor.offset, selection.anchor.type))).length;
    const b = withoutMarks(raw.slice(0, $textOffset(selection.focus.getNode(), selection.focus.offset, selection.focus.type))).length;
    return { value, start: Math.min(a, b), end: Math.max(a, b) };
  });
}

// Where the Markdown has a point of the editor's text: a caret mark is put there in a copy of the editor, and the Markdown is written with it in.
function markdownIndex(scratch: LexicalEditor, state: EditorState, [key, offset, type]: Point): number {
  scratch.setEditorState(state);
  scratch.update(
    () => {
      const node = $getNodeByKey(key)!;
      if (type === "text") (node as TextNode).spliceText(offset, 0, CARET);
      else (node as ElementNode).splice(offset, 0, [$createTextNode(CARET)]);
    },
    { discrete: true },
  );
  return toMarkdown(scratch).indexOf(CARET);
}
// The last text offset whose point is at or before the Markdown offset `target`: a place among Markdown marks is the point just inside them.
function textOffsetOf(editor: LexicalEditor, scratch: LexicalEditor, target: number): number {
  const state = editor.getEditorState();
  let low = 0;
  let high = readControl(editor).value.length;
  while (low < high) {
    const mid = (low + high + 1) >> 1;
    const point = editor.read((): Point => {
      const [node, offset, type] = $pointOfText(mid);
      return [node.getKey(), offset, type];
    });
    if (markdownIndex(scratch, state, point) <= target) low = mid;
    else high = mid - 1;
  }
  return low;
}
// The Markdown, with the selection's ends as offsets into it.
function readMarkdownControl(editor: LexicalEditor, scratch: LexicalEditor) {
  const value = toMarkdown(editor);
  const points = editor.read((): Point[] | undefined => {
    const selection = $currentSelection(editor);
    return $isRangeSelection(selection) ? [selection.anchor, selection.focus].map((point): Point => [point.key, point.offset, point.type]) : undefined;
  });
  if (!points) return { value, start: value.length, end: value.length };
  const state = editor.getEditorState();
  const [a, b] = points.map((point) => markdownIndex(scratch, state, point)) as [number, number];
  return { value, start: Math.min(a, b), end: Math.max(a, b) };
}

// The marks' looks, by tone: a tint and a line under the run, dotted for most and dashed for the two that warn, so colour is not the only sign of a mark.
const markTones = {
  primary: "bg-primary/10 border-primary border-dotted",
  secondary: "bg-muted border-muted-foreground border-dotted",
  success: "bg-success/10 border-success border-dotted",
  destructive: "border-destructive border-dashed",
  warning: "border-warning border-dashed",
} as const;
interface MarkBox {
  tone: keyof typeof markTones;
  left: number;
  top: number;
  width: number;
  height: number;
}
// The Text node a leaf's DOM element actually holds: a code-formatted leaf nests its text inside an extra wrapper element.
function domTextNode(dom: Node): Text {
  let node = dom;
  while (node.nodeType !== Node.TEXT_NODE) node = node.firstChild!;
  return node as Text;
}
// Where the DOM has the text offset `clean`.
function domPoint(editor: LexicalEditor, clean: number): [Node, number] {
  return editor.read(() => {
    const [node, offset, type] = $pointOfText(clean);
    const dom = editor.getElementByKey(node.getKey())!;
    return type === "text" ? [domTextNode(dom), offset] : [dom, offset];
  });
}
// The lines of text a range holds. Its own client rects also hold the box of each element it wholly holds, as wide as the
// editor: a blank line's paragraph, a list and its items, which would mark the empty space beside and between the words.
function textRects(range: Range): DOMRect[] {
  const root = range.commonAncestorContainer;
  if (root.nodeType === Node.TEXT_NODE) return [...range.getClientRects()];
  const rects: DOMRect[] = [];
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    if (!range.intersectsNode(node)) continue;
    const part = document.createRange();
    part.selectNodeContents(node);
    if (node === range.startContainer) part.setStart(node, range.startOffset);
    if (node === range.endContainer) part.setEnd(node, range.endOffset);
    rects.push(...part.getClientRects());
  }
  return rects;
}
// The boxes that cover the marked runs, placed from the top left of `frame`.
function measureMarks(editor: LexicalEditor, scratch: LexicalEditor, frame: HTMLElement, marks: readonly TextAreaHighlight[]): MarkBox[] {
  const origin = frame.getBoundingClientRect();
  const boxes: MarkBox[] = [];
  for (const mark of marks) {
    const range = document.createRange();
    range.setStart(...domPoint(editor, textOffsetOf(editor, scratch, mark.start)));
    range.setEnd(...domPoint(editor, textOffsetOf(editor, scratch, mark.end)));
    const seen = new Set<string>();
    for (const rect of textRects(range)) {
      const at = `${rect.left},${rect.top},${rect.width},${rect.height}`;
      if (rect.width === 0 || seen.has(at)) continue;
      seen.add(at);
      boxes.push({ tone: highlightTone(mark) as keyof typeof markTones, left: rect.left - origin.left, top: rect.top - origin.top, width: rect.width, height: rect.height });
    }
  }
  return boxes;
}
/** The props that are set, so an unset one leaves the editor's own in place. */
function definedOnly(props: HTMLAttributes<HTMLDivElement>) {
  return Object.fromEntries(Object.entries(props).filter(([, value]) => value !== undefined));
}

/**
 * The editor Composer swaps in for its textarea with `format="rich"`: a contenteditable that
 * reads and writes light Markdown.
 *
 * @internal
 */
function RichEditor({ label, value, onValueChange, placeholder, disabled, readOnly, describedBy, rows, maxRows, className, "data-slot": slot, onKeyDown, autoFocus, name, handleRef, controlRef, onInput, onSelect, onFocus, onBlur, markdownOffsets, catalogue, highlights, onHighlightsChange, pasteText, comboboxProps, ownAttrs }: RichEditorProps): JSX.Element {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const editorRef = useRef<LexicalEditor | null>(null);
  // The Markdown the editor holds, and the callbacks as of the last render, which its listeners read.
  const held = useRef(value);
  const report = useRef(onValueChange);
  useEffect(() => {
    report.current = onValueChange;
  });
  // The marks that fit the text now: new `highlights` are taken as given, and when the text changes they move with it.
  const marksKey = highlightsKey(highlights);
  // Stryker disable next-line ObjectLiteral: a start with no key matches nothing, so the first render fills it in the same way before anything is drawn.
  const [track, setTrack] = useState(() => ({ key: marksKey, text: value, ranges: normalizeHighlights(highlights, value.length), moved: false }));
  let ranges = track.ranges;
  if (track.key !== marksKey || track.text !== value) {
    const same = track.key === marksKey;
    ranges = same ? moveHighlights(track.ranges, track.text, value, null) : normalizeHighlights(highlights, value.length);
    setTrack({ key: marksKey, text: value, ranges, moved: same && highlightsKey(ranges) !== highlightsKey(track.ranges) });
  }
  const marksChange = useRef(onHighlightsChange);
  useEffect(() => {
    marksChange.current = onHighlightsChange;
  });
  useEffect(() => {
    if (track.moved) marksChange.current?.(track.ranges);
  }, [track]);
  const frameRef = useRef<HTMLDivElement | null>(null);
  // ⌘K over words that aren't an address asks for one in the editor's own popover: the selection it links, and the address typed.
  const [linking, setLinking] = useState<{ selection: RangeSelection; address: string } | null>(null);
  const linkHref = linking ? safeHref(linking.address) : undefined;
  // Back to the words with the caret where it was, the link added or not.
  const endLinking = (href: string | undefined) => {
    const selection = linking!.selection;
    setLinking(null);
    editorRef.current!.update(() => {
      // Stryker disable next-line CallExpression: a test's popover never moves the real document selection away from the editor, so skipping the restore reads the same selection either way; a person who tabbed to the popover's own field would lose their place without it.
      $setSelection(selection.clone());
      if (href) $toggleLink(href);
    },
    // Stryker disable next-line ObjectLiteral,BooleanLiteral: discrete only forces this update's DOM reconciliation to flush before the function returns; a test that reads the result afterwards, as every one here does, cannot tell a flushed render from a microtask-later one apart.
    { discrete: true });
    // Stryker disable next-line ObjectLiteral,BooleanLiteral,CallExpression: jsdom and Chromium's headless layout have nothing to scroll to keep in place and nowhere else for focus to land, so a test cannot tell this call, preventScroll or its absence apart; a long composer keeps the page where it was and the caret's affordance in view with it.
    rootRef.current!.focus({ preventScroll: true });
  };
  // Stryker disable next-line ArrayDeclaration: the first measure replaces whatever the boxes start as, before a test or a person reads the layer (the effect that measures runs as the box mounts).
  const [boxes, setBoxes] = useState<MarkBox[]>([]);
  const rangesKey = highlightsKey(ranges);
  const marksDescription = describeHighlights(value, ranges);
  const marksId = useId();
  const describing = [describedBy, marksDescription ? marksId : undefined].filter(Boolean).join(" ") || undefined;
  // A press places the caret where it lands; any other way in puts it at the end.
  const pressed = useRef(false);
  const inMarkdown = useRef(markdownOffsets);
  useEffect(() => {
    inMarkdown.current = markdownOffsets;
  });
  const emoji = useRef(catalogue);
  const readingRef = useRef<Transformer[]>(transformers);
  const pasting = useRef(pasteText);
  useEffect(() => {
    emoji.current = catalogue;
    pasting.current = pasteText;
  });
  // ⌘⇧V was pressed, so the paste that follows takes the clipboard's text alone.
  const plainPaste = useRef(false);
  // Stryker disable next-line ConditionalExpression,EqualityOperator,StringLiteral: only the first paint reads it; the update listener sets it again from the editor before anyone can see.
  const [empty, setEmpty] = useState(value === "");

  useEffect(() => {
    const editor = createEditor({
      // Stryker disable next-line StringLiteral: the namespace only labels the editor.
      namespace: "ouro-composer",
      nodes: NODES,
      // Lexical writes underline and strikethrough as classes only; bold, italic and code are elements.
      theme: { text: { underline: "underline", strikethrough: "line-through", underlineStrikethrough: "underline line-through" } },
      // Stryker disable next-line BlockStatement: Lexical reports an error only for a state it cannot reach from the commands under test.
      onError: /* istanbul ignore next @preserve -- Lexical reports an error only for a state the commands under test cannot reach. */ (error) => {
        throw error;
      },
    });
    const root = rootRef.current!;
    // What reads Markdown in, which turns a token into the emoji's picture when the catalogue lists it.
    const reading = [emojiTransformer(() => emoji.current), ...transformers];
    readingRef.current = reading;
    editor.setRootElement(root);
    editorRef.current = editor;
    // A copy of the editor that Markdown offsets are worked out in, made when first asked.
    let scratch: LexicalEditor | undefined;
    // Stryker disable next-line ObjectLiteral,StringLiteral,BlockStatement: the copy only receives the editor's own state and writes a mark into it, so its options, namespace and error handler are never read
    const copy = () => (scratch ??= createEditor({ namespace: "ouro-composer-offsets", nodes: NODES, onError: /* istanbul ignore next @preserve -- the copy only writes text into states that already hold */ (error) => { throw error; } }));
    const read = () => (inMarkdown.current ? readMarkdownControl(editor, copy()) : readControl(editor));
    Object.defineProperties(root, {
      value: { configurable: true, get: () => read().value },
      selectionStart: { configurable: true, get: () => read().start },
      selectionEnd: { configurable: true, get: () => read().end },
    });
    // The text offset a Markdown offset stands at.
    const place = (offset: number) => (inMarkdown.current ? textOffsetOf(editor, copy(), offset) : offset);
    // Puts Markdown in place of the Markdown between two offsets, and the caret after it.
    const putMarkdown = (text: string, start: number, end: number) => {
      const markdown = toMarkdown(editor);
      const [from, to] = [Math.min(Math.max(Math.min(start, end), 0), markdown.length), Math.min(Math.max(Math.max(start, end), 0), markdown.length)];
      editor.update(() => $fromMarkdown(markdown.slice(0, from) + text + markdown.slice(to), reading, undefined, true), { discrete: true });
      const at = textOffsetOf(editor, copy(), from + text.length);
      // Stryker disable next-line ObjectLiteral,BooleanLiteral: the caret is placed in the same task either way, so only when it is drawn differs
      editor.update(() => $selectText(at, at), { discrete: true });
    };
    Object.assign(root, {
      setSelectionRange: (start: number, end: number) => {
        const [from, to] = [place(start), place(end)];
        editor.update(() => $selectText(from, to), { discrete: true });
      },
      setRangeText: (text: string, start: number, end: number) => {
        if (inMarkdown.current) {
          if (root.getAttribute("contenteditable") !== "true") return;
          putMarkdown(text, start, end);
          return;
        }
        editor.update(
          () => {
            $selectText(start, end);
            const selection = $getSelection();
            /* istanbul ignore else @preserve -- $selectText has just made a range selection */
            // Stryker disable next-line ConditionalExpression: $selectText has just made a range selection, so the guard only narrows the type
            if ($isRangeSelection(selection)) selection.insertText(text);
          },
          // Stryker disable next-line ObjectLiteral,BooleanLiteral: editor.read, which value and the offsets use, sees a pending update as an applied one
          { discrete: true },
        );
      },
    });
    const stops = [
      registerRichText(editor),
      registerHistory(editor, createEmptyHistoryState(), 300),
      registerList(editor),
      registerMarkdownShortcuts(editor, reading),
      // An emoji the system inserts goes in as its picture, with the token that stands for it as its text.
      editor.registerCommand(
        CONTROLLED_TEXT_INSERTION_COMMAND,
        (payload) => {
          // A key at a time hands over a string; a composition, a drop or a paste hands over the
          // native event instead, and is left to Lexical's own insertion, which this line's test covers.
          const selection = $getSelection();
          if (typeof payload !== "string" || !$isRangeSelection(selection)) return false;
          const hasEmoji = emoji.current ? splitEmojiText(payload, emoji.current).some((part) => typeof part !== "string") : false;
          // Plain typing (no emoji, no line break) is handed back to Lexical, whose own insertion of the same text is identical.
          if (!hasEmoji && !payload.includes("\n")) return false;
          // A line dictation or an input method delivers whole, unlike a key at a time, keeps its line break the way a plain-text paste does: as raw text, not spliced into a text node where it would be lost to whitespace collapsing.
          $insertWithEmoji(selection, payload, emoji.current, (run) => selection.insertRawText(run));
          return true;
        },
        COMMAND_PRIORITY_HIGH,
      ),
      // Enter sends, so Shift+Enter is how a block goes on: a list starts its next item, a code block its next line, a plain line a new paragraph, and a quote stays on one line until an empty one leaves it.
      editor.registerCommand(INSERT_LINE_BREAK_COMMAND, () => leaveOrContinueBlock(editor), COMMAND_PRIORITY_HIGH),
      // Escape is not a request to leave the box: Lexical would blur it, which drops a keyboard person's place.
      editor.registerCommand(KEY_ESCAPE_COMMAND, () => true, COMMAND_PRIORITY_HIGH),
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
          const given = pasting.current?.(data);
          if (given !== undefined) {
            // The Markdown goes in once this update has ended, as the editorRef's setRangeText puts it in.
            queueMicrotask(() => {
              const { start, end } = readMarkdownControl(editor, copy());
              putMarkdown(given, start, end);
            });
            return true;
          }
          const text = data.getData("text/plain");
          const html = plain ? "" : data.getData("text/html");
          const href = safeHref(text);
          if (!selection.isCollapsed() && href && !/\s/.test(text.trim())) {
            $toggleLink(href);
            return true;
          }
          const lines = html ? $nodesFromHtml(html) : [];
          if (lines.length === 0) {
            $insertWithEmoji(selection, text, emoji.current, (run) => selection.insertRawText(run));
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
        $fromMarkdown(held.current, reading, undefined, true);
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

  // The boxes over the marked runs, measured from the editor once it exists and again as its text, size or scroll change.
  useEffect(() => {
    // Stryker disable next-line ConditionalExpression: with no ranges the measure yields no boxes, and the layer is not drawn for none either way.
    if (ranges.length === 0) return;
    const editor = editorRef.current!;
    const root = rootRef.current!;
    // Stryker disable next-line StringLiteral,BlockStatement: the copy's namespace is never read, and its onError only receives the editor's own states.
    const scratch = createEditor({ namespace: "ouro-composer-marks", nodes: NODES, onError: /* istanbul ignore next @preserve -- the copy only receives the editor's own states */ (error) => { throw error; } });
    const measure = () => {
      const frame = frameRef.current;
      // Stryker disable next-line ConditionalExpression,BlockStatement: the box's own cleanup clears its root, and that update arrives after the frame is gone.
      if (frame) setBoxes(measureMarks(editor, scratch, frame, ranges));
    };
    // Stryker disable next-line CallExpression: the observer reports the box's size as soon as it observes it, which measures once more.
    measure();
    const stop = editor.registerUpdateListener(measure);
    const observer = new ResizeObserver(measure);
    observer.observe(root);
    root.addEventListener("scroll", measure);
    return () => {
      stop();
      observer.disconnect();
      root.removeEventListener("scroll", measure);
    };
  }, [rangesKey]); // eslint-disable-line react-hooks/exhaustive-deps

  // A value the app sets, such as the empty one after a send, replaces what the editor holds.
  useLayoutEffect(() => {
    const editor = editorRef.current!;
    // Stryker disable next-line ConditionalExpression: converting the Markdown the editor already holds leaves the same content.
    if (value === held.current) return;
    held.current = value;
    const focused = document.activeElement === rootRef.current;
    editor.update(
      () => {
        $fromMarkdown(value, readingRef.current, undefined, true);
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
        $insertWithEmoji($isRangeSelection(selection) ? selection : $getRoot().selectEnd(), text, emoji.current);
      });
    },
    focus,
  }));

  return (
    // The server, and the first client render, draw the plain textarea Composer falls back to until this editor's module
    // loads, so a page with no JavaScript still gets a working box; this mount replacing it once the module is ready is
    // that fallback's whole point, never a surprise swap (ourostack/ouro-ui#3308).
    <div ref={frameRef} data-slot={slot} className={cn("relative grid", className)} data-ouro-allow="first-paint-swap" data-ouro-allow-why="Composer's rich editor loads after the plain textarea the server and first client render draw, by design (ourostack/ouro-ui#3308)">
      {name !== undefined && <input type="hidden" name={name} value={value} disabled={disabled} />}
      <div
        {...definedOnly(ownAttrs as HTMLAttributes<HTMLDivElement>)}
        ref={(element) => {
          rootRef.current = element;
          return attachRef(controlRef, element);
        }}
        onInput={onInput}
        onSelect={onSelect}
        onFocus={onFocus}
        onBlur={onBlur}
        role="textbox"
        aria-multiline={comboboxProps.role === "combobox" ? undefined : "true"}
        aria-label={label}
        aria-placeholder={comboboxProps.role === "combobox" ? undefined : placeholder}
        aria-describedby={describing}
        aria-disabled={disabled || undefined}
        aria-readonly={readOnly || undefined}
        {...definedOnly(comboboxProps)}
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
            let ask: RangeSelection | null = null;
            // Stryker disable next-line ObjectLiteral,BooleanLiteral: the updater runs synchronously either way, so `ask` holds its answer by the next line regardless; discrete only changes when the resulting render flushes, which a test polling for the popover afterwards cannot tell apart.
            editorRef.current!.update(() => void (ask = toggleLinkOfSelection()), { discrete: true });
            if (ask) setLinking({ selection: ask, address: "" });
          }
          onKeyDown(event);
          if (event.defaultPrevented) event.stopPropagation();
        }}
        className="col-start-1 row-start-1 m-0 box-content block min-w-0 overflow-y-auto border-0 bg-transparent px-0 py-(--ouro-text-area-py) text-base leading-6 text-inherit outline-0 [--ouro-text-area-py:calc(var(--spacing)*3)] [overflow-wrap:anywhere] whitespace-pre-wrap sm:pointer-fine:text-sm sm:pointer-fine:leading-5 [&_p]:m-0 [&_strong]:font-semibold [&_code]:rounded-ouro-sm [&_code]:bg-muted [&_code]:px-1 [&_code]:font-mono [&_code]:text-[0.9em]"
      />
      {ranges.length > 0 && boxes.length > 0 && (
        <div aria-hidden="true" data-slot="composer-marks" data-ouro-composer-marks="" className="pointer-events-none absolute inset-0 overflow-hidden">
          {boxes.map((box, index) => (
            <span key={index} data-slot="composer-mark" data-ouro-highlight={box.tone} style={{ left: box.left, top: box.top, width: box.width, height: box.height }} className={cn("absolute rounded-xs border-b-2 forced-colors:border-[CanvasText]", markTones[box.tone])} />
          ))}
        </div>
      )}
      {marksDescription && (
        <span id={marksId} hidden>
          {marksDescription}
        </span>
      )}
      {empty && placeholder && (
        <span aria-hidden="true" data-slot="composer-rich-placeholder" data-ouro-composer-placeholder="" className="pointer-events-none col-start-1 row-start-1 min-w-0 py-(--ouro-text-area-py) text-base leading-6 text-muted-foreground [--ouro-text-area-py:calc(var(--spacing)*3)] sm:pointer-fine:text-sm sm:pointer-fine:leading-5">
          {placeholder}
        </span>
      )}
      {linking && (
        <Popover title="Add a link" open onOpenChange={(open) => open || endLinking(undefined)} anchor={frameRef} side="top" align="start">
          <form
            data-slot="composer-link-form"
            data-ouro-composer-link=""
            className="flex items-end gap-2"
            onSubmit={(event) => {
              event.preventDefault();
              if (linkHref) endLinking(linkHref);
            }}
          >
            <TextField label="Link address" type="url" value={linking.address} onValueChange={(address: string) => setLinking({ ...linking, address })} autoFocus className="min-w-0 flex-1" />
            <Button type="submit" disabledReason={linkHref ? undefined : "Type a web address first"}>
              Add link
            </Button>
          </form>
        </Popover>
      )}
    </div>
  );
}
