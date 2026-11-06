import type { ComposerFormat } from "@/registry/ouro/components/ouro/composer/composer";

export { composerShortcuts, formatEdit, isApple, markFormats, pressed };
export type { ComposerEdit };

// The text edits and keys Composer's formatting uses, apart from the component so its file
// exports only components and types (React Fast Refresh).

/**
 * Teams' keys for Composer's formats and its expand button, as `Kbd` and Toolbar's `shortcut`
 * take them: `mod` is ⌘ on Apple platforms and Ctrl elsewhere. Give them to your toolbar's
 * entries so their tooltips show them: `shortcut: composerShortcuts.bold`.
 *
 * @example
 * { label: "Bold", icon: BoldIcon, hideLabel: true, shortcut: composerShortcuts.bold, onClick: () => editor.current?.format("bold") }
 */
const composerShortcuts = {
  bold: ["mod", "b"],
  italic: ["mod", "i"],
  underline: ["mod", "u"],
  strike: ["mod", "alt", "x"],
  code: ["mod", "shift", "c"],
  expand: ["mod", "shift", "x"],
} as const satisfies Record<string, readonly string[]>;

/** The formats that wrap the selection in a mark, which the keys apply. */
const markFormats = ["bold", "italic", "underline", "strike", "code"] as const;

/**
 * The marks Composer writes for each, light Markdown that the app renders.
 * @claim "The marks Composer writes for each" registry/ouro/components/ouro/composer/composer.test.tsx verify:testExists(registry/ouro/components/ouro/composer/composer.test.tsx::Composer formatting > applies Teams' formatting keys, and takes each back with Undo and gives it again with Redo)
 */
const marks: Readonly<Record<(typeof markFormats)[number], string>> = { bold: "**", italic: "_", underline: "++", strike: "~~", code: "`" };

/**
 * One change to the text: `text` replaces the text from `from` to `to`, then `start` to `end`
 * (in the new text) is selected. A format is one change, so one Undo takes it back.
 *
 * @internal
 */
interface ComposerEdit {
  from: number;
  to: number;
  text: string;
  start: number;
  end: number;
}

/**
 * The change a format makes to `value` with `start` to `end` selected: a mark around the
 * selection, or taken away when it is there already; list or quote markers on the selected lines,
 * or taken away; or a code block around them.
 *
 * @internal
 */
function formatEdit(value: string, start: number, end: number, format: ComposerFormat): ComposerEdit {
  if (format === "codeBlock") return codeBlockEdit(value, start, end);
  if (format === "bullets" || format === "numbers" || format === "quote") return linesEdit(value, start, end, format);
  return markEdit(value, start, end, marks[format]);
}

/** Wraps the selection in `mark`, or unwraps it; spaces at its ends stay outside the marks, or they would not read as formatting. */
function markEdit(value: string, start: number, end: number, mark: string): ComposerEdit {
  const n = mark.length;
  const selected = value.slice(start, end);
  if (value.slice(Math.max(0, start - n), start) === mark && value.slice(end, end + n) === mark) {
    return { from: start - n, to: end + n, text: selected, start: start - n, end: end - n };
  }
  if (selected.length > 2 * n && selected.startsWith(mark) && selected.endsWith(mark)) {
    return { from: start, to: end, text: selected.slice(n, -n), start, end: end - 2 * n };
  }
  const core = selected.trim();
  if (core === "") return { from: end, to: end, text: mark + mark, start: end + n, end: end + n };
  const from = start + selected.indexOf(core);
  return { from, to: from + core.length, text: mark + core + mark, start: from + n, end: from + n + core.length };
}

const lineMarkers = { bullets: /^- /, numbers: /^\d+\. /, quote: /^> / } as const;

/**
 * Puts list or quote markers on the selected lines, numbering a numbered list, or takes them away when every line has one.
 * @claim "Puts list or quote markers on" registry/ouro/components/ouro/composer/composer.test.tsx verify:testExists(registry/ouro/components/ouro/composer/composer.test.tsx::Composer formatting > marks the selected lines as a list or quote, numbering them, and takes the markers away when every line has one)
 */
function linesEdit(value: string, start: number, end: number, kind: keyof typeof lineMarkers): ComposerEdit {
  const from = value.slice(0, start).lastIndexOf("\n") + 1;
  // A selection that ends just after a line break ends on the line before it; one that ends inside a line finds the same break from a step back.
  const last = end > start ? end - 1 : end;
  const next = value.indexOf("\n", last);
  const to = next < 0 ? value.length : next;
  const lines = value.slice(from, to).split("\n");
  const written = lines.filter((line) => line.trim() !== "");
  const off = written.length > 0 && written.every((line) => lineMarkers[kind].test(line));
  let count = 0;
  const text = lines
    .map((line) => {
      if (off) return line.replace(lineMarkers[kind], "");
      if (line.trim() === "" && lines.length > 1) return line;
      count += 1;
      const marker = kind === "bullets" ? "- " : kind === "numbers" ? `${count}. ` : "> ";
      return marker + line.replace(/^(?:- |\d+\. |> )/, "");
    })
    .join("\n");
  return { from, to, text, start: from, end: from + text.length };
}

/** Fences the selection as a code block, on lines of its own. */
function codeBlockEdit(value: string, start: number, end: number): ComposerEdit {
  const open = `${start > 0 && value[start - 1] !== "\n" ? "\n" : ""}\`\`\`\n`;
  const close = `\n\`\`\`${end < value.length && value[end] !== "\n" ? "\n" : ""}`;
  const selected = value.slice(start, end);
  return { from: start, to: end, text: open + selected + close, start: start + open.length, end: start + open.length + selected.length };
}

/** Whether the platform's command key is ⌘ (macOS, iOS, iPadOS) rather than Ctrl. */
function isApple(): boolean {
  const nav = navigator as Navigator & { userAgentData?: { platform?: string } };
  return /mac|iphone|ipad|ipod|ios/i.test(nav.userAgentData?.platform ?? nav.platform);
}

/**
 * Whether a key press is exactly the shortcut: its modifiers and no others, and its letter by
 * the physical key, so Option on a Mac, which changes the character, still matches.
 * @claim "Whether a key press is exactly" registry/ouro/components/ouro/composer/composer.test.tsx verify:testExists(registry/ouro/components/ouro/composer/composer.test.tsx::Composer formatting > lists the keys for a toolbar's tooltips, and reads a press only with exactly its modifiers)
 */
function pressed(event: Pick<KeyboardEvent, "code" | "metaKey" | "ctrlKey" | "altKey" | "shiftKey">, keys: readonly string[], apple: boolean): boolean {
  const mod = keys.includes("mod");
  return (
    event.metaKey === (mod && apple) &&
    event.ctrlKey === (mod && !apple) &&
    event.altKey === keys.includes("alt") &&
    event.shiftKey === keys.includes("shift") &&
    event.code === `Key${keys.at(-1)!.toUpperCase()}`
  );
}
