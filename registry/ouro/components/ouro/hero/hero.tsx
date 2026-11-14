"use client";

import { useState, type CSSProperties, type HTMLAttributes, type JSX, type ReactNode, type Ref } from "react";
import { useAppearanceClassNameCheck } from "@/registry/ouro/lib/ouro/class-name-check";
import { cn } from "@/registry/ouro/lib/ouro/cn";
import { useDevWarnings } from "@/registry/ouro/lib/ouro/use-dev-messages";
import { Heading } from "@/registry/ouro/components/ouro/text/heading";

/** How the hero is laid out: `stage` centres the text over a wide picture; `column` aligns both to a reading column; `split` sets the copy beside the media. */
export type HeroLayout = "stage" | "column" | "split";

/** One `<source>` element of a hero picture, in the order given. */
export interface HeroPictureSource {
  /** The source's `srcset`, such as an AVIF or WebP file. */
  srcSet: string;
  /** The MIME type, such as `image/avif`. */
  type?: string;
  /** A media query that picks this source, such as `(max-width: 40rem)`. */
  media?: string;
  /** The `sizes` for this source. */
  sizes?: string;
}

/**
 * The hero's picture. It never shows wider than its intrinsic `width`.
 *
 * @claim "It never shows wider than its intrinsic" registry/ouro/components/ouro/hero/hero.test.tsx verify:testExists(registry/ouro/components/ouro/hero/hero.test.tsx::Hero > never shows the picture wider than its intrinsic width)
 */
export interface HeroPicture {
  /** The fallback `<img>` file. */
  src: string;
  /**
   * The intrinsic pixel width of the wide file. The picture is never shown wider than this.
   *
   * @claim "The picture is never shown wider than this" registry/ouro/components/ouro/hero/hero.test.tsx verify:testExists(registry/ouro/components/ouro/hero/hero.test.tsx::Hero > never shows the picture wider than its intrinsic width)
   */
  width: number;
  /** The intrinsic pixel height, which sets the picture's aspect ratio and stops layout shift. */
  height: number;
  /** What the picture shows. Required unless `decorative` is set. */
  alt?: string;
  /** Hides the picture from assistive technology, with `alt=""`. */
  decorative?: boolean;
  /** `<source>` elements, in order: for example phone formats with a `media` query, then wide formats. */
  sources?: HeroPictureSource[];
  /** The `<img>`'s `srcset`. */
  srcSet?: string;
  /** The `<img>`'s `sizes`. */
  sizes?: string;
  /** Loads the picture early with `fetchPriority="high"`. Otherwise it loads lazily. */
  priority?: boolean;
  /** A wide aspect ratio, such as `"8 / 3"`, applied on wider screens. Without it the picture keeps its own ratio. */
  crop?: string;
  /** The `object-position` used when the picture is cropped. @default "50% 42%" */
  focus?: string;
}

/**
 * The hero's art in light and dark mode: the same scene by day and at night. Hero shows `light`
 * or `dark` with the page's dark mode, the `.dark` class on the root that a stored theme toggle
 * sets, in CSS, so the right one is there from the first paint.
 *
 * `dark` shares `light`'s frame: its `width` and `crop` size the box. It is the same scene, so
 * without its own `alt` or `decorative` it takes `light`'s. It always loads lazily, so a page
 * in light mode never downloads it; its `priority` only raises its fetch priority once it shows.
 *
 * @claim "Hero shows `light` or `dark` with the page's dark mode" registry/ouro/components/ouro/hero/hero.test.tsx verify:testExists(registry/ouro/components/ouro/hero/hero.test.tsx::Hero > shows the dark picture only while the page is in dark mode)
 * @claim "It always loads lazily" registry/ouro/components/ouro/hero/hero.test.tsx verify:testExists(registry/ouro/components/ouro/hero/hero.test.tsx::Hero > loads the dark picture lazily, raising its fetch priority only with priority)
 */
export interface HeroPictures {
  /** The art shown in light mode, and the frame both are shown in. */
  light: HeroPicture;
  /** The same scene at night, shown in dark mode. */
  dark: HeroPicture;
}

/** The props Hero adds to the `<header>` attributes it passes through. */
export interface HeroOwnProps {
  /** The hero's headline, its `<h1>` (or `<h2>` with `headingLevel={2}`). Required. */
  title: ReactNode;
  /** A short line above the title that says what kind of page this is. */
  eyebrow?: ReactNode;
  /**
   * The lede: a short paragraph under the title. Text is set in a `<p>`; anything else, such as
   * paragraphs or a list, is set in a `<div>` so it can hold blocks.
   */
  description?: ReactNode;
  /** The hero's buttons or links, such as Ouro buttons. */
  actions?: ReactNode;
  /**
   * The big picture, shown under the text: `{ light, dark }`, the same scene by day and at
   * night, swapped with the page's dark mode. A single picture still works and shows in both
   * modes, but it is deprecated: pass `{ light, dark }`. A later release makes `{ light, dark }` required.
   */
  picture?: HeroPictures | HeroPicture | undefined;
  /** Something live in the picture's place, such as a video, a demo or a scene. It rises in like a picture and fills the hero's width, up to `mediaWidth`. Use `picture` for a still image. */
  media?: ReactNode;
  /**
   * The widest the live `media` is shown, in pixels, such as a scene image's intrinsic width, so it is never
   * upscaled. Without it the media fills the hero's width. A `picture` uses its own `width` instead.
   *
   * @claim "so it is never upscaled" registry/ouro/components/ouro/hero/hero.test.tsx verify:testExists(registry/ouro/components/ouro/hero/hero.test.tsx::Hero > never shows live media wider than mediaWidth)
   */
  mediaWidth?: number | undefined;
  /**
   * `stage` centres the text over the picture; `column` aligns both to a reading column; `split` puts the copy and the media side by side from 64rem, and stacks them like `column` below that, for a page whose picture or live media belongs next to its words.
   *
   * @claim "puts the copy and the media side by side from 64rem" registry/ouro/components/ouro/hero/hero.test.tsx verify:testExists(registry/ouro/components/ouro/hero/hero.test.tsx::Hero > switches to the split layout, with copy and media side by side from 64rem)
   * @default "stage"
   */
  layout?: HeroLayout | (string & { 'Use "stage", "column" or "split"': never }) | undefined;
  /**
   * `rise` lifts the picture into place when it first appears, with reduced motion fading it in. The
   * rise is a CSS animation, so it plays from server-rendered HTML before any JavaScript runs; the
   * keyframes and durations come from `ouro-base`.
   *
   * @claim "so it plays from server-rendered HTML" registry/ouro/components/ouro/hero/hero.test.tsx verify:testExists(registry/ouro/components/ouro/hero/hero.test.tsx::Hero > rises the picture in from server-rendered HTML before any JavaScript runs, and only fades it with reduced motion)
   * @default "rise"
   */
  motion?: "rise" | "none" | (string & { 'Use "rise" or "none"': never }) | undefined;
  /** The title's heading level: `1` for the page's headline, `2` when the hero heads a section. @default 1 */
  headingLevel?: 1 | 2 | (number & { 'Use 1 for the page headline or 2 for a section': never }) | undefined;
  ref?: Ref<HTMLElement> | undefined;

  /** Not a prop. The lede is `description`: `<Hero description="…" />`. */
  subtitle?: { 'Use <Hero description="..." />': never };
  /** Not a prop. The headline is `title`: `<Hero title="Dinner, sorted" />`. */
  heading?: { 'Use <Hero title="Dinner, sorted" />': never };
  /** Not a prop. The line above the title is `eyebrow`: `<Hero eyebrow="Recipes" />`. */
  overline?: { 'Use <Hero eyebrow="Recipes" />': never };
  /** Not a prop. The picture is `picture`: `<Hero picture={{ src, width, height, alt }} />`. */
  image?: { 'Use picture={{ src, width, height, alt }}': never };
  /** Not a prop. The buttons are `actions`: `<Hero actions={<Button>Start</Button>} />`. */
  action?: { 'Use actions={<Button>Start</Button>}': never };
}

/** Props for {@link Hero}: its own props and the `<header>` attributes it passes through. */
export type HeroProps = Omit<HTMLAttributes<HTMLElement>, keyof HeroOwnProps> & HeroOwnProps;

const riseMotion =
  "motion-safe:animate-[ouro-hero-rise_var(--ouro-duration-slow)_var(--ouro-ease-out)_both] motion-reduce:animate-[ouro-hero-fade_var(--ouro-duration-fast)_var(--ouro-ease-out)_both]";

const layoutRoot: Record<HeroLayout, string> = {
  stage:
    "[--hero-width:calc(100%_-_2rem)] min-[40rem]:[--hero-width:min(80rem,calc(100%_-_4rem),max(48rem,calc((100svh_-_36rem)*8/3)))]",
  column: "[--hero-width:calc(100%_-_2rem)] min-[40rem]:[--hero-width:min(75rem,calc(100%_-_4rem))]",
  split: "mx-auto w-[calc(100%_-_2rem)] pt-10 [--hero-width:100%] min-[40rem]:w-[min(75rem,calc(100%_-_4rem))] min-[40rem]:pt-12",
};

// Split sets the copy and the media side by side only when there is media to set beside it.
const splitColumns = "min-[64rem]:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)] min-[64rem]:items-center min-[64rem]:gap-16";

const layoutText: Record<HeroLayout, string> = {
  stage: "mx-auto grid w-[calc(100%_-_2rem)] min-[40rem]:w-[min(80rem,calc(100%_-_4rem))] justify-items-center gap-4 pt-6 text-center min-[40rem]:pt-12",
  column: "mx-auto grid w-[var(--hero-width)] justify-items-start gap-4 text-start pt-10 min-[40rem]:pt-12",
  split: "grid w-[var(--hero-width)] min-w-0 justify-items-start gap-4 text-start",
};

const layoutActions: Record<HeroLayout, string> = {
  stage: "justify-center",
  column: "justify-start",
  split: "justify-start",
};

const layoutMedia: Record<HeroLayout, string> = {
  stage: "mx-auto mt-8 min-[40rem]:mt-12",
  column: "mx-auto mt-8",
  split: "mx-auto mt-8 min-[64rem]:mt-0",
};

// A twinned picture shows only in its scheme. The hidden one is display: none, so assistive
// technology hears one picture, and a lazy image that is not shown is never fetched.
const schemeClass = { light: "dark:hidden", dark: "hidden dark:block" } as const;

// The dark twin is the same scene as `day`, so it takes day's alt text and decorative flag unless it has its own.
function renderPicture(picture: HeroPicture, crop: string | undefined, scheme: "light" | "dark" | undefined, day?: HeroPicture): JSX.Element {
  const lazy = scheme === "dark" || !picture.priority;
  const decorative = picture.decorative ?? day?.decorative;
  return (
    <picture
      key={scheme}
      data-scheme={scheme}
      aria-hidden={decorative ? true : undefined}
      className={cn("block", scheme && schemeClass[scheme])}
    >
      {picture.sources?.map((source) => {
        // Stryker disable next-line LogicalOperator,StringLiteral: the key only keeps React's list stable; no output reads it.
        const key = `${source.type ?? ""}-${source.media ?? ""}-${source.srcSet}`;
        return <source key={key} srcSet={source.srcSet} type={source.type} media={source.media} sizes={source.sizes} />;
      })}
      <img
        data-slot="image"
        src={picture.src}
        srcSet={picture.srcSet}
        sizes={picture.sizes}
        width={picture.width}
        height={picture.height}
        alt={decorative ? "" : (picture.alt ?? day?.alt)}
        draggable={false}
        fetchPriority={picture.priority ? "high" : undefined}
        loading={lazy ? "lazy" : undefined}
        decoding={picture.priority ? undefined : "async"}
        style={{ objectPosition: picture.focus ?? "50% 42%" }}
        className={cn(
          "block h-auto w-full object-cover select-none",
          crop && "min-[40rem]:absolute min-[40rem]:inset-0 min-[40rem]:h-full",
        )}
      />
    </picture>
  );
}

/**
 * The top of a page: a headline with an optional line above it (`eyebrow`), a lede under
 * it (`description`), the page's buttons (`actions`) and a big picture, or something live in
 * its place (`media`), below. The picture is light and dark art, swapped with the page's dark
 * mode. The picture rises into place when it first appears unless `motion="none"`,
 * and it is never shown wider than its intrinsic width.
 *
 * Use `PageHeader` instead for a page's top with a breadcrumb or no picture, and `Heading`
 * for a plain title with nothing around it.
 *
 * @claim "it is never shown wider than its intrinsic width" registry/ouro/components/ouro/hero/hero.test.tsx verify:testExists(registry/ouro/components/ouro/hero/hero.test.tsx::Hero > never shows the picture wider than its intrinsic width)
 * @group Layout
 * @see https://ui.ouroboros.bot/docs/hero
 *
 * @example
 * <Hero
 *   eyebrow="Recipes"
 *   title="Dinner, sorted"
 *   description="Plan the week, shop once, cook without the scramble."
 *   actions={<Button>Start planning</Button>}
 *   picture={{
 *     light: { src: "/hero.jpg", width: 1536, height: 576, alt: "A table set for four" },
 *     dark: { src: "/hero-night.jpg", width: 1536, height: 576 },
 *   }}
 * />
 */
export function Hero(props: HeroProps): JSX.Element {
  const {
    title,
    eyebrow,
    description,
    actions,
    picture,
    media,
    mediaWidth,
    layout: layoutProp = "stage",
    motion: motionProp = "rise",
    headingLevel: headingLevelProp = 1,
    // Guard props (hint types), dropped here so they never reach the DOM.
    subtitle,
    heading,
    overline,
    image,
    action,
    className,
    ...rest
  } = props;
  // A lede that is only text is a paragraph; one made of blocks needs a <div> to be valid HTML.
  const light = picture && "light" in picture ? picture.light : picture;
  const dark = picture && "light" in picture ? picture.dark : undefined;
  const Lede = typeof description === "string" || typeof description === "number" ? "p" : "div";
  const layout: HeroLayout = layoutProp === "column" ? "column" : layoutProp === "split" ? "split" : "stage";
  // Stryker disable next-line StringLiteral: motion is only compared with "rise", so "" and "none" behave the same.
  const motion = motionProp === "none" ? "none" : "rise";
  const headingLevel = headingLevelProp === 2 ? 2 : 1;
  const [rising, setRising] = useState(motion === "rise");
  useAppearanceClassNameCheck(
    "Hero",
    className,
    process.env.NODE_ENV !== "production"
      ? (token: string) => `remove "${token}"; Hero sets its own look from the theme`
      : // Stryker disable next-line StringLiteral: production only; the check never runs there.
        /* istanbul ignore next @preserve -- production only */ "",
  );
  useDevWarnings(
    "Hero",
    process.env.NODE_ENV !== "production"
      ? () => [
          layout !== layoutProp && [
            `layout="${String(layoutProp)}" is not a layout; use "stage", "column" or "split"`,
            '<Hero layout="column" />',
          ],
          motion !== motionProp && [
            `motion="${String(motionProp)}" is not a motion; use "rise" or "none"`,
            '<Hero motion="none" />',
          ],
          headingLevel !== headingLevelProp && [
            `headingLevel={${String(headingLevelProp)}} is not a heading level; use 1 for the page headline or 2 for a section`,
            '<Hero headingLevel={2} />',
          ],
          light !== undefined &&
            light.alt === undefined &&
            light.decorative !== true && [
              "picture has no alt text",
              '<Hero picture={{ light: { src, width, height, alt: "A table set for four" }, dark }} />',
            ],
          light !== undefined &&
            media != null && [
              "picture and media are both set; show one: picture for a still image, media for something live",
              '<Hero media={<video src="..." muted autoPlay loop playsInline />} />',
            ],
          subtitle !== undefined && ["subtitle is not a prop", '<Hero description="..." />'],
          heading !== undefined && ["heading is not a prop", '<Hero title="Dinner, sorted" />'],
          overline !== undefined && ["overline is not a prop", '<Hero eyebrow="Recipes" />'],
          image !== undefined && ["image is not a prop", "<Hero picture={{ src, width, height, alt }} />"],
          action !== undefined && ["action is not a prop", "<Hero actions={<Button>Start</Button>} />"],
        ]
      : /* istanbul ignore next @preserve -- production only */ undefined,
  );
  const crop = light?.crop;
  const pictureStyle = light
    ? ({
        maxWidth: `${light.width}px`,
        ...(crop ? { "--hero-crop": crop } : {}),
      } as CSSProperties)
    : // Stryker disable next-line ConditionalExpression: without mediaWidth the style would be "undefinedpx", which the browser drops, so the page is the same.
      mediaWidth !== undefined
      ? ({ maxWidth: `${mediaWidth}px` } as CSSProperties)
      : undefined;
  const shown = light ? (
    <>
      {renderPicture(light, crop, dark ? "light" : undefined)}
      {dark ? renderPicture(dark, crop, "dark", light) : null}
    </>
  ) : typeof media === "boolean" ? null : (
    // `media={isWide && <video … />}` passes false: no empty frame rises in its place.
    media
  );
  return (
    <header
      {...rest}
      data-ouro="hero"
      data-layout={layout}
      className={cn("grid min-w-0", layoutRoot[layout], layout === "split" && shown != null && splitColumns, className)}
    >
      <div className={layoutText[layout]}>
        {eyebrow != null ? (
          <p data-slot="eyebrow" className="m-0 text-sm leading-5 font-medium text-muted-foreground">
            {eyebrow}
          </p>
        ) : null}
        <Heading level={headingLevel} size="display" className="min-w-0 text-balance">
          {title}
        </Heading>
        {description != null ? (
          <Lede
            data-slot="description"
            className="m-0 max-w-[70ch] text-base leading-7 text-muted-foreground text-pretty min-[40rem]:text-lg min-[40rem]:leading-8"
          >
            {description}
          </Lede>
        ) : null}
        {actions != null ? (
          <div data-slot="actions" className={cn("flex flex-wrap gap-3", layoutActions[layout])}>
            {actions}
          </div>
        ) : null}
      </div>
      {shown != null ? (
        <div
          data-slot="media"
          data-ouro-part="media"
          data-starting-style={rising ? "" : undefined}
          onAnimationEnd={() => setRising(false)}
          style={pictureStyle}
          className={cn(
            "block w-[var(--hero-width)] overflow-clip rounded-[4px]",
            layoutMedia[layout],
            motion === "rise" && riseMotion,
            crop && "relative min-[40rem]:aspect-[var(--hero-crop)]",
          )}
        >
          {shown}
        </div>
      ) : null}
    </header>
  );
}
