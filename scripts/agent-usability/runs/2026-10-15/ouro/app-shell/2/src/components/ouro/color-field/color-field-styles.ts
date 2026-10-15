export { boxClass, hexOf, pickerClass, plainSwatchClass, supportsColorInput, swatchClass, textClass, toHex };

// Class strings and helpers for ColorField, apart from the component so its file exports only
// components (React Fast Refresh). Class strings are literal so the app's Tailwind finds them
// when it compiles.

/**
 * A hex color as `#rrggbb` in lowercase: `#abc`, `abc`, `#AABBCC` and `aabbcc` all work, with
 * spaces around them. Anything else is `undefined`.
 *
 * @internal
 */
function hexOf(text: string | undefined): string | undefined {
  const match = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec((text ?? "").trim());
  if (!match) return undefined;
  const digits = match[1]!.toLowerCase();
  return `#${digits.length === 3 ? [...digits].map((digit) => digit + digit).join("") : digits}`;
}

/**
 * Any CSS color as `#rrggbb`, through the browser's own parser; black when it cannot parse it.
 * Development only (dev messages show the hex to use).
 *
 * @internal
 */
function toHex(color: string): string {
  const context = document.createElement("canvas").getContext("2d")!;
  context.fillStyle = "#000000";
  context.fillStyle = color;
  return context.fillStyle;
}

/**
 * The box around the swatch and the text: Field's control look, 44px tall with a 16px font on
 * phones, stepping down from `sm` with a fine pointer, outlined while either input has keyboard focus.
 *
 * @internal
 */
const boxClass =
  "relative m-0 box-border flex w-full min-w-0 items-center gap-2 h-(--ouro-control-h) ps-2 pe-3 py-0 " +
  "[--ouro-control-h:calc(var(--spacing)*11)] sm:pointer-fine:[--ouro-control-h:calc(var(--spacing)*9)] " +
  "rounded-md border border-solid border-input bg-transparent text-base text-foreground sm:pointer-fine:text-sm " +
  "outline-ring outline-offset-2 has-[input:focus-visible]:outline-2 has-[input:focus-visible]:outline-solid " +
  "transition-[border-color] duration-(--ouro-duration-fast) ease-[ease] " +
  "has-[input[aria-invalid=true]]:border-destructive has-[input:disabled]:cursor-not-allowed has-[input:disabled]:opacity-50 " +
  "dark:bg-input/30";

/**
 * The swatch's hit area: a 28px square (24px from `sm` with a fine pointer), with a 44px
 * touch target on coarse pointers.
 *
 * @internal
 */
const swatchClass =
  "press relative flex size-7 shrink-0 cursor-pointer sm:pointer-fine:size-6 " +
  "motion-safe:not-has-[input:disabled]:active:scale-(--ouro-press-scale) has-[input:disabled]:cursor-not-allowed";

/**
 * The swatch where the browser has no color picker: the color, shown only, beside the hex text
 * that takes it.
 */
const plainSwatchClass = "relative block size-7 shrink-0 rounded-sm border border-solid border-border sm:pointer-fine:size-6";

/**
 * Whether the browser has a color picker. One without it treats `type="color"` as text, so the
 * type reads back as "text". On the server, assume it does; the client corrects it.
 */
function supportsColorInput(): boolean {
  const probe = document.createElement("input");
  probe.setAttribute("type", "color");
  return probe.type === "color";
}

/**
 * The native color input drawn as a plain swatch: the browser's padding and border removed.
 *
 * @internal
 */
const pickerClass =
  "relative m-0 box-border block size-full cursor-[inherit] appearance-none rounded-sm border border-solid border-border bg-transparent p-0 " +
  "outline-none [&::-webkit-color-swatch-wrapper]:p-0 [&::-webkit-color-swatch]:rounded-[inherit] [&::-webkit-color-swatch]:border-0 " +
  "[&::-moz-color-swatch]:rounded-[inherit] [&::-moz-color-swatch]:border-0";

/**
 * The hex text input: borderless, filling the box, in a monospaced figure width.
 *
 * @internal
 */
const textClass =
  "m-0 box-border block h-full min-w-0 flex-1 self-stretch border-0 bg-transparent p-0 tabular-nums " +
  "text-[length:inherit] text-inherit font-[inherit] outline-none placeholder:text-muted-foreground disabled:cursor-not-allowed";
