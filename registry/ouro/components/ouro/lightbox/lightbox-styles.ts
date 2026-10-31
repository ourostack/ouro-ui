export {
  captionClass,
  counterClass,
  figureClass,
  gridClass,
  headerClass,
  imageClass,
  popupClass,
  stageClass,
  thumbnailClass,
  thumbnailImageClass,
  titleClass,
  zoomedImageClass,
  zoomOrigin,
  zoomViewClass,
};

// Class strings and helpers for Lightbox, apart from the component so its file exports only
// components (React Fast Refresh). Class strings are literal so the app's Tailwind finds them.

/**
 * The thumbnails: as many columns of at least 8rem as fit. @internal
 *
 * @claim "as many columns of at least 8rem as fit" registry/ouro/components/ouro/lightbox/lightbox.test.tsx verify:testExists(registry/ouro/components/ouro/lightbox/lightbox.test.tsx::Lightbox thumbnails > lays the thumbnails out in as many columns of at least 8rem as fit)
 */
const gridClass = "m-0 grid list-none grid-cols-[repeat(auto-fill,minmax(min(100%,8rem),1fr))] gap-3 p-0";

/**
 * A thumbnail: a 4:3 button whose picture zooms a little under a mouse, and which presses in
 * like the other controls. Its border keeps an edge in forced colours. @internal
 *
 * @claim "A thumbnail: a 4:3 button" registry/ouro/components/ouro/lightbox/lightbox.test.tsx verify:testExists(registry/ouro/components/ouro/lightbox/lightbox.test.tsx::Lightbox thumbnails > lays the thumbnails out in as many columns of at least 8rem as fit)
 */
const thumbnailClass =
  "group press relative box-border block aspect-4/3 w-full m-0 p-0 overflow-hidden cursor-zoom-in " +
  "rounded-lg border border-solid border-border bg-muted [-webkit-tap-highlight-color:transparent] " +
  "motion-safe:active:scale-(--ouro-press-scale) " +
  "outline-ring outline-offset-2 focus-visible:outline-2 focus-visible:outline-solid";

/** @internal */
const thumbnailImageClass =
  "block size-full object-cover " +
  "motion-safe:transition-transform motion-safe:duration-(--ouro-duration-slow) motion-safe:ease-(--ouro-ease-out) " +
  "motion-safe:pointer-fine:group-hover:scale-[1.04]";

/**
 * The viewer fills the screen, less the dialog's margin, up to 72rem wide; below 640px it runs
 * edge to edge, so a wide image gets the phone's whole width. It grows from
 * the thumbnail that opened it, from 0.9 rather than the dialog's 0.96; with reduced
 * motion it only fades, by the dialog's own rule. @internal
 *
 * @claim "up to 72rem wide" registry/ouro/components/ouro/lightbox/lightbox-styles.ts verify:fileLine(registry/ouro/components/ouro/lightbox/lightbox-styles.ts, /"h-full max-w-\[72rem\]/)
 * @claim "It grows from the thumbnail that" registry/ouro/components/ouro/lightbox/lightbox.test.tsx verify:testExists(registry/ouro/components/ouro/lightbox/lightbox.test.tsx::Lightbox motion > grows from the thumbnail that opened it, and only fades with reduced motion)
 */
const popupClass =
  "h-full max-w-[72rem] data-starting-style:[transform:scale(0.9)] data-ending-style:[transform:scale(0.9)] " +
  "max-sm:-mx-4 max-sm:w-[calc(100%+2rem)] max-sm:max-w-none max-sm:rounded-none";

/** The bar above the image: the gallery's name, the position, the original's link and Close. @internal */
const headerClass = "box-border flex min-h-14 shrink-0 items-center gap-2 py-2 pe-2 ps-5";

/** @internal */
const titleClass = "min-w-0 flex-1";

/** @internal */
const counterClass = "shrink-0 text-sm tabular-nums text-muted-foreground";

/** The carousel fills the rest: the image row takes what the buttons leave. @internal */
const stageClass = "min-h-0 flex-1 grid-rows-[minmax(0,1fr)_auto] px-3 pb-5 sm:px-5";

/**
 * The image and its caption, centred together: the image's row takes what the caption leaves,
 * so the caption sits right under the image at any shape of screen. @internal
 *
 * @claim "so the caption sits right under" registry/ouro/components/ouro/lightbox/lightbox.test.tsx verify:testExists(registry/ouro/components/ouro/lightbox/lightbox.test.tsx::Lightbox viewer > fits the image to the screen, uncropped, with the caption right under it, on a phone and on a desktop)
 */
const figureClass =
  "relative m-0 grid h-full min-h-0 grid-rows-[minmax(0,auto)] auto-rows-auto content-center justify-items-center gap-3 " +
  "touch-pan-x touch-pan-y";

/**
 * The image, as large as fits and never cropped, with rounded corners and a hairline. @internal
 *
 * @claim "as large as fits and never cropped" registry/ouro/components/ouro/lightbox/lightbox.test.tsx verify:testExists(registry/ouro/components/ouro/lightbox/lightbox.test.tsx::Lightbox viewer > fits the image to the screen, uncropped, with the caption right under it, on a phone and on a desktop)
 */
const imageClass = "block min-h-0 max-h-full max-w-full object-contain rounded-lg ring-1 ring-border/60";

/**
 * A zoomed image's scroller, over the whole slide: one finger, a trackpad or the arrow keys move
 * around the image, and a swipe that reaches its edge stops there rather than turning the page.
 * The browser's own pinch-zoom is off on the figure (it pans only), so a pinch zooms the image.
 * The image sits in the middle while it is smaller than the scroller. @internal
 *
 * @claim "a swipe that reaches its edge" registry/ouro/components/ouro/lightbox/lightbox-styles.ts verify:fileLine(registry/ouro/components/ouro/lightbox/lightbox-styles.ts, /overflow-auto overscroll-contain/)
 */
const zoomViewClass =
  "absolute inset-0 flex overflow-auto overscroll-contain rounded-lg bg-popover " +
  "outline-ring -outline-offset-2 focus-visible:outline-2 focus-visible:outline-solid " +
  "forced-colors:border forced-colors:border-solid";

/** @internal */
const zoomedImageClass = "m-auto block max-w-none max-h-none shrink-0";

/** @internal */
const captionClass = "m-0 grid max-w-prose shrink-0 gap-1 text-center text-sm leading-5 text-muted-foreground";

/**
 * Where the viewer grows from: the centre of the thumbnail that opened it, in the viewer's
 * own coordinates. Offsets leave out the viewer's starting scale. @internal
 */
function zoomOrigin(thumbnail: Element, popup: HTMLElement): string {
  const rect = thumbnail.getBoundingClientRect();
  const x = rect.left + rect.width / 2 - popup.offsetLeft;
  const y = rect.top + rect.height / 2 - popup.offsetTop;
  return `${Math.round(x)}px ${Math.round(y)}px`;
}
