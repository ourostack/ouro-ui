import type { Route } from "./routes";
import { pageKind } from "./paths";
import { earlyInputScript } from "./early-input";
import { prepaintScript } from "./themes/prepaint";
import fonts from "./themes/fonts.json";
import { CARDS, cardAlt, STORYBOOK } from "./storybook";

/** Where Pages serves the site. */
export const SITE = "https://ui.ouroboros.bot";

const escape = (text: string) => text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/"/g, "&quot;");

/**
 * The `<head>` tags of a prerendered page: its title and description, the canonical URL, the
 * icons (the Ouro HX silhouette, which the site wears as Ouro UI's mark, the touch icon and the web manifest, all from the storybook
 * brand), and the Open Graph and Twitter tags link previews read, with the page's storybook card
 * (storybook.ts; site/scripts/og-cards.mts draws them into site/public/og/) as the image.
 */
export function headTags(route: Route, canonical: boolean): string[] {
  // An unindexed route has no canonical address, and a robots tag.
  canonical = canonical && !route.noindex;
  const title = escape(route.title);
  const description = escape(route.description);
  // A page with a card of its own shows it; the component pages keep og.png, the site-wide card, until
  // site.test.tsx's head-tag test moves with them to the docs card (after the phone-menu pull request, #648).
  const card = CARDS[route.path];
  const image = card ? `${SITE}/og/${card.file}` : `${SITE}/og.png`;
  const alt = card ? escape(cardAlt(card)) : "Ouro UI: Ouro HX for the screens people use, Ouro AX for the tools agents use.";
  return [
    // First, so the stored theme and dark mode are on <html> before anything paints.
    `<script>${prepaintScript}</script>`,
    // Before the body, so a tap or text in the page's first moments is kept until the page can answer it.
    `<script>${earlyInputScript}</script>`,
    `<title>${title}</title>`,
    `<meta name="description" content="${description}" />`,
    route.noindex ? `<meta name="robots" content="noindex, nofollow" />` : "",
    canonical ? `<link rel="canonical" href="${SITE}${route.path}" />` : "",
    `<link rel="icon" href="${STORYBOOK}icons/ouro-hx.svg" type="image/svg+xml" />`,
    `<link rel="apple-touch-icon" href="${STORYBOOK}icons/ouro-hx-180.png" sizes="180x180" />`,
    `<link rel="manifest" href="/manifest.webmanifest" />`,
    `<meta property="og:type" content="website" />`,
    `<meta property="og:site_name" content="Ouro UI" />`,
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
    // The voyage pages set their type in Geist and Geist Mono; only they are preloaded.
    ...(pageKind(route.path) === "voyage"
      ? fonts.filter((font) => font.preload).map((font) => `<link rel="preload" href="/fonts/${font.file}" as="font" type="font/woff2" crossorigin />`)
      : []),
  ].filter(Boolean);
}

/**
 * sitemap.xml: every page the site builds that search engines may index, at its canonical address,
 * so a crawler (and the brand audit, which checks each page's icons and card) finds them all.
 */
export function sitemap(routes: readonly Route[]): string {
  const urls = routes.filter((route) => !route.noindex).map((route) => `  <url><loc>${escape(SITE + route.path)}</loc></url>`);
  return ['<?xml version="1.0" encoding="UTF-8"?>', '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">', ...urls, "</urlset>", ""].join("\n");
}

/**
 * The page at an old address (routes.ts, `redirects`): GitHub Pages serves static files only, so
 * it refreshes to the new address at once, names that address as canonical for search engines, and
 * links to it for a browser that does not follow the refresh.
 */
export function redirectPage(to: string): string {
  const url = escape(to);
  return [
    "<!doctype html>",
    '<html lang="en">',
    "<head>",
    '<meta charset="utf-8" />',
    `<title>Moved · Ouro UI</title>`,
    `<meta http-equiv="refresh" content="0; url=${url}" />`,
    `<link rel="canonical" href="${SITE}${url}" />`,
    '<meta name="robots" content="noindex" />',
    "</head>",
    "<body>",
    `<p>This page has moved to <a href="${url}">${escape(SITE + to)}</a>.</p>`,
    "</body>",
    "</html>",
    "",
  ].join("\n");
}

