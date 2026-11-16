export { heroPreloadScript };
export type { HeroPreloadPicture, HeroPreloadPictures, HeroPreloadSource };

// Plain values with no hooks, so a Server Component (Next.js's root layout) can call
// heroPreloadScript; it runs after colorSchemeScript, which sets the `dark` class it reads.

/** One `<source>` of a hero picture, as the preload reads it. */
interface HeroPreloadSource {
  /** The source's `srcset`. */
  srcSet: string;
  /** The source's `sizes`. */
  sizes?: string | undefined;
  /** The MIME type, such as `image/avif`. */
  type?: string | undefined;
  /** The media query that picks this source. */
  media?: string | undefined;
}

/** One twin of a hero picture, as the preload reads it: what its `<picture>` loads. */
interface HeroPreloadPicture {
  /** The fallback file. The preload's `href`, or the first file of `srcSet` when it is absent. */
  src?: string | undefined;
  /** The `<img>`'s `srcset`. */
  srcSet?: string | undefined;
  /** The `<img>`'s `sizes`. */
  sizes?: string | undefined;
  /** The `<source>` elements, in order. */
  sources?: HeroPreloadSource[] | undefined;
}

/** The light and dark twins of a hero picture, the same objects Hero's `picture` takes. */
interface HeroPreloadPictures {
  /** The art shown in light mode. */
  light: HeroPreloadPicture;
  /** The art shown in dark mode. */
  dark: HeroPreloadPicture;
}

/**
 * The inline script that preloads the hero's twin for the page's scheme, from the `<head>`, so the
 * browser fetches that twin once. It reads the `dark` class `colorSchemeScript` sets, picks that
 * twin, and adds one `<link rel="preload">` for exactly the source its `<picture>` will use: the
 * first `sources` entry whose `media` matches, or else the twin's own `srcSet` and `sizes`. Use one
 * twin's `priority` instead when most visitors see the same scheme, with no helper.
 *
 * @group Layout
 * @see https://ui.ouroboros.bot/docs/hero
 * @example
 * <html lang="en" suppressHydrationWarning>
 *   <head>
 *     <script dangerouslySetInnerHTML={{ __html: colorSchemeScript() + heroPreloadScript({ light, dark }) }} />
 *   </head>
 *   <body>{children}</body>
 * </html>
 * @claim "The inline script that preloads the hero's twin" registry/ouro/lib/ouro/hero-preload-script.test.ts verify:testExists(registry/ouro/lib/ouro/hero-preload-script.test.ts::heroPreloadScript > preloads the dark twin's srcSet and sizes with the dark class, and the light twin's without it)
 * @claim "so the browser fetches that twin once" site/e2e/hero-preload.spec.ts verify:testExists(site/e2e/hero-preload.spec.ts::a hero whose twins both have priority > fetches the twin for the page's scheme once, for a stored dark choice with the system in light)
 */
function heroPreloadScript(pictures: HeroPreloadPictures): string {
  const data = JSON.stringify({ light: pick(pictures.light), dark: pick(pictures.dark) }).replace(/</g, "\\u003c");
  // The leading `;` lets the script follow colorSchemeScript's call in one `<script>`, as the example does.
  return (
    `;(function(){var p=${data}[document.documentElement.classList.contains("dark")?"dark":"light"],s,c;` +
    `for(var i=0;p.sources&&i<p.sources.length;i++){c=p.sources[i];if(!c.media||matchMedia(c.media).matches){s=c;break}}` +
    `var k=s||p,h=p.src||(k.srcSet||"").split(" ")[0];if(!h)return;` +
    `var l=document.createElement("link");l.rel="preload";l.as="image";l.setAttribute("fetchpriority","high");l.setAttribute("href",h);` +
    `if(k.srcSet)l.setAttribute("imagesrcset",k.srcSet);if(k.sizes)l.setAttribute("imagesizes",k.sizes);` +
    `if(s&&s.type)l.setAttribute("type",s.type);document.head.appendChild(l)})()`
  );
}

/** The fields the preload reads, so the script carries only those. */
function pick(picture: HeroPreloadPicture): HeroPreloadPicture {
  return {
    src: picture.src,
    srcSet: picture.srcSet,
    sizes: picture.sizes,
    sources: picture.sources?.map(({ srcSet, sizes, type, media }) => ({ srcSet, sizes, type, media })),
  };
}
