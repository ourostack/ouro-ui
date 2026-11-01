export {
  fullScreenClass,
  mosaicCellClass,
  mosaicClass,
  mosaicLayout,
  mosaicMoreClass,
  mosaicThumbnailClass,
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

/**
 * With `fullScreen`, the viewer covers the whole screen at every width: it steps over the
 * dialog's margin and drops its corners, hairline and shadow, so only the image and its bar show.
 * The viewport keeps the safe-area insets past that margin. Behind the image it is one solid,
 * quiet field in both themes, as picture viewers draw it: the backdrop colour, fully opaque, so
 * nothing of the page shows through, with the theme's dark palette inside (the `dark` class, Ouro's
 * dark mode), so the title, the position and the buttons read on it. In forced colours it is the
 * system's opaque Canvas. @internal
 *
 * @claim "Behind the image it is one solid," registry/ouro/components/ouro/lightbox/lightbox.mosaic.test.tsx verify:testExists(registry/ouro/components/ouro/lightbox/lightbox.mosaic.test.tsx::Lightbox full screen > hides the page behind one solid field in the light theme too, with readable controls)
 * @claim "In forced colours it is the" registry/ouro/components/ouro/lightbox/lightbox.mosaic.test.tsx verify:fileLine(registry/ouro/components/ouro/lightbox/lightbox.mosaic.test.tsx, /chromiumOnly\(\"leaves forced colours to the system\"/)
 *
 * @claim "With `fullScreen`, the viewer covers the" registry/ouro/components/ouro/lightbox/lightbox.mosaic.test.tsx verify:testExists(registry/ouro/components/ouro/lightbox/lightbox.mosaic.test.tsx::Lightbox full screen > covers the whole screen with no frame, from the thumbnails or controlled)
 */
const fullScreenClass =
  "dark -m-4 h-[calc(100%+2rem)] max-h-none w-[calc(100%+2rem)] max-w-none rounded-none ring-0 shadow-none " +
  "bg-(--ouro-backdrop-color) text-foreground forced-colors:bg-[Canvas]";

/** The mosaic's frame: rounded corners and a hairline, with the card colour in the gaps between its pictures. @internal */
const mosaicClass =
  "relative m-0 grid w-full list-none gap-0.5 overflow-hidden p-0 " +
  "rounded-lg border border-solid border-border bg-card";

/**
 * A mosaic's cell; the first of three spans both rows. @internal
 *
 * @claim "the first of three spans both rows" registry/ouro/components/ouro/lightbox/lightbox.mosaic.test.tsx verify:testExists(registry/ouro/components/ouro/lightbox/lightbox.mosaic.test.tsx::Lightbox mosaic > draws two side by side, three as one large and two small, and four or more as a 2 by 2 grid)
 */
const mosaicCellClass = "relative m-0 min-h-0 min-w-0 p-0 [&:first-child:nth-last-child(3)]:row-span-2";

/** A mosaic's picture fills its cell. @internal */
const mosaicThumbnailClass =
  "group press relative box-border block size-full m-0 p-0 overflow-hidden cursor-zoom-in border-0 bg-muted " +
  "[-webkit-tap-highlight-color:transparent] motion-safe:active:scale-(--ouro-press-scale) " +
  "outline-ring -outline-offset-2 focus-visible:outline-2 focus-visible:outline-solid";

/** "+3" over the last picture shown, when more follow it in the viewer. @internal */
const mosaicMoreClass =
  "pointer-events-none absolute inset-0 flex items-center justify-center " +
  "bg-[color-mix(in_oklab,var(--foreground)_45%,transparent)] text-2xl font-semibold text-background";

/**
 * How a mosaic lays out `count` pictures, as Teams and other chat apps do: one at its own shape
 * (between 3:4 and 3:1, 4:3 when its size is unknown); two side by side in a 2:1 frame; three as
 * one large and two small in a 3:2 frame; four or more as a 2 by 2 grid in a 4:3 frame. @internal
 *
 * @claim "How a mosaic lays out `count` pictures" registry/ouro/components/ouro/lightbox/lightbox.mosaic.test.tsx verify:testExists(registry/ouro/components/ouro/lightbox/lightbox.mosaic.test.tsx::Lightbox mosaic > draws one picture at its own shape, between 3:4 and 3:1, and 4:3 when its size is unknown)
 * @claim "How a mosaic lays out `count` pictures" registry/ouro/components/ouro/lightbox/lightbox.mosaic.test.tsx verify:testExists(registry/ouro/components/ouro/lightbox/lightbox.mosaic.test.tsx::Lightbox mosaic > draws two side by side, three as one large and two small, and four or more as a 2 by 2 grid)
 */
function mosaicLayout(count: number, width?: number, height?: number): { ratio: number; grid?: string } {
  if (count === 1) {
    const [w, h] = [width ?? 0, height ?? 0];
    const own = w > 0 && h > 0 ? w / h : 4 / 3;
    // One cell needs no tracks of its own: the grid's single implicit one fills the frame.
    return { ratio: Math.min(3, Math.max(3 / 4, own)) };
  }
  if (count === 2) return { ratio: 2, grid: "grid-cols-2 grid-rows-1" };
  if (count === 3) return { ratio: 3 / 2, grid: "grid-cols-[3fr_2fr] grid-rows-2" };
  return { ratio: 4 / 3, grid: "grid-cols-2 grid-rows-2" };
}

/** The bar above the image: the gallery's name, the position, the original's link and Close. @internal */
const headerClass = "box-border flex min-h-14 shrink-0 items-center gap-2 py-2 pe-2 ps-5";

/** @internal */
const titleClass = "min-w-0 flex-1";

/** @internal */
const counterClass = "shrink-0 text-sm tabular-nums text-muted-foreground";

/**
 * The carousel fills the rest: the image row takes what the buttons leave. Keyboard focus on the
 * images draws its ring around the image shown, not around the whole stage (imageClass); in forced colours the
 * stage keeps the system's ring as well. @internal
 *
 * @claim "Keyboard focus on the images draws" registry/ouro/components/ouro/lightbox/lightbox.mosaic.test.tsx verify:testExists(registry/ouro/components/ouro/lightbox/lightbox.mosaic.test.tsx::Lightbox full screen > rings the image shown, not the stage, when the images have keyboard focus)
 */
const stageClass =
  "min-h-0 flex-1 grid-rows-[minmax(0,1fr)_auto] px-3 pb-5 sm:px-5 " +
  "[&_[data-ouro-carousel-viewport]]:not-forced-colors:focus-visible:outline-none";

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
const imageClass =
  "block min-h-0 max-h-full max-w-full object-contain rounded-lg ring-1 ring-border/60 outline-ring outline-offset-2 " +
  "in-[[data-ouro-carousel-viewport]:focus-visible]:outline-2 in-[[data-ouro-carousel-viewport]:focus-visible]:outline-solid";

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
