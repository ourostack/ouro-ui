"use client";

import { Children, useEffect, useLayoutEffect, useRef, useState, type JSX, type ReactNode } from "react";
import { announce } from "@/registry/ouro/lib/ouro/announce";
import { useAppearanceClassNameCheck } from "@/registry/ouro/lib/ouro/class-name-check";
import { cn } from "@/registry/ouro/lib/ouro/cn";
import { RouterLink } from "@/registry/ouro/lib/ouro/router-link";
import { useDevWarnings } from "@/registry/ouro/lib/ouro/use-dev-messages";
import { useReducedMotion } from "@/registry/ouro/lib/ouro/use-reduced-motion";
import { Button } from "@/registry/ouro/components/ouro/button/button";
import {
  buttonsClass,
  fillTemplate,
  nearestSlide,
  pageClass,
  pagerClass,
  rootClass,
  slideClass,
  slidesPerViewClass,
  viewportClass,
} from "@/registry/ouro/components/ouro/carousel/carousel-styles";

/** Props for {@link Carousel}. */
export interface CarouselProps {
  /**
   * Names the carousel for screen readers, such as "Recipe photos". It is always required.
   *
   * @claim "It is always required" registry/ouro/components/ouro/carousel/carousel.test-d.ts verify:fileLine(registry/ouro/components/ouro/carousel/carousel.test-d.ts, /expectTypeOf<\{\schildren:\s"Slides"\s\}>\(\)\.not\.toExtend<CarouselProps>/)
   */
  label: string;
  /**
   * The slides: each child is one slide, so pass the images or cards themselves.
   *
   * @claim "The slides: each child is one" registry/ouro/components/ouro/carousel/carousel.test.tsx verify:testExists(registry/ouro/components/ouro/carousel/carousel.test.tsx::Carousel structure > is a named carousel region of slides named by their position)
   */
  children: ReactNode;
  /** Next on the last slide goes back to the first, and Previous on the first goes to the last. */
  loop?: boolean | undefined;
  /** How many slides show at once. @default 1 */
  slidesPerView?: 1 | 2 | 3 | (number & { 'Use 1, 2 or 3': never }) | undefined;
  /**
   * The slide to start on, counting from 0. The starting slide is not announced. @default 0
   *
   * @claim "The slide to start on, counting" registry/ouro/components/ouro/carousel/carousel.test.tsx verify:testExists(registry/ouro/components/ouro/carousel/carousel.test.tsx::Carousel navigation > starts at defaultIndex without announcing it)
   */
  defaultIndex?: number | undefined;
  /**
   * The slide in view, counting from the first as `0`, for a carousel your app drives: from the
   * address (`#slide-3`, so a slide has a link and Back and Forward step through the slides), a
   * router's state, or another control. When it changes the carousel moves there, smoothly or at once
   * with reduced motion, and announces the position, without calling `onIndexChange`. Set it
   * from `onIndexChange` too, so a swipe or a button press moves it. Unset, the carousel keeps its own position, from `defaultIndex`.
   *
   * @claim "When it changes the carousel moves" registry/ouro/components/ouro/carousel/carousel.test.tsx verify:testExists(registry/ouro/components/ouro/carousel/carousel.test.tsx::Carousel driven by the app > starts at index, moves when index changes and announces it, and reports the user's own moves)
   */
  index?: number | undefined;
  /** Called with the index of the first visible slide when the user moves to another slide, once per change. */
  onIndexChange?: ((index: number) => void) | undefined;
  /**
   * Shows a pager beside the buttons: a dot for each position, a link to the address this returns
   * (`(index) => "#slide-" + (index + 1)`), named by `slideLabel`, with `aria-current="true"` and a
   * longer dot on the position in view. Following one changes the address, so drive the carousel
   * with `index` from the address and it moves there.
   *
   * @claim "a dot for each position, a link" registry/ouro/components/ouro/carousel/carousel.test.tsx verify:testExists(registry/ouro/components/ouro/carousel/carousel.test.tsx::Carousel driven by the app > shows a pager of links, one per position, with the one in view marked current)
   */
  pagerHref?: ((index: number) => string) | undefined;
  /** With `pagerHref`, the pager's accessible name. @default "Slides" */
  pagerLabel?: string | undefined;
  /**
   * Called at once with the slide a Previous or Next press is moving to, before the scroll gets
   * there, and with null when the scroll settles: show that position straight away, so a counter
   * never names the slide being left. `onIndexChange` still reports, and the carousel announces,
   * only where the scroll settles.
   *
   * @claim "Called at once with the slide" registry/ouro/components/ouro/carousel/carousel.test.tsx verify:testExists(registry/ouro/components/ouro/carousel/carousel.test.tsx::Carousel navigation > reports the slide a press is moving to at once, and null when the scroll settles)
   */
  onTargetChange?: ((index: number | null) => void) | undefined;
  /** The Previous button's accessible name. @default "Previous slide" */
  previousLabel?: string | undefined;
  /** The Next button's accessible name. @default "Next slide" */
  nextLabel?: string | undefined;
  /**
   * Names each slide and is announced when the position changes: `{n}` is the slide's
   * number and `{total}` the number of slides. @default "Slide {n} of {total}"
   * @claim "Names each slide and is announced" registry/ouro/components/ouro/carousel/carousel.test.tsx verify:testExists(registry/ouro/components/ouro/carousel/carousel.test.tsx::Carousel structure > is a named carousel region of slides named by their position)
   * @claim "Names each slide and is announced" registry/ouro/components/ouro/carousel/carousel.test.tsx verify:testExists(registry/ouro/components/ouro/carousel/carousel.test.tsx::Carousel structure > names its buttons and slides with the labels it is given)
   */
  slideLabel?: string | undefined;
  /** What a screen reader calls the carousel, after its label: "Recipe photos, carousel". @default "carousel" */
  roleDescription?: string | undefined;
  /**
   * What a screen reader calls each slide, after its name: "Slide 2 of 5, slide". @default "slide"
   *
   * @claim "What a screen reader calls each" registry/ouro/components/ouro/carousel/carousel.test.tsx verify:testExists(registry/ouro/components/ouro/carousel/carousel.test.tsx::Carousel structure > is a named carousel region of slides named by their position)
   */
  slideRoleDescription?: string | undefined;
  /** Layout only: width and margins (`max-w-xl`, `mx-auto`). Appearance classes warn in development. */
  className?: string | undefined;

  /** Not a prop. Ouro UI's Carousel is not Embla: `<Carousel loop>`. */
  opts?: { 'Use <Carousel loop>; Carousel takes no Embla options': never };
  /** Not a prop. Read the position with `onIndexChange`: `<Carousel onIndexChange={setIndex}>`. */
  setApi?: { 'Use <Carousel onIndexChange={setIndex}>': never };
  /**
   * Not a prop. Carousel never moves on its own, so it takes no plugins.
   *
   * @claim "Carousel never moves on its own" registry/ouro/components/ouro/carousel/carousel.test-d.ts verify:fileLine(registry/ouro/components/ouro/carousel/carousel.test-d.ts, /plugins:\s\[\]\s\}>\(\)\.not\.toExtend<CarouselProps>/)
   * @claim "Carousel never moves on its own" registry/ouro/components/ouro/carousel/carousel.test-d.ts verify:fileLine(registry/ouro/components/ouro/carousel/carousel.test-d.ts, /autoplay:\strue\s\}>\(\)\.not\.toExtend<CarouselProps>/)
   */
  plugins?: { 'Carousel never moves on its own; remove plugins': never };
  /**
   * Not a prop. Carousel never moves on its own: motion the user did not start is hard to read and to stop.
   *
   * @claim "Carousel never moves on its own" registry/ouro/components/ouro/carousel/carousel.test-d.ts verify:fileLine(registry/ouro/components/ouro/carousel/carousel.test-d.ts, /autoplay:\strue\s\}>\(\)\.not\.toExtend<CarouselProps>/)
   */
  autoplay?: { 'Carousel never moves on its own; remove autoplay': never };
  /** Not a prop. Carousel scrolls horizontally; stack vertical content in a grid instead. */
  orientation?: { 'Carousel scrolls horizontally; use a grid for a vertical list': never };
}

const perViews = [1, 2, 3] as const;

function ChevronIcon({ back }: { back?: boolean }): JSX.Element {
  return (
    <svg aria-hidden="true" viewBox="0 0 16 16" fill="none" className={cn("size-ouro-4 rtl:-scale-x-100", back && "-scale-x-100 rtl:scale-x-100")}>
      <path d="M6 3l5 5-5 5" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/**
 * A row of slides the user swipes or steps through with Previous and Next buttons:
 * recipe photos, a few featured cards. It is the browser's own scrolling with snap
 * points, so swiping, trackpads and arrow keys all work and a vertical swipe still
 * scrolls the page. Each child is a slide named "Slide 2 of 5", and moving to another
 * slide announces that position politely, once. It never moves on its own, and with
 * reduced motion the buttons jump instead of scrolling smoothly. With every slide in view
 * (one slide, or no more than `slidesPerView`) the buttons hide.
 *
 * An app that keeps the slide in the address passes `index` and `pagerHref`: a slide then has a
 * link, the pager's dots link to the slides, and Back and Forward step through them.
 *
 * Use a grid instead when every item should be visible at once, and `Tabs` when the
 * panels have names the user picks from.
 *
 * @group Display
 * @see https://ui.ouroboros.bot/docs/carousel
 *
 * @example
 * <Carousel label="Recipe photos">
 *   {photos.map((photo) => <img key={photo.id} src={photo.src} alt={photo.alt} />)}
 * </Carousel>
 * <Carousel label="Featured recipes" slidesPerView={2} loop onIndexChange={setIndex}>
 *   {recipes.map((recipe) => <RecipeCard key={recipe.id} recipe={recipe} />)}
 * </Carousel>
 * // The slide lives in the address: #slide-3.
 * const hash = useSyncExternalStore(onHashChange, () => location.hash, () => "");
 * const slide = Math.max(0, Number(hash.replace("#slide-", "")) - 1 || 0);
 * <Carousel
 *   label="Overview"
 *   index={slide}
 *   onIndexChange={(index) => history.replaceState(null, "", `#slide-${index + 1}`)}
 *   pagerHref={(index) => `#slide-${index + 1}`}
 * >
 *   {slides}
 * </Carousel>
 * @claim "An app that keeps the slide" registry/ouro/components/ouro/carousel/carousel.test.tsx verify:testExists(registry/ouro/components/ouro/carousel/carousel.test.tsx::Carousel driven by the app > follows the address when a pager link is followed, and when the address goes back)
 * @claim "It is the browser's own scrolling" registry/ouro/components/ouro/carousel/carousel.touch.test.tsx verify:testExists(registry/ouro/components/ouro/carousel/carousel.touch.test.tsx::lets a vertical swipe that starts on the slides scroll the page)
 * @claim "It is the browser's own scrolling" registry/ouro/components/ouro/carousel/carousel.test.tsx verify:testExists(registry/ouro/components/ouro/carousel/carousel.test.tsx::Carousel structure > snaps each slide to the start of a horizontal scroller that a keyboard can reach)
 * @claim "Each child is a slide named" registry/ouro/components/ouro/carousel/carousel.test.tsx verify:testExists(registry/ouro/components/ouro/carousel/carousel.test.tsx::Carousel structure > snaps each slide to the start of a horizontal scroller that a keyboard can reach)
 * @claim "It never moves on its own" registry/ouro/components/ouro/carousel/carousel.test.tsx verify:testExists(registry/ouro/components/ouro/carousel/carousel.test.tsx::Carousel motion > jumps instantly with reduced motion)
 * @claim "With every slide in view" registry/ouro/components/ouro/carousel/carousel.test.tsx verify:testExists(registry/ouro/components/ouro/carousel/carousel.test.tsx::Carousel navigation > hides the buttons when every slide is in view)
 * @claim "It never moves on its own" registry/ouro/components/ouro/carousel/carousel.test.tsx verify:testExists(registry/ouro/components/ouro/carousel/carousel.test.tsx::Carousel motion > scrolls smoothly when motion is allowed)
 * @claim "It never moves on its own" registry/ouro/components/ouro/carousel/carousel.test-d.ts verify:fileLine(registry/ouro/components/ouro/carousel/carousel.test-d.ts, /autoplay:\strue\s\}>\(\)\.not\.toExtend<CarouselProps>/)
 */
export function Carousel(props: CarouselProps): JSX.Element {
  const {
    label,
    children,
    loop = false,
    slidesPerView: perViewProp = 1,
    defaultIndex = 0,
    index: indexProp,
    onIndexChange,
    pagerHref,
    pagerLabel = "Slides",
    onTargetChange,
    previousLabel = "Previous slide",
    nextLabel = "Next slide",
    slideLabel = "Slide {n} of {total}",
    roleDescription = "carousel",
    slideRoleDescription = "slide",
    className,
    // Guard props (hint types), dropped here so they never reach the DOM.
    opts,
    setApi,
    plugins,
    autoplay,
    orientation,
  } = props;

  const slides = Children.toArray(children);
  const total = slides.length;
  // A slidesPerView that is not one of Ouro UI's (a type error) warns and shows one slide.
  const perView = perViews.includes(perViewProp as 1 | 2 | 3) ? (perViewProp as 1 | 2 | 3) : 1;
  const lastIndex = Math.max(0, total - perView);

  useAppearanceClassNameCheck(
    "Carousel",
    className,
    process.env.NODE_ENV !== "production"
      ? (token: string) => `remove "${token}"; style the slides you pass in`
      : /* istanbul ignore next @preserve -- production only */ "",
  );
  useDevWarnings(
    "Carousel",
    process.env.NODE_ENV !== "production"
      ? () => [
          !label && ["label is required; it names the carousel for screen readers", '<Carousel label="Recipe photos">'],
          total === 0 && [
            "there are no slides",
            '<Carousel label="Recipe photos">{photos.map((photo) => <img key={photo.id} src={photo.src} alt={photo.alt} />)}</Carousel>',
          ],
          perView !== perViewProp && [`slidesPerView={${String(perViewProp)}} is not supported; use 1, 2, 3`, "<Carousel slidesPerView={3}>"],
          total > 0 && defaultIndex > lastIndex && [`defaultIndex={${defaultIndex}} is past the last slide (${lastIndex})`, `<Carousel defaultIndex={${lastIndex}}>`],
          (indexProp ?? 0) > lastIndex && [`index={${String(indexProp)}} is past the last slide (${lastIndex})`, `<Carousel index={${lastIndex}}>`],
          opts !== undefined && ["opts is not a prop", "<Carousel loop>"],
          setApi !== undefined && ["setApi is not a prop", "<Carousel onIndexChange={setIndex}>"],
          plugins !== undefined && ["plugins is not a prop; Carousel never moves on its own", '<Carousel label="Recipe photos">'],
          autoplay !== undefined && ["autoplay is not a prop; Carousel never moves on its own", '<Carousel label="Recipe photos">'],
          orientation !== undefined && ["orientation is not a prop; Carousel scrolls horizontally", '<div className="grid gap-4">…</div>'],
        ]
      : /* istanbul ignore next @preserve -- production only */ undefined,
  );

  // The app's index, when it drives the carousel, within the slides.
  const controlled = indexProp === undefined ? undefined : Math.min(Math.max(0, indexProp), lastIndex);
  const startIndex = controlled ?? Math.min(Math.max(0, defaultIndex), lastIndex);
  const [index, setIndex] = useState(startIndex);
  const current = Math.min(index, lastIndex);
  // The settled index, and the slide a button press is heading to before the scroll settles.
  const settled = useRef(startIndex);
  const heading = useRef<number | undefined>(undefined);
  const rootRef = useRef<HTMLElement>(null);
  const viewportRef = useRef<HTMLDivElement>(null);
  const previousRef = useRef<HTMLButtonElement>(null);
  const nextRef = useRef<HTMLButtonElement>(null);
  // What had focus when the position settled: a re-render may disable it or make it inert.
  const focused = useRef<Element | null>(null);
  // The latest props for the scroll listener, which is attached once.
  // Stryker disable next-line ObjectLiteral: the layout effect below sets it before anything reads it.
  const latest = useRef({ onIndexChange, onTargetChange, slideLabel, total, lastIndex, loop, controlled });
  useLayoutEffect(() => {
    latest.current = { onIndexChange, onTargetChange, slideLabel, total, lastIndex, loop, controlled };
  });

  const scrollToSlide = (target: number, behavior: ScrollBehavior) => {
    const viewport = viewportRef.current!;
    const slide = viewport.children[target]!;
    const rtl = getComputedStyle(viewport).direction === "rtl";
    const box = viewport.getBoundingClientRect();
    const rect = slide.getBoundingClientRect();
    // The rects include any transform the carousel is drawn in (a Lightbox viewer starts at 90%), so
    // the distance is taken back to layout pixels, the units scrollLeft uses.
    const scale = viewport.offsetWidth > 0 ? box.width / viewport.offsetWidth : 1;
    viewport.scrollTo({ left: viewport.scrollLeft + ((rtl ? rect.right - box.right : rect.left - box.left) / scale), behavior });
  };

  // Start on defaultIndex. The server renders the first slide in view.
  useLayoutEffect(() => {
    if (startIndex > 0) scrollToSlide(startIndex, "instant");
    // Only on mount: defaultIndex is the starting slide.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // The position follows the scroll, however it moved: a button, a swipe, a key. It
  // settles when scrolling ends, so each change is reported and announced once, not for
  // every slide passed on the way. Where `scrollend` is missing, a pause stands in for it,
  // but not while a finger is down: a finger held still mid-swipe has not chosen a slide.
  // A pause is not proof the scroll is over (a busy page delays scroll events past it), so
  // it settles only when the position then holds still for two frames and, after a button
  // press, has reached the slide the press is heading to. `scrollend` itself is not proof
  // either: a press that lands while an earlier smooth scroll is still under way can fire
  // `scrollend` for the scroll it interrupted, at a slide the carousel never meant to stop
  // on, before the new scroll it started has reached — or even begun moving toward — the
  // slide it is heading to. So `scrollend` settles only when the position already matches
  // that heading (a press landing right as a real scroll ends still settles at once); a
  // mismatch waits like a pause, for the scroll that is actually still under way to end.
  useEffect(() => {
    const viewport = viewportRef.current!;
    const fallback = !("onscrollend" in HTMLElement.prototype);
    let timer: ReturnType<typeof setTimeout> | undefined;
    let frame: number | undefined;
    let touching = false;
    const stopWaiting = () => {
      clearTimeout(timer);
      if (frame !== undefined) cancelAnimationFrame(frame);
      frame = undefined;
    };
    const settle = () => {
      stopWaiting();
      heading.current = undefined;
      const { onIndexChange, onTargetChange, slideLabel, total, lastIndex, controlled } = latest.current;
      onTargetChange?.(null);
      const next = Math.min(nearestSlide(viewport), lastIndex);
      if (next === settled.current) return;
      focused.current = document.activeElement;
      settled.current = next;
      setIndex(next);
      // A move to the app's own index is the app's, so it is not reported back.
      if (next !== controlled) onIndexChange?.(next);
      announce(fillTemplate(slideLabel, next + 1, total));
    };
    // After a pause: settle if the position holds for two frames, else keep waiting. A press's
    // target not reached once the scroll has stopped (the user scrolled elsewhere) is dropped,
    // so the next pause settles wherever the scroll is.
    const check = () => {
      const left = viewport.scrollLeft;
      frame = requestAnimationFrame(() => {
        frame = requestAnimationFrame(() => {
          frame = undefined;
          if (viewport.scrollLeft !== left) return wait();
          const target = heading.current;
          if (target !== undefined && Math.min(nearestSlide(viewport), latest.current.lastIndex) !== target) {
            heading.current = undefined;
            return wait();
          }
          settle();
        });
      });
    };
    const wait = () => {
      stopWaiting();
      if (!touching) timer = setTimeout(check, 150);
    };
    // scrollend fires the moment the browser decides a scroll stopped, so it is trusted only
    // when the position it reports is where the latest press is heading: still mid-way there
    // means this scrollend belongs to a scroll it interrupted, so it is treated as a pause
    // instead, which keeps waiting for the real end. With no press pending, a browser can
    // still fire a stray scrollend after the carousel has already settled — a late notice for
    // a position it no longer holds — so that case gets the same two-frame stability check a
    // pause gets, instead of settling on a single unconfirmed read.
    const onScrollEnd = () => {
      const target = heading.current;
      if (target !== undefined) {
        if (Math.min(nearestSlide(viewport), latest.current.lastIndex) !== target) return wait();
        return settle();
      }
      check();
    };
    const onTouchStart = () => {
      touching = true;
      stopWaiting();
    };
    const onTouchEnd = (event: TouchEvent) => {
      touching = event.touches.length > 0;
      wait();
    };
    if (fallback) {
      viewport.addEventListener("scroll", wait, { passive: true });
      viewport.addEventListener("touchstart", onTouchStart, { passive: true });
      viewport.addEventListener("touchend", onTouchEnd, { passive: true });
      viewport.addEventListener("touchcancel", onTouchEnd, { passive: true });
    } else viewport.addEventListener("scrollend", onScrollEnd);
    return () => {
      stopWaiting();
      viewport.removeEventListener("scroll", wait);
      viewport.removeEventListener("touchstart", onTouchStart);
      viewport.removeEventListener("touchend", onTouchEnd);
      viewport.removeEventListener("touchcancel", onTouchEnd);
      viewport.removeEventListener("scrollend", onScrollEnd);
    };
  }, []);

  // Focus never falls to the page. A button disabled under focus hands it to the other
  // button, or to the carousel when both are disabled; focus inside a slide that left
  // the view (now inert) moves to the scroller. Runs before the browser drops the focus.
  useLayoutEffect(() => {
    const had = focused.current ?? document.activeElement!;
    focused.current = null;
    if (document.activeElement !== had && document.activeElement !== document.body) return;
    const previous = previousRef.current!;
    const next = nextRef.current!;
    const button = had === previous ? next : had === next ? previous : undefined;
    if (button && (had as HTMLButtonElement).disabled) (button.disabled ? rootRef.current! : button).focus();
    else if (had.closest("[inert]") && viewportRef.current!.contains(had)) viewportRef.current!.focus();
  });

  const reduced = useReducedMotion();
  // The app moved its index (the address changed, Back or Forward): go there. A move the
  // carousel reported itself is already where the scroll is, or heading there.
  useEffect(() => {
    if (controlled === undefined || controlled === (heading.current ?? settled.current)) return;
    heading.current = controlled;
    latest.current.onTargetChange?.(controlled);
    scrollToSlide(controlled, reduced ? "instant" : "smooth");
    // Only when the app's index changes: a new motion setting moves nothing.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [controlled]);
  // The pager marks where the app says the carousel is, so a followed link is marked at once.
  const shown = controlled ?? current;

  const go = (step: 1 | -1) => {
    // scrollend updates the ref before React commits the rendered index.
    const from = heading.current ?? Math.min(settled.current, lastIndex);
    // A native scrollend press can precede React disabling the boundary button.
    const requested = from + step;
    if (!loop && (requested < 0 || requested > lastIndex)) return;
    const target = requested > lastIndex ? 0 : requested < 0 ? lastIndex : requested;
    heading.current = target;
    latest.current.onTargetChange?.(target);
    scrollToSlide(target, reduced ? "instant" : "smooth");
  };

  return (
    <section
      ref={rootRef}
      data-ouro="carousel"
      aria-roledescription={roleDescription}
      aria-label={label}
      tabIndex={-1}
      className={cn(rootClass, className)}
    >
      <div data-ouro-carousel-viewport="" data-ouro-control="carousel" data-ouro-part="viewport" ref={viewportRef} tabIndex={0} className={cn(viewportClass, slidesPerViewClass[perView])}>
        {slides.map((slide, position) => (
          <div
            key={position}
            data-ouro-carousel-slide=""
            role="group"
            aria-roledescription={slideRoleDescription}
            aria-label={fillTemplate(slideLabel, position + 1, total)}
            // Slides out of view are inert, so Tab and a screen reader's reading order skip them.
            inert={position < current || position >= current + perView}
            className={slideClass}
          >
            {slide}
          </div>
        ))}
      </div>
      {/* With every slide in view there is nowhere to step. The buttons stay in the page, so a
          keyboard handler that presses them still finds them. */}
      <div data-ouro-carousel-buttons="" className={cn(buttonsClass, lastIndex === 0 && "hidden")}>
        {pagerHref && (
          <nav aria-label={pagerLabel} className={pagerClass}>
            {Array.from({ length: lastIndex + 1 }, (_, position) => (
              <RouterLink
                key={position}
                href={pagerHref(position)}
                aria-current={position === shown ? "true" : undefined}
                data-ouro-control="carousel"
                data-ouro-part="page"
                className={pageClass}
              >
                <span className="sr-only">{fillTemplate(slideLabel, position + 1, total)}</span>
              </RouterLink>
            ))}
          </nav>
        )}
        <Button
          ref={previousRef}
          variant="outline"
          tone="secondary"
          size="sm"
          aria-label={previousLabel}
          data-ouro-control="carousel"
          data-ouro-part="previous"
          disabled={total === 0 || (!loop && current === 0)}
          onClick={() => go(-1)}
        >
          <ChevronIcon back />
        </Button>
        <Button
          ref={nextRef}
          variant="outline"
          tone="secondary"
          size="sm"
          aria-label={nextLabel}
          data-ouro-control="carousel"
          data-ouro-part="next"
          disabled={total === 0 || (!loop && current === lastIndex)}
          onClick={() => go(1)}
        >
          <ChevronIcon />
        </Button>
      </div>
    </section>
  );
}
