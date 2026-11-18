import { cn } from "@/registry/ouro/lib/ouro/cn";

export { ansiClassName, parseAnsi, stripAnsi };
export type { AnsiRun, AnsiStyle };

/**
 * How a run of terminal output looks: the SGR attributes CodeBlock draws. `color` is one of the
 * 16 basic colours, 0 to 7 normal and 8 to 15 bright, or null for the text's own color.
 * @internal
 */
interface AnsiStyle {
  bold: boolean;
  dim: boolean;
  italic: boolean;
  underline: boolean;
  strike: boolean;
  color: number | null;
}

/** A stretch of terminal output in one style; `style` is null for plain text. @internal */
interface AnsiRun {
  text: string;
  style: AnsiStyle | null;
}

/**
 * Every escape sequence a terminal capture can hold: a CSI sequence (SGR's `ESC[…m`, and the
 * cursor and erase codes), a string sequence (OSC, such as a hyperlink, DCS, APC, PM or SOS)
 * ended by BEL or ST, and the short escapes (`ESC=`, `ESC7`, `ESC(B`). A lone ESC at the end
 * matches too.
 */
// eslint-disable-next-line no-control-regex -- terminal escape codes start with ESC, and OSC ends with BEL
const ansiEscapePattern = /\x1b(?:\[[0-?]*[ -/]*[@-~]|[\]PX^_][\s\S]*?(?:\x07|\x1b\\|$)|[ -/]*[0-~]|$)/g;

/** The text of terminal output without its escape codes: what a person copies. @internal */
function stripAnsi(text: string): string {
  return text.replace(ansiEscapePattern, "");
}

const plain: AnsiStyle = { bold: false, dim: false, italic: false, underline: false, strike: false, color: null };

function isPlain(style: AnsiStyle): boolean {
  return !style.bold && !style.dim && !style.italic && !style.underline && !style.strike && style.color === null;
}

function applySgr(style: AnsiStyle, parameters: string): AnsiStyle {
  const codes = parameters === "" ? [0] : parameters.split(/[;:]/).map((code) => (code === "" ? 0 : Number(code)));
  let next = { ...style };
  for (let index = 0; index < codes.length; index += 1) {
    const code = codes[index]!;
    if (code === 0) next = { ...plain };
    else if (code === 1) next.bold = true;
    else if (code === 2) next.dim = true;
    else if (code === 3) next.italic = true;
    else if (code === 4) next.underline = true;
    else if (code === 9) next.strike = true;
    else if (code === 22) next = { ...next, bold: false, dim: false };
    else if (code === 23) next.italic = false;
    else if (code === 24) next.underline = false;
    else if (code === 29) next.strike = false;
    else if (code >= 30 && code <= 37) next.color = code - 30;
    else if (code >= 90 && code <= 97) next.color = code - 90 + 8;
    else if (code === 39) next.color = null;
    else if (code === 38 || code === 48) {
      // An extended color: 5;n from the 256-color table, or 2;r;g;b. A foreground from the table's
      // first 16 is a basic color; any other, and every background, keeps the theme's own, so the
      // text keeps its contrast on the block.
      const mode = codes[index + 1];
      if (mode === 5) {
        const value = codes[index + 2];
        if (code === 38) next.color = value !== undefined && value < 16 ? value : null;
        index += 2;
      } else if (mode === 2) {
        if (code === 38) next.color = null;
        index += 4;
      } else index += 1;
    }
  }
  return next;
}

/**
 * Splits terminal output into runs of one style, reading its SGR codes (`ESC[…m`) and dropping
 * every other escape sequence. Backgrounds and colors outside the basic 16 are dropped, so the
 * text keeps the block's surface and its contrast.
 * @internal
 */
function parseAnsi(text: string): AnsiRun[] {
  const runs: AnsiRun[] = [];
  let style = plain;
  let last = 0;
  const push = (chunk: string) => {
    if (chunk === "") return;
    const runStyle = isPlain(style) ? null : style;
    const previous = runs[runs.length - 1];
    if (previous && JSON.stringify(previous.style) === JSON.stringify(runStyle)) previous.text += chunk;
    else runs.push({ text: chunk, style: runStyle });
  };
  for (const match of text.matchAll(ansiEscapePattern)) {
    push(text.slice(last, match.index));
    last = match.index + match[0].length;
    // eslint-disable-next-line no-control-regex -- an SGR code starts with ESC
    const sgr = /^\x1b\[([0-9;:]*)m$/.exec(match[0]);
    if (sgr) style = applySgr(style, sgr[1]!);
  }
  push(text.slice(last));
  return runs;
}

// Each color is a hue at oklch(0.58 0.18 h) mixed into the theme's foreground, 60% for the normal
// colors and 72% for the bright ones, so it darkens on a light theme and lightens on a dark one,
// and keeps at least 5:1 on the block's muted surface. Black is the muted text color and white the
// foreground, so neither disappears on either theme.
const colors = [
  "[--ouro-ansi:color-mix(in_oklab,var(--muted-foreground)_80%,var(--foreground))]",
  "[--ouro-ansi:color-mix(in_oklab,oklch(0.58_0.18_25)_60%,var(--foreground))]",
  "[--ouro-ansi:color-mix(in_oklab,oklch(0.58_0.18_145)_60%,var(--foreground))]",
  "[--ouro-ansi:color-mix(in_oklab,oklch(0.58_0.18_90)_60%,var(--foreground))]",
  "[--ouro-ansi:color-mix(in_oklab,oklch(0.58_0.18_260)_60%,var(--foreground))]",
  "[--ouro-ansi:color-mix(in_oklab,oklch(0.58_0.18_330)_60%,var(--foreground))]",
  "[--ouro-ansi:color-mix(in_oklab,oklch(0.58_0.18_200)_60%,var(--foreground))]",
  "[--ouro-ansi:var(--foreground)]",
  "[--ouro-ansi:color-mix(in_oklab,var(--muted-foreground)_80%,var(--foreground))]",
  "[--ouro-ansi:color-mix(in_oklab,oklch(0.58_0.18_25)_72%,var(--foreground))]",
  "[--ouro-ansi:color-mix(in_oklab,oklch(0.58_0.18_145)_72%,var(--foreground))]",
  "[--ouro-ansi:color-mix(in_oklab,oklch(0.58_0.18_90)_72%,var(--foreground))]",
  "[--ouro-ansi:color-mix(in_oklab,oklch(0.58_0.18_260)_72%,var(--foreground))]",
  "[--ouro-ansi:color-mix(in_oklab,oklch(0.58_0.18_330)_72%,var(--foreground))]",
  "[--ouro-ansi:color-mix(in_oklab,oklch(0.58_0.18_200)_72%,var(--foreground))]",
  "[--ouro-ansi:var(--foreground)]",
] as const;

/**
 * The classes for a run's style. Dim text is the muted text color mixed 20% toward the
 * foreground, as muted text on a muted surface is everywhere in Ouro, and a dim color is that
 * color halfway to it.
 * @internal
 */
function ansiClassName(style: AnsiStyle): string {
  const color = style.color === null ? undefined : colors[style.color];
  return cn(
    color,
    color && !style.dim && "text-(--ouro-ansi)",
    color && style.dim && "text-[color-mix(in_oklab,var(--ouro-ansi)_50%,color-mix(in_oklab,var(--muted-foreground)_80%,var(--foreground)))]",
    !color && style.dim && "text-[color-mix(in_oklab,var(--muted-foreground)_80%,var(--foreground))]",
    style.bold && "font-bold",
    style.italic && "italic",
    style.underline && "underline",
    style.strike && "line-through",
  );
}
