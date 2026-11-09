import { GITHUB, href } from "./paths";

/** The site's own links at the foot of every page, the voyage's and the docs' alike: one list, one place for each. */
export const FOOTER_LINKS: readonly { label: string; url: string }[] = [
  { label: "Install", url: href("/docs/installing/") },
  { label: "Ouro HX", url: href("/docs/") },
  { label: "Ouro AX", url: href("/ax/") },
  { label: "Storybook", url: "https://ui.ouroboros.bot/storybook/" },
  { label: "Ouro UI on GitHub", url: GITHUB },
  { label: "llms.txt", url: href("/llms.txt") },
];
