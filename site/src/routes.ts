import { claim } from "@/registry/ouro/lib/ouro/claims";
import { docsItems } from "./docs/items";
import pageIndex from "./docs/page-index.json";
import { VOYAGE_HERO } from "./copy";
import { latestRelease } from "./latest-release";
import { normalizePath } from "./paths";

export { href, pathFromLocation } from "./paths";

/** Every page the site builds. Paths are relative to the base (`/`) and end in `/`. */
export interface Route {
  path: string;
  title: string;
  description: string;
  /** A page that search engines must not index. */
  noindex?: boolean;
}

/** Old addresses that send the reader on: a static page with a refresh, a canonical link and a plain link (head.ts). */
export const redirects: Array<{ from: string; to: string }> = [{ from: "/voyage/", to: "/" }];

const DESCRIPTION = `${VOYAGE_HERO.title.join(" ")} ${VOYAGE_HERO.subline} Ouro HX is the component library within Ouro UI.`;
// NAUTILUS_PAGE.intro (voyage/copy.ts), written out so the docs, which import this file, do not load the voyage's words.
const NAUTILUS_DESCRIPTION = `Captain Nemo is building a submarine in secret, on a far-off island. Help him get her ready, then sail with him. A story told with Ouro HX components: build the Nautilus, then join her crew.`;

export const routes: Route[] = [
  { path: "/", title: "Ouro HX", description: DESCRIPTION },
  { path: "/nautilus/", title: "The Nautilus · Ouro HX", description: NAUTILUS_DESCRIPTION },
  {
    path: "/docs/",
    title: "Docs · Ouro HX",
    description: claim("Every Ouro HX component, with install commands, props and live demos.", {
      source: { file: "site/src/site.test.tsx" },
      verify: { testExists: "site/src/site.test.tsx::docs > has a page for every registry item at docs/<name>" },
    }),
  },
  ...docsItems.map((item) => ({
    path: `/docs/${item.name}/`,
    title: `${item.title} · Ouro HX`,
    description: `${item.title}: install it with npx shadcn@latest add ourostack/ouro-ui/${item.name}#${latestRelease}.`,
  })),
  ...pageIndex.map((page) => ({
    path: `/docs/${page.name}/`,
    title: `${page.title} · Ouro HX`,
    description: page.summary.replace(/`/g, ""),
  })),
  {
    path: "/docs/switching-from-shadcn/",
    title: "Switching from shadcn · Ouro HX",
    description: "How shadcn/ui components and props map to Ouro HX, and how both live in one app.",
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
