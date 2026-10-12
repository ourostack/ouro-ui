export { controlClass, indicatorClass, rootClass, thumbClass, trackClass, valueClass };

// Class strings for Slider, apart from the component so its file
// exports only components (React Fast Refresh). Class strings are literal so the app's
// Tailwind finds them when it compiles.

/**
 * The slider's row: the control, then the value when `showValue` is on.
 *
 * @internal
 */
const rootClass = "m-0 box-border flex w-full min-w-0 items-center gap-3";

/**
 * The area that takes presses: as tall as a control on phones (44px), so a press near the
 * track still lands, stepping down to desktop density with a fine pointer from `sm`. Its
 * inline padding is half a thumb, so a thumb at either end stays inside the field. A vertical
 * finger drag over it scrolls the page (`touch-action: pan-y`); a sideways one slides. It fades
 * to half opacity when disabled.
 *
 * @internal
 */
const controlClass =
  "relative box-border flex min-w-0 flex-1 items-center px-2.5 select-none touch-pan-y cursor-pointer " +
  "h-(--ouro-slider-h) [--ouro-slider-h:calc(var(--spacing)*11)] sm:pointer-fine:[--ouro-slider-h:calc(var(--spacing)*6)] " +
  "data-disabled:cursor-not-allowed data-disabled:opacity-50";

/**
 * The rail the thumbs run on.
 *
 * @internal
 */
const trackClass = "relative h-1.5 w-full rounded-full bg-muted select-none";

/**
 * The filled part of the rail: the primary color, or the destructive one when the field
 * has an error.
 *
 * @internal
 */
const indicatorClass =
  "rounded-full bg-primary select-none group-data-[ouro-invalid]/slider:bg-destructive";

/**
 * A thumb: a 20px knob with a 44px hit area on a coarse pointer (its `TouchTarget`), an
 * outline while its input has keyboard focus, and a press that grows it slightly.
 *
 * @internal
 */
const thumbClass =
  "relative box-border size-5 rounded-full border-2 border-solid border-primary bg-background select-none " +
  "[box-shadow:0_1px_2px_rgb(0_0_0/0.2)] " +
  "outline-ring outline-offset-2 has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-solid " +
  "[transition:scale_var(--ouro-spring-duration)_var(--ouro-ease-spring),border-color_var(--ouro-duration-fast)_ease-out] " +
  "motion-safe:data-dragging:scale-110 " +
  "group-data-[ouro-invalid]/slider:border-destructive data-disabled:cursor-not-allowed";

/**
 * The formatted value at the end of the row, in tabular figures, as wide as the widest value
 * (hidden pseudo-elements with the ends' text hold the width) so the track keeps its length. When
 * disabled it turns the muted color rather than fading, so it keeps a readable contrast.
 *
 * @internal
 */
const valueClass =
  "m-0 grid shrink-0 justify-items-end text-sm leading-5 text-foreground tabular-nums whitespace-nowrap group-data-disabled/slider:text-muted-foreground " +
  "before:invisible before:col-start-1 before:row-start-1 before:content-[attr(data-ouro-slider-low)] " +
  "after:invisible after:col-start-1 after:row-start-1 after:content-[attr(data-ouro-slider-high)]";
