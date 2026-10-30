import type { Route } from "./routes";
import { prepaintScript } from "./themes/prepaint";
import fonts from "./themes/fonts.json";

/** Where Pages serves the site. */
export const SITE = "https://ui.ouro.bot";

const escape = (text: string) => text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/"/g, "&quot;");

/**
 * The `<head>` tags of a prerendered page: its title and description, the canonical URL,
 * the icon, and the Open Graph and Twitter tags link previews read, with og.png
 * (site/scripts/og-image.mts) as the image.
 */
export function headTags(route: Route, canonical: boolean): string[] {
  // A preview route is unlinked and unindexed: no canonical address, and a robots tag.
  canonical = canonical && !route.noindex;
  const title = escape(route.title);
  const description = escape(route.description);
  const image = `${SITE}/og.png`;
  const alt = "Ouro HX, part of Ouro UI. Under construction. Designed down to the last tap and the last prop.";
  return [
    // First, so the stored theme and dark mode are on <html> before anything paints.
    `<script>${prepaintScript}</script>`,
    `<title>${title}</title>`,
    `<meta name="description" content="${description}" />`,
    route.noindex ? `<meta name="robots" content="noindex, nofollow" />` : "",
    canonical ? `<link rel="canonical" href="${SITE}${route.path}" />` : "",
    `<link rel="icon" href="/brand/ouro-hx.svg" type="image/svg+xml" />`,
    `<meta property="og:type" content="website" />`,
    `<meta property="og:site_name" content="Ouro HX" />`,
    `<meta property="og:title" content="${title}" />`,
    `<meta property="og:description" content="${description}" />`,
    canonical ? `<meta property="og:url" content="${SITE}${route.path}" />` : "",
    `<meta property="og:image" content="${image}" />`,
    `<meta property="og:image:width" content="1200" />`,
    `<meta property="og:image:height" content="630" />`,
    `<meta property="og:image:alt" content="${alt}" />`,
    `<meta name="twitter:card" content="summary_large_image" />`,
    `<meta name="twitter:title" content="${title}" />`,
    `<meta name="twitter:description" content="${description}" />`,
    `<meta name="twitter:image" content="${image}" />`,
    `<meta name="twitter:image:alt" content="${alt}" />`,
    // The voyage page sets its type in Geist and Geist Mono; only they are preloaded.
    ...(route.path === "/voyage/"
      ? fonts.filter((font) => font.preload).map((font) => `<link rel="preload" href="/fonts/${font.file}" as="font" type="font/woff2" crossorigin />`)
      : []),
  ].filter(Boolean);
}
