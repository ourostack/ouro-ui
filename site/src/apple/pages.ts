/**
 * The Ouro UI for Apple pages, in reading order, without the section's styles: its own menu (shell.tsx) and the
 * site header's menu (voyage/site-menu.tsx) both list them, so a page added here shows in both.
 */
export const APPLE_PAGES = [
  { path: "/apple/", label: "Overview", short: "Overview" },
  { path: "/apple/hx/", label: "Ouro HX for Apple", short: "HX" },
  { path: "/apple/ax/", label: "Ouro AX for Apple", short: "AX" },
  { path: "/apple/start/", label: "Get started", short: "Get started" },
] as const;

export type ApplePath = (typeof APPLE_PAGES)[number]["path"];
