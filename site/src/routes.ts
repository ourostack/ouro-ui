import { docsItems } from "./docs/items";

/** Every page the site builds. Paths are relative to the base (`/ouro-ui/`) and end in `/`. */
export interface Route {
  path: string;
  title: string;
  description: string;
}

const DESCRIPTION =
  "React components with handcrafted interactions, installed into your project as code you own, designed so coding agents use them correctly.";

export const routes: Route[] = [
  { path: "/", title: "Ouro UI", description: DESCRIPTION },
  { path: "/docs/", title: "Docs · Ouro UI", description: "Every Ouro UI component, with install commands, props and live demos." },
  ...docsItems.map((item) => ({
    path: `/docs/${item.name}/`,
    title: `${item.title} · Ouro UI`,
    description: `${item.title}: install it with npx shadcn add ourostack/ouro-ui/${item.name}.`,
  })),
  {
    path: "/docs/switching-from-shadcn/",
    title: "Switching from shadcn · Ouro UI",
    description: "How each shadcn/ui component and prop maps to Ouro UI, and how both live in one app.",
  },
  {
    path: "/docs/updating/",
    title: "Updating installed components · Ouro UI",
    description: "Review upstream changes with add --diff, then overwrite and reapply your edits.",
  },
];

/** The route for a path, tolerating a missing trailing slash and `index.html`. */
export function routeFor(path: string): Route | undefined {
  const normalized = `${path.replace(/index\.html$/, "").replace(/\/+$/, "")}/`;
  return routes.find((route) => route.path === normalized);
}

/** The site path for a browser pathname under the base. */
export function pathFromLocation(pathname: string, base: string): string {
  return pathname.startsWith(base) ? `/${pathname.slice(base.length)}` : pathname;
}

/** A site path as an href under the base, for links. */
export function href(path: string): string {
  return `${import.meta.env.BASE_URL.replace(/\/$/, "")}${path}`;
}
