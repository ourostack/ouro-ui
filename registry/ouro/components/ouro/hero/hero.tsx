"use client";

import { useLayoutEffect, useRef, useState, useSyncExternalStore, type CSSProperties, type HTMLAttributes, type JSX, type ReactNode, type Ref } from "react";
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
  /**
   * This source's intrinsic pixel width, when its art has another shape than the picture's own,
   * such as a phone crop. With `height`, it holds the image's box to this source's shape before
   * the file arrives, so the page doesn't shift.
   *
   * @claim "it holds the image's box to this source's shape" registry/ouro/components/ouro/hero/hero.test.tsx verify:testExists(registry/ouro/components/ouro/hero/hero.test.tsx::Hero > gives each source its own width and height, so a source of another shape holds its box before it loads)
   */
  width?: number;
  /** This source's intrinsic pixel height, with `width`. */
  height?: number;
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
  /** Loads the picture early with `fetchPriority="high"`. Otherwise it loads lazily. In `{ light, dark }`, see `HeroPictures` for how each twin loads. */
  priority?: boolean;
  /**
   * A wide aspect ratio, such as `"8 / 3"`, applied on wider screens in the stage and column
   * layouts. Without it the picture keeps its own ratio, as it does on a phone and in the split
   * layout, so a wide crop never cuts the subject in the split layout's narrower column.
   *
   * @claim "as it does on a phone and in the split" registry/ouro/components/ouro/hero/hero.test.tsx verify:testExists(registry/ouro/components/ouro/hero/hero.test.tsx::Hero > shows the whole picture in the split layout, so a wide crop never cuts its subject in the narrower column)
   */
  crop?: string;
  /**
   * The focal point kept in view when the picture is cropped, as an `object-position`, such as
   * `"50% 80%"` for a subject near the bottom. Set it on each picture: the dark one takes the
   * light one's unless it has its own.
   *
   * @claim "the dark one takes the light one's unless it has its own" registry/ouro/components/ouro/hero/hero.test.tsx verify:testExists(registry/ouro/components/ouro/hero/hero.test.tsx::Hero > gives the dark picture the light one's focus unless it has its own)
   * @default "50% 42%"
   */
  focus?: string;
  /**
   * A colour painted in the picture's box while the image loads, such as the art's main colour,
   * in place of an empty hole. It fills the box the `width` and `height` already reserve, so it
   * moves nothing, and an opaque image covers it once it decodes. Give the dark picture its own,
   * as it never takes the light one's: a day colour would flash at night. Hero has the file's
   * address but not its pixels, so take the colour from your image pipeline, for example the
   * `dominant` colour of `sharp(file).stats()`, or pick it by eye. Leave it out for art with
   * transparency, which would show it through.
   *
   * @claim "as it never takes the light one's" registry/ouro/components/ouro/hero/hero.test.tsx verify:testExists(registry/ouro/components/ouro/hero/hero.test.tsx::Hero > paints each picture's placeholder behind it while it loads, and the day's never at night)
   */
  placeholder?: string;
}

/**
 * The hero's art in light and dark mode: the same scene by day and at night. Hero shows `light`
 * or `dark` in CSS, with your app's Tailwind `dark` variant, the one every Ouro component's dark
 * styles follow, so the right one is there from the first paint. That variant reads the `.dark`
 * class Ouro's `colorSchemeScript` sets; a site that marks dark mode with `data-theme` or the
 * system setting redefines it, as the theming guide's [dark mode recipe](guides/theming.md#dark-mode)
 * shows, and Hero follows.
 *
 * `dark` shares `light`'s frame: its `width` and `crop` size the box. It is the same scene, so
 * without its own `alt`, `decorative` or `focus` it takes `light`'s.
 *
 * `priority` decides how the twin that shows loads. A twin without it is lazy, and a hidden lazy
 * image is never fetched. Give `priority` to the twin most of your visitors see, and it loads
 * straight from the HTML at high fetch priority while the other stays lazy. Give it to both to
 * fetch the twin for the page's scheme once: add `heroPreloadScript` to the `<head>` right after
 * `colorSchemeScript`, with the same `picture`, as
 * `<script dangerouslySetInnerHTML={{ __html: colorSchemeScript() + heroPreloadScript({ light, dark }) }} />`.
 * The HTML then holds neither twin's address. An inline script after the pictures copies the shown
 * twin's address onto it, and the hidden twin stays empty until the page hydrates.
 * Without JavaScript, both twins sit in a `<noscript>`, and the CSS shows the one for the page's scheme.
 * A page that can't run inline scripts gets its picture from React after hydration.
 *
 * @claim "Hero shows `light`" registry/ouro/components/ouro/hero/hero.test.tsx verify:testExists(registry/ouro/components/ouro/hero/hero.test.tsx::Hero > shows the dark picture only while the page is in dark mode)
 * @claim "and a hidden lazy" registry/ouro/components/ouro/hero/hero.test.tsx verify:testExists(registry/ouro/components/ouro/hero/hero.test.tsx::Hero > keeps a lone priority twin eager in the HTML and the other lazy, at high fetch priority)
 * @claim "and it loads" registry/ouro/components/ouro/hero/hero.test.tsx verify:testExists(registry/ouro/components/ouro/hero/hero.test.tsx::Hero > keeps a lone priority twin eager in the HTML and the other lazy, at high fetch priority)
 * @claim "fetch the twin for the page's scheme once" site/e2e/hero-preload.spec.ts verify:testExists(site/e2e/hero-preload.spec.ts::a hero whose twins both have priority > fetches the twin for the page's scheme once, for a stored dark choice with the system in light)
 * @claim "The HTML then holds neither twin's address" registry/ouro/components/ouro/hero/hero.test.tsx verify:testExists(registry/ouro/components/ouro/hero/hero.test.tsx::Hero > holds neither twin's address in the HTML of a pair both priority, until the script copies the shown one's)
 * @claim "copies the shown twin's address onto it" registry/ouro/components/ouro/hero/hero.test.tsx verify:testExists(registry/ouro/components/ouro/hero/hero.test.tsx::Hero > copies the shown twin's addresses onto it from server HTML, and leaves the hidden one empty)
 * @claim "the hidden twin stays empty until the page hydrates" registry/ouro/components/ouro/hero/hero.test.tsx verify:testExists(registry/ouro/components/ouro/hero/hero.test.tsx::Hero > copies the shown twin's addresses onto it from server HTML, and leaves the hidden one empty)
 * @claim "both twins sit in a `<noscript>`" site/e2e/hero-preload.spec.ts verify:testExists(site/e2e/hero-preload.spec.ts::a hero whose twins both have priority > without JavaScript, the noscript twins are the pictures shown, and each file loads once)
 * @claim "A page that can't run inline" registry/ouro/components/ouro/hero/hero.test.tsx verify:testExists(registry/ouro/components/ouro/hero/hero.test.tsx::Hero > gives the shown twin its address after hydration where the page's scripts did not run)
 * @claim "redefines it, as the theming guide's" docs/guides/theming.md verify:fileLine(docs/guides/theming.md, /@custom-variant dark/)
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
  /**
   * A trail above everything else, such as a `Breadcrumb`, on the text's edge.
   *
   * @claim "A trail above everything else" registry/ouro/components/ouro/hero/hero.test.tsx verify:testExists(registry/ouro/components/ouro/hero/hero.test.tsx::Hero > puts the trail above the eyebrow and the badge beside it, on the text's edge)
   */
  breadcrumb?: ReactNode;
  /** A short line above the title that says what kind of page this is. */
  eyebrow?: ReactNode;
  /**
   * A short status beside the eyebrow, such as a `Badge`: `badge={<Badge>Beta</Badge>}`. Hero
   * sets it on the eyebrow's line, or on that line alone without an eyebrow, and leaves its look
   * to what you pass.
   *
   * @claim "Hero sets it on the eyebrow's line" registry/ouro/components/ouro/hero/hero.test.tsx verify:testExists(registry/ouro/components/ouro/hero/hero.test.tsx::Hero > puts the trail above the eyebrow and the badge beside it, on the text's edge)
   */
  badge?: ReactNode;
  /**
   * The lede: a short paragraph under the title. Text is set in a `<p>`; anything else, such as
   * paragraphs or a list, is set in a `<div>` so it can hold blocks, and Hero clears its first
   * block's top margin and its last block's bottom margin, so a paragraph needs no `m-0`. It runs the full width of the
   * hero's text column, like the title. Its lines are balanced to even lengths in every layout, so
   * the last line is never left short; a lede longer than the browser balances, a few lines, wraps
   * as usual. To choose where a lede breaks, set each phrase in its own `inline-block` span,
   * as the `LongLede` story does.
   *
   * @claim "and Hero clears its first" registry/ouro/components/ouro/hero/hero.test.tsx verify:testExists(registry/ouro/components/ouro/hero/hero.test.tsx::Hero > clears the outer margins of the lede's first and last blocks, and keeps the space between them)
   * @claim "Its lines are balanced to even lengths" registry/ouro/components/ouro/hero/hero.test.tsx verify:testExists(registry/ouro/components/ouro/hero/hero.test.tsx::Hero > balances the lede in each layout, so its last line is never short)
   *
   * @claim "It runs the full width" registry/ouro/components/ouro/hero/hero.test.tsx verify:testExists(registry/ouro/components/ouro/hero/hero.test.tsx::Hero > runs the lede the full width of the text column in each layout)
   */
  description?: ReactNode;
  /**
   * The hero's buttons or links, such as Ouro buttons. They sit right under the lede, its next
   * element, on the lede's edge, set a little further from it than the lines of text are from
   * each other. Pass the page's main button here, not in `description`.
   *
   * @claim "They sit right under the lede" registry/ouro/components/ouro/hero/hero.test.tsx verify:testExists(registry/ouro/components/ouro/hero/hero.test.tsx::Hero > sets the actions right under the lede, a step further from it than the lines of text, on the lede's edge)
   */
  actions?: ReactNode;
  /**
   * The big picture, shown under the text: `{ light, dark }`, the same scene by day and at
   * night, swapped with the page's dark mode. Both are required: a hero has night art.
   *
   * Once the picture shown has loaded, the media frame carries `data-loaded`, so a site or a test
   * can wait on `[data-slot="media"][data-loaded]`. A small inline script in the server's HTML
   * sets it before any JavaScript bundle runs, and Hero sets it itself after hydration or a client
   * render, so it also arrives where a content security policy blocks inline scripts.
   *
   * @claim "A small inline script in the server's HTML" registry/ouro/components/ouro/hero/hero.test.tsx verify:testExists(registry/ouro/components/ouro/hero/hero.test.tsx::Hero > marks the frame data-loaded once the picture shown has loaded, from server HTML with no hydration)
   * @claim "so it also arrives where a content security policy blocks inline scripts" registry/ouro/components/ouro/hero/hero.test.tsx verify:testExists(registry/ouro/components/ouro/hero/hero.test.tsx::Hero > marks a picture that loaded before hydration once it hydrates, where the page's scripts did not run)
   */
  picture?: HeroPictures | undefined;
  /**
   * More under the actions, in the text column, such as a byline, a note or a short recording. In
   * the split layout it sits beside the picture. A second picture or a demo belongs in the next
   * section, not the hero.
   *
   * @claim "In the split layout it sits beside the picture" registry/ouro/components/ouro/hero/hero.test.tsx verify:testExists(registry/ouro/components/ouro/hero/hero.test.tsx::Hero > sets more under the actions in the text column, beside the art in the split layout)
   */
  children?: ReactNode;
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
   * Stretches the hero to the width of its container, with no gutter or cap of its own, for a hero
   * inside a page column that already sets the width. Without it the hero keeps a gutter at either
   * side and caps its width.
   *
   * @claim "Stretches the hero to the" registry/ouro/components/ouro/hero/hero.test.tsx verify:testExists(registry/ouro/components/ouro/hero/hero.test.tsx::Hero > takes its container's width with fullWidth, with no gutter or cap of its own)
   */
  fullWidth?: boolean | undefined;
  /**
   * `stage` centres the text over the picture; `column` aligns both to a reading column; `split` puts the copy and the media side by side from 64rem, and stacks them like `column` below that, for a page whose picture or live media belongs next to its words.
   *
   * @claim "puts the copy and the media side by side from 64rem" registry/ouro/components/ouro/hero/hero.test.tsx verify:testExists(registry/ouro/components/ouro/hero/hero.test.tsx::Hero > switches to the split layout, with copy and media side by side from 64rem)
   * @default "stage"
   */
  layout?: HeroLayout | (string & { 'Use "stage", "column" or "split"': never }) | undefined;
  /**
   * `rise` lifts the picture into place when it first appears, with reduced motion fading it in. The
   * rise is a CSS transition from `@starting-style` in Hero's own classes, so it plays from
   * server-rendered HTML before any JavaScript runs, and it needs no keyframes and no stylesheet to
   * import. It takes its duration and easing from `ouro-base`'s `--ouro-duration-slow`,
   * `--ouro-duration-fast` and `--ouro-ease-out`. The wrapper carries `data-starting-style` only
   * while a hydrated page sees the rise running, so server HTML that never hydrates, such as an Astro
   * page without client JavaScript, carries no marker.
   *
   * @claim "so server HTML that never hydrates" registry/ouro/components/ouro/hero/hero.test.tsx verify:testExists(registry/ouro/components/ouro/hero/hero.test.tsx::Hero > marks the rise only while it runs, so server HTML that never hydrates carries no marker)
   * @claim "so it plays from server-rendered HTML" registry/ouro/components/ouro/hero/hero.test.tsx verify:testExists(registry/ouro/components/ouro/hero/hero.test.tsx::Hero > rises the picture in from server-rendered HTML before any JavaScript runs, and only fades it with reduced motion)
   * @claim "it needs no keyframes and no stylesheet" registry/ouro/components/ouro/hero/hero.test.tsx verify:testExists(registry/ouro/components/ouro/hero/hero.test.tsx::Hero > rises with no keyframes: its own transition, on ouro-base's durations and easing)
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
  /** Not a prop. The picture is `picture`: `<Hero picture={{ light: { src, width, height, alt }, dark: { src, width, height } }} />`. */
  image?: { 'Use picture={{ light, dark }}': never };
  /** Not a prop. The buttons are `actions`: `<Hero actions={<Button>Start</Button>} />`. */
  action?: { 'Use actions={<Button>Start</Button>}': never };
}

/** Props for {@link Hero}: its own props and the `<header>` attributes it passes through. */
export type HeroProps = Omit<HTMLAttributes<HTMLElement>, keyof HeroOwnProps> & HeroOwnProps;

// The rise is a transition from @starting-style, in the hero's own classes, so it needs no keyframes
// and no script. Its durations and easing are ouro-base's tokens, which every app loads.
const riseMotion =
  "starting:opacity-0 motion-safe:[transition:opacity_var(--ouro-duration-slow)_var(--ouro-ease-out),transform_var(--ouro-duration-slow)_var(--ouro-ease-out)] motion-safe:starting:[transform:translateY(1rem)] motion-reduce:[transition:opacity_var(--ouro-duration-fast)_var(--ouro-ease-out)]";

const layoutRoot: Record<HeroLayout, string> = {
  stage:
    "[--hero-width:calc(100%_-_2rem)] min-[40rem]:[--hero-width:min(80rem,calc(100%_-_4rem),max(48rem,calc((100svh_-_36rem)*8/3)))]",
  column: "[--hero-width:calc(100%_-_2rem)] min-[40rem]:[--hero-width:min(75rem,calc(100%_-_4rem))]",
  split: "mx-auto w-[calc(100%_-_2rem)] pt-10 [--hero-width:100%] min-[40rem]:w-[min(75rem,calc(100%_-_4rem))] min-[40rem]:pt-12",
};

// A full-width hero takes its container's width: no gutter and no cap.
const fullWidthRoot: Record<HeroLayout, string> = {
  stage: "[--hero-width:100%]",
  column: "[--hero-width:100%]",
  split: "w-full pt-10 [--hero-width:100%] min-[40rem]:pt-12",
};

// Split sets the copy and the media side by side only when there is media to set beside it.
const splitColumns = "min-[64rem]:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)] min-[64rem]:items-center min-[64rem]:gap-16";

const layoutText: Record<HeroLayout, string> = {
  stage: "mx-auto grid w-[calc(100%_-_2rem)] min-[40rem]:w-[min(80rem,calc(100%_-_4rem))] justify-items-center gap-4 pt-6 text-center min-[40rem]:pt-12",
  column: "mx-auto grid w-[var(--hero-width)] justify-items-start gap-4 text-start pt-10 min-[40rem]:pt-12",
  split: "grid w-[var(--hero-width)] min-w-0 justify-items-start gap-4 text-start",
};

const fullWidthStageText = "mx-auto grid w-full justify-items-center gap-4 pt-6 text-center min-[40rem]:pt-12";


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

// Run as the parser reaches it, after the pictures and once the page's CSS has loaded: it marks the
// frame `data-loaded` once the picture shown has loaded. For urgent twins (`u`) it loads that
// picture now, leaving the hidden one lazy, so it is never fetched. For a deferred pair (`d`) the
// HTML holds the addresses in `data-` attributes, and it copies the shown twin's onto its sources
// and `<img>`, sources first, so the browser picks the same candidate the preload did.
const firstPaintScript = (urgent: boolean, deferred?: boolean) =>
  `(function(s,u,d){function c(e,a){var v=e.getAttribute("data-"+a);if(v!==null)e.setAttribute(a,v)}var f=s.parentNode,p=f.children;for(var i=0;i<p.length;i++){var g=p[i].tagName==="PICTURE"&&getComputedStyle(p[i]).display!=="none"&&p[i].querySelector("img");if(g){if(d){for(var j=0,q=p[i].querySelectorAll("source");j<q.length;j++)c(q[j],"srcset");c(g,"srcset");c(g,"src")}if(u&&g.loading==="lazy")g.loading="eager";var e2=function(){f.setAttribute("data-loaded","")};if(g.complete&&g.naturalWidth)e2();else g.addEventListener("load",e2)}}})(document.currentScript,${urgent ? 1 : 0},${deferred ? 1 : 0})`;

/** Whether the picture holding this image is the one shown, rather than its twin for the other scheme. */
const isShown = (image: HTMLImageElement) => getComputedStyle(image.parentElement!).display !== "none";

// Stryker disable next-line ArrowFunction: the type never changes after hydration, so nothing subscribes and the unsubscribe has nothing to undo.
const noSubscription = () => () => {};
const clientScriptType = () => "text/plain";
const serverScriptType = () => undefined;

// A deferred pair's server HTML, and hydration, hold no addresses; a client render has them.
const clientHasAddresses = () => true;
// Stryker disable next-line ArrowFunction: undefined reads as false, the same "no addresses yet".
const serverHasAddresses = () => false;

/**
 * The script, in the server's HTML only. A client render marks it as data, which React neither runs
 * nor warns about; hydration keeps the server's type until it has adopted the script, which has run.
 */
function FirstPaintScript({ urgent, deferred }: { urgent: boolean; deferred?: boolean }): JSX.Element {
  const type = useSyncExternalStore(noSubscription, clientScriptType, serverScriptType);
  return <script type={type} dangerouslySetInnerHTML={{ __html: firstPaintScript(urgent, deferred) }} />;
}

// The dark twin is the same scene as `day`, so it takes day's alt text, decorative flag and focus unless it has its own.
// `eager` loads it straight from the HTML; `urgent` fetches it first once it loads, and lets the script flip it.
// `deferred` is set on a twin of a pair both `priority`: `data` keeps its addresses in `data-` attributes for the
// first-paint script to copy, and `live` renders them as a client render does. Such a twin is hidden without scripts.
function renderPicture(
  picture: HeroPicture,
  crop: string | undefined,
  scheme: "light" | "dark" | undefined,
  load: { eager: boolean; urgent: boolean; onLoad: (image: HTMLImageElement) => void; deferred?: "data" | "live" | undefined },
  day?: HeroPicture,
): JSX.Element {
  const decorative = picture.decorative ?? day?.decorative;
  const data = load.deferred === "data";
  return (
    <picture
      key={scheme}
      data-scheme={scheme}
      aria-hidden={decorative ? true : undefined}
      className={cn("block", scheme && schemeClass[scheme], load.deferred !== undefined && "[@media(scripting:none)]:hidden")}
    >
      {picture.sources?.map((source) => {
        // Stryker disable next-line LogicalOperator,StringLiteral: the key only keeps React's list stable; no output reads it.
        const key = `${source.type ?? ""}-${source.media ?? ""}-${source.srcSet}`;
        const addresses = data ? { "data-srcset": source.srcSet } : { srcSet: source.srcSet };
        return (
          <source
            key={key}
            {...addresses}
            type={source.type}
            media={source.media}
            sizes={source.sizes}
            width={source.width}
            height={source.height}
            suppressHydrationWarning={data}
          />
        );
      })}
      <img
        data-slot="image"
        // Before the addresses: WebKit fetches an image given its address while it is still eager, as a hydrated twin is.
        loading={load.eager ? undefined : "lazy"}
        {...(data ? { "data-src": picture.src, "data-srcset": picture.srcSet } : { src: picture.src, srcSet: picture.srcSet })}
        sizes={picture.sizes}
        width={picture.width}
        height={picture.height}
        alt={decorative ? "" : (picture.alt ?? day?.alt)}
        draggable={false}
        fetchPriority={load.urgent ? "high" : undefined}
        decoding={load.urgent ? undefined : "async"}
        // The first-paint script may have set loading="eager" before React hydrates.
        suppressHydrationWarning={load.urgent}
        onLoad={(event) => load.onLoad(event.currentTarget)}
        style={{ objectPosition: picture.focus ?? day?.focus ?? "50% 42%", backgroundColor: picture.placeholder }}
        className={cn(
          "block h-auto w-full object-cover select-none",
          crop && "min-[40rem]:absolute min-[40rem]:inset-0 min-[40rem]:h-full",
        )}
      />
    </picture>
  );
}

/**
 * A pair both `priority`. Its server HTML holds neither twin's addresses, so nothing loads until the first-paint
 * script copies the shown twin's onto it. A `<noscript>` carries both twins for a page without scripts. A client
 * render, and a page once it hydrates, has the addresses, both lazy: the shown twin, on screen, loads, and the
 * hidden one loads only on a change of scheme.
 */
function TwinPictures({
  light,
  dark,
  crop,
  onLoad,
}: {
  light: HeroPicture;
  dark: HeroPicture;
  crop: string | undefined;
  onLoad: (image: HTMLImageElement) => void;
}): JSX.Element {
  const live = useSyncExternalStore(noSubscription, clientHasAddresses, serverHasAddresses);
  // Stryker disable next-line StringLiteral: renderPicture tests only "data" and undefined, so "live" and any other value render alike.
  const deferred = live ? "live" : "data";
  // In the HTML both wait eager, for the script to give the shown one its addresses. With addresses both are lazy:
  // the shown one, on screen, loads (or has loaded), and the hidden one waits for a change of scheme. Which one shows
  // is the page's CSS's to say, so it is not guessed from a class here.
  return (
    <>
      {renderPicture(light, crop, "light", { eager: !live, urgent: true, onLoad, deferred })}
      {renderPicture(dark, crop, "dark", { eager: !live, urgent: true, onLoad, deferred }, light)}
      <FirstPaintScript urgent deferred />
      <noscript>
        {renderPicture(light, crop, "light", { eager: false, urgent: true, onLoad })}
        {renderPicture(dark, crop, "dark", { eager: false, urgent: true, onLoad }, light)}
      </noscript>
    </>
  );
}

/**
 * The top of a page: a headline with an optional line above it (`eyebrow`) and a status beside
 * that (`badge`), a trail above them (`breadcrumb`), a lede under the headline (`description`),
 * the page's buttons (`actions`), more such as a byline (`children`), and a big picture, or
 * something live in its place (`media`), below. The picture is light and dark art, swapped with the page's dark
 * mode. The picture rises into place when it first appears unless `motion="none"`,
 * and it is never shown wider than its intrinsic width. Its frame takes the theme's xl corners,
 * in Ouro's corner shape.
 *
 * Use `PageHeader` instead for a page's top with no picture, and `Heading`
 * for a plain title with nothing around it.
 *
 * @claim "it is never shown wider than its intrinsic width" registry/ouro/components/ouro/hero/hero.test.tsx verify:testExists(registry/ouro/components/ouro/hero/hero.test.tsx::Hero > never shows the picture wider than its intrinsic width)
 * @claim "Its frame takes the theme's xl corners" registry/ouro/components/ouro/hero/hero.test.tsx verify:testExists(registry/ouro/components/ouro/hero/hero.test.tsx::Hero > frames the picture with the theme's xl squircle corners)
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
    breadcrumb,
    eyebrow,
    badge,
    description,
    actions,
    children,
    picture,
    media,
    mediaWidth,
    fullWidth = false,
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
  const light = picture?.light;
  const dark = picture?.dark;
  const Lede = typeof description === "string" || typeof description === "number" ? "p" : "div";
  const layout: HeroLayout = layoutProp === "column" ? "column" : layoutProp === "split" ? "split" : "stage";
  // Stryker disable next-line StringLiteral: motion is only compared with "rise", so "" and "none" behave the same.
  const motion = motionProp === "none" ? "none" : "rise";
  const headingLevel = headingLevelProp === 2 ? 2 : 1;
  // The marker names the rise for the motion evidence. It is set only once the rise is seen running here, never in the
  // server's HTML, so a page that never hydrates keeps no marker, and it goes when the rise ends.
  const [rising, setRising] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const onImageLoad = (image: HTMLImageElement) => {
    if (isShown(image)) setLoaded(true);
  };
  const mediaRef = useRef<HTMLDivElement>(null);
  useLayoutEffect(
    () => {
      // A finished transition leaves the list, so any animation here is the rise still running.
      const running = mediaRef.current?.getAnimations().length;
      if (running) setRising(true);
      // A picture that loaded before hydration, where the page's scripts did not run, fired its load event unheard.
      const shownImage = [...(mediaRef.current?.querySelectorAll<HTMLImageElement>("picture > img") ?? [])].find(isShown);
      if (shownImage?.complete && shownImage.naturalWidth > 0) setLoaded(true);
    },
    // Stryker disable next-line ArrayDeclaration: any constant list runs the effect once, like an empty one.
    [],
  );
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
          picture !== undefined &&
            (light === undefined || dark === undefined) && [
              "picture needs light and dark art, the same scene by day and at night",
              "<Hero picture={{ light: { src, width, height, alt }, dark: { src, width, height } }} />",
            ],
          light !== undefined &&
            media != null && [
              "picture and media are both set; show one: picture for a still image, media for something live",
              '<Hero media={<video src="..." muted autoPlay loop playsInline />} />',
            ],
          subtitle !== undefined && ["subtitle is not a prop", '<Hero description="..." />'],
          heading !== undefined && ["heading is not a prop", '<Hero title="Dinner, sorted" />'],
          overline !== undefined && ["overline is not a prop", '<Hero eyebrow="Recipes" />'],
          image !== undefined && ["image is not a prop", "<Hero picture={{ light: { src, width, height, alt }, dark: { src, width, height } }} />"],
          action !== undefined && ["action is not a prop", "<Hero actions={<Button>Start</Button>} />"],
        ]
      : /* istanbul ignore next @preserve -- production only */ undefined,
  );
  const crop = layout === "split" ? undefined : light?.crop;
  const pictureStyle = light
    ? ({
        maxWidth: `${light.width}px`,
        ...(crop ? { "--hero-crop": crop } : {}),
      } as CSSProperties)
    : // Stryker disable next-line ConditionalExpression: without mediaWidth the style would be "undefinedpx", which the browser drops, so the page is the same.
      mediaWidth !== undefined
      ? ({ maxWidth: `${mediaWidth}px` } as CSSProperties)
      : undefined;
  // Untyped code can still leave out the dark art: it is warned, and the light art then shows in both modes.
  // A twin with `priority` loads from the HTML unless both have it; then the first-paint script loads the one shown.
  const urgent = light?.priority === true || dark?.priority === true;
  const deferred = light?.priority === true && dark?.priority === true;
  const shown = light ? (
    dark ? (
      deferred ? (
        <TwinPictures light={light} dark={dark} crop={crop} onLoad={onImageLoad} />
      ) : (
        <>
          {renderPicture(light, crop, "light", { eager: light.priority === true, urgent, onLoad: onImageLoad })}
          {renderPicture(dark, crop, "dark", { eager: dark.priority === true, urgent, onLoad: onImageLoad }, light)}
          <FirstPaintScript urgent={urgent} />
        </>
      )
    ) : (
      <>
        {renderPicture(light, crop, undefined, { eager: light.priority === true, urgent, onLoad: onImageLoad })}
        <FirstPaintScript urgent={false} />
      </>
    )
  ) : typeof media === "boolean" ? null : (
    // `media={isWide && <video … />}` passes false: no empty frame rises in its place.
    media
  );
  const eyebrowLine =
    eyebrow != null ? (
      <p data-slot="eyebrow" className="m-0 text-sm leading-5 font-medium text-muted-foreground">
        {eyebrow}
      </p>
    ) : null;
  return (
    <header
      {...rest}
      data-ouro="hero"
      data-layout={layout}
      className={cn("grid min-w-0", (fullWidth ? fullWidthRoot : layoutRoot)[layout], layout === "split" && shown != null && splitColumns, className)}
    >
      <div className={fullWidth && layout === "stage" ? fullWidthStageText : layoutText[layout]}>
        {breadcrumb != null ? (
          <div data-slot="breadcrumb" className="min-w-0">
            {breadcrumb}
          </div>
        ) : null}
        {badge != null ? (
          <div className={cn("flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1", layoutActions[layout])}>
            {eyebrowLine}
            <span data-slot="badge" className="inline-flex">
              {badge}
            </span>
          </div>
        ) : (
          eyebrowLine
        )}
        <Heading level={headingLevel} size="display" className="min-w-0 text-balance">
          {title}
        </Heading>
        {description != null ? (
          <Lede
            data-slot="description"
            className={cn(
              "m-0 text-base leading-7 text-balance text-muted-foreground min-[40rem]:text-lg min-[40rem]:leading-8",
              // In the reset layer, so a margin class the app puts on a paragraph still wins.
              "[@layer_ouro-reset]:[&>:first-child]:mt-0 [@layer_ouro-reset]:[&>:last-child]:mb-0",
            )}
          >
            {description}
          </Lede>
        ) : null}
        {actions != null ? (
          // A step further from the lede than the lines of text are from each other, so the buttons read as the lede's next move.
          <div data-slot="actions" className={cn("mt-2 flex flex-wrap gap-3", layoutActions[layout])}>
            {actions}
          </div>
        ) : null}
        {children != null ? (
          <div data-slot="more" className="min-w-0">
            {children}
          </div>
        ) : null}
      </div>
      {shown != null ? (
        <div
          data-slot="media"
          data-ouro-part="media"
          ref={mediaRef}
          data-starting-style={rising ? "" : undefined}
          data-loaded={loaded ? "" : undefined}
          // The first-paint script may have set data-loaded before React hydrates.
          suppressHydrationWarning
          onTransitionEnd={() => setRising(false)}
          style={pictureStyle}
          className={cn(
            "block w-[var(--hero-width)] overflow-clip rounded-xl",
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
