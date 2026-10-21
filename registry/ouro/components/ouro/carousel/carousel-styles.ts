export { buttonsClass, fillTemplate, nearestSlide, rootClass, slideClass, slidesPerViewClass, viewportClass };

// Class strings and helpers for Carousel, apart from the component so its file exports
// only components (React Fast Refresh). Class strings are literal so the app's Tailwind
// finds them when it compiles.

/** The region. It takes focus only when both buttons become disabled under focus. @internal */
const rootClass =
  "grid min-w-0 gap-3 outline-ring outline-offset-4 focus-visible:outline-2 focus-visible:outline-solid";

/**
 * The scroller: native horizontal scrolling with mandatory snap points, so a swipe, a
 * trackpad, a wheel with Shift and the arrow keys all land on a slide. No `touch-action`
 * is set, so a vertical swipe that starts on the slides still scrolls the page, and
 * `overscroll-x-contain` keeps a horizontal swipe at the last slide from navigating back.
 * The scrollbar is hidden; the buttons and the keyboard move between slides.
 *
 * @internal
 * @claim registry/ouro/components/ouro/carousel/carousel.test.tsx verify:testExists(registry/ouro/components/ouro/carousel/carousel.test.tsx::Carousel structure > snaps each slide to the start of a horizontal scroller that a keyboard can reach)
 * @claim registry/ouro/components/ouro/carousel/carousel.touch.test.tsx verify:testExists(registry/ouro/components/ouro/carousel/carousel.touch.test.tsx::moves to the next slide with a horizontal swipe and reports it once)
 */
const viewportClass =
  "box-border flex min-w-0 gap-4 overflow-x-auto overflow-y-hidden overscroll-x-contain snap-x snap-mandatory " +
  "[scrollbar-width:none] [&::-webkit-scrollbar]:hidden rounded-lg " +
  "outline-ring outline-offset-2 focus-visible:outline-2 focus-visible:outline-solid";

/** @internal */
const slideClass = "box-border min-w-0 shrink-0 grow-0 basis-(--ouro-carousel-basis) snap-start";

/**
 * The slide width for each `slidesPerView`, with the 1rem gap between slides taken out. @internal
 *
 * @claim registry/ouro/components/ouro/carousel/carousel.test.tsx verify:testExists(registry/ouro/components/ouro/carousel/carousel.test.tsx::Carousel structure > shows two or three slides at a time with slidesPerView)
 * @claim registry/ouro/components/ouro/carousel/carousel-styles.ts verify:fileLine(registry/ouro/components/ouro/carousel/carousel-styles.ts, /calc\(\(100%-1rem\)\/2\)/)
 */
const slidesPerViewClass = {
  1: "[--ouro-carousel-basis:100%]",
  2: "[--ouro-carousel-basis:calc((100%-1rem)/2)]",
  3: "[--ouro-carousel-basis:calc((100%-2rem)/3)]",
} as const;

/** @internal */
const buttonsClass = "flex justify-end gap-2";

/**
 * Fills a label template: `{n}` is the 1-based slide number and `{total}` the slide count.
 *
 * @internal
 * @claim registry/ouro/components/ouro/carousel/carousel.test.tsx verify:testExists(registry/ouro/components/ouro/carousel/carousel.test.tsx::Carousel announcements > announces with the slideLabel template)
 * @claim registry/ouro/components/ouro/carousel/carousel-styles.ts verify:fileLine(registry/ouro/components/ouro/carousel/carousel-styles.ts, /replaceAll\("\{n\}", String\(n\)\)/)
 */
function fillTemplate(template: string, n: number, total: number): string {
  return template.replaceAll("{n}", String(n)).replaceAll("{total}", String(total));
}

/**
 * The index of the slide whose start edge is nearest the scroller's start edge, in either
 * reading direction.
 *
 * @internal
 */
function nearestSlide(viewport: HTMLElement): number {
  const rtl = getComputedStyle(viewport).direction === "rtl";
  const box = viewport.getBoundingClientRect();
  const edge = rtl ? box.right : box.left;
  let best = 0;
  let bestDistance = Infinity;
  [...viewport.children].forEach((slide, index) => {
    const rect = slide.getBoundingClientRect();
    const distance = Math.abs((rtl ? rect.right : rect.left) - edge);
    if (distance < bestDistance) {
      best = index;
      bestDistance = distance;
    }
  });
  return best;
}
