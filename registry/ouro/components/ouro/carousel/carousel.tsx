"use client";

import { Children, useEffect, useLayoutEffect, useRef, useState, type JSX, type ReactNode } from "react";
import { announce } from "@/registry/ouro/lib/ouro/announce";
import { useAppearanceClassNameCheck } from "@/registry/ouro/lib/ouro/class-name-check";
import { cn } from "@/registry/ouro/lib/ouro/cn";
import { useDevWarnings } from "@/registry/ouro/lib/ouro/use-dev-warnings";
import { Button } from "@/registry/ouro/components/ouro/button/button";
import {
  buttonsClass,
  fillTemplate,
  nearestSlide,
  rootClass,
  slideClass,
  slidesPerViewClass,
  viewportClass,
} from "@/registry/ouro/components/ouro/carousel/carousel-styles";

/** Props for {@link Carousel}. */
export interface CarouselProps {
  /** Names the carousel for screen readers, such as "Recipe photos". Always required. */
  label: string;
  /** The slides: each child is one slide, so pass the images or cards themselves. */
  children: ReactNode;
  /** Next on the last slide goes back to the first, and Previous on the first goes to the last. */
  loop?: boolean | undefined;
  /** How many slides show at once. @default 1 */
  slidesPerView?: 1 | 2 | 3 | (number & { 'Use 1, 2 or 3': never }) | undefined;
  /** The slide to start on, counting from 0. The starting slide is not announced. @default 0 */
  defaultIndex?: number | undefined;
  /** Called with the index of the first visible slide when the user moves to another slide, once per change. */
  onIndexChange?: ((index: number) => void) | undefined;
  /** The Previous button's accessible name. @default "Previous slide" */
  previousLabel?: string | undefined;
  /** The Next button's accessible name. @default "Next slide" */
  nextLabel?: string | undefined;
  /**
   * Names each slide and is announced when the position changes: `{n}` is the slide's
   * number and `{total}` the number of slides. @default "Slide {n} of {total}"
   */
  slideLabel?: string | undefined;
  /** Layout only: width and margins (`max-w-xl`, `mx-auto`). Appearance classes warn in development. */
  className?: string | undefined;

  /** Not a prop. Ouro UI's Carousel is not Embla: `<Carousel loop>`. */
  opts?: { 'Use <Carousel loop>; Carousel takes no Embla options': never };
  /** Not a prop. Read the position with `onIndexChange`: `<Carousel onIndexChange={setIndex}>`. */
  setApi?: { 'Use <Carousel onIndexChange={setIndex}>': never };
  /** Not a prop. Carousel never moves on its own, so it takes no plugins. */
  plugins?: { 'Carousel never moves on its own; remove plugins': never };
  /** Not a prop. Carousel never moves on its own: motion the user did not start is hard to read and to stop. */
  autoplay?: { 'Carousel never moves on its own; remove autoplay': never };
  /** Not a prop. Carousel scrolls horizontally; stack vertical content in a grid instead. */
  orientation?: { 'Carousel scrolls horizontally; use a grid for a vertical list': never };
}

const perViews = [1, 2, 3] as const;

function ChevronIcon({ back }: { back?: boolean }): JSX.Element {
  return (
    <svg aria-hidden="true" viewBox="0 0 16 16" fill="none" className={cn("size-4 rtl:-scale-x-100", back && "-scale-x-100 rtl:scale-x-100")}>
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
 * reduced motion the buttons jump instead of scrolling smoothly.
 *
 * Use a grid instead when every item should be visible at once, and `Tabs` when the
 * panels have names the user picks from.
 *
 * @group Display
 * @see https://ourostack.github.io/ouro-ui/docs/carousel
 *
 * @example
 * <Carousel label="Recipe photos">
 *   {photos.map((photo) => <img key={photo.id} src={photo.src} alt={photo.alt} />)}
 * </Carousel>
 * <Carousel label="Featured recipes" slidesPerView={2} loop onIndexChange={setIndex}>
 *   {recipes.map((recipe) => <RecipeCard key={recipe.id} recipe={recipe} />)}
 * </Carousel>
 */
export function Carousel(props: CarouselProps): JSX.Element {
  const {
    label,
    children,
    loop = false,
    slidesPerView: perViewProp = 1,
    defaultIndex = 0,
    onIndexChange,
    previousLabel = "Previous slide",
    nextLabel = "Next slide",
    slideLabel = "Slide {n} of {total}",
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
          opts !== undefined && ["opts is not a prop", "<Carousel loop>"],
          setApi !== undefined && ["setApi is not a prop", "<Carousel onIndexChange={setIndex}>"],
          plugins !== undefined && ["plugins is not a prop; Carousel never moves on its own", '<Carousel label="Recipe photos">'],
          autoplay !== undefined && ["autoplay is not a prop; Carousel never moves on its own", '<Carousel label="Recipe photos">'],
          orientation !== undefined && ["orientation is not a prop; Carousel scrolls horizontally", '<div className="grid gap-4">…</div>'],
        ]
      : /* istanbul ignore next @preserve -- production only */ undefined,
  );

  const startIndex = Math.min(Math.max(0, defaultIndex), lastIndex);
  const [index, setIndex] = useState(startIndex);
  const current = Math.min(index, lastIndex);
  // The settled index, and the slide a button press is heading to before the scroll settles.
  const settled = useRef(startIndex);
  const heading = useRef<number | undefined>(undefined);
  const viewportRef = useRef<HTMLDivElement>(null);
  const previousRef = useRef<HTMLButtonElement>(null);
  const nextRef = useRef<HTMLButtonElement>(null);
  const refocus = useRef(false);
  // The latest props for the scroll listener, which is attached once.
  const latest = useRef({ onIndexChange, slideLabel, total, lastIndex, loop });
  useLayoutEffect(() => {
    latest.current = { onIndexChange, slideLabel, total, lastIndex, loop };
  });

  const scrollToSlide = (target: number, behavior: ScrollBehavior) => {
    const viewport = viewportRef.current!;
    const slide = viewport.children[target]!;
    const rtl = getComputedStyle(viewport).direction === "rtl";
    const box = viewport.getBoundingClientRect();
    const rect = slide.getBoundingClientRect();
    viewport.scrollTo({ left: viewport.scrollLeft + (rtl ? rect.right - box.right : rect.left - box.left), behavior });
  };

  // Start on defaultIndex. The server renders the first slide in view.
  useLayoutEffect(() => {
    if (startIndex > 0) scrollToSlide(startIndex, "instant");
    // Only on mount: defaultIndex is the starting slide.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // The position follows the scroll, however it moved: a button, a swipe, a key. It
  // settles when scrolling ends (`scrollend`, or a pause where that event is missing),
  // so each change is reported and announced once, not for every slide passed on the way.
  useEffect(() => {
    const viewport = viewportRef.current!;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const settle = () => {
      clearTimeout(timer);
      heading.current = undefined;
      const { onIndexChange, slideLabel, total, lastIndex, loop } = latest.current;
      const next = Math.min(nearestSlide(viewport), lastIndex);
      if (next === settled.current) return;
      // Next is about to be disabled under the user's focus: move focus to Previous once it is enabled.
      refocus.current = !loop && next === lastIndex && document.activeElement === nextRef.current;
      settled.current = next;
      setIndex(next);
      onIndexChange?.(next);
      announce(fillTemplate(slideLabel, next + 1, total));
    };
    const onScroll = () => {
      clearTimeout(timer);
      timer = setTimeout(settle, 150);
    };
    viewport.addEventListener("scroll", onScroll, { passive: true });
    viewport.addEventListener("scrollend", settle);
    return () => {
      clearTimeout(timer);
      viewport.removeEventListener("scroll", onScroll);
      viewport.removeEventListener("scrollend", settle);
    };
  }, []);

  useEffect(() => {
    if (!refocus.current) return;
    refocus.current = false;
    previousRef.current!.focus();
  }, [current]);

  const go = (step: 1 | -1) => {
    const from = heading.current ?? current;
    // The buttons are disabled at the ends without `loop`, so wrapping only happens with it.
    const target = from + step > lastIndex ? 0 : from + step < 0 ? lastIndex : from + step;
    heading.current = target;
    const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
    scrollToSlide(target, reduce ? "instant" : "smooth");
  };

  return (
    <section data-ouro="carousel" aria-roledescription="carousel" aria-label={label} className={cn(rootClass, className)}>
      <div data-ouro-carousel-viewport="" ref={viewportRef} tabIndex={0} className={cn(viewportClass, slidesPerViewClass[perView])}>
        {slides.map((slide, position) => (
          <div
            key={position}
            data-ouro-carousel-slide=""
            role="group"
            aria-roledescription="slide"
            aria-label={fillTemplate(slideLabel, position + 1, total)}
            className={slideClass}
          >
            {slide}
          </div>
        ))}
      </div>
      <div data-ouro-carousel-buttons="" className={buttonsClass}>
        <Button
          ref={previousRef}
          variant="outline"
          tone="secondary"
          size="sm"
          aria-label={previousLabel}
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
          disabled={total === 0 || (!loop && current === lastIndex)}
          onClick={() => go(1)}
        >
          <ChevronIcon />
        </Button>
      </div>
    </section>
  );
}
