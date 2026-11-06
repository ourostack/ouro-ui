/**
 * Paths without the route table: the client entry and the voyage page import these, so neither
 * pulls the docs' generated Markdown (routes.ts) into its JavaScript.
 */

/** The Ouro UI for Apple pages, in the order their own menu lists them. */
export const APPLE_PATHS = ["/apple/", "/apple/hx/", "/apple/ax/", "/apple/start/"] as const;

/**
 * The same pages with their names, for the section's own menu (apple/shell.tsx) and the site header's menu
 * (voyage/site-menu.tsx). Here rather than in apple/, so the header loads no part of the Apple pages' islands.
 */
export const APPLE_PAGES = [
  { path: "/apple/", label: "Overview", short: "Overview" },
  { path: "/apple/hx/", label: "Ouro HX for Apple", short: "HX" },
  { path: "/apple/ax/", label: "Ouro AX for Apple", short: "AX" },
  { path: "/apple/start/", label: "Get started", short: "Get started" },
] as const satisfies ReadonlyArray<{ path: (typeof APPLE_PATHS)[number]; label: string; short: string }>;

export type ApplePath = (typeof APPLE_PAGES)[number]["path"];

/**
 * The page module that renders a path: each has its own JavaScript closure (app.tsx). The voyage
 * module renders the home page and the Nautilus's page.
 */
export type PageKind = "voyage" | "docs";

/** The paths the voyage module renders: the home page, the Nautilus's, Ouro AX's and the Ouro UI for Apple pages. */
export const VOYAGE_PATHS = ["/", "/nautilus/", "/ax/", ...APPLE_PATHS] as const;

/** A site path with a trailing slash and no `index.html`. */
export function normalizePath(path: string): string {
  return `${path.replace(/index\.html$/, "").replace(/\/+$/, "")}/`;
}

/** Which page module renders a path. Every docs page and the 404 page are the docs module's. */
export function pageKind(path: string): PageKind {
  const normalized = normalizePath(path);
  return (VOYAGE_PATHS as readonly string[]).includes(normalized) ? "voyage" : "docs";
}

/** The site path for a browser pathname under the base. */
export function pathFromLocation(pathname: string, base: string): string {
  return pathname.startsWith(base) ? `/${pathname.slice(base.length)}` : pathname;
}

/** A site path as an href under the base, for links. */
export function href(path: string): string {
  return `${import.meta.env.BASE_URL.replace(/\/$/, "")}${path}`;
}

/** The repository. */
export const GITHUB = "https://github.com/ourostack/ouro-ui";
