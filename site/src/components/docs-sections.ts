import type { SidebarSection } from "@/registry/ouro/components/ouro/sidebar/sidebar";
import { siteGroups } from "../../../scripts/catalog-groups.mts";
import { docsItems } from "../docs/items";
import pageIndex from "../docs/page-index.json";
import { href } from "../paths";

// The docs' pages in sections, without the Sidebar: the sidebar island and the header's menu (voyage/site-menu.tsx) both read them.

/** The pages that get you started, first in the sidebar. */
export const startPages = [
  { href: "/docs/", label: "Overview" },
  { href: "/docs/installing/", label: "Installing" },
  { href: "/docs/switching-from-shadcn/", label: "Switching from shadcn" },
  { href: "/docs/updating/", label: "Updating installed components" },
];

const exportPages = pageIndex.filter((page) => page.kind === "export");
const guidePages = pageIndex.filter((page) => page.kind === "guide" && page.name !== "installing");
/** The skill comparisons fold under one item, so the guides stay short. */
const isComparison = (name: string) => name.startsWith("why-no-skill-");

/** A docs page title for matching: "TextField" is found by "text field" too. */
const searchable = (text: string) => text.toLowerCase().replace(/[^a-z0-9]/g, "");

/** A docs page: its site path (no base) and its name. */
export interface DocsLink {
  path: string;
  label: string;
}

/**
 * Each catalog group's components, by name. With a filter, only the components whose name matches remain. With
 * `exports`, each group's helpers, hooks and parts follow its components (`Radio` after the forms, `useTimer` in Feedback).
 */
export function componentGroups(filter = "", exports = false): Array<{ label: string; links: DocsLink[] }> {
  const wanted = searchable(filter);
  const matches = (...texts: string[]) => wanted === "" || searchable(texts.join(" ")).includes(wanted);
  return siteGroups
    .map((group) => ({
      label: group,
      links: [
        ...docsItems.filter((item) => item.group === group && matches(item.title, item.name)).map((item) => ({ path: `/docs/${item.name}/`, label: item.title })),
        ...(exports ? exportPages.filter((page) => page.group === group && matches(page.title, page.name)).map((page) => ({ path: `/docs/${page.name}/`, label: page.title })) : []),
      ],
    }))
    .filter((group) => group.links.length > 0);
}

/** The pages for the helpers and hooks a component exports (`canShare`, `useTimer`), named as code names them. */
export const helpers: DocsLink[] = pageIndex.filter((page) => page.kind === "export").map((page) => ({ path: `/docs/${page.name}/`, label: page.title }));
/** The guides, and the skill comparisons that fold under one heading after them. */
export const guides: DocsLink[] = guidePages.filter((page) => !isComparison(page.name)).map((page) => ({ path: `/docs/${page.name}/`, label: page.title }));
/** The guides named as their code is (`ax-checks`, `ax-cli`): each part of the ax package, which the menu folds under one heading. */
export const isAxPart = ({ path, label }: DocsLink): boolean => path === `/docs/${label}/` && label.startsWith("ax-");
export const comparisons: DocsLink[] = guidePages
  .filter((page) => isComparison(page.name))
  .map((page) => ({ path: `/docs/${page.name}/`, label: page.title.replace("Comparison results: ", "") }));
/** A platform page's label: a product page's part from "for" ("For Apple"), so a platform's name only ever follows "for"; the section's index is its Overview, and the guide keeps its title. */
const platformLabel = (page: { name: string; title: string }) => {
  if (page.name === "platforms") return "Overview";
  const at = page.title.startsWith("Ouro ") ? page.title.indexOf(" for ") : -1;
  return at === -1 ? page.title : `For ${page.title.slice(at + " for ".length)}`;
};
/** The Platforms section's pages (docs/platforms), in the order `pnpm run docs` lists them. */
export const platforms: DocsLink[] = pageIndex.filter((page) => page.kind === "platform").map((page) => ({ path: `/docs/${page.name}/`, label: platformLabel(page) }));

/**
 * The docs sidebar's sections: Start, then each catalog group's components under its own
 * label, then the guides, then the platforms. With a filter, only the components whose name matches remain.
 */
export function docsSections(filter = ""): SidebarSection[] {
  const link = ({ path, label }: DocsLink) => ({ href: href(path), label });
  const groups = componentGroups(filter).map((group) => ({ label: group.label, items: group.links.map(link) }));
  if (searchable(filter) !== "") return groups;
  return [
    { label: "Start", items: startPages.map((page) => link({ path: page.href, label: page.label })) },
    ...groups,
    { label: "Guides", items: [...guides.map(link), { label: "Skill comparisons", items: comparisons.map(link) }] },
    { label: "Platforms", items: platforms.map(link) },
  ];
}
