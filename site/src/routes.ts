import { docsItems } from "./docs/items";
import { docsPages } from "./docs/pages";
import { HERO_COPY, VOYAGE_HERO } from "./copy";
import { latestRelease } from "./latest-release";
import { normalizePath } from "./paths";

export { href, pathFromLocation } from "./paths";

/** Every page the site builds. Paths are relative to the base (`/ouro-ui/`) and end in `/`. */
export interface Route {
  path: string;
  title: string;
  description: string;
  /** A preview page that search engines must not index and no page links to (`/voyage/`). */
  noindex?: boolean;
}

const DESCRIPTION = `${HERO_COPY} Ouro HX is the component library within Ouro UI. Under construction. React components you copy into your app and own; they install with the shadcn CLI.`;
const VOYAGE_DESCRIPTION = `${VOYAGE_HERO.title.join(" ")} ${VOYAGE_HERO.subline} Ouro HX is the component library within Ouro UI. Under construction.`;

export const routes: Route[] = [
  { path: "/", title: "Ouro HX", description: DESCRIPTION },
  // The new landing page, built in slices on this hidden route until it replaces "/".
  { path: "/voyage/", title: "Mobilis in mobili · Ouro HX", description: VOYAGE_DESCRIPTION, noindex: true },
  { path: "/docs/", title: "Docs · Ouro HX", description: "Every Ouro HX component, with install commands, props and live demos." },
  ...docsItems.map((item) => ({
    path: `/docs/${item.name}/`,
    title: `${item.title} · Ouro HX`,
    description: `${item.title}: install it with npx shadcn@latest add ourostack/ouro-ui/${item.name}#${latestRelease}.`,
  })),
  ...docsPages.map((page) => ({
    path: `/docs/${page.name}/`,
    title: `${page.title} · Ouro HX`,
    description: page.summary.replace(/`/g, ""),
  })),
  {
    path: "/docs/switching-from-shadcn/",
    title: "Switching from shadcn · Ouro HX",
    description: "How each shadcn/ui component and prop maps to Ouro HX, and how both live in one app.",
  },
  {
    path: "/docs/updating/",
    title: "Updating installed components · Ouro HX",
    description: "Review upstream changes with add --diff, then overwrite and reapply your edits.",
  },
];

/** The route for a path, tolerating a missing trailing slash and `index.html`. */
export function routeFor(path: string): Route | undefined {
  const normalized = normalizePath(path);
  return routes.find((route) => route.path === normalized);
}
