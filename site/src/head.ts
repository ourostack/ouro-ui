import type { Route } from "./routes";

/** Where Pages serves the site. */
export const SITE = "https://ourostack.github.io/ouro-ui";

const escape = (text: string) => text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/"/g, "&quot;");

/**
 * The `<head>` tags of a prerendered page: its title and description, the canonical URL,
 * the icon, and the Open Graph and Twitter tags link previews read, with og.png
 * (site/scripts/og-image.mts) as the image.
 */
export function headTags(route: Route, canonical: boolean): string[] {
  const title = escape(route.title);
  const description = escape(route.description);
  const image = `${SITE}/og.png`;
  const alt = "Ouro UI: the landing page, with a bottom sheet open in a phone frame.";
  return [
    `<title>${title}</title>`,
    `<meta name="description" content="${description}" />`,
    canonical ? `<link rel="canonical" href="${SITE}${route.path}" />` : "",
    `<link rel="icon" href="/ouro-ui/favicon.svg" type="image/svg+xml" />`,
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
  ].filter(Boolean);
}
