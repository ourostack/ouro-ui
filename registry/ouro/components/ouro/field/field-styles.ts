import { toneFor } from "@/registry/ouro/lib/ouro/appearance-hints";

export { controlClass, descriptionClass, errorClass, fieldHint, labelClass, legendClass, rootClass };

// Class strings and dev-message helpers shared by Field, Fieldset and the Field parts, apart
// from the components so each component file exports only components (React Fast Refresh).
// Class strings are literal so the app's Tailwind finds them when it compiles.

/**
 * The field's stack: label, description, control, error.
 *
 * @internal
 */
const rootClass = "m-0 box-border grid min-w-0 content-start gap-2";

/**
 * The label: medium weight, faded with the field when it is disabled.
 *
 * @internal
 */
const labelClass =
  "m-0 block justify-self-start text-sm leading-5 font-medium text-foreground select-none data-disabled:opacity-50";

/**
 * Supporting text under the label, and under a fieldset's legend. It stays at full contrast when the
 * field is disabled, because it often says why.
 *
 * @internal
 */
const descriptionClass = "m-0 text-sm leading-5 text-muted-foreground";

/**
 * The error message: it fades and slides in, and with reduced motion only fades. Several
 * messages render as a list.
 *
 * @internal
 */
const errorClass =
  "m-0 text-sm leading-5 text-destructive " +
  "[transition:opacity_var(--ouro-duration-base)_ease-out,translate_var(--ouro-duration-base)_ease-out] " +
  "data-starting-style:opacity-0 data-starting-style:-translate-y-1 " +
  "data-ending-style:opacity-0 data-ending-style:-translate-y-1 " +
  "motion-reduce:[transition:opacity_var(--ouro-duration-base)_ease-out] " +
  "motion-reduce:data-starting-style:translate-y-0 motion-reduce:data-ending-style:translate-y-0 " +
  "[&_ul]:m-0 [&_ul]:list-disc [&_ul]:ps-5";

/**
 * A fieldset's legend.
 *
 * @internal
 */
const legendClass = "m-0 p-0 text-base leading-6 font-semibold text-foreground data-disabled:opacity-50";

/**
 * The text control: 44px tall with a 16px font on phones (iOS zooms into smaller text on
 * focus), stepping down to desktop density from the `sm` breakpoint. Its height is one
 * unprefixed class that reads a variable, so an app's `h-*` replaces it at every width.
 *
 * @internal
 */
const controlClass =
  "m-0 box-border block w-full min-w-0 h-(--ouro-control-h) px-3 py-0 " +
  "[--ouro-control-h:calc(var(--spacing)*11)] sm:[--ouro-control-h:calc(var(--spacing)*9)] " +
  "rounded-md border border-solid border-input bg-transparent text-base text-foreground sm:text-sm " +
  "font-[inherit] placeholder:text-muted-foreground " +
  "outline-ring outline-offset-2 focus-visible:outline-2 focus-visible:outline-solid " +
  "transition-[border-color] duration-(--ouro-duration-fast) ease-out " +
  "aria-invalid:border-destructive disabled:cursor-not-allowed disabled:opacity-50 " +
  "dark:bg-input/30";

/**
 * The fix for an appearance class on a field: an error color is the `error` prop; anything
 * else is the theme's job. Development only.
 *
 * @internal
 */
function fieldHint(token: string): string {
  return toneFor(token) === "destructive" ? '<Field error="What is wrong">' : "style fields in your theme (--input, --ring, --radius)";
}
